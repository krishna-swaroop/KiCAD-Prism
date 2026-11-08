export type UserRole = "admin" | "designer" | "viewer" | "qa";

export interface User {
    name: string;
    email: string;
    picture?: string;
    role: UserRole;
    /** Set while a temporary password must still be changed; the app shows only that form. */
    must_change_password?: boolean;
}

export interface AuthConfig {
    auth_enabled: boolean;
    dev_mode: boolean;
    oidc_enabled?: boolean;
    oidc_provider_name: string;
    password_auth_enabled?: boolean;
    workspace_name: string;
    sim_studio_enabled?: boolean;
    /** Whether comment changes stream over a socket (PRISM_COMMENT_LIVE_ENABLED); absent means on. */
    comment_live_enabled?: boolean;
    /** Whether Supply is on (PRISM_SUPPLY_ENABLED); absent from an older backend, which always had it. */
    supply_enabled?: boolean;
}

export interface PasswordLoginResult extends User {
    must_change_password: boolean;
}

export interface ActiveSession {
    id: string;
    created_at: string;
    last_seen_at: string;
    expires_at: string;
    user_agent: string;
    client_ip: string;
}
