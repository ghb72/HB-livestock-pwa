"""
Sync router — handles bidirectional sync between PWA and Google Sheets.

Endpoints:
    POST /api/sync/{table_name} — Push pending records, receive merged data
    GET  /api/sync/pull          — Pull all data from Google Sheets
"""

from fastapi import APIRouter, HTTPException

from ..models import PullResponse, SyncRequest, SyncResponse
from ..services.sheets import merge_records, read_sheet

router = APIRouter()

VALID_TABLES = {"animals", "health", "reproduction", "observations", "sales", "recorridos"}


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
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
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
    """
    try:
        return PullResponse(
            animals=read_sheet("animals"),
            health=read_sheet("health"),
            reproduction=read_sheet("reproduction"),
            observations=read_sheet("observations"),
            sales=read_sheet("sales"),
            recorridos=read_sheet("recorridos"),
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Pull failed: {str(e)}",
        )
