'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, loginAsGuest } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      loginAsGuest();
    }
  }, [user, loginAsGuest]);

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
      </div>
    );
  }

  const handleAdminClick = () => {
    if (user.role === 'ADMIN') {
      router.push('/admin/acts');
    } else {
      router.push('/login?next=/admin/acts');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-100 text-slate-900">
      <nav className="bg-white border-b border-gray-200 px-4 py-2.5 shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <div className="flex min-w-0 items-center gap-2 md:gap-4">
            <Link href="/guest" className="shrink-0 text-base font-bold text-slate-900 md:text-lg">
              Acts Digitalization
            </Link>
            <div className="flex items-center gap-1">
              <Link
                href="/guest"
                className="flex min-h-11 items-center rounded-lg px-3 text-sm text-slate-700 transition hover:bg-gray-100"
              >
                Акты
              </Link>

            </div>
          </div>

          <div className="flex min-w-0 items-center gap-2 md:gap-3">
            <div className="hidden min-w-0 text-sm text-slate-600 sm:block">
              <span className="font-medium text-slate-900">{user.full_name || user.email}</span>
              <span className="ml-2 text-slate-400">Гость</span>
            </div>
            <button
              type="button"
              onClick={handleAdminClick}
              className="min-h-11 shrink-0 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Войти как админ
            </button>
          </div>
        </div>
      </nav>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 md:px-6 md:py-6">{children}</main>
    </div>
  );
}
