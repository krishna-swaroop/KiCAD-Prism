import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import type {
    ECadViewerElement,
    EcadViewportInsets,
} from "@/types/ecad-viewer";

type ComparisonViewerHostProps = {
    viewerKey: string;
    active: boolean;
    onViewer: (viewer: ECadViewerElement | null) => void;
    onLayoutReady: (viewerKey: string) => void;
    viewportInsets?: EcadViewportInsets;
};

export function ComparisonViewerHost({
    viewerKey,
    active,
    onViewer,
    onLayoutReady,
    viewportInsets = {},
}: ComparisonViewerHostProps) {
    const [viewer, setViewer] = useState<ECadViewerElement | null>(null);
    const latestViewerRef = useRef<ECadViewerElement | null>(null);
    const viewportLeft = viewportInsets.left ?? 0;
    const viewportRight = viewportInsets.right ?? 0;
    const viewportTop = viewportInsets.top ?? 0;
    const viewportBottom = viewportInsets.bottom ?? 0;

    const attachViewer = useCallback(
        (node: ECadViewerElement | null) => {
            latestViewerRef.current = node;
            setViewer(node);
            onViewer(node);
        },
        [onViewer],
    );

    useLayoutEffect(() => {
        if (!viewer) return;
        let cancelled = false;
        let observer: ResizeObserver | null = null;
        let resizeFrame: number | null = null;
        let layoutReported = false;

        const reportWhenSized = async () => {
            await customElements.whenDefined("ecad-viewer");
            if (cancelled || latestViewerRef.current !== viewer) return;
            const settleSize = () => {
                if (
                    !cancelled
                    && latestViewerRef.current === viewer
                    && viewer.clientWidth > 0
                    && viewer.clientHeight > 0
                ) {
                    if (!layoutReported) {
                        layoutReported = true;
                        onLayoutReady(viewerKey);
                    }
                    if (resizeFrame !== null) {
                        cancelAnimationFrame(resizeFrame);
                    }
                    resizeFrame = requestAnimationFrame(() => {
                        resizeFrame = null;
                        if (!cancelled && latestViewerRef.current === viewer) {
                            viewer.resize?.();
                        }
                    });
                }
            };
            settleSize();
            if (typeof ResizeObserver !== "undefined") {
                observer = new ResizeObserver(settleSize);
                observer.observe(viewer);
            }
        };

        void reportWhenSized();
        return () => {
            cancelled = true;
            observer?.disconnect();
            if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
        };
    }, [onLayoutReady, viewer, viewerKey]);

    useEffect(() => {
        if (!viewer) return;
        let cancelled = false;
        void customElements.whenDefined("ecad-viewer").then(() => {
            if (!cancelled && latestViewerRef.current === viewer) {
                viewer.setActive(active);
                if (active) viewer.resize?.();
            }
        });
        return () => {
            cancelled = true;
        };
    }, [active, viewer]);

    useLayoutEffect(() => {
        if (!viewer) return;
        let cancelled = false;
        void customElements.whenDefined("ecad-viewer").then(() => {
            if (!cancelled && latestViewerRef.current === viewer) {
                viewer.setViewportInsets({
                    left: viewportLeft,
                    right: viewportRight,
                    top: viewportTop,
                    bottom: viewportBottom,
                });
            }
        });
        return () => { cancelled = true; };
    }, [viewer, viewportBottom, viewportLeft, viewportRight, viewportTop]);

    return (
        <ecad-viewer
            ref={attachViewer}
            className="block h-full w-full"
            show-header="false"
            show-selection-panel="false"
            source-mode="host"
        />
    );
}
