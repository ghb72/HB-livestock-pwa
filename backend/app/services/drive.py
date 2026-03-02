"""
Google Drive service — upload and manage animal photos.

Stores photos in a dedicated Google Drive folder using the same
service account credentials as the Google Sheets service.

The folder is created automatically the first time a photo is uploaded.
Photos are stored as JPEG files named by their photo_id.
"""

import base64
import io
import os
from functools import lru_cache

from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
]

FOLDER_NAME = "livestock-photos"


@lru_cache(maxsize=1)
def _get_drive_service():
    """Get authenticated Google Drive API service (cached singleton)."""
    creds_file = os.getenv(
        "GOOGLE_SHEETS_CREDENTIALS_FILE", "credentials.json"
    )
    creds = Credentials.from_service_account_file(creds_file, scopes=SCOPES)
    return build("drive", "v3", credentials=creds)


@lru_cache(maxsize=1)
def _get_or_create_folder() -> str:
    """
    Get or create the photos folder in Google Drive.

    Returns:
        The folder ID.
    """
    service = _get_drive_service()

    # Search for existing folder
    query = (
        f"name = '{FOLDER_NAME}' "
        "and mimeType = 'application/vnd.google-apps.folder' "
        "and trashed = false"
    )
    results = (
        service.files()
        .list(q=query, spaces="drive", fields="files(id)")
        .execute()
    )
    files = results.get("files", [])

    if files:
        return files[0]["id"]

    # Create new folder
    file_metadata = {
        "name": FOLDER_NAME,
        "mimeType": "application/vnd.google-apps.folder",
    }
    folder = (
        service.files()
        .create(body=file_metadata, fields="id")
        .execute()
    )
    return folder["id"]


def upload_photo(photo_id: str, base64_data: str) -> str:
    """
    Upload a base64-encoded JPEG photo to Google Drive.

    Args:
        photo_id: Unique photo identifier (used as filename).
        base64_data: Base64-encoded image data (with or without
                     data URL prefix).

    Returns:
        Public web-viewable URL for the uploaded file.
    """
    # Strip data URL prefix if present
    if "," in base64_data:
        base64_data = base64_data.split(",", 1)[1]

    image_bytes = base64.b64decode(base64_data)

    service = _get_drive_service()
    folder_id = _get_or_create_folder()

    file_metadata = {
        "name": f"{photo_id}.jpg",
        "parents": [folder_id],
    }

    media = MediaIoBaseUpload(
        io.BytesIO(image_bytes),
        mimetype="image/jpeg",
        resumable=True,
    )

    uploaded = (
        service.files()
        .create(body=file_metadata, media_body=media, fields="id")
        .execute()
    )

    file_id = uploaded["id"]

    # Make the file publicly readable
    service.permissions().create(
        fileId=file_id,
        body={"role": "reader", "type": "anyone"},
    ).execute()

    return f"https://drive.google.com/uc?id={file_id}"


def delete_photo(drive_url: str) -> bool:
    """
    Delete a photo from Google Drive by its URL.

    Args:
        drive_url: The Google Drive URL returned by upload_photo.

    Returns:
        True if deleted successfully, False otherwise.
    """
    try:
        file_id = drive_url.split("id=")[-1]
        service = _get_drive_service()
        service.files().delete(fileId=file_id).execute()
        return True
    except Exception:
        return False
