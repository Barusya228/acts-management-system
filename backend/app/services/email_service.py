import logging
from email.message import EmailMessage
from pathlib import Path

import aiosmtplib

from app.core.config import settings
from app.db.models import Act


logger = logging.getLogger(__name__)


def _recipient_list(act: Act) -> list[dict]:
    extra_data = act.extra_data_json or {}
    recipients = extra_data.get("recipients") if isinstance(extra_data, dict) else None
    if isinstance(recipients, list) and recipients:
        return [item for item in recipients if isinstance(item, dict)]
    return [{"full_name": act.party2_name, "email": act.receiver_email}]


def _recipient_names(act: Act) -> str:
    names = [str(item.get("full_name", "")).strip() for item in _recipient_list(act)]
    names = [name for name in names if name]
    return ", ".join(names) if names else act.party2_name


def _recipient_emails(act: Act) -> list[str]:
    emails = [str(item.get("email", "")).strip() for item in _recipient_list(act)]
    normalized = [email for email in emails if email]
    return normalized or [act.receiver_email]


def _smtp_is_configured() -> bool:
    return bool(settings.SMTP_HOST and (settings.SMTP_FROM or settings.SMTP_USER))


def _build_message(
    to_email: str | list[str],
    subject: str,
    body: str,
) -> EmailMessage:
    message = EmailMessage()
    from_email = settings.SMTP_FROM or settings.SMTP_USER
    message["From"] = from_email

    message["To"] = ", ".join(to_email) if isinstance(to_email, list) else to_email
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
        logger.info(
            "SMTP is not configured. Email skipped for act %s to %s",
            act.id,
            act.receiver_email,
        )
        return

    await aiosmtplib.send(
        message,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER or None,
        password=settings.SMTP_PASSWORD or None,
        start_tls=settings.SMTP_TLS,
    )


async def send_act_created_email(
    act: Act,
    download_url: str | None = None,
) -> None:
    """
    Отправляет персональное письмо каждому получателю с его статусом и ссылкой на шаг подписания.
    """
    recipients = _recipient_list(act)
    base_url = settings.APP_BASE_URL or "http://localhost:3000"
    act_url = f"{base_url}/acts/{act.id}"

    for index, recipient in enumerate(recipients):
        recipient_name = str(recipient.get("full_name", "")).strip()
        recipient_email = str(recipient.get("email", "")).strip()
        
        if not recipient_email:
            continue

        signed_at = recipient.get("signed_at")
        recipient_status = "подписано" if signed_at else "ожидает вашей подписи"
        recipient_position = index + 1
        total_recipients = len(recipients)

        subject = f"Акт приема-передачи техники: {act.item_name}"
        body_lines = [
            f"Здравствуйте, {recipient_name}!",
            "",
            "Для вас создан акт приема-передачи техники.",
            "",
            f"Техника: {act.item_name}",
            f"Серийный номер: {act.item_serial or 'не указан'}",
            f"Дата выдачи: {act.issue_date.isoformat()}",
            f"Передающая сторона: {act.party1_name}",
            "",
            f"Вы — получатель {recipient_position} из {total_recipients}",
            f"Ваш статус: {recipient_status}",
            "",
            "Для подписания акта придите в кабинет С314.",
        ]

        message = _build_message(
            recipient_email,
            subject,
            "\n".join(body_lines),
        )
        
        try:
            await _send_message(message, act)
            logger.info(f"Email sent to recipient {recipient_name} ({recipient_email}) for act {act.id}")
        except Exception as e:
            logger.error(f"Failed to send email to {recipient_email} for act {act.id}: {e}")


