"""Seed admin user"""
from sqlalchemy.orm import Session
from app.core.db.session import SessionLocal
from app.db.models.user import User, UserRole
from app.core.security import get_password_hash


def seed_admin():
    """Create admin user if it doesn't exist."""
    db: Session = SessionLocal()
    try:
        # Check if admin exists
        admin = db.query(User).filter(User.email == "admin@acts.local").first()
        if admin:
            print("Admin user already exists")
            return
        
        # Create admin user
        admin = User(
            email="admin@acts.local",
            full_name="System Administrator",
            password_hash=get_password_hash("admin123"),
            role=UserRole.ADMIN,
            is_active=True
        )
        db.add(admin)
        db.commit()
        print("Admin user created successfully")
        print("Email: admin@acts.local")
        print("Password: admin123")
    except Exception as e:
        db.rollback()
        print(f"Error creating admin user: {e}")
        raise
    finally:
        db.close()

