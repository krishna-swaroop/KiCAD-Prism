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
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from .json import canonical_json, canonical_json_bytes, sha256_canonical


Canonicalizer = Callable[[bytes], bytes]

# This identifier is part of toolchain identity.  Bump it when the byte
# contract changes, even when the Python API remains source-compatible.
CANONICALIZER_REGISTRY_NAME = "release-studio"
# r4.3: `.gbrjob` creation dates are under `Header`, not `GeneralSpecs`, so the
# previous version left every job file volatile and no build was reproducible.
CANONICALIZER_REGISTRY_VERSION = "r4.3"
CANONICALIZER_VERSION = "1"

STEP_FILE_NAME_SENTINEL = "PRISM-RELEASE-STUDIO"
SVG_PRECISION = 6

# KiCad 10.0.4 stamps wall-clock time into several places per file.  The
# authoritative emission sites in the pinned source
# (tag f7414d419cae5df2d00e7eaacb16fc0e803799bc) are:
#
#   common/plotters/GERBER_plotter.cpp:289  G04 Created by KiCad (...) date ...*
#   include/gbr_metadata.h:46               G04 #@! TF.CreationDate,...*   (X1)
#   include/gbr_metadata.h:52               %TF.CreationDate,...*%         (X2)
#   include/gbr_metadata.h:49               ; #@! TF.CreationDate,...      (NC drill)
#   pcbnew/exporters/gendrill_excellon_writer.cpp:568  ; DRILL file ... date ...
#   common/plotters/SVG_plotter.cpp:806     <title>... date ...</title>
#   pcbnew/exporters/place_file_exporter.cpp:229/311   ### ... created on ... ###
#
# Missing any one of them silently breaks reproducibility, so every removal
# below names the site it exists for.
_CREATION_DATE_TF = re.compile(r"%TF\.CreationDate,[^*]*\*%", re.IGNORECASE)
_GERBER_VOLATILE_LINE = re.compile(
    r"^(?:"
    # X1 attribute form: G04 #@! TF.CreationDate,<iso>*
    r"G04\s+#@!\s*TF\.CreationDate,[^*]*\*"
    # Unconditional plotter header: G04 Created by KiCad (<version>) date <iso>*
    r"|G04\s+Created\s+by\b[^*]*\bdate\b[^*]*\*"
    r")$",
    re.IGNORECASE,
)
_EXCELLON_METADATA_COMMENT = re.compile(
    r"^;\s*(?:"
    r"DATE(?:\s*[:=].*)?"
    r"|DRILL\s+FILE\b.*\b(?:DATE|CREATED|GENERATED|CREATION)\b.*"
    r"|(?:CREATED|GENERATED|CREATION)\s+(?:BY|ON|AT|DATE|TIME)\b.*"
    # NC drill X1 attribute form: ; #@! TF.CreationDate,<iso>
    r"|#@!\s*TF\.CreationDate,.*"
    r")$",
    re.IGNORECASE,
)
# An ISO-8601-ish instant.  Used only to recognize volatile leading comment
# rows; it never matches CSV data because the guard requires a comment marker.
_TIMESTAMP = re.compile(r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}")
_CSV_GENERATED_HEADER = re.compile(
    r"^\s*(?:#|//|;)+\s*(?:"
    r"(?:GENERATED|CREATED)\s+(?:ON|AT|BY)\b.*"
    r"|(?:GENERATION|CREATION)\s+(?:DATE|TIME)\b.*"
    # place_file_exporter.cpp:229/311 prefix the timestamp with free text:
    # "### Footprint positions - created on <iso> ###"
    r"|.*\b(?:CREATED|GENERATED)\s+(?:ON|AT|BY)\b.*"
    r")$",
    re.IGNORECASE,
)
_SVG_METADATA = re.compile(
    r"<metadata\b[^>]*(?:/>|>.*?</metadata\s*>)",
    re.IGNORECASE | re.DOTALL,
)
# Tempered so a lazy span can never cross the end of the comment it started in;
# an unanchored `.*?` deletes every element between two comments.
_SVG_DATE_COMMENT = re.compile(
    r"<!--(?:(?!-->).)*?(?:date|created|generated|timestamp)(?:(?!-->).)*-->",
    re.IGNORECASE | re.DOTALL,
)
# SVG_plotter.cpp:806-810 writes the plot time into the document title.  Only
# the timestamp is replaced; the source filename stays as provenance, exactly
# as %TF.GenerationSoftware does for Gerber.
_SVG_TITLE_DATE = re.compile(
    r"(<title>\s*SVG Image created as [^<]*?\bdate\s)[^<]*(</title>)",
    re.IGNORECASE,
)
_STEP_FILE_NAME = re.compile(r"\bFILE_NAME\s*\(", re.IGNORECASE)
_REPORT_VIOLATION_LIST_KEYS = ("violations", "unconnected_items", "schematic_parity")


def canonicalize_gerber(data: bytes) -> bytes:
    """Drop only KiCad's creation timestamps and normalize newlines.

    Three distinct forms carry the plot time: the X2 ``%TF.CreationDate`` block,
    the X1 ``G04 #@! TF.CreationDate`` comment, and the plotter's own
    ``G04 Created by ... date ...`` header line.  Aperture definitions,
    coordinates, and every other attribute are untouched.
    """

    text = _normalize_newlines(_as_text(data))
    kept = [
        line
        for line in text.split("\n")
        if not _GERBER_VOLATILE_LINE.fullmatch(line.strip())
    ]
    return _CREATION_DATE_TF.sub("", "\n".join(kept)).encode("utf-8")


def canonicalize_gbrjob(data: bytes) -> bytes:
    """Drop the creation timestamp from a Gerber job file.

    KiCad writes it as ``Header.CreationDate`` -- verified against the pinned
    10.0.4 output, where ``Header`` also carries ``GenerationSoftware``, which
    is retained because it is provenance rather than volatile metadata.
    ``GeneralSpecs`` is checked too so a file from another writer that puts the
    date there is still normalized.
    """

    payload = _json_object(data, "Gerber job")
    cleaned = dict(payload)
    for section in ("Header", "GeneralSpecs"):
        block = cleaned.get(section)
        if isinstance(block, dict) and "CreationDate" in block:
            updated = dict(block)
            del updated["CreationDate"]
            cleaned[section] = updated
    return _canonical_json_file(cleaned)


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
    when they contain words such as ``date`` or ``created``.  A *leading*
    comment row carrying a real timestamp is dropped whatever its wording,
    which covers ``place_file_exporter.cpp``'s free-text position header.
    """

    text = _normalize_newlines(_as_text(data))
    lines = text.split("\n")
    result: list[str] = []
    leading_header = True
    for line in lines:
        stripped = line.strip()
        if leading_header and stripped.startswith(("#", "//", ";")):
            if _CSV_GENERATED_HEADER.fullmatch(stripped) or _TIMESTAMP.search(stripped):
                continue
        result.append(line.rstrip())
        if stripped and not stripped.startswith(("#", "//", ";")):
            leading_header = False
    return _ensure_final_newline("\n".join(result)).encode("utf-8")


def canonicalize_drc_erc_json(data: bytes) -> bytes:
    """Drop KiCad's top-level report date and deterministically order violations."""

    payload = _json_object(data, "DRC/ERC report")
    cleaned = _remove_report_timestamp(payload)
    cleaned = _sort_report_violations(cleaned)
    return _canonical_json_file(cleaned)


def canonicalize_svg(data: bytes) -> bytes:
    """Strip SVG metadata/date comments while retaining all artwork."""

    text = _as_text(data)
    text = _SVG_METADATA.sub("", text)
    text = _SVG_DATE_COMMENT.sub("", text)
    text = _SVG_TITLE_DATE.sub(rf"\g<1>{STEP_FILE_NAME_SENTINEL}\g<2>", text)
    text = _normalize_newlines(text)
    declaration_index = text.find("<?xml")
    if declaration_index > 0 and not text[:declaration_index].strip():
        text = text[declaration_index:]
    return text.encode("utf-8")


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
    mtime: int = 0,
) -> bytes:
    """Build a deterministic tar/tar.gz without filesystem metadata.

    This is the only archive writer used by Release Studio.  In particular it
    must not delegate to ``JobArtifactService.prepare_directory`` or
    ``shutil.make_archive``, both of which inherit source mtimes and modes.
    ``mtime`` is explicit revision or release metadata, never a filesystem or
    wall-clock read. Epoch zero remains the neutral default for generic
    canonicalization callers.
    """

    mtime = int(mtime)
    if not 0 <= mtime <= 0xFFFFFFFF:
        raise ValueError("archive mtime must fit the gzip unsigned 32-bit field")

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
            info.mtime = mtime
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
    with gzip.GzipFile(fileobj=output, mode="wb", filename="", mtime=mtime) as compressed:
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


