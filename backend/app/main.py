from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.auth import router as auth_router
from app.api.projects import router as projects_router
from app.api.comments import router as comments_router
from app.api.diff import router as diff_router
from app.api.design_compare import router as design_compare_router
from app.api.release_studio import router as release_studio_router
from app.api.folders import router as folders_router
from app.api.settings import router as settings_router
from app.api.manufacturing import router as manufacturing_router
from app.api.workspace import router as workspace_router
from app.api.remote_provider import router as remote_provider_router
from app.api.provider_oauth import router as provider_oauth_router
from app.api.catalog_admin import router as catalog_admin_router
from app.api.oauth import router as oauth_router
from app.api.service_clients import router as service_clients_router
from app.api.jobs import router as jobs_router
from app.api.health import router as health_router
from app.services import rate_limit_service, session_store_service
from app.services.comments_store_service import initialize_comments_store
from app.services.component_catalog_service import catalog_service
from app.services.postgres_database import database
from app.services.workspace_service import workspace
from app.services.job_service import jobs
from app.core.config import settings
from app.core.security_headers import apply_security_headers
import os
import sys
from pathlib import Path
from contextlib import asynccontextmanager

import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
KNOWN_GIT_HOSTS = ("github.com", "gitlab.com")

def configure_git():
    """Report how GITHUB_TOKEN will be used, without writing it anywhere.

    This used to run ``git config --global url.https://<token>@github.com/…``,
    which left the token in cleartext in the container's ``~/.gitconfig``. The
    rewrite now travels in the environment of each Git invocation instead; see
    ``project_import_service._inject_github_token``.
    """
    if settings.GITHUB_TOKEN:
        logger.info("GITHUB_TOKEN is set; HTTPS GitHub remotes will use it per invocation.")

def scan_known_hosts():
    """Pin the hosted forges' SSH host keys, verifying them before trusting.

    This used to run a bare `ssh-keyscan` and append whatever came back, which
    trusts the network the scan ran over. The scan is now checked against the
    fingerprints GitHub and GitLab publish out of band, and a host that does not
    match is left untrusted for an administrator to look at.
    """
    from app.services.git_access_service import bootstrap_known_hosts, warn_if_openssh_missing

    warn_if_openssh_missing("The Prism API")
    try:
        outcomes = bootstrap_known_hosts()
    except Exception as error:  # never block startup on host key bootstrapping
        logger.error("Could not bootstrap known_hosts: %s", error)
        return
    for host, outcome in outcomes.items():
        if outcome == "pinned":
            logger.info("Pinned verified SSH host key for %s.", host)
        elif outcome == "already-trusted":
            logger.debug("Host %s already pinned.", host)
        else:
            logger.warning("Did not pin %s: %s", host, outcome)


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

RULE = "=" * 74


def verify_auth_configuration_or_exit() -> None:
    """Stop before the server exists rather than deep inside ASGI startup.

    Running this at import keeps a configuration mistake readable: whoever is
    deploying Prism sees a short list of what to fix, not sixty frames of nested
    lifespan traceback with the real message buried at the bottom.
    """
    errors = settings.auth_configuration_errors()
    if not errors:
        return

    report = [
        "",
        RULE,
        "  KiCAD Prism did not start: unsafe authentication configuration",
        RULE,
        "",
        "  Refusing to serve requests, because starting anyway would expose every",
        "  project in this workspace without a login.",
        "",
    ]
    report += [f"    x  {error}" for error in errors]
    report += [
        "",
        "  Set these in your .env file, then start again:",
        "",
        "      docker compose up -d backend",
        "",
        "  Configuration guide:  docs/AUTHENTICATION_AND_ACCESS.md",
        "  Generate a secret:    openssl rand -base64 48",
        "",
        "  To run a local instance with no authentication at all, set",
        "  AUTH_ENABLED=false. Never do this on a shared or reachable host.",
        RULE,
        "",
    ]
    print("\n".join(report), file=sys.stderr, flush=True)
    raise SystemExit(3)


def announce_auth_posture() -> None:
    if settings.AUTH_ENABLED:
        logger.info(
            "Authentication enabled. Issuer=%s cookie_secure=%s session_ttl=%sh",
            settings.EFFECTIVE_OIDC_ISSUER_URL,
            settings.SESSION_COOKIE_SECURE,
            settings.SESSION_TTL_HOURS,
        )
        return

    logger.warning(
        "\n%s\n  AUTHENTICATION IS DISABLED (AUTH_ENABLED=false).\n"
        "  Every request is served as the built-in guest user with the '%s' role.\n"
        "  Never expose this deployment beyond a trusted development machine.\n%s",
        RULE,
        settings.DEV_GUEST_ROLE,
        RULE,
    )


def announce_configuration_warnings() -> None:
    """Log what is permitted but dangerous, so it is at least on the record."""
    for warning in settings.configuration_warnings():
        logger.warning("Configuration: %s", warning)


verify_auth_configuration_or_exit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    announce_auth_posture()
    announce_configuration_warnings()
    configure_git()
    ensure_ssh_dir()
    initialize_comments_store()
    catalog_service.initialize()
    workspace.initialize()
    jobs.initialize()
    if settings.AUTH_ENABLED:
        session_store_service.initialize_session_store()
        session_store_service.prune_expired_sessions()
        rate_limit_service.initialize_rate_limit_store()
    try:
        yield
    finally:
        catalog_service.close()
        database.close()

app = FastAPI(title="KiCAD Prism API", lifespan=lifespan)


app.middleware("http")(apply_security_headers)


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
app.include_router(design_compare_router, prefix="/api/projects", tags=["design-compare"])
app.include_router(release_studio_router, prefix="/api/projects", tags=["release-studio"])
app.include_router(settings_router, prefix="/api/settings", tags=["settings"])
app.include_router(manufacturing_router, prefix="/api/manufacturing", tags=["manufacturing"])
app.include_router(folders_router, prefix="/api/folders", tags=["folders"])
app.include_router(workspace_router, prefix="/api/workspace", tags=["workspace"])
app.include_router(jobs_router, prefix="/api/jobs", tags=["jobs"])
app.include_router(health_router)
app.include_router(catalog_admin_router)
app.include_router(oauth_router)
app.include_router(service_clients_router)
app.include_router(remote_provider_router, tags=["remote-provider"])
app.include_router(provider_oauth_router, tags=["provider-oauth"])
