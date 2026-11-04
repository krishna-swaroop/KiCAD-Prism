"""Back up and restore a Prism installation as one archive.

    python3 scripts/prism_backup.py create
    python3 scripts/prism_backup.py verify prism-backup-20260727-101500.tar.gz
    python3 scripts/prism_backup.py restore prism-backup-20260727-101500.tar.gz

A PostgreSQL dump on its own is not a restorable backup of Prism. Component
assets -- symbols, footprints, 3D models, previews and revision payloads -- live
on disk under ``data/projects/.kicad-prism/components``, and the database holds
the rows that point at them. Restore one without the other and every component
in the catalog exists with a broken reference to its files.

So the two are captured together, by default with the application stopped and
PostgreSQL still up, which is the only cheap way to get a pair that describes
one moment. ``--hot`` skips that at the cost of the guarantee.

Beside those: the Release Studio signing key (``data/secrets``) and Caddy's
certificate volume when the deployment has them, the installer's generated
Compose overlay and Caddyfile, operator Caddy sites, and the ``.env``.

Staging happens next to the output archive, not in the system temp directory,
so the free space needed is on the disk the operator chose.

Regenerable content is left out. Job artifacts, semantic 3D bundles, KiCad
database-library exports and validation runs all rebuild from the authoritative
data, and on a working installation they are the bulk of the bytes.
"""

from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))


class _PlainTui:
    """Plain ASCII output for when this file is run without ``prism_deploy``,
    e.g. fetched alone with ``git show <tag>:scripts/prism_backup.py``."""

    class Abort(Exception):
        pass

    write = staticmethod(lambda text="": print(text, flush=True))
    info = hint = staticmethod(lambda text: _PlainTui.write(f"  {text}"))
    note = staticmethod(lambda text: _PlainTui.write(f"  * {text}"))
    ok = staticmethod(lambda text, detail="": _PlainTui.write(f"  ok {text}  {detail}".rstrip()))
    warn = staticmethod(lambda text, detail="": _PlainTui.write(f"  !  {text}  {detail}".rstrip()))
    fail = staticmethod(lambda text, detail="": _PlainTui.write(f"  x  {text}  {detail}".rstrip()))
    banner = staticmethod(lambda title, subtitle="": _PlainTui.write(f"\n== {title}  {subtitle}".rstrip()))

    @staticmethod
    def panel(title: str, rows: list[tuple[str, str]]) -> None:
        _PlainTui.write(f"-- {title}")
        for label, value in rows:
            _PlainTui.write(f"   {label:<12} {value}")

    @staticmethod
    def confirm(label: str, *, default: bool = True, **_: object) -> bool:
        while True:
            try:
                raw = input(f"  {label} [{'Y/n' if default else 'y/N'}] ").strip().lower()
            except EOFError as exc:
                raise _PlainTui.Abort() from exc
            if raw in ("", "y", "yes", "n", "no"):
                return default if not raw else raw.startswith("y")


try:
    from prism_deploy import tui  # noqa: E402
except ImportError:
    tui = _PlainTui  # type: ignore[assignment]


MANIFEST_NAME = "manifest.json"
MANIFEST_SCHEMA = "prism.backup.a1"
DUMP_NAME = "postgres.dump"

# A rollback restores an older archive over a database a newer release has
# migrated. `pg_restore --clean` drops only the objects the archive knows, so a
# newer table with a foreign key onto one of them makes the restore fail. Drop
# every schema but `public` first, in the same transaction as the restore, so
# the database ends up holding exactly the archive's content.
DROP_SCHEMAS_QUERY = (
    "SELECT format('DROP SCHEMA IF EXISTS %I CASCADE;', nspname) FROM pg_namespace "
    "WHERE nspname NOT LIKE 'pg\\_%' AND nspname NOT IN ('information_schema', 'public')"
)
RESTORE_SCRIPT = """\
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cat > "$work/dump"
pg_restore --clean --if-exists -f "$work/restore.sql" "$work/dump"
psql -U "$1" -d "$2" -tA -c "$3" > "$work/drop.sql"
cat "$work/drop.sql" "$work/restore.sql" | psql -U "$1" -d "$2" -q -v ON_ERROR_STOP=1 --single-transaction
"""

# Everything here is authoritative: losing it means losing work. Each payload
# is the host directory the backend service bind-mounts at the given container
# path; where that directory lives is read from the selected Compose
# configuration, not assumed.
PAYLOAD_MOUNTS: tuple[tuple[str, str], ...] = (
    ("projects", "/app/projects"),
    ("ssh", "/root/.ssh"),
)
PAYLOAD_SERVICE = "backend"

# Authoritative too, but absent from older deployments and release bundles, so
# archived when the backend mounts them and skipped with a note otherwise.
# `data/secrets` holds the Release Studio signing key.
OPTIONAL_PAYLOAD_MOUNTS: tuple[tuple[str, str], ...] = (
    ("secrets", "/run/secrets/prism"),
)

# Caddy's ACME account and issued certificates. Losing them means reissuing,
# which public CAs rate-limit. Captured through the caddy service itself, so
# the volume's project-prefixed name never has to be guessed.
CADDY_SERVICE = "caddy"
CADDY_DATA_TARGET = "/data"
CADDY_DATA_NAME = "caddy_data.tar.gz"
CADDY_RESTORE_SCRIPT = """\
rm -rf /data/.prism-incoming && mkdir /data/.prism-incoming
tar -xzf - -C /data/.prism-incoming
find /data -mindepth 1 -maxdepth 1 ! -name .prism-incoming -exec rm -rf {} \\;
cd /data/.prism-incoming && find . -mindepth 1 -maxdepth 1 -exec mv {} /data/ \\;
cd /data && rmdir /data/.prism-incoming
"""

