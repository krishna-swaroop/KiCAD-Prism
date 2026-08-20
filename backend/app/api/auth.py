"""
Authentication API endpoints.

Handles OIDC login and session management.

The browser never mints its own OIDC state, nonce, or PKCE verifier. `/login/start`
generates all three, keeps them in a short-lived HttpOnly transaction cookie, and
`/login` refuses any callback it cannot match against that cookie.
"""

import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from app.core.config import settings
from app.core.roles import Role
from app.core.security import AuthenticatedUser, get_current_user, guest_user, require_admin
from app.core.session import (
    OIDC_TRANSACTION_COOKIE_NAME,
    SESSION_COOKIE_NAME,
    clear_oidc_transaction_cookie,
    clear_session_cookie,
    create_oidc_transaction_token,
    create_session_token,
    decode_oidc_transaction_token,
    decode_session_token,
    set_oidc_transaction_cookie,
    set_session_cookie,
)
from app.services import (
    password_credential_service,
    rate_limit_service,
    session_store_service,
)
from app.services.auth_service import (
    PasswordAuthResult,
    ResolvedSessionUser,
    authenticate_oidc_auth_code,
    authenticate_password,
    build_oidc_authorization_url,
    oidc_enabled,
    password_auth_enabled,
)

router = APIRouter()


class LoginRequest(BaseModel):
    """Request body for OIDC auth code exchange."""
    code: str = Field(min_length=1)
    state: str = Field(min_length=1)
    redirectUri: str = Field(min_length=1)


class LoginStartResponse(BaseModel):
    """Where the browser should send the user to authenticate."""
    authorization_url: str


class PasswordLoginRequest(BaseModel):
    email: str = Field(min_length=1, max_length=320)
    password: str = Field(min_length=1, max_length=1024)
    remember_me: bool = False


class PasswordLoginResponse(BaseModel):
    email: str
    name: str
    picture: str = ""
    role: Role
    must_change_password: bool = False


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=1024)
    new_password: str = Field(min_length=1, max_length=1024)


class UserSession(BaseModel):
    """User session data returned after successful login."""
    email: str
    name: str
    picture: str = ""
    role: Role


class AuthConfig(BaseModel):
    """Authentication configuration exposed to frontend."""
    auth_enabled: bool
    dev_mode: bool
    oidc_enabled: bool = False
    oidc_provider_name: str = ""
    password_auth_enabled: bool = False
    workspace_name: str


class ActiveSession(BaseModel):
    id: str
    created_at: str
    last_seen_at: str
    expires_at: str
    user_agent: str = ""
    client_ip: str = ""


def _build_user_session(user: ResolvedSessionUser | AuthenticatedUser) -> UserSession:
    return UserSession(
        email=user.email,
        name=user.name,
        picture=user.picture,
        role=user.role,
    )


def _issue_session(
    user: ResolvedSessionUser,
    http_request: Request,
    response: Response,
    *,
    remember_me: bool = False,
) -> None:
    ttl_seconds = settings.SESSION_REMEMBER_ME_DAYS * 86400 if remember_me else None
    session_id, _ = session_store_service.create_session(
        email=user.email,
        name=user.name,
        picture=user.picture,
        user_id=user.user_id,
        user_agent=http_request.headers.get("user-agent", ""),
        client_ip=rate_limit_service.client_fingerprint(http_request),
        ttl_seconds=ttl_seconds,
    )
    set_session_cookie(
        response,
        create_session_token(session_id, ttl_seconds=ttl_seconds),
        max_age_seconds=ttl_seconds,
    )


def _revoke_account_sessions(email: str, *, reason: str, keep_session_id: str = "") -> int:
    from app.services import access_service

    revoked = 0
    user = access_service.get_user_by_email(email)
    if user:
        revoked += session_store_service.revoke_sessions_for_user_id(
            user["user_id"], reason=reason, keep_session_id=keep_session_id
        )
    revoked += session_store_service.revoke_sessions_for_email(
        email, reason=reason, keep_session_id=keep_session_id
    )
    return revoked


def _guest_user_session() -> UserSession:
    return _build_user_session(guest_user())


def _login_redirect_uri(request: Request) -> str:
    """Derive the callback URL from this deployment's own configuration.

    Accepting a client-supplied redirect_uri would let a crafted page point the
    authorization code somewhere else.
    """
    base = settings.PUBLIC_BASE_URL.strip().rstrip("/")
    if not base:
        forwarded_proto = request.headers.get("x-forwarded-proto", request.url.scheme).split(",")[0].strip()
        forwarded_host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
        base = f"{forwarded_proto}://{forwarded_host}".rstrip("/")
    return f"{base}/auth/callback"


def _enforce_login_rate_limit(request: Request, action: str) -> str:
    bucket = f"login:{action}:{rate_limit_service.client_fingerprint(request)}"
    rate_limit_service.enforce(
        bucket,
        limit=settings.AUTH_LOGIN_RATE_LIMIT,
        window_seconds=settings.AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    )
    return bucket


@router.get("/config", response_model=AuthConfig)
async def get_auth_config():
    """
    Get authentication configuration for the frontend.

    This allows the frontend to know whether to show the login page
    or go directly to the gallery.

    Endpoint URLs and the client id are deliberately not exposed here; the browser
    receives a complete authorization URL from /login/start instead. This also keeps
    the app's very first request free of any call to the identity provider.
    """
    return AuthConfig(
        auth_enabled=settings.AUTH_ENABLED,
        dev_mode=settings.DEV_MODE,
        oidc_enabled=oidc_enabled(),
        oidc_provider_name=settings.OIDC_PROVIDER_NAME.strip() or "SSO",
        password_auth_enabled=password_auth_enabled(),
        workspace_name=settings.WORKSPACE_NAME,
    )


@router.post("/login/start", response_model=LoginStartResponse)
async def start_login(request: Request, response: Response):
    """Begin an OIDC login and pin its state, nonce, and PKCE verifier to this browser."""
    if not settings.AUTH_ENABLED:
        raise HTTPException(status_code=400, detail="Authentication is disabled on this deployment")
    if not oidc_enabled():
        raise HTTPException(status_code=400, detail="OIDC login is not enabled on this deployment")

    _enforce_login_rate_limit(request, "start")

    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    code_verifier = secrets.token_urlsafe(64)
    redirect_uri = _login_redirect_uri(request)

    authorization_url = build_oidc_authorization_url(
        redirect_uri=redirect_uri,
        state=state,
        nonce=nonce,
        code_verifier=code_verifier,
    )
    set_oidc_transaction_cookie(
        response,
        create_oidc_transaction_token(
            state=state,
            nonce=nonce,
            code_verifier=code_verifier,
            redirect_uri=redirect_uri,
        ),
    )
    return LoginStartResponse(authorization_url=authorization_url)


@router.post("/login", response_model=UserSession)
async def login(request: LoginRequest, http_request: Request, response: Response):
    """
    Complete an OIDC login by exchanging the authorization code.

    Every parameter that matters is taken from the server-issued transaction cookie,
    not from the request body, so a replayed or injected code cannot authenticate.
    """
    if not settings.AUTH_ENABLED:
        return _guest_user_session()

    bucket = _enforce_login_rate_limit(http_request, "callback")

    transaction = decode_oidc_transaction_token(
        http_request.cookies.get(OIDC_TRANSACTION_COOKIE_NAME) or ""
    )
    clear_oidc_transaction_cookie(response)
    if not transaction:
        raise HTTPException(status_code=400, detail="Login session expired. Please sign in again.")
    if not secrets.compare_digest(transaction["state"], request.state):
        raise HTTPException(status_code=400, detail="Invalid login state. Please sign in again.")
    if transaction["redirect_uri"] != request.redirectUri:
        raise HTTPException(status_code=400, detail="Login redirect mismatch. Please sign in again.")

    session_user = authenticate_oidc_auth_code(
        code=request.code,
        redirect_uri=transaction["redirect_uri"],
        expected_nonce=transaction["nonce"],
        code_verifier=transaction["code_verifier"],
    )

    _issue_session(session_user, http_request, response)
    rate_limit_service.clear(bucket)

    return _build_user_session(session_user)


@router.post("/login/password", response_model=PasswordLoginResponse)
async def login_with_password(
    request: PasswordLoginRequest, http_request: Request, response: Response
):
    """Complete a local email/password login and issue a session."""
    if not settings.AUTH_ENABLED:
        return PasswordLoginResponse(**_guest_user_session().model_dump())
    if not password_auth_enabled():
        raise HTTPException(status_code=400, detail="Password login is not enabled on this deployment")

    bucket = _enforce_login_rate_limit(http_request, "password")
    result: PasswordAuthResult = authenticate_password(request.email, request.password)
    _issue_session(result.user, http_request, response, remember_me=request.remember_me)
    rate_limit_service.clear(bucket)
    return PasswordLoginResponse(
        email=result.user.email,
        name=result.user.name,
        picture=result.user.picture,
        role=result.user.role,
        must_change_password=result.must_change_password,
    )


@router.post("/password/change")
async def change_own_password(
    request: ChangePasswordRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Change the signed-in user's own local password."""
    if not password_auth_enabled():
        raise HTTPException(status_code=400, detail="Password login is not enabled on this deployment")
    if not password_credential_service.has_credential(user.email):
        raise HTTPException(status_code=400, detail="This account does not use a local password")

    if not password_credential_service.verify_password(user.email, request.current_password).ok:
        raise HTTPException(status_code=403, detail="Current password is incorrect")

    try:
        password_credential_service.set_password(
            user.email, request.new_password, updated_by=user.email, must_change=False
        )
    except password_credential_service.PasswordPolicyError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    _revoke_account_sessions(
        user.email, reason="password_changed", keep_session_id=user.session_id
    )
    return {"success": True}


@router.get("/me", response_model=UserSession)
async def get_current_session_user(user: AuthenticatedUser = Depends(get_current_user)):
    return _build_user_session(user)


@router.get("/sessions", response_model=list[ActiveSession])
async def list_my_sessions(user: AuthenticatedUser = Depends(get_current_user)):
    """Every live browser session for the signed-in account."""
    return [ActiveSession(**item) for item in session_store_service.list_sessions(user.email)]


@router.post("/sessions/revoke-others")
async def revoke_other_sessions(user: AuthenticatedUser = Depends(get_current_user)):
    """Sign out everywhere except the browser making this request."""
    revoked = _revoke_account_sessions(
        user.email, reason="user_revoked_others", keep_session_id=user.session_id
    )
    return {"revoked": revoked}


@router.post("/sessions/revoke-user/{email}")
async def revoke_user_sessions(email: str, user: AuthenticatedUser = Depends(require_admin)):
    """Terminate every session belonging to an account. Used when access is withdrawn."""
    revoked = _revoke_account_sessions(email, reason=f"admin:{user.email}")
    return {"email": email.strip().lower(), "revoked": revoked}


@router.post("/logout")
async def logout(http_request: Request, response: Response):
    payload = decode_session_token(http_request.cookies.get(SESSION_COOKIE_NAME) or "")
    if payload:
        session_store_service.revoke_session(payload["sid"], reason="logout")
    clear_session_cookie(response)
    return {"success": True}
