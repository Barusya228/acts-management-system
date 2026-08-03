from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.acts import _normalize_accessories


def test_manual_accessory_is_normalized_for_snapshot():
    result = _normalize_accessories([{
        "name": " Мышь Logitech ",
        "model": " M185 ",
        "quantity": "2",
        "note": " Чёрная ",
        "requires_return": True,
    }])

    assert result == [{
        "catalog_item_id": None,
        "name": "Мышь Logitech",
        "model": "M185",
        "quantity": 2,
        "note": "Чёрная",
        "requires_return": True,
    }]


@pytest.mark.parametrize("payload", [
    [{"name": "", "quantity": 1}],
    [{"name": "Кабель", "quantity": 0}],
    [{"name": "Кабель", "quantity": "abc"}],
])
def test_invalid_manual_accessory_is_rejected(payload):
    with pytest.raises(HTTPException) as exc_info:
        _normalize_accessories(payload)
    assert exc_info.value.status_code == 422
