'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import PageHeader from '@/components/ui/PageHeader';
import SurfaceCard from '@/components/ui/SurfaceCard';
import SectionTitle from '@/components/ui/SectionTitle';
import StatusPill from '@/components/ui/StatusPill';
import { getParticipantEmoji } from '@/lib/participants';

interface Act {
  id: string;
  party1_name: string;
  party2_name: string;
  item_name: string;
  issue_date: string;
  status: string;
}

interface ParticipantOption {
  id: string;
  full_name: string;
  email?: string | null;
  department?: string | null;
  title?: string | null;
  sticker_emoji?: string | null;
  kind: 'IT_MANAGER' | 'EMPLOYEE';
}

export default function ActsListPage() {
  const { user } = useAuth();
  const [acts, setActs] = useState<Act[]>([]);
  const [participants, setParticipants] = useState<ParticipantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processFilter, setProcessFilter] = useState<'ALL' | 'ISSUE' | 'RETURN' | 'DRAFT' | 'SIGNING' | 'COMPLETED'>('ALL');
  const [filters, setFilters] = useState({
    party1: '',
    party2: '',
    item_name: '',
    email: '',
    page: 1,
    page_size: 20,
  });
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetchActs();
    fetchParticipants();
  }, [filters]);

  const fetchParticipants = async () => {
    try {
      const res = await api.get('/api/participants?is_active=true');
      setParticipants(Array.isArray(res.data) ? res.data : []);
    } catch {
      // Participant stickers are a UI enhancement. If the directory fails, keep the acts list usable.
    }
  };

  const fetchActs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        if (v) params.append(k, String(v));
      });
      const res = await api.get(`/api/acts?${params.toString()}`);
      setActs(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      setError('Ошибка загрузки актов');
    } finally {
      setLoading(false);
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      DRAFT: 'Черновик',
      SIGNED_PARTY1: 'Подтверждено передающей стороной',
      SIGNED_PARTY2: 'Подтверждено получателем',
      COMPLETED: 'Передача завершена',
      RETURN_INITIATED: 'Возврат инициирован',
      RETURN_SIGNED_PARTY1: 'Возврат подтвержден стороной 1',
      RETURN_SIGNED_PARTY2: 'Возврат подтвержден стороной 2',
      RETURNED: 'Возврат завершен',
    };
    return labels[status] || status;
  };

  const getStatusBadgeClass = (status: string) => {
    const classes: Record<string, string> = {
      DRAFT: 'bg-slate-100 text-slate-700 border-slate-200',
      SIGNED_PARTY1: 'bg-amber-100 text-amber-700 border-amber-200',
      SIGNED_PARTY2: 'bg-blue-100 text-blue-700 border-blue-200',
      COMPLETED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      RETURN_INITIATED: 'bg-orange-100 text-orange-700 border-orange-200',
      RETURN_SIGNED_PARTY1: 'bg-orange-100 text-orange-700 border-orange-200',
      RETURN_SIGNED_PARTY2: 'bg-orange-100 text-orange-700 border-orange-200',
      RETURNED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    };
    return classes[status] || 'bg-slate-100 text-slate-700 border-slate-200';
  };

  const getProcessType = (status: string) => {
    if (
      status === 'RETURN_INITIATED' ||
      status === 'RETURN_SIGNED_PARTY1' ||
      status === 'RETURN_SIGNED_PARTY2' ||
      status === 'RETURNED'
    ) {
      return 'RETURN';
    }
    return 'ISSUE';
  };

  const getProcessLabel = (status: string) => {
    return getProcessType(status) === 'RETURN' ? 'Возврат техники' : 'Передача техники';
  };

  const getProcessBadgeClass = (status: string) => {
    return getProcessType(status) === 'RETURN'
      ? 'bg-orange-100 text-orange-700 border-orange-200'
      : 'bg-sky-100 text-sky-700 border-sky-200';
  };

  const visibleActs = acts.filter((act) => {
    if (processFilter === 'ALL') return true;
    if (processFilter === 'DRAFT') return act.status === 'DRAFT';
    if (processFilter === 'SIGNING') return act.status === 'SIGNED_PARTY1' || act.status === 'SIGNED_PARTY2';
    if (processFilter === 'COMPLETED') return act.status === 'COMPLETED' || act.status === 'RETURNED';
    if (processFilter === 'ISSUE') return getProcessType(act.status) === 'ISSUE';
    if (processFilter === 'RETURN') return getProcessType(act.status) === 'RETURN';
    return true;
  });

  const draftsCount = acts.filter((act) => act.status === 'DRAFT').length;
  const signingCount = acts.filter((act) => act.status === 'SIGNED_PARTY1' || act.status === 'SIGNED_PARTY2').length;
  const completedCount = acts.filter((act) => act.status === 'COMPLETED' || act.status === 'RETURNED').length;
  const issueCount = acts.filter((act) => getProcessType(act.status) === 'ISSUE').length;
  const returnCount = acts.filter((act) => getProcessType(act.status) === 'RETURN').length;

  const statusTabs = [
    { key: 'DRAFT' as const, label: 'Черновики', count: draftsCount, subtitle: 'Не подписаны' },
    { key: 'SIGNING' as const, label: 'На подписи', count: signingCount, subtitle: 'Ожидают подписей' },
    { key: 'COMPLETED' as const, label: 'Завершено', count: completedCount, subtitle: 'Полностью подписаны' },
  ];

  const processTabs = [
    { key: 'ISSUE' as const, label: 'Передача техники', count: issueCount, subtitle: 'Выдача оборудования' },
    { key: 'RETURN' as const, label: 'Возврат техники', count: returnCount, subtitle: 'Возврат оборудования' },
  ];

  const summaryItems = [
    {
      label: 'Всего актов',
      value: total,
      tone: 'bg-slate-900 text-white',
    },
    {
      label: 'Черновики',
      value: acts.filter((act) => act.status === 'DRAFT').length,
      tone: 'bg-slate-100 text-slate-800',
    },
    {
      label: 'На подписи',
      value: acts.filter((act) => act.status === 'SIGNED_PARTY1' || act.status === 'SIGNED_PARTY2').length,
      tone: 'bg-blue-50 text-blue-800',
    },
    {
      label: 'Возвраты',
      value: acts.filter((act) => getProcessType(act.status) === 'RETURN').length,
      tone: 'bg-orange-50 text-orange-800',
    },
    {
      label: 'Завершено',
      value: acts.filter((act) => act.status === 'COMPLETED' || act.status === 'RETURNED').length,
      tone: 'bg-emerald-50 text-emerald-800',
    },
  ];

  const findParticipantByName = (fullName: string, kind: 'IT_MANAGER' | 'EMPLOYEE') => {
    return participants.find((participant) => participant.kind === kind && participant.full_name === fullName) || null;
  };

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        eyebrow="Acts Digitalization"
        title="Список актов"
        description="Отслеживайте состояние документов, фильтруйте выдачу и возврат техники" 
        actions={
          <>
            <div className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 backdrop-blur-sm">
              <p className="text-xs text-slate-300">{user?.full_name || user?.email}</p>
            </div>
            <Link
              href="/acts/create"
              className="rounded-lg bg-white px-4 py-2 font-medium text-slate-900 transition hover:bg-slate-100"
            >
              Создать акт
            </Link>
          </>
        }
      />

      <div className="mb-6 space-y-3">
        <div className="grid grid-cols-3 gap-3">
          {statusTabs.map((tab) => {
            const active = processFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setProcessFilter(tab.key)}
                className={`rounded-xl border px-4 py-3 text-left transition ${
                  active
                    ? 'border-slate-900 bg-slate-900 text-white shadow-lg'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="font-semibold text-sm">{tab.label}</div>
                <div className="text-xl font-bold mt-1">{tab.count}</div>
                <div className={`text-xs mt-1 ${active ? 'text-slate-300' : 'text-gray-500'}`}>{tab.subtitle}</div>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {processTabs.map((tab) => {
            const active = processFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setProcessFilter(tab.key)}
                className={`rounded-xl border px-4 py-3 text-left transition ${
                  active
                    ? 'border-slate-900 bg-slate-900 text-white shadow-lg'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="font-semibold text-sm">{tab.label}</div>
                <div className="text-xl font-bold mt-1">{tab.count}</div>
                <div className={`text-xs mt-1 ${active ? 'text-slate-300' : 'text-gray-500'}`}>{tab.subtitle}</div>
              </button>
            );
          })}
        </div>
      </div>

      <SurfaceCard className="mb-6 p-4 md:p-5">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SectionTitle title="Фильтры и поиск" description="Сузьте список по сторонам, технике или email получателя." />
          <button
            type="button"
            onClick={() =>
              setFilters({
                party1: '',
                party2: '',
                item_name: '',
                email: '',
                page: 1,
                page_size: 20,
              })
            }
            className="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-200"
          >
            Сбросить фильтры
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input
            type="text"
            placeholder="Сторона 1"
            className="rounded-xl border border-gray-200 px-3 py-2.5 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            value={filters.party1}
            onChange={(e) => setFilters({ ...filters, party1: e.target.value, page: 1 })}
          />
          <input
            type="text"
            placeholder="Сторона 2"
            className="rounded-xl border border-gray-200 px-3 py-2.5 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            value={filters.party2}
            onChange={(e) => setFilters({ ...filters, party2: e.target.value, page: 1 })}
          />
          <input
            type="text"
            placeholder="Техника"
            className="rounded-xl border border-gray-200 px-3 py-2.5 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            value={filters.item_name}
            onChange={(e) => setFilters({ ...filters, item_name: e.target.value, page: 1 })}
          />
          <input
            type="email"
            placeholder="Email"
            className="rounded-xl border border-gray-200 px-3 py-2.5 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            value={filters.email}
            onChange={(e) => setFilters({ ...filters, email: e.target.value, page: 1 })}
          />
        </div>
      </SurfaceCard>

      {loading ? (
        <div className="rounded-2xl bg-white py-16 text-center shadow-sm ring-1 ring-gray-100">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
          <p className="text-gray-600">Загрузка актов...</p>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>
      ) : visibleActs.length === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center shadow-sm ring-1 ring-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Документы не найдены</h3>
          <p className="mt-2 text-sm text-gray-500">
            Попробуйте изменить фильтры, переключить тип процесса или создайте новый документ.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 grid gap-4 xl:hidden">
            {visibleActs.map((act) => (
              <SurfaceCard key={act.id} className="p-4">
                {(() => {
                  const party1Participant = findParticipantByName(act.party1_name, 'IT_MANAGER');
                  const party2Participant = findParticipantByName(act.party2_name, 'EMPLOYEE');
                  return (
                    <>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-400">ID</p>
                    <p className="font-mono text-sm text-gray-700">{act.id.slice(0, 8)}...</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${getProcessBadgeClass(act.status)}`}>
                      {getProcessLabel(act.status)}
                    </span>
                    <StatusPill status={act.status} label={getStatusLabel(act.status)} />
                  </div>
                </div>

                <div className="mb-3 grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                    <p className="text-xs text-gray-400 mb-1.5">Сторона 1</p>
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-sm shadow-sm ring-1 ring-gray-200">
                        {getParticipantEmoji('IT_MANAGER', party1Participant?.sticker_emoji)}
                      </div>
                      <p className="text-sm font-medium text-gray-900 leading-tight">{act.party1_name}</p>
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                    <p className="text-xs text-gray-400 mb-1.5">Сторона 2</p>
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-sm shadow-sm ring-1 ring-gray-200">
                        {getParticipantEmoji('EMPLOYEE', party2Participant?.sticker_emoji)}
                      </div>
                      <p className="text-sm font-medium text-gray-900 leading-tight">{act.party2_name}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <div>
                    <p className="text-xs text-gray-400">Техника</p>
                    <p className="text-gray-900">{act.item_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Дата</p>
                    <p className="text-gray-900">{new Date(act.issue_date).toLocaleDateString('ru-RU')}</p>
                  </div>
                </div>

                <div className="flex gap-3 text-sm font-medium">
                  <Link href={`/acts/${act.id}`} className="text-blue-600 hover:underline">
                    Просмотр
                  </Link>
                  <Link href={`/acts/${act.id}/edit`} className="text-green-600 hover:underline">
                    Редактировать
                  </Link>
                </div>
                    </>
                  );
                })()}
              </SurfaceCard>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 xl:block">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Сторона 1</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Сторона 2</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Техника</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Дата</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Статус</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Действия</th>
              </tr>
            </thead>
              <tbody className="divide-y divide-gray-200">
                {visibleActs.map((act) => (
                  <tr key={act.id} className="transition hover:bg-slate-50">
                    {(() => {
                      const party1Participant = findParticipantByName(act.party1_name, 'IT_MANAGER');
                      const party2Participant = findParticipantByName(act.party2_name, 'EMPLOYEE');
                      return (
                        <>
                    <td className="px-6 py-4 whitespace-nowrap font-mono text-sm text-gray-700">
                      {act.id.slice(0, 8)}...
                    </td>
                    <td className="px-6 py-4 text-gray-800">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-50 text-base ring-1 ring-gray-200">
                          {getParticipantEmoji('IT_MANAGER', party1Participant?.sticker_emoji)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{act.party1_name}</p>
                          <p className="text-xs text-gray-500">IT</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-800">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-50 text-base ring-1 ring-gray-200">
                          {getParticipantEmoji('EMPLOYEE', party2Participant?.sticker_emoji)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{act.party2_name}</p>
                          <p className="text-xs text-gray-500">Получатель</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-800">{act.item_name}</td>
                    <td className="px-6 py-4 text-gray-600">
                      {new Date(act.issue_date).toLocaleDateString('ru-RU')}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col items-start gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getProcessBadgeClass(act.status)}`}>
                          {getProcessLabel(act.status)}
                        </span>
                        <StatusPill status={act.status} label={getStatusLabel(act.status)} />
                      </div>
                    </td>
                    <td className="px-6 py-4 space-x-3 text-sm font-medium">
                      <Link href={`/acts/${act.id}`} className="text-blue-600 hover:underline">
                        Просмотр
                      </Link>
                      <Link href={`/acts/${act.id}/edit`} className="text-green-600 hover:underline">
                        Редактировать
                      </Link>
                    </td>
                        </>
                      );
                    })()}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
