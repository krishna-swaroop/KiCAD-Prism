"""Themed widgets that actually look like the web app.

Why these exist: on Windows, wx.Button is a native control that *ignores*
SetBackgroundColour. Setting a light foreground on it therefore produces light
text on the unchanged light native background, invisible. The only reliable way
to get the app's filled "primary" button is to own the drawing.

These are owner-drawn on a wx.Panel: we control the fill, the radius, the hover
and press states, and the text colour, so they render identically on every
platform and genuinely match the web UI's button styles.
"""

from __future__ import annotations

import math
from functools import lru_cache

import wx

from . import prism_theme as th


@lru_cache(maxsize=1)
def _font_faces():
    return set(wx.FontEnumerator.GetFacenames())


def ui_font(window, size=None, weight=wx.FONTWEIGHT_NORMAL, mono=False):
    """Use installed Inter, otherwise the native GUI face; never modify KiCad.

    Point-size fonts are already scaled by wx. FromDIP is for geometry only,
    not a second scale factor on fonts. Native text entry keeps IME/clipboard.
    """
    font = wx.SystemSettings.GetFont(wx.SYS_DEFAULT_GUI_FONT)
    candidates = ("SF Mono", "Menlo", "Consolas", "DejaVu Sans Mono") if mono else (
        "Inter", "Inter Variable"
    )
    if mono:
        font.SetFamily(wx.FONTFAMILY_TELETYPE)
    for face in candidates:
        if face in _font_faces():
            font.SetFaceName(face)
            break
    font.SetFractionalPointSize(th.FONT_BODY if size is None else size)
    font.SetWeight(weight)
    return font


def _c(hex_value: str) -> wx.Colour:
    return wx.Colour(*th.hex_to_rgb(hex_value))


def _surface_of(window: wx.Window, pal: dict) -> wx.Colour:
    """The colour a transparent widget must paint before drawing on itself.

    NOT GetParent().GetBackgroundColour(): a TRANSPARENT_WINDOW that never had its
    background set reports wx's default #F0F0F0 regardless of theme. Rows nested in
    a Card were therefore painting a near-white block and then drawing dark-theme
    (near-white) text on it, the unreadable white-on-white list.

    So widgets carry the surface they sit on explicitly. Walk up to the nearest
    ancestor that declares one; fall back to the theme's page background.
    """
    node = window.GetParent()
    while node is not None:
        surface = getattr(node, "surface", None)
        if surface is not None:
            return _c(surface) if isinstance(surface, str) else surface
        node = node.GetParent()
    return _c(pal["background"])


def fit_width_to_content(dialog: wx.Dialog, scroll: wx.Window, content: wx.Sizer):
    """Widen `dialog` until `content` fits `scroll`, so nothing clips on the right.

    Both dialogs scroll only vertically, so a card wider than the window loses its
    right edge with no way to reach it. No fixed default is right for every card,
    font and DPI, so take the minimum from the laid-out content instead.

    The content is only part of it. The header (title, identity, status icons, the
    path line) sits outside the scroll area, and its row can need more than the
    scrolled cards do: measured live, the header wanted 570px in a 560px dialog while
    the content wanted 274, which squashed the last button to 10px. So the dialog's
    whole root sizer counts too, and the larger of the two wins.

    The non-content width (gutters, a scrollbar or ScrollThumb, the window frame) is
    measured from the dialog rather than summed from constants, so it stays right
    whatever the dialog puts beside the scroll area.

    Grow only, and never past 90% of the screen: a user who makes the window wider
    keeps that, and on a small display the cap wins over the content.
    """
    size = dialog.GetSize()
    frame = size.width - dialog.GetClientSize().width
    extra = size.width - scroll.GetClientSize().width
    need = content.GetMinSize().width + extra
    root = dialog.GetSizer()
    if root is not None:
        need = max(need, root.GetMinSize().width + frame)

    index = wx.Display.GetFromWindow(dialog)
    if index == wx.NOT_FOUND:
        index = 0
    cap = int(wx.Display(index).GetClientArea().width * 0.9)

    width = min(max(size.width, need), cap)
    if width > size.width:
        dialog.SetSize(wx.Size(width, size.height))
        dialog.Layout()


def _mix(a: str, b: str, t: float) -> wx.Colour:
    """Blend two hex colours, used for hover/press states, like the web UI's
    hover:bg-primary/90."""
    ar, ag, ab = th.hex_to_rgb(a)
    br, bg, bb = th.hex_to_rgb(b)
    return wx.Colour(
        int(ar + (br - ar) * t),
        int(ag + (bg - ag) * t),
        int(ab + (bb - ab) * t),
    )


