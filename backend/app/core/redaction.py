"""One redactor for diagnostics that leave the server (ADR §11, D22).

Log lines, error messages, query text and URLs can carry credentials. Anything
an ops tool returns passes through ``redact_text`` or ``redact_value`` first:
URL userinfo, authorization and cookie headers, bearer tokens, Prism's own
token shapes (``prism_pat_``, ``prism_mcp_rt_``, ``whsec_``), JWTs and
``key=value`` secrets are replaced with ``[REDACTED]``. It is deliberately
blunt: a diagnostic that loses a harmless word is fine, one that leaks a token
is not.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any

REDACTED = "[REDACTED]"
MAX_TEXT = 4000

_SECRET_NAMES = r"password|passwd|secret|token|api[_-]?key|authorization|cookie|private[_-]?key|credential"
_KEY_VALUE = re.compile(rf"(?i)\b({_SECRET_NAMES})(\s*[:=]\s*)([^\s,;&]+)")
_SECRET_KEY = re.compile(rf"(?i)({_SECRET_NAMES})")
_AUTH_HEADER = re.compile(r"(?im)\b(authorization|cookie|set-cookie)(\s*[:=]\s*)[^\r\n]+")
_URL_CREDENTIAL = re.compile(r"://([^/\s:@]+)(:[^@\s/]*)?@")
_BEARER = re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]+")
_PRISM_TOKEN = re.compile(r"\b(prism_pat_|prism_mcp_rt_|whsec_)[A-Za-z0-9+/=_-]+")
_JWT = re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}")
_QUERY_SECRET = re.compile(rf"(?i)([?&](?:{_SECRET_NAMES}|access_token|refresh_token|code)=)[^&\s#]+")


def redact_text(value: object, *, limit: int = MAX_TEXT) -> str:
    """``value`` as text with credential-shaped parts replaced, cut to ``limit``."""

    text = str(value).replace("\x00", " ")[:limit]
    text = _URL_CREDENTIAL.sub(f"://{REDACTED}@", text)
    text = _AUTH_HEADER.sub(rf"\1\2{REDACTED}", text)
    text = _BEARER.sub(f"Bearer {REDACTED}", text)
    text = _PRISM_TOKEN.sub(rf"\1{REDACTED}", text)
    text = _JWT.sub(REDACTED, text)
    text = _QUERY_SECRET.sub(rf"\1{REDACTED}", text)
    return _KEY_VALUE.sub(rf"\1\2{REDACTED}", text)


def redact_value(value: Any) -> Any:
    """``value`` with secret-named keys masked and every string redacted."""

    if isinstance(value, Mapping):
        return {
            str(key): (REDACTED if _SECRET_KEY.search(str(key)) else redact_value(item))
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [redact_value(item) for item in value]
    if isinstance(value, str):
        return redact_text(value)
    return value


__all__ = ["REDACTED", "redact_text", "redact_value"]
