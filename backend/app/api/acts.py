from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import Optional
from uuid import UUID
from datetime import datetime
from app.core.database import get_db
from app.core.deps import get_current_user, get_current_admin_user, get_current_guest_or_admin_user
from app.core.config import settings
from app.db.models import Act, ActVersion, Template, User, ActStatus, FileAsset, FileAssetKind
from app.schemas.schemas import ActCreate, ActUpdate, ActResponse, ActListResponse, SignatureRequest, ActVersionResponse, ReturnStartRequest
from app.services.pdf_service import build_act_snapshot, create_pdf_asset_for_version
from app.services.email_service import (
    send_act_completed_email,
    send_act_created_email,
    send_return_completed_email,
)
from app.utils.storage import resolve_storage_path, save_data_url_file

router = APIRouter()


RESERVED_ACT_FIELDS = {
    "party1_name",
    "party2_name",
    "issue_date",
    "item_name",
    "item_serial",
    "receiver_email",
}


def _value_matches_type(value, field_type: str) -> bool:
    if value is None:
        return True

    if field_type in {"string", "text"}:
        return isinstance(value, str)
    if field_type == "email":
        return isinstance(value, str) and "@" in value
    if field_type == "date":
        return isinstance(value, str)
    if field_type in {"number", "float"}:
        return isinstance(value, (int, float))
    if field_type in {"integer", "int"}:
        return isinstance(value, int)
    if field_type in {"boolean", "bool"}:
        return isinstance(value, bool)

    return isinstance(value, str)


def _validate_extra_data(extra_data: Optional[dict], template: Template) -> dict:
    payload = extra_data or {}
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Дополнительные поля должны быть объектом (JSON)"
        )

    schema = template.schema_json or {}
    fields = schema.get("fields") or []
    if not isinstance(fields, list):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Некорректная структура шаблона: fields должен быть массивом"
        )

    allowed_dynamic = {}
    required_dynamic = set()
    for field in fields:
        if not isinstance(field, dict):
            continue
        name = field.get("name")
        if not name or name in RESERVED_ACT_FIELDS:
            continue
        allowed_dynamic[name] = field.get("type", "string")
        if field.get("required"):
            required_dynamic.add(name)

    unknown_keys = [key for key in payload.keys() if key not in allowed_dynamic]
    if unknown_keys:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Поля не поддерживаются выбранным шаблоном: {', '.join(unknown_keys)}"
        )

    for field_name in required_dynamic:
        value = payload.get(field_name)
        if value is None or (isinstance(value, str) and not value.strip()):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Поле '{field_name}' обязательно по шаблону"
            )

    for key, value in payload.items():
        field_type = allowed_dynamic[key]
        if not _value_matches_type(value, field_type):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Поле '{key}' имеет неверный тип для '{field_type}'"
            )

    normalized = {}
    for key in allowed_dynamic.keys():
        if key in payload:
            normalized[key] = payload[key]
    return normalized


def _is_return_flow(status_value: ActStatus) -> bool:
    return status_value in {
        ActStatus.RETURN_INITIATED,
        ActStatus.RETURN_SIGNED_PARTY1,
        ActStatus.RETURN_SIGNED_PARTY2,
        ActStatus.RETURNED,
    }

@router.get("", response_model=ActListResponse)
async def list_acts(
    party1: Optional[str] = Query(None),
    party2: Optional[str] = Query(None),
    item_name: Optional[str] = Query(None),
    email: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user)
):
    query = db.query(Act)
    
    if party1:
        query = query.filter(Act.party1_name.ilike(f"%{party1}%"))
    if party2:
        query = query.filter(Act.party2_name.ilike(f"%{party2}%"))
    if item_name:
        query = query.filter(Act.item_name.ilike(f"%{item_name}%"))
    if email:
        query = query.filter(Act.receiver_email.ilike(f"%{email}%"))
    
    total = query.count()
    acts = query.offset((page - 1) * page_size).limit(page_size).all()
    
    return {
        "items": acts,
        "total": total,
        "page": page,
        "page_size": page_size
    }

@router.post("", response_model=ActResponse, status_code=status.HTTP_201_CREATED)
async def create_act(
    act_data: ActCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user)
):
    # Verify template exists
    template = db.query(Template).filter(Template.id == act_data.template_id).first()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    normalized_extra_data = _validate_extra_data(act_data.extra_data_json, template)

    act_payload = act_data.model_dump()
    act_payload["extra_data_json"] = normalized_extra_data

    act = Act(
        **act_payload,
        created_by=current_user.id,
        status=ActStatus.DRAFT,
        current_version=1
    )
    
    db.add(act)
    db.commit()
    db.refresh(act)
    
    # Create initial version
    version = ActVersion(
        act_id=act.id,
        version_number=1,
        data_json=build_act_snapshot(act),
        created_by=current_user.id
    )
    db.add(version)
    db.flush()
    create_pdf_asset_for_version(db, act, version, template_name=template.name)
    db.commit()

    try:
        await send_act_created_email(
            act,
            download_url=f"{settings.APP_BASE_URL}/api/acts/{act.id}/download/pdf"
        )
    except Exception:
        # Email delivery should not break act creation.
        pass
    
    return act

