"""
Workspace Service for KiCAD Prism.

SQLite-backed project registry and folder tree, replacing the old
JSON-file persistence in project_service.py and folder_service.py.
Tables live inside the shared prism.sqlite3 (WAL mode).
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import sqlite3
import threading
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.core.roles import Role

logger = logging.getLogger(__name__)

_DEFAULT_STORE_DIRNAME = ".kicad-prism"
_CATALOG_DB_FILENAME = "prism.sqlite3"


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _new_id(prefix: str = "") -> str:
    return f"{prefix}{uuid.uuid4().hex[:12]}"


def _hash_file(path: Path) -> str | None:
    if not path.is_file():
        return None
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()
    except OSError:
        return None


class WorkspaceService:
    """SQLite-backed workspace persistence."""

    def __init__(self) -> None:
        self._db_path = self._resolve_db_path()
        self._lock = threading.Lock()
        self._initialized = False

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def _resolve_db_path(self) -> Path:
        configured = settings.CATALOG_SQLITE_PATH
        if configured:
            raw = (
                configured.removeprefix("sqlite:///")
                if configured.startswith("sqlite:///")
                else configured
            )
            return Path(raw).expanduser().resolve()
        return (
            Path(settings.KICAD_PROJECTS_ROOT)
            / _DEFAULT_STORE_DIRNAME
            / _CATALOG_DB_FILENAME
        ).resolve()

    def initialize(self) -> None:
        with self._lock:
            if self._initialized:
                return
            self._db_path.parent.mkdir(parents=True, exist_ok=True)
            with self._connect() as conn:
                self._create_schema(conn)
                conn.commit()
            self._initialized = True
            logger.info("Workspace service initialized (db=%s)", self._db_path)

    # ------------------------------------------------------------------
    # Connection
    # ------------------------------------------------------------------

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(str(self._db_path), timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA synchronous = NORMAL")
        conn.execute("PRAGMA busy_timeout = 5000")
        conn.execute("PRAGMA temp_store = MEMORY")
        conn.execute("PRAGMA cache_size = -64000")
        conn.execute("PRAGMA wal_autocheckpoint = 1000")
        try:
            yield conn
        finally:
            conn.close()

    # ------------------------------------------------------------------
    # Schema
    # ------------------------------------------------------------------

    def _create_schema(self, conn: sqlite3.Connection) -> None:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS ws_repositories (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                url         TEXT NOT NULL UNIQUE,
                clone_path  TEXT NOT NULL UNIQUE,
                import_type TEXT NOT NULL DEFAULT 'single',
                cloned_at   TEXT NOT NULL,
                last_synced_at TEXT
            );

            CREATE TABLE IF NOT EXISTS ws_folders (
                id              TEXT PRIMARY KEY,
                name            TEXT NOT NULL,
                parent_id       TEXT REFERENCES ws_folders(id) ON DELETE CASCADE,
                visibility_mode TEXT,
                allowed_roles   TEXT NOT NULL DEFAULT '[]',
                created_at      TEXT NOT NULL,
                updated_at      TEXT NOT NULL,
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
                has_3d_model    INTEGER NOT NULL DEFAULT 0,
                has_ibom        INTEGER NOT NULL DEFAULT 0,
                registered_at   TEXT NOT NULL,
                last_modified   TEXT NOT NULL,
                prism_json_hash TEXT,
                UNIQUE(repo_id, relative_path)
            );
            CREATE INDEX IF NOT EXISTS idx_ws_projects_folder ON ws_projects(folder_id);
            CREATE INDEX IF NOT EXISTS idx_ws_projects_repo   ON ws_projects(repo_id);

            CREATE TABLE IF NOT EXISTS ws_project_portfolio (
                project_id  TEXT PRIMARY KEY REFERENCES ws_projects(id) ON DELETE CASCADE,
                model_rel   TEXT,
                tags        TEXT NOT NULL DEFAULT '[]',
                scene_config TEXT
            );
        """)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _projects_root() -> str:
        return os.environ.get(
            "KICAD_PROJECTS_ROOT",
            os.path.abspath(
                os.path.join(os.path.dirname(__file__), "../../../data/projects")
            ),
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
    def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
        return dict(row)

    @staticmethod
    def _is_folder_visible(row: dict[str, Any], user_role: Role | None) -> bool:
        if user_role is None:
            return True
        if row.get("visibility_mode") != "roles":
            return True
        allowed = json.loads(row.get("allowed_roles") or "[]")
        if not allowed:
            return True
        return user_role in allowed

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
                "INSERT INTO ws_repositories (id,name,url,clone_path,import_type,cloned_at) VALUES (?,?,?,?,?,?)",
                (repo_id, name, url, rel, import_type, now),
            )
            conn.commit()
        logger.info("Registered repository %s (%s)", name, repo_id)
        return repo_id

    def get_repository_by_url(self, url: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM ws_repositories WHERE url=?", (url,)
            ).fetchone()
        return self._row_to_dict(row) if row else None

    def get_repository(self, repo_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM ws_repositories WHERE id=?", (repo_id,)
            ).fetchone()
        return self._row_to_dict(row) if row else None

    def get_repositories(self, import_type: str | None = None) -> list[dict[str, Any]]:
        with self._connect() as conn:
            if import_type:
                rows = conn.execute(
                    "SELECT * FROM ws_repositories WHERE import_type=? ORDER BY name",
                    (import_type,),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM ws_repositories ORDER BY name"
                ).fetchall()
        return [self._row_to_dict(r) for r in rows]

    def update_repository_synced(self, repo_id: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE ws_repositories SET last_synced_at=? WHERE id=?",
                (_utc_now_iso(), repo_id),
            )
            conn.commit()

    def delete_repository(self, repo_id: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM ws_repositories WHERE id=?", (repo_id,))
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
        display_name: str | None = None,
        description: str = "",
        folder_id: str | None = None,
        schematic_rel: str | None = None,
        pcb_rel: str | None = None,
        thumbnail_rel: str | None = None,
        jobset_rel: str | None = None,
        has_3d_model: bool = False,
        has_ibom: bool = False,
        prism_json_hash: str | None = None,
    ) -> str:
        project_id = _new_id("prj_")
        now = _utc_now_iso()
        with self._connect() as conn:
            conn.execute(
                """INSERT INTO ws_projects
                   (id,repo_id,name,display_name,description,relative_path,folder_id,
                    schematic_rel,pcb_rel,thumbnail_rel,jobset_rel,
                    has_3d_model,has_ibom,registered_at,last_modified,prism_json_hash)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    project_id,
                    repo_id,
                    name,
                    display_name,
                    description,
                    relative_path,
                    folder_id,
                    schematic_rel,
                    pcb_rel,
                    thumbnail_rel,
                    jobset_rel,
                    int(has_3d_model),
                    int(has_ibom),
                    now,
                    now,
                    prism_json_hash,
                ),
            )
            conn.commit()
        logger.info("Registered project %s (%s)", name, project_id)
        return project_id

    def _project_row_to_dict(self, row: sqlite3.Row) -> dict[str, Any]:
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

    def get_all_projects(self, user_role: Role | None = None) -> list[dict[str, Any]]:
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

    def get_project_by_id(self, project_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                """SELECT p.*, r.clone_path AS repo_clone_path, r.url AS repo_url,
                          r.name AS parent_repo, r.import_type
                   FROM ws_projects p
                   JOIN ws_repositories r ON r.id = p.repo_id
                   WHERE p.id=?""",
                (project_id,),
            ).fetchone()
        return self._project_row_to_dict(row) if row else None

    def get_projects_by_repo(self, repo_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """SELECT p.*, r.clone_path AS repo_clone_path, r.url AS repo_url,
                          r.name AS parent_repo, r.import_type
                   FROM ws_projects p
                   JOIN ws_repositories r ON r.id = p.repo_id
                   WHERE p.repo_id=? ORDER BY p.name""",
                (repo_id,),
            ).fetchall()
        return [self._project_row_to_dict(r) for r in rows]

    def update_project(self, project_id: str, **kwargs: Any) -> bool:
        if not kwargs:
            return False
        allowed = {
            "name",
            "display_name",
            "description",
            "folder_id",
            "schematic_rel",
            "pcb_rel",
            "thumbnail_rel",
            "jobset_rel",
            "has_3d_model",
            "has_ibom",
            "last_modified",
            "prism_json_hash",
        }
        fields = {k: v for k, v in kwargs.items() if k in allowed}
        if not fields:
            return False
        if "has_3d_model" in fields:
            fields["has_3d_model"] = int(fields["has_3d_model"])
        if "has_ibom" in fields:
            fields["has_ibom"] = int(fields["has_ibom"])
        sets = ", ".join(f"{k}=?" for k in fields)
        vals = list(fields.values()) + [project_id]
        with self._connect() as conn:
            cur = conn.execute(f"UPDATE ws_projects SET {sets} WHERE id=?", vals)  # noqa: S608  # nosec B608 â€” keys filtered against explicit allowlist above
            conn.commit()
        return cur.rowcount > 0

    def move_project_to_folder(self, project_id: str, folder_id: str | None) -> bool:
        return self.update_project(project_id, folder_id=folder_id)

    def delete_project(self, project_id: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM ws_projects WHERE id=?", (project_id,))
            conn.commit()
        return cur.rowcount > 0

    def search_projects(
        self, query: str, limit: int = 100, user_role: Role | None = None
    ) -> list[dict[str, Any]]:
        like = f"%{query}%"
        with self._connect() as conn:
            rows = conn.execute(
                """SELECT p.*, r.clone_path AS repo_clone_path, r.url AS repo_url,
                          r.name AS parent_repo, r.import_type,
                          f.visibility_mode, f.allowed_roles
                   FROM ws_projects p
                   JOIN ws_repositories r ON r.id = p.repo_id
                   LEFT JOIN ws_folders f ON f.id = p.folder_id
                   WHERE p.name LIKE ? OR p.description LIKE ? OR r.name LIKE ?
                   ORDER BY p.name LIMIT ?""",
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

    def upsert_portfolio(
        self,
        project_id: str,
        model_rel: str | None = None,
        tags: list[str] | None = None,
        scene_config: str | None = None,
    ) -> None:
        tags_json = json.dumps(tags or [])
        with self._connect() as conn:
            conn.execute(
                """INSERT INTO ws_project_portfolio (project_id,model_rel,tags,scene_config)
                   VALUES (?,?,?,?)
                   ON CONFLICT(project_id) DO UPDATE SET
                     model_rel=excluded.model_rel, tags=excluded.tags, scene_config=excluded.scene_config""",
                (project_id, model_rel, tags_json, scene_config),
            )
            conn.commit()

    def get_portfolio(self, project_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM ws_project_portfolio WHERE project_id=?", (project_id,)
            ).fetchone()
        if not row:
            return None
        d = self._row_to_dict(row)
        d["tags"] = json.loads(d.get("tags") or "[]")
        return d

    # ------------------------------------------------------------------
    # Folder CRUD
    # ------------------------------------------------------------------

    def create_folder(
        self,
        name: str,
        parent_id: str | None = None,
        visibility_mode: str | None = None,
        allowed_roles: list[str] | None = None,
    ) -> dict[str, Any]:
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
                parent = conn.execute(
                    "SELECT id FROM ws_folders WHERE id=?", (parent_id,)
                ).fetchone()
                if not parent:
                    raise ValueError("Parent folder not found")
            try:
                conn.execute(
                    """INSERT INTO ws_folders (id,name,parent_id,visibility_mode,allowed_roles,created_at,updated_at)
                       VALUES (?,?,?,?,?,?,?)""",
                    (folder_id, name, parent_id, visibility_mode, roles_json, now, now),
                )
                conn.commit()
            except sqlite3.IntegrityError as err:
                raise ValueError(
                    "A folder with this name already exists in this location"
                ) from err
        return {
            "id": folder_id,
            "name": name,
            "parent_id": parent_id,
            "visibility_mode": visibility_mode,
            "allowed_roles": allowed_roles or [],
            "created_at": now,
            "updated_at": now,
        }

    def get_folder(self, folder_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM ws_folders WHERE id=?", (folder_id,)
            ).fetchone()
        if not row:
            return None
        d = self._row_to_dict(row)
        d["allowed_roles"] = json.loads(d.get("allowed_roles") or "[]")
        return d

    _UNSET = object()

    def update_folder(
        self,
        folder_id: str,
        name: str | None = None,
        parent_id: object = None,
        _use_parent: bool = False,
    ) -> dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM ws_folders WHERE id=?", (folder_id,)
            ).fetchone()
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
                p = conn.execute(
                    "SELECT id FROM ws_folders WHERE id=?", (target_parent,)
                ).fetchone()
                if not p:
                    raise ValueError("Parent folder not found")
                # Prevent cycles
                current = target_parent
                visited = {folder_id}
                while current is not None:
                    if current in visited:
                        raise ValueError(
                            "Cannot move a folder into itself or its descendants"
                        )
                    visited.add(current)
                    anc = conn.execute(
                        "SELECT parent_id FROM ws_folders WHERE id=?", (current,)
                    ).fetchone()
                    current = anc["parent_id"] if anc else None
            now = _utc_now_iso()
            try:
                conn.execute(
                    "UPDATE ws_folders SET name=?, parent_id=?, updated_at=? WHERE id=?",
                    (target_name, target_parent, now, folder_id),
                )
                conn.commit()
            except sqlite3.IntegrityError as err:
                raise ValueError(
                    "A folder with this name already exists in this location"
                ) from err
        folder["name"] = target_name
        folder["parent_id"] = target_parent
        folder["updated_at"] = now
        folder["allowed_roles"] = json.loads(folder.get("allowed_roles") or "[]")
        return folder

    def delete_folder(self, folder_id: str, cascade: bool = True) -> bool:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id FROM ws_folders WHERE id=?", (folder_id,)
            ).fetchone()
            if not row:
                return False
            if not cascade:
                children = conn.execute(
                    "SELECT id FROM ws_folders WHERE parent_id=?", (folder_id,)
                ).fetchall()
                if children:
                    raise ValueError(
                        "Folder has subfolders. Use cascade delete or move subfolders first."
                    )
            # Move projects in deleted folder(s) to root (folder_id=NULL)
            if cascade:
                # Collect all descendant folder ids
                desc_ids = [folder_id]
                queue = [folder_id]
                while queue:
                    fid = queue.pop()
                    kids = conn.execute(
                        "SELECT id FROM ws_folders WHERE parent_id=?", (fid,)
                    ).fetchall()
                    for k in kids:
                        desc_ids.append(k["id"])
                        queue.append(k["id"])
                placeholders = ",".join("?" * len(desc_ids))
                conn.execute(
                    f"UPDATE ws_projects SET folder_id=NULL WHERE folder_id IN ({placeholders})",  # noqa: S608  # nosec B608 â€” placeholders are "?" * len(desc_ids)
                    desc_ids,
                )
            else:
                conn.execute(
                    "UPDATE ws_projects SET folder_id=NULL WHERE folder_id=?",
                    (folder_id,),
                )
            conn.execute("DELETE FROM ws_folders WHERE id=?", (folder_id,))
            conn.commit()
        return True

    def get_folder_tree(self, user_role: Role | None = None) -> list[dict[str, Any]]:
        with self._connect() as conn:
            folders = conn.execute("SELECT * FROM ws_folders ORDER BY name").fetchall()
            counts = conn.execute(
                "SELECT folder_id, COUNT(*) AS cnt FROM ws_projects WHERE folder_id IS NOT NULL GROUP BY folder_id"
            ).fetchall()
        count_map = {r["folder_id"]: r["cnt"] for r in counts}
        folder_list = [self._row_to_dict(f) for f in folders]
        for f in folder_list:
            f["allowed_roles"] = json.loads(f.get("allowed_roles") or "[]")
        # Filter by role
        if user_role is not None:
            folder_list = [
                f for f in folder_list if self._is_folder_visible(f, user_role)
            ]
        visible_ids = {f["id"] for f in folder_list}
        # Build children map
        children_map: dict[str | None, list[dict]] = {}
        for f in folder_list:
            children_map.setdefault(f["parent_id"], []).append(f)
        # DFS to build flat tree
        result: list[dict[str, Any]] = []

        def _walk(pid: str | None, depth: int) -> int:
            total = 0
            for f in children_map.get(pid, []):
                fid = f["id"]
                direct = count_map.get(fid, 0)
                child_kids = [
                    c for c in children_map.get(fid, []) if c["id"] in visible_ids
                ]
                idx = len(result)
                result.append(
                    {
                        "id": fid,
                        "name": f["name"],
                        "parent_id": f["parent_id"],
                        "depth": depth,
                        "has_children": len(child_kids) > 0,
                        "direct_project_count": direct,
                        "total_project_count": 0,
                        "visibility_mode": f.get("visibility_mode"),
                        "allowed_roles": f.get("allowed_roles", []),
                    }
                )
                subtotal = _walk(fid, depth + 1)
                result[idx]["total_project_count"] = direct + subtotal
                total += direct + subtotal
            return total

        _walk(None, 0)
        return result

    def get_folder_contents(
        self, folder_id: str | None, user_role: Role | None = None
    ) -> dict[str, Any]:
        with self._connect() as conn:
            if folder_id is not None:
                row = conn.execute(
                    "SELECT * FROM ws_folders WHERE id=?", (folder_id,)
                ).fetchone()
                if not row:
                    raise ValueError("Folder not found")
                fd = self._row_to_dict(row)
                fd["allowed_roles"] = json.loads(fd.get("allowed_roles") or "[]")
                if not self._is_folder_visible(fd, user_role):
                    raise ValueError("Folder not found")
            child_folders = conn.execute(
                "SELECT * FROM ws_folders WHERE parent_id IS ? ORDER BY name",
                (folder_id,),
            ).fetchall()
            projects = conn.execute(
                """SELECT p.*, r.clone_path AS repo_clone_path, r.url AS repo_url,
                          r.name AS parent_repo, r.import_type
                   FROM ws_projects p JOIN ws_repositories r ON r.id=p.repo_id
                   WHERE p.folder_id IS ? ORDER BY p.name""",
                (folder_id,),
            ).fetchall()
        cf_list = []
        for f in child_folders:
            fd = self._row_to_dict(f)
            fd["allowed_roles"] = json.loads(fd.get("allowed_roles") or "[]")
            if user_role is not None and not self._is_folder_visible(fd, user_role):
                continue
            cf_list.append(fd)
        return {
            "folders": cf_list,
            "projects": [self._project_row_to_dict(p) for p in projects],
        }

    def is_folder_visible_to_role(
        self, folder_id: str | None, user_role: Role | None
    ) -> bool:
        if folder_id is None:
            return True
        f = self.get_folder(folder_id)
        if not f:
            return False
        return self._is_folder_visible(f, user_role)

    # ------------------------------------------------------------------
    # Bootstrap (single query for workspace view)
    # ------------------------------------------------------------------

    def get_bootstrap_data(self, user_role: Role | None = None) -> dict[str, Any]:
        return {
            "projects": self.get_all_projects(user_role),
            "folders": self.get_folder_tree(user_role),
        }


# Module-level singleton
workspace = WorkspaceService()
