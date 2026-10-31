"""Product change notices: what a manufacturer announced about parts, entered by a person or read from a distributor.

A notice names the parts it covers, what kind of change it is (end of life, not recommended for new designs, last
time buy, other change), and its dates. People enter what a notice says; DigiKey's change notice API also lists
notices per product (``details.py``), stored with ``source`` and an ``external_key`` so the same notice is kept
once however many parts it covers. Prism does not read the notice PDF: a notice read from DigiKey has its type,
description, release date and link, and no last-time-buy date unless a person adds one. Open notices feed the
lifecycle outlook and raise an alert on watched parts. Closing a notice keeps it, and a closed one is not reopened
when the distributor lists it again.
"""

from __future__ import annotations

import hashlib
import re
import uuid
from datetime import date, datetime, timedelta
from typing import Any, Mapping, Sequence

from app.services.supply import clock, parts
from app.services.supply.audit import actor_text, write_audit
from app.services.supply.errors import Missing, Refused

KINDS = ("end_of_life", "nrnd", "last_time_buy", "change")
KIND_LABEL = {
    "end_of_life": "End of life",
    "nrnd": "Not recommended for new designs",
    "last_time_buy": "Last time buy",
    "change": "Product change",
}
# Kinds that say the part is heading for its end.
ENDING = ("end_of_life", "nrnd", "last_time_buy")
MAX_PARTS = 100
MAX_TITLE = 200
MAX_NOTES = 1000
SOON_DAYS = 90
# Any other notice (a change of packaging, site, design) is news for this long after Prism first sees it, if it was
# released in the last year. Older ones are history: they stay on the part sheet and stay out of the Inbox.
NEW_FOR_DAYS = 14
RECENT_RELEASE_DAYS = 365
SOURCES = ("manual", "digikey")
SOURCE_LABEL = {"manual": "Entered by hand", "digikey": "DigiKey"}

# Words in a distributor's notice type, lower case, to a kind. The first that matches wins; anything else is a change.
_KIND_WORDS = (
    ("last_time_buy", (r"last[ -]time[ -]buy", r"\bltb\b", r"last buy")),
    ("nrnd", (r"not recommended", r"\bnrnd\b")),
    ("end_of_life", (r"\beol\b", r"end[ -]of[ -]life", r"obsole", r"discontinu")),
)


class NoticeNotFound(Missing):
    """No notice with this id."""


class NoticeError(Refused):
    """The notice does not apply. The message is safe to show."""

    code = "invalid_notice"


def add(
    conn,
    title: str,
    kind: str,
    part_ids: Sequence[str],
    actor: str,
    *,
    notice_url: str = "",
    last_time_buy: date | None = None,
    last_time_ship: date | None = None,
    notes: str = "",
) -> dict[str, Any]:
    actor = actor_text(actor)
    title, notes, notice_url = title.strip(), notes.strip(), notice_url.strip()
    if not title or len(title) > MAX_TITLE:
        raise NoticeError(f"A notice needs a title of up to {MAX_TITLE} characters.")
    if kind not in KINDS:
        raise NoticeError(f"The kind must be one of {', '.join(KINDS)}.")
    if len(notes) > MAX_NOTES:
        raise NoticeError(f"Notes can be at most {MAX_NOTES} characters.")
    if notice_url and not notice_url.lower().startswith("https://"):
        raise NoticeError("The notice address must start with https://.")
    unique = list(dict.fromkeys(part_ids))
    if not unique or len(unique) > MAX_PARTS:
        raise NoticeError(f"A notice covers between 1 and {MAX_PARTS} parts.")
    if last_time_buy and last_time_ship and last_time_ship < last_time_buy:
        raise NoticeError("The last time to ship cannot be before the last time to buy.")
    for part_id in unique:
        parts.get_part(conn, part_id)
    notice_id = uuid.uuid4().hex
    conn.execute(
        """
        INSERT INTO supply_pcns (id, title, kind, notice_url, last_time_buy, last_time_ship, notes, state, created_by)
        VALUES (%s, %s, %s, %s, %s, %s, %s, 'open', %s)
        """,
        (notice_id, title, kind, notice_url, last_time_buy, last_time_ship, notes, actor),
    )
    for part_id in unique:
        conn.execute("INSERT INTO supply_pcn_parts (pcn_id, part_id) VALUES (%s, %s)", (notice_id, part_id))
    write_audit(conn, actor, "pcn.add", notice_id, {"kind": kind, "parts": len(unique), "title": title}, subject_kind="pcn")
    return {"id": notice_id}


