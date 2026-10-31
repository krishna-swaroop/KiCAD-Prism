from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response

from app.core.roles import SUPPLY_READ_ROLES
from app.api import remote_provider_models as models
from app.api._helpers import preview_file_response
from app.core.errors import value_errors_as
from app.core.security import AuthenticatedUser, require_remote_symbol_reader
from app.services import provider_auth_service, provider_revisions
from app.services.component_catalog_service import catalog_service
from app.services.public_url_service import resolve_public_base_url

router = APIRouter()
logger = logging.getLogger(__name__)

STATIC_DIR = Path(__file__).resolve().parent.parent / "static" / "remote_provider"


def _provider_origin(request: Request) -> str:
    return resolve_public_base_url(request)


PROVIDER_VERSION = "0.4.0"


def _placement_query(representation_id: str, revision_id: str) -> str:
    """``?representation=…&revision=…`` with only the parts that are set."""
    parameters = [
        f"{name}={value}" for name, value in (("representation", representation_id), ("revision", revision_id)) if value
    ]
    return f"?{'&'.join(parameters)}" if parameters else ""


def _component_payload(component: dict, origin: str, representation_id: str = "", revision_id: str = "") -> dict:
    preview_map = {
        preview["kind"]: f"{origin}/api/remote-provider/previews/{preview['id']}"
        for preview in component["previews"]
        if preview.get("status") == "ready" and preview.get("file_path")
    }
    preview_status = {
        preview["kind"]: {
            "status": preview.get("status", "failed"),
            "error": preview.get("generation_error", ""),
        }
        for preview in component["previews"]
    }
    representations = []
    for representation in component.get("representations", []):
        item = dict(representation)
        for key in ("symbol", "footprint"):
            asset = dict(item[key]) if item.get(key) else None
            if asset:
                preview_id = str(asset.get("preview_id") or "")
                asset["preview_url"] = (
                    f"{origin}/api/remote-provider/previews/{preview_id}" if preview_id else ""
                )
            item[key] = asset
        representations.append(item)
    effective = None
    if representation_id:
        effective = next((item for item in representations if item["id"] == representation_id), None)
        if not effective:
            raise ValueError("Representation was not found on this revision")
    else:
        effective = next((item for item in representations if item.get("is_default")), None)
    if effective and (not effective.get("symbol") or not effective.get("footprint")):
        raise ValueError("Selected representation is incomplete")
    symbol = effective.get("symbol") if effective else None
    footprint = effective.get("footprint") if effective else None
    return {
        "id": component["id"],
        "slug": component["slug"],
        "name": component["name"],
        "identity_kind": component.get("identity_kind", "mpn"),
        "manufacturer": component["manufacturer"],
        "mpn": component["mpn"],
        "description": component["description"],
        "package_name": component["package_name"],
        "category": component["category"],
        "datasheet_url": component["datasheet_url"],
        "summary": component["summary"],
        "version": component["version"],
        "library_name": symbol.get("target_library", "") if symbol else component["library_name"],
        "symbol_name": symbol.get("target_name", "") if symbol else component["symbol_name"],
        "representations": representations,
        "default_representation_id": component.get("default_representation_id", ""),
        "effective_representation_id": effective.get("id", "") if effective else "",
        "assets": component["assets"],
        "availability_state": component["availability_state"],
        "missing_assets": component["missing_assets"],
        "place_enabled": component["place_enabled"],
        "release_status": component.get("release_status", ""),
        "workflow_stage": component.get("workflow_stage", component.get("release_status", "")),
        "supply": component.get("supply") or {"sources": []},
        "preview_status": preview_status,
        "symbol_preview_url": symbol.get("preview_url", "") if symbol else preview_map.get("symbol", ""),
        "footprint_preview_url": footprint.get("preview_url", "") if footprint else preview_map.get("footprint", ""),
        "revision_id": component.get("revision_id", ""),
        "manifest_url": (
            f"{origin}/api/remote-provider/parts/{component['id']}"
            + _placement_query(effective["id"] if effective else "", revision_id)
        ),
        "inline_url": (
            f"{origin}/api/remote-provider/components/{component['id']}/inline"
            + _placement_query(effective["id"] if effective else "", revision_id)
        ),
    }


