"""
Path Configuration Service for KiCAD Prism

Provides flexible folder mapping for KiCAD projects, supporting:
1. Explicit configuration via .prism.json
2. Auto-detection of common folder structures
3. Fallback to default paths
"""

import os
import json
import fnmatch
from pathlib import Path
from typing import Optional, Dict, List, Any
from dataclasses import dataclass, asdict
from pydantic import BaseModel

# Default path mappings (legacy structure)
DEFAULT_PATHS = {
    "schematic": "*.kicad_sch",
    "pcb": "*.kicad_pcb",
    "subsheets": "Subsheets",
    "designOutputs": "Design-Outputs",
    "manufacturingOutputs": "Manufacturing-Outputs",
    "documentation": "docs",
    "thumbnail": "assets/thumbnail",
    "readme": "README.md",
    "jobset": "Outputs.kicad_jobset"
}
PATH_FIELDS = list(DEFAULT_PATHS.keys())

# Common patterns for auto-detection
DETECTION_PATTERNS = {
    "schematic": ["*.kicad_sch"],
    "pcb": ["*.kicad_pcb"],
    "subsheets": [
        "*sheet*/*.kicad_sch",
        "*schematic*/*.kicad_sch",
        "*sch*/*.kicad_sch",
        "pages/*.kicad_sch",
        "hierarchical/*.kicad_sch"
    ],
    "designOutputs": [
        "*output*",
        "*export*",
        "*build*",
        "*dist*",
        "*release*",
        "*artefact*",
        "*artifact*"
    ],
    "manufacturingOutputs": [
        "*gerber*",
        "*fab*",
        "*mfg*",
        "*manufacturing*",
        "*production*",
        "*pcbfab*"
    ],
    "documentation": [
        "*doc*",
        "*wiki*",
        "*guide*",
        "*manual*",
        "*help*",
        "*reference*"
    ],
    "thumbnail": [
        "*assets*",
        "*images*",
        "*img*",
        "*renders*",
        "*thumbnails*",
        "*preview*",
        "*photos*"
    ],
    "readme": [
        "README*",
        "readme*",
        "INDEX*",
        "index*",
        "OVERVIEW*",
        "overview*"
    ],
    "jobset": ["*.kicad_jobset"]
}


class PathConfig(BaseModel):
    """Path configuration model."""
    schematic: Optional[str] = None
    pcb: Optional[str] = None
    subsheets: Optional[str] = None
    designOutputs: Optional[str] = None
    manufacturingOutputs: Optional[str] = None
    documentation: Optional[str] = None
    thumbnail: Optional[str] = None
    readme: Optional[str] = None
    jobset: Optional[str] = None
    project_name: Optional[str] = None
    description: Optional[str] = None
    workflows: Optional[List[Any]] = None
    portfolio: Optional[Dict[str, Any]] = None
    
    class Config:
        extra = "allow"  # Allow additional custom paths


class ResolvedPaths(BaseModel):
    """Fully resolved absolute paths."""
    project_root: str
    schematic: Optional[str] = None
    pcb: Optional[str] = None
    subsheets_dir: Optional[str] = None
    design_outputs_dir: Optional[str] = None
    manufacturing_outputs_dir: Optional[str] = None
    documentation_dir: Optional[str] = None
    thumbnail_dir: Optional[str] = None
    readme_path: Optional[str] = None
    jobset_path: Optional[str] = None


# Cache for project configurations
_config_cache: Dict[str, Dict[str, Any]] = {}


def _normalize_optional_string(value: Any) -> Any:
    """Normalize optional string values: blank strings are treated as unset."""
    if isinstance(value, str):
        stripped = value.strip()
        return stripped if stripped else None
    return value


