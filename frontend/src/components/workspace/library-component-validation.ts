import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { fetchJson } from "@/lib/api";
import { useCommittedRef } from "@/hooks/use-committed-ref";
import { watchPrismJob, type PrismJobStatus } from "@/lib/jobs";
import type { CatalogComponent } from "@/types/catalog";

/**
 * Catalog KLC validation is a resumable fenced job. The browser watches the
 * unified job endpoint and must never cancel backend work because a view
 * closed. `retry_wait` is not terminal — `watchPrismJob` keeps polling.
 */

export type CatalogValidationOutcome =
  | { kind: "completed"; component: CatalogComponent }
  | { kind: "completed_without_component"; error: string }
  | { kind: "failed"; error: string }
  | { kind: "cancelled"; message: string };

type CatalogValidationJobPayload = {
  component?: unknown;
  errors?: unknown;
  result?: {
    component?: unknown;
    errors?: unknown;
  };
};

const MISSING_COMPONENT_ERROR = "Validation did not return an updated component.";

export function isValidationWatchAbort(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === "AbortError";
}

function isCatalogComponent(value: unknown): value is CatalogComponent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CatalogComponent>;
  return typeof candidate.id === "string"
    && typeof candidate.revision_id === "string"
    && typeof candidate.validation === "object"
    && candidate.validation !== null;
}

function readErrors(source: unknown): Array<{ error: string }> {
  if (!Array.isArray(source)) return [];
  return source.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const error = (entry as { error?: unknown }).error;
    return typeof error === "string" && error ? [{ error }] : [];
  });
}

function readComponent(source: unknown): CatalogComponent | null {
  if (isCatalogComponent(source)) return source;
  if (!source || typeof source !== "object") return null;
  const payload = source as CatalogValidationJobPayload;
  if (isCatalogComponent(payload.component)) return payload.component;
  if (isCatalogComponent(payload.result?.component)) return payload.result.component;
  return null;
}

function collectErrors(source: unknown): Array<{ error: string }> {
  const fromRoot = readErrors((source as CatalogValidationJobPayload | undefined)?.errors);
  if (fromRoot.length) return fromRoot;
  return readErrors((source as CatalogValidationJobPayload | undefined)?.result?.errors);
}

function jobFailureMessage(job: PrismJobStatus, fallback: string): string {
  return job.error_message || job.message || fallback;
}

export async function resolveCatalogValidationResult(
  job: PrismJobStatus,
  signal?: AbortSignal,
): Promise<CatalogValidationOutcome> {
  if (job.status === "cancelled") {
    return {
      kind: "cancelled",
      message: jobFailureMessage(job, "KLC validation was cancelled."),
    };
  }
  if (job.status === "failed") {
    return {
      kind: "failed",
      error: jobFailureMessage(job, "KLC validation failed."),
    };
  }

  let component = readComponent(job.result_metadata);
  let errors = collectErrors(job.result_metadata);
  if (!component) {
    try {
      const legacy = await fetchJson<CatalogValidationJobPayload>(
        `/api/catalog/validation/jobs/${encodeURIComponent(job.job_id)}`,
        { signal },
      );
      component = readComponent(legacy);
      if (!errors.length) errors = collectErrors(legacy);
    } catch (reason) {
      if (isValidationWatchAbort(reason)) throw reason;
    }
  }
  if (component) return { kind: "completed", component };
  return {
    kind: "completed_without_component",
    error: errors[0]?.error || MISSING_COMPONENT_ERROR,
  };
}

export async function watchCatalogValidationJob(
  jobId: string,
  {
    signal,
    intervalMs,
    onUpdate,
  }: {
    signal: AbortSignal;
    intervalMs?: number;
    onUpdate?: (job: PrismJobStatus) => void;
  },
): Promise<CatalogValidationOutcome> {
  const job = await watchPrismJob(jobId, { signal, intervalMs, onUpdate });
  return resolveCatalogValidationResult(job, signal);
}

export function applyCatalogValidationOutcome(outcome: CatalogValidationOutcome): void {
  if (outcome.kind === "failed" || outcome.kind === "completed_without_component") {
    toast.error(outcome.error);
    return;
  }
  if (outcome.kind === "cancelled") {
    toast.warning(outcome.message);
    return;
  }
  if (outcome.component.validation.status === "failed") {
    toast.error("KLC validation found blocking errors.");
    return;
  }
  if (outcome.component.validation.status === "warning") {
    toast.warning("KLC validation completed with warnings.");
    return;
  }
  toast.success("KLC validation passed.");
}

export function useLibraryComponentValidation({
  componentId,
  onRefresh,
  intervalMs,
}: {
  componentId: string;
  onRefresh: () => void;
  intervalMs?: number;
}) {
  const [validationBusy, setValidationBusy] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const originatingIdRef = useRef<string | null>(null);
  const componentIdRef = useCommittedRef(componentId);
  const onRefreshRef = useCommittedRef(onRefresh);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    return () => {
      // Close the browser watcher only. The backend job stays resumable.
      controller.abort();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [componentId]);

  const runValidation = useCallback(async () => {
    const originatingId = componentId;
    const controller = controllerRef.current;
    if (!controller || controller.signal.aborted) return;
    originatingIdRef.current = originatingId;
    setValidationBusy(true);
    try {
      const queued = await fetchJson<{ job_id: string }>(
        `/api/catalog/components/${encodeURIComponent(originatingId)}/validate`,
        { method: "POST", signal: controller.signal },
      );
      toast.message("KLC validation started.");
      let lastNotice = "";
      const outcome = await watchCatalogValidationJob(queued.job_id, {
        signal: controller.signal,
        intervalMs,
        onUpdate: (job) => {
          if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
            return;
          }
          const notice = job.message || "KLC validation is still running.";
          if (notice === lastNotice) return;
          lastNotice = notice;
          toast.message(notice);
        },
      });
      if (controller.signal.aborted || componentIdRef.current !== originatingId) return;
      applyCatalogValidationOutcome(outcome);
      if (outcome.kind === "completed") onRefreshRef.current();
    } catch (reason) {
      if (isValidationWatchAbort(reason) || controller.signal.aborted) return;
      if (componentIdRef.current !== originatingId) return;
      toast.error(reason instanceof Error ? reason.message : String(reason));
    } finally {
      // An unconditional reset would let an aborted run for A clear B's
      // in-flight spinner after the user switched components.
      if (!controller.signal.aborted && componentIdRef.current === originatingId) {
        originatingIdRef.current = null;
        // react-doctor-disable-next-line react-doctor/no-loading-flag-reset-outside-finally - aborting a watcher must not clear a later component's validation busy state
        setValidationBusy(false);
      }
    }
  }, [componentId, componentIdRef, intervalMs, onRefreshRef]);

  return {
    runValidation,
    validationBusy: validationBusy && originatingIdRef.current === componentId,
  };
}
