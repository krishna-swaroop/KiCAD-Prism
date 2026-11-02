import { useCallback, useState } from "react";

/**
 * The lines switched off in a chart legend. Picking one shows only that line; picking the one shown alone brings the rest back.
 * `all` is every key the legend lists.
 */
export function useHidden() {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const pick = useCallback((key: string, all: readonly string[]) => setHidden((current) => {
    const others = all.filter((item) => item !== key);
    const alone = others.length > 0 && !current.has(key) && others.every((item) => current.has(item));
    return alone ? new Set<string>() : new Set(others);
  }), []);
  return { hidden, pick };
}
