"""Operator-managed extension descriptors; never import or execute extension code."""

from __future__ import annotations

import ipaddress
import json
import re
from pathlib import Path
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.config import settings
from app.core.errors import Unavailable

MAX_MANIFEST_BYTES = 256 * 1024
Slug = Annotated[str, Field(min_length=1, max_length=64, pattern=r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$")]
Name = Annotated[str, Field(min_length=1, max_length=80, pattern=r"\S")]
_HOST_LABEL = re.compile(r"^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$")
_AUTHORITY = re.compile(r"^(?:\[[0-9a-fA-F:.]+\]|[a-zA-Z0-9.-]+)(?::[0-9]+)?$")


class ExtensionAction(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: Slug
    label: Name
    url: Annotated[str, Field(min_length=1, max_length=2048)]
    kind: Literal["link", "panel"]

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        # Avoid parser disagreements between urllib and the browser URL parser.
        if any(char.isspace() or ord(char) < 32 or ord(char) == 127 for char in value) or any(
            char in value for char in "\\{}"
        ):
            raise ValueError("Expected an absolute extension URL")
        parts = urlsplit(value)
        host = parts.hostname
        if parts.scheme not in {"http", "https"} or not parts.netloc or not host:
            raise ValueError("Expected an absolute HTTP(S) URL")
        if parts.username is not None or parts.password is not None or parts.fragment or "#" in value:
            raise ValueError("Credentials and fragments are not allowed")
        if not _AUTHORITY.fullmatch(parts.netloc):
            raise ValueError("Invalid URL authority")
        # Accessing port validates malformed and out-of-range port numbers.
        port = parts.port
        if port == 0 or parts.netloc.endswith(":"):
            raise ValueError("Invalid port")
        try:
            ipaddress.ip_address(host)
        except ValueError:
            if len(host) > 253 or not all(_HOST_LABEL.fullmatch(label) for label in host.split(".")):
                raise ValueError("Invalid host") from None
        if parts.scheme == "http" and host not in {"localhost", "127.0.0.1", "::1"}:
            raise ValueError("HTTP is allowed only on loopback hosts")
        return value


class Extension(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: Slug
    name: Name
    version: Annotated[str, Field(min_length=1, max_length=64, pattern=r"\S")]
    description: Annotated[str, Field(max_length=1000)]
    actions: Annotated[list[ExtensionAction], Field(min_length=1, max_length=8)]

    @model_validator(mode="after")
    def unique_actions(self) -> Extension:
        if len({action.id for action in self.actions}) != len(self.actions):
            raise ValueError("Duplicate extension action ID")
        return self


class ExtensionManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schema_version: Literal[1]
    extensions: Annotated[list[Extension], Field(max_length=32)]

    @field_validator("schema_version", mode="before")
    @classmethod
    def strict_version(cls, value: object) -> object:
        if type(value) is not int:
            raise ValueError("Expected an integer schema version")
        return value

    @model_validator(mode="after")
    def unique_extensions(self) -> ExtensionManifest:
        if len({extension.id for extension in self.extensions}) != len(self.extensions):
            raise ValueError("Duplicate extension ID")
        return self


def _unique_json_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON key")
        result[key] = value
    return result


def extension_manifest() -> ExtensionManifest:
    """Read a bounded snapshot on each request so atomic replacements take effect."""
    configured = settings.PRISM_EXTENSIONS_FILE
    if not configured:
        return ExtensionManifest(schema_version=1, extensions=[])
    try:
        with Path(configured).open("rb") as source:
            raw = source.read(MAX_MANIFEST_BYTES + 1)
        if len(raw) > MAX_MANIFEST_BYTES:
            raise ValueError("Manifest is too large")
        payload = json.loads(raw.decode("utf-8"), object_pairs_hook=_unique_json_keys)
        return ExtensionManifest.model_validate(payload)
    except (OSError, UnicodeError, ValueError, RecursionError):
        raise Unavailable(
            "Extensions are unavailable. Ask an administrator to check the extension configuration.",
            code="extensions_unavailable",
        ) from None
