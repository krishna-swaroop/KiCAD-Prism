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
            policy_snapshot_captured BOOLEAN NOT NULL DEFAULT FALSE,
            policy_document        JSONB,
            -- The normalized configuration read from the candidate's immutable
            -- commit.  This is the release identity source, not the mutable
            -- configuration registry / checkout.
            configuration_snapshot_captured BOOLEAN NOT NULL DEFAULT FALSE,
            configuration_document JSONB,
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

    # The board facts a build observed, stored once per build.
    #
    # They used to live inside every fingerprint's `inputs`, which meant three
    # copies per build and a 10.5 MB manifest that was 99.9% projection text.
    # The fingerprints now hash them and the manifest carries only digests, but
    # re-evaluation still has to read the *exact* facts the build saw --
    # recomputing from a checkout would make governance depend on mutable
    # files -- so they are kept here, out of the released bytes.
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_release_build_projections (
            build_id   TEXT NOT NULL
                       REFERENCES ws_release_builds(id) ON DELETE CASCADE,
            name       TEXT NOT NULL,
            digest     TEXT NOT NULL,
            payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT pk_ws_release_build_projections PRIMARY KEY (build_id, name)
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
            rules       JSONB NOT NULL DEFAULT '[]'::jsonb,
            content_digest TEXT NOT NULL,
            published_at TIMESTAMPTZ,
            published_by TEXT,
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
                ),
            -- Who published a version, and when, is part of what makes it
            -- citable. A draft has neither; a published or retired one has both.
            CONSTRAINT ck_ws_release_policy_versions_publication_provenance
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
            waiver_binding_digest TEXT NOT NULL DEFAULT '',
            outcome               TEXT NOT NULL,
            counts                JSONB NOT NULL DEFAULT '{}'::jsonb,
            evaluator_build       TEXT NOT NULL DEFAULT '',
            created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT ck_ws_release_evaluations_outcome_vocabulary
                CHECK (outcome IN (
                    'pass', 'warning', 'failure', 'blocker', 'unsupported', 'waived'
                ))
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_release_waivers (
            id              TEXT PRIMARY KEY,
            project_id      TEXT NOT NULL,
            config_key      TEXT NOT NULL,
            rule_id         TEXT NOT NULL,
            domain          TEXT NOT NULL
                            CHECK (domain IN (
                                'bare_board', 'assembly', 'documentation', 'evidence'
                            )),
            subject_pattern TEXT NOT NULL,
            finding_key     TEXT NOT NULL,
            -- The build the waiver was raised against. A waiver accepts a
            -- finding on a specific set of outputs; letting it apply to every
            -- later build of the same configuration meant a fresh release
            -- silently inherited exceptions nobody re-examined.
            build_id        TEXT NOT NULL DEFAULT '',
            reason          TEXT NOT NULL,
            owner           TEXT NOT NULL,
            approver        TEXT,
            status          TEXT NOT NULL DEFAULT 'proposed'
                            CHECK (status IN (
                                'proposed', 'approved', 'rejected', 'revoked', 'expired'
                            )),
            evidence        JSONB NOT NULL DEFAULT '[]'::jsonb,
            expires_at      TIMESTAMPTZ,
            approved_at     TIMESTAMPTZ,
            revoked_at      TIMESTAMPTZ,
            revoked_reason  TEXT,
            exception_kind  TEXT,
            exception_reason TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            -- RESTRICT, not CASCADE: an audited exception must not vanish
            -- because a project row was removed implicitly. Project teardown
            -- deletes waivers explicitly after disabling the no-delete trigger.
            CONSTRAINT fk_ws_release_waivers_project_restrict
                FOREIGN KEY (project_id) REFERENCES ws_projects(id) ON DELETE RESTRICT,
            CONSTRAINT ck_ws_release_waivers_exception
                CHECK (
                    (exception_kind IS NULL AND exception_reason IS NULL)
                    OR (
                        exception_kind = 'self_approval'
                        AND exception_reason IS NOT NULL
                        AND length(btrim(exception_reason)) > 0
                    )
                )
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
            severity      TEXT NOT NULL
                          CONSTRAINT ck_ws_release_findings_severity_vocabulary
                          CHECK (severity IN ('warning', 'failure', 'blocker')),
            status        TEXT NOT NULL
                          CONSTRAINT ck_ws_release_findings_status_vocabulary
                          CHECK (status IN ('open', 'waived')),
            domain        TEXT NOT NULL
                          CHECK (domain IN (
                              'bare_board', 'assembly', 'documentation', 'evidence'
                          )),
            subject       TEXT NOT NULL,
            message       TEXT NOT NULL,
            observed      JSONB NOT NULL DEFAULT '{}'::jsonb,
            expected      JSONB NOT NULL DEFAULT '{}'::jsonb,
            finding_key   TEXT NOT NULL,
            waiver_id     TEXT,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            -- RESTRICT, not SET NULL: a waiver is the audited reason a finding
            -- stopped blocking, and deleting it must not quietly turn a waived
            -- finding back into an unexplained open one.
            CONSTRAINT fk_ws_release_findings_waiver_restrict
                FOREIGN KEY (waiver_id)
                REFERENCES ws_release_waivers(id) ON DELETE RESTRICT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_release_approvals (
            id                             TEXT PRIMARY KEY,
            project_id                     TEXT NOT NULL,
            config_key                     TEXT NOT NULL,
            candidate_id                   TEXT NOT NULL,
            build_id                       TEXT NOT NULL,
            role                           TEXT NOT NULL,
            domains                        TEXT[] NOT NULL DEFAULT '{}'::text[],
            decision                       TEXT NOT NULL,
            approver                       TEXT NOT NULL,
            note                           TEXT NOT NULL DEFAULT '',
            exception_kind                TEXT,
            exception_reason              TEXT,
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
            created_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            -- Approvals are immutable and never deleted, so they keep the rows
            -- they refer to alive rather than cascading away with them.
            CONSTRAINT fk_ws_release_approvals_project_restrict
                FOREIGN KEY (project_id) REFERENCES ws_projects(id) ON DELETE RESTRICT,
            CONSTRAINT fk_ws_release_approvals_candidate_restrict
                FOREIGN KEY (candidate_id)
                REFERENCES ws_release_candidates(id) ON DELETE RESTRICT,
            CONSTRAINT fk_ws_release_approvals_build_restrict
                FOREIGN KEY (build_id)
                REFERENCES ws_release_builds(id) ON DELETE RESTRICT,
            CONSTRAINT ck_ws_release_approvals_decision_vocabulary
                CHECK (decision IN ('approved', 'rejected', 'changes_requested')),
            -- Two distinct exceptions, either of which may apply: the author
            -- approved their own revision, and/or the two-person path was
            -- unavailable. Each demands a stated reason.
            CONSTRAINT ck_ws_release_approvals_exception_pair
                CHECK (
                    (exception_kind IS NULL AND exception_reason IS NULL)
                    OR (
                        exception_kind IS NOT NULL
                        AND exception_kind IN (
                            'self_approval', 'emergency', 'self_approval_and_emergency'
                        )
                        AND exception_reason IS NOT NULL
                        AND btrim(exception_reason) <> ''
                    )
                )
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
                            CHECK (stale_component IN (
                                'technical', 'policy', 'both', 'withdrawn'
                            )),
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
            attestation_body     JSONB NOT NULL DEFAULT '{}'::jsonb,
            superseded_by        TEXT,
            created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_ws_release_records_label
                UNIQUE (project_id, config_key, release_label),
            -- The minimal target key the structural supersession FK below
            -- needs; the label constraint above is the business identity.
            CONSTRAINT uq_ws_release_records_project_config_id
                UNIQUE (project_id, config_key, id),
            CONSTRAINT ck_ws_release_records_not_self_superseded
                CHECK (superseded_by IS NULL OR superseded_by <> id),
            -- A supersession target belongs to the same project and
            -- configuration stream; superseding across configurations would
            -- make the history of a release read as someone else's.
            CONSTRAINT fk_ws_release_records_superseded_by_same_config
                FOREIGN KEY (project_id, config_key, superseded_by)
                REFERENCES ws_release_records(project_id, config_key, id)
                ON DELETE RESTRICT,
            CONSTRAINT ck_ws_release_records_signature_key_pair
                CHECK (
                    (signature IS NULL AND signing_key_id IS NULL)
                    OR (signature IS NOT NULL AND signing_key_id IS NOT NULL)
                )
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
                UNIQUE (project_id, config_key, sequence),
            CONSTRAINT ck_ws_release_audit_events_sequence_positive
                CHECK (sequence > 0),
            -- Shape only. Contiguity and `previous_hash[n] == event_hash[n-1]`
            -- are chain properties that `GET /audit/verify` checks; a CHECK
            -- constraint cannot see the neighbouring row.
            CONSTRAINT ck_ws_release_audit_events_genesis_previous_hash
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
        CREATE INDEX IF NOT EXISTS idx_ws_release_builds_candidate
        ON ws_release_builds(candidate_id, created_at DESC)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_ws_release_builds_manifest_digest_nonempty
        ON ws_release_builds(manifest_digest)
        WHERE manifest_digest IS NOT NULL AND manifest_digest <> ''
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
               OR NEW.attestation_body IS DISTINCT FROM OLD.attestation_body
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
    # One row per *evaluated rule*, independent of findings.  This is what
    # makes "the projection this rule needs is missing" representable as
    # `unsupported` rather than being silently indistinguishable from `pass`.
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_release_rule_outcomes (
            id                  TEXT PRIMARY KEY,
            evaluation_id       TEXT NOT NULL
                                REFERENCES ws_release_evaluations(id) ON DELETE CASCADE,
            rule_id             TEXT NOT NULL,
            rule_version        TEXT NOT NULL DEFAULT '',
            outcome             TEXT NOT NULL,
            finding_count       INTEGER NOT NULL DEFAULT 0,
            unsupported_reason  TEXT NOT NULL DEFAULT '',
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_ws_release_rule_outcomes_identity
                UNIQUE (evaluation_id, rule_id),
            CONSTRAINT ck_ws_release_rule_outcomes_outcome
                CHECK (outcome IN (
                    'pass', 'info', 'warning', 'failure', 'blocker', 'unsupported'
                ))
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_ws_release_rule_outcomes_evaluation "
        "ON ws_release_rule_outcomes(evaluation_id)"
    )

    # Unauthenticated share links. The token is never stored, only its digest,
    # so a database read cannot reconstruct a live link.
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_release_web_shares (
            id             TEXT PRIMARY KEY,
            record_id      TEXT NOT NULL
                           REFERENCES ws_release_records(id) ON DELETE RESTRICT,
            token_digest   TEXT NOT NULL UNIQUE,
            status         TEXT NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'revoked')),
            expires_at     TIMESTAMPTZ,
            created_by     TEXT NOT NULL DEFAULT '',
            created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            revoked_by     TEXT,
            revoked_at     TIMESTAMPTZ,
            -- Revocation is a fact about who and when, not a status flag: an
            -- unattributed revocation is indistinguishable from a bug.
            CONSTRAINT ck_ws_release_web_shares_revocation
                CHECK (
                    (status = 'active' AND revoked_by IS NULL AND revoked_at IS NULL)
                    OR
                    (status = 'revoked' AND revoked_by IS NOT NULL AND revoked_at IS NOT NULL)
                )
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_ws_release_web_shares_record "
        "ON ws_release_web_shares(record_id, created_at DESC)"
    )

    # Org policy authoring gets its own chain rather than a nullable
    # `project_id` on the project chain.
    #
    # Publishing a version invalidates approvals across every project that binds
    # it, so it has to be audited -- but it is not an event *in* any one
    # project's history, and widening `ws_release_audit_events` would weaken the
    # sequence and genesis constraints that make that chain checkable.
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_release_policy_audit_events (
            id             TEXT PRIMARY KEY,
            policy_key     TEXT NOT NULL,
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
            CONSTRAINT uq_ws_release_policy_audit_events_sequence
                UNIQUE (policy_key, sequence),
            CONSTRAINT ck_ws_release_policy_audit_events_sequence_positive
                CHECK (sequence > 0),
            CONSTRAINT ck_ws_release_policy_audit_events_genesis_previous_hash
                CHECK (
                    (sequence = 1 AND previous_hash IS NULL)
                    OR (
                        sequence > 1
                        AND previous_hash IS NOT NULL
                        AND btrim(previous_hash) <> ''
                    )
                )
        )
        """
    )
    conn.execute(
        "DROP TRIGGER IF EXISTS trg_ws_release_policy_audit_events_immutable "
        "ON ws_release_policy_audit_events"
    )
    conn.execute(
        """
        CREATE TRIGGER trg_ws_release_policy_audit_events_immutable
        BEFORE UPDATE OR DELETE ON ws_release_policy_audit_events
        FOR EACH ROW
        EXECUTE FUNCTION ws_release_immutable_history_guard()
        """
    )

    # A candidate's policy snapshot is what the evaluation is *about*: it is
    # captured once, at freeze, and everything downstream reasons against it.
    # In-code writes only touch `status`, so today this holds by convention --
    # and a convention is not what an approval binding should rest on.
    conn.execute(
        """
        CREATE OR REPLACE FUNCTION ws_release_candidate_snapshot_guard()
        RETURNS TRIGGER AS $$
        BEGIN
            IF OLD.policy_snapshot_captured
               AND (
                   NEW.policy_document IS DISTINCT FROM OLD.policy_document
                   OR NEW.policy_snapshot_captured IS DISTINCT FROM OLD.policy_snapshot_captured
               )
            THEN
                RAISE EXCEPTION
                    'a captured candidate policy snapshot is immutable'
                    USING ERRCODE = '55000';
            END IF;
            IF OLD.configuration_snapshot_captured
               AND (
                   NEW.configuration_document IS DISTINCT FROM OLD.configuration_document
                   OR NEW.configuration_snapshot_captured IS DISTINCT FROM OLD.configuration_snapshot_captured
               )
            THEN
                RAISE EXCEPTION
                    'a captured candidate configuration snapshot is immutable'
                    USING ERRCODE = '55000';
            END IF;
            IF NEW.commit_sha IS DISTINCT FROM OLD.commit_sha
               OR NEW.build_key IS DISTINCT FROM OLD.build_key
               OR NEW.technical_config_digest IS DISTINCT FROM OLD.technical_config_digest
               OR NEW.input_closure_digest IS DISTINCT FROM OLD.input_closure_digest
               OR NEW.variant IS DISTINCT FROM OLD.variant
            THEN
                RAISE EXCEPTION
                    'a candidate identity is immutable once created'
                    USING ERRCODE = '55000';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )
    conn.execute(
        "DROP TRIGGER IF EXISTS trg_ws_release_candidates_snapshot_guard "
        "ON ws_release_candidates"
    )
    conn.execute(
        """
        CREATE TRIGGER trg_ws_release_candidates_snapshot_guard
        BEFORE UPDATE ON ws_release_candidates
        FOR EACH ROW
        EXECUTE FUNCTION ws_release_candidate_snapshot_guard()
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
    conn.execute(
        """
        CREATE OR REPLACE FUNCTION ws_release_signing_key_guard()
        RETURNS TRIGGER AS $$
        BEGIN
            IF TG_OP = 'UPDATE'
               AND (NEW.algorithm IS DISTINCT FROM OLD.algorithm
                    OR NEW.public_key IS DISTINCT FROM OLD.public_key)
            THEN
                RAISE EXCEPTION 'a signing key id is permanently bound to its material'
                    USING ERRCODE = '55000';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )
    conn.execute("DROP TRIGGER IF EXISTS trg_ws_release_signing_keys_guard ON ws_release_signing_keys")
    conn.execute(
        """
        CREATE TRIGGER trg_ws_release_signing_keys_guard
        BEFORE UPDATE ON ws_release_signing_keys
        FOR EACH ROW EXECUTE FUNCTION ws_release_signing_key_guard()
        """
    )
    conn.execute(
        """
        CREATE OR REPLACE FUNCTION ws_release_build_terminal_guard()
        RETURNS TRIGGER AS $$
        BEGIN
            IF OLD.status IN ('succeeded', 'failed', 'cancelled')
               AND NEW IS DISTINCT FROM OLD
            THEN
                RAISE EXCEPTION 'terminal release build rows are immutable'
                    USING ERRCODE = '55000';
            END IF;
            IF OLD.status <> 'running' AND NEW.status IN ('succeeded', 'failed', 'cancelled') THEN
                RAISE EXCEPTION 'only a running build may become terminal'
                    USING ERRCODE = '55000';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )
    conn.execute("DROP TRIGGER IF EXISTS trg_ws_release_builds_terminal_guard ON ws_release_builds")
    conn.execute(
        """
        CREATE TRIGGER trg_ws_release_builds_terminal_guard
        BEFORE UPDATE ON ws_release_builds
        FOR EACH ROW EXECUTE FUNCTION ws_release_build_terminal_guard()
        """
    )


def _release_studio_build_projections(conn: Any) -> None:
    """Persist per-build projection payloads for re-evaluation.

    Added after migration 8 had already landed on long-lived databases.  The
    CREATE lives in `_release_studio` for fresh installs; this follow-up is what
    upgrades a database whose migration 8 predated the lean-manifest change.
    Versions 9-12 remain reserved on those databases by the pre-collapse ladder,
    so this step is numbered 13.
    """

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_release_build_projections (
            build_id   TEXT NOT NULL
                       REFERENCES ws_release_builds(id) ON DELETE CASCADE,
            name       TEXT NOT NULL,
            digest     TEXT NOT NULL,
            payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT pk_ws_release_build_projections PRIMARY KEY (build_id, name)
        )
        """
    )


