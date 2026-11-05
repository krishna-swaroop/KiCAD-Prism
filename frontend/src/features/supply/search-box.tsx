import { Search, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** A search field that searches on submit, with an X that clears it. Remount it (a new key) to reset the text. */
export function SearchBox({ initial, onSearch, label = "Search parts", placeholder = "Part number or manufacturer" }: {
  initial: string;
  onSearch: (text: string) => void;
  label?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(initial);
  return (
    <form
      className="flex items-center gap-2"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch(text.trim());
      }}
    >
      <div className="relative">
        <Input aria-label={label} className="h-8 w-48 pr-8" placeholder={placeholder} value={text} onChange={(event) => setText(event.target.value)} />
        {text ? (
          <button
            type="button" aria-label="Clear search" title="Clear search"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setText("");
              // A search that is applied is lifted too; text that was only typed is just cleared.
              if (initial !== "") onSearch("");
            }}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <Button type="submit" size="sm" variant="outline"><Search className="h-4 w-4" />Search</Button>
    </form>
  );
}
