from datetime import date
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

from app.services import pdf_backup_service


class EmptyQuery:
    def filter(self, *_args):
        return self

    def first(self):
        return None

    def all(self):
        return []


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

    act = SimpleNamespace(
        id=uuid4(),
        issue_date=date(2026, 7, 29),
        item_serial="NB-001",
        item_name="Ноутбук",
        template=SimpleNamespace(code="GENERIC_ONE"),
    )
    version = SimpleNamespace(version_number=3, data_json={"status": "COMPLETED"})
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
    assert record.backup_path.startswith(f"(2026-2027)/GENERIC_ONE/notebook/{act.id}/")
    assert record.backup_path.endswith("issue_final.pdf")


def test_intermediate_pdf_versions_are_not_backed_up(tmp_path, monkeypatch):
    monkeypatch.setattr(pdf_backup_service.settings, "PDF_BACKUP_ENABLED", True)
    act = SimpleNamespace(id=uuid4())
    version = SimpleNamespace(version_number=2, data_json={"status": "SIGNED_PARTY2"})
    asset = SimpleNamespace(id=uuid4())

    assert pdf_backup_service.backup_pdf_asset(FakeDb(), act, version, asset) is None


def test_returned_version_uses_return_final_filename():
    version = SimpleNamespace(data_json={"status": "RETURNED"})

    assert pdf_backup_service.get_final_backup_stage(version) == "return_final"


def test_backup_path_infers_extension_category_from_item_name():
    act = SimpleNamespace(
        id=uuid4(),
        issue_date=date(2026, 7, 29),
        item_serial=None,
        item_name="Удлинитель 5 метров",
        template=SimpleNamespace(code="GENERIC_MULTI"),
    )

    path = pdf_backup_service.build_backup_relative_path(
        FakeDb(),
        act,
        SimpleNamespace(),
        "issue_final",
    )

    assert path.parts[:3] == ("(2026-2027)", "GENERIC_MULTI", "extension")


def test_backup_path_uses_category_saved_in_version_snapshot():
    act = SimpleNamespace(
        id=uuid4(),
        issue_date=date(2026, 7, 29),
        item_serial="OLD-SERIAL",
        item_name="Оборудование",
        template=SimpleNamespace(code="GENERIC_ONE"),
    )
    version = SimpleNamespace(data_json={
        "extra_data_json": {"inventory_category": "camera"},
    })

    path = pdf_backup_service.build_backup_relative_path(
        FakeDb(),
        act,
        version,
        "issue_final",
    )

    assert path.parts[:3] == ("(2026-2027)", "GENERIC_ONE", "camera")
