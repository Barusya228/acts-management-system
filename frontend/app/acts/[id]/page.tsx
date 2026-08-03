'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeActRecipients } from '@/lib/actRecipients';
import SignaturePad from '@/components/SignaturePad';
import SignatureUpload from '@/components/SignatureUpload';

interface Act {
  id: string; party1_name: string; party2_name: string; receiver_email: string; issue_date: string;
  item_name: string; item_serial?: string; status: string; created_at: string;
  extra_data_json?: Record<string, unknown>;
}
interface ActVersion { id: string; version_number: number; created_at: string; change_note?: string | null; }

const statusCopy: Record<string, { label: string; detail: string; tone: string }> = {
  DRAFT: { label: 'Ожидает подписи получателя', detail: 'Получатель подтверждает получение всего комплекта.', tone: 'bg-amber-100 text-amber-800' },
  SIGNED_PARTY2: { label: 'Ожидает подтверждения IT', detail: 'Все получатели подписали акт. Осталось подтверждение выдающего.', tone: 'bg-blue-100 text-blue-800' },
  COMPLETED: { label: 'Комплект выдан', detail: 'Акт подписан всеми сторонами.', tone: 'bg-emerald-100 text-emerald-800' },
  RETURN_INITIATED: { label: 'Возврат начат', detail: 'Ожидается подтверждение возврата.', tone: 'bg-violet-100 text-violet-800' },
  RETURN_SIGNED_PARTY1: { label: 'Возврат подтверждён IT', detail: 'Получатель должен подтвердить возврат комплекта.', tone: 'bg-violet-100 text-violet-800' },
  RETURNED: { label: 'Комплект возвращён', detail: 'Возврат завершён.', tone: 'bg-slate-200 text-slate-700' },
};

