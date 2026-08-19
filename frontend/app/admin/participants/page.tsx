'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

type ParticipantKind = 'IT_MANAGER' | 'EMPLOYEE' | 'BOTH';

interface Participant {
  id: string;
  full_name: string;
  email?: string | null;
  department?: string | null;
  title?: string | null;
  sticker_emoji?: string | null;
  kind: ParticipantKind;
  employment_status: 'ACTIVE' | 'DEPARTED';
  is_active: boolean;
}

interface AdSyncResult {
  status: 'success' | 'disabled' | 'error';
  imported?: number;
  updated?: number;
  skipped?: number;
  errors?: number;
  departed?: number;
  reactivated?: number;
  reason?: string;
}

const emptyForm = { full_name: '', email: '', department: '', title: '', sticker_emoji: '👤', kind: 'EMPLOYEE' as ParticipantKind };

const kindOptions: { value: ParticipantKind; label: string }[] = [
  { value: 'IT_MANAGER', label: 'IT / Выдающий' },
  { value: 'EMPLOYEE', label: 'Сотрудник / Получатель' },
  { value: 'BOTH', label: 'Универсал' },
];

const kindBadge = (k: ParticipantKind) => {
  const map: Record<string, string> = { IT_MANAGER: 'bg-sky-100 text-sky-700', EMPLOYEE: 'bg-amber-100 text-amber-700', BOTH: 'bg-violet-100 text-violet-700' };
  return map[k] || 'bg-gray-100 text-gray-700';
};

const kindShort = (k: ParticipantKind) => {
  const map: Record<string, string> = { IT_MANAGER: 'IT', EMPLOYEE: 'Сотр.', BOTH: 'Унив.' };
  return map[k] || k;
};

