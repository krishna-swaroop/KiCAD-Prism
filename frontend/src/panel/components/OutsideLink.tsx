import { Check } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { copyText, insideKiCad } from "@/lib/kicad-host";

/**
 * A link to something outside Prism: a datasheet, a distributor's page. Inside KiCad it copies the address instead, because KiCad
 * would load it in the panel with no way back; in a browser it opens a new tab.
 */
export function OutsideLink({ href, label, className, children }: { href: string; label: string; className?: string; children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!insideKiCad()) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label} className={className}>
        {children}
      </a>
    );
  }
  const copy = async () => {
    try {
      await copyText(href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button type="button" aria-label={`Copy link: ${label}`} title={copied ? "Copied" : `Copy link: ${label}`} className={className} onClick={() => void copy()}>
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : children}
    </button>
  );
}