# Deployment configuration the installer or the operator wrote. Archived when
# present; restored only with `restore --with-config`, because replacing the
# Compose overlay under a running restore changes what is being restored into.
CONFIG_NAME = "config.tar.gz"
CONFIG_PATHS = (
    "generated/Caddyfile", "generated/docker-compose.generated.yml", "generated/deploy-plan.json",
    "generated/tailscale-serve.json", "Caddyfile", "sites",
)

# Build identity worth recording from the running containers. Only these keys
# are read from a container's environment; everything else there is secret.
IDENTITY_KEYS = ("PRISM_RELEASE", "PRISM_REVISION")
IDENTITY_LABELS = {"PRISM_RELEASE": "org.opencontainers.image.version",
                   "PRISM_REVISION": "org.opencontainers.image.revision"}
UNKNOWN_IDENTITY = {"", "development", "unknown"}

# Regenerable, and excluded from the projects payload. Each rebuilds from the
# database plus the component store.
REGENERABLE = (
    ".kicad-prism/artifacts",
    ".kicad-prism/bundles",
    ".kicad-prism/exports",
    ".kicad-prism/validation",
    ".kicad-prism/cache",
    ".kicad-prism/tmp",
)

APPLICATION_SERVICES = ("frontend", "backend", "prism-worker", "catalog-worker")

PAYLOAD_COMPRESSLEVEL = 6
# The outer archive wraps payloads that are already compressed.
ARCHIVE_COMPRESSLEVEL = 1


class BackupError(RuntimeError):
    pass


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_env(path: Path) -> dict[str, str]:
    """Parse a Compose ``.env``. Values are taken literally, as Compose does."""
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, _, value = stripped.partition("=")
        values[key.strip()] = value.strip()
    return values


def is_regenerable(relative: str) -> bool:
    """Whether a path inside ``data/projects`` rebuilds from authoritative state.

    ``tarfile`` presents member names as ``./a/b``. Strip that prefix as a
    prefix, not as a character set: the store itself lives under ``.kicad-prism``
    and ``lstrip("./")`` would eat its leading dot.
    """
    normalised = relative.replace(os.sep, "/")
    if normalised.startswith("./"):
        normalised = normalised[2:]
    normalised = normalised.lstrip("/")
    return any(
        normalised == prefix or normalised.startswith(prefix + "/")
        for prefix in REGENERABLE
    )


def compose_files(root: Path, explicit: list[str] | None = None) -> list[str]:
    """Resolve the Compose files for an installation.

    Release bundles ship ``compose.yml``; source checkouts use
    ``docker-compose.yml`` plus whatever the installer generated.
    """
    if explicit:
        return list(explicit)
    if (root / "compose.yml").is_file():
        return ["compose.yml"]
    if not (root / "docker-compose.yml").is_file():
        raise BackupError(
            f"No compose.yml or docker-compose.yml in {root}. "
            "Run from the deployment directory or pass --root."
        )
    files = ["docker-compose.yml"]
    for candidate in ("docker-compose.proxy.yml", "generated/docker-compose.generated.yml"):
        if (root / candidate).is_file():
            files.append(candidate)
    return files


def env_file_for(root: Path, explicit: str | None = None) -> str:
    if explicit:
        return explicit
    for candidate in ("generated/.env", ".env"):
        if (root / candidate).is_file():
            return candidate
    raise BackupError(f"No .env found in {root}; pass --env-file.")


def build_manifest(
    *,
    created_at: str,
    root: Path,
    env: dict[str, str],
    versions: dict[str, str],
    entries: dict[str, str],
    hot: bool,
    payloads: list[tuple[str, str]] = (),
    containers: dict[str, dict[str, str]] | None = None,
    build: dict[str, str] | None = None,
    extras: dict[str, object] | None = None,
) -> dict:
    """Describe the archive well enough to refuse a bad restore later.

    ``containers``, ``build`` and ``extras`` were added after the first
    archives were written; readers treat them as optional.
    """
    targets = dict(PAYLOAD_MOUNTS + OPTIONAL_PAYLOAD_MOUNTS)
    return {
        "schema": MANIFEST_SCHEMA,
        "created_at": created_at,
        "source": str(root),
        "hot": hot,
        "payloads": {
            name: {"source": relative, "target": targets[name]}
            for name, relative in payloads
        },
        "build": dict(build or {}),
        "containers": dict(containers or {}),
        "extras": dict(extras or {}),
        "postgres": {
            "user": env.get("POSTGRES_USER", "kicad_prism"),
            "database": env.get("POSTGRES_DB", "kicad_prism"),
            "image": env.get("PRISM_POSTGRES_IMAGE", "postgres:17-alpine"),
        },
        "images": {
            key: value
            for key, value in env.items()
            if key.endswith("_IMAGE") and value
        },
        "versions": versions,
        "checksums": entries,
    }


