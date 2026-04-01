'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  if (!user) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="bg-gray-800 text-white px-6 py-4 flex justify-between items-center">
        <Link href="/" className="text-xl font-bold">
          Acts Digitalization
        </Link>
        <div className="flex items-center gap-6">
          <Link href="/" className="hover:bg-gray-700 px-3 py-2 rounded">
            Акты
          </Link>
          {user.role === 'ADMIN' && (
            <Link href="/templates" className="hover:bg-gray-700 px-3 py-2 rounded">
              Шаблоны
            </Link>
          )}
          <div className="flex items-center gap-4">
            <span>{user.full_name || user.email}</span>
            <button onClick={handleLogout} className="bg-gray-600 hover:bg-gray-700 px-3 py-1 rounded">
              Выход
            </button>
          </div>
        </div>
      </nav>
      <main className="flex-1 p-6 bg-gray-100">{children}</main>
    </div>
  );
}
