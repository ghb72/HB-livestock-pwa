"""
Google Sheets service — read/write operations via gspread.

Handles all interactions with Google Sheets as the cloud database.
Uses a service account for authentication.

Setup:
    1. Create a Google Cloud project
    2. Enable Google Sheets API
    3. Create a service account and download JSON key
    4. Share the spreadsheet with the service account email
    5. Set GOOGLE_SHEETS_CREDENTIALS_FILE and GOOGLE_SHEETS_SPREADSHEET_ID
       environment variables
"""

import os
from functools import lru_cache

import gspread
from google.oauth2.service_account import Credentials

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

# Primary key column for each sheet (used for merge operations)
PK_COLUMNS = {
    "animals": "Animal_ID",
    "health": "Salud_ID",
    "reproduction": "Reproduccion_ID",
    "observations": "Observacion_ID",
    "sales": "Venta_ID",
    "recorridos": "Recorrido_ID",
    "users": "User_ID",
}


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


def read_sheet(table_name: str) -> list[dict]:
    """
    Read all records from a sheet as a list of dicts.

    Args:
        table_name: Internal table name (e.g., 'animals', 'health')

    Returns:
        List of row dicts with column headers as keys.
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
        records: List of row dicts to write
    """
    sheet_name = SHEET_NAMES.get(table_name)
    if not sheet_name:
        raise ValueError(f"Unknown table: {table_name}")

    spreadsheet = get_spreadsheet()
    worksheet = spreadsheet.worksheet(sheet_name)

    if not records:
        # Clear data rows but keep headers
        if worksheet.row_count > 1:
            worksheet.delete_rows(2, worksheet.row_count)
        return

    # Get headers from first row
    headers = worksheet.row_values(1)
    if not headers:
        return

    # Build rows in header order
    rows = []
    for record in records:
        row = [str(record.get(h, "")) for h in headers]
        rows.append(row)

    # Clear existing data and write new
    if worksheet.row_count > 1:
        worksheet.delete_rows(2, worksheet.row_count)

    if rows:
        worksheet.append_rows(rows, value_input_option="USER_ENTERED")


def merge_records(
    table_name: str,
    local_records: list[dict],
) -> list[dict]:
    """
    Merge local records with cloud records using last-write-wins.

    Strategy:
        1. Read all cloud records
        2. Index both sets by primary key
        3. For each record, keep the one with the latest updated_at
        4. Write merged result back to cloud
        5. Return merged records (all marked as synced)

    Args:
        table_name: Internal table name
        local_records: Records from the client's IndexedDB

    Returns:
        Merged list of records to send back to the client.
    """
    pk_col = PK_COLUMNS.get(table_name)
    if not pk_col:
        raise ValueError(f"Unknown table: {table_name}")

    # Read cloud records
    try:
        cloud_records = read_sheet(table_name)
    except Exception:
        cloud_records = []

    # Index by primary key
    cloud_index: dict[str, dict] = {}
    for record in cloud_records:
        pk = str(record.get(pk_col, ""))
        if pk:
            cloud_index[pk] = record

    # Merge: last-write-wins based on updated_at
    for local in local_records:
        pk = str(local.get(pk_col.lower().replace("_id", "_id"), ""))
        # Also try the exact key name from local (camelCase variations)
        if not pk:
            # Try all possible key names
            for key in local:
                if key.lower().replace("_", "") == pk_col.lower().replace("_", ""):
                    pk = str(local[key])
                    break

        if not pk:
            continue

        cloud_record = cloud_index.get(pk)
        if cloud_record:
            # Compare timestamps
            local_ts = local.get("updated_at", "")
            cloud_ts = cloud_record.get("Actualizado", "")
            if local_ts >= cloud_ts:
                cloud_index[pk] = local
        else:
            # New record from local
            cloud_index[pk] = local

    merged = list(cloud_index.values())

    # Write back to cloud
    try:
        write_sheet(table_name, merged)
    except Exception:
        pass  # If write fails, still return merged for local update

    # Mark all as synced
    for record in merged:
        record["_sync_status"] = "synced"

    return merged
