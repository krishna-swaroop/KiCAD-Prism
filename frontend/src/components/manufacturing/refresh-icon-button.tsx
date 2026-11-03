import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The Release Queue's refresh: an outlined icon button whose arrow spins while it works. */
export function RefreshIconButton({ refreshing, onClick }: { refreshing: boolean; onClick: () => void }) {
    return (
        <Button
            size="icon-sm"
            variant="outline"
            aria-label="Refresh"
            title="Refresh"
            disabled={refreshing}
            onClick={onClick}
        >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
        </Button>
    );
}
