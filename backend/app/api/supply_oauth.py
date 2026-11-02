"""A person's sign-in at DigiKey, for change notices. Administrators only.

Who is signed in comes with an administrator's connector list. ``POST /api/supply/connectors/{id}/signin`` gives the DigiKey address to open; DigiKey sends the browser back to
``GET /api/supply/oauth/digikey/callback``, which keeps the grant and returns to the Sources tab with a result code
in the address (``signin=ok`` or ``signin=failed&reason=<code>``). The page words the code itself. The callback needs the same administrator's session and the one-time state from the start.
"""

from __future__ import annotations

import asyncio
from typing import Optional
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import RedirectResponse

from app.api import supply_connectors
from app.api.supply_connectors_models import SigninStarted
from app.core.security import AuthenticatedUser, require_admin
from app.services.supply import oauth
from app.services.supply.connectors import ConnectorNotFound
from app.services.trackers.secrets import SecretStoreLocked

router = APIRouter(prefix="/api/supply", tags=["supply"])

RETURN_TO = "/?section=supply&supplyView=sources"


def _service():
    return supply_connectors.service


@router.post("/connectors/{connector_id}/signin", response_model=SigninStarted)
async def start_signin(connector_id: str, admin: AuthenticatedUser = Depends(require_admin)) -> dict[str, str]:
    try:
        url = await asyncio.to_thread(oauth.start, _service(), connector_id, admin.email)
    except ConnectorNotFound as exc:
        raise HTTPException(status_code=404, detail="Connector not found") from exc
    except oauth.SignInError as exc:
        raise HTTPException(status_code=400, detail={"code": "signin_unavailable", "message": str(exc)}) from exc
    except SecretStoreLocked as exc:
        raise HTTPException(status_code=503, detail={"code": "keyring_locked", "message": "The credential keyring is locked."}) from exc
    return {"url": url}


@router.delete("/connectors/{connector_id}/signin", status_code=204)
async def forget_signin(connector_id: str, admin: AuthenticatedUser = Depends(require_admin)) -> Response:
    await asyncio.to_thread(oauth.forget, _service(), connector_id, admin.email)
    return Response(status_code=204)


@router.get(oauth.CALLBACK_PATH.removeprefix("/api/supply"), include_in_schema=False)
async def digikey_callback(
    code: Optional[str] = Query(default=None, max_length=2000),
    state: Optional[str] = Query(default=None, max_length=200),
    error: Optional[str] = Query(default=None, max_length=200),
    admin: AuthenticatedUser = Depends(require_admin),
) -> RedirectResponse:
    def back(result: str, reason: str = "") -> RedirectResponse:
        query = urlencode({"signin": result, **({"reason": reason} if reason else {})})
        return RedirectResponse(f"{RETURN_TO}&{query}", status_code=303)

    if error:
        return back("failed", "denied")
    try:
        await asyncio.to_thread(oauth.finish, _service(), state or "", code or "", admin.email)
    except oauth.SignInError as exc:
        return back("failed", exc.reason)
    except (ConnectorNotFound, SecretStoreLocked):
        return back("failed", "unreadable")
    return back("ok")
