"""Catalog and mutation coverage for the Release Studio schema migration."""

from __future__ import annotations

import os
import sys
import unittest
import uuid
from pathlib import Path
from urllib.parse import urlsplit


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover - dependency guard for host-only checks
    psycopg = None  # type: ignore[assignment]
    dict_row = None  # type: ignore[assignment]

from app.services.workspace_schema_migrations import (  # noqa: E402
    MIGRATIONS,
    _release_studio,
    _release_studio_hardening,
    apply_workspace_migrations,
)


POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL", "").strip()
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
    POSTGRES_URL
    and APPLICATION_POSTGRES_URL
    and _database_identity(POSTGRES_URL) == _database_identity(APPLICATION_POSTGRES_URL)
)


EXPECTED_COLUMNS: dict[str, set[str]] = {
    "ws_release_configurations": {
        "id",
        "project_id",
        "config_key",
        "title",
        "board_rel",
        "schematic_rel",
        "jobset_rel",
        "default_variant",
        "created_by",
        "created_at",
        "updated_at",
    },
    "ws_release_candidates": {
        "id",
        "project_id",
        "repository_id",
        "config_key",
        "commit_sha",
        "variant",
        "technical_config_digest",
        "input_closure_digest",
        "toolchain_digest",
        "generator_build",
        "build_key",
        "status",
        "hermetic",
        "non_hermetic_reasons",
        "authored_overrides",
        "created_by",
        "created_at",
        "updated_at",
    },
    "ws_release_closure_inputs": {
        "id",
        "candidate_id",
        "kind",
        "path",
        "git_object_id",
        "mode",
        "object_type",
        "lfs_oid",
        "materialized_digest",
        "details",
    },
    "ws_release_builds": {
        "id",
        "candidate_id",
        "job_id",
        "fence",
        "attempt",
        "status",
        "manifest_digest",
        "dossier_digest",
        "dossier_artifact_id",
        "evidence_artifact_id",
        "toolchain",
        "timings",
        "warnings",
        "error_code",
        "error_message",
        "started_at",
        "completed_at",
        "created_at",
    },
    "ws_release_members": {
        "id",
        "build_id",
        "path",
        "member_kind",
        "media_type",
        "size_bytes",
        "released_digest",
        "source_raw_digest",
        "canonicalizer",
        "created_at",
    },
    "ws_release_member_domains": {"member_id", "build_id", "domain"},
    "ws_release_evidence": {
        "id",
        "build_id",
        "kind",
        "report_digest",
        "counts",
        "created_at",
    },
    "ws_release_scope_fingerprints": {
        "build_id",
        "domain",
        "fingerprint",
        "inputs",
        "fidelity",
    },
    "ws_release_policies": {
        "id",
        "policy_key",
        "title",
        "created_by",
        "created_at",
        "updated_at",
    },
    "ws_release_policy_versions": {
        "id",
        "policy_id",
        "version",
        "status",
        "rules",
        "content_digest",
        "retired_at",
        "retired_by",
        "published_at",
        "published_by",
        "created_by",
        "created_at",
    },
    "ws_release_evaluations": {
        "id",
        "build_id",
        "policy_binding",
        "policy_binding_digest",
        "outcome",
        "counts",
        "evaluator_build",
        "created_at",
    },
    "ws_release_waivers": {
        "id",
        "project_id",
        "config_key",
        "rule_id",
        "domain",
        "subject_pattern",
        "finding_key",
        "reason",
        "owner",
        "approver",
        "status",
        "evidence",
        "expires_at",
        "approved_at",
        "revoked_at",
        "revoked_reason",
        "created_at",
    },
    "ws_release_findings": {
        "id",
        "evaluation_id",
        "rule_id",
        "rule_version",
        "severity",
        "status",
        "domain",
        "subject",
        "message",
        "observed",
        "expected",
        "finding_key",
        "waiver_id",
        "created_at",
    },
    "ws_release_approvals": {
        "id",
        "project_id",
        "config_key",
        "candidate_id",
        "build_id",
        "role",
        "domains",
        "decision",
        "approver",
        "note",
        "self_approval_override_reason",
        "technical_scope_fingerprints",
        "policy_binding_digest",
        "manifest_digest",
        "carried_from_approval_id",
        "reauth_context",
        "evaluation_id",
        "created_at",
    },
    "ws_release_approval_invalidations": {
        "id",
        "approval_id",
        "reason",
        "stale_component",
        "changed_domains",
        "created_by",
        "created_at",
    },
    "ws_release_signing_keys": {
        "key_id",
        "algorithm",
        "public_key",
        "status",
        "valid_from",
        "valid_to",
        "created_by",
        "created_at",
    },
    "ws_release_records": {
        "id",
        "project_id",
        "config_key",
        "candidate_id",
        "build_id",
        "release_label",
        "document_number",
        "revision",
        "dossier_digest",
        "manifest_digest",
        "attestation_digest",
        "signature",
        "signing_key_id",
        "attestation_artifact_id",
        "commit_sha",
        "variant",
        "released_by",
        "policy_snapshot",
        "approval_snapshot",
        "superseded_by",
        "created_at",
    },
    "ws_release_audit_events": {
        "id",
        "project_id",
        "config_key",
        "sequence",
        "event_type",
        "actor",
        "subject_kind",
        "subject_id",
        "details",
        "previous_hash",
        "event_hash",
        "created_at_iso",
        "created_at",
    },
    "ws_artifact_release_pins": {"artifact_id", "pin_kind", "pin_ref", "created_at"},
}


EXPECTED_PRIMARY_KEYS = {
    "ws_release_configurations": ("id",),
    "ws_release_candidates": ("id",),
    "ws_release_closure_inputs": ("id",),
    "ws_release_builds": ("id",),
    "ws_release_members": ("id",),
    "ws_release_member_domains": ("member_id", "domain"),
    "ws_release_evidence": ("id",),
    "ws_release_scope_fingerprints": ("build_id", "domain"),
    "ws_release_policies": ("id",),
    "ws_release_policy_versions": ("id",),
    "ws_release_evaluations": ("id",),
    "ws_release_waivers": ("id",),
    "ws_release_findings": ("id",),
    "ws_release_approvals": ("id",),
    "ws_release_approval_invalidations": ("id",),
    "ws_release_signing_keys": ("key_id",),
    "ws_release_records": ("id",),
    "ws_release_audit_events": ("id",),
    "ws_artifact_release_pins": ("artifact_id",),
}


