import asyncio

from fastapi import Depends, HTTPException
from starlette.requests import HTTPConnection
from pydantic import BaseModel

from app.core import policy
from app.core.config import settings
from app.core.roles import Role, normalize_role
from app.core.session import SESSION_COOKIE_NAME, decode_session_token
from app.services import (
    access_service,
    agent_auth_service,
    auth_service,
    mcp_auth_service,
    personal_tokens,
    provider_auth_service,
    service_client_service,
    session_store_service,
)


#: Where the resolved caller is left in the request's ASGI state. The token-activity
#: audit (``app.core.token_audit``) reads it after the response, so authentication is
#: resolved once, by the dependency that already had to do it.
AUTHENTICATED_USER_STATE = "authenticated_user"


class AuthenticatedUser(BaseModel):
    email: str
    name: str
    picture: str = ""
    role: Role
    auth_type: str = "session"
    client_id: str = ""
    token_id: str = ""
    scopes: list[str] = []
    session_id: str = ""
    user_id: str = ""
    password_change_required: bool = False


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


PASSWORD_CHANGE_REQUIRED = "Password change required"


async def get_current_user(request: HTTPConnection) -> AuthenticatedUser:
    """The caller, refused while its account must still change a temporary password.

    Only the routes that let the caller finish that change (``/auth/me`` and
    ``/auth/password/change``) resolve it through
    :func:`get_current_user_allowing_password_change` instead.
    """
    user = await get_current_user_allowing_password_change(request)
    if user.password_change_required:
        raise HTTPException(status_code=403, detail=PASSWORD_CHANGE_REQUIRED)
    return user


async def get_current_user_allowing_password_change(request: HTTPConnection) -> AuthenticatedUser:
    """Resolve the caller from the session cookie or a bearer token.

    Every store this consults is synchronous (session rows, role rows, provider
    and service tokens, external JWKS fetches). They run on the worker thread
    pool so a slow database or identity provider stalls this request, not the
    event loop that every other request shares.
    """
    if not settings.AUTH_ENABLED:
        return _remember(request, guest_user())

    token = request.cookies.get(SESSION_COOKIE_NAME)
    payload = decode_session_token(token or "")
    if payload:
        return _remember(request, await asyncio.to_thread(_resolve_session_user, payload["sid"]))

    authorization = request.headers.get("authorization") or ""
    scheme, _, bearer_token = authorization.partition(" ")
    if scheme.casefold() == "bearer" and bearer_token.strip():
        return _remember(request, await asyncio.to_thread(_resolve_bearer_user, bearer_token.strip()))

    raise HTTPException(status_code=401, detail="Authentication required")


def _remember(request: HTTPConnection, user: AuthenticatedUser) -> AuthenticatedUser:
    """Leave the resolved caller where the activity audit can read it afterwards."""

    scope = getattr(request, "scope", None)
    if isinstance(scope, dict):
        scope.setdefault("state", {})[AUTHENTICATED_USER_STATE] = user
    return user


def _resolve_session_user(session_id: str) -> AuthenticatedUser:
    # The cookie only proves authenticity. The session store decides whether this
    # session is still live, so logout and administrative revocation take effect
    # immediately instead of at token expiry.
    session = session_store_service.load_session(session_id)
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
        user_id=session.user_id,
        password_change_required=session.password_change_required,
    )


def _resolve_pat_user(row: dict) -> AuthenticatedUser:
    """Build the caller from a personal access token's row.

    The token carries scopes, not identity: the owner is re-read on every request
    so a role change (or a removed account) takes effect immediately.
    """
    current = access_service.get_user_by_email(str(row["user_email"]))
    role = _resolve_allowed_user_role(str(row["user_email"]))
    if current is None or role is None:
        raise HTTPException(status_code=401, detail="Invalid bearer token")
    personal_tokens.touch(row)
    return AuthenticatedUser(
        email=current["email"],
        name=current["name"],
        picture=current["picture"],
        role=role,
        auth_type="pat",
        client_id=f"pat:{row['id']}",
        token_id=str(row["id"]),
        scopes=[str(scope) for scope in (row.get("scopes") or [])],
        user_id=current["user_id"],
    )


