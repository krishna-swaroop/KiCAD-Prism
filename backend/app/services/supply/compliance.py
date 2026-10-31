"""REACH: the ECHA Candidate List of substances of very high concern, and what is declared for a part.

Distributors seldom say which substances a part contains. Two things feed the ``reach_svhc`` finding: a
distributor flagging a part as affected (read with the offer), and a supplier's declaration entered here
as CAS numbers and matched against the Candidate List. The list is loaded by an administrator from the
export ECHA publishes (it changes about twice a year); nothing is fetched. A part with no declaration and
no flag is *unknown* for REACH, not clean.
"""

from __future__ import annotations

import csv
import io
import re
from datetime import date, datetime
from typing import Any, Iterable, Mapping, Sequence

from app.services.supply import clock, counted, facts, offer_rules, parts, spreadsheet
from app.services.supply.audit import actor_text, write_audit
from app.services.supply.errors import Refused

MAX_LIST_BYTES = 5 * 1024 * 1024
# A spreadsheet is a zip file: what it holds once unpacked is capped too, so a small file cannot fill memory.
MAX_XLSX_UNPACKED = 60 * 1024 * 1024
MAX_PER_PART = 100
_CAS = re.compile(r"^\d{2,7}-\d{2}-\d$")
# Header names ECHA and spreadsheets use, lower case, for each column we read.
_COLUMNS = {
    "name": ("substance name", "name", "substance"),
    "ec": ("ec no.", "ec no", "ec number", "ec"),
    "cas": ("cas no.", "cas no", "cas number", "cas"),
    "added": ("date of inclusion", "inclusion date", "date added", "added"),
}


class ComplianceError(Refused):
    """The input does not apply. The message is safe to show."""

    code = "invalid_compliance"


def valid_cas(number: str) -> bool:
    """A CAS number: digits in the 2-2-1 pattern, with its check digit correct."""

    number = number.strip()
    if not _CAS.match(number):
        return False
    digits = number.replace("-", "")
    body, check = digits[:-1], int(digits[-1])
    return sum(int(d) * i for i, d in enumerate(reversed(body), 1)) % 10 == check


def _delimiter(sample: str) -> str:
    return max((",", ";", "\t"), key=sample.count)


HEADER_SEARCH_LINES = 20


def _from_header(text: str) -> str:
    """The text from its header row on. An export can start with title rows; the header is the first line with a CAS and a name column."""

    lines = text.splitlines(keepends=True)
    for index, line in enumerate(lines[:HEADER_SEARCH_LINES]):
        cells = {cell.strip().strip('"').lower() for cell in line.split(_delimiter(line))}
        if cells & set(_COLUMNS["cas"]) and cells & set(_COLUMNS["name"]):
            return "".join(lines[index:])
    return text


def csv_from_xlsx(data: bytes) -> str:
    """The first sheet of an Excel file as CSV text, for ``parse_list`` (which finds the header row itself)."""

    try:
        rows = spreadsheet.first_sheet_rows(data, max_bytes=MAX_LIST_BYTES, max_unpacked=MAX_XLSX_UNPACKED)
    except spreadsheet.SpreadsheetError as exc:
        raise ComplianceError(str(exc)) from exc
    out = io.StringIO()
    csv.writer(out).writerows(rows)
    return out.getvalue()


def parse_list(text: str) -> list[dict[str, Any]]:
    """Substances of an ECHA Candidate List export. A row without a valid CAS number is skipped and counted by the caller."""

    text = text.lstrip("﻿")
    if not text.strip():
        raise ComplianceError("The file is empty.")
    text = _from_header(text)
    header, _, _ = text.partition("\n")
    reader = csv.DictReader(io.StringIO(text), delimiter=_delimiter(header))
    names = {str(field).strip().lower(): field for field in (reader.fieldnames or [])}

    def column(key: str) -> str | None:
        return next((names[candidate] for candidate in _COLUMNS[key] if candidate in names), None)

    cas_col, name_col = column("cas"), column("name")
    if cas_col is None or name_col is None:
        raise ComplianceError("The file needs a substance name column and a CAS number column.")
    ec_col, added_col = column("ec"), column("added")
    found: dict[tuple[str, str], dict[str, Any]] = {}
    for row in reader:
        # One cell can hold several CAS numbers, separated by slashes, commas or line breaks.
        for number in re.split(r"[\s,;/]+", str(row.get(cas_col) or "")):
            if not valid_cas(number):
                continue
            added: date | None = None
            raw = str(row.get(added_col) or "").strip() if added_col else ""
            for pattern in ("%Y-%m-%d", "%d/%m/%Y", "%d.%m.%Y"):
                try:
                    added = datetime.strptime(raw, pattern).date()
                    break
                except ValueError:
                    continue
            name = str(row.get(name_col) or "").strip()[:300]
            if name:
                found[(number, name)] = {"cas": number, "name": name, "ec": str(row.get(ec_col) or "").strip()[:30] if ec_col else "", "added_on": added}
    if not found:
        raise ComplianceError("No substance with a valid CAS number was found in the file.")
    return list(found.values())


