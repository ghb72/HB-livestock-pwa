"""
Livestock Register — FastAPI Backend

Provides sync endpoints between the PWA (IndexedDB) and Google Sheets.
Uses timestamp-based last-write-wins sync strategy.

Usage:
    uvicorn backend.app.main:app --reload --port 8000
"""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import photos, sync

app = FastAPI(
    title="Livestock Register API",
    description="Backend for livestock management PWA — sync with Google Sheets",
    version="1.0.0",
)

# CORS — allow PWA frontend (dev + production)
_extra_origins = os.getenv("CORS_ORIGINS", "").split(",")
_origins = [
    "http://localhost:5173",              # Vite dev server
    "http://localhost:4173",              # Vite preview
    "https://ganadolaescondida.vercel.app",  # Production frontend
] + [o.strip() for o in _extra_origins if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
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
    return {"status": "healthy", "version": "1.0.0"}


app.include_router(sync.router, prefix="/api/sync", tags=["sync"])
app.include_router(photos.router, prefix="/api/photos", tags=["photos"])
