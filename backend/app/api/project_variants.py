"""Design-variant catalog endpoint (VAR-08).

``GET /api/projects/{project_id}/variants`` returns the revision's variant
catalog (contract packet v1.0 section 3.1). The project lookup is role-aware,
the source reads run off the event loop, and the response carries an ETag so a
client can revalidate instead of refetching.

Responses are private and revalidate on every request: both source content
and generator behavior can change without the URL changing. ETags avoid
resending an unchanged payload; the service caches discovery work.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import subprocess
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response

from app.api._helpers import get_project_for_role_or_404
from app.core.security import AuthenticatedUser, require_viewer
from app.services import project_source_snapshot, variant_catalog_service, variant_source_scan

router = APIRouter(dependencies=[Depends(require_viewer)])


def _catalog_generator_tag() -> str:
    """Identify the code that shapes catalog output, for the ETag.

    The source revision key covers the input files; this covers the discovery
    code. Both must move for a cached entry to be reusable, so the tag hashes
    the modules whose logic can change the answer.
    """

    digest = hashlib.sha256()
    for module in (
        variant_catalog_service,
        project_source_snapshot,
        variant_source_scan,
    ):
        digest.update(Path(module.__file__).read_bytes())
    return f"{variant_catalog_service.SCHEMA}-{digest.hexdigest()[:12]}"


CATALOG_GENERATOR_TAG = _catalog_generator_tag()


@router.get("/{project_id}/variants")
async def get_project_variants(
    project_id: str,
    request: Request,
    commit: Optional[str] = Query(default=None),
    user: AuthenticatedUser = Depends(require_viewer),
):
    project = get_project_for_role_or_404(project_id, user.role)
    try:
        payload = await asyncio.to_thread(
            variant_catalog_service.discover_variant_catalog,
            project,
            commit,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail="Could not read design variants for this revision") from error
    except (RuntimeError, OSError, subprocess.SubprocessError) as error:
        raise HTTPException(status_code=503, detail="Could not read design variants for this revision") from error

    identity = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:24]
    etag = f'"{identity}-{CATALOG_GENERATOR_TAG}"'
    # Source commits are immutable, but the generator can change at deployment.
    # Revalidate every response; cached discovery and ETags keep this cheap.
    headers = {"Cache-Control": "private, no-cache", "ETag": etag}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)
    return Response(
        content=json.dumps(payload),
        media_type="application/json",
        headers=headers,
    )
