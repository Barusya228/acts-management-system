import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_admin_user, get_current_user
from app.core.security import verify_password, create_access_token
from app.core.config import settings
from app.db.models import KioskDevice, User, UserRole
from app.schemas.schemas import KioskCreateRequest, KioskEnrollRequest, LoginRequest, Token, UserResponse
from app.services.audit_service import record_audit

router = APIRouter()

ENROLLMENT_CODE_TTL_MINUTES = 10
KIOSK_TOKEN_DAYS = 180

# Простая защита от перебора пароля: не более N неудачных попыток с одного IP
# за окно. In-memory — достаточно для единственного uvicorn-процесса.
LOGIN_MAX_FAILURES = 10
LOGIN_WINDOW_SECONDS = 300
_login_failures: dict[str, list[float]] = {}


def _check_login_rate_limit(client_ip: str) -> None:
    now = datetime.utcnow().timestamp()
    attempts = [ts for ts in _login_failures.get(client_ip, []) if now - ts < LOGIN_WINDOW_SECONDS]
    _login_failures[client_ip] = attempts
    if len(attempts) >= LOGIN_MAX_FAILURES:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Слишком много попыток входа. Повторите через несколько минут.",
        )


def _record_login_failure(client_ip: str) -> None:
    _login_failures.setdefault(client_ip, []).append(datetime.utcnow().timestamp())


@router.post("/login", response_model=Token)
async def login(
    login_data: LoginRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    client_ip = request.client.host if request.client else "unknown"
    _check_login_rate_limit(client_ip)

    user = db.query(User).filter(User.username == login_data.username).first()
    
    if not user or not verify_password(login_data.password, user.password_hash):
        _record_login_failure(client_ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль"
        )
    _login_failures.pop(client_ip, None)
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Пользователь неактивен"
        )
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user)
):
    return current_user


def _generate_enrollment_code() -> str:
    """Six digits, grouped for reading aloud across the room."""
    return f"{secrets.randbelow(1000):03d}-{secrets.randbelow(1000):03d}"


@router.post("/kiosks", status_code=status.HTTP_201_CREATED)
def create_kiosk_enrollment(
    payload: KioskCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Укажите название устройства, например «iPad кабинет С314»")
    kiosk = KioskDevice(
        name=name,
        status="PENDING",
        enrollment_code=_generate_enrollment_code(),
        enrollment_expires_at=datetime.utcnow() + timedelta(minutes=ENROLLMENT_CODE_TTL_MINUTES),
        created_by=current_user.id,
    )
    db.add(kiosk)
    db.flush()
    record_audit(db, current_user, "KIOSK", kiosk.id, "KIOSK_ENROLLMENT_CREATED", {"name": name})
    db.commit()
    return {
        "id": str(kiosk.id),
        "name": kiosk.name,
        "enrollment_code": kiosk.enrollment_code,
        "expires_at": kiosk.enrollment_expires_at.isoformat(),
    }


@router.post("/kiosks/enroll", response_model=Token)
def enroll_kiosk(payload: KioskEnrollRequest, db: Session = Depends(get_db)):
    code = payload.enrollment_code.strip()
    kiosk = db.query(KioskDevice).filter(
        KioskDevice.enrollment_code == code,
        KioskDevice.status == "PENDING",
    ).with_for_update().first()
    if not kiosk or not kiosk.enrollment_expires_at or kiosk.enrollment_expires_at < datetime.utcnow():
        raise HTTPException(status_code=401, detail="Код привязки неверен или истёк. Создайте новый в админке.")

    signer = db.query(User).filter(User.role == UserRole.GUEST, User.is_active.is_(True)).first()
    if not signer:
        raise HTTPException(status_code=409, detail="Служебный пользователь подписания не найден")

    kiosk.status = "ACTIVE"
    kiosk.enrollment_code = None
    kiosk.enrollment_expires_at = None
    kiosk.enrolled_at = datetime.utcnow()
    kiosk.last_seen_at = datetime.utcnow()
    record_audit(db, None, "KIOSK", kiosk.id, "KIOSK_ENROLLED", {"name": kiosk.name})
    db.commit()

    token = create_access_token(
        data={"sub": str(signer.id), "kiosk_id": str(kiosk.id)},
        expires_delta=timedelta(days=KIOSK_TOKEN_DAYS),
    )
    return {"access_token": token, "token_type": "bearer"}


@router.get("/kiosks")
def list_kiosks(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_admin_user),
):
    kiosks = db.query(KioskDevice).order_by(KioskDevice.created_at.desc()).all()
    now = datetime.utcnow()
    return [{
        "id": str(item.id),
        "name": item.name,
        "status": (
            "EXPIRED"
            if item.status == "PENDING" and item.enrollment_expires_at and item.enrollment_expires_at < now
            else item.status
        ),
        "enrollment_code": item.enrollment_code if item.status == "PENDING" and item.enrollment_expires_at and item.enrollment_expires_at >= now else None,
        "enrolled_at": item.enrolled_at.isoformat() if item.enrolled_at else None,
        "last_seen_at": item.last_seen_at.isoformat() if item.last_seen_at else None,
    } for item in kiosks]


@router.delete("/kiosks/{kiosk_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_kiosk(
    kiosk_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    kiosk = db.query(KioskDevice).filter(KioskDevice.id == kiosk_id).with_for_update().first()
    if not kiosk:
        raise HTTPException(status_code=404, detail="Устройство не найдено")
    kiosk.status = "REVOKED"
    kiosk.enrollment_code = None
    kiosk.revoked_at = datetime.utcnow()
    record_audit(db, current_user, "KIOSK", kiosk.id, "KIOSK_REVOKED", {"name": kiosk.name})
    db.commit()
    return None


@router.get("/kiosk-context")
def kiosk_context(request: Request, _current_user: User = Depends(get_current_user)):
    kiosk = getattr(request.state, "kiosk_device", None)
    if not kiosk:
        return {"kiosk": None}
    return {"kiosk": {"id": str(kiosk.id), "name": kiosk.name}}
