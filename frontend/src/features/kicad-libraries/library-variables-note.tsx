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

/**
 * Why parts of the board are missing: the models whose path variable this server does not define, and the
 * model files absent from a library that is defined. Says nothing when every model resolved.
 */
export function LibraryVariablesNote({ unresolved, missing, canConfigure, search }: LibraryVariablesNoteProps) {
    if (unresolved.length === 0 && missing.length === 0) return null;

    return (
        <div className="pointer-events-auto absolute bottom-3 left-3 max-w-md border bg-background/95 p-3 text-xs shadow-sm backdrop-blur-sm" role="status">
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
        </div>
    );
}
