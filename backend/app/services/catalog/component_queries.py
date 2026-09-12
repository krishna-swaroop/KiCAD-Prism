"""Connection-level component list and category queries for the catalog."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

from app.services.catalog.component_read_models import (
    CatalogComponentReadModels,
    STATE_FILES_PARTIAL,
    STATE_METADATA_ONLY,
    STATE_PLACE_READY,
    VALIDATION_STATUS_FAILED,
    VALIDATION_STATUS_NOT_RUN,
    VALIDATION_STATUS_PASSED,
    VALIDATION_STATUS_SKIPPED,
    VALIDATION_STATUS_WARNING,
    inventory_payloads_from_source_rows,
)
from app.services.catalog.revision_kernel import WORKFLOW_STAGES, normalize_workflow_stage


REPRESENTATION_ASSET_COLUMNS = {
    "symbol": "symbol_asset_id",
    "footprint": "footprint_asset_id",
}

# OFFSET pages need a total order when timestamps or ranks tie.
COMPONENT_LIST_TIEBREAKER = "c.id"


def default_representation_has_asset(revision_ref: str, asset_type: str, alias: str) -> str:
    """SQL predicate: the default representation has a non-empty asset for ``asset_type``."""

    column = REPRESENTATION_ASSET_COLUMNS[asset_type]
    return (
        f"EXISTS (SELECT 1 FROM revision_representations {alias} "
        f"WHERE {alias}.revision_id = {revision_ref}.id "
        f"AND {alias}.is_default = 1 "
        f"AND COALESCE({alias}.{column}, '') <> '')"
    )


def default_rep_slot_present(asset_type: str) -> str:
    """SQL predicate over the ``default_rep`` join used by the paged list query."""

    column = REPRESENTATION_ASSET_COLUMNS[asset_type]
    return f"COALESCE(default_rep.{column}, '') <> ''"


@dataclass(frozen=True)
class CatalogComponentListPlan:
    """Purely prepared SQL fragments and values for one component-list read."""

    revision_ref: str
    revision_join_column: str
    where_sql: str
    params: tuple[Any, ...]
    order_sql: str
    order_params: tuple[Any, ...]
    page: int
    page_size: int
    offset: int
    released_only: bool
    lightweight: bool


def _dedupe(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            ordered.append(value)
    return ordered


class CatalogComponentQueries:
    """Plan and execute component list reads using supplied read models/connection."""

    def __init__(self, component_read_models: CatalogComponentReadModels) -> None:
        self._component_read_models = component_read_models

    def prepare_list_components(
        self,
        *,
        query: str = "",
        source: str | None = None,
        availability_state: str | None = None,
        workflow_stage: str | None = None,
        validation_status: str | None = None,
        category: str | None = None,
        include_inactive: bool = False,
        page: int = 1,
        page_size: int = 50,
        released_only: bool = False,
        lightweight: bool = False,
        sort_by: str = "",
        sort_dir: str = "asc",
    ) -> CatalogComponentListPlan:
        """Prepare filters and ordering without touching catalog storage."""

        offset = (page - 1) * page_size
        revision_ref = "rr" if released_only else "cr"
        revision_join_column = "released_revision_id" if released_only else "current_revision_id"
        filters: list[str] = []
        params: list[Any] = []

        if not include_inactive:
            filters.append("c.is_active = 1")
        if source:
            filters.append("c.source = %s")
            params.append(source)
        if category is not None:
            filters.append(f"{revision_ref}.category = %s")
            params.append(category)
        requested_workflow_stages = _dedupe(
            [
                normalized
                for raw_stage in str(workflow_stage or "").split(",")
                if (normalized := normalize_workflow_stage(raw_stage.strip()))
            ]
        )
        if requested_workflow_stages:
            unsupported_stages = [
                stage for stage in requested_workflow_stages if stage not in WORKFLOW_STAGES
            ]
            if unsupported_stages:
                raise ValueError("Unsupported workflow stage")
            placeholders = ",".join("%s" for _ in requested_workflow_stages)
            filters.append(f"{revision_ref}.release_status IN ({placeholders})")
            params.extend(requested_workflow_stages)
        if availability_state:
            symbol_exists = default_representation_has_asset(
                revision_ref, "symbol", "rr_avail_symbol"
            )
            footprint_exists = default_representation_has_asset(
                revision_ref, "footprint", "rr_avail_footprint"
            )
            if availability_state == STATE_PLACE_READY:
                filters.append(f"{symbol_exists} AND {footprint_exists}")
            elif availability_state == STATE_METADATA_ONLY:
                filters.append(f"NOT {symbol_exists} AND NOT {footprint_exists}")
            elif availability_state == STATE_FILES_PARTIAL:
                filters.append(f"(({symbol_exists}) <> ({footprint_exists}))")
            else:
                raise ValueError("Unsupported availability state")
        if validation_status:
            supported_validation_statuses = {
                VALIDATION_STATUS_PASSED,
                VALIDATION_STATUS_WARNING,
                VALIDATION_STATUS_FAILED,
                VALIDATION_STATUS_SKIPPED,
                VALIDATION_STATUS_NOT_RUN,
            }
            if validation_status not in supported_validation_statuses:
                raise ValueError("Unsupported validation status")

            relevant_assets_exist = (
                f"EXISTS (SELECT 1 FROM revision_assets ra_validation_any "
                f"JOIN assets asset_validation_any ON asset_validation_any.id = ra_validation_any.asset_id "
                f"WHERE ra_validation_any.revision_id = {revision_ref}.id "
                f"AND asset_validation_any.asset_type IN ('symbol', 'footprint'))"
            )

            def latest_status_exists(status: str, suffix: str) -> str:
                # Scope runs to the revision (direct or inherited evidence). Matching
                # by asset_id alone incorrectly picks status from unrelated revisions.
                return (
                    f"EXISTS (SELECT 1 FROM revision_assets ra_validation_{suffix} "
                    f"JOIN assets asset_validation_{suffix} ON asset_validation_{suffix}.id = ra_validation_{suffix}.asset_id "
                    f"WHERE ra_validation_{suffix}.revision_id = {revision_ref}.id "
                    f"AND asset_validation_{suffix}.asset_type IN ('symbol', 'footprint') "
                    f"AND COALESCE(("
                    f"SELECT avr_validation_{suffix}.status "
                    f"FROM asset_validation_runs avr_validation_{suffix} "
                    f"WHERE avr_validation_{suffix}.revision_id = {revision_ref}.id "
                    f"AND avr_validation_{suffix}.asset_id = asset_validation_{suffix}.id "
                    f"ORDER BY avr_validation_{suffix}.finished_at DESC, avr_validation_{suffix}.created_at DESC "
                    f"LIMIT 1"
                    f"), COALESCE(("
                    f"SELECT inherited_run_{suffix}.status "
                    f"FROM revision_validation_evidence_links inherited_link_{suffix} "
                    f"JOIN asset_validation_runs inherited_run_{suffix} "
                    f"  ON inherited_run_{suffix}.id = inherited_link_{suffix}.source_run_id "
                    f"WHERE inherited_link_{suffix}.revision_id = {revision_ref}.id "
                    f"AND inherited_link_{suffix}.asset_id = asset_validation_{suffix}.id "
                    f"LIMIT 1"
                    f"), '{VALIDATION_STATUS_NOT_RUN}')) = '{status}')"
                )

            failed_exists = latest_status_exists(VALIDATION_STATUS_FAILED, "failed")
            warning_exists = latest_status_exists(VALIDATION_STATUS_WARNING, "warning")
            skipped_exists = latest_status_exists(VALIDATION_STATUS_SKIPPED, "skipped")
            not_run_exists = latest_status_exists(VALIDATION_STATUS_NOT_RUN, "not_run")

            if validation_status == VALIDATION_STATUS_FAILED:
                filters.append(failed_exists)
            elif validation_status == VALIDATION_STATUS_WARNING:
                filters.append(f"NOT {failed_exists} AND {warning_exists}")
            elif validation_status == VALIDATION_STATUS_SKIPPED:
                filters.append(f"NOT {failed_exists} AND NOT {warning_exists} AND {skipped_exists}")
            elif validation_status == VALIDATION_STATUS_NOT_RUN:
                filters.append(
                    f"(NOT {relevant_assets_exist} OR "
                    f"(NOT {failed_exists} AND NOT {warning_exists} AND NOT {skipped_exists} AND {not_run_exists}))"
                )
            elif validation_status == VALIDATION_STATUS_PASSED:
                filters.append(
                    f"{relevant_assets_exist} AND NOT {failed_exists} AND NOT {warning_exists} "
                    f"AND NOT {skipped_exists} AND NOT {not_run_exists}"
                )
        if released_only:
            filters.append("c.released_revision_id <> ''")
            filters.append("rr.release_status = 'released'")
        query_text = query.strip()
        # Postgres catalog search uses search_document (+ optional pg_trgm). The
        # legacy SQLite FTS branch is intentionally disabled to avoid rowid MATCH.
        if query_text:
            filters.append(
                f"(LOWER({revision_ref}.search_document) LIKE LOWER(%s) "
                f"OR LOWER({revision_ref}.created_by) LIKE LOWER(%s))"
            )
            params.extend([f"%{query_text}%", f"%{query_text}%"])
        where_sql = f"WHERE {' AND '.join(filters)}" if filters else ""
        sort_columns = {
            "name": f"{revision_ref}.name",
            "mpn": f"{revision_ref}.mpn",
            "manufacturer": f"{revision_ref}.manufacturer",
            "category": f"{revision_ref}.category",
            "package_name": f"{revision_ref}.package_name",
            "workflow_stage": f"{revision_ref}.release_status",
            "release_status": f"{revision_ref}.release_status",
            "updated_at": f"{revision_ref}.updated_at",
        }
        sort_direction = "DESC" if sort_dir.lower() == "desc" else "ASC"
        sort_column = sort_columns.get(sort_by)
        if sort_by == "availability_state":
            # Paged SELECT already LEFT JOINs default_rep; COUNT has no ORDER BY.
            symbol_present = default_rep_slot_present("symbol")
            footprint_present = default_rep_slot_present("footprint")
            sort_column = (
                f"CASE WHEN {symbol_present} AND {footprint_present} THEN 0 "
                f"WHEN ({symbol_present}) <> ({footprint_present}) THEN 1 ELSE 2 END"
            )

        if sort_column:
            order_sql = (
                f"ORDER BY {sort_column} {sort_direction}, "
                f"{revision_ref}.updated_at DESC, {COMPONENT_LIST_TIEBREAKER}"
            )
            order_params: list[Any] = []
        elif query_text:
            order_sql = (
                f"ORDER BY CASE "
                f"WHEN LOWER({revision_ref}.mpn) = LOWER(%s) THEN 0 "
                f"WHEN LOWER({revision_ref}.mpn) LIKE LOWER(%s) THEN 1 "
                f"WHEN LOWER({revision_ref}.name) LIKE LOWER(%s) THEN 2 "
                f"ELSE 3 END, {revision_ref}.updated_at DESC, {COMPONENT_LIST_TIEBREAKER}"
            )
            order_params = [query_text, f"{query_text}%", f"{query_text}%"]
        else:
            order_sql = f"ORDER BY {revision_ref}.updated_at DESC, {COMPONENT_LIST_TIEBREAKER}"
            order_params = []

        return CatalogComponentListPlan(
            revision_ref=revision_ref,
            revision_join_column=revision_join_column,
            where_sql=where_sql,
            params=tuple(params),
            order_sql=order_sql,
            order_params=tuple(order_params),
            page=page,
            page_size=page_size,
            offset=offset,
            released_only=released_only,
            lightweight=lightweight,
        )

    def execute_list_components(
        self, conn: Any, plan: CatalogComponentListPlan
    ) -> dict[str, Any]:
        """Execute one prepared list read against an existing connection."""

        total = int(
            conn.execute(
                f"""
                SELECT COUNT(1) AS total
                FROM components c
                JOIN component_revisions {plan.revision_ref} ON {plan.revision_ref}.id = c.{plan.revision_join_column}
                {plan.where_sql}
                """,
                plan.params,
            ).fetchone()["total"]
        )
        rows = conn.execute(
            f"""
            SELECT c.*, {plan.revision_ref}.id AS revision_id,
                   default_rep.symbol_asset_id AS default_symbol_asset_id,
                   default_rep.footprint_asset_id AS default_footprint_asset_id
            FROM components c
            JOIN component_revisions {plan.revision_ref} ON {plan.revision_ref}.id = c.{plan.revision_join_column}
            LEFT JOIN revision_representations default_rep
              ON default_rep.revision_id = {plan.revision_ref}.id AND default_rep.is_default = 1
            {plan.where_sql}
            {plan.order_sql}
            LIMIT %s OFFSET %s
            """,
            plan.params + plan.order_params + (plan.page_size, plan.offset),
        ).fetchall()
        row_pairs: list[tuple[dict[str, Any], str, str, str]] = []
        for row in rows:
            component_row = dict(row)
            revision_id = str(component_row.pop("revision_id"))
            default_symbol_asset_id = str(component_row.pop("default_symbol_asset_id") or "")
            default_footprint_asset_id = str(component_row.pop("default_footprint_asset_id") or "")
            row_pairs.append(
                (component_row, revision_id, default_symbol_asset_id, default_footprint_asset_id)
            )

        revision_ids = [revision_id for _, revision_id, _, _ in row_pairs]
        revisions_by_id: dict[str, dict[str, Any]] = {}
        if revision_ids:
            placeholders = ",".join("%s" for _ in revision_ids)
            revision_rows = conn.execute(
                f"SELECT * FROM component_revisions WHERE id IN ({placeholders})",
                tuple(revision_ids),
            ).fetchall()
            revisions_by_id = {str(revision["id"]): dict(revision) for revision in revision_rows}

        parsed_rows = []
        for component_row, revision_id, default_symbol_asset_id, default_footprint_asset_id in row_pairs:
            revision = revisions_by_id.get(revision_id)
            if revision:
                parsed_rows.append(
                    (
                        component_row,
                        revision,
                        default_symbol_asset_id,
                        default_footprint_asset_id,
                    )
                )

        revision_ids = [str(rev["id"]) for _, rev, _, _ in parsed_rows]
        assets_by_revision: dict[str, list[dict[str, Any]]] = {}
        all_asset_ids: list[str] = []
        if revision_ids:
            placeholders = ",".join("%s" for _ in revision_ids)
            all_assets_rows = [
                dict(r)
                for r in conn.execute(
                    f"""
                    SELECT a.*, ra.required, ra.revision_id
                    FROM revision_assets ra
                    JOIN assets a ON a.id = ra.asset_id
                    WHERE ra.revision_id IN ({placeholders})
                    ORDER BY CASE a.asset_type
                        WHEN 'symbol' THEN 1 WHEN 'footprint' THEN 2
                        WHEN '3dmodel' THEN 3 WHEN 'spice' THEN 4 ELSE 99
                    END, a.target_library, a.target_name
                    """,
                    tuple(revision_ids),
                ).fetchall()
            ]
            for asset_row in all_assets_rows:
                rev_id = str(asset_row.pop("revision_id"))
                assets_by_revision.setdefault(rev_id, []).append(asset_row)
                all_asset_ids.append(str(asset_row["id"]))

        previews_by_revision: dict[str, list[dict[str, Any]]] = {}
        validation_by_revision: dict[str, dict[str, dict[str, Any]]] = {}
        if not plan.lightweight:
            for preview_row in self._component_read_models.load_previews_for_revisions(
                conn, revision_ids
            ):
                preview_revision_id = str(preview_row.pop("revision_id"))
                previews_by_revision.setdefault(preview_revision_id, []).append(preview_row)
        if revision_ids:
            placeholders = ",".join("%s" for _ in revision_ids)
            validation_rows = conn.execute(
                f"""
                SELECT *
                FROM asset_validation_runs
                WHERE revision_id IN ({placeholders})
                ORDER BY revision_id, asset_id, finished_at DESC, created_at DESC
                """,
                tuple(revision_ids),
            ).fetchall()
            for validation_row in validation_rows:
                revision_id = str(validation_row["revision_id"])
                asset_id = str(validation_row["asset_id"])
                revision_runs = validation_by_revision.setdefault(revision_id, {})
                if asset_id not in revision_runs:
                    revision_runs[asset_id] = dict(validation_row)
            inherited_rows = conn.execute(
                f"""
                SELECT run.*, run.revision_id AS inherited_from_revision_id,
                       link.revision_id AS inherited_for_revision_id, link.asset_id AS linked_asset_id
                FROM revision_validation_evidence_links link
                JOIN asset_validation_runs run ON run.id = link.source_run_id
                WHERE link.revision_id IN ({placeholders})
                """,
                tuple(revision_ids),
            ).fetchall()
            for inherited_row in inherited_rows:
                revision_id = str(inherited_row["inherited_for_revision_id"])
                asset_id = str(inherited_row["linked_asset_id"])
                revision_runs = validation_by_revision.setdefault(revision_id, {})
                if asset_id not in revision_runs:
                    revision_runs[asset_id] = dict(inherited_row)

        representations_by_revision: dict[str, list[dict[str, Any]]] = {}
        inventory_by_component: dict[str, list[dict[str, Any]]] = {}
        if not plan.lightweight and parsed_rows:
            representations_by_revision = self._component_read_models.load_representations_for_revisions(
                conn,
                revision_ids,
                assets_by_revision=assets_by_revision,
                previews_by_revision=previews_by_revision,
            )
            inventory_by_component = self._component_read_models.load_inventory_for_components(
                conn,
                [str(component_row["id"]) for component_row, _, _, _ in parsed_rows],
            )

        items = []
        for component_row, revision_row, default_symbol_asset_id, default_footprint_asset_id in parsed_rows:
            rev_assets = assets_by_revision.get(str(revision_row["id"]), [])
            if plan.lightweight:
                validation = self._component_read_models.component_validation_summary(
                    conn,
                    str(revision_row["id"]),
                    rev_assets,
                    preloaded_runs=validation_by_revision.get(str(revision_row["id"]), {}),
                )
                items.append(
                    self._component_read_models.component_summary_payload(
                        component_row,
                        revision_row,
                        rev_assets,
                        released_view=plan.released_only,
                        validation_summary=validation,
                        default_symbol_asset_id=default_symbol_asset_id,
                        default_footprint_asset_id=default_footprint_asset_id,
                    )
                )
                continue
            local_inventory, supply_sources = inventory_payloads_from_source_rows(
                inventory_by_component.get(str(component_row["id"]), [])
            )
            rev_previews = previews_by_revision.get(str(revision_row["id"]), [])
            items.append(
                self._component_read_models.component_payload(
                    conn,
                    component_row,
                    revision_row,
                    released_view=plan.released_only,
                    preloaded_assets=rev_assets,
                    preloaded_previews=rev_previews,
                    preloaded_validation_runs=validation_by_revision.get(str(revision_row["id"]), {}),
                    preloaded_representations=representations_by_revision.get(
                        str(revision_row["id"]), []
                    ),
                    preloaded_local_inventory=local_inventory,
                    preloaded_supply_sources=supply_sources,
                )
            )

        pages = max(1, (total + plan.page_size - 1) // plan.page_size)
        return {
            "items": items,
            "total": total,
            "page": plan.page,
            "page_size": plan.page_size,
            "pages": pages,
        }

    def list_categories(self, conn: Any) -> list[dict[str, Any]]:
        """Read released categories using the supplied connection."""

        rows = conn.execute(
            """
            SELECT rr.category AS name, COUNT(1) AS count
            FROM components c
            JOIN component_revisions rr ON rr.id = c.released_revision_id
            WHERE c.is_active = 1 AND c.released_revision_id <> '' AND rr.release_status = 'released'
            GROUP BY rr.category
            ORDER BY rr.category
            """
        ).fetchall()
        return [{"name": str(row["name"] or ""), "count": int(row["count"])} for row in rows]

    @staticmethod
    def workflow_summary(conn: Any) -> dict[str, Any]:
        """Count active components per workflow stage, in canonical stage order."""

        rows = conn.execute(
            """
            SELECT cr.release_status AS workflow_stage, COUNT(1) AS count
            FROM components c
            JOIN component_revisions cr ON cr.id = c.current_revision_id
            WHERE c.is_active = 1
            GROUP BY cr.release_status
            """
        ).fetchall()
        counts = {stage: 0 for stage in WORKFLOW_STAGES}
        for row in rows:
            stage = normalize_workflow_stage(str(row["workflow_stage"]))
            if stage in counts:
                counts[stage] += int(row["count"])
        return {"stages": [{"workflow_stage": stage, "count": counts[stage]} for stage in WORKFLOW_STAGES]}

    @staticmethod
    def release_queue_summary(conn: Any) -> dict[str, int]:
        """Return queue-wide counters without materializing component payloads.

        The release workspace is server paginated, so its header metrics must be
        computed independently from the visible page. A blocker is either missing
        required CAD on the default representation or a failed validation run for
        the exact current revision.
        """

        symbol_exists = default_representation_has_asset("cr", "symbol", "rr_queue_symbol")
        footprint_exists = default_representation_has_asset("cr", "footprint", "rr_queue_footprint")
        row = conn.execute(
            f"""
            SELECT
                SUM(CASE WHEN cr.release_status = 'qa_review' THEN 1 ELSE 0 END) AS qa_review,
                SUM(CASE WHEN cr.release_status = 'done' THEN 1 ELSE 0 END) AS done,
                SUM(
                    CASE WHEN
                        NOT {symbol_exists}
                        OR NOT {footprint_exists}
                        OR EXISTS (
                            SELECT 1
                            FROM revision_assets ra_validation
                            JOIN assets validation_asset
                              ON validation_asset.id = ra_validation.asset_id
                            WHERE ra_validation.revision_id = cr.id
                              AND validation_asset.asset_type IN ('symbol', 'footprint')
                              AND COALESCE((
                                  SELECT validation_run.status
                                  FROM asset_validation_runs validation_run
                                  WHERE validation_run.revision_id = cr.id
                                    AND validation_run.asset_id = validation_asset.id
                                  ORDER BY validation_run.finished_at DESC,
                                           validation_run.created_at DESC
                                  LIMIT 1
                              ), 'not_run') = 'failed'
                        )
                    THEN 1 ELSE 0 END
                ) AS blocked
            FROM components c
            JOIN component_revisions cr ON cr.id = c.current_revision_id
            WHERE c.is_active = 1
              AND cr.release_status IN ('qa_review', 'done')
            """
        ).fetchone()
        return {
            "qa_review": int(row["qa_review"] or 0),
            "done": int(row["done"] or 0),
            "blocked": int(row["blocked"] or 0),
        }


__all__ = [
    "COMPONENT_LIST_TIEBREAKER",
    "CatalogComponentListPlan",
    "CatalogComponentQueries",
    "REPRESENTATION_ASSET_COLUMNS",
    "default_rep_slot_present",
    "default_representation_has_asset",
]
