import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type {
    PrismRenderProgress,
    PrismSemanticViewerElement,
} from "@/types/prism-semantic-viewer";

/** Output sizes, by name. */
export const RENDER_SIZES = {
    "1080p": [1920, 1080],
    "1440p": [2560, 1440],
    "4k": [3840, 2160],
} as const;

/** Samples per pixel by quality; the image is denoised after. */
export const RENDER_QUALITIES = {
    draft: 16,
    good: 64,
    best: 256,
} as const;

type RenderSize = keyof typeof RENDER_SIZES;
type RenderQuality = keyof typeof RENDER_QUALITIES;

type RenderState =
    | { kind: "idle" }
    | { kind: "running"; progress: PrismRenderProgress | null }
    | { kind: "done"; url: string; blob: Blob; seconds: number }
    | { kind: "error"; message: string };

const STAGE_LABELS: Record<string, string> = {
    scene: "Preparing the scene",
    device: "Starting the GPU",
    bvh: "Building the scene",
    shaders: "Compiling shaders",
    pilot: "Tracing",
    final: "Tracing",
    denoising: "Denoising",
    encoding: "Saving",
};

/** The share of the render done, 0 to 1, from a progress report. */
export function renderFraction(progress: PrismRenderProgress | null): number {
    if (!progress) return 0;
    if (progress.stage === "encoding") return 1;
    if (progress.stage === "denoising") return 0.97;
    if (progress.samples !== undefined && progress.targetSamples) {
        return 0.1 + 0.85 * Math.min(1, progress.samples / progress.targetSamples);
    }
    return 0.05;
}

/** `board-1920x1080.png`-style name for the download. */
export function renderFileName(name: string, width: number, height: number): string {
    const stem = name.trim().replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "board";
    return `${stem}-render-${width}x${height}.png`;
}

/**
 * The 3D tab's Render action: the current view path-traced (in a worker,
 * with its own GPU device) at a chosen size and quality, then saved as a PNG.
 */
export function RenderImageDialog({
    viewer,
    open,
    onOpenChange,
    fileStem,
}: {
    viewer: PrismSemanticViewerElement | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    fileStem: string;
}) {
    const [size, setSize] = useState<RenderSize>("1080p");
    const [quality, setQuality] = useState<RenderQuality>("good");
    const [transparent, setTransparent] = useState(false);
    const [state, setState] = useState<RenderState>({ kind: "idle" });
    const abortRef = useRef<AbortController | null>(null);
    const [width, height] = RENDER_SIZES[size];

    // The finished image's object URL lives as long as it is shown.
    const doneUrl = state.kind === "done" ? state.url : null;
    useEffect(() => () => {
        if (doneUrl) URL.revokeObjectURL(doneUrl);
    }, [doneUrl]);
    // Closing the dialog or leaving the tab stops a render.
    useEffect(() => () => abortRef.current?.abort(), []);

    const start = async () => {
        if (!viewer?.renderImage) return;
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setState({ kind: "running", progress: null });
        const started = performance.now();
        try {
            const result = await viewer.renderImage({
                width,
                height,
                samples: RENDER_QUALITIES[quality],
                background: transparent ? "transparent" : "studio",
                signal: controller.signal,
                onProgress: (progress) => {
                    if (!controller.signal.aborted) setState({ kind: "running", progress });
                },
            });
            if (controller.signal.aborted) return;
            setState({
                kind: "done",
                blob: result.blob,
                url: URL.createObjectURL(result.blob),
                seconds: (performance.now() - started) / 1000,
            });
        } catch (error) {
            if (controller.signal.aborted) {
                setState({ kind: "idle" });
                return;
            }
            setState({ kind: "error", message: error instanceof Error ? error.message : String(error) });
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
        }
    };

    const cancel = () => {
        abortRef.current?.abort();
        setState({ kind: "idle" });
    };

    const save = () => {
        if (state.kind !== "done") return;
        const link = document.createElement("a");
        link.href = state.url;
        link.download = renderFileName(fileStem, width, height);
        link.click();
    };

    const close = (next: boolean) => {
        if (!next) cancel();
        onOpenChange(next);
    };

    const running = state.kind === "running";
    const progress = state.kind === "running" ? state.progress : null;

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle>Render image</DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <Label className="text-xs">Size</Label>
                        <Select value={size} onValueChange={(value) => setSize(value as RenderSize)} disabled={running}>
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="1080p">1920 × 1080</SelectItem>
                                <SelectItem value="1440p">2560 × 1440</SelectItem>
                                <SelectItem value="4k">3840 × 2160</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Quality</Label>
                        <Select value={quality} onValueChange={(value) => setQuality(value as RenderQuality)} disabled={running}>
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="draft">Draft · 16 spp</SelectItem>
                                <SelectItem value="good">Good · 64 spp</SelectItem>
                                <SelectItem value="best">Best · 256 spp</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <label className="col-span-2 flex items-center gap-2 text-xs">
                        <Checkbox
                            checked={transparent}
                            onCheckedChange={(value) => setTransparent(value === true)}
                            disabled={running}
                        />
                        Transparent background
                    </label>
                </div>

                <div className="flex aspect-video items-center justify-center overflow-hidden rounded-md border bg-muted/40">
                    {state.kind === "done" ? (
                        <img src={state.url} alt="Rendered board" className="h-full w-full object-contain" />
                    ) : running ? (
                        <div className="w-2/3 space-y-2">
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span>{STAGE_LABELS[progress?.stage ?? "scene"] ?? "Rendering"}</span>
                                <span>
                                    {progress?.samples !== undefined && progress.targetSamples
                                        ? `${progress.samples} / ${progress.targetSamples} · `
                                        : ""}
                                    {((progress?.elapsedMs ?? 0) / 1000).toFixed(1)} s
                                </span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                                <div
                                    className="h-full rounded-full bg-primary transition-[width]"
                                    style={{ width: `${Math.round(renderFraction(progress) * 100)}%` }}
                                />
                            </div>
                        </div>
                    ) : state.kind === "error" ? (
                        <span className="px-4 text-center text-xs text-destructive">{state.message}</span>
                    ) : (
                        <span className="text-xs text-muted-foreground">{width} × {height}</span>
                    )}
                </div>

                <DialogFooter className="gap-2 sm:justify-between">
                    <span className="self-center text-xs text-muted-foreground">
                        {state.kind === "done" ? `${state.seconds.toFixed(1)} s` : ""}
                    </span>
                    <div className="flex gap-2">
                        {running ? (
                            <Button variant="outline" size="sm" onClick={cancel}>
                                Cancel
                            </Button>
                        ) : (
                            <Button variant={state.kind === "done" ? "outline" : "default"} size="sm" onClick={start} disabled={!viewer?.renderImage}>
                                {state.kind === "done" ? "Render again" : "Render"}
                            </Button>
                        )}
                        {state.kind === "done" && (
                            <Button size="sm" onClick={save}>
                                Save PNG
                            </Button>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
