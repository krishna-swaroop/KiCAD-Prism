"""The committed JSON Schema (``native/contracts/generated/schema/``), as validators.

Every schema of the directory is registered by its ``$id`` before anything is
validated, so the manifest's embedded generator and effective-config roots
resolve (conventions.md §1). Readers never depend on key order or whitespace
(§13); they validate the parsed value.
"""

from __future__ import annotations

import json
import threading
from functools import lru_cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator
from jsonschema.exceptions import ValidationError
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

from app.core.config import settings


class SchemaInvalid(ValueError):
    """A document that is not valid against its schema. ``pointer`` locates the first finding."""

    def __init__(self, schema_id: str, pointer: str, message: str) -> None:
        super().__init__(f"{schema_id} at {pointer or '/'}: {message}")
        self.schema_id = schema_id
        self.pointer = pointer


def schema_dir() -> Path:
    """``PRISM_DESIGN_BUNDLE_SCHEMA_DIR``, else the repository's (or the image's) copy."""

    configured = settings.PRISM_DESIGN_BUNDLE_SCHEMA_DIR.strip()
    if configured:
        return Path(configured)
    here = Path(__file__).resolve()
    for root in (here.parents[4], here.parents[3]):  # repository checkout, then /app in the image
        candidate = root / "native" / "contracts" / "generated" / "schema"
        if candidate.is_dir():
            return candidate
    return here.parents[4] / "native" / "contracts" / "generated" / "schema"


def urn(schema_id: str) -> str:
    """``prism.bundle.manifest.a3`` -> ``urn:prism:schema:prism.bundle.manifest:a3`` (conventions.md §3)."""

    name, _, version = schema_id.rpartition(".")
    if not name or not version:
        raise ValueError(f"not a schema id: {schema_id!r}")
    family = "wavenumber" if schema_id.startswith("kicad_monkey.") else "prism"
    return f"urn:{family}:schema:{name}:{version}"


_lock = threading.Lock()


@lru_cache(maxsize=4)
def _registry(directory: str) -> tuple[Registry, frozenset[str]]:
    registry: Registry = Registry()
    ids = set()
    for path in sorted(Path(directory).glob("*.json")):
        document = json.loads(path.read_text(encoding="utf-8"))
        identifier = document.get("$id")
        if not isinstance(identifier, str):
            continue
        registry = registry.with_resource(identifier, Resource.from_contents(document, default_specification=DRAFT202012))
        ids.add(identifier)
    return registry.crawl(), frozenset(ids)


@lru_cache(maxsize=64)
def _validator(directory: str, identifier: str) -> Draft202012Validator:
    registry, _ = _registry(directory)
    schema = registry.contents(identifier)
    return Draft202012Validator(schema, registry=registry)


def known(schema_id: str) -> bool:
    """Whether a JSON Schema is committed for ``schema_id``."""

    with _lock:
        _, ids = _registry(str(schema_dir()))
    return urn(schema_id) in ids


def validate(document: Any, schema_id: str) -> None:
    """Raise :class:`SchemaInvalid` unless ``document`` is valid against ``schema_id``'s schema."""

    with _lock:
        validator = _validator(str(schema_dir()), urn(schema_id))
    error: ValidationError | None = next(iter(validator.iter_errors(document)), None)
    if error is not None:
        pointer = "".join(f"/{part}" for part in error.absolute_path)
        raise SchemaInvalid(schema_id, pointer, error.message[:500])


def validate_own(document: Any) -> str:
    """Validate a document against the schema its own ``schema`` field names; returns that id."""

    schema_id = document.get("schema") if isinstance(document, dict) else None
    if not isinstance(schema_id, str):
        raise SchemaInvalid("(unknown)", "/schema", "no schema field")
    validate(document, schema_id)
    return schema_id
