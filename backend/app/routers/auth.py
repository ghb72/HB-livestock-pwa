"""
Auth router — token validation endpoint for the PWA login flow.

Endpoint:
    POST /api/auth/login — validate a token, return { valid: bool }
"""

import hmac

from fastapi import APIRouter
from pydantic import BaseModel

from ..auth import _get_auth_token

router = APIRouter()


class LoginRequest(BaseModel):
    """Body sent by the PWA login form."""

    token: str


class LoginResponse(BaseModel):
    """Tells the PWA whether the token is valid."""

    valid: bool


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    """
    Validate the provided token against AUTH_TOKEN.

    The PWA stores the token in localStorage on success and sends it
    as a Bearer header on every subsequent request.
    """
    auth_token = _get_auth_token()
    if not auth_token:
        return LoginResponse(valid=False)

    return LoginResponse(
        valid=hmac.compare_digest(request.token, auth_token)
    )