def _resolve_bearer_user(token: str) -> AuthenticatedUser:
    # Personal access tokens are recognisably prefixed rather than signed, so they
    # are checked before the ``v1.`` envelope and never fall through to it.
    if token.startswith(personal_tokens.TOKEN_PREFIX):
        row = personal_tokens.validate(token)
        if row is None:
            raise HTTPException(status_code=401, detail="Invalid bearer token")
        return _resolve_pat_user(row)

    provider_error: HTTPException | None = None
    if token.startswith("v1."):
        try:
            payload = agent_auth_service.validate_agent_token(token)
            # Best-effort, throttled: keep the registry's "last used" column honest
            # without a DB write on every request. Never fails the request.
            agent_auth_service.touch_agent_token(payload)
            return AuthenticatedUser(
                email=str(payload["email"]),
                name=str(payload["name"]),
                picture=str(payload.get("picture") or ""),
                role=normalize_role(str(payload["role"])) or "viewer",
                auth_type="agent",
                client_id=str(payload.get("client_id") or ""),
                token_id=str(payload.get("jti") or ""),
                scopes=str(payload.get("scope") or "").split(),
            )
        except HTTPException as exc:
            if exc.status_code >= 500:
                raise
            # Not an agent token (or an invalid one); fall through to the other
            # bearer kinds, which use the same v1. envelope.

        try:
            payload = mcp_auth_service.validate_access_token(token)
            # MCP tokens carry scopes, not identity: re-read the owner and their
            # role now, so a role change or removed account takes effect at once.
            current = access_service.get_user_by_email(str(payload["email"]))
            role = _resolve_allowed_user_role(str(payload["email"]))
            if current is None or role is None:
                raise HTTPException(status_code=401, detail="Invalid bearer token")
            return AuthenticatedUser(
                email=str(current["email"]),
                name=str(current["name"]),
                picture=str(current.get("picture") or ""),
                role=role,
                auth_type=policy.MCP_AUTH_TYPE,
                client_id=str(payload.get("client_id") or ""),
                token_id=str(payload.get("jti") or ""),
                scopes=str(payload.get("scope") or "").split(),
                user_id=str(current.get("user_id") or ""),
            )
        except HTTPException as exc:
            if exc.status_code >= 500:
                raise
            # Not an MCP token (or one no longer valid); try the provider next.

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
                token_id=str(payload.get("jti") or ""),
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


def refuse_provider_token(user: AuthenticatedUser) -> None:
    """For routes that resolve the caller themselves: KiCad remote-provider
    tokens are for the remote-symbol routes only."""
    if user.auth_type == policy.PROVIDER_AUTH_TYPE:
        raise HTTPException(status_code=403, detail=policy.RULES["read"].provider_refusal)


# Each dependency below is the policy rule of the same name; see app.core.policy.


async def require_viewer(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
    return policy.authorize(user, "read")


async def require_viewer_allowing_password_change(
    user: AuthenticatedUser = Depends(get_current_user_allowing_password_change),
) -> AuthenticatedUser:
    return policy.authorize(user, "read")


async def require_designer(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
    return policy.authorize(user, "design")


async def require_comment_writer(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
    """Permit project participants to comment, but refuse read-only tokens."""
    return policy.authorize(user, "comment")


async def require_admin(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
    return policy.authorize(user, "admin")


def _require_ops_enabled() -> None:
    # While ops is off its routes don't exist (ADR scripting-and-mcp D20).
    if not settings.PRISM_MCP_OPS_ENABLED:
        raise HTTPException(status_code=404, detail="Not Found")


async def require_ops_reader(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
    _require_ops_enabled()
    return policy.authorize(user, "ops_read")


async def require_ops_actor(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
    _require_ops_enabled()
    return policy.authorize(user, "ops_act")


async def require_project_release_actor(
    user: AuthenticatedUser = Depends(get_current_user),
) -> AuthenticatedUser:
    """Designer, QA, or Admin: approve or publish a project release.

    Starting a build still uses ``require_designer``.
    """
    return policy.authorize(user, "release")


async def require_catalog_reader(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
    return policy.authorize(user, "catalog_read")


async def require_catalog_browser(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
    """Read-only browsing of the component database; viewers included (D-P2-24)."""
    return policy.authorize(user, "catalog_browse")


async def require_catalog_writer(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
    return policy.authorize(user, "catalog_write")


async def require_catalog_admin(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
    """Metadata field definitions and artifact maintenance."""
    return policy.authorize(user, "catalog_admin")


async def require_remote_symbol_reader(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
    return policy.authorize(user, "remote_symbols")
