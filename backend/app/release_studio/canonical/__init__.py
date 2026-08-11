"""Semantically-null canonicalizers for Release Studio released bytes.

The registry is intentionally small and explicit.  A canonicalizer may remove
only metadata called out in the R4 contract; it must not rewrite KiCad artwork,
drill geometry, report violations, or manufacturing rows.  The canonical bytes
returned here are the bytes placed in the released dossier.
"""

from __future__ import annotations

import copy
import gzip
import io
import json as _json
import re
import tarfile
from pathlib import Path
from typing import Callable

from .json import canonical_json, canonical_json_bytes, sha256_canonical


Canonicalizer = Callable[[bytes], bytes]

# This identifier is part of toolchain identity.  Bump it when the byte
# contract changes, even when the Python API remains source-compatible.
CANONICALIZER_REGISTRY_NAME = "release-studio"
CANONICALIZER_REGISTRY_VERSION = "r4"
CANONICALIZER_VERSION = "1"

STEP_FILE_NAME_SENTINEL = "PRISM-RELEASE-STUDIO"
SVG_PRECISION = 6

_CREATION_DATE_TF = re.compile(r"%TF\.CreationDate,[^*]*\*%", re.IGNORECASE)
_EXCELLON_METADATA_COMMENT = re.compile(
    r"^;\s*(?:"
    r"DATE(?:\s*[:=].*)?"
    r"|DRILL\s+FILE\b.*\b(?:DATE|CREATED|GENERATED|CREATION)\b.*"
    r"|(?:CREATED|GENERATED|CREATION)\s+(?:BY|ON|AT|DATE|TIME)\b.*"
    r")$",
    re.IGNORECASE,
)
_CSV_GENERATED_HEADER = re.compile(
    r"^\s*(?:#|//|;)\s*(?:"
    r"(?:GENERATED|CREATED)\s+(?:ON|AT|BY)\b.*"
    r"|(?:GENERATION|CREATION)\s+(?:DATE|TIME)\b.*"
    r")",
    re.IGNORECASE,
)
_SVG_METADATA = re.compile(
    r"<metadata\b[^>]*(?:/>|>.*?</metadata\s*>)",
    re.IGNORECASE | re.DOTALL,
)
_SVG_DATE_COMMENT = re.compile(
    r"<!--.*?(?:date|created|generated|timestamp).*?-->",
    re.IGNORECASE | re.DOTALL,
)
_STEP_FILE_NAME = re.compile(r"\bFILE_NAME\s*\(", re.IGNORECASE)
_REPORT_TIMESTAMP_KEYS = {
    "date",
    "timestamp",
    "report_date",
    "report_timestamp",
    "created",
    "created_at",
    "generated",
    "generated_at",
    "report_time",
}
_REPORT_TIMESTAMP_CONTAINERS = {"metadata", "header", "report"}


def canonicalize_gerber(data: bytes) -> bytes:
    """Drop only the RS-274X creation attribute and normalize newlines."""

    text = _as_text(data)
    text = _CREATION_DATE_TF.sub("", text)
    return _normalize_newlines(text).encode("utf-8")


def canonicalize_gbrjob(data: bytes) -> bytes:
    """Drop exactly ``GeneralSpecs.CreationDate`` from a Gerber job file."""

    payload = _json_object(data, "Gerber job")
    general = payload.get("GeneralSpecs")
    if isinstance(general, dict) and "CreationDate" in general:
        updated_general = dict(general)
        del updated_general["CreationDate"]
        payload = dict(payload)
        payload["GeneralSpecs"] = updated_general
    return _canonical_json_file(payload)


def canonicalize_excellon(data: bytes) -> bytes:
    """Drop known creation/date comments from the Excellon header only.

    Excellon comments are allowed throughout the program.  In particular, a
    comment in the drill body that happens to contain ``date`` or ``created``
    is not metadata and must survive canonicalization.  The header ends at the
    format terminator (``%``), as emitted by KiCad.
    """

    text = _normalize_newlines(_as_text(data))
    lines = text.splitlines(keepends=True)
    result: list[str] = []
    in_header = True
    for line in lines:
        content = line.rstrip("\n")
        if in_header and _EXCELLON_METADATA_COMMENT.fullmatch(content.strip()):
            continue
        result.append(line)
        if content.strip() == "%":
            in_header = False
    return "".join(result).encode("utf-8")


