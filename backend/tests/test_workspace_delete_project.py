"""Project deletion must cascade Release Studio listings instead of 500ing."""

from __future__ import annotations

import asyncio
import os
import sys
import unittest
import uuid
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from urllib.parse import urlsplit

from fastapi import HTTPException


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover - dependency guard for host-only checks
    psycopg = None  # type: ignore[assignment]
    dict_row = None  # type: ignore[assignment]

from app.services.workspace_service import (  # noqa: E402
    ProjectHasSignedReleasesError,
    WorkspaceService,
)


TEST_POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL", "").strip()
APPLICATION_POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()


def _database_identity(url: str) -> tuple[str, str, int | None, str]:
    parsed = urlsplit(url)
    return (
        parsed.username or "",
        (parsed.hostname or "").lower(),
        parsed.port,
        parsed.path.lstrip("/"),
    )


SHARED_APPLICATION_DATABASE = bool(
    TEST_POSTGRES_URL
    and APPLICATION_POSTGRES_URL
    and _database_identity(TEST_POSTGRES_URL) == _database_identity(APPLICATION_POSTGRES_URL)
)


def _run(coro):
    return asyncio.run(coro)


class _User:
    def __init__(self, role: str) -> None:
        self.role = role
        self.email = f"{role}@example.test"
        self.name = role
        self.auth_type = "session"


