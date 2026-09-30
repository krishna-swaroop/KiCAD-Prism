import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openHelpDialog } from "@/lib/help-dialogs";
import type { AuthConfig } from "@/types/auth";

import { HelpDialogHost } from "./help-dialog-host";

const authConfig: AuthConfig = {
  auth_enabled: true,
  dev_mode: false,
  oidc_enabled: true,
  oidc_provider_name: "Corp SSO",
  password_auth_enabled: false,
  workspace_name: "Acme",
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("HelpDialogHost", () => {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async (input) => {
    const url = String(input);
    if (url === "/api/health/about") {
      return jsonResponse({ release: "v4.0.0-alpha", revision: "0123456789abcdef", buildDate: "2026-09-20", kicadCli: "10.0.4" });
    }
    if (url === "/ecad-viewer.manifest.json") {
      return jsonResponse({ upstreamCommit: "c3537042ff7156ce", adapterCommit: "461a091952ef44b5" });
    }
    return new Response(null, { status: 404 });
  });

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    fetchMock.mockClear();
    vi.unstubAllGlobals();
  });

  it("previews the pre-filled report and only links to GitHub", async () => {
    render(<HelpDialogHost authConfig={authConfig} />);
    act(() => openHelpDialog("report-bug"));

    expect(await screen.findByRole("heading", { name: "Report a bug" })).toBeTruthy();
    const preview = await screen.findByLabelText("Version information");
    expect(preview.textContent).toContain("KiCad CLI: 10.0.4");
    expect(preview.textContent).toContain("ECAD viewer: upstream c3537042ff71, adapter 461a091952ef");

    const link = screen.getByRole("link", { name: /Open on GitHub/ });
    const url = new URL(link.getAttribute("href") ?? "");
    expect(url.host).toBe("github.com");
    expect(url.searchParams.get("version")).toBe("v4.0.0-alpha");
    expect(url.searchParams.get("diagnostics")).toBe(preview.textContent);
    expect(link.getAttribute("target")).toBe("_blank");

    // Opening the dialog reads only the two version sources; nothing is posted.
    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.method ?? "GET").toBe("GET");
    }
  });

  it("opens About and still renders when the backend is unreachable", async () => {
    fetchMock.mockImplementationOnce(async () => {
      throw new TypeError("network down");
    });
    render(<HelpDialogHost authConfig={authConfig} />);
    act(() => openHelpDialog("about"));

    expect(await screen.findByRole("heading", { name: "About KiCAD Prism" })).toBeTruthy();
    const preview = await screen.findByLabelText("Version information");
    expect(preview.textContent).toContain("Backend: unavailable");
    expect(screen.getByRole("button", { name: /Report a bug/ })).toBeTruthy();
  });
});