export default function ActViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading, loginAsGuest } = useAuth();
  const [act, setAct] = useState<Act | null>(null);
  const [error, setError] = useState('');
  const [signatureMode, setSignatureMode] = useState<'draw' | 'upload'>('draw');
  const [signatureData, setSignatureData] = useState('');
  const [signatureResetKey, setSignatureResetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [versions, setVersions] = useState<ActVersion[]>([]);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfOpen, setPdfOpen] = useState(false);
  const [returnConfirmOpen, setReturnConfirmOpen] = useState(false);

  useEffect(() => { if (!loading && !user) loginAsGuest(); }, [loading, user, loginAsGuest]);
  const loadAct = () => {
    if (!user) return;
    api.get(`/api/acts/${id}`).then(response => setAct(response.data)).catch(() => setError('Не удалось загрузить акт'));
  };
  useEffect(() => { loadAct(); }, [user, id]);
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  if (error) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-red-600">{error}</div>;
  if (!act) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-400">Загрузка прототипа...</div>;

  const recipients = normalizeActRecipients(act.extra_data_json, act.party2_name, act.receiver_email);
  const extraDevices = Array.isArray(act.extra_data_json?.equipment_list) ? act.extra_data_json.equipment_list as Array<Record<string, unknown>> : [];
  const accessories = Array.isArray(act.extra_data_json?.accessories) ? act.extra_data_json.accessories as Array<Record<string, unknown>> : [];
  const status = statusCopy[act.status] || { label: act.status, detail: 'Текущее состояние документа', tone: 'bg-slate-100 text-slate-700' };
  const signedCount = recipients.filter(item => item.signed_at).length;
  const isReturn = act.status.startsWith('RETURN') || act.status === 'RETURNED';
  const currentPerson = act.status === 'SIGNED_PARTY2' || act.status === 'RETURN_INITIATED' ? act.party1_name : recipients.find(item => isReturn ? !item.return_signed_at : !item.signed_at)?.full_name;
  const actionTitle = act.status === 'COMPLETED' ? 'Выдача завершена' : act.status === 'RETURNED' ? 'Возврат завершён' : currentPerson ? `Сейчас подписывает ${currentPerson}` : status.label;
  const isIpadAdvisory = Boolean(act.extra_data_json?.advisory_group && act.extra_data_json?.academic_year);
  const pendingRecipient = recipients.find(item => isReturn ? !item.return_signed_at : !item.signed_at);
  const party = act.status === 'SIGNED_PARTY2' || act.status === 'RETURN_INITIATED' ? 'party1' : 'party2';
  const signerId = party === 'party1' ? String(act.extra_data_json?.party1_participant_id || '') : pendingRecipient?.participant_id;
  const canSign = ['DRAFT', 'SIGNED_PARTY2', 'RETURN_INITIATED', 'RETURN_SIGNED_PARTY1'].includes(act.status);

  const readSignatureFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setSignatureData(String(reader.result || ''));
    reader.readAsDataURL(file);
  };
  const submitSignature = async () => {
    if (!signatureData || !signerId) return;
    setBusy(true);
    try {
      await api.post(`/api/acts/${id}/sign/${party}`, { signature_data: signatureData, participant_id: signerId });
      setSignatureData(''); setSignatureResetKey(value => value + 1); await loadAct();
    } catch (requestError: any) { setError(requestError.response?.data?.detail || 'Не удалось подписать акт'); }
    finally { setBusy(false); }
  };
  const startReturn = async () => {
    if (isIpadAdvisory) {
      window.location.href = `/acts/ipad/${act.id}`;
      return;
    }
    setBusy(true);
    try { await api.post(`/api/acts/${id}/return`, { return_date: new Date().toISOString().slice(0, 10), return_note: null }); await loadAct(); }
    catch (requestError: any) { setError(requestError.response?.data?.detail || 'Не удалось начать возврат'); }
    finally { setBusy(false); }
  };
  const openVersions = async () => {
    try { setVersions((await api.get(`/api/acts/${id}/versions`)).data || []); setVersionsOpen(true); }
    catch { setError('Не удалось загрузить версии акта'); }
  };
  const openPdf = async (versionNumber?: number) => {
    const endpoint = versionNumber ? `/api/acts/${id}/versions/${versionNumber}/download/pdf` : `/api/acts/${id}/preview/pdf`;
    try {
      const response = await api.get(endpoint, { responseType: 'blob' });
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(URL.createObjectURL(response.data)); setPdfOpen(true);
    } catch { setError('Не удалось открыть PDF'); }
  };
  const downloadPdf = async () => {
    try { const response = await api.get(`/api/acts/${id}/download/pdf`, { responseType: 'blob' }); const url = URL.createObjectURL(response.data); const link = document.createElement('a'); link.href = url; link.download = `ACT-${act.id.split('-')[0].toUpperCase()}.pdf`; link.click(); URL.revokeObjectURL(url); }
    catch { setError('Не удалось скачать PDF'); }
  };

  return <div className="min-h-screen bg-[#eef2f6] text-slate-900">
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur"><div className="mx-auto flex min-h-16 max-w-7xl items-center gap-3 px-4"><Link href={user?.role === 'ADMIN' ? '/admin/acts' : '/guest'} className="flex h-11 items-center rounded-xl px-3 text-sm font-semibold text-slate-500 hover:bg-slate-100">← К актам</Link><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600">Приём-передача</p><h1 className="text-base font-black sm:text-lg">Акт выдачи техники · ACT-{act.id.split('-')[0].toUpperCase()}</h1></div>{user?.role === 'ADMIN' && <Link href={`/admin/acts/${act.id}`} className="ml-auto flex min-h-11 items-center rounded-xl bg-slate-900 px-4 text-sm font-bold text-white">Управление</Link>}</div></header>
    <main className="mx-auto grid max-w-7xl gap-4 p-3 sm:p-4 lg:grid-cols-[46%_54%] lg:gap-5 lg:p-5">
      <section className="space-y-4 lg:max-h-[calc(100vh-104px)] lg:overflow-y-auto lg:pr-1">
        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><div className="flex flex-wrap items-start justify-between gap-3"><div><span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${status.tone}`}>{status.label}</span><p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">{status.detail}</p></div><div className="text-right"><p className="text-xs text-slate-400">Дата выдачи</p><p className="font-black">{new Date(act.issue_date).toLocaleDateString('ru-RU')}</p></div></div><div className="mt-5 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2"><Progress active label={`Получатели ${signedCount}/${recipients.length}`} /><span className="h-px w-full bg-slate-200"/><Progress active={act.status !== 'DRAFT'} label="Подтверждение IT"/><span className="h-px w-full bg-slate-200"/><Progress active={act.status === 'COMPLETED' || isReturn} label="Завершено"/></div></div>
        <div className="grid gap-3 sm:grid-cols-2"><Person title="Получатель" name={recipients.map(item => item.full_name).join(', ')} detail={recipients.map(item => item.email).filter(Boolean).join(', ')} accent="bg-blue-600"/><Person title="Выдающий" name={act.party1_name} detail="Сотрудник IT" accent="bg-slate-900"/></div>
        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Комплект техники</p><h2 className="mt-1 text-xl font-black">{1 + extraDevices.length + accessories.length} позиций</h2></div><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">Возврат комплектом</span></div><div className="space-y-2"><BundleItem color="bg-blue-600" badge="Основное" name={act.item_name} detail={`Инв: ${act.item_serial || '—'}`} />{extraDevices.map((item,index) => <BundleItem key={index} color="bg-violet-500" badge="Дополнительное" name={String(item.name || 'Устройство')} detail={`Инв: ${String(item.serial || '—')}`} />)}{accessories.map((item,index) => <BundleItem key={index} color="bg-emerald-500" badge="Мелкая техника" name={String(item.name || 'Позиция')} detail={`${String(item.model || 'Без модели')} · ${Number(item.quantity || 1)} шт.${item.note ? ` · ${String(item.note)}` : ''}`} />)}</div></div>
        <details className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><summary className="cursor-pointer text-sm font-bold text-slate-600">Дополнительно</summary><div className="mt-3 grid gap-2 sm:grid-cols-2"><button onClick={() => openPdf()} className="min-h-12 rounded-xl bg-slate-100 p-3 text-center text-sm font-semibold">Предпросмотр PDF</button><button onClick={openVersions} className="min-h-12 rounded-xl bg-slate-100 p-3 text-center text-sm font-semibold">История версий</button></div></details>
      </section>
      <section className="flex min-h-[52vh] flex-col overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-slate-200 lg:sticky lg:top-[84px] lg:h-[calc(100vh-104px)]"><div className="border-b border-slate-100 p-5"><p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">{act.status === 'COMPLETED' || act.status === 'RETURNED' ? 'Итог документа' : 'Текущее действие'}</p><h2 className="mt-2 text-2xl font-black">{actionTitle}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{canSign ? 'Подтвердите получение указанного комплекта. После подписи процесс автоматически перейдёт к следующему участнику.' : status.detail}</p></div>{canSign ? <><div className="flex flex-1 flex-col p-5"><div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1"><button onClick={() => setSignatureMode('draw')} className={`min-h-11 rounded-lg text-sm font-bold ${signatureMode === 'draw' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>Рисовать подпись</button><button onClick={() => setSignatureMode('upload')} className={`min-h-11 rounded-lg text-sm font-bold ${signatureMode === 'upload' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>Загрузить файл</button></div>{signatureMode === 'draw' ? <div className="mt-4 flex flex-1 flex-col justify-center"><SignaturePad key={signatureResetKey} onSave={setSignatureData} onClear={() => setSignatureData('')} /></div> : <div className="mt-4 flex flex-1 items-center justify-center"><SignatureUpload onUpload={readSignatureFile} /></div>}</div><div className="grid grid-cols-[120px_1fr] gap-3 border-t border-slate-100 p-5"><button type="button" onClick={() => { setSignatureData(''); setSignatureResetKey(value => value + 1); }} className="min-h-12 rounded-xl bg-slate-100 font-bold text-slate-600">Очистить</button><button disabled={!signatureData || busy} onClick={submitSignature} className="min-h-12 rounded-xl bg-blue-600 font-black text-white disabled:opacity-40">{busy ? 'Сохранение...' : signatureData ? 'Подписать акт' : 'Сначала сохраните подпись'}</button></div></> : (act.status === 'COMPLETED' || act.status === 'RETURNED') ? <div className="flex flex-1 items-center justify-center p-6"><div className="w-full max-w-lg"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-3xl font-black text-emerald-700">✓</div><h3 className="mt-4 text-center text-2xl font-black">{act.status === 'COMPLETED' ? 'Выдача завершена' : 'Возврат завершён'}</h3><div className="mt-6 space-y-3 rounded-2xl bg-slate-50 p-5 text-sm"><p className="flex gap-3"><span className="font-black text-emerald-600">✓</span><span>Акт подписан всеми сторонами</span></p><p className="flex gap-3"><span className="font-black text-emerald-600">✓</span><span>{act.status === 'COMPLETED' ? `Комплект закреплён за ${recipients.map(item => item.full_name).join(', ')}` : 'Комплект освобождён и отмечен возвращённым'}</span></p><p className="flex gap-3"><span className="font-black text-emerald-600">✓</span><span>Финальная версия сохранена</span></p></div><div className="mt-5 flex items-center justify-between rounded-2xl border border-slate-200 p-4"><div><p className="text-xs text-slate-400">Дата выдачи</p><p className="font-black">{new Date(act.issue_date).toLocaleDateString('ru-RU')}</p></div><p className="font-mono text-sm font-black text-slate-700">ACT-{act.id.split('-')[0].toUpperCase()}</p></div>{isIpadAdvisory && act.status === 'COMPLETED' && <Link href={`/acts/ipad/${act.id}`} className="mt-5 flex min-h-14 w-full items-center justify-center rounded-2xl bg-blue-600 px-4 text-base font-black text-white">Управление Advisory</Link>}{act.status === 'COMPLETED' && <button disabled={busy} onClick={() => setReturnConfirmOpen(true)} className={`${isIpadAdvisory ? 'mt-3' : 'mt-5'} min-h-14 w-full rounded-2xl bg-violet-600 text-base font-black text-white disabled:opacity-50`}>Оформить возврат комплекта</button>}<div className="mt-3 grid grid-cols-2 gap-3"><button onClick={() => openPdf()} className="min-h-12 rounded-xl bg-slate-100 font-bold text-slate-700">Открыть финальный PDF</button><button onClick={downloadPdf} className="min-h-12 rounded-xl bg-slate-900 font-bold text-white">Скачать PDF</button></div></div></div> : <div className="flex flex-1 items-center justify-center p-6"><div className="w-full max-w-md text-center"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-3xl text-emerald-700">✓</div><h3 className="mt-4 text-xl font-black">{status.label}</h3><button onClick={() => openPdf()} className="mt-3 min-h-12 w-full rounded-xl bg-slate-100 font-bold text-slate-700">Открыть PDF</button></div></div>}</section>
    </main>{returnConfirmOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl"><p className="text-xs font-bold uppercase tracking-widest text-violet-600">Подтверждение</p><h2 className="mt-1 text-xl font-black">Начать возврат всего комплекта?</h2><p className="mt-2 text-sm text-slate-500">После начала потребуется подпись IT и получателя.</p><div className="mt-4 max-h-64 space-y-2 overflow-y-auto rounded-2xl bg-slate-50 p-4"><BundleItem color="bg-blue-600" badge="Основное" name={act.item_name} detail={`Инв: ${act.item_serial || '—'}`} />{extraDevices.map((item,index) => <BundleItem key={index} color="bg-violet-500" badge="Дополнительное" name={String(item.name || 'Устройство')} detail={`Инв: ${String(item.serial || '—')}`} />)}{accessories.map((item,index) => <BundleItem key={index} color="bg-emerald-500" badge="Мелкая техника" name={String(item.name || 'Позиция')} detail={`${Number(item.quantity || 1)} шт.`} />)}</div><div className="mt-5 flex gap-3"><button disabled={busy} onClick={() => { setReturnConfirmOpen(false); startReturn(); }} className="min-h-12 flex-1 rounded-xl bg-violet-600 font-black text-white">Начать возврат</button><button onClick={() => setReturnConfirmOpen(false)} className="min-h-12 rounded-xl bg-slate-100 px-4 font-bold">Отмена</button></div></div></div>}{versionsOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><div className="w-full max-w-xl rounded-3xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase text-blue-600">ACT-{act.id.split('-')[0].toUpperCase()}</p><h2 className="text-xl font-black">История версий</h2></div><button onClick={() => setVersionsOpen(false)} className="min-h-11 rounded-xl bg-slate-100 px-4">Закрыть</button></div><div className="mt-4 max-h-[60vh] space-y-2 overflow-y-auto">{versions.map(version => <button key={version.id} onClick={() => { setVersionsOpen(false); openPdf(version.version_number); }} className="flex min-h-14 w-full items-center justify-between rounded-xl bg-slate-50 px-4 text-left hover:bg-blue-50"><span><span className="block font-bold">Версия {version.version_number}</span><span className="text-xs text-slate-500">{version.change_note || 'Состояние документа'} · {new Date(version.created_at).toLocaleString('ru-RU')}</span></span><span className="text-sm font-bold text-blue-600">Открыть PDF</span></button>)}</div></div></div>}{pdfOpen && pdfUrl && <div className="fixed inset-0 z-50 bg-slate-950/70 p-2 sm:p-4"><div className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white"><div className="flex items-center justify-between border-b p-3"><h2 className="font-black">Предпросмотр PDF</h2><button onClick={() => setPdfOpen(false)} className="min-h-11 rounded-xl bg-slate-100 px-4">Закрыть</button></div><iframe src={pdfUrl} className="min-h-0 flex-1" title="PDF акта" /></div></div>}
  </div>;
}

function Progress({ active, label }: { active: boolean; label: string }) { return <div className="text-center"><span className={`mx-auto block h-3 w-3 rounded-full ${active ? 'bg-blue-600 ring-4 ring-blue-100' : 'bg-slate-200'}`}/><span className="mt-2 block text-[10px] font-bold text-slate-500">{label}</span></div>; }
function Person({ title, name, detail, accent }: { title: string; name: string; detail: string; accent: string }) { return <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><div className="flex gap-3"><span className={`h-11 w-1 rounded-full ${accent}`}/><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</p><p className="truncate font-black">{name}</p><p className="truncate text-xs text-slate-500">{detail}</p></div></div></div>; }
function BundleItem({ color, badge, name, detail }: { color: string; badge: string; name: string; detail: string }) { return <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3"><span className={`h-10 w-1 rounded-full ${color}`}/><div className="min-w-0 flex-1"><p className="truncate font-bold text-slate-800">{name}</p><p className="truncate text-xs text-slate-500">{detail}</p></div><span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200">{badge}</span></div>; }
