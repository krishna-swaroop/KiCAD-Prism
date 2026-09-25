"""Deterministic typography for Release Studio drawing sheets.

No font is resolved through fontconfig or the host operating system. KiCad
NewStroke comes from the pinned Monkey distribution; legacy OpenType faces are
bundled with Prism and digest checked. Typography is a technical configuration
value and therefore part of the reproducible build.
"""

from __future__ import annotations

import base64
import hashlib
from dataclasses import dataclass
from functools import lru_cache
from importlib import resources
from pathlib import Path
from typing import Literal, Mapping

from fontTools.ttLib import TTFont

FontRole = Literal["display", "sans", "mono"]

FONT_ROOT = Path(__file__).with_name("fonts") / "geist-1.7.0"
NEWSTROKE_TYPOGRAPHY = "kicad-newstroke"

#: The typography a configuration gets when it declares none.
#:
#: Geist reads better than NewStroke at the sizes these sheets use, which is a
#: legibility judgement rather than a technical one -- NewStroke is a single
#: stroke weight designed for a plotter, and it thins out in a table.
#:
#: The trade is glyph coverage: NewStroke is KiCad's own font and sets the whole
#: drawing vocabulary, while Geist Mono has no U+2300 DIAMETER SIGN and no
#: U+2713 CHECK MARK.  A configured note using those degrades to the standard
#: note with the codepoint named, rather than rendering -- so a project that
#: writes "⌀ 0.3 mm" in its drill notes should select `kicad-newstroke`
#: explicitly.
DEFAULT_TYPOGRAPHY = "geist-pixel-square"


@dataclass(frozen=True, slots=True)
class FontAsset:
    key: str
    family: str
    filename: str
    sha256: str

    @property
    def path(self) -> Path:
        return FONT_ROOT / self.filename

    def bytes(self) -> bytes:
        payload = self.path.read_bytes()
        actual = hashlib.sha256(payload).hexdigest()
        if actual != self.sha256:
            raise RuntimeError(
                f"bundled font {self.filename} failed its digest check: "
                f"expected {self.sha256}, got {actual}"
            )
        return payload


@dataclass(frozen=True, slots=True)
class TypographyPreset:
    key: str
    label: str
    description: str
    display: FontAsset | None
    body: FontAsset | None
    body_bold: FontAsset | None

    def asset(self, role: FontRole, bold: bool = False) -> FontAsset:
        selected = self.display if role == "display" else (
            self.body_bold if bold else self.body
        )
        if selected is None:
            raise ValueError(f"typography preset {self.key!r} is vector-backed")
        return selected


_GEIST_MONO = FontAsset(
    "geist-mono-regular",
    "Geist Mono",
    "GeistMono-Regular.ttf",
    "bbb6715a406975fbde66d4d49bf3f77f746c1626f6121cb2998b759b9db91974",
)
_GEIST_MONO_BOLD = FontAsset(
    "geist-mono-semibold",
    "Geist Mono",
    "GeistMono-SemiBold.ttf",
    "5f73c5da73e5cfdd19319433253976c928c155190d1fb09dfc84a3adda65724b",
)

_PIXEL_ASSETS = {
    "square": FontAsset(
        "geist-pixel-square", "Geist Pixel Square", "GeistPixel-Square.ttf",
        "7a21a245a212e4fc7d806065df5fc2d264fc83f1ea9c376b10e66988db0c9f98",
    ),
    "grid": FontAsset(
        "geist-pixel-grid", "Geist Pixel Grid", "GeistPixel-Grid.ttf",
        "043e1a8873840785fe10515d8ef41d3de21b7bf2464c6a703a3438df5999de30",
    ),
    "circle": FontAsset(
        "geist-pixel-circle", "Geist Pixel Circle", "GeistPixel-Circle.ttf",
        "d2be9b9ff1b90876cdae5387d6f230ba4d67536544c23871eec0caca22b12de8",
    ),
    "triangle": FontAsset(
        "geist-pixel-triangle", "Geist Pixel Triangle", "GeistPixel-Triangle.ttf",
        "e5a3a66392aa3e93dcb03c0842aba6ec851eccc2a5f66d410d3a9aa8895db878",
    ),
    "line": FontAsset(
        "geist-pixel-line", "Geist Pixel Line", "GeistPixel-Line.ttf",
        "c10d082906b91337a2743bc3addee3acb1d11f6be40222c2c0efa26752aecd3e",
    ),
}

