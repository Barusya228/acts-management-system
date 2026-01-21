"""Seed templates"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy.orm import Session
from app.core.db.session import SessionLocal
from app.db.models.template import Template


def seed_templates():
    """Create templates if they don't exist."""
    db: Session = SessionLocal()
    try:
        # Check if templates exist
        if db.query(Template).count() > 0:
            print("Templates already exist")
            return
        
        # IPAD template
        ipad_template = Template(
            code="IPAD",
            name="iPad Template",
            description="Template for iPad equipment issuance",
            schema_json={
                "signature_party1": {"x": 50, "y": 150, "w": 200, "h": 80},
                "signature_party2": {"x": 300, "y": 150, "w": 200, "h": 80}
            },
            is_active=True
        )
        db.add(ipad_template)
        
        # Generic template
        generic_template = Template(
            code="GENERIC",
            name="Generic Template",
            description="Generic template for equipment issuance",
            schema_json={
                "signature_party1": {"x": 50, "y": 150, "w": 200, "h": 80},
                "signature_party2": {"x": 300, "y": 150, "w": 200, "h": 80}
            },
            is_active=True
        )
        db.add(generic_template)
        
        db.commit()
        print("Templates created successfully")
    except Exception as e:
        db.rollback()
        print(f"Error creating templates: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    seed_templates()

