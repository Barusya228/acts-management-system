'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import StatusPill from '@/components/ui/StatusPill';

interface Act {
  id: string;
  party1_name: string;
  party2_name: string;
  item_name: string;
  item_serial?: string;
  issue_date: string;
  status: string;
  template_code?: string | null;
  advisory_group?: string | null;
  student_count?: number | null;
}

interface Template {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  is_active: boolean;
}

export default function GuestActsGrid({ adminMode = false }: { adminMode?: boolean }) {
  const router = useRouter();
  const [acts, setActs] = useState<Act[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actType, setActType] = useState<'ALL' | 'GENERIC_ONE' | 'GENERIC_MULTI' | 'IPAD'>('ALL');

  useEffect(() => {
    fetchActs();
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const res = await api.get('/api/templates?is_active=true');
      setTemplates(Array.isArray(res.data) ? res.data : []);
    } catch {
      setTemplates([]);
    }
  };

  const activeTemplates = templates.filter((t) =>
    ['GENERIC_ONE', 'GENERIC_MULTI', 'IPAD'].includes(t.code)
  );

  const getTemplateIcon = (code: string) => {
    const map: Record<string, string> = {
      IPAD: '📱',
      GENERIC_ONE: '👤',
      GENERIC_MULTI: '👥',
    };
    return map[code] || '📄';
  };

  const getTemplateUrl = (code: string) => {
    if (adminMode) {
      if (code === 'IPAD') return '/acts/create/ipad';
      return `/admin/acts/create?code=${code}`;
    }
    const map: Record<string, string> = {
      GENERIC_ONE: '/acts/create/one',
      GENERIC_MULTI: '/acts/create/multi',
      IPAD: '/acts/create/ipad',
    };
    return map[code] || `/acts/create?code=${code}`;
  };

  const getActUrl = (act: Act) => {
    if (act.template_code === 'IPAD') return `/acts/ipad/${act.id}`;
    return adminMode ? `/admin/acts/${act.id}` : `/acts/${act.id}`;
  };

  const fetchActs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page_size: '100' });
      const res = await api.get(`/api/acts?${params.toString()}`);
      setActs(res.data.items || []);
    } catch {
      setActs([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

  const getStatusLabel = (s: string) => {
    const map: Record<string, string> = {
      DRAFT: 'Черновик',
      SIGNED_PARTY1: 'На подписи',
      SIGNED_PARTY2: 'На подписи',
      COMPLETED: 'Завершено',
      RETURNED: 'Возвращено',
      RETURN_INITIATED: 'Возврат',
    };
    return map[s] || s;
  };

  const isPending = (s: string) =>
    s === 'DRAFT' || s === 'SIGNED_PARTY1' || s === 'SIGNED_PARTY2';

  const pendingActs = acts.filter((a) => isPending(a.status));
  const doneActs = acts.filter((a) => !isPending(a.status));

  const matchesSearch = (a: Act) => {
    const s = search.toLowerCase();
    if (!s) return true;
    return (
      a.item_name.toLowerCase().includes(s) ||
      (a.party1_name || '').toLowerCase().includes(s) ||
      (a.party2_name || '').toLowerCase().includes(s)
    );
  };
  const matchesType = (act: Act) => actType === 'ALL' || act.template_code === actType;

  const filteredPending = pendingActs.filter(matchesSearch).filter(matchesType);
  const filteredDone = doneActs.filter(matchesSearch).filter(matchesType);
  const actTypeOptions = [
    { value: 'ALL' as const, label: 'Все акты', count: acts.length },
    { value: 'GENERIC_ONE' as const, label: 'Акт для одного получателя', count: acts.filter(act => act.template_code === 'GENERIC_ONE').length },
    { value: 'GENERIC_MULTI' as const, label: 'Акт для нескольких получателей', count: acts.filter(act => act.template_code === 'GENERIC_MULTI').length },
    { value: 'IPAD' as const, label: 'Акт iPad для advisory', count: acts.filter(act => act.template_code === 'IPAD').length },
  ];
  const getActTitle = (act: Act) => act.template_code === 'IPAD'
    ? `Advisory iPad: ${act.advisory_group || act.item_name.replace(/^Комплект iPad:\s*/i, '')}`
    : act.item_name;
  const getRecipientLine = (act: Act) => act.template_code === 'IPAD'
    ? `Учеников: ${act.student_count || 0}`
    : `Получатель: ${act.party2_name || '—'}`;

  const getItemEmoji = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('ipad') || n.includes('планшет')) return '📱';
    if (n.includes('mac') || n.includes('ноут') || n.includes('laptop')) return '💻';
    if (n.includes('монитор') || n.includes('экран') || n.includes('dell')) return '🖥️';
    if (n.includes('телефон') || n.includes('iphone') || n.includes('смартфон')) return '📱';
    if (n.includes('принтер')) return '🖨️';
    if (n.includes('клавиатура')) return '⌨️';
    if (n.includes('мышь') || n.includes('mouse')) return '🖱️';
    return '📦';
  };

  if (loading) {
    return (
      <div className="py-16 text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
        <p className="text-sm text-slate-500">Загрузка актов...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Template picker section */}
      {activeTemplates.length > 0 && (
        <section>
          <div className="mb-4 flex items-center gap-3">
            <span className="text-xl">⚡</span>
            <h2 className="text-lg font-bold text-slate-800">Создать акт</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {activeTemplates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => router.push(getTemplateUrl(t.code))}
                className="group rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-4 text-left shadow-sm transition hover:border-blue-400 hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-2xl shadow-sm ring-1 ring-blue-100">
                    {getTemplateIcon(t.code)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{t.name}</p>
                    {t.description && (
                      <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{t.description}</p>
                    )}
                    <span className="mt-2 inline-flex items-center gap-1 rounded-lg bg-blue-500 px-3 py-1 text-xs font-bold text-white opacity-0 transition group-hover:opacity-100">
                      + Создать
                    </span>
                  </div>
                </div>
              </button>
            ))}
            <div className="flex min-h-[120px] cursor-default flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-4 text-slate-300">
              <span className="text-2xl">🔜</span>
              <span className="text-sm font-medium">Скоро</span>
            </div>
          </div>
        </section>
      )}

      {/* Pending section */}
      <section>
        <div className="mb-4 flex items-center gap-3">
          <span className="text-xl">📝</span>
          <h2 className="text-lg font-bold text-slate-800">
            Нужно подписать — {pendingActs.length}
          </h2>
        </div>

        {pendingActs.length === 0 ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-6 text-center">
            <p className="text-3xl">✅</p>
            <p className="mt-2 font-semibold text-emerald-800">Всё подписано</p>
            <p className="mt-1 text-sm text-emerald-600">Нажмите на акт в списке ниже, чтобы посмотреть детали.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filteredPending.map((act) => (
              <button
                key={act.id}
                type="button"
                onClick={() => router.push(getActUrl(act))}
                className="group rounded-2xl border border-amber-200 bg-white p-4 text-left shadow-sm transition hover:border-amber-400 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-2xl">
                      {getItemEmoji(act.item_name)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{getActTitle(act)}</p>
                      <div className="mt-1 flex flex-col gap-0.5 text-xs">
                        <p className="text-slate-500">
                          Выдал: <span className="text-slate-700">{act.party1_name || '—'}</span>
                        </p>
                        <p className="text-slate-500">
                           <span className="text-slate-700">{getRecipientLine(act)}</span>
                        </p>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">{formatDate(act.issue_date)}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <StatusPill status={act.status} label={getStatusLabel(act.status)} />
                  <span className="flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white opacity-0 transition group-hover:opacity-100">
                    ✍ Подписать
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* All acts section */}
      <section>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">📋</span>
            <h2 className="text-lg font-bold text-slate-800">
              Все акты — {acts.length}
            </h2>
          </div>
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="Поиск по названию или имени..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          </div>
        </div>
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {actTypeOptions.map(option => (
            <button key={option.value} type="button" onClick={() => setActType(option.value)}
              className={`min-h-11 shrink-0 rounded-xl px-4 text-sm transition ${actType === option.value ? 'bg-blue-600 font-bold text-white shadow-sm' : 'border border-gray-200 bg-white font-medium text-slate-600'}`}>
              {option.label} · {option.count}
            </button>
          ))}
        </div>

        {filteredDone.length === 0 && filteredPending.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center">
            <p className="text-3xl">📭</p>
            <p className="mt-2 font-semibold text-slate-600">Документов не найдено</p>
            <p className="mt-1 text-sm text-slate-400">Попробуйте изменить поисковый запрос.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filteredDone.map((act) => (
              <button
                key={act.id}
                type="button"
                onClick={() => router.push(getActUrl(act))}
                className="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-2xl">
                      {getItemEmoji(act.item_name)}
                    </span>
                    <div className="flex-1 min-w-0">
                       <p className="font-semibold text-slate-800 truncate">{getActTitle(act)}</p>
                      <div className="mt-1 flex flex-col gap-0.5 text-xs">
                        <p className="text-slate-500">
                          Выдал: <span className="text-slate-700">{act.party1_name || '—'}</span>
                        </p>
                        <p className="text-slate-500">
                           <span className="text-slate-700">{getRecipientLine(act)}</span>
                        </p>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">{formatDate(act.issue_date)}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <StatusPill status={act.status} label={getStatusLabel(act.status)} />
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
