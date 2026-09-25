#!/usr/bin/env python3
"""Archive and restore non-CERN components across the catalog epoch-2 cut.

The pre-epoch-2 database-library importer did not set ``external_source`` or
``external_id``.  Its first revision did, however, use the stable actor
``system:import_database_library``.  This tool uses that immutable provenance
to exclude the legacy CERN import while preserving every other component.

Export is read-only.  Restore requires an initialized epoch-2 catalog and
creates epoch-2 revisions/representations from the legacy active snapshots.
The complete legacy rows and referenced asset payloads remain in the archive
even when an old workflow state cannot be made valid under epoch-2 invariants.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Iterable


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
for candidate in (REPO_ROOT / "backend", REPO_ROOT):
    if (candidate / "app").is_dir():
        sys.path.insert(0, str(candidate))
        break


ARCHIVE_SCHEMA = "prism.legacy_catalog_survivors.a1"
ARCHIVE_MANIFEST = "manifest.json"
ARCHIVE_MANIFEST_HASH = "manifest.sha256"
LEGACY_CERN_ACTOR = "system:import_database_library"
DEFAULT_RAJESH_ACTOR = "rajesh@pixxel.co.in"
RESTORE_CONFIRMATION = "RESTORE-PRISM-LEGACY-SURVIVORS-EPOCH-2"
REVISION_MANIFEST_A3 = "prism.revision_manifest_a3"
RESTORE_ACTOR = "system:legacy_catalog_survivor_restore"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _dsn(value: str = "") -> str:
    configured = (value or os.environ.get("PRISM_DATABASE_URL", "")).strip()
    if not configured:
        raise ValueError("PRISM_DATABASE_URL is required")
    return configured.replace("postgresql+psycopg://", "postgresql://", 1)


def _projects_root(value: str = "") -> Path:
    configured = (value or os.environ.get("KICAD_PROJECTS_ROOT", "")).strip()
    if not configured:
        raise ValueError("KICAD_PROJECTS_ROOT or --projects-root is required")
    return Path(configured).expanduser().resolve()


def _json_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def _sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _row_dicts(rows: Iterable[Any]) -> list[dict[str, Any]]:
    return [dict(row) for row in rows]


def _table_exists(conn: Any, table: str) -> bool:
    row = conn.execute(
        "SELECT to_regclass(%s) AS relation",
        (f"catalog.{table}",),
    ).fetchone()
    return bool(row and row["relation"])


def _catalog_epoch(conn: Any) -> str:
    if not _table_exists(conn, "catalog_meta"):
        return ""
    row = conn.execute(
        "SELECT value FROM catalog.catalog_meta WHERE key = %s",
        ("catalog_schema_epoch",),
    ).fetchone()
    return str(row["value"]) if row else ""


def _active_revision_ids(component: dict[str, Any]) -> list[str]:
    result: list[str] = []
    for field in ("released_revision_id", "current_revision_id"):
        revision_id = str(component.get(field) or "")
        if revision_id and revision_id not in result:
            result.append(revision_id)
    return result


def _safe_relative_path(raw: str, *, fallback: str) -> str:
    candidate = PurePosixPath(raw.replace("\\", "/"))
    if candidate.is_absolute() or ".." in candidate.parts or not candidate.parts:
        return fallback
    return str(candidate)


def _asset_relative_path(asset: dict[str, Any], store_root: Path) -> str:
    source = Path(str(asset.get("canonical_path") or ""))
    try:
        relative = source.resolve().relative_to(store_root)
        return _safe_relative_path(relative.as_posix(), fallback="")
    except (OSError, ValueError):
        suffix = source.suffix or ".bin"
        fallback = f"legacy-survivors/{asset['sha256']}/{asset['id']}{suffix}"
        return _safe_relative_path(fallback, fallback=fallback)


def _legacy_origin_rows(conn: Any) -> list[dict[str, Any]]:
    return _row_dicts(
        conn.execute(
            """
            WITH first_revision AS (
                SELECT DISTINCT ON (component_id)
                    component_id, created_by AS original_creator
                FROM catalog.component_revisions
                ORDER BY component_id, version, created_at, id
            )
            SELECT c.*, first_revision.original_creator,
                   current_revision.created_by AS current_creator
            FROM catalog.components c
            JOIN first_revision ON first_revision.component_id = c.id
            JOIN catalog.component_revisions current_revision
              ON current_revision.id = c.current_revision_id
            ORDER BY c.id
            """
        ).fetchall()
    )


def classify_legacy_components(
    rows: list[dict[str, Any]],
    *,
    cern_actor: str = LEGACY_CERN_ACTOR,
    librarian_actor: str = DEFAULT_RAJESH_ACTOR,
) -> dict[str, Any]:
    excluded = [row for row in rows if str(row.get("original_creator") or "") == cern_actor]
    survivors = [row for row in rows if str(row.get("original_creator") or "") != cern_actor]
    librarian_impacted = [
        row
        for row in survivors
        if librarian_actor
        and librarian_actor
        in {
            str(row.get("original_creator") or ""),
            str(row.get("current_creator") or ""),
        }
    ]
    return {
        "total_components": len(rows),
        "excluded_cern_components": len(excluded),
        "survivor_components": len(survivors),
        "librarian_impacted_components": len(librarian_impacted),
        "survivor_ids": [str(row["id"]) for row in survivors],
        "librarian_impacted_ids": [str(row["id"]) for row in librarian_impacted],
    }


def _enforce_expected(label: str, actual: int, expected: int) -> None:
    if expected and actual != expected:
        raise ValueError(f"Expected {expected} {label}, found {actual}; refusing to continue")


def _rows_for_components(conn: Any, table: str, component_ids: list[str]) -> list[dict[str, Any]]:
    if not component_ids or not _table_exists(conn, table):
        return []
    return _row_dicts(
        conn.execute(
            f"SELECT * FROM catalog.{table} WHERE component_id = ANY(%s) ORDER BY component_id",
            (component_ids,),
        ).fetchall()
    )


def _export_manifest(
    conn: Any,
    *,
    projects_root: Path,
    librarian_actor: str,
    expected_survivors: int,
    expected_librarian: int,
    expected_excluded: int,
) -> tuple[dict[str, Any], dict[str, bytes]]:
    if not _table_exists(conn, "components"):
        raise ValueError("Catalog components table does not exist")
    epoch = _catalog_epoch(conn)
    if epoch == "2" or _table_exists(conn, "revision_representations"):
        raise ValueError("Export is only valid for a populated pre-epoch-2 catalog")

    origins = _legacy_origin_rows(conn)
    classification = classify_legacy_components(origins, librarian_actor=librarian_actor)
    _enforce_expected("survivor components", classification["survivor_components"], expected_survivors)
    _enforce_expected(
        "librarian-impacted components",
        classification["librarian_impacted_components"],
        expected_librarian,
    )
    _enforce_expected("excluded CERN components", classification["excluded_cern_components"], expected_excluded)
    if not classification["survivor_components"]:
        raise ValueError("No non-CERN survivor components were found")

    component_ids = classification["survivor_ids"]
    origin_by_id = {str(row["id"]): row for row in origins}
    components = [origin_by_id[component_id] for component_id in component_ids]
    revisions = _rows_for_components(conn, "component_revisions", component_ids)
    revision_ids = [str(row["id"]) for row in revisions]
    revision_assets = _row_dicts(
        conn.execute(
            "SELECT * FROM catalog.revision_assets WHERE revision_id = ANY(%s) ORDER BY revision_id, asset_id",
            (revision_ids,),
        ).fetchall()
    ) if revision_ids else []
    asset_ids = sorted({str(row["asset_id"]) for row in revision_assets})
    assets = _row_dicts(
        conn.execute(
            "SELECT * FROM catalog.assets WHERE id = ANY(%s) ORDER BY id",
            (asset_ids,),
        ).fetchall()
    ) if asset_ids else []

    store_root = projects_root / ".kicad-prism" / "components"
    payloads: dict[str, bytes] = {}
    for asset in assets:
        path = Path(str(asset.get("canonical_path") or ""))
        if not path.is_file():
            raise ValueError(f"Asset {asset['id']} is missing its canonical file: {path}")
        payload = path.read_bytes()
        actual_hash = _sha256_bytes(payload)
        expected_hash = str(asset.get("sha256") or "")
        if actual_hash != expected_hash:
            raise ValueError(
                f"Asset {asset['id']} hash mismatch: database={expected_hash}, file={actual_hash}"
            )
        if int(asset.get("size_bytes") or 0) != len(payload):
            raise ValueError(f"Asset {asset['id']} size does not match its database row")
        archive_path = f"payloads/{actual_hash}"
        payloads.setdefault(archive_path, payload)
        asset["archive_path"] = archive_path
        asset["store_relative_path"] = _asset_relative_path(asset, store_root)

    active_revision_ids = sorted(
        {
            revision_id
            for component in components
            for revision_id in _active_revision_ids(component)
        }
    )
    missing_active = sorted(set(active_revision_ids) - {str(row["id"]) for row in revisions})
    if missing_active:
        raise ValueError(f"Active revisions missing from export: {', '.join(missing_active[:10])}")

    manifest = {
        "schema": ARCHIVE_SCHEMA,
        "created_at": _utc_now_iso(),
        "source": {
            "catalog_epoch": epoch or "pre-2",
            "projects_root": str(projects_root),
            "cern_classifier": {"first_revision_created_by": LEGACY_CERN_ACTOR},
            "librarian_actor": librarian_actor,
        },
        "summary": {
            **{key: value for key, value in classification.items() if not key.endswith("_ids")},
            "revisions_archived": len(revisions),
            "active_revisions_to_restore": len(active_revision_ids),
            "assets_archived": len(assets),
            "payloads_archived": len(payloads),
        },
        "librarian_impacted_ids": classification["librarian_impacted_ids"],
        "components": components,
        "revisions": revisions,
        "revision_assets": revision_assets,
        "assets": assets,
        "catalog_audit_events": _rows_for_components(conn, "catalog_audit_events", component_ids),
        "component_review_decisions": _rows_for_components(conn, "component_review_decisions", component_ids),
        "component_release_records": _rows_for_components(conn, "component_release_records", component_ids),
        "component_usage": _rows_for_components(conn, "component_usage", component_ids),
    }
    return manifest, payloads


def write_archive(path: Path, manifest: dict[str, Any], payloads: dict[str, bytes]) -> None:
    output = path.expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    manifest_payload = _json_bytes(manifest)
    temporary = output.with_suffix(output.suffix + ".tmp")
    temporary.unlink(missing_ok=True)
    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            archive.writestr(ARCHIVE_MANIFEST, manifest_payload)
            archive.writestr(ARCHIVE_MANIFEST_HASH, _sha256_bytes(manifest_payload) + "\n")
            for name, payload in sorted(payloads.items()):
                archive.writestr(name, payload)
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)


def read_archive(path: Path) -> tuple[dict[str, Any], dict[str, bytes]]:
    source = path.expanduser().resolve()
    if not source.is_file():
        raise ValueError(f"Archive does not exist: {source}")
    with zipfile.ZipFile(source, "r") as archive:
        names = archive.namelist()
        for name in names:
            safe = PurePosixPath(name)
            if safe.is_absolute() or ".." in safe.parts:
                raise ValueError(f"Unsafe archive path: {name}")
        if ARCHIVE_MANIFEST not in names or ARCHIVE_MANIFEST_HASH not in names:
            raise ValueError("Archive manifest or manifest checksum is missing")
        manifest_payload = archive.read(ARCHIVE_MANIFEST)
        expected_manifest_hash = archive.read(ARCHIVE_MANIFEST_HASH).decode("ascii").strip()
        if _sha256_bytes(manifest_payload) != expected_manifest_hash:
            raise ValueError("Archive manifest checksum does not match")
        manifest = json.loads(manifest_payload)
        if manifest.get("schema") != ARCHIVE_SCHEMA:
            raise ValueError(f"Unsupported survivor archive schema: {manifest.get('schema')}")
        payloads: dict[str, bytes] = {}
        for asset in manifest.get("assets", []):
            archive_path = str(asset.get("archive_path") or "")
            if archive_path not in names:
                raise ValueError(f"Archive payload is missing for asset {asset.get('id')}")
            payload = archive.read(archive_path)
            if _sha256_bytes(payload) != str(asset.get("sha256") or ""):
                raise ValueError(f"Archive payload checksum failed for asset {asset.get('id')}")
            if len(payload) != int(asset.get("size_bytes") or 0):
                raise ValueError(f"Archive payload size failed for asset {asset.get('id')}")
            payloads.setdefault(archive_path, payload)
    return manifest, payloads


def _normalize_identity(value: Any) -> str:
    return str(value or "").strip().casefold()


def _json_object(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    try:
        loaded = json.loads(str(value or "{}"))
    except json.JSONDecodeError:
        return {}
    return dict(loaded) if isinstance(loaded, dict) else {}


def _component_restore_plan(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    revisions = {str(row["id"]): dict(row) for row in manifest.get("revisions", [])}
    links_by_revision: dict[str, list[dict[str, Any]]] = {}
    for link in manifest.get("revision_assets", []):
        links_by_revision.setdefault(str(link["revision_id"]), []).append(dict(link))

    plans: list[dict[str, Any]] = []
    identity_keys: dict[tuple[str, str, str, str], str] = {}
    for component in manifest.get("components", []):
        component = dict(component)
        active_ids = _active_revision_ids(component)
        active = [revisions[revision_id] for revision_id in active_ids if revision_id in revisions]
        if not active or str(component.get("current_revision_id") or "") not in revisions:
            raise ValueError(f"Component {component.get('id')} has no archived current revision")
        current = revisions[str(component["current_revision_id"])]
        manufacturer = str(current.get("manufacturer") or "").strip()
        mpn = str(current.get("mpn") or "").strip()
        if manufacturer and mpn:
            identity_kind = "mpn"
            identity_source = ""
            normalized_manufacturer = _normalize_identity(manufacturer)
            normalized_part_number = _normalize_identity(mpn)
            source_ipn = ""
        else:
            identity_kind = "provisional_ipn"
            original_creator = str(component.get("original_creator") or "unknown").strip().casefold()
            identity_source = f"legacy:{original_creator}"
            source_ipn = str(current.get("name") or component.get("slug") or component["id"]).strip()
            normalized_manufacturer = ""
            normalized_part_number = _normalize_identity(source_ipn)
        key = (identity_kind, identity_source, normalized_manufacturer, normalized_part_number)
        existing = identity_keys.get(key)
        if existing:
            raise ValueError(
                f"Survivor identity collision between {existing} and {component['id']}: {key}"
            )
        identity_keys[key] = str(component["id"])

        active_plans: list[dict[str, Any]] = []
        for revision in sorted(active, key=lambda item: (int(item.get("version") or 0), str(item["id"]))):
            links = links_by_revision.get(str(revision["id"]), [])
            symbols = [link for link in links if str(link.get("asset_type")) == "symbol"]
            footprints = [link for link in links if str(link.get("asset_type")) == "footprint"]
            if len(symbols) > 1 or len(footprints) > 1:
                raise ValueError(
                    f"Legacy revision {revision['id']} has multiple symbol or footprint assets; "
                    "pairing cannot be inferred safely"
                )
            complete = bool(symbols and footprints)
            requested_status = str(revision.get("release_status") or "open")
            restored_status = requested_status
            adjustment = ""
            if identity_kind == "provisional_ipn" and requested_status in {"done", "released"}:
                restored_status = "open"
                adjustment = "provisional components cannot be finalized"
            elif not complete and requested_status == "released":
                restored_status = "open"
                adjustment = "released revisions require a complete representation"
            active_plans.append(
                {
                    "revision": revision,
                    "links": links,
                    "symbol_asset_id": str(symbols[0]["asset_id"]) if symbols else "",
                    "footprint_asset_id": str(footprints[0]["asset_id"]) if footprints else "",
                    "complete": complete,
                    "requested_status": requested_status,
                    "restored_status": restored_status,
                    "status_adjustment": adjustment,
                }
            )
        plans.append(
            {
                "component": component,
                "current": current,
                "active_revisions": active_plans,
                "identity_kind": identity_kind,
                "identity_source": identity_source,
                "normalized_manufacturer": normalized_manufacturer,
                "normalized_part_number": normalized_part_number,
                "source_internal_part_number": source_ipn,
            }
        )
    return plans


def _preflight_destination(conn: Any, plans: list[dict[str, Any]]) -> None:
    if _catalog_epoch(conn) != "2" or not _table_exists(conn, "revision_representations"):
        raise ValueError("Restore requires an initialized catalog schema epoch 2")
    for plan in plans:
        component = plan["component"]
        if conn.execute("SELECT 1 FROM catalog.components WHERE id = %s", (component["id"],)).fetchone():
            raise ValueError(f"Destination already contains component ID {component['id']}")
        if conn.execute("SELECT 1 FROM catalog.components WHERE slug = %s", (component["slug"],)).fetchone():
            raise ValueError(f"Destination already contains component slug {component['slug']}")
        existing = conn.execute(
            """
            SELECT id FROM catalog.components
            WHERE identity_kind = %s AND identity_source = %s
              AND normalized_manufacturer = %s AND normalized_part_number = %s
            LIMIT 1
            """,
            (
                plan["identity_kind"],
                plan["identity_source"],
                plan["normalized_manufacturer"],
                plan["normalized_part_number"],
            ),
        ).fetchone()
        if existing:
            raise ValueError(
                f"Destination identity collision for survivor {component['id']} with {existing['id']}"
            )


def _permanent_asset_path(store_root: Path, asset: dict[str, Any]) -> Path:
    fallback = f"legacy-survivors/{asset['sha256']}/{asset['id']}{Path(str(asset.get('name') or '')).suffix or '.bin'}"
    # Keep restored files in their own namespace. Reusing a legacy canonical
    # path could let the subsequent CERN import overwrite a survivor asset that
    # happens to share a library/name path but not its bytes.
    relative = _safe_relative_path(fallback, fallback=fallback)
    candidate = (store_root / relative).resolve()
    try:
        candidate.relative_to(store_root.resolve())
    except ValueError as exc:
        raise ValueError(f"Asset restore path escapes the component store: {relative}") from exc
    return candidate


def _restore_asset_payloads(
    service: Any,
    conn: Any,
    *,
    manifest: dict[str, Any],
    payloads: dict[str, bytes],
    required_asset_ids: set[str],
) -> dict[str, str]:
    mapping: dict[str, str] = {}
    assets = {str(row["id"]): dict(row) for row in manifest.get("assets", [])}
    for legacy_id in sorted(required_asset_ids):
        asset = assets.get(legacy_id)
        if not asset:
            raise ValueError(f"Archived active revision references missing asset {legacy_id}")
        payload = payloads[str(asset["archive_path"])]
        destination = _permanent_asset_path(Path(service.store_root), asset)
        if destination.is_file() and _sha256_file(destination) != str(asset["sha256"]):
            destination = (
                Path(service.store_root)
                / "revisions"
                / str(asset["sha256"])
                / destination.name
            )
        destination.parent.mkdir(parents=True, exist_ok=True)
        if not destination.exists():
            destination.write_bytes(payload)
        if _sha256_file(destination) != str(asset["sha256"]):
            raise ValueError(f"Restored asset checksum failed at {destination}")
        registered = service.asset_registry.register_asset(
            service.runtime,
            conn,
            asset_type=str(asset["asset_type"]),
            canonical_path=destination,
            target_library=str(asset.get("target_library") or ""),
            target_name=str(asset.get("target_name") or ""),
            source_group=str(asset.get("source_group") or "legacy-survivor"),
        )
        mapping[legacy_id] = str(registered["id"])
    return mapping


def _revision_insert_values(revision: dict[str, Any], plan: dict[str, Any]) -> tuple[Any, ...]:
    extra_fields = _json_object(revision.get("extra_fields"))
    extra_fields.update(
        {
            "Legacy Prism Revision ID": str(revision["id"]),
            "Legacy Migration Source": ARCHIVE_SCHEMA,
        }
    )
    normalized_manufacturer = _normalize_identity(revision.get("manufacturer"))
    normalized_mpn = _normalize_identity(revision.get("mpn"))
    return (
        revision["id"],
        plan["component"]["id"],
        0,  # assigned by caller
        "",
        "migration",
        "Restored from pre-epoch-2 survivor archive",
        str(revision.get("created_by") or RESTORE_ACTOR),
        "",
        REVISION_MANIFEST_A3,
        "open",
        str(revision.get("name") or ""),
        str(revision.get("value") or ""),
        str(revision.get("description") or ""),
        str(revision.get("datasheet_url") or ""),
        str(revision.get("manufacturer") or ""),
        str(revision.get("mpn") or "") if plan["identity_kind"] == "mpn" else "",
        normalized_manufacturer if plan["identity_kind"] == "mpn" else "",
        normalized_mpn if plan["identity_kind"] == "mpn" else "",
        "manufacturer" if plan["identity_kind"] == "mpn" else "provisional_ipn",
        str(revision.get("category") or ""),
        str(revision.get("package_name") or ""),
        str(revision.get("vendor") or ""),
        str(revision.get("vendor_part_number") or ""),
        str(revision.get("mass_g") or ""),
        str(revision.get("rqjc_c_w") or ""),
        str(revision.get("rqjc_top_c_w") or ""),
        str(revision.get("temp_max_c") or ""),
        str(revision.get("temp_min_c") or ""),
        str(revision.get("power_dissipation_w") or ""),
        str(revision.get("rate") or ""),
        str(revision.get("sap_code") or ""),
        str(revision.get("summary") or revision.get("description") or ""),
        str(revision.get("keywords") or "[]"),
        json.dumps(extra_fields, sort_keys=True, separators=(",", ":")),
        str(revision.get("search_document") or ""),
        str(revision.get("created_at") or _utc_now_iso()),
        _utc_now_iso(),
    )


def _insert_restored_component(
    service: Any,
    conn: Any,
    *,
    plan: dict[str, Any],
    asset_mapping: dict[str, str],
) -> dict[str, Any]:
    component = plan["component"]
    now = _utc_now_iso()
    external_source = str(component.get("external_source") or "")
    external_id = str(component.get("external_id") or "")
    if str(component.get("original_creator") or "") == "system:import_footprint_library":
        external_source = external_source or "legacy-footprint-library"
        external_id = external_id or f"legacy:{component['id']}"
    conn.execute(
        """
        INSERT INTO catalog.components (
            id, slug, identity_kind, identity_source, normalized_manufacturer,
            normalized_part_number, source, external_source, external_id,
            external_workflow_source, external_workflow_id, external_workflow_url,
            external_url, external_payload_json, external_updated_at, sync_status, sync_error,
            is_active, current_revision_id, released_revision_id, created_at, updated_at
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
            %s, '', '', %s, %s
        )
        """,
        (
            component["id"],
            component["slug"],
            plan["identity_kind"],
            plan["identity_source"],
            plan["normalized_manufacturer"],
            plan["normalized_part_number"],
            str(component.get("source") or "manual"),
            external_source,
            external_id,
            str(component.get("external_workflow_source") or ""),
            str(component.get("external_workflow_id") or ""),
            str(component.get("external_workflow_url") or ""),
            str(component.get("external_url") or ""),
            str(component.get("external_payload_json") or "{}"),
            component.get("external_updated_at"),
            str(component.get("sync_status") or ""),
            str(component.get("sync_error") or ""),
            int(component.get("is_active") or 0),
            str(component.get("created_at") or now),
            now,
        ),
    )

    restored_revision_ids: list[str] = []
    released_revision_id = ""
    current_revision_id = ""
    adjustments: list[dict[str, str]] = []
    parent_id = ""
    for version, revision_plan in enumerate(plan["active_revisions"], start=1):
        revision = revision_plan["revision"]
        values = list(_revision_insert_values(revision, plan))
        values[2] = version
        values[3] = parent_id
        conn.execute(
            """
            INSERT INTO catalog.component_revisions (
                id, component_id, version, parent_revision_id, change_kind, change_summary, created_by,
                manifest_hash, manifest_schema, release_status, name, value, description, datasheet_url,
                manufacturer, mpn, normalized_manufacturer, normalized_mpn, mpn_source,
                category, package_name, vendor, vendor_part_number, mass_g, rqjc_c_w, rqjc_top_c_w,
                temp_max_c, temp_min_c, power_dissipation_w, rate, sap_code, summary, keywords,
                extra_fields, search_document, created_at, updated_at
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            )
            """,
            tuple(values),
        )
        revision_id = str(revision["id"])
        for link in revision_plan["links"]:
            mapped_asset_id = asset_mapping[str(link["asset_id"])]
            conn.execute(
                """
                INSERT INTO catalog.revision_assets (
                    revision_id, asset_type, asset_id, required, created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    revision_id,
                    link["asset_type"],
                    mapped_asset_id,
                    int(link.get("required") or 0),
                    str(link.get("created_at") or now),
                    now,
                ),
            )
        symbol_asset_id = asset_mapping.get(revision_plan["symbol_asset_id"], "")
        footprint_asset_id = asset_mapping.get(revision_plan["footprint_asset_id"], "")
        if symbol_asset_id or footprint_asset_id:
            conn.execute(
                """
                INSERT INTO catalog.revision_representations (
                    id, revision_id, label, symbol_asset_id, footprint_asset_id, is_default,
                    display_order, source_internal_part_number, provenance_json, created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, 1, 0, %s, %s, %s, %s)
                """,
                (
                    str(uuid.uuid4()),
                    revision_id,
                    "Legacy default",
                    symbol_asset_id or None,
                    footprint_asset_id or None,
                    plan["source_internal_part_number"] or str(revision.get("name") or ""),
                    json.dumps(
                        {
                            "migration": ARCHIVE_SCHEMA,
                            "legacy_component_id": component["id"],
                            "legacy_revision_id": revision_id,
                        },
                        sort_keys=True,
                        separators=(",", ":"),
                    ),
                    now,
                    now,
                ),
            )
        manifest_hash = service.revisions.revision_manifest_hash(conn, revision_id)
        restored_status = revision_plan["restored_status"]
        conn.execute(
            "UPDATE catalog.component_revisions SET manifest_hash = %s, release_status = %s, updated_at = %s WHERE id = %s",
            (manifest_hash, restored_status, now, revision_id),
        )
        service.revisions.append_audit_event(
            conn,
            component_id=str(component["id"]),
            revision_id=revision_id,
            event_type="component.legacy_restored",
            actor=RESTORE_ACTOR,
            details={
                "archive_schema": ARCHIVE_SCHEMA,
                "legacy_revision_id": revision_id,
                "original_creator": str(revision.get("created_by") or ""),
                "requested_status": revision_plan["requested_status"],
                "restored_status": restored_status,
                "manifest_hash": manifest_hash,
            },
        )
        if restored_status == "released":
            released_revision_id = revision_id
            conn.execute(
                """
                INSERT INTO catalog.component_release_records (
                    id, component_id, revision_id, release_label, manifest_hash, released_by,
                    approval_decision_id, validation_json, policy_json, created_at
                ) VALUES (%s, %s, %s, %s, %s, %s, '', '{}', %s, %s)
                """,
                (
                    str(uuid.uuid4()),
                    component["id"],
                    revision_id,
                    f"legacy-v{version}",
                    manifest_hash,
                    RESTORE_ACTOR,
                    json.dumps({"trusted_legacy_restore": True}, separators=(",", ":")),
                    now,
                ),
            )
        if revision_plan["status_adjustment"]:
            adjustments.append(
                {
                    "revision_id": revision_id,
                    "from": revision_plan["requested_status"],
                    "to": restored_status,
                    "reason": revision_plan["status_adjustment"],
                }
            )
        restored_revision_ids.append(revision_id)
        parent_id = revision_id
        if revision_id == str(component.get("current_revision_id") or ""):
            current_revision_id = revision_id

    if not current_revision_id:
        raise ValueError(f"Current revision was not restored for component {component['id']}")
    if released_revision_id and released_revision_id not in restored_revision_ids:
        raise ValueError(f"Released revision was not restored for component {component['id']}")
    conn.execute(
        "UPDATE catalog.components SET current_revision_id = %s, released_revision_id = %s, updated_at = %s WHERE id = %s",
        (current_revision_id, released_revision_id, now, component["id"]),
    )

    stock_quantity = float(component.get("stock_quantity") or 0)
    stock_uom = str(component.get("stock_uom") or "")
    inventory_status = str(component.get("inventory_status") or "")
    last_synced_at = component.get("last_synced_at")
    if stock_quantity or stock_uom or inventory_status or last_synced_at:
        conn.execute(
            """
            INSERT INTO catalog.inventory_levels (
                source, component_id, location_key, source_record_id, quantity, uom,
                inventory_status, fetch_status, fetched_at, updated_at
            ) VALUES ('legacy-local', %s, '', %s, %s, %s, %s, 'ok', %s, %s)
            """,
            (
                component["id"],
                str(component["id"]),
                stock_quantity,
                stock_uom,
                inventory_status,
                str(last_synced_at or now),
                now,
            ),
        )
    return {"component_id": str(component["id"]), "adjustments": adjustments}


