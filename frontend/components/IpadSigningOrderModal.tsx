'use client';

import { useState } from 'react';
import api from '@/lib/api';
import { apiErrorMessage } from '@/lib/apiError';
import { useToast } from '@/contexts/ToastContext';

interface Responsible {
  participant_id: string;
  full_name: string;
  email: string;
  signed_at: string | null;
}

interface Props {
  actId: string;
  responsibles: Responsible[];
  signingOrder: string[];
  onUpdated: () => Promise<void>;
  onClose: () => void;
}

export default function IpadSigningOrderModal({ actId, responsibles, signingOrder, onUpdated, onClose }: Props) {
  const { showToast } = useToast();
  const responsibleById = new Map(responsibles.map(item => [item.participant_id, item]));
  const normalizedOrder = [
    ...signingOrder.filter((id, index) => responsibleById.has(id) && signingOrder.indexOf(id) === index),
    ...responsibles.map(item => item.participant_id).filter(id => !signingOrder.includes(id)),
  ];
  const signed = normalizedOrder.map(id => responsibleById.get(id)).filter((item): item is Responsible => Boolean(item?.signed_at));
  const initialPendingIds = normalizedOrder.filter(id => responsibleById.has(id) && !responsibleById.get(id)?.signed_at);
  const [pendingIds, setPendingIds] = useState(initialPendingIds);
  const [saving, setSaving] = useState(false);
  const hasChanges = pendingIds.some((id, index) => id !== initialPendingIds[index]);

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= pendingIds.length) return;
    setPendingIds(current => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/api/ipad-acts/${actId}/signing-order`, {
        pending_participant_ids: pendingIds,
      });
      await onUpdated();
      showToast('Очередь подписания обновлена', 'success');
      onClose();
    } catch (error: unknown) {
      showToast(apiErrorMessage(error, 'Не удалось изменить очередь'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-5">
    <div className="flex max-h-[94vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">Очередь подписания</p><h2 className="mt-1 text-xl font-black">Кто подписывает следующим</h2></div><button type="button" disabled={saving} onClick={onClose} className="min-h-11 shrink-0 rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-600">Закрыть</button></div>
      <div className="flex-1 overflow-y-auto p-5">
        <p className="rounded-2xl bg-blue-50 p-3 text-sm leading-5 text-blue-800">Меняется только очередь на экране подписания. Порядок сторон в PDF, текущая версия акта и уже поставленные подписи не изменяются.</p>
        {signed.length > 0 && <div className="mt-5"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Уже подписали</p><div className="mt-2 space-y-2">{signed.map(item => <div key={item.participant_id} className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 text-sm"><span className="font-bold text-emerald-900">{item.full_name}</span><span className="font-black text-emerald-600">✓</span></div>)}</div></div>}
        <div className="mt-5"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Ожидают подписи</p><div className="mt-2 space-y-2">{pendingIds.map((id, index) => {
          const item = responsibleById.get(id);
          if (!item) return null;
          return <div key={id} className={`flex items-center gap-3 rounded-2xl p-3 ring-1 ${index === 0 ? 'bg-blue-50 ring-blue-300' : 'bg-slate-50 ring-slate-200'}`}><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black ${index === 0 ? 'bg-blue-600 text-white' : 'bg-white text-slate-500'}`}>{index + 1}</span><div className="min-w-0 flex-1"><p className="break-words text-sm font-black text-slate-900">{item.full_name}</p><p className="break-all text-xs text-slate-500">{index === 0 ? 'Подписывает следующим' : item.email}</p></div><div className="grid grid-cols-2 gap-1"><button type="button" disabled={saving || index === 0} onClick={() => move(index, -1)} aria-label={`Поднять ${item.full_name}`} className="flex h-10 w-10 items-center justify-center rounded-lg bg-white font-black text-blue-700 ring-1 ring-slate-200 disabled:opacity-25">↑</button><button type="button" disabled={saving || index === pendingIds.length - 1} onClick={() => move(index, 1)} aria-label={`Опустить ${item.full_name}`} className="flex h-10 w-10 items-center justify-center rounded-lg bg-white font-black text-blue-700 ring-1 ring-slate-200 disabled:opacity-25">↓</button></div></div>;
        })}</div></div>
      </div>
      <div className="grid grid-cols-[120px_1fr] gap-3 border-t border-slate-100 p-5"><button type="button" disabled={saving} onClick={onClose} className="min-h-12 rounded-xl bg-slate-100 font-bold text-slate-600">Отмена</button><button type="button" disabled={saving || !hasChanges} onClick={save} className="min-h-12 rounded-xl bg-blue-600 font-black text-white disabled:opacity-35">{saving ? 'Сохранение...' : hasChanges ? 'Сохранить очередь' : 'Порядок не изменён'}</button></div>
    </div>
  </div>;
}
