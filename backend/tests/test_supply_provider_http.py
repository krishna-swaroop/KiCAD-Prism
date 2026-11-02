"""The base every web-API adapter shares: counted, paced requests, and one new token when the service refuses the one it had."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.supply.providers.base import AuthError, ProviderConfig, calls_made  # noqa: E402
from app.services.supply.providers.http import ClientCredentials, HttpProvider  # noqa: E402

TOKEN_URL = "https://auth.example.com/token"
API_URL = "https://api.example.com/items"


class Client:
    """Answers each address from a queue; an exception in the queue is raised."""

    def __init__(self, answers: dict[str, list]) -> None:
        self.answers = {url: list(items) for url, items in answers.items()}
        self.asked: list[tuple[str, dict]] = []
        self.on_limits = None

    def request_json(self, method, url, **kwargs):
        self.asked.append((url, kwargs))
        answer = self.answers[url].pop(0)
        if isinstance(answer, BaseException):
            raise answer
        return answer


class Provider(HttpProvider):
    def __init__(self, client: Client, *, missing: str = "", config: ProviderConfig | None = None) -> None:
        super().__init__(config or ProviderConfig(connector_id="c1", account="test-http"), hosts=("api.example.com",), pace_seconds=0, client=client,
                         monotonic=lambda: 0.0, sleep=lambda _s: None)
        self.token = ClientCredentials(TOKEN_URL, form={"client_id": "id"}, missing=missing, label="Example")

    def item(self):
        return self.authorised(self.token, "GET", API_URL, lambda token: {"Authorization": f"Bearer {token}"})


def token(value: str) -> dict:
    return {"access_token": value, "expires_in": 3600}


class HttpProviderTests(unittest.TestCase):
    def test_every_request_is_counted_the_token_too(self) -> None:
        provider = Provider(Client({TOKEN_URL: [token("t1")], API_URL: [{"ok": 1}, {"ok": 2}]}))
        self.assertEqual((provider.item(), provider.item()), ({"ok": 1}, {"ok": 2}))
        self.assertEqual(calls_made(provider), 3, "one token, kept, and two requests")

    def test_a_refused_request_gets_one_new_token_and_then_the_refusal_stands(self) -> None:
        client = Client({TOKEN_URL: [token("t1"), token("t2")], API_URL: [AuthError("expired"), {"ok": 1}]})
        provider = Provider(client)
        self.assertEqual(provider.item(), {"ok": 1})
        self.assertEqual([kwargs.get("headers", {}).get("Authorization") for url, kwargs in client.asked if url == API_URL], ["Bearer t1", "Bearer t2"])
        self.assertEqual(provider.calls, 4, "both tokens and both requests are calls")
        refused = Provider(Client({TOKEN_URL: [token("t1"), token("t2")], API_URL: [AuthError("no"), AuthError("still no")]}))
        with self.assertRaises(AuthError):
            refused.item()

    def test_a_token_the_service_does_not_issue_is_not_asked_again(self) -> None:
        client = Client({TOKEN_URL: [{"token_type": "Bearer"}]})
        with self.assertRaises(AuthError):
            Provider(client).item()
        self.assertEqual(len(client.asked), 1)

    def test_missing_credentials_fail_before_any_call(self) -> None:
        client = Client({})
        with self.assertRaises(AuthError):
            Provider(client, missing="Example needs a client ID").item()
        self.assertEqual(client.asked, [])

    def test_prism_hands_the_limits_callback_in_with_the_configuration(self) -> None:
        def note(found, url):
            return None

        client = Client({})
        Provider(client, config=ProviderConfig(connector_id="c1", account="test-http", on_limits=note))
        self.assertIs(client.on_limits, note)


if __name__ == "__main__":
    unittest.main()
