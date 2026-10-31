import { useCallback } from "react";

import type { SupplyConnector, SupplyProvider } from "@/types/supply";
import { listSupplyConnectors, listSupplyProviders } from "./supply-api";
import { invalidateSupply, useLoaded } from "./use-loaded";

const providersFetcher = (signal: AbortSignal) => listSupplyProviders(signal);
const connectorsFetcher = (signal: AbortSignal) => listSupplyConnectors(signal);

/** The connectors, the one read every screen shares. */
export function useConnectorList() {
  return useLoaded<SupplyConnector[]>("connectors", connectorsFetcher, "Could not load connectors");
}

/** Providers and connectors for the Sources tab. A change reads the connectors again wherever they show. */
export function useSupplyConnectors() {
  const providers = useLoaded<SupplyProvider[]>("providers", providersFetcher, "Could not load providers");
  const connectors = useConnectorList();
  const status = providers.status === "error" || connectors.status === "error" ? "error"
    : providers.status === "ready" && connectors.status === "ready" ? "ready" : "loading";
  const changed = useCallback(() => void invalidateSupply("connectors"), []);
  const { retry: retryProviders } = providers;
  const { retry: retryConnectors } = connectors;
  const reload = useCallback(() => { retryProviders(); retryConnectors(); }, [retryProviders, retryConnectors]);
  return {
    status,
    providers: providers.data ?? [],
    connectors: connectors.data ?? [],
    error: providers.error || connectors.error,
    // The server's answer is the truth; a saved or removed connector is read again rather than patched in place.
    apply: changed as (connector?: SupplyConnector) => void,
    remove: changed as (id?: string) => void,
    reload,
    refresh: () => invalidateSupply("connectors"),
  };
}
