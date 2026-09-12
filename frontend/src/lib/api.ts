export interface ApiErrorPayload {
  detail?: string | { code?: string; message?: string } | Array<{ loc?: unknown[]; msg?: string }>;
  message?: string;
}

export class ApiHttpError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiHttpError";
    this.status = status;
    this.code = code;
  }
}

type ParsedApiError = {
  message: string;
  code?: string;
};

function parseApiErrorPayload(payload: ApiErrorPayload, fallback: string): ParsedApiError {
  const detail = payload.detail;
  if (typeof detail === "string" && detail) {
    return { message: detail };
  }
  if (Array.isArray(detail)) {
    return {
      message: detail
        .map((entry) => `${entry.loc?.slice(-1)?.[0] || "Field"}: ${entry.msg}`)
        .join(", "),
    };
  }
  if (detail && typeof detail === "object") {
    const message =
      typeof detail.message === "string" && detail.message.trim()
        ? detail.message
        : payload.message || fallback;
    const code = typeof detail.code === "string" && detail.code.trim() ? detail.code : undefined;
    return { message, code };
  }
  return { message: payload.message || fallback };
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
    return parseApiErrorPayload((await response.json()) as ApiErrorPayload, fallback);
  } catch {
    return { message: fallback };
  }
}

export async function readApiError(response: Response, fallback: string): Promise<string> {
  return (await readApiErrorPayload(response, fallback)).message;
}

export async function fetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  fallbackError = "Request failed"
): Promise<T> {
  const response = await fetchApi(input, init);
  if (!response.ok) {
    const parsed = await readApiErrorPayload(response, fallbackError);
    throw new ApiHttpError(response.status, parsed.message, parsed.code);
  }
  return (await response.json()) as T;
}
