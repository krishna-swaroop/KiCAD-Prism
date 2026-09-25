"""Persistence for Release Studio technical builds.

Candidates, builds, members, fingerprints, and (later) LM-shaped review
decisions live here. Signed policy evaluation, waivers, attestations, and
offline verify are not part of the running product.
"""

from __future__ import annotations

import hashlib
import json
import secrets
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator, Mapping, Sequence

from app.release_studio.canonical import sha256_canonical
from app.services.postgres_database import database
from app.services.workspace_schema_migrations import apply_workspace_migrations

CANDIDATE_STATUSES = ("draft", "building", "built", "failed", "superseded", "frozen")


class ReleaseStudioError(RuntimeError):
    """A Release Studio operation was refused."""


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:16]}"


@contextmanager
def connect() -> Iterator[Any]:
    with database.connection() as conn:
        conn.execute("SET search_path TO workspace, public")
        yield conn


def initialize() -> None:
    with connect() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", ("prism-schema",))
        apply_workspace_migrations(conn)
        conn.commit()


# ---------------------------------------------------------------------------
# Audit chain
# ---------------------------------------------------------------------------


def _event_hash(previous_hash: str | None, fields: Mapping[str, Any], created_at_iso: str) -> str:
    """``H(previous_hash, event fields, created_at_iso)``.

    ``previous_hash`` is hashed as JSON ``null`` for the genesis event, never as
    an empty string, so a genesis event and an event chained from ``''`` can
    never collide.
    """

    return sha256_canonical(
        {
            "previous_hash": previous_hash,
            "event": dict(fields),
            "created_at_iso": created_at_iso,
        }
    )


