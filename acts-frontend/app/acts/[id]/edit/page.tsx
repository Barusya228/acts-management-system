'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import Layout from '@/components/Layout';

interface ActFormData {
  party1_name: string;
  party2_name: string;
  issue_date: string;
  item_name: string;
  item_serial: string;
  receiver_email: string;
}

export default function ActEditPage({ params }: { params: { id: string } }) {
  const [formData, setFormData] = useState<ActFormData>({
    party1_name: '',
    party2_name: '',
    issue_date: '',
    item_name: '',
    item_serial: '',
    receiver_email: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    fetchAct();
  }, [params.id]);

  const fetchAct = async () => {
    try {
      const res = await api.get(`/api/acts/${params.id}`);
      const act = res.data;
      setFormData({
        party1_name: act.party1_name,
        party2_name: act.party2_name,
        issue_date: act.issue_date.split('T')[0],
        item_name: act.item_name,
        item_serial: act.item_serial,
        receiver_email: act.receiver_email,
      });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка загрузки акта');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      await api.put(`/api/acts/${params.id}`, {
        ...formData,
        issue_date: new Date(formData.issue_date).toISOString(),
      });
      router.push(`/acts/${params.id}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка сохранения акта');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-10">Загрузка...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Редактирование акта</h1>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded shadow p-6">
          <div className="mb-4">
            <label htmlFor="party1_name" className="block text-sm font-medium text-gray-700 mb-2">
              Сторона 1 (Передающая)
            </label>
            <input
              type="text"
              id="party1_name"
              name="party1_name"
              value={formData.party1_name}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="mb-4">
            <label htmlFor="party2_name" className="block text-sm font-medium text-gray-700 mb-2">
              Сторона 2 (Получающая)
            </label>
            <input
              type="text"
              id="party2_name"
              name="party2_name"
              value={formData.party2_name}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="mb-4">
            <label htmlFor="issue_date" className="block text-sm font-medium text-gray-700 mb-2">
              Дата выдачи
            </label>
            <input
              type="date"
              id="issue_date"
              name="issue_date"
              value={formData.issue_date}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="mb-4">
            <label htmlFor="item_name" className="block text-sm font-medium text-gray-700 mb-2">
              Наименование техники
            </label>
            <input
              type="text"
              id="item_name"
              name="item_name"
              value={formData.item_name}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="mb-4">
            <label htmlFor="item_serial" className="block text-sm font-medium text-gray-700 mb-2">
              Серийный номер
            </label>
            <input
              type="text"
              id="item_serial"
              name="item_serial"
              value={formData.item_serial}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="mb-6">
            <label htmlFor="receiver_email" className="block text-sm font-medium text-gray-700 mb-2">
              Email получателя
            </label>
            <input
              type="email"
              id="receiver_email"
              name="receiver_email"
              value={formData.receiver_email}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="bg-gray-600 text-white px-6 py-2 rounded hover:bg-gray-700"
            >
              Отмена
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
