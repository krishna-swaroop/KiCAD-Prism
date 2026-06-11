import { useState, useEffect, useRef } from "react";
import { X, Loader2, AlertCircle, Eye, ZoomIn, ZoomOut, RotateCcw, CircuitBoard, Cpu, ClipboardList, ChevronDown, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

interface VisualDiffViewerProps {
    projectId: string;
    commit1: string;  // Newer commit
    commit2: string;  // Older commit
    onClose: () => void;
}

interface DiffJobStatus {
    status: "running" | "completed" | "failed";
    message: string;
    percent: number;
    logs: string[];
    error?: string;
}

interface DiffManifest {
    job_id: string;
    commit1: string;
    commit2: string;
    schematic: boolean;
    pcb: boolean;
    sheets: string[]; // filenames
    layers: string[]; // layer names like F.Cu
    pours?: boolean; // pour-free PCB variant available under pcb_nopours/
    bom: {
        summary: { added: number; removed: number; changed: number };
        changes: Array<{
            ref: string;
            status: "added" | "removed" | "changed" | "unchanged";
            old?: Record<string, string>;
            new?: Record<string, string>;
            diffs?: Record<string, { old: string; new: string }>;
        }>;
        fields: string[];
    } | null;
}

// Physical stacking order: copper at the bottom, decoration and board
// outline on top, so multi-layer views read like the real board.
const layerRank = (l: string) =>
    l.endsWith(".Cu") ? 0
    : l.endsWith(".Mask") ? 1
    : l.endsWith(".Paste") ? 2
    : l.endsWith(".SilkS") ? 3
    : l.endsWith(".Fab") ? 4
    : l === "Edge.Cuts" ? 6
    : 5;

export function VisualDiffViewer({ projectId, commit1, commit2, onClose }: VisualDiffViewerProps) {
    const [jobId, setJobId] = useState<string | null>(null);
    const [status, setStatus] = useState<DiffJobStatus | null>(null);
    const [manifest, setManifest] = useState<DiffManifest | null>(null);
    const [error, setError] = useState<string | null>(null);

    // View State
    const [viewMode, setViewMode] = useState<"schematic" | "pcb" | "bom">("schematic");
    const [selectedSheet, setSelectedSheet] = useState<string>("");
    const [selectedLayers, setSelectedLayers] = useState<string[]>([]);
    const [showPours, setShowPours] = useState(true);
    const [opacity, setOpacity] = useState([50]); // 0-100, 50 = mix

    // BoM Filtering
    const [filters, setFilters] = useState({
        added: true,
        removed: true,
        changed: true,
        unchanged: false
    });

    // Layout
    const logsEndRef = useRef<HTMLDivElement>(null);

// Cleanup on unmount
useEffect(() => {
return () => {
if (jobId) {
fetch(`/api/projects/${projectId}/diff/${jobId}`, { method: "DELETE" });
}
};
}, [jobId, projectId]);

// Start Job
useEffect(() => {
const startJob = async () => {
try {
const res = await fetch(`/api/projects/${projectId}/diff`, {
method: "POST",
headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ commit1, commit2 })
});

if (!res.ok) throw new Error("Failed to start diff job");

const data = await res.json();
setJobId(data.job_id);
} catch (err) {
setError(err instanceof Error ? err.message : "Failed to start diff");
}
};
startJob();
}, [projectId, commit1, commit2]);

// Poll Status
useEffect(() => {
if (!jobId || manifest) return;

const poll = async () => {
try {
const res = await fetch(`/api/projects/${projectId}/diff/${jobId}/status`);
if (!res.ok) throw new Error("Failed to poll status");
const data: DiffJobStatus = await res.json();
setStatus(data);

if (data.status === "failed") {
setError(data.error || "Generation failed");
} else if (data.status === "completed") {
// Fetch manifest
const mRes = await fetch(`/api/projects/${projectId}/diff/${jobId}/manifest`);
if (mRes.ok) {
const mData: DiffManifest = await mRes.json();
setManifest(mData);

// Set defaults
if (mData.sheets.length > 0) setSelectedSheet(mData.sheets[0]);
if (mData.layers.length > 0) setSelectedLayers([mData.layers[0]]);
if (!mData.schematic && mData.pcb) setViewMode("pcb");
}
}
} catch (e) {
console.error(e);
}
};

const interval = setInterval(() => {
if (status?.status !== "completed" && status?.status !== "failed") {
poll();
}
}, 1000);
poll();
return () => clearInterval(interval);
}, [jobId, projectId, status?.status, manifest]);


