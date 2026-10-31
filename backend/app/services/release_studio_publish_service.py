"""Release Studio publish: approve, package, forge, record.

``ReleasePublisher`` owns everything between a succeeded build and its forge
Release: the approval state a build shows, Designer/QA decisions, packaging the
dossier zip and the selected vendor packs, creating the Release through a forge
adapter (``forge_publish_service.forge_for``) and recording the publish. The
forge Release and the local record agree: when the record cannot be written the
Release is taken back down, with its tag when this publish created it, so neither
the retry nor a new build with that tag fails on "already exists".

``BuildArchives`` reads a build's stored dossier and evidence archives
(digest-checked) for the publisher and for the read-only build routes.

Everything here is blocking (database, artifact store, forge HTTP). Async
routes call it through ``asyncio.to_thread``.

Seams: ``records`` (the release store; ``release_studio_service`` by default),
``forges`` (``repo_url -> Forge``) and ``configuration`` (``(project_id,
candidate) -> configuration``). Tests pass fakes for all three.
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import tarfile
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable, Mapping, Protocol, Sequence

from app.core import errors
from app.services import event_log
from app.services import forge_publish_service as forge_publish
from app.services import release_studio_model_inputs as model_inputs
from app.services import release_studio_service as store

logger = logging.getLogger(__name__)

ForgeFor = Callable[[str | None], forge_publish.Forge]
ConfigurationFor = Callable[[str, Mapping[str, Any]], dict[str, Any]]


class Actor(Protocol):
    email: str
    role: str


class ReleaseRecords(Protocol):
    """The release rows the publisher reads and writes (``release_studio_service``)."""

    def get_build(self, build_id: str) -> dict[str, Any] | None: ...
    def get_candidate(self, candidate_id: str) -> dict[str, Any] | None: ...
    def model_inputs(self, candidate_id: str) -> list[dict[str, Any]]: ...
    def get_artifact(self, artifact_id: str) -> dict[str, Any] | None: ...
    def build_members(self, build_id: str) -> list[dict[str, Any]]: ...
    def build_evidence(self, build_id: str) -> list[dict[str, Any]]: ...
    def build_fingerprints(self, build_id: str) -> Any: ...
    def latest_review_decision(self, build_id: str, slot: str) -> dict[str, Any] | None: ...
    def get_publish_record(self, build_id: str) -> dict[str, Any] | None: ...
    def record_review_decision(self, **fields: Any) -> dict[str, Any]: ...
    def record_publish(self, **fields: Any) -> dict[str, Any]: ...


def forge_summary(repo_url: str | None) -> dict[str, Any]:
    """What the UI shows about the project's forge, including why it cannot publish."""

    try:
        return forge_publish.describe_forge(str(repo_url or "")).to_dict()
    except forge_publish.ForgePublishError as exc:
        return {
            "kind": "unsupported",
            "name": "",
            "host": "",
            "owner_repo": "",
            "token_configured": False,
            "token_hint": exc.detail,
        }


