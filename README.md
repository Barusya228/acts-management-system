# Acts Digitalization System

Веб-приложение для цифровизации актов выдачи техники. Монорепозиторий с backend на FastAPI и frontend на React + Vite.

## Структура проекта

```
acts-digitalization/
├── backend/              # FastAPI приложение
│   ├── app/
│   │   ├── api/         # API роуты
│   │   ├── core/        # Конфигурация, безопасность, БД
│   │   ├── db/          # Модели БД
│   │   ├── schemas/     # Pydantic схемы
│   │   ├── services/    # Бизнес-логика
│   │   └── utils/       # Утилиты
│   ├── alembic/         # Миграции БД
│   ├── scripts/         # Скрипты для seed данных
│   ├── storage/         # Хранилище PDF и подписей
│   └── tests/           # Тесты
├── frontend/            # React + Vite приложение
│   └── src/
│       ├── components/  # React компоненты
│       ├── contexts/    # React контексты
│       ├── pages/       # Страницы
│       └── services/    # API клиент
├── docker-compose.yml   # Docker Compose конфигурация
└── README.md
```

## Требования

- Docker и Docker Compose
- Или локально: Python 3.11+, Node.js 18+, PostgreSQL 15+

## Быстрый старт

### 1. Клонирование и настройка

```bash
git clone <repository-url>
cd acts-digitalization
```

### 2. Настройка переменных окружения

Скопируйте `.env.example` в `.env` и при необходимости измените значения:

```bash
cp .env.example .env
```

### 3. Запуск через Docker Compose

```bash
docker-compose up -d
```

Это запустит:
- PostgreSQL на порту 5432
- Backend API на http://localhost:8000
- Frontend на http://localhost:5173

### 4. Инициализация базы данных

```bash
# Запуск миграций
docker-compose exec backend alembic upgrade head

# Создание админа
docker-compose exec backend python scripts/seed_admin.py

# Создание шаблонов
docker-compose exec backend python scripts/seed_templates.py
```

### 5. Доступ к приложению

Откройте браузер: http://localhost:5173

**Учетные данные по умолчанию:**
- Email: `admin@acts.local`
- Password: `admin123`

## Локальная разработка

### Backend

```bash
cd backend

# Создание виртуального окружения
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Установка зависимостей
pip install -r requirements.txt

# Настройка .env файла
# DATABASE_URL=postgresql://acts_user:acts_password@localhost:5432/acts_db
# SECRET_KEY=your-secret-key

# Запуск миграций
alembic upgrade head

# Seed данные
python scripts/seed_admin.py
python scripts/seed_templates.py

# Запуск сервера
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend

# Установка зависимостей
npm install

# Настройка .env файла (опционально)
# VITE_API_URL=http://localhost:8000

# Запуск dev сервера
npm run dev
```

## API Документация

После запуска backend, документация доступна по адресам:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Основные API endpoints

### Авторизация
- `POST /api/auth/login` - Вход
- `GET /api/auth/me` - Текущий пользователь

### Акты
- `GET /api/acts` - Список актов (с фильтрами и пагинацией)
- `POST /api/acts` - Создать акт
- `GET /api/acts/{id}` - Получить акт
- `PATCH /api/acts/{id}` - Обновить акт (создает новую версию)
- `POST /api/acts/{id}/sign/party1` - Подписать стороной 1
- `POST /api/acts/{id}/sign/party2` - Подписать стороной 2
- `GET /api/acts/{id}/versions` - История версий
- `GET /api/acts/{id}/download/pdf` - Скачать PDF

### Шаблоны (только для ADMIN)
- `GET /api/templates` - Список шаблонов
- `POST /api/templates` - Создать шаблон
- `GET /api/templates/{id}` - Получить шаблон
- `PATCH /api/templates/{id}` - Обновить шаблон

## Модели базы данных

### users
- id (UUID)
- email (unique)
- full_name
- password_hash
- role (ADMIN/STAFF)
- is_active
- created_at

### templates
- id (UUID)
- code (IPAD/GENERIC)
- name
- description
- schema_json (JSONB)
- is_active
- created_at

### acts
- id (UUID)
- template_id (FK)
- party1_name
- party2_name
- issue_date
- item_name
- receiver_email
- status (DRAFT/SIGNED_PARTY1/SIGNED_PARTY2/COMPLETED)
- current_version
- created_by (FK)
- created_at
- updated_at

### act_versions
- id (UUID)
- act_id (FK)
- version_number
- data_json (JSONB)
- pdf_file_id (FK, nullable)
- change_note
- created_by (FK)
- created_at

### file_assets
- id (UUID)
- act_id (FK, nullable)
- kind (PDF/SIGNATURE_PARTY1/SIGNATURE_PARTY2)
- storage_path
- mime_type
- size_bytes
- sha256 (nullable)
- created_at

### audit_log
- id (UUID)
- user_id (FK, nullable)
- entity_type
- entity_id (UUID)
- action
- metadata_json (JSONB, nullable)
- created_at

## Тестирование

### Backend тесты

```bash
cd backend
pytest
```

### Frontend тесты

```bash
cd frontend
npm test
```

## Особенности

- **JWT авторизация** - защита всех endpoints кроме login
- **Версионирование актов** - каждое изменение создает новую версию
- **PDF генерация** - автоматическая генерация PDF при создании/обновлении акта
- **Подписи** - поддержка canvas подписи и загрузки PNG изображений
- **Email уведомления** - отправка email получателю при создании акта (опционально, можно в режиме логирования)
- **Аудит** - логирование всех действий пользователей

## Структура storage

Файлы хранятся в `backend/storage/`:
- PDF файлы: `{uuid}.pdf`
- Подписи: `{act_id}_{party}_{uuid}.png`

## Переменные окружения

### Backend
- `DATABASE_URL` - URL подключения к PostgreSQL
- `SECRET_KEY` - Секретный ключ для JWT (минимум 32 символа)
- `ALGORITHM` - Алгоритм JWT (по умолчанию HS256)
- `ACCESS_TOKEN_EXPIRE_MINUTES` - Время жизни токена (по умолчанию 30)
- `SMTP_HOST` - SMTP сервер (опционально, если пусто - режим логирования)
- `SMTP_PORT` - Порт SMTP (по умолчанию 587)
- `SMTP_USER` - Пользователь SMTP
- `SMTP_PASSWORD` - Пароль SMTP
- `SMTP_FROM` - Email отправителя
- `SMTP_TLS` - Использовать TLS (true/false)

### Frontend
- `VITE_API_URL` - URL backend API (по умолчанию http://localhost:8000)

## Разработка

### Создание новой миграции

```bash
cd backend
alembic revision --autogenerate -m "Description"
alembic upgrade head
```

### Добавление нового endpoint

1. Создать схему в `app/schemas/`
2. Создать сервис в `app/services/`
3. Создать роут в `app/api/v1/endpoints/`
4. Зарегистрировать роут в `app/api/v1/api.py`

## Лицензия

MIT
