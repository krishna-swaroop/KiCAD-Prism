import { useEffect } from "react";

import { PANEL_PATH } from "@/lib/kicad-host";
import type { User } from "@/types/auth";
import { PartSheet } from "./part-sheet";

/** KiCad's Remote Symbols panel, open on ``componentId`` when there is one: where closing the part goes back to. */
export function panelAddress(componentId: string | null): string {
  return componentId ? `${PANEL_PATH}?${new URLSearchParams({ component: componentId })}` : PANEL_PATH;
}

/**
 * What the web app shows inside KiCad's Remote Symbols webview: the part the panel's "Open in Prism" names (``part``), alone.
 * KiCad keeps every navigation in that webview, so the workspace is never drawn there. Closing the part goes back to the panel's
 * view of the component it was opened from (``component``); an address that names no part goes straight back.
 */
export function KiCadPartPage({ partId, componentId, user }: { partId: string | null; componentId: string | null; user: User | null }) {
  useEffect(() => {
    if (!partId) window.location.replace(panelAddress(componentId));
  }, [partId, componentId]);
  if (!partId) return null;
  return (
    <PartSheet partId={partId} user={user} onClose={() => window.location.replace(panelAddress(componentId))} onWatchChanged={() => {}} />
  );
}
