import { useCallback, useEffect, useRef, useState } from "react";

import { useCommittedRef } from "@/hooks/use-committed-ref";
import type {
  CatalogAuditEvent,
  CatalogAuditVerification,
  CatalogComponentUsage,
  CatalogReleaseRecord,
  CatalogReviewDecision,
  CatalogRevisionSummary,
} from "@/types/catalog";

export type EvidenceLoadState = {
  status: "idle" | "loading" | "loaded" | "error";
  error: string;
  generation?: string;
};

export const IDLE_EVIDENCE: EvidenceLoadState = { status: "idle", error: "" };

export type EvidenceValues = {
  revisions: CatalogRevisionSummary[];
  events: CatalogAuditEvent[];
  verification: CatalogAuditVerification | null;
  usage: CatalogComponentUsage[];
  reviews: CatalogReviewDecision[];
  releases: CatalogReleaseRecord[];
};

export type EvidenceBundle = EvidenceValues & { generation: string };

export const EMPTY_EVIDENCE: EvidenceValues = {
  revisions: [],
  events: [],
  verification: null,
  usage: [],
  reviews: [],
  releases: [],
};

export function useEvidenceLoadState() {
  const [state, setState] = useState<EvidenceLoadState>(IDLE_EVIDENCE);
  const stateRef = useRef<EvidenceLoadState>(IDLE_EVIDENCE);
  const update = useCallback((next: EvidenceLoadState) => {
    stateRef.current = next;
    setState(next);
  }, []);
  return { state, stateRef, update };
}

/**
 * Load one tab's evidence once per component generation.
 *
 * Each tab used to carry its own copy of this. The parts that look incidental
 * are not: the `idle` check is what stops a re-render re-requesting, `settled`
 * distinguishes "aborted before it answered" (reset to idle so the next visit
 * retries) from "answered" (leave the outcome alone), and the generation string
 * ties a response to the component revision it was asked for.
 */
export function useEvidenceResource<T>({
  enabled,
  generation,
  retryKey,
  load,
  loadState,
  onLoaded,
}: {
  enabled: boolean;
  generation: string;
  retryKey: number;
  load: (signal: AbortSignal) => Promise<T>;
  loadState: ReturnType<typeof useEvidenceLoadState>;
  onLoaded: (value: T) => void;
}) {
  const { stateRef, update } = loadState;
  const loadRef = useCommittedRef(load);
  const onLoadedRef = useCommittedRef(onLoaded);

  useEffect(() => {
    // A result belonging to an earlier generation is not a result: it is the
    // previous component's, and counts as nothing loaded. Without this the
    // status stays "loaded" across a component change and the guard below
    // refuses to fetch the new one -- which is why the workspace used to reset
    // every load state by hand.
    const settledElsewhere = stateRef.current.generation !== undefined
      && stateRef.current.generation !== generation;
    if (!enabled || (!settledElsewhere && stateRef.current.status !== "idle")) return;
    const controller = new AbortController();
    let settled = false;
    update({ status: "loading", error: "", generation });
    void loadRef
      .current(controller.signal)
      .then((value) => {
        settled = true;
        if (controller.signal.aborted) return;
        onLoadedRef.current(value);
        update({ status: "loaded", error: "", generation });
      })
      .catch((reason: unknown) => {
        settled = true;
        if (controller.signal.aborted) return;
        update({
          status: "error",
          error: reason instanceof Error ? reason.message : String(reason),
          generation,
        });
      });
    return () => {
      controller.abort();
      if (!settled) update(IDLE_EVIDENCE);
    };
  }, [enabled, generation, loadRef, onLoadedRef, retryKey, stateRef, update]);
}

export function combinedEvidenceState(states: EvidenceLoadState[]): EvidenceLoadState {
  const failed = states.find((state) => state.status === "error");
  if (failed) return failed;
  if (states.some((state) => state.status !== "loaded")) return { status: "loading", error: "" };
  return { status: "loaded", error: "" };
}
