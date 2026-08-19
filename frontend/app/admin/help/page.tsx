'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
import { useAuth } from '@/contexts/AuthContext';

const sections = [
  {
    href: '/admin/acts',
    icon: '📄',
    title: 'Акты',
    text: 'Создание актов по шаблонам, подписание сторонами, PDF-документы. Для iPad-актов — ревизии, приложения (замена, выбытие, добавление ученика) и годовой возврат.',
  },
  {
    href: '/admin/inventory',
    icon: '💻',
    title: 'Техника',
    text: 'Инвентарь устройств с серийными номерами и статусами, отдельный реестр iPad, мелкая техника и категории.',
  },
  {
    href: '/admin/participants',
    icon: '👥',
    title: 'Люди',
    text: 'Справочник сотрудников: кто выдаёт технику (IT) и кто получает. Синхронизация с Active Directory.',
  },
  {
    href: '/admin/analytics',
    icon: '📊',
    title: 'Отчёты',
    text: 'Статистика по актам: счётчики, графики выдач и возвратов по месяцам, топ получателей.',
  },
  {
    href: '/admin/templates',
    icon: '📋',
    title: 'Шаблоны актов',
    text: 'Типы актов (один получатель, несколько, iPad advisory) и их включение/отключение.',
  },
  {
    href: '/admin/reminders',
    icon: '✉️',
    title: 'Отправка документов',
    text: 'Финальные письма получателям с PDF-документами и полная история отправок по каждому акту.',
  },
  {
    href: '/admin/kiosks',
    icon: '📱',
    title: 'Планшеты для подписи',
    text: 'Привязка планшетов-киосков по коду (действует 10 минут), статусы устройств и отзыв доступа.',
  },
  {
    href: '/admin/backups',
    icon: '💾',
    title: 'Резервные копии',
    text: 'Статус системных бэкапов PostgreSQL и файлов, отдельные копии финальных PDF.',
  },
];

export default function AdminHelpPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) router.push('/login?next=/admin/help');
    if (!authLoading && user && user.role !== 'ADMIN') router.push('/guest');
  }, [user, authLoading, router]);

  if (authLoading || !user || user.role !== 'ADMIN') return null;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-900 md:text-2xl">Help Center</h1>
          <p className="mt-1 text-sm text-slate-500">Краткий справочник по разделам SmartAct.</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {sections.map((section, index) => (
            <Link
              key={section.href}
              href={section.href}
              className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow-md"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl" aria-hidden>
                {section.icon}
              </span>
              <span className="min-w-0">
                <span className="block font-bold text-slate-900 group-hover:text-blue-700">
                  {index + 1}. {section.title}
                </span>
                <span className="mt-1 block text-sm leading-5 text-slate-500">{section.text}</span>
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-6 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-blue-900 p-5 text-white shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-black">Нужна помощь или нашли ошибку?</p>
              <p className="mt-1 text-sm text-slate-300">Напишите разработчику — отвечу и помогу разобраться.</p>
            </div>
            <a
              href="https://t.me/id_limbo"
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 font-bold text-white transition hover:bg-blue-500"
            >
              ✈️ Telegram: @id_limbo
            </a>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