// Scroll logs
useEffect(() => {
if (logsEndRef.current) {
logsEndRef.current.scrollIntoView({ behavior: "smooth" });
}
}, [status?.logs]);


// Asset URLs
const getAssetUrl = (commit: string, type: "sch" | "pcb" | "pcb_nopours", item: string) => {
if (!jobId) return "";
// item is filename for sch, layer name for pcb
let filename = item;
if (type !== "sch") {
filename = item.replace(/\./g, "_") + ".svg";
}
return `/api/projects/${projectId}/diff/${jobId}/assets/${commit}/${type}/${encodeURIComponent(filename)}`;
};

const renderViewer = () => {
if (!manifest) return null;

if (viewMode === "bom") {
const bom = manifest.bom;
if (!bom) return <div className="flex items-center justify-center h-full text-muted-foreground">BoM data not available</div>;

// If no filters are selected (added, removed, changed all false), show all including unchanged
const anyFilterSelected = filters.added || filters.removed || filters.changed;
const filteredChanges = anyFilterSelected
? bom.changes.filter(c => filters[c.status as keyof typeof filters])
: bom.changes;

return (
<div className="flex-1 flex flex-col h-full bg-background min-h-0">
<div className="p-4 border-b flex gap-4 text-sm shrink-0">
<Button
variant={filters.added ? "secondary" : "outline"}
size="sm"
className={`flex items-center gap-1.5 h-8 ${filters.added ? "bg-green-500/10 border-green-500 text-green-700" : ""}`}
onClick={() => setFilters(f => ({ ...f, added: !f.added }))}
>
<div className={`w-2 h-2 rounded-full ${filters.added ? "bg-green-500" : "bg-muted-foreground"}`} /> Added ({bom.summary.added})
</Button>
<Button
variant={filters.removed ? "secondary" : "outline"}
size="sm"
className={`flex items-center gap-1.5 h-8 ${filters.removed ? "bg-red-500/10 border-red-500 text-red-700" : ""}`}
onClick={() => setFilters(f => ({ ...f, removed: !f.removed }))}
>
<div className={`w-2 h-2 rounded-full ${filters.removed ? "bg-red-500" : "bg-muted-foreground"}`} /> Removed ({bom.summary.removed})
</Button>
<Button
variant={filters.changed ? "secondary" : "outline"}
size="sm"
className={`flex items-center gap-1.5 h-8 ${filters.changed ? "bg-orange-500/10 border-orange-500 text-orange-700" : ""}`}
onClick={() => setFilters(f => ({ ...f, changed: !f.changed }))}
>
<div className={`w-2 h-2 rounded-full ${filters.changed ? "bg-orange-500" : "bg-muted-foreground"}`} /> Changed ({bom.summary.changed})
</Button>
</div>
<div className="flex-1 overflow-auto">
<table className="min-w-full text-sm text-left border-collapse">
<thead className="bg-muted text-muted-foreground font-medium border-b sticky top-0 z-10">
<tr className="bg-muted">
<th className="px-4 py-2 border-r bg-muted">Status</th>
{bom.fields.map(f => (
<th key={f} className="px-4 py-2 border-r bg-muted">{f}</th>
))}
</tr>
</thead>
<tbody>
{filteredChanges.map((item, idx) => {
const isAdded = item.status === "added";
const isRemoved = item.status === "removed";
const isChanged = item.status === "changed";

let rowClass = "border-b ";
if (isAdded) rowClass += "bg-green-500/10 text-green-900";
if (isRemoved) rowClass += "bg-red-500/10 text-red-900 italic line-through opacity-70";
if (isChanged) rowClass += "bg-orange-500/5";

return (
<tr key={idx} className={rowClass}>
<td className="px-4 py-2 border-r font-medium uppercase text-[10px] tracking-wider">
{item.status}
</td>
{bom.fields.map(f => {
const oldValue = item.old?.[f];
const newValue = item.new?.[f];
const fieldDiff = item.diffs?.[f];

if (isChanged && fieldDiff) {
return (
<td key={f} className="px-4 py-2 border-r bg-orange-500/5">
<div className="flex flex-col gap-1">
<div className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] line-through w-fit">
{fieldDiff.old}
</div>
<div className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 text-xs font-medium w-fit">
{fieldDiff.new}
</div>
</div>
</td>
);
}

let cellClass = "px-4 py-2 border-r ";
if (item.status === "unchanged") cellClass += "opacity-50 font-light text-muted-foreground";

return (
<td key={f} className={cellClass}>
{isRemoved ? oldValue : newValue}
</td>
);
})}
</tr>
);
})}
{filteredChanges.length === 0 && (
<tr>
<td colSpan={bom.fields.length + 1} className="px-4 py-12 text-center text-muted-foreground">
No entries match the selected filters
</td>
</tr>
)}
</tbody>
</table>
</div>
</div>
);
}

