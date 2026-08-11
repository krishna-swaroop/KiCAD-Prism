export type UserRole = "admin" | "designer" | "viewer" | "component_designer" | "component_qa";

export interface User {
    name: string;
    email: string;
    picture?: string;
    role: UserRole;
}

export interface AuthConfig {
    auth_enabled: boolean;
    dev_mode: boolean;
    oidc_provider_name: string;
    workspace_name: string;
}

export interface ActiveSession {
    id: string;
    created_at: string;
    last_seen_at: string;
    expires_at: string;
    user_agent: string;
    client_ip: string;
}
