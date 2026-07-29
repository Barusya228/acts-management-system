from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

from app.services import pdf_backup_service


class EmptyQuery:
    def filter(self, *_args):
        return self

    def first(self):
        return None


class FakeDb:
    def __init__(self):
        self.added = []

    def query(self, _model):
        return EmptyQuery()

    def add(self, value):
        self.added.append(value)

    def flush(self):
        pass


def test_pdf_backup_is_copied_and_verified(tmp_path, monkeypatch):
    source = tmp_path / "source.pdf"
    source.write_bytes(b"%PDF-1.4 test")
    backup_root = tmp_path / "backups"
    backup_root.mkdir()
    (backup_root / pdf_backup_service.BACKUP_TARGET_MARKER).touch()
    monkeypatch.setattr(pdf_backup_service.settings, "PDF_BACKUP_ENABLED", True)
    monkeypatch.setattr(pdf_backup_service.settings, "PDF_BACKUP_PATH", str(backup_root))
    monkeypatch.setattr(pdf_backup_service, "resolve_storage_path", lambda _path: source)

    act = SimpleNamespace(id=uuid4())
    version = SimpleNamespace(version_number=3)
    asset = SimpleNamespace(
        id=uuid4(),
        storage_path="acts/example/act_v3.pdf",
        sha256=pdf_backup_service._file_sha256(source),
    )
    db = FakeDb()

    record = pdf_backup_service.backup_pdf_asset(db, act, version, asset)

    assert record.status == pdf_backup_service.BACKUP_STATUS_SUCCESS
    assert record.size_bytes == source.stat().st_size
    assert (backup_root / Path(record.backup_path)).read_bytes() == source.read_bytes()
