# Инструкция по установке и запуску

## Шаг 1: Установка зависимостей

Перейдите в директорию проекта и установите зависимости:

```bash
cd acts-frontend
npm install
```

Если у вас возникают проблемы с PowerShell execution policy, используйте:

```bash
cd acts-frontend
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" install
```

## Шаг 2: Запуск приложения

```bash
npm run dev
```

Или:

```bash
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run dev
```

## Шаг 3: Открытие в браузере

Откройте http://localhost:3000

## Тестовые данные для входа

**Администратор:**
- Email: admin@example.com
- Пароль: admin123

**Пользователь:**
- Email: user@example.com
- Пароль: user123

## Что реализовано

✅ Полная структура Next.js проекта с TypeScript
✅ Tailwind CSS для стилизации
✅ Аутентификация с контекстом
✅ Страница входа
✅ Список актов с фильтрацией
✅ Создание нового акта
✅ Просмотр деталей акта
✅ Редактирование акта
✅ Страница шаблонов (для админов)
✅ Компоненты для работы с подписями
✅ Mock API для тестирования без бэкенда
✅ Навигация с разделением прав доступа

## Структура файлов

```
acts-frontend/
├── app/
│   ├── api/                    # Mock API
│   │   ├── auth/
│   │   │   ├── login/route.ts
│   │   │   └── me/route.ts
│   │   └── acts/
│   │       ├── route.ts
│   │       └── [id]/
│   │           ├── route.ts
│   │           └── sign/[party]/route.ts
│   ├── acts/
│   │   ├── [id]/
│   │   │   ├── page.tsx        # Просмотр акта
│   │   │   └── edit/page.tsx   # Редактирование
│   │   └── create/page.tsx     # Создание акта
│   ├── login/page.tsx          # Страница входа
│   ├── templates/page.tsx      # Шаблоны
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Главная (список актов)
│   └── globals.css
├── components/
│   ├── Layout.tsx              # Навигация
│   ├── ActsListPage.tsx        # Список актов
│   ├── SignaturePad.tsx        # Рисование подписи
│   └── SignatureUpload.tsx     # Загрузка подписи
├── contexts/
│   └── AuthContext.tsx         # Аутентификация
├── lib/
│   └── api.ts                  # Axios клиент
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
└── README.md
```

## Следующие шаги

После установки зависимостей приложение готово к запуску. Mock API позволяет тестировать все функции без реального бэкенда.

Для подключения к реальному бэкенду создайте файл `.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```
