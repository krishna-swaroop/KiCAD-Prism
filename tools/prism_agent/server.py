"""The agent's local HTTP API, what the KiCad plugin (or curl) talks to.

Binds an ephemeral port on 127.0.0.1 only. Every route except /health requires the
shared token (see discovery.py for why that matters on loopback).

Endpoints
    GET  /health                     -> {ok, version, backend_reachable}
    GET  /project?path=<path>        -> {project, git, prism}   (the one the UI needs)
    GET  /changes?path=<path>        -> {changes: [...]}        uncommitted, item-level
    GET  /settings                   -> {settings, identity, protocol}
    GET  /library                    -> is Prism KiCad's remote symbol provider, and
                                        does it point at the server we're configured for?
    GET  /locate?id=<id>             -> where this machine keeps a project, by marker or git origin
    GET  /branches?path=<path>       -> local + remote branches, for a switch picker
    GET  /checkout?path=&ref=        -> could we check this ref out, and if not, why not
    GET  /stash?path=<path>          -> what the user has set aside
    PUT  /settings {..}              -> updates and re-points the backend client
    POST /signin {label?}            -> browser loopback sign-in; saves the token
    POST /signout                    -> clears the token, revokes it server-side
    POST /open-in-prism {project_id} -> opens the web app in the browser
    POST /checkout {path, ref, stash_message?}
                                     -> move the working tree to a commit/branch/tag
    POST /pull {path, stash_message?}
                                     -> fetch and FAST-FORWARD (never merge; see checkout)
    POST /commit {path, message, paths?, allow_detached?, stage_all_design?}
                                     -> commit staged (or paths / all-design); guards as above
    POST /stage {path, paths?|all}   -> stage files (all = design only, never churn)
    POST /unstage {path, paths?|all} -> unstage files, back to the working tree
    POST /branch {path, name, switch?}
                                     -> create a branch at HEAD (the detached-HEAD remedy)
    POST /switch {path, ref}         -> check out ref (the user closed the editors)
    POST /switch/schedule {path, ref, project_dir, kicad_pid}
                                     -> after that pid exits, check out ref and reopen
    POST /switch/cancel              -> drop a pending deferred switch
    GET  /switch/pending             -> the pending deferred switch, if any
    POST /fetch {path}               -> update tracking refs; report ahead/behind
    POST /push {path, set_upstream?} -> push current branch; NEVER forces (refuse+explain)
    POST /stash {path, message}      -> stash uncommitted changes
    POST /stash {path, restore:true} -> restore a stash
    POST /discard {path}             -> discard uncommitted changes (unrecoverable)
    POST /quit                       -> stops the agent
    POST /restart                    -> stops, then relaunches the agent

The write routes refuse rather than warn when they would destroy uncommitted work: a
commit is recoverable from git, an unsaved board edit is not. See checkout.py.

`stash_message` is how a caller says "set my changes aside first". Omitting it entirely
means uncommitted changes are still a refusal: stashing MOVES the user's work, and that
needs an explicit yes rather than a default.

/quit exists so the API, not the tray icon, is the agent's control surface. On a
desktop with no usable tray (Wayland without an appindicator, SSH, headless) there
would otherwise be no way to stop it, which is exactly the situation that turns a
missing icon into an orphaned process.

Kept to the stdlib's http.server: this handles a handful of requests from one
local client, so a framework would be dead weight and another thing to install.
"""

from __future__ import annotations

import json
import logging
import secrets
import socket
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse

from . import (
    autostart,
    checkout,
    discovery,
    gitignore,
    identity,
    protocol,
    remote_library,
    settings as settings_store,
    signin,
)
from .prism_client import PrismClient, PrismConfig
from .projects import git_status, identify_project
from .version import PLUGIN_MIN, VERSION
from .worktree_diff import uncommitted_changes

# How old /health's view of the backend may get before it checks again.
BACKEND_RECHECK_SECONDS = 15

log = logging.getLogger(__name__)


