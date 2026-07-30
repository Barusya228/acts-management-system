'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

interface Recipient {
  participant_id?: string;
  full_name: string;
  email: string;
}

interface EquipmentItem { inventory_device_id?: string; name: string; serial: string; }
interface AccessoryItem { name: string; model: string; quantity: number; note: string; requires_return: boolean; }

interface TemplateOption { id: string; code: string; name: string; }
interface DeviceOption { id: string; name: string; model?: string; category: string; category_name: string; category_icon: string; serial_number: string; inventory_number: string; barcode: string; }
interface ParticipantOption { id: string; full_name: string; kind: string; email?: string | null; }

function CreateActForm() {
  const { user, loading, loginAsGuest } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedTemplateId = searchParams.get('template_id') || '';
  const preselectedCode = searchParams.get('code') || '';
  const { showToast } = useToast();

  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [participants, setParticipants] = useState<ParticipantOption[]>([]);
  const [templateId, setTemplateId] = useState(preselectedTemplateId);
  const [deviceSerial, setDeviceSerial] = useState('');
  const [party1ParticipantId, setParty1ParticipantId] = useState('');
  const [party1, setParty1] = useState('');
  const [party2, setParty2] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [recipients, setRecipients] = useState<Recipient[]>([{ full_name: '', email: '' }]);
  const [focusedRecipient, setFocusedRecipient] = useState(-1);
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [accessories, setAccessories] = useState<AccessoryItem[]>([]);
  const [advisoryNote, setAdvisoryNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [devicePickerOpen, setDevicePickerOpen] = useState(false);
  const [devicePickerTarget, setDevicePickerTarget] = useState<'main' | number>('main');
  const [deviceSearch, setDeviceSearch] = useState('');
  const [deviceCategory, setDeviceCategory] = useState('');
  const [expandedDeviceGroup, setExpandedDeviceGroup] = useState('');
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [devicesError, setDevicesError] = useState('');

  const employees = participants.filter(p => p.kind === 'EMPLOYEE' || p.kind === 'BOTH');
  const currentQuery = focusedRecipient >= 0 ? (recipients[focusedRecipient]?.full_name || '').trim() : '';
  const suggestions = currentQuery.length >= 2
    ? employees.filter(p => p.full_name.toLowerCase().includes(currentQuery.toLowerCase())).slice(0, 5)
    : [];

  const selectEmployee = (idx: number, participant: ParticipantOption) => {
    setRecipients(prev => prev.map((r, i) => i === idx ? {
      participant_id: participant.id,
      full_name: participant.full_name,
      email: participant.email || '',
    } : r));
    setFocusedRecipient(-1);
  };

  const selectedTemplate = templates.find(t => t.id === templateId);
  const selectedDevice = devices.find(d => d.serial_number === deviceSerial);
  const isIpad = selectedTemplate?.code === 'IPAD';
  const isSingle = selectedTemplate?.code === 'GENERIC_ONE';

  useEffect(() => {
    if (!loading && !user) loginAsGuest();
  }, [loading, user, loginAsGuest]);

  useEffect(() => {
    if (user) {
      api.get('/api/templates?is_active=true').then(r => {
        const list = Array.isArray(r.data) ? r.data : [];
        setTemplates(list);
        if (!templateId && preselectedCode && list.length > 0) {
          const found = list.find((t: TemplateOption) => t.code === preselectedCode);
          setTemplateId(found ? found.id : list[0].id);
        } else if (!templateId && list.length > 0) {
          setTemplateId(list[0].id);
        }
      }).catch(() => {});
      setDevicesLoading(true);
      setDevicesError('');
      api.get('/api/inventory/available')
        .then(r => setDevices(Array.isArray(r.data) ? r.data : []))
        .catch(() => {
          setDevices([]);
          setDevicesError('Не удалось загрузить доступные устройства');
        })
        .finally(() => setDevicesLoading(false));
      api.get('/api/participants?is_active=true').then(r => setParticipants(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    }
  }, [user, templateId]);

  const handleDeviceSelect = (serial: string) => setDeviceSerial(serial);

  const openDevicePicker = (target: 'main' | number) => {
    setDevicePickerTarget(target);
    setDeviceSearch('');
    setDeviceCategory('');
    setExpandedDeviceGroup('');
    setDevicePickerOpen(true);
  };

  const chooseDevice = (device: DeviceOption) => {
    if (devicePickerTarget === 'main') {
      handleDeviceSelect(device.serial_number);
    } else {
      updateEquipmentDevice(devicePickerTarget, device.id);
    }
    setDevicePickerOpen(false);
  };

  const selectedDeviceIds = new Set([
    ...(devicePickerTarget === 'main' ? [] : [selectedDevice?.id]),
    ...equipment
      .filter((_, index) => devicePickerTarget !== index)
      .map(item => item.inventory_device_id),
  ].filter((id): id is string => Boolean(id)));
  const normalizedDeviceSearch = deviceSearch.trim().toLowerCase();
  const visibleDevices = devices.filter(device => {
    if (selectedDeviceIds.has(device.id)) return false;
    if (deviceCategory && device.category !== deviceCategory) return false;
    if (!normalizedDeviceSearch) return true;
    return [device.name, device.model, device.inventory_number, device.barcode]
      .some(value => String(value || '').toLowerCase().includes(normalizedDeviceSearch));
  });
  const deviceGroups = Array.from(visibleDevices.reduce((groups, device) => {
    const key = `${device.name}\u0000${device.model || ''}`;
    const current = groups.get(key) || { key, name: device.name, model: device.model || '', devices: [] as DeviceOption[] };
    current.devices.push(device);
    groups.set(key, current);
    return groups;
  }, new Map<string, { key: string; name: string; model: string; devices: DeviceOption[] }>()).values());
  const deviceCategories = Array.from(devices.reduce((categories, device) => {
    if (!categories.has(device.category)) {
      categories.set(device.category, {
        code: device.category,
        name: device.category_name || device.category,
        icon: device.category_icon || '📦',
      });
    }
    return categories;
  }, new Map<string, { code: string; name: string; icon: string }>()).values()).sort((left, right) => left.name.localeCompare(right.name, 'ru'));

  const updateRecipient = (i: number, field: 'full_name' | 'email', value: string) => {
    setRecipients(prev => prev.map((r, idx) => idx === i
      ? { ...r, [field]: value, ...(field === 'full_name' ? { participant_id: undefined } : {}) }
      : r));
  };

  const addRecipient = () => setRecipients(prev => [...prev, { full_name: '', email: '' }]);
  const removeRecipient = (i: number) => setRecipients(prev => prev.filter((_, idx) => idx !== i));

  const filledRecipients = recipients.filter(r => r.full_name.trim() || r.email.trim());

  const addEquipment = () => setEquipment(prev => [...prev, { name: '', serial: '' }]);
  const removeEquipment = (i: number) => setEquipment(prev => prev.filter((_, idx) => idx !== i));
  const updateEquipmentDevice = (i: number, deviceId: string) => {
    const device = devices.find(item => item.id === deviceId);
    setEquipment(prev => prev.map((item, idx) => idx === i ? {
      inventory_device_id: device?.id,
      name: device?.name || '',
      serial: device?.inventory_number || '',
    } : item));
  };
  const addAccessory = () => setAccessories(items => [...items, { name: '', model: '', quantity: 1, note: '', requires_return: true }]);
  const updateAccessory = (index: number, patch: Partial<AccessoryItem>) => setAccessories(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const removeAccessory = (index: number) => setAccessories(items => items.filter((_, itemIndex) => itemIndex !== index));

  const handleSubmit = async () => {
    if (!templateId) { showToast('Выберите шаблон', 'error'); return; }
    if (!selectedDevice) { showToast('Выберите доступное устройство', 'error'); return; }
    if (!party1ParticipantId) { showToast('Выберите выдающего из справочника', 'error'); return; }
    const normalized = recipients.filter(r => r.full_name.trim() && r.email.trim());
    if (normalized.length === 0) { showToast('Добавьте получателя', 'error'); return; }
    if (normalized.some(r => !r.participant_id)) { showToast('Выберите каждого получателя из справочника', 'error'); return; }
    if (accessories.some(item => !item.name.trim() || item.quantity < 1)) { showToast('Заполните название и количество мелкой техники', 'error'); return; }

    setSaving(true);
    try {
      const name = selectedDevice?.name || '';
      const serial = selectedDevice?.serial_number || '';
      const party2Str = normalized.map(r => r.full_name).join(', ');

      const res = await api.post('/api/acts', {
        template_id: templateId,
        inventory_device_id: selectedDevice.id,
        party1_participant_id: party1ParticipantId,
        party1_name: party1,
        party2_name: party2Str,
        issue_date: new Date(issueDate).toISOString(),
        item_name: name || 'Техника',
        item_serial: serial || '',
        receiver_email: normalized[0].email,
        extra_data_json: {
          recipients: normalized.map(r => ({ participant_id: r.participant_id, full_name: r.full_name, email: r.email })),
          ...(advisoryNote.trim() ? { advisory_note: advisoryNote.trim() } : {}),
          ...(equipment.length > 0 ? { equipment_list: equipment.filter(e => e.inventory_device_id) } : {}),
          ...(accessories.length > 0 ? { accessories: accessories.map(item => ({ ...item, name: item.name.trim(), model: item.model.trim(), note: item.note.trim() })) } : {}),
        },
      });
      showToast('Акт создан', 'success');
      router.push(`/acts/${res.data.id}`);
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Ошибка', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-400">Загрузка...</div>;
  }

  if (user.role === 'ADMIN') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <p className="text-slate-600">Администратор</p>
          <Link href="/admin/acts/create" className="mt-2 inline-block text-blue-600 underline">Перейти в админ-панель</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="flex items-center justify-between bg-white px-5 py-3 shadow-sm">
        <div className="flex items-center gap-4">
          <Link href="/guest" className="text-sm text-slate-500 hover:text-slate-700">← Назад</Link>
          <h1 className="text-lg font-bold">Новый акт</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/guest" className="text-xs text-slate-400 hover:text-slate-600">Гость</Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl p-4 lg:flex lg:gap-5 lg:p-6">
        {/* LEFT — inputs (60%) */}
        <div className="flex-1 space-y-4">
          {/* Static template */}
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
            <span className="text-xs font-medium text-blue-500">Шаблон</span>
            <p className="mt-0.5 text-sm font-bold text-slate-800">{selectedTemplate?.name || '—'}</p>
          </div>

          <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
            <div>
              <label className="mb-2 block text-xs font-medium text-slate-500">Основное устройство</label>
              {selectedDevice ? (
                <div className="flex items-center justify-between gap-3 rounded-xl bg-blue-50 p-3 ring-1 ring-blue-200">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-800">{selectedDevice.name}</p>
                    {selectedDevice.model && <p className="truncate text-xs text-slate-500">{selectedDevice.model}</p>}
                    <p className="mt-1 text-xs text-blue-700">Инв: {selectedDevice.inventory_number} · ШК: {selectedDevice.barcode}</p>
                  </div>
                  <button type="button" onClick={() => openDevicePicker('main')} className="min-h-11 shrink-0 rounded-lg bg-white px-3 text-sm font-semibold text-blue-700 shadow-sm">Заменить</button>
                </div>
              ) : (
                <button type="button" disabled={devicesLoading || devices.length === 0} onClick={() => openDevicePicker('main')}
                  className="min-h-14 w-full rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 text-sm font-semibold text-blue-700 disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400">
                  {devicesLoading ? 'Загрузка устройств...' : devicesError || (devices.length ? 'Найти или отсканировать устройство' : 'Нет доступных устройств')}
                </button>
              )}
            </div>
            <div className="border-t border-gray-100 pt-3">
              <label className="mb-2 block text-xs font-medium text-slate-500">Дополнительные устройства</label>
              {equipment.length === 0 ? (
                <p className="py-2 text-xs text-slate-400">Не добавлены</p>
              ) : (
                <div className="mb-2 space-y-2">
                  {equipment.map((item, i) => (
                    <div key={i} className="flex min-h-12 items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                      <button type="button" onClick={() => openDevicePicker(i)} className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-sm font-semibold text-slate-700">{item.name || 'Выберите устройство'}</span>
                        {item.inventory_device_id && <span className="block truncate text-xs text-slate-400">Инв: {item.serial}</span>}
                      </button>
                      <button type="button" onClick={() => removeEquipment(i)}
                        className="min-h-11 rounded-lg px-3 text-slate-400 hover:bg-red-50 hover:text-red-500">✕</button>
                    </div>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => { const nextIndex = equipment.length; addEquipment(); openDevicePicker(nextIndex); }}
                className="min-h-11 rounded-lg border border-dashed border-slate-300 px-4 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-500">
                + Добавить
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-800">Мелкая техника</p>
                <p className="text-xs text-slate-400">Добавляется вручную без инвентарного номера и штрихкода.</p>
              </div>
              <button type="button" onClick={addAccessory} className="min-h-11 rounded-lg bg-slate-100 px-4 text-sm font-semibold text-slate-700">+ Добавить</button>
            </div>
            {accessories.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 py-6 text-center text-sm text-slate-400">Мелкая техника не добавлена</div>
            ) : (
              <div className="space-y-3">
                {accessories.map((item, index) => (
                  <div key={index} className="rounded-xl bg-slate-50 p-3 ring-1 ring-gray-100">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input value={item.name} onChange={event => updateAccessory(index, { name: event.target.value })} placeholder="Название *" className="min-h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-400" />
                      <input value={item.model} onChange={event => updateAccessory(index, { model: event.target.value })} placeholder="Модель" className="min-h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-400" />
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-[120px_1fr]">
                      <input type="number" min="1" value={item.quantity} onChange={event => updateAccessory(index, { quantity: Number(event.target.value) })} className="min-h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-400" aria-label="Количество" />
                      <input value={item.note} onChange={event => updateAccessory(index, { note: event.target.value })} placeholder="Заметка" className="min-h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-400" />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <label className="flex min-h-11 items-center gap-2 text-sm text-slate-600">
                        <input type="checkbox" checked={item.requires_return} onChange={event => updateAccessory(index, { requires_return: event.target.checked })} className="h-5 w-5 rounded border-gray-300" />
                        Требуется возврат
                      </label>
                      <button type="button" onClick={() => removeAccessory(index)} className="min-h-11 rounded-lg px-3 text-sm font-medium text-red-600 hover:bg-red-50">Удалить</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Party1 + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">👤 Кто выдаёт</label>
              <select value={party1ParticipantId} onChange={e => {
                const participant = participants.find(p => p.id === e.target.value);
                setParty1ParticipantId(e.target.value);
                setParty1(participant?.full_name || '');
              }}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400">
                <option value="">Выберите выдающего</option>
                {participants.filter(p => p.kind === 'IT_MANAGER' || p.kind === 'BOTH').map(p => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">📅 Дата выдачи</label>
              <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400" />
            </div>
          </div>

          {/* Recipients */}
          <div>
            <label className="mb-2 block text-xs font-medium text-slate-500">👥 Получатели</label>
              <div className="space-y-2">
              {recipients.map((r, i) => (
                <div key={i} className="relative">
                  <div className="flex items-center gap-2">
                    <input type="text" value={r.full_name}
                      onChange={e => { updateRecipient(i, 'full_name', e.target.value); setFocusedRecipient(i); }}
                      onFocus={() => { setFocusedRecipient(i); }}
                      onBlur={() => setTimeout(() => setFocusedRecipient(-1), 200)}
                      placeholder="ФИО" autoComplete="off"
                      className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400" />
                    <input type="email" value={r.email} onChange={e => updateRecipient(i, 'email', e.target.value)}
                      placeholder="Email" autoComplete="off"
                      className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400" />
                    {recipients.length > 1 && !isSingle && (
                      <button type="button" onClick={() => removeRecipient(i)}
                        className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500">✕</button>
                    )}
                  </div>
                  {focusedRecipient === i && suggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                      {suggestions.map(p => (
                        <button key={p.id} type="button"
                          onMouseDown={() => selectEmployee(i, p)}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-blue-50 transition">
                          <span>👤</span>
                          <span className="flex-1 font-medium text-slate-700">{p.full_name}</span>
                          {p.email && <span className="text-xs text-slate-400">{p.email}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {!isSingle && (
            <button type="button" onClick={addRecipient}
              className="mt-2 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-500">
              + Добавить получателя
            </button>
            )}
          </div>

          {/* iPad specific */}
          {isIpad && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">📝 Поле для эдвайзери</label>
              <textarea rows={2} value={advisoryNote} onChange={e => setAdvisoryNote(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400" placeholder="Advisory note" />
            </div>
          )}

          {/* Submit */}
          <button type="button" onClick={handleSubmit} disabled={saving}
            className="w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-50">
            {saving ? 'Создание...' : '✨ Создать акт'}
          </button>
        </div>

        {/* RIGHT — preview (40%), hidden on mobile */}
        <div className="hidden lg:block lg:w-[360px] shrink-0">
          <div className="sticky top-6 space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Что создаётся</h3>
              <dl className="space-y-3">
                <div>
                  <dt className="text-xs text-slate-400">Шаблон</dt>
                  <dd className="text-sm font-semibold text-slate-800">{selectedTemplate?.name || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Устройство</dt>
                  <dd className="text-sm font-semibold text-slate-800">{selectedDevice?.name || '—'}</dd>
                  {selectedDevice && <dd className="text-xs text-slate-400">Инв: {selectedDevice.inventory_number} · ШК: {selectedDevice.barcode}</dd>}
                </div>
                {equipment.filter(e => e.name.trim()).length > 0 && (
                  <div>
                    <dt className="text-xs text-slate-400">Доп. устройства</dt>
                    {equipment.filter(e => e.name.trim()).map((e, i) => (
                      <dd key={i} className="text-sm text-slate-700">• {e.name}{e.serial ? ` (SN: ${e.serial})` : ''}</dd>
                    ))}
                  </div>
                )}
                {accessories.length > 0 && (
                  <div>
                    <dt className="text-xs text-slate-400">Мелкая техника</dt>
                    {accessories.map((item, index) => (
                      <dd key={index} className="text-sm text-slate-700">• {item.name || 'Без названия'}{item.model ? ` · ${item.model}` : ''} · {item.quantity} шт.</dd>
                    ))}
                  </div>
                )}
                <div>
                  <dt className="text-xs text-slate-400">Выдаёт</dt>
                  <dd className="text-sm font-semibold text-slate-800">{party1 || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Получатели</dt>
                  {filledRecipients.map((r, i) => (
                    <dd key={i} className="text-sm text-slate-700">{r.full_name || '...'}</dd>
                  ))}
                </div>
                {isIpad && advisoryNote.trim() && (
                  <div>
                    <dt className="text-xs text-slate-400">Эдвайзери</dt>
                    <dd className="text-sm text-slate-700">{advisoryNote}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs text-slate-400">Дата</dt>
                  <dd className="text-sm font-semibold text-slate-800">{new Date(issueDate).toLocaleDateString('ru-RU')}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>
      {devicePickerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/45 p-0 sm:p-4">
          <div className="mx-auto flex h-full max-w-4xl flex-col bg-slate-50 shadow-2xl sm:rounded-2xl">
            <div className="border-b border-gray-200 bg-white p-4 sm:rounded-t-2xl">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Выбор устройства</p>
                  <h2 className="text-lg font-bold text-slate-900">Найдите модель или отсканируйте штрихкод</h2>
                </div>
                <button type="button" onClick={() => setDevicePickerOpen(false)} className="min-h-11 rounded-xl bg-slate-100 px-4 text-sm font-semibold text-slate-600">Закрыть</button>
              </div>
              <input autoFocus value={deviceSearch} onChange={event => { setDeviceSearch(event.target.value); setExpandedDeviceGroup(''); }}
                className="min-h-12 w-full rounded-xl border border-gray-200 px-4 text-base outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                placeholder="Штрихкод, инвентарный номер, название или модель" />
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                <button type="button" onClick={() => setDeviceCategory('')}
                  className={`min-h-10 shrink-0 rounded-lg px-4 text-sm font-medium ${!deviceCategory ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Все</button>
                {deviceCategories.map(category => (
                  <button key={category.code} type="button" onClick={() => setDeviceCategory(category.code)}
                    className={`min-h-10 shrink-0 rounded-lg px-4 text-sm font-medium ${deviceCategory === category.code ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{category.icon} {category.name}</button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {deviceGroups.length === 0 ? (
                <div className="py-16 text-center text-sm text-slate-500">Доступные устройства не найдены</div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {deviceGroups.map(group => {
                    const expanded = expandedDeviceGroup === group.key || group.devices.length === 1;
                    return (
                      <div key={group.key} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                        <button type="button" onClick={() => setExpandedDeviceGroup(expandedDeviceGroup === group.key ? '' : group.key)}
                          className="flex min-h-20 w-full items-center justify-between gap-3 p-4 text-left">
                          <div className="min-w-0">
                            <p className="truncate font-bold text-slate-900">{group.name}</p>
                            <p className="truncate text-sm text-slate-500">{group.model || 'Без модели'}</p>
                          </div>
                          <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">Доступно {group.devices.length}</span>
                        </button>
                        {expanded && (
                          <div className="space-y-2 border-t border-gray-100 bg-slate-50 p-3">
                      {group.devices.map(device => (
                              <button key={device.id} type="button" onClick={() => chooseDevice(device)}
                                className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-left ring-1 ring-gray-200 transition hover:ring-blue-400">
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-semibold text-slate-800">Инв: {device.inventory_number}</span>
                                  <span className="block truncate text-xs text-slate-500">ШК: {device.barcode}</span>
                                </span>
                                <span className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">Выбрать</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CreateActV2Page() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-400">Загрузка...</div>
    }>
      <CreateActForm />
    </Suspense>
  );
}
