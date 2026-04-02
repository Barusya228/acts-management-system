# Acts Management System

Веб-приложение для цифровизации актов выдачи и возврата техники.
Монорепозиторий содержит backend на FastAPI и frontend на Next.js (App Router).

## Что умеет система

- создание актов выдачи техники по шаблонам
- подписание акта двумя сторонами
- запуск и подписание процесса возврата техники
- хранение версий акта и PDF для каждой версии
- гостевой вход для подписания без отдельной учётной записи сотрудника
- справочник участников (сотрудники и IT-менеджеры)
- email-уведомления при создании и завершении процессов

## Структура проекта

```text
acts-management-system/
|-- backend/                  # FastAPI, SQLAlchemy, Alembic
|   |-- app/
|   |   |-- api/              # auth, acts, templates, participants
|   |   |-- core/             # config, security, db deps
|   |   |-- db/               # модели БД
|   |   |-- schemas/          # pydantic-схемы
|   |   |-- services/         # PDF и email логика
|   |   `-- utils/            # storage, pdf и др.
|   |-- alembic/              # миграции
|   |-- scripts/              # сиды и сервисные скрипты
|   `-- requirements.txt
|-- frontend/                 # Next.js приложение
|   |-- app/                  # маршруты страниц
|   |-- components/           # UI и формы
|   |-- contexts/             # auth context
|   |-- lib/                  # API клиент и утилиты
|   `-- package.json
|-- scripts/windows/          # bat-скрипты для Windows
|-- docker-compose.yml
`-- README.md
```

## Роли

- `ADMIN` - управление шаблонами, участниками и полным циклом работы
- `GUEST` - ограниченный доступ для просмотра и подписания актов

По умолчанию seed-скрипт создаёт двух пользователей:

- `admin@example.com` / `admin123`
- `guest@example.com` / `guest123`

## Основные статусы акта

- `DRAFT`
- `SIGNED_PARTY2`
- `COMPLETED`
- `RETURN_INITIATED`
- `RETURN_SIGNED_PARTY1`
- `RETURNED`

Типовой сценарий выдачи:

1. Создать акт.
2. Подписать со стороны получателя.
3. Подписать со стороны передающей стороны.
4. Получить финальный PDF и завершённый статус.

Типовой сценарий возврата:

1. Запустить возврат для завершённого акта.
2. Подписать возврат одной стороной.
3. Подписать возврат второй стороной.
4. Получить финальный PDF возврата и статус `RETURNED`.

## Требования

- Docker и Docker Compose для контейнерного запуска
- или локально: Python 3.11+, Node.js 18+, PostgreSQL 15+

## Быстрый старт через Docker

1. Клонируйте репозиторий:

```bash
git clone <repository-url>
cd acts-management-system
```

2. Подготовьте переменные окружения:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

3. Запустите сервисы:

```bash
docker-compose up -d
```

4. Примените миграции и заполните начальные данные:

```bash
docker-compose exec backend alembic upgrade head
docker-compose exec backend python scripts/seed_admin.py
docker-compose exec backend python scripts/seed_templates.py
docker-compose exec backend python scripts/seed_employees.py
```

5. Откройте приложение:

- frontend: `http://localhost:3000`
- backend API: `http://localhost:8000`
- Swagger UI: `http://localhost:8000/docs`

## Локальная разработка

### Windows

Установка зависимостей:

```bat
scripts\windows\backend-install.bat
scripts\windows\frontend-install.bat
```

Первичная настройка базы:

```bat
docker-compose up -d db
cd backend
venv\Scripts\activate
alembic upgrade head
python scripts\seed_admin.py
python scripts\seed_templates.py
python scripts\seed_employees.py
cd ..
```

Запуск backend и frontend:

```bat
scripts\windows\start.bat
```

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
python scripts/seed_admin.py
python scripts/seed_templates.py
python scripts/seed_employees.py
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

## Основные страницы frontend

- `/login` - вход администратора
- `/guest` - гостевой вход
- `/acts/create` - создание акта
- `/acts/[id]` - просмотр акта
- `/acts/[id]/edit` - редактирование акта
- `/templates` - управление шаблонами
- `/participants` - справочник участников

## Основные API endpoints

### Auth

- `POST /api/auth/login` - вход по email и паролю
- `POST /api/auth/guest-login` - вход гостевым пользователем
- `GET /api/auth/me` - текущий пользователь

### Acts

- `GET /api/acts` - список актов с фильтрами и пагинацией
- `POST /api/acts` - создать акт
- `GET /api/acts/{id}` - получить акт
- `PATCH /api/acts/{id}` - обновить акт и создать новую версию
- `DELETE /api/acts/{id}` - удалить акт, только `ADMIN`
- `POST /api/acts/{id}/sign/party1` - подпись первой стороны
- `POST /api/acts/{id}/sign/party2` - подпись второй стороны
- `POST /api/acts/{id}/return` - запустить возврат техники
- `GET /api/acts/{id}/versions` - история версий
- `GET /api/acts/{id}/download/pdf` - скачать последний PDF
- `GET /api/acts/{id}/preview/pdf` - открыть последний PDF inline
- `GET /api/acts/{id}/versions/{version_number}/download/pdf` - скачать PDF конкретной версии

### Templates

- `GET /api/templates` - список шаблонов
- `POST /api/templates` - создать шаблон, только `ADMIN`
- `GET /api/templates/{id}` - получить шаблон
- `PATCH /api/templates/{id}` - обновить шаблон, только `ADMIN`

### Participants

- `GET /api/participants` - список участников
- `POST /api/participants` - создать участника, только `ADMIN`
- `PATCH /api/participants/{participant_id}` - обновить участника, только `ADMIN`
- `POST /api/participants/bulk` - массовое добавление участников, только `ADMIN`

## Модель данных верхнего уровня

### users

- `email`
- `full_name`
- `role` (`ADMIN`, `GUEST`)
- `is_active`

### participants

- `full_name`
- `kind` (`IT_MANAGER`, `EMPLOYEE`)
- `email`
- `department`
- `title`
- `sticker_emoji`
- `is_active`

### templates

- `code`
- `name`
- `description`
- `schema_json`
- `is_active`

### acts

- `template_id`
- `party1_name`
- `party2_name`
- `issue_date`
- `item_name`
- `item_serial`
- `receiver_email`
- `extra_data_json`
- `return_date`
- `return_note`
- `status`
- `current_version`

### act_versions

- снимок данных акта на момент версии
- `change_note`
- ссылка на PDF версии

### file_assets

- `PDF`
- `SIGNATURE_PARTY1`
- `SIGNATURE_PARTY2`
- `RETURN_SIGNATURE_PARTY1`
- `RETURN_SIGNATURE_PARTY2`

## Переменные окружения

### Backend `.env`

```env
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
APP_BASE_URL=http://localhost:8000
```

### Frontend `.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Полезные команды

Создать миграцию:

```bash
cd backend
alembic revision --autogenerate -m "describe change"
```

Применить миграции:

```bash
cd backend
alembic upgrade head
```

Очистить базу служебным скриптом:

```bash
cd backend
python scripts/clear_database.py
```

## Примечания

- PDF и подписи сохраняются в `backend/storage/`
- frontend работает на Next.js 15
- backend подключает роуты `auth`, `acts`, `templates`, `participants`

## License

MIT
