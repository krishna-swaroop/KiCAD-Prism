import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const MAX_SHOWN = 8;

/** A text box that suggests known makers as you type, in the theme's own menu. Any text is allowed. */
export function MakerCombobox({ id, value, options, onChange }: { id: string; value: string; options: readonly string[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const typed = value.trim().toLowerCase();
  const matches = options.filter((name) => name.toLowerCase().includes(typed) && name.toLowerCase() !== typed).slice(0, MAX_SHOWN);
  const shown = open && matches.length > 0;
  return (
    <Popover open={shown} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          id={id}
          autoComplete="off"
          role="combobox"
          aria-expanded={shown}
          aria-autocomplete="list"
          value={value}
          onFocus={() => setOpen(true)}
          onChange={(event) => { onChange(event.target.value); setOpen(true); }}
          onKeyDown={(event) => { if (event.key === "Escape" && shown) { event.stopPropagation(); setOpen(false); } }}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) gap-0 p-1"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => { if (event.target instanceof HTMLElement && event.target.id === id) event.preventDefault(); }}
      >
        <ul role="listbox" aria-label="Known manufacturers" className="max-h-56 themed-scrollbar overflow-y-auto">
          {matches.map((name) => (
            <li
              key={name} role="option" aria-selected={false}
              className={cn("w-full cursor-pointer px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground")}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { onChange(name); setOpen(false); }}
            >
              {name}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
