"""Workspace schema migration 8: release_studio.

Frozen. Applied deployments recorded this body in ``ws_schema_migrations``;
edit nothing here, add a new migration instead.
"""

from __future__ import annotations

from typing import Any


def migrate(conn: Any) -> None:
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
