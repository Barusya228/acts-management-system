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
  const [selectingId, setSelectingId] = useState('');
  const responsibleById = new Map(responsibles.map(item => [item.participant_id, item]));
  const normalizedOrder = [
    ...signingOrder.filter((id, index) => responsibleById.has(id) && signingOrder.indexOf(id) === index),
    ...responsibles.map(item => item.participant_id).filter(id => !signingOrder.includes(id)),
  ];
  const signed = normalizedOrder
    .map(id => responsibleById.get(id))
    .filter((item): item is Responsible => Boolean(item?.signed_at));
  const pendingIds = normalizedOrder.filter(id => responsibleById.has(id) && !responsibleById.get(id)?.signed_at);

  const chooseNext = async (participantId: string) => {
    if (participantId === pendingIds[0]) {
      onClose();
      return;
    }
    setSelectingId(participantId);
    try {
      await api.patch(`/api/ipad-acts/${actId}/signing-order`, {
        pending_participant_ids: [participantId, ...pendingIds.filter(id => id !== participantId)],
      });
      await onUpdated();
      showToast('Следующий подписант выбран', 'success');
      onClose();
    } catch (error: unknown) {
      showToast(apiErrorMessage(error, 'Не удалось выбрать подписанта'), 'error');
    } finally {
      setSelectingId('');
    }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-5">
    <div className="flex max-h-[94vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
        <div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">Ответственные люди</p><h2 className="mt-1 text-xl font-black">Выберите, кто подписывает следующим</h2></div>
        <button type="button" disabled={Boolean(selectingId)} onClick={onClose} className="min-h-11 shrink-0 rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-600 disabled:opacity-50">Закрыть</button>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        <p className="rounded-2xl bg-blue-50 p-3 text-sm leading-5 text-blue-800">Выбранный учитель займёт первую свободную позицию после тех, кто уже подписал. Порядок сторон в PDF и сохранённые подписи не изменятся.</p>
        {signed.length > 0 && <div className="mt-5"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Уже подписали</p><div className="mt-2 space-y-2">{signed.map((item, index) => <div key={item.participant_id} className="flex items-center gap-3 rounded-xl bg-emerald-50 px-3 py-2"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-black text-emerald-700">{index + 1}</span><span className="min-w-0 flex-1 break-words text-sm font-bold text-emerald-900">{item.full_name}</span><span className="font-black text-emerald-600">✓</span></div>)}</div></div>}
        <div className="mt-5"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Ожидают подписи</p><div className="mt-2 space-y-2">{pendingIds.map((id, index) => {
          const item = responsibleById.get(id);
          if (!item) return null;
          const isCurrent = index === 0;
          return <div key={id} className={`flex items-center gap-3 rounded-2xl p-3 ring-1 ${isCurrent ? 'bg-blue-50 ring-blue-300' : 'bg-slate-50 ring-slate-200'}`}>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black ${isCurrent ? 'bg-blue-600 text-white' : 'bg-white text-slate-500'}`}>{signed.length + index + 1}</span>
            <div className="min-w-0 flex-1"><p className="break-words text-sm font-black text-slate-900">{item.full_name}</p><p className="break-all text-xs text-slate-500">{item.email}</p></div>
            <button type="button" disabled={Boolean(selectingId) || isCurrent} onClick={() => chooseNext(id)} className={`min-h-11 shrink-0 rounded-xl px-4 text-sm font-black ${isCurrent ? 'bg-blue-100 text-blue-700' : 'bg-violet-600 text-white hover:bg-violet-700'} disabled:opacity-60`}>{selectingId === id ? 'Выбор...' : isCurrent ? 'Сейчас' : 'Выбрать'}</button>
          </div>;
        })}</div></div>
      </div>
    </div>
  </div>;
}
