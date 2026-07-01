'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import AdminLayout from '@/components/AdminLayout';
import api from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import PageHeader from '@/components/ui/PageHeader';

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
}

const getTemplateIcon = (code: string) => {
  const map: Record<string, string> = { IPAD: '📱', GENERIC_ONE: '👤', GENERIC_MULTI: '👥' };
  return map[code] || '📄';
};

const getFieldTypeLabel = (type: string) => {
  const map: Record<string, string> = {
    string: 'Строка', text: 'Текст', email: 'Email',
    date: 'Дата', boolean: 'Да/нет', integer: 'Целое', number: 'Число',
  };
  return map[type] || type;
};

export default function TemplatesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && user.role !== 'ADMIN') {
      router.push('/guest');
    }
  }, [user, router]);

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      fetchTemplates();
    }
  }, [user]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/templates');
      setTemplates(res.data || []);
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Ошибка загрузки шаблонов', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (template: Template) => {
    try {
      await api.patch(`/api/templates/${template.id}`, { is_active: !template.is_active });
      await fetchTemplates();
      showToast(template.is_active ? 'Шаблон отключён' : 'Шаблон включён', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Ошибка', 'error');
    }
  };

  if (!user || user.role !== 'ADMIN') return null;

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto">
        <PageHeader
          eyebrow="Администрирование"
          title="Шаблоны актов"
          description="Управляйте активностью шаблонов для выдачи и возврата техники."
        />

        {loading ? (
          <div className="rounded-2xl bg-white p-12 text-center shadow-sm ring-1 ring-gray-100">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
            <p className="text-sm text-slate-500">Загрузка шаблонов...</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {templates.map((t) => (
              <div
                key={t.id}
                className="group rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-gray-300 hover:shadow-md"
              >
                <div className="mb-4 flex items-start gap-4">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-3xl ring-1 ring-gray-100">
                    {getTemplateIcon(t.code)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-800 truncate">{t.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{t.code}</p>
                    {t.description && (
                      <p className="mt-1 text-sm text-slate-600 line-clamp-2">{t.description}</p>
                    )}
                  </div>
                </div>

                {(t.schema_json?.fields?.length ?? 0) > 0 && (
                  <details className="mb-4">
                    <summary className="cursor-pointer text-sm font-medium text-slate-600 hover:text-slate-800">
                      Поля ({t.schema_json!.fields!.length})
                    </summary>
                    <div className="mt-2 space-y-1.5">
                      {t.schema_json!.fields!.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
                          <span className="font-medium text-slate-700">{f.label}</span>
                          <span className="text-slate-400">{getFieldTypeLabel(f.type)}</span>
                          {f.required && (
                            <span className="ml-auto rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                              обяз.
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                  <span className={`text-xs font-medium ${t.is_active ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {t.is_active ? 'Активен' : 'Отключён'}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleToggleActive(t)}
                    className={`relative h-6 w-11 rounded-full transition ${
                      t.is_active ? 'bg-emerald-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                        t.is_active ? 'left-[22px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
