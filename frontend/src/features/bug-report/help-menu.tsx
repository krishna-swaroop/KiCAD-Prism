import { Bug, Info, LifeBuoy } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { openHelpDialog } from "@/lib/help-dialogs";
import { cn } from "@/lib/utils";

/** Header Help menu: the discrete home of Report a bug and About. */
export function HelpMenu({ className }: { className?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Help" title="Help"
          className={cn("rounded-md text-muted-foreground hover:text-foreground aria-expanded:border-primary/60 aria-expanded:text-primary", className)}>
          <LifeBuoy className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={() => openHelpDialog("report-bug")}>
          <Bug className="h-4 w-4" />
          Report a bug…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openHelpDialog("about")}>
          <Info className="h-4 w-4" />
          About KiCAD Prism
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
