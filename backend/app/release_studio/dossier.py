"""Members, manifest, dossier, and technical scope fingerprints (R10).

Everything in this module lives strictly in the technical domain.  No approver
identity, policy binding, candidate id, build id, job id, or wall-clock time may
reach any digest computed here — that separation is what lets a policy change
invalidate an approval without pretending the build changed.  It is enforced by
:func:`assert_no_governance_leak` and asserted in the R10 tests.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping, Sequence

from app.release_studio.canonical import (
    CANONICALIZER_REGISTRY_NAME,
    CANONICALIZER_REGISTRY_VERSION,
    canonicalize,
    sha256_canonical,
    write_deterministic_archive,
)
from app.release_studio.steps import EVIDENCE_STEPS, StepOutput

MANIFEST_SCHEMA = "prism.release-studio.manifest/1"

GOVERNED_DOMAINS: tuple[str, ...] = ("bare_board", "assembly", "documentation", "evidence")

# Keys that must never appear anywhere in the manifest tree.  A build id or an
# approver name inside the manifest would make manifest_digest move for
# governance-only reasons.
FORBIDDEN_MANIFEST_KEYS: frozenset[str] = frozenset(
    {
        "approver",
        "approvals",
        "build_id",
        "candidate_id",
        "created_at",
        "evaluation_id",
        "job_id",
        "policy",
        "policy_binding",
        "policy_binding_digest",
        "release_id",
        "released_at",
        "signature",
        "signing_key_id",
        "timestamp",
    }
)

# The Protel extension set is KiCad's own, transcribed from the pinned 10.0.4
# source (`pcbnew/pcbplot.cpp:44` `GetGerberProtelExtension`).  A jobset that
# enables Protel filename extensions emits these instead of `.gbr`, and a
# missing one fails the build at canonicalization rather than at plot time.
_SUFFIX_CANONICALIZERS: Mapping[str, str] = {
    ".gbr": "gerber",
    ".gtl": "gerber",  # F_Cu
    ".gbl": "gerber",  # B_Cu
    ".gta": "gerber",  # F_Adhes
    ".gba": "gerber",  # B_Adhes
    ".gto": "gerber",  # F_SilkS
    ".gbo": "gerber",  # B_SilkS
    ".gts": "gerber",  # F_Mask
    ".gbs": "gerber",  # B_Mask
    ".gtp": "gerber",  # F_Paste
    ".gbp": "gerber",  # B_Paste
    ".gm1": "gerber",  # Edge_Cuts
    ".gbrjob": "gbrjob",
    ".drl": "excellon",
    ".csv": "csv",
    ".pdf": "pdf",
    ".svg": "svg",
    ".step": "step",
    ".stp": "step",
}

# Inner copper has no fixed extension: KiCad emits `g` + the copper layer's
# ordinal (`pcbplot.cpp:53`), so a four-layer board yields `.g1`/`.g2`.
_INNER_COPPER_SUFFIX = re.compile(r"^\.g[0-9]+$")

_MEDIA_TYPES: Mapping[str, str] = {
    "gerber": "application/vnd.gerber",
    "gbrjob": "application/json",
    "excellon": "text/plain",
    "csv": "text/csv",
    "pdf": "application/pdf",
    "svg": "image/svg+xml",
    "step": "model/step",
    "drc_erc_json": "application/json",
    "board_stats_json": "application/json",
}


class DossierError(RuntimeError):
    """A dossier could not be assembled deterministically."""


@dataclass(frozen=True, slots=True)
class Member:
    """One released file: canonical bytes plus the raw bytes' identity."""

    path: str
    member_kind: str
    media_type: str
    size_bytes: int
    released_digest: str
    source_raw_digest: str
    canonicalizer: str
    domains: tuple[str, ...]
    step_id: str = ""

    def manifest_entry(self) -> dict[str, Any]:
        return {
            "member_kind": self.member_kind,
            "media_type": self.media_type,
            "size_bytes": self.size_bytes,
            "released_digest": self.released_digest,
            "canonicalizer": self.canonicalizer,
            "domains": list(self.domains),
        }


