'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeActRecipients } from '@/lib/actRecipients';

interface Act {
  id: string; party1_name: string; party2_name: string; receiver_email: string; issue_date: string;
  item_name: string; item_serial?: string; status: string; created_at: string;
  extra_data_json?: Record<string, unknown>;
}

const statusCopy: Record<string, { label: string; detail: string; tone: string }> = {
  DRAFT: { label: 'Ожидает подписи получателя', detail: 'Получатель подтверждает получение всего комплекта.', tone: 'bg-amber-100 text-amber-800' },
  SIGNED_PARTY2: { label: 'Ожидает подтверждения IT', detail: 'Все получатели подписали акт. Осталось подтверждение выдающего.', tone: 'bg-blue-100 text-blue-800' },
  COMPLETED: { label: 'Комплект выдан', detail: 'Акт подписан всеми сторонами.', tone: 'bg-emerald-100 text-emerald-800' },
  RETURN_INITIATED: { label: 'Возврат начат', detail: 'Ожидается подтверждение возврата.', tone: 'bg-violet-100 text-violet-800' },
  RETURN_SIGNED_PARTY1: { label: 'Возврат подтверждён IT', detail: 'Получатель должен подтвердить возврат комплекта.', tone: 'bg-violet-100 text-violet-800' },
  RETURNED: { label: 'Комплект возвращён', detail: 'Возврат завершён.', tone: 'bg-slate-200 text-slate-700' },
};

