import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import type {
  ProbeEvent,
  ProbeKind,
  RenderController,
} from "@/lib/ecad-renderer";
import { cn } from "@/lib/utils";

export type LibraryProbeSelection = Exclude<ProbeEvent, { phase: "clear" }>;

interface LibraryCrossProbeValue {
  active: LibraryProbeSelection | null;
  matched: boolean;
  clear(): void;
  handleProbe(event: ProbeEvent): void;
  register(
    kind: "symbol" | "footprint",
    controller: RenderController,
  ): () => void;
}

const LibraryCrossProbeContext = createContext<LibraryCrossProbeValue | null>(
  null,
);

const viewerKind = (source: ProbeKind) =>
  source === "pin" ? "symbol" : "footprint";

export function LibraryCrossProbeProvider({
  resetKey,
  initialLatched = null,
  onLatchedChange,
  className,
  children,
}: {
  resetKey: string;
  initialLatched?: LibraryProbeSelection | null;
  onLatchedChange?: (probe: LibraryProbeSelection | null) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <LibraryCrossProbeSession
      key={resetKey}
      initialLatched={initialLatched}
      onLatchedChange={onLatchedChange}
      className={className}
    >
      {children}
    </LibraryCrossProbeSession>
  );
}

function LibraryCrossProbeSession({
  initialLatched,
  onLatchedChange,
  className,
  children,
}: {
  initialLatched: LibraryProbeSelection | null;
  onLatchedChange?: (probe: LibraryProbeSelection | null) => void;
  className?: string;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const controllersRef = useRef({
    symbol: new Set<RenderController>(),
    footprint: new Set<RenderController>(),
  });
  const [registryVersion, setRegistryVersion] = useState(0);
  const [hovered, setHovered] = useState<LibraryProbeSelection | null>(null);
  const [latched, setLatched] =
    useState<LibraryProbeSelection | null>(initialLatched);
  const [matched, setMatched] = useState(false);
  const hoveredRef = useRef<LibraryProbeSelection | null>(null);
  const latchedRef = useRef<LibraryProbeSelection | null>(initialLatched);
  const active = hovered ?? latched;

  const applyHighlight = useCallback(
    (
      probe: LibraryProbeSelection | null,
      state: "hover" | "latched" = "hover",
    ) => {
      const registry = controllersRef.current;
      for (const controller of [...registry.symbol, ...registry.footprint]) {
        controller.clearProbeHighlight();
      }
      if (!probe) {
        setMatched(false);
        return;
      }

      const sourceKind = viewerKind(probe.source);
      const targetKind = sourceKind === "symbol" ? "footprint" : "symbol";
      for (const controller of registry[sourceKind]) {
        controller.setProbeHighlight(probe.index, state);
      }
      let targetMatches = 0;
      for (const controller of registry[targetKind]) {
        targetMatches += controller.setProbeHighlight(probe.crossIndex, state);
      }
      setMatched(targetMatches > 0);
    },
    [],
  );

  const clear = useCallback(() => {
    hoveredRef.current = null;
    latchedRef.current = null;
    applyHighlight(null);
    setHovered(null);
    setLatched(null);
    onLatchedChange?.(null);
  }, [applyHighlight, onLatchedChange]);

  const handleProbe = useCallback(
    (event: ProbeEvent) => {
      if (event.phase === "clear") {
        clear();
        return;
      }
      if (event.phase === "hover") {
        hoveredRef.current = event;
        applyHighlight(event, "hover");
        setHovered(event);
        return;
      }
      if (event.phase === "leave") {
        if (hoveredRef.current?.index !== event.index) return;
        hoveredRef.current = null;
        applyHighlight(latchedRef.current, "latched");
        setHovered(null);
        return;
      }
      hoveredRef.current = null;
      latchedRef.current = event;
      applyHighlight(event, "latched");
      setLatched(event);
      setHovered(null);
      onLatchedChange?.(event);
    },
    [applyHighlight, clear, onLatchedChange],
  );

  const register = useCallback(
    (kind: "symbol" | "footprint", controller: RenderController) => {
      const controllers = controllersRef.current[kind];
      controllers.add(controller);
      setRegistryVersion((value) => value + 1);
      return () => {
        controller.clearProbeHighlight();
        if (controllers.delete(controller)) {
          setRegistryVersion((value) => value + 1);
        }
      };
    },
    [],
  );

  useEffect(() => {
    const probe = hoveredRef.current ?? latchedRef.current;
    applyHighlight(probe, hoveredRef.current ? "hover" : "latched");
  }, [applyHighlight, registryVersion]);

  useEffect(
    () => () => {
      for (const controller of [
        ...controllersRef.current.symbol,
        ...controllersRef.current.footprint,
      ]) {
        controller.clearProbeHighlight();
      }
    },
    [],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || !active) return;
    event.preventDefault();
    event.stopPropagation();
    clear();
  };

  const value = useMemo<LibraryCrossProbeValue>(
    () => ({ active, matched, clear, handleProbe, register }),
    [active, matched, clear, handleProbe, register],
  );

  return (
    <LibraryCrossProbeContext.Provider value={value}>
      <div
        ref={rootRef}
        tabIndex={-1}
        className={cn("focus:outline-none", className)}
        onKeyDownCapture={onKeyDown}
        onPointerDownCapture={() =>
          rootRef.current?.focus({ preventScroll: true })
        }
      >
        {children}
      </div>
    </LibraryCrossProbeContext.Provider>
  );
}

export function useLibraryCrossProbe() {
  return useContext(LibraryCrossProbeContext);
}

export function LibraryProbeBadge() {
  const probe = useLibraryCrossProbe();
  if (!probe?.active) return null;
  const { active, matched } = probe;
  const label = matched
    ? `Pin ${active.number} ↔ Pad ${active.number}`
    : `${active.source === "pin" ? "Pin" : "Pad"} ${active.number}`;
  return (
    <span
      className="inline-flex items-center border bg-background/90 px-2 py-1 text-[10px] font-medium text-foreground shadow-sm"
      aria-live="polite"
    >
      {label}
    </span>
  );
}