def _release_studio_waiver_build_scope(conn: Any) -> None:
    """Bind waivers to a build, and let an approval be withdrawn.

    M8 carries both in its CREATE TABLE for a fresh database, but M8 is already
    recorded wherever Release Studio has run, so an amendment there never
    reaches an existing workspace. R23 folds this back into M8 when the ladder
    is collapsed.

    Existing waiver rows keep the empty default and therefore stop applying to
    new builds. That is the point: an exception was accepted against one set of
    outputs, and the next release has to accept it again rather than inherit it.
    """

    statements = (
        """
        ALTER TABLE ws_release_waivers
        ADD COLUMN IF NOT EXISTS build_id TEXT NOT NULL DEFAULT ''
        """,
        """
        ALTER TABLE ws_release_approval_invalidations
        DROP CONSTRAINT IF EXISTS ws_release_approval_invalidations_stale_component_check
        """,
        """
        ALTER TABLE ws_release_approval_invalidations
        ADD CONSTRAINT ws_release_approval_invalidations_stale_component_check
        CHECK (stale_component IN ('technical', 'policy', 'both', 'withdrawn'))
        """,
    )
    for statement in statements:
        conn.execute(statement)


def _release_studio_configuration_snapshot(conn: Any) -> None:
    """Persist the committed configuration that defines release identity.

    Existing candidates intentionally remain readable: service code loads their
    configuration from the recorded commit when this additive snapshot is
    absent.  It never falls back to the working tree.
    """

    for statement in (
        """
        ALTER TABLE ws_release_candidates
        ADD COLUMN IF NOT EXISTS configuration_snapshot_captured BOOLEAN NOT NULL DEFAULT FALSE
        """,
        """
        ALTER TABLE ws_release_candidates
        ADD COLUMN IF NOT EXISTS configuration_document JSONB
        """,
    ):
        conn.execute(statement)
    # Databases which already ran M8 retain its earlier trigger body.  Rebuild
    # it after the columns exist so the immutable-snapshot boundary is not a
    # fresh-install-only guarantee.
    conn.execute(
        """
        CREATE OR REPLACE FUNCTION ws_release_candidate_snapshot_guard()
        RETURNS TRIGGER AS $$
        BEGIN
            IF OLD.policy_snapshot_captured
               AND (
                   NEW.policy_document IS DISTINCT FROM OLD.policy_document
                   OR NEW.policy_snapshot_captured IS DISTINCT FROM OLD.policy_snapshot_captured
               )
            THEN
                RAISE EXCEPTION 'a captured candidate policy snapshot is immutable'
                    USING ERRCODE = '55000';
            END IF;
            IF OLD.configuration_snapshot_captured
               AND (
                   NEW.configuration_document IS DISTINCT FROM OLD.configuration_document
                   OR NEW.configuration_snapshot_captured IS DISTINCT FROM OLD.configuration_snapshot_captured
               )
            THEN
                RAISE EXCEPTION 'a captured candidate configuration snapshot is immutable'
                    USING ERRCODE = '55000';
            END IF;
            IF NEW.commit_sha IS DISTINCT FROM OLD.commit_sha
               OR NEW.build_key IS DISTINCT FROM OLD.build_key
               OR NEW.technical_config_digest IS DISTINCT FROM OLD.technical_config_digest
               OR NEW.input_closure_digest IS DISTINCT FROM OLD.input_closure_digest
               OR NEW.variant IS DISTINCT FROM OLD.variant
            THEN
                RAISE EXCEPTION 'a candidate identity is immutable once created'
                    USING ERRCODE = '55000';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )


def _release_studio_append_only_evaluations(conn: Any) -> None:
    """Make every evaluation a historical fact and bind it to waiver state."""

    conn.execute(
        "ALTER TABLE ws_release_evaluations "
        "ADD COLUMN IF NOT EXISTS waiver_binding_digest TEXT NOT NULL DEFAULT ''"
    )
    conn.execute(
        "ALTER TABLE ws_release_evaluations "
        "DROP CONSTRAINT IF EXISTS uq_ws_release_evaluations_identity"
    )


def _release_studio_terminal_and_identity_guards(conn: Any) -> None:
    """Forward-install terminal, signing, and release-body immutability guards."""

    conn.execute(
        """
        CREATE OR REPLACE FUNCTION ws_release_build_terminal_guard()
        RETURNS TRIGGER AS $$
        BEGIN
            IF OLD.status IN ('succeeded', 'failed', 'cancelled') AND NEW IS DISTINCT FROM OLD THEN
                RAISE EXCEPTION 'terminal release build rows are immutable' USING ERRCODE='55000';
            END IF;
            IF OLD.status <> 'running' AND NEW.status IN ('succeeded', 'failed', 'cancelled') THEN
                RAISE EXCEPTION 'only a running build may become terminal' USING ERRCODE='55000';
            END IF;
            RETURN NEW;
        END; $$ LANGUAGE plpgsql
        """
    )
    conn.execute("DROP TRIGGER IF EXISTS trg_ws_release_builds_terminal_guard ON ws_release_builds")
    conn.execute(
        "CREATE TRIGGER trg_ws_release_builds_terminal_guard BEFORE UPDATE ON ws_release_builds "
        "FOR EACH ROW EXECUTE FUNCTION ws_release_build_terminal_guard()"
    )
    conn.execute(
        """
        CREATE OR REPLACE FUNCTION ws_release_signing_key_guard()
        RETURNS TRIGGER AS $$
        BEGIN
            IF TG_OP='UPDATE' AND (NEW.algorithm IS DISTINCT FROM OLD.algorithm
                OR NEW.public_key IS DISTINCT FROM OLD.public_key) THEN
                RAISE EXCEPTION 'a signing key id is permanently bound to its material' USING ERRCODE='55000';
            END IF;
            RETURN NEW;
        END; $$ LANGUAGE plpgsql
        """
    )
    conn.execute("DROP TRIGGER IF EXISTS trg_ws_release_signing_keys_guard ON ws_release_signing_keys")
    conn.execute(
        "CREATE TRIGGER trg_ws_release_signing_keys_guard BEFORE UPDATE ON ws_release_signing_keys "
        "FOR EACH ROW EXECUTE FUNCTION ws_release_signing_key_guard()"
    )
    conn.execute(
        """
        CREATE OR REPLACE FUNCTION ws_release_record_guard()
        RETURNS TRIGGER AS $$
        BEGIN
            IF TG_OP='DELETE' THEN
                RAISE EXCEPTION 'release records are immutable; update superseded_by instead' USING ERRCODE='55000';
            END IF;
            IF NEW.id IS DISTINCT FROM OLD.id OR NEW.project_id IS DISTINCT FROM OLD.project_id
               OR NEW.config_key IS DISTINCT FROM OLD.config_key OR NEW.candidate_id IS DISTINCT FROM OLD.candidate_id
               OR NEW.build_id IS DISTINCT FROM OLD.build_id OR NEW.release_label IS DISTINCT FROM OLD.release_label
               OR NEW.document_number IS DISTINCT FROM OLD.document_number OR NEW.revision IS DISTINCT FROM OLD.revision
               OR NEW.dossier_digest IS DISTINCT FROM OLD.dossier_digest OR NEW.manifest_digest IS DISTINCT FROM OLD.manifest_digest
               OR NEW.attestation_digest IS DISTINCT FROM OLD.attestation_digest OR NEW.signature IS DISTINCT FROM OLD.signature
               OR NEW.signing_key_id IS DISTINCT FROM OLD.signing_key_id
               OR NEW.attestation_artifact_id IS DISTINCT FROM OLD.attestation_artifact_id
               OR NEW.commit_sha IS DISTINCT FROM OLD.commit_sha OR NEW.variant IS DISTINCT FROM OLD.variant
               OR NEW.released_by IS DISTINCT FROM OLD.released_by OR NEW.policy_snapshot IS DISTINCT FROM OLD.policy_snapshot
               OR NEW.approval_snapshot IS DISTINCT FROM OLD.approval_snapshot
               OR NEW.attestation_body IS DISTINCT FROM OLD.attestation_body
               OR NEW.created_at IS DISTINCT FROM OLD.created_at
            THEN RAISE EXCEPTION 'release records are immutable except for superseded_by' USING ERRCODE='55000';
            END IF;
            RETURN NEW;
        END; $$ LANGUAGE plpgsql
        """
    )
    conn.execute("DROP TRIGGER IF EXISTS trg_ws_release_records_guard ON ws_release_records")
    conn.execute(
        "CREATE TRIGGER trg_ws_release_records_guard BEFORE UPDATE OR DELETE ON ws_release_records "
        "FOR EACH ROW EXECUTE FUNCTION ws_release_record_guard()"
    )


def _release_studio_source_defaults(conn: Any) -> None:
    """Remember last Source picks per project so a new release reuses them.

    These are convenience defaults, not build identity. Discovery still lists
    what exists at the selected commit; a saved path is used only when that
    file is still in the tree.
    """

    conn.execute(
        """
        ALTER TABLE ws_projects
            ADD COLUMN IF NOT EXISTS release_studio_defaults JSONB NOT NULL DEFAULT '{}'::jsonb
        """
    )


def _release_studio_project_signoff(conn: Any) -> None:
    """LM-shaped dual sign-off and publish records for project releases."""

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_release_review_decisions (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES ws_projects(id) ON DELETE CASCADE,
            build_id TEXT NOT NULL REFERENCES ws_release_builds(id) ON DELETE CASCADE,
            slot TEXT NOT NULL CHECK (slot IN ('designer', 'qa')),
            actor TEXT NOT NULL,
            decision TEXT NOT NULL CHECK (decision IN ('approved', 'withdrawn')),
            note TEXT NOT NULL DEFAULT '',
            dossier_digest TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_ws_release_review_decisions_build
        ON ws_release_review_decisions(build_id, slot, created_at DESC)
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_release_publish_records (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES ws_projects(id) ON DELETE CASCADE,
            build_id TEXT NOT NULL REFERENCES ws_release_builds(id) ON DELETE RESTRICT,
            tag TEXT NOT NULL,
            commit_sha TEXT NOT NULL,
            dossier_digest TEXT NOT NULL,
            published_by TEXT NOT NULL,
            forge_url TEXT NOT NULL DEFAULT '',
            asset_names JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_ws_release_publish_records_tag UNIQUE (project_id, tag),
            CONSTRAINT uq_ws_release_publish_records_build UNIQUE (build_id)
        )
        """
    )