export default function ActPreviewV2({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading, loginAsGuest } = useAuth();
  const [act, setAct] = useState<Act | null>(null);
  const [error, setError] = useState('');
  const [signatureMode, setSignatureMode] = useState<'draw' | 'upload'>('draw');

  useEffect(() => { if (!loading && !user) loginAsGuest(); }, [loading, user, loginAsGuest]);
  useEffect(() => {
    if (!user) return;
    api.get(`/api/acts/${id}`).then(response => setAct(response.data)).catch(() => setError('Не удалось загрузить акт'));
  }, [user, id]);

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

  return <div className="min-h-screen bg-[#eef2f6] text-slate-900">
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur"><div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4"><div className="flex items-center gap-3"><Link href={`/acts/${act.id}`} className="flex h-11 items-center rounded-xl px-3 text-sm font-semibold text-slate-500 hover:bg-slate-100">← Назад</Link><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600">Тестовый интерфейс</p><h1 className="text-base font-black sm:text-lg">Акт выдачи техники · ACT-{act.id.split('-')[0].toUpperCase()}</h1></div></div><a href={`/api/acts/${act.id}/download/pdf`} className="flex min-h-11 items-center rounded-xl bg-slate-900 px-4 text-sm font-bold text-white">Скачать PDF</a></div></header>
    <main className="mx-auto grid max-w-7xl gap-4 p-3 sm:p-4 lg:grid-cols-[46%_54%] lg:gap-5 lg:p-5">
      <section className="space-y-4 lg:max-h-[calc(100vh-104px)] lg:overflow-y-auto lg:pr-1">
        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><div className="flex flex-wrap items-start justify-between gap-3"><div><span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${status.tone}`}>{status.label}</span><p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">{status.detail}</p></div><div className="text-right"><p className="text-xs text-slate-400">Дата выдачи</p><p className="font-black">{new Date(act.issue_date).toLocaleDateString('ru-RU')}</p></div></div><div className="mt-5 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2"><Progress active label={`Получатели ${signedCount}/${recipients.length}`} /><span className="h-px w-full bg-slate-200"/><Progress active={act.status !== 'DRAFT'} label="Подтверждение IT"/><span className="h-px w-full bg-slate-200"/><Progress active={act.status === 'COMPLETED' || isReturn} label="Завершено"/></div></div>
        <div className="grid gap-3 sm:grid-cols-2"><Person title="Получатель" name={recipients.map(item => item.full_name).join(', ')} detail={recipients.map(item => item.email).filter(Boolean).join(', ')} accent="bg-blue-600"/><Person title="Выдающий" name={act.party1_name} detail="Сотрудник IT" accent="bg-slate-900"/></div>
        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Комплект техники</p><h2 className="mt-1 text-xl font-black">{1 + extraDevices.length + accessories.length} позиций</h2></div><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">Возврат комплектом</span></div><div className="space-y-2"><BundleItem color="bg-blue-600" badge="Основное" name={act.item_name} detail={`Инв: ${act.item_serial || '—'}`} />{extraDevices.map((item,index) => <BundleItem key={index} color="bg-violet-500" badge="Дополнительное" name={String(item.name || 'Устройство')} detail={`Инв: ${String(item.serial || '—')}`} />)}{accessories.map((item,index) => <BundleItem key={index} color="bg-emerald-500" badge="Мелкая техника" name={String(item.name || 'Позиция')} detail={`${String(item.model || 'Без модели')} · ${Number(item.quantity || 1)} шт.${item.note ? ` · ${String(item.note)}` : ''}`} />)}</div></div>
        <details className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><summary className="cursor-pointer text-sm font-bold text-slate-600">Дополнительно: PDF, история и технические сведения</summary><div className="mt-3 grid gap-2 sm:grid-cols-3"><a href={`/api/acts/${act.id}/preview/pdf`} target="_blank" className="rounded-xl bg-slate-100 p-3 text-center text-sm font-semibold">Предпросмотр PDF</a><span className="rounded-xl bg-slate-100 p-3 text-center text-sm">Создан {new Date(act.created_at).toLocaleString('ru-RU')}</span><span className="rounded-xl bg-slate-100 p-3 text-center font-mono text-xs">{act.id}</span></div></details>
      </section>
      <section className="flex min-h-[52vh] flex-col rounded-3xl bg-white shadow-xl ring-1 ring-slate-200 lg:sticky lg:top-[84px] lg:h-[calc(100vh-104px)]"><div className="border-b border-slate-100 p-5"><p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">Текущее действие</p><h2 className="mt-2 text-2xl font-black">{actionTitle}</h2><p className="mt-2 text-sm leading-6 text-slate-500">Подтвердите получение указанного комплекта. После этой подписи процесс автоматически перейдёт к следующему участнику.</p></div><div className="flex flex-1 flex-col p-5"><div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1"><button onClick={() => setSignatureMode('draw')} className={`min-h-11 rounded-lg text-sm font-bold ${signatureMode === 'draw' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>Рисовать подпись</button><button onClick={() => setSignatureMode('upload')} className={`min-h-11 rounded-lg text-sm font-bold ${signatureMode === 'upload' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>Загрузить файл</button></div>{signatureMode === 'draw' ? <div className="mt-4 flex flex-1 items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 text-center"><div><p className="text-lg font-bold text-slate-400">Поставьте подпись здесь</p><p className="mt-1 text-sm text-slate-400">Прототип: подпись не сохраняется</p></div></div> : <div className="mt-4 flex flex-1 items-center justify-center rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50 text-center"><div><p className="font-bold text-blue-700">Выберите изображение подписи</p><p className="text-sm text-blue-500">PNG или JPEG</p></div></div>}</div><div className="grid grid-cols-[120px_1fr] gap-3 border-t border-slate-100 p-5"><button disabled className="min-h-12 rounded-xl bg-slate-100 font-bold text-slate-400">Очистить</button><button disabled className="min-h-12 rounded-xl bg-blue-600 font-black text-white opacity-60">Подписать акт · тестовый режим</button></div></section>
    </main>
  </div>;
}

function Progress({ active, label }: { active: boolean; label: string }) { return <div className="text-center"><span className={`mx-auto block h-3 w-3 rounded-full ${active ? 'bg-blue-600 ring-4 ring-blue-100' : 'bg-slate-200'}`}/><span className="mt-2 block text-[10px] font-bold text-slate-500">{label}</span></div>; }
function Person({ title, name, detail, accent }: { title: string; name: string; detail: string; accent: string }) { return <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><div className="flex gap-3"><span className={`h-11 w-1 rounded-full ${accent}`}/><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</p><p className="truncate font-black">{name}</p><p className="truncate text-xs text-slate-500">{detail}</p></div></div></div>; }
function BundleItem({ color, badge, name, detail }: { color: string; badge: string; name: string; detail: string }) { return <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3"><span className={`h-10 w-1 rounded-full ${color}`}/><div className="min-w-0 flex-1"><p className="truncate font-bold text-slate-800">{name}</p><p className="truncate text-xs text-slate-500">{detail}</p></div><span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200">{badge}</span></div>; }
