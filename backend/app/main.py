from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from app.core.errors import install_error_handlers
from app.core.gzip_config import (
    GZIP_COMPRESS_LEVEL,
    GZIP_EXCLUDED_CONTENT_TYPES,
    GZIP_MINIMUM_SIZE,
)
from app.api.auth import router as auth_router
from app.api.personal_tokens import router as personal_tokens_router
from app.api.mcp_clients_settings import router as mcp_clients_settings_router
from app.api.mcp_oauth import router as mcp_oauth_router
from app.api.mcp_settings import admin_router as mcp_audit_router
from app.api.mcp_settings import router as mcp_settings_router
from app.api.webhook_settings import router as webhook_settings_router
from app.api.ops import router as ops_router
from app.api.ops_jobs import router as ops_jobs_router
from app.api.ops_runtime import router as ops_runtime_router
from app.api.ops_profiles import router as ops_profiles_router
from app.api.ops_requests import router as ops_requests_router
from app.api.ops_actions import router as ops_actions_router
from app.api.mcp import router as mcp_router
from app.api.fabrication_view import router as fabrication_view_router
from app.api.projects import router as projects_router
from app.api.project_bom import router as project_bom_router
from app.api.project_semantic_index import router as project_semantic_index_router
from app.api.project_viewer_3d import router as project_viewer_3d_router
from app.api.project_properties import router as project_properties_router
from app.api.project_viewer_sources import router as project_viewer_sources_router
from app.api.project_variants import router as project_variants_router
from app.api.project_design_query import router as project_design_query_router
from app.api.project_renders import router as project_renders_router
from app.api.project_catalog_usage import router as project_catalog_usage_router
from app.api.project_import_followups import router as project_import_followups_router
from app.api.design_bundles import router as design_bundles_router
from app.api.comments import router as comments_router
from app.api.comments_anchored import router as comments_anchored_router
from app.api.comment_attachment_links import router as comment_attachment_links_router
from app.api.comment_live import router as comment_live_router
from app.api.design_compare import router as design_compare_router
from app.api.design_compare_review import router as design_compare_review_router
from app.api.release_studio import router as release_studio_router
from app.api.sim_studio import router as sim_studio_router
from app.api.extensions import router as extensions_router
from app.api.folders import router as folders_router
from app.api.settings import router as settings_router
from app.api.workspace import router as workspace_router
from app.api.remote_provider import router as remote_provider_router
from app.api.provider_oauth import router as provider_oauth_router
from app.api.tracker_connectors import router as tracker_connectors_router
from app.api.project_trackers import router as project_trackers_router
from app.api.tracker_sync import router as tracker_sync_router
from app.api.tracker_webhooks import router as tracker_webhooks_router
from app.api.tracker_identity import admin_router as tracker_identity_admin_router
from app.api.tracker_identity import router as tracker_identity_router
from app.api.catalog_admin import router as catalog_admin_router
from app.api.catalog_part_relations import router as catalog_part_relations_router
from app.api.catalog_drafting import router as catalog_drafting_router
from app.api.oauth import router as oauth_router
from app.api.service_clients import router as service_clients_router
from app.api.jobs import router as jobs_router
from app.api.events import router as events_router
from app.api.events_live import router as events_live_router
from app.api.health import router as health_router
from app.api.plugin import router as plugin_router
from app.api.git_http import router as git_http_router
from app.api.agent import router as agent_router
from app.services import idempotency_store, password_credential_service, session_store_service
from app.services.design_bundle.errors import install_handlers as install_design_data_handlers
from app.services.schema_head import bring_every_schema_to_head
from app.services.superseded_store_cleanup import cleanup_superseded_stores
from app.services import event_log
from app.services.mcp import audit as mcp_audit
from app.services.comment_live_broker import broker as comment_live_broker
from app.services.event_live_broker import broker as event_live_broker
from app.services.component_catalog_service import catalog_service
from app.services.postgres_database import database
from app.core.config import settings
from app.core import runtime_logging
from app.services import checkout_line_endings
from app.services.git_credentials import (
    configuration_warnings as git_credential_warnings,
    git_credentials,
    verify_git_credentials_or_exit,
)
from app.core.security_headers import apply_security_headers
import asyncio
import os
import sys
from pathlib import Path
from contextlib import asynccontextmanager

import logging

from app.core.api_version import ApiVersionMiddleware, install_versioned_openapi, operation_id
from app.core.idempotency import IdempotencyMiddleware
from app.core.token_audit import TokenAuditMiddleware
from app.core.request_stats import RequestStatsMiddleware
from urllib.parse import urlsplit

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
KNOWN_GIT_HOSTS = ("github.com", "gitlab.com")

