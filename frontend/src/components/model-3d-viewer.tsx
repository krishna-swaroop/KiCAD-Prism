import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Sun, Settings2, Moon, RotateCcw, BoxSelect, Zap, Palette } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

interface Model3DViewerProps {
    modelUrl: string;
    sceneKey?: string;
    modelFileName?: string;
    isometricCamera?: boolean;
}

interface SceneState {
    ambientIntensity: number;
    directionalIntensity: number;
    backgroundColor: string;
}

const DEFAULT_SCENE: SceneState = {
    ambientIntensity: 2.5,
    directionalIntensity: 3.0,
    backgroundColor: "#1e1e1e",
};

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const sanitizeHex = (v: unknown, fallback: string): string =>
    typeof v === "string" && HEX_RE.test(v.trim()) ? v.trim() : fallback;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function loadScene(storageKey: string): SceneState {
    try {
        const raw = sessionStorage.getItem(storageKey);
        if (!raw) return DEFAULT_SCENE;
        const p = JSON.parse(raw) as Partial<SceneState>;
        return {
            ambientIntensity: typeof p.ambientIntensity === "number" ? clamp(p.ambientIntensity, 0, 6) : DEFAULT_SCENE.ambientIntensity,
            directionalIntensity: typeof p.directionalIntensity === "number" ? clamp(p.directionalIntensity, 0, 6) : DEFAULT_SCENE.directionalIntensity,
            backgroundColor: sanitizeHex(p.backgroundColor, DEFAULT_SCENE.backgroundColor),
        };
    } catch {
        return DEFAULT_SCENE;
    }
}

