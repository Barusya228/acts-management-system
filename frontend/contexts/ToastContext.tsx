'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import Toast from '@/components/Toast';

type ToastType = 'success' | 'error' | 'info';

interface ToastState {
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
  clearToast: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    setToast({ message, type });
  }, []);

  const clearToast = useCallback(() => {
    setToast(null);
  }, []);

  const value = useMemo(
    () => ({
      showToast,
      clearToast,
    }),
    [showToast, clearToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={clearToast}
        />
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
