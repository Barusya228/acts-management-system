# Full system backup to Google Drive

This backup is separate from per-act PDF copies. Each completed bundle contains:

- a full PostgreSQL custom-format dump of `acts_db`;
- all files from `backend/storage` (PDFs, signatures, and appendices);
- a manifest with PostgreSQL and Alembic versions;
- SHA-256 checksums;
- `REMOTE_COMPLETE`, uploaded only after remote verification succeeds.

Google Drive must be accessed through an encrypted `rclone crypt` remote because the backup contains personal data and signatures.

## 1. Install host tools

On Fedora:

```bash
sudo dnf install -y rclone util-linux
```

`docker`, `curl`, `sha256sum`, and the production Compose project must also be available.

## 2. Configure encrypted Google Drive

Run:

```bash
rclone config
```

Create two remotes:

1. `gdrive` with type `drive` and authenticate the dedicated Google account.
2. `gdrive-crypt` with type `crypt` and remote path:

```text
gdrive:ActsManagementEncrypted
```

Use encrypted file names and encrypted directory names. Store both crypt passwords in the organisation password manager. Losing those passwords makes the backup unrecoverable.

Verify:

```bash
rclone mkdir gdrive-crypt:acts-management-system-backups
rclone lsd gdrive-crypt:
```

## 3. Configure the project

```bash
cd ~/acts-management-system
cp ops/backup/backup.env.example ops/backup/backup.env
nano ops/backup/backup.env
chmod 600 ops/backup/backup.env
mkdir -p backend/pdf-backups
touch backend/pdf-backups/.acts-pdf-backup-target
chmod +x backend/scripts/backup_to_google_drive.sh
chmod +x backend/scripts/restore_from_google_drive.sh
```

`PDF_BACKUP_HOST_PATH` in `ops/backup/backup.env` must be the same directory mounted by production `docker-compose.yml`.

## 4. Run and verify one backup manually

```bash
cd ~/acts-management-system
./backend/scripts/backup_to_google_drive.sh
cat backend/pdf-backups/system/last-backup-status.json
rclone lsd gdrive-crypt:acts-management-system-backups/system
```

The command fails unless the local checksums and remote `rclone check` both pass.

## 5. Install the user systemd timer

```bash
mkdir -p ~/.config/systemd/user
cp ops/backup/acts-system-backup.service ~/.config/systemd/user/
cp ops/backup/acts-system-backup.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now acts-system-backup.timer
sudo loginctl enable-linger "$USER"
```

Check the schedule and logs:

```bash
systemctl --user list-timers acts-system-backup.timer
journalctl --user -u acts-system-backup.service -n 100 --no-pager
```

Run an immediate backup through systemd:

```bash
systemctl --user start acts-system-backup.service
```

## 6. Restore

Restore is intentionally destructive and requires explicit confirmation.

Latest verified backup:

```bash
cd ~/acts-management-system
CONFIRM_RESTORE=YES ./backend/scripts/restore_from_google_drive.sh latest
```

Specific bundle:

```bash
CONFIRM_RESTORE=YES ./backend/scripts/restore_from_google_drive.sh \
  2026-08-04T020000Z_00000000-0000-0000-0000-000000000000
```

The restore script:

1. requires the remote completion marker;
2. downloads and verifies checksums;
3. stops backend and email worker;
4. restores PostgreSQL and storage;
5. applies newer Alembic migrations;
6. starts services and checks `/health`.

If restore fails, application services remain stopped so a partially restored database is not served. Inspect the error before starting them manually.

## Recovery policy

Defaults:

- local bundles: 7 days;
- encrypted Google Drive bundles: 90 days;
- schedule: daily around 02:00, with up to 10 minutes random delay.

Create an additional manual backup before every production deployment. Perform a restore drill into an isolated environment at least once per month.
