"""What the maker rules (plan section 11) would do with the listings that wait today. Reads only; changes nothing.

    python scripts/manufacturer_dry_run.py            (PRISM_DATABASE_URL must be set)

For each listing not yet counted it says what the new rules make of it: exact (the distributor's spelling is the part's
maker), near (a different maker), or a question (the part's maker is not settled). It also reports the pending spellings.
"""

from __future__ import annotations

import os
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import psycopg  # noqa: E402
from psycopg.rows import dict_row  # noqa: E402

from app.services.supply.identity import alias_key, match_key  # noqa: E402
from app.services.supply.makers import same_maker  # noqa: E402


def main() -> None:
    with psycopg.connect(os.environ["PRISM_DATABASE_URL"], row_factory=dict_row) as conn:
        conn.execute("SET search_path TO supply")
        confirmed = {row["alias_key"]: row["manufacturer_id"] for row in conn.execute(
            "SELECT alias_key, manufacturer_id FROM manufacturer_aliases WHERE status = 'confirmed'").fetchall()}
        rows = conn.execute(
            """
            SELECT l.id, l.sku, l.raw_mpn, l.raw_manufacturer, l.match_state, c.display_name AS connector,
                   p.mpn, p.match_key, p.manufacturer_id, m.name AS maker
            FROM listings l JOIN parts p ON p.id = l.part_id JOIN manufacturers m ON m.id = p.manufacturer_id
            JOIN connectors c ON c.id = l.connector_id
            WHERE l.match_state IN ('manufacturer_unresolved', 'near') ORDER BY p.mpn, l.sku
            """
        ).fetchall()
        made = {row["manufacturer_id"]: row["alias_key"] for row in conn.execute(
            "SELECT DISTINCT ON (manufacturer_id) manufacturer_id, alias_key FROM manufacturer_aliases WHERE status = 'confirmed'").fetchall()}
        pending = conn.execute("SELECT alias_key, alias_text FROM manufacturer_aliases WHERE status = 'pending' ORDER BY alias_key").fetchall()

    outcome: Counter[str] = Counter()
    examples: dict[str, list[str]] = defaultdict(list)
    for row in rows:
        same_number = match_key(row["raw_mpn"] or "") == row["match_key"]
        if not same_number:
            kind = "near: another number"
        elif same_maker(row["raw_manufacturer"], row["maker"], lambda key: made.get(confirmed.get(key, "")) if key in confirmed else None):
            kind = "exact: same maker"
        elif alias_key(row["raw_manufacturer"]) in confirmed:
            kind = "near: another maker (confirmed)"
        else:
            kind = "near: another maker"
        outcome[(row["match_state"], kind)] += 1
        if len(examples[kind]) < 6:
            examples[kind].append(f"{row['mpn']}: {row['raw_manufacturer']!r} vs {row['maker']!r} ({row['connector']} {row['sku']})")

    print(f"{len(rows)} listings wait today")
    for (state, kind), count in sorted(outcome.items()):
        print(f"  {state:26} -> {kind:34} {count}")
    for kind, lines in examples.items():
        print(f"\n{kind}")
        for line in lines:
            print("   ", line)
    with psycopg.connect(os.environ["PRISM_DATABASE_URL"], row_factory=dict_row) as conn:
        conn.execute("SET search_path TO supply")
        every = conn.execute(
            """
            SELECT l.part_id, l.raw_mpn, l.raw_manufacturer, l.match_state, p.mpn, p.match_key, m.name AS maker
            FROM listings l JOIN parts p ON p.id = l.part_id JOIN manufacturers m ON m.id = p.manufacturer_id
            WHERE l.match_state <> 'rejected' ORDER BY p.mpn
            """
        ).fetchall()
    by_part: dict[str, list[dict]] = defaultdict(list)
    for row in every:
        by_part[row["part_id"]].append(row)
    unlisted = []
    for rows_of in by_part.values():
        first = rows_of[0]
        own = [
            r for r in rows_of
            if match_key(r["raw_mpn"] or "") == r["match_key"] and (r["match_state"] in ("exact", "manual") or same_maker(r["raw_manufacturer"], r["maker"]))
        ]
        others = sorted({r["raw_manufacturer"] for r in rows_of if match_key(r["raw_mpn"] or "") == r["match_key"] and r not in own})
        if not own and others:
            unlisted.append(f"{first['mpn']} ({first['maker']}): listed as {others}")
    print(f"\nparts that no distributor lists under their maker, while some list the number under another ({len(unlisted)}):")
    for line in unlisted:
        print("   ", line)
    print(f"\n{len(pending)} pending spellings")
    still = []
    for spelling in pending:
        makers = {row["maker"] for row in rows if alias_key(row["raw_manufacturer"]) == spelling["alias_key"]}
        matches = [maker for maker in makers if same_maker(spelling["alias_text"], maker)]
        print(f"  {spelling['alias_text']!r}: waits on {sorted(makers)}; same maker as {matches or 'none of them'}")
        if makers and not matches:
            still.append(spelling["alias_text"])
    print(f"\nspellings no rule settles: {len(still)} {still}")


if __name__ == "__main__":
    main()