export default function ParticipantsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();
  const [items, setItems] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<'ALL' | ParticipantKind>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE' | 'DEPARTED'>('ALL');

  // Add/Edit modal
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  // AD sync
  const [adSyncLoading, setAdSyncLoading] = useState(false);
  const [adSyncResult, setAdSyncResult] = useState<AdSyncResult | null>(null);

  useEffect(() => {
    if (user && user.role !== 'ADMIN') { router.push('/guest'); }
  }, [user, router]);

  useEffect(() => {
    if (user?.role === 'ADMIN') fetchParticipants();
  }, [user]);

  const fetchParticipants = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/participants');
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch {
      showToast('Ошибка загрузки участников', 'error');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowFormModal(true);
  };

  const openEdit = (p: Participant) => {
    setEditingId(p.id);
    setForm({
      full_name: p.full_name,
      email: p.email || '',
      department: p.department || '',
      title: p.title || '',
      sticker_emoji: p.sticker_emoji || '👤',
      kind: p.kind,
    });
    setShowFormModal(true);
  };

  const handleSubmit = async () => {
    const trimmed = form.full_name.trim();
    if (!trimmed) { showToast('Введите ФИО', 'error'); return; }
    setSaving(true);
    try {
      const payload = {
        full_name: trimmed,
        email: form.email.trim() || null,
        department: form.department.trim() || null,
        title: form.title.trim() || null,
        sticker_emoji: form.sticker_emoji.trim() || null,
        kind: form.kind,
      };
      if (editingId) {
        await api.patch(`/api/participants/${editingId}`, payload);
        showToast('Участник обновлён', 'success');
      } else {
        await api.post('/api/participants', payload);
        showToast('Участник добавлен', 'success');
      }
      setShowFormModal(false);
      await fetchParticipants();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Ошибка сохранения', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (p: Participant) => {
    if (p.employment_status === 'DEPARTED') return;
    try {
      await api.patch(`/api/participants/${p.id}`, { is_active: !p.is_active });
      showToast(p.is_active ? 'Деактивирован' : 'Активирован', 'success');
      await fetchParticipants();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Ошибка', 'error');
    }
  };

  const handleAdSync = async () => {
    setAdSyncLoading(true);
    setAdSyncResult(null);
    try {
      const res = await api.post('/api/admin/ad-sync/run');
      setAdSyncResult(res.data as AdSyncResult);
      if (res.data.status === 'success') {
        await fetchParticipants();
      }
    } catch (err: any) {
      setAdSyncResult({ status: 'error', reason: err.response?.data?.detail || 'Ошибка' });
    } finally {
      setAdSyncLoading(false);
    }
  };

  const filtered = items.filter(p => {
    const s = search.toLowerCase();
    if (s && !p.full_name.toLowerCase().includes(s) && !(p.department || '').toLowerCase().includes(s)) return false;
    if (kindFilter !== 'ALL') {
      const matchesKind = kindFilter === 'IT_MANAGER'
        ? p.kind === 'IT_MANAGER' || p.kind === 'BOTH'
        : kindFilter === 'EMPLOYEE'
          ? p.kind === 'EMPLOYEE' || p.kind === 'BOTH'
          : p.kind === 'BOTH';
      if (!matchesKind) return false;
    }
    if (statusFilter === 'DEPARTED') return p.employment_status === 'DEPARTED';
    if (statusFilter === 'ACTIVE') return p.employment_status === 'ACTIVE' && p.is_active;
    if (statusFilter === 'INACTIVE') return p.employment_status === 'ACTIVE' && !p.is_active;
    return true;
  });

  if (!user || user.role !== 'ADMIN') return null;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-7xl">
        {/* Filters */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input type="text" placeholder="Поиск по имени или отделу..." value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
          <select value={kindFilter} onChange={e => setKindFilter(e.target.value as any)}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none transition focus:border-blue-400">
            <option value="ALL">Все роли</option>
            <option value="IT_MANAGER">IT / Выдающий</option>
            <option value="EMPLOYEE">Сотрудник / Получатель</option>
            <option value="BOTH">Универсал</option>
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none transition focus:border-blue-400">
            <option value="ALL">Все статусы</option>
            <option value="ACTIVE">Активные</option>
            <option value="INACTIVE">Неактивные</option>
            <option value="DEPARTED">Выбывшие</option>
          </select>
        </div>

        {/* AD Sync section */}
        <div className="mb-6 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-bold text-slate-800">Синхронизация с Active Directory</h2>
              <p className="mt-1 text-sm text-slate-500">Загрузка участников из AD. Новые добавляются, существующие обновляются.</p>
            </div>
            <div className="flex items-center gap-3">
              {adSyncResult && (
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${adSyncResult.status === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {adSyncResult.status === 'success' ? 'Выполнено' : adSyncResult.status === 'disabled' ? 'Отключено' : 'Ошибка'}
                </span>
              )}
              <button onClick={handleAdSync} disabled={adSyncLoading}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50">
                {adSyncLoading ? 'Синхронизация...' : 'Запустить'}
              </button>
            </div>
          </div>
          {adSyncResult && (
            adSyncResult.status === 'success' ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-800">Синхронизация завершена</p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                  <SyncStat label="Добавлено" value={adSyncResult.imported ?? 0} className="text-emerald-700" />
                  <SyncStat label="Обновлено" value={adSyncResult.updated ?? 0} className="text-blue-700" />
                  <SyncStat label="Выбыло" value={adSyncResult.departed ?? 0} className="text-amber-700" />
                  <SyncStat label="Вернулось" value={adSyncResult.reactivated ?? 0} className="text-violet-700" />
                  <SyncStat label="Пропущено" value={adSyncResult.skipped ?? 0} className="text-slate-600" />
                  <SyncStat label="Ошибок" value={adSyncResult.errors ?? 0} className={adSyncResult.errors ? 'text-red-700' : 'text-emerald-700'} />
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                {adSyncResult.reason || 'Не удалось выполнить синхронизацию с Active Directory.'}
              </div>
            )
          )}
        </div>

        {/* Participants table */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-slate-500">Людей: {filtered.length}</span>
          <button
            type="button"
            onClick={openCreate}
            className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700"
          >
            + Добавить
          </button>
        </div>
        {loading ? (
          <div className="rounded-2xl bg-white px-5 py-16 text-center shadow-sm">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
            <p className="text-sm text-slate-500">Загрузка участников...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <p className="font-black text-slate-700">Никого не найдено</p>
            <p className="mt-1 text-sm text-slate-400">Измените фильтры или добавьте участника.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Сотрудник</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Отдел / должность</th>
                  <th className="px-4 py-3 font-semibold">Роль</th>
                  <th className="px-4 py-3 font-semibold">Статус</th>
                  <th className="px-4 py-3 text-right font-semibold">Действия</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} className={`border-b border-slate-100 last:border-b-0 hover:bg-slate-50 ${p.employment_status === 'DEPARTED' ? 'bg-amber-50/40' : !p.is_active ? 'opacity-60' : ''}`}>
                    <td className="max-w-[240px] px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 text-lg" aria-hidden>{p.sticker_emoji || '👤'}</span>
                        <span className="truncate font-bold text-slate-900">{p.full_name}</span>
                      </div>
                    </td>
                    <td className="max-w-[220px] px-4 py-3">
                      <span className="block truncate text-slate-600">{p.email || '—'}</span>
                    </td>
                    <td className="max-w-[200px] px-4 py-3">
                      <span className="block truncate text-slate-700">{p.department || '—'}</span>
                      {p.title && <span className="block truncate text-xs text-slate-400">{p.title}</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${kindBadge(p.kind)}`}>{kindShort(p.kind)}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {p.employment_status === 'DEPARTED' ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">Выбыл</span>
                      ) : (
                        <button
                          onClick={() => handleToggleActive(p)}
                          title={p.is_active ? 'Деактивировать' : 'Активировать'}
                          className={`relative h-6 w-11 rounded-full transition ${p.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`}
                        >
                          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${p.is_active ? 'left-[22px]' : 'left-0.5'}`} />
                        </button>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex justify-end">
                        <button
                          onClick={() => openEdit(p)}
                          className="min-h-11 rounded-xl bg-slate-100 px-3 text-sm font-bold text-slate-700 transition hover:bg-blue-100 hover:text-blue-700"
                        >
                          ✎ Изменить
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

      {/* Add/Edit Modal */}
      {showFormModal && (
        <Modal onClose={() => setShowFormModal(false)} title={editingId ? 'Редактировать участника' : 'Добавить участника'}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">ФИО *</label>
              <input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400" placeholder="Иванов Иван Иванович" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
              <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400" placeholder="ivan@company.kz" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Отдел</label>
                <input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400" placeholder="IT" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Должность</label>
                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400" placeholder="Инженер" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Эмодзи</label>
              <input value={form.sticker_emoji} onChange={e => setForm({ ...form, sticker_emoji: e.target.value })}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400" placeholder="👤" maxLength={4} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Роль</label>
              <div className="flex gap-2">
                {kindOptions.map(o => (
                  <button key={o.value} type="button" onClick={() => setForm({ ...form, kind: o.value })}
                    className={`flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition ${form.kind === o.value ? 'border-slate-900 bg-slate-900 text-white' : 'border-gray-200 text-slate-600 hover:border-gray-300'}`}>{o.label}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-6 flex gap-3">
            <button onClick={handleSubmit} disabled={saving}
              className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-50">{saving ? 'Сохранение...' : editingId ? 'Сохранить' : 'Добавить'}</button>
            <button onClick={() => setShowFormModal(false)}
              className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-200">Отмена</button>
          </div>
        </Modal>
      )}

    </AdminLayout>
  );
}

function SyncStat({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className="rounded-lg bg-white px-3 py-2 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-0.5 text-xl font-bold ${className}`}>{value}</p>
    </div>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:text-gray-600">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
