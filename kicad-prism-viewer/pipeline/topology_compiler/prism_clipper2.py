from __future__ import annotations

import ctypes
import hashlib
import json
import os
import platform
from pathlib import Path
from typing import Any

from .native_clipper import NativeClipperError


class PrismClipper2Error(NativeClipperError):
    pass


class PrismClipper2Library:
    backend_name = "clipper2"
    batch_symbol_a2 = "prism_clipper2_batch_a2_bytes"
    protocol_env = "PRISM_CLIPPER2_PROTOCOL"

    def __init__(self, path: str | Path | None = None) -> None:
        library_path = resolve_prism_clipper2_library_path(path)
        if library_path is None:
            raise PrismClipper2Error(
                "Prism Clipper2 native clipping is unavailable: set PRISM_CLIPPER2_LIBRARY "
                "to an absolute libprism_clipper2 path or build the packaged Prism native library."
            )
        explicit_path = path or os.environ.get("PRISM_CLIPPER2_LIBRARY")
        if explicit_path and not Path(str(explicit_path)).is_absolute():
            raise PrismClipper2Error(f"PRISM_CLIPPER2_LIBRARY must be absolute; got {str(explicit_path)!r}")
        if not library_path.is_file():
            raise PrismClipper2Error(f"Prism Clipper2 library does not exist: {library_path}")
        self.path = str(library_path.resolve())
        self.sha256 = _file_sha256(Path(self.path))
        self.manifest_match = _manifest_match_for_path(Path(self.path), self.sha256)
        if self.manifest_match is False:
            raise PrismClipper2Error(
                f"Prism Clipper2 packaged library SHA-256 does not match manifest: {self.path}"
            )
        self.supports_a2 = True
        self.protocols = ["a2"]
        self.available_symbols: list[str] = []
        try:
            self._lib = ctypes.CDLL(self.path)
        except OSError as exc:
            raise PrismClipper2Error(f"Failed to load Prism Clipper2 library {self.path}: {exc}") from exc
        self._bind()

    def _bind(self) -> None:
        required = [
            "prism_clipper2_version_string",
            "prism_clipper2_abi_version",
            "prism_clipper2_protocol_version",
            "prism_clipper2_batch_a2_bytes",
            "prism_clipper2_free_bytes",
        ]
        missing = [name for name in required if not hasattr(self._lib, name)]
        if missing:
            raise PrismClipper2Error(
                f"Prism Clipper2 library {self.path} is missing required C ABI symbol(s): "
                + ", ".join(missing)
            )
        self.available_symbols = list(required)
        self._lib.prism_clipper2_version_string.argtypes = []
        self._lib.prism_clipper2_version_string.restype = ctypes.c_char_p
        self._lib.prism_clipper2_abi_version.argtypes = []
        self._lib.prism_clipper2_abi_version.restype = ctypes.c_uint32
        self._lib.prism_clipper2_protocol_version.argtypes = []
        self._lib.prism_clipper2_protocol_version.restype = ctypes.c_uint32
        self._lib.prism_clipper2_free_bytes.argtypes = [ctypes.c_void_p]
        self._lib.prism_clipper2_free_bytes.restype = None
        self._lib.prism_clipper2_batch_a2_bytes.argtypes = [
            ctypes.c_void_p,
            ctypes.c_size_t,
            ctypes.POINTER(ctypes.c_void_p),
            ctypes.POINTER(ctypes.c_size_t),
            ctypes.POINTER(ctypes.c_void_p),
        ]
        self._lib.prism_clipper2_batch_a2_bytes.restype = ctypes.c_int
        raw_version = self._lib.prism_clipper2_version_string()
        self.version = raw_version.decode("utf-8", errors="replace") if raw_version else ""
        self.abi_version = int(self._lib.prism_clipper2_abi_version())
        self.protocol_version = int(self._lib.prism_clipper2_protocol_version())
        if not self.version:
            raise PrismClipper2Error("Prism Clipper2 library returned an empty version string")
        if self.abi_version <= 0:
            raise PrismClipper2Error(f"Prism Clipper2 ABI version is invalid: {self.abi_version}")
        if self.protocol_version != 2:
            raise PrismClipper2Error(
                f"Prism Clipper2 protocol version must be 2; got {self.protocol_version}"
            )

    def identity(self, *, protocol: str | None = "a2") -> dict[str, Any]:
        return {
            "backend": "clipper2",
            "libraryPath": self.path,
            "librarySha256": self.sha256,
            "version": self.version,
            "abi": self.abi_version,
            "protocol": protocol,
            "protocolVersion": self.protocol_version,
            "batchSymbol": self.batch_symbol_a2,
            "supportsA2": True,
            "availableSymbols": self.available_symbols,
            "supportedProtocols": self.protocols,
            "manifestMatch": self.manifest_match,
        }

    def clip_batch_a2(self, request: bytes) -> bytes:
        request_buffer = ctypes.create_string_buffer(request)
        value = ctypes.c_void_p()
        value_size = ctypes.c_size_t()
        error = ctypes.c_void_p()
        code = self._lib.prism_clipper2_batch_a2_bytes(
            ctypes.cast(request_buffer, ctypes.c_void_p),
            len(request),
            ctypes.byref(value),
            ctypes.byref(value_size),
            ctypes.byref(error),
        )
        try:
            if code != 0:
                message = ctypes.string_at(error).decode("utf-8", errors="replace") if error.value else ""
                raise PrismClipper2Error(
                    f"prism_clipper2_batch_a2_bytes failed with code {code}: {message or '<no error message>'}"
                )
            if not value.value or value_size.value <= 0:
                raise PrismClipper2Error("prism_clipper2_batch_a2_bytes returned an empty response")
            return ctypes.string_at(value, value_size.value)
        finally:
            if value.value:
                self._lib.prism_clipper2_free_bytes(value)
            if error.value:
                self._lib.prism_clipper2_free_bytes(error)


