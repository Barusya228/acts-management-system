"""Общие хелперы жизненного цикла акта.

Раньше эти функции были приватными в ``app.api.acts``, а ``app.api.ipad_acts``
импортировал их через подчёркивание — рефакторинг acts ломал iPad-поток.
Теперь это публичный, тестируемый контракт для обоих роутеров.
"""

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.db.models import Participant, ParticipantEmploymentStatus, ParticipantKind, Template
from app.services.recipients import RECIPIENTS_KEY  # noqa: F401 — реэкспорт для роутеров
from app.utils.storage import validate_signature_data_url

# Ключи extra_data_json, используемые обоими роутерами.
PARTY1_PARTICIPANT_ID_KEY = "party1_participant_id"


def build_party2_summary(recipients: list[dict]) -> str:
    """Короткая подпись «кто получает» для party2_name."""
    if not recipients:
        return ""
    if len(recipients) == 1:
        return recipients[0]["full_name"]
    return f"{recipients[0]['full_name']} и еще {len(recipients) - 1}"


def get_primary_recipient_email(recipients: list[dict]) -> str:
    """Первый непустой email — для receiver_email."""
    for recipient in recipients:
        email = str(recipient.get("email", "")).strip()
        if email:
            return email
    return ""


def require_active_template(template: Template) -> None:
    if not template.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Выбранный шаблон отключён и недоступен для новых актов",
        )


def get_selectable_participant(
    db: Session,
    participant_id: object,
    allowed_kinds: set[ParticipantKind],
    label: str,
) -> Participant:
    """Участник для новой роли в акте: существует, активен, не выбыл, подходит по типу."""
    try:
        normalized_id = UUID(str(participant_id))
    except (TypeError, ValueError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Выберите {label} из справочника участников",
        )

    participant = db.query(Participant).filter(Participant.id == normalized_id).first()
    if not participant:
        raise HTTPException(status_code=404, detail=f"{label.capitalize()} не найден")
    if participant.employment_status == ParticipantEmploymentStatus.DEPARTED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Нельзя создать новый акт: {participant.full_name} выбыл",
        )
    if not participant.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Нельзя создать новый акт: {participant.full_name} неактивен",
        )
    if participant.kind not in allowed_kinds:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Участник {participant.full_name} не подходит для роли «{label}»",
        )
    return participant


def validate_signature(signature_data: str) -> None:
    """Подпись: корректный data-URL, PNG/JPEG, не пустая."""
    try:
        validate_signature_data_url(signature_data)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )
