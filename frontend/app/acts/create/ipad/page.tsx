'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

interface Participant { id: string; full_name: string; email?: string | null; kind: string; }
interface Template { id: string; code: string; name: string; }
interface StudentRow { student_name: string; ipad_name: string; ipad_model: string; ipad_tag: string; serial_number: string; imei: string; note: string; }

const emptyStudent = (): StudentRow => ({ student_name: '', ipad_name: 'iPad', ipad_model: '', ipad_tag: '', serial_number: '', imei: '', note: '' });

export default function CreateIpad() {
  const { user, loading, loginAsGuest } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const [template, setTemplate] = useState<Template | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [advisoryGroup, setAdvisoryGroup] = useState('');
  const [academicYear, setAcademicYear] = useState(`${new Date().getFullYear()}-${new Date().getFullYear() + 1}`);
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [issuerId, setIssuerId] = useState('');
  const [responsibleIds, setResponsibleIds] = useState<string[]>([]);
  const [responsibleSearch, setResponsibleSearch] = useState('');
  const [students, setStudents] = useState<StudentRow[]>([emptyStudent()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!loading && !user) loginAsGuest(); }, [loading, user, loginAsGuest]);
  useEffect(() => {
    if (!user) return;
    Promise.all([api.get('/api/templates?is_active=true'), api.get('/api/participants?is_active=true')])
      .then(([templatesResponse, participantsResponse]) => {
        setTemplate((templatesResponse.data || []).find((item: Template) => item.code === 'IPAD') || null);
        setParticipants(Array.isArray(participantsResponse.data) ? participantsResponse.data : []);
      })
      .catch(() => showToast('Не удалось загрузить справочники', 'error'));
  }, [user, showToast]);

  const managers = participants.filter(item => item.kind === 'IT_MANAGER' || item.kind === 'BOTH');
  const responsibles = participants.filter(item => item.kind === 'EMPLOYEE' || item.kind === 'BOTH');
  const selectedResponsibles = responsibleIds.map(id => responsibles.find(item => item.id === id)).filter((item): item is Participant => Boolean(item));
  const responsibleSuggestions = responsibleSearch.trim().length >= 2
    ? responsibles.filter(item => !responsibleIds.includes(item.id) && item.full_name.toLowerCase().includes(responsibleSearch.trim().toLowerCase())).slice(0, 6)
    : [];
  const updateStudent = (index: number, patch: Partial<StudentRow>) => setStudents(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));

  const submit = async () => {
    if (!template || !advisoryGroup.trim() || !academicYear.trim() || !issuerId || responsibleIds.length === 0) {
      showToast('Заполните advisory, учебный год, выдающего и ответственных', 'error'); return;
    }
    if (students.some(item => !item.student_name.trim() || !item.ipad_tag.trim())) {
      showToast('У каждого ученика должны быть ФИО и iPad Tag', 'error'); return;
    }
    setSaving(true);
    try {
      const response = await api.post('/api/ipad-acts', {
        template_id: template.id,
        advisory_group: advisoryGroup.trim(),
        academic_year: academicYear.trim(),
        issue_date: issueDate,
        issuer_participant_id: issuerId,
        responsible_participant_ids: responsibleIds,
        students: students.map(item => ({ ...item, student_name: item.student_name.trim(), ipad_tag: item.ipad_tag.trim() })),
      });
      showToast('iPad-акт создан и комплект зарезервирован', 'success');
      router.push(`/acts/ipad/${response.data.id}`);
    } catch (error: any) {
      showToast(error.response?.data?.detail || 'Не удалось создать iPad-акт', 'error');
    } finally { setSaving(false); }
  };

  if (!user) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-400">Загрузка...</div>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="flex items-center justify-between bg-white px-5 py-3 shadow-sm"><Link href="/guest" className="text-sm text-slate-500">← Назад</Link><h1 className="font-bold">Акт iPad для advisory</h1><span /></header>
      <main className="mx-auto max-w-5xl space-y-5 p-4 lg:p-6">
        <section className="rounded-2xl bg-gradient-to-br from-indigo-700 to-blue-600 p-5 text-white shadow-lg">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-200">Годовой комплект</p><h2 className="mt-1 text-2xl font-black">Одна advisory · несколько ответственных · один iPad каждому ученику</h2>
        </section>
        <section className="grid gap-4 rounded-2xl bg-white p-5 shadow-sm md:grid-cols-2">
          <label className="text-sm font-semibold">Advisory-группа *<input value={advisoryGroup} onChange={event => setAdvisoryGroup(event.target.value)} className="mt-1 min-h-12 w-full rounded-xl border px-3 font-normal" placeholder="7A / Edison" /></label>
          <label className="text-sm font-semibold">Учебный год *<input value={academicYear} onChange={event => setAcademicYear(event.target.value)} className="mt-1 min-h-12 w-full rounded-xl border px-3 font-normal" /></label>
          <label className="text-sm font-semibold">Дата выдачи *<input type="date" value={issueDate} onChange={event => setIssueDate(event.target.value)} className="mt-1 min-h-12 w-full rounded-xl border px-3 font-normal" /></label>
          <label className="text-sm font-semibold">Выдающий IT *<select value={issuerId} onChange={event => setIssuerId(event.target.value)} className="mt-1 min-h-12 w-full rounded-xl border px-3 font-normal"><option value="">Выберите</option>{managers.map(item => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label>
        </section>
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><h3 className="font-bold">Ответственные лица и подписанты</h3><p className="text-sm text-slate-500">Подписывают выбранные ответственные, затем IT.</p></div>
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">Выбрано: {responsibleIds.length}</span>
          </div>
          {selectedResponsibles.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{selectedResponsibles.map(item => <span key={item.id} className="inline-flex min-h-9 items-center gap-2 rounded-full bg-slate-100 pl-3 pr-1 text-sm font-semibold text-slate-700">{item.full_name}<button type="button" onClick={() => setResponsibleIds(ids => ids.filter(id => id !== item.id))} className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-red-100 hover:text-red-600">×</button></span>)}</div>}
          <div className="relative mt-3">
            <input value={responsibleSearch} onChange={event => setResponsibleSearch(event.target.value)} placeholder="Найти ответственного по ФИО..." className="min-h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-blue-400" />
            {responsibleSuggestions.length > 0 && <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl">{responsibleSuggestions.map(item => <button key={item.id} type="button" onClick={() => { setResponsibleIds(ids => [...ids, item.id]); setResponsibleSearch(''); }} className="flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-left hover:bg-blue-50"><span className="text-sm font-semibold text-slate-700">{item.full_name}</span><span className="text-xs text-slate-400">{item.email || 'Нет email'}</span></button>)}</div>}
          </div>
        </section>
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between"><div><h3 className="font-bold">Ученики и закреплённые iPad</h3><p className="text-sm text-slate-500">{students.filter(item => item.student_name && item.ipad_tag).length} из {students.length} назначено</p></div><button type="button" onClick={() => setStudents(rows => [...rows, emptyStudent()])} className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white">+ Ученик</button></div>
          <div className="space-y-3">{students.map((item, index) => <div key={index} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-gray-100"><div className="mb-2 flex justify-between"><span className="text-xs font-bold uppercase text-slate-400">Ученик {index + 1}</span><button type="button" disabled={students.length === 1} onClick={() => setStudents(rows => rows.filter((_, rowIndex) => rowIndex !== index))} className="text-sm text-red-600 disabled:opacity-30">Удалить</button></div><div className="grid gap-2 md:grid-cols-3"><input value={item.student_name} onChange={event => updateStudent(index, { student_name: event.target.value })} placeholder="ФИО ученика *" className="min-h-11 rounded-xl border bg-white px-3" /><input value={item.ipad_tag} onChange={event => updateStudent(index, { ipad_tag: event.target.value })} placeholder="iPad Tag *" className="min-h-11 rounded-xl border bg-white px-3" /><input value={item.ipad_model} onChange={event => updateStudent(index, { ipad_model: event.target.value })} placeholder="Модель" className="min-h-11 rounded-xl border bg-white px-3" /><input value={item.serial_number} onChange={event => updateStudent(index, { serial_number: event.target.value })} placeholder="Serial" className="min-h-11 rounded-xl border bg-white px-3" /><input value={item.imei} onChange={event => updateStudent(index, { imei: event.target.value })} placeholder="IMEI" className="min-h-11 rounded-xl border bg-white px-3" /><input value={item.note} onChange={event => updateStudent(index, { note: event.target.value })} placeholder="Заметка" className="min-h-11 rounded-xl border bg-white px-3" /></div></div>)}</div>
        </section>
        <button type="button" onClick={submit} disabled={saving} className="min-h-14 w-full rounded-2xl bg-slate-950 text-base font-black text-white disabled:opacity-50">{saving ? 'Создание...' : `Создать акт и зарезервировать ${students.length} iPad`}</button>
      </main>
    </div>
  );
}