@router.get("/{act_id}", response_model=ActResponse)
async def get_act(
    act_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user)
):
    act = db.query(Act).filter(Act.id == act_id).first()
    
    if not act:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Act not found"
        )
    
    return act

@router.patch("/{act_id}", response_model=ActResponse)
async def update_act(
    act_id: UUID,
    act_data: ActUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user)
):
    act = db.query(Act).filter(Act.id == act_id).first()
    
    if not act:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Act not found"
        )
    
    template = act.template
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found for act"
        )

    # Update act fields
    update_data = act_data.model_dump(exclude_unset=True)
    change_note = update_data.pop("change_note", None)

    if "extra_data_json" in update_data:
        update_data["extra_data_json"] = _validate_extra_data(update_data.get("extra_data_json"), template)

    for field, value in update_data.items():
        setattr(act, field, value)
    
    # Increment version
    act.current_version += 1
    act.updated_at = datetime.utcnow()
    
    # Create new version
    version = ActVersion(
        act_id=act.id,
        version_number=act.current_version,
        data_json=build_act_snapshot(act),
        change_note=change_note,
        created_by=current_user.id
    )
    db.add(version)
    db.flush()
    create_pdf_asset_for_version(db, act, version, template_name=act.template.name if act.template else None)
    
    db.commit()
    db.refresh(act)

    return act

@router.delete("/{act_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_act(
    act_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    act = db.query(Act).filter(Act.id == act_id).first()
    
    if not act:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Act not found"
        )
    
    db.delete(act)
    db.commit()
    
    return None

@router.post("/{act_id}/sign/party1", response_model=ActResponse)
async def sign_party1(
    act_id: UUID,
    signature: SignatureRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user)
):
    act = db.query(Act).filter(Act.id == act_id).first()
    
    if not act:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Act not found"
        )
    
    if act.status == ActStatus.SIGNED_PARTY2:
        act.status = ActStatus.COMPLETED
    elif act.status == ActStatus.RETURN_INITIATED:
        act.status = ActStatus.RETURN_SIGNED_PARTY1
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Подпись стороны 1 сейчас недоступна по порядку процесса"
        )
    
    relative_path, mime_type, size_bytes, sha256 = save_data_url_file(
        signature.signature_data,
        relative_dir=f"acts/{act.id}",
        filename_stem=(
            f"return_signature_party1_v{act.current_version}"
            if _is_return_flow(act.status)
            else f"signature_party1_v{act.current_version}"
        )
    )
    db.add(FileAsset(
        act_id=act.id,
        kind=(
            FileAssetKind.RETURN_SIGNATURE_PARTY1
            if _is_return_flow(act.status)
            else FileAssetKind.SIGNATURE_PARTY1
        ),
        storage_path=relative_path,
        mime_type=mime_type,
        size_bytes=size_bytes,
        sha256=sha256,
    ))

    act.current_version += 1
    act.updated_at = datetime.utcnow()

    version = ActVersion(
        act_id=act.id,
        version_number=act.current_version,
        data_json=build_act_snapshot(act),
        created_by=current_user.id
    )
    db.add(version)
    db.flush()
    pdf_asset = create_pdf_asset_for_version(db, act, version, template_name=act.template.name if act.template else None)
    
    db.commit()
    db.refresh(act)

    if pdf_asset.storage_path and act.status == ActStatus.COMPLETED:
        try:
            await send_act_completed_email(
                act,
                pdf_path=resolve_storage_path(pdf_asset.storage_path),
            )
        except Exception:
            # Email delivery should not break signing flow.
            pass
    
    return act

