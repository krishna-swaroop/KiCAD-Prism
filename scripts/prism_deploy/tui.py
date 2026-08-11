"""A small terminal UI toolkit: colour, panels, and prompts.

Standard library only, so the installer runs on any host that can already run
Prism. Degrades in three steps rather than breaking:

1. full colour and arrow-key menus on a TTY;
2. colour with numeric menus where raw key reads are unavailable;
3. plain text with no escape sequences when NO_COLOR is set or stdout is a pipe.
"""

from __future__ import annotations

import os
import re
import shutil
import sys

_ANSI = re.compile(r"\x1b\[[0-9;]*m")

MAX_WIDTH = 78


def _enable_windows_vt() -> bool:
    """Turn on virtual terminal processing so Windows renders ANSI sequences."""
    try:
        import ctypes

        kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
        # -11 is STD_OUTPUT_HANDLE, 0x0004 is ENABLE_VIRTUAL_TERMINAL_PROCESSING.
        handle = kernel32.GetStdHandle(-11)
        mode = ctypes.c_ulong()
        if not kernel32.GetConsoleMode(handle, ctypes.byref(mode)):
            return False
        return bool(kernel32.SetConsoleMode(handle, mode.value | 0x0004))
    except Exception:
        return False


def _supports_colour() -> bool:
    if os.environ.get("NO_COLOR"):
        return False
    if os.environ.get("FORCE_COLOR"):
        return True
    if not sys.stdout.isatty():
        return False
    if os.name == "nt":
        return _enable_windows_vt()
    return os.environ.get("TERM", "") not in ("", "dumb")


COLOUR = _supports_colour()


def _c(code: str) -> str:
    return code if COLOUR else ""


def _truecolour() -> bool:
    return os.environ.get("COLORTERM", "").lower() in ("truecolor", "24bit")


def _rgb(red: int, green: int, blue: int, fallback: int) -> str:
    """24-bit colour where the terminal advertises it, else the closest xterm index."""
    if not COLOUR:
        return ""
    if _truecolour():
        return f"\x1b[38;2;{red};{green};{blue}m"
    return f"\x1b[38;5;{fallback}m"


# shadcn/ui default primary, hsl(221.2 83.2% 53.3%) == #2563eb.
ACCENT = _rgb(0x25, 0x63, 0xEB, 27)
# The 400-weight step above it, for supporting detail that should not compete.
ACCENT_SOFT = _rgb(0x60, 0xA5, 0xFA, 75)
DIM = _c("\x1b[2m")
BOLD = _c("\x1b[1m")
GREEN = _rgb(0x16, 0xA3, 0x4A, 71)
RED = _rgb(0xDC, 0x26, 0x26, 167)
YELLOW = _rgb(0xCA, 0x8A, 0x04, 179)
BLUE = ACCENT_SOFT
RESET = _c("\x1b[0m")

TICK = "✓"
CROSS = "✗"
ARROW = "❯"
BULLET = "•"


def visible_len(text: str) -> int:
    return len(_ANSI.sub("", text))


def width() -> int:
    return min(shutil.get_terminal_size((80, 24)).columns - 2, MAX_WIDTH)


def write(text: str = "") -> None:
    sys.stdout.write(text + "\n")
    sys.stdout.flush()


def banner(title: str, subtitle: str = "") -> None:
    w = width()
    write()
    write(f"{ACCENT}╭{'─' * (w - 2)}╮{RESET}")
    pad = w - 4 - visible_len(title)
    write(f"{ACCENT}│{RESET} {BOLD}{title}{RESET}{' ' * pad} {ACCENT}│{RESET}")
    if subtitle:
        pad = w - 4 - visible_len(subtitle)
        write(f"{ACCENT}│{RESET} {DIM}{subtitle}{RESET}{' ' * pad} {ACCENT}│{RESET}")
    write(f"{ACCENT}╰{'─' * (w - 2)}╯{RESET}")


