"""Fabrication-output comparison.

Prism's PCB comparison reads the board file. That answers "what did the designer
change", but not "what changes in the package the fab house receives" — plot
options, soldermask subtraction, silkscreen clipping, DNP handling and aperture
generation all live between the board and the Gerber, and none of them are
authored objects. Altium 365 closes that gap with a layer-by-layer Gerber
compare, and this module is Prism's equivalent.

The comparison is *geometric*, not textual. Gerber files carry creation
timestamps, generator strings and freely renumbered aperture D-codes, so a byte
diff reports every regeneration as a change. Instead each layer is parsed into a
normalised stream of drawing operations whose aperture reference is the
aperture's resolved *geometry* rather than its D-code. Two revisions that plot
the same copper produce identical streams no matter how KiCad numbered the
apertures that day.

Differences are then clustered into regions, each with a bounding box in board
millimetres, so the reviewer gets Altium's numbered difference markers rather
than a count of changed draw commands.

The artwork the reviewer sees is drawn here too, from the same operation stream
that is compared. Rendering with a separate rasteriser would produce the picture
with different code from the answer, and the two could disagree on exactly the
plot-option changes this comparison exists to catch.
"""

from __future__ import annotations

import ast
import json
import math
import re
import subprocess
from collections import Counter
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

# Coordinates are quantised before comparison. KiCad plots at 4.6 format
# (nanometre resolution); 0.1 µm is two orders of magnitude finer than any
# fabrication tolerance and removes float round-trip noise from the diff.
_QUANTUM_MM = 1e-4

# Two changed operations belong to the same reviewable region when their
# extents come within this distance. A trace and the via it lands on are one
# edit to a reviewer; two changes a millimetre apart are not.
_REGION_MERGE_MM = 0.5

# Ceiling on how large one merged region may grow. Without it, changed copper on
# a dense board chains through the merge distance into a single board-sized
# marker that identifies nothing.
_MAX_REGION_MM = 8.0

_UNIT_SCALE = {"MM": 1.0, "IN": 25.4}

_COMMENT = re.compile(r"G04[^*]*\*")
_EXTENDED = re.compile(r"%(.+?)%", re.DOTALL)
_APERTURE_DEF = re.compile(r"^ADD(\d+)([^,]+)(?:,(.*))?$", re.DOTALL)
_FORMAT_SPEC = re.compile(r"^FS(?:L|T)?(?:A|I)?X(\d)(\d)Y(\d)(\d)$")
_COORD = re.compile(r"([XYIJ])([+-]?\d+)")
_D_CODE = re.compile(r"D0?([123])\*?$")
_INLINE_G_CODE = re.compile(r"^G0?([123])(?=[XYIJD])")


class GerberParseError(ValueError):
    """The file is not Gerber Prism can compare."""


def _quantise(value: float) -> float:
    return round(value / _QUANTUM_MM) * _QUANTUM_MM


_MACRO_ARG = re.compile(r"\$(\d+)")
_MACRO_ALLOWED = (
    ast.Expression, ast.BinOp, ast.UnaryOp, ast.Constant, ast.Name, ast.Load,
    ast.Add, ast.Sub, ast.Mult, ast.Div, ast.USub, ast.UAdd,
)


@lru_cache(maxsize=512)
def _compile_macro_expression(expression: str):
    """Compile one aperture-macro parameter expression against named arguments.

    Arguments are compiled as names rather than substituted as literals, so the
    same expression compiles once no matter how many pads instantiate it — a
    board's forty or so distinct expressions were otherwise recompiled tens of
    thousands of times, a quarter of all parse time.
    """

    source = _MACRO_ARG.sub(r"_\1", expression.strip()).replace("x", "*").replace("X", "*")
    if not source:
        return None
    try:
        tree = ast.parse(source, mode="eval")
    except SyntaxError:
        return None
    for node in ast.walk(tree):
        if not isinstance(node, _MACRO_ALLOWED):
            return None
        if isinstance(node, ast.Constant) and not isinstance(node.value, (int, float)):
            return None
    return compile(tree, "<macro>", "eval")


def _evaluate(expression: str, args: Sequence[float]) -> Optional[float]:
    """Evaluate one aperture-macro parameter expression.

    Macro parameters are arithmetic over the instantiation arguments (`$1`,
    `$2`, …) using Gerber's `x` for multiplication. Only the extent of the
    resulting primitive is wanted here, so anything this cannot evaluate is
    reported as unknown rather than guessed at.
    """

    code = _compile_macro_expression(expression)
    if code is None:
        return None
    names = {f"_{index + 1}": value for index, value in enumerate(args)}
    try:
        value = eval(code, {"__builtins__": {}}, names)
    except (ArithmeticError, ValueError, TypeError, NameError):
        return None
    return float(value) if isinstance(value, (int, float)) else None


@dataclass(frozen=True)
class Aperture:
    """A resolved aperture: what it draws, never which D-code held it."""

    shape: str
    params: Tuple[float, ...]
    macro: Optional[str] = None
    #: Half-extent in x and y, in millimetres. Used to size difference regions.
    half_extent: Tuple[float, float] = (0.0, 0.0)
    #: True when the macro body could not be evaluated and the extent is a floor.
    approximate: bool = False
    #: Evaluated macro primitives, used to draw the aperture.
    primitives: Tuple["MacroPrimitive", ...] = ()

    @property
    def key(self) -> str:
        name = self.macro or self.shape
        return f"{name}:" + ",".join(f"{value:.6g}" for value in self.params)


@dataclass(frozen=True)
class GerberOp:
    """One plotted element, normalised to board millimetres."""

    kind: str  # "flash" | "draw" | "arc" | "region"
    aperture: str
    points: Tuple[Tuple[float, float], ...]
    dark: bool
    #: Arc centre offset (I, J) relative to the start point. Part of the
    #: identity of an arc but never a position, so it is kept out of `points`
    #: where it would corrupt the bounding box.
    offset: Optional[Tuple[float, float]] = None
    #: "cw" or "ccw". Two arcs between the same endpoints with opposite sweep
    #: are different arcs, so this belongs to the operation's identity.
    sweep: Optional[str] = None

    def bounds(self, half_extent: Tuple[float, float]) -> Tuple[float, float, float, float]:
        xs = [point[0] for point in self.points]
        ys = [point[1] for point in self.points]
        return (
            min(xs) - half_extent[0],
            min(ys) - half_extent[1],
            max(xs) + half_extent[0],
            max(ys) + half_extent[1],
        )

    @property
    def signature(self) -> Tuple[Any, ...]:
        return (
            self.kind, self.aperture, self.dark, self.points,
            self.offset, self.sweep,
        )


