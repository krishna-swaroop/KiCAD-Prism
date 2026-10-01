"""System Builder application service: the SYS-04 CRUD surface of §8.

Each public method runs in one transaction, authorizes the caller against the
system (§8.2), applies O1 redaction, and turns ``SystemStore`` results into
the camelCase documents the API returns. Git lookups run before the
transaction; extraction jobs are enqueued after it commits.

Detection, reviews, validation, snapshots and imports arrive with their own
tickets (SYS-06 to SYS-10) and extend this service.

Documents are built unredacted (``_build``) and redacted for the reader last
(``redaction``), so a snapshot can freeze one document and serve it to any
reader later (§9.1).
"""

from __future__ import annotations

import json
import logging
import re
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Collection, ContextManager, Iterator, Mapping, Optional, Sequence

from app.core.roles import Role
from app.services.systems import (
    child_drift, csv_import, drift, exports as exports_module, exposure, generators, hierarchy, icd,
    harnesses as harnesses_module, manifest as manifest_io, mating as mating_module, reconcile, redaction, sources, system_nets, validation,
    scene as scene_module, visibility,
)
from app.services.systems.bundles import BundleSource
from app.services.systems.placement import poses as placement_poses
from app.services.systems.manifest_schema import digests as manifest_digests
from app.services.systems.interface_extractor import EXTRACTOR_VERSION
from app.services.systems.jobs import (
    EXTRACT_JOB_KIND,
    artifact_key,
    enqueue_extraction,
    workspace_connection,
)
from app.services.systems.store import Conflict, Forbidden, Invalid, NotFound, SystemStore, new_id

logger = logging.getLogger(__name__)

MAX_LAYOUT_ENTRIES = 1000
_FULL_SHA = re.compile(r"^[0-9a-f]{40}$")
_ACTIVE_JOB_STATES = frozenset({"queued", "running", "retry_wait", "cancel_requested"})
_BUNDLE_BUILDERS = frozenset({"admin", "designer"})  # who may queue a board's 3D bundle (as on its 3D tab)


@dataclass(frozen=True)
class Caller:
    role: Role
    email: str

    @property
    def actor(self) -> str:
        return f"user:{self.email or 'anonymous'}"


@dataclass(frozen=True)
class Result:
    """A payload plus the system version after the call (for the ETag)."""

    body: Any
    system_id: str
    version: int

    @property
    def etag(self) -> str:
        return visibility.etag(self.system_id, self.version)


def _mating_summary(record: Optional[Mapping[str, Any]]) -> Optional[dict]:
    return None if record is None else {k: record[k] for k in ("mode", "axis", "quarterTurns")}


def _iso(value: Any) -> Any:
    return value.isoformat() if isinstance(value, datetime) else value


def _default_project_loader(project_id: str) -> Any:
    # Role-blind by design: every caller authorizes the project first, through
    # ``visibility.project_access`` (``_require_project``/``_open_instance``).
    from app.services.project_service import _workspace_row_to_project
    from app.services.workspace_service import workspace

    row = workspace.get_project_by_id(project_id)
    return _workspace_row_to_project(row) if row else None


def _default_catalog() -> Any:
    from app.services.component_catalog_service import catalog_service

    return catalog_service


def _default_enqueue_check(instance_id: str, project_id: str, *, requested_by: str) -> Mapping[str, Any]:
    from app.services.systems.detection import enqueue_instance_check

    return enqueue_instance_check(instance_id, project_id, requested_by=requested_by)


