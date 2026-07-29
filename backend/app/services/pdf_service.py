from app.db.models import Act, ActVersion, FileAsset, FileAssetKind
from app.utils.pdf import build_act_pdf_bytes, build_act_pdf_v2
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
        "return_date": act.return_date.isoformat() if act.return_date else None,
        "return_note": act.return_note,
        "status": act.status.value if hasattr(act.status, "value") else str(act.status),
        "current_version": act.current_version,
        "created_at": act.created_at.isoformat() if act.created_at else None,
        "updated_at": act.updated_at.isoformat() if act.updated_at else None,
        "extra_data_json": base_extra,
    }


def create_pdf_asset_for_version(db, act: Act, version: ActVersion, template_name: str | None = None, template_code: str | None = None, use_v2: bool = True) -> FileAsset:
    snapshot = build_act_snapshot(act)

    issue_party1_asset = (
        db.query(FileAsset)
        .filter(FileAsset.act_id == act.id, FileAsset.kind == FileAssetKind.SIGNATURE_PARTY1)
        .order_by(FileAsset.created_at.desc())
        .first()
    )
    issue_party2_asset = (
        db.query(FileAsset)
        .filter(FileAsset.act_id == act.id, FileAsset.kind == FileAssetKind.SIGNATURE_PARTY2)
        .order_by(FileAsset.created_at.desc())
        .first()
    )
    return_party1_asset = (
        db.query(FileAsset)
        .filter(FileAsset.act_id == act.id, FileAsset.kind == FileAssetKind.RETURN_SIGNATURE_PARTY1)
        .order_by(FileAsset.created_at.desc())
        .first()
    )
    return_party2_asset = (
        db.query(FileAsset)
        .filter(FileAsset.act_id == act.id, FileAsset.kind == FileAssetKind.RETURN_SIGNATURE_PARTY2)
        .order_by(FileAsset.created_at.desc())
        .first()
    )

    issue_party1_signature_path = (
        str(resolve_storage_path(issue_party1_asset.storage_path))
        if issue_party1_asset and issue_party1_asset.storage_path
        else None
    )
    issue_party2_signature_path = (
        str(resolve_storage_path(issue_party2_asset.storage_path))
        if issue_party2_asset and issue_party2_asset.storage_path
        else None
    )
    return_party1_signature_path = (
        str(resolve_storage_path(return_party1_asset.storage_path))
        if return_party1_asset and return_party1_asset.storage_path
        else None
    )
    return_party2_signature_path = (
        str(resolve_storage_path(return_party2_asset.storage_path))
        if return_party2_asset and return_party2_asset.storage_path
        else None
    )

    # Выбираем версию генератора PDF
    pdf_generator = build_act_pdf_v2 if use_v2 else build_act_pdf_bytes

    recipient_signature_paths: list[str | None] = []
    return_recipient_signature_paths: list[str | None] = []
    recipients = snapshot.get("extra_data_json", {}).get("recipients", []) if isinstance(snapshot.get("extra_data_json"), dict) else []
    if isinstance(recipients, list):
        for recipient in recipients:
            if not isinstance(recipient, dict):
                continue
            issue_path = recipient.get("signature_file_path")
            recipient_signature_paths.append(
                str(resolve_storage_path(issue_path)) if isinstance(issue_path, str) and issue_path else None
            )
            return_path = recipient.get("return_signature_file_path")
            return_recipient_signature_paths.append(
                str(resolve_storage_path(return_path)) if isinstance(return_path, str) and return_path else None
            )
    
    pdf_bytes = pdf_generator(
        snapshot,
        template_name=template_name,
        template_code=template_code,
        issue_signature_party1_path=issue_party1_signature_path,
        issue_signature_party2_path=issue_party2_signature_path,
        return_signature_party1_path=return_party1_signature_path,
        return_signature_party2_path=return_party2_signature_path,
        issue_recipient_signature_paths=recipient_signature_paths,
        return_recipient_signature_paths=return_recipient_signature_paths,
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
