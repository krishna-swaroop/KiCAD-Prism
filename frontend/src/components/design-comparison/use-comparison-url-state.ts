import { useEffect, type Dispatch, type SetStateAction } from "react";
import { useSearchParams } from "react-router-dom";
import {
    applyWorkspaceComparisonParams,
    readComparisonUrlState,
    type ComparisonPresentationMode,
    type ComparisonUrlTab,
} from "./comparison-url";

/**
 * Keeps the workspace and the address bar saying the same thing.
 *
 * Both directions, deliberately: the URL is what a reviewer pastes into a
 * ticket, so state has to reach it, and a pasted link has to reach state.
 *
 * Every setter is a functional update that returns the *current* value when
 * nothing changed. That is load-bearing, not tidiness — writing an equal value
 * still re-renders, which rewrites the URL, which reads it back. `layers` is
 * the one that actually bites, since each read parses a fresh array whose
 * contents are equal but whose reference is not.
 */

export type ComparisonUrlSetters = {
    setActiveTab: Dispatch<SetStateAction<ComparisonUrlTab>>;
    setPresentationOverride: Dispatch<
        SetStateAction<ComparisonPresentationMode | null>
    >;
    setSelectedChangeId: Dispatch<SetStateAction<string | null>>;
    setShowSecondary: Dispatch<SetStateAction<boolean>>;
    setVisibleLayers: Dispatch<SetStateAction<string[]>>;
};

export type ComparisonUrlSync = {
    base: string;
    compare: string;
    activeTab: ComparisonUrlTab;
    presentationOverride: ComparisonPresentationMode | null;
    selectedChangeId: string | null;
    showSecondary: boolean;
    visibleLayers: string[];
};

export function useComparisonUrlState(
    state: ComparisonUrlSync,
    setters: ComparisonUrlSetters,
): void {
    const [searchParams, setSearchParams] = useSearchParams();
    const {
        setActiveTab,
        setPresentationOverride,
        setSelectedChangeId,
        setShowSecondary,
        setVisibleLayers,
    } = setters;

    // URL → state.
    useEffect(() => {
        const next = readComparisonUrlState(searchParams);
        // Without both revisions there is no comparison to describe, and these
        // params belong to some other screen.
        if (!next.base || !next.compare) return;
        setActiveTab((current) => (current === next.diff ? current : next.diff));
        setPresentationOverride((current) => (
            current === next.presentationOverride
                ? current
                : next.presentationOverride
        ));
        setSelectedChangeId((current) => (
            current === next.item ? current : next.item
        ));
        setShowSecondary((current) => (
            current === next.showSecondary ? current : next.showSecondary
        ));
        setVisibleLayers((current) => {
            const same = current.length === next.layers.length
                && current.every((layer, index) => layer === next.layers[index]);
            return same ? current : next.layers;
        });
    }, [
        searchParams,
        setActiveTab,
        setPresentationOverride,
        setSelectedChangeId,
        setShowSecondary,
        setVisibleLayers,
    ]);

    // State → URL, replacing rather than pushing so the back button leaves the
    // comparison instead of walking every selection made inside it.
    const {
        base,
        compare,
        activeTab,
        presentationOverride,
        selectedChangeId,
        showSecondary,
        visibleLayers,
    } = state;
    useEffect(() => {
        setSearchParams(
            (current) => {
                const next = applyWorkspaceComparisonParams(current, {
                    base,
                    compare,
                    activeTab,
                    presentationOverride,
                    selectedChangeId,
                    showSecondary,
                    visibleLayers,
                });
                return next.toString() === current.toString() ? current : next;
            },
            { replace: true },
        );
    }, [
        base,
        compare,
        activeTab,
        presentationOverride,
        selectedChangeId,
        showSecondary,
        visibleLayers,
        setSearchParams,
    ]);
}
