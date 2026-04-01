# Acts Management System - Frontend

Next.js приложение для цифровизации актов приема-передачи техники с использованием TypeScript и Tailwind CSS.

## Технологии

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- Axios
- React Signature Canvas

## Установка

1. Перейдите в директорию проекта:
```bash
cd acts-frontend
```

2. Установите зависимости:
```bash
npm install
```

## Запуск

Запустите сервер разработки:
```bash
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000) в браузере.

## Тестовые учетные данные

### Администратор
- Email: `admin@example.com`
- Пароль: `admin123`

### Пользователь
- Email: `user@example.com`
- Пароль: `user123`

## Структура проекта

```
acts-frontend/
├── app/                      # Next.js App Router
│   ├── api/                  # Mock API routes
│   │   ├── auth/            # Аутентификация
│   │   └── acts/            # CRUD операции с актами
│   ├── acts/                # Страницы актов
│   │   ├── [id]/           # Просмотр и редактирование
│   │   └── create/         # Создание акта
│   ├── login/              # Страница входа
│   ├── templates/          # Шаблоны (только для админов)
│   ├── layout.tsx          # Глобальный layout
│   ├── page.tsx            # Главная страница (список актов)
│   └── globals.css         # Глобальные стили
├── components/             # React компоненты
│   ├── Layout.tsx         # Навигация
│   ├── ActsListPage.tsx   # Список актов с фильтрами
│   ├── SignaturePad.tsx   # Компонент для рисования подписи
│   └── SignatureUpload.tsx # Загрузка изображения подписи
├── contexts/              # React контексты
│   └── AuthContext.tsx    # Контекст аутентификации
└── lib/                   # Утилиты
    └── api.ts            # Axios клиент

```

## Функционал

### Реализовано

- Аутентификация пользователей
- Список актов с фильтрацией
- Создание новых актов
- Просмотр деталей акта
- Редактирование актов
- Компоненты для работы с подписями
- Mock API для тестирования без бэкенда
- Разделение прав доступа (Admin/Staff)

### Mock API

Приложение включает встроенный mock API, который хранит данные в памяти. Это позволяет тестировать функционал без реального бэкенда.

Endpoints:
- `POST /api/auth/login` - Вход в систему
- `GET /api/auth/me` - Получение текущего пользователя
- `GET /api/acts` - Список актов с фильтрацией
- `POST /api/acts` - Создание акта
- `GET /api/acts/[id]` - Получение акта
- `PUT /api/acts/[id]` - Обновление акта
- `DELETE /api/acts/[id]` - Удаление акта
- `POST /api/acts/[id]/sign/[party]` - Подписание акта

## Сборка для продакшена

```bash
npm run build
npm start
```

## Следующие шаги

Для подключения к реальному бэкенду:

1. Создайте файл `.env.local`:
```
NEXT_PUBLIC_API_URL=http://your-backend-url
```

2. Удалите или отключите mock API routes в `app/api/`

3. Убедитесь, что бэкенд API соответствует ожидаемым endpoints