@dataclass
class GerberLayer:
    """A parsed layer: the operations, plus what could not be resolved."""

    ops: List[GerberOp] = field(default_factory=list)
    apertures: Dict[str, Aperture] = field(default_factory=dict)
    warnings: List[str] = field(default_factory=list)

    def half_extent(self, aperture_key: str) -> Tuple[float, float]:
        aperture = self.apertures.get(aperture_key)
        return aperture.half_extent if aperture else (0.0, 0.0)


def _standard_aperture(shape: str, params: Sequence[float]) -> Tuple[float, float]:
    """Half-extent of the four standard aperture shapes, in millimetres."""

    if not params:
        return (0.0, 0.0)
    if shape == "C":
        radius = params[0] / 2
        return (radius, radius)
    if shape == "R" or shape == "O":
        width = params[0] / 2
        height = (params[1] if len(params) > 1 else params[0]) / 2
        return (width, height)
    if shape == "P":
        radius = params[0] / 2
        return (radius, radius)
    return (0.0, 0.0)


@dataclass(frozen=True)
class MacroPrimitive:
    """One evaluated primitive of an aperture macro instantiation."""

    code: str
    values: Tuple[float, ...]


def _macro_primitives(
    body: str, args: Sequence[float]
) -> Tuple[Tuple[MacroPrimitive, ...], bool]:
    """Evaluate an aperture macro into drawable primitives.

    Both the difference marker's extent and the rendered artwork come from
    these, so the macro is evaluated once. A primitive Prism cannot evaluate is
    dropped and reported, never guessed at.
    """

    primitives: List[MacroPrimitive] = []
    approximate = False
    for primitive in body.split("*"):
        tokens = [token.strip() for token in primitive.split(",") if token.strip()]
        if len(tokens) < 2:
            continue
        code = tokens[0]
        if code.startswith("0") and len(code) > 1:
            continue  # comment primitive
        values: List[float] = []
        for token in tokens[1:]:
            value = _evaluate(token, args)
            if value is None:
                approximate = True
                continue
            values.append(value)
        if not values:
            continue
        if code not in {"1", "4", "5", "6", "7", "20", "21"}:
            approximate = True
            continue
        primitives.append(MacroPrimitive(code=code, values=tuple(values)))
    return (tuple(primitives), approximate)


def _primitive_reach(primitive: MacroPrimitive) -> float:
    """How far one primitive extends from the aperture origin."""

    values = primitive.values
    code = primitive.code
    if code == "1" and len(values) >= 4:  # exposure, diameter, x, y
        return math.hypot(values[2], values[3]) + values[1] / 2
    if code == "21" and len(values) >= 5:  # centre line
        return math.hypot(values[3], values[4]) + math.hypot(values[1], values[2]) / 2
    if code == "20" and len(values) >= 6:  # vector line
        half = values[1] / 2
        return max(
            math.hypot(values[2], values[3]) + half,
            math.hypot(values[4], values[5]) + half,
        )
    if code == "4" and len(values) >= 4:
        # Outline: exposure, vertex count, then the vertex pairs, then rotation.
        # The count must not be read as a coordinate — doing so inflates every
        # rounded-rectangle pad to several millimetres.
        return max(
            (
                math.hypot(values[index], values[index + 1])
                for index in range(2, len(values) - 1, 2)
            ),
            default=0.0,
        )
    if code == "5" and len(values) >= 5:
        # Polygon: exposure, vertices, centre x, centre y, diameter.
        return math.hypot(values[2], values[3]) + values[4] / 2
    if code in {"6", "7"} and len(values) >= 3:
        # Moiré and thermal: centre x, centre y, outer diameter.
        return math.hypot(values[0], values[1]) + values[2] / 2
    return 0.0


def _macro_half_extent(
    primitives: Sequence[MacroPrimitive],
) -> Tuple[float, float]:
    reach = max((_primitive_reach(item) for item in primitives), default=0.0)
    return (reach, reach)


