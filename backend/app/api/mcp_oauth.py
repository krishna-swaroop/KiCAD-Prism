"""OAuth authorization server and metadata for MCP clients (ADR §3.6).

An MCP client such as Claude Desktop or Cursor discovers this server from
``/.well-known/oauth-protected-resource``, reads the authorization-server
metadata, sends the user to the consent page, and exchanges the resulting
authorization code (with PKCE) for a bearer token.

Kept apart from ``api/provider_oauth.py``: that flow is bound to one fixed
client and one scope. Every route here is hidden from OpenAPI; the MCP endpoint
itself is a later work package.
"""

from __future__ import annotations

import asyncio
from html import escape
from typing import Any
from urllib.parse import quote, urlencode, urlparse, urlsplit

from fastapi import APIRouter, Depends, Form, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response

from app.core.config import settings
from app.core.security import get_current_user, refuse_provider_token
from app.services import mcp_auth_service, mcp_clients


def _require_mcp_enabled() -> None:
    """The MCP surface answers 404 while it is switched off (ADR §3.11)."""

    if not settings.PRISM_MCP_ENABLED:
        raise HTTPException(status_code=404, detail="Not Found")


router = APIRouter(dependencies=[Depends(_require_mcp_enabled)])

ISSUER_PATH = "/oauth/mcp"


def _base_url(request: Request) -> str:
    """``PUBLIC_BASE_URL`` when configured, else the request's own origin."""
    configured = settings.PUBLIC_BASE_URL.strip().rstrip("/")
    if configured:
        return configured
    return str(request.base_url).rstrip("/")


def _issuer(base: str) -> str:
    return f"{base}{ISSUER_PATH}"


def _oauth_error(error: str, description: str, *, status_code: int = 400) -> JSONResponse:
    return JSONResponse(
        {"error": error, "error_description": description},
        status_code=status_code,
    )


def _protected_resource(base: str) -> dict[str, Any]:
    return {
        "resource": mcp_auth_service.resource_for(base),
        "authorization_servers": [_issuer(base)],
        "scopes_supported": list(mcp_auth_service.scopes_supported()),
        "bearer_methods_supported": ["header"],
    }


def _authorization_server(base: str) -> dict[str, Any]:
    issuer = _issuer(base)
    return {
        "issuer": issuer,
        "authorization_endpoint": f"{issuer}/authorize",
        "token_endpoint": f"{issuer}/token",
        "revocation_endpoint": f"{issuer}/revoke",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["none"],
        "scopes_supported": list(mcp_auth_service.scopes_supported()),
        "client_id_metadata_document_supported": True,
        "authorization_response_iss_parameter_supported": True,
    }


@router.get("/.well-known/oauth-protected-resource", include_in_schema=False)
async def protected_resource_metadata(request: Request) -> dict[str, Any]:
    base = _base_url(request)
    return _protected_resource(base)


@router.get("/.well-known/oauth-protected-resource/mcp", include_in_schema=False)
async def protected_resource_metadata_mcp(request: Request) -> dict[str, Any]:
    base = _base_url(request)
    return _protected_resource(base)


@router.get(
    "/.well-known/oauth-authorization-server/oauth/mcp",
    include_in_schema=False,
)
async def authorization_server_metadata(request: Request) -> dict[str, Any]:
    return _authorization_server(_base_url(request))


@router.get(
    "/oauth/mcp/.well-known/oauth-authorization-server",
    include_in_schema=False,
)
async def authorization_server_metadata_suffix(request: Request) -> dict[str, Any]:
    return _authorization_server(_base_url(request))


