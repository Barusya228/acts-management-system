'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import AdminLayout from '@/components/AdminLayout';
import ActsListPage from '@/components/ActsListPage';

export default function AdminActsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login?next=/admin/acts');
      return;
    }
    if (!loading && user && user.role !== 'ADMIN') {
      router.push('/guest');
    }
  }, [user, loading, router]);

  if (loading || !user || user.role !== 'ADMIN') {
    return null;
  }

  return (
    <AdminLayout>
      <ActsListPage />
    </AdminLayout>
  );
}