class BuildArchives:
    """A build's row and its stored, digest-checked archives."""

    def __init__(self, records: ReleaseRecords | None = None) -> None:
        self._records = records
        self._readiness = lru_cache(maxsize=64)(self._uncached_readiness)

    @property
    def records(self) -> ReleaseRecords:
        return self._records if self._records is not None else store

    def build(self, project_id: str, build_id: str) -> dict[str, Any]:
        """The build, if it belongs to *project_id*; ``NotFound`` otherwise."""

        build = self.records.get_build(build_id)
        if build is None:
            raise errors.NotFound("Build not found")
        candidate = self.records.get_candidate(build["candidate_id"])
        if candidate is None or candidate["project_id"] != project_id:
            raise errors.NotFound("Build not found")
        return build

    def artifact_bytes(self, artifact_id: str | None) -> bytes:
        """Read a published artifact by its ``ws_artifacts`` row id.

        The build rows reference artifacts by id, not by digest -- the FK
        targets ``ws_artifacts(id)`` -- so the object location is resolved from
        the row rather than reconstructed from a digest.  The bytes are
        re-hashed against the recorded digest because a content-addressed
        store that hands back something else has failed at its one job.
        """

        if not artifact_id:
            raise errors.NotFound("Artifact not available")
        artifact = self.records.get_artifact(artifact_id)
        if artifact is None:
            raise errors.NotFound("Artifact metadata is no longer present")
        path = Path(str(artifact["object_path"]))
        if not path.is_file():
            raise errors.NotFound("Artifact object is no longer present")
        payload = path.read_bytes()
        digest = str(artifact["digest"] or "")
        actual = hashlib.sha256(payload).hexdigest()
        if digest and actual != digest:
            raise errors.DomainError(
                f"Artifact {artifact_id} is corrupt: recorded digest {digest}, "
                f"stored object hashes to {actual}",
                status_code=500,
            )
        return payload

    def released_members(
        self, build: Mapping[str, Any], members: Sequence[Mapping[str, Any]]
    ) -> dict[str, bytes]:
        """The bytes of *members* (rows of the build's members table) out of its dossier.

        Viewing an output is only meaningful if what you are shown is the
        released bytes, so each extracted member is hashed and compared with
        its ``released_digest``. A mismatch means the stored dossier no longer
        matches the record and is a hard error, never a silent best effort. A
        member absent from the archive is left out of the result.
        """

        payload = self.artifact_bytes(build.get("dossier_artifact_id"))
        files: dict[str, bytes] = {}
        try:
            with tarfile.open(fileobj=io.BytesIO(payload), mode="r:gz") as archive:
                for member in members:
                    path = str(member["path"])
                    try:
                        extracted = archive.extractfile(path)
                    except KeyError:
                        continue
                    if extracted is None:
                        continue
                    data = extracted.read()
                    actual = hashlib.sha256(data).hexdigest()
                    if actual != member["released_digest"]:
                        raise errors.DomainError(
                            f"Released digest mismatch for {path}: the manifest records "
                            f"{member['released_digest']} but the stored dossier holds {actual}",
                            code="released_digest_mismatch",
                            status_code=500,
                        )
                    files[path] = data
        except tarfile.TarError as exc:
            logger.exception("Could not read the stored dossier of build %s", build.get("id"))
            raise errors.DomainError(
                "The stored dossier could not be read.",
                code="dossier_unreadable",
                status_code=500,
            ) from exc
        return files

    def evidence_member(self, build: Mapping[str, Any], path: str) -> bytes | None:
        """One file out of build-evidence.tar.gz, or ``None`` when it is absent.

        Builds made before logs were archived have no ``logs/`` entries, so a
        miss is an ordinary 404 rather than a failure.
        """

        payload = self.artifact_bytes(build.get("evidence_artifact_id"))
        with tarfile.open(fileobj=io.BytesIO(payload), mode="r:gz") as archive:
            try:
                member = archive.extractfile(path)
            except KeyError:
                return None
            return member.read() if member is not None else None

    def evidence_index(self, build: Mapping[str, Any]) -> dict[str, Any]:
        """The build-evidence index, or an empty one when it cannot be read."""

        try:
            payload = self.evidence_member(build, "build-evidence.json")
        except errors.DomainError:
            return {}
        if not payload:
            return {}
        try:
            return json.loads(payload)
        except ValueError:
            return {}

    def logs(self, project_id: str, build_id: str) -> dict[str, Any]:
        """Which steps have a log, how long each took, and how it ended."""

        build = self.build(project_id, build_id)
        evidence_index = self.evidence_index(build)
        steps = evidence_index.get("steps") or {}
        return {
            "timings": list(evidence_index.get("timings") or build.get("timings") or []),
            "steps": [
                {
                    "step_id": step_id,
                    "step_type": entry.get("step_type") or "",
                    "returncode": entry.get("returncode"),
                    "elapsed_ms": entry.get("elapsed_ms") or 0,
                    "skipped_reason": entry.get("skipped_reason") or "",
                    "argv": entry.get("normalized_argv") or [],
                    # Failed/cancelled retained attempts carry this in their
                    # canonical evidence index; consumers must not infer
                    # terminal state from a missing process return code.
                    "status": entry.get("status") or "",
                }
                for step_id, entry in sorted(steps.items())
            ],
        }

    def log(self, project_id: str, build_id: str, step_id: str) -> bytes:
        """One step's full log out of build-evidence (outlives the job's 4000-character tail)."""

        if not step_id or any(
            ch not in "abcdefghijklmnopqrstuvwxyz0123456789-_" for ch in step_id
        ):
            raise errors.NotFound("Log not found")
        build = self.build(project_id, build_id)
        payload = self.evidence_member(build, f"logs/{step_id}.log")
        if payload is None:
            raise errors.NotFound("Log not found")
        return payload

    def vendor_pack(self, build: Mapping[str, Any], vendor_id: str) -> tuple[bytes, str]:
        """A vendor pack built from the stored archives, and the profile's file name."""

        from app.release_studio.vendors import VendorPackError, build_vendor_pack, profile_by_id

        try:
            profile = profile_by_id(vendor_id)
        except KeyError as exc:
            raise errors.NotFound(f"Unknown vendor profile: {vendor_id}") from exc
        with errors.caller_errors((VendorPackError, 404)):
            pack = build_vendor_pack(
                vendor_id,
                dossier_bytes=self.artifact_bytes(build.get("dossier_artifact_id")),
                evidence_bytes=self.evidence_bytes(build),
            )
        return pack, profile.pack_filename

    def vendor_readiness(
        self, build: Mapping[str, Any], configuration: Mapping[str, Any]
    ) -> list[dict[str, Any]]:
        """Exact pack readiness; the publish packaging uses the same predicate."""

        return list(
            self._readiness(
                str(build.get("dossier_artifact_id") or ""),
                str(build.get("evidence_artifact_id") or ""),
                tuple(configuration.get("vendors") or []),
            )
        )

    def _uncached_readiness(
        self,
        dossier_artifact_id: str,
        evidence_artifact_id: str,
        vendor_ids: tuple[str, ...],
    ) -> tuple[dict[str, Any], ...]:
        """Readiness for one immutable pair of archives.

        Build detail is polled every few seconds while Publish is open, and
        each uncached call read *and* re-hashed the whole dossier and evidence
        archives -- hundreds of megabytes a minute for a board with a large
        gerber set. Artifacts are content-addressed and never rewritten, so
        keying on their ids makes the repeat reads unnecessary rather than
        merely cheaper.
        """

        from app.release_studio.vendors import vendor_pack_readiness

        dossier = self.artifact_bytes(dossier_artifact_id) if dossier_artifact_id else b""
        evidence = self.artifact_bytes(evidence_artifact_id) if evidence_artifact_id else b""
        return tuple(
            vendor_pack_readiness(vendor_id, dossier_bytes=dossier, evidence_bytes=evidence)
            for vendor_id in vendor_ids
        )

    def evidence_bytes(self, build: Mapping[str, Any]) -> bytes:
        evidence_id = build.get("evidence_artifact_id")
        return self.artifact_bytes(evidence_id) if evidence_id else b""


