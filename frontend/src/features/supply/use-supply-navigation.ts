import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/** Moving between Supply tabs from inside one. The URL holds the place, as everywhere else in Supply. */
export function useSupplyNavigation() {
  const [, setSearchParams] = useSearchParams();

  const go = useCallback((view: string, extra: Record<string, string> = {}) => {
    setSearchParams((current) => {
      const updated = new URLSearchParams(current);
      updated.set("section", "supply");
      updated.set("supplyView", view);
      for (const key of ["part", "partsQ", "partsScope", "partsOnly", "tool"]) updated.delete(key);
      for (const [key, value] of Object.entries(extra)) updated.set(key, value);
      return updated;
    });
  }, [setSearchParams]);

  // A part opens where you are: its sheet is drawn by the tab being shown (``OpenPartSheet``), and closing it leaves you there.
  const openPart = useCallback((partId: string) => setSearchParams((current) => {
    const updated = new URLSearchParams(current);
    updated.set("section", "supply");
    updated.set("part", partId);
    return updated;
  }), [setSearchParams]);
  return { go, openPart };
}
