'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Layout from '@/components/Layout';
import api from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

interface TemplateField {
  name: string;
  type: string;
  label: string;
  required: boolean;
}

interface Template {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  schema_json: {
    fields?: TemplateField[];
  };
  is_active: boolean;
  created_at: string;
}

interface TemplateFormState {
  code: string;
  name: string;
  description: string;
  fields: TemplateField[];
}

const defaultFields: TemplateField[] = [
  { name: 'party1_name', type: 'string', label: 'Передающая сторона', required: true },
  { name: 'party2_name', type: 'string', label: 'Получающая сторона', required: true },
  { name: 'issue_date', type: 'date', label: 'Дата выдачи', required: true },
  { name: 'item_name', type: 'string', label: 'Наименование техники', required: true },
  { name: 'item_serial', type: 'string', label: 'Серийный номер', required: false },
  { name: 'receiver_email', type: 'email', label: 'Email получателя', required: true },
];

const fieldTypeOptions = [
  { value: 'string', label: 'Строка' },
  { value: 'text', label: 'Текст' },
  { value: 'email', label: 'Email' },
  { value: 'date', label: 'Дата' },
  { value: 'boolean', label: 'Булево' },
  { value: 'integer', label: 'Целое число' },
  { value: 'number', label: 'Число' },
];

