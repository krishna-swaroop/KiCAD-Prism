"""Configured notes and dynamic title-block fields (D5).

A released drawing carries the issuing organization's language, not ours: IPC
class, coupon requirements, impedance tolerances, whose print governs.  Those
belong in the project's configuration, and this module is where the configured
text becomes sheet content.

Two properties matter more than the feature itself.

**Determinism.**  Notes and fields are rendered into members with digests, so
their order can never depend on how a YAML file happened to be keyed.  Fields
are emitted in sorted key order because ``technical_config_digest`` canonicalizes
with ``sort_keys=True`` -- two configurations that differ only in key order have
one digest, so they must also produce one sheet, or a build would be
irreproducible from its own build key.

**No clock, no identity.**  The substitution context exposes the commit, the
variant, the commit date, and the board's own facts.  It deliberately exposes no
build time, no candidate id, and no approver: a note that could interpolate one
would move a released sheet's digest for reasons that have nothing to do with
the design.
"""

from __future__ import annotations

from typing import Any, Mapping, Sequence

from app.release_studio.config.errors import SubstitutionError
from app.release_studio.config.substitution import substitute_string
from app.release_studio.documents.layout import TitleBlockField
from app.release_studio.documents.fonts import (
    DEFAULT_TYPOGRAPHY,
    unsupported_codepoints,
)

#: These are drawn as cover tables, not jammed into the KiCad title-block
#: comment row.  Passing them through :func:`resolve_fields` made comment 4 a
#: single overflowing line of IPC class and finish callouts.
_SHEET_TABLE_FIELD_KEYS = frozenset(
    {
        "manufacturing_ipc_class",
        "assembly_ipc_class",
        "solder_mask_colour",
        "silkscreen_colour",
        "via_treatment",
    }
)


class NoteError(Exception):
    """A configured note or field could not be resolved."""


def substitution_context(
    context: Mapping[str, Any],
    *,
    fields: Mapping[str, Any] | None = None,
    stats: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """The namespaces a configured note may interpolate.

    ``release`` is the revision being documented, ``fields`` is whatever the
    configuration declared, and ``board`` is the statistics projection's board
    object -- so a note can state the board's own thickness without the author
    copying a number that will later be wrong.
    """

    board = (stats or {}).get("board")
    return {
        "release": {
            "title": str(context.get("title") or ""),
            "document_number": str(context.get("document_name") or context.get("document_number") or ""),
            "revision": str(context.get("revision") or ""),
            "commit": str(context.get("commit_sha") or "")[:12],
            "commit_sha": str(context.get("commit_sha") or ""),
            "variant": str(context.get("variant") or "default"),
            "date": str(context.get("release_date") or context.get("commit_date") or ""),
        },
        "fields": dict(fields or {}),
        "board": dict(board) if isinstance(board, Mapping) else {},
    }


def resolve_notes(
    configured: Mapping[str, Any] | None,
    context: Mapping[str, Any],
    *,
    defaults: Mapping[str, Sequence[str]],
    typography: str = DEFAULT_TYPOGRAPHY,
) -> tuple[dict[str, tuple[str, ...]], list[str]]:
    """Resolve each sheet's note block, falling back per sheet.

    Returns the notes by sheet key and the warnings raised along the way.  A
    note that cannot be resolved costs *that sheet's* configured notes and
    nothing else: the standard text is used and the failure is stated, because
    emitting ``{{fields.ipc_class}}`` onto a released drawing would be worse
    than either.

    An unknown sheet key is a warning rather than silence.  Notes configured for
    a sheet that does not exist are notes the author believes are on the drawing.
    """

    resolved: dict[str, tuple[str, ...]] = {key: tuple(value) for key, value in defaults.items()}
    warnings: list[str] = []
    for key, lines in sorted((configured or {}).items()):
        if key not in defaults:
            warnings.append(
                f"notes are configured for {key!r}, which is not a sheet in this set"
            )
            continue
        try:
            candidate = tuple(
                substitute_string(str(line), context, source=f"notes.{key}")
                for line in lines
            )
            missing = unsupported_codepoints(
                "\n".join(candidate), role="sans", typography=typography
            )
            if missing:
                rendered = ", ".join(f"U+{value:04X}" for value in missing)
                raise NoteError(
                    f"the {typography!r} body face cannot render {rendered}"
                )
            resolved[key] = candidate
        except (SubstitutionError, NoteError) as exc:
            warnings.append(f"the configured notes for {key} were not used: {exc}")
    return resolved, warnings


def resolve_fields(
    configured: Mapping[str, Any] | None,
    context: Mapping[str, Any],
    *,
    typography: str = DEFAULT_TYPOGRAPHY,
) -> tuple[tuple[TitleBlockField, ...], list[str]]:
    """Resolve the configuration's extra title-block fields, in key order.

    A field whose value will not resolve is dropped with the reason stated.  It
    is not rendered blank: a title block with an empty ``CUSTOMER`` row asserts
    that the release has no customer, which is a different claim from "this
    drawing does not carry that field".
    """

    fields: list[TitleBlockField] = []
    warnings: list[str] = []
    for key, value in sorted((configured or {}).items()):
        if str(key).strip() in _SHEET_TABLE_FIELD_KEYS:
            continue
        try:
            text = substitute_string(str(value), context, source=f"fields.{key}")
            missing = unsupported_codepoints(text, role="sans", typography=typography)
            if missing:
                rendered = ", ".join(f"U+{codepoint:04X}" for codepoint in missing)
                raise NoteError(
                    f"the {typography!r} body face cannot render {rendered}"
                )
        except (SubstitutionError, NoteError) as exc:
            warnings.append(f"the title-block field {key!r} was not drawn: {exc}")
            continue
        fields.append(TitleBlockField(str(key).replace("_", " ").upper(), text))
    return tuple(fields), warnings