class ReleasePublisher:
    """Approve -> package -> forge -> record for one project's builds."""

    def __init__(
        self,
        *,
        records: ReleaseRecords | None = None,
        archives: BuildArchives | None = None,
        forges: ForgeFor | None = None,
        configuration: ConfigurationFor | None = None,
    ) -> None:
        self._records = records
        self.archives = archives or BuildArchives(records)
        self._forges = forges
        self._configuration = configuration

    @property
    def records(self) -> ReleaseRecords:
        return self._records if self._records is not None else store

    # -- reads ----------------------------------------------------------

    def detail(
        self, project_id: str, project: Mapping[str, Any], build_id: str, actor: Actor
    ) -> dict[str, Any]:
        """A build with its configuration, readiness, approvals and live forge Release."""

        build = self.archives.build(project_id, build_id)
        candidate = self.records.get_candidate(str(build["candidate_id"])) or {}
        configuration = self.configuration(project_id, candidate)
        readiness = self.archives.vendor_readiness(build, configuration)
        approvals = self._approvals(build, candidate, readiness, actor)
        tag = str(configuration.get("revision") or "").strip()
        return {
            "build": build,
            "candidate": candidate,
            "configuration": configuration,
            "members": self.records.build_members(build_id),
            "evidence": self.records.build_evidence(build_id),
            "fingerprints": self.records.build_fingerprints(build_id),
            "vendor_readiness": readiness,
            "forge": forge_summary(project.get("repo_url")),
            "approvals": approvals,
            "forge_release": self._live_release(
                str(project.get("repo_url") or ""), tag, approvals.get("published")
            ),
        }

    def configuration(self, project_id: str, candidate: Mapping[str, Any]) -> dict[str, Any]:
        """The configuration the build was composed with (409 when it cannot be read)."""

        if self._configuration is not None:
            return self._configuration(project_id, candidate)
        from app.services import release_studio_config_service as config_service
        from app.services.release_studio_build_service import BuildError

        with errors.caller_errors((BuildError, 409)):
            return config_service.configuration_for_candidate(project_id, candidate)

    def tag_taken(self, project: Mapping[str, Any], tag: str) -> bool:
        """Whether the forge already has *tag*. A forge that cannot answer reads as no."""

        candidate = (tag or "").strip()
        if not candidate:
            return False
        try:
            return self._forge(project).tag_exists(candidate)
        except forge_publish.ForgePublishError:
            return False

    def require_new_tag(self, project: Mapping[str, Any], identity: Mapping[str, Any]) -> None:
        """Refuse a build that has no forge-legal Identity before KiCad runs."""

        tag = str(identity.get("tag") or "").strip()
        document = str(identity.get("document_name") or "").strip()
        date = str(identity.get("date") or "").strip()
        if not tag or not document or not date:
            raise errors.BadRequest(
                "Tag, Document Name, and date are required before a build can start."
            )
        forge_publish.require_tag(tag)
        if self.tag_taken(project, tag):
            raise errors.Conflict(f"{tag} already exists on GitHub/GitLab.")

    # -- approve --------------------------------------------------------

    def decide(
        self,
        project_id: str,
        build_id: str,
        *,
        slot: str,
        decision: str,
        note: str,
        actor: Actor,
        acknowledged_models: Sequence[str] = (),
    ) -> dict[str, Any]:
        """Record a Designer/QA approval or withdrawal and return the new approval state.

        Approving a build whose 3D models are not all pinned needs every one of
        them in *acknowledged_models*; a withdrawal needs none.
        """

        build = self.archives.build(project_id, build_id)
        candidate = self.records.get_candidate(str(build["candidate_id"])) or {}
        acknowledged: list[str] = []
        if decision == "approved":
            acknowledged = model_inputs.require_acknowledgement(
                self._unpinned_models(candidate), acknowledged_models, action="Approval"
            )
        configuration = self.configuration(project_id, candidate)
        readiness = self.archives.vendor_readiness(build, configuration)
        evidence = self.records.build_evidence(build_id)
        self.records.record_review_decision(
            project_id=project_id,
            build_id=build_id,
            slot=slot,
            actor=actor.email,
            actor_role=actor.role,
            decision=decision,
            note=note,
            dossier_digest=str(build.get("dossier_digest") or ""),
            author=str(candidate.get("created_by") or ""),
            published=self.records.get_publish_record(build_id) is not None,
            electrical_errors=store.electrical_error_kinds(evidence),
            build_status=str(build.get("status") or ""),
            config_key=str(candidate.get("config_key") or ""),
            acknowledged_models=acknowledged,
        )
        if decision == "approved":
            event_log.record_quietly(
                "release.approved",
                project_id=project_id,
                payload={
                    "buildId": build_id,
                    "commit": str(candidate.get("commit_sha") or ""),
                },
            )
        return {"approvals": self._approvals(build, candidate, readiness, actor)}

    # -- publish --------------------------------------------------------

    def publish(
        self,
        project_id: str,
        project: Mapping[str, Any],
        build_id: str,
        *,
        tag: str,
        notes: str,
        actor: Actor,
        acknowledged_models: Sequence[str] = (),
        attach: Callable[[str], Sequence[tuple[str, bytes]]] | None = None,
        after: Callable[[str, str], None] | None = None,
    ) -> dict[str, Any]:
        """Zip the dossier, attach ready vendor packs, create the forge Release, record it.

        ``attach`` is asked for more assets given the zip's file name; ``after`` is told the tag and commit once the publish is
        recorded and must not raise (supply uses them for the compliance draft and its snapshot).

        A build whose 3D models are not all pinned is published only with each
        of them in *acknowledged_models*.
        """

        build = self.archives.build(project_id, build_id)
        if str(build.get("status") or "") != "succeeded":
            raise errors.Conflict("Only a successful build can be published")
        candidate = self.records.get_candidate(str(build["candidate_id"])) or {}
        commit_sha = str(candidate.get("commit_sha") or "")
        if not _is_full_git_sha(commit_sha):
            raise errors.Conflict("The build is not bound to a full Git commit")
        configuration = self.configuration(project_id, candidate)
        tag, notes = bound_release_identity(configuration, requested_tag=tag, requested_notes=notes)
        readiness = self.archives.vendor_readiness(build, configuration)
        approvals = self._approvals(build, candidate, readiness, actor)
        if approvals.get("published"):
            raise errors.Conflict("This build is already published")
        if not approvals.get("can_publish"):
            raise errors.Conflict(
                approvals.get("blocked_reason") or "This build is not clear to publish"
            )
        acknowledged = model_inputs.require_acknowledgement(
            approvals.get("unpinned_models") or [], acknowledged_models, action="Publishing"
        )

        # Package.
        zip_bytes = forge_publish.dossier_tar_to_zip(
            self.archives.artifact_bytes(build.get("dossier_artifact_id"))
        )
        filename = forge_publish.release_zip_filename(
            str(project.get("name") or project.get("parent_repo") or "release"),
            tag,
        )
        extras = self._vendor_pack_assets(build, configuration, filename)
        if attach is not None:
            extras = [*extras, *attach(filename)]

        # Forge. The Release name is the tag, never a browser-supplied title.
        # A tag this publish creates is deleted again by any rollback below.
        forge = self._forge(project)
        tag = forge_publish.require_tag(tag)
        new_tag = _tag_is_new(forge, tag)
        released = forge.create_release(
            commit_sha=commit_sha,
            tag=tag,
            notes=notes.strip(),
            assets=[(filename, zip_bytes), *extras],
            new_tag=new_tag,
        )

        # Record. A Release with no local record reads as unpublished here and
        # makes the next attempt fail on "already exists"; take it back down.
        try:
            record = self.records.record_publish(
                project_id=project_id,
                build_id=build_id,
                tag=tag,
                commit_sha=commit_sha,
                dossier_digest=str(build.get("dossier_digest") or ""),
                published_by=actor.email,
                forge_url=str(released.get("url") or ""),
                asset_names=[filename, *(name for name, _payload in extras)],
                config_key=str(candidate.get("config_key") or ""),
                acknowledged_models=acknowledged,
            )
        except Exception:
            logger.exception("Could not record the %s publish of build %s", tag, build_id)
            try:
                forge.remove_release(tag, with_tag=new_tag)
            except forge_publish.ForgePublishError:
                logger.warning("Could not remove the unrecorded %s Release", tag)
            raise
        if after is not None:
            after(tag, commit_sha)
        return {"release": released, "filename": filename, "publish": record}

    # -- internals ------------------------------------------------------

    def _forge(self, project: Mapping[str, Any]) -> forge_publish.Forge:
        forges = self._forges or forge_publish.forge_for
        return forges(str(project.get("repo_url") or ""))

    def _approvals(
        self,
        build: Mapping[str, Any],
        candidate: Mapping[str, Any],
        readiness: Sequence[Mapping[str, Any]],
        actor: Actor,
    ) -> dict[str, Any]:
        build_id = str(build["id"])
        return store.build_approval_state(
            build=build,
            candidate=candidate,
            evidence=self.records.build_evidence(build_id),
            vendor_readiness=readiness,
            designer_row=self.records.latest_review_decision(build_id, "designer"),
            qa_row=self.records.latest_review_decision(build_id, "qa"),
            publish_row=self.records.get_publish_record(build_id),
            actor_email=actor.email,
            actor_role=actor.role,
            unpinned_models=self._unpinned_models(candidate),
        )

    def _unpinned_models(self, candidate: Mapping[str, Any]) -> list[dict[str, str]]:
        """The models an approval or publish of *candidate* must acknowledge."""

        rows = self.records.model_inputs(str(candidate["id"])) if candidate.get("id") else []
        return model_inputs.unpinned_models(candidate, rows)

    def _live_release(
        self, repo_url: str, tag: str, published: Mapping[str, Any] | None
    ) -> dict[str, str] | None:
        """Join the public record by tag. A deleted forge Release looks unpublished."""

        if not tag:
            return None
        try:
            releases = (self._forges or forge_publish.forge_for)(repo_url or None).releases(limit=30)
        except forge_publish.ForgePublishError:
            releases = []
        live = next((row for row in releases if row.get("tag") == tag), None)
        if live is None:
            return None
        url = str(live.get("url") or (published or {}).get("forge_url") or "")
        return {"tag": tag, "url": url}

    def _vendor_pack_assets(
        self,
        build: Mapping[str, Any],
        configuration: Mapping[str, Any],
        zip_filename: str,
    ) -> list[tuple[str, bytes]]:
        from app.release_studio.vendors import VendorPackError, build_vendor_pack, profile_by_id

        stem = zip_filename.removesuffix(".zip")
        assets: list[tuple[str, bytes]] = []
        for vendor_id in configuration.get("vendors") or []:
            try:
                profile = profile_by_id(str(vendor_id))
                pack = build_vendor_pack(
                    str(vendor_id),
                    dossier_bytes=self.archives.artifact_bytes(build.get("dossier_artifact_id")),
                    evidence_bytes=self.archives.evidence_bytes(build),
                )
            except (KeyError, VendorPackError) as exc:
                # The readiness payload says what is missing; archive and
                # parser errors behind it stay in the log.
                logger.warning("Vendor pack %s is not ready to publish: %s", vendor_id, exc)
                raise errors.Conflict(f"Selected vendor pack {vendor_id} is not ready.") from exc
            assets.append((f"{stem}-{profile.pack_filename}", pack))
        return assets


