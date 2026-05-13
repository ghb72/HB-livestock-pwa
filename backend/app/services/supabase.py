"""
Supabase HTTP helpers for PostgREST tables and Storage objects.

The backend talks to Supabase directly via httpx so it can persist synced
records and image files without an extra Python SDK dependency.
"""

from __future__ import annotations

import base64
import os
from functools import lru_cache
from urllib.parse import quote, unquote, urlparse

import httpx

DEFAULT_STORAGE_BUCKET = "livestock"
DEFAULT_STORAGE_PREFIX = "cattle-photos"
REQUEST_TIMEOUT_SECONDS = 30.0

MIME_EXTENSIONS = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}


@lru_cache(maxsize=1)
def get_settings() -> dict[str, str]:
    """Return validated Supabase settings from the environment."""
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    schema = os.getenv("SUPABASE_DB_SCHEMA", "public").strip() or "public"
    bucket = os.getenv("SUPABASE_STORAGE_BUCKET", "").strip() or DEFAULT_STORAGE_BUCKET
    prefix = os.getenv("SUPABASE_STORAGE_PREFIX", DEFAULT_STORAGE_PREFIX).strip(" /")

    if not url:
        raise ValueError("SUPABASE_URL environment variable not set")
    if not service_role_key:
        raise ValueError("SUPABASE_SERVICE_ROLE_KEY environment variable not set")

    return {
        "url": url,
        "service_role_key": service_role_key,
        "schema": schema,
        "bucket": bucket,
        "prefix": prefix,
    }


def _headers() -> dict[str, str]:
    settings = get_settings()
    schema = settings["schema"]
    return {
        "apikey": settings["service_role_key"],
        "Authorization": f"Bearer {settings['service_role_key']}",
        "Accept-Profile": schema,
        "Content-Profile": schema,
    }


def _request(
    method: str,
    path: str,
    *,
    params: dict[str, str] | None = None,
    json: object | None = None,
    content: bytes | None = None,
    headers: dict[str, str] | None = None,
) -> httpx.Response:
    """Run an authenticated request against Supabase and raise a readable error."""
    url = f"{get_settings()['url']}{path}"
    request_headers = _headers()
    if headers:
        request_headers.update(headers)

    response = httpx.request(
        method,
        url,
        params=params,
        json=json,
        content=content,
        headers=request_headers,
        timeout=REQUEST_TIMEOUT_SECONDS,
    )

    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        detail = response.text.strip() or exc.response.reason_phrase
        raise RuntimeError(
            f"Supabase request failed for {method} {path}: {detail}"
        ) from exc

    return response


def select_rows(table_name: str) -> list[dict]:
    """Read all rows from a Supabase table."""
    response = _request("GET", f"/rest/v1/{table_name}", params={"select": "*"})
    return response.json()


def upsert_rows(table_name: str, rows: list[dict], conflict_key: str) -> list[dict]:
    """Upsert rows into a Supabase table using the provided conflict column."""
    if not rows:
        return []

    response = _request(
        "POST",
        f"/rest/v1/{table_name}",
        params={"on_conflict": conflict_key},
        json=rows,
        headers={"Prefer": "resolution=merge-duplicates,return=representation"},
    )
    return response.json()


def delete_rows(table_name: str, pk_key: str, pk_values: list[str]) -> None:
    """Delete rows from a Supabase table by primary-key values."""
    if not pk_values:
        return

    encoded_values = ",".join(_quote_filter_value(value) for value in pk_values)
    _request(
        "DELETE",
        f"/rest/v1/{table_name}",
        params={pk_key: f"in.({encoded_values})"},
        headers={"Prefer": "return=minimal"},
    )


def build_storage_path(photo_id: str, mime_type: str) -> str:
    """Build the canonical storage path for a photo."""
    settings = get_settings()
    extension = MIME_EXTENSIONS.get(mime_type.lower(), "jpg")
    filename = f"{photo_id}.{extension}"
    prefix = settings["prefix"]
    if not prefix:
        return filename
    return f"{prefix}/{filename}"


def upload_storage_object(path: str, content: bytes, content_type: str) -> None:
    """Upload a binary object into the configured Supabase storage bucket."""
    bucket = get_settings()["bucket"]
    safe_path = quote(path, safe="/")
    _request(
        "POST",
        f"/storage/v1/object/{bucket}/{safe_path}",
        content=content,
        headers={
            "Content-Type": content_type,
            "x-upsert": "true",
        },
    )


def delete_storage_object(path: str) -> None:
    """Delete a storage object from the configured Supabase bucket."""
    bucket = get_settings()["bucket"]
    safe_path = quote(path, safe="/")
    _request(
        "DELETE",
        f"/storage/v1/object/{bucket}/{safe_path}",
        headers={"Prefer": "return=minimal"},
    )


def public_storage_url(path: str) -> str:
    """Return the public URL for a storage object."""
    settings = get_settings()
    bucket = settings["bucket"]
    safe_path = quote(path, safe="/")
    return f"{settings['url']}/storage/v1/object/public/{bucket}/{safe_path}"


def extract_storage_path(file_url: str) -> str | None:
    """Extract the bucket-relative object path from a Supabase storage URL."""
    if not file_url:
        return None

    bucket = get_settings()["bucket"]
    parsed = urlparse(file_url)
    public_prefix = f"/storage/v1/object/public/{bucket}/"
    object_prefix = f"/storage/v1/object/{bucket}/"

    if parsed.path.startswith(public_prefix):
        return unquote(parsed.path[len(public_prefix):])
    if parsed.path.startswith(object_prefix):
        return unquote(parsed.path[len(object_prefix):])
    return None


def upload_photo(photo_id: str, base64_data: str) -> str:
    """Upload a base64-encoded photo to Supabase Storage and return its public URL."""
    content_type, encoded_data = _parse_data_url(base64_data)
    image_bytes = base64.b64decode(encoded_data)
    storage_path = build_storage_path(photo_id, content_type)
    upload_storage_object(storage_path, image_bytes, content_type)
    return public_storage_url(storage_path)


def delete_photo(photo_id: str, file_url: str) -> bool:
    """Delete a photo from Supabase Storage by its public URL.

    The photo_id argument is preserved for compatibility with existing callers.
    """
    del photo_id
    try:
        storage_path = extract_storage_path(file_url)
        if not storage_path:
            return False
        delete_storage_object(storage_path)
        return True
    except Exception:
        return False


def _parse_data_url(base64_data: str) -> tuple[str, str]:
    """Split a data URL into content type and base64 payload."""
    default_content_type = "image/jpeg"
    if "," not in base64_data:
        return default_content_type, base64_data

    header, encoded_data = base64_data.split(",", 1)
    if ";base64" not in header:
        return default_content_type, encoded_data

    content_type = header.split(":", 1)[1].split(";", 1)[0].strip() or default_content_type
    return content_type, encoded_data


def _quote_filter_value(value: str) -> str:
    escaped = str(value).replace('"', r'\"')
    return f'"{escaped}"'