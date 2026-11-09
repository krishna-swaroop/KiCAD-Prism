"""Mark a cached file used so retention evicts by last use."""

from __future__ import annotations

import os
from pathlib import Path


def touch_used(path: Path) -> None:
    try:
        os.utime(path, None)
    except OSError:
        pass  # a lost stamp only makes eviction earlier
