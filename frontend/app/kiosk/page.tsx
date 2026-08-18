'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

export default function KioskEnrollPage() {
  const { enrollKiosk } = useAuth();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const normalized = code.trim();
    if (!normalized) return;
    setBusy(true);
    setError('');
    try {
      await enrollKiosk(normalized);
      router.push('/guest');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Не удалось привязать устройство');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6">
      <div className="w-full max-w-md">
        <div className="rounded-3xl bg-white p-8 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-blue-600">Устройство подписания</p>
          <h1 className="mt-2 text-2xl font-black text-slate-900">Привязка планшета</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Это устройство ещё не зарегистрировано. Попросите администратора создать код привязки
            в разделе <span className="font-bold">Админка → Устройства</span> и введите его ниже.
          </p>
          <input
            value={code}
            onChange={event => setCode(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') void submit(); }}
            placeholder="000-000"
            inputMode="numeric"
            autoFocus
            className="mt-6 min-h-16 w-full rounded-2xl border-2 border-slate-200 text-center font-mono text-3xl font-black tracking-[0.3em] outline-none focus:border-blue-500"
          />
          {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
          <button
            disabled={busy || !code.trim()}
            onClick={submit}
            className="mt-5 min-h-14 w-full rounded-2xl bg-blue-600 text-base font-black text-white disabled:opacity-40"
          >
            {busy ? 'Привязка...' : 'Привязать устройство'}
          </button>
          <p className="mt-4 text-center text-xs text-slate-400">Код действует 10 минут и работает один раз.</p>
          <div className="mt-4 text-center">
            <Link href="/login" className="text-xs text-slate-400 underline hover:text-slate-600">Вход администратора</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
