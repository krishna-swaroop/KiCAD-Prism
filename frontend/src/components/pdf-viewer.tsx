export function PdfViewer({
    url,
    downloadUrl,
    filename,
    onClose,
}: {
    url: string;
    downloadUrl: string;
    filename: string;
    onClose: () => void;
}) {
    return (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b">
                <span className="text-sm font-medium truncate">{filename}</span>
                <div className="flex items-center gap-2">
                    <a href={downloadUrl} download={filename} className="text-xs text-muted-foreground hover:text-foreground">
                        Download
                    </a>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">✕</button>
                </div>
            </div>
            <iframe src={url} className="flex-1 w-full border-0" title={filename} />
        </div>
    );
}
