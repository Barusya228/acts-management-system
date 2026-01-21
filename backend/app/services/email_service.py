import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from typing import Optional
from pathlib import Path
from app.core.config import settings


def send_act_email(
    receiver_email: str,
    act_data: dict,
    pdf_path: Optional[str] = None
) -> bool:
    """Send email with act information and PDF attachment"""
    
    if not settings.SMTP_HOST:
        # Log-only mode
        print(f"[EMAIL LOG] Would send email to {receiver_email}")
        print(f"[EMAIL LOG] Subject: Создан акт выдачи техники")
        print(f"[EMAIL LOG] Body: Акт выдачи техники создан. Сторона 1: {act_data.get('party1_name')}, Сторона 2: {act_data.get('party2_name')}, Техника: {act_data.get('item_name')}")
        if pdf_path:
            print(f"[EMAIL LOG] Attachment: {pdf_path}")
        return True
    
    try:
        msg = MIMEMultipart()
        msg['From'] = settings.SMTP_FROM
        msg['To'] = receiver_email
        msg['Subject'] = "Создан акт выдачи техники"
        
        body = f"""
        Создан акт выдачи техники.
        
        Сторона 1: {act_data.get('party1_name')}
        Сторона 2: {act_data.get('party2_name')}
        Дата выдачи: {act_data.get('issue_date')}
        Техника: {act_data.get('item_name')}
        """
        
        msg.attach(MIMEText(body, 'plain', 'utf-8'))
        
        if pdf_path and Path(pdf_path).exists():
            with open(pdf_path, "rb") as attachment:
                part = MIMEBase('application', 'octet-stream')
                part.set_payload(attachment.read())
                encoders.encode_base64(part)
                part.add_header(
                    'Content-Disposition',
                    f'attachment; filename=act_{act_data.get("id", "unknown")}.pdf'
                )
                msg.attach(part)
        
        server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT)
        if settings.SMTP_TLS:
            server.starttls()
        if settings.SMTP_USER and settings.SMTP_PASSWORD:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.send_message(msg)
        server.quit()
        
        return True
    except Exception as e:
        print(f"Error sending email: {e}")
        return False

