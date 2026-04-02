'use client';

import { use, useState, useEffect } from 'react';
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
  const [party2ParticipantId, setParty2ParticipantId] = useState('');
  const [extraData, setExtraData] = useState<Record<string, string>>({});
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
  const selectedEmployee = employees.find((participant) => participant.id === party2ParticipantId);
  const dynamicFields = (selectedTemplate?.schema_json?.fields || []).filter(
    (field) => !reservedFields.has(field.name)
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
      const matchedParty2 = participantsList.find((item) => item.kind === 'EMPLOYEE' && item.full_name === act.party2_name);
      setParty1ParticipantId(matchedParty1?.id || '');
      setParty2ParticipantId(matchedParty2?.id || '');

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

      const template = templateList.find((item) => item.id === act.template_id);
      const dynamicTemplateFields = (template?.schema_json?.fields || []).filter(
        (field) => !reservedFields.has(field.name)
      );
      const initialExtra: Record<string, string> = {};
      dynamicTemplateFields.forEach((field) => {
        initialExtra[field.name] = String(act.extra_data_json?.[field.name] ?? '');
      });
      setExtraData(initialExtra);
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
      await api.patch(`/api/acts/${id}`, {
        ...formData,
        issue_date: new Date(formData.issue_date).toISOString(),
        extra_data_json: extraData,
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
              helperText="Email получателя обновится автоматически из карточки выбранного сотрудника."
            />
          </div>

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
            <input
              type="text"
              id="item_name"
              name="item_name"
              value={formData.item_name}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
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

          <div className="mb-6">
            <label htmlFor="receiver_email" className="block text-sm font-medium text-gray-700 mb-2">
              Email получателя
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
            />
            <p className="mt-2 text-xs text-gray-500">
              {selectedEmployee?.email
                ? 'Почта подставлена автоматически из карточки выбранного сотрудника.'
                : 'Если у сотрудника нет email в справочнике, его можно изменить вручную.'}
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
