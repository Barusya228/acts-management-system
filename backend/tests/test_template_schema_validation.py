import pytest
from fastapi import HTTPException

from app.api.templates import _validate_template_schema


def test_validate_template_schema_success():
    schema = {
        "fields": [
            {"name": "hostname", "label": "Hostname", "type": "string", "required": True},
            {"name": "has_dock", "label": "Док-станция", "type": "boolean", "required": False},
        ]
    }

    normalized = _validate_template_schema(schema)
    assert len(normalized["fields"]) == 2
    assert normalized["fields"][0]["name"] == "hostname"


def test_validate_template_schema_requires_fields_array():
    with pytest.raises(HTTPException) as exc_info:
        _validate_template_schema({"fields": "not-array"})

    assert exc_info.value.status_code == 422


def test_validate_template_schema_rejects_duplicate_names():
    schema = {
        "fields": [
            {"name": "hostname", "label": "Hostname", "type": "string", "required": True},
            {"name": "hostname", "label": "Hostname 2", "type": "string", "required": False},
        ]
    }

    with pytest.raises(HTTPException) as exc_info:
        _validate_template_schema(schema)

    assert exc_info.value.status_code == 422
    assert "дублируется" in str(exc_info.value.detail)


def test_validate_template_schema_rejects_invalid_type():
    schema = {
        "fields": [
            {"name": "hostname", "label": "Hostname", "type": "unknown", "required": True},
        ]
    }

    with pytest.raises(HTTPException) as exc_info:
        _validate_template_schema(schema)

    assert exc_info.value.status_code == 422
    assert "неподдерживаемый type" in str(exc_info.value.detail)
