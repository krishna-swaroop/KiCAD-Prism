import { useEffect, useMemo, useRef, useState } from "react";
import {
    Background, MarkerType, Panel, ReactFlow, ReactFlowProvider, useReactFlow,
    type Edge, type Node, type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Info, LayoutGrid, Loader2, Plus, Sparkles } from "lucide-react";

import { DiagramZoomControls } from "@/features/system-builder/diagram-zoom-controls";
import { FloatingToolbar } from "@/features/system-builder/workspace/floating-toolbar";
import { ToolbarButton } from "@/features/system-builder/workspace/toolbar-button";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { cn } from "@/lib/utils";

import type { BoardIndex } from "./board-index";
import { netLeaf } from "./board-index";
import { ElementInspector } from "./ElementInspector";
import {
    addElement, autoArrange, connect, removeElement, setSolved, treeOf, updateElement,
    type ElementKind, type Point, type TreeState,
} from "./power-tree-model";
import { EDGE_STROKE, ELEMENT_STYLE, NODE_TYPES, type ElementNodeData } from "./power-tree-nodes";

export type TreeEdit = (state: TreeState, board: BoardIndex) => TreeState | { state: TreeState; node: string };

type Props = {
    state: TreeState;
    board: BoardIndex | null;
    canEdit: boolean;
    active: boolean;
    selected: string | null;
    onSelect: (node: string | null) => void;
    /** Apply an edit and save it; rejects with the reason it was refused. */
    onEdit: (edit: TreeEdit) => Promise<void>;
    onInfer: (mode: "replace" | "add") => void;
    inferring: boolean;
    /** Nodes to bring into view (search); `seq` re-triggers the same set. */
    focus: { nodes: string[]; seq: number } | null;
};

const ADD: { kind: ElementKind; key: string; title: string }[] = [
    { kind: "source", key: "s", title: "Add an input supply: a connector that feeds a rail" },
    { kind: "rail", key: "r", title: "Add a rail: a power net and its voltage" },
    { kind: "converter", key: "c", title: "Add a converter: a switching or linear regulator between two rails" },
    { kind: "load", key: "l", title: "Add a load: a part drawing current from a rail" },
];

export function PowerTreeCanvas(props: Props) {
    return (
        <ReactFlowProvider>
            <Canvas {...props} />
        </ReactFlowProvider>
    );
}

