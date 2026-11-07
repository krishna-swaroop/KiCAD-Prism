"""A backend that hangs must not make the agent look dead.

The failure this guards: a dev server behind Caddy, with the backend stopped. Caddy
accepted every connection and then waited, so each backend call took the full timeout.
/health made two of them, the plugin gave up on it, decided the agent was not running,
and started another. Six agents later KiCad was frozen.
"""

from __future__ import annotations

import socket
import sys
import threading
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from prism_agent import prism_client, server  # noqa: E402
from prism_agent.prism_client import PrismClient, PrismConfig  # noqa: E402


@pytest.fixture
def hanging_backend():
    """A port that accepts connections and never answers, like Caddy with nothing behind it."""
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    listener.listen(16)
    held = []
    stop = threading.Event()

    def accept():
        listener.settimeout(0.1)
        while not stop.is_set():
            try:
                conn, _ = listener.accept()
                held.append(conn)
            except OSError:
                continue

    thread = threading.Thread(target=accept, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{listener.getsockname()[1]}"
    stop.set()
    thread.join(timeout=1)
    for conn in held:
        conn.close()
    listener.close()


def test_the_client_stops_waiting_once_the_backend_has_hung(hanging_backend, monkeypatch):
    monkeypatch.setattr(prism_client, "TIMEOUT", 0.5)
    client = PrismClient(PrismConfig(base_url=hanging_backend))

    start = time.monotonic()
    assert client.health() == "down"
    first = time.monotonic() - start
    assert first >= 0.4  # the first call has to find out the slow way

    start = time.monotonic()
    assert client.health() == "down"
    assert client.find_project(".") is None
    assert client.plugin_version() is None
    assert time.monotonic() - start < 0.1  # the rest don't wait again


def test_an_http_error_is_an_answer_not_an_outage():
    """A 401 or 404 means the server is up. Treating it as down would hide a working
    backend from every other call for the next half minute."""
    import http.server

    class NotFound(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(404)
            self.end_headers()

        def log_message(self, *_args):
            pass

    httpd = http.server.HTTPServer(("127.0.0.1", 0), NotFound)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        client = PrismClient(PrismConfig(base_url=f"http://127.0.0.1:{httpd.server_port}"))
        assert client.plugin_version() is None
        assert client.known_down is False
        # The backend answered; only 401/403 mean "refused".
        assert client.health() == "up"
    finally:
        httpd.shutdown()
        httpd.server_close()


@pytest.mark.parametrize("status", [502, 503, 504])
def test_a_proxy_error_reads_as_down(status):
    """nginx answers 502/503/504 while the backend is down: that is an outage, not "up"."""
    import http.server

    class Gateway(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(status)
            self.end_headers()

        def log_message(self, *_args):
            pass

    httpd = http.server.HTTPServer(("127.0.0.1", 0), Gateway)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        client = PrismClient(PrismConfig(base_url=f"http://127.0.0.1:{httpd.server_port}"))
        assert client.health() == "down"
    finally:
        httpd.shutdown()
        httpd.server_close()


@pytest.mark.parametrize("status", [401, 403])
def test_a_rejected_token_is_refused_not_unreachable(status):
    """A revoked token is not a down server: the plugin must ask for a sign-in."""
    import http.server

    class Refusing(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(status)
            self.end_headers()

        def log_message(self, *_args):
            pass

    httpd = http.server.HTTPServer(("127.0.0.1", 0), Refusing)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        client = PrismClient(PrismConfig(base_url=f"http://127.0.0.1:{httpd.server_port}"))
        assert client.health() == "refused"
        # An answer, so it must not trigger the down-backoff window.
        assert client.known_down is False
    finally:
        httpd.shutdown()
        httpd.server_close()


def test_a_healthy_backend_is_up():
    import http.server

    class Healthy(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b"[]")

        def log_message(self, *_args):
            pass

    httpd = http.server.HTTPServer(("127.0.0.1", 0), Healthy)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        client = PrismClient(PrismConfig(base_url=f"http://127.0.0.1:{httpd.server_port}"))
        assert client.health() == "up"
    finally:
        httpd.shutdown()
        httpd.server_close()


class _SlowPrism:
    """Stands in for PrismClient with a backend that takes far too long."""

    def __init__(self, delay):
        self.delay = delay

    def health(self):
        time.sleep(self.delay)
        return "up"

    def plugin_version(self):
        return {"expected": "0.5.17"}


def _state(prism) -> server.AgentState:
    """An AgentState with only the backend-status fields.

    The real __init__ also starts a switch scheduler, which these tests don't need.
    """
    state = server.AgentState.__new__(server.AgentState)
    state.prism = prism
    state._backend_lock = threading.Lock()
    state._backend_checked = 0.0
    state._backend_checking = False
    state._backend_status = "unknown"
    state._server_plugin = None
    state._changes_lock = threading.Lock()
    state._changes_cache = {}
    return state


def test_health_answers_without_waiting_on_the_backend():
    state = _state(_SlowPrism(delay=2))

    start = time.monotonic()
    backend, plugin = state.backend_status()
    assert time.monotonic() - start < 0.1
    # Not known yet: the check is still running in the background.
    assert backend == "unknown"
    assert plugin is None


def test_the_background_check_fills_in_the_answer():
    state = _state(_SlowPrism(delay=0))

    state.backend_status()
    for _ in range(50):
        if not state._backend_checking:
            break
        time.sleep(0.02)

    assert state.backend_status() == ("up", {"expected": "0.5.17"})


def test_saving_a_new_server_is_unknown_until_it_is_checked(monkeypatch):
    """The plugin used to show "can't reach" right after Save, before trying."""
    from types import SimpleNamespace

    state = _state(_SlowPrism(delay=0))
    state.backend_status()
    for _ in range(50):
        if not state._backend_checking:
            break
        time.sleep(0.02)
    assert state.backend_status()[0] == "up"

    monkeypatch.setattr(server, "PrismClient", lambda _config: _SlowPrism(delay=0))
    state.rebuild_client(
        SimpleNamespace(server_url="http://example.test", api_token="new")
    )
    assert state.backend_status()[0] == "unknown"

    for _ in range(50):
        if not state._backend_checking:
            break
        time.sleep(0.02)
    assert state.backend_status()[0] == "up"


def test_a_second_agent_cannot_share_the_first_ones_port():
    """On Windows, SO_REUSEADDR let six agents listen on one port at once."""

    class Handler(server._Handler):
        pass

    first = server._AgentServer(("127.0.0.1", 0), Handler)
    try:
        port = first.server_address[1]
        with pytest.raises(OSError):
            server._AgentServer(("127.0.0.1", port), Handler)
    finally:
        first.server_close()
