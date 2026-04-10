# Система цифровизации актов техники

Веб-приложение для цифровизации актов выдачи и возврата техники.

Репозиторий организован как монорепозиторий:

- `backend/` - FastAPI + SQLAlchemy + Alembic + PostgreSQL
- `frontend/` - Next.js 15 + TypeScript + Tailwind CSS
- `docker-compose.yml` - локальный запуск всей системы через Docker

Этот `README.md` теперь является единой актуальной документацией по проекту. Отдельные `frontend/README.md` и `frontend/SETUP.md` убраны, чтобы не дублировать и не рассинхронизировать инструкции.

## Что умеет система

- создавать акты выдачи техники по шаблонам
- работать с одним или несколькими получателями в одном акте
- собирать подписи получателей по очереди
- завершать выдачу финальной подписью передающей стороны
- запускать отдельный процесс возврата техники
- хранить историю версий акта и PDF для каждой версии
- просматривать и скачивать PDF текущей и прошлых версий
- отправлять email-уведомления и письма с PDF при завершении шагов
- вести справочник участников: IT-менеджеры и сотрудники
- показывать аналитику по статусам, выдачам, возвратам и получателям
- показывать акты, которые долго ждут подписи, и отправлять напоминания

## Структура проекта

```text
acts-management-system/
|-- backend/
|   |-- app/
|   |   |-- api/              # auth, acts, templates, participants, reminders, analytics
|   |   |-- core/             # config, security, database, deps
|   |   |-- db/               # SQLAlchemy модели
|   |   |-- schemas/          # Pydantic схемы
|   |   |-- services/         # PDF и email сервисы
|   |   `-- utils/            # storage и вспомогательные утилиты
|   |-- alembic/              # миграции
|   |-- scripts/              # seed и сервисные скрипты backend
|   |-- tests/                # pytest тесты backend
|   |-- Dockerfile
|   `-- requirements.txt
|-- frontend/
|   |-- app/                  # App Router страницы
|   |-- components/           # UI, формы, подписи, layout
|   |-- contexts/             # auth и toast контексты
|   |-- lib/                  # API клиент и вспомогательная логика
|   |-- Dockerfile
|   `-- package.json
|-- docker-compose.yml
`-- README.md
```

## Роли и доступ

- `ADMIN` - полный доступ к актам, шаблонам, участникам, аналитике и напоминаниям
- `GUEST` - доступ к просмотру актов, созданию, подписанию и работе с PDF без доступа к административным разделам

Seed-скрипт backend создаёт таких пользователей:

- `admin` / `qwerty`
- гостевой вход без логина и пароля через кнопку на странице `/login`

В базе также создаётся отдельный гостевой пользователь:

- `guest@example.com` / `guest123`

Он используется backend-эндпоинтом `POST /api/auth/guest-login`.

## Жизненный цикл акта

Статусы акта:

- `DRAFT`
- `SIGNED_PARTY1`
- `SIGNED_PARTY2`
- `COMPLETED`
- `RETURN_INITIATED`
- `RETURN_SIGNED_PARTY1`
- `RETURN_SIGNED_PARTY2`
- `RETURNED`

Типовой сценарий выдачи:

1. Создать акт.
2. Получатели подписывают акт по очереди.
3. После подписей получателей передающая сторона ставит финальную подпись.
4. Акт получает статус `COMPLETED`, и формируется финальный PDF.

Типовой сценарий возврата:

1. Для завершённого акта запустить возврат.
2. Сторона 1 подтверждает возврат.
3. Получатели по очереди подписывают возврат.
4. Акт получает статус `RETURNED`, и формируется PDF возврата.

## Технологии

Backend:

- FastAPI
- SQLAlchemy 2
- Alembic
- PostgreSQL 15
- ReportLab
- Pillow
- aiosmtplib
- pytest

Frontend:

- Next.js 15
- React 18
- TypeScript
- Tailwind CSS
- Axios
- react-signature-canvas

## Frontend

Frontend находится в `frontend/` и работает как клиент к FastAPI backend.

Что есть во frontend:

- авторизация администратора по логину и паролю
- гостевой вход одной кнопкой
- список актов с фильтрами
- создание и редактирование актов
- выбор участников из справочника
- работа с несколькими получателями
- рисование и загрузка подписи
- просмотр акта, версий и PDF
- запуск возврата техники
- административные страницы участников, шаблонов, аналитики и напоминаний

Ключевые директории frontend:

- `frontend/app/` - страницы App Router
- `frontend/components/` - layout, формы, таблицы, подписи, UI-примитивы
- `frontend/contexts/` - `AuthContext` и `ToastContext`
- `frontend/lib/` - Axios-клиент и вспомогательная логика для актов
- `frontend/types/` - локальные TypeScript-описания

## Требования

Основной сценарий:

- Docker
- Docker Compose

Для локального запуска без Docker:

- Python 3.11+
- Node.js 18+
- PostgreSQL 15+

## Быстрый старт через Docker

1. Клонируйте репозиторий:

```bash
git clone <repository-url>
cd acts-management-system
```

2. При необходимости создайте файл `.env` в корне проекта и задайте переменные для compose, например:

```env
SECRET_KEY=change-me
APP_BASE_URL=http://localhost:8000
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Если файл не создать, `docker-compose.yml` использует встроенные значения по умолчанию.

3. Запустите сервисы:

```bash
docker compose up --build -d
```

4. Примените миграции и заполните начальные данные:

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend python scripts/seed_admin.py
docker compose exec backend python scripts/seed_templates.py
docker compose exec backend python scripts/seed_employees.py
```

5. Откройте приложение:

- frontend: `http://localhost:3000`
- backend API: `http://localhost:8000`
- Swagger UI: `http://localhost:8000/docs`
- healthcheck: `http://localhost:8000/health`

## Локальная разработка без Docker

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

Windows:

```bat
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
alembic upgrade head
python scripts\seed_admin.py
python scripts\seed_templates.py
python scripts\seed_employees.py
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Windows:

```bat
cd frontend
copy .env.example .env.local
npm install
npm run dev
```

Дополнительные команды frontend:

```bash
cd frontend
npm run build
npm run start
npm run lint
```

## Переменные окружения

### Backend `backend/.env`

```env
DATABASE_URL=postgresql://user:password@localhost:5432/acts_db
SECRET_KEY=your-secret-key-here-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
CORS_ORIGINS=["http://localhost:3000"]
CORS_ORIGIN_REGEX=^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
SMTP_TLS=true
STORAGE_PATH=./storage
APP_BASE_URL=http://localhost:8000
```

Если SMTP-переменные оставить пустыми, отправка email фактически будет отключена.

### Frontend `frontend/.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Если переменная не задана, frontend пытается обращаться к `http://<текущий-host>:8000`.

## Основные страницы frontend

- `/login` - вход администратора и гостевой вход
- `/` - список актов для администратора
- `/guest` - список актов в гостевом режиме
- `/acts/create` - создание акта
- `/acts/[id]` - просмотр акта, подписи, PDF, версии, возврат
- `/participants` - справочник участников, только `ADMIN`
- `/templates` - управление шаблонами, только `ADMIN`
- `/analytics` - аналитика по актам, только `ADMIN`
- `/reminders` - напоминания по неподписанным актам, только `ADMIN`

## Основные API endpoints

### Auth

- `POST /api/auth/login` - вход по `username` и паролю
- `POST /api/auth/guest-login` - гостевой вход
- `GET /api/auth/me` - текущий пользователь

### Acts

- `GET /api/acts` - список актов с фильтрами и пагинацией
- `POST /api/acts` - создать акт
- `GET /api/acts/{id}` - получить акт
- `DELETE /api/acts/{id}` - удалить акт
- `POST /api/acts/{id}/sign/party1` - подпись стороны 1
- `POST /api/acts/{id}/sign/party2` - подпись стороны 2 или очередного получателя
- `GET /api/acts/{id}/versions` - история версий
- `POST /api/acts/{id}/return` - запустить возврат техники
- `GET /api/acts/{id}/download/pdf` - скачать последний PDF
- `GET /api/acts/{id}/preview/pdf` - открыть последний PDF inline
- `GET /api/acts/{id}/versions/{version_number}/download/pdf` - скачать PDF конкретной версии
- `POST /api/acts/{id}/send-notification` - отправить уведомление получателям

### Templates

- `GET /api/templates` - список шаблонов
- `POST /api/templates` - создать шаблон, только `ADMIN`
- `GET /api/templates/{id}` - получить шаблон
- `PATCH /api/templates/{id}` - обновить шаблон, только `ADMIN`

### Participants

- `GET /api/participants` - список участников
- `POST /api/participants` - создать участника, только `ADMIN`
- `PATCH /api/participants/{participant_id}` - обновить участника, только `ADMIN`
- `DELETE /api/participants/{participant_id}` - удалить участника, только `ADMIN`
- `POST /api/participants/bulk` - массовое добавление участников, только `ADMIN`

### Analytics

- `GET /api/analytics/overview` - общая статистика
- `GET /api/analytics/monthly-stats` - выдача и возврат по месяцам
- `GET /api/analytics/top-recipients` - топ получателей
- `GET /api/analytics/status-distribution` - распределение актов по статусам

### Reminders

- `GET /api/reminders/pending-acts` - акты, которые долго ждут подписи
- `POST /api/reminders/send-reminder/{act_id}` - отправить напоминание по акту

## Модель данных верхнего уровня

### users

- `username`
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
- `pdf_version`
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
- `issue_completion_email_sent`
- `return_completion_email_sent`
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

### audit_log

- `user_id`
- `entity_type`
- `entity_id`
- `action`
- `metadata_json`

## Шаблоны и данные по умолчанию

После запуска seed-скриптов проект получает:

- администратора `admin / qwerty`
- гостевого пользователя для `guest-login`
- шаблоны `GENERIC_ONE`, `GENERIC_MULTI`, `GENERIC`, `IPAD`
- справочник сотрудников из `backend/scripts/seed_employees.py`

Шаблоны поддерживают динамические поля через `schema_json.fields`, а также служебные структуры в `extra_data_json`:

- `recipients` - список получателей с независимыми подписями
- `equipment_list` - список техники в одном акте

## Полезные команды

Применить миграции:

```bash
docker compose exec backend alembic upgrade head
```

Создать миграцию локально:

```bash
cd backend
alembic revision --autogenerate -m "describe change"
```

Запустить backend-тесты:

```bash
cd backend
pytest
```

Очистить базу служебным скриптом:

```bash
cd backend
python scripts/clear_database.py
```

Остановить контейнеры:

```bash
docker compose down
```

Остановить контейнеры и удалить volume базы:

```bash
docker compose down -v
```

## Примечания

- PDF, подписи и другие файлы сохраняются в `backend/storage/`
- backend поднимает роуты `auth`, `acts`, `templates`, `participants`, `reminders`, `analytics`
- в backend есть pytest-тесты на валидацию шаблонов и динамических полей
- основной поддерживаемый сценарий запуска для проекта сейчас - Docker Compose
- финальные PDF-письма отправляются автоматически только на статусах `COMPLETED` и `RETURNED`; ручной кнопки отправки нет

## License

MIT