def compare_versions(manifest: dict, current: dict[str, str]) -> list[str]:
    """Problems that should stop a restore, in the operator's words."""
    problems: list[str] = []
    if str(manifest.get("schema")) != MANIFEST_SCHEMA:
        problems.append(
            f"archive schema {manifest.get('schema')!r} is not {MANIFEST_SCHEMA!r}"
        )
    archived = manifest.get("versions", {}) or {}
    for name, label in (("workspace_schema", "workspace"), ("catalog_schema", "catalog")):
        archived_value = archived.get(name)
        current_value = current.get(name)
        if archived_value is None or current_value is None:
            continue
        try:
            archived_version, current_version = int(archived_value), int(current_value)
        except (TypeError, ValueError):
            # This function decides whether to touch the deployment at all, so
            # a version it cannot read is a reason to stop, not a traceback.
            problems.append(
                f"the archive's {label} schema version {archived_value!r} is not a "
                "number, so it cannot be compared against this build"
            )
            continue
        if archived_version > current_version:
            problems.append(
                f"the archive's {label} schema is version {archived_value}, "
                f"newer than this build's {current_value}; restoring it would "
                "downgrade the database below what wrote it"
            )
    return problems


# ---------------------------------------------------------------------------
# Docker plumbing
# ---------------------------------------------------------------------------


def compose_command(root: Path, files: list[str], env_file: str) -> list[str]:
    command = ["docker", "compose", "--env-file", env_file]
    for name in files:
        command += ["-f", name]
    return command


def run(command: list[str], root: Path, *, capture: bool = False) -> subprocess.CompletedProcess:
    return subprocess.run(
        command,
        cwd=root,
        check=False,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
    )


def compose_config(compose: list[str], root: Path) -> dict:
    """The merged Compose configuration, as ``docker compose config`` sees it."""
    result = run(compose + ["config", "--format", "json"], root, capture=True)
    if result.returncode != 0:
        raise BackupError(
            "Could not read the Compose configuration: "
            + result.stderr.decode("utf-8", "replace").strip()
        )
    try:
        config = json.loads(result.stdout.decode("utf-8", "replace"))
    except json.JSONDecodeError as error:
        raise BackupError(f"Compose configuration is not valid JSON: {error}") from error
    return config if isinstance(config, dict) else {}


def _service_mounts(config: dict, service_name: str) -> dict[str, dict] | None:
    service = (config.get("services") or {}).get(service_name)
    if not isinstance(service, dict):
        return None
    return {
        str(volume.get("target") or ""): volume
        for volume in service.get("volumes") or []
        if isinstance(volume, dict)
    }


def _bind_source(volume: dict, target: str, root: Path) -> str:
    """The deployment-relative directory behind a bind mount, or BackupError."""
    if volume.get("type") != "bind":
        raise BackupError(
            f"{target} is a {volume.get('type') or 'non-bind'} mount; only bind mounts inside "
            "the deployment directory are supported."
        )
    resolved_root = root.resolve()
    source = Path(str(volume.get("source") or ""))
    if not source.is_absolute():
        source = resolved_root / source
    try:
        relative = source.resolve().relative_to(resolved_root)
    except ValueError:
        raise BackupError(f"{target} is mounted from {source}, outside {root}; refusing to archive it.")
    if relative == Path("."):
        raise BackupError(f"{target} is mounted from the deployment directory itself; refusing to archive it.")
    return relative.as_posix()


def resolve_payloads(
    compose: list[str], root: Path, config: dict | None = None
) -> list[tuple[str, str]]:
    """The host directories behind each authoritative mount, relative to ``root``.

    Read from ``docker compose config`` so overlays that move project storage
    or SSH keys are honoured. Anything that cannot be archived as a directory
    inside the deployment (a named volume, a mount outside ``root``, a missing
    mount) is refused rather than silently replaced by the default path.
    """
    if config is None:
        config = compose_config(compose, root)
    mounts = _service_mounts(config, PAYLOAD_SERVICE)
    if mounts is None:
        raise BackupError(f"The Compose configuration defines no `{PAYLOAD_SERVICE}` service.")
    payloads: list[tuple[str, str]] = []
    for name, target in PAYLOAD_MOUNTS:
        volume = mounts.get(target)
        if volume is None:
            raise BackupError(f"`{PAYLOAD_SERVICE}` mounts nothing at {target}; cannot locate the {name} storage.")
        payloads.append((name, _bind_source(volume, target, root)))
    _refuse_overlap(payloads)
    return payloads


def resolve_optional_payloads(
    config: dict, root: Path, required: list[tuple[str, str]]
) -> tuple[list[tuple[str, str]], list[str]]:
    """Optional payloads this deployment mounts, plus a note for each skipped.
    A layout refused for a required payload only skips an optional one."""
    mounts = _service_mounts(config, PAYLOAD_SERVICE) or {}
    found: list[tuple[str, str]] = []
    notes: list[str] = []
    for name, target in OPTIONAL_PAYLOAD_MOUNTS:
        volume = mounts.get(target)
        if volume is None:
            notes.append(f"{name}: `{PAYLOAD_SERVICE}` mounts nothing at {target}; skipped")
            continue
        try:
            relative = _bind_source(volume, target, root)
            _refuse_overlap(required + found + [(name, relative)])
        except BackupError as error:
            notes.append(f"{name}: {error} Skipped.")
            continue
        found.append((name, relative))
    return found, notes


def _refuse_overlap(payloads: list[tuple[str, str]]) -> None:
    # Restore stages each payload beside its destination and swaps them in
    # one at a time, so two payloads whose directories nest would have the
    # first swap delete the second one's staging. Refuse that layout up front.
    for (name, relative), (other_name, other_relative) in itertools.combinations(payloads, 2):
        path, other = Path(relative), Path(other_relative)
        if path == other or path in other.parents or other in path.parents:
            raise BackupError(
                f"The {name} storage ({relative}) and the {other_name} storage ({other_relative}) overlap; "
                "each must be a separate directory."
            )