const isSch = viewMode === "schematic";

if (isSch && !selectedSheet) return <div className="flex items-center justify-center h-full text-muted-foreground">No assets found</div>;
if (!isSch && selectedLayers.length === 0) return <div className="flex items-center justify-center h-full text-muted-foreground">No layers selected</div>;

const oldImg = getAssetUrl(commit2, "sch", selectedSheet);
const newImg = getAssetUrl(commit1, "sch", selectedSheet);

// PCB: stack the selected layers in physical order; the SVG exports have
// transparent backgrounds, so per-commit groups composite cleanly.
const pcbDir = manifest.pours && !showPours ? "pcb_nopours" : "pcb";
const orderedLayers = [...selectedLayers].sort((a, b) => layerRank(a) - layerRank(b));
// Slight per-layer darkening so simultaneous layers are distinguishable
// while keeping the red/green old/new semantics.
const layerFilter = (idx: number) => `brightness(${Math.max(0.5, 1 - idx * 0.12)})`;
const renderLayerStack = (commit: string) =>
    orderedLayers.map((l, idx) => (
        <img
            key={`${l}-${pcbDir}-${commit}`}
            src={getAssetUrl(commit, pcbDir, l)}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            style={{ filter: layerFilter(idx) }}
            onError={e => { e.currentTarget.style.visibility = "hidden"; }}
            alt={l}
        />
    ));

return (
<TransformWrapper
initialScale={1}
minScale={0.1}
maxScale={20}
centerOnInit
>
{({ zoomIn, zoomOut, resetTransform }) => (
<>
{/* Floating Zoom Controls */}
<div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2 bg-background/90 backdrop-blur border rounded-md p-1 shadow-lg">
<Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => zoomIn()}>
<ZoomIn className="h-4 w-4" />
</Button>
<Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => zoomOut()}>
<ZoomOut className="h-4 w-4" />
</Button>
<Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => resetTransform()}>
<RotateCcw className="h-4 w-4" />
</Button>
</div>

<TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-full !h-full flex items-center justify-center">
<div className="relative shadow-2xl border bg-white" style={{ minWidth: "1200px", minHeight: "800px" }}>
{isSch ? (
<>
{/* Old Commit (Bottom) */}
<img
src={oldImg}
className="absolute inset-0 w-full h-full object-contain pointer-events-none"
alt="Old Version"
/>

{/* New Commit (Top) - Opacity controlled */}
<img
src={newImg}
className="absolute inset-0 w-full h-full object-contain bg-white transition-opacity duration-150 pointer-events-none"
style={{ opacity: opacity[0] / 100 }}
alt="New Version"
/>
</>
) : (
<>
{/* Old Commit layers (Bottom) */}
<div className="absolute inset-0">
{renderLayerStack(commit2)}
</div>

{/* New Commit layers (Top) - one white backdrop on the group so the
    cross-fade covers the old group without occluding stacked layers */}
<div
className="absolute inset-0 bg-white transition-opacity duration-150"
style={{ opacity: opacity[0] / 100 }}
>
{renderLayerStack(commit1)}
</div>
</>
)}
</div>
</TransformComponent>
</>
)}
</TransformWrapper>
);
};

