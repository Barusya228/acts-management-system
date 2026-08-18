from datetime import date, datetime
from io import BytesIO
from xml.sax.saxutils import escape as xml_escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Image as PdfImage, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.models import Act, ActStatus, IpadActAppendix, IpadAssignmentEvent, IpadDevice, IpadStudentAssignment, Participant, User
from app.db.states import ACTIVE_IPAD_ASSIGNMENT_STATUSES, PENDING_APPENDIX_STATUSES
from app.services.audit_service import record_audit
from app.utils.storage import resolve_storage_path, save_bytes, save_data_url_file
from app.utils.pdf import _register_font, _resolve_bold_font_name


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
        ipad_returned = payload.get("ipad_returned", True)
        assignment.status = "RETURNED" if ipad_returned else "RETURN_PENDING"
        assignment.returned_at = now if ipad_returned else None
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
            IpadStudentAssignment.status.in_(ACTIVE_IPAD_ASSIGNMENT_STATUSES),
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


APPENDIX_OPERATION_TITLES = {
    "IPAD_REPLACEMENT": "Замена iPad",
    "STUDENT_DEPARTURE": "Выбытие ученика",
    "STUDENT_ADDITION": "Добавление ученика",
    "LATE_RETURN": "Поздний возврат iPad",
    "YEAR_END_RETURN": "Годовой возврат Advisory",
}

_DAMAGE_LABELS = {
    "OK": "Всё в порядке",
    "BENT_BODY": "Погнутый корпус",
    "CRACKED_SCREEN": "Треснутый экран",
    "LOST": "Потерян",
    "WEAK_BATTERY": "Слабый аккумулятор",
    "DAMAGED_DISPLAY": "Повреждена матрица",
    "NOT_RETURNED": "iPad не сдан (ожидается возврат)",
}

_RESULT_STATUS_LABELS = {
    "AVAILABLE": "Готов к выдаче",
    "MAINTENANCE": "На обслуживание",
    "RETIRED": "Списан",
    "RETURN_PENDING": "Ожидает возврата",
}


def _format_pdf_date(value) -> str:
    try:
        return date.fromisoformat(str(value)).strftime("%d.%m.%Y")
    except (TypeError, ValueError):
        return str(value or "—")


def _format_ipad(info) -> str:
    if not isinstance(info, dict):
        return "—"
    model = info.get("model") or "iPad"
    return f"{model} · Tag {info.get('tag', '—')} · SN {info.get('serial_number', '—')}"


def _appendix_pdf_rows(appendix: IpadActAppendix) -> list[list[str]]:
    """Человекочитаемые строки «Поле/Значение» для PDF приложения."""
    payload = appendix.payload_json or {}
    operation = appendix.operation_type
    rows: list[list[str]] = []
    if payload.get("student_name"):
        rows.append(["Ученик", payload["student_name"]])
    if operation == "IPAD_REPLACEMENT":
        rows.append(["Дата замены", _format_pdf_date(payload.get("replacement_date"))])
        rows.append(["Причина замены", payload.get("reason_label") or _DAMAGE_LABELS.get(payload.get("reason"), payload.get("reason", "—"))])
        rows.append(["Старый iPad", _format_ipad(payload.get("old_ipad"))])
        rows.append(["Результат по старому iPad", _RESULT_STATUS_LABELS.get(payload.get("old_result_status"), payload.get("old_result_status", "—"))])
        rows.append(["Новый iPad", _format_ipad(payload.get("new_ipad"))])
    elif operation == "STUDENT_DEPARTURE":
        rows.append(["Дата выбытия", _format_pdf_date(payload.get("departure_date"))])
        rows.append(["iPad", _format_ipad(payload.get("ipad"))])
        rows.append(["Состояние возвращённого iPad", payload.get("return_condition_label") or _DAMAGE_LABELS.get(payload.get("return_condition"), payload.get("return_condition", "—"))])
        rows.append(["Результат", _RESULT_STATUS_LABELS.get(payload.get("device_result_status"), payload.get("device_result_status", "—"))])
    elif operation == "STUDENT_ADDITION":
        rows.append(["Дата добавления", _format_pdf_date(payload.get("added_at"))])
        rows.append(["Причина", payload.get("reason") or "—"])
        rows.append(["iPad", _format_ipad(payload.get("ipad"))])
    elif operation == "LATE_RETURN":
        rows.append(["Дата возврата", _format_pdf_date(payload.get("returned_at"))])
        rows.append(["iPad", _format_ipad(payload.get("ipad"))])
        rows.append(["Состояние", payload.get("condition_label") or _DAMAGE_LABELS.get(payload.get("condition"), payload.get("condition", "—"))])
        rows.append(["Результат", _RESULT_STATUS_LABELS.get(payload.get("device_result_status"), payload.get("device_result_status", "—"))])
    elif operation == "YEAR_END_RETURN":
        rows.append(["Дата возврата", _format_pdf_date(payload.get("returned_at"))])
        for item in payload.get("items", []):
            condition = item.get("condition_label") or _DAMAGE_LABELS.get(item.get("condition"), item.get("condition", "—"))
            result = _RESULT_STATUS_LABELS.get(item.get("device_result_status"), item.get("device_result_status", "—"))
            rows.append([
                item.get("student_name", "—"),
                f"{_format_ipad(item.get('ipad'))} · {condition} · {result}",
            ])
    if payload.get("note"):
        rows.append(["Примечание", str(payload["note"])])
    return rows


