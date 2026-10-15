from datetime import date
import base64
from io import BytesIO

from openpyxl import Workbook
from app.db.models import Act, ActStatus, IpadDevice, IpadStudentAssignment, Template
from tests.conftest import admin_headers, requires_postgres


pytestmark = requires_postgres


def test_ipad_csv_sync_previews_and_applies_safe_changes(http_env):
    client, db, admin, _signer = http_env
    headers = admin_headers(client)
    template = Template(code="IPAD", name="iPad Advisory", schema_json={"fields": []}, is_active=True)
    active = IpadDevice(device_name="iPad", model="Active model", tag="100", serial_number="ACTIVE-SERIAL", status="ISSUED")
    historical = IpadDevice(device_name="iPad", model="History model", tag="200", serial_number="HISTORY-SERIAL", status="AVAILABLE")
    stale = IpadDevice(device_name="iPad", model="Stale model", tag="300", serial_number="STALE-SERIAL", status="AVAILABLE")
    update = IpadDevice(device_name="iPad", model="Old model", tag="400", serial_number="UPDATE-SERIAL", status="AVAILABLE")
    maintenance = IpadDevice(device_name="iPad", model="Repair model", tag="500", serial_number="MAINT-SERIAL", status="MAINTENANCE")
    db.add_all([template, active, historical, stale, update, maintenance])
    db.flush()
    act = Act(
        template_id=template.id,
        party1_name="IT Manager",
        party2_name="Advisor",
        issue_date=date.today(),
        item_name="Advisory iPad",
        receiver_email="advisor@example.com",
        extra_data_json={},
        status=ActStatus.COMPLETED,
        created_by=admin.id,
    )
    db.add(act)
    db.flush()
    db.add_all([
        IpadStudentAssignment(
            act_id=act.id,
            ipad_device_id=active.id,
            student_name="Active Student",
            ipad_name=active.device_name,
            ipad_model=active.model,
            ipad_tag=active.tag,
            serial_number=active.serial_number,
            status="ISSUED",
        ),
        IpadStudentAssignment(
            act_id=act.id,
            ipad_device_id=historical.id,
            student_name="Former Student",
            student_status="DEPARTED",
            ipad_name=historical.device_name,
            ipad_model=historical.model,
            ipad_tag=historical.tag,
            serial_number=historical.serial_number,
            status="RETURNED",
        ),
    ])
    db.commit()

    csv_text = "\n".join([
        '100,"Changed active model",iPad,ACTIVE-SERIAL,"Assigned User","Grade 5 A"',
        '401,"New model",iPad,UPDATE-SERIAL,,',
        '600,"New iPad model",iPad,NEW-SERIAL,,',
        '700,"Externally assigned",iPad,CONFLICT-SERIAL,"External User","Grade 6 B"',
    ])
    preview = client.post(
        "/api/ipad-inventory/sync/preview",
        headers=headers,
        json={"csv_text": csv_text},
    )

    assert preview.status_code == 200, preview.text
    summary = preview.json()["summary"]
    assert summary["add"] == 2
    assert summary["update"] == 1
    assert summary["delete"] == 0
    assert summary["archive"] == 0
    assert summary["keep_existing"] == 3
    assert summary["keep_active"] == 1
    assert summary["conflict"] == 0
    assert preview.json()["can_apply"] is True

    applied = client.post(
        "/api/ipad-inventory/sync/apply",
        headers=headers,
        json={"csv_text": csv_text},
    )
    assert applied.status_code == 200, applied.text

    assert db.query(IpadDevice).filter(IpadDevice.serial_number == "STALE-SERIAL").one().id == stale.id
    externally_named = db.query(IpadDevice).filter(IpadDevice.serial_number == "CONFLICT-SERIAL").one()
    assert externally_named.status == "AVAILABLE"
    assert externally_named.device_name == "iPad"
    new_device = db.query(IpadDevice).filter(IpadDevice.serial_number == "NEW-SERIAL").one()
    assert new_device.status == "AVAILABLE"
    updated = db.query(IpadDevice).filter(IpadDevice.serial_number == "UPDATE-SERIAL").one()
    assert updated.tag == "401"
    assert updated.model == "New model"
    db.refresh(active)
    db.refresh(historical)
    db.refresh(maintenance)
    assert active.tag == "100"
    assert active.model == "Active model"
    assert active.is_archived is False
    assert historical.is_archived is False
    assert maintenance.is_archived is False
    assert maintenance.status == "MAINTENANCE"

    hidden = client.get("/api/ipad-inventory?search=HISTORY-SERIAL", headers=headers)
    visible = client.get("/api/ipad-inventory?search=HISTORY-SERIAL&include_archived=true", headers=headers)
    assert hidden.json()["total"] == 1
    assert visible.json()["total"] == 1
    assert visible.json()["items"][0]["is_archived"] is False

    repeated = client.post(
        "/api/ipad-inventory/sync/apply", headers=headers, json={"csv_text": csv_text},
    )
    assert repeated.status_code == 200, repeated.text
    assert repeated.json()["safe_changes"] == 0
    assert db.query(IpadDevice).count() == 7


