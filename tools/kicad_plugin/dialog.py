"""The plugin's wx dialog, themed to match the Prism web app.

wx has no stylesheet, so "theming" means setting colours/fonts explicitly and
owner-drawing the widgets whose native versions can't be styled (see widgets.py,
notably wx.Button ignores SetBackgroundColour on Windows, which is why the primary
button has to be drawn by hand).
"""

from __future__ import annotations

import os
import subprocess
import sys
import threading

import wx

from . import agent_launcher
from . import git_workflow
from . import prism_theme as th
from . import prompts
from . import version
from .agent_client import PROBE_TIMEOUT, AgentClient, AgentUnavailable
from .settings_dialog import SettingsDialog
from .widgets import (
    Badge,
    Button,
    Card,
    ChangeRow,
    Disclosure,
    IconButton,
    LinkLabel,
    ScrollThumb,
    StatusIcon,
    draw_kind_icon,
    fit_width_to_content,
    ui_font,
)

try:
    from . import crossprobe
except ImportError:  # pcbnew is only importable inside KiCad
    crossprobe = None

LOGO = os.path.join(os.path.dirname(__file__), "assets", "prism-64.png")

# A real board can produce hundreds of changed items. Cap what we draw so the
# dialog stays responsive, and say so rather than silently truncating.
MAX_ROWS_PER_FILE = 60

# Distinguishes "the diff is still computing in the background" from None
# ("couldn't read") and [] ("nothing to commit"), so the changes card can show a
# transient loading state while the rest of the dialog is already up.
_CHANGES_LOADING = object()


def _c(hex_value):
    return wx.Colour(*th.hex_to_rgb(hex_value))


def _initial_size() -> wx.Size:
    """How big the panel opens: tall, but never taller than the screen.

    The panel stacks a header, the git card, the change list and a commit box, and at
    620px the commit box was below the fold as soon as anything was expanded. It asks
    for 731 instead, clamped to the usable height of the display it opens on (minus a
    margin for the taskbar) so a laptop screen does not get a dialog running off the
    bottom with its buttons unreachable.
    """
    want_w, want_h = 560, 731
    try:
        area = wx.Display(wx.Display.GetFromPoint(wx.GetMousePosition())).GetClientArea()
    except Exception:
        try:
            area = wx.Display().GetClientArea()
        except Exception:
            return wx.Size(want_w, 527)  # the old fixed size, as a last resort
    return wx.Size(min(want_w, area.width - 40), min(want_h, area.height - 60))


class PrismDialog(wx.Dialog):
    def __init__(self, parent, board_path):
        super().__init__(
            parent,
            title="Prism",
            size=_initial_size(),
            style=wx.DEFAULT_DIALOG_STYLE | wx.RESIZE_BORDER,
        )
        # Follow the OS/KiCad appearance: a light dialog inside a dark KiCad (or
        # the reverse) looks broken.
        self.pal = th.palette(dark=wx.SystemSettings.GetAppearance().IsDark())
        self.SetFont(ui_font(self))
        self.board_path = board_path
        # Git workflows decide; this dialog asks and shows. See git_workflow.py.
        self.git = git_workflow.GitWorkflow()
        self.data = None
        self.changes = None  # None = couldn't fetch; [] = genuinely nothing
        # Stashes as of the last load. Rendered from, never fetched during a render.
        self._stashes = []
        # Likewise: whether a KiCad .gitignore would help here.
        self._gitignore = {}
        self.verdict = "ok"  # this plugin vs the server: ok | update | required
        self.download_url = ""
        # Which files the user has expanded, by path. Kept across a re-render so
        # toggling one file doesn't collapse the others.
        self.expanded = set()
        # Collapsed by default: the header already carries the change count, which
        # is the answer most of the time. Expand when you want the detail.
        self.section_open = False
        # KiCad's generated files stay folded unless you go looking for them.
        self.noise_open = False

        self.SetBackgroundColour(_c(self.pal["background"]))
        self._build()
        # Close is felt, not just seen: hide the window the instant it's requested so
        # KiCad's canvas repaints at once, rather than staying obscured while wx tears
        # down the owner-drawn widget tree. See _on_close.
        self.Bind(wx.EVT_CLOSE, self._on_close)
        self._load()

    # -- layout ------------------------------------------------------------

    def _build(self):
        root = wx.BoxSizer(wx.VERTICAL)

        # The header carries what you'd otherwise need three rows to say: which project,
        # where it is, and whether the server and this project are in good standing.
        # The two icons replace the Project card's "In Prism" row entirely.
        header = wx.BoxSizer(wx.HORIZONTAL)
        if os.path.isfile(LOGO):
            img = wx.Image(LOGO, wx.BITMAP_TYPE_PNG).Scale(
                24, 24, wx.IMAGE_QUALITY_HIGH
            )
            header.Add(
                wx.StaticBitmap(self, bitmap=wx.Bitmap(img)),
                0,
                wx.ALIGN_CENTER_VERTICAL | wx.RIGHT,
                th.SP_SM,
            )

        self.title = wx.StaticText(self, label="Prism")
        self.title.SetForegroundColour(_c(self.pal["foreground"]))
        tf = self.title.GetFont()
        tf.SetPointSize(th.FONT_TITLE)
        # The web's headings are semibold (600), not heavy bold.
        tf.SetWeight(wx.FONTWEIGHT_SEMIBOLD)
        self.title.SetFont(tf)
        header.Add(self.title, 0, wx.ALIGN_CENTER_VERTICAL)

        header.AddStretchSpacer()

        # The right side is ONE line: who you are, the health dots, and the two
        # utilities. A two-line corner stack aligned badly against the single-line
        # title, and refresh/settings crowded the footer beside the primary action.
        #
        # The user label is the SERVER identity, and only that. The git identity is a
        # different person and lives on the tooltip: showing both inline would suggest
        # they're the same thing, and they are exactly the thing worth telling apart.
        self.user = wx.StaticText(self, label="")
        self.user.SetForegroundColour(_c(self.pal["muted_fg"]))
        uf = self.user.GetFont()
        uf.SetPointSize(th.FONT_SMALL)
        self.user.SetFont(uf)
        header.Add(self.user, 0, wx.ALIGN_CENTER_VERTICAL | wx.RIGHT, th.SP_SM)

        # First, because it's the precondition for the rest: with no agent, the other
        # three know nothing and go grey.
        self.agent_icon = StatusIcon(
            self, "agent", self.pal, tooltip="Contacting the agent"
        )
        header.Add(self.agent_icon, 0, wx.ALIGN_CENTER_VERTICAL | wx.LEFT, th.SP_XS)
        self.server_icon = StatusIcon(
            self, "server", self.pal, tooltip="Contacting the agent"
        )
        header.Add(self.server_icon, 0, wx.ALIGN_CENTER_VERTICAL | wx.LEFT, th.SP_XS)
        self.git_icon = StatusIcon(self, "git", self.pal, tooltip="No repository yet")
        header.Add(self.git_icon, 0, wx.ALIGN_CENTER_VERTICAL | wx.LEFT, th.SP_XS)
        self.library_icon = StatusIcon(
            self, "library", self.pal, tooltip="Symbol library"
        )
        header.Add(self.library_icon, 0, wx.ALIGN_CENTER_VERTICAL | wx.LEFT, th.SP_XS)

        header.Add(
            IconButton(
                self, "refresh", self.pal, tooltip="Refresh",
                variant="ghost", on_click=self._load,
            ),
            0,
            wx.ALIGN_CENTER_VERTICAL | wx.LEFT,
            th.SP_SM,
        )
        header.Add(
            IconButton(
                self, "settings", self.pal, tooltip="Settings",
                variant="ghost", on_click=self._on_settings,
            ),
            0,
            wx.ALIGN_CENTER_VERTICAL | wx.LEFT,
            th.SP_XS,
        )

        root.Add(header, 0, wx.EXPAND | wx.LEFT | wx.RIGHT | wx.TOP, th.SP_LG)

        # The path, under the name. Clickable: seeing where a project lives and wanting
        # to open that folder are the same impulse.
        self.status = wx.StaticText(self, label="Contacting agent...")
        self.status.SetForegroundColour(_c(self.pal["muted_fg"]))
        sf = self.status.GetFont()
        sf.SetPointSize(th.FONT_SMALL)
        self.status.SetFont(sf)
        self.status.Bind(wx.EVT_LEFT_UP, self._on_open_folder)
        self.status.Bind(wx.EVT_ENTER_WINDOW, self._on_path_enter)
        self.status.Bind(wx.EVT_LEAVE_WINDOW, self._on_path_leave)
        # SP_LG, the same gutter as the header, the cards and the buttons. Anything else
        # and the path sits proud of every other element in the dialog.
        root.Add(self.status, 0, wx.LEFT | wx.RIGHT | wx.TOP, th.SP_LG)
        root.AddSpacer(th.SP_MD)

        # Scrolled body, a board with many edits makes a long list. The native
        # scrollbar can't be themed (wx offers no way to recolour it), so it's
        # hidden and ScrollThumb draws a slim one over the content instead.
        body = wx.BoxSizer(wx.HORIZONTAL)
        self.scroll = wx.ScrolledWindow(self, style=wx.VSCROLL)
        self.scroll.surface = self.pal["background"]
        self.scroll.pal = self.pal
        self.scroll.SetBackgroundColour(_c(self.pal["background"]))
        self.scroll.SetScrollRate(0, 12)
        self.scroll.ShowScrollbars(wx.SHOW_SB_NEVER, wx.SHOW_SB_NEVER)
        self.content = wx.BoxSizer(wx.VERTICAL)
        self.scroll.SetSizer(self.content)
        body.Add(self.scroll, 1, wx.EXPAND)

        self.scroll.Bind(wx.EVT_MOUSEWHEEL, self._on_wheel)

        self.thumb = ScrollThumb(self, self.scroll, self.pal)
        body.Add(self.thumb, 0, wx.EXPAND | wx.LEFT, 2)

        root.Add(body, 1, wx.EXPAND | wx.LEFT | wx.RIGHT, th.SP_LG)

        buttons = wx.BoxSizer(wx.HORIZONTAL)
        # The footer carries the one destination action only. Refresh and settings
        # moved up to the header, where utilities belong; a row mixing them with the
        # primary action read as three unrelated buttons.
        self.open_btn = Button(
            self,
            "Open",
            self.pal,
            variant="primary",
            on_click=self.on_open,
            icon="open",
        )
        self.open_btn.Enable(False)
        buttons.Add(self.open_btn, 0)
        buttons.AddStretchSpacer()
        root.Add(buttons, 0, wx.EXPAND | wx.LEFT | wx.RIGHT | wx.BOTTOM, th.SP_LG)

        self.SetSizer(root)
        # The height the dialog ASKED for at open. While the window still matches
        # it, the height follows the content downward (see _fit_height_to_content);
        # a user resize takes over and the height stops tracking.
        self._asked_h = self.GetSize().height

    def _max_scroll_pos(self) -> int:
        """The furthest down the view may legally sit, in scroll units.

        The scrollbars are hidden (ScrollThumb draws its own), so nothing else works
        this out for us, and wx silently ignores a Scroll() past the end rather than
        clamping to it.
        """
        _, unit_y = self.scroll.GetScrollPixelsPerUnit()
        if not unit_y:
            return 0
        view_h = self.scroll.GetClientSize().height
        content_h = self.content.GetMinSize().height
        return max(0, (content_h - view_h + unit_y - 1) // unit_y)

    def _on_wheel(self, e):
        """ShowScrollbars(NEVER) also disables wheel scrolling, so drive it here.

        Clamped at BOTH ends. Only the top was clamped before, and a Scroll() past the
        bottom is ignored outright rather than clipped, so once a section was expanded
        the wheel stopped short and the commit box below it could not be reached.
        """
        lines = e.GetWheelRotation() / e.GetWheelDelta()
        target = self.scroll.GetScrollPos(wx.VERTICAL) - int(lines * 3)
        self.scroll.Scroll(-1, max(0, min(target, self._max_scroll_pos())))
        self.thumb.Refresh()

    def _on_close(self, event):
        """Dismiss the modal, hiding first so KiCad repaints without waiting on teardown.

        Destroying this dialog's owner-drawn tree takes a beat, and while it runs the
        modal window still covers KiCad's canvas, which reads as KiCad freezing. Hiding
        up front hands the screen back immediately; the destroy then happens behind
        nothing. A stale background fetch can't paint into a hidden window either (its
        guard already checks `if not self`), so there's nothing to cancel.

        NOT on macOS. Cocoa's modal loop (NSApp runModalForWindow) ties its session to
        the window's show/hide state; hiding the dialog while that session is still
        active is exactly the pattern wxPython's maintainer warns against ("the
        destruction of modal dialogs should only be done after ShowModal returns"), and
        it left PcbFrame itself wedged as if still blocked by a modal child, on Mac
        only. GTK and MSW tolerate it; Cocoa does not. So on macOS this just ends the
        modal loop and leaves the brief teardown-covers-the-canvas cost in place, which
        is the lesser problem of the two.
        """
        if sys.platform != "darwin":
            self.Hide()
        if self.IsModal():
            self.EndModal(wx.ID_CANCEL)
        else:
            event.Skip()

    def _relayout(self):
        """Re-fit the scrolled content, and keep the scroll position legal.

        Expanding a section makes the content taller; collapsing one makes it shorter.
        The scrollbars are hidden (ScrollThumb draws its own), and a hidden scrollbar
        does not re-clamp the scroll position on its own, so after a collapse the view
        could sit past the new end of the content, with the commit box scrolled out of
        sight and no visible scrollbar to explain why. Re-fit, then pull the position
        back inside the content if it now falls outside it.
        """
        self.content.FitInside(self.scroll)
        self.scroll.Layout()

        max_pos = self._max_scroll_pos()
        if self.scroll.GetScrollPos(wx.VERTICAL) > max_pos:
            self.scroll.Scroll(-1, max_pos)

        self.thumb.Refresh()  # the thumb size depends on the new content height
        self.Layout()
        fit_width_to_content(self, self.scroll, self.content)
        self.Refresh()
        self._fit_height_to_content()

    def _fit_height_to_content(self):
        """Shrink the window down to the content while the content is shorter.

        The dialog asks for 731px at open because an expanded section needs it;
        the collapsed panel is two-thirds empty, and dead space below the last
        card reads as a blank screenshot rather than a finished layout. So while
        the user has not resized the window themselves (the height is still what
        we asked at open, +/- a few px), the height follows the content down.
        It never grows back on its own: content taller than the window scrolls,
        which is what the scroll area is for.
        """
        size = self.GetSize()
        ours = getattr(self, "_auto_h", None)
        # Stop once the user has resized: the height is theirs. It is ours to
        # move only while it is still the height we asked at open, or a height
        # this fit last set.
        if ours is not None and abs(size.height - ours) > 4:
            return
        if ours is None and abs(size.height - self._asked_h) > 4:
            return
        # Height the ROOT sizer needs around the scroll area (header, footer,
        # the window frame), plus what the content itself wants. Computed from the
        # sizers rather than from scroll-position slack, which can be stale
        # mid-layout and left the collapsed panel at its full asked height.
        root_min = self.GetSizer().GetMinSize().height          # scroll pane at ~0
        scroll_need = self.content.GetMinSize().height
        chrome = size.height - self.GetClientSize().height       # title bar + borders
        # Never below a usable floor, never above the height we asked at open:
        # content taller than that scrolls, which is what the scroll area is for.
        want_h = max(root_min + scroll_need, self.FromDIP(320)) + chrome
        want_h = min(want_h, self._asked_h)
        # Bidirectional, not shrink-only: the diff loads after the first fit, and
        # a collapse that opened before its rows arrived must be allowed to grow
        # back to the newly computed height.
        if abs(want_h - size.height) > 8:
            self._auto_h = want_h
            self.SetSize(wx.Size(size.width, want_h))

    # -- data --------------------------------------------------------------

    def _load(self):
        """Refresh everything, WITHOUT blocking the KiCad UI thread on the network.

        The two calls the dialog opens with, /health and /project, are HTTP round-trips,
        and /health makes the agent reach the backend, up to a ten-second wait when the
        server is slow or gone. Doing them inline froze KiCad every time the panel opened.

        So paint the shell now with everything in a "Contacting agent…" state, and fetch
        health + project on a worker thread. When it lands we marshal back and render for
        real. A generation counter drops a stale fetch if Refresh is hit again first.
        """
        self.content.Clear(delete_windows=True)
        self.data = None
        self.changes = _CHANGES_LOADING
        self._stashes = []
        self._gitignore = {}
        self._render_contacting()
        self._relayout()

        self._load_gen = getattr(self, "_load_gen", 0) + 1
        generation = self._load_gen
        board_path = self.board_path

        def worker():
            try:
                client = AgentClient()
                # An update installs a new plugin beside an ALREADY-RUNNING old agent
                # (it's detached, and autostart brings it back at login). health() catches
                # that, so the plugin doesn't talk to it and get a 404 from a route that
                # didn't exist yet, failing like a bug in the new code.
                health = client.health() or {}
                project = None
                # Only fetch the project when the versions are compatible; an outdated
                # agent or plugin renders its own card instead of a project view.
                verdict = version.health_verdict(health)
                if version.usable(verdict[0]):
                    project = client.project(board_path)
                # Stashes come along for the ride. The sync row needs the count on
                # every render, and _rebuild re-renders on every collapse/expand, so
                # reading them inline would put an HTTP round-trip on the UI thread
                # each time a section is toggled.
                stashes = []
                gitignore = {}
                if project and (project.get("project") or {}).get("path"):
                    project_path = (project["project"])["path"]
                    try:
                        stashes = (client.stashes(project_path) or {}).get(
                            "stashes"
                        ) or []
                    except AgentUnavailable:
                        stashes = []  # not worth failing the whole load over
                    try:
                        gitignore = client.gitignore_status(project_path) or {}
                    except AgentUnavailable:
                        gitignore = {}
                payload = {
                    "health": health,
                    "verdict": verdict,
                    "project": project,
                    "stashes": stashes,
                    "gitignore": gitignore,
                }
                error = None
            except AgentUnavailable as exc:
                payload = None
                error = str(exc)
            wx.CallAfter(self._apply_load, generation, payload, error)

        threading.Thread(target=worker, daemon=True, name="prism-load").start()

    def _apply_load(self, generation, payload, error):
        """Render the fetched health/project on the UI thread. Drops a stale result."""
        if generation != getattr(self, "_load_gen", 0):
            return
        if not self:
            return

        # Same reason as _rebuild: this clears and rebuilds every card, and an unfrozen
        # rebuild shows the empty panel for a frame. Thawed on every path out, including
        # the early returns below, via CallAfter so it cannot be missed.
        self.Freeze()
        wx.CallAfter(self._thaw_if_frozen)
        self.content.Clear(delete_windows=True)

        if error is not None:
            self.data = None
            self.changes = None
            # The one thing here that IS an error. An unreachable backend is normal and
            # temporary; a missing agent means nothing works, so it gets the red.
            self.agent_icon.set("destructive", "The Prism agent isn't running")
            # And with no agent we know nothing about the rest. Grey, not amber: amber
            # says "reachable but unhappy", and we cannot even claim that much.
            self.server_icon.set("muted_fg", "Unknown")
            self.git_icon.set("muted_fg", "Unknown")
            self.library_icon.set("muted_fg", "Unknown")
            self.user.SetLabel("")
            self._render_unavailable(error)
            self._relayout()
            return

        health = payload["health"] or {}
        running = health.get("version", "")

        # It answered, so it's alive. Its version is the useful thing to say about it:
        # "is the agent running" is a yes/no, and the yes is worth qualifying.
        self.agent_icon.set("success", "Prism agent %s is running" % (running or "?"))
        # The agent answered, so the only question left is whether IT can reach the
        # backend. The icon says which, and stays out of the way otherwise.
        self._set_server_icon(version.backend_state(health))

        # Computed once, on the worker, from the same /health payload.
        verdict, download_url = payload["verdict"]
        if verdict == "agent_outdated":
            self.data = None
            self.changes = None
            self._render_outdated_agent(running)
            self._relayout()
            return

        # The plugin follows the server it talks to. "required" means this plugin is
        # older than the server can serve, so there's no point rendering a UI whose calls
        # will fail.
        self.verdict, self.download_url = verdict, download_url
        if self.verdict == "required":
            self.data = None
            self.changes = None
            self._render_outdated_plugin()
            self._relayout()
            return

        self.data = payload["project"]
        self._stashes = payload.get("stashes") or []
        self._gitignore = payload.get("gitignore") or {}

        # The diff parses every changed board, so it can take a second or two on a big
        # one. Don't block on it either: render everything else now with the changes card
        # in a "Computing…" state, and fetch the diff on its own thread.
        self.changes = _CHANGES_LOADING
        self._render()
        self._relayout()
        self._start_changes_fetch(AgentClient())

    def _start_changes_fetch(self, client):
        """Fetch the uncommitted-changes diff off the UI thread, then rebuild.

        A generation counter guards against a stale result: if the user hits
        Refresh (which calls _load again) before an in-flight fetch returns, the
        old thread's result is dropped rather than overwriting newer state.
        """
        self._changes_gen = getattr(self, "_changes_gen", 0) + 1
        generation = self._changes_gen
        board_path = self.board_path

        def worker():
            try:
                result = client.changes(board_path).get("changes", [])
            except AgentUnavailable:
                result = None  # the changes card explains itself
            except Exception:
                result = None
            wx.CallAfter(self._apply_changes, generation, result)

        threading.Thread(target=worker, daemon=True).start()

    def _apply_changes(self, generation, result):
        # Ignore a result from a fetch the user has already superseded, and one
        # that arrives after the dialog is gone.
        if generation != getattr(self, "_changes_gen", 0):
            return
        if not self:
            return
        self.changes = result
        self._rebuild()

    def _thaw_if_frozen(self):
        """Thaw once, safely. A window left frozen never repaints again."""
        if self and self.IsFrozen():
            self.Thaw()

    def _rebuild(self):
        """Re-render from data already in hand. No refetch, expanding a file is
        instant even when computing the diff was slow.

        Frozen while it runs. Clearing the sizer destroys every child window and the
        render builds them again, and without a freeze wx paints that empty moment, so
        toggling a section flashed the whole panel blank. Freeze/Thaw collapses it into
        one paint at the end. Thaw in a finally: a window left frozen never repaints
        again, which is a far worse bug than the flicker.
        """
        self.Freeze()
        try:
            self.content.Clear(delete_windows=True)
            self._render()
            self._relayout()
        finally:
            self.Thaw()

    def _on_path_enter(self, _e):
        if self._project_dir():
            self.status.SetForegroundColour(_c(self.pal["primary"]))
            self.status.SetCursor(wx.Cursor(wx.CURSOR_HAND))
            self.status.Refresh()

    def _on_path_leave(self, _e):
        self.status.SetForegroundColour(_c(self.pal["muted_fg"]))
        self.status.SetCursor(wx.Cursor(wx.CURSOR_ARROW))
        self.status.Refresh()

    def _project_dir(self):
        return ((self.data or {}).get("project") or {}).get("path") or ""

    def _on_open_folder(self, _e):
        """Show the project folder in the system file manager."""
        path = self._project_dir()
        if not path or not os.path.isdir(path):
            return
        if sys.platform == "win32":
            os.startfile(path)  # noqa: S606 - our own path, from the agent
        elif sys.platform == "darwin":
            subprocess.Popen(["open", path])
        else:
            subprocess.Popen(["xdg-open", path])

    def _render_identity(self, git) -> None:
        """Who you are to Prism, with the git identity on hover.

        These are two different identities and they can disagree. Being signed into
        Prism as one person while git attributes your commits to another is easy to do
        and impossible to notice, so the tooltip always shows both.
        """
        user = (self.data or {}).get("user") or {}
        prism_name = user.get("email") or user.get("name") or ""

        git_name = (git or {}).get("user_name") or ""
        git_email = (git or {}).get("user_email") or ""
        git_who = ""
        if git_name and git_email:
            git_who = "%s <%s>" % (git_name, git_email)
        elif git_name or git_email:
            git_who = git_name or git_email

        # The label is the SERVER identity, and only that. The git identity is a
        # different person and lives on the tooltip: showing both inline would suggest
        # they're the same thing, and they are exactly the thing worth telling apart.
        self.user.SetLabel(prism_name or "Guest")

        lines = [
            "Prism: %s" % (prism_name or "guest (this server has auth disabled)"),
            "Git:   %s" % (git_who or "no user.name set"),
        ]
        self.user.SetToolTip("\n".join(lines))

    def _set_git_icon(self, git, prism) -> None:
        """The repository, and whether Prism knows about it.

        One icon, because the two facts are the same question in practice: is this
        project under version control that Prism can see?
        """
        # Ask whether there IS a repo, not whether we are on a branch. `branch` is empty
        # on a detached HEAD, which is the normal state after opening a commit, and
        # testing it turned the icon grey and claimed "Not a git repository" for a repo
        # that is plainly fine.
        if not git or not git.get("last_commit_hash"):
            self.git_icon.set("muted_fg", "Not a git repository")
            return

        # Where we are, in the words the tooltip should use. A detached HEAD is still on
        # the branch's history, just not at its tip. (Built by hand rather than with
        # .capitalize(), which would lowercase a branch name like "Release-2".)
        branch = git.get("branch") or ""
        if branch:
            where = "On %s" % branch
        else:
            on = git.get("on_branches") or []
            where = "Viewing an older commit on %s" % on[0] if on else "Not on a branch"

        if prism:
            self.git_icon.set("success", "%s, registered in Prism" % where)
        else:
            self.git_icon.set("warning", "%s, but not registered in Prism" % where)

    def _set_library_icon(self, library) -> None:
        """Is the Prism remote library linked, and to THIS server?

        The only question that matters is whether Prism is registered as KiCad's symbol
        provider and pointing at the server we're configured for. Whether a KiCad config
        directory exists is our problem, not the user's.
        """
        library = library or {}

        if library.get("linked"):
            self.library_icon.set("success", "Prism library linked")
        elif library.get("stale"):
            self.library_icon.set(
                "warning",
                "Prism library is linked to another server: %s"
                % library.get("linked_url", ""),
            )
        else:
            self.library_icon.set("muted_fg", "Prism library not linked")

    def _set_server_icon(self, state: str) -> None:
        """Green when Prism is reachable, muted while unknown, amber when unhappy.

        "refused" is a distinct state: the server answered and rejected the token, so
        the fix is to sign in, not to check the address. Never red: an unreachable
        server is a normal, temporary state (laptop offline, backend restarting), and
        the plugin's local features keep working. Red would be crying wolf.
        """
        if state == "up":
            self.server_icon.set("success", "Connected to Prism")
        elif state == "refused":
            self.server_icon.set("warning", "Sign in to Prism")
        elif state == "unknown":
            self.server_icon.set("muted_fg", "Checking the Prism server")
        else:
            self.server_icon.set("warning", "Can't reach the Prism server")

    def _render_outdated_plugin(self):
        """This plugin is older than the server can serve. Nothing else will work.

        Not recoverable in-app: the fix is a new plugin, which the user has to install
        through KiCad's Plugin Manager. So say what to do and where, and stop.
        """
        self.status.SetLabel("This plugin is out of date")
        self.status.SetForegroundColour(_c(self.pal["destructive"]))

        card = Card(self.scroll, "Update required", self.pal)
        card.row("Plugin", version.VERSION, tone="muted_fg")
        card.body.Add(
            card.label(
                "The Prism server needs a newer plugin. Download it and install\n"
                "it through KiCad's Plugin Manager.",
                tone="muted_fg",
            ),
            0,
            wx.BOTTOM,
            th.SP_SM,
        )
        if self.download_url:
            card.body.Add(
                Button(
                    card,
                    "Download",
                    self.pal,
                    variant="primary",
                    on_click=self._open_download,
                ),
                0,
            )

        self.content.Add(card, 0, wx.EXPAND)
        self.open_btn.Enable(False)

    def _render_update_available(self):
        """A newer plugin exists, but this one still works. A note, not a wall."""
        card = Card(self.scroll, "Update available", self.pal)
        card.body.Add(
            card.label(
                "The Prism server ships a newer plugin than this one (%s)."
                % version.VERSION,
                tone="muted_fg",
                small=True,
            ),
            0,
            wx.BOTTOM,
            th.SP_XS,
        )
        if self.download_url:
            card.body.Add(
                Button(
                    card,
                    "Download",
                    self.pal,
                    variant="ghost",
                    on_click=self._open_download,
                ),
                0,
            )
        self.content.Add(card, 0, wx.EXPAND | wx.BOTTOM, th.SP_MD)

    def _open_download(self):
        import webbrowser

        webbrowser.open(self.download_url)

    def _render_outdated_agent(self, running):
        """An old agent is still running. Offer to restart it into the new one.

        Recoverable in one click, because the cause is mundane: the agent outlives
        KiCad by design, so an update leaves the previous one running. Telling the
        user to go hunt a background process would be a poor way to end an install.
        """
        self.status.SetLabel("The Prism agent is out of date")
        self.status.SetForegroundColour(_c(self.pal["warning"]))

        # Running, but too old to talk to. Amber: it's alive, which is not nothing, and
        # a restart fixes it.
        self.agent_icon.set(
            "warning", "Prism agent %s is out of date" % (running or "?")
        )

        card = Card(self.scroll, "Prism agent", self.pal)
        card.body.Add(
            card.label(
                "Agent %s is running. This plugin needs %s or newer.\n"
                "Restart the agent to update it."
                % (running or "unknown", version.AGENT_MIN),
                tone="muted_fg",
            ),
            0,
            wx.BOTTOM,
            th.SP_SM,
        )
        card.body.Add(
            Button(
                card,
                "Restart the agent",
                self.pal,
                variant="primary",
                on_click=self._restart_agent,
            ),
            0,
        )
        self.content.Add(card, 0, wx.EXPAND)
        self.open_btn.Enable(False)

    def _restart_agent(self):
        """Stop whatever agent is running, then start the one that shipped with
        THIS plugin. See agent_launcher.restart_agent for why this, not /restart.

        The whole thing can take several seconds (waiting for the old agent's port
        to free up, a cold PyInstaller binary spinning up, the new agent's own
        singleton handshake), and with no visible change the window reads as frozen.
        A user watching that with no feedback did exactly the reasonable thing and
        closed it. So the status line and cursor stay busy for the full wait, not
        just around the launch call, and each phase says what it is doing.
        """
        def status(text):
            self.status.SetLabel(text)
            self.status.SetForegroundColour(_c(self.pal["muted_fg"]))
            wx.Yield()

        with wx.BusyCursor():
            try:
                came_up = agent_launcher.restart_agent(on_status=status)
            except agent_launcher.LaunchError as exc:
                prompts.tell(self, str(exc), "Prism")
                return

            if not came_up:
                prompts.tell(
                    self,
                    "The new agent hasn't responded yet. It may still be "
                    "starting, try Refresh in a moment.",
                    "Prism",
                )

        self._load()

    def _render_contacting(self):
        """The instant shell, shown while health/project load off-thread.

        The point is that the window appears the moment KiCad calls it, rather than after
        a network round-trip. So this touches only widgets that already exist (the header
        icons and the path line) and adds one light placeholder card, no work that could
        itself stall.
        """
        self.status.SetLabel("Contacting agent...")
        self.status.SetForegroundColour(_c(self.pal["muted_fg"]))
        self.agent_icon.set("muted_fg", "Contacting the agent")
        self.server_icon.set("muted_fg", "Contacting the agent")
        self.git_icon.set("muted_fg", "Contacting the agent")
        self.library_icon.set("muted_fg", "Contacting the agent")
        self.user.SetLabel("")
        self.open_btn.Enable(False)

        card = Card(self.scroll, "", self.pal)
        card.body.Add(
            card.label("Loading project status...", tone="muted_fg", small=True),
            0,
            wx.ALL,
            th.SP_SM,
        )
        self.content.Add(card, 0, wx.EXPAND)

    def _render_unavailable(self, message):
        """The agent isn't running. Offer to start it rather than just saying so."""
        self.status.SetLabel("Agent not running")
        self.status.SetForegroundColour(_c(self.pal["destructive"]))

        card = Card(self.scroll, "Prism agent", self.pal)

        card.body.Add(
            card.label(
                "The Prism agent isn't running. The plugin needs it.",
                tone="muted_fg",
            ),
            0,
            wx.BOTTOM,
            th.SP_SM,
        )

        card.body.Add(
            Button(
                card,
                "Start agent",
                self.pal,
                variant="primary",
                on_click=self._on_start_agent,
            ),
            0,
        )

        self.content.Add(card, 0, wx.EXPAND)
        self.open_btn.Enable(False)

    def _on_settings(self):
        dlg = SettingsDialog(self, self.pal)
        try:
            dlg.ShowModal()
        finally:
            dlg.Destroy()
        # The server URL (or the agent itself) may have changed underneath us.
        self._load()

    def _on_start_agent(self):
        try:
            with wx.BusyCursor():
                agent_launcher.start_agent()
        except agent_launcher.LaunchError as exc:
            prompts.tell(self, str(exc), "Prism")
            return

        # The agent needs a moment to bind its port and publish the discovery
        # file. Poll rather than guess at a sleep long enough to always work.
        for _ in range(30):
            wx.MilliSleep(200)
            wx.Yield()
            if not self:
                return
            try:
                AgentClient().health(timeout=PROBE_TIMEOUT)
                break
            except AgentUnavailable:
                continue
        else:
            prompts.tell(self, "The agent started but isn't responding yet. Try Refresh.",
                "Prism")
            return

        self._load()

    def _render(self):
        project = (self.data or {}).get("project")
        git = (self.data or {}).get("git")
        prism = (self.data or {}).get("prism")

        self._render_identity(git)
        self._set_git_icon(git, prism)
        self._set_library_icon((self.data or {}).get("library"))

        if self.verdict == "update":
            self._render_update_available()

        if not project:
            self.title.SetLabel("Prism")
            self.status.SetLabel("This board isn't inside a recognised KiCad project")
            self.status.SetForegroundColour(_c(self.pal["muted_fg"]))
            self.open_btn.Enable(False)
            return

        # Name, then the branch beside it, then the path under both. What the Project
        # and Git cards used to spend rows saying.
        self.title.SetLabel(project["name"])
        self.status.SetLabel(project["path"])
        self.status.SetForegroundColour(_c(self.pal["muted_fg"]))
        self.status.SetToolTip("Open this folder")
        self.Layout()

        # The changes card first: seeing what changed and committing it is why the
        # panel is opened, and it used to sit below the fold behind the git card.
        # The repository card answers where that work goes.
        self._render_detached_banner(git)
        self._render_changes()
        self._render_git(git, prism)
        self.open_btn.Enable(bool(prism))

    def _add_branch_row(self, card, git):
        """The branch as a clickable pill in the Git card. Click it to switch branch.

        Names the actual branch, never a bare "HEAD". Attached at the tip is muted;
        detached is warning-toned, with a tooltip saying you are behind. Clicking opens
        the branch switcher, the tag IS the control, so there is no separate button.
        """
        git = git or {}
        branch = git.get("branch") or ""

        if branch:
            label, tone = branch, "muted"
            tip = "On branch %s. Click to switch branch." % branch
        elif git.get("detached"):
            on = git.get("on_branches") or []
            if on:
                label, tone = on[0], "warning"
                tip = (
                    "Viewing an older commit on %s. You are behind the tip of the "
                    "branch. Click to switch branch." % on[0]
                )
            else:
                label, tone = "detached", "warning"
                tip = (
                    "Not on any branch (detached HEAD). Create a branch to keep work "
                    "here."
                )
        else:
            return  # no branch to show

        # An icon instead of the word "Branch", and the branch itself hard left: the
        # name is the content, and a label that only ever says "Branch" is noise beside
        # an icon that says the same thing.
        line = wx.BoxSizer(wx.HORIZONTAL)
        line.Add(
            StatusIcon(card, "git", self.pal, tone="muted_fg", tooltip="Current branch"),
            0,
            wx.ALIGN_CENTER_VERTICAL | wx.RIGHT,
            th.SP_XS,
        )

        badge = Badge(card, label, self.pal, tone=tone, on_click=self._switch_branch)
        badge.SetToolTip(tip)
        line.Add(badge, 0, wx.ALIGN_CENTER_VERTICAL)
        line.AddStretchSpacer()

        card.body.Add(line, 0, wx.EXPAND | wx.BOTTOM, th.SP_SM)

    # -- publishing ---------------------------------------------------------

    def _render_detached_banner(self, git):
        """When HEAD is detached, a persistent banner with the two ways forward.

        Detached HEAD is the normal state after opening a commit, and it is where work
        gets lost: a commit made here is on no branch, and the next checkout orphans it.
        So while detached the panel always shows the situation and the remedies, rather
        than waiting for the user to hit the trap. No "on close" needed, the banner is
        just there whenever the panel is open.
        """
        git = git or {}
        if not git.get("detached"):
            return
        on = git.get("on_branches") or []
        origin = on[0] if on else ""

        card = Card(self.scroll, "Detached commit", self.pal)
        # The card title and the commit row above it already say which commit this is
        # and that it is not on a branch, so the banner only has to say what that
        # COSTS. The one thing worth keeping from the old opening line is that the
        # branch is untouched: that is reassurance, not a restatement.
        if origin:
            text = (
                "%s is unchanged. Anything you commit here won't be on a branch "
                "until you make one." % origin
            )
        else:
            text = "Anything you commit here won't be on a branch until you make one."
        card.body.Add(card.label(text, tone="muted_fg", small=True, wrap=True), 0, wx.BOTTOM, th.SP_SM)

        row = wx.BoxSizer(wx.HORIZONTAL)
        row.Add(
            Button(card, "Create branch here", self.pal, variant="secondary", on_click=self._create_branch_here),
            0,
            wx.RIGHT,
            th.SP_SM,
        )
        if origin:
            row.Add(
                Button(
                    card,
                    "Return to %s" % origin,
                    self.pal,
                    variant="primary",
                    on_click=lambda: self._return_to_branch(origin),
                ),
                0,
            )
        card.body.Add(row, 0)
        self.content.Add(card, 0, wx.EXPAND | wx.BOTTOM, th.SP_MD)

    def _create_branch_here(self):
        """Name a branch at the current detached commit, keeping any work on it."""
        project = (self.data or {}).get("project")
        if not project or not project.get("repo_root"):
            return
        name = prompts.ask_text(
            self,
            "Name a branch to keep this commit (and any work on it):",
            "Create a branch",
        )
        if not name or not name.strip():
            return
        branch = name.strip()
        with wx.BusyCursor():
            created = self.git.create_branch(project["repo_root"], branch)
        if not created.ok:
            prompts.tell(self, created.error, "Prism")
            return
        self._publish_new_branch(project["repo_root"], branch)
        self._load()

    def _ask_publish_target(self, repo, branch):
        """After naming a branch: where should it go, if anywhere?

        Asked here rather than at push time because this is the moment the branch is
        being decided on, and because the answer is genuinely open: a repo with both
        `origin` and `upstream` (the fork layout) would otherwise have it guessed.

        Returns the remote to publish to, or "" to keep the branch local. Local is a
        real answer and the default: a branch is useful before anyone else has seen it,
        and publishing on the user's behalf puts a name on a shared remote that they
        may not have meant to create.
        """
        targets = self.git.new_branch_targets(repo)
        if targets.kind == git_workflow.LOCAL_ONLY:
            # Cannot ask; keeping it local is the safe answer, and the user is told.
            prompts.tell(
                self,
                "'%s' was created here, but its remotes could not be listed, so it "
                "stays on this computer:\n\n%s\n\nYou can publish it later from the panel."
                % (branch, targets.error),
                "Branch created",
            )
            return ""
        if targets.kind == git_workflow.NO_REMOTE:
            # Say so. The user asked for a branch expecting to be asked where it goes,
            # and silence here reads as the question having been answered for them.
            prompts.tell(
                self,
                "'%s' was created here.\n\n"
                "This project has no remote, so there is nowhere to publish it yet. "
                "Add one with `git remote add`, then push from the panel." % branch,
                "Branch created",
            )
            return ""

        remotes = targets.remotes
        keep_local = "Keep it on this computer for now"
        choices = [keep_local] + [
            "Publish to %s  (%s)" % (r.name, r.url) for r in remotes
        ]
        index = prompts.ask_choice(
            self,
            "'%s' has been created.\n\nWhere should it go?" % branch,
            "Publish branch",
            choices,
        )
        # None is cancelled, 0 is the "keep it local" row: both mean do not publish.
        if not index:
            return ""
        return remotes[index - 1].name

    def _publish_new_branch(self, repo, branch):
        """Publish a just-created branch, if the user picked somewhere for it.

        Failure here is reported but not fatal: the branch exists either way, and the
        user can publish it later from the Push button. Losing the branch because the
        network was down would be the worse outcome.
        """
        target = self._ask_publish_target(repo, branch)
        if not target:
            return
        with wx.BusyCursor():
            published = self.git.publish(repo, target)
        if not published.ok:
            prompts.tell(self, "'%s' was created, but publishing it to %s failed:\n\n%s\n\n"
                "You can publish it later from the panel."
                % (branch, target, published.error),
                "Prism")

    def _return_to_branch(self, branch):
        """Return to the branch we detached from. Goes through the same scheduled switch
        as any other, so the files are never swapped under the open board. The stash that
        branch owns is offered back automatically when the agent reopens on it."""
        project = (self.data or {}).get("project")
        if not project or not project.get("repo_root"):
            return
        self._do_switch(project["repo_root"], branch)

    def _render_git(self, git, prism):
        """What's left of the Git card once the branch moved to the header.

        The last commit is a link: seeing which commit you're on and wanting to look at
        it are the same impulse, and the web UI can already show it.
        """
        # `branch` is empty on a detached HEAD, which is the normal state after opening a
        # commit. Testing it alone made the whole card claim "Not a git repository" for a
        # repo that is plainly fine, so ask about the repo, not about the branch.
        if not git or not git.get("last_commit_hash"):
            card = Card(self.scroll, "Repository", self.pal)
            card.row("Status", "Not a git repository", tone="muted_fg")
            self.content.Add(card, 0, wx.EXPAND | wx.BOTTOM, th.SP_MD)
            return

        # Titled: the changes card above has its own header, and an untitled card
        # floating after it read as a second list rather than a section.
        card = Card(self.scroll, "Repository", self.pal)

        # The branch, first, as a clickable pill: it says which version you have open and
        # is the way to switch. No separate "Switch branch" button, the tag is the control.
        self._add_branch_row(card, git)

        if git.get("ahead") or git.get("behind"):
            card.row(
                "Ahead / behind",
                "%d / %d" % (git["ahead"], git["behind"]),
                mono=True,
            )

        detached = bool(git.get("detached"))
        commit_hash = git.get("last_commit_hash") or ""
        if commit_hash:
            # "Current commit" when parked on one, because that is the question you have
            # when you are there. "Last commit" is the right name only at the tip.
            self._add_commit_row(
                card,
                commit_hash,
                git.get("last_commit") or "",
                prism,
                label="Current commit" if detached else "Last commit",
            )

        # The tip of the branch, when we are not on it. Two rows that differ say "you are
        # behind" on their own; a sentence explaining it would be saying the same thing
        # twice.
        tip = git.get("tip_commit_hash") or ""
        if detached and tip and tip != commit_hash:
            self._add_commit_row(
                card,
                tip,
                git.get("tip_commit") or "",
                prism,
                label="Latest commit",
                icon="commit_tip",
            )

        self._add_pull_row(card, git)
        self._add_sync_row(card, git)

        self.content.Add(card, 0, wx.EXPAND | wx.BOTTOM, th.SP_MD)

        self._render_gitignore()

    def _switch_branch(self):
        """Pick a branch and check it out, respecting the uncommitted-work guard."""
        project = (self.data or {}).get("project")
        if not project or not project.get("repo_root"):
            return
        repo = project["repo_root"]
        listed = self.git.switch_choices(repo)
        if listed.kind == git_workflow.FAILED:
            prompts.tell(self, listed.error, "Prism")
            return
        if listed.kind == git_workflow.NOTHING:
            prompts.tell(self, "No other branches to switch to.", "Prism")
            return

        index = self._pick_branch([label for label, _ref in listed.choices])
        if index is None:
            return
        self._do_switch(repo, listed.choices[index][1])

    def _pick_branch(self, choices):
        """A branch picker wide enough to read a branch name in.

        wx.GetSingleChoice sizes itself to the text and cannot be resized, so anything
        like feature/long-descriptive-name was clipped in a narrow column.
        """
        return prompts.ask_choice(
            self, "Switch to which branch?", "Switch branch", choices
        )

    def _do_switch(self, repo, ref):
        """Switch to `ref` safely: settle any uncommitted work first, then check out.

        The tree has to be clean (or stashed) before anything moves, so that is asked
        and done here; _switch_now handles the board being open.
        """
        # Dry run: can we switch, or is the tree dirty? checkout_status is read-only.
        ready = self.git.switch_preflight(repo, ref)
        if ready.kind == git_workflow.NEEDS_SETTLE:
            if not self._resolve_before_switch(repo, ready.error):
                return  # user cancelled or it failed
        elif not ready.ok:
            prompts.tell(self, ready.error, "Prism")
            return

        self._switch_now(repo, ref)

    def _resolve_before_switch(self, repo, why):
        """Ask what to do with the uncommitted changes before switching.

        Commit, stash, or discard, in git's own terms, no euphemisms. Returns which
        action was taken ("commit", "stash", "discard") so the caller can tell the agent
        how the user settled things, or "" if they cancelled or it failed.

        Doing any of these while KiCad is open is safe: none of them opens a different
        board, they only settle the changes already in the tree.
        """
        choices = ["Commit", "Stash", "Discard"]
        index = prompts.ask_choice(
            self,
            "%s\n\nWhat do you want to do with them before switching?" % why,
            "Uncommitted changes",
            choices,
        )
        if index is None:
            return ""  # Cancel
        picked = choices[index]

        try:
            if picked == "Commit":
                return "commit" if self._commit_before_switch(repo) else ""
            if picked == "Stash":
                with wx.BusyCursor():
                    message = prompts.ask_text(self, "Stash message:", "Stash")
                    if message is None:
                        return ""  # cancelled at the message, not at the choice
                    AgentClient().stash(repo, message.strip())
                return "stash"
            if picked == "Discard":
                if not prompts.ask(
                    self,
                    "Discard all uncommitted changes? This cannot be undone.",
                    "Discard",
                    yes="Discard",
                    destructive=True,
                ):
                    return ""
                with wx.BusyCursor():
                    AgentClient().discard(repo)
                return "discard"
        except AgentUnavailable as exc:
            prompts.tell(self, str(exc), "Prism")
            return ""
        return ""

    def _commit_before_switch(self, repo):
        """Commit all design work with a message, so the switch can proceed."""
        message = prompts.ask_text(self, "Commit message:", "Commit")
        if not message or not message.strip():
            return False
        with wx.BusyCursor():
            committed = self.git.commit(repo, message.strip())
        if committed.kind == git_workflow.NEEDS_BRANCH:
            self._commit_on_new_branch(repo, message.strip())
            # After creating a branch and committing, the tree is clean, but we are
            # now on a different branch than the switch target, so re-checking is the
            # honest thing. Treat as resolved; the caller re-runs the dry run.
            return True
        if not committed.ok:
            prompts.tell(self, committed.error, "Prism")
            return False
        return True

    def _switch_now(self, repo, ref):
        """Check out `ref`.

        KiCad stays open. The hazard was never KiCad itself, only its in-memory copy of
        the board being written back on the next save, and closing the board releases
        that. The editors are DLLs inside kicad.exe rather than processes of their own,
        so there was never an editor pid to wait on either.

        This replaced a flow that closed KiCad entirely and reopened the project after
        the checkout: a full restart to avoid one stale buffer.

        No confirmation here. Picking a branch IS the instruction, and where there was
        uncommitted work the user has just answered for it; asking again afterwards
        made the common case two dialogs for one decision. The caution that prompt
        carried is in the result below instead, where it is still true and costs
        nobody a click.
        """
        with wx.BusyCursor():
            switched = self.git.switch(repo, ref)
        if not switched.ok:
            prompts.tell(self, switched.error, "Prism")
            return

        prompts.tell(self, "Switched to %s.\n\n"
            "Close the board and schematic without saving, then reopen it from "
            "KiCad's project manager." % ref,
            "Prism")
        self._load()

    def _add_sync_row(self, card, git):
        """Fetch and push. Push shows only when there is something to push and it is safe.

        Push is hidden when the branch has diverged: the pull row explains that it needs
        a merge, and offering Push there would invite a force the agent refuses anyway.
        Fetch is always safe (it touches no files), so it is always offered on a branch
        with an upstream.
        """
        git = git or {}
        if git.get("detached"):
            return  # nothing to push from a detached HEAD; fetch alone isn't worth a row
        ahead = git.get("ahead") or 0
        behind = git.get("behind") or 0

        row = wx.BoxSizer(wx.HORIZONTAL)
        row.Add(
            IconButton(
                card, "fetch", self.pal,
                tooltip="Fetch from the remote",
                variant="secondary",
                on_click=self._fetch,
            ),
            0,
            wx.RIGHT,
            th.SP_XS,
        )
        # Pull, beside Fetch, only when there is something to pull and the branch has
        # not diverged. A diverged branch needs a merge, and _add_pull_row explains
        # that; pulling there would be a textual merge of a board, which is the one
        # thing this must never do.
        if behind and not ahead:
            row.Add(
                IconButton(
                    card, "pull", self.pal,
                    tooltip="Pull %d commit%s from the remote"
                    % (behind, "" if behind == 1 else "s"),
                    variant="secondary",
                    on_click=self._pull,
                ),
                0,
                wx.ALIGN_CENTER_VERTICAL,
            )
            row.Add(
                Badge(card, str(behind), self.pal, tone="primary"),
                0,
                wx.ALIGN_CENTER_VERTICAL | wx.RIGHT,
                th.SP_SM,
            )
        else:
            row.AddSpacer(th.SP_XS)

        # Stashes, when there are any. Opens the list rather than rendering it: it is
        # consulted occasionally, and a permanent card for it pushed the everyday
        # controls down the dialog for something most repos do not have.
        stashed = self._stash_entries()
        if stashed:
            row.Add(
                IconButton(
                    card, "stash", self.pal,
                    tooltip="Stashed changes",
                    variant="secondary",
                    on_click=self._open_stashes,
                    count=len(stashed),
                ),
                0,
                wx.ALIGN_CENTER_VERTICAL | wx.RIGHT,
                th.SP_SM,
            )

        # The push/publish button right-aligns: it is this row's primary action
        # and belongs at the far end, like a form's submit.
        row.AddStretchSpacer()

        # Push only when ahead and NOT diverged (diverged needs a merge first).
        if ahead and not behind:
            row.Add(
                Button(
                    card,
                    "Push %d commit%s" % (ahead, "" if ahead == 1 else "s"),
                    self.pal,
                    variant="primary",
                    on_click=self._push,
                ),
                0,
            )
        elif not git.get("has_upstream"):
            # A branch that has never been pushed reports ahead == 0, because there is
            # no upstream to count against, which looked exactly like "nothing to
            # push" and hid this button. So it gets its own: the work is real, it
            # exists nowhere else, and this is the only way to get it off the machine.
            unpublished = git.get("unpublished") or 0
            label = (
                "Publish %d commit%s" % (unpublished, "" if unpublished == 1 else "s")
                if unpublished
                else "Publish branch"
            )
            row.Add(
                Button(card, label, self.pal, variant="primary", on_click=self._push),
                0,
            )
        card.body.Add(row, 0, wx.TOP, th.SP_XS)

    def _fetch(self):
        project = (self.data or {}).get("project")
        if not project or not project.get("repo_root"):
            return
        with wx.BusyCursor():
            fetched = self.git.fetch(project["repo_root"])
        if not fetched.ok:
            prompts.tell(self, fetched.error, "Prism")
            return
        self._load()

    def _push(self):
        """Push the current branch, publishing it first if it has no remote yet.

        A branch that already tracks a remote goes straight out: git knows where, and a
        dialog whose answer is the same every time is one people learn to dismiss. The
        question is only asked when it is real, which is the branch that has never been
        pushed.
        """
        project = (self.data or {}).get("project")
        if not project or not project.get("repo_root"):
            return
        repo = project["repo_root"]
        with wx.BusyCursor():
            pushed = self.git.push(repo)
        if pushed.kind == git_workflow.NEEDS_REMOTE:
            target = self._ask_push_target(pushed.remotes)
            if not target:
                return
            with wx.BusyCursor():
                pushed = self.git.publish(repo, target)
        if pushed.kind == git_workflow.NO_REMOTE:
            prompts.tell(self, "This project has no remote to push to.\n\n"
                "Add one with `git remote add`, then push again.",
                "Prism")
            return
        if not pushed.ok:
            prompts.tell(self, pushed.error, "Prism")
            return
        self._load()

    def _ask_push_target(self, remotes):
        """Ask WHERE to publish a branch that has never been pushed.

        The choice is real here in a way it never is for an ordinary push: nothing has
        decided yet, and a repo with both `origin` and `upstream` (the fork layout) would
        otherwise have the destination guessed for it. Returns the remote, or "".
        """
        if len(remotes) == 1:
            target = remotes[0].name
            if not prompts.ask(
                self,
                "This branch hasn't been pushed yet.\n\nPublish it to %s?" % target,
                "Publish branch",
                yes="Publish",
            ):
                return ""
            return target
        # remotes() puts origin first, so the default selection is the convention.
        choices = ["%s  (%s)" % (r.name, r.url) for r in remotes]
        index = prompts.ask_choice(
            self, "Publish this branch to which remote?", "Publish branch", choices
        )
        return "" if index is None else remotes[index].name

    def _render_gitignore(self):
        """Offer a KiCad .gitignore to a project that has not got one.

        Shown only when it would actually silence something. A project that was imported
        rather than published never got one, and then git reports KiCad's caches, locks
        and backups as uncommitted work forever: "you have uncommitted changes" stops
        meaning anything, and so does "discard my changes".
        """
        project = (self.data or {}).get("project")
        if not project:
            return

        # From the payload, not fetched here: this runs on every render, and _rebuild
        # re-renders on every collapse/expand, so a fetch would block the KiCad UI
        # thread each time a section is toggled.
        state = self._gitignore or {}
        if not state.get("is_repo") or state.get("has_gitignore"):
            return

        would = state.get("would_ignore") or []
        tracked = state.get("already_tracked") or []
        if not would and not tracked:
            return  # nothing to gain; do not nag

        card = Card(self.scroll, "Generated files", self.pal)
        card.body.Add(
            card.label(
                "%d file(s) KiCad regenerates are showing as uncommitted." % len(would),
                tone="muted_fg",
                small=True,
            ),
            0,
            wx.BOTTOM,
            th.SP_XS,
        )

        if tracked:
            # An ignore rule does nothing for a file git already tracks. Saying "added,
            # you're all set" while a committed .kicad_prl keeps appearing would be a
            # small lie, and untracking it would reverse a decision somebody made.
            card.body.Add(
                card.label(
                    "%d are already committed, so they'll keep showing: %s"
                    % (len(tracked), ", ".join(tracked[:2])),
                    tone="muted_fg",
                    small=True,
                ),
                0,
                wx.BOTTOM,
                th.SP_SM,
            )

        card.body.Add(
            Button(
                card,
                "Add .gitignore",
                self.pal,
                variant="secondary",
                on_click=lambda: self._add_gitignore(project, would),
            ),
            0,
        )
        self.content.Add(card, 0, wx.EXPAND | wx.BOTTOM, th.SP_MD)

    def _add_gitignore(self, project, would):
        """Write it, after saying what it will do."""
        if not prompts.ask(
            self,
            "Add a KiCad .gitignore to this project?\n\n"
            "%d generated file(s) will stop being reported. Nothing is committed "
            "and nothing on disk is deleted." % len(would),
            "Add .gitignore",
            yes="Add",
        ):
            return

        try:
            with wx.BusyCursor():
                result = AgentClient().add_gitignore(project["path"])
        except AgentUnavailable as exc:
            prompts.tell(self, str(exc), "Prism")
            return

        # It is not committed. Say so, rather than letting the user assume it is done
        # and wonder why their colleague still sees the noise.
        note = "Added .gitignore. %d file(s) will stop being reported." % len(
            result.get("silenced") or []
        )
        if result.get("still_tracked"):
            note += (
                "\n\n%d file(s) are already committed, so they'll keep showing. "
                "Untracking those is up to you." % len(result["still_tracked"])
            )
        note += "\n\nCommit it when you're ready."
        prompts.tell(self, note, "Prism")
        self._load()

    def _stash_entries(self):
        """The repo's stashes, as of the last load.

        Read from the payload rather than fetched here: this is called from the render
        path, and _rebuild re-renders on every collapse/expand, so a fetch would put a
        blocking round-trip on the UI thread each time a section is toggled. Every
        action that changes the list calls _load, so the count cannot go stale without
        a refresh that fixes it.
        """
        return list(self._stashes or [])

    def _open_stashes(self):
        """The stash list, on demand.

        A modal rather than a card in the scroll: stashes are consulted occasionally,
        and a permanent section for them pushed the everyday controls further down the
        dialog for something most people do not have.
        """
        entries = self._stash_entries()
        if not entries:
            prompts.tell(self, "There is nothing stashed.", "Prism")
            return

        dlg = StashesDialog(self, entries, self.pal)
        try:
            dlg.ShowModal()
            action, entry = dlg.result
        finally:
            dlg.Destroy()

        if not action:
            return
        if action == "pop":
            self._apply_stash(entry)
        elif action == "apply":
            self._apply_stash_keep(entry)
        elif action == "drop":
            self._drop_stash(entry)

    def _discard(self):
        """Throw away uncommitted changes. The one unrecoverable action in this panel.

        Two things make this different from Stash, and both are said in the dialog
        rather than assumed:

        * It cannot be undone. A stash can be fished back out; a discarded edit to a
          board is gone the moment this runs.

        * KiCad has the board in memory. Reverting the file on disk does not reach
          that copy, so the next save in KiCad would write the discarded work straight
          back. pcbnew has no API to make it re-read the board, so the user is told to
          close and reopen it, which is the only thing that actually works.
        """
        project = (self.data or {}).get("project")
        if not project:
            return

        design = [f for f in (self.changes or []) if not f.get("noise")]
        count = len(design) or len(self.changes or [])
        if not count:
            return

        if not prompts.ask(
            self,
            "Discard %d file%s?\n\n"
            "This cannot be undone.\n\n"
            "KiCad still has the board open, so close it WITHOUT saving and reopen it "
            "afterwards. Saving would write the discarded changes back."
            % (count, "" if count == 1 else "s"),
            "Discard changes",
            yes="Discard",
            destructive=True,
        ):
            return

        try:
            with wx.BusyCursor():
                result = AgentClient().discard(project["path"])
        except AgentUnavailable as exc:
            prompts.tell(self, str(exc), "Prism")
            return

        discarded = (result or {}).get("count") or count
        prompts.tell(self, "Discarded %d file%s.\n\n"
            "Close KiCad without saving and reopen the board to see it."
            % (discarded, "" if discarded == 1 else "s"),
            "Prism")
        self._load()

    def _stash(self):
        """Set the working tree aside, under a name the user chose.

        The message is the point, so this goes through the same prompt the switch guard
        uses rather than stashing silently: an unnamed stash is one nobody restores.
        """
        project = (self.data or {}).get("project")
        if not project:
            return

        design = [f for f in (self.changes or []) if not f.get("noise")]
        count = len(design) or len(self.changes or [])
        message = self._ask_stash_message(
            "%d file%s will be set aside." % (count, "" if count == 1 else "s")
        )
        if message is None:
            return  # cancelled

        try:
            with wx.BusyCursor():
                AgentClient().stash(project["path"], message)
        except AgentUnavailable as exc:
            prompts.tell(self, str(exc), "Prism")
            return
        self._load()

    def _drop_stash(self, entry):
        """Throw a stash away. The confirmation IS the safety mechanism here.

        Everything else in this dialog refuses to destroy work. This is the one place the
        user can ask us to, so the question has to name what goes, and No has to be the
        default: a reflex Enter on a dialog you did not read must not delete a board.
        """
        project = (self.data or {}).get("project")
        if not project:
            return

        if not prompts.ask(
            self,
            "Discard “%s”?\n\nThese changes will be gone. This can't be undone from "
            "Prism." % (entry["message"] or "your changes"),
            "Discard changes",
            yes="Discard",
            destructive=True,
        ):
            return

        try:
            with wx.BusyCursor():
                result = AgentClient().drop_stash(project["path"], entry["ref"])
        except AgentUnavailable as exc:
            prompts.tell(self, str(exc), "Prism")
            return

        # Say what went, and hand over the escape hatch. Git keeps the commit until it
        # garbage-collects, so this is genuinely recoverable for a while, and a user who
        # has just realised their mistake deserves to know that rather than be told
        # "Discarded." and left with nothing.
        files = result.get("files") or []
        note = "Discarded %d file(s)." % len(files) if files else "Discarded."
        sha = result.get("sha") or ""
        if sha:
            note += (
                "\n\nIf that was a mistake, it can still be recovered for a while:"
                "\n    git stash apply %s" % sha[:12]
            )
        prompts.tell(self, note, "Prism")
        self._load()

    def _apply_stash(self, entry):
        project = (self.data or {}).get("project")
        if not project:
            return
        try:
            with wx.BusyCursor():
                AgentClient().apply_stash(project["path"], entry["ref"])
        except AgentUnavailable as exc:
            # The agent refuses rather than forcing a conflict, and it says why. A stash
            # that fails to apply is still in the list, so nothing is lost.
            prompts.tell(self, str(exc), "Prism")
            return

        prompts.tell(self, "Restored “%s” and removed it from the stash list."
            "\n\nReopen the board in KiCad to see it."
            % (entry["message"] or "your changes"),
            "Prism")
        self._load()

    def _apply_stash_keep(self, entry):
        """Restore a stash and leave it in the list.

        The same shape as _apply_stash but the other verb, so the message has to say
        which happened: the two are indistinguishable from the board alone, and the
        difference only shows up later when the stash is or is not still there.
        """
        project = (self.data or {}).get("project")
        if not project:
            return
        try:
            with wx.BusyCursor():
                AgentClient().apply_stash_keep(project["path"], entry["ref"])
        except AgentUnavailable as exc:
            prompts.tell(self, str(exc), "Prism")
            return

        prompts.tell(self, "Restored “%s”. It is still in the stash list."
            "\n\nReopen the board in KiCad to see it."
            % (entry["message"] or "your changes"),
            "Prism")
        self._load()

    def _add_pull_row(self, card, git):
        """The diverged case, which is the one that needs explaining.

        A plain pull is an icon button beside Fetch in the sync row. This handles the
        situation that button deliberately refuses: both sides have moved on, where
        pulling would mean a textual merge of a board. That merge has to happen outside
        Prism for now.
        """
        behind = git.get("behind") or 0
        ahead = git.get("ahead") or 0
        if not (ahead and behind):
            return
        card.body.Add(
            card.label(
                "This branch and the remote have both moved on "
                "(%d here, %d there). Merge them with git before pulling."
                % (ahead, behind),
                tone="warning",
                small=True,
            ),
            0,
            wx.TOP,
            th.SP_XS,
        )

    def _pull(self):
        """Fast-forward the working tree. The agent refuses anything riskier."""
        project = (self.data or {}).get("project")
        if not project:
            return

        git = (self.data or {}).get("git") or {}

        # Uncommitted work blocks a pull. Rather than refusing and leaving the user to go
        # and fix it by hand, offer to put it aside, and ask what to call it: a stash you
        # cannot identify is a stash you will never restore.
        #
        # Gated on `dirty`, not `dirty_by_you`: git blocks on a lock file as readily as
        # on a board, so this has to fire whenever git would refuse. But the wording says
        # how many are actually the user's, because "you have uncommitted changes" about
        # a regenerated cache is crying wolf.
        stash_message = None
        if git.get("dirty"):
            yours = len(git.get("yours") or [])
            what = (
                "You have %d uncommitted file(s)." % yours
                if yours
                else "Some generated files are in the way."
            )
            stash_message = self._ask_stash_message(
                "%s The pull can't run until they're out of the way.\n\n"
                "Prism can stash them and restore them after the pull." % what
            )
            if stash_message is None:
                return  # they said no

        try:
            with wx.BusyCursor():
                result = AgentClient().pull(project["path"], stash_message)
        except AgentUnavailable as exc:
            prompts.tell(self, str(exc), "Prism")
            return

        note = result.get("message", "Done.")
        stashed = result.get("stashed")
        if stashed:
            # Tell them where their work went, and that getting it back is one click.
            # Work that vanishes with no explanation is work the user thinks they lost.
            note += (
                "\n\nYour changes are stashed as “%s”. Apply the stash to "
                "restore them." % stashed["message"]
            )

        # The board on disk has changed under KiCad, which will not know. Saying so is
        # the difference between a confusing stale view and an understood one.
        prompts.tell(self, "%s\n\nReopen the board in KiCad to see the updated version." % note,
            "Prism")
        self._load()

    def _ask_stash_message(self, why):
        """Confirm a stash, and get a name for it. None if the user declines.

        The message is the point. Git's own default is "WIP on main: a1b2c3d", which says
        nothing about what is in it, and after two of them nobody knows which board they
        were half way through editing.
        """
        value = prompts.ask_text(
            self, why + "\n\nWhat were you working on?", "Set changes aside"
        )
        # None (cancelled) is passed straight through: the caller distinguishes it from
        # an empty message, which is a valid answer.
        return None if value is None else value.strip()

    def _add_commit_row(
        self, card, commit_hash, subject, prism, label="Last commit", icon="commit"
    ):
        """The commit you are on: SHA in a tag, subject beside it, the pair a link into
        Prism.

        Only a link when Prism actually knows the project. A link that lands on a 404 is
        worse than plain text.
        """
        # A commit icon rather than the words, with the sha and subject hard left. The
        # label still distinguishes last/current/latest, so it becomes the tooltip
        # rather than being dropped. While detached two of these rows sit together, so
        # they take different icons: a tooltip only tells you which is which once you
        # have gone looking.
        row = wx.BoxSizer(wx.HORIZONTAL)
        row.Add(
            StatusIcon(card, icon, self.pal, tone="muted_fg", tooltip=label),
            0,
            wx.ALIGN_CENTER_VERTICAL | wx.RIGHT,
            th.SP_XS,
        )

        sha = Badge(card, commit_hash, self.pal, tone="muted")
        row.Add(sha, 0, wx.ALIGN_CENTER_VERTICAL)

        if subject:
            if prism:
                # Plain text that tints on hover, not an underlined native
                # hyperlink: the underline read as a browser link pasted into
                # the panel, and the web UI's text links never underline.
                text = LinkLabel(
                    card,
                    subject,
                    self.pal,
                    on_click=lambda h=commit_hash, p=prism: self._open_commit(p, h),
                )
                text.SetToolTip("Open this commit in Prism")
                # The tag is part of the link: clicking the SHA is the obvious gesture,
                # and having it do nothing would be a small betrayal.
                sha.SetToolTip("Open this commit in Prism")
                sha.SetCursor(wx.Cursor(wx.CURSOR_HAND))
                sha.Bind(
                    wx.EVT_LEFT_UP,
                    lambda _e, h=commit_hash, p=prism: self._open_commit(p, h),
                )
            else:
                text = card.label(subject)

            f = text.GetFont()
            f.SetPointSize(th.FONT_SMALL)
            text.SetFont(f)
            row.Add(text, 0, wx.ALIGN_CENTER_VERTICAL | wx.LEFT, th.SP_SM)

        row.AddStretchSpacer()
        card.body.Add(row, 0, wx.EXPAND | wx.BOTTOM, th.SP_SM)

    def _open_commit(self, prism, commit_hash):
        """Open this commit on the project's page in Prism, in its own branch.

        The branch matters: the page lists the history of whichever branch it is
        showing, and without one it shows the server checkout's. A commit from any
        other branch was then selected in a history that does not contain it.

        On a detached HEAD there is no current branch, so the first branch that
        contains the commit is used. That is what the panel already shows as where the
        commit lives, so the page and the panel agree.
        """
        git = (self.data or {}).get("git") or {}
        branch = git.get("branch") or ""
        if not branch:
            on = git.get("on_branches") or []
            branch = on[0] if on else ""
        try:
            AgentClient().open_in_prism(
                prism.get("id"), commit=commit_hash, branch=branch
            )
        except AgentUnavailable as exc:
            prompts.tell(self, str(exc), "Prism")

    # -- uncommitted changes -----------------------------------------------

    def _render_changes(self):
        """What you've changed but not committed.

        One collapsible "Uncommitted changes" section holding a compact row per
        board/schematic, each of which expands into its own item-level changes.
        Same grouping the web UI applies to a commit, but these changes exist only
        on disk, so the web app cannot show them at all.
        """
        # Untitled card: the disclosure below *is* the heading, so a separate
        # "UNCOMMITTED CHANGES" caption above it would just say it twice.
        card = Card(self.scroll, "", self.pal)

        if self.changes is _CHANGES_LOADING:
            # The diff is still being computed in the background; the rest of the
            # dialog is already up. Say so rather than looking empty or broken.
            card.row("Uncommitted changes", "Computing…", tone="muted_fg")
            self.content.Add(card, 0, wx.EXPAND | wx.BOTTOM, th.SP_MD)
            return

        if self.changes is None:
            card.row("Uncommitted changes", "Couldn't read", tone="muted_fg")
            self.content.Add(card, 0, wx.EXPAND | wx.BOTTOM, th.SP_MD)
            return

        if not self.changes:
            card.row(
                "Uncommitted changes", "Nothing to commit", badge=True, tone="success"
            )
            self.content.Add(card, 0, wx.EXPAND | wx.BOTTOM, th.SP_MD)
            return

        # KiCad's own droppings (backup archives, -bak files, autosaves, caches) are
        # kept separate. They're not hidden, a file that silently vanishes from a
        # change list is a lie about the state of your repo, but they don't get to
        # drown the design work, and there can be dozens of them per real edit.
        design = [f for f in self.changes if not f.get("noise")]
        noise = [f for f in self.changes if f.get("noise")]

        total = sum(len(f.get("groups") or []) or 1 for f in design)

        def toggle_section(is_open):
            self.section_open = is_open
            self._rebuild()

        card.body.Add(
            Disclosure(
                card,
                self.pal,
                "Uncommitted changes",
                toggle_section,
                expanded=self.section_open,
                count=total,
                strong=True,
            ),
            0,
            wx.EXPAND,
        )

        if self.section_open:
            for f in design:
                self._add_file(card, f)

        if noise:
            self._add_noise(card, noise)

        # Staging controls and the commit box, whenever there is anything at all to
        # commit. This used to require a DESIGN change, so on a tree whose only changes
        # were KiCad's own generated files, expanding that section showed the files and
        # no way to act on them: the controls were not scrolled out of view, they were
        # never built. Churn is still excluded from "Stage all" and still folded away by
        # default; deciding to commit one is the user's call, and the panel now lets
        # them follow through on it.
        if design or noise or self._staged_paths():
            # The file rows carry only a hairline gap between them, which is right
            # within the list and too tight against what follows: the last filename
            # sat almost on the Stage button. Separate the list from the controls.
            card.body.AddSpacer(th.SP_SM)
            card.rule()  # the change list above, what you are committing below
            self._add_staging(card, has_design=bool(design))
            self._add_commit_box(card, has_design=bool(design))

        self.content.Add(card, 0, wx.EXPAND | wx.BOTTOM, th.SP_MD)

    def _staged_paths(self):
        """Files currently staged, from the git status the dialog already fetched."""
        return list(((self.data or {}).get("git") or {}).get("staged") or [])

    def _add_staging(self, card, has_design=True):
        """Stage / unstage controls: what goes into the next commit.

        Lists what is staged, then the bulk actions. "Stage all" means all DESIGN
        changes, never KiCad's churn, that is the whole point, so it is only offered
        when there is design work for it to stage. Per-file staging lives on each file
        row (via _add_file); this is the summary and the bulk controls.
        """
        staged = self._staged_paths()
        # Only when there is something staged: a "Staged:" heading over nothing is a
        # label explaining its own emptiness.
        if staged:
            # A section caption, same style as the card headings: the staged list
            # under it is indented, which is how it reads as a sub-list.
            card.body.Add(
                card.label("Staged", tone="muted_fg", small=True, bold=True),
                0,
                wx.TOP,
                th.SP_SM,
            )
            # The files themselves, not a count. "3 files staged" told you the number
            # and left you to work out which three; the commit is about to include
            # exactly these, so they are worth the space.
            for path in staged:
                line = wx.BoxSizer(wx.HORIZONTAL)
                line.Add(
                    card.label(path, tone="foreground", small=True, mono=True),
                    1,
                    wx.ALIGN_CENTER_VERTICAL,
                )
                line.Add(
                    Button(
                        card, "Unstage", self.pal, variant="secondary", size="sm",
                        on_click=lambda p=path: self._unstage_paths([p]),
                    ),
                    0,
                    wx.ALIGN_CENTER_VERTICAL,
                )
                card.body.Add(line, 0, wx.EXPAND | wx.LEFT, th.SP_MD)

        row = wx.BoxSizer(wx.HORIZONTAL)
        # Outlined, not ghost: a ghost button is invisible until hovered, and this is
        # the control most people are looking for in this card. Hidden when there is no
        # design work, since it stages only design files and would refuse outright.
        # Compact ("sm"), like the per-file toggles above: a full-height button in
        # this row read as a second tier of primary actions.
        if has_design:
            row.Add(
                Button(card, "Stage all", self.pal, variant="secondary", size="sm",
                       on_click=self._stage_all),
                0,
                wx.RIGHT,
                th.SP_XS,
            )
        if staged:
            row.Add(
                Button(card, "Unstage all", self.pal, variant="secondary", size="sm",
                       on_click=self._unstage_all),
                0,
                wx.RIGHT,
                th.SP_XS,
            )
        # Set the whole lot aside. Staged or not: the mental model is "put my work
        # away", and a stash that took only half of it would leave the tree in a state
        # nobody asked for.
        row.Add(
            Button(card, "Stash", self.pal, variant="secondary", size="sm",
                   on_click=self._stash),
            0,
            wx.RIGHT,
            th.SP_XS,
        )
        # A bin rather than another word: it is the one action here that destroys
        # work, and an icon says that faster than a label in a row of labels. The
        # destructive variant draws it red; the confirmation is what makes it safe.
        row.Add(
            IconButton(
                card, "trash", self.pal,
                tooltip="Discard uncommitted changes",
                variant="destructive-ghost",
                on_click=self._discard,
                size="sm",
            ),
            0,
            wx.ALIGN_CENTER_VERTICAL,
        )
        # Breathing room under the staged list; the buttons sat right on it.
        card.body.Add(row, 0, wx.TOP, th.SP_SM)

    def _stage_all(self):
        self._staging_action(lambda repo: AgentClient().stage(repo, all=True))

    def _unstage_all(self):
        self._staging_action(lambda repo: AgentClient().unstage(repo, all=True))

    def _stage_paths(self, paths):
        self._staging_action(lambda repo: AgentClient().stage(repo, paths=paths))

    def _unstage_paths(self, paths):
        self._staging_action(lambda repo: AgentClient().unstage(repo, paths=paths))

    def _file_stage_button(self, card, path):
        """A per-file stage/unstage toggle, reflecting whether the path is staged now.

        Compact ("sm"): it rides on a change row, and a default-height button
        next to an 18px row made the row look like a billboard.
        """
        if path in set(self._staged_paths()):
            return Button(
                card, "Unstage", self.pal, variant="secondary", size="sm",
                on_click=lambda p=path: self._unstage_paths([p]),
            )
        return Button(
            card, "Stage", self.pal, variant="secondary", size="sm",
            on_click=lambda p=path: self._stage_paths([p]),
        )

    def _staging_action(self, fn):
        """Run a stage/unstage call, then refresh only what staging can change.

        Staging moves files between the index and the working tree. It cannot change
        the agent's health, the server's reachability, or the contents of the diff, so
        calling _load() here re-fetched all of that and re-ran the whole render for a
        checkbox: the panel visibly reloaded on every stage click.

        Only the git status is re-read, and the panel is rebuilt from data already in
        hand. _rebuild is frozen, so the update is a single repaint.
        """
        project = (self.data or {}).get("project")
        if not project or not project.get("repo_root"):
            return
        try:
            with wx.BusyCursor():
                fn(project["repo_root"])
                fresh = AgentClient().project(self.board_path)
        except AgentUnavailable as exc:
            prompts.tell(self, str(exc), "Prism")
            return

        # Keep everything else (including the diff we already computed) and swap in the
        # new git status, which is the only part staging affects.
        if fresh and self.data:
            self.data["git"] = fresh.get("git") or {}
        self._rebuild()

    def _add_commit_box(self, card, has_design=True):
        """A message field and the commit button beneath the uncommitted changes.

        One button, because there is only one intent: commit what this panel says will
        be committed. Two buttons ("Commit staged" beside a "Commit" that staged
        everything first) meant the second silently overrode the staging the user had
        just done, which was a trap rather than a shortcut. When nothing is staged the
        button falls back to staging every design change, so the quick path still works.
        A detached HEAD is handled by the agent, which refuses and prompts to make a
        branch first.
        """
        # SP_MD above the label separates the commit box from the staging controls;
        # they are two different steps and were running together.
        card.body.Add(
            card.label("Commit message", tone="muted_fg", small=True),
            0,
            wx.TOP,
            th.SP_MD,
        )
        # The field: control height, bordered, with a placeholder and real inner
        # padding. wx.TextCtrl cannot be owner-drawn the way the buttons are, but
        # BORDER_SIMPLE plus the muted fill and a themed border gives it the same
        # shape as the rest of the panel instead of the raw native sunken box.
        self.commit_message = wx.TextCtrl(
            card,
            value="",
            size=wx.Size(-1, self.FromDIP(th.CONTROL_HEIGHT)),
            style=wx.BORDER_SIMPLE,
        )
        self.commit_message.SetBackgroundColour(_c(self.pal["muted"]))
        self.commit_message.SetForegroundColour(_c(self.pal["foreground"]))
        f = self.commit_message.GetFont()
        f.SetPointSize(th.FONT_BODY)
        self.commit_message.SetFont(f)
        # Clear of the label above, so the caption and the field do not read as one
        # smudged block the way they did when the box sat directly on the text.
        card.body.Add(
            self.commit_message,
            0,
            wx.EXPAND | wx.TOP,
            th.SP_SM,
        )

        # One button, because there is only one intent: commit what this panel says
        # will be committed. Two buttons ("Commit staged" beside a "Commit" that staged
        # everything first) meant the second silently overrode the staging the user had
        # just done, which is a trap rather than a shortcut. When nothing is staged it
        # falls back to staging every design change, so the quick path still works.
        staged = self._staged_paths()
        label = (
            "Commit %d file%s" % (len(staged), "" if len(staged) == 1 else "s")
            if staged
            else "Commit all changes"
        )
        row = wx.BoxSizer(wx.HORIZONTAL)
        button = Button(
            card, label, self.pal, variant="primary",
            on_click=lambda: self._commit(staged_only=bool(staged)),
        )
        # With nothing staged the button stages every design change first, so on a tree
        # holding only KiCad's churn it would have nothing to stage and the agent would
        # refuse. Say so up front instead of letting the click fail.
        if not staged and not has_design:
            button.Enable(False)
            button.SetToolTip("Stage a file first: there are no design changes to commit.")
        row.Add(button, 0)
        card.body.Add(row, 0, wx.TOP, th.SP_SM)

    def _commit(self, staged_only=False):
        """Commit. `staged_only` commits exactly what is staged; otherwise all design work.

        The agent refuses a detached commit; rather than dead-end the user, we offer to
        create a branch here (git's own remedy) and then commit onto it.
        """
        project = (self.data or {}).get("project")
        if not project or not project.get("repo_root"):
            return
        message = self.commit_message.GetValue().strip()
        if not message:
            prompts.tell(self, "A commit needs a message.", "Prism")
            return

        repo = project["repo_root"]
        with wx.BusyCursor():
            committed = self.git.commit(repo, message, staged_only=staged_only)
        if committed.kind == git_workflow.NEEDS_BRANCH:
            self._commit_on_new_branch(repo, message, staged_only=staged_only)
            return
        if not committed.ok:
            prompts.tell(self, committed.error, "Prism")
            return

        self._load()

    def _commit_on_new_branch(self, repo, message, staged_only=False):
        """Offer to name a branch for a commit that would otherwise be detached."""
        name = prompts.ask_text(
            self,
            "You're on a detached commit, so this would not be on any branch.\n\n"
            "Name a branch to keep it on:",
            "Create a branch",
        )
        if not name or not name.strip():
            return
        branch = name.strip()
        with wx.BusyCursor():
            committed = self.git.commit_on_new_branch(
                repo, branch, message, staged_only=staged_only
            )
        if not committed.ok:
            prompts.tell(self, committed.error, "Prism")
            return
        # After the commit, so what gets published is the work, not an empty branch.
        self._publish_new_branch(repo, branch)
        self._load()

    def _add_noise(self, card, noise):
        """KiCad's generated files, folded away behind a count.

        Worth surfacing at all because the honest fix is a .gitignore entry: these
        shouldn't be committed, and seeing them here is how you find out they are.
        """

        def toggle(is_open):
            self.noise_open = is_open
            self._rebuild()

        # A rule above it: KiCad's churn is a different subject from the user's own
        # changes listed above, and without a break the two ran together.
        card.rule()
        card.body.Add(
            Disclosure(
                card,
                self.pal,
                "KiCad backups & generated files",
                toggle,
                expanded=self.noise_open,
                count=len(noise),
            ),
            0,
            wx.EXPAND,
        )

        if not self.noise_open:
            return

        staged = set(self._staged_paths())
        for f in noise:
            status = f.get("status", "modified")
            path = f["path"]
            line = wx.BoxSizer(wx.HORIZONTAL)
            line.Add(
                ChangeRow(
                    card,
                    self.pal,
                    {
                        "kind": status if status in ("added", "removed") else "changed",
                        "label": path,  # full path: shows WHERE the noise is
                        "category_label": status,
                    },
                ),
                1,
                wx.ALIGN_CENTER_VERTICAL,
            )
            # These are excluded by default; let the user commit one deliberately, or
            # take it back out of the commit if they already staged it.
            if path in staged:
                line.Add(
                    Button(
                        card, "Unstage", self.pal, variant="secondary",
                        on_click=lambda p=path: self._unstage_paths([p]),
                    ),
                    0,
                    wx.ALIGN_CENTER_VERTICAL,
                )
            else:
                line.Add(
                    Button(
                        card, "Stage", self.pal, variant="secondary",
                        on_click=lambda p=path: self._stage_paths([p]),
                    ),
                    0,
                    wx.ALIGN_CENTER_VERTICAL,
                )
            card.body.Add(line, 0, wx.EXPAND | wx.LEFT | wx.BOTTOM, th.SP_SM)

        card.body.Add(
            card.label(
                "KiCad regenerates these. They usually belong in .gitignore.",
                tone="muted_fg",
                small=True,
            ),
            0,
            wx.LEFT | wx.TOP,
            th.SP_MD,
        )

    def _add_file(self, card, f):
        path = f["path"]
        groups = f.get("groups") or []
        status = f.get("status", "modified")
        kind = f.get("kind", "other")

        if not groups:
            # No item-level detail to show (a .kicad_pro, an asset, an untracked
            # folder). A plain row beats a disclosure arrow that opens nothing.
            line = wx.BoxSizer(wx.HORIZONTAL)
            line.Add(
                ChangeRow(
                    card,
                    self.pal,
                    {
                        "kind": status if status in ("added", "removed") else "changed",
                        "label": f["filename"],
                        "category_label": status,
                    },
                ),
                1,
                wx.ALIGN_CENTER_VERTICAL,
            )
            line.Add(self._file_stage_button(card, path), 0, wx.ALIGN_CENTER_VERTICAL)
            card.body.Add(line, 0, wx.EXPAND | wx.LEFT | wx.BOTTOM, th.SP_SM)
            return

        holder = wx.BoxSizer(wx.VERTICAL)

        def on_toggle(is_open, _path=path):
            if is_open:
                self.expanded.add(_path)
            else:
                self.expanded.discard(_path)
            self._rebuild()

        count = len(groups)
        head = Disclosure(
            card,
            self.pal,
            f["filename"],
            on_toggle,
            expanded=path in self.expanded,
            # The board/schematic glyph, tinted the blue/emerald the web history
            # list uses, so you can tell what a file is at a glance.
            kind=kind,
            accent=self.pal.get(kind),
            count=count,
        )
        # The disclosure shows WHAT changed; the button beside it stages the whole file.
        head_row = wx.BoxSizer(wx.HORIZONTAL)
        head_row.Add(head, 1, wx.ALIGN_CENTER_VERTICAL | wx.LEFT, th.SP_MD)
        head_row.Add(
            self._file_stage_button(card, path), 0, wx.ALIGN_CENTER_VERTICAL
        )
        holder.Add(head_row, 0, wx.EXPAND)

        if path in self.expanded:
            # Only rows KiCad can actually jump to are clickable. A schematic row
            # gets no hand cursor and no hover, because clicking it could not do
            # anything, better than a row that lies. See crossprobe.py.
            clickable = crossprobe is not None and (
                kind == "pcb"
                or (kind == "sch" and crossprobe.schematic_probe_available())
            )
            for group in groups[:MAX_ROWS_PER_FILE]:
                row_group = dict(group, file_kind=kind)
                holder.Add(
                    ChangeRow(
                        card,
                        self.pal,
                        row_group,
                        on_click=self._on_change_click if clickable else None,
                    ),
                    0,
                    wx.EXPAND | wx.LEFT,
                    th.SP_MD * 2 + 6,
                )
            if count > MAX_ROWS_PER_FILE:
                holder.Add(
                    card.label(
                        "+ %d more..." % (count - MAX_ROWS_PER_FILE),
                        tone="muted_fg",
                        small=True,
                    ),
                    0,
                    wx.LEFT | wx.TOP,
                    th.SP_MD * 2 + 6,
                )

        card.body.Add(holder, 0, wx.EXPAND | wx.BOTTOM, th.SP_SM)

    # -- actions -----------------------------------------------------------

    def _on_change_click(self, group):
        """Jump to the changed item *inside KiCad*, select it and zoom to it.

        Not a link to the web app: you're already in the editor, so the useful
        thing is to land on the item here. See crossprobe.py for why the schematic
        side needs KiCad 9+.
        """
        try:
            crossprobe.probe(
                group.get("file_kind", "other"),
                group.get("item_id", ""),
                self._reference_of(group),
            )
        except crossprobe.ProbeError as exc:
            prompts.tell(self, str(exc), "Prism")
            return
        except Exception as exc:
            # A raw pcbnew/SWIG error here would otherwise crash the plugin and
            # can take KiCad down with it. Cross-probe is a convenience; a failed
            # jump must never be fatal. Report it and stay open.
            prompts.tell(self, "Couldn't jump to that item in KiCad.\n\n%s" % exc,
                "Prism")
            return

        # The item is now selected and centred behind us, and that is all this does.
        #
        # It used to close the dialog to reveal it, which ended the session on the
        # first click: you came back to a panel that had reloaded, lost its expanded
        # sections, and no longer knew which item you had just looked at. Checking
        # several changes in a row meant reopening the plugin each time.
        #
        # probe() calls Refresh(), so the board repaints underneath and the selection
        # is there whenever the dialog is moved or closed. Where the dialog sits is the
        # user's business; nothing here moves it.

    @staticmethod
    def _reference_of(group) -> str:
        """A component reference for the group, when it has one.

        Segments and vias carry no uuid we can resolve (the diff keys them by
        geometry), so a reference is the only fallback that can find them.
        """
        label = group.get("label", "")
        if group.get("category") in ("components", "symbols") and label:
            # Labels look like "J102 (Header)", the reference is the leading token.
            return label.split(" ", 1)[0]
        return ""

    def on_open(self):
        prism = (self.data or {}).get("prism")
        if not prism:
            return
        try:
            AgentClient().open_in_prism(prism["id"])
        except AgentUnavailable as exc:
            prompts.tell(self, str(exc), "Prism")


class StashesDialog(wx.Dialog):
    """The stash list, with the three things you can do to one.

    A modal rather than a card in the main scroll. Stashes are consulted occasionally,
    so a permanent section for them cost every user vertical space for something most
    repos do not have. Here there is also room to say what each button does, which the
    cramped inline row never had.

    Returns via `self.result`: (action, entry), or (None, None) if the user just closed
    it. The caller performs the action, because it owns the refresh and the error
    reporting that every one of them needs.
    """

    def __init__(self, parent, entries, pal):
        super().__init__(
            parent,
            title="Stashed changes",
            style=wx.DEFAULT_DIALOG_STYLE | wx.RESIZE_BORDER,
        )
        self.pal = pal
        self.SetFont(ui_font(self))
        self.result = (None, None)

        self.SetBackgroundColour(_c(pal["background"]))

        outer = wx.BoxSizer(wx.VERTICAL)

        # Scrolled, because a repo can accumulate a lot of these and a dialog that
        # silently shows the first few is how a stash gets forgotten.
        scroll = wx.ScrolledWindow(self, style=wx.VSCROLL)
        scroll.SetBackgroundColour(_c(pal["background"]))
        scroll.SetScrollRate(0, 12)
        body = wx.BoxSizer(wx.VERTICAL)

        for entry in entries:
            body.Add(self._entry_card(scroll, entry), 0, wx.EXPAND | wx.BOTTOM, th.SP_SM)

        scroll.SetSizer(body)
        outer.Add(scroll, 1, wx.EXPAND | wx.ALL, th.SP_MD)

        # Pop and Apply differ in one word, so the difference is spelled out once here
        # rather than trusted to the button labels.
        legend = wx.StaticText(
            self,
            label="Pop restores and removes the stash. Apply restores and keeps it.",
        )
        legend.SetForegroundColour(_c(pal["muted_fg"]))
        f = legend.GetFont()
        f.SetPointSize(th.FONT_SMALL)
        legend.SetFont(f)
        outer.Add(legend, 0, wx.LEFT | wx.RIGHT | wx.BOTTOM, th.SP_MD)

        buttons = wx.BoxSizer(wx.HORIZONTAL)
        buttons.AddStretchSpacer()
        close = wx.Button(self, wx.ID_CANCEL, "Close")
        buttons.Add(close, 0)
        outer.Add(buttons, 0, wx.EXPAND | wx.LEFT | wx.RIGHT | wx.BOTTOM, th.SP_MD)

        self.SetSizer(outer)
        self.SetSize(wx.Size(560, 420))
        self.CentreOnParent()

    def _entry_card(self, parent, entry):
        card = Card(parent, "", self.pal)

        card.body.Add(
            card.label(entry.get("message") or "(no message)", bold=True, wrap=True),
            0,
            wx.EXPAND | wx.ALL,
            th.SP_SM,
        )

        # Where it came from and when. The origin branch is ours to know only for our
        # own stashes; one made by hand in a terminal simply does not say.
        meta = entry.get("when") or ""
        if entry.get("origin_branch"):
            meta = "from %s  ·  %s" % (entry["origin_branch"], meta)
        if meta:
            card.body.Add(
                card.label(meta, tone="muted_fg", small=True),
                0,
                wx.LEFT | wx.RIGHT | wx.BOTTOM,
                th.SP_SM,
            )

        row = wx.BoxSizer(wx.HORIZONTAL)
        row.AddStretchSpacer()
        row.Add(
            Button(
                card, "Pop", self.pal, variant="secondary",
                on_click=lambda e=entry: self._choose("pop", e),
            ),
            0,
            wx.RIGHT,
            th.SP_XS,
        )
        row.Add(
            Button(
                card, "Apply", self.pal, variant="ghost",
                on_click=lambda e=entry: self._choose("apply", e),
            ),
            0,
            wx.RIGHT,
            th.SP_XS,
        )
        # Drop destroys the stash, so it is marked destructive rather than sitting
        # there looking like the other two.
        row.Add(
            Button(
                card, "Drop", self.pal, variant="destructive-ghost",
                on_click=lambda e=entry: self._choose("drop", e),
            ),
            0,
        )
        card.body.Add(row, 0, wx.EXPAND | wx.LEFT | wx.RIGHT | wx.BOTTOM, th.SP_SM)
        return card

    def _choose(self, action, entry):
        # Close and hand the choice back. The caller confirms (Drop) and reports, so
        # this dialog never has to be dismissed behind another one.
        self.result = (action, entry)
        self.EndModal(wx.ID_OK)
