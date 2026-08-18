import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || '',
});

// Глобальная обработка протухшего токена: любой 401 от API (кроме самих
// эндпоинтов входа) означает, что сессия истекла — чистим токен и отправляем
// пользователя переавторизоваться с возвратом на текущую страницу.
const AUTH_ENDPOINTS = ['/api/auth/login', '/api/auth/kiosks/enroll'];

api.interceptors.response.use(
  response => response,
  error => {
    const status = error?.response?.status;
    const url: string = error?.config?.url || '';
    const isAuthCall = AUTH_ENDPOINTS.some(endpoint => url.includes(endpoint));
    if (status === 401 && !isAuthCall && typeof window !== 'undefined') {
      localStorage.removeItem('token');
      delete api.defaults.headers.common['Authorization'];
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?next=${next}`;
    }
    return Promise.reject(error);
  },
);

export default api;
