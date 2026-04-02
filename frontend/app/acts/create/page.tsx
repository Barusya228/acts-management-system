'use client';

import { useState } from 'react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import { useToast } from '@/contexts/ToastContext';

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
  const [loadingTemplates, setLoadingTemplates] = useState(true);
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
  const dynamicFields = (selectedTemplate?.schema_json?.fields || []).filter(
    (field) => !reservedFields.has(field.name)
  );

  useEffect(() => {
    fetchTemplates();
  }, []);

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
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Создание нового акта</h1>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded shadow p-6">
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
            <label htmlFor="party1_name" className="block text-sm font-medium text-gray-700 mb-2">
              Сторона 1 (Передающая) *
            </label>
            <input
              type="text"
              id="party1_name"
              name="party1_name"
              value={formData.party1_name}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              placeholder="Например: ООО 'Компания'"
            />
          </div>

          <div className="mb-4">
            <label htmlFor="party2_name" className="block text-sm font-medium text-gray-700 mb-2">
              Сторона 2 (Получающая) *
            </label>
            <input
              type="text"
              id="party2_name"
              name="party2_name"
              value={formData.party2_name}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              placeholder="Например: Иванов Иван Иванович"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              placeholder="example@domain.com"
            />
          </div>

          {dynamicFields.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-3 text-base font-semibold text-gray-800">Поля по шаблону</h2>
              <div className="grid grid-cols-1 gap-4">
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
      </div>
    </Layout>
  );
}
