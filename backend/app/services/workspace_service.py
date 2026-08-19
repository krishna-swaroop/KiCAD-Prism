"""PostgreSQL-backed project registry, folder tree, and workspace jobs."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional

from app.core.config import settings
from app.core.roles import Role, role_matches_allowed_role
from app.services.postgres_database import database
from app.services.workspace_schema_migrations import apply_workspace_migrations

logger = logging.getLogger(__name__)

_RELEASE_IMMUTABLE_TRIGGERS = (
    ("ws_release_approvals", "trg_ws_release_approvals_immutable"),
    (
        "ws_release_approval_invalidations",
        "trg_ws_release_approval_invalidations_immutable",
    ),
    ("ws_release_audit_events", "trg_ws_release_audit_events_immutable"),
    ("ws_release_waivers", "trg_ws_release_waivers_no_delete"),
    ("ws_release_records", "trg_ws_release_records_guard"),
)


class ProjectHasSignedReleasesError(Exception):
    """Raised when a non-admin delete is blocked by signed release records."""

    def __init__(self, project_id: str, record_count: int) -> None:
        self.project_id = project_id
        self.record_count = record_count
        super().__init__(
            "This project has signed release records and cannot be deleted. "
            "An admin can permanently delete the project and its associated "
            "release history."
        )


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id(prefix: str = "") -> str:
    return f"{prefix}{uuid.uuid4().hex[:12]}"


def _hash_file(path: Path) -> Optional[str]:
    if not path.is_file():
        return None
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()
    except OSError:
        return None


class WorkspaceService:
    """Native PostgreSQL workspace persistence."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._initialized = False

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def initialize(self) -> None:
        with self._lock:
            if self._initialized:
                return
            with self._connect() as conn:
                conn.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", ("prism-schema",))
                self._create_schema(conn)
                apply_workspace_migrations(conn)
                conn.commit()
            self._initialized = True
            logger.info("Workspace service initialized in PostgreSQL schema workspace")

    # ------------------------------------------------------------------
    # Connection
    # ------------------------------------------------------------------

    @contextmanager
    def _connect(self) -> Iterator[Any]:
        with database.connection() as conn:
            conn.execute("SET search_path TO workspace, public")
            yield conn

    # ------------------------------------------------------------------
    # Schema
    # ------------------------------------------------------------------

    def _create_schema(self, conn: Any) -> None:
        conn.execute("CREATE SCHEMA IF NOT EXISTS workspace")
        conn.execute("SET search_path TO workspace, public")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS ws_repositories (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                url         TEXT NOT NULL UNIQUE,
                clone_path  TEXT NOT NULL UNIQUE,
                import_type TEXT NOT NULL DEFAULT 'single',
                cloned_at   TIMESTAMPTZ NOT NULL,
                last_synced_at TIMESTAMPTZ
            );

            CREATE TABLE IF NOT EXISTS ws_folders (
                id              TEXT PRIMARY KEY,
                name            TEXT NOT NULL,
                parent_id       TEXT REFERENCES ws_folders(id) ON DELETE CASCADE,
                visibility_mode TEXT,
                allowed_roles   JSONB NOT NULL DEFAULT '[]'::jsonb,
                created_at      TIMESTAMPTZ NOT NULL,
                updated_at      TIMESTAMPTZ NOT NULL,
                UNIQUE(parent_id, name)
            );
            CREATE INDEX IF NOT EXISTS idx_ws_folders_parent ON ws_folders(parent_id);

            CREATE TABLE IF NOT EXISTS ws_projects (
                id              TEXT PRIMARY KEY,
                repo_id         TEXT NOT NULL REFERENCES ws_repositories(id) ON DELETE CASCADE,
                name            TEXT NOT NULL,
                display_name    TEXT,
                description     TEXT NOT NULL DEFAULT '',
                relative_path   TEXT NOT NULL DEFAULT '.',
                folder_id       TEXT REFERENCES ws_folders(id) ON DELETE SET NULL,
                schematic_rel   TEXT,
                pcb_rel         TEXT,
                thumbnail_rel   TEXT,
                jobset_rel      TEXT,
                has_3d_model    BOOLEAN NOT NULL DEFAULT FALSE,
                has_ibom        BOOLEAN NOT NULL DEFAULT FALSE,
                registered_at   TIMESTAMPTZ NOT NULL,
                last_modified   TIMESTAMPTZ NOT NULL,
                prism_json_hash TEXT,
                UNIQUE(repo_id, relative_path)
            );
            CREATE INDEX IF NOT EXISTS idx_ws_projects_folder ON ws_projects(folder_id);
            CREATE INDEX IF NOT EXISTS idx_ws_projects_repo   ON ws_projects(repo_id);

            CREATE TABLE IF NOT EXISTS ws_project_portfolio (
                project_id  TEXT PRIMARY KEY REFERENCES ws_projects(id) ON DELETE CASCADE,
                model_rel   TEXT,
                tags        JSONB NOT NULL DEFAULT '[]'::jsonb,
                scene_config JSONB
            );

            CREATE TABLE IF NOT EXISTS ws_jobs (
                id         TEXT PRIMARY KEY,
                kind       TEXT NOT NULL,
                status     TEXT NOT NULL,
                message    TEXT NOT NULL DEFAULT '',
                percent    REAL NOT NULL DEFAULT 0,
                payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_ws_jobs_kind_status ON ws_jobs(kind, status);

            CREATE TABLE IF NOT EXISTS ws_manufacturers (
                id           TEXT PRIMARY KEY,
                name         TEXT NOT NULL,
                contact      TEXT NOT NULL DEFAULT '',
                website      TEXT NOT NULL DEFAULT '',
                notes        TEXT NOT NULL DEFAULT '',
                created_at   TIMESTAMPTZ NOT NULL,
                updated_at   TIMESTAMPTZ NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ws_board_specs (
                project_id      TEXT PRIMARY KEY REFERENCES ws_projects(id) ON DELETE CASCADE,
                specs           JSONB NOT NULL DEFAULT '{}'::jsonb,
                source          JSONB NOT NULL DEFAULT '{}'::jsonb,
                spec_config     TEXT NOT NULL DEFAULT '',
                active_sections JSONB NOT NULL DEFAULT '[]'::jsonb,
                updated_at      TIMESTAMPTZ NOT NULL,
                updated_by      TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS ws_manufacturing_runs (
                id               TEXT PRIMARY KEY,
                project_id       TEXT NOT NULL REFERENCES ws_projects(id) ON DELETE CASCADE,
                manufacturer_id  TEXT REFERENCES ws_manufacturers(id) ON DELETE SET NULL,
                commit_sha       TEXT NOT NULL DEFAULT '',
                release_tag      TEXT NOT NULL DEFAULT '',
                -- Which named spec the run was ordered against. The FK to
                -- ws_project_specs is added by migration 26 (that table is created
                -- below/after this one), so it is a plain column here; the frozen
                -- spec_snapshot is the durable picture either way.
                spec_id          TEXT,
                -- Human-readable job number (JOB-YYYY-NNNN); assigned at insert
                -- from the sequence below. Migration 29 adds both for existing DBs.
                job_number       TEXT,
                quantity_ordered INTEGER NOT NULL DEFAULT 0,
                quantity_good    INTEGER NOT NULL DEFAULT 0,
                status           TEXT NOT NULL DEFAULT 'draft',
                notes            TEXT NOT NULL DEFAULT '',
                spec_snapshot    JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_by       TEXT NOT NULL DEFAULT '',
                created_at       TIMESTAMPTZ NOT NULL,
                updated_at       TIMESTAMPTZ NOT NULL
            );
            CREATE SEQUENCE IF NOT EXISTS ws_manufacturing_job_seq;
            CREATE INDEX IF NOT EXISTS idx_ws_mfg_runs_project ON ws_manufacturing_runs(project_id);
            CREATE INDEX IF NOT EXISTS idx_ws_mfg_runs_status  ON ws_manufacturing_runs(status);
            -- The job_number unique index lives in migration 29, so it never runs
            -- against an existing table before that migration adds the column.

            CREATE TABLE IF NOT EXISTS ws_spec_templates (
                id              TEXT PRIMARY KEY,
                manufacturer_id TEXT NOT NULL REFERENCES ws_manufacturers(id) ON DELETE CASCADE,
                name            TEXT NOT NULL,
                spec_config     TEXT NOT NULL DEFAULT '',
                -- Fabrication capabilities for this method (KiCad rule fields);
                -- added by migration 28 too.
                capabilities    JSONB NOT NULL DEFAULT '{}'::jsonb,
                -- Label/unit metadata for custom capabilities beyond the KiCad
                -- rule fields; keyed by capability key. Added by migration 30 too.
                capability_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
                -- Identifies a built-in template (e.g. 'jlcpcb:standard'); NULL for
                -- user-created ones. seeded_hash is the sha256 of the source text it
                -- was last seeded from, so startup can tell an untouched built-in
                -- (safe to refresh) from one the user edited (leave alone). Both are
                -- added by migration 23 as well, for databases predating them; the
                -- builtin_key index lives there too so it never runs before the column.
                builtin_key     TEXT,
                seeded_hash     TEXT,
                created_at      TIMESTAMPTZ NOT NULL,
                updated_at      TIMESTAMPTZ NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_ws_spec_templates_mfr ON ws_spec_templates(manufacturer_id);

            CREATE TABLE IF NOT EXISTS ws_run_defects (
                id                TEXT PRIMARY KEY,
                run_id            TEXT NOT NULL REFERENCES ws_manufacturing_runs(id) ON DELETE CASCADE,
                category          TEXT NOT NULL DEFAULT 'other',
                severity          TEXT NOT NULL DEFAULT 'minor',
                quantity_affected INTEGER NOT NULL DEFAULT 1,
                description       TEXT NOT NULL DEFAULT '',
                status            TEXT NOT NULL DEFAULT 'open',
                evidence          JSONB NOT NULL DEFAULT '[]'::jsonb,
                logged_by         TEXT NOT NULL DEFAULT '',
                created_at        TIMESTAMPTZ NOT NULL,
                resolved_at       TIMESTAMPTZ
            );
            CREATE INDEX IF NOT EXISTS idx_ws_run_defects_run ON ws_run_defects(run_id);

            -- A project's attached manufacturers (from the global directory), and
            -- the named fabrication specs each (project, manufacturer) holds. A run
            -- picks a manufacturer scoped to its project, then one of these specs.
            CREATE TABLE IF NOT EXISTS ws_project_manufacturers (
                project_id      TEXT NOT NULL REFERENCES ws_projects(id) ON DELETE CASCADE,
                manufacturer_id TEXT NOT NULL REFERENCES ws_manufacturers(id) ON DELETE CASCADE,
                created_at      TIMESTAMPTZ NOT NULL,
                PRIMARY KEY (project_id, manufacturer_id)
            );
            CREATE INDEX IF NOT EXISTS idx_ws_project_mfrs_project ON ws_project_manufacturers(project_id);

            CREATE TABLE IF NOT EXISTS ws_project_specs (
                id              TEXT PRIMARY KEY,
                project_id      TEXT NOT NULL REFERENCES ws_projects(id) ON DELETE CASCADE,
                manufacturer_id TEXT NOT NULL REFERENCES ws_manufacturers(id) ON DELETE CASCADE,
                -- The template this spec was created from, if any. Capabilities are
                -- read live from it. Added by migration 28 too. ON DELETE SET NULL so
                -- deleting a template does not delete project specs built from it.
                template_id     TEXT REFERENCES ws_spec_templates(id) ON DELETE SET NULL,
                name            TEXT NOT NULL,
                spec_config     TEXT NOT NULL DEFAULT '',
                specs           JSONB NOT NULL DEFAULT '{}'::jsonb,
                source          JSONB NOT NULL DEFAULT '{}'::jsonb,
                active_sections JSONB NOT NULL DEFAULT '[]'::jsonb,
                updated_at      TIMESTAMPTZ NOT NULL,
                updated_by      TEXT NOT NULL DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_ws_project_specs_scope ON ws_project_specs(project_id, manufacturer_id);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_ws_project_specs_name
                ON ws_project_specs(project_id, manufacturer_id, lower(name));
        """, prepare=False)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _projects_root() -> str:
        return os.environ.get(
            "KICAD_PROJECTS_ROOT",
            os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../data/projects")),
        )

    def _abs_clone_path(self, relative_clone_path: str) -> str:
        return os.path.join(self._projects_root(), relative_clone_path)

    def _rel_clone_path(self, absolute_path: str) -> str:
        root = self._projects_root()
        try:
            return os.path.relpath(absolute_path, root)
        except ValueError:
            return absolute_path

    @staticmethod
    def _row_to_dict(row: Any) -> Dict[str, Any]:
        # psycopg returns native datetime values for TIMESTAMPTZ columns while the
        # existing workspace API contract exposes ISO-8601 strings. Normalize at
        # the repository boundary so every project/folder/job consumer receives
        # the same stable JSON shape.
        return {
            key: value.isoformat() if isinstance(value, datetime) else value
            for key, value in dict(row).items()
        }

    @staticmethod
    def _is_folder_visible(row: Dict[str, Any], user_role: Optional[Role]) -> bool:
        if user_role is None:
            return True
        if row.get("visibility_mode") != "roles":
            return True
        raw_allowed = row.get("allowed_roles") or []
        allowed = json.loads(raw_allowed) if isinstance(raw_allowed, str) else raw_allowed
        if not allowed:
            return True
        return role_matches_allowed_role(user_role, allowed)

    # ------------------------------------------------------------------
    # Repository CRUD
    # ------------------------------------------------------------------

    def register_repository(
        self,
        name: str,
        url: str,
        clone_path_abs: str,
        import_type: str = "single",
    ) -> str:
        repo_id = _new_id("repo_")
        now = _utc_now_iso()
        rel = self._rel_clone_path(clone_path_abs)
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO ws_repositories (id,name,url,clone_path,import_type,cloned_at) VALUES (%s,%s,%s,%s,%s,%s)",
                (repo_id, name, url, rel, import_type, now),
            )
            conn.commit()
        logger.info("Registered repository %s (%s)", name, repo_id)
        return repo_id

    def get_repository_by_url(self, url: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM ws_repositories WHERE url=%s", (url,)).fetchone()
        return self._row_to_dict(row) if row else None

    def get_repository(self, repo_id: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM ws_repositories WHERE id=%s", (repo_id,)).fetchone()
        return self._row_to_dict(row) if row else None

    def repository_clone_path(self, repository: Dict[str, Any]) -> str:
        """Absolute checkout path for a repository row.

        Rows carry `clone_path` relative to the projects root so the workspace
        stays portable; callers that touch the filesystem need it resolved.
        """
        return self._abs_clone_path(str(repository.get("clone_path") or ""))

    def get_repositories(self, import_type: Optional[str] = None) -> List[Dict[str, Any]]:
        with self._connect() as conn:
            if import_type:
                rows = conn.execute("SELECT * FROM ws_repositories WHERE import_type=%s ORDER BY name", (import_type,)).fetchall()
            else:
                rows = conn.execute("SELECT * FROM ws_repositories ORDER BY name").fetchall()
        return [self._row_to_dict(r) for r in rows]

    def update_repository_synced(self, repo_id: str) -> None:
        with self._connect() as conn:
            conn.execute("UPDATE ws_repositories SET last_synced_at=%s WHERE id=%s", (_utc_now_iso(), repo_id))
            conn.commit()

    def delete_repository(self, repo_id: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM ws_repositories WHERE id=%s", (repo_id,))
            conn.commit()
        return cur.rowcount > 0

    # ------------------------------------------------------------------
    # Project CRUD
    # ------------------------------------------------------------------

    def register_project(
        self,
        repo_id: str,
        name: str,
        relative_path: str = ".",
        display_name: Optional[str] = None,
        description: str = "",
        folder_id: Optional[str] = None,
        schematic_rel: Optional[str] = None,
        pcb_rel: Optional[str] = None,
        thumbnail_rel: Optional[str] = None,
        thumbnail_source: str = "generated",
        thumbnail_digest: Optional[str] = None,
        thumbnail_media_type: Optional[str] = None,
        thumbnail_size_bytes: Optional[int] = None,
        jobset_rel: Optional[str] = None,
        has_3d_model: bool = False,
        has_ibom: bool = False,
        prism_json_hash: Optional[str] = None,
    ) -> str:
        project_id = _new_id("prj_")
        now = _utc_now_iso()
        with self._connect() as conn:
            conn.execute(
                """INSERT INTO ws_projects
                   (id,repo_id,name,display_name,description,relative_path,folder_id,
                    schematic_rel,pcb_rel,thumbnail_rel,thumbnail_source,thumbnail_digest,
                    thumbnail_media_type,thumbnail_size_bytes,jobset_rel,
                    has_3d_model,has_ibom,registered_at,last_modified,prism_json_hash)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (
                    project_id, repo_id, name, display_name, description, relative_path, folder_id,
                    schematic_rel, pcb_rel, thumbnail_rel, thumbnail_source, thumbnail_digest,
                    thumbnail_media_type, thumbnail_size_bytes, jobset_rel,
                    has_3d_model, has_ibom, now, now, prism_json_hash,
                ),
            )
            conn.commit()
        logger.info("Registered project %s (%s)", name, project_id)
        return project_id

    def _project_row_to_dict(self, row: Any) -> Dict[str, Any]:
        d = self._row_to_dict(row)
        # Resolve absolute path from repo clone_path + relative_path
        repo_clone = d.pop("repo_clone_path", None) or ""
        rel = d.get("relative_path", ".")
        abs_clone = self._abs_clone_path(repo_clone) if repo_clone else ""
        d["path"] = os.path.join(abs_clone, rel) if rel != "." else abs_clone
        d["parent_repo_path"] = abs_clone
        d["has_3d_model"] = bool(d.get("has_3d_model"))
        d["has_ibom"] = bool(d.get("has_ibom"))
        return d

    def get_all_projects(self, user_role: Optional[Role] = None) -> List[Dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """SELECT p.*, r.clone_path AS repo_clone_path, r.url AS repo_url,
                          r.name AS parent_repo, r.import_type,
                          r.last_synced_at AS repo_last_synced,
                          f.visibility_mode, f.allowed_roles
                   FROM ws_projects p
                   JOIN ws_repositories r ON r.id = p.repo_id
                   LEFT JOIN ws_folders f ON f.id = p.folder_id
                   ORDER BY p.name"""
            ).fetchall()
        projects = []
        for row in rows:
            d = self._project_row_to_dict(row)
            if user_role is not None and not self._is_folder_visible(d, user_role):
                continue
            projects.append(d)
        return projects

    def get_project_by_id(self, project_id: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute(
                """SELECT p.*, r.clone_path AS repo_clone_path, r.url AS repo_url,
                          r.name AS parent_repo, r.import_type
                   FROM ws_projects p
                   JOIN ws_repositories r ON r.id = p.repo_id
                   WHERE p.id=%s""",
                (project_id,),
            ).fetchone()
        return self._project_row_to_dict(row) if row else None

    def get_project_for_role(
        self,
        project_id: str,
        user_role: Role,
    ) -> Optional[Dict[str, Any]]:
        """Resolve and authorize a project in one PostgreSQL query."""

        viewer_fallback = user_role in {"viewer", "qa"}
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT p.*, r.clone_path AS repo_clone_path, r.url AS repo_url,
                       r.name AS parent_repo, r.import_type
                FROM ws_projects p
                JOIN ws_repositories r ON r.id = p.repo_id
                LEFT JOIN ws_folders f ON f.id = p.folder_id
                WHERE p.id = %s
                  AND (
                    f.id IS NULL
                    OR f.visibility_mode IS DISTINCT FROM 'roles'
                    OR jsonb_array_length(COALESCE(f.allowed_roles, '[]'::jsonb)) = 0
                    OR COALESCE(f.allowed_roles, '[]'::jsonb) ? %s
                    OR (%s AND COALESCE(f.allowed_roles, '[]'::jsonb) ? 'viewer')
                  )
                """,
                (project_id, user_role, viewer_fallback),
            ).fetchone()
        return self._project_row_to_dict(row) if row else None

    def get_projects_by_repo(self, repo_id: str) -> List[Dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """SELECT p.*, r.clone_path AS repo_clone_path, r.url AS repo_url,
                          r.name AS parent_repo, r.import_type
                   FROM ws_projects p
                   JOIN ws_repositories r ON r.id = p.repo_id
                   WHERE p.repo_id=%s ORDER BY p.name""",
                (repo_id,),
            ).fetchall()
        return [self._project_row_to_dict(r) for r in rows]

    def update_project(self, project_id: str, **kwargs: Any) -> bool:
        if not kwargs:
            return False
        allowed = {
            "name", "display_name", "description", "folder_id",
            "schematic_rel", "pcb_rel", "thumbnail_rel", "jobset_rel",
            "thumbnail_source", "thumbnail_digest", "thumbnail_media_type",
            "thumbnail_size_bytes",
            "has_3d_model", "has_ibom", "last_modified", "prism_json_hash",
        }
        fields = {k: v for k, v in kwargs.items() if k in allowed}
        if not fields:
            return False
        if "has_3d_model" in fields:
            fields["has_3d_model"] = bool(fields["has_3d_model"])
        if "has_ibom" in fields:
            fields["has_ibom"] = bool(fields["has_ibom"])
        sets = ", ".join(f"{k}=%s" for k in fields)
        vals = list(fields.values()) + [project_id]
        with self._connect() as conn:
            cur = conn.execute(f"UPDATE ws_projects SET {sets} WHERE id=%s", vals)
            conn.commit()
        return cur.rowcount > 0

    def move_project_to_folder(self, project_id: str, folder_id: Optional[str]) -> bool:
        try:
            return self.move_projects_to_folder([project_id], folder_id) == 1
        except ValueError as error:
            if "project not found" in str(error).lower():
                return False
            raise

    def move_projects_to_folder(self, project_ids: List[str], folder_id: Optional[str]) -> int:
        """Move a validated set of projects in one database transaction.

        Both the destination and the complete project set are locked and
        validated before the UPDATE is issued. This prevents a partial move
        when a stale or invalid project id is included in a bulk selection.
        """
        normalized_ids = list(
            dict.fromkeys(
                project_id.strip()
                for project_id in project_ids
                if project_id.strip()
            )
        )
        if not normalized_ids:
            raise ValueError("At least one project is required")

        with self._connect() as conn:
            if folder_id is not None:
                folder = conn.execute(
                    "SELECT id FROM ws_folders WHERE id=%s FOR KEY SHARE",
                    (folder_id,),
                ).fetchone()
                if not folder:
                    raise ValueError("Folder not found")

            rows = conn.execute(
                "SELECT id FROM ws_projects WHERE id = ANY(%s) FOR UPDATE",
                (normalized_ids,),
            ).fetchall()
            existing_ids = {str(row["id"]) for row in rows}
            missing_ids = [
                project_id
                for project_id in normalized_ids
                if project_id not in existing_ids
            ]
            if missing_ids:
                noun = "Project" if len(missing_ids) == 1 else "Projects"
                raise ValueError(f"{noun} not found: {', '.join(missing_ids)}")

            cursor = conn.execute(
                "UPDATE ws_projects SET folder_id=%s WHERE id = ANY(%s)",
                (folder_id, normalized_ids),
            )
            if cursor.rowcount != len(normalized_ids):
                raise RuntimeError("Bulk project move did not update the validated project set")
            conn.commit()
        return len(normalized_ids)

    def delete_project(self, project_id: str, *, force: bool = False) -> bool:
        """Remove a project and its workspace/release-studio listings.

        Release Studio history uses ``ON DELETE RESTRICT`` plus immutability
        triggers so accidental cascades cannot erase an audit chain. Project
        deletion is the explicit teardown path: unsigned candidates, builds,
        waivers, and audit events are always removed. Signed release records
        require ``force=True`` (admin).
        """
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id FROM ws_projects WHERE id=%s FOR UPDATE",
                (project_id,),
            ).fetchone()
            if not row:
                return False

            if not force:
                signed = conn.execute(
                    "SELECT COUNT(*) AS n FROM ws_release_records WHERE project_id=%s",
                    (project_id,),
                ).fetchone()
                record_count = int(signed["n"]) if signed else 0
                if record_count:
                    raise ProjectHasSignedReleasesError(project_id, record_count)

            self._purge_project_associated_rows(conn, project_id)
            cur = conn.execute("DELETE FROM ws_projects WHERE id=%s", (project_id,))
            conn.execute("DELETE FROM ws_jobs WHERE project_id=%s", (project_id,))
            conn.commit()
        return cur.rowcount > 0

    def _purge_project_associated_rows(self, conn: Any, project_id: str) -> None:
        """Drop RESTRICT/immutable rows that would otherwise block DELETE."""
        for table, trigger in _RELEASE_IMMUTABLE_TRIGGERS:
            conn.execute(f"ALTER TABLE {table} DISABLE TRIGGER {trigger}")
        try:
            conn.execute(
                """
                UPDATE ws_release_findings
                   SET waiver_id = NULL
                 WHERE waiver_id IN (
                     SELECT id FROM ws_release_waivers WHERE project_id = %s
                 )
                """,
                (project_id,),
            )
            conn.execute(
                """
                DELETE FROM ws_artifact_release_pins
                 WHERE pin_ref IN (
                           SELECT b.id
                             FROM ws_release_builds b
                             JOIN ws_release_candidates c ON c.id = b.candidate_id
                            WHERE c.project_id = %s
                       )
                    OR pin_ref IN (
                           SELECT id FROM ws_release_records WHERE project_id = %s
                       )
                    OR artifact_id IN (
                           SELECT dossier_artifact_id
                             FROM ws_release_builds b
                             JOIN ws_release_candidates c ON c.id = b.candidate_id
                            WHERE c.project_id = %s
                              AND dossier_artifact_id IS NOT NULL
                           UNION
                           SELECT evidence_artifact_id
                             FROM ws_release_builds b
                             JOIN ws_release_candidates c ON c.id = b.candidate_id
                            WHERE c.project_id = %s
                              AND evidence_artifact_id IS NOT NULL
                           UNION
                           SELECT attestation_artifact_id
                             FROM ws_release_records
                            WHERE project_id = %s
                              AND attestation_artifact_id IS NOT NULL
                       )
                """,
                (project_id, project_id, project_id, project_id, project_id),
            )
            conn.execute(
                """
                DELETE FROM ws_release_web_shares
                 WHERE record_id IN (
                     SELECT id FROM ws_release_records WHERE project_id = %s
                 )
                """,
                (project_id,),
            )
            conn.execute(
                "UPDATE ws_release_records SET superseded_by = NULL WHERE project_id = %s",
                (project_id,),
            )
            conn.execute(
                "DELETE FROM ws_release_records WHERE project_id = %s",
                (project_id,),
            )
            conn.execute(
                "DELETE FROM ws_release_approvals WHERE project_id = %s",
                (project_id,),
            )
            conn.execute(
                "DELETE FROM ws_release_waivers WHERE project_id = %s",
                (project_id,),
            )
            conn.execute(
                "DELETE FROM ws_release_audit_events WHERE project_id = %s",
                (project_id,),
            )
            conn.execute(
                "DELETE FROM ws_webgpu_ready WHERE project_id = %s",
                (project_id,),
            )
        finally:
            for table, trigger in _RELEASE_IMMUTABLE_TRIGGERS:
                conn.execute(f"ALTER TABLE {table} ENABLE TRIGGER {trigger}")

    # ------------------------------------------------------------------
    # Job CRUD
    # ------------------------------------------------------------------

    @staticmethod
    def _job_payload(fields: Dict[str, Any]) -> str:
        return json.dumps(fields, separators=(",", ":"), sort_keys=True)

    @staticmethod
    def _row_to_job(row: Any) -> Dict[str, Any]:
        raw_payload = row["payload"] or {}
        payload = json.loads(raw_payload) if isinstance(raw_payload, str) else dict(raw_payload)
        payload.update({
            "job_id": row["id"],
            "status": row["status"],
            "message": row["message"],
            "percent": row["percent"],
            "type": payload.get("type") or row["kind"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        })
        return payload

    def create_job(self, job_id: str, kind: str, **fields: Any) -> None:
        now = _utc_now_iso()
        status = str(fields.pop("status", "running"))
        message = str(fields.pop("message", ""))
        percent = float(fields.pop("percent", 0) or 0)
        fields.setdefault("type", kind)
        with self._connect() as conn:
            conn.execute(
                """INSERT INTO ws_jobs
                   (id,kind,status,message,percent,payload,created_at,updated_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                   ON CONFLICT (id) DO UPDATE SET
                     kind=EXCLUDED.kind, status=EXCLUDED.status,
                     message=EXCLUDED.message, percent=EXCLUDED.percent,
                     payload=EXCLUDED.payload, updated_at=EXCLUDED.updated_at""",
                (job_id, kind, status, message, percent, self._job_payload(fields), now, now),
            )
            conn.commit()

    def update_job(self, job_id: str, **fields: Any) -> bool:
        with self._connect() as conn:
            row = conn.execute("SELECT payload FROM ws_jobs WHERE id=%s", (job_id,)).fetchone()
            if not row:
                return False
            raw_payload = row["payload"] or {}
            payload = json.loads(raw_payload) if isinstance(raw_payload, str) else dict(raw_payload)
            status = fields.pop("status", None)
            message = fields.pop("message", None)
            percent = fields.pop("percent", None)
            payload.update(fields)
            updates = ["payload=%s", "updated_at=%s"]
            values: List[Any] = [self._job_payload(payload), _utc_now_iso()]
            if status is not None:
                updates.append("status=%s")
                values.append(str(status))
            if message is not None:
                updates.append("message=%s")
                values.append(str(message))
            if percent is not None:
                updates.append("percent=%s")
                values.append(float(percent or 0))
            values.append(job_id)
            cur = conn.execute(f"UPDATE ws_jobs SET {', '.join(updates)} WHERE id=%s", values)
            conn.commit()
        return cur.rowcount > 0

    def get_job(self, job_id: str, kind: Optional[str] = None) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            if kind:
                row = conn.execute("SELECT * FROM ws_jobs WHERE id=%s AND kind=%s", (job_id, kind)).fetchone()
            else:
                row = conn.execute("SELECT * FROM ws_jobs WHERE id=%s", (job_id,)).fetchone()
        return self._row_to_job(row) if row else None

    def delete_job(self, job_id: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM ws_jobs WHERE id=%s", (job_id,))
            conn.commit()
        return cur.rowcount > 0

    def search_projects(self, query: str, limit: int = 100, user_role: Optional[Role] = None) -> List[Dict[str, Any]]:
        like = f"%{query}%"
        with self._connect() as conn:
            rows = conn.execute(
                """SELECT p.*, r.clone_path AS repo_clone_path, r.url AS repo_url,
                          r.name AS parent_repo, r.import_type,
                          f.visibility_mode, f.allowed_roles
                   FROM ws_projects p
                   JOIN ws_repositories r ON r.id = p.repo_id
                   LEFT JOIN ws_folders f ON f.id = p.folder_id
                   WHERE p.name ILIKE %s OR p.description ILIKE %s OR r.name ILIKE %s
                   ORDER BY p.name LIMIT %s""",
                (like, like, like, limit),
            ).fetchall()
        results = []
        for row in rows:
            d = self._project_row_to_dict(row)
            if user_role is not None and not self._is_folder_visible(d, user_role):
                continue
            results.append(d)
        return results

    # ------------------------------------------------------------------
    # Portfolio CRUD
    # ------------------------------------------------------------------

    def upsert_portfolio(self, project_id: str, model_rel: Optional[str] = None,
                         tags: Optional[List[str]] = None, scene_config: Optional[str] = None) -> None:
        tags_json = json.dumps(tags or [])
        with self._connect() as conn:
            conn.execute(
                """INSERT INTO ws_project_portfolio (project_id,model_rel,tags,scene_config)
                   VALUES (%s,%s,%s,%s)
                   ON CONFLICT(project_id) DO UPDATE SET
                     model_rel=excluded.model_rel, tags=excluded.tags, scene_config=excluded.scene_config""",
                (project_id, model_rel, tags_json, scene_config),
            )
            conn.commit()

    def get_portfolio(self, project_id: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM ws_project_portfolio WHERE project_id=%s", (project_id,)).fetchone()
        if not row:
            return None
        d = self._row_to_dict(row)
        raw_tags = d.get("tags") or []
        d["tags"] = json.loads(raw_tags) if isinstance(raw_tags, str) else raw_tags
        return d

    # ------------------------------------------------------------------
    # Folder CRUD
    # ------------------------------------------------------------------

    def create_folder(self, name: str, parent_id: Optional[str] = None,
                      visibility_mode: Optional[str] = None, allowed_roles: Optional[List[str]] = None) -> Dict[str, Any]:
        name = name.strip()
        if not name:
            raise ValueError("Folder name cannot be empty")
        if visibility_mode and visibility_mode not in (None, "roles"):
            visibility_mode = None
        folder_id = _new_id("fld_")
        now = _utc_now_iso()
        roles_json = json.dumps(allowed_roles or [])
        with self._connect() as conn:
            if parent_id is not None:
                parent = conn.execute("SELECT id FROM ws_folders WHERE id=%s", (parent_id,)).fetchone()
                if not parent:
                    raise ValueError("Parent folder not found")
            try:
                conn.execute(
                    """INSERT INTO ws_folders (id,name,parent_id,visibility_mode,allowed_roles,created_at,updated_at)
                       VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                    (folder_id, name, parent_id, visibility_mode, roles_json, now, now),
                )
                conn.commit()
            except Exception as error:
                if getattr(error, "sqlstate", None) != "23505":
                    raise
                raise ValueError("A folder with this name already exists in this location")
        return {"id": folder_id, "name": name, "parent_id": parent_id, "visibility_mode": visibility_mode,
                "allowed_roles": allowed_roles or [], "created_at": now, "updated_at": now}

    def get_folder(self, folder_id: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM ws_folders WHERE id=%s", (folder_id,)).fetchone()
        if not row:
            return None
        d = self._row_to_dict(row)
        raw_roles = d.get("allowed_roles") or []
        d["allowed_roles"] = json.loads(raw_roles) if isinstance(raw_roles, str) else raw_roles
        return d

    _UNSET = object()

    def update_folder(self, folder_id: str, name: Optional[str] = None, parent_id: object = None, _use_parent: bool = False) -> Dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM ws_folders WHERE id=%s", (folder_id,)).fetchone()
            if not row:
                raise ValueError("Folder not found")
            folder = self._row_to_dict(row)
            target_name = name.strip() if name is not None else folder["name"]
            target_parent = parent_id if _use_parent else folder["parent_id"]
            if not target_name:
                raise ValueError("Folder name cannot be empty")
            if target_parent == folder_id:
                raise ValueError("Folder cannot be its own parent")
            if target_parent is not None:
                p = conn.execute("SELECT id FROM ws_folders WHERE id=%s", (target_parent,)).fetchone()
                if not p:
                    raise ValueError("Parent folder not found")
                # Prevent cycles
                current = target_parent
                visited = {folder_id}
                while current is not None:
                    if current in visited:
                        raise ValueError("Cannot move a folder into itself or its descendants")
                    visited.add(current)
                    anc = conn.execute("SELECT parent_id FROM ws_folders WHERE id=%s", (current,)).fetchone()
                    current = anc["parent_id"] if anc else None
            now = _utc_now_iso()
            try:
                conn.execute(
                    "UPDATE ws_folders SET name=%s, parent_id=%s, updated_at=%s WHERE id=%s",
                    (target_name, target_parent, now, folder_id),
                )
                conn.commit()
            except Exception as error:
                if getattr(error, "sqlstate", None) != "23505":
                    raise
                raise ValueError("A folder with this name already exists in this location")
        folder["name"] = target_name
        folder["parent_id"] = target_parent
        folder["updated_at"] = now
        raw_roles = folder.get("allowed_roles") or []
        folder["allowed_roles"] = json.loads(raw_roles) if isinstance(raw_roles, str) else raw_roles
        return folder



    def delete_folder(self, folder_id: str, cascade: bool = True) -> bool:
        with self._connect() as conn:
            row = conn.execute("SELECT id FROM ws_folders WHERE id=%s", (folder_id,)).fetchone()
            if not row:
                return False
            if not cascade:
                children = conn.execute("SELECT id FROM ws_folders WHERE parent_id=%s", (folder_id,)).fetchall()
                if children:
                    raise ValueError("Folder has subfolders. Use cascade delete or move subfolders first.")
            # Move projects in deleted folder(s) to root (folder_id=NULL)
            if cascade:
                # Collect all descendant folder ids
                desc_ids = [folder_id]
                queue = [folder_id]
                while queue:
                    fid = queue.pop()
                    kids = conn.execute("SELECT id FROM ws_folders WHERE parent_id=%s", (fid,)).fetchall()
                    for k in kids:
                        desc_ids.append(k["id"])
                        queue.append(k["id"])
                placeholders = ",".join(["%s"] * len(desc_ids))
                conn.execute(f"UPDATE ws_projects SET folder_id=NULL WHERE folder_id IN ({placeholders})", desc_ids)
            else:
                conn.execute("UPDATE ws_projects SET folder_id=NULL WHERE folder_id=%s", (folder_id,))
            conn.execute("DELETE FROM ws_folders WHERE id=%s", (folder_id,))
            conn.commit()
        return True

    def _build_folder_tree(
        self,
        folders: List[Any],
        counts: List[Any],
        user_role: Optional[Role] = None,
    ) -> List[Dict[str, Any]]:
        """Build the API folder tree from rows already fetched in one snapshot."""

        count_map = {r["folder_id"]: r["cnt"] for r in counts}
        folder_list = [self._row_to_dict(f) for f in folders]
        for f in folder_list:
            raw_roles = f.get("allowed_roles") or []
            f["allowed_roles"] = json.loads(raw_roles) if isinstance(raw_roles, str) else raw_roles
        if user_role is not None:
            folder_list = [f for f in folder_list if self._is_folder_visible(f, user_role)]
        visible_ids = {f["id"] for f in folder_list}
        children_map: Dict[Optional[str], List[Dict]] = {}
        for f in folder_list:
            children_map.setdefault(f["parent_id"], []).append(f)
        result: List[Dict[str, Any]] = []

        def _walk(pid: Optional[str], depth: int) -> int:
            total = 0
            for f in children_map.get(pid, []):
                fid = f["id"]
                direct = count_map.get(fid, 0)
                child_kids = [c for c in children_map.get(fid, []) if c["id"] in visible_ids]
                idx = len(result)
                result.append({
                    "id": fid, "name": f["name"], "parent_id": f["parent_id"],
                    "depth": depth, "has_children": len(child_kids) > 0,
                    "direct_project_count": direct, "total_project_count": 0,
                    "visibility_mode": f.get("visibility_mode"),
                    "allowed_roles": f.get("allowed_roles", []),
                })
                subtotal = _walk(fid, depth + 1)
                result[idx]["total_project_count"] = direct + subtotal
                total += direct + subtotal
            return total

        _walk(None, 0)
        return result

    def get_folder_tree(self, user_role: Optional[Role] = None) -> List[Dict[str, Any]]:
        with self._connect() as conn:
            folders = conn.execute("SELECT * FROM ws_folders ORDER BY name").fetchall()
            counts = conn.execute(
                "SELECT folder_id, COUNT(*) AS cnt FROM ws_projects WHERE folder_id IS NOT NULL GROUP BY folder_id"
            ).fetchall()
        return self._build_folder_tree(folders, counts, user_role)

    def get_folder_contents(self, folder_id: Optional[str], user_role: Optional[Role] = None) -> Dict[str, Any]:
        with self._connect() as conn:
            if folder_id is not None:
                row = conn.execute("SELECT * FROM ws_folders WHERE id=%s", (folder_id,)).fetchone()
                if not row:
                    raise ValueError("Folder not found")
                fd = self._row_to_dict(row)
                raw_roles = fd.get("allowed_roles") or []
                fd["allowed_roles"] = json.loads(raw_roles) if isinstance(raw_roles, str) else raw_roles
                if not self._is_folder_visible(fd, user_role):
                    raise ValueError("Folder not found")
            child_folders = conn.execute(
                "SELECT * FROM ws_folders WHERE parent_id IS NOT DISTINCT FROM %s ORDER BY name",
                (folder_id,),
            ).fetchall()
            projects = conn.execute(
                """SELECT p.*, r.clone_path AS repo_clone_path, r.url AS repo_url,
                          r.name AS parent_repo, r.import_type
                   FROM ws_projects p JOIN ws_repositories r ON r.id=p.repo_id
                   WHERE p.folder_id IS NOT DISTINCT FROM %s ORDER BY p.name""",
                (folder_id,),
            ).fetchall()
        cf_list = []
        for f in child_folders:
            fd = self._row_to_dict(f)
            raw_roles = fd.get("allowed_roles") or []
            fd["allowed_roles"] = json.loads(raw_roles) if isinstance(raw_roles, str) else raw_roles
            if user_role is not None and not self._is_folder_visible(fd, user_role):
                continue
            cf_list.append(fd)
        return {
            "folders": cf_list,
            "projects": [self._project_row_to_dict(p) for p in projects],
        }

    def is_folder_visible_to_role(self, folder_id: Optional[str], user_role: Optional[Role]) -> bool:
        if folder_id is None:
            return True
        f = self.get_folder(folder_id)
        if not f:
            return False
        return self._is_folder_visible(f, user_role)

    # ------------------------------------------------------------------
    # Bootstrap (single query for workspace view)
    # ------------------------------------------------------------------

    def get_bootstrap_data(self, user_role: Optional[Role] = None) -> Dict[str, Any]:
        role = user_role or "admin"
        bypass_visibility = user_role is None
        viewer_fallback = role in {"viewer", "qa"}
        with self._connect() as conn:
            row = conn.execute(
                """
                WITH visible_folders AS (
                    SELECT f.*
                    FROM ws_folders f
                    WHERE %s
                       OR f.visibility_mode IS DISTINCT FROM 'roles'
                       OR jsonb_array_length(COALESCE(f.allowed_roles, '[]'::jsonb)) = 0
                       OR COALESCE(f.allowed_roles, '[]'::jsonb) ? %s
                       OR (%s AND COALESCE(f.allowed_roles, '[]'::jsonb) ? 'viewer')
                ),
                project_rows AS (
                    SELECT p.*, r.clone_path AS repo_clone_path, r.url AS repo_url,
                           r.name AS parent_repo, r.import_type,
                           r.last_synced_at AS repo_last_synced,
                           f.visibility_mode, f.allowed_roles
                    FROM ws_projects p
                    JOIN ws_repositories r ON r.id = p.repo_id
                    LEFT JOIN ws_folders f ON f.id = p.folder_id
                    WHERE f.id IS NULL
                       OR %s
                       OR f.id IN (SELECT id FROM visible_folders)
                ),
                folder_counts AS (
                    SELECT folder_id, COUNT(*) AS cnt
                    FROM project_rows
                    WHERE folder_id IS NOT NULL
                    GROUP BY folder_id
                )
                SELECT
                    COALESCE(
                        (SELECT jsonb_agg(to_jsonb(project_rows) ORDER BY name)
                         FROM project_rows),
                        '[]'::jsonb
                    ) AS projects,
                    COALESCE(
                        (SELECT jsonb_agg(to_jsonb(visible_folders) ORDER BY name)
                         FROM visible_folders),
                        '[]'::jsonb
                    ) AS folders,
                    COALESCE(
                        (SELECT jsonb_agg(to_jsonb(folder_counts))
                         FROM folder_counts),
                        '[]'::jsonb
                    ) AS counts,
                    COALESCE(
                        (SELECT version FROM ws_workspace_state WHERE id = 1),
                        1
                    ) AS version
                """,
                (bypass_visibility, role, viewer_fallback, bypass_visibility),
            ).fetchone()
        projects = [
            self._project_row_to_dict(project)
            for project in list(row["projects"] or [])
        ]
        return {
            "projects": projects,
            "folders": self._build_folder_tree(
                list(row["folders"] or []),
                list(row["counts"] or []),
                None,
            ),
            "version": int(row["version"] or 1),
        }


# Module-level singleton
workspace = WorkspaceService()
