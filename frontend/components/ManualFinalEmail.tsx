'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

interface Recipient {
  participant_id?: string | null;
  full_name: string;
  email: string;
  role: string;
}

interface DocumentOption {
  kind: 'ISSUE_COMPLETED' | 'RETURN_COMPLETED';
  label: string;
  available: boolean;
  version: number | null;
}

interface DispatchRecipient {
  email: string;
  name?: string | null;
  status: string;
  sent_at?: string | null;
  last_error?: string | null;
}

interface Dispatch {
  dispatch_id: string;
  kind: DocumentOption['kind'];
  document_version: number;
  custom_message?: string | null;
  requested_by: string;
  created_at: string;
  status: 'SENT' | 'ERROR' | 'PENDING';
  recipients: DispatchRecipient[];
}

interface EmailData {
  recipients: Recipient[];
  documents: DocumentOption[];
  history: Dispatch[];
}

const statusLabels: Record<string, string> = {
  SENT: 'Отправлено',
  PENDING: 'В очереди',
  PROCESSING: 'Отправляется',
  DEAD: 'Ошибка',
  ERROR: 'Ошибка',
};

export default function ManualFinalEmail({ actId }: { actId: string }) {
  const { showToast } = useToast();
  const [data, setData] = useState<EmailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<DocumentOption | null>(null);
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [customMessage, setCustomMessage] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setData((await api.get(`/api/acts/${actId}/manual-final-email`)).data);
    } catch (error: unknown) {
      showToast(apiErrorMessage(error, 'Не удалось загрузить отправки'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [actId]);

  const openSend = (document: DocumentOption) => {
    setSelectedDocument(document);
    setSelectedEmails(data?.recipients.map(item => item.email) || []);
    setCustomMessage('');
  };

  const submit = async () => {
    if (!selectedDocument || selectedEmails.length === 0) return;
    setSending(true);
    try {
      await api.post(`/api/acts/${actId}/manual-final-email`, {
        kind: selectedDocument.kind,
        recipient_emails: selectedEmails,
        custom_message: customMessage.trim() || null,
      });
      setSelectedDocument(null);
      await load();
      showToast('Финальный документ поставлен в очередь', 'success');
    } catch (error: unknown) {
      showToast(apiErrorMessage(error, 'Не удалось отправить документ'), 'error');
    } finally {
      setSending(false);
    }
  };

  if (loading && !data) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-400">Загрузка ручной отправки...</div>;
  }
  if (!data) return null;

  const hasAvailableDocument = data.documents.some(item => item.available);
  const wasSent = selectedDocument ? data.history.some(item => item.kind === selectedDocument.kind) : false;

  return <>
    <section className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">Email участникам</p><h2 className="mt-1 text-lg font-black text-slate-900">Ручная отправка финального документа</h2><p className="mt-1 text-sm text-slate-500">Система ничего не отправляет автоматически. Выберите документ и участников.</p></div>
        <button onClick={load} disabled={loading} className="min-h-10 rounded-xl bg-white px-3 text-xs font-bold text-slate-600 ring-1 ring-slate-200 disabled:opacity-50">Обновить статусы</button>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">{data.documents.map(document => {
        const previous = data.history.find(item => item.kind === document.kind);
        return <button key={document.kind} disabled={!document.available} onClick={() => openSend(document)} className="min-h-14 rounded-xl bg-blue-600 px-4 text-left text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"><span className="block">{previous ? `Отправить повторно: ${document.label.toLowerCase()}` : `Отправить: ${document.label.toLowerCase()}`}</span><span className="mt-0.5 block text-[11px] font-medium opacity-75">{document.available ? `PDF версии ${document.version}` : 'Финальная версия ещё не готова'}</span></button>;
      })}</div>
      {!hasAvailableDocument && <p className="mt-3 rounded-xl bg-white p-3 text-sm text-slate-500">Кнопка станет доступна после завершения выдачи или возврата.</p>}
      <div className="mt-5 border-t border-blue-100 pt-4"><p className="text-sm font-black text-slate-800">История отправок</p>{data.history.length === 0 ? <p className="mt-2 text-sm text-slate-400">Финальные документы ещё не отправлялись.</p> : <div className="mt-2 space-y-2">{data.history.map(dispatch => <details key={dispatch.dispatch_id} className="rounded-xl bg-white p-3 ring-1 ring-slate-200"><summary className="cursor-pointer list-none"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-bold text-slate-800">{dispatch.kind === 'ISSUE_COMPLETED' ? 'Финал выдачи' : 'Финал возврата'} · версия {dispatch.document_version}</p><p className="text-xs text-slate-400">{new Date(dispatch.created_at).toLocaleString('ru-RU')} · {dispatch.requested_by}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${dispatch.status === 'SENT' ? 'bg-emerald-100 text-emerald-700' : dispatch.status === 'ERROR' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{statusLabels[dispatch.status] || dispatch.status}</span></div></summary><div className="mt-3 space-y-2 border-t pt-3">{dispatch.custom_message && <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{dispatch.custom_message}</p>}{dispatch.recipients.map(recipient => <div key={recipient.email} className="flex items-start justify-between gap-3 text-xs"><div><p className="font-bold text-slate-700">{recipient.name || recipient.email}</p><p className="text-slate-400">{recipient.email}</p>{recipient.last_error && <p className="mt-1 text-red-600">{recipient.last_error}</p>}</div><span className="font-bold text-slate-500">{statusLabels[recipient.status] || recipient.status}</span></div>)}</div></details>)}</div>}</div>
    </section>
    {selectedDocument && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"><p className="text-xs font-black uppercase tracking-widest text-blue-600">Ручная отправка</p><h2 className="mt-1 text-xl font-black">{selectedDocument.label}</h2><p className="mt-2 text-sm text-slate-500">К письму будет прикреплён PDF версии {selectedDocument.version}.</p>{wasSent && <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800">Этот тип документа уже отправлялся. Новая отправка будет записана отдельно.</div>}<div className="mt-5"><p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Получатели</p><div className="space-y-2">{data.recipients.map(recipient => <label key={recipient.email} className="flex min-h-12 items-center gap-3 rounded-xl bg-slate-50 p-3"><input type="checkbox" checked={selectedEmails.includes(recipient.email)} onChange={event => setSelectedEmails(current => event.target.checked ? [...current, recipient.email] : current.filter(email => email !== recipient.email))} className="h-5 w-5"/><span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-800">{recipient.full_name || recipient.email}</span><span className="block truncate text-xs text-slate-500">{recipient.role} · {recipient.email}</span></span></label>)}</div></div><label className="mt-5 block"><span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Сообщение администратора · необязательно</span><textarea maxLength={2000} value={customMessage} onChange={event => setCustomMessage(event.target.value)} placeholder="Например: Сохраните этот документ для своих записей." className="min-h-24 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-400"/></label><div className="mt-6 flex gap-3"><button disabled={sending || selectedEmails.length === 0} onClick={submit} className="min-h-12 flex-1 rounded-xl bg-blue-600 font-black text-white disabled:opacity-40">{sending ? 'Постановка в очередь...' : wasSent ? 'Отправить повторно' : 'Отправить участникам'}</button><button disabled={sending} onClick={() => setSelectedDocument(null)} className="min-h-12 rounded-xl bg-slate-100 px-5 font-bold">Отмена</button></div></div></div>}
  </>;
}

function apiErrorMessage(error: unknown, fallback: string): string {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map(item => item && typeof item === 'object' && 'msg' in item ? String(item.msg) : '').filter(Boolean);
    if (messages.length) return messages.join('; ');
  }
  return fallback;
}
