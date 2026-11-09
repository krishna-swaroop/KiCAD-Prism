import type { ReactNode } from "react";

/** A price with the quantity it is priced at: "€0.31 × 1,000". */
export function PriceAtQuantity({ price, quantity, title, quantityFirst = false }: {
  price?: ReactNode;
  quantity: number | null | undefined;
  title?: string;
  /** Put the quantity before the sign, as a line's cost reads: "1,000 × €0.31". */
  quantityFirst?: boolean;
}) {
  const hasPrice = price !== null && price !== undefined && price !== "";
  if (quantity === null || quantity === undefined) return <>{price}</>;
  if (quantityFirst) return <span title={title}>{quantity.toLocaleString()} ×{hasPrice ? <> {price}</> : null}</span>;
  return (
    <span title={title}>
      {price}{hasPrice ? " " : null}
      <span className="text-muted-foreground">× {quantity.toLocaleString()}</span>
    </span>
  );
}
