"""The guarded HTTP client: egress checks, error mapping, redirects, pinning.

No network. A scripted transport stands in for the wire.
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from unittest import mock

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.supply import http_client  # noqa: E402
from app.services.supply.http_client import ConnectFailed, HttpResponse, SafeHttpClient  # noqa: E402
from app.services.supply.providers.base import (  # noqa: E402
    AuthError,
    EgressBlocked,
    HostDenied,
    ProviderError,
    RateLimited,
    ResponseTooLarge,
    Unavailable,
)

PUBLIC = "93.184.216.34"


def _resolver(*addresses: str):
    return lambda host: list(addresses or (PUBLIC,))


def _response(status: int = 200, body: object = None, **headers: str) -> HttpResponse:
    payload = b"" if body is None else json.dumps(body).encode()
    return HttpResponse(status=status, headers={k.lower().replace("_", "-"): v for k, v in headers.items()}, body=payload)


class ScriptedTransport:
    def __init__(self, *steps) -> None:
        self.steps = list(steps)
        self.calls: list[dict] = []

    def send(self, *, method, target, headers, body, timeout, max_bytes):
        self.calls.append(dict(method=method, url=target.url, host=target.host,
                               addresses=target.addresses, headers=dict(headers), body=body))
        step = self.steps.pop(0)
        if isinstance(step, BaseException):
            raise step
        return step


def _client(*steps, allowed=("api.example.com",), resolve=None, **kwargs):
    transport = ScriptedTransport(*steps)
    client = SafeHttpClient(allowed, transport=transport, resolve=resolve or _resolver(), **kwargs)
    return client, transport


class LimitHeaderTests(unittest.TestCase):
    def test_only_headers_about_limits_are_kept_and_only_as_short_text(self) -> None:
        client, _ = _client(_response(
            200, {}, X_RateLimit_Remaining="49", X_RateLimit_Limit="50", Set_Cookie="session=secret", Authorization="Bearer x",
            X_Quota_Note="a" * 100,
        ))
        client.request("GET", "https://api.example.com/v1")
        self.assertEqual(client.last_limits, {"x-ratelimit-remaining": "49", "x-ratelimit-limit": "50"})

    def test_a_refusals_nonsense_values_are_left_out(self) -> None:
        client, _ = _client(_response(
            429, {}, Retry_After="-1792146696", X_RateLimit_Limit="50", X_RateLimit_Reset="-1792146696", X_RateLimit_Remaining="0",
            X_RateLimit_ResetTime="1970-01-01T00:00:00.000Z",
        ))
        seen = []
        client.on_limits = lambda found, url: seen.append((found, url))
        with self.assertRaises(RateLimited):
            client.request("GET", "https://api.example.com/notices/v3/x")
        self.assertEqual(seen, [({"x-ratelimit-limit": "50", "x-ratelimit-remaining": "0"}, "https://api.example.com/notices/v3/x")])

    def test_an_answer_with_no_limits_keeps_the_last_ones_and_a_429_still_reports_them(self) -> None:
        client, _ = _client(_response(200, {}, X_RateLimit_Remaining="3"), _response(200, {}), _response(429, {}, Retry_After="60"))
        client.request("GET", "https://api.example.com/v1")
        client.request("GET", "https://api.example.com/v1")
        self.assertEqual(client.last_limits, {"x-ratelimit-remaining": "3"})
        with self.assertRaises(RateLimited):
            client.request("GET", "https://api.example.com/v1")
        self.assertEqual(client.last_limits, {"retry-after": "60"})


class RequestShapeTests(unittest.TestCase):
    def test_get_with_params_and_default_headers(self) -> None:
        client, transport = _client(_response(200, {"ok": True}))
        result = client.request_json("GET", "https://api.example.com/v1/search", params={"q": "a b", "n": "2"})
        self.assertEqual(result, {"ok": True})
        call = transport.calls[0]
        self.assertEqual(call["url"], "https://api.example.com/v1/search?q=a+b&n=2")
        self.assertEqual(call["headers"]["Accept"], "application/json")
        self.assertTrue(call["headers"]["User-Agent"].startswith("KiCAD-Prism"))
        self.assertEqual(call["addresses"], (PUBLIC,))

    def test_params_extend_an_existing_query(self) -> None:
        client, transport = _client(_response(200, {}))
        client.request("GET", "https://api.example.com/v1?a=1", params={"b": "2"})
        self.assertEqual(transport.calls[0]["url"], "https://api.example.com/v1?a=1&b=2")

    def test_json_and_form_bodies(self) -> None:
        client, transport = _client(_response(200, {}), _response(200, {}))
        client.request("POST", "https://api.example.com/x", json={"a": 1})
        client.request("POST", "https://api.example.com/x", form={"a": "1 2"})
        self.assertEqual(json.loads(transport.calls[0]["body"]), {"a": 1})
        self.assertEqual(transport.calls[0]["headers"]["Content-Type"], "application/json")
        self.assertEqual(transport.calls[1]["body"], b"a=1+2")
        self.assertEqual(transport.calls[1]["headers"]["Content-Type"], "application/x-www-form-urlencoded")
        with self.assertRaises(ValueError):
            client.request("POST", "https://api.example.com/x", json={}, form={})

    def test_invalid_json_response(self) -> None:
        client, _ = _client(HttpResponse(200, {}, b"not json"))
        with self.assertRaises(ProviderError) as raised:
            client.request_json("GET", "https://api.example.com/x")
        self.assertEqual(type(raised.exception), ProviderError)

    def test_a_web_page_where_data_was_expected_is_a_block(self) -> None:
        from app.services.supply.providers.base import Blocked

        for response in (
            HttpResponse(200, {"content-type": "text/html; charset=utf-8"}, b"<p>hello</p>"),
            HttpResponse(200, {}, b"  <!DOCTYPE html><html>"),
            HttpResponse(403, {"content-type": "text/html"}, b"Access denied"),
            HttpResponse(429, {}, b"<html>Please verify you are human</html>"),
        ):
            client, _ = _client(response)
            with self.assertRaises(Blocked):
                client.request_json("GET", "https://api.example.com/x")

    def test_a_403_that_speaks_json_is_still_a_rejected_credential(self) -> None:
        client, _ = _client(HttpResponse(403, {"content-type": "application/json"}, b'{"error": "no"}'))
        with self.assertRaises(AuthError):
            client.request_json("GET", "https://api.example.com/x")


class ErrorMappingTests(unittest.TestCase):
    def _error(self, response_or_error, **kwargs):
        client, _ = _client(response_or_error, **kwargs)
        with self.assertRaises(ProviderError) as raised:
            client.request("GET", "https://api.example.com/v1/search", params={"apiKey": "SECRET-KEY"})
        return raised.exception

    def test_auth_failures(self) -> None:
        for status in (401, 403):
            error = self._error(_response(status))
            self.assertIsInstance(error, AuthError)
            self.assertEqual(error.code, "auth_failed")

    def test_rate_limit_reads_retry_after_and_caps_it(self) -> None:
        self.assertEqual(self._error(_response(429, retry_after="30")).retry_after_seconds, 30)
        self.assertIsNone(self._error(_response(429, retry_after="Wed, 21 Oct 2026 07:28:00 GMT")).retry_after_seconds)
        self.assertEqual(self._error(_response(429, retry_after="99999")).retry_after_seconds, 3600)
        self.assertIsNone(self._error(_response(429)).retry_after_seconds)

    def test_server_trouble_is_unavailable(self) -> None:
        for status in (408, 500, 502, 503):
            self.assertIsInstance(self._error(_response(status)), Unavailable, status)

    def test_other_client_errors_are_plain_provider_errors(self) -> None:
        for status in (400, 422):
            self.assertIs(type(self._error(_response(status))), ProviderError, status)

    def test_not_found_is_its_own_provider_error(self) -> None:
        error = self._error(_response(404))
        self.assertIsInstance(error, ProviderError)
        self.assertEqual(error.code, "not_found")

    def test_transport_failures(self) -> None:
        self.assertIsInstance(self._error(ConnectFailed("api.example.com")), Unavailable)
        self.assertIsInstance(self._error(requests.Timeout("slow")), Unavailable)
        self.assertIsInstance(self._error(requests.exceptions.ChunkedEncodingError("cut")), Unavailable)
        self.assertIsInstance(self._error(ResponseTooLarge("big")), ResponseTooLarge)

    def test_messages_never_contain_the_query_string(self) -> None:
        for step in (_response(401), _response(429), _response(503), _response(400),
                     requests.Timeout("x"), requests.exceptions.ChunkedEncodingError("x")):
            self.assertNotIn("SECRET-KEY", str(self._error(step)))
        client, _ = _client(allowed=("example.org",))
        with self.assertRaises(EgressBlocked) as raised:
            client.request("GET", "https://api.example.com/v1?apiKey=SECRET-KEY")
        self.assertNotIn("SECRET-KEY", str(raised.exception))


class EgressTests(unittest.TestCase):
    def _blocked(self, url: str, **kwargs):
        client, transport = _client(_response(200, {}), **kwargs)
        with self.assertRaises(EgressBlocked) as raised:
            client.request("GET", url)
        self.assertEqual(transport.calls, [], "the transport must never be reached")
        return raised.exception

    def test_blocks_before_sending(self) -> None:
        self.assertEqual(self._blocked("http://api.example.com/").code, "egress_denied")
        self._blocked("https://other.example.org/")
        self._blocked("https://api.example.com/", resolve=_resolver("10.0.0.5"))
        self._blocked("https://api.example.com/", resolve=_resolver(PUBLIC, "169.254.169.254"))

    def test_a_listed_private_host_may_resolve_to_a_private_network(self) -> None:
        client, transport = _client(_response(200, {}), private_hosts=("api.example.com",), resolve=_resolver("172.16.8.66"))
        client.request("GET", "https://api.example.com/api/")
        self.assertEqual(transport.calls[0]["addresses"], ("172.16.8.66",))
        self._blocked("https://api.example.com/", private_hosts=("other.example.com",), resolve=_resolver("172.16.8.66"))
        for address in ("169.254.169.254", "0.0.0.0", "224.0.0.1", "fe80::1"):
            self._blocked("https://api.example.com/", private_hosts=("api.example.com",), resolve=_resolver(address))

    def test_the_private_host_setting_is_a_comma_list(self) -> None:
        from app.core.supply_config import SupplySettings

        listed = SupplySettings(SUPPLY_INVENTORY_PRIVATE_HOSTS_STR=" Vision.Example.Internal. , ,stock.example.com")
        self.assertEqual(listed.SUPPLY_INVENTORY_PRIVATE_HOSTS, ["vision.example.internal", "stock.example.com"])

    def test_no_allowlist_means_any_public_host(self) -> None:
        client, transport = _client(_response(200, {}), allowed=None)
        client.request("GET", "https://anything.example.org/file.pdf")
        self.assertEqual(len(transport.calls), 1)


class RedirectTests(unittest.TestCase):
    def test_follows_a_relative_redirect(self) -> None:
        client, transport = _client(_response(302, location="/v2/search"), _response(200, {"ok": 1}))
        self.assertEqual(client.request_json("GET", "https://api.example.com/v1/search"), {"ok": 1})
        self.assertEqual(transport.calls[1]["url"], "https://api.example.com/v2/search")

    def test_a_denied_host_is_refused_on_the_first_address_and_on_a_redirect(self) -> None:
        denied = lambda host: host == "bad.example.org"  # noqa: E731
        client, transport = _client(_response(302, location="https://bad.example.org/f.pdf"), _response(200, {}), allowed=None, host_denied=denied)
        with self.assertRaises(HostDenied):
            client.request("GET", "https://api.example.com/x")
        self.assertEqual(len(transport.calls), 1, "the denied host is never contacted")
        client, transport = _client(_response(200, {}), allowed=None, host_denied=denied)
        with self.assertRaises(HostDenied):
            client.request("GET", "https://bad.example.org/x")
        self.assertEqual(transport.calls, [])

    def test_every_hop_is_validated(self) -> None:
        client, transport = _client(_response(302, location="https://evil.example.org/"), _response(200, {}))
        with self.assertRaises(EgressBlocked):
            client.request("GET", "https://api.example.com/x")
        self.assertEqual(len(transport.calls), 1)

        client, transport = _client(_response(302, location="https://api.example.com/y"), _response(200, {}),
                                    resolve=mock.Mock(side_effect=[[PUBLIC], ["10.0.0.9"]]))
        with self.assertRaises(EgressBlocked):
            client.request("GET", "https://api.example.com/x")
        self.assertEqual(len(transport.calls), 1)

    def test_303_and_post_302_become_get_without_a_body(self) -> None:
        for status in (303, 302):
            client, transport = _client(_response(status, location="/done"), _response(200, {}))
            client.request("POST", "https://api.example.com/x", json={"a": 1})
            second = transport.calls[1]
            self.assertEqual((second["method"], second["body"]), ("GET", None), status)
            self.assertNotIn("Content-Type", second["headers"])

    def test_307_keeps_method_and_body(self) -> None:
        client, transport = _client(_response(307, location="/again"), _response(200, {}))
        client.request("POST", "https://api.example.com/x", json={"a": 1})
        second = transport.calls[1]
        self.assertEqual(second["method"], "POST")
        self.assertEqual(json.loads(second["body"]), {"a": 1})

    def test_leaving_the_host_drops_custom_headers(self) -> None:
        client, transport = _client(
            _response(302, location="https://files.example.com/ds.pdf"), _response(200, {}),
            allowed=("api.example.com", "files.example.com"),
        )
        client.request("GET", "https://api.example.com/x", headers={"X-Api-Key": "SECRET", "Authorization": "Bearer t"})
        first, second = transport.calls
        self.assertEqual(first["headers"]["X-Api-Key"], "SECRET")
        self.assertNotIn("X-Api-Key", second["headers"])
        self.assertNotIn("Authorization", second["headers"])
        self.assertEqual(second["headers"]["Accept"], "application/json")

    def test_loops_and_missing_locations(self) -> None:
        client, transport = _client(*[_response(302, location="/loop")] * 6)
        with self.assertRaises(ProviderError) as raised:
            client.request("GET", "https://api.example.com/loop")
        self.assertIn("too many redirects", str(raised.exception))
        self.assertEqual(len(transport.calls), 4)

        client, _ = _client(_response(302))
        with self.assertRaises(ProviderError):
            client.request("GET", "https://api.example.com/x")


class _FakeResponse:
    def __init__(self, status=200, headers=None, chunks=(b"{}",)) -> None:
        self.status_code = status
        self.headers = headers or {}
        self._chunks = chunks
        self.closed = False

    def iter_content(self, _size):
        yield from self._chunks

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.closed = True


class TransportTests(unittest.TestCase):
    def _target(self, *addresses: str):
        from app.services.supply.egress import ValidatedTarget

        return ValidatedTarget("https://api.example.com/v1/x?k=1", "api.example.com", tuple(addresses))

    def test_pinned_adapter_verifies_the_original_host(self) -> None:
        adapter = http_client._PinnedAdapter("api.example.com")
        kwargs = adapter.poolmanager.connection_pool_kw
        self.assertEqual(kwargs["server_hostname"], "api.example.com")
        self.assertEqual(kwargs["assert_hostname"], "api.example.com")

    def test_connects_to_the_address_and_sends_the_host_header(self) -> None:
        seen = {}

        def fake_request(session, method, url, **kwargs):
            seen.update(method=method, url=url, **kwargs)
            return _FakeResponse(200, {"Content-Type": "application/json"})

        with mock.patch.object(requests.Session, "request", fake_request):
            response = http_client.RequestsTransport().send(
                method="GET", target=self._target(PUBLIC), headers={"Accept": "x"}, body=None,
                timeout=(1, 1), max_bytes=100)
        self.assertEqual(seen["url"], f"https://{PUBLIC}/v1/x?k=1")
        self.assertEqual(seen["headers"]["Host"], "api.example.com")
        self.assertFalse(seen["allow_redirects"])
        self.assertEqual(response.headers["content-type"], "application/json")

    def test_ipv6_addresses_are_bracketed(self) -> None:
        seen = {}

        def fake_request(session, method, url, **kwargs):
            seen["url"] = url
            return _FakeResponse()

        with mock.patch.object(requests.Session, "request", fake_request):
            http_client.RequestsTransport().send(
                method="GET", target=self._target("2606:2800:220:1::1"), headers={}, body=None,
                timeout=(1, 1), max_bytes=100)
        self.assertTrue(seen["url"].startswith("https://[2606:2800:220:1::1]/"))

    def test_tries_the_next_address_when_one_refuses(self) -> None:
        urls = []

        def fake_request(session, method, url, **kwargs):
            urls.append(url)
            if len(urls) == 1:
                raise requests.ConnectionError("refused")
            return _FakeResponse(200)

        with mock.patch.object(requests.Session, "request", fake_request):
            response = http_client.RequestsTransport().send(
                method="GET", target=self._target("93.184.216.34", "93.184.216.35"), headers={},
                body=None, timeout=(1, 1), max_bytes=100)
        self.assertEqual(response.status, 200)
        self.assertEqual(len(urls), 2)

    def test_gives_up_after_every_address_fails(self) -> None:
        with mock.patch.object(requests.Session, "request", side_effect=requests.ConnectionError("no")):
            with self.assertRaises(ConnectFailed):
                http_client.RequestsTransport().send(
                    method="GET", target=self._target(PUBLIC), headers={}, body=None,
                    timeout=(1, 1), max_bytes=100)

    def test_a_read_timeout_is_not_retried_on_another_address(self) -> None:
        calls = []

        def fake_request(session, method, url, **kwargs):
            calls.append(url)
            raise requests.ReadTimeout("slow")

        with mock.patch.object(requests.Session, "request", fake_request):
            with self.assertRaises(requests.Timeout):
                http_client.RequestsTransport().send(
                    method="GET", target=self._target(PUBLIC, "93.184.216.35"), headers={}, body=None,
                    timeout=(1, 1), max_bytes=100)
        self.assertEqual(len(calls), 1)

    def test_environment_proxies_are_ignored(self) -> None:
        trusted = []

        def fake_request(session, method, url, **kwargs):
            trusted.append(session.trust_env)
            return _FakeResponse()

        with mock.patch.object(requests.Session, "request", fake_request):
            http_client.RequestsTransport().send(
                method="GET", target=self._target(PUBLIC), headers={}, body=None,
                timeout=(1, 1), max_bytes=100)
        self.assertEqual(trusted, [False])

    def test_response_size_cap(self) -> None:
        with self.assertRaises(ResponseTooLarge):
            http_client._read_capped(_FakeResponse(headers={"content-length": "101"}), 100)
        with self.assertRaises(ResponseTooLarge):
            http_client._read_capped(_FakeResponse(chunks=(b"x" * 60, b"x" * 60)), 100)
        self.assertEqual(http_client._read_capped(_FakeResponse(chunks=(b"ab", b"cd")), 100), b"abcd")


class ProxyTests(unittest.TestCase):
    """With a proxy set, the proxy resolves names, so only the host allowlist applies."""

    class ProxiedTransport(ScriptedTransport):
        proxied = True

    def client(self, *steps, resolve=None):
        transport = self.ProxiedTransport(*steps)
        return SafeHttpClient(("api.example.com",), transport=transport, resolve=resolve or _resolver()), transport

    def test_no_address_check_is_made_and_none_is_pinned(self) -> None:
        def never(host):
            raise AssertionError("the name must not be resolved here")

        client, transport = self.client(_response(200, {"ok": True}), resolve=never)
        self.assertEqual(client.request_json("GET", "https://api.example.com/v1"), {"ok": True})
        self.assertEqual(transport.calls[0]["addresses"], ())

    def test_the_allowlist_and_the_url_rules_still_apply(self) -> None:
        client, transport = self.client()
        for url in ("https://evil.example.org/", "http://api.example.com/", "https://10.0.0.1/", "https://user@api.example.com/"):
            with self.assertRaises(EgressBlocked, msg=url):
                client.request("GET", url)
        self.assertEqual(transport.calls, [])

    def test_the_default_transport_follows_the_setting(self) -> None:
        self.assertFalse(http_client.RequestsTransport("").proxied)
        self.assertTrue(http_client.RequestsTransport("http://proxy.example.com:3128").proxied)
        with mock.patch("app.core.config.settings.SUPPLY_HTTPS_PROXY", "http://proxy.example.com:3128"):
            self.assertTrue(SafeHttpClient(("api.example.com",))._transport.proxied)
        with mock.patch("app.core.config.settings.SUPPLY_HTTPS_PROXY", ""):
            self.assertFalse(SafeHttpClient(("api.example.com",))._transport.proxied)


if __name__ == "__main__":
    unittest.main()
