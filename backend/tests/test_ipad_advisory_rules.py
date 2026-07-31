from types import SimpleNamespace

from app.api.ipad_acts import _serialize


def test_ipad_act_serialization_separates_responsibles_and_students():
    act = SimpleNamespace(
        id="25cb320a-2719-43b3-8836-7be09b8bbf3e",
        template_id="d54b20fa-ae67-4fc1-a039-5228159af43f",
        ipad_profile=SimpleNamespace(advisory_group="7A / Edison", academic_year="2026-2027"),
        issue_date=SimpleNamespace(isoformat=lambda: "2026-07-30"),
        party1_name="IT Manager",
        extra_data_json={
            "party1_participant_id": "941cce9e-d35e-42ce-b38a-2cdde40b300c",
            "recipients": [{"participant_id": "responsible", "full_name": "Responsible"}],
        },
        status=SimpleNamespace(value="DRAFT"),
        current_version=1,
        ipad_assignments=[SimpleNamespace(
            id="2d27455d-a28a-4258-86dd-9ca58b059e22",
            student_name="Student",
            student_status="ACTIVE",
            ipad_name="iPad",
            ipad_model="10th Gen",
            ipad_tag="IPAD-001",
            serial_number=None,
            imei=None,
            note=None,
            status="RESERVED",
            events=[],
        )],
    )

    result = _serialize(act)

    assert result["responsibles"][0]["full_name"] == "Responsible"
    assert result["students"][0]["student_name"] == "Student"
    assert result["students"][0]["ipad_tag"] == "IPAD-001"
