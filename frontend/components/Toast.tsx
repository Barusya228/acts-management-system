'use client';

import { useEffect } from 'react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
  durationMs?: number;
}

export default function Toast({ message, type = 'info', onClose, durationMs = 3500 }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onClose, durationMs);
    return () => clearTimeout(timer);
  }, [message, durationMs, onClose]);

  if (!message) return null;

  const toneClass =
    type === 'success'
      ? 'border-green-300 bg-green-50 text-green-800'
      : type === 'error'
      ? 'border-red-300 bg-red-50 text-red-800'
      : 'border-blue-300 bg-blue-50 text-blue-800';

  return (
    <div className="fixed right-4 top-4 z-50">
      <div className={`min-w-[280px] max-w-[420px] rounded border px-4 py-3 shadow ${toneClass}`}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm">{message}</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-xs hover:bg-black/10"
          >
            x
          </button>
        </div>
      </div>
    </div>
  );
}
