import httpx
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import auth, acts, templates, participants, reminders, analytics, ad_sync, inventory, backups, audit, email_outbox, ipad_acts

FRONTEND_URL = "http://127.0.0.1:3000"

app = FastAPI(
    title="Acts Digitalization API",
    description="API for digitalizing equipment issuance acts",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=settings.CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(acts.router, prefix="/api/acts", tags=["acts"])
app.include_router(templates.router, prefix="/api/templates", tags=["templates"])
app.include_router(participants.router, prefix="/api/participants", tags=["participants"])
app.include_router(reminders.router, prefix="/api/reminders", tags=["reminders"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])
app.include_router(ad_sync.router, prefix="/api/admin/ad-sync", tags=["ad-sync"])
app.include_router(inventory.router, prefix="/api/inventory", tags=["inventory"])
app.include_router(backups.router, prefix="/api/admin/backups", tags=["backups"])
app.include_router(audit.router, prefix="/api/admin/audit-log", tags=["audit"])
app.include_router(email_outbox.router, prefix="/api/admin/email-outbox", tags=["email-outbox"])
app.include_router(ipad_acts.router, prefix="/api/ipad-acts", tags=["ipad-acts"])

@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def frontend_proxy(path: str, request: Request):
    target_url = httpx.URL(f"{FRONTEND_URL}/{path}").copy_with(query=request.url.query.encode("utf-8"))
    headers = {key: value for key, value in request.headers.items() if key.lower() != "host"}

    async with httpx.AsyncClient(follow_redirects=False) as client:
        frontend_response = await client.request(
            request.method,
            target_url,
            headers=headers,
            content=await request.body(),
        )

    response_headers = {
        key: value
        for key, value in frontend_response.headers.items()
        if key.lower() not in {"content-encoding", "content-length", "transfer-encoding", "connection"}
    }
    return Response(
        content=frontend_response.content,
        status_code=frontend_response.status_code,
        headers=response_headers,
    )