return (
<div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
<div className="bg-background border rounded-lg shadow-lg flex flex-col w-[98vw] h-[95vh] overflow-hidden">
{/* Header */}
<div className="flex items-center justify-between p-4 border-b">
<div className="flex items-center gap-4">
<h2 className="text-lg font-semibold">Visual Diff</h2>
<div className="text-sm text-muted-foreground flex gap-2">
<span className="bg-red-100 text-red-700 px-2 py-0.5 rounded border border-red-200">{commit2.slice(0, 7)} (Old)</span>
<span>vs</span>
<span className="bg-green-100 text-green-700 px-2 py-0.5 rounded border border-green-200">{commit1.slice(0, 7)} (New)</span>
</div>
</div>
<Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
</div>

{manifest ? (
// Toolbar & Viewer
<div className="flex-1 flex flex-col min-h-0">
<div className="p-2 border-b bg-muted/30 flex items-center gap-4 flex-wrap">
{/* Mode Scwitcher */}
<div className="flex items-center rounded-md border bg-background p-1">
<Button
variant={viewMode === "schematic" ? "secondary" : "ghost"}
size="sm"
onClick={() => setViewMode("schematic")}
disabled={!manifest.schematic}
>
<CircuitBoard className="h-4 w-4 mr-2" /> Schematic
</Button>
<Button
variant={viewMode === "pcb" ? "secondary" : "ghost"}
size="sm"
onClick={() => setViewMode("pcb")}
disabled={!manifest.pcb}
>
<Cpu className="h-4 w-4 mr-2" /> PCB
</Button>
<Button
variant={viewMode === "bom" ? "secondary" : "ghost"}
size="sm"
onClick={() => setViewMode("bom")}
disabled={!manifest.bom}
>
<ClipboardList className="h-4 w-4 mr-2" /> BoM
</Button>
</div>


{/* Selector */}
<div className="w-64">
{viewMode === "schematic" ? (
<Select value={selectedSheet} onValueChange={setSelectedSheet}>
<SelectTrigger className="h-8">
<SelectValue placeholder="Select Sheet" />
</SelectTrigger>
<SelectContent>
{manifest.sheets.map(s => <SelectItem key={s} value={s}>{s.replace(".svg", "")}</SelectItem>)}
</SelectContent>
</Select>
) : viewMode === "pcb" ? (
<DropdownMenu>
<DropdownMenuTrigger asChild>
<Button variant="outline" size="sm" className="h-8 w-full justify-between font-normal">
{selectedLayers.length === 0
? "Select Layers"
: selectedLayers.length === 1
? selectedLayers[0]
: `${selectedLayers.length} layers`}
<ChevronDown className="h-4 w-4 opacity-50" />
</Button>
</DropdownMenuTrigger>
<DropdownMenuContent className="w-64 max-h-80 overflow-y-auto">
{manifest.layers.map(l => (
<DropdownMenuCheckboxItem
key={l}
checked={selectedLayers.includes(l)}
onCheckedChange={(checked) =>
setSelectedLayers(prev => checked ? [...prev, l] : prev.filter(x => x !== l))
}
onSelect={e => e.preventDefault()}
>
{l}
</DropdownMenuCheckboxItem>
))}
</DropdownMenuContent>
</DropdownMenu>
) : null}
</div>

{/* Pour Toggle */}
{viewMode === "pcb" && (
<Button
variant={showPours ? "secondary" : "outline"}
size="sm"
className="h-8"
disabled={!manifest.pours}
title={manifest.pours ? "Toggle copper pours" : "Pour-free export unavailable"}
onClick={() => setShowPours(p => !p)}
>
<Layers className="h-4 w-4 mr-2" /> Pours
</Button>
)}

<div className="flex-1" />

{/* Opacity Slider */}
{viewMode !== "bom" && (
<div className="flex items-center gap-3 w-64 bg-background border px-4 py-2 rounded-full shadow-sm">
<Eye className="h-4 w-4 text-muted-foreground" />
<span className="text-xs font-semibold w-8 text-right text-red-600">Old</span>
<Slider
value={opacity}
onValueChange={setOpacity}
max={100}
step={1}
className="flex-1"
/>
<span className="text-xs font-semibold w-8 text-green-600">New</span>
</div>
)}
</div>

{/* Canvas */}
<div className="flex-1 bg-zinc-100 overflow-hidden relative">
{renderViewer()}
</div>
</div>
) : (
// Loading State
<div className="flex-1 flex flex-col p-8">
{error ? (
<div className="text-center text-destructive">
<AlertCircle className="h-12 w-12 mx-auto mb-4" />
<h3 className="text-lg font-bold">Generation Failed</h3>
<p>{error}</p>
</div>
) : (
<>
<div className="text-center mb-8">
<Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
<h3 className="text-lg font-medium">{status?.message || "Initializing..."}</h3>
</div>
<div className="flex-1 bg-zinc-950 rounded-lg p-4 font-mono text-xs text-zinc-300 overflow-auto border border-zinc-800">
{status?.logs.map((L, i) => (
<div key={i} className="border-b border-zinc-900/50 pb-0.5 mb-0.5">{L}</div>
))}
<div ref={logsEndRef} />
</div>
</>
)}
</div>
)}
</div>
</div>
);
}