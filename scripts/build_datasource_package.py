#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "dist"


def build_metadata(base_url: str, kicad_version: str = "8.0.0") -> dict:
    return {
        "name": "KiCAD Prism Remote Symbols",
        "description": "Datasource package for the KiCAD Prism remote symbol provider.",
        "description_full": (
            "Installs a datasource descriptor for KiCAD Prism. After installing the ZIP in "
            "PCM, add the metadata URL to Remote Symbol Settings if KiCad does not auto-register it."
        ),
        "identifier": "org.kicad-prism.remote-symbols",
        "type": "plugin",
        "author": {
            "name": "KiCAD Prism",
            "contact": {"url": "https://github.com/krishna-swaroop/KiCAD-Prism"},
        },
        "license": "Apache-2.0",
        "resources": {
            "server": base_url,
            "instructions": (
                "Install from file, then use the KiCad Remote Symbol Settings dialog to add "
                f"{base_url} as a provider if it is not auto-registered."
            ),
        },
        "versions": [
            {
                "kicad_version": kicad_version,
                "version": "0.1.0",
                "status": "stable",
                "platforms": ["windows", "macos", "linux"],
            }
        ],
    }


def build_resource(base_url: str) -> dict:
    return {
        "metadata_url": base_url,
        "description": (
            f"Add {base_url} as a Remote Symbol provider in KiCad eeschema settings. "
            f"KiCad discovers the provider at {base_url}/.well-known/kicad-remote-provider automatically."
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build the KiCAD Prism datasource ZIP package."
    )
    parser.add_argument(
        "--base-url",
        default="http://127.0.0.1:8000",
        help="Base URL for the Prism provider",
    )
    parser.add_argument("--output", default="", help="Optional output ZIP path")
    parser.add_argument(
        "--kicad-version",
        default="8.0.0",
        help="Minimum KiCad version for the datasource",
    )
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")
    output_path = (
        Path(args.output)
        if args.output
        else OUTPUT_DIR / "kicad-prism-remote-symbols.zip"
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)

    metadata = build_metadata(base_url, args.kicad_version)
    resource = build_resource(base_url)

    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("metadata.json", json.dumps(metadata, indent=2))
        archive.writestr("resources/remote_symbol.json", json.dumps(resource, indent=2))

    print(os.fspath(output_path))


if __name__ == "__main__":
    main()
