"""The ``.prism`` archive reader: bundle-format.md §9 steps 1-7, in Python.

It accepts exactly the writer's subset of zip (bundle-format.md §4, cli-spec.md
§6.2): a canonical, gap-free layout, fixed versions, flags, time and date, no
extra fields, comments, zip64 or data descriptors, and names that are valid
``ArchivePath`` values. A bundle comes from an untrusted repository, so every
size is bounded before anything is inflated (ADR §11 G8).

:func:`open_archive` runs steps 1-5 and returns an :class:`Archive`;
``Archive.read`` runs steps 6-7 for one member. A failure raises
:class:`BundleInvalid` with the CLI's finding code. An archive that the store
has had ``bundle verify`` accept (amendment C2r §2 item 9) carries
``verified=True`` and its reads run step 6 only.
"""

from __future__ import annotations

import hashlib
import json
import struct
import unicodedata
import zlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, BinaryIO, Iterator, Mapping

from app.services.design_bundle import schemas
from app.services.design_bundle.revision_key import is_repo_path

MANIFEST = "bundle.json"
MANIFEST_SCHEMA = "prism.bundle.manifest.a3"
PACK_MAGIC = b"KMMATPK\0"
_EOCD = struct.Struct("<IHHHHIIH")
_CENTRAL = struct.Struct("<IHHHHHHIIIHHHHHII")
_LOCAL = struct.Struct("<IHHHHHIIIHH")
_DOS_TIME, _DOS_DATE, _UTF8_FLAG, _VERSION = 0x0000, 0x0021, 0x0800, 20
_MIB = 1024 * 1024


@dataclass(frozen=True)
class Limits:
    """bundle-format.md §6, cli-spec.md §7.2 defaults."""

    max_archive_bytes: int = 4_294_967_295
    max_archive_members: int = 32_768
    max_member_bytes: int = 2_147_483_648
    max_total_unpacked_bytes: int = 8_589_934_592
    max_compression_ratio: int = 200
    max_path_bytes: int = 4_096
    max_json_depth: int = 256
    max_json_nodes: int = 8_000_000


class BundleInvalid(ValueError):
    """An archive (or one member) a reader must reject. ``code`` is a cli-spec.md §8 code."""

    def __init__(self, code: str, message: str, path: str | None = None) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.path = path


@dataclass(frozen=True)
class Entry:
    name: str
    method: int
    crc: int
    compressed: int
    size: int
    data_offset: int


def check_archive_path(name: str, limits: Limits = Limits()) -> None:
    """bundle-format.md §5: an ``ArchivePath`` without control characters, within the length rules."""

    encoded = name.encode("utf-8", "surrogatepass")
    if not is_repo_path(name) or any(ord(c) < 0x20 or ord(c) == 0x7F for c in name):
        raise BundleInvalid("zip-path-invalid", f"{name!r} is not an archive path")
    if len(encoded) > limits.max_path_bytes or any(len(s.encode("utf-8")) > 255 for s in name.split("/")):
        raise BundleInvalid("zip-path-invalid", f"{name!r} is too long")


def _fold(name: str) -> str:
    return unicodedata.normalize("NFC", name).lower()


def _json_shape_ok(value: Any, limits: Limits) -> bool:
    nodes, stack = 0, [(value, 1)]
    while stack:
        item, depth = stack.pop()
        nodes += 1
        if depth > limits.max_json_depth or nodes > limits.max_json_nodes:
            return False
        if isinstance(item, dict):
            stack.extend((child, depth + 1) for child in item.values())
        elif isinstance(item, list):
            stack.extend((child, depth + 1) for child in item)
    return True


def parse_json_member(data: bytes, path: str, limits: Limits = Limits()) -> Any:
    if data.startswith(b"\xef\xbb\xbf"):
        raise BundleInvalid("member-unreadable", f"{path} starts with a BOM", path)
    try:
        value = json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError, RecursionError) as error:
        raise BundleInvalid("member-unreadable", f"{path} is not UTF-8 JSON: {error}", path) from None
    if not _json_shape_ok(value, limits):
        raise BundleInvalid("limit-exceeded", f"{path} is deeper or larger than the JSON limits", path)
    return value


