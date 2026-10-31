"""Picking which packaging of a part is followed, by the packaging a project asks for (plan sections 12 and 19.3).

A distributor lists one part as several listings (cut tape, reel, Digi-Reel). Reading all of them costs a call each, so one
is followed (``packaging_picks.py``). Nobody should have to choose per part: a project says which packaging it prefers, and
Prism picks the listing that matches.

* ``cut_tape``: cut tape; where a distributor has none, a custom reel (cut to the quantity), else the smallest order.
* ``custom_reel``: a custom reel (Digi-Reel, MouseReel); else cut tape, else the smallest order.
* ``tape_reel``: a full reel (the smallest one); else a custom reel, else cut tape, else the smallest order.
* ``tube_tray``: a tube, tray or bulk pack as the maker packs it; else the smallest order.
* ``smallest``: the smallest minimum order, whatever it is.

A packaging stated by the distributor beats one Prism guessed from the number (``packaging_inferred``). A part used by tracked
projects that ask for different packagings follows the smaller one. A part in no project uses its own watch setting, else cut
tape. A person's pick is never changed; only picks Prism made are redone when a project's packaging changes.
Functions on a connection; none commit.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from app.services.supply import admission, packaging_picks, stock, usage

CUT_TAPE, CUSTOM_REEL, TAPE_REEL, TUBE_TRAY, SMALLEST = "cut_tape", "custom_reel", "tape_reel", "tube_tray", "smallest"
PACKAGINGS = (CUT_TAPE, CUSTOM_REEL, TAPE_REEL, TUBE_TRAY, SMALLEST)
DEFAULT = CUT_TAPE
AUTO = "auto"
# The smaller one wins when projects differ: a part that is bought cut is not forced onto a reel.
_SMALLER = {SMALLEST: 0, TUBE_TRAY: 1, CUT_TAPE: 2, CUSTOM_REEL: 3, TAPE_REEL: 4}
# A watch's own packaging setting (same words as the stock policy) read as a project packaging.
_WATCH = {"cut_tape": CUT_TAPE, "custom_reel": CUSTOM_REEL, "tape_reel": TAPE_REEL, "tray": TUBE_TRAY, "tube": TUBE_TRAY, "bulk": SMALLEST}
_NAME = {CUT_TAPE: "Cut tape", CUSTOM_REEL: "Custom reel", TAPE_REEL: "Full reel", TUBE_TRAY: "Tube or tray", SMALLEST: "Smallest order"}
# What each choice looks for, in order; the last stop is always the smallest order.
_CHAIN = {
    CUT_TAPE: ("cut_tape", "several", "custom_reel"),
    CUSTOM_REEL: ("custom_reel", "several", "cut_tape"),
    TAPE_REEL: ("tape_reel", "custom_reel", "several", "cut_tape"),
    TUBE_TRAY: ("tube", "tray", "bulk"),
    SMALLEST: (),
}


def policy_of(conn, part_id: str) -> str:
    """The packaging a part is bought in: the smaller of what its tracked projects ask for, else its watch's (``stock.packaging_of``), else cut tape."""

    rows = conn.execute(
        "SELECT DISTINCT tp.project_id, tp.packaging FROM supply_parts p JOIN supply_manufacturers m ON m.id = p.manufacturer_id "
        "JOIN " + usage.ALL_USES + " u ON " + usage.MATCHES_PART + " JOIN supply_tracked_projects tp ON tp.project_id = u.project_id "
        "WHERE p.id = %s",
        (part_id,),
    ).fetchall()
    asked = [row["packaging"] for row in rows if row["packaging"] in _SMALLER]
    if asked:
        return min(asked, key=_SMALLER.__getitem__)
    return _WATCH.get(stock.packaging_of(conn, part_id), DEFAULT)


def _moq(listing: dict[str, Any]) -> int:
    return int(listing["moq"] or 1)


