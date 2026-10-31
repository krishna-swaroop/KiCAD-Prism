"""Say once when a distributor sends a status or wording this adapter does not know.

An unknown value is read as having no effect. Logging it, once per value, is how a new
status that does matter gets noticed.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)
_seen: set[tuple[str, str, str]] = set()
_MAX_SEEN = 500


def note(provider: str, kind: str, value: object) -> None:
    text = str(value).strip()[:80]
    key = (provider, kind, text)
    if not text or key in _seen or len(_seen) >= _MAX_SEEN:
        return
    _seen.add(key)
    logger.warning("Unrecognised %s from %s: %r. Read as having no effect.", kind, provider, text)
