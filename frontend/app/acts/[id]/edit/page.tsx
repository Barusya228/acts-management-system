'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import { useToast } from '@/contexts/ToastContext';
import PageHeader from '@/components/ui/PageHeader';
import SurfaceCard from '@/components/ui/SurfaceCard';
import ParticipantPicker from '@/components/ParticipantPicker';
import RecipientsEditor, { type EditableRecipient } from '@/components/RecipientsEditor';
import { buildParty2Summary, getPrimaryRecipientEmail, normalizeActRecipients } from '@/lib/actRecipients';

interface ActFormData {
  party1_name: string;
  party2_name: string;
  issue_date: string;
  item_name: string;
  item_serial: string;
  receiver_email: string;
  template_id: string;
  change_note: string;
}

interface TemplateField {
  name: string;
  type: string;
  label: string;
  required: boolean;
}

interface TemplateOption {
  id: string;
  code: string;
  name: string;
  schema_json?: {
    max_recipients?: number | null;
    fields?: TemplateField[];
  };
}

interface ParticipantOption {
  id: string;
  full_name: string;
  email?: string | null;
  department?: string | null;
  title?: string | null;
  kind: 'IT_MANAGER' | 'EMPLOYEE';
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

export default function ActEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [participants, setParticipants] = useState<ParticipantOption[]>([]);
  const [party1ParticipantId, setParty1ParticipantId] = useState('');
  const [extraData, setExtraData] = useState<Record<string, string>>({});
  const [equipmentItems, setEquipmentItems] = useState<EquipmentItem[]>([]);
  const [recipients, setRecipients] = useState<EditableRecipient[]>([{ full_name: '', email: '' }]);
  const [formData, setFormData] = useState<ActFormData>({
    party1_name: '',
    party2_name: '',
    issue_date: '',
    item_name: '',
    item_serial: '',
    receiver_email: '',
    template_id: '',
    change_note: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { showToast } = useToast();
  const router = useRouter();

  const selectedTemplate = templates.find((template) => template.id === formData.template_id);
  const itManagers = participants.filter((participant) => participant.kind === 'IT_MANAGER');
  const employees = participants.filter((participant) => participant.kind === 'EMPLOYEE');
  const dynamicFields = (selectedTemplate?.schema_json?.fields || []).filter(
    (field) => !reservedFields.has(field.name) && field.name !== 'imei'
  );

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      const [actRes, templatesRes, participantsRes] = await Promise.all([
        api.get(`/api/acts/${id}`),
        api.get('/api/templates?is_active=true'),
        api.get('/api/participants?is_active=true'),
      ]);

      const act = actRes.data;
      const templateList = Array.isArray(templatesRes.data) ? templatesRes.data : [];
      const participantsList = Array.isArray(participantsRes.data) ? participantsRes.data : [];
      setTemplates(templateList);
      setParticipants(participantsList);

      const matchedParty1 = participantsList.find((item) => item.kind === 'IT_MANAGER' && item.full_name === act.party1_name);
      setParty1ParticipantId(matchedParty1?.id || '');

      setFormData({
        party1_name: act.party1_name,
        party2_name: act.party2_name,
        issue_date: act.issue_date.split('T')[0],
        item_name: act.item_name,
        item_serial: act.item_serial,
        receiver_email: act.receiver_email,
        template_id: act.template_id,
        change_note: '',
      });

      setRecipients(
        normalizeActRecipients(act.extra_data_json, act.party2_name, act.receiver_email).map((recipient) => ({
          participant_id: recipient.participant_id,
          full_name: recipient.full_name,
          email: recipient.email,
        }))
      );

      const template = templateList.find((item) => item.id === act.template_id);
      const dynamicTemplateFields = (template?.schema_json?.fields || []).filter(
        (field: TemplateField) => !reservedFields.has(field.name) && field.name !== 'imei'
      );
      const initialExtra: Record<string, string> = {};
      dynamicTemplateFields.forEach((field: TemplateField) => {
        initialExtra[field.name] = String(act.extra_data_json?.[field.name] ?? '');
      });
      setExtraData(initialExtra);

      const equipmentListRaw = act.extra_data_json?.equipment_list;
      if (Array.isArray(equipmentListRaw)) {
        const parsed = equipmentListRaw
          .filter((item) => typeof item === 'object' && item !== null)
          .map((item) => ({
            name: String((item as { name?: unknown }).name ?? ''),
            serial: String((item as { serial?: unknown }).serial ?? ''),
            imei: String((item as { imei?: unknown }).imei ?? ''),
          }));
        setEquipmentItems(parsed);
      } else {
        setEquipmentItems([]);
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Ошибка загрузки акта';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
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

      await api.patch(`/api/acts/${id}`, {
        ...formData,
        party2_name: buildParty2Summary(normalizedRecipients),
        receiver_email: getPrimaryRecipientEmail(normalizedRecipients),
        issue_date: new Date(formData.issue_date).toISOString(),
        extra_data_json: payloadExtraData,
      });
      showToast('Изменения сохранены, версия обновлена', 'success');
      router.push(`/acts/${id}`);
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Ошибка сохранения акта';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
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

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-10">Загрузка...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto max-w-3xl">
        <PageHeader
          eyebrow="Редактирование"
          title="Изменение акта"
          description="Обновите данные документа. Каждое сохранение создает новую версию и фиксирует историю изменений."
        />

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <SurfaceCard className="p-5 md:p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
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
              helperText="Выбранный IT-менеджер используется как сторона 1 для этого акта."
            />
          </div>

          <RecipientsEditor 
            recipients={recipients} 
            employees={employees} 
            onChange={setRecipients}
            maxRecipients={selectedTemplate?.schema_json?.max_recipients}
          />

          <div className="mb-4">
            <label htmlFor="issue_date" className="block text-sm font-medium text-gray-700 mb-2">
              Дата выдачи
            </label>
            <input
              type="date"
              id="issue_date"
              name="issue_date"
              value={formData.issue_date}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="mb-4">
            <label htmlFor="item_name" className="block text-sm font-medium text-gray-700 mb-2">
              Наименование техники
            </label>
            {selectedTemplate?.schema_json?.max_recipients === 1 ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  id="item_name"
                  name="item_name"
                  value={formData.item_name}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      handleChange({ target: { name: 'item_name', value: e.target.value } } as any);
                    }
                  }}
                  className="rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            )}
          </div>

          <div className="mb-4">
            <label htmlFor="item_serial" className="block text-sm font-medium text-gray-700 mb-2">
              Серийный номер
            </label>
            <input
              type="text"
              id="item_serial"
              name="item_serial"
              value={formData.item_serial}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="mb-6 rounded-md border border-gray-200 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-800">Оборудование (доп. позиции)</h2>
                <p className="text-xs text-gray-500">
                  Основная позиция берется из полей выше. Здесь можно добавить еще несколько позиций для PDF v2.
                </p>
              </div>
              <button
                type="button"
                onClick={addEquipmentItem}
                className="rounded bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-800"
              >
                Добавить позицию
              </button>
            </div>

            {equipmentItems.length === 0 ? (
              <p className="text-sm text-gray-500">Дополнительных позиций пока нет.</p>
            ) : (
              <div className="space-y-3">
                {equipmentItems.map((item, index) => (
                  <div key={index} className="grid grid-cols-1 gap-3 rounded border border-gray-200 p-3" style={{ gridTemplateColumns: selectedTemplate?.code === 'IPAD' ? '1fr 1fr 1fr auto' : '1fr 1fr auto' }}>
                    {selectedTemplate?.schema_json?.max_recipients === 1 ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => updateEquipmentItem(index, { name: e.target.value })}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Наименование"
                        />
                        <select
                          onChange={(e) => {
                            if (e.target.value) {
                              updateEquipmentItem(index, { name: e.target.value });
                            }
                          }}
                          className="rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                        className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Наименование"
                      />
                    )}
                    <input
                      type="text"
                      value={item.serial}
                      onChange={(e) => updateEquipmentItem(index, { serial: e.target.value })}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Серийный номер"
                    />
                    {selectedTemplate?.code === 'IPAD' && (
                      <input
                        type="text"
                        value={item.imei || ''}
                        onChange={(e) => updateEquipmentItem(index, { imei: e.target.value })}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="IMEI"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => removeEquipmentItem(index)}
                      className="rounded bg-rose-600 px-3 py-2 text-sm text-white hover:bg-rose-700"
                    >
                      Удалить
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Контактный email</label>
            <input
              type="email"
              value={getPrimaryRecipientEmail(recipients)}
              readOnly
              className="w-full rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-gray-600 focus:outline-none"
            />
            <p className="mt-2 text-xs text-gray-500">
              Основной email акта автоматически берется из первого получателя в списке.
            </p>
          </div>

          <div className="mb-6">
            <label htmlFor="change_note" className="block text-sm font-medium text-gray-700 mb-2">
              Комментарий к изменению версии
            </label>
            <input
              type="text"
              id="change_note"
              name="change_note"
              value={formData.change_note}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Например: Обновили серийный номер"
            />
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
              disabled={saving}
              className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {saving ? 'Сохранение...' : 'Сохранить'}
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
