"""Supabase-backed read/write operations for synced business tables."""

import logging

from .supabase import delete_rows, select_rows, upsert_rows

logger = logging.getLogger(__name__)

SHEET_NAMES = {
    "animals": "animals",
    "health": "health",
    "reproduction": "reproduction",
    "observations": "observations",
    "sales": "sales",
    "recorridos": "recorridos",
    "users": "users",
}

PK_KEYS = {
    "animals": "animal_id",
    "health": "salud_id",
    "reproduction": "reproduccion_id",
    "observations": "observacion_id",
    "sales": "venta_id",
    "recorridos": "entry_id",
    "users": "user_id",
}


def read_sheet(table_name: str) -> list[dict]:
    """Read all rows from a synced Supabase table."""
    remote_name = SHEET_NAMES.get(table_name)
    if not remote_name:
        raise ValueError(f"Unknown table: {table_name}")
    return select_rows(remote_name)


def read_all_sheets(
    exclude: set[str] | None = None,
) -> dict[str, list[dict]]:
    """Read all synced tables from Supabase."""
    exclude = exclude or set()
    result: dict[str, list[dict]] = {}

    for name in SHEET_NAMES:
        if name in exclude:
            continue
        result[name] = read_sheet(name)

    return result


def write_sheet(table_name: str, records: list[dict]) -> None:
    """Upsert rows into the mapped Supabase table."""
    remote_name = SHEET_NAMES.get(table_name)
    pk_key = PK_KEYS.get(table_name)
    if not remote_name or not pk_key:
        raise ValueError(f"Unknown table: {table_name}")
    upsert_rows(remote_name, records, pk_key)


def merge_records(
    table_name: str,
    local_records: list[dict],
) -> list[dict]:
    """Merge local records with Supabase rows using last-write-wins."""
    pk_key = PK_KEYS.get(table_name)
    remote_name = SHEET_NAMES.get(table_name)
    if not pk_key:
        raise ValueError(f"Unknown table: {table_name}")
    if not remote_name:
        raise ValueError(f"Unknown table mapping: {table_name}")

    try:
        cloud_records = read_sheet(table_name)
    except Exception as exc:
        logger.warning("Could not read table '%s': %s", table_name, exc)
        cloud_records = []

    cloud_index: dict[str, dict] = {}
    for record in cloud_records:
        pk = str(record.get(pk_key, ""))
        if pk:
            cloud_index[pk] = record

    deleted_ids: set[str] = set()

    for local in local_records:
        pk = str(local.get(pk_key, ""))
        if not pk:
            continue

        if local.get("_deleted"):
            cloud_index.pop(pk, None)
            deleted_ids.add(pk)
            continue

        existing = cloud_index.get(pk)
        if existing:
            local_ts = local.get("updated_at", "")
            cloud_ts = existing.get("updated_at", "")
            if local_ts >= cloud_ts:
                cloud_index[pk] = local
        else:
            cloud_index[pk] = local

    merged = [_sanitize_record(record) for record in cloud_index.values()]

    if local_records:
        try:
            if deleted_ids:
                delete_rows(remote_name, pk_key, sorted(deleted_ids))
            if merged:
                write_sheet(table_name, merged)
        except Exception as exc:
            logger.warning("Could not persist table '%s': %s", table_name, exc)

    for record in merged:
        record["_sync_status"] = "synced"

    return merged


def _sanitize_record(record: dict) -> dict:
    clean_record = dict(record)
    clean_record.pop("_deleted", None)
    clean_record.pop("_sync_status", None)
    clean_record.pop("synced", None)
    clean_record.pop("deleted", None)
    return clean_record