def parse_gerber(text: str) -> GerberLayer:
    """Parse one RS-274X layer into normalised board-millimetre operations."""

    layer = GerberLayer()
    scale = _UNIT_SCALE["MM"]
    int_digits, dec_digits = 4, 6
    macros: Dict[str, str] = {}
    aperture_by_code: Dict[str, str] = {}

    body = _COMMENT.sub("", text)
    directives = [match.group(1) for match in _EXTENDED.finditer(body)]
    # Polarity is positional: `%LPC*%` flips every following operation to clear.
    # It has to stay in the operation stream, unlike the declarations above it.
    stream = _EXTENDED.sub(
        lambda match: "*" + match.group(1) if match.group(1).startswith("LP") else "",
        body,
    )

    # Units and coordinate format must be known before any aperture is scaled,
    # and macros before the apertures that instantiate them, so the extended
    # blocks are walked in dependency order rather than file order.
    for directive in directives:
        for statement in filter(None, (part.strip() for part in directive.split("*"))):
            format_match = _FORMAT_SPEC.match(statement)
            if format_match:
                int_digits = int(format_match.group(1))
                dec_digits = int(format_match.group(2))
            elif statement.startswith("MO"):
                scale = _UNIT_SCALE.get(statement[2:4].upper(), scale)

    for directive in directives:
        if directive.startswith("AM"):
            head, _, macro_body = directive.partition("*")
            macros[head[2:].strip()] = macro_body

    for directive in directives:
        definition = _APERTURE_DEF.match(directive.strip().rstrip("*"))
        if not definition:
            continue
        code, shape, raw_params = definition.groups()
        params: List[float] = []
        for token in (raw_params or "").split("X"):
            token = token.strip()
            if not token:
                continue
            try:
                params.append(float(token))
            except ValueError:
                params.append(0.0)
        shape = shape.strip()
        if shape in {"C", "R", "O", "P"}:
            scaled = tuple(value * scale for value in params)
            aperture = Aperture(
                shape=shape,
                params=scaled,
                half_extent=_standard_aperture(shape, scaled),
            )
        else:
            primitives, approximate = _macro_primitives(macros.get(shape, ""), params)
            extent = _macro_half_extent(primitives)
            aperture = Aperture(
                shape="macro",
                params=tuple(value * scale for value in params),
                macro=shape,
                half_extent=(extent[0] * scale, extent[1] * scale),
                approximate=approximate,
                primitives=primitives,
            )
            if approximate:
                layer.warnings.append(f"aperture macro {shape} extent approximated")
        layer.apertures[aperture.key] = aperture
        aperture_by_code[code] = aperture.key

    divisor = 10 ** dec_digits
    current_aperture = ""
    x = y = 0.0
    cursor: Tuple[float, float] = (0.0, 0.0)
    dark = True
    interpolation = "linear"
    in_region = False
    region_points: List[Tuple[float, float]] = []
    modal_op: Optional[str] = None

    for raw in stream.split("*"):
        command = raw.strip()
        if not command:
            continue
        if command.startswith("D") and command[1:].isdigit() and int(command[1:]) >= 10:
            current_aperture = aperture_by_code.get(str(int(command[1:])), "")
            continue
        if command.startswith("G54D"):
            current_aperture = aperture_by_code.get(str(int(command[4:])), "")
            continue
        if command in {"G01", "G1"}:
            interpolation = "linear"
            continue
        if command in {"G02", "G2"}:
            interpolation = "cw"
            continue
        if command in {"G03", "G3"}:
            interpolation = "ccw"
            continue
        if command == "G36":
            in_region = True
            region_points = []
            continue
        if command == "G37":
            if region_points:
                layer.ops.append(GerberOp(
                    kind="region",
                    aperture="region",
                    points=tuple(region_points),
                    dark=dark,
                ))
            in_region = False
            region_points = []
            continue
        if command in {"G74", "G75", "M02", "M0", "M2"}:
            continue
        if command.startswith("LP"):
            dark = command[2:3].upper() != "C"
            continue

        # Interpolation can also be set inline, as `G01X…Y…D01`.
        inline = _INLINE_G_CODE.match(command)
        if inline:
            interpolation = {"1": "linear", "2": "cw", "3": "ccw"}[inline.group(1)]
            command = command[inline.end():]

        coordinates = dict(
            (axis, int(digits)) for axis, digits in _COORD.findall(command)
        )
        if not coordinates and not _D_CODE.search(command):
            continue
        if "X" in coordinates:
            x = coordinates["X"] / divisor * scale
        if "Y" in coordinates:
            y = coordinates["Y"] / divisor * scale
        d_match = _D_CODE.search(command)
        operation = f"D0{d_match.group(1)}" if d_match else modal_op
        if operation is None:
            continue
        modal_op = operation
        point = (_quantise(x), _quantise(y))

        if in_region:
            if operation in {"D01", "D02"}:
                region_points.append(point)
            cursor = point
            continue
        if operation == "D02":
            cursor = point
            continue
        if operation == "D03":
            layer.ops.append(GerberOp(
                kind="flash",
                aperture=current_aperture,
                points=(point,),
                dark=dark,
            ))
            cursor = point
            continue
        if operation == "D01":
            # A draw runs from the current point to the new one. Recording only
            # the endpoint would miss a trace whose start moved while its end
            # stayed put — the D02 that set the start is not itself an op.
            if interpolation == "linear":
                layer.ops.append(GerberOp(
                    kind="draw",
                    aperture=current_aperture,
                    points=(cursor, point),
                    dark=dark,
                ))
            else:
                offset_i = coordinates.get("I", 0) / divisor * scale
                offset_j = coordinates.get("J", 0) / divisor * scale
                layer.ops.append(GerberOp(
                    kind="arc",
                    aperture=current_aperture,
                    points=(cursor, point),
                    dark=dark,
                    offset=(_quantise(offset_i), _quantise(offset_j)),
                    sweep=interpolation,
                ))
            cursor = point

    if not layer.ops and "%" not in text and "D0" not in text:
        raise GerberParseError("no plotted operations found")
    return layer


# ── Excellon (NC drill) ────────────────────────────────────────────────────

_TOOL_DEF = re.compile(r"^T(\d+)(?:[CFS]([\d.]+))+")
_TOOL_DIAMETER = re.compile(r"C([\d.]+)")
_TOOL_SELECT = re.compile(r"^T(\d+)$")
_APER_FUNCTION = re.compile(r"TA\.AperFunction,(.+)$")
_EXCELLON_COORD = re.compile(r"([XY])(-?[\d.]+)")


def _excellon_value(token: str, scale: float, dec_digits: int) -> float:
    """One Excellon coordinate, decimal or zero-suppressed."""

    if "." in token:
        return float(token) * scale
    sign = -1.0 if token.startswith("-") else 1.0
    digits = token.lstrip("+-")
    return sign * (int(digits or "0") / (10 ** dec_digits)) * scale