def _supply_visible(user: AuthenticatedUser) -> bool:
    return user is not None and user.role in SUPPLY_READ_ROLES


def _supply_version(user: AuthenticatedUser) -> str:
    """Part of the cache key, so a panel refetches a list when supply data has moved on."""

    if not _supply_visible(user):
        return ""
    try:
        from app.services.supply import panel_payload
        from app.services.supply.store import supply_store

        with supply_store.connection() as conn:
            return panel_payload.data_version(conn)
    except Exception:  # noqa: BLE001 - supply data is optional; browsing the catalog must not depend on it
        logger.warning("Supply data version unavailable for the panel", exc_info=True)
        return ""


def _attach_supply(payloads: list[dict], user: AuthenticatedUser, origin: str, *, full: bool = False) -> None:
    """Add the supply summary (and on detail the rest) to payloads, in place. Never raises."""

    if not payloads or not _supply_visible(user):
        return
    try:
        from app.services.supply import ending_parts, panel_payload
        from app.services.supply.store import supply_store

        with supply_store.connection() as conn:
            marks = ending_parts.restrictions_of(conn, [str(payload["id"]) for payload in payloads])
            if full:
                found = {payload["id"]: panel_payload.detail(conn, payload, user.role, origin) for payload in payloads}
                found = {key: value for key, value in found.items() if value}
            else:
                found = {key: {"summary": value} for key, value in panel_payload.summaries(conn, payloads, user.role).items()}
    except Exception:  # noqa: BLE001 - supply data is optional; browsing the catalog must not depend on it
        logger.warning("Supply data unavailable for the panel", exc_info=True)
        return
    for payload in payloads:
        extra = found.get(payload["id"])
        if extra:
            payload["supply"] = {**payload["supply"], **extra}
        mark = marks.get(str(payload["id"]))
        if mark and mark["level"] == "not_for_new_designs":
            payload["supply"] = {**payload["supply"], "restriction": mark["level"]}


def _projection_etag(version: str, **parameters: object) -> str:
    suffix = hashlib.sha256(
        json.dumps(
            parameters,
            sort_keys=True,
            separators=(",", ":"),
            default=str,
        ).encode("utf-8")
    ).hexdigest()[:16]
    return f'"remote-{version}-{suffix}"'


@router.get("/.well-known/kicad-remote-provider", include_in_schema=False)
async def provider_metadata(request: Request):
    base_url = _provider_origin(request)
    auth_metadata = {"type": "none"}
    metadata = {
        "provider_name": "KiCAD Prism Remote Symbols",
        "provider_version": PROVIDER_VERSION,
        "api_base_url": base_url,
        "panel_url": f"{base_url}/remote-provider/panel",
        "auth": auth_metadata,
        # KiCad's v1 metadata schema rejects unknown capability names. The web
        # panel carries representation IDs in manifest/inline URLs, so existing
        # clients get default placement without a non-standard v1 capability.
        "capabilities": {
            "web_ui_v1": True,
            "parts_v1": True,
            "direct_downloads_v1": True,
            "inline_payloads_v1": True,
        },
        "parts": {
            "endpoint_template": "/api/remote-provider/parts/{part_id}",
        },
        "max_download_bytes": 16 * 1024 * 1024,
        "supported_asset_types": ["symbol", "footprint", "3dmodel", "spice"],
        "allow_insecure_localhost": True,
    }

    if provider_auth_service.provider_auth_enabled():
        auth_metadata = {
            "type": "oauth2",
            "metadata_url": f"{base_url}/oauth/.well-known/oauth-authorization-server",
            "client_id": provider_auth_service.provider_client_id(),
            "scopes": ["remote_symbols.read"],
        }
        metadata["auth"] = auth_metadata
        metadata["session_bootstrap_url"] = f"{base_url}/oauth/session/bootstrap"

    return metadata


# Vite emits content-hashed names for everything except the panel entry
# bundle, whose fixed filenames carry a `?v=<digest>` query baked into the
# HTML. Both URL shapes are content-addressed and safe to cache long-lived;
# anything else must revalidate against an ETag on every open.
_VITE_HASH_SUFFIX = re.compile(r"-[0-9a-zA-Z_-]{8}$")