def _manufacturing_spec_config(conn: Any) -> None:
    """Add the per-project spec-schema column to the board-specs table.

    The manufacturing tables are created idempotently in _create_schema; this only
    adds the column a database predating the config-driven form would lack. IF NOT
    EXISTS keeps it a no-op on a fresh database where the column is already there.
    """
    conn.execute(
        "ALTER TABLE ws_board_specs ADD COLUMN IF NOT EXISTS spec_config TEXT NOT NULL DEFAULT ''"
    )


def _manufacturing_spec_templates(conn: Any) -> None:
    """Add manufacturer-scoped, named spec templates.

    Created idempotently so a fresh database (where _create_schema already made the
    table) is a no-op, and an existing one gains it.
    """
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_spec_templates (
            id              TEXT PRIMARY KEY,
            manufacturer_id TEXT NOT NULL REFERENCES ws_manufacturers(id) ON DELETE CASCADE,
            name            TEXT NOT NULL,
            spec_config     TEXT NOT NULL DEFAULT '',
            created_at      TIMESTAMPTZ NOT NULL,
            updated_at      TIMESTAMPTZ NOT NULL
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_ws_spec_templates_mfr ON ws_spec_templates(manufacturer_id)"
    )


def _manufacturing_active_sections(conn: Any) -> None:
    """Track which optional spec sections a project has switched on."""
    conn.execute(
        "ALTER TABLE ws_board_specs ADD COLUMN IF NOT EXISTS active_sections JSONB NOT NULL DEFAULT '[]'::jsonb"
    )


