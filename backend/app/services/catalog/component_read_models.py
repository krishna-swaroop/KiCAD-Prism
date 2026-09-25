"""Connection-level component payload and read-model shaping for the catalog."""

from __future__ import annotations

from typing import Any, Mapping

from app.core.config import settings
from app.services.catalog.asset_types import PLACE_REQUIRED_ASSET_TYPES
from app.services.catalog.inventory_policy import aggregate_inventory_locations
from app.services.catalog.metadata_normalization import IDENTITY_KIND_MPN
from app.services.catalog.normalization import (
    json_loads,
    preview_base_kind,
    preview_unit,
    preview_unit_label,
)
from app.services.catalog.revision_kernel import CatalogRevisionKernel, normalize_workflow_stage


PREVIEW_STATUS_READY = "ready"

STATE_METADATA_ONLY = "metadata_only"
STATE_FILES_PARTIAL = "files_partial"
STATE_PLACE_READY = "place_ready"


def representation_slot_present(asset: dict[str, Any] | None) -> bool:
    """True when a representation symbol or footprint slot carries an asset id."""

    return bool(asset) and bool(str(asset.get("id") or "").strip())


def cad_availability(has_symbol: bool, has_footprint: bool) -> tuple[str, list[str]]:
    """Classify CAD completeness from the effective representation pair."""

    present = {"symbol": has_symbol, "footprint": has_footprint}
    missing = [kind for kind in PLACE_REQUIRED_ASSET_TYPES if not present[kind]]
    if not missing:
        return STATE_PLACE_READY, missing
    if len(missing) == 1:
        return STATE_FILES_PARTIAL, missing
    return STATE_METADATA_ONLY, missing


def remote_place_enabled(
    *,
    is_active: bool,
    identity_kind: str,
    missing_assets: list[str],
    release_status: str,
) -> bool:
    """Permission to place is separate from CAD completeness."""

    return (
        bool(is_active)
        and str(identity_kind or IDENTITY_KIND_MPN) == IDENTITY_KIND_MPN
        and not missing_assets
        and _release_allows_remote(release_status)
    )

# Availability sources shown in the remote-provider payload. Everything today
# is local inventory; distributor adapters (supply_quotes) extend
# SUPPLY_VENDOR_SOURCE_NAMES when they land.
SUPPLY_KIND_VENDOR = "vendor"
SUPPLY_KIND_LOCAL = "local"
SUPPLY_VENDOR_SOURCE_NAMES: dict[str, str] = {}
SUPPLY_LOCAL_SOURCE_NAMES: dict[str, str] = {
    "csv": "CSV",
    "inventree": "InvenTree",
    "sap": "SAP",
    "manufacturo": "Manufacturo",
    "partsdb": "PartsDB",
}

VALIDATION_STATUS_PASSED = "passed"
VALIDATION_STATUS_WARNING = "warning"
VALIDATION_STATUS_FAILED = "failed"
VALIDATION_STATUS_SKIPPED = "skipped"
VALIDATION_STATUS_NOT_RUN = "not_run"
KLC_RELEASE_GATE_VALUES = {"off", "warn", "block"}


# Distinguishes "inventory was not preloaded" from a legitimate empty result.
_PRELOAD_UNSET = object()

_INVENTORY_LOCATION_COLUMNS = (
    "component_id, source, location_key, quantity, uom, "
    "inventory_status, fetch_status, fetched_at"
)
# Must match inventory_policy.INVENTORY_SOURCE_PRIORITY (inventree, csv, then name).
_INVENTORY_LOCATION_ORDER = (
    "CASE source WHEN 'inventree' THEN 1 WHEN 'csv' THEN 2 ELSE 99 END, "
    "source, location_key"
)


def local_inventory_payload(row: Mapping[str, Any] | None) -> dict[str, Any] | None:
    """Shape the preferred inventory aggregate used by component payloads."""

    if row is None:
        return None
    return {
        "source": str(row["source"]),
        "quantity": float(row["quantity"] or 0),
        "uom": str(row["uom"] or ""),
        "inventory_status": str(row["inventory_status"] or ""),
        "fetch_status": str(row.get("fetch_status") or "ok"),
        "fetched_at": str(row["fetched_at"] or ""),
        "mixed_units": bool(row.get("mixed_units")),
        "mixed_status": bool(row.get("mixed_status")),
        "mixed_fetch": bool(row.get("mixed_fetch")),
        "mixed_freshness": bool(row.get("mixed_freshness")),
    }


