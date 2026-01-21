import os
import uuid
from pathlib import Path
from typing import Dict, Any, Optional
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image
import base64
import io
from app.core.config import settings


def generate_pdf(
    act_data: Dict[str, Any],
    template_schema: Dict[str, Any],
    signature_party1_path: Optional[str] = None,
    signature_party2_path: Optional[str] = None,
    output_path: Optional[str] = None
) -> str:
    """Generate PDF for act with signatures if available"""
    if output_path is None:
        os.makedirs(settings.STORAGE_PATH, exist_ok=True)
        output_path = os.path.join(settings.STORAGE_PATH, f"{uuid.uuid4()}.pdf")
    
    c = canvas.Canvas(output_path, pagesize=A4)
    width, height = A4
    
    # Title
    c.setFont("Helvetica-Bold", 16)
    c.drawString(50, height - 50, "Акт выдачи техники")
    
    # Act data
    y = height - 100
    c.setFont("Helvetica", 12)
    
    c.drawString(50, y, f"Сторона 1: {act_data.get('party1_name', '')}")
    y -= 25
    c.drawString(50, y, f"Сторона 2: {act_data.get('party2_name', '')}")
    y -= 25
    issue_date = act_data.get('issue_date', '')
    if isinstance(issue_date, str):
        try:
            from datetime import datetime
            dt = datetime.fromisoformat(issue_date.replace('Z', '+00:00'))
            issue_date = dt.strftime('%d.%m.%Y')
        except:
            pass
    c.drawString(50, y, f"Дата выдачи: {issue_date}")
    y -= 25
    c.drawString(50, y, f"Техника: {act_data.get('item_name', '')}")
    y -= 25
    c.drawString(50, y, f"Email получателя: {act_data.get('receiver_email', '')}")
    
    # Signatures
    signature_coords = template_schema.get("signature_party1", {})
    if signature_party1_path and os.path.exists(signature_party1_path):
        try:
            img = Image.open(signature_party1_path)
            img_width = signature_coords.get("w", 200) * mm / 10
            img_height = signature_coords.get("h", 80) * mm / 10
            x = signature_coords.get("x", 50) * mm / 10
            y_pos = height - signature_coords.get("y", 150) * mm / 10 - img_height
            c.drawImage(signature_party1_path, x, y_pos, width=img_width, height=img_height)
        except Exception as e:
            print(f"Error adding party1 signature: {e}")
    
    signature_coords = template_schema.get("signature_party2", {})
    if signature_party2_path and os.path.exists(signature_party2_path):
        try:
            img = Image.open(signature_party2_path)
            img_width = signature_coords.get("w", 200) * mm / 10
            img_height = signature_coords.get("h", 80) * mm / 10
            x = signature_coords.get("x", 300) * mm / 10
            y_pos = height - signature_coords.get("y", 150) * mm / 10 - img_height
            c.drawImage(signature_party2_path, x, y_pos, width=img_width, height=img_height)
        except Exception as e:
            print(f"Error adding party2 signature: {e}")
    
    c.save()
    return output_path


def save_signature_from_base64(base64_data: str, act_id: str, party: str) -> str:
    """Save signature from base64 PNG to file storage"""
    os.makedirs(settings.STORAGE_PATH, exist_ok=True)
    
    # Remove data URL prefix if present
    if base64_data.startswith("data:image"):
        base64_data = base64_data.split(",")[1]
    
    image_data = base64.b64decode(base64_data)
    file_path = os.path.join(settings.STORAGE_PATH, f"{act_id}_{party}_{uuid.uuid4()}.png")
    
    with open(file_path, "wb") as f:
        f.write(image_data)
    
    return file_path

