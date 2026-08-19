'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
import SurfaceCard from '@/components/ui/SurfaceCard';
import api from '@/lib/api';

interface OverviewStats {
  total_acts: number;
  pending_signature: number;
  completed_acts: number;
  returned_acts: number;
  active_equipment: number;
}

interface MonthlyData {
  year: number;
  month: number;
  count: number;
  label: string;
}

interface MonthlyStats {
  issue_by_month: MonthlyData[];
  return_by_month: MonthlyData[];
}

interface TopRecipient {
  full_name: string;
  email: string;
  total_acts: number;
  active_acts: number;
  returned_acts: number;
}

interface StatusDistribution {
  status: string;
  label: string;
  count: number;
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats | null>(null);
  const [topRecipients, setTopRecipients] = useState<TopRecipient[]>([]);
  const [statusDistribution, setStatusDistribution] = useState<StatusDistribution[]>([]);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role !== 'ADMIN') {
      router.push('/guest');
      return;
    }
    fetchAnalytics();
  }, [user, router]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const [overviewRes, monthlyRes, recipientsRes, statusRes] = await Promise.all([
        api.get('/api/analytics/overview'),
        api.get('/api/analytics/monthly-stats?months=6'),
        api.get('/api/analytics/top-recipients?limit=10'),
        api.get('/api/analytics/status-distribution'),
      ]);

      setOverview(overviewRes.data);
      setMonthlyStats(monthlyRes.data);
      setTopRecipients(recipientsRes.data.top_recipients);
      setStatusDistribution(statusRes.data.distribution);
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!user || user.role !== 'ADMIN') {
    return null;
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="text-center py-10">Загрузка аналитики...</div>
      </AdminLayout>
    );
  }

  const getMonthName = (month: number): string => {
    const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
    return months[month - 1] || '';
  };

  return (
    <AdminLayout>
      <div className="mx-auto max-w-7xl">
        {/* Общая статистика */}
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-5">
          <SurfaceCard className="p-4">
            <p className="text-sm text-gray-500">Всего актов</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">{overview?.total_acts || 0}</p>
          </SurfaceCard>

          <SurfaceCard className="p-4">
            <p className="text-sm text-gray-500">На подписи</p>
            <p className="mt-1 text-3xl font-bold text-orange-600">{overview?.pending_signature || 0}</p>
          </SurfaceCard>

          <SurfaceCard className="p-4">
            <p className="text-sm text-gray-500">Завершено</p>
            <p className="mt-1 text-3xl font-bold text-green-600">{overview?.completed_acts || 0}</p>
          </SurfaceCard>

          <SurfaceCard className="p-4">
            <p className="text-sm text-gray-500">Возвращено</p>
            <p className="mt-1 text-3xl font-bold text-blue-600">{overview?.returned_acts || 0}</p>
          </SurfaceCard>

          <SurfaceCard className="p-4">
            <p className="text-sm text-gray-500">Техника на руках</p>
            <p className="mt-1 text-3xl font-bold text-purple-600">{overview?.active_equipment || 0}</p>
          </SurfaceCard>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* График выдачи/возврата по месяцам */}
          <SurfaceCard className="p-6">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Выдача и возврат по месяцам</h3>
            <div className="space-y-4">
              {monthlyStats?.issue_by_month.map((item, index) => {
                const returnItem = monthlyStats.return_by_month.find(
                  (r) => r.year === item.year && r.month === item.month
                );
                const maxCount = Math.max(
                  ...monthlyStats.issue_by_month.map((i) => i.count),
                  ...monthlyStats.return_by_month.map((r) => r.count)
                );

                return (
                  <div key={index}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-700">
                        {getMonthName(item.month)} {item.year}
                      </span>
                      <span className="text-gray-500">
                        Выдано: {item.count} | Возврат: {returnItem?.count || 0}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <div className="h-6 rounded bg-gray-200">
                          <div
                            className="h-full rounded bg-green-500"
                            style={{ width: `${(item.count / maxCount) * 100}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="h-6 rounded bg-gray-200">
                          <div
                            className="h-full rounded bg-blue-500"
                            style={{ width: `${((returnItem?.count || 0) / maxCount) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {(!monthlyStats?.issue_by_month || monthlyStats.issue_by_month.length === 0) && (
              <p className="text-center text-gray-500">Нет данных за последние 6 месяцев</p>
            )}
          </SurfaceCard>

          {/* Распределение по статусам */}
          <SurfaceCard className="p-6">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Распределение по статусам</h3>
            <div className="space-y-3">
              {statusDistribution.map((item, index) => {
                const total = statusDistribution.reduce((sum, s) => sum + s.count, 0);
                const percentage = total > 0 ? (item.count / total) * 100 : 0;

                return (
                  <div key={index}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-700">{item.label}</span>
                      <span className="text-gray-500">
                        {item.count} ({percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="h-4 rounded bg-gray-200">
                      <div
                        className="h-full rounded bg-indigo-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {statusDistribution.length === 0 && (
              <p className="text-center text-gray-500">Нет данных</p>
            )}
          </SurfaceCard>
        </div>

        {/* Топ получателей */}
        <SurfaceCard className="p-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Топ-10 получателей по количеству техники</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 text-left text-sm text-gray-500">
                  <th className="pb-3 font-medium">#</th>
                  <th className="pb-3 font-medium">ФИО</th>
                  <th className="pb-3 font-medium">Email</th>
                  <th className="pb-3 font-medium text-right">Всего актов</th>
                  <th className="pb-3 font-medium text-right">На руках</th>
                  <th className="pb-3 font-medium text-right">Возвращено</th>
                </tr>
              </thead>
              <tbody>
                {topRecipients.map((recipient, index) => (
                  <tr key={index} className="border-b border-gray-100">
                    <td className="py-3 text-sm text-gray-500">{index + 1}</td>
                    <td className="py-3 text-sm font-medium text-gray-900">{recipient.full_name}</td>
                    <td className="py-3 text-sm text-gray-600">{recipient.email}</td>
                    <td className="py-3 text-right text-sm font-semibold text-gray-900">
                      {recipient.total_acts}
                    </td>
                    <td className="py-3 text-right text-sm text-purple-600">{recipient.active_acts}</td>
                    <td className="py-3 text-right text-sm text-blue-600">{recipient.returned_acts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {topRecipients.length === 0 && (
            <p className="text-center text-gray-500 py-4">Нет данных о получателях</p>
          )}
        </SurfaceCard>
      </div>
    </AdminLayout>
  );
}
