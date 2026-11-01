/**
 * The one transport to the Prism backend.
 *
 * Every request goes through `fetchApi` (session cookie, JSON content type,
 * and the `kicad-prism-auth-error` event on 401/403 that raises the
 * session-expired banner). The typed readers `fetchJson`, `fetchText`,
 * `fetchBlob` and `fetchChecked` throw `ApiHttpError` for any non-OK status,
 * so a caller never parses an error body itself.
 *
 * Error bodies (see `backend/app/core/errors.py`) have one shape:
 * `{"detail": "<message>", "code": "<code>", ...extra}`, request validation
 * (422 `validation_error`) and plain `HTTPException`s included.
 * Non-JSON bodies (a proxy's 502 page) fall back to the caller's message.
 *
 * Guarded writes send the ETag they read as `If-Match` (`ifMatch`). A stale one
 * answers 412 (`isStale`), a missing one 428.
 *
 * Raw `fetch` is only for non-Prism endpoints (GitHub releases, the local
 * KiCad agent) and immutable static assets.
 */

export interface ApiErrorPayload {
  detail?: unknown;
  code?: string;
  [key: string]: unknown;
}

export class ApiHttpError extends Error {
  status: number;
  code?: string;
  /** The error body's other fields (`currentRevision`, `requiredRole`, ...). */
  payload: Record<string, unknown>;

  constructor(status: number, message: string, code?: string, payload: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiHttpError";
    this.status = status;
    this.code = code;
    this.payload = payload;
  }

  /** The session is gone (the app shows the session-expired banner). */
  get isAuth(): boolean {
    return this.status === 401;
  }

  get isPermission(): boolean {
    return this.status === 403 || this.code === "publication_required";
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** The write contradicts state no ETag describes: reload, then retry deliberately. */
  get isConflict(): boolean {
    return this.status === 409;
  }

  /** A guarded write's `If-Match` named an old version (412): reload, then retry. */
  get isStale(): boolean {
    return this.status === 412;
  }
}

type ParsedApiError = {
  message: string;
  code?: string;
  payload: Record<string, unknown>;
};

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function parseApiErrorPayload(raw: unknown, fallback: string): ParsedApiError {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { message: fallback, payload: {} };
  }
  const { detail, code, ...rest } = raw as ApiErrorPayload;
  return { message: nonEmpty(detail) ?? fallback, code: nonEmpty(code), payload: rest };
}

/** The `If-Match` header for a guarded write: the resource's ETag `"<kind>:<id>:<version>"`. */
export function ifMatch(kind: "comment" | "reply" | "component", id: string, version: string | number): Record<string, string> {
  return { "If-Match": `"${kind}:${id}:${version}"` };
}

export async function fetchApi(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  const headers = new Headers(init?.headers);
  if (typeof init?.body === "string" && !headers.has("Content-Type") && !headers.has("content-type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(input, {
    ...init,
    headers,
    credentials: init?.credentials ?? "include",
  });

  if (response.status === 401 || response.status === 403) {
    window.dispatchEvent(
      new CustomEvent("kicad-prism-auth-error", {
        detail: { status: response.status, url },
      })
    );
  }

  return response;
}

async function readApiErrorPayload(response: Response, fallback: string): Promise<ParsedApiError> {
  try {
    return parseApiErrorPayload(await response.json(), fallback);
  } catch {
    return { message: fallback, payload: {} };
  }
}

export async function readApiError(response: Response, fallback: string): Promise<string> {
  return (await readApiErrorPayload(response, fallback)).message;
}

/** The `ApiHttpError` for a failed response. Adapters with their own error subclass start here. */
export async function apiErrorFrom(response: Response, fallback = "Request failed"): Promise<ApiHttpError> {
  const parsed = await readApiErrorPayload(response, fallback);
  return new ApiHttpError(response.status, parsed.message, parsed.code, parsed.payload);
}

/** The response when it is OK; otherwise an `ApiHttpError`. For headers, 204s and streaming. */
export async function fetchChecked(
  input: RequestInfo | URL,
  init?: RequestInit,
  fallbackError = "Request failed"
): Promise<Response> {
  const response = await fetchApi(input, init);
  if (!response.ok) {
    throw await apiErrorFrom(response, fallbackError);
  }
  return response;
}

export async function fetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  fallbackError = "Request failed"
): Promise<T> {
  return (await fetchDesignJson<T>(input, init, { fallbackError })).data;
}

export async function fetchText(
  input: RequestInfo | URL,
  init?: RequestInit,
  fallbackError = "Request failed"
): Promise<string> {
  return (await fetchDesignText(input, init, { fallbackError })).data;
}

export async function fetchBlob(
  input: RequestInfo | URL,
  init?: RequestInit,
  fallbackError = "Request failed"
): Promise<Blob> {
  return (await fetchChecked(input, init, fallbackError)).blob();
}

// ------------------------------------------------------------- design data
//
// Every route that reads a project's design data answers one of three ways
// (backend `design_bundle/errors.py`): the data (200), still building (202
// `{"status": "pending", "members": [...], "retryAfterSeconds": 3}` with a
// `Retry-After` header), or could not be built (422 `{"status": "failed",
// "members": [...], "detail": "..."}`). `fetchDesignJson`/`fetchDesignText`
// are the one place that understands the two states: they retry a pending
// answer with backoff for up to fifteen minutes, report it to `onPending` so a
// screen can show "Preparing design data…", and turn a failed answer into a
// typed `DesignDataFailedError`. A `X-Prism-Working-Tree: dirty` header on the
// final answer says HEAD was served over uncommitted changes.

