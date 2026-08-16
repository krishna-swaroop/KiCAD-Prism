"""Manufacturing: production runs, board specs, manufacturers, and defects.

A production run records the physical fabrication of a board: which project and
commit was built, by whom, how many, and what came back. Defects hang off a run with
photographic evidence and reports.

Storage follows the workspace pattern exactly: PostgreSQL ``workspace`` schema, ``%s``
parameters, a ``_connect()`` that sets the search path, and ISO-8601 timestamps at the
boundary. Evidence blobs live in the Prism derived-asset store, never in a git
checkout, so the read-only-mirror invariant is untouched.
"""

from __future__ import annotations

import logging
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Dict, Iterator, List, Optional

from app.services.postgres_database import database
from app.services.workspace_service import workspace

logger = logging.getLogger(__name__)


# Run lifecycle, in order. A run only ever moves forward through these.
RUN_STATUSES = ("draft", "ordered", "in_production", "received", "closed")

DEFECT_SEVERITIES = ("aesthetic", "minor", "major", "critical")
DEFECT_STATUSES = ("open", "resolved", "accepted")

# Open-ended, but these are the categories the UI offers.
DEFECT_CATEGORIES = (
    "soldering", "open_circuit", "short_circuit", "missing_component",
    "wrong_component", "misalignment", "solder_mask", "silkscreen",
    "drill_plating", "warping", "contamination", "mechanical_damage", "other",
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id(prefix: str) -> str:
    return f"{prefix}{uuid.uuid4().hex[:12]}"


class ManufacturingError(ValueError):
    """A manufacturing operation was rejected for a reason the caller can act on."""


@contextmanager
def _connect() -> Iterator[Any]:
    workspace.initialize()
    with database.connection() as conn:
        conn.execute("SET search_path TO workspace, public")
        yield conn


def _row(row: Any) -> Dict[str, Any]:
    return {
        key: value.isoformat() if isinstance(value, datetime) else value
        for key, value in dict(row).items()
    }


# ---------------------------------------------------------------------------
# Manufacturers
# ---------------------------------------------------------------------------


def list_manufacturers() -> List[Dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM ws_manufacturers ORDER BY name"
        ).fetchall()
    return [_row(r) for r in rows]


def create_manufacturer(name: str, contact: str = "", website: str = "", notes: str = "") -> str:
    clean = name.strip()
    if not clean:
        raise ManufacturingError("A manufacturer name is required.")
    mfr_id = _new_id("mfr_")
    now = _now()
    with _connect() as conn:
        conn.execute(
            """INSERT INTO ws_manufacturers (id,name,contact,website,notes,created_at,updated_at)
               VALUES (%s,%s,%s,%s,%s,%s,%s)""",
            (mfr_id, clean, contact.strip(), website.strip(), notes.strip(), now, now),
        )
        conn.commit()
    return mfr_id


def update_manufacturer(mfr_id: str, **fields: Any) -> bool:
    allowed = {"name", "contact", "website", "notes"}
    updates = {k: (v.strip() if isinstance(v, str) else v) for k, v in fields.items() if k in allowed}
    if "name" in updates and not updates["name"]:
        raise ManufacturingError("A manufacturer name is required.")
    if not updates:
        return False
    updates["updated_at"] = _now()
    columns = ", ".join(f"{k} = %s" for k in updates)
    with _connect() as conn:
        result = conn.execute(
            f"UPDATE ws_manufacturers SET {columns} WHERE id = %s",
            (*updates.values(), mfr_id),
        )
        conn.commit()
    return bool(result.rowcount)


def delete_manufacturer(mfr_id: str) -> bool:
    with _connect() as conn:
        result = conn.execute("DELETE FROM ws_manufacturers WHERE id = %s", (mfr_id,))
        conn.commit()
    return bool(result.rowcount)


# ---------------------------------------------------------------------------
# Spec templates (named, manufacturer-scoped)
# ---------------------------------------------------------------------------


def list_templates(manufacturer_id: str | None = None) -> List[Dict[str, Any]]:
    """Templates for one manufacturer, or all of them, with the manufacturer name."""
    query = """
        SELECT t.*, m.name AS manufacturer_name
        FROM ws_spec_templates t
        JOIN ws_manufacturers m ON m.id = t.manufacturer_id
    """
    params: tuple[Any, ...] = ()
    if manufacturer_id:
        query += " WHERE t.manufacturer_id = %s"
        params = (manufacturer_id,)
    query += " ORDER BY m.name, t.name"
    with _connect() as conn:
        rows = conn.execute(query, params).fetchall()
    return [_row(r) for r in rows]


def get_template(template_id: str) -> Optional[Dict[str, Any]]:
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM ws_spec_templates WHERE id = %s", (template_id,)
        ).fetchone()
    return _row(row) if row else None


