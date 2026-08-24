'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
import { useAuth } from '@/contexts/AuthContext';
import { auditActionLabel, auditEntityLabel } from '@/lib/auditLabels';
import api from '@/lib/api';

interface Dashboard {
  acts: { pending: number; completed: number; return_in_progress: number };
  ipads: { available: number; issued: number; reserved: number; return_pending: number; maintenance: number; retired: number };
  devices: { available: number; issued: number; maintenance: number; retired: number; paper_issued: number };
  email: { queued: number; errors: number };
  recent_actions: { id: string; actor: string | null; action: string; entity_type: string; created_at: string }[];
}

type IconName = 'signature' | 'return' | 'repair' | 'mail' | 'tablet' | 'laptop' | 'activity' | 'refresh' | 'plus';
type Tone = 'amber' | 'orange' | 'red' | 'blue';

const iconPaths: Record<IconName, string[]> = {
  signature: ['M4 18c3-1 4-6 7-10 1.5-1.5 3.5.5 2 2.5L9 16c2-1 3-3 4-2s.5 2 2 2-2 4-1'],
  return: ['M8 7H4V3', 'M4 7c2-3 5-4 8-4a9 9 0 1 1-8.5 12'],
  repair: ['m14.5 5 4.5 4.5', 'M16 3a4 4 0 0 0-5 5L4 15l5 5 7-7a4 4 0 0 0 5-5l-3-3-3 3-2-2 3-3Z'],
  mail: ['M3 5h18v14H3z', 'm4 8 5 4 5-4'],
  tablet: ['M6 2.5h12v19H6z', 'M10 5h4M11 18.5h2'],
  laptop: ['M4 5h16v11H4z', 'M2.5 20h19', 'M8 20h8'],
  activity: ['M4 12h3l2-5 4 10 2-5h5'],
  refresh: ['M20 6v5h-5', 'M4 18v-5h5', 'M18.5 10A7 7 0 0 0 6.2 6.5L4 9', 'M5.5 14A7 7 0 0 0 17.8 17.5L20 15'],
  plus: ['M12 5v14M5 12h14'],
};

const toneStyles: Record<Tone, { icon: string; value: string }> = {
  amber: { icon: 'bg-amber-100 text-amber-700', value: 'text-amber-700' },
  orange: { icon: 'bg-orange-100 text-orange-700', value: 'text-orange-700' },
  red: { icon: 'bg-red-100 text-red-700', value: 'text-red-700' },
  blue: { icon: 'bg-blue-100 text-blue-700', value: 'text-blue-700' },
};

