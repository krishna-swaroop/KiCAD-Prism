import * as React from "react";
import { useEffect, useState, useCallback } from "react";
import { Check, MessageSquare } from "lucide-react";
import type { Comment } from "@/types/comments";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

interface CommentOverlayProps {
    /** List of comments to display */
    comments: Comment[];
    /** Reference to the ecad-viewer element for coordinate transforms */
    viewerRef: React.RefObject<HTMLElement>;
    /** Callback when a comment pin is clicked */
    onPinClick?: (comment: Comment) => void;
    /** Whether to show resolved comments (dimmed) */
    showResolved?: boolean;
}

interface PinPosition {
    x: number;
    y: number;
    visible: boolean;
}

/**
 * CommentOverlay renders comment pin markers as an overlay on top of the ecad-viewer.
 * Pins are positioned using world-to-screen coordinate transforms and stay
 * attached to their board locations during pan/zoom.
 */
export function CommentOverlay({
    comments,
    viewerRef,
    onPinClick,
    showResolved = true,
}: CommentOverlayProps) {
    const [pinPositions, setPinPositions] = useState<Map<string, PinPosition>>(new Map());

    // Debug mount
    useEffect(() => {
        // console.log("CommentOverlay: Mounted with", comments.length, "comments");
    }, [comments]);

    /**
     * Update pin positions based on current viewer transform
     */
    const updatePositions = useCallback(() => {
        if (!viewerRef.current) return;

        const viewer = viewerRef.current as any;
        // Check if the viewer has the helper method we added
        if (!viewer.getScreenLocation) return;

        const rect = viewer.getBoundingClientRect();
        const newPositions = new Map<string, PinPosition>();

        for (const comment of comments) {
            const screenPos = viewer.getScreenLocation(
                comment.location.x,
                comment.location.y
            );

            if (!screenPos) continue;

            // Check if position is within visible viewport
            const visible =
                screenPos.x >= 0 &&
                screenPos.x <= rect.width &&
                screenPos.y >= 0 &&
                screenPos.y <= rect.height;

            newPositions.set(comment.id, { x: screenPos.x, y: screenPos.y, visible });
        }

        setPinPositions(newPositions);
    }, [comments, viewerRef]);

    // Update positions on any viewer interaction
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer) return;

        // Listen for pan/zoom events
        const handleViewChange = () => {
            requestAnimationFrame(updatePositions);
        };

        // Listen to various events that might change the view
        viewer.addEventListener("kicanvas:mousemove", handleViewChange);
        viewer.addEventListener("panzoom", handleViewChange);
        viewer.addEventListener("mouseup", handleViewChange);
        viewer.addEventListener("wheel", handleViewChange);
        window.addEventListener("resize", handleViewChange);

        // Initial position update
        updatePositions();

        // Poll for updates (fallback for events we might miss)
        const interval = setInterval(updatePositions, 50);

        return () => {
            viewer.removeEventListener("kicanvas:mousemove", handleViewChange);
            viewer.removeEventListener("panzoom", handleViewChange);
            viewer.removeEventListener("mouseup", handleViewChange);
            viewer.removeEventListener("wheel", handleViewChange);
            window.removeEventListener("resize", handleViewChange);
            clearInterval(interval);
        };
    }, [viewerRef, updatePositions]);

    // Filter comments based on showResolved
    const visibleComments = showResolved
        ? comments
        : comments.filter((c) => c.status === "OPEN");

    return (
        <TooltipProvider>
            <div
                className="absolute inset-0 pointer-events-none overflow-hidden"
                style={{ zIndex: 100 }}
            >
                {visibleComments.map((comment) => {
                    const position = pinPositions.get(comment.id);
                    if (!position || !position.visible) return null;

                    const isResolved = comment.status === "RESOLVED";

                    return (
                        <div
                            key={comment.id}
                            className="absolute pointer-events-auto cursor-pointer transform -translate-x-1/2 -translate-y-1/2"
                            style={{
                                left: position.x,
                                top: position.y,
                            }}
                            onClick={() => onPinClick?.(comment)}
                        >
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div
                                        className={`
                                            group relative flex items-center justify-center
                                            w-8 h-8 rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.2)] border-2 border-white
                                            transition-all duration-200 hover:scale-110 hover:-translate-y-1
                                            ${isResolved
                                                ? "bg-emerald-500 text-white"
                                                : "bg-primary text-primary-foreground"}
                                        `}
                                    >
                                        {/* Icon */}
                                        {isResolved ? (
                                            <Check className="w-4 h-4" strokeWidth={3} />
                                        ) : (
                                            <span className="font-bold text-xs">
                                                {comment.replies.length > 0 ? (
                                                    <div className="flex items-center justify-center">
                                                        <span className="text-[10px]">{comment.replies.length + 1}</span>
                                                    </div>
                                                ) : (
                                                    <MessageSquare className="w-3.5 h-3.5 fill-current" />
                                                )}
                                            </span>
                                        )}

                                        {/* Pulse effect for open comments */}
                                        {!isResolved && (
                                            <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-20 animate-ping duration-1000"></span>
                                        )}

                                        {/* Avatar/Initial (Optional - maybe for future) */}
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[200px] p-3">
                                    <div className="flex flex-col gap-1">
                                        <div className="flex justify-between items-center text-xs text-muted-foreground">
                                            <span className="font-semibold text-foreground">{comment.author}</span>
                                            <span>{new Date(comment.timestamp).toLocaleDateString()}</span>
                                        </div>
                                        <p className="text-sm line-clamp-2">{comment.content}</p>
                                        {comment.replies.length > 0 && (
                                            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                                <MessageSquare className="w-3 h-3" />
                                                {comment.replies.length} replies
                                            </div>
                                        )}
                                    </div>
                                </TooltipContent>
                            </Tooltip>
                        </div>
                    );
                })}
            </div>
        </TooltipProvider>
    );
}
