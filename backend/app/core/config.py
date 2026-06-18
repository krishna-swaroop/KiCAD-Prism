"""
Application configuration with environment variable support.

Configuration can be set via:
1. Environment variables
2. .env file in the backend directory

See .env.example for available configuration options.
"""

import os

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # ===========================================
    # OIDC / OAuth Configuration
    # ===========================================
    OIDC_ISSUER_URL: str = Field(
        default="", description="OIDC issuer URL used for human SSO login."
    )

    OIDC_CLIENT_ID: str = Field(
        default="", description="OIDC client ID used by the Prism browser application."
    )

    OIDC_CLIENT_SECRET: str = Field(
        default="",
        description="OIDC client secret used for authorization code exchange.",
    )

    OIDC_SCOPES: str = Field(
        default="openid profile email",
        description="Space-separated OIDC scopes requested for human login.",
    )

    OIDC_EMAIL_CLAIM: str = Field(
        default="email",
        description="OIDC userinfo/id-token claim used as the Prism user email.",
    )

    OIDC_NAME_CLAIM: str = Field(
        default="name",
        description="OIDC userinfo/id-token claim used as the display name.",
    )

    OIDC_PICTURE_CLAIM: str = Field(
        default="picture",
        description="OIDC userinfo/id-token claim used as the avatar URL.",
    )

    OIDC_PROVIDER_NAME: str = Field(
        default="",
        description="Human-readable OIDC provider name shown on the login page.",
    )

    OIDC_TOKEN_AUTH_METHOD: str = Field(
        default="client_secret_post",
        description="OIDC token endpoint client authentication method: client_secret_post or client_secret_basic.",
    )

    OAUTH_SERVICE_TOKEN_TTL_SECONDS: int = Field(
        default=3600,
        ge=300,
        le=86400,
        description="Lifetime for locally issued machine-to-machine OAuth2 access tokens.",
    )

    OAUTH_EXTERNAL_JWT_ISSUER_URL: str = Field(
        default="",
        description="Optional external OAuth2/OIDC issuer whose bearer JWTs Prism should accept for API access.",
    )

    OAUTH_EXTERNAL_JWT_AUDIENCE: str = Field(
        default="",
        description="Expected audience for externally issued API bearer JWTs.",
    )

    OAUTH_EXTERNAL_JWT_ROLE_CLAIM: str = Field(
        default="prism_role",
        description="Claim used to map externally issued API JWTs to Prism roles.",
    )

    OAUTH_EXTERNAL_JWT_SCOPES_CLAIM: str = Field(
        default="scope",
        description="Claim used to read OAuth scopes from externally issued API JWTs.",
    )

    OAUTH_EXTERNAL_JWT_CLIENT_ID_CLAIM: str = Field(
        default="client_id",
        description="Claim used to identify an external machine client.",
    )

    # ===========================================
    # Authentication & Access Control
    # ===========================================
    WORKSPACE_NAME: str = Field(
        default="KiCAD Prism",
        description="Display name shown to users when signing into this workspace.",
    )

    # Explicitly enable/disable authentication.
    # Effective auth still requires OIDC credentials and DEV_MODE=false.
    AUTH_ENABLED_OVERRIDE: bool = Field(
        default=True,
        alias="AUTH_ENABLED",
        description="Explicitly enable/disable authentication.",
    )

    # Comma-separated list of allowed user emails
    ALLOWED_USERS_STR: str = Field(
        default="", description="Comma-separated list of allowed user emails"
    )

    # Comma-separated list of allowed email domains (legacy compatibility).
    ALLOWED_DOMAINS_STR: str = Field(
        default="", description="Comma-separated list of allowed email domains"
    )

    # Comma-separated list of bootstrap admin user emails.
    BOOTSTRAP_ADMIN_USERS_STR: str = Field(
        default="",
        description="Comma-separated list of admin user emails provisioned from env",
    )

    # Comma-separated list of absolute server-side paths that admins are allowed
    # to import as local references or copies.  Empty = all paths permitted for
    # admins (maintains backward-compat for single-user installs).
    LOCAL_IMPORT_ALLOWED_ROOTS_STR: str = Field(
        default="",
        description="Comma-separated absolute paths permitted for local imports",
    )

    # Comma-separated list of email domains that receive implicit viewer access.
    DEFAULT_VIEWER_DOMAINS_STR: str = Field(
        default="",
        description=(
            "Comma-separated list of email domains that get viewer access when no "
            "explicit RBAC assignment exists"
        ),
    )

    # Path to persistent role assignment JSON file.
    ROLE_STORE_PATH: str = Field(
        default="", description="Path to persistent RBAC role store JSON"
    )

    # Session signing secret for HttpOnly cookie authentication.
    SESSION_SECRET: str = Field(
        default="", description="HMAC secret used to sign session cookies"
    )

    # Session TTL in hours.
    SESSION_TTL_HOURS: int = Field(
        default=12, ge=1, le=168, description="Session expiration (hours)"
    )

    # Cookie secure flag (set true behind HTTPS).
    SESSION_COOKIE_SECURE: bool = Field(
        default=False, description="Whether session cookie should be marked Secure"
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
        description="Enable development mode. When True, bypasses authentication.",
    )

    # ===========================================
    # Git & GitHub Integration
    # ===========================================
    GITHUB_TOKEN: str = Field(
        default="",
        description="GitHub Personal Access Token for private repository access.",
    )

    COMMENTS_API_BASE_URL: str = Field(
        default="",
        description=(
            "Default base URL used to generate KiCad comments REST URLs "
            "for project import and visualizer helpers. "
            "If empty, URL helpers derive host from the incoming request."
        ),
    )

    REMOTE_PROVIDER_LIBRARY_PREFIX: str = Field(
        default="remote",
        description="Library prefix assumed by the Prism remote-symbol provider when rewriting footprint links.",
    )

    REMOTE_PROVIDER_DESTINATION_DIR: str = Field(
        default="${KIPRJMOD}/RemoteLibrary",
        description="Destination directory assumed by the Prism remote-symbol provider when rewriting model paths.",
    )

    REMOTE_PROVIDER_OAUTH_CLIENT_ID: str = Field(
        default="kicad-prism-kicad",
        description="Public OAuth client_id advertised to KiCad for the remote provider.",
    )

    REMOTE_PROVIDER_ACCESS_TOKEN_TTL_SECONDS: int = Field(
        default=3600,
        ge=300,
        le=86400,
        description="Lifetime for KiCad remote provider access tokens.",
    )

    REMOTE_PROVIDER_REFRESH_TOKEN_TTL_SECONDS: int = Field(
        default=604800,
        ge=3600,
        le=2592000,
        description="Lifetime for KiCad remote provider refresh tokens.",
    )

    MANUFACTURO_SQL_SERVER: str = Field(
        default="", description="Manufacturo SQL Server hostname."
    )

    MANUFACTURO_SQL_DATABASE: str = Field(
        default="", description="Manufacturo SQL Server database name."
    )

    MANUFACTURO_SQL_USERNAME: str = Field(
        default="", description="Manufacturo SQL Server username."
    )

    MANUFACTURO_SQL_PASSWORD: str = Field(
        default="", description="Manufacturo SQL Server password."
    )

    MANUFACTURO_SQL_DRIVER: str = Field(
        default="ODBC Driver 18 for SQL Server",
        description="ODBC driver name for Manufacturo SQL connectivity.",
    )

    MANUFACTURO_SYNC_LIMIT: int = Field(
        default=0,
        ge=0,
        le=100000,
        description="Optional row limit for Manufacturo syncs. 0 means no explicit limit.",
    )

    CATALOG_SQLITE_PATH: str = Field(
        default="",
        description=(
            "SQLite database path for component catalog, remote-provider OAuth, "
            "and local service-client metadata. Defaults under KICAD_PROJECTS_ROOT."
        ),
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

    # ===========================================
    # Computed Properties
    # ===========================================
    @property
    def ALLOWED_USERS(self) -> list[str]:
        """Parse allowed emails from comma-separated string."""
        return [
            u.strip().lower() for u in self.ALLOWED_USERS_STR.split(",") if u.strip()
        ]

    @property
    def ALLOWED_DOMAINS(self) -> list[str]:
        """Parse allowed domains from comma-separated string."""
        return [
            d.strip().lower() for d in self.ALLOWED_DOMAINS_STR.split(",") if d.strip()
        ]

    @property
    def BOOTSTRAP_ADMIN_USERS(self) -> list[str]:
        """Parse bootstrap admin emails from comma-separated string."""
        return [
            u.strip().lower()
            for u in self.BOOTSTRAP_ADMIN_USERS_STR.split(",")
            if u.strip()
        ]

    @property
    def DEFAULT_VIEWER_DOMAINS(self) -> list[str]:
        """Parse implicit viewer domains from comma-separated string."""
        return [
            d.strip().lower()
            for d in self.DEFAULT_VIEWER_DOMAINS_STR.split(",")
            if d.strip()
        ]

    @property
    def LOCAL_IMPORT_ALLOWED_ROOTS(self) -> list[str]:
        """Absolute paths that admins may import locally. Empty list = unrestricted."""
        return [
            p.strip()
            for p in self.LOCAL_IMPORT_ALLOWED_ROOTS_STR.split(",")
            if p.strip()
        ]

    @property
    def CORS_ORIGINS(self) -> list[str]:
        """Parse credentialed CORS origins from comma-separated string."""
        return [
            origin.strip().rstrip("/")
            for origin in self.CORS_ORIGINS_STR.split(",")
            if origin.strip()
        ]

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
    def KICAD_PROJECTS_ROOT(self) -> str:
        return os.environ.get(
            "KICAD_PROJECTS_ROOT",
            os.path.abspath(
                os.path.join(os.path.dirname(__file__), "../../../data/projects")
            ),
        )

    @property
    def RESOLVED_ROLE_STORE_PATH(self) -> str:
        if self.ROLE_STORE_PATH.strip():
            return os.path.abspath(os.path.expanduser(self.ROLE_STORE_PATH.strip()))
        return os.path.join(self.KICAD_PROJECTS_ROOT, ".rbac_roles.json")

    @property
    def AUTH_ENABLED(self) -> bool:
        """
        Authentication is enabled only if:
        1. AUTH_ENABLED env var is True (default), AND
        2. Valid OIDC/OAuth client credentials are configured, AND
        3. DEV_MODE is False
        """
        # If explicitly disabled via env var, it's off.
        if not self.AUTH_ENABLED_OVERRIDE:
            return False

        return (
            bool(self.EFFECTIVE_OIDC_ISSUER_URL)
            and bool(self.EFFECTIVE_OIDC_CLIENT_ID)
            and bool(self.EFFECTIVE_OIDC_CLIENT_SECRET)
            and not self.DEV_MODE
        )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        # Allow extra fields to be ignored
        extra = "ignore"


# Global settings instance
settings = Settings()
