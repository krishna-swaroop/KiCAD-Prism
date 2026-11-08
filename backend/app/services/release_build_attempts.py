"""One Release Studio build attempt's row, from start to its single end.

An attempt (``ws_release_builds``) starts when a build job begins work and
ends exactly once: succeeded (inside the job's completion transaction),
failed or cancelled. Its candidate's status follows only the candidate's
newest attempt, so an older attempt that ends late cannot overwrite a newer
one.

When the job's process dies before it can end its attempt (the supervisor's
SIGTERM on cancel, the OOM killer, a lost lease), ``settle_build_job`` is the
build kind's end-of-job hook: the runner and supervisor call it after a
job's terminal transition, and the worker's sweep calls it for rows left
behind (``orphaned_jobs``).
"""

from __future__ import annotations

import json
from typing import Any, Mapping, Sequence

from app.release_studio.canonical import sha256_canonical
from app.release_studio.pipeline import settle_pipeline_steps
from app.services import event_log
from app.services.release_studio_service import (
    ReleaseStudioError,
    _new_id,
    append_audit_event,
    connect,
    create_candidate,
)

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


def _settle_candidate(conn: Any, build: Mapping[str, Any], status: str) -> None:
    """Move the candidate to ``status`` only from its newest attempt.

    A retried job starts a new attempt for the same candidate. The older
    attempt can still end afterwards (its worker lost the lease), and it must
    not overwrite what the newer attempt reports.
    """

    conn.execute(
        """
        UPDATE ws_release_candidates SET status=%s, updated_at=NOW()
        WHERE id=%s AND NOT EXISTS (
            SELECT 1 FROM ws_release_builds
            WHERE candidate_id=%s AND attempt > %s
        )
        """,
        (status, build["candidate_id"], build["candidate_id"], int(build["attempt"])),
    )


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
    conn: Any | None = None,
) -> dict[str, Any]:
    """Finalize one build in a single transaction, re-validating the fence.

    Object storage and PostgreSQL are separate systems, so this is fenced and
    crash-safe rather than atomic.  The property that matters is that a stale
    worker can never make its artifact authoritative.

    With ``conn`` the rows are written in the caller's transaction and not
    committed here: the build job passes the connection of its own
    completion, so the build succeeds exactly when the job completes.
    """

    if conn is None:
        with connect() as own:
            row = _complete_build(
                own, build_id=build_id, dossier=dossier, toolchain=toolchain,
                dossier_artifact_id=dossier_artifact_id,
                evidence_artifact_id=evidence_artifact_id, fence=fence, actor=actor,
                warnings=warnings, projections=projections, timings=timings,
            )
            own.commit()
        return row
    return _complete_build(
        conn, build_id=build_id, dossier=dossier, toolchain=toolchain,
        dossier_artifact_id=dossier_artifact_id,
        evidence_artifact_id=evidence_artifact_id, fence=fence, actor=actor,
        warnings=warnings, projections=projections, timings=timings,
    )


