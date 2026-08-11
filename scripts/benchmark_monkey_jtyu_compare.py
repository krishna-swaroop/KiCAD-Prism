#!/usr/bin/env python3
"""Head-to-head kicad-monkey microbench on a checked-out KiCad project.

Measures the Design Comparison semantic path (schematic-only and full PCB)
against two monkey source trees selected via KICAD_MONKEY_PYTHONPATH.
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
from pathlib import Path
from typing import Any, Callable


if os.environ.get("PYTHONHASHSEED") is None:
    os.environ["PYTHONHASHSEED"] = "0"
    os.execv(sys.executable, [sys.executable, *sys.argv])


def _ensure_backend_on_path() -> None:
    """Prefer an explicit PYTHONPATH layout; fall back to repo-relative paths."""

    for candidate in (
        Path("/app"),
        Path("/app/backend"),
        Path(__file__).resolve().parents[1],
        Path(__file__).resolve().parents[1] / "backend",
    ):
        if (candidate / "app").is_dir() and str(candidate) not in sys.path:
            sys.path.insert(0, str(candidate))
            return


_ensure_backend_on_path()


def _median(values: list[float]) -> float:
    return float(statistics.median(values)) if values else 0.0


def _band_pct(values: list[float]) -> float | None:
    if len(values) < 2:
        return None
    med = _median(values)
    if med <= 0:
        return None
    return 100.0 * (max(values) - min(values)) / med


def _ms(ns: int) -> float:
    return ns / 1_000_000.0


def _probe_monkey() -> dict[str, Any]:
    import importlib
    import inspect
    import pathlib

    import kicad_monkey
    from kicad_monkey import KiCadDesign
    import kicad_monkey.kicad_sexpr as sx
    from kicad_monkey.kicad_pcb import KiCadPcb

    text = pathlib.Path(sx.__file__).read_text()
    return {
        "file": str(pathlib.Path(kicad_monkey.__file__).resolve()),
        "versionAttr": getattr(kicad_monkey, "__version__", None),
        "toJsonParams": list(inspect.signature(KiCadDesign.to_json).parameters),
        "hasNetTable": hasattr(KiCadPcb, "net_table"),
        "finditerLexer": "token_re.finditer" in text,
        "matchLexer": "token_re.match(text, self.pos)" in text,
        "envPythonpath": os.environ.get("KICAD_MONKEY_PYTHONPATH"),
    }


def _timed(action: Callable[[], Any]) -> tuple[Any, float]:
    started = time.perf_counter_ns()
    result = action()
    return result, _ms(time.perf_counter_ns() - started)


def _run_semantic(
    project_file: Path,
    *,
    include_pcb: bool,
    rounds: int,
) -> dict[str, Any]:
    from app.services import semantic_index_service

    # Force configure-imports to pick up KICAD_MONKEY_PYTHONPATH first.
    semantic_index_service._add_kicad_monkey_import_paths()

    # Drop any previously imported monkey so the selected tree wins.
    for name in list(sys.modules):
        if name == "kicad_monkey" or name.startswith("kicad_monkey."):
            del sys.modules[name]

    probe = _probe_monkey()
    phase_samples: dict[str, list[float]] = {}
    totals: list[float] = []
    last_counts: dict[str, int] = {}

    for _ in range(rounds):
        events: list[dict[str, Any]] = []

        def timing_callback(event: dict[str, Any]) -> None:
            events.append(event)

        started = time.perf_counter_ns()
        payload = semantic_index_service.build_semantic_index(
            project_file,
            source_revision_key="bench",
            commit=None,
            timing_callback=timing_callback,
            include_pcb=include_pcb,
            include_components=True,
        )
        totals.append(_ms(time.perf_counter_ns() - started))
        for event in events:
            phase = str(event.get("phase") or "unknown")
            phase_samples.setdefault(phase, []).append(_ms(int(event.get("elapsedNs") or 0)))
        last_counts = {
            "components": len(payload.get("components") or []),
            "nets": len(payload.get("nets") or []),
            "terminals": len(payload.get("terminals") or []),
            "sheetInstances": len(payload.get("sheetInstances") or []),
        }

    phases = {
        phase: {
            "medianMs": round(_median(samples), 3),
            "bandPct": None if _band_pct(samples) is None else round(_band_pct(samples), 2),
            "samplesMs": [round(v, 3) for v in samples],
        }
        for phase, samples in sorted(phase_samples.items())
    }
    return {
        "includePcb": include_pcb,
        "rounds": rounds,
        "probe": probe,
        "totalMedianMs": round(_median(totals), 3),
        "totalBandPct": None if _band_pct(totals) is None else round(_band_pct(totals), 2),
        "totalsMs": [round(v, 3) for v in totals],
        "counts": last_counts,
        "phases": phases,
    }


def _run_raw_parse(project_file: Path, *, rounds: int) -> dict[str, Any]:
    from app.services import semantic_index_service

    semantic_index_service._add_kicad_monkey_import_paths()
    for name in list(sys.modules):
        if name == "kicad_monkey" or name.startswith("kicad_monkey."):
            del sys.modules[name]

    from kicad_monkey import KiCadDesign

    probe = _probe_monkey()
    load_samples: list[float] = []
    json_false_samples: list[float] = []
    json_true_samples: list[float] = []
    pcb_samples: list[float] = []
    net_resolve_samples: list[float] = []
    net_table_samples: list[float] = []
    supports_include_pcb = "include_pcb" in probe["toJsonParams"]
    has_net_table = bool(probe["hasNetTable"])

    for _ in range(rounds):
        design, load_ms = _timed(lambda: KiCadDesign.from_project_file(project_file))
        load_samples.append(load_ms)

        if supports_include_pcb:
            _, false_ms = _timed(lambda: design.to_json(include_indexes=True, include_pcb=False))
            json_false_samples.append(false_ms)
            _, true_ms = _timed(lambda: design.to_json(include_indexes=True, include_pcb=True))
            json_true_samples.append(true_ms)
        else:
            _, true_ms = _timed(lambda: design.to_json(include_indexes=True))
            json_true_samples.append(true_ms)

        pcb, pcb_ms = _timed(lambda: design.pcb)
        pcb_samples.append(pcb_ms)
        if pcb is None:
            continue

        def resolve_all_naive() -> int:
            count = 0
            for footprint in getattr(pcb, "footprints", ()) or ():
                for pad in getattr(footprint, "pads", ()) or ():
                    pcb.resolve_net_name(getattr(pad, "net", None))
                    count += 1
            for collection in ("tracks", "arcs", "vias", "zones"):
                for item in getattr(pcb, collection, ()) or ():
                    pcb.resolve_net_name(getattr(item, "net", None))
                    count += 1
            return count

        _, naive_ms = _timed(resolve_all_naive)
        net_resolve_samples.append(naive_ms)

        if has_net_table:
            def resolve_all_table() -> int:
                table = pcb.net_table()
                count = 0
                for footprint in getattr(pcb, "footprints", ()) or ():
                    for pad in getattr(footprint, "pads", ()) or ():
                        table.name_of(getattr(pad, "net", None))
                        count += 1
                for collection in ("tracks", "arcs", "vias", "zones"):
                    for item in getattr(pcb, collection, ()) or ():
                        table.name_of(getattr(item, "net", None))
                        count += 1
                return count

            _, table_ms = _timed(resolve_all_table)
            net_table_samples.append(table_ms)

    def pack(samples: list[float]) -> dict[str, Any] | None:
        if not samples:
            return None
        return {
            "medianMs": round(_median(samples), 3),
            "bandPct": None if _band_pct(samples) is None else round(_band_pct(samples), 2),
            "samplesMs": [round(v, 3) for v in samples],
        }

    return {
        "probe": probe,
        "supportsIncludePcb": supports_include_pcb,
        "hasNetTable": has_net_table,
        "loadProject": pack(load_samples),
        "toJsonIncludePcbFalse": pack(json_false_samples),
        "toJsonIncludePcbTrueOrDefault": pack(json_true_samples),
        "loadPcb": pack(pcb_samples),
        "resolveNetsNaive": pack(net_resolve_samples),
        "resolveNetsNetTable": pack(net_table_samples),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("project_file", type=Path)
    parser.add_argument("--label", required=True)
    parser.add_argument("--rounds", type=int, default=3)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    project_file = args.project_file.resolve()
    if not project_file.is_file():
        raise SystemExit(f"missing project file: {project_file}")

    payload = {
        "schema": "prism.monkey_jtyu_head_to_head.v1",
        "label": args.label,
        "projectFile": str(project_file),
        "kicadMonkeyPythonpath": os.environ.get("KICAD_MONKEY_PYTHONPATH"),
        "rawParse": _run_raw_parse(project_file, rounds=args.rounds),
        "semanticSchematicOnly": _run_semantic(
            project_file, include_pcb=False, rounds=args.rounds
        ),
        "semanticWithPcb": _run_semantic(
            project_file, include_pcb=True, rounds=args.rounds
        ),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2) + "\n")
    print(json.dumps({
        "label": args.label,
        "output": str(args.output),
        "schematicOnlyMedianMs": payload["semanticSchematicOnly"]["totalMedianMs"],
        "withPcbMedianMs": payload["semanticWithPcb"]["totalMedianMs"],
        "loadProjectMedianMs": (payload["rawParse"]["loadProject"] or {}).get("medianMs"),
        "probe": payload["rawParse"]["probe"],
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
