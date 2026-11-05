import type { ReactNode } from "react";
import { Box, CircuitBoard, Cpu, FileText, Layers3, MessageSquare, MessageSquarePlus, PackageCheck, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

import { VIEWER_TABS, type VisualizerTab } from "./viewer-modes";

/** In VIEWER_TABS order, which is also the 1–6 shortcut order. */
const TAB_LABELS: Record<VisualizerTab, { label: string; icon: LucideIcon }> = {
    sch: { label: "Schematic", icon: Cpu },
    pcb: { label: "PCB", icon: CircuitBoard },
    "3d": { label: "3D", icon: Box },
    bom: { label: "BOM", icon: FileText },
    stackup: { label: "Stackup", icon: Layers3 },
    assembly: { label: "Assembly Assistant", icon: PackageCheck },
};

/**
 * The view tabs, then on the right whatever the visualizer adds (`trailing`),
 * commenting mode (when it applies) and the comments rail toggle.
 */
export function VisualizerToolbar({
    activeTab,
    onTab,
    trailing,
    commentMode,
    onToggleCommentMode,
    commentsOpen,
    onToggleComments,
    commentCount,
}: {
    activeTab: VisualizerTab;
    onTab: (tab: VisualizerTab) => void;
    trailing?: ReactNode;
    /** Null when commenting mode does not apply to this tab or this user. */
    commentMode: boolean | null;
    onToggleCommentMode: () => void;
    commentsOpen: boolean;
    onToggleComments: () => void;
    commentCount: number;
}) {
    return (
        <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b bg-muted/20 px-1.5 py-1">
            {VIEWER_TABS.map((tab, index) => {
                const { label, icon: Icon } = TAB_LABELS[tab];
                return (
                    <Button
                        key={tab}
                        variant={activeTab === tab ? "secondary" : "ghost"}
                        size="sm"
                        data-visualizer-tab={tab}
                        onClick={() => onTab(tab)}
                        title={`${label} (${index + 1})`}
                        className="text-xs"
                    >
                        <Icon />
                        {label}
                    </Button>
                );
            })}
            <div className="flex-1" />
            {trailing}
            {commentMode !== null ? (
                <Button
                    variant={commentMode ? "default" : "ghost"}
                    size="icon-sm"
                    className={commentMode ? "bg-warning text-warning-foreground hover:bg-warning/90" : undefined}
                    aria-pressed={commentMode}
                    aria-label="Commenting mode"
                    title="Commenting mode (C)"
                    onClick={onToggleCommentMode}
                >
                    <MessageSquarePlus />
                </Button>
            ) : null}
            <Button
                variant={commentsOpen ? "secondary" : "ghost"}
                size="sm"
                onClick={onToggleComments}
                className="text-xs"
                aria-pressed={commentsOpen}
            >
                <MessageSquare />
                Comments
                {commentCount > 0 ? (
                    <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">
                        {commentCount}
                    </span>
                ) : null}
            </Button>
        </div>
    );
}
