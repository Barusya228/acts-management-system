from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from app.core.db.session import get_db
from app.core.dependencies import get_current_user
from app.db.models.user import User
from app.schemas.user import Token, UserResponse
from app.services.auth_service import authenticate_user, create_access_token_for_user

router = APIRouter()


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


@router.post("/login", response_model=Token)
def login(credentials: LoginRequest, db: Session = Depends(get_db)):
    """Login endpoint"""
    user = authenticate_user(db, credentials.email, credentials.password)
    access_token = create_access_token_for_user(user)
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=UserResponse)
def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user info"""
    return current_user

