'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import ManualFinalEmail from '@/components/ManualFinalEmail';
import StatusPill from '@/components/ui/StatusPill';
import { getActStatusLabel, isPendingStatus, isReturnStatus } from '@/lib/actStatus';
import { useToast } from '@/contexts/ToastContext';

interface Act {
  id: string;
  party1_name: string;
  party2_name: string;
  item_name: string;
  issue_date: string;
  status: string;
  template_code?: string | null;
  advisory_group?: string | null;
  student_count?: number | null;
  issue_completion_email_sent?: boolean;
  return_completion_email_sent?: boolean;
  final_email_last_sent_at?: string | null;
}

interface Template {
  id: string;
  code: string;
  name: string;
  description?: string | null;
}

type StatusFilter = 'ALL' | 'PENDING' | 'COMPLETED' | 'RETURN';
type ActTypeFilter = 'ALL' | 'GENERIC_ONE' | 'GENERIC_MULTI' | 'IPAD';

const PAGE_SIZE = 24;

const FINAL_STATUSES = new Set(['COMPLETED', 'RETURN_INITIATED', 'RETURN_SIGNED_PARTY1', 'RETURN_SIGNED_PARTY2', 'RETURNED']);

const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'Все' },
  { value: 'PENDING', label: 'На подписи' },
  { value: 'COMPLETED', label: 'Завершено' },
  { value: 'RETURN', label: 'Возврат' },
];

const typeOptions: { value: ActTypeFilter; label: string }[] = [
  { value: 'ALL', label: 'Все типы' },
  { value: 'GENERIC_ONE', label: 'Один получатель' },
  { value: 'GENERIC_MULTI', label: 'Несколько получателей' },
  { value: 'IPAD', label: 'iPad для advisory' },
];

const templateIcons: Record<string, string> = {
  IPAD: '📱',
  GENERIC_ONE: '👤',
  GENERIC_MULTI: '👥',
};

const actUrl = (act: Act) => act.template_code === 'IPAD' ? `/acts/ipad/${act.id}` : `/acts/${act.id}`;
const actIcon = (act: Act) => act.template_code === 'IPAD' ? '📱' : '💻';
const shortId = (act: Act) => `ACT-${act.id.split('-')[0].toUpperCase()}`;
const actTitle = (act: Act) => act.template_code === 'IPAD'
  ? `Advisory iPad: ${act.advisory_group || act.item_name.replace(/^Комплект iPad:\s*/i, '')}`
  : act.item_name;
const recipientLine = (act: Act) => act.template_code === 'IPAD'
  ? `${act.student_count || 0} учеников`
  : (act.party2_name || '—');

const emailSent = (act: Act) => act.status === 'RETURNED'
  ? Boolean(act.return_completion_email_sent)
  : Boolean(act.issue_completion_email_sent);

