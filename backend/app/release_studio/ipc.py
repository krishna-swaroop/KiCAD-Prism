"""IPC class options for the manufacturing/assembly view.

Stored values are the strings printed on the cover. ``other`` is a sentinel
the UI swaps for a free-text field.
"""

from __future__ import annotations

from typing import Any

OTHER = "other"

MANUFACTURING_IPC_OPTIONS: tuple[tuple[str, str], ...] = (
    ("IPC-6012 Class 1", "IPC-6012 Class 1 — General Electronic Products"),
    ("IPC-6012 Class 2", "IPC-6012 Class 2 — Dedicated Service Electronic Products"),
    ("IPC-6012 Class 3", "IPC-6012 Class 3 — High Performance / Harsh Environment"),
    ("IPC-6013 Class 1", "IPC-6013 Class 1 — Flexible Printed Boards"),
    ("IPC-6013 Class 2", "IPC-6013 Class 2 — Flexible Printed Boards"),
    ("IPC-6013 Class 3", "IPC-6013 Class 3 — Flexible Printed Boards"),
    (OTHER, "Other"),
)

ASSEMBLY_IPC_OPTIONS: tuple[tuple[str, str], ...] = (
    ("IPC-A-610 Class 1", "IPC-A-610 Class 1 — General Electronic Products"),
    ("IPC-A-610 Class 2", "IPC-A-610 Class 2 — Dedicated Service Electronic Products"),
    ("IPC-A-610 Class 3", "IPC-A-610 Class 3 — High Performance / Harsh Environment"),
    ("J-STD-001 Class 1", "J-STD-001 Class 1 — Soldering process"),
    ("J-STD-001 Class 2", "J-STD-001 Class 2 — Soldering process"),
    ("J-STD-001 Class 3", "J-STD-001 Class 3 — Soldering process"),
    (OTHER, "Other"),
)

SOLDER_MASK_COLOUR_OPTIONS: tuple[tuple[str, str], ...] = (
    ("Green", "Green"),
    ("Matte Green", "Matte Green"),
    ("Black", "Black"),
    ("Matte Black", "Matte Black"),
    ("White", "White"),
    ("Red", "Red"),
    ("Blue", "Blue"),
    ("Purple", "Purple"),
    ("Yellow", "Yellow"),
    (OTHER, "Other"),
)

SILKSCREEN_COLOUR_OPTIONS: tuple[tuple[str, str], ...] = (
    ("White", "White"),
    ("Black", "Black"),
    ("Yellow", "Yellow"),
    (OTHER, "Other"),
)

VIA_TREATMENT_OPTIONS: tuple[tuple[str, str], ...] = (
    ("Tented", "Tented"),
    ("Untented", "Untented"),
    ("Plugged", "Plugged"),
    ("Filled", "Filled"),
    ("Filled and capped", "Filled and capped"),
    (OTHER, "Other"),
)


def _options(pairs: tuple[tuple[str, str], ...]) -> list[dict[str, str]]:
    return [{"value": value, "label": label} for value, label in pairs]


def public_ipc_payload() -> dict[str, Any]:
    return {
        "manufacturing": _options(MANUFACTURING_IPC_OPTIONS),
        "assembly": _options(ASSEMBLY_IPC_OPTIONS),
        "solder_mask_colour": _options(SOLDER_MASK_COLOUR_OPTIONS),
        "silkscreen_colour": _options(SILKSCREEN_COLOUR_OPTIONS),
        "via_treatment": _options(VIA_TREATMENT_OPTIONS),
    }
