'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import SignaturePad from '@/components/SignaturePad';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

interface Student { id: string; student_name: string; student_status: string; ipad_name: string; ipad_model?: string; ipad_tag: string; serial_number?: string; imei?: string; note?: string; status: string; events: any[]; }
interface AvailableIpad { id: string; device_name: string; model?: string; tag: string; serial_number: string; }
interface IpadAct { id: string; advisory_group: string; academic_year: string; issue_date: string; issuer: string; issuer_participant_id: string; responsibles: Array<{ participant_id: string; full_name: string; email: string; signed_at?: string }>; status: string; current_version: number; students: Student[]; }

export default function IpadActPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading, loginAsGuest } = useAuth();
  const { showToast } = useToast();
  const [act, setAct] = useState<IpadAct | null>(null);
  const [signature, setSignature] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [operation, setOperation] = useState<'departure' | 'replacement' | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [availableIpads, setAvailableIpads] = useState<AvailableIpad[]>([]);

  useEffect(() => { if (!loading && !user) loginAsGuest(); }, [loading, user, loginAsGuest]);
  const load = async () => { try { setAct((await api.get(`/api/ipad-acts/${id}`)).data); } catch { showToast('Не удалось загрузить iPad-акт', 'error'); } };
  useEffect(() => { if (user) load(); }, [user, id]);

  if (!act) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-400">Загрузка...</div>;
  const pendingResponsible = act.responsibles.find(item => !item.signed_at);
  const canIssuerSign = act.status === 'SIGNED_PARTY2';
  const sign = async () => {
    if (!signature) { showToast('Сохраните подпись', 'error'); return; }
    const party = pendingResponsible ? 'party2' : 'party1';
    const participantId = pendingResponsible?.participant_id || act.issuer_participant_id;
    setBusy(true);
    try { await api.post(`/api/acts/${id}/sign/${party}`, { signature_data: signature, participant_id: participantId }); setSignature(''); await load(); showToast('Подпись сохранена', 'success'); }
    catch (error: any) { showToast(error.response?.data?.detail || 'Ошибка подписания', 'error'); }
    finally { setBusy(false); }
  };
  const openReplacement = async (student: Student) => {
    try { setAvailableIpads((await api.get('/api/ipad-inventory/available')).data || []); }
    catch { setAvailableIpads([]); showToast('Не удалось загрузить свободные iPad', 'error'); }
    setSelectedStudent(student); setOperation('replacement'); setForm({ replacement_date: new Date().toISOString().slice(0,10) });
  };
  const submitOperation = async () => {
    if (!selectedStudent || !operation) return;
    setBusy(true);
    try {
      const path = operation === 'departure' ? 'departure' : 'replacement';
      await api.post(`/api/ipad-acts/${id}/students/${selectedStudent.id}/${path}`, form);
      setOperation(null); setSelectedStudent(null); setForm({}); await load(); showToast(operation === 'departure' ? 'Выбытие оформлено' : 'Замена оформлена', 'success');
    } catch (error: any) { showToast(error.response?.data?.detail || 'Операция не выполнена', 'error'); }
    finally { setBusy(false); }
  };

  return <div className="min-h-screen bg-slate-50"><header className="flex items-center justify-between bg-white px-5 py-3 shadow-sm"><Link href="/guest" className="text-sm text-slate-500">← К актам</Link><span className="font-bold">iPad advisory</span><a href={`/api/acts/${id}/preview/pdf`} target="_blank" className="text-sm font-semibold text-blue-600">PDF</a></header><main className="mx-auto max-w-6xl space-y-5 p-4 lg:p-6">
    <section className="rounded-2xl bg-gradient-to-br from-indigo-800 to-blue-600 p-6 text-white shadow-xl"><p className="text-sm text-blue-200">Advisory · {act.academic_year}</p><h1 className="mt-1 text-3xl font-black">{act.advisory_group}</h1><div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full bg-white/15 px-3 py-1 text-sm">{act.students.length} учеников</span><span className="rounded-full bg-white/15 px-3 py-1 text-sm">{act.responsibles.length} ответственных</span><span className="rounded-full bg-white/15 px-3 py-1 text-sm">{act.status}</span></div></section>
    <section className="grid gap-4 lg:grid-cols-[1fr_360px]"><div className="space-y-3">{act.students.map(student => <article key={student.id} className="rounded-2xl border bg-white p-4 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold text-slate-900">{student.student_name}</p><p className="text-sm text-slate-500">{student.ipad_name} {student.ipad_model || ''}</p></div><div className="text-right"><p className="font-mono text-sm font-bold text-blue-700">{student.ipad_tag}</p><p className="text-xs text-slate-400">{student.status} · {student.student_status}</p></div></div>{student.note && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-sm text-slate-600">{student.note}</p>}{act.status === 'COMPLETED' && student.student_status === 'ACTIVE' && <div className="mt-3 flex gap-2"><button onClick={() => openReplacement(student)} className="min-h-11 rounded-xl bg-blue-50 px-4 text-sm font-bold text-blue-700">Заменить iPad</button><button onClick={() => { setSelectedStudent(student); setOperation('departure'); setForm({ departure_date: new Date().toISOString().slice(0,10), ipad_returned: true }); }} className="min-h-11 rounded-xl bg-amber-50 px-4 text-sm font-bold text-amber-700">Оформить выбытие</button></div>}</article>)}</div>
    <aside className="space-y-4"><div className="rounded-2xl bg-white p-4 shadow-sm"><h2 className="font-bold">Подписи ответственных</h2><div className="mt-3 space-y-2">{act.responsibles.map(item => <div key={item.participant_id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><span className="text-sm font-semibold">{item.full_name}</span><span className={item.signed_at ? 'text-emerald-600' : 'text-amber-600'}>{item.signed_at ? '✓' : 'Ожидает'}</span></div>)}</div><div className="mt-3 rounded-xl bg-slate-900 p-3 text-sm text-white">IT: {act.issuer}<span className="float-right">{act.status === 'COMPLETED' ? '✓' : canIssuerSign ? 'Текущий шаг' : 'Ожидает'}</span></div></div>{(pendingResponsible || canIssuerSign) && <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="mb-3 font-bold">{pendingResponsible ? `Подписывает: ${pendingResponsible.full_name}` : `Подтверждает IT: ${act.issuer}`}</p><SignaturePad onSave={setSignature} onClear={() => setSignature('')} /><button disabled={busy || !signature} onClick={sign} className="mt-3 min-h-12 w-full rounded-xl bg-blue-600 font-bold text-white disabled:opacity-40">Подписать</button></div>}</aside></section>
  </main>{operation && selectedStudent && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><h3 className="text-lg font-black">{operation === 'departure' ? 'Выбытие ученика' : 'Замена iPad'}</h3><p className="mb-4 text-sm text-slate-500">{selectedStudent.student_name} · текущий {selectedStudent.ipad_tag}</p>{operation === 'departure' ? <div className="space-y-2"><input type="date" value={form.departure_date || ''} onChange={e => setForm({...form, departure_date:e.target.value})} className="min-h-11 w-full rounded-xl border px-3"/><input placeholder="Причина *" value={form.reason || ''} onChange={e => setForm({...form, reason:e.target.value})} className="min-h-11 w-full rounded-xl border px-3"/><label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={form.ipad_returned || false} onChange={e => setForm({...form, ipad_returned:e.target.checked})} className="h-5 w-5"/>iPad возвращён</label><input placeholder="Состояние при возврате" value={form.return_condition || ''} onChange={e => setForm({...form, return_condition:e.target.value})} className="min-h-11 w-full rounded-xl border px-3"/></div> : <div className="space-y-2"><input type="date" value={form.replacement_date || ''} onChange={e => setForm({...form, replacement_date:e.target.value})} className="min-h-11 w-full rounded-xl border px-3"/><input placeholder="Причина *" value={form.reason || ''} onChange={e => setForm({...form, reason:e.target.value})} className="min-h-11 w-full rounded-xl border px-3"/><input placeholder="Состояние старого iPad *" value={form.old_condition || ''} onChange={e => setForm({...form, old_condition:e.target.value})} className="min-h-11 w-full rounded-xl border px-3"/><select value={form.ipad_device_id || ''} onChange={e => setForm({...form, ipad_device_id:e.target.value})} className="min-h-11 w-full rounded-xl border px-3"><option value="">Выберите новый свободный iPad *</option>{availableIpads.map(ipad => <option key={ipad.id} value={ipad.id}>{ipad.model || ipad.device_name} · Tag {ipad.tag} · {ipad.serial_number}</option>)}</select></div>}<div className="mt-5 flex gap-2"><button disabled={busy} onClick={submitOperation} className="min-h-12 flex-1 rounded-xl bg-slate-900 font-bold text-white">Сохранить событие</button><button onClick={() => setOperation(null)} className="min-h-12 rounded-xl bg-slate-100 px-4">Отмена</button></div></div></div>}</div>;
}
