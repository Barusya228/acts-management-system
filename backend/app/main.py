from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from sqlalchemy import text
from fastapi import HTTPException

from app.core.config import settings
from app.api.v1.api import api_router
from app.core.db.session import SessionLocal, engine
from app.db.models.user import User, UserRole
from app.core.security import get_password_hash
import os


def seed_admin_user():
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.email == "admin@example.com").first()

        if admin:
            print("Admin user already exists: admin@acts.local")
            return

        admin_password = os.getenv("ADMIN_PASSWORD")
        if not admin_password:
            raise RuntimeError("ADMIN_PASSWORD is not set")

        admin = User(
            email="admin@example.com",
            full_name="System Administrator",
            password_hash=get_password_hash(admin_password),
            role=UserRole.ADMIN,
            is_active=True,
        )

        db.add(admin)
        db.commit()

        print("Admin user created successfully")

    except Exception as e:
        db.rollback()
        print(f"Critical error creating admin user: {e}")
        raise
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ----- STARTUP -----
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("Database connection successful")
    except Exception as e:
        print(f"Database connection failed: {e}")
        raise

    seed_admin_user()

    yield

    # ----- SHUTDOWN -----
    print("Shutting down application...")


app = FastAPI(
    title="Acts Digitalization API",
    description="API for digitalization of equipment issuance acts",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(api_router, prefix="/api")


@app.get("/")
def root():
    return {"message": "Acts Digitalization API", "version": "1.0.0"}


@app.get("/health")
def health():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok"}
    except:
        return {"status": "db_error"}


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        raise exc
    print(f"Unhandled error: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )
