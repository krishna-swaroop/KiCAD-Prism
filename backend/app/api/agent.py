"""Sign-in and token management for the KiCad desktop agent.

Three surfaces:

* the browser consent flow (``/agent/authorize``) that turns the user's normal
  session login into a one-time authorization code for the agent's loopback
  listener;
* the back-channel PKCE exchange (``/agent/token``) that trades the code for a
  scoped user token;
* token management (``/agent/tokens``) so a user can see and revoke their own
  agent tokens, and an admin can see and revoke everyone's.

The consent step is an explicit POST, not an auto-followed GET: a redirect the
browser follows on its own would let a malicious page authorize an agent it
controls using the victim's live session.
"""

from __future__ import annotations

import asyncio
from urllib.parse import quote, urlencode

from fastapi import APIRouter, Depends, Form, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from pydantic import BaseModel

from app.core import policy
from app.core.policy import require_owner_or_admin
from app.core.security import (
    AuthenticatedUser,
    get_current_user,
    is_guest,
    refuse_provider_token,
    require_viewer,
)
from app.services import agent_auth_service

router = APIRouter(prefix="/api/agent", tags=["agent"])


def _base_url(request: Request) -> str:
    return str(request.base_url)


class TokenExchangeResponse(BaseModel):
    access_token: str
    token_type: str
    scope: str
    expires_in: int


class AgentTokenView(BaseModel):
    jti: str
    email: str
    label: str
    scopes: list[str]
    created_at: str | None = None
    expires_at: int
    last_used_at: str | None = None


@router.get("/config")
async def config() -> dict[str, bool]:
    """Whether this server requires the agent to sign in.

    When auth is disabled the agent stays a guest and the whole flow is a no-op,
    so the plugin can skip the sign-in step entirely.
    """
    return {"sign_in_required": agent_auth_service.agent_auth_enabled()}


@router.get("/authorize", include_in_schema=False, response_model=None)
async def authorize(
    request: Request,
    redirect_uri: str = Query(...),
    response_type: str = Query(default="code"),
    state: str = Query(...),
    scope: str = Query(default=""),
    code_challenge: str = Query(...),
    code_challenge_method: str = Query(default="S256"),
    label: str = Query(default=""),
) -> HTMLResponse | RedirectResponse:
    """Validate the request, require a login, then show the consent screen."""
    agent_auth_service.validate_authorization_request(
        redirect_uri=redirect_uri,
        response_type=response_type,
        state=state,
        scope=scope,
        code_challenge=code_challenge,
        code_challenge_method=code_challenge_method,
    )

    try:
        user = await get_current_user(request)
    except HTTPException:
        next_url = str(request.url)
        login_url = f"{_base_url(request).rstrip('/')}/?next={quote(next_url, safe='')}"
        return RedirectResponse(login_url, status_code=302)
    refuse_provider_token(user)

    if is_guest(user):
        # Auth is off; nothing to authorize.
        raise HTTPException(status_code=400, detail="Sign-in is not required on this server")

    return HTMLResponse(
        _consent_page(
            user=user,
            label=label,
            scope=scope,
            fields={
                "redirect_uri": redirect_uri,
                "state": state,
                "scope": scope,
                "code_challenge": code_challenge,
                "code_challenge_method": code_challenge_method,
                "label": label,
            },
        )
    )


@router.post("/authorize", include_in_schema=False)
async def authorize_submit(
    request: Request,
    redirect_uri: str = Form(...),
    state: str = Form(...),
    scope: str = Form(default=""),
    code_challenge: str = Form(...),
    code_challenge_method: str = Form(default="S256"),
    label: str = Form(default=""),
) -> RedirectResponse:
    """Consent granted: issue the one-time code and redirect to the loopback."""
    agent_auth_service.validate_authorization_request(
        redirect_uri=redirect_uri,
        response_type="code",
        state=state,
        scope=scope,
        code_challenge=code_challenge,
        code_challenge_method=code_challenge_method,
    )
    user = await get_current_user(request)
    refuse_provider_token(user)
    if is_guest(user):
        raise HTTPException(status_code=400, detail="Sign-in is not required on this server")

    # Storing the one-time code is a PostgreSQL write; the validation above is
    # pure and stays on the loop.
    code = await asyncio.to_thread(
        agent_auth_service.issue_authorization_code,
        user=user,  # type: ignore[arg-type]
        redirect_uri=redirect_uri,
        scope=scope,
        code_challenge=code_challenge,
        agent_label=label,
    )
    target = f"{redirect_uri}?{urlencode({'code': code, 'state': state})}"
    return RedirectResponse(target, status_code=303)


@router.post("/token", response_model=TokenExchangeResponse, operation_id="agent_token")
async def token(
    code: str = Form(...),
    redirect_uri: str = Form(...),
    code_verifier: str = Form(...),
) -> JSONResponse:
    """Back-channel exchange: code + PKCE verifier for a scoped user token."""
    # Consuming the code and recording the issued token are PostgreSQL writes;
    # a slow store must stall this request, not the loop every request shares.
    payload = await asyncio.to_thread(
        agent_auth_service.exchange_authorization_code,
        code=code,
        redirect_uri=redirect_uri,
        code_verifier=code_verifier,
    )
    return JSONResponse(payload)


@router.get("/tokens", response_model=list[AgentTokenView])
async def list_tokens(
    all_users: bool = Query(default=False),
    user: AuthenticatedUser = Depends(require_viewer),
) -> list[dict]:
    """A user's own agent tokens, or every user's when an admin asks.

    ``all_users`` is honored only for admins; anyone else always sees just their
    own, regardless of the flag.
    """
    email = None if (all_users and policy.role_allows(user.role, "admin")) else user.email
    # A catalog read; keep it off the event loop like every other store call.
    return await asyncio.to_thread(agent_auth_service.list_agent_tokens, email=email)


@router.delete("/tokens/{jti}")
async def revoke_token(
    jti: str,
    user: AuthenticatedUser = Depends(require_viewer),
) -> dict[str, str]:
    """Revoke one agent token. A user may revoke their own; an admin, anyone's."""
    # The lookup, the ownership check and the revocation are one blocking
    # sequence against PostgreSQL. Run them in their original order on one
    # worker thread; the ownership check stays between the two writes, so a
    # caller can never revoke a token the check would have refused.
    def revoke() -> None:
        row = agent_auth_service.get_agent_token(jti)
        if not row:
            raise HTTPException(status_code=404, detail="Token not found")
        require_owner_or_admin(user, row["email"], detail="Not your token")
        agent_auth_service.revoke_agent_token_by_jti(jti)

    await asyncio.to_thread(revoke)
    return {"status": "revoked"}


def _consent_page(
    *, user: AuthenticatedUser, label: str, scope: str, fields: dict[str, str]
) -> str:
    """Minimal, self-contained consent screen. The only external asset is the Inter webfont.

    The device the user is approving is named so they consent to a specific
    agent, and every request field is echoed as a hidden input so the POST
    carries exactly what the GET validated.
    """
    from html import escape

    device = escape(label) if label.strip() else "a KiCad agent on this machine"
    scopes = agent_auth_service.normalize_agent_scope(scope)
    hidden = "\n    ".join(
        f'<input type="hidden" name="{escape(name)}" value="{escape(value)}">'
        for name, value in fields.items()
    )
    return _CONSENT_TEMPLATE.format(
        name=escape(user.name or user.email),
        email=escape(user.email),
        device=device,
        scopes=escape(scopes),
        hidden=hidden,
    )


_CONSENT_TEMPLATE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Authorize the KiCad agent</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  /* Prism's own tokens (frontend/src/index.css), so this matches the web app.
     Dark is the app's default; light follows the OS preference. */
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
    }}
  }}
  * {{ box-sizing: border-box; }}
  body {{ font-family: 'Inter', system-ui, sans-serif; font-size: 14px; line-height: 1.5;
    margin: 0; display: grid; place-items: center; min-height: 100vh;
    background: hsl(var(--background)); color: hsl(var(--foreground)); }}
  /* Square, bordered card, matching the app's surfaces (radius 0.5rem there,
     but the app's buttons and many panels read square; keep the card lightly
     rounded to 6px like the app's cards). */
  .card {{ background: hsl(var(--card)); border: 1px solid hsl(var(--border));
    border-radius: 6px; padding: 28px 30px; max-width: 420px; width: calc(100% - 32px); }}
  h1 {{ font-size: 18px; font-weight: 600; margin: 0 0 8px; letter-spacing: -0.01em; }}
  p {{ margin: 0 0 14px; color: hsl(var(--muted-foreground)); }}
  .who {{ font-weight: 600; color: hsl(var(--foreground)); }}
  .scopes {{ font: 12px ui-monospace, 'SF Mono', Menlo, monospace;
    background: hsl(var(--muted)); color: hsl(var(--foreground));
    border: 1px solid hsl(var(--border)); border-radius: 4px;
    padding: 8px 10px; margin: 0 0 18px; }}
  .row {{ display: flex; gap: 10px; }}
  /* Square buttons, like the web app's (rounded-none), text-xs font-medium. */
  button {{ font-family: inherit; font-size: 13px; font-weight: 500; border-radius: 0;
    padding: 9px 16px; cursor: pointer; border: 1px solid transparent;
    transition: background-color .15s; }}
  .go {{ background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); }}
  .go:hover {{ background: hsl(var(--primary) / 0.85); }}
</style></head>
<body><div class="card">
  <h1>Authorize {device}?</h1>
  <p>Signed in as <span class="who">{name}</span> ({email}). Approving lets this
     agent act on Prism as you until you revoke it.</p>
  <div class="scopes">Access: {scopes}</div>
  <form method="post" action="">
    {hidden}
    <div class="row">
      <button class="go" type="submit">Authorize</button>
    </div>
  </form>
</div></body></html>"""
