import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.core.database import SessionLocal
from app.db.models import Template


TEMPLATE_DEFINITIONS = [
    {
        "code": "GENERIC_ONE",
        "name": "Акт для одного получателя",
        "description": "Стандартный шаблон для выдачи техники одному сотруднику",
        "pdf_version": 2,
        "schema_json": {
            "max_recipients": 1,
            "fields": [
                {"name": "party1_name", "type": "string", "label": "Передающая сторона", "required": True},
                {"name": "party2_name", "type": "string", "label": "Получающая сторона", "required": True},
                {"name": "issue_date", "type": "date", "label": "Дата выдачи", "required": True},
                {"name": "item_name", "type": "string", "label": "Наименование техники", "required": True},
                {"name": "item_serial", "type": "string", "label": "Серийный номер", "required": False},
                {"name": "receiver_email", "type": "email", "label": "Email получателя", "required": True},
            ]
        },
        "is_active": True,
    },
    {
        "code": "GENERIC_MULTI",
        "name": "Акт для нескольких получателей",
        "description": "Шаблон для выдачи техники нескольким сотрудникам с отдельной подписью каждого",
        "pdf_version": 2,
        "schema_json": {
            "max_recipients": None,
            "fields": [
                {"name": "party1_name", "type": "string", "label": "Передающая сторона", "required": True},
                {"name": "party2_name", "type": "string", "label": "Получающая сторона", "required": True},
                {"name": "issue_date", "type": "date", "label": "Дата выдачи", "required": True},
                {"name": "item_name", "type": "string", "label": "Наименование техники", "required": True},
                {"name": "item_serial", "type": "string", "label": "Серийный номер", "required": False},
                {"name": "receiver_email", "type": "email", "label": "Контактный email", "required": True},
            ]
        },
        "is_active": True,
    },
    {
        "code": "GENERIC",
        "name": "Универсальный акт",
        "description": "Универсальный шаблон для любой техники, поддерживает как одного, так и нескольких получателей",
        "pdf_version": 2,
        "schema_json": {
            "max_recipients": None,
            "fields": [
                {"name": "party1_name", "type": "string", "label": "Передающая сторона", "required": True},
                {"name": "party2_name", "type": "string", "label": "Получающая сторона", "required": True},
                {"name": "issue_date", "type": "date", "label": "Дата выдачи", "required": True},
                {"name": "item_name", "type": "string", "label": "Наименование техники", "required": True},
                {"name": "item_serial", "type": "string", "label": "Серийный номер", "required": False},
                {"name": "receiver_email", "type": "email", "label": "Email получателя", "required": True},
            ]
        },
        "is_active": True,
    },
    {
        "code": "IPAD",
        "name": "Акт приема-передачи iPad",
        "description": "Специализированный шаблон для iPad с полем IMEI",
        "pdf_version": 2,
        "schema_json": {
            "max_recipients": None,
            "fields": [
                {"name": "party1_name", "type": "string", "label": "Передающая сторона", "required": True},
                {"name": "party2_name", "type": "string", "label": "Получающая сторона", "required": True},
                {"name": "issue_date", "type": "date", "label": "Дата выдачи", "required": True},
                {"name": "item_name", "type": "string", "label": "Модель iPad", "required": True},
                {"name": "item_serial", "type": "string", "label": "Серийный номер", "required": True},
                {"name": "imei", "type": "string", "label": "IMEI", "required": True},
                {"name": "receiver_email", "type": "email", "label": "Email получателя", "required": True},
            ]
        },
        "is_active": True,
    },
]


def seed_templates():
    db = SessionLocal()
    
    try:
        created_codes = []
        updated_codes = []

        for definition in TEMPLATE_DEFINITIONS:
            existing = db.query(Template).filter(Template.code == definition["code"]).first()
            if existing:
                existing.name = definition["name"]
                existing.description = definition["description"]
                existing.pdf_version = definition["pdf_version"]
                existing.schema_json = definition["schema_json"]
                existing.is_active = definition["is_active"]
                updated_codes.append(definition["code"])
                continue

            db.add(Template(**definition))
            created_codes.append(definition["code"])

        db.commit()

        if created_codes:
            print(f"Templates created: {', '.join(created_codes)}")
        if updated_codes:
            print(f"Templates updated: {', '.join(updated_codes)}")
        if not created_codes and not updated_codes:
            print("No template changes")
        
    except Exception as e:
        print(f"Error creating templates: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_templates()