def _restore_usage(conn: Any, manifest: dict[str, Any], restored_ids: set[str]) -> int:
    restored = 0
    for row in manifest.get("component_usage", []):
        if str(row.get("component_id") or "") not in restored_ids:
            continue
        conn.execute(
            """
            INSERT INTO catalog.component_usage (
                id, component_id, project_id, source_revision, references_json, details_json,
                source, is_current, first_seen_at, last_seen_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT(component_id, project_id, source_revision) DO NOTHING
            """,
            (
                row["id"],
                row["component_id"],
                row["project_id"],
                str(row.get("source_revision") or ""),
                str(row.get("references_json") or "[]"),
                str(row.get("details_json") or "[]"),
                str(row.get("source") or "project_import"),
                int(row.get("is_current") or 0),
                row["first_seen_at"],
                row["last_seen_at"],
            ),
        )
        restored += 1
    return restored


def _load_runtime() -> Any:
    try:
        from app.services.component_catalog_service_postgres import (  # noqa: PLC0415
            ComponentCatalogPostgresService,
        )
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "Backend dependencies are unavailable; run inside the backend container or virtualenv"
        ) from exc
    return ComponentCatalogPostgresService


def export_archive(args: argparse.Namespace) -> dict[str, Any]:
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ModuleNotFoundError as exc:
        raise RuntimeError("psycopg is required; run inside the backend container") from exc
    with psycopg.connect(_dsn(args.database_url), row_factory=dict_row, autocommit=False) as conn:
        conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        conn.execute(
            "SELECT pg_advisory_xact_lock(hashtext(%s))",
            ("prism-component-catalog-schema",),
        )
        conn.execute("SET search_path TO catalog, public")
        manifest, payloads = _export_manifest(
            conn,
            projects_root=_projects_root(args.projects_root),
            librarian_actor=args.librarian_actor,
            expected_survivors=args.expect_survivors,
            expected_librarian=args.expect_librarian,
            expected_excluded=args.expect_excluded_cern,
        )
        conn.rollback()
    write_archive(args.output, manifest, payloads)
    return {**manifest["summary"], "archive": str(args.output.expanduser().resolve())}


