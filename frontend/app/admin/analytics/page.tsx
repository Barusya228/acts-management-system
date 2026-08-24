'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';

interface OverviewStats {
  total_acts: number;
  pending_signature: number;
  completed_acts: number;
  returned_acts: number;
  active_equipment: number;
}

interface MonthlyData {
  year: number;
  month: number;
  count: number;
  label: string;
}

interface MonthlyStats {
  issue_by_month: MonthlyData[];
  return_by_month: MonthlyData[];
}

interface TopRecipient {
  full_name: string;
  email: string | null;
  total_acts: number;
  active_acts: number;
  returned_acts: number;
}

interface StatusDistribution {
  status: string;
  label: string;
  count: number;
}

interface AnalyticsData {
  overview: OverviewStats;
  monthlyStats: MonthlyStats;
  topRecipients: TopRecipient[];
  statusDistribution: StatusDistribution[];
}

interface CalendarMonth {
  key: string;
  label: string;
  issued: number;
  returned: number;
}

type Period = 6 | 12;
type SummaryIconName = 'documents' | 'signature' | 'equipment' | 'returned';

const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function buildCalendarMonths(stats: MonthlyStats, period: Period): CalendarMonth[] {
  const issuedByMonth = new Map<string, number>();
  const returnedByMonth = new Map<string, number>();

  stats.issue_by_month.forEach(item => {
    const key = monthKey(Number(item.year), Number(item.month));
    issuedByMonth.set(key, (issuedByMonth.get(key) || 0) + Number(item.count || 0));
  });
  stats.return_by_month.forEach(item => {
    const key = monthKey(Number(item.year), Number(item.month));
    returnedByMonth.set(key, (returnedByMonth.get(key) || 0) + Number(item.count || 0));
  });

  const now = new Date();
  return Array.from({ length: period }, (_, index) => {
    const offset = period - index - 1;
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const key = monthKey(year, month);
    return {
      key,
      label: `${monthNames[month - 1]} ${year}`,
      issued: issuedByMonth.get(key) || 0,
      returned: returnedByMonth.get(key) || 0,
    };
  });
}

function statusBarColor(status: string) {
  switch (status.toUpperCase()) {
    case 'DRAFT':
      return 'bg-slate-500';
    case 'SIGNED_PARTY1':
      return 'bg-amber-500';
    case 'SIGNED_PARTY2':
      return 'bg-blue-500';
    case 'COMPLETED':
      return 'bg-emerald-500';
    case 'RETURN_INITIATED':
      return 'bg-orange-500';
    case 'RETURN_SIGNED_PARTY1':
    case 'RETURN_SIGNED_PARTY2':
      return 'bg-violet-500';
    case 'RETURNED':
      return 'bg-blue-600';
    default:
      return 'bg-slate-500';
  }
}