def kind_from_text(text: str) -> str:
    """The kind a distributor's notice type stands for; ``change`` when it names none of the ending kinds."""

    value = text.lower()
    for kind, patterns in _KIND_WORDS:
        if any(re.search(pattern, value) for pattern in patterns):
            return kind
    return "change"


def external_key(url: str, kind_text: str, description: str, published_on: date | None) -> str:
    """The same notice gives the same key: its link when it has one, else what it says and when."""

    basis = url.strip().lower() or f"{kind_text.strip().lower()}|{description.strip().lower()}|{published_on}"
    return hashlib.sha256(basis.encode("utf-8")).hexdigest()[:40]


def record_external(
    conn,
    source: str,
    key: str,
    part_id: str,
    *,
    kind_text: str,
    description: str,
    notice_url: str = "",
    published_on: date | None = None,
) -> bool:
    """Keep a notice a distributor lists and tie it to ``part_id``. True when the notice or the tie is new."""

    if source not in SOURCES or source == "manual":
        raise NoticeError("Unknown notice source.")
    title = (kind_text or "Product change").strip()[:MAX_TITLE]
    url = notice_url.strip() if notice_url.strip().lower().startswith("https://") else ""
    created = conn.execute(
        """
        INSERT INTO supply_pcns (id, title, kind, notice_url, notes, state, created_by, source, external_key, published_on)
        VALUES (%s, %s, %s, %s, %s, 'open', %s, %s, %s, %s)
        ON CONFLICT (source, external_key) WHERE external_key <> '' DO NOTHING
        RETURNING id
        """,
        (uuid.uuid4().hex, title, kind_from_text(kind_text), url, description.strip()[:MAX_NOTES], source, source, key, published_on),
    ).fetchone()
    if created:
        notice_id = created["id"]
    else:
        notice_id = conn.execute("SELECT id FROM supply_pcns WHERE source = %s AND external_key = %s", (source, key)).fetchone()["id"]
        # The distributor's latest reading of the date wins, so a reading corrected later fixes a notice kept before.
        conn.execute("UPDATE supply_pcns SET published_on = %s WHERE id = %s AND published_on IS DISTINCT FROM %s", (published_on, notice_id, published_on))
    tied = conn.execute(
        "INSERT INTO supply_pcn_parts (pcn_id, part_id) VALUES (%s, %s) ON CONFLICT DO NOTHING RETURNING pcn_id", (notice_id, part_id)
    ).fetchone()
    return created is not None or tied is not None


def close(conn, notice_id: str, actor: str) -> None:
    actor = actor_text(actor)
    row = conn.execute("SELECT state FROM supply_pcns WHERE id = %s FOR UPDATE", (notice_id,)).fetchone()
    if row is None:
        raise NoticeNotFound(notice_id)
    if row["state"] == "closed":
        return
    conn.execute("UPDATE supply_pcns SET state = 'closed', closed_by = %s, closed_at = %s WHERE id = %s", (actor, clock.now(), notice_id))
    write_audit(conn, actor, "pcn.close", notice_id, {}, subject_kind="pcn")


def for_part(conn, part_id: str, *, include_closed: bool = False) -> list[dict[str, Any]]:
    """A part's notices, the soonest last-time-buy first."""

    return for_parts(conn, [part_id], include_closed=include_closed).get(part_id, [])