function Canvas({ state, board, canEdit, active, selected, onSelect, onEdit, onInfer, inferring, focus }: Props) {
    const flow = useReactFlow();
    const wrapper = useRef<HTMLDivElement>(null);
    const { elements, edges } = useMemo(() => treeOf(state), [state]);
    const fallback = useMemo(() => autoArrange(state).layout.positions, [state]);
    const [dragging, setDragging] = useState<Record<string, Point>>({});
    // The canvas is controlled, so React Flow's measured sizes must be fed
    // back into every node it is given, or it keeps rebuilt nodes hidden.
    const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({});

    const railLabel = useMemo(() => {
        const labels = new Map(state.setup.rails.map((rail) => [rail.id, `${netLeaf(rail.net.slice(rail.net.indexOf(":") + 1))}`]));
        return (id?: string) => (id ? labels.get(id) ?? id : "?");
    }, [state.setup.rails]);

    const nodes: Node[] = useMemo(() => elements.map((element) => ({
        id: element.node,
        type: element.kind,
        position: dragging[element.node] ?? state.layout.positions[element.node] ?? fallback[element.node] ?? { x: 0, y: 0 },
        data: { element, railLabel } satisfies ElementNodeData,
        selected: element.node === selected,
        draggable: canEdit,
        ...(measured[element.node] ? { measured: measured[element.node] } : {}),
    })), [elements, dragging, state.layout.positions, fallback, railLabel, selected, canEdit, measured]);

    const flowEdges: Edge[] = useMemo(() => edges.map((edge) => {
        const lit = selected !== null && (edge.source === selected || edge.target === selected);
        const color = lit ? "hsl(var(--primary))" : EDGE_STROKE;
        return {
            id: edge.id, source: edge.source, target: edge.target, type: "smoothstep",
            style: { stroke: color, strokeWidth: lit ? 2 : 1.5 },
            markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
        };
    }), [edges, selected]);

    useEffect(() => {
        if (!focus?.nodes.length) return;
        void flow.fitView({ nodes: focus.nodes.map((id) => ({ id })), padding: 0.6, maxZoom: 1.4, duration: 300 });
    }, [focus, flow]);

    const centre = (): Point => {
        const box = wrapper.current?.getBoundingClientRect();
        if (!box) return { x: 0, y: 0 };
        const point = flow.screenToFlowPosition({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
        return { x: Math.round(point.x - 110 + (Math.random() - 0.5) * 40), y: Math.round(point.y - 30 + (Math.random() - 0.5) * 40) };
    };
    const add = (kind: ElementKind) => {
        if (!canEdit) return;
        const at = centre();
        void onEdit((current, b) => addElement(current, b, kind, {}, at)).catch(() => undefined);
    };
    const arrange = () => {
        if (!canEdit) return;
        void onEdit((current) => autoArrange(current)).then(() => window.setTimeout(() => void flow.fitView({ padding: 0.15, duration: 300 }), 50));
    };
    const remove = () => {
        if (!canEdit || !selected) return;
        const node = selected;
        onSelect(null);
        void onEdit((current) => removeElement(current, node)).catch(() => undefined);
    };

    useHotkeys([
        ...ADD.map((item) => ({ combo: item.key, handler: () => add(item.kind) })),
        { combo: "shift+i", handler: () => canEdit && onInfer(elements.length ? "add" : "replace") },
        { combo: "a", handler: arrange },
        { combo: "delete", handler: remove },
        { combo: "backspace", handler: remove },
        { combo: "escape", handler: () => onSelect(null), allowInInputs: true },
    ], { enabled: active });

    const onNodesChange = (changes: NodeChange[]) => {
        const sizes = changes.filter((change) => change.type === "dimensions" && change.dimensions);
        if (sizes.length) {
            setMeasured((current) => {
                const next = { ...current };
                for (const change of sizes) if (change.type === "dimensions" && change.dimensions) next[change.id] = change.dimensions;
                return next;
            });
        }
        setDragging((current) => {
            let next = current;
            for (const change of changes) {
                if (change.type === "position" && change.position) next = { ...next, [change.id]: change.position };
            }
            return next;
        });
    };
    const onNodeDragStop = (_event: unknown, _node: Node, moved: Node[]) => {
        const positions = Object.fromEntries(moved.map((node) => [node.id, { x: Math.round(node.position.x), y: Math.round(node.position.y) }]));
        void onEdit((current) => ({ ...current, layout: { ...current.layout, positions: { ...fallback, ...current.layout.positions, ...positions } } }))
            .finally(() => setDragging({}));
    };

    const element = elements.find((item) => item.node === selected) ?? null;
    const notes = state.layout.notes ?? [];

    return (
        <div ref={wrapper} className="theme-light relative h-full min-h-0 bg-background" data-testid="power-tree-canvas">
            <ReactFlow
                nodes={nodes}
                edges={flowEdges}
                nodeTypes={NODE_TYPES}
                colorMode="light"
                nodesConnectable={canEdit}
                elementsSelectable
                onNodesChange={onNodesChange}
                onNodeDragStop={onNodeDragStop}
                onConnect={(connection) => {
                    if (!connection.source || !connection.target) return;
                    void onEdit((current, b) => connect(current, b, connection.source, connection.target)).catch(() => undefined);
                }}
                onNodeClick={(_event, node) => onSelect(node.id)}
                onPaneClick={() => onSelect(null)}
                deleteKeyCode={null}
                fitView
                fitViewOptions={{ padding: 0.15 }}
                minZoom={0.15}
                proOptions={{ hideAttribution: true }}
            >
                <Background gap={16} />
                <Panel position="top-left">
                    <FloatingToolbar label="Add elements">
                        {ADD.map((item) => {
                            const style = ELEMENT_STYLE[item.kind];
                            return (
                                <ToolbarButton key={item.kind} title={`${item.title} (${item.key.toUpperCase()})`} aria-label={`Add ${style.label}`}
                                    disabled={!canEdit} onClick={() => add(item.kind)}>
                                    <style.icon className={cn("size-3.5", style.text)} aria-hidden /> {style.label}
                                </ToolbarButton>
                            );
                        })}
                    </FloatingToolbar>
                </Panel>
                <Panel position="bottom-left"><DiagramZoomControls /></Panel>
                <Panel position="bottom-right">
                    <FloatingToolbar label="Arrange">
                        <InferMenu canEdit={canEdit} empty={elements.length === 0} inferring={inferring} onInfer={onInfer} />
                        <ToolbarButton title="Auto-arrange (A)" disabled={!canEdit || elements.length === 0} onClick={arrange}>
                            <LayoutGrid className="size-4" aria-hidden /> Arrange
                        </ToolbarButton>
                        {notes.length > 0 && <NotesButton notes={notes} />}
                    </FloatingToolbar>
                </Panel>
                {element && (
                    <Panel position="top-right">
                        <ElementInspector
                            element={element}
                            setup={state.setup}
                            board={board}
                            canEdit={canEdit}
                            onPatch={(patch) => void onEdit((current, b) => updateElement(current, b, element.node, patch))
                                .catch(() => undefined)}
                            onSolved={(solved) => void onEdit((current) => setSolved(current, element.id, solved)).catch(() => undefined)}
                            onRemove={remove}
                            onClose={() => onSelect(null)}
                        />
                    </Panel>
                )}
            </ReactFlow>
            {elements.length === 0 && (
                <EmptyState canEdit={canEdit} inferring={inferring} onInfer={() => onInfer("replace")} onAdd={add} />
            )}
        </div>
    );
}

function InferMenu({ canEdit, empty, inferring, onInfer }: {
    canEdit: boolean;
    empty: boolean;
    inferring: boolean;
    onInfer: (mode: "replace" | "add") => void;
}) {
    const icon = inferring ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />;
    if (empty) {
        return (
            <ToolbarButton title="Fill the canvas with the power tree inferred from the netlist (Shift+I)" disabled={!canEdit || inferring}
                onClick={() => onInfer("replace")}>
                {icon} Infer
            </ToolbarButton>
        );
    }
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <ToolbarButton title="Bring in the power tree inferred from the netlist" disabled={!canEdit || inferring}>
                    {icon} Infer
                </ToolbarButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem onSelect={() => onInfer("add")}>
                    <div>
                        <p className="text-sm">Add what is missing <span className="text-xs text-muted-foreground">Shift+I</span></p>
                        <p className="text-xs text-muted-foreground">Keeps your elements and values.</p>
                    </div>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onInfer("replace")}>
                    <div>
                        <p className="text-sm">Replace the whole tree</p>
                        <p className="text-xs text-muted-foreground">Discards currents and efficiencies you set.</p>
                    </div>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function NotesButton({ notes }: { notes: { code: string; message: string }[] }) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <ToolbarButton title="What the inference could not settle">
                    <Info className="size-4" aria-hidden /> {notes.length}
                </ToolbarButton>
            </PopoverTrigger>
            <PopoverContent align="end" className="max-h-80 w-96 overflow-auto text-xs">
                <p className="mb-2 text-sm font-semibold">Inference notes</p>
                <ul className="space-y-1.5">
                    {notes.map((note, index) => <li key={`${note.code}-${index}`}>{note.message}</li>)}
                </ul>
            </PopoverContent>
        </Popover>
    );
}

