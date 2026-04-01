import { AuthProvider } from '@/contexts/AuthContext';
import './globals.css';

export const metadata = {
  title: 'Acts Digitalization',
  description: 'System for digitalizing equipment issuance acts',
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
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
