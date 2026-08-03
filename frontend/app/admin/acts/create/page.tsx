'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function RedirectToSharedCreate() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams.toString();
    router.replace(`/acts/create${query ? `?${query}` : ''}`);
  }, [router, searchParams]);

  return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-400">Открываем общую форму создания...</div>;
}

export default function AdminActCreatePage() {
  return <Suspense fallback={null}><RedirectToSharedCreate /></Suspense>;
}