function EmptyState({ canEdit, inferring, onInfer, onAdd }: {
    canEdit: boolean;
    inferring: boolean;
    onInfer: () => void;
    onAdd: (kind: ElementKind) => void;
}) {
    return (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="pointer-events-auto w-[22rem] rounded-lg border bg-card p-5 text-center text-card-foreground shadow-sm">
                <p className="text-sm font-semibold">Build the board's power tree</p>
                <p className="mt-1 text-xs text-muted-foreground">Sources feed rails, converters link rails, loads draw from them.</p>
                <Button className="mt-4 w-full" disabled={!canEdit || inferring} onClick={onInfer}>
                    {inferring ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : <Sparkles className="mr-2 size-4" aria-hidden />}
                    Start from the inferred power tree
                </Button>
                <p className="mt-4 text-xs text-muted-foreground">or add</p>
                <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                    {ADD.map((item) => (
                        <Button key={item.kind} variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-xs" disabled={!canEdit} onClick={() => onAdd(item.kind)}>
                            <Plus className="size-3" aria-hidden /> {ELEMENT_STYLE[item.kind].label}
                            <kbd className="inline-flex h-5 min-w-[1.25rem] items-center justify-center border bg-muted px-1 font-sans text-[11px] font-medium text-muted-foreground">
                                {item.key.toUpperCase()}
                            </kbd>
                        </Button>
                    ))}
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">Drag from a node's right handle to the next one to connect them.</p>
            </div>
        </div>
    );
}