_asset_versions: dict[str, tuple[float, str]] = {}


def _asset_version(asset_name: str) -> str:
    path = STATIC_DIR / asset_name
    try:
        mtime = path.stat().st_mtime
    except OSError:
        return "0"
    cached = _asset_versions.get(asset_name)
    if cached and cached[0] == mtime:
        return cached[1]
    digest = hashlib.sha256(path.read_bytes()).hexdigest()[:12]
    _asset_versions[asset_name] = (mtime, digest)
    return digest


def _panel_html(html_path: Path) -> HTMLResponse:
    html = html_path.read_text(encoding="utf-8")
    for asset_name in ("panel.js", "panel.css"):
        if asset_name in html:
            html = html.replace(
                f"assets/{asset_name}",
                f"assets/{asset_name}?v={_asset_version(asset_name)}",
            )
    return HTMLResponse(html, headers={"Cache-Control": "no-store"})


@router.get("/remote-provider/panel", response_class=HTMLResponse, include_in_schema=False)
async def provider_panel():
    html_path = STATIC_DIR / "panel.html"
    if not html_path.is_file():
        html_path = STATIC_DIR / "index.html"
    return _panel_html(html_path)


@router.get("/remote-provider/assets/{asset_name:path}", include_in_schema=False)
async def provider_static_asset(asset_name: str, request: Request):
    asset_path = (STATIC_DIR / asset_name).resolve()
    try:
        asset_path.relative_to(STATIC_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Forbidden")
    if not asset_path.is_file():
        raise HTTPException(status_code=404, detail="Asset not found")
    mime_map = {
        ".js": "application/javascript",
        ".css": "text/css",
        ".woff2": "font/woff2",
        ".woff": "font/woff",
        ".ttf": "font/ttf",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".json": "application/json",
    }
    suffix = asset_path.suffix.lower()
    media_type = mime_map.get(suffix, "application/octet-stream")
    # Starlette's FileResponse never answers conditional requests itself, so
    # handle If-None-Match here: content-addressed URLs cache long-lived,
    # everything else gets a cheap 304 revalidation path instead of no-cache.
    digest = _asset_version(asset_name)
    etag = f'"{digest}"'
    content_addressed = (
        request.query_params.get("v") == digest
        or bool(_VITE_HASH_SUFFIX.search(asset_path.stem))
    )
    if content_addressed:
        cache_control = "public, max-age=31536000, immutable"
    else:
        cache_control = "no-cache"
        if request.headers.get("if-none-match") == etag:
            return Response(
                status_code=304,
                headers={"ETag": etag, "Cache-Control": cache_control},
            )
    return FileResponse(
        asset_path,
        media_type=media_type,
        headers={"Cache-Control": cache_control, "ETag": etag},
    )


@router.get(
    "/api/remote-provider/search",
    response_model=models.ComponentPage,
    summary="Search the released components KiCad may place",
)
async def search_components(
    request: Request,
    q: str = Query(default=""),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    include_total: bool = Query(default=False),
    user: AuthenticatedUser = Depends(require_remote_symbol_reader),
):
    _ = user
    version = await asyncio.to_thread(catalog_service.remote_projection_version)
    supply_version = await asyncio.to_thread(_supply_version, user)
    etag = _projection_etag(
        version,
        supply=supply_version,
        endpoint="search",
        q=q,
        page=page,
        page_size=page_size,
        include_total=include_total,
    )
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag})
    result = await asyncio.to_thread(
        catalog_service.list_remote_component_heads,
        query=q,
        page=page,
        page_size=page_size,
        include_total=include_total,
    )
    origin = _provider_origin(request)
    items = [_component_payload(c, origin) for c in result["items"]]
    await asyncio.to_thread(_attach_supply, items, user, origin)
    return JSONResponse({
        "items": items,
        "total": result["total"],
        "has_more": result["has_more"],
        "page": result["page"],
        "pages": result["pages"],
        "page_size": result["page_size"],
    }, headers={"ETag": etag, "Cache-Control": "private, no-cache"})


