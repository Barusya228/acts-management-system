'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
import ManualFinalEmailModal from '@/components/ManualFinalEmailModal';
import StatusPill from '@/components/ui/StatusPill';
import { getActStatusLabel } from '@/lib/actStatus';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import api from '@/lib/api';
import { apiErrorMessage } from '@/lib/apiError';

interface Act {
  id: string;
  item_name: string;
  party1_name: string;
  party2_name: string;
  receiver_email: string;
  status: string;
  issue_date: string;
  template_code?: string | null;
  advisory_group?: string | null;
  student_count?: number | null;
  issue_completion_email_sent?: boolean;
  return_completion_email_sent?: boolean;
  final_email_last_sent_at?: string | null;
}

const finalStatuses = new Set(['COMPLETED', 'RETURN_INITIATED', 'RETURN_SIGNED_PARTY1', 'RETURN_SIGNED_PARTY2', 'RETURNED']);

const actUrl = (act: Act) => act.template_code === 'IPAD' ? `/acts/ipad/${act.id}` : `/acts/${act.id}`;
const actTitle = (act: Act) => act.template_code === 'IPAD' ? `Advisory iPad: ${act.advisory_group || act.item_name}` : act.item_name;
const actIcon = (act: Act) => act.template_code === 'IPAD' ? '📱' : '💻';
const shortId = (act: Act) => `ACT-${act.id.split('-')[0].toUpperCase()}`;

// Для возвращённого акта финальным считается письмо о возврате,
// для выданного — письмо о завершении выдачи.
const emailSent = (act: Act) => act.status === 'RETURNED'
  ? Boolean(act.return_completion_email_sent)
  : Boolean(act.issue_completion_email_sent);

export default function AdminDocumentDispatchPage() {
  const { user, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [finalActs, setFinalActs] = useState<Act[]>([]);
  const [search, setSearch] = useState('');
  const [emailAct, setEmailAct] = useState<Act | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login?next=/admin/reminders');
    if (!authLoading && user && user.role !== 'ADMIN') router.push('/guest');
  }, [user, authLoading, router]);

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/acts?page=1&page_size=100');
      const acts = Array.isArray(response.data?.items) ? response.data.items : [];
      setFinalActs(acts.filter((act: Act) => finalStatuses.has(act.status)));
    } catch (error: unknown) {
      showToast(apiErrorMessage(error, 'Не удалось загрузить финальные документы'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'ADMIN') void loadData();
  }, [user]);

  const openPdf = async (act: Act) => {
    try {
      const response = await api.get(`/api/acts/${act.id}/preview/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error: unknown) {
      showToast(apiErrorMessage(error, 'Не удалось открыть PDF'), 'error');
    }
  };

  const closeEmailModal = () => {
    setEmailAct(null);
    // Флаги отправки могли измениться — обновляем таблицу.
    void loadData();
  };

  const normalizedSearch = search.trim().toLowerCase();
  const visibleActs = finalActs.filter(act => !normalizedSearch
    || [actTitle(act), act.party1_name, act.party2_name, act.receiver_email, shortId(act)]
      .some(value => String(value || '').toLowerCase().includes(normalizedSearch)));

  if (authLoading || !user || user.role !== 'ADMIN') return null;

  return <AdminLayout>
    <div className="mx-auto max-w-7xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <input
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Поиск по акту, получателю или номеру..."
          className="min-h-11 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 sm:w-96"
        />
        <span className="text-sm text-slate-500">Документов: {visibleActs.length}</span>
      </div>

      {loading ? (
        <div className="rounded-2xl bg-white p-12 text-center text-sm text-slate-400 shadow-sm">Загрузка документов...</div>
      ) : visibleActs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="font-black text-slate-700">Финальные документы не найдены</p>
          <p className="mt-1 text-sm text-slate-400">Завершите выдачу или измените поисковый запрос.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[760px] text-left text-sm">
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
              {visibleActs.map(act => (
                <tr key={act.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
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
                    <span className="block truncate text-slate-700">
                      {act.template_code === 'IPAD' ? `${act.student_count || 0} учеников` : act.party2_name}
                    </span>
                    <span className="block truncate text-xs text-slate-400">Выдал: {act.party1_name}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{new Date(act.issue_date).toLocaleDateString('ru-RU')}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <StatusPill status={act.status} label={getActStatusLabel(act.status)} />
                  </td>
                  <td className="px-4 py-3">
                    {emailSent(act) || act.final_email_last_sent_at ? (
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
                      <button
                        type="button"
                        onClick={() => setEmailAct(act)}
                        className="min-h-11 whitespace-nowrap rounded-xl bg-blue-600 px-2.5 text-sm font-black text-white transition hover:bg-blue-700 lg:px-3"
                      >
                        ✉ Отправить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>

    {emailAct && (
      <ManualFinalEmailModal actId={emailAct.id} title={actTitle(emailAct)} reference={shortId(emailAct)} onClose={closeEmailModal} />
    )}
  </AdminLayout>;
}
