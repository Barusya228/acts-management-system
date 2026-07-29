import uuid

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.db.models import Act, EmailOutbox


ISSUE_COMPLETED = "ISSUE_COMPLETED"
RETURN_COMPLETED = "RETURN_COMPLETED"
ACT_CREATED = "ACT_CREATED"
REMINDER = "REMINDER"


def _recipients(act: Act) -> list[dict]:
    extra_data = act.extra_data_json if isinstance(act.extra_data_json, dict) else {}
    recipients = extra_data.get("recipients")
    if isinstance(recipients, list) and recipients:
        return [item for item in recipients if isinstance(item, dict)]
    return [{"participant_id": None, "full_name": act.party2_name, "email": act.receiver_email}]


def _render(act: Act, kind: str, recipient_name: str) -> tuple[str, str]:
    if kind == ISSUE_COMPLETED:
        subject = f"Акт передачи техники завершен: {act.item_name}"
        message = "Акт приема-передачи техники завершен и подписан всеми сторонами."
    elif kind == RETURN_COMPLETED:
        subject = f"Акт возврата техники завершен: {act.item_name}"
        message = "Процесс возврата техники завершен и подписан всеми сторонами."
    elif kind == REMINDER:
        subject = f"Напоминание о подписи акта: {act.item_name}"
        message = "Напоминаем, что акт ожидает вашей подписи. Для подписания обратитесь в кабинет С314."
    else:
        subject = f"Создан акт приема-передачи: {act.item_name}"
        message = "Для вас создан акт приема-передачи техники. Для подписания обратитесь в кабинет С314."
    body = "\n".join([
        f"Здравствуйте, {recipient_name}!",
        "",
        message,
        "",
        f"Техника: {act.item_name}",
        f"Серийный номер: {act.item_serial or 'не указан'}",
        f"Дата выдачи: {act.issue_date.isoformat()}",
    ])
    return subject, body


def enqueue_act_emails(
    db: Session,
    act: Act,
    kind: str,
    attachment_storage_path: str | None = None,
    pending_only: bool = False,
    dedupe_suffix: str | None = None,
) -> int:
    queued = 0
    for recipient in _recipients(act):
        if pending_only and (recipient.get("signed_at") or recipient.get("return_signed_at")):
            continue
        email = str(recipient.get("email", "")).strip().lower()
        name = str(recipient.get("full_name", "")).strip()
        if not email:
            continue
        recipient_key = str(recipient.get("participant_id") or email)
        subject, body = _render(act, kind, name)
        statement = insert(EmailOutbox).values(
            id=uuid.uuid4(),
            act_id=act.id,
            kind=kind,
            recipient_email=email,
            recipient_name=name or None,
            subject=subject,
            body=body,
            attachment_storage_path=attachment_storage_path,
            dedupe_key=f"{kind}:{act.id}:{recipient_key}:{dedupe_suffix or 'default'}",
            status="PENDING",
            attempts=0,
        ).on_conflict_do_nothing(index_elements=["dedupe_key"])
        result = db.execute(statement)
        queued += result.rowcount or 0
    return queued