@unittest.skipIf(psycopg is None, "psycopg is required")
@unittest.skipIf(not TEST_POSTGRES_URL, "TEST_POSTGRES_URL must point at an isolated database")
@unittest.skipIf(
    SHARED_APPLICATION_DATABASE,
    "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL",
)
class WorkspaceDeleteProjectTests(unittest.TestCase):
    def setUp(self) -> None:
        from app.services.workspace_schema_migrations import apply_workspace_migrations

        self.schema = f"ws_del_{uuid.uuid4().hex[:10]}"
        self.conn = psycopg.connect(TEST_POSTGRES_URL, row_factory=dict_row)
        self.addCleanup(self.conn.close)
        self.conn.execute(f'CREATE SCHEMA "{self.schema}"')
        self.conn.execute(f'SET search_path TO "{self.schema}", public')
        self.conn.execute(
            """
            CREATE TABLE ws_repositories (id TEXT PRIMARY KEY);
            CREATE TABLE ws_folders (id TEXT PRIMARY KEY);
            CREATE TABLE ws_projects (
                id TEXT PRIMARY KEY,
                repo_id TEXT NOT NULL REFERENCES ws_repositories(id)
            );
            CREATE TABLE ws_project_portfolio (
                project_id TEXT PRIMARY KEY REFERENCES ws_projects(id) ON DELETE CASCADE
            );
            CREATE TABLE ws_jobs (
                id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL,
                message TEXT NOT NULL DEFAULT '', percent REAL NOT NULL DEFAULT 0,
                payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """,
            prepare=False,
        )
        apply_workspace_migrations(self.conn)
        self.conn.commit()
        self.addCleanup(self._drop)

        service = WorkspaceService()
        schema = self.schema

        @contextmanager
        def _connect():
            conn = psycopg.connect(TEST_POSTGRES_URL, row_factory=dict_row)
            try:
                conn.execute(f'SET search_path TO "{schema}", public')
                yield conn
                if not conn.closed:
                    conn.rollback()
            finally:
                conn.close()

        self.service = service
        self.service._connect = _connect  # type: ignore[method-assign]

    def _drop(self) -> None:
        self.conn.rollback()
        self.conn.execute(f'DROP SCHEMA IF EXISTS "{self.schema}" CASCADE')
        self.conn.commit()

    def _seed_unsigned_history(self) -> str:
        suffix = uuid.uuid4().hex[:8]
        project_id = f"prj_{suffix}"
        repo_id = f"repo_{suffix}"
        self.conn.execute("INSERT INTO ws_repositories(id) VALUES (%s)", (repo_id,))
        self.conn.execute(
            "INSERT INTO ws_projects(id, repo_id) VALUES (%s, %s)",
            (project_id, repo_id),
        )
        self.conn.execute(
            """
            INSERT INTO ws_release_candidates(
                id, project_id, repository_id, config_key, commit_sha, variant,
                technical_config_digest, input_closure_digest, toolchain_digest,
                generator_build, build_key, status
            )
            VALUES (%s, %s, %s, 'default', 'commit-1', '',
                    'technical-1', 'closure-1', 'toolchain-1', 'generator-1',
                    %s, 'built')
            """,
            (f"cand_{suffix}", project_id, repo_id, f"build-key-{suffix}"),
        )
        self.conn.execute(
            """
            INSERT INTO ws_release_waivers(
                id, project_id, config_key, rule_id, domain, subject_pattern,
                finding_key, reason, owner
            )
            VALUES (%s, %s, 'default', 'rule-1', 'bare_board', '*',
                    'finding-1', 'temporary lab exception', 'owner@example.test')
            """,
            (f"waiver_{suffix}", project_id),
        )
        self.conn.execute(
            """
            INSERT INTO ws_release_audit_events(
                id, project_id, config_key, sequence, event_type, actor,
                subject_kind, subject_id, previous_hash, event_hash, created_at_iso
            )
            VALUES (%s, %s, 'default', 1, 'candidate.created', 'user@example.test',
                    'candidate', %s, NULL, 'event-hash-1', '2026-01-01T00:00:00Z')
            """,
            (f"audit_{suffix}", project_id, f"cand_{suffix}"),
        )
        self.conn.commit()
        return project_id

    def _seed_signed_release(self) -> str:
        suffix = uuid.uuid4().hex[:8]
        ids = {
            "project": f"prj_{suffix}",
            "repository": f"repo_{suffix}",
            "job": f"job_{suffix}",
            "candidate": f"cand_{suffix}",
            "build": f"build_{suffix}",
            "artifact_dossier": f"art_d_{suffix}",
            "artifact_evidence": f"art_e_{suffix}",
            "artifact_attestation": f"art_a_{suffix}",
            "key": f"key_{suffix}",
            "record": f"rel_{suffix}",
        }
        self.conn.execute("INSERT INTO ws_repositories(id) VALUES (%s)", (ids["repository"],))
        self.conn.execute(
            "INSERT INTO ws_projects(id, repo_id) VALUES (%s, %s)",
            (ids["project"], ids["repository"]),
        )
        self.conn.execute(
            "INSERT INTO ws_jobs(id, kind, status) VALUES (%s, 'release-build', 'queued')",
            (ids["job"],),
        )
        for artifact_id, kind in (
            (ids["artifact_dossier"], "release-dossier"),
            (ids["artifact_evidence"], "release-evidence"),
            (ids["artifact_attestation"], "release-attestation"),
        ):
            self.conn.execute(
                """
                INSERT INTO ws_artifacts(id, kind, artifact_key, digest, object_path)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (artifact_id, kind, artifact_id, f"digest-{artifact_id}", f"objects/{artifact_id}"),
            )
        self.conn.execute(
            """
            INSERT INTO ws_release_candidates(
                id, project_id, repository_id, config_key, commit_sha, variant,
                technical_config_digest, input_closure_digest, toolchain_digest,
                generator_build, build_key, status
            )
            VALUES (%s, %s, %s, 'default', 'commit-1', '',
                    'technical-1', 'closure-1', 'toolchain-1', 'generator-1',
                    %s, 'built')
            """,
            (ids["candidate"], ids["project"], ids["repository"], f"build-key-{suffix}"),
        )
        self.conn.execute(
            """
            INSERT INTO ws_release_builds(
                id, candidate_id, job_id, status, manifest_digest, dossier_digest,
                dossier_artifact_id, evidence_artifact_id
            )
            VALUES (%s, %s, %s, 'succeeded', 'manifest-1', 'dossier-1', %s, %s)
            """,
            (
                ids["build"],
                ids["candidate"],
                ids["job"],
                ids["artifact_dossier"],
                ids["artifact_evidence"],
            ),
        )
        self.conn.execute(
            """
            INSERT INTO ws_release_signing_keys(
                key_id, algorithm, public_key, valid_from, created_by
            )
            VALUES (%s, 'ed25519', 'public-key-material', NOW(), 'security@example.test')
            """,
            (ids["key"],),
        )
        self.conn.execute(
            """
            INSERT INTO ws_release_records(
                id, project_id, config_key, candidate_id, build_id, release_label,
                dossier_digest, manifest_digest, attestation_digest, signature,
                signing_key_id, attestation_artifact_id, commit_sha, released_by
            )
            VALUES (%s, %s, 'default', %s, %s, 'REL-1', 'dossier-1', 'manifest-1',
                    'attestation-1', 'signature-1', %s, %s, 'commit-1',
                    'release@example.test')
            """,
            (
                ids["record"],
                ids["project"],
                ids["candidate"],
                ids["build"],
                ids["key"],
                ids["artifact_attestation"],
            ),
        )
        self.conn.execute(
            """
            INSERT INTO ws_release_audit_events(
                id, project_id, config_key, sequence, event_type, actor,
                subject_kind, subject_id, previous_hash, event_hash, created_at_iso
            )
            VALUES (%s, %s, 'default', 1, 'release.created', 'user@example.test',
                    'record', %s, NULL, 'event-hash-1', '2026-01-01T00:00:00Z')
            """,
            (f"audit_{suffix}", ids["project"], ids["record"]),
        )
        self.conn.commit()
        return ids["project"]

    def test_delete_removes_unsigned_release_studio_history(self) -> None:
        project_id = self._seed_unsigned_history()

        deleted = self.service.delete_project(project_id)

        self.assertTrue(deleted)
        remaining = self.conn.execute(
            "SELECT id FROM ws_projects WHERE id = %s",
            (project_id,),
        ).fetchone()
        self.assertIsNone(remaining)
        self.assertEqual(
            self.conn.execute(
                "SELECT COUNT(*) AS n FROM ws_release_audit_events WHERE project_id = %s",
                (project_id,),
            ).fetchone()["n"],
            0,
        )
        self.assertEqual(
            self.conn.execute(
                "SELECT COUNT(*) AS n FROM ws_release_waivers WHERE project_id = %s",
                (project_id,),
            ).fetchone()["n"],
            0,
        )
        self.assertEqual(
            self.conn.execute(
                "SELECT COUNT(*) AS n FROM ws_release_candidates WHERE project_id = %s",
                (project_id,),
            ).fetchone()["n"],
            0,
        )

    def test_delete_without_force_keeps_signed_release_records(self) -> None:
        project_id = self._seed_signed_release()

        with self.assertRaises(ProjectHasSignedReleasesError):
            self.service.delete_project(project_id)

        self.assertIsNotNone(
            self.conn.execute(
                "SELECT id FROM ws_projects WHERE id = %s",
                (project_id,),
            ).fetchone()
        )
        self.assertEqual(
            self.conn.execute(
                "SELECT COUNT(*) AS n FROM ws_release_records WHERE project_id = %s",
                (project_id,),
            ).fetchone()["n"],
            1,
        )

    def test_admin_force_delete_removes_signed_release_records(self) -> None:
        project_id = self._seed_signed_release()

        deleted = self.service.delete_project(project_id, force=True)

        self.assertTrue(deleted)
        self.assertIsNone(
            self.conn.execute(
                "SELECT id FROM ws_projects WHERE id = %s",
                (project_id,),
            ).fetchone()
        )
        self.assertEqual(
            self.conn.execute(
                "SELECT COUNT(*) AS n FROM ws_release_records WHERE project_id = %s",
                (project_id,),
            ).fetchone()["n"],
            0,
        )
        self.assertEqual(
            self.conn.execute(
                "SELECT COUNT(*) AS n FROM ws_release_audit_events WHERE project_id = %s",
                (project_id,),
            ).fetchone()["n"],
            0,
        )


class DeleteProjectEndpointTests(unittest.TestCase):
    def test_designer_is_blocked_when_signed_releases_exist(self) -> None:
        from app.api import projects as api

        with patch.object(api, "get_project_for_role_or_404", return_value=SimpleNamespace(path="/tmp/p")), \
             patch.object(api.workspace, "get_project_by_id", return_value={"repo_id": "repo", "import_type": "single", "parent_repo_path": "/tmp/p"}), \
             patch.object(
                 api.workspace,
                 "delete_project",
                 side_effect=ProjectHasSignedReleasesError("prj_1", 1),
             ):
            with self.assertRaises(HTTPException) as caught:
                _run(api.delete_project_endpoint("prj_1", user=_User("designer")))

        self.assertEqual(caught.exception.status_code, 409)
        self.assertIn("signed release records", caught.exception.detail)

    def test_admin_delete_passes_force_true(self) -> None:
        from app.api import projects as api

        with patch.object(api, "get_project_for_role_or_404", return_value=SimpleNamespace(path="/tmp/p")), \
             patch.object(api.workspace, "get_project_by_id", return_value={"repo_id": "repo", "import_type": "single", "parent_repo_path": "/tmp/p"}), \
             patch.object(api.workspace, "delete_project", return_value=True) as delete_project, \
             patch.object(api.comments_store, "delete_project_comments"), \
             patch.object(api.workspace, "get_projects_by_repo", return_value=[]), \
             patch.object(api.workspace, "delete_repository"), \
             patch.object(api.project_service, "PROJECTS_ROOT", "/tmp"):
            result = _run(api.delete_project_endpoint("prj_1", user=_User("admin")))

        delete_project.assert_called_once_with("prj_1", force=True)
        self.assertEqual(result["message"], "Project deleted successfully")


if __name__ == "__main__":
    unittest.main()
