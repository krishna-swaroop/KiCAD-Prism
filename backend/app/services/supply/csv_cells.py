"""Spreadsheet-safe CSV cells."""

from __future__ import annotations

RISKY_START = ("=", "+", "-", "@", "\t", "\r")


def safe_cell(cell: object) -> str:
    text = str(cell)
    return "'" + text if text.startswith(RISKY_START) else text