@router.get(
    "/api/remote-provider/categories",
    response_model=models.CategoryList,
    summary="List the released components' categories",
)
async def list_categories(
    request: Request,
    user: AuthenticatedUser = Depends(require_remote_symbol_reader),
):
    _ = user
    version = await asyncio.to_thread(catalog_service.remote_projection_version)
    etag = _projection_etag(version, endpoint="categories")
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag})
    result = await asyncio.to_thread(catalog_service.list_remote_categories)
    return JSONResponse(
        {"categories": result["categories"]},
        headers={"ETag": etag, "Cache-Control": "private, no-cache"},
    )


@router.get(
    "/api/remote-provider/components-by-category",
    response_model=models.ComponentPage,
    summary="List the released components in one category",
)
async def components_by_category(
    request: Request,
    category: str = Query(...),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    include_total: bool = Query(default=False),
    user: AuthenticatedUser = Depends(require_remote_symbol_reader),
):
    _ = user
    version = await asyncio.to_thread(catalog_service.remote_projection_version)
    supply_version = await asyncio.to_thread(_supply_version, user)
    etag = _projection_etag(
        version,
        supply=supply_version,
        endpoint="category",
        category=category,
        page=page,
        page_size=page_size,
        include_total=include_total,
    )
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag})
    result = await asyncio.to_thread(
        catalog_service.list_remote_component_heads,
        category=category,
        page=page,
        page_size=page_size,
        include_total=include_total,
    )
    origin = _provider_origin(request)
    items = [_component_payload(c, origin) for c in result["items"]]
    await asyncio.to_thread(_attach_supply, items, user, origin)
    return JSONResponse({
        "items": items,
        "total": result["total"],
        "has_more": result["has_more"],
        "page": result["page"],
        "pages": result["pages"],
        "page_size": result["page_size"],
    }, headers={"ETag": etag, "Cache-Control": "private, no-cache"})

@router.get(
    "/api/remote-provider/components/{component_id}",
    response_model=models.ComponentDetail,
    summary="The released component, with the revisions placement may serve",
)
async def get_component(
    component_id: str,
    request: Request,
    representation: str = Query(default=""),
    revision: str = Query(default=""),
    user: AuthenticatedUser = Depends(require_remote_symbol_reader),
):
    """The released component; ``revision`` selects one of its ``released_revisions`` (0.4.0)."""
    _ = user
    component = await asyncio.to_thread(provider_revisions.released_component, component_id, revision)
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    released = await asyncio.to_thread(provider_revisions.released_revisions, component_id)
    origin = _provider_origin(request)
    with value_errors_as(400):
        payload = _component_payload(component, origin, representation, revision)
    await asyncio.to_thread(_attach_supply, [payload], user, origin, full=True)
    return {**payload, "released_revisions": released}


@router.post("/api/remote-provider/supply/parts/{part_id}/refresh")
async def refresh_supply_part(part_id: str, user: AuthenticatedUser = Depends(require_remote_symbol_reader)) -> dict:
    """Read one tracked part from its distributors now. Allowed under the read scope: it changes nothing a person sees."""

    if not _supply_visible(user):
        raise HTTPException(status_code=403, detail="Supply data is not available to this account")

    def run() -> dict:
        from app.api import supply_connectors
        from app.services.supply import parts, refresh

        try:
            return refresh.read_now(supply_connectors.service, part_id, user.email)
        except refresh.TooSoon as exc:
            raise HTTPException(status_code=429, detail=str(exc)) from exc
        except parts.PartNotFound as exc:
            raise HTTPException(status_code=404, detail="Part not found") from exc

    return await asyncio.to_thread(run)


@router.get(
    "/api/remote-provider/parts/{part_id}",
    response_model=models.PartManifest,
    summary="The signed asset manifest KiCad uses to place a part",
)
async def get_part_manifest(
    part_id: str,
    request: Request,
    representation: str = Query(default=""),
    revision: str = Query(default=""),
    user: AuthenticatedUser = Depends(require_remote_symbol_reader),
):
    _ = user
    with value_errors_as(400):
        manifest = await asyncio.to_thread(
            catalog_service.build_manifest, part_id, _provider_origin(request), representation, revision
        )
    if not manifest:
        raise HTTPException(status_code=404, detail="Component not found")
    return JSONResponse(manifest)