class Button(wx.Panel):
    """An owner-drawn button matching the web app's variants.

    variant: "primary"           filled blue, light text  (the app's default action)
             "secondary"         muted fill, normal text
             "ghost"             transparent until hovered
             "destructive-ghost" a ghost in red, for the one action that destroys
                                 something and must not look like its neighbour
    """

    RADIUS = 0
    PAD_X = th.CONTROL_PADDING_X
    ICON = 15
    ICON_GAP = 6

    def __init__(self, parent, label, pal, variant="secondary", on_click=None,
                 icon=None, size=None):
        super().__init__(parent, style=wx.TRANSPARENT_WINDOW)
        self.label = label
        self.pal = pal
        self.variant = variant
        self.on_click = on_click
        # None = the default height; "sm" = the web's h-7, for compact actions
        # that sit inside rows (Stage/Unstage) next to normal-height primaries.
        self.size = size
        # An optional glyph before the label, e.g. "open" for Open + the same
        # ExternalLink icon the web UI's "Open in KiCad" button uses.
        self.icon = icon
        self._hover = False
        self._pressed = False

        self.SetBackgroundStyle(wx.BG_STYLE_PAINT)  # we paint every pixel
        self.SetFont(ui_font(self, weight=wx.FONTWEIGHT_MEDIUM))
        self.SetName(label)
        self.SetCursor(wx.Cursor(wx.CURSOR_HAND))
        self.SetMinSize(self._measure())

        self.Bind(wx.EVT_PAINT, self._on_paint)
        self.Bind(wx.EVT_ENTER_WINDOW, self._on_enter)
        self.Bind(wx.EVT_LEAVE_WINDOW, self._on_leave)
        self.Bind(wx.EVT_LEFT_DOWN, self._on_down)
        self.Bind(wx.EVT_LEFT_UP, self._on_up)
        self.Bind(wx.EVT_MOUSE_CAPTURE_LOST, self._on_capture_lost)
        self.Bind(wx.EVT_SET_FOCUS, self._on_focus)
        self.Bind(wx.EVT_KILL_FOCUS, self._on_focus)
        self.Bind(wx.EVT_KEY_DOWN, self._on_key_down)
        self.Bind(wx.EVT_KEY_UP, self._on_key_up)

    def AcceptsFocus(self):
        return self.IsEnabled()

    def AcceptsFocusFromKeyboard(self):
        return self.IsEnabled()

    # -- sizing ------------------------------------------------------------

    def _font(self) -> wx.Font:
        return ui_font(self, weight=wx.FONTWEIGHT_MEDIUM)

    def _control_height(self) -> int:
        return th.CONTROL_SM if self.size == "sm" else th.CONTROL_HEIGHT

    def _measure(self) -> wx.Size:
        dc = wx.ClientDC(self)
        dc.SetFont(self._font())
        w, h = dc.GetTextExtent(self.label)
        if self.icon:
            w += self.FromDIP(self.ICON + self.ICON_GAP)
        return wx.Size(w + self.FromDIP(self.PAD_X * 2),
                       max(self.FromDIP(self._control_height()), h + self.FromDIP(8)))

    # -- state -------------------------------------------------------------

    def Enable(self, enable=True):  # noqa: N802 - wx naming
        # No Python-side enabled mirror: C++ Disable() calls Enable() in C++ and
        # would leave a mirror stale, so IsEnabled() is the only source of truth.
        self.SetCursor(wx.Cursor(wx.CURSOR_HAND if enable else wx.CURSOR_ARROW))
        self.Refresh()
        return super().Enable(enable)

    def _on_enter(self, _e):
        self._hover = True
        self.Refresh()

    def _on_leave(self, _e):
        self._hover = False
        self.Refresh()

    def _on_down(self, _e):
        if self.IsEnabled():
            self.SetFocus()
            self.CaptureMouse()
            self._pressed = True
            self.Refresh()

    def _on_up(self, event):
        was_pressed = self._pressed
        if self.HasCapture():
            self.ReleaseMouse()
        self._pressed = False
        self.Refresh()
        if (was_pressed and self.GetClientRect().Contains(event.GetPosition())
                and self.IsEnabled() and self.on_click):
            self.on_click()

    def _on_capture_lost(self, _e):
        self._pressed = False
        self.Refresh()

    def _on_focus(self, event):
        self._pressed = False
        self.Refresh()
        event.Skip()

    def _on_key_down(self, event):
        if event.GetKeyCode() in (wx.WXK_SPACE, wx.WXK_RETURN, wx.WXK_NUMPAD_ENTER):
            if self.IsEnabled():
                self._pressed = True
                self.Refresh()
            return
        event.Skip()

    def _on_key_up(self, event):
        if event.GetKeyCode() in (wx.WXK_SPACE, wx.WXK_RETURN, wx.WXK_NUMPAD_ENTER):
            activate = self._pressed and self.IsEnabled()
            self._pressed = False
            self.Refresh()
            if activate and self.on_click:
                self.on_click()
            return
        event.Skip()

    def _draw_focus(self, gc, w, h):
        if self.HasFocus():
            gc.SetBrush(wx.TRANSPARENT_BRUSH)
            gc.SetPen(wx.Pen(_c(self.pal["primary"]), self.FromDIP(1)))
            gc.DrawRectangle(1.5, 1.5, max(0, w - 3), max(0, h - 3))

    # -- painting ----------------------------------------------------------

    def _colours(self) -> tuple[wx.Colour, wx.Colour, wx.Colour | None]:
        """(fill, text, border)"""
        p = self.pal
        if not self.IsEnabled():
            return _c(p["muted"]), _c(p["muted_fg"]), None

        if self.variant == "primary":
            fill = p["primary"]
            # Darken on hover/press, mirroring hover:bg-primary/90 in the web UI.
            if self._pressed:
                return _mix(fill, p["foreground"], 0.25), _c(p["primary_fg"]), None
            if self._hover:
                return _mix(fill, p["foreground"], 0.12), _c(p["primary_fg"]), None
            return _c(fill), _c(p["primary_fg"]), None

        if self.variant == "ghost":
            if self._pressed or self._hover:
                return _c(p["accent"]), _c(p["foreground"]), None
            return None, _c(p["muted_fg"]), None

        if self.variant == "destructive-ghost":
            # Quiet like a ghost, because it sits beside ordinary actions and should not
            # shout. Red, because it destroys something and must never read as the safe
            # twin of the button next to it. Deepens rather than fills on hover: a red
            # slab under the cursor is a fine way to make someone click it by reflex.
            if self._pressed or self._hover:
                return (
                    _mix(p["destructive"], p["background"], 0.85),
                    _c(p["destructive"]),
                    None,
                )
            return None, _c(p["destructive"]), None

        # secondary
        if self._pressed:
            return (
                _mix(p["muted"], p["foreground"], 0.12),
                _c(p["foreground"]),
                _c(p["border"]),
            )
        if self._hover:
            return _c(p["accent"]), _c(p["foreground"]), _c(p["border"])
        return _c(p["muted"]), _c(p["foreground"]), _c(p["border"])

    def _on_paint(self, _e):
        dc = wx.AutoBufferedPaintDC(self)
        gc = wx.GraphicsContext.Create(dc)
        if not gc:
            return

        w, h = self.GetSize()
        # Paint the parent's colour first so our rounded corners aren't boxed in.
        dc.SetBackground(wx.Brush(_surface_of(self, self.pal)))
        dc.Clear()

        fill, text_colour, border = self._colours()

        if fill is not None:
            gc.SetBrush(wx.Brush(fill))
            gc.SetPen(wx.Pen(border) if border else wx.TRANSPARENT_PEN)
            gc.DrawRectangle(0.5, 0.5, w - 1, h - 1)

        self._draw_focus(gc, w, h)

        gc.SetFont(self._font(), text_colour)
        tw, tht = gc.GetTextExtent(self.label)[:2]

        if self.icon:
            icon_size = self.FromDIP(self.ICON)
            icon_gap = self.FromDIP(self.ICON_GAP)
            content_w = icon_size + icon_gap + tw
            x = (w - content_w) / 2
            draw_kind_icon(
                gc, self.icon, x, (h - icon_size) / 2, text_colour, size=icon_size
            )
            gc.DrawText(self.label, x + icon_size + icon_gap, (h - tht) / 2)
        else:
            gc.DrawText(self.label, (w - tw) / 2, (h - tht) / 2)


class IconButton(Button):
    """A square Button carrying a drawn icon instead of a label.

    Inherits every bit of Button's behaviour (hover, press, variants, colours), so an
    icon action sits in a row of text buttons without looking like a different widget.
    The tooltip is required, not decorative: an icon alone does not say what it does.
    """

    ICON = 16
    # Space between the icon and a count sitting beside it.
    COUNT_GAP = 5

    def __init__(
        self, parent, kind, pal, tooltip, variant="ghost", on_click=None, count=None,
        size=None,
    ):
        self.kind = kind
        # A number carried INSIDE the button rather than a separate badge next to it:
        # the count belongs to the action, and a pill floating beside the outline read
        # as a second thing to click.
        self.count = count
        super().__init__(parent, "", pal, variant=variant, on_click=on_click, size=size)
        self.SetToolTip(tooltip)
        self.SetName(tooltip)

    def _count_text(self) -> str:
        return "" if self.count is None else str(self.count)

    def _count_width(self) -> int:
        """How much room the count needs, measured in the font it is drawn in."""
        text = self._count_text()
        if not text:
            return 0
        dc = wx.ClientDC(self)
        dc.SetFont(self._count_font())
        return dc.GetTextExtent(text).GetWidth() + self.FromDIP(self.COUNT_GAP)

    def _count_font(self) -> wx.Font:
        font = self.GetFont()
        font.SetPointSize(th.FONT_SMALL)
        return font

    def _measure(self) -> wx.Size:
        # Same fixed height as the text buttons it sits beside, independent of
        # label/font metrics.
        side = self.FromDIP(self._control_height())
        # A count widens the button rather than changing its height or its outline, so
        # it still reads as the same control in the row.
        return wx.Size(side + self._count_width(), side)

    def _on_paint(self, _e):
        dc = wx.AutoBufferedPaintDC(self)
        gc = wx.GraphicsContext.Create(dc)
        if not gc:
            return

        w, h = self.GetSize()
        dc.SetBackground(wx.Brush(_surface_of(self, self.pal)))
        dc.Clear()

        fill, icon_colour, border = self._colours()
        if fill is not None:
            gc.SetBrush(wx.Brush(fill))
            gc.SetPen(wx.Pen(border) if border else wx.TRANSPARENT_PEN)
            gc.DrawRectangle(0.5, 0.5, w - 1, h - 1)

        self._draw_focus(gc, w, h)

        text = self._count_text()
        # Icon and count are centred as a pair, so a two-digit count does not shove the
        # icon off to one side.
        icon_size = self.FromDIP(self.ICON)
        content = icon_size + self._count_width()
        x = (w - content) / 2

        draw_kind_icon(
            gc,
            self.kind,
            x,
            (h - icon_size) / 2,
            icon_colour,
            size=icon_size,
        )

        if text:
            gc.SetFont(self._count_font(), icon_colour)
            tw, th_, *_ = gc.GetTextExtent(text)
            gc.DrawText(text, x + icon_size + self.FromDIP(self.COUNT_GAP), (h - th_) / 2)


class StatusIcon(wx.Panel):
    """An icon whose colour carries its state, with a tooltip that says it in words.

    Colour alone is not a status: it means nothing to someone who can't see it, and
    nothing to someone who doesn't know the convention. So the tooltip is not optional,
    it is the actual message, and the colour is the shortcut.
    """

    SIZE = 18

    def __init__(self, parent, kind, pal, tone="muted_fg", tooltip=""):
        super().__init__(parent, style=wx.TRANSPARENT_WINDOW)
        self.kind = kind  # server | project
        self.pal = pal
        self.tone = tone
        self.SetBackgroundStyle(wx.BG_STYLE_PAINT)
        self.SetMinSize(wx.Size(self.SIZE + 8, self.SIZE + 8))
        self.SetToolTip(tooltip)
        self.Bind(wx.EVT_PAINT, self._on_paint)

    def set(self, tone: str, tooltip: str) -> None:
        self.tone = tone
        self.SetToolTip(tooltip)
        self.Refresh()

    def _on_paint(self, _e):
        dc = wx.AutoBufferedPaintDC(self)
        gc = wx.GraphicsContext.Create(dc)
        if not gc:
            return
        dc.SetBackground(wx.Brush(_surface_of(self, self.pal)))
        dc.Clear()

        w, h = self.GetSize()
        colour = _c(self.pal.get(self.tone, self.pal["muted_fg"]))
        draw_kind_icon(
            gc,
            self.kind,
            (w - self.SIZE) / 2,
            (h - self.SIZE) / 2,
            colour,
            size=self.SIZE,
        )