class SystemService:
    def __init__(
        self,
        *,
        connect: Callable[[], ContextManager[Any]] = workspace_connection,
        project_loader: Callable[[str], Any] = _default_project_loader,
        enqueue: Callable[..., Mapping[str, Any]] = enqueue_extraction,
        enqueue_check: Callable[..., Mapping[str, Any]] | None = None,
        catalog: Callable[[], Any] = _default_catalog,
        bundles: Any = None,
    ) -> None:
        self._catalog = catalog
        self._bundles = bundles or BundleSource()
        self._connect = connect
        self._load_project = project_loader
        self._enqueue = enqueue
        self._enqueue_check = enqueue_check or _default_enqueue_check

    # ------------------------------------------------------------------
    # Plumbing

    @contextmanager
    def _tx(self) -> Iterator[SystemStore]:
        with self._connect() as conn:
            try:
                yield SystemStore(conn)
                conn.commit()
            except BaseException:
                conn.rollback()
                raise

    def _system(self, store: SystemStore, system_id: str, caller: Caller) -> dict:
        found = visibility.visible_systems(store.conn, caller.role, system_id=system_id)
        if not found:
            raise NotFound("System not found")
        return found[0]

    def _access(self, store: SystemStore, instances: Sequence[dict], caller: Caller) -> dict[str, dict]:
        # Assembly and module instances have no project: they are the parent's own (P2 §5.4).
        return visibility.project_access(store.conn, [i["project_id"] for i in instances if i.get("project_id")],
                                         caller.role)

    def _open_instance(
        self, store: SystemStore, system_id: str, instance_id: str, caller: Caller,
        *, allow_deleted: bool = False,
    ) -> dict:
        """An instance the caller may change; restricted ones are 404 (§8.2).

        ``allow_deleted`` admits an instance restricted only because its project
        was deleted: removing it reveals nothing.
        """

        try:
            instance = store.get_instance(system_id, instance_id)
        except NotFound:
            raise NotFound("Instance not found") from None
        if instance.get("kind", "board") != "board":
            return instance  # the parent's own instance; what it pins is redacted on read, not here
        access = self._access(store, [instance], caller)[instance["project_id"]]
        if not access["visible"] and not (allow_deleted and access["deleted"]):
            raise NotFound("Instance not found")
        return instance

    def _instance_interface(self, store: SystemStore, instance: Mapping[str, Any]) -> Optional[dict]:
        """A board's interface at its baseline, or an assembly's exports as one (P2 §6.1)."""
        if instance.get("kind", "board") == "board":
            return store.get_interface(instance["project_id"], instance["baseline_commit"], EXTRACTOR_VERSION)
        revision = self._catalog_revision(instance["catalog_revision_id"])
        return exports_module.as_interface((revision or {}).get("interface")) if revision else None

    def _interface(self, store: SystemStore, instance: dict) -> dict:
        found = self._instance_interface(store, instance)
        if found is None:
            if instance.get("kind", "board") != "board":
                raise Conflict("the subsystem's catalog revision cannot be read; try again")
            raise Conflict("interface_not_ready: the board interface at this baseline is still being extracted")
        return found

    def _require_project(self, store: SystemStore, project_id: str, caller: Caller) -> Any:
        access = visibility.project_access(store.conn, [project_id], caller.role).get(project_id)
        project = self._load_project(project_id) if access and access["visible"] else None
        if project is None:
            raise NotFound("Project not found")
        return project

    def _enqueue_quietly(self, project_id: str, commit: str, caller: Caller) -> Optional[dict]:
        try:
            return dict(self._enqueue(project_id, commit, requested_by=caller.email))
        except Exception:  # extraction is re-requested by the next read
            logger.exception("Could not enqueue interface extraction for %s@%s", project_id, commit)
            return None

    # ------------------------------------------------------------------
    # Systems

    def list_systems(self, caller: Caller) -> list[dict]:
        with self._tx() as store:
            return visibility.visible_systems(store.conn, caller.role)

    def create_system(
        self, caller: Caller, *, name: str, description: str, folder_id: Optional[str]
    ) -> Result:
        with self._tx() as store:
            if folder_id is not None and not visibility.folder_visible(store.conn, folder_id, caller.role):
                raise Invalid("folderId does not name a folder")
            row = store.create_system(
                name=name, description=description, folder_id=folder_id, actor=caller.actor
            )
            body = self._system(store, row["id"], caller)
        return Result(body, row["id"], body["version"])

    def update_system(
        self, caller: Caller, system_id: str, version: int, fields: Mapping[str, Any]
    ) -> Result:
        with self._tx() as store:
            self._system(store, system_id, caller)
            folder_id = fields.get("folderId", ...)
            if folder_id not in (..., None) and not visibility.folder_visible(
                store.conn, folder_id, caller.role
            ):
                raise Invalid("folderId does not name a folder")
            with store.mutation(system_id, expected_version=version, actor=caller.actor) as change:
                rules = fields.get("optionalRules")
                if rules is not None and not set(rules) <= validation.OPTIONAL_RULES:
                    raise Invalid(f"optionalRules may only name {', '.join(sorted(validation.OPTIONAL_RULES))}")
                store.update_system(
                    change, name=fields.get("name"), description=fields.get("description"),
                    folder_id=folder_id, optional_rules=rules,
                )
            body = self._system(store, system_id, caller)
        return Result(body, system_id, change.version)

    def delete_system(self, caller: Caller, system_id: str, version: int) -> None:
        with self._tx() as store:
            self._system(store, system_id, caller)
            access = self._access(store, store.list_instances(system_id), caller)
            if any(not seen["visible"] for seen in access.values()):
                # Deleting would destroy rows of a board the caller cannot see.
                raise Conflict("system contains restricted boards")
            with store.mutation(system_id, expected_version=version, actor=caller.actor):
                pass
            store.delete_system(system_id)

    # ------------------------------------------------------------------
    # The system document (§8.1)

    def _build(self, store: SystemStore, system: Mapping[str, Any]) -> tuple[dict, list[dict], dict]:
        """The unredacted system document with its full validation report.

        Snapshots freeze exactly this; readers get it through ``redact_document``.
        Also returns the instance rows and their latest extraction jobs.
        """

        system_id = system["id"]
        instances = store.list_instances(system_id)
        links = store.list_links(system_id)
        names = visibility.project_access(store.conn, [i["project_id"] for i in instances], "admin")
        interfaces: dict[str, dict] = {}
        for instance in instances:
            found = store.get_interface(instance["project_id"], instance["baseline_commit"], EXTRACTOR_VERSION)
            if found is not None:
                interfaces[instance["id"]] = found
        pending = [i for i in instances if i["id"] not in interfaces]
        job_state = self._latest_jobs(store, pending)
        for child in store.list_instances(system_id, kinds=("assembly", "module")):
            synthetic = self._instance_interface(store, child)
            if synthetic is not None:
                interfaces[child["id"]] = synthetic
        overrides = {i["id"]: store.list_overrides(i["id"]) for i in instances if i["id"] in interfaces}
        open_reviews = store.list_reviews(system_id, status="open")
        exports = store.list_exports(system_id)
        report = self._validate(store, system_id, instances, links, interfaces, job_state, open_reviews, exports,
                                system.get("optionalRules") or ())
        catalog_docs = [self._catalog_instance_doc(i) for i in store.list_instances(system_id, kinds=("assembly", "module"))]
        report = validation.with_findings(report, validation.child_findings([
            {"instanceId": doc["id"], "releaseStatus": doc["catalog"]["releaseStatus"],
             "openReviewCount": doc["catalog"]["openReviewCount"],
             "blocked": (store.get_source_check(doc["id"]) or {}).get("last_outcome") == "advance_blocked"}
            for doc in catalog_docs
        ]))
        stale = []
        mating = {instance["id"]: store.list_mating(instance["id"]) for instance in instances}
        for instance in instances:
            stored = mating[instance["id"]]
            if not stored or instance["id"] not in interfaces:
                continue
            for port_key, record in sorted(stored.items()):
                component = exposure.component_by_key(interfaces[instance["id"]], port_key)
                if mating_module.is_stale(component, record):
                    stale.append({"instanceId": instance["id"], "portKey": port_key, "mode": record["mode"],
                                  "reference": (component or {}).get("reference")})
        report = validation.with_findings(report, validation.mating_findings(stale))
        harness_rows = store.list_harnesses(system_id)
        harness_docs = []
        for harness in harness_rows:
            components = self._end_components(store, harness, interfaces)
            harness_docs.append(self._harness_doc(harness, components))
            report = validation.with_findings(report, harnesses_module.findings(
                harness, components, {i["id"]: store.list_overrides(i["id"]) for i in instances},
                system.get("optionalRules") or (), validation.make_finding))
        report = validation.with_findings(report, self._mate_pair_findings(links, harness_rows, interfaces))
        review_rows = sorted({rid for review in open_reviews for item in review["items"] for rid in item["row_ids"]})
        return {
            "system": dict(system),
            "instances": [
                self._instance_doc(i, names.get(i["project_id"]), interfaces.get(i["id"]),
                                   overrides.get(i["id"], {}),
                                   job_state.get(artifact_key(i["project_id"], i["baseline_commit"])))
                for i in instances
            ] + catalog_docs,
            "links": [self._link_doc(link, interfaces, overrides, mating) for link in links],
            "exports": [self._export_doc(export, interfaces, overrides) for export in exports],
            "harnesses": harness_docs,
            "openReviewCount": system["openReviewCount"],
            "findingCounts": report["counts"],
            "validation": report,
            "reviewRowIds": review_rows,
        }, instances, job_state

    def document(self, caller: Caller, system_id: str) -> Result:
        with self._tx() as store:
            system = self._system(store, system_id, caller)
            built, instances, job_state = self._build(store, system)
            restricted = self._restricted_instances(store, system_id, caller)
        ready = {i["id"] for i in built["instances"] if i["interface"]["status"] == "ready"}
        for instance in instances:
            key = artifact_key(instance["project_id"], instance["baseline_commit"])
            if (instance["id"] not in ready and instance["id"] not in restricted
                    and key not in job_state and instance["resolution"] == "resolved"):
                self._enqueue_quietly(instance["project_id"], instance["baseline_commit"], caller)
        body = {k: v for k, v in built.items() if k not in ("validation", "reviewRowIds")}
        return Result(redaction.redact_document(body, restricted), system_id, system["version"])

    def _validate(
        self, store: SystemStore, system_id: str, instances: Sequence[dict], links: Sequence[dict],
        interfaces: Mapping[str, dict], job_state: Mapping[str, dict], open_reviews: Sequence[dict],
        exports: Sequence[dict] = (), optional_rules: Sequence[str] = (),
    ) -> dict:
        """§7.2 over the live state; an instance's failed extraction makes its source unavailable."""

        unavailable = {}
        for instance in instances:
            job = job_state.get(artifact_key(instance["project_id"], instance["baseline_commit"]))
            if instance["id"] not in interfaces and job and job["status"] in ("failed", "cancelled"):
                unavailable[instance["id"]] = job["error_code"] or "extraction_failed"
        return validation.validate(
            # The full map: board rules read boards only; re-export checks need assemblies (P2 §4).
            instances, links, dict(interfaces),
            {i["id"]: store.list_overrides(i["id"]) for i in instances},
            open_reviews, unavailable=unavailable, exports=exports, optional_rules=optional_rules,
        )

    def validation_report(self, caller: Caller, system_id: str) -> Result:
        """``GET …/validation`` (§7.2), redacted for restricted boards (§8.2)."""

        with self._tx() as store:
            system = self._system(store, system_id, caller)
            built, _instances, _jobs = self._build(store, system)
            restricted = self._restricted_instances(store, system_id, caller)
        return Result(redaction.redact_findings(built["validation"], restricted), system_id, system["version"])

    def _latest_jobs(self, store: SystemStore, instances: Sequence[dict]) -> dict[str, dict]:
        keys = sorted({artifact_key(i["project_id"], i["baseline_commit"]) for i in instances})
        if not keys:
            return {}
        rows = store.conn.execute(
            """
            SELECT DISTINCT ON (artifact_key) id, artifact_key, status, error_code
            FROM ws_jobs
            WHERE kind = %s AND artifact_key = ANY(%s)
            ORDER BY artifact_key, created_at DESC
            """,
            (EXTRACT_JOB_KIND, keys),
        ).fetchall()
        return {row["artifact_key"]: dict(row) for row in rows}

    @staticmethod
    def _interface_state(interface: Optional[dict], job: Optional[dict]) -> dict:
        if interface is not None:
            return {"status": "ready", "digest": interface["digest"], "hasPcb": interface["hasPcb"],
                    "jobId": None, "errorCode": None}
        if job is not None and job["status"] in ("failed", "cancelled"):
            return {"status": "failed", "digest": None, "hasPcb": None,
                    "jobId": str(job["id"]), "errorCode": job["error_code"] or "extraction_failed"}
        return {"status": "pending", "digest": None, "hasPcb": None,
                "jobId": str(job["id"]) if job else None, "errorCode": None}

    def _instance_doc(
        self, instance: dict, access: Optional[dict], interface: Optional[dict],
        overrides: Mapping[str, str], job: Optional[dict],
    ) -> dict:
        tip = instance["tip_commit"]
        return {
            "id": instance["id"],
            "label": instance["label"],
            "restricted": False,
            "projectId": instance["project_id"],
            "projectName": access["name"] if access else None,
            # Not sensitive, and survives redaction: tells a designer the board can be removed.
            "projectDeleted": bool(access and access["deleted"]),
            "baselineCommit": instance["baseline_commit"],
            "trackedRef": instance["tracked_ref"],
            "pinned": instance["pinned"],
            "resolution": instance["resolution"],
            "tipCommit": tip,
            "tipCheckedAt": _iso(instance["tip_checked_at"]),
            "updateAvailable": bool(tip) and tip != instance["baseline_commit"],
            "interface": self._interface_state(interface, job),
            # Exposed ports plus any the user overrode; the full list is GET …/interface.
            "ports": None if interface is None else [
                port for port in exposure.resolve_ports(interface, overrides)
                if port["exposed"] or port["override"] is not None
            ],
        }

    @staticmethod
    def _observed(pin: Optional[dict]) -> Optional[dict]:
        if pin is None:
            return {"present": False, "nets": None, "pcbNets": None, "pinNames": None, "pinTypes": None}
        return {"present": True, "nets": pin["nets"], "pcbNets": pin.get("pcbNets"),
                "pinNames": pin.get("pinNames"), "pinTypes": pin.get("pinTypes")}

    def _link_doc(
        self, link: dict, interfaces: Mapping[str, dict], overrides: Mapping[str, Mapping[str, str]],
        mating: Optional[Mapping[str, Mapping[str, dict]]] = None,
    ) -> dict:
        ends: dict[str, dict] = {}
        pins: dict[str, Optional[dict]] = {}
        for end in ("a", "b"):
            instance_id = link[f"{end}_instance_id"]
            port = dict(link[f"{end}_port"])
            interface = interfaces.get(instance_id)
            component = exposure.component_by_key(interface, port["portKey"]) if interface else None
            ends[end] = {
                "instanceId": instance_id,
                "redacted": False,
                "port": port,
                # An end on a subsystem's export: where it lands inside the child (P2 §6.1).
                "export": dict(component["export"]) if component and component.get("export") else None,
                "resolved": None if interface is None else component is not None,
                "exposed": None if component is None else exposure.is_exposed(
                    component, overrides.get(instance_id, {}).get(component["portKey"])
                ),
                # The port's stored mating frame (CONTRACTS_P2 §15.2), for the ICD's board-to-board table.
                "mating": _mating_summary(((mating or {}).get(instance_id) or {}).get(port["portKey"])),
            }
            pins[end] = exposure.pins_by_pad(component) if component is not None else None

        rows = []
        for row in link["rows"]:
            doc: dict[str, Any] = {"id": row["id"], "signal": row["signal"], "source": row["source"]}
            for end, column in (("a", "A"), ("b", "B")):
                pad = row[f"pin_{end}"]
                doc[f"pin{column}"] = pad
                doc[f"net{column}"] = list(row[f"net_{end}"])
                doc[f"observed{column}"] = (
                    None if pins[end] is None else self._observed(pins[end].get(pad))
                )
            doc["redacted"] = False
            doc["redactedEnds"] = []
            rows.append(doc)
        return {
            "id": link["id"],
            "name": link["name"],
            "harness": link["harness"],
            "type": link.get("type") or "unspecified",
            "stackHeightMm": link.get("stack_height_mm"),
            "a": ends["a"],
            "b": ends["b"],
            "rows": rows,
            "updatedAt": _iso(link["updated_at"]),
        }

    @staticmethod
    def _export_doc(export: Mapping[str, Any], interfaces: Mapping[str, dict],
                    overrides: Mapping[str, Mapping[str, str]]) -> dict:
        port = export["target_port"]
        iid = export["target_instance_id"]
        if port:
            component = exports_module.resolve(interfaces.get(iid), port)
            exposed = None if component is None else exposure.is_exposed(
                component, overrides.get(iid, {}).get(component["portKey"]))
        else:  # a re-export resolves when the pinned revision still exports it
            component = exposure.component_by_key(interfaces[iid], export["target_export_id"] or "") \
                if interfaces.get(iid) else None
            exposed = component is not None
        return {
            "id": export["id"], "name": export["name"], "description": export["description"],
            "instanceId": iid, "portKey": port["portKey"] if port else None,
            "port": dict(port) if port else None, "childExportId": export["target_export_id"],
            "resolved": None if iid not in interfaces else (component is not None and bool(exposed)),
            "redacted": False, "updatedAt": _iso(export["updated_at"]),
        }

    # ------------------------------------------------------------------
    # Exports (CONTRACTS_P2 §4)

    def _export_port(self, store: SystemStore, system_id: str, instance_id: str, port_key: str,
                     caller: Caller) -> dict:
        """The port baseline of an exposed board port at its baseline."""
        instance = self._open_instance(store, system_id, instance_id, caller)
        interface = self._interface(store, instance)
        component = exposure.component_by_key(interface, port_key)
        if component is None:
            raise Invalid("portKey is not a component of this board at its baseline")
        override = store.list_overrides(instance_id).get(component["portKey"])
        if not exposure.is_exposed(component, override):
            raise Conflict("port_not_exposed: this port is not exposed on its board")
        return exposure.port_baseline(component)

    def list_exports(self, caller: Caller, system_id: str) -> list[dict]:
        with self._tx() as store:
            system = self._system(store, system_id, caller)
            built, _instances, _jobs = self._build(store, system)
            restricted = self._restricted_instances(store, system_id, caller)
        return redaction.redact_document(built, restricted)["exports"]

    def create_export(
        self, caller: Caller, system_id: str, version: int, *, name: str, description: str,
        instance_id: str, port_key: Optional[str], child_export_id: Optional[str],
    ) -> Result:
        with self._tx() as store:
            system = self._system(store, system_id, caller)
            with store.mutation(system_id, expected_version=version, actor=caller.actor) as change:
                if port_key is not None:
                    port = self._export_port(store, system_id, instance_id, port_key, caller)
                    row = store.create_export(change, name=name, description=description,
                                              instance_id=instance_id, port=port)
                else:
                    instance = self._open_instance(store, system_id, instance_id, caller)
                    if instance.get("kind") != "assembly":
                        raise Invalid("a re-export needs an assembly instance")
                    if exposure.component_by_key(self._interface(store, instance), child_export_id or "") is None:
                        raise Invalid("childExportId is not an export of this subsystem's revision")
                    row = store.create_export(change, name=name, description=description,
                                              instance_id=instance_id, child_export_id=child_export_id)
                body = self._export_body(store, system, row["id"])
        return Result(body, system_id, change.version)

    def update_export(
        self, caller: Caller, system_id: str, version: int, export_id: str, fields: Mapping[str, Any],
    ) -> Result:
        with self._tx() as store:
            system = self._system(store, system_id, caller)
            with store.mutation(system_id, expected_version=version, actor=caller.actor) as change:
                export = self._visible_export(store, system_id, export_id, caller)
                if "name" in fields or "description" in fields:
                    store.update_export(change, export_id, name=fields.get("name"),
                                        description=fields.get("description"))
                if fields.get("portKey") is not None:
                    instance_id = fields.get("instanceId") or export["target_instance_id"]
                    port = self._export_port(store, system_id, instance_id, fields["portKey"], caller)
                    store.retarget_export(change, export_id, instance_id=instance_id, port=port)
                body = self._export_body(store, system, export_id)
        return Result(body, system_id, change.version)

    def delete_export(self, caller: Caller, system_id: str, version: int, export_id: str) -> Result:
        with self._tx() as store:
            self._system(store, system_id, caller)
            with store.mutation(system_id, expected_version=version, actor=caller.actor) as change:
                self._visible_export(store, system_id, export_id, caller)
                store.delete_export(change, export_id)
        return Result(None, system_id, change.version)

    def _visible_export(self, store: SystemStore, system_id: str, export_id: str, caller: Caller) -> dict:
        export = store.get_export(system_id, export_id)
        try:
            self._open_instance(store, system_id, export["target_instance_id"], caller)
        except NotFound:
            raise NotFound("Export not found") from None
        return export

    def _export_body(self, store: SystemStore, system: Mapping[str, Any], export_id: str) -> dict:
        built, _instances, _jobs = self._build(store, system)
        return next(e for e in built["exports"] if e["id"] == export_id)

    def export_interface(self, caller: Caller, system_id: str, snapshot_id: Optional[str] = None) -> dict:
        """``GET …/export-interface`` (P2 §4.3), live or at a snapshot, redacted for the reader."""

        with self._tx() as store:
            self._system(store, system_id, caller)
            if snapshot_id is None:
                instances = {i["id"]: i for i in store.list_instances(system_id)}
                children = {i["id"]: i for i in store.list_instances(system_id, kinds=("assembly", "module"))}
                exports = store.list_exports(system_id)
                restricted = self._restricted_instances(store, system_id, caller)
            else:
                row = store.get_snapshot(system_id, snapshot_id)
                if row["manifest"] is None:
                    raise NotFound("This snapshot predates manifests")
                manifest = row["manifest"]
                instances = {i["id"]: {"id": i["id"], "project_id": i["projectId"],
                                       "baseline_commit": i["baselineCommit"]}
                             for i in manifest["instances"] if i["kind"] == "board"}
                children = {i["id"]: {"id": i["id"], "kind": i["kind"], "catalog_revision_id": i["catalog"]["revisionId"]}
                            for i in manifest["instances"] if i["kind"] != "board"}
                exports = [{"id": e["id"], "name": e["name"], "description": e["description"],
                            "target_instance_id": e["target"]["instanceId"],
                            "target_port": e["target"].get("port"),
                            "target_export_id": e["target"].get("exportId")} for e in manifest["exports"]]
                restricted = self._restricted_in(store, row["document"], caller)
            interfaces = {iid: store.get_interface(i["project_id"], i["baseline_commit"], EXTRACTOR_VERSION)
                          for iid, i in instances.items()}
            for iid, child in children.items():
                interfaces[iid] = self._instance_interface(store, child)
            overrides = ({iid: store.list_overrides(iid) for iid in instances} if snapshot_id is None else
                         {i["id"]: {o["portKey"]: o["state"] for o in i.get("portOverrides", [])}
                          for i in manifest["instances"] if i["kind"] == "board"})
        missing = [iid for e in exports for iid in [e["target_instance_id"]]
                   if iid in instances and interfaces.get(iid) is None]
        if missing:
            for iid in set(missing):
                self._enqueue_quietly(instances[iid]["project_id"], instances[iid]["baseline_commit"], caller)
            raise Conflict("interface_not_ready: a board behind an export is still being extracted")
        body = exports_module.interface(exports, instances, interfaces, overrides)
        for entry in body["exports"]:
            if entry["occurrence"].lstrip("/") in restricted:
                entry.update({"reference": None, "libId": None, "footprint": None, "redacted": True,
                              "pins": [{"pad": p["pad"], "nets": None, "powerNet": None, "pinNames": None,
                                        "pinTypes": None} for p in entry["pins"]]})
        return body

    # ------------------------------------------------------------------
    # Instances

    def add_instance(
        self, caller: Caller, system_id: str, version: int, *, project_id: str, label: str,
        baseline_commit: Optional[str], tracked_ref: Optional[str], pinned: bool,
    ) -> Result:
        with self._tx() as store:
            self._system(store, system_id, caller)
            project = self._require_project(store, project_id, caller)
        commit = self._resolve_baseline(project, baseline_commit, tracked_ref)
        with self._tx() as store:
            self._system(store, system_id, caller)
            with store.mutation(system_id, expected_version=version, actor=caller.actor) as change:
                row = store.add_instance(
                    change, project_id=project_id, label=label, baseline_commit=commit,
                    tracked_ref=tracked_ref, pinned=pinned,
                )
        self._enqueue_quietly(project_id, commit, caller)
        return Result(self._instance_row(row), system_id, change.version)

    def _resolve_baseline(
        self, project: Any, baseline_commit: Optional[str], tracked_ref: Optional[str]
    ) -> str:
        try:
            if tracked_ref is not None:
                tip = sources.resolve_tracked_ref(project, tracked_ref)
                if tip is None:
                    raise Invalid("trackedRef does not exist in the project repository")
            else:
                tip = None
            if baseline_commit is None:
                if tip is None:
                    raise Invalid("baselineCommit or trackedRef is required")
                return tip  # resolved once (§8.1)
            commit = sources.resolve_commit(project, baseline_commit)
        except sources.SourceError as error:
            raise Invalid(str(error)) from None
        if commit is None:
            raise Invalid("baselineCommit does not exist in the project repository")
        return commit

    @staticmethod
    def _instance_row(row: Mapping[str, Any]) -> dict:
        return {
            "id": row["id"], "label": row["label"], "kind": row.get("kind", "board"), "projectId": row["project_id"],
            "baselineCommit": row["baseline_commit"], "trackedRef": row["tracked_ref"],
            "pinned": row["pinned"], "resolution": row["resolution"],
            "tipCommit": row["tip_commit"], "tipCheckedAt": _iso(row["tip_checked_at"]),
            "catalogComponentId": row.get("catalog_component_id"), "catalogRevisionId": row.get("catalog_revision_id"),
            "follow": row.get("follow"),
        }

    # ------------------------------------------------------------------
    # Assembly and module instances (CONTRACTS_P2 §5)

    def _mate_pair_findings(self, links: Sequence[Mapping[str, Any]], harness_rows: Sequence[Mapping[str, Any]],
                            interfaces: Mapping[str, dict]) -> list[dict]:
        """SYS-V18 (CONTRACTS_P2 §18): a b2b pair, or a harness end's part and its board connector,
        whose two catalog parts are both known and not related by mates-with. Unknown parts: not evaluated."""

        def connector(instance_id: Optional[str], port: Optional[Mapping[str, Any]]) -> Optional[dict]:
            interface = interfaces.get(instance_id) if instance_id else None
            return exposure.component_by_key(interface, port["portKey"]) if interface and port else None

        b2b = [(link, [connector(link[f"{e}_instance_id"], link[f"{e}_port"]) for e in ("a", "b")])
               for link in links if link.get("type") == "b2b"]
        ends = [(harness, end, connector(end["mates_instance_id"], end["mates_port"]))
                for harness in harness_rows for end in harness["ends"]
                if end["catalog_component_id"] and end["mates_instance_id"]]
        mpns = [c["mpn"] for _link, pair in b2b for c in pair if c and c.get("mpn")] + \
               [c["mpn"] for _h, _e, c in ends if c and c.get("mpn")]
        if not mpns:
            return []
        try:
            catalog = self._catalog()
            parts = catalog.parts_by_mpn(mpns)

            def part(component: Optional[Mapping[str, Any]]) -> Optional[str]:
                if not component or not component.get("mpn"):
                    return None
                return (parts.get(component["mpn"].strip().lower()) or {}).get("componentId")

            known = {p for _link, pair in b2b for p in map(part, pair) if p} | \
                    {p for _h, e, c in ends for p in (part(c), e["catalog_component_id"]) if p}
            pairs = catalog.mate_pairs(sorted(known))
        except Exception:  # the catalog is a separate service; findings wait for it
            logger.exception("Could not read catalog mates for SYS-V18")
            return []

        def related(x: str, y: str) -> bool:
            return (min(x, y), max(x, y)) in pairs

        out = []
        for link, pair in b2b:
            ids = [part(c) for c in pair]
            if all(ids) and ids[0] != ids[1] and not related(*ids):
                out.append(validation.make_finding("SYS-V18", link_id=link["id"],
                                                   detail={"partA": ids[0], "partB": ids[1]}))
        for harness, end, component in ends:
            board_part = part(component)
            if board_part and not related(board_part, end["catalog_component_id"]):
                out.append(validation.make_finding(
                    "SYS-V18", instance_id=end["mates_instance_id"], reference=(end["mates_port"] or {}).get("reference"),
                    detail={"harnessId": harness["id"], "endId": end["id"], "part": end["catalog_component_id"],
                            "connectorPart": board_part}))
        return out

    def end_suggestions(self, caller: Caller, system_id: str, harness_id: str, end_id: str) -> dict:
        """``GET …/harnesses/{hid}/ends/{eid}/suggestions`` (§18): the mated connector's part and its known
        partners. Nothing is assigned."""
        with self._tx() as store:
            self._system(store, system_id, caller)
            harness = self._visible_harness(store, system_id, harness_id, caller)
            end = next((e for e in harness["ends"] if e["id"] == end_id), None)
            if end is None:
                raise NotFound("Harness end not found")
            component = self._end_components(store, harness).get(end_id)
        mpn = (component or {}).get("mpn")
        if not mpn:
            return {"endId": end_id, "connectorMpn": None, "connectorPart": None, "suggestions": []}
        try:
            catalog = self._catalog()
            board_part = catalog.parts_by_mpn([mpn]).get(mpn.strip().lower())
            suggestions = catalog.list_mates_with(board_part["componentId"]) if board_part else []
        except Exception:
            logger.exception("Could not read catalog mates for a harness end")
            board_part, suggestions = None, []
        return {"endId": end_id, "connectorMpn": mpn, "connectorPart": board_part, "suggestions": suggestions}

    def _catalog_revision(self, revision_id: str) -> Optional[dict]:
        try:
            return self._catalog().system_revision(revision_id)
        except Exception:  # the catalog is a separate service; documents must still render
            logger.exception("Could not read catalog revision %s", revision_id)
            return None

    def _child_interface(self, revision_id: str) -> Optional[dict]:
        """reconcile.ChildLoader: a catalog revision's exports as an interface artifact."""
        revision = self._catalog_revision(revision_id)
        return exports_module.as_interface(revision.get("interface")) if revision else None

    def advance_child(
        self, actor: str, system_id: str, instance_id: str, revision_id: str, *, auto_kind: str,
        expected_version: Optional[int] = None,
    ) -> dict:
        """Evaluate one catalog revision for one assembly instance and apply §7.2.

        Shared by the release trigger (``child_auto_advanced``) and a manual
        rebase (``child_rebased``). Outcomes: ``at_revision``, ``auto_advanced``,
        ``review_opened``, ``review_current`` or ``advance_blocked`` (§5.3
        limits; reported as SYS-V15).
        """

        revision = self._catalog_revision(revision_id)
        if revision is None:
            raise NotFound("Catalog revision not found")
        with self._tx() as store:
            instance = store.get_instance(system_id, instance_id)
            if instance.get("kind") != "assembly":
                raise Invalid("only assembly instances take catalog revisions")
            if revision["componentId"] != instance["catalog_component_id"]:
                raise Invalid("the revision belongs to another component")
            if instance["catalog_revision_id"] == revision_id:
                return {"outcome": "at_revision", "reviewId": None}
            open_review = store.open_source_review(instance_id)
            if open_review and open_review["to_commit"] == revision_id:
                return {"outcome": "review_current", "reviewId": open_review["id"]}
            # A revision that would break the hierarchy limits is never advanced to (§5.3).
            candidate = {**instance, "catalog_revision_id": revision_id}
            others = [i for i in store.list_instances(system_id, kinds=SystemStore.ALL_KINDS) if i["id"] != instance_id]
            try:
                hierarchy.resolve(system_id, others + [candidate], self._child_loader(store))
            except hierarchy.HierarchyError as error:
                store.record_source_check(instance_id, tip_commit=None, checked_commit=None,
                                          outcome="advance_blocked")
                logger.info("Not advancing %s to %s: %s", instance_id, revision_id, error)
                return {"outcome": "advance_blocked", "reviewId": None, "reason": error.code}
        with self._tx() as store:
            with store.mutation(system_id, expected_version=expected_version, actor=actor) as change:
                current = store.get_instance(system_id, instance_id)
                outcome, review_id = child_drift.apply_child_evaluation(store, change, current, revision,
                                                                        auto_kind=auto_kind)
            store.record_source_check(instance_id, tip_commit=None, checked_commit=None, outcome=outcome)
        return {"outcome": outcome, "reviewId": review_id, "version": change.version}

    def rebase_child(self, caller: Caller, system_id: str, version: int, instance_id: str,
                     revision_id: str) -> Result:
        """``POST …/rebase`` with ``revisionId`` for an assembly instance (§7.1)."""
        with self._tx() as store:
            self._system(store, system_id, caller)
            self._open_instance(store, system_id, instance_id, caller)
        body = self.advance_child(caller.actor, system_id, instance_id, revision_id, auto_kind="child_rebased",
                                  expected_version=version)
        if body["outcome"] == "at_revision":
            raise Conflict("the instance already pins this revision")
        if body["outcome"] == "advance_blocked":
            raise Invalid(f"{body.get('reason')}: the revision would break the hierarchy limits")
        with self._tx() as store:
            row = store.get_instance(system_id, instance_id)
            now = store.get_system(system_id)["version"]
        return Result({"outcome": body["outcome"], "reviewId": body["reviewId"], "instance": self._instance_row(row)},
                      system_id, int(now))

    def _catalog_refs(self, store: SystemStore, system_id: str) -> dict[str, dict]:
        """Pinned catalog revision per assembly/module instance, for the manifest."""
        refs = {}
        for instance in store.list_instances(system_id, kinds=("assembly", "module")):
            revision = self._catalog_revision(instance["catalog_revision_id"])
            if revision is None:
                raise Conflict(f"the catalog revision of {instance['label']} cannot be read; try again")
            refs[instance["id"]] = revision
        return refs

    def _catalog_instance_doc(self, instance: Mapping[str, Any]) -> dict:
        """An assembly/module instance as the document shows it: its exports are its ports."""
        revision = self._catalog_revision(instance["catalog_revision_id"])
        exports = ((revision or {}).get("interface") or {}).get("exports") or []
        latest = (revision or {}).get("latestReleasedRevisionId")
        return {
            "id": instance["id"], "label": instance["label"], "kind": instance["kind"], "restricted": False,
            "projectId": None, "projectName": (revision or {}).get("name"), "projectDeleted": False,
            "baselineCommit": None, "trackedRef": None, "pinned": instance["follow"] == "pinned",
            "resolution": "resolved" if revision else "unresolved", "tipCommit": None, "tipCheckedAt": None,
            "updateAvailable": bool(latest) and latest != instance["catalog_revision_id"],
            "interface": {"status": "ready" if revision else "failed", "digest": None, "hasPcb": None,
                          "jobId": None, "errorCode": None if revision else "catalog_revision_unavailable"},
            "ports": [{
                "portKey": entry.get("id"), "memberKeys": [entry.get("id")], "reference": entry.get("name"),
                "libId": entry.get("libId"), "footprint": entry.get("footprint"), "value": entry.get("reference"),
                "dnp": False, "candidate": True, "candidateReason": "export", "override": None, "exposed": True,
                "pinCount": int(entry.get("pinCount") or 0),
            } for entry in exports],
            "catalog": {
                "componentId": instance["catalog_component_id"], "revisionId": instance["catalog_revision_id"],
                "follow": instance["follow"], "version": (revision or {}).get("version"),
                "releaseStatus": (revision or {}).get("releaseStatus"), "identity": (revision or {}).get("identity"),
                "latestReleasedRevisionId": latest,
                "systemId": ((revision or {}).get("sourceRef") or {}).get("systemId"),
                "snapshotName": ((revision or {}).get("sourceRef") or {}).get("snapshotName"),
                "openReviewCount": int(((revision or {}).get("sourceRef") or {}).get("openReviewCount") or 0),
            },
        }

    def _child_loader(self, store: SystemStore):
        """hierarchy.Loader: catalog revision -> the snapshot it was published from."""

        def load(revision_id: str) -> Optional[hierarchy.ChildSystem]:
            revision = self._catalog_revision(revision_id)
            source = (revision or {}).get("sourceRef") or {}
            if source.get("kind") != "system_snapshot":
                return None
            try:
                row = store.get_snapshot(source["systemId"], source["snapshotId"])
            except (NotFound, KeyError):
                return None
            manifest = row.get("manifest")
            if not manifest:
                return None
            return hierarchy.ChildSystem(source["systemId"], source["snapshotId"], manifest["system"]["name"],
                                         manifest["instances"], manifest.get("exports") or [],
                                         manifest.get("links") or [], manifest.get("harnesses") or [],
                                         (manifest.get("placement") or {}).get("poses") or [])

        return load

    def _tree(self, store: SystemStore, system_id: str, extra: Sequence[Mapping[str, Any]] = ()) -> hierarchy.Tree:
        instances = list(store.list_instances(system_id, kinds=SystemStore.ALL_KINDS)) + list(extra)
        try:
            return hierarchy.resolve(system_id, instances, self._child_loader(store))
        except hierarchy.HierarchyError as error:
            raise Invalid(str(error)) from None

    # ------------------------------------------------------------------
    # System nets (CONTRACTS_P2 §8)

    def _net_groups(self, caller: Caller, system_id: str) -> tuple[list[dict], dict]:
        """Every system net of the tree, redacted for the reader, plus the occurrence index."""
        import hashlib

        occurrences = {o["path"]: o for o in self.hierarchy(caller, system_id)["occurrences"]}
        with self._tx() as store:
            system = self._system(store, system_id, caller)
            instances = store.list_instances(system_id, kinds=SystemStore.ALL_KINDS)
            root = system_nets.Level(
                prefix="", kinds={i["id"]: i["kind"] for i in instances}, labels={i["id"]: i["label"] for i in instances},
                links=store.list_links(system_id), harnesses=store.list_harnesses(system_id),
                exports=[{"id": e["id"], "target": ({"instanceId": e["target_instance_id"], "portKey": e["target_port"]["portKey"],
                                                     "port": e["target_port"]} if e["target_port"]
                                                    else {"instanceId": e["target_instance_id"], "exportId": e["target_export_id"]})}
                         for e in store.list_exports(system_id)],
            )
            system_nets.attach_children(root, self._tree(store, system_id))
        visible = {path for path, o in occurrences.items() if not o["restricted"]}

        def shown(path: Optional[str]) -> bool:
            return path in visible

        def side(point: dict) -> dict:
            # An unmated harness end has no board: nothing to hide, and no path to show.
            path = point["occurrence"]
            return {**point, "displayPath": occurrences[path]["displayPath"] if path else None}

        out = []
        for group in system_nets.build(root):
            members = [({"occurrence": m["occurrence"], "displayPath": occurrences[m["occurrence"]]["displayPath"],
                         "net": m["net"], "redacted": False} if shown(m["occurrence"])
                        else {"occurrence": None, "displayPath": None, "net": None, "redacted": True})
                       for m in group.members]
            hops = []
            for hop in group.hops:
                if not all(hop[s]["occurrence"] is None or shown(hop[s]["occurrence"]) for s in ("from", "to")):
                    continue
                hops.append({**hop, "from": side(hop["from"]), "to": side(hop["to"])})
            if not any(not m["redacted"] for m in members):
                continue  # nothing of it is visible to this reader
            aliases = sorted({system_nets.leaf(m["net"]) for m in members if m["net"] and not system_nets.is_auto(m["net"])})
            out.append({
                "groupId": hashlib.sha1(group.group_id.encode()).hexdigest()[:16],
                "name": aliases[0] if aliases else next((m["net"] for m in members if m["net"]), "unconnected"),
                "aliases": aliases, "pinCount": group.pin_count, "large": group.pin_count > system_nets.LARGE_GROUP_PINS,
                "members": members, "hops": hops,
            })
        return out, occurrences

    def nets(self, caller: Caller, system_id: str, *, search: str = "", occurrence: Optional[str] = None,
             limit: int = 50) -> dict:
        """``GET …/nets``: system nets matching ``search`` (any alias), optionally touching one board occurrence."""
        groups, _occurrences = self._net_groups(caller, system_id)
        needle = search.strip().casefold()
        found = []
        for group in groups:
            if needle and not any(needle in alias.casefold() for alias in group["aliases"]) and not any(
                    needle in (m["net"] or "").casefold() for m in group["members"]):
                continue
            if occurrence and not any(m["occurrence"] == occurrence for m in group["members"]):
                continue
            found.append({k: group[k] for k in ("groupId", "name", "aliases", "pinCount", "large")}
                         | {"boards": len({m["occurrence"] for m in group["members"] if m["occurrence"]})})
        found.sort(key=lambda g: (g["name"].casefold(), g["groupId"]))
        return {"systemId": system_id, "groups": found[:limit], "total": len(found)}

    def net(self, caller: Caller, system_id: str, group_id: str) -> dict:
        """``GET …/nets/{groupId}``: one system net with its members and hops."""
        groups, _occurrences = self._net_groups(caller, system_id)
        found = next((g for g in groups if g["groupId"] == group_id), None)
        if found is None:
            raise NotFound("System net not found")
        return found

    def add_catalog_instance(
        self, caller: Caller, system_id: str, version: int, *, kind: str, label: str, component_id: str,
        revision_id: Optional[str], follow: str,
    ) -> Result:
        """Add an assembly (or, M6, module) instance pinning one catalog revision (§5.1)."""

        from app.core.roles import CATALOG_BROWSE_ROLES

        if caller.role not in CATALOG_BROWSE_ROLES:
            raise Forbidden("adding a catalog item needs catalog read access")
        catalog = self._catalog()
        revision = (catalog.system_revision(revision_id) if revision_id
                    else catalog.released_system_revision(component_id))
        if revision is None:
            raise Conflict("no_released_revision: the component has no released revision; pick one explicitly")
        if revision["componentId"] != component_id:
            raise Invalid("revisionId does not belong to componentId")
        if revision["kind"] != kind:
            raise Invalid(f"component is a {revision['kind']}, not a {kind}")
        if not revision["active"]:
            raise Conflict("the component has been retired")
        with self._tx() as store:
            self._system(store, system_id, caller)
            with store.mutation(system_id, expected_version=version, actor=caller.actor) as change:
                row = store.add_catalog_instance(change, kind=kind, label=label, component_id=component_id,
                                                 revision_id=revision["revisionId"], follow=follow)
                self._tree(store, system_id)  # refuses a cycle or a limit before anything commits
        return Result(self._instance_row(row), system_id, change.version)

    def hierarchy(self, caller: Caller, system_id: str) -> dict:
        """``GET …/hierarchy`` (§11): every occurrence, redacted for the reader (§5.4)."""

        with self._tx() as store:
            self._system(store, system_id, caller)
            tree = self._tree(store, system_id)
            projects = {o.project_id for o in tree.boards if o.project_id}
            access = visibility.project_access(store.conn, projects, caller.role)
            hidden_systems = {o.child_system_id for o in tree.occurrences
                              if o.child_system_id and not visibility.visible_systems(
                                  store.conn, caller.role, system_id=o.child_system_id)}
        out = []
        hidden_prefixes: list[str] = []
        for occurrence in tree.occurrences:
            if any(occurrence.path.startswith(prefix + "/") for prefix in hidden_prefixes):
                continue  # inside a child system the reader cannot see (S7)
            entry = occurrence.as_dict()
            entry["restricted"] = False
            if occurrence.kind == "board" and not access.get(occurrence.project_id, {}).get("visible", False):
                entry.update(restricted=True, projectId=None, baselineCommit=None)
            if occurrence.child_system_id in hidden_systems:
                entry.update(restricted=True, childSystemId=None, childSnapshotId=None)
                hidden_prefixes.append(occurrence.path)
            out.append(entry)
        return {"systemId": system_id, "occurrences": out,
                "boardCount": sum(1 for o in tree.occurrences if o.kind == "board")}

    def scene(self, caller: Caller, system_id: str) -> dict:
        """``GET …/scene`` (§20): every occurrence placed, with the board bundles to draw them.

        A visible board whose bundle is missing gets a build queued when the reader
        may generate bundles (designer or admin, as on the board's 3D tab).
        """

        shown = {o["path"]: o for o in self.hierarchy(caller, system_id)["occurrences"]}
        with self._tx() as store:
            version = int(self._system(store, system_id, caller)["version"])
            tree = self._tree(store, system_id)
            # Only the outline and thickness: a full artifact is megabytes per board.
            interfaces = {(o.project_id, o.baseline_commit): store.get_interface_extent(o.project_id, o.baseline_commit,
                                                                                        EXTRACTOR_VERSION)
                          for o in tree.boards if o.project_id and o.baseline_commit}
            stored = store.list_poses(system_id)
        for (project_id, commit), found in interfaces.items():
            if found is None:  # not extracted yet, or by an older extractor: the bounds come with it
                self._enqueue_quietly(project_id, commit, caller)
        assets: dict[tuple[str, str], dict] = {}

        def asset(occurrence: hierarchy.Occurrence) -> dict:
            key = (occurrence.project_id, occurrence.baseline_commit)
            if key not in assets:
                assets[key] = self._scene_asset(caller, *key)
            return assets[key]

        return scene_module.build(system_id, version, tree.occurrences, shown,
                                  lambda o: interfaces.get((o.project_id, o.baseline_commit)), asset, stored)

    def _scene_asset(self, caller: Caller, project_id: str, commit: str) -> dict:
        entry = {"assetId": scene_module.asset_id(project_id, commit), "projectId": project_id, "commit": commit,
                 "status": "missing", "bundleUrl": None, "sourceRevisionKey": None, "generatorBuild": None,
                 "jobId": None, "error": None, "bundleToBoard": None}
        project = self._load_project(project_id)
        if project is None:
            return {**entry, "status": "failed"}
        try:
            status = self._bundles.status(project, commit)
        except Exception:
            logger.exception("Could not read the 3D bundle status of %s@%s", project_id, commit)
            return {**entry, "status": "failed"}
        if status.get("available"):
            entry.update(status="ready" if status.get("status") == "ready" else "building",
                         bundleUrl=status.get("bundle_url"), sourceRevisionKey=status.get("sourceRevisionKey"),
                         generatorBuild=status.get("build_fingerprint"),
                         bundleToBoard=scene_module.bundle_to_board(self._bundles.mid_plane_mm(project_id, status)))
            return entry
        try:
            last = self._bundles.last_build(project_id, commit)
        except Exception:
            logger.exception("Could not read the 3D bundle jobs of %s@%s", project_id, commit)
            last = None
        if last and last["status"] in _ACTIVE_JOB_STATES:
            return {**entry, "status": "building", "jobId": last["jobId"]}
        if last and last["status"] in ("failed", "cancelled"):
            # Never re-queued by a read: a retry is a deliberate Regenerate on the board's 3D tab.
            return {**entry, "status": "failed", "jobId": last["jobId"], "error": last["error"]}
        if caller.role in _BUNDLE_BUILDERS:
            try:
                entry.update(status="building", jobId=self._bundles.build(project_id, commit, requested_by=caller.email))
            except Exception:
                logger.exception("Could not queue a 3D bundle for %s@%s", project_id, commit)
        return entry

    def update_instance(
        self, caller: Caller, system_id: str, version: int, instance_id: str,
        fields: Mapping[str, Any],
    ) -> Result:
        with self._tx() as store:
            kind = self._open_instance(store, system_id, instance_id, caller).get("kind", "board")
        if kind != "board":
            if {"trackedRef", "pinned"} & set(fields):
                raise Invalid("assembly and module instances follow catalog revisions; use follow")
            with self._tx() as store:
                self._system(store, system_id, caller)
                with store.mutation(system_id, expected_version=version, actor=caller.actor) as change:
                    row = store.update_instance(change, instance_id, label=fields.get("label"))
                    if fields.get("follow") is not None:
                        store.set_follow(change, instance_id, fields["follow"])
                        row = store.get_instance(system_id, instance_id)
            return Result(self._instance_row(row), system_id, change.version)
        if fields.get("follow") is not None:
            raise Invalid("a board follows its tracked branch, not catalog revisions")
        tracked_ref = fields.get("trackedRef", ...)
        if tracked_ref not in (..., None):
            with self._tx() as store:
                self._system(store, system_id, caller)
                instance = self._open_instance(store, system_id, instance_id, caller)
                project = self._require_project(store, instance["project_id"], caller)
            try:
                if sources.resolve_tracked_ref(project, tracked_ref) is None:
                    raise Invalid("trackedRef does not exist in the project repository")
            except sources.SourceError as error:
                raise Invalid(str(error)) from None
        with self._tx() as store:
            self._system(store, system_id, caller)
            with store.mutation(system_id, expected_version=version, actor=caller.actor) as change:
                before = self._open_instance(store, system_id, instance_id, caller)
                row = store.update_instance(
                    change, instance_id, label=fields.get("label"), pinned=fields.get("pinned"),
                    tracked_ref=tracked_ref,
                )
        resumed = before["pinned"] and not row["pinned"]
        if row["tracked_ref"] and (resumed or row["tracked_ref"] != before["tracked_ref"]):
            # Evaluate the branch now rather than at the next fetch.
            try:
                self._enqueue_check(instance_id, row["project_id"], requested_by=caller.email)
            except Exception:
                logger.exception("Could not enqueue a source check for instance %s", instance_id)
        return Result(self._instance_row(row), system_id, change.version)

    def remove_instance(
        self, caller: Caller, system_id: str, version: int, instance_id: str, *, cascade: bool
    ) -> Result:
        with self._tx() as store:
            self._system(store, system_id, caller)
            with store.mutation(system_id, expected_version=version, actor=caller.actor) as change:
                self._open_instance(store, system_id, instance_id, caller, allow_deleted=True)
                if cascade:
                    self._require_open_links(store, system_id, caller, instance_id=instance_id)
                store.remove_instance(change, instance_id, cascade_links=cascade)
        return Result(None, system_id, change.version)

    def _require_open_links(
        self, store: SystemStore, system_id: str, caller: Caller, *, instance_id: str
    ) -> None:
        """Cascading must not delete a link whose other end the caller cannot see."""

        instances = {i["id"]: i for i in store.list_instances(system_id, kinds=SystemStore.ALL_KINDS)}
        access = self._access(store, list(instances.values()), caller)
        for link in store.list_links(system_id):
            if instance_id not in (link["a_instance_id"], link["b_instance_id"]):
                continue
            for other in (link["a_instance_id"], link["b_instance_id"]):
                if other == instance_id or instances[other]["kind"] != "board":
                    continue
                if not access[instances[other]["project_id"]]["visible"]:
                    raise NotFound("Link not found")

    def interface(
        self, caller: Caller, system_id: str, instance_id: str, commit: Optional[str]
    ) -> tuple[str, dict]:
        """``("ready", body)`` or ``("queued", job)`` (§8.1 ``202``)."""

        with self._tx() as store:
            self._system(store, system_id, caller)
            instance = self._open_instance(store, system_id, instance_id, caller)
            if instance.get("kind", "board") != "board":
                if commit is not None:
                    raise Invalid("a subsystem has no commits; it pins a catalog revision")
                body = dict(self._interface(store, instance))
                body["components"] = [{**c, "override": None, "exposed": True} for c in body["components"]]
                return "ready", {**body, "instanceId": instance_id, "atBaseline": True}
            target = instance["baseline_commit"]
            if commit is not None:
                target = commit.strip().lower()
                if not _FULL_SHA.match(target):
                    raise Invalid("commit must be a full 40-character SHA")
            found = store.get_interface(instance["project_id"], target, EXTRACTOR_VERSION)
            overrides = store.list_overrides(instance_id)
        if found is not None:
            ports = {p["portKey"]: p for p in exposure.resolve_ports(found, overrides)}
            body = dict(found)
            body["components"] = [
                {**component, "override": ports[component["portKey"]]["override"],
                 "exposed": ports[component["portKey"]]["exposed"]}
                for component in found.get("components") or []
            ]
            body["instanceId"] = instance_id
            body["atBaseline"] = target == instance["baseline_commit"]
            return "ready", body
        if target != instance["baseline_commit"]:
            project = self._load_project(instance["project_id"])
            try:
                exists = project is not None and sources.resolve_commit(project, target) == target
            except sources.SourceError:
                exists = False
            if not exists:
                raise NotFound("Commit not found")
        job = self._enqueue(instance["project_id"], target, requested_by=caller.email)
        return "queued", {"job_id": str(job["job_id"]), "status": job["status"]}

    def check_now(self, caller: Caller, system_id: str, instance_id: str) -> dict:
        """``POST …/check`` (§8.1): queue detection for one instance now."""

        with self._tx() as store:
            self._system(store, system_id, caller)
            instance = self._open_instance(store, system_id, instance_id, caller)
        if not instance["tracked_ref"]:
            raise Conflict("instance does not track a branch")
        job = self._enqueue_check(instance_id, instance["project_id"], requested_by=caller.email)
        return {"job_id": str(job["job_id"]), "status": job["status"]}

    def set_override(
        self, caller: Caller, system_id: str, version: int, instance_id: str, port_key: str,
        state: Optional[str],
    ) -> Result:
        with self._tx() as store:
            self._system(store, system_id, caller)
            with store.mutation(system_id, expected_version=version, actor=caller.actor) as change:
                instance = self._open_instance(store, system_id, instance_id, caller)
                if instance.get("kind", "board") != "board":
                    raise Invalid("a subsystem's exports are always ports; hide or promote them in the child system")
                interface = self._interface(store, instance)
                component = next(
                    (c for c in interface.get("components") or [] if c["portKey"] == port_key), None
                )
                if component is None:
                    raise Invalid("portKey is not a component of this board at its baseline")
                if state == "promoted" and not exposure.is_annotated(component["reference"]):
                    raise Invalid("an unannotated component cannot be promoted")
                store.set_override(change, instance_id, port_key, state)
                summary = exposure.port_summary(component, state)
        return Result(summary, system_id, change.version)

    # ------------------------------------------------------------------
    # Mating frames (CONTRACTS_P2 §15)

    def _mating_board(self, store: SystemStore, system_id: str, instance_id: str, caller: Caller) -> tuple[dict, dict]:
        instance = self._open_instance(store, system_id, instance_id, caller)
        if instance.get("kind", "board") != "board":
            raise Invalid("a subsystem's connector frames are frozen in its snapshot; change them in the child system")
        return instance, self._interface(store, instance)

    def mating(self, caller: Caller, system_id: str, instance_id: str) -> dict:
        """``GET …/instances/{iid}/mating``: every exposed port's inference and stored frame."""
        with self._tx() as store:
            self._system(store, system_id, caller)
            _instance, interface = self._mating_board(store, system_id, instance_id, caller)
            stored = store.list_mating(instance_id)
            overrides = store.list_overrides(instance_id)
        exposed = {p["portKey"] for p in exposure.resolve_ports(interface, overrides) if p["exposed"]}
        ports = [mating_module.port_state(component, stored.get(component["portKey"]))
                 for component in interface.get("components") or [] if component["portKey"] in exposed]
        return {"instanceId": instance_id, "boardThicknessMm": interface.get("boardThicknessMm"), "ports": ports}

    def set_mating(
        self, caller: Caller, system_id: str, version: int, instance_id: str, port_key: str,
        fields: Optional[Mapping[str, Any]],
    ) -> Result:
        """``PUT`` (``fields``) or ``DELETE`` (``None``) one port's stored frame."""
        with self._tx() as store:
            self._system(store, system_id, caller)
            with store.mutation(system_id, expected_version=version, actor=caller.actor) as change:
                _instance, interface = self._mating_board(store, system_id, instance_id, caller)
                component = exposure.component_by_key(interface, port_key)
                if component is None or component["portKey"] != port_key:
                    raise Invalid("portKey is not a component of this board at its baseline")
                record = None if fields is None else mating_module.record_for(
                    component, fields.get("mode"), fields.get("axis"), fields.get("quarterTurns"))
                store.set_mating(change, instance_id, port_key, record)
                body = mating_module.port_state(component, store.list_mating(instance_id).get(port_key))
        return Result(body, system_id, change.version)

    # ------------------------------------------------------------------
    # Poses (CONTRACTS_P2 §14.3)

    def poses(self, caller: Caller, system_id: str) -> dict:
        """``GET …/poses``: the stored poses of this system's own instances. An instance
        not listed takes its default pose (the scene shows where that is)."""
        with self._tx() as store:
            version = int(self._system(store, system_id, caller)["version"])
            stored = store.list_poses(system_id)
        return {"systemId": system_id, "version": version,
                "poses": [{"instanceId": key, **value} for key, value in stored.items()]}

    def set_pose(
        self, caller: Caller, system_id: str, version: int, instance_id: str,
        fields: Optional[Mapping[str, Any]],
    ) -> Result:
        """``PUT`` (``fields``: ``translationMm``, ``rotation``) or ``DELETE`` (``None``) one
        instance's pose. Users store ``manual`` poses; the solve (M4) stores ``auto`` ones."""
        if fields is None:
            pose = None
        else:
            try:
                pose = {**placement_poses.pose_from(fields["translationMm"], fields["rotation"]), "source": "manual"}
            except ValueError as error:
                raise Invalid(str(error)) from error
        with self._tx() as store:
            self._system(store, system_id, caller)
            with store.mutation(system_id, expected_version=version, actor=caller.actor) as change:
                store.set_pose(change, instance_id, pose)
                stored = store.list_poses(system_id).get(instance_id)
        body = {"instanceId": instance_id, **stored} if stored else {"instanceId": instance_id, "source": "default"}
        return Result(body, system_id, change.version)

    def reset_poses(self, caller: Caller, system_id: str, version: int) -> Result:
        """``DELETE …/poses``: every manual pose goes back to its default (D-P2-14)."""
        with self._tx() as store:
            self._system(store, system_id, caller)
            with store.mutation(system_id, expected_version=version, actor=caller.actor) as change:
                reset = store.reset_poses(change)
        return Result({"reset": reset}, system_id, change.version)

    # ------------------------------------------------------------------
    # Harnesses (CONTRACTS_P2 §17)

    def _end_components(self, store: SystemStore, harness: Mapping[str, Any],
                        interfaces: Optional[Mapping[str, dict]] = None) -> dict[str, Optional[dict]]:
        """``end ID -> mated component`` (None when it no longer resolves). Ends whose board
        interface is not extracted yet, and unmated ends, are left out."""
        out: dict[str, Optional[dict]] = {}
        for end in harness["ends"]:
            if not end["mates_instance_id"] or not end["mates_port"]:
                continue
            if interfaces is not None:
                interface = interfaces.get(end["mates_instance_id"])
            else:
                interface = self._instance_interface(store, store.get_instance(harness["system_id"], end["mates_instance_id"]))
            if interface is None:
                continue
            out[end["id"]] = exposure.component_by_key(interface, end["mates_port"]["portKey"])
        return out

    @staticmethod
    def _harness_doc(harness: Mapping[str, Any], components: Mapping[str, Optional[dict]]) -> dict:
        ends = []
        for end in harness["ends"]:
            component = components.get(end["id"])
            mates = None
            if end["mates_instance_id"] and end["mates_port"]:
                mates = {"instanceId": end["mates_instance_id"], "portKey": end["mates_port"]["portKey"],
                         "port": dict(end["mates_port"]), "redacted": False,
                         "resolved": None if end["id"] not in components else component is not None}
            ends.append({
                "id": end["id"], "ordinal": end["ordinal"], "mates": mates,
                "part": harnesses_module.part_ref(end),
                "pinCount": end["pin_count"], "pinMap": end["pin_map"], "bootMm": end["boot_mm"],
                "pins": harnesses_module.end_pins(end, component),
                # The mated connector's pads, for the pin map (SB2-18).
                "matePads": sorted(exposure.pins_by_pad(component), key=drift.pad_sort_key) if component else [],
            })
        wires = [{
            "id": wire["id"], "from": {"end": wire["from_end"], "pin": wire["from_pin"]},
            "to": {"end": wire["to_end"], "pin": wire["to_pin"]}, "signal": wire["signal"],
            "gaugeAwg": wire["gauge_awg"], "colour": wire["colour"], "label": wire["label"],
            "netFrom": list(wire["net_from"]), "netTo": list(wire["net_to"]), "redactedEnds": [],
        } for wire in harness["wires"]]
        return {"id": harness["id"], "name": harness["name"], "label": harness["label"],
                "cutLengthMm": harness["cut_length_mm"], "serviceAllowancePct": harness["service_allowance_pct"],
                "linkable": harnesses_module.is_linkable(harness), "ends": ends, "wires": wires,
                "updatedAt": _iso(harness["updated_at"])}

    def _harness_body(self, store: SystemStore, system_id: str, harness_id: str, caller: Caller) -> dict:
        harness = store.get_harness(system_id, harness_id)
        body = self._harness_doc(harness, self._end_components(store, harness))
        return redaction.redact_harness(body, self._restricted_instances(store, system_id, caller))

    def _visible_harness(self, store: SystemStore, system_id: str, harness_id: str, caller: Caller) -> dict:
        harness = store.get_harness(system_id, harness_id)
        restricted = self._restricted_instances(store, system_id, caller)
        if any(end["mates_instance_id"] in restricted for end in harness["ends"]):
            raise NotFound("Harness not found")  # edits would touch a board the caller cannot see
        return harness

    def _mate(self, store: SystemStore, system_id: str, caller: Caller, mates: Mapping[str, str]) -> tuple[dict, dict]:
        """An exposed port for a harness end: ``(mates for the store, component)``."""
        instance = self._open_instance(store, system_id, mates["instanceId"], caller)
        interface = self._interface(store, instance)
        component = exposure.component_by_key(interface, mates["portKey"])
        if component is None:
            raise Invalid("portKey is not a component of this board at its baseline")
        override = store.list_overrides(instance["id"]).get(component["portKey"])
        if instance.get("kind", "board") == "board" and not exposure.is_exposed(component, override):
            raise Conflict("port is not exposed on this board")
        return {"instanceId": instance["id"], "port": exposure.port_baseline(component)}, component

    def list_harnesses(self, caller: Caller, system_id: str) -> list[dict]:
        with self._tx() as store:
            self._system(store, system_id, caller)
            return [self._harness_body(store, system_id, h["id"], caller) for h in store.list_harnesses(system_id)]

    def create_harness(self, caller: Caller, system_id: str, version: int, fields: Mapping[str, Any]) -> Result:
        """``POST …/harnesses``: ends mate ports or nothing; ``identity`` fills wires between two mated ends."""
        with self._tx() as store:
            self._system(store, system_id, caller)
            with store.mutation(system_id, expected_version=version, actor=caller.actor) as change:
                harness = store.create_harness(change, name=fields.get("name") or "Harness", label=fields.get("label"))
                components = []
                for spec in fields.get("ends") or [{}]:
                    if spec and spec.get("instanceId"):
                        mates, component = self._mate(store, system_id, caller, spec)
                        harness = store.add_harness_end(change, harness["id"], mates_instance_id=mates["instanceId"],
                                                        mates_port=mates["port"], pin_count=max(1, len(component.get("pins") or [])))
                    else:
                        component = None
                        harness = store.add_harness_end(change, harness["id"], pin_count=int((spec or {}).get("pinCount") or 1))
                    components.append(component)
                if fields.get("identity"):
                    if len(harness["ends"]) != 2 or None in components:
                        raise Invalid("identity wires need exactly two mated ends")
                    self._write_wires(store, change, harness["id"], generators.generate(
                        "identity", harnesses_module.pin_facts(harness["ends"][0], components[0]),
                        harnesses_module.pin_facts(harness["ends"][1], components[1]), [], {})["rows"],
                        harness["ends"][0]["id"], harness["ends"][1]["id"])
                body = self._harness_body(store, system_id, harness["id"], caller)
        return Result(body, system_id, change.version)

    def _write_wires(self, store: SystemStore, change: Any, harness_id: str, rows: Sequence[Mapping[str, Any]],
                     end_a: str, end_b: str, *, keep: Sequence[Mapping[str, Any]] = ()) -> None:
        """Append generated row-shaped pairs as wires from ``end_a`` to ``end_b``."""
        wires = list(keep) + [{"from": {"end": end_a, "pin": row["pinA"]}, "to": {"end": end_b, "pin": row["pinB"]},
                               "signal": row.get("signal") or ""} for row in rows]
        self._replace_wires_in(store, change, harness_id, wires)

    def _replace_wires_in(self, store: SystemStore, change: Any, harness_id: str,
                          wires: Sequence[Mapping[str, Any]], *, keep_new_ids: bool = False) -> None:
        harness = store.get_harness(change.system_id, harness_id)
        ends = {end["id"]: end for end in harness["ends"]}
        components = self._end_components(store, harness)
        for end in harness["ends"]:
            if end["mates_instance_id"] and end["id"] not in components:
                raise Conflict("interface_not_ready: a mated board's interface is still being extracted")
        store.replace_wires(change, harness_id, harnesses_module.capture(wires, ends, components),
                            keep_new_ids=keep_new_ids)

    def update_harness(self, caller: Caller, system_id: str, version: int, harness_id: str,
                       fields: Mapping[str, Any]) -> Result:
        with self._tx() as store:
            self._system(store, system_id, caller)
            with store.mutation(system_id, expected_version=version, actor=caller.actor) as change:
                self._visible_harness(store, system_id, harness_id, caller)
                store.update_harness(change, harness_id, fields)
                body = self._harness_body(store, system_id, harness_id, caller)
        return Result(body, system_id, change.version)

    def delete_harness(self, caller: Caller, system_id: str, version: int, harness_id: str) -> Result:
        with self._tx() as store:
            self._system(store, system_id, caller)
            with store.mutation(system_id, expected_version=version, actor=caller.actor) as change:
                self._visible_harness(store, system_id, harness_id, caller)
                store.delete_harness(change, harness_id)
        return Result(None, system_id, change.version)

    def add_harness_end(self, caller: Caller, system_id: str, version: int, harness_id: str,
                        fields: Mapping[str, Any]) -> Result:
        with self._tx() as store:
            self._system(store, system_id, caller)
            with store.mutation(system_id, expected_version=version, actor=caller.actor) as change:
                self._visible_harness(store, system_id, harness_id, caller)
                if fields.get("instanceId"):
                    mates, component = self._mate(store, system_id, caller, fields)
                    store.add_harness_end(change, harness_id, mates_instance_id=mates["instanceId"], mates_port=mates["port"],
                                          pin_count=max(1, len(component.get("pins") or [])))
                else:
                    store.add_harness_end(change, harness_id, pin_count=int(fields.get("pinCount") or 1))
                body = self._harness_body(store, system_id, harness_id, caller)
        return Result(body, system_id, change.version)

    def update_harness_end(self, caller: Caller, system_id: str, version: int, harness_id: str, end_id: str,
                           fields: Mapping[str, Any]) -> Result:
        """Re-mate (``mates``: {instanceId, portKey} or null), ``pinMap``, ``bootMm``. Wire nets are recaptured."""
        with self._tx() as store:
            self._system(store, system_id, caller)
            with store.mutation(system_id, expected_version=version, actor=caller.actor) as change:
                harness = self._visible_harness(store, system_id, harness_id, caller)
                update = {k: fields[k] for k in ("pinMap", "bootMm") if k in fields}
                if "part" in fields:
                    update.update(self._block_part(harness, end_id, fields["part"]))
                if "mates" in fields:
                    if fields["mates"]:
                        mates, component = self._mate(store, system_id, caller, fields["mates"])
                        update["mates"] = mates
                        update["pinCount"] = max(1, len(component.get("pins") or []))
                    else:
                        update["mates"] = None
                store.update_harness_end(change, harness_id, end_id, update)
                wires = [self._wire_input(w) for w in store.get_harness(system_id, harness_id)["wires"]]
                if wires and ("mates" in update or "pinMap" in update or "partPins" in update):
                    self._replace_wires_in(store, change, harness_id, wires)
                body = self._harness_body(store, system_id, harness_id, caller)
        return Result(body, system_id, change.version)

    def _block_part(self, harness: Mapping[str, Any], end_id: str, part: Optional[Mapping[str, Any]]) -> dict:
        """§17.2 (SB2-18): a catalog part for the end's mating block, or ``None`` for Generic again.

        The part's pins replace the block's; pin-map entries for pins the part lacks are dropped, and
        wires on such pins refuse the change.
        """
        end = next((e for e in harness["ends"] if e["id"] == end_id), None)
        if end is None:
            raise NotFound("Harness end not found")
        if part is None:
            return {"catalogComponentId": None, "catalogRevisionId": None, "partPins": None, "partSummary": None,
                    "pinCount": max(1, int((end["mates_port"] or {}).get("pinCount") or end["pin_count"]))}
        try:
            found = self._catalog().part_for_block(str(part.get("componentId") or ""))
        except LookupError:
            raise NotFound("Catalog part not found") from None
        except ValueError as error:
            raise Invalid(str(error)) from None
        pins = found.get("pins")
        if not pins:
            raise Invalid("the part has no symbol or footprint pins to wire")
        wired = sorted({w[f"{side}_pin"] for w in harness["wires"] for side in ("from", "to")
                        if w[f"{side}_end"] == end_id} - set(pins), key=drift.pad_sort_key)
        if wired:
            raise Conflict(f"wires use pins {', '.join(wired)} that {found['mpn'] or found['name']} does not have; "
                           "remove or move those wires first")
        pin_map = {k: v for k, v in (end["pin_map"] or {}).items() if k in pins} or None
        return {"catalogComponentId": found["componentId"], "catalogRevisionId": found["revisionId"],
                "partPins": list(pins), "partSummary": {k: found.get(k) or "" for k in harnesses_module.PART_SUMMARY},
                "pinCount": len(pins), "pinMap": pin_map}

    def delete_harness_end(self, caller: Caller, system_id: str, version: int, harness_id: str, end_id: str) -> Result:
        with self._tx() as store:
            self._system(store, system_id, caller)
            with store.mutation(system_id, expected_version=version, actor=caller.actor) as change:
                self._visible_harness(store, system_id, harness_id, caller)
                store.delete_harness_end(change, harness_id, end_id)
                body = self._harness_body(store, system_id, harness_id, caller)
        return Result(body, system_id, change.version)

    @staticmethod
    def _wire_input(wire: Mapping[str, Any]) -> dict:
        return {"id": wire["id"], "from": {"end": wire["from_end"], "pin": wire["from_pin"]},
                "to": {"end": wire["to_end"], "pin": wire["to_pin"]}, "signal": wire["signal"],
                "gaugeAwg": wire["gauge_awg"], "colour": wire["colour"], "label": wire["label"]}

    def replace_wires(self, caller: Caller, system_id: str, version: int, harness_id: str,
                      wires: Sequence[Mapping[str, Any]]) -> Result:
        with self._tx() as store:
            self._system(store, system_id, caller)
            with store.mutation(system_id, expected_version=version, actor=caller.actor) as change:
                self._visible_harness(store, system_id, harness_id, caller)
                self._replace_wires_in(store, change, harness_id, wires)
                body = self._harness_body(store, system_id, harness_id, caller)
        return Result(body, system_id, change.version)

    def generate_wires(self, caller: Caller, system_id: str, harness_id: str, from_end: str, to_end: str,
                       generator: str, options: Mapping[str, Any]) -> dict:
        """``POST …/harnesses/{hid}/generate``: proposed wires between one end pair, nothing written."""
        with self._tx() as store:
            self._system(store, system_id, caller)
            harness = self._visible_harness(store, system_id, harness_id, caller)
            ends = {end["id"]: end for end in harness["ends"]}
            if from_end not in ends or to_end not in ends or from_end == to_end:
                raise Invalid("fromEnd and toEnd must be two ends of this harness")
            components = self._end_components(store, harness)
        facts = [harnesses_module.pin_facts(ends[e], components.get(e)) for e in (from_end, to_end)]
        existing = [{"pin_a": w["from_pin"] if w["from_end"] == from_end else w["to_pin"],
                     "pin_b": w["to_pin"] if w["to_end"] == to_end else w["from_pin"]}
                    for w in harness["wires"] if {w["from_end"], w["to_end"]} == {from_end, to_end}]
        body = generators.generate(generator, facts[0], facts[1], existing, options)
        wires = [{"from": {"end": from_end, "pin": row["pinA"]}, "to": {"end": to_end, "pin": row["pinB"]},
                  "signal": row["signal"], "netFrom": row["netA"], "netTo": row["netB"]} for row in body["rows"]]
        skipped = [{"fromPin": s["pinA"], "toPin": s["pinB"], "reason": s["reason"]} for s in body["skipped"]]
        return {"harnessId": harness_id, "generator": generator, "wires": wires, "skipped": skipped}

    def link_to_harness(self, caller: Caller, system_id: str, version: int, link_id: str) -> Result:
        """§16.1: a 2-end harness mating the link's ends, one wire per row; the link is deleted."""
        with self._tx() as store:
            self._system(store, system_id, caller)
            with store.mutation(system_id, expected_version=version, actor=caller.actor) as change:
                link = self._visible_link(store, system_id, link_id, caller)
                harness_id = self._harness_from_links(store, change, [link], name=link["name"] or "Harness",
                                                      label=link["harness"], audit={"fromLink": link_id})
                body = self._harness_body(store, system_id, harness_id, caller)
        return Result(body, system_id, change.version)

    def harness_from_label(self, caller: Caller, system_id: str, version: int, label: str) -> Result:
        """§17.2 P1 label migration: every link with this harness label becomes one harness."""
        with self._tx() as store:
            self._system(store, system_id, caller)
            with store.mutation(system_id, expected_version=version, actor=caller.actor) as change:
                links = [link for link in store.list_links(system_id) if link["harness"] == label]
                if not links:
                    raise NotFound("No link carries that harness label")
                for link in links:
                    self._visible_link(store, system_id, link["id"], caller)
                harness_id = self._harness_from_links(store, change, links, name=label, label=label,
                                                      audit={"fromLabel": label, "links": [l["id"] for l in links]})
                body = self._harness_body(store, system_id, harness_id, caller)
        return Result(body, system_id, change.version)

    def _harness_from_links(self, store: SystemStore, change: Any, links: Sequence[Mapping[str, Any]], *,
                            name: str, label: Optional[str], audit: Mapping[str, Any]) -> str:
        """One harness whose ends are the links' distinct ports (first appearance order); rows become wires."""
        for link in links:
            if link.get("type") == "b2b":
                raise Conflict("a board-to-board link is a mate, not a cable; change its type first")
        ports: list[tuple[str, dict]] = []
        for link in links:
            for end in ("a", "b"):
                key = (link[f"{end}_instance_id"], link[f"{end}_port"]["portKey"])
                if key not in [(i, p["portKey"]) for i, p in ports]:
                    ports.append((link[f"{end}_instance_id"], dict(link[f"{end}_port"])))
        for link in links:
            store.delete_link(change, link["id"])
        harness = store.create_harness(change, name=name, label=label, audit=audit)
        end_ids = {}
        for instance_id, port in ports:
            harness = store.add_harness_end(change, harness["id"], mates_instance_id=instance_id, mates_port=port,
                                            pin_count=max(1, int(port.get("pinCount") or 1)))
            end_ids[(instance_id, port["portKey"])] = harness["ends"][-1]["id"]
        wires = []
        for link in links:
            wires += harnesses_module.wires_from_rows(link, end_ids[(link["a_instance_id"], link["a_port"]["portKey"])],
                                                      end_ids[(link["b_instance_id"], link["b_port"]["portKey"])])
        # Row net baselines carry over as accepted baselines: converting is not an acceptance of drift.
        store.replace_wires(change, harness["id"], wires)
        return harness["id"]

    def harness_to_link(self, caller: Caller, system_id: str, version: int, harness_id: str) -> Result:
        """§16.1: only a 2-end harness with identity maps and no splices becomes an ``unspecified`` link."""
        with self._tx() as store:
            self._system(store, system_id, caller)
            with store.mutation(system_id, expected_version=version, actor=caller.actor) as change:
                harness = self._visible_harness(store, system_id, harness_id, caller)
                if not harnesses_module.is_linkable(harness) or not all(e["mates_instance_id"] for e in harness["ends"]):
                    raise Conflict("harness_not_linkable: only a harness with two mated ends, no splices and no pin "
                                   "map becomes a link")
                a, b = harness["ends"]
                store.delete_harness(change, harness_id)
                link = store.create_link(change, a_instance_id=a["mates_instance_id"], a_port=a["mates_port"],
                                         b_instance_id=b["mates_instance_id"], b_port=b["mates_port"],
                                         name=harness["name"], harness=harness["label"])
                rows = [{"pinA": w["from_pin"] if w["from_end"] == a["id"] else w["to_pin"],
                         "pinB": w["to_pin"] if w["from_end"] == a["id"] else w["from_pin"],
                         "signal": w["signal"], "source": "manual",
                         "netA": w["net_from"] if w["from_end"] == a["id"] else w["net_to"],
                         "netB": w["net_to"] if w["from_end"] == a["id"] else w["net_from"]} for w in harness["wires"]]
                store.replace_rows(change, link["id"], rows)
                body = self._link_body(store, system_id, link["id"])
        return Result(body, system_id, change.version)

    # ------------------------------------------------------------------
    # Links and rows

    def _visible_link(self, store: SystemStore, system_id: str, link_id: str, caller: Caller) -> dict:
        try:
            link = store.get_link(system_id, link_id)
        except NotFound:
            raise NotFound("Link not found") from None
        for end in ("a", "b"):
            try:
                self._open_instance(store, system_id, link[f"{end}_instance_id"], caller)
            except NotFound:
                raise NotFound("Link not found") from None
        return link

    def _link_body(self, store: SystemStore, system_id: str, link_id: str) -> dict:
        instances = store.list_instances(system_id, kinds=SystemStore.ALL_KINDS)
        link = store.get_link(system_id, link_id)
        interfaces: dict[str, dict] = {}
        overrides: dict[str, dict] = {}
        for instance in instances:
            if instance["id"] in (link["a_instance_id"], link["b_instance_id"]):
                found = self._instance_interface(store, instance)
                if found is not None:
                    interfaces[instance["id"]] = found
                    overrides[instance["id"]] = store.list_overrides(instance["id"])
        return self._link_doc(link, interfaces, overrides, {
            iid: store.list_mating(iid) for iid in {link["a_instance_id"], link["b_instance_id"]}})

    def create_link(
        self, caller: Caller, system_id: str, version: int, *, a: Mapping[str, str],
        b: Mapping[str, str], name: str, harness: Optional[str], link_type: str = "unspecified",
        stack_height_mm: Optional[float] = None,
    ) -> Result:
        with self._tx() as store:
            self._system(store, system_id, caller)
            with store.mutation(system_id, expected_version=version, actor=caller.actor) as change:
                baselines = []
                for end in (a, b):
                    instance = self._open_instance(store, system_id, end["instanceId"], caller)
                    interface = self._interface(store, instance)
                    component = exposure.component_by_key(interface, end["portKey"])
                    if component is None:
                        raise Invalid("portKey is not a component of this board at its baseline")
                    override = store.list_overrides(instance["id"]).get(component["portKey"])
                    if not exposure.is_exposed(component, override):
                        raise Conflict("port is not exposed on this board")
                    baselines.append(exposure.port_baseline(component))
                link = store.create_link(
                    change, a_instance_id=a["instanceId"], a_port=baselines[0],
                    b_instance_id=b["instanceId"], b_port=baselines[1], name=name, harness=harness,
                    link_type=link_type, stack_height_mm=stack_height_mm,
                )
                body = self._link_body(store, system_id, link["id"])
        return Result(body, system_id, change.version)

    def update_link(
        self, caller: Caller, system_id: str, version: int, link_id: str, fields: Mapping[str, Any]
    ) -> Result:
        with self._tx() as store:
            self._system(store, system_id, caller)
            with store.mutation(system_id, expected_version=version, actor=caller.actor) as change:
                self._visible_link(store, system_id, link_id, caller)
                store.update_link(
                    change, link_id, name=fields.get("name"), harness=fields.get("harness", ...),
                    link_type=fields.get("type"), stack_height_mm=fields.get("stackHeightMm", ...),
                )
                body = self._link_body(store, system_id, link_id)
        return Result(body, system_id, change.version)

    def delete_link(self, caller: Caller, system_id: str, version: int, link_id: str) -> Result:
        with self._tx() as store:
            self._system(store, system_id, caller)
            with store.mutation(system_id, expected_version=version, actor=caller.actor) as change:
                self._visible_link(store, system_id, link_id, caller)
                store.delete_link(change, link_id)
        return Result(None, system_id, change.version)

    def replace_rows(
        self, caller: Caller, system_id: str, version: int, link_id: str,
        rows: Sequence[Mapping[str, Any]],
    ) -> Result:
        with self._tx() as store:
            self._system(store, system_id, caller)
            with store.mutation(system_id, expected_version=version, actor=caller.actor) as change:
                link = self._visible_link(store, system_id, link_id, caller)
                pins: dict[str, dict[str, dict]] = {}
                references: dict[str, str] = {}
                for end in ("a", "b"):
                    instance = store.get_instance(system_id, link[f"{end}_instance_id"])
                    interface = self._interface(store, instance)
                    component = exposure.component_by_key(interface, link[f"{end}_port"]["portKey"])
                    if component is None:
                        raise Conflict("a link end no longer resolves at its baseline; resolve its review first")
                    pins[end] = exposure.pins_by_pad(component)
                    references[end] = component["reference"]
                captured = []
                for row in rows:
                    item = dict(row)
                    for end, column in (("a", "A"), ("b", "B")):
                        pad = str(item.get(f"pin{column}") or "")
                        if pad and pad not in pins[end]:
                            raise Invalid(f"pin {pad} does not exist on {references[end]}")
                        item[f"net{column}"] = pins[end][pad]["nets"] if pad else []
                    captured.append(item)
                store.replace_rows(change, link_id, captured)
                body = self._link_body(store, system_id, link_id)
        return Result(body, system_id, change.version)

    def generate_rows(
        self, caller: Caller, system_id: str, link_id: str, generator: str, options: Mapping[str, Any],
    ) -> Result:
        """``POST …/links/{lid}/generate`` (§8.5): proposed rows, nothing written."""

        with self._tx() as store:
            system = self._system(store, system_id, caller)
            link = self._visible_link(store, system_id, link_id, caller)
            pins = {}
            for end in ("a", "b"):
                instance = store.get_instance(system_id, link[f"{end}_instance_id"])
                component = exposure.component_by_key(self._interface(store, instance), link[f"{end}_port"]["portKey"])
                if component is None:
                    raise Conflict("a link end no longer resolves at its baseline; resolve its review first")
                pins[end] = exposure.pins_by_pad(component)
        body = generators.generate(generator, pins["a"], pins["b"], link["rows"], options)
        return Result({"linkId": link_id, **body}, system_id, system["version"])

    # ------------------------------------------------------------------
    # Reviews and rebase (§7.1, §8.1)

    def _review_doc(self, store: SystemStore, review: Mapping[str, Any], restricted: bool,
                    hidden: Collection[str] = ()) -> dict:
        base = {"id": review["id"], "kind": review["kind"], "status": review["status"],
                "instanceId": review["instance_id"], "createdAt": _iso(review["created_at"]),
                "decidedBy": review["decided_by"], "decidedAt": _iso(review["decided_at"])}
        if restricted:
            return {**base, "redacted": True, "fromCommit": None, "toCommit": None,
                    "pendingChanges": None, "items": None}
        rows = {row["id"]: row for link in store.drift_links(review["system_id"]) for row in link["rows"]}
        items = []
        for item in review["items"]:
            end = item["link_end"]
            pins = sorted({rows[rid][f"pin_{end}"] for rid in item["row_ids"] if rid in rows},
                          key=drift.pad_sort_key) if end else []
            if review["kind"] == "import" and hidden and {
                ((item["observed"] or {}).get(side) or {}).get("instanceId") for side in ("from", "to")
            } & set(hidden):
                items.append({"id": item["id"], "ordinal": item["ordinal"], "kind": item["kind"],
                              "linkId": None, "end": None, "rowIds": [], "pins": [], "expected": None,
                              "observed": None, "candidates": None, "decision": item["decision"],
                              "decisionPayload": None, "redacted": True})
                continue
            items.append({
                "id": item["id"], "ordinal": item["ordinal"], "kind": item["kind"],
                "linkId": item["link_id"], "end": end, "rowIds": list(item["row_ids"]), "pins": pins,
                "expected": item["expected"], "observed": item["observed"],
                "candidates": item["candidates"], "decision": item["decision"],
                "decisionPayload": item["decision_payload"], "redacted": False,
            })
        return {**base, "redacted": False, "fromCommit": review["from_commit"],
                "toCommit": review["to_commit"], "pendingChanges": review["pending_changes"],
                "items": items}

    def _restricted_instances(self, store: SystemStore, system_id: str, caller: Caller) -> set[str]:
        instances = store.list_instances(system_id)
        access = self._access(store, instances, caller)
        return {i["id"] for i in instances if not access[i["project_id"]]["visible"]}

    def list_reviews(self, caller: Caller, system_id: str, status: Optional[str]) -> list[dict]:
        with self._tx() as store:
            self._system(store, system_id, caller)
            restricted = self._restricted_instances(store, system_id, caller)
            return [self._review_doc(store, review, review["instance_id"] in restricted, restricted)
                    for review in store.list_reviews(system_id, status=status)]

    def _open_review_instance(self, store: SystemStore, system_id: str, review_id: str, caller: Caller) -> None:
        try:
            review = store.get_review(system_id, review_id)
        except NotFound:
            raise NotFound("Review not found") from None
        if review["instance_id"]:
            try:
                self._open_instance(store, system_id, review["instance_id"], caller)
            except NotFound:
                raise NotFound("Review not found") from None

    def _require_visible_import_item(
        self, store: SystemStore, system_id: str, review_id: str, item_id: str, caller: Caller
    ) -> None:
        """An import item proposing a row on a restricted board is 404 to its caller (§8.2)."""

        review = store.get_review(system_id, review_id)
        if review["kind"] != "import":
            return
        item = next((i for i in review["items"] if i["id"] == item_id), None)
        touched = {((item["observed"] or {}).get(side) or {}).get("instanceId") for side in ("from", "to")} if item else set()
        if touched & self._restricted_instances(store, system_id, caller):
            raise NotFound("Review item not found")

    def decide(
        self, caller: Caller, system_id: str, version: int, review_id: str, item_id: str,
        decision: str, payload: Optional[Mapping[str, Any]],
    ) -> Result:
        try:
            return self._decide(caller, system_id, version, review_id, item_id, decision, payload)
        except reconcile.StaleReview as stale:
            self._reevaluate(caller, stale.review)
            raise Conflict(
                "review_stale: links or rows on this board changed while the review was open, "
                "so it has been evaluated again; review the new items"
            ) from None

    def _reevaluate(self, caller: Caller, review: Mapping[str, Any]) -> None:
        """Replace a stale review with a fresh evaluation of the same commit."""

        from app.services.systems.detection import apply_evaluation

        with self._tx() as store:
            with store.mutation(review["system_id"], expected_version=None, actor=caller.actor) as change:
                current = store.get_review(review["system_id"], review["id"])
                if current["status"] != "open" or not reconcile.is_stale(store, current):
                    return  # someone else already re-evaluated it
                instance = store.get_instance(review["system_id"], review["instance_id"])
                if current["kind"] == "child_update":
                    revision = self._catalog_revision(current["to_commit"])
                    if revision is None:
                        raise Conflict("the review's candidate revision cannot be read from the catalog")
                    child_drift.apply_child_evaluation(store, change, instance, revision,
                                                       auto_kind="child_auto_advanced")
                    return
                candidate = reconcile.candidate_interface(store, current)
                apply_evaluation(store, change, instance, current["to_commit"], candidate,
                                 auto_kind="baseline_auto_advanced")

    def _decide(
        self, caller: Caller, system_id: str, version: int, review_id: str, item_id: str,
        decision: str, payload: Optional[Mapping[str, Any]],
    ) -> Result:
        with self._tx() as store:
            self._system(store, system_id, caller)
            with store.mutation(system_id, expected_version=version, actor=caller.actor) as change:
                self._open_review_instance(store, system_id, review_id, caller)
                self._require_visible_import_item(store, system_id, review_id, item_id, caller)
                review = reconcile.decide(store, change, review_id, item_id, decision, payload,
                                          child_loader=self._child_interface)
                restricted = self._restricted_instances(store, system_id, caller)
                body = self._review_doc(store, review, False, restricted)
        return Result(body, system_id, change.version)

    def keep_pinned(self, caller: Caller, system_id: str, version: int, review_id: str) -> Result:
        with self._tx() as store:
            self._system(store, system_id, caller)
            with store.mutation(system_id, expected_version=version, actor=caller.actor) as change:
                self._open_review_instance(store, system_id, review_id, caller)
                review = reconcile.keep_pinned(store, change, review_id)
                restricted = self._restricted_instances(store, system_id, caller)
                body = self._review_doc(store, review, False, restricted)
        return Result(body, system_id, change.version)

    def rebase(
        self, caller: Caller, system_id: str, version: int, instance_id: str, commit: str
    ) -> tuple[str, Any]:
        """``POST …/rebase``: evaluate an explicit commit like detection (§8.1, §10.1).

        Returns ``("queued", job)`` while the commit's interface is extracted,
        else ``("done", Result)``.
        """

        with self._tx() as store:
            self._system(store, system_id, caller)
            instance = self._open_instance(store, system_id, instance_id, caller)
            project = self._require_project(store, instance["project_id"], caller)
        try:
            target = sources.resolve_commit(project, commit)
        except sources.SourceError as error:
            raise Invalid(str(error)) from None
        if target is None:
            raise Invalid("commit does not exist in the project repository")
        if target == instance["baseline_commit"]:
            raise Conflict("commit is already the baseline")
        with self._tx() as store:
            candidate = store.get_interface(instance["project_id"], target, EXTRACTOR_VERSION)
        if candidate is None:
            job = self._enqueue(instance["project_id"], target, requested_by=caller.email)
            return "queued", {"job_id": str(job["job_id"]), "status": job["status"]}
        from app.services.systems.detection import apply_evaluation

        with self._tx() as store:
            self._system(store, system_id, caller)
            with store.mutation(system_id, expected_version=version, actor=caller.actor) as change:
                current = self._open_instance(store, system_id, instance_id, caller)
                if current["baseline_commit"] == target:
                    raise Conflict("commit is already the baseline")
                outcome, review_id = apply_evaluation(
                    store, change, current, target, candidate, auto_kind="baseline_rebased"
                )
                row = store.get_instance(system_id, instance_id)
        body = {"outcome": outcome, "reviewId": review_id, "instance": self._instance_row(row)}
        return "done", Result(body, system_id, change.version)

    # ------------------------------------------------------------------
    # Snapshots, ICD and diff (§9)

    @staticmethod
    def _snapshot_meta(row: Mapping[str, Any]) -> dict:
        return {"id": row["id"], "name": row["name"], "note": row["note"], "createdBy": row["created_by"],
                "createdAt": _iso(row["created_at"]), "digest": row["digest"],
                "connectivityDigest": row.get("connectivity_digest"),
                "manifestSchema": row.get("manifest_schema"),
                "openReviewCount": int(row["open_review_count"]), "rendererVersion": row["renderer_version"]}

    @staticmethod
    def _restricted_in(store: SystemStore, document: Mapping[str, Any], caller: Caller) -> set[str]:
        """Restricted instances of a frozen document, by today's access (§8.2).

        A snapshot can hold instances that have since been removed, so this
        reads the project identities the document itself recorded.
        """

        projects = {i["id"]: i["projectId"] for i in document["instances"]}
        access = visibility.project_access(store.conn, projects.values(), caller.role)
        return {iid for iid, pid in projects.items() if not access[pid]["visible"]}

    def create_snapshot(self, caller: Caller, system_id: str, version: int, name: str, note: str) -> Result:
        """Freeze the unredacted document and manifest at ``version`` (§9.1, P2 §9.4).

        The version is not bumped. ``digest`` is the manifest's full digest;
        the rendered ``document`` stays beside it as the evidence the ICD and
        diffs read.
        """

        with self._tx() as store:
            system = self._system(store, system_id, caller)
            with store.mutation(system_id, expected_version=version, actor=caller.actor, bump=False) as change:
                built, _instances, _jobs = self._build(store, system)
                document = json.loads(json.dumps(built, default=_iso))
                snapshot_id = new_id("ssn_")
                manifest = manifest_io.build(
                    store, system_id, created_by=caller.actor,
                    created_at=datetime.now(timezone.utc).replace(microsecond=0),
                    snapshot={"id": snapshot_id, "name": name.strip(), "note": note},
                    catalog_refs=self._catalog_refs(store, system_id),
                )
                digests = manifest_digests(manifest)
                row = store.create_snapshot(
                    change, name=name, note=note, document=document, digest=digests["full"],
                    open_review_count=document["openReviewCount"], renderer_version=icd.RENDERER_VERSION,
                    snapshot_id=snapshot_id, manifest=manifest.model_dump(mode="json", by_alias=True),
                    connectivity_digest=digests["connectivity"],
                )
        return Result(self._snapshot_meta(row), system_id, change.version)

    def list_snapshots(self, caller: Caller, system_id: str) -> list[dict]:
        with self._tx() as store:
            system = self._system(store, system_id, caller)
            rows = store.list_snapshots(system_id)
        publications = self._publications(system.get("catalogComponentId"))
        return [{**self._snapshot_meta(row), "publication": publications.get(row["id"])} for row in rows]

    def _publications(self, component_id: Optional[str]) -> dict[str, dict]:
        """snapshotId -> the catalog revision it was published as. Best effort: never breaks a read."""
        if not component_id:
            return {}
        try:
            revisions = self._catalog().system_revisions(component_id)
        except Exception:  # the catalog is a separate service; a listing must not fail on it
            logger.exception("Could not read catalog revisions of %s", component_id)
            return {}
        return {
            str(r["sourceRef"].get("snapshotId")): {"componentId": component_id, "revisionId": r["revisionId"],
                                                   "version": r["version"], "releaseStatus": r["releaseStatus"]}
            for r in revisions if r["sourceRef"].get("snapshotId")
        }

    # ------------------------------------------------------------------
    # Publishing (CONTRACTS_P2 §3.3)

    def _hierarchy_facts(self, system_id: str, manifest: Mapping[str, Any]) -> dict:
        """``hierarchyValid`` and ``children`` for an assembly's release gates, from its snapshot."""
        children = [{"componentId": i["catalog"]["componentId"], "revisionId": i["catalog"]["revisionId"]}
                    for i in manifest["instances"] if i["kind"] != "board"]
        with self._tx() as store:
            try:
                hierarchy.resolve(system_id, manifest["instances"], self._child_loader(store))
                valid = True
            except hierarchy.HierarchyError:
                valid = False
        return {"hierarchyValid": valid, "children": children}

    def publish_snapshot(
        self, caller: Caller, system_id: str, snapshot_id: str, *, ipn: Optional[str], name: Optional[str],
        description: Optional[str], manufacturer: Optional[str],
    ) -> tuple[bool, dict]:
        """Publish a snapshot as a catalog ``assembly`` revision. Returns ``(created, publication)``.

        Idempotent per snapshot. The catalog revision is written before the
        system binding, both under the system lock; a crash in between is
        repaired by the next publish, which finds the orphan by system ID.
        """

        from app.core.roles import CATALOG_WRITE_ROLES

        if caller.role not in CATALOG_WRITE_ROLES:
            raise Forbidden("publishing needs catalog write access")
        with self._tx() as store:
            self._system(store, system_id, caller)
            row = store.get_snapshot(system_id, snapshot_id)
            if row["manifest"] is None:
                raise Invalid("this snapshot predates manifests; take a new snapshot to publish")
            if self._restricted_in(store, row["document"], caller):
                raise Forbidden("the snapshot contains boards you cannot see")
        interface = self.export_interface(caller, system_id, snapshot_id)
        if not interface["exports"]:
            raise Invalid("publishing needs at least one export")
        unresolved = [e["name"] for e in interface["exports"] if not e["resolved"]]
        if unresolved:
            raise Invalid(f"these exports do not resolve at the snapshot: {', '.join(unresolved)}")
        source_ref = {
            "kind": "system_snapshot", "systemId": system_id, "snapshotId": snapshot_id,
            "snapshotName": row["name"], "fullDigest": row["digest"],
            "connectivityDigest": row["connectivity_digest"], "openReviewCount": int(row["open_review_count"]),
            **self._hierarchy_facts(system_id, row["manifest"]),
        }
        catalog = self._catalog()
        with self._tx() as store:
            system = self._system(store, system_id, caller)
            with store.mutation(system_id, expected_version=None, actor=caller.actor, bump=False) as change:
                bound = store.get_system(system_id).get("catalog_component_id") or catalog.find_system_component(system_id)
                created = False
                if bound:
                    existing = next((r for r in catalog.system_revisions(bound)
                                     if r["sourceRef"].get("snapshotId") == snapshot_id), None)
                    if existing is None:
                        out = catalog.add_system_revision(bound, interface=interface, source_ref=source_ref,
                                                          actor=caller.email, change_summary=f"Publish {row['name']}")
                        revision_id, created = out["revisionId"], True
                    else:
                        revision_id = existing["revisionId"]
                    component_id = bound
                else:
                    if not (ipn or "").strip():
                        raise Invalid("the first publish needs an IPN")
                    try:
                        out = catalog.create_system_item(
                            kind="assembly", ipn=ipn or "", name=(name or system["name"]).strip(),
                            description=(description or system["description"] or system["name"]).strip(),
                            manufacturer=(manufacturer or "In-house").strip(), datasheet_url=f"/systems/{system_id}",
                            interface=interface, source_ref=source_ref, actor=caller.email,
                            change_summary=f"Publish {row['name']}",
                        )
                    except ValueError as error:
                        raise Conflict(str(error)) from None
                    component_id, revision_id, created = out["componentId"], out["revisionId"], True
                store.bind_catalog_component(change, component_id)
                if created:
                    change.audit("snapshot_published", {"snapshotId": snapshot_id, "name": row["name"],
                                                        "componentId": component_id, "revisionId": revision_id})
        publication = self._publications(component_id).get(snapshot_id) or {
            "componentId": component_id, "revisionId": revision_id, "version": None, "releaseStatus": None}
        return created, publication

    def _snapshot(self, store: SystemStore, system_id: str, snapshot_id: str, caller: Caller) -> tuple[dict, dict]:
        """A snapshot's metadata and its document, redacted for ``caller``."""

        row = store.get_snapshot(system_id, snapshot_id)
        restricted = self._restricted_in(store, row["document"], caller)
        return self._snapshot_meta(row), redaction.redact_document(row["document"], restricted)

    def snapshot_manifest(self, caller: Caller, system_id: str, snapshot_id: str) -> dict:
        """``GET …/snapshots/{sid}/manifest`` (P2 §11).

        A manifest is an exchange artifact, so it is served whole or not at
        all: a reader who cannot see every board in it gets 403.
        """

        with self._tx() as store:
            self._system(store, system_id, caller)
            row = store.get_snapshot(system_id, snapshot_id)
            if row["manifest"] is None:
                raise NotFound("This snapshot predates manifests")
            if self._restricted_in(store, row["document"], caller):
                raise Forbidden("the manifest contains boards you cannot see")
            return row["manifest"]

    def get_snapshot(self, caller: Caller, system_id: str, snapshot_id: str) -> dict:
        with self._tx() as store:
            self._system(store, system_id, caller)
            meta, document = self._snapshot(store, system_id, snapshot_id, caller)
        return {**meta, "document": document}

    def _icd_source(
        self, caller: Caller, system_id: str, snapshot_id: Optional[str]
    ) -> tuple[dict, str, Optional[int]]:
        """``(redacted document, source label, live version or None)`` for an ICD."""

        with self._tx() as store:
            system = self._system(store, system_id, caller)
            if snapshot_id is not None:
                meta, document = self._snapshot(store, system_id, snapshot_id, caller)
                return document, meta["name"], None
            built, _instances, _jobs = self._build(store, system)
            restricted = self._restricted_instances(store, system_id, caller)
        return redaction.redact_document(built, restricted), "live", system["version"]

    def icd(
        self, caller: Caller, system_id: str, fmt: str, snapshot_id: Optional[str] = None, depth: str = "own",
    ) -> tuple[str, str, Optional[int]]:
        """``(content, system name, live version or None)``; ``fmt`` is ``csv`` or ``html`` (§9.4, §9.5).

        ``depth="all"`` (P2 §10) adds every subsystem level's own links, from its pinned snapshot.
        """

        document, source, version = self._icd_source(caller, system_id, snapshot_id)
        levels = self._icd_levels(caller, system_id, snapshot_id) if depth == "all" else None
        if fmt == "csv":
            content = icd.render_csv(document, levels)
        else:
            generated = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
            content = icd.render_html(document, source=source, generated_at=generated, levels=levels)
        return content, document["system"]["name"], version

    def _icd_levels(self, caller: Caller, system_id: str, snapshot_id: Optional[str]) -> list[dict]:
        """Each visible subsystem level, redacted for the reader (§5.4), in tree order."""
        with self._tx() as store:
            self._system(store, system_id, caller)
            if snapshot_id is None:
                tree = self._tree(store, system_id)
            else:
                manifest = store.get_snapshot(system_id, snapshot_id).get("manifest")
                if not manifest:
                    return []
                try:
                    tree = hierarchy.resolve(system_id, manifest["instances"], self._child_loader(store))
                except hierarchy.HierarchyError as error:
                    raise Invalid(str(error)) from None
            projects = {o.project_id for o in tree.boards if o.project_id}
            access = visibility.project_access(store.conn, projects, caller.role)
            hidden_systems = {o.child_system_id for o in tree.occurrences if o.child_system_id and not
                              visibility.visible_systems(store.conn, caller.role, system_id=o.child_system_id)}
        restricted_paths = {o.path for o in tree.boards if not access.get(o.project_id, {}).get("visible", False)}
        levels, hidden_prefixes = [], []
        for occurrence in sorted(tree.occurrences, key=lambda o: (o.depth, o.path)):
            if occurrence.child is None or any(occurrence.path.startswith(p + "/") for p in hidden_prefixes):
                continue
            if occurrence.child_system_id in hidden_systems:
                hidden_prefixes.append(occurrence.path)
                continue
            child = occurrence.child
            levels.append({
                "displayPath": occurrence.display_path, "snapshotName": child.name,
                "links": child.links, "labels": {i["id"]: i["label"] for i in child.instances},
                "restricted": {i["id"] for i in child.instances if f"{occurrence.path}/{i['id']}" in restricted_paths},
            })
        return levels

    def diff_snapshot(self, caller: Caller, system_id: str, snapshot_id: str, against: str) -> dict:
        """``GET …/snapshots/{sid}/diff?against=live|<sid>``: what changed since the snapshot.

        Both sides are redacted with the union of their restricted boards, so a
        comparison cannot reveal a restricted side by difference.
        """

        with self._tx() as store:
            system = self._system(store, system_id, caller)
            before = store.get_snapshot(system_id, snapshot_id)["document"]
            if against == "live":
                after = json.loads(json.dumps(self._build(store, system)[0], default=_iso))
                restricted = self._restricted_instances(store, system_id, caller)
            else:
                try:
                    after = store.get_snapshot(system_id, against)["document"]
                except NotFound:
                    raise NotFound("Snapshot not found") from None
                restricted = self._restricted_in(store, after, caller)
            restricted |= self._restricted_in(store, before, caller)
        return {"snapshotId": snapshot_id, "against": against,
                **icd.diff(redaction.redact_document(before, restricted),
                           redaction.redact_document(after, restricted))}

    # ------------------------------------------------------------------
    # CSV import (§9.3)

    def upload_import(
        self, caller: Caller, system_id: str, *, filename: str, raw: bytes, delimiter: Optional[str],
    ) -> dict:
        """``POST …/imports``: store the upload and describe it for mapping."""

        text = csv_import.decode(raw)
        parsed = csv_import.parse(text, delimiter)
        with self._tx() as store:
            self._system(store, system_id, caller)
            row = store.create_import_session(
                system_id, actor=caller.actor, filename=filename[:255], delimiter=parsed.delimiter,
                content=text, row_count=len(parsed.rows),
            )
        return {"importId": row["id"], "filename": row["filename"], **csv_import.summary(parsed)}

    def _import_state(
        self, store: SystemStore, system_id: str, caller: Caller, session: Mapping[str, Any],
        column_map: Mapping[str, str], board_map: Mapping[str, str], delimiter: Optional[str],
    ) -> dict:
        """Parse the session and classify it against the system's current state."""

        parsed = csv_import.parse(session["content"], delimiter or session["delimiter"])
        instances = {i["id"]: i for i in store.list_instances(system_id)}
        csv_import.check_maps(parsed, column_map, board_map, instances)
        restricted = self._restricted_instances(store, system_id, caller)
        if {v for v in board_map.values() if v != csv_import.SKIP} & restricted:
            raise NotFound("Instance not found")
        interfaces = csv_import.baseline_interfaces(store, system_id)
        overrides = {iid: store.list_overrides(iid) for iid in instances}
        return csv_import.classify(parsed, column_map, board_map, instances=instances, interfaces=interfaces,
                                   overrides=overrides, links=store.list_links(system_id),
                                   harnesses=store.list_harnesses(system_id))

    def preview_import(
        self, caller: Caller, system_id: str, import_id: str, column_map: Mapping[str, str],
        board_map: Mapping[str, str], delimiter: Optional[str],
    ) -> Result:
        with self._tx() as store:
            system = self._system(store, system_id, caller)
            session = store.get_import_session(system_id, import_id)
            buckets = self._import_state(store, system_id, caller, session, column_map, board_map, delimiter)
        return Result({"importId": import_id, "committed": session["committed_at"] is not None, **buckets},
                      system_id, system["version"])

    def commit_import(
        self, caller: Caller, system_id: str, version: int, import_id: str, column_map: Mapping[str, str],
        board_map: Mapping[str, str], delimiter: Optional[str],
    ) -> Result:
        """``POST …/imports/{imid}/commit``: write Matched rows, review Needs review rows.

        The rows are classified again under the lock, so the commit acts on the
        state it writes to, not on whatever an earlier preview saw.
        """

        with self._tx() as store:
            self._system(store, system_id, caller)
            with store.mutation(system_id, expected_version=version, actor=caller.actor) as change:
                session = store.get_import_session(system_id, import_id, lock=True)
                if session["committed_at"] is not None:
                    raise Conflict("this import has already been committed")
                buckets = self._import_state(store, system_id, caller, session, column_map, board_map, delimiter)
                interfaces = csv_import.baseline_interfaces(store, system_id)
                written = csv_import.apply_rows(store, change, buckets["matched"], interfaces)
                review_id = None
                if buckets["needsReview"]:
                    review = store.open_review(
                        change, instance_id=None, kind="import", from_commit=None, to_commit=None,
                        items=[{
                            "kind": "signal_mismatch", "linkId": entry["linkId"],
                            "rowIds": [entry["rowId"]] if entry["rowId"] else [],
                            "expected": {"leaves": sorted({csv_import.leaf(n) for side in ("from", "to")
                                                           for n in (entry[side] or {}).get("nets") or []})},
                            "observed": csv_import.proposal(entry),
                        } for entry in buckets["needsReview"]],
                    )
                    review_id = review["id"]
                report = {**written, "reviewId": review_id, "counts": buckets["counts"]}
                store.mark_import_committed(change, import_id, report)
        body = {"importId": import_id, **report, "unresolved": buckets["unresolved"],
                "conflict": buckets["conflict"]}
        return Result(body, system_id, change.version)

    # ------------------------------------------------------------------
    # History and layout

    def history(
        self, caller: Caller, system_id: str, *, cursor: Optional[int], limit: int
    ) -> dict:
        with self._tx() as store:
            self._system(store, system_id, caller)
            events = store.history(system_id, before_seq=cursor, limit=limit)
            # Removed instances too: their older events still name them.
            owners = store.instance_projects(system_id)
            project_ids = set(owners.values())
            for event in events:
                project = (event["payload"] or {}).get("projectId")
                if isinstance(project, str):
                    project_ids.add(project)
            access = visibility.project_access(store.conn, project_ids, caller.role)
        hidden_projects = {pid for pid, seen in access.items() if not seen["visible"]}
        hidden_instances = {iid for iid, pid in owners.items() if pid in hidden_projects}
        out = []
        for event in events:
            text = json.dumps(event["payload"], sort_keys=True)
            redacted = any(token in text for token in hidden_instances | hidden_projects)
            out.append({
                "seq": int(event["seq"]), "id": event["id"], "at": _iso(event["at"]),
                "actor": event["actor"], "kind": event["kind"],
                "payload": None if redacted else event["payload"], "redacted": redacted,
            })
        next_cursor = out[-1]["seq"] if len(out) == limit and out else None
        return {"events": out, "nextCursor": next_cursor}

    def get_layout(self, caller: Caller, system_id: str) -> dict:
        with self._tx() as store:
            self._system(store, system_id, caller)
            return {"positions": store.get_layout(system_id)}

    def put_layout(self, caller: Caller, system_id: str, positions: Mapping[str, Any]) -> dict:
        if len(positions) > MAX_LAYOUT_ENTRIES:
            raise Invalid(f"limit layout_entries ({MAX_LAYOUT_ENTRIES})")
        if any(not key or len(key) > 200 for key in positions):
            raise Invalid("layout keys must be 1 to 200 characters")
        with self._tx() as store:
            self._system(store, system_id, caller)
            store.put_layout(system_id, positions)
            return {"positions": store.get_layout(system_id)}


service = SystemService()
