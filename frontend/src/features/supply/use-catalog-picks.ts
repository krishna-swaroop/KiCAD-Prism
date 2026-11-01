import { useCallback, useState } from "react";

export interface CatalogPicks {
  picked: ReadonlySet<string>;
  toggle: (id: string) => void;
  clear: () => void;
}

/** The catalog rows someone picked (ctrl-click) to watch. Kept out of the catalog workspace on purpose. */
export function useCatalogPicks(): CatalogPicks {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const toggle = useCallback((id: string) => {
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);
  const clear = useCallback(() => setPicked(new Set()), []);
  return { picked, toggle, clear };
}