class Badge(wx.Panel):
    """A status pill, like the chips in the web app."""

    RADIUS = 0

    def __init__(self, parent, label, pal, tone="muted", size=None, on_click=None):
        super().__init__(parent, style=wx.TRANSPARENT_WINDOW)
        self.label = label
        self.pal = pal
        self.tone = tone  # muted | success | warning | destructive | primary
        # Point size for the text. Defaults to the small type these pills normally use;
        # the branch tag wants a touch more presence.
        self.size = size or th.FONT_SMALL
        self.on_click = on_click
        self._hover = False
        self.SetBackgroundStyle(wx.BG_STYLE_PAINT)
        if on_click:
            # A clickable pill needs an affordance painted in, not just a cursor:
            # this deepens its fill on hover like the web's hover:bg-x/80 chips.
            self.SetCursor(wx.Cursor(wx.CURSOR_HAND))
            self.Bind(wx.EVT_ENTER_WINDOW, self._set_hover)
            self.Bind(wx.EVT_LEAVE_WINDOW, self._set_hover)
            self.Bind(wx.EVT_LEFT_UP, lambda _e: self.on_click())

        self._resize()
        # Bound ONCE, here. It used to live in _resize(), which set_label() calls, so
        # every relabel stacked another paint handler on the widget.
        self.Bind(wx.EVT_PAINT, self._on_paint)

    def _set_hover(self, event):
        self._hover = event.Enter()
        self.Refresh()

    def set_label(self, label: str, tone: str | None = None) -> None:
        """Relabel and resize. A badge built empty and filled in later (a branch name we
        don't know until the agent answers) would otherwise keep its zero width."""
        self.label = label
        if tone is not None:
            self.tone = tone
        self._resize()
        self.Refresh()

    def _resize(self) -> None:
        # Set the font on the window, then measure with it, so the size we reserve and
        # the size we paint agree. Falls back to a single character for an empty label
        # (the branch tag before the agent has answered) so the pill keeps a sane height.
        f = ui_font(self, self.size, wx.FONTWEIGHT_MEDIUM)
        self.SetFont(f)
        w, h = self.GetTextExtent(self.label or "x")
        self.SetMinSize(wx.Size(w + self.FromDIP(20),
                               max(self.FromDIP(24), h + self.FromDIP(6))))

    def _colours(self) -> tuple[str, str, float]:
        """(fill, text, how strongly to tint the fill).

        `muted` is a BACKGROUND colour (#F1F5F9 on light). Drawing text in it puts
        near-white on a white card, which is why the branch and SHA tags vanished. So a
        neutral badge fills with `muted` and takes its text from `muted_fg`, and fills
        fully, since that colour was chosen to sit behind text.

        The coloured tones are the opposite: the accent IS the text, and the fill is a
        faint wash of it (the web's `bg-x/10 text-x`). Tinting those as strongly as the
        neutral one drags the contrast under 2:1 and makes them unreadable.
        """
        if self.tone == "muted":
            fill, text, strength = self.pal["muted"], self.pal["muted_fg"], 1.0
        else:
            accent = self.pal.get(self.tone, self.pal["muted_fg"])
            fill, text, strength = accent, accent, 0.18
        if self._hover and self.on_click:
            strength = min(1.0, strength + 0.12)
        return fill, text, strength

    def _on_paint(self, _e):
        dc = wx.AutoBufferedPaintDC(self)
        gc = wx.GraphicsContext.Create(dc)
        if not gc:
            return
        dc.SetBackground(wx.Brush(_surface_of(self, self.pal)))
        dc.Clear()

        w, h = self.GetSize()
        fill, text, strength = self._colours()

        # Tint against the surface we're actually on (a card), not the page: on a dark
        # card, blending toward the page colour would wash the pill out.
        surface = _surface_of(self, self.pal)
        gc.SetBrush(
            wx.Brush(_mix(surface.GetAsString(wx.C2S_HTML_SYNTAX), fill, strength))
        )
        gc.SetPen(wx.TRANSPARENT_PEN)
        gc.DrawRectangle(0, 0, w, h)

        f = ui_font(self, self.size, wx.FONTWEIGHT_MEDIUM)
        gc.SetFont(f, _c(text))
        tw, tht = gc.GetTextExtent(self.label)[:2]
        gc.DrawText(self.label, (w - tw) / 2, (h - tht) / 2)


def _ellipsise(gc, text: str, max_width: float) -> str:
    """Trim text to fit, with an ellipsis.

    Measured rather than cut at a character count: the labels are proportional, so
    a fixed length would clip "GND, 12 wires" and "J102 (Η1)" inconsistently.
    """
    if max_width <= 0 or not text:
        return ""
    if gc.GetTextExtent(text)[0] <= max_width:
        return text
    lo, hi = 0, len(text)
    while lo < hi:
        mid = (lo + hi) // 2
        if gc.GetTextExtent(text[:mid] + "...")[0] <= max_width:
            lo = mid + 1
        else:
            hi = mid
    return text[: max(0, lo - 1)] + "..."


