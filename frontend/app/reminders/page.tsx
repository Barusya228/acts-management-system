'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import PageHeader from '@/components/ui/PageHeader';
import SurfaceCard from '@/components/ui/SurfaceCard';
import api from '@/lib/api';

interface Act {
  id: string;
  item_name: string;
  item_serial: string;
  party1_name: string;
  party2_name: string;
  receiver_email: string;
  status: string;
  issue_date: string;
  created_at: string;
  extra_data_json?: Record<string, unknown>;
}

interface PendingRecipient {
  full_name: string;
  email: string;
}

export default function RemindersPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [pendingActs, setPendingActs] = useState<Act[]>([]);
  const [daysThreshold, setDaysThreshold] = useState(3);
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role !== 'ADMIN') {
      router.push('/');
      return;
    }
    fetchPendingActs();
  }, [user, router, daysThreshold]);

  const fetchPendingActs = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/api/reminders/pending-acts?days_threshold=${daysThreshold}`);
      setPendingActs(res.data);
    } catch (err) {
      console.error('Failed to fetch pending acts:', err);
    } finally {
      setLoading(false);
    }
  };

  const getPendingRecipients = (act: Act): PendingRecipient[] => {
    const recipients = act.extra_data_json?.recipients;
    if (Array.isArray(recipients)) {
      return recipients
        .filter((r: unknown) => typeof r === 'object' && r !== null && !(r as { signed_at?: string }).signed_at)
        .map((r: unknown) => ({
          full_name: String((r as { full_name?: string }).full_name || ''),
          email: String((r as { email?: string }).email || ''),
        }));
    }
    return [{ full_name: act.party2_name, email: act.receiver_email }];
  };

  const getDaysOverdue = (createdAt: string): number => {
    const created = new Date(createdAt);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  };

  const sendReminder = async (actId: string) => {
    try {
      setSendingReminder(actId);
      await api.post(`/api/reminders/send-reminder/${actId}`);
      alert('Напоминание отправлено получателям');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Не удалось отправить напоминание';
      alert(errorMessage);
    } finally {
      setSendingReminder(null);
    }
  };

  if (!user || user.role !== 'ADMIN') {
    return null;
  }

  return (
    <Layout>
      <div className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="Администрирование"
          title="Напоминания о неподписанных актах"
          description="Акты, которые висят без подписи больше указанного количества дней. Отправьте напоминание получателям."
        />

        <SurfaceCard className="mb-6 p-4">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">Показать акты старше:</label>
            <select
              value={daysThreshold}
              onChange={(e) => setDaysThreshold(Number(e.target.value))}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={1}>1 день</option>
              <option value={3}>3 дня</option>
              <option value={7}>7 дней</option>
              <option value={14}>14 дней</option>
              <option value={30}>30 дней</option>
            </select>
            <button
              onClick={fetchPendingActs}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
            >
              Обновить
            </button>
          </div>
        </SurfaceCard>

        {loading ? (
          <div className="text-center py-10">Загрузка...</div>
        ) : pendingActs.length === 0 ? (
          <SurfaceCard className="p-6 text-center">
            <p className="text-gray-600">Нет актов, ожидающих подписи больше {daysThreshold} дней</p>
          </SurfaceCard>
        ) : (
          <div className="space-y-4">
            {pendingActs.map((act) => {
              const pendingRecipients = getPendingRecipients(act);
              const daysOverdue = getDaysOverdue(act.created_at);

              return (
                <SurfaceCard key={act.id} className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="mb-2 flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-gray-900">{act.item_name}</h3>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${
                            daysOverdue >= 7
                              ? 'bg-red-100 text-red-800'
                              : daysOverdue >= 3
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {daysOverdue} дней без подписи
                        </span>
                      </div>

                      <div className="mb-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                        <div>
                          <span className="text-gray-500">Серийный номер:</span>{' '}
                          <span className="font-medium text-gray-900">{act.item_serial || '—'}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Дата выдачи:</span>{' '}
                          <span className="font-medium text-gray-900">{act.issue_date}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Передающая сторона:</span>{' '}
                          <span className="font-medium text-gray-900">{act.party1_name}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Создан:</span>{' '}
                          <span className="font-medium text-gray-900">
                            {new Date(act.created_at).toLocaleDateString('ru-RU')}
                          </span>
                        </div>
                      </div>

                      <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                        <p className="mb-2 text-sm font-medium text-gray-700">
                          Ожидают подписи ({pendingRecipients.length}):
                        </p>
                        <div className="space-y-1">
                          {pendingRecipients.map((recipient, index) => (
                            <div key={index} className="text-sm text-gray-600">
                              • {recipient.full_name} ({recipient.email})
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => router.push(`/acts/${act.id}`)}
                        className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        Открыть акт
                      </button>
                      <button
                        onClick={() => sendReminder(act.id)}
                        disabled={sendingReminder === act.id}
                        className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                      >
                        {sendingReminder === act.id ? 'Отправка...' : 'Отправить напоминание'}
                      </button>
                    </div>
                  </div>
                </SurfaceCard>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
