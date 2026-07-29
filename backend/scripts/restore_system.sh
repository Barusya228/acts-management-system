#!/bin/sh
set -eu

if [ "${CONFIRM_RESTORE:-}" != "YES" ]; then
  echo "Set CONFIRM_RESTORE=YES to perform destructive restore" >&2
  exit 1
fi
if [ "$#" -ne 1 ]; then
  echo "Usage: restore_system.sh /app/pdf-backups/system/BUNDLE" >&2
  exit 1
fi

BUNDLE="$1"
STORAGE_ROOT="${STORAGE_PATH:-/app/storage}"
test -d "$BUNDLE"
(
  cd "$BUNDLE"
  sha256sum -c SHA256SUMS
)
pg_restore --list "$BUNDLE/database.dump" >/dev/null
tar -tzf "$BUNDLE/storage.tar.gz" >/dev/null

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
pg_restore --no-owner --no-acl --dbname="$DATABASE_URL" "$BUNDLE/database.dump"

mkdir -p "$STORAGE_ROOT"
find "$STORAGE_ROOT" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
tar -C "$STORAGE_ROOT" -xzf "$BUNDLE/storage.tar.gz"
echo "Restore completed. Restart backend to apply newer migrations."