def draw_kind_icon(
    gc, kind: str, x: float, y: float, colour: wx.Colour, size: float = 13
):
    """The web UI's file-kind icons, redrawn for wx.

    These are lucide's `CircuitBoard` (schematics) and `Cpu` (PCBs), the very
    icons frontend/src/components/history-viewer.tsx uses for the same job, so a
    file reads the same in KiCad as it does in the browser. The geometry is
    transcribed from lucide's 24x24 grid and scaled, not approximated by eye, and
    drawn rather than bitmapped so it stays crisp at any DPI and picks up the theme
    colour for free.
    """
    s = size / 24.0  # lucide authors on a 24x24 grid

    def px(a, b):
        return x + a * s, y + b * s

    # wx.Pen's width is an INT, passing a float raises TypeError, and inside a
    # paint handler that aborts the rest of the render (which is exactly why the
    # filename and count pill were missing). CreatePen takes a float.
    gc.SetPen(gc.CreatePen(wx.GraphicsPenInfo(colour).Width(1.5)))
    gc.SetBrush(wx.TRANSPARENT_BRUSH)

    if kind == "agent":
        # lucide "activity": a heartbeat trace. Reads as "this thing is alive", which is
        # exactly and only what the agent icon claims.
        pulse = gc.CreatePath()
        pulse.MoveToPoint(*px(22, 12))
        pulse.AddLineToPoint(*px(18, 12))
        pulse.AddLineToPoint(*px(15, 21))
        pulse.AddLineToPoint(*px(9, 3))
        pulse.AddLineToPoint(*px(6, 12))
        pulse.AddLineToPoint(*px(2, 12))
        gc.StrokePath(pulse)
        return

    if kind == "sch":
        # lucide "circuit-board": board outline, two traces, two pads.
        board = gc.CreatePath()
        board.AddRoundedRectangle(*px(3, 3), 18 * s, 18 * s, 2 * s)
        gc.StrokePath(board)

        traces = gc.CreatePath()
        traces.MoveToPoint(*px(11, 9))  # M11 9h4a2 2 0 0 0 2-2V3
        traces.AddLineToPoint(*px(15, 9))
        traces.AddLineToPoint(*px(17, 7))
        traces.AddLineToPoint(*px(17, 3))
        traces.MoveToPoint(*px(7, 21))  # M7 21v-4a2 2 0 0 1 2-2h4
        traces.AddLineToPoint(*px(7, 17))
        traces.AddLineToPoint(*px(9, 15))
        traces.AddLineToPoint(*px(13, 15))
        gc.StrokePath(traces)

        for cx, cy in ((9, 9), (15, 15)):  # the two pads
            pad = gc.CreatePath()
            pad.AddCircle(*px(cx, cy), 2 * s)
            gc.StrokePath(pad)
        return

    if kind == "pcb":
        # lucide "cpu": chip body, inner die, twelve pins.
        body = gc.CreatePath()
        body.AddRoundedRectangle(*px(4, 4), 16 * s, 16 * s, 2 * s)
        gc.StrokePath(body)

        die = gc.CreatePath()
        die.AddRoundedRectangle(*px(8, 8), 8 * s, 8 * s, 1 * s)
        gc.StrokePath(die)

        pins = gc.CreatePath()
        for a in (7, 12, 17):
            pins.MoveToPoint(*px(a, 2))  # top
            pins.AddLineToPoint(*px(a, 4))
            pins.MoveToPoint(*px(a, 20))  # bottom
            pins.AddLineToPoint(*px(a, 22))
            pins.MoveToPoint(*px(2, a))  # left
            pins.AddLineToPoint(*px(4, a))
            pins.MoveToPoint(*px(20, a))  # right
            pins.AddLineToPoint(*px(22, a))
        gc.StrokePath(pins)
        return

    if kind == "server":
        # lucide "server": two stacked racks, each with an LED.
        for top in (2, 14):
            rack = gc.CreatePath()
            rack.AddRoundedRectangle(*px(2, top), 20 * s, 8 * s, 2 * s)
            gc.StrokePath(rack)

            led = gc.CreatePath()
            led.MoveToPoint(*px(6, top + 4))
            led.AddLineToPoint(*px(6.01, top + 4))
            gc.StrokePath(led)
        return

    if kind == "git":
        # lucide "git-branch": a trunk, a branch, and the three nodes.
        lines = gc.CreatePath()
        lines.MoveToPoint(*px(6, 9))  # trunk, below the top node
        lines.AddLineToPoint(*px(6, 15))
        lines.MoveToPoint(*px(18, 9))  # branch curving down into the trunk
        lines.AddLineToPoint(*px(18, 11))
        lines.AddCurveToPoint(*px(18, 13), *px(16, 15), *px(12, 15))
        lines.AddLineToPoint(*px(9, 15))
        gc.StrokePath(lines)

        for cx, cy in ((6, 6), (18, 6), (6, 18)):
            node = gc.CreatePath()
            node.AddCircle(*px(cx, cy), 3 * s)
            gc.StrokePath(node)
        return

    if kind == "commit":
        # lucide "git-commit-horizontal": a node on a line, the commit on its branch.
        line = gc.CreatePath()
        line.MoveToPoint(*px(3, 12))
        line.AddLineToPoint(*px(9, 12))
        line.MoveToPoint(*px(15, 12))
        line.AddLineToPoint(*px(21, 12))
        gc.StrokePath(line)

        node = gc.CreatePath()
        node.AddCircle(*px(12, 12), 3 * s)
        gc.StrokePath(node)
        return

    if kind == "commit_tip":
        # The same node, but at the END of the line rather than on it: this is the tip
        # of the branch, not a commit somewhere along it. Distinct from "commit" at a
        # glance, which matters because the two sit one above the other while detached.
        line = gc.CreatePath()
        line.MoveToPoint(*px(3, 12))
        line.AddLineToPoint(*px(13, 12))
        gc.StrokePath(line)

        node = gc.CreatePath()
        node.AddCircle(*px(17, 12), 3.5 * s)
        gc.StrokePath(node)
        return

    if kind == "pull":
        # lucide "arrow-down-to-line": commits coming down onto your branch. Distinct
        # from the fetch arrows on purpose, fetch only looks, pull changes your files.
        arrow = gc.CreatePath()
        arrow.MoveToPoint(*px(12, 3))
        arrow.AddLineToPoint(*px(12, 15))
        gc.StrokePath(arrow)

        head = gc.CreatePath()
        head.MoveToPoint(*px(6, 11))
        head.AddLineToPoint(*px(12, 17))
        head.AddLineToPoint(*px(18, 11))
        gc.StrokePath(head)

        floor = gc.CreatePath()
        floor.MoveToPoint(*px(5, 21))
        floor.AddLineToPoint(*px(19, 21))
        gc.StrokePath(floor)
        return

    if kind == "fetch":
        # lucide "cloud-download": a cloud with a short arrow dropping out of it.
        # Fetch only looks at the remote, it does not touch your files, so it gets
        # the "checking what's out there" glyph rather than Pull's arrow-into-floor
        # (which means your branch just changed).
        cloud = gc.CreatePath()
        cloud.MoveToPoint(*px(4, 14.9))
        cloud.AddCurveToPoint(*px(2, 13.8), *px(1, 12), *px(1, 10.5))
        cloud.AddCurveToPoint(*px(1, 8), *px(3, 6), *px(5.5, 6))
        cloud.AddCurveToPoint(*px(6.2, 3.7), *px(8.3, 2), *px(10.8, 2))
        cloud.AddCurveToPoint(*px(13.9, 2), *px(16.4, 4.5), *px(16.4, 7.6))
        cloud.AddCurveToPoint(*px(16.4, 7.7), *px(16.4, 7.9), *px(16.4, 8))
        cloud.AddCurveToPoint(*px(19, 8.5), *px(21, 10.8), *px(21, 13.5))
        cloud.AddCurveToPoint(*px(21, 16.5), *px(18.5, 19), *px(15.5, 19))
        cloud.AddLineToPoint(*px(12.5, 19))
        gc.StrokePath(cloud)

        arrow = gc.CreatePath()
        arrow.MoveToPoint(*px(12, 13))
        arrow.AddLineToPoint(*px(12, 21))
        gc.StrokePath(arrow)

        head = gc.CreatePath()
        head.MoveToPoint(*px(9, 18))
        head.AddLineToPoint(*px(12, 21))
        head.AddLineToPoint(*px(15, 18))
        gc.StrokePath(head)
        return

    if kind == "stash":
        # lucide "archive": a lid over a box, with a handle on the drawer. Work put
        # away rather than thrown out, which is exactly what a stash is.
        lid = gc.CreatePath()
        lid.AddRoundedRectangle(*px(3, 3), 18 * s, 5 * s, 1 * s)
        gc.StrokePath(lid)

        box = gc.CreatePath()
        box.MoveToPoint(*px(5, 8))
        box.AddLineToPoint(*px(5, 20))
        box.AddCurveToPoint(*px(5, 20.5), *px(5.5, 21), *px(6, 21))
        box.AddLineToPoint(*px(18, 21))
        box.AddCurveToPoint(*px(18.5, 21), *px(19, 20.5), *px(19, 20))
        box.AddLineToPoint(*px(19, 8))
        gc.StrokePath(box)

        handle = gc.CreatePath()
        handle.MoveToPoint(*px(10, 12))
        handle.AddLineToPoint(*px(14, 12))
        gc.StrokePath(handle)
        return

    if kind == "trash":
        # lucide "trash-2": lid, can, and two slats. The one destructive action in the
        # panel, so it reads as a bin rather than as another word in a row of words.
        lid = gc.CreatePath()
        lid.MoveToPoint(*px(3, 6))
        lid.AddLineToPoint(*px(21, 6))
        gc.StrokePath(lid)

        handle = gc.CreatePath()
        handle.MoveToPoint(*px(8, 6))
        handle.AddLineToPoint(*px(8, 4))
        handle.AddLineToPoint(*px(16, 4))
        handle.AddLineToPoint(*px(16, 6))
        gc.StrokePath(handle)

        can = gc.CreatePath()
        can.MoveToPoint(*px(5, 6))
        can.AddLineToPoint(*px(6, 20))
        can.AddLineToPoint(*px(18, 20))
        can.AddLineToPoint(*px(19, 6))
        gc.StrokePath(can)

        slats = gc.CreatePath()
        slats.MoveToPoint(*px(10, 10))
        slats.AddLineToPoint(*px(10, 17))
        slats.MoveToPoint(*px(14, 10))
        slats.AddLineToPoint(*px(14, 17))
        gc.StrokePath(slats)
        return

    if kind == "library":
        # lucide "library": three books on a shelf, the middle one tilted.
        books = gc.CreatePath()
        books.MoveToPoint(*px(4, 4))  # upright
        books.AddLineToPoint(*px(4, 20))
        books.MoveToPoint(*px(8, 4))
        books.AddLineToPoint(*px(8, 20))
        books.MoveToPoint(*px(12, 4))  # tilted
        books.AddLineToPoint(*px(16, 20))
        books.MoveToPoint(*px(16, 3))
        books.AddLineToPoint(*px(20, 19))
        gc.StrokePath(books)

        shelf = gc.CreatePath()
        shelf.MoveToPoint(*px(2, 21))
        shelf.AddLineToPoint(*px(22, 21))
        gc.StrokePath(shelf)
        return

    if kind == "refresh":
        # lucide "refresh-cw", the same glyph as "fetch" below: two arcs with
        # arrowheads. Matches the web UI's Refresh button (RefreshCw).
        arcs = gc.CreatePath()
        arcs.MoveToPoint(*px(21, 12))
        arcs.AddCurveToPoint(*px(21, 7), *px(17, 3), *px(12, 3))
        arcs.AddCurveToPoint(*px(8.5, 3), *px(5.5, 5), *px(4, 8))
        arcs.MoveToPoint(*px(3, 12))
        arcs.AddCurveToPoint(*px(3, 17), *px(7, 21), *px(12, 21))
        arcs.AddCurveToPoint(*px(15.5, 21), *px(18.5, 19), *px(20, 16))
        gc.StrokePath(arcs)

        heads = gc.CreatePath()
        heads.MoveToPoint(*px(8, 8))
        heads.AddLineToPoint(*px(3, 8))
        heads.AddLineToPoint(*px(3, 3))
        heads.MoveToPoint(*px(16, 16))
        heads.AddLineToPoint(*px(21, 16))
        heads.AddLineToPoint(*px(21, 21))
        gc.StrokePath(heads)
        return

    if kind == "settings":
        # lucide "settings": a gear. Traced as one closed cog silhouette (outer
        # radius at each tooth, inner radius at each gap) rather than spokes stuck
        # onto a circle, so it reads as a gear rather than an asterisk in a ring.
        TEETH = 8
        R_OUT, R_IN, R_HOLE = 9.2, 6.6, 3.1
        HALF_TOOTH = math.radians(14)  # angular half-width of a tooth's flat top

        cog = gc.CreatePath()
        first = True
        for i in range(TEETH):
            centre = i * (2 * math.pi / TEETH) - math.pi / 2
            a0 = centre - HALF_TOOTH
            a1 = centre + HALF_TOOTH
            a_next = centre + (2 * math.pi / TEETH) - HALF_TOOTH

            p_out0 = px(12 + R_OUT * math.cos(a0), 12 + R_OUT * math.sin(a0))
            p_out1 = px(12 + R_OUT * math.cos(a1), 12 + R_OUT * math.sin(a1))
            p_in1 = px(12 + R_IN * math.cos(a1), 12 + R_IN * math.sin(a1))
            p_in0 = px(12 + R_IN * math.cos(a_next), 12 + R_IN * math.sin(a_next))

            if first:
                cog.MoveToPoint(*p_out0)
                first = False
            else:
                cog.AddLineToPoint(*p_out0)
            cog.AddLineToPoint(*p_out1)  # across the tooth's flat top
            cog.AddLineToPoint(*p_in1)  # down the tooth's trailing edge
            cog.AddLineToPoint(*p_in0)  # across the gap, at the inner radius
        cog.CloseSubpath()
        gc.StrokePath(cog)

        hole = gc.CreatePath()
        hole.AddCircle(*px(12, 12), R_HOLE * s)
        gc.StrokePath(hole)
        return

    if kind == "plus":
        # lucide "plus": a simple cross.
        cross = gc.CreatePath()
        cross.MoveToPoint(*px(12, 5))
        cross.AddLineToPoint(*px(12, 19))
        cross.MoveToPoint(*px(5, 12))
        cross.AddLineToPoint(*px(19, 12))
        gc.StrokePath(cross)
        return

    if kind == "minus":
        # lucide "minus": a single stroke.
        bar = gc.CreatePath()
        bar.MoveToPoint(*px(5, 12))
        bar.AddLineToPoint(*px(19, 12))
        gc.StrokePath(bar)
        return

    if kind == "save":
        # lucide "save": a floppy disk, folded corner, and the label window at top.
        body = gc.CreatePath()
        body.MoveToPoint(*px(19, 21))
        body.AddLineToPoint(*px(5, 21))
        body.AddCurveToPoint(*px(4, 21), *px(3, 20), *px(3, 19))
        body.AddLineToPoint(*px(3, 5))
        body.AddCurveToPoint(*px(3, 4), *px(4, 3), *px(5, 3))
        body.AddLineToPoint(*px(16, 3))
        body.AddLineToPoint(*px(21, 8))
        body.AddLineToPoint(*px(21, 19))
        body.AddCurveToPoint(*px(21, 20), *px(20, 21), *px(19, 21))
        body.CloseSubpath()
        gc.StrokePath(body)

        window = gc.CreatePath()
        window.AddRectangle(*px(7, 3), 8 * s, 5 * s)
        gc.StrokePath(window)

        slot = gc.CreatePath()
        slot.MoveToPoint(*px(17, 21))
        slot.AddLineToPoint(*px(17, 13))
        slot.AddLineToPoint(*px(7, 13))
        slot.AddLineToPoint(*px(7, 21))
        gc.StrokePath(slot)
        return

    if kind == "logout":
        # lucide "log-out": a door frame with an arrow stepping out through it.
        door = gc.CreatePath()
        door.MoveToPoint(*px(9, 21))
        door.AddLineToPoint(*px(5, 21))
        door.AddCurveToPoint(*px(4, 21), *px(3, 20), *px(3, 19))
        door.AddLineToPoint(*px(3, 5))
        door.AddCurveToPoint(*px(3, 4), *px(4, 3), *px(5, 3))
        door.AddLineToPoint(*px(9, 3))
        gc.StrokePath(door)

        arrow = gc.CreatePath()
        arrow.MoveToPoint(*px(16, 17))
        arrow.AddLineToPoint(*px(21, 12))
        arrow.AddLineToPoint(*px(16, 7))
        gc.StrokePath(arrow)

        shaft = gc.CreatePath()
        shaft.MoveToPoint(*px(21, 12))
        shaft.AddLineToPoint(*px(9, 12))
        gc.StrokePath(shaft)
        return

    if kind == "power":
        # lucide "power": a vertical stroke breaking a ring, the universal "on/off".
        # The ring is walked as short line segments (not AddArc, whose sweep
        # direction is easy to get backwards and draw the wrong half of the circle),
        # leaving a gap at the top where the stroke breaks through.
        ring = gc.CreatePath()
        # Sweeps clockwise from just right of the gap, the long way round (through
        # the bottom), to just left of it, leaving the gap centred at the top (270°)
        # where the vertical stroke passes through.
        start_deg, end_deg, steps = 298, 602, 20
        for i in range(steps + 1):
            deg = start_deg + (end_deg - start_deg) * i / steps
            rad = math.radians(deg)
            point = px(12 + 7 * math.cos(rad), 13 + 7 * math.sin(rad))
            if i == 0:
                ring.MoveToPoint(*point)
            else:
                ring.AddLineToPoint(*point)
        gc.StrokePath(ring)

        stroke = gc.CreatePath()
        stroke.MoveToPoint(*px(12, 2))
        stroke.AddLineToPoint(*px(12, 12))
        gc.StrokePath(stroke)
        return

    if kind == "open":
        # lucide "external-link": a box with an arrow breaking out of its top-right
        # corner. Matches the web UI's "Open in KiCad" button (ExternalLink).
        box = gc.CreatePath()
        box.MoveToPoint(*px(18, 13))
        box.AddLineToPoint(*px(18, 19))
        box.AddCurveToPoint(*px(18, 20), *px(17, 21), *px(16, 21))
        box.AddLineToPoint(*px(5, 21))
        box.AddCurveToPoint(*px(4, 21), *px(3, 20), *px(3, 19))
        box.AddLineToPoint(*px(3, 8))
        box.AddCurveToPoint(*px(3, 7), *px(4, 6), *px(5, 6))
        box.AddLineToPoint(*px(11, 6))
        gc.StrokePath(box)

        arrow = gc.CreatePath()
        arrow.MoveToPoint(*px(10, 14))
        arrow.AddLineToPoint(*px(21, 3))
        gc.StrokePath(arrow)

        head = gc.CreatePath()
        head.MoveToPoint(*px(15, 3))
        head.AddLineToPoint(*px(21, 3))
        head.AddLineToPoint(*px(21, 9))
        gc.StrokePath(head)
        return

    # anything else, a plain document outline
    doc = gc.CreatePath()
    doc.AddRectangle(*px(5, 2), 14 * s, 20 * s)
    gc.StrokePath(doc)


