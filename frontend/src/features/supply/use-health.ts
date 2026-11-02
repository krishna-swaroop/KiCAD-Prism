import { useCallback, useState } from "react";

import { canEditSupply, canReviewSupply } from "@/lib/roles";
import type { UserRole } from "@/types/auth";
import type { SupplyAssessment } from "@/types/supply";
import { getSupplyAssessment } from "./supply-api";
import { useLoaded } from "./use-loaded";

/** A part's health: the assessment, what the viewer may do with its findings, and a way to act on one and reload. */
export function useHealth(partId: string | null, role: UserRole | null | undefined) {
  const fetcher = useCallback((signal: AbortSignal) => getSupplyAssessment(partId ?? "", undefined, signal), [partId]);
  const assessment = useLoaded<SupplyAssessment>(partId === null ? null : `parts/${partId}/assessment`, fetcher, "Could not load the assessment");
  const [error, setError] = useState("");
  const canApprove = canReviewSupply(role);
  const canPropose = canEditSupply(role) || canApprove;
  const act = async (action: () => Promise<unknown>) => {
    setError("");
    try {
      await action();
      await assessment.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong");
    }
  };
  return { assessment, error, canPropose, canApprove, act };
}
