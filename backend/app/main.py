import hashlib
import logging
import os
import shutil
import subprocess
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.catalog_admin import router as catalog_admin_router
from app.api.comments import router as comments_router
from app.api.diff import router as diff_router
from app.api.folders import router as folders_router
from app.api.oauth import router as oauth_router
from app.api.projects import router as projects_router
from app.api.provider_oauth import router as provider_oauth_router
from app.api.remote_provider import router as remote_provider_router
from app.api.service_clients import router as service_clients_router
from app.api.settings import router as settings_router
from app.api.workspace import router as workspace_router
from app.core.config import settings
from app.services.comments_store_service import initialize_comments_store
from app.services.component_catalog_service import catalog_service
from app.services.workspace_service import workspace

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
SUBPROCESS_TIMEOUT_SECONDS = 8
KNOWN_GIT_HOSTS = ("github.com", "gitlab.com")


def configure_git():
    """Configure Git with GITHUB_TOKEN if available."""
    if settings.GITHUB_TOKEN:
        logger.info("Configuring Git to use GITHUB_TOKEN...")
        try:
            # git config --global url."https://${GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/"
            token_url = f"https://{settings.GITHUB_TOKEN}@github.com/"
            subprocess.run(
                [
                    "git",
                    "config",
                    "--global",
                    f"url.{token_url}.insteadOf",
                    "https://github.com/",
                ],
                check=True,
                timeout=SUBPROCESS_TIMEOUT_SECONDS,
            )
            logger.info("Git successfully configured with token injection.")
        except (subprocess.SubprocessError, OSError) as error:
            logger.error("Failed to configure Git with token: %s", error)


def scan_known_hosts():
    """Scan and add GitHub/GitLab to known_hosts if missing."""
    ssh_dir = Path.home() / ".ssh"
    known_hosts = ssh_dir / "known_hosts"

    # Ensure known_hosts exists
    if not known_hosts.exists():
        try:
            known_hosts.touch(mode=0o644)
        except Exception as e:
            logger.error(f"Failed to create known_hosts file: {e}")
            return

    for host in KNOWN_GIT_HOSTS:
        try:
            # Check if host is already known using ssh-keygen -F (Find)
            # This checks hashed hosts too
            result = subprocess.run(
                ["ssh-keygen", "-F", host],
                capture_output=True,
                timeout=SUBPROCESS_TIMEOUT_SECONDS,
            )

            if result.returncode != 0:
                logger.info(f"Host {host} not found in known_hosts. Scanning...")
                # Scan and append to known_hosts
                scan = subprocess.run(
                    ["ssh-keyscan", "-H", host],
                    capture_output=True,
                    text=True,
                    timeout=SUBPROCESS_TIMEOUT_SECONDS,
                )
                if scan.returncode == 0 and scan.stdout:
                    with open(known_hosts, "a", encoding="utf-8") as f:
                        f.write(scan.stdout)
                    logger.info(f"Successfully added {host} to known_hosts.")
                else:
                    logger.warning(f"Failed to scan {host}. Error: {scan.stderr}")
            else:
                logger.debug(f"Host {host} already in known_hosts.")

        except (subprocess.SubprocessError, OSError) as error:
            logger.error("Error checking/scanning host %s: %s", host, error)


def ensure_ssh_dir():
    """Ensure ~/.ssh exists and has correct permissions."""
    ssh_dir = Path.home() / ".ssh"
    try:
        ssh_dir.mkdir(parents=True, exist_ok=True)
        os.chmod(ssh_dir, 0o700)
        if settings.GIT_SCAN_KNOWN_HOSTS_ON_STARTUP:
            scan_known_hosts()

        logger.info("SSH directory configured correctly.")
    except OSError as error:
        logger.error("Failed to configure SSH directory: %s", error)


def _repo_root() -> Path:
    return Path(__file__).resolve().parent.parent.parent


