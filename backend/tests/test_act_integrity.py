import base64
from io import BytesIO
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from PIL import Image

from app.api.acts import (
    _normalize_recipients,
    _sign_recipient,
    _validate_party1_signer,
    _validate_signature,
)


def _png_data_url(color=(0, 0, 0, 255)) -> str:
    image = Image.new("RGBA", (8, 8), color)
    output = BytesIO()
    image.save(output, format="PNG")
    return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode()


def test_client_signature_metadata_is_discarded():
    recipients = _normalize_recipients([{
        "participant_id": "4cebaea3-4633-4e65-a612-a0b1807fc7c0",
        "full_name": "Иван Иванов",
        "email": "ivan@example.com",
        "signed_at": "2000-01-01T00:00:00",
        "signature_file_path": "../../forged.png",
        "return_signed_at": "2000-01-01T00:00:00",
        "return_signature_file_path": "../../forged-return.png",
    }], preserve_signature_state=False)

    assert recipients[0]["signed_at"] is None
    assert recipients[0]["signature_file_path"] is None
    assert recipients[0]["return_signed_at"] is None
    assert recipients[0]["return_signature_file_path"] is None


def test_recipient_signature_must_match_expected_participant():
    act = SimpleNamespace(
        extra_data_json={"recipients": [{
            "participant_id": "4cebaea3-4633-4e65-a612-a0b1807fc7c0",
            "full_name": "Иван Иванов",
            "email": "ivan@example.com",
        }]},
        party2_name="Иван Иванов",
        receiver_email="ivan@example.com",
    )
    with pytest.raises(HTTPException) as exc_info:
        _sign_recipient(
            act,
            _png_data_url(),
            participant_id="82cc30a6-c937-427b-b454-c80c8cbd4d72",
        )
    assert exc_info.value.status_code == 409


def test_party1_signature_must_match_selected_manager():
    act = SimpleNamespace(extra_data_json={
        "party1_participant_id": "4cebaea3-4633-4e65-a612-a0b1807fc7c0",
    })
    with pytest.raises(HTTPException) as exc_info:
        _validate_party1_signer(act, "82cc30a6-c937-427b-b454-c80c8cbd4d72")
    assert exc_info.value.status_code == 409


def test_blank_signature_is_rejected():
    with pytest.raises(HTTPException) as exc_info:
        _validate_signature(_png_data_url((255, 255, 255, 0)))
    assert exc_info.value.status_code == 422


def test_non_blank_signature_is_accepted():
    _validate_signature(_png_data_url())
