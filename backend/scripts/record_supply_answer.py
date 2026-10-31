"""Record what a distributor really answers, for use as a test fixture.

Run it in the dev environment, where the connector's credentials can be unsealed:

    cd backend
    python scripts/record_supply_answer.py --provider digikey --mpn LM358DR

It builds the connector's adapter, looks the part number up, reads the offers of the first
matches, and with ``--details`` also the reads that run weekly (Mouser's substance list through API
version 2, DigiKey's change notices when someone is signed in), then writes every JSON answer it saw to ``tests/fixtures/supply/<provider>_live_<mpn>.json``.
Token answers are replaced, query strings and headers are never kept, and the file is refused if any
credential value or token turns up in it. Read the file before committing it.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import supply_connectors  # noqa: E402
from app.services.supply import http_client  # noqa: E402

FIXTURES = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "supply"
SAFE_PARAMS = {"term", "storeInfo.id", "resultsSettings.responseGroup", "resultsSettings.offset", "resultsSettings.numberOfResults", "productCode", "country", "language"}
MAX_OFFERS = 3


def _scrub(path: str, answer):
    if "token" in path.lower() or "oauth" in path.lower():
        return {"redacted": "token answer"}
    return answer


def _secrets_in(provider) -> list[str]:
    found = []
    for name, value in vars(provider).items():
        if isinstance(value, str) and len(value) >= 6 and re.search(r"key|secret|token|password|id", name, re.I):
            found.append(value)
    # Whatever the connector was given, however the adapter names it.
    given = getattr(getattr(provider, "_config", None), "credentials", None)
    if isinstance(given, dict):
        found.extend(value for value in given.values() if isinstance(value, str) and len(value) >= 6)
    return found


def _details(connectors, connector_id, provider, match) -> None:
    from app.services.supply import oauth

    if hasattr(provider, "substances"):
        found = provider.substances(match.sku, match.manufacturer)
        print(f"Substances: stated={found.stated}, entries={list(found.entries)}")
    if hasattr(provider, "change_notices"):
        try:
            token = oauth.access_token(connectors, connector_id)
        except oauth.NotSignedIn as exc:
            print(f"Change notices skipped: not signed in ({exc}).")
            return
        notices = provider.change_notices(match.sku, token)
        print(f"Change notices: {len(notices)}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--provider", required=True, help="provider key, such as digikey or farnell")
    parser.add_argument("--mpn", required=True)
    parser.add_argument("--manufacturer", default=None)
    parser.add_argument("--details", action="store_true", help="also record substances (Mouser) or change notices (DigiKey)")
    args = parser.parse_args()

    connectors = supply_connectors.service
    rows = [row for row in connectors.list() if row["provider"] == args.provider and row["enabled"]]
    if not rows:
        print(f"No enabled {args.provider} connector.", file=sys.stderr)
        return 1
    connector_id = rows[0]["id"]

    calls: list[dict] = []
    original = http_client.SafeHttpClient.request_json

    def recording(self, method, url, **kwargs):
        answer = original(self, method, url, **kwargs)
        path = urlsplit(url).path
        params = {key: value for key, value in (kwargs.get("params") or {}).items() if key in SAFE_PARAMS}
        calls.append({"method": method, "path": path, "params": params, "answer": _scrub(path, answer)})
        return answer

    http_client.SafeHttpClient.request_json = recording
    try:
        provider = connectors.load_provider(connector_id)
        matches = provider.lookup_mpn(args.mpn, args.manufacturer)
        if matches:
            provider.get_offers([match.sku for match in matches[:MAX_OFFERS]])
            provider.get_part_data(matches[0])
            if args.details:
                _details(connectors, connector_id, provider, matches[0])
    finally:
        http_client.SafeHttpClient.request_json = original

    text = json.dumps({"provider": args.provider, "mpn": args.mpn, "calls": calls}, indent=2, ensure_ascii=False)
    leaked = [secret for secret in _secrets_in(provider) if secret in text]
    if leaked or "access_token" in text or "Bearer " in text:
        print("Refusing to write: the answers contain a credential or token.", file=sys.stderr)
        return 2
    FIXTURES.mkdir(parents=True, exist_ok=True)
    target = FIXTURES / f"{args.provider}_live_{re.sub(r'[^A-Za-z0-9]+', '_', args.mpn).lower()}.json"
    target.write_text(text, encoding="utf-8")
    print(f"Wrote {target} ({len(calls)} calls, {len(matches)} matches). Read it before committing.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
