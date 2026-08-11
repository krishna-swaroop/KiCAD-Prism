"""Topology compiler for the WebGPU visualisation prototype."""

from .vendor_paths import ensure_reference_paths

ensure_reference_paths()

from .compiler import compile_topology, load_enriched_svg_metadata
from .exporter import export_viewer_html

__all__ = [
    "compile_topology",
    "ensure_reference_paths",
    "export_viewer_html",
    "load_enriched_svg_metadata",
]
