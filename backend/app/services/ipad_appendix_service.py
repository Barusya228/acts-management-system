from datetime import date, datetime
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.models import Act, ActStatus, IpadActAppendix, IpadAssignmentEvent, IpadDevice, IpadStudentAssignment, Participant, User
from app.services.audit_service import record_audit
from app.utils.storage import save_bytes, save_data_url_file
from app.utils.pdf import _register_font, _resolve_bold_font_name


PENDING_APPENDIX_STATUSES = {"WAITING_RESPONSIBLE", "WAITING_ISSUER"}


def serialize_appendix(item: IpadActAppendix) -> dict:
    return {
        "id": str(item.id),
        "act_id": str(item.act_id),
        "appendix_number": item.appendix_number,
        "operation_type": item.operation_type,
        "status": item.status,
        "responsible_participant_id": str(item.responsible_participant_id),
        "responsible_name": item.responsible.full_name,
        "issuer_participant_id": str(item.issuer_participant_id),
        "issuer_name": item.issuer.full_name,
        "payload": item.payload_json,
        "responsible_signed_at": item.responsible_signed_at.isoformat() if item.responsible_signed_at else None,
        "issuer_signed_at": item.issuer_signed_at.isoformat() if item.issuer_signed_at else None,
        "created_at": item.created_at.isoformat(),
        "applied_at": item.applied_at.isoformat() if item.applied_at else None,
        "pdf_available": bool(item.pdf_storage_path),
    }


def next_appendix_number(db: Session, act_id) -> int:
    current = db.query(func.max(IpadActAppendix.appendix_number)).filter(IpadActAppendix.act_id == act_id).scalar()
    return int(current or 0) + 1


def ensure_no_pending_appendix(db: Session, act_id) -> None:
    pending = db.query(IpadActAppendix.id).filter(
        IpadActAppendix.act_id == act_id,
        IpadActAppendix.status.in_(PENDING_APPENDIX_STATUSES),
    ).first()
    if pending:
        from fastapi import HTTPException
        raise HTTPException(status_code=409, detail="Сначала завершите или отмените текущее приложение")


def apply_appendix(db: Session, appendix: IpadActAppendix, current_user: User) -> None:
    from fastapi import HTTPException

    payload = appendix.payload_json
    operation = appendix.operation_type
    now = datetime.utcnow()
    if operation == "IPAD_REPLACEMENT":
        assignment = db.query(IpadStudentAssignment).filter(IpadStudentAssignment.id == payload["assignment_id"]).with_for_update().first()
        old_device = db.query(IpadDevice).filter(IpadDevice.id == payload["old_device_id"]).with_for_update().first()
        new_device = db.query(IpadDevice).filter(IpadDevice.id == payload["new_device_id"]).with_for_update().first()
        if not assignment or not new_device or new_device.status != "RESERVED":
            raise HTTPException(status_code=409, detail="Невозможно применить замену iPad")
        if old_device:
            old_device.status = payload["old_result_status"]
        new_device.status = "ISSUED"
        assignment.ipad_device_id = new_device.id
        assignment.ipad_name = new_device.device_name
        assignment.ipad_model = new_device.model
        assignment.ipad_tag = new_device.tag
        assignment.serial_number = new_device.serial_number
    elif operation == "STUDENT_DEPARTURE":
        assignment = db.query(IpadStudentAssignment).filter(IpadStudentAssignment.id == payload["assignment_id"]).with_for_update().first()
        device = db.query(IpadDevice).filter(IpadDevice.id == payload["device_id"]).with_for_update().first()
        if not assignment or assignment.student_status != "ACTIVE":
            raise HTTPException(status_code=409, detail="Ученик уже выбыл")
        assignment.student_status = "DEPARTED"
        assignment.status = "RETURNED" if payload["ipad_returned"] else "RETURN_PENDING"
        assignment.returned_at = now if payload["ipad_returned"] else None
        if device:
            device.status = payload["device_result_status"]
    elif operation == "STUDENT_ADDITION":
        device = db.query(IpadDevice).filter(IpadDevice.id == payload["device_id"]).with_for_update().first()
        if not device or device.status != "RESERVED":
            raise HTTPException(status_code=409, detail="Зарезервированный iPad недоступен")
        device.status = "ISSUED"
        db.add(IpadStudentAssignment(
            act_id=appendix.act_id,
            ipad_device_id=device.id,
            student_name=payload["student_name"],
            ipad_name=device.device_name,
            ipad_model=device.model,
            ipad_tag=device.tag,
            serial_number=device.serial_number,
            note=payload.get("note"),
            status="ISSUED",
        ))
    elif operation == "LATE_RETURN":
        assignment = db.query(IpadStudentAssignment).filter(IpadStudentAssignment.id == payload["assignment_id"]).with_for_update().first()
        device = db.query(IpadDevice).filter(IpadDevice.id == payload["device_id"]).with_for_update().first()
        if not assignment or assignment.status != "RETURN_PENDING":
            raise HTTPException(status_code=409, detail="iPad не ожидает позднего возврата")
        assignment.status = "RETURNED"
        assignment.returned_at = now
        if device:
            device.status = payload["device_result_status"]
    elif operation == "YEAR_END_RETURN":
        outstanding = db.query(IpadStudentAssignment).filter(
            IpadStudentAssignment.act_id == appendix.act_id,
            IpadStudentAssignment.status.in_(["RESERVED", "ISSUED", "RETURN_PENDING"]),
        ).with_for_update().all()
        expected_ids = {str(item["assignment_id"]) for item in payload["items"]}
        if {str(item.id) for item in outstanding} != expected_ids:
            raise HTTPException(status_code=409, detail="Состав Advisory изменился, создайте возврат заново")
        returned_date = date.fromisoformat(payload["returned_at"])
        returned_at = datetime.combine(returned_date, datetime.min.time())
        for item in payload["items"]:
            assignment = db.query(IpadStudentAssignment).filter(
                IpadStudentAssignment.id == item["assignment_id"],
                IpadStudentAssignment.act_id == appendix.act_id,
            ).with_for_update().first()
            device = db.query(IpadDevice).filter(IpadDevice.id == item["device_id"]).with_for_update().first()
            if not assignment or not device or assignment.status != "ISSUED" or assignment.student_status != "ACTIVE" or str(assignment.ipad_device_id) != str(device.id) or device.status != "ISSUED":
                raise HTTPException(status_code=409, detail="Состав Advisory изменился, создайте возврат заново")
            assignment.status = "RETURNED"
            assignment.returned_at = returned_at
            device.status = item["device_result_status"]
            db.add(IpadAssignmentEvent(
                assignment_id=assignment.id,
                event_type="YEAR_END_RETURN",
                data_json={"returned_at": payload["returned_at"], "condition": item["condition"], "device_result_status": item["device_result_status"]},
                note=payload.get("note"),
                created_by=current_user.id,
            ))
        appendix.act.status = ActStatus.RETURNED
        appendix.act.return_date = date.fromisoformat(payload["returned_at"])
        appendix.act.return_note = payload.get("note")
    appendix.status = "APPLIED"
    appendix.applied_at = now
    record_audit(db, current_user, "IPAD_APPENDIX", appendix.id, "IPAD_APPENDIX_APPLIED", {"operation": operation})


