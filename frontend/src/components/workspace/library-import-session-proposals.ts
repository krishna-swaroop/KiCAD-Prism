import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { fetchJson } from "@/lib/api";
import type { ProjectComponentImportProposal } from "@/types/catalog";

export function isAbortError(reason: unknown): boolean {
  return (reason instanceof DOMException || reason instanceof Error) && reason.name === "AbortError";
}

export function useImportSessionProposals(selectedSessionId: string) {
  const [proposalsBySessionId, setProposalsBySessionId] = useState<
    Record<string, ProjectComponentImportProposal[]>
  >({});

  const loadProposals = useCallback(async (sessionId: string, signal?: AbortSignal) => {
    if (!sessionId) return;
    const response = await fetchJson<{ items: ProjectComponentImportProposal[] }>(
      `/api/catalog/import-sessions/${sessionId}/proposals`,
      { signal },
    );
    if (signal?.aborted) return;
    // Write under the requested session, never the currently selected one, so a
    // late response from A cannot replace B's visible list.
    setProposalsBySessionId((current) => ({ ...current, [sessionId]: response.items }));
  }, []);

  useEffect(() => {
    if (!selectedSessionId) return;
    const controller = new AbortController();
    void loadProposals(selectedSessionId, controller.signal).catch((error) => {
      if (controller.signal.aborted || isAbortError(error)) return;
      toast.error(error instanceof Error ? error.message : "Failed to load import proposals");
    });
    return () => controller.abort();
  }, [loadProposals, selectedSessionId]);

  return {
    proposals: proposalsBySessionId[selectedSessionId] ?? [],
    loadProposals,
  };
}

export function useNonOverlappingPoll(
  enabled: boolean,
  tick: (signal: AbortSignal) => Promise<void>,
  intervalMs = 2000,
) {
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let inFlight = false;
    const run = async () => {
      if (inFlight || controller.signal.aborted) return;
      inFlight = true;
      try {
        await tick(controller.signal);
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) return;
        toast.error(error instanceof Error ? error.message : "Failed to refresh import sessions");
      } finally {
        inFlight = false;
      }
    };
    const timer = window.setInterval(() => {
      void run();
    }, intervalMs);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [enabled, intervalMs, tick]);
}
