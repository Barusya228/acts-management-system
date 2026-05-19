from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db.session import get_db
from app.core.dependencies import get_current_admin_user
from app.db.models.user import User
from app.services.ad_sync_service import sync_ad_users

router = APIRouter()


@router.post("/run")
def run_ad_sync(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    result = sync_ad_users(db)
    return result