class Disclosure(wx.Panel):
    """A clickable ▸/▾ header that expands a section, like the web UI's commit rows.

    `kind` draws a board/schematic glyph so you can tell at a glance what a file is.
    `count` renders a trailing pill with the number of changes.
    """

    def __init__(
        self,
        parent,
        pal,
        label,
        on_toggle,
        expanded=False,
        accent=None,
        kind=None,
        count=None,
        strong=False,
    ):
        super().__init__(parent, style=wx.TRANSPARENT_WINDOW)
        self.pal = pal
        self.label = label
        self.accent = accent  # optional tint for the icon (e.g. the file kind)
        self.expanded = expanded
        self.on_toggle = on_toggle
        self.kind = kind
        self.count = count
        self.strong = strong  # a section header rather than a file row
        self._hover = False

        self.SetBackgroundStyle(wx.BG_STYLE_PAINT)
        self.SetCursor(wx.Cursor(wx.CURSOR_HAND))

        dc = wx.ClientDC(self)
        dc.SetFont(self._font())
        # A section header reads as a control and gets a control's height; a file
        # row stays text-tight.
        height = dc.GetTextExtent(label or "X")[1] + 10
        if self.strong:
            height = max(height, self.FromDIP(28))
        self.SetMinSize(wx.Size(-1, height))

        self.Bind(wx.EVT_PAINT, self._on_paint)
        self.Bind(wx.EVT_LEFT_UP, self._on_click)
        self.Bind(wx.EVT_ENTER_WINDOW, self._enter)
        self.Bind(wx.EVT_LEAVE_WINDOW, self._leave)

    def _font(self):
        f = self.GetFont()
        f.SetPointSize(th.FONT_BODY)
        # The web's list group headers: semibold only where the row is strong,
        # medium otherwise. BOLD read heavier than anything the web app shows.
        f.SetWeight(wx.FONTWEIGHT_SEMIBOLD if self.strong else wx.FONTWEIGHT_MEDIUM)
        return f

    def _enter(self, _e):
        self._hover = True
        self.Refresh()

    def _leave(self, _e):
        self._hover = False
        self.Refresh()

    def _on_click(self, _e):
        self.expanded = not self.expanded
        self.Refresh()
        self.on_toggle(self.expanded)

    def _on_paint(self, _e):
        dc = wx.AutoBufferedPaintDC(self)
        gc = wx.GraphicsContext.Create(dc)
        if not gc:
            return
        dc.SetBackground(wx.Brush(_surface_of(self, self.pal)))
        dc.Clear()

        w, h = self.GetSize()
        if self._hover:
            gc.SetBrush(wx.Brush(_c(self.pal["accent"])))
            gc.SetPen(wx.TRANSPARENT_PEN)
            # Square, like every hover surface in the web app (rounded-none).
            gc.DrawRectangle(0, 0, w, h)

        font = self._font()
        text_colour = _c(self.pal["foreground"])

        # chevron
        gc.SetFont(font, _c(self.pal["muted_fg"]))
        gc.DrawText("▾" if self.expanded else "▸", 5, (h - 14) / 2)

        x = 19.0
        if self.kind:
            icon = 13.0
            draw_kind_icon(
                gc,
                self.kind,
                x,
                (h - icon) / 2,
                _c(self.accent or self.pal["muted_fg"]),
                size=icon,
            )
            x += icon + 7

        # trailing count pill, drawn first so the label knows its budget
        pill_w = 0.0
        if self.count is not None:
            small = wx.Font(font)
            small.SetPointSize(th.FONT_SMALL)
            small.SetWeight(wx.FONTWEIGHT_MEDIUM)
            gc.SetFont(small, _c(self.pal["muted_fg"]))
            txt = str(self.count)
            tw = gc.GetTextExtent(txt)[0]
            pill_w = tw + 14
            surface = _surface_of(self, self.pal).GetAsString(wx.C2S_HTML_SYNTAX)
            gc.SetBrush(wx.Brush(_mix(surface, self.pal["muted_fg"], 0.16)))
            gc.SetPen(wx.TRANSPARENT_PEN)
            # Square like the web's badge chips (rounded-none).
            gc.DrawRectangle(w - pill_w - 4, (h - 15) / 2, pill_w, 15)
            gc.SetFont(small, _c(self.pal["muted_fg"]))
            gc.DrawText(txt, w - pill_w - 4 + 7, (h - gc.GetTextExtent(txt)[1]) / 2)

        gc.SetFont(font, text_colour)
        text = _ellipsise(gc, self.label, w - x - pill_w - 10)
        gc.DrawText(text, x, (h - gc.GetTextExtent(text or "X")[1]) / 2)


