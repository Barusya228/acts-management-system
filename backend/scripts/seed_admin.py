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
        existing_admin = db.query(User).filter(User.username == "admin").first()
        
        if existing_admin:
            print("Admin user already exists")
            # Update password to qwerty
            existing_admin.username = "admin"
            existing_admin.email = "admin"
            existing_admin.password_hash = get_password_hash("qwerty")
            existing_admin.full_name = "Администратор"
            existing_admin.role = UserRole.ADMIN
            existing_admin.is_active = True
            db.commit()
            print("Admin password updated to 'qwerty'")
        else:
            # Create admin user with static credentials
            admin = User(
                username="admin",
                email="admin",
                full_name="Администратор",
                password_hash=get_password_hash("qwerty"),
                role=UserRole.ADMIN,
                is_active=True
            )
            
            db.add(admin)
            db.commit()
            
            print("Admin user created successfully")
            print("Login: admin")
            print("Password: qwerty")

        # Create guest user if not exists
        existing_guest = db.query(User).filter(User.username == "guest").first()
        if not existing_guest:
            guest = User(
                username="guest",
                email="guest@example.com",
                full_name="Guest Signer",
                password_hash=get_password_hash("guest123"),
                role=UserRole.GUEST,
                is_active=True,
            )
            db.add(guest)
            db.commit()
            print("Guest user created successfully")
            print("Login: guest")
            print("Email: guest@example.com")
            print("Password: guest123")
        else:
            existing_guest.username = "guest"
            existing_guest.email = "guest@example.com"
            existing_guest.password_hash = get_password_hash("guest123")
            existing_guest.role = UserRole.GUEST
            existing_guest.is_active = True
            db.commit()
            print("Guest user already exists")
        
    except Exception as e:
        print(f"Error creating admin user: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_admin()
