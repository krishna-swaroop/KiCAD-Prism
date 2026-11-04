"""The 3D tab from the design bundle (ADR amendment V2 §2, V2a step 3).

The 3D tab reads a revision's analytic model from its design bundle, never a
mesh (the mesh path went at System Builder v2, stage 0):

- :func:`status` answers the tab's status route in the shape it already reads
  (``prism.webgpu_3d_status_a0``). Opening the revision queues its
  ``design_bundle`` build when the bundle is missing or unfinished, in the
  ordinary queue (V2 Q1), and the readiness follows the bundle's stages: the
  board shows once stage ``board`` stored the pack, the parts once stage
  ``models`` stored the GLB. There is no mesh fallback (V2 decision 1).
- :func:`document` is the viewer's ``prism.viewer_3d.analytic.a0`` bundle
  document: the pack, the stackup projection and the parts' GLB, named under
  the asset route so the viewer's browser cache keeps them.
- :func:`member` serves those three members by revision key, for that route.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any, Mapping

from app.services import kicad_libraries
from app.services.design_bundle import cli, reader, rows, store
from app.services.design_bundle.manifest import Readiness

STATUS_SCHEMA = "prism.webgpu_3d_status_a0"
READINESS_SCHEMA = "prism.visualizer_readiness.a0"
DOCUMENT_SCHEMA = "prism.viewer_3d.analytic.a0"

PACK = "materialization/board.kmpack"
STACKUP = "projections/stackup.json"
COMPONENTS = "viewer/models/components.glb"
#: The members the 3D tab reads, by the viewer's asset names.
MEMBERS = {"analytic_pack": PACK, "stackup": STACKUP, "components_glb": COMPONENTS}
MEDIA_TYPES = {PACK: "application/octet-stream", STACKUP: "application/json", COMPONENTS: "model/gltf-binary"}

#: The asset route's path segment under which bundle members are served
#: (``/webgpu-3d/assets/{revision key}/{generator}/design-bundle/{member}``).
ASSET_PREFIX = "design-bundle/"

#: Readiness progress per bundle state, for the tab's progress bar.
_PROGRESS = {"parse": 15, "board": 45, "models": 85}


@dataclass(frozen=True)
class _View:
    """What the tab can show of an opened revision."""

    status: str
    stage: str
    progress: int
    pack: Readiness | None
    parts: Readiness | None
    failure: str | None = None


def _view(opened: reader.OpenedRevision) -> _View:
    if opened.absent:
        return _View("missing", "generating", 0, None, None)
    states = opened.readiness([PACK, STACKUP, COMPONENTS])
    pack, parts = states[PACK], states[COMPONENTS]
    if pack.state in ("failed", "skipped", "not-applicable"):
        return _View("invalid", "generating", 0, pack, parts)
    if pack.state != "ready":
        if opened.failure:  # the build ended failed and is not being retried: stop "building"
            return _View("invalid", "generating", 0, pack, parts, opened.failure)
        return _View("building", "generating", _PROGRESS.get(pack.stage, 0), pack, parts)
    if not parts.final:
        if opened.failure:  # the board stands; the parts will not arrive without a retry
            return _View("ready", "semantic-ready", 100, pack, parts, opened.failure)
        return _View("ready", "board-ready", _PROGRESS["models"], pack, parts)
    return _View("ready", "semantic-ready", 100, pack, parts)


def _generator_tag(opened: reader.OpenedRevision) -> dict[str, str]:
    document: Mapping[str, Any] = cli.generator().document
    return {"name": "prism-kicad", "version": str(document.get("crate_version", "")), "build": opened.generator_digest[:12]}


def _job_id(opened: reader.OpenedRevision) -> str | None:
    if not (opened.job_active and opened.bundle_key):
        return None
    bundle = rows.get_bundle(opened.project_id, opened.bundle_key)
    return str(bundle["job_id"]) if bundle and bundle.get("job_id") else None


def _models_tag(opened: reader.OpenedRevision) -> str:
    """Changes when the parts are exported again with other libraries, so the tab reloads the viewer."""

    stored_as = opened.archive_revision_key or opened.revision_key
    record = store.read_models_record(opened.project_id, stored_as, opened.generator_digest) if stored_as else None
    if record is None:
        return ""
    return hashlib.sha256(json.dumps(record["variables"], sort_keys=True).encode("utf-8")).hexdigest()[:8]


def _variable_report(opened: reader.OpenedRevision) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """The path variables the board's models name that this server does not define, and the files missing under those it does.

    From the record the models stage wrote; a bundle with none says nothing.
    """

    stored_as = opened.archive_revision_key or opened.revision_key
    record = store.read_models_record(opened.project_id, stored_as, opened.generator_digest) if stored_as else None
    if record is None:
        return [], []
    used = {str(name): int(count) for name, count in (record.get("models") or {}).items()}
    defined = kicad_libraries.current().fingerprints(used)
    unresolved = [{"variable": name, "models": count} for name, count in sorted(used.items()) if defined[name] is None]
    missing = [
        {"variable": str(name), "models": int(count)}
        for name, count in sorted((record.get("missing") or {}).items())
        if int(count) > 0 and defined.get(str(name)) is not None
    ]
    return unresolved, missing


def _message(view: _View) -> str:
    if view.status == "missing":
        return "This revision has no board"
    if view.failure and view.status == "invalid":
        return f"The design bundle could not be built: {view.failure}. Regenerate to try again."
    if view.failure:
        return f"The parts could not be exported: {view.failure}. Regenerate to try again."
    if view.status == "invalid" and view.pack is not None:
        return f"The board could not be materialized: {view.pack.detail or view.pack.state}"
    if view.status == "building" and view.pack is not None:
        return f"Waiting for stage {view.pack.stage} of the design bundle"
    if view.stage == "board-ready":
        return "Board ready; parts are still being exported"
    return ""


def status(project_id: str, commit: str | None, *, requested_by: str = "") -> dict[str, Any]:
    """The tab's status for ``project_id`` at ``commit``, queueing the bundle's build when it needs one."""

    opened = reader.open_revision(project_id, commit, queue=True, requested_by=requested_by)
    if reader.models_outdated(opened) and reader.refresh_models(opened, requested_by=requested_by):
        # The board stays on screen: only the parts are exported again.
        opened = reader.open_revision(project_id, commit, queue=False)
    view = _view(opened)
    unresolved, missing = _variable_report(opened)
    revision_key = opened.revision_key or ""
    available = view.status == "ready"
    answer: dict[str, Any] = {
        "schema": STATUS_SCHEMA,
        "status": view.status,
        "available": available,
        "sourceRevisionKey": revision_key,
        "source_fingerprint": revision_key,
        "build_fingerprint": opened.generator_digest,
        "commit": opened.commit,
        "generator": _generator_tag(opened),
        "readiness": {
            "schema": READINESS_SCHEMA,
            "stage": view.stage,
            "progress": view.progress,
            "available_assets": [name for name, path in MEMBERS.items() if _ready(view, path)],
            # Changes whenever the tab must reload the viewer: a new bundle or a new stage.
            "revision": ":".join(filter(None, [opened.bundle_key or revision_key, view.stage, _models_tag(opened)])),
        },
        "job_id": _job_id(opened),
        "unresolvedVariables": unresolved,
        "missingModels": missing,
        "refreshing": bool(opened.job_active and view.parts is not None and view.parts.state == "ready"),
    }
    message = _message(view)
    if message:
        answer["message"] = message
    if view.status == "invalid":
        answer["error"] = message
    if available:
        query = f"?commit={opened.commit}" if opened.commit else ""
        answer["bundle_url"] = f"/api/projects/{project_id}/webgpu-3d/analytic{query}"
    return answer


def _ready(view: _View, path: str) -> bool:
    if path == PACK:
        return view.pack is not None and view.pack.state == "ready"
    if path == COMPONENTS:
        return view.parts is not None and view.parts.state == "ready"
    # The stackup is a parse projection: ready with the pack.
    return _ready(view, PACK)


def document(project_id: str, commit: str | None) -> dict[str, Any] | None:
    """The viewer's analytic bundle document, or ``None`` until the pack is stored."""

    opened = reader.open_revision(project_id, commit, queue=False)
    view = _view(opened)
    if view.status != "ready" or not opened.revision_key:
        return None
    states = opened.readiness([STACKUP])
    assets = {"analytic_pack": PACK}
    if states[STACKUP].state == "ready":
        assets["stackup"] = STACKUP
    if view.parts is not None and view.parts.state == "ready":
        assets["components_glb"] = COMPONENTS
    return {
        "schema": DOCUMENT_SCHEMA,
        # The lowered-slice cache's key: one pack per bundle key, for good.
        "cache_key": opened.bundle_key or opened.revision_key,
        "readiness": {"stage": view.stage, "progress": view.progress},
        "asset_base": f"/api/projects/{project_id}/webgpu-3d/assets/{opened.revision_key}/{opened.generator_digest}/{ASSET_PREFIX}",
        "assets": assets,
    }


def member(project_id: str, revision_key: str, generator_digest: str, path: str) -> tuple[bytes, str] | None:
    """A 3D member's verified bytes and media type, by revision key; ``None`` when not stored."""

    if path not in MEDIA_TYPES:
        return None
    opened = reader.open_revision_key(project_id, revision_key, generator_digest)
    if opened is None or opened.readiness([path])[path].state != "ready":
        return None
    return opened.read(path), MEDIA_TYPES[path]
