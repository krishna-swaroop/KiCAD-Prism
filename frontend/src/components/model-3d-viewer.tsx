import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as OV from "online-3d-viewer";
import { Sun, Settings2, Moon, RotateCcw, BoxSelect, Zap, Palette } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

interface Model3DViewerProps {
    modelUrl: string;
    sceneKey?: string;
    modelFileName?: string;
    /** When true, positions camera at isometric corner (Z-up, looking from front-right-above). */
    isometricCamera?: boolean;
}

type BackgroundMode = "solid" | "gradient";
type GradientDirection = "vertical" | "horizontal" | "diagonal-down" | "diagonal-up";
type ScenePreset = "default" | "inspection" | "high-contrast" | "soft" | "custom";

interface SceneState {
    brightness: number;
    directionality: number;
    backgroundMode: BackgroundMode;
    backgroundColor: string;
    gradientStart: string;
    gradientEnd: string;
    gradientDirection: GradientDirection;
    preset: ScenePreset;
}

const DEFAULT_SCENE_STATE: SceneState = {
    brightness: 1.6,
    directionality: 0.5,
    backgroundMode: "solid",
    backgroundColor: "#1E1E1E",
    gradientStart: "#1E1E1E",
    gradientEnd: "#101010",
    gradientDirection: "vertical",
    preset: "default",
};

const LIGHTING_PRESETS: Array<{
    id: Exclude<ScenePreset, "custom">;
    label: string;
    brightness: number;
    directionality: number;
}> = [
    { id: "default", label: "Default", brightness: 1.6, directionality: 0.5 },
    { id: "inspection", label: "Inspection", brightness: 1.8, directionality: 0.65 },
    { id: "high-contrast", label: "High Contrast", brightness: 1.4, directionality: 0.85 },
    { id: "soft", label: "Soft", brightness: 2.0, directionality: 0.25 },
];

const INITIAL_SCENE_APPLY_RETRIES = 24;
const INITIAL_SCENE_APPLY_INTERVAL_MS = 125;
const SESSION_SAVE_DEBOUNCE_MS = 120;

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));

const sanitizeHexColor = (value: unknown, fallback: string): string => {
    if (typeof value !== "string") return fallback;
    const normalized = value.trim().toUpperCase();
    return HEX_COLOR_PATTERN.test(normalized) ? normalized : fallback;
};

const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
    const sanitized = sanitizeHexColor(hex, "#000000");
    return {
        r: parseInt(sanitized.slice(1, 3), 16),
        g: parseInt(sanitized.slice(3, 5), 16),
        b: parseInt(sanitized.slice(5, 7), 16),
    };
};

const gradientDirectionToCss = (direction: GradientDirection): string => {
    switch (direction) {
        case "horizontal":
            return "90deg";
        case "diagonal-down":
            return "135deg";
        case "diagonal-up":
            return "45deg";
        case "vertical":
        default:
            return "180deg";
    }
};

const sanitizeSceneState = (raw: unknown): SceneState => {
    if (!raw || typeof raw !== "object") return DEFAULT_SCENE_STATE;

    const payload = raw as Partial<SceneState>;

    const preset: ScenePreset =
        payload.preset === "default" ||
        payload.preset === "inspection" ||
        payload.preset === "high-contrast" ||
        payload.preset === "soft" ||
        payload.preset === "custom"
            ? payload.preset
            : DEFAULT_SCENE_STATE.preset;

    const backgroundMode: BackgroundMode =
        payload.backgroundMode === "gradient" ? "gradient" : "solid";

    const gradientDirection: GradientDirection =
        payload.gradientDirection === "horizontal" ||
        payload.gradientDirection === "diagonal-down" ||
        payload.gradientDirection === "diagonal-up" ||
        payload.gradientDirection === "vertical"
            ? payload.gradientDirection
            : DEFAULT_SCENE_STATE.gradientDirection;

    return {
        brightness:
            typeof payload.brightness === "number"
                ? clamp(payload.brightness, 0, 3)
                : DEFAULT_SCENE_STATE.brightness,
        directionality:
            typeof payload.directionality === "number"
                ? clamp(payload.directionality, 0, 1)
                : DEFAULT_SCENE_STATE.directionality,
        backgroundMode,
        backgroundColor: sanitizeHexColor(payload.backgroundColor, DEFAULT_SCENE_STATE.backgroundColor),
        gradientStart: sanitizeHexColor(payload.gradientStart, DEFAULT_SCENE_STATE.gradientStart),
        gradientEnd: sanitizeHexColor(payload.gradientEnd, DEFAULT_SCENE_STATE.gradientEnd),
        gradientDirection,
        preset,
    };
};