@dataclass(frozen=True, slots=True)
class Dossier:
    members: tuple[Member, ...]
    manifest: dict[str, Any]
    dossier_digest: str
    manifest_digest: str
    dossier_bytes: bytes
    evidence_bytes: bytes
    evidence: tuple[dict[str, Any], ...] = ()
    fingerprints: Mapping[str, dict[str, Any]] = field(default_factory=dict)

    def member_by_path(self, path: str) -> Member | None:
        return next((member for member in self.members if member.path == path), None)


def canonicalizer_for(relative_path: str, spec_canonicalizer: str) -> str:
    """Pick the canonicalizer for one produced file."""

    if spec_canonicalizer:
        return spec_canonicalizer
    suffix = Path(relative_path).suffix.lower()
    resolved = _SUFFIX_CANONICALIZERS.get(suffix)
    if resolved is None and _INNER_COPPER_SUFFIX.match(suffix):
        resolved = "gerber"
    if resolved is None:
        raise DossierError(
            f"no canonicalizer registered for {relative_path!r}; add one to the "
            "R4 registry before releasing this member type"
        )
    return resolved


def build_members(outputs: Sequence[StepOutput]) -> tuple[Member, ...]:
    """Canonicalize every produced file into a released member."""

    members: list[Member] = []
    seen: set[str] = set()
    for output in outputs:
        if not output.ran:
            continue
        for path in output.files:
            relative = path.relative_to(output.root).as_posix()
            if relative in seen:
                raise DossierError(f"duplicate member path: {relative}")
            seen.add(relative)
            raw = path.read_bytes()
            canonicalizer = canonicalizer_for(relative, output.spec.canonicalizer)
            try:
                canonical = canonicalize(canonicalizer, raw)
            except Exception as exc:  # noqa: BLE001 - surfaced with the member path
                raise DossierError(
                    f"canonicalizing {relative} with {canonicalizer!r} failed: {exc}"
                ) from exc
            members.append(
                Member(
                    path=relative,
                    member_kind=output.spec.member_kind,
                    media_type=_MEDIA_TYPES.get(canonicalizer, "application/octet-stream"),
                    size_bytes=len(canonical),
                    released_digest=hashlib.sha256(canonical).hexdigest(),
                    source_raw_digest=hashlib.sha256(raw).hexdigest(),
                    canonicalizer=canonicalizer,
                    domains=output.spec.domains,
                    step_id=output.step_id,
                )
            )
    return tuple(sorted(members, key=lambda member: member.path))


def compute_dossier_digest(members: Sequence[Member]) -> str:
    """``H(sorted[(path, released_digest)])`` — the manifest is excluded."""

    return sha256_canonical(
        [[member.path, member.released_digest] for member in sorted(members, key=lambda m: m.path)]
    )


#: Which board-level projections feed which domain's fingerprint (D9).
#:
#: The mapping is the whole point of the fidelity upgrade.  Feeding every
#: projection into every domain would make a stackup edit invalidate the
#: assembly approvals, which is exactly the over-invalidation that artifact
#: fidelity already suffers from -- it would just be more expensive.  Each
#: domain lists the projections a reviewer of *that* domain was reasoning about:
#:
#: * ``bare_board`` -- the physical board: its stack, its holes, its geometry.
#: * ``assembly`` -- what gets populated on it, and for which variant.
#: * ``documentation`` -- everything, because a sheet can draw any of it.
#: * ``evidence`` -- nothing: a DRC report's meaning is its own content, and
#:   binding it to the stackup would invalidate reviewed evidence whenever an
#:   unrelated projection moved.
DOMAIN_PROJECTIONS: Mapping[str, tuple[str, ...]] = {
    "bare_board": ("stackup", "board_stats"),
    "assembly": ("variants", "placements"),
    "documentation": ("stackup", "board_stats", "variants", "placements"),
    "evidence": (),
}


def projection_digests(projections: Mapping[str, Any] | None) -> dict[str, str]:
    """``name -> H(canonical(projection))`` for every non-empty projection.

    Projections are Prism's internal view of the board -- the semantic index of
    a 982-component board runs to megabytes -- and embedding them verbatim made
    the manifest 10.5 MB, of which 99.9% was projection text nobody receiving a
    release needs.  A digest binds the fingerprint to the projection just as
    tightly: it still moves when the projection moves, which is the whole
    reason the projection was hashed in.

    The full text stays in the build-evidence artifact, where forensics can
    reach it and where nobody pays for it on every download.
    """

    digests: dict[str, str] = {}
    for name, value in sorted((projections or {}).items()):
        # An empty projection means "we could not read this", not "it is
        # empty", and is deliberately absent rather than hashed as `{}`.
        if not value:
            continue
        digests[name] = sha256_canonical(value)
    return digests


