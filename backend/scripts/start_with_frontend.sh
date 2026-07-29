#!/bin/sh
set -e

until pg_isready -d "$DATABASE_URL" >/dev/null 2>&1; do
  sleep 2
done

alembic upgrade head

cd /app/frontend
HOSTNAME=127.0.0.1 PORT=3000 node server.js &

cd /app
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
