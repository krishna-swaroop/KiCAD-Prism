"""Typed projection and configuration inputs for the Documentation Engine.

Acquisition of plotted views is a separate record. These fields are what the
sheets name and tabulate: board statistics, stackup, members, notes, and the
paths the acquisition boundary needs to know which views to ask for.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping, Sequence

from app.release_studio.documents.fonts import DEFAULT_TYPOGRAPHY


@dataclass(frozen=True, slots=True)
class DocumentInputs:
    """Everything sheet composition needs besides acquired artwork."""

    context: Mapping[str, Any]
    stats: Mapping[str, Any]
    stackup: Mapping[str, Any]
    variants: Mapping[str, Any]
    placements: Sequence[Mapping[str, Any]]
    members: Sequence[Mapping[str, Any]]
    testpoints: Mapping[str, Any] = field(default_factory=dict)
    population: Mapping[str, Any] = field(default_factory=dict)
    designators: Sequence[str] = ()
    notes: Mapping[str, Any] = field(default_factory=dict)
    fields: Mapping[str, Any] = field(default_factory=dict)
    typography: str = DEFAULT_TYPOGRAPHY
    revision_history: Sequence[Mapping[str, Any]] = ()
    impedance_rows: Sequence[Mapping[str, Any]] = ()
    stackup_pdf: bytes | None = None
    bom_headers: Sequence[str] = ()
    bom_rows: Sequence[Sequence[str]] = ()
    sheet_size: str | None = None
    board: Path | None = None
    cli_path: str | None = None
    cruncher_path: str | None = None
    workdir: Path | None = None

    @classmethod
    def from_compose_kwargs(
        cls,
        *,
        context: Mapping[str, Any],
        stats: Mapping[str, Any],
        stackup: Mapping[str, Any],
        variants: Mapping[str, Any],
        placements: Sequence[Mapping[str, Any]],
        members: Sequence[Mapping[str, Any]],
        testpoints: Mapping[str, Any] | None = None,
        population: Mapping[str, Any] | None = None,
        designators: Sequence[str] = (),
        notes: Mapping[str, Any] | None = None,
        fields: Mapping[str, Any] | None = None,
        typography: str = DEFAULT_TYPOGRAPHY,
        revision_history: Sequence[Mapping[str, Any]] | None = None,
        impedance_rows: Sequence[Mapping[str, Any]] | None = None,
        stackup_pdf: bytes | None = None,
        bom_headers: Sequence[str] | None = None,
        bom_rows: Sequence[Sequence[str]] | None = None,
        sheet_size: str | None = None,
        board: Path | None = None,
        cli_path: str | None = None,
        cruncher_path: str | None = None,
        workdir: Path | None = None,
    ) -> DocumentInputs:
        """Pack the historical ``compose`` keyword arguments into one record."""

        return cls(
            context=context,
            stats=stats,
            stackup=stackup,
            variants=variants,
            placements=placements,
            members=members,
            testpoints=testpoints or {},
            population=population or {},
            designators=tuple(designators or ()),
            notes=notes or {},
            fields=fields or {},
            typography=typography,
            revision_history=tuple(revision_history or ()),
            impedance_rows=tuple(impedance_rows or ()),
            stackup_pdf=(
                bytes(stackup_pdf)
                if isinstance(stackup_pdf, (bytes, bytearray))
                else None
            ),
            bom_headers=tuple(bom_headers or ()),
            bom_rows=tuple(tuple(row) for row in (bom_rows or ())),
            sheet_size=sheet_size,
            board=board,
            cli_path=cli_path,
            cruncher_path=cruncher_path,
            workdir=workdir,
        )
