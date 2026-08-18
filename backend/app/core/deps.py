from datetime import datetime

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from uuid import UUID
from app.core.database import get_db
from app.core.security import decode_access_token
from app.db.models import KioskDevice, User, UserRole

security = HTTPBearer()

KIOSK_ACTIVE_STATUS = "ACTIVE"


def _validate_kiosk_claim(request: Request, payload: dict, db: Session) -> None:
    """Kiosk tokens carry a kiosk_id claim; the device must still be enrolled."""
    kiosk_id = payload.get("kiosk_id")
    if not kiosk_id:
        return
    try:
        kiosk_uuid = UUID(str(kiosk_id))
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный токен устройства")
    kiosk = db.query(KioskDevice).filter(KioskDevice.id == kiosk_uuid).first()
    if not kiosk or kiosk.status != KIOSK_ACTIVE_STATUS:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Устройство подписания отключено администратором")
    kiosk.last_seen_at = datetime.utcnow()
    db.commit()
    request.state.kiosk_device = kiosk


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    token = credentials.credentials
    payload = decode_access_token(token)
    
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials"
        )
    
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials"
        )

    try:
        user_uuid = UUID(user_id)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials"
        )
    
    user = db.query(User).filter(User.id == user_uuid).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )

    if user.role == UserRole.GUEST:
        _validate_kiosk_claim(request, payload, db)
        if getattr(request.state, "kiosk_device", None) is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Требуется зарегистрированное устройство подписания",
            )

    return user

async def get_current_admin_user(
    current_user: User = Depends(get_current_user)
) -> User:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    return current_user


async def get_current_guest_or_admin_user(
    current_user: User = Depends(get_current_user)
) -> User:
    if current_user.role not in {UserRole.ADMIN, UserRole.GUEST}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав"
        )
    return current_user