@router.post("/{act_id}/sign/party2", response_model=ActResponse)
async def sign_party2(
    act_id: UUID,
    signature: SignatureRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user)
):
    act = db.query(Act).filter(Act.id == act_id).first()
    
    if not act:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Act not found"
        )
    
    if act.status == ActStatus.DRAFT:
        act.status = ActStatus.SIGNED_PARTY2
    elif act.status == ActStatus.RETURN_SIGNED_PARTY1:
        act.status = ActStatus.RETURNED
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Подпись стороны 2 сейчас недоступна по порядку процесса"
        )

    relative_path, mime_type, size_bytes, sha256 = save_data_url_file(
        signature.signature_data,
        relative_dir=f"acts/{act.id}",
        filename_stem=(
            f"return_signature_party2_v{act.current_version}"
            if _is_return_flow(act.status)
            else f"signature_party2_v{act.current_version}"
        )
    )
    db.add(FileAsset(
        act_id=act.id,
        kind=(
            FileAssetKind.RETURN_SIGNATURE_PARTY2
            if _is_return_flow(act.status)
            else FileAssetKind.SIGNATURE_PARTY2
        ),
        storage_path=relative_path,
        mime_type=mime_type,
        size_bytes=size_bytes,
        sha256=sha256,
    ))
    
    act.current_version += 1
    act.updated_at = datetime.utcnow()

    version = ActVersion(
        act_id=act.id,
        version_number=act.current_version,
        data_json=build_act_snapshot(act),
        created_by=current_user.id
    )
    db.add(version)
    db.flush()
    pdf_asset = create_pdf_asset_for_version(db, act, version, template_name=act.template.name if act.template else None)
    
    db.commit()
    db.refresh(act)

    if pdf_asset.storage_path and act.status == ActStatus.RETURNED:
        try:
            await send_return_completed_email(
                act,
                pdf_path=resolve_storage_path(pdf_asset.storage_path),
            )
        except Exception:
            # Email delivery should not break signing flow.
            pass
    
    return act

@router.get("/{act_id}/versions", response_model=list[ActVersionResponse])
async def get_act_versions(
    act_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user)
):
    act = db.query(Act).filter(Act.id == act_id).first()
    
    if not act:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Act not found"
        )
    
    versions = db.query(ActVersion).filter(ActVersion.act_id == act_id).order_by(ActVersion.version_number.desc()).all()
    
    return versions


@router.post("/{act_id}/return", response_model=ActResponse)
async def start_return_flow(
    act_id: UUID,
    payload: ReturnStartRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user)
):
    act = db.query(Act).filter(Act.id == act_id).first()

    if not act:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Act not found"
        )

    if act.status != ActStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Возврат можно начать только после полного завершения акта выдачи"
        )

    act.return_date = payload.return_date
    act.return_note = payload.return_note
    act.status = ActStatus.RETURN_INITIATED
    act.current_version += 1
    act.updated_at = datetime.utcnow()

    version = ActVersion(
        act_id=act.id,
        version_number=act.current_version,
        data_json=build_act_snapshot(act),
        change_note="Инициирован возврат техники",
        created_by=current_user.id,
    )
    db.add(version)
    db.flush()
    create_pdf_asset_for_version(db, act, version, template_name=act.template.name if act.template else None)

    db.commit()
    db.refresh(act)
    return act


@router.get("/{act_id}/download/pdf")
async def download_act_pdf(
    act_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user)
):
    act = db.query(Act).filter(Act.id == act_id).first()

    if not act:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Act not found"
        )

    pdf_asset = (
        db.query(FileAsset)
        .filter(FileAsset.act_id == act_id, FileAsset.kind == FileAssetKind.PDF)
        .order_by(FileAsset.created_at.desc())
        .first()
    )

    if not pdf_asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PDF not found"
        )

    file_path = resolve_storage_path(pdf_asset.storage_path)
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stored PDF file not found"
        )

    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=f"act_{act.id}_v{act.current_version}.pdf",
        content_disposition_type="attachment",
    )


@router.get("/{act_id}/preview/pdf")
async def preview_act_pdf(
    act_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user)
):
    act = db.query(Act).filter(Act.id == act_id).first()

    if not act:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Act not found"
        )

    pdf_asset = (
        db.query(FileAsset)
        .filter(FileAsset.act_id == act_id, FileAsset.kind == FileAssetKind.PDF)
        .order_by(FileAsset.created_at.desc())
        .first()
    )

    if not pdf_asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PDF not found"
        )

    file_path = resolve_storage_path(pdf_asset.storage_path)
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stored PDF file not found"
        )

    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=f"act_{act.id}_v{act.current_version}.pdf",
        content_disposition_type="inline",
    )


@router.get("/{act_id}/versions/{version_number}/download/pdf")
async def download_act_pdf_by_version(
    act_id: UUID,
    version_number: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user)
):
    act = db.query(Act).filter(Act.id == act_id).first()

    if not act:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Act not found"
        )

    version = (
        db.query(ActVersion)
        .filter(ActVersion.act_id == act_id, ActVersion.version_number == version_number)
        .first()
    )

    if not version or not version.pdf_file_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PDF for this version not found"
        )

    pdf_asset = db.query(FileAsset).filter(FileAsset.id == version.pdf_file_id).first()
    if not pdf_asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PDF asset not found"
        )

    file_path = resolve_storage_path(pdf_asset.storage_path)
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stored PDF file not found"
        )

    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=f"act_{act.id}_v{version_number}.pdf",
        content_disposition_type="attachment",
    )
