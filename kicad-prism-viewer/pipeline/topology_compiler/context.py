from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from .copper_geometry import (
    NativeSemanticMeshPack,
    compile_rust_semantic_mesh_pack,
    copper_emit_available,
    emit_copper_geometry,
    extract_pcb_metadata_from_copper,
    extract_pcb_metadata_from_mesh_pack,
    pcb_geometry_backend,
    rust_geometry_available,
)
from .pcb_extract import compile_pcb_artifacts


@dataclass(frozen=True)
class BoardCompilation:
    pcb_ir: dict[str, Any] | None
    copper_geometry: Any | None
    semantic_mesh_pack: NativeSemanticMeshPack | None
    metadata: dict[str, Any]
    pad_holes: dict[str, dict[str, Any]]


@dataclass
class PrismCompilationContext:
    project_file: Path
    compatibility_design_json: bool = False
    progress: Callable[[str], None] | None = None
    profile: Callable[[str, dict[str, Any]], None] | None = None
    native_semantic_output: Path | None = None
    semantic_tile_size: str = "auto"
    semantic_mesh_tolerance_mm: float = 0.005
    semantic_meshopt_level: str = "medium"
    timings: dict[str, float] = field(default_factory=dict)
    _design: Any = None
    _board_compilation: BoardCompilation | None = None
    _design_payload_for_topology: dict[str, Any] | None = None

    def _log(self, message: str) -> None:
        if self.progress:
            self.progress(message)

    def _timed(self, key: str, label: str, factory):
        started = time.perf_counter()
        self._log(f"START {label}")
        try:
            return factory()
        finally:
            elapsed = (time.perf_counter() - started) * 1000.0
            self.timings[key] = self.timings.get(key, 0.0) + elapsed
            if self.profile:
                self.profile(key, {"elapsed_ms": elapsed})
            self._log(f"DONE {label} ({elapsed / 1000.0:.1f}s)")

    def _board_compilation_profile(self, key: str, values: dict[str, Any]) -> None:
        if self.profile:
            self.profile(f"board_compilation.{key}", values)

    @property
    def design(self):
        if self._design is None:
            def load():
                from kicad_monkey import KiCadDesign  # type: ignore

                return KiCadDesign.from_project_file(self.project_file)

            self._design = self._timed("design_load_ms", "load KiCad project with kicad_monkey", load)
        return self._design

    @property
    def pcb_path(self) -> Path:
        conventional = self.project_file.with_suffix(".kicad_pcb")
        if conventional.is_file():
            return conventional
        design_path = getattr(self.design, "pcb_path", None)
        if design_path:
            return Path(design_path)
        return conventional

    @property
    def pcb(self):
        return self.design.pcb

    @property
    def netlist(self):
        def build():
            return getattr(self.design, "netlist", None)

        if "netlist_ms" not in self.timings:
            return self._timed("netlist_ms", "resolve KiCad netlist", build)
        return getattr(self.design, "netlist", None)

    @property
    def design_payload_for_topology(self) -> dict[str, Any]:
        if self._design_payload_for_topology is None:
            self._design_payload_for_topology = self._timed(
                "design_json_topology_ms",
                "compile topology-only netlist JSON",
                lambda: (
                    self.design.to_json(include_indexes=True)
                    if self.compatibility_design_json
                    else self.design.to_netlist_json()
                ),
            )
        return self._design_payload_for_topology

    @property
    def pcb_ir(self):
        return self.board_compilation.pcb_ir

    @property
    def semantic_geometry_source(self):
        compilation = self.board_compilation
        return compilation.semantic_mesh_pack or compilation.copper_geometry or compilation.pcb_ir

    @property
    def semantic_mesh_pack(self) -> NativeSemanticMeshPack | None:
        return self.board_compilation.semantic_mesh_pack

    @property
    def pad_holes(self) -> dict[str, Any]:
        return self.board_compilation.pad_holes

    @property
    def pcb_metadata(self) -> dict[str, Any]:
        return self.board_compilation.metadata

    def _compile_python_copper_board(self) -> BoardCompilation:
        # Resolve the board path from the design sidecar only. Accessing
        # ``self.pcb`` would hydrate a full KiCadPcb and erase the copper-path win.
        pcb_file = self.pcb_path
        copper_geometry = self._timed(
            "copper_emit_ms",
            "emit renderer-ready PCB copper geometry",
            lambda: emit_copper_geometry(pcb_file),
        )
        metadata = self._timed(
            "pcb_metadata_copper_ms",
            "derive PCB topology indexes from copper geometry",
            lambda: extract_pcb_metadata_from_copper(
                self.project_file,
                copper_geometry,
                profile_callback=self._board_compilation_profile,
            ),
        )
        self.timings.setdefault("copper_emit_ms", 0.0)
        self.timings.setdefault("pcb_metadata_copper_ms", 0.0)
        return BoardCompilation(
            pcb_ir=None,
            copper_geometry=copper_geometry,
            semantic_mesh_pack=None,
            metadata=metadata,
            pad_holes={},
        )

    def _compile_rust_board(self) -> BoardCompilation:
        if not rust_geometry_available():
            raise RuntimeError(
                "PRISM_PCB_GEOMETRY_BACKEND=rust requires an executable "
                "prism-kicad-native helper; set PRISM_KICAD_NATIVE_PATH when running from source"
            )
        pcb_file = self.pcb_path
        if self.native_semantic_output is None:
            raise RuntimeError("Rust semantic compilation requires a native output directory")
        semantic_mesh_pack = self._timed(
            "rust_semantic_compile_ms",
            "compile native analytic PCB semantic mesh pack",
            lambda: compile_rust_semantic_mesh_pack(
                pcb_file,
                self.native_semantic_output,
                tile_size=self.semantic_tile_size,
                mesh_tolerance_mm=self.semantic_mesh_tolerance_mm,
                meshopt_level=self.semantic_meshopt_level,
            ),
        )
        self._log(
            "PCB geometry backend: rust-packed; "
            f"schema: {semantic_mesh_pack.payload.get('schema')}; "
            f"features: {len(semantic_mesh_pack.payload.get('objectFeatures') or ()) - 1}; "
            f"tiles: {len(semantic_mesh_pack.payload.get('tiles') or ())}"
        )
        for diagnostic in semantic_mesh_pack.payload.get("diagnostics") or ():
            self._log(
                "PCB geometry diagnostic: "
                f"{diagnostic.get('severity', 'warning')} "
                f"{diagnostic.get('code', 'native')}: {diagnostic.get('message', '')}"
            )
        if self.profile:
            self.profile(
                "rust_geometry_contract",
                {
                    "schema": semantic_mesh_pack.payload.get("schema"),
                    "kicad_monkey_revision": semantic_mesh_pack.payload.get("kicadMonkeyRevision"),
                    "features": len(semantic_mesh_pack.payload.get("objectFeatures") or ()) - 1,
                    "barrels": len(semantic_mesh_pack.payload.get("barrels") or ()),
                    "tiles": len(semantic_mesh_pack.payload.get("tiles") or ()),
                    "diagnostics": len(semantic_mesh_pack.payload.get("diagnostics") or ()),
                    **semantic_mesh_pack.metrics,
                },
            )
        metadata = self._timed(
            "pcb_metadata_rust_ms",
            "derive PCB topology indexes from native semantic tables",
            lambda: extract_pcb_metadata_from_mesh_pack(
                self.project_file,
                semantic_mesh_pack,
                profile_callback=self._board_compilation_profile,
            ),
        )
        return BoardCompilation(
            pcb_ir=None,
            copper_geometry=None,
            semantic_mesh_pack=semantic_mesh_pack,
            metadata=metadata,
            pad_holes={},
        )

    def _compile_ir_board(self) -> BoardCompilation:
        ir_document = self._timed(
            "pcb_ir_ms",
            "compile PCB IR",
            self.design.to_pcb_ir,
        )
        ir_payload = self._timed(
            "pcb_ir_to_dict_ms",
            "materialize PCB IR payload",
            ir_document.to_dict,
        )
        metadata, pad_holes = self._timed(
            "pcb_metadata_unified_ms",
            "derive PCB topology indexes from IR",
            lambda: compile_pcb_artifacts(
                self.pcb,
                self.project_file,
                ir_payload,
                profile_callback=self._board_compilation_profile,
            ),
        )
        return BoardCompilation(
            pcb_ir=ir_payload,
            copper_geometry=None,
            semantic_mesh_pack=None,
            metadata=metadata,
            pad_holes=pad_holes,
        )

    @property
    def board_compilation(self) -> BoardCompilation:
        if self._board_compilation is None:
            backend = pcb_geometry_backend()
            if backend == "rust":
                factory = self._compile_rust_board
            elif backend == "python-copper":
                if not copper_emit_available():
                    raise RuntimeError(
                        "PRISM_PCB_GEOMETRY_BACKEND=python-copper requires "
                        "kicad_monkey.emit_pcb_copper_geometry"
                    )
                factory = self._compile_python_copper_board
            else:
                factory = self._compile_ir_board
            self._log(f"PCB geometry backend: {backend}")
            self._board_compilation = self._timed(
                "board_compilation_ms",
                "compile unified PCB artifacts",
                factory,
            )
        return self._board_compilation
