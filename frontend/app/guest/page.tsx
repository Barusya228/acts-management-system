'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import GuestActsGrid from '@/components/GuestActsGrid';

export default function GuestPage() {
  const { user, loading, loginAsGuest } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const ensureGuestSession = async () => {
      if (!loading && !user) {
        await loginAsGuest();
      }
    };

    if (!loading && user?.role === 'ADMIN') {
      router.push('/admin/acts');
    }

    ensureGuestSession();
  }, [loading, user, router, loginAsGuest]);

  if (loading || !user) {
    return null;
  }

  return (
    <Layout>
      <GuestActsGrid />
    </Layout>
  );
}
