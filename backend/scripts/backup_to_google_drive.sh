#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd -- "$SCRIPT_DIR/../.." && pwd)}"
BACKUP_CONFIG="${SYSTEM_BACKUP_CONFIG:-$PROJECT_ROOT/ops/backup/backup.env}"

if [[ -f "$BACKUP_CONFIG" ]]; then
  # The config is administrator-owned and uses shell-compatible KEY=value lines.
  set -a
  # shellcheck disable=SC1090
  source "$BACKUP_CONFIG"
  set +a
fi

COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-acts_v3}"
PDF_BACKUP_HOST_PATH="${PDF_BACKUP_HOST_PATH:-$PROJECT_ROOT/backend/pdf-backups}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"
LOCAL_RETENTION_DAYS="${LOCAL_RETENTION_DAYS:-7}"
REMOTE_RETENTION_DAYS="${REMOTE_RETENTION_DAYS:-90}"
RCLONE_CHECK_MODE="${RCLONE_CHECK_MODE:-download}"
LOCK_FILE="${SYSTEM_BACKUP_LOCK_FILE:-$PROJECT_ROOT/.system-backup.lock}"

if [[ "$PDF_BACKUP_HOST_PATH" != /* ]]; then
  PDF_BACKUP_HOST_PATH="$PROJECT_ROOT/$PDF_BACKUP_HOST_PATH"
fi
export PDF_BACKUP_HOST_PATH
STATUS_FILE="$PDF_BACKUP_HOST_PATH/system/last-backup-status.json"

write_status() {
  local result="$1"
  local message="$2"
  local bundle="${3:-}"
  mkdir -p "$(dirname -- "$STATUS_FILE")"
  printf '{"updated_at":"%s","status":"%s","bundle":"%s","message":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$result" "$bundle" "${message//\"/\\\"}" > "$STATUS_FILE"
}

on_error() {
  local exit_code=$?
  trap - ERR
  write_status "FAILED" "Backup failed at line $1 with exit code $exit_code"
  exit "$exit_code"
}
trap 'on_error $LINENO' ERR

command -v docker >/dev/null || { echo "docker is required" >&2; exit 1; }
command -v rclone >/dev/null || { echo "rclone is required" >&2; exit 1; }
command -v flock >/dev/null || { echo "flock is required" >&2; exit 1; }
[[ -n "$RCLONE_REMOTE" ]] || { echo "RCLONE_REMOTE is required" >&2; exit 1; }
[[ "$LOCAL_RETENTION_DAYS" =~ ^[0-9]+$ ]] || { echo "LOCAL_RETENTION_DAYS must be numeric" >&2; exit 1; }
[[ "$REMOTE_RETENTION_DAYS" =~ ^[0-9]+$ ]] || { echo "REMOTE_RETENTION_DAYS must be numeric" >&2; exit 1; }
[[ "$RCLONE_CHECK_MODE" == "download" || "$RCLONE_CHECK_MODE" == "size" ]] || { echo "RCLONE_CHECK_MODE must be download or size" >&2; exit 1; }

mkdir -p "$PDF_BACKUP_HOST_PATH/system"
touch "$PDF_BACKUP_HOST_PATH/.acts-pdf-backup-target"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another system backup is already running" >&2
  exit 2
fi

cd "$PROJECT_ROOT"
docker compose -p "$COMPOSE_PROJECT_NAME" ps --status running backend | grep -q backend || {
  echo "Production backend is not running" >&2
  exit 1
}

container_bundle="$(docker compose -p "$COMPOSE_PROJECT_NAME" exec -T backend sh scripts/backup_system.sh | tail -n 1)"
bundle_id="${container_bundle##*/}"
[[ "$bundle_id" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z_[0-9a-fA-F-]{36}$ ]] || {
  echo "Unexpected bundle id: $bundle_id" >&2
  exit 1
}
local_bundle="$PDF_BACKUP_HOST_PATH/system/$bundle_id"
remote_bundle="${RCLONE_REMOTE%/}/system/$bundle_id"
[[ -d "$local_bundle" ]] || { echo "Local bundle is missing: $local_bundle" >&2; exit 1; }

(
  cd "$local_bundle"
  sha256sum -c SHA256SUMS
)
rclone copy "$local_bundle" "$remote_bundle" --create-empty-src-dirs
if [[ "$RCLONE_CHECK_MODE" == "download" ]]; then
  rclone check "$local_bundle" "$remote_bundle" --download --one-way
else
  rclone check "$local_bundle" "$remote_bundle" --size-only --one-way
fi

printf '%s\n' "$bundle_id" > "$local_bundle/REMOTE_COMPLETE"
rclone copyto "$local_bundle/REMOTE_COMPLETE" "$remote_bundle/REMOTE_COMPLETE"
rclone lsf "$remote_bundle" --files-only --include 'REMOTE_COMPLETE' | grep -q '^REMOTE_COMPLETE$'

find "$PDF_BACKUP_HOST_PATH/system" -mindepth 1 -maxdepth 1 -type d \
  ! -name "$bundle_id" -mtime "+$LOCAL_RETENTION_DAYS" -exec rm -rf {} +
rclone delete "${RCLONE_REMOTE%/}/system" --min-age "${REMOTE_RETENTION_DAYS}d"
rclone rmdirs "${RCLONE_REMOTE%/}/system" --leave-root

write_status "SUCCESS" "Local and Google Drive verification completed" "$bundle_id"
echo "Backup completed: $bundle_id"