def append_audit_event(
    conn: Any,
    *,
    project_id: str,
    config_key: str,
    event_type: str,
    actor: str,
    subject_kind: str,
    subject_id: str,
    details: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Append one event under the caller's transaction."""

    # The audit stream is a per-(project, configuration) hash chain. Row locks
    # cannot lock a non-existent genesis row, so a transaction-scoped advisory
    # lock serializes both genesis and ordinary append safely.
    conn.execute(
        "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
        (f"release-audit:{project_id}:{config_key}",),
    )
    row = conn.execute(
        """
        SELECT sequence, event_hash FROM ws_release_audit_events
        WHERE project_id = %s AND config_key = %s
        ORDER BY sequence DESC LIMIT 1
        """,
        (project_id, config_key),
    ).fetchone()
    sequence = (int(row["sequence"]) + 1) if row else 1
    previous_hash = str(row["event_hash"]) if row else None

    created_at_iso = _now_iso()
    fields = {
        "project_id": project_id,
        "config_key": config_key,
        "sequence": sequence,
        "event_type": event_type,
        "actor": actor,
        "subject_kind": subject_kind,
        "subject_id": subject_id,
        "details": dict(details or {}),
    }
    event_hash = _event_hash(previous_hash, fields, created_at_iso)
    event_id = _new_id("audit")
    conn.execute(
        """
        INSERT INTO ws_release_audit_events(
            id, project_id, config_key, sequence, event_type, actor,
            subject_kind, subject_id, details, previous_hash, event_hash,
            created_at_iso
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        (
            event_id, project_id, config_key, sequence, event_type, actor,
            subject_kind, subject_id, json.dumps(fields["details"]),
            previous_hash, event_hash, created_at_iso,
        ),
    )
    return {"id": event_id, "sequence": sequence, "event_hash": event_hash}


def audit_head(conn: Any, project_id: str, config_key: str) -> dict[str, Any]:
    row = conn.execute(
        """
        SELECT sequence, event_hash FROM ws_release_audit_events
        WHERE project_id = %s AND config_key = %s
        ORDER BY sequence DESC LIMIT 1
        """,
        (project_id, config_key),
    ).fetchone()
    return dict(row) if row else {"sequence": 0, "event_hash": ""}


def current_audit_head(project_id: str, config_key: str) -> dict[str, Any]:
    """``audit_head`` for callers that are not already inside a transaction."""

    with connect() as conn:
        return audit_head(conn, project_id, config_key)


def list_audit_events(project_id: str, config_key: str, limit: int = 500) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM ws_release_audit_events
            WHERE project_id = %s AND config_key = %s
            ORDER BY sequence DESC LIMIT %s
            """,
            (project_id, config_key, limit),
        ).fetchall()
    return [dict(row) for row in rows]


def upsert_configuration(
    *,
    project_id: str,
    config_key: str,
    title: str,
    board_rel: str,
    schematic_rel: str = "",
    jobset_rel: str = "",
    default_variant: str = "",
    created_by: str = "",
) -> dict[str, Any]:
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO ws_release_configurations(
                id, project_id, config_key, title, board_rel, schematic_rel,
                jobset_rel, default_variant, created_by
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (project_id, config_key) DO UPDATE SET
                title = EXCLUDED.title,
                board_rel = EXCLUDED.board_rel,
                schematic_rel = EXCLUDED.schematic_rel,
                jobset_rel = EXCLUDED.jobset_rel,
                default_variant = EXCLUDED.default_variant,
                updated_at = NOW()
            """,
            (
                _new_id("cfg"), project_id, config_key, title, board_rel,
                schematic_rel, jobset_rel, default_variant, created_by,
            ),
        )
        conn.commit()
    return get_configuration(project_id, config_key) or {}


def get_source_defaults(project_id: str) -> dict[str, str]:
    """Return the last Source picks saved for this project."""

    from app.release_studio.source import normalize_source_defaults

    with connect() as conn:
        row = conn.execute(
            "SELECT release_studio_defaults FROM ws_projects WHERE id = %s",
            (project_id,),
        ).fetchone()
    raw = row["release_studio_defaults"] if row else {}
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            raw = {}
    if not isinstance(raw, dict):
        raw = {}
    return normalize_source_defaults(raw)


def save_source_defaults(project_id: str, defaults: Mapping[str, Any]) -> dict[str, str]:
    """Merge and persist Source picks. Empty values leave the previous pick."""

    from app.release_studio.source import normalize_source_defaults

    incoming = {key: value for key, value in normalize_source_defaults(defaults).items() if value}
    if incoming:
        with connect() as conn:
            conn.execute(
                """
                UPDATE ws_projects
                SET release_studio_defaults = COALESCE(release_studio_defaults, '{}'::jsonb) || %s::jsonb
                WHERE id = %s
                """,
                (json.dumps(incoming), project_id),
            )
            conn.commit()
    return get_source_defaults(project_id)


def list_configurations(project_id: str) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM ws_release_configurations WHERE project_id = %s ORDER BY config_key",
            (project_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def get_configuration(project_id: str, config_key: str) -> dict[str, Any] | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM ws_release_configurations WHERE project_id = %s AND config_key = %s",
            (project_id, config_key),
        ).fetchone()
    return dict(row) if row else None


# ---------------------------------------------------------------------------
# Candidates
# ---------------------------------------------------------------------------


def compute_build_key(
    *,
    technical_config_digest: str,
    input_closure_digest: str,
    variant: str,
    toolchain_digest: str,
) -> str:
    """``H(technical_config_digest, input_closure_digest, variant, toolchain_digest)``.

    Policy is deliberately absent: re-evaluating an existing build under a new
    policy must not produce a different build key or re-run KiCad.
    """

    return sha256_canonical(
        {
            "technical_config_digest": technical_config_digest,
            "input_closure_digest": input_closure_digest,
            "variant": variant,
            "toolchain_digest": toolchain_digest,
        }
    )


def create_candidate(
    *,
    project_id: str,
    repository_id: str,
    config_key: str,
    commit_sha: str,
    variant: str,
    technical_config_digest: str,
    input_closure_digest: str,
    toolchain_digest: str,
    generator_build: str,
    hermetic: bool,
    non_hermetic_reasons: Sequence[str] = (),
    closure_inputs: Sequence[Mapping[str, Any]] = (),
    policy_snapshot_captured: bool = False,
    policy_document: Mapping[str, Any] | None = None,
    configuration_snapshot_captured: bool = False,
    configuration_document: Mapping[str, Any] | None = None,
    created_by: str = "",
) -> dict[str, Any]:
    """Idempotent on ``build_key``: the same inputs return the same candidate."""

    build_key = compute_build_key(
        technical_config_digest=technical_config_digest,
        input_closure_digest=input_closure_digest,
        variant=variant,
        toolchain_digest=toolchain_digest,
    )
    with connect() as conn:
        existing = conn.execute(
            """
            SELECT * FROM ws_release_candidates
            WHERE project_id = %s AND config_key = %s AND build_key = %s
            """,
            (project_id, config_key, build_key),
        ).fetchone()
        if existing:
            return dict(existing)

        candidate_id = _new_id("cand")
        conn.execute(
            """
            INSERT INTO ws_release_candidates(
                id, project_id, repository_id, config_key, commit_sha, variant,
                technical_config_digest, input_closure_digest, toolchain_digest,
                generator_build, build_key, status, hermetic, non_hermetic_reasons,
                policy_snapshot_captured, policy_document,
                configuration_snapshot_captured, configuration_document, created_by
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'draft',%s,%s,%s,%s,%s,%s,%s)
            """,
            (
                candidate_id, project_id, repository_id, config_key, commit_sha,
                variant, technical_config_digest, input_closure_digest,
                toolchain_digest, generator_build, build_key, hermetic,
                json.dumps(list(non_hermetic_reasons)), policy_snapshot_captured,
                json.dumps(dict(policy_document)) if policy_document is not None else None,
                configuration_snapshot_captured,
                json.dumps(dict(configuration_document)) if configuration_document is not None else None,
                created_by,
            ),
        )
        for item in closure_inputs:
            conn.execute(
                """
                INSERT INTO ws_release_closure_inputs(
                    id, candidate_id, kind, path, git_object_id, mode,
                    object_type, lfs_oid, materialized_digest, details
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (candidate_id, kind, path) DO NOTHING
                """,
                (
                    _new_id("ci"), candidate_id, item.get("kind", "repository"),
                    item.get("path", ""), item.get("git_object_id", ""),
                    item.get("mode", ""), item.get("object_type", ""),
                    item.get("lfs_oid", ""), item.get("materialized_digest", ""),
                    json.dumps(dict(item.get("details") or {})),
                ),
            )
        append_audit_event(
            conn,
            project_id=project_id,
            config_key=config_key,
            event_type="candidate.created",
            actor=created_by,
            subject_kind="candidate",
            subject_id=candidate_id,
            details={"commit_sha": commit_sha, "variant": variant, "build_key": build_key},
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM ws_release_candidates WHERE id = %s", (candidate_id,)
        ).fetchone()
    return dict(row)


def record_prepare_failure(
    *,
    project_id: str,
    repository_id: str,
    config_key: str,
    commit_sha: str,
    variant: str,
    job_id: str | None,
    fence: int,
    author: str,
    error: str,
) -> dict[str, Any]:
    """Persist an attempt that failed before configuration/closure preparation.

    This deliberately uses a separate, clearly synthetic identity namespace:
    it preserves the operator-visible failure without claiming it is a valid
    successful technical candidate or permitting it to collide with one.
    """

    # A failed preparation has no trusted project config to load. Persist a
    # minimal, normalized diagnostic context instead of re-opening mutable Git
    # when an operator views the retained attempt.
    from app.release_studio.config import technical_config_digest

    failure_configuration = {
        "schema": "prism.release-studio.configuration/1",
        "title": f"Preparation failure: {config_key}",
        "board": "",
        "schematic": "",
        "default_variant": variant,
        "fields": {},
        "notes": {"failure_context": "preparation did not complete"},
        "variants": [],
        "typography": "inter",
        "vendors": [],
        "document_number": "",
        "revision": "",
    }
    candidate = create_candidate(
        project_id=project_id,
        repository_id=repository_id,
        config_key=config_key,
        commit_sha=commit_sha,
        variant=variant,
        technical_config_digest=technical_config_digest(failure_configuration),
        input_closure_digest=sha256_canonical({"prepare_failure": True, "commit": commit_sha}),
        toolchain_digest=sha256_canonical({"prepare_failure": "toolchain-unavailable"}),
        generator_build="release-studio/prepare-failure",
        hermetic=False,
        non_hermetic_reasons=["build preparation did not complete"],
        configuration_snapshot_captured=True,
        configuration_document=failure_configuration,
        created_by=author,
    )
    # The worker publishes diagnostic evidence while the attempt is still
    # running, then performs its single terminal transition with the artifact
    # id. Terminal rows are never patched after the fact.
    return start_build(candidate["id"], job_id=job_id, fence=fence)


def list_candidates(project_id: str, config_key: str | None = None) -> list[dict[str, Any]]:
    query = "SELECT * FROM ws_release_candidates WHERE project_id = %s"
    params: list[Any] = [project_id]
    if config_key:
        query += " AND config_key = %s"
        params.append(config_key)
    query += " ORDER BY created_at DESC"
    with connect() as conn:
        rows = conn.execute(query, tuple(params)).fetchall()
    return [dict(row) for row in rows]


def get_candidate(candidate_id: str) -> dict[str, Any] | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM ws_release_candidates WHERE id = %s", (candidate_id,)
        ).fetchone()
    return dict(row) if row else None


def set_candidate_status(candidate_id: str, status: str, *, actor: str = "") -> dict[str, Any]:
    if status not in CANDIDATE_STATUSES:
        raise ReleaseStudioError(f"unknown candidate status: {status!r}")
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM ws_release_candidates WHERE id = %s FOR UPDATE", (candidate_id,)
        ).fetchone()
        if row is None:
            raise ReleaseStudioError("candidate not found")
        if row["status"] == "frozen" and status == "frozen":
            raise ReleaseStudioError("candidate is already frozen")
        conn.execute(
            "UPDATE ws_release_candidates SET status = %s, updated_at = NOW() WHERE id = %s",
            (status, candidate_id),
        )
        append_audit_event(
            conn,
            project_id=row["project_id"],
            config_key=row["config_key"],
            event_type=f"candidate.{status}",
            actor=actor,
            subject_kind="candidate",
            subject_id=candidate_id,
            details={"from": row["status"], "to": status},
        )
        conn.commit()
        updated = conn.execute(
            "SELECT * FROM ws_release_candidates WHERE id = %s", (candidate_id,)
        ).fetchone()
    return dict(updated)


# ---------------------------------------------------------------------------
# Builds
# ---------------------------------------------------------------------------


def start_build(candidate_id: str, *, job_id: str | None, fence: int) -> dict[str, Any]:
    with connect() as conn:
        attempt = int(
            (
                conn.execute(
                    "SELECT COUNT(*) AS n FROM ws_release_builds WHERE candidate_id = %s",
                    (candidate_id,),
                ).fetchone()
                or {"n": 0}
            )["n"]
        ) + 1
        build_id = _new_id("build")
        conn.execute(
            """
            INSERT INTO ws_release_builds(
                id, candidate_id, job_id, fence, attempt, status, started_at
            ) VALUES (%s,%s,%s,%s,%s,'running',NOW())
            """,
            (build_id, candidate_id, job_id, fence, attempt),
        )
        conn.execute(
            "UPDATE ws_release_candidates SET status='building', updated_at=NOW() WHERE id=%s",
            (candidate_id,),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM ws_release_builds WHERE id = %s", (build_id,)).fetchone()
    return dict(row)


def complete_build(
    *,
    build_id: str,
    dossier,
    toolchain: Mapping[str, Any],
    dossier_artifact_id: str | None = None,
    evidence_artifact_id: str | None = None,
    fence: int | None = None,
    actor: str = "",
    warnings: Sequence[str] = (),
    projections: Mapping[str, Any] | None = None,
    timings: Sequence[Mapping[str, Any]] = (),
) -> dict[str, Any]:
    """Finalize one build in a single transaction, re-validating the fence.

    Object storage and PostgreSQL are separate systems, so this is fenced and
    crash-safe rather than atomic.  The property that matters is that a stale
    worker can never make its artifact authoritative.
    """

    with connect() as conn:
        build = conn.execute(
            "SELECT * FROM ws_release_builds WHERE id = %s FOR UPDATE", (build_id,)
        ).fetchone()
        if build is None:
            raise ReleaseStudioError("build not found")
        if build["status"] != "running":
            raise ReleaseStudioError(
                f"cannot complete terminal/non-running build with status {build['status']!r}"
            )
        if fence is not None and int(build["fence"]) != int(fence):
            raise ReleaseStudioError(
                f"stale fence: build holds {build['fence']}, caller presented {fence}"
            )
        candidate = conn.execute(
            "SELECT * FROM ws_release_candidates WHERE id = %s", (build["candidate_id"],)
        ).fetchone()
        conn.execute(
            "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
            (f"release-audit:{candidate['project_id']}:{candidate['config_key']}",),
        )

        conn.execute(
            """
            UPDATE ws_release_builds SET
                status='succeeded', manifest_digest=%s, dossier_digest=%s,
                dossier_artifact_id=%s, evidence_artifact_id=%s,
                toolchain=%s, warnings=%s, timings=%s, completed_at=NOW()
            WHERE id = %s
            """,
            (
                dossier.manifest_digest, dossier.dossier_digest,
                dossier_artifact_id, evidence_artifact_id,
                json.dumps(dict(toolchain)), json.dumps(list(warnings)),
                # Phase wall clock, so "where did the build go?" is answerable
                # from the build row instead of by unpacking build-evidence.
                # Evidence only: never hashed into a fingerprint or manifest.
                json.dumps([dict(item) for item in timings]), build_id,
            ),
        )
        conn.execute("DELETE FROM ws_release_members WHERE build_id = %s", (build_id,))
        for member in dossier.members:
            member_id = _new_id("mem")
            conn.execute(
                """
                INSERT INTO ws_release_members(
                    id, build_id, path, member_kind, media_type, size_bytes,
                    released_digest, source_raw_digest, canonicalizer
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """,
                (
                    member_id, build_id, member.path, member.member_kind,
                    member.media_type, member.size_bytes, member.released_digest,
                    member.source_raw_digest, member.canonicalizer,
                ),
            )
            for domain in member.domains:
                conn.execute(
                    """
                    INSERT INTO ws_release_member_domains(member_id, build_id, domain)
                    VALUES (%s,%s,%s) ON CONFLICT DO NOTHING
                    """,
                    (member_id, build_id, domain),
                )

        conn.execute("DELETE FROM ws_release_evidence WHERE build_id = %s", (build_id,))
        for record in dossier.evidence:
            conn.execute(
                """
                INSERT INTO ws_release_evidence(id, build_id, kind, report_digest, counts)
                VALUES (%s,%s,%s,%s,%s)
                """,
                (
                    _new_id("ev"), build_id, record["kind"],
                    record["report_digest"], json.dumps(record["counts"]),
                ),
            )

        conn.execute(
            "DELETE FROM ws_release_build_projections WHERE build_id = %s", (build_id,)
        )
        for name, payload in sorted(dict(projections or {}).items()):
            if not payload:
                continue
            conn.execute(
                """
                INSERT INTO ws_release_build_projections(build_id, name, digest, payload)
                VALUES (%s,%s,%s,%s)
                """,
                (build_id, name, sha256_canonical(payload), json.dumps(payload)),
            )

        conn.execute("DELETE FROM ws_release_scope_fingerprints WHERE build_id = %s", (build_id,))
        for domain, record in dossier.fingerprints.items():
            conn.execute(
                """
                INSERT INTO ws_release_scope_fingerprints(
                    build_id, domain, fingerprint, inputs, fidelity
                ) VALUES (%s,%s,%s,%s,%s)
                """,
                (
                    build_id, domain, record["fingerprint"],
                    json.dumps(record["inputs"]), record.get("fidelity", "artifact"),
                ),
            )

        for artifact_id, kind in (
            (dossier_artifact_id, "dossier"),
            (evidence_artifact_id, "build_evidence"),
        ):
            if artifact_id:
                conn.execute(
                    """
                    INSERT INTO ws_artifact_release_pins(artifact_id, pin_kind, pin_ref)
                    VALUES (%s,%s,%s) ON CONFLICT (artifact_id) DO NOTHING
                    """,
                    (artifact_id, kind, build_id),
                )

        conn.execute(
            "UPDATE ws_release_candidates SET status='built', updated_at=NOW() WHERE id=%s",
            (build["candidate_id"],),
        )
        append_audit_event(
            conn,
            project_id=candidate["project_id"],
            config_key=candidate["config_key"],
            event_type="build.succeeded",
            actor=actor,
            subject_kind="build",
            subject_id=build_id,
            details={
                "manifest_digest": dossier.manifest_digest,
                "dossier_digest": dossier.dossier_digest,
                "members": len(dossier.members),
            },
        )
        conn.commit()
        row = conn.execute("SELECT * FROM ws_release_builds WHERE id = %s", (build_id,)).fetchone()
    return dict(row)


def fail_build(
    build_id: str,
    *,
    error_code: str,
    error_message: str,
    actor: str = "",
    evidence_artifact_id: str | None = None,
) -> None:
    with connect() as conn:
        build = conn.execute(
            "SELECT * FROM ws_release_builds WHERE id = %s FOR UPDATE", (build_id,)
        ).fetchone()
        if build is None:
            return
        if build["status"] != "running":
            raise ReleaseStudioError(
                f"cannot fail terminal/non-running build with status {build['status']!r}"
            )
        candidate = conn.execute(
            "SELECT * FROM ws_release_candidates WHERE id = %s", (build["candidate_id"],)
        ).fetchone()
        conn.execute(
            """
            UPDATE ws_release_builds SET status='failed', error_code=%s,
                   error_message=%s,
                   evidence_artifact_id=COALESCE(%s, evidence_artifact_id),
                   completed_at=NOW() WHERE id=%s
            """,
            (error_code, error_message[:2000], evidence_artifact_id, build_id),
        )
        if evidence_artifact_id:
            conn.execute(
                """
                INSERT INTO ws_artifact_release_pins(artifact_id, pin_kind, pin_ref)
                VALUES (%s, 'build_evidence', %s)
                ON CONFLICT (artifact_id) DO NOTHING
                """,
                (evidence_artifact_id, build_id),
            )
        conn.execute(
            "UPDATE ws_release_candidates SET status='failed', updated_at=NOW() WHERE id=%s",
            (build["candidate_id"],),
        )
        append_audit_event(
            conn,
            project_id=candidate["project_id"],
            config_key=candidate["config_key"],
            event_type="build.failed",
            actor=actor,
            subject_kind="build",
            subject_id=build_id,
            details={
                "error_code": error_code,
                "evidence_artifact_id": evidence_artifact_id or "",
            },
        )
        conn.commit()


def cancel_build(
    build_id: str,
    *,
    message: str,
    evidence_artifact_id: str | None = None,
    actor: str = "",
) -> None:
    """Terminally cancel a build without misreporting it as a tool failure."""

    with connect() as conn:
        build = conn.execute(
            "SELECT * FROM ws_release_builds WHERE id = %s FOR UPDATE", (build_id,)
        ).fetchone()
        if build is None:
            return
        if build["status"] != "running":
            raise ReleaseStudioError(
                f"cannot cancel terminal/non-running build with status {build['status']!r}"
            )
        candidate = conn.execute(
            "SELECT * FROM ws_release_candidates WHERE id = %s", (build["candidate_id"],)
        ).fetchone()
        conn.execute(
            """
            UPDATE ws_release_builds SET status='cancelled', error_code='cancelled',
                   error_message=%s,
                   evidence_artifact_id=COALESCE(%s, evidence_artifact_id),
                   completed_at=NOW() WHERE id=%s
            """,
            (message[:2000], evidence_artifact_id, build_id),
        )
        if evidence_artifact_id:
            conn.execute(
                """
                INSERT INTO ws_artifact_release_pins(artifact_id, pin_kind, pin_ref)
                VALUES (%s, 'build_evidence', %s)
                ON CONFLICT (artifact_id) DO NOTHING
                """,
                (evidence_artifact_id, build_id),
            )
        # Candidates model immutable identities, not worker outcomes. The
        # attempt carries the cancelled state; returning the candidate to draft
        # leaves a retry available without representing cancellation as failure.
        conn.execute(
            "UPDATE ws_release_candidates SET status='draft', updated_at=NOW() WHERE id=%s",
            (build["candidate_id"],),
        )
        append_audit_event(
            conn,
            project_id=candidate["project_id"],
            config_key=candidate["config_key"],
            event_type="build.cancelled",
            actor=actor,
            subject_kind="build",
            subject_id=build_id,
            details={"evidence_artifact_id": evidence_artifact_id or ""},
        )
        conn.commit()


def get_build(build_id: str) -> dict[str, Any] | None:
    with connect() as conn:
        row = conn.execute("SELECT * FROM ws_release_builds WHERE id = %s", (build_id,)).fetchone()
    return dict(row) if row else None


def latest_build(candidate_id: str) -> dict[str, Any] | None:
    with connect() as conn:
        row = conn.execute(
            """
            SELECT * FROM ws_release_builds WHERE candidate_id = %s
            ORDER BY attempt DESC LIMIT 1
            """,
            (candidate_id,),
        ).fetchone()
    return dict(row) if row else None


def list_builds(candidate_id: str) -> list[dict[str, Any]]:
    """Every attempt for a candidate, newest first.

    A failed or superseded attempt is still evidence about the immutable
    candidate and must not disappear merely because a later retry succeeded.
    """

    with connect() as conn:
        rows = conn.execute(
            """
            SELECT b.*,
                   (p.id IS NOT NULL) AS published,
                   COALESCE(p.tag, '') AS published_tag
            FROM ws_release_builds b
            LEFT JOIN ws_release_publish_records p ON p.build_id = b.id
            WHERE b.candidate_id = %s
            ORDER BY b.attempt DESC, b.created_at DESC
            """,
            (candidate_id,),
        ).fetchall()
    builds: list[dict[str, Any]] = []
    for row in rows:
        item = dict(row)
        item["published"] = bool(item.get("published"))
        item["published_tag"] = str(item.get("published_tag") or "")
        builds.append(item)
    return builds


def get_artifact(artifact_id: str) -> dict[str, Any] | None:
    """Resolve one published artifact row by id.

    Builds reference artifacts by ``ws_artifacts(id)``, so serving a dossier
    means looking the object location up rather than deriving it from a digest.
    """

    with connect() as conn:
        row = conn.execute(
            "SELECT id, kind, digest, object_path, media_type, size_bytes "
            "FROM ws_artifacts WHERE id = %s",
            (artifact_id,),
        ).fetchone()
    return dict(row) if row else None


def build_members(build_id: str) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT m.*, COALESCE(
                ARRAY_AGG(d.domain ORDER BY d.domain) FILTER (WHERE d.domain IS NOT NULL),
                '{}'
            ) AS domains
            FROM ws_release_members m
            LEFT JOIN ws_release_member_domains d ON d.member_id = m.id
            WHERE m.build_id = %s GROUP BY m.id ORDER BY m.path
            """,
            (build_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def build_evidence(build_id: str) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM ws_release_evidence WHERE build_id = %s ORDER BY kind", (build_id,)
        ).fetchall()
    return [dict(row) for row in rows]


def build_fingerprints(build_id: str) -> dict[str, dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM ws_release_scope_fingerprints WHERE build_id = %s", (build_id,)
        ).fetchall()
    return {row["domain"]: dict(row) for row in rows}


def build_projections(build_id: str) -> dict[str, Any]:
    """The exact board facts this build observed, for re-evaluation.

    Re-evaluation must read the facts the *build* saw.  Recomputing them from a
    checkout would make governance depend on files that have moved since, and
    dropping them would make every projection-backed rule report ``unsupported``
    on the second evaluation of a build that passed on the first.
    """

    with connect() as conn:
        rows = conn.execute(
            "SELECT name, payload FROM ws_release_build_projections "
            "WHERE build_id = %s ORDER BY name",
            (build_id,),
        ).fetchall()
    return {row["name"]: row["payload"] for row in rows}


# ---------------------------------------------------------------------------
# LM-shaped dual sign-off and publish records
# ---------------------------------------------------------------------------

REVIEW_SLOTS = ("designer", "qa")
REVIEW_DECISIONS = ("approved", "withdrawn")


class ReviewDecisionError(ReleaseStudioError):
    """A review or publish gate refused the request."""

    def __init__(self, message: str, *, status_code: int = 409) -> None:
        super().__init__(message)
        self.status_code = status_code


def _json_object(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def electrical_error_kinds(evidence: Sequence[Mapping[str, Any]]) -> list[str]:
    """Unwaived DRC/ERC error severities on this build. Warnings do not count."""

    kinds: list[str] = []
    for row in evidence:
        kind = str(row.get("kind") or "").strip().lower()
        if kind not in {"drc", "erc"}:
            continue
        counts = _json_object(row.get("counts"))
        if int(counts.get("error") or 0) > 0:
            kinds.append(kind)
    return kinds


def latest_review_decision(build_id: str, slot: str) -> dict[str, Any] | None:
    with connect() as conn:
        row = conn.execute(
            """
            SELECT * FROM ws_release_review_decisions
            WHERE build_id = %s AND slot = %s
            ORDER BY created_at DESC LIMIT 1
            """,
            (build_id, slot),
        ).fetchone()
    return dict(row) if row else None


def list_review_decisions(build_id: str) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM ws_release_review_decisions
            WHERE build_id = %s
            ORDER BY created_at ASC
            """,
            (build_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def get_publish_record(build_id: str) -> dict[str, Any] | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM ws_release_publish_records WHERE build_id = %s",
            (build_id,),
        ).fetchone()
    if row is None:
        return None
    record = dict(row)
    names = record.get("asset_names")
    if isinstance(names, str):
        try:
            names = json.loads(names)
        except json.JSONDecodeError:
            names = []
    record["asset_names"] = list(names or [])
    return record


def _active_approval(row: Mapping[str, Any] | None, digest: str) -> dict[str, Any] | None:
    if not row:
        return None
    if str(row.get("decision") or "") != "approved":
        return None
    if str(row.get("dossier_digest") or "") != digest:
        return None
    return dict(row)


def selected_vendor_packs_ready(vendor_readiness: Sequence[Mapping[str, Any]]) -> bool:
    if not vendor_readiness:
        return True
    return all(bool(item.get("ready")) for item in vendor_readiness)


def build_approval_state(
    *,
    build: Mapping[str, Any],
    candidate: Mapping[str, Any],
    evidence: Sequence[Mapping[str, Any]],
    vendor_readiness: Sequence[Mapping[str, Any]],
    designer_row: Mapping[str, Any] | None,
    qa_row: Mapping[str, Any] | None,
    publish_row: Mapping[str, Any] | None,
    actor_email: str = "",
    actor_role: str = "",
) -> dict[str, Any]:
    digest = str(build.get("dossier_digest") or "")
    designer = _active_approval(designer_row, digest)
    qa = _active_approval(qa_row, digest)
    electrical = electrical_error_kinds(evidence)
    vendors_ready = selected_vendor_packs_ready(vendor_readiness)
    published = dict(publish_row) if publish_row else None
    succeeded = str(build.get("status") or "") == "succeeded"
    author = str(candidate.get("created_by") or "")
    actor = (actor_email or "").strip()
    role = (actor_role or "").strip()
    blocked: list[str] = []
    if electrical and not (designer and qa):
        blocked.append("Unwaived DRC or ERC errors remain on this build.")
    if not vendors_ready:
        blocked.append("A selected vendor pack is not ready.")
    if not designer or not qa:
        blocked.append("Designer and QA must both approve this dossier.")
    can_approve_designer, can_approve_qa = _slot_capabilities(
        role=role,
        actor=actor,
        author=author,
        designer=designer,
        qa=qa,
        published=published,
        succeeded=succeeded,
        electrical=electrical,
    )
    can_withdraw = bool(succeeded and not published and (designer or qa) and role in {"admin", "designer", "qa"})
    if published:
        can_withdraw = False
        can_approve_designer = False
        can_approve_qa = False
    can_publish = bool(
        succeeded
        and designer
        and qa
        and vendors_ready
        and not published
        and role in {"admin", "designer", "qa"}
    )
    return {
        "designer": designer,
        "qa": qa,
        "both_approved": bool(designer and qa),
        "published": published,
        "electrical_errors": electrical,
        "can_approve_designer": can_approve_designer,
        "can_approve_qa": can_approve_qa,
        "can_withdraw": can_withdraw,
        "can_publish": can_publish,
        "blocked_reason": " ".join(blocked) if not can_publish and not published else "",
    }


def _slot_capabilities(
    *,
    role: str,
    actor: str,
    author: str,
    designer: Mapping[str, Any] | None,
    qa: Mapping[str, Any] | None,
    published: Mapping[str, Any] | None,
    succeeded: bool,
    electrical: Sequence[str],
) -> tuple[bool, bool]:
    if published or not succeeded or not actor:
        return False, False
    if electrical and role != "admin":
        return False, False
    if role not in {"admin", "designer", "qa"}:
        return False, False
    designer_actor = str((designer or {}).get("actor") or author)
    can_designer = False
    if role in {"designer", "admin"} and not designer:
        can_designer = actor == author or role == "admin"
    can_qa = False
    if role in {"qa", "admin"} and not qa:
        same_person = actor == designer_actor
        can_qa = (not same_person) or role == "admin"
    return can_designer, can_qa


def record_review_decision(
    *,
    project_id: str,
    build_id: str,
    slot: str,
    actor: str,
    actor_role: str,
    decision: str,
    note: str = "",
    dossier_digest: str,
    author: str,
    published: bool,
    electrical_errors: Sequence[str] = (),
    build_status: str = "",
    config_key: str = "",
) -> dict[str, Any]:
    if slot not in REVIEW_SLOTS:
        raise ReviewDecisionError("Unknown review slot.", status_code=400)
    if decision not in REVIEW_DECISIONS:
        raise ReviewDecisionError("Unknown review decision.", status_code=400)
    if published:
        raise ReviewDecisionError("This release is published; sign-off cannot change.")
    if str(build_status or "") != "succeeded":
        raise ReviewDecisionError("Only a successful build can be signed off.")
    digest = (dossier_digest or "").strip()
    if not digest:
        raise ReviewDecisionError("This build has no dossier digest to bind a decision to.")
    written = (note or "").strip()
    if decision == "approved" and electrical_errors:
        if actor_role != "admin":
            raise ReviewDecisionError("Unwaived DRC or ERC errors remain on this build.")
        if not written:
            raise ReviewDecisionError("Admin override of DRC or ERC errors needs a written note.")

    current = latest_review_decision(build_id, slot)
    active = _active_approval(current, digest)
    other_slot = "qa" if slot == "designer" else "designer"
    other = _active_approval(latest_review_decision(build_id, other_slot), digest)

    if decision == "withdrawn":
        if not active:
            raise ReviewDecisionError(f"There is no {slot} approval to withdraw.")
        if actor_role not in {"admin", "designer", "qa"}:
            raise ReviewDecisionError("Designer, QA, or Admin role required.", status_code=403)
        if actor != str(active.get("actor") or "") and actor_role != "admin":
            raise ReviewDecisionError("Only the caster or an admin can withdraw this sign-off.")
        if not written:
            raise ReviewDecisionError("A withdrawal note is required.")
    else:
        if active:
            raise ReviewDecisionError(f"The {slot} slot is already approved for this dossier.")
        if slot == "designer":
            if actor_role not in {"designer", "admin"}:
                raise ReviewDecisionError("The Designer slot requires a designer or admin.", status_code=403)
            if actor != author and actor_role != "admin":
                raise ReviewDecisionError("Only the build author can cast the Designer sign-off.")
            if actor != author and not written:
                raise ReviewDecisionError("Admin override of the Designer slot needs a written note.")
        else:
            if actor_role not in {"qa", "admin"}:
                raise ReviewDecisionError("The QA slot requires QA or admin.", status_code=403)
            designer_actor = str((other or {}).get("actor") or author)
            if actor == designer_actor and actor_role != "admin":
                raise ReviewDecisionError("The same person cannot fill both sign-off slots.")
            if actor == designer_actor and not written:
                raise ReviewDecisionError("Admin override of the two-person rule needs a written note.")

    row_id = _new_id("rev")
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO ws_release_review_decisions(
                id, project_id, build_id, slot, actor, decision, note, dossier_digest
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            (row_id, project_id, build_id, slot, actor, decision, written, digest),
        )
        append_audit_event(
            conn,
            project_id=project_id,
            config_key=config_key,
            event_type=f"review.{decision}",
            actor=actor,
            subject_kind="build",
            subject_id=build_id,
            details={"slot": slot, "note": written, "dossier_digest": digest},
        )
        conn.commit()
    return latest_review_decision(build_id, slot) or {}


def record_publish(
    *,
    project_id: str,
    build_id: str,
    tag: str,
    commit_sha: str,
    dossier_digest: str,
    published_by: str,
    forge_url: str,
    asset_names: Sequence[str],
    config_key: str = "",
) -> dict[str, Any]:
    existing = get_publish_record(build_id)
    if existing:
        raise ReviewDecisionError("This build is already published.")
    row_id = _new_id("pub")
    try:
        with connect() as conn:
            conn.execute(
                """
                INSERT INTO ws_release_publish_records(
                    id, project_id, build_id, tag, commit_sha, dossier_digest,
                    published_by, forge_url, asset_names
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """,
                (
                    row_id,
                    project_id,
                    build_id,
                    tag,
                    commit_sha,
                    dossier_digest,
                    published_by,
                    forge_url,
                    json.dumps(list(asset_names)),
                ),
            )
            append_audit_event(
                conn,
                project_id=project_id,
                config_key=config_key,
                event_type="release.published",
                actor=published_by,
                subject_kind="build",
                subject_id=build_id,
                details={"tag": tag, "forge_url": forge_url, "asset_names": list(asset_names)},
            )
            conn.commit()
    except Exception as exc:
        message = str(exc).lower()
        if "uq_ws_release_publish_records_tag" in message or "unique" in message:
            raise ReviewDecisionError(f"{tag} is already published for this project.") from exc
        raise
    return get_publish_record(build_id) or {}


# Signed policy evaluation, waivers, cryptographic attestations, and web shares
# stay frozen on `feature/release-studio-governance`. Their tables remain in
# existing migrations; see docs/release-studio/GOVERNANCE.md.


__all__ = [
    "CANDIDATE_STATUSES",
    "ReleaseStudioError",
    "append_audit_event",
    "audit_head",
    "build_evidence",
    "cancel_build",
    "build_fingerprints",
    "build_members",
    "complete_build",
    "compute_build_key",
    "connect",
    "create_candidate",
    "current_audit_head",
    "fail_build",
    "get_artifact",
    "get_build",
    "get_candidate",
    "get_configuration",
    "get_source_defaults",
    "save_source_defaults",
    "initialize",
    "latest_build",
    "list_builds",
    "list_audit_events",
    "list_candidates",
    "list_configurations",
    "record_prepare_failure",
    "record_publish",
    "record_review_decision",
    "ReviewDecisionError",
    "build_approval_state",
    "electrical_error_kinds",
    "get_publish_record",
    "latest_review_decision",
    "list_review_decisions",
    "selected_vendor_packs_ready",
    "set_candidate_status",
    "start_build",
    "upsert_configuration",
]
