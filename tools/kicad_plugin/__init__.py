"""KiCad-Prism plugin: registers the pcbnew toolbar action.

KiCad imports this package from its plugin directory and calls register() on any
ActionPlugin it finds. The plugin itself is a thin UI, all the real work (git,
project lookup, backend calls) lives in the tray agent, which runs whether or not
KiCad is open. See tools/README.md.
"""

from __future__ import annotations

import os
import sys

import pcbnew
import wx


def _purge_stale_bytecode() -> None:
    """Delete a __pycache__ left behind by a PREVIOUS install of this plugin.

    THE bug this exists for: a PCM update overwrites our .py files but leaves the old
    install's __pycache__ alone, because it only touches files the new package
    contains. Python then decides the cache is current and imports it, so KiCad runs
    the version you just replaced. Observed on a 0.5.0 -> 0.5.1 update: version.py said
    0.5.1, version.cpython-311.pyc said 0.5.0, and the plugin reported itself as 0.5.0.
    Silent, and it makes every other version check meaningless.

    Python invalidates bytecode by comparing the source's mtime to the one recorded in
    the .pyc, which normally catches this. It does not here: PCM restores the zip's
    timestamps, so the freshly written .py can carry an mtime the old .pyc already
    knows about.

    So compare against our own VERSION instead. version.py is rewritten by every
    update, and a .pyc older than it cannot have been built from it. Runs before the
    first submodule import, since after that the stale code is already loaded.

    Best effort: a read-only directory or a locked file is not worth failing an import
    over, and the worst case is the behaviour we already have.
    """
    here = os.path.dirname(os.path.realpath(__file__))
    cache = os.path.join(here, "__pycache__")
    if not os.path.isdir(cache):
        return

    try:
        source = os.path.getmtime(os.path.join(here, "version.py"))
    except OSError:
        return

    for name in os.listdir(cache):
        if not name.endswith(".pyc"):
            continue
        path = os.path.join(cache, name)
        try:
            if os.path.getmtime(path) < source:
                os.remove(path)
        except OSError:
            pass  # locked or gone; the import below still works, just not faster


_purge_stale_bytecode()


def _log_native_crashes() -> None:
    """Write the Python stack to plugin-crash.log if KiCad dies inside our code.

    A wx call on a window whose C++ side is already gone takes KiCad down with an
    access violation, not a Python exception, so nothing reaches a traceback and the
    Windows crash dump holds no Python frames. faulthandler prints every thread's
    Python stack at the moment of the fault, which names the handler that did it.

    The file sits beside the agent's settings for this profile. Opened once and kept
    open, since faulthandler writes to the descriptor from inside the crash. Best
    effort: no log is no worse than before.
    """
    import faulthandler

    try:
        from .agent_client import _config_dir

        os.makedirs(_config_dir(), exist_ok=True)
        log = open(  # noqa: SIM115 - must outlive this function
            os.path.join(_config_dir(), "plugin-crash.log"), "a", encoding="utf-8"
        )
        faulthandler.enable(file=log, all_threads=True)
        globals()["_crash_log"] = log
    except (OSError, RuntimeError, ValueError):
        pass


_log_native_crashes()


def is_dev_install() -> bool:
    """Are we the symlinked working copy, or a real installed package?

    A dev checkout has the repo's siblings next to it (build_agent.py, the agent
    source); a PCM install is just the plugin's own files plus the agent binary.

    This matters because a developer wants BOTH at once: a symlink to iterate on,
    and a real install to verify what users actually get. Without telling them
    apart, two identically-named plugins appear in the menu and you have no idea
    which one you just clicked, and the symlinked one has no bundled binary, so it
    quietly exercises the source fallback instead of the thing under test.
    """
    tools = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
    return os.path.isfile(os.path.join(tools, "build_agent.py"))


class _Modules:
    """The plugin's own modules, resolved at Run() time rather than import time."""

    def __init__(self):
        from . import dialog, first_run, prism_theme

        self.dialog = dialog
        self.first_run = first_run
        self.prism_theme = prism_theme


def _reload_for_dev() -> "_Modules":
    """In a dev checkout, re-import the plugin's modules on every run.

    KiCad imports a plugin ONCE, when it starts, and keeps it in sys.modules for the
    rest of the session. So editing the source and clicking the toolbar button runs the
    *old* code, and the failure is baffling, because the file on disk plainly says
    otherwise. It bites hardest when the agent has moved on and the stale dialog reads a
    field the new agent no longer returns: a KeyError, and the dialog just won't open.

    Reloading here means edit, click, see the change, no KiCad restart. Only in a dev
    checkout: an installed plugin's files don't change under it, so reloading would be
    pure overhead and one more thing to go wrong.
    """
    modules = _Modules()
    if not is_dev_install():
        return modules

    import importlib

    # Depth-first: reload leaves before the modules that import them, or a parent gets
    # rebound to a stale child.
    for name in (
        "prism_theme",
        "widgets",
        "prompts",
        "loopback",
        "agent_client",
        "git_workflow",
        "agent_launcher",
        "version",
        "crossprobe",
        "settings_dialog",
        "first_run",
        "dialog",
    ):
        module = sys.modules.get(f"{__name__}.{name}")
        if module is not None:
            try:
                importlib.reload(module)
            except Exception:
                # A syntax error mid-edit shouldn't wedge the plugin permanently,
                # keep the last good module and let the user see the real error.
                pass

    return _Modules()


class PrismPlugin(pcbnew.ActionPlugin):
    def defaults(self):
        dev = is_dev_install()
        # Label the working copy so it can't be mistaken for the installed one.
        self.name = "Prism (dev)" if dev else "Prism"
        self.category = "Prism"
        self.description = "Project status and Prism integration" + (
            ", development copy, running from source" if dev else ""
        )
        self.show_toolbar_button = True
        # KiCad wants a PNG next to the plugin; absent, it falls back to a
        # default icon rather than failing, so this is safe either way.
        self.icon_file_name = os.path.join(os.path.dirname(__file__), "icon.png")
        self.dark_icon_file_name = self.icon_file_name

    def Run(self):
        modules = _reload_for_dev()

        board = pcbnew.GetBoard()
        # The board's own filename is the most reliable way to locate the project
        # on disk, more so than any notion of a "current project" in the API.
        board_path = board.GetFileName() if board else ""

        parent = wx.FindWindowByName("PcbFrame") or wx.GetActiveWindow()
        pal = modules.prism_theme.palette(
            dark=wx.SystemSettings.GetAppearance().IsDark()
        )

        # First time in: start the agent and offer the OS-level integrations, each
        # declinable. Only once, the answer lives in the agent's settings, so it
        # survives a plugin reinstall.
        if modules.first_run.needed():
            setup = modules.first_run.FirstRunDialog(parent, pal)
            try:
                setup.ShowModal()
            finally:
                setup.Destroy()

        dialog = modules.dialog.PrismDialog(parent, board_path)
        try:
            dialog.ShowModal()
        finally:
            dialog.Destroy()


PrismPlugin().register()
