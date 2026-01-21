from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, desc, asc
from typing import Optional, Dict, Any, List, Tuple
from uuid import UUID
from datetime import datetime
from fastapi import HTTPException, status, BackgroundTasks
from app.db.models.act import Act, ActStatus
from app.db.models.act_version import ActVersion
from app.db.models.file_asset import FileAsset, FileKind
from app.db.models.template import Template
from app.schemas.act import ActCreate, ActUpdate
from app.services.pdf_service import generate_pdf, save_signature_from_base64
from app.services.email_service import send_act_email
from app.utils.audit import log_action
import os


def create_act(
    db: Session,
    act_data: ActCreate,
    user_id: UUID,
    background_tasks: BackgroundTasks
) -> Act:
    """Create new act with initial version"""
    template = db.query(Template).filter(Template.id == act_data.template_id).first()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    act = Act(
        template_id=act_data.template_id,
        party1_name=act_data.party1_name,
        party2_name=act_data.party2_name,
        issue_date=act_data.issue_date,
        item_name=act_data.item_name,
        receiver_email=act_data.receiver_email,
        status=ActStatus.DRAFT,
        current_version=1,
        created_by=user_id
    )
    db.add(act)
    db.flush()
    
    # Create initial version
    data_json = {
        "party1_name": act_data.party1_name,
        "party2_name": act_data.party2_name,
        "issue_date": act_data.issue_date.isoformat(),
        "item_name": act_data.item_name,
        "receiver_email": act_data.receiver_email,
    }
    
    version = ActVersion(
        act_id=act.id,
        version_number=1,
        data_json=data_json,
        created_by=user_id
    )
    db.add(version)
    db.flush()
    
    # Generate PDF
    pdf_path = generate_pdf(data_json, template.schema_json)
    pdf_size = os.path.getsize(pdf_path)
    
    pdf_file = FileAsset(
        act_id=act.id,
        kind=FileKind.PDF,
        storage_path=pdf_path,
        mime_type="application/pdf",
        size_bytes=pdf_size
    )
    db.add(pdf_file)
    db.flush()
    
    version.pdf_file_id = pdf_file.id
    db.commit()
    
    # Send email in background
    background_tasks.add_task(
        send_act_email,
        act_data.receiver_email,
        {**data_json, "id": str(act.id)},
        pdf_path
    )
    
    log_action(db, user_id, "act", act.id, "CREATE")
    
    db.refresh(act)
    return act


def get_acts(
    db: Session,
    template_code: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    party1: Optional[str] = None,
    party2: Optional[str] = None,
    item_name: Optional[str] = None,
    email: Optional[str] = None,
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    page: int = 1,
    page_size: int = 20
) -> Tuple[List[Act], int]:
    """Get acts with filters and pagination"""
    query = db.query(Act)
    
    if template_code:
        query = query.join(Template).filter(Template.code == template_code)
    
    if date_from:
        query = query.filter(Act.issue_date >= date_from)
    
    if date_to:
        query = query.filter(Act.issue_date <= date_to)
    
    if party1:
        query = query.filter(Act.party1_name.ilike(f"%{party1}%"))
    
    if party2:
        query = query.filter(Act.party2_name.ilike(f"%{party2}%"))
    
    if item_name:
        query = query.filter(Act.item_name.ilike(f"%{item_name}%"))
    
    if email:
        query = query.filter(Act.receiver_email.ilike(f"%{email}%"))
    
    # Sorting
    sort_column = getattr(Act, sort_by, Act.created_at)
    if sort_dir == "desc":
        query = query.order_by(desc(sort_column))
    else:
        query = query.order_by(asc(sort_column))
    
    total = query.count()
    
    # Pagination
    offset = (page - 1) * page_size
    acts = query.offset(offset).limit(page_size).all()
    
    return acts, total


def get_act_by_id(db: Session, act_id: UUID) -> Act:
    """Get act by ID"""
    act = db.query(Act).filter(Act.id == act_id).first()
    if not act:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Act not found"
        )
    return act


