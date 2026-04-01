'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import api from '@/lib/api';

interface Act {
  id: string;
  party1_name: string;
  party2_name: string;
  item_name: string;
  issue_date: string;
  status: string;
}

export default function ActsListPage() {
  const [acts, setActs] = useState<Act[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
  }, [filters]);

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
      SIGNED_PARTY1: 'Подписано стороной 1',
      SIGNED_PARTY2: 'Подписано стороной 2',
      COMPLETED: 'Завершено',
    };
    return labels[status] || status;
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Список актов</h1>
        <Link href="/acts/create" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
          Создать акт
        </Link>
      </div>

      <div className="bg-white p-4 rounded shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">Фильтры</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input
            type="text"
            placeholder="Сторона 1"
            className="border p-2 rounded"
            value={filters.party1}
            onChange={(e) => setFilters({ ...filters, party1: e.target.value, page: 1 })}
          />
          <input
            type="text"
            placeholder="Сторона 2"
            className="border p-2 rounded"
            value={filters.party2}
            onChange={(e) => setFilters({ ...filters, party2: e.target.value, page: 1 })}
          />
          <input
            type="text"
            placeholder="Техника"
            className="border p-2 rounded"
            value={filters.item_name}
            onChange={(e) => setFilters({ ...filters, item_name: e.target.value, page: 1 })}
          />
          <input
            type="email"
            placeholder="Email"
            className="border p-2 rounded"
            value={filters.email}
            onChange={(e) => setFilters({ ...filters, email: e.target.value, page: 1 })}
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10">Загрузка...</div>
      ) : error ? (
        <div className="bg-red-100 text-red-700 p-4 rounded">{error}</div>
      ) : acts.length === 0 ? (
        <div className="bg-white p-4 rounded shadow text-center">Акты не найдены</div>
      ) : (
        <div className="bg-white rounded shadow overflow-x-auto">
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
              {acts.map((act) => (
                <tr key={act.id}>
                  <td className="px-6 py-4 whitespace-nowrap">{act.id.slice(0, 8)}...</td>
                  <td className="px-6 py-4">{act.party1_name}</td>
                  <td className="px-6 py-4">{act.party2_name}</td>
                  <td className="px-6 py-4">{act.item_name}</td>
                  <td className="px-6 py-4">{new Date(act.issue_date).toLocaleDateString('ru-RU')}</td>
                  <td className="px-6 py-4">{getStatusLabel(act.status)}</td>
                  <td className="px-6 py-4 space-x-2">
                    <Link href={`/acts/${act.id}`} className="text-blue-600 hover:underline">
                      Просмотр
                    </Link>
                    <Link href={`/acts/${act.id}/edit`} className="text-green-600 hover:underline">
                      Редактировать
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
