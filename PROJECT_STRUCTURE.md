# Структура проекта

## Backend (FastAPI)

```
backend/
├── app/
│   ├── api/v1/endpoints/    # API endpoints
│   │   ├── auth.py          # Авторизация
│   │   ├── acts.py          # CRUD актов
│   │   └── templates.py     # CRUD шаблонов
│   ├── core/                # Ядро приложения
│   │   ├── config.py        # Конфигурация
│   │   ├── db/              # База данных
│   │   ├── dependencies.py  # Зависимости (auth)
│   │   └── security.py      # JWT, пароли
│   ├── db/models/           # SQLAlchemy модели
│   ├── schemas/             # Pydantic схемы
│   ├── services/            # Бизнес-логика
│   │   ├── act_service.py
│   │   ├── auth_service.py
│   │   ├── email_service.py
│   │   ├── pdf_service.py
│   │   └── template_service.py
│   └── utils/               # Утилиты
│       └── audit.py
├── alembic/                 # Миграции БД
├── scripts/                 # Seed скрипты
├── storage/                 # Файлы (PDF, подписи)
└── tests/                   # Тесты
```

## Frontend (React + Vite)

```
frontend/
├── src/
│   ├── components/          # React компоненты
│   │   ├── Layout.jsx
│   │   ├── SignaturePad.jsx
│   │   └── SignatureUpload.jsx
│   ├── contexts/            # React контексты
│   │   └── AuthContext.jsx
│   ├── pages/               # Страницы
│   │   ├── LoginPage.jsx
│   │   ├── ActsListPage.jsx
│   │   ├── ActCreatePage.jsx
│   │   ├── ActEditPage.jsx
│   │   ├── ActViewPage.jsx
│   │   └── TemplatesPage.jsx
│   └── services/            # API клиент
│       └── api.js
└── package.json
```

## Основные функции

### Backend
- ✅ JWT авторизация
- ✅ CRUD операции для актов и шаблонов
- ✅ Версионирование актов
- ✅ PDF генерация с подписями
- ✅ Email уведомления (SMTP или логирование)
- ✅ Аудит действий
- ✅ Фильтрация и пагинация

### Frontend
- ✅ Страница входа
- ✅ Список актов с фильтрами
- ✅ Создание акта
- ✅ Редактирование акта
- ✅ Просмотр акта
- ✅ Подпись через Canvas
- ✅ Загрузка подписи (PNG)
- ✅ Скачивание PDF
- ✅ Управление шаблонами (для админа)

## База данных

6 таблиц:
1. `users` - пользователи
2. `templates` - шаблоны актов
3. `acts` - акты
4. `act_versions` - версии актов
5. `file_assets` - файлы (PDF, подписи)
6. `audit_log` - аудит действий

## Запуск

```bash
# Docker Compose
docker-compose up -d

# Миграции и seed выполняются автоматически при первом запуске
```

## Тестирование

```bash
# Backend тесты
cd backend
pytest

# Frontend (если добавите тесты)
cd frontend
npm test
```

