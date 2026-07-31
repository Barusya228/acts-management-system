from types import SimpleNamespace

from app.services.ipad_appendix_service import serialize_appendix


def test_serialize_signed_ipad_appendix():
    appendix = SimpleNamespace(
        id="7774e6b0-a675-4f4a-98ca-82f258e78f62",
        act_id="25cb320a-2719-43b3-8836-7be09b8bbf3e",
        appendix_number=2,
        operation_type="IPAD_REPLACEMENT",
        status="APPLIED",
        responsible_participant_id="d1773127-6711-44c5-958f-a8710853a23e",
        responsible=SimpleNamespace(full_name="Responsible Person"),
        issuer_participant_id="47b84478-774f-471e-921e-0d710a2a2a86",
        issuer=SimpleNamespace(full_name="IT Manager"),
        payload_json={"student_name": "Student", "reason": "Broken screen"},
        responsible_signed_at=None,
        issuer_signed_at=None,
        created_at=SimpleNamespace(isoformat=lambda: "2026-07-31T10:00:00"),
        applied_at=SimpleNamespace(isoformat=lambda: "2026-07-31T10:05:00"),
        pdf_storage_path="acts/test/appendix.pdf",
    )

    result = serialize_appendix(appendix)

    assert result["appendix_number"] == 2
    assert result["operation_type"] == "IPAD_REPLACEMENT"
    assert result["responsible_name"] == "Responsible Person"
    assert result["pdf_available"] is True
