from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
import sys

# Verify DATABASE_URL uses correct database name
db_url = settings.DATABASE_URL

# Check if database name is acts_user (wrong) instead of acts_db
if '/acts_user' in db_url or db_url.endswith('/acts_user'):
    print(f"ERROR: DATABASE_URL uses 'acts_user' as database name")
    print(f"DATABASE_URL: {db_url.split('@')[0]}@***/acts_user")
    print("Database name must be 'acts_db', not 'acts_user'")
    print(f"POSTGRES_DB env var: {settings.POSTGRES_DB}")
    sys.exit(1)

# Verify database name is acts_db
if '/acts_db' not in db_url and not db_url.endswith('/acts_db'):
    print(f"ERROR: DATABASE_URL does not use 'acts_db' as database name")
    print(f"DATABASE_URL: {db_url}")
    print(f"POSTGRES_DB env var: {settings.POSTGRES_DB}")
    sys.exit(1)

# Mask password in log
masked_url = db_url.split('@')[0].split(':')[0] + ':***@' + '@'.join(db_url.split('@')[1:]) if '@' in db_url else db_url
print(f"Connecting to database: {masked_url}")

engine = create_engine(
    db_url,
    pool_pre_ping=True,  # Verify connections before using them
    pool_recycle=300,    # Recycle connections after 5 minutes
)

# Test connection and verify database name
try:
    with engine.connect() as conn:
        result = conn.execute(text("SELECT current_database()"))
        db_name = result.scalar()
        if db_name == 'acts_db':
            print(f"✓ Connected to database: {db_name}")
        else:
            print(f"ERROR: Connected to wrong database: {db_name} (expected: acts_db)")
            sys.exit(1)
except Exception as e:
    print(f"ERROR: Failed to connect to database: {e}")
    print(f"DATABASE_URL: {masked_url}")
    sys.exit(1)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