def _zip_date_time(mtime: int) -> tuple[int, int, int, int, int, int]:
    """Convert a unix timestamp to the ZIP DOS datetime field.

    Local headers cannot represent times before 1980-01-01. Callers still pass
    explicit revision/release metadata (never a filesystem read); epoch zero
    therefore stays the ZIP epoch so generic canonicalization remains stable.
    """

    stamp = int(mtime)
    if stamp <= 0:
        return (1980, 1, 1, 0, 0, 0)
    try:
        moment = datetime.fromtimestamp(stamp, tz=timezone.utc)
    except (OverflowError, OSError, ValueError):
        return (1980, 1, 1, 0, 0, 0)
    if moment.year < 1980:
        return (1980, 1, 1, 0, 0, 0)
    year = min(moment.year, 2107)
    return (year, moment.month, moment.day, moment.hour, moment.minute, moment.second)


def write_deterministic_zip(
    members: dict[str, bytes],
    *,
    mtime: int = 0,
) -> bytes:
    """Build a deterministic zip without filesystem metadata.

    Fab houses want zip, not tar.gz. This helper is for derived convenience
    packs only — it is not a member canonicalizer and does not feed a
    fingerprint. ``mtime`` is explicit revision or release metadata, same as
    the tar writer: two packs with the same members and stamp are
    byte-identical, and extracted files show that stamp instead of 1980-01-01.
    """

    mtime = int(mtime)
    if not 0 <= mtime <= 0xFFFFFFFF:
        raise ValueError("archive mtime must fit the gzip unsigned 32-bit field")
    date_time = _zip_date_time(mtime)
    output = io.BytesIO()
    with zipfile.ZipFile(output, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in sorted(members):
            _validate_archive_name(name)
            payload = members[name]
            if not isinstance(payload, bytes):
                raise TypeError(f"zip member {name!r} must be bytes")
            info = zipfile.ZipInfo(filename=name, date_time=date_time)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, payload)
    return output.getvalue()


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


def _remove_report_timestamp(payload: dict[str, object]) -> dict[str, object]:
    cleaned = copy.deepcopy(payload)
    # KiCad 10's RC_JSON REPORT_BASE serializes exactly one nondeterministic
    # field, the top-level ``date`` shared by DRC_REPORT and ERC_REPORT.  Do not
    # treat generic names such as ``created`` or ``generated`` as timestamps;
    # they can be report data in a future schema or in an ignored-check record.
    cleaned.pop("date", None)
    return cleaned


def _sort_report_violations(payload: dict[str, object]) -> dict[str, object]:
    cleaned = copy.deepcopy(payload)
    for key in _REPORT_VIOLATION_LIST_KEYS:
        violations = cleaned.get(key)
        if isinstance(violations, list):
            cleaned[key] = sorted(violations, key=_violation_sort_key)

    sheets = cleaned.get("sheets")
    if isinstance(sheets, list):
        updated_sheets: list[object] = []
        for sheet in sheets:
            if not isinstance(sheet, dict):
                updated_sheets.append(sheet)
                continue
            updated_sheet = copy.deepcopy(sheet)
            violations = updated_sheet.get("violations")
            if isinstance(violations, list):
                updated_sheet["violations"] = sorted(
                    violations,
                    key=_violation_sort_key,
                )
            updated_sheets.append(updated_sheet)
        cleaned["sheets"] = updated_sheets
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
    if "\\" in name:
        raise ValueError(f"archive member names must use POSIX separators: {name!r}")
    if re.match(r"^[A-Za-z]:", name):
        raise ValueError(f"archive member name looks like a drive path: {name!r}")
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
    "write_deterministic_zip",
]
