'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import api from '@/lib/api';

interface User {
  id: string;
  username: string;
  email?: string;
  full_name: string;
  role: string;
  is_active: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  loginAsGuest: () => Promise<void>;
  enrollKiosk: (enrollmentCode: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser();
    } else {
      setLoading(false);
    }
  }, []);

  // Sliding session: пока вкладка открыта и пользователь авторизован,
  // раз в 20 минут тихо обмениваем токен на свежий с полным сроком.
  // Киоскам сервер отвечает 403 — их не трогаем.
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(async () => {
      try {
        const response = await api.post('/api/auth/refresh');
        const { access_token } = response.data;
        if (access_token) {
          localStorage.setItem('token', access_token);
          api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
        }
      } catch {
        // 401 обработает глобальный интерсептор, 403 (киоск) игнорируем
      }
    }, 20 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user]);

  const fetchUser = async () => {
    try {
      const res = await api.get('/api/auth/me');
      setUser(res.data);
    } catch (error) {
      localStorage.removeItem('token');
      delete api.defaults.headers.common['Authorization'];
    } finally {
      setLoading(false);
    }
  };

  const login = async (username: string, password: string) => {
    const res = await api.post('/api/auth/login', { username, password });
    const { access_token } = res.data;
    localStorage.setItem('token', access_token);
    api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
    await fetchUser();
  };

  const loginAsGuest = async () => {
    // Устройство должно быть привязано администратором: без сохранённого
    // токена киоска отправляем на страницу привязки.
    const stored = localStorage.getItem('token');
    if (!stored) {
      window.location.href = '/kiosk';
      return;
    }
    api.defaults.headers.common['Authorization'] = `Bearer ${stored}`;
    try {
      await fetchUser();
    } catch {
      localStorage.removeItem('token');
      window.location.href = '/kiosk';
    }
  };

  const enrollKiosk = async (enrollmentCode: string) => {
    const res = await api.post('/api/auth/kiosks/enroll', { enrollment_code: enrollmentCode });
    const { access_token } = res.data;
    localStorage.setItem('token', access_token);
    api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
    await fetchUser();
  };

  const logout = () => {
    localStorage.removeItem('token');
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, loginAsGuest, enrollKiosk, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