export default function AdminDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login?next=/admin');
    if (!authLoading && user && user.role !== 'ADMIN') router.push('/guest');
  }, [user, authLoading, router]);

  const loadDashboard = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await api.get('/api/analytics/dashboard');
      setData(response.data);
      setLastUpdated(new Date());
    } catch {
      setLoadError('Не удалось загрузить состояние системы. Проверьте подключение и повторите.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'ADMIN') void loadDashboard();
  }, [user]);

  if (authLoading || !user || user.role !== 'ADMIN') return null;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-7xl">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">Главная</h1>
            <p className="mt-1 text-sm text-slate-500">Задачи, которые требуют внимания, и текущее состояние техники.</p>
          </div>
          <div className="flex items-center gap-2">
            {lastUpdated && <span className="hidden text-xs text-slate-400 md:inline">Обновлено в {lastUpdated.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>}
            <button
              type="button"
              onClick={loadDashboard}
              disabled={loading}
              className="flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <DashboardIcon name="refresh" />
              <span className="hidden sm:inline">Обновить</span>
            </button>
            <Link href="/admin/acts#create-act-title" className="flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700">
              <DashboardIcon name="plus" />
              Создать акт
            </Link>
          </div>
        </header>

        {loading && !data ? (
          <DashboardSkeleton />
        ) : loadError && !data ? (
          <div className="rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
            <p className="font-bold text-red-700">{loadError}</p>
            <button type="button" onClick={loadDashboard} className="mt-4 min-h-11 rounded-xl bg-red-600 px-5 text-sm font-bold text-white">Повторить</button>
          </div>
        ) : data ? (
          <div className="space-y-6">
            <section aria-labelledby="attention-title">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 id="attention-title" className="font-black text-slate-900">Требует внимания</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Переходите сразу к задачам, которые нужно обработать.</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <AttentionCard href="/admin/acts?status=PENDING" icon="signature" label="Ожидают подписи" value={data.acts.pending} detail="Акты ещё не завершены" tone="amber" />
                <AttentionCard href="/admin/acts?status=RETURN" icon="return" label="Возвраты в процессе" value={data.acts.return_in_progress} detail="Нужно завершить возврат" tone="orange" />
                <AttentionCard href="/admin/inventory?view=ipads&status=MAINTENANCE" icon="repair" label="iPad на обслуживании" value={data.ipads.maintenance} detail="Требуют проверки или ремонта" tone="red" />
                <AttentionCard
                  href="/admin/reminders"
                  icon="mail"
                  label="Письма"
                  value={data.email.queued + data.email.errors}
                  detail={emailAttentionText(data.email.queued, data.email.errors)}
                  tone={data.email.errors > 0 ? 'red' : 'blue'}
                />
              </div>
            </section>

            <section aria-labelledby="fleet-title">
              <div className="mb-3">
                <h2 id="fleet-title" className="font-black text-slate-900">Состояние техники</h2>
                <p className="mt-0.5 text-xs text-slate-500">Занятость парка и доступность устройств.</p>
              </div>
              <div className="grid items-start gap-4 lg:grid-cols-2">
                <FleetCard
                  title="iPad-парк"
                  icon="tablet"
                  href="/admin/inventory?view=ipads"
                  total={sumValues(data.ipads)}
                  inUse={data.ipads.issued}
                  color="bg-blue-500"
                  stats={[
                    { label: 'Доступно', value: data.ipads.available, tone: 'text-emerald-700' },
                    { label: 'Выдано', value: data.ipads.issued, tone: 'text-blue-700' },
                    { label: 'Зарезервировано', value: data.ipads.reserved, tone: 'text-amber-700' },
                    { label: 'На обслуживании', value: data.ipads.maintenance, tone: 'text-red-700' },
                  ]}
                  footer={`Ожидают возврата: ${data.ipads.return_pending} · Списано: ${data.ipads.retired}`}
                />
                <FleetCard
                  title="Прочая техника"
                  icon="laptop"
                  href="/admin/inventory?view=devices"
                  total={sumValues(data.devices)}
                  inUse={data.devices.issued + data.devices.paper_issued}
                  color="bg-emerald-500"
                  stats={[
                    { label: 'Доступно', value: data.devices.available, tone: 'text-emerald-700' },
                    { label: 'По акту', value: data.devices.issued, tone: 'text-blue-700' },
                    { label: 'По бумажному акту', value: data.devices.paper_issued, tone: 'text-violet-700' },
                    { label: 'На обслуживании', value: data.devices.maintenance, tone: 'text-red-700' },
                  ]}
                  footer={`Списано: ${data.devices.retired}`}
                />
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="activity-title">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><DashboardIcon name="activity" /></span>
                  <div>
                    <h2 id="activity-title" className="font-black text-slate-900">Последние действия</h2>
                    <p className="text-xs text-slate-500">Пять последних изменений в системе.</p>
                  </div>
                </div>
                <Link href="/admin/audit" className="shrink-0 text-sm font-bold text-blue-600 hover:text-blue-700">Весь журнал →</Link>
              </div>
              {data.recent_actions.length === 0 ? (
                <p className="p-8 text-center text-sm text-slate-400">Событий пока нет</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.recent_actions.map(item => (
                    <div key={item.id} className="flex items-start justify-between gap-4 px-4 py-3 transition hover:bg-slate-50 sm:px-5">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                          <DashboardIcon name={activityIcon(item.action, item.entity_type)} />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-800">{auditActionLabel(item.action)}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{item.actor || 'Система'} · {auditEntityLabel(item.entity_type)}</p>
                        </div>
                      </div>
                      <time className="shrink-0 text-xs text-slate-400" dateTime={item.created_at}>
                        {formatActionDate(item.created_at)}
                      </time>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </AdminLayout>
  );
}

function AttentionCard({ href, icon, label, value, detail, tone }: { href: string; icon: IconName; label: string; value: number; detail: string; tone: Tone }) {
  const clear = value === 0;
  const styles = toneStyles[tone];
  return (
    <Link href={href} className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${clear ? 'bg-emerald-100 text-emerald-700' : styles.icon}`}>
          {clear ? <CheckIcon /> : <DashboardIcon name={icon} />}
        </span>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 stroke-slate-300 transition group-hover:translate-x-0.5 group-hover:stroke-blue-500" fill="none" strokeWidth="1.8"><path d="m9 5 7 7-7 7" /></svg>
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-600">{label}</p>
      <p className={`mt-1 text-3xl font-black tabular-nums ${clear ? 'text-emerald-700' : styles.value}`}>{value}</p>
      <p className="mt-1 truncate text-xs text-slate-400">{clear ? 'Нет активных задач' : detail}</p>
    </Link>
  );
}

function FleetCard({ title, icon, href, total, inUse, color, stats, footer }: { title: string; icon: IconName; href: string; total: number; inUse: number; color: string; stats: Array<{ label: string; value: number; tone: string }>; footer: string }) {
  const percentage = total > 0 ? Math.min(100, (inUse / total) * 100) : 0;
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><DashboardIcon name={icon} /></span>
          <div>
            <h3 className="font-black text-slate-900">{title}</h3>
            <p className="text-xs text-slate-500">Выдано {inUse} из {total}</p>
          </div>
        </div>
        <Link href={href} className="text-sm font-bold text-blue-600 hover:text-blue-700">Открыть →</Link>
      </div>
      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${percentage}%` }} /></div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(item => (
          <div key={item.label} className="rounded-xl bg-slate-50 px-3 py-2.5">
            <p className="truncate text-[11px] text-slate-500">{item.label}</p>
            <p className={`mt-0.5 text-xl font-black tabular-nums ${item.tone}`}>{item.value}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-400">{footer}</p>
    </article>
  );
}

function DashboardIcon({ name }: { name: IconName }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 stroke-current" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {iconPaths[name].map((path, index) => <path key={index} d={path} />)}
    </svg>
  );
}

function CheckIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 stroke-current" fill="none" strokeWidth="2"><path d="m5 12 4 4L19 6" /></svg>;
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-40 rounded-2xl bg-slate-200" />)}</div>
      <div className="grid gap-4 lg:grid-cols-2">{Array.from({ length: 2 }, (_, index) => <div key={index} className="h-64 rounded-2xl bg-slate-200" />)}</div>
      <div className="h-72 rounded-2xl bg-slate-200" />
    </div>
  );
}

function sumValues(values: Record<string, number>) {
  return Object.values(values).reduce((sum, value) => sum + Number(value || 0), 0);
}

function formatActionDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  return isToday
    ? `Сегодня, ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
    : date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function pluralRu(value: number, one: string, few: string, many: string) {
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function emailAttentionText(queued: number, errors: number) {
  const queuedText = `${queued} ${pluralRu(queued, 'письмо', 'письма', 'писем')} в очереди`;
  if (errors === 0) return queuedText;
  return `${queuedText} · ${errors} ${pluralRu(errors, 'ошибка', 'ошибки', 'ошибок')}`;
}

function activityIcon(action: string, entity: string): IconName {
  if (action.includes('EMAIL')) return 'mail';
  if (entity === 'IPAD_DEVICE' || entity === 'IPAD_APPENDIX' || entity === 'KIOSK') return 'tablet';
  if (entity === 'INVENTORY_DEVICE' || entity === 'INVENTORY_CATEGORY' || entity === 'SMALL_EQUIPMENT') return 'laptop';
  if (action.includes('RETURN')) return 'return';
  if (entity === 'ACT') return 'signature';
  return 'activity';
}
