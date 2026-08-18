'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import LogoutModal from '@/components/LogoutModal';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = () => {
    setLoggingOut(true);
    logout();
    router.push('/guest');
  };

  const navItems = [
    { href: '/admin/acts', label: 'Акты' },
    { href: '/admin/participants', label: 'Участники' },
    { href: '/admin/inventory', label: 'Инвентарь' },
    { href: '/admin/templates', label: 'Шаблоны' },
    { href: '/admin/analytics', label: 'Аналитика' },
    { href: '/admin/reminders', label: 'Коммуникации' },
    { href: '/admin/backups', label: 'Бэкапы' },
    { href: '/admin/kiosks', label: 'Устройства' },
  ];

  const isActive = (href: string) => {
    if (href === '/admin/acts') return pathname === '/admin/acts' || pathname.startsWith('/admin/acts/');
    return pathname.startsWith(href);
  };

  if (!user) return null;

  return (
    <div className="min-h-screen flex flex-col bg-gray-100 text-slate-900">
      <nav className="bg-white border-b border-gray-200 px-4 py-2.5 shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <div className="flex w-full min-w-0 items-center gap-2 md:w-auto md:gap-4 order-2 md:order-1">
            <Link href="/admin/acts" className="hidden shrink-0 text-lg font-bold text-slate-900 md:block">
              ActDigital
            </Link>
            <div className="flex min-w-0 items-center gap-1 overflow-x-auto pb-1 md:pb-0">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm transition ${
                    isActive(item.href)
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-gray-100'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex w-full min-w-0 items-center justify-between gap-2 md:w-auto md:justify-end md:gap-3 order-1 md:order-2">
            <Link href="/admin/acts" className="shrink-0 text-base font-bold text-slate-900 md:hidden">
              ActDigital
            </Link>
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex min-w-0 items-center text-sm text-slate-600">
                <span className="truncate font-medium text-slate-900">{user.full_name || user.username}</span>
                <span className="ml-2 shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                  Админ
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowLogoutModal(true)}
                className="min-h-11 shrink-0 rounded-xl bg-slate-100 px-4 text-sm text-slate-700 transition hover:bg-red-100 hover:text-red-700"
              >
                Выход
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 md:px-6 md:py-6">
        {children}
      </main>

      <LogoutModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={handleLogout}
        isLoading={loggingOut}
      />
    </div>
  );
}
