'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/AdminLayout';
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
  paper_act_number?: string | null;
  paper_issue_date?: string | null;
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

interface InventoryStatusOption {
  id: string | null;
  code: string;
  name: string;
  is_system: boolean;
}

interface DeviceGroup {
  name: string;
  model: string;
  count: number;
}

interface ManualAccessory {
  id: string;
  act_id: string;
  act_reference: string;
  name: string;
  model?: string | null;
  quantity: number;
  note?: string | null;
  requires_return: boolean;
  status: string;
  recipient_name: string;
  issue_date: string;
}
interface SmallEquipmentGroup { id: string; name: string; model: string; active_quantity: number; active_assignments: Array<{ id: string; act_id: string; act_reference: string; recipient_name: string; quantity: number; status: string; note?: string | null; issue_date: string }>; }

interface IpadInventoryItem { id: string; device_name: string; model?: string | null; tag: string; serial_number: string; status: string; notes?: string | null; student_name?: string | null; act_id?: string | null; duplicate_tag_count: number; has_history: boolean; }
interface IpadGroup { device_name: string; model: string; count: number; }

const groupKey = (group: Pick<DeviceGroup, 'name' | 'model'>) => `${group.name}\u0000${group.model}`;

const statusOptions = [
  { value: 'available', label: 'Не выдан', cls: 'bg-emerald-100 text-emerald-700' },
  { value: 'assigned', label: 'Выдан под акт', cls: 'bg-amber-100 text-amber-700' },
  { value: 'paper_issued', label: 'Выдан по бумажному акту', cls: 'bg-violet-100 text-violet-700' },
  { value: 'maintenance', label: 'На обслуживании', cls: 'bg-red-100 text-red-700' },
  { value: 'retired', label: 'Списан', cls: 'bg-gray-200 text-gray-600' },
];

const ipadStatusOptions = [
  { value: 'AVAILABLE', label: 'Не выдан' },
  { value: 'RESERVED', label: 'Зарезервирован' },
  { value: 'ISSUED', label: 'Выдан' },
  { value: 'RETURN_PENDING', label: 'Ожидает возврата' },
  { value: 'MAINTENANCE', label: 'На обслуживании' },
  { value: 'RETIRED', label: 'Списан' },
];

const managedIpadStatuses = new Set(['RESERVED', 'ISSUED', 'RETURN_PENDING']);
const ipadStatusLabel = (status: string) => ipadStatusOptions.find(option => option.value === status)?.label || status;
const ipadDeleteBlockReason = (item: IpadInventoryItem) => managedIpadStatuses.has(item.status)
  ? 'Активный или зарезервированный iPad нельзя удалить'
  : item.has_history
    ? 'iPad имеет историю актов и не может быть удалён'
    : '';

const normalizedStatus = (status: string) => status === 'reserved' || status === 'issued' ? 'assigned' : status;
const getStatusBadge = (s: string) => statusOptions.find(o => o.value === normalizedStatus(s))?.cls || 'bg-gray-100 text-gray-700';
const getStatusLabel = (s: string, customStatuses: InventoryStatusOption[] = []) => statusOptions.find(o => o.value === normalizedStatus(s))?.label || customStatuses.find(option => option.code === s)?.name || s;

const emptyForm = {
  inventory_number: '', barcode: '', name: '', model: '', category: 'notebook',
  serial_number: '', status: 'available', location: '', assigned_to: '', paper_act_number: '', paper_issue_date: '', notes: '',
};

const emptyBulkRow = { inventory_number: '', barcode: '' };

