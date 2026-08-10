"""Member-type canonicalizers for Release Studio released bytes."""

from __future__ import annotations

import gzip
import io
import json
import re
import tarfile
from pathlib import Path
from typing import Callable


Canonicalizer = Callable[[bytes], bytes]

STEP_FILE_NAME_SENTINEL = "PRISM-RELEASE-STUDIO"
_CREATION_DATE_TF = re.compile(r"%TF\.CreationDate,[^*]*\*%")
_GBRJOB_CREATION = re.compile(
    r'("CreationDate"\s*:\s*")[^"]*(")',
    re.IGNORECASE,
)
_EXCELLON_DATE = re.compile(r"^;.*\bDATE\b.*$", re.IGNORECASE | re.MULTILINE)
_EXCELLON_CREATED = re.compile(
    r"^;.*\b(CREATED|GENERATED|CREATION)\b.*$",
    re.IGNORECASE | re.MULTILINE,
)
_CSV_GENERATED = re.compile(
    r"^(?:#|//|;).*?\b(generated|created|date)\b.*$",
    re.IGNORECASE | re.MULTILINE,
)
_SVG_METADATA = re.compile(r"<metadata\b[^>]*>.*?</metadata>", re.IGNORECASE | re.DOTALL)
_SVG_DATE_COMMENT = re.compile(r"<!--.*?date.*?-->", re.IGNORECASE | re.DOTALL)
_STEP_FILE_NAME = re.compile(
    r"(FILE_NAME\s*\(\s*')([^']*)(')",
    re.IGNORECASE,
)


def canonicalize_gerber(data: bytes) -> bytes:
    text = _as_text(data)
    text = _CREATION_DATE_TF.sub("", text)
    return _normalize_newlines(text).encode("utf-8")


def canonicalize_gbrjob(data: bytes) -> bytes:
    text = _as_text(data)
    payload = json.loads(text)
    general = payload.get("GeneralSpecs")
    if isinstance(general, dict) and "CreationDate" in general:
        general = dict(general)
        general.pop("CreationDate", None)
        payload = dict(payload)
        payload["GeneralSpecs"] = general
    return (json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode(
        "utf-8"
    )


def canonicalize_excellon(data: bytes) -> bytes:
    text = _as_text(data)
    text = _EXCELLON_DATE.sub("", text)
    text = _EXCELLON_CREATED.sub("", text)
    return _normalize_newlines(text).encode("utf-8")


def canonicalize_step(data: bytes) -> bytes:
    text = _as_text(data)
    header, sep, body = text.partition("DATA;")
    if not sep:
        raise ValueError("STEP file missing DATA; section")
    header = _STEP_FILE_NAME.sub(
        lambda match: f"{match.group(1)}{STEP_FILE_NAME_SENTINEL}{match.group(3)}",
        header,
        count=1,
    )
    return (header + sep + body).encode("utf-8")


def canonicalize_csv(data: bytes) -> bytes:
    text = _as_text(data)
    text = _CSV_GENERATED.sub("", text)
    lines = [line.rstrip() for line in _normalize_newlines(text).split("\n")]
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    return ("\n".join(lines) + ("\n" if lines else "")).encode("utf-8")


def canonicalize_drc_erc_json(data: bytes) -> bytes:
    payload = json.loads(_as_text(data))
    if not isinstance(payload, dict):
        raise ValueError("DRC/ERC report must be a JSON object")
    cleaned = dict(payload)
    for key in ("date", "timestamp", "created", "generated", "report_time"):
        cleaned.pop(key, None)
    violations = cleaned.get("violations")
    if isinstance(violations, list):
        cleaned["violations"] = sorted(
            violations,
            key=_violation_sort_key,
        )
    return (
        json.dumps(cleaned, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n"
    ).encode("utf-8")


def canonicalize_svg(data: bytes) -> bytes:
    text = _as_text(data)
    text = _SVG_METADATA.sub("", text)
    text = _SVG_DATE_COMMENT.sub("", text)
    return _normalize_newlines(text).encode("utf-8")


def canonicalize_board_stats_json(data: bytes) -> bytes:
    payload = json.loads(_as_text(data))
    if not isinstance(payload, dict):
        raise ValueError("board stats must be a JSON object")
    cleaned = dict(payload)
    metadata = cleaned.get("metadata")
    if isinstance(metadata, dict):
        metadata = dict(metadata)
        metadata.pop("date", None)
        cleaned["metadata"] = metadata
    return (
        json.dumps(cleaned, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n"
    ).encode("utf-8")


def canonicalize_pdf(data: bytes) -> bytes:
    try:
        import pikepdf
    except ImportError as exc:  # pragma: no cover - exercised when dep absent
        raise RuntimeError(
            "PDF canonicalization requires pikepdf; install it to canonicalize PDFs"
        ) from exc

    with pikepdf.open(io.BytesIO(data)) as pdf:
        with pdf.open_metadata(set_pikepdf_as_editor=False) as meta:
            for key in list(meta.keys()):
                del meta[key]
        if "/Info" in pdf.trailer:
            del pdf.trailer["/Info"]
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
    """Build a tar/tar.gz with stable metadata. Never use prepare_directory."""

    tar_buffer = io.BytesIO()
    with tarfile.open(fileobj=tar_buffer, mode="w") as archive:
        for name in sorted(members):
            payload = members[name]
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
    out = io.BytesIO()
    with gzip.GzipFile(fileobj=out, mode="wb", mtime=0) as gz:
        gz.write(raw)
    return out.getvalue()


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
}


def canonicalize(member_type: str, data: bytes) -> bytes:
    try:
        handler = REGISTRY[member_type]
    except KeyError as exc:
        raise KeyError(f"unknown canonicalizer type: {member_type!r}") from exc
    return handler(data)


def canonicalize_path(member_type: str, path: Path | str) -> bytes:
    return canonicalize(member_type, Path(path).read_bytes())


def _violation_sort_key(item: object) -> tuple[str, str, str]:
    if not isinstance(item, dict):
        return ("", "", json.dumps(item, sort_keys=True, separators=(",", ":")))
    return (
        str(item.get("type") or ""),
        str(item.get("severity") or ""),
        str(item.get("description") or ""),
    )


def _as_text(data: bytes) -> str:
    return data.decode("utf-8")


def _normalize_newlines(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n")
