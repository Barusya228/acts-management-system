'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import SignaturePad from '@/components/SignaturePad';
import SignatureUpload from '@/components/SignatureUpload';
import ManualFinalEmail from '@/components/ManualFinalEmail';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

interface Student {
  id: string;
  student_name: string;
  student_status: string;
  ipad_name: string;
  ipad_model: string | null;
  ipad_tag: string;
  serial_number?: string;
  note: string | null;
  status: string;
  events: Array<{ id: string; event_type: string; note: string | null; created_at: string }>;
}

interface AvailableIpad {
  id: string;
  device_name: string;
  model: string | null;
  tag: string;
  serial_number: string;
}

interface Responsible {
  participant_id: string;
  full_name: string;
  email: string;
  signed_at: string | null;
}

interface Appendix {
  id: string;
  appendix_number: number;
  operation_type: string;
  status: string;
  responsible_participant_id: string;
  responsible_name: string;
  issuer_participant_id: string;
  issuer_name: string;
  payload: Record<string, unknown>;
  responsible_signed_at: string | null;
  issuer_signed_at: string | null;
  created_at: string;
  pdf_available: boolean;
}

interface IpadAct {
  id: string;
  advisory_group: string;
  academic_year: string;
  issue_date: string;
  issuer: string;
  issuer_participant_id: string;
  responsibles: Responsible[];
  status: string;
  students: Student[];
  appendices: Appendix[];
}

type Operation = 'replacement' | 'departure' | 'addition' | 'late-return' | 'year-end-return';
type ContentTab = 'active' | 'departed' | 'events' | 'appendices';

const operationLabels: Record<string, string> = {
  IPAD_REPLACEMENT: 'Замена iPad',
  STUDENT_DEPARTURE: 'Выбытие ученика',
  STUDENT_ADDITION: 'Добавление ученика',
  LATE_RETURN: 'Поздний возврат iPad',
  YEAR_END_RETURN: 'Годовой возврат Advisory',
};

const appendixStatusLabels: Record<string, string> = {
  WAITING_RESPONSIBLE: 'Ожидает ответственного',
  WAITING_ISSUER: 'Ожидает IT',
  APPLIED: 'Применено',
  CANCELLED: 'Отменено',
};

