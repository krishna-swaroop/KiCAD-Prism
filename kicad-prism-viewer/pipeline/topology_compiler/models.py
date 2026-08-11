from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


SCHEMA = "prism.topology_model_a0"


def stable_id(prefix: str, value: str) -> str:
    import hashlib

    digest = hashlib.sha1(value.encode("utf-8")).hexdigest()[:12]
    return f"{prefix}_{digest}"


@dataclass
class Component:
    uid: str
    designator: str
    value: str = ""
    footprint: str = ""
    parameters: dict[str, str] = field(default_factory=dict)
    schematic_symbol_ids: list[str] = field(default_factory=list)
    pcb_footprint_ids: list[str] = field(default_factory=list)
    model_ids: list[str] = field(default_factory=list)


@dataclass
class Terminal:
    uid: str
    component_uid: str
    designator: str
    pin: str
    net_uid: str
    net_name: str
    schematic_pin_id: str = ""
    pcb_pad_id: str = ""
    model_contact_id: str = ""


@dataclass
class Net:
    uid: str
    name: str
    aliases: list[str] = field(default_factory=list)
    net_class: str = ""
    terminals: list[str] = field(default_factory=list)
    graphical_ids: list[str] = field(default_factory=list)
    pcb_object_ids: list[str] = field(default_factory=list)
    model_object_ids: list[str] = field(default_factory=list)


@dataclass
class Layer:
    uid: str
    name: str
    role: str
    z_mm: float
    thickness_mm: float
    material: str
    color: str
    visibility_group: str
    stack_index: int = 0
    epsilon_r: float | None = None
    loss_tangent: float | None = None


@dataclass
class PhysicalObject:
    uid: str
    kind: str
    layer: str = ""
    layers: list[str] = field(default_factory=list)
    net_uid: str = ""
    net_name: str = ""
    component_uid: str = ""
    designator: str = ""
    bbox_mm: list[float] = field(default_factory=list)
    source_ids: list[str] = field(default_factory=list)
    geometry: dict[str, Any] = field(default_factory=dict)


@dataclass
class SchematicPage:
    uid: str
    sheet_path: str
    hierarchy_path: str
    title: str
    bbox: list[float]
    transform: list[float]
    svg_ids: list[str] = field(default_factory=list)


@dataclass
class GraphicPrimitive:
    uid: str
    source_id: str
    primitive_kind: str
    bbox: list[float]
    layer: str = ""
    sheet_path: str = ""
    net_uid: str = ""
    net_name: str = ""
    component_uid: str = ""
    designator: str = ""


@dataclass
class Topology:
    design: dict[str, Any]
    board: dict[str, Any]
    components: list[Component]
    nets: list[Net]
    terminals: list[Terminal]
    layers: list[Layer]
    physical_objects: list[PhysicalObject]
    schematic_pages: list[SchematicPage]
    graphic_primitives: list[GraphicPrimitive]
    indexes: dict[str, Any]
    validation: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        from dataclasses import asdict

        return {
            "schema": SCHEMA,
            "design": self.design,
            "board": self.board,
            "components": [asdict(item) for item in self.components],
            "nets": [asdict(item) for item in self.nets],
            "terminals": [asdict(item) for item in self.terminals],
            "layers": [asdict(item) for item in self.layers],
            "physical_objects": [asdict(item) for item in self.physical_objects],
            "schematic_pages": [asdict(item) for item in self.schematic_pages],
            "graphic_primitives": [asdict(item) for item in self.graphic_primitives],
            "indexes": self.indexes,
            "validation": self.validation,
        }
