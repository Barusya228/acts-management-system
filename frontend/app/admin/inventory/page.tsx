'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import PageHeader from '@/components/ui/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

interface Device {
  id: string;
  inventory_number: string;
  barcode?: string | null;
  name: string;
  model?: string | null;
  category: string;
  serial_number: string;
  status: string;
  location?: string | null;
  assigned_to?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

interface InventoryCategory {
  id: string;
  code: string;
  name: string;
  icon: string;
  is_active: boolean;
  is_system: boolean;
}

const statusOptions = [
  { value: 'available', label: 'На складе', cls: 'bg-emerald-100 text-emerald-700' },
  { value: 'issued', label: 'Выдано', cls: 'bg-amber-100 text-amber-700' },
  { value: 'maintenance', label: 'Обслуживание', cls: 'bg-blue-100 text-blue-700' },
  { value: 'retired', label: 'Списано', cls: 'bg-gray-200 text-gray-600' },
];

const getStatusBadge = (s: string) => statusOptions.find(o => o.value === s)?.cls || 'bg-gray-100 text-gray-700';
const getStatusLabel = (s: string) => statusOptions.find(o => o.value === s)?.label || s;

const emptyForm = {
  inventory_number: '', barcode: '', name: '', model: '', category: 'notebook',
  serial_number: '', status: 'available', location: '', notes: '',
};

export default function InventoryPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();
  const [devices, setDevices] = useState<Device[]>([]);
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ name: '', code: '', icon: '📦' });

  useEffect(() => {
    if (user && user.role !== 'ADMIN') { router.push('/guest'); }
  }, [user, router]);
  useEffect(() => {
    if (user?.role === 'ADMIN') fetchDevices();
  }, [user, catFilter, statusFilter]);
  useEffect(() => {
    if (user?.role === 'ADMIN') fetchCategories();
  }, [user]);

  const fetchCategories = async () => {
    setCategoriesLoading(true);
    try {
      const res = await api.get('/api/inventory/categories');
      setCategories(Array.isArray(res.data) ? res.data : []);
    } catch {
      setCategories([]);
    } finally {
      setCategoriesLoading(false);
    }
  };

  const fetchDevices = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page_size: '200' } as any);
      if (catFilter) params.set('category', catFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);
      const res = await api.get(`/api/inventory?${params.toString()}`);
      setDevices(res.data.items || []);
    } catch { setDevices([]); }
    finally { setLoading(false); }
  };

  const handleSearch = () => fetchDevices();

  const openCreate = () => {
    if (categories.length === 0) {
      showToast('Сначала добавьте категорию инвентаря', 'error');
      setShowCategoryModal(true);
      return;
    }
    const initialCategory = categories.find(category => category.code === 'notebook')?.code || categories[0]?.code || '';
    setEditId(null);
    setForm({ ...emptyForm, category: initialCategory });
    setShowModal(true);
  };
  const openEdit = (d: Device) => {
    setEditId(d.id);
    setForm({ inventory_number: d.inventory_number, barcode: d.barcode || '', name: d.name, model: d.model || '', category: d.category, serial_number: d.serial_number, status: d.status, location: d.location || '', notes: d.notes || '' });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!form.inventory_number.trim() || !form.name.trim() || !form.serial_number.trim()) { showToast('Инв.номер, название и серийник обязательны', 'error'); return; }
    setSaving(true);
    try {
      const payload: any = {
        inventory_number: form.inventory_number.trim(), name: form.name.trim(), category: form.category,
        serial_number: form.serial_number.trim(), status: form.status,
        barcode: form.barcode.trim() || null, model: form.model.trim() || null, location: form.location.trim() || null, notes: form.notes.trim() || null,
      };
      if (editId) {
        await api.patch(`/api/inventory/${editId}`, payload);
        showToast('Обновлено', 'success');
      } else {
        await api.post('/api/inventory', payload);
        showToast('Добавлено', 'success');
      }
      setShowModal(false);
      fetchDevices();
    } catch (err: any) { showToast(err.response?.data?.detail || 'Ошибка', 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try { await api.delete(`/api/inventory/${deleteTarget.id}`); showToast('Удалено', 'success'); setDeleteTarget(null); fetchDevices(); }
    catch (err: any) { showToast(err.response?.data?.detail || 'Ошибка', 'error'); }
  };

  const handleToggleStatus = async (d: Device) => {
    try {
      const next = d.status === 'available' ? 'issued' : 'available';
      await api.patch(`/api/inventory/${d.id}`, { status: next });
      fetchDevices();
    } catch (err: any) { showToast(err.response?.data?.detail || 'Ошибка', 'error'); }
  };

  const handleCreateCategory = async () => {
    if (!categoryForm.name.trim()) {
      showToast('Введите название категории', 'error');
      return;
    }
    setCategorySaving(true);
    try {
      const response = await api.post('/api/inventory/categories', {
        name: categoryForm.name.trim(),
        code: categoryForm.code.trim() || null,
        icon: categoryForm.icon.trim() || '📦',
      });
      await fetchCategories();
      setForm(current => ({ ...current, category: response.data.code }));
      setCategoryForm({ name: '', code: '', icon: '📦' });
      showToast('Категория добавлена', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Не удалось добавить категорию', 'error');
    } finally {
      setCategorySaving(false);
    }
  };

  const getCategoryIcon = (code: string) => categories.find(category => category.code === code)?.icon || '📦';
  const getCategoryLabel = (code: string) => categories.find(category => category.code === code)?.name || code;

  if (!user || user.role !== 'ADMIN') return null;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="Администрирование"
          title="Инвентарь"
          description="Учёт устройств: серийные номера, статусы, местоположение."
          actions={(
            <button type="button" onClick={() => setShowCategoryModal(true)}
              className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-900 transition hover:bg-blue-50">
              Категории
            </button>
          )}
        />

        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input type="text" placeholder="Поиск по названию, модели, серийнику..." value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }} />
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none">
            <option value="">Все категории</option>
            {categories.map(category => <option key={category.id} value={category.code}>{category.icon} {category.name}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none">
            <option value="">Все статусы</option>
            {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-white px-5 py-16 text-center shadow-sm">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
            <p className="text-sm text-slate-500">Загрузка устройств...</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <button type="button" onClick={openCreate} disabled={categoriesLoading}
              className="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-4 text-slate-400 shadow-sm transition hover:border-blue-400 hover:text-blue-500 disabled:cursor-not-allowed disabled:opacity-50">
              <span className="text-3xl">+</span>
              <span className="text-sm font-medium">Добавить устройство</span>
            </button>
            {devices.map(d => (
              <div key={d.id} className="group rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md">
                <div className="flex items-start gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-2xl">{getCategoryIcon(d.category)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800 truncate">{d.name}</p>
                    {d.model && <p className="text-xs text-slate-500 truncate">{d.model}</p>}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${getStatusBadge(d.status)}`}>{getStatusLabel(d.status)}</span>
                      <span className="text-[10px] text-slate-400">{getCategoryLabel(d.category)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
                    <button onClick={() => openEdit(d)} className="rounded-lg bg-slate-100 p-1.5 text-xs text-slate-600 hover:bg-blue-100 hover:text-blue-700">✎</button>
                    <button onClick={() => setDeleteTarget({ id: d.id, name: d.name })} className="rounded-lg bg-slate-100 p-1.5 text-xs text-slate-600 hover:bg-red-100 hover:text-red-700">✕</button>
                  </div>
                </div>
                <div className="mt-2.5 space-y-1">
                  <p className="text-xs text-slate-400">SN: <span className="font-mono text-slate-600">{d.serial_number}</span></p>
                  <p className="text-xs text-slate-400">Инв: <span className="font-mono text-slate-600">{d.inventory_number}</span></p>
                  {d.barcode && <p className="text-xs text-slate-400">ШК: <span className="font-mono text-slate-600">{d.barcode}</span></p>}
                  {d.location && <p className="text-xs text-slate-400">📍 {d.location}</p>}
                  {d.assigned_to && <p className="text-xs text-slate-500">👤 {d.assigned_to}</p>}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2.5">
                  <button onClick={() => handleToggleStatus(d)}
                    className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-200">
                    {d.status === 'available' ? 'Выдать' : 'Вернуть'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <Modal onClose={() => setShowModal(false)} title={editId ? 'Редактировать устройство' : 'Добавить устройство'}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-slate-600 mb-1">Инв. номер *</label>
                <input value={form.inventory_number} onChange={e => setForm({ ...form, inventory_number: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400" placeholder="INV-001" /></div>
              <div><label className="block text-xs font-medium text-slate-600 mb-1">Штрихкод</label>
                <input value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400" placeholder="4820..." /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-slate-600 mb-1">Название *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400" placeholder="Lenovo Legion 5" /></div>
              <div><label className="block text-xs font-medium text-slate-600 mb-1">Модель</label>
                <input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400" placeholder="Legion 5 Pro" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-slate-600 mb-1">Категория</label>
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none">
                  {editId && form.category && !categories.some(category => category.code === form.category) && (
                    <option value={form.category} disabled>{form.category} (неактивна)</option>
                  )}
                  {categories.map(category => <option key={category.id} value={category.code}>{category.icon} {category.name}</option>)}
                </select></div>
              <div><label className="block text-xs font-medium text-slate-600 mb-1">Статус</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none">
                  {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select></div>
            </div>
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Серийный номер *</label>
              <input value={form.serial_number} onChange={e => setForm({ ...form, serial_number: e.target.value })}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-mono outline-none focus:border-blue-400" placeholder="SN-PF4A8B9C" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-slate-600 mb-1">Расположение</label>
                <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400" placeholder="Склад, стеллаж А" /></div>
              <div><label className="block text-xs font-medium text-slate-600 mb-1">Заметки</label>
                <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400" placeholder="Любые заметки" /></div>
            </div>
          </div>
          <div className="mt-6 flex gap-3">
            <button onClick={handleSubmit} disabled={saving}
              className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-50">{saving ? 'Сохранение...' : editId ? 'Сохранить' : 'Добавить'}</button>
            <button onClick={() => setShowModal(false)} className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-200">Отмена</button>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Modal onClose={() => setDeleteTarget(null)} title="Удалить устройство?">
          <p className="text-sm text-slate-500">Удалить <span className="font-semibold text-slate-800">{deleteTarget.name}</span>? Это действие нельзя отменить.</p>
          <div className="mt-6 flex gap-3">
            <button onClick={handleDelete} className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-700">Удалить</button>
            <button onClick={() => setDeleteTarget(null)} className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-200">Отмена</button>
          </div>
        </Modal>
      )}

      {showCategoryModal && (
        <Modal onClose={() => setShowCategoryModal(false)} title="Категории инвентаря">
          <div className="max-h-48 space-y-2 overflow-auto rounded-xl bg-slate-50 p-3">
            {categories.map(category => (
              <div key={category.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm shadow-sm">
                <span>{category.icon} <span className="font-medium text-slate-700">{category.name}</span></span>
                <code className="text-xs text-slate-400">{category.code}</code>
              </div>
            ))}
          </div>
          <div className="mt-5 space-y-3 border-t border-slate-200 pt-5">
            <h3 className="text-sm font-bold text-slate-800">Добавить категорию</h3>
            <div className="grid grid-cols-[72px_1fr] gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Значок</label>
                <input value={categoryForm.icon} onChange={e => setCategoryForm({ ...categoryForm, icon: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-center text-lg outline-none focus:border-blue-400" maxLength={4} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Название *</label>
                <input value={categoryForm.name} onChange={e => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400" placeholder="Камера" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Код для backup-папки</label>
              <input value={categoryForm.code} onChange={e => setCategoryForm({ ...categoryForm, code: e.target.value })}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 font-mono text-sm outline-none focus:border-blue-400" placeholder="camera (можно оставить пустым)" />
              <p className="mt-1 text-xs text-slate-400">Если оставить пустым, код сформируется из названия автоматически.</p>
            </div>
          </div>
          <div className="mt-5 flex gap-3">
            <button onClick={handleCreateCategory} disabled={categorySaving}
              className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
              {categorySaving ? 'Добавление...' : 'Добавить категорию'}
            </button>
            <button onClick={() => setShowCategoryModal(false)} className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm text-gray-700">Закрыть</button>
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:text-gray-600">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
