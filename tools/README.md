# KiCad-Prism desktop tools

Two pieces that let you work with Prism from the desktop:

```
┌──────────────────────────────┐
│  Tray agent  (prism_agent)   │   the worker — runs always, with or without KiCad
│  • identifies local projects │
│  • runs git                  │
│  • talks to the Prism backend│
│  • serves a loopback HTTP API├──┐
└──────────────────────────────┘  │  127.0.0.1 (token-guarded)
                                  │
┌──────────────────────────────┐  │
│  KiCad plugin (kicad_plugin) ├──┘  the UI — only when KiCad is open
│  • pcbnew toolbar button     │
│  • themed wx dialog          │
│  • no logic of its own       │
└──────────────────────────────┘
```

**Why split it this way.** KiCad isn't always open, so the useful capabilities
can't live inside it. The agent owns everything real; the plugin is a thin client
that renders the agent's answers. That also keeps the plugin **stdlib-only** —
installing packages into KiCad's embedded Python is painful and fragile, so the
plugin depends on nothing but the standard library and KiCad's bundled wxPython.

## Installing

Download the zip for your platform from the [releases][releases], then in KiCad:
**Plugin and Content Manager → Install from File…**

That's it. **No Python installation is required** — the agent ships as a
self-contained binary inside the zip. The first time you open the plugin
(*Tools → External Plugins → Prism*) it starts the agent and offers two optional,
per-user integrations, each of which you can decline:

| Option | What it actually writes |
|---|---|
| Start the agent at login | Windows: a value under `HKCU\…\CurrentVersion\Run`<br>macOS: a LaunchAgent in `~/Library/LaunchAgents`<br>Linux: a `.desktop` in `~/.config/autostart` |
| Open `prism://` links | The URL scheme, registered for your user only |

Nothing is written unless you tick the box. You can change both later, or re-run
setup, from **Settings** in the plugin.

[releases]: https://github.com/krishna-swaroop/KiCAD-Prism/releases

### macOS may ask you to authorise the agent

The binary is ad-hoc signed but not notarised. In the normal path that's fine —
Gatekeeper only inspects files carrying `com.apple.quarantine`, and KiCad's Plugin
Manager downloads and extracts the zip itself, so the flag is never applied.

If you instead download the zip **in a browser** and extract it with Finder, macOS
will flag the binary and refuse to run it ("cannot be opened because the developer
cannot be verified"). The plugin strips the flag from its own binary before
launching, which handles most cases; if macOS still objects, allow it in
**System Settings → Privacy & Security**, or run:

```bash
xattr -d com.apple.quarantine <plugin dir>/prism-agent
```

### Linux (GNOME): showing the tray icon

GNOME has no system tray of its own. The agent runs fine without one, but to see its
icon install the AppIndicator extension, enable it, then log out and back in:

```bash
sudo apt install gnome-shell-extension-appindicator
gnome-extensions enable ubuntu-appindicators@ubuntu.com
```

KDE, XFCE and most other desktops show the icon with nothing to install.

On Linux the icon uses the legacy X11 tray protocol (XEmbed), so two limits apply:

- **Left-click opens the menu; right-click does nothing.** The X11 tray passes on
  only a plain click, so the agent draws its own menu on it. It opens in the
  corner next to the panel, not at the pointer. Close it with "Close menu",
  Escape, or another click on the icon.
- **Desktops without X11 tray support show no icon at all**: Sway, Hyprland and
  others that only speak the newer StatusNotifierItem protocol. The agent still runs
  there, and everything the menu offers is also in the KiCad plugin.

## Running the agent by hand

Normally the plugin starts it. To run it yourself — from a release:

```bash
./prism-agent            # or prism-agent.exe
./prism-agent --no-tray  # headless
```

…or from a source checkout:

```bash
pip install -r tools/prism_agent/requirements.txt
python -m prism_agent    # from the tools/ directory
```

**The tray icon is a convenience, not the architecture.** The agent's real control
surface is its HTTP API, which behaves identically on every OS. That matters,
because the tray is the one part that *doesn't*: on GNOME it needs the AppIndicator
extension (see above), and on a headless box or over SSH there's no tray at all.
When no tray can host the icon, the agent says so in its log and carries on
without one.

So when no tray can be drawn the agent **says so and keeps serving** rather than
exiting (which would take the plugin down with it) or running invisibly with no way
to stop it. `POST /quit` stops it from anywhere, which is what makes a missing icon
survivable instead of an orphaned process. pystray raises `ImportError` when no
backend works, so this is detected rather than guessed — no per-distro knowledge
required.

It sits in the system tray and binds an ephemeral port on `127.0.0.1`, publishing
`{port, token, pid}` to a discovery file so the plugin can find it:

| OS | File |
|---|---|
| Windows | `%APPDATA%\kicad-prism\agent.json` |
| macOS | `~/Library/Application Support/kicad-prism/agent.json` |
| Linux | `$XDG_CONFIG_HOME/kicad-prism/agent.json` |

Every route except `/health` requires the token. That isn't paranoia: **any local
process — including JavaScript on a web page — can reach a loopback port**, and
the agent can run git and read the filesystem. The token is a shared secret only
the owning user can read.

Configuration (env vars):

| Var | Default | |
|---|---|---|
| `PRISM_URL` | `http://127.0.0.1:8000` | Prism backend |
| `PRISM_TOKEN` | *(none)* | bearer token, if the backend requires auth |

The agent is useful **without** a backend: project detection and git status are
purely local. Backend calls degrade to "not registered" rather than failing.

### API

```
GET  /health                       {ok, version, backend, backend_reachable}  no auth
GET  /project?path=<path>          {project, git, prism}
GET  /changes?path=<path>          {changes, project, prism}
GET  /settings                     {settings, identity, protocol}
PUT  /settings {..}                updates, and re-points the backend client
POST /open-in-prism {project_id}   opens the web app in the browser
POST /restart                      stops, then relaunches the agent
POST /quit                         stops the agent
```

## Settings, accounts, and prism:// links

Settings live in `settings.json` next to the discovery file, and are edited from
**Settings** in the plugin dialog. They're deliberately not in the tray: a pystray
menu is labels and checkmarks, it can't host a text field, and a half-usable tray
form would be worse than none. The tray does carry *Restart agent* and *Quit*.

Env vars (`PRISM_URL`, `PRISM_TOKEN`) still win over the saved file, so pointing at
a staging backend for one run neither loses nor silently overwrites what you saved.
The API token is **write-only**: the agent stores it but never sends it back, so
the UI only ever learns *whether* one is set.

**Accounts.** Prism authenticates with OIDC authorization-code — you sign in at an
identity provider in a *browser*, which redirects back with a code. There is no
username/password endpoint, so a desktop client cannot collect credentials itself;
it has to hand off to the browser, and the redirect is what `prism://auth/callback`
is for. Right now the server has `auth_enabled: false`, so every request is a guest
and no token is needed; the settings dialog says so instead of showing a dead
Sign-in button. The seam (token → bearer header → `identity`) is in place for when
an issuer is configured.

**prism:// links.** The URL *dispatch* is portable; the *registration* is not:

| OS | How the scheme is claimed | Works? |
|---|---|---|
| Windows | per-user registry key under `HKCU\Software\Classes\prism` | yes, no admin needed |
| Linux | a `.desktop` file with `MimeType=x-scheme-handler/prism` | yes |
| macOS | `CFBundleURLTypes` in an app bundle's `Info.plist` | **not yet** — only an `.app` bundle can claim a scheme, and we currently ship a bare binary. A PyInstaller `BUNDLE` step would fix it; no Apple account needed. |

Nothing is registered unless you tick the box: silently claiming a URL scheme is the
sort of thing people rightly resent. From a source checkout the registered command
bootstraps `sys.path` explicitly rather than relying on the working directory,
because the browser launches it from *its* cwd, not ours; the shipped binary needs
no such trick.

### Uncommitted changes

`/changes` is the interesting one. The web app can only ever show *committed*
history — that's all the backend can see. But while you're working in KiCad, the
changes you care about are the ones still on disk, which exist nowhere but your
machine. The agent lists them from `git status`, staged and unstaged alike.

The list is per file. Item-level detail (which footprints, nets or symbols
changed) is not computed yet: every file carries an empty `groups` list, and the
plugin shows a plain row for it. The plugin's group rows and cross-probe are kept
for when that detail comes back.

The agent caches the result keyed on the mtimes of the files git reports as
dirty, so any edit invalidates it by itself and reopening the dialog is instant.

Debuggable with curl:

```bash
TOKEN=$(python -c "import json,os;print(json.load(open(os.path.expandvars(r'%APPDATA%\kicad-prism\agent.json')))['token'])")
PORT=$(python -c  "import json,os;print(json.load(open(os.path.expandvars(r'%APPDATA%\kicad-prism\agent.json')))['port'])")
curl -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:$PORT/project?path=/path/to/project"
```

## Developing

`tools/dev.py` is the one entry point for the dev workflow: run either agent,
install either plugin, and see what's running.

```bash
python tools/dev.py plugin install --profile dev      # symlink the dev plugin
python tools/dev.py agent --profile dev               # run the dev agent
python tools/dev.py status                            # what's running, per profile

python tools/dev.py plugin install --profile release  # copy the release plugin
python tools/dev.py plugin uninstall --profile dev
```

The underlying scripts still work directly if you prefer
(`python tools/install_plugin.py --profile dev`, `python -m prism_agent
--profile dev`); `dev.py` just wraps them and adds `status`.

### Profiles: the dev copy and a real install coexist

You need both: a symlink to iterate on, and a real PCM install to verify what users
actually get. Left alone these collide — two identically named plugins in the menu,
and, far worse, **one agent between them**: they share a discovery file and a
settings file, so the single-instance guard means only one agent starts and it
silently serves both. You edit agent code, restart, and see nothing change, because
you're still talking to the installed binary.

So the agent and plugin run as one of two **profiles**, defined once in
`profiles.py`, vendored byte for byte into both `prism_agent/` and `kicad_plugin/`
(the installed plugin can't import the agent package; `test_vendored_parity.py`
fails if the copies differ):

| Profile | Menu entry | Preferred port | Installs as | State in |
|---|---|---|---|---|
| `dev` | **Prism (dev)** | 48731 | `prism_dev` | `…/kicad-prism-dev/` |
| `release` | **Prism** | 48730 | `prism` | `…/kicad-prism/` |

Separate agents, ports, settings, and single-instance guards, so both stay out of
each other's way. **Nothing to configure by default:** a source checkout auto-detects
`dev`, an install auto-detects `release`. Pass `--profile` (or set `PRISM_PROFILE`)
to be explicit.

The port is *preferred*, not reserved: if it's taken (a stale agent, or a second
instance of the same profile), the agent binds an ephemeral port instead and logs
it. `dev.py status` shows the port each agent actually got, plus its pid, version,
and whether the process is still alive:

```
PROFILE   PORT    PID     ALIVE  VERSION     LABEL
dev       48731   29568   yes    0.4.0       Prism (dev)
release   -       -       -      -           Prism
```

To run an agent by hand without `dev.py`:

```bash
python -m prism_agent --profile dev     # or set PRISM_PROFILE=dev
```

The profile is passed to autostart as an *argument* rather than left in the
environment, because a login process gets a fresh one — otherwise a dev agent set to
start at login would come back as the *default* agent and collide with the installed
one it was carefully kept apart from.

It symlinks rather than copies, so the repo stays the single source of truth: edit
the plugin here and KiCad picks it up on *Tools → External Plugins → Refresh*. If
the OS refuses symlinks (Windows without Developer Mode) it falls back to copying
and **says so** — a silent copy would quietly turn every later edit into a no-op.

Autodetect prefers a KiCad version that is actually **installed**: KiCad leaves a
config dir behind for every version you've ever run, so the newest config dir is
often an orphan, and installing into it means the plugin silently never appears.

With no binary built, the plugin falls back to running the agent from source (it
will tell you which interpreters it tried, and why each was rejected). To get the
real thing:

```bash
pip install pyinstaller
python tools/build_agent.py --windowed # -> tools/dist/prism-agent[.exe]
python tools/build_agent.py --console  # debug only: keep a console so crashes stay visible
```

`find_binary()` looks in `tools/dist/` too, so a local build is picked up
automatically.

### Plugin dialog styling

The wx dialog mirrors Prism's compact component defaults: square buttons/cards/
badges, 32-DIP buttons, medium-weight labels, and a consistent 12px-equivalent
body type scale. It uses installed Inter when available, otherwise the system
GUI font; it never installs fonts or modifies KiCad's application bundle.
Monospaced values use an installed platform monospace face with a generic fallback.
Text fields remain native for clipboard, selection, and IME support. Custom
buttons support Tab focus, Space/Enter activation, and a visible focus outline;
destructive confirmation prompts still suppress their default Enter action.

The layout follows the web app's information hierarchy: a single-line header
(identity, health dots, refresh, settings), then the uncommitted-changes card
with its staging controls and commit box, then the repository card (branch,
commits, sync), then generated-file offers. The footer carries only the primary
"Open in Prism" action. Spacing runs on the 4px grid; rows are 8px apart and
cards 12px apart.

In a source-linked dev install, close and reopen the dialog to see edits. Test
the main dialog, Settings, first-run setup, and prompts in light/dark appearance,
including resizing and keyboard navigation. Point-size fonts are scaled by wx;
only control geometry uses `FromDIP`, avoiding double scaling on Retina displays.

### Building the release packages

```bash
python tools/package_plugin.py --version 0.4.0 --binaries <dir> --out dist
```

PyInstaller **cannot cross-compile** — a macOS binary must be built on macOS, a
Linux one on Linux — so the real packages come from CI:
`.github/workflows/build-plugin.yml`, a matrix of `windows-latest` /
`macos-latest` / `ubuntu-latest`. It's **manual dispatch only** (Actions → Build
KiCad Plugin → Run workflow); building three binaries on every commit would be
waste, and it's a release step, not a check.

One zip per platform, each carrying its own agent binary. The layout is fixed by
KiCad: `metadata.json` at the root, the plugin **directly** inside `plugins/` (a
further level of nesting is explicitly forbidden), `resources/icon.png`, and the
agent binary beside the plugin — which is exactly where `find_binary()` looks
first.

### Why a binary at all

The plugin runs inside KiCad's embedded Python, which has no pystray/Pillow — and
we cannot assume the user has *any* other Python, since they installed a zip from
the Plugin Manager and may never have run pip. Hunting the machine for a suitable
interpreter is what this used to do, and it failed for exactly that person.
Pillow also ships compiled C extensions, so it can't be vendored as source.

Launching the agent isn't a privilege escalation, incidentally — the plugin already
runs arbitrary Python inside KiCad with your full rights. It only ever launches our
own binary, resolved relative to the plugin, and only when you ask. (A *web page*
could never do this: browsers can't spawn local processes. The web UI can only talk
to the agent once it's already running.)

### KiCad's backups and generated files

KiCad's auto-backup is **on by default** and keeps up to 25 zips / 100 MB per
project in a `<project>-backups/` folder, plus `-bak` files, autosaves and caches.
None of it says anything about your design, and there can be dozens of entries per
real edit — which is exactly how the board you actually changed gets buried.

Both the plugin's change list and the web history fold them behind a count.
**Folded, not filtered**: the files really are in the commit / the working tree, and
a list that silently omitted them would be lying about the state of your repo.
Unfolding them is also how you notice they're being committed at all — the real fix
is a `.gitignore` entry, and both surfaces say so.

`backend/app/services/kicad_noise_service.py` is the single classifier. The backend
imports it; the agent loads it by path (and bundles it into the binary). Two copies of these patterns would drift the first time
KiCad changed a suffix, and then a file hidden in one surface but shown in the other
is just confusing.

### Cross-probe

Not reachable in this release, since the uncommitted list has no item rows yet
(see above). Clicking an item row jumps to that item **inside KiCad** — selected and zoomed —
not to a web page. You're already in the editor; that's where the item should
appear.

Board rows work on every KiCad version, via `pcbnew.FocusOnItem()`, resolving the
diff item back to a live `BOARD_ITEM` by uuid (with a footprint-reference fallback,
since traces and vias are keyed by geometry rather than uuid).

**Schematic rows are not clickable, on any current KiCad.** KiCad 8 has no
schematic Python API at all. KiCad 9's IPC API (`kipy`, from the `kicad-python`
package) can *read* the schematic selection but not set it — `add_to_selection`
exists for board documents only. Rather than ship a row that throws on first click,
schematic rows render identically but stay inert. `crossprobe.schematic_probe_available()`
is the single place to flip when the API gains the capability.

## Theming

`kicad_plugin/prism_theme.py` mirrors the web app's palette (the shadcn HSL tokens
in `frontend/src/index.css`, converted to hex). The dialog follows the OS/KiCad
light-or-dark appearance rather than forcing one — a light dialog inside a dark
KiCad looks broken.

If the web theme changes, regenerate those values rather than eyeballing new ones.

The buttons, badges and cards in `widgets.py` are **owner-drawn** on a `wx.Panel`
rather than being native controls. That looks like overkill until you try the
obvious thing: on Windows `wx.Button` is a native control that *ignores*
`SetBackgroundColour`, so giving it the app's light-on-blue primary style yields
light text on an unchanged light background — invisible. Drawing them ourselves is
the only reliable way to match the web UI's filled buttons, and it makes the
hover/press states behave the same on every platform.

## Layout

```
tools/
  agent_main.py         PyInstaller entry point (see below)
  build_agent.py        builds the agent into one executable
  package_plugin.py     assembles the KiCad PCM zip
  install_plugin.py     symlink the plugin into KiCad (development)

  prism_agent/          the agent — ships as a binary (source needs pystray+Pillow)
    __main__.py           tray icon, menu, lifecycle
    server.py             the loopback HTTP API
    projects.py           project detection + git status
    prism_client.py       Prism backend client
    discovery.py          how the plugin finds the agent
    version.py            VENDORED: version + compatibility rules (plugin/agent/server)
    loopback.py           VENDORED: the one client for the agent's loopback API
    profiles.py           VENDORED: run profiles (dev/release)
    settings.py           persisted settings
    autostart.py          run at login (per-OS)
    protocol.py           prism:// links (per-OS)
    worktree_diff.py      uncommitted changes: HEAD vs disk
    assets/               the Prism logo (tray icon)

  kicad_plugin/         the plugin (stdlib + KiCad's wx only)
    __init__.py           the pcbnew ActionPlugin
    first_run.py          setup on first launch
    dialog.py             the main dialog
    settings_dialog.py    settings
    widgets.py            owner-drawn Button/Badge/Card/ScrollThumb
    crossprobe.py         jump to a changed item inside KiCad
    agent_launcher.py     finds and starts the agent binary
    agent_client.py       talks to the agent (over loopback.py)
    git_workflow.py       git decisions the dialog renders (publish, push, commit, switch)
    version.py, loopback.py, profiles.py   vendored copies of the agent's
    prism_theme.py        the palette
    assets/, icon.png     the Prism logo
```

Four things in here look redundant and aren't:

**`agent_main.py`** exists because PyInstaller runs its entry script with no package
context, so pointing it at `prism_agent/__main__.py` dies on the first relative
import.

**`discovery.py` is duplicated in miniature inside `agent_client.py`.** The plugin
is installed on its own and cannot import the agent package. Both are tiny; keep
them in sync.

**`version.py`, `loopback.py` and `profiles.py` exist in both packages.** Same
reason. They are byte-identical copies rather than mirrors, so there is one set of
compatibility rules, one loopback client and one profile registry;
`tests/test_vendored_parity.py` fails the moment a copy differs. Edit one, copy it
over the other. Bumping the version means editing `version.py` in both.

**The noise classifier is shared, not copied.** The agent loads the backend's own
`kicad_noise_service` by path (and bundles it into the binary) rather than keeping a
second copy that would drift.
