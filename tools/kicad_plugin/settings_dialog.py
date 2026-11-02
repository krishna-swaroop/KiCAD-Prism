"""Settings for the agent, edited from inside KiCad.

The agent owns the settings (it's the thing that uses them, and it outlives KiCad);
this is just an editor for them over the loopback API. It lives here rather than in
the tray because a tray menu can't host text fields, pystray menus are labels and
checkmarks, and a half-usable tray form would be worse than none.
"""

from __future__ import annotations

import wx

from . import prism_theme as th
from . import prompts
from .agent_client import AgentClient, AgentUnavailable
from .widgets import Badge, Button, Card, Checkbox, IconButton, ui_font


def _c(hex_value):
    return wx.Colour(*th.hex_to_rgb(hex_value))


def _swallow(fn):
    """Run a best-effort background call, ignoring any failure.

    Used for the sign-in cancel: telling the agent to stop is a courtesy, and if
    it cannot be reached the flow still ends on its own timeout. Nothing the user
    needs to see, so a failure here must not raise on the worker thread.
    """
    try:
        fn()
    except Exception:
        pass


class SettingsDialog(wx.Dialog):
    def __init__(self, parent, pal):
        super().__init__(
            parent,
            title="Prism settings",
            # Wider than it was (520): several cards carry explanatory lines and a
            # full email, which clipped on the right at the old width because the
            # scroll window only scrolls vertically. A minimum size below keeps it
            # from being dragged back into that state, and _fit_width_to_content
            # widens it further when the content still doesn't fit.
            size=wx.Size(720, 620),
            style=wx.DEFAULT_DIALOG_STYLE | wx.RESIZE_BORDER,
        )
        self.SetMinSize(wx.Size(560, 480))
        self.pal = pal
        self.SetFont(ui_font(self))
        self.data = None
        self.SetBackgroundColour(_c(pal["background"]))
        self._build()
        self._load()

    # -- layout ------------------------------------------------------------

    def _build(self):
        root = wx.BoxSizer(wx.VERTICAL)

        self.scroll = wx.ScrolledWindow(self, style=wx.VSCROLL)
        self.scroll.surface = self.pal["background"]
        self.scroll.pal = self.pal
        self.scroll.SetBackgroundColour(_c(self.pal["background"]))
        self.scroll.SetScrollRate(0, 12)
        self.content = wx.BoxSizer(wx.VERTICAL)
        self.scroll.SetSizer(self.content)
        root.Add(self.scroll, 1, wx.EXPAND | wx.ALL, th.SP_LG)

        buttons = wx.BoxSizer(wx.HORIZONTAL)
        buttons.Add(
            IconButton(
                self,
                "save",
                self.pal,
                tooltip="Save",
                variant="primary",
                on_click=self._save,
            ),
            0,
            wx.RIGHT,
            th.SP_SM,
        )
        buttons.Add(
            IconButton(
                self,
                "refresh",
                self.pal,
                tooltip="Restart agent",
                variant="secondary",
                on_click=self._restart,
            ),
            0,
            wx.RIGHT,
            th.SP_SM,
        )
        buttons.Add(
            IconButton(
                self,
                "power",
                self.pal,
                tooltip="Stop agent",
                variant="destructive-ghost",
                on_click=self._stop,
            ),
            0,
        )
        root.Add(buttons, 0, wx.EXPAND | wx.LEFT | wx.RIGHT | wx.BOTTOM, th.SP_LG)

        self.SetSizer(root)

    def _relayout(self):
        self.content.FitInside(self.scroll)
        self.scroll.Layout()
        self.Layout()
        self._fit_width_to_content()
        self.Refresh()

    def _fit_width_to_content(self):
        """Widen the window until the cards fit, so nothing clips on the right.

        The scroll area only scrolls vertically, so any card wider than the window
        loses its right edge with no way to reach it. A fixed default can't be right
        for every card, font and DPI: the two-column row and the signed-in email set
        the real minimum. So take that minimum from the content once it is laid out.

        Grow only, and never past the screen: a user who makes the window wider keeps
        that, and on a small display the cap wins over the content.
        """
        gutters = 2 * self.FromDIP(th.SP_LG)
        scrollbar = wx.SystemSettings.GetMetric(wx.SYS_VSCROLL_X, self)
        chrome = self.GetSize().width - self.GetClientSize().width
        need = self.content.GetMinSize().width + gutters + max(scrollbar, 0) + chrome

        index = wx.Display.GetFromWindow(self)
        if index == wx.NOT_FOUND:
            index = 0
        cap = int(wx.Display(index).GetClientArea().width * 0.9)

        size = self.GetSize()
        width = min(max(size.width, need), cap)
        if width > size.width:
            self.SetSize(wx.Size(width, size.height))
            self.Layout()

    # -- data --------------------------------------------------------------

    def _load(self):
        self.content.Clear(delete_windows=True)
        try:
            self.data = AgentClient().settings()
        except AgentUnavailable as exc:
            self.data = None
            card = Card(self.scroll, "Agent", self.pal)
            card.body.Add(card.label(str(exc), tone="muted_fg", wrap=True), 0)
            self.content.Add(card, 0, wx.EXPAND)
            self._relayout()
            return
        self._render()
        self._relayout()

    def _render(self):
        settings = self.data.get("settings", {})
        identity = self.data.get("identity", {})
        proto = self.data.get("protocol", {})
        auto = self.data.get("autostart", {})

        account = self._render_account(settings, identity)
        self.content.Add(account, 0, wx.EXPAND | wx.BOTTOM, th.SP_MD)

        library = self._render_library()
        server = self._render_server(settings, identity)
        self.content.Add(
            self._two_col(library, server), 0, wx.EXPAND | wx.BOTTOM, th.SP_MD
        )

        projects = self._render_projects(settings)
        if projects is None:
            return self._render_rest(auto, proto)
        self.content.Add(projects, 0, wx.EXPAND | wx.BOTTOM, th.SP_MD)

        self._render_rest(auto, proto)

    def _two_col(self, left, right):
        """Lay two cards side by side, each taking half the row's width."""
        row = wx.BoxSizer(wx.HORIZONTAL)
        row.Add(left, 1, wx.EXPAND | wx.RIGHT, th.SP_SM // 2)
        row.Add(right, 1, wx.EXPAND | wx.LEFT, th.SP_SM // 2)
        return row

    def _render_account(self, settings, identity):
        account = Card(self.scroll, "Account", self.pal)
        if not identity.get("reachable"):
            account.body.Add(
                account.label(
                    "Server unreachable.",
                    tone="muted_fg",
                ),
                0,
            )
        elif not identity.get("auth_enabled"):
            # Be explicit rather than showing a dead Sign-in button: this server
            # genuinely has auth switched off, so there is no account to use.
            account.body.Add(
                account.label(
                    identity.get("note") or "This server has authentication disabled.",
                    tone="muted_fg",
                    wrap=True,
                ),
                0,
                wx.BOTTOM,
                th.SP_SM,
            )
            account.row("Signed in as", "Guest", badge=True, tone="muted")
        else:
            user = identity.get("user")
            if user:
                # compact_row, not row: a full email pushed to the right edge by
                # row()'s stretch spacer clips past the dialog. This keeps it left
                # and lets it wrap.
                line = wx.BoxSizer(wx.HORIZONTAL)
                line.Add(
                    account.label("Signed in as", tone="muted_fg"),
                    0,
                    wx.ALIGN_CENTER_VERTICAL | wx.RIGHT,
                    th.SP_XS,
                )
                email = account.label(user.get("email", "?"))
                line.Add(email, 1, wx.ALIGN_CENTER_VERTICAL)
                role = str(user.get("role", ""))
                if role:
                    line.Add(
                        Badge(account, role, self.pal, "primary"),
                        0,
                        wx.ALIGN_CENTER_VERTICAL | wx.LEFT,
                        th.SP_XS,
                    )
                # Signed in: the one action that matters is signing out. It clears
                # the token here and revokes it at Prism. Inline with the identity
                # row, to the right of the role tag, rather than a line of its own.
                line.Add(
                    IconButton(
                        account,
                        "logout",
                        self.pal,
                        tooltip="Sign out",
                        variant="secondary",
                        on_click=self._sign_out,
                    ),
                    0,
                    wx.ALIGN_CENTER_VERTICAL | wx.LEFT,
                    th.SP_SM,
                )
                account.body.Add(line, 0, wx.EXPAND | wx.BOTTOM, th.SP_XS)
            else:
                account.body.Add(
                    account.label(
                        "Not signed in. Sign in through your browser, the usual "
                        "way you log in to Prism.",
                        tone="muted_fg",
                        wrap=True,
                    ),
                    0,
                    wx.BOTTOM,
                    th.SP_SM,
                )
                account.body.Add(
                    Button(
                        account,
                        "Sign in",
                        self.pal,
                        variant="primary",
                        on_click=self._sign_in,
                    ),
                    0,
                    wx.BOTTOM,
                    th.SP_SM,
                )

        # The manual token field stays as a fallback: a headless box with no
        # browser, or a service token an admin handed out, still needs a way in.
        account.body.Add(
            account.label("API token", tone="foreground", bold=True, small=True),
            0,
            wx.TOP,
            th.SP_SM,
        )
        account.body.Add(
            account.label(
                "Paste a token instead of signing in. Stored on this machine, "
                "not shown again once saved.",
                tone="muted_fg",
                small=True,
                wrap=True,
            ),
            0,
            wx.BOTTOM,
            th.SP_XS,
        )
        self.token = wx.TextCtrl(
            account,
            value="",
            style=wx.TE_PASSWORD,
        )
        self._style_input(self.token)
        has = settings.get("has_token")
        self.token.SetHint("•••••• (a token is saved)" if has else "Paste a token")
        account.body.Add(self.token, 0, wx.EXPAND)

        if has:
            account.body.Add(
                Button(
                    account,
                    "Clear token",
                    self.pal,
                    variant="secondary",
                    on_click=self._clear_token,
                ),
                0,
                wx.TOP,
                th.SP_XS,
            )

        return account

    def _render_projects(self, settings):
        # Where to look for projects, by their .prism.json marker. A place to look,
        # not a place you are forced to put things: a checkout works wherever it is.
        projects = Card(self.scroll, "Projects", self.pal)

        # An agent older than this setting drops it on save and answers 200, so the
        # dialog would report success while the folders silently vanished. The tell is
        # that the key is absent from its payload entirely. Say so, and do not offer a
        # control that cannot work: a Save that lies is worse than a missing feature.
        if "projects_roots" not in settings:
            self.roots = None
            projects.body.Add(
                projects.label(
                    "The running agent is too old for this setting.\n"
                    "Restart it to pick up the new version.",
                    tone="warning",
                ),
                0,
            )
            self.content.Add(projects, 0, wx.EXPAND | wx.BOTTOM, th.SP_MD)
            return None

        projects.body.Add(
            projects.label(
                "Folders to search for Prism projects.",
                tone="muted_fg",
                small=True,
            ),
            0,
            wx.BOTTOM,
            th.SP_XS,
        )
        self.roots = wx.ListBox(
            projects,
            choices=list(settings.get("projects_roots") or []),
        )
        # Sized to the rows it can hold (max 4), not a fixed 90px slab: a list
        # with one entry sat mostly empty and dragged the rest of the panel down.
        rows = max(1, min(len(self.roots.GetStrings()) + (0 if self.roots.GetStrings() else 1), 4))
        self.roots.SetSize(wx.Size(-1, rows * (self.roots.GetCharHeight() + 2) + 8))
        self.roots.SetForegroundColour(_c(self.pal["foreground"]))
        self.roots.SetBackgroundColour(_c(self.pal["background"]))
        projects.body.Add(self.roots, 0, wx.EXPAND | wx.BOTTOM, th.SP_XS)

        root_buttons = wx.BoxSizer(wx.HORIZONTAL)
        root_buttons.Add(
            IconButton(
                projects,
                "plus",
                self.pal,
                tooltip="Add a folder",
                variant="secondary",
                on_click=self._add_root,
            ),
            0,
            wx.RIGHT,
            th.SP_XS,
        )
        root_buttons.Add(
            IconButton(
                projects,
                "minus",
                self.pal,
                tooltip="Remove the selected folder",
                variant="secondary",
                on_click=self._remove_root,
            ),
            0,
        )
        projects.body.Add(root_buttons, 0)
        return projects

    def _render_rest(self, auto, proto):
        """Everything below the Projects card.

        Split out because the Projects card has two shapes (usable, or "your agent is
        too old"), and both need the cards that follow.
        """
        # -- startup --------------------------------------------------------
        startup = Card(self.scroll, "Startup", self.pal)
        self.autostart = Checkbox(startup, "Start the Prism agent at login", self.pal)
        self.autostart.SetValue(bool(auto.get("enabled")))
        self.autostart.SetForegroundColour(_c(self.pal["foreground"]))
        self.autostart.SetBackgroundColour(_c(self.pal["card"]))
        startup.body.Add(self.autostart, 0, wx.BOTTOM, th.SP_XS)
        startup.body.Add(
            startup.label(
                "Required for Prism to work while KiCad is closed.",
                tone="muted_fg",
                small=True,
            ),
            0,
            wx.BOTTOM,
            th.SP_SM,
        )
        startup.body.Add(
            Button(
                startup,
                "Run setup again",
                self.pal,
                variant="secondary",
                on_click=self._rerun_setup,
            ),
            0,
        )

        # -- links ----------------------------------------------------------
        links = Card(self.scroll, "prism:// links", self.pal)
        if proto.get("supported"):
            self.handler = Checkbox(
                links, "Let this machine open prism:// links", self.pal
            )
            self.handler.SetValue(bool(proto.get("registered")))
            self.handler.SetForegroundColour(_c(self.pal["foreground"]))
            self.handler.SetBackgroundColour(_c(self.pal["card"]))
            links.body.Add(self.handler, 0, wx.BOTTOM, th.SP_XS)
            links.body.Add(
                links.label(
                    "Registered for your user account only, on Save.",
                    tone="muted_fg",
                    small=True,
                ),
                0,
            )
        else:
            # Not reachable today: all three platforms can register. Kept as a graceful
            # fallback rather than a crash if one ever cannot.
            self.handler = None
            links.body.Add(
                links.label(
                    "Not available on this platform.",
                    tone="muted_fg",
                    small=True,
                ),
                0,
            )

        self.content.Add(self._two_col(startup, links), 0, wx.EXPAND)

    def _render_server(self, settings, identity):
        server = Card(self.scroll, "Server", self.pal)
        row = wx.BoxSizer(wx.HORIZONTAL)
        self.url = wx.TextCtrl(server, value=settings.get("server_url", ""))
        self._style_input(self.url)
        row.Add(self.url, 1, wx.ALIGN_CENTER_VERTICAL | wx.RIGHT, th.SP_XS)
        row.Add(
            Badge(
                server,
                "Connected" if identity.get("reachable") else "Unreachable",
                self.pal,
                "success" if identity.get("reachable") else "destructive",
            ),
            0,
            wx.ALIGN_CENTER_VERTICAL,
        )
        server.body.Add(row, 0, wx.EXPAND)
        return server

    def _render_library(self):
        """Is Prism KiCad's remote symbol provider, and does it point at our server?

        Three states worth distinguishing:
            Linked        healthy.
            Wrong server  a Prism provider IS registered, but for a different server
                          than the one above. You'd be browsing the wrong catalog with
                          nothing to tell you.
            Not linked    never registered; Prism's parts aren't in the Symbol Chooser.
        """
        card = Card(self.scroll, "Symbol library", self.pal)

        try:
            state = AgentClient().library()
        except AgentUnavailable as exc:
            card.row("Status", "Unavailable", badge=True, tone="warning")
            card.body.Add(
                card.label(str(exc), tone="muted_fg", small=True, wrap=True), 0, wx.TOP, th.SP_XS
            )
            return card

        if not state.get("configured"):
            card.row("Status", "No KiCad config found", tone="muted_fg")
            return card

        linked = state.get("linked")
        stale = state.get("stale")

        if linked:
            label, tone = "Linked", "success"
        elif stale:
            label, tone = "Wrong server", "warning"
        else:
            label, tone = "Not linked", "warning"
        card.row("Prism", label, badge=True, tone=tone)
        card.row("KiCad", state.get("kicad_version") or ", ", tone="muted_fg")

        if stale:
            card.body.Add(
                card.label(
                    "Currently linked to %s.\nRe-link, then restart KiCad."
                    % state.get("linked_url", ""),
                    tone="muted_fg",
                    small=True,
                ),
                0,
                wx.TOP | wx.BOTTOM,
                th.SP_XS,
            )
        elif not linked:
            card.body.Add(
                card.label(
                    "Prism's parts won't appear in the Symbol Chooser.\n"
                    "Link, then restart KiCad.",
                    tone="muted_fg",
                    small=True,
                ),
                0,
                wx.TOP | wx.BOTTOM,
                th.SP_XS,
            )

        card.body.Add(
            Button(
                card,
                "Re-link" if (linked or stale) else "Link Prism",
                self.pal,
                variant="ghost" if linked else "primary",
                on_click=self._link_library,
            ),
            0,
            wx.TOP,
            th.SP_XS,
        )

        return card

    def _link_library(self):
        """Register Prism as KiCad's symbol provider.

        The agent does the write. It works with KiCad open, KiCad only rewrites the
        parts of eeschema.json it touched, and the provider list isn't one of them, but
        KiCad reads the providers at startup, so it needs a restart to pick this up.
        """
        try:
            with wx.BusyCursor():
                result = AgentClient().link_library()
        except AgentUnavailable as exc:
            prompts.tell(self, str(exc), "Prism")
            return

        if result.get("error"):
            prompts.tell(self, result["error"], "Prism")
        else:
            prompts.tell(self, "Linked to KiCad %s. Restart KiCad to load it."
                % (result.get("kicad_version") or ""),
                "Prism")
        self._load()

    def _style_input(self, ctrl):
        ctrl.SetBackgroundColour(_c(self.pal["muted"]))
        ctrl.SetForegroundColour(_c(self.pal["foreground"]))
        f = ctrl.GetFont()
        f.SetPointSize(th.FONT_BODY)
        ctrl.SetFont(f)

    # -- actions -----------------------------------------------------------

    def _save(self):
        if self.data is None:
            return
        payload = {"server_url": self.url.GetValue().strip()}
        token = self.token.GetValue()
        if token:
            payload["api_token"] = token
        if self.handler is not None:
            payload["protocol_handler"] = self.handler.GetValue()
        payload["autostart"] = self.autostart.GetValue()
        if self.roots is not None:
            payload["projects_roots"] = list(self.roots.GetStrings())

        try:
            result = AgentClient().save_settings(payload)
        except AgentUnavailable as exc:
            prompts.tell(self, str(exc), "Prism")
            return

        # The agent reports registration failures (e.g. the OS refused) rather
        # than silently persisting a setting it couldn't honour.
        if result.get("error"):
            prompts.tell(self, result["error"], "Prism")

        self.data = result
        self.content.Clear(delete_windows=True)
        self._render()
        self._relayout()

    def _add_root(self):
        with wx.DirDialog(
            self,
            "Choose a folder to search for Prism projects",
            style=wx.DD_DEFAULT_STYLE | wx.DD_DIR_MUST_EXIST,
        ) as dlg:
            if dlg.ShowModal() != wx.ID_OK:
                return
            chosen = dlg.GetPath()
        # The agent canonicalises and de-duplicates on save; this only stops the
        # obvious case of adding the identical string twice in one sitting.
        if chosen not in self.roots.GetStrings():
            self.roots.Append(chosen)

    def _remove_root(self):
        selected = self.roots.GetSelection()
        if selected != wx.NOT_FOUND:
            self.roots.Delete(selected)

    def _rerun_setup(self):
        """Reopen the first-run flow. Kept reachable because the two OS integrations
        it offers are easy to decline on day one and want later."""
        from .first_run import FirstRunDialog

        dlg = FirstRunDialog(self, self.pal)
        try:
            dlg.ShowModal()
        finally:
            dlg.Destroy()
        self._load()  # the toggles it applied are ours to redisplay

    def _sign_in(self):
        """Sign in through the browser, then redisplay the account state.

        The agent opens the browser and waits for the user to approve, which can
        take a while, or forever if they close the tab. So the blocking call runs
        on a background thread while a cancellable progress dialog keeps KiCad's UI
        alive. Doing it inline froze the main thread until the agent's timeout,
        which read as KiCad hanging and got it force-killed.

        Saves the server URL first: the user may have typed a new one without
        pressing Save, and signing in to the old server would be quietly wrong.
        """
        url = self.url.GetValue().strip()
        if not url:
            prompts.tell(self, "Set the Prism server URL first.", "Prism")
            return
        try:
            AgentClient().save_settings({"server_url": url})
        except AgentUnavailable as exc:
            prompts.tell(self, str(exc), "Prism")
            return

        result = self._run_cancellable(
            lambda: AgentClient().sign_in(),
            message="Waiting for you to sign in in the browser…\n\n"
            "Approve there, or press Cancel to stop.",
            on_cancel=lambda: AgentClient().cancel_sign_in(),
        )
        if result is None:
            return  # cancelled, unreachable, or errored, already surfaced

        if result.get("cancelled"):
            return
        if result.get("error"):
            prompts.tell(self, result["error"], "Prism")

        self.data = result
        self.content.Clear(delete_windows=True)
        self._render()
        self._relayout()

    def _run_cancellable(self, work, *, message, on_cancel=None):
        """Run a blocking agent call off the UI thread, with a Cancel button.

        `work` runs on a daemon thread; meanwhile we pump the event loop behind a
        pulsing progress dialog so KiCad stays responsive. Returns the call's
        result, or None if the user cancelled or the call raised (which is shown).
        `on_cancel` is invoked (best-effort) when the user cancels, so the agent
        can be told to stop waiting rather than holding its listener open.
        """
        import threading

        outcome = {}

        def run():
            try:
                outcome["result"] = work()
            except AgentUnavailable as exc:
                outcome["error"] = str(exc)
            except Exception as exc:  # never let the worker die silently
                outcome["error"] = str(exc)

        thread = threading.Thread(target=run, daemon=True)
        thread.start()

        dlg = wx.ProgressDialog(
            "Prism",
            message,
            maximum=100,
            parent=self,
            style=wx.PD_APP_MODAL | wx.PD_CAN_ABORT,
        )
        cancelled = False
        try:
            while thread.is_alive():
                keep_going, _ = dlg.Pulse()
                if not keep_going:
                    cancelled = True
                    break
                wx.MilliSleep(100)
        finally:
            dlg.Destroy()

        if cancelled:
            # Tell the agent to abandon the flow, then let the worker unwind. Do
            # not block the UI on it, best-effort, in the background.
            if on_cancel is not None:
                threading.Thread(
                    target=lambda: _swallow(on_cancel), daemon=True
                ).start()
            return None

        if "error" in outcome:
            prompts.tell(self, outcome["error"], "Prism")
            return None
        return outcome.get("result")

    def _sign_out(self):
        if not prompts.ask(
            self,
            "Sign out of Prism on this machine? The KiCad agent's token is "
            "revoked, and you sign in again through the browser to reconnect.",
            "Prism",
            yes="Sign out",
        ):
            return
        # Off the UI thread too: the server-side revoke can stall if Prism is
        # unreachable, and a frozen KiCad is exactly the bug we are fixing.
        result = self._run_cancellable(
            lambda: AgentClient().sign_out(),
            message="Signing out…",
        )
        if result is None:
            return

        # Signed out locally regardless; the warning only means Prism could not be
        # reached to revoke the token, which the user may want to do by hand.
        if result.get("warning"):
            prompts.tell(self, result["warning"], "Prism")

        self.data = result
        self.content.Clear(delete_windows=True)
        self._render()
        self._relayout()

    def _clear_token(self):
        try:
            self.data = AgentClient().save_settings({"clear_token": True})
        except AgentUnavailable as exc:
            prompts.tell(self, str(exc), "Prism")
            return
        self.content.Clear(delete_windows=True)
        self._render()
        self._relayout()

    def _restart(self):
        """Stop whatever agent is running, then start the one that shipped with
        THIS plugin. See agent_launcher.restart_agent: not the agent's own
        /restart, which asks the (possibly outdated) running process to re-exec
        ITSELF, and at worst just relaunches the same old version having changed
        nothing, the two-click "restart didn't work, now stop and start by hand"
        this replaces.
        """
        from . import agent_launcher

        with wx.BusyCursor():
            try:
                came_up = agent_launcher.restart_agent()
            except agent_launcher.LaunchError as exc:
                prompts.tell(self, str(exc), "Prism")
                return

        if not came_up:
            prompts.tell(
                self,
                "The new agent hasn't responded yet. It may still be starting, "
                "try again in a moment.",
                "Prism",
            )
        self._load()

    def _stop(self):
        if not prompts.ask(
            self,
            "Stop the Prism agent? The plugin needs it to run.",
            "Prism",
            yes="Stop",
        ):
            return
        try:
            AgentClient().quit()
        except AgentUnavailable:
            pass  # already gone is the outcome we wanted
        self.EndModal(wx.ID_OK)