def inventory_payloads_from_source_rows(
    rows: list[Mapping[str, Any]],
) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    """Return ``(local_inventory, supply_sources)`` from raw location rows.

    Aggregated mappings must not be re-aggregated: that loses mixed-data flags.
    """

    payloads = [item.as_payload_row() for item in aggregate_inventory_locations(rows)]
    return (
        local_inventory_payload(payloads[0]) if payloads else None,
        [supply_source_payload(row) for row in payloads],
    )


def supply_source_payload(row: dict[str, Any]) -> dict[str, Any]:
    """Shape one inventory source for the stable component payload."""

    source = str(row.get("source") or "")
    kind = SUPPLY_KIND_VENDOR if source in SUPPLY_VENDOR_SOURCE_NAMES else SUPPLY_KIND_LOCAL
    display_name = SUPPLY_VENDOR_SOURCE_NAMES.get(source) or SUPPLY_LOCAL_SOURCE_NAMES.get(
        source
    ) or source.replace("_", " ").title()
    return {
        "kind": kind,
        "id": source,
        "display_name": display_name,
        "stock": float(row.get("quantity") or 0),
        "uom": str(row.get("uom") or ""),
        "stock_status": str(row.get("inventory_status") or ""),
        "fetch_status": str(row.get("fetch_status") or "ok"),
        "fetched_at": str(row.get("fetched_at") or ""),
        "mixed_units": bool(row.get("mixed_units")),
        "mixed_status": bool(row.get("mixed_status")),
        "mixed_fetch": bool(row.get("mixed_fetch")),
        "mixed_freshness": bool(row.get("mixed_freshness")),
    }


def _release_allows_remote(release_status: str) -> bool:
    return release_status == "released"


def _klc_release_gate() -> str:
    gate = settings.CATALOG_KLC_RELEASE_GATE.strip().lower()
    return gate if gate in KLC_RELEASE_GATE_VALUES else "warn"


