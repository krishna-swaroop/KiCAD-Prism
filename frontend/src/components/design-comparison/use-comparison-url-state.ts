import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    type Dispatch,
    type SetStateAction,
} from "react";
import { useSearchParams } from "react-router-dom";
import {
    applyWorkspaceComparisonParams,
    readComparisonUrlState,
    type ComparisonPresentationMode,
    type ComparisonUrlTab,
} from "./comparison-url";
import type { ComparisonSelection } from "./comparison-selection-bridge";

/**
 * The five pieces of comparison state that live in the address bar.
 *
 * They live there because the URL is what a reviewer pastes into a ticket, so
 * the tab, the focused change, the presentation and the layer visibility all
 * have to survive a copy. That makes the URL their store, not a copy of it:
 * this hook reads them out during render and writes them back through setters
 * that look like `useState`, so callers cannot tell the difference.
 *
 * There used to be a `useState` for each one and a pair of effects mirroring
 * both directions. A mirror has to be corrected after the fact, and the two
 * effects took turns doing it: an arriving link needed a render to reach state,
 * a click needed a render to reach the URL, and every setter had to return its
 * own current value when nothing changed or the pair would drive each other in
 * a loop. Deriving instead means there is only one value, so there is nothing
 * to keep in step.
 */

export type ComparisonUrlView = {
    activeTab: ComparisonUrlTab;
    presentationOverride: ComparisonPresentationMode | null;
    selection: ComparisonSelection;
    showSecondary: boolean;
    visibleLayers: string[];
};

export type ComparisonUrlState = ComparisonUrlView & {
    setActiveTab: Dispatch<SetStateAction<ComparisonUrlTab>>;
    setPresentationOverride: Dispatch<
        SetStateAction<ComparisonPresentationMode | null>
    >;
    setSelection: Dispatch<SetStateAction<ComparisonSelection>>;
    setShowSecondary: Dispatch<SetStateAction<boolean>>;
    setVisibleLayers: Dispatch<SetStateAction<string[]>>;
};

/**
 * The shareable half of the comparison, read out of a query string.
 *
 * Exported because the same read seeds tests and any caller that has params
 * but no router around it.
 */
export function readComparisonUrlView(
    search: string | URLSearchParams = window.location.search,
): ComparisonUrlView {
    const state = readComparisonUrlState(search);
    return {
        activeTab: state.diff,
        presentationOverride: state.presentationOverride,
        selection: state.group
            ? state.reference
                ? {
                    kind: "instance",
                    id: state.group,
                    reference: state.reference,
                    ...(state.documentPath ? { documentPath: state.documentPath } : {}),
                }
                : {
                    kind: "group",
                    id: state.group,
                    ...(state.documentPath ? { documentPath: state.documentPath } : {}),
                }
            : state.item
                ? {
                    kind: "item",
                    id: state.item,
                    ...(state.documentPath ? { documentPath: state.documentPath } : {}),
                }
                : null,
        showSecondary: state.showSecondary,
        visibleLayers: state.layers,
    };
}

export function useComparisonUrlState(
    identity: { base: string; compare: string },
): ComparisonUrlState {
    const { base, compare } = identity;
    const [searchParams, setSearchParams] = useSearchParams();
    const parsed = useMemo(
        () => readComparisonUrlView(searchParams),
        [searchParams],
    );
    /**
     * Layer visibility is the one value read back as an array, and a fresh
     * array on every unrelated URL change is not free: the pcb shell keeps
     * `initialVisibleLayers` in the dep array of the effect that registers its
     * viewer listeners and re-applies saved visibility, so a new identity
     * makes selecting a change tear that down and rebuild it. Keyed on the raw
     * parameter, the identity changes only when the layers actually do.
     */
    const layersParam = searchParams.get("layers") ?? "";
    const visibleLayers = useMemo(
        () => layersParam.split(",").filter(Boolean),
        [layersParam],
    );
    const view = useMemo(
        () => ({ ...parsed, visibleLayers }),
        [parsed, visibleLayers],
    );

    /**
     * `setSearchParams` hands its callback the params captured at render, not
     * whatever an earlier call in the same handler already wrote, and each call
     * navigates on its own. Two updates in one handler would therefore keep
     * only the second. Each write parks its result here so the next one starts
     * from it.
     *
     * Only handlers read `pendingRef`, never render, so clearing it in an
     * effect is early enough: the effect runs once the navigation lands, and
     * no setter can fire between that commit and the effect. Between the
     * landing render and the effect the parked copy still describes the URL
     * that just settled, so reading it cannot diverge.
     */
    const pendingRef = useRef<URLSearchParams | null>(null);
    useEffect(() => {
        pendingRef.current = null;
    }, [searchParams]);

    const update = useCallback(
        (change: (current: ComparisonUrlView) => Partial<ComparisonUrlView>) => {
            const current = pendingRef.current ?? searchParams;
            const currentView = readComparisonUrlView(current);
            const next = applyWorkspaceComparisonParams(current, {
                base,
                compare,
                ...currentView,
                ...change(currentView),
            });
            /**
             * A write that would not change the address bar must not navigate.
             *
             * `setSearchParams` navigates whatever it is handed, and every
             * navigation is a new location object and so a new render. Callers
             * legitimately write a value that is already set -- the selection
             * re-anchor clears an already-empty selection on every pass -- and
             * with an unmemoised value in its dependency list that effect runs
             * on each of those renders, so the pair span forever. The same
             * write against `useState` was a bail-out and cost nothing; this
             * keeps that property.
             */
            if (next.toString() === current.toString()) return;
            pendingRef.current = next;
            // Replacing rather than pushing so the back button leaves the
            // comparison instead of walking every selection made inside it.
            setSearchParams(next, { replace: true });
        },
        [base, compare, searchParams, setSearchParams],
    );

    const setters = useMemo(() => {
        // None of the five values is itself a function, so the `SetStateAction`
        // check is unambiguous.
        const setter = <K extends keyof ComparisonUrlView>(key: K) =>
            ((value: SetStateAction<ComparisonUrlView[K]>) => {
                update((current) => ({
                    [key]: typeof value === "function"
                        ? (value as (
                            previous: ComparisonUrlView[K],
                        ) => ComparisonUrlView[K])(current[key])
                        : value,
                } as Partial<ComparisonUrlView>));
            }) as Dispatch<SetStateAction<ComparisonUrlView[K]>>;
        return {
            setActiveTab: setter("activeTab"),
            setPresentationOverride: setter("presentationOverride"),
            setSelection: setter("selection"),
            setShowSecondary: setter("showSecondary"),
            setVisibleLayers: setter("visibleLayers"),
        };
    }, [update]);

    return { ...view, ...setters };
}
