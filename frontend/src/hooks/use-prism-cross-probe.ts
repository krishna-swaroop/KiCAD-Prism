import { useCallback, useEffect, useRef, useState } from "react";
import { enrichPrismSelection } from "@/lib/prism-selection";
import type {
    PrismSelection,
    PrismSemanticIndex,
    PrismViewerClient,
} from "@/types/prism-selection";

interface PrismCrossProbeBus {
    selection: PrismSelection | null;
    /**
     * True when the current selection is a cross-probe (double-click focus that
     * mirrors into the other viewer), false for a plain single-view selection.
     */
    isProbing: boolean;
    /** Panel-only: updates inspector state without mirroring into other viewers. */
    select: (selection: PrismSelection) => void;
    /** Full cross-probe: updates inspector and applies to other ready viewers. */
    crossProbe: (selection: PrismSelection) => void;
    clear: () => void;
    registerClient: (client: PrismViewerClient) => () => void;
    notifyClientReady: (clientId: string) => void;
}

export function usePrismCrossProbe(
    semanticIndex: PrismSemanticIndex | null,
): PrismCrossProbeBus {
    const [selection, setSelection] = useState<PrismSelection | null>(null);
    const [isProbing, setIsProbing] = useState(false);
    const selectionRef = useRef<PrismSelection | null>(null);
    const probingRef = useRef(false);
    const clientsRef = useRef(new Map<string, PrismViewerClient>());

    const dispatch = useCallback((next: PrismSelection | null, onlyClientId?: string) => {
        for (const client of clientsRef.current.values()) {
            if (onlyClientId && client.id !== onlyClientId) continue;
            // Clears must always reach viewers — sticky PCB Focus is applied
            // locally even when the host ready bit was wrong.
            if (!client.isReady() && next !== null) {
                continue;
            }
            if (
                next
                && client.context === next.sourceContext
                && (!client.revisionKey || !next.sourceRevisionKey || client.revisionKey === next.sourceRevisionKey)
            ) {
                continue;
            }
            if (
                next?.sourceRevisionKey
                && client.revisionKey
                && next.sourceRevisionKey !== client.revisionKey
            ) {
                continue;
            }
            void client.applySelection(next);
        }
    }, []);

    const select = useCallback((next: PrismSelection) => {
        const enriched = enrichPrismSelection(next, semanticIndex);
        probingRef.current = false;
        setIsProbing(false);
        selectionRef.current = enriched;
        setSelection(enriched);
    }, [semanticIndex]);

    const crossProbe = useCallback((next: PrismSelection) => {
        const enriched = enrichPrismSelection(next, semanticIndex);
        probingRef.current = true;
        setIsProbing(true);
        selectionRef.current = enriched;
        setSelection(enriched);
        dispatch(enriched);
    }, [dispatch, semanticIndex]);

    const clear = useCallback(() => {
        probingRef.current = false;
        setIsProbing(false);
        selectionRef.current = null;
        setSelection(null);
        dispatch(null);
    }, [dispatch]);

    const registerClient = useCallback((client: PrismViewerClient) => {
        clientsRef.current.set(client.id, client);
        const current = selectionRef.current;
        const isSourceClient = Boolean(
            current
            && client.context === current.sourceContext
            && (!client.revisionKey || !current.sourceRevisionKey || client.revisionKey === current.sourceRevisionKey),
        );
        if (probingRef.current && client.isReady() && !isSourceClient) {
            void client.applySelection(current);
        }
        return () => {
            if (clientsRef.current.get(client.id) === client) {
                clientsRef.current.delete(client.id);
            }
        };
    }, []);

    const notifyClientReady = useCallback((clientId: string) => {
        if (!probingRef.current) return;
        dispatch(selectionRef.current, clientId);
    }, [dispatch]);

    useEffect(() => {
        if (!selectionRef.current || !semanticIndex) return;
        const enriched = enrichPrismSelection(selectionRef.current, semanticIndex);
        selectionRef.current = enriched;
        setSelection(enriched);
        if (probingRef.current) dispatch(enriched);
    }, [dispatch, semanticIndex]);

    return { selection, isProbing, select, crossProbe, clear, registerClient, notifyClientReady };
}
