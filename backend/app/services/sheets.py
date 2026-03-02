"""
Google Sheets service — read/write operations via gspread.

Handles all interactions with Google Sheets as the cloud database.
Uses a service account for authentication.

Includes bidirectional key mapping between the app's snake_case field
names (used by IndexedDB / the frontend) and the human-readable
column headers used in the Google Sheets template.

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

# Primary key (app-side snake_case key) per table
PK_APP_KEYS = {
    "animals": "animal_id",
    "health": "salud_id",
    "reproduction": "reproduccion_id",
    "observations": "observacion_id",
    "sales": "venta_id",
    "recorridos": "recorrido_id",
    "users": "user_id",
}

# ── Column mapping: app key → sheet header ──
# Each dict maps the snake_case field name the frontend sends
# to the human-readable header in the Google Sheets template.

_COMMON_META = {
    "created_by": "Creado Por",
    "updated_at": "Actualizado",
    "created_at": "Creado",
}

COLUMN_MAPS: dict[str, dict[str, str]] = {
    "animals": {
        "animal_id": "Animal_ID",
        "arete_id": "No. Arete (ID)",
        "nombre": "Nombre",
        "tipo": "Tipo",
        "sexo": "Sexo",
        "fecha_nacimiento": "Fecha Nacimiento",
        "raza": "Raza",
        "madre_id": "Madre ID",
        "padre_id": "Padre ID",
        "temperamento": "Temperamento",
        "estado": "Estado",
        "peso_actual": "Peso Actual (kg)",
        "notas": "Notas",
        "foto_url": "Foto URL",
        **_COMMON_META,
    },
    "health": {
        "salud_id": "Salud_ID",
        "animal_id": "Animal_ID",
        "fecha": "Fecha",
        "tipo_evento": "Tipo Evento",
        "producto": "Producto",
        "dosis": "Dosis",
        "estado_general": "Estado General",
        "proxima_aplicacion": "Próxima Aplicación",
        "notas": "Notas",
        **_COMMON_META,
    },
    "reproduction": {
        "reproduccion_id": "Reproduccion_ID",
        "vaca_id": "Vaca_ID",
        "semental_id": "Semental_ID",
        "fecha_monta": "Fecha Monta",
        "fecha_posible_parto": "Fecha Posible Parto",
        "prenez_confirmada": "Preñez Confirmada",
        "fecha_parto_real": "Fecha Parto Real",
        "cria_id": "Cría_ID",
        "peso_destete_cria": "Peso Destete Cría (kg)",
        "notas": "Notas",
        **_COMMON_META,
    },
    "observations": {
        "observacion_id": "Observacion_ID",
        "fecha": "Fecha",
        "animal_id": "Animal_ID",
        "notas": "Notas",
        **_COMMON_META,
    },
    "sales": {
        "venta_id": "Venta_ID",
        "animal_id": "Animal_ID",
        "fecha_venta": "Fecha Venta",
        "motivo_venta": "Motivo de Venta",
        "peso": "Peso (kg)",
        "precio_total": "Precio Total ($)",
        "precio_kg": "Precio por kg ($/kg)",
        "comprador": "Comprador",
        "notas": "Notas",
        **_COMMON_META,
    },
    "recorridos": {
        "recorrido_id": "Recorrido_ID",
        "fecha": "Fecha",
        "animal_id": "Animal_ID",
        "notas": "Notas",
        **_COMMON_META,
    },
}

# Reverse maps (sheet header → app key), built once at import time
_REVERSE_MAPS: dict[str, dict[str, str]] = {
    table: {v: k for k, v in mapping.items()}
    for table, mapping in COLUMN_MAPS.items()
}


def _to_app_keys(table_name: str, record: dict) -> dict:
    """Convert a sheet-header-keyed dict to app snake_case keys."""
    reverse = _REVERSE_MAPS.get(table_name, {})
    return {reverse.get(k, k): v for k, v in record.items()}


def _to_sheet_keys(table_name: str, record: dict) -> dict:
    """Convert an app-keyed dict to sheet-header keys."""
    mapping = COLUMN_MAPS.get(table_name, {})
    return {mapping.get(k, k): v for k, v in record.items()
            if k != "_sync_status"}


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
    Read all records from a sheet and return them with app-side keys.

    Args:
        table_name: Internal table name (e.g., 'animals', 'health')

    Returns:
        List of row dicts with snake_case app keys.
    """
    sheet_name = SHEET_NAMES.get(table_name)
    if not sheet_name:
        raise ValueError(f"Unknown table: {table_name}")

    spreadsheet = get_spreadsheet()
    worksheet = spreadsheet.worksheet(sheet_name)
    raw_records = worksheet.get_all_records()
    return [_to_app_keys(table_name, r) for r in raw_records]


def write_sheet(table_name: str, records: list[dict]) -> None:
    """
    Overwrite a sheet with the given records (app-keyed dicts).

    Preserves headers (row 1) and replaces all data rows.
    Translates app keys → sheet headers automatically.

    Args:
        table_name: Internal table name
        records: List of row dicts with app-side snake_case keys
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

    # Get headers from first row of the sheet
    headers = worksheet.row_values(1)
    if not headers:
        return

    # Convert each record to sheet-header keys, then build rows
    rows = []
    for record in records:
        sheet_record = _to_sheet_keys(table_name, record)
        row = [str(sheet_record.get(h, "")) for h in headers]
        rows.append(row)

    # Clear existing data and write new
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

    Both local_records (from the frontend) and the returned list use
    app-side snake_case keys.  Sheet header translation is handled
    internally by read_sheet / write_sheet.

    Args:
        table_name: Internal table name
        local_records: Records from the client's IndexedDB (snake_case keys)

    Returns:
        Merged list of records with snake_case keys, all marked synced.
    """
    pk_key = PK_APP_KEYS.get(table_name)
    if not pk_key:
        raise ValueError(f"Unknown table: {table_name}")

    # Read cloud records (already converted to app keys)
    try:
        cloud_records = read_sheet(table_name)
    except Exception as exc:
        logger.warning("Could not read sheet '%s': %s", table_name, exc)
        cloud_records = []

    # Index cloud records by PK
    cloud_index: dict[str, dict] = {}
    for record in cloud_records:
        pk = str(record.get(pk_key, ""))
        if pk:
            cloud_index[pk] = record

    # Merge with local records (last-write-wins on updated_at)
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

    # Write merged data back to cloud
    try:
        write_sheet(table_name, merged)
    except Exception as exc:
        logger.warning("Could not write sheet '%s': %s", table_name, exc)

    # Mark all records as synced for the frontend
    for record in merged:
        record["_sync_status"] = "synced"

    return merged
