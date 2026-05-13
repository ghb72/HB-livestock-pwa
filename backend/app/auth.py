"""
Bearer token authentication for the Livestock Register API.

Uses a simple shared-secret token stored in the AUTH_TOKEN environment
variable.  The PWA sends this token as ``Authorization: Bearer <token>``
on every request after the user logs in.
"""

import hmac
import os

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

_security = HTTPBearer(auto_error=False)


def _get_auth_token() -> str:
    """Return the configured auth token from the environment."""
    return os.getenv("AUTH_TOKEN", "")


def verify_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(_security),
) -> str:
    """
    FastAPI dependency that validates the Bearer token.

    Raises:
        HTTPException 401: If the token is missing or invalid.
        HTTPException 503: If AUTH_TOKEN is not configured.
    """
    auth_token = _get_auth_token()
    if not auth_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication not configured on the server",
        )

    if not credentials or not hmac.compare_digest(
        credentials.credentials, auth_token
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return credentials.credentials
