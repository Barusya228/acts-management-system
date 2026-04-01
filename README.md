# Acts Digitalization System

Веб-приложение для цифровизации актов выдачи техники.
Монорепозиторий с backend на FastAPI и frontend на Next.js (App Router) с Tailwind CSS.

## Структура проекта

```
acts-digitalization/
├── backend/                # FastAPI приложение
│   ├── app/
│   │   ├── api/           # API роуты (v1)
│   │   ├── core/          # Конфигурация, безопасность, БД
│   │   ├── db/            # Модели SQLAlchemy
│   │   ├── schemas/       # Pydantic схемы
│   │   ├── services/      # Бизнес-логика
│   │   └── utils/         # Утилиты (PDF, email и др.)
│   ├── alembic/           # Миграции БД
│   ├── scripts/           # Скрипты для начальных данных
│   ├── storage/           # Хранилище PDF и подписей
│   ├── tests/             # Тесты
│   └── requirements.txt
├── frontend/              # Next.js приложение
│   ├── app/               # App Router (маршруты)
│   ├── components/        # React компоненты (UI)
│   ├── contexts/          # Контексты (Auth и др.)
│   ├── lib/               # API клиент, утилиты
│   ├── package.json
│   ├── tailwind.config.ts
│   └── ...
├── docker-compose.yml     # Docker Compose (PostgreSQL, backend, frontend)
├── .env.example           # Пример переменных окружения
└── README.md
```

## Требования

- Docker и Docker Compose (рекомендуемый способ)
- Или локально: Python 3.11+, Node.js 18+, PostgreSQL 15+

## Быстрый старт (Docker)

### 1. Клонируйте репозиторий

```bash
git clone <repository-url>
cd acts-management-system
```

### 2. Настройте переменные окружения

```bash
# Backend
cp backend/.env.example backend/.env

# Frontend
cp frontend/.env.example frontend/.env.local
```

При необходимости отредактируйте `.env` файлы (пароли, порты и т.д.)

### 3. Запустите контейнеры

```bash
docker-compose up -d
```

Будут запущены:
- PostgreSQL на порту 5432
- Backend API на http://localhost:8000
- Frontend на http://localhost:3000

### 4. Примените миграции и загрузите начальные данные

```bash
docker-compose exec backend alembic upgrade head
docker-compose exec backend python scripts/seed_admin.py
docker-compose exec backend python scripts/seed_templates.py
```

### 5. Откройте приложение в браузере

http://localhost:3000

**Учётные данные по умолчанию:**
- Email: `admin@example.com`
- Пароль: `admin123`

## Локальная разработка

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # или venv\Scripts\activate на Windows
pip install -r requirements.txt

# Настройте .env
cp .env.example .env

# Запустите миграции
alembic upgrade head

# Добавьте тестовые данные
python scripts/seed_admin.py
python scripts/seed_templates.py

# Запустите сервер
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install

# Настройте .env.local
cp .env.example .env.local

npm run dev
```

Теперь фронтенд доступен на http://localhost:3000, а API — на http://localhost:8000.

## API Документация

После запуска бэкенда документация доступна по адресам:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### Основные API endpoints

#### Авторизация
- `POST /api/auth/login` — вход
- `GET /api/auth/me` — информация о текущем пользователе

#### Акты
- `GET /api/acts` — список актов (фильтры, пагинация)
- `POST /api/acts` — создать акт
- `GET /api/acts/{id}` — получить акт
- `PATCH /api/acts/{id}` — обновить акт (создаёт новую версию)
- `POST /api/acts/{id}/sign/party1` — подписать стороной 1
- `POST /api/acts/{id}/sign/party2` — подписать стороной 2
- `GET /api/acts/{id}/versions` — история версий
- `GET /api/acts/{id}/download/pdf` — скачать PDF

#### Шаблоны (только для ADMIN)
- `GET /api/templates` — список шаблонов
- `POST /api/templates` — создать шаблон
- `GET /api/templates/{id}` — получить шаблон
- `PATCH /api/templates/{id}` — обновить шаблон

## Модели базы данных

### users
- `id` (UUID) PK
- `email` (unique)
- `full_name`
- `password_hash`
- `role` (ADMIN / STAFF)
- `is_active` (bool)
- `created_at` (timestamptz)

### templates
- `id` (UUID) PK
- `code` (string, например IPAD, GENERIC)
- `name`
- `description` (optional)
- `schema_json` (JSONB)
- `is_active` (bool)
- `created_at` (timestamptz)

### acts
- `id` (UUID) PK
- `template_id` (FK -> templates.id)
- `party1_name`
- `party2_name`
- `issue_date` (date)
- `item_name`
- `receiver_email`
- `status` (enum: DRAFT, SIGNED_PARTY1, SIGNED_PARTY2, COMPLETED)
- `current_version` (integer)
- `created_by` (FK -> users.id)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

### act_versions
- `id` (UUID) PK
- `act_id` (FK -> acts.id)
- `version_number` (integer)
- `data_json` (JSONB)
- `pdf_file_id` (FK -> file_assets.id, nullable)
- `change_note` (text, optional)
- `created_by` (FK -> users.id)
- `created_at` (timestamptz)

### file_assets
- `id` (UUID) PK
- `act_id` (FK -> acts.id, nullable)
- `kind` (PDF, SIGNATURE_PARTY1, SIGNATURE_PARTY2)
- `storage_path` (string)
- `mime_type`
- `size_bytes` (integer)
- `sha256` (string, optional)
- `created_at` (timestamptz)

### audit_log
- `id` (UUID) PK
- `user_id` (FK -> users.id, nullable)
- `entity_type` (string)
- `entity_id` (UUID)
- `action` (string)
- `metadata_json` (JSONB, nullable)
- `created_at` (timestamptz)

## Особенности

- **JWT авторизация** — все endpoints защищены, кроме логина
- **Версионирование актов** — каждое изменение создаёт новую версию
- **PDF генерация** — автоматическая при создании/обновлении акта
- **Подписи** — поддержка canvas и загрузки PNG
- **Email уведомления** — отправка получателю при создании акта
- **Аудит** — логирование всех действий пользователей
- **Tailwind CSS** — стилизация фронтенда
- **Next.js App Router** — современный подход к маршрутизации

## Переменные окружения

### Backend (.env)
```
DATABASE_URL=postgresql://user:pass@db:5432/acts_db
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
CORS_ORIGINS=["http://localhost:3000"]
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
SMTP_TLS=true
STORAGE_PATH=./storage
```

### Frontend (.env.local)
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Разработка

### Добавление новой миграции (backend)
```bash
cd backend
alembic revision --autogenerate -m "описание"
alembic upgrade head
```

### Добавление новой страницы (frontend)
Создайте папку в `frontend/app/` с файлом `page.tsx`. Для динамических маршрутов используйте `[param]`.

## Лицензия

MIT
