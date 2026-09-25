import { Check, Info, Minus } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  ROLE_AUTHORITIES,
  ROLE_OPTIONS,
  roleHasAuthority,
  roleLabel,
} from "@/lib/roles";
import type { UserRole } from "@/types/auth";

interface RoleAuthorityPopoverProps {
  role: UserRole;
}

export function RoleAuthorityPopover({ role }: RoleAuthorityPopoverProps) {
  let previousCategory = "";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Show permissions for ${roleLabel(role)}`}
          className="inline-flex items-center gap-1 rounded-sm font-medium text-foreground underline decoration-dotted underline-offset-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {roleLabel(role)}
          <Info aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={12}
        className="flex max-h-[min(70vh,32rem)] w-[min(40rem,calc(100vw-2rem))] flex-col gap-0 overflow-hidden rounded-md p-0"
      >
        <PopoverHeader className="shrink-0 border-b px-3 py-2">
          <PopoverTitle>Role permissions</PopoverTitle>
          <PopoverDescription>
            Highlighted column is {roleLabel(role)}.
          </PopoverDescription>
        </PopoverHeader>

        <div className="min-h-0 flex-1 overflow-auto">
          <table aria-label="Role authority matrix" className="w-full min-w-[32rem] border-collapse text-left">
            <thead>
              <tr className="border-b bg-muted/40">
                <th scope="col" className="w-[14rem] px-3 py-1.5 text-xs font-medium">
                  Permission
                </th>
                {ROLE_OPTIONS.map((matrixRole) => {
                  const current = matrixRole === role;
                  return (
                    <th
                      key={matrixRole}
                      scope="col"
                      aria-label={`${roleLabel(matrixRole)}${current ? " (current)" : ""}`}
                      className={cn(
                        "min-w-[4.5rem] px-1.5 py-1.5 text-center text-[11px] font-medium leading-tight",
                        current && "bg-primary/10 text-primary",
                      )}
                    >
                      {roleLabel(matrixRole)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {ROLE_AUTHORITIES.map((authority) => {
                const showCategory = authority.category !== previousCategory;
                previousCategory = authority.category;
                return (
                  <tr key={authority.key} className="border-b last:border-b-0">
                    <th scope="row" className="px-3 py-1 align-middle font-normal">
                      {showCategory && (
                        <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {authority.category}
                        </span>
                      )}
                      <span className="block text-xs font-medium text-foreground">{authority.label}</span>
                    </th>
                    {ROLE_OPTIONS.map((matrixRole) => {
                      const allowed = roleHasAuthority(matrixRole, authority.key);
                      return (
                        <td
                          key={matrixRole}
                          aria-label={`${authority.label}: ${roleLabel(matrixRole)} is ${allowed ? "allowed" : "not allowed"}`}
                          className={cn(
                            "px-1.5 py-1 text-center align-middle",
                            matrixRole === role && "bg-primary/10",
                          )}
                        >
                          {allowed ? (
                            <Check aria-hidden="true" className="mx-auto h-3.5 w-3.5 text-success" />
                          ) : (
                            <Minus aria-hidden="true" className="mx-auto h-3.5 w-3.5 text-muted-foreground/50" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </PopoverContent>
    </Popover>
  );
}
