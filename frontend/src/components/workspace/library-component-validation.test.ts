import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  fetchJson: vi.fn(),
  fetchApi: vi.fn(),
  readApiError: vi.fn(async () => "request failed"),
}));
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

import { fetchApi, fetchJson } from "@/lib/api";
import type { PrismJobStatus } from "@/lib/jobs";
import { toast } from "sonner";
import type { CatalogComponent } from "@/types/catalog";
import {
  applyCatalogValidationOutcome,
  resolveCatalogValidationResult,
  useLibraryComponentValidation,
  watchCatalogValidationJob,
} from "./library-component-validation";

const jobResponse = (payload: Partial<PrismJobStatus> & Pick<PrismJobStatus, "status">): Response =>
  new Response(JSON.stringify({
    job_id: "job-1",
    kind: "catalog_validation",
    stage: payload.status,
    message: payload.message ?? "",
    percent: payload.percent ?? 0,
    ...payload,
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

function catalogComponent(
  id: string,
  status: CatalogComponent["validation"]["status"] = "passed",
): CatalogComponent {
  return {
    id,
    revision_id: `${id}-rev1`,
    validation: { status, enabled: true, error_count: 0, warning_count: 0 },
  } as CatalogComponent;
}

function prismJob(partial: Partial<PrismJobStatus> & Pick<PrismJobStatus, "status">): PrismJobStatus {
  return {
    job_id: "job-1",
    kind: "catalog_validation",
    stage: partial.status,
    message: "",
    percent: 0,
    ...partial,
  };
}

function abortAwareHang(signal?: AbortSignal | null): Promise<Response> {
  return new Promise((_, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    signal?.addEventListener("abort", () => {
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.mocked(fetchApi).mockReset();
  vi.mocked(fetchJson).mockReset();
  vi.mocked(toast.error).mockReset();
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.message).mockReset();
  vi.mocked(toast.warning).mockReset();
});

describe("resolveCatalogValidationResult", () => {
  it("settles failed and cancelled jobs distinctly", async () => {
    await expect(resolveCatalogValidationResult(prismJob({
      status: "failed",
      error_message: "worker boom",
    }))).resolves.toEqual({ kind: "failed", error: "worker boom" });

    await expect(resolveCatalogValidationResult(prismJob({
      status: "cancelled",
      message: "operator cancelled",
    }))).resolves.toEqual({ kind: "cancelled", message: "operator cancelled" });
  });

  it("extracts the component from unified result metadata", async () => {
    const component = catalogComponent("comp-a", "warning");
    await expect(resolveCatalogValidationResult(prismJob({
      status: "completed",
      result_metadata: { component, errors: [] },
    }))).resolves.toEqual({ kind: "completed", component });
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it("reads the catalog job once when metadata has no component", async () => {
    const component = catalogComponent("comp-a");
    vi.mocked(fetchJson).mockResolvedValueOnce({ component, errors: [] });

    await expect(resolveCatalogValidationResult(prismJob({
      status: "completed",
      result_metadata: { validated: 1, total: 1, errors: [] },
    }))).resolves.toEqual({ kind: "completed", component });

    expect(fetchJson).toHaveBeenCalledTimes(1);
    expect(fetchJson).toHaveBeenCalledWith("/api/catalog/validation/jobs/job-1", {
      signal: undefined,
    });
  });

  it("uses the first catalog error when a completed job has no component", async () => {
    vi.mocked(fetchJson).mockRejectedValueOnce(new Error("legacy lookup failed"));
    await expect(resolveCatalogValidationResult(prismJob({
      status: "completed",
      result_metadata: { errors: [{ error: "symbol missing" }] },
    }))).resolves.toEqual({
      kind: "completed_without_component",
      error: "symbol missing",
    });
  });
});

describe("applyCatalogValidationOutcome", () => {
  it("toasts cancelled as a warning and failed as an error", () => {
    applyCatalogValidationOutcome({ kind: "cancelled", message: "KLC validation was cancelled." });
    applyCatalogValidationOutcome({ kind: "failed", error: "KLC validation failed." });
    expect(toast.warning).toHaveBeenCalledWith("KLC validation was cancelled.");
    expect(toast.error).toHaveBeenCalledWith("KLC validation failed.");
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe("watchCatalogValidationJob", () => {
  beforeEach(() => {
    vi.mocked(fetchApi).mockReset();
  });

  it("keeps polling through retry_wait until the job completes", async () => {
    const component = catalogComponent("comp-a");
    vi.mocked(fetchApi)
      .mockResolvedValueOnce(jobResponse({
        status: "retry_wait",
        message: "Waiting to retry",
      }))
      .mockResolvedValueOnce(jobResponse({
        status: "completed",
        result_metadata: { component },
      }));

    const updates: string[] = [];
    const outcome = await watchCatalogValidationJob("job-1", {
      signal: new AbortController().signal,
      intervalMs: 0,
      onUpdate: (job) => updates.push(job.status),
    });

    expect(updates).toEqual(["retry_wait", "completed"]);
    expect(outcome).toEqual({ kind: "completed", component });
    expect(fetchApi).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetchApi).mock.calls.every(([url]) => url === "/api/jobs/job-1")).toBe(true);
  });
});

describe("useLibraryComponentValidation", () => {
  it("aborts polling on unmount and does not refresh or toast success", async () => {
    const signals: AbortSignal[] = [];
    vi.mocked(fetchJson).mockResolvedValue({ job_id: "job-1" });
    vi.mocked(fetchApi).mockImplementation((_url, init) => {
      if (init?.signal) signals.push(init.signal);
      return abortAwareHang(init?.signal);
    });
    const onRefresh = vi.fn();
    const { result, unmount } = renderHook(() => useLibraryComponentValidation({
      componentId: "comp-a",
      onRefresh,
      intervalMs: 0,
    }));

    await act(async () => {
      void result.current.runValidation();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(signals.length).toBeGreaterThan(0);

    unmount();
    await act(async () => {
      await Promise.resolve();
    });

    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(vi.mocked(fetchApi).mock.calls.some(([url]) => String(url).includes("/cancel"))).toBe(false);
  });

  it("aborts the previous watcher when the component changes", async () => {
    const signals: AbortSignal[] = [];
    vi.mocked(fetchJson).mockResolvedValue({ job_id: "job-1" });
    vi.mocked(fetchApi).mockImplementation((_url, init) => {
      if (init?.signal) signals.push(init.signal);
      return abortAwareHang(init?.signal);
    });
    const onRefresh = vi.fn();
    const { result, rerender } = renderHook(
      ({ componentId }) => useLibraryComponentValidation({
        componentId,
        onRefresh,
        intervalMs: 0,
      }),
      { initialProps: { componentId: "comp-a" } },
    );

    await act(async () => {
      void result.current.runValidation();
    });
    await act(async () => {
      await Promise.resolve();
    });

    rerender({ componentId: "comp-b" });
    await act(async () => {
      await Promise.resolve();
    });

    expect(signals[0]?.aborted).toBe(true);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("does not refresh B when A's completed job arrives after the UI switched", async () => {
    let resolveStatus: ((response: Response) => void) | undefined;
    vi.mocked(fetchJson).mockResolvedValue({ job_id: "job-1" });
    vi.mocked(fetchApi).mockImplementation(() => new Promise((resolve) => {
      resolveStatus = resolve;
    }));
    const onRefresh = vi.fn();
    const { result, rerender } = renderHook(
      ({ componentId }) => useLibraryComponentValidation({
        componentId,
        onRefresh,
        intervalMs: 0,
      }),
      { initialProps: { componentId: "comp-a" } },
    );

    await act(async () => {
      void result.current.runValidation();
    });
    await act(async () => {
      await Promise.resolve();
    });

    rerender({ componentId: "comp-b" });
    await act(async () => {
      resolveStatus?.(jobResponse({
        status: "completed",
        result_metadata: { component: catalogComponent("comp-a") },
      }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onRefresh).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("ignores a delayed completed job after unmount", async () => {
    let resolveStatus: ((response: Response) => void) | undefined;
    vi.mocked(fetchJson).mockResolvedValue({ job_id: "job-1" });
    vi.mocked(fetchApi).mockImplementation(() => new Promise((resolve) => {
      resolveStatus = resolve;
    }));
    const onRefresh = vi.fn();
    const { result, unmount } = renderHook(() => useLibraryComponentValidation({
      componentId: "comp-a",
      onRefresh,
      intervalMs: 0,
    }));

    await act(async () => {
      void result.current.runValidation();
    });
    await act(async () => {
      await Promise.resolve();
    });

    unmount();
    await act(async () => {
      resolveStatus?.(jobResponse({
        status: "completed",
        result_metadata: { component: catalogComponent("comp-a") },
      }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onRefresh).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("refreshes only after a completed job for the component still on screen", async () => {
    const component = catalogComponent("comp-a", "passed");
    vi.mocked(fetchJson).mockResolvedValue({ job_id: "job-1" });
    vi.mocked(fetchApi)
      .mockResolvedValueOnce(jobResponse({
        status: "retry_wait",
        message: "Waiting to retry",
      }))
      .mockResolvedValueOnce(jobResponse({
        status: "completed",
        result_metadata: { component },
      }));
    const onRefresh = vi.fn();
    const { result } = renderHook(() => useLibraryComponentValidation({
      componentId: "comp-a",
      onRefresh,
      intervalMs: 0,
    }));

    await act(async () => {
      await result.current.runValidation();
    });

    expect(fetchApi).toHaveBeenCalledTimes(2);
    expect(toast.success).toHaveBeenCalledWith("KLC validation passed.");
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("toasts a cancelled job as a warning, not a failure", async () => {
    vi.mocked(fetchJson).mockResolvedValue({ job_id: "job-1" });
    vi.mocked(fetchApi).mockResolvedValueOnce(jobResponse({
      status: "cancelled",
      message: "operator cancelled",
    }));
    const onRefresh = vi.fn();
    const { result } = renderHook(() => useLibraryComponentValidation({
      componentId: "comp-a",
      onRefresh,
      intervalMs: 0,
    }));

    await act(async () => {
      await result.current.runValidation();
    });

    expect(toast.warning).toHaveBeenCalledWith("operator cancelled");
    expect(toast.error).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("toasts a failed job as an error and does not refresh", async () => {
    vi.mocked(fetchJson).mockResolvedValue({ job_id: "job-1" });
    vi.mocked(fetchApi).mockResolvedValueOnce(jobResponse({
      status: "failed",
      error_message: "worker boom",
    }));
    const onRefresh = vi.fn();
    const { result } = renderHook(() => useLibraryComponentValidation({
      componentId: "comp-a",
      onRefresh,
      intervalMs: 0,
    }));

    await act(async () => {
      await result.current.runValidation();
    });

    expect(toast.error).toHaveBeenCalledWith("worker boom");
    expect(toast.warning).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