def load_list(conn, text: str, source_name: str, actor: str) -> dict[str, Any]:
    """Replace the Candidate List with the one in ``text``."""

    actor = actor_text(actor)
    if len(text.encode("utf-8")) > MAX_LIST_BYTES:
        raise ComplianceError("The file is larger than 5 MB.")
    substances = parse_list(text)
    conn.execute("DELETE FROM supply_svhc_substances")
    for item in substances:
        conn.execute(
            "INSERT INTO supply_svhc_substances (cas, name, ec, added_on) VALUES (%s, %s, %s, %s)",
            (item["cas"], item["name"], item["ec"], item["added_on"]),
        )
    conn.execute(
        """
        INSERT INTO supply_svhc_list (id, loaded_at, loaded_by, source_name, substances) VALUES (1, %s, %s, %s, %s)
        ON CONFLICT (id) DO UPDATE SET loaded_at = EXCLUDED.loaded_at, loaded_by = EXCLUDED.loaded_by,
            source_name = EXCLUDED.source_name, substances = EXCLUDED.substances
        """,
        (clock.now(), actor, source_name[:200], len(substances)),
    )
    write_audit(conn, actor, "svhc.load", "1", {"source": source_name[:200], "substances": len(substances)}, subject_kind="compliance")
    return list_info(conn)


def list_info(conn) -> dict[str, Any]:
    row = conn.execute("SELECT loaded_at, loaded_by, source_name, substances FROM supply_svhc_list WHERE id = 1").fetchone()
    if row is None:
        return {"loaded": False, "substances": 0, "loaded_at": None, "loaded_by": "", "source_name": ""}
    return {"loaded": True, "substances": int(row["substances"]), "loaded_at": row["loaded_at"].isoformat(),
            "loaded_by": row["loaded_by"], "source_name": row["source_name"]}


def declare(conn, part_id: str, cas: str, note: str, actor: str) -> None:
    """Record that a supplier declared this substance in the part."""

    actor = actor_text(actor)
    parts.get_part(conn, part_id)
    cas = cas.strip()
    if not valid_cas(cas):
        raise ComplianceError(f"{cas or 'That'} is not a valid CAS number.")
    count = conn.execute("SELECT COUNT(*) AS n FROM supply_part_substances WHERE part_id = %s", (part_id,)).fetchone()["n"]
    if count >= MAX_PER_PART:
        raise ComplianceError(f"A part can have at most {MAX_PER_PART} declared substances.")
    conn.execute(
        """
        INSERT INTO supply_part_substances (part_id, cas, note, declared_by, declared_at) VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (part_id, cas) DO UPDATE SET note = EXCLUDED.note, declared_by = EXCLUDED.declared_by, declared_at = EXCLUDED.declared_at
        """,
        (part_id, cas, note.strip()[:200], actor, clock.now()),
    )
    write_audit(conn, actor, "svhc.declare", part_id, {"cas": cas}, subject_kind="part")


DISTRIBUTOR_PREFIX = "distributor:"
_CAS_IN_TEXT = re.compile(r"\b\d{2,7}-\d{2}-\d\b")


def sync_distributor(conn, part_id: str, provider: str, entries: Sequence[str]) -> int:
    """Make the substances a distributor names for a part its declarations from that distributor. Returns how many changed.

    An entry counts when it holds a valid CAS number, or when its text is a Candidate List name. People's own
    declarations are never touched.
    """

    found: dict[str, str] = {}
    for entry in entries:
        numbers = [number for number in _CAS_IN_TEXT.findall(entry) if valid_cas(number)]
        if not numbers:
            row = conn.execute(
                "SELECT cas FROM supply_svhc_substances WHERE lower(name) = lower(%s) ORDER BY cas LIMIT 1", (entry.strip(),)
            ).fetchone()
            numbers = [row["cas"]] if row else []
        for number in numbers:
            found.setdefault(number, entry[:200])
    source = DISTRIBUTOR_PREFIX + provider
    removed = conn.execute(
        "DELETE FROM supply_part_substances WHERE part_id = %s AND declared_by = %s AND NOT (cas = ANY(%s))",
        (part_id, source, list(found)),
    ).rowcount
    added = 0
    for number, text in list(found.items())[:MAX_PER_PART]:
        added += conn.execute(
            """
            INSERT INTO supply_part_substances (part_id, cas, note, declared_by, declared_at) VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (part_id, cas) DO NOTHING RETURNING cas
            """,
            (part_id, number, text, source, clock.now()),
        ).fetchone() is not None
    return removed + added


