'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
import PageHeader from '@/components/ui/PageHeader';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

interface BackupItem {
  id: string;
  act_id: string;
  act_title: string;
  party2_name?: string | null;
  version_number: number;
  destination: string;
  backup_path?: string | null;
  size_bytes?: number | null;
  sha256?: string | null;
  status: 'SUCCESS' | 'FAILED' | 'STALE';
  error_message?: string | null;
  created_at: string;
}

interface BackupOverview {
  enabled: boolean;
  destination: string;
  total: number;
  successful: number;
  failed: number;
  last_success_at?: string | null;
  items: BackupItem[];
}

const formatDate = (value?: string | null) => value
  ? new Date(value).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
  : 'Ещё не выполнялся';

const formatSize = (value?: number | null) => {
  if (!value) return '—';
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} КБ`;
  return `${(value / (1024 * 1024)).toFixed(1)} МБ`;
};

export default function BackupsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();
  const [data, setData] = useState<BackupOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const loadBackups = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/admin/backups?page_size=100');
      setData(response.data);
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Не удалось загрузить историю бэкапов', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (user && user.role !== 'ADMIN') router.push('/guest');
  }, [user, router]);

  useEffect(() => {
    if (user?.role === 'ADMIN') loadBackups();
  }, [user, loadBackups]);

  const runSync = async () => {
    setSyncing(true);
    try {
      const response = await api.post('/api/admin/backups/sync');
      const result = response.data;
      showToast(`Скопировано: ${result.copied}, ошибок: ${result.failed}`, result.failed ? 'error' : 'success');
      await loadBackups();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Не удалось выполнить бэкап', 'error');
    } finally {
      setSyncing(false);
    }
  };

  if (!user || user.role !== 'ADMIN') return null;

  return (
    <AdminLayout>
      <PageHeader
        eyebrow="Хранение"
        title="Бэкапы PDF"
        description="Финальные PDF выдачи и возврата в Google Drive."
        actions={(
          <button
            type="button"
            onClick={runSync}
            disabled={syncing || !data?.enabled}
            className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-900 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {syncing ? 'Копирование...' : 'Скопировать финальные PDF'}
          </button>
        )}
      />

      {loading ? (
        <div className="rounded-2xl bg-white p-12 text-center text-sm text-slate-500 shadow-sm">Загрузка истории...</div>
      ) : data ? (
        <div className="space-y-5">
          {!data.enabled && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Бэкап отключён. Укажите `PDF_BACKUP_ENABLED=true` и путь Google Drive в `.env`, затем пересоздайте backend.
            </div>
          )}

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Назначение" value={data.destination} hint={data.enabled ? 'Подключено' : 'Отключено'} tone={data.enabled ? 'emerald' : 'amber'} />
            <SummaryCard label="Последний успешный" value={formatDate(data.last_success_at)} hint="Проверен SHA-256" tone="blue" />
            <SummaryCard label="Сохранено копий" value={String(data.successful)} hint="Только выдача и возврат" tone="emerald" />
            <SummaryCard label="Ошибок" value={String(data.failed)} hint={data.failed ? 'Требуют повторной синхронизации' : 'Проблем нет'} tone={data.failed ? 'rose' : 'slate'} />
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="font-bold text-slate-900">История копирования</h2>
              <p className="mt-1 text-xs text-slate-500">Копии создаются после полного завершения выдачи и после полного возврата.</p>
            </div>
            {data.items.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-400">История пока пуста.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {data.items.map((item) => (
                  <div key={item.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_auto] md:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${item.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-700' : item.status === 'STALE' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                          {item.status === 'SUCCESS' ? 'Сохранено' : item.status === 'STALE' ? 'Устарело' : 'Ошибка'}
                        </span>
                        <span className="text-xs text-slate-400">Версия {item.version_number}</span>
                        <span className="text-xs text-slate-400">{formatDate(item.created_at)}</span>
                      </div>
                      <p className="mt-2 truncate font-semibold text-slate-800">{item.act_title}</p>
                      {item.party2_name && <p className="truncate text-xs text-slate-500">Получатель: {item.party2_name}</p>}
                      {item.status === 'SUCCESS' ? (
                        <p className="mt-1 truncate text-xs text-slate-400">{item.backup_path}</p>
                      ) : (
                        <p className={`mt-1 text-xs ${item.status === 'STALE' ? 'text-amber-700' : 'text-rose-600'}`}>
                          {item.status === 'STALE' ? 'Копия отсутствует или не прошла проверку.' : item.error_message || 'Неизвестная ошибка'}
                        </p>
                      )}
                    </div>
                    <div className="text-left md:text-right">
                      <p className="text-sm font-semibold text-slate-700">{formatSize(item.size_bytes)}</p>
                      {item.sha256 && <p className="mt-1 font-mono text-[10px] text-slate-400" title={item.sha256}>{item.sha256.slice(0, 12)}...</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </AdminLayout>
  );
}

function SummaryCard({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: 'emerald' | 'amber' | 'blue' | 'rose' | 'slate' }) {
  const tones = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    blue: 'border-blue-200 bg-blue-50 text-blue-800',
    rose: 'border-rose-200 bg-rose-50 text-rose-800',
    slate: 'border-slate-200 bg-slate-50 text-slate-800',
  };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="mt-1 break-words text-lg font-bold">{value}</p>
      <p className="mt-1 text-xs opacity-70">{hint}</p>
    </div>
  );
}
