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
        className="w-[min(52rem,calc(100vw-2rem))] gap-0 overflow-hidden rounded-md p-0"
      >
        <PopoverHeader className="border-b p-4">
          <PopoverTitle>Role permissions</PopoverTitle>
          <PopoverDescription>
            Your role is {roleLabel(role)}. The highlighted column shows what you can do.
          </PopoverDescription>
        </PopoverHeader>

        <div className="overflow-x-auto">
          <table aria-label="Role authority matrix" className="w-full min-w-[46rem] border-collapse text-left">
            <thead>
              <tr className="border-b bg-muted/40">
                <th scope="col" className="w-[17rem] px-3 py-2 font-medium">
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
                        "min-w-[5.5rem] px-2 py-2 text-center text-[11px] font-medium leading-tight",
                        current && "bg-primary/10 text-primary",
                      )}
                    >
                      {roleLabel(matrixRole)}
                      {current && <span className="mt-0.5 block text-[10px] font-normal">Your role</span>}
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
                    <th scope="row" className="px-3 py-2 align-top font-normal">
                      {showCategory && (
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {authority.category}
                        </span>
                      )}
                      <span className="block font-medium text-foreground">{authority.label}</span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                        {authority.description}
                      </span>
                    </th>
                    {ROLE_OPTIONS.map((matrixRole) => {
                      const allowed = roleHasAuthority(matrixRole, authority.key);
                      return (
                        <td
                          key={matrixRole}
                          aria-label={`${authority.label}: ${roleLabel(matrixRole)} is ${allowed ? "allowed" : "not allowed"}`}
                          className={cn(
                            "px-2 py-2 text-center align-middle",
                            matrixRole === role && "bg-primary/10",
                          )}
                        >
                          {allowed ? (
                            <Check aria-hidden="true" className="mx-auto h-4 w-4 text-success" />
                          ) : (
                            <Minus aria-hidden="true" className="mx-auto h-4 w-4 text-muted-foreground/50" />
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
