import { useCallback } from "react";
import { toast } from "sonner";

import type { SupplyConnector } from "@/types/supply";
import type { ConnectorAction } from "./connector-card";
import {
  resumeSupplyConnector,
  updateSupplyConnector,
} from "./supply-api";

type QuickAction = Extract<ConnectorAction, "resume" | "enable" | "disable" | "apply-reset">;

const QUICK: Record<QuickAction, { run: (connector: SupplyConnector) => Promise<SupplyConnector>; done: string }> = {
  resume: { run: (connector) => resumeSupplyConnector(connector.id), done: "Connector resumed" },
  enable: { run: (connector) => updateSupplyConnector(connector.id, { enabled: true }), done: "Connector enabled" },
  disable: { run: (connector) => updateSupplyConnector(connector.id, { enabled: false }), done: "Connector disabled" },
  "apply-reset": {
    run: (connector) => {
      const guess = connector.reset_suggestion;
      if (!guess) return Promise.reject(new Error("There is no reset time to apply"));
      return updateSupplyConnector(connector.id, { reset_time: guess.suggested, reset_tz: guess.tz, reset_from_provider: true });
    },
    done: "Reset time set from the provider's readings",
  },
};

export function isQuickAction(action: ConnectorAction): action is QuickAction {
  return action in QUICK;
}

/** Actions that need no form: call the API, update the list, say what happened. */
export function useQuickConnectorActions(apply: (connector: SupplyConnector) => void) {
  return useCallback(
    async (action: QuickAction, connector: SupplyConnector) => {
      try {
        apply(await QUICK[action].run(connector));
        toast.success(QUICK[action].done);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "The change was not saved");
      }
    },
    [apply],
  );
}
