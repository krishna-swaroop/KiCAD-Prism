export type UserRole = "admin" | "designer" | "viewer" | "qa";

export interface User {
    name: string;
    email: string;
    picture?: string;
    role: UserRole;
}

export interface AuthConfig {
    auth_enabled: boolean;
    dev_mode: boolean;
    oidc_enabled?: boolean;
    oidc_provider_name: string;
    password_auth_enabled?: boolean;
    workspace_name: string;
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
