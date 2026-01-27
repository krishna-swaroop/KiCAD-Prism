import { useEffect, useRef, useState } from "react";
import * as OV from "online-3d-viewer";
import { Sun, Settings2, Moon, RotateCcw, BoxSelect, Zap } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface Model3DViewerProps {
    modelUrl: string;
}

const DEFAULT_BRIGHTNESS = 1.0;
const DEFAULT_DIRECTIONALITY = 0.6; // 60% directional, 40% ambient

export function Model3DViewer({ modelUrl }: Model3DViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<OV.EmbeddedViewer | null>(null);

    // Lighting state
    const [brightness, setBrightness] = useState(DEFAULT_BRIGHTNESS);
    const [directionality, setDirectionality] = useState(DEFAULT_DIRECTIONALITY);
    const [showSettings, setShowSettings] = useState(false);

    const handleReset = () => {
        setBrightness(DEFAULT_BRIGHTNESS);
        setDirectionality(DEFAULT_DIRECTIONALITY);
    };

    // Initial load effect
    useEffect(() => {
        if (!containerRef.current || !modelUrl) return;

        // Clear previous viewer
        if (containerRef.current) {
            containerRef.current.innerHTML = '';
        }

        // Initialize viewer with dark theme settings
        const viewer = new OV.EmbeddedViewer(containerRef.current, {
            backgroundColor: new OV.RGBAColor(30, 30, 30, 255),
            defaultColor: new OV.RGBColor(200, 200, 200),
        });

        viewer.LoadModelFromUrlList([modelUrl]);
        viewerRef.current = viewer;

        return () => {
            if (containerRef.current) {
                containerRef.current.innerHTML = '';
            }
            viewerRef.current = null;
        };
    }, [modelUrl]);

    // Update lighting intensity when state changes
    useEffect(() => {
        if (!viewerRef.current) return;

        const internalViewer = (viewerRef.current as any).GetViewer();
        if (internalViewer && internalViewer.shadingModel) {
            const ambient = internalViewer.shadingModel.ambientLight;
            const directional = internalViewer.shadingModel.directionalLight;

            // Logic: Total intensity is distributed between Ambient and Directional
            // B = Total Brightness
            // D = Directionality (0 to 1)
            // Ambient = B * (1 - D)
            // Directional = B * D * 1.5 (extra punch for highlights)

            if (ambient) {
                // IMPORTANT: In Physical mode, the viewer sets ambient color to black (0x000000).
                // We force it back to white so that intensity changes actually affect the scene.
                ambient.color.set(0xffffff);
                ambient.intensity = brightness * (1 - directionality) * Math.PI;
            }

            if (directional) {
                // Ensure directional is also using a standard white for consistent intensity response
                directional.color.set(0xffffff);
                directional.intensity = brightness * directionality * 2.0 * Math.PI;
            }

            internalViewer.Render();
        }
    }, [brightness, directionality]);

    return (
        <div className="relative w-full h-full min-h-[600px] overflow-hidden bg-[#1e1e1e]">
            {/* 3D Container */}
            <div
                ref={containerRef}
                className="w-full h-full z-0"
                style={{
                    backgroundColor: '#1e1e1e',
                }}
            />

            {/* Lighting Toggle Button */}
            <div className="absolute top-4 right-4 z-[100]">
                <Button
                    variant="outline"
                    size="sm"
                    className={`shadow-xl border-border backdrop-blur-md transition-all ${showSettings ? 'bg-primary text-primary-foreground border-primary' : 'bg-background/80'}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowSettings(!showSettings);
                    }}
                >
                    <Sun className="w-4 h-4 mr-2" />
                    Lighting
                </Button>
            </div>

            {/* Brightness & Directionality Panel */}
            {showSettings && (
                <div
                    className="absolute top-14 right-4 z-[100] w-80 p-5 shadow-2xl bg-card/95 backdrop-blur-xl border border-border/50 rounded-xl animate-in fade-in zoom-in slide-in-from-top-2 duration-200"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="space-y-6">
                        <div className="flex justify-between items-center border-b border-border/50 pb-3">
                            <h4 className="font-semibold flex items-center text-foreground tracking-tight">
                                <Settings2 className="w-4 h-4 mr-2 text-primary" />
                                Review Lighting
                            </h4>
                            <div className="flex gap-2">
                                <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    className="h-6 w-6 text-muted-foreground hover:text-foreground outline-none"
                                    onClick={handleReset}
                                    title="Reset to defaults"
                                >
                                    <RotateCcw className="w-3 h-3" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    className="h-6 w-6 text-muted-foreground hover:text-foreground outline-none"
                                    onClick={() => setShowSettings(false)}
                                >
                                    ×
                                </Button>
                            </div>
                        </div>

                        {/* Total Brightness */}
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <div className="space-y-0.5">
                                    <Label className="text-sm font-medium">Scene Brightness</Label>
                                    <p className="text-[11px] text-muted-foreground">Overall exposure level</p>
                                </div>
                                <span className="text-[11px] font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
                                    {(brightness * 100).toFixed(0)}%
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                <Moon className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                                <Slider
                                    value={[brightness]}
                                    min={0}
                                    max={3}
                                    step={0.05}
                                    onValueChange={([val]) => setBrightness(val)}
                                    className="py-2"
                                />
                                <Sun className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                            </div>
                        </div>

                        {/* Directionality (Balance) */}
                        <div className="space-y-4 pt-2 border-t border-border/30">
                            <div className="flex justify-between items-center">
                                <div className="space-y-0.5">
                                    <Label className="text-sm font-medium">Directionality</Label>
                                    <p className="text-[11px] text-muted-foreground">Shadow depth & highlight punch</p>
                                </div>
                                <span className="text-[11px] font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
                                    {(directionality * 100).toFixed(0)}%
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                <BoxSelect className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                                <Slider
                                    value={[directionality]}
                                    min={0}
                                    max={1}
                                    step={0.01}
                                    onValueChange={([val]) => setDirectionality(val)}
                                    className="py-2"
                                />
                                <Zap className="w-4 h-4 text-primary/50 shrink-0" />
                            </div>
                            <div className="flex justify-between text-[9px] uppercase tracking-wider text-muted-foreground/60 px-7">
                                <span>Soft / Flat</span>
                                <span>Sharp / Hard</span>
                            </div>
                        </div>

                        <div className="bg-muted/30 p-2.5 rounded-lg border border-border/50 mt-2">
                            <p className="text-[10px] text-muted-foreground text-center animate-pulse">
                                Slide **Directionality** right for inspection clarity
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
