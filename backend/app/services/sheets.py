"""
Google Sheets service — read/write operations via gspread.

Handles all interactions with Google Sheets as the cloud database.
Uses a service account for authentication.

Sheet column headers must match the app's snake_case field names
exactly (e.g. animal_id, arete_id, updated_at).

Setup:
    1. Create a Google Cloud project
    2. Enable Google Sheets API
    3. Create a service account and download JSON key
    4. Share the spreadsheet with the service account email
    5. Set GOOGLE_SHEETS_CREDENTIALS_FILE and GOOGLE_SHEETS_SPREADSHEET_ID
       environment variables
"""

import logging
import os
from functools import lru_cache

import gspread
from google.oauth2.service_account import Credentials

logger = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

# Sheet names matching the XLSX template
SHEET_NAMES = {
    "animals": "Registro",
    "health": "Salud",
    "reproduction": "Reproduccion",
    "observations": "Observaciones",
    "sales": "Ventas",
    "recorridos": "Recorridos",
    "users": "Usuarios",
}

# Primary key per table (snake_case, matches both app and sheet headers)
PK_KEYS = {
    "animals": "animal_id",
    "health": "salud_id",
    "reproduction": "reproduccion_id",
    "observations": "observacion_id",
    "sales": "venta_id",
    "recorridos": "recorrido_id",
    "users": "user_id",
}


# ── Auth helpers ──


@lru_cache(maxsize=1)
def get_client() -> gspread.Client:
    """Get authenticated gspread client (cached singleton)."""
    creds_file = os.getenv(
        "GOOGLE_SHEETS_CREDENTIALS_FILE", "credentials.json"
    )
    creds = Credentials.from_service_account_file(creds_file, scopes=SCOPES)
    return gspread.authorize(creds)


def get_spreadsheet() -> gspread.Spreadsheet:
    """Get the livestock register spreadsheet."""
    client = get_client()
    spreadsheet_id = os.getenv("GOOGLE_SHEETS_SPREADSHEET_ID", "")
    if not spreadsheet_id:
        raise ValueError(
            "GOOGLE_SHEETS_SPREADSHEET_ID environment variable not set"
        )
    return client.open_by_key(spreadsheet_id)


# ── Read / Write ──


def read_sheet(table_name: str) -> list[dict]:
    """
    Read all records from a sheet as a list of dicts.

    Args:
        table_name: Internal table name (e.g., 'animals', 'health')

    Returns:
        List of row dicts keyed by column header (snake_case).
    """
    sheet_name = SHEET_NAMES.get(table_name)
    if not sheet_name:
        raise ValueError(f"Unknown table: {table_name}")

    spreadsheet = get_spreadsheet()
    worksheet = spreadsheet.worksheet(sheet_name)
    return worksheet.get_all_records()


def write_sheet(table_name: str, records: list[dict]) -> None:
    """
    Overwrite a sheet with the given records.

    Preserves headers (row 1) and replaces all data rows.

    Args:
        table_name: Internal table name
        records: List of row dicts (keys must match sheet headers)
    """
    sheet_name = SHEET_NAMES.get(table_name)
    if not sheet_name:
        raise ValueError(f"Unknown table: {table_name}")

    spreadsheet = get_spreadsheet()
    worksheet = spreadsheet.worksheet(sheet_name)

    if not records:
        if worksheet.row_count > 1:
            worksheet.delete_rows(2, worksheet.row_count)
        return

    headers = worksheet.row_values(1)
    if not headers:
        return

    rows = []
    for record in records:
        row = [str(record.get(h, "")) for h in headers]
        rows.append(row)

    if worksheet.row_count > 1:
        worksheet.delete_rows(2, worksheet.row_count)

    if rows:
        worksheet.append_rows(rows, value_input_option="USER_ENTERED")


# ── Merge (sync) ──


def merge_records(
    table_name: str,
    local_records: list[dict],
) -> list[dict]:
    """
    Merge local records with cloud records using last-write-wins.

    Args:
        table_name: Internal table name
        local_records: Records from the client's IndexedDB

    Returns:
        Merged list of records, all marked as synced.
    """
    pk_key = PK_KEYS.get(table_name)
    if not pk_key:
        raise ValueError(f"Unknown table: {table_name}")

    try:
        cloud_records = read_sheet(table_name)
    except Exception as exc:
        logger.warning("Could not read sheet '%s': %s", table_name, exc)
        cloud_records = []

    cloud_index: dict[str, dict] = {}
    for record in cloud_records:
        pk = str(record.get(pk_key, ""))
        if pk:
            cloud_index[pk] = record

    for local in local_records:
        pk = str(local.get(pk_key, ""))
        if not pk:
            continue

        existing = cloud_index.get(pk)
        if existing:
            local_ts = local.get("updated_at", "")
            cloud_ts = existing.get("updated_at", "")
            if local_ts >= cloud_ts:
                cloud_index[pk] = local
        else:
            cloud_index[pk] = local

    merged = list(cloud_index.values())

    try:
        write_sheet(table_name, merged)
    except Exception as exc:
        logger.warning("Could not write sheet '%s': %s", table_name, exc)

    for record in merged:
        record["_sync_status"] = "synced"

    return merged
