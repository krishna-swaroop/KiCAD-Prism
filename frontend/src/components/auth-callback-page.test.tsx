import { StrictMode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthCallbackPage } from "./auth-callback-page";
import { consumeStashedLoginNext, exchangeOidcAuthCode } from "@/lib/auth";
import type { User } from "@/types/auth";

vi.mock("@/lib/auth", () => ({
    consumeStashedLoginNext: vi.fn(),
    exchangeOidcAuthCode: vi.fn(),
}));

const mockedExchange = vi.mocked(exchangeOidcAuthCode);
const mockedConsume = vi.mocked(consumeStashedLoginNext);

/**
 * The OIDC authorization code is single-use, so exchanging it a second time
 * fails and shows "Authentication failed" after a successful login. These
 * tests pin the one-exchange guarantee against both re-run triggers:
 * StrictMode's dev-only double effect invocation, and App handing down a
 * fresh `onLoginSuccess` identity on every parent render.
 */

const user: User = { name: "Ada Lovelace", email: "ada@example.com", role: "admin" };

function mount(onLoginSuccess: (user: User) => void = () => {}) {
    return render(
        <StrictMode>
            <AuthCallbackPage onLoginSuccess={onLoginSuccess} />
        </StrictMode>,
    );
}

function settle() {
    // Let any stray second effect run surface before asserting the count.
    return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
    window.history.replaceState(null, "", "/login/callback?code=abc123&state=s3cret");
    mockedExchange.mockReset();
    mockedConsume.mockReset();
    mockedConsume.mockReturnValue(null);
});

afterEach(() => {
    cleanup();
    window.history.replaceState(null, "", "/");
});

describe("AuthCallbackPage", () => {
    it("exchanges the authorization code exactly once across StrictMode's double effect invocation", async () => {
        mockedExchange.mockResolvedValue(user);

        mount();

        await waitFor(() => expect(mockedExchange).toHaveBeenCalledTimes(1));
        await settle();
        expect(mockedExchange).toHaveBeenCalledTimes(1);
        expect(mockedExchange).toHaveBeenCalledWith("abc123", "s3cret");
    });

    it("does not re-exchange when the parent re-renders with a fresh callback identity", async () => {
        mockedExchange.mockResolvedValue(user);
        const onLoginSuccess = vi.fn();

        const view = mount(onLoginSuccess);
        await waitFor(() => expect(mockedExchange).toHaveBeenCalledTimes(1));

        view.rerender(
            <StrictMode>
                <AuthCallbackPage onLoginSuccess={() => {}} />
            </StrictMode>,
        );
        await settle();

        expect(mockedExchange).toHaveBeenCalledTimes(1);
        expect(onLoginSuccess).toHaveBeenCalledWith(user);
    });

    it("reports an exchange failure instead of retrying against a dead code", async () => {
        mockedExchange.mockRejectedValue(new Error("code already used"));

        mount();

        await waitFor(() => expect(screen.getByText("code already used")).toBeTruthy());
        await settle();
        expect(mockedExchange).toHaveBeenCalledTimes(1);
    });
});
