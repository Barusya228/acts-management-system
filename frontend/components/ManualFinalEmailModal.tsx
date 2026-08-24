'use client';

import { useEffect } from 'react';
import ManualFinalEmail from '@/components/ManualFinalEmail';

interface ManualFinalEmailModalProps {
  actId: string;
  title: string;
  reference: string;
  onClose: () => void;
}

export default function ManualFinalEmailModal({ actId, title, reference, onClose }: ManualFinalEmailModalProps) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/75 px-3 py-4 backdrop-blur-sm sm:px-6 sm:py-6"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="manual-final-email-title" className="w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Отправка документа</p>
            <h2 id="manual-final-email-title" className="mt-0.5 truncate text-lg font-black text-slate-900">{title}</h2>
            <p className="font-mono text-xs text-slate-400">{reference}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-slate-100 px-3 text-sm font-bold text-slate-700 transition hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 stroke-current" fill="none" strokeWidth="1.8"><path d="m6 6 12 12M18 6 6 18" /></svg>
            <span className="hidden sm:inline">Закрыть</span>
          </button>
        </div>
        <div className="max-h-[calc(100dvh-10rem)] overflow-y-auto p-4 sm:p-6">
          <ManualFinalEmail actId={actId} />
        </div>
      </div>
    </div>
  );
}
