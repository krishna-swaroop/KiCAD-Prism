"""Response models for the WebGPU 3D routes (ADR scripting-and-mcp §3.2).

``viewer_3d_bundle.status`` and ``document`` already answer the tab's JSON
documents; these models name what they return. Status adds ``message``,
``error`` and ``bundle_url`` only in some states, so the route serializes with
``response_model_exclude_unset`` and an absent key stays absent.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class WireModel(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)


class GeneratorTag(WireModel):
    name: str
    version: str
    build: str


class StatusReadiness(WireModel):
    schema_: str = Field(alias="schema", serialization_alias="schema")
    stage: str
    progress: int
    available_assets: list[str]
    revision: str


class VariableCount(WireModel):
    variable: str
    models: int


class WebGpu3dStatus(WireModel):
    schema_: str = Field(alias="schema", serialization_alias="schema")
    status: str
    available: bool
    sourceRevisionKey: str
    source_fingerprint: str
    build_fingerprint: str
    commit: Optional[str] = None
    generator: GeneratorTag
    readiness: StatusReadiness
    job_id: Optional[str] = None
    message: Optional[str] = None
    error: Optional[str] = None
    bundle_url: Optional[str] = None
    # The parts are being exported again because a KiCad library the board uses changed.
    refreshing: bool = False
    # KiCad path variables the board's models use that this server does not define, with how many models each.
    unresolvedVariables: list[VariableCount] = []
    # Models a defined variable points to that are not in the library, grouped by variable.
    missingModels: list[VariableCount] = []


class DocumentReadiness(WireModel):
    stage: str
    progress: int


class WebGpu3dAnalytic(WireModel):
    schema_: str = Field(alias="schema", serialization_alias="schema")
    cache_key: Optional[str] = None
    readiness: DocumentReadiness
    asset_base: str
    assets: dict[str, str]


class WebGpu3dGenerated(WireModel):
    job_id: Optional[str] = None


__all__ = ["WebGpu3dAnalytic", "WebGpu3dGenerated", "WebGpu3dStatus"]