_DESCRIPTIONS = {
    "square": "Crisp technical labels with a classic digital-instrument character.",
    "grid": "A gridded drafting-display treatment for covers and section labels.",
    "circle": "Rounded indicator pixels inspired by lamps and dot-matrix panels.",
    "triangle": "Angular display pixels for a sharper electronics-instrument look.",
    "line": "A restrained segmented-line treatment reminiscent of test equipment.",
}

_GEIST_PRESETS: Mapping[str, TypographyPreset] = {
    f"geist-pixel-{variant}": TypographyPreset(
        key=f"geist-pixel-{variant}",
        label=f"Geist Pixel {variant.title()}",
        description=_DESCRIPTIONS[variant],
        display=asset,
        body=_GEIST_MONO,
        body_bold=_GEIST_MONO_BOLD,
    )
    for variant, asset in _PIXEL_ASSETS.items()
}

TYPOGRAPHY_PRESETS: Mapping[str, TypographyPreset] = {
    NEWSTROKE_TYPOGRAPHY: TypographyPreset(
        key=NEWSTROKE_TYPOGRAPHY,
        label="KiCad NewStroke",
        description=(
            "KiCad's native technical stroke lettering, rendered from the "
            "pinned kicad-monkey glyph data."
        ),
        display=None,
        body=None,
        body_bold=None,
    ),
    **_GEIST_PRESETS,
}


def typography_preset(key: str | None = None) -> TypographyPreset:
    selected = str(key or DEFAULT_TYPOGRAPHY).strip().lower()
    try:
        return TYPOGRAPHY_PRESETS[selected]
    except KeyError as exc:
        supported = ", ".join(sorted(TYPOGRAPHY_PRESETS))
        raise ValueError(f"unknown typography preset {selected!r}; choose one of: {supported}") from exc


def is_newstroke(key: str | None = None) -> bool:
    return typography_preset(key).key == NEWSTROKE_TYPOGRAPHY


def _newstroke_data_bytes() -> bytes:
    """Read the glyph corpus from the installed, pinned Monkey distribution."""

    try:
        return (
            resources.files("kicad_monkey")
            .joinpath("kicad_stroke_font_data.json")
            .read_bytes()
        )
    except (FileNotFoundError, ImportError, ModuleNotFoundError) as exc:
        raise RuntimeError(
            "the installed kicad-monkey package does not provide NewStroke glyph data"
        ) from exc


