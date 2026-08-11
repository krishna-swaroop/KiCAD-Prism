import { useEffect, useRef, type RefObject } from "react";
import type {
    CameraState,
    ECadViewerElement,
} from "@/types/ecad-viewer";

export function useComparisonCameraSync(
    baseViewer: ECadViewerElement | null,
    compareViewer: ECadViewerElement | null,
    enabled: boolean,
    suppressedRef: RefObject<boolean>,
): void {
    const syncingRef = useRef(false);

    useEffect(() => {
        if (!enabled || !baseViewer || !compareViewer) return;

        const sync = (
            target: ECadViewerElement,
            event: CustomEvent<CameraState>,
        ) => {
            if (
                syncingRef.current
                || suppressedRef.current
                || !event.detail
            ) {
                return;
            }
            syncingRef.current = true;
            try {
                target.camera = event.detail;
            } finally {
                syncingRef.current = false;
            }
        };
        const syncFromBase = (event: Event) =>
            sync(compareViewer, event as CustomEvent<CameraState>);
        const syncFromCompare = (event: Event) =>
            sync(baseViewer, event as CustomEvent<CameraState>);

        baseViewer.addEventListener("camerachange", syncFromBase);
        compareViewer.addEventListener("camerachange", syncFromCompare);

        return () => {
            baseViewer.removeEventListener("camerachange", syncFromBase);
            compareViewer.removeEventListener(
                "camerachange",
                syncFromCompare,
            );
        };
    }, [baseViewer, compareViewer, enabled, suppressedRef]);
}
