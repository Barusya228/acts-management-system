'use client';

import { Suspense, useState } from 'react';
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import { useToast } from '@/contexts/ToastContext';
import PageHeader from '@/components/ui/PageHeader';
import SurfaceCard from '@/components/ui/SurfaceCard';
import ParticipantPicker from '@/components/ParticipantPicker';
import RecipientsEditor, { type EditableRecipient } from '@/components/RecipientsEditor';
import { buildParty2Summary, getPrimaryRecipientEmail } from '@/lib/actRecipients';

interface ActFormData {
  party1_name: string;
  party2_name: string;
  issue_date: string;
  item_name: string;
  item_serial: string;
  receiver_email: string;
  template_id: string;
}

interface TemplateOption {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  schema_json?: {
    max_recipients?: number | null;
    fields?: TemplateField[];
  };
}

interface TemplateField {
  name: string;
  type: string;
  label: string;
  required: boolean;
}

interface ParticipantOption {
  id: string;
  full_name: string;
  email?: string | null;
  department?: string | null;
  title?: string | null;
  kind: 'IT_MANAGER' | 'EMPLOYEE' | 'BOTH';
}

interface EquipmentItem {
  name: string;
  serial: string;
  imei?: string;
}

const reservedFields = new Set([
  'party1_name',
  'party2_name',
  'issue_date',
  'item_name',
  'item_serial',
  'receiver_email',
]);