EXPECTED_UNIQUES = {
    ("ws_release_configurations", ("project_id", "config_key")),
    ("ws_release_candidates", ("project_id", "config_key", "build_key")),
    ("ws_release_closure_inputs", ("candidate_id", "kind", "path")),
    ("ws_release_members", ("build_id", "path")),
    ("ws_release_members", ("id", "build_id")),
    ("ws_release_policies", ("policy_key",)),
    ("ws_release_policy_versions", ("policy_id", "version")),
    (
        "ws_release_evaluations",
        ("build_id", "policy_binding_digest", "evaluator_build"),
    ),
    ("ws_release_records", ("project_id", "config_key", "release_label")),
    ("ws_release_records", ("project_id", "config_key", "id")),
}


EXPECTED_FKS = {
    ("ws_release_configurations", ("project_id",), "ws_projects", ("id",), "CASCADE"),
    ("ws_release_candidates", ("project_id",), "ws_projects", ("id",), "CASCADE"),
    (
        "ws_release_candidates",
        ("repository_id",),
        "ws_repositories",
        ("id",),
        "CASCADE",
    ),
    (
        "ws_release_closure_inputs",
        ("candidate_id",),
        "ws_release_candidates",
        ("id",),
        "CASCADE",
    ),
    ("ws_release_builds", ("candidate_id",), "ws_release_candidates", ("id",), "CASCADE"),
    ("ws_release_builds", ("job_id",), "ws_jobs", ("id",), "SET NULL"),
    ("ws_release_builds", ("dossier_artifact_id",), "ws_artifacts", ("id",), "RESTRICT"),
    (
        "ws_release_builds",
        ("evidence_artifact_id",),
        "ws_artifacts",
        ("id",),
        "RESTRICT",
    ),
    ("ws_release_members", ("build_id",), "ws_release_builds", ("id",), "CASCADE"),
    (
        "ws_release_member_domains",
        ("member_id", "build_id"),
        "ws_release_members",
        ("id", "build_id"),
        "CASCADE",
    ),
    ("ws_release_evidence", ("build_id",), "ws_release_builds", ("id",), "CASCADE"),
    (
        "ws_release_scope_fingerprints",
        ("build_id",),
        "ws_release_builds",
        ("id",),
        "CASCADE",
    ),
    (
        "ws_release_policy_versions",
        ("policy_id",),
        "ws_release_policies",
        ("id",),
        "CASCADE",
    ),
    ("ws_release_evaluations", ("build_id",), "ws_release_builds", ("id",), "CASCADE"),
    ("ws_release_waivers", ("project_id",), "ws_projects", ("id",), "RESTRICT"),
    (
        "ws_release_findings",
        ("evaluation_id",),
        "ws_release_evaluations",
        ("id",),
        "CASCADE",
    ),
    (
        "ws_release_findings",
        ("waiver_id",),
        "ws_release_waivers",
        ("id",),
        "RESTRICT",
    ),
    ("ws_release_approvals", ("project_id",), "ws_projects", ("id",), "RESTRICT"),
    (
        "ws_release_approvals",
        ("candidate_id",),
        "ws_release_candidates",
        ("id",),
        "RESTRICT",
    ),
    ("ws_release_approvals", ("build_id",), "ws_release_builds", ("id",), "RESTRICT"),
    (
        "ws_release_approvals",
        ("carried_from_approval_id",),
        "ws_release_approvals",
        ("id",),
        "SET NULL",
    ),
    (
        "ws_release_approvals",
        ("evaluation_id",),
        "ws_release_evaluations",
        ("id",),
        "SET NULL",
    ),
    (
        "ws_release_approval_invalidations",
        ("approval_id",),
        "ws_release_approvals",
        ("id",),
        "CASCADE",
    ),
    ("ws_release_records", ("project_id",), "ws_projects", ("id",), "RESTRICT"),
    (
        "ws_release_records",
        ("candidate_id",),
        "ws_release_candidates",
        ("id",),
        "RESTRICT",
    ),
    ("ws_release_records", ("build_id",), "ws_release_builds", ("id",), "RESTRICT"),
    (
        "ws_release_records",
        ("signing_key_id",),
        "ws_release_signing_keys",
        ("key_id",),
        "RESTRICT",
    ),
    (
        "ws_release_records",
        ("attestation_artifact_id",),
        "ws_artifacts",
        ("id",),
        "RESTRICT",
    ),
    (
        "ws_release_records",
        ("project_id", "config_key", "superseded_by"),
        "ws_release_records",
        ("project_id", "config_key", "id"),
        "RESTRICT",
    ),
    ("ws_release_audit_events", ("project_id",), "ws_projects", ("id",), "RESTRICT"),
    (
        "ws_artifact_release_pins",
        ("artifact_id",),
        "ws_artifacts",
        ("id",),
        "CASCADE",
    ),
}