class AgentState:
    """What the request handlers need. Passed in rather than global."""

    def __init__(self, prism: PrismClient):
        self.prism = prism
        self.token = secrets.token_urlsafe(32)
        # Deferred branch switches: wait for a pid to exit, then check out and reopen.
        # NOT what the plugin's switch button uses any more, see POST /switch: the
        # editors turned out to be DLLs inside kicad.exe rather than processes, so
        # there was never an editor pid to wait on, and closing the board is enough.
        #
        # Kept because waiting on a process is a real capability and the only thing
        # that was wrong with it was the UI built on top. The routes below are its
        # surface; nothing ships that calls them today.
        from . import switch_scheduler
        from .__main__ import spawn_notify

        self.switch = switch_scheduler.SwitchScheduler(notify=spawn_notify)
        # A switch scheduled before a restart is still owed.
        self.switch.resume()
        # Set by the entry point. Lets /quit stop the agent, so the tray icon is a
        # convenience rather than the only way out.
        self.request_stop = None
        self.request_restart = None
        # Diffing a big board takes a second or two, and reopening the dialog
        # shouldn't re-parse a board that hasn't changed. Keyed on the mtimes of
        # the files git says are dirty, so any edit invalidates it by itself.
        self._changes_cache: dict[tuple, list[dict]] = {}
        self._changes_lock = threading.Lock()
        # What /health reports about the backend: whether it answered, and the plugin
        # version it expects. Checked in the background, see backend_status.
        self._backend_lock = threading.Lock()
        self._backend_checked = 0.0
        self._backend_checking = False
        self._backend_reachable = False
        # Kept once known: a release doesn't change under a running agent.
        self._server_plugin: dict | None = None

    def backend_status(self) -> tuple[bool, dict | None]:
        """Whether the backend answered, and the plugin version it expects.

        Never waits on the backend. /health is how the plugin tells whether the agent
        is alive, so it has to answer at once: when it waited, a hung backend made a
        healthy agent look dead, and the plugin started another one. This returns the
        last check and starts a new one in the background when that is stale.

        The plugin version is None for both an unreachable backend and one too old to
        have the endpoint. Either way the plugin should carry on rather than refuse to
        work.
        """
        with self._backend_lock:
            stale = time.monotonic() - self._backend_checked > BACKEND_RECHECK_SECONDS
            if stale and not self._backend_checking:
                self._backend_checking = True
                threading.Thread(
                    target=self._check_backend, name="prism-backend-check", daemon=True
                ).start()
            return self._backend_reachable, self._server_plugin

    def _check_backend(self) -> None:
        prism = self.prism
        try:
            reachable = prism.health()
            plugin = self._server_plugin or prism.plugin_version()
        finally:
            with self._backend_lock:
                self._backend_checking = False
                # A check against a client rebuild_client has since replaced describes
                # the old server. Drop it; the next /health starts a fresh one.
                if prism is self.prism:
                    self._backend_checked = time.monotonic()
                    self._backend_reachable = reachable
                    self._server_plugin = plugin

    def rebuild_client(self, saved) -> None:
        """Re-point at the backend after the URL or token changed.

        Without this a new server URL wouldn't take effect until the agent
        restarted, which is a confusing thing to hand a user who just pressed Save.
        """
        self.prism = PrismClient(
            PrismConfig(base_url=saved.server_url, token=saved.api_token)
        )
        # A different server means different projects, so the cached diff answers
        # (which carry the Prism project row) are no longer trustworthy. It may also
        # expect a different plugin version, and be up when the old one was down.
        with self._backend_lock:
            self._server_plugin = None
            self._backend_checked = 0.0
            self._backend_reachable = False
        with self._changes_lock:
            self._changes_cache = {}

    def changes(self, repo_root: str, scope: str) -> list[dict]:
        key = _worktree_fingerprint(repo_root, scope)
        with self._changes_lock:
            hit = self._changes_cache.get(key)
            if hit is not None:
                return hit

        result = uncommitted_changes(repo_root, scope)

        with self._changes_lock:
            # One project's worth of state is all we need; a stale key just means
            # the next call recomputes.
            self._changes_cache = {key: result}
        return result


def _worktree_fingerprint(repo_root: str, scope: str) -> tuple:
    """A key that changes whenever the working tree does.

    git status is cheap (milliseconds); parsing boards is not. So we let git tell
    us *which* files are dirty and stat those, rather than caching on a timer and
    showing the user stale changes.
    """
    from .projects import _run_git

    try:
        status = _run_git(Path(repo_root), "status", "--porcelain", strip=False)
    except Exception:
        return (repo_root, scope, None)

    stamps = []
    for line in status.splitlines():
        rel = line[3:].strip().strip('"')
        if " -> " in rel:
            rel = rel.split(" -> ", 1)[1]
        try:
            stamps.append((rel, (Path(repo_root) / rel).stat().st_mtime_ns))
        except OSError:
            stamps.append((rel, None))  # deleted; its absence is the signal
    return (repo_root, scope, tuple(stamps))


