import logging
from email.message import EmailMessage
from pathlib import Path

import aiosmtplib

from app.core.config import settings
from app.db.models import Act


logger = logging.getLogger(__name__)


def _smtp_is_configured() -> bool:
    return bool(settings.SMTP_HOST)


def _build_message(to_email: str, subject: str, body: str) -> EmailMessage:
    message = EmailMessage()
    message["From"] = settings.SMTP_FROM or settings.SMTP_USER
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(body)
    return message


def _attach_pdf_if_exists(message: EmailMessage, pdf_path: Path | None, filename: str) -> None:
    if not pdf_path:
        return

    if not pdf_path.exists() or not pdf_path.is_file():
        logger.warning("PDF attachment not found: %s", pdf_path)
        return

    message.add_attachment(
        pdf_path.read_bytes(),
        maintype="application",
        subtype="pdf",
        filename=filename,
    )


async def _send_message(message: EmailMessage, act: Act) -> None:
    if not _smtp_is_configured():
        logger.info("SMTP is not configured. Email skipped for act %s to %s", act.id, act.receiver_email)
        return

    await aiosmtplib.send(
        message,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER or None,
        password=settings.SMTP_PASSWORD or None,
        start_tls=settings.SMTP_TLS,
    )


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

    message = _build_message(act.receiver_email, subject, "\n".join(body_lines))
    await _send_message(message, act)


async def send_act_completed_email(act: Act, pdf_path: Path | None = None) -> None:
    subject = f"Акт передачи техники завершен: {act.item_name}"
    body = "\n".join(
        [
            f"Здравствуйте, {act.party2_name}.",
            "",
            "Это ИТ-отдел, Руслан.",
            "Направляю вам копию документа по передаче техники.",
            "Документ завершен и подписан обеими сторонами.",
            "",
            f"ID акта: {act.id}",
            f"Техника: {act.item_name}",
            f"Серийный номер: {act.item_serial or 'не указан'}",
            f"Дата выдачи: {act.issue_date.isoformat()}",
        ]
    )

    message = _build_message(act.receiver_email, subject, body)
    _attach_pdf_if_exists(message, pdf_path, f"act_{act.id}_completed.pdf")
    await _send_message(message, act)


async def send_return_completed_email(act: Act, pdf_path: Path | None = None) -> None:
    subject = f"Акт возврата техники завершен: {act.item_name}"
    body = "\n".join(
        [
            f"Здравствуйте, {act.party2_name}.",
            "",
            "Это ИТ-отдел, Руслан.",
            "Направляю вам копию документа по возврату техники.",
            "Процесс возврата завершен и подписан обеими сторонами.",
            "",
            f"ID акта: {act.id}",
            f"Техника: {act.item_name}",
            f"Серийный номер: {act.item_serial or 'не указан'}",
            f"Дата возврата: {act.return_date.isoformat() if act.return_date else 'не указана'}",
        ]
    )

    message = _build_message(act.receiver_email, subject, body)
    _attach_pdf_if_exists(message, pdf_path, f"act_{act.id}_returned.pdf")
    await _send_message(message, act)