def _manufacturing_builtin_templates(conn: Any) -> None:
    """Track which spec templates are built-in and what source they were seeded from.

    Lets startup refresh an untouched built-in template to the latest source while
    leaving a user-edited one alone. Existing seeded rows get no key, so they are
    treated as user templates until the backfill in seed_builtin_manufacturers
    claims them by name+manufacturer.
    """
    conn.execute("ALTER TABLE ws_spec_templates ADD COLUMN IF NOT EXISTS builtin_key TEXT")
    conn.execute("ALTER TABLE ws_spec_templates ADD COLUMN IF NOT EXISTS seeded_hash TEXT")
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_ws_spec_templates_builtin ON ws_spec_templates(builtin_key)"
    )


def _manufacturing_run_release_tag(conn: Any) -> None:
    """Record the tagged release a run was built from, as a first-class field."""
    conn.execute(
        "ALTER TABLE ws_manufacturing_runs ADD COLUMN IF NOT EXISTS release_tag TEXT NOT NULL DEFAULT ''"
    )


def _manufacturing_project_manufacturers_and_specs(conn: Any) -> None:
    """Attach manufacturers to projects and give each (project, manufacturer) its
    own named fabrication specs.

    A board is quoted by several manufacturers, each needing its own spec. These
    tables replace the "one board spec per project" assumption for run purposes;
    ws_board_specs stays as the project board profile the extractor/PDF use.
    Created idempotently so a fresh database (where _create_schema already made
    them) is a no-op.
    """
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_project_manufacturers (
            project_id      TEXT NOT NULL REFERENCES ws_projects(id) ON DELETE CASCADE,
            manufacturer_id TEXT NOT NULL REFERENCES ws_manufacturers(id) ON DELETE CASCADE,
            created_at      TIMESTAMPTZ NOT NULL,
            PRIMARY KEY (project_id, manufacturer_id)
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_ws_project_mfrs_project ON ws_project_manufacturers(project_id)"
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_project_specs (
            id              TEXT PRIMARY KEY,
            project_id      TEXT NOT NULL REFERENCES ws_projects(id) ON DELETE CASCADE,
            manufacturer_id TEXT NOT NULL REFERENCES ws_manufacturers(id) ON DELETE CASCADE,
            name            TEXT NOT NULL,
            spec_config     TEXT NOT NULL DEFAULT '',
            specs           JSONB NOT NULL DEFAULT '{}'::jsonb,
            source          JSONB NOT NULL DEFAULT '{}'::jsonb,
            active_sections JSONB NOT NULL DEFAULT '[]'::jsonb,
            updated_at      TIMESTAMPTZ NOT NULL,
            updated_by      TEXT NOT NULL DEFAULT ''
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_ws_project_specs_scope ON ws_project_specs(project_id, manufacturer_id)"
    )
    conn.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_ws_project_specs_name
            ON ws_project_specs(project_id, manufacturer_id, lower(name))
        """
    )


def _manufacturing_run_spec_id(conn: Any) -> None:
    """Link a run to the named spec it was ordered against (nullable; the frozen
    spec_snapshot remains the durable picture)."""
    conn.execute(
        "ALTER TABLE ws_manufacturing_runs ADD COLUMN IF NOT EXISTS spec_id TEXT REFERENCES ws_project_specs(id) ON DELETE SET NULL"
    )


def _manufacturing_manufacturer_capabilities(conn: Any) -> None:
    """Store a manufacturer's fabrication capabilities (KiCad rule fields) as JSONB."""
    conn.execute(
        "ALTER TABLE ws_manufacturers ADD COLUMN IF NOT EXISTS capabilities JSONB NOT NULL DEFAULT '{}'::jsonb"
    )


def _manufacturing_capabilities_per_template(conn: Any) -> None:
    """Move capabilities from the vendor to the fabrication method: each spec
    template carries its own capabilities, and a project spec links to the
    template it was created from. The vendor-level column is dropped."""
    conn.execute(
        "ALTER TABLE ws_spec_templates ADD COLUMN IF NOT EXISTS capabilities JSONB NOT NULL DEFAULT '{}'::jsonb"
    )
    conn.execute(
        "ALTER TABLE ws_project_specs ADD COLUMN IF NOT EXISTS template_id TEXT REFERENCES ws_spec_templates(id) ON DELETE SET NULL"
    )
    conn.execute(
        "ALTER TABLE ws_manufacturers DROP COLUMN IF EXISTS capabilities"
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
    (13, "release_studio_build_projections", _release_studio_build_projections),
    (14, "release_studio_waiver_build_scope", _release_studio_waiver_build_scope),
    (15, "release_studio_configuration_snapshot", _release_studio_configuration_snapshot),
    (16, "release_studio_append_only_evaluations", _release_studio_append_only_evaluations),
    (17, "release_studio_terminal_and_identity_guards", _release_studio_terminal_and_identity_guards),
    (18, "release_studio_source_defaults", _release_studio_source_defaults),
    (19, "release_studio_project_signoff", _release_studio_project_signoff),
    (20, "manufacturing_spec_config", _manufacturing_spec_config),
    (21, "manufacturing_spec_templates", _manufacturing_spec_templates),
    (22, "manufacturing_active_sections", _manufacturing_active_sections),
    (23, "manufacturing_builtin_templates", _manufacturing_builtin_templates),
    (24, "manufacturing_run_release_tag", _manufacturing_run_release_tag),
    (25, "manufacturing_project_manufacturers_and_specs", _manufacturing_project_manufacturers_and_specs),
    (26, "manufacturing_run_spec_id", _manufacturing_run_spec_id),
    (27, "manufacturing_manufacturer_capabilities", _manufacturing_manufacturer_capabilities),
    (28, "manufacturing_capabilities_per_template", _manufacturing_capabilities_per_template),
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