export default function TemplatesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { showToast } = useToast();
  const [fieldErrors, setFieldErrors] = useState<Record<number, { name?: string; label?: string }>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateFormState>({
    code: '',
    name: '',
    description: '',
    fields: defaultFields,
  });

  useEffect(() => {
    if (user && user.role !== 'ADMIN') {
      router.push('/');
    }
  }, [user, router]);

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      fetchTemplates();
    }
  }, [user]);

  const fetchTemplates = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/templates');
      setTemplates(res.data || []);
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Ошибка загрузки шаблонов';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setFieldErrors({});
    setForm({
      code: '',
      name: '',
      description: '',
      fields: defaultFields,
    });
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const updateField = (index: number, patch: Partial<TemplateField>) => {
    setForm((prev) => ({
      ...prev,
      fields: prev.fields.map((field, i) => (i === index ? { ...field, ...patch } : field)),
    }));
  };

  const removeField = (index: number) => {
    setForm((prev) => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== index),
    }));
  };

  const addField = () => {
    setForm((prev) => ({
      ...prev,
      fields: [
        ...prev.fields,
        {
          name: '',
          type: 'string',
          label: '',
          required: false,
        },
      ],
    }));
  };

  const handleEdit = (template: Template) => {
    setEditingId(template.id);
    setForm({
      code: template.code,
      name: template.name,
      description: template.description || '',
      fields: template.schema_json?.fields || [],
    });
  };

  const handleToggleActive = async (template: Template) => {
    try {
      await api.patch(`/api/templates/${template.id}`, {
        is_active: !template.is_active,
      });
      await fetchTemplates();
      showToast(template.is_active ? 'Шаблон деактивирован' : 'Шаблон активирован', 'success');
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Ошибка обновления шаблона';
      setError(msg);
      showToast(msg, 'error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setFieldErrors({});

    try {
      const normalizedFields = form.fields.map((field) => ({
        name: field.name.trim(),
        type: field.type,
        label: field.label.trim(),
        required: Boolean(field.required),
      }));

      const nextFieldErrors: Record<number, { name?: string; label?: string }> = {};
      normalizedFields.forEach((field, idx) => {
        const itemErrors: { name?: string; label?: string } = {};
        if (!field.name) itemErrors.name = 'Укажите name';
        if (!field.label) itemErrors.label = 'Укажите label';
        if (itemErrors.name || itemErrors.label) nextFieldErrors[idx] = itemErrors;
      });

      if (Object.keys(nextFieldErrors).length > 0) {
        setFieldErrors(nextFieldErrors);
        setError('У каждого поля шаблона должны быть заполнены name и label');
        showToast('Проверьте заполнение полей шаблона', 'error');
        setSaving(false);
        return;
      }

      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        schema_json: { fields: normalizedFields },
      };

      if (editingId) {
        await api.patch(`/api/templates/${editingId}`, {
          name: payload.name,
          description: payload.description,
          schema_json: payload.schema_json,
        });
      } else {
        await api.post('/api/templates', payload);
      }

      resetForm();
      await fetchTemplates();
      showToast(editingId ? 'Шаблон обновлен' : 'Шаблон создан', 'success');
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Ошибка сохранения шаблона';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!user || user.role !== 'ADMIN') {
    return null;
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Шаблоны актов</h1>
        </div>

        {error && (
          <div className="mb-6 rounded border border-red-300 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded shadow bg-white overflow-hidden">
            <div className="border-b px-6 py-4">
              <h2 className="text-lg font-semibold">Список шаблонов</h2>
            </div>

            {loading ? (
              <div className="p-6 text-gray-600">Загрузка шаблонов...</div>
            ) : templates.length === 0 ? (
              <div className="p-6 text-gray-600">Шаблоны пока не созданы</div>
            ) : (
              <div className="divide-y">
                {templates.map((template) => (
                  <div key={template.id} className="px-6 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-3">
                          <h3 className="text-base font-semibold">{template.name}</h3>
                          <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                            {template.code}
                          </span>
                          <span
                            className={`rounded px-2 py-1 text-xs font-medium ${
                              template.is_active
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-200 text-gray-700'
                            }`}
                          >
                            {template.is_active ? 'Активен' : 'Неактивен'}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-gray-600">
                          {template.description || 'Описание не указано'}
                        </p>
                        <p className="mt-2 text-xs text-gray-500">
                          Полей: {template.schema_json?.fields?.length || 0}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(template)}
                          className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
                        >
                          Редактировать
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(template)}
                          className="rounded bg-gray-700 px-3 py-2 text-sm text-white hover:bg-gray-800"
                        >
                          {template.is_active ? 'Деактивировать' : 'Активировать'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded shadow bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold">
              {editingId ? 'Редактирование шаблона' : 'Создание шаблона'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="code" className="mb-2 block text-sm font-medium text-gray-700">
                  Код шаблона
                </label>
                <input
                  id="code"
                  name="code"
                  value={form.code}
                  onChange={handleChange}
                  disabled={Boolean(editingId)}
                  className="w-full rounded border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                  placeholder="GENERIC"
                  required
                />
              </div>

              <div>
                <label htmlFor="name" className="mb-2 block text-sm font-medium text-gray-700">
                  Название
                </label>
                <input
                  id="name"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                  placeholder="Общий акт приема-передачи"
                  required
                />
              </div>

              <div>
                <label htmlFor="description" className="mb-2 block text-sm font-medium text-gray-700">
                  Описание
                </label>
                <textarea
                  id="description"
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={3}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                  placeholder="Для каких сценариев используется этот шаблон"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700">Поля шаблона</label>
                  <button
                    type="button"
                    onClick={addField}
                    className="rounded bg-blue-100 px-3 py-1 text-sm text-blue-700 hover:bg-blue-200"
                  >
                    + Добавить поле
                  </button>
                </div>

                <div className="mb-3 rounded border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                  Предпросмотр формы: так поля будут отображаться при создании/редактировании акта.
                </div>

                <div className="mb-4 grid grid-cols-1 gap-2 rounded border border-gray-200 bg-gray-50 p-3">
                  {form.fields.map((field, idx) => (
                    <div key={`${field.name}-preview-${idx}`} className="text-xs text-gray-700">
                      • {field.label || '(без label)'}
                      <span className="ml-2 rounded bg-white px-2 py-0.5 text-[11px] text-gray-600">
                        {field.type}
                      </span>
                      {field.required && (
                        <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">
                          required
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  {form.fields.map((field, index) => (
                    <div key={`${field.name}-${index}`} className="rounded border border-gray-200 p-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <input
                          value={field.name}
                          onChange={(e) => updateField(index, { name: e.target.value })}
                          className={`w-full rounded border px-3 py-2 ${
                            fieldErrors[index]?.name ? 'border-red-400 bg-red-50' : 'border-gray-300'
                          }`}
                          placeholder="name (например imei)"
                          required
                        />

                        {fieldErrors[index]?.name && (
                          <p className="mt-1 text-xs text-red-600 md:col-span-2">{fieldErrors[index]?.name}</p>
                        )}

                        <input
                          value={field.label}
                          onChange={(e) => updateField(index, { label: e.target.value })}
                          className={`w-full rounded border px-3 py-2 ${
                            fieldErrors[index]?.label ? 'border-red-400 bg-red-50' : 'border-gray-300'
                          }`}
                          placeholder="label (например IMEI)"
                          required
                        />

                        {fieldErrors[index]?.label && (
                          <p className="mt-1 text-xs text-red-600 md:col-span-2">{fieldErrors[index]?.label}</p>
                        )}

                        <select
                          value={field.type}
                          onChange={(e) => updateField(index, { type: e.target.value })}
                          className="w-full rounded border border-gray-300 px-3 py-2"
                        >
                          {fieldTypeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>

                        <div className="flex items-center justify-between rounded border border-gray-300 px-3 py-2">
                          <label className="text-sm text-gray-700">Обязательное поле</label>
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(e) => updateField(index, { required: e.target.checked })}
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => removeField(index)}
                          className="rounded bg-red-100 px-3 py-1 text-sm text-red-700 hover:bg-red-200"
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {saving ? 'Сохранение...' : editingId ? 'Сохранить изменения' : 'Создать шаблон'}
                </button>

                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded bg-gray-200 px-4 py-2 text-gray-800 hover:bg-gray-300"
                  >
                    Отмена
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
}