export default function IpadActPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading, loginAsGuest } = useAuth();
  const { showToast } = useToast();
  const [act, setAct] = useState<IpadAct | null>(null);
  const [busy, setBusy] = useState(false);
  const [signatureMode, setSignatureMode] = useState<'draw' | 'upload'>('draw');
  const [signatureData, setSignatureData] = useState('');
  const [signatureResetKey, setSignatureResetKey] = useState(0);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [availableIpads, setAvailableIpads] = useState<AvailableIpad[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [contentTab, setContentTab] = useState<ContentTab>('active');
  const [loadError, setLoadError] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const authAttempted = useRef(false);

  useEffect(() => {
    if (!loading && !user && !authAttempted.current) {
      authAttempted.current = true;
      void loginAsGuest().catch(() => {
        authAttempted.current = false;
        setLoadError('Не удалось войти в гостевой режим');
      });
    }
  }, [loading, user, loginAsGuest]);

  const load = async () => {
    setLoadError('');
    try {
      setAct((await api.get(`/api/ipad-acts/${id}`)).data);
    } catch (error: unknown) {
      setLoadError(apiErrorMessage(error, 'Не удалось загрузить iPad-акт'));
    }
  };

  useEffect(() => {
    if (user) load();
  }, [user, id]);

  const retryLoad = async () => {
    setLoadError('');
    if (user) {
      await load();
      return;
    }
    authAttempted.current = true;
    try {
      await loginAsGuest();
    } catch {
      authAttempted.current = false;
      setLoadError('Не удалось войти в гостевой режим');
    }
  };

  useEffect(() => () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);

  if (loadError) {
    return <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center text-red-600"><p>{loadError}</p><button onClick={retryLoad} className="min-h-11 rounded-xl bg-slate-900 px-5 font-bold text-white">Повторить</button></div>;
  }
  if (!act) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-400">Загрузка...</div>;
  }

  const pendingResponsible = act.responsibles.find(item => !item.signed_at);
  const canIssuerSign = act.status === 'SIGNED_PARTY2';
  const pendingAppendix = act.appendices.find(item => ['WAITING_RESPONSIBLE', 'WAITING_ISSUER'].includes(item.status));
  const signedCount = act.responsibles.filter(item => item.signed_at).length;
  const shortId = `ACT-${act.id.split('-')[0].toUpperCase()}`;
  const activeStudents = act.students.filter(item => item.student_status === 'ACTIVE');
  const departedStudents = act.students.filter(item => item.student_status !== 'ACTIVE');
  const visibleStudents = contentTab === 'active' ? activeStudents : departedStudents;
  const studentEvents = act.students.flatMap(student => (student.events || []).map(event => ({ ...event, student_name: student.student_name })));
  const statusLabel = act.status === 'DRAFT'
    ? 'Ожидает подписи ответственного'
    : act.status === 'SIGNED_PARTY2'
      ? 'Ожидает подтверждения IT'
      : act.status === 'COMPLETED'
        ? 'Advisory-комплект выдан'
        : act.status === 'RETURNED'
          ? 'Advisory-комплект возвращён'
          : 'Возврат Advisory';

  const clearSignature = () => {
    setSignatureData('');
    setSignatureResetKey(value => value + 1);
  };

  const changeSignatureMode = (mode: 'draw' | 'upload') => {
    clearSignature();
    setSignatureMode(mode);
  };

  const readSignatureFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setSignatureData(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const submitSignature = async () => {
    if (!signatureData) return;
    setBusy(true);
    try {
      if (pendingAppendix) {
        const party = pendingAppendix.status === 'WAITING_RESPONSIBLE' ? 'responsible' : 'issuer';
        const participantId = party === 'responsible' ? pendingAppendix.responsible_participant_id : pendingAppendix.issuer_participant_id;
        await api.post(`/api/ipad-acts/${id}/appendices/${pendingAppendix.id}/sign/${party}`, {
          signature_data: signatureData,
          participant_id: participantId,
        });
      } else {
        const party = pendingResponsible ? 'party2' : 'party1';
        const participantId = pendingResponsible?.participant_id || act.issuer_participant_id;
        await api.post(`/api/acts/${id}/sign/${party}`, {
          signature_data: signatureData,
          participant_id: participantId,
        });
      }
      clearSignature();
      await load();
      showToast('Подпись сохранена', 'success');
    } catch (error: unknown) {
      showToast(apiErrorMessage(error, 'Ошибка подписания'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const loadAvailableIpads = async () => {
    try {
      const response = await api.get('/api/ipad-inventory/available');
      setAvailableIpads(Array.isArray(response.data) ? response.data : response.data?.items || []);
    } catch {
      setAvailableIpads([]);
      showToast('Не удалось загрузить свободные iPad', 'error');
    }
  };

  const openOperation = async (nextOperation: Operation, student?: Student) => {
    if (pendingAppendix) {
      showToast('Сначала завершите или отмените текущее приложение', 'error');
      return;
    }
    if (nextOperation === 'replacement' || nextOperation === 'addition') await loadAvailableIpads();
    setSelectedStudent(student || null);
    setOperation(nextOperation);
    const now = new Date();
    const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
    setForm({
      date: localDate,
      responsible_participant_id: act.responsibles[0]?.participant_id || '',
      ipad_returned: true,
      device_result_status: 'AVAILABLE',
      items: nextOperation === 'year-end-return' ? activeStudents.map(item => ({ assignment_id: item.id, student_name: item.student_name, ipad_tag: item.ipad_tag, device_result_status: 'AVAILABLE', condition: '' })) : undefined,
    });
  };

  const submitOperation = async () => {
    if (!operation) return;
    setBusy(true);
    try {
      let endpoint = '';
      let payload: Record<string, unknown> = {};
      if (operation === 'replacement' && selectedStudent) {
        endpoint = `/api/ipad-acts/${id}/appendices/replacement?assignment_id=${selectedStudent.id}`;
        payload = { responsible_participant_id: form.responsible_participant_id, replacement_date: form.date, reason: form.reason, old_condition: form.old_condition, ipad_device_id: form.ipad_device_id, note: form.note || null };
      } else if (operation === 'departure' && selectedStudent) {
        endpoint = `/api/ipad-acts/${id}/appendices/departure?assignment_id=${selectedStudent.id}`;
        payload = { responsible_participant_id: form.responsible_participant_id, departure_date: form.date, reason: form.reason, ipad_returned: form.ipad_returned, return_condition: form.return_condition || null, device_result_status: form.ipad_returned ? form.device_result_status : 'RETURN_PENDING', note: form.note || null };
      } else if (operation === 'addition') {
        endpoint = `/api/ipad-acts/${id}/appendices/student-addition`;
        payload = { responsible_participant_id: form.responsible_participant_id, added_at: form.date, student_name: form.student_name, ipad_device_id: form.ipad_device_id, reason: form.reason, note: form.note || null };
      } else if (operation === 'late-return' && selectedStudent) {
        endpoint = `/api/ipad-acts/${id}/appendices/late-return?assignment_id=${selectedStudent.id}`;
        payload = { responsible_participant_id: form.responsible_participant_id, returned_at: form.date, device_result_status: form.device_result_status, condition: form.condition, note: form.note || null };
      } else if (operation === 'year-end-return') {
        endpoint = `/api/ipad-acts/${id}/appendices/year-end-return`;
        payload = { responsible_participant_id: form.responsible_participant_id, returned_at: form.date, items: form.items.map((item: Record<string, string>) => ({ assignment_id: item.assignment_id, device_result_status: item.device_result_status, condition: item.condition })), note: form.note || null };
      }
      if (!endpoint) throw new Error('Операция недоступна');
      await api.post(endpoint, payload);
      setOperation(null);
      setSelectedStudent(null);
      await load();
      showToast('Приложение создано и ожидает подписи', 'success');
    } catch (error: unknown) {
      showToast(apiErrorMessage(error, 'Не удалось создать приложение'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const cancelAppendix = async (appendix: Appendix) => {
    setBusy(true);
    try {
      await api.delete(`/api/ipad-acts/${id}/appendices/${appendix.id}`);
      clearSignature();
      await load();
      showToast('Приложение отменено', 'success');
    } catch (error: unknown) {
      showToast(apiErrorMessage(error, 'Не удалось отменить приложение'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const permanentlyDeleteAct = async () => {
    setBusy(true);
    try {
      await api.delete(`/api/acts/${id}`);
      showToast('Акт удалён навсегда', 'success');
      router.push('/admin/acts');
    } catch (error: unknown) {
      showToast(apiErrorMessage(error, 'Не удалось удалить акт'), 'error');
    } finally {
      setBusy(false);
      setDeleteConfirmOpen(false);
    }
  };

  const openPdf = async (appendixId?: string) => {
    try {
      const endpoint = appendixId
        ? `/api/ipad-acts/${id}/appendices/${appendixId}/pdf`
        : `/api/acts/${id}/preview/pdf`;
      const response = await api.get(endpoint, { responseType: 'blob' });
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(URL.createObjectURL(response.data));
      setPdfOpen(true);
    } catch {
      showToast('Не удалось открыть PDF', 'error');
    }
  };

  const closePdf = () => {
    setPdfOpen(false);
    setPdfUrl(current => {
      if (current) URL.revokeObjectURL(current);
      return '';
    });
  };

  const downloadPdf = async () => {
    try {
      const response = await api.get(`/api/acts/${id}/download/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${shortId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      showToast('Не удалось скачать PDF', 'error');
    }
  };

  const canSignMainAct = Boolean(pendingResponsible || canIssuerSign);
  const canSign = canSignMainAct || Boolean(pendingAppendix);
  const actionTitle = pendingAppendix
    ? `${operationLabels[pendingAppendix.operation_type] || 'Приложение'} №${pendingAppendix.appendix_number}`
    : pendingResponsible
      ? `Подписывает ${pendingResponsible.full_name}`
      : canIssuerSign
        ? `Подтверждает IT: ${act.issuer}`
        : statusLabel;

  return <div className="min-h-screen bg-[#eef2f6] text-slate-900">
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center gap-3 px-4">
        <Link href="/guest" className="flex h-11 items-center rounded-xl px-3 text-sm font-semibold text-slate-500 hover:bg-slate-100">← К актам</Link>
        <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600">iPad Advisory</p><h1 className="text-base font-black sm:text-lg">{act.advisory_group} · {shortId}</h1></div>
        {user?.role === 'ADMIN' && <button onClick={() => setDeleteConfirmOpen(true)} className="ml-auto min-h-11 rounded-xl bg-red-600 px-4 text-sm font-bold text-white">Удалить навсегда</button>}
      </div>
    </header>
    <main className="mx-auto grid max-w-7xl gap-4 p-3 sm:p-4 lg:grid-cols-[46%_54%] lg:gap-5 lg:p-5">
      <section className="space-y-4 lg:max-h-[calc(100vh-104px)] lg:overflow-y-auto lg:pr-1">
        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-800">{statusLabel}</span><p className="mt-3 text-sm text-slate-500">Advisory {act.advisory_group} · учебный год {act.academic_year}</p></div><div className="text-right"><p className="text-xs text-slate-400">Дата выдачи</p><p className="font-black">{new Date(act.issue_date).toLocaleDateString('ru-RU')}</p></div></div>
          <div className="mt-5 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2"><Progress active label={`Ответственные ${signedCount}/${act.responsibles.length}`} /><span className="h-px bg-slate-200"/><Progress active={act.status !== 'DRAFT'} label="Подтверждение IT"/><span className="h-px bg-slate-200"/><Progress active={act.status === 'COMPLETED' || act.status === 'RETURNED'} label="Завершено"/></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2"><Person title="Ответственные" name={act.responsibles.map(item => item.full_name).join(', ')} detail={`${act.responsibles.length} подписантов`} accent="bg-blue-600"/><Person title="Выдающий" name={act.issuer} detail="Сотрудник IT" accent="bg-slate-900"/></div>
        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Ученики и iPad</p><h2 className="mt-1 text-xl font-black">{activeStudents.length} активных назначений</h2></div>{act.status === 'COMPLETED' && <button onClick={() => openOperation('addition')} className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white">+ Добавить ученика</button>}</div>
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 sm:grid-cols-4"><TabButton active={contentTab === 'active'} onClick={() => setContentTab('active')}>Активные · {activeStudents.length}</TabButton><TabButton active={contentTab === 'departed'} onClick={() => setContentTab('departed')}>Выбывшие · {departedStudents.length}</TabButton><TabButton active={contentTab === 'events'} onClick={() => setContentTab('events')}>История · {studentEvents.length}</TabButton><TabButton active={contentTab === 'appendices'} onClick={() => setContentTab('appendices')}>Приложения · {act.appendices.length}</TabButton></div>
          {(contentTab === 'active' || contentTab === 'departed') && <div className="space-y-2">{visibleStudents.length === 0 ? <Empty text="В этом разделе пока нет учеников"/> : visibleStudents.map(student => <div key={student.id} className={`rounded-2xl p-4 ${student.student_status === 'ACTIVE' ? 'bg-slate-50' : 'bg-slate-100'}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold">{student.student_name}</p><p className="text-sm text-slate-500">{student.ipad_name} {student.ipad_model || ''}</p></div><div className="text-right"><p className="font-mono text-sm font-bold text-blue-700">Tag {student.ipad_tag}</p><p className="font-mono text-xs text-slate-400">{student.serial_number || 'Без Serial'}</p></div></div>{student.note && <p className="mt-2 text-sm text-slate-500">{student.note}</p>}{act.status === 'COMPLETED' && student.student_status === 'ACTIVE' && student.status === 'ISSUED' && <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => openOperation('replacement', student)} className="min-h-11 rounded-xl bg-blue-100 px-4 text-sm font-bold text-blue-700">Заменить iPad</button><button onClick={() => openOperation('departure', student)} className="min-h-11 rounded-xl bg-amber-100 px-4 text-sm font-bold text-amber-700">Оформить выбытие</button></div>}{student.status === 'RETURN_PENDING' && <button onClick={() => openOperation('late-return', student)} className="mt-3 min-h-11 rounded-xl bg-violet-100 px-4 text-sm font-bold text-violet-700">Оформить поздний возврат</button>}</div>)}</div>}
          {contentTab === 'events' && <div className="space-y-2">{studentEvents.length === 0 ? <Empty text="Событий пока нет"/> : studentEvents.map(event => <div key={event.id} className="rounded-2xl bg-slate-50 p-4"><p className="font-bold">{event.student_name} · {event.event_type}</p><p className="mt-1 text-xs text-slate-500">{new Date(event.created_at).toLocaleString('ru-RU')}{event.note ? ` · ${event.note}` : ''}</p></div>)}</div>}
          {contentTab === 'appendices' && <div className="space-y-2">{act.appendices.length === 0 ? <Empty text="Приложений пока нет"/> : act.appendices.map(item => <div key={item.id} className="rounded-2xl bg-slate-50 p-4"><div className="flex flex-wrap justify-between gap-2"><div><p className="font-bold">№{item.appendix_number} · {operationLabels[item.operation_type] || item.operation_type}</p><p className="text-xs text-slate-500">{new Date(item.created_at).toLocaleString('ru-RU')} · {item.responsible_name}</p></div><span className="h-fit rounded-full bg-white px-3 py-1 text-xs font-bold">{appendixStatusLabels[item.status] || item.status}</span></div>{item.pdf_available && <button onClick={() => openPdf(item.id)} className="mt-3 min-h-10 rounded-xl bg-blue-100 px-4 text-sm font-bold text-blue-700">PDF приложения</button>}</div>)}</div>}
        </div>
        {user?.role === 'ADMIN' && <ManualFinalEmail actId={id} />}
        <details className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><summary className="cursor-pointer text-sm font-bold text-slate-600">Дополнительно</summary><div className="mt-3 grid gap-2 sm:grid-cols-2"><button onClick={() => openPdf()} className="min-h-12 rounded-xl bg-slate-100 text-sm font-semibold">Предпросмотр PDF</button><button onClick={() => setHistoryOpen(true)} className="min-h-12 rounded-xl bg-slate-100 text-sm font-semibold">История приложений</button></div></details>
      </section>
      <section className="flex min-h-[52vh] flex-col overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-slate-200 lg:sticky lg:top-[84px] lg:h-[calc(100vh-104px)]">
        <div className="border-b border-slate-100 p-5"><p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">{canSign ? 'Текущее действие' : 'Итог документа'}</p><h2 className="mt-2 text-2xl font-black">{actionTitle}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{pendingAppendix ? `Сначала подписывает ${pendingAppendix.responsible_name}, затем ${pendingAppendix.issuer_name}. Изменение применится после обеих подписей.` : canSignMainAct ? 'Подтвердите передачу полного комплекта iPad.' : 'Основной акт подписан. Последующие изменения оформляются приложениями.'}</p></div>
        {canSign ? <><div className="flex flex-1 flex-col p-5"><div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1"><button onClick={() => changeSignatureMode('draw')} className={`min-h-11 rounded-lg text-sm font-bold ${signatureMode === 'draw' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>Рисовать подпись</button><button onClick={() => changeSignatureMode('upload')} className={`min-h-11 rounded-lg text-sm font-bold ${signatureMode === 'upload' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>Загрузить файл</button></div>{signatureMode === 'draw' ? <div className="mt-4 flex flex-1 flex-col justify-center"><SignaturePad key={signatureResetKey} onSave={setSignatureData} onClear={() => setSignatureData('')} /></div> : <div className="mt-4 flex flex-1 items-center justify-center"><SignatureUpload key={signatureResetKey} onUpload={readSignatureFile} /></div>}</div><div className="grid grid-cols-[120px_1fr] gap-3 border-t p-5"><button onClick={clearSignature} className="min-h-12 rounded-xl bg-slate-100 font-bold text-slate-600">Очистить</button><button disabled={!signatureData || busy} onClick={submitSignature} className="min-h-12 rounded-xl bg-blue-600 font-black text-white disabled:opacity-40">{busy ? 'Сохранение...' : 'Подписать'}</button></div>{pendingAppendix && <button disabled={busy} onClick={() => cancelAppendix(pendingAppendix)} className="mx-5 mb-5 min-h-11 rounded-xl bg-red-50 font-bold text-red-700">Отменить приложение</button>}</> : <div className="flex flex-1 items-center justify-center p-6"><div className="w-full max-w-md text-center"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-3xl font-black text-emerald-700">✓</div><h3 className="mt-4 text-xl font-black">{act.status === 'RETURNED' ? 'Возврат завершён' : 'Выдача завершена'}</h3><p className="mt-2 text-sm text-slate-500">{act.status === 'RETURNED' ? 'Все iPad возвращены и результаты проверки сохранены.' : 'Все ответственные и IT подписали Advisory-акт.'}</p>{act.status === 'COMPLETED' && <button onClick={() => openOperation('year-end-return')} className="mt-5 min-h-12 w-full rounded-xl bg-violet-600 font-bold text-white">Оформить годовой возврат</button>}<button onClick={() => openPdf()} className={`${act.status === 'COMPLETED' ? 'mt-3' : 'mt-5'} min-h-12 w-full rounded-xl bg-blue-600 font-bold text-white`}>Открыть финальный PDF</button><button onClick={downloadPdf} className="mt-3 min-h-12 w-full rounded-xl bg-slate-100 font-bold">Скачать PDF</button><button onClick={() => setHistoryOpen(true)} className="mt-3 min-h-12 w-full rounded-xl bg-slate-900 font-bold text-white">История изменений</button></div></div>}
      </section>
    </main>
    {operation && <OperationModal operation={operation} student={selectedStudent} form={form} setForm={setForm} responsibles={act.responsibles} availableIpads={availableIpads} busy={busy} onSubmit={submitOperation} onClose={() => setOperation(null)} />}
    {historyOpen && <HistoryModal shortId={shortId} appendices={act.appendices} onPdf={openPdf} onClose={() => setHistoryOpen(false)} />}
    {pdfOpen && <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/90 p-3"><div className="mx-auto mb-3 flex w-full max-w-6xl justify-end"><button onClick={closePdf} className="min-h-11 rounded-xl bg-white px-5 font-bold">Закрыть</button></div><iframe src={pdfUrl} title="PDF акта" className="mx-auto h-full w-full max-w-6xl rounded-2xl bg-white"/></div>}
    {deleteConfirmOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><p className="text-xs font-bold uppercase tracking-widest text-red-600">Необратимое действие</p><h2 className="mt-2 text-xl font-black">Удалить акт навсегда?</h2><p className="mt-3 text-sm leading-6 text-slate-600">Точно удалить {shortId} со всеми версиями, подписями, приложениями и назначениями iPad? Восстановить его будет невозможно.</p><div className="mt-6 flex gap-3"><button disabled={busy} onClick={permanentlyDeleteAct} className="min-h-12 flex-1 rounded-xl bg-red-600 font-black text-white disabled:opacity-50">{busy ? 'Удаление...' : 'Удалить навсегда'}</button><button disabled={busy} onClick={() => setDeleteConfirmOpen(false)} className="min-h-12 rounded-xl bg-slate-100 px-5 font-bold">Отмена</button></div></div></div>}
  </div>;
}

function OperationModal({ operation, student, form, setForm, responsibles, availableIpads, busy, onSubmit, onClose }: { operation: Operation; student: Student | null; form: Record<string, any>; setForm: (value: Record<string, any>) => void; responsibles: Responsible[]; availableIpads: AvailableIpad[]; busy: boolean; onSubmit: () => void; onClose: () => void }) {
  const set = (key: string, value: unknown) => setForm({ ...form, [key]: value });
  const title = operation === 'replacement' ? 'Замена iPad' : operation === 'departure' ? 'Выбытие ученика' : operation === 'addition' ? 'Добавление ученика' : operation === 'late-return' ? 'Поздний возврат iPad' : 'Годовой возврат Advisory';
  const setReturnItem = (index: number, key: string, value: string) => set('items', form.items.map((item: Record<string, unknown>, itemIndex: number) => itemIndex === index ? { ...item, [key]: value } : item));
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl"><p className="text-xs font-bold uppercase tracking-widest text-blue-600">Новое приложение</p><h2 className="mt-1 text-xl font-black">{title}</h2>{student && <p className="mt-1 text-sm text-slate-500">{student.student_name} · Tag {student.ipad_tag}</p>}<div className="mt-5 space-y-3"><FieldLabel text="Ответственное лицо"><select value={form.responsible_participant_id || ''} onChange={event => set('responsible_participant_id', event.target.value)} className="min-h-12 w-full rounded-xl border px-3">{responsibles.map(item => <option key={item.participant_id} value={item.participant_id}>{item.full_name}</option>)}</select></FieldLabel><FieldLabel text="Дата"><input type="date" value={form.date || ''} onChange={event => set('date', event.target.value)} className="min-h-12 w-full rounded-xl border px-3"/></FieldLabel>{operation === 'addition' && <FieldLabel text="ФИО ученика"><input value={form.student_name || ''} onChange={event => set('student_name', event.target.value)} className="min-h-12 w-full rounded-xl border px-3"/></FieldLabel>}{(operation === 'replacement' || operation === 'addition') && <FieldLabel text="Новый свободный iPad"><select value={form.ipad_device_id || ''} onChange={event => set('ipad_device_id', event.target.value)} className="min-h-12 w-full rounded-xl border px-3"><option value="">Выберите iPad</option>{availableIpads.map(ipad => <option key={ipad.id} value={ipad.id}>{ipad.model || ipad.device_name} · Tag {ipad.tag} · {ipad.serial_number}</option>)}</select></FieldLabel>}{!['late-return', 'year-end-return'].includes(operation) && <FieldLabel text="Причина"><input value={form.reason || ''} onChange={event => set('reason', event.target.value)} className="min-h-12 w-full rounded-xl border px-3"/></FieldLabel>}{operation === 'replacement' && <FieldLabel text="Состояние старого iPad"><input value={form.old_condition || ''} onChange={event => set('old_condition', event.target.value)} className="min-h-12 w-full rounded-xl border px-3"/></FieldLabel>}{operation === 'departure' && <label className="flex min-h-12 items-center gap-3 rounded-xl bg-slate-50 px-3 font-semibold"><input type="checkbox" checked={Boolean(form.ipad_returned)} onChange={event => set('ipad_returned', event.target.checked)} className="h-5 w-5"/>iPad возвращён сразу</label>}{(operation === 'departure' || operation === 'late-return') && <><FieldLabel text="Состояние iPad"><input value={operation === 'departure' ? form.return_condition || '' : form.condition || ''} onChange={event => set(operation === 'departure' ? 'return_condition' : 'condition', event.target.value)} className="min-h-12 w-full rounded-xl border px-3"/></FieldLabel><FieldLabel text="Результат проверки"><select value={form.device_result_status || 'AVAILABLE'} onChange={event => set('device_result_status', event.target.value)} className="min-h-12 w-full rounded-xl border px-3"><option value="AVAILABLE">Готов к выдаче</option><option value="MAINTENANCE">На обслуживание</option><option value="RETIRED">Списан</option>{operation === 'departure' && <option value="RETURN_PENDING">Ожидает возврата</option>}</select></FieldLabel></>}{operation === 'year-end-return' && <div className="space-y-2"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Результат по каждому iPad</p>{form.items.map((item: Record<string, string>, index: number) => <div key={item.assignment_id} className="rounded-2xl bg-slate-50 p-3"><p className="font-bold">{item.student_name} · Tag {item.ipad_tag}</p><div className="mt-2 grid gap-2 sm:grid-cols-2"><select value={item.device_result_status} onChange={event => setReturnItem(index, 'device_result_status', event.target.value)} className="min-h-11 rounded-xl border px-3"><option value="AVAILABLE">Готов к выдаче</option><option value="MAINTENANCE">На обслуживание</option><option value="RETIRED">Списан</option></select><input placeholder="Состояние iPad *" value={item.condition} onChange={event => setReturnItem(index, 'condition', event.target.value)} className="min-h-11 rounded-xl border px-3"/></div></div>)}</div>}<FieldLabel text="Примечание"><textarea value={form.note || ''} onChange={event => set('note', event.target.value)} className="min-h-20 w-full rounded-xl border p-3"/></FieldLabel></div><div className="mt-5 flex gap-3"><button disabled={busy} onClick={onSubmit} className="min-h-12 flex-1 rounded-xl bg-blue-600 font-black text-white disabled:opacity-50">Создать приложение</button><button onClick={onClose} className="min-h-12 rounded-xl bg-slate-100 px-5 font-bold">Отмена</button></div></div></div>;
}

function HistoryModal({ shortId, appendices, onPdf, onClose }: { shortId: string; appendices: Appendix[]; onPdf: (id: string) => void; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><div className="w-full max-w-2xl rounded-3xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase text-blue-600">{shortId}</p><h2 className="text-xl font-black">История приложений</h2></div><button onClick={onClose} className="min-h-11 rounded-xl bg-slate-100 px-4 font-bold">Закрыть</button></div><div className="mt-4 max-h-[65vh] space-y-2 overflow-y-auto">{appendices.length === 0 ? <div className="rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-400">Изменений пока нет</div> : appendices.map(item => <div key={item.id} className="rounded-2xl bg-slate-50 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold">Приложение №{item.appendix_number} · {operationLabels[item.operation_type] || item.operation_type}</p><p className="mt-1 text-xs text-slate-500">{new Date(item.created_at).toLocaleString('ru-RU')} · {item.responsible_name}</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600">{appendixStatusLabels[item.status] || item.status}</span></div>{item.pdf_available && <button onClick={() => onPdf(item.id)} className="mt-3 min-h-10 rounded-xl bg-blue-100 px-4 text-sm font-bold text-blue-700">Открыть PDF приложения</button>}</div>)}</div></div></div>;
}

function Progress({ active, label }: { active: boolean; label: string }) {
  return <div className="text-center"><span className={`mx-auto block h-3 w-3 rounded-full ${active ? 'bg-blue-600 ring-4 ring-blue-100' : 'bg-slate-200'}`}/><span className="mt-2 block text-[10px] font-bold text-slate-500">{label}</span></div>;
}

function Person({ title, name, detail, accent }: { title: string; name: string; detail: string; accent: string }) {
  return <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><div className="flex gap-3"><span className={`h-11 w-1 rounded-full ${accent}`}/><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</p><p className="truncate font-black">{name}</p><p className="truncate text-xs text-slate-500">{detail}</p></div></div></div>;
}

function FieldLabel({ text, children }: { text: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">{text}</span>{children}</label>;
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`min-h-10 rounded-lg px-2 text-xs font-bold ${active ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>{children}</button>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-400">{text}</div>;
}

function apiErrorMessage(error: unknown, fallback: string): string {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map(item => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && 'msg' in item && typeof item.msg === 'string') return item.msg;
      return '';
    }).filter(Boolean);
    if (messages.length) return messages.join('; ');
  }
  return fallback;
}
