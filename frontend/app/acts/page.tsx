'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function ActsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user?.role === 'ADMIN') {
      router.replace('/admin/acts');
    } else {
      router.replace('/guest');
    }
  }, [user, loading, router]);

  return null;
}