export function Model3DViewer({ modelUrl, sceneKey, isometricCamera }: Model3DViewerProps) {
    const mountRef = useRef<HTMLDivElement>(null);
    const storageKey = `kicad-prism:3d-v2:${encodeURIComponent(sceneKey || modelUrl)}`;

    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const ambientRef = useRef<THREE.AmbientLight | null>(null);
    const directionalRef = useRef<THREE.DirectionalLight | null>(null);
    const sceneObjRef = useRef<THREE.Scene | null>(null);
    const rafRef = useRef<number | null>(null);
    const mountedRef = useRef(false);

    const [scene, setScene] = useState<SceneState>(() => loadScene(storageKey));
    const sceneRef = useRef(scene);
    const [showSettings, setShowSettings] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [hexInput, setHexInput] = useState(scene.backgroundColor);

    useEffect(() => { sceneRef.current = scene; }, [scene]);
    useEffect(() => { setHexInput(scene.backgroundColor); }, [scene.backgroundColor]);

    // Persist
    useEffect(() => {
        const t = setTimeout(() => {
            try { sessionStorage.setItem(storageKey, JSON.stringify(scene)); } catch { /* */ }
        }, 150);
        return () => clearTimeout(t);
    }, [scene, storageKey]);

    // Live-update lighting and background without rebuilding scene
    useEffect(() => {
        if (ambientRef.current) ambientRef.current.intensity = scene.ambientIntensity;
        if (directionalRef.current) directionalRef.current.intensity = scene.directionalIntensity;
        if (sceneObjRef.current) sceneObjRef.current.background = new THREE.Color(scene.backgroundColor);
        if (rendererRef.current) rendererRef.current.setClearColor(scene.backgroundColor);
    }, [scene]);

    const handleReset = useCallback(() => setScene(DEFAULT_SCENE), []);

    // Build Three.js scene once per modelUrl
    useEffect(() => {
        const mount = mountRef.current;
        if (!mount) return;
        mountedRef.current = true;

        const w = mount.clientWidth;
        const h = mount.clientHeight;

        // Renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(w, h);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
        renderer.shadowMap.enabled = false;
        mount.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // Scene
        const threeScene = new THREE.Scene();
        const bg = sceneRef.current.backgroundColor;
        threeScene.background = new THREE.Color(bg);
        renderer.setClearColor(bg);
        sceneObjRef.current = threeScene;

        // Lights
        const ambient = new THREE.AmbientLight(0xffffff, sceneRef.current.ambientIntensity);
        threeScene.add(ambient);
        ambientRef.current = ambient;

        const dir = new THREE.DirectionalLight(0xffffff, sceneRef.current.directionalIntensity);
        dir.position.set(1.5, 2, 2);
        threeScene.add(dir);
        directionalRef.current = dir;

        // Secondary fill light (softer, from opposite side)
        const fill = new THREE.DirectionalLight(0xffffff, 1.2);
        fill.position.set(-1, -1, 1);
        threeScene.add(fill);

        // Camera
        const camera = new THREE.PerspectiveCamera(45, w / h, 0.001, 10000);
        camera.position.set(0, -1, 0.5);
        cameraRef.current = camera;

        // Controls
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controlsRef.current = controls;

        // Render loop
        const animate = () => {
            if (!mountedRef.current) return;
            rafRef.current = requestAnimationFrame(animate);
            controls.update();
            renderer.render(threeScene, camera);
        };

        // Resize observer
        const ro = new ResizeObserver(entries => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                if (width === 0 || height === 0) continue;
                renderer.setSize(width, height);
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
            }
        });
        ro.observe(mount);

        // Load GLB
        const loader = new GLTFLoader();
        loader.load(
            modelUrl,
            (gltf) => {
                if (!mountedRef.current) return;

                const model = gltf.scene;

                // Fix up materials: ensure PBR is rendered correctly
                model.traverse((child) => {
                    if ((child as THREE.Mesh).isMesh) {
                        const mesh = child as THREE.Mesh;
                        mesh.castShadow = false;
                        mesh.receiveShadow = false;

                        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                        for (const mat of mats) {
                            if (mat instanceof THREE.MeshStandardMaterial) {
                                // KiCad GLBs embed colors in baseColor — trust them
                                mat.needsUpdate = true;
                            }
                        }
                    }
                });

                threeScene.add(model);

                // Fit camera to model
                const box = new THREE.Box3().setFromObject(model);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);
                const fov = camera.fov * (Math.PI / 180);
                const dist = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 2.2;

                controls.target.copy(center);

                if (isometricCamera) {
                    const d = dist / Math.sqrt(3);
                    camera.position.set(center.x + d, center.y - d, center.z + d);
                } else {
                    camera.position.set(center.x, center.y - dist, center.z + maxDim * 0.4);
                }

                camera.near = dist * 0.001;
                camera.far = dist * 50;
                camera.updateProjectionMatrix();
                controls.update();

                animate();
            },
            undefined,
            (err) => {
                console.error("GLB load error", err);
                animate(); // still start loop so controls work
            }
        );

        return () => {
            mountedRef.current = false;
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
            ro.disconnect();
            controls.dispose();
            renderer.dispose();
            if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
            rendererRef.current = null;
            cameraRef.current = null;
            controlsRef.current = null;
            ambientRef.current = null;
            directionalRef.current = null;
            sceneObjRef.current = null;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [modelUrl]);

    return (
        <div className="relative w-full h-full min-h-[600px] overflow-hidden bg-[#1e1e1e]">
            <div ref={mountRef} className="w-full h-full" />

            {/* Scene toggle */}
            <div className="absolute top-4 right-4 z-[100]">
                <Button
                    variant="outline"
                    size="sm"
                    className={`shadow-xl border-border backdrop-blur-md transition-all ${showSettings ? "bg-primary text-primary-foreground border-primary" : "bg-background/80"}`}
                    onClick={e => { e.stopPropagation(); setShowSettings(v => !v); }}
                >
                    <Sun className="w-4 h-4 mr-2" />
                    Scene
                </Button>
            </div>

            {showSettings && (
                <div
                    className="absolute top-14 right-4 z-[100] w-[320px] max-w-[calc(100vw-2rem)] p-4 shadow-2xl bg-card/95 backdrop-blur-xl border border-border/50 rounded-xl animate-in fade-in zoom-in slide-in-from-top-2 duration-200"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="space-y-4">
                        <div className="flex justify-between items-center border-b border-border/50 pb-2">
                            <h4 className="font-semibold flex items-center text-foreground tracking-tight">
                                <Settings2 className="w-4 h-4 mr-2 text-primary" />
                                Scene Controls
                            </h4>
                            <div className="flex gap-1">
                                <Button variant="ghost" size="icon-xs" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={handleReset} title="Reset">
                                    <RotateCcw className="w-3 h-3" />
                                </Button>
                                <Button variant="ghost" size="icon-xs" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => setShowSettings(false)}>
                                    ×
                                </Button>
                            </div>
                        </div>

                        {/* Ambient */}
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <Label className="text-sm font-medium">Ambient Light</Label>
                                <span className="text-[11px] font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
                                    {(scene.ambientIntensity * 100 / 6).toFixed(0)}%
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                <Moon className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                                <Slider value={[scene.ambientIntensity]} min={0} max={6} step={0.1}
                                    onValueChange={([v]) => setScene(p => ({ ...p, ambientIntensity: v }))} className="py-2" />
                                <Sun className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                            </div>
                        </div>

                        {/* Background */}
                        <div className="space-y-2">
                            <Label className="text-sm font-medium flex items-center gap-2">
                                <Palette className="w-4 h-4" />
                                Background
                            </Label>
                            <div className="flex items-center gap-2">
                                <input type="color" aria-label="Background color" value={scene.backgroundColor}
                                    onChange={e => setScene(p => ({ ...p, backgroundColor: e.target.value }))}
                                    className="h-9 w-10 rounded border border-border bg-transparent p-0" />
                                <Input value={hexInput}
                                    onChange={e => setHexInput(e.target.value)}
                                    onBlur={() => setScene(p => ({ ...p, backgroundColor: sanitizeHex(hexInput, p.backgroundColor) }))}
                                    onKeyDown={e => { if (e.key === "Enter") setScene(p => ({ ...p, backgroundColor: sanitizeHex(hexInput, p.backgroundColor) })); }}
                                    className="h-9 font-mono text-xs uppercase" placeholder="#1E1E1E" />
                            </div>
                        </div>

                        {/* Advanced */}
                        <div className="border-t border-border/40 pt-3">
                            <Button type="button" variant="ghost" className="h-8 w-full justify-start px-2"
                                onClick={() => setShowAdvanced(v => !v)}>
                                {showAdvanced ? "Hide Advanced" : "Show Advanced"}
                            </Button>
                            {showAdvanced && (
                                <div className="space-y-3 mt-3">
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <Label className="text-sm font-medium">Directional Light</Label>
                                            <span className="text-[11px] font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
                                                {(scene.directionalIntensity * 100 / 6).toFixed(0)}%
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <BoxSelect className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                                            <Slider value={[scene.directionalIntensity]} min={0} max={6} step={0.1}
                                                onValueChange={([v]) => setScene(p => ({ ...p, directionalIntensity: v }))} className="py-2" />
                                            <Zap className="w-4 h-4 text-primary/50 shrink-0" />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
