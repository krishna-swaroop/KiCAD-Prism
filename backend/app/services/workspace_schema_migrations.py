from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any


logger = logging.getLogger(__name__)

Migration = Callable[[Any], None]


def _v3_job_foundation(conn: Any) -> None:
    """Upgrade the legacy status-only workspace job table in place."""

    conn.execute(
        """
        ALTER TABLE ws_jobs
            ADD COLUMN IF NOT EXISTS worker_pool TEXT NOT NULL DEFAULT 'prism',
            ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 100,
            ADD COLUMN IF NOT EXISTS artifact_key TEXT,
            ADD COLUMN IF NOT EXISTS project_id TEXT,
            ADD COLUMN IF NOT EXISTS repository_id TEXT,
            ADD COLUMN IF NOT EXISTS requested_by TEXT NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS result_path TEXT,
            ADD COLUMN IF NOT EXISTS result_digest TEXT,
            ADD COLUMN IF NOT EXISTS result_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            ADD COLUMN IF NOT EXISTS log_path TEXT,
            ADD COLUMN IF NOT EXISTS error_code TEXT NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS error_message TEXT NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS fence BIGINT NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS lease_owner TEXT NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            ADD COLUMN IF NOT EXISTS attempt INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3,
            ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS resource_requirements JSONB NOT NULL DEFAULT '{}'::jsonb,
            ADD COLUMN IF NOT EXISTS lock_requirements JSONB NOT NULL DEFAULT '[]'::jsonb
        """
    )
    conn.execute(
        """
        UPDATE ws_jobs
        SET available_at = COALESCE(available_at, created_at, NOW()),
            started_at = CASE
                WHEN status = 'running' THEN COALESCE(started_at, created_at)
                ELSE started_at
            END,
            completed_at = CASE
                WHEN status IN ('completed', 'failed', 'cancelled')
                THEN COALESCE(completed_at, updated_at)
                ELSE completed_at
            END
        """
    )
    conn.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_ws_jobs_active_artifact
        ON ws_jobs(kind, artifact_key)
        WHERE artifact_key IS NOT NULL
          AND artifact_key <> ''
          AND status IN ('queued', 'running', 'retry_wait', 'cancel_requested')
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_ws_jobs_claim_v3
        ON ws_jobs(worker_pool, status, available_at, priority, created_at)
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_ws_jobs_project_created
        ON ws_jobs(project_id, created_at DESC)
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_job_events (
            id BIGSERIAL PRIMARY KEY,
            job_id TEXT NOT NULL REFERENCES ws_jobs(id) ON DELETE CASCADE,
            event_type TEXT NOT NULL,
            stage TEXT NOT NULL DEFAULT '',
            percent REAL,
            details JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_ws_job_events_job_id
        ON ws_job_events(job_id, id)
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_job_resource_slots (
            resource_name TEXT NOT NULL,
            slot_number INTEGER NOT NULL,
            job_id TEXT REFERENCES ws_jobs(id) ON DELETE SET NULL,
            fence BIGINT,
            lease_owner TEXT NOT NULL DEFAULT '',
            lease_expires_at TIMESTAMPTZ,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY(resource_name, slot_number)
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_ws_job_resource_slots_lease
        ON ws_job_resource_slots(resource_name, lease_expires_at)
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_job_locks (
            lock_key TEXT NOT NULL,
            job_id TEXT NOT NULL REFERENCES ws_jobs(id) ON DELETE CASCADE,
            fence BIGINT NOT NULL,
            mode TEXT NOT NULL CHECK (mode IN ('read', 'write')),
            lease_owner TEXT NOT NULL,
            lease_expires_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY(lock_key, job_id)
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_ws_job_locks_lease
        ON ws_job_locks(lock_key, lease_expires_at)
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_artifacts (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            artifact_key TEXT NOT NULL,
            digest TEXT NOT NULL,
            object_path TEXT NOT NULL,
            media_type TEXT NOT NULL DEFAULT 'application/octet-stream',
            size_bytes BIGINT NOT NULL DEFAULT 0,
            schema_version TEXT NOT NULL DEFAULT '',
            generator_version TEXT NOT NULL DEFAULT '',
            readiness TEXT NOT NULL DEFAULT 'ready',
            source_job_id TEXT REFERENCES ws_jobs(id) ON DELETE SET NULL,
            source_fence BIGINT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            invalidated_at TIMESTAMPTZ,
            UNIQUE(kind, artifact_key, digest)
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_ws_artifacts_lookup
        ON ws_artifacts(kind, artifact_key, readiness, created_at DESC)
        WHERE invalidated_at IS NULL
        """
    )


def _workspace_read_versions(conn: Any) -> None:
    """Maintain one cheap monotonic version for role-filtered bootstrap ETags."""

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_workspace_state (
            id SMALLINT PRIMARY KEY CHECK (id = 1),
            version BIGINT NOT NULL DEFAULT 1,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    conn.execute(
        """
        INSERT INTO ws_workspace_state(id, version)
        VALUES (1, 1)
        ON CONFLICT (id) DO NOTHING
        """
    )
    conn.execute(
        """
        CREATE OR REPLACE FUNCTION ws_bump_workspace_version()
        RETURNS TRIGGER AS $$
        BEGIN
            UPDATE ws_workspace_state
            SET version = version + 1, updated_at = NOW()
            WHERE id = 1;
            RETURN NULL;
        END;
        $$ LANGUAGE plpgsql
        """
    )
    for table in (
        "ws_repositories",
        "ws_projects",
        "ws_folders",
        "ws_project_portfolio",
    ):
        trigger = f"trg_{table}_workspace_version"
        conn.execute(f"DROP TRIGGER IF EXISTS {trigger} ON {table}")
        conn.execute(
            f"""
            CREATE TRIGGER {trigger}
            AFTER INSERT OR UPDATE OR DELETE ON {table}
            FOR EACH STATEMENT
            EXECUTE FUNCTION ws_bump_workspace_version()
            """
        )


def _git_read_cache(conn: Any) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_git_read_cache (
            cache_key TEXT PRIMARY KEY,
            cache_kind TEXT NOT NULL,
            repository_key TEXT NOT NULL,
            resolved_ref_sha TEXT NOT NULL,
            payload JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_ws_git_read_cache_retention
        ON ws_git_read_cache(last_accessed_at)
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_ws_git_read_cache_repository
        ON ws_git_read_cache(repository_key, cache_kind, resolved_ref_sha)
        """
    )


def _webgpu_ready_metadata(conn: Any) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_webgpu_ready (
            project_id TEXT NOT NULL,
            selector_key TEXT NOT NULL,
            generator_build TEXT NOT NULL,
            source_revision_key TEXT NOT NULL,
            bundle_url TEXT NOT NULL,
            status_payload JSONB NOT NULL,
            source_job_id TEXT NOT NULL REFERENCES ws_jobs(id) ON DELETE CASCADE,
            source_fence BIGINT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            invalidated_at TIMESTAMPTZ,
            PRIMARY KEY(project_id, selector_key, generator_build)
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_ws_webgpu_ready_source
        ON ws_webgpu_ready(project_id, source_revision_key, generator_build)
        WHERE invalidated_at IS NULL
        """
    )


def _thumbnail_metadata(conn: Any) -> None:
    conn.execute(
        """
        ALTER TABLE ws_projects
            ADD COLUMN IF NOT EXISTS thumbnail_digest TEXT,
            ADD COLUMN IF NOT EXISTS thumbnail_media_type TEXT,
            ADD COLUMN IF NOT EXISTS thumbnail_size_bytes BIGINT
        """
    )


def _thumbnail_source(conn: Any) -> None:
    """Record whether a thumbnail is committed in the repo or generated by Prism.

    Generated thumbnails moved out of the Git checkout, so `thumbnail_rel` alone
    no longer says where to read one from. Existing rows all predate the move
    and resolve inside the checkout, which is what the default describes.
    """
    conn.execute(
        """
        ALTER TABLE ws_projects
            ADD COLUMN IF NOT EXISTS thumbnail_source TEXT NOT NULL DEFAULT 'repository'
        """
    )


def _generated_thumbnail_default(conn: Any) -> None:
    """Make Prism's own render the default a project falls back to.

    A project now shows a render of its board rather than whatever image happens
    to sit in the repository. Rows already pointing at a committed image keep
    doing so until the next render replaces it, so nothing goes blank in the
    meantime; only the column default changes here.
    """
    conn.execute(
        """
        ALTER TABLE ws_projects
            ALTER COLUMN thumbnail_source SET DEFAULT 'generated'
        """
    )


def _release_studio(conn: Any) -> None:
    """Add the Release Studio technical and governance records.

    The release schema is deliberately append-oriented.  IDs are TEXT because
    the service layer owns UUID generation; the migration only supplies safe
    data-shape defaults and database invariants.
    """

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_release_configurations (
            id              TEXT PRIMARY KEY,
            project_id      TEXT NOT NULL
                            REFERENCES ws_projects(id) ON DELETE CASCADE,
            config_key      TEXT NOT NULL,
            title           TEXT NOT NULL DEFAULT '',
            board_rel       TEXT NOT NULL DEFAULT '',
            schematic_rel   TEXT NOT NULL DEFAULT '',
            jobset_rel      TEXT NOT NULL DEFAULT '',
            default_variant TEXT NOT NULL DEFAULT '',
            created_by      TEXT NOT NULL DEFAULT '',
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_ws_release_configurations_project_key
                UNIQUE (project_id, config_key)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_release_candidates (
            id                     TEXT PRIMARY KEY,
            project_id             TEXT NOT NULL
                                   REFERENCES ws_projects(id) ON DELETE CASCADE,
            repository_id          TEXT NOT NULL
                                   REFERENCES ws_repositories(id) ON DELETE CASCADE,
            config_key             TEXT NOT NULL,
            commit_sha             TEXT NOT NULL,
            variant                TEXT NOT NULL DEFAULT '',
            technical_config_digest TEXT NOT NULL,
            input_closure_digest   TEXT NOT NULL,
            toolchain_digest       TEXT NOT NULL,
            generator_build        TEXT NOT NULL,
            build_key              TEXT NOT NULL,
            status                 TEXT NOT NULL DEFAULT 'draft'
                                   CHECK (status IN (
                                       'draft', 'building', 'built', 'failed',
                                       'superseded', 'frozen'
                                   )),
            hermetic               BOOLEAN NOT NULL DEFAULT TRUE,
            non_hermetic_reasons  JSONB NOT NULL DEFAULT '[]'::jsonb,
            authored_overrides    JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_by             TEXT NOT NULL DEFAULT '',
            created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_ws_release_candidates_build_key
                UNIQUE (project_id, config_key, build_key)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_release_closure_inputs (
            id                 TEXT PRIMARY KEY,
            candidate_id       TEXT NOT NULL
                               REFERENCES ws_release_candidates(id) ON DELETE CASCADE,
            kind               TEXT NOT NULL
                               CHECK (kind IN (
                                   'repository', 'submodule', 'lfs', 'toolchain', 'env'
                               )),
            path               TEXT NOT NULL,
            git_object_id      TEXT,
            mode               TEXT,
            object_type        TEXT,
            lfs_oid            TEXT,
            materialized_digest TEXT,
            details            JSONB NOT NULL DEFAULT '{}'::jsonb,
            CONSTRAINT uq_ws_release_closure_inputs_identity
                UNIQUE (candidate_id, kind, path)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_release_builds (
            id                  TEXT PRIMARY KEY,
            candidate_id        TEXT NOT NULL
                                REFERENCES ws_release_candidates(id) ON DELETE CASCADE,
            job_id              TEXT
                                REFERENCES ws_jobs(id) ON DELETE SET NULL,
            fence               BIGINT NOT NULL DEFAULT 0,
            attempt             INTEGER NOT NULL DEFAULT 0,
            status              TEXT NOT NULL DEFAULT 'queued'
                                CHECK (status IN (
                                    'queued', 'running', 'succeeded', 'failed', 'cancelled'
                                )),
            manifest_digest     TEXT NOT NULL DEFAULT '',
            dossier_digest      TEXT NOT NULL DEFAULT '',
            dossier_artifact_id TEXT
                                REFERENCES ws_artifacts(id) ON DELETE RESTRICT,
            evidence_artifact_id TEXT
                                REFERENCES ws_artifacts(id) ON DELETE RESTRICT,
            toolchain           JSONB NOT NULL DEFAULT '{}'::jsonb,
            timings             JSONB NOT NULL DEFAULT '{}'::jsonb,
            warnings            JSONB NOT NULL DEFAULT '[]'::jsonb,
            error_code          TEXT NOT NULL DEFAULT '',
            error_message       TEXT NOT NULL DEFAULT '',
            started_at          TIMESTAMPTZ,
            completed_at        TIMESTAMPTZ,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_release_members (
            id                TEXT PRIMARY KEY,
            build_id          TEXT NOT NULL
                              REFERENCES ws_release_builds(id) ON DELETE CASCADE,
            path              TEXT NOT NULL,
            member_kind       TEXT NOT NULL,
            media_type        TEXT NOT NULL,
            size_bytes        BIGINT NOT NULL DEFAULT 0,
            released_digest   TEXT NOT NULL,
            source_raw_digest TEXT NOT NULL,
            canonicalizer     TEXT NOT NULL DEFAULT '',
            created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_ws_release_members_build_path
                UNIQUE (build_id, path),
            CONSTRAINT uq_ws_release_members_id_build
                UNIQUE (id, build_id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_release_member_domains (
            member_id TEXT NOT NULL,
            build_id  TEXT NOT NULL,
            domain    TEXT NOT NULL
                      CHECK (domain IN (
                          'bare_board', 'assembly', 'documentation', 'evidence'
                      )),
            CONSTRAINT pk_ws_release_member_domains PRIMARY KEY (member_id, domain),
            CONSTRAINT fk_ws_release_member_domains_member_build
                FOREIGN KEY (member_id, build_id)
                REFERENCES ws_release_members(id, build_id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_release_evidence (
            id            TEXT PRIMARY KEY,
            build_id      TEXT NOT NULL
                          REFERENCES ws_release_builds(id) ON DELETE CASCADE,
            kind          TEXT NOT NULL CHECK (kind IN ('drc', 'erc')),
            report_digest TEXT NOT NULL,
            counts        JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_release_scope_fingerprints (
            build_id   TEXT NOT NULL
                       REFERENCES ws_release_builds(id) ON DELETE CASCADE,
            domain     TEXT NOT NULL
                       CHECK (domain IN (
                           'bare_board', 'assembly', 'documentation', 'evidence'
                       )),
            fingerprint TEXT NOT NULL,
            inputs     JSONB NOT NULL DEFAULT '{}'::jsonb,
            fidelity   TEXT NOT NULL
                       CHECK (fidelity IN ('artifact', 'board', 'semantic')),
            CONSTRAINT pk_ws_release_scope_fingerprints PRIMARY KEY (build_id, domain)
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_release_policies (
            id          TEXT PRIMARY KEY,
            policy_key  TEXT NOT NULL UNIQUE,
            title       TEXT NOT NULL DEFAULT '',
            created_by  TEXT NOT NULL DEFAULT '',
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_release_policy_versions (
            id          TEXT PRIMARY KEY,
            policy_id   TEXT NOT NULL
                        REFERENCES ws_release_policies(id) ON DELETE CASCADE,
            version     INTEGER NOT NULL CHECK (version > 0),
            status      TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'published', 'retired')),
            rules       JSONB NOT NULL DEFAULT '{}'::jsonb,
            content_digest TEXT NOT NULL,
            retired_at  TIMESTAMPTZ,
            retired_by  TEXT,
            created_by  TEXT NOT NULL DEFAULT '',
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_ws_release_policy_versions_identity
                UNIQUE (policy_id, version),
            CONSTRAINT ck_ws_release_policy_versions_retirement
                CHECK (
                    (
                        status = 'retired'
                        AND retired_at IS NOT NULL
                        AND retired_by IS NOT NULL
                        AND btrim(retired_by) <> ''
                    )
                    OR (
                        status IN ('draft', 'published')
                        AND retired_at IS NULL
                        AND retired_by IS NULL
                    )
                )
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_release_evaluations (
            id                    TEXT PRIMARY KEY,
            build_id              TEXT NOT NULL
                                  REFERENCES ws_release_builds(id) ON DELETE CASCADE,
            policy_binding        JSONB NOT NULL DEFAULT '{}'::jsonb,
            policy_binding_digest TEXT NOT NULL,
            outcome               TEXT NOT NULL
                                  CHECK (outcome IN (
                                      'pass', 'warn', 'block', 'waived',
                                      'unsupported', 'error'
                                  )),
            counts                JSONB NOT NULL DEFAULT '{}'::jsonb,
            evaluator_build       TEXT NOT NULL DEFAULT '',
            created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_ws_release_evaluations_identity
                UNIQUE (build_id, policy_binding_digest, evaluator_build)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_release_waivers (
            id              TEXT PRIMARY KEY,
            project_id      TEXT NOT NULL
                            REFERENCES ws_projects(id) ON DELETE CASCADE,
            config_key      TEXT NOT NULL,
            rule_id         TEXT NOT NULL,
            domain          TEXT NOT NULL
                            CHECK (domain IN (
                                'bare_board', 'assembly', 'documentation', 'evidence'
                            )),
            subject_pattern TEXT NOT NULL,
            finding_key     TEXT NOT NULL,
            reason          TEXT NOT NULL,
            owner           TEXT NOT NULL,
            approver        TEXT,
            status          TEXT NOT NULL DEFAULT 'proposed'
                            CHECK (status IN (
                                'proposed', 'approved', 'rejected', 'revoked', 'expired'
                            )),
            evidence        JSONB NOT NULL DEFAULT '{}'::jsonb,
            expires_at      TIMESTAMPTZ,
            approved_at     TIMESTAMPTZ,
            revoked_at      TIMESTAMPTZ,
            revoked_reason  TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_release_findings (
            id            TEXT PRIMARY KEY,
            evaluation_id TEXT NOT NULL
                          REFERENCES ws_release_evaluations(id) ON DELETE CASCADE,
            rule_id       TEXT NOT NULL,
            rule_version  TEXT NOT NULL,
            severity      TEXT NOT NULL,
            status        TEXT NOT NULL,
            domain        TEXT NOT NULL
                          CHECK (domain IN (
                              'bare_board', 'assembly', 'documentation', 'evidence'
                          )),
            subject       TEXT NOT NULL,
            message       TEXT NOT NULL,
            observed      JSONB NOT NULL DEFAULT '{}'::jsonb,
            expected      JSONB NOT NULL DEFAULT '{}'::jsonb,
            finding_key   TEXT NOT NULL,
            waiver_id     TEXT
                          REFERENCES ws_release_waivers(id) ON DELETE SET NULL,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_release_approvals (
            id                             TEXT PRIMARY KEY,
            project_id                     TEXT NOT NULL
                                           REFERENCES ws_projects(id) ON DELETE CASCADE,
            config_key                     TEXT NOT NULL,
            candidate_id                   TEXT NOT NULL
                                           REFERENCES ws_release_candidates(id) ON DELETE CASCADE,
            build_id                       TEXT NOT NULL
                                           REFERENCES ws_release_builds(id) ON DELETE CASCADE,
            role                           TEXT NOT NULL,
            domains                        TEXT[] NOT NULL DEFAULT '{}'::text[],
            decision                       TEXT NOT NULL,
            approver                       TEXT NOT NULL,
            note                           TEXT NOT NULL DEFAULT '',
            self_approval_override_reason  TEXT,
            technical_scope_fingerprints   JSONB NOT NULL DEFAULT '{}'::jsonb,
            policy_binding_digest          TEXT NOT NULL,
            manifest_digest                TEXT NOT NULL DEFAULT '',
            carried_from_approval_id       TEXT
                                           REFERENCES ws_release_approvals(id)
                                           ON DELETE SET NULL,
            reauth_context                 JSONB NOT NULL DEFAULT '{}'::jsonb,
            evaluation_id                 TEXT
                                           REFERENCES ws_release_evaluations(id)
                                           ON DELETE SET NULL,
            created_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_release_approval_invalidations (
            id              TEXT PRIMARY KEY,
            approval_id     TEXT NOT NULL
                            REFERENCES ws_release_approvals(id) ON DELETE CASCADE,
            reason          TEXT NOT NULL,
            stale_component TEXT NOT NULL
                            CHECK (stale_component IN ('technical', 'policy', 'both')),
            changed_domains TEXT[] NOT NULL DEFAULT '{}'::text[],
            created_by      TEXT NOT NULL DEFAULT '',
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )

    # Signing keys contain public material only.  They are created before
    # release records so the record's signing_key_id can be a real FK.
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_release_signing_keys (
            key_id      TEXT PRIMARY KEY,
            algorithm   TEXT NOT NULL,
            public_key  TEXT NOT NULL,
            status      TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'superseded', 'revoked')),
            valid_from  TIMESTAMPTZ NOT NULL,
            valid_to    TIMESTAMPTZ,
            created_by  TEXT NOT NULL DEFAULT '',
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT ck_ws_release_signing_keys_validity
                CHECK (valid_to IS NULL OR valid_to >= valid_from)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_release_records (
            id                   TEXT PRIMARY KEY,
            project_id           TEXT NOT NULL
                                 REFERENCES ws_projects(id) ON DELETE RESTRICT,
            config_key           TEXT NOT NULL,
            candidate_id         TEXT NOT NULL
                                 REFERENCES ws_release_candidates(id) ON DELETE RESTRICT,
            build_id             TEXT NOT NULL
                                 REFERENCES ws_release_builds(id) ON DELETE RESTRICT,
            release_label        TEXT NOT NULL,
            document_number      TEXT NOT NULL DEFAULT '',
            revision             TEXT NOT NULL DEFAULT '',
            dossier_digest       TEXT NOT NULL,
            manifest_digest      TEXT NOT NULL,
            attestation_digest   TEXT NOT NULL,
            signature            TEXT,
            signing_key_id       TEXT
                                 REFERENCES ws_release_signing_keys(key_id) ON DELETE RESTRICT,
            attestation_artifact_id TEXT
                                 REFERENCES ws_artifacts(id) ON DELETE RESTRICT,
            commit_sha           TEXT NOT NULL,
            variant              TEXT NOT NULL DEFAULT '',
            released_by          TEXT NOT NULL DEFAULT '',
            policy_snapshot      JSONB NOT NULL DEFAULT '{}'::jsonb,
            approval_snapshot    JSONB NOT NULL DEFAULT '{}'::jsonb,
            superseded_by        TEXT
                                 REFERENCES ws_release_records(id) ON DELETE RESTRICT,
            created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_ws_release_records_label
                UNIQUE (project_id, config_key, release_label),
            CONSTRAINT ck_ws_release_records_not_self_superseded
                CHECK (superseded_by IS NULL OR superseded_by <> id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_release_audit_events (
            id             TEXT PRIMARY KEY,
            project_id     TEXT NOT NULL
                           REFERENCES ws_projects(id) ON DELETE RESTRICT,
            config_key     TEXT NOT NULL,
            sequence       BIGINT NOT NULL,
            event_type     TEXT NOT NULL,
            actor          TEXT NOT NULL,
            subject_kind   TEXT NOT NULL,
            subject_id     TEXT NOT NULL,
            details        JSONB NOT NULL DEFAULT '{}'::jsonb,
            previous_hash  TEXT,
            event_hash     TEXT NOT NULL,
            created_at_iso TEXT NOT NULL,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_ws_release_audit_events_sequence
                UNIQUE (project_id, config_key, sequence)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_artifact_release_pins (
            artifact_id TEXT PRIMARY KEY
                        REFERENCES ws_artifacts(id) ON DELETE CASCADE,
            pin_kind    TEXT NOT NULL,
            pin_ref     TEXT NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )

    for statement in (
        """
        CREATE INDEX IF NOT EXISTS idx_ws_release_candidates_project
        ON ws_release_candidates(project_id, config_key, created_at DESC)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_ws_release_candidates_repository
        ON ws_release_candidates(repository_id, commit_sha)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_ws_release_closure_inputs_candidate
        ON ws_release_closure_inputs(candidate_id, kind, path)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_ws_release_builds_candidate
        ON ws_release_builds(candidate_id, created_at DESC)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_ws_release_builds_manifest_digest_nonempty
        ON ws_release_builds(manifest_digest)
        WHERE manifest_digest IS NOT NULL AND manifest_digest <> ''
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_ws_release_members_build
        ON ws_release_members(build_id, path)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_ws_release_member_domains_build
        ON ws_release_member_domains(build_id, domain)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_ws_release_evidence_build
        ON ws_release_evidence(build_id, kind)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_ws_release_scope_fingerprints_build
        ON ws_release_scope_fingerprints(build_id, domain)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_ws_release_policy_versions_policy
        ON ws_release_policy_versions(policy_id, version DESC)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_ws_release_evaluations_build
        ON ws_release_evaluations(build_id, created_at DESC)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_ws_release_waivers_project
        ON ws_release_waivers(project_id, config_key, status)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_ws_release_findings_evaluation
        ON ws_release_findings(evaluation_id, finding_key)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_ws_release_approvals_build
        ON ws_release_approvals(build_id, created_at DESC)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_ws_release_approval_invalidations_approval
        ON ws_release_approval_invalidations(approval_id, created_at DESC)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_ws_release_records_project
        ON ws_release_records(project_id, config_key, created_at DESC)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_ws_release_audit_events_project
        ON ws_release_audit_events(project_id, config_key, sequence)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_ws_artifact_release_pins_ref
        ON ws_artifact_release_pins(pin_kind, pin_ref)
        """,
    ):
        conn.execute(statement)

    conn.execute(
        """
        CREATE OR REPLACE FUNCTION ws_release_immutable_history_guard()
        RETURNS TRIGGER AS $$
        BEGIN
            RAISE EXCEPTION '% rows are immutable; append a new history row',
                TG_TABLE_NAME
                USING ERRCODE = '55000';
        END;
        $$ LANGUAGE plpgsql
        """
    )
    conn.execute(
        """
        CREATE OR REPLACE FUNCTION ws_release_policy_version_guard()
        RETURNS TRIGGER AS $$
        BEGIN
            IF TG_OP = 'DELETE' THEN
                IF OLD.status IN ('published', 'retired') THEN
                    RAISE EXCEPTION
                        'published or retired policy versions cannot be deleted'
                        USING ERRCODE = '55000';
                END IF;
                RETURN OLD;
            END IF;

            IF OLD.status = 'published' THEN
                IF NEW.status = 'retired'
                   AND NEW.id = OLD.id
                   AND NEW.policy_id = OLD.policy_id
                   AND NEW.version = OLD.version
                   AND NEW.rules IS NOT DISTINCT FROM OLD.rules
                   AND NEW.content_digest = OLD.content_digest
                   AND NEW.created_by = OLD.created_by
                   AND NEW.created_at = OLD.created_at
                   AND NEW.retired_at IS NOT NULL
                   AND NEW.retired_by IS NOT NULL
                   AND btrim(NEW.retired_by) <> ''
                THEN
                    RETURN NEW;
                END IF;

                IF NEW.id = OLD.id
                   AND NEW.policy_id = OLD.policy_id
                   AND NEW.version = OLD.version
                   AND NEW.status = OLD.status
                   AND NEW.rules IS NOT DISTINCT FROM OLD.rules
                   AND NEW.content_digest = OLD.content_digest
                   AND NEW.retired_at IS NOT DISTINCT FROM OLD.retired_at
                   AND NEW.retired_by IS NOT DISTINCT FROM OLD.retired_by
                   AND NEW.created_by = OLD.created_by
                   AND NEW.created_at = OLD.created_at
                THEN
                    RETURN NEW;
                END IF;

                RAISE EXCEPTION
                    'published policy version content is immutable; only published to retired is legal'
                    USING ERRCODE = '55000';
            END IF;

            IF OLD.status = 'retired' THEN
                IF NEW.id = OLD.id
                   AND NEW.policy_id = OLD.policy_id
                   AND NEW.version = OLD.version
                   AND NEW.status = OLD.status
                   AND NEW.rules IS NOT DISTINCT FROM OLD.rules
                   AND NEW.content_digest = OLD.content_digest
                   AND NEW.retired_at = OLD.retired_at
                   AND NEW.retired_by = OLD.retired_by
                   AND NEW.created_by = OLD.created_by
                   AND NEW.created_at = OLD.created_at
                THEN
                    RETURN NEW;
                END IF;

                RAISE EXCEPTION
                    'retired policy versions are immutable'
                    USING ERRCODE = '55000';
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )
    conn.execute(
        """
        CREATE OR REPLACE FUNCTION ws_release_record_guard()
        RETURNS TRIGGER AS $$
        BEGIN
            IF TG_OP = 'DELETE' THEN
                RAISE EXCEPTION
                    'release records are immutable; update superseded_by instead'
                    USING ERRCODE = '55000';
            END IF;

            IF NEW.id IS DISTINCT FROM OLD.id
               OR NEW.project_id IS DISTINCT FROM OLD.project_id
               OR NEW.config_key IS DISTINCT FROM OLD.config_key
               OR NEW.candidate_id IS DISTINCT FROM OLD.candidate_id
               OR NEW.build_id IS DISTINCT FROM OLD.build_id
               OR NEW.release_label IS DISTINCT FROM OLD.release_label
               OR NEW.document_number IS DISTINCT FROM OLD.document_number
               OR NEW.revision IS DISTINCT FROM OLD.revision
               OR NEW.dossier_digest IS DISTINCT FROM OLD.dossier_digest
               OR NEW.manifest_digest IS DISTINCT FROM OLD.manifest_digest
               OR NEW.attestation_digest IS DISTINCT FROM OLD.attestation_digest
               OR NEW.signature IS DISTINCT FROM OLD.signature
               OR NEW.signing_key_id IS DISTINCT FROM OLD.signing_key_id
               OR NEW.attestation_artifact_id IS DISTINCT FROM OLD.attestation_artifact_id
               OR NEW.commit_sha IS DISTINCT FROM OLD.commit_sha
               OR NEW.variant IS DISTINCT FROM OLD.variant
               OR NEW.released_by IS DISTINCT FROM OLD.released_by
               OR NEW.policy_snapshot IS DISTINCT FROM OLD.policy_snapshot
               OR NEW.approval_snapshot IS DISTINCT FROM OLD.approval_snapshot
               OR NEW.created_at IS DISTINCT FROM OLD.created_at
            THEN
                RAISE EXCEPTION
                    'release records are immutable except for superseded_by'
                    USING ERRCODE = '55000';
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )

    for table, trigger in (
        ("ws_release_approvals", "trg_ws_release_approvals_immutable"),
        (
            "ws_release_approval_invalidations",
            "trg_ws_release_approval_invalidations_immutable",
        ),
        ("ws_release_audit_events", "trg_ws_release_audit_events_immutable"),
    ):
        conn.execute(f"DROP TRIGGER IF EXISTS {trigger} ON {table}")
        conn.execute(
            f"""
            CREATE TRIGGER {trigger}
            BEFORE UPDATE OR DELETE ON {table}
            FOR EACH ROW
            EXECUTE FUNCTION ws_release_immutable_history_guard()
            """
        )

    conn.execute("DROP TRIGGER IF EXISTS trg_ws_release_waivers_no_delete ON ws_release_waivers")
    conn.execute(
        """
        CREATE TRIGGER trg_ws_release_waivers_no_delete
        BEFORE DELETE ON ws_release_waivers
        FOR EACH ROW
        EXECUTE FUNCTION ws_release_immutable_history_guard()
        """
    )
    conn.execute(
        "DROP TRIGGER IF EXISTS trg_ws_release_policy_versions_guard ON ws_release_policy_versions"
    )
    conn.execute(
        """
        CREATE TRIGGER trg_ws_release_policy_versions_guard
        BEFORE UPDATE OR DELETE ON ws_release_policy_versions
        FOR EACH ROW
        EXECUTE FUNCTION ws_release_policy_version_guard()
        """
    )
    conn.execute("DROP TRIGGER IF EXISTS trg_ws_release_records_guard ON ws_release_records")
    conn.execute(
        """
        CREATE TRIGGER trg_ws_release_records_guard
        BEFORE UPDATE OR DELETE ON ws_release_records
        FOR EACH ROW
        EXECUTE FUNCTION ws_release_record_guard()
        """
    )


def _release_studio_hardening(conn: Any) -> None:
    """Harden the Release Studio schema introduced by Migration 8.

    Migration 8 remains the historical schema definition.  This migration
    repairs its already-applied data and constraints in place before later
    Release Studio writers depend on the stricter contracts.
    """

    # Drop the Migration 8 outcome CHECK before rewriting legacy values; the
    # old vocabulary rejects the canonical replacements.
    conn.execute(
        "ALTER TABLE ws_release_evaluations "
        "DROP CONSTRAINT IF EXISTS ws_release_evaluations_outcome_check"
    )
    conn.execute(
        "ALTER TABLE ws_release_evaluations "
        "DROP CONSTRAINT IF EXISTS ck_ws_release_evaluations_outcome_vocabulary"
    )

    # Normalize the development vocabulary before installing the new CHECK.
    conn.execute(
        """
        UPDATE ws_release_evaluations
        SET outcome = CASE outcome
            WHEN 'warn' THEN 'warning'
            WHEN 'block' THEN 'blocker'
            WHEN 'error' THEN 'failure'
            ELSE outcome
        END
        WHERE outcome IN ('warn', 'block', 'error')
        """
    )

    # Empty JSON objects were the Migration 8 defaults.  Only exact empty
    # objects are list-shape mistakes; preserve every non-empty value.
    # Disable the M8 immutability guard while backfilling published rows;
    # the replacement guard is installed later in this migration.
    conn.execute(
        "ALTER TABLE ws_release_policy_versions "
        "DISABLE TRIGGER trg_ws_release_policy_versions_guard"
    )
    try:
        conn.execute(
            """
            UPDATE ws_release_policy_versions
            SET rules = '[]'::jsonb
            WHERE rules = '{}'::jsonb
            """
        )
        conn.execute(
            """
            ALTER TABLE ws_release_policy_versions
                ALTER COLUMN rules SET DEFAULT '[]'::jsonb
            """
        )
        conn.execute(
            """
            ALTER TABLE ws_release_policy_versions
                ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS published_by TEXT
            """
        )
        # Existing published/retired development rows did not record
        # publication provenance. Prefer the row's original timestamp and
        # creator; the documented fallback is stable when the creator was blank.
        conn.execute(
            """
            UPDATE ws_release_policy_versions
            SET published_at = COALESCE(published_at, created_at, NOW()),
                published_by = COALESCE(
                    NULLIF(btrim(published_by), ''),
                    NULLIF(btrim(created_by), ''),
                    'release-studio-migration-9'
                )
            WHERE status IN ('published', 'retired')
            """
        )
        conn.execute(
            """
            UPDATE ws_release_policy_versions
            SET published_at = NULL,
                published_by = NULL
            WHERE status = 'draft'
              AND (published_at IS NOT NULL OR published_by IS NOT NULL)
            """
        )
    finally:
        conn.execute(
            "ALTER TABLE ws_release_policy_versions "
            "ENABLE TRIGGER trg_ws_release_policy_versions_guard"
        )

    conn.execute(
        """
        UPDATE ws_release_waivers
        SET evidence = '[]'::jsonb
        WHERE evidence = '{}'::jsonb
        """
    )
    conn.execute(
        """
        ALTER TABLE ws_release_waivers
            ALTER COLUMN evidence SET DEFAULT '[]'::jsonb
        """
    )

    conn.execute(
        """
        ALTER TABLE ws_release_evaluations
            ADD CONSTRAINT ck_ws_release_evaluations_outcome_vocabulary
            CHECK (outcome IN (
                'pass', 'warning', 'failure', 'blocker', 'unsupported', 'waived'
            ))
        """
    )

    for table, constraint in (
        ("ws_release_findings", "ck_ws_release_findings_severity_vocabulary"),
        ("ws_release_findings", "ck_ws_release_findings_status_vocabulary"),
        ("ws_release_approvals", "ck_ws_release_approvals_decision_vocabulary"),
    ):
        conn.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {constraint}")
    conn.execute(
        """
        ALTER TABLE ws_release_findings
            ADD CONSTRAINT ck_ws_release_findings_severity_vocabulary
            CHECK (severity IN ('warning', 'failure', 'blocker'))
        """
    )
    conn.execute(
        """
        ALTER TABLE ws_release_findings
            ADD CONSTRAINT ck_ws_release_findings_status_vocabulary
            CHECK (status IN ('open', 'waived'))
        """
    )
    conn.execute(
        """
        ALTER TABLE ws_release_approvals
            ADD CONSTRAINT ck_ws_release_approvals_decision_vocabulary
            CHECK (decision IN ('approved', 'changes_requested', 'emergency_override'))
        """
    )
    conn.execute(
        "ALTER TABLE ws_release_policy_versions "
        "DROP CONSTRAINT IF EXISTS ck_ws_release_policy_versions_publication_provenance"
    )
    conn.execute(
        """
        ALTER TABLE ws_release_policy_versions
            ADD CONSTRAINT ck_ws_release_policy_versions_publication_provenance
            CHECK (
                (
                    status = 'draft'
                    AND published_at IS NULL
                    AND published_by IS NULL
                )
                OR (
                    status IN ('published', 'retired')
                    AND published_at IS NOT NULL
                    AND published_by IS NOT NULL
                    AND btrim(published_by) <> ''
                )
            )
        """
    )
    conn.execute(
        "ALTER TABLE ws_release_records "
        "DROP CONSTRAINT IF EXISTS ck_ws_release_records_signature_key_pair"
    )
    conn.execute(
        """
        ALTER TABLE ws_release_records
            ADD CONSTRAINT ck_ws_release_records_signature_key_pair
            CHECK (
                (signature IS NULL AND signing_key_id IS NULL)
                OR (signature IS NOT NULL AND signing_key_id IS NOT NULL)
            )
        """
    )
    for constraint in (
        "ck_ws_release_audit_events_sequence_positive",
        "ck_ws_release_audit_events_genesis_previous_hash",
    ):
        conn.execute(
            "ALTER TABLE ws_release_audit_events "
            f"DROP CONSTRAINT IF EXISTS {constraint}"
        )
    conn.execute(
        """
        ALTER TABLE ws_release_audit_events
            ADD CONSTRAINT ck_ws_release_audit_events_sequence_positive
            CHECK (sequence > 0)
        """
    )
    conn.execute(
        """
        ALTER TABLE ws_release_audit_events
            ADD CONSTRAINT ck_ws_release_audit_events_genesis_previous_hash
            CHECK (
                (
                    sequence = 1
                    AND previous_hash IS NULL
                )
                OR (
                    sequence > 1
                    AND previous_hash IS NOT NULL
                    AND btrim(previous_hash) <> ''
                )
            )
        """
    )

    # Explicit names make the repaired delete policy stable and make it clear
    # that immutable approval/waiver history must block parent deletion.
    for table, old_constraint, new_constraint in (
        (
            "ws_release_approvals",
            "ws_release_approvals_project_id_fkey",
            "fk_ws_release_approvals_project_restrict",
        ),
        (
            "ws_release_approvals",
            "ws_release_approvals_candidate_id_fkey",
            "fk_ws_release_approvals_candidate_restrict",
        ),
        (
            "ws_release_approvals",
            "ws_release_approvals_build_id_fkey",
            "fk_ws_release_approvals_build_restrict",
        ),
        (
            "ws_release_waivers",
            "ws_release_waivers_project_id_fkey",
            "fk_ws_release_waivers_project_restrict",
        ),
        (
            "ws_release_findings",
            "ws_release_findings_waiver_id_fkey",
            "fk_ws_release_findings_waiver_restrict",
        ),
    ):
        conn.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {old_constraint}")
        conn.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {new_constraint}")

    conn.execute(
        """
        ALTER TABLE ws_release_approvals
            ADD CONSTRAINT fk_ws_release_approvals_project_restrict
            FOREIGN KEY (project_id) REFERENCES ws_projects(id) ON DELETE RESTRICT,
            ADD CONSTRAINT fk_ws_release_approvals_candidate_restrict
            FOREIGN KEY (candidate_id) REFERENCES ws_release_candidates(id) ON DELETE RESTRICT,
            ADD CONSTRAINT fk_ws_release_approvals_build_restrict
            FOREIGN KEY (build_id) REFERENCES ws_release_builds(id) ON DELETE RESTRICT
        """
    )
    conn.execute(
        """
        ALTER TABLE ws_release_waivers
            ADD CONSTRAINT fk_ws_release_waivers_project_restrict
            FOREIGN KEY (project_id) REFERENCES ws_projects(id) ON DELETE RESTRICT
        """
    )
    conn.execute(
        """
        ALTER TABLE ws_release_findings
            ADD CONSTRAINT fk_ws_release_findings_waiver_restrict
            FOREIGN KEY (waiver_id) REFERENCES ws_release_waivers(id) ON DELETE RESTRICT
        """
    )

    # A supersession target is part of the same project/configuration stream.
    # The composite unique constraint is the minimal target key PostgreSQL
    # requires for the structural foreign key.
    conn.execute(
        "ALTER TABLE ws_release_records "
        "DROP CONSTRAINT IF EXISTS ws_release_records_superseded_by_fkey"
    )
    conn.execute(
        "ALTER TABLE ws_release_records "
        "DROP CONSTRAINT IF EXISTS fk_ws_release_records_superseded_by_same_config"
    )
    conn.execute(
        "ALTER TABLE ws_release_records "
        "DROP CONSTRAINT IF EXISTS uq_ws_release_records_project_config_id"
    )
    conn.execute(
        """
        ALTER TABLE ws_release_records
            ADD CONSTRAINT uq_ws_release_records_project_config_id
            UNIQUE (project_id, config_key, id)
        """
    )
    conn.execute(
        """
        ALTER TABLE ws_release_records
            ADD CONSTRAINT fk_ws_release_records_superseded_by_same_config
            FOREIGN KEY (project_id, config_key, superseded_by)
            REFERENCES ws_release_records(project_id, config_key, id)
            ON DELETE RESTRICT
        """
    )

    for index in (
        "idx_ws_release_closure_inputs_candidate",
        "idx_ws_release_members_build",
        "idx_ws_release_scope_fingerprints_build",
        "idx_ws_release_audit_events_project",
    ):
        conn.execute(f"DROP INDEX IF EXISTS {index}")

    # Keep publication provenance immutable for every published/retired row;
    # only the content-preserving published -> retired transition is allowed.
    conn.execute(
        """
        CREATE OR REPLACE FUNCTION ws_release_policy_version_guard()
        RETURNS TRIGGER AS $$
        BEGIN
            IF TG_OP = 'DELETE' THEN
                IF OLD.status IN ('published', 'retired') THEN
                    RAISE EXCEPTION
                        'published or retired policy versions cannot be deleted'
                        USING ERRCODE = '55000';
                END IF;
                RETURN OLD;
            END IF;

            IF OLD.status = 'published' THEN
                IF NEW.status = 'retired'
                   AND NEW.id = OLD.id
                   AND NEW.policy_id = OLD.policy_id
                   AND NEW.version = OLD.version
                   AND NEW.rules IS NOT DISTINCT FROM OLD.rules
                   AND NEW.content_digest = OLD.content_digest
                   AND NEW.published_at = OLD.published_at
                   AND NEW.published_by = OLD.published_by
                   AND NEW.created_by = OLD.created_by
                   AND NEW.created_at = OLD.created_at
                   AND NEW.retired_at IS NOT NULL
                   AND NEW.retired_by IS NOT NULL
                   AND btrim(NEW.retired_by) <> ''
                THEN
                    RETURN NEW;
                END IF;

                IF NEW.id = OLD.id
                   AND NEW.policy_id = OLD.policy_id
                   AND NEW.version = OLD.version
                   AND NEW.status = OLD.status
                   AND NEW.rules IS NOT DISTINCT FROM OLD.rules
                   AND NEW.content_digest = OLD.content_digest
                   AND NEW.published_at = OLD.published_at
                   AND NEW.published_by = OLD.published_by
                   AND NEW.retired_at IS NOT DISTINCT FROM OLD.retired_at
                   AND NEW.retired_by IS NOT DISTINCT FROM OLD.retired_by
                   AND NEW.created_by = OLD.created_by
                   AND NEW.created_at = OLD.created_at
                THEN
                    RETURN NEW;
                END IF;

                RAISE EXCEPTION
                    'published policy version content and provenance are immutable; only published to retired is legal'
                    USING ERRCODE = '55000';
            END IF;

            IF OLD.status = 'retired' THEN
                IF NEW.id = OLD.id
                   AND NEW.policy_id = OLD.policy_id
                   AND NEW.version = OLD.version
                   AND NEW.status = OLD.status
                   AND NEW.rules IS NOT DISTINCT FROM OLD.rules
                   AND NEW.content_digest = OLD.content_digest
                   AND NEW.published_at = OLD.published_at
                   AND NEW.published_by = OLD.published_by
                   AND NEW.retired_at = OLD.retired_at
                   AND NEW.retired_by = OLD.retired_by
                   AND NEW.created_by = OLD.created_by
                   AND NEW.created_at = OLD.created_at
                THEN
                    RETURN NEW;
                END IF;

                RAISE EXCEPTION
                    'retired policy versions are immutable'
                    USING ERRCODE = '55000';
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )


MIGRATIONS: tuple[tuple[int, str, Migration], ...] = (
    (1, "v3_job_foundation", _v3_job_foundation),
    (2, "workspace_read_versions", _workspace_read_versions),
    (3, "git_read_cache", _git_read_cache),
    (4, "webgpu_ready_metadata", _webgpu_ready_metadata),
    (5, "thumbnail_metadata", _thumbnail_metadata),
    (6, "thumbnail_source", _thumbnail_source),
    (7, "generated_thumbnail_default", _generated_thumbnail_default),
    (8, "release_studio", _release_studio),
    (9, "release_studio_hardening", _release_studio_hardening),
)


def apply_workspace_migrations(conn: Any) -> None:
    """Apply versioned, additive workspace migrations under the caller's lock."""

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    applied = {
        int(row["version"])
        for row in conn.execute("SELECT version FROM ws_schema_migrations").fetchall()
    }
    for version, name, migration in MIGRATIONS:
        if version in applied:
            continue
        logger.info("Applying workspace schema migration %s (%s)", version, name)
        migration(conn)
        conn.execute(
            "INSERT INTO ws_schema_migrations(version, name) VALUES (%s, %s)",
            (version, name),
        )
