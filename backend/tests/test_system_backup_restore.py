import os
import subprocess
from pathlib import Path

import pytest
from sqlalchemy import text

from app.core.database import engine


pytestmark = pytest.mark.skipif(
    "acts_test" not in os.environ.get("DATABASE_URL", ""),
    reason="requires the isolated PostgreSQL test database",
)


def test_full_database_and_storage_backup_can_be_restored(tmp_path):
    backup_root = tmp_path / "backups"
    storage_root = tmp_path / "storage"
    backup_root.mkdir()
    storage_root.mkdir()
    (backup_root / ".acts-pdf-backup-target").touch()
    (storage_root / "restore-probe.txt").write_text("restored-file", encoding="utf-8")

    with engine.begin() as connection:
        connection.execute(text("DROP TABLE IF EXISTS restore_probe"))
        connection.execute(text("CREATE TABLE restore_probe(value text NOT NULL)"))
        connection.execute(text("INSERT INTO restore_probe(value) VALUES ('restored-db')"))

    environment = {
        **os.environ,
        "PDF_BACKUP_PATH": str(backup_root),
        "STORAGE_PATH": str(storage_root),
    }
    result = subprocess.run(
        ["sh", "scripts/backup_system.sh"],
        check=True,
        capture_output=True,
        text=True,
        env=environment,
    )
    bundle = Path(result.stdout.strip().splitlines()[-1])
    assert (bundle / "database.dump").is_file()
    assert (bundle / "storage.tar.gz").is_file()
    assert (bundle / "manifest.json").is_file()
    assert (bundle / "SHA256SUMS").is_file()

    with engine.begin() as connection:
        connection.execute(text("DROP TABLE restore_probe"))
    (storage_root / "restore-probe.txt").unlink()

    subprocess.run(
        ["sh", "scripts/restore_system.sh", str(bundle)],
        check=True,
        capture_output=True,
        text=True,
        env={**environment, "CONFIRM_RESTORE": "YES"},
    )

    with engine.connect() as connection:
        assert connection.execute(text("SELECT value FROM restore_probe")).scalar_one() == "restored-db"
    assert (storage_root / "restore-probe.txt").read_text(encoding="utf-8") == "restored-file"