def _copy_panel_to_static(dist_dir: Path, static_dir: Path) -> None:
    """Copy panel files from dist to static, injecting a content hash into panel.html URLs."""
    static_dir.mkdir(parents=True, exist_ok=True)
    for src in dist_dir.iterdir():
        if not src.is_file():
            continue
        if src.name == "panel.html":
            continue  # rewritten below
        shutil.copy2(src, static_dir / src.name)

    # Compute a short hash of panel.js to use as a cache-busting query string
    panel_js = dist_dir / "panel.js"
    bust = (
        hashlib.md5(panel_js.read_bytes()).hexdigest()[:8]  # noqa: S324
        if panel_js.is_file()
        else "0"
    )

    html = (dist_dir / "panel.html").read_text(encoding="utf-8")
    html = html.replace(
        'src="/remote-provider/assets/panel.js"',
        f'src="/remote-provider/assets/panel.js?v={bust}"',
    )
    html = html.replace(
        'href="/remote-provider/assets/panel.css"',
        f'href="/remote-provider/assets/panel.css?v={bust}"',
    )
    (static_dir / "panel.html").write_text(html, encoding="utf-8")


def build_remote_provider_panel() -> None:
    """Build the remote provider panel if missing or stale. No-op in Docker (already built)."""
    static_dir = Path(__file__).resolve().parent / "static" / "remote_provider"
    panel_html = static_dir / "panel.html"

    repo_root = _repo_root()
    frontend_dir = repo_root / "frontend"
    dist_dir = frontend_dir / "dist" / "remote_provider"

    if not frontend_dir.is_dir():
        logger.debug(
            "Frontend directory not found — skipping panel build (Docker mode)"
        )
        return

    dist_panel_html = dist_dir / "panel.html"

    # Sync dist → static whenever dist/panel.html is newer than static/panel.html
    if (
        panel_html.is_file()
        and dist_panel_html.is_file()
        and panel_html.stat().st_mtime >= dist_panel_html.stat().st_mtime
    ):
        logger.debug("Remote provider panel is up to date")
        return

    # If dist already exists and is fresh vs vite config, just sync without rebuilding
    vite_config = frontend_dir / "vite.config.panel.ts"
    if (
        dist_panel_html.is_file()
        and vite_config.is_file()
        and dist_panel_html.stat().st_mtime >= vite_config.stat().st_mtime
    ):
        logger.info("Syncing remote provider panel from dist to static…")
        _copy_panel_to_static(dist_dir, static_dir)
        logger.info("Remote provider panel synced to %s", static_dir)
        return

    npm = shutil.which("npm")
    if not npm:
        logger.warning("npm not found — cannot auto-build remote provider panel")
        return

    logger.info("Building remote provider panel (npm run build:panel)…")
    try:
        result = subprocess.run(
            [npm, "run", "build:panel"],
            cwd=str(frontend_dir),
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode != 0:
            logger.error("Panel build failed:\n%s", result.stdout + result.stderr)
            return
    except Exception as exc:
        logger.error("Panel build error: %s", exc)
        return

    _copy_panel_to_static(dist_dir, static_dir)
    logger.info("Remote provider panel built and copied to %s", static_dir)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    configure_git()
    ensure_ssh_dir()
    build_remote_provider_panel()
    initialize_comments_store()
    catalog_service.initialize()
    workspace.initialize()
    try:
        yield
    finally:
        catalog_service.close()


app = FastAPI(title="KiCAD Prism API", lifespan=lifespan)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(projects_router, prefix="/api/projects", tags=["projects"])
app.include_router(comments_router, prefix="/api/projects", tags=["comments"])
app.include_router(diff_router, prefix="/api/projects", tags=["diff"])
app.include_router(settings_router, prefix="/api/settings", tags=["settings"])
app.include_router(folders_router, prefix="/api/folders", tags=["folders"])
app.include_router(workspace_router, prefix="/api/workspace", tags=["workspace"])
app.include_router(catalog_admin_router)
app.include_router(oauth_router)
app.include_router(service_clients_router)
app.include_router(remote_provider_router, tags=["remote-provider"])
app.include_router(provider_oauth_router, tags=["provider-oauth"])
