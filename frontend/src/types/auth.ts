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
    oidc_issuer_url: string;
    oidc_authorization_endpoint: string;
    oidc_client_id: string;
    oidc_scopes: string;
    oidc_provider_name: string;
    workspace_name: string;
}
