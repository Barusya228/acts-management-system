from app.db.models import InventoryCategory
from tests.conftest import admin_headers, requires_postgres


pytestmark = requires_postgres


def test_custom_inventory_status_is_created_reused_and_filterable(http_env):
    client, db, _admin, _signer = http_env
    headers = admin_headers(client)
    db.add(InventoryCategory(code="notebook", name="Ноутбук", icon="💻", is_system=True))
    db.commit()

    created_status = client.post(
        "/api/inventory/statuses",
        headers=headers,
        json={"name": "На диагностике"},
    )
    assert created_status.status_code == 201, created_status.text
    status_code = created_status.json()["code"]

    created_device = client.post(
        "/api/inventory",
        headers=headers,
        json={
            "inventory_number": "CUSTOM-STATUS-1",
            "barcode": "CUSTOM-BARCODE-1",
            "name": "Test notebook",
            "category": "notebook",
            "serial_number": "CUSTOM-STATUS-1",
            "status": status_code,
        },
    )
    assert created_device.status_code == 201, created_device.text
    assert created_device.json()["status"] == status_code

    filtered = client.get(f"/api/inventory?status={status_code}", headers=headers)
    assert filtered.status_code == 200, filtered.text
    assert filtered.json()["total"] == 1
    assert filtered.json()["items"][0]["inventory_number"] == "CUSTOM-STATUS-1"

    statuses = client.get("/api/inventory/statuses", headers=headers)
    assert statuses.status_code == 200, statuses.text
    assert any(item["code"] == status_code and item["name"] == "На диагностике" for item in statuses.json())


def test_unknown_inventory_status_is_rejected(http_env):
    client, db, _admin, _signer = http_env
    headers = admin_headers(client)
    db.add(InventoryCategory(code="notebook", name="Ноутбук", icon="💻", is_system=True))
    db.commit()

    response = client.post(
        "/api/inventory",
        headers=headers,
        json={
            "inventory_number": "UNKNOWN-STATUS-1",
            "barcode": "UNKNOWN-BARCODE-1",
            "name": "Test notebook",
            "category": "notebook",
            "serial_number": "UNKNOWN-STATUS-1",
            "status": "does-not-exist",
        },
    )

    assert response.status_code == 422