def has_caddy_data(config: dict) -> bool:
    """Whether the caddy service keeps its state in a volume at /data."""
    volume = (_service_mounts(config, CADDY_SERVICE) or {}).get(CADDY_DATA_TARGET)
    return bool(volume) and volume.get("type") == "volume"


def caddy_command(compose: list[str], entrypoint: str, *args: str) -> list[str]:
    """A one-off container of the caddy service, with its volumes but no ports or deps."""
    return compose + [
        "run", "--rm", "--no-deps", "-T", "--entrypoint", entrypoint, CADDY_SERVICE, *args,
    ]


def config_files(root: Path) -> list[str]:
    """Deployment configuration present under ``root``, as archive member names."""
    found: list[str] = []
    for relative in CONFIG_PATHS:
        path = root / relative
        if path.is_file():
            found.append(relative)
        elif path.is_dir():
            found += sorted(
                child.relative_to(root).as_posix()
                for child in path.rglob("*")
                if child.is_file()
            )
    return found


def deployment_identity(
    inspected: list[dict], env: dict[str, str]
) -> tuple[dict[str, dict[str, str]], dict[str, str]]:
    """Which images the deployment runs, and which build they came from.

    ``inspected`` is ``docker inspect`` output for the deployment's
    containers. Only image references and the ``IDENTITY_KEYS`` are read: a
    container's environment otherwise holds the deployment's secrets.
    """
    containers: dict[str, dict[str, str]] = {}
    from_containers: dict[str, str] = {}
    from_labels: dict[str, str] = {}
    for item in inspected:
        if not isinstance(item, dict):
            continue
        config = item.get("Config") or {}
        labels = config.get("Labels") or {}
        name = str(item.get("Name") or "").lstrip("/")
        service = str(labels.get("com.docker.compose.service") or name)
        if not service:
            continue
        containers[service] = {
            "container": name,
            "image": str(config.get("Image") or ""),
            "image_id": str(item.get("Image") or ""),
        }
        for entry in config.get("Env") or []:
            key, _, value = str(entry).partition("=")
            if key in IDENTITY_KEYS and value not in UNKNOWN_IDENTITY:
                # The backend reports what /api/health/ready reports.
                if service == PAYLOAD_SERVICE or key not in from_containers:
                    from_containers[key] = value
        for key, label in IDENTITY_LABELS.items():
            value = str(labels.get(label) or "")
            if value not in UNKNOWN_IDENTITY:
                from_labels.setdefault(key, value)

    build: dict[str, str] = {}
    for key in IDENTITY_KEYS:
        for source, values in (("container", from_containers), ("image label", from_labels), ("env file", env)):
            value = values.get(key, "")
            if value and value not in UNKNOWN_IDENTITY:
                build[key] = value
                build[f"{key}_source"] = source
                break
    return containers, build


def inspect_containers(compose: list[str], root: Path) -> list[dict]:
    """``docker inspect`` for every container of this deployment, running or not."""
    listed = run(compose + ["ps", "--all", "--quiet"], root, capture=True)
    if listed.returncode != 0:
        return []
    ids = listed.stdout.decode("utf-8", "replace").split()
    if not ids:
        return []
    inspected = run(["docker", "inspect", *ids], root, capture=True)
    if inspected.returncode != 0:
        return []
    try:
        data = json.loads(inspected.stdout.decode("utf-8", "replace"))
    except json.JSONDecodeError:
        return []
    return data if isinstance(data, list) else []


def present_application_services(compose: list[str], root: Path) -> list[str]:
    """Application services this deployment actually defines.

    Deployment schemes differ in what they run, and a backup must not fail
    because a service it wanted to pause is not part of this installation.
    """
    result = run(compose + ["config", "--services"], root, capture=True)
    if result.returncode != 0:
        return list(APPLICATION_SERVICES)
    defined = set(result.stdout.decode("utf-8", "replace").split())
    return [service for service in APPLICATION_SERVICES if service in defined]


def schema_versions(compose: list[str], root: Path, env: dict[str, str]) -> dict[str, str]:
    """Read both migration ledgers straight from PostgreSQL."""
    user = env.get("POSTGRES_USER", "kicad_prism")
    database = env.get("POSTGRES_DB", "kicad_prism")
    query = (
        "SELECT "
        "COALESCE((SELECT max(version)::text FROM workspace.ws_schema_migrations), '0') "
        "|| ' ' || "
        "COALESCE((SELECT max(version)::text FROM catalog.catalog_schema_versions), '0')"
    )
    result = run(
        compose + ["exec", "-T", "postgres", "psql", "-U", user, "-d", database, "-tAc", query],
        root,
        capture=True,
    )
    if result.returncode != 0:
        return {}
    parts = result.stdout.decode("utf-8", "replace").strip().split()
    if len(parts) != 2:
        return {}
    return {"workspace_schema": parts[0], "catalog_schema": parts[1]}


def dump_database(compose: list[str], root: Path, env: dict[str, str], target: Path) -> None:
    user = env.get("POSTGRES_USER", "kicad_prism")
    database = env.get("POSTGRES_DB", "kicad_prism")
    with target.open("wb") as handle:
        result = subprocess.run(
            compose + ["exec", "-T", "postgres", "pg_dump", "-U", user, "-d", database, "-Fc"],
            cwd=root,
            stdout=handle,
            stderr=subprocess.PIPE,
            check=False,
        )
    if result.returncode != 0:
        raise BackupError(
            "pg_dump failed: " + result.stderr.decode("utf-8", "replace").strip()
        )
    if target.stat().st_size == 0:
        raise BackupError("pg_dump produced an empty file; refusing to call this a backup.")


