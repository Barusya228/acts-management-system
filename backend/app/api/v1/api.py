from fastapi import APIRouter
from app.api.v1.endpoints import auth, templates, acts, ad_sync

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(templates.router, prefix="/templates", tags=["templates"])
api_router.include_router(acts.router, prefix="/acts", tags=["acts"])
api_router.include_router(ad_sync.router, prefix="/admin/ad-sync", tags=["ad-sync"])