def _normalize_config_values(config: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize loaded config values for path fields and project name."""
    normalized: Dict[str, Any] = {}
    for key, value in config.items():
        if key in PATH_FIELDS or key in {"project_name", "description"}:
            normalized[key] = _normalize_optional_string(value)
        else:
            normalized[key] = value
    return normalized


def _get_prism_mtime(project_path: str) -> Optional[float]:
    """Return .prism.json mtime to validate cached config freshness."""
    config_path = Path(project_path) / ".prism.json"
    if not config_path.exists():
        return None
    try:
        return config_path.stat().st_mtime
    except OSError:
        return None


def _load_prism_config(project_path: str) -> Optional[Dict[str, Any]]:
    """Load .prism.json configuration if it exists."""
    config_path = Path(project_path) / ".prism.json"
    if config_path.exists():
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
                result = {}
                # Handle legacy format with paths nested
                if "paths" in config:
                    result.update(config["paths"])
                # Add top-level fields like project_name
                for key, value in config.items():
                    if key != "paths":
                        result[key] = value
                return result
        except (json.JSONDecodeError, IOError) as e:
            print(f"Warning: Failed to parse .prism.json: {e}")
    return None


def _find_files_by_pattern(directory: Path, pattern: str) -> List[Path]:
    """Find files matching a glob pattern."""
    matches = []
    try:
        # Handle recursive patterns
        if "**" in pattern:
            matches = list(directory.glob(pattern))
        else:
            # Check root first
            matches = list(directory.glob(pattern))
            # Then check subdirectories (non-recursive for simple patterns)
            if not matches:
                for subdir in directory.iterdir():
                    if subdir.is_dir() and not subdir.name.startswith('.'):
                        matches.extend(subdir.glob(pattern))
    except OSError:
        pass
    return [m for m in matches if not m.name.startswith('.')]


def _find_directory_by_keywords(directory: Path, keywords: List[str], required_content: Optional[List[str]] = None) -> Optional[str]:
    """Find a directory matching any of the keywords."""
    try:
        for item in directory.iterdir():
            if not item.is_dir() or item.name.startswith('.'):
                continue
            
            item_lower = item.name.lower()
            for keyword in keywords:
                keyword_clean = keyword.lower().strip('*')
                if keyword_clean in item_lower:
                    # Optional: check for required content patterns
                    if required_content:
                        has_content = False
                        for content_pattern in required_content:
                            if list(item.glob(content_pattern)):
                                has_content = True
                                break
                        if not has_content:
                            continue
                    return item.name
    except OSError:
        pass
    return None


def _detect_schematic_path(project_path: Path) -> Optional[str]:
    """Detect main schematic file path."""
    sch_files = list(project_path.glob("*.kicad_sch"))
    if not sch_files:
        return None

    # Canonical KiCad layout: the root schematic shares its stem with the
    # .kicad_pro project file. This is reliable even when project_path is a
    # synthetic dir (e.g. a git-archive snapshot) whose dir name doesn't
    # match the project, where the fallbacks below would pick the wrong
    # sheet alphabetically.
    pro_files = list(project_path.glob("*.kicad_pro"))
    if pro_files:
        for sch in sch_files:
            if sch.stem == pro_files[0].stem:
                return sch.name

    # Fallback: prefer one matching the project directory name.
    project_name = project_path.name
    for sch in sch_files:
        if sch.stem.lower() == project_name.lower():
            return sch.name
    return sch_files[0].name


def _detect_pcb_path(project_path: Path) -> Optional[str]:
    """Detect main PCB file path."""
    # Look for .kicad_pcb files in root
    pcb_files = list(project_path.glob("*.kicad_pcb"))
    if pcb_files:
        # Prefer one matching project directory name, otherwise first found
        project_name = project_path.name
        for pcb in pcb_files:
            if pcb.stem.lower() == project_name.lower():
                return pcb.name
        return pcb_files[0].name
    return None


def _detect_subsheets_path(project_path: Path) -> Optional[str]:
    """Detect subsheets directory."""
    # Look for directories containing .kicad_sch files (excluding root)
    keywords = ["sheet", "schematic", "sch", "page", "hierarchical", "sub"]
    
    for item in project_path.iterdir():
        if not item.is_dir() or item.name.startswith('.'):
            continue
        
        item_lower = item.name.lower()
        # Check if directory name suggests subsheets
        if any(kw in item_lower for kw in keywords):
            if list(item.glob("*.kicad_sch")):
                return item.name
    
    # Fallback: any directory with .kicad_sch files
    for item in project_path.iterdir():
        if not item.is_dir() or item.name.startswith('.'):
            continue
        if item.name.lower() in ["docs", "documentation", "assets"]:
            continue  # Skip common non-subsheet directories
        if list(item.glob("*.kicad_sch")):
            return item.name
    
    return None


def _detect_design_outputs_path(project_path: Path) -> Optional[str]:
    """Detect design outputs directory."""
    keywords = ["output", "export", "build", "dist", "release", "artefact", "artifact"]
    required_content = ["*.pdf", "*.html", "*.step", "*.glb", "*.csv", "*.net"]
    return _find_directory_by_keywords(project_path, keywords, required_content)


def _detect_manufacturing_outputs_path(project_path: Path) -> Optional[str]:
    """Detect manufacturing outputs directory."""
    keywords = ["gerber", "fab", "mfg", "manufacturing", "production", "pcbfab"]
    required_content = ["*.gbr", "*.drl", "*.txt", "*.zip"]
    return _find_directory_by_keywords(project_path, keywords, required_content)


def _detect_documentation_path(project_path: Path) -> Optional[str]:
    """Detect documentation directory."""
    keywords = ["doc", "wiki", "guide", "manual", "help", "reference"]
    required_content = ["*.md", "*.txt", "*.pdf"]
    return _find_directory_by_keywords(project_path, keywords, required_content)


def _detect_thumbnail_path(project_path: Path) -> Optional[str]:
    """Detect thumbnail/images directory."""
    # First check for assets subdirectory
    assets_dir = project_path / "assets"
    if assets_dir.exists():
        thumbnail_dir = assets_dir / "thumbnail"
        if thumbnail_dir.exists():
            return "assets/thumbnail"
        # Check if assets contains images
        if list(assets_dir.glob("*.png")) or list(assets_dir.glob("*.jpg")):
            return "assets"
    
    keywords = ["image", "img", "render", "thumbnail", "preview", "photo"]
    return _find_directory_by_keywords(project_path, keywords)


def _detect_readme_path(project_path: Path) -> Optional[str]:
    """Detect README file path."""
    patterns = ["README*", "readme*", "INDEX*", "index*", "OVERVIEW*", "overview*"]
    for pattern in patterns:
        matches = list(project_path.glob(pattern))
        for match in matches:
            if match.suffix.lower() in ['.md', '.txt', '.rst', '']:
                return match.name
    return None


def _detect_jobset_path(project_path: Path) -> Optional[str]:
    """Detect KiCAD jobset file path."""
    jobset_files = list(project_path.glob("*.kicad_jobset"))
    if jobset_files:
        return jobset_files[0].name
    return None


PATH_DETECTORS = {
    "schematic": _detect_schematic_path,
    "pcb": _detect_pcb_path,
    "subsheets": _detect_subsheets_path,
    "designOutputs": _detect_design_outputs_path,
    "manufacturingOutputs": _detect_manufacturing_outputs_path,
    "documentation": _detect_documentation_path,
    "thumbnail": _detect_thumbnail_path,
    "readme": _detect_readme_path,
    "jobset": _detect_jobset_path,
}


def detect_paths(project_path: str) -> PathConfig:
    """
    Auto-detect path configuration for a project.
    
    Args:
        project_path: Absolute path to project root
        
    Returns:
        PathConfig with detected paths
    """
    project_dir = Path(project_path)
    
    return PathConfig(
        schematic=_detect_schematic_path(project_dir),
        pcb=_detect_pcb_path(project_dir),
        subsheets=_detect_subsheets_path(project_dir),
        designOutputs=_detect_design_outputs_path(project_dir),
        manufacturingOutputs=_detect_manufacturing_outputs_path(project_dir),
        documentation=_detect_documentation_path(project_dir),
        thumbnail=_detect_thumbnail_path(project_dir),
        readme=_detect_readme_path(project_dir),
        jobset=_detect_jobset_path(project_dir)
    )


def get_path_config(project_path: str, use_cache: bool = True) -> PathConfig:
    """
    Get path configuration for a project.
    Priority: 1) .prism.json, 2) auto-detect, 3) defaults
    
    Args:
        project_path: Absolute path to project root
        use_cache: Whether to use cached config
        
    Returns:
        PathConfig with resolved paths
    """
    cache_key = str(Path(project_path).resolve())
    prism_mtime = _get_prism_mtime(project_path)
    
    # Check cache
    if use_cache and cache_key in _config_cache:
        cached_entry = _config_cache[cache_key]
        if cached_entry.get("prism_mtime") == prism_mtime:
            return PathConfig(**cached_entry["config"])

    project_dir = Path(project_path)

    # Start from explicit config so complete `.prism.json` files skip auto-detection.
    explicit_config = _normalize_config_values(_load_prism_config(project_path) or {})
    merged_dict: Dict[str, Any] = dict(explicit_config)

    for key in PATH_FIELDS:
        if merged_dict.get(key) is None:
            detected_value = PATH_DETECTORS[key](project_dir)
            if detected_value is not None:
                merged_dict[key] = detected_value
            elif key != "subsheets":
                merged_dict[key] = DEFAULT_PATHS[key]

    merged = PathConfig(**merged_dict)
    _config_cache[cache_key] = {
        "config": merged.dict(),
        "prism_mtime": prism_mtime,
    }
    return merged


def resolve_paths(project_path: str, config: Optional[PathConfig] = None) -> ResolvedPaths:
    """
    Resolve all paths to absolute paths.
    
    Args:
        project_path: Absolute path to project root
        config: Optional PathConfig (will be loaded if not provided)
        
    Returns:
        ResolvedPaths with absolute paths
    """
    if config is None:
        config = get_path_config(project_path)
    
    project_dir = Path(project_path)
    
    def resolve_path(path: Optional[str]) -> Optional[str]:
        if not path:
            return None
        resolved = project_dir / path
        return str(resolved) if resolved.exists() else None
    
    # Handle glob patterns for schematic and pcb
    schematic_path = None
    if config.schematic:
        if '*' in config.schematic:
            matches = list(project_dir.glob(config.schematic))
            if matches:
                schematic_path = str(matches[0])
        else:
            schematic_path = resolve_path(config.schematic)
    
    pcb_path = None
    if config.pcb:
        if '*' in config.pcb:
            matches = list(project_dir.glob(config.pcb))
            if matches:
                pcb_path = str(matches[0])
        else:
            pcb_path = resolve_path(config.pcb)
    
    return ResolvedPaths(
        project_root=str(project_dir),
        schematic=schematic_path,
        pcb=pcb_path,
        subsheets_dir=resolve_path(config.subsheets),
        design_outputs_dir=resolve_path(config.designOutputs),
        manufacturing_outputs_dir=resolve_path(config.manufacturingOutputs),
        documentation_dir=resolve_path(config.documentation),
        thumbnail_dir=resolve_path(config.thumbnail),
        readme_path=resolve_path(config.readme),
        jobset_path=resolve_path(config.jobset)
    )


def get_project_display_name(project_path: str) -> Optional[str]:
    """
    Get the display name for a project from .prism.json.
    
    Args:
        project_path: Absolute path to project root
        
    Returns:
        Custom project name from .prism.json or None if not set
    """
    config = get_path_config(project_path)  # Use cache by default
    return config.project_name if config.project_name else None


def get_project_description(project_path: str) -> Optional[str]:
    """
    Get project description from .prism.json.

    Args:
        project_path: Absolute path to project root

    Returns:
        Description from .prism.json or None if not set
    """
    config = get_path_config(project_path)  # Use cache by default
    return config.description if config.description else None


def get_portfolio_config(project_path: str) -> Optional[Dict[str, Any]]:
    """
    Get portfolio metadata from .prism.json.

    Args:
        project_path: Absolute path to project root

    Returns:
        Portfolio metadata dict or None if not set
    """
    config = get_path_config(project_path)
    if not config.portfolio or not isinstance(config.portfolio, dict):
        return None
    return config.portfolio


def save_path_config(project_path: str, config: PathConfig) -> None:
    """
    Save path configuration to .prism.json.
    
    Args:
        project_path: Absolute path to project root
        config: PathConfig to save
    """
    config_path = Path(project_path) / ".prism.json"
    
    # Load existing config to preserve other settings
    existing = {}
    if config_path.exists():
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                existing = json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    
    # Update paths and other fields
    config_dict = config.dict(exclude_none=True)
    
    # Separate paths and other fields
    if "paths" not in existing:
        existing["paths"] = {}
    
    # Path fields go under paths key
    for field in PATH_FIELDS:
        if field in config_dict:
            existing["paths"][field] = config_dict[field]
    
    # Non-path fields go at top level
    non_path_fields = ["project_name", "description", "workflows", "portfolio"]
    for field in non_path_fields:
        if field in config_dict:
            existing[field] = config_dict[field]
    
    # Save
    with open(config_path, 'w', encoding='utf-8') as f:
        json.dump(existing, f, indent=2)
    
    # Config file changed; force reload on next access.
    clear_config_cache(project_path)


def clear_config_cache(project_path: Optional[str] = None) -> None:
    """Clear configuration cache."""
    global _config_cache
    if project_path:
        cache_key = str(Path(project_path).resolve())
        _config_cache.pop(cache_key, None)
    else:
        _config_cache = {}


def validate_config(project_path: str, config: PathConfig) -> Dict[str, Any]:
    """
    Validate a path configuration against actual project structure.
    
    Args:
        project_path: Absolute path to project root
        config: PathConfig to validate
        
    Returns:
        Dict with validation results
    """
    project_dir = Path(project_path)
    results = {
        "valid": True,
        "errors": [],
        "warnings": [],
        "resolved": {}
    }
    
    # Validate each path
    for key, value in config.dict().items():
        if key not in PATH_FIELDS:
            continue

        if not value:
            continue
            
        if '*' in value:
            # Glob pattern
            matches = list(project_dir.glob(value))
            if matches:
                results["resolved"][key] = str(matches[0])
            else:
                results["warnings"].append(f"{key}: No matches for pattern '{value}'")
        else:
            # Direct path
            full_path = project_dir / value
            if full_path.exists():
                results["resolved"][key] = str(full_path)
            else:
                results["errors"].append(f"{key}: Path '{value}' does not exist")
                results["valid"] = False
    
    return results
