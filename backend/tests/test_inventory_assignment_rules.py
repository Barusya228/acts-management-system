import pytest
from fastapi import HTTPException

from app.api.acts import _parse_device_id


def test_inventory_device_id_is_required():
    with pytest.raises(HTTPException) as exc_info:
        _parse_device_id(None, "устройство")
    assert exc_info.value.status_code == 422


def test_valid_inventory_device_id_is_accepted():
    device_id = "4cebaea3-4633-4e65-a612-a0b1807fc7c0"
    assert str(_parse_device_id(device_id, "устройство")) == device_id
