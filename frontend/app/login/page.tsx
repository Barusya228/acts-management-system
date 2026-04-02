'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, loginAsGuest } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      router.push('/');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setError('');
    setLoading(true);

    try {
      await loginAsGuest();
      router.push('/');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка гостевого входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4 py-6">
      <div className="w-full max-w-md">
        <div className="space-y-4">
          <div className="rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-blue-900 p-5 text-white shadow-lg">
            <p className="text-xs uppercase tracking-[0.24em] text-blue-200">Acts Digitalization</p>
            <h1 className="mt-2 text-xl font-bold tracking-tight">Цифровизация актов выдачи и возврата техники</h1>
            <p className="mt-2 text-xs leading-5 text-slate-200">
              Единый кабинет для оформления актов, подписи документов и контроля жизненного цикла техники.
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-md w-full">
            <h2 className="text-lg font-bold mb-1">Вход в систему</h2>
            <p className="mb-4 text-xs text-gray-500">Используйте аккаунт администратора или откройте гостевой режим.</p>
        
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded mb-3 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label htmlFor="email" className="block text-xs font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              required
            />
          </div>

          <div className="mb-4">
            <label htmlFor="password" className="block text-xs font-medium text-gray-700 mb-1">
              Пароль
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium"
          >
            {loading ? 'Вход...' : 'Войти'}
          </button>
            </form>

            <div className="my-3 flex items-center gap-3">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs uppercase tracking-wide text-gray-400">или</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            <button
              type="button"
              onClick={handleGuestLogin}
              disabled={loading}
              className="w-full bg-gray-700 text-white py-2 px-4 rounded-md hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium"
            >
              {loading ? 'Вход...' : 'Войти как гость'}
            </button>

            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-gray-600">
              <p className="font-medium text-gray-800">Тестовые данные</p>
              <p className="mt-1">Admin: admin@example.com / admin123</p>
              <p>Гость: без логина и пароля</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
