from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.acts import _require_active_template


def test_active_template_is_available_for_new_act():
    _require_active_template(SimpleNamespace(is_active=True))


def test_disabled_template_is_rejected_for_new_act():
    with pytest.raises(HTTPException) as exc_info:
        _require_active_template(SimpleNamespace(is_active=False))

    assert exc_info.value.status_code == 409
    assert "отключён" in str(exc_info.value.detail)
