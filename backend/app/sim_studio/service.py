"""Simulation Studio setups: draft, edit, validate and preflight (sim-adr-0017)."""

from __future__ import annotations

import hashlib
import json
from typing import Any, Callable, Optional

from pydantic import ValidationError

from app.core import errors, preconditions
from app.sim_studio import drafting, power_tree, validation
from app.sim_studio.board_facts import BoardFacts, from_semantic_index
from app.sim_studio.json_patch import PatchError, apply_patch
from app.sim_studio.models import DraftSetupRequest, SimSetup
from app.sim_studio.run_store import RunStore, public as public_run
from app.sim_studio.store import ETAG_KIND, LayoutStore, SetupStore


class InvalidSetup(errors.Invalid):
    code = "sim_setup_invalid"


FactsLoader = Callable[[Any, Optional[str]], BoardFacts]


def semantic_index_facts(project: Any, commit: Optional[str]) -> BoardFacts:
    from app.services import semantic_index_service

    return from_semantic_index(semantic_index_service.get_or_build(project, commit))


def canonical_sha256(document: dict[str, Any]) -> str:
    text = json.dumps(document, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _pointer(location: tuple[Any, ...]) -> str:
    return "".join("/" + str(part).replace("~", "~0").replace("/", "~1") for part in location)


def parse_setup(document: Any) -> SimSetup:
    """The document as a ``SimSetup``, or 422 naming every field that does not fit the contract."""

    try:
        return SimSetup.model_validate(document)
    except ValidationError as exc:
        problems = [
            {"path": _pointer(tuple(part for part in error["loc"] if part not in {"function-after"})),
             "message": error["msg"]}
            for error in exc.errors()
        ]
        summary = "; ".join(f"{item['path'] or '/'}: {item['message']}" for item in problems[:5])
        raise InvalidSetup(f"The setup does not match prism.sim.setup a0: {summary}", problems=problems) from exc


def record(row: dict[str, Any]) -> dict[str, Any]:
    source = {"project_path": row["project_path"]}
    if row.get("source_commit"):
        source["commit"] = row["source_commit"]
    return {
        "schema": "prism.sim.setup-record",
        "version": "a0",
        "setup_id": row["setup_id"],
        "project_id": row["project_id"],
        "etag": preconditions.etag(ETAG_KIND, row["setup_id"], row["revision"]),
        "revision": int(row["revision"]),
        "kind": row["kind"],
        "source": source,
        "created_by": row["created_by"],
        "created_at": row["created_at"].isoformat(),
        "updated_at": row["updated_at"].isoformat(),
        "setup": row["document"],
    }


def summary(row: dict[str, Any]) -> dict[str, Any]:
    full = record(row)
    return {key: full[key] for key in ("setup_id", "etag", "revision", "kind", "source", "updated_at")} | {
        "name": row["name"],
    }


class SimStudioService:
    def __init__(
        self, store: SetupStore | None = None, facts: FactsLoader = semantic_index_facts,
        runs: RunStore | None = None, layouts: LayoutStore | None = None,
    ) -> None:
        self.store = store or SetupStore()
        self.runs = runs or RunStore()
        self.layouts = layouts or LayoutStore()
        self._facts = facts

    def catalog(self) -> dict[str, Any]:
        return {
            "schema": "prism.sim.catalog",
            "version": "a0",
            "entries": [entry.model_dump(mode="json") for entry in drafting.CATALOG],
        }

    def list(self, project_id: str) -> list[dict[str, Any]]:
        return [summary(row) for row in self.store.list(project_id)]

    def read(self, project_id: str, setup_id: str) -> dict[str, Any]:
        return record(self.store.read(project_id, setup_id))

    def draft(self, project: Any, project_path: str, request: DraftSetupRequest, actor: str) -> dict[str, Any]:
        if request.kind not in drafting.AVAILABLE_KINDS:
            raise errors.Invalid(f"{request.kind!r} cannot be set up yet.", code="sim_kind_unavailable")
        facts = self._facts(project, request.commit)
        document = parse_setup(drafting.draft(request.kind, request.name, facts)).document()
        row = self.store.create(
            project_id=str(project.id), kind=request.kind, name=request.name, source_commit=request.commit,
            project_path=project_path, document=document, created_by=actor,
        )
        return record(row)

    def replace(self, project_id: str, setup_id: str, expected_revision: Optional[int], document: Any) -> dict[str, Any]:
        setup = parse_setup(document).document()
        row = self.store.update(project_id, setup_id, expected_revision=expected_revision, change=lambda _old: setup)
        return record(row)

    def patch(self, project_id: str, setup_id: str, expected_revision: Optional[int], operations: Any) -> dict[str, Any]:
        def change(current: dict[str, Any]) -> dict[str, Any]:
            try:
                patched = apply_patch(current, operations)
            except PatchError as exc:
                raise InvalidSetup(f"The patch does not apply: {exc}", code="sim_setup_patch_failed") from exc
            return parse_setup(patched).document()

        return record(self.store.update(project_id, setup_id, expected_revision=expected_revision, change=change))

    def power_tree(self, project: Any, commit: Optional[str]) -> dict[str, Any]:
        """The power tree Prism infers from the netlist, as setup fragments plus notes."""

        return power_tree.infer(self._facts(project, commit)).document()

    def read_layout(self, project_id: str, setup_id: str) -> dict[str, Any]:
        self.store.read(project_id, setup_id)
        return self.layouts.read(setup_id)

    def write_layout(self, project_id: str, setup_id: str, layout: dict[str, Any]) -> dict[str, Any]:
        self.store.read(project_id, setup_id)
        return self.layouts.write(setup_id, layout)

    def delete(self, project_id: str, setup_id: str, expected_revision: Optional[int]) -> None:
        self.store.delete(project_id, setup_id, expected_revision=expected_revision)

    def check(self, project: Any, setup_id: str, stage: str) -> dict[str, Any]:
        row = self.store.read(str(project.id), setup_id)
        setup = parse_setup(row["document"])
        facts = self._facts(project, row.get("source_commit"))
        run = validation.preflight if stage == "preflight" else validation.validate
        return validation.report(stage, canonical_sha256(row["document"]), run(setup, facts))

    def submit(
        self, project: Any, setup_id: str, expected_revision: Optional[int], analysis_id: str, actor: str,
    ) -> dict[str, Any]:
        from app.sim_studio import runs

        return runs.submit(project, setup_id, expected_revision, analysis_id, actor,
                           self._facts, setups=self.store, runs=self.runs)

    def list_runs(self, project_id: str) -> list[dict[str, Any]]:
        return [public_run(row) for row in self.runs.list(project_id)]

    def read_run(self, project_id: str, run_id: str) -> dict[str, Any]:
        return public_run(self.runs.read(run_id, project_id))

    def run_row(self, project_id: str, run_id: str) -> dict[str, Any]:
        return self.runs.read(run_id, project_id)


sim_studio = SimStudioService()
