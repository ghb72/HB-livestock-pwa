"""
Livestock Register — FastAPI Backend

Provides sync endpoints between the PWA (IndexedDB) and Supabase.
Uses timestamp-based last-write-wins sync strategy.

Usage:
    uvicorn backend.app.main:app --reload --port 8000
"""

import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from .auth import verify_token
from .routers import auth, photos, sync
from .services import sheets, supabase

BASE_DIR = Path(__file__).resolve().parent.parent


def _current_app_env() -> str:
    return (os.getenv("APP_ENV") or os.getenv("ENVIRONMENT") or "development").strip().lower()


def _load_environment() -> str:
    app_env = _current_app_env()

    for env_file in (BASE_DIR / f".env.{app_env}", BASE_DIR / ".env"):
        if env_file.exists():
            load_dotenv(env_file, override=False)

    return _current_app_env()


def _parse_csv_env(name: str) -> list[str]:
    return [value.strip() for value in os.getenv(name, "").split(",") if value.strip()]


APP_ENV = _load_environment()

app = FastAPI(
    title="Livestock Register API",
    description="Backend for livestock management PWA — sync with Supabase tables and storage",
    version="2.1.0",
)

# CORS — fully configured from the selected environment file
_origins = _parse_csv_env("CORS_ORIGINS")
_origin_regex = os.getenv("CORS_ALLOW_ORIGIN_REGEX", "").strip() or None

if _origins == ["*"] and _origin_regex is None:
    _origins = []
    _origin_regex = ".*"

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_origin_regex=_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "service": "Livestock Register API"}


@app.get("/health")
async def health():
    """Detailed health check."""
    return {"status": "healthy", "version": "2.1.0"}


@app.get("/health/db")
async def health_db(_: str = Depends(verify_token)):
    """
    Deep health check that actually reaches Supabase.

    Every other endpoint answers from memory — including /api/sync/state,
    whose version counter is a module global — so none of them registers
    activity on the Supabase project. The free tier pauses a project after
    about a week without API traffic, so an external cron calls this endpoint
    daily to keep it awake; see the keep-alive cron section in README.md.
    """
    try:
        supabase.ping(sheets.SHEET_NAMES["animals"], sheets.PK_KEYS["animals"])
    except Exception as exc:  # noqa: BLE001 — any failure means "not reachable"
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Supabase unreachable: {exc}",
        ) from exc

    return {
        "status": "healthy",
        "database": "reachable",
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(sync.router, prefix="/api/sync", tags=["sync"])
app.include_router(photos.router, prefix="/api/photos", tags=["photos"])