@dataclass
class Archive:
    """One opened archive version: its manifest and entry table, from one open file."""

    path: Path
    manifest: dict[str, Any]
    manifest_bytes: bytes
    entries: dict[str, Entry]
    limits: Limits = field(default_factory=Limits)
    verified: bool = False

    @property
    def manifest_sha256(self) -> str:
        return hashlib.sha256(self.manifest_bytes).hexdigest()

    def member(self, path: str) -> Mapping[str, Any] | None:
        return next((m for m in self.manifest["members"] if m["path"] == path), None)

    def read(self, path: str, *, structured: bool = True) -> bytes:
        """Steps 6 and 7 for one member: bounded inflate, size, CRC, SHA-256, schema.

        ``verified`` skips step 7 only (C2r §2 item 9): step 6 still ties the
        bytes read to the bytes ``bundle verify`` accepted.
        """

        member = self.member(path)
        if member is None:
            raise BundleInvalid("member-missing", f"{path} is not a member", path)
        with self.path.open("rb") as handle:
            data = b"".join(_inflate(handle, self.entries[path], path))
        if hashlib.sha256(data).hexdigest() != member["sha256"]:
            raise BundleInvalid("member-digest-mismatch", f"{path} does not match its sha256", path)
        if structured and not self.verified:
            check_structured(member, data, self.manifest, self.limits)
        return data

    def stream(self, path: str, sink: BinaryIO) -> None:
        """Write one member to ``sink``, hashing as it goes; raises before returning on any mismatch."""

        member = self.member(path)
        if member is None:
            raise BundleInvalid("member-missing", f"{path} is not a member", path)
        digest = hashlib.sha256()
        with self.path.open("rb") as handle:
            for chunk in _inflate(handle, self.entries[path], path):
                digest.update(chunk)
                sink.write(chunk)
        if digest.hexdigest() != member["sha256"]:
            raise BundleInvalid("member-digest-mismatch", f"{path} does not match its sha256", path)


def _inflate(handle: BinaryIO, entry: Entry, path: str) -> Iterator[bytes]:
    handle.seek(entry.data_offset)
    remaining, produced, crc = entry.compressed, 0, 0
    inflater = zlib.decompressobj(-15) if entry.method == 8 else None
    while remaining:
        raw = handle.read(min(remaining, _MIB))
        if not raw:
            raise BundleInvalid("zip-malformed", f"{path} is truncated", path)
        remaining -= len(raw)
        chunk = raw if inflater is None else inflater.decompress(raw, entry.size - produced + 1)
        if inflater is not None and inflater.unconsumed_tail:
            raise BundleInvalid("zip-size-mismatch", f"{path} inflates past its declared size", path)
        produced += len(chunk)
        if produced > entry.size:
            raise BundleInvalid("zip-size-mismatch", f"{path} inflates past its declared size", path)
        crc = zlib.crc32(chunk, crc)
        yield chunk
    if inflater is not None:
        tail = inflater.flush()
        produced += len(tail)
        crc = zlib.crc32(tail, crc)
        if tail:
            yield tail
        if not inflater.eof:
            raise BundleInvalid("zip-malformed", f"{path} is not a complete deflate stream", path)
    if produced != entry.size:
        raise BundleInvalid("zip-size-mismatch", f"{path} is {produced} bytes, not {entry.size}", path)
    if crc != entry.crc:
        raise BundleInvalid("zip-crc-mismatch", f"{path} fails its CRC-32", path)