def extract_all(handle: tarfile.TarFile, target: Path) -> None:
    """Extract with the member sanitising filter where the runtime has one.

    Python 3.14 rejects unfiltered extraction outright. Older runtimes have no
    ``filter`` argument at all, and operators run this on whatever host they
    have, so ask for the safe behaviour and fall back rather than refuse.
    """
    try:
        handle.extractall(target, filter="data")
    except TypeError:
        handle.extractall(target)


def archive_directory(source: Path, target: Path, *, prune_regenerable: bool) -> None:
    def keep(info: tarfile.TarInfo) -> tarfile.TarInfo | None:
        if prune_regenerable and is_regenerable(info.name):
            return None
        return info

    # Level 6, not tarfile's 9: about half the CPU for a few percent more
    # bytes, and on a cold backup this runs while Prism is stopped.
    with tarfile.open(target, "w:gz", compresslevel=PAYLOAD_COMPRESSLEVEL) as archive:
        archive.add(source, arcname=".", filter=keep)


def staging_directory(near: Path, purpose: str) -> tempfile.TemporaryDirectory:
    """A scratch directory beside ``near``, on its filesystem, rather than in the
    system temp directory (often a small system drive, ``%TEMP%`` on Windows)."""
    near.mkdir(parents=True, exist_ok=True)
    return tempfile.TemporaryDirectory(dir=near, prefix=f".prism-{purpose}-")


def swap_directory(incoming: Path, destination: Path) -> None:
    """Put ``incoming`` at ``destination``, keeping the live copy until the swap succeeds.

    The live directory is moved aside rather than removed first, so a rename
    that fails leaves it exactly where it was and the incoming copy intact.
    """
    previous = destination.parent / f".{destination.name}.previous"
    if previous.exists():
        shutil.rmtree(previous)
    if destination.is_dir():
        destination.replace(previous)
    try:
        incoming.replace(destination)
    except OSError:
        if previous.exists():
            previous.replace(destination)
        raise
    if previous.exists():
        shutil.rmtree(previous, ignore_errors=True)


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------


def capture_caddy_data(compose: list[str], root: Path, target: Path) -> None:
    with target.open("wb") as handle:
        result = subprocess.run(
            caddy_command(compose, "tar", "-czf", "-", "-C", CADDY_DATA_TARGET, "."),
            cwd=root,
            stdout=handle,
            stderr=subprocess.PIPE,
            check=False,
        )
    if result.returncode != 0 or target.stat().st_size == 0:
        raise BackupError(
            "Could not archive the Caddy data volume: "
            + result.stderr.decode("utf-8", "replace").strip()
        )


def archive_config(root: Path, members: list[str], target: Path) -> None:
    with tarfile.open(target, "w:gz", compresslevel=PAYLOAD_COMPRESSLEVEL) as archive:
        for relative in members:
            archive.add(root / relative, arcname=relative, recursive=False)


def create(args: argparse.Namespace) -> int:
    root: Path = args.root.resolve()
    env_file = env_file_for(root, args.env_file)
    files = compose_files(root, args.compose_file)
    compose = compose_command(root, files, env_file)
    env = read_env(root / env_file)

    created_at = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output = (args.output or root / f"prism-backup-{created_at}.tar.gz").resolve()

    tui.banner("Prism backup", str(output.name))
    tui.info(f"Deployment  {root}")
    tui.info(f"Compose     {' '.join(files)}")
    tui.info(f"Environment {env_file}")
    tui.info(f"Staging     {output.parent}")
    tui.write()

    config = compose_config(compose, root)
    payloads = resolve_payloads(compose, root, config)
    for name, relative in payloads:
        if not (root / relative).is_dir():
            raise BackupError(f"{relative} ({name} storage) does not exist; refusing to write an incomplete backup.")
        tui.info(f"{name:<11} {relative}")
    optional, skipped = resolve_optional_payloads(config, root, payloads)
    for name, relative in optional:
        if (root / relative).is_dir():
            payloads.append((name, relative))
            tui.info(f"{name:<11} {relative}")
        else:
            skipped.append(f"{name}: {relative} does not exist; skipped")
    caddy = has_caddy_data(config)
    if not caddy:
        skipped.append("caddy data: no caddy service with a /data volume; skipped")
    config_members = config_files(root)
    for note in skipped:
        tui.hint(note)
    tui.write()

    containers, build = deployment_identity(inspect_containers(compose, root), env)
    if build:
        tui.info(
            f"Build       {build.get('PRISM_RELEASE', 'unknown')} "
            f"{build.get('PRISM_REVISION', '')[:12]}".rstrip()
        )
    else:
        tui.warn("Could not determine the running build; the manifest will not name it.")

    services = present_application_services(compose, root)
    stopped: list[str] = []
    if args.hot:
        tui.warn("Hot backup: the database and the files may not describe one moment.")
    elif not services:
        tui.warn("No application services found; capturing without pausing anything.")
    else:
        tui.note("Stopping the application so the dump and the files agree")
        tui.hint("PostgreSQL stays up. Use --hot to skip, without the guarantee.")
        if run(compose + ["stop", *services], root).returncode != 0:
            raise BackupError("Could not stop the application services.")
        stopped = services

    partial = output.with_name(output.name + ".partial")
    with staging_directory(output.parent, "backup") as staging_name:
        staging = Path(staging_name)
        # Only the dump and the payload directories need the pause. Hashing
        # and writing the outer archive happen after the restart.
        try:
            tui.write()
            tui.note("Dumping PostgreSQL")
            dump_database(compose, root, env, staging / DUMP_NAME)
            tui.ok(f"{DUMP_NAME}", f"{(staging / DUMP_NAME).stat().st_size / 1e6:.1f} MB")

            for name, relative in payloads:
                source = root / relative
                target = staging / f"{name}.tar.gz"
                archive_directory(source, target, prune_regenerable=(name == "projects"))
                tui.ok(f"{name}.tar.gz", f"{target.stat().st_size / 1e6:.1f} MB from {relative}")

            versions = schema_versions(compose, root, env)
        finally:
            if stopped:
                tui.write()
                tui.note("Restarting the application")
                run(compose + ["start", *stopped], root)
                tui.write()

        if versions:
            tui.ok(
                "schema ledgers",
                f"workspace {versions['workspace_schema']}, catalog {versions['catalog_schema']}",
            )
        else:
            tui.warn("Could not read the schema ledgers; the manifest will not pin them.")

        if caddy:
            capture_caddy_data(compose, root, staging / CADDY_DATA_NAME)
            tui.ok(CADDY_DATA_NAME, f"{(staging / CADDY_DATA_NAME).stat().st_size / 1e6:.1f} MB")
        if config_members:
            archive_config(root, config_members, staging / CONFIG_NAME)
            tui.ok(CONFIG_NAME, ", ".join(config_members))

        shutil.copy2(root / env_file, staging / "env")
        tui.ok("env", env_file)

        entries = {
            path.name: sha256_file(path)
            for path in sorted(staging.iterdir())
            if path.is_file()
        }
        extras: dict[str, object] = {}
        if caddy:
            extras["caddy_data"] = CADDY_DATA_NAME
        if config_members:
            extras["config"] = {"archive": CONFIG_NAME, "files": config_members}
        manifest = build_manifest(
            created_at=created_at,
            root=root,
            env=env,
            versions=versions,
            entries=entries,
            hot=bool(args.hot),
            payloads=payloads,
            containers=containers,
            build=build,
            extras=extras,
        )
        (staging / MANIFEST_NAME).write_text(
            json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )

        tui.note("Writing the archive")
        try:
            with tarfile.open(partial, "w:gz", compresslevel=ARCHIVE_COMPRESSLEVEL) as archive:
                for path in sorted(staging.iterdir()):
                    archive.add(path, arcname=path.name)
            partial.replace(output)
        finally:
            if partial.exists():
                partial.unlink()

    tui.write()
    tui.ok(f"Wrote {output}", f"{output.stat().st_size / 1e6:.1f} MB")
    tui.info("Store it off this host, encrypted: it contains repositories, tokens")
    tui.info("and private keys.")
    tui.write()
    tui.hint(f"Check it now:  python3 scripts/prism_backup.py verify {output.name}")
    return 0


