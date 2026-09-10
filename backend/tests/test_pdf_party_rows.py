import re
from io import BytesIO

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from pypdf import PdfReader

from app.utils.pdf import (
    _build_numbered_party_rows,
    _draw_bottom_signatures,
    _register_font,
    _resolve_bold_font_name,
    build_act_pdf_v2,
)


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


def test_pdf_generation_ipad_advisory_multiple_recipients_signatures():
    act_data = {
        "id": "12345",
        "current_version": 1,
        "status": "ISSUED",
        "party1_name": "Test Transmitter",
        "party2_name": "Test Receiver 1, Test Receiver 2",
        "issue_date": "2026-08-27",
        "item_name": "IPAD",
        "item_serial": None,
        "receiver_email": "receiver1@example.com",
        "return_date": "2027-06-01",
        "return_note": "Returned all devices successfully",
    }
    
    recipients = [
        {"full_name": "Test Receiver 1", "email": "receiver1@example.com"},
        {"full_name": "Test Receiver 2", "email": "receiver2@example.com"},
    ]
    
    extra_data_json = {
        "recipients": recipients,
        "ipad_advisory": {
            "advisory_group": "Advisory Group 9A",
            "academic_year": "2026-2027",
            "students": [
                {
                    "student_name": "Student A",
                    "student_status": "ACTIVE",
                    "ipad_tag": "TAG-A",
                    "serial_number": "SN-A",
                    "imei": "IMEI-A",
                }
            ],
            "appendices": []
        }
    }
    act_data["extra_data_json"] = extra_data_json
    
    pdf_bytes = build_act_pdf_v2(
        act_data=act_data,
        template_name="iPad Advisory Act",
        template_code="IPAD",
        issue_signature_party1_path=None,
        issue_recipient_signature_paths=[None, None],
        return_signature_party1_path=None,
        return_recipient_signature_paths=[None, None],
    )
    
    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 0


def test_ipad_pdf_contains_ru_kz_en_sections_and_translation_notice():
    act_data = {
        "id": "multilingual-act",
        "current_version": 1,
        "status": "COMPLETED",
        "party1_name": "IT Manager",
        "party2_name": "Class Advisor",
        "issue_date": "2026-09-04",
        "item_name": "IPAD",
        "item_serial": None,
        "receiver_email": "advisor@example.com",
        "extra_data_json": {
            "recipients": [{"full_name": "Class Advisor", "email": "advisor@example.com"}],
            "ipad_advisory": {
                "advisory_group": "Grade 5",
                "academic_year": "2026-2027",
                "students": [{
                    "student_name": "Student Name",
                    "student_status": "ACTIVE",
                    "ipad_tag": "12345",
                    "serial_number": "SERIAL-12345",
                }],
                "appendices": [],
            },
        },
    }

    pdf_bytes = build_act_pdf_v2(act_data=act_data, template_code="IPAD")
    reader = PdfReader(BytesIO(pdf_bytes))
    page_texts = [page.extract_text() or "" for page in reader.pages]
    full_text = "\n".join(page_texts)

    assert len(reader.pages) == 3
    assert full_text.index("АКТ ПРИЕМА-ПЕРЕДАЧИ ОБОРУДОВАНИЯ") < full_text.index("ЖАБДЫҚТЫ ҚАБЫЛДАУ-ТАПСЫРУ АКТІСІ")
    assert full_text.index("ЖАБДЫҚТЫ ҚАБЫЛДАУ-ТАПСЫРУ АКТІСІ") < full_text.index("EQUIPMENT HANDOVER AND ACCEPTANCE ACT")
    assert sum("Машинный перевод. Оригинал на русском языке." in page_text for page_text in page_texts) == 2
    assert sum("Student name" in page_text for page_text in page_texts) == 3
    assert "ACT-MULTILINGUAL | RU | 1/3" in page_texts[0]
    assert "ACT-MULTILINGUAL | KZ | 2/3" in page_texts[1]
    assert "ACT-MULTILINGUAL | EN | 3/3" in page_texts[2]


def test_bottom_signatures_start_new_page_before_bottom_margin():
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    font_name = _register_font()
    bold_font_name = _resolve_bold_font_name(font_name)
    page_breaks = 0

    def start_new_page():
        nonlocal page_breaks
        page_breaks += 1
        pdf.showPage()
        return A4[1] - 50

    parties = [{
        "label": f"Сторона {index}:",
        "name": f"Very Long Recipient Full Name Number {index}",
        "sig_path": None,
    } for index in range(1, 16)]

    final_y = _draw_bottom_signatures(
        pdf,
        190,
        A4[0],
        50,
        A4[0] - 50,
        font_name,
        bold_font_name,
        parties,
        start_new_page,
    )
    pdf.save()

    assert page_breaks >= 1
    assert final_y >= 60


def test_large_ipad_pdf_paginates_many_students_and_parties():
    recipients = [
        {"full_name": f"Responsible Person With Long Name {index}", "email": f"person{index}@example.com"}
        for index in range(1, 16)
    ]
    students = [{
        "student_name": f"Student With Long Full Name {index}",
        "student_status": "ACTIVE",
        "ipad_tag": f"TAG-{index:03d}",
        "serial_number": f"SERIAL-{index:03d}",
    } for index in range(1, 91)]
    act_data = {
        "id": "large-ipad-act",
        "current_version": 1,
        "status": "COMPLETED",
        "party1_name": "IT Manager With Long Full Name",
        "party2_name": recipients[0]["full_name"],
        "issue_date": "2026-09-03",
        "item_name": "IPAD",
        "item_serial": None,
        "receiver_email": recipients[0]["email"],
        "extra_data_json": {
            "recipients": recipients,
            "ipad_advisory": {
                "advisory_group": "Large Advisory Group",
                "academic_year": "2026-2027",
                "students": students,
                "appendices": [],
            },
        },
    }

    pdf_bytes = build_act_pdf_v2(
        act_data=act_data,
        template_name="iPad Advisory Act",
        template_code="IPAD",
    )

    page_count = len(re.findall(rb"/Type\s*/Page(?!s)", pdf_bytes))
    assert page_count >= 12
