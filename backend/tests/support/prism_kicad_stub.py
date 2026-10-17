#!/usr/bin/env python3
"""A stand-in for ``prism-kicad`` in WP-K's tests (cli-spec.md §10).

It accepts the grammar of cli-spec.md §2, writes real archives by §6.1's zip
rules, atomically (§5.2.5), and prints the one stdout document each exit code
names (§3.1). Its members are the contract examples, not parsed designs, so K
may rely on the documents, exit codes, ``-o`` semantics, stages, the generator
bytes and the bundle key, never on archive bytes or messages.

Failure injection, ``PRISM_KICAD_STUB_MODE``: a comma-separated list of
``<command>[:<stage>]=<mode>`` with ``<command>`` one of ``version``,
``bundle build``, ``bundle verify``, ``bundle extract``, ``revision-key``, and
``<mode>`` one of ``exit:<1-7>``, ``failed``, ``partial``, ``absent``, ``hang``,
``crash``, ``garbage-stderr``. ``PRISM_KICAD_STUB_LOG`` names a file that gets
one ``{"argv": [...], "exit": n}`` line per invocation.

Standalone on purpose: it imports nothing from ``app``.
"""

from __future__ import annotations

import hashlib
import json
import os
import struct
import sys
import time
import zlib
from pathlib import Path
from typing import Any, NoReturn

REPO = Path(__file__).resolve().parents[3]
EXAMPLES = Path(os.environ.get("PRISM_KICAD_STUB_EXAMPLES") or REPO / "native" / "contracts" / "prism" / "examples")
PROJECTIONS = {
    "projections/board-objects.json": "BoardObjectsA0",
    "projections/occurrences.json": "OccurrencesA0",
    "projections/placements.json": "PlacementsA0",
    "projections/project.json": "ProjectA0",
    "projections/route-metrics.json": "RouteMetricsA0",
    "projections/semantic-index.json": "SemanticIndexA2",
    "projections/stackup.json": "StackupA0",
    "projections/system-interface.json": "SystemInterfaceV1",
}
PACK_PLACEHOLDER = b"KMMATPK\0" + struct.pack("<H", 0) + b"\0" * 6
CATEGORY_ROLE = {
    ".kicad_pro": "source-project", ".kicad_sch": "source-schematic", ".kicad_pcb": "source-board",
    ".kicad_dru": "source-design-rules", ".kicad_wks": "source-worksheet", ".kicad_jobset": "source-jobset",
}
NAME_ROLE = {"fp-lib-table": "source-library-table", "sym-lib-table": "source-library-table", ".prism.json": "source-prism-settings"}
CATEGORIES = {1: "internal", 2: "usage", 3: "input", 4: "resource-limit", 5: "timeout", 6: "output-io", 7: "precondition"}
OPTIONS_WITH_VALUE = {
    "--stage", "-o", "--output", "--source-root", "--revision-key", "--key-record", "--config", "--in",
    "--refilled-board", "--refill-tool", "--models-glb", "--models-tool", "--commit", "--project", "--limit",
    "--threads", "--upgraded",
}
FLAGS = {"--worktree", "--quiet"}
_ARGV = list(sys.argv[1:])