class CatalogComponentReadModels:
    """Shape component and revision reads using a caller-supplied connection."""

    def __init__(self, revision_kernel: CatalogRevisionKernel) -> None:
        self._revision_kernel = revision_kernel

    def load_representations_for_revision(
        self,
        conn: Any,
        revision_id: str,
        *,
        assets: list[dict[str, Any]] | None = None,
        previews: list[dict[str, Any]] | None = None,
    ) -> list[dict[str, Any]]:
        assets = (
            assets
            if assets is not None
            else self._revision_kernel.load_assets_for_revision(conn, revision_id)
        )
        previews = (
            previews
            if previews is not None
            else self.load_previews_for_revision(conn, revision_id)
        )
        rows = conn.execute(
            "SELECT * FROM revision_representations WHERE revision_id = %s "
            "ORDER BY display_order, id",
            (revision_id,),
        ).fetchall()
        return self._shape_representation_rows(rows, assets=assets, previews=previews)

    def load_representations_for_revisions(
        self,
        conn: Any,
        revision_ids: list[str],
        *,
        assets_by_revision: dict[str, list[dict[str, Any]]] | None = None,
        previews_by_revision: dict[str, list[dict[str, Any]]] | None = None,
    ) -> dict[str, list[dict[str, Any]]]:
        """Load every representation for ``revision_ids`` in one query."""

        assets_by_revision = assets_by_revision or {}
        previews_by_revision = previews_by_revision or {}
        shaped: dict[str, list[dict[str, Any]]] = {revision_id: [] for revision_id in revision_ids}
        if not revision_ids:
            return shaped
        placeholders = ",".join("%s" for _ in revision_ids)
        rows_by_revision: dict[str, list[Any]] = {revision_id: [] for revision_id in revision_ids}
        for row in conn.execute(
            f"SELECT * FROM revision_representations WHERE revision_id IN ({placeholders}) "
            "ORDER BY revision_id, display_order, id",
            tuple(revision_ids),
        ).fetchall():
            rows_by_revision.setdefault(str(row["revision_id"]), []).append(row)
        for revision_id, rows in rows_by_revision.items():
            shaped[revision_id] = self._shape_representation_rows(
                rows,
                assets=assets_by_revision.get(revision_id, []),
                previews=previews_by_revision.get(revision_id, []),
            )
        return shaped

    @staticmethod
    def _shape_representation_rows(
        rows: list[Any],
        *,
        assets: list[dict[str, Any]],
        previews: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        assets_by_id = {str(asset["id"]): asset for asset in assets}
        previews_by_asset: dict[str, list[dict[str, Any]]] = {}
        for preview in previews:
            previews_by_asset.setdefault(str(preview["asset_id"]), []).append(preview)

        def asset_payload(asset_id: Any) -> dict[str, Any] | None:
            asset = assets_by_id.get(str(asset_id or ""))
            if not asset:
                return None
            ready_preview = next(
                (
                    preview
                    for preview in previews_by_asset.get(str(asset["id"]), [])
                    if str(preview.get("status") or "") == PREVIEW_STATUS_READY
                ),
                None,
            )
            return {
                "id": str(asset["id"]),
                "asset_type": str(asset["asset_type"]),
                "name": str(asset["name"]),
                "target_library": str(asset["target_library"]),
                "target_name": str(asset["target_name"]),
                "sha256": str(asset["sha256"]),
                "preview_id": str(ready_preview["id"]) if ready_preview else "",
            }

        return [
            {
                "id": str(row["id"]),
                "revision_id": str(row["revision_id"]),
                "label": str(row["label"]),
                "symbol": asset_payload(row["symbol_asset_id"]),
                "footprint": asset_payload(row["footprint_asset_id"]),
                "is_default": bool(row["is_default"]),
                "display_order": int(row["display_order"]),
                "source_internal_part_number": str(row["source_internal_part_number"] or ""),
                "provenance": json_loads(row["provenance_json"], {}),
            }
            for row in rows
        ]

    def _load_inventory_locations(self, conn: Any, component_id: str) -> list[dict[str, Any]]:
        return [
            dict(row)
            for row in conn.execute(
                f"""
                SELECT {_INVENTORY_LOCATION_COLUMNS}
                FROM inventory_levels
                WHERE component_id = %s
                ORDER BY {_INVENTORY_LOCATION_ORDER}
                """,
                (component_id,),
            ).fetchall()
        ]

    def local_inventory(self, conn: Any, component_id: str) -> dict[str, Any] | None:
        local, _ = inventory_payloads_from_source_rows(
            self._load_inventory_locations(conn, component_id)
        )
        return local

    def supply_sources(self, conn: Any, component_id: str) -> list[dict[str, Any]]:
        _, sources = inventory_payloads_from_source_rows(
            self._load_inventory_locations(conn, component_id)
        )
        return sources

    def load_inventory_for_components(
        self, conn: Any, component_ids: list[str]
    ) -> dict[str, list[dict[str, Any]]]:
        """Load raw inventory locations for many components in one query."""

        grouped: dict[str, list[dict[str, Any]]] = {component_id: [] for component_id in component_ids}
        if not component_ids:
            return grouped
        placeholders = ",".join("%s" for _ in component_ids)
        rows = conn.execute(
            f"""
            SELECT {_INVENTORY_LOCATION_COLUMNS}
            FROM inventory_levels
            WHERE component_id IN ({placeholders})
            ORDER BY component_id, {_INVENTORY_LOCATION_ORDER}
            """,
            tuple(component_ids),
        ).fetchall()
        for row in rows:
            grouped.setdefault(str(row["component_id"]), []).append(dict(row))
        return grouped

    def load_previews_for_assets(self, conn: Any, asset_ids: list[str]) -> list[dict[str, Any]]:
        if not asset_ids:
            return []
        placeholders = ",".join("%s" for _ in asset_ids)
        rows = conn.execute(
            f"SELECT * FROM asset_previews WHERE asset_id IN ({placeholders}) ORDER BY kind, updated_at DESC",
            tuple(asset_ids),
        ).fetchall()
        return [dict(row) for row in rows]

    def load_previews_for_revision(self, conn: Any, revision_id: str) -> list[dict[str, Any]]:
        output_rows = conn.execute(
            """
            SELECT preview.*
            FROM revision_preview_outputs link
            JOIN asset_preview_versions preview ON preview.id = link.preview_id
            JOIN revision_assets ra
              ON ra.revision_id = link.revision_id AND ra.asset_id = link.asset_id
            WHERE link.revision_id = %s
            """,
            (revision_id,),
        ).fetchall()
        evidence_rows = conn.execute(
            """
            SELECT preview.*
            FROM revision_previews link
            JOIN asset_preview_versions preview ON preview.id = link.preview_id
            JOIN revision_assets ra
              ON ra.revision_id = link.revision_id AND ra.asset_id = link.asset_id
            WHERE link.revision_id = %s
            """,
            (revision_id,),
        ).fetchall()
        # Preview outputs are regenerated derived data while revision_previews
        # are immutable legacy evidence. Compare their semantic (asset, kind,
        # unit) identity rather than their raw kind: old records may encode
        # Unit A as `symbol`, while regenerated records use `symbol:unit1`.
        # Returning both made the UI show two Unit A tabs.
        previews = {
            (str(row["asset_id"]), preview_base_kind(str(row["kind"])), preview_unit(str(row["kind"]))): dict(row)
            for row in evidence_rows
        }
        previews.update({
            (str(row["asset_id"]), preview_base_kind(str(row["kind"])), preview_unit(str(row["kind"]))): dict(row)
            for row in output_rows
        })
        return sorted(
            previews.values(),
            key=lambda row: (
                str(row["kind"]),
                str(row["asset_id"]),
                str(row["created_at"]),
                str(row["id"]),
            ),
        )

    def load_previews_for_revisions(
        self, conn: Any, revision_ids: list[str]
    ) -> list[dict[str, Any]]:
        if not revision_ids:
            return []
        placeholders = ",".join("%s" for _ in revision_ids)
        output_rows = conn.execute(
            f"""
            SELECT preview.*, link.revision_id
            FROM revision_preview_outputs link
            JOIN asset_preview_versions preview ON preview.id = link.preview_id
            JOIN revision_assets ra
              ON ra.revision_id = link.revision_id AND ra.asset_id = link.asset_id
            WHERE link.revision_id IN ({placeholders})
            """,
            tuple(revision_ids),
        ).fetchall()
        evidence_rows = conn.execute(
            f"""
            SELECT preview.*, link.revision_id
            FROM revision_previews link
            JOIN asset_preview_versions preview ON preview.id = link.preview_id
            JOIN revision_assets ra
              ON ra.revision_id = link.revision_id AND ra.asset_id = link.asset_id
            WHERE link.revision_id IN ({placeholders})
            """,
            tuple(revision_ids),
        ).fetchall()
        previews = {
            (
                str(row["revision_id"]),
                str(row["asset_id"]),
                preview_base_kind(str(row["kind"])),
                preview_unit(str(row["kind"])),
            ): dict(row)
            for row in evidence_rows
        }
        previews.update({
            (
                str(row["revision_id"]),
                str(row["asset_id"]),
                preview_base_kind(str(row["kind"])),
                preview_unit(str(row["kind"])),
            ): dict(row)
            for row in output_rows
        })
        return sorted(
            previews.values(),
            key=lambda row: (
                str(row["revision_id"]),
                str(row["kind"]),
                str(row["asset_id"]),
                str(row["created_at"]),
                str(row["id"]),
            ),
        )

    def latest_validation_runs_for_assets(
        self,
        conn: Any,
        revision_id: str,
        asset_ids: list[str],
    ) -> dict[str, dict[str, Any]]:
        if not asset_ids:
            return {}
        placeholders = ",".join("%s" for _ in asset_ids)
        rows = conn.execute(
            f"""
            SELECT *
            FROM asset_validation_runs
            WHERE revision_id = %s AND asset_id IN ({placeholders})
            ORDER BY asset_id, finished_at DESC, created_at DESC
            """,
            (revision_id, *asset_ids),
        ).fetchall()
        latest: dict[str, dict[str, Any]] = {}
        for row in rows:
            asset_id = str(row["asset_id"])
            if asset_id not in latest:
                latest[asset_id] = dict(row)
        missing_asset_ids = [asset_id for asset_id in asset_ids if asset_id not in latest]
        if missing_asset_ids:
            inherited_placeholders = ",".join("%s" for _ in missing_asset_ids)
            inherited_rows = conn.execute(
                f"""
                SELECT run.*, run.revision_id AS inherited_from_revision_id,
                       link.revision_id AS inherited_for_revision_id
                FROM revision_validation_evidence_links link
                JOIN asset_validation_runs run ON run.id = link.source_run_id
                WHERE link.revision_id = %s AND link.asset_id IN ({inherited_placeholders})
                """,
                (revision_id, *missing_asset_ids),
            ).fetchall()
            for row in inherited_rows:
                latest[str(row["asset_id"])] = dict(row)
        return latest

    def validation_run_payload(
        self,
        row: dict[str, Any],
        *,
        include_findings: bool = False,
        conn: Any | None = None,
    ) -> dict[str, Any]:
        run_id = str(row["id"])
        payload = {
            "id": run_id,
            "component_id": str(row["component_id"]),
            "revision_id": str(row["revision_id"]),
            "asset_id": str(row["asset_id"]),
            "asset_type": str(row["asset_type"]),
            "checker_type": str(row["checker_type"]),
            "status": str(row["status"]),
            "error_count": int(row["error_count"] or 0),
            "warning_count": int(row["warning_count"] or 0),
            "exit_code": row["exit_code"],
            "tool_version": str(row["tool_version"] or ""),
            "created_at": str(row["created_at"] or ""),
            "finished_at": str(row["finished_at"] or ""),
            "inherited": bool(row.get("inherited_for_revision_id")),
            "inherited_from_revision_id": str(row.get("inherited_from_revision_id") or ""),
            "reports": {
                "summary": f"/api/catalog/validation/runs/{run_id}",
                "json": f"/api/catalog/validation/runs/{run_id}/report.json",
                "junit": f"/api/catalog/validation/runs/{run_id}/report.junit.xml",
                "stdout": f"/api/catalog/validation/runs/{run_id}/stdout",
                "stderr": f"/api/catalog/validation/runs/{run_id}/stderr",
            },
        }
        if include_findings and conn is not None:
            payload["findings"] = self.validation_findings_payload(conn, run_id)
        return payload

    def validation_findings_payload(self, conn: Any, run_id: str) -> list[dict[str, Any]]:
        rows = conn.execute(
            """
            SELECT *
            FROM asset_validation_findings
            WHERE run_id = %s
            ORDER BY CASE severity WHEN 'error' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END, rule_code, message
            """,
            (run_id,),
        ).fetchall()
        return [
            {
                "id": str(row["id"]),
                "run_id": str(row["run_id"]),
                "severity": str(row["severity"]),
                "rule_code": str(row["rule_code"]),
                "rule_url": str(row["rule_url"]),
                "message": str(row["message"]),
                "details": json_loads(row["details_json"], []),
                "object_name": str(row["object_name"] or ""),
                "created_at": str(row["created_at"]),
            }
            for row in rows
        ]

    def component_validation_summary(
        self,
        conn: Any,
        revision_id: str,
        assets: list[dict[str, Any]],
        *,
        preloaded_runs: dict[str, dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        relevant_assets = [
            asset for asset in assets if str(asset["asset_type"]) in {"symbol", "footprint"}
        ]
        latest = (
            preloaded_runs
            if preloaded_runs is not None
            else self.latest_validation_runs_for_assets(
                conn,
                revision_id,
                [str(asset["id"]) for asset in relevant_assets],
            )
        )
        asset_payloads: list[dict[str, Any]] = []
        error_count = 0
        warning_count = 0
        statuses: list[str] = []
        for asset in relevant_assets:
            asset_id = str(asset["id"])
            run = latest.get(asset_id)
            validation = self.validation_run_payload(run) if run else None
            status = str(run["status"]) if run else VALIDATION_STATUS_NOT_RUN
            statuses.append(status)
            if run:
                error_count += int(run["error_count"] or 0)
                warning_count += int(run["warning_count"] or 0)
            asset_payloads.append(
                {
                    "asset_id": asset_id,
                    "asset_type": str(asset["asset_type"]),
                    "asset_name": str(asset["name"]),
                    "target_library": str(asset["target_library"]),
                    "target_name": str(asset["target_name"]),
                    "status": status,
                    "latest_run": validation,
                }
            )

        if not relevant_assets:
            status = VALIDATION_STATUS_NOT_RUN
        elif VALIDATION_STATUS_FAILED in statuses:
            status = VALIDATION_STATUS_FAILED
        elif VALIDATION_STATUS_WARNING in statuses:
            status = VALIDATION_STATUS_WARNING
        elif VALIDATION_STATUS_SKIPPED in statuses:
            status = VALIDATION_STATUS_SKIPPED
        elif VALIDATION_STATUS_NOT_RUN in statuses:
            status = VALIDATION_STATUS_NOT_RUN
        else:
            status = VALIDATION_STATUS_PASSED

        required = set(PLACE_REQUIRED_ASSET_TYPES)
        present_required = {
            str(asset["asset_type"])
            for asset in relevant_assets
            if bool(asset.get("required", True))
        }
        missing_required = sorted(required - present_required)
        return {
            "status": status,
            "enabled": bool(settings.CATALOG_KLC_ENABLED),
            "release_gate": _klc_release_gate(),
            "revision_id": revision_id,
            "error_count": error_count,
            "warning_count": warning_count,
            "missing_required_assets": missing_required,
            "assets": asset_payloads,
        }

    def availability(
        self,
        *,
        default_symbol: dict[str, Any] | None,
        default_footprint: dict[str, Any] | None,
        release_status: str,
        is_active: bool,
        identity_kind: str = IDENTITY_KIND_MPN,
    ) -> tuple[str, list[str], bool]:
        state, missing = cad_availability(
            representation_slot_present(default_symbol),
            representation_slot_present(default_footprint),
        )
        return state, missing, remote_place_enabled(
            is_active=is_active,
            identity_kind=identity_kind,
            missing_assets=missing,
            release_status=release_status,
        )

    def component_payload(
        self,
        conn: Any,
        component_row: dict[str, Any],
        revision_row: dict[str, Any],
        *,
        released_view: bool = False,
        preloaded_assets: list[dict[str, Any]] | None = None,
        preloaded_previews: list[dict[str, Any]] | None = None,
        preloaded_validation_runs: dict[str, dict[str, Any]] | None = None,
        preloaded_representations: list[dict[str, Any]] | None = None,
        preloaded_local_inventory: Any = _PRELOAD_UNSET,
        preloaded_supply_sources: list[dict[str, Any]] | None = None,
        representation_id: str = "",
    ) -> dict[str, Any]:
        assets = (
            preloaded_assets
            if preloaded_assets is not None
            else self._revision_kernel.load_assets_for_revision(conn, str(revision_row["id"]))
        )
        previews = (
            preloaded_previews
            if preloaded_previews is not None
            else self.load_previews_for_revision(conn, str(revision_row["id"]))
        )
        representations = (
            preloaded_representations
            if preloaded_representations is not None
            else self.load_representations_for_revision(
                conn, str(revision_row["id"]), assets=assets, previews=previews
            )
        )
        default_representation = next((item for item in representations if item["is_default"]), None)
        effective_representation = default_representation
        if representation_id:
            effective_representation = next(
                (item for item in representations if item["id"] == representation_id), None
            )
            if not effective_representation:
                raise ValueError("Representation was not found on this revision")
            if not effective_representation.get("symbol") or not effective_representation.get("footprint"):
                raise ValueError("Selected representation is incomplete")
        symbol_asset = effective_representation.get("symbol") if effective_representation else None
        footprint_asset = effective_representation.get("footprint") if effective_representation else None
        availability_state, missing_assets, place_enabled = self.availability(
            default_symbol=symbol_asset,
            default_footprint=footprint_asset,
            release_status=str(revision_row["release_status"]),
            is_active=bool(component_row["is_active"]),
            identity_kind=str(component_row.get("identity_kind") or IDENTITY_KIND_MPN),
        )
        if preloaded_local_inventory is _PRELOAD_UNSET:
            local_inventory = self.local_inventory(conn, str(component_row["id"]))
        else:
            local_inventory = preloaded_local_inventory
        supply_sources = (
            preloaded_supply_sources
            if preloaded_supply_sources is not None
            else self.supply_sources(conn, str(component_row["id"]))
        )
        validation_summary = self.component_validation_summary(
            conn,
            str(revision_row["id"]),
            assets,
            preloaded_runs=preloaded_validation_runs,
        )
        preview_payloads = [
            {
                "id": str(preview["id"]),
                "asset_id": str(preview["asset_id"]),
                "kind": preview_base_kind(str(preview["kind"])),
                "preview_key": str(preview["kind"]),
                "unit": preview_unit(str(preview["kind"])),
                "unit_label": preview_unit_label(str(preview["kind"])),
                "status": str(preview["status"]),
                "content_type": str(preview["content_type"]),
                "file_path": str(preview["file_path"]),
                "generation_error": str(preview["generation_error"]),
                "sha256": str(preview.get("sha256") or ""),
                "generator_fingerprint": str(preview.get("generator_fingerprint") or ""),
                "generator_version": str(preview.get("generator_version") or ""),
                "updated_at": str(preview.get("updated_at") or preview.get("created_at") or ""),
            }
            for preview in previews
        ]
        keywords = json_loads(revision_row.get("keywords"), [])
        return {
            "id": str(component_row["id"]),
            "slug": str(component_row["slug"]),
            "external_source": str(component_row["external_source"]),
            "external_id": str(component_row["external_id"]),
            "external_workflow_source": str(component_row.get("external_workflow_source", "")),
            "external_workflow_id": str(component_row.get("external_workflow_id", "")),
            "external_workflow_url": str(component_row.get("external_workflow_url", "")),
            "external_url": str(component_row.get("external_url", "")),
            "external_payload": json_loads(component_row.get("external_payload_json"), {}),
            "external_updated_at": str(component_row.get("external_updated_at") or ""),
            "sync_status": str(component_row.get("sync_status", "")),
            "sync_error": str(component_row.get("sync_error", "")),
            "source": str(component_row["source"]),
            "identity_kind": str(component_row.get("identity_kind") or IDENTITY_KIND_MPN),
            "name": str(revision_row["name"]),
            "value": str(revision_row["value"]),
            "manufacturer": str(revision_row["manufacturer"]),
            "mpn": str(revision_row["mpn"]),
            "description": str(revision_row["description"]),
            "package_name": str(revision_row["package_name"]),
            "category": str(revision_row["category"]),
            "datasheet_url": str(revision_row["datasheet_url"]),
            "vendor": str(revision_row["vendor"]),
            "vendor_part_number": str(revision_row["vendor_part_number"]),
            "mass_g": str(revision_row["mass_g"]),
            "rqjc_c_w": str(revision_row["rqjc_c_w"]),
            "rqjc_top_c_w": str(revision_row["rqjc_top_c_w"]),
            "temp_max_c": str(revision_row["temp_max_c"]),
            "temp_min_c": str(revision_row["temp_min_c"]),
            "power_dissipation_w": str(revision_row["power_dissipation_w"]),
            "rate": str(revision_row["rate"]),
            "sap_code": str(revision_row["sap_code"]),
            "keywords": list(keywords),
            "extra_fields": json_loads(revision_row.get("extra_fields"), {}),
            "availability_state": availability_state,
            "missing_assets": missing_assets,
            "place_enabled": place_enabled,
            "local_inventory": local_inventory,
            "stock_known": local_inventory is not None,
            "stock_quantity": float(local_inventory["quantity"]) if local_inventory else 0.0,
            "stock_uom": str(local_inventory["uom"]) if local_inventory else "",
            "inventory_status": str(local_inventory["inventory_status"]) if local_inventory else "",
            "supply": {"sources": supply_sources},
            "serial_number": "",
            "lot_number": "",
            "pedigree": "",
            "last_synced_at": str(local_inventory["fetched_at"]) if local_inventory else "",
            "is_active": bool(component_row["is_active"]),
            "revision_id": str(revision_row["id"]),
            "revision": int(revision_row["version"]),
            "version": f"{int(revision_row['version'])}.0.0",
            "parent_revision_id": str(revision_row.get("parent_revision_id", "")),
            "change_kind": str(revision_row.get("change_kind", "")),
            "change_summary": str(revision_row.get("change_summary", "")),
            "created_by": str(revision_row.get("created_by", "")),
            "manifest_hash": str(revision_row.get("manifest_hash", "")),
            "component_created_at": str(component_row.get("created_at", "")),
            "component_updated_at": str(component_row.get("updated_at", "")),
            "revision_created_at": str(revision_row.get("created_at", "")),
            "revision_updated_at": str(revision_row.get("updated_at", "")),
            "current_revision_id": str(component_row.get("current_revision_id", "")),
            "released_revision_id": str(component_row.get("released_revision_id", "")),
            "is_historical_revision": str(revision_row["id"]) != str(component_row.get("current_revision_id", "")),
            "summary": str(revision_row["summary"]),
            "library_name": str(symbol_asset["target_library"]) if symbol_asset else "",
            "symbol_name": str(symbol_asset["target_name"]) if symbol_asset else "",
            "representations": representations,
            "default_representation_id": str(default_representation["id"]) if default_representation else "",
            "effective_representation_id": str(effective_representation["id"]) if effective_representation else "",
            "release_status": normalize_workflow_stage(str(revision_row["release_status"])),
            "workflow_stage": normalize_workflow_stage(str(revision_row["release_status"])),
            "released_view": released_view,
            "assets": [
                {
                    "id": str(asset["id"]),
                    "asset_type": str(asset["asset_type"]),
                    "name": str(asset["name"]),
                    "target_library": str(asset["target_library"]),
                    "target_name": str(asset["target_name"]),
                    "source_group": str(asset["source_group"]),
                    "sha256": str(asset["sha256"]),
                    "size_bytes": int(asset["size_bytes"]),
                    "content_type": str(asset["content_type"]),
                    "required": bool(asset["required"]),
                }
                for asset in assets
            ],
            "previews": preview_payloads,
            "validation": validation_summary,
        }

    def component_summary_payload(
        self,
        component_row: dict[str, Any],
        revision_row: dict[str, Any],
        assets: list[dict[str, Any]],
        *,
        released_view: bool = False,
        validation_summary: dict[str, Any] | None = None,
        default_symbol_asset_id: str = "",
        default_footprint_asset_id: str = "",
    ) -> dict[str, Any]:
        assets_by_id = {str(asset["id"]): asset for asset in assets}
        symbol_asset = assets_by_id.get(str(default_symbol_asset_id or ""))
        footprint_asset = assets_by_id.get(str(default_footprint_asset_id or ""))
        availability_state, missing_assets, place_enabled = self.availability(
            default_symbol=symbol_asset,
            default_footprint=footprint_asset,
            release_status=str(revision_row["release_status"]),
            is_active=bool(component_row["is_active"]),
            identity_kind=str(component_row.get("identity_kind") or IDENTITY_KIND_MPN),
        )
        # Lightweight payloads are used by the KiCad remote panel; avoid validation lookups on search paths.
        validation_summary = validation_summary or {
            "status": VALIDATION_STATUS_NOT_RUN,
            "enabled": bool(settings.CATALOG_KLC_ENABLED),
            "release_gate": _klc_release_gate(),
            "revision_id": str(revision_row["id"]),
            "error_count": 0,
            "warning_count": 0,
            "missing_required_assets": [],
            "assets": [],
        }
        return {
            "id": str(component_row["id"]),
            "slug": str(component_row["slug"]),
            "source": str(component_row["source"]),
            "identity_kind": str(component_row.get("identity_kind") or IDENTITY_KIND_MPN),
            "name": str(revision_row["name"]),
            "value": str(revision_row["value"]),
            "manufacturer": str(revision_row["manufacturer"]),
            "mpn": str(revision_row["mpn"]),
            "description": str(revision_row["description"]),
            "package_name": str(revision_row["package_name"]),
            "category": str(revision_row["category"]),
            "datasheet_url": str(revision_row["datasheet_url"]),
            "vendor": str(revision_row["vendor"]),
            "vendor_part_number": str(revision_row["vendor_part_number"]),
            "mass_g": str(revision_row["mass_g"]),
            "rqjc_c_w": str(revision_row["rqjc_c_w"]),
            "rqjc_top_c_w": str(revision_row["rqjc_top_c_w"]),
            "temp_max_c": str(revision_row["temp_max_c"]),
            "temp_min_c": str(revision_row["temp_min_c"]),
            "power_dissipation_w": str(revision_row["power_dissipation_w"]),
            "rate": str(revision_row["rate"]),
            "sap_code": str(revision_row["sap_code"]),
            "extra_fields": json_loads(revision_row.get("extra_fields"), {}),
            "summary": str(revision_row["summary"]),
            "revision": int(revision_row["version"]),
            "version": f"{int(revision_row['version'])}.0.0",
            # LIB_ID follows the default pair, matching detail payloads.
            "library_name": str(symbol_asset["target_library"]) if symbol_asset else "",
            "symbol_name": str(symbol_asset["target_name"]) if symbol_asset else "",
            "availability_state": availability_state,
            "missing_assets": missing_assets,
            "place_enabled": place_enabled,
            "local_inventory": None,
            "stock_known": False,
            "stock_quantity": 0.0,
            "stock_uom": "",
            "inventory_status": "",
            "release_status": normalize_workflow_stage(str(revision_row["release_status"])),
            "workflow_stage": normalize_workflow_stage(str(revision_row["release_status"])),
            "released_view": released_view,
            "revision_id": str(revision_row["id"]),
            "revision_updated_at": str(revision_row["updated_at"]),
            # Who authored the current revision. Stored all along, but omitted here,
            # so every catalog row rendered as "Unknown author".
            "created_by": str(revision_row.get("created_by") or ""),
            "component_updated_at": str(component_row["updated_at"]),
            "assets": [],
            "previews": [],
            "validation": validation_summary,
        }

    def get_component_revision(
        self, conn: Any, component_id: str, revision_id: str
    ) -> dict[str, Any] | None:
        component = self._revision_kernel.component_row(conn, component_id)
        revision = self._revision_kernel.revision_row(conn, revision_id)
        if not component or not revision or str(revision["component_id"]) != component_id:
            return None
        return self.component_payload(conn, component, revision)

    def get_component(
        self,
        conn: Any,
        component_id: str,
        *,
        include_inactive: bool = True,
        released_only: bool = False,
        representation_id: str = "",
    ) -> dict[str, Any] | None:
        component, revision = self._revision_kernel.active_revision_row(
            conn, component_id, released=released_only
        )
        if not component or not revision:
            return None
        if not include_inactive and not component["is_active"]:
            return None
        if released_only and normalize_workflow_stage(str(revision["release_status"])) != "released":
            return None
        return self.component_payload(
            conn,
            component,
            revision,
            released_view=released_only,
            representation_id=representation_id,
        )


__all__ = [
    "CatalogComponentReadModels",
    "cad_availability",
    "inventory_payloads_from_source_rows",
    "local_inventory_payload",
    "remote_place_enabled",
    "representation_slot_present",
    "supply_source_payload",
    "SUPPLY_KIND_VENDOR",
    "SUPPLY_KIND_LOCAL",
    "SUPPLY_VENDOR_SOURCE_NAMES",
    "SUPPLY_LOCAL_SOURCE_NAMES",
]
