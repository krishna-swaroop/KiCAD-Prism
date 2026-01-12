import { useEffect, useState, useCallback } from "react";
import * as React from "react";
import { AlertCircle, Cpu, Box, FileText, MessageSquarePlus, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Model3DViewer } from "./model-3d-viewer";
import { CommentOverlay } from "./comment-overlay";
import { CommentForm } from "./comment-form";
import { CommentPanel } from "./comment-panel";
import type { Comment, CommentContext } from "@/types/comments";

// Wrapper to inject content via property instead of attribute to avoid size limits/parsing
const EcadBlobWrapper = ({ filename, content }: { filename: string, content: string }) => {
    const ref = React.useRef<HTMLElement>(null);

    React.useLayoutEffect(() => {
        if (ref.current) {
            // "ecad-blob" uses @attribute which syncs property <-> attribute. 
            // Setting property is safer for large content.
            // We cast to any because TS doesn't know about the custom element properties
            (ref.current as any).content = content;
            // We set filename via attribute in JSX for immediate availability, but ensuring property sync here logic doesn't hurt.
            (ref.current as any).filename = filename;
            // console.log(`EcadBlobWrapper: Set content for ${filename} (len: ${content.length})`);
        }
    }, [filename, content]);

    // Pass filename as attribute to ensure it is available in the DOM immediately when ecad-viewer scans children.
    // This fixes a race condition where ecad-viewer might load before useLayoutEffect assigns the property.
    return <ecad-blob ref={ref} filename={filename} />;
};

interface VisualizerProps {
    projectId: string;
}

type VisualizerTab = "ecad" | "3d" | "ibom";

