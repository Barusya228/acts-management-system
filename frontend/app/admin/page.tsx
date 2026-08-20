'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';

interface Dashboard {
  acts: { pending: number; completed: number; return_in_progress: number };
  ipads: { available: number; issued: number; reserved: number; return_pending: number; maintenance: number; retired: number };
  devices: { available: number; issued: number };
  recent_actions: { id: string; actor: string | null; action: string; entity_type: string; created_at: string }[];
}

const actionLabels: Record<string, string> = {
  ACT_CREATED: 'Создан акт',
  ACT_DELETED: 'Удалён акт',
  ACT_SIGNED_PARTY1: 'Подписал IT',
  ACT_SIGNED_PARTY2: 'Подписал получатель',
  IPAD_ACT_CREATED: 'Создан iPad-акт',
  IPAD_APPENDIX_CREATED: 'Создано приложение',
  IPAD_APPENDIX_APPLIED: 'Применено приложение',
  KIOSK_ENROLLED: 'Планшет привязан',
  KIOSK_REVOKED: 'Планшет отозван',
  MANUAL_FINAL_EMAIL_QUEUED: 'Отправлено письмо',
};

export default function AdminDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<Dashboard | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login?next=/admin');
    if (!authLoading && user && user.role !== 'ADMIN') router.push('/guest');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user?.role !== 'ADMIN') return;
    api.get('/api/analytics/dashboard')
      .then(response => setData(response.data))
      .catch(() => setData(null));
  }, [user]);

  if (authLoading || !user || user.role !== 'ADMIN') return null;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-7xl">
        <div className="mb-5">
          <h1 className="text-xl font-bold text-slate-900 md:text-2xl">Главная</h1>
          <p className="mt-1 text-sm text-slate-500">Состояние системы на текущий момент.</p>
        </div>

        {!data ? (
          <div className="rounded-2xl bg-white p-12 text-center text-sm text-slate-400 shadow-sm">Загрузка сводки...</div>
        ) : (
          <div className="space-y-5">
            {/* Акты */}
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Link href="/admin/acts" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 transition hover:shadow-md">
                <p className="text-sm text-amber-700">Ожидают подписи</p>
                <p className="mt-1 text-3xl font-black text-amber-800">{data.acts.pending}</p>
              </Link>
              <Link href="/admin/acts" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 transition hover:shadow-md">
                <p className="text-sm text-emerald-700">Техника на руках</p>
                <p className="mt-1 text-3xl font-black text-emerald-800">{data.acts.completed}</p>
              </Link>
              <Link href="/admin/acts" className="rounded-2xl border border-orange-200 bg-orange-50 p-4 transition hover:shadow-md">
                <p className="text-sm text-orange-700">Идёт возврат</p>
                <p className="mt-1 text-3xl font-black text-orange-800">{data.acts.return_in_progress}</p>
              </Link>
            </section>

            {/* iPad-парк */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-bold text-slate-800">📱 iPad-парк</h2>
                <Link href="/admin/inventory" className="text-sm font-bold text-blue-600 hover:text-blue-700">Открыть технику →</Link>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Stat label="Доступно" value={data.ipads.available} tone="text-emerald-700" />
                <Stat label="Выдано" value={data.ipads.issued} tone="text-blue-700" />
                <Stat label="Зарезервировано" value={data.ipads.reserved} tone="text-amber-700" />
                <Stat label="Ожидают возврата" value={data.ipads.return_pending} tone="text-violet-700" />
                <Stat label="Косячные" value={data.ipads.maintenance} tone="text-red-700" />
                <Stat label="Списано" value={data.ipads.retired} tone="text-slate-500" />
              </div>
            </section>

            {/* Техника + последние действия */}
            <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="mb-3 font-bold text-slate-800">💻 Прочая техника</h2>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Доступно" value={data.devices.available} tone="text-emerald-700" />
                  <Stat label="Выдано" value={data.devices.issued} tone="text-blue-700" />
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-bold text-slate-800">🕐 Последние действия</h2>
                  <Link href="/admin/audit" className="text-sm font-bold text-blue-600 hover:text-blue-700">Весь журнал →</Link>
                </div>
                {data.recent_actions.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-400">Событий пока нет</p>
                ) : (
                  <div className="space-y-2">
                    {data.recent_actions.map(item => (
                      <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
                        <span className="min-w-0 truncate text-sm text-slate-700">
                          <span className="font-bold">{item.actor || 'Система'}</span>
                          {' · '}
                          {actionLabels[item.action] || item.action.replace(/_/g, ' ').toLowerCase()}
                        </span>
                        <span className="shrink-0 text-xs text-slate-400">
                          {new Date(item.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-0.5 text-2xl font-black ${tone}`}>{value}</p>
    </div>
  );
}
