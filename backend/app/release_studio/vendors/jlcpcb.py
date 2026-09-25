"""JLCPCB SMT upload profile.

Cruncher's ``jlc`` command emits XLSX only. Release Studio also asks for the
CSV equivalents so the attested dossier members can use the existing CSV
canonicalizer. The XLSX pair stays in evidence and is copied into the derived
upload zip.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import time
from fnmatch import fnmatch
from pathlib import Path
from typing import Any, Sequence

from .registry import CruncherRunner, VendorArtifacts

#: Pinned BOM/PnP configuration. Hashed into ``toolchain_digest`` by
#: ``documents.renderer_resource_digest`` so editing it moves ``build_key``
#: rather than changing a vendor pack under an unchanged one.
VENDOR_CONFIG = Path(__file__).with_name("jlcpcb.config.jsonc")


class JlcpcbProfile:
    id = "jlcpcb"
    title = "JLCPCB"
    pack_filename = "jlcpcb-upload.zip"
    description = (
        "Gerbers, drill, and JLCPCB SMT BOM/CPL workbooks for the JLCPCB "
        "order form. The signed release archive remains the attested record."
    )
    # These are deliberately semantic names rather than archive paths: pack
    # readiness tells an operator what is missing without requiring them to
    # understand the dossier/evidence split.
    required_pack_artifacts = (
        "gerber",
        "drill",
        "bom.csv",
        "cpl.csv",
        "bom.xlsx",
        "cpl.xlsx",
    )

    def generate(
        self,
        *,
        cruncher_path: str,
        design_file: Path,
        output_root: Path,
        variant: str = "",
        runner: CruncherRunner | None = None,
        timeout_seconds: int = 900,
    ) -> VendorArtifacts:
        workdir = output_root / "_vendor_work" / self.id
        if workdir.exists():
            shutil.rmtree(workdir)
        workdir.mkdir(parents=True)

        execute = runner or _default_runner
        env = os.environ.copy()
        env["KIPRJMOD"] = str(design_file.resolve().parent)
        argv_record: list[str] = []
        started = time.perf_counter()

        # One invocation per tool, not one per format. `--format` overrides
        # config mode and emits a single kind, so the four formats used to cost
        # four full parses of the design; the config lists all four and each
        # tool loads once. Two is the floor: the BOM comes from the schematic
        # side and the placement from the board.
        commands: tuple[tuple[str, Path, tuple[str, ...]], ...] = (
            ("bom", workdir, ("bom", "--config", str(VENDOR_CONFIG))),
            ("pnp", workdir, ("pnp", "--config", str(VENDOR_CONFIG))),
        )
        stdout_parts: list[str] = []
        stderr_parts: list[str] = []
        for _label, destination, parts in commands:
            argv = [cruncher_path, *parts, str(design_file), "-o", str(destination)]
            if variant:
                argv.extend(("--variant", variant))
            argv_record.append(" ".join(_normalize_argv(argv, design_file, output_root)))
            result = execute(
                argv,
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
                env=env,
                cwd=str(design_file.parent),
            )
            code = int(getattr(result, "returncode", 1) or 0)
            stdout_parts.append(getattr(result, "stdout", "") or "")
            stderr_parts.append(getattr(result, "stderr", "") or "")
            if code != 0:
                detail = (stderr_parts[-1] or stdout_parts[-1]).strip()
                raise VendorGenerateError(
                    f"kicad-cruncher {' '.join(parts[:2])} failed: {detail[:400]}"
                )

        dest = output_root / "manufacturing" / "vendors" / self.id
        dest.mkdir(parents=True, exist_ok=True)
        evidence_root = output_root / "_vendor_evidence" / self.id
        evidence_root.mkdir(parents=True, exist_ok=True)

        # Config mode names outputs by kind rather than by tool, and writes
        # them all under one root, so the patterns name the kind explicitly.
        bom_csv = _require_one(workdir, "*jlc-csv.csv", "JLC BOM CSV")
        cpl_csv = _require_one(workdir, "*jlc-cpl.csv", "JLC CPL CSV")
        bom_xlsx = _require_one(workdir, "*jlc-xlsx.xlsx", "JLC BOM XLSX")
        cpl_xlsx = _require_one(workdir, "*jlc-cpl-xlsx.xlsx", "JLC CPL XLSX")

        canonical = {
            "manufacturing/vendors/jlcpcb/bom.csv": _copy(bom_csv, dest / "bom.csv"),
            "manufacturing/vendors/jlcpcb/cpl.csv": _copy(cpl_csv, dest / "cpl.csv"),
        }
        evidence = {
            "vendors/jlcpcb/bom.xlsx": _copy(bom_xlsx, evidence_root / "bom.xlsx"),
            "vendors/jlcpcb/cpl.xlsx": _copy(cpl_xlsx, evidence_root / "cpl.xlsx"),
        }
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return VendorArtifacts(
            canonical_files=canonical,
            evidence_files=evidence,
            stdout="\n".join(part for part in stdout_parts if part),
            stderr="\n".join(part for part in stderr_parts if part),
            elapsed_ms=elapsed_ms,
            returncode=0,
            normalized_argv=tuple(argv_record),
        )


class VendorGenerateError(RuntimeError):
    """A vendor generator could not produce its files."""


def _copy(source: Path, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    return destination


def _require_one(directory: Path, pattern: str, label: str) -> Path:
    matches = sorted(
        path
        for path in directory.rglob("*")
        if path.is_file() and fnmatch(path.name, pattern)
    )
    if not matches:
        raise VendorGenerateError(f"{label} was not produced under {directory}")
    return matches[0]


def _normalize_argv(argv: Sequence[str], design_file: Path, output_root: Path) -> list[str]:
    normalized: list[str] = []
    for part in argv:
        if part == str(design_file):
            normalized.append(design_file.name)
        elif part == str(VENDOR_CONFIG):
            # An install path is not part of the build's identity, and recording
            # one would make the same build differ between two checkouts. The
            # config's *content* is already bound through toolchain_digest.
            normalized.append(VENDOR_CONFIG.name)
        elif part.startswith(str(output_root)):
            normalized.append(Path(part).relative_to(output_root).as_posix())
        elif part.endswith("kicad-cruncher") or part.endswith("kicad-cruncher.exe"):
            normalized.append("kicad-cruncher")
        else:
            normalized.append(part)
    return normalized


def _default_runner(*args: Any, **kwargs: Any) -> Any:
    return subprocess.run(*args, **kwargs)


JLCPCB_PROFILE = JlcpcbProfile()
