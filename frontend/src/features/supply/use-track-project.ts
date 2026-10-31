import { useCallback, useMemo, useState } from "react";

import type { ProjectTrackingState } from "@/types/supply";
import type { ProjectPackaging } from "./track-choose-step";
import { getAssessmentSettings } from "./supply-api";
import { getProjectTracking, previewTrackProject, readProjectBom } from "./tracking-api";
import { invalidateSupply, isRunning, useLoaded } from "./use-loaded";
import { useConnectorList } from "./use-supply-connectors";

const READ_POLL_MS = 5000;

const settingsFetcher = (signal: AbortSignal) => getAssessmentSettings(signal);

/** What the track dialog works from: the project's state, the distributors, the choices, and the cost of the choices. */
export function useTrackProject(projectId: string) {
  const trackingFetcher = useCallback((signal: AbortSignal) => getProjectTracking(projectId, signal), [projectId]);
  const tracking = useLoaded<ProjectTrackingState>(`projects/${projectId}/tracking`, trackingFetcher, "Could not load the project's tracking");
  const state = tracking.data;
  const list = useConnectorList().data;
  const connectors = useMemo(() => (list ?? []).filter((item) => item.enabled && item.metered), [list]);
  // The workspace's preferred order of distributors puts them first in the choice.
  const settings = useLoaded("settings/assessment", settingsFetcher, "Could not load the settings").data?.settings;
  const order = useMemo(() => (settings?.prefer_distributors ? (settings.distributor_order ?? []) : []), [settings]);

  // The choices start from the tracked project's own, once it is known.
  const [seeded, setSeeded] = useState<ProjectTrackingState | null>(null);
  const [variants, setVariants] = useState<string[]>([""]);
  const [allVariants, setAllVariants] = useState(false);
  const [packaging, setPackaging] = useState<ProjectPackaging>("cut_tape");
  const [buildQuantity, setBuildQuantity] = useState(100);
  const [spares, setSpares] = useState("");
  const [chosen, setChosen] = useState<string[] | null>(null);
  if (state && seeded === null) {
    setSeeded(state);
    if (state.tracked) {
      setVariants(state.tracked.variants);
      setAllVariants(state.tracked.all_variants);
      setChosen(state.tracked.connector_ids);
      setPackaging(state.tracked.packaging ?? "cut_tape");
      setBuildQuantity(state.tracked.build_quantity ?? 100);
      setSpares(state.tracked.spares ?? "");
    }
  }
  const [failed, setError] = useState("");
  const [again, setAgain] = useState(0);

  // A project whose BOM Prism has not read: read it, or queue its index and look again until it lands.
  const needsRead = state != null && !state.has_usage;
  const readFetcher = useCallback(() => readProjectBom(projectId), [projectId]);
  const read = useLoaded(needsRead ? `projects/${projectId}/read/track` : null, readFetcher, "Could not read the project's BOM", {
    refreshEvery: READ_POLL_MS, refreshWhile: isRunning,
  });
  const readState = read.data?.state;
  const [readSeen, setReadSeen] = useState<string | undefined>(undefined);
  if (readState !== readSeen) {
    setReadSeen(readState);
    if (readState !== undefined && readState !== "running") void invalidateSupply(`projects/${projectId}/tracking`);
  }

  // Distributors for the choice: the ones every project uses by default, plus any assembly-only one a person adds.
  const defaults = useMemo(() => connectors.flatMap((item) => (item.assembly_only ? [] : [item.id])), [connectors]);
  const assembly = useMemo(() => connectors.filter((item) => item.assembly_only), [connectors]);
  const regular = useMemo(() => {
    const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length);
    return connectors.filter((item) => !item.assembly_only).sort((a, b) => rank(a.id) - rank(b.id));
  }, [connectors, order]);
  const ids = chosen ?? defaults;
  const choice = useMemo(
    () => ({ variants, all_variants: allVariants, packaging, connector_ids: chosen, build_quantity: buildQuantity, spares }),
    [variants, allVariants, packaging, chosen, buildQuantity, spares],
  );

  const previewFetcher = useCallback((signal: AbortSignal) => previewTrackProject(projectId, choice, signal), [projectId, choice]);
  const previewed = useLoaded(
    state?.has_usage ? `projects/${projectId}/track-preview/${again}|${JSON.stringify(choice)}` : null, previewFetcher, "Could not work out the cost",
  );
  const preview = previewed.data;
  const error = failed || (previewed.status === "error" ? previewed.error : "") || (read.status === "error" ? read.error : "") || (tracking.status === "error" ? tracking.error : "");

  return {
    state, connectors, setError, error, needsRead, preview, choice, assembly, regular, ids,
    variants, allVariants, packaging, buildQuantity, spares, setAllVariants, setPackaging, setBuildQuantity, setSpares,
    recheck: () => { setError(""); setAgain((count) => count + 1); },
    reload: () => { void invalidateSupply("connectors"); setAgain((count) => count + 1); },
    toggleVariant: (name: string, on: boolean) => setVariants((current) => (on ? [...current, name] : current.filter((item) => item !== name))),
    toggleConnector: (id: string, on: boolean) => setChosen(on ? [...ids, id] : ids.filter((item) => item !== id)),
  };
}
