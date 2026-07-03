'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

interface Recipient {
  full_name: string;
  email: string;
}

interface EquipmentItem { name: string; serial: string; }

interface TemplateOption { id: string; code: string; name: string; }
interface DeviceOption { id: string; name: string; serial_number: string; inventory_number: string; }
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
  const [party1, setParty1] = useState('');
  const [party2, setParty2] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [recipients, setRecipients] = useState<Recipient[]>([{ full_name: '', email: '' }]);
  const [focusedRecipient, setFocusedRecipient] = useState(-1);
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [advisoryNote, setAdvisoryNote] = useState('');
  const [saving, setSaving] = useState(false);

  const employees = participants.filter(p => p.kind === 'EMPLOYEE' || p.kind === 'BOTH');
  const currentQuery = focusedRecipient >= 0 ? (recipients[focusedRecipient]?.full_name || '').trim() : '';
  const suggestions = currentQuery.length >= 2
    ? employees.filter(p => p.full_name.toLowerCase().includes(currentQuery.toLowerCase())).slice(0, 5)
    : [];

  const selectEmployee = (idx: number, name: string, email: string) => {
    setRecipients(prev => prev.map((r, i) => i === idx ? { full_name: name, email } : r));
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
      api.get('/api/inventory/available').then(r => setDevices(Array.isArray(r.data) ? r.data : [])).catch(() => {});
      api.get('/api/participants?is_active=true').then(r => setParticipants(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    }
  }, [user, templateId]);

  const handleDeviceSelect = (serial: string) => setDeviceSerial(serial);

  const updateRecipient = (i: number, field: 'full_name' | 'email', value: string) => {
    setRecipients(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  };

  const addRecipient = () => setRecipients(prev => [...prev, { full_name: '', email: '' }]);
  const removeRecipient = (i: number) => setRecipients(prev => prev.filter((_, idx) => idx !== i));

  const filledRecipients = recipients.filter(r => r.full_name.trim() || r.email.trim());

  const addEquipment = () => setEquipment(prev => [...prev, { name: '', serial: '' }]);
  const removeEquipment = (i: number) => setEquipment(prev => prev.filter((_, idx) => idx !== i));
  const updateEquipment = (i: number, field: 'name' | 'serial', value: string) => {
    setEquipment(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item));
  };

  const handleSubmit = async () => {
    if (!templateId) { showToast('Выберите шаблон', 'error'); return; }
    const normalized = recipients.filter(r => r.full_name.trim() && r.email.trim());
    if (normalized.length === 0) { showToast('Добавьте получателя', 'error'); return; }

    setSaving(true);
    try {
      const name = selectedDevice?.name || '';
      const serial = selectedDevice?.serial_number || '';
      const party2Str = normalized.map(r => r.full_name).join(', ');

      const res = await api.post('/api/acts', {
        template_id: templateId,
        party1_name: party1 || 'IT-Отдел',
        party2_name: party2Str,
        issue_date: new Date(issueDate).toISOString(),
        item_name: name || 'Техника',
        item_serial: serial || '',
        receiver_email: normalized[0].email,
        extra_data_json: {
          recipients: normalized.map(r => ({ full_name: r.full_name, email: r.email })),
          ...(advisoryNote.trim() ? { advisory_note: advisoryNote.trim() } : {}),
          ...(equipment.length > 0 ? { equipment_list: equipment.filter(e => e.name.trim() || e.serial.trim()) } : {}),
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

          {/* Device + Additional equipment row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">📦 Устройство</label>
              {devices.length > 0 ? (
                <select value={deviceSerial} onChange={e => handleDeviceSelect(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400">
                  <option value="">Не выбрано</option>
                  {devices.map(d => <option key={d.id} value={d.serial_number}>{d.name} — {d.serial_number}</option>)}
                </select>
              ) : (
                <input type="text" disabled className="w-full rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm text-slate-400" value="Нет доступных" />
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">🖥️ Доп. устройства</label>
              {equipment.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">Нет дополнительных</p>
              ) : (
                <div className="space-y-1.5 mb-2">
                  {equipment.map((item, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input type="text" value={item.name} onChange={e => updateEquipment(i, 'name', e.target.value)}
                        placeholder="Название" className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-400" />
                      <input type="text" value={item.serial} onChange={e => updateEquipment(i, 'serial', e.target.value)}
                        placeholder="SN" className="w-24 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-400" />
                      <button type="button" onClick={() => removeEquipment(i)}
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 text-xs">✕</button>
                    </div>
                  ))}
                </div>
              )}
              <button type="button" onClick={addEquipment}
                className="rounded-lg border border-dashed border-slate-300 px-2 py-1.5 text-xs text-slate-500 hover:border-blue-400 hover:text-blue-500">
                + Добавить
              </button>
            </div>
          </div>

          {/* Party1 + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">👤 Кто выдаёт</label>
              <select value={party1} onChange={e => setParty1(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400">
                <option value="">IT-Отдел (по умолчанию)</option>
                {participants.filter(p => p.kind === 'IT_MANAGER' || p.kind === 'BOTH').map(p => (
                  <option key={p.id} value={p.full_name}>{p.full_name}</option>
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
                          onMouseDown={() => selectEmployee(i, p.full_name, p.email || '')}
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
                  {selectedDevice && <dd className="text-xs text-slate-400">SN: {selectedDevice.serial_number}</dd>}
                </div>
                {equipment.filter(e => e.name.trim()).length > 0 && (
                  <div>
                    <dt className="text-xs text-slate-400">Доп. устройства</dt>
                    {equipment.filter(e => e.name.trim()).map((e, i) => (
                      <dd key={i} className="text-sm text-slate-700">• {e.name}{e.serial ? ` (SN: ${e.serial})` : ''}</dd>
                    ))}
                  </div>
                )}
                <div>
                  <dt className="text-xs text-slate-400">Выдаёт</dt>
                  <dd className="text-sm font-semibold text-slate-800">{party1 || 'IT-Отдел'}</dd>
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
