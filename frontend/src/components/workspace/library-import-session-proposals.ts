import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { isAbortError } from "@/lib/jobs";

import type { ProjectComponentImportProposal } from "@/types/catalog";
import { listImportProposals } from "./catalog-client";

/**
 * The proposals of the selected import session. They are read again whenever
 * the session's `status` changes: the poll that sees a scan finish also stops
 * the poll, which aborts that tick's own proposals read, so the finished list
 * would otherwise never load.
 */
export function useImportSessionProposals(selectedSessionId: string, status?: string) {
  const [proposalsBySessionId, setProposalsBySessionId] = useState<
    Record<string, ProjectComponentImportProposal[]>
  >({});

  const loadProposals = useCallback(async (sessionId: string, signal?: AbortSignal) => {
    if (!sessionId) return;
    const response = await listImportProposals(sessionId, signal);
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
  }, [loadProposals, selectedSessionId, status]);

  return {
    proposals: proposalsBySessionId[selectedSessionId] ?? [],
    loadProposals,
  };
}