class ChangeRow(wx.Panel):
    """One grouped change: kind glyph, label, and its category.

    Mirrors the web UI's change rows, same +/−/~ glyph, same colour per kind,
    same trailing uppercase category, so a board reads the same in KiCad as in
    the browser.
    """

    def __init__(self, parent, pal, group, on_click=None):
        super().__init__(parent, style=wx.TRANSPARENT_WINDOW)
        self.pal = pal
        self.group = group
        self.on_click = on_click
        self._hover = False

        self.SetBackgroundStyle(wx.BG_STYLE_PAINT)
        if on_click:
            self.SetCursor(wx.Cursor(wx.CURSOR_HAND))
        self.SetMinSize(wx.Size(-1, 18))

        self.Bind(wx.EVT_PAINT, self._on_paint)
        self.Bind(wx.EVT_ENTER_WINDOW, self._enter)
        self.Bind(wx.EVT_LEAVE_WINDOW, self._leave)
        self.Bind(wx.EVT_LEFT_UP, self._click)

    def _enter(self, _e):
        self._hover = True
        self.Refresh()

    def _leave(self, _e):
        self._hover = False
        self.Refresh()

    def _click(self, _e):
        if self.on_click:
            self.on_click(self.group)

    def _on_paint(self, _e):
        dc = wx.AutoBufferedPaintDC(self)
        gc = wx.GraphicsContext.Create(dc)
        if not gc:
            return
        dc.SetBackground(wx.Brush(_surface_of(self, self.pal)))
        dc.Clear()

        w, h = self.GetSize()
        if self._hover and self.on_click:
            gc.SetBrush(wx.Brush(_c(self.pal["accent"])))
            gc.SetPen(wx.TRANSPARENT_PEN)
            gc.DrawRectangle(0, 0, w, h)

        kind = self.group.get("kind", "changed")
        tone = self.pal[th.KIND_TONE.get(kind, "muted_fg")]

        body = self.GetFont()
        body.SetPointSize(th.FONT_SMALL)

        bold = wx.Font(body)
        bold.SetWeight(wx.FONTWEIGHT_MEDIUM)
        gc.SetFont(bold, _c(tone))
        gc.DrawText(th.KIND_SYMBOL.get(kind, "~"), 6, 2)

        # Category sits right-aligned; draw it first so we know what's left for
        # the label.
        cat = (self.group.get("category_label") or "").upper()
        gc.SetFont(body, _c(self.pal["muted_fg"]))
        cat_w = gc.GetTextExtent(cat)[0] if cat else 0
        if cat:
            gc.DrawText(cat, max(0, w - cat_w - 4), 2)

        gc.SetFont(body, _c(self.pal["foreground"]))
        gc.DrawText(_ellipsise(gc, self.group.get("label", ""), w - 32 - cat_w), 20, 2)