def parse_excellon(text: str) -> GerberLayer:
    """Parse an NC drill program into the same operation model as a Gerber.

    Holes and slots are the fabrication features a drill file carries, and they
    diff, cluster and get numbered exactly like plotted geometry — so they are
    expressed as operations over synthetic round "apertures" and reuse the whole
    comparison path rather than growing a parallel one.

    The tool's plating function is part of its identity. A 0.3 mm hole that
    changes from plated to non-plated is the same circle and a different
    fabrication instruction.
    """

    layer = GerberLayer()
    scale = 1.0
    dec_digits = 3
    tools: Dict[str, str] = {}
    pending_function = ""
    current_tool = ""
    in_header = True
    x = y = 0.0
    cursor: Tuple[float, float] = (0.0, 0.0)
    routing = False

    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith(";") or line.startswith("; "):
            function = _APER_FUNCTION.search(line)
            if function:
                pending_function = function.group(1).strip()
            continue
        if line in {"M48", "FMAT,2", "G90", "G05", "M71", "M72"}:
            if line == "M71":
                scale = 1.0
            elif line == "M72":
                scale = 25.4
            continue
        if line == "G91":
            layer.warnings.append("incremental drill coordinates are not supported")
            continue
        if line == "%":
            in_header = False
            continue
        if line in {"M30", "M00"}:
            break
        if line.startswith("METRIC") or line.startswith("INCH"):
            scale = 25.4 if line.startswith("INCH") else 1.0
            dec_digits = 4 if line.startswith("INCH") else 3
            continue
        if line in {"M15", "M16"}:
            # Tool down / tool up: the moves between them cut a routed slot.
            routing = line == "M15"
            continue

        if in_header:
            definition = _TOOL_DEF.match(line)
            diameter = _TOOL_DIAMETER.search(line)
            if definition and diameter:
                code = str(int(definition.group(1)))
                size = float(diameter.group(1)) * scale
                function = pending_function or "Drill"
                aperture = Aperture(
                    shape="drill",
                    params=(round(size, 6),),
                    macro=function,
                    half_extent=(size / 2, size / 2),
                )
                layer.apertures[aperture.key] = aperture
                tools[code] = aperture.key
                pending_function = ""
            continue

        selection = _TOOL_SELECT.match(line)
        if selection:
            current_tool = tools.get(str(int(selection.group(1))), "")
            continue

        body = line
        for prefix in ("G00", "G01", "G0", "G1"):
            if body.startswith(prefix):
                body = body[len(prefix):]
                break
        head, _, slot = body.partition("G85")
        coordinates = _EXCELLON_COORD.findall(head)
        if not coordinates:
            continue
        for axis, token in coordinates:
            value = _excellon_value(token, scale, dec_digits)
            if axis == "X":
                x = value
            else:
                y = value
        start = (_quantise(x), _quantise(y))

        if slot:
            for axis, token in _EXCELLON_COORD.findall(slot):
                value = _excellon_value(token, scale, dec_digits)
                if axis == "X":
                    x = value
                else:
                    y = value
            cursor = (_quantise(x), _quantise(y))
            layer.ops.append(GerberOp(
                kind="draw",
                aperture=current_tool,
                points=(start, cursor),
                dark=True,
            ))
            continue

        if routing:
            # Tool is down: this move cuts from where it was to where it lands.
            # Recording only the destination would lose which way the slot runs.
            layer.ops.append(GerberOp(
                kind="draw",
                aperture=current_tool,
                points=(cursor, start),
                dark=True,
            ))
        else:
            layer.ops.append(GerberOp(
                kind="flash",
                aperture=current_tool,
                points=(start,),
                dark=True,
            ))
        cursor = start

    return layer


@dataclass(frozen=True)
class FabricationLayer:
    """One plotted layer, identified the way a fab house identifies it."""

    #: Gerber X2 file function, e.g. `Copper,L1,Top`. Survives board renames and
    #: file-extension conventions, so it is the pairing key between revisions.
    function: str
    #: KiCad layer name for display, e.g. `F.Cu`.
    name: str
    filename: str
    text: str
    #: Which grammar the file is written in. Drill programs are Excellon, not
    #: Gerber, but they compare through the same operation model.
    kind: str = "gerber"


@dataclass
class DifferenceRegion:
    """One numbered fabrication difference, in board millimetres."""

    index: int
    x: float
    y: float
    width: float
    height: float
    added: int
    removed: int

    @property
    def kind(self) -> str:
        if self.added and self.removed:
            return "changed"
        return "added" if self.added else "removed"

    def as_dict(self) -> Dict[str, Any]:
        return {
            "index": self.index,
            "kind": self.kind,
            # Bottom-left corner, matching how the marker is anchored on canvas.
            "x": round(self.x, 4),
            "y": round(self.y, 4),
            "width": round(self.width, 4),
            "height": round(self.height, 4),
            "addedOps": self.added,
            "removedOps": self.removed,
        }


