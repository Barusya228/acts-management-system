from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import auth, acts, templates, participants, reminders, analytics

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

@app.get("/")
async def root():
    return {"message": "Acts Digitalization API", "version": "1.0.0"}

@app.get("/health")
async def health():
    return {"status": "healthy"}