async def send_act_completed_email(
    act: Act,
    pdf_path: Path | None = None,
) -> None:
    """
    Отправляет персональное письмо каждому получателю о завершении акта.
    """
    recipients = _recipient_list(act)
    base_url = settings.APP_BASE_URL or "http://localhost:3000"
    act_url = f"{base_url}/acts/{act.id}"

    for index, recipient in enumerate(recipients):
        recipient_name = str(recipient.get("full_name", "")).strip()
        recipient_email = str(recipient.get("email", "")).strip()
        
        if not recipient_email:
            continue

        subject = f"Акт передачи техники завершен: {act.item_name}"
        body = "\n".join(
            [
                f"Здравствуйте, {recipient_name}!",
                "",
                "Акт приема-передачи техники завершен и подписан всеми сторонами.",
                "",
                f"Техника: {act.item_name}",
                f"Серийный номер: {act.item_serial or 'не указан'}",
                f"Дата выдачи: {act.issue_date.isoformat()}",
            ]
        )

        message = _build_message(
            recipient_email,
            subject,
            body,
        )
        _attach_pdf_if_exists(message, pdf_path, f"act_{act.id}_completed.pdf")
        
        try:
            await _send_message(message, act)
            logger.info(f"Completion email sent to {recipient_name} ({recipient_email}) for act {act.id}")
        except Exception as e:
            logger.error(f"Failed to send completion email to {recipient_email} for act {act.id}: {e}")


async def send_return_completed_email(
    act: Act,
    pdf_path: Path | None = None,
) -> None:
    """
    Отправляет персональное письмо каждому получателю о завершении возврата.
    """
    recipients = _recipient_list(act)
    base_url = settings.APP_BASE_URL or "http://localhost:3000"
    act_url = f"{base_url}/acts/{act.id}"

    for index, recipient in enumerate(recipients):
        recipient_name = str(recipient.get("full_name", "")).strip()
        recipient_email = str(recipient.get("email", "")).strip()
        
        if not recipient_email:
            continue

        subject = f"Акт возврата техники завершен: {act.item_name}"
        body = "\n".join(
            [
                f"Здравствуйте, {recipient_name}!",
                "",
                "Процесс возврата техники завершен и подписан всеми сторонами.",
                "",
                f"Техника: {act.item_name}",
                f"Серийный номер: {act.item_serial or 'не указан'}",
                f"Дата возврата: {act.return_date.isoformat() if act.return_date else 'не указана'}",
            ]
        )

        message = _build_message(
            recipient_email,
            subject,
            body,
        )
        _attach_pdf_if_exists(message, pdf_path, f"act_{act.id}_returned.pdf")
        
        try:
            await _send_message(message, act)
            logger.info(f"Return completion email sent to {recipient_name} ({recipient_email}) for act {act.id}")
        except Exception as e:
            logger.error(f"Failed to send return completion email to {recipient_email} for act {act.id}: {e}")


async def send_version_pdf_email(
    act: Act,
    version_number: int,
    pdf_path: Path | None = None,
) -> None:
    """
    Отправляет персональное письмо каждому получателю с PDF конкретной версии.
    """
    recipients = _recipient_list(act)
    base_url = settings.APP_BASE_URL or "http://localhost:3000"
    act_url = f"{base_url}/acts/{act.id}"
    is_return_version = version_number >= 6

    for index, recipient in enumerate(recipients):
        recipient_name = str(recipient.get("full_name", "")).strip()
        recipient_email = str(recipient.get("email", "")).strip()
        
        if not recipient_email:
            continue

        subject = (
            f"PDF акта возврата: {act.item_name}"
            if is_return_version
            else f"PDF акта передачи: {act.item_name}"
        )
        body = "\n".join(
            [
                f"Здравствуйте, {recipient_name}!",
                "",
                "Направляю вам PDF-документ по вашему акту.",
                (
                    "Во вложении финальная версия акта возврата техники."
                    if is_return_version
                    else "Во вложении финальная версия акта передачи техники."
                ),
                "",
                f"Техника: {act.item_name}",
                f"Версия шага: {version_number}",
                "",
                f"Просмотреть акт: {act_url}",
            ]
        )

        message = _build_message(recipient_email, subject, body)
        _attach_pdf_if_exists(message, pdf_path, f"act_{act.id}_v{version_number}.pdf")
        
        try:
            await _send_message(message, act)
            logger.info(f"Version PDF email sent to {recipient_name} ({recipient_email}) for act {act.id} v{version_number}")
        except Exception as e:
            logger.error(f"Failed to send version PDF email to {recipient_email} for act {act.id}: {e}")
