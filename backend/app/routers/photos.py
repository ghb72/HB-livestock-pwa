"""
Photo upload and management endpoints.

Handles photo sync between the PWA (IndexedDB base64 blobs)
and Supabase Storage (permanent cloud storage).
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import verify_token
from ..services.supabase import delete_photo, upload_photo

router = APIRouter()


class PhotoUploadRequest(BaseModel):
    """Request body for single photo upload."""

    photo_id: str
    animal_id: str
    data_url: str  # base64 data URL (e.g., "data:image/jpeg;base64,...")


class PhotoUploadResponse(BaseModel):
    """Response after successful upload."""

    photo_id: str
    animal_id: str
    drive_url: str


class BatchPhotoUploadRequest(BaseModel):
    """Request body for batch photo upload."""

    photos: list[PhotoUploadRequest]


class BatchPhotoUploadResponse(BaseModel):
    """Response for batch upload."""

    uploaded: list[PhotoUploadResponse]
    errors: list[dict]


@router.post("/upload", response_model=PhotoUploadResponse)
async def upload_single_photo(
    request: PhotoUploadRequest,
    _: str = Depends(verify_token),
):
    """
    Upload a single photo to Supabase Storage.

    Receives base64 image data and stores it in the
    configured storage bucket.
    """
    try:
        drive_url = upload_photo(request.photo_id, request.data_url)
        return PhotoUploadResponse(
            photo_id=request.photo_id,
            animal_id=request.animal_id,
            drive_url=drive_url,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload photo: {str(e)}",
        )


@router.post("/upload/batch", response_model=BatchPhotoUploadResponse)
async def upload_batch_photos(
    request: BatchPhotoUploadRequest,
    _: str = Depends(verify_token),
):
    """
    Upload multiple photos to Supabase Storage in a single request.

    Used during sync to push all pending photos at once.
    Returns both successful uploads and any errors.
    """
    uploaded: list[PhotoUploadResponse] = []
    errors: list[dict] = []

    for photo in request.photos:
        try:
            drive_url = upload_photo(photo.photo_id, photo.data_url)
            uploaded.append(
                PhotoUploadResponse(
                    photo_id=photo.photo_id,
                    animal_id=photo.animal_id,
                    drive_url=drive_url,
                )
            )
        except Exception as e:
            errors.append(
                {
                    "photo_id": photo.photo_id,
                    "error": str(e),
                }
            )

    return BatchPhotoUploadResponse(uploaded=uploaded, errors=errors)


@router.delete("/{photo_id}")
async def remove_photo(
    photo_id: str,
    drive_url: str,
    _: str = Depends(verify_token),
):
    """
    Delete a photo from Supabase Storage.

    Args:
        photo_id: The photo identifier.
        drive_url: The public storage URL to delete.
    """
    success = delete_photo(photo_id, drive_url)
    if not success:
        raise HTTPException(
            status_code=500,
            detail="Failed to delete photo from storage",
        )
    return {"status": "deleted", "photo_id": photo_id}