async def _validate_authorize_request(
    *,
    base: str,
    response_type: str,
    client_id: str,
    redirect_uri: str,
    state: str,
    scope: str,
    code_challenge: str,
    code_challenge_method: str,
    resource: str,
) -> tuple[dict[str, Any], str]:
    """Validate everything before either showing or acting on consent."""
    if response_type != "code":
        raise mcp_auth_service.OAuthError(
            "unsupported_response_type", "Only the authorization code flow is supported"
        )
    if not state.strip():
        raise mcp_auth_service.OAuthError("invalid_request", "Missing state")
    if not code_challenge.strip():
        raise mcp_auth_service.OAuthError("invalid_request", "Missing code_challenge")
    if code_challenge_method != "S256":
        raise mcp_auth_service.OAuthError("invalid_request", "Only S256 PKCE is supported")

    # Fetching the document resolves a caller-supplied host and may wait on the
    # network; keep that off the event loop like every other blocking call.
    document = await asyncio.to_thread(mcp_clients.fetch_document, client_id)
    if not mcp_clients.redirect_uri_allowed(document, redirect_uri):
        raise mcp_auth_service.OAuthError("invalid_request", "redirect_uri is not registered for this client")
    if resource and resource != mcp_auth_service.resource_for(base):
        raise mcp_auth_service.OAuthError("invalid_request", "resource must be this server's /mcp endpoint")
    return document, mcp_auth_service.normalize_scope(scope)


def _with_query(redirect_uri: str, params: dict[str, str]) -> str:
    separator = "&" if urlparse(redirect_uri).query else "?"
    return f"{redirect_uri}{separator}{urlencode(params)}"


@router.get(f"{ISSUER_PATH}/authorize", include_in_schema=False, response_model=None)
async def authorize(
    request: Request,
    response_type: str = Query(default="code"),
    client_id: str = Query(...),
    redirect_uri: str = Query(...),
    state: str = Query(...),
    scope: str = Query(default=""),
    code_challenge: str = Query(...),
    code_challenge_method: str = Query(default="S256"),
    resource: str = Query(default=""),
) -> HTMLResponse | RedirectResponse | JSONResponse:
    """Show the consent page, signing the user in first if needed."""
    base = _base_url(request)
    try:
        document, normalized_scope = await _validate_authorize_request(
            base=base,
            response_type=response_type,
            client_id=client_id,
            redirect_uri=redirect_uri,
            state=state,
            scope=scope,
            code_challenge=code_challenge,
            code_challenge_method=code_challenge_method,
            resource=resource,
        )
    except (mcp_clients.McpClientError, mcp_auth_service.OAuthError) as exc:
        return _oauth_error(exc.error, exc.description, status_code=exc.status_code)

    try:
        user = await get_current_user(request)
    except HTTPException:
        next_url = str(request.url)
        login_url = f"{base}/?next={quote(next_url, safe='')}"
        return RedirectResponse(login_url, status_code=302)
    refuse_provider_token(user)
    if user.auth_type == "guest":
        return _oauth_error("invalid_request", "Sign-in is not required on this server")

    granted_scope, dropped = mcp_auth_service.scope_for_user(normalized_scope, str(user.role))
    return HTMLResponse(
        _consent_page(
            user=user,
            client_name=document["client_name"],
            client_host=mcp_clients.host_of(client_id),
            scope=granted_scope,
            not_granted=dropped,
            fields={
                "response_type": response_type,
                "client_id": client_id,
                "redirect_uri": redirect_uri,
                "state": state,
                "scope": granted_scope,
                "code_challenge": code_challenge,
                "code_challenge_method": code_challenge_method,
                "resource": resource,
            },
        )
    )