/**
 * How long a pending design-data read keeps retrying before giving up. A
 * design bundle can wait behind the single build slot for several minutes, so
 * the window is comfortably longer than a normal build.
 */
export const DESIGN_DATA_PENDING_TIMEOUT_MS = 900_000;
const DESIGN_DATA_DEFAULT_RETRY_SECONDS = 3;
const WORKING_TREE_HEADER = "X-Prism-Working-Tree";

export interface DesignDataPendingInfo {
  members: string[];
  retryAfterSeconds: number;
}

export interface DesignDataOptions {
  /** Called for every 202 pending answer, so a screen can show its pending state. */
  onPending?: (info: DesignDataPendingInfo) => void;
  fallbackError?: string;
  /** Overrides the ~15 minute retry window (tests). */
  pendingTimeoutMs?: number;
}

/** The data a design-data read answered with, and whether HEAD was served over a dirty tree. */
export interface DesignDataResult<T> {
  data: T;
  workingTreeDirty: boolean;
}

/** A design bundle that could not be built (HTTP 422 `status: "failed"`). */
export class DesignDataFailedError extends ApiHttpError {
  members: string[];

  constructor(members: string[], detail: string) {
    super(422, detail, "design_data_failed", { status: "failed", members, detail });
    this.name = "DesignDataFailedError";
    this.members = members;
  }
}

/** A design bundle still building after the retry window elapsed (HTTP 202). */
export class DesignDataPendingError extends Error {
  members: string[];

  constructor(members: string[]) {
    super("The design data is still being prepared");
    this.name = "DesignDataPendingError";
    this.members = members;
  }
}

function designDataMembers(payload: unknown): string[] {
  const members = (payload as { members?: unknown } | null)?.members;
  return Array.isArray(members) ? members.filter((item): item is string => typeof item === "string") : [];
}

function retryDelayMs(response: Response, payload: unknown): number {
  const header = Number(response.headers.get("Retry-After"));
  if (Number.isFinite(header) && header > 0) return header * 1000;
  const body = Number((payload as { retryAfterSeconds?: unknown } | null)?.retryAfterSeconds);
  if (Number.isFinite(body) && body > 0) return body * 1000;
  return DESIGN_DATA_DEFAULT_RETRY_SECONDS * 1000;
}

function workingTreeDirty(response: Response): boolean {
  return response.headers.get(WORKING_TREE_HEADER)?.toLowerCase() === "dirty";
}

function delay(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function designDataResponse(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  options: DesignDataOptions
): Promise<{ response: Response; workingTreeDirty: boolean }> {
  const fallback = options.fallbackError ?? "Request failed";
  const deadline = Date.now() + (options.pendingTimeoutMs ?? DESIGN_DATA_PENDING_TIMEOUT_MS);
  for (;;) {
    const response = await fetchApi(input, init);
    if (response.status === 202) {
      const payload = (await response.clone().json().catch(() => null)) as
        | { status?: string; members?: unknown }
        | null;
      if (payload?.status === "pending") {
        const members = designDataMembers(payload);
        options.onPending?.({ members, retryAfterSeconds: retryDelayMs(response, payload) / 1000 });
        if (Date.now() >= deadline) throw new DesignDataPendingError(members);
        await delay(retryDelayMs(response, payload), init?.signal);
        continue;
      }
      return { response, workingTreeDirty: workingTreeDirty(response) };
    }
    if (response.status === 422) {
      const payload = (await response.clone().json().catch(() => null)) as
        | { status?: string; members?: unknown; detail?: unknown }
        | null;
      if (payload?.status === "failed") {
        const detail = typeof payload.detail === "string" && payload.detail.trim() ? payload.detail : fallback;
        throw new DesignDataFailedError(designDataMembers(payload), detail);
      }
      throw await apiErrorFrom(response, fallback);
    }
    if (!response.ok) throw await apiErrorFrom(response, fallback);
    return { response, workingTreeDirty: workingTreeDirty(response) };
  }
}

/** A design-data JSON read that understands the pending and failed states. */
export async function fetchDesignJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: DesignDataOptions = {}
): Promise<DesignDataResult<T>> {
  const { response, workingTreeDirty: dirty } = await designDataResponse(input, init, options);
  // A write that answers 204 (or nothing) has no body to read; callers that ignore the result still succeed.
  if (response.status === 204 || response.status === 205) return { data: undefined as T, workingTreeDirty: dirty };
  const text = await response.text();
  return { data: (text ? JSON.parse(text) : undefined) as T, workingTreeDirty: dirty };
}

/** A design-data text read (a viewer source) that understands the pending and failed states. */
export async function fetchDesignText(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: DesignDataOptions = {}
): Promise<DesignDataResult<string>> {
  const { response, workingTreeDirty: dirty } = await designDataResponse(input, init, options);
  return { data: await response.text(), workingTreeDirty: dirty };
}
