'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
import PageHeader from '@/components/ui/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import api from '@/lib/api';

interface Kiosk {
  id: string;
  name: string;
  status: 'PENDING' | 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  enrollment_code?: string | null;
  enrolled_at?: string | null;
  last_seen_at?: string | null;
}

const statusMeta: Record<Kiosk['status'], { label: string; cls: string }> = {
  PENDING: { label: 'Ожидает привязки', cls: 'bg-amber-100 text-amber-800' },
  ACTIVE: { label: 'Активно', cls: 'bg-emerald-100 text-emerald-800' },
  REVOKED: { label: 'Отозвано', cls: 'bg-slate-200 text-slate-600' },
  EXPIRED: { label: 'Код истёк', cls: 'bg-red-100 text-red-700' },
};

export default function KiosksPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();
  const [kiosks, setKiosks] = useState<Kiosk[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<Kiosk | null>(null);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    if (user && user.role !== 'ADMIN') router.push('/guest');
  }, [user, router]);

  const load = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/auth/kiosks');
      setKiosks(Array.isArray(response.data) ? response.data : []);
    } catch {
      showToast('Не удалось загрузить устройства', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'ADMIN') void load();
  }, [user]);

  const create = async () => {
    if (!name.trim()) { showToast('Укажите название устройства', 'error'); return; }
    setCreating(true);
    try {
      await api.post('/api/auth/kiosks', { name: name.trim() });
      setName('');
      await load();
      showToast('Код привязки создан. Введите его на планшете в течение 10 минут.', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Не удалось создать код', 'error');
    } finally {
      setCreating(false);
    }
  };

  const revoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await api.delete(`/api/auth/kiosks/${revokeTarget.id}`);
      setRevokeTarget(null);
      await load();
      showToast('Устройство отозвано. Его токен больше не действует.', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Не удалось отозвать устройство', 'error');
    } finally {
      setRevoking(false);
    }
  };

  if (!user || user.role !== 'ADMIN') return null;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl">
        <PageHeader
          eyebrow="Безопасность"
          title="Устройства подписания"
          description="Только привязанные планшеты могут открывать акты и собирать подписи. Отзыв устройства мгновенно блокирует его токен."
        />

        <section className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <p className="font-black text-blue-950">Добавить планшет</p>
          <p className="mt-1 text-sm text-blue-700">Создайте код, откройте на планшете страницу /kiosk и введите его.</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="Например: iPad кабинет С314"
              className="min-h-12 flex-1 rounded-xl border border-blue-200 bg-white px-4 text-sm outline-none focus:border-blue-500"
            />
            <button
              disabled={creating}
              onClick={create}
              className="min-h-12 rounded-xl bg-blue-600 px-6 text-sm font-black text-white disabled:opacity-50"
            >
              {creating ? 'Создание...' : 'Создать код привязки'}
            </button>
          </div>
        </section>

        {loading ? (
          <div className="rounded-2xl bg-white p-12 text-center text-sm text-slate-400 shadow-sm">Загрузка устройств...</div>
        ) : kiosks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <p className="font-black text-slate-700">Устройств пока нет</p>
            <p className="mt-1 text-sm text-slate-400">Создайте первый код привязки для планшета в кабинете.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {kiosks.map(kiosk => (
              <article key={kiosk.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-black text-slate-900">{kiosk.name}</p>
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${statusMeta[kiosk.status].cls}`}>{statusMeta[kiosk.status].label}</span>
                  </div>
                  <div className="mt-1 space-y-0.5 text-xs text-slate-500">
                    {kiosk.enrolled_at && <p>Привязано: {new Date(kiosk.enrolled_at).toLocaleString('ru-RU')}</p>}
                    {kiosk.last_seen_at && <p>Последняя активность: {new Date(kiosk.last_seen_at).toLocaleString('ru-RU')}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {kiosk.status === 'PENDING' && kiosk.enrollment_code && (
                    <span className="rounded-xl bg-slate-900 px-4 py-2 font-mono text-lg font-black tracking-[0.2em] text-white">{kiosk.enrollment_code}</span>
                  )}
                  {kiosk.status !== 'REVOKED' && (
                    <button
                      onClick={() => setRevokeTarget(kiosk)}
                      className="min-h-11 rounded-xl bg-red-50 px-4 text-sm font-bold text-red-700 hover:bg-red-100"
                    >
                      Отозвать
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {revokeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <p className="text-xs font-bold uppercase tracking-widest text-red-600">Подтверждение</p>
            <h2 className="mt-2 text-xl font-black">Отозвать устройство?</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Планшет <span className="font-bold">{revokeTarget.name}</span> сразу потеряет доступ к актам.
              Чтобы вернуть его в работу, потребуется новый код привязки.
            </p>
            <div className="mt-6 flex gap-3">
              <button disabled={revoking} onClick={revoke} className="min-h-12 flex-1 rounded-xl bg-red-600 font-black text-white disabled:opacity-50">
                {revoking ? 'Отзыв...' : 'Отозвать'}
              </button>
              <button disabled={revoking} onClick={() => setRevokeTarget(null)} className="min-h-12 rounded-xl bg-slate-100 px-5 font-bold">Отмена</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
