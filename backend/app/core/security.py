from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel

from app.core.config import settings
from app.core.roles import CATALOG_READ_ROLES, CATALOG_WRITE_ROLES, Role, normalize_role, role_meets_minimum
from app.core.session import SESSION_COOKIE_NAME, decode_session_token
from app.services import (
    access_service,
    auth_service,
    provider_auth_service,
    service_client_service,
    session_store_service,
)


class AuthenticatedUser(BaseModel):
    email: str
    name: str
    picture: str = ""
    role: Role
    auth_type: str = "session"
    client_id: str = ""
    scopes: list[str] = []
    session_id: str = ""


def guest_user() -> AuthenticatedUser:
    """The implicit identity used only when AUTH_ENABLED is explicitly false."""
    return AuthenticatedUser(
        email="guest@local",
        name="Guest User",
        picture="",
        role=normalize_role(settings.DEV_GUEST_ROLE) or "viewer",
    )


def _resolve_allowed_user_role(email: str) -> Role | None:
    role = access_service.resolve_user_role(email)
    if role is None:
        return None
    return normalize_role(role)


async def get_current_user(request: Request) -> AuthenticatedUser:
    if not settings.AUTH_ENABLED:
        return guest_user()

    token = request.cookies.get(SESSION_COOKIE_NAME)
    payload = decode_session_token(token or "")
    if payload:
        # The cookie only proves authenticity. The session store decides whether this
        # session is still live, so logout and administrative revocation take effect
        # immediately instead of at token expiry.
        session = session_store_service.load_session(payload["sid"])
        if not session:
            raise HTTPException(status_code=401, detail="Session expired or revoked")

        role = _resolve_allowed_user_role(session.email)
        if not role:
            raise HTTPException(status_code=403, detail="Access denied. No role assignment found for your account.")

        return AuthenticatedUser(
            email=session.email,
            name=session.name,
            picture=session.picture,
            role=role,
            auth_type="session",
            session_id=session.session_id,
        )

    authorization = request.headers.get("authorization") or ""
    scheme, _, bearer_token = authorization.partition(" ")
    if scheme.casefold() == "bearer" and bearer_token.strip():
        return _resolve_bearer_user(bearer_token.strip())

    raise HTTPException(status_code=401, detail="Authentication required")


def _resolve_bearer_user(token: str) -> AuthenticatedUser:
    provider_error: HTTPException | None = None
    if token.startswith("v1."):
        try:
            payload = provider_auth_service.validate_access_token(token)
            scopes = str(payload.get("scope") or "").split()
            return AuthenticatedUser(
                email=str(payload["email"]),
                name=str(payload["name"]),
                picture=str(payload.get("picture") or ""),
                role=normalize_role(str(payload["role"])) or "viewer",
                auth_type="kicad_provider",
                client_id=str(payload.get("client_id") or ""),
                scopes=scopes,
            )
        except HTTPException as exc:
            if exc.status_code >= 500:
                raise
            provider_error = exc

        try:
            payload = service_client_service.validate_service_access_token(token)
            return AuthenticatedUser(**payload)
        except HTTPException as exc:
            if exc.status_code >= 500:
                raise
    else:
        external_payload = auth_service.validate_external_api_jwt(token)
        if external_payload:
            return AuthenticatedUser(**external_payload)

    if provider_error:
        raise provider_error
    raise HTTPException(status_code=401, detail="Invalid bearer token")


def _has_scope(user: AuthenticatedUser, *required_scopes: str) -> bool:
    scopes = set(user.scopes)
    return "*" in scopes or any(scope in scopes for scope in required_scopes)


async def require_viewer(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
    return user


async def require_designer(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
    if user.auth_type == "kicad_provider":
        raise HTTPException(status_code=403, detail="KiCad remote-provider tokens cannot modify Prism resources")
    if not role_meets_minimum(user.role, "designer"):
        raise HTTPException(status_code=403, detail="Designer role required")
    return user


async def require_admin(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
    if user.auth_type == "kicad_provider":
        raise HTTPException(status_code=403, detail="KiCad remote-provider tokens cannot access admin APIs")
    if not role_meets_minimum(user.role, "admin"):
        raise HTTPException(status_code=403, detail="Admin role required")
    return user


def _require_bearer_scope(user: AuthenticatedUser, *required_scopes: str) -> None:
    if user.auth_type == "session":
        return
    if _has_scope(user, *required_scopes):
        return
    raise HTTPException(status_code=403, detail=f"{' or '.join(required_scopes)} scope required")


async def require_catalog_reader(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
    _require_bearer_scope(user, "api:read")
    if user.role not in CATALOG_READ_ROLES:
        raise HTTPException(status_code=403, detail="Catalog read access required")
    return user


async def require_catalog_writer(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
    if user.auth_type == "kicad_provider":
        raise HTTPException(status_code=403, detail="KiCad remote-provider tokens cannot modify catalog resources")
    _require_bearer_scope(user, "api:write")
    if user.role not in CATALOG_WRITE_ROLES:
        raise HTTPException(status_code=403, detail="Catalog write access required")
    return user


async def require_remote_symbol_reader(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
    if user.auth_type == "session":
        return user
    if _has_scope(user, "remote_symbols.read", "api:read"):
        return user
    raise HTTPException(status_code=403, detail="remote_symbols.read scope required")
