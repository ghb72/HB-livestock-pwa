"""
Sync router — handles bidirectional sync between PWA and Supabase.

Endpoints:
    POST /api/sync/{table_name} — Push pending records, receive merged data
    GET  /api/sync/pull          — Pull all data from Supabase tables
    GET  /api/sync/state         — Lightweight sync state for change detection
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from ..auth import verify_token
from ..models import PullResponse, SyncRequest, SyncResponse
from ..services.sheets import merge_records, read_all_sheets, read_sheet

logger = logging.getLogger(__name__)
router = APIRouter()

VALID_TABLES = {"animals", "health", "reproduction", "observations", "sales", "recorridos"}

# In-memory sync state — resets on server restart (forces a full sync)
_sync_version: int = 0
_sync_modified_at: str = ""


def _bump_sync_state() -> None:
    """Increment the sync version and update the modified timestamp."""
    global _sync_version, _sync_modified_at
    _sync_version += 1
    _sync_modified_at = datetime.now(timezone.utc).isoformat()


def _safe_read(table_name: str) -> list[dict]:
    """Read a remote table, returning empty list if backend storage is unavailable."""
    try:
        return read_sheet(table_name)
    except Exception as e:
        logger.warning("Supabase unavailable for '%s': %s — %s", table_name, type(e).__name__, e)
        return []


@router.get("/state")
async def get_sync_state(_: str = Depends(verify_token)):
    """
    Lightweight sync state for the PWA to detect remote changes.

    Returns version + modified_at so the client can skip a full
    pull when nothing has changed since its last check.
    """
    return {"modified_at": _sync_modified_at, "version": str(_sync_version)}


@router.post("/{table_name}", response_model=SyncResponse)
async def sync_table(
    table_name: str,
    request: SyncRequest,
    _: str = Depends(verify_token),
):
    """
    Sync a single table: push local pending records and receive merged data.

    The merge uses last-write-wins based on the updated_at timestamp.
    """
    if table_name not in VALID_TABLES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid table: {table_name}. Valid: {VALID_TABLES}",
        )

    try:
        merged = merge_records(table_name, request.records)
        _bump_sync_state()
        return SyncResponse(
            merged=merged,
            synced_count=len(request.records),
            server_count=len(merged),
        )
    except (FileNotFoundError, ValueError) as e:
        logger.warning("Supabase unavailable for sync '%s': %s", table_name, e)
        # Return the client records as-is so nothing is lost
        return SyncResponse(
            merged=request.records,
            synced_count=0,
            server_count=0,
        )
    except Exception as e:
        logger.warning("Supabase error on sync '%s': %s — %s", table_name, type(e).__name__, e)
        return SyncResponse(
            merged=request.records,
            synced_count=0,
            server_count=0,
        )


@router.get("/pull", response_model=PullResponse)
async def pull_all(_: str = Depends(verify_token)):
    """
    Pull all data from Supabase.

    Used for initial load or manual refresh from cloud.
    Returns empty data if Supabase credentials are not configured.
    Uses a single backend request that fans out across all synced tables.
    """
    try:
        data = read_all_sheets(exclude={"users"})
    except Exception as e:
        logger.warning("Supabase batch read failed: %s — %s", type(e).__name__, e)
        data = {}

    return PullResponse(
        animals=data.get("animals", []),
        health=data.get("health", []),
        reproduction=data.get("reproduction", []),
        observations=data.get("observations", []),
        sales=data.get("sales", []),
        recorridos=data.get("recorridos", []),
    )
