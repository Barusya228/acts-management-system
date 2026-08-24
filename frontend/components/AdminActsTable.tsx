'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import ManualFinalEmailModal from '@/components/ManualFinalEmailModal';
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
  item_barcode?: string | null;
  issue_completion_email_sent?: boolean;
  return_completion_email_sent?: boolean;
  final_email_last_sent_at?: string | null;
  final_email_status?: 'PENDING' | 'PROCESSING' | 'SENT' | 'ERROR' | null;
  final_email_status_at?: string | null;
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

const templateDescriptions: Record<string, string> = {
  GENERIC_ONE: 'Выдача техники одному сотруднику',
  GENERIC_MULTI: 'Один акт для группы получателей',
  IPAD: 'Назначение iPad ученикам Advisory',
};

const actUrl = (act: Act) => act.template_code === 'IPAD' ? `/acts/ipad/${act.id}` : `/acts/${act.id}`;
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

function TemplateIcon({ code }: { code: string }) {
  if (code === 'IPAD') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 stroke-current" fill="none" strokeWidth="1.8">
        <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
        <path d="M10 5h4M11 18.5h2" />
      </svg>
    );
  }

  if (code === 'GENERIC_MULTI') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 stroke-current" fill="none" strokeWidth="1.8">
        <circle cx="9" cy="8" r="3" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M3.5 19c.5-3.4 2.4-5 5.5-5s5 1.6 5.5 5M14 14.5c3.8-.7 6 1 6.5 4.5" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 stroke-current" fill="none" strokeWidth="1.8">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 20c.5-4.1 2.7-6 6.5-6s6 1.9 6.5 6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 stroke-current" fill="none" strokeWidth="1.8">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function EmailDeliveryStatus({ act }: { act: Act }) {
  const status = act.final_email_status;
  const sent = status === 'SENT' || emailSent(act) || Boolean(act.final_email_last_sent_at);
  const meta = status === 'ERROR'
    ? { label: 'Ошибка', className: 'bg-red-100 text-red-700' }
    : status === 'PROCESSING'
      ? { label: 'Отправляется', className: 'bg-blue-100 text-blue-700' }
      : status === 'PENDING'
        ? { label: 'В очереди', className: 'bg-amber-100 text-amber-700' }
        : sent
          ? { label: 'Отправлено', className: 'bg-emerald-100 text-emerald-700' }
          : { label: 'Не отправлено', className: 'bg-slate-100 text-slate-500' };
  const statusDate = status === 'SENT'
    ? act.final_email_last_sent_at || act.final_email_status_at
    : act.final_email_status_at;

  return (
    <span className="inline-flex flex-col items-start">
      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}>
        {sent && status !== 'PENDING' && status !== 'PROCESSING' && status !== 'ERROR' ? '✓ ' : ''}{meta.label}
      </span>
      {statusDate && (
        <span className="mt-0.5 px-1 text-[11px] text-slate-400">
          {new Date(statusDate).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </span>
  );
}

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
  const [filtersReady, setFiltersReady] = useState(false);
  const [emailAct, setEmailAct] = useState<Act | null>(null);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    api.get('/api/templates?is_active=true')
      .then(response => setTemplates(Array.isArray(response.data) ? response.data : []))
      .catch(() => setTemplates([]));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    const type = params.get('type');
    if (status && statusOptions.some(option => option.value === status)) setStatusFilter(status as StatusFilter);
    if (type && typeOptions.some(option => option.value === type)) setTypeFilter(type as ActTypeFilter);
    setFiltersReady(true);
  }, []);

  useEffect(() => {
    if (!filtersReady) return;
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => { void fetchActs(1); }, search ? 350 : 0);
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, typeFilter, filtersReady]);

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
    <div className="space-y-5">
      <header>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Акты</h1>
          {!loading && <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600">{total}</span>}
        </div>
        <p className="mt-1 text-sm text-slate-500">Создание, подпись и отправка документов получателям.</p>
      </header>

      {activeTemplates.length > 0 && (
        <section aria-labelledby="create-act-title">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700" aria-hidden>
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current"><path d="M13.1 2 5.5 13.1h5.2L9.9 22l8.6-12.2h-5.4V2Z" /></svg>
            </span>
            <h2 id="create-act-title" className="font-bold text-slate-800">Создать акт</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {activeTemplates.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => router.push(createUrl(t.code))}
                className="group flex min-h-24 items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${t.code === 'IPAD' ? 'bg-cyan-100 text-cyan-700' : t.code === 'GENERIC_MULTI' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>
                  <TemplateIcon code={t.code} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-slate-900">{t.name}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">{templateDescriptions[t.code] || t.description || 'Создать новый документ'}</span>
                </span>
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 stroke-slate-400 transition group-hover:translate-x-0.5 group-hover:stroke-blue-600" fill="none" strokeWidth="1.8"><path d="m9 5 7 7-7 7" /></svg>
              </button>
            ))}
          </div>
        </section>
      )}

      <section aria-label="Реестр актов">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative min-w-0 flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><SearchIcon /></span>
              <input
                type="text"
                aria-label="Поиск актов"
                placeholder="Название, получатель или email..."
                value={search}
                onChange={event => setSearch(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-slate-200 py-2 pl-10 pr-11 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Очистить поиск"
                  className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  ×
                </button>
              )}
            </div>
            <label className="w-full lg:w-64">
              <span className="sr-only">Тип акта</span>
              <select
                value={typeFilter}
                onChange={event => setTypeFilter(event.target.value as ActTypeFilter)}
                className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                {typeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto border-t border-slate-100 pt-3">
            {statusOptions.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => setStatusFilter(option.value)}
                aria-pressed={statusFilter === option.value}
                className={`min-h-11 shrink-0 rounded-xl px-4 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${statusFilter === option.value ? 'bg-blue-600 font-bold text-white shadow-sm' : 'bg-slate-100 font-medium text-slate-600 hover:bg-slate-200'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
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
            <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-3 font-semibold lg:px-4">Документ</th>
                    <th className="px-3 py-3 font-semibold lg:px-4">Получатель</th>
                    <th className="px-3 py-3 font-semibold lg:px-4">Дата</th>
                    <th className="px-3 py-3 font-semibold lg:px-4">Статус</th>
                    <th className="hidden px-3 py-3 font-semibold lg:table-cell lg:px-4">Email</th>
                    <th className="px-3 py-3 text-right font-semibold lg:px-4">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {acts.map(act => {
                    const pending = isPendingStatus(act.status);
                    const finalAct = FINAL_STATUSES.has(act.status);
                    return (
                      <tr key={act.id} className="border-b border-slate-100 transition-colors last:border-b-0 hover:bg-slate-50">
                        <td className={`max-w-[260px] border-l-4 px-3 py-3 lg:px-4 ${pending ? 'border-l-amber-400' : 'border-l-transparent'}`}>
                          <Link href={actUrl(act)} className="group flex items-start gap-2">
                            <span className="mt-0.5 shrink-0 text-blue-600"><TemplateIcon code={act.template_code || 'GENERIC_ONE'} /></span>
                            <span className="min-w-0">
                              <span className="block truncate font-bold text-slate-900 group-hover:text-blue-700">{actTitle(act)}</span>
                              <span className="block font-mono text-xs text-slate-400">{shortId(act)}</span>
                              {act.item_barcode && <span className="block truncate font-mono text-[11px] text-slate-400">ШК: {act.item_barcode}</span>}
                            </span>
                          </Link>
                        </td>
                        <td className="max-w-[220px] px-3 py-3 lg:px-4">
                          <span className="block truncate text-slate-700">{recipientLine(act)}</span>
                          <span className="block truncate text-xs text-slate-400">Выдал: {act.party1_name || '—'}</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600 lg:px-4">{new Date(act.issue_date).toLocaleDateString('ru-RU')}</td>
                        <td className="whitespace-nowrap px-3 py-3 lg:px-4">
                          <StatusPill status={act.status} label={getActStatusLabel(act.status)} />
                        </td>
                        <td className="hidden px-3 py-3 lg:table-cell lg:px-4">
                          {finalAct ? <EmailDeliveryStatus act={act} /> : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 lg:px-4">
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openPdf(act)}
                              aria-label={`Открыть PDF ${shortId(act)}`}
                              title="Открыть PDF"
                              className="min-h-11 rounded-xl bg-slate-100 px-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            >
                              PDF
                            </button>
                            {finalAct && (
                              <button
                                type="button"
                                onClick={() => setEmailAct(act)}
                                aria-label={`Отправить ${shortId(act)} по email`}
                                title="Отправить по email"
                                className="min-h-11 rounded-xl bg-blue-600 px-2.5 text-xs font-bold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                              >
                                Email
                              </button>
                            )}
                            <Link
                              href={actUrl(act)}
                              aria-label={`Открыть ${shortId(act)}`}
                              className="flex min-h-11 items-center rounded-xl bg-slate-100 px-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            >
                              Открыть
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {acts.map(act => {
                const pending = isPendingStatus(act.status);
                const finalAct = FINAL_STATUSES.has(act.status);
                return (
                  <article key={act.id} className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${pending ? 'border-l-4 border-l-amber-400' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <Link href={actUrl(act)} className="flex min-w-0 gap-3">
                        <span className="shrink-0 text-blue-600"><TemplateIcon code={act.template_code || 'GENERIC_ONE'} /></span>
                        <span className="min-w-0">
                          <span className="block truncate font-bold text-slate-900">{actTitle(act)}</span>
                          <span className="block font-mono text-xs text-slate-400">{shortId(act)}</span>
                          {act.item_barcode && <span className="block truncate font-mono text-[11px] text-slate-400">ШК: {act.item_barcode}</span>}
                        </span>
                      </Link>
                      <StatusPill status={act.status} label={getActStatusLabel(act.status)} />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm">
                      <div className="min-w-0">
                        <p className="text-xs text-slate-400">Получатель</p>
                        <p className="truncate font-medium text-slate-700">{recipientLine(act)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Дата</p>
                        <p className="font-medium text-slate-700">{new Date(act.issue_date).toLocaleDateString('ru-RU')}</p>
                      </div>
                    </div>
                    {finalAct && <div className="mt-3"><EmailDeliveryStatus act={act} /></div>}
                    <div className={`mt-3 grid gap-2 ${finalAct ? 'grid-cols-3' : 'grid-cols-2'}`}>
                      <button type="button" onClick={() => openPdf(act)} className="min-h-11 rounded-xl bg-slate-100 text-sm font-bold text-slate-700">PDF</button>
                      {finalAct && <button type="button" onClick={() => setEmailAct(act)} className="min-h-11 rounded-xl bg-blue-600 text-sm font-bold text-white">Email</button>}
                      <Link href={actUrl(act)} className="flex min-h-11 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-700">Открыть</Link>
                    </div>
                  </article>
                );
              })}
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
        </div>
      </section>

      {/* Модалка отправки финального письма */}
      {emailAct && (
        <ManualFinalEmailModal actId={emailAct.id} title={actTitle(emailAct)} reference={shortId(emailAct)} onClose={closeEmailModal} />
      )}
    </div>
  );
}