def load_manifest(archive: Path) -> dict:
    with tarfile.open(archive, "r:gz") as handle:
        member = handle.extractfile(MANIFEST_NAME)
        if member is None:
            raise BackupError(f"{archive} has no {MANIFEST_NAME}; it is not a Prism backup.")
        return json.loads(member.read().decode("utf-8"))


def checksum_problems(manifest: dict, staging: Path) -> list[tuple[str, str]]:
    """Compare an extracted archive against the checksums its manifest records.

    Shared with restore, which must run this before it replaces anything: the
    manifest lives in its own member, so it stays readable even when a payload
    beside it was truncated in transit.
    """
    problems: list[tuple[str, str]] = []
    for name, expected in sorted((manifest.get("checksums") or {}).items()):
        path = staging / name
        if not path.is_file():
            problems.append((name, "missing from the archive"))
        elif sha256_file(path) != expected:
            problems.append((name, "checksum does not match the manifest"))
    return problems


def archive_checksum_problems(manifest: dict, archive: Path) -> tuple[list[tuple[str, str]], dict[str, int]]:
    """Hash each member straight out of the archive, without unpacking it.

    Returns the problems and each member's size. Verify needs no scratch
    space this way, which matters when the archive is most of a disk.
    """
    expected = manifest.get("checksums") or {}
    sizes: dict[str, int] = {}
    actual: dict[str, str] = {}
    with tarfile.open(archive, "r:gz") as handle:
        for member in handle:
            if member.name not in expected or not member.isfile():
                continue
            stream = handle.extractfile(member)
            if stream is None:
                continue
            digest = hashlib.sha256()
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
            actual[member.name] = digest.hexdigest()
            sizes[member.name] = member.size
    problems: list[tuple[str, str]] = []
    for name, value in sorted(expected.items()):
        if name not in actual:
            problems.append((name, "missing from the archive"))
        elif actual[name] != value:
            problems.append((name, "checksum does not match the manifest"))
    return problems, sizes


def verify(args: argparse.Namespace) -> int:
    archive: Path = args.archive.resolve()
    manifest = load_manifest(archive)
    build = manifest.get("build") or {}

    tui.banner("Verify backup", archive.name)
    rows = [
        ("Created", manifest.get("created_at", "unknown")),
        ("Source", manifest.get("source", "unknown")),
        ("Database", manifest.get("postgres", {}).get("database", "unknown")),
        ("Consistency", "hot (services running)" if manifest.get("hot") else "quiesced"),
    ]
    if build:
        rows.append(("Release", build.get("PRISM_RELEASE", "unknown")))
        rows.append(("Revision", build.get("PRISM_REVISION", "unknown")))
    tui.panel("Archive", rows)

    problems_list, sizes = archive_checksum_problems(manifest, archive)
    problems = dict(problems_list)
    failures = len(problems)
    for name in sorted((manifest.get("checksums") or {})):
        if name in problems:
            tui.fail(name, problems[name])
        else:
            tui.ok(name, f"{sizes.get(name, 0) / 1e6:.1f} MB")

    tui.write()
    if failures:
        tui.fail(f"{failures} problem(s). Do not rely on this archive.")
        return 1
    tui.ok("Archive is intact")
    if manifest.get("hot"):
        tui.warn("Taken hot, so the database and files may disagree at the margins.")
    return 0


