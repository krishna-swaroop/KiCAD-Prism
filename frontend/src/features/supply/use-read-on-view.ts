import { useEffect, useRef } from "react";

import { readSupplyPartOnView } from "./supply-api";

/** Once per part opened: ask the server to read it if its prices have aged out, and reload when it read something. */
export function useReadOnView(partId: string, onRead: () => Promise<void>): void {
  const latest = useRef(onRead);
  useEffect(() => {
    latest.current = onRead;
  });
  useEffect(() => {
    let live = true;
    readSupplyPartOnView(partId)
      .then((result) => (live && result.read > 0 ? latest.current() : undefined))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [partId]);
}
