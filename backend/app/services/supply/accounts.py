"""Accounts: the credentials a provider knows Prism by.

Two connectors on the same credentials (two TME storefronts, two DigiKey sites) are one account to the provider, so
they share its daily budget, its pacing and its job slot. An account is a row of ``supply_accounts``: it holds the daily
budget, the share kept for people, the provider's reset time and the call ledger, so editing any of its connectors edits
them for all, and deleting one never moves the day's spending. It is recognised by a keyed hash of the provider and
its credentials; the credentials themselves are never kept in the clear. A connector with no credentials is its own
account.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, Mapping

from app.services.supply import quota
from app.services.trackers.secrets import CredentialKeyring

PURPOSE = "supply.account"
# The account settings, kept on ``supply_accounts``; a connector's row shows its account's.
SETTINGS = ("daily_budget", "interactive_reserve_pct", "reset_time", "reset_tz")
# A connector's row with its account's settings and key, for code that reads a connector as one row.
CONNECTOR_SQL = (
    "SELECT c.*, a.account_key, a.daily_budget, a.interactive_reserve_pct, a.reset_time, a.reset_tz "
    "FROM supply_connectors c JOIN supply_accounts a ON a.id = c.account_id"
)


@dataclass(frozen=True, slots=True)
class Account:
    ledger_id: str
    daily_budget: int
    reserve_pct: int
    reset_time: str
    reset_tz: str
    members: tuple[str, ...]

    @property
    def shared(self) -> bool:
        return len(self.members) > 1


def key_for(keyring: CredentialKeyring, provider: str, credentials: Mapping[str, str]) -> str:
    """The account key of these credentials, or empty when there are none."""

    if not credentials:
        return ""
    text = provider + "\0" + "\0".join(f"{name}={credentials[name]}" for name in sorted(credentials))
    return keyring.fingerprint(text, PURPOSE)


def pace_key(account_key: str, provider: str) -> str:
    """What connectors share the pacing of: an account, or, with no credentials, the provider (limits are per address)."""

    return account_key or f"provider:{provider}"


def resolve(conn, connector_id: str) -> Account:
    """The account a connector belongs to. An unknown connector is an account of its own with no budget."""

    row = conn.execute(
        "SELECT a.* FROM supply_connectors c JOIN supply_accounts a ON a.id = c.account_id WHERE c.id = %s", (connector_id,)
    ).fetchone()
    if row is None:
        return Account(connector_id, 0, 10, quota.DEFAULT_RESET_TIME, quota.DEFAULT_RESET_TZ, (connector_id,))
    members = tuple(
        item["id"] for item in conn.execute(
            "SELECT id FROM supply_connectors WHERE account_id = %s ORDER BY created_at, id", (row["id"],)
        ).fetchall()
    )
    return Account(
        row["id"], int(row["daily_budget"]), int(row["interactive_reserve_pct"]), row["reset_time"], row["reset_tz"], members
    )


def create(conn, provider: str, account_key: str, settings: Mapping[str, Any], account_id: str | None = None) -> str:
    """The account for these credentials: the one already holding the key (whose settings stand), or a new one with ``settings``
    (its id ``account_id`` when given: a connector's own account takes the connector's id)."""

    if account_key:
        found = conn.execute(
            "SELECT id FROM supply_accounts WHERE provider = %s AND account_key = %s", (provider, account_key)
        ).fetchone()
        if found is not None:
            if conn.execute("SELECT 1 FROM supply_connectors WHERE account_id = %s LIMIT 1", (found["id"],)).fetchone() is None:
                # Left behind with no connector: it starts again as new, with these settings.
                names = [name for name in SETTINGS if name in settings]
                if names:
                    conn.execute(f"UPDATE supply_accounts SET {', '.join(f'{name} = %s' for name in names)} WHERE id = %s",
                                 (*(settings[name] for name in names), found["id"]))
            return found["id"]
    account_id = account_id or uuid.uuid4().hex
    names = [name for name in SETTINGS if name in settings]
    conn.execute(
        f"INSERT INTO supply_accounts (id, provider, account_key{''.join(', ' + name for name in names)}) "
        f"VALUES (%s, %s, %s{', %s' * len(names)})",
        (account_id, provider, account_key, *(settings[name] for name in names)),
    )
    return account_id


def rekey(conn, connector_id: str, account_key: str) -> str:
    """Put a connector on the account its new credentials belong to. Alone on its account, the account takes the key (and keeps
    its ledger); otherwise it joins the account holding the key, or leaves for a new one with the same settings. Returns the
    account's id."""

    row = conn.execute(
        "SELECT a.*, c.provider AS connector_provider FROM supply_connectors c JOIN supply_accounts a ON a.id = c.account_id WHERE c.id = %s",
        (connector_id,),
    ).fetchone()
    if row["account_key"] == account_key:
        return row["id"]
    holder = conn.execute(
        "SELECT id FROM supply_accounts WHERE provider = %s AND account_key = %s AND account_key <> ''", (row["provider"], account_key)
    ).fetchone()
    alone = conn.execute("SELECT COUNT(*) AS n FROM supply_connectors WHERE account_id = %s", (row["id"],)).fetchone()["n"] == 1
    if holder is None and alone:
        conn.execute("UPDATE supply_accounts SET account_key = %s WHERE id = %s", (account_key, row["id"]))
        return row["id"]
    target = holder["id"] if holder is not None else create(conn, row["provider"], account_key, row)
    if alone:
        _fold_ledger(conn, row["id"], target)
    # Leaving an account alone deletes it (``trg_supply_account_left``).
    conn.execute("UPDATE supply_connectors SET account_id = %s WHERE id = %s", (target, connector_id))
    return target


def _fold_ledger(conn, source: str, target: str) -> None:
    """Add one account's call ledger to another's, so calls already spent today still count after two accounts become one."""

    conn.execute(
        """
        INSERT INTO supply_quota_ledger (account_id, day, spent, interactive_spent, spare_spent, scheduled_rest, scheduled_at, spare_hour,
                                         spare_hour_spent)
        SELECT %s, day, spent, interactive_spent, spare_spent, scheduled_rest, scheduled_at, spare_hour, spare_hour_spent
        FROM supply_quota_ledger WHERE account_id = %s
        ON CONFLICT (account_id, day) DO UPDATE SET
            spent = supply_quota_ledger.spent + EXCLUDED.spent,
            interactive_spent = supply_quota_ledger.interactive_spent + EXCLUDED.interactive_spent,
            spare_spent = supply_quota_ledger.spare_spent + EXCLUDED.spare_spent,
            spare_hour_spent = supply_quota_ledger.spare_hour_spent + EXCLUDED.spare_hour_spent
        """,
        (target, source),
    )