class Exit(Exception):
    def __init__(self, code: int, document: dict[str, Any] | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.document = document


def compact(document: Any) -> bytes:
    return json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def diagnostic(severity: str, code: str, message: str, **extra: Any) -> None:
    line = {"schema": "prism.cli.diagnostic.a0", "severity": severity, "code": code, "message": message, **extra}
    sys.stderr.write(compact(line).decode("utf-8") + "\n")


def error(exit_code: int, code: str, message: str, **extra: Any) -> NoReturn:
    document = {"schema": "prism.cli.error.a0", "category": CATEGORIES[exit_code], "code": code, "message": message, **extra}
    diagnostic("error", code, message, **{k: v for k, v in extra.items() if k in ("stage", "argument", "location", "limit")})
    raise Exit(exit_code, document)


def example(root: str) -> dict[str, Any]:
    return json.loads((EXAMPLES / f"{root}.example.json").read_text(encoding="utf-8"))


def generator() -> dict[str, Any]:
    return example("CliVersionA0")


def generator_bytes(doc: dict[str, Any]) -> bytes:
    def order(value: Any) -> Any:
        if isinstance(value, dict):
            return {k: order(value[k]) for k in sorted(value)}
        if isinstance(value, list):
            return [order(v) for v in value]
        return value

    top = {"schema": doc["schema"], **{k: order(doc[k]) for k in sorted(doc) if k != "schema"}}
    return json.dumps(top, separators=(",", ":"), ensure_ascii=True).encode("ascii")


def same_kicad_release(tool: str, pinned: str) -> bool:
    """decisions.md, KiCad patch releases: a tool serves a generator of the same major.minor."""

    return tool.split(".")[:2] == pinned.split(".")[:2]


def modes(command: str, stage: str | None = None) -> list[str]:
    found = []
    for item in filter(None, (part.strip() for part in os.environ.get("PRISM_KICAD_STUB_MODE", "").split(","))):
        key, _, mode = item.rpartition("=")
        if key in (command, f"{command}:{stage}" if stage else command):
            found.append(mode)
    return found


def apply_modes(command: str, stage: str | None = None) -> list[str]:
    active = modes(command, stage)
    if "garbage-stderr" in active:
        sys.stderr.write("thread 'main' panicked before the hook: this line is not JSON\n")
    if "crash" in active:
        raise Exit(101)
    if "hang" in active:
        while True:
            time.sleep(60)
    for mode in active:
        if mode.startswith("exit:"):
            code = int(mode.split(":", 1)[1])
            limit = None
            if code == 4:
                limit = {"kind": "bytes", "name": "max-memory-bytes", "limit_bytes": 1024}
            elif code == 5:
                limit = {"kind": "time", "name": "timeout-ms", "limit_ms": 1000}
            extra = {"stage": stage} if stage else {}
            if limit:
                extra["limit"] = limit
            error(code, {1: "panic", 2: "usage", 3: "input-not-found", 4: "limit-exceeded", 5: "timeout",
                         6: "output-write-failed", 7: "stage-order"}[code], f"injected exit {code}", **extra)
    return active


# --------------------------------------------------------------- arguments


def parse_options(words: list[str]) -> tuple[list[str], dict[str, Any]]:
    positionals: list[str] = []
    options: dict[str, Any] = {"--limit": [], "--upgraded": []}
    index = 0
    while index < len(words):
        word = words[index]
        if word in ("-h", "--help"):
            sys.stdout.write("prism-kicad stub (tests only)\n")
            raise Exit(0, None)
        if word.startswith("-") and word != "-":
            if "=" in word:
                error(2, "usage", f"{word.split('=', 1)[0]} takes its value as the next argument")
            if word in FLAGS:
                if word in options:
                    error(2, "usage", f"{word} given twice")
                options[word] = True
            elif word in OPTIONS_WITH_VALUE:
                if index + 1 >= len(words):
                    error(2, "usage", f"{word} needs a value")
                value = words[index + 1]
                index += 1
                key = "-o" if word == "--output" else word
                if key in ("--limit", "--upgraded"):
                    options[key].append(value)
                elif key in options:
                    error(2, "usage", f"{word} given twice")
                else:
                    options[key] = value
            else:
                error(2, "usage", f"unknown option {word}")
        else:
            positionals.append(word)
        index += 1
    for limit in options["--limit"]:
        name, _, value = limit.partition("=")
        if not name or not value.isdigit():
            error(2, "usage", f"--limit {limit!r} is not <name>=<value>", argument="limit")
    upgraded: dict[str, int] = {}
    for item in options["--upgraded"]:
        path, _, version = item.rpartition("=")
        if not path.lower().endswith((".kicad_pcb", ".kicad_sch")) or not version.isdigit() or path.startswith("/") or ".." in path.split("/"):
            error(2, "usage", f"--upgraded {item!r} is not <RepoPath>=<version>", argument="upgraded")
        if path in upgraded:
            error(2, "usage", f"--upgraded {path} given twice", argument="upgraded")
        upgraded[path] = int(version)
    options["--upgraded"] = upgraded
    if "--threads" in options and not (options["--threads"].isdigit() and 1 <= int(options["--threads"]) <= 64):
        error(2, "usage", "--threads is 1 to 64", argument="threads")
    return positionals, options


def require_hex(value: str | None, argument: str) -> None:
    if value is not None and (len(value) != 64 or value.strip("0123456789abcdef")):
        error(2, "usage", f"--{argument} is not 64 lowercase hex digits", argument=argument)


# ----------------------------------------------------------------- archive


def deflate(data: bytes) -> tuple[int, bytes]:
    if not data:
        return 0, data
    compressor = zlib.compressobj(6, zlib.DEFLATED, -15)
    packed = compressor.compress(data) + compressor.flush()
    return (8, packed) if len(packed) < len(data) else (0, data)


def zip_bytes(entries: list[tuple[str, bytes]]) -> bytes:
    """cli-spec.md §6.1: version 20, flags 0x0800, DOS 1980-01-01, no extras, canonical layout."""

    out = bytearray()
    central = bytearray()
    for name, data in entries:
        method, packed = deflate(data)
        raw_name = name.encode("utf-8")
        crc = zlib.crc32(data)
        offset = len(out)
        out += struct.pack("<IHHHHHIIIHH", 0x04034B50, 20, 0x0800, method, 0, 0x21, crc, len(packed), len(data), len(raw_name), 0)
        out += raw_name + packed
        central += struct.pack(
            "<IHHHHHHIIIHHHHHII", 0x02014B50, 20, 20, 0x0800, method, 0, 0x21, crc, len(packed), len(data),
            len(raw_name), 0, 0, 0, 0, 0, offset,
        ) + raw_name
    cd_offset = len(out)
    out += central
    out += struct.pack("<IHHHHIIH", 0x06054B50, 0, 0, len(entries), len(entries), len(central), cd_offset, 0)
    return bytes(out)


def read_zip(path: Path) -> list[tuple[str, bytes]]:
    """The stub's own reader: it trusts the layout and checks only CRCs."""

    data = path.read_bytes()
    _, _, _, count, _, _, cd_offset, _ = struct.unpack("<IHHHHIIH", data[-22:])
    entries, offset = [], cd_offset
    for _ in range(count):
        fields = struct.unpack_from("<IHHHHHHIIIHHHHHII", data, offset)
        method, crc, csize, size, name_length, local = fields[4], fields[7], fields[8], fields[9], fields[10], fields[16]
        name = data[offset + 46: offset + 46 + name_length].decode("utf-8")
        offset += 46 + name_length
        start = local + 30 + name_length
        raw = data[start: start + csize]
        content = zlib.decompress(raw, -15) if method == 8 else raw
        if zlib.crc32(content) != crc or len(content) != size:
            raise ValueError(f"{name}: bad CRC or size")
        entries.append((name, content))
    return entries


def write_atomic(output: Path, data: bytes) -> None:
    if not output.parent.is_dir():
        error(6, "output-write-failed", "the output directory does not exist", argument="output")
    temp = output.parent / f".{output.name}.prism-kicad-{os.getpid()}-0.tmp"
    with open(temp, "xb") as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temp, output)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# ------------------------------------------------------------------- build


