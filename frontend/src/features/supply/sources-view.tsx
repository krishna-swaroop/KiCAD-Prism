import type { User } from "@/types/auth";
import { SupplyConnectorsView } from "./connectors-view";
import { InventorySourcesSection } from "./inventory-sources";
import { useSigninResult } from "./use-signin-result";

/** Supply > Sources: the distributors, then the local inventory servers. A DigiKey sign-in returns here. */
export function SourcesView({ user }: { user: User | null }) {
  useSigninResult();
  return <SupplyConnectorsView user={user} after={<InventorySourcesSection isAdmin={user?.role === "admin"} />} />;
}