def _tag_is_new(forge: forge_publish.Forge, tag: str) -> bool:
    """Whether *tag* is absent before the publish.

    A forge that cannot answer reads as no, so a rollback never deletes a tag
    Prism did not create.
    """

    try:
        return not forge.tag_exists(tag)
    except forge_publish.ForgePublishError:
        return False


def bound_release_identity(
    configuration: Mapping[str, Any], *, requested_tag: str, requested_notes: str
) -> tuple[str, str]:
    """Resolve the tag and notes from the build, refusing a browser's substitute.

    The build's configuration snapshot is authoritative: those are the values
    document composition printed. A request that names a different tag is a
    stale draft or a hand-rolled call, and publishing it would attach sheets
    that state one revision to a Release named another.
    """

    recorded_tag = str(configuration.get("revision") or "").strip()
    requested = (requested_tag or "").strip()
    if not recorded_tag:
        raise errors.Conflict(
            "This build recorded no tag, so there is no drawing revision to "
            "publish under. Start a new release and name the tag in Identity."
        )
    if requested and requested != recorded_tag:
        raise errors.Conflict(
            f"This build was composed as {recorded_tag}; it cannot be published "
            f"as {requested}. Publish is confirm-only -- start a new build "
            "to release under a different tag."
        )
    # Release notes reach the cover's revision-history table, so the published
    # description comes from the build too rather than from the browser.
    notes = str(configuration.get("release_notes") or "").strip() or requested_notes
    return recorded_tag, notes


def _is_full_git_sha(value: str) -> bool:
    return len(value) == 40 and all(char in "0123456789abcdefABCDEF" for char in value)


__all__ = [
    "BuildArchives",
    "ReleasePublisher",
    "ReleaseRecords",
    "bound_release_identity",
    "forge_summary",
]