def _signature_cell(signature_path: str | None, styles) -> object:
    """Картинка подписи для таблицы подписей, либо прочерк."""
    if signature_path:
        path = resolve_storage_path(signature_path)
        if path.is_file():
            return PdfImage(str(path), width=110, height=38, kind="proportional")
    return Paragraph("Нет подписи", styles["Normal"])


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
    operation_title = APPENDIX_OPERATION_TITLES.get(appendix.operation_type, appendix.operation_type)
    story = [
        Paragraph(f"Приложение №{appendix.appendix_number} к акту ACT-{str(act.id).split('-')[0].upper()}", styles["Title"]),
        Spacer(1, 12),
        Paragraph(f"Advisory: {act.ipad_profile.advisory_group} · Учебный год: {act.ipad_profile.academic_year}", styles["Normal"]),
        Paragraph(operation_title, styles["Heading2"]),
        Spacer(1, 8),
    ]
    # Paragraph трактует текст как мини-XML: пользовательские данные с <, & и т.п.
    # обязаны быть экранированы, иначе paraparser падает с ValueError.
    rows = [["Поле", "Значение"]] + [[Paragraph(xml_escape(str(label)), styles["Normal"]), Paragraph(xml_escape(str(value)), styles["Normal"])] for label, value in _appendix_pdf_rows(appendix)]
    table = Table(rows, colWidths=[170, 340])
    table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("FONTNAME", (0, 0), (-1, -1), font_name),
        ("FONTNAME", (0, 0), (-1, 0), bold_font_name),
        ("PADDING", (0, 0), (-1, -1), 6),
    ]))
    story.extend([table, Spacer(1, 22)])

    # Блок подписей: картинки подписей сторон с ФИО и датой, как в основном акте.
    def _signed_at(value) -> str:
        return value.strftime("%d.%m.%Y %H:%M") if value else "—"

    signature_table = Table([
        [Paragraph("Ответственное лицо", styles["Normal"]), Paragraph("Сотрудник IT", styles["Normal"])],
        [Paragraph(f"<b>{xml_escape(appendix.responsible.full_name)}</b>", styles["Normal"]), Paragraph(f"<b>{xml_escape(appendix.issuer.full_name)}</b>", styles["Normal"])],
        [_signature_cell(appendix.responsible_signature_path, styles), _signature_cell(appendix.issuer_signature_path, styles)],
        [Paragraph(f"Подписано: {_signed_at(appendix.responsible_signed_at)}", styles["Normal"]), Paragraph(f"Подписано: {_signed_at(appendix.issuer_signed_at)}", styles["Normal"])],
    ], colWidths=[255, 255])
    signature_table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 2), (-1, 2), "CENTER"),
        ("FONTNAME", (0, 0), (-1, -1), font_name),
        ("FONTNAME", (0, 0), (-1, 0), bold_font_name),
        ("PADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(signature_table)
    doc.build(story)
    path, _size, _sha = save_bytes(
        relative_dir=f"acts/{appendix.act_id}/appendices/{appendix.id}",
        filename=f"appendix_{appendix.appendix_number}.pdf",
        content=buffer.getvalue(),
    )
    appendix.pdf_storage_path = path