def record_distributor(conn, part_id: str, provider: str, entries: Sequence[str], now: datetime) -> int:
    """Keep what a distributor states about a part's substances: its ``reach_svhc`` fact and its declarations
    (``sync_distributor``). Returns how many declarations changed."""

    facts.set_one(conn, part_id, provider, "reach_svhc", "; ".join(entries) or "None listed", now)
    return sync_distributor(conn, part_id, provider, entries)


def source_label(declared_by: str) -> str:
    """Who declared a substance, in words: a person's address, or the distributor."""

    if declared_by.startswith(DISTRIBUTOR_PREFIX):
        provider = declared_by[len(DISTRIBUTOR_PREFIX):]
        return {"mouser": "Mouser", "digikey": "DigiKey"}.get(provider, provider)
    return declared_by


def remove_declaration(conn, part_id: str, cas: str, actor: str) -> None:
    actor = actor_text(actor)
    conn.execute("DELETE FROM supply_part_substances WHERE part_id = %s AND cas = %s", (part_id, cas.strip()))
    write_audit(conn, actor, "svhc.undeclare", part_id, {"cas": cas.strip()}, subject_kind="part")


def declared(conn, part_id: str) -> list[dict[str, Any]]:
    """Substances declared for a part, each with the Candidate List entry it matches, if any."""

    rows = conn.execute(
        """
        SELECT d.cas, d.note, d.declared_by, d.declared_at, s.name AS listed_as
        FROM supply_part_substances d LEFT JOIN LATERAL (
            SELECT name FROM supply_svhc_substances WHERE cas = d.cas ORDER BY name LIMIT 1
        ) s ON TRUE
        WHERE d.part_id = %s ORDER BY d.cas
        """,
        (part_id,),
    ).fetchall()
    return [
        {"cas": r["cas"], "note": r["note"], "declared_by": source_label(r["declared_by"]), "declared_at": r["declared_at"].isoformat(),
         "listed_as": r["listed_as"], "from_distributor": r["declared_by"].startswith(DISTRIBUTOR_PREFIX)}
        for r in rows
    ]


def listed_substances(conn, part_ids: Sequence[str]) -> dict[str, list[str]]:
    """Per part, the names of declared substances that are on the Candidate List."""

    if not part_ids:
        return {}
    found: dict[str, list[str]] = {}
    for row in conn.execute(
        """
        SELECT d.part_id, (SELECT name FROM supply_svhc_substances WHERE cas = d.cas ORDER BY name LIMIT 1) AS name
        FROM supply_part_substances d WHERE d.part_id = ANY(%s) AND EXISTS (SELECT 1 FROM supply_svhc_substances s WHERE s.cas = d.cas)
        ORDER BY d.part_id, d.cas
        """,
        (list(part_ids),),
    ).fetchall():
        found.setdefault(row["part_id"], []).append(row["name"])
    return found


def standing(offers: Iterable[Mapping[str, Any]], listed: Sequence[str]) -> dict[str, Any]:
    """What is known about REACH for a part: ``affected``, ``clear`` or ``unknown``, and why."""

    flags = [offer.get("reach_affected") for offer in offers if offer.get("reach_affected") is not None]
    if listed:
        return {"state": "affected", "reason": f"A declared substance is on the Candidate List: {', '.join(listed)}."}
    if any(flags):
        return {"state": "affected", "reason": "A distributor lists the part as affected by REACH."}
    if flags:
        return {"state": "clear", "reason": "Distributors list the part as not affected. No substance declaration is on file."}
    return {"state": "unknown", "reason": "No distributor or declaration says either way."}


_ROHS_REASONS = {
    "compliant": "Distributors list the part as RoHS compliant.",
    "not_compliant": "Distributors list the part as not RoHS compliant.",
    "disputed": "Distributors disagree.",
    "not_applicable": "Distributors state RoHS does not apply to the part.",
    "unknown": "No distributor says either way.",
}


def rohs_standing(offers: Sequence[Mapping[str, Any]], stated: Sequence[str]) -> dict[str, str]:
    """What is known about RoHS for a part (``offer_rules.rohs_verdict``) and why."""

    state = offer_rules.rohs_verdict(offers, stated)
    from_offers = any(offer.get("rohs") is not None for offer in offers)
    reason = _ROHS_REASONS[state]
    if not from_offers and state in ("compliant", "not_compliant", "disputed"):
        reason = {"compliant": "The part's stated RoHS status is compliant.", "not_compliant": "The part's stated RoHS status is not compliant.",
                  "disputed": "The RoHS statuses stated for the part disagree."}[state]
    return {"state": state, "reason": reason}


MAX_EXEMPTIONS = 20
_EXEMPTION = re.compile(r"^[0-9]{1,2}(?:\([a-z]{1,2}\))?(?:-[IVX]{1,4})?(?:\([a-z]{1,2}\))?$|^[A-Za-z0-9 ./()\-]{2,24}$")


def add_exemption(conn, part_id: str, code: str, note: str, actor: str) -> None:
    """Record a RoHS exemption the part relies on, as the manufacturer's declaration numbers it (``7(a)``, ``6(c)``)."""

    actor = actor_text(actor)
    parts.get_part(conn, part_id)
    code = code.strip()
    if not code or not _EXEMPTION.match(code):
        raise ComplianceError("Give the exemption as its number in Annex III or IV, such as 7(a).")
    count = conn.execute("SELECT COUNT(*) AS n FROM supply_rohs_exemptions WHERE part_id = %s", (part_id,)).fetchone()["n"]
    if count >= MAX_EXEMPTIONS:
        raise ComplianceError(f"A part can have at most {MAX_EXEMPTIONS} exemptions.")
    conn.execute(
        """
        INSERT INTO supply_rohs_exemptions (part_id, code, note, declared_by, declared_at) VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (part_id, code) DO UPDATE SET note = EXCLUDED.note, declared_by = EXCLUDED.declared_by, declared_at = EXCLUDED.declared_at
        """,
        (part_id, code, note.strip()[:200], actor, clock.now()),
    )
    write_audit(conn, actor, "rohs.exemption", part_id, {"code": code}, subject_kind="part")


def remove_exemption(conn, part_id: str, code: str, actor: str) -> None:
    actor = actor_text(actor)
    conn.execute("DELETE FROM supply_rohs_exemptions WHERE part_id = %s AND code = %s", (part_id, code))
    write_audit(conn, actor, "rohs.exemption_removed", part_id, {"code": code}, subject_kind="part")


def exemptions(conn, part_ids: Sequence[str]) -> dict[str, list[dict[str, str]]]:
    """Per part, the exemptions named for it, in code order."""

    if not part_ids:
        return {}
    found: dict[str, list[dict[str, str]]] = {}
    for row in conn.execute(
        "SELECT part_id, code, note, declared_by FROM supply_rohs_exemptions WHERE part_id = ANY(%s) ORDER BY part_id, code", (list(part_ids),)
    ).fetchall():
        found.setdefault(row["part_id"], []).append({"code": row["code"], "note": row["note"], "declared_by": row["declared_by"]})
    return found


def rohs_flags(conn, part_ids: Sequence[str]) -> dict[str, list[dict[str, Any]]]:
    """Per part, the RoHS and REACH flags of its counted offers, with the distributor that gives them."""

    found: dict[str, list[dict[str, Any]]] = {part_id: [] for part_id in part_ids}
    if part_ids:
        for row in conn.execute(
            "SELECT l.part_id, o.rohs, o.reach_affected, c.display_name AS connector_name FROM supply_offers o "
            "JOIN supply_listings l ON l.id = o.listing_id JOIN supply_connectors c ON c.id = l.connector_id "
            f"WHERE l.part_id = ANY(%s) AND {counted.listing_sql()}",
            (list(part_ids),),
        ).fetchall():
            found[row["part_id"]].append(dict(row))
    return found


def rohs_verdicts(conn, part_ids: Sequence[str]) -> dict[str, str]:
    """Each part's RoHS verdict (``offer_rules.rohs_verdict``): its counted offers first, the RoHS status stated for it when none says."""

    offers = rohs_flags(conn, part_ids)
    stated = facts.rohs_stated(conn, part_ids)
    return {part_id: offer_rules.rohs_verdict(offers[part_id], stated.get(part_id, ())) for part_id in part_ids}
