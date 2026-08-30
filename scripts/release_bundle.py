#!/usr/bin/env python3
"""Validate Prism release tags and assemble immutable deployment bundles."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import tarfile
from dataclasses import dataclass
from pathlib import Path


SEMVER_PATTERN = re.compile(
    r"^v"
    r"(?P<major>0|[1-9][0-9]*)\."
    r"(?P<minor>0|[1-9][0-9]*)\."
    r"(?P<patch>0|[1-9][0-9]*)"
    r"(?:-(?P<prerelease>[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?"
    r"$"
)
TEMPLATE_FILES = (
    "compose.yml",
    ".env.example",
    "Caddyfile",
    "Caddyfile.internal",
    "Caddyfile.dns-01",
    "Dockerfile.caddy-dns",
    "README.md",
)
REPOSITORY_FILES = (
    ("docs/UPGRADES.md", "UPGRADES.md"),
    ("scripts/prism_backup.py", "scripts/prism_backup.py"),
    ("scripts/prism_deploy/__init__.py", "scripts/prism_deploy/__init__.py"),
    ("scripts/prism_deploy/tui.py", "scripts/prism_deploy/tui.py"),
)


@dataclass(frozen=True)
class ReleaseMetadata:
    tag: str
    version: str
    major: str
    minor: str
    patch: str
    prerelease_suffix: str | None

    @property
    def is_prerelease(self) -> bool:
        return self.prerelease_suffix is not None

    @property
    def image_tags(self) -> tuple[str, ...]:
        if self.is_prerelease:
            return (self.version,)
        return (
            self.version,
            f"{self.major}.{self.minor}",
            self.major,
            "latest",
        )


def parse_release_tag(tag: str) -> ReleaseMetadata:
    match = SEMVER_PATTERN.fullmatch(tag)
    if match is None:
        raise ValueError(
            "release tags must use vMAJOR.MINOR.PATCH with an optional SemVer "
            "prerelease suffix; build metadata is not supported"
        )

    prerelease = match.group("prerelease")
    if prerelease is not None:
        for identifier in prerelease.split("."):
            if identifier.isdigit() and len(identifier) > 1 and identifier.startswith("0"):
                raise ValueError(
                    "numeric prerelease identifiers must not contain leading zeroes"
                )

    return ReleaseMetadata(
        tag=tag,
        version=tag.removeprefix("v"),
        major=match.group("major"),
        minor=match.group("minor"),
        patch=match.group("patch"),
        prerelease_suffix=prerelease,
    )


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_github_outputs(path: Path, metadata: ReleaseMetadata) -> None:
    with path.open("a", encoding="utf-8") as handle:
        handle.write(f"tag={metadata.tag}\n")
        handle.write(f"version={metadata.version}\n")
        handle.write(f"prerelease={str(metadata.is_prerelease).lower()}\n")
        handle.write(f"image_tags={','.join(metadata.image_tags)}\n")


def replace_release_tokens(
    env_template: Path,
    *,
    metadata: ReleaseMetadata,
    backend_image: str,
    frontend_image: str,
    revision: str,
    build_date: str,
) -> None:
    replacements = {
        "__PRISM_BACKEND_IMAGE__": backend_image,
        "__PRISM_FRONTEND_IMAGE__": frontend_image,
        "__PRISM_VERSION__": metadata.version,
        "__PRISM_REVISION__": revision,
        "__PRISM_BUILD_DATE__": build_date,
    }
    rendered = env_template.read_text(encoding="utf-8")
    for token, value in replacements.items():
        rendered = rendered.replace(token, value)
    unresolved = sorted(set(re.findall(r"__PRISM_[A-Z_]+__", rendered)))
    if unresolved:
        raise ValueError(f"unresolved release placeholders: {', '.join(unresolved)}")
    env_template.write_text(rendered, encoding="utf-8")


def build_release_bundle(
    *,
    template_dir: Path,
    output_root: Path,
    tag: str,
    backend_image: str,
    frontend_image: str,
    revision: str,
    build_date: str,
) -> tuple[Path, Path, Path]:
    metadata = parse_release_tag(tag)
    repository_root = template_dir.resolve().parents[1]
    release_notes_source = repository_root / "docs" / "releases" / f"{metadata.tag}.md"
    source_files = [
        *((template_dir / name, name) for name in TEMPLATE_FILES),
        *((repository_root / source, destination) for source, destination in REPOSITORY_FILES),
        (release_notes_source, "RELEASE_NOTES.md"),
    ]
    missing = [str(source) for source, _destination in source_files if not source.is_file()]
    if missing:
        raise FileNotFoundError(
            f"release template is missing required files: {', '.join(missing)}"
        )

    bundle_name = f"kicad-prism-{tag}-linux-amd64"
    bundle_dir = output_root / bundle_name
    archive_path = output_root / f"{bundle_name}.tar.gz"
    archive_checksum_path = output_root / f"{archive_path.name}.sha256"
    if bundle_dir.exists() or archive_path.exists() or archive_checksum_path.exists():
        raise FileExistsError(f"release output already exists for {tag}")

    output_root.mkdir(parents=True, exist_ok=True)
    bundle_dir.mkdir()
    for source, destination in source_files:
        target = bundle_dir / destination
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)

    replace_release_tokens(
        bundle_dir / ".env.example",
        metadata=metadata,
        backend_image=backend_image,
        frontend_image=frontend_image,
        revision=revision,
        build_date=build_date,
    )
    (bundle_dir / "VERSION").write_text(f"{tag}\n", encoding="utf-8")

    checksum_names = tuple(destination for _source, destination in source_files) + ("VERSION",)
    checksum_lines = [
        f"{sha256(bundle_dir / name)}  {name}" for name in checksum_names
    ]
    (bundle_dir / "SHA256SUMS").write_text(
        "\n".join(checksum_lines) + "\n",
        encoding="utf-8",
    )

    with tarfile.open(archive_path, mode="w:gz", compresslevel=9) as archive:
        archive.add(bundle_dir, arcname=bundle_name)
    archive_checksum_path.write_text(
        f"{sha256(archive_path)}  {archive_path.name}\n",
        encoding="utf-8",
    )
    return bundle_dir, archive_path, archive_checksum_path


def metadata_command(args: argparse.Namespace) -> None:
    metadata = parse_release_tag(args.tag)
    if args.github_output:
        write_github_outputs(args.github_output, metadata)
    print(
        json.dumps(
            {
                "tag": metadata.tag,
                "version": metadata.version,
                "prerelease": metadata.is_prerelease,
                "imageTags": metadata.image_tags,
            }
        )
    )


def bundle_command(args: argparse.Namespace) -> None:
    bundle_dir, archive_path, archive_checksum_path = build_release_bundle(
        template_dir=args.template_dir,
        output_root=args.output_root,
        tag=args.tag,
        backend_image=args.backend_image,
        frontend_image=args.frontend_image,
        revision=args.revision,
        build_date=args.build_date,
    )
    if args.github_output:
        with args.github_output.open("a", encoding="utf-8") as handle:
            handle.write(f"bundle_dir={bundle_dir}\n")
            handle.write(f"archive={archive_path}\n")
            handle.write(f"archive_checksum={archive_checksum_path}\n")
    print(archive_path)


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)

    metadata = commands.add_parser("metadata", help="validate a release tag")
    metadata.add_argument("--tag", required=True)
    metadata.add_argument("--github-output", type=Path)
    metadata.set_defaults(handler=metadata_command)

    bundle = commands.add_parser("bundle", help="assemble a release bundle")
    bundle.add_argument("--template-dir", required=True, type=Path)
    bundle.add_argument("--output-root", required=True, type=Path)
    bundle.add_argument("--tag", required=True)
    bundle.add_argument("--backend-image", required=True)
    bundle.add_argument("--frontend-image", required=True)
    bundle.add_argument("--revision", required=True)
    bundle.add_argument("--build-date", required=True)
    bundle.add_argument("--github-output", type=Path)
    bundle.set_defaults(handler=bundle_command)

    return root


def main() -> None:
    args = parser().parse_args()
    args.handler(args)


if __name__ == "__main__":
    main()
