from io import BytesIO
import os

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader


def _register_font() -> str:
    candidates = [
        ("DejaVuSans", "C:/Windows/Fonts/DejaVuSans.ttf"),
        ("Arial", "C:/Windows/Fonts/arial.ttf"),
    ]

    for font_name, font_path in candidates:
        try:
            pdfmetrics.registerFont(TTFont(font_name, font_path))
            return font_name
        except Exception:
            continue

    return "Helvetica"


def build_act_pdf_bytes(
    act_data: dict,
    template_name: str | None = None,
    issue_signature_party1_path: str | None = None,
    issue_signature_party2_path: str | None = None,
    return_signature_party1_path: str | None = None,
    return_signature_party2_path: str | None = None,
) -> bytes:
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    font_name = _register_font()

    y = height - 50

    def line(text: str, size: int = 12, gap: int = 22) -> None:
        nonlocal y
        pdf.setFont(font_name, size)
        pdf.drawString(50, y, text)
        y -= gap

    pdf.setTitle(f"Act {act_data['id']}")

    line("Acts Digitalization System", 16, 28)
    line("Акт приема-передачи техники", 14, 30)
    if template_name:
        line(f"Шаблон: {template_name}")
    line(f"ID акта: {act_data['id']}")
    line(f"Версия: {act_data['current_version']}")
    line(f"Статус: {act_data['status']}")
    line("")
    line(f"Передающая сторона: {act_data['party1_name']}")
    line(f"Получающая сторона: {act_data['party2_name']}")
    line(f"Дата выдачи: {act_data['issue_date']}")
    line(f"Наименование техники: {act_data['item_name']}")
    if act_data.get("item_serial"):
        line(f"Серийный номер: {act_data['item_serial']}")
    line(f"Email получателя: {act_data['receiver_email']}")

    if act_data.get("return_date"):
        line("")
        line("Блок возврата:", 12, 20)
        line(f"Дата возврата: {act_data['return_date']}")
        if act_data.get("return_note"):
            line(f"Комментарий возврата: {act_data['return_note']}")

    extra_data = act_data.get("extra_data_json") or {}
    if extra_data:
        line("")
        line("Дополнительные поля:", 12, 20)
        for key, value in extra_data.items():
            line(f"{key}: {value}", 11, 18)

    line("")
    line("Блок выдачи:", 12, 20)

    def draw_signature(label: str, signature_path: str | None) -> None:
        nonlocal y
        line(label, 11, 16)

        if signature_path and os.path.exists(signature_path):
            try:
                image = ImageReader(signature_path)
                img_width = 200
                img_height = 60
                if y - img_height < 40:
                    pdf.showPage()
                    y = height - 50
                pdf.drawImage(image, 50, y - img_height, width=img_width, height=img_height, preserveAspectRatio=True, mask="auto")
                y -= (img_height + 12)
                return
            except Exception:
                pass

        line("(подпись отсутствует)", 10, 16)

    draw_signature("Подпись стороны 1 (кто дает):", issue_signature_party1_path)
    draw_signature("Подпись стороны 2 (кто берет):", issue_signature_party2_path)

    if act_data.get("return_date") or act_data.get("return_note"):
        line("")
        line("Блок возврата:", 12, 20)
        if act_data.get("return_date"):
            line(f"Дата возврата: {act_data['return_date']}")
        if act_data.get("return_note"):
            line(f"Комментарий возврата: {act_data['return_note']}")
        draw_signature("Подпись стороны 1 (принимает возврат):", return_signature_party1_path)
        draw_signature("Подпись стороны 2 (возвращает технику):", return_signature_party2_path)

    line("")
    line("Документ сформирован автоматически системой.", 10, 18)

    pdf.showPage()
    pdf.save()
    return buffer.getvalue()