def configure_git():
    """Report which HTTPS Git credentials are in use, without writing them anywhere.

    This used to run ``git config --global url.https://<token>@github.com/…``,
    which left the token in cleartext in the container's ``~/.gitconfig``. The
    rewrites now travel in the environment of each Git invocation instead; see
    ``git_remote_access._inject_git_credentials``.
    """
    for credential in git_credentials():
        logger.info(
            "%s is set; HTTPS remotes under %s will use it per invocation.",
            credential.token_name,
            credential.url_prefix,
        )

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
        "  Configuration guide:  https://krishna-swaroop.github.io/KiCAD-Prism/admin/authentication/",
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
    for warning in [*settings.configuration_warnings(), *git_credential_warnings()]:
        logger.warning("Configuration: %s", warning)


verify_auth_configuration_or_exit()
verify_git_credentials_or_exit("KiCAD Prism")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    announce_auth_posture()
    announce_configuration_warnings()
    configure_git()
    ensure_ssh_dir()
    if sys.platform == "win32":
        # Git for Windows' autocrlf makes a checkout differ from its commit's bytes.
        checkout_line_endings.convert_projects_in_background(Path(settings.KICAD_PROJECTS_ROOT))
    bring_every_schema_to_head()
    runtime_logging.start_poller()
    try:
        await asyncio.to_thread(idempotency_store.sweep_expired)
    except Exception as exc:
        logger.warning("Could not sweep expired idempotency keys: %s", exc)
    try:
        pruned_events = await asyncio.to_thread(event_log.sweep_older_than, settings.PRISM_EVENT_RETENTION_DAYS)
        if pruned_events:
            logger.info("Pruned %s event-log rows past retention.", pruned_events)
    except Exception as exc:
        logger.warning("Could not prune the event log: %s", exc)
    try:
        pruned_audit = await asyncio.to_thread(
            mcp_audit.sweep_older_than, settings.PRISM_MCP_AUDIT_RETENTION_DAYS
        )
        if pruned_audit:
            logger.info("Pruned %s MCP audit rows past retention.", pruned_audit)
    except Exception as exc:
        logger.warning("Could not prune the MCP audit log: %s", exc)
    cleanup_superseded_stores()
    from app.services.ops import stats as ops_stats

    ops_stats.start("api")
    from app.services.trackers.composition import initialize_tracker_composition

    initialize_tracker_composition()
    if settings.AUTH_ENABLED:
        session_store_service.prune_expired_sessions()
        try:
            seeded = password_credential_service.seed_bootstrap_admins()
            if seeded:
                logger.warning(
                    "Seeded a one-time bootstrap password for: %s. They must "
                    "change it on first sign-in; clear BOOTSTRAP_ADMIN_PASSWORD "
                    "afterwards.",
                    ", ".join(seeded),
                )
        except Exception as exc:
            logger.exception("Failed to seed bootstrap admin password: %s", exc)
    if settings.PRISM_COMMENT_LIVE_ENABLED:
        live_origins = [*settings.CORS_ORIGINS, settings.PUBLIC_BASE_URL]
        if not any(
            urlsplit(origin).hostname not in {None, "localhost", "127.0.0.1", "::1"}
            for origin in live_origins if origin
        ):
            logger.warning(
                "Live comments accept only loopback browser origins. Set PUBLIC_BASE_URL "
                "or CORS_ORIGINS_STR to the deployment's exact public origin; "
                "otherwise remote browsers will use delayed HTTP refresh."
            )
        comment_live_broker.start()
    event_live_broker.start()
    try:
        yield
    finally:
        await event_live_broker.stop()
        await comment_live_broker.stop()
        catalog_service.close()
        database.close()

app = FastAPI(
    title="KiCAD Prism API",
    lifespan=lifespan,
    openapi_url="/api/openapi.json",
    generate_unique_id_function=operation_id,
)
install_versioned_openapi(app)
install_error_handlers(app)
install_design_data_handlers(app)


# Compress large responses. Registered before apply_security_headers so it ends
# up innermost, closest to the app: it then sees the real buffered response and
# its minimum_size check applies, instead of receiving an already-wrapped
# streaming body where the check is dead. KiCad source blobs are the heaviest
# thing the app serves (a 9MB .kicad_pcb the comparison viewer fetches once per
# side) and gzip several times over.
app.add_middleware(
    GZipMiddleware,
    minimum_size=GZIP_MINIMUM_SIZE,
    compresslevel=GZIP_COMPRESS_LEVEL,
    exclude_content_types=GZIP_EXCLUDED_CONTENT_TYPES,
)