def source_role(name: str) -> str | None:
    lowered = name.lower()
    if lowered in NAME_ROLE:
        return NAME_ROLE[lowered]
    return next((role for suffix, role in CATEGORY_ROLE.items() if lowered.endswith(suffix)), None)


def blob_id(data: bytes) -> str:
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


def stage_state(stage: str, record: dict[str, Any]) -> dict[str, Any]:
    state = {"stage": stage, "status": record["status"]}
    for key in ("error", "skip_reason"):
        if key in record:
            state[key] = record[key]
    state["failed_members"] = record["failed_members"]
    return state


def empty_stage(status: str, reason: str | None = None) -> dict[str, Any]:
    record: dict[str, Any] = {"status": status}
    if reason:
        record["skip_reason"] = reason
    record.update(warnings=[], failed_members=[])
    return record


def finish(manifest: dict[str, Any], members: dict[str, bytes], output: Path, stage: str, added: list[str]) -> NoReturn:
    manifest["members"] = sorted(manifest["members"], key=lambda m: m["path"].encode("utf-8"))
    bundle = compact(manifest) + b"\n"
    archive = zip_bytes([("bundle.json", bundle), *((m["path"], members[m["path"]]) for m in manifest["members"])])
    write_atomic(output, archive)
    record = manifest["stages"][stage]
    diagnostic("info", "archive-written", f"wrote the {stage} stage", stage=stage)
    written = [{"path": "bundle.json", "bytes": len(bundle), "sha256": digest(bundle)}]
    written += [{"path": p, "bytes": len(members[p]), "sha256": digest(members[p])} for p in sorted(added, key=str.encode)]
    result = {
        "schema": "prism.cli.build_result.a0",
        "stage": stage,
        "stages": [stage_state(name, manifest["stages"][name]) for name in ("parse", "board", "models")],
        "archive_bytes": len(archive),
        "archive_sha256": digest(archive),
        "written_members": written,
        "warnings": record["warnings"],
    }
    raise Exit(9 if record["status"] in ("failed", "partial") else 0, result)


