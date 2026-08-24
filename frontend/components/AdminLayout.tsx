'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import LogoutModal from '@/components/LogoutModal';
import ThemeToggle from '@/components/ThemeToggle';

// Навигация по частоте использования: ежедневные разделы — на виду,
// редко используемые (конфигурация системы) — в дропдауне «Настройки».
const navIconPaths = {
  home: ['M3 11.5 12 4l9 7.5', 'M5.5 10v10h13V10', 'M9.5 20v-6h5v6'],
  acts: ['M6 3h8l4 4v14H6z', 'M14 3v5h5', 'M9 12h6M9 16h6'],
  inventory: ['M5 5h14v10H5z', 'M3 19h18', 'M8 19h8'],
  people: ['M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M15.5 10a2.5 2.5 0 1 0 0-5', 'M3 20c.4-4 2.2-6 5.5-6s5.1 2 5.5 6', 'M14 14.5c4-.6 6.4 1.2 7 5.5'],
  templates: ['M8 4h8', 'M9 2h6v4H9z', 'M6 4H4v18h16V4h-2', 'M8 11h8M8 15h8'],
  mail: ['M3 5h18v14H3z', 'm4 8 5 4 5-4'],
  tablet: ['M6 2.5h12v19H6z', 'M10 5h4M11 18.5h2'],
  backup: ['M5 6c0-2 3.1-3.5 7-3.5S19 4 19 6s-3.1 3.5-7 3.5S5 8 5 6Z', 'M5 6v6c0 2 3.1 3.5 7 3.5s7-1.5 7-3.5V6', 'M5 12v6c0 2 3.1 3.5 7 3.5s7-1.5 7-3.5v-6'],
  audit: ['M12 7v5l3 2', 'M21 12a9 9 0 1 1-2.6-6.3', 'M21 4v5h-5'],
  analytics: ['M4 20V10M10 20V4M16 20v-7M22 20H2'],
  help: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M9.7 9a2.4 2.4 0 1 1 3.4 2.2c-.8.5-1.1 1-1.1 1.8', 'M12 17h.01'],
  settings: ['M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z', 'M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1'],
} as const;

type NavIconName = keyof typeof navIconPaths;

function NavIcon({ name, className = 'h-4 w-4' }: { name: NavIconName; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={`${className} shrink-0 stroke-current`} fill="none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {navIconPaths[name].map((path, index) => <path key={index} d={path} />)}
    </svg>
  );
}

const mainNav = [
  { href: '/admin', icon: 'home' as const, label: 'Главная' },
  { href: '/admin/acts', icon: 'acts' as const, label: 'Акты' },
  { href: '/admin/inventory', icon: 'inventory' as const, label: 'Техника' },
  { href: '/admin/participants', icon: 'people' as const, label: 'Люди' },
  { href: '/admin/analytics', icon: 'analytics' as const, label: 'Аналитика' },
];

