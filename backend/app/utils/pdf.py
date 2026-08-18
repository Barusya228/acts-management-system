from io import BytesIO
import os
from collections.abc import Callable

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Table, TableStyle
from reportlab.lib import colors


class _NumberedReferenceCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self._saved_page_states: list[dict] = []
        self._reference_drawer: Callable[[canvas.Canvas, int, int], None] | None = None

    def set_reference_drawer(self, drawer: Callable[[canvas.Canvas, int, int], None]) -> None:
        self._reference_drawer = drawer

    def showPage(self) -> None:
        self._saved_page_states.append(dict(self.__dict__))
        start_page = getattr(self, "_startPage", None)
        if callable(start_page):
            start_page()

    def save(self) -> None:
        self._saved_page_states.append(dict(self.__dict__))
        total_pages = len(self._saved_page_states)

        for page_number, state in enumerate(self._saved_page_states, start=1):
            self.__dict__.update(state)
            if self._reference_drawer:
                self._reference_drawer(self, page_number, total_pages)
            canvas.Canvas.showPage(self)

        canvas.Canvas.save(self)


def _format_act_reference(act_id: str | None) -> str:
    raw_id = str(act_id or "-").strip()
    short_id = raw_id.split("-")[0].upper()
    return f"ACT-{short_id}"


def _draw_page_reference(
    pdf: canvas.Canvas,
    font_name: str,
    act_reference: str,
    page_number: int,
    total_pages: int,
) -> None:
    marker = f"{act_reference} | {page_number}/{total_pages}"
    marker_font_size = 8
    left_offset = 50
    bottom_offset = 20

    pdf.setFont(font_name, marker_font_size)
    pdf.drawString(left_offset, bottom_offset, marker)