def _cluster(
    boxes: Sequence[Tuple[str, Tuple[float, float, float, float]]],
) -> List[DifferenceRegion]:
    """Group changed extents into markers a reviewer can actually look at.

    Merging is bounded twice over. Two extents join only when they come within
    `merge_distance`, so a rerouted trace and the via it lands on are one marker
    rather than forty — and the union may not exceed `max_extent`, because
    unbounded transitive merging chains changed copper across a dense board into
    a single marker the size of the plane, which says only "this layer differs"
    and points at nothing. Past that size the change is reported as the several
    local differences it is.
    """

    merge_distance = _REGION_MERGE_MM
    max_extent = _MAX_REGION_MM
    cell = max(max_extent, merge_distance * 2)
    grid: Dict[Tuple[int, int], List[int]] = {}
    extents: List[List[float]] = []
    counts: List[List[int]] = []

    def register(index: int) -> None:
        x0, y0, x1, y1 = extents[index]
        for gx in range(int(x0 // cell), int(x1 // cell) + 1):
            for gy in range(int(y0 // cell), int(y1 // cell) + 1):
                bucket = grid.setdefault((gx, gy), [])
                if index not in bucket:
                    bucket.append(index)

    def candidates(box: Tuple[float, float, float, float]):
        seen = set()
        for gx in range(int(box[0] // cell) - 1, int(box[2] // cell) + 2):
            for gy in range(int(box[1] // cell) - 1, int(box[3] // cell) + 2):
                for index in grid.get((gx, gy), ()):
                    if index not in seen:
                        seen.add(index)
                        yield index

    for kind, box in sorted(boxes, key=lambda item: (item[1][0], item[1][1])):
        target = None
        for index in candidates(box):
            x0, y0, x1, y1 = extents[index]
            if (
                box[0] - merge_distance > x1
                or box[2] + merge_distance < x0
                or box[1] - merge_distance > y1
                or box[3] + merge_distance < y0
            ):
                continue
            merged = [
                min(x0, box[0]), min(y0, box[1]),
                max(x1, box[2]), max(y1, box[3]),
            ]
            if (
                merged[2] - merged[0] > max_extent
                or merged[3] - merged[1] > max_extent
            ):
                continue
            grew = merged != extents[index]
            extents[index] = merged
            target = index
            if grew:
                register(index)
            break
        if target is None:
            extents.append([box[0], box[1], box[2], box[3]])
            counts.append([0, 0])
            target = len(extents) - 1
            register(target)
        counts[target][0 if kind == "added" else 1] += 1

    regions = [
        DifferenceRegion(
            index=0,
            x=extent[0],
            y=extent[1],
            width=extent[2] - extent[0],
            height=extent[3] - extent[1],
            added=count[0],
            removed=count[1],
        )
        for extent, count in zip(extents, counts)
    ]

    # Numbered top-down then left-to-right: Gerber Y grows upward, so the
    # reviewer walks the board the way they read it.
    regions.sort(key=lambda region: (-(region.y + region.height), region.x))
    for number, region in enumerate(regions, start=1):
        region.index = number
    return regions


def _diffable_ops(layer: GerberLayer) -> List[GerberOp]:
    """The operations to compare, with poured areas broken into their edges.

    A pour is one operation carrying hundreds of vertices, so comparing it whole
    makes any single moved vertex read as the entire pour being replaced — and
    the difference marker then covers the whole plane, which tells a reviewer
    nothing. Comparing edge by edge puts the marker on the millimetre that
    actually moved. Rendering still uses the intact polygon.
    """

    ops: List[GerberOp] = []
    for op in layer.ops:
        if op.kind != "region" or len(op.points) < 2:
            ops.append(op)
            continue
        closed = (
            op.points
            if op.points[0] == op.points[-1]
            else (*op.points, op.points[0])
        )
        ops.extend(
            GerberOp(
                kind="region_edge",
                aperture=op.aperture,
                points=(start, end),
                dark=op.dark,
            )
            for start, end in zip(closed, closed[1:])
            if start != end
        )
    return ops


def diff_layer(base: GerberLayer, head: GerberLayer) -> List[DifferenceRegion]:
    """Numbered difference regions between two revisions of one layer."""

    base_items = _diffable_ops(base)
    head_items = _diffable_ops(head)
    base_ops = Counter(op.signature for op in base_items)
    head_ops = Counter(op.signature for op in head_items)
    if base_ops == head_ops:
        return []

    removed = base_ops - head_ops
    added = head_ops - base_ops
    boxes: List[Tuple[str, Tuple[float, float, float, float]]] = []
    for op in base_items:
        signature = op.signature
        if removed[signature] > 0:
            removed[signature] -= 1
            boxes.append(("removed", op.bounds(base.half_extent(op.aperture))))
    for op in head_items:
        signature = op.signature
        if added[signature] > 0:
            added[signature] -= 1
            boxes.append(("added", op.bounds(head.half_extent(op.aperture))))
    if not boxes:
        return []
    return _cluster(boxes)


# ── Rendering ──────────────────────────────────────────────────────────────
#
# The artwork the reviewer looks at is drawn from the same operation stream the
# comparison diffs. Rendering with an external Gerber rasteriser would show a
# picture produced by different code from the answer, and the two could disagree
# on exactly the fab-only changes this tab exists to catch.

#: Arcs are flattened rather than emitted as SVG arc commands: sweep direction
#: through a mirrored axis is easy to get subtly wrong, and a chord this fine is
#: indistinguishable at any zoom a board review uses.
_ARC_SEGMENT_RADIANS = math.pi / 24


def _fmt(value: float) -> str:
    return f"{value:.4f}".rstrip("0").rstrip(".") or "0"


def _point(x: float, y: float) -> str:
    # Gerber Y grows upward, SVG downward. Flipping here keeps the rendered
    # artwork in the same board coordinates as the difference regions.
    return f"{_fmt(x)},{_fmt(-y)}"


def _rotate(x: float, y: float, degrees: float) -> Tuple[float, float]:
    if not degrees:
        return (x, y)
    angle = math.radians(degrees)
    return (
        x * math.cos(angle) - y * math.sin(angle),
        x * math.sin(angle) + y * math.cos(angle),
    )


def _regular_polygon(
    cx: float, cy: float, diameter: float, vertices: int, rotation: float
) -> List[Tuple[float, float]]:
    radius = diameter / 2
    count = max(3, min(int(vertices), 64))
    return [
        (
            cx + radius * math.cos(math.radians(rotation) + 2 * math.pi * index / count),
            cy + radius * math.sin(math.radians(rotation) + 2 * math.pi * index / count),
        )
        for index in range(count)
    ]


def _polygon(points: Sequence[Tuple[float, float]], fill: str) -> str:
    path = " ".join(_point(x, y) for x, y in points)
    return f'<polygon points="{path}" fill="{fill}"/>'


def _macro_elements(
    aperture: Aperture, x: float, y: float, dark: str, clear: str
) -> List[str]:
    elements: List[str] = []
    for primitive in aperture.primitives:
        values = primitive.values
        code = primitive.code
        if code == "1" and len(values) >= 4:
            fill = dark if values[0] else clear
            radius = values[1] / 2
            elements.append(
                f'<circle cx="{_fmt(x + values[2])}" cy="{_fmt(-(y + values[3]))}"'
                f' r="{_fmt(radius)}" fill="{fill}"/>'
            )
        elif code == "4" and len(values) >= 4:
            fill = dark if values[0] else clear
            rotation = values[-1] if len(values) % 2 == 1 else 0.0
            corners = [
                _rotate(values[index], values[index + 1], rotation)
                for index in range(2, len(values) - 1, 2)
            ]
            elements.append(_polygon([(x + px, y + py) for px, py in corners], fill))
        elif code == "5" and len(values) >= 5:
            fill = dark if values[0] else clear
            rotation = values[5] if len(values) > 5 else 0.0
            elements.append(_polygon(
                _regular_polygon(
                    x + values[2], y + values[3], values[4], int(values[1]), rotation
                ),
                fill,
            ))
        elif code == "20" and len(values) >= 6:
            fill = dark if values[0] else clear
            rotation = values[6] if len(values) > 6 else 0.0
            start = _rotate(values[2], values[3], rotation)
            end = _rotate(values[4], values[5], rotation)
            elements.append(
                f'<line x1="{_fmt(x + start[0])}" y1="{_fmt(-(y + start[1]))}"'
                f' x2="{_fmt(x + end[0])}" y2="{_fmt(-(y + end[1]))}"'
                f' stroke="{fill}" stroke-width="{_fmt(values[1])}"'
                ' stroke-linecap="butt"/>'
            )
        elif code == "21" and len(values) >= 5:
            fill = dark if values[0] else clear
            rotation = values[5] if len(values) > 5 else 0.0
            half_w, half_h = values[1] / 2, values[2] / 2
            corners = [
                _rotate(dx, dy, rotation)
                for dx, dy in (
                    (-half_w, -half_h), (half_w, -half_h),
                    (half_w, half_h), (-half_w, half_h),
                )
            ]
            elements.append(_polygon(
                [(x + values[3] + px, y + values[4] + py) for px, py in corners],
                fill,
            ))
        elif code in {"6", "7"} and len(values) >= 4:
            # Moiré and thermal both read as a ring at this scale. The inner
            # cut-out is drawn in the clear colour, which is what the plotter
            # does to the copper underneath.
            outer, inner = values[2], values[3]
            elements.append(
                f'<circle cx="{_fmt(x + values[0])}" cy="{_fmt(-(y + values[1]))}"'
                f' r="{_fmt(outer / 2)}" fill="{dark}"/>'
            )
            if inner > 0:
                elements.append(
                    f'<circle cx="{_fmt(x + values[0])}" cy="{_fmt(-(y + values[1]))}"'
                    f' r="{_fmt(inner / 2)}" fill="{clear}"/>'
                )
    return elements


def _flash_elements(
    aperture: Optional[Aperture], x: float, y: float, dark: str, clear: str
) -> List[str]:
    if aperture is None:
        return []
    fill = dark
    params = aperture.params
    if aperture.shape in {"C", "drill"} and params:
        return [
            f'<circle cx="{_fmt(x)}" cy="{_fmt(-y)}" r="{_fmt(params[0] / 2)}"'
            f' fill="{fill}"/>'
        ]
    if aperture.shape == "R" and params:
        width = params[0]
        height = params[1] if len(params) > 1 else params[0]
        return [
            f'<rect x="{_fmt(x - width / 2)}" y="{_fmt(-y - height / 2)}"'
            f' width="{_fmt(width)}" height="{_fmt(height)}" fill="{fill}"/>'
        ]
    if aperture.shape == "O" and params:
        width = params[0]
        height = params[1] if len(params) > 1 else params[0]
        return [
            f'<rect x="{_fmt(x - width / 2)}" y="{_fmt(-y - height / 2)}"'
            f' width="{_fmt(width)}" height="{_fmt(height)}"'
            f' rx="{_fmt(min(width, height) / 2)}" fill="{fill}"/>'
        ]
    if aperture.shape == "P" and params:
        vertices = int(params[1]) if len(params) > 1 else 3
        rotation = params[2] if len(params) > 2 else 0.0
        return [_polygon(_regular_polygon(x, y, params[0], vertices, rotation), fill)]
    if aperture.shape == "macro":
        return _macro_elements(aperture, x, y, dark, clear)
    return []


def _stroke_width(aperture: Optional[Aperture]) -> float:
    """Line width for a drawn trace.

    Gerber only defines circular apertures for interpolation; anything else is
    deprecated, so a non-circular aperture falls back to its smaller dimension
    rather than refusing to draw the conductor at all.
    """

    if aperture is None:
        return 0.0
    if aperture.shape in {"C", "drill"} and aperture.params:
        return aperture.params[0]
    if aperture.params:
        return min(aperture.params[0], aperture.params[1] if len(aperture.params) > 1 else aperture.params[0])
    return max(aperture.half_extent) * 2


def _arc_points(
    start: Tuple[float, float],
    end: Tuple[float, float],
    offset: Tuple[float, float],
    sweep: Optional[str],
) -> List[Tuple[float, float]]:
    centre = (start[0] + offset[0], start[1] + offset[1])
    radius = math.hypot(start[0] - centre[0], start[1] - centre[1])
    if radius <= 0:
        return [start, end]
    start_angle = math.atan2(start[1] - centre[1], start[0] - centre[0])
    end_angle = math.atan2(end[1] - centre[1], end[0] - centre[0])
    span = end_angle - start_angle
    if sweep == "cw":
        while span > 0:
            span -= 2 * math.pi
        if span == 0:
            span = -2 * math.pi
    else:
        while span < 0:
            span += 2 * math.pi
        if span == 0:
            span = 2 * math.pi
    steps = max(2, int(abs(span) / _ARC_SEGMENT_RADIANS) + 1)
    return [
        (
            centre[0] + radius * math.cos(start_angle + span * index / steps),
            centre[1] + radius * math.sin(start_angle + span * index / steps),
        )
        for index in range(steps + 1)
    ]


def render_layer_svg(
    layer: GerberLayer,
    bounds: Tuple[float, float, float, float],
    *,
    colour: str = "#3fb950",
    background: str = "#0b0f14",
) -> str:
    """Draw one parsed layer as SVG, in KiCad board coordinates.

    Clear polarity paints the background colour rather than cutting a mask:
    Gerber is a painter's-algorithm format, so drawing in order over an opaque
    background reproduces it exactly and keeps the output a flat element list.
    """

    x0, y0, x1, y1 = bounds
    body: List[str] = [
        f'<rect x="{_fmt(x0)}" y="{_fmt(y0)}" width="{_fmt(x1 - x0)}"'
        f' height="{_fmt(y1 - y0)}" fill="{background}"/>'
    ]
    for op in layer.ops:
        aperture = layer.apertures.get(op.aperture)
        dark = colour if op.dark else background
        clear = background if op.dark else colour
        if op.kind == "flash":
            body.extend(_flash_elements(aperture, op.points[0][0], op.points[0][1], dark, clear))
        elif op.kind == "region":
            body.append(_polygon(op.points, dark))
        elif op.kind in {"draw", "arc"}:
            points = (
                _arc_points(op.points[0], op.points[1], op.offset or (0.0, 0.0), op.sweep)
                if op.kind == "arc" and len(op.points) >= 2
                else list(op.points)
            )
            if len(points) < 2:
                continue
            path = " ".join(_point(x, y) for x, y in points)
            width = _stroke_width(aperture)
            body.append(
                f'<polyline points="{path}" fill="none" stroke="{dark}"'
                f' stroke-width="{_fmt(width)}" stroke-linecap="round"'
                ' stroke-linejoin="round"/>'
            )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{_fmt(x0)} {_fmt(y0)}'
        f' {_fmt(x1 - x0)} {_fmt(y1 - y0)}" preserveAspectRatio="xMidYMid meet">'
        + "".join(body)
        + "</svg>"
    )


# ── Layer discovery ────────────────────────────────────────────────────────

_JOB_SUFFIX = "-job.gbrjob"
_DRILL_SUFFIXES = {".drl"}

# Fallback only. KiCad writes Protel extensions, where inner copper is `.g1`,
# `.g2`, … `.gN` — an allowlist of the outer-layer extensions silently drops
# every inner layer of a multilayer board, which is most of its copper.
_GERBER_SUFFIXES = {
    ".gbr", ".gbl", ".gtl", ".gbs", ".gts", ".gbo", ".gto",
    ".gba", ".gta", ".gbp", ".gtp", ".gm1", ".gm2", ".gko",
}
_INNER_COPPER_SUFFIX = re.compile(r"^\.g\d+$")


def _is_gerber(path: Path, plotted: Set[str]) -> bool:
    suffix = path.suffix.lower()
    if suffix in _DRILL_SUFFIXES or path.name.endswith(_JOB_SUFFIX):
        return False
    return (
        path.name in plotted
        or suffix in _GERBER_SUFFIXES
        or bool(_INNER_COPPER_SUFFIX.match(suffix))
    )


def _board_stem(directory: Path) -> str:
    for candidate in directory.iterdir():
        if candidate.name.endswith(_JOB_SUFFIX):
            return candidate.name[: -len(_JOB_SUFFIX)]
    return ""


def _file_functions(directory: Path) -> Dict[str, str]:
    """Read the Gerber job file's declared function for each plotted file."""

    for candidate in directory.iterdir():
        if not candidate.name.endswith(_JOB_SUFFIX):
            continue
        try:
            job = json.loads(candidate.read_text(encoding="utf-8", errors="ignore"))
        except (OSError, ValueError):
            return {}
        functions: Dict[str, str] = {}
        for entry in job.get("FilesAttributes") or []:
            path = str(entry.get("Path") or "")
            function = str(entry.get("FileFunction") or "")
            if path and function:
                functions[path] = function
        return functions
    return {}


def read_layers(directory: Path) -> List[FabricationLayer]:
    """Load every plotted Gerber layer in one export directory."""

    if not directory.is_dir():
        return []
    stem = _board_stem(directory)
    functions = _file_functions(directory)
    layers: List[FabricationLayer] = []
    for path in sorted(directory.iterdir()):
        suffix = path.suffix.lower()
        drill = suffix in _DRILL_SUFFIXES
        if not path.is_file() or not (drill or _is_gerber(path, set(functions))):
            continue
        label = path.stem
        if stem and label.startswith(f"{stem}-"):
            label = label[len(stem) + 1:]
        elif not stem and "-" in label and not drill:
            # No job file to name the board. KiCad separates the board stem from
            # the layer with "-" and never puts one inside a layer name, so the
            # last separator is the boundary. A drill program has no layer
            # suffix, so this must not fire for it.
            label = label.rsplit("-", 1)[1]
        name = label.replace("_", ".")
        if drill:
            # A single mixed-plating program leaves nothing after the board
            # stem; `--excellon-separate-th` leaves PTH or NPTH.
            suffixed = label if stem and label != path.stem else ""
            name = f"Drill ({suffixed})" if suffixed else "Drill"
            function = "NCDrill"
        else:
            function = functions.get(path.name) or f"Unknown,{name}"
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        layers.append(FabricationLayer(
            function=function,
            name=name,
            filename=path.name,
            text=text,
            kind="excellon" if suffix in _DRILL_SUFFIXES else "gerber",
        ))
    return layers


def _to_board_millimetres(region: DifferenceRegion) -> Dict[str, Any]:
    """Move a region from plot space into KiCad board coordinates.

    Gerber's Y axis points up and KiCad's points down, so a plotted board sits
    at negative Y. Every other coordinate Prism hands the frontend — visual
    targets, footprint positions, viewer cameras — is in KiCad board space, and
    a region that disagreed would cross-probe to a mirror image of the board.
    """

    payload = region.as_dict()
    payload["y"] = round(-(region.y + region.height), 4)
    return payload


_OUTLINE_NAMES = ("Edge.Cuts", "Edge_Cuts")


def _board_outline(layers: Sequence[FabricationLayer]) -> Optional[Dict[str, Any]]:
    """The board profile as segments in KiCad board millimetres.

    Difference regions are coordinates; without the board they sit in an empty
    plane. The profile layer is small — tens of segments — and turns the region
    list into a map the reviewer can actually orient on. Arcs are reduced to
    their endpoints: this frames the markers, it is not the fabrication artwork.
    """

    for layer in layers:
        if layer.name not in _OUTLINE_NAMES:
            continue
        try:
            parsed = parse_gerber(layer.text)
        except GerberParseError:
            return None
        segments: List[List[List[float]]] = []
        xs: List[float] = []
        ys: List[float] = []
        for op in parsed.ops:
            points = [[round(x, 4), round(-y, 4)] for x, y in op.points]
            for x, y in points:
                xs.append(x)
                ys.append(y)
            if len(points) >= 2:
                segments.append(points)
        if not xs:
            return None
        return {
            "segments": segments,
            "bounds": [
                round(min(xs), 4),
                round(min(ys), 4),
                round(max(xs), 4),
                round(max(ys), 4),
            ],
        }
    return None


#: Old revision red, new revision green — the same reading the change list uses,
#: and the pair that makes a screen-blended composite show shared copper as
#: yellow, removed as red and added as green.
BASE_COLOUR = "#f85149"
COMPARE_COLOUR = "#3fb950"
RENDER_BACKGROUND = "#0b0f14"


def _layer_bounds(parsed: GerberLayer) -> Optional[Tuple[float, float, float, float]]:
    extent: Optional[List[float]] = None
    for op in parsed.ops:
        box = op.bounds(parsed.half_extent(op.aperture))
        if extent is None:
            extent = [box[0], box[1], box[2], box[3]]
            continue
        extent[0] = min(extent[0], box[0])
        extent[1] = min(extent[1], box[1])
        extent[2] = max(extent[2], box[2])
        extent[3] = max(extent[3], box[3])
    return (extent[0], extent[1], extent[2], extent[3]) if extent else None


def _safe_name(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name)



def compare_layers(
    base: Sequence[FabricationLayer],
    head: Sequence[FabricationLayer],
    render_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    """Compare two fabrication exports, layer by layer.

    When `render_dir` is given, each layer is also drawn to SVG for both
    revisions from the very operations that were compared. Every layer shares
    one board-wide viewBox, so the two revisions register exactly on top of each
    other and the difference markers — which are in the same board millimetres —
    overlay without a second coordinate system.
    """

    # Paired by layer name, not by Gerber file function: KiCad gives every user
    # layer the function `Other,User`, so pairing on function silently collapses
    # User.1 through User.4 and the comment and drawing layers into one entry.
    # The name already excludes the board stem, so it survives a project rename.
    by_name_base = {layer.name: layer for layer in base}
    by_name_head = {layer.name: layer for layer in head}
    order = list(by_name_head) + [
        name for name in by_name_base if name not in by_name_head
    ]

    entries: List[Dict[str, Any]] = []
    warnings: List[str] = []
    totals = Counter()
    parsed: Dict[str, Tuple[GerberLayer, GerberLayer]] = {}
    for name in order:
        before = by_name_base.get(name)
        after = by_name_head.get(name)
        source = after or before
        if source is None:
            continue
        entry: Dict[str, Any] = {
            "function": source.function,
            "name": source.name,
            "file": {
                "base": before.filename if before else None,
                "compare": after.filename if after else None,
            },
            "regions": [],
            "warnings": [],
        }
        if before is None or after is None:
            # A layer the fab package gained or lost outright. There is no
            # geometry to diff, and the layer's presence is the change.
            entry["status"] = "added" if before is None else "removed"
            totals[entry["status"]] += 1
            entries.append(entry)
            warnings.append(
                f"{source.name} is only in the "
                f"{'compare' if before is None else 'base'} fabrication output"
            )
            continue

        read = parse_excellon if source.kind == "excellon" else parse_gerber
        try:
            parsed_base = read(before.text)
            parsed_head = read(after.text)
        except GerberParseError as error:
            entry["status"] = "unreadable"
            entry["warnings"].append(str(error))
            warnings.append(f"{source.name}: {error}")
            entries.append(entry)
            continue

        entry["warnings"] = sorted(set(parsed_base.warnings) | set(parsed_head.warnings))
        parsed[source.name] = (parsed_base, parsed_head)
        regions = diff_layer(parsed_base, parsed_head)
        entry["regions"] = [_to_board_millimetres(region) for region in regions]
        entry["status"] = "changed" if regions else "unchanged"
        totals["changed" if regions else "unchanged"] += 1
        for region in regions:
            totals[region.kind + "Regions"] += 1
        entries.append(entry)

    # Changed layers first: a fabrication review starts from what moved.
    entries.sort(key=lambda item: (item["status"] == "unchanged", item["name"]))
    region_count = sum(len(entry["regions"]) for entry in entries)
    outline = _board_outline(head) or _board_outline(base)

    # One viewBox for every layer and both revisions. Fitting each layer to its
    # own extents would make the panes disagree the moment a layer is sparse.
    extents = [
        tuple(outline["bounds"]) if outline else None,
        *(
            (box[0], -box[3], box[2], -box[1])
            for pair in parsed.values()
            for layer in pair
            if (box := _layer_bounds(layer)) is not None
        ),
    ]
    boxes = [box for box in extents if box is not None]
    bounds = (
        (
            min(box[0] for box in boxes),
            min(box[1] for box in boxes),
            max(box[2] for box in boxes),
            max(box[3] for box in boxes),
        )
        if boxes
        else None
    )
    if render_dir is not None and bounds is not None:
        render_dir.mkdir(parents=True, exist_ok=True)
        for entry in entries:
            pair = parsed.get(entry["name"])
            if pair is None:
                continue
            render: Dict[str, str] = {}
            for side, layer, colour in (
                ("base", pair[0], BASE_COLOUR),
                ("compare", pair[1], COMPARE_COLOUR),
            ):
                path = render_dir / f"{_safe_name(entry['name'])}.{side}.svg"
                path.write_text(
                    render_layer_svg(
                        layer, bounds, colour=colour, background=RENDER_BACKGROUND
                    ),
                    encoding="utf-8",
                )
                render[side] = str(path)
            entry["render"] = render

    return {
        "present": bool(entries),
        "outline": outline,
        "bounds": list(bounds) if bounds else None,
        # What the reviewer is looking at, which is the board — not the union
        # above. Fabrication and courtyard layers carry annotation well outside
        # the profile, and fitting to that leaves the board a quarter of the
        # pane with empty space around it.
        "board": list(outline["bounds"]) if outline else (list(bounds) if bounds else None),
        "summary": {
            "layers": len(entries),
            "changedLayers": sum(
                1 for entry in entries if entry["status"] not in {"unchanged"}
            ),
            "regions": region_count,
            "addedRegions": totals["addedRegions"],
            "removedRegions": totals["removedRegions"],
            "changedRegions": totals["changedRegions"],
        },
        "layers": entries,
        "warnings": warnings,
    }


def compare_directories(
    base_dir: Path,
    head_dir: Path,
    render_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    """Compare two `kicad-cli pcb export gerbers` output directories."""

    return compare_layers(read_layers(base_dir), read_layers(head_dir), render_dir)


# ── Generation ─────────────────────────────────────────────────────────────

def _cli_command() -> str:
    # Imported lazily: resolving the KiCad CLI is a module-level side effect in
    # diff_service, and the comparison engine above must stay importable (and
    # testable) on a machine with no KiCad installed.
    from app.services.diff_service import CLI_CMD

    return CLI_CMD


def _export(
    kind: str,
    pcb_path: Path,
    output_dir: Path,
    *extra: str,
    timeout: float = 300.0,
) -> Tuple[bool, str]:
    """Run one `kicad-cli pcb export <kind>` into `output_dir`."""

    output_dir.mkdir(parents=True, exist_ok=True)
    command = [
        _cli_command(), "pcb", "export", kind,
        *extra, "--output", str(output_dir), str(pcb_path),
    ]
    try:
        completed = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError:
        return (False, "kicad-cli is not available")
    except subprocess.TimeoutExpired:
        return (False, f"{kind} export timed out after {timeout:.0f}s")
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "").strip().splitlines()
        return (False, detail[-1] if detail else f"exit code {completed.returncode}")
    return (True, "")


def export_gerbers(pcb_path: Path, output_dir: Path) -> Tuple[bool, str]:
    """Plot the Gerber package for one revision of a board.

    Plot options are deliberately left at the board's own settings: the point of
    this comparison is to catch a plot-option change, so normalising them away
    would defeat it.
    """

    return _export("gerbers", pcb_path, output_dir)


def export_drill(pcb_path: Path, output_dir: Path) -> Tuple[bool, str]:
    """Write the NC drill program alongside the Gerbers.

    Plated and non-plated holes are kept in one mixed program, which is the
    CLI's own default. Their plating is recorded per tool inside the file, so
    splitting the files would only fragment the review.
    """

    return _export(
        "drill", pcb_path, output_dir,
        "--format", "excellon", "--excellon-units", "mm",
    )
