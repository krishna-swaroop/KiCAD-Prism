from __future__ import annotations

import asyncio
import hashlib
import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response

from app.core.security import AuthenticatedUser, require_remote_symbol_reader
from app.services import provider_auth_service
from app.services.component_catalog_service import catalog_service
from app.services.public_url_service import resolve_public_base_url

router = APIRouter()

STATIC_DIR = Path(__file__).resolve().parent.parent / "static" / "remote_provider"


def _provider_origin(request: Request) -> str:
    return resolve_public_base_url(request)


def _component_payload(component: dict, origin: str) -> dict:
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
    return {
        "id": component["id"],
        "slug": component["slug"],
        "name": component["name"],
        "manufacturer": component["manufacturer"],
        "mpn": component["mpn"],
        "description": component["description"],
        "package_name": component["package_name"],
        "category": component["category"],
        "datasheet_url": component["datasheet_url"],
        "summary": component["summary"],
        "version": component["version"],
        "library_name": component["library_name"],
        "symbol_name": component["symbol_name"],
        "assets": component["assets"],
        "availability_state": component["availability_state"],
        "missing_assets": component["missing_assets"],
        "place_enabled": component["place_enabled"],
        "release_status": component.get("release_status", ""),
        "workflow_stage": component.get("workflow_stage", component.get("release_status", "")),
        "stock_quantity": component["stock_quantity"],
        "stock_uom": component["stock_uom"],
        "inventory_status": component["inventory_status"],
        "preview_status": preview_status,
        "symbol_preview_url": preview_map.get("symbol", ""),
        "footprint_preview_url": preview_map.get("footprint", ""),
        "manifest_url": f"{origin}/api/remote-provider/parts/{component['id']}",
        "inline_url": f"{origin}/api/remote-provider/components/{component['id']}/inline",
    }


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
        "provider_version": "0.1.0",
        "api_base_url": base_url,
        "panel_url": f"{base_url}/remote-provider/panel",
        "auth": auth_metadata,
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


@router.get("/remote-provider/panel", response_class=HTMLResponse, include_in_schema=False)
async def provider_panel():
    html_path = STATIC_DIR / "panel.html"
    if not html_path.is_file():
        html_path = STATIC_DIR / "index.html"
    return HTMLResponse(html_path.read_text(encoding="utf-8"))


@router.get("/remote-provider/assets/{asset_name:path}", include_in_schema=False)
async def provider_static_asset(asset_name: str):
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
    return FileResponse(
        asset_path,
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.get("/api/remote-provider/search")
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
    etag = _projection_etag(
        version,
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
    return JSONResponse({
        "items": [_component_payload(c, origin) for c in result["items"]],
        "total": result["total"],
        "has_more": result["has_more"],
        "page": result["page"],
        "pages": result["pages"],
        "page_size": result["page_size"],
    }, headers={"ETag": etag, "Cache-Control": "private, no-cache"})


@router.get("/api/remote-provider/categories")
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


@router.get("/api/remote-provider/components-by-category")
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
    etag = _projection_etag(
        version,
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
    return JSONResponse({
        "items": [_component_payload(c, origin) for c in result["items"]],
        "total": result["total"],
        "has_more": result["has_more"],
        "page": result["page"],
        "pages": result["pages"],
        "page_size": result["page_size"],
    }, headers={"ETag": etag, "Cache-Control": "private, no-cache"})

@router.get("/api/remote-provider/components/{component_id}")
async def get_component(
    component_id: str,
    request: Request,
    user: AuthenticatedUser = Depends(require_remote_symbol_reader),
):
    _ = user
    component = await asyncio.to_thread(
        catalog_service.get_component,
        component_id,
        include_inactive=False,
        released_only=True,
    )
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    return _component_payload(component, _provider_origin(request))


@router.get("/api/remote-provider/parts/{part_id}")
async def get_part_manifest(
    part_id: str,
    request: Request,
    user: AuthenticatedUser = Depends(require_remote_symbol_reader),
):
    _ = user
    try:
        manifest = await asyncio.to_thread(catalog_service.build_manifest, part_id, _provider_origin(request))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if not manifest:
        raise HTTPException(status_code=404, detail="Component not found")
    return JSONResponse(manifest)


@router.get("/api/remote-provider/components/{component_id}/inline")
async def get_inline_component(
    component_id: str,
    user: AuthenticatedUser = Depends(require_remote_symbol_reader),
):
    _ = user
    try:
        bundle = await asyncio.to_thread(catalog_service.build_inline_bundle, component_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if not bundle:
        raise HTTPException(status_code=404, detail="Component not found")
    return JSONResponse(bundle)


@router.get("/api/remote-provider/assets/{asset_id}")
async def download_asset(asset_id: str, rev: str = Query(...), exp: int = Query(...), sig: str = Query(...)):
    if not catalog_service.validate_asset_signature(asset_id, rev, exp, sig):
        raise HTTPException(status_code=403, detail="Invalid or expired asset signature")

    asset = await asyncio.to_thread(catalog_service.get_asset_by_id, asset_id, revision_id=rev)
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


@router.get("/api/remote-provider/previews/{preview_id}")
async def download_preview(
    preview_id: str,
    user: AuthenticatedUser = Depends(require_remote_symbol_reader),
):
    _ = user
    preview = await asyncio.to_thread(catalog_service.get_preview, preview_id)
    if not preview:
        raise HTTPException(status_code=404, detail="Preview not found")
    if preview.status != "ready" or not preview.file_path:
        raise HTTPException(status_code=404, detail="Preview is not available")
    return FileResponse(
        preview.file_path,
        media_type=preview.content_type,
        headers={"Cache-Control": "public, max-age=3600, immutable"},
    )
