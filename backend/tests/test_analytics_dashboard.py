import uuid
from datetime import datetime, timedelta

from app.db.models import AuditLog, DeviceStatus, EmailOutbox, InventoryDevice
from tests.conftest import admin_headers, requires_postgres


pytestmark = requires_postgres


def test_dashboard_includes_operational_counters_and_five_recent_actions(http_env):
    client, db, admin, _signer = http_env
    headers = admin_headers(client)

    device_statuses = [
        DeviceStatus.AVAILABLE,
        DeviceStatus.ISSUED,
        DeviceStatus.MAINTENANCE,
        DeviceStatus.MAINTENANCE,
        DeviceStatus.RETIRED,
        DeviceStatus.PAPER_ISSUED,
        DeviceStatus.PAPER_ISSUED,
        DeviceStatus.PAPER_ISSUED,
    ]
    devices = [
        InventoryDevice(
            inventory_number=f"DASH-{index}",
            name=f"Dashboard device {index}",
            category="test",
            serial_number=f"DASH-SERIAL-{index}",
            status=status,
        )
        for index, status in enumerate(device_statuses)
    ]

    outbox_rows = [
        EmailOutbox(
            kind=kind,
            recipient_email=f"recipient-{index}@example.com",
            subject="Dashboard test",
            body="Dashboard test",
            dedupe_key=f"dashboard-{index}",
            status=status,
        )
        for index, (kind, status) in enumerate([
            ("ISSUE_COMPLETED", "PENDING"),
            ("MANUAL_FINAL", "PROCESSING"),
            ("RETURN_COMPLETED", "DEAD"),
            ("REMINDER", "SENT"),
        ])
    ]

    audit_base = datetime(2026, 1, 1, 12, 0, 0)
    audit_rows = [
        AuditLog(
            user_id=admin.id,
            entity_type="DASHBOARD_TEST",
            entity_id=uuid.uuid4(),
            action=f"ACTION_{index}",
            created_at=audit_base + timedelta(minutes=index),
        )
        for index in range(6)
    ]
    db.add_all(devices + outbox_rows + audit_rows)
    db.commit()

    response = client.get("/api/analytics/dashboard", headers=headers)

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["email"] == {"queued": 2, "errors": 1}
    assert payload["devices"] == {
        "available": 1,
        "issued": 1,
        "maintenance": 2,
        "retired": 1,
        "paper_issued": 3,
    }
    assert set(payload["acts"]) == {"pending", "completed", "return_in_progress"}
    assert set(payload["ipads"]) == {
        "available",
        "issued",
        "reserved",
        "return_pending",
        "maintenance",
        "retired",
    }
    assert len(payload["recent_actions"]) == 5
    assert [item["action"] for item in payload["recent_actions"]] == [
        "ACTION_5",
        "ACTION_4",
        "ACTION_3",
        "ACTION_2",
        "ACTION_1",
    ]