class ScrollThumb(wx.Panel):
    """A slim, themed scrollbar drawn over a ScrolledWindow.

    wx gives no way to recolour a native scrollbar: there's no SetScrollbarColour,
    and SetBackgroundColour on a native wx.ScrollBar is ignored, the same trap as
    wx.Button. So the native bar is hidden and this draws the overlay instead,
    which is also how the web app's thin scrollbars look.

    Draggable, and it tracks the window it scrolls.
    """

    WIDTH = 8

    def __init__(self, parent, target: wx.ScrolledWindow, pal):
        super().__init__(parent, size=wx.Size(self.WIDTH, -1))
        self.pal = pal
        self.target = target
        self._hover = False
        self._drag_from = None
        self._drag_origin = 0

        self.SetBackgroundStyle(wx.BG_STYLE_PAINT)
        self.Bind(wx.EVT_PAINT, self._on_paint)
        self.Bind(wx.EVT_ENTER_WINDOW, self._enter)
        self.Bind(wx.EVT_LEAVE_WINDOW, self._leave)
        self.Bind(wx.EVT_LEFT_DOWN, self._down)
        self.Bind(wx.EVT_LEFT_UP, self._up)
        self.Bind(wx.EVT_MOTION, self._motion)

        # Follow whatever moves the view: wheel, keys, layout changes.
        target.Bind(wx.EVT_SCROLLWIN, self._on_target_scroll)

    # -- geometry ----------------------------------------------------------

    def _metrics(self):
        """(view_start, page_size, total) in scroll units."""
        total = self.target.GetScrollRange(wx.VERTICAL)
        page = self.target.GetScrollThumb(wx.VERTICAL)
        start = self.target.GetScrollPos(wx.VERTICAL)
        return start, page, total

    def _thumb_rect(self):
        start, page, total = self._metrics()
        h = self.GetSize().height
        if total <= 0 or page <= 0 or page >= total:
            return None  # nothing to scroll
        thumb_h = max(24, int(h * page / total))
        travel = h - thumb_h
        span = max(1, total - page)
        y = int(travel * start / span)
        return y, thumb_h

    # -- interaction -------------------------------------------------------

    def _enter(self, _e):
        self._hover = True
        self.Refresh()

    def _leave(self, _e):
        self._hover = False
        self.Refresh()

    def _on_target_scroll(self, e):
        self.Refresh()
        e.Skip()  # never swallow the real scroll

    def _down(self, e):
        rect = self._thumb_rect()
        if not rect:
            return
        y, thumb_h = rect
        if y <= e.GetY() <= y + thumb_h:
            self._drag_from = e.GetY()
            self._drag_origin = self.target.GetScrollPos(wx.VERTICAL)
            self.CaptureMouse()
        else:
            # Click the track: page toward the click, like a real scrollbar.
            _, page, _ = self._metrics()
            delta = page if e.GetY() > y else -page
            self._scroll_to(self.target.GetScrollPos(wx.VERTICAL) + delta)

    def _up(self, _e):
        if self.HasCapture():
            self.ReleaseMouse()
        self._drag_from = None

    def _motion(self, e):
        if self._drag_from is None or not e.Dragging():
            return
        rect = self._thumb_rect()
        if not rect:
            return
        _, thumb_h = rect
        _, page, total = self._metrics()
        travel = max(1, self.GetSize().height - thumb_h)
        moved = e.GetY() - self._drag_from
        self._scroll_to(self._drag_origin + int(moved * max(1, total - page) / travel))

    def _scroll_to(self, pos):
        _, page, total = self._metrics()
        pos = max(0, min(pos, max(0, total - page)))
        self.target.Scroll(-1, pos)
        self.Refresh()

    # -- painting ----------------------------------------------------------

    def _on_paint(self, _e):
        dc = wx.AutoBufferedPaintDC(self)
        gc = wx.GraphicsContext.Create(dc)
        if not gc:
            return
        dc.SetBackground(wx.Brush(_surface_of(self, self.pal)))
        dc.Clear()

        rect = self._thumb_rect()
        if not rect:
            return  # content fits; show nothing rather than an inert bar
        y, thumb_h = rect

        surface = _surface_of(self, self.pal).GetAsString(wx.C2S_HTML_SYNTAX)
        strength = 0.55 if self._hover or self._drag_from is not None else 0.32
        gc.SetBrush(wx.Brush(_mix(surface, self.pal["muted_fg"], strength)))
        gc.SetPen(wx.TRANSPARENT_PEN)
        w = self.GetSize().width
        # Radius 4, matching the web's themed-scrollbar thumb.
        gc.DrawRoundedRectangle(1, y, w - 2, thumb_h, 4)


class Card(wx.Panel):
    """A square bordered surface matching Prism's card component."""

    RADIUS = 0

    def __init__(self, parent, title, pal):
        super().__init__(parent, style=wx.TRANSPARENT_WINDOW)
        self.pal = pal
        self.SetFont(ui_font(self))
        # What our children sit on. Declared so nested widgets can find it, see
        # _surface_of. Also set as the real background colour so native children
        # (StaticText, TextCtrl) inherit it instead of wx's default grey, which is
        # what made dark-theme labels unreadable.
        self.surface = pal["card"]
        self.SetBackgroundColour(_c(pal["card"]))
        self.SetBackgroundStyle(wx.BG_STYLE_PAINT)
        self.Bind(wx.EVT_PAINT, self._on_paint)
        # Labels asked to wrap, and the unwrapped text to re-flow from. StaticText
        # wraps to a fixed pixel width, but the card's width is not known until it
        # is laid out and changes when the dialog is resized, so we re-wrap on
        # EVT_SIZE rather than guessing once at creation.
        self._wrapping: list[tuple] = []
        self._wrapping_in_progress = False
        self.Bind(wx.EVT_SIZE, self._on_size)

        outer = wx.BoxSizer(wx.VERTICAL)
        inner = wx.BoxSizer(wx.VERTICAL)

        if title:
            # A section label, not a card title: uppercase and muted, the weight
            # the web section labels carry (label() maps bold to medium).
            heading = self.label(title.upper(), tone="muted_fg", bold=True, small=True)
            inner.Add(heading, 0, wx.BOTTOM, th.SP_SM)

        self.body = wx.BoxSizer(wx.VERTICAL)
        inner.Add(self.body, 1, wx.EXPAND)

        outer.Add(inner, 1, wx.EXPAND | wx.ALL, self.FromDIP(th.CARD_PADDING))
        self.SetSizer(outer)

    def label(self, text, tone="foreground", bold=False, small=False, mono=False, wrap=False):
        """A StaticText that actually respects the theme.

        wx paints a StaticText's own background; left alone it uses the system
        default, so on a dark card you get theme-coloured text on a light block.
        Every label in a card must go through here.

        `wrap=True` reflows long text to the card's width instead of letting it
        run off the right edge (the settings dialog scrolls only vertically, so an
        over-wide label clips). Wrapped labels re-flow when the dialog is resized.
        """
        st = wx.StaticText(self, label=str(text))
        st.SetBackgroundColour(_c(self.pal["card"]))
        st.SetForegroundColour(_c(self.pal.get(tone, tone)))
        f = ui_font(st, th.FONT_SMALL if small else th.FONT_BODY,
                    wx.FONTWEIGHT_MEDIUM if bold else wx.FONTWEIGHT_NORMAL, mono)
        st.SetFont(f)
        if wrap:
            self._wrapping.append((st, str(text)))
            self._wrap_one(st, str(text))
        return st

    def _on_size(self, event):
        # Wrap() re-lays the label, which can bounce back as another size event;
        # guard against re-entering while we are already re-flowing.
        if not self._wrapping_in_progress:
            self._wrapping_in_progress = True
            try:
                for st, text in self._wrapping:
                    self._wrap_one(st, text)
            finally:
                self._wrapping_in_progress = False
        event.Skip()

    def _wrap_one(self, st, text):
        """Reflow one label to the card's current inner width.

        Wrap() is destructive (it inserts line breaks), so we reset to the
        original text first, or successive resizes would wrap already-wrapped
        lines ever narrower.
        """
        width = self.GetClientSize().width - 2 * self.FromDIP(th.CARD_PADDING)
        if width <= 0:
            return
        st.SetLabel(text)
        st.Wrap(width)

    def _on_paint(self, _e):
        dc = wx.AutoBufferedPaintDC(self)
        gc = wx.GraphicsContext.Create(dc)
        if not gc:
            return
        dc.SetBackground(wx.Brush(_surface_of(self, self.pal)))
        dc.Clear()
        w, h = self.GetSize()
        gc.SetBrush(wx.Brush(_c(self.pal["card"])))
        gc.SetPen(wx.Pen(_c(self.pal["border"])))
        gc.DrawRectangle(0.5, 0.5, w - 1, h - 1)

    def row(self, label, value, mono=False, tone=None, badge=False):
        """A label/value line. `badge=True` renders the value as a status pill."""
        line = wx.BoxSizer(wx.HORIZONTAL)
        line.Add(self.label(label, tone="muted_fg"), 0, wx.ALIGN_CENTER_VERTICAL)
        line.AddStretchSpacer()

        if badge:
            line.Add(
                Badge(self, str(value), self.pal, tone or "muted"),
                0,
                wx.ALIGN_CENTER_VERTICAL,
            )
        else:
            line.Add(
                self.label(value, tone=tone or "foreground", mono=mono),
                0,
                wx.ALIGN_CENTER_VERTICAL,
            )

        self.body.Add(line, 0, wx.EXPAND | wx.BOTTOM, th.SP_SM)

    def rule(self, space=None):
        """A hairline across the card, to separate one block of rows from the next.

        wx.StaticLine draws in the system colour, which is wrong against the card in
        either theme, so this is a one-pixel panel in the theme's border colour.
        """
        line = wx.Panel(self, size=wx.Size(-1, 1))
        line.SetBackgroundColour(_c(self.pal["border"]))
        gap = th.SP_SM if space is None else space
        self.body.Add(line, 0, wx.EXPAND | wx.TOP | wx.BOTTOM, gap)
        return line

    def compact_row(self, label, value, tone=None, badge=False):
        """A tighter label/value line that never overflows on the right.

        `row()` right-aligns the value with a stretch spacer, so a long value (a
        full email as "Signed in as") is pushed hard against the card's right
        padding and clips past the dialog edge, wx StaticText does not ellipsize.
        This keeps the value next to its label, left to right, and lets a text
        value wrap within the card instead. Used for the signed-in identity.
        """
        line = wx.BoxSizer(wx.HORIZONTAL)
        line.Add(
            self.label(label, tone="muted_fg"),
            0,
            wx.ALIGN_CENTER_VERTICAL | wx.RIGHT,
            th.SP_XS,
        )
        if badge:
            line.Add(
                Badge(self, str(value), self.pal, tone or "muted"),
                0,
                wx.ALIGN_CENTER_VERTICAL,
            )
        else:
            # proportion 1 + EXPAND so the value takes the remaining width and
            # wraps into it rather than forcing the card wider than the dialog.
            text = self.label(value, tone=tone or "foreground")
            line.Add(text, 1, wx.ALIGN_CENTER_VERTICAL)
        self.body.Add(line, 0, wx.EXPAND | wx.BOTTOM, th.SP_XS)