def verify_archive(args: argparse.Namespace) -> dict[str, Any]:
    manifest, payloads = read_archive(args.archive)
    plans = _component_restore_plan(manifest)
    return {
        **manifest["summary"],
        "restore_plans": len(plans),
        "verified_payloads": len(payloads),
        "archive": str(args.archive.expanduser().resolve()),
    }


def check_cern_report(args: argparse.Namespace) -> dict[str, Any]:
    manifest, _ = read_archive(args.archive)
    plans = _component_restore_plan(manifest)
    report_path = args.report.expanduser().resolve()
    try:
        report = json.loads(report_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Unable to read CERN preflight report {report_path}: {exc}") from exc
    if not report.get("dry_run"):
        raise ValueError("CERN report must come from import_database_library.py --dry-run")
    hard_conflicts = list(report.get("hard_conflicts") or [])
    if hard_conflicts:
        raise ValueError(f"CERN report contains {len(hard_conflicts)} hard conflicts")

    survivors = {
        (plan["normalized_manufacturer"], plan["normalized_part_number"]): str(plan["component"]["id"])
        for plan in plans
        if plan["identity_kind"] == "mpn"
    }
    collisions: list[dict[str, str]] = []
    for group in report.get("groups", []):
        if str(group.get("identity_kind") or "") != "mpn":
            continue
        key = (
            _normalize_identity(group.get("manufacturer")),
            _normalize_identity(group.get("mpn")),
        )
        survivor_id = survivors.get(key)
        if survivor_id:
            collisions.append(
                {
                    "survivor_component_id": survivor_id,
                    "manufacturer": str(group.get("manufacturer") or ""),
                    "mpn": str(group.get("mpn") or ""),
                    "cern_internal_part_number": str(group.get("canonical_internal_part_number") or ""),
                }
            )
    result = {
        "archive": str(args.archive.expanduser().resolve()),
        "cern_report": str(report_path),
        "survivor_real_identities": len(survivors),
        "cern_groups": len(report.get("groups") or []),
        "identity_collisions": collisions,
    }
    if collisions:
        preview = ", ".join(
            f"{item['manufacturer']} / {item['mpn']}" for item in collisions[:10]
        )
        raise ValueError(
            f"CERN preflight collides with {len(collisions)} survivor identities: {preview}"
        )
    return result


def restore_archive(args: argparse.Namespace) -> dict[str, Any]:
    if args.confirm != RESTORE_CONFIRMATION:
        raise ValueError(f"--confirm must be exactly {RESTORE_CONFIRMATION}")
    manifest, payloads = read_archive(args.archive)
    plans = _component_restore_plan(manifest)
    _enforce_expected("archive survivor components", len(plans), args.expect_components)

    service_class = _load_runtime()
    service = service_class(database_url=_dsn(args.database_url))
    service.initialize()
    with service.connection() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", ("prism-component-catalog-schema",))
        _preflight_destination(conn, plans)
        if args.dry_run:
            conn.rollback()
            return {
                **manifest["summary"],
                "restore_plans": len(plans),
                "dry_run": True,
                "archive": str(args.archive.expanduser().resolve()),
            }

        required_asset_ids = {
            str(link["asset_id"])
            for plan in plans
            for revision_plan in plan["active_revisions"]
            for link in revision_plan["links"]
        }
        asset_mapping = _restore_asset_payloads(
            service,
            conn,
            manifest=manifest,
            payloads=payloads,
            required_asset_ids=required_asset_ids,
        )
        restored: list[dict[str, Any]] = []
        for plan in plans:
            restored.append(
                _insert_restored_component(
                    service,
                    conn,
                    plan=plan,
                    asset_mapping=asset_mapping,
                )
            )
        usage_restored = _restore_usage(
            conn,
            manifest,
            {item["component_id"] for item in restored},
        )
        conn.commit()

    adjustment_count = sum(len(item["adjustments"]) for item in restored)
    return {
        **manifest["summary"],
        "components_restored": len(restored),
        "active_assets_restored": len(asset_mapping),
        "usage_rows_restored": usage_restored,
        "workflow_status_adjustments": adjustment_count,
        "adjustments": [
            {"component_id": item["component_id"], **adjustment}
            for item in restored
            for adjustment in item["adjustments"]
        ],
        "dry_run": False,
        "archive": str(args.archive.expanduser().resolve()),
    }


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Preserve non-CERN components across the destructive catalog epoch-2 cut."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    export_parser = subparsers.add_parser("export", help="Archive non-CERN components from a legacy catalog")
    export_parser.add_argument("--output", type=Path, required=True)
    export_parser.add_argument("--database-url", default="")
    export_parser.add_argument("--projects-root", default="")
    export_parser.add_argument("--librarian-actor", default=DEFAULT_RAJESH_ACTOR)
    export_parser.add_argument("--expect-survivors", type=int, default=0)
    export_parser.add_argument("--expect-librarian", type=int, default=0)
    export_parser.add_argument("--expect-excluded-cern", type=int, default=0)
    export_parser.set_defaults(handler=export_archive)

    verify_parser = subparsers.add_parser("verify", help="Verify archive checksums and restore planning")
    verify_parser.add_argument("archive", type=Path)
    verify_parser.set_defaults(handler=verify_archive)

    collision_parser = subparsers.add_parser(
        "check-cern-report",
        help="Fail if a dry-run CERN import report collides with survivor identities",
    )
    collision_parser.add_argument("archive", type=Path)
    collision_parser.add_argument("report", type=Path)
    collision_parser.set_defaults(handler=check_cern_report)

    restore_parser = subparsers.add_parser("restore", help="Restore survivors into an initialized epoch-2 catalog")
    restore_parser.add_argument("archive", type=Path)
    restore_parser.add_argument("--database-url", default="")
    restore_parser.add_argument("--confirm", required=True)
    restore_parser.add_argument("--expect-components", type=int, default=0)
    restore_parser.add_argument("--dry-run", action="store_true")
    restore_parser.set_defaults(handler=restore_archive)
    return parser


def main() -> int:
    args = _build_parser().parse_args()
    try:
        report = args.handler(args)
    except (OSError, RuntimeError, ValueError, zipfile.BadZipFile) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