def _complete_build(
    conn: Any,
    *,
    build_id: str,
    dossier,
    toolchain: Mapping[str, Any],
    dossier_artifact_id: str | None,
    evidence_artifact_id: str | None,
    fence: int | None,
    actor: str,
    warnings: Sequence[str],
    projections: Mapping[str, Any] | None,
    timings: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
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

    _settle_candidate(conn, build, "built")
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
        _settle_candidate(conn, build, "failed")
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
        _settle_candidate(conn, build, "draft")
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


def running_builds_for_job(job_id: str) -> list[dict[str, Any]]:
    """Attempts of one build job that have not ended yet."""

    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM ws_release_builds WHERE job_id = %s AND status = 'running'"
            " ORDER BY attempt",
            (job_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def orphaned_build_job_ids(limit: int = 100) -> list[str]:
    """Jobs with a running attempt whose fenced execution is over.

    An attempt is live only while its job is running or cancelling at the
    attempt's fence. Anything else (the job ended, waits for a retry, or a
    newer fence took over) left the row behind.
    """

    with connect() as conn:
        rows = conn.execute(
            """
            SELECT DISTINCT build.job_id
            FROM ws_release_builds build
            JOIN ws_jobs job ON job.id = build.job_id
            WHERE build.status = 'running'
              AND (
                job.status NOT IN ('running', 'cancel_requested')
                OR job.fence <> build.fence
              )
            LIMIT %s
            """,
            (limit,),
        ).fetchall()
    return [str(row["job_id"]) for row in rows]


LIVE_STATUSES = frozenset({"running", "cancel_requested"})


def _record_candidate_built(job: Mapping[str, Any]) -> None:
    """Append ``release.candidate_built`` once its job committed (the end-of-job seam)."""

    if str(job.get("status") or "") != "completed":
        return
    metadata = dict(job.get("result_metadata") or {})
    build_id = str(metadata.get("build_id") or "")
    commit = str(metadata.get("commit") or "")
    project_id = str(metadata.get("project_id") or job.get("project_id") or "")
    if not (build_id and commit and project_id):
        return
    event_log.record_quietly(
        "release.candidate_built",
        project_id=project_id,
        payload={"buildId": build_id, "commit": commit},
    )


def _persist_settled_pipeline(job: Mapping[str, Any], status: str) -> bool:
    """Rewrite every step a dead build left queued/running, in the job payload the UI reads."""

    pipeline = (job.get("payload") or {}).get("pipeline")
    job_id = str(job.get("job_id") or job.get("id") or "")
    if not isinstance(pipeline, dict) or not job_id or not settle_pipeline_steps(pipeline, status):
        return False
    with connect() as conn:
        conn.execute(
            "UPDATE ws_jobs SET payload = payload || %s::jsonb WHERE id = %s",
            (json.dumps({"pipeline": pipeline}), job_id),
        )
        conn.commit()
    return True


def settle_build_job(job: Mapping[str, Any]) -> int:
    """End every attempt of ``job`` whose execution is over, as the job ended.

    - a completed job appends ``release.candidate_built`` for its build (the
      job's completion transaction committed the build row first);
    - an attempt still executing (job running or cancelling at its fence) is left alone;
    - a cancelled job cancels its attempts (the candidate goes back to draft;
      an expired cancellation moves the job one fence on, hence any fence);
    - an attempt from an older fence fails with ``lease_lost``;
    - otherwise the attempt fails with the job's error code.

    Returns how many attempts were settled. Idempotent.
    """

    _record_candidate_built(job)
    job_status = str(job.get("status") or "")
    job_fence = int(job.get("fence") or 0)
    if job_status in {"failed", "cancelled"}:
        _persist_settled_pipeline(job, "cancelled" if job_status == "cancelled" else "failure")
    settled = 0
    for build in running_builds_for_job(str(job["job_id"])):
        same_fence = int(build.get("fence") or 0) == job_fence
        if same_fence and job_status in LIVE_STATUSES:
            continue
        try:
            if job_status == "cancelled":
                cancel_build(build["id"], message=str(job.get("message") or "Cancelled"))
            elif not same_fence:
                fail_build(
                    build["id"],
                    error_code="lease_lost",
                    error_message="The worker running this attempt lost its lease",
                )
            else:
                fail_build(
                    build["id"],
                    error_code=str(job.get("error_code") or "job_ended"),
                    error_message=str(
                        job.get("error_message") or "The build job ended without finishing the build"
                    ),
                )
        except ReleaseStudioError:
            # Settled concurrently (the attempt's own process got there first).
            continue
        settled += 1
    return settled


def orphaned_jobs() -> list[str]:
    return orphaned_build_job_ids()


__all__ = [
    "cancel_build",
    "complete_build",
    "fail_build",
    "orphaned_build_job_ids",
    "orphaned_jobs",
    "record_prepare_failure",
    "running_builds_for_job",
    "settle_build_job",
    "start_build",
]
