from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)

    # Database
    DATABASE_URL: str = "postgresql://user:password@localhost:5432/acts_db"
    
    # Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000"]
    CORS_ORIGIN_REGEX: Optional[str] = r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$"
    
    # SMTP
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""
    SMTP_TLS: bool = True
    
    # Storage
    STORAGE_PATH: str = "./storage"

    # PDF backups
    PDF_BACKUP_ENABLED: bool = False
    PDF_BACKUP_PATH: str = "./pdf-backups"
    PDF_BACKUP_LABEL: str = "Google Drive"

    # Public URLs
    APP_BASE_URL: str = "http://localhost:8000"
    
    # Active Directory
    AD_ENABLED: bool = False
    AD_SERVER: str = ""
    AD_PORT: int = 389
    AD_USER: str = ""
    AD_PASSWORD: str = ""
    AD_SEARCH_BASE: str = ""
    
settings = Settings()
