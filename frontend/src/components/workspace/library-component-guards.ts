import type { CatalogComponent } from "@/types/catalog";

export function isCatalogComponent(value: unknown): value is CatalogComponent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CatalogComponent>;
  return typeof candidate.id === "string"
    && typeof candidate.revision_id === "string"
    && typeof candidate.validation === "object"
    && candidate.validation !== null;
}
