'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const isGuest = user?.role === 'GUEST';

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  if (!user) return null;

  return (
    <div className="min-h-screen flex flex-col bg-gray-100 text-slate-900">
      <nav className="bg-white border-b border-gray-200 px-4 py-2.5 shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-lg font-bold text-slate-900">
              Acts Digitalization
            </Link>
            <div className="flex items-center gap-1">
              <Link
                href={isGuest ? '/guest' : '/'}
                className="rounded-lg px-3 py-1.5 text-sm text-slate-700 transition hover:bg-gray-100"
              >
                {isGuest ? 'Акты' : 'Список актов'}
              </Link>
              {user.role === 'ADMIN' && (
                <>
                  <Link
                    href="/participants"
                    className="rounded-lg px-3 py-1.5 text-sm text-slate-700 transition hover:bg-gray-100"
                  >
                    Участники
                  </Link>
                  <Link
                    href="/templates"
                    className="rounded-lg px-3 py-1.5 text-sm text-slate-700 transition hover:bg-gray-100"
                  >
                    Шаблоны
                  </Link>
                  <Link
                    href="/analytics"
                    className="rounded-lg px-3 py-1.5 text-sm text-slate-700 transition hover:bg-gray-100"
                  >
                    Аналитика
                  </Link>
                  <Link
                    href="/reminders"
                    className="rounded-lg px-3 py-1.5 text-sm text-slate-700 transition hover:bg-gray-100"
                  >
                    Напоминания
                  </Link>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm text-slate-600">
              <span className="font-medium text-slate-900">{user.full_name || user.email}</span>
              <span className="ml-2 text-slate-400">• {user.role === 'ADMIN' ? 'Админ' : 'Гость'}</span>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-lg bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-sm text-slate-700 transition"
            >
              Выход
            </button>
          </div>
        </div>
      </nav>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 md:px-6 md:py-6">{children}</main>
    </div>
  );
}