def _first_price(listing: dict[str, Any]) -> Decimal:
    breaks = listing.get("price_breaks") or []
    return Decimal(str(breaks[0][1])) if breaks else Decimal("Infinity")


def _smallest(listings: list[dict[str, Any]]) -> dict[str, Any]:
    """In stock before out of stock, then the smallest order, then the lowest price at it."""

    return min(listings, key=lambda item: (not (item.get("stock") or 0) > 0, _moq(item), _first_price(item), item["sku"]))


def choose_with_note(listings: list[dict[str, Any]], policy: str) -> tuple[dict[str, Any], str]:
    """The listing to follow among these (the same part at one distributor), and a note when the choice fell back."""

    wanted = _CHAIN.get(policy, ())
    for index, kind in enumerate(wanted):
        matching = [item for item in listings if packaging_picks._packaging(item) == kind]  # noqa: SLF001
        certain = [item for item in matching if not item.get("packaging_inferred")]
        found = certain or matching
        if found:
            note = "" if index == 0 or (policy == CUT_TAPE and kind == "several") else f"{_NAME[policy]}, not offered here"
            return _smallest(found), note
    if policy == SMALLEST:
        return _smallest(listings), ""
    return _smallest(listings), f"{_NAME[policy]}, not offered here"


def choose(listings: list[dict[str, Any]], policy: str) -> dict[str, Any]:
    return choose_with_note(listings, policy)[0]


def auto_pick(conn, *, limit: int = 500) -> int:
    """Pick a packaging for every tracked part that has several listings at a distributor and no pick. Returns how many."""

    done = 0
    for item in packaging_picks.waiting(conn, limit):
        listings = packaging_picks._listings(conn, item["part_id"], item["connector_id"])  # noqa: SLF001
        if len(listings) < 2 or any(row["fetched_at"] is None for row in listings):
            continue  # read first: a minimum order is only known from an offer
        chosen, note = choose_with_note(listings, policy_of(conn, item["part_id"]))
        packaging_picks.pick(conn, item["part_id"], item["connector_id"], chosen["id"], AUTO, note=note)
        done += 1
    return done


def repick(conn, project_id: str) -> int:
    """Redo the picks Prism made for a project's parts (its packaging changed). A person's pick stays. Returns how many."""

    removed = conn.execute(
        "DELETE FROM supply_packaging_picks pk USING supply_parts p JOIN supply_manufacturers m ON m.id = p.manufacturer_id "
        "JOIN " + usage.ALL_USES + " u ON " + usage.MATCHES_PART + " "
        "WHERE pk.part_id = p.id AND pk.picked_by = %s AND u.project_id = %s",
        (AUTO, project_id),
    ).rowcount
    done = auto_pick(conn) if removed else 0
    if removed:
        admission.sync(conn)
    return done


def propose(conn, part_id: str) -> list[dict[str, Any]]:
    """The picks Prism would make for a part's distributors that list several packagings and have no pick yet."""

    proposals = []
    policy = policy_of(conn, part_id)
    for item in packaging_picks.waiting(conn, packaging_picks.MAX_WAITING):
        if item["part_id"] != part_id:
            continue
        listings = packaging_picks._listings(conn, part_id, item["connector_id"])  # noqa: SLF001
        if len(listings) < 2:
            continue
        chosen, note = choose_with_note(listings, policy)
        proposals.append({
            "connector_id": item["connector_id"], "connector": item["connector"], "listing_id": chosen["id"], "sku": chosen["sku"],
            "packaging": packaging_picks._packaging(chosen),  # noqa: SLF001
            "note": note, "saves_calls_a_day": item["saves_calls_a_day"],
        })
    return proposals


def apply_proposals(conn, part_id: str, actor: str) -> int:
    """Pick the proposed listing at every distributor of this part that waits for a pick. Returns how many were picked."""

    done = 0
    for item in propose(conn, part_id):
        packaging_picks.pick(conn, part_id, item["connector_id"], item["listing_id"], actor, note=item["note"])
        done += 1
    return done
