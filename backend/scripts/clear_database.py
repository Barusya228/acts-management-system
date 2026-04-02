import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.core.database import SessionLocal
from app.db.models import User, Act, ActVersion, FileAsset, AuditLog

def clear_database():
    db = SessionLocal()
    
    try:
        # Delete act versions first (they reference file_assets)
        versions_count = db.query(ActVersion).count()
        db.query(ActVersion).delete()
        print(f"Deleted {versions_count} act versions")
        
        # Delete file assets
        file_assets_count = db.query(FileAsset).count()
        db.query(FileAsset).delete()
        print(f"Deleted {file_assets_count} file assets")
        
        # Delete all acts
        acts_count = db.query(Act).count()
        db.query(Act).delete()
        print(f"Deleted {acts_count} acts")
        
        # Delete audit logs
        audit_count = db.query(AuditLog).count()
        db.query(AuditLog).delete()
        print(f"Deleted {audit_count} audit logs")
        
        # Delete all users
        users_count = db.query(User).count()
        db.query(User).delete()
        print(f"Deleted {users_count} users")
        
        db.commit()
        print("\nDatabase cleared successfully!")
        
    except Exception as e:
        print(f"Error clearing database: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    print("Clearing database...")
    clear_database()