def canonicalize_step(data: bytes) -> bytes:
    """Replace only the second string in ``FILE_NAME``.

    ISO 10303-21 defines the first argument as the source filename and the
    second as the time stamp.  Earlier R4 code replaced the first argument,
    which changed a useful provenance field and left the timestamp untouched.
    The scanner below preserves every byte outside the timestamp, including
    the complete ``DATA;`` section.
    """

    text = _as_text(data)
    header, separator, body = text.partition("DATA;")
    if not separator:
        raise ValueError("STEP file missing DATA; section")

    match = _STEP_FILE_NAME.search(header)
    if match is None:
        raise ValueError("STEP HEADER is missing FILE_NAME(...)")
    open_index = match.end() - 1
    close_index = _find_step_call_end(header, open_index)
    argument_spans = _step_argument_spans(header, open_index, close_index)
    if len(argument_spans) < 2:
        raise ValueError("STEP FILE_NAME(...) is missing its timestamp argument")

    timestamp_start, timestamp_end = _quoted_step_argument_span(
        header, argument_spans[1]
    )
    rewritten_header = (
        header[:timestamp_start]
        + STEP_FILE_NAME_SENTINEL
        + header[timestamp_end:]
    )
    return (rewritten_header + separator + body).encode("utf-8")


def canonicalize_csv(data: bytes) -> bytes:
    """Remove recognized generated-on comment rows before the CSV header.

    Comments after the header are data-adjacent content and are retained even
    when they contain words such as ``date`` or ``created``.
    """

    text = _normalize_newlines(_as_text(data))
    lines = text.split("\n")
    result: list[str] = []
    leading_header = True
    for line in lines:
        stripped = line.strip()
        if leading_header and _CSV_GENERATED_HEADER.fullmatch(stripped):
            continue
        result.append(line.rstrip())
        if stripped and not stripped.startswith(("#", "//", ";")):
            leading_header = False
    return _ensure_final_newline("\n".join(result)).encode("utf-8")


def canonicalize_drc_erc_json(data: bytes) -> bytes:
    """Drop report timestamps and deterministically order violations."""

    payload = _json_object(data, "DRC/ERC report")
    cleaned = _remove_report_timestamps(payload)
    violations = cleaned.get("violations")
    if isinstance(violations, list):
        cleaned["violations"] = sorted(violations, key=_violation_sort_key)
    return _canonical_json_file(cleaned)


def canonicalize_svg(data: bytes) -> bytes:
    """Strip SVG metadata/date comments while retaining all artwork."""

    text = _as_text(data)
    text = _SVG_METADATA.sub("", text)
    text = _SVG_DATE_COMMENT.sub("", text)
    return _normalize_newlines(text).encode("utf-8")


def canonicalize_board_stats_json(data: bytes) -> bytes:
    """Remove the board-stats ``metadata.date`` before projections/digests."""

    payload = _json_object(data, "board stats")
    metadata = payload.get("metadata")
    if isinstance(metadata, dict) and "date" in metadata:
        updated_metadata = dict(metadata)
        del updated_metadata["date"]
        payload = dict(payload)
        payload["metadata"] = updated_metadata
    return _canonical_json_file(payload)


def canonicalize_pdf(data: bytes) -> bytes:
    """Rewrite a PDF with deterministic qpdf metadata and object streams.

    Release Studio does not create ReportLab documents in this module.  When a
    caller creates a ReportLab input, it must set ``reportlab.rl_config.invariant
    = 1`` before rendering; this canonicalizer handles the resulting PDF
    boundary by removing document info, XMP metadata, and the source trailer ID.
    """

    try:
        import pikepdf
    except ImportError as exc:  # pragma: no cover - dependency is installed in CI
        raise RuntimeError(
            "PDF canonicalization requires pikepdf; install the Release Studio PDF dependency"
        ) from exc

    with pikepdf.open(io.BytesIO(data)) as pdf:
        # Clear the document information dictionary before dropping its trailer
        # reference.  Clearing first also handles producers that expose an
        # indirect /Info object.
        if "/Info" in pdf.trailer:
            info = pdf.trailer["/Info"]
            for key in list(info.keys()):
                del info[key]
            del pdf.trailer["/Info"]

        # qpdf will create a deterministic ID when deterministic_id=True.  The
        # source ID must not influence that value.
        if "/ID" in pdf.trailer:
            del pdf.trailer["/ID"]

        root = pdf.trailer["/Root"]
        if "/Metadata" in root:
            del root["/Metadata"]

        output = io.BytesIO()
        pdf.save(
            output,
            deterministic_id=True,
            object_stream_mode=pikepdf.ObjectStreamMode.generate,
        )
        return output.getvalue()


def write_deterministic_archive(
    members: dict[str, bytes],
    *,
    gzip_compress: bool = True,
) -> bytes:
    """Build a deterministic tar/tar.gz without filesystem metadata.

    This is the only archive writer used by Release Studio.  In particular it
    must not delegate to ``JobArtifactService.prepare_directory`` or
    ``shutil.make_archive``, both of which inherit source mtimes and modes.
    """

    tar_buffer = io.BytesIO()
    with tarfile.open(
        fileobj=tar_buffer,
        mode="w",
        format=tarfile.PAX_FORMAT,
    ) as archive:
        for name in sorted(members):
            _validate_archive_name(name)
            payload = members[name]
            if not isinstance(payload, bytes):
                raise TypeError(f"archive member {name!r} must be bytes")
            info = tarfile.TarInfo(name=name)
            info.size = len(payload)
            info.mtime = 0
            info.uid = 0
            info.gid = 0
            info.uname = ""
            info.gname = ""
            info.mode = 0o644
            archive.addfile(info, io.BytesIO(payload))
    raw = tar_buffer.getvalue()
    if not gzip_compress:
        return raw

    output = io.BytesIO()
    with gzip.GzipFile(fileobj=output, mode="wb", filename="", mtime=0) as compressed:
        compressed.write(raw)
    return output.getvalue()


def canonicalize_archive(data: bytes) -> bytes:
    """Canonicalize an existing tar/tar.gz while preserving member bytes."""

    gzip_compress = data[:2] == b"\x1f\x8b"
    members: dict[str, bytes] = {}
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:*") as archive:
        for info in archive.getmembers():
            if not info.isfile():
                raise ValueError("archive canonicalization accepts regular files only")
            if info.name in members:
                raise ValueError(f"archive contains duplicate member: {info.name!r}")
            extracted = archive.extractfile(info)
            if extracted is None:  # pragma: no cover - tarfile invariant
                raise ValueError(f"archive member is unreadable: {info.name!r}")
            members[info.name] = extracted.read()
    return write_deterministic_archive(members, gzip_compress=gzip_compress)


def canonicalize_json(data: bytes) -> bytes:
    """Canonicalize a manifest, attestation, or other JSON record."""

    return canonical_json_bytes(_json.loads(_as_text(data)))


REGISTRY: dict[str, Canonicalizer] = {
    "gerber": canonicalize_gerber,
    "gbrjob": canonicalize_gbrjob,
    "excellon": canonicalize_excellon,
    "step": canonicalize_step,
    "csv": canonicalize_csv,
    "drc_erc_json": canonicalize_drc_erc_json,
    "svg": canonicalize_svg,
    "board_stats_json": canonicalize_board_stats_json,
    "pdf": canonicalize_pdf,
    "archive": canonicalize_archive,
    "json": canonicalize_json,
    "manifest": canonicalize_json,
    "attestation": canonicalize_json,
}

CANONICALIZER_VERSIONS: dict[str, str] = {
    name: CANONICALIZER_VERSION for name in REGISTRY
}


def canonicalizer_registry() -> dict[str, object]:
    """Return the public registry identity used in toolchain provenance."""

    return {
        "name": CANONICALIZER_REGISTRY_NAME,
        "version": CANONICALIZER_REGISTRY_VERSION,
        "canonicalizers": dict(CANONICALIZER_VERSIONS),
    }


def canonicalize(member_type: str, data: bytes) -> bytes:
    """Canonicalize one supported member type by its registry name."""

    try:
        handler = REGISTRY[member_type]
    except KeyError as exc:
        raise KeyError(f"unknown canonicalizer type: {member_type!r}") from exc
    return handler(data)


def canonicalize_path(member_type: str, path: Path | str) -> bytes:
    """Read and canonicalize one filesystem member."""

    return canonicalize(member_type, Path(path).read_bytes())


def _canonical_json_file(payload: object) -> bytes:
    return (canonical_json(payload) + "\n").encode("utf-8")


def _json_object(data: bytes, label: str) -> dict[str, object]:
    payload = _json.loads(_as_text(data))
    if not isinstance(payload, dict):
        raise ValueError(f"{label} must be a JSON object")
    return payload


def _remove_report_timestamps(payload: dict[str, object]) -> dict[str, object]:
    cleaned = copy.deepcopy(payload)
    for key in _REPORT_TIMESTAMP_KEYS:
        cleaned.pop(key, None)
    for container_name in _REPORT_TIMESTAMP_CONTAINERS:
        container = cleaned.get(container_name)
        if not isinstance(container, dict):
            continue
        container = dict(container)
        for key in _REPORT_TIMESTAMP_KEYS:
            container.pop(key, None)
        cleaned[container_name] = container
    return cleaned


def _violation_sort_key(item: object) -> tuple[str, str]:
    if not isinstance(item, dict):
        return ("", canonical_json(item))
    return (
        "|".join(
            str(item.get(key) or "")
            for key in ("type", "severity", "description")
        ),
        canonical_json(item),
    )


def _find_step_call_end(text: str, open_index: int) -> int:
    depth = 0
    in_string = False
    index = open_index
    while index < len(text):
        character = text[index]
        if character == "'":
            if in_string and index + 1 < len(text) and text[index + 1] == "'":
                index += 2
                continue
            in_string = not in_string
        elif not in_string:
            if character == "(":
                depth += 1
            elif character == ")":
                depth -= 1
                if depth == 0:
                    return index
        index += 1
    raise ValueError("unterminated STEP FILE_NAME(...) argument list")


def _step_argument_spans(text: str, open_index: int, close_index: int) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []
    start = open_index + 1
    depth = 0
    in_string = False
    index = start
    while index < close_index:
        character = text[index]
        if character == "'":
            if in_string and index + 1 < close_index and text[index + 1] == "'":
                index += 2
                continue
            in_string = not in_string
        elif not in_string:
            if character == "(":
                depth += 1
            elif character == ")":
                depth -= 1
            elif character == "," and depth == 0:
                spans.append((start, index))
                start = index + 1
        index += 1
    spans.append((start, close_index))
    return spans


def _quoted_step_argument_span(
    text: str, span: tuple[int, int]
) -> tuple[int, int]:
    start, end = span
    while start < end and text[start].isspace():
        start += 1
    if start >= end or text[start] != "'":
        raise ValueError("STEP FILE_NAME timestamp is not a string argument")
    value_start = start + 1
    index = value_start
    while index < end:
        if text[index] != "'":
            index += 1
            continue
        if index + 1 < end and text[index + 1] == "'":
            index += 2
            continue
        value_end = index
        index += 1
        if text[index:end].strip():
            raise ValueError("STEP FILE_NAME timestamp has unexpected trailing data")
        return value_start, value_end
    raise ValueError("unterminated STEP FILE_NAME timestamp string")


def _validate_archive_name(name: str) -> None:
    if not isinstance(name, str) or not name:
        raise ValueError("archive member names must be non-empty strings")
    path = Path(name)
    if path.is_absolute() or ".." in path.parts:
        raise ValueError(f"unsafe archive member name: {name!r}")


def _as_text(data: bytes) -> str:
    return data.decode("utf-8")


def _normalize_newlines(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n")


def _ensure_final_newline(text: str) -> str:
    return text if text.endswith("\n") else text + "\n"


__all__ = [
    "CANONICALIZER_REGISTRY_NAME",
    "CANONICALIZER_REGISTRY_VERSION",
    "CANONICALIZER_VERSION",
    "CANONICALIZER_VERSIONS",
    "REGISTRY",
    "SVG_PRECISION",
    "STEP_FILE_NAME_SENTINEL",
    "canonical_json",
    "canonical_json_bytes",
    "canonicalize",
    "canonicalize_archive",
    "canonicalize_board_stats_json",
    "canonicalize_csv",
    "canonicalize_drc_erc_json",
    "canonicalize_excellon",
    "canonicalize_gbrjob",
    "canonicalize_gerber",
    "canonicalize_json",
    "canonicalize_path",
    "canonicalize_pdf",
    "canonicalize_step",
    "canonicalize_svg",
    "canonicalizer_registry",
    "sha256_canonical",
    "write_deterministic_archive",
]