const settingsNav = [
  { href: '/admin/templates', icon: 'templates' as const, label: 'Шаблоны актов', hint: 'Типы актов и их поля' },
  { href: '/admin/reminders', icon: 'mail' as const, label: 'Отправка документов', hint: 'Финальные письма получателям и история отправок' },
  { href: '/admin/kiosks', icon: 'tablet' as const, label: 'Планшеты для подписи', hint: 'Привязка устройств для подписания' },
  { href: '/admin/backups', icon: 'backup' as const, label: 'Резервные копии', hint: 'Статус бэкапов БД и PDF' },
  { href: '/admin/audit', icon: 'audit' as const, label: 'Журнал действий', hint: 'Кто и что делал в системе' },
  { href: '/admin/help', icon: 'help' as const, label: 'Поддержка', hint: 'Справка по разделам и связь с разработчиком' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Закрытие дропдауна по клику вне
  useEffect(() => {
    if (!settingsOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [settingsOpen]);

  const handleLogout = () => {
    setLoggingOut(true);
    logout();
    router.push('/guest');
  };

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin';
    if (href === '/admin/acts') return pathname === '/admin/acts' || pathname.startsWith('/admin/acts/');
    return pathname.startsWith(href);
  };

  const settingsActive = settingsNav.some(item => isActive(item.href));

  if (!user) return null;

  return (
    <div className="theme-shell min-h-screen flex flex-col bg-gray-100 text-slate-900">
      <nav className="bg-white border-b border-gray-200 px-4 py-2.5 shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <div className="order-2 flex w-full min-w-0 items-center gap-2 md:gap-2 lg:gap-4 xl:order-1 xl:w-auto">
            {/* До xl лого остаётся в верхней строке рядом с пользователем, а меню занимает отдельную строку. */}
            <Link href="/admin/acts" className="hidden shrink-0 text-lg font-bold text-slate-900 xl:block">
              SmartAct
            </Link>
            <div className="flex min-w-0 items-center gap-1 overflow-x-auto pb-1 xl:overflow-visible xl:pb-0">
              {mainNav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm transition lg:px-3 ${
                    isActive(item.href)
                      ? 'bg-blue-600 font-semibold text-white shadow-sm'
                      : 'text-slate-700 hover:bg-gray-100'
                  }`}
                >
                  <NavIcon name={item.icon} />
                  {item.label}
                </Link>
              ))}

              {/* Десктоп (xl+): дропдаун «Настройки». На планшетах пункты находятся в общей ленте. */}
              <div ref={settingsRef} className="relative hidden xl:block">
                <button
                  type="button"
                  onClick={() => setSettingsOpen(open => !open)}
                  className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm transition lg:px-3 ${
                    settingsActive
                      ? 'bg-blue-600 font-semibold text-white shadow-sm'
                      : 'text-slate-700 hover:bg-gray-100'
                  }`}
                >
                  <NavIcon name="settings" />
                  Дополнительное
                  <span className={`text-[10px] transition-transform ${settingsOpen ? 'rotate-180' : ''}`} aria-hidden>▼</span>
                </button>
                {settingsOpen && (
                  <div className="absolute left-0 top-full z-40 mt-1 w-80 overflow-hidden rounded-2xl border border-gray-200 bg-white p-1.5 shadow-xl">
                    {settingsNav.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setSettingsOpen(false)}
                        className={`flex items-start gap-3 rounded-xl px-3 py-2.5 transition ${
                          isActive(item.href) ? 'bg-slate-100' : 'hover:bg-gray-50'
                        }`}
                      >
                        <NavIcon name={item.icon} className="mt-0.5 h-5 w-5" />
                        <span className="min-w-0">
                          <span className={`block text-sm font-semibold ${isActive(item.href) ? 'text-slate-900' : 'text-slate-800'}`}>{item.label}</span>
                          <span className="block text-xs text-slate-500">{item.hint}</span>
                        </span>
                        {isActive(item.href) && <span className="ml-auto mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-600" aria-hidden />}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Мобильные и планшеты (до xl): пункты настроек в общем скролле, без дропдауна */}
              {settingsNav.map((item) => (
                <Link
                  key={`m-${item.href}`}
                  href={item.href}
                  className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm transition xl:hidden ${
                    isActive(item.href)
                      ? 'bg-blue-600 font-semibold text-white shadow-sm'
                      : 'text-slate-700 hover:bg-gray-100'
                  }`}
                >
                  <NavIcon name={item.icon} />
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="order-1 flex w-full min-w-0 items-center justify-between gap-2 md:gap-2 lg:gap-3 xl:order-2 xl:w-auto xl:justify-end">
            <Link href="/admin/acts" className="shrink-0 text-base font-bold text-slate-900 xl:hidden">
              SmartAct
            </Link>
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex min-w-0 items-center text-sm text-slate-600">
                <span className="truncate font-medium text-slate-900">{user.full_name || user.username}</span>
                <span className="ml-2 shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                  Админ
                </span>
              </div>
              <ThemeToggle showLabel />
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
