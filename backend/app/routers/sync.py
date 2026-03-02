"""
Sync router — handles bidirectional sync between PWA and Google Sheets.

Endpoints:
    POST /api/sync/{table_name} — Push pending records, receive merged data
    GET  /api/sync/pull          — Pull all data from Google Sheets
"""

import logging

from fastapi import APIRouter, HTTPException

from ..models import PullResponse, SyncRequest, SyncResponse
from ..services.sheets import merge_records, read_sheet

logger = logging.getLogger(__name__)
router = APIRouter()

VALID_TABLES = {"animals", "health", "reproduction", "observations", "sales", "recorridos"}


def _safe_read(table_name: str) -> list[dict]:
    """Read a sheet table, returning empty list if credentials missing."""
    try:
        return read_sheet(table_name)
    except (FileNotFoundError, ValueError) as e:
        logger.warning("Sheets unavailable for '%s': %s", table_name, e)
        return []


@router.post("/{table_name}", response_model=SyncResponse)
async def sync_table(table_name: str, request: SyncRequest):
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
        return SyncResponse(
            merged=merged,
            synced_count=len(request.records),
            server_count=len(merged),
        )
    except (FileNotFoundError, ValueError) as e:
        logger.warning("Sheets unavailable for sync '%s': %s", table_name, e)
        # Return the client records as-is so nothing is lost
        return SyncResponse(
            merged=request.records,
            synced_count=0,
            server_count=0,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Sync failed: {str(e)}",
        )


@router.get("/pull", response_model=PullResponse)
async def pull_all():
    """
    Pull all data from Google Sheets.

    Used for initial load or manual refresh from cloud.
    Returns empty data if Google Sheets credentials are not configured.
    """
    return PullResponse(
        animals=_safe_read("animals"),
        health=_safe_read("health"),
        reproduction=_safe_read("reproduction"),
        observations=_safe_read("observations"),
        sales=_safe_read("sales"),
        recorridos=_safe_read("recorridos"),
    )
