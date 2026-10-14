"""Pydantic projection of the prism-sim-studio ``a0`` setup contracts.

The TypeSpec in prism-sim-studio (``contracts/contracts/setup.tsp`` and
``studio.tsp``) is the authority. These models mirror it field for field;
``tests/test_sim_studio_contract.py`` checks them against the contract's own
accepted and rejected vectors, vendored under ``contract_vectors/``.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field

Slug = Annotated[str, Field(pattern=r"^[a-z0-9][a-z0-9._-]{0,79}$")]
Sha256 = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
CommitSha = Annotated[str, Field(pattern=r"^[0-9a-f]{40}$")]
PinRef = Annotated[str, Field(pattern=r"^[a-z0-9][a-z0-9._-]{0,79}:[^:.\s]+\.[^:\s]+$")]
NetRef = Annotated[str, Field(pattern=r"^[a-z0-9][a-z0-9._-]{0,79}:\S+$")]
ComponentRef = Annotated[str, Field(pattern=r"^[a-z0-9][a-z0-9._-]{0,79}:[^:.\s]+$")]
SliceRef = Annotated[str, Field(pattern=r"^[a-z0-9][a-z0-9._-]{0,79}:\S+$")]
PositiveFloat = Annotated[float, Field(gt=0)]
NonNegativeFloat = Annotated[float, Field(ge=0)]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SetupBundle(_Strict):
    board_id: Slug
    sha256: Optional[Sha256] = None


PropertySource = Literal["kicad", "datasheet", "measurement", "assumed"]


class ConductorOverride(_Strict):
    conductivity_s_per_m: Optional[PositiveFloat] = None
    reference_temperature_c: Optional[float] = None
    temperature_coefficient_per_k: Optional[float] = None
    thickness_um: Optional[PositiveFloat] = None
    source: PropertySource


class SliceMaterial(_Strict):
    material: Optional[Slug] = None
    conductor: Optional[ConductorOverride] = None


class MaterialLibraryRef(_Strict):
    id: Slug
    version: str
    sha256: Sha256


class SetupMaterials(_Strict):
    library: Optional[MaterialLibraryRef] = None
    slices: dict[SliceRef, SliceMaterial]


DeviceModelKind = Literal[
    "resistor", "jumper", "connector-pin", "shunt", "inductor", "ferrite-bead", "capacitor", "regulator", "load",
]


class DcSeriesModel(_Strict):
    resistance_ohm: NonNegativeFloat
    pads: Optional[list[str]] = None


class DeviceModelSnapshot(_Strict):
    kind: DeviceModelKind
    revision_id: Optional[str] = None
    file_sha256: Optional[dict[str, Sha256]] = None
    dc: Optional[DcSeriesModel] = None


class ComponentAssignment(_Strict):
    source: Literal["component-db", "override", "assumed", "ignored"]
    model: Optional[DeviceModelSnapshot] = None


class Rail(_Strict):
    id: Slug
    net: NetRef
    voltage_v: PositiveFloat
    tolerance_pct: Optional[NonNegativeFloat] = None
    inferred: Optional[bool] = None


class Terminal(_Strict):
    id: Slug
    positive: Annotated[list[PinRef], Field(min_length=1)]
    reference: list[PinRef]


class Source(_Strict):
    id: Slug
    rail: Slug
    terminal: Slug
    sense_terminal: Optional[Slug] = None
    component: Optional[ComponentRef] = None


class Load(_Strict):
    id: Slug
    rail: Slug
    terminal: Slug
    current_a: NonNegativeFloat
    distribution: Literal["uniform"]
    component: Optional[ComponentRef] = None


class Converter(_Strict):
    id: Slug
    component: ComponentRef
    input_rail: Slug
    input_terminal: Slug
    output_source: Slug
    # Absent means switching; a linear regulator passes its output current.
    kind: Optional[Literal["switching", "linear"]] = None
    efficiency: Optional[Annotated[float, Field(gt=0, le=1)]] = None
    quiescent_current_a: Optional[Annotated[float, Field(ge=0)]] = None


class Probe(_Strict):
    id: Slug
    terminal: Slug


class LoweringSettings(_Strict):
    chord_tolerance_um: Optional[PositiveFloat] = None
    min_feature_um: Optional[NonNegativeFloat] = None


class LinearSolverSettings(_Strict):
    method: Optional[Literal["direct", "iterative"]] = None
    backend: Optional[Annotated[str, Field(min_length=1)]] = None
    ordering: Optional[Annotated[str, Field(min_length=1)]] = None
    preconditioner: Optional[Annotated[str, Field(min_length=1)]] = None
    tolerance: Optional[PositiveFloat] = None
    max_iterations: Optional[Annotated[int, Field(ge=1)]] = None


class OutputSettings(_Strict):
    fields: Optional[list[Literal["voltage", "current-density", "power-density"]]] = None
    field_pitch_um: Optional[PositiveFloat] = None
    via_currents: Optional[bool] = None


class DcMeshSettings(_Strict):
    accuracy_level: Optional[Annotated[int, Field(ge=0, le=16)]] = None
    budget_mode: Optional[Literal["single", "trial"]] = None
    representative_point: Optional[Literal["fragment-centroid", "cell-blend"]] = None
    max_element_um: Optional[PositiveFloat] = None
    min_element_um: Optional[PositiveFloat] = None
    min_angle_deg: Optional[Annotated[float, Field(gt=0, lt=60)]] = None
    refine_near_terminals: Optional[bool] = None
    refine_near_vias: Optional[bool] = None
    adaptive: Optional[bool] = None
    max_adaptive_passes: Optional[Annotated[int, Field(ge=1)]] = None
    target_error: Optional[PositiveFloat] = None


class DcCopperCleanupSettings(_Strict):
    drop_floating_islands: Optional[bool] = None
    min_neck_um: Optional[NonNegativeFloat] = None


class DcViaMatch(_Strict):
    sources: Optional[list[Literal["via", "pad"]]] = None
    spans: Optional[list[Literal["through", "blind", "buried"]]] = None
    min_layers: Optional[Annotated[int, Field(ge=2)]] = None
    max_layers: Optional[Annotated[int, Field(ge=2)]] = None
    min_drill_um: Optional[PositiveFloat] = None
    max_drill_um: Optional[PositiveFloat] = None
    nets: Optional[list[str]] = None
    filled: Optional[bool] = None


class DcViaFill(_Strict):
    kind: Literal["none", "non-conductive", "conductive"]
    conductivity_s_per_m: Optional[PositiveFloat] = None


class DcViaClass(_Strict):
    id: Annotated[str, Field(min_length=1)]
    match: Optional[DcViaMatch] = None
    plating_um: Optional[PositiveFloat] = None
    plating_conductivity_s_per_m: Optional[PositiveFloat] = None
    fill: Optional[DcViaFill] = None


class DcViaSettings(_Strict):
    plating_um: Optional[PositiveFloat] = None
    pad_to_barrel: Optional[Literal["annular-ring", "ideal"]] = None
    merge_arrays: Optional[bool] = None
    classes: Optional[list[DcViaClass]] = None


class DcTerminalSettings(_Strict):
    contact: Optional[Literal["ideal-pad", "distributed"]] = None
    source_pin_resistance_ohm: Optional[PositiveFloat] = None
    pad_association: Optional[Literal["touch", "majority"]] = None


class DcTemperatureSettings(_Strict):
    board_c: Optional[float] = None


class DcDropSettings(_Strict):
    lowering: Optional[LoweringSettings] = None
    linear_solver: Optional[LinearSolverSettings] = None
    outputs: Optional[OutputSettings] = None
    mesh: Optional[DcMeshSettings] = None
    copper_cleanup: Optional[DcCopperCleanupSettings] = None
    vias: Optional[DcViaSettings] = None
    terminals: Optional[DcTerminalSettings] = None
    temperature: Optional[DcTemperatureSettings] = None
    engine_options: Optional[dict[str, Any]] = None


class DcDropAnalysis(_Strict):
    id: Slug
    kind: Literal["dc-drop"]
    rails: list[Slug]
    settings: Optional[DcDropSettings] = None


Analysis = Annotated[Union[DcDropAnalysis], Field(discriminator="kind")]


class SimSetup(_Strict):
    schema_: Literal["prism.sim.setup"] = Field(alias="schema")
    version: Literal["a0"]
    name: Annotated[str, Field(min_length=1)]
    bundle: SetupBundle
    materials: SetupMaterials
    components: dict[ComponentRef, ComponentAssignment]
    rails: list[Rail]
    terminals: list[Terminal]
    sources: list[Source]
    loads: list[Load]
    converters: list[Converter]
    probes: list[Probe]
    analyses: Annotated[list[Analysis], Field(min_length=1)]

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    def document(self) -> dict[str, Any]:
        """The setup as contract JSON (``schema`` key, unset optionals omitted)."""
        return self.model_dump(mode="json", by_alias=True, exclude_none=True)


class SetupIssue(_Strict):
    severity: Literal["error", "warning"]
    code: Annotated[str, Field(pattern=r"^[a-z][a-z0-9-]*$")]
    path: str
    message: Annotated[str, Field(min_length=1)]
    refs: Optional[list[str]] = None


class CatalogEntry(_Strict):
    kind: Slug
    display_name: str
    summary: str
    status: Literal["available", "planned"]


class SetupSource(_Strict):
    commit: Optional[CommitSha] = None
    project_path: Annotated[str, Field(min_length=1)]


class DraftSetupRequest(_Strict):
    kind: Slug
    name: Annotated[str, Field(min_length=1, max_length=200)]
    commit: Optional[CommitSha] = None


class JsonPatchOperation(_Strict):
    op: Literal["add", "remove", "replace", "move", "copy", "test"]
    path: str
    from_: Optional[str] = Field(default=None, alias="from")
    value: Any = None

    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class SubmitSetupRequest(_Strict):
    analysis_id: Slug
