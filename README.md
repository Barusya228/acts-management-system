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

Seed-скрипт backend создаёт администратора из переменных окружения
`ADMIN_USERNAME` и `ADMIN_PASSWORD`. Production-пароль не хранится в репозитории.

В базе также создаётся отдельный гостевой пользователь:

- `guest@example.com` / `guest123`

Он используется как служебный подписант для привязанных устройств (`POST /api/auth/kiosks/enroll`). Открытый гостевой вход отключён: планшет должен быть зарегистрирован администратором в разделе «Устройства».

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

> **Важно:** фронтенд собирается внутрь Docker-образа backend на этапе сборки.
> После любых изменений в `frontend/` обязательно запускайте `docker compose up --build -d` —
> `docker compose up -d` без `--build` поднимет старый образ со старым фронтендом.
> Если контейнеры были созданы под другим именем compose-проекта (см. `docker ps` — label
> `com.docker.compose.project`), используйте тот же проект: `docker compose -p <project> up --build -d`,
> иначе получите второй набор контейнеров с пустой базой.

4. Примените миграции и заполните начальные данные:

```bash
docker compose exec backend alembic upgrade head
docker compose exec \
  -e ADMIN_USERNAME=administrator \
  -e ADMIN_PASSWORD='<strong-password>' \
  backend python scripts/seed_admin.py
docker compose exec backend python scripts/seed_templates.py
docker compose exec backend python scripts/seed_employees.py
```

5. Откройте приложение:

- frontend: `http://localhost:3000`
- backend API: `http://localhost:8000`
- Swagger UI: `http://localhost:8000/docs`
- healthcheck: `http://localhost:8000/health`

## Обновление production-сервера Fedora

Production-сервер доступен по адресу `192.168.23.151`, приложение — на порту `5000`.

Из Windows PowerShell подключитесь к серверу:

```powershell
ssh ruslan_adm@192.168.23.151
```

После входа перейдите в каталог проекта и обновите ветку `version_v3`:

```bash
cd ~/acts-management-system
git pull origin version_v3
```

### 1. Backup перед обновлением

Сделайте дамп production-базы до сборки:

```bash
docker compose -p acts_v3 exec -T db pg_dump -U acts_user -d acts_db -Fc > pre-build-$(date +%Y%m%d-%H%M).dump
```

Убедитесь, что файл дампа создан и не пустой:

```bash
ls -lh pre-build-*.dump
```

### 2. Тестовая сборка

Тесты запускаются в отдельном Compose-проекте и не используют production-базу:

```bash
docker compose -p acts_test -f docker-compose.test.yml down -v
docker compose -p acts_test -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from tests
```

Ожидаемый результат для текущей версии:

```text
69 passed
```

Если тесты завершились успешно, удалите тестовые контейнеры и volume:

```bash
docker compose -p acts_test -f docker-compose.test.yml down -v
```

Не запускайте production build, если тесты завершились с ошибкой.

### 3. Production build

Пересоберите образы и перезапустите сервисы под существующим именем Compose-проекта:

```bash
docker compose -p acts_v3 up -d --build
```

Backend автоматически выполняет `alembic upgrade head` при запуске.

### 4. Проверка после обновления

Проверьте состояние контейнеров и healthcheck:

```bash
docker compose -p acts_v3 ps
curl http://localhost:5000/health
```

Ожидаемый healthcheck:

```json
{"status":"healthy"}
```

Проверьте текущую миграцию:

```bash
docker compose -p acts_v3 exec backend alembic current
```

Ожидаемая head-ревизия для текущей версии:

```text
20260811_0026 (head)
```

Если backend или email-worker не запустились, проверьте логи:

```bash
docker compose -p acts_v3 logs --tail=200 backend
docker compose -p acts_v3 logs --tail=200 email-worker
```

После успешной проверки приложение доступно по адресу:

```text
http://192.168.23.151:5000
```

## Локальная разработка без Docker

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
export ADMIN_USERNAME=administrator
export ADMIN_PASSWORD='<strong-password>'
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
set ADMIN_USERNAME=administrator
set ADMIN_PASSWORD=<strong-password>
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
ACCESS_TOKEN_EXPIRE_MINUTES=1440
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
- `POST /api/auth/kiosks` - создать код привязки устройства (админ)
- `POST /api/auth/kiosks/enroll` - привязать планшет по коду
- `GET /api/auth/kiosks` / `DELETE /api/auth/kiosks/{id}` - список и отзыв устройств (админ)
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

- администратора из `ADMIN_USERNAME` / `ADMIN_PASSWORD`
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
## Full system backup and restore

Final-PDF copies are exports, not disaster-recovery backups. A full bundle contains PostgreSQL and all files from `backend/storage`.

Create a consistent backup during a maintenance window:

```bash
docker compose stop backend email-worker
docker compose run --rm --no-deps backend sh scripts/backup_system.sh
docker compose up -d backend email-worker
```

Restore is destructive. Keep `db` running and stop application processes first:

```bash
docker compose stop backend email-worker
docker compose run --rm --no-deps \
  -e CONFIRM_RESTORE=YES \
  backend sh scripts/restore_system.sh /app/pdf-backups/system/BUNDLE_DIRECTORY
docker compose up -d backend email-worker
```

After restore, verify `/health`, `alembic current`, act lists, PDF downloads, and inventory counts before reopening access.