def section(number: str, title: str) -> None:
    write()
    write()
    label = f"{ACCENT}{number}{RESET}  " if number else ""
    write(f"{label}{BOLD}{title}{RESET}")
    write(f"{DIM}{'─' * width()}{RESET}")


def panel(title: str, rows: list[tuple[str, str]]) -> None:
    """A titled box of label/value pairs, used for the confirmation summary."""
    w = width()
    label_w = max((visible_len(label) for label, _ in rows), default=0)
    write(f"{DIM}╭─{RESET} {BOLD}{title}{RESET} {DIM}{'─' * max(0, w - 5 - visible_len(title))}{RESET}")
    for label, value in rows:
        gap = " " * (label_w - visible_len(label))
        write(f"{DIM}│{RESET} {DIM}{label}{RESET}{gap}  {value}")
    write(f"{DIM}╰{'─' * (w - 1)}{RESET}")


def info(text: str) -> None:
    write(f"  {DIM}{text}{RESET}")


def note(text: str) -> None:
    write(f"  {BLUE}{BULLET}{RESET} {text}")


def ok(text: str, detail: str = "") -> None:
    tail = f" {DIM}{detail}{RESET}" if detail else ""
    write(f"  {GREEN}{TICK}{RESET} {text}{tail}")


def warn(text: str, detail: str = "") -> None:
    tail = f"\n      {DIM}{detail}{RESET}" if detail else ""
    write(f"  {YELLOW}!{RESET} {text}{tail}")


def fail(text: str, detail: str = "") -> None:
    tail = f"\n      {DIM}{detail}{RESET}" if detail else ""
    write(f"  {RED}{CROSS}{RESET} {text}{tail}")


def hint(text: str) -> None:
    write(f"  {DIM}{text}{RESET}")


class Abort(Exception):
    """Raised when the operator cancels the interview."""


def _read_key() -> str:
    """Read one keypress. Returns 'up', 'down', 'enter', 'quit', or a character."""
    if os.name == "nt":
        import msvcrt

        ch = msvcrt.getwch()
        if ch in ("\x00", "\xe0"):
            code = msvcrt.getwch()
            return {"H": "up", "P": "down"}.get(code, "other")
        if ch in ("\r", "\n"):
            return "enter"
        if ch == "\x03":
            return "quit"
        return ch

    import termios
    import tty

    fd = sys.stdin.fileno()
    saved = termios.tcgetattr(fd)
    try:
        tty.setraw(fd)
        ch = os.read(fd, 1).decode(errors="ignore")
        if ch == "\x1b":
            seq = os.read(fd, 2).decode(errors="ignore")
            return {"[A": "up", "[B": "down"}.get(seq, "other")
        if ch in ("\r", "\n"):
            return "enter"
        if ch == "\x03":
            return "quit"
        return ch
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, saved)


def _interactive() -> bool:
    return sys.stdin.isatty() and sys.stdout.isatty()


def _fit(text: str, limit: int) -> str:
    """Shorten to `limit` columns, ellipsising rather than wrapping."""
    if limit <= 1:
        return ""
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _short_url(url: str) -> str:
    """Drop the scheme so a link reads as a reference, not a wall of text."""
    return url.replace("https://", "").replace("http://", "").rstrip("/")


def _context(description: str = "", example: str = "", docs: str = "") -> None:
    """Explanation, a worked example, and where to read more.

    Printed as one indented block with a blank line either side, so the eye
    separates 'what this is' from 'what to type'.
    """
    if not (description or example or docs):
        return
    write()
    for line in description.split("\n") if description else []:
        write(f"  {DIM}{line}{RESET}")
    if example:
        write(f"  {DIM}e.g.{RESET} {ACCENT_SOFT}{example}{RESET}")
    if docs:
        write(f"  {DIM}↳ {_short_url(docs)}{RESET}")