def restore_config(staging: Path, root: Path) -> list[str]:
    """Write the archived configuration files over the deployment's, one file at a time."""
    restored: list[str] = []
    unpacked = staging / "config"
    unpacked.mkdir()
    with tarfile.open(staging / CONFIG_NAME, "r:gz") as handle:
        extract_all(handle, unpacked)
    for source in sorted(path for path in unpacked.rglob("*") if path.is_file()):
        relative = source.relative_to(unpacked)
        destination = root / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        incoming = destination.with_name(destination.name + ".incoming")
        shutil.copy2(source, incoming)
        incoming.replace(destination)
        restored.append(relative.as_posix())
    return restored


def restore(args: argparse.Namespace) -> int:
    root: Path = args.root.resolve()
    archive: Path = args.archive.resolve()
    env_file = env_file_for(root, args.env_file)
    files = compose_files(root, args.compose_file)
    compose = compose_command(root, files, env_file)
    env = read_env(root / env_file)
    manifest = load_manifest(archive)
    # Where the live services keep their data, from the same Compose
    # configuration they run with. Resolved before anything is confirmed so
    # an unsupported layout stops the restore while nothing has changed.
    config = compose_config(compose, root)
    payloads = resolve_payloads(compose, root, config)
    required = {name for name, _ in payloads}
    archived = set(manifest.get("checksums") or {})
    optional, skipped = resolve_optional_payloads(config, root, payloads)
    for name, relative in optional:
        if f"{name}.tar.gz" in archived:
            payloads.append((name, relative))
        else:
            skipped.append(f"{name}: not in this archive; {relative} is left as it is")
    restore_caddy = CADDY_DATA_NAME in archived and has_caddy_data(config)
    if CADDY_DATA_NAME in archived and not restore_caddy:
        skipped.append("caddy data: this deployment has no caddy service with a /data volume")
    restore_settings = CONFIG_NAME in archived and bool(getattr(args, "with_config", False))
    if CONFIG_NAME in archived and not restore_settings:
        skipped.append(f"configuration: kept as it is (archived in {CONFIG_NAME}; --with-config restores it)")

    tui.banner("Restore backup", archive.name)
    tui.info(f"Into        {root}")
    tui.info(f"Taken       {manifest.get('created_at', 'unknown')}")
    for name, relative in payloads:
        tui.info(f"{name:<11} {relative}")
    if restore_caddy:
        tui.info("caddy data  the caddy service's /data volume")
    if restore_settings:
        tui.info(f"config      {', '.join((manifest.get('extras') or {}).get('config', {}).get('files', [])) or CONFIG_NAME}")
    for note in skipped:
        tui.hint(note)
    tui.write()

    # Start PostgreSQL before reading the ledgers. Asking a stopped server and
    # then treating the silence as agreement disabled this check in the one
    # case that most needs it: restoring onto a fresh host.
    run(compose + ["up", "-d", "postgres"], root)
    current = schema_versions(compose, root, env)
    problems = compare_versions(manifest, current)
    if problems:
        for problem in problems:
            tui.fail(problem)
        tui.write()
        tui.info("Restore this archive with the release that produced it.")
        return 1
    if not current:
        tui.warn("Could not read this deployment's schema ledgers.")
        tui.info("The check that refuses an archive newer than this build did not")
        tui.info("run. On an empty database that is expected; otherwise stop and")
        tui.info("find out why before continuing.")
        tui.write()

    tui.warn("This replaces the database and the storage listed above in place.")
    tui.info("Everything currently in this deployment is discarded.")
    tui.write()
    if not args.yes and not tui.confirm("Proceed?", default=False):
        tui.warn("Cancelled. Nothing changed.")
        return 130

    # Unpacked inside the deployment, on the filesystem the data is swapped
    # into, rather than in a system temp directory that may not have room.
    with staging_directory(root, "restore") as staging_name:
        staging = Path(staging_name)
        with tarfile.open(archive, "r:gz") as handle:
            extract_all(handle, staging)

        # Nothing in the deployment is touched until the archive has proved it
        # can replace what it is about to remove. A truncated payload used to
        # be discovered after rmtree had already deleted the live copy.
        tui.write()
        tui.note("Checking the archive")
        damage = checksum_problems(manifest, staging)
        if damage:
            for name, reason in damage:
                tui.fail(name, reason)
            tui.write()
            tui.fail("Archive is damaged. Nothing was changed.")
            return 1
        tui.ok("archive is intact")

        # Nothing destructive happens while the application can still write.
        # A stop that fails leaves writers alive, so the restore ends here with
        # the deployment exactly as it was.
        tui.write()
        tui.note("Stopping the application")
        services = present_application_services(compose, root)
        if restore_caddy:
            # Caddy writes its volume while it runs.
            services.append(CADDY_SERVICE)
        if services and run(compose + ["stop", *services], root).returncode != 0:
            tui.fail("Could not stop the application services. Nothing was changed.")
            return 1

        # Unpack beside each destination first, so a failure here leaves the
        # live directory untouched, and swap only once the database is in.
        incoming: list[tuple[Path, Path, str]] = []
        for name, relative in payloads:
            payload = staging / f"{name}.tar.gz"
            if not payload.is_file():
                if name not in required:
                    continue
                raise BackupError(f"The archive has no {name} payload; refusing a partial restore.")
            destination = root / relative
            unpacked = destination.parent / f".{destination.name}.incoming"
            if unpacked.exists():
                shutil.rmtree(unpacked)
            unpacked.mkdir(parents=True, exist_ok=True)
            with tarfile.open(payload, "r:gz") as handle:
                extract_all(handle, unpacked)
            incoming.append((destination, unpacked, relative))

        # Stage 1: the database, as one transaction. Without
        # --single-transaction a restore keeps going past a failed object and
        # leaves a database that is neither the old one nor the archive's;
        # with it, the first error rolls everything back and the live
        # database is exactly what it was.
        user = env.get("POSTGRES_USER", "kicad_prism")
        database = env.get("POSTGRES_DB", "kicad_prism")
        tui.note("Restoring PostgreSQL")
        with (staging / DUMP_NAME).open("rb") as handle:
            result = subprocess.run(
                compose
                + ["exec", "-T", "-e", "PGOPTIONS=-c client_min_messages=warning", "postgres",
                   "sh", "-ec", RESTORE_SCRIPT, "restore", user, database, DROP_SCHEMAS_QUERY],
                cwd=root,
                stdin=handle,
                check=False,
            )
        if result.returncode != 0:
            for _, unpacked, _ in incoming:
                shutil.rmtree(unpacked, ignore_errors=True)
            tui.fail("pg_restore reported errors.", "Inspect the output above before starting.")
            tui.write()
            tui.info("The restore ran as one transaction and was rolled back, so the")
            tui.info("database, project storage and SSH keys are as they were before.")
            return result.returncode
        tui.ok("database restored")

        # Stage 2: swap the files in. The database is already the archive's,
        # so a failure here is reported as a half-applied restore, and the
        # unpacked payloads that did not get swapped are left in place to
        # finish by hand rather than deleted.
        swapped: list[str] = []
        try:
            for destination, unpacked, relative in incoming:
                swap_directory(unpacked, destination)
                swapped.append(relative)
                tui.ok(relative)
        except OSError as error:
            tui.fail("Could not replace project storage.", str(error))
            tui.write()
            tui.info("The database holds the archive's content. Replaced so far:")
            for relative in swapped:
                tui.ok(relative)
            for destination, unpacked, relative in incoming:
                if relative not in swapped:
                    tui.warn(f"{relative} not replaced; the archive's copy is at {unpacked}")
            tui.info("Move each remaining .incoming directory over its destination,")
            tui.info("then start the application.")
            return 1

        # Stage 3: Caddy's certificates and the deployment configuration.
        # Both are rebuildable by hand, so a failure here is reported with the
        # data already in place rather than undone.
        if restore_caddy:
            with (staging / CADDY_DATA_NAME).open("rb") as handle:
                result = subprocess.run(
                    caddy_command(compose, "sh", "-ec", CADDY_RESTORE_SCRIPT),
                    cwd=root,
                    stdin=handle,
                    check=False,
                )
            if result.returncode != 0:
                tui.fail("Could not restore the Caddy data volume.", "Database and storage were restored.")
                tui.info(f"Caddy reissues certificates on start, or load {CADDY_DATA_NAME} by hand.")
                return 1
            tui.ok("caddy data")
        if restore_settings:
            for relative in restore_config(staging, root):
                tui.ok(relative)

    tui.write()
    tui.note("Starting the application")
    tui.info("Schema migrations run at startup; watch the backend log.")
    if run(compose + ["up", "-d", "--wait"], root).returncode != 0:
        # The data is restored; only the startup afterwards failed. Say so
        # rather than reporting success, and do not undo the restore: the
        # archive's content is now the deployment's content.
        tui.write()
        tui.fail("Restored, but the application did not start healthy.")
        tui.info("The database, project storage and SSH keys now hold the archive's")
        tui.info("content. Inspect the service logs, then start the application again:")
        tui.hint(f"{' '.join(compose)} up -d --wait")
        return 1
    tui.write()
    tui.ok("Restore complete")
    tui.info("Verify: login, a project, the catalog, and one 3D view.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="prism-backup", description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd(), help="deployment directory")
    parser.add_argument("--env-file", help="environment file, relative to --root")
    parser.add_argument("--compose-file", action="append", help="repeatable, relative to --root")
    sub = parser.add_subparsers(dest="command", required=True)

    creator = sub.add_parser("create", help="write a backup archive")
    creator.add_argument("--output", type=Path, help="archive path")
    creator.add_argument(
        "--hot",
        action="store_true",
        help="do not stop the application first (faster, no consistency guarantee)",
    )
    creator.set_defaults(handler=create)

    verifier = sub.add_parser("verify", help="check an archive against its manifest")
    verifier.add_argument("archive", type=Path)
    verifier.set_defaults(handler=verify)

    restorer = sub.add_parser("restore", help="restore an archive into this deployment")
    restorer.add_argument("archive", type=Path)
    restorer.add_argument("--yes", action="store_true", help="do not ask for confirmation")
    restorer.add_argument(
        "--with-config",
        action="store_true",
        help="also write the archived generated/ files and sites/ over this deployment's",
    )
    restorer.set_defaults(handler=restore)

    args = parser.parse_args(argv)
    try:
        return int(args.handler(args))
    except BackupError as error:
        tui.write()
        tui.fail(str(error))
        return 1
    except tui.Abort:
        tui.write()
        tui.warn("Cancelled.")
        return 130


if __name__ == "__main__":
    sys.exit(main())