def identify_schema(spec_config: str) -> Dict[str, Optional[str]]:
    """Best-effort match of a spec's config text back to a manufacturer template.

    A project's spec is a copy of a template (copy-on-apply), so the link is not
    stored. An exact text match recovers the schema and manufacturer names; no match
    means the schema has been customised. Returns {manufacturer, schema}.
    """
    target = _config_hash(spec_config or "")
    for template in list_templates():
        if _config_hash(template.get("spec_config") or "") == target:
            return {
                "manufacturer": template.get("manufacturer_name"),
                "schema": template.get("name"),
            }
    return {"manufacturer": None, "schema": None}


def _config_hash(text: str) -> str:
    import hashlib

    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def create_template(
    manufacturer_id: str,
    name: str,
    spec_config: str = "",
    *,
    builtin_key: Optional[str] = None,
    seeded_hash: Optional[str] = None,
) -> str:
    clean = name.strip()
    if not clean:
        raise ManufacturingError("A template name is required.")
    with _connect() as conn:
        exists = conn.execute(
            "SELECT 1 FROM ws_manufacturers WHERE id = %s", (manufacturer_id,)
        ).fetchone()
        if not exists:
            raise ManufacturingError("Manufacturer not found.")
    template_id = _new_id("tpl_")
    now = _now()
    with _connect() as conn:
        conn.execute(
            """INSERT INTO ws_spec_templates
               (id,manufacturer_id,name,spec_config,builtin_key,seeded_hash,created_at,updated_at)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
            (template_id, manufacturer_id, clean, spec_config, builtin_key, seeded_hash, now, now),
        )
        conn.commit()
    return template_id


def update_template(template_id: str, **fields: Any) -> bool:
    allowed = {"name", "spec_config"}
    updates = {k: v for k, v in fields.items() if k in allowed and v is not None}
    if "name" in updates:
        updates["name"] = str(updates["name"]).strip()
        if not updates["name"]:
            raise ManufacturingError("A template name is required.")
    if not updates:
        return False
    updates["updated_at"] = _now()
    columns = ", ".join(f"{k} = %s" for k in updates)
    # A user edit detaches a built-in template from auto-sync: its stored text no
    # longer matches the source, so seed sync will leave it alone from here on.
    with _connect() as conn:
        result = conn.execute(
            f"UPDATE ws_spec_templates SET {columns} WHERE id = %s",
            (*updates.values(), template_id),
        )
        conn.commit()
    return bool(result.rowcount)


def delete_template(template_id: str) -> bool:
    with _connect() as conn:
        result = conn.execute("DELETE FROM ws_spec_templates WHERE id = %s", (template_id,))
        conn.commit()
    return bool(result.rowcount)


def seed_builtin_manufacturers() -> list[str]:
    """Create and keep built-in manufacturers and their templates up to date.

    Runs on every startup and is safe to repeat:

      * A missing built-in manufacturer is created.
      * A missing built-in template is created (this is how a newly added one, like
        the advanced-PCB template, reaches an existing install).
      * An existing built-in template is refreshed to the latest source ONLY if the
        user has not edited it. "Not edited" means its stored text still matches the
        source it was last seeded from, or -- for a row seeded before this tracking
        existed -- that the row has never been updated since creation.

    A user edit permanently detaches a template from this sync (its text no longer
    matches the source), so nobody's customisation is ever clobbered. Returns a
    short description of what changed, for the startup log.
    """
    from app.services.spec_config_service import SEED_MANUFACTURERS

    changes: list[str] = []
    for entry in SEED_MANUFACTURERS:
        mfr_id = _ensure_manufacturer(entry["name"], entry.get("website", ""))
        for template in entry.get("templates", []):
            change = _sync_builtin_template(
                mfr_id, template["key"], template["name"], template["config"]
            )
            if change:
                changes.append(change)
    return changes


def _ensure_manufacturer(name: str, website: str) -> str:
    """The id of the manufacturer with this name, creating it if absent."""
    with _connect() as conn:
        row = conn.execute(
            "SELECT id FROM ws_manufacturers WHERE lower(name) = lower(%s)", (name,)
        ).fetchone()
    if row:
        return str(row["id"])
    return create_manufacturer(name, website=website)


def _sync_builtin_template(mfr_id: str, key: str, name: str, config: str) -> Optional[str]:
    """Create or refresh one built-in template. Returns a change description or None."""
    source_hash = _config_hash(config)

    with _connect() as conn:
        # Prefer the row already claimed by this built-in key.
        row = conn.execute(
            "SELECT * FROM ws_spec_templates WHERE builtin_key = %s", (key,)
        ).fetchone()
        # Otherwise adopt a legacy row seeded by name before keys existed.
        if not row:
            row = conn.execute(
                """SELECT * FROM ws_spec_templates
                   WHERE manufacturer_id = %s AND lower(name) = lower(%s)
                     AND builtin_key IS NULL""",
                (mfr_id, name),
            ).fetchone()

    if not row:
        create_template(mfr_id, name, config, builtin_key=key, seeded_hash=source_hash)
        return f"created {name}"

    template = _row(row)
    stored = template.get("spec_config") or ""
    seeded_hash = template.get("seeded_hash")
    is_legacy = template.get("builtin_key") is None

    # Unedited if the stored text still matches what it was last seeded from, or --
    # for a legacy row with no recorded hash -- if it was never updated after
    # creation. A user edit changes the text (and updated_at), failing both.
    if seeded_hash is not None:
        unedited = _config_hash(stored) == seeded_hash
    else:
        unedited = is_legacy and template.get("created_at") == template.get("updated_at")

    if _config_hash(stored) == source_hash:
        # Already current; just make sure it is claimed and its hash recorded.
        if is_legacy or seeded_hash != source_hash:
            _claim_builtin(template["id"], key, source_hash)
        return None

    if not unedited:
        # The user has customised it; adopt the key so we can track future edits,
        # but never overwrite their text.
        if is_legacy:
            _claim_builtin(template["id"], key, _config_hash(stored))
        return None

    # Untouched and out of date: refresh to the latest source.
    now = _now()
    with _connect() as conn:
        conn.execute(
            """UPDATE ws_spec_templates
               SET spec_config = %s, builtin_key = %s, seeded_hash = %s, updated_at = %s
               WHERE id = %s""",
            (config, key, source_hash, now, template["id"]),
        )
        conn.commit()
    return f"updated {name}"


def _claim_builtin(template_id: str, key: str, seeded_hash: str) -> None:
    """Mark a row as this built-in, recording the hash it currently matches."""
    with _connect() as conn:
        conn.execute(
            "UPDATE ws_spec_templates SET builtin_key = %s, seeded_hash = %s WHERE id = %s",
            (key, seeded_hash, template_id),
        )
        conn.commit()


# ---------------------------------------------------------------------------
# Board specs (one row per project)
# ---------------------------------------------------------------------------


def get_board_spec(project_id: str) -> Dict[str, Any]:
    """The stored spec for a project, or an empty shell if none saved yet.

    ``spec_config`` is the raw schema text; an empty one falls back to the starter
    config so a brand-new project already has a sensible form to fill in.
    """
    from app.services.spec_config_service import DEFAULT_SPEC_CONFIG

    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM ws_board_specs WHERE project_id = %s", (project_id,)
        ).fetchone()
    if not row:
        return {
            "project_id": project_id,
            "specs": {},
            "source": {},
            "spec_config": DEFAULT_SPEC_CONFIG,
            "active_sections": [],
            "updated_at": None,
            "updated_by": "",
        }
    result = _row(row)
    if not (result.get("spec_config") or "").strip():
        result["spec_config"] = DEFAULT_SPEC_CONFIG
    result.setdefault("active_sections", [])
    return result


def save_spec_config(project_id: str, spec_config: str, *, updated_by: str) -> Dict[str, Any]:
    """Store a project's spec schema text without touching its saved values."""
    if not workspace.get_project_by_id(project_id):
        raise ManufacturingError("Project not found.")
    now = _now()
    with _connect() as conn:
        conn.execute(
            """INSERT INTO ws_board_specs (project_id,specs,source,spec_config,updated_at,updated_by)
               VALUES (%s,'{}'::jsonb,'{}'::jsonb,%s,%s,%s)
               ON CONFLICT (project_id) DO UPDATE
                 SET spec_config = EXCLUDED.spec_config,
                     updated_at = EXCLUDED.updated_at,
                     updated_by = EXCLUDED.updated_by""",
            (project_id, spec_config, now, updated_by),
        )
        conn.commit()
    return get_board_spec(project_id)


def save_board_spec(
    project_id: str,
    specs: Dict[str, Any],
    source: Dict[str, Any],
    *,
    updated_by: str,
    active_sections: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Create or replace a project's spec row.

    ``source`` records per-field provenance; ``active_sections`` is the list of
    optional sections the user has switched on (persisted so a mis-toggle or a
    reload does not lose them). ``None`` leaves the stored activation untouched.
    """
    if not workspace.get_project_by_id(project_id):
        raise ManufacturingError("Project not found.")
    import json

    now = _now()
    sections_json = json.dumps(list(active_sections)) if active_sections is not None else None
    with _connect() as conn:
        conn.execute(
            """INSERT INTO ws_board_specs (project_id,specs,source,active_sections,updated_at,updated_by)
               VALUES (%s,%s::jsonb,%s::jsonb,COALESCE(%s::jsonb,'[]'::jsonb),%s,%s)
               ON CONFLICT (project_id) DO UPDATE
                 SET specs = EXCLUDED.specs,
                     source = EXCLUDED.source,
                     active_sections = COALESCE(%s::jsonb, ws_board_specs.active_sections),
                     updated_at = EXCLUDED.updated_at,
                     updated_by = EXCLUDED.updated_by""",
            (project_id, json.dumps(specs), json.dumps(source), sections_json, now, updated_by, sections_json),
        )
        conn.commit()
    return get_board_spec(project_id)


# ---------------------------------------------------------------------------
# Runs
# ---------------------------------------------------------------------------


def list_runs(project_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Every run, or the runs for one project, newest first, with joined names."""
    query = """
        SELECT run.*, p.name AS project_name, p.relative_path,
               m.name AS manufacturer_name,
               (SELECT COUNT(*) FROM ws_run_defects d WHERE d.run_id = run.id) AS defect_count
        FROM ws_manufacturing_runs run
        JOIN ws_projects p ON p.id = run.project_id
        LEFT JOIN ws_manufacturers m ON m.id = run.manufacturer_id
    """
    params: tuple[Any, ...] = ()
    if project_id:
        query += " WHERE run.project_id = %s"
        params = (project_id,)
    query += " ORDER BY run.created_at DESC"
    with _connect() as conn:
        rows = conn.execute(query, params).fetchall()
    return [_row(r) for r in rows]


def get_run(run_id: str) -> Optional[Dict[str, Any]]:
    with _connect() as conn:
        row = conn.execute(
            """SELECT run.*, p.name AS project_name, p.relative_path,
                      m.name AS manufacturer_name
               FROM ws_manufacturing_runs run
               JOIN ws_projects p ON p.id = run.project_id
               LEFT JOIN ws_manufacturers m ON m.id = run.manufacturer_id
               WHERE run.id = %s""",
            (run_id,),
        ).fetchone()
    if not row:
        return None
    run = _row(row)
    run["defects"] = list_defects(run_id)
    return run


def create_run(
    project_id: str,
    *,
    manufacturer_id: Optional[str] = None,
    commit_sha: str = "",
    quantity_ordered: int = 0,
    notes: str = "",
    spec_snapshot: Optional[Dict[str, Any]] = None,
    created_by: str = "",
) -> str:
    if quantity_ordered < 0:
        raise ManufacturingError("Quantity cannot be negative.")
    if not workspace.get_project_by_id(project_id):
        raise ManufacturingError("Project not found.")
    import json

    run_id = _new_id("run_")
    now = _now()
    with _connect() as conn:
        conn.execute(
            """INSERT INTO ws_manufacturing_runs
               (id,project_id,manufacturer_id,commit_sha,quantity_ordered,quantity_good,
                status,notes,spec_snapshot,created_by,created_at,updated_at)
               VALUES (%s,%s,%s,%s,%s,0,'draft',%s,%s::jsonb,%s,%s,%s)""",
            (
                run_id, project_id, manufacturer_id or None, commit_sha.strip(),
                int(quantity_ordered), notes.strip(),
                json.dumps(spec_snapshot or {}), created_by, now, now,
            ),
        )
        conn.commit()
    return run_id


def update_run(run_id: str, **fields: Any) -> bool:
    """Update a run's mutable fields. Status must be a known value; good <= ordered."""
    allowed = {"manufacturer_id", "commit_sha", "quantity_ordered", "quantity_good", "status", "notes"}
    updates = {k: v for k, v in fields.items() if k in allowed and v is not None}
    if not updates:
        return False
    if "status" in updates and updates["status"] not in RUN_STATUSES:
        raise ManufacturingError(f"Unknown run status: {updates['status']!r}")
    for qty_key in ("quantity_ordered", "quantity_good"):
        if qty_key in updates and int(updates[qty_key]) < 0:
            raise ManufacturingError("Quantity cannot be negative.")
    for str_key in ("commit_sha", "notes"):
        if str_key in updates and isinstance(updates[str_key], str):
            updates[str_key] = updates[str_key].strip()
    updates["updated_at"] = _now()
    columns = ", ".join(f"{k} = %s" for k in updates)
    with _connect() as conn:
        result = conn.execute(
            f"UPDATE ws_manufacturing_runs SET {columns} WHERE id = %s",
            (*updates.values(), run_id),
        )
        conn.commit()
    return bool(result.rowcount)


def delete_run(run_id: str) -> bool:
    with _connect() as conn:
        result = conn.execute("DELETE FROM ws_manufacturing_runs WHERE id = %s", (run_id,))
        conn.commit()
    return bool(result.rowcount)


# ---------------------------------------------------------------------------
# Defects
# ---------------------------------------------------------------------------


def list_defects(run_id: str) -> List[Dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM ws_run_defects WHERE run_id = %s ORDER BY created_at DESC",
            (run_id,),
        ).fetchall()
    return [_row(r) for r in rows]


def log_defect(
    run_id: str,
    *,
    category: str = "other",
    severity: str = "minor",
    quantity_affected: int = 1,
    description: str = "",
    logged_by: str = "",
) -> str:
    # Validate cheap inputs before any database round-trip.
    if severity not in DEFECT_SEVERITIES:
        raise ManufacturingError(f"Unknown severity: {severity!r}")
    if quantity_affected < 1:
        raise ManufacturingError("A defect must affect at least one unit.")
    if not get_run(run_id):
        raise ManufacturingError("Run not found.")
    def_id = _new_id("def_")
    now = _now()
    with _connect() as conn:
        conn.execute(
            """INSERT INTO ws_run_defects
               (id,run_id,category,severity,quantity_affected,description,status,evidence,logged_by,created_at)
               VALUES (%s,%s,%s,%s,%s,%s,'open','[]'::jsonb,%s,%s)""",
            (def_id, run_id, category.strip() or "other", severity,
             int(quantity_affected), description.strip(), logged_by, now),
        )
        conn.commit()
    return def_id


def update_defect(defect_id: str, **fields: Any) -> bool:
    allowed = {"category", "severity", "quantity_affected", "description", "status"}
    updates = {k: v for k, v in fields.items() if k in allowed and v is not None}
    if not updates:
        return False
    if "severity" in updates and updates["severity"] not in DEFECT_SEVERITIES:
        raise ManufacturingError(f"Unknown severity: {updates['severity']!r}")
    if "status" in updates and updates["status"] not in DEFECT_STATUSES:
        raise ManufacturingError(f"Unknown defect status: {updates['status']!r}")
    resolved_at = None
    if updates.get("status") in ("resolved", "accepted"):
        resolved_at = _now()
    for str_key in ("category", "description"):
        if str_key in updates and isinstance(updates[str_key], str):
            updates[str_key] = updates[str_key].strip()
    columns = ", ".join(f"{k} = %s" for k in updates)
    query = f"UPDATE ws_run_defects SET {columns}"
    params: list[Any] = list(updates.values())
    if resolved_at is not None:
        query += ", resolved_at = %s"
        params.append(resolved_at)
    elif updates.get("status") == "open":
        query += ", resolved_at = NULL"
    query += " WHERE id = %s"
    params.append(defect_id)
    with _connect() as conn:
        result = conn.execute(query, tuple(params))
        conn.commit()
    return bool(result.rowcount)


def delete_defect(defect_id: str) -> bool:
    with _connect() as conn:
        result = conn.execute("DELETE FROM ws_run_defects WHERE id = %s", (defect_id,))
        conn.commit()
    return bool(result.rowcount)


def get_defect(defect_id: str) -> Optional[Dict[str, Any]]:
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM ws_run_defects WHERE id = %s", (defect_id,)
        ).fetchone()
    return _row(row) if row else None


def set_defect_evidence(defect_id: str, evidence: List[Dict[str, Any]]) -> bool:
    """Replace a defect's evidence descriptor list (the blobs live on disk)."""
    import json

    with _connect() as conn:
        result = conn.execute(
            "UPDATE ws_run_defects SET evidence = %s::jsonb WHERE id = %s",
            (json.dumps(evidence), defect_id),
        )
        conn.commit()
    return bool(result.rowcount)