export default function AnalyticsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const exportRef = useRef<HTMLDivElement>(null);
  const [period, setPeriod] = useState<Period>(6);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  useEffect(() => {
    if (!authLoading && !user) router.push('/login?next=/admin/analytics');
    if (!authLoading && user && user.role !== 'ADMIN') router.push('/guest');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user?.role !== 'ADMIN') return;

    let cancelled = false;
    setLoading(true);
    setError('');
    setData(null);

    Promise.all([
      api.get('/api/analytics/overview'),
      api.get(`/api/analytics/monthly-stats?months=${period}`),
      api.get('/api/analytics/top-recipients?limit=10'),
      api.get('/api/analytics/status-distribution'),
    ])
      .then(([overviewResponse, monthlyResponse, recipientsResponse, statusResponse]) => {
        if (cancelled) return;
        setData({
          overview: overviewResponse.data,
          monthlyStats: {
            issue_by_month: Array.isArray(monthlyResponse.data?.issue_by_month) ? monthlyResponse.data.issue_by_month : [],
            return_by_month: Array.isArray(monthlyResponse.data?.return_by_month) ? monthlyResponse.data.return_by_month : [],
          },
          topRecipients: Array.isArray(recipientsResponse.data?.top_recipients)
            ? recipientsResponse.data.top_recipients.slice(0, 10)
            : [],
          statusDistribution: Array.isArray(statusResponse.data?.distribution) ? statusResponse.data.distribution : [],
        });
      })
      .catch(() => {
        if (!cancelled) setError('Не удалось загрузить аналитику. Проверьте подключение и повторите попытку.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, period, retryKey]);

  useEffect(() => {
    if (!exportOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(event.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [exportOpen]);

  const downloadCsv = async (path: string, filename: string) => {
    setExportOpen(false);
    setExporting(true);
    setExportError('');
    try {
      const response = await api.get(path, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 0);
      }
    } catch {
      setExportError('Не удалось скачать CSV. Повторите попытку.');
    } finally {
      setExporting(false);
    }
  };

  if (authLoading || !user || user.role !== 'ADMIN') return null;

  const calendarMonths = data ? buildCalendarMonths(data.monthlyStats, period) : [];
  const maxMonthlyCount = Math.max(...calendarMonths.flatMap(item => [item.issued, item.returned]), 1);
  const statusTotal = data?.statusDistribution.reduce((sum, item) => sum + Number(item.count || 0), 0) || 0;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-7xl">
        <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 md:text-2xl">Аналитика</h1>
            <p className="mt-1 text-sm text-slate-500">Динамика актов, статусы и получатели.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl bg-slate-100 p-1" role="group" aria-label="Период аналитики">
              {([6, 12] as Period[]).map(value => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPeriod(value)}
                  aria-pressed={period === value}
                  className={`min-h-9 rounded-lg px-3 text-xs font-bold transition sm:text-sm ${
                    period === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {value} месяцев
                </button>
              ))}
            </div>

            <div ref={exportRef} className="relative">
              <button
                type="button"
                onClick={() => setExportOpen(open => !open)}
                disabled={exporting}
                aria-expanded={exportOpen}
                aria-haspopup="menu"
                className="flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-gray-200 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 stroke-current" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14" />
                </svg>
                {exporting ? 'Экспорт...' : 'Экспорт'}
                <svg aria-hidden="true" viewBox="0 0 12 12" className={`h-3 w-3 stroke-current transition ${exportOpen ? 'rotate-180' : ''}`} fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m2.5 4.5 3.5 3 3.5-3" />
                </svg>
              </button>
              {exportOpen && (
                <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void downloadCsv('/api/analytics/export/acts.csv', 'acts.csv')}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                  >
                    <CsvIcon />
                    Акты в CSV
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void downloadCsv('/api/analytics/export/inventory.csv', 'inventory.csv')}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                  >
                    <CsvIcon />
                    Инвентарь в CSV
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {exportError && (
          <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {exportError}
          </div>
        )}

        {loading ? (
          <AnalyticsSkeleton />
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-700">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 stroke-current" fill="none" strokeWidth="1.8" strokeLinecap="round">
                <path d="M12 8v5m0 3h.01M12 3 2.8 20h18.4L12 3Z" />
              </svg>
            </div>
            <p className="mt-4 font-bold text-slate-900">{error}</p>
            <button
              type="button"
              onClick={() => setRetryKey(key => key + 1)}
              className="mt-4 min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-700"
            >
              Повторить
            </button>
          </div>
        ) : data ? (
          <div className="space-y-5">
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Основные показатели">
              <SummaryCard label="Всего актов" value={data.overview.total_acts} icon="documents" tone="text-blue-600" />
              <SummaryCard label="Ожидают подписи" value={data.overview.pending_signature} icon="signature" tone="text-amber-600" />
              <SummaryCard label="Техника на руках" value={data.overview.active_equipment} icon="equipment" tone="text-emerald-600" />
              <SummaryCard label="Возвращено" value={data.overview.returned_acts} icon="returned" tone="text-violet-600" />
            </section>

            <div className="grid gap-5 lg:grid-cols-2">
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-bold text-slate-900">Выдача и возврат по месяцам</h2>
                    <p className="mt-1 text-xs text-slate-500">Последние {period} календарных месяцев</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-medium text-slate-500" aria-label="Легенда">
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Выдано</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" />Возвращено</span>
                  </div>
                </div>

                <div className={period === 12 ? 'grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2' : 'grid gap-4'}>
                  {calendarMonths.map(item => (
                    <div key={item.key}>
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                        <span className="font-semibold text-slate-700">{item.label}</span>
                        <span className="whitespace-nowrap tabular-nums text-slate-500" aria-label={`Выдано ${item.issued}, возвращено ${item.returned}`}>
                          {item.issued} / {item.returned}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(item.issued / maxMonthlyCount) * 100}%` }} />
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-blue-500" style={{ width: `${(item.returned / maxMonthlyCount) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-5">
                  <h2 className="font-bold text-slate-900">Распределение по статусам</h2>
                  <p className="mt-1 text-xs text-slate-500">Всего актов в распределении: {statusTotal}</p>
                </div>

                {data.statusDistribution.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">Нет данных по статусам</div>
                ) : (
                  <div className="space-y-4">
                    {data.statusDistribution.map(item => {
                      const count = Number(item.count || 0);
                      const percentage = statusTotal > 0 ? (count / statusTotal) * 100 : 0;
                      const color = statusBarColor(item.status);
                      return (
                        <div key={item.status}>
                          <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                            <span className="flex min-w-0 items-center gap-2 font-medium text-slate-700">
                              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`} />
                              <span className="truncate">{item.label}</span>
                            </span>
                            <span className="shrink-0 tabular-nums text-slate-500">
                              {count} ({percentage.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%)
                            </span>
                          </div>
                          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                            <div className={`h-full rounded-full ${color}`} style={{ width: `${percentage}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
                <h2 className="font-bold text-slate-900">Получатели по количеству актов</h2>
                <p className="mt-1 text-xs text-slate-500">До 10 получателей с наибольшим числом актов</p>
              </div>

              {data.topRecipients.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-400">Нет данных о получателях</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-left text-sm sm:min-w-[780px]">
                    <thead>
                      <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-4 py-3 font-semibold sm:px-5">ФИО</th>
                        <th className="hidden px-4 py-3 font-semibold sm:table-cell">Email</th>
                        <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">Всего актов</th>
                        <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">На руках</th>
                        <th className="whitespace-nowrap px-4 py-3 text-right font-semibold sm:px-5">Возвращено</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topRecipients.map((recipient, index) => (
                        <tr key={`${recipient.email || recipient.full_name}-${index}`} className="border-t border-slate-100 transition hover:bg-slate-50">
                          <td className="max-w-[240px] px-4 py-3 font-bold text-slate-900 sm:px-5">
                            <span className="block truncate">{recipient.full_name}</span>
                          </td>
                          <td className="hidden max-w-[260px] px-4 py-3 text-slate-600 sm:table-cell">
                            <span className="block truncate">{recipient.email || 'Нет email'}</span>
                          </td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">{recipient.total_acts}</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-emerald-700">{recipient.active_acts}</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-blue-700 sm:px-5">{recipient.returned_acts}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </AdminLayout>
  );
}

function SummaryCard({ label, value, icon, tone }: { label: string; value: number; icon: SummaryIconName; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-500 sm:text-sm">{label}</p>
          <p className={`mt-2 text-2xl font-black tabular-nums sm:text-3xl ${tone}`}>{value}</p>
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 ${tone}`}>
          <SummaryIcon name={icon} />
        </span>
      </div>
    </div>
  );
}

function SummaryIcon({ name }: { name: SummaryIconName }) {
  const paths: Record<SummaryIconName, string[]> = {
    documents: ['M7 3h8l4 4v14H7z', 'M15 3v5h5', 'M10 12h6M10 16h6'],
    signature: ['M4 18c3-1 4-6 7-10 1.5-1.5 3.5.5 2 2.5L9 16c2-1 3-3 4-2s.5 2 2 2 2-2 4-1'],
    equipment: ['M4 5h16v11H4z', 'M8 20h8M12 16v4'],
    returned: ['M8 7H4v-4', 'M4 7c2-3 5-4 8-4a9 9 0 1 1-8.5 12'],
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 stroke-current" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name].map((path, index) => <path key={index} d={path} />)}
    </svg>
  );
}

function CsvIcon() {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-[9px] font-black tracking-tight text-emerald-700">
      CSV
    </span>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="animate-pulse space-y-5" aria-label="Загрузка аналитики">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-28 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="h-3 w-24 rounded bg-slate-100" />
            <div className="mt-4 h-8 w-16 rounded bg-slate-200" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="h-80 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="h-4 w-48 rounded bg-slate-200" />
            <div className="mt-7 space-y-5">
              {Array.from({ length: 5 }, (_, row) => <div key={row} className="h-8 rounded bg-slate-100" />)}
            </div>
          </div>
        ))}
      </div>
      <div className="h-72 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="h-4 w-56 rounded bg-slate-200" />
        <div className="mt-7 space-y-4">
          {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-9 rounded bg-slate-100" />)}
        </div>
      </div>
    </div>
  );
}
