"""The one shape of a supply job's progress, which the UI asks for again until ``state`` is no longer ``running``.

``state`` is ``running``, ``done``, ``failed`` (``reason`` says why) or ``none`` (nothing was asked). ``done`` and
``total`` count the job's items, ``failed`` the items that could not be done. A job adds its own details beside them.
"""

from __future__ import annotations

from typing import Any, Literal

State = Literal["running", "done", "failed", "none"]


def job_progress(state: State, *, done: int = 0, total: int = 0, failed: int = 0, reason: str = "", **detail: Any) -> dict[str, Any]:
    return {"state": state, "done": done, "total": total, "failed": failed, "reason": reason, **detail}
