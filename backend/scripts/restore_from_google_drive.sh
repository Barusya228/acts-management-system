#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd -- "$SCRIPT_DIR/../.." && pwd)}"
BACKUP_CONFIG="${SYSTEM_BACKUP_CONFIG:-$PROJECT_ROOT/ops/backup/backup.env}"

if [[ -f "$BACKUP_CONFIG" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$BACKUP_CONFIG"
  set +a
fi

COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-acts_v3}"
PDF_BACKUP_HOST_PATH="${PDF_BACKUP_HOST_PATH:-$PROJECT_ROOT/backend/pdf-backups}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"
requested_bundle="${1:-latest}"

if [[ "$PDF_BACKUP_HOST_PATH" != /* ]]; then
  PDF_BACKUP_HOST_PATH="$PROJECT_ROOT/$PDF_BACKUP_HOST_PATH"
fi
export PDF_BACKUP_HOST_PATH

[[ "${CONFIRM_RESTORE:-}" == "YES" ]] || {
  echo "Restore is destructive. Run with CONFIRM_RESTORE=YES" >&2
  exit 1
}
[[ -n "$RCLONE_REMOTE" ]] || { echo "RCLONE_REMOTE is required" >&2; exit 1; }
command -v rclone >/dev/null || { echo "rclone is required" >&2; exit 1; }

remote_system="${RCLONE_REMOTE%/}/system"
if [[ "$requested_bundle" == "latest" ]]; then
  bundle_id=""
  while IFS= read -r candidate; do
    candidate="${candidate%/}"
    if rclone lsf "$remote_system/$candidate" --files-only --include 'REMOTE_COMPLETE' | grep -q '^REMOTE_COMPLETE$'; then
      bundle_id="$candidate"
      break
    fi
  done < <(rclone lsf "$remote_system" --dirs-only | sort -r)
else
  bundle_id="$requested_bundle"
fi
[[ "$bundle_id" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z_[0-9a-fA-F-]{36}$ ]] || {
  echo "Invalid or missing backup bundle: $bundle_id" >&2
  exit 1
}

remote_bundle="$remote_system/$bundle_id"
rclone lsf "$remote_bundle" --files-only --include 'REMOTE_COMPLETE' | grep -q '^REMOTE_COMPLETE$' || {
  echo "Remote backup is incomplete: $bundle_id" >&2
  exit 1
}

mkdir -p "$PDF_BACKUP_HOST_PATH/system"
temp_dir="$PDF_BACKUP_HOST_PATH/system/.restore-$bundle_id"
final_dir="$PDF_BACKUP_HOST_PATH/system/$bundle_id"
rm -rf "$temp_dir"
mkdir "$temp_dir"
trap 'rm -rf "$temp_dir"' EXIT
rclone copy "$remote_bundle" "$temp_dir"
(
  cd "$temp_dir"
  sha256sum -c SHA256SUMS
)
pg_restore --list "$temp_dir/database.dump" >/dev/null
tar -tzf "$temp_dir/storage.tar.gz" >/dev/null
rm -rf "$final_dir"
mv "$temp_dir" "$final_dir"
trap - EXIT

cd "$PROJECT_ROOT"
echo "Stopping application services before restore..."
docker compose -p "$COMPOSE_PROJECT_NAME" stop backend email-worker
echo "Restoring bundle $bundle_id..."
docker compose -p "$COMPOSE_PROJECT_NAME" run --rm --no-deps \
  -e CONFIRM_RESTORE=YES backend \
  sh scripts/restore_system.sh "/app/pdf-backups/system/$bundle_id"
docker compose -p "$COMPOSE_PROJECT_NAME" run --rm --no-deps backend alembic upgrade head
docker compose -p "$COMPOSE_PROJECT_NAME" up -d backend email-worker

for _attempt in $(seq 1 30); do
  if curl --fail --silent http://localhost:5000/health >/dev/null; then
    echo "Restore completed and health check passed: $bundle_id"
    exit 0
  fi
  sleep 2
done
echo "Restore completed, but health check failed. Inspect backend logs." >&2
exit 1
