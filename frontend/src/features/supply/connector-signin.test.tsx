import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SupplySignin } from "@/types/supply";

vi.mock("./supply-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./supply-api")>()),
  startSupplySignin: vi.fn(),
  forgetSupplySignin: vi.fn(),
}));

import { ConnectorSignin } from "./connector-signin";
import * as api from "./supply-api";

const mocked = vi.mocked(api);
const none: SupplySignin = {
  signed_in: false, state: "none", granted_by: "", granted_at: null, expires_at: null,
  redirect_uri: "https://prism.example/api/supply/oauth/digikey/callback",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocked.forgetSupplySignin.mockResolvedValue();
});
afterEach(cleanup);

describe("the DigiKey sign-in on a connector", () => {
  it("says nobody is signed in, names the callback the app needs, and sends the browser to DigiKey", async () => {
    const status: SupplySignin = none;
    mocked.startSupplySignin.mockResolvedValue("https://api.digikey.com/v1/oauth2/authorize?state=s");
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    render(<ConnectorSignin connectorId="dk" status={status} />);
    expect(await screen.findByText(/Nobody is signed in/)).toBeTruthy();
    expect(screen.getByText(/https:\/\/prism\.example\/api\/supply\/oauth\/digikey\/callback/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sign in at DigiKey" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://api.digikey.com/v1/oauth2/authorize?state=s"));
    vi.unstubAllGlobals();
  });

  it("says who signed in and lets an administrator sign out", async () => {
    const status: SupplySignin = { ...none, signed_in: true, state: "ok", granted_by: "admin@example.com", expires_at: "2027-01-10T00:00:00+00:00" };
    render(<ConnectorSignin connectorId="dk" status={status} />);
    expect(await screen.findByText(/Signed in by admin@example\.com/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(mocked.forgetSupplySignin).toHaveBeenCalledWith("dk"));
  });

  it("asks for a new sign-in when DigiKey refused the old one", async () => {
    const status: SupplySignin = { ...none, state: "refused", granted_by: "admin@example.com" };
    render(<ConnectorSignin connectorId="dk" status={status} />);
    expect(await screen.findByText(/DigiKey refused the sign-in/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });
});