class Checkbox(wx.Panel):
    """A themed checkbox, matching the web app's component.

    wx.CheckBox is a native control that follows the OS appearance, which on
    macOS means a large rounded checkbox in the system accent colour — visually
    a control from a different application sitting on this surface. The web's
    checkbox is a 16px square with a primary-coloured border that fills blue and
    shows a white check when ticked; this draws exactly that.

    Keyboard-complete: Tab focuses it, Space toggles it.
    """

    BOX = 16
    GAP = 10

    def __init__(self, parent, label, pal, checked=False, on_change=None):
        super().__init__(parent, style=wx.TRANSPARENT_WINDOW)
        self.pal = pal
        self.label = label
        self.checked = checked
        self.on_change = on_change
        self.SetBackgroundStyle(wx.BG_STYLE_PAINT)  # we paint every pixel
        self.SetFont(ui_font(self))
        self.SetCursor(wx.Cursor(wx.CURSOR_HAND))
        self.SetName(label)

        dc = wx.ClientDC(self)
        dc.SetFont(self.GetFont())
        text_w, text_h = dc.GetTextExtent(label)
        box = self.FromDIP(self.BOX)
        height = max(box, text_h) + 2
        self.SetMinSize(
            wx.Size(box + self.FromDIP(self.GAP) + text_w, max(height, box + 2))
        )

        self.Bind(wx.EVT_PAINT, self._on_paint)
        self.Bind(wx.EVT_LEFT_UP, self._on_click)
        self.Bind(wx.EVT_SET_FOCUS, lambda _e: self.Refresh())
        self.Bind(wx.EVT_KILL_FOCUS, lambda _e: self.Refresh())
        self.Bind(wx.EVT_KEY_DOWN, self._on_key)

    def AcceptsFocus(self):
        return self.IsEnabled()

    def AcceptsFocusFromKeyboard(self):
        return self.IsEnabled()

    def GetValue(self):
        return self.checked

    def SetValue(self, value):
        self.checked = bool(value)
        self.Refresh()

    def _on_click(self, _e):
        if not self.IsEnabled():
            return
        self.SetFocus()
        self.checked = not self.checked
        self.Refresh()
        if self.on_change:
            self.on_change(self.checked)

    def _on_key(self, event):
        if event.GetKeyCode() == wx.WXK_SPACE:
            self._on_click(None)
            return
        event.Skip()

    def _on_paint(self, _e):
        dc = wx.AutoBufferedPaintDC(self)
        gc = wx.GraphicsContext.Create(dc)
        if not gc:
            return
        dc.SetBackground(wx.Brush(_surface_of(self, self.pal)))
        dc.Clear()

        w, h = self.GetSize()
        box = self.FromDIP(self.BOX)
        y = (h - box) / 2

        if self.checked:
            gc.SetBrush(wx.Brush(_c(self.pal["primary"])))
            gc.SetPen(wx.Pen(_c(self.pal["primary"])))
            gc.DrawRectangle(0, y, box, box)
            # The lucide check the web component shows: a short stroke down to
            # the tail, then a long one up to the tip.
            # Integer width: wx.Pen rejects a float, and a paint handler that raises
            # here leaves the checked box as a blank rectangle with no label.
            gc.SetPen(wx.Pen(_c(self.pal["primary_fg"]), max(2, self.FromDIP(2))))
            check = gc.CreatePath()
            check.MoveToPoint(box * 0.25, y + box * 0.52)
            check.AddLineToPoint(box * 0.42, y + box * 0.70)
            check.AddLineToPoint(box * 0.76, y + box * 0.30)
            gc.StrokePath(check)
        else:
            # The web's unchecked box carries a PRIMARY border, not grey.
            gc.SetBrush(wx.Brush(_surface_of(self, self.pal)))
            gc.SetPen(wx.Pen(_c(self.pal["primary"])))
            gc.DrawRectangle(0.5, y + 0.5, box - 1, box - 1)

        if self.HasFocus():
            gc.SetBrush(wx.TRANSPARENT_BRUSH)
            gc.SetPen(wx.Pen(_c(self.pal["primary"]), self.FromDIP(1)))
            gc.DrawRectangle(-2.5, y - 2.5, box + 5, box + 5)

        gc.SetFont(self.GetFont(), _c(self.pal["foreground"]))
        label_h = gc.GetTextExtent(self.label)[1]
        gc.DrawText(self.label, box + self.FromDIP(self.GAP), (h - label_h) / 2)


class LinkLabel(wx.Panel):
    """Clickable text that looks like text.

    wx.adv.HyperlinkCtrl always underlines on macOS, and the web UI's text
    buttons and links never do — the underline is what made the commit subject
    read as a stray browser link inside the panel. This draws plain themed text
    that turns primary on hover and carries the action.
    """

    def __init__(self, parent, label, pal, on_click, size_pt=None):
        super().__init__(parent, style=wx.TRANSPARENT_WINDOW)
        self.pal = pal
        self.label = label
        self.on_click = on_click
        self._hover = False
        self.SetBackgroundStyle(wx.BG_STYLE_PAINT)
        self.SetFont(ui_font(self, size_pt or th.FONT_SMALL))
        self.SetCursor(wx.Cursor(wx.CURSOR_HAND))
        self.SetName(label)

        dc = wx.ClientDC(self)
        dc.SetFont(self.GetFont())
        text_w, text_h = dc.GetTextExtent(label)
        self.SetMinSize(wx.Size(text_w, max(text_h, self.FromDIP(18)) + 2))

        self.Bind(wx.EVT_PAINT, self._on_paint)
        self.Bind(wx.EVT_ENTER_WINDOW, self._set_hover)
        self.Bind(wx.EVT_LEAVE_WINDOW, self._set_hover)
        self.Bind(wx.EVT_LEFT_UP, lambda _e: self.on_click())

    def _set_hover(self, event):
        self._hover = event.Enter()
        self.Refresh()

    def _on_paint(self, _e):
        dc = wx.AutoBufferedPaintDC(self)
        gc = wx.GraphicsContext.Create(dc)
        if not gc:
            return
        dc.SetBackground(wx.Brush(_surface_of(self, self.pal)))
        dc.Clear()
        # Hover tints toward primary, like the web's hover:text-primary; the
        # resting state is plain foreground text.
        colour = self.pal["primary"] if self._hover else self.pal["foreground"]
        gc.SetFont(self.GetFont(), _c(colour))
        label_h = gc.GetTextExtent(self.label)[1]
        gc.DrawText(self.label, 0, (self.GetSize().height - label_h) / 2)