def resource_bundle_digest() -> str:
    """Identity of every bundled face that can affect released documents."""

    assets = {
        asset.filename: asset.sha256
        for preset in TYPOGRAPHY_PRESETS.values()
        for asset in (preset.display, preset.body, preset.body_bold)
        if asset is not None
    }
    assets["kicad_monkey/kicad_stroke_font_data.json"] = hashlib.sha256(
        _newstroke_data_bytes()
    ).hexdigest()
    canonical = "".join(
        f"{filename}\0{digest}\n" for filename, digest in sorted(assets.items())
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


@lru_cache(maxsize=None)
def ttfont(asset: FontAsset) -> TTFont:
    """Load a verified bundled face without recalculating it for every glyph."""

    # Lazy loading keeps configuration-only API processes from paying the font
    # parser cost until a document is actually composed.
    asset.bytes()
    return TTFont(asset.path, lazy=False, recalcBBoxes=False, recalcTimestamp=False)


def advance_width(
    value: str,
    size: float,
    *,
    role: FontRole,
    bold: bool = False,
    typography: str = DEFAULT_TYPOGRAPHY,
) -> float:
    """Return the real OpenType advance width in millimetres."""

    if is_newstroke(typography):
        from kicad_monkey.kicad_stroke_font import get_renderer

        # Monkey exposes the renderer publicly but does not yet expose its
        # measurement method. Keep this one compatibility shim isolated so it
        # can disappear when upstream promotes text measurement to public API.
        renderer = get_renderer()
        measure = getattr(renderer, "_calculate_text_width", None)
        if measure is None:
            raise RuntimeError("kicad-monkey does not expose NewStroke text measurement")
        return float(measure(value)) * size

    asset = typography_preset(typography).asset(role, bold)
    font = ttfont(asset)
    cmap = font.getBestCmap() or {}
    metrics = font["hmtx"].metrics
    missing = font.getGlyphName(0)
    units = float(font["head"].unitsPerEm)
    total = 0
    for char in value:
        glyph = cmap.get(ord(char), missing)
        total += metrics.get(glyph, metrics[missing])[0]
    return total / units * size


#: Cap height of the KiCad NewStroke uppercase alphabet, as a fraction of the
#: nominal size.  Monkey draws NewStroke from a baseline with capitals reaching
#: this far above it; it is a property of the glyph data, not a tunable.
_NEWSTROKE_CAP_RATIO = 0.667


def cap_height(
    size: float,
    *,
    role: FontRole = "sans",
    bold: bool = False,
    typography: str = DEFAULT_TYPOGRAPHY,
) -> float:
    """Height of a capital letter above the baseline, in millimetres.

    Vertically centring text means centring the *ink*, and the ink of a run of
    capitals is its cap height.  Using the em box instead leaves designators
    sitting visibly low inside their components, because the em box reserves
    descender space no reference designator uses.
    """

    if is_newstroke(typography):
        return size * _NEWSTROKE_CAP_RATIO

    font = ttfont(typography_preset(typography).asset(role, bold))
    units = float(font["head"].unitsPerEm)
    os2 = font.get("OS/2")
    height = float(getattr(os2, "sCapHeight", 0) or 0)
    if height <= 0:
        # `sCapHeight` is optional before OS/2 version 2.  Measuring `H` is the
        # same quantity read off the outline instead of the table.
        glyphs = font.getGlyphSet()
        name = (font.getBestCmap() or {}).get(ord("H"))
        if name and name in glyphs:
            from fontTools.pens.boundsPen import BoundsPen

            pen = BoundsPen(glyphs)
            glyphs[name].draw(pen)
            if pen.bounds:
                height = float(pen.bounds[3])
    if height <= 0:
        height = units * 0.7
    return height / units * size


def unsupported_codepoints(
    value: str,
    *,
    role: FontRole = "sans",
    bold: bool = False,
    typography: str = DEFAULT_TYPOGRAPHY,
) -> tuple[int, ...]:
    """Return codepoints the selected bundled face cannot actually render."""

    layout_controls = {"\n", "\r", "\t"}
    if is_newstroke(typography):
        from kicad_monkey.kicad_stroke_font import get_glyph

        return tuple(
            sorted(
                {
                    ord(char)
                    for char in value
                    if char not in layout_controls and get_glyph(char) is None
                }
            )
        )

    asset = typography_preset(typography).asset(role, bold)
    cmap = ttfont(asset).getBestCmap() or {}
    return tuple(
        sorted(
            {
                ord(char)
                for char in value
                if char not in layout_controls and ord(char) not in cmap
            }
        )
    )


def svg_font_css(preset_key: str) -> str:
    """Standalone ``@font-face`` declarations with verified embedded bytes."""

    preset = typography_preset(preset_key)
    if preset.key == NEWSTROKE_TYPOGRAPHY:
        return ""
    faces = (
        (preset.display, "PrismDisplay", 400),
        (preset.body, "PrismBody", 400),
        (preset.body_bold, "PrismBody", 600),
    )
    rules: list[str] = []
    for asset, family, weight in faces:
        if asset is None:  # pragma: no cover - guarded by preset key above
            raise RuntimeError(f"typography preset {preset.key!r} has no font asset")
        encoded = base64.b64encode(asset.bytes()).decode("ascii")
        rules.append(
            f"@font-face{{font-family:'{family}';font-style:normal;font-weight:{weight};"
            f"src:url(data:font/ttf;base64,{encoded}) format('truetype')}}"
        )
    return "".join(rules)


def newstroke_polylines(
    value: str,
    *,
    x: float,
    y: float,
    size: float,
    anchor: str = "start",
) -> tuple[tuple[tuple[float, float], ...], ...]:
    """Render one text run with Monkey's KiCad NewStroke implementation."""

    from kicad_monkey.kicad_stroke_font import get_renderer

    alignment = {"start": "left", "middle": "center", "end": "right"}.get(
        anchor, "left"
    )
    rendered = get_renderer().render_text_polylines(
        value,
        x,
        y,
        size,
        size,
        h_align=alignment,
        v_align="bottom",
    )
    return tuple(tuple((float(px), float(py)) for px, py in line) for line in rendered)


def newstroke_width(size: float, *, bold: bool = False) -> float:
    """KiCad-like visible pen width for vector-backed sheet text."""

    return max(0.15, size / (5.0 if bold else 8.0))


__all__ = [
    "DEFAULT_TYPOGRAPHY",
    "FONT_ROOT",
    "FontAsset",
    "FontRole",
    "NEWSTROKE_TYPOGRAPHY",
    "TYPOGRAPHY_PRESETS",
    "TypographyPreset",
    "advance_width",
    "cap_height",
    "is_newstroke",
    "newstroke_polylines",
    "newstroke_width",
    "resource_bundle_digest",
    "svg_font_css",
    "ttfont",
    "typography_preset",
    "unsupported_codepoints",
]
