"""Settings for the design pipelines: design compare, the semantic viewer, and Systems.

`Settings` in `app.core.config` inherits these fields; read them through
`app.core.config.settings` like every other setting. They live in their own
module only to keep the auth/database/catalog settings readable.
"""
from __future__ import annotations

from pydantic import Field, field_validator
from pydantic_core import PydanticUseDefault
from pydantic_settings import BaseSettings


class PipelineSettings(BaseSettings):
    # ===========================================
    # Design compare
    # ===========================================
    PRISM_DESIGN_COMPARE_CACHE: str = Field(
        default="",
        description="Revision snapshot cache. Defaults to <temp>/prism_design_compare_cache.",
    )
    PRISM_DESIGN_COMPARE_JOBS: str = Field(
        default="",
        description="Scratch root for design-compare jobs. Defaults to <temp>/prism_design_compare.",
    )
    PRISM_DESIGN_COMPARE_CACHE_MAX_BYTES: int = Field(
        default=20 * 1024**3,
        description="Revision cache size cap; least recently used commits are evicted. 0 disables the cap.",
    )
    PRISM_DESIGN_COMPARE_CACHE_MIN_AGE: float = Field(
        default=900.0,
        description="Seconds a revision cache entry is protected from eviction after its last use.",
    )
    PRISM_DESIGN_COMPARE_STALE_SECONDS: int = Field(
        default=300,
        description="Seconds without a heartbeat before an in-process compare job is reported stale.",
    )
    PRISM_DESIGN_COMPARE_MAX_REVISION_WORKERS: int = Field(
        default=2,
        description="Revisions built concurrently (capped at 2); the stage default below.",
    )
    PRISM_DESIGN_COMPARE_MAX_INITIAL_WORKERS: int | None = Field(
        default=None,
        description="Schematic-stage workers (capped at 2). Unset uses MAX_REVISION_WORKERS.",
    )
    PRISM_DESIGN_COMPARE_MAX_PCB_WORKERS: int | None = Field(
        default=None,
        description="PCB-stage workers (capped at 2). Unset uses MAX_REVISION_WORKERS.",
    )
    PRISM_DESIGN_COMPARE_REVISION_PROCESSES: bool = Field(
        default=True,
        description="Compile the two revisions in separate processes; false keeps one address space.",
    )

    # ===========================================
    # Semantic viewer (3D) pipeline
    # ===========================================
    PRISM_SEMANTIC_VIEWER_REPO: str = Field(
        default="",
        description="kicad-prism-viewer checkout. Unset searches /opt/kicad-prism-viewer, then the repository.",
    )
    PRISM_SEMANTIC_VIEWER_CACHE: str = Field(
        default="",
        description="Semantic compiler cache. Defaults to KICAD_PROJECTS_ROOT/.kicad-prism/semantic-visualizer/.cache.",
    )
    PRISM_SEMANTIC_GLTF_MESHOPT_LEVEL: str = Field(
        default="medium",
        description="glTF meshopt compression level; unknown values fall back to medium.",
    )
    PRISM_SEMANTIC_GLTF_TILE_SIZE_MM: str = Field(
        default="auto",
        description="glTF tile size in mm (1-1000) or auto; other values fall back to auto.",
    )
    PRISM_PCB_GEOMETRY_BACKEND: str = Field(
        default="legacy",
        description="PCB copper geometry backend: legacy, or the experimental rust / python-copper.",
    )
    PRISM_ANALYTIC_PCB_ENABLED: bool = Field(
        default=False,
        description="Experimental: also write the analytic board pack the 3D tab and Simulation Studio read.",
    )
    PRISM_SIM_STUDIO_ENABLED: bool = Field(
        default=False,
        description="Experimental: the Simulation Studio tab and its /api/.../sim/a0 routes.",
    )
    PRISM_SIM_BIN_DIR: str = Field(
        default="/opt/prism-sim/bin",
        description="Directory holding the prism-sim-studio binaries (prism-bundle, sim-worker).",
    )
    PRISM_SIM_CONCURRENCY: int = Field(default=1, description="Simulation runs one worker executes at once.")
    PRISM_SIM_TIMEOUT_SECONDS: int = Field(default=3600, description="Longest a simulation engine may run.")
    PRISM_SIM_ENGINE: str = Field(default="dc-drop-grid", description="sim-worker engine id that runs every analysis (dc-drop-grid, or dc-drop-synthetic for pipeline tests).")
    PRISM_KICAD_MONKEY_SOURCE: str = Field(
        default="",
        description="Label of the installed kicad_monkey build, mixed into the viewer build fingerprint.",
    )
    KICAD_MONKEY_PYTHONPATH: str = Field(
        default="",
        description="Development override: os.pathsep-separated kicad_monkey source roots put first on sys.path.",
    )

    # ===========================================
    # Systems
    # ===========================================
    PRISM_SYSTEM_REPOS_ROOT: str = Field(
        default="",
        description="Bare Git repositories that track Systems. Defaults to KICAD_PROJECTS_ROOT/.kicad-prism/system-repos.",
    )
    PRISM_INTERFACE_CACHE_MB: float = Field(
        default=256.0,
        description="Process-wide cache of resolved board interfaces, in MiB.",
    )
    PRISM_INTERFACE_CACHE_VERIFY: bool = Field(
        default=False,
        description="Hash-check every interface cache hit for caller mutation (test suites).",
    )

    @field_validator(
        "PRISM_DESIGN_COMPARE_CACHE_MAX_BYTES",
        "PRISM_DESIGN_COMPARE_CACHE_MIN_AGE",
        "PRISM_DESIGN_COMPARE_STALE_SECONDS",
        "PRISM_DESIGN_COMPARE_MAX_REVISION_WORKERS",
        "PRISM_DESIGN_COMPARE_MAX_INITIAL_WORKERS",
        "PRISM_DESIGN_COMPARE_MAX_PCB_WORKERS",
        "PRISM_DESIGN_COMPARE_REVISION_PROCESSES",
        "PRISM_INTERFACE_CACHE_MB",
        "PRISM_INTERFACE_CACHE_VERIFY",
        mode="before",
    )
    @classmethod
    def _blank_is_default(cls, value: object) -> object:
        """Surrounding blanks are ignored, and "" (Compose forwards blank lines) means the default."""
        if isinstance(value, str):
            value = value.strip()
            if not value:
                raise PydanticUseDefault()
        return value
