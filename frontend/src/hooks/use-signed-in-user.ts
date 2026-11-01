import { useCallback, useRef, useState } from "react";

import { workspaceSessionKey } from "@/hooks/use-workspace-data";
import { forgetServerState } from "@/lib/server-state";
import type { User } from "@/types/auth";

/**
 * The signed-in user, with kept server reads scoped to them. Every kept read belongs to the account that made it: when
 * the account or its role changes (sign-out, a different sign-in, a role change), all of them are dropped and reads in
 * flight aborted, before the next account's screens render.
 */
export function useSignedInUser(): [User | null, (next: User | null) => void] {
  const [user, setSignedIn] = useState<User | null>(null);
  const identity = useRef("");
  const setUser = useCallback((next: User | null) => {
    const key = workspaceSessionKey(next);
    if (key !== identity.current) {
      identity.current = key;
      forgetServerState([]);
    }
    setSignedIn(next);
  }, []);
  return [user, setUser];
}
