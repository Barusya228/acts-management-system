from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str
    
    # PostgreSQL connection details (for validation)
    POSTGRES_USER: str = os.getenv("POSTGRES_USER", "acts_user")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "acts_password")
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", "acts_db")
    
    # Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # SMTP
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "noreply@acts.local"
    SMTP_TLS: bool = True
    
    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000"]
    
    # Active Directory
    AD_ENABLED: bool = False
    AD_SERVER: str = ""
    AD_PORT: int = 389
    AD_USER: str = ""
    AD_PASSWORD: str = ""
    AD_SEARCH_BASE: str = ""
    
    # Storage
    STORAGE_PATH: str = "storage"
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