def check_structured(member: Mapping[str, Any], data: bytes, manifest: Mapping[str, Any], limits: Limits) -> None:
    """Step 7. A member whose schema id the reader does not know is left to its caller."""

    schema_id = member.get("member_schema")
    path = member["path"]
    if not schema_id:
        return
    if schema_id == "kicad_monkey.materialization.a0":
        version = manifest["generator"]["pack_format_version"]
        if data[:8] != PACK_MAGIC or len(data) < 10 or struct.unpack_from("<H", data, 8)[0] != version:
            raise BundleInvalid("member-unreadable", f"{path} is not a pack of format {version}", path)
        return
    document = parse_json_member(data, path, limits)
    if schema_id == "kicad_monkey.design.a0" or not schemas.known(schema_id):
        if not isinstance(document, dict) or document.get("schema") != schema_id:
            raise BundleInvalid("member-schema-invalid", f"{path} does not declare {schema_id}", path)
        return
    try:
        schemas.validate(document, schema_id)
    except schemas.SchemaInvalid as error:
        raise BundleInvalid("member-schema-invalid", str(error), path) from None


def open_archive(path: Path, *, expected_bundle_key: str | None = None, limits: Limits = Limits()) -> Archive:
    """Steps 1-5. Raises :class:`BundleInvalid`; the caller treats it like a missing archive."""

    with path.open("rb") as handle:
        size = handle.seek(0, 2)
        if size > limits.max_archive_bytes:
            raise BundleInvalid("limit-exceeded", f"the archive is {size} bytes")
        if size < _EOCD.size:
            raise BundleInvalid("zip-malformed", "no end of central directory record")
        handle.seek(size - _EOCD.size)
        signature, disk, cd_disk, here, total, cd_size, cd_offset, comment = _EOCD.unpack(handle.read(_EOCD.size))
        if signature != 0x06054B50 or comment:
            raise BundleInvalid("zip-malformed", "the end record is not the last 22 bytes")
        if disk or cd_disk or here != total or 0xFFFF in (here, total) or 0xFFFFFFFF in (cd_size, cd_offset):
            raise BundleInvalid("zip-unsupported", "multi-disk or zip64 archive")
        if total > limits.max_archive_members:
            raise BundleInvalid("limit-exceeded", f"{total} entries")
        if cd_offset + cd_size != size - _EOCD.size:
            raise BundleInvalid("zip-malformed", "the central directory does not end at the end record")
        handle.seek(cd_offset)
        central = handle.read(cd_size)
        entries = _central_entries(central, total, limits)
        _check_local_headers(handle, entries, cd_offset)
        ordered = list(entries.values())
        if not ordered or ordered[0].name != MANIFEST:
            raise BundleInvalid("zip-malformed", "bundle.json is not the first entry")
        manifest_bytes = b"".join(_inflate(handle, ordered[0], MANIFEST))
    manifest = _check_manifest(manifest_bytes, limits)
    members = manifest["members"]
    paths = [m["path"] for m in members]
    if any(paths[i].encode("utf-8") >= paths[i + 1].encode("utf-8") for i in range(len(paths) - 1)):
        raise BundleInvalid("member-order", "members are not sorted by path without duplicates (I1)")
    names = [entry.name for entry in ordered[1:]]
    if names != paths:
        missing = sorted(set(paths) - set(names))
        code = "member-missing" if missing else ("member-unlisted" if set(names) - set(paths) else "member-order")
        raise BundleInvalid(code, "the archive's entries differ from the manifest's members")
    for member in members:
        if entries[member["path"]].size != member["bytes"]:
            raise BundleInvalid("member-digest-mismatch", f"{member['path']} size differs", member["path"])
    if expected_bundle_key is not None and manifest.get("bundle_key") != expected_bundle_key:
        raise BundleInvalid("bundle-invalid", "the archive is not the bundle its path names")
    return Archive(path=path, manifest=manifest, manifest_bytes=manifest_bytes, entries=entries, limits=limits)