def packaged_prism_clipper2_library_path() -> Path:
    system = platform.system()
    machine = platform.machine().lower()
    if system == "Darwin":
        os_key = "darwin"
        suffix = ".dylib"
    elif system == "Linux":
        os_key = "linux"
        suffix = ".so"
    elif system == "Windows":
        os_key = "windows"
        suffix = ".dll"
    else:
        os_key = system.lower()
        suffix = ".so"
    arch_key = "arm64" if machine in {"arm64", "aarch64"} else "x86_64"
    return (
        Path(__file__).resolve().parents[2]
        / "native"
        / "prism-clipper2"
        / f"{os_key}-{arch_key}"
        / f"libprism_clipper2{suffix}"
    )


def resolve_prism_clipper2_library_path(path: str | Path | None = None) -> Path | None:
    explicit = str(path or os.environ.get("PRISM_CLIPPER2_LIBRARY") or "")
    if explicit:
        return Path(explicit)
    packaged = packaged_prism_clipper2_library_path()
    if packaged.is_file():
        return packaged
    return None


def prism_clipper2_library_info(path: str | Path | None = None) -> dict[str, Any]:
    resolved = resolve_prism_clipper2_library_path(path)
    manifest_info = _manifest_library_info()
    info: dict[str, Any] = {
        "backend": "clipper2",
        "libraryPath": str(resolved) if resolved else None,
        "librarySha256": _file_sha256(resolved) if resolved and resolved.is_file() else None,
        "version": None,
        "abiVersion": None,
        "protocolVersion": None,
        "a2Support": False,
        "availableSymbols": [],
        "supportedProtocols": [],
        "manifest": manifest_info,
        "manifestMatch": None,
    }
    if resolved is None:
        info["error"] = (
            "No Prism Clipper2 library configured. Set PRISM_CLIPPER2_LIBRARY to an absolute path "
            "or run scripts/build-prism-clipper2.sh."
        )
        return info
    try:
        clipper = PrismClipper2Library(resolved)
    except PrismClipper2Error as exc:
        info["error"] = str(exc)
        return info
    identity = clipper.identity(protocol="a2")
    info.update(
        {
            "libraryPath": identity["libraryPath"],
            "librarySha256": identity["librarySha256"],
            "version": identity["version"],
            "abiVersion": identity["abi"],
            "protocolVersion": identity["protocolVersion"],
            "a2Support": identity["supportsA2"],
            "availableSymbols": identity["availableSymbols"],
            "supportedProtocols": identity["supportedProtocols"],
            "batchSymbol": identity["batchSymbol"],
            "manifestMatch": identity["manifestMatch"],
        }
    )
    return info


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _manifest_library_info() -> dict[str, Any] | None:
    manifest_path = Path(__file__).resolve().parents[2] / "native" / "prism-clipper2" / "manifest.json"
    if not manifest_path.exists():
        return None
    try:
        return json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"error": f"invalid JSON in {manifest_path}"}


def _manifest_match_for_path(path: Path, sha256: str) -> bool | None:
    manifest = _manifest_library_info()
    if not manifest or "error" in manifest:
        return None
    manifest_path = Path(__file__).resolve().parents[2] / "native" / "prism-clipper2" / "manifest.json"
    libraries = manifest.get("libraries") if isinstance(manifest, dict) else None
    if not isinstance(libraries, dict):
        return None
    resolved_path = path.resolve()
    for entry in libraries.values():
        if not isinstance(entry, dict):
            continue
        entry_path = entry.get("path")
        expected_sha = entry.get("sha256")
        if not entry_path or not expected_sha:
            continue
        try:
            candidate_path = (manifest_path.parent / str(entry_path)).resolve()
        except OSError:
            continue
        if candidate_path == resolved_path:
            return str(expected_sha) == sha256
    return None
