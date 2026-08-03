'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
import ManualFinalEmail from '@/components/ManualFinalEmail';
import PageHeader from '@/components/ui/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import api from '@/lib/api';

interface Act {
  id: string;
  item_name: string;
  item_serial?: string | null;
  party1_name: string;
  party2_name: string;
  receiver_email: string;
  status: string;
  issue_date: string;
  created_at: string;
  template_code?: string | null;
  advisory_group?: string | null;
  student_count?: number | null;
  extra_data_json?: Record<string, unknown>;
}

interface PendingRecipient { full_name: string; email: string; }
type Section = 'pending' | 'finals';

const finalStatuses = new Set(['COMPLETED', 'RETURN_INITIATED', 'RETURN_SIGNED_PARTY1', 'RETURN_SIGNED_PARTY2', 'RETURNED']);

export default function AdminCommunicationsPage() {
  const { user, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const [section, setSection] = useState<Section>('pending');
  const [loading, setLoading] = useState(true);
  const [pendingActs, setPendingActs] = useState<Act[]>([]);
  const [finalActs, setFinalActs] = useState<Act[]>([]);
  const [daysThreshold, setDaysThreshold] = useState(3);
  const [search, setSearch] = useState('');
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);
  const [emailAct, setEmailAct] = useState<Act | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login?next=/admin/reminders');
    if (!authLoading && user && user.role !== 'ADMIN') router.push('/guest');
  }, [user, authLoading, router]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pendingResponse, actsResponse] = await Promise.all([
        api.get(`/api/reminders/pending-acts?days_threshold=${daysThreshold}`),
        api.get('/api/acts?page=1&page_size=100'),
      ]);
      setPendingActs(Array.isArray(pendingResponse.data) ? pendingResponse.data : []);
      const acts = Array.isArray(actsResponse.data?.items) ? actsResponse.data.items : [];
      setFinalActs(acts.filter((act: Act) => finalStatuses.has(act.status)));
    } catch (error: unknown) {
      showToast(apiErrorMessage(error, 'Не удалось загрузить центр коммуникаций'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'ADMIN') void loadData();
  }, [user, daysThreshold]);

  const getPendingRecipients = (act: Act): PendingRecipient[] => {
    const recipients = act.extra_data_json?.recipients;
    if (Array.isArray(recipients)) {
      return recipients
        .filter(item => item && typeof item === 'object' && !(item as { signed_at?: string }).signed_at)
        .map(item => ({ full_name: String((item as { full_name?: string }).full_name || ''), email: String((item as { email?: string }).email || '') }));
    }
    return [{ full_name: act.party2_name, email: act.receiver_email }];
  };

  const sendReminder = async (act: Act) => {
    setSendingReminder(act.id);
    try {
      const response = await api.post(`/api/reminders/send-reminder/${act.id}`);
      showToast(response.data?.message || 'Напоминание поставлено в очередь', 'success');
    } catch (error: unknown) {
      showToast(apiErrorMessage(error, 'Не удалось отправить напоминание'), 'error');
    } finally {
      setSendingReminder(null);
    }
  };

  const actUrl = (act: Act) => act.template_code === 'IPAD' ? `/acts/ipad/${act.id}` : `/acts/${act.id}`;
  const title = (act: Act) => act.template_code === 'IPAD' ? `Advisory iPad: ${act.advisory_group || act.item_name}` : act.item_name;
  const normalizedSearch = search.trim().toLowerCase();
  const visibleFinalActs = finalActs.filter(act => !normalizedSearch || [title(act), act.party1_name, act.party2_name, act.receiver_email].some(value => String(value || '').toLowerCase().includes(normalizedSearch)));

  if (authLoading || !user || user.role !== 'ADMIN') return null;

  return <AdminLayout>
    <div className="mx-auto max-w-7xl">
      <PageHeader eyebrow="Администрирование" title="Коммуникации по актам" description="Единое место для ручных напоминаний и отправки финальных документов. Автоматическая отправка отключена." />

      <div className="mb-6 grid grid-cols-2 rounded-2xl bg-slate-100 p-1.5 shadow-inner">
        <button onClick={() => setSection('pending')} className={`min-h-14 rounded-xl px-4 text-left transition ${section === 'pending' ? 'bg-white shadow-sm' : 'text-slate-500'}`}><span className="block text-sm font-black">Требуют подписи</span><span className="text-xs">{pendingActs.length} актов для напоминания</span></button>
        <button onClick={() => setSection('finals')} className={`min-h-14 rounded-xl px-4 text-left transition ${section === 'finals' ? 'bg-white shadow-sm' : 'text-slate-500'}`}><span className="block text-sm font-black">Финальные документы</span><span className="text-xs">{finalActs.length} завершённых выдач</span></button>
      </div>

      {section === 'pending' ? <>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"><div><p className="font-black text-amber-900">Ручные напоминания</p><p className="text-sm text-amber-700">Письмо получат только участники, которые ещё не подписали акт.</p></div><div className="flex items-center gap-2"><span className="text-sm font-bold text-amber-900">Старше</span><select value={daysThreshold} onChange={event => setDaysThreshold(Number(event.target.value))} className="min-h-11 rounded-xl border border-amber-200 bg-white px-3 text-sm font-bold"><option value={1}>1 дня</option><option value={3}>3 дней</option><option value={7}>7 дней</option><option value={14}>14 дней</option><option value={30}>30 дней</option></select><button onClick={loadData} className="min-h-11 rounded-xl bg-amber-900 px-4 text-sm font-bold text-white">Обновить</button></div></div>
        {loading ? <Loading /> : pendingActs.length === 0 ? <Empty title="Просроченных подписей нет" text={`Нет актов без подписи старше ${daysThreshold} дней.`}/> : <div className="grid gap-3 lg:grid-cols-2">{pendingActs.map(act => {
          const recipients = getPendingRecipients(act);
          const days = Math.floor((Date.now() - new Date(act.created_at).getTime()) / 86_400_000);
          return <article key={act.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-lg font-black text-slate-900">{title(act)}</p><p className="mt-1 text-xs text-slate-400">ACT-{act.id.split('-')[0].toUpperCase()} · {new Date(act.issue_date).toLocaleDateString('ru-RU')}</p></div><span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${days >= 7 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{days} дн.</span></div><div className="mt-4 rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Ожидают подписи</p><div className="mt-2 space-y-1">{recipients.map(recipient => <p key={`${recipient.email}-${recipient.full_name}`} className="truncate text-sm text-slate-700"><span className="font-bold">{recipient.full_name}</span> · {recipient.email || 'нет email'}</p>)}</div></div><div className="mt-4 grid grid-cols-2 gap-2"><Link href={actUrl(act)} className="flex min-h-11 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-700">Открыть акт</Link><button disabled={sendingReminder === act.id || recipients.every(item => !item.email)} onClick={() => sendReminder(act)} className="min-h-11 rounded-xl bg-blue-600 text-sm font-black text-white disabled:opacity-40">{sendingReminder === act.id ? 'В очередь...' : 'Отправить напоминание'}</button></div></article>;
        })}</div>}
      </> : <>
        <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-black text-blue-950">Финалы отправляет только администратор</p><p className="text-sm text-blue-700">Для каждого акта отдельно выбираются документ, участники и сообщение.</p></div><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Найти акт или участника" className="min-h-11 w-full rounded-xl border border-blue-200 bg-white px-4 text-sm outline-none focus:border-blue-500 sm:w-72"/></div></div>
        {loading ? <Loading /> : visibleFinalActs.length === 0 ? <Empty title="Финальные документы не найдены" text="Завершите выдачу или измените поисковый запрос."/> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visibleFinalActs.map(act => <article key={act.id} className="flex min-h-56 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-black text-slate-900">{title(act)}</p><p className="mt-1 text-xs text-slate-400">ACT-{act.id.split('-')[0].toUpperCase()}</p></div><Status status={act.status}/></div><div className="mt-4 flex-1 space-y-1 text-sm text-slate-500"><p>Выдал: <span className="font-bold text-slate-700">{act.party1_name}</span></p><p>{act.template_code === 'IPAD' ? `Учеников: ${act.student_count || 0}` : `Получатель: ${act.party2_name}`}</p><p>Дата: {new Date(act.issue_date).toLocaleDateString('ru-RU')}</p></div><div className="mt-4 grid grid-cols-[1fr_auto] gap-2"><button onClick={() => setEmailAct(act)} className="min-h-11 rounded-xl bg-blue-600 px-3 text-sm font-black text-white">Отправки и история</button><Link href={actUrl(act)} className="flex min-h-11 items-center rounded-xl bg-slate-100 px-3 text-sm font-bold text-slate-600">Акт</Link></div></article>)}</div>}
      </>}
    </div>
    {emailAct && <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-950/70 p-3 sm:p-6"><div className="mx-auto max-w-3xl"><div className="mb-3 flex items-center justify-between rounded-2xl bg-white p-3"><div className="min-w-0 px-2"><p className="truncate font-black">{title(emailAct)}</p><p className="text-xs text-slate-400">ACT-{emailAct.id.split('-')[0].toUpperCase()}</p></div><button onClick={() => setEmailAct(null)} className="min-h-11 rounded-xl bg-slate-100 px-4 text-sm font-bold">Закрыть</button></div><ManualFinalEmail actId={emailAct.id}/></div></div>}
  </AdminLayout>;
}

function Loading() { return <div className="rounded-2xl bg-white p-12 text-center text-sm text-slate-400 shadow-sm">Загрузка коммуникаций...</div>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center"><p className="font-black text-slate-700">{title}</p><p className="mt-1 text-sm text-slate-400">{text}</p></div>; }
function Status({ status }: { status: string }) { const returned = status === 'RETURNED'; return <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${returned ? 'bg-slate-200 text-slate-700' : 'bg-emerald-100 text-emerald-700'}`}>{returned ? 'Возвращено' : status.startsWith('RETURN') ? 'Идёт возврат' : 'Выдано'}</span>; }
function apiErrorMessage(error: unknown, fallback: string): string { const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail; return typeof detail === 'string' ? detail : fallback; }
