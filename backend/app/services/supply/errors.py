"""Supply's refusals as Prism's typed errors (``app.core.errors``).

Every supply exception a caller can act on derives from one of these, so the
one ``DomainError`` handler answers it ``{"detail": "<message>", "code": ...}``
and no supply router translates errors. Each also keeps the built-in base it
had (``KeyError``, ``ValueError``, ``PermissionError``) so code that catches
those still does.
"""

from __future__ import annotations

from app.core.errors import BadRequest, Conflict, DomainError, Forbidden, NotFound


class Missing(NotFound, KeyError):
    """No such record. The id stays in ``args`` for logs; the caller reads ``default_detail``."""

    def __init__(self, *args: object) -> None:
        super().__init__()
        self.args = args

    def __str__(self) -> str:
        return str(self.detail)


class Refused(BadRequest, ValueError):
    """A request the supply rules refuse. Subclasses set ``code``; the message is shown."""


class Clash(Conflict, ValueError):
    """A request that contradicts the current state."""


class TooSoon(DomainError, ValueError):
    """The same read was asked for a short while ago. The message says how long to wait."""

    status_code = 429
    code = "too_soon"


class Denied(Forbidden, PermissionError):
    """The caller may not make this change."""
