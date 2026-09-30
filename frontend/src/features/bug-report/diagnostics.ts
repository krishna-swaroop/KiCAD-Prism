import { fetchJson } from "@/lib/api";
import type { PrismBuildInfo } from "@/lib/build-info";
import type { AuthConfig } from "@/types/auth";

import { loadClientEnvironment, type ClientEnvironment, type NavigatorLike } from "./client-environment";

export const PRISM_REPOSITORY_URL = "https://github.com/krishna-swaroop/KiCAD-Prism";

/** Field ids in `.github/ISSUE_TEMPLATE/bug_report.yml`; GitHub pre-fills a form field from the query parameter of the same name. */
const BUG_TEMPLATE = "bug_report.yml";
const VERSION_FIELD = "version";
const DIAGNOSTICS_FIELD = "diagnostics";

/**
 * GitHub rejects or truncates very long issue URLs. Past this length the
 * diagnostics block is left out of the link and the user pastes it instead.
 */
export const MAX_ISSUE_URL_LENGTH = 7000;

export interface BackendAbout extends PrismBuildInfo {
  kicadCli: string;
}

export interface ViewerManifest {
  upstreamCommit?: string;
  adapterCommit?: string;
}

export interface DiagnosticsInput {
  frontend: PrismBuildInfo;
  /** Null when the About endpoint could not be reached. */
  backend: BackendAbout | null;
  viewer: ViewerManifest | null;
  authConfig: AuthConfig;
  client: ClientEnvironment;
  language: string;
  pathname: string;
  search: string;
}

const UNAVAILABLE = "unavailable";
const QUERY_KEYS_KEPT = ["section", "libraryView", "tab"];
const SLUG = /^[a-z0-9-]{1,40}$/i;

function shortCommit(value: string | undefined): string {
  if (!value || value === "unknown") return "unknown";
  return /^[0-9a-f]{12,}$/i.test(value) ? value.slice(0, 12) : value;
}

/**
 * Names the screen without naming the project. Route ids become placeholders,
 * and only the query keys that select a view survive, and only when their
 * value is a plain slug. Branches, commits, search text and anything else
 * that could carry project information are dropped.
 */
export function describePage(pathname: string, search: string): string {
  const path = pathname.startsWith("/project/") ? "/project/:id" : pathname === "/" ? "/" : "(other)";
  const params = new URLSearchParams(search);
  const kept = QUERY_KEYS_KEPT.flatMap((key) => {
    const value = params.get(key);
    return value && SLUG.test(value) ? [`${key}=${value}`] : [];
  });
  return kept.length ? `${path}?${kept.join("&")}` : path;
}

export function describeAuth(config: AuthConfig): string {
  if (!config.auth_enabled) return "disabled";
  const modes = [
    config.oidc_enabled ? "OIDC" : null,
    config.password_auth_enabled ? "password" : null,
  ].filter(Boolean);
  return modes.length ? modes.join(" + ") : "enabled";
}

/**
 * The plain-text block shown in the About dialog and pre-filled into bug
 * reports. Modelled on KiCad's "Copy Version Info": stable labels, one fact per
 * line, nothing about the user, the host name or any project.
 */
export function formatDiagnostics(input: DiagnosticsInput): string {
  const { frontend, backend, viewer } = input;
  const lines = [
    "Application: KiCAD Prism",
    `Version: ${backend?.release ?? frontend.release}`,
    backend
      ? `Backend: ${backend.release}, revision ${shortCommit(backend.revision)}, built ${backend.buildDate}`
      : `Backend: ${UNAVAILABLE}`,
    `Frontend: ${frontend.release}, revision ${shortCommit(frontend.revision)}, built ${frontend.buildDate}`,
    viewer
      ? `ECAD viewer: upstream ${shortCommit(viewer.upstreamCommit)}, adapter ${shortCommit(viewer.adapterCommit)}`
      : `ECAD viewer: ${UNAVAILABLE}`,
    `KiCad CLI: ${backend?.kicadCli ?? UNAVAILABLE}`,
    `Authentication: ${describeAuth(input.authConfig)}`,
    `Browser: ${input.client.browser}`,
    `OS: ${input.client.os}`,
    `User agent: ${input.client.userAgent || UNAVAILABLE}`,
    `Locale: ${input.language || UNAVAILABLE}`,
    `Page: ${describePage(input.pathname, input.search)}`,
  ];
  if (revisionsDiffer(frontend, backend)) {
    lines.push("Warning: frontend and backend revisions differ");
  }
  return lines.join("\n");
}

export function revisionsDiffer(frontend: PrismBuildInfo, backend: BackendAbout | null): boolean {
  if (!backend) return false;
  const known = (value: string) => value !== "" && value !== "unknown";
  return known(frontend.revision) && known(backend.revision) && frontend.revision !== backend.revision;
}

/** A new-issue link on the bug form with the version and diagnostics filled in. */
export function bugReportUrl(version: string, diagnostics: string): { url: string; includesDiagnostics: boolean } {
  const base = `${PRISM_REPOSITORY_URL}/issues/new`;
  const withDiagnostics = `${base}?${new URLSearchParams({
    template: BUG_TEMPLATE,
    [VERSION_FIELD]: version,
    [DIAGNOSTICS_FIELD]: diagnostics,
  })}`;
  if (withDiagnostics.length <= MAX_ISSUE_URL_LENGTH) {
    return { url: withDiagnostics, includesDiagnostics: true };
  }
  const withoutDiagnostics = `${base}?${new URLSearchParams({ template: BUG_TEMPLATE, [VERSION_FIELD]: version })}`;
  return { url: withoutDiagnostics, includesDiagnostics: false };
}

export interface DiagnosticSources {
  backend: BackendAbout | null;
  viewer: ViewerManifest | null;
  client: ClientEnvironment;
}

/** Reads the backend identity, the viewer manifest (either may come back null) and the browser environment. */
export async function loadDiagnosticSources(
  signal: AbortSignal,
  nav: NavigatorLike = navigator,
): Promise<DiagnosticSources> {
  // Each source is optional: a report about a broken backend is exactly the
  // one that most needs to open, so a failed lookup reads "unavailable".
  const [backend, viewer, client] = await Promise.all([
    fetchJson<BackendAbout>("/api/health/about", { signal }).catch(() => null),
    fetch("/ecad-viewer.manifest.json", { signal, cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<ViewerManifest>) : null))
      .catch(() => null),
    loadClientEnvironment(nav),
  ]);
  return { backend, viewer, client };
}