@unittest.skipUnless(
    POSTGRES_URL,
    "TEST_POSTGRES_URL is required for Release Studio PostgreSQL schema tests",
)
@unittest.skipUnless(
    psycopg is not None,
    "psycopg is required for Release Studio PostgreSQL schema tests",
)
@unittest.skipIf(
    SHARED_APPLICATION_DATABASE,
    "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL",
)
class ReleaseStudioPostgresSchemaTests(unittest.TestCase):
    """Run Migrations 8 and 9 against a disposable test schema."""

    def setUp(self) -> None:
        assert psycopg is not None
        self.schema = f"release_r3_{uuid.uuid4().hex}"
        dsn = POSTGRES_URL.replace("postgresql+psycopg://", "postgresql://", 1)
        self.conn = psycopg.connect(dsn, row_factory=dict_row)
        self.conn.execute(f'CREATE SCHEMA "{self.schema}"')
        self.conn.execute(f'SET search_path TO "{self.schema}", public')
        self._create_base_workspace_tables()
        apply_workspace_migrations(self.conn)
        self.conn.commit()

        # The ledger makes the normal second application a no-op.  Calling the
        # hardening migration itself is covered separately to prove its DDL is
        # also replaceable when a deployment resumes after a partial attempt.
        apply_workspace_migrations(self.conn)
        self.conn.commit()

    def tearDown(self) -> None:
        try:
            self.conn.rollback()
            self.conn.execute(f'DROP SCHEMA "{self.schema}" CASCADE')
            self.conn.commit()
        finally:
            self.conn.close()

    def _create_base_workspace_tables(self) -> None:
        self.conn.execute(
            """
            CREATE TABLE ws_repositories (
                id TEXT PRIMARY KEY
            );
            CREATE TABLE ws_folders (
                id TEXT PRIMARY KEY
            );
            CREATE TABLE ws_projects (
                id TEXT PRIMARY KEY,
                repo_id TEXT NOT NULL REFERENCES ws_repositories(id)
            );
            CREATE TABLE ws_project_portfolio (
                project_id TEXT PRIMARY KEY REFERENCES ws_projects(id)
            );
            CREATE TABLE ws_jobs (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL,
                status TEXT NOT NULL,
                message TEXT NOT NULL DEFAULT '',
                percent REAL NOT NULL DEFAULT 0,
                payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """,
            prepare=False,
        )

    def _assert_rejected(self, sql: str, params: tuple = ()) -> None:
        savepoint = f"release_probe_{uuid.uuid4().hex}"
        self.conn.execute(f'SAVEPOINT "{savepoint}"')
        try:
            self.conn.execute(sql, params)
        except Exception:
            self.conn.execute(f'ROLLBACK TO SAVEPOINT "{savepoint}"')
            self.conn.execute(f'RELEASE SAVEPOINT "{savepoint}"')
            return
        self.conn.execute(f'ROLLBACK TO SAVEPOINT "{savepoint}"')
        self.conn.execute(f'RELEASE SAVEPOINT "{savepoint}"')
        self.fail(f"SQL unexpectedly succeeded: {sql}")

    def _constraint_keys(self) -> list[tuple[str, str, tuple[str, ...]]]:
        rows = self.conn.execute(
            """
            SELECT child.relname AS table_name,
                   c.contype,
                   array_agg(attribute.attname ORDER BY key_columns.ordinality)
                       AS columns
            FROM pg_constraint AS c
            JOIN pg_class AS child ON child.oid = c.conrelid
            JOIN pg_namespace AS namespace ON namespace.oid = child.relnamespace
            CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY
                AS key_columns(attnum, ordinality)
            JOIN pg_attribute AS attribute
              ON attribute.attrelid = child.oid
             AND attribute.attnum = key_columns.attnum
            WHERE namespace.nspname = %s
              AND c.contype IN ('p', 'u')
            GROUP BY child.relname, c.conname, c.contype
            """,
            (self.schema,),
        ).fetchall()
        return [
            (str(row["table_name"]), str(row["contype"]), tuple(row["columns"]))
            for row in rows
        ]

    def _foreign_keys(self) -> set[tuple[str, tuple[str, ...], str, tuple[str, ...], str]]:
        rows = self.conn.execute(
            """
            SELECT child.relname AS child_table,
                   parent.relname AS parent_table,
                   array_agg(child_attribute.attname ORDER BY child_key.ordinality)
                       AS child_columns,
                   array_agg(parent_attribute.attname ORDER BY child_key.ordinality)
                       AS parent_columns,
                   c.confdeltype
            FROM pg_constraint AS c
            JOIN pg_class AS child ON child.oid = c.conrelid
            JOIN pg_namespace AS child_namespace
              ON child_namespace.oid = child.relnamespace
            JOIN pg_class AS parent ON parent.oid = c.confrelid
            CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY
                AS child_key(attnum, ordinality)
            JOIN pg_attribute AS child_attribute
              ON child_attribute.attrelid = child.oid
             AND child_attribute.attnum = child_key.attnum
            JOIN LATERAL unnest(c.confkey) WITH ORDINALITY
                AS parent_key(attnum, ordinality)
              ON parent_key.ordinality = child_key.ordinality
            JOIN pg_attribute AS parent_attribute
              ON parent_attribute.attrelid = parent.oid
             AND parent_attribute.attnum = parent_key.attnum
            WHERE child_namespace.nspname = %s
              AND c.contype = 'f'
            GROUP BY child.relname, parent.relname, c.conname, c.confdeltype
            """,
            (self.schema,),
        ).fetchall()
        delete_actions = {
            "a": "NO ACTION",
            "r": "RESTRICT",
            "c": "CASCADE",
            "n": "SET NULL",
            "d": "SET DEFAULT",
        }
        return {
            (
                str(row["child_table"]),
                tuple(row["child_columns"]),
                str(row["parent_table"]),
                tuple(row["parent_columns"]),
                delete_actions[str(row["confdeltype"])],
            )
            for row in rows
        }

    def test_catalog_contains_every_release_table_and_column(self) -> None:
        rows = self.conn.execute(
            """
            SELECT table_name, column_name, data_type, udt_name, is_nullable
            FROM information_schema.columns
            WHERE table_schema = %s
              AND table_name = ANY(%s)
            """,
            (self.schema, list(EXPECTED_COLUMNS)),
        ).fetchall()
        columns: dict[str, set[str]] = {}
        types: dict[tuple[str, str], tuple[str, str]] = {}
        nullability: dict[tuple[str, str], str] = {}
        for row in rows:
            table = str(row["table_name"])
            column = str(row["column_name"])
            columns.setdefault(table, set()).add(column)
            types[(table, column)] = (str(row["data_type"]), str(row["udt_name"]))
            nullability[(table, column)] = str(row["is_nullable"])

        self.assertEqual(set(columns), set(EXPECTED_COLUMNS))
        for table, expected in EXPECTED_COLUMNS.items():
            self.assertTrue(expected <= columns[table], table)
        self.assertEqual(columns["ws_release_policies"], EXPECTED_COLUMNS["ws_release_policies"])
        self.assertNotIn("project_id", columns["ws_release_policies"])
        self.assertNotIn("config_key", columns["ws_release_policies"])
        self.assertEqual(
            nullability[("ws_release_members", "source_raw_digest")],
            "NO",
        )

        self.assertEqual(types[("ws_release_candidates", "hermetic")], ("boolean", "bool"))
        self.assertEqual(
            types[("ws_release_candidates", "non_hermetic_reasons")],
            ("jsonb", "jsonb"),
        )
        self.assertEqual(types[("ws_release_builds", "fence")], ("bigint", "int8"))
        self.assertEqual(types[("ws_release_approvals", "domains")], ("ARRAY", "_text"))
        self.assertEqual(
            types[("ws_release_audit_events", "created_at_iso")],
            ("text", "text"),
        )
        self.assertEqual(
            types[("ws_release_policy_versions", "published_at")],
            ("timestamp with time zone", "timestamptz"),
        )
        self.assertEqual(
            types[("ws_release_policy_versions", "published_by")],
            ("text", "text"),
        )
        self.assertEqual(
            nullability[("ws_release_policy_versions", "published_at")],
            "YES",
        )
        self.assertEqual(
            nullability[("ws_release_policy_versions", "published_by")],
            "YES",
        )

        defaults = self.conn.execute(
            """
            SELECT table_class.relname AS table_name,
                   attribute.attname AS column_name,
                   pg_get_expr(defaults.adbin, defaults.adrelid) AS default_expr
            FROM pg_attribute AS attribute
            JOIN pg_class AS table_class ON table_class.oid = attribute.attrelid
            JOIN pg_namespace AS namespace ON namespace.oid = table_class.relnamespace
            JOIN pg_attrdef AS defaults
              ON defaults.adrelid = attribute.attrelid
             AND defaults.adnum = attribute.attnum
            WHERE namespace.nspname = %s
              AND table_class.relname IN ('ws_release_policy_versions', 'ws_release_waivers')
              AND attribute.attname IN ('rules', 'evidence')
            """,
            (self.schema,),
        ).fetchall()
        default_by_column = {
            (str(row["table_name"]), str(row["column_name"])): str(row["default_expr"])
            for row in defaults
        }
        self.assertIn("'[]'::jsonb", default_by_column[("ws_release_policy_versions", "rules")])
        self.assertIn("'[]'::jsonb", default_by_column[("ws_release_waivers", "evidence")])

    def test_catalog_contains_required_primary_and_unique_constraints(self) -> None:
        constraints = self._constraint_keys()
        for table, columns in EXPECTED_PRIMARY_KEYS.items():
            self.assertIn((table, "p", columns), constraints)

        uniques = {
            (table, columns)
            for table, contype, columns in constraints
            if contype == "u"
        }
        self.assertTrue(EXPECTED_UNIQUES <= uniques)
        self.assertNotIn(
            ("ws_release_records", ("project_id", "config_key", "dossier_digest")),
            uniques,
        )

    def test_catalog_contains_required_foreign_keys_and_delete_actions(self) -> None:
        foreign_keys = self._foreign_keys()
        self.assertTrue(EXPECTED_FKS <= foreign_keys)
        self.assertNotIn(
            (
                "ws_release_member_domains",
                ("build_id",),
                "ws_release_builds",
                ("id",),
                "CASCADE",
            ),
            foreign_keys,
        )
        self.assertFalse(
            any(child == "ws_release_policies" for child, *_ in foreign_keys),
            "organization policies must not be project-scoped",
        )

        constraint_rows = self.conn.execute(
            """
            SELECT c.conname,
                   c.contype,
                   pg_get_constraintdef(c.oid) AS definition
            FROM pg_constraint AS c
            JOIN pg_class AS table_class ON table_class.oid = c.conrelid
            JOIN pg_namespace AS namespace ON namespace.oid = table_class.relnamespace
            WHERE namespace.nspname = %s
              AND table_class.relname = ANY(%s)
            """,
            (
                self.schema,
                [
                    "ws_release_evaluations",
                    "ws_release_findings",
                    "ws_release_approvals",
                    "ws_release_policy_versions",
                    "ws_release_records",
                    "ws_release_audit_events",
                    "ws_release_waivers",
                ],
            ),
        ).fetchall()
        constraint_definitions = {
            str(row["conname"]): str(row["definition"]) for row in constraint_rows
        }
        for constraint in (
            "ck_ws_release_evaluations_outcome_vocabulary",
            "ck_ws_release_findings_severity_vocabulary",
            "ck_ws_release_findings_status_vocabulary",
            "ck_ws_release_approvals_decision_vocabulary",
            "ck_ws_release_policy_versions_publication_provenance",
            "ck_ws_release_records_signature_key_pair",
            "ck_ws_release_audit_events_sequence_positive",
            "ck_ws_release_audit_events_genesis_previous_hash",
            "fk_ws_release_approvals_project_restrict",
            "fk_ws_release_approvals_candidate_restrict",
            "fk_ws_release_approvals_build_restrict",
            "fk_ws_release_waivers_project_restrict",
            "fk_ws_release_findings_waiver_restrict",
            "fk_ws_release_records_superseded_by_same_config",
            "uq_ws_release_records_project_config_id",
        ):
            self.assertIn(constraint, constraint_definitions)
        self.assertIn("sequence > 0", constraint_definitions["ck_ws_release_audit_events_sequence_positive"])
        self.assertIn(
            "previous_hash",
            constraint_definitions["ck_ws_release_audit_events_genesis_previous_hash"],
        )
        self.assertNotIn("ws_release_evaluations_outcome_check", constraint_definitions)
        self.assertNotIn("ws_release_records_superseded_by_fkey", constraint_definitions)

        indexes = self.conn.execute(
            """
            SELECT index_class.relname AS index_name
            FROM pg_index
            JOIN pg_class AS table_class ON table_class.oid = pg_index.indrelid
            JOIN pg_class AS index_class ON index_class.oid = pg_index.indexrelid
            JOIN pg_namespace AS namespace ON namespace.oid = table_class.relnamespace
            WHERE namespace.nspname = %s
              AND index_class.relname = ANY(%s)
            """,
            (
                self.schema,
                [
                    "idx_ws_release_closure_inputs_candidate",
                    "idx_ws_release_members_build",
                    "idx_ws_release_scope_fingerprints_build",
                    "idx_ws_release_audit_events_project",
                    "idx_ws_release_member_domains_build",
                ],
            ),
        ).fetchall()
        index_names = {str(row["index_name"]) for row in indexes}
        self.assertEqual(
            index_names,
            {"idx_ws_release_member_domains_build"},
        )

        index = self.conn.execute(
            """
            SELECT index_class.relname AS index_name,
                   pg_index.indisunique AS is_unique,
                   pg_index.indpred IS NOT NULL AS is_partial,
                   pg_get_indexdef(pg_index.indexrelid) AS definition
            FROM pg_index
            JOIN pg_class AS table_class ON table_class.oid = pg_index.indrelid
            JOIN pg_class AS index_class ON index_class.oid = pg_index.indexrelid
            JOIN pg_namespace AS namespace ON namespace.oid = table_class.relnamespace
            WHERE namespace.nspname = %s
              AND table_class.relname = 'ws_release_builds'
              AND index_class.relname = 'idx_ws_release_builds_manifest_digest_nonempty'
            """,
            (self.schema,),
        ).fetchone()
        self.assertIsNotNone(index)
        assert index is not None
        self.assertFalse(index["is_unique"])
        self.assertTrue(index["is_partial"])
        self.assertIn("manifest_digest", str(index["definition"]))
        self.assertIn("<> ''", str(index["definition"]))

    def test_trigger_definitions_are_present_and_recreated_safely(self) -> None:
        _release_studio_hardening(self.conn)
        _release_studio_hardening(self.conn)
        self.conn.commit()

        rows = self.conn.execute(
            """
            SELECT trigger_name, pg_get_triggerdef(pg_trigger.oid) AS definition
            FROM information_schema.triggers
            JOIN pg_trigger
              ON pg_trigger.tgname = information_schema.triggers.trigger_name
            JOIN pg_class
              ON pg_class.oid = pg_trigger.tgrelid
            JOIN pg_namespace
              ON pg_namespace.oid = pg_class.relnamespace
            WHERE information_schema.triggers.trigger_schema = %s
              AND pg_namespace.nspname = %s
              AND NOT pg_trigger.tgisinternal
            """,
            (self.schema, self.schema),
        ).fetchall()
        definitions = {str(row["trigger_name"]): str(row["definition"]) for row in rows}

        self.assertIn("trg_ws_release_waivers_no_delete", definitions)
        self.assertIn("BEFORE DELETE", definitions["trg_ws_release_waivers_no_delete"])
        self.assertNotIn("BEFORE UPDATE", definitions["trg_ws_release_waivers_no_delete"])
        for trigger in (
            "trg_ws_release_approvals_immutable",
            "trg_ws_release_approval_invalidations_immutable",
            "trg_ws_release_audit_events_immutable",
        ):
            self.assertIn(trigger, definitions)
            self.assertIn("BEFORE DELETE OR UPDATE", definitions[trigger])
        self.assertIn("trg_ws_release_policy_versions_guard", definitions)
        self.assertIn("trg_ws_release_records_guard", definitions)

    def _seed_release_graph(self) -> dict[str, str]:
        suffix = uuid.uuid4().hex
        ids = {
            "project": f"project-{suffix}",
            "repository": f"repository-{suffix}",
            "job": f"job-{suffix}",
            "candidate": f"candidate-{suffix}",
            "build": f"build-{suffix}",
            "evaluation": f"evaluation-{suffix}",
            "waiver": f"waiver-{suffix}",
            "approval": f"approval-{suffix}",
            "invalidation": f"invalidation-{suffix}",
            "audit": f"audit-{suffix}",
            "artifact_dossier": f"artifact-dossier-{suffix}",
            "artifact_evidence": f"artifact-evidence-{suffix}",
            "artifact_attestation": f"artifact-attestation-{suffix}",
            "key": f"key-{suffix}",
        }
        self.conn.execute("INSERT INTO ws_repositories(id) VALUES (%s)", (ids["repository"],))
        self.conn.execute(
            "INSERT INTO ws_projects(id, repo_id) VALUES (%s, %s)",
            (ids["project"], ids["repository"]),
        )
        self.conn.execute(
            """
            INSERT INTO ws_jobs(id, kind, status)
            VALUES (%s, 'release-build', 'queued')
            """,
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
            VALUES (%s, %s, %s, 'default', 'commit-1', 'standard',
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
            INSERT INTO ws_release_evaluations(
                id, build_id, policy_binding, policy_binding_digest,
                outcome, evaluator_build
            )
            VALUES (%s, %s, '{"policy":"v1"}', 'policy-binding-1', 'pass', 'evaluator-1')
            """,
            (ids["evaluation"], ids["build"]),
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
            (ids["waiver"], ids["project"]),
        )
        self.conn.execute(
            """
            INSERT INTO ws_release_approvals(
                id, project_id, config_key, candidate_id, build_id, role,
                domains, decision, approver, policy_binding_digest, evaluation_id
            )
            VALUES (%s, %s, 'default', %s, %s, 'engineering',
                    ARRAY['bare_board']::text[], 'approved', 'approver@example.test',
                    'policy-binding-1', %s)
            """,
            (ids["approval"], ids["project"], ids["candidate"], ids["build"], ids["evaluation"]),
        )
        self.conn.execute(
            """
            INSERT INTO ws_release_approval_invalidations(
                id, approval_id, reason, stale_component, changed_domains, created_by
            )
            VALUES (%s, %s, 'scope changed', 'technical',
                    ARRAY['bare_board']::text[], 'system@example.test')
            """,
            (ids["invalidation"], ids["approval"]),
        )
        self.conn.execute(
            """
            INSERT INTO ws_release_audit_events(
                id, project_id, config_key, sequence, event_type, actor,
                subject_kind, subject_id, previous_hash, event_hash, created_at_iso
            )
            VALUES (%s, %s, 'default', 1, 'approval.created', 'system@example.test',
                    'approval', %s, NULL, 'event-hash-1', '2026-01-01T00:00:00Z')
            """,
            (ids["audit"], ids["project"], ids["approval"]),
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
        return ids

    def _insert_release_record(
        self,
        ids: dict[str, str],
        release_id: str,
        release_label: str,
        *,
        config_key: str = "default",
        signature: str | None = "signature-1",
        signing_key_id: str | None = None,
        use_default_signing_key: bool = True,
    ) -> None:
        self.conn.execute(
            """
            INSERT INTO ws_release_records(
                id, project_id, config_key, candidate_id, build_id, release_label,
                dossier_digest, manifest_digest, attestation_digest, signature,
                signing_key_id, attestation_artifact_id, commit_sha, released_by
            )
            VALUES (%s, %s, %s, %s, %s, %s, 'same-dossier', 'manifest-1',
                    'attestation-1', %s, %s, %s, 'commit-1', 'release@example.test')
            """,
            (
                release_id,
                ids["project"],
                config_key,
                ids["candidate"],
                ids["build"],
                release_label,
                signature,
                ids["key"] if use_default_signing_key else signing_key_id,
                ids["artifact_attestation"],
            ),
        )

    def test_checks_and_mutation_boundaries_hold_in_real_postgres(self) -> None:
        ids = self._seed_release_graph()

        candidate_values = (
            f"candidate-invalid-{uuid.uuid4().hex}",
            ids["project"],
            ids["repository"],
            f"invalid-build-key-{uuid.uuid4().hex}",
        )
        self._assert_rejected(
            """
            INSERT INTO ws_release_candidates(
                id, project_id, repository_id, config_key, commit_sha,
                technical_config_digest, input_closure_digest, toolchain_digest,
                generator_build, build_key, status
            )
            VALUES (%s, %s, %s, 'default', 'commit-invalid', 'technical',
                    'closure', 'toolchain', 'generator', %s, 'released')
            """,
            candidate_values,
        )
        self._assert_rejected(
            """
            INSERT INTO ws_release_closure_inputs(id, candidate_id, kind, path)
            VALUES (%s, %s, 'unknown', 'repo')
            """,
            (f"closure-invalid-{uuid.uuid4().hex}", ids["candidate"]),
        )
        member_id = f"member-{uuid.uuid4().hex}"
        self._assert_rejected(
            """
            INSERT INTO ws_release_members(
                id, build_id, path, member_kind, media_type, released_digest
            )
            VALUES (%s, %s, 'board.kicad_pcb', 'board', 'application/octet-stream', 'released')
            """,
            (f"member-no-raw-{uuid.uuid4().hex}", ids["build"]),
        )
        self.conn.execute(
            """
            INSERT INTO ws_release_members(
                id, build_id, path, member_kind, media_type,
                released_digest, source_raw_digest
            )
            VALUES (%s, %s, 'board.kicad_pcb', 'board', 'application/octet-stream',
                    'released', 'raw')
            """,
            (member_id, ids["build"]),
        )
        other_build_id = f"build-other-{uuid.uuid4().hex}"
        self.conn.execute(
            """
            INSERT INTO ws_release_builds(id, candidate_id, status)
            VALUES (%s, %s, 'queued')
            """,
            (other_build_id, ids["candidate"]),
        )
        self._assert_rejected(
            """
            INSERT INTO ws_release_member_domains(member_id, build_id, domain)
            VALUES (%s, %s, 'bare_board')
            """,
            (member_id, other_build_id),
        )
        self.conn.execute(
            """
            INSERT INTO ws_release_member_domains(member_id, build_id, domain)
            VALUES (%s, %s, 'bare_board')
            """,
            (member_id, ids["build"]),
        )
        self._assert_rejected(
            """
            INSERT INTO ws_release_builds(id, candidate_id, status)
            VALUES (%s, %s, 'released')
            """,
            (f"build-invalid-{uuid.uuid4().hex}", ids["candidate"]),
        )
        self._assert_rejected(
            """
            INSERT INTO ws_release_evaluations(
                id, build_id, policy_binding_digest, outcome
            )
            VALUES (%s, %s, %s, 'released')
            """,
            (f"evaluation-invalid-{uuid.uuid4().hex}", ids["build"], f"digest-{uuid.uuid4().hex}"),
        )
        self._assert_rejected(
            """
            INSERT INTO ws_release_approval_invalidations(
                id, approval_id, reason, stale_component
            )
            VALUES (%s, %s, 'bad component', 'released')
            """,
            (f"invalidation-invalid-{uuid.uuid4().hex}", ids["approval"]),
        )

        # Waivers are lifecycle records: updates remain available to R15, but
        # deleting history is a database error.
        self.conn.execute(
            """
            UPDATE ws_release_waivers
            SET status = 'approved', approver = 'approver@example.test', approved_at = NOW()
            WHERE id = %s
            """,
            (ids["waiver"],),
        )
        waiver = self.conn.execute(
            "SELECT status FROM ws_release_waivers WHERE id = %s",
            (ids["waiver"],),
        ).fetchone()
        self.assertEqual(waiver["status"], "approved")
        self._assert_rejected(
            "DELETE FROM ws_release_waivers WHERE id = %s",
            (ids["waiver"],),
        )

        self._assert_rejected(
            "UPDATE ws_release_approvals SET note = 'changed' WHERE id = %s",
            (ids["approval"],),
        )
        self._assert_rejected(
            "DELETE FROM ws_release_approvals WHERE id = %s",
            (ids["approval"],),
        )
        self._assert_rejected(
            "UPDATE ws_release_approval_invalidations SET reason = 'changed' WHERE id = %s",
            (ids["invalidation"],),
        )
        self._assert_rejected(
            "DELETE FROM ws_release_approval_invalidations WHERE id = %s",
            (ids["invalidation"],),
        )
        self._assert_rejected(
            "UPDATE ws_release_audit_events SET event_type = 'changed' WHERE id = %s",
            (ids["audit"],),
        )
        self._assert_rejected(
            "DELETE FROM ws_release_audit_events WHERE id = %s",
            (ids["audit"],),
        )

    def test_parent_deletions_are_blocked_by_restrict_history_fks(self) -> None:
        ids = self._seed_release_graph()
        for statement, value in (
            ("DELETE FROM ws_projects WHERE id = %s", ids["project"]),
            ("DELETE FROM ws_release_candidates WHERE id = %s", ids["candidate"]),
            ("DELETE FROM ws_release_builds WHERE id = %s", ids["build"]),
        ):
            self._assert_rejected(statement, (value,))

        finding_id = f"finding-waiver-{uuid.uuid4().hex}"
        self.conn.execute(
            """
            INSERT INTO ws_release_findings(
                id, evaluation_id, rule_id, rule_version, severity, status,
                domain, subject, message, finding_key, waiver_id
            )
            VALUES (%s, %s, 'rule-1', '1', 'warning', 'open', 'bare_board',
                    'board', 'waived finding', %s, %s)
            """,
            (finding_id, ids["evaluation"], finding_id, ids["waiver"]),
        )
        self._assert_rejected(
            "DELETE FROM ws_release_waivers WHERE id = %s",
            (ids["waiver"],),
        )

    def test_stage_one_vocabularies_accept_canonical_values(self) -> None:
        ids = self._seed_release_graph()
        for index, outcome in enumerate(
            ("warning", "failure", "blocker", "unsupported", "waived"),
            start=1,
        ):
            evaluation_id = f"evaluation-vocabulary-{index}-{uuid.uuid4().hex}"
            self.conn.execute(
                """
                INSERT INTO ws_release_evaluations(
                    id, build_id, policy_binding_digest, outcome, evaluator_build
                )
                VALUES (%s, %s, %s, %s, %s)
                """,
                (
                    evaluation_id,
                    ids["build"],
                    f"vocabulary-digest-{index}-{uuid.uuid4().hex}",
                    outcome,
                    f"vocabulary-evaluator-{index}",
                ),
            )

        for outcome in ("warn", "block", "error"):
            self._assert_rejected(
                """
                INSERT INTO ws_release_evaluations(
                    id, build_id, policy_binding_digest, outcome, evaluator_build
                )
                VALUES (%s, %s, %s, %s, %s)
                """,
                (
                    f"evaluation-legacy-{outcome}-{uuid.uuid4().hex}",
                    ids["build"],
                    f"legacy-digest-{outcome}-{uuid.uuid4().hex}",
                    outcome,
                    f"legacy-evaluator-{outcome}",
                ),
            )

        self.conn.execute(
            """
            INSERT INTO ws_release_findings(
                id, evaluation_id, rule_id, rule_version, severity, status,
                domain, subject, message, finding_key
            )
            VALUES (%s, %s, 'rule-canonical', '1', 'blocker', 'waived',
                    'evidence', 'report', 'canonical finding', %s)
            """,
            (
                f"finding-canonical-{uuid.uuid4().hex}",
                ids["evaluation"],
                f"finding-key-{uuid.uuid4().hex}",
            ),
        )
        self._assert_rejected(
            """
            INSERT INTO ws_release_findings(
                id, evaluation_id, rule_id, rule_version, severity, status,
                domain, subject, message, finding_key
            )
            VALUES (%s, %s, 'rule-invalid', '1', 'warn', 'open',
                    'evidence', 'report', 'invalid finding', %s)
            """,
            (
                f"finding-invalid-severity-{uuid.uuid4().hex}",
                f"finding-key-{uuid.uuid4().hex}",
            ),
        )
        self._assert_rejected(
            """
            INSERT INTO ws_release_findings(
                id, evaluation_id, rule_id, rule_version, severity, status,
                domain, subject, message, finding_key
            )
            VALUES (%s, %s, 'rule-invalid', '1', 'warning', 'active',
                    'evidence', 'report', 'invalid finding', %s)
            """,
            (
                f"finding-invalid-status-{uuid.uuid4().hex}",
                f"finding-key-{uuid.uuid4().hex}",
            ),
        )

        for index, decision in enumerate(("changes_requested", "emergency_override"), start=1):
            self.conn.execute(
                """
                INSERT INTO ws_release_approvals(
                    id, project_id, config_key, candidate_id, build_id, role,
                    decision, approver, policy_binding_digest
                )
                VALUES (%s, %s, 'default', %s, %s, 'engineering', %s,
                        'approver@example.test', %s)
                """,
                (
                    f"approval-vocabulary-{index}-{uuid.uuid4().hex}",
                    ids["project"],
                    ids["candidate"],
                    ids["build"],
                    decision,
                    f"approval-digest-{index}-{uuid.uuid4().hex}",
                ),
            )
        self._assert_rejected(
            """
            INSERT INTO ws_release_approvals(
                id, project_id, config_key, candidate_id, build_id, role,
                decision, approver, policy_binding_digest
            )
            VALUES (%s, %s, 'default', %s, %s, 'engineering', 'pending',
                    'approver@example.test', %s)
            """,
            (
                f"approval-invalid-{uuid.uuid4().hex}",
                ids["project"],
                ids["candidate"],
                ids["build"],
                f"approval-invalid-digest-{uuid.uuid4().hex}",
            ),
        )

    def test_release_signature_key_pair_and_audit_genesis_checks(self) -> None:
        ids = self._seed_release_graph()
        self._insert_release_record(
            ids,
            f"release-no-signature-{uuid.uuid4().hex}",
            "unsigned",
            signature=None,
            use_default_signing_key=False,
        )
        self._assert_rejected(
            """
            INSERT INTO ws_release_records(
                id, project_id, config_key, candidate_id, build_id, release_label,
                dossier_digest, manifest_digest, attestation_digest, signature,
                attestation_artifact_id, commit_sha, released_by
            )
            VALUES (%s, %s, 'default', %s, %s, 'signature-only', 'dossier',
                    'manifest', 'attestation', 'signature', %s, 'commit', 'release')
            """,
            (
                f"release-signature-only-{uuid.uuid4().hex}",
                ids["project"],
                ids["candidate"],
                ids["build"],
                ids["artifact_attestation"],
            ),
        )
        self._assert_rejected(
            """
            INSERT INTO ws_release_records(
                id, project_id, config_key, candidate_id, build_id, release_label,
                dossier_digest, manifest_digest, attestation_digest, signing_key_id,
                attestation_artifact_id, commit_sha, released_by
            )
            VALUES (%s, %s, 'default', %s, %s, 'key-only', 'dossier',
                    'manifest', 'attestation', %s, %s, 'commit', 'release')
            """,
            (
                f"release-key-only-{uuid.uuid4().hex}",
                ids["project"],
                ids["candidate"],
                ids["build"],
                ids["key"],
                ids["artifact_attestation"],
            ),
        )
        self._insert_release_record(
            ids,
            f"release-signed-{uuid.uuid4().hex}",
            "signed",
        )

        self.conn.execute(
            """
            INSERT INTO ws_release_audit_events(
                id, project_id, config_key, sequence, event_type, actor,
                subject_kind, subject_id, previous_hash, event_hash, created_at_iso
            )
            VALUES (%s, %s, 'default', 2, 'release.created', 'system@example.test',
                    'release', %s, 'event-hash-1', 'event-hash-2', '2026-01-01T00:00:01Z')
            """,
            (f"audit-second-{uuid.uuid4().hex}", ids["project"], ids["audit"]),
        )
        for sequence, previous_hash in ((0, None), (1, "not-genesis"), (2, None), (2, "")):
            self._assert_rejected(
                """
                INSERT INTO ws_release_audit_events(
                    id, project_id, config_key, sequence, event_type, actor,
                    subject_kind, subject_id, previous_hash, event_hash, created_at_iso
                )
                VALUES (%s, %s, 'other', %s, 'invalid', 'system', 'release',
                        %s, %s, %s, '2026-01-01T00:00:02Z')
                """,
                (
                    f"audit-invalid-{sequence}-{uuid.uuid4().hex}",
                    ids["project"],
                    sequence,
                    ids["audit"],
                    previous_hash,
                    f"invalid-hash-{uuid.uuid4().hex}",
                ),
            )

    def test_published_policy_content_is_frozen_but_retirement_is_legal(self) -> None:
        ids = self._seed_release_graph()
        policy_id = f"policy-{uuid.uuid4().hex}"
        version_id = f"policy-version-{uuid.uuid4().hex}"
        self.conn.execute(
            """
            INSERT INTO ws_release_policies(id, policy_key, title)
            VALUES (%s, 'quality', 'Quality policy')
            """,
            (policy_id,),
        )
        self.conn.execute(
            """
            INSERT INTO ws_release_policy_versions(
                id, policy_id, version, rules, content_digest, created_by
            )
            VALUES (%s, %s, 1, '{"rules":["drc"]}', 'content-1', 'policy@example.test')
            """,
            (version_id, policy_id),
        )
        self._assert_rejected(
            "UPDATE ws_release_policy_versions SET status = 'published' WHERE id = %s",
            (version_id,),
        )
        self.conn.execute(
            """
            UPDATE ws_release_policy_versions
            SET status = 'published',
                published_at = TIMESTAMPTZ '2026-01-02 00:00:00+00',
                published_by = 'publisher@example.test'
            WHERE id = %s
            """,
            (version_id,),
        )
        self._assert_rejected(
            "UPDATE ws_release_policy_versions SET rules = '{\"rules\":[\"erc\"]}' WHERE id = %s",
            (version_id,),
        )
        self._assert_rejected(
            "UPDATE ws_release_policy_versions SET content_digest = 'content-2' WHERE id = %s",
            (version_id,),
        )
        self._assert_rejected(
            "UPDATE ws_release_policy_versions SET published_by = 'other@example.test' WHERE id = %s",
            (version_id,),
        )
        self._assert_rejected(
            "UPDATE ws_release_policy_versions SET status = 'retired' WHERE id = %s",
            (version_id,),
        )
        self.conn.execute(
            """
            UPDATE ws_release_policy_versions
            SET status = 'retired', retired_at = NOW(), retired_by = 'policy@example.test'
            WHERE id = %s
            """,
            (version_id,),
        )
        row = self.conn.execute(
            "SELECT status, retired_by FROM ws_release_policy_versions WHERE id = %s",
            (version_id,),
        ).fetchone()
        self.assertEqual((row["status"], row["retired_by"]), ("retired", "policy@example.test"))

    def test_release_record_allows_only_superseded_by_update_and_duplicate_dossier(self) -> None:
        ids = self._seed_release_graph()
        first_id = f"release-first-{uuid.uuid4().hex}"
        cross_config_id = f"release-cross-config-{uuid.uuid4().hex}"
        second_id = f"release-second-{uuid.uuid4().hex}"
        self._insert_release_record(ids, first_id, "v1")
        # The dossier digest is intentionally duplicated; only the release label
        # is unique for a project/configuration.
        self._insert_release_record(ids, cross_config_id, "v-cross", config_key="other")
        self._assert_rejected(
            "UPDATE ws_release_records SET superseded_by = %s WHERE id = %s",
            (cross_config_id, first_id),
        )
        self._insert_release_record(ids, second_id, "v2")
        self.conn.execute(
            "UPDATE ws_release_records SET superseded_by = %s WHERE id = %s",
            (second_id, first_id),
        )
        row = self.conn.execute(
            "SELECT superseded_by FROM ws_release_records WHERE id = %s",
            (first_id,),
        ).fetchone()
        self.assertEqual(row["superseded_by"], second_id)
        self._assert_rejected(
            "UPDATE ws_release_records SET release_label = 'v1-changed' WHERE id = %s",
            (first_id,),
        )
        self._assert_rejected(
            "DELETE FROM ws_release_records WHERE id = %s",
            (first_id,),
        )

    def test_v8_rows_upgrade_old_defaults_and_vocabulary(self) -> None:
        legacy_schema = f"release_r3_v8_{uuid.uuid4().hex}"
        self.conn.execute(f'CREATE SCHEMA "{legacy_schema}"')
        try:
            self.conn.execute(f'SET search_path TO "{legacy_schema}", public')
            self._create_base_workspace_tables()
            for version, _, migration in MIGRATIONS:
                if version <= 8:
                    migration(self.conn)

            suffix = uuid.uuid4().hex
            repository_id = f"legacy-repository-{suffix}"
            project_id = f"legacy-project-{suffix}"
            candidate_id = f"legacy-candidate-{suffix}"
            build_id = f"legacy-build-{suffix}"
            evaluation_id = f"legacy-evaluation-{suffix}"
            waiver_id = f"legacy-waiver-{suffix}"
            policy_id = f"legacy-policy-{suffix}"
            published_version_id = f"legacy-published-version-{suffix}"
            preserved_version_id = f"legacy-preserved-version-{suffix}"
            created_at = "2026-01-03 00:00:00+00"

            self.conn.execute(
                "INSERT INTO ws_repositories(id) VALUES (%s)",
                (repository_id,),
            )
            self.conn.execute(
                "INSERT INTO ws_projects(id, repo_id) VALUES (%s, %s)",
                (project_id, repository_id),
            )
            self.conn.execute(
                """
                INSERT INTO ws_release_candidates(
                    id, project_id, repository_id, config_key, commit_sha,
                    technical_config_digest, input_closure_digest, toolchain_digest,
                    generator_build, build_key, status
                )
                VALUES (%s, %s, %s, 'default', 'legacy-commit', 'technical',
                        'closure', 'toolchain', 'generator', %s, 'built')
                """,
                (candidate_id, project_id, repository_id, f"legacy-build-key-{suffix}"),
            )
            self.conn.execute(
                "INSERT INTO ws_release_builds(id, candidate_id, status) VALUES (%s, %s, 'succeeded')",
                (build_id, candidate_id),
            )
            self.conn.execute(
                """
                INSERT INTO ws_release_evaluations(
                    id, build_id, policy_binding_digest, outcome
                )
                VALUES (%s, %s, 'legacy-policy-binding', 'warn')
                """,
                (evaluation_id, build_id),
            )
            self.conn.execute(
                """
                INSERT INTO ws_release_waivers(
                    id, project_id, config_key, rule_id, domain, subject_pattern,
                    finding_key, reason, owner
                )
                VALUES (%s, %s, 'default', 'legacy-rule', 'bare_board', '*',
                        'legacy-finding', 'legacy waiver', 'legacy-owner')
                """,
                (waiver_id, project_id),
            )
            self.conn.execute(
                """
                INSERT INTO ws_release_policies(id, policy_key, title)
                VALUES (%s, %s, 'Legacy policy')
                """,
                (policy_id, f"legacy-policy-key-{suffix}"),
            )
            self.conn.execute(
                """
                INSERT INTO ws_release_policy_versions(
                    id, policy_id, version, status, content_digest,
                    created_by, created_at
                )
                VALUES (%s, %s, 1, 'published', 'legacy-content', '', %s)
                """,
                (published_version_id, policy_id, created_at),
            )
            self.conn.execute(
                """
                INSERT INTO ws_release_policy_versions(
                    id, policy_id, version, rules, content_digest, created_by
                )
                VALUES (%s, %s, 2, '{"keep":["object"]}', 'preserved-content', 'legacy-owner')
                """,
                (preserved_version_id, policy_id),
            )

            _release_studio_hardening(self.conn)
            _release_studio_hardening(self.conn)

            evaluation = self.conn.execute(
                "SELECT outcome FROM ws_release_evaluations WHERE id = %s",
                (evaluation_id,),
            ).fetchone()
            self.assertEqual(evaluation["outcome"], "warning")
            waiver = self.conn.execute(
                "SELECT evidence FROM ws_release_waivers WHERE id = %s",
                (waiver_id,),
            ).fetchone()
            self.assertEqual(waiver["evidence"], [])
            versions = self.conn.execute(
                """
                SELECT id, rules, published_at, published_by
                FROM ws_release_policy_versions
                WHERE id IN (%s, %s)
                ORDER BY id
                """,
                (published_version_id, preserved_version_id),
            ).fetchall()
            by_id = {row["id"]: row for row in versions}
            self.assertEqual(by_id[preserved_version_id]["rules"], {"keep": ["object"]})
            self.assertEqual(by_id[published_version_id]["published_by"], "release-studio-migration-9")
            self.assertEqual(
                by_id[published_version_id]["published_at"].isoformat(),
                "2026-01-03T00:00:00+00:00",
            )
        finally:
            self.conn.rollback()
            self.conn.execute(f'SET search_path TO "{self.schema}", public')
            self.conn.execute(f'DROP SCHEMA IF EXISTS "{legacy_schema}" CASCADE')
            self.conn.commit()


class ReleaseStudioMigrationLadderTests(unittest.TestCase):
    def test_migration_9_is_named_and_follows_migrations_1_to_8(self) -> None:
        self.assertEqual(
            [(version, name) for version, name, _ in MIGRATIONS],
            [
                (1, "v3_job_foundation"),
                (2, "workspace_read_versions"),
                (3, "git_read_cache"),
                (4, "webgpu_ready_metadata"),
                (5, "thumbnail_metadata"),
                (6, "thumbnail_source"),
                (7, "generated_thumbnail_default"),
                (8, "release_studio"),
                (9, "release_studio_hardening"),
            ],
        )


if __name__ == "__main__":
    unittest.main()