@router.get(
    "/api/remote-provider/components/{component_id}/inline",
    response_model=models.InlineBundle,
    summary="The component's library files in KiCad's inline bundle",
)
async def get_inline_component(
    component_id: str,
    representation: str = Query(default=""),
    revision: str = Query(default=""),
    user: AuthenticatedUser = Depends(require_remote_symbol_reader),
):
    _ = user
    with value_errors_as(400):
        bundle = await asyncio.to_thread(
            catalog_service.build_inline_bundle, component_id, representation, revision
        )
    if not bundle:
        raise HTTPException(status_code=404, detail="Component not found")
    return JSONResponse(bundle)


@router.get(
    "/api/remote-provider/assets/{asset_id}",
    response_class=Response,
    summary="Download one signed asset for placement",
    responses={
        200: {
            "content": {
                "application/x-kicad-symbol": {},
                "application/x-kicad-footprint": {},
                "model/step": {},
                "application/x-spice": {},
                "application/octet-stream": {},
            },
            "description": "The asset's bytes.",
        }
    },
)
async def download_asset(
    asset_id: str,
    rev: str = Query(...),
    representation: str = Query(default=""),
    exp: int = Query(...),
    sig: str = Query(...),
):
    if not catalog_service.validate_asset_signature(asset_id, rev, exp, sig, representation):
        raise HTTPException(status_code=403, detail="Invalid or expired asset signature")

    asset = await asyncio.to_thread(
        catalog_service.get_asset_by_id,
        asset_id,
        revision_id=rev,
        representation_id=representation,
    )
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    headers = {
        "Content-Disposition": f'attachment; filename="{asset["name"]}"',
        "Content-Length": str(asset["size_bytes"]),
    }
    return Response(
        content=asset["payload"],
        media_type=asset["content_type"],
        headers=headers,
    )


@router.get(
    "/api/remote-provider/assets/{asset_id}/content",
    response_class=FileResponse,
    summary="Serve an asset's stored library file to the panel",
    responses={
        200: {
            "content": {
                "application/x-kicad-symbol": {},
                "application/x-kicad-footprint": {},
                "model/step": {},
                "application/x-spice": {},
                "application/octet-stream": {},
            },
            "description": "The library file as stored.",
        }
    },
)
async def get_asset_content(
    asset_id: str,
    user: AuthenticatedUser = Depends(require_remote_symbol_reader),
):
    """Serve an asset's stored bytes to the panel so it can render them.

    The signed `/assets/{asset_id}` download above is KiCad's placement path
    and rewrites the payload for it. This one is the library file as stored,
    and is gated by the panel's own reader dependency rather than a signature.
    """
    _ = user
    asset = await asyncio.to_thread(catalog_service.catalog_asset_source, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    path, content_type, filename = asset
    return FileResponse(
        path,
        media_type=content_type,
        headers={
            "Cache-Control": "private, max-age=300",
            "Content-Disposition": f'inline; filename="{filename}"',
        },
    )


@router.get(
    "/api/remote-provider/previews/{preview_id}",
    response_class=FileResponse,
    summary="Download a rendered symbol or footprint preview",
    responses={
        200: {
            "content": {"image/png": {}, "image/svg+xml": {}},
            "description": "The preview image.",
        }
    },
)
async def download_preview(
    preview_id: str,
    request: Request,
    user: AuthenticatedUser = Depends(require_remote_symbol_reader),
):
    _ = user
    preview = await asyncio.to_thread(catalog_service.get_preview, preview_id)
    if not preview:
        raise HTTPException(status_code=404, detail="Preview not found")
    if preview.status != "ready" or not preview.file_path:
        raise HTTPException(status_code=404, detail="Preview is not available")
    return preview_file_response(
        request,
        Path(preview.file_path),
        preview.content_type,
        {"Cache-Control": "public, max-age=3600, immutable"},
    )
