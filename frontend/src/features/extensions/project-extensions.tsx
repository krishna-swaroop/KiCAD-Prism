import { useSearchParams } from "react-router-dom";
import { ExternalLink, Puzzle, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { extensionUrl, useExtensions, type ExtensionContext } from "./extensions-client";

export function ProjectExtensions({ projectId, commit, branch, active }: {
    projectId: string;
    commit: string | null;
    branch: string | null;
    active: boolean;
}) {
    const registry = useExtensions(projectId);
    const [params, setParams] = useSearchParams();
    const context: ExtensionContext = { origin: window.location.origin, projectId, commit, branch };
    // Selection belongs to the URL; a removed or replaced action cannot keep running.
    const selected = !registry.error && !registry.loading
        ? registry.data?.extensions.find((extension) => extension.id === params.get("extension")) : undefined;
    const action = selected?.actions.find((item) => item.id === params.get("extension_action") && item.kind === "panel");
    const panelUrl = action ? extensionUrl(action, context) : null;
    const select = (extensionId?: string, actionId?: string) => {
        setParams((current) => {
            const next = new URLSearchParams(current);
            next.delete("extension");
            next.delete("extension_action");
            if (extensionId && actionId) {
                next.set("extension", extensionId);
                next.set("extension_action", actionId);
            }
            return next;
        });
    };
    return (
        <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold tracking-tight">Extensions</h2>
                    <p className="text-sm text-muted-foreground">Launch external tools for this project and revision.</p>
                </div>
                <Button variant="outline" disabled={registry.fetching} onClick={() => void registry.refresh()}><RefreshCw /> Refresh</Button>
            </div>
            {registry.loading && <p role="status" className="text-sm text-muted-foreground">Loading extensions…</p>}
            {registry.error && <p role="alert" className="text-sm text-destructive">{registry.error.message}</p>}
            {!registry.loading && !registry.error && (
                <>
                    <p className="text-xs text-muted-foreground">Opening a tool shares this Prism address, project ID, branch and commit. Tools manage their own sign-in. Session credentials are never passed.</p>
                    <ul className="grid shrink-0 gap-3 overflow-auto sm:grid-cols-2">
                        {registry.data?.extensions.map((extension) => (
                            <li key={extension.id} className="space-y-3 border border-border bg-card p-4">
                                <div className="flex items-center gap-2"><Puzzle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><h3 className="min-w-0 break-words text-sm font-medium">{extension.name}</h3><span className="text-xs text-muted-foreground">{extension.version}</span></div>
                                <p className="break-words text-sm text-muted-foreground">{extension.description}</p>
                                <div className="flex flex-wrap gap-2">
                                    {extension.actions.map((item) => {
                                        const href = extensionUrl(item, context);
                                        return href ? item.kind === "link" ? (
                                            <Button key={item.id} asChild variant="outline"><a href={href} target="_blank" rel="noopener noreferrer">{item.label}<ExternalLink /></a></Button>
                                        ) : (
                                            <Button key={item.id} variant="outline" aria-pressed={selected?.id === extension.id && action?.id === item.id} onClick={() => select(extension.id, item.id)}>{item.label}</Button>
                                        ) : <p key={item.id} className="text-xs text-destructive">{item.label}: a separate tool hostname is required.</p>;
                                    })}
                                </div>
                            </li>
                        ))}
                    </ul>
                    {!registry.data?.extensions.length && <p className="border border-dashed border-border p-6 text-sm text-muted-foreground">No extensions installed. Ask your server operator to configure PRISM_EXTENSIONS_FILE.</p>}
                    {params.has("extension") && !panelUrl && <p role="status" className="text-sm text-muted-foreground">This extension panel is unavailable. Choose an installed action.</p>}
                    {active && panelUrl && selected && action && (
                        <div className="flex min-h-80 flex-1 flex-col border border-border">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
                                <h3 className="text-sm font-medium">{selected.name} — {action.label}</h3>
                                <div className="flex gap-2">
                                    <Button asChild variant="ghost" size="sm"><a href={panelUrl} target="_blank" rel="noopener noreferrer">Open in new tab<ExternalLink /></a></Button>
                                    <Button variant="ghost" size="sm" onClick={() => select()}><X />Close panel</Button>
                                </div>
                            </div>
                            <p className="px-3 py-2 text-xs text-muted-foreground">If the tool blocks embedding or needs sign-in, open it in a new tab.</p>
                            <iframe key={panelUrl} title={`${selected.name}: ${action.label}`} src={panelUrl} sandbox="allow-scripts" referrerPolicy="no-referrer" className="min-h-80 w-full flex-1 border-0 bg-background" />
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