def technical_scope_fingerprint(
    domain: str,
    members: Sequence[Member],
    *,
    toolchain_digest: str,
    normalized_argv: Mapping[str, Sequence[str]],
    config_fragments: Mapping[str, Any],
    projections: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Fingerprint one governed domain. No policy input, by construction.

    ``projections`` are the R5/D4 board facts.  Only the ones :data:`DOMAIN_PROJECTIONS`
    assigns to *domain* are hashed, and the fidelity the row reports follows from
    whether any of them were actually available: a domain fingerprinted without
    board facts is honestly ``artifact``, and claiming ``board`` for it would
    make the ladder in §5 of the plan unreadable.

    Projections enter as **digests**, not as text.  The fingerprint's job is to
    change when the facts change, which a digest does exactly as well as the
    facts themselves -- and ``inputs`` is persisted per build, so embedding the
    text cost ~10.5 MB of database per build for no added discrimination.
    """

    domain_members = [member for member in members if domain in member.domains]
    steps = sorted({member.step_id for member in domain_members if member.step_id})

    supplied = projections or {}
    semantic_by_domain = supplied.get("semantic")
    semantic = (
        semantic_by_domain.get(domain)
        if isinstance(semantic_by_domain, Mapping)
        else None
    )
    relevant = {
        key: supplied[key]
        for key in DOMAIN_PROJECTIONS.get(domain, ())
        # An empty projection means "we could not read this", not "it is empty".
        # Hashing it would let a transient extraction failure silently carry an
        # approval forward against facts nobody actually compared.
        if supplied.get(key)
    }
    inputs = {
        "domain_id": domain,
        "released_digests": [
            [member.path, member.released_digest]
            for member in sorted(domain_members, key=lambda m: m.path)
        ],
        "normalized_argv": [list(normalized_argv.get(step, ())) for step in steps],
        "config_fragments": dict(config_fragments),
        "projection_digests": projection_digests(relevant),
        "semantic_digest": sha256_canonical(semantic) if semantic else "",
        "toolchain_digest": toolchain_digest,
    }
    return {
        "domain": domain,
        "fingerprint": sha256_canonical(inputs),
        "inputs": inputs,
        "fidelity": "semantic" if semantic else ("board" if relevant else "artifact"),
    }


def assert_no_governance_leak(payload: Any, *, where: str = "manifest") -> None:
    """Fail loudly if a governance field reached a technical-domain digest."""

    def walk(node: Any, trail: str) -> None:
        if isinstance(node, Mapping):
            for key, value in node.items():
                if key in FORBIDDEN_MANIFEST_KEYS:
                    raise DossierError(
                        f"{where} contains governance field {key!r} at {trail or '<root>'}"
                    )
                walk(value, f"{trail}.{key}" if trail else str(key))
        elif isinstance(node, (list, tuple)):
            for index, value in enumerate(node):
                walk(value, f"{trail}[{index}]")

    walk(payload, "")


def build_manifest(
    *,
    members: Sequence[Member],
    dossier_digest: str,
    commit_sha: str,
    variant: str,
    config_key: str,
    technical_config_digest: str,
    input_closure_digest: str,
    toolchain: Mapping[str, Any],
    toolchain_digest: str,
    build_key: str,
    fingerprints: Mapping[str, dict[str, Any]],
    projections: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """The manifest never contains its own digest, and never governance data."""

    manifest = {
        "schema": MANIFEST_SCHEMA,
        "config_key": config_key,
        "commit_sha": commit_sha,
        "variant": variant,
        "build_key": build_key,
        "technical_config_digest": technical_config_digest,
        "input_closure_digest": input_closure_digest,
        "toolchain_digest": toolchain_digest,
        "toolchain": dict(toolchain),
        "canonicalizer_registry": {
            "name": CANONICALIZER_REGISTRY_NAME,
            "version": CANONICALIZER_REGISTRY_VERSION,
        },
        "dossier_digest": dossier_digest,
        "members": {member.path: member.manifest_entry() for member in members},
        "scope_fingerprints": {
            domain: record["fingerprint"] for domain, record in sorted(fingerprints.items())
        },
        # Identities, not contents.  A recipient checking that the release they
        # hold was built from the facts Prism recorded needs the digest; the
        # facts themselves are in build-evidence.tar.gz.
        "projection_digests": projection_digests(projections),
    }
    assert_no_governance_leak(manifest)
    return manifest


def assemble(
    *,
    outputs: Sequence[StepOutput],
    commit_sha: str,
    variant: str,
    config_key: str,
    technical_config_digest: str,
    input_closure_digest: str,
    toolchain: Mapping[str, Any],
    toolchain_digest: str,
    build_key: str,
    config_fragments: Mapping[str, Any] | None = None,
    projections: Mapping[str, Any] | None = None,
    archive_mtime: int = 0,
    timings: Sequence[Mapping[str, Any]] | None = None,
    extra_evidence: Mapping[str, bytes] | None = None,
) -> Dossier:
    """Canonicalize, fingerprint, and package one build's outputs."""

    members = build_members(outputs)
    if not members:
        raise DossierError("no released members were produced")
    dossier_digest = compute_dossier_digest(members)
    normalized_argv = {output.step_id: output.normalized_argv for output in outputs}

    fingerprints = {}
    for domain in GOVERNED_DOMAINS:
        if not any(domain in member.domains for member in members):
            continue
        fingerprints[domain] = technical_scope_fingerprint(
            domain,
            members,
            toolchain_digest=toolchain_digest,
            normalized_argv=normalized_argv,
            config_fragments=config_fragments or {},
            projections=projections,
        )

    manifest = build_manifest(
        members=members,
        dossier_digest=dossier_digest,
        commit_sha=commit_sha,
        variant=variant,
        config_key=config_key,
        technical_config_digest=technical_config_digest,
        input_closure_digest=input_closure_digest,
        toolchain=toolchain,
        toolchain_digest=toolchain_digest,
        build_key=build_key,
        fingerprints=fingerprints,
        projections=projections,
    )
    manifest_digest = sha256_canonical(manifest)

    canonical_files = _canonical_bytes_by_path(outputs, members)
    dossier_members = dict(canonical_files)
    dossier_members["manifest.json"] = _manifest_bytes(manifest)
    dossier_bytes = write_deterministic_archive(dossier_members, mtime=archive_mtime)

    evidence_members = {
        f"raw/{path}": data for path, data in _raw_bytes_by_path(outputs, members).items()
    }
    for relative, payload in (extra_evidence or {}).items():
        evidence_members[f"raw/{relative}"] = payload
    # One log per step, in full. The job row keeps only a 4000-character tail
    # and is pruned on the job retention schedule, so a release used to outlive
    # the record of how it was built. build-evidence is pinned for as long as
    # the release exists and sits outside the dossier, so nothing here reaches
    # a released digest.
    for output in outputs:
        evidence_members[f"logs/{output.step_id}.log"] = _step_log_bytes(output)
    evidence_members["build-evidence.json"] = _manifest_bytes(
        {
            "schema": "prism.release-studio.build-evidence/1",
            "build_key": build_key,
            "manifest_digest": manifest_digest,
            "members": {
                member.path: {
                    "source_raw_digest": member.source_raw_digest,
                    "released_digest": member.released_digest,
                    "canonicalizer": member.canonicalizer,
                }
                for member in members
            },
            "steps": {
                output.step_id: {
                    "step_type": output.step_type,
                    "normalized_argv": list(output.normalized_argv),
                    "returncode": output.returncode,
                    "skipped_reason": output.skipped_reason,
                    "elapsed_ms": output.elapsed_ms,
                    "status": (
                        "skipped" if output.skipped_reason
                        else ("success" if output.returncode == 0 else "failure")
                    ),
                }
                for output in outputs
            },
            # Wall clock of pipeline phases. Evidence only — never hashed into
            # a fingerprint or the manifest.
            "timings": [dict(item) for item in (timings or ())],
            # The manifest carries only projection digests; this is where the
            # facts behind them live, so a digest in a released manifest is
            # still checkable against the text it was taken from.
            "projections": dict(projections or {}),
            "projection_digests": projection_digests(projections),
        }
    )
    evidence_bytes = write_deterministic_archive(evidence_members, mtime=archive_mtime)

    return Dossier(
        members=members,
        manifest=manifest,
        dossier_digest=dossier_digest,
        manifest_digest=manifest_digest,
        dossier_bytes=dossier_bytes,
        evidence_bytes=evidence_bytes,
        evidence=_evidence_records(outputs, members),
        fingerprints=fingerprints,
    )


def _step_log_bytes(output: Any) -> bytes:
    """One step's full log: what was run, how it ended, and everything it said.

    The header matters as much as the output. A log that shows the text but not
    the argv leaves a reader guessing which invocation produced it, and the
    argv is already normalized so no absolute path is recorded here.
    """

    header = [
        f"step: {output.step_id}",
        f"type: {output.step_type}",
        f"argv: {' '.join(output.normalized_argv)}",
        f"returncode: {output.returncode}",
        f"elapsed_ms: {output.elapsed_ms}",
    ]
    if output.skipped_reason:
        header.append(f"skipped: {output.skipped_reason}")
    sections = ["\n".join(header)]
    if output.stdout:
        sections.append(f"--- stdout ---\n{output.stdout.rstrip()}")
    if output.stderr:
        sections.append(f"--- stderr ---\n{output.stderr.rstrip()}")
    return ("\n\n".join(sections) + "\n").encode("utf-8")


def _manifest_bytes(payload: Mapping[str, Any]) -> bytes:
    from app.release_studio.canonical.json import canonical_json_bytes

    return canonical_json_bytes(payload)


def _canonical_bytes_by_path(
    outputs: Sequence[StepOutput], members: Sequence[Member]
) -> dict[str, bytes]:
    by_path: dict[str, bytes] = {}
    for output in outputs:
        if not output.ran:
            continue
        for path in output.files:
            relative = path.relative_to(output.root).as_posix()
            member = next((m for m in members if m.path == relative), None)
            if member is None:
                continue
            by_path[relative] = canonicalize(member.canonicalizer, path.read_bytes())
    return by_path


def _raw_bytes_by_path(
    outputs: Sequence[StepOutput], members: Sequence[Member]
) -> dict[str, bytes]:
    by_path: dict[str, bytes] = {}
    for output in outputs:
        if not output.ran:
            continue
        for path in output.files:
            relative = path.relative_to(output.root).as_posix()
            by_path[relative] = path.read_bytes()
    return by_path


def _evidence_records(
    outputs: Sequence[StepOutput], members: Sequence[Member]
) -> tuple[dict[str, Any], ...]:
    import json as _json

    from app.release_studio.steps import evidence_counts

    records: list[dict[str, Any]] = []
    for output in outputs:
        kind = EVIDENCE_STEPS.get(output.step_id)
        if kind is None or not output.ran or not output.files:
            continue
        # Match the member to the *file the report was read from*.  Members are
        # sorted by path and a step's files are in emission order, so taking
        # `files[0]` alongside the first member of the step would attribute one
        # file's digest to another file's counts as soon as a step emits two.
        report_file = output.files[0]
        relative = report_file.relative_to(output.root).as_posix()
        member = next((m for m in members if m.path == relative), None)
        if member is None:
            continue
        canonical = canonicalize(member.canonicalizer, report_file.read_bytes())
        try:
            report = _json.loads(canonical.decode("utf-8"))
        except ValueError:
            report = {}
        records.append(
            {
                "kind": kind,
                "report_digest": member.released_digest,
                "counts": evidence_counts(report if isinstance(report, dict) else {}),
                "member_path": member.path,
            }
        )
    return tuple(records)


__all__ = [
    "FORBIDDEN_MANIFEST_KEYS",
    "DOMAIN_PROJECTIONS",
    "GOVERNED_DOMAINS",
    "MANIFEST_SCHEMA",
    "Dossier",
    "DossierError",
    "Member",
    "assemble",
    "assert_no_governance_leak",
    "build_manifest",
    "build_members",
    "canonicalizer_for",
    "compute_dossier_digest",
    "projection_digests",
    "technical_scope_fingerprint",
]
