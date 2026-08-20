"""
Application configuration with environment variable support.

Configuration can be set via:
1. Environment variables
2. .env file in the backend directory

See .env.example for available configuration options.
"""
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings
from typing import List
import os


# Placeholders that appear in this repository's examples and in copy-pasted guides.
# None of them may sign a real session.
_WEAK_SESSION_SECRETS = {
    "change-me",
    "changeme",
    "secret",
    "kicad-prism",
    "kicad-prism-local",
    "your-session-secret",
    "replace-with-a-long-random-string",
}


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # ===========================================
    # OIDC / OAuth Configuration
    # ===========================================
    OIDC_ISSUER_URL: str = Field(
        default="",
        description="OIDC issuer URL used for human SSO login."
    )

    OIDC_CLIENT_ID: str = Field(
        default="",
        description="OIDC client ID used by the Prism browser application."
    )

    OIDC_CLIENT_SECRET: str = Field(
        default="",
        description="OIDC client secret used for authorization code exchange."
    )

    OIDC_SCOPES: str = Field(
        default="openid profile email",
        description="Space-separated OIDC scopes requested for human login."
    )

    OIDC_EMAIL_CLAIM: str = Field(
        default="email",
        description="OIDC userinfo/id-token claim used as the Prism user email."
    )

    OIDC_NAME_CLAIM: str = Field(
        default="name",
        description="OIDC userinfo/id-token claim used as the display name."
    )

    OIDC_PICTURE_CLAIM: str = Field(
        default="picture",
        description="OIDC userinfo/id-token claim used as the avatar URL."
    )

    OIDC_PROVIDER_NAME: str = Field(
        default="",
        description="Human-readable OIDC provider name shown on the login page."
    )

    OIDC_TOKEN_AUTH_METHOD: str = Field(
        default="client_secret_post",
        description="OIDC token endpoint client authentication method: client_secret_post or client_secret_basic."
    )

    OAUTH_SERVICE_TOKEN_TTL_SECONDS: int = Field(
        default=3600,
        ge=300,
        le=86400,
        description="Lifetime for locally issued machine-to-machine OAuth2 access tokens."
    )

    OAUTH_EXTERNAL_JWT_ISSUER_URL: str = Field(
        default="",
        description="Optional external OAuth2/OIDC issuer whose bearer JWTs Prism should accept for API access."
    )

    OAUTH_EXTERNAL_JWT_AUDIENCE: str = Field(
        default="",
        description="Expected audience for externally issued API bearer JWTs."
    )

    OAUTH_EXTERNAL_JWT_ROLE_CLAIM: str = Field(
        default="prism_role",
        description="Claim used to map externally issued API JWTs to Prism roles."
    )

    OAUTH_EXTERNAL_JWT_SCOPES_CLAIM: str = Field(
        default="scope",
        description="Claim used to read OAuth scopes from externally issued API JWTs."
    )

    OAUTH_EXTERNAL_JWT_CLIENT_ID_CLAIM: str = Field(
        default="client_id",
        description="Claim used to identify an external machine client."
    )

    # ===========================================
    # Authentication & Access Control
    # ===========================================
    WORKSPACE_NAME: str = Field(
        default="KiCAD Prism",
        description="Display name shown to users when signing into this workspace."
    )

    # Explicitly enable/disable authentication.
    # Effective auth still requires OIDC credentials and DEV_MODE=false.
    AUTH_ENABLED_OVERRIDE: bool = Field(
        default=True,
        alias="AUTH_ENABLED",
        description="Explicitly enable/disable authentication."
    )
    
    # Comma-separated list of allowed user emails
    ALLOWED_USERS_STR: str = Field(
        default="",
        description="Comma-separated list of allowed user emails"
    )

    # Comma-separated list of allowed email domains (legacy compatibility).
    ALLOWED_DOMAINS_STR: str = Field(
        default="",
        description="Comma-separated list of allowed email domains"
    )

    # Comma-separated list of bootstrap admin user emails.
    BOOTSTRAP_ADMIN_USERS_STR: str = Field(
        default="",
        description="Comma-separated list of admin user emails provisioned from env"
    )

    BOOTSTRAP_ADMIN_PASSWORD: str = Field(
        default="",
        description=(
            "One-time password seeded for BOOTSTRAP_ADMIN_USERS on first startup "
            "when password auth is enabled. The admin must change it on first "
            "sign-in. Leave empty once real accounts exist."
        ),
    )

    # Comma-separated list of email domains that receive implicit viewer access.
    DEFAULT_VIEWER_DOMAINS_STR: str = Field(
        default="",
        description=(
            "Comma-separated list of email domains that get viewer access when no "
            "explicit RBAC assignment exists"
        ),
    )

    # Session signing secret for HttpOnly cookie authentication.
    SESSION_SECRET: str = Field(
        default="",
        description="HMAC secret used to sign session cookies"
    )

    # Session TTL in hours.
    SESSION_TTL_HOURS: int = Field(
        default=12,
        ge=1,
        le=168,
        description="Session expiration (hours)"
    )

    # Idle timeout. A session unused for this long is revoked even before TTL.
    SESSION_IDLE_TIMEOUT_MINUTES: int = Field(
        default=0,
        ge=0,
        le=10080,
        description="Revoke a session after this many minutes without use. 0 disables idle expiry."
    )

    # Cookie secure flag. Left unset, Prism derives it from PUBLIC_BASE_URL.
    SESSION_COOKIE_SECURE_OVERRIDE: bool | None = Field(
        default=None,
        alias="SESSION_COOKIE_SECURE",
        description=(
            "Force the session cookie Secure flag. When unset, Prism marks the cookie Secure "
            "for any deployment whose PUBLIC_BASE_URL is HTTPS."
        ),
    )

    @field_validator("SESSION_COOKIE_SECURE_OVERRIDE", mode="before")
    @classmethod
    def _blank_cookie_secure_is_unset(cls, value: object) -> object:
        """Treat an empty value as unset so the PUBLIC_BASE_URL default applies.

        docker-compose.yml passes `SESSION_COOKIE_SECURE=${SESSION_COOKIE_SECURE:-}`,
        so an operator who follows .env.example and leaves the setting commented out
        still gets the variable in the container environment, as "". Without this,
        pydantic rejects "" as a bool and the backend cannot start at all.
        """
        if isinstance(value, str) and not value.strip():
            return None
        return value

    AUTH_LOGIN_RATE_LIMIT: int = Field(
        default=10,
        ge=1,
        le=1000,
        description="Maximum authentication attempts per client per window."
    )

    AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS: int = Field(
        default=300,
        ge=10,
        le=3600,
        description="Sliding window for authentication attempt rate limiting."
    )

    PASSWORD_AUTH_ENABLED: bool = Field(
        default=False,
        description="Enable local email/password login in addition to (or instead of) OIDC."
    )

    PASSWORD_MIN_LENGTH: int = Field(
        default=12,
        ge=8,
        le=72,
        description="Minimum length for a local password (bcrypt truncates at 72 bytes)."
    )

    SESSION_REMEMBER_ME_DAYS: int = Field(
        default=30,
        ge=1,
        le=365,
        description="Lifetime (days) of a remember-me session."
    )

    # Comma-separated browser origins allowed to make credentialed API requests.
    CORS_ORIGINS_STR: str = Field(
        default="http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:8080,http://localhost:8080",
        description="Comma-separated list of allowed CORS origins. Do not use '*' with credentials.",
    )
    
    # ===========================================
    # Development Settings
    # ===========================================
    DEV_MODE: bool = Field(
        default=True,
        description=(
            "Enable development affordances (verbose errors, the login page's local bypass "
            "hint). This flag no longer disables authentication on its own; set AUTH_ENABLED=false "
            "for that, which is an explicit and loudly logged choice."
        )
    )

    DEV_GUEST_ROLE: str = Field(
        default="viewer",
        description=(
            "Role granted to the implicit guest user when AUTH_ENABLED is false. Defaults to "
            "the least privilege that still lets an evaluator look around: a misconfigured "
            "deployment then exposes reading, not administration. Raise it deliberately."
        ),
    )
    
    # ===========================================
    # Git & GitHub Integration
    # ===========================================
    GITHUB_TOKEN: str = Field(
        default="",
        description=(
            "GitHub token for HTTPS clone and Release publishing. "
            "Publishing a Release Studio zip needs contents:write, not clone-only."
        ),
    )
    GITLAB_TOKEN: str = Field(
        default="",
        description=(
            "GitLab token for Release publishing. Creating a Release needs api scope; "
            "the workspace SSH key can clone but cannot publish."
        ),
    )

    COMMENTS_API_BASE_URL: str = Field(
        default="",
        description=(
            "Default base URL used to generate KiCad comments REST URLs "
            "for project import and visualizer helpers. "
            "If empty, URL helpers derive host from PUBLIC_BASE_URL or the incoming request."
        ),
    )

    PUBLIC_BASE_URL: str = Field(
        default="",
        description=(
            "Canonical public origin for absolute URLs (Remote Symbols metadata, OAuth, "
            "and other request-derived links) when Prism sits behind a reverse proxy. "
            "Example: https://prism.example.com. If empty, helpers use forwarded headers "
            "or request.base_url."
        ),
    )

    REMOTE_PROVIDER_LIBRARY_PREFIX: str = Field(
        default="remote",
        description="Library prefix assumed by the Prism remote-symbol provider when rewriting footprint links."
    )

    REMOTE_PROVIDER_DESTINATION_DIR: str = Field(
        default="${KIPRJMOD}/RemoteLibrary",
        description="Destination directory assumed by the Prism remote-symbol provider when rewriting model paths."
    )

    REMOTE_PROVIDER_OAUTH_CLIENT_ID: str = Field(
        default="kicad-prism-kicad",
        description="Public OAuth client_id advertised to KiCad for the remote provider."
    )

    REMOTE_PROVIDER_ACCESS_TOKEN_TTL_SECONDS: int = Field(
        default=3600,
        ge=300,
        le=86400,
        description="Lifetime for KiCad remote provider access tokens."
    )

    REMOTE_PROVIDER_REFRESH_TOKEN_TTL_SECONDS: int = Field(
        default=604800,
        ge=3600,
        le=2592000,
        description="Lifetime for KiCad remote provider refresh tokens."
    )

    # The MANUFACTURO_SQL_* settings were removed. Nothing under app/ ever read
    # them, so they were a set of credential fields that asked operators to put
    # a database password in .env for a feature that did not exist. Reintroduce
    # them with the code that uses them.

    PRISM_DATABASE_URL: str = Field(
        default="",
        description=(
            "Authoritative PostgreSQL URL for workspace, comments, catalog, jobs, "
            "and artifact metadata."
        ),
    )

    PRISM_DATABASE_POOL_MIN_SIZE: int = Field(
        default=1,
        ge=0,
        le=20,
        description="Minimum PostgreSQL connections retained per backend worker.",
    )

    PRISM_DATABASE_POOL_MAX_SIZE: int = Field(
        default=10,
        ge=1,
        le=100,
        description="Maximum PostgreSQL connections retained per backend worker.",
    )

    # The three settings below matter when PostgreSQL is not on the same host.
    # A NAT gateway, cloud load balancer or firewall will silently drop an idle
    # connection, and neither end finds out until a query is attempted on it.
    # Anything set explicitly in PRISM_DATABASE_URL wins over these.

    PRISM_DATABASE_CONNECT_TIMEOUT_SECONDS: int = Field(
        default=10,
        ge=1,
        le=120,
        description=(
            "How long to wait for a new PostgreSQL connection before giving up. "
            "Without this a request hangs indefinitely when the database host is "
            "unreachable rather than merely slow."
        ),
    )

    PRISM_DATABASE_KEEPALIVE_IDLE_SECONDS: int = Field(
        default=30,
        ge=1,
        le=3600,
        description=(
            "Idle time before TCP keepalive probes start on a PostgreSQL "
            "connection. Keep this below the idle timeout of any NAT or load "
            "balancer between Prism and the database."
        ),
    )

    PRISM_DATABASE_POOL_MAX_LIFETIME_SECONDS: int = Field(
        default=1800,
        ge=60,
        le=86400,
        description=(
            "Age at which a pooled PostgreSQL connection is retired and replaced. "
            "Bounds how long a connection can survive a server-side restart or a "
            "load balancer rotating backends underneath it."
        ),
    )

    CATALOG_WORKER_CONCURRENCY: int = Field(
        default=2,
        ge=1,
        le=8,
        description="Maximum catalog jobs executed concurrently by the local worker.",
    )

    CATALOG_KICAD_CONCURRENCY: int = Field(
        default=1,
        ge=1,
        le=8,
        description="Global fenced slot count for KiCad-heavy catalog jobs.",
    )

    CATALOG_WORKER_POLL_SECONDS: float = Field(
        default=1.0,
        ge=0.1,
        le=30.0,
        description="PostgreSQL catalog job polling interval.",
    )

    CATALOG_JOB_LEASE_SECONDS: int = Field(
        default=120,
        ge=30,
        le=3600,
        description="Duration of a catalog worker lease before an abandoned job is reclaimable.",
    )

    PRISM_WORKER_CONCURRENCY: int = Field(
        default=4,
        ge=1,
        le=16,
        description="Maximum number of supervised user jobs run by prism-worker.",
    )

    PRISM_WORKER_POLL_SECONDS: float = Field(
        default=0.5,
        ge=0.1,
        le=30.0,
        description="PostgreSQL queue polling interval for prism-worker.",
    )

    PRISM_JOB_LEASE_SECONDS: int = Field(
        default=30,
        ge=10,
        le=3600,
        description="Duration of a fenced Prism worker lease.",
    )

    PRISM_JOB_HEARTBEAT_SECONDS: float = Field(
        default=10.0,
        ge=1.0,
        le=300.0,
        description="Lease-renewal interval for supervised Prism jobs.",
    )

    PRISM_JOB_CANCEL_GRACE_SECONDS: float = Field(
        default=10.0,
        ge=0.0,
        le=120.0,
        description="Grace period before a cancelled job process group is killed.",
    )

    PRISM_JOB_ARTIFACT_ROOT: str = Field(
        default="",
        description=(
            "Root for immutable V3 job artifacts and attempt logs. Defaults to "
            "KICAD_PROJECTS_ROOT/.kicad-prism."
        ),
    )

    PRISM_WEBGPU_CONCURRENCY: int = Field(default=1, ge=1, le=8)
    PRISM_DESIGN_COMPARE_CONCURRENCY: int = Field(default=1, ge=1, le=8)
    PRISM_WORKFLOW_CONCURRENCY: int = Field(default=1, ge=1, le=8)
    PRISM_IMPORT_CONCURRENCY: int = Field(default=1, ge=1, le=8)
    PRISM_SEMANTIC_COMPILE_SLOTS: int = Field(default=2, ge=1, le=8)

    CATALOG_ARTIFACT_ROOT: str = Field(
        default="",
        description=(
            "Local content-addressed artifact root. Defaults to "
            "KICAD_PROJECTS_ROOT/.kicad-prism/artifacts."
        ),
    )

    CATALOG_RETENTION_ENABLED: bool = Field(
        default=True,
        description="Run the local archive/quarantine/GC policy once per day.",
    )

    CATALOG_IMPORT_ROOTS: str = Field(
        default="",
        description=(
            "Comma-separated name=/absolute/read-only/path entries exposed as folder "
            "snapshot sources in the Import Center."
        ),
    )

    CATALOG_IMPORT_MAX_FILES: int = Field(
        default=100000,
        ge=1,
        le=1000000,
        description="Maximum files in one immutable folder snapshot.",
    )

    CATALOG_IMPORT_MAX_FILE_BYTES: int = Field(
        default=2 * 1024 * 1024 * 1024,
        ge=1024,
        description="Maximum size of one folder snapshot file.",
    )

    CATALOG_IMPORT_MAX_SNAPSHOT_BYTES: int = Field(
        default=200 * 1024 * 1024 * 1024,
        ge=1024,
        description="Maximum aggregate size of one folder snapshot.",
    )

    CATALOG_DBL_EXPORT_DIR: str = Field(
        default="",
        description=(
            "Output directory for generated KiCad DBL bundles. Defaults under "
            "KICAD_PROJECTS_ROOT/.kicad-prism/exports/kicad-dbl."
        ),
    )

    CATALOG_KLC_ENABLED: bool = Field(
        default=False,
        description="Enable optional KiCad Library Convention validation for catalog assets.",
    )

    CATALOG_KLC_UTILS_PATH: str = Field(
        default="/opt/kicad-library-utils",
        description="Path to a kicad-library-utils checkout containing klc-check scripts.",
    )

    CATALOG_KLC_RELEASE_GATE: str = Field(
        default="warn",
        description="KLC release gate policy: off, warn, or block.",
    )

    CATALOG_KLC_TIMEOUT_SECONDS: int = Field(
        default=30,
        ge=5,
        le=600,
        description="Timeout for one KLC checker invocation.",
    )

    CATALOG_KLC_SYMBOL_RULES: str = Field(
        default="",
        description="Optional comma-separated symbol KLC rules to run.",
    )

    CATALOG_KLC_SYMBOL_EXCLUDE_RULES: str = Field(
        default="",
        description="Optional comma-separated symbol KLC rules to exclude.",
    )

    CATALOG_KLC_FOOTPRINT_RULES: str = Field(
        default="",
        description="Optional comma-separated footprint KLC rules to run.",
    )

    CATALOG_KLC_FOOTPRINT_EXCLUDE_RULES: str = Field(
        default="",
        description="Optional comma-separated footprint KLC rules to exclude.",
    )

    CATALOG_KLC_FOOTPRINT_LIB_DIR: str = Field(
        default="",
        description="Optional footprint library root passed to symbol KLC checks.",
    )

    GIT_SCAN_KNOWN_HOSTS_ON_STARTUP: bool = Field(
        default=False,
        description="Run ssh-keyscan for common Git hosts during backend startup.",
    )

    # Comma-separated list of Git hosts projects may be imported from.
    # Empty means any host, which suits a single-operator deployment.
    IMPORT_ALLOWED_HOSTS_STR: str = Field(
        default="",
        description="Comma-separated list of Git hosts allowed for project import",
    )

    # Plaintext HTTP clone URLs, for an internal Git server that has no TLS.
    IMPORT_ALLOW_INSECURE_HTTP: bool = Field(
        default=False,
        description="Allow http:// repository URLs during project import",
    )

    # ===========================================
    # Computed Properties
    # ===========================================
    @property
    def ALLOWED_USERS(self) -> List[str]:
        """Parse allowed emails from comma-separated string."""
        return [u.strip().lower() for u in self.ALLOWED_USERS_STR.split(",") if u.strip()]

    @property
    def ALLOWED_DOMAINS(self) -> List[str]:
        """Parse allowed domains from comma-separated string."""
        return [d.strip().lower() for d in self.ALLOWED_DOMAINS_STR.split(",") if d.strip()]

    @property
    def IMPORT_ALLOWED_HOSTS(self) -> List[str]:
        """Parse allowed import hosts from comma-separated string."""
        return [h.strip().lower() for h in self.IMPORT_ALLOWED_HOSTS_STR.split(",") if h.strip()]

    @property
    def BOOTSTRAP_ADMIN_USERS(self) -> List[str]:
        """Parse bootstrap admin emails from comma-separated string."""
        return [u.strip().lower() for u in self.BOOTSTRAP_ADMIN_USERS_STR.split(",") if u.strip()]

    @property
    def DEFAULT_VIEWER_DOMAINS(self) -> List[str]:
        """Parse implicit viewer domains from comma-separated string."""
        return [d.strip().lower() for d in self.DEFAULT_VIEWER_DOMAINS_STR.split(",") if d.strip()]

    @property
    def CORS_ORIGINS(self) -> List[str]:
        """Parse credentialed CORS origins from comma-separated string."""
        return [origin.strip().rstrip("/") for origin in self.CORS_ORIGINS_STR.split(",") if origin.strip()]

    @property
    def EFFECTIVE_OIDC_ISSUER_URL(self) -> str:
        return self.OIDC_ISSUER_URL.strip().rstrip("/")

    @property
    def EFFECTIVE_OIDC_CLIENT_ID(self) -> str:
        return self.OIDC_CLIENT_ID.strip()

    @property
    def EFFECTIVE_OIDC_CLIENT_SECRET(self) -> str:
        return self.OIDC_CLIENT_SECRET.strip()

    @property
    def EFFECTIVE_OIDC_SCOPES(self) -> str:
        return self.OIDC_SCOPES.strip() or "openid profile email"

    @property
    def OIDC_FULLY_CONFIGURED(self) -> bool:
        """All three OIDC values are present, so OIDC is a usable login method."""
        return bool(
            self.EFFECTIVE_OIDC_ISSUER_URL
            and self.EFFECTIVE_OIDC_CLIENT_ID
            and self.EFFECTIVE_OIDC_CLIENT_SECRET
        )

    @property
    def OIDC_PARTIALLY_CONFIGURED(self) -> bool:
        """Some but not all OIDC values are present: a misconfiguration to flag."""
        present = [
            bool(self.EFFECTIVE_OIDC_ISSUER_URL),
            bool(self.EFFECTIVE_OIDC_CLIENT_ID),
            bool(self.EFFECTIVE_OIDC_CLIENT_SECRET),
        ]
        return any(present) and not all(present)

    @property
    def KICAD_PROJECTS_ROOT(self) -> str:
        return os.environ.get(
            "KICAD_PROJECTS_ROOT",
            os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../data/projects")),
        )

    @property
    def AUTH_ENABLED(self) -> bool:
        """
        Authentication follows the AUTH_ENABLED env var and nothing else.

        Incomplete OIDC configuration used to silently disable authentication, which
        turned any misconfiguration into an unauthenticated admin console. Prism now
        refuses to start in that state instead - see validate_auth_configuration().
        """
        return self.AUTH_ENABLED_OVERRIDE

    @property
    def SESSION_COOKIE_SECURE(self) -> bool:
        """Mark the session cookie Secure unless an operator explicitly opts out."""
        if self.SESSION_COOKIE_SECURE_OVERRIDE is not None:
            return self.SESSION_COOKIE_SECURE_OVERRIDE
        return self.PUBLIC_BASE_URL.strip().lower().startswith("https://")

    @property
    def BASE_URL_IS_LOCAL(self) -> bool:
        """Whether PUBLIC_BASE_URL points at this machine only.

        Used to tell an evaluation apart from something other people can reach.

        Unset counts as local. It is the default, so it means nobody has said
        where this deployment is published -- which describes a developer's
        checkout, not a shared instance. Anything reachable has to set it
        anyway, for OIDC redirects, CORS and the Secure cookie. A malformed
        value is a different matter and counts as remote, so it fails safe.
        """
        from urllib.parse import urlsplit

        raw = self.PUBLIC_BASE_URL.strip()
        if not raw:
            return True
        try:
            host = (urlsplit(raw).hostname or "").lower()
        except ValueError:
            return False
        return host in {"localhost", "127.0.0.1", "::1", "0.0.0.0"} or host.endswith(".localhost")

    def _open_auth_errors(self) -> List[str]:
        """Reasons an unauthenticated deployment must refuse to start.

        AUTH_ENABLED=false exists so somebody can evaluate Prism without
        standing up an identity provider first, and the plain-HTTP scheme in the
        installer depends on it. Evaluation means localhost. A deployment shaped
        like production -- TLS, a name other machines resolve -- is not an
        evaluation, and starting it open publishes every project and the whole
        API to anyone who can reach the port.
        """
        if self.BASE_URL_IS_LOCAL:
            return []

        base = self.PUBLIC_BASE_URL.strip()
        errors: List[str] = []
        if base.lower().startswith("https://"):
            errors.append(
                f"AUTH_ENABLED=false is not allowed with PUBLIC_BASE_URL={base}. A TLS "
                "deployment on a routable name is not a local evaluation. Enable "
                "authentication, or evaluate over http on localhost."
            )
        if self.DEV_GUEST_ROLE.strip().lower() == "admin":
            errors.append(
                f"DEV_GUEST_ROLE=admin with AUTH_ENABLED=false and PUBLIC_BASE_URL={base} "
                "gives every visitor administrative access to this workspace. Use "
                "DEV_GUEST_ROLE=viewer, or enable authentication."
            )
        return errors

    def configuration_warnings(self) -> List[str]:
        """Things that are permitted, dangerous, and easy to have not noticed."""
        warnings: List[str] = []

        if not self.AUTH_ENABLED:
            warnings.append(
                f"AUTH_ENABLED=false: every request is treated as a {self.DEV_GUEST_ROLE!r} "
                "guest and no login is required. Evaluation only."
            )

        if not self.IMPORT_ALLOWED_HOSTS:
            warnings.append(
                "IMPORT_ALLOWED_HOSTS_STR is empty, so project import will clone from any "
                "host a user names -- including addresses inside this network that the "
                "browser cannot reach but the server can. Set it to the Git hosts this "
                "installation is meant to reach."
            )

        if self.BOOTSTRAP_ADMIN_PASSWORD.strip():
            warnings.append(
                "BOOTSTRAP_ADMIN_PASSWORD is set. It seeds a one-time admin password "
                "for first login; clear it once the admin has signed in and set a real "
                "password, so a bootstrap secret is not left in the environment."
            )

        return warnings

    def auth_configuration_errors(self) -> List[str]:
        """Return every reason this deployment must not serve authenticated traffic."""
        if not self.AUTH_ENABLED:
            return self._open_auth_errors()

        errors: List[str] = []
        if not self.OIDC_FULLY_CONFIGURED and not self.PASSWORD_AUTH_ENABLED:
            errors.append(
                "AUTH_ENABLED=true requires a login method: configure OIDC "
                "(OIDC_ISSUER_URL, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET) or set "
                "PASSWORD_AUTH_ENABLED=true."
            )

        if self.OIDC_PARTIALLY_CONFIGURED:
            if not self.EFFECTIVE_OIDC_ISSUER_URL:
                errors.append("OIDC_ISSUER_URL is required to enable OIDC")
            if not self.EFFECTIVE_OIDC_CLIENT_ID:
                errors.append("OIDC_CLIENT_ID is required to enable OIDC")
            if not self.EFFECTIVE_OIDC_CLIENT_SECRET:
                errors.append("OIDC_CLIENT_SECRET is required to enable OIDC")

        if self.EFFECTIVE_OIDC_ISSUER_URL and not self.EFFECTIVE_OIDC_ISSUER_URL.startswith("https://"):
            errors.append("OIDC_ISSUER_URL must use https://")
        if self.OIDC_FULLY_CONFIGURED and self.OIDC_TOKEN_AUTH_METHOD.strip().lower() not in {
            "client_secret_post",
            "client_secret_basic",
        }:
            errors.append("OIDC_TOKEN_AUTH_METHOD must be client_secret_post or client_secret_basic")

        secret = self.SESSION_SECRET.strip()
        if not secret:
            errors.append("SESSION_SECRET is required when AUTH_ENABLED=true")
        elif len(secret) < 32:
            errors.append("SESSION_SECRET must be at least 32 characters")
        elif len(set(secret)) < 8:
            errors.append("SESSION_SECRET is not sufficiently random")
        elif secret.lower() in _WEAK_SESSION_SECRETS:
            errors.append("SESSION_SECRET is a well-known placeholder value")

        if not self.PRISM_DATABASE_URL.strip():
            errors.append("PRISM_DATABASE_URL is required to store revocable sessions")

        if self.OAUTH_EXTERNAL_JWT_ISSUER_URL.strip() and not self.OAUTH_EXTERNAL_JWT_AUDIENCE.strip():
            errors.append(
                "OAUTH_EXTERNAL_JWT_AUDIENCE is required whenever OAUTH_EXTERNAL_JWT_ISSUER_URL is set; "
                "without it Prism would accept any token that issuer minted for any audience"
            )

        for origin in self.CORS_ORIGINS:
            if origin == "*":
                errors.append("CORS_ORIGINS_STR must not contain '*' because Prism sends credentials")

        return errors

    def validate_auth_configuration(self) -> None:
        """Fail closed at startup rather than serving an unauthenticated admin console."""
        errors = self.auth_configuration_errors()
        if errors:
            raise RuntimeError(
                "Refusing to start with an unsafe authentication configuration:\n  - "
                + "\n  - ".join(errors)
            )


    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        # Allow extra fields to be ignored
        extra = "ignore"


# Global settings instance
settings = Settings()
