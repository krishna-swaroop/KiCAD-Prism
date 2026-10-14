/** Engineering units a board designer reads: A/mm^2 and W/mm^3 rather than SI per metre. */
export function displayUnit(units?: string): { scale: number; unit: string } {
    if (units === "A/m^2") return { scale: 1e-6, unit: "A/mm²" };
    if (units === "W/m^3") return { scale: 1e-9, unit: "W/mm³" };
    return { scale: 1, unit: units ?? "" };
}

export function formatValue(value: number, units?: string, withUnit = true): string {
    if (units === "V") return withUnit ? `${value.toFixed(5)} V` : value.toFixed(4);
    const { scale, unit } = displayUnit(units);
    const shown = value * scale;
    const magnitude = Math.abs(shown);
    const text = magnitude !== 0 && (magnitude < 1e-2 || magnitude >= 1e4) ? shown.toExponential(3) : shown.toPrecision(4);
    return withUnit && unit ? `${text} ${unit}` : text;
}
