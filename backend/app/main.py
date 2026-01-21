from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.v1.api import api_router
from app.core.db.session import SessionLocal
from app.db.models.user import User, UserRole
from app.core.security import get_password_hash


def seed_admin_user():
    """Create admin user if it doesn't exist."""
    db = SessionLocal()
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
        # Don't raise - allow app to start even if admin creation fails
    finally:
        db.close()


app = FastAPI(
    title="Acts Digitalization API",
    description="API for digitalization of equipment issuance acts",
    version="1.0.0",
)


@app.on_event("startup")
async def startup_event():
    """Run on application startup."""
    seed_admin_user()


# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(api_router, prefix="/api")


@app.get("/")
def root():
    return {"message": "Acts Digitalization API", "version": "1.0.0"}


@app.get("/health")
def health():
    return {"status": "ok"}