@router.post(f"{ISSUER_PATH}/authorize", include_in_schema=False, response_model=None)
async def authorize_submit(
    request: Request,
    response_type: str = Form(default="code"),
    client_id: str = Form(...),
    redirect_uri: str = Form(...),
    state: str = Form(...),
    scope: str = Form(default=""),
    code_challenge: str = Form(...),
    code_challenge_method: str = Form(default="S256"),
    resource: str = Form(default=""),
    decision: str = Form(default="allow"),
) -> RedirectResponse | JSONResponse:
    """Issue the code on Allow, or answer ``access_denied`` on Deny."""
    base = _base_url(request)
    # The session cookie is SameSite=Lax, which already keeps it off a
    # cross-site POST; refusing a foreign Origin also covers same-site hosts.
    origin = request.headers.get("origin")
    if origin and urlsplit(origin).netloc != urlsplit(base).netloc:
        return _oauth_error("invalid_request", "Consent must come from this server", status_code=403)
    try:
        document, normalized_scope = await _validate_authorize_request(
            base=base,
            response_type=response_type,
            client_id=client_id,
            redirect_uri=redirect_uri,
            state=state,
            scope=scope,
            code_challenge=code_challenge,
            code_challenge_method=code_challenge_method,
            resource=resource,
        )
    except (mcp_clients.McpClientError, mcp_auth_service.OAuthError) as exc:
        return _oauth_error(exc.error, exc.description, status_code=exc.status_code)

    user = await get_current_user(request)
    refuse_provider_token(user)
    if user.auth_type == "guest":
        return _oauth_error("invalid_request", "Sign-in is not required on this server")

    if decision != "allow":
        return RedirectResponse(
            _with_query(
                redirect_uri,
                {
                    "error": "access_denied",
                    "error_description": "The user denied the request",
                    "state": state,
                    "iss": _issuer(base),
                },
            ),
            status_code=303,
        )

    try:
        code = await asyncio.to_thread(
            mcp_auth_service.issue_authorization_code,
            client_id=client_id,
            client_name=str(document["client_name"]),
            redirect_uri=redirect_uri,
            scope=normalized_scope,
            code_challenge=code_challenge,
            user=user,
            base_url=base,
        )
    except mcp_auth_service.OAuthError as exc:
        return _oauth_error(exc.error, exc.description, status_code=exc.status_code)
    return RedirectResponse(
        _with_query(
            redirect_uri,
            {"code": code, "state": state, "iss": _issuer(base)},
        ),
        status_code=303,
    )


@router.post(f"{ISSUER_PATH}/token", include_in_schema=False)
async def token(
    request: Request,
    grant_type: str = Form(...),
    client_id: str = Form(default=""),
    code: str = Form(default=""),
    redirect_uri: str = Form(default=""),
    code_verifier: str = Form(default=""),
    refresh_token: str = Form(default=""),
    scope: str = Form(default=""),
    resource: str = Form(default=""),
) -> JSONResponse:
    """Exchange an authorization code, or rotate a refresh token."""
    base = _base_url(request)
    try:
        if grant_type == "authorization_code":
            if not (client_id and code and redirect_uri and code_verifier):
                raise mcp_auth_service.OAuthError(
                    "invalid_request", "code, redirect_uri, client_id and code_verifier are required"
                )
            payload = await asyncio.to_thread(
                mcp_auth_service.exchange_authorization_code,
                code=code,
                client_id=client_id,
                redirect_uri=redirect_uri,
                code_verifier=code_verifier,
                resource=resource,
                base_url=base,
            )
        elif grant_type == "refresh_token":
            if not (client_id and refresh_token):
                raise mcp_auth_service.OAuthError(
                    "invalid_request", "refresh_token and client_id are required"
                )
            payload = await asyncio.to_thread(
                mcp_auth_service.refresh_access_token,
                refresh_token=refresh_token,
                client_id=client_id,
                scope=scope,
                base_url=base,
            )
        else:
            raise mcp_auth_service.OAuthError(
                "unsupported_grant_type", "Only authorization_code and refresh_token are supported"
            )
    except (mcp_clients.McpClientError, mcp_auth_service.OAuthError) as exc:
        return _oauth_error(exc.error, exc.description, status_code=exc.status_code)
    return JSONResponse(payload)


@router.post(f"{ISSUER_PATH}/revoke", include_in_schema=False)
async def revoke(
    token: str = Form(...),
    client_id: str = Form(default=""),
) -> Response:
    """Revoke a grant; RFC 7009 requires success even for an unknown token."""
    try:
        await asyncio.to_thread(mcp_auth_service.revoke_token, token, client_id)
    except Exception:  # noqa: BLE001 - revocation must not reveal whether the token existed
        pass
    return Response(status_code=200)


