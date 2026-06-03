import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { Download, File, FileText, Folder, ChevronRight, ChevronDown, Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileItem, TreeNode, formatBytes, buildFileTree } from "@/lib/file-utils";
import { PdfViewer } from "@/components/pdf-viewer";

const MarkdownContent = lazy(() =>
    import("@/components/markdown-content").then((module) => ({ default: module.MarkdownContent }))
);

interface DocumentationBrowserProps {
    projectId: string;
    commit?: string | null;
}

function TreeNodeComponent({
    node,
    projectId,
    onView,
    onPreviewPdf,
    onDownload,
    level = 0
}: {
    node: TreeNode;
    projectId: string;
    onView: (path: string, name: string) => void;
    onPreviewPdf: (path: string, name: string) => void;
    onDownload: (path: string) => void;
    level?: number;
}) {
    const [expanded, setExpanded] = useState(false);
    const hasChildren = node.children.length > 0;
    const isMarkdown = node.type === 'md';
    const isPdf = node.type === 'pdf';

    return (
        <div>
            <div
                className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors"
                style={{ paddingLeft: `${level * 1.5 + 0.5}rem` }}
            >
                {node.isDir && hasChildren && (
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="p-0 hover:bg-transparent"
                    >
                        {expanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                    </button>
                )}
                {node.isDir && !hasChildren && <div className="w-4" />}

                {node.isDir ? (
                    <Folder className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                ) : isMarkdown ? (
                    <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
                ) : isPdf ? (
                    <FileText className="h-4 w-4 text-red-400 flex-shrink-0" />
                ) : (
                    <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}

                <div className="flex-1 min-w-0 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{node.name}</p>
                        {!node.isDir && (
                            <p className="text-xs text-muted-foreground">
                                {formatBytes(node.size)}
                            </p>
                        )}
                    </div>

                    {!node.isDir && (
                        <div className="flex gap-1 flex-shrink-0">
                            {isMarkdown && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => onView(node.path, node.name)}
                                    title="View"
                                >
                                    <Eye className="h-4 w-4" />
                                </Button>
                            )}
                            {isPdf && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => onPreviewPdf(node.path, node.name)}
                                    title="View PDF"
                                >
                                    <Eye className="h-4 w-4" />
                                </Button>
                            )}
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => onDownload(node.path)}
                                title="Download"
                            >
                                <Download className="h-4 w-4" />
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {node.isDir && expanded && hasChildren && (
                <div>
                    {node.children.map((child) => (
                        <TreeNodeComponent
                            key={child.path}
                            node={child}
                            projectId={projectId}
                            onView={onView}
                            onPreviewPdf={onPreviewPdf}
                            onDownload={onDownload}
                            level={level + 1}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export function DocumentationBrowser({ projectId, commit }: DocumentationBrowserProps) {
    const [files, setFiles] = useState<FileItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewingDoc, setViewingDoc] = useState<{ path: string; name: string; content: string } | null>(null);
    const [pdfViewer, setPdfViewer] = useState<{ url: string; downloadUrl: string; filename: string } | null>(null);

    const appendCommit = useCallback((url: string) => {
        if (!commit) return url;
        return `${url}${url.includes("?") ? "&" : "?"}commit=${encodeURIComponent(commit)}`;
    }, [commit]);

    useEffect(() => {
        const fetchFiles = async () => {
            setLoading(true);
            setViewingDoc(null);
            try {
                const response = await fetch(appendCommit(`/api/projects/${projectId}/docs`));
                if (response.ok) {
                    const data = await response.json();
                    setFiles(data);
                }
            } catch (err) {
                console.error("Failed to fetch docs", err);
            } finally {
                setLoading(false);
            }
        };

        fetchFiles();
    }, [projectId, appendCommit]);

    const handleView = async (path: string, name: string) => {
        try {
            const url = appendCommit(`/api/projects/${projectId}/docs/content?path=${encodeURIComponent(path)}`);
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                setViewingDoc({ path, name, content: data.content });
            }
        } catch (err) {
            console.error("Failed to fetch doc content", err);
        }
    };

    const handlePreviewPdf = (path: string, name: string) => {
        const inlineUrl = `/api/projects/${projectId}/asset/docs/${path}`;
        setPdfViewer({ url: inlineUrl, downloadUrl: inlineUrl, filename: name });
    };

    const handleDownload = (path: string) => {
        const url = appendCommit(`/api/projects/${projectId}/asset/docs/${path}`);
        window.open(url, '_blank');
    };

    const tree = useMemo(() => buildFileTree(files), [files]);

    if (loading) {
        return <Skeleton className="h-64 w-full" />;
    }

    if (viewingDoc) {
        return (
            <div className="space-y-4">
                <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b pb-4 -mx-6 px-6 -mt-6 pt-6 flex items-center justify-between">
                    <h3 className="text-lg font-semibold">{viewingDoc.name}</h3>
                    <Button variant="outline" size="sm" onClick={() => setViewingDoc(null)}>
                        <X className="h-4 w-4 mr-2" />
                        Close
                    </Button>
                </div>
                <Suspense fallback={<div className="text-sm text-muted-foreground">Loading document...</div>}>
                    <MarkdownContent
                        content={viewingDoc.content}
                        resolveImageSrc={(src) =>
                            src?.startsWith('http') ? src : appendCommit(`/api/projects/${projectId}/asset/docs/${src}`)
                        }
                    />
                </Suspense>
            </div>
        );
    }

    if (files.length === 0) {
        return <p className="text-sm text-muted-foreground text-center py-8">No documentation found</p>;
    }

    return (
        <>
            {pdfViewer && (
                <PdfViewer
                    url={pdfViewer.url}
                    downloadUrl={pdfViewer.downloadUrl}
                    filename={pdfViewer.filename}
                    onClose={() => setPdfViewer(null)}
                />
            )}
            <div className="border rounded-lg p-4 max-h-[600px] overflow-y-auto">
                <div className="space-y-1">
                    {tree.map((node) => (
                        <TreeNodeComponent
                            key={node.path}
                            node={node}
                            projectId={projectId}
                            onView={handleView}
                            onPreviewPdf={handlePreviewPdf}
                            onDownload={handleDownload}
                        />
                    ))}
                </div>
            </div>
        </>
    );
}
