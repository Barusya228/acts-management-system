'use client';

import { useState } from 'react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import { useToast } from '@/contexts/ToastContext';
import PageHeader from '@/components/ui/PageHeader';
import SurfaceCard from '@/components/ui/SurfaceCard';
import ParticipantPicker from '@/components/ParticipantPicker';

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
    fields?: Array<{
      name: string;
      type: string;
      label: string;
      required: boolean;
    }>;
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

const reservedFields = new Set([
  'party1_name',
  'party2_name',
  'issue_date',
  'item_name',
  'item_serial',
  'receiver_email',
]);

export default function ActCreatePage() {
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [participants, setParticipants] = useState<ParticipantOption[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [party1ParticipantId, setParty1ParticipantId] = useState('');
  const [party2ParticipantId, setParty2ParticipantId] = useState('');
  const [extraData, setExtraData] = useState<Record<string, string>>({});
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

  const selectedTemplate = templates.find((template) => template.id === formData.template_id);
  const itManagers = participants.filter((participant) => participant.kind === 'IT_MANAGER');
  const employees = participants.filter((participant) => participant.kind === 'EMPLOYEE');
  const selectedEmployee = employees.find((participant) => participant.id === party2ParticipantId);
  const dynamicFields = (selectedTemplate?.schema_json?.fields || []).filter(
    (field) => !reservedFields.has(field.name)
  );

  useEffect(() => {
    fetchTemplates();
    fetchParticipants();
  }, []);

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
        const initialTemplateId = list[0].id;
        setFormData((prev) => ({
          ...prev,
          template_id: prev.template_id || initialTemplateId,
        }));

        const initialTemplate = list.find((item) => item.id === initialTemplateId);
        const initialDynamic = (initialTemplate?.schema_json?.fields || []).filter(
          (field) => !reservedFields.has(field.name)
        );
        const initialExtra: Record<string, string> = {};
        initialDynamic.forEach((field) => {
          initialExtra[field.name] = '';
        });
        setExtraData(initialExtra);
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
      const res = await api.post('/api/acts', {
        ...formData,
        issue_date: new Date(formData.issue_date).toISOString(),
        extra_data_json: extraData,
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (e.target.name === 'template_id') {
      const nextTemplateId = e.target.value;
      const template = templates.find((item) => item.id === nextTemplateId);
      const nextDynamic = (template?.schema_json?.fields || []).filter(
        (field) => !reservedFields.has(field.name)
      );
      const nextExtra: Record<string, string> = {};
      nextDynamic.forEach((field) => {
        nextExtra[field.name] = '';
      });
      setExtraData(nextExtra);
    }

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

  return (
    <Layout>
      <div className="mx-auto max-w-3xl">
        <PageHeader
          eyebrow="Создание"
          title="Новый акт"
          description="Заполните основные данные выдачи техники, выберите шаблон и добавьте нужные поля по структуре документа."
        />

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <SurfaceCard className="p-5 md:p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="mb-4">
            <label htmlFor="template_id" className="block text-sm font-medium text-gray-700 mb-2">
              Шаблон акта *
            </label>
            <select
              id="template_id"
              name="template_id"
              value={formData.template_id}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              disabled={loadingTemplates || templates.length === 0}
            >
              {templates.length === 0 ? (
                <option value="">Нет доступных шаблонов</option>
              ) : (
                templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} ({template.code})
                  </option>
                ))
              )}
            </select>
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

          <div className="mb-4">
            <ParticipantPicker
              label="Сторона 2 (Получающая)"
              placeholder="Найдите сотрудника по имени, отделу или email"
              value={party2ParticipantId}
              options={employees}
              onSelect={(participant) => {
                setParty2ParticipantId(participant.id);
                setFormData((prev) => ({
                  ...prev,
                  party2_name: participant.full_name,
                  receiver_email: participant.email || '',
                }));
              }}
              helperText="Email получателя заполнится автоматически, если он указан в карточке сотрудника."
            />
          </div>

          <div className="mb-4">
            <label htmlFor="issue_date" className="block text-sm font-medium text-gray-700 mb-2">
              Дата выдачи *
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
              Наименование техники *
            </label>
            <input
              type="text"
              id="item_name"
              name="item_name"
              value={formData.item_name}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              placeholder="Например: Ноутбук Lenovo ThinkPad"
            />
          </div>

          <div className="mb-4">
            <label htmlFor="item_serial" className="block text-sm font-medium text-gray-700 mb-2">
              Серийный номер *
            </label>
            <input
              type="text"
              id="item_serial"
              name="item_serial"
              value={formData.item_serial}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              placeholder="Например: SN123456789"
            />
          </div>

          <div className="mb-6">
            <label htmlFor="receiver_email" className="block text-sm font-medium text-gray-700 mb-2">
              Email получателя *
            </label>
            <input
              type="email"
              id="receiver_email"
              name="receiver_email"
              value={formData.receiver_email}
              onChange={handleChange}
              readOnly={Boolean(selectedEmployee?.email)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 read-only:bg-gray-100 read-only:text-gray-600"
              required
              placeholder={selectedEmployee?.email ? 'Email подставлен автоматически' : 'example@domain.com'}
            />
            <p className="mt-2 text-xs text-gray-500">
              {selectedEmployee?.email
                ? 'Почта подставлена автоматически из карточки получателя.'
                : 'Если у сотрудника в справочнике нет email, его можно указать вручную.'}
            </p>
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
