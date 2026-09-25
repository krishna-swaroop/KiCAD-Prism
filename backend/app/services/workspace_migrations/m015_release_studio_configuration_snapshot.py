"""Workspace schema migration 15: release_studio_configuration_snapshot.

Frozen. Applied deployments recorded this body in ``ws_schema_migrations``;
edit nothing here, add a new migration instead.
"""

from __future__ import annotations

from typing import Any


def migrate(conn: Any) -> None:
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
