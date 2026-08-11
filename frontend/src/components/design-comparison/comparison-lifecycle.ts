/**
 * Old/New has no slot of its own: it shows whichever of the two revision
 * viewers the side-by-side layout already mounts, so its readiness is that
 * slot's readiness.
 */
export type ComparisonHostSlot = "composite" | "base" | "compare";

export type ComparisonHostPhase =
    | "idle"
    | "waiting-layout"
    | "loading"
    | "ready"
    | "error";

export type ComparisonHostState = {
    key: string | null;
    phase: ComparisonHostPhase;
    error: string | null;
    layoutReady: boolean;
};

export type ComparisonLifecycleState = Record<
    ComparisonHostSlot,
    ComparisonHostState
>;

export type ComparisonLifecycleAction =
    | { type: "attach"; slot: ComparisonHostSlot; key: string }
    | { type: "layout-ready"; slot: ComparisonHostSlot; key: string }
    | {
          type: "transition";
          slot: ComparisonHostSlot;
          key: string;
          phase: ComparisonHostPhase;
          error?: string | null;
      }
    | { type: "detach"; slot: ComparisonHostSlot };

const emptyHost = (): ComparisonHostState => ({
    key: null,
    phase: "idle",
    error: null,
    layoutReady: false,
});

export function createComparisonLifecycleState(): ComparisonLifecycleState {
    return {
        composite: emptyHost(),
        base: emptyHost(),
        compare: emptyHost(),
    };
}

export function comparisonLifecycleReducer(
    state: ComparisonLifecycleState,
    action: ComparisonLifecycleAction,
): ComparisonLifecycleState {
    if (action.type === "detach") {
        return {
            ...state,
            [action.slot]: emptyHost(),
        };
    }

    const current = state[action.slot];
    if (action.type === "attach") {
        if (current.key === action.key) return state;
        return {
            ...state,
            [action.slot]: {
                key: action.key,
                phase: "waiting-layout",
                error: null,
                layoutReady: false,
            },
        };
    }

    if (action.type === "layout-ready") {
        if (current.key !== action.key || current.layoutReady) return state;
        return {
            ...state,
            [action.slot]: {
                ...current,
                layoutReady: true,
            },
        };
    }

    if (
        current.key === action.key
        && current.phase === action.phase
        && current.error === (action.error ?? null)
    ) {
        return state;
    }

    return {
        ...state,
        [action.slot]: {
            key: action.key,
            phase: action.phase,
            error: action.error ?? null,
            layoutReady: current.key === action.key
                ? current.layoutReady
                : false,
        },
    };
}
