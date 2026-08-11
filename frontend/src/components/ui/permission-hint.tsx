import * as React from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ROLE_LABELS } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/auth";

export interface PermissionHintProps {
  /** True when the wrapped control is unavailable because of the user's role. */
  blocked: boolean;
  /** What the user cannot do, phrased as an action: "import components". */
  action: string;
  /** Roles that would be allowed. Rendered as the way to get access. */
  allowedRoles?: UserRole[];
  children: React.ReactNode;
  className?: string;
}

/**
 * Explains why a control is unavailable.
 *
 * A disabled button tells a user that something is not possible but never why:
 * they cannot tell a missing permission apart from a wrong workflow state or a
 * bug. Prism enforces five roles, so that ambiguity is common enough to be
 * worth answering everywhere it appears.
 *
 * The hint has to live on a wrapper rather than the control itself, because a
 * disabled button receives no pointer events and cannot take focus — nothing
 * attached to it would ever fire. The wrapper is focusable so keyboard users
 * reach the explanation too.
 */
/** The sentence shown in the hint. Exported so the wording can be tested. */
export function permissionHintMessage(action: string, allowedRoles?: UserRole[]): string {
  const roleList = allowedRoles?.map((role) => ROLE_LABELS[role] ?? role) ?? [];
  const requirement =
    roleList.length === 0
      ? ""
      : roleList.length === 1
        ? ` Ask an administrator for the ${roleList[0]} role.`
        : ` This needs the ${roleList.slice(0, -1).join(", ")} or ${roleList[roleList.length - 1]} role.`;
  return `Your role does not allow you to ${action}.${requirement}`;
}

export function PermissionHint({ blocked, action, allowedRoles, children, className }: PermissionHintProps) {
  if (!blocked) {
    return <>{children}</>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* tabIndex keeps the explanation reachable by keyboard even though the
            control inside has been removed from the tab order by `disabled`. */}
        <span tabIndex={0} className={cn("inline-flex cursor-not-allowed", className)}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{permissionHintMessage(action, allowedRoles)}</TooltipContent>
    </Tooltip>
  );
}
