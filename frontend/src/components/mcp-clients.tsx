import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, useConfirmTarget } from "@/components/ui/confirm-dialog";
import { fetchApi, readApiError } from "@/lib/api";
import { formatDate } from "@/lib/format-date";

/** One MCP client the signed-in person has connected (ADR scripting-and-mcp §3.6). */
export interface McpClientGrant {
    id: string;
    client_name: string;
    host: string;
    scopes: string[];
    created_at: string;
    last_used_at: string | null;
}

/**
 * Connected MCP clients: grants a client such as Claude Desktop or Cursor holds
 * to act on Prism as this person. Revoking one ends every token minted under it.
 */
export function ConnectedMcpClients() {
    const [clients, setClients] = useState<McpClientGrant[]>([]);
    const [loading, setLoading] = useState(true);
    const revokeTarget = useConfirmTarget<McpClientGrant>();

    const reload = useCallback(async () => {
        try {
            const response = await fetchApi("/api/auth/mcp-clients");
            if (!response.ok) {
                throw new Error(await readApiError(response, "Failed to load connected MCP clients"));
            }
            setClients((await response.json()) as McpClientGrant[]);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to load connected MCP clients");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    const revoke = async (client: McpClientGrant) => {
        try {
            const response = await fetchApi(
                `/api/auth/mcp-clients/${encodeURIComponent(client.id)}`,
                { method: "DELETE" },
            );
            if (!response.ok) {
                throw new Error(await readApiError(response, "Failed to revoke the MCP client"));
            }
            toast.success("MCP client revoked");
            await reload();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to revoke the MCP client");
        }
    };

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-medium">Connected MCP clients</h3>

            <div className="divide-y rounded-md border">
                {loading ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>
                ) : clients.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">No connected MCP clients.</p>
                ) : (
                    clients.map((client) => (
                        <div key={client.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                            <div className="min-w-0 flex-1">
                                <p className="truncate font-medium" title={client.client_name}>
                                    {client.client_name}
                                </p>
                                <p className="truncate text-muted-foreground" title={client.host}>
                                    {client.host}
                                </p>
                            </div>
                            <span
                                className="min-w-0 max-w-40 truncate font-mono text-muted-foreground"
                                title={client.scopes.join(" ")}
                            >
                                {client.scopes.join(" ")}
                            </span>
                            <span className="whitespace-nowrap text-muted-foreground" title="Connected">
                                {formatDate(client.created_at)}
                            </span>
                            <span
                                className="whitespace-nowrap text-muted-foreground"
                                title={`Last used ${formatDate(client.last_used_at)}`}
                            >
                                {formatDate(client.last_used_at)}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                className="shrink-0"
                                aria-label={`Revoke MCP client ${client.client_name}`}
                                onClick={() => revokeTarget.request(client)}
                            >
                                Revoke
                            </Button>
                        </div>
                    ))
                )}
            </div>

            <ConfirmDialog
                open={revokeTarget.open}
                onOpenChange={(next) => {
                    if (!next) revokeTarget.clear();
                }}
                title="Revoke MCP client"
                description={
                    revokeTarget.target
                        ? `${revokeTarget.target.client_name} stops working on Prism immediately.`
                        : ""
                }
                confirmLabel="Hold to revoke"
                requireHold
                onConfirm={() => {
                    const target = revokeTarget.target;
                    revokeTarget.clear();
                    if (target) void revoke(target);
                }}
            />
        </div>
    );
}
