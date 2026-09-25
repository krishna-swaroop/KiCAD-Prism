import { useCallback, useLayoutEffect, useRef } from "react";

import { AssetTextHttpError } from "@/lib/ecad-renderer";
import { loadPanelAssetText } from "./panel-api";

/** Own preview authentication recovery for one mounted detail screen. */
export function usePanelAssetLoader(onAuthRequired: () => void) {
  const lifetime = useRef<{ active: boolean; authReported: boolean } | null>(null);
  // Establish ownership before child preview passive effects start requests.
  useLayoutEffect(() => {
    const current = { active: true, authReported: false };
    lifetime.current = current;
    return () => { current.active = false; };
  }, []);

  return useCallback(async (url: string) => {
    const current = lifetime.current;
    try {
      return await loadPanelAssetText(url);
    } catch (error) {
      if (current?.active && !current.authReported && error instanceof AssetTextHttpError
        && (error.status === 401 || error.status === 403)) {
        current.authReported = true;
        onAuthRequired();
      }
      throw error;
    }
  }, [onAuthRequired]);
}