def _register_font() -> str:
    candidates = [
        ("DejaVuSans", "C:/Windows/Fonts/DejaVuSans.ttf"),
        ("Arial", "C:/Windows/Fonts/arial.ttf"),
        ("Arial", "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"),
        ("Arial", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]

    for font_name, font_path in candidates:
        if os.path.exists(font_path):
            try:
                pdfmetrics.registerFont(TTFont(font_name, font_path))
                return font_name
            except Exception:
                continue

    # Fallback - должен работать с кириллицей
    raise RuntimeError("No suitable font found for Cyrillic text. Please install Arial or DejaVu fonts.")


def _resolve_bold_font_name(base_font_name: str) -> str:
    candidates = {
        "DejaVuSans": [
            ("DejaVuSans-Bold", "C:/Windows/Fonts/DejaVuSans-Bold.ttf"),
            ("DejaVuSans-Bold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        ],
        "Arial": [
            ("Arial-Bold", "C:/Windows/Fonts/arialbd.ttf"),
            ("Arial-Bold", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"),
        ],
    }

    candidate_list = candidates.get(base_font_name, [])
    for bold_name, bold_path in candidate_list:
        if os.path.exists(bold_path):
            try:
                pdfmetrics.registerFont(TTFont(bold_name, bold_path))
                return bold_name
            except Exception:
                continue

    # Если не нашли жирный шрифт, возвращаем обычный
    return base_font_name


def _draw_signature_table(
    pdf: canvas.Canvas,
    margin_left: float,
    top_y: float,
    font_name: str,
    bold_font_name: str,
    rows: list[tuple[str, str, str, str | None]],
):
    table_data = [['Роль', 'ФИО', 'Email', 'Подпись']]
    table_data.extend([[role, full_name or '—', email or '—', ''] for role, full_name, email, _ in rows])
    table = Table(
        table_data,
        colWidths=[110, 160, 130, 92],
        rowHeights=[24] + [52] * len(rows),
    )
    table.setStyle(TableStyle([
        ('FONT', (0, 0), (-1, -1), font_name, 9),
        ('FONT', (0, 0), (-1, 0), bold_font_name, 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
        ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))

    _, table_height = table.wrap(0, 0)
    table.drawOn(pdf, margin_left, top_y - table_height)

    signature_col_x = margin_left + 110 + 160 + 130
    current_row_top = top_y - 24
    for _, _, _, signature_path in rows:
        row_height = 52
        if signature_path and os.path.exists(signature_path):
            try:
                image = ImageReader(signature_path)
                pdf.drawImage(
                    image,
                    signature_col_x + 10,
                    current_row_top - row_height + 10,
                    width=72,
                    height=28,
                    preserveAspectRatio=True,
                    mask="auto",
                )
            except Exception:
                pdf.setFont(font_name, 8)
                pdf.drawString(signature_col_x + 10, current_row_top - row_height + 22, "Нет подписи")
        else:
            pdf.setFont(font_name, 8)
            pdf.drawString(signature_col_x + 10, current_row_top - row_height + 22, "Нет подписи")
        current_row_top -= row_height

    return table_height


def _draw_party_table(
    pdf: canvas.Canvas,
    margin_left: float,
    top_y: float,
    font_name: str,
    bold_font_name: str,
    rows: list[tuple[str, str, str | None]],
):
    table_data = [['Сторона', 'ФИО / Наименование', 'Подпись']]
    table_data.extend([[side, name or '—', ''] for side, name, _ in rows])
    side_column_width = 140
    name_column_width = 230
    signature_column_width = 122
    table = Table(
        table_data,
        colWidths=[side_column_width, name_column_width, signature_column_width],
        rowHeights=[24] + [52] * len(rows),
    )
    table.setStyle(TableStyle([
        ('FONT', (0, 0), (-1, -1), font_name, 10),
        ('FONT', (0, 0), (-1, 0), bold_font_name, 10),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
        ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))

    _, table_height = table.wrap(0, 0)
    table.drawOn(pdf, margin_left, top_y - table_height)

    signature_col_x = margin_left + side_column_width + name_column_width
    current_row_top = top_y - 24
    for _, _, signature_path in rows:
        row_height = 52
        if signature_path and os.path.exists(signature_path):
            try:
                image = ImageReader(signature_path)
                pdf.drawImage(
                    image,
                    signature_col_x + 18,
                    current_row_top - row_height + 10,
                    width=80,
                    height=28,
                    preserveAspectRatio=True,
                    mask="auto",
                )
            except Exception:
                pdf.setFont(font_name, 8)
                pdf.drawString(signature_col_x + 18, current_row_top - row_height + 22, "Нет подписи")
        else:
            pdf.setFont(font_name, 8)
            pdf.drawString(signature_col_x + 18, current_row_top - row_height + 22, "Нет подписи")
        current_row_top -= row_height

    return table_height


def _build_numbered_party_rows(
    party1_name: str,
    recipients: list[dict],
    party1_signature_path: str | None,
    recipient_signature_paths: list[str | None],
    party1_role: str,
    recipient_role: str,
) -> list[tuple[str, str, str | None]]:
    rows = [(
        f"Сторона 1\n({party1_role})",
        f"ТОО «Школа 21 века»\nв лице: {party1_name or '_' * 40}",
        party1_signature_path,
    )]
    for index, recipient in enumerate(recipients, start=1):
        recipient_details = [recipient.get("full_name") or f"Получатель {index}"]
        if recipient.get("email"):
            recipient_details.append(recipient["email"])
        rows.append((
            f"Сторона {index + 1}\n({recipient_role})",
            "\n".join(recipient_details),
            recipient_signature_paths[index - 1] if index - 1 < len(recipient_signature_paths) else None,
        ))
    return rows


def _build_ipad_rows(act_data: dict, extra_data: dict) -> list[list[str]]:
    advisory = extra_data.get("ipad_advisory")
    if isinstance(advisory, dict) and isinstance(advisory.get("students"), list):
        # В актуальной ревизии показываем только активных учеников:
        # выбывшие оформлены приложениями и в текущем составе не участвуют.
        return [[
            str(item.get("student_name", "") or ""),
            str(item.get("ipad_tag", "") or "—"),
            str(item.get("imei", "") or item.get("serial_number", "") or "—"),
        ] for item in advisory["students"] if isinstance(item, dict) and item.get("student_status", "ACTIVE") == "ACTIVE"]
    rows = [[
        str(act_data.get('item_name', '') or ''),
        str(act_data.get('item_serial', '') or '—'),
        str(extra_data.get('imei', '') or '—'),
    ]]

    equipment_list = extra_data.get("equipment_list", [])
    if equipment_list and isinstance(equipment_list, list):
        for item in equipment_list:
            if isinstance(item, dict):
                rows.append([
                    str(item.get('name', '') or ''),
                    str(item.get('serial', '') or '—'),
                    str(item.get('imei', '') or '—'),
                ])

    return rows


def _draw_ipad_tables(
    pdf: canvas.Canvas,
    margin_left: float,
    top_y: float,
    margin_right: float,
    font_name: str,
    bold_font_name: str,
    ipad_rows: list[list[str]],
) -> float:
    header = ['№', 'Student name', 'iPad Tag', 'IMEI']
    split_into_two = len(ipad_rows) >= 4
    left_count = (len(ipad_rows) + 1) // 2 if split_into_two else len(ipad_rows)
    row_sets = [ipad_rows[:left_count]]
    if split_into_two:
        row_sets.append(ipad_rows[left_count:])

    gap = 16
    available_width = margin_right - margin_left
    table_width = (available_width - gap) / 2 if len(row_sets) == 2 else available_width
    col_widths = [32, table_width - 182, 75, 75]
    x_positions = [margin_left]
    if len(row_sets) == 2:
        x_positions.append(margin_left + table_width + gap)

    tables: list[tuple[Table, float, float]] = []
    max_height = 0.0

    for table_index, row_set in enumerate(row_sets):
        table_data = [header]
        start_number = 1 if table_index == 0 else left_count + 1
        for index, row in enumerate(row_set):
            table_data.append([str(start_number + index), *row])

        table = Table(table_data, colWidths=col_widths)
        table.setStyle(TableStyle([
            ('FONT', (0, 0), (-1, -1), font_name, 9),
            ('FONT', (0, 0), (-1, 0), bold_font_name, 9),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
            ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('ALIGN', (0, 0), (0, -1), 'CENTER'),
        ]))
        _, table_height = table.wrap(0, 0)
        tables.append((table, x_positions[table_index], table_height))
        max_height = max(max_height, table_height)

    for table, x_position, table_height in tables:
        table.drawOn(pdf, x_position, top_y - table_height)

    return max_height


def _build_accessory_table_data(accessories):
    accessory_items = [item for item in accessories if isinstance(item, dict)]
    show_model = any(str(item.get('model', '') or '').strip() for item in accessory_items)
    show_note = any(str(item.get('note', '') or '').strip() for item in accessory_items)
    header = ['№', 'Мелкая техника']
    if show_model:
        header.append('Модель')
    header.append('Кол-во')
    if show_note:
        header.append('Заметка')
    data = [header]
    for index, item in enumerate(accessory_items, start=1):
        row = [str(index), str(item.get('name', '') or '—')]
        if show_model:
            row.append(str(item.get('model', '') or '—'))
        row.append(str(item.get('quantity', 1)))
        if show_note:
            row.append(str(item.get('note', '') or '—'))
        data.append(row)
    if show_model and show_note:
        widths = [28, 135, 100, 48, 180]
    elif show_model:
        widths = [28, 230, 170, 63]
    elif show_note:
        widths = [28, 180, 63, 220]
    else:
        widths = [28, 400, 63]
    return data, widths, 3 if show_model else 2


def build_act_pdf_bytes(
    act_data: dict,
    template_name: str | None = None,
    template_code: str | None = None,
    issue_signature_party1_path: str | None = None,
    issue_signature_party2_path: str | None = None,
    return_signature_party1_path: str | None = None,
    return_signature_party2_path: str | None = None,
    issue_recipient_signature_paths: list[str | None] | None = None,
    return_recipient_signature_paths: list[str | None] | None = None,
) -> bytes:
    buffer = BytesIO()
    pdf = _NumberedReferenceCanvas(buffer, pagesize=A4)
    width, height = A4
    font_name = _register_font()
    act_reference = _format_act_reference(str(act_data.get("id", "-")))
    pdf.set_reference_drawer(
        lambda c, page, total: _draw_page_reference(c, font_name, act_reference, page, total)
    )

    y = height - 50

    def start_new_page() -> None:
        nonlocal y
        pdf.showPage()
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
                    start_new_page()
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

    pdf.save()
    return buffer.getvalue()


def build_act_pdf_v2(
    act_data: dict,
    template_name: str | None = None,
    template_code: str | None = None,
    issue_signature_party1_path: str | None = None,
    issue_signature_party2_path: str | None = None,
    return_signature_party1_path: str | None = None,
    return_signature_party2_path: str | None = None,
    issue_recipient_signature_paths: list[str | None] | None = None,
    return_recipient_signature_paths: list[str | None] | None = None,
) -> bytes:
    """
    Генерирует PDF акта приема-передачи оборудования версии 2
    с улучшенным дизайном и форматированием
    """
    buffer = BytesIO()
    pdf = _NumberedReferenceCanvas(buffer, pagesize=A4)
    width, height = A4
    font_name = _register_font()
    bold_font_name = _resolve_bold_font_name(font_name)
    issue_recipient_signature_paths = issue_recipient_signature_paths or []
    return_recipient_signature_paths = return_recipient_signature_paths or []
    act_reference = _format_act_reference(str(act_data.get("id", "-")))
    pdf.set_reference_drawer(
        lambda c, page, total: _draw_page_reference(c, font_name, act_reference, page, total)
    )
    
    # Отступы
    margin_left = 50
    margin_right = width - 50
    margin_top = height - 50
    
    y = margin_top

    def start_new_page() -> None:
        nonlocal y
        pdf.showPage()
        y = margin_top

    def draw_paginated_party_rows(rows: list[tuple[str, str, str | None]]) -> None:
        nonlocal y
        remaining_rows = list(rows)
        while remaining_rows:
            max_rows = int((y - 60 - 24) // 52)
            if max_rows < 1:
                start_new_page()
                max_rows = int((y - 60 - 24) // 52)
            page_rows = remaining_rows[:max_rows]
            remaining_rows = remaining_rows[max_rows:]
            table_height = _draw_party_table(
                pdf,
                margin_left,
                y,
                font_name,
                bold_font_name,
                page_rows,
            )
            y -= table_height + 20
            if remaining_rows:
                start_new_page()
    
    pdf.setTitle(f"Акт приема-передачи оборудования")
    
    # Заголовок документа
    pdf.setFont(font_name, 14)
    title = "АКТ ПРИЕМА-ПЕРЕДАЧИ ОБОРУДОВАНИЯ"
    title_width = pdf.stringWidth(title, font_name, 14)
    pdf.drawString((width - title_width) / 2, y, title)
    y -= 40
    
    # Место и дата
    pdf.setFont(font_name, 12)
    pdf.drawString(margin_left, y, "г. Алматы")
    
    # Дата из act_data или пустое поле
    date_str = act_data.get('issue_date', '«____» ____________ 20___ г.')
    if date_str and date_str != '«____» ____________ 20___ г.':
        try:
            from datetime import datetime
            if 'T' in date_str:
                date_obj = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
            else:
                date_obj = datetime.strptime(date_str, '%Y-%m-%d')
            months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
                     'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
            date_str = f"«{date_obj.day}» {months[date_obj.month - 1]} {date_obj.year} г."
        except:
            pass
    
    date_width = pdf.stringWidth(date_str, font_name, 12)
    pdf.drawString(margin_right - date_width, y, date_str)
    y -= 30
    
    extra_data = act_data.get("extra_data_json") or {}
    recipients = extra_data.get("recipients", []) if isinstance(extra_data, dict) else []
    normalized_recipients = []
    if isinstance(recipients, list):
        for item in recipients:
            if isinstance(item, dict):
                normalized_recipients.append({
                    "full_name": str(item.get("full_name", "")).strip(),
                    "email": str(item.get("email", "")).strip(),
                })

    if not normalized_recipients:
        normalized_recipients = [{
            "full_name": str(act_data.get("party2_name", "")).strip(),
            "email": str(act_data.get("receiver_email", "")).strip(),
        }]

    # Вводная часть - таблица со сторонами
    pdf.setFont(font_name, 11)
    intro_text = "ТОО «Школа 21 века», в лице представителя, и получатель оборудования,"
    pdf.drawString(margin_left, y, intro_text)
    y -= 15
    pdf.drawString(margin_left, y, "далее совместно именуемые «Стороны», составили настоящий Акт о нижеследующем:")
    y -= 25
    
    # Таблица со сторонами. Если получателей несколько, для каждого делаем отдельную строку и колонку подписи.
    party_rows = _build_numbered_party_rows(
        str(act_data.get('party1_name', '')),
        normalized_recipients,
        issue_signature_party1_path,
        issue_recipient_signature_paths,
        "Передающая сторона",
        "Принимающая сторона",
    )

    draw_paginated_party_rows(party_rows)
    y -= 5
    
    is_ipad_template = template_code == 'IPAD'

    # Пункт 1
    pdf.setFont(font_name, 11)
    clause1 = "1. Настоящий Акт приема-передачи оборудования удостоверяет, что Сторона 1 передала,"
    pdf.drawString(margin_left, y, clause1)
    y -= 15
    pdf.drawString(margin_left + 10, y, "а Сторона 2 приняла во временное пользование следующие основные средства")
    y -= 15
    pdf.drawString(margin_left + 10, y, "(далее - ОС):")
    y -= 20

    if is_ipad_template:
        pdf.setFont(bold_font_name, 11)
        ipad_advisory = extra_data.get("ipad_advisory") if isinstance(extra_data.get("ipad_advisory"), dict) else {}
        advisory_label = ipad_advisory.get("advisory_group") or extra_data.get('advisory_note', '') or '______________________________'
        academic_year = ipad_advisory.get("academic_year")
        pdf.drawString(margin_left + 10, y, f"Advisory: {advisory_label}")
        if academic_year:
            pdf.drawRightString(margin_right, y, f"Учебный год: {academic_year}")
        y -= 20
    
    # Таблица оборудования
    if is_ipad_template:
        ipad_rows = _build_ipad_rows(act_data, extra_data)
    else:
        table_data = [
            ['№', 'Наименование ОС', 'Серийный номер'],
            ['1', act_data.get('item_name', ''), act_data.get('item_serial', '') or '—']
        ]
    
    # Добавляем дополнительное оборудование из extra_data_json если есть
    equipment_list = extra_data.get("equipment_list", [])
    if not is_ipad_template and equipment_list and isinstance(equipment_list, list):
        for idx, item in enumerate(equipment_list, start=2):
            if isinstance(item, dict):
                item_name = item.get('name', '')
                item_serial = item.get('serial', '')
                table_data.append([str(idx), item_name, item_serial or '—'])

    if is_ipad_template:
        ipad_split_into_two = len(ipad_rows) >= 4
        ipad_left_count = (len(ipad_rows) + 1) // 2 if ipad_split_into_two else len(ipad_rows)
        ipad_max_rows = max(ipad_left_count, len(ipad_rows) - ipad_left_count)
        ipad_table_height_estimate = 24 + (ipad_max_rows * 30)
        if y - ipad_table_height_estimate < 100:
            start_new_page()

        table_height = _draw_ipad_tables(
            pdf,
            margin_left,
            y,
            margin_right,
            font_name,
            bold_font_name,
            ipad_rows,
        )
        y -= (table_height + 20)

        # Применённые приложения: основание каждого изменения состава с датами
        # подписей — актуальная ревизия ссылается на подписанные документы.
        ipad_advisory_data = extra_data.get("ipad_advisory") if isinstance(extra_data.get("ipad_advisory"), dict) else {}
        applied_appendices = ipad_advisory_data.get("appendices") or []
        if isinstance(applied_appendices, list) and applied_appendices:
            appendix_titles = {
                'IPAD_REPLACEMENT': 'Замена iPad',
                'STUDENT_DEPARTURE': 'Выбытие ученика',
                'STUDENT_ADDITION': 'Добавление ученика',
                'LATE_RETURN': 'Поздний возврат iPad',
                'YEAR_END_RETURN': 'Годовой возврат Advisory',
            }

            def _short_date(value) -> str:
                try:
                    from datetime import datetime as _dt
                    return _dt.fromisoformat(str(value)).strftime('%d.%m.%Y')
                except (TypeError, ValueError):
                    return '—'

            block_height_estimate = 20 + len(applied_appendices) * 14
            if y - block_height_estimate < 100:
                start_new_page()
            pdf.setFont(bold_font_name, 10)
            pdf.drawString(margin_left, y, 'Изменения по приложениям к акту:')
            y -= 16
            pdf.setFont(font_name, 9)
            for appendix_info in applied_appendices:
                if not isinstance(appendix_info, dict):
                    continue
                title = appendix_titles.get(appendix_info.get('operation_type'), str(appendix_info.get('operation_type', '')))
                student = appendix_info.get('student_name')
                line = f"Приложение №{appendix_info.get('appendix_number', '?')}: {title}"
                if student:
                    line += f" — {student}"
                line += (
                    f" (подписи: {appendix_info.get('responsible_name', '—')} {_short_date(appendix_info.get('responsible_signed_at'))}, "
                    f"{appendix_info.get('issuer_name', '—')} {_short_date(appendix_info.get('issuer_signed_at'))})"
                )
                if y < 100:
                    start_new_page()
                    pdf.setFont(font_name, 9)
                pdf.drawString(margin_left, y, line)
                y -= 14
            y -= 8
    else:
        table = Table(table_data, colWidths=[40, margin_right - margin_left - 180, 140])
        table.setStyle(TableStyle([
            ('FONT', (0, 0), (-1, -1), font_name, 10),
            ('FONT', (0, 0), (-1, 0), bold_font_name, 10),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
            ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey),
            ('ALIGN', (0, 0), (0, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]))

        table_width, table_height = table.wrap(0, 0)
        if y - table_height < 100:
            start_new_page()

        table.drawOn(pdf, margin_left, y - table_height)
        y -= (table_height + 20)

    accessories = extra_data.get("accessories", [])
    if isinstance(accessories, list) and accessories:
        accessory_data, accessory_widths, quantity_column = _build_accessory_table_data(accessories)
        accessory_table = Table(accessory_data, colWidths=accessory_widths)
        accessory_table.setStyle(TableStyle([
            ('FONT', (0, 0), (-1, -1), font_name, 8),
            ('FONT', (0, 0), (-1, 0), bold_font_name, 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
            ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey),
            ('ALIGN', (0, 0), (0, -1), 'CENTER'),
            ('ALIGN', (quantity_column, 1), (quantity_column, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        _, accessory_height = accessory_table.wrap(0, 0)
        if y - accessory_height - 15 < 100:
            start_new_page()
        pdf.setFont(bold_font_name, 10)
        pdf.drawString(margin_left, y, "Мелкая техника")
        y -= 15
        accessory_table.drawOn(pdf, margin_left, y - accessory_height)
        y -= accessory_height + 20
    
    # Пункт 2
    pdf.setFont(font_name, 11)
    pdf.drawString(margin_left, y, "2. Стороны при приеме-передаче осмотрели ОС и пришли к соглашению, что")
    y -= 15
    pdf.drawString(margin_left + 10, y, "передаваемые ОС находятся в рабочем и приемлемом для использования состоянии.")
    y -= 20
    
    # Пункт 3
    pdf.drawString(margin_left, y, "3. Стороны пришли к соглашению, что в случае потери или повреждения принятых ОС")
    y -= 15
    pdf.drawString(margin_left + 10, y, "в результате действий Стороны 2, Сторона 2 обязуется полностью возместить Стороне 1")
    y -= 15
    pdf.drawString(margin_left + 10, y, "рыночную стоимость данного имущества в течение 30 (тридцати) календарных дней")
    y -= 15
    pdf.drawString(margin_left + 10, y, "с момента предъявления требования от Стороны 1.")
    y -= 20
    
    # Пункт 4
    pdf.drawString(margin_left, y, "4. Вынос оборудования за пределы школы разрешается только с согласования")
    y -= 15
    pdf.drawString(margin_left + 10, y, "с администрацией (Руководителя IT-отдела).")
    y -= 20
    
    # Пункт 5
    pdf.drawString(margin_left, y, "5. Настоящий Акт составлен в двух экземплярах, имеющих одинаковую юридическую")
    y -= 15
    pdf.drawString(margin_left + 10, y, "силу, по одному для каждой Стороны.")
    y -= 30
    
    # Блок подписей (только если один получатель, иначе подписи уже в первой таблице)
    if len(normalized_recipients) == 1:
        estimated_signature_height = 100
        if y < estimated_signature_height:
            start_new_page()
        
        # Простой блок подписей в две колонки
        y -= 20
        
        # Левая колонка - Сторона 1
        left_x = margin_left
        pdf.setFont(bold_font_name, 11)
        pdf.drawString(left_x, y, "Сторона 1:")
        
        # Правая колонка - Сторона 2
        right_x = width / 2 + 20
        pdf.drawString(right_x, y, "Сторона 2:")

        signature_width = 100
        signature_height = 30
        signature_gap = 4
        name_gap = 12

        side1_label_width = pdf.stringWidth("Сторона 1:", bold_font_name, 11)
        side2_label_width = pdf.stringWidth("Сторона 2:", bold_font_name, 11)
        side1_signature_x = left_x + side1_label_width + signature_gap
        side2_signature_x = right_x + side2_label_width + signature_gap
        signature_y = y - (signature_height / 2)

        # Подписи
        pdf.setFont(font_name, 10)

        # Сторона 1 - подпись
        if issue_signature_party1_path and os.path.exists(issue_signature_party1_path):
            try:
                from reportlab.lib.utils import ImageReader
                image = ImageReader(issue_signature_party1_path)
                pdf.drawImage(
                    image,
                    side1_signature_x,
                    signature_y,
                    width=signature_width,
                    height=signature_height,
                    preserveAspectRatio=True,
                    mask="auto",
                )
            except Exception:
                pdf.drawString(side1_signature_x, y, "_" * 20)
        else:
            pdf.drawString(side1_signature_x, y, "_" * 20)
        
        # Сторона 2 - подпись
        recipient_sig_path = issue_recipient_signature_paths[0] if issue_recipient_signature_paths and len(issue_recipient_signature_paths) > 0 else None
        if recipient_sig_path and os.path.exists(recipient_sig_path):
            try:
                from reportlab.lib.utils import ImageReader
                image = ImageReader(recipient_sig_path)
                pdf.drawImage(
                    image,
                    side2_signature_x,
                    signature_y,
                    width=signature_width,
                    height=signature_height,
                    preserveAspectRatio=True,
                    mask="auto",
                )
            except Exception:
                pdf.drawString(side2_signature_x, y, "_" * 20)
        else:
            pdf.drawString(side2_signature_x, y, "_" * 20)

        name_y = signature_y - name_gap
        
        # ФИО под подписями
        pdf.setFont(font_name, 9)
        party1_name = act_data.get('party1_name', '')
        pdf.drawString(side1_signature_x, name_y, party1_name[:30])
        
        party2_name = normalized_recipients[0].get('full_name', '')
        pdf.drawString(side2_signature_x, name_y, party2_name[:30])
        
        y = name_y - 25
    else:
        # Для нескольких получателей подписи уже в первой таблице, просто отступ
        y -= 20
    
    # Блок возврата (если есть данные о возврате)
    if act_data.get("return_date") or act_data.get("return_note"):
        if y < 250:
            start_new_page()
        
        # Пунктирная линия
        pdf.setDash(3, 3)
        pdf.line(margin_left, y, margin_right, y)
        pdf.setDash()
        y -= 30
        
        pdf.setFont(bold_font_name, 12)
        return_title = "ПОМЕТКА О ВОЗВРАТЕ ОС"
        return_title_width = pdf.stringWidth(return_title, bold_font_name, 12)
        pdf.drawString((width - return_title_width) / 2, y, return_title)
        y -= 25
        
        # Дата возврата
        return_date_str = act_data.get('return_date', '')
        if return_date_str:
            try:
                from datetime import datetime
                if 'T' in return_date_str:
                    date_obj = datetime.fromisoformat(return_date_str.replace('Z', '+00:00'))
                else:
                    date_obj = datetime.strptime(return_date_str, '%Y-%m-%d')
                months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
                         'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
                formatted_return_date = f"«{date_obj.day}» {months[date_obj.month - 1]} {date_obj.year} г."
            except:
                formatted_return_date = return_date_str
            
            pdf.setFont(bold_font_name, 11)
            pdf.drawString(margin_left, y, f"Дата возврата: {formatted_return_date}")
            y -= 20
        
        pdf.setFont(font_name, 11)
        pdf.drawString(margin_left, y, "Сторона 2 передает, а Сторона 1 принимает ОС, согласно пункту 1 настоящего Акта.")
        y -= 15
        pdf.drawString(margin_left, y, "Стороны при приеме-передаче осмотрели ОС и пришли к соглашению, что передаваемые")
        y -= 15
        pdf.drawString(margin_left, y, "ОС находятся в рабочем и приемлемом для использования состоянии.")
        y -= 20
        
        # Примечания
        pdf.setFont(bold_font_name, 11)
        pdf.drawString(margin_left, y, "Примечания:")
        pdf.setFont(font_name, 10)
        note_text = act_data.get("return_note", "")
        if note_text:
            pdf.drawString(margin_left + 100, y, note_text[:80])
        else:
            pdf.line(margin_left + 100, y, margin_right, y)
        y -= 30
        
        # Подписи возврата: только если один получатель, иначе подписи уже в первой таблице
        if len(normalized_recipients) == 1:
            estimated_return_signature_height = 100
            if y < estimated_return_signature_height:
                start_new_page()
            
            # Простой блок подписей в две колонки для возврата
            y -= 20
            
            # Левая колонка - Сторона 1
            left_x = margin_left
            pdf.setFont(bold_font_name, 11)
            pdf.drawString(left_x, y, "Сторона 1:")
            
            # Правая колонка - Сторона 2
            right_x = width / 2 + 20
            pdf.drawString(right_x, y, "Сторона 2:")

            return_signature_width = 100
            return_signature_height = 30
            return_signature_gap = 4
            return_name_gap = 12

            return_side1_label_width = pdf.stringWidth("Сторона 1:", bold_font_name, 11)
            return_side2_label_width = pdf.stringWidth("Сторона 2:", bold_font_name, 11)
            return_side1_signature_x = left_x + return_side1_label_width + return_signature_gap
            return_side2_signature_x = right_x + return_side2_label_width + return_signature_gap
            return_signature_y = y - (return_signature_height / 2)

            # Подписи
            pdf.setFont(font_name, 10)

            # Сторона 1 - подпись возврата
            if return_signature_party1_path and os.path.exists(return_signature_party1_path):
                try:
                    from reportlab.lib.utils import ImageReader
                    image = ImageReader(return_signature_party1_path)
                    pdf.drawImage(
                        image,
                        return_side1_signature_x,
                        return_signature_y,
                        width=return_signature_width,
                        height=return_signature_height,
                        preserveAspectRatio=True,
                        mask="auto",
                    )
                except Exception:
                    pdf.drawString(return_side1_signature_x, y, "_" * 20)
            else:
                pdf.drawString(return_side1_signature_x, y, "_" * 20)
            
            # Сторона 2 - подпись возврата
            return_recipient_sig_path = return_recipient_signature_paths[0] if return_recipient_signature_paths and len(return_recipient_signature_paths) > 0 else None
            if return_recipient_sig_path and os.path.exists(return_recipient_sig_path):
                try:
                    from reportlab.lib.utils import ImageReader
                    image = ImageReader(return_recipient_sig_path)
                    pdf.drawImage(
                        image,
                        return_side2_signature_x,
                        return_signature_y,
                        width=return_signature_width,
                        height=return_signature_height,
                        preserveAspectRatio=True,
                        mask="auto",
                    )
                except Exception:
                    pdf.drawString(return_side2_signature_x, y, "_" * 20)
            else:
                pdf.drawString(return_side2_signature_x, y, "_" * 20)

            return_name_y = return_signature_y - return_name_gap
            
            # ФИО под подписями
            pdf.setFont(font_name, 9)
            party1_name = act_data.get('party1_name', '')
            pdf.drawString(return_side1_signature_x, return_name_y, party1_name[:30])
            
            party2_name = normalized_recipients[0].get('full_name', '')
            pdf.drawString(return_side2_signature_x, return_name_y, party2_name[:30])
            
            y = return_name_y - 25
        else:
            return_party_rows = _build_numbered_party_rows(
                str(act_data.get('party1_name', '')),
                normalized_recipients,
                return_signature_party1_path,
                return_recipient_signature_paths,
                "Принимает возврат",
                "Возвращает технику",
            )
            draw_paginated_party_rows(return_party_rows)
    
    pdf.save()
    return buffer.getvalue()