function ActCreatePageContent() {
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [participants, setParticipants] = useState<ParticipantOption[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [party1ParticipantId, setParty1ParticipantId] = useState('');
  const [extraData, setExtraData] = useState<Record<string, string>>({});
  const [equipmentItems, setEquipmentItems] = useState<EquipmentItem[]>([]);
  const [recipients, setRecipients] = useState<EditableRecipient[]>([{ full_name: '', email: '' }]);
  const [formData, setFormData] = useState<ActFormData>({
    party1_name: '',
    party2_name: '',
    issue_date: new Date().toISOString().split('T')[0],
    item_name: '',
    item_serial: '',
    receiver_email: '',
    template_id: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedTemplateId = searchParams.get('template_id') || '';

  const selectedTemplate = templates.find((template) => template.id === formData.template_id);
  const itManagers = participants.filter((participant) => participant.kind === 'IT_MANAGER' || participant.kind === 'BOTH');
  const employees = participants.filter((participant) => participant.kind === 'EMPLOYEE' || participant.kind === 'BOTH');
  const dynamicFields = (selectedTemplate?.schema_json?.fields || []).filter(
    (field) => !reservedFields.has(field.name) && field.name !== 'imei'
  );

  useEffect(() => {
    fetchTemplates();
    fetchParticipants();
  }, [preselectedTemplateId]);

  const fetchParticipants = async () => {
    try {
      const res = await api.get('/api/participants?is_active=true');
      setParticipants(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Ошибка загрузки участников', 'error');
    }
  };

  const fetchTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const res = await api.get('/api/templates?is_active=true');
      const list = Array.isArray(res.data) ? res.data : [];
      setTemplates(list);
      if (list.length > 0) {
        const hasPreselectedTemplate = preselectedTemplateId
          ? list.some((template) => template.id === preselectedTemplateId)
          : false;
        const initialTemplateId = hasPreselectedTemplate ? preselectedTemplateId : list[0].id;

        setFormData((prev) => ({
          ...prev,
          template_id: initialTemplateId,
        }));

        const initialTemplate = list.find((item) => item.id === initialTemplateId);
        const initialDynamic = (initialTemplate?.schema_json?.fields || []).filter(
          (field: TemplateField) => !reservedFields.has(field.name) && field.name !== 'imei'
        );
        const initialExtra: Record<string, string> = {};
        initialDynamic.forEach((field: TemplateField) => {
          initialExtra[field.name] = '';
        });
        setExtraData(initialExtra);
      } else {
        setFormData((prev) => ({
          ...prev,
          template_id: '',
        }));
        setExtraData({});
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Ошибка загрузки шаблонов';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const normalizedRecipients = recipients
        .map((recipient) => ({
          participant_id: recipient.participant_id,
          full_name: recipient.full_name.trim(),
          email: recipient.email.trim(),
        }))
        .filter((recipient) => recipient.full_name && recipient.email);

      if (normalizedRecipients.length === 0) {
        throw new Error('Добавьте хотя бы одного получателя с ФИО и email');
      }

      const normalizedEquipment = equipmentItems
        .map((item) => ({
          name: item.name.trim(),
          serial: item.serial.trim(),
          imei: item.imei?.trim() || '',
        }))
        .filter((item) => item.name || item.serial);

      const payloadExtraData: Record<string, unknown> = { ...extraData };
      payloadExtraData.recipients = normalizedRecipients;
      if (normalizedEquipment.length > 0) {
        payloadExtraData.equipment_list = normalizedEquipment;
      }

      const res = await api.post('/api/acts', {
        ...formData,
        party2_name: buildParty2Summary(normalizedRecipients),
        receiver_email: getPrimaryRecipientEmail(normalizedRecipients),
        issue_date: new Date(formData.issue_date).toISOString(),
        extra_data_json: payloadExtraData,
      });
      showToast('Акт успешно создан', 'success');
      router.push(`/acts/${res.data.id}`);
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Ошибка создания акта';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleExtraFieldChange = (name: string, value: string) => {
    setExtraData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const addEquipmentItem = () => {
    setEquipmentItems((prev) => [...prev, { name: '', serial: '', imei: '' }]);
  };

  const updateEquipmentItem = (index: number, patch: Partial<EquipmentItem>) => {
    setEquipmentItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const removeEquipmentItem = (index: number) => {
    setEquipmentItems((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <Layout>
      <div className="mx-auto max-w-3xl">
        <PageHeader
          eyebrow="Создание"
          title="Новый акт"
          description="Заполните основные данные выдачи техники. Шаблон выбран заранее на странице списка актов."
        />

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <SurfaceCard className="p-5 md:p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
            <span className="font-medium text-gray-900">Шаблон акта:</span>{' '}
            {selectedTemplate ? `${selectedTemplate.name} (${selectedTemplate.code})` : 'не выбран'}
          </div>

          <div className="mb-4">
            <ParticipantPicker
              label="Сторона 1 (IT / Передающая)"
              placeholder="Найдите IT-менеджера по имени, отделу или email"
              value={party1ParticipantId}
              options={itManagers}
              onSelect={(participant) => {
                setParty1ParticipantId(participant.id);
                setFormData((prev) => ({
                  ...prev,
                  party1_name: participant.full_name,
                }));
              }}
              helperText="Выбранный IT-менеджер будет подставлен как сторона 1 во все данные акта."
            />
          </div>

          <RecipientsEditor 
            recipients={recipients} 
            employees={employees} 
            onChange={setRecipients}
            maxRecipients={selectedTemplate?.schema_json?.max_recipients}
          />

          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="issue_date" className="mb-2 block text-sm font-medium text-gray-700">
                Дата выдачи *
              </label>
              <input
                type="date"
                id="issue_date"
                name="issue_date"
                value={formData.issue_date}
                onChange={handleChange}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Контактный email</label>
              <input
                type="email"
                value={getPrimaryRecipientEmail(recipients)}
                readOnly
                className="w-full rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-gray-600 focus:outline-none"
                placeholder="Будет взят из первого получателя"
              />
              <p className="mt-1 text-xs text-gray-500">
                Для совместимости основной email акта берется из первого получателя в списке.
              </p>
            </div>
          </div>

          <div className="mb-6 rounded-md border border-gray-200 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-gray-800">Оборудование</h2>
              <button
                type="button"
                onClick={addEquipmentItem}
                className="rounded bg-slate-700 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
              >
                Добавить устройство
              </button>
            </div>

            <div className="hidden grid-cols-[1fr_1fr_auto] gap-2 border-b border-gray-200 pb-1 text-xs font-medium uppercase tracking-wide text-gray-500 md:grid" style={{ gridTemplateColumns: selectedTemplate?.code === 'IPAD' ? '1fr 1fr 1fr auto' : '1fr 1fr auto' }}>
              <span>Наименование</span>
              <span>Серийный номер</span>
              {selectedTemplate?.code === 'IPAD' && <span>IMEI</span>}
              <span className="text-right">Действие</span>
            </div>

            <div className="mt-2 grid grid-cols-1 gap-2 md:items-center" style={{ gridTemplateColumns: selectedTemplate?.code === 'IPAD' ? '1fr 1fr 1fr auto' : '1fr 1fr auto' }}>
              {selectedTemplate?.schema_json?.max_recipients === 1 ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    id="item_name"
                    name="item_name"
                    value={formData.item_name}
                    onChange={handleChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                    placeholder="Наименование техники *"
                  />
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        handleChange({ target: { name: 'item_name', value: e.target.value } } as any);
                      }
                    }}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    defaultValue=""
                  >
                    <option value="">Выбрать</option>
                    <option value="Asus Tuf">Asus Tuf</option>
                    <option value="Lenovo Legion">Lenovo Legion</option>
                    <option value="Mac book">Mac book</option>
                    <option value="Удлинитель Smart">Удлинитель Smart</option>
                  </select>
                </div>
              ) : (
                <input
                  type="text"
                  id="item_name"
                  name="item_name"
                  value={formData.item_name}
                  onChange={handleChange}
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  placeholder="Наименование техники *"
                />
              )}
              <input
                type="text"
                id="item_serial"
                name="item_serial"
                value={formData.item_serial}
                onChange={handleChange}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                placeholder="Серийный номер *"
              />
              {selectedTemplate?.code === 'IPAD' && (
                <input
                  type="text"
                  value={extraData['imei'] || ''}
                  onChange={(e) => handleExtraFieldChange('imei', e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  placeholder="IMEI *"
                />
              )}
              <span className="inline-flex h-[34px] items-center justify-center rounded bg-slate-100 px-3 text-xs font-medium text-slate-700">
                Основное
              </span>
            </div>

            {equipmentItems.map((item, index) => (
              <div key={index} className="mt-2 grid grid-cols-1 gap-2 md:items-center" style={{ gridTemplateColumns: selectedTemplate?.code === 'IPAD' ? '1fr 1fr 1fr auto' : '1fr 1fr auto' }}>
                {selectedTemplate?.schema_json?.max_recipients === 1 ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => updateEquipmentItem(index, { name: e.target.value })}
                      className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Наименование"
                    />
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          updateEquipmentItem(index, { name: e.target.value });
                        }
                      }}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      defaultValue=""
                    >
                      <option value="">Выбрать</option>
                      <option value="Asus Tuf">Asus Tuf</option>
                      <option value="Lenovo Legion">Lenovo Legion</option>
                      <option value="Mac book">Mac book</option>
                      <option value="Удлинитель Smart">Удлинитель Smart</option>
                    </select>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => updateEquipmentItem(index, { name: e.target.value })}
                    className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Наименование"
                  />
                )}
                <input
                  type="text"
                  value={item.serial}
                  onChange={(e) => updateEquipmentItem(index, { serial: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Серийный номер"
                />
                {selectedTemplate?.code === 'IPAD' && (
                  <input
                    type="text"
                    value={item.imei || ''}
                    onChange={(e) => updateEquipmentItem(index, { imei: e.target.value })}
                    className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="IMEI"
                  />
                )}
                <button
                  type="button"
                  onClick={() => removeEquipmentItem(index)}
                  className="rounded bg-rose-600 px-3 py-1.5 text-sm text-white hover:bg-rose-700"
                >
                  Удалить
                </button>
              </div>
            ))}

            {equipmentItems.length === 0 && (
              <p className="mt-2 text-xs text-gray-500">Дополнительных позиций пока нет.</p>
            )}
          </div>

          {dynamicFields.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-3 text-base font-semibold text-gray-800">Поля по шаблону</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {dynamicFields.map((field) => (
                  <div key={field.name}>
                    <label htmlFor={field.name} className="block text-sm font-medium text-gray-700 mb-2">
                      {field.label}
                      {field.required ? ' *' : ''}
                    </label>
                    <input
                      type={field.type === 'email' ? 'email' : field.type === 'date' ? 'date' : 'text'}
                      id={field.name}
                      value={extraData[field.name] || ''}
                      onChange={(e) => handleExtraFieldChange(field.name, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required={field.required}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={saving || loadingTemplates || templates.length === 0}
              className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {saving ? 'Создание...' : 'Создать акт'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="bg-gray-600 text-white px-6 py-2 rounded hover:bg-gray-700"
            >
              Отмена
            </button>
          </div>
        </form>
        </SurfaceCard>
      </div>
    </Layout>
  );
}

export default function ActCreatePage() {
  return (
    <Suspense fallback={<Layout><div className="mx-auto max-w-3xl py-10 text-center">Загрузка...</div></Layout>}>
      <ActCreatePageContent />
    </Suspense>
  );
}
