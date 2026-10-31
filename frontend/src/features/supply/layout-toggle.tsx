import { LayoutList, Rows3 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PartsLayout } from "./parts-layout";

const CHOICES = [
  { id: "compact", label: "Compact", icon: Rows3 },
  { id: "detailed", label: "Detailed, a row for each vendor", icon: LayoutList },
] as const;

/** Two icons that switch a parts list between its compact and detailed layouts. */
export function LayoutToggle({ layout, onChange }: { layout: PartsLayout; onChange: (layout: PartsLayout) => void }) {
  return (
    <div role="group" aria-label="Layout" className="flex">
      {CHOICES.map(({ id, label, icon: Icon }) => (
        <Button
          key={id}
          type="button"
          size="icon"
          variant={layout === id ? "secondary" : "outline"}
          className="h-8 w-8"
          aria-pressed={layout === id}
          aria-label={label}
          title={label}
          onClick={() => onChange(id)}
        >
          <Icon className="h-4 w-4" />
        </Button>
      ))}
    </div>
  );
}
