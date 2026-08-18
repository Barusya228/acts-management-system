"""Единый доменный модуль получателей акта.

Все данные о получателях живут в ``Act.extra_data_json["recipients"]``.
Раньше извлечение дублировалось в acts, email, reminders, analytics и PDF —
каждая копия с чуть разными fallback. Теперь любое чтение идёт отсюда.

Формат записи получателя:
    participant_id, full_name, email,
    signed_at, signature_file_path,
    return_signed_at, return_signature_file_path
"""

from typing import Optional

from app.db.models import Act

RECIPIENTS_KEY = "recipients"


def _blank_signature_fields() -> dict:
    return {
        "signed_at": None,
        "signature_file_path": None,
        "return_signed_at": None,
        "return_signature_file_path": None,
    }


def extract_recipients(
    extra_data: Optional[dict],
    fallback_name: str = "",
    fallback_email: str = "",
) -> list[dict]:
    """Возвращает получателей акта; для старых актов без списка — fallback
    из party2_name/receiver_email. Никогда не бросает исключений: чтение
    должно работать даже для повреждённых данных."""
    payload = extra_data if isinstance(extra_data, dict) else {}
    raw = payload.get(RECIPIENTS_KEY)
    recipients: list[dict] = []
    if isinstance(raw, list):
        for item in raw:
            if not isinstance(item, dict):
                continue
            full_name = str(item.get("full_name", "")).strip()
            email = str(item.get("email", "")).strip()
            if not full_name and not email:
                continue
            recipients.append({
                "participant_id": str(item["participant_id"]).strip() or None if item.get("participant_id") is not None else None,
                "full_name": full_name,
                "email": email,
                "signed_at": item.get("signed_at") if isinstance(item.get("signed_at"), str) else None,
                "signature_file_path": item.get("signature_file_path") if isinstance(item.get("signature_file_path"), str) else None,
                "return_signed_at": item.get("return_signed_at") if isinstance(item.get("return_signed_at"), str) else None,
                "return_signature_file_path": item.get("return_signature_file_path") if isinstance(item.get("return_signature_file_path"), str) else None,
            })
    if recipients:
        return recipients

    fallback_name = (fallback_name or "").strip()
    fallback_email = (fallback_email or "").strip()
    if not fallback_name and not fallback_email:
        return []
    return [{
        "participant_id": None,
        "full_name": fallback_name,
        "email": fallback_email,
        **_blank_signature_fields(),
    }]


def act_recipients(act: Act) -> list[dict]:
    """Получатели конкретного акта с учётом legacy-fallback."""
    return extract_recipients(act.extra_data_json, act.party2_name, act.receiver_email)


def pending_recipients(act: Act, return_flow: bool = False) -> list[dict]:
    """Получатели, ещё не подписавшие текущий этап (выдачу или возврат)."""
    key = "return_signed_at" if return_flow else "signed_at"
    return [item for item in act_recipients(act) if not item.get(key)]


def recipient_emails(act: Act) -> list[str]:
    """Уникальные непустые email получателей, в нижнем регистре."""
    seen: set[str] = set()
    emails: list[str] = []
    for item in act_recipients(act):
        email = str(item.get("email", "")).strip().lower()
        if email and email not in seen:
            seen.add(email)
            emails.append(email)
    return emails