def select(
    question: str,
    options: list[tuple[str, str, str]],
    default: int = 0,
    *,
    description: str = "",
    docs: str = "",
) -> str:
    """Choose one option. Each option is (value, label, description).

    Uses arrow keys on a TTY and falls back to numbered entry otherwise.
    """
    write()
    write(f"  {BOLD}{question}{RESET}")
    _context(description, docs=docs)
    write()

    if not _interactive():
        write()
        for index, (_, label, description) in enumerate(options, 1):
            write(f"    {index}. {label} {DIM}{description}{RESET}")
        while True:
            raw = input(f"  Select [1-{len(options)}] ({default + 1}): ").strip()
            if not raw:
                return options[default][0]
            if raw.isdigit() and 1 <= int(raw) <= len(options):
                return options[int(raw) - 1][0]
            fail(f"Enter a number between 1 and {len(options)}.")

    write(f"  {DIM}↑↓ move · enter select{RESET}")
    write()
    cursor = default
    rendered = False
    while True:
        if rendered:
            sys.stdout.write(f"\x1b[{len(options)}A")
        limit = width()
        # One column for labels so the descriptions line up and the list scans
        # vertically instead of raggedly.
        label_w = max(len(label) for _, label, _ in options)
        for index, (_, label, description) in enumerate(options):
            sys.stdout.write("\x1b[2K")
            # Each row must occupy exactly one line: the redraw moves the cursor
            # up by len(options), so a wrapped row corrupts the whole menu.
            detail = _fit(description, limit - label_w - 8)
            pad = " " * (label_w - len(label))
            if index == cursor:
                sys.stdout.write(f"  {ACCENT}{ARROW}{RESET} {BOLD}{label}{RESET}{pad}   {DIM}{detail}{RESET}\n")
            else:
                sys.stdout.write(f"    {label}{pad}   {DIM}{detail}{RESET}\n")
        sys.stdout.flush()
        rendered = True

        key = _read_key()
        if key == "up":
            cursor = (cursor - 1) % len(options)
        elif key == "down":
            cursor = (cursor + 1) % len(options)
        elif key == "enter":
            write()
            return options[cursor][0]
        elif key == "quit":
            raise Abort()
        elif key.isdigit() and 1 <= int(key) <= len(options):
            cursor = int(key) - 1


def ask(
    label: str,
    *,
    default: str = "",
    description: str = "",
    example: str = "",
    docs: str = "",
    validate=None,
    allow_empty: bool = False,
) -> str:
    """Prompt for a line of text, re-asking until `validate` accepts it."""
    write()
    write(f"  {BOLD}{label}{RESET}")
    _context(description, example, docs)
    write()
    suffix = f" {DIM}({default}){RESET}" if default else ""
    while True:
        try:
            raw = input(f"  {ACCENT}{ARROW}{RESET}{suffix} ").strip()
        except EOFError as exc:
            raise Abort() from exc
        value = raw or default
        if not value and not allow_empty:
            fail("A value is required.")
            continue
        if validate:
            problem = validate(value)
            if problem:
                fail(problem)
                continue
        return value


def ask_secret(label: str, *, description: str = "", example: str = "", docs: str = "", validate=None) -> str:
    """Prompt without echoing. Keeps credentials out of scrollback and history."""
    import getpass

    write()
    write(f"  {BOLD}{label}{RESET}")
    _context(description, example, docs)
    write()
    while True:
        try:
            value = getpass.getpass(f"  {ARROW} ").strip()
        except EOFError as exc:
            raise Abort() from exc
        if not value:
            fail("A value is required.")
            continue
        if validate:
            problem = validate(value)
            if problem:
                fail(problem)
                continue
        return value


def confirm(label: str, *, default: bool = True, description: str = "", docs: str = "") -> bool:
    write()
    write(f"  {BOLD}{label}{RESET}")
    _context(description, docs=docs)
    write()
    choices = "Y/n" if default else "y/N"
    while True:
        try:
            raw = input(f"  {ACCENT}{ARROW}{RESET} {DIM}[{choices}]{RESET} ").strip().lower()
        except EOFError as exc:
            raise Abort() from exc
        if not raw:
            return default
        if raw in ("y", "yes"):
            return True
        if raw in ("n", "no"):
            return False
        fail("Answer y or n.")
