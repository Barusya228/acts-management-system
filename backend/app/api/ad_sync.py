from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_admin_user
from app.db.models import User
from app.services.ad_sync_service import sync_ad_users, prune_ad_participants

router = APIRouter()


@router.post("/run")
async def run_ad_sync(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    result = sync_ad_users(db)
    return result


@router.post("/reset")
async def reset_ad_participants(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    result = prune_ad_participants(db)
    return result
