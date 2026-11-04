import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { listVersions } from "@/lib/kicad-libraries-client";
import { useServerState } from "@/lib/server-state";
import type { KicadLibrary } from "@/types/kicad-libraries";

import { shortCommit } from "./library-status";

interface LibraryVersionsProps {
    /** The library whose versions are listed; the dialog is closed while this is absent. */
    library: KicadLibrary | null;
    busy: boolean;
    onUse: (library: KicadLibrary, commit: string) => void;
    onClose: () => void;
}

/** The versions a library has served, newest first. Using one pins the library there: the way out of a bad upstream commit. */
export function LibraryVersions({ library, busy, onUse, onClose }: LibraryVersionsProps) {
    const versions = useServerState(
        library ? ["kicad-libraries", "versions", library.name, library.servedCommit] : null,
        (signal) => listVersions(library as KicadLibrary, signal),
    );

    return (
        <Dialog open={library !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{library?.name} versions</DialogTitle>
                    <DialogDescription>
                        Using an earlier version pins the library at it. Boards that use the library refresh their 3D parts.
                    </DialogDescription>
                </DialogHeader>
                {versions.loading && <Skeleton className="h-16 w-full" />}
                {versions.error && versions.data === undefined && (
                    <p className="text-sm text-destructive" role="alert">{versions.error.message}</p>
                )}
                {versions.data && versions.data.length === 0 && (
                    <p className="text-sm text-muted-foreground">This library has not served a version yet.</p>
                )}
                {versions.data && versions.data.length > 0 && (
                    <ul className="flex flex-col gap-2">
                        {versions.data.map((version) => (
                            <li key={version.commit} className="flex items-center justify-between gap-3 rounded border p-2">
                                <div className="min-w-0">
                                    <code className="text-sm">{shortCommit(version.commit)}</code>
                                    <p className="text-xs text-muted-foreground">
                                        {version.ref} · {new Date(version.fetchedAt).toLocaleString()}
                                    </p>
                                </div>
                                {version.serving ? (
                                    <Badge variant="success">Serving</Badge>
                                ) : (
                                    <Button size="sm" variant="outline" disabled={busy || !library} onClick={() => library && onUse(library, version.commit)}>
                                        Use this version
                                    </Button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </DialogContent>
        </Dialog>
    );
}
