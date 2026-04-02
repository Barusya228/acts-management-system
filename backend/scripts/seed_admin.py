import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.core.database import SessionLocal
from app.core.security import get_password_hash
from app.db.models import User, UserRole

def seed_admin():
    db = SessionLocal()
    
    try:
        # Check if admin already exists
        existing_admin = db.query(User).filter(User.email == "admin@example.com").first()
        
        if existing_admin:
            print("Admin user already exists")
        else:
            # Create admin user
            admin = User(
                email="admin@example.com",
                full_name="Admin User",
                password_hash=get_password_hash("admin123"),
                role=UserRole.ADMIN,
                is_active=True
            )
            
            db.add(admin)
            db.commit()
            
            print("Admin user created successfully")
            print("Email: admin@example.com")
            print("Password: admin123")

        # Create guest user if not exists
        existing_guest = db.query(User).filter(User.email == "guest@example.com").first()
        if not existing_guest:
            guest = User(
                email="guest@example.com",
                full_name="Guest Signer",
                password_hash=get_password_hash("guest123"),
                role=UserRole.GUEST,
                is_active=True,
            )
            db.add(guest)
            db.commit()
            print("Guest user created successfully")
            print("Email: guest@example.com")
            print("Password: guest123")
        else:
            print("Guest user already exists")
        
    except Exception as e:
        print(f"Error creating admin user: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_admin()