export function Model3DViewer({ modelUrl, sceneKey, modelFileName, isometricCamera }: Model3DViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<OV.EmbeddedViewer | null>(null);
    const sceneRef = useRef<SceneState>(DEFAULT_SCENE_STATE);
    const sceneApplyRafRef = useRef<number | null>(null);

    const [scene, setScene] = useState<SceneState>(DEFAULT_SCENE_STATE);
    const [showSettings, setShowSettings] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [solidHexInput, setSolidHexInput] = useState(DEFAULT_SCENE_STATE.backgroundColor);
    const [gradientStartInput, setGradientStartInput] = useState(DEFAULT_SCENE_STATE.gradientStart);
    const [gradientEndInput, setGradientEndInput] = useState(DEFAULT_SCENE_STATE.gradientEnd);

    const storageKey = useMemo(() => {
        const resolved = sceneKey || modelUrl;
        return `kicad-prism:3d-scene:${encodeURIComponent(resolved)}`;
    }, [modelUrl, sceneKey]);

    useEffect(() => {
        sceneRef.current = scene;
    }, [scene]);

    useEffect(() => {
        if (typeof window === "undefined") return;

        try {
            const persisted = window.sessionStorage.getItem(storageKey);
            if (!persisted) {
                setScene(DEFAULT_SCENE_STATE);
                return;
            }
            const parsed = JSON.parse(persisted) as unknown;
            setScene(sanitizeSceneState(parsed));
        } catch (error) {
            console.warn("Failed to load 3D scene settings from sessionStorage", error);
            setScene(DEFAULT_SCENE_STATE);
        }
    }, [storageKey]);

    useEffect(() => {
        setSolidHexInput(scene.backgroundColor);
    }, [scene.backgroundColor]);

    useEffect(() => {
        setGradientStartInput(scene.gradientStart);
    }, [scene.gradientStart]);

    useEffect(() => {
        setGradientEndInput(scene.gradientEnd);
    }, [scene.gradientEnd]);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const timer = window.setTimeout(() => {
            try {
                window.sessionStorage.setItem(storageKey, JSON.stringify(scene));
            } catch (error) {
                console.warn("Failed to persist 3D scene settings", error);
            }
        }, SESSION_SAVE_DEBOUNCE_MS);

        return () => window.clearTimeout(timer);
    }, [scene, storageKey]);

    const applyLighting = useCallback((): boolean => {
        const embeddedViewer = viewerRef.current as unknown as { GetViewer?: () => any } | null;
        const internalViewer = embeddedViewer?.GetViewer?.();
        if (!internalViewer || !internalViewer.shadingModel) {
            return false;
        }

        const ambient = internalViewer.shadingModel.ambientLight;
        const directional = internalViewer.shadingModel.directionalLight;
        const current = sceneRef.current;

        if (ambient) {
            ambient.color.set(0xffffff);
            ambient.intensity = current.brightness * (1 - current.directionality) * Math.PI;
        }

        if (directional) {
            directional.color.set(0xffffff);
            directional.intensity = current.brightness * current.directionality * 2.0 * Math.PI;
        }

        if (typeof internalViewer.Render === "function") {
            internalViewer.Render();
        }

        return true;
    }, []);

    const applyBackground = useCallback((): boolean => {
        const container = containerRef.current;
        const embeddedViewer = viewerRef.current as unknown as { GetViewer?: () => any } | null;
        const internalViewer = embeddedViewer?.GetViewer?.();
        if (!container || !internalViewer || typeof internalViewer.SetBackgroundColor !== "function") {
            return false;
        }

        const current = sceneRef.current;

        if (current.backgroundMode === "solid") {
            const rgb = hexToRgb(current.backgroundColor);
            container.style.backgroundImage = "none";
            container.style.backgroundColor = current.backgroundColor;
            internalViewer.SetBackgroundColor(new OV.RGBAColor(rgb.r, rgb.g, rgb.b, 255));
        } else {
            const direction = gradientDirectionToCss(current.gradientDirection);
            container.style.backgroundColor = current.gradientStart;
            container.style.backgroundImage = `linear-gradient(${direction}, ${current.gradientStart}, ${current.gradientEnd})`;
            // Transparent clear color allows CSS gradient to remain visible behind the model canvas.
            internalViewer.SetBackgroundColor(new OV.RGBAColor(0, 0, 0, 0));
        }

        if (typeof internalViewer.Render === "function") {
            internalViewer.Render();
        }

        return true;
    }, []);

    const applyScene = useCallback((): boolean => {
        const lightingReady = applyLighting();
        const backgroundReady = applyBackground();
        return lightingReady && backgroundReady;
    }, [applyLighting, applyBackground]);

    // Initial load effect (must depend only on model identity, not scene settings).
    useEffect(() => {
        const container = containerRef.current;
        if (!container || !modelUrl) return;

        container.innerHTML = "";

        const current = sceneRef.current;
        const initialRgb = hexToRgb(current.backgroundColor);
        const initialBackgroundColor =
            current.backgroundMode === "solid"
                ? new OV.RGBAColor(initialRgb.r, initialRgb.g, initialRgb.b, 255)
                : new OV.RGBAColor(0, 0, 0, 0);

        const viewer = new OV.EmbeddedViewer(container, {
            backgroundColor: initialBackgroundColor,
            defaultColor: new OV.RGBColor(200, 200, 200),
            onModelLoaded: isometricCamera ? () => {
                // Reposition to isometric corner: camera above and to the front-right,
                // Z-up so the board top faces up on screen.
                const internalViewer = (viewer as unknown as { GetViewer?: () => any }).GetViewer?.();
                if (!internalViewer) return;
                const bs = internalViewer.GetBoundingSphere(() => true);
                if (!bs) return;
                const cx = bs.center.x as number;
                const cy = bs.center.y as number;
                const cz = bs.center.z as number;
                const r = bs.radius as number;
                // Direction: front-right corner (X+, Y-, Z+) normalised
                const d = 1 / Math.sqrt(3);
                const dist = r * 2.5;
                const cam = new OV.Camera(
                    new OV.Coord3D(cx + d * dist, cy - d * dist, cz + d * dist),
                    new OV.Coord3D(cx, cy, cz),
                    new OV.Coord3D(0, 0, 1),
                    45,
                );
                internalViewer.SetCamera(cam);
                internalViewer.Render();
            } : undefined,
        });

        if (modelFileName) {
            const inputFile = new OV.InputFile(modelFileName, OV.FileSource.Url, modelUrl);
            viewer.LoadModelFromInputFiles([inputFile]);
        } else {
            viewer.LoadModelFromUrlList([modelUrl]);
        }
        viewerRef.current = viewer;

        let remainingAttempts = INITIAL_SCENE_APPLY_RETRIES;
        const initInterval = window.setInterval(() => {
            const applied = applyScene();
            remainingAttempts -= 1;
            if (applied || remainingAttempts <= 0) {
                window.clearInterval(initInterval);
            }
        }, INITIAL_SCENE_APPLY_INTERVAL_MS);

        return () => {
            window.clearInterval(initInterval);
            container.innerHTML = "";
            if (viewerRef.current === viewer) {
                viewerRef.current = null;
            }
        };
    }, [modelUrl, applyScene]);

    // Incremental scene updates, no model reload.
    useEffect(() => {
        if (typeof window === "undefined") {
            applyScene();
            return;
        }

        if (sceneApplyRafRef.current !== null) {
            window.cancelAnimationFrame(sceneApplyRafRef.current);
        }

        sceneApplyRafRef.current = window.requestAnimationFrame(() => {
            sceneApplyRafRef.current = null;
            applyScene();
        });

        return () => {
            if (sceneApplyRafRef.current !== null) {
                window.cancelAnimationFrame(sceneApplyRafRef.current);
                sceneApplyRafRef.current = null;
            }
        };
    }, [scene, applyScene]);

    const applyPreset = (presetId: Exclude<ScenePreset, "custom">) => {
        const preset = LIGHTING_PRESETS.find((item) => item.id === presetId);
        if (!preset) return;

        setScene((prev) => ({
            ...prev,
            brightness: preset.brightness,
            directionality: preset.directionality,
            preset: preset.id,
        }));
    };

    const handleReset = () => {
        setScene(DEFAULT_SCENE_STATE);
    };

    const commitHexValue = (
        field: "backgroundColor" | "gradientStart" | "gradientEnd",
        rawValue: string
    ) => {
        setScene((prev) => ({
            ...prev,
            [field]: sanitizeHexColor(rawValue, prev[field]),
        }));
    };

    return (
        <div className="relative w-full h-full min-h-[600px] overflow-hidden bg-[#1e1e1e]">
            {/* 3D Container */}
            <div ref={containerRef} className="w-full h-full z-0" />

            {/* Scene Toggle Button */}
            <div className="absolute top-4 right-4 z-[100]">
                <Button
                    variant="outline"
                    size="sm"
                    className={`shadow-xl border-border backdrop-blur-md transition-all ${showSettings ? "bg-primary text-primary-foreground border-primary" : "bg-background/80"
                        }`}
                    onClick={(event) => {
                        event.stopPropagation();
                        setShowSettings((prev) => !prev);
                    }}
                >
                    <Sun className="w-4 h-4 mr-2" />
                    Scene
                </Button>
            </div>

            {showSettings && (
                <div
                    className="absolute top-14 right-4 z-[100] w-[360px] max-w-[calc(100vw-2rem)] p-4 shadow-2xl bg-card/95 backdrop-blur-xl border border-border/50 rounded-xl animate-in fade-in zoom-in slide-in-from-top-2 duration-200"
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="space-y-4">
                        <div className="flex justify-between items-center border-b border-border/50 pb-2">
                            <h4 className="font-semibold flex items-center text-foreground tracking-tight">
                                <Settings2 className="w-4 h-4 mr-2 text-primary" />
                                Scene Controls
                            </h4>
                            <div className="flex gap-1">
                                <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    className="h-7 w-7 text-muted-foreground hover:text-foreground outline-none"
                                    onClick={handleReset}
                                    title="Reset to defaults"
                                >
                                    <RotateCcw className="w-3 h-3" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    className="h-7 w-7 text-muted-foreground hover:text-foreground outline-none"
                                    onClick={() => setShowSettings(false)}
                                >
                                    ×
                                </Button>
                            </div>
                        </div>

                        {/* Basic Controls */}
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-sm font-medium">Lighting Presets</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    {LIGHTING_PRESETS.map((preset) => (
                                        <Button
                                            key={preset.id}
                                            type="button"
                                            size="sm"
                                            variant={scene.preset === preset.id ? "secondary" : "outline"}
                                            className="h-8"
                                            onClick={() => applyPreset(preset.id)}
                                        >
                                            {preset.label}
                                        </Button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <Label className="text-sm font-medium">Scene Brightness</Label>
                                    <span className="text-[11px] font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
                                        {(scene.brightness * 100).toFixed(0)}%
                                    </span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Moon className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                                    <Slider
                                        value={[scene.brightness]}
                                        min={0}
                                        max={3}
                                        step={0.05}
                                        onValueChange={([value]) => {
                                            setScene((prev) => ({
                                                ...prev,
                                                brightness: value,
                                                preset: "custom",
                                            }));
                                        }}
                                        className="py-2"
                                    />
                                    <Sun className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-sm font-medium flex items-center gap-2">
                                    <Palette className="w-4 h-4" />
                                    Background
                                </Label>
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={scene.backgroundMode === "solid" ? "secondary" : "outline"}
                                        className="h-8"
                                        onClick={() =>
                                            setScene((prev) => ({
                                                ...prev,
                                                backgroundMode: "solid",
                                            }))
                                        }
                                    >
                                        Solid
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={scene.backgroundMode === "gradient" ? "secondary" : "outline"}
                                        className="h-8"
                                        onClick={() =>
                                            setScene((prev) => ({
                                                ...prev,
                                                backgroundMode: "gradient",
                                            }))
                                        }
                                    >
                                        Gradient
                                    </Button>
                                </div>

                                {scene.backgroundMode === "solid" ? (
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            aria-label="Background color"
                                            value={scene.backgroundColor}
                                            onChange={(event) =>
                                                setScene((prev) => ({
                                                    ...prev,
                                                    backgroundColor: sanitizeHexColor(event.target.value, prev.backgroundColor),
                                                }))
                                            }
                                            className="h-9 w-10 rounded border border-border bg-transparent p-0"
                                        />
                                        <Input
                                            value={solidHexInput}
                                            onChange={(event) => setSolidHexInput(event.target.value)}
                                            onBlur={() => commitHexValue("backgroundColor", solidHexInput)}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter") {
                                                    event.preventDefault();
                                                    commitHexValue("backgroundColor", solidHexInput);
                                                }
                                            }}
                                            className="h-9 font-mono text-xs uppercase"
                                            placeholder="#1E1E1E"
                                        />
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                aria-label="Gradient start"
                                                value={scene.gradientStart}
                                                onChange={(event) =>
                                                    setScene((prev) => ({
                                                        ...prev,
                                                        gradientStart: sanitizeHexColor(event.target.value, prev.gradientStart),
                                                    }))
                                                }
                                                className="h-9 w-10 rounded border border-border bg-transparent p-0"
                                            />
                                            <Input
                                                value={gradientStartInput}
                                                onChange={(event) => setGradientStartInput(event.target.value)}
                                                onBlur={() => commitHexValue("gradientStart", gradientStartInput)}
                                                onKeyDown={(event) => {
                                                    if (event.key === "Enter") {
                                                        event.preventDefault();
                                                        commitHexValue("gradientStart", gradientStartInput);
                                                    }
                                                }}
                                                className="h-9 font-mono text-xs uppercase"
                                                placeholder="#1E1E1E"
                                            />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                aria-label="Gradient end"
                                                value={scene.gradientEnd}
                                                onChange={(event) =>
                                                    setScene((prev) => ({
                                                        ...prev,
                                                        gradientEnd: sanitizeHexColor(event.target.value, prev.gradientEnd),
                                                    }))
                                                }
                                                className="h-9 w-10 rounded border border-border bg-transparent p-0"
                                            />
                                            <Input
                                                value={gradientEndInput}
                                                onChange={(event) => setGradientEndInput(event.target.value)}
                                                onBlur={() => commitHexValue("gradientEnd", gradientEndInput)}
                                                onKeyDown={(event) => {
                                                    if (event.key === "Enter") {
                                                        event.preventDefault();
                                                        commitHexValue("gradientEnd", gradientEndInput);
                                                    }
                                                }}
                                                className="h-9 font-mono text-xs uppercase"
                                                placeholder="#101010"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Advanced Controls */}
                        <div className="border-t border-border/40 pt-3">
                            <Button
                                type="button"
                                variant="ghost"
                                className="h-8 w-full justify-start px-2"
                                onClick={() => setShowAdvanced((prev) => !prev)}
                            >
                                {showAdvanced ? "Hide Advanced" : "Show Advanced"}
                            </Button>

                            {showAdvanced && (
                                <div className="space-y-3 mt-3">
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <Label className="text-sm font-medium">Directionality</Label>
                                            <span className="text-[11px] font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
                                                {(scene.directionality * 100).toFixed(0)}%
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <BoxSelect className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                                            <Slider
                                                value={[scene.directionality]}
                                                min={0}
                                                max={1}
                                                step={0.01}
                                                onValueChange={([value]) => {
                                                    setScene((prev) => ({
                                                        ...prev,
                                                        directionality: value,
                                                        preset: "custom",
                                                    }));
                                                }}
                                                className="py-2"
                                            />
                                            <Zap className="w-4 h-4 text-primary/50 shrink-0" />
                                        </div>
                                    </div>

                                    {scene.backgroundMode === "gradient" && (
                                        <div className="space-y-2">
                                            <Label className="text-sm font-medium">Gradient Direction</Label>
                                            <select
                                                value={scene.gradientDirection}
                                                onChange={(event) =>
                                                    setScene((prev) => ({
                                                        ...prev,
                                                        gradientDirection: event.target.value as GradientDirection,
                                                    }))
                                                }
                                                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                                            >
                                                <option value="vertical">Vertical</option>
                                                <option value="horizontal">Horizontal</option>
                                                <option value="diagonal-down">Diagonal Down</option>
                                                <option value="diagonal-up">Diagonal Up</option>
                                            </select>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
