import logging
from email.message import EmailMessage

import aiosmtplib

from app.core.config import settings
from app.db.models import Act


logger = logging.getLogger(__name__)


async def send_act_created_email(act: Act, download_url: str | None = None) -> None:
    subject = f"Новый акт создан: {act.item_name}"
    body_lines = [
        "В системе создан новый акт приема-передачи техники.",
        "",
        f"ID акта: {act.id}",
        f"Передающая сторона: {act.party1_name}",
        f"Получающая сторона: {act.party2_name}",
        f"Техника: {act.item_name}",
        f"Дата выдачи: {act.issue_date.isoformat()}",
    ]

    if download_url:
        body_lines.extend(["", f"PDF: {download_url}"])

    if not settings.SMTP_HOST:
        logger.info("SMTP is not configured. Email skipped for act %s to %s", act.id, act.receiver_email)
        return

    message = EmailMessage()
    message["From"] = settings.SMTP_FROM or settings.SMTP_USER
    message["To"] = act.receiver_email
    message["Subject"] = subject
    message.set_content("\n".join(body_lines))

    await aiosmtplib.send(
        message,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER or None,
        password=settings.SMTP_PASSWORD or None,
        start_tls=settings.SMTP_TLS,
    )