def for_parts(conn, part_ids: Sequence[str], *, include_closed: bool = False) -> dict[str, list[dict[str, Any]]]:
    """Each part's notices, the soonest last-time-buy first; parts with none are left out."""

    if not part_ids:
        return {}
    rows = conn.execute(
        """
        SELECT pp.part_id, n.id, n.title, n.kind, n.notice_url, n.last_time_buy, n.last_time_ship, n.notes, n.state, n.created_by, n.created_at,
               n.source, n.published_on,
               (SELECT COUNT(*) FROM supply_pcn_parts x WHERE x.pcn_id = n.id) AS parts
        FROM supply_pcns n JOIN supply_pcn_parts pp ON pp.pcn_id = n.id
        WHERE pp.part_id = ANY(%s) AND (n.state = 'open' OR %s)
        ORDER BY pp.part_id, n.last_time_buy NULLS LAST, n.published_on DESC NULLS LAST, n.created_at DESC
        """,
        (list(part_ids), include_closed),
    ).fetchall()

    def day(value: date | None) -> str | None:
        return value.isoformat() if value else None

    found: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        found.setdefault(r["part_id"], []).append({
            "id": r["id"], "title": r["title"], "kind": r["kind"], "kind_label": KIND_LABEL[r["kind"]], "notice_url": r["notice_url"],
            "last_time_buy": day(r["last_time_buy"]), "last_time_ship": day(r["last_time_ship"]), "notes": r["notes"],
            "state": r["state"], "created_by": r["created_by"], "created_at": r["created_at"].isoformat(), "parts": int(r["parts"]),
            "source": r["source"], "source_label": SOURCE_LABEL.get(r["source"], r["source"]), "published_on": day(r["published_on"]),
        })
    return found


def _is_new(notice: Mapping[str, Any], today: date) -> bool:
    seen = notice.get("created_at")
    if not seen or (today - datetime.fromisoformat(seen).date()).days > NEW_FOR_DAYS:
        return False
    released = notice.get("published_on")
    return not released or (today - date.fromisoformat(released)).days <= RECENT_RELEASE_DAYS


def alert_detail(notices: Sequence[Mapping[str, Any]], today: date) -> dict[str, Any] | None:
    """For the alert on a watched part: the most pressing open notice that says the part is ending; failing that, the
    newest change notice Prism has just learned of (``NEW_FOR_DAYS``, released within ``RECENT_RELEASE_DAYS``). Else None."""

    ending = [n for n in notices if n["state"] == "open" and n["kind"] in ENDING]
    if not ending:
        fresh = [n for n in notices if n["state"] == "open" and _is_new(n, today)]
        if not fresh:
            return None
        latest = max(fresh, key=lambda n: (n.get("published_on") or "", n.get("created_at") or ""))
        return {
            "title": latest["title"], "kind": latest["kind"], "kind_label": latest["kind_label"], "description": latest.get("notes", ""),
            "last_time_buy": None, "last_time_ship": None, "soon": False, "new": len(fresh),
        }
    chosen = min(ending, key=lambda n: (n["last_time_buy"] or "9999-12-31"))
    soon = bool(chosen["last_time_buy"]) and (date.fromisoformat(chosen["last_time_buy"]) - today).days <= SOON_DAYS
    return {
        "title": chosen["title"], "kind": chosen["kind"], "kind_label": chosen["kind_label"],
        "last_time_buy": chosen["last_time_buy"], "last_time_ship": chosen["last_time_ship"], "soon": soon,
    }


def next_change(notices: Sequence[Mapping[str, Any]], today: date) -> date | None:
    """The next day ``alert_detail`` can say something else by the clock alone: an ending notice's last time buy coming within
    ``SOON_DAYS``, a new notice no longer new. None when nothing waits on the clock."""

    days = []
    for notice in notices:
        if notice["state"] != "open":
            continue
        if notice["kind"] in ENDING and notice["last_time_buy"]:
            days.append(date.fromisoformat(notice["last_time_buy"]) - timedelta(days=SOON_DAYS))
        if notice.get("created_at"):
            days.append(datetime.fromisoformat(notice["created_at"]).date() + timedelta(days=NEW_FOR_DAYS + 1))
        if notice.get("published_on"):
            days.append(date.fromisoformat(notice["published_on"]) + timedelta(days=RECENT_RELEASE_DAYS + 1))
    later = [day for day in days if day > today]
    return min(later) if later else None


def today() -> date:
    return clock.now().date()