def update_act(
    db: Session,
    act_id: UUID,
    update_data: ActUpdate,
    user_id: UUID
) -> Act:
    """Update act and create new version"""
    act = get_act_by_id(db, act_id)
    
    # Get current version data
    current_version = db.query(ActVersion).filter(
        ActVersion.act_id == act_id,
        ActVersion.version_number == act.current_version
    ).first()
    
    if not current_version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Current version not found"
        )
    
    # Update act fields
    update_dict = update_data.dict(exclude_unset=True)
    for field, value in update_dict.items():
        if field != "change_note":
            setattr(act, field, value)
    
    act.updated_at = datetime.utcnow()
    act.current_version += 1
    
    # Create new version
    new_data_json = current_version.data_json.copy()
    for field, value in update_dict.items():
        if field != "change_note" and field in new_data_json:
            if isinstance(value, datetime):
                new_data_json[field] = value.isoformat()
            else:
                new_data_json[field] = value
    
    new_version = ActVersion(
        act_id=act.id,
        version_number=act.current_version,
        data_json=new_data_json,
        change_note=update_data.change_note,
        created_by=user_id
    )
    db.add(new_version)
    
    # Regenerate PDF with signatures if available
    template = db.query(Template).filter(Template.id == act.template_id).first()
    
    # Get signatures if they exist
    signature_party1_path = None
    signature_party2_path = None
    
    party1_sig = db.query(FileAsset).filter(
        FileAsset.act_id == act_id,
        FileAsset.kind == FileKind.SIGNATURE_PARTY1
    ).order_by(FileAsset.created_at.desc()).first()
    if party1_sig:
        signature_party1_path = party1_sig.storage_path
    
    party2_sig = db.query(FileAsset).filter(
        FileAsset.act_id == act_id,
        FileAsset.kind == FileKind.SIGNATURE_PARTY2
    ).order_by(FileAsset.created_at.desc()).first()
    if party2_sig:
        signature_party2_path = party2_sig.storage_path
    
    pdf_path = generate_pdf(
        new_data_json,
        template.schema_json,
        signature_party1_path=signature_party1_path,
        signature_party2_path=signature_party2_path
    )
    pdf_size = os.path.getsize(pdf_path)
    
    pdf_file = FileAsset(
        act_id=act.id,
        kind=FileKind.PDF,
        storage_path=pdf_path,
        mime_type="application/pdf",
        size_bytes=pdf_size
    )
    db.add(pdf_file)
    db.flush()
    
    new_version.pdf_file_id = pdf_file.id
    
    db.commit()
    log_action(db, user_id, "act", act.id, "UPDATE", {"version": act.current_version})
    
    db.refresh(act)
    return act


def add_signature(
    db: Session,
    act_id: UUID,
    party: str,
    signature_base64: str,
    user_id: UUID
) -> Act:
    """Add signature to act"""
    act = get_act_by_id(db, act_id)
    
    if party not in ["party1", "party2"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Party must be 'party1' or 'party2'"
        )
    
    # Save signature file
    file_kind = FileKind.SIGNATURE_PARTY1 if party == "party1" else FileKind.SIGNATURE_PARTY2
    signature_path = save_signature_from_base64(signature_base64, str(act_id), party)
    signature_size = os.path.getsize(signature_path)
    
    signature_file = FileAsset(
        act_id=act.id,
        kind=file_kind,
        storage_path=signature_path,
        mime_type="image/png",
        size_bytes=signature_size
    )
    db.add(signature_file)
    db.flush()
    
    # Update current version data_json
    current_version = db.query(ActVersion).filter(
        ActVersion.act_id == act_id,
        ActVersion.version_number == act.current_version
    ).first()
    
    if current_version:
        current_version.data_json[f"signature_{party}_file_id"] = str(signature_file.id)
        current_version.data_json[f"signature_{party}_path"] = signature_path
    
    # Update status
    if party == "party1":
        act.status = ActStatus.SIGNED_PARTY1
    elif party == "party2":
        act.status = ActStatus.SIGNED_PARTY2
    
    # Regenerate PDF with signatures
    template = db.query(Template).filter(Template.id == act.template_id).first()
    
    # Get all signatures for this act
    signature_party1_path = None
    signature_party2_path = None
    
    if party == "party1":
        signature_party1_path = signature_path
    else:
        signature_party2_path = signature_path
    
    # Get other signature if exists
    party1_sig = db.query(FileAsset).filter(
        FileAsset.act_id == act_id,
        FileAsset.kind == FileKind.SIGNATURE_PARTY1
    ).order_by(FileAsset.created_at.desc()).first()
    if party1_sig:
        signature_party1_path = party1_sig.storage_path
    
    party2_sig = db.query(FileAsset).filter(
        FileAsset.act_id == act_id,
        FileAsset.kind == FileKind.SIGNATURE_PARTY2
    ).order_by(FileAsset.created_at.desc()).first()
    if party2_sig:
        signature_party2_path = party2_sig.storage_path
    
    pdf_path = generate_pdf(
        current_version.data_json,
        template.schema_json,
        signature_party1_path=signature_party1_path,
        signature_party2_path=signature_party2_path
    )
    pdf_size = os.path.getsize(pdf_path)
    
    pdf_file = FileAsset(
        act_id=act.id,
        kind=FileKind.PDF,
        storage_path=pdf_path,
        mime_type="application/pdf",
        size_bytes=pdf_size
    )
    db.add(pdf_file)
    db.flush()
    
    current_version.pdf_file_id = pdf_file.id
    
    db.commit()
    log_action(db, user_id, "act", act.id, f"SIGN_{party.upper()}")
    
    db.refresh(act)
    return act


def get_act_versions(db: Session, act_id: UUID) -> List[ActVersion]:
    """Get all versions of an act"""
    act = get_act_by_id(db, act_id)
    versions = db.query(ActVersion).filter(
        ActVersion.act_id == act_id
    ).order_by(ActVersion.version_number.desc()).all()
    return versions