export function Visualizer({ projectId }: VisualizerProps) {
    const [activeTab, setActiveTab] = useState<VisualizerTab>("ecad");
    // We store the CONTENT of the files, not just URLs, to bypass loader issues
    const [schematicContent, setSchematicContent] = useState<string | null>(null);
    const [subsheets, setSubsheets] = useState<{ filename: string, content: string }[]>([]);
    const [pcbContent, setPcbContent] = useState<string | null>(null);
    const [modelUrl, setModelUrl] = useState<string | null>(null);
    const [ibomUrl, setIbomUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Record<string, string>>({});

    // Comment state
    const [comments, setComments] = useState<Comment[]>([]);
    const [activeContext, setActiveContext] = useState<CommentContext>("PCB");
    const [activePage, setActivePage] = useState<string>("root.kicad_sch");
    const [commentMode, setCommentMode] = useState(false);
    const [showCommentForm, setShowCommentForm] = useState(false);
    const [showCommentPanel, setShowCommentPanel] = useState(false);
    const [pendingLocation, setPendingLocation] = useState<{ x: number, y: number, layer: string } | null>(null);
    const [pendingContext, setPendingContext] = useState<CommentContext>("PCB");
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);
    const viewerRef = React.useRef<HTMLElement>(null);

    // Fetch comments for the project
    const fetchComments = useCallback(async () => {
        try {
            const response = await fetch(`/api/projects/${projectId}/comments`);
            if (response.ok) {
                const data = await response.json();
                setComments(data.comments || []);
            }
        } catch (err) {
            console.warn("Failed to load comments", err);
        }
    }, [projectId]);

    useEffect(() => {
        const fetchFileContent = async () => {
            setLoading(true);
            const baseUrl = `/api/projects/${projectId}`;

            // Fetch schematic content
            try {
                const response = await fetch(`${baseUrl}/schematic`);
                if (response.ok) {
                    const text = await response.text();
                    console.log("Visualizer: Loaded schematic content", text.slice(0, 50));
                    setSchematicContent(text);
                    setActiveContext("SCH"); // Default to SCH if present? Or wait for tab event?
                    // Actually ecad-viewer defaults to whatever it verifies first.
                    // But we track it via events.

                    // Fetch subsheets
                    try {
                        const subsheetsRes = await fetch(`${baseUrl}/schematic/subsheets`);
                        if (subsheetsRes.ok) {
                            const data = await subsheetsRes.json();
                            if (data.files && data.files.length > 0) {
                                const subsheetPromises = data.files.map(async (f: any) => {
                                    const res = await fetch(f.url);
                                    const content = await res.text();

                                    let filename = f.name || f.path || f.url.split('/').pop() || "subsheet.kicad_sch";
                                    if (!filename.endsWith('.kicad_sch')) filename += '.kicad_sch';
                                    if (!filename.includes('/') && f.url.includes('Subsheets')) {
                                        filename = `Subsheets/${filename}`;
                                    }
                                    return { filename, content };
                                });
                                const loadedSubsheets = await Promise.all(subsheetPromises);
                                setSubsheets(loadedSubsheets);
                            }
                        }
                    } catch (err) {
                        console.warn("Failed to load subsheets", err);
                    }
                } else {
                    setError(prev => ({ ...prev, schematic: "Schematic file not found" }));
                }
            } catch (err) {
                setError(prev => ({ ...prev, schematic: "Failed to load schematic" }));
            }

            // Fetch PCB content
            try {
                const response = await fetch(`${baseUrl}/pcb`);
                if (response.ok) {
                    const text = await response.text();
                    console.log("Visualizer: Loaded PCB content", text.slice(0, 50));
                    setPcbContent(text);
                    // If PCB loads, usually it becomes the default view if available?
                    // We'll rely on events.
                }
            } catch (err) {
                setError(prev => ({ ...prev, pcb: "PCB file not found" }));
            }

            // Fetch 3D model
            try {
                const response = await fetch(`${baseUrl}/3d-model`);
                if (response.ok) {
                    setModelUrl(`${baseUrl}/3d-model`);
                }
            } catch (err) {
                setError(prev => ({ ...prev, model: "3D model not found" }));
            }

            // Fetch iBoM
            try {
                const response = await fetch(`${baseUrl}/ibom`);
                if (response.ok) {
                    setIbomUrl(`${baseUrl}/ibom`);
                }
            } catch (err) {
                setError(prev => ({ ...prev, ibom: "iBoM file not found" }));
            }

            setLoading(false);
            fetchComments();
        };

        fetchFileContent();
    }, [projectId, fetchComments]);

    // Update activeContext when content loading finishes or changes
    useEffect(() => {
        if (!loading) {
            if (pcbContent) {
                setActiveContext("PCB");
            } else if (schematicContent) {
                setActiveContext("SCH");
            }
        }
    }, [loading, pcbContent, schematicContent]);

    // Handle events from ecad-viewer (navigation, clicks)
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer) return;

        const handleCommentClick = (e: CustomEvent) => {
            const detail = e.detail;
            setPendingLocation({
                x: detail.worldX,
                y: detail.worldY,
                layer: detail.layer || "F.Cu",
            });
            setPendingContext(detail.context); // "PCB" | "SCH"
            setShowCommentForm(true);
        };

        const handleTabActivate = (e: CustomEvent) => {
            // detail.current is "pcb" or "sch" (TabKind enum values)
            const kind = e.detail.current;
            if (kind === "pcb") setActiveContext("PCB");
            if (kind === "sch") setActiveContext("SCH");
            console.log("Visualizer: Tab activated:", kind);
        };

        const handleSheetLoad = (e: CustomEvent) => {
            // detail is the filename/path
            if (typeof e.detail === 'string') {
                setActivePage(e.detail);
                console.log("Visualizer: Sheet loaded:", e.detail);
            }
        };

        viewer.addEventListener("ecad-viewer:comment:click", handleCommentClick as EventListener);
        viewer.addEventListener("kicanvas:tab:activate", handleTabActivate as EventListener);
        viewer.addEventListener("kicanvas:sheet:loaded", handleSheetLoad as EventListener);

        return () => {
            viewer.removeEventListener("ecad-viewer:comment:click", handleCommentClick as EventListener);
            viewer.removeEventListener("kicanvas:tab:activate", handleTabActivate as EventListener);
            viewer.removeEventListener("kicanvas:sheet:loaded", handleSheetLoad as EventListener);
        };
    }, [loading, schematicContent, pcbContent]);

    // Toggle comment mode on the viewer
    const toggleCommentMode = () => {
        const newMode = !commentMode;
        setCommentMode(newMode);

        const viewer = viewerRef.current as any;
        if (viewer?.setCommentMode) {
            viewer.setCommentMode(newMode);
        } else if (viewer) {
            if (newMode) viewer.setAttribute("comment-mode", "true");
            else viewer.removeAttribute("comment-mode");
        }
    };

    // Submit new comment
    const handleSubmitComment = async (content: string) => {
        if (!pendingLocation) return;

        setIsSubmittingComment(true);
        try {
            // If context is SCH, include the active page
            const location = { ...pendingLocation, page: pendingContext === "SCH" ? activePage : "" };

            const response = await fetch(`/api/projects/${projectId}/comments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    context: pendingContext,
                    location: location,
                    content: content,
                }),
            });

            if (response.ok) {
                const newComment = await response.json();
                setComments(prev => [...prev, newComment]);
                setShowCommentForm(false);
                setPendingLocation(null);
            } else {
                console.error("Failed to create comment:", await response.text());
            }
        } catch (err) {
            console.error("Error creating comment:", err);
        } finally {
            setIsSubmittingComment(false);
        }
    };

    // Handle pin click
    const handlePinClick = (_comment: Comment) => {
        setShowCommentPanel(true);
    };

    const handleCommentNavigate = (comment: Comment) => {
        const viewer = viewerRef.current as any;
        if (!viewer) return;

        // 1. Ensure we are in ECAD tab
        if (activeTab !== "ecad") setActiveTab("ecad");

        // 2. Switch context if needed (handled by viewer usually if we request zoom, but better to be explicit)
        // ecad-viewer doesn't expose strict "switch to tab" API easily, but if we are in "ecad" mode,
        // checks if comment context matches active context.
        // If mismatched, we might need a way to tell viewers to switch.
        // However, since we added `switchPage` for SCH, we can use that.
        // For PCB vs SCH toggle, usually `ecad-viewer` has UI tabs.
        // We can check if `viewer.switchTab` exists? No.

        // Let's rely on standard behavior or implicit switching if possible.
        // If not, we might need to add `switchTab` to ecad-viewer.
        // But context switching (PCB<->SCH) is major.

        if (comment.context === "SCH") {
            // Switch to SCH if on PCB??
            // We don't have a direct API for that yet. 
            // Assuming user can manually switch if needed, or we implement that in ecad-viewer too?

            if (comment.location.page) {
                viewer.switchPage(comment.location.page);
            }
        }

        if (viewer.zoomToLocation) {
            viewer.zoomToLocation(comment.location.x, comment.location.y);
        }
    };

    // Handle resolve/reopen comment
    const handleResolveComment = async (commentId: string, resolved: boolean) => {
        try {
            const response = await fetch(`/api/projects/${projectId}/comments/${commentId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: resolved ? "RESOLVED" : "OPEN" }),
            });

            if (response.ok) {
                const updatedComment = await response.json();
                setComments(prev => prev.map(c => c.id === commentId ? updatedComment : c));
            }
        } catch (err) {
            console.error("Error updating comment status:", err);
        }
    };

    // Handle reply to comment
    const handleReplyComment = async (commentId: string, content: string) => {
        try {
            const response = await fetch(`/api/projects/${projectId}/comments/${commentId}/replies`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content }),
            });

            if (response.ok) {
                const data = await response.json();
                setComments(prev => prev.map(c => c.id === commentId ? data.comment : c));
            }
        } catch (err) {
            console.error("Error replying to comment:", err);
        }
    };

    // Filter comments for overlay
    const overlayComments = comments.filter(c => {
        // Must match active context (PCB or SCH)
        if (c.context !== activeContext) return false;

        // If SCH, must match active page
        if (activeContext === "SCH") {
            // New comments have valid page.
            if (c.location.page) return c.location.page === activePage;

            // Legacy/fallback: if activePage is root, show comments with no page?
            // User cleared comments so strictly speaking only new comments exist.
            // But if page is missing, maybe default to root?
            return activePage === "root.kicad_sch";
        }

        return true;
    });

    const tabs: { id: VisualizerTab; label: string; icon: any }[] = [
        { id: "ecad", label: "Schematic & PCB", icon: Cpu },
        { id: "3d", label: "3D View", icon: Box },
        { id: "ibom", label: "iBoM", icon: FileText },
    ];

    if (loading) {
        return <div className="flex items-center justify-center h-96">Loading visualizer...</div>;
    }

    return (
        <div className="flex flex-col h-full">
            {/* Tab Bar */}
            <div className="flex gap-2 border-b mb-4">
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <Button
                            key={tab.id}
                            variant={activeTab === tab.id ? "default" : "ghost"}
                            className="rounded-b-none"
                            onClick={() => setActiveTab(tab.id)}
                        >
                            <Icon className="h-4 w-4 mr-2" />
                            {tab.label}
                        </Button>
                    );
                })}

                {/* Spacer */}
                <div className="flex-1" />

                {/* Comment Mode Toggle - only show on ECAD tab */}
                {activeTab === "ecad" && (
                    <div className="flex gap-2">
                        <Button
                            variant={commentMode ? "secondary" : "ghost"}
                            size="sm"
                            onClick={toggleCommentMode}
                            title="Add Comment"
                        >
                            <MessageSquarePlus className="w-4 h-4 mr-2" />
                            Add Comment
                        </Button>
                        <Button
                            variant={showCommentPanel ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => setShowCommentPanel(!showCommentPanel)}
                            title="View Comments"
                        >
                            <MessageSquare className="w-4 h-4 mr-2" />
                            Comments
                        </Button>
                    </div>
                )}
            </div>

            {/* Viewer Area */}
            <div className="flex-1 min-h-0 bg-background relative">
                {/* ECAD Tab */}
                <div className={activeTab === "ecad" ? "h-full relative" : "hidden"}>
                    {(schematicContent || pcbContent) ? (
                        <>
                            <ecad-viewer
                                ref={viewerRef}
                                key={`${projectId}-ecad`}
                                style={{
                                    width: '100%',
                                    height: '100%'
                                }}
                            >
                                {/* Inject Root Schematic */}
                                {schematicContent && (
                                    <EcadBlobWrapper filename="root.kicad_sch" content={schematicContent} />
                                )}

                                {/* Inject Subsheets */}
                                {subsheets.map((sheet) => (
                                    <EcadBlobWrapper key={sheet.filename} filename={sheet.filename} content={sheet.content} />
                                ))}

                                {/* Inject PCB */}
                                {pcbContent && (
                                    <EcadBlobWrapper filename="board.kicad_pcb" content={pcbContent} />
                                )}
                            </ecad-viewer>

                            {/* Comment Overlay */}
                            <CommentOverlay
                                comments={overlayComments}
                                viewerRef={viewerRef}
                                onPinClick={handlePinClick}
                                showResolved={true}
                            />
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-96 text-muted-foreground">
                            <AlertCircle className="h-12 w-12 mb-4" />
                            <p>No ECAD files found</p>
                            <div className="text-sm mt-2 text-center">
                                {error.schematic && <p>Schematic: {error.schematic}</p>}
                                {error.pcb && <p>PCB: {error.pcb}</p>}
                                {!error.schematic && !error.pcb && <p>Ensure .kicad_sch or .kicad_pcb files exist</p>}
                            </div>
                        </div>
                    )}
                </div>

                {/* 3D Tab */}
                <div className={activeTab === "3d" ? "h-full" : "hidden"}>
                    {modelUrl ? (
                        <Model3DViewer modelUrl={modelUrl} />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-96 text-muted-foreground">
                            <AlertCircle className="h-12 w-12 mb-4" />
                            <p>3D model not available</p>
                            <p className="text-sm mt-2">Generate a .glb file in Design-Outputs/3DModel/</p>
                        </div>
                    )}
                </div>

                {/* iBoM Tab */}
                <div className={activeTab === "ibom" ? "h-full" : "hidden"}>
                    {ibomUrl ? (
                        <div className="flex flex-col h-full bg-white rounded-lg overflow-hidden border shadow-sm">
                            <iframe
                                src={ibomUrl}
                                className="w-full h-full border-0"
                                title="Interactive BoM"
                            />
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-96 text-muted-foreground bg-slate-50 border border-dashed rounded-lg">
                            <AlertCircle className="h-12 w-12 mb-4 opacity-50" />
                            <p className="font-medium">Interactive BoM not found</p>
                            <p className="text-sm mt-1">Generate an iBoM HTML file using KiCAD InteractiveHtmlBom plugin</p>
                            <p className="text-xs mt-4 text-slate-400">Place it in Design-Outputs/ directory</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Comment Panel */}
            {showCommentPanel && (
                <div className="absolute top-[48px] bottom-0 right-0 z-40 bg-background border-l shadow-xl animate-in slide-in-from-right">
                    <CommentPanel
                        comments={comments}
                        onClose={() => setShowCommentPanel(false)}
                        onResolve={handleResolveComment}
                        onReply={handleReplyComment}
                        onCommentClick={handleCommentNavigate}
                    />
                </div>
            )}

            {/* Comment Form Modal */}
            <CommentForm
                isOpen={showCommentForm}
                onClose={() => {
                    setShowCommentForm(false);
                    setPendingLocation(null);
                }}
                onSubmit={handleSubmitComment}
                location={pendingLocation}
                context={pendingContext}
                isSubmitting={isSubmittingComment}
            />
        </div>
    );
}
