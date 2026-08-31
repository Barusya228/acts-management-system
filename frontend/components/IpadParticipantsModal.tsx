'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { apiErrorMessage } from '@/lib/apiError';
import { useToast } from '@/contexts/ToastContext';

interface Participant {
  id: string;
  full_name: string;
  email: string | null;
  kind: string;
}

interface Props {
  actId: string;
  issuerParticipantId: string;
  responsibleParticipantIds: string[];
  onUpdated: () => Promise<void>;
  onClose: () => void;
}

export default function IpadParticipantsModal({ actId, issuerParticipantId, responsibleParticipantIds, onUpdated, onClose }: Props) {
  const { showToast } = useToast();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [issuerId, setIssuerId] = useState(issuerParticipantId);
  const [responsibleIds, setResponsibleIds] = useState(responsibleParticipantIds);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/participants?is_active=true')
      .then(response => setParticipants(Array.isArray(response.data) ? response.data : []))
      .catch(() => showToast('Не удалось загрузить участников', 'error'))
      .finally(() => setLoading(false));
  }, [showToast]);

  const managers = participants.filter(item => item.kind === 'IT_MANAGER' || item.kind === 'BOTH');
  const responsibles = participants.filter(item => item.kind === 'EMPLOYEE' || item.kind === 'BOTH');
  const selectedResponsibles = responsibleIds
    .map(id => responsibles.find(item => item.id === id))
    .filter((item): item is Participant => Boolean(item));
  const normalizedSearch = search.trim().toLowerCase();
  const suggestions = normalizedSearch
    ? responsibles.filter(item => !responsibleIds.includes(item.id) && item.full_name.toLowerCase().includes(normalizedSearch)).slice(0, 8)
    : [];
  const hasChanges = issuerId !== issuerParticipantId
    || responsibleIds.length !== responsibleParticipantIds.length
    || responsibleIds.some((id, index) => id !== responsibleParticipantIds[index]);

  const save = async () => {
    if (!issuerId || responsibleIds.length === 0) {
      showToast('Выберите выдающего и хотя бы одного ответственного', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/api/ipad-acts/${actId}/participants`, {
        issuer_participant_id: issuerId,
        responsible_participant_ids: responsibleIds,
      });
      await onUpdated();
      showToast('Участники обновлены. Подписи нужно собрать заново', 'success');
      onClose();
    } catch (error: unknown) {
      showToast(apiErrorMessage(error, 'Не удалось обновить участников'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-5">
      <div className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">Участники акта</p><h2 className="mt-1 text-xl font-black">Заменить ответственных или выдающего</h2></div>
          <button type="button" disabled={saving} onClick={onClose} className="min-h-11 shrink-0 rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-600">Закрыть</button>
        </div>
        <p className="mt-4 rounded-2xl bg-amber-50 p-3 text-sm leading-5 text-amber-900">После изменения акт вернётся к началу подписания. Подписи под прежним составом участников будут сброшены.</p>

        <div className="mt-5 space-y-5">
          <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Выдающий IT</span><select disabled={loading || saving} value={issuerId} onChange={event => setIssuerId(event.target.value)} className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3"><option value="">Выберите сотрудника IT</option>{managers.map(item => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label>

          <div>
            <div className="flex items-center justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Ответственные</p><p className="text-xs text-slate-400">Подписывают по порядку сверху вниз</p></div><span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">{responsibleIds.length}</span></div>
            <div className="mt-3 space-y-2">
              {selectedResponsibles.map(item => <div key={item.id} className="flex min-h-14 items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 ring-1 ring-slate-200"><div className="min-w-0"><p className="break-words text-sm font-bold text-slate-800">{item.full_name}</p><p className="break-all text-xs text-slate-500">{item.email || 'Нет email'}</p></div><button type="button" disabled={saving} onClick={() => setResponsibleIds(ids => ids.filter(id => id !== item.id))} className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-bold text-red-600 hover:bg-red-50">Удалить</button></div>)}
              {!loading && selectedResponsibles.length === 0 && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">Добавьте хотя бы одного ответственного.</p>}
            </div>
            <div className="relative mt-3">
              <input disabled={loading || saving} value={search} onChange={event => setSearch(event.target.value)} placeholder="Найти ответственного по ФИО..." className="min-h-12 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-400" />
              {suggestions.length > 0 && <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">{suggestions.map(item => <button key={item.id} type="button" disabled={!item.email} onClick={() => { setResponsibleIds(ids => [...ids, item.id]); setSearch(''); }} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-3 text-left hover:bg-blue-50 disabled:opacity-40"><span className="min-w-0"><span className="block break-words text-sm font-bold text-slate-800">{item.full_name}</span><span className="block break-all text-xs text-slate-500">{item.email || 'Нет email'}</span></span><span className="shrink-0 text-xs font-bold text-blue-600">Добавить</span></button>)}</div>}
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-[120px_1fr] gap-3"><button type="button" disabled={saving} onClick={onClose} className="min-h-12 rounded-xl bg-slate-100 font-bold text-slate-600">Отмена</button><button type="button" disabled={loading || saving || !hasChanges || !issuerId || responsibleIds.length === 0} onClick={save} className="min-h-12 rounded-xl bg-blue-600 font-black text-white disabled:opacity-40">{saving ? 'Сохранение...' : hasChanges ? 'Сохранить и начать подписи заново' : 'Нет изменений'}</button></div>
      </div>
    </div>
  );
}
