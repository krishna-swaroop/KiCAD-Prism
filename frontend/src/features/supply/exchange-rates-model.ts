/** "USD 1.08, GBP 0.85" as rates per euro. Null when a part is not a currency code and a positive number. */
export function parseRates(text: string): Record<string, number> | null {
  const rates: Record<string, number> = {};
  for (const part of text.split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean)) {
    const [code, value, ...rest] = part.split(/\s+|=/).filter(Boolean);
    const number = Number(value);
    if (rest.length > 0 || !/^[A-Za-z]{3}$/.test(code ?? "") || !Number.isFinite(number) || number <= 0) return null;
    rates[code.toUpperCase()] = number;
  }
  return Object.keys(rates).length > 0 ? rates : null;
}
