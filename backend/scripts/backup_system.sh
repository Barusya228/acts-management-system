#!/bin/sh
set -eu

BACKUP_ROOT="${PDF_BACKUP_PATH:-/app/pdf-backups}"
STORAGE_ROOT="${STORAGE_PATH:-/app/storage}"
MARKER="$BACKUP_ROOT/.acts-pdf-backup-target"

if [ ! -f "$MARKER" ]; then
  echo "Backup target is unavailable: $MARKER is missing" >&2
  exit 1
fi

mkdir -p "$BACKUP_ROOT/system"
STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
BUNDLE_ID="$(cat /proc/sys/kernel/random/uuid)"
FINAL_DIR="$BACKUP_ROOT/system/${STAMP}_${BUNDLE_ID}"
TEMP_DIR="$BACKUP_ROOT/system/.partial-${BUNDLE_ID}"
mkdir "$TEMP_DIR"
trap 'rm -rf "$TEMP_DIR"' EXIT

pg_dump --format=custom --no-owner --no-acl --file="$TEMP_DIR/database.dump" "$DATABASE_URL"
tar -C "$STORAGE_ROOT" -czf "$TEMP_DIR/storage.tar.gz" .
pg_restore --list "$TEMP_DIR/database.dump" >/dev/null
tar -tzf "$TEMP_DIR/storage.tar.gz" >/dev/null

DB_SIZE="$(stat -c %s "$TEMP_DIR/database.dump")"
STORAGE_SIZE="$(stat -c %s "$TEMP_DIR/storage.tar.gz")"
FILE_COUNT="$(find "$STORAGE_ROOT" -type f | wc -l)"
cat > "$TEMP_DIR/manifest.json" <<EOF
{
  "created_at": "$STAMP",
  "bundle_id": "$BUNDLE_ID",
  "database_bytes": $DB_SIZE,
  "storage_bytes": $STORAGE_SIZE,
  "storage_files": $FILE_COUNT
}
EOF

(
  cd "$TEMP_DIR"
  sha256sum database.dump storage.tar.gz manifest.json > SHA256SUMS
  sha256sum -c SHA256SUMS
)

mv "$TEMP_DIR" "$FINAL_DIR"
trap - EXIT
echo "$FINAL_DIR"
