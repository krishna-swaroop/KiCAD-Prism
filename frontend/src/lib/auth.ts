import { fetchJson } from "@/lib/api";
import type { ActiveSession, AuthConfig, User } from "@/types/auth";

const AUTH_CALLBACK_PATH = "/auth/callback";

interface LoginRequest {
  code: string;
  state: string;
  redirectUri: string;
}

export function getOidcAuthRedirectUri() {
  return `${window.location.origin}${AUTH_CALLBACK_PATH}`;
}

export function isAuthCallbackPath() {
  return window.location.pathname === AUTH_CALLBACK_PATH;
}

/**
 * Ask the backend to start a login.
 *
 * State, nonce, and the PKCE verifier are generated server-side and pinned to this
 * browser through an HttpOnly cookie, so nothing security-relevant is stored in
 * sessionStorage where page scripts could read or overwrite it.
 */
export async function startOidcLogin() {
  const { authorization_url } = await fetchJson<{ authorization_url: string }>(
    "/api/auth/login/start",
    { method: "POST" },
    "Failed to start sign-in"
  );
  return authorization_url;
}

export function fetchAuthConfig(signal?: AbortSignal) {
  return fetchJson<AuthConfig>(
    "/api/auth/config",
    signal ? { signal } : undefined,
    "Failed to fetch auth config"
  );
}

export function fetchCurrentUser(signal?: AbortSignal) {
  return fetchJson<User>(
    "/api/auth/me",
    signal ? { signal } : undefined,
    "Failed to fetch current user"
  );
}

export function exchangeOidcAuthCode(code: string, state: string) {
  const payload: LoginRequest = {
    code,
    state,
    redirectUri: getOidcAuthRedirectUri(),
  };

  return fetchJson<User>(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "Authentication failed"
  );
}

export interface PasswordLoginResult extends User {
  must_change_password: boolean;
}

/** Sign in with a local email and password. */
export function loginWithPassword(email: string, password: string, rememberMe: boolean) {
  return fetchJson<PasswordLoginResult>(
    "/api/auth/login/password",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, remember_me: rememberMe }),
    },
    "Sign-in failed"
  );
}

/** Change the signed-in user's own password. */
export function changeOwnPassword(currentPassword: string, newPassword: string) {
  return fetchJson<{ success: boolean }>(
    "/api/auth/password/change",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    },
    "Failed to change password"
  );
}

export function fetchActiveSessions(signal?: AbortSignal) {
  return fetchJson<ActiveSession[]>(
    "/api/auth/sessions",
    signal ? { signal } : undefined,
    "Failed to load active sessions"
  );
}

export function revokeOtherSessions() {
  return fetchJson<{ revoked: number }>(
    "/api/auth/sessions/revoke-others",
    { method: "POST" },
    "Failed to sign out other sessions"
  );
}
