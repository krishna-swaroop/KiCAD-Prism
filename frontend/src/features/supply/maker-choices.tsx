import { useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import type { SupplyChoice, SupplyChoiceOption } from "@/types/supply";
import { partHref } from "./supply-views";
import { CollapsibleSection } from "./collapsible-section";
import { chooseSupplyMaker, otherSupplyMaker, markPartNumbers } from "./supply-api";
import { useConnectorSubmit } from "./use-connector-submit";

function NumberQuestion({ choice, onDecided }: { choice: SupplyChoice; onDecided: () => Promise<void> }) {
  const { busy, error, run } = useConnectorSubmit();
  const [off, setOff] = useState<Set<string>>(new Set());
  const used = choice.options.filter((option) => !off.has(option.key));
  const toggle = (key: string) => setOff((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  return (
    <>
      <ul className="divide-y">
        {choice.options.map((option) => (
          <li key={option.key} className="flex items-center gap-3 px-3 py-2">
            <input type="checkbox" className="h-3.5 w-3.5" checked={!off.has(option.key)} onChange={() => toggle(option.key)} aria-label={`Use ${option.spelling}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{option.spelling}</p>
              <p className="truncate text-xs text-muted-foreground">{option.connectors.join(", ")}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex justify-end gap-2 px-3 py-2">
        <Button size="sm" disabled={busy || used.length === 0} onClick={() => void run(async () => { await markPartNumbers(choice.part_id, used.map((option) => option.key)); await onDecided(); })}>
          Use ({used.length})
        </Button>
      </div>
      {error ? <p role="alert" className="px-3 pb-2 text-xs text-destructive">{error}</p> : null}
    </>
  );
}

function Option({ choice, option, onDecided }: { choice: SupplyChoice; option: SupplyChoiceOption; onDecided: () => Promise<void> }) {
  const { busy, error, run } = useConnectorSubmit();
  const unlisted = choice.kind === "unlisted";
  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{option.spelling}</p>
        <p className="truncate text-xs text-muted-foreground">{option.connectors.join(", ")}</p>
      </div>
      <span className="bg-secondary px-2 py-0.5 text-xs tabular-nums">{option.listings} {option.listings === 1 ? "listing" : "listings"}</span>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" disabled={busy} onClick={() => void run(async () => { await chooseSupplyMaker(choice.part_id, option.key); await onDecided(); })}>
          {unlisted ? "Same maker" : "This maker"}
        </Button>
        {unlisted ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(async () => { await otherSupplyMaker(choice.part_id, option.key); await onDecided(); })}>
            Different maker
          </Button>
        ) : null}
      </div>
      {error ? <p role="alert" className="basis-full text-xs text-destructive">{error}</p> : null}
    </li>
  );
}

/** Parts whose maker the distributors' answers do not settle: one question each, answered with one click. */
export function MakerChoices({ choices, onDecided }: { choices: readonly SupplyChoice[]; onDecided: () => Promise<void> }) {
  if (choices.length === 0) return null;
  return (
    <CollapsibleSection id="review-choices" title="Needs a choice" count={choices.length}>
      <ul className="divide-y">
        {choices.map((choice) => (
          <li key={`${choice.part_id}:${choice.kind}`} aria-label={`Choice for ${choice.mpn}`}>
            <div className="flex flex-wrap items-center gap-2 bg-muted/20 px-3 py-2">
              <Link to={partHref(choice.part_id)} className="text-sm font-medium text-primary hover:underline">{choice.mpn}</Link>
              <span className="text-xs text-muted-foreground">
                {choice.kind === "number"
                  ? "Not listed by its own number. Sold as:"
                  : choice.kind === "unlisted" ? `No distributor lists it under ${choice.manufacturer}` : `Written as ${choice.manufacturer}`}
              </span>
            </div>
            {choice.kind === "number" ? <NumberQuestion choice={choice} onDecided={onDecided} /> : (
              <ul className="divide-y">
                {choice.options.map((option) => <Option key={option.key} choice={choice} option={option} onDecided={onDecided} />)}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </CollapsibleSection>
  );
}