def load_config(options: dict[str, Any]) -> dict[str, Any] | None:
    if "--config" not in options:
        return None
    try:
        config = json.loads(Path(options["--config"]).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        error(3, "config-invalid", "--config is not a JSON file", argument="config")
    if not isinstance(config, dict) or config.get("schema") != "prism.revision_key.effective_config.a1":
        error(3, "config-invalid", "--config is not an effective configuration", argument="config")
    return config


def build_parse(positionals: list[str], options: dict[str, Any]) -> NoReturn:
    if len(positionals) != 1:
        error(2, "usage", "stage parse takes one <project.kicad_pro>", argument="project-file")
    for refused in ("--in", "--refilled-board", "--refill-tool", "--models-glb", "--models-tool"):
        if refused in options:
            error(2, "option-conflict", f"{refused} is refused with --stage parse")
    if "--key-record" in options and "--revision-key" not in options:
        error(2, "option-conflict", "--key-record requires --revision-key", argument="key-record")
    project = Path(positionals[0]).resolve()
    root = Path(options.get("--source-root") or project.parent).resolve()
    if not project.name.lower().endswith(".kicad_pro"):
        error(3, "project-not-kicad-pro", "the project file is not a .kicad_pro", argument="project-file")
    try:
        project_rel = project.relative_to(root).as_posix()
    except ValueError:
        error(3, "source-outside-root", "the project lies outside the source root", argument="project-file")
    config = load_config(options)
    if config is not None and config.get("project_file") != project_rel:
        error(7, "config-mismatch", "--config names another project file", argument="config")
    active = apply_modes("bundle build", "parse")
    if "absent" in active or not project.exists():
        document = {"schema": "prism.cli.project_absent.a0", "code": "project-absent", "command": "bundle build", "project_file": project_rel}
        raise Exit(10, document)
    if config is None:
        stem, folder = project_rel[: -len(".kicad_pro")], ""
        config = {"schema": "prism.revision_key.effective_config.a1", "project_file": project_rel}
        for key, suffix in (("root_schematic", ".kicad_sch"), ("board", ".kicad_pcb")):
            if (root / f"{stem}{suffix}").is_file():
                config[key] = f"{folder}{stem}{suffix}"
        config["excluded_dirs"] = []
    record = None
    if "--key-record" in options:
        try:
            record = json.loads(Path(options["--key-record"]).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            error(3, "key-record-invalid", "--key-record is not JSON", argument="key-record")
        if record.get("revision_key") != options["--revision-key"]:
            error(7, "revision-key-mismatch", "--key-record names another revision key", argument="key-record")
        if record.get("config") != config:
            error(7, "config-mismatch", "--key-record names another configuration", argument="key-record")
    require_hex(options.get("--revision-key"), "revision-key")
    diagnostic("info", "stage-started", "stage parse", stage="parse")
    entries = {entry["path"]: entry for entry in (record or {}).get("entries", [])}
    excluded = tuple(config.get("excluded_dirs", []))
    members: dict[str, bytes] = {}
    listed: list[dict[str, Any]] = []
    for path in sorted(root.rglob("*")):
        rel = path.relative_to(root).as_posix()
        if ".git" in rel.split("/") or any(rel == d or rel.startswith(d + "/") for d in excluded):
            continue
        role = source_role(path.name)
        if role is None:
            continue
        if path.is_symlink():
            error(3, "source-not-regular-file", "a link under the source root", stage="parse", location={"path": f"sources/{rel}"})
        if not path.is_file():
            continue
        data = path.read_bytes()
        entry = entries.get(rel)
        source = {"path": rel, "kind": entry["kind"], "object_id": entry["object_id"]} if entry else {
            "path": rel, "kind": "executable" if os.access(path, os.X_OK) else "regular", "object_id": blob_id(data)}
        members[f"sources/{rel}"] = data
        listed.append({"path": f"sources/{rel}", "role": role, "stage": "parse", "sha256": digest(data), "bytes": len(data), "source": source})
    gen = generator()
    by_source = {m["source"]["path"]: m for m in listed}
    for path, version in sorted(options["--upgraded"].items()):
        kind = "board" if path.lower().endswith(".kicad_pcb") else "schematic"
        if path not in by_source or version >= gen["kicad_file_formats"][kind]:
            error(3, "upgrade-record-invalid", f"--upgraded {path}={version} is not an older source member",
                  argument="upgraded", stage="parse")
        by_source[path]["source"]["upgraded_from_version"] = version
    schemas = {item["path"]: item["schema"] for item in gen["member_schemas"]}
    parse = empty_stage("complete")
    derived = ([] if "root_schematic" not in config else ["design.json"]) + sorted(PROJECTIONS)
    if "failed" in active:
        failing = config.get("root_schematic") or config["project_file"]
        parse = {"status": "failed", "error": {"code": "source-unparseable", "message": "Unbalanced opening parenthesis",
                 "location": {"path": f"sources/{failing}", "line": 1, "column": 1, "offset": 0}}, "warnings": [], "failed_members": []}
        derived = []
    elif "partial" in active:
        first = derived.pop(0)
        code = "design-build-failed" if first == "design.json" else "projection-failed"
        parse["failed_members"] = [{"path": first, "code": code, "message": f"injected failure of {first}"}]
        parse["status"] = "partial"
    for path in derived:
        data = compact({"schema": "kicad_monkey.design.a0"}) + b"\n" if path == "design.json" else (EXAMPLES / f"{PROJECTIONS[path]}.example.json").read_bytes()
        members[path] = data
        role = "design" if path == "design.json" else "projection"
        listed.append({"path": path, "role": role, "stage": "parse", "sha256": digest(data), "bytes": len(data), "member_schema": schemas[path]})
    if parse["status"] == "failed":
        board, models = empty_stage("skipped", "earlier-stage-failed"), empty_stage("skipped", "earlier-stage-failed")
    elif "board" not in config:
        board, models = empty_stage("skipped", "no-board"), empty_stage("skipped", "no-board")
    else:
        board, models = empty_stage("pending"), empty_stage("pending")
    manifest: dict[str, Any] = {"schema": "prism.bundle.manifest.a3", "generator": gen}
    if "--revision-key" in options:
        rk = options["--revision-key"]
        manifest["revision_key"] = rk
        manifest["bundle_key"] = hashlib.sha256(b"prism.bundle_key.a0\0" + rk.encode("ascii") + b"\0" + generator_bytes(gen)).hexdigest()
    read_set = {"probes": [], "listings": [], "gitlinks": []}
    manifest.update(config=config, board_id="main", stages={"parse": parse, "board": board, "models": models},
                    read_set=read_set, members=listed)
    diagnostic("info", "stage-finished", f"stage parse {parse['status']}", stage="parse")
    finish(manifest, members, Path(options["-o"]), "parse", [m["path"] for m in listed])


def load_in(options: dict[str, Any], stage: str) -> tuple[dict[str, Any], dict[str, bytes]]:
    if "--in" not in options:
        error(2, "option-conflict", f"--in is required with --stage {stage}", argument="in")
    path = Path(options["--in"])
    if not path.is_file():
        error(3, "input-not-found", "--in does not exist", argument="in")
    try:
        entries = read_zip(path)
        manifest = json.loads(entries[0][1])
    except (ValueError, struct.error, IndexError):
        error(3, "bundle-invalid", "--in is not a bundle", argument="in")
    if manifest.get("schema") != "prism.bundle.manifest.a3":
        error(7, "manifest-unsupported", "--in is not manifest a3", argument="in")
    if generator_bytes(manifest["generator"]) != generator_bytes(generator()):
        error(7, "generator-mismatch", "--in was written by another generator", argument="in")
    if "--revision-key" in options and options["--revision-key"] != manifest.get("revision_key"):
        error(7, "revision-key-mismatch", "--revision-key differs from --in", argument="revision-key")
    config = load_config(options)
    if config is not None and config != manifest["config"]:
        error(7, "config-mismatch", "--config differs from --in", argument="config")
    return manifest, dict(entries[1:])


def build_board(positionals: list[str], options: dict[str, Any]) -> NoReturn:
    if positionals or "--source-root" in options or "--key-record" in options or options["--upgraded"]:
        error(2, "option-conflict", "stage board takes --in, not a project")
    if ("--refilled-board" in options) != ("--refill-tool" in options) or "--models-glb" in options:
        error(2, "option-conflict", "--refilled-board and --refill-tool come together")
    manifest, members = load_in(options, "board")
    stages = manifest["stages"]
    if stages["board"]["status"] == "skipped":
        error(7, "stage-not-applicable", "stage board is skipped in --in", stage="board")
    if stages["parse"]["status"] not in ("complete", "partial") or stages["board"]["status"] != "pending":
        error(7, "stage-order", "stage board needs parse final and board pending", stage="board")
    saved = manifest["config"].get("zone_fills") == "saved"
    if saved and "--refilled-board" in options:
        error(7, "zone-fills-mismatch", "the configuration uses saved fills", stage="board", argument="refilled-board")
    if not saved and "--refilled-board" not in options:
        error(7, "zone-fills-mismatch", "refill mode needs --refilled-board", stage="board", argument="refilled-board")
    gen = manifest["generator"]
    if not saved and not same_kicad_release(options["--refill-tool"], gen["kicad_version"]):
        error(7, "kicad-version-mismatch", "--refill-tool is not the generator's KiCad", stage="board", argument="refill-tool")
    active = apply_modes("bundle build", "board")
    added: list[str] = []
    record: dict[str, Any] = {"status": "complete", "fill_provenance": "saved" if saved else "refilled"}
    warnings = [{"code": "saved-fills-used", "message": "the saved zone fills were materialized without a refill"}] if saved else []
    if not saved:
        board = manifest["config"]["board"].rsplit("/", 1)[-1]
        data = Path(options["--refilled-board"]).read_bytes()
        members[f"refilled/{board}"] = data
        manifest["members"].append({"path": f"refilled/{board}", "role": "refilled-board", "stage": "board", "sha256": digest(data), "bytes": len(data)})
        added.append(f"refilled/{board}")
    if "partial" in active:
        record["status"] = "partial"
        record["failed_members"] = [{"path": "materialization/board.kmpack", "code": "materialization-failed", "message": "injected"}]
        stages["models"] = empty_stage("skipped", "earlier-stage-failed")
    else:
        members["materialization/board.kmpack"] = PACK_PLACEHOLDER
        manifest["members"].append({"path": "materialization/board.kmpack", "role": "materialization", "stage": "board",
                                    "sha256": digest(PACK_PLACEHOLDER), "bytes": len(PACK_PLACEHOLDER),
                                    "member_schema": "kicad_monkey.materialization.a0"})
        added.append("materialization/board.kmpack")
        if not saved:
            record["fill_check"] = {"saved_operations": 0, "refilled_operations": 0, "differing_operations": 0, "stale": False}
        has_design = any(m["path"] == "design.json" for m in manifest["members"])
        record["cross_check"] = {"status": "passed" if has_design else "skipped", "components_compared": 0, "pads_compared": 0,
                                 "nets_compared": 0, "mappings": [], "warnings": [], "errors": []}
        record["failed_members"] = []
    record = {**{k: record[k] for k in ("status", "fill_provenance", "fill_check", "cross_check") if k in record},
              "warnings": warnings, "failed_members": record.get("failed_members", [])}
    stages["board"] = record
    finish(manifest, members, Path(options["-o"]), "board", added)


def build_models(positionals: list[str], options: dict[str, Any]) -> NoReturn:
    if positionals or options["--upgraded"] or ("--models-glb" in options) != ("--models-tool" in options) or "--models-glb" not in options:
        error(2, "option-conflict", "stage models needs --models-glb and --models-tool")
    manifest, members = load_in(options, "models")
    stages = manifest["stages"]
    if stages["models"]["status"] == "skipped":
        error(7, "stage-not-applicable", "stage models is skipped in --in", stage="models")
    if stages["board"]["status"] != "complete" or stages["models"]["status"] != "pending":
        error(7, "stage-order", "stage models needs board complete", stage="models")
    if not same_kicad_release(options["--models-tool"], manifest["generator"]["kicad_version"]):
        error(7, "kicad-version-mismatch", "--models-tool is not the generator's KiCad", stage="models", argument="models-tool")
    apply_modes("bundle build", "models")
    data = Path(options["--models-glb"]).read_bytes()
    members["viewer/models/components.glb"] = data
    manifest["members"].append({"path": "viewer/models/components.glb", "role": "component-models", "stage": "models",
                                "sha256": digest(data), "bytes": len(data)})
    stages["models"] = empty_stage("complete")
    finish(manifest, members, Path(options["-o"]), "models", ["viewer/models/components.glb"])


# ----------------------------------------------------------- other commands


def verify(positionals: list[str], options: dict[str, Any]) -> NoReturn:
    if len(positionals) != 1:
        error(2, "usage", "verify takes one bundle", argument="bundle")
    path = Path(positionals[0])
    if not path.is_file():
        error(3, "input-not-found", "the bundle does not exist", argument="bundle")
    apply_modes("bundle verify")
    findings: list[dict[str, Any]] = []
    stages: list[dict[str, Any]] = []
    checked = 0
    report: dict[str, Any] = {"schema": "prism.cli.verify_report.a0"}
    try:
        entries = read_zip(path)
        manifest = json.loads(entries[0][1])
        report["manifest_schema"] = manifest["schema"]
        report["generator_matches"] = generator_bytes(manifest["generator"]) == generator_bytes(generator())
        stages = [stage_state(name, manifest["stages"][name]) for name in ("parse", "board", "models")]
        listed = {m["path"]: m for m in manifest["members"]}
        names = [name for name, _ in entries[1:]]
        if names != [m["path"] for m in manifest["members"]]:
            findings.append({"code": "member-order", "message": "entries differ from members"})
        for name, data in entries[1:]:
            checked += 1
            member = listed.get(name)
            if member is None:
                findings.append({"code": "member-unlisted", "message": f"{name} is not listed", "location": {"path": name}})
            elif member["sha256"] != digest(data) or member["bytes"] != len(data):
                findings.append({"code": "member-digest-mismatch", "message": f"{name} differs", "location": {"path": name}})
    except (ValueError, struct.error, IndexError, KeyError) as problem:
        findings.append({"code": "zip-malformed", "message": str(problem) or "unreadable"})
    report.update(status="invalid" if findings else "valid", stages=stages, members_checked=checked, findings=findings)
    if "manifest_schema" not in report:
        report.pop("generator_matches", None)
    raise Exit(8 if findings else 0, {k: report[k] for k in ("schema", "status", "manifest_schema", "generator_matches", "stages", "members_checked", "findings") if k in report})


def extract(positionals: list[str], options: dict[str, Any]) -> NoReturn:
    if len(positionals) < 2 or "-o" not in options:
        error(2, "usage", "extract takes a bundle, members and -o", argument="member")
    bundle, wanted = Path(positionals[0]), positionals[1:]
    if not bundle.is_file():
        error(3, "input-not-found", "the bundle does not exist", argument="bundle")
    target = Path(options["-o"])
    if not target.is_dir():
        error(6, "output-not-directory", "-o is not a directory", argument="output")
    apply_modes("bundle extract")
    try:
        entries = dict(read_zip(bundle))
    except (ValueError, struct.error):
        error(3, "bundle-invalid", "the bundle is not readable", argument="bundle")
    chosen: dict[str, bytes] = {}
    for item in wanted:
        matches = {n: d for n, d in entries.items() if (n.startswith(item) if item.endswith("/") else n == item)}
        if not matches:
            error(7, "member-not-found", f"{item} selects nothing", argument="member")
        chosen.update(matches)
    for name, data in sorted(chosen.items()):
        destination = target / name
        if destination.exists() and destination.read_bytes() != data:
            error(7, "archive-path-collision", f"{name} exists with other bytes", location={"path": name})
        destination.parent.mkdir(parents=True, exist_ok=True)
        temp = destination.parent / f".{destination.name}.extract.tmp"
        temp.write_bytes(data)
        os.chmod(temp, 0o644)
        os.replace(temp, destination)
    members = [{"path": n, "bytes": len(d), "sha256": digest(d)} for n, d in sorted(chosen.items(), key=lambda i: i[0].encode())]
    raise Exit(0, {"schema": "prism.cli.extract_result.a0", "members": members})


def revision_key(positionals: list[str], options: dict[str, Any]) -> NoReturn:
    if len(positionals) != 1 or ("--commit" in options) == ("--worktree" in options) or "--project" not in options:
        error(2, "usage", "revision-key <repo> (--commit <rev> | --worktree) --project <rel>")
    if "absent" in apply_modes("revision-key"):
        raise Exit(10, {"schema": "prism.cli.project_absent.a0", "code": "project-absent", "command": "revision-key",
                        "project_file": options["--project"]})
    raise Exit(0, example("RevisionKeyRecordA1"))


def main(argv: list[str]) -> NoReturn:
    if not argv:
        error(2, "unknown-command", "no command", argument="command")
    if argv[0] in ("version", "--version"):
        apply_modes("version")
        raise Exit(0, generator())
    if argv[0] == "revision-key":
        positionals, options = parse_options(argv[1:])
        revision_key(positionals, options)
    if argv[0] != "bundle" or len(argv) < 2 or argv[1] not in ("build", "verify", "extract"):
        error(2, "unknown-command", "unknown command", argument="command")
    positionals, options = parse_options(argv[2:])
    if argv[1] == "verify":
        verify(positionals, options)
    if argv[1] == "extract":
        extract(positionals, options)
    stage = options.get("--stage")
    if stage not in ("parse", "board", "models"):
        error(2, "usage", "--stage is parse, board or models", argument="stage")
    if "-o" not in options:
        error(2, "usage", "-o is required", argument="output")
    {"parse": build_parse, "board": build_board, "models": build_models}[stage](positionals, options)


def run() -> int:
    code = 1
    try:
        main(_ARGV)
    except Exit as done:
        code = done.code
        if done.document is not None:
            if done.document.get("schema") == "prism.cli.version.a0":
                sys.stdout.buffer.write(generator_bytes(done.document) + b"\n")
            else:
                sys.stdout.buffer.write(compact(done.document) + b"\n")
    finally:
        log = os.environ.get("PRISM_KICAD_STUB_LOG")
        if log:
            with open(log, "a", encoding="utf-8") as handle:
                handle.write(json.dumps({"argv": _ARGV, "exit": code}) + "\n")
    sys.stdout.flush()
    return code


if __name__ == "__main__":
    sys.exit(run())
