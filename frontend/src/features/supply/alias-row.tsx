import { useReducer } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ConfirmAliasInput, SupplyManufacturer, SupplyReviewAlias } from "@/types/supply";
import { confirmSupplyAlias } from "./supply-api";
import { useConnectorSubmit } from "./use-connector-submit";

interface AliasRowProps {
  alias: SupplyReviewAlias;
  manufacturers: SupplyManufacturer[];
  canDecide: boolean;
  onDecided: () => Promise<void>;
}

interface Choice {
  creating: boolean;
  manufacturerId: string;
  newName: string;
}

function choose(state: Choice, change: Partial<Choice>): Choice {
  return { ...state, ...change };
}

export function AliasRow({ alias, manufacturers, canDecide, onDecided }: AliasRowProps) {
  // With no manufacturer to pick from, naming one is the only way forward.
  const [choice, update] = useReducer(choose, { creating: manufacturers.length === 0, manufacturerId: "", newName: "" });
  const { busy, error, run } = useConnectorSubmit();

  const input: ConfirmAliasInput | null = choice.creating
    ? choice.newName.trim() ? { alias_key: alias.alias_key, new_manufacturer_name: choice.newName.trim() } : null
    : choice.manufacturerId ? { alias_key: alias.alias_key, manufacturer_id: choice.manufacturerId } : null;

  const confirm = () => {
    if (!input) return;
    void run(async () => {
      await confirmSupplyAlias(input);
      await onDecided();
    });
  };

  return (
    <article className="border bg-card p-3" aria-label={`Spelling ${alias.alias_text}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{alias.alias_text}</p>
          <p className="text-xs text-muted-foreground">
            {alias.seen_at_provider ? `Seen at ${alias.seen_at_provider}. ` : ""}
            {alias.waiting_listings === 1 ? "1 listing is waiting." : `${alias.waiting_listings} listings are waiting.`}
          </p>
        </div>
        {canDecide ? (
          <div className="flex flex-wrap items-center gap-2">
            {choice.creating ? (
              <Input
                aria-label={`New manufacturer for ${alias.alias_text}`}
                className="h-8 w-56"
                placeholder="Manufacturer name"
                value={choice.newName}
                onChange={(event) => update({ newName: event.target.value })}
              />
            ) : (
              <Select value={choice.manufacturerId} onValueChange={(manufacturerId) => update({ manufacturerId })}>
                <SelectTrigger aria-label={`Manufacturer for ${alias.alias_text}`} className="h-8 w-56">
                  <SelectValue placeholder="Map to manufacturer" />
                </SelectTrigger>
                <SelectContent>
                  {manufacturers.map((manufacturer) => (
                    <SelectItem key={manufacturer.id} value={manufacturer.id}>{manufacturer.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button size="sm" disabled={busy || input === null} onClick={confirm}>
              {choice.creating ? "Create and map" : "Map"}
            </Button>
            {manufacturers.length > 0 ? (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => update({ creating: !choice.creating })}>
                {choice.creating ? "Choose existing" : "New manufacturer"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {error ? <p role="alert" className="mt-2 text-xs text-destructive">{error}</p> : null}
    </article>
  );
}
