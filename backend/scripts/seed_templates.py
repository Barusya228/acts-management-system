import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.core.database import SessionLocal
from app.db.models import Template

def seed_templates():
    db = SessionLocal()
    
    try:
        # Check if templates already exist
        existing = db.query(Template).first()
        
        if existing:
            print("Templates already exist")
            return
        
        # Create generic template
        generic_template = Template(
            code="GENERIC",
            name="Общий акт приема-передачи техники",
            description="Универсальный шаблон для любой техники",
            schema_json={
                "fields": [
                    {"name": "party1_name", "type": "string", "label": "Передающая сторона", "required": True},
                    {"name": "party2_name", "type": "string", "label": "Получающая сторона", "required": True},
                    {"name": "issue_date", "type": "date", "label": "Дата выдачи", "required": True},
                    {"name": "item_name", "type": "string", "label": "Наименование техники", "required": True},
                    {"name": "item_serial", "type": "string", "label": "Серийный номер", "required": False},
                    {"name": "receiver_email", "type": "email", "label": "Email получателя", "required": True}
                ]
            },
            is_active=True
        )
        
        # Create iPad template
        ipad_template = Template(
            code="IPAD",
            name="Акт приема-передачи iPad",
            description="Специализированный шаблон для iPad",
            schema_json={
                "fields": [
                    {"name": "party1_name", "type": "string", "label": "Передающая сторона", "required": True},
                    {"name": "party2_name", "type": "string", "label": "Получающая сторона", "required": True},
                    {"name": "issue_date", "type": "date", "label": "Дата выдачи", "required": True},
                    {"name": "item_name", "type": "string", "label": "Модель iPad", "required": True},
                    {"name": "item_serial", "type": "string", "label": "Серийный номер", "required": True},
                    {"name": "imei", "type": "string", "label": "IMEI", "required": False},
                    {"name": "receiver_email", "type": "email", "label": "Email получателя", "required": True}
                ]
            },
            is_active=True
        )
        
        db.add(generic_template)
        db.add(ipad_template)
        db.commit()
        
        print("Templates created successfully")
        print("- GENERIC: Общий акт приема-передачи техники")
        print("- IPAD: Акт приема-передачи iPad")
        
    except Exception as e:
        print(f"Error creating templates: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_templates()
