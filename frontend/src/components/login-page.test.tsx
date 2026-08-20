import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthConfig, User } from "@/types/auth";

const startOidcLogin = vi.fn<() => Promise<string>>(async () => "https://sso.example.com/authorize");
const loginWithPassword = vi.fn<(email: string, password: string, rememberMe: boolean) => Promise<unknown>>();
const changeOwnPassword = vi.fn<(current: string, next: string) => Promise<{ success: boolean }>>(
    async () => ({ success: true }),
);

vi.mock("@/lib/auth", () => ({
    startOidcLogin: () => startOidcLogin(),
    loginWithPassword: (email: string, password: string, rememberMe: boolean) =>
        loginWithPassword(email, password, rememberMe),
    changeOwnPassword: (current: string, next: string) => changeOwnPassword(current, next),
    stashLoginNext: () => {},
    consumeStashedLoginNext: () => null,
}));

// Release-tag fetch on mount; keep it from making a real network call.
vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })) as unknown as typeof fetch);

// The Radix checkbox uses ResizeObserver, which jsdom does not provide.
vi.stubGlobal(
    "ResizeObserver",
    class {
        observe() {}
        unobserve() {}
        disconnect() {}
    },
);

import { LoginPage } from "./login-page";

function config(overrides: Partial<AuthConfig>): AuthConfig {
    return {
        auth_enabled: true,
        dev_mode: false,
        oidc_enabled: false,
        oidc_provider_name: "Corp SSO",
        password_auth_enabled: false,
        workspace_name: "Test",
        ...overrides,
    };
}

describe("LoginPage method rendering", () => {
    afterEach(() => {
        cleanup();
        loginWithPassword.mockReset();
    });

    it("shows only the SSO button when password auth is off", () => {
        render(<LoginPage authConfig={config({ oidc_enabled: true, password_auth_enabled: false })} />);
        expect(screen.getByText(/Continue with Corp SSO/)).toBeTruthy();
        expect(screen.queryByLabelText("Email")).toBeNull();
    });

    it("shows only the password form when OIDC is off", () => {
        render(<LoginPage authConfig={config({ oidc_enabled: false, password_auth_enabled: true })} />);
        expect(screen.queryByText(/Continue with Corp SSO/)).toBeNull();
        expect(screen.getByLabelText("Email")).toBeTruthy();
        expect(screen.getByLabelText("Password")).toBeTruthy();
    });

    it("shows both methods with a divider when both are on", () => {
        render(<LoginPage authConfig={config({ oidc_enabled: true, password_auth_enabled: true })} />);
        expect(screen.getByText(/Continue with Corp SSO/)).toBeTruthy();
        expect(screen.getByLabelText("Email")).toBeTruthy();
    });

    it("submits password login and reports success", async () => {
        const user: User = { email: "u@example.com", name: "u", role: "designer" };
        loginWithPassword.mockResolvedValue({ ...user, must_change_password: false });
        const onLoginSuccess = vi.fn();

        render(
            <LoginPage
                authConfig={config({ password_auth_enabled: true })}
                onLoginSuccess={onLoginSuccess}
            />,
        );

        const secret = "x".repeat(12); // placeholder, not a real credential
        fireEvent.change(screen.getByLabelText("Email"), { target: { value: "u@example.com" } });
        fireEvent.change(screen.getByLabelText("Password"), { target: { value: secret } });
        fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

        await waitFor(() => expect(loginWithPassword).toHaveBeenCalledWith("u@example.com", secret, false));
        await waitFor(() => expect(onLoginSuccess).toHaveBeenCalled());
    });

    it("switches to the set-new-password step when the account must change", async () => {
        loginWithPassword.mockResolvedValue({
            email: "u@example.com",
            name: "u",
            role: "viewer",
            must_change_password: true,
        });
        const onLoginSuccess = vi.fn();

        render(
            <LoginPage
                authConfig={config({ password_auth_enabled: true })}
                onLoginSuccess={onLoginSuccess}
            />,
        );

        fireEvent.change(screen.getByLabelText("Email"), { target: { value: "u@example.com" } });
        fireEvent.change(screen.getByLabelText("Password"), { target: { value: "x".repeat(12) } });
        fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

        // Must-change step appears; the app is not entered yet.
        await waitFor(() => expect(screen.getByText("Set a new password")).toBeTruthy());
        expect(onLoginSuccess).not.toHaveBeenCalled();
    });
});
