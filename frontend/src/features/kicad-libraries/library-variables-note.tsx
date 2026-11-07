import { useState } from "react";
import { X } from "lucide-react";

export interface VariableCount {
    variable: string;
    models: number;
}

interface LibraryVariablesNoteProps {
    /** KiCad path variables the board's models use that this server does not define. */
    unresolved: readonly VariableCount[];
    /** Models a defined variable points to that are not in its library. */
    missing: readonly VariableCount[];
    /** Whether the viewer may open Settings > KiCad libraries (administrators). */
    canConfigure: boolean;
    /** The page's own address, to add the settings link to; read once by the caller. */
    search: string;
    /** Pixels from the viewport's left edge, so the note clears a side panel open over the viewer. */
    leftInset?: number;
}

function plural(count: number, noun: string): string {
    return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** The deep link to the libraries page of Settings, with the variable to add. */
export function librariesLink(search: string, variable: string): string {
    const next = new URLSearchParams(search);
    next.set("settings", "kicad-libraries");
    next.set("variable", variable);
    return `?${next.toString()}`;
}

/** What the note says, as one string: a closed note opens again only when this changes. */
function contentKey(unresolved: readonly VariableCount[], missing: readonly VariableCount[]): string {
    const part = (items: readonly VariableCount[]) => items.map((item) => `${item.variable}=${item.models}`).join(",");
    return `${part(unresolved)}|${part(missing)}`;
}

/**
 * Why parts of the board are missing: the models whose path variable this server does not define, and the
 * model files absent from a library that is defined. Says nothing when every model resolved. Closing it hides
 * it until what it reports changes.
 */
export function LibraryVariablesNote({ unresolved, missing, canConfigure, search, leftInset = 0 }: LibraryVariablesNoteProps) {
    const [closed, setClosed] = useState<string | null>(null);
    const key = contentKey(unresolved, missing);
    if ((unresolved.length === 0 && missing.length === 0) || closed === key) return null;

    return (
        <div
            className="pointer-events-auto absolute bottom-3 flex max-w-md items-start gap-2 border bg-background/95 p-3 text-xs shadow-sm backdrop-blur-sm"
            style={{ left: leftInset + 12 }}
            role="status"
        >
            <ul className="flex flex-col gap-1">
                {unresolved.map((item) => (
                    <li key={`unresolved:${item.variable}`}>
                        {plural(item.models, "model")} use <code className="font-mono">{item.variable}</code>, which this server does not define.{" "}
                        {canConfigure ? (
                            <a className="underline" href={librariesLink(search, item.variable)}>Add a library</a>
                        ) : (
                            <span className="text-muted-foreground">Ask an administrator to add it.</span>
                        )}
                    </li>
                ))}
                {missing.map((item) => (
                    <li key={`missing:${item.variable}`}>
                        {plural(item.models, "model file")} under <code className="font-mono">{item.variable}</code> {item.models === 1 ? "is" : "are"} not in its library.
                    </li>
                ))}
            </ul>
            <button
                type="button"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="Close"
                title="Close"
                onClick={() => setClosed(key)}
            >
                <X className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}
