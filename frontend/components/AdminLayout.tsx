'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import LogoutModal from '@/components/LogoutModal';

// Навигация по частоте использования: ежедневные разделы — на виду,
// редко используемые (конфигурация системы) — в дропдауне «Настройки».
const mainNav = [
  { href: '/admin', icon: '🏠', label: 'Главная' },
  { href: '/admin/acts', icon: '📄', label: 'Акты' },
  { href: '/admin/inventory', icon: '💻', label: 'Техника' },
  { href: '/admin/participants', icon: '👥', label: 'Люди' },
  { href: '/admin/analytics', icon: '📊', label: 'Отчёты' },
];

const settingsNav = [
  { href: '/admin/templates', icon: '📋', label: 'Шаблоны актов', hint: 'Типы актов и их поля' },
  { href: '/admin/reminders', icon: '✉️', label: 'Отправка документов', hint: 'Финальные письма получателям и история отправок' },
  { href: '/admin/kiosks', icon: '📱', label: 'Планшеты для подписи', hint: 'Привязка устройств для подписания' },
  { href: '/admin/backups', icon: '💾', label: 'Резервные копии', hint: 'Статус бэкапов БД и PDF' },
  { href: '/admin/audit', icon: '🕐', label: 'Журнал действий', hint: 'Кто и что делал в системе' },
  { href: '/admin/help', icon: '🆘', label: 'Поддержка', hint: 'Справка по разделам и связь с разработчиком' },
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
    <div className="min-h-screen flex flex-col bg-gray-100 text-slate-900">
      <nav className="bg-white border-b border-gray-200 px-4 py-2.5 shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <div className="flex w-full min-w-0 items-center gap-2 md:w-auto md:gap-4 order-2 md:order-1">
            <Link href="/admin/acts" className="hidden shrink-0 text-lg font-bold text-slate-900 md:block">
              SmartAct
            </Link>
            <div className="flex min-w-0 items-center gap-1 overflow-x-auto pb-1 md:overflow-visible md:pb-0">
              {mainNav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm transition ${
                    isActive(item.href)
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-gray-100'
                  }`}
                >
                  <span aria-hidden>{item.icon}</span>
                  {item.label}
                </Link>
              ))}

              {/* Десктоп: дропдаун «Настройки» */}
              <div ref={settingsRef} className="relative hidden md:block">
                <button
                  type="button"
                  onClick={() => setSettingsOpen(open => !open)}
                  className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm transition ${
                    settingsActive
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-gray-100'
                  }`}
                >
                  <span aria-hidden>⚙️</span>
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
                        <span className="mt-0.5 text-lg" aria-hidden>{item.icon}</span>
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

              {/* Мобильная версия: пункты настроек в общем скролле, без дропдауна */}
              {settingsNav.map((item) => (
                <Link
                  key={`m-${item.href}`}
                  href={item.href}
                  className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm transition md:hidden ${
                    isActive(item.href)
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-gray-100'
                  }`}
                >
                  <span aria-hidden>{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex w-full min-w-0 items-center justify-between gap-2 md:w-auto md:justify-end md:gap-3 order-1 md:order-2">
            <Link href="/admin/acts" className="shrink-0 text-base font-bold text-slate-900 md:hidden">
              SmartAct
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
