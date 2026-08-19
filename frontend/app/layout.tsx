import type { Viewport } from 'next';
import { AuthProvider } from '@/contexts/AuthContext';
import { ToastProvider } from '@/contexts/ToastContext';
import './globals.css';

export const metadata = {
  title: 'SmartAct',
  description: 'System for digitalizing equipment issuance acts',
};

// viewport-fit=cover — чтобы sticky-хедеры и полноэкранные модалки корректно
// работали на телефонах с вырезом (safe-area, см. globals.css).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>
        <AuthProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
