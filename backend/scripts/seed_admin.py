import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.core.database import SessionLocal
from app.core.security import get_password_hash
from app.db.models import User, UserRole

def seed_admin():
    db = SessionLocal()
    admin_username = os.getenv("ADMIN_USERNAME", "administrator")
    admin_password = os.getenv("ADMIN_PASSWORD")
    
    try:
        # Не храните production-пароль в Git. ADMIN_PASSWORD передаётся
        # только при первоначальном создании или явной ротации пароля.
        existing_admin = db.query(User).filter(User.role == UserRole.ADMIN).first()
        
        if existing_admin:
            print("Admin user already exists")
            existing_admin.username = admin_username
            existing_admin.email = admin_username
            if admin_password:
                existing_admin.password_hash = get_password_hash(admin_password)
            existing_admin.full_name = "Администратор"
            existing_admin.role = UserRole.ADMIN
            existing_admin.is_active = True
            db.commit()
            print(f"Admin login updated: {admin_username}")
            print("Admin password updated" if admin_password else "Admin password left unchanged")
        else:
            if not admin_password:
                raise RuntimeError("ADMIN_PASSWORD is required to create the administrator")
            admin = User(
                username=admin_username,
                email=admin_username,
                full_name="Администратор",
                password_hash=get_password_hash(admin_password),
                role=UserRole.ADMIN,
                is_active=True
            )
            
            db.add(admin)
            db.commit()

            print("Admin user created successfully")
            print(f"Login: {admin_username}")

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
