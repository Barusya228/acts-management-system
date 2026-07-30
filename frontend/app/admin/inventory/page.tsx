'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import AdminLayout from '@/components/AdminLayout';
import PageHeader from '@/components/ui/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false });

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
  { value: 'available', label: 'Не выдан', cls: 'bg-emerald-100 text-emerald-700' },
  { value: 'assigned', label: 'Выдан под акт', cls: 'bg-amber-100 text-amber-700' },
  { value: 'maintenance', label: 'Косячный', cls: 'bg-red-100 text-red-700' },
  { value: 'retired', label: 'Списан', cls: 'bg-gray-200 text-gray-600' },
];

const normalizedStatus = (status: string) => status === 'reserved' || status === 'issued' ? 'assigned' : status;
const getStatusBadge = (s: string) => statusOptions.find(o => o.value === normalizedStatus(s))?.cls || 'bg-gray-100 text-gray-700';
const getStatusLabel = (s: string) => statusOptions.find(o => o.value === normalizedStatus(s))?.label || s;

const emptyForm = {
  inventory_number: '', barcode: '', name: '', model: '', category: 'notebook',
  serial_number: '', status: 'available', location: '', notes: '',
};

const emptyBulkRow = { inventory_number: '', barcode: '' };

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
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkRows, setBulkRows] = useState([{ ...emptyBulkRow }]);
  const [bulkPaste, setBulkPaste] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ name: '', code: '', icon: '📦' });
  const [showCategoryEmojiPicker, setShowCategoryEmojiPicker] = useState(false);
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<InventoryCategory | null>(null);

  useEffect(() => {
    if (user && user.role !== 'ADMIN') { router.push('/guest'); }
  }, [user, router]);
  useEffect(() => {
    if (user?.role === 'ADMIN') fetchDevices();
  }, [user, catFilter, statusFilter, page, refreshKey]);
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
    setLoadError('');
    try {
      const params = new URLSearchParams({ page: String(page), page_size: '24' });
      if (catFilter) params.set('category', catFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);
      const res = await api.get(`/api/inventory?${params.toString()}`);
      setDevices(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch {
      setDevices([]);
      setTotal(0);
      setLoadError('Не удалось загрузить инвентарь');
    }
    finally { setLoading(false); }
  };

  const handleSearch = () => {
    if (page === 1) fetchDevices();
    else setPage(1);
  };

  const resetFilters = () => {
    setSearch('');
    setCatFilter('');
    setStatusFilter('');
    setPage(1);
    setRefreshKey(value => value + 1);
  };

  const showCategoryDevices = (categoryCode: string) => {
    setSearch('');
    setStatusFilter('');
    setCatFilter(categoryCode);
    setPage(1);
    setShowCategoryModal(false);
  };

  const openCreate = () => {
    if (categories.length === 0) {
      showToast('Сначала добавьте категорию инвентаря', 'error');
      setShowCategoryModal(true);
      return;
    }
    const initialCategory = categories.find(category => category.code === 'notebook')?.code || categories[0]?.code || '';
    setEditId(null);
    setBulkMode(false);
    setBulkRows([{ ...emptyBulkRow }]);
    setBulkPaste('');
    setForm({ ...emptyForm, category: initialCategory });
    setShowModal(true);
  };
  const openEdit = (d: Device) => {
    setEditId(d.id);
    setBulkMode(false);
    setForm({ inventory_number: d.inventory_number, barcode: d.barcode || '', name: d.name, model: d.model || '', category: d.category, serial_number: d.serial_number, status: d.status, location: d.location || '', notes: d.notes || '' });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) { showToast('Название обязательно', 'error'); return; }
    if (bulkMode && !editId) {
      if (bulkRows.some(row => !row.inventory_number.trim() || !row.barcode.trim())) {
        showToast('Заполните инвентарный номер и штрихкод в каждой строке', 'error');
        return;
      }
    } else if (!form.inventory_number.trim() || !form.barcode.trim()) {
      showToast('Инв. номер и штрихкод обязательны', 'error');
      return;
    }
    setSaving(true);
    try {
      if (bulkMode && !editId) {
        const response = await api.post('/api/inventory/bulk', {
          name: form.name.trim(),
          model: form.model.trim() || null,
          category: form.category,
          status: form.status,
          devices: bulkRows.map(row => ({
            inventory_number: row.inventory_number.trim(),
            barcode: row.barcode.trim(),
          })),
        });
        showToast(`Добавлено устройств: ${response.data.created}`, 'success');
        setShowModal(false);
        setPage(1);
        setRefreshKey(value => value + 1);
        return;
      }
      const payload: any = {
        inventory_number: form.inventory_number.trim(), name: form.name.trim(), category: form.category,
        serial_number: form.inventory_number.trim(), status: form.status,
        barcode: form.barcode.trim(), model: form.model.trim() || null,
        notes: form.notes.trim() || null,
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

  const updateBulkRow = (index: number, field: 'inventory_number' | 'barcode', value: string) => {
    setBulkRows(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row));
  };

  const parseBulkPaste = () => {
    const rows = bulkPaste
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => line.split(/[\s;,]+/).filter(Boolean))
      .filter(parts => parts.length >= 2)
      .map(parts => {
        const first = parts[0];
        const second = parts[1];
        const inventoryFirst = first.startsWith('200') && first.length > second.length;
        return inventoryFirst
          ? { inventory_number: first, barcode: second }
          : { inventory_number: second, barcode: first };
      });
    if (rows.length === 0) {
      showToast('Не удалось распознать строки. Используйте формат: штрихкод и инвентарный номер', 'error');
      return;
    }
    setBulkRows(rows);
    showToast(`Распознано устройств: ${rows.length}`, 'success');
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try { await api.delete(`/api/inventory/${deleteTarget.id}`); showToast('Удалено', 'success'); setDeleteTarget(null); fetchDevices(); }
    catch (err: any) { showToast(err.response?.data?.detail || 'Ошибка', 'error'); }
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
      setShowCategoryEmojiPicker(false);
      showToast('Категория добавлена', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Не удалось добавить категорию', 'error');
    } finally {
      setCategorySaving(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!deleteCategoryTarget) return;
    try {
      await api.delete(`/api/inventory/categories/${deleteCategoryTarget.id}?replacement_code=other`);
      if (catFilter === deleteCategoryTarget.code) setCatFilter('');
      if (form.category === deleteCategoryTarget.code) {
        setForm(current => ({ ...current, category: '' }));
      }
      setDeleteCategoryTarget(null);
      await fetchCategories();
      await fetchDevices();
      showToast('Категория удалена', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Не удалось удалить категорию', 'error');
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
          <select value={catFilter} onChange={e => { setCatFilter(e.target.value); setPage(1); }}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none">
            <option value="">Все категории</option>
            {categories.map(category => <option key={category.id} value={category.code}>{category.icon} {category.name}</option>)}
          </select>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none">
            <option value="">Все статусы</option>
            {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {(search || catFilter || statusFilter) && (
            <button type="button" onClick={resetFilters}
              className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-200">
              Сбросить фильтры
            </button>
          )}
        </div>

        {loading ? (
          <div className="rounded-2xl bg-white px-5 py-16 text-center shadow-sm">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
            <p className="text-sm text-slate-500">Загрузка устройств...</p>
          </div>
        ) : loadError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</div>
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
                  <div className="flex shrink-0 gap-1 opacity-100 transition lg:opacity-0 lg:group-hover:opacity-100">
                    <button onClick={() => openEdit(d)} className="rounded-lg bg-slate-100 p-1.5 text-xs text-slate-600 hover:bg-blue-100 hover:text-blue-700">✎</button>
                    <button onClick={() => setDeleteTarget({ id: d.id, name: d.name })} className="rounded-lg bg-slate-100 p-1.5 text-xs text-slate-600 hover:bg-red-100 hover:text-red-700">✕</button>
                  </div>
                </div>
                <div className="mt-2.5 space-y-1">
                  <p className="text-xs text-slate-400">Инв: <span className="font-mono text-slate-600">{d.inventory_number}</span></p>
                  <p className="text-xs text-slate-400">ШК: <span className="font-mono text-slate-600">{d.barcode || '—'}</span></p>
                  {d.assigned_to && <p className="text-xs text-slate-500">👤 {d.assigned_to}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
        {total > 24 && !loading && !loadError && (
          <div className="mt-5 flex items-center justify-between rounded-xl bg-white px-4 py-3 ring-1 ring-gray-100">
            <span className="text-sm text-slate-500">Страница {page} из {Math.ceil(total / 24)} · всего {total}</span>
            <div className="flex gap-2">
              <button type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)} className="min-h-11 rounded-lg border px-4 text-sm disabled:opacity-40">Назад</button>
              <button type="button" disabled={page >= Math.ceil(total / 24)} onClick={() => setPage(value => value + 1)} className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm text-white disabled:opacity-40">Далее</button>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <Modal onClose={() => setShowModal(false)} title={editId ? 'Редактировать устройство' : bulkMode ? 'Добавить несколько устройств' : 'Добавить устройство'}>
          <div className="space-y-3">
            {!editId && (
              <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1">
                <button type="button" onClick={() => setBulkMode(false)}
                  className={`min-h-10 rounded-lg px-3 text-sm font-medium transition ${!bulkMode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                  Одно устройство
                </button>
                <button type="button" onClick={() => setBulkMode(true)}
                  className={`min-h-10 rounded-lg px-3 text-sm font-medium transition ${bulkMode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                  Несколько устройств
                </button>
              </div>
            )}
            {!bulkMode && (
              <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-slate-600 mb-1">Инв. номер *</label>
                <input value={form.inventory_number} onChange={e => setForm({ ...form, inventory_number: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400" placeholder="2000000012345" /></div>
              <div><label className="block text-xs font-medium text-slate-600 mb-1">Штрихкод *</label>
                <input value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400" placeholder="1234" /></div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-slate-600 mb-1">Название *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400" placeholder="Lenovo Legion 5" /></div>
              <div><label className="block text-xs font-medium text-slate-600 mb-1">Модель <span className="font-normal text-slate-400">(по желанию)</span></label>
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
                  {(form.status === 'reserved' || form.status === 'issued') && (
                    <option value={form.status}>Выдан под акт</option>
                  )}
                  {form.status !== 'reserved' && form.status !== 'issued' && (
                    <option value="assigned" disabled>Выдан под акт (автоматически)</option>
                  )}
                  {statusOptions.filter(option => option.value !== 'assigned').map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select></div>
            </div>
            {bulkMode && !editId && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-3">
                  <label className="mb-1 block text-sm font-semibold text-slate-700">Вставить список</label>
                  <p className="mb-2 text-xs text-slate-500">Одна строка — одно устройство: сначала штрихкод, затем инвентарный номер.</p>
                  <textarea
                    value={bulkPaste}
                    onChange={event => setBulkPaste(event.target.value)}
                    rows={6}
                    className="w-full resize-y rounded-lg border border-blue-200 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-blue-400"
                    placeholder={'000018869\t2000000188690\n000018870\t2000000188706'}
                  />
                  <button type="button" onClick={parseBulkPaste}
                    className="mt-2 min-h-10 w-full rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700">
                    Распознать список
                  </button>
                </div>
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Идентификаторы устройств</p>
                    <p className="text-xs text-slate-400">Название, модель, категория и статус применятся ко всем строкам.</p>
                  </div>
                  <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">{bulkRows.length}</span>
                </div>
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {bulkRows.map((row, index) => (
                    <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                      <input value={row.inventory_number} onChange={e => updateBulkRow(index, 'inventory_number', e.target.value)}
                        className="min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400" placeholder="Инв. номер" />
                      <input value={row.barcode} onChange={e => updateBulkRow(index, 'barcode', e.target.value)}
                        className="min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400" placeholder="Штрихкод" />
                      <button type="button" disabled={bulkRows.length === 1}
                        onClick={() => setBulkRows(rows => rows.filter((_, rowIndex) => rowIndex !== index))}
                        className="min-h-10 rounded-lg px-3 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-30">✕</button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => setBulkRows(rows => [...rows, { ...emptyBulkRow }])}
                  className="mt-3 min-h-10 w-full rounded-lg border border-dashed border-blue-300 text-sm font-medium text-blue-600 transition hover:bg-blue-50">
                  + Добавить строку
                </button>
              </div>
            )}
            {editId && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Заметки</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  className="w-full resize-y rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                  placeholder="Комментарий о состоянии или особенностях устройства"
                />
              </div>
            )}
          </div>
          <div className="mt-6 flex gap-3">
            <button onClick={handleSubmit} disabled={saving}
              className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-50">{saving ? 'Сохранение...' : editId ? 'Сохранить' : bulkMode ? `Добавить ${bulkRows.length}` : 'Добавить'}</button>
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
        <Modal onClose={() => { setShowCategoryModal(false); setShowCategoryEmojiPicker(false); }} title="Категории инвентаря">
          <div className="max-h-48 space-y-2 overflow-auto rounded-xl bg-slate-50 p-3">
            {categories.map(category => (
              <div key={category.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm shadow-sm">
                <span>{category.icon} <span className="font-medium text-slate-700">{category.name}</span></span>
                <div className="flex items-center gap-2">
                  <code className="text-xs text-slate-400">{category.code}</code>
                  <button type="button" onClick={() => showCategoryDevices(category.code)}
                    className="rounded-lg bg-blue-50 px-2 py-1 text-xs font-medium text-blue-600 transition hover:bg-blue-100">
                    Показать
                  </button>
                  {!category.is_system && (
                    <button type="button" onClick={() => setDeleteCategoryTarget(category)}
                      className="rounded-lg bg-rose-50 px-2 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-100">
                      Удалить
                    </button>
                  )}
                </div>
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
                <button type="button" onClick={() => setShowCategoryEmojiPicker(value => !value)}
                  className="mt-1 w-full rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-100">
                  {showCategoryEmojiPicker ? 'Скрыть' : 'Выбрать'}
                </button>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Название *</label>
                <input value={categoryForm.name} onChange={e => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400" placeholder="Камера" />
              </div>
            </div>
            {showCategoryEmojiPicker && (
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <EmojiPicker
                  width="100%"
                  height={320}
                  searchDisabled={false}
                  skinTonesDisabled
                  previewConfig={{ showPreview: false }}
                  onEmojiClick={(emojiData) => {
                    setCategoryForm(current => ({ ...current, icon: emojiData.emoji }));
                    setShowCategoryEmojiPicker(false);
                  }}
                />
              </div>
            )}
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
            <button onClick={() => { setShowCategoryModal(false); setShowCategoryEmojiPicker(false); }} className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm text-gray-700">Закрыть</button>
          </div>
        </Modal>
      )}

      {deleteCategoryTarget && (
        <Modal onClose={() => setDeleteCategoryTarget(null)} title="Удалить категорию?">
          <p className="text-sm text-slate-500">
            Категория <span className="font-semibold text-slate-800">{deleteCategoryTarget.icon} {deleteCategoryTarget.name}</span> будет удалена.
          </p>
          <p className="mt-2 text-xs text-slate-400">Устройства из этой категории будут автоматически перенесены в категорию «Другое».</p>
          <div className="mt-6 flex gap-3">
            <button onClick={handleDeleteCategory}
              className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-rose-700">
              Удалить
            </button>
            <button onClick={() => setDeleteCategoryTarget(null)}
              className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm text-gray-700">
              Отмена
            </button>
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