export default function InventoryPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();
  const [devices, setDevices] = useState<Device[]>([]);
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [inventoryStatuses, setInventoryStatuses] = useState<InventoryStatusOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [ipadStatusFilter, setIpadStatusFilter] = useState('');
  const [ipadTagOrder, setIpadTagOrder] = useState<'asc' | 'desc'>('asc');
  const [filtersReady, setFiltersReady] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [groups, setGroups] = useState<DeviceGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [inventoryView, setInventoryView] = useState<'devices' | 'accessories' | 'ipads'>('devices');
  const [manualAccessories, setManualAccessories] = useState<ManualAccessory[]>([]);
  const [smallEquipmentGroups, setSmallEquipmentGroups] = useState<SmallEquipmentGroup[]>([]);
  const [manualTotal, setManualTotal] = useState(0);
  const [ipadItems, setIpadItems] = useState<IpadInventoryItem[]>([]);
  const [ipadTotal, setIpadTotal] = useState(0);
  const [ipadGroups, setIpadGroups] = useState<IpadGroup[]>([]);
  const [selectedIpadGroup, setSelectedIpadGroup] = useState('');
  const [showIpadModal, setShowIpadModal] = useState(false);
  const [ipadEditId, setIpadEditId] = useState<string | null>(null);
  const [ipadDeleteTarget, setIpadDeleteTarget] = useState<IpadInventoryItem | null>(null);
  const [ipadDeleting, setIpadDeleting] = useState(false);
  const [showSmallEquipmentModal, setShowSmallEquipmentModal] = useState(false);
  const [smallEquipmentSaving, setSmallEquipmentSaving] = useState(false);
  const [smallEquipmentForm, setSmallEquipmentForm] = useState({ name: '', model: '' });
  const [duplicateIpadTagsOnly, setDuplicateIpadTagsOnly] = useState(false);
  const [ipadBulk, setIpadBulk] = useState(false);
  const [ipadForm, setIpadForm] = useState({ device_name: 'iPad', model: '', status: 'AVAILABLE', tag: '', serial_number: '', notes: '', list: '' });
  const [ipadHistory, setIpadHistory] = useState<{ device: IpadInventoryItem; events: { type: string; title: string; detail: string; status: string; act_id: string; created_at: string }[] } | null>(null);
  const [ipadHistoryLoading, setIpadHistoryLoading] = useState(false);

  const openIpadHistory = async (deviceId: string) => {
    setIpadHistoryLoading(true);
    try {
      const response = await api.get(`/api/ipad-inventory/${deviceId}/history`);
      setIpadHistory(response.data);
    } catch {
      showToast('Не удалось загрузить историю iPad', 'error');
    } finally {
      setIpadHistoryLoading(false);
    }
  };

  const openCreateIpad = () => {
    setIpadEditId(null);
    setIpadForm({ device_name: 'iPad', model: '', status: 'AVAILABLE', tag: '', serial_number: '', notes: '', list: '' });
    setIpadBulk(false);
    setShowIpadModal(true);
  };

  const openEditIpad = (item: IpadInventoryItem) => {
    setIpadEditId(item.id);
    setIpadBulk(false);
    setIpadForm({
      device_name: item.device_name,
      model: item.model || '',
      status: item.status,
      tag: item.tag,
      serial_number: item.serial_number,
      notes: item.notes || '',
      list: '',
    });
    setShowIpadModal(true);
  };

  const requestDeleteIpad = (item: IpadInventoryItem) => {
    const blockedReason = ipadDeleteBlockReason(item);
    if (blockedReason) {
      showToast(blockedReason, 'info');
      return;
    }
    setIpadDeleteTarget(item);
  };

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkRows, setBulkRows] = useState([{ ...emptyBulkRow }]);
  const [bulkPaste, setBulkPaste] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ name: '', code: '', icon: '📦' });
  const [newStatusName, setNewStatusName] = useState('');
  const [statusCreating, setStatusCreating] = useState(false);
  const [deleteSmallEquipmentTarget, setDeleteSmallEquipmentTarget] = useState<SmallEquipmentGroup | null>(null);
  const [deletingSmallEquipment, setDeletingSmallEquipment] = useState(false);

  useEffect(() => {
    if (user && user.role !== 'ADMIN') { router.push('/guest'); }
  }, [user, router]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    const status = params.get('status');
    const tagOrder = params.get('tag_order');
    if (view === 'devices' || view === 'accessories' || view === 'ipads') setInventoryView(view);
    if (status && view === 'ipads') setIpadStatusFilter(status.toUpperCase());
    if (status && view === 'devices') setStatusFilter(status.toLowerCase());
    if (tagOrder === 'asc' || tagOrder === 'desc') setIpadTagOrder(tagOrder);
    setFiltersReady(true);
  }, []);
  useEffect(() => {
    if (user?.role === 'ADMIN' && filtersReady) {
      if (inventoryView === 'devices') fetchDevices();
      else if (inventoryView === 'accessories') fetchManualAccessories();
      else fetchIpads();
    }
  }, [user, filtersReady, inventoryView, catFilter, statusFilter, ipadStatusFilter, ipadTagOrder, selectedGroup, selectedIpadGroup, duplicateIpadTagsOnly, page, refreshKey]);
  useEffect(() => {
    if (user?.role === 'ADMIN' && filtersReady && inventoryView === 'ipads') fetchIpadGroups();
  }, [user, filtersReady, inventoryView, ipadStatusFilter, duplicateIpadTagsOnly, refreshKey]);
  useEffect(() => {
    if (user?.role === 'ADMIN') fetchGroups();
  }, [user, catFilter, statusFilter, refreshKey]);
  useEffect(() => {
    if (user?.role === 'ADMIN') {
      fetchCategories();
      fetchInventoryStatuses();
    }
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

  const fetchInventoryStatuses = async () => {
    try {
      const response = await api.get('/api/inventory/statuses');
      setInventoryStatuses(Array.isArray(response.data) ? response.data : []);
    } catch {
      setInventoryStatuses([]);
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
      const activeGroup = groups.find(group => groupKey(group) === selectedGroup);
      if (activeGroup) {
        params.set('name', activeGroup.name);
        params.set('model', activeGroup.model);
      }
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

  const fetchGroups = async () => {
    try {
      const params = new URLSearchParams();
      if (catFilter) params.set('category', catFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);
      const response = await api.get(`/api/inventory/groups?${params.toString()}`);
      const nextGroups = Array.isArray(response.data) ? response.data : [];
      setGroups(nextGroups);
      if (selectedGroup && !nextGroups.some((group: DeviceGroup) => groupKey(group) === selectedGroup)) {
        setSelectedGroup('');
        setPage(1);
      }
    } catch {
      setGroups([]);
      setSelectedGroup('');
    }
  };

  const fetchManualAccessories = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const params = new URLSearchParams({ page: String(page), page_size: '24' });
      if (search) params.set('search', search);
      const response = await api.get(`/api/inventory/small-equipment/catalog?${params.toString()}`);
      const items = Array.isArray(response.data) ? response.data : [];
      setSmallEquipmentGroups(items);
      setManualTotal(items.length);
    } catch {
      setManualAccessories([]);
      setManualTotal(0);
      setLoadError('Не удалось загрузить ручные позиции');
    } finally {
      setLoading(false);
    }
  };

  const fetchIpads = async () => {
    setLoading(true); setLoadError('');
    try {
      const params = new URLSearchParams({ page: String(page), page_size: '24' });
      if (search) params.set('search', search);
      if (ipadStatusFilter) params.set('status', ipadStatusFilter);
      params.set('tag_order', ipadTagOrder);
      if (duplicateIpadTagsOnly) params.set('duplicate_tags_only', 'true');
      const activeGroup = ipadGroups.find(group => `${group.device_name}\u0000${group.model}` === selectedIpadGroup);
      if (activeGroup) params.set('model', activeGroup.model);
      const response = await api.get(`/api/ipad-inventory?${params}`);
      setIpadItems(response.data.items || []); setIpadTotal(response.data.total || 0);
    } catch { setIpadItems([]); setIpadTotal(0); setLoadError('Не удалось загрузить iPad'); }
    finally { setLoading(false); }
  };

  const fetchIpadGroups = async () => {
    try {
      const params = new URLSearchParams();
      if (ipadStatusFilter) params.set('status', ipadStatusFilter);
      const response = await api.get(`/api/ipad-inventory/groups?${params}`);
      const nextGroups = Array.isArray(response.data) ? response.data : [];
      setIpadGroups(nextGroups);
      if (selectedIpadGroup && !nextGroups.some((group: IpadGroup) => `${group.device_name}\u0000${group.model}` === selectedIpadGroup)) {
        setSelectedIpadGroup('');
        setPage(1);
      }
    } catch {
      setIpadGroups([]);
      setSelectedIpadGroup('');
    }
  };

  const saveIpads = async () => {
    if (!ipadForm.device_name.trim()) {
      showToast('Укажите название iPad', 'error');
      return;
    }
    if (!ipadBulk && (!ipadForm.tag.trim() || !ipadForm.serial_number.trim())) {
      showToast('Укажите Tag и Serial Number', 'error');
      return;
    }
    setSaving(true);
    try {
      if (ipadEditId) {
        const managed = ['RESERVED', 'ISSUED', 'RETURN_PENDING'].includes(ipadForm.status);
        const payload: Record<string, string | null> = {
          device_name: ipadForm.device_name.trim(),
          model: ipadForm.model.trim() || null,
          notes: ipadForm.notes.trim() || null,
        };
        if (!managed) {
          payload.tag = ipadForm.tag.trim();
          payload.serial_number = ipadForm.serial_number.trim();
          payload.status = ipadForm.status;
        }
        await api.patch(`/api/ipad-inventory/${ipadEditId}`, payload);
        showToast('iPad обновлён', 'success');
      } else if (ipadBulk) {
        const rows = ipadForm.list.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => line.split(/[\s;,]+/)).filter(parts => parts.length >= 2).map(parts => ({ tag: parts[0], serial_number: parts[1] }));
        if (!rows.length) throw new Error('Вставьте список Tag и Serial Number');
        const response = await api.post('/api/ipad-inventory/bulk', { device_name: ipadForm.device_name, model: ipadForm.model || null, status: ipadForm.status, devices: rows });
        showToast(`Добавлено iPad: ${response.data.created}`, 'success');
      } else {
        await api.post('/api/ipad-inventory', { ...ipadForm, model: ipadForm.model || null, notes: ipadForm.notes || null });
        showToast('iPad добавлен', 'success');
      }
      setShowIpadModal(false); setIpadEditId(null); setRefreshKey(value => value + 1);
    } catch (error: any) { showToast(error.response?.data?.detail || error.message || 'Ошибка', 'error'); }
    finally { setSaving(false); }
  };

  const deleteIpad = async () => {
    if (!ipadDeleteTarget) return;
    setIpadDeleting(true);
    try {
      await api.delete(`/api/ipad-inventory/${ipadDeleteTarget.id}`);
      setIpadDeleteTarget(null);
      setRefreshKey(value => value + 1);
      showToast('iPad удалён', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.detail || 'Не удалось удалить iPad', 'error');
    } finally {
      setIpadDeleting(false);
    }
  };

  const handleSearch = () => {
    setSelectedGroup('');
    setPage(1);
    setRefreshKey(value => value + 1);
  };

  const accessoryStatus = (status: string) => ({
    RESERVED: { label: 'Зарезервировано', cls: 'bg-violet-100 text-violet-700' },
    ISSUED: { label: 'Выдано', cls: 'bg-amber-100 text-amber-700' },
    RETURNED: { label: 'Возвращено', cls: 'bg-emerald-100 text-emerald-700' },
    NO_RETURN_REQUIRED: { label: 'Возврат не требуется', cls: 'bg-blue-100 text-blue-700' },
  } as Record<string, { label: string; cls: string }>)[status] || { label: status, cls: 'bg-gray-100 text-gray-700' };

  const resetFilters = () => {
    setSearch('');
    setCatFilter('');
    setStatusFilter('');
    setIpadStatusFilter('');
    setPage(1);
    setSelectedGroup('');
    setSelectedIpadGroup('');
    setRefreshKey(value => value + 1);
  };

  const switchInventoryView = (view: 'devices' | 'accessories' | 'ipads') => {
    setInventoryView(view);
    setSearch('');
    setCatFilter('');
    setStatusFilter('');
    setIpadStatusFilter('');
    setSelectedGroup('');
    setSelectedIpadGroup('');
    setDuplicateIpadTagsOnly(false);
    setPage(1);
    const params = new URLSearchParams(window.location.search);
    params.set('view', view);
    params.delete('status');
    params.delete('tag_order');
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  };

  const openCreate = () => {
    const initialCategory = categories.find(category => category.code === 'notebook')?.code || categories[0]?.code || '__new_category__';
    setEditId(null);
    setBulkMode(false);
    setBulkRows([{ ...emptyBulkRow }]);
    setBulkPaste('');
    setCategoryForm({ name: '', code: '', icon: '📦' });
    setNewStatusName('');
    setForm({ ...emptyForm, category: initialCategory });
    setShowModal(true);
  };
  const openEdit = (d: Device) => {
    setEditId(d.id);
    setBulkMode(false);
    setNewStatusName('');
    setForm({ inventory_number: d.inventory_number, barcode: d.barcode || '', name: d.name, model: d.model || '', category: d.category, serial_number: d.serial_number, status: d.status, location: d.location || '', assigned_to: d.assigned_to || '', paper_act_number: d.paper_act_number || '', paper_issue_date: d.paper_issue_date || '', notes: d.notes || '' });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) { showToast('Название обязательно', 'error'); return; }
    if (form.category === '__new_category__') { showToast('Сначала добавьте новую категорию', 'error'); return; }
    if (form.status === '__other__') { showToast('Сначала добавьте новый статус', 'error'); return; }
    if (bulkMode && !editId) {
      if (bulkRows.some(row => !row.inventory_number.trim() || !row.barcode.trim())) {
        showToast('Заполните инвентарный номер и штрихкод в каждой строке', 'error');
        return;
      }
    } else if (!form.inventory_number.trim() || !form.barcode.trim()) {
      showToast('Инв. номер и штрихкод обязательны', 'error');
      return;
    }
    if (!bulkMode && form.status === 'paper_issued' && !form.assigned_to.trim()) {
      showToast('Укажите, кому выдано устройство по бумажному акту', 'error');
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
        assigned_to: form.status === 'paper_issued' ? form.assigned_to.trim() : null,
        paper_act_number: form.status === 'paper_issued' ? form.paper_act_number.trim() || null : null,
        paper_issue_date: form.status === 'paper_issued' ? form.paper_issue_date || null : null,
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
      setRefreshKey(value => value + 1);
    } catch (err: any) { showToast(err.response?.data?.detail || 'Ошибка', 'error'); }
    finally { setSaving(false); }
  };

  const createInventoryStatus = async () => {
    if (!newStatusName.trim()) {
      showToast('Введите название нового статуса', 'error');
      return;
    }
    setStatusCreating(true);
    try {
      const response = await api.post('/api/inventory/statuses', { name: newStatusName.trim() });
      setInventoryStatuses(current => current.some(item => item.code === response.data.code) ? current : [...current, response.data]);
      setForm(current => ({ ...current, status: response.data.code }));
      setNewStatusName('');
      showToast('Новый статус добавлен', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.detail || 'Не удалось добавить статус', 'error');
    } finally {
      setStatusCreating(false);
    }
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
    try { await api.delete(`/api/inventory/${deleteTarget.id}`); showToast('Удалено', 'success'); setDeleteTarget(null); setRefreshKey(value => value + 1); }
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
      showToast('Категория добавлена', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Не удалось добавить категорию', 'error');
    } finally {
      setCategorySaving(false);
    }
  };

  const handleDeleteSmallEquipment = async () => {
    if (!deleteSmallEquipmentTarget) return;
    setDeletingSmallEquipment(true);
    try {
      await api.delete(`/api/inventory/small-equipment/catalog/${deleteSmallEquipmentTarget.id}`);
      setDeleteSmallEquipmentTarget(null);
      await fetchManualAccessories();
      showToast('Мелкая техника удалена', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Не удалось удалить мелкую технику', 'error');
    } finally {
      setDeletingSmallEquipment(false);
    }
  };

  const handleCreateSmallEquipment = async () => {
    if (!smallEquipmentForm.name.trim()) {
      showToast('Введите название мелкой техники', 'error');
      return;
    }
    setSmallEquipmentSaving(true);
    try {
      await api.post('/api/inventory/small-equipment/catalog', {
        name: smallEquipmentForm.name.trim(),
        model: smallEquipmentForm.model.trim() || null,
      });
      setSmallEquipmentForm({ name: '', model: '' });
      setShowSmallEquipmentModal(false);
      await fetchManualAccessories();
      showToast('Позиция мелкой техники добавлена', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Не удалось добавить мелкую технику', 'error');
    } finally {
      setSmallEquipmentSaving(false);
    }
  };

  const getCategoryIcon = (code: string) => categories.find(category => category.code === code)?.icon || '📦';
  const getCategoryLabel = (code: string) => categories.find(category => category.code === code)?.name || code;
  const managedIpadEdit = Boolean(ipadEditId && managedIpadStatuses.has(ipadForm.status));

  if (!user || user.role !== 'ADMIN') return null;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">Инвентарь техники</h1>
            <p className="mt-1 text-sm text-slate-500">Основные устройства, мелкая техника и отдельный парк iPad.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {inventoryView === 'devices' && (
              <button type="button" onClick={openCreate} disabled={categoriesLoading}
                className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50">
                + Добавить устройство
              </button>
            )}
            {inventoryView === 'accessories' && (
              <button type="button" onClick={() => setShowSmallEquipmentModal(true)}
                className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700">
                + Добавить позицию
              </button>
            )}
            {inventoryView === 'ipads' && (
              <button type="button" onClick={openCreateIpad}
                className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700">
                + Добавить iPad
              </button>
            )}
          </div>
        </div>

        <div role="tablist" aria-label="Разделы инвентаря" className="mb-5 grid grid-cols-3 rounded-xl bg-slate-100 p-1">
          <button role="tab" aria-selected={inventoryView === 'devices'} type="button" onClick={() => switchInventoryView('devices')} className={`min-h-12 rounded-lg px-2 text-xs font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500 md:text-sm lg:px-4 ${inventoryView === 'devices' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Основные устройства</button>
          <button role="tab" aria-selected={inventoryView === 'accessories'} type="button" onClick={() => switchInventoryView('accessories')} className={`min-h-12 rounded-lg px-2 text-xs font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500 md:text-sm lg:px-4 ${inventoryView === 'accessories' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Мелкая техника</button>
          <button role="tab" aria-selected={inventoryView === 'ipads'} type="button" onClick={() => switchInventoryView('ipads')} className={`min-h-12 rounded-lg px-2 text-xs font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500 md:text-sm lg:px-4 ${inventoryView === 'ipads' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Парк iPad</button>
        </div>

        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input type="text" placeholder={inventoryView === 'devices' ? 'Поиск по названию, модели, инв. номеру или штрихкоду...' : inventoryView === 'ipads' ? 'Поиск по модели, Tag или Serial Number...' : 'Поиск по названию, модели, заметке или получателю...'} value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }} />
          {inventoryView === 'devices' && <select value={catFilter} onChange={e => { setCatFilter(e.target.value); setSelectedGroup(''); setPage(1); }}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none">
            <option value="">Все категории</option>
            {categories.map(category => <option key={category.id} value={category.code}>{category.icon} {category.name}</option>)}
          </select>}
          {inventoryView === 'devices' && <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setSelectedGroup(''); setPage(1); }}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none">
            <option value="">Все статусы</option>
            {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            {inventoryStatuses.filter(option => !option.is_system).map(option => <option key={option.code} value={option.code}>{option.name}</option>)}
          </select>}
          {inventoryView === 'ipads' && <select value={ipadStatusFilter} onChange={e => { setIpadStatusFilter(e.target.value); setSelectedIpadGroup(''); setPage(1); }}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none">
            <option value="">Все статусы</option>
            {ipadStatusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>}
          {(search || catFilter || statusFilter || ipadStatusFilter) && (
            <button type="button" onClick={resetFilters}
              className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-200">
              Сбросить фильтры
            </button>
          )}
        </div>

        {inventoryView === 'devices' && groups.length > 0 && (
          <div className="mb-5 overflow-x-auto pb-2">
            <div className="flex min-w-max gap-2">
              <button type="button" onClick={() => { setSelectedGroup(''); setPage(1); }}
                className={`min-h-12 rounded-xl border px-4 text-left transition ${!selectedGroup ? 'border-blue-500 bg-blue-600 text-white shadow-sm' : 'border-gray-200 bg-white text-slate-700 hover:border-blue-300'}`}>
                <span className="block text-sm font-semibold">Все устройства</span>
                <span className={`text-xs ${!selectedGroup ? 'text-blue-100' : 'text-slate-400'}`}>{groups.reduce((sum, group) => sum + group.count, 0)} шт.</span>
              </button>
              {groups.map(group => {
                const key = groupKey(group);
                const active = selectedGroup === key;
                return (
                  <button key={key} type="button" onClick={() => { setSelectedGroup(key); setPage(1); }}
                    className={`min-h-12 rounded-xl border px-4 text-left transition ${active ? 'border-blue-500 bg-blue-600 text-white shadow-sm' : 'border-gray-200 bg-white text-slate-700 hover:border-blue-300'}`}>
                    <span className="block max-w-52 truncate text-sm font-semibold">{group.name}</span>
                    <span className={`block max-w-52 truncate text-xs ${active ? 'text-blue-100' : 'text-slate-400'}`}>
                      {group.model || 'Без модели'} · {group.count} шт.
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {inventoryView === 'ipads' && (
          <>
          {ipadGroups.length > 0 && <div className="mb-5 overflow-x-auto pb-2"><div className="flex min-w-max gap-2">
            <button type="button" onClick={() => { setSelectedIpadGroup(''); setPage(1); }} className={`min-h-12 rounded-xl border px-4 text-left transition ${!selectedIpadGroup ? 'border-blue-500 bg-blue-600 text-white shadow-sm' : 'border-gray-200 bg-white text-slate-700 hover:border-blue-300'}`}><span className="block text-sm font-semibold">Все iPad</span><span className={`text-xs ${!selectedIpadGroup ? 'text-blue-100' : 'text-slate-400'}`}>{ipadGroups.reduce((sum, group) => sum + group.count, 0)} шт.</span></button>
            {ipadGroups.map(group => { const key = `${group.device_name}\u0000${group.model}`; const active = selectedIpadGroup === key; return <button key={key} type="button" onClick={() => { setSelectedIpadGroup(key); setPage(1); }} className={`min-h-12 rounded-xl border px-4 text-left transition ${active ? 'border-blue-500 bg-blue-600 text-white shadow-sm' : 'border-gray-200 bg-white text-slate-700 hover:border-blue-300'}`}><span className="block max-w-52 truncate text-sm font-semibold">{group.device_name}</span><span className={`block max-w-52 truncate text-xs ${active ? 'text-blue-100' : 'text-slate-400'}`}>{group.model || 'Без модели'} · {group.count} шт.</span></button>; })}
          </div></div>}
          <div className="mb-5 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div><p className="text-sm font-bold text-amber-900">Контроль повторяющихся Tag</p><p className="text-xs text-amber-700">Дубликаты разрешены временно. Serial Number остаётся уникальным.</p></div>
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-amber-900"><input type="checkbox" checked={duplicateIpadTagsOnly} onChange={event => { setDuplicateIpadTagsOnly(event.target.checked); setPage(1); }} className="h-5 w-5" />Только дубликаты</label>
          </div>
          </>
        )}

        {loading ? (
          <div className="rounded-2xl bg-white px-5 py-16 text-center shadow-sm">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
            <p className="text-sm text-slate-500">Загрузка устройств...</p>
          </div>
        ) : loadError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</div>
        ) : inventoryView === 'ipads' ? (
          <>
            {ipadItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
                <p className="font-black text-slate-700">iPad не найдены</p>
                <p className="mt-1 text-sm text-slate-400">Измените фильтры или добавьте iPad.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3 font-semibold">iPad</th>
                       <th className="px-4 py-3 font-semibold" aria-sort={ipadTagOrder === 'asc' ? 'ascending' : 'descending'}>
                         <button
                           type="button"
                           onClick={() => { setIpadTagOrder(order => order === 'asc' ? 'desc' : 'asc'); setPage(1); }}
                           className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 transition hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                           title={ipadTagOrder === 'asc' ? 'Сортировать Tag по убыванию' : 'Сортировать Tag по возрастанию'}
                         >
                           Tag
                           <span className="text-base leading-none text-blue-600" aria-hidden>{ipadTagOrder === 'asc' ? '↑' : '↓'}</span>
                         </button>
                       </th>
                      <th className="px-4 py-3 font-semibold">Serial</th>
                      <th className="px-4 py-3 font-semibold">Статус</th>
                      <th className="px-4 py-3 font-semibold">У кого</th>
                      <th className="px-4 py-3 text-right font-semibold">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ipadItems.map(item => (
                      <tr key={item.id} className={`border-b border-slate-100 last:border-b-0 hover:bg-slate-50 ${item.duplicate_tag_count > 1 ? 'bg-amber-50/60' : ''}`}>
                        <td className="max-w-[200px] px-4 py-3">
                          <span className="block truncate font-bold text-slate-900" title={item.notes || undefined}>📱 {item.device_name}{item.notes ? ' 📝' : ''}</span>
                          <span className="block truncate text-xs text-slate-400">{item.model || 'Без модели'}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-slate-700">
                          {item.tag}
                          {item.duplicate_tag_count > 1 && <span className="ml-2 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">×{item.duplicate_tag_count}</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-slate-600">{item.serial_number}</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${item.status === 'AVAILABLE' ? 'bg-emerald-100 text-emerald-700' : item.status === 'MAINTENANCE' ? 'bg-red-100 text-red-700' : item.status === 'RETIRED' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-700'}`}>
                            {ipadStatusLabel(item.status)}
                          </span>
                        </td>
                        <td className="max-w-[180px] px-4 py-3">
                          {item.student_name ? (
                            item.act_id
                              ? <Link href={`/admin/acts/${item.act_id}`} className="block truncate font-bold text-blue-700 hover:text-blue-800">{item.student_name}</Link>
                              : <span className="block truncate text-slate-700">{item.student_name}</span>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <button type="button" title="Открыть историю iPad" aria-label={`Открыть историю iPad Tag ${item.tag}`} onClick={() => openIpadHistory(item.id)}
                              className="min-h-11 rounded-xl bg-slate-100 px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-200">
                              📖 История
                            </button>
                            <button type="button" title="Редактировать iPad" aria-label={`Редактировать iPad Tag ${item.tag}`} onClick={() => openEditIpad(item)}
                              className="min-h-11 rounded-xl bg-blue-50 px-3 text-xs font-bold text-blue-700 transition hover:bg-blue-100">
                              ✎ Изменить
                            </button>
                            <button type="button" aria-disabled={Boolean(ipadDeleteBlockReason(item))} title={ipadDeleteBlockReason(item) || 'Удалить iPad'} aria-label={`Удалить iPad Tag ${item.tag}`} onClick={() => requestDeleteIpad(item)}
                              className={`min-h-11 rounded-xl bg-red-50 px-3 text-xs font-bold text-red-700 transition hover:bg-red-100 ${ipadDeleteBlockReason(item) ? 'cursor-not-allowed opacity-35' : ''}`}>
                              ✕ Удалить
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : inventoryView === 'accessories' ? (
          smallEquipmentGroups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-16 text-center">
              <p className="font-semibold text-slate-700">Ручные позиции не найдены</p>
              <p className="mt-1 text-sm text-slate-400">Добавьте позицию в каталог, а количество укажите при создании акта.</p>
              <button type="button" onClick={() => setShowSmallEquipmentModal(true)} className="mt-4 min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700">
                + Добавить позицию
              </button>
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {smallEquipmentGroups.map(group => (
                <div key={group.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-800">{group.name}</p><p className="text-sm text-slate-500">{group.model || 'Без модели'}</p></div><div className="text-right"><span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-black text-blue-700">{group.active_quantity} шт.</span><p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">сейчас у получателей</p></div></div>
                  {group.active_assignments.length === 0 ? <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"><span className="text-sm text-slate-400">Активных выдач нет</span><button onClick={() => setDeleteSmallEquipmentTarget(group)} className="min-h-10 rounded-lg bg-red-50 px-3 text-xs font-bold text-red-700 hover:bg-red-100">Удалить позицию</button></div> : <div className="mt-4 space-y-2">{group.active_assignments.map(assignment => <div key={assignment.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-800">{assignment.recipient_name}</p><p className="text-xs text-slate-400">{assignment.quantity} шт. · {new Date(assignment.issue_date).toLocaleDateString('ru-RU')}</p>{assignment.note && <p className="mt-1 truncate text-xs text-slate-500">{assignment.note}</p>}</div><Link href={`/admin/acts/${assignment.act_id}`} className="min-h-10 shrink-0 rounded-lg bg-white px-3 py-2 text-xs font-bold text-blue-700 ring-1 ring-gray-200">{assignment.act_reference}</Link></div>)}</div>}
                </div>
              ))}
            </div>
          )
        ) : (
          <>
            {devices.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
                <p className="font-black text-slate-700">Устройств не найдено</p>
                <p className="mt-1 text-sm text-slate-400">Измените фильтры или добавьте устройство.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full min-w-[800px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-3 font-semibold xl:px-4">Устройство</th>
                      <th className="px-3 py-3 font-semibold xl:px-4">Категория</th>
                      <th className="px-3 py-3 font-semibold xl:px-4">Инв. номер</th>
                      <th className="px-3 py-3 font-semibold xl:px-4">Штрихкод</th>
                      <th className="px-3 py-3 font-semibold xl:px-4">Статус</th>
                      <th className="px-3 py-3 font-semibold xl:px-4">Закреплено</th>
                      <th className="px-3 py-3 text-right font-semibold xl:px-4">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devices.map(d => (
                      <tr key={d.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                        <td className="max-w-[240px] px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="shrink-0 text-lg" aria-hidden>{getCategoryIcon(d.category)}</span>
                            <span className="min-w-0">
                              <span className="block truncate font-bold text-slate-900" title={d.notes?.trim() ? `Заметка: ${d.notes}` : undefined}>{d.name}{d.notes?.trim() ? ' 📝' : ''}</span>
                              {d.model && <span className="block truncate text-xs text-slate-400">{d.model}</span>}
                            </span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600 xl:px-4">{getCategoryLabel(d.category)}</td>
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-slate-600 xl:px-4">{d.inventory_number}</td>
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-slate-600 xl:px-4">{d.barcode || '—'}</td>
                        <td className="px-3 py-3 lg:whitespace-nowrap xl:px-4">
                          <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusBadge(d.status)}`}>{getStatusLabel(d.status, inventoryStatuses)}</span>
                          {d.status === 'paper_issued' && (d.paper_act_number || d.paper_issue_date) && <span className="mt-0.5 block text-[11px] text-violet-600">Бум. акт{d.paper_act_number ? ` №${d.paper_act_number}` : ''}</span>}
                        </td>
                        <td className="max-w-[160px] px-4 py-3">
                          <span className="block truncate text-slate-600">{d.assigned_to || '—'}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => openEdit(d)} title="Редактировать устройство" aria-label={`Редактировать ${d.name}`} className="min-h-11 rounded-xl bg-slate-100 px-3 text-sm font-bold text-slate-700 transition hover:bg-blue-100 hover:text-blue-700">✎</button>
                            <button onClick={() => setDeleteTarget({ id: d.id, name: d.name })} title="Удалить устройство" aria-label={`Удалить ${d.name}`} className="min-h-11 rounded-xl bg-slate-100 px-3 text-sm font-bold text-slate-700 transition hover:bg-red-100 hover:text-red-700">✕</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        {(inventoryView === 'devices' ? total : inventoryView === 'accessories' ? manualTotal : ipadTotal) > 24 && !loading && !loadError && (
          <div className="mt-5 flex items-center justify-between rounded-xl bg-white px-4 py-3 ring-1 ring-gray-100">
            <span className="text-sm text-slate-500">Страница {page} из {Math.ceil((inventoryView === 'devices' ? total : inventoryView === 'accessories' ? manualTotal : ipadTotal) / 24)} · всего {inventoryView === 'devices' ? total : inventoryView === 'accessories' ? manualTotal : ipadTotal}</span>
            <div className="flex gap-2">
              <button type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)} className="min-h-11 rounded-lg border px-4 text-sm disabled:opacity-40">Назад</button>
              <button type="button" disabled={page >= Math.ceil((inventoryView === 'devices' ? total : inventoryView === 'accessories' ? manualTotal : ipadTotal) / 24)} onClick={() => setPage(value => value + 1)} className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm text-white disabled:opacity-40">Далее</button>
            </div>
          </div>
        )}
      </div>

      {showSmallEquipmentModal && (
        <Modal onClose={() => { if (!smallEquipmentSaving) setShowSmallEquipmentModal(false); }} title="Добавить мелкую технику">
          <p className="mb-5 text-sm leading-6 text-slate-500">Создайте позицию справочника. Количество, получатель и возврат указываются позже в акте.</p>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Название *</span>
              <input
                value={smallEquipmentForm.name}
                onChange={event => setSmallEquipmentForm(current => ({ ...current, name: event.target.value }))}
                placeholder="Например, мышь Logitech"
                className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                autoFocus
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Модель <span className="font-normal text-slate-400">(необязательно)</span></span>
              <input
                value={smallEquipmentForm.model}
                onChange={event => setSmallEquipmentForm(current => ({ ...current, model: event.target.value }))}
                placeholder="Например, M185"
                className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>
          </div>
          <div className="mt-6 flex gap-3">
            <button type="button" onClick={handleCreateSmallEquipment} disabled={smallEquipmentSaving} className="min-h-12 flex-1 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
              {smallEquipmentSaving ? 'Добавление...' : 'Добавить позицию'}
            </button>
            <button type="button" onClick={() => setShowSmallEquipmentModal(false)} disabled={smallEquipmentSaving} className="min-h-12 rounded-xl bg-slate-100 px-5 text-sm font-bold text-slate-700 disabled:opacity-50">Отмена</button>
          </div>
        </Modal>
      )}

      {showModal && (
        <Modal onClose={() => setShowModal(false)} title={editId ? 'Редактировать устройство' : bulkMode ? 'Добавить несколько устройств' : 'Добавить устройство'}>
          <div className="space-y-3">
            {!editId && (
              <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1">
                <button type="button" onClick={() => setBulkMode(false)}
                  className={`min-h-10 rounded-lg px-3 text-sm font-medium transition ${!bulkMode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                  Одно устройство
                </button>
                <button type="button" onClick={() => { setBulkMode(true); if (form.status === 'paper_issued') setForm(current => ({ ...current, status: 'available', assigned_to: '', paper_act_number: '', paper_issue_date: '' })); }}
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
                <select value={form.category} onChange={event => {
                  setForm({ ...form, category: event.target.value });
                  if (event.target.value === '__new_category__') setCategoryForm({ name: '', code: '', icon: '📦' });
                }}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none">
                  {editId && form.category && form.category !== '__new_category__' && !categories.some(category => category.code === form.category) && (
                    <option value={form.category} disabled>{form.category} (неактивна)</option>
                  )}
                  {categories.map(category => <option key={category.id} value={category.code}>{category.icon} {category.name}</option>)}
                  <option disabled>──────────</option>
                  <option value="__new_category__">Другое...</option>
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
                   {statusOptions.filter(option => option.value !== 'assigned' && (!bulkMode || option.value !== 'paper_issued')).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                   {inventoryStatuses.filter(option => !option.is_system).map(option => <option key={option.code} value={option.code}>{option.name}</option>)}
                   <option value="__other__">Другое...</option>
                 </select></div>
             </div>
             {form.category === '__new_category__' && <div className="rounded-xl border border-blue-200 bg-blue-50 p-3"><label className="mb-1 block text-xs font-bold uppercase tracking-wide text-blue-700">Название новой категории</label><div className="flex flex-col gap-2 sm:flex-row"><input autoFocus value={categoryForm.name} onChange={event => setCategoryForm({ name: event.target.value, code: '', icon: '📦' })} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void handleCreateCategory(); } }} placeholder="Например, Проектор" className="min-h-11 flex-1 rounded-xl border border-blue-200 bg-white px-3 text-sm outline-none focus:border-blue-500"/><button type="button" disabled={categorySaving} onClick={handleCreateCategory} className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-50">{categorySaving ? 'Добавление...' : 'Добавить категорию'}</button></div><p className="mt-2 text-xs text-blue-700">Значок 📦 и код создадутся автоматически. Категория сохранится для других устройств.</p></div>}
             {form.status === '__other__' && <div className="rounded-xl border border-blue-200 bg-blue-50 p-3"><label className="mb-1 block text-xs font-bold uppercase tracking-wide text-blue-700">Название нового статуса</label><div className="flex flex-col gap-2 sm:flex-row"><input autoFocus value={newStatusName} onChange={event => setNewStatusName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void createInventoryStatus(); } }} placeholder="Например, На диагностике" className="min-h-11 flex-1 rounded-xl border border-blue-200 bg-white px-3 text-sm outline-none focus:border-blue-500"/><button type="button" disabled={statusCreating} onClick={createInventoryStatus} className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-50">{statusCreating ? 'Добавление...' : 'Добавить статус'}</button></div><p className="mt-2 text-xs text-blue-700">Статус сохранится в общем списке и будет доступен для других устройств.</p></div>}
            {!bulkMode && form.status === 'paper_issued' && <div className="rounded-xl border border-violet-200 bg-violet-50 p-4"><p className="mb-3 text-sm font-bold text-violet-900">Данные бумажного акта</p><div className="space-y-3"><div><label className="mb-1 block text-xs font-medium text-violet-800">Кому выдано *</label><input value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })} placeholder="ФИО получателя" className="min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm outline-none focus:border-violet-500"/></div><div className="grid grid-cols-2 gap-3"><div><label className="mb-1 block text-xs font-medium text-violet-800">Номер акта</label><input value={form.paper_act_number} onChange={e => setForm({ ...form, paper_act_number: e.target.value })} placeholder="Например, 125" className="min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm outline-none focus:border-violet-500"/></div><div><label className="mb-1 block text-xs font-medium text-violet-800">Дата бумажного акта</label><input type="date" value={form.paper_issue_date} onChange={e => setForm({ ...form, paper_issue_date: e.target.value })} className="min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm outline-none focus:border-violet-500"/></div></div></div><p className="mt-3 text-xs text-violet-600">Устройство будет исключено из доступных для новых электронных актов.</p></div>}
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
            {!bulkMode && (
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

      {showIpadModal && (
        <Modal onClose={() => { if (!saving) { setShowIpadModal(false); setIpadEditId(null); } }} title={ipadEditId ? 'Редактировать iPad' : ipadBulk ? 'Добавить несколько iPad' : 'Добавить iPad'}>
          <div className="space-y-3">
            {!ipadEditId && <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1"><button type="button" onClick={() => setIpadBulk(false)} className={`min-h-10 rounded-lg text-sm font-bold ${!ipadBulk ? 'bg-white shadow-sm' : 'text-slate-500'}`}>Один iPad</button><button type="button" onClick={() => setIpadBulk(true)} className={`min-h-10 rounded-lg text-sm font-bold ${ipadBulk ? 'bg-white shadow-sm' : 'text-slate-500'}`}>Несколько iPad</button></div>}
            {managedIpadEdit && <p className="rounded-xl bg-amber-50 p-3 text-sm leading-5 text-amber-800">Этот iPad управляется активным актом. Можно изменить название, модель и заметку. Tag, Serial Number и статус изменяются только через акт.</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Название *</span><input value={ipadForm.device_name} onChange={event => setIpadForm({...ipadForm, device_name: event.target.value})} placeholder="iPad" className="min-h-11 w-full rounded-xl border px-3"/></label>
              <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Модель</span><input value={ipadForm.model} onChange={event => setIpadForm({...ipadForm, model: event.target.value})} placeholder="Например, 10th Gen" className="min-h-11 w-full rounded-xl border px-3"/></label>
            </div>
            <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Статус</span><select disabled={managedIpadEdit} value={ipadForm.status} onChange={event => setIpadForm({...ipadForm, status: event.target.value})} className="min-h-11 w-full rounded-xl border px-3 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500">{managedIpadEdit && <option value={ipadForm.status}>{ipadStatusLabel(ipadForm.status)}</option>}<option value="AVAILABLE">Не выдан</option><option value="MAINTENANCE">На обслуживании</option><option value="RETIRED">Списан</option></select></label>
            {ipadBulk ? <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Список Tag и Serial Number *</span><textarea value={ipadForm.list} onChange={event => setIpadForm({...ipadForm, list: event.target.value})} rows={9} placeholder={'Tag    Serial Number\n116563 DMPFJS82Q1GG'} className="w-full rounded-xl border p-3 font-mono text-sm"/></label> : <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Tag *</span><input disabled={managedIpadEdit} value={ipadForm.tag} onChange={event => setIpadForm({...ipadForm, tag: event.target.value})} placeholder="116563" className="min-h-11 w-full rounded-xl border px-3 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"/></label>
                <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Serial Number *</span><input disabled={managedIpadEdit} value={ipadForm.serial_number} onChange={event => setIpadForm({...ipadForm, serial_number: event.target.value})} placeholder="DMPFJS82Q1GG" className="min-h-11 w-full rounded-xl border px-3 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"/></label>
              </div>
              <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Заметка</span><textarea value={ipadForm.notes} onChange={event => setIpadForm({...ipadForm, notes: event.target.value})} rows={3} placeholder="Комментарий о состоянии или особенностях iPad" className="w-full rounded-xl border p-3 text-sm"/></label>
            </>}
          </div><div className="mt-5 flex gap-2"><button disabled={saving} onClick={saveIpads} className="min-h-12 flex-1 rounded-xl bg-slate-900 font-bold text-white disabled:opacity-50">{saving ? 'Сохранение...' : ipadEditId ? 'Сохранить изменения' : ipadBulk ? 'Добавить iPad' : 'Добавить iPad'}</button><button disabled={saving} onClick={() => { setShowIpadModal(false); setIpadEditId(null); }} className="min-h-12 rounded-xl bg-slate-100 px-4 disabled:opacity-50">Отмена</button></div>
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

      {ipadDeleteTarget && (
        <Modal onClose={() => { if (!ipadDeleting) setIpadDeleteTarget(null); }} title="Удалить iPad навсегда?">
          <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <p className="font-black text-slate-900">{ipadDeleteTarget.model || ipadDeleteTarget.device_name}</p>
            <p className="mt-1 font-mono text-sm text-slate-600">Tag {ipadDeleteTarget.tag}</p>
            <p className="font-mono text-xs text-slate-500">Serial Number: {ipadDeleteTarget.serial_number}</p>
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-600">Вы уверены, что хотите удалить этот iPad? Восстановить устройство после удаления будет невозможно.</p>
          <p className="mt-2 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">Удаление разрешено только для iPad без активной выдачи и без истории актов.</p>
          <div className="mt-6 flex gap-3">
            <button disabled={ipadDeleting} onClick={deleteIpad} className="min-h-12 flex-1 rounded-xl bg-red-600 px-4 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50">{ipadDeleting ? 'Удаление...' : 'Удалить навсегда'}</button>
            <button disabled={ipadDeleting} onClick={() => setIpadDeleteTarget(null)} className="min-h-12 rounded-xl bg-gray-100 px-4 text-sm font-medium text-gray-700 disabled:opacity-50">Отмена</button>
          </div>
        </Modal>
      )}

      {deleteSmallEquipmentTarget && (
        <Modal onClose={() => { if (!deletingSmallEquipment) setDeleteSmallEquipmentTarget(null); }} title="Удалить мелкую технику?">
          <p className="text-sm text-slate-600">Точно удалить позицию <span className="font-bold text-slate-900">{deleteSmallEquipmentTarget.name}{deleteSmallEquipmentTarget.model ? ` · ${deleteSmallEquipmentTarget.model}` : ''}</span> из справочника?</p>
          <p className="mt-2 text-xs text-slate-400">История в завершённых актах сохранится. Позиция больше не будет доступна для новых выдач.</p>
          <div className="mt-6 flex gap-3">
            <button disabled={deletingSmallEquipment} onClick={handleDeleteSmallEquipment} className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{deletingSmallEquipment ? 'Удаление...' : 'Удалить'}</button>
            <button disabled={deletingSmallEquipment} onClick={() => setDeleteSmallEquipmentTarget(null)} className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm text-gray-700">Отмена</button>
          </div>
        </Modal>
      )}

      {/* Паспорт iPad: вся история устройства */}
      {(ipadHistory || ipadHistoryLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onClick={() => { setIpadHistory(null); setIpadHistoryLoading(false); }}>
          <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-3xl bg-white p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            {ipadHistoryLoading || !ipadHistory ? (
              <p className="py-12 text-center text-sm text-slate-400">Загрузка истории...</p>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Паспорт устройства</p>
                    <h2 className="mt-1 truncate text-xl font-black">{ipadHistory.device.model || ipadHistory.device.device_name}</h2>
                    <p className="mt-1 font-mono text-sm text-slate-500">Tag {ipadHistory.device.tag} · SN {ipadHistory.device.serial_number}</p>
                  </div>
                  <button onClick={() => setIpadHistory(null)} className="min-h-11 shrink-0 rounded-xl bg-slate-100 px-4 font-bold">Закрыть</button>
                </div>
                <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto">
                  {ipadHistory.events.length === 0 ? (
                    <div className="rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-400">Событий пока нет — iPad ещё не выдавался.</div>
                  ) : (
                    ipadHistory.events.map((event, index) => (
                      <div key={`${event.act_id}-${index}`} className="rounded-2xl bg-slate-50 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900">{event.title}</p>
                            {event.detail && <p className="mt-0.5 truncate text-sm text-slate-500">{event.detail}</p>}
                          </div>
                          <span className="shrink-0 text-xs text-slate-400">{new Date(event.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        {event.act_id && <Link href={`/admin/acts/${event.act_id}`} className="mt-2 inline-block text-sm font-bold text-blue-600 hover:text-blue-700">Открыть акт →</Link>}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6" onClick={e => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-lg font-black text-slate-900">{title}</h2>
          <button onClick={onClose} aria-label="Закрыть" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