def test_ipad_csv_sync_blocks_duplicate_serial(http_env):
    client, _db, _admin, _signer = http_env
    headers = admin_headers(client)
    csv_text = "\n".join([
        "100,Model,iPad,SERIAL-1,,",
        "100,Model,iPad,SERIAL-1,,",
    ])

    preview = client.post(
        "/api/ipad-inventory/sync/preview",
        headers=headers,
        json={"csv_text": csv_text},
    )
    applied = client.post(
        "/api/ipad-inventory/sync/apply",
        headers=headers,
        json={"csv_text": csv_text},
    )

    assert preview.status_code == 200, preview.text
    assert preview.json()["can_apply"] is False
    assert len(preview.json()["blocking_errors"]) == 1
    assert applied.status_code == 422


def test_partial_ipad_list_merges_by_serial_without_removing_other_records(http_env):
    client, db, _admin, _signer = http_env
    headers = admin_headers(client)
    changed = IpadDevice(device_name="Old name", tag="100", serial_number="AbC123", status="AVAILABLE")
    untouched = IpadDevice(device_name="iPad", tag="200", serial_number="OTHER", status="AVAILABLE")
    archived = IpadDevice(device_name="iPad", tag="300", serial_number="ARCHIVED", status="AVAILABLE", is_archived=True)
    db.add_all([changed, untouched, archived])
    db.commit()
    response = client.post("/api/ipad-inventory/sync/apply", headers=headers, json={
        "csv_text": "101,Updated model,Ignored name, abc123 ,,\n400,New model,iPad,NEW,,",
    })
    assert response.status_code == 200, response.text
    assert response.json()["summary"]["delete"] == 0
    assert response.json()["summary"]["archive"] == 0
    assert db.query(IpadDevice).count() == 4
    db.refresh(changed)
    db.refresh(untouched)
    db.refresh(archived)
    assert changed.serial_number == "AbC123"
    assert changed.tag == "101"
    assert changed.model == "Updated model"
    assert changed.device_name == "iPad"
    assert untouched.tag == "200"
    assert untouched.is_archived is False
    assert archived.is_archived is True


def test_ipad_sync_keeps_duplicate_tags_and_warns_without_blocking(http_env):
    client, db, _admin, _signer = http_env
    headers = admin_headers(client)
    protected = IpadDevice(device_name="iPad", tag="100", serial_number="PROTECTED", status="RESERVED")
    existing = IpadDevice(device_name="iPad", tag="200", serial_number="EXISTING", status="AVAILABLE")
    db.add_all([protected, existing])
    db.commit()
    csv_text = "\n".join([
        "100,Model,iPad,NEW-1,,",
        "100,Model,iPad,NEW-2,,",
        "100,Model,iPad,EXISTING,,",
    ])
    payload = {"csv_text": csv_text}
    preview = client.post("/api/ipad-inventory/sync/preview", headers=headers, json=payload)
    assert preview.status_code == 200, preview.text
    data = preview.json()
    assert data["can_apply"] is True
    assert data["blocking_errors"] == []
    assert data["summary"]["conflict"] == 0
    assert data["summary"]["duplicate_tags"] == 1
    assert data["summary"]["add"] == 2
    assert data["summary"]["update"] == 1
    assert all(item["duplicate_tag_count"] == 4 for item in data["rows"] + data["missing_devices"])

    applied = client.post("/api/ipad-inventory/sync/apply", headers=headers, json=payload)
    assert applied.status_code == 200, applied.text
    assert db.query(IpadDevice).filter(IpadDevice.tag == "100").count() == 4
    db.refresh(protected)
    assert protected.status == "RESERVED"
    assert protected.is_archived is False
    listed = client.get("/api/ipad-inventory?duplicate_tags_only=true", headers=headers)
    assert listed.status_code == 200
    assert listed.json()["total"] == 4


def test_ipad_sync_accepts_xlsx_upload(http_env):
    client, _db, _admin, _signer = http_env
    headers = admin_headers(client)
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.append(["Tag", "Model", "Device name", "Serial Number", "Assigned user", "Group"])
    worksheet.append([46570, "iPad 7th Gen 10.2-inch (WiFi)", "iPad", "DMPCVBV2MF3R", "", ""])
    output = BytesIO()
    workbook.save(output)
    workbook.close()

    response = client.post(
        "/api/ipad-inventory/sync/preview",
        headers=headers,
        json={
            "file_name": "ipads.xlsx",
            "file_base64": base64.b64encode(output.getvalue()).decode(),
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()["summary"]["add"] == 1
    assert response.json()["rows"][0]["tag"] == "46570"
    assert response.json()["rows"][0]["serial_number"] == "DMPCVBV2MF3R"


def test_ipad_sync_unwraps_mdm_csv_and_ignores_user_and_group_columns(http_env):
    client, _db, _admin, _signer = http_env
    headers = admin_headers(client)
    csv_text = "\n".join([
        '"Tags,Model,""Device name"",""Serial Number"",""Asset Tag"",""Shared Device Group Name"""',
        '"46303,""iPad mini (5th generation)"",""C3 science iPad 09"",DMPD42JGLM94,""C3 science iPad 09"",""HTA science"""',
        '"26886,""iPad mini (5th generation)"",iPad,DMPYL3FCLM94,""Ospanov Meirali"",-"',
    ])

    response = client.post(
        "/api/ipad-inventory/sync/preview",
        headers=headers,
        json={"csv_text": csv_text},
    )

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["blocking_errors"] == []
    assert data["summary"]["input_rows"] == 2
    assert data["summary"]["add"] == 2
    assert data["summary"]["conflict"] == 0
    assert data["rows"][0]["assigned_user"] == ""
    assert data["rows"][0]["group"] == ""
    assert data["rows"][1]["assigned_user"] == ""
    assert all(row["device_name"] == "iPad" for row in data["rows"])