app.middleware("http")(apply_security_headers)


# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ADR scripting-and-mcp §10 D19: a bearer token's HTTP writes are audited beside
# its MCP reads. Added before the idempotency middleware so it runs inside it: a
# replayed write, which never reaches the route, is not recorded a second time.
# It is also inside the version rewrite, whose scope copy the caller's state is
# written to.
app.add_middleware(TokenAuditMiddleware)

# Inside the version rewrite so it sees /api/... paths. ADR scripting-and-mcp
# §3.4: a repeated write with the same Idempotency-Key returns the first response.
app.add_middleware(IdempotencyMiddleware)

# Outermost: /api/v1/... is rewritten to /api/... before anything else sees it.
app.add_middleware(ApiVersionMiddleware)

# ADR scripting-and-mcp §11 D23–D24: outermost, so the request id and timing
# cover everything the other middleware does.
app.add_middleware(RequestStatsMiddleware)

# Include Routers
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(personal_tokens_router)
app.include_router(mcp_clients_settings_router)
app.include_router(mcp_settings_router)
app.include_router(webhook_settings_router)
app.include_router(ops_router)
app.include_router(ops_jobs_router)
app.include_router(ops_runtime_router)
app.include_router(ops_profiles_router)
app.include_router(ops_requests_router)
app.include_router(ops_actions_router)
app.include_router(mcp_audit_router)
app.include_router(mcp_oauth_router)
app.include_router(mcp_router)
app.include_router(projects_router, prefix="/api/projects", tags=["projects"])
app.include_router(project_bom_router, prefix="/api/projects", tags=["projects"])
app.include_router(project_semantic_index_router, prefix="/api/projects", tags=["projects"])
app.include_router(project_viewer_3d_router, prefix="/api/projects", tags=["projects"])
app.include_router(project_properties_router, prefix="/api/projects", tags=["projects"])
app.include_router(project_viewer_sources_router, prefix="/api/projects", tags=["projects"])
app.include_router(
    project_import_followups_router, prefix="/api/projects", tags=["projects"]
)
app.include_router(comments_router, prefix="/api/projects", tags=["comments"])
app.include_router(comments_anchored_router, prefix="/api/projects", tags=["comments"])
app.include_router(comment_live_router, prefix="/api/projects", tags=["comments-live"])
app.include_router(project_variants_router, prefix="/api/projects", tags=["variants"])
app.include_router(project_design_query_router, prefix="/api/projects", tags=["design-query"])
app.include_router(project_renders_router, prefix="/api/projects", tags=["renders"])
app.include_router(project_catalog_usage_router, prefix="/api/projects", tags=["catalog-usage"])
app.include_router(design_bundles_router)
app.include_router(design_compare_router, prefix="/api/projects", tags=["design-compare"])
app.include_router(design_compare_review_router, prefix="/api/projects", tags=["design-compare"])
app.include_router(release_studio_router, prefix="/api/projects", tags=["release-studio"])
app.include_router(sim_studio_router, prefix="/api", tags=["sim-studio"])
app.include_router(extensions_router, prefix="/api", tags=["extensions"])
app.include_router(fabrication_view_router, prefix="/api/projects", tags=["fabrication-view"])
app.include_router(settings_router, prefix="/api/settings", tags=["settings"])
app.include_router(folders_router, prefix="/api/folders", tags=["folders"])
app.include_router(workspace_router, prefix="/api/workspace", tags=["workspace"])
app.include_router(jobs_router, prefix="/api/jobs", tags=["jobs"])
app.include_router(events_router)
app.include_router(events_live_router)
app.include_router(plugin_router, prefix="/api/plugin", tags=["plugin"])
app.include_router(git_http_router, prefix="/git", tags=["git"])
app.include_router(agent_router)
app.include_router(health_router)
app.include_router(catalog_admin_router)
app.include_router(catalog_part_relations_router)
app.include_router(catalog_drafting_router)
app.include_router(oauth_router)
app.include_router(service_clients_router)
app.include_router(remote_provider_router, tags=["remote-provider"])
app.include_router(provider_oauth_router, tags=["provider-oauth"])
app.include_router(tracker_connectors_router)
app.include_router(tracker_identity_router)
app.include_router(tracker_identity_admin_router)
app.include_router(project_trackers_router)
app.include_router(tracker_sync_router)
app.include_router(tracker_webhooks_router)
app.include_router(comment_attachment_links_router, tags=["comments"])
