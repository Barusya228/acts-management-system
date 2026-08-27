from app.utils.pdf import _build_numbered_party_rows, build_act_pdf_v2


def test_multiple_recipients_are_numbered_as_separate_parties():
    rows = _build_numbered_party_rows(
        "IT Manager",
        [
            {"full_name": "First Recipient", "email": "first@example.com"},
            {"full_name": "Second Recipient", "email": "second@example.com"},
        ],
        "party1.png",
        ["party2.png", "party3.png"],
        "Принимает возврат",
        "Возвращает технику",
    )

    assert [row[0] for row in rows] == [
        "Сторона 1\n(Принимает возврат)",
        "Сторона 2\n(Возвращает технику)",
        "Сторона 3\n(Возвращает технику)",
    ]
    assert [row[2] for row in rows] == ["party1.png", "party2.png", "party3.png"]


def test_sparse_signatures_keep_their_recipient_positions():
    rows = _build_numbered_party_rows(
        "IT Manager",
        [
            {"full_name": "First Recipient", "email": "first@example.com"},
            {"full_name": "Second Recipient", "email": "second@example.com"},
        ],
        "party1.png",
        [None, "party3.png"],
        "Принимает возврат",
        "Возвращает технику",
    )

    assert [row[2] for row in rows] == ["party1.png", None, "party3.png"]


def test_pdf_generation_with_many_students():
    act_data = {
        "id": "12345",
        "current_version": 1,
        "status": "ISSUED",
        "party1_name": "Test Transmitter",
        "party2_name": "Test Receiver",
        "issue_date": "2026-08-27",
        "item_name": "IPAD",
        "item_serial": "SERIAL123",
        "receiver_email": "receiver@example.com",
    }
    
    students = []
    for idx in range(1, 26):
        students.append({
            "id": f"student_{idx}",
            "student_name": f"Student Very Long Name Number {idx}",
            "student_status": "ACTIVE",
            "ipad_name": f"iPad {idx}",
            "ipad_model": "iPad 10.2",
            "ipad_tag": f"TAG-{idx}",
            "serial_number": f"SN{idx:05d}",
            "imei": f"IMEI{idx:05d}",
            "note": "",
            "status": "ACTIVE",
            "events": []
        })
        
    extra_data_json = {
        "ipad_advisory": {
            "advisory_group": "Advisory Group 9A",
            "academic_year": "2026-2027",
            "students": students,
            "appendices": []
        }
    }
    
    act_data["extra_data_json"] = extra_data_json
    
    pdf_bytes = build_act_pdf_v2(
        act_data=act_data,
        template_name="iPad Advisory Act",
        template_code="IPAD",
    )
    
    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 0
