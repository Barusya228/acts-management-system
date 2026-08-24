'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import api from '@/lib/api';
import { apiErrorMessage } from '@/lib/apiError';
import { auditActionLabel, auditEntityLabel, auditEntityLabels } from '@/lib/auditLabels';

interface AuditEntry {
  id: string;
  actor: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

const PAGE_SIZE = 50;

export default function AdminAuditPage() {
  const { user, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [entityFilter, setEntityFilter] = useState('');

  useEffect(() => {
    if (!authLoading && !user) router.push('/login?next=/admin/audit');
    if (!authLoading && user && user.role !== 'ADMIN') router.push('/guest');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user?.role !== 'ADMIN') return;
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
    if (entityFilter) params.set('entity_type', entityFilter);
    api.get(`/api/admin/audit-log?${params.toString()}`)
      .then(response => {
        if (cancelled) return;
        setItems(Array.isArray(response.data?.items) ? response.data.items : []);
        setTotal(Number(response.data?.total || 0));
      })
      .catch((error: unknown) => {
        if (!cancelled) showToast(apiErrorMessage(error, 'Не удалось загрузить журнал'), 'error');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user, page, entityFilter, showToast]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (authLoading || !user || user.role !== 'ADMIN') return null;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900 md:text-2xl">Журнал действий</h1>
            <p className="mt-1 text-sm text-slate-500">Кто и что делал в системе: акты, подписи, устройства, письма.</p>
          </div>
          <select
            value={entityFilter}
            onChange={event => { setEntityFilter(event.target.value); setPage(1); }}
            className="min-h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm outline-none focus:border-blue-400"
          >
            <option value="">Все объекты</option>
            {Object.entries(auditEntityLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-white p-12 text-center text-sm text-slate-400 shadow-sm">Загрузка журнала...</div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <p className="font-black text-slate-700">Записей нет</p>
            <p className="mt-1 text-sm text-slate-400">По выбранному фильтру событий не найдено.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Когда</th>
                  <th className="px-4 py-3 font-semibold">Кто</th>
                  <th className="px-4 py-3 font-semibold">Действие</th>
                  <th className="px-4 py-3 font-semibold">Объект</th>
                  <th className="px-4 py-3 font-semibold">Детали</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {new Date(item.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="max-w-[180px] px-4 py-3">
                      <span className="block truncate font-bold text-slate-900">{item.actor || 'Система'}</span>
                    </td>
                    <td className="max-w-[240px] px-4 py-3">
                      <span className="block truncate text-slate-700">{auditActionLabel(item.action)}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{auditEntityLabel(item.entity_type)}</span>
                    </td>
                    <td className="max-w-[200px] px-4 py-3 xl:max-w-[280px]">
                      <span className="block truncate text-xs text-slate-500" title={JSON.stringify(item.metadata)}>
                        {Object.entries(item.metadata || {})
                          .filter(([, value]) => typeof value !== 'object')
                          .slice(0, 3)
                          .map(([key, value]) => `${key}: ${value}`)
                          .join(' · ') || '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(current => current - 1)}
              className="min-h-11 rounded-xl bg-white px-4 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-gray-200 disabled:opacity-40"
            >
              ← Назад
            </button>
            <span className="text-sm text-slate-500">Страница {page} из {totalPages} · всего {total}</span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(current => current + 1)}
              className="min-h-11 rounded-xl bg-white px-4 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-gray-200 disabled:opacity-40"
            >
              Вперёд →
            </button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
