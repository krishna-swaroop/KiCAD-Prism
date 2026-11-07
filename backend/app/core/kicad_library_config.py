"""Settings for KiCad path libraries (Settings > KiCad libraries).

`Settings` in `app.core.config` inherits it, so these fields read the same way
as the rest.
"""
from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings


class KicadLibrarySettings(BaseSettings):
    PRISM_KICAD_LIBRARY_MOUNT_ROOT: str = Field(
        default="",
        description=(
            "Folder a KiCad library added as a path in Settings must live under (mount a host "
            "folder there). Empty: path libraries are off; git libraries need no mount."
        ),
    )
    PRISM_KICAD_LIBRARY_MAX_GB: int = Field(
        default=10,
        ge=1,
        le=1000,
        description=(
            "Largest KiCad library a fetch writes, in GB: the download, and the extracted files "
            "with their Git LFS objects. A larger one fails before or while it is written."
        ),
    )
