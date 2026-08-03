import asyncio
import time
from datetime import datetime, timedelta
from email.message import EmailMessage

import aiosmtplib

from app.core.config import settings
from app.core.database import SessionLocal
from app.db.models import Act, EmailOutbox
from app.services.email_outbox_service import ISSUE_COMPLETED, RETURN_COMPLETED
from app.utils.storage import resolve_storage_path


MAX_ATTEMPTS = 8
RETRY_MINUTES = [1, 5, 15, 60, 360, 720, 1440, 2880]


async def _send(row: EmailOutbox) -> None:
    if not settings.SMTP_HOST or not (settings.SMTP_FROM or settings.SMTP_USER):
        raise RuntimeError("SMTP не настроен")
    message = EmailMessage()
    message["From"] = settings.SMTP_FROM or settings.SMTP_USER
    message["To"] = row.recipient_email
    message["Subject"] = row.subject
    message.set_content(row.body)
    if row.attachment_storage_path:
        path = resolve_storage_path(row.attachment_storage_path)
        if path.is_file():
            message.add_attachment(
                path.read_bytes(),
                maintype="application",
                subtype="pdf",
                filename=path.name,
            )
    await aiosmtplib.send(
        message,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER or None,
        password=settings.SMTP_PASSWORD or None,
        start_tls=settings.SMTP_TLS,
    )


def _update_completion_flag(db, row: EmailOutbox) -> None:
    if row.kind not in {ISSUE_COMPLETED, RETURN_COMPLETED} or not row.act_id:
        return
    pending_query = db.query(EmailOutbox.id).filter(
        EmailOutbox.act_id == row.act_id,
        EmailOutbox.kind == row.kind,
        EmailOutbox.status != "SENT",
    )
    if row.dispatch_id:
        pending_query = pending_query.filter(EmailOutbox.dispatch_id == row.dispatch_id)
    pending = pending_query.first()
    if pending:
        return
    act = db.query(Act).filter(Act.id == row.act_id).first()
    if act:
        if row.kind == ISSUE_COMPLETED:
            act.issue_completion_email_sent = True
        else:
            act.return_completion_email_sent = True


def process_one() -> bool:
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        db.query(EmailOutbox).filter(
            EmailOutbox.status == "PROCESSING",
            EmailOutbox.locked_at < now - timedelta(minutes=10),
        ).update({
            EmailOutbox.status: "PENDING",
            EmailOutbox.locked_at: None,
            EmailOutbox.next_attempt_at: now,
        }, synchronize_session=False)
        db.commit()
        row = (
            db.query(EmailOutbox)
            .filter(
                EmailOutbox.status == "PENDING",
                EmailOutbox.next_attempt_at <= now,
            )
            .order_by(EmailOutbox.created_at.asc())
            .with_for_update(skip_locked=True)
            .first()
        )
        if not row:
            return False
        row.status = "PROCESSING"
        row.locked_at = now
        row.attempts += 1
        row_id = row.id
        db.commit()

        row = db.query(EmailOutbox).filter(EmailOutbox.id == row_id).first()
        try:
            asyncio.run(_send(row))
            row.status = "SENT"
            row.sent_at = datetime.utcnow()
            row.last_error = None
            _update_completion_flag(db, row)
        except Exception as exc:
            row.last_error = str(exc)[:2000]
            if row.attempts >= MAX_ATTEMPTS:
                row.status = "DEAD"
            else:
                row.status = "PENDING"
                delay = RETRY_MINUTES[min(row.attempts - 1, len(RETRY_MINUTES) - 1)]
                row.next_attempt_at = datetime.utcnow() + timedelta(minutes=delay)
        row.locked_at = None
        db.commit()
        return True
    except Exception:
        db.rollback()
        return False
    finally:
        db.close()


def main() -> None:
    while True:
        processed = process_one()
        if not processed:
            time.sleep(5)


if __name__ == "__main__":
    main()
