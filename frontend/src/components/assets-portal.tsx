import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, File, FileText, Package, Image as ImageIcon, Folder, ChevronRight, ChevronDown, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileItem, TreeNode, formatBytes, buildFileTree, calculateTotalSize } from "@/lib/file-utils";
import { PdfViewer } from "@/components/pdf-viewer";

interface AssetsPortalProps {
    projectId: string;
    commit?: string | null;
}

function getFileIcon(type: string, isDir: boolean) {
    if (isDir) return Folder;

    switch (type.toLowerCase()) {
        case 'pdf':
            return FileText;
        case 'zip':
        case 'rar':
        case '7z':
            return Package;
        case 'png':
        case 'jpg':
        case 'jpeg':
        case 'webp':
            return ImageIcon;
        default:
            return File;
    }
}

function TreeNodeComponent({
    node,
    type,
    projectId,
    onDownload,
    onPreview,
    level = 0
}: {
    node: TreeNode;
    type: string;
    projectId: string;
    onDownload: (path: string, type: string) => void;
    onPreview: (path: string, type: string) => void;
    level?: number;
}) {
    const [expanded, setExpanded] = useState(false);
    const Icon = getFileIcon(node.type, node.isDir);
    const hasChildren = node.children.length > 0;
    const isPdf = node.type.toLowerCase() === 'pdf';

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

                <Icon className={`h-4 w-4 ${node.isDir ? 'text-yellow-500' : 'text-blue-500'} flex-shrink-0`} />

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
                        <div className="flex items-center gap-1">
                            {isPdf && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => onPreview(node.path, type)}
                                    className="flex-shrink-0"
                                    title="View PDF"
                                >
                                    <Eye className="h-4 w-4" />
                                </Button>
                            )}
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => onDownload(node.path, type)}
                                className="flex-shrink-0"
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
                            type={type}
                            projectId={projectId}
                            onDownload={onDownload}
                            onPreview={onPreview}
                            level={level + 1}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export function AssetsPortal({ projectId, commit }: AssetsPortalProps) {
    const [designFiles, setDesignFiles] = useState<FileItem[]>([]);
    const [mfgFiles, setMfgFiles] = useState<FileItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [pdfViewer, setPdfViewer] = useState<{ url: string; downloadUrl: string; filename: string } | null>(null);

    const appendCommit = useCallback((url: string) => {
        if (!commit) return url;
        return `${url}${url.includes("?") ? "&" : "?"}commit=${encodeURIComponent(commit)}`;
    }, [commit]);

    useEffect(() => {
        const fetchFiles = async () => {
            setLoading(true);
            try {
                const [designRes, mfgRes] = await Promise.all([
                    fetch(appendCommit(`/api/projects/${projectId}/files?type=design`)),
                    fetch(appendCommit(`/api/projects/${projectId}/files?type=manufacturing`))
                ]);

                if (designRes.ok) {
                    const data = await designRes.json();
                    setDesignFiles(data);
                }
                if (mfgRes.ok) {
                    const data = await mfgRes.json();
                    setMfgFiles(data);
                }
            } catch (err) {
                console.error("Failed to fetch files", err);
            } finally {
                setLoading(false);
            }
        };

        fetchFiles();
    }, [projectId, appendCommit]);

    const handleDownload = (path: string, type: string) => {
        const url = appendCommit(`/api/projects/${projectId}/download?path=${encodeURIComponent(path)}&type=${type}`);
        window.open(url, '_blank');
    };

    const handlePreview = (path: string, type: string) => {
        const inlineUrl = appendCommit(`/api/projects/${projectId}/download?path=${encodeURIComponent(path)}&type=${type}&inline=true`);
        const downloadUrl = appendCommit(`/api/projects/${projectId}/download?path=${encodeURIComponent(path)}&type=${type}`);
        const filename = path.split("/").pop() ?? path;
        setPdfViewer({ url: inlineUrl, downloadUrl, filename });
    };

    const designTree = useMemo(() => buildFileTree(designFiles), [designFiles]);
    const mfgTree = useMemo(() => buildFileTree(mfgFiles), [mfgFiles]);
    const designTotalSize = useMemo(() => calculateTotalSize(designFiles), [designFiles]);
    const mfgTotalSize = useMemo(() => calculateTotalSize(mfgFiles), [mfgFiles]);

    if (loading) {
        return (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {[1, 2].map((i) => (
                    <div key={i} className="space-y-4">
                        <Skeleton className="h-8 w-48" />
                        <Skeleton className="h-64 w-full" />
                    </div>
                ))}
            </div>
        );
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Design Outputs */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Design Outputs</h3>
                    <span className="text-xs text-muted-foreground">
                        {formatBytes(designTotalSize)} total
                    </span>
                </div>
                <div className="border rounded-lg p-4 max-h-[600px] overflow-y-auto">
                    {designFiles.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">No files found</p>
                    ) : (
                        <div className="space-y-1">
                            {designTree.map((node) => (
                                <TreeNodeComponent
                                    key={node.path}
                                    node={node}
                                    type="design"
                                    projectId={projectId}
                                    onDownload={handleDownload}
                                    onPreview={handlePreview}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Manufacturing Outputs */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Manufacturing Outputs</h3>
                    <span className="text-xs text-muted-foreground">
                        {formatBytes(mfgTotalSize)} total
                    </span>
                </div>
                <div className="border rounded-lg p-4 max-h-[600px] overflow-y-auto">
                    {mfgFiles.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">No files found</p>
                    ) : (
                        <div className="space-y-1">
                            {mfgTree.map((node) => (
                                <TreeNodeComponent
                                    key={node.path}
                                    node={node}
                                    type="manufacturing"
                                    projectId={projectId}
                                    onDownload={handleDownload}
                                    onPreview={handlePreview}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
        </>
    );
}
