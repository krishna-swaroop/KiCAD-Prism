"""Uploading and clearing a connector's offers file. An upload is a push that replaces every row (``push.push_offers``)."""

from __future__ import annotations

import logging
from datetime import datetime
from urllib.parse import urlsplit

from app.services.supply import jlc_catalogue, push
from app.services.supply.audit import actor_text, write_audit
from app.services.supply.connectors import ConnectorError, ConnectorService
from app.services.supply.csv_format import ParsedCsv, parse_offers_csv
from app.services.supply.csv_offers import CsvImportInfo, CsvOfferStore
from app.services.supply.http_client import SafeHttpClient
from app.services.supply.providers import registry
from app.services.supply.push import read_again
from app.services.supply.store import SupplyStore, supply_store


class CsvRejected(ValueError):
    """The file was not imported. ``parsed`` carries the errors to show."""

    def __init__(self, parsed: ParsedCsv) -> None:
        super().__init__(f"{parsed.error_count} problem(s) found in the file")
        self.parsed = parsed


class CsvImportService:
    def __init__(
        self,
        connectors: ConnectorService,
        store: SupplyStore = supply_store,
        offers: CsvOfferStore | None = None,
    ) -> None:
        self._connectors = connectors
        self._store = store
        self._offers = offers or CsvOfferStore()

    def import_file(
        self, connector_id: str, content: bytes, *, actor: str, filename: str = ""
    ) -> tuple[CsvImportInfo, ParsedCsv]:
        """Parse and replace the connector's offers. All or nothing."""

        actor = actor_text(actor)
        connector = self._require_csv_connector(connector_id)
        parsed = parse_offers_csv(content, default_currency=connector["currency"])
        if parsed.error_count:
            raise CsvRejected(parsed)
        pushed = push.push_offers(self._store, self._connectors, connector_id, parsed.rows, actor=actor, replace=True, filename=filename)
        return pushed["info"], parsed

    def clear(self, connector_id: str, *, actor: str) -> None:
        actor = actor_text(actor)
        self._require_csv_connector(connector_id)
        with self._store.connection() as conn:
            self._offers.clear(conn, connector_id)
            read_again(conn, connector_id)
            write_audit(conn, actor, "connector.csv_clear", connector_id, {})

    def _require_csv_connector(self, connector_id: str) -> dict:
        connector = self._connectors.get(connector_id)
        try:
            csv_fed = registry.get_spec(connector["provider"]).csv_fed
        except registry.UnknownProvider:
            csv_fed = False  # a plugin was removed; its connector cannot be fed a file
        if not csv_fed:
            raise ConnectorError("not_csv", "Only a CSV-fed connector takes an offers file.")
        return connector


def _fetcher(base: str) -> jlc_catalogue.Fetch:
    client = SafeHttpClient((urlsplit(base).hostname or "",), max_bytes=jlc_catalogue.MAX_BYTES)
    return lambda name: client.request("GET", base + name, headers={"Accept": "*/*"}).body


def refresh_catalogues(conn, now: datetime, *, fetch_for=_fetcher) -> int:
    """Import the catalogue of every enabled connector that reads one and is due (``jlc_catalogue.EVERY``), committing each.
    A failure is recorded on the connector and leaves its offers as they were. Returns how many were imported."""

    done = 0
    for row in conn.execute(
        "SELECT c.id, c.provider, i.imported_at FROM supply_connectors c LEFT JOIN supply_csv_imports i ON i.connector_id = c.id "
        "WHERE c.catalogue AND c.enabled ORDER BY c.id"
    ).fetchall():
        try:
            base = registry.get_spec(row["provider"]).catalogue_url
        except registry.UnknownProvider:
            continue
        if not base or not jlc_catalogue.due(row["imported_at"], now):
            continue
        try:
            wanted = {r["match_key"] for r in conn.execute("SELECT DISTINCT match_key FROM supply_parts WHERE match_key <> ''").fetchall()}
            created, rows = jlc_catalogue.read(fetch_for(base), wanted)
        except Exception:  # noqa: BLE001 - the card shows it; the old offers stand
            logging.getLogger(__name__).info("Catalogue not read for %s", row["id"], exc_info=True)
            conn.execute("UPDATE supply_connectors SET last_error_code = 'catalogue', last_error_at = %s WHERE id = %s", (now, row["id"]))
            conn.commit()
            continue
        CsvOfferStore().replace_all(conn, row["id"], rows, filename=f"jlcparts {created}"[:200], actor="system")
        # On the caller's clock, which ``due`` compares it with.
        conn.execute("UPDATE supply_csv_imports SET imported_at = %s WHERE connector_id = %s", (now, row["id"]))
        conn.execute("UPDATE supply_csv_offers SET fetched_at = %s WHERE connector_id = %s", (now, row["id"]))
        conn.execute("UPDATE supply_connectors SET last_ok_at = %s, last_error_code = '' WHERE id = %s", (now, row["id"]))
        conn.execute("DELETE FROM supply_discovery_runs WHERE connector_id = %s", (row["id"],))
        read_again(conn, row["id"], now)
        write_audit(conn, "system", "connector.catalogue_import", row["id"], {"rows": len(rows), "built": created})
        conn.commit()
        done += 1
    return done