def _central_entries(central: bytes, total: int, limits: Limits) -> dict[str, Entry]:
    entries: dict[str, Entry] = {}
    folded: set[str] = set()
    offset, unpacked = 0, 0
    for _ in range(total):
        if offset + _CENTRAL.size > len(central):
            raise BundleInvalid("zip-malformed", "truncated central directory")
        fields = _CENTRAL.unpack_from(central, offset)
        (signature, made_by, needed, flags, method, time, date, crc, compressed, size,
         name_length, extra, comment, disk, internal, external, local) = fields
        if signature != 0x02014B50:
            raise BundleInvalid("zip-malformed", "bad central directory signature")
        if (made_by, needed, flags, time, date) != (_VERSION, _VERSION, _UTF8_FLAG, _DOS_TIME, _DOS_DATE) or method not in (0, 8):
            raise BundleInvalid("zip-unsupported", "a header is not the writer's form")
        if extra or comment or disk or internal or external:
            raise BundleInvalid("zip-unsupported", "extra fields, comments or attributes")
        raw_name = central[offset + _CENTRAL.size: offset + _CENTRAL.size + name_length]
        offset += _CENTRAL.size + name_length
        try:
            name = raw_name.decode("utf-8")
        except UnicodeDecodeError:
            raise BundleInvalid("zip-path-invalid", "a name is not UTF-8") from None
        check_archive_path(name, limits)
        if name in entries:
            raise BundleInvalid("zip-duplicate-member", f"{name} appears twice", name)
        if _fold(name) in folded:
            raise BundleInvalid("zip-path-collision", f"{name} collides after case folding", name)
        folded.add(_fold(name))
        if size > limits.max_member_bytes:
            raise BundleInvalid("limit-exceeded", f"{name} declares {size} bytes", name)
        if method == 0 and compressed != size:
            raise BundleInvalid("zip-malformed", f"stored {name} has two sizes", name)
        if size > _MIB and (compressed == 0 or size // compressed > limits.max_compression_ratio):
            raise BundleInvalid("zip-ratio-exceeded", f"{name} compresses too well", name)
        unpacked += size
        entries[name] = Entry(name, method, crc, compressed, size, local)  # data offset fixed below
    if offset != len(central):
        raise BundleInvalid("zip-malformed", "the central directory has trailing bytes")
    if unpacked > limits.max_total_unpacked_bytes:
        raise BundleInvalid("limit-exceeded", f"members declare {unpacked} bytes in all")
    return entries


def _check_local_headers(handle: BinaryIO, entries: dict[str, Entry], cd_offset: int) -> None:
    position = 0
    for name, entry in list(entries.items()):
        if entry.data_offset != position:  # holds the local header offset until fixed here
            raise BundleInvalid("zip-malformed", f"{name} does not follow the previous entry", name)
        handle.seek(position)
        header = handle.read(_LOCAL.size)
        if len(header) != _LOCAL.size:
            raise BundleInvalid("zip-malformed", f"{name}'s local header is truncated", name)
        signature, needed, flags, method, time, date, crc, compressed, size, name_length, extra = _LOCAL.unpack(header)
        raw_name = handle.read(name_length)
        if signature != 0x04034B50 or extra or raw_name != name.encode("utf-8"):
            raise BundleInvalid("zip-malformed", f"{name}'s local header disagrees", name)
        if (needed, flags, method, time, date, crc, compressed, size) != (
            _VERSION, _UTF8_FLAG, entry.method, _DOS_TIME, _DOS_DATE, entry.crc, entry.compressed, entry.size
        ):
            raise BundleInvalid("zip-malformed", f"{name}'s local header disagrees", name)
        data_offset = position + _LOCAL.size + name_length
        entries[name] = Entry(name, entry.method, entry.crc, entry.compressed, entry.size, data_offset)
        position = data_offset + entry.compressed
    if position != cd_offset:
        raise BundleInvalid("zip-malformed", "a gap before the central directory")


def _check_manifest(data: bytes, limits: Limits) -> dict[str, Any]:
    manifest = parse_json_member(data, MANIFEST, limits)
    if not isinstance(manifest, dict) or manifest.get("schema") != MANIFEST_SCHEMA:
        raise BundleInvalid("manifest-unsupported", "bundle.json is not a prism.bundle.manifest.a3", MANIFEST)
    try:
        schemas.validate(manifest, MANIFEST_SCHEMA)
    except schemas.SchemaInvalid as error:
        raise BundleInvalid("manifest-invalid", str(error), MANIFEST) from None
    return manifest