def release_appendix_reservation(db: Session, appendix: IpadActAppendix) -> None:
    payload = appendix.payload_json
    device_id = payload.get("new_device_id") or (payload.get("device_id") if appendix.operation_type == "STUDENT_ADDITION" else None)
    if device_id:
        device = db.query(IpadDevice).filter(IpadDevice.id == device_id).with_for_update().first()
        if device and device.status == "RESERVED":
            device.status = "AVAILABLE"


def save_appendix_signature(appendix: IpadActAppendix, party: str, signature_data: str) -> None:
    relative_path, _mime, _size, _sha = save_data_url_file(
        signature_data,
        relative_dir=f"acts/{appendix.act_id}/appendices/{appendix.id}",
        filename_stem=f"{party}_signature",
    )
    now = datetime.utcnow()
    if party == "responsible":
        appendix.responsible_signature_path = relative_path
        appendix.responsible_signed_at = now
        appendix.status = "WAITING_ISSUER"
    else:
        appendix.issuer_signature_path = relative_path
        appendix.issuer_signed_at = now


def create_appendix_pdf(appendix: IpadActAppendix, act: Act) -> None:
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=42, rightMargin=42, topMargin=42, bottomMargin=42)
    styles = getSampleStyleSheet()
    font_name = _register_font()
    bold_font_name = _resolve_bold_font_name(font_name)
    for style in styles.byName.values():
        style.fontName = font_name
    styles["Title"].fontName = bold_font_name
    styles["Heading2"].fontName = bold_font_name
    story = [
        Paragraph(f"Приложение №{appendix.appendix_number} к акту ACT-{str(act.id).split('-')[0].upper()}", styles["Title"]),
        Spacer(1, 12),
        Paragraph(f"Advisory: {act.ipad_profile.advisory_group} · {act.ipad_profile.academic_year}", styles["Normal"]),
        Paragraph(f"Операция: {appendix.operation_type}", styles["Heading2"]),
        Spacer(1, 8),
    ]
    rows = [["Поле", "Значение"]]
    for key, value in appendix.payload_json.items():
        if key.endswith("_id"):
            continue
        rows.append([key.replace("_", " ").title(), str(value if value is not None else "—")])
    table = Table(rows, colWidths=[150, 360])
    table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("FONTNAME", (0, 0), (-1, -1), font_name),
        ("FONTNAME", (0, 0), (-1, 0), bold_font_name),
        ("PADDING", (0, 0), (-1, -1), 6),
    ]))
    story.extend([table, Spacer(1, 18)])
    story.append(Paragraph(f"Ответственное лицо: {appendix.responsible.full_name} · подписано {appendix.responsible_signed_at}", styles["Normal"]))
    story.append(Paragraph(f"IT: {appendix.issuer.full_name} · подписано {appendix.issuer_signed_at}", styles["Normal"]))
    doc.build(story)
    path, _size, _sha = save_bytes(
        relative_dir=f"acts/{appendix.act_id}/appendices/{appendix.id}",
        filename=f"appendix_{appendix.appendix_number}.pdf",
        content=buffer.getvalue(),
    )
    appendix.pdf_storage_path = path
