import { Puzzle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useExtensions } from "./extensions-client";

export function ExtensionsSettings() {
    const registry = useExtensions();
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold tracking-tight">Extensions</h2>
                    <p className="text-sm text-muted-foreground">External tools installed by your server operator.</p>
                </div>
                <Button variant="outline" disabled={registry.fetching} onClick={() => void registry.refresh()}>
                    <RefreshCw /> Refresh
                </Button>
            </div>
            {registry.loading && <p role="status" className="text-sm text-muted-foreground">Loading extensions…</p>}
            {registry.error && <p role="alert" className="text-sm text-destructive">{registry.error.message}</p>}
            {!registry.loading && !registry.error && (
                <>
                    <p className="text-sm text-muted-foreground">Open a project and choose Extensions to launch a tool. Each tool manages its own sign-in and API access.</p>
                    {registry.data?.extensions.length ? (
                        <ul className="divide-y border border-border">
                            {registry.data.extensions.map((extension) => (
                                <li key={extension.id} className="flex items-start gap-3 p-4">
                                    <Puzzle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                                    <div className="min-w-0 space-y-1">
                                        <h3 className="text-sm font-medium break-words">{extension.name} <span className="text-muted-foreground">{extension.version}</span></h3>
                                        <p className="text-sm text-muted-foreground break-words">{extension.description}</p>
                                        <p className="text-xs text-muted-foreground">{extension.actions.length} project actions</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : <p className="border border-dashed border-border p-6 text-sm text-muted-foreground">No extensions installed. Ask your server operator to configure PRISM_EXTENSIONS_FILE.</p>}
                </>
            )}
        </div>
    );
}
