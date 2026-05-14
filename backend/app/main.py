"""
Livestock Register — FastAPI Backend

Provides sync endpoints between the PWA (IndexedDB) and Supabase.
Uses timestamp-based last-write-wins sync strategy.

Usage:
    uvicorn backend.app.main:app --reload --port 8000
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import auth, photos, sync

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


app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(sync.router, prefix="/api/sync", tags=["sync"])
app.include_router(photos.router, prefix="/api/photos", tags=["photos"])