def _consent_page(
    *,
    user: Any,
    client_name: str,
    client_host: str,
    scope: str,
    fields: dict[str, str],
    not_granted: list[str] | None = None,
) -> str:
    hidden = "\n    ".join(
        f'<input type="hidden" name="{escape(name)}" value="{escape(value)}">'
        for name, value in fields.items()
    )
    return _CONSENT_TEMPLATE.format(
        client=escape(client_name),
        host=escape(client_host),
        name=escape(user.name or user.email),
        email=escape(user.email),
        scopes=escape(scope),
        not_granted=(
            f'<div class="scopes">Not granted (admins only): {escape(" ".join(not_granted))}</div>'
            if not_granted
            else ""
        ),
        hidden=hidden,
    )


_CONSENT_TEMPLATE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Authorize {client}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root {{
    color-scheme: light dark;
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --primary: 221.2 83.2% 53.3%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --border: 214.3 31.8% 91.4%;
    --destructive: 0 84.2% 60.2%;
  }}
  @media (prefers-color-scheme: dark) {{
    :root {{
      --background: 222.2 84% 4.9%;
      --foreground: 210 40% 98%;
      --card: 222.2 84% 4.9%;
      --muted-foreground: 215 20.2% 65.1%;
      --primary: 217.2 91.2% 59.8%;
      --primary-foreground: 222.2 47.4% 11.2%;
      --secondary: 217.2 32.6% 17.5%;
      --secondary-foreground: 210 40% 98%;
      --muted: 217.2 32.6% 17.5%;
      --border: 217.2 32.6% 17.5%;
      --destructive: 0 62.8% 30.6%;
    }}
  }}
  * {{ box-sizing: border-box; }}
  body {{ font-family: 'Inter', system-ui, sans-serif; font-size: 14px; line-height: 1.5;
    margin: 0; display: grid; place-items: center; min-height: 100vh;
    background: hsl(var(--background)); color: hsl(var(--foreground)); }}
  .card {{ background: hsl(var(--card)); border: 1px solid hsl(var(--border));
    border-radius: 6px; padding: 28px 30px; max-width: 440px; width: calc(100% - 32px); }}
  h1 {{ font-size: 18px; font-weight: 600; margin: 0 0 8px; letter-spacing: -0.01em; }}
  p {{ margin: 0 0 14px; color: hsl(var(--muted-foreground)); }}
  .who {{ font-weight: 600; color: hsl(var(--foreground)); }}
  .host {{ font: 12px ui-monospace, 'SF Mono', Menlo, monospace; }}
  .scopes {{ font: 12px ui-monospace, 'SF Mono', Menlo, monospace;
    background: hsl(var(--muted)); color: hsl(var(--foreground));
    border: 1px solid hsl(var(--border)); border-radius: 4px;
    padding: 8px 10px; margin: 0 0 18px; }}
  .row {{ display: flex; gap: 10px; }}
  button {{ font-family: inherit; font-size: 13px; font-weight: 500; border-radius: 0;
    padding: 9px 16px; cursor: pointer; border: 1px solid transparent;
    transition: background-color .15s; }}
  .go {{ background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); }}
  .go:hover {{ background: hsl(var(--primary) / 0.85); }}
  .deny {{ background: transparent; color: hsl(var(--foreground));
    border-color: hsl(var(--border)); }}
  .deny:hover {{ background: hsl(var(--secondary)); }}
</style></head>
<body><div class="card">
  <h1>Authorize {client}?</h1>
  <p><span class="host">{host}</span></p>
  <p>Signed in as <span class="who">{name}</span> ({email}). Approving lets this
     client act on Prism as you until you revoke it.</p>
  <div class="scopes">Access: {scopes}</div>
  {not_granted}
  <form method="post" action="">
    {hidden}
    <div class="row">
      <button class="go" type="submit" name="decision" value="allow">Allow</button>
      <button class="deny" type="submit" name="decision" value="deny">Deny</button>
    </div>
  </form>
</div></body></html>"""
