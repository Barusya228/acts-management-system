#!/bin/sh
set -e

cd /app/frontend
HOSTNAME=127.0.0.1 PORT=3000 node server.js &

cd /app
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
