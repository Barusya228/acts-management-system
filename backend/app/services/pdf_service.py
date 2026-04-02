from app.db.models import Act, ActVersion, FileAsset, FileAssetKind
from app.utils.pdf import build_act_pdf_bytes
from app.utils.storage import save_bytes, resolve_storage_path


def build_act_snapshot(act: Act) -> dict:
    base_extra = act.extra_data_json or {}
    return {
        "id": str(act.id),
        "template_id": str(act.template_id),
        "party1_name": act.party1_name,
        "party2_name": act.party2_name,
        "issue_date": act.issue_date.isoformat(),
        "item_name": act.item_name,
        "item_serial": act.item_serial,
        "receiver_email": act.receiver_email,
        "status": act.status.value if hasattr(act.status, "value") else str(act.status),
        "current_version": act.current_version,
        "created_at": act.created_at.isoformat() if act.created_at else None,
        "updated_at": act.updated_at.isoformat() if act.updated_at else None,
        "extra_data_json": base_extra,
    }


def create_pdf_asset_for_version(db, act: Act, version: ActVersion, template_name: str | None = None) -> FileAsset:
    snapshot = build_act_snapshot(act)

    party1_asset = (
        db.query(FileAsset)
        .filter(FileAsset.act_id == act.id, FileAsset.kind == FileAssetKind.SIGNATURE_PARTY1)
        .order_by(FileAsset.created_at.desc())
        .first()
    )
    party2_asset = (
        db.query(FileAsset)
        .filter(FileAsset.act_id == act.id, FileAsset.kind == FileAssetKind.SIGNATURE_PARTY2)
        .order_by(FileAsset.created_at.desc())
        .first()
    )

    party1_signature_path = (
        str(resolve_storage_path(party1_asset.storage_path)) if party1_asset and party1_asset.storage_path else None
    )
    party2_signature_path = (
        str(resolve_storage_path(party2_asset.storage_path)) if party2_asset and party2_asset.storage_path else None
    )

    pdf_bytes = build_act_pdf_bytes(
        snapshot,
        template_name=template_name,
        signature_party1_path=party1_signature_path,
        signature_party2_path=party2_signature_path,
    )
    relative_path, size_bytes, sha256 = save_bytes(
        relative_dir=f"acts/{act.id}",
        filename=f"act_v{version.version_number}.pdf",
        content=pdf_bytes,
    )

    file_asset = FileAsset(
        act_id=act.id,
        kind=FileAssetKind.PDF,
        storage_path=relative_path,
        mime_type="application/pdf",
        size_bytes=size_bytes,
        sha256=sha256,
    )
    db.add(file_asset)
    db.flush()

    version.pdf_file_id = file_asset.id
    version.data_json = snapshot
    return file_asset
