from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.acts import _validate_extra_data


def make_template(fields):
    return SimpleNamespace(schema_json={"fields": fields})


def test_validate_extra_data_accepts_valid_payload():
    template = make_template(
        [
            {"name": "hostname", "type": "string", "required": True},
            {"name": "has_dock", "type": "boolean", "required": False},
        ]
    )

    payload = {"hostname": "NB-001", "has_dock": True}
    normalized = _validate_extra_data(payload, template)

    assert normalized == payload


def test_validate_extra_data_rejects_unknown_field():
    template = make_template(
        [{"name": "hostname", "type": "string", "required": False}]
    )

    with pytest.raises(HTTPException) as exc_info:
        _validate_extra_data({"unknown": "x"}, template)

    assert exc_info.value.status_code == 422
    assert "не поддерживаются" in str(exc_info.value.detail)


def test_validate_extra_data_requires_required_field():
    template = make_template(
        [{"name": "hostname", "type": "string", "required": True}]
    )

    with pytest.raises(HTTPException) as exc_info:
        _validate_extra_data({}, template)

    assert exc_info.value.status_code == 422
    assert "обязательно" in str(exc_info.value.detail)


def test_validate_extra_data_rejects_invalid_type():
    template = make_template(
        [{"name": "has_dock", "type": "boolean", "required": False}]
    )

    with pytest.raises(HTTPException) as exc_info:
        _validate_extra_data({"has_dock": "yes"}, template)

    assert exc_info.value.status_code == 422
    assert "неверный тип" in str(exc_info.value.detail)


def test_validate_extra_data_allows_equipment_list():
    template = make_template(
        [{"name": "hostname", "type": "string", "required": False}]
    )

    payload = {
        "hostname": "NB-001",
        "equipment_list": [
            {"name": "Dock", "serial": "D-10"},
            {"name": "", "serial": ""},
        ],
    }
    normalized = _validate_extra_data(payload, template)

    assert normalized["hostname"] == "NB-001"
    assert normalized["equipment_list"] == [{"name": "Dock", "serial": "D-10"}]


def test_validate_extra_data_rejects_invalid_equipment_list_type():
    template = make_template(
        [{"name": "hostname", "type": "string", "required": False}]
    )

    with pytest.raises(HTTPException) as exc_info:
        _validate_extra_data({"equipment_list": "bad"}, template)

    assert exc_info.value.status_code == 422
    assert "equipment_list" in str(exc_info.value.detail)