class _Handler(BaseHTTPRequestHandler):
    state: AgentState  # injected by make_server

    # -- helpers ----------------------------------------------------------

    def _send(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _allowed_origin(self) -> str:
        """The Prism web app's origin, if that is who is asking.

        Scoped to the configured server, never `*`. The agent can run git and touch the
        filesystem, and `discovery.py` names the threat precisely: a web page's
        JavaScript reaching 127.0.0.1. Opening this to every origin would hand that
        capability to any tab the user has open.
        """
        origin = self.headers.get("Origin", "")
        if not origin:
            return ""
        try:
            configured = settings_store.load().server_url or ""
        except Exception:
            return ""
        if not configured:
            return ""
        want = urlparse(configured)
        got = urlparse(origin)
        if want.scheme == got.scheme and want.netloc == got.netloc:
            return origin
        return ""

    def _cors_headers(self) -> None:
        allowed = self._allowed_origin()
        if not allowed:
            return
        self.send_header("Access-Control-Allow-Origin", allowed)
        # Every custom header the page sends must be listed. A missing one still
        # returns a valid preflight, so nothing looks wrong from the agent's side, but
        # the browser silently refuses to send the request.
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        # Without this a shared cache could hand one origin's response to another.
        self.send_header("Vary", "Origin")

    def do_OPTIONS(self):  # noqa: N802 - stdlib naming
        """CORS preflight. Only /kicad-signin is reachable from a browser."""
        self.send_response(204)
        self._cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _authorised(self) -> bool:
        header = self.headers.get("Authorization", "")
        token = header[7:] if header.startswith("Bearer ") else ""
        # Constant-time compare: the token guards git + filesystem access.
        return secrets.compare_digest(token, self.state.token)

    def log_message(self, fmt, *args):  # noqa: A003 - silence stdlib access logging
        pass

    def handle_one_request(self):
        """Never let a bug in one route take the agent down.

        socketserver logs the traceback and closes the socket, so the client sees
        `RemoteDisconnected: remote end closed connection without response`, a
        baffling error that says nothing about the actual fault. Worse, the agent
        can end up dead with its discovery file still on disk, so the plugin
        cheerfully connects to a port nobody is listening on.

        A single failing request should be a 500 with a real message, not a
        casualty list. (This exact scenario is why: an AttributeError in /changes
        killed the agent on every plugin launch.)
        """
        try:
            super().handle_one_request()
        except Exception:
            log.exception("unhandled error serving %s", getattr(self, "path", "?"))
            try:
                self._send(500, {"error": "the agent hit an internal error"})
            except Exception:  # noqa: S110 - the socket is probably already gone
                pass

    # -- routes -----------------------------------------------------------

    def do_GET(self):  # noqa: N802 - stdlib naming
        route = urlparse(self.path)
        query = parse_qs(route.query)

        if route.path == "/health":
            reachable, server_plugin = self.state.backend_status()
            self._send(
                200,
                {
                    "ok": True,
                    "version": VERSION,
                    # The oldest plugin this agent can serve. The plugin checks our
                    # version against ITS minimum; this is the other direction, so a
                    # mismatch is caught whichever side is the stale one. Autostart
                    # means an old agent routinely meets a new plugin after an
                    # update, and a stale plugin can meet a new agent too.
                    "plugin_min": PLUGIN_MIN,
                    "backend_reachable": reachable,
                    # What the SERVER expects of the plugin. The plugin follows the
                    # server it talks to, so this is what stops the two drifting.
                    "server_plugin": server_plugin,
                },
            )
            return

        # Everything past here needs the agent token, which the browser is never given.
        if not self._authorised():
            self._send(401, {"error": "unauthorised"})
            return

        if route.path == "/project":
            path = (query.get("path") or [""])[0]
            if not path:
                self._send(400, {"error": "path is required"})
                return
            self._send(200, self._project_payload(path))
            return

        if route.path == "/changes":
            path = (query.get("path") or [""])[0]
            if not path:
                self._send(400, {"error": "path is required"})
                return
            self._send(200, self._changes_payload(path))
            return

        if route.path == "/settings":
            self._send(200, self._settings_payload())
            return

        if route.path == "/library":
            server = settings_store.load().server_url
            self._send(200, remote_library.status(server))
            return

        if route.path == "/locate":
            # "Do I have this project, and where?" Answered from the `.prism.json`
            # markers under the user's projects roots, so it does not care where the
            # server keeps its own copy. This is what prism://open/<id> will use.
            project_id = (query.get("id") or [""])[0]
            if not project_id:
                self._send(400, {"error": "id is required"})
                return
            self._send(200, self._locate_payload(project_id))
            return

        if route.path == "/branches":
            # Local and remote branches for a switch picker. Read-only.
            path = (query.get("path") or [""])[0]
            if not path:
                self._send(400, {"error": "path is required"})
                return
            self._send(200, checkout.list_branches(path))
            return

        if route.path == "/remotes":
            # Where this repo could push. Read-only, and only interesting when there is
            # more than one: that is the case where publishing has to ask rather than
            # assume origin.
            path = (query.get("path") or [""])[0]
            if not path:
                self._send(400, {"error": "path is required"})
                return
            self._send(200, {"remotes": checkout.remotes(path)})
            return

        if route.path == "/switch/pending":
            # The pending deferred switch, if any. See AgentState for why this is not
            # on the plugin's switch path any more.
            self._send(200, {"pending": self.state.switch.pending()})
            return

        if route.path == "/checkout":
            # Could we check this ref out, and if not, why not? Read-only, so a refusal
            # is explained BEFORE the user commits to the action rather than after.
            path = (query.get("path") or [""])[0]
            if not path:
                self._send(400, {"error": "path is required"})
                return
            try:
                self._send(200, checkout.status(path, (query.get("ref") or [""])[0]))
            except checkout.CheckoutError as exc:
                self._send(400, {"error": str(exc)})
            return

        if route.path == "/stash":
            # What is currently stashed. Includes stashes made by hand in a terminal:
            # they are still the user's work, and hiding them from a list of "your
            # stashed changes" is a good way to let someone destroy them.
            path = (query.get("path") or [""])[0]
            if not path:
                self._send(400, {"error": "path is required"})
                return
            self._send(200, {"stashes": checkout.stashes(path)})
            return

        self._send(404, {"error": "not found"})

    def do_POST(self):  # noqa: N802
        route = urlparse(self.path)

        # Everything needs the agent token, which the browser is never given, except
        # /kicad-signin. That is reachable from the Prism page, and it is the one route
        # that hands the agent's own token to a browser: see _kicad_signin for why the
        # CORS origin check is load-bearing there rather than a convenience.
        if route.path != "/kicad-signin" and not self._authorised():
            self._send(401, {"error": "unauthorised"})
            return

        length = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            self._send(400, {"error": "invalid json"})
            return

        if route.path == "/open-in-prism":
            project_id = body.get("project_id")
            if not project_id:
                self._send(400, {"error": "project_id is required"})
                return
            # The URL is built here, not in the plugin: project_url is the one place
            # that knows the web app's route, and hand-rolling it elsewhere is how it
            # drifted to the wrong (pluralised) path before.
            url = self.state.prism.project_url(project_id)
            commit = body.get("commit")
            if commit:
                # Select the commit in the History section, exactly as the web app's own
                # "view commit" does (section=history + commit=<sha>). An earlier ?history=
                # was neither param the page reads, so it silently landed on the default
                # section instead of selecting the commit.
                sha = quote(str(commit))
                url += "?section=history&commit=%s" % sha
                # And the branch it is on. Without it the page lists the checkout's
                # current branch, so a commit from anywhere else was selected in a
                # history that does not contain it: the highlight landed on nothing
                # and the user saw the wrong list of commits around it.
                branch = body.get("branch")
                if branch:
                    url += "&branch=%s" % quote(str(branch))
            webbrowser.open(url)
            self._send(200, {"ok": True})
            return

        if route.path == "/signin":
            self._send(*self._sign_in(body))
            return

        if route.path == "/signin/cancel":
            # The plugin calls this when the user gives up (closed the tab, pressed
            # Cancel), so the pending /signin stops waiting instead of holding the
            # loopback listener until it times out.
            cancelled = signin.cancel_pending_sign_in()
            self._send(200, {"ok": True, "cancelled": cancelled})
            return

        if route.path == "/signout":
            self._send(200, self._sign_out())
            return

        if route.path == "/library":
            server = settings_store.load().server_url
            try:
                if body.get("remove"):
                    result = remote_library.unlink(server)
                else:
                    result = remote_library.link(server)
            except remote_library.RemoteLibraryError as exc:
                self._send(400, {"error": str(exc)})
                return
            self._send(200, {"ok": True, **result})
            return

        if route.path == "/checkout":
            # Move the working tree to a commit, branch or tag. The guards are
            # re-checked inside, immediately before acting: the user may have saved a
            # board in KiCad since the UI last looked, and a stale "it was clean" is
            # exactly how uncommitted work gets destroyed.
            #
            # `stash_message` present (even empty) means "put my changes aside first".
            # Absent means uncommitted changes are still a refusal. The distinction is
            # consent: moving someone's work needs an explicit yes.
            path = body.get("path") or ""
            ref = body.get("ref") or ""
            if not path or not ref:
                self._send(400, {"error": "path and ref are required"})
                return
            try:
                self._send(200, checkout.checkout(path, ref, body.get("stash_message")))
            except checkout.CheckoutError as exc:
                self._send(400, {"error": str(exc)})
            return

        if route.path == "/pull":
            # Fetch and fast-forward. NEVER a merge: a .kicad_pcb cannot be merged
            # textually, and git would happily produce a board neither author drew.
            path = body.get("path") or ""
            if not path:
                self._send(400, {"error": "path is required"})
                return
            try:
                self._send(200, checkout.pull(path, body.get("stash_message")))
            except checkout.CheckoutError as exc:
                self._send(400, {"error": str(exc)})
            return

        if route.path == "/commit":
            # Stage and commit. Refuses an empty message, and refuses a detached HEAD
            # unless the caller has offered "create a branch here" and set the flag, so a
            # commit the user would lose on the next checkout is never made silently.
            path = body.get("path") or ""
            message = body.get("message") or ""
            if not path:
                self._send(400, {"error": "path is required"})
                return
            try:
                self._send(
                    200,
                    checkout.commit(
                        path,
                        message,
                        paths=body.get("paths"),
                        allow_detached=bool(body.get("allow_detached")),
                        stage_all_design=bool(body.get("stage_all_design")),
                    ),
                )
            except checkout.CheckoutError as exc:
                self._send(400, {"error": str(exc)})
            return

        if route.path == "/stage":
            # Stage files for commit. `all` stages every non-noise design change (never
            # KiCad's churn); otherwise `paths` names exactly what to stage.
            path = body.get("path") or ""
            if not path:
                self._send(400, {"error": "path is required"})
                return
            try:
                if body.get("all"):
                    self._send(200, checkout.stage_all(path))
                else:
                    self._send(200, checkout.stage(path, body.get("paths") or []))
            except checkout.CheckoutError as exc:
                self._send(400, {"error": str(exc)})
            return

        if route.path == "/unstage":
            # Unstage files, back to the working tree, untouched. `all` unstages
            # everything; otherwise `paths` names what to unstage.
            path = body.get("path") or ""
            if not path:
                self._send(400, {"error": "path is required"})
                return
            try:
                if body.get("all"):
                    self._send(200, checkout.unstage_all(path))
                else:
                    self._send(200, checkout.unstage(path, body.get("paths") or []))
            except checkout.CheckoutError as exc:
                self._send(400, {"error": str(exc)})
            return

        if route.path == "/switch/schedule":
            # Defer a checkout until `kicad_pid` exits, then check out and reopen.
            #
            # No longer the plugin's switch path (POST /switch is), and nothing shipping
            # calls this: the editors are DLLs inside kicad.exe, so waiting on a pid
            # meant waiting for ALL of KiCad. Kept because the machinery is sound and
            # "do this once that process is gone" is worth having.
            path = body.get("path") or ""
            ref = body.get("ref") or ""
            project_dir = body.get("project_dir") or ""
            kicad_pid = body.get("kicad_pid")
            if not path or not ref or not project_dir or not kicad_pid:
                self._send(
                    400,
                    {"error": "path, ref, project_dir and kicad_pid are required"},
                )
                return
            try:
                self._send(
                    200,
                    self.state.switch.schedule(
                        repo=path,
                        ref=ref,
                        project_dir=project_dir,
                        kicad_pid=int(kicad_pid),
                        resolution=body.get("resolution") or "",
                    ),
                )
            except checkout.CheckoutError as exc:
                self._send(400, {"error": str(exc)})
            return

        if route.path == "/switch/cancel":
            self._send(200, self.state.switch.cancel())
            return

        if route.path == "/switch":
            # Check out now. KiCad may still be running: what matters is that the
            # BOARD is closed, not KiCad, because the hazard was only ever KiCad's
            # in-memory copy being written back on save. The editors are DLLs inside
            # kicad.exe (_pcbnew.dll, _eeschema.dll), so there is no editor process to
            # wait on, and closing the board is what releases that copy.
            #
            # The caller confirms the editors are closed before calling. Nothing is
            # reopened: the user does that from KiCad's project manager, which is
            # faster than the restart this used to require.
            path = body.get("path") or ""
            ref = body.get("ref") or ""
            if not path or not ref:
                self._send(400, {"error": "path and ref are required"})
                return
            try:
                self._send(200, checkout.checkout(path, ref))
            except checkout.CheckoutError as exc:
                self._send(400, {"error": str(exc)})
            return

        if route.path == "/branch":
            # Create a branch at HEAD (and switch to it by default). This is the remedy
            # for commits stranded on a detached HEAD, and the everyday "start a branch".
            path = body.get("path") or ""
            name = body.get("name") or ""
            if not path or not name:
                self._send(400, {"error": "path and name are required"})
                return
            try:
                self._send(
                    200,
                    checkout.create_branch(
                        path, name, switch=body.get("switch", True)
                    ),
                )
            except checkout.CheckoutError as exc:
                self._send(400, {"error": str(exc)})
            return

        if route.path == "/fetch":
            # Update remote-tracking refs and report ahead/behind. Read-only against the
            # working tree, so always safe, even mid-edit.
            path = body.get("path") or ""
            if not path:
                self._send(400, {"error": "path is required"})
                return
            try:
                self._send(200, checkout.fetch(path))
            except checkout.CheckoutError as exc:
                self._send(400, {"error": str(exc)})
            return

        if route.path == "/push":
            # Push the current branch. NEVER forces: a non-fast-forward rejection is
            # reported with the fix, not pushed past. Auth is the user's local git.
            path = body.get("path") or ""
            if not path:
                self._send(400, {"error": "path is required"})
                return
            try:
                self._send(
                    200,
                    checkout.push(
                        path,
                        set_upstream=bool(body.get("set_upstream")),
                        remote=body.get("remote") or "",
                    ),
                )
            except checkout.CheckoutError as exc:
                # `code` names the refusal so the plugin can offer the remedy for it
                # (here: publish the branch) without matching on the message text,
                # which is written for a person and gets reworded.
                body_out = {"error": str(exc)}
                if getattr(exc, "code", ""):
                    body_out["code"] = exc.code
                self._send(400, body_out)
            return

        if route.path == "/stash":
            # Put uncommitted work aside, or bring it back. The way OUT of the dirty
            # guard: refusing to move was correct, but a refusal with no way forward is
            # a dead end.
            path = body.get("path") or ""
            if not path:
                self._send(400, {"error": "path is required"})
                return
            # Name the action rather than inferring it from which flag happens to be
            # present. An agent too old for `drop` silently fell through to stash(), and
            # the user got "There are no uncommitted changes to stash" when they pressed
            # Discard: a baffling answer to a question they did not ask. An unknown action
            # must be an error that names itself, not a fallthrough to the wrong verb.
            action = body.get("action") or ""
            if not action:
                # Older plugins send flags. Keep understanding them, but map them here so
                # there is still exactly one place that decides.
                if body.get("drop"):
                    action = "drop"
                elif body.get("restore"):
                    action = "apply"
                else:
                    action = "stash"

            try:
                if action == "apply-keep":
                    # Restores and KEEPS the stash. Deliberately a different verb from
                    # "apply": that one has always meant pop, and an older plugin sending
                    # it must keep getting pop rather than silently changing behaviour.
                    result = checkout.apply(path, body.get("ref") or "stash@{0}")
                elif action == "drop":
                    # Destroys the stash. The CALLER confirms; this route cannot ask.
                    result = checkout.drop(path, body.get("ref") or "stash@{0}")
                elif action == "apply":
                    result = checkout.restore(path, body.get("ref") or "stash@{0}")
                elif action == "stash":
                    # Tag the stash with the current branch (unless the caller names
                    # another), so it can be offered back on return to that branch.
                    origin = body.get("origin")
                    if origin is None:
                        origin = checkout.status(path).get("current_branch") or ""
                    result = checkout.stash(
                        path, body.get("message") or "", origin=origin
                    )
                else:
                    self._send(400, {"error": f"Unknown stash action: {action}"})
                    return
                self._send(200, result)
            except checkout.CheckoutError as exc:
                self._send(400, {"error": str(exc)})
            return

        if route.path == "/discard":
            # Throw away uncommitted changes. Unrecoverable: the CALLER confirms (this
            # route does not ask). Discards the user's tracked edits back to HEAD.
            path = body.get("path") or ""
            if not path:
                self._send(400, {"error": "path is required"})
                return
            try:
                self._send(200, checkout.discard(path))
            except checkout.CheckoutError as exc:
                self._send(400, {"error": str(exc)})
            return

        if route.path == "/gitignore":
            # Write the KiCad .gitignore. Never overwrites an existing one, and never
            # commits: the user reviews and commits it like any other edit.
            path = body.get("path") or ""
            if not path:
                self._send(400, {"error": "path is required"})
                return
            try:
                self._send(200, gitignore.add(path))
            except gitignore.IgnoreError as exc:
                self._send(400, {"error": str(exc)})
            return

        if route.path == "/kicad-signin":
            self._send(*self._kicad_signin(body))
            return

        if route.path == "/quit":
            if not self.state.request_stop:
                self._send(501, {"error": "this agent can't stop itself"})
                return
            # Answer first, then stop: shutting the server down from inside a
            # handler would deadlock, so request_stop defers to another thread.
            self._send(200, {"ok": True, "stopping": True})
            self.state.request_stop()
            return

        if route.path == "/restart":
            if not self.state.request_restart:
                self._send(501, {"error": "this agent can't restart itself"})
                return
            self._send(200, {"ok": True, "restarting": True})
            self.state.request_restart()
            return

        self._send(404, {"error": "not found"})

    def do_PUT(self):  # noqa: N802
        route = urlparse(self.path)

        if not self._authorised():
            self._send(401, {"error": "unauthorised"})
            return

        length = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            self._send(400, {"error": "invalid json"})
            return

        if route.path == "/settings":
            self._send(200, self._save_settings(body))
            return

        self._send(404, {"error": "not found"})

    # -- sign in / out -----------------------------------------------------

    def _kicad_signin(self, body: dict) -> tuple[int, dict]:
        """Let Prism's own login page sign the user in as whoever the agent is.

        KiCad's Remote Symbols panel is an embedded browser with its own cookie jar, so
        it meets Prism with no session and asks for a login the user has already done
        in the plugin. That browser can reach this agent, so rather than the agent
        pushing a session into a browser it does not control, the page pulls from here.

        What this is NOT: a second way of authenticating. The agent token is a
        credential the backend already accepts, the backend alone decides whether it is
        still valid, and the session that results is issued by the same /oauth/bootstrap
        the provider flow already uses. Revoking the agent's token revokes this too.

        Three things guard it, and the first is doing real work:

        * **Origin.** Only the configured Prism server's own pages may call this. The
          agent can run git and touch the filesystem, so a route that hands out identity
          must not be reachable from any tab the user happens to have open.
        * **The token never reaches the page.** The agent exchanges it for a one-shot
          URL itself, so a page that is allowed to ask still cannot walk away with a
          credential it could reuse.
        * **The backend validates.** A compromised agent claiming to be signed in gets
          nowhere: it has to present a token the backend still accepts.

        The honest limit: CORS is enforced by browsers, so a native program on this
        machine could call this directly. That is already true of every agent route,
        and such a program could read the discovery file anyway; it is not a new hole,
        but it is the reason the exchange happens here rather than handing out tokens.
        """
        if not self._allowed_origin():
            # No Origin, or not the Prism server's. Say nothing about whether an agent
            # is signed in: that is itself information.
            return 403, {"error": "forbidden"}

        next_url = str(body.get("next_url") or "")
        if not next_url:
            return 400, {"error": "next_url is required"}

        saved = settings_store.load()
        if not saved.api_token:
            return 409, {"error": "The Prism agent is not signed in."}

        nonce_url, email = self.state.prism.agent_handoff_url(saved.api_token, next_url)
        if not nonce_url:
            return 409, {"error": "The agent's sign-in is no longer valid."}
        # The email is for naming the account on the confirmation step. The URL is the
        # credential, and it is single-use and short-lived.
        return 200, {"nonce_url": nonce_url, "email": email}

    def _sign_in(self, body: dict) -> tuple[int, dict]:
        """Run the browser loopback flow, save the token, re-point the client.

        Returns (status, payload) so the caller can surface a 400 with the real
        reason. On success the payload is the fresh settings view, so the UI can
        re-render "signed in as ..." from one round trip.
        """
        status, result = apply_sign_in(self.state, label=(body.get("label") or ""))
        if status != 200:
            return status, result
        if result.get("cancelled"):
            # Nothing changed; hand back the settings view unmarked so the UI just
            # returns to where it was.
            payload = self._settings_payload()
            payload["cancelled"] = True
            return 200, payload
        payload = self._settings_payload()
        payload["ok"] = True
        return 200, payload

    def _sign_out(self) -> dict:
        """Clear the local token, and best-effort revoke it server-side."""
        warning = apply_sign_out(self.state)
        payload = self._settings_payload()
        payload["ok"] = True
        if warning:
            payload["warning"] = warning
        return payload

    # -- settings ----------------------------------------------------------

    def _settings_payload(self) -> dict:
        current = settings_store.load()
        return {
            # Redacted: the token would otherwise travel over loopback HTTP and
            # end up in logs and screenshots. The UI only needs to know it's set.
            "settings": current.to_dict(redact=True),
            "identity": self.state.prism.identity(),
            "protocol": {
                "registered": protocol.is_registered(),
                # All three platforms now. macOS needs an .app bundle to claim a
                # scheme, but we build one at opt-in time rather than shipping it.
                "supported": True,
            },
            "autostart": {"enabled": autostart.is_enabled(), "supported": True},
        }

    def _save_settings(self, body: dict) -> dict:
        changes = {
            k: body[k]
            for k in (
                "server_url",
                "api_token",
                "protocol_handler",
                "autostart",
                "first_run_done",
                "projects_roots",
            )
            if k in body
        }

        if "projects_roots" in changes:
            changes["projects_roots"] = _clean_roots(changes["projects_roots"])

        # An empty api_token means "leave it alone" (the UI never receives the real
        # one, so it can't echo it back). Clearing is explicit, via clear_token.
        if changes.get("api_token") == "" and not body.get("clear_token"):
            changes.pop("api_token", None)
        if body.get("clear_token"):
            changes["api_token"] = ""

        # These two don't merely get stored, they register something with the OS.
        # If the OS refuses, don't persist the setting: a saved `true` with nothing
        # actually installed would leave the UI confidently reporting a handler
        # that isn't there.
        #
        # `current` reads the OS, not the settings file, so the two can't drift: if
        # a user deletes the registry key by hand, we notice.
        errors: list[str] = []
        toggles = (
            (
                "protocol_handler",
                protocol.is_registered,
                lambda want: protocol.register() if want else protocol.unregister(),
                protocol.RegistrationError,
            ),
            (
                "autostart",
                autostart.is_enabled,
                autostart.set_enabled,
                autostart.AutostartError,
            ),
        )
        for key, current, apply, failure in toggles:
            want = changes.get(key)
            if want is None or bool(want) == current():
                continue  # not asked for, or already in that state
            try:
                apply(bool(want))
            except failure as exc:
                changes.pop(key, None)
                errors.append(str(exc))

        saved, ignored = settings_store.apply(**changes)

        # A setting this agent is too old to know about. It was dropped, so saying
        # nothing would report success while the user's value vanished, which is exactly
        # what happened with projects_roots. Name the fix: the agent, not the plugin, is
        # the stale half.
        if ignored:
            errors.append(
                "This agent is too old to store: %s.\n\n"
                "Restart the agent to pick up the new version."
                % ", ".join(sorted(ignored))
            )

        # Re-point the backend client, or the new URL/token wouldn't take effect
        # until the agent restarted.
        self.state.rebuild_client(saved)
        payload = self._settings_payload()
        if errors:
            payload["error"] = "\n\n".join(errors)
        return payload

    # -- the payload the plugin renders ------------------------------------

    def _project_payload(self, path: str) -> dict:
        project = identify_project(path)
        if not project:
            return {"project": None, "git": None, "prism": None}

        git = git_status(project.repo_root) if project.repo_root else None
        # The backend may be down or unconfigured; that's fine, we just say so.
        prism = self.state.prism.find_project(project.path)

        return {
            "project": project.to_dict(),
            "git": git.to_dict() if git else None,
            "prism": prism,
            # Everything else the header needs, in the one call the dialog already
            # makes. identity() is deliberately NOT cached the way the plugin version
            # is: who you are can change under a running agent (you sign in, a token
            # expires), and a stale name in the header would be worse than one more
            # call to a backend this handler is already talking to.
            "user": self.state.prism.identity().get("user"),
            "library": remote_library.status(settings_store.load().server_url),
        }

    def _changes_payload(self, path: str) -> dict:
        """Uncommitted changes, grouped the way the web UI groups a commit's."""
        project = identify_project(path)
        if not project or not project.repo_root:
            return {"changes": [], "project": None, "prism": None}

        changes = self.state.changes(project.repo_root, project.path)
        # The project id lets the plugin deep-link a change into Prism's viewer.
        prism = self.state.prism.find_project(project.path)
        return {
            "changes": changes,
            "project": project.to_dict(),
            "prism": prism,
        }

    def _locate_payload(self, project_id: str) -> dict:
        """Where this machine keeps a given Prism project, if anywhere.

        `roots` comes back too, because "not found" means something different when
        no roots are configured (we did not look anywhere) than when they are (we
        looked and it is not there), and the caller has to be able to tell those
        apart rather than guessing.
        """
        saved = settings_store.load()
        roots = saved.projects_roots
        path = identity.find_by_id(project_id, roots)
        if not path and roots:
            # No marker: fall back to the repo's git origin, which needs the row.
            rows = self.state.prism._request("GET", "/api/projects")
            row = next(
                (r for r in rows if isinstance(r, dict) and r.get("id") == project_id),
                None,
            ) if isinstance(rows, list) else None
            if row:
                path = identity.find_checkout(
                    project_id,
                    roots,
                    origin_url=row.get("origin_url") or "",
                    sub_path=row.get("sub_path") or "",
                    server=saved.server_url,
                )
        return {"id": project_id, "path": path, "roots": roots}


def _clean_roots(raw) -> list[str]:
    """Tidy a list of projects roots without second-guessing the user.

    Blanks and duplicates go, and paths are resolved to a canonical form so the same
    folder spelled two ways is stored once. A root that does not exist is KEPT: a
    removable drive or a network share that is offline right now is still where the
    user keeps their projects, and quietly deleting it from their settings because
    we could not stat it would be its own bug.
    """
    if not isinstance(raw, list):
        return []
    cleaned: list[str] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, str) or not item.strip():
            continue
        try:
            resolved = str(Path(item.strip()).expanduser().resolve())
        except (OSError, ValueError):
            resolved = item.strip()
        key = resolved.casefold()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(resolved)
    return cleaned


def apply_sign_in(state: AgentState, *, label: str = "") -> tuple[int, dict]:
    """The shared sign-in: browser loopback flow, save token, re-point the client.

    Used by both the /signin route and the tray menu, so they cannot drift. The
    browser wait happens here and can take a while; callers that own a UI thread
    (the tray) must run this off it. Returns (status, payload) where payload holds
    an ``error`` on failure.
    """
    import socket as _socket

    server_url = settings_store.load().server_url
    if not server_url:
        return 400, {"error": "Set the Prism server URL before signing in."}

    # A label the user recognises in their token list. The machine's hostname is
    # the least surprising default: "my-laptop" beats an opaque id at revoke time.
    label = label.strip() or _socket.gethostname()

    try:
        result = signin.sign_in(server_url, label=label)
    except signin.SignInCancelled:
        # The user abandoned the flow. Not an error to shout about; the caller
        # already knows (it cancelled), so answer plainly.
        return 200, {"ok": False, "cancelled": True}
    except signin.SignInError as exc:
        return 400, {"error": str(exc)}

    saved = settings_store.update(api_token=result.token)
    state.rebuild_client(saved)
    return 200, {"ok": True}


def apply_sign_out(state: AgentState) -> str:
    """The shared sign-out: clear the local token, best-effort revoke it server-side.

    Clearing locally is what signs this agent out; the server revoke also kills a
    copy of the token elsewhere but must not trap the user signed in when the
    server is down. Returns a warning string when the revoke could not be done,
    else "".
    """
    current = settings_store.load()
    revoked = signin.sign_out(current.server_url, current.api_token)
    had_token = bool(current.api_token)
    # Store an empty token directly. `apply()` writes "" through (only None is
    # "leave alone"), so this removes it; the "empty means leave alone" rule is a
    # /settings route convention, not a settings-store one.
    saved = settings_store.update(api_token="")
    state.rebuild_client(saved)
    if had_token and not revoked:
        return (
            "Signed out on this machine, but Prism could not be reached to revoke "
            "the token. Revoke it from the web console if needed."
        )
    return ""


class _AgentServer(ThreadingHTTPServer):
    """An HTTP server that owns its port outright.

    HTTPServer sets SO_REUSEADDR, and on Windows that lets a second process bind a
    port another one is already listening on. A second agent then "got" the preferred
    port instead of falling back to a free one, and connections went to whichever
    socket Windows picked. SO_EXCLUSIVEADDRUSE makes the bind fail instead. Elsewhere
    SO_REUSEADDR never allowed two listeners, so it stays.
    """

    if sys.platform == "win32":
        allow_reuse_address = False

        def server_bind(self) -> None:
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            super().server_bind()


def make_server(prism: PrismClient) -> tuple[ThreadingHTTPServer, AgentState]:
    """Bind 127.0.0.1 on the active profile's port, or an ephemeral one.

    The profile's preferred port makes the agent land somewhere predictable, so
    a developer running dev and release side by side knows which is which. It is
    only a preference: if that port is taken (a stale agent, or a second instance
    of the same profile) the OS picks a free one instead and we log it, rather
    than refusing to start. Discovery publishes whichever port we actually got,
    so the plugin connects either way.
    """
    from .profiles import resolve

    state = AgentState(prism)
    handler = type("Handler", (_Handler,), {"state": state})
    preferred = resolve().preferred_port
    try:
        server = _AgentServer(("127.0.0.1", preferred), handler)
    except OSError:
        # Port 0 = let the OS pick a free one; we publish it via discovery.
        server = _AgentServer(("127.0.0.1", 0), handler)
        log.warning(
            "Preferred port %d is in use; bound an ephemeral port instead.",
            preferred,
        )
    # Hang the state off the server too, so callers holding only the server (the
    # tray menu) can reach request_stop/request_restart without extra plumbing.
    server.state = state
    return server, state


def serve(
    prism_config: PrismConfig,
) -> tuple[ThreadingHTTPServer, threading.Thread, AgentState]:
    """Start the API in a background thread and publish where to find it."""
    server, state = make_server(PrismClient(prism_config))
    port = server.server_address[1]
    # The version goes in the discovery file so a NEWER agent starting up can tell it
    # should retire us. Without it an update leaves the old agent serving forever.
    discovery.write_endpoint(port, state.token, VERSION)
    # Start the first backend check now, so the plugin's first /health has an answer.
    state.backend_status()

    thread = threading.Thread(
        target=server.serve_forever, name="prism-agent-http", daemon=True
    )
    thread.start()
    return server, thread, state
