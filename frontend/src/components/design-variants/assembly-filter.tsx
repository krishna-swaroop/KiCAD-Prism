/**
 * Assembly filter for the engineering BOM (decision D1).
 *
 * All components mode shows every indexed part with its effective flags; the
 * Assembly filter keeps only parts whose effective In BOM is true and DNP is
 * false. It is a display filter over the derived list — the semantic index is
 * never mutated, and the two flags stay independent (a part excluded from the
 * BOM is not treated as DNP, and vice versa).
 */

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SemanticComponent } from "@/types/prism-selection";

export type BomAssemblyFilter = "all" | "assembly";

export const ASSEMBLY_FILTER_HELP =
    "All components shows every part with its effective In BOM and DNP flags. " +
    "Assembly keeps parts with In BOM = Yes and DNP = No.";

const flagText = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value);
};

/** Effective DNP from the projected component fields. */
export function isDnp(component: SemanticComponent): boolean {
    return flagText(component.fields?.DNP).toLocaleLowerCase() === "yes";
}

/** Effective In BOM from the projected component fields. */
export function isInBom(component: SemanticComponent): boolean {
    return flagText(component.fields?.["In BOM"]).toLocaleLowerCase() !== "no";
}

/** The D1 predicate: present in the assembly, not merely in the index. */
export function isAssembled(component: SemanticComponent): boolean {
    return isInBom(component) && !isDnp(component);
}

export function filterComponentsForAssembly(
    components: readonly SemanticComponent[],
    filter: BomAssemblyFilter,
): SemanticComponent[] {
    if (filter === "all") return [...components];
    return components.filter(isAssembled);
}

export function BomAssemblyFilterControl({
    value,
    onChange,
    allCount,
    assemblyCount,
}: {
    value: BomAssemblyFilter;
    onChange: (filter: BomAssemblyFilter) => void;
    allCount: number;
    assemblyCount: number;
}) {
    const options: Array<{ value: BomAssemblyFilter; label: string; count: number }> = [
        { value: "all", label: "All components", count: allCount },
        { value: "assembly", label: "Assembly", count: assemblyCount },
    ];
    return (
        <div
            role="group"
            aria-label="Bill of materials assembly filter"
            title={ASSEMBLY_FILTER_HELP}
            className="flex items-center gap-1 rounded-md border p-0.5"
        >
            {options.map((option) => (
                <Button
                    key={option.value}
                    type="button"
                    size="sm"
                    variant={value === option.value ? "default" : "ghost"}
                    aria-pressed={value === option.value}
                    className={cn("h-6 px-2 text-xs")}
                    onClick={() => onChange(option.value)}
                >
                    {option.label}
                    <span className="ml-1 text-[10px] opacity-70">
                        {option.count}
                    </span>
                </Button>
            ))}
        </div>
    );
}
