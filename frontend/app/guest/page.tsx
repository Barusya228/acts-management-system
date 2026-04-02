'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import ActsListPage from '@/components/ActsListPage';
import PageHeader from '@/components/ui/PageHeader';

export default function GuestPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }

    if (!loading && user?.role === 'ADMIN') {
      router.push('/');
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return null;
  }

  return (
    <Layout>
      <PageHeader
        eyebrow="Гостевой доступ"
        title="Работа с актами"
        description="В гостевом режиме доступны просмотр документов, создание и редактирование актов, подписание и работа с PDF без доступа к шаблонам системы."
      />

      <ActsListPage />
    </Layout>
  );
}
