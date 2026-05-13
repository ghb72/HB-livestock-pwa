"""Backward-compatible photo service aliases.

Photo storage now lives in services.supabase. This module remains only to keep
older imports working during the migration.
"""

from .supabase import delete_photo, upload_photo

__all__ = ["upload_photo", "delete_photo"]
