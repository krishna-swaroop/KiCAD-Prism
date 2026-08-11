import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SHORTCUT_REFERENCE, shortcutKeys } from "@/lib/shortcuts";

function KeyCap({ children }: { children: string }) {
  // A separator inside a range ("1 – 6") is not a key, so it is rendered as
  // plain text instead of a cap.
  if (children === "–") {
    return <span className="px-0.5 text-xs text-muted-foreground">{children}</span>;
  }
  return (
    <kbd className="inline-flex h-5 min-w-[1.25rem] items-center justify-center border bg-muted px-1 font-sans text-[11px] font-medium text-foreground">
      {children}
    </kbd>
  );
}

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Everything listed here is wired up today. Press ? at any time to bring this back.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 sm:grid-cols-2">
          {SHORTCUT_REFERENCE.map((group) => (
            <section key={group.title} className="space-y-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</h3>
                {group.hint ? <p className="text-[11px] text-muted-foreground/80">{group.hint}</p> : null}
              </div>
              <dl className="space-y-1.5">
                {group.shortcuts.map((shortcut) => {
                  const keys = shortcut.keys ?? shortcutKeys(shortcut.combo ?? "");
                  return (
                    <div key={shortcut.description} className="flex items-start justify-between gap-3">
                      <dt className="text-sm text-foreground">{shortcut.description}</dt>
                      <dd className="flex shrink-0 items-center gap-1 pt-0.5">
                        {keys.map((key, index) => (
                          <KeyCap key={`${key}-${index}`}>{key}</KeyCap>
                        ))}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
