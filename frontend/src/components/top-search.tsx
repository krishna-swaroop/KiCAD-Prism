import { useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { componentWorkspacePath } from "@/components/command-palette";
import { partCommand } from "@/components/command-palette-supply";
import { usePartSearch } from "@/components/use-part-search";
import { canOpenLibraryManager, canOpenSupply } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/auth";

interface TopSearchProps {
  value: string;
  onChange: (value: string) => void;
  role: UserRole | null | undefined;
}

/**
 * The header search. It filters the project gallery as before and, for roles that can open the library or supply,
 * lists matching parts underneath, so a part number typed here finds the part.
 */
export function TopSearch({ value, onChange, role }: TopSearchProps) {
  const navigate = useNavigate();
  const canLibrary = canOpenLibraryManager(role);
  const canParts = canLibrary || canOpenSupply(role);
  const [focused, setFocused] = useState(false);
  const [rawActive, setActive] = useState(0);
  const { rows } = usePartSearch(focused, canParts, value);

  const commands = useMemo(
    () =>
      rows.map((row) =>
        partCommand(row, {
          canLibrary,
          libraryPath: componentWorkspacePath,
          open: (path) => {
            setFocused(false);
            navigate(path);
          },
        }),
      ),
    [canLibrary, navigate, rows],
  );
  const active = rawActive < commands.length ? rawActive : 0;
  const showParts = focused && commands.length > 0;

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!showParts) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((active + 1) % commands.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((active - 1 + commands.length) % commands.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const chosen = commands[active];
      if (event.metaKey || event.ctrlKey) chosen?.alt?.run();
      else chosen?.run();
    } else if (event.key === "Escape") {
      setFocused(false);
    }
  };

  return (
    <div className="relative w-full max-w-2xl">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        data-shortcut-search
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setFocused(true);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={handleKeyDown}
        placeholder={canParts ? "Search projects and parts" : "Search projects by name, description, and metadata"}
        aria-label="Search projects and parts"
        className="pl-10 pr-10"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 border bg-muted px-1 text-[11px] text-muted-foreground">
        /
      </kbd>
      {showParts ? (
        // Rows act on mouse down so the input's blur doesn't close the list before the click lands.
        <div role="listbox" aria-label="Parts" className="absolute inset-x-0 top-full z-20 mt-1 border bg-popover p-1 shadow-md">
          <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Parts</p>
          {commands.map((command, index) => (
            <div
              key={command.id}
              className={cn("flex items-center", index === active ? "bg-muted text-foreground" : "text-muted-foreground")}
              onMouseMove={() => setActive(index)}
            >
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                tabIndex={-1}
                onMouseDown={(event) => {
                  event.preventDefault();
                  command.run();
                }}
                className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm"
              >
                <span className="min-w-0 flex-1 truncate text-foreground">{command.label}</span>
                {command.detail ? <span className="max-w-[45%] shrink-0 truncate text-xs text-muted-foreground">{command.detail}</span> : null}
              </button>
              {index === active && command.alt ? (
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    command.alt?.run();
                  }}
                  className="shrink-0 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  {command.alt.label}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
