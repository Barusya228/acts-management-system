'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import Layout from '@/components/Layout';

interface Act {
  id: string;
  template_id: string;
  party1_name: string;
  party2_name: string;
  issue_date: string;
  item_name: string;
  item_serial: string;
  receiver_email: string;
  status: string;
  current_version: number;
  created_at: string;
  updated_at: string;
}

export default function ActViewPage({ params }: { params: { id: string } }) {
  const [act, setAct] = useState<Act | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    fetchAct();
  }, [params.id]);

  const fetchAct = async () => {
    try {
      const res = await api.get(`/api/acts/${params.id}`);
      setAct(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка загрузки акта');
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

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      DRAFT: 'bg-gray-200 text-gray-800',
      SIGNED_PARTY1: 'bg-yellow-200 text-yellow-800',
      SIGNED_PARTY2: 'bg-blue-200 text-blue-800',
      COMPLETED: 'bg-green-200 text-green-800',
    };
    return colors[status] || 'bg-gray-200 text-gray-800';
  };

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-10">Загрузка...</div>
      </Layout>
    );
  }

  if (error || !act) {
    return (
      <Layout>
        <div className="bg-red-100 text-red-700 p-4 rounded">{error || 'Акт не найден'}</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Просмотр акта</h1>
          <div className="flex gap-2">
            <Link
              href={`/acts/${act.id}/edit`}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Редактировать
            </Link>
            <Link href="/" className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700">
              Назад к списку
            </Link>
          </div>
        </div>

        <div className="bg-white rounded shadow p-6">
          <div className="mb-4">
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(act.status)}`}>
              {getStatusLabel(act.status)}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">ID акта</h3>
              <p className="text-lg">{act.id}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Дата выдачи</h3>
              <p className="text-lg">{new Date(act.issue_date).toLocaleDateString('ru-RU')}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Сторона 1 (Передающая)</h3>
              <p className="text-lg">{act.party1_name}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Сторона 2 (Получающая)</h3>
              <p className="text-lg">{act.party2_name}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Наименование техники</h3>
              <p className="text-lg">{act.item_name}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Серийный номер</h3>
              <p className="text-lg">{act.item_serial}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Email получателя</h3>
              <p className="text-lg">{act.receiver_email}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Версия</h3>
              <p className="text-lg">{act.current_version}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Создан</h3>
              <p className="text-lg">{new Date(act.created_at).toLocaleString('ru-RU')}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Обновлен</h3>
              <p className="text-lg">{new Date(act.updated_at).toLocaleString('ru-RU')}</p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
