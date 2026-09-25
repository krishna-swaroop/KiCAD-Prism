"""Workspace schema migration 17: release_studio_terminal_and_identity_guards.

Frozen. Applied deployments recorded this body in ``ws_schema_migrations``;
edit nothing here, add a new migration instead.
"""

from __future__ import annotations

from typing import Any


def migrate(conn: Any) -> None:
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
