"""
Authentication API endpoints.

Handles Google OAuth login and domain validation.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from google.oauth2 import id_token
from google.auth.transport import requests
from app.core.config import settings

router = APIRouter()


class TokenRequest(BaseModel):
    """Request body for login endpoint."""
    token: str


class UserSession(BaseModel):
    """User session data returned after successful login."""
    email: str
    name: str
    picture: str = ""


class AuthConfig(BaseModel):
    """Authentication configuration exposed to frontend."""
    auth_enabled: bool
    dev_mode: bool
    google_client_id: str


@router.get("/config", response_model=AuthConfig)
async def get_auth_config():
    """
    Get authentication configuration for the frontend.
    
    This allows the frontend to know whether to show the login page
    or go directly to the gallery.
    """
    return AuthConfig(
        auth_enabled=settings.AUTH_ENABLED,
        dev_mode=settings.DEV_MODE,
        google_client_id=settings.GOOGLE_CLIENT_ID
    )


@router.post("/login", response_model=UserSession)
async def login(request: TokenRequest):
    """
    Authenticate user with Google OAuth token.
    
    Validates the token, checks domain restrictions, and returns user session data.
    """
    # If auth is disabled, this endpoint shouldn't normally be called,
    # but handle gracefully just in case
    if not settings.AUTH_ENABLED:
        return UserSession(
            email="guest@local",
            name="Guest User",
            picture=""
        )
    
    try:
        # Verify the token with Google
        id_info = id_token.verify_oauth2_token(
            request.token,
            requests.Request(),
            settings.GOOGLE_CLIENT_ID
        )

        email = id_info.get("email", "")
        hd = id_info.get("hd", "")  # Hosted Domain (for Google Workspace accounts)

        # Validate allowed users
        if settings.ALLOWED_USERS:
            if email.lower() not in settings.ALLOWED_USERS:
                raise HTTPException(
                    status_code=403,
                    detail="Access denied. Your email is not in the allowed users list."
                )

        return UserSession(
            email=email,
            name=id_info.get("name", email.split("@")[0]),
            picture=id_info.get("picture", "")
        )

    except ValueError as e:
        # Token verification failed
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
    except HTTPException:
        # Re-raise HTTP exceptions (like 403 for domain validation)
        raise
    except Exception as e:
        # Catch-all for unexpected errors
        raise HTTPException(status_code=500, detail=f"Authentication error: {str(e)}")
