import { describe, expect, it } from "vitest";

import type { AuthConfig } from "@/types/auth";

import {
  MAX_ISSUE_URL_LENGTH,
  bugReportUrl,
  describeAuth,
  describePage,
  formatDiagnostics,
  type DiagnosticsInput,
} from "./diagnostics";

const authConfig: AuthConfig = {
  auth_enabled: true,
  dev_mode: false,
  oidc_enabled: true,
  oidc_provider_name: "Corp SSO",
  password_auth_enabled: true,
  workspace_name: "Acme Hardware",
};

function input(overrides: Partial<DiagnosticsInput> = {}): DiagnosticsInput {
  return {
    frontend: { release: "v4.0.0-alpha", revision: "57a7581aaaaabbbbbcccccdddddeeeeefffff000", buildDate: "2026-09-20" },
    backend: {
      release: "v4.0.0-alpha",
      revision: "57a7581aaaaabbbbbcccccdddddeeeeefffff000",
      buildDate: "2026-09-20",
      kicadCli: "10.0.4",
    },
    viewer: { upstreamCommit: "c3537042ff7156ce077d204df00a9d4add0e29b1", adapterCommit: "461a091952ef44b56610e3ccbac4ba3c94139c4a" },
    authConfig,
    client: { browser: "Google Chrome 153.0.7240.62", os: "macOS 15.3.1 (arm, 64-bit)", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
    language: "en-GB",
    pathname: "/project/secret-board-rev-b",
    search: "?section=visualizers&branch=customer%2Facme&commit=abc123&tab=pcb",
    ...overrides,
  };
}

describe("describePage", () => {
  it("keeps the screen and view selectors but never the project, branch or commit", () => {
    expect(describePage("/project/secret-board-rev-b", "?section=visualizers&branch=customer/acme&commit=abc&tab=pcb"))
      .toBe("/project/:id?section=visualizers&tab=pcb");
  });

  it("drops view selectors whose value is not a plain slug", () => {
    expect(describePage("/", "?section=Acme%20Board%20Rev%20B%2Fsecret")).toBe("/");
  });

  it("does not echo unknown paths", () => {
    expect(describePage("/some/private/path", "")).toBe("(other)");
  });
});

describe("describeAuth", () => {
  it("names the enabled sign-in methods", () => {
    expect(describeAuth(authConfig)).toBe("OIDC + password");
    expect(describeAuth({ ...authConfig, auth_enabled: false })).toBe("disabled");
  });
});

describe("formatDiagnostics", () => {
  it("renders a KiCad-style block with no workspace or project names", () => {
    const text = formatDiagnostics(input());
    expect(text).toBe(
      [
        "Application: KiCAD Prism",
        "Version: v4.0.0-alpha",
        "Backend: v4.0.0-alpha, revision 57a7581aaaaa, built 2026-09-20",
        "Frontend: v4.0.0-alpha, revision 57a7581aaaaa, built 2026-09-20",
        "ECAD viewer: upstream c3537042ff71, adapter 461a091952ef",
        "KiCad CLI: 10.0.4",
        "Authentication: OIDC + password",
        "Browser: Google Chrome 153.0.7240.62",
        "OS: macOS 15.3.1 (arm, 64-bit)",
        "User agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        "Locale: en-GB",
        "Page: /project/:id?section=visualizers&tab=pcb",
      ].join("\n"),
    );
    expect(text).not.toMatch(/secret|acme|Corp SSO/i);
  });

  it("flags a frontend and backend built from different revisions", () => {
    const text = formatDiagnostics(input({
      backend: { release: "v4.0.0-alpha", revision: "1111111111111111", buildDate: "x", kicadCli: "10.0.4" },
    }));
    expect(text).toContain("Warning: frontend and backend revisions differ");
  });

  it("does not flag a mismatch when a revision is unknown", () => {
    const text = formatDiagnostics(input({
      backend: { release: "development", revision: "unknown", buildDate: "unknown", kicadCli: "10.0.4" },
    }));
    expect(text).not.toContain("Warning");
  });

  it("still renders when the backend and viewer manifest are unreachable", () => {
    const text = formatDiagnostics(input({ backend: null, viewer: null }));
    expect(text).toContain("Version: v4.0.0-alpha");
    expect(text).toContain("Backend: unavailable");
    expect(text).toContain("ECAD viewer: unavailable");
    expect(text).toContain("KiCad CLI: unavailable");
  });
});

describe("bugReportUrl", () => {
  it("opens the bug form with the version and diagnostics fields filled in", () => {
    const { url, includesDiagnostics } = bugReportUrl("v4.0.0-alpha", "Application: KiCAD Prism");
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://github.com/krishna-swaroop/KiCAD-Prism/issues/new");
    expect(parsed.searchParams.get("template")).toBe("bug_report.yml");
    expect(parsed.searchParams.get("version")).toBe("v4.0.0-alpha");
    expect(parsed.searchParams.get("diagnostics")).toBe("Application: KiCAD Prism");
    expect(includesDiagnostics).toBe(true);
  });

  it("leaves the diagnostics out of an over-long link", () => {
    const { url, includesDiagnostics } = bugReportUrl("v4.0.0-alpha", "x".repeat(MAX_ISSUE_URL_LENGTH));
    expect(includesDiagnostics).toBe(false);
    expect(new URL(url).searchParams.has("diagnostics")).toBe(false);
    expect(new URL(url).searchParams.get("version")).toBe("v4.0.0-alpha");
  });
});
