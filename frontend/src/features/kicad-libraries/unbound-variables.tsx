import { Button } from "@/components/ui/button";
import type { VariableUsage } from "@/types/kicad-libraries";

interface UnboundVariablesProps {
    usage: VariableUsage[];
    onAdd: (variable: string) => void;
}

/** Variables boards name that nothing on the server defines: the models behind them are missing. */
export function UnboundVariables({ usage, onAdd }: UnboundVariablesProps) {
    const unbound = usage.filter((row) => !row.bound);
    if (unbound.length === 0) return null;

    return (
        <div className="rounded-lg border border-amber-500/40 p-4 flex flex-col gap-2">
            <h4 className="font-medium">Undefined Variables</h4>
            <ul className="flex flex-col gap-2">
                {unbound.map((row) => (
                    <li key={row.variable} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{`\${${row.variable}}`}</code>
                            <p className="text-xs text-muted-foreground">
                                {row.models} model{row.models === 1 ? "" : "s"}
                                {row.sheets > 0 ? ` and ${row.sheets} drawing sheet${row.sheets === 1 ? "" : "s"}` : ""} in {row.projects} project{row.projects === 1 ? "" : "s"}
                            </p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => onAdd(row.variable)}>Add library</Button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
