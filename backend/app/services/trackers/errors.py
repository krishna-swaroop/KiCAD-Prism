"""Typed provider failures for tracker adapters (contracts C3, C5, D9).

HTTP transport (TR-11) classifies a response into one of these classes.
Adapters and the sync engine must keep the classes distinct: a private 404
is not a deletion, a 304 is not success-with-body, and a transfer is not
an ordinary update.

Raw provider bodies never live on these objects. ``message`` is a sanitized
string (≤ 300 characters); tokens and credential URLs must already have
been stripped by the caller.
"""

from __future__ import annotations

import re
from typing import Optional

PROVIDER_ERROR_CLASSES = (
    "rate_limited",
    "auth_lost",
    "forbidden",
    "not_found_uncertain",
    "gone_confirmed",
    "moved",
    "transient",
    "invalid_request",
    "capability_missing",
    # Local D7 policy pauses (not forge HTTP). Distinct from auth_lost (R3-M4).
    "paused",
    "visibility",
    "visibility_unknown",
    "connector_missing",
)

# Read outcomes that are not "here is the object". 304 is not an error class.
READ_OUTCOME_KINDS = (
    "ok",
    "not_modified",
    "not_found_uncertain",
    "gone_confirmed",
    "moved",
    "auth_lost",
    "forbidden",
    "rate_limited",
    "transient",
)

_MAX_MESSAGE = 300
_SECRET = re.compile(
    r"(?i)(gho_|ghs_|ghu_|ghr_|ghp_|github_pat_|bearer\s+)\S+|"
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----.+?-----END [A-Z ]*PRIVATE KEY-----"
)

_RETRYABLE = {
    "rate_limited": True,
    "auth_lost": False,
    "forbidden": False,
    "not_found_uncertain": True,
    "gone_confirmed": False,
    "moved": False,
    "transient": True,
    "invalid_request": False,
    "capability_missing": False,
    "paused": False,
    "visibility": False,
    "visibility_unknown": False,
    "connector_missing": False,
}


def classify_read_status(status: int, *, retry_after: bool = False) -> str:
    """Map an HTTP status to a read-outcome kind.

    403 with a retry-after (or secondary-limit) signal is ``rate_limited``;
    a bare 403 is ``forbidden``. 404 is always uncertain absence.
    """

    if status == 200:
        return "ok"
    if status == 304:
        return "not_modified"
    if status == 401:
        return "auth_lost"
    if status == 429 or (status == 403 and retry_after):
        return "rate_limited"
    if status == 403:
        return "forbidden"
    if status == 404:
        return "not_found_uncertain"
    if status == 410:
        return "gone_confirmed"
    if status in (301, 302, 303, 307, 308):
        return "moved"
    if status == 422:
        return "invalid_request"
    if status >= 500:
        return "transient"
    return "transient"


class ProviderError(Exception):
    """A classified provider failure. Never wraps a raw response body."""

    def __init__(
        self,
        class_: str,
        message: str,
        *,
        resume_at: Optional[str] = None,
        status: Optional[int] = None,
        retryable: Optional[bool] = None,
        new_ref: Optional[str] = None,
    ) -> None:
        if class_ not in PROVIDER_ERROR_CLASSES:
            raise ValueError(f"unknown provider error class: {class_!r}")
        cleaned = " ".join((message or "").split())
        cleaned = _SECRET.sub("<redacted>", cleaned)
        if len(cleaned) > _MAX_MESSAGE:
            cleaned = cleaned[: _MAX_MESSAGE - 1] + "…"
        super().__init__(cleaned)
        self.class_ = class_
        self.message = cleaned
        self.resume_at = resume_at
        self.status = status
        self.retryable = _RETRYABLE[class_] if retryable is None else retryable
        self.new_ref = new_ref

    def to_dto(self) -> dict:
        payload = {
            "class": self.class_,
            "message": self.message,
            "resumeAt": self.resume_at,
            "status": self.status,
            "retryable": self.retryable,
        }
        if self.new_ref is not None:
            payload["newRef"] = self.new_ref
        return payload
