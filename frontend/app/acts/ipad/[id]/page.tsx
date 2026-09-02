'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { apiErrorMessage } from '@/lib/apiError';
import SignaturePad from '@/components/SignaturePad';
import SignatureUpload from '@/components/SignatureUpload';
import IpadPickerModal, { ipadLabel } from '@/components/IpadPickerModal';
import IpadParticipantsModal from '@/components/IpadParticipantsModal';
import CustomIpadOptionSelect from '@/components/CustomIpadOptionSelect';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

interface Student {
  id: string;
  ipad_device_id: string;
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

interface AssignmentDraft {
  assignment_id: string | null;
  student_name: string;
  ipad_device_id: string;
  note: string;
}

interface ItManager {
  id: string;
  full_name: string;
  kind: string;
}

const damageReasonOptions = [
  { value: 'BENT_BODY', label: 'Погнутый корпус' },
  { value: 'CRACKED_SCREEN', label: 'Треснутый экран' },
  { value: 'LOST', label: 'Потерян' },
  { value: 'WEAK_BATTERY', label: 'Слабый аккумулятор' },
  { value: 'DAMAGED_DISPLAY', label: 'Повреждена матрица' },
];

const returnConditionOptions = [
  { value: 'OK', label: 'Всё в порядке' },
  ...damageReasonOptions,
];

const departureConditionOptions = [
  ...returnConditionOptions,
  { value: 'NOT_RETURNED', label: 'iPad не сдан (ожидается возврат)' },
];

const conditionResultLabel = (condition: string) =>
  condition === 'OK' ? 'iPad вернётся в выдачу'
    : condition === 'LOST' ? 'iPad будет списан'
      : condition === 'NOT_RETURNED' ? 'iPad останется за учеником до позднего возврата'
        : 'iPad отправится на обслуживание';

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

interface ActRevision {
  id: string;
  version_number: number;
  change_note: string | null;
  created_at: string;
  pdf_file_id: string | null;
  data_json?: { status?: string };
}

// Финальные версии документа: полностью подписанные состояния
// (выдача завершена или советник возвращён). Промежуточные версии
// «подписал один из получателей» в истории не показываются.
const FINAL_REVISION_STATUSES = new Set(['COMPLETED', 'RETURNED']);

const selectFinalRevisions = (revisions: ActRevision[]): ActRevision[] =>
  revisions
    .filter(item => item.pdf_file_id && FINAL_REVISION_STATUSES.has(item.data_json?.status || ''))
    .sort((a, b) => a.version_number - b.version_number);

// «Приложение №2: Замена iPad — Ivan» → «Замена iPad — Ivan»
const revisionTitle = (item: ActRevision, isFirst: boolean): string => {
  if (isFirst) return 'Акт подписан — все подписи собраны';
  const note = item.change_note || '';
  return note.replace(/^Приложение №\d+:\s*/, '') || 'Изменение состава';
};

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
  const [itManagers, setItManagers] = useState<ItManager[]>([]);
  const [revisions, setRevisions] = useState<ActRevision[]>([]);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [contentTab, setContentTab] = useState<ContentTab>('active');
  const [assignmentEditorOpen, setAssignmentEditorOpen] = useState(false);
  const [assignmentDrafts, setAssignmentDrafts] = useState<AssignmentDraft[]>([]);
  const [assignmentPickerIndex, setAssignmentPickerIndex] = useState<number | null>(null);
  const [participantsEditorOpen, setParticipantsEditorOpen] = useState(false);
  const setHistoryOpen = (open: boolean) => {
    if (open) setContentTab('events');
  };
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
      // Ревизии не критичны для отображения акта — грузим отдельно и молча.
      api.get(`/api/acts/${id}/versions`)
        .then(response => setRevisions(Array.isArray(response.data) ? response.data : []))
        .catch(() => setRevisions([]));
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
    return <div className="theme-shell flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center text-red-600"><p>{loadError}</p><button onClick={retryLoad} className="min-h-11 rounded-xl bg-slate-900 px-5 font-bold text-white">Повторить</button></div>;
  }
  if (!act) {
    return <div className="theme-shell flex min-h-screen items-center justify-center bg-slate-50 text-slate-400">Загрузка...</div>;
  }

  const pendingResponsible = act.responsibles.find(item => !item.signed_at);
  const canIssuerSign = act.status === 'SIGNED_PARTY2';
  const pendingAppendix = act.appendices.find(item => ['WAITING_RESPONSIBLE', 'WAITING_ISSUER'].includes(item.status));
  const signedCount = act.responsibles.filter(item => item.signed_at).length;
  const shortId = `ACT-${act.id.split('-')[0].toUpperCase()}`;
  const finalRevisions = selectFinalRevisions(revisions);
  const activeStudents = act.students.filter(item => item.student_status === 'ACTIVE');
  const departedStudents = act.students.filter(item => item.student_status !== 'ACTIVE');
  const visibleStudents = contentTab === 'active' ? activeStudents : departedStudents;
  const canEditAssignments = ['DRAFT', 'SIGNED_PARTY2'].includes(act.status);
  const responsibleCountLabel = act.responsibles.length === 1
    ? '1 подписант'
    : act.responsibles.length < 5
      ? `${act.responsibles.length} подписанта`
      : `${act.responsibles.length} подписантов`;
  const currentAssignmentIpads: AvailableIpad[] = activeStudents.map(item => ({
    id: item.ipad_device_id,
    device_name: item.ipad_name,
    model: item.ipad_model,
    tag: item.ipad_tag,
    serial_number: item.serial_number || '',
  }));
  const currentAssignmentIpadIds = new Set(currentAssignmentIpads.map(item => item.id));
  const assignmentIpadOptions = [
    ...currentAssignmentIpads,
    ...availableIpads.filter(item => !currentAssignmentIpadIds.has(item.id)),
  ];
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

  const openAssignmentEditor = async () => {
    if (!act) return;
    setContentTab('active');
    setAssignmentDrafts(act.students
      .filter(item => item.student_status === 'ACTIVE')
      .map(item => ({
        assignment_id: item.id,
        student_name: item.student_name,
        ipad_device_id: item.ipad_device_id,
        note: item.note || '',
      })));
    setAssignmentEditorOpen(true);
    await loadAvailableIpads();
  };

  const updateAssignmentDraft = (index: number, patch: Partial<AssignmentDraft>) => {
    setAssignmentDrafts(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  };

  const saveAssignments = async () => {
    if (assignmentDrafts.length === 0) {
      showToast('Добавьте хотя бы одного ученика и iPad', 'error');
      return;
    }
    if (assignmentDrafts.some(item => !item.student_name.trim() || !item.ipad_device_id)) {
      showToast('У каждого ученика должны быть ФИО и выбранный iPad', 'error');
      return;
    }
    setBusy(true);
    try {
      await api.patch(`/api/ipad-acts/${id}/assignments`, {
        students: assignmentDrafts.map(item => ({
          ...item,
          student_name: item.student_name.trim(),
          note: item.note.trim() || null,
        })),
      });
      setAssignmentEditorOpen(false);
      setAssignmentPickerIndex(null);
      clearSignature();
      await load();
      showToast('Назначения обновлены. Подписи нужно собрать заново', 'success');
    } catch (error: unknown) {
      showToast(apiErrorMessage(error, 'Не удалось обновить назначения'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const loadItManagers = async () => {
    try {
      const response = await api.get('/api/participants?is_active=true');
      const list = Array.isArray(response.data) ? response.data : [];
      setItManagers(list.filter((item: ItManager) => item.kind === 'IT_MANAGER' || item.kind === 'BOTH'));
    } catch {
      setItManagers([]);
    }
  };

  const openOperation = async (nextOperation: Operation, student?: Student) => {
    if (pendingAppendix) {
      showToast('Сначала завершите или отмените текущее приложение', 'error');
      return;
    }
    if (nextOperation === 'replacement' || nextOperation === 'addition') await loadAvailableIpads();
    if (nextOperation === 'replacement' || nextOperation === 'departure' || nextOperation === 'late-return') await loadItManagers();
    setSelectedStudent(student || null);
    setOperation(nextOperation);
    const now = new Date();
    const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
    setForm({
      date: localDate,
      responsible_participant_id: act.responsibles[0]?.participant_id || '',
      issuer_participant_id: act.issuer_participant_id || '',
      return_condition: 'OK',
      condition: 'OK',
      items: nextOperation === 'year-end-return' ? activeStudents.map(item => ({ assignment_id: item.id, student_name: item.student_name, ipad_tag: item.ipad_tag, condition: 'OK' })) : undefined,
    });
  };

  const submitOperation = async () => {
    if (!operation) return;
    if (operation === 'replacement' && !form.reason) { showToast('Выберите причину замены', 'error'); return; }
    if ((operation === 'replacement' || operation === 'addition') && !form.ipad_device_id) { showToast('Выберите новый iPad', 'error'); return; }
    setBusy(true);
    try {
      let endpoint = '';
      let payload: Record<string, unknown> = {};
      if (operation === 'replacement' && selectedStudent) {
        endpoint = `/api/ipad-acts/${id}/appendices/replacement?assignment_id=${selectedStudent.id}`;
        payload = { responsible_participant_id: form.responsible_participant_id, issuer_participant_id: form.issuer_participant_id || null, replacement_date: form.date, reason: form.reason, ipad_device_id: form.ipad_device_id, note: form.note || null };
      } else if (operation === 'departure' && selectedStudent) {
        endpoint = `/api/ipad-acts/${id}/appendices/departure?assignment_id=${selectedStudent.id}`;
        payload = { responsible_participant_id: form.responsible_participant_id, issuer_participant_id: form.issuer_participant_id || null, departure_date: form.date, return_condition: form.return_condition || 'OK', note: form.note || null };
      } else if (operation === 'addition') {
        endpoint = `/api/ipad-acts/${id}/appendices/student-addition`;
        payload = { responsible_participant_id: form.responsible_participant_id, added_at: form.date, student_name: form.student_name, ipad_device_id: form.ipad_device_id, reason: form.reason, note: form.note || null };
      } else if (operation === 'late-return' && selectedStudent) {
        endpoint = `/api/ipad-acts/${id}/appendices/late-return?assignment_id=${selectedStudent.id}`;
        payload = { responsible_participant_id: form.responsible_participant_id, issuer_participant_id: form.issuer_participant_id || null, returned_at: form.date, condition: form.condition || 'OK', note: form.note || null };
      } else if (operation === 'year-end-return') {
        endpoint = `/api/ipad-acts/${id}/appendices/year-end-return`;
        payload = { responsible_participant_id: form.responsible_participant_id, returned_at: form.date, items: form.items.map((item: Record<string, string>) => ({ assignment_id: item.assignment_id, condition: item.condition || 'OK' })), note: form.note || null };
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

  const regeneratePdf = async () => {
    setBusy(true);
    try {
      await api.post(`/api/ipad-acts/${id}/regenerate-pdf`);
      showToast('PDF успешно обновлён по новому шаблону', 'success');
      await load();
    } catch (error: unknown) {
      showToast(apiErrorMessage(error, 'Не удалось обновить PDF'), 'error');
    } finally {
      setBusy(false);
    }
  };

  // На телефонах iframe с PDF не работает (iOS Safari показывает только первую
  // страницу без скролла) — открываем PDF в новой вкладке.
  const showPdfBlob = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return;
    }
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(url);
    setPdfOpen(true);
  };

  const openPdf = async (appendixId?: string) => {
    try {
      const endpoint = appendixId
        ? `/api/ipad-acts/${id}/appendices/${appendixId}/pdf`
        : `/api/acts/${id}/preview/pdf`;
      const response = await api.get(endpoint, { responseType: 'blob' });
      showPdfBlob(response.data);
    } catch {
      showToast('Не удалось открыть PDF', 'error');
    }
  };

  const openRevisionPdf = async (versionNumber: number) => {
    try {
      const response = await api.get(`/api/acts/${id}/versions/${versionNumber}/download/pdf`, { responseType: 'blob' });
      showPdfBlob(response.data);
    } catch {
      showToast('Не удалось открыть PDF ревизии', 'error');
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
  const appendixSignerName = pendingAppendix
    ? (pendingAppendix.status === 'WAITING_RESPONSIBLE' ? pendingAppendix.responsible_name : pendingAppendix.issuer_name)
    : '';
  const actionTitle = pendingAppendix
    ? `${operationLabels[pendingAppendix.operation_type] || 'Приложение'} №${pendingAppendix.appendix_number} — подписывает ${appendixSignerName}`
    : pendingResponsible
      ? `Подписывает ${pendingResponsible.full_name}`
      : canIssuerSign
        ? `Подтверждает IT: ${act.issuer}`
        : statusLabel;

  return <div className="theme-shell min-h-screen bg-[#eef2f6] text-slate-900">
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center gap-2 px-3 sm:gap-3 sm:px-4">
        <Link href={user?.role === 'ADMIN' ? '/admin/acts' : '/guest'} className="flex h-11 shrink-0 items-center rounded-xl px-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 sm:px-3">←<span className="hidden sm:inline"> К актам</span></Link>
        <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600">iPad Advisory</p><h1 className="truncate text-base font-black sm:text-lg">{act.advisory_group} · {shortId}</h1></div>
        {user?.role === 'ADMIN' && (
          <div className="ml-auto flex items-center gap-2">
            <button
              disabled={busy}
              onClick={regeneratePdf}
              className="min-h-11 shrink-0 rounded-xl bg-blue-600 px-3 text-sm font-bold text-white sm:px-4 disabled:opacity-50"
            >
              {busy ? 'Обновление...' : 'Обновить PDF'}
            </button>
            <button
              onClick={() => setDeleteConfirmOpen(true)}
              className="min-h-11 shrink-0 rounded-xl bg-red-600 px-3 text-sm font-bold text-white sm:px-4"
            >
              Удалить<span className="hidden md:inline"> навсегда</span>
            </button>
          </div>
        )}
      </div>
    </header>
    <main className="mx-auto grid max-w-7xl gap-4 p-3 sm:p-4 lg:grid-cols-[46%_54%] lg:gap-5 lg:p-5">
      <section className="space-y-4 lg:pr-1">
        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-800">{statusLabel}</span><p className="mt-3 text-sm text-slate-500">Advisory {act.advisory_group} · учебный год {act.academic_year}</p></div><div className="text-right"><p className="text-xs text-slate-400">Дата выдачи</p><p className="font-black">{new Date(act.issue_date).toLocaleDateString('ru-RU')}</p></div></div>
          <div className="mt-5 grid grid-cols-3 items-start gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center"><Progress active label={`Ответственные ${signedCount}/${act.responsibles.length}`} /><span className="hidden h-px bg-slate-200 sm:block"/><Progress active={act.status !== 'DRAFT'} label="Подтверждение IT"/><span className="hidden h-px bg-slate-200 sm:block"/><Progress active={act.status === 'COMPLETED' || act.status === 'RETURNED'} label="Завершено"/></div>
        </div>
        <div className="grid items-start gap-3 sm:grid-cols-2"><PeopleCard title="Ответственные" names={act.responsibles.map(item => item.full_name)} detail={responsibleCountLabel} accent="bg-blue-600" onEdit={canEditAssignments ? () => setParticipantsEditorOpen(true) : undefined}/><PeopleCard title="Выдающий" names={[act.issuer]} detail="Сотрудник IT" accent="bg-slate-900" onEdit={canEditAssignments ? () => setParticipantsEditorOpen(true) : undefined}/></div>
        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Ученики и iPad</p><h2 className="mt-1 text-xl font-black">{activeStudents.length} активных назначений</h2></div>
            {act.status === 'COMPLETED' && <button onClick={() => openOperation('addition')} className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white">+ Добавить ученика</button>}
            {canEditAssignments && !assignmentEditorOpen && <button onClick={openAssignmentEditor} className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white">Редактировать назначения</button>}
          </div>
          {!assignmentEditorOpen && <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 sm:grid-cols-4"><TabButton active={contentTab === 'active'} onClick={() => setContentTab('active')}>Активные · {activeStudents.length}</TabButton><TabButton active={contentTab === 'departed'} onClick={() => setContentTab('departed')}>Выбывшие · {departedStudents.length}</TabButton><TabButton active={contentTab === 'events'} onClick={() => setContentTab('events')}>История · {finalRevisions.length}</TabButton><TabButton active={contentTab === 'appendices'} onClick={() => setContentTab('appendices')}>Приложения · {act.appendices.length}</TabButton></div>}
          {assignmentEditorOpen ? (
            <div className="space-y-3">
              <p className="rounded-2xl bg-amber-50 p-3 text-sm leading-5 text-amber-900">После сохранения акт вернётся к началу подписания. Все подписи получателей, поставленные под прежним составом, будут сброшены.</p>
              {assignmentDrafts.map((item, index) => {
                const selectedIpad = assignmentIpadOptions.find(ipad => ipad.id === item.ipad_device_id);
                return <div key={item.assignment_id || `new-${index}`} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <div className="mb-3 flex items-center justify-between gap-2"><span className="text-xs font-bold uppercase tracking-wide text-slate-400">Ученик {index + 1}</span><button type="button" disabled={assignmentDrafts.length === 1 || busy} onClick={() => setAssignmentDrafts(rows => rows.filter((_, rowIndex) => rowIndex !== index))} className="min-h-11 rounded-xl px-3 text-sm font-bold text-red-600 disabled:opacity-30">Удалить</button></div>
                  <div className="grid gap-2">
                    <input value={item.student_name} onChange={event => updateAssignmentDraft(index, { student_name: event.target.value })} placeholder="ФИО ученика *" className="min-h-11 rounded-xl border bg-white px-3" />
                    {selectedIpad ? <div className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3"><button type="button" onClick={() => setAssignmentPickerIndex(index)} className="min-w-0 flex-1 text-left text-sm font-semibold text-blue-800"><span className="block truncate">{ipadLabel(selectedIpad)}</span></button><button type="button" onClick={() => updateAssignmentDraft(index, { ipad_device_id: '' })} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500" aria-label="Сбросить iPad">✕</button></div> : <button type="button" onClick={() => setAssignmentPickerIndex(index)} className="min-h-11 rounded-xl border border-dashed border-blue-300 bg-white px-3 text-left text-sm font-semibold text-blue-700">Выбрать iPad *</button>}
                    <input value={item.note} onChange={event => updateAssignmentDraft(index, { note: event.target.value })} placeholder="Заметка" className="min-h-11 rounded-xl border bg-white px-3" />
                  </div>
                </div>;
              })}
              <button type="button" onClick={() => setAssignmentDrafts(rows => [...rows, { assignment_id: null, student_name: '', ipad_device_id: '', note: '' }])} className="min-h-11 w-full rounded-xl border border-dashed border-blue-300 font-bold text-blue-700">+ Добавить ученика</button>
              <div className="grid grid-cols-2 gap-2"><button type="button" disabled={busy} onClick={() => { setAssignmentEditorOpen(false); setAssignmentPickerIndex(null); }} className="min-h-12 rounded-xl bg-slate-100 font-bold text-slate-600">Отмена</button><button type="button" disabled={busy} onClick={saveAssignments} className="min-h-12 rounded-xl bg-blue-600 font-black text-white disabled:opacity-50">{busy ? 'Сохранение...' : 'Сохранить и начать подписи заново'}</button></div>
            </div>
          ) : (contentTab === 'active' || contentTab === 'departed') && <div className="space-y-2">{visibleStudents.length === 0 ? <Empty text="В этом разделе пока нет учеников"/> : visibleStudents.map(student => <div key={student.id} className={`rounded-2xl p-4 ${student.student_status === 'ACTIVE' ? 'bg-slate-50' : 'bg-slate-100'}`}><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-bold">{student.student_name}</p><p className="truncate text-sm text-slate-500">{student.ipad_name} {student.ipad_model || ''}</p></div><div className="min-w-0 text-right"><p className="font-mono text-sm font-bold text-blue-700">Tag {student.ipad_tag}</p><p className="truncate font-mono text-xs text-slate-400">{student.serial_number || 'Без Serial'}</p></div></div>{student.note && <p className="mt-2 text-sm text-slate-500">{student.note}</p>}{act.status === 'COMPLETED' && student.student_status === 'ACTIVE' && student.status === 'ISSUED' && <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => openOperation('replacement', student)} className="min-h-11 rounded-xl bg-blue-100 px-4 text-sm font-bold text-blue-700">Заменить iPad</button><button onClick={() => openOperation('departure', student)} className="min-h-11 rounded-xl bg-amber-100 px-4 text-sm font-bold text-amber-700">Оформить выбытие</button></div>}{student.status === 'RETURN_PENDING' && <button onClick={() => openOperation('late-return', student)} className="mt-3 min-h-11 rounded-xl bg-violet-100 px-4 text-sm font-bold text-violet-700">Оформить поздний возврат</button>}</div>)}</div>}
          {contentTab === 'events' && <div className="space-y-2">{finalRevisions.length === 0 ? <Empty text="Финальных версий пока нет"/> : finalRevisions.map((item, index) => {
            const isCurrent = index === finalRevisions.length - 1;
            return <div key={item.id} className={`rounded-2xl p-4 ${isCurrent ? 'bg-blue-50 ring-1 ring-blue-200' : 'bg-slate-50'}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold">{index + 1}. {revisionTitle(item, index === 0)}</p>
                  <p className="mt-1 text-xs text-slate-500">{new Date(item.created_at).toLocaleString('ru-RU')}</p>
                </div>
                {isCurrent && <span className="shrink-0 rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">Текущая</span>}
              </div>
              <button onClick={() => openRevisionPdf(item.version_number)} className="mt-3 min-h-11 rounded-xl bg-blue-100 px-4 text-sm font-bold text-blue-700">Открыть PDF</button>
            </div>;
          })}</div>}
          {contentTab === 'appendices' && <div className="space-y-2">{act.appendices.length === 0 ? <Empty text="Приложений пока нет"/> : act.appendices.map(item => <div key={item.id} className="rounded-2xl bg-slate-50 p-4"><div className="flex flex-wrap justify-between gap-2"><div><p className="font-bold">№{item.appendix_number} · {operationLabels[item.operation_type] || item.operation_type}</p><p className="text-xs text-slate-500">{new Date(item.created_at).toLocaleString('ru-RU')} · {item.responsible_name}</p></div><span className="h-fit rounded-full bg-white px-3 py-1 text-xs font-bold">{appendixStatusLabels[item.status] || item.status}</span></div>{item.pdf_available && <button onClick={() => openPdf(item.id)} className="mt-3 min-h-10 rounded-xl bg-blue-100 px-4 text-sm font-bold text-blue-700">PDF приложения</button>}</div>)}</div>}
        </div>
      </section>
      <section className="flex min-h-[52vh] flex-col overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-slate-200 lg:sticky lg:top-[84px] lg:h-[calc(100vh-104px)]">
        <div className="border-b border-slate-100 p-5"><p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">{canSign ? 'Текущее действие' : 'Итог документа'}</p><h2 className="mt-2 text-2xl font-black">{actionTitle}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{pendingAppendix ? (pendingAppendix.status === 'WAITING_RESPONSIBLE'
  ? `Сейчас подписывает ответственный: ${pendingAppendix.responsible_name}. Затем подтверждает IT: ${pendingAppendix.issuer_name}. Изменение применится после обеих подписей.`
  : `Ответственный ${pendingAppendix.responsible_name} подписал. Сейчас подтверждает IT: ${pendingAppendix.issuer_name}.`) : canSignMainAct ? 'Подтвердите передачу полного комплекта iPad.' : 'Основной акт подписан. Последующие изменения оформляются приложениями.'}</p></div>
        {canSign ? <><div className="flex flex-1 flex-col p-5"><div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1"><button onClick={() => changeSignatureMode('draw')} className={`min-h-11 rounded-lg text-sm font-bold ${signatureMode === 'draw' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>Рисовать подпись</button><button onClick={() => changeSignatureMode('upload')} className={`min-h-11 rounded-lg text-sm font-bold ${signatureMode === 'upload' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>Загрузить файл</button></div>{signatureMode === 'draw' ? <div className="mt-4 flex flex-1 flex-col justify-center"><SignaturePad key={signatureResetKey} onSave={setSignatureData} onClear={() => setSignatureData('')} /></div> : <div className="mt-4 flex flex-1 items-center justify-center"><SignatureUpload key={signatureResetKey} onUpload={readSignatureFile} /></div>}</div><div className="grid grid-cols-[120px_1fr] gap-3 border-t p-5"><button onClick={clearSignature} className="min-h-12 rounded-xl bg-slate-100 font-bold text-slate-600">Очистить</button><button disabled={!signatureData || busy} onClick={submitSignature} className="min-h-12 rounded-xl bg-blue-600 font-black text-white disabled:opacity-40">{busy ? 'Сохранение...' : 'Подписать'}</button></div>{pendingAppendix && <button disabled={busy} onClick={() => cancelAppendix(pendingAppendix)} className="mx-5 mb-5 min-h-11 rounded-xl bg-red-50 font-bold text-red-700">Отменить приложение</button>}</> : <div className="flex flex-1 items-center justify-center p-6"><div className="w-full max-w-md text-center"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-3xl font-black text-emerald-700">✓</div><h3 className="mt-4 text-xl font-black">{act.status === 'RETURNED' ? 'Возврат завершён' : 'Выдача завершена'}</h3><p className="mt-2 text-sm text-slate-500">{act.status === 'RETURNED' ? 'Все iPad возвращены и результаты проверки сохранены.' : 'Все ответственные и IT подписали Advisory-акт.'}</p>{act.status === 'COMPLETED' && <button onClick={() => openOperation('year-end-return')} className="mt-5 min-h-12 w-full rounded-xl bg-violet-600 font-bold text-white">Оформить годовой возврат</button>}<button onClick={() => openPdf()} className={`${act.status === 'COMPLETED' ? 'mt-3' : 'mt-5'} min-h-12 w-full rounded-xl bg-blue-600 font-bold text-white`}>Открыть финальный PDF</button><button onClick={downloadPdf} className="mt-3 min-h-12 w-full rounded-xl bg-slate-100 font-bold">Скачать PDF</button><button onClick={() => setHistoryOpen(true)} className="mt-3 min-h-12 w-full rounded-xl bg-slate-900 font-bold text-white">История изменений</button></div></div>}
      </section>
    </main>
    {assignmentPickerIndex !== null && <IpadPickerModal
      ipads={assignmentIpadOptions}
      excludeIds={assignmentDrafts.filter((_, rowIndex) => rowIndex !== assignmentPickerIndex).map(item => item.ipad_device_id).filter(Boolean)}
      onSelect={ipad => { updateAssignmentDraft(assignmentPickerIndex, { ipad_device_id: ipad.id }); setAssignmentPickerIndex(null); }}
      onClose={() => setAssignmentPickerIndex(null)}
    />}
    {participantsEditorOpen && <IpadParticipantsModal
      actId={act.id}
      issuerParticipantId={act.issuer_participant_id}
      responsibleParticipantIds={act.responsibles.map(item => item.participant_id)}
      onUpdated={async () => { clearSignature(); await load(); }}
      onClose={() => setParticipantsEditorOpen(false)}
    />}
    {operation && <OperationModalV2 operation={operation} student={selectedStudent} form={form} setForm={setForm} responsibles={act.responsibles} itManagers={itManagers} issuerName={act.issuer} availableIpads={availableIpads} busy={busy} onSubmit={submitOperation} onClose={() => setOperation(null)} />}
    {pdfOpen && <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/90 p-3"><div className="mx-auto mb-3 flex w-full max-w-6xl flex-wrap justify-end gap-2"><a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center rounded-xl bg-blue-600 px-4 font-bold text-white">Открыть в новой вкладке</a><a href={pdfUrl} download={`${shortId}.pdf`} className="flex min-h-11 items-center rounded-xl bg-white px-4 font-bold">Скачать</a><button onClick={closePdf} className="min-h-11 rounded-xl bg-white px-5 font-bold">Закрыть</button></div><iframe src={pdfUrl} title="PDF акта" className="mx-auto h-full w-full max-w-6xl rounded-2xl bg-white"/></div>}
    {deleteConfirmOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><p className="text-xs font-bold uppercase tracking-widest text-red-600">Необратимое действие</p><h2 className="mt-2 text-xl font-black">Удалить акт навсегда?</h2><p className="mt-3 text-sm leading-6 text-slate-600">Точно удалить {shortId} со всеми версиями, подписями, приложениями и назначениями iPad? Восстановить его будет невозможно.</p><div className="mt-6 flex gap-3"><button disabled={busy} onClick={permanentlyDeleteAct} className="min-h-12 flex-1 rounded-xl bg-red-600 font-black text-white disabled:opacity-50">{busy ? 'Удаление...' : 'Удалить навсегда'}</button><button disabled={busy} onClick={() => setDeleteConfirmOpen(false)} className="min-h-12 rounded-xl bg-slate-100 px-5 font-bold">Отмена</button></div></div></div>}
  </div>;
}

function OperationModal({ operation, student, form, setForm, responsibles, itManagers, issuerName, availableIpads, busy, onSubmit, onClose }: { operation: Operation; student: Student | null; form: Record<string, any>; setForm: (value: Record<string, any>) => void; responsibles: Responsible[]; itManagers: ItManager[]; issuerName: string; availableIpads: AvailableIpad[]; busy: boolean; onSubmit: () => void; onClose: () => void }) {
  const [ipadPickerOpen, setIpadPickerOpen] = useState(false);
  const selectedIpad = availableIpads.find(ipad => ipad.id === form.ipad_device_id);
  const set = (key: string, value: unknown) => setForm({ ...form, [key]: value });
  const title = operation === 'replacement' ? 'Замена iPad' : operation === 'departure' ? 'Выбытие ученика' : operation === 'addition' ? 'Добавление ученика' : operation === 'late-return' ? 'Поздний возврат iPad' : 'Годовой возврат Advisory';
  const setReturnItem = (index: number, key: string, value: string) => set('items', form.items.map((item: Record<string, unknown>, itemIndex: number) => itemIndex === index ? { ...item, [key]: value } : item));
  const withItPicker = operation === 'replacement' || operation === 'departure' || operation === 'late-return';
  const responsibleName = responsibles.find(item => item.participant_id === form.responsible_participant_id)?.full_name || 'ответственный';
  const itName = withItPicker
    ? (itManagers.find(item => item.id === form.issuer_participant_id)?.full_name || issuerName || 'IT')
    : (issuerName || 'IT');
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl"><p className="text-xs font-bold uppercase tracking-widest text-blue-600">Новое приложение</p><h2 className="mt-1 text-xl font-black">{title}</h2>{student && <p className="mt-1 text-sm text-slate-500">{student.student_name} · Tag {student.ipad_tag}</p>}<div className="mt-5 space-y-3"><FieldLabel text="Ответственное лицо (подписывает первым)"><select value={form.responsible_participant_id || ''} onChange={event => set('responsible_participant_id', event.target.value)} className="min-h-12 w-full rounded-xl border px-3">{responsibles.map(item => <option key={item.participant_id} value={item.participant_id}>{item.full_name}</option>)}</select></FieldLabel>{withItPicker && <FieldLabel text="Сотрудник IT (подписывает вторым)"><select value={form.issuer_participant_id || ''} onChange={event => set('issuer_participant_id', event.target.value)} className="min-h-12 w-full rounded-xl border px-3">{itManagers.length === 0 && <option value="">{issuerName || 'IT из основного акта'}</option>}{itManagers.map(item => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></FieldLabel>}<p className="rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-800">Порядок подписей: сначала <b>{responsibleName}</b>, затем IT — <b>{itName}</b>.</p><FieldLabel text="Дата"><input type="date" value={form.date || ''} onChange={event => set('date', event.target.value)} className="min-h-12 w-full rounded-xl border px-3"/></FieldLabel>{operation === 'addition' && <FieldLabel text="ФИО ученика"><input value={form.student_name || ''} onChange={event => set('student_name', event.target.value)} className="min-h-12 w-full rounded-xl border px-3"/></FieldLabel>}{(operation === 'replacement' || operation === 'addition') && <FieldLabel text="Новый свободный iPad">{selectedIpad ? (
    <div className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3">
      <button type="button" onClick={() => setIpadPickerOpen(true)} className="min-w-0 flex-1 text-left text-sm font-semibold text-blue-800"><span className="block truncate">{ipadLabel(selectedIpad)}</span></button>
      <button type="button" onClick={() => set('ipad_device_id', '')} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500" aria-label="Сбросить iPad">✕</button>
    </div>
  ) : (
    <button type="button" onClick={() => setIpadPickerOpen(true)} className="min-h-12 w-full rounded-xl border border-dashed border-blue-300 bg-white px-3 text-left text-sm font-semibold text-blue-700 hover:border-blue-400">Выбрать iPad</button>
  )}</FieldLabel>}{operation === 'replacement' && <FieldLabel text="Причина замены"><select value={form.reason || ''} onChange={event => set('reason', event.target.value)} className="min-h-12 w-full rounded-xl border px-3"><option value="">Выберите причину</option>{damageReasonOptions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></FieldLabel>}{operation === 'replacement' && form.reason && <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">Старый iPad: {conditionResultLabel(form.reason)}. Детали можно указать в примечании.</p>}{operation === 'addition' && <FieldLabel text="Причина"><input value={form.reason || ''} onChange={event => set('reason', event.target.value)} className="min-h-12 w-full rounded-xl border px-3"/></FieldLabel>}{operation === 'departure' && <><FieldLabel text="Состояние iPad при выбытии"><select value={form.return_condition || 'OK'} onChange={event => set('return_condition', event.target.value)} className="min-h-12 w-full rounded-xl border px-3">{departureConditionOptions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></FieldLabel><p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">Результат: {conditionResultLabel(form.return_condition || 'OK')}.</p></>}{operation === 'late-return' && <><FieldLabel text="Состояние возвращённого iPad"><select value={form.condition || 'OK'} onChange={event => set('condition', event.target.value)} className="min-h-12 w-full rounded-xl border px-3">{returnConditionOptions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></FieldLabel><p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">Результат: {conditionResultLabel(form.condition || 'OK')}.</p></>}{operation === 'year-end-return' && <div className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Состояние каждого iPad</p><button type="button" onClick={() => set('items', form.items.map((item: Record<string, string>) => ({ ...item, condition: 'OK' })))} className="min-h-11 rounded-xl bg-emerald-100 px-4 text-sm font-bold text-emerald-700">Все в порядке</button></div>{form.items.map((item: Record<string, string>, index: number) => <div key={item.assignment_id} className="rounded-2xl bg-slate-50 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="min-w-0 truncate font-bold">{item.student_name} · Tag {item.ipad_tag}</p><span className="shrink-0 text-xs text-slate-500">{conditionResultLabel(item.condition || 'OK')}</span></div><select value={item.condition || 'OK'} onChange={event => setReturnItem(index, 'condition', event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border px-3">{returnConditionOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>)}</div>}<FieldLabel text="Примечание"><textarea value={form.note || ''} onChange={event => set('note', event.target.value)} className="min-h-20 w-full rounded-xl border p-3"/></FieldLabel></div><div className="mt-5 flex gap-3"><button disabled={busy} onClick={onSubmit} className="min-h-12 flex-1 rounded-xl bg-blue-600 font-black text-white disabled:opacity-50">Создать приложение</button><button onClick={onClose} className="min-h-12 rounded-xl bg-slate-100 px-5 font-bold">Отмена</button></div></div>{ipadPickerOpen && <IpadPickerModal ipads={availableIpads} onSelect={ipad => { set('ipad_device_id', ipad.id); setIpadPickerOpen(false); }} onClose={() => setIpadPickerOpen(false)} />}</div>;
}

function OperationModalV2({ operation, student, form, setForm, responsibles, itManagers, issuerName, availableIpads, busy, onSubmit, onClose }: { operation: Operation; student: Student | null; form: Record<string, any>; setForm: (value: Record<string, any>) => void; responsibles: Responsible[]; itManagers: ItManager[]; issuerName: string; availableIpads: AvailableIpad[]; busy: boolean; onSubmit: () => void; onClose: () => void }) {
  const [ipadPickerOpen, setIpadPickerOpen] = useState(false);
  const selectedIpad = availableIpads.find(ipad => ipad.id === form.ipad_device_id);
  const set = (key: string, value: unknown) => setForm({ ...form, [key]: value });
  const setReturnItem = (index: number, value: string) => set('items', form.items.map((item: Record<string, unknown>, itemIndex: number) => itemIndex === index ? { ...item, condition: value } : item));
  const title = operation === 'replacement' ? 'Замена iPad' : operation === 'departure' ? 'Выбытие ученика' : operation === 'addition' ? 'Добавление ученика' : operation === 'late-return' ? 'Поздний возврат iPad' : 'Годовой возврат Advisory';
  const withItPicker = operation === 'replacement' || operation === 'departure' || operation === 'late-return';
  const responsibleName = responsibles.find(item => item.participant_id === form.responsible_participant_id)?.full_name || 'ответственный';
  const itName = withItPicker ? (itManagers.find(item => item.id === form.issuer_participant_id)?.full_name || issuerName || 'IT') : (issuerName || 'IT');

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
    <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl">
      <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Новое приложение</p>
      <h2 className="mt-1 text-xl font-black">{title}</h2>
      {student && <p className="mt-1 text-sm text-slate-500">{student.student_name} · Tag {student.ipad_tag}</p>}
      <div className="mt-5 space-y-3">
        <FieldLabel text="Ответственное лицо (подписывает первым)"><select value={form.responsible_participant_id || ''} onChange={event => set('responsible_participant_id', event.target.value)} className="min-h-12 w-full rounded-xl border px-3">{responsibles.map(item => <option key={item.participant_id} value={item.participant_id}>{item.full_name}</option>)}</select></FieldLabel>
        {withItPicker && <FieldLabel text="Сотрудник IT (подписывает вторым)"><select value={form.issuer_participant_id || ''} onChange={event => set('issuer_participant_id', event.target.value)} className="min-h-12 w-full rounded-xl border px-3">{itManagers.length === 0 && <option value="">{issuerName || 'IT из основного акта'}</option>}{itManagers.map(item => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></FieldLabel>}
        <p className="rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-800">Порядок подписей: сначала <b>{responsibleName}</b>, затем IT — <b>{itName}</b>.</p>
        <FieldLabel text="Дата"><input type="date" value={form.date || ''} onChange={event => set('date', event.target.value)} className="min-h-12 w-full rounded-xl border px-3"/></FieldLabel>
        {operation === 'addition' && <FieldLabel text="ФИО ученика"><input value={form.student_name || ''} onChange={event => set('student_name', event.target.value)} className="min-h-12 w-full rounded-xl border px-3"/></FieldLabel>}
        {(operation === 'replacement' || operation === 'addition') && <FieldLabel text="Новый свободный iPad">{selectedIpad ? <div className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3"><button type="button" onClick={() => setIpadPickerOpen(true)} className="min-w-0 flex-1 text-left text-sm font-semibold text-blue-800"><span className="block truncate">{ipadLabel(selectedIpad)}</span></button><button type="button" onClick={() => set('ipad_device_id', '')} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500" aria-label="Сбросить iPad">✕</button></div> : <button type="button" onClick={() => setIpadPickerOpen(true)} className="min-h-12 w-full rounded-xl border border-dashed border-blue-300 bg-white px-3 text-left text-sm font-semibold text-blue-700 hover:border-blue-400">Выбрать iPad</button>}</FieldLabel>}
        {operation === 'replacement' && <FieldLabel text="Причина замены"><CustomIpadOptionSelect optionType="REPLACEMENT_REASON" value={form.reason || ''} systemOptions={damageReasonOptions} onChange={value => set('reason', value)} /></FieldLabel>}
        {operation === 'replacement' && form.reason && <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">Старый iPad: {conditionResultLabel(form.reason)}. Детали можно указать в примечании.</p>}
        {operation === 'addition' && <FieldLabel text="Причина"><input value={form.reason || ''} onChange={event => set('reason', event.target.value)} className="min-h-12 w-full rounded-xl border px-3"/></FieldLabel>}
        {operation === 'departure' && <><FieldLabel text="Состояние iPad при выбытии"><CustomIpadOptionSelect optionType="RETURN_CONDITION" value={form.return_condition || 'OK'} systemOptions={departureConditionOptions} onChange={value => set('return_condition', value)} /></FieldLabel><p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">Результат: {conditionResultLabel(form.return_condition || 'OK')}.</p></>}
        {operation === 'late-return' && <><FieldLabel text="Состояние возвращённого iPad"><select value={form.condition || 'OK'} onChange={event => set('condition', event.target.value)} className="min-h-12 w-full rounded-xl border px-3">{returnConditionOptions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></FieldLabel><p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">Результат: {conditionResultLabel(form.condition || 'OK')}.</p></>}
        {operation === 'year-end-return' && <div className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Состояние каждого iPad</p><button type="button" onClick={() => set('items', form.items.map((item: Record<string, unknown>) => ({ ...item, condition: 'OK' })))} className="min-h-10 rounded-lg bg-emerald-50 px-3 text-xs font-bold text-emerald-700">Всем: всё в порядке</button></div>{form.items.map((item: Record<string, string>, index: number) => <div key={item.assignment_id} className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_190px]"><div className="min-w-0"><p className="truncate text-sm font-bold">{item.student_name}</p><p className="truncate text-xs text-slate-500">Tag {item.ipad_tag}</p></div><select value={item.condition || 'OK'} onChange={event => setReturnItem(index, event.target.value)} className="min-h-11 rounded-xl border px-3 text-sm">{returnConditionOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>)}</div>}
        <FieldLabel text="Примечание"><textarea value={form.note || ''} onChange={event => set('note', event.target.value)} rows={3} className="w-full rounded-xl border p-3"/></FieldLabel>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3"><button onClick={onClose} className="min-h-12 rounded-xl bg-slate-100 font-bold">Отмена</button><button disabled={busy} onClick={onSubmit} className="min-h-12 rounded-xl bg-blue-600 font-black text-white disabled:opacity-50">{busy ? 'Создание...' : 'Создать приложение'}</button></div>
      {ipadPickerOpen && <IpadPickerModal ipads={availableIpads} onSelect={ipad => { set('ipad_device_id', ipad.id); setIpadPickerOpen(false); }} onClose={() => setIpadPickerOpen(false)} />}
    </div>
  </div>;
}

function Progress({ active, label }: { active: boolean; label: string }) {
  return <div className="text-center"><span className={`mx-auto block h-3 w-3 rounded-full ${active ? 'bg-blue-600 ring-4 ring-blue-100' : 'bg-slate-200'}`}/><span className="mt-2 block text-[11px] font-bold leading-tight text-slate-500 sm:text-[10px]">{label}</span></div>;
}

function PeopleCard({ title, names, detail, accent, onEdit }: { title: string; names: string[]; detail: string; accent: string; onEdit?: () => void }) {
  return <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><div className="flex gap-3"><span className={`min-h-11 w-1 shrink-0 rounded-full ${accent}`}/><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</p>{onEdit && <button type="button" onClick={onEdit} className="min-h-9 shrink-0 rounded-lg bg-blue-50 px-3 text-xs font-bold text-blue-700">Изменить</button>}</div><div className="mt-1 space-y-1">{names.map((name, index) => <p key={`${name}-${index}`} className="break-words font-black leading-snug">{name}</p>)}</div><p className="mt-1 text-xs text-slate-500">{detail}</p></div></div></div>;
}

function FieldLabel({ text, children }: { text: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">{text}</span>{children}</label>;
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`min-h-11 rounded-lg px-2 text-xs font-bold ${active ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>{children}</button>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-400">{text}</div>;
}
