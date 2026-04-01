# Acts Management System

Система цифровизации актов приема-передачи техники на базе Next.js 15, TypeScript и Tailwind CSS.

## Быстрый старт

### Windows

1. Запустите установку:
```bash
install.bat
```

2. Запустите приложение:
```bash
start.bat
```

### Linux/Mac

```bash
cd acts-frontend
npm install
npm run dev
```

Откройте http://localhost:3000

## Тестовые учетные данные

**Администратор:**
- Email: `admin@example.com`
- Пароль: `admin123`

**Пользователь:**
- Email: `user@example.com`
- Пароль: `user123`

## Возможности

- ✅ Аутентификация пользователей
- ✅ Создание и редактирование актов
- ✅ Фильтрация и поиск актов
- ✅ Просмотр деталей акта
- ✅ Компоненты для работы с подписями
- ✅ Разделение прав доступа (Admin/Staff)
- ✅ Mock API для тестирования

## Технологии

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- Axios
- React Signature Canvas

## Структура проекта

```
acts-management-system/
├── acts-frontend/           # Next.js приложение
│   ├── app/                # App Router
│   │   ├── api/           # Mock API routes
│   │   ├── acts/          # Страницы актов
│   │   ├── login/         # Страница входа
│   │   └── templates/     # Шаблоны
│   ├── components/        # React компоненты
│   ├── contexts/          # React контексты
│   └── lib/              # Утилиты
├── install.bat           # Скрипт установки (Windows)
└── start.bat            # Скрипт запуска (Windows)
```

## Документация

Подробная документация доступна в:
- `acts-frontend/README.md` - Основная документация
- `acts-frontend/SETUP.md` - Инструкция по установке

## Разработка

Проект использует:
- ESLint для проверки кода
- TypeScript для типизации
- Tailwind CSS для стилизации

## Следующие шаги

1. Установите зависимости: `npm install`
2. Запустите dev сервер: `npm run dev`
3. Откройте http://localhost:3000
4. Войдите с тестовыми данными

Для подключения к реальному бэкенду создайте `.env.local`:
```
NEXT_PUBLIC_API_URL=http://your-backend-url
```