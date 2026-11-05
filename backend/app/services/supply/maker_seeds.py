"""The known spellings of large makers, editable by an administrator. Functions on a connection; none commit.

A group is one maker: the spellings in it are the same maker (``makers.same_maker``). They began as a list in
``makers.SEEDED``; a migration copied them here.
"""

from __future__ import annotations

from typing import Any

from app.services.supply import makers
from app.services.supply.audit import actor_text, write_audit
from app.services.supply.identity import alias_key


def groups(conn) -> list[dict[str, Any]]:
    rows = conn.execute("SELECT alias_key, group_key, alias_text, source FROM supply_maker_seeds ORDER BY group_key, alias_key").fetchall()
    found: dict[str, dict[str, Any]] = {}
    for row in rows:
        group = found.setdefault(row["group_key"], {"group_key": row["group_key"], "name": row["group_key"], "spellings": []})
        group["spellings"].append({"alias_key": row["alias_key"], "alias_text": row["alias_text"], "source": row["source"]})
        if row["alias_key"] == row["group_key"]:
            group["name"] = row["alias_text"]
    return sorted(found.values(), key=lambda item: item["name"].lower())


def add(conn, spelling: str, group_key: str | None, actor: str) -> None:
    """Say a spelling is a maker's: a group's (``group_key``), or the first of a new group."""

    actor = actor_text(actor)
    key = alias_key(spelling)
    if not key:
        raise ValueError("Give a spelling.")
    if conn.execute("SELECT 1 FROM supply_maker_seeds WHERE alias_key = %s", (key,)).fetchone():
        raise ValueError("That spelling is already in a group.")
    group = group_key or key
    if group_key and not conn.execute("SELECT 1 FROM supply_maker_seeds WHERE group_key = %s LIMIT 1", (group_key,)).fetchone():
        raise ValueError("There is no such group.")
    conn.execute(
        "INSERT INTO supply_maker_seeds (alias_key, group_key, alias_text, source) VALUES (%s, %s, %s, 'person')", (key, group, spelling.strip()[:120])
    )
    write_audit(conn, actor, "maker_seed.add", key, {"group": group}, subject_kind="manufacturer_alias")
    makers.refresh(conn, force=True)


def remove(conn, key: str, actor: str) -> bool:
    actor = actor_text(actor)
    gone = conn.execute("DELETE FROM supply_maker_seeds WHERE alias_key = %s RETURNING alias_key", (key,)).fetchone()
    if gone:
        write_audit(conn, actor, "maker_seed.remove", key, {}, subject_kind="manufacturer_alias")
        makers.refresh(conn, force=True)
    return gone is not None