export default function AdminActsTable() {
  const router = useRouter();
  const { showToast } = useToast();
  const [acts, setActs] = useState<Act[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [typeFilter, setTypeFilter] = useState<ActTypeFilter>('ALL');
  const [emailAct, setEmailAct] = useState<Act | null>(null);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    api.get('/api/templates?is_active=true')
      .then(response => setTemplates(Array.isArray(response.data) ? response.data : []))
      .catch(() => setTemplates([]));
  }, []);

  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => { void fetchActs(1); }, search ? 350 : 0);
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, typeFilter]);

  const fetchActs = async (nextPage: number) => {
    const seq = ++requestSeq.current;
    if (nextPage === 1) setLoading(true);
    else setLoadingMore(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage), page_size: String(PAGE_SIZE) });
      if (search.trim()) params.set('search', search.trim());
      if (typeFilter !== 'ALL') params.set('template_code', typeFilter);
      // PENDING/не-PENDING сервер умеет; «Возврат» уточняем на клиенте по статусам страницы.
      if (statusFilter === 'PENDING') params.set('pending', 'true');
      else if (statusFilter !== 'ALL') params.set('pending', 'false');
      const response = await api.get(`/api/acts?${params.toString()}`);
      if (seq !== requestSeq.current) return;
      let items: Act[] = response.data.items || [];
      if (statusFilter === 'COMPLETED') items = items.filter(act => act.status === 'COMPLETED');
      if (statusFilter === 'RETURN') items = items.filter(act => isReturnStatus(act.status));
      setTotal(response.data.total || 0);
      setPage(nextPage);
      setActs(prev => (nextPage === 1 ? items : [...prev, ...items]));
    } catch {
      if (seq !== requestSeq.current) return;
      if (nextPage === 1) { setActs([]); setTotal(0); }
      showToast('Не удалось загрузить акты', 'error');
    } finally {
      if (seq === requestSeq.current) { setLoading(false); setLoadingMore(false); }
    }
  };

  const openPdf = async (act: Act) => {
    try {
      const response = await api.get(`/api/acts/${act.id}/preview/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      showToast('Не удалось открыть PDF', 'error');
    }
  };

  const closeEmailModal = () => {
    setEmailAct(null);
    void fetchActs(1);
  };

  const activeTemplates = templates.filter(t => ['GENERIC_ONE', 'GENERIC_MULTI', 'IPAD'].includes(t.code));
  const createUrl = (code: string) => code === 'IPAD' ? '/acts/create/ipad' : `/acts/create?code=${code}`;
  // Клиентские фильтры COMPLETED/RETURN сужают страницу — «показать ещё» опираемся на сервер.
  const hasMore = statusFilter === 'ALL' || statusFilter === 'PENDING'
    ? acts.length < total
    : acts.length < total && acts.length >= PAGE_SIZE * (page - 1);

  return (
    <div className="space-y-6">
      {/* Создание акта */}
      {activeTemplates.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-lg">⚡</span>
            <h2 className="font-bold text-slate-800">Создать акт</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeTemplates.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => router.push(createUrl(t.code))}
                className="flex min-h-11 items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-blue-400 hover:bg-blue-50"
              >
                <span aria-hidden>{templateIcons[t.code] || '📄'}</span>
                {t.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Фильтры */}
      <section>
        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:w-80">
            <input
              type="text"
              placeholder="Поиск по названию или имени..."
              value={search}
              onChange={event => setSearch(event.target.value)}
              className="min-h-11 w-full rounded-xl border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">🔍</span>
          </div>
          <select
            value={typeFilter}
            onChange={event => setTypeFilter(event.target.value as ActTypeFilter)}
            className="min-h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm outline-none focus:border-blue-400"
          >
            {typeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {statusOptions.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => setStatusFilter(option.value)}
              className={`min-h-11 shrink-0 rounded-xl px-4 text-sm transition ${statusFilter === option.value ? 'bg-blue-600 font-bold text-white shadow-sm' : 'border border-gray-200 bg-white font-medium text-slate-600'}`}
            >
              {option.label}
            </button>
          ))}
          <span className="ml-auto hidden shrink-0 items-center text-sm text-slate-500 sm:flex">Всего: {total}</span>
        </div>

        {/* Таблица */}
        {loading ? (
          <div className="rounded-2xl bg-white p-12 text-center shadow-sm">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
            <p className="text-sm text-slate-500">Загрузка актов...</p>
          </div>
        ) : acts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <p className="font-black text-slate-700">Актов не найдено</p>
            <p className="mt-1 text-sm text-slate-400">Измените фильтры или создайте новый акт.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-semibold">Документ</th>
                    <th className="px-4 py-3 font-semibold">Получатель</th>
                    <th className="px-4 py-3 font-semibold">Дата</th>
                    <th className="px-4 py-3 font-semibold">Статус</th>
                    <th className="px-4 py-3 font-semibold">Письмо</th>
                    <th className="px-4 py-3 text-right font-semibold">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {acts.map(act => {
                    const pending = isPendingStatus(act.status);
                    const finalAct = FINAL_STATUSES.has(act.status);
                    return (
                      <tr key={act.id} className={`border-b border-slate-100 last:border-b-0 hover:bg-slate-50 ${pending ? 'bg-amber-50/40' : ''}`}>
                        <td className="max-w-[260px] px-4 py-3">
                          <Link href={actUrl(act)} className="group flex items-start gap-2">
                            <span className="mt-0.5 shrink-0" aria-hidden>{actIcon(act)}</span>
                            <span className="min-w-0">
                              <span className="block truncate font-bold text-slate-900 group-hover:text-blue-700">{actTitle(act)}</span>
                              <span className="block text-xs text-slate-400">{shortId(act)}</span>
                            </span>
                          </Link>
                        </td>
                        <td className="max-w-[220px] px-4 py-3">
                          <span className="block truncate text-slate-700">{recipientLine(act)}</span>
                          <span className="block truncate text-xs text-slate-400">Выдал: {act.party1_name || '—'}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{new Date(act.issue_date).toLocaleDateString('ru-RU')}</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <StatusPill status={act.status} label={getActStatusLabel(act.status)} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {!finalAct ? (
                            <span className="text-slate-300">—</span>
                          ) : emailSent(act) || act.final_email_last_sent_at ? (
                            <span className="inline-flex flex-col">
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">✓ Отправлено</span>
                              {act.final_email_last_sent_at && (
                                <span className="mt-0.5 px-1 text-[11px] text-slate-400">
                                  {new Date(act.final_email_last_sent_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">Не отправлено</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openPdf(act)}
                              className="min-h-11 rounded-xl bg-slate-100 px-3 text-sm font-bold text-slate-700 transition hover:bg-slate-200"
                            >
                              PDF
                            </button>
                            {finalAct && (
                              <button
                                type="button"
                                onClick={() => setEmailAct(act)}
                                className="min-h-11 rounded-xl bg-blue-600 px-3 text-sm font-black text-white transition hover:bg-blue-700"
                              >
                                ✉
                              </button>
                            )}
                            <Link
                              href={actUrl(act)}
                              className="flex min-h-11 items-center rounded-xl bg-slate-100 px-3 text-sm font-bold text-slate-700 transition hover:bg-slate-200"
                            >
                              →
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {hasMore && (
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => fetchActs(page + 1)}
                className="mt-4 min-h-12 w-full rounded-2xl border border-blue-200 bg-white font-bold text-blue-700 transition hover:bg-blue-50 disabled:opacity-50"
              >
                {loadingMore ? 'Загрузка...' : 'Показать ещё'}
              </button>
            )}
          </>
        )}
      </section>

      {/* Модалка отправки финального письма */}
      {emailAct && (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-950/70 p-3 sm:p-6">
          <div className="mx-auto max-w-3xl">
            <div className="mb-3 flex items-center justify-between rounded-2xl bg-white p-3">
              <div className="min-w-0 px-2">
                <p className="truncate font-black">{actTitle(emailAct)}</p>
                <p className="text-xs text-slate-400">{shortId(emailAct)}</p>
              </div>
              <button onClick={closeEmailModal} className="min-h-11 shrink-0 rounded-xl bg-slate-100 px-4 text-sm font-bold">Закрыть</button>
            </div>
            <ManualFinalEmail actId={emailAct.id} />
          </div>
        </div>
      )}
    </div>
  );
}
