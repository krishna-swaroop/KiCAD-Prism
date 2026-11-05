import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import Fuse from "fuse.js";
import {
  Bug,
  CircuitBoard,
  Database,
  DownloadCloud,
  Info,
  Keyboard,
  LoaderCircle,
  LogOut,
  PackageCheck,
  Search,
  Table2,
} from "lucide-react";

import { toast } from "sonner";
import { followNumber } from "@/features/supply/tracking-api";
import { partCommand, projectSupplyCommand, supplyCommands, supplyPartPath, trackCommand } from "@/components/command-palette-supply";
import { usePartSearch } from "@/components/use-part-search";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { fetchJson } from "@/lib/api";
import { openHelpDialog, type HelpDialog } from "@/lib/help-dialogs";
import {
  getPaletteCommands,
  subscribeToPaletteCommands,
  type PaletteCommand,
} from "@/lib/command-registry";
import { canOpenLibraryManager, canOpenSupply } from "@/lib/roles";
import { shortcutKeys } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import type { User } from "@/types/auth";
import type { Project } from "@/types/project";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
  onShowShortcuts: () => void;
  onLogout: () => void;
}

interface BootstrapResponse {
  projects: Project[];
}

const LIBRARY_VIEWS = [
  { view: "catalog", label: "Catalog", icon: Database },
  { view: "bulk-edit", label: "Bulk Edit", icon: Table2 },
  { view: "imports", label: "Import Center", icon: DownloadCloud },
  { view: "releases", label: "Release Queue", icon: PackageCheck },
] as const;

const HELP_DIALOG_COMMANDS = [
  { id: "help:report-bug", label: "Report a bug", group: "Help", icon: Bug, keywords: "issue github problem support", dialog: "report-bug" },
  { id: "help:about", label: "About KiCAD Prism", group: "Help", icon: Info, keywords: "version build release", dialog: "about" },
] as const satisfies ReadonlyArray<Omit<PaletteCommand, "run"> & { dialog: HelpDialog }>;

/**
 * How the palette matches navigation and actions. A threshold of 0.3 still
 * forgives one typo in a word of four or more letters, but no longer lets one
 * wrong letter in three match: at 0.4 "GND" listed GNSS_RECEIVER and CNDH-BP.
 */
export const PALETTE_SEARCH_OPTIONS = {
  keys: [
    { name: "label", weight: 3 },
    { name: "keywords", weight: 1 },
    { name: "group", weight: 0.5 },
  ],
  threshold: 0.3,
  ignoreLocation: true,
};

/**
 * Deep link to a component's full workspace.
 *
 * The component workspace is not a route of its own: the workspace shell reads
 * `component` from the query string and renders it in place of the section. So
 * a link from anywhere in the app — including a project page — goes to the
 * workspace root with the component named.
 */
export function componentWorkspacePath(componentId: string): string {
  const params = new URLSearchParams({
    section: "library-manager",
    libraryView: "catalog",
    component: componentId,
    componentTab: "overview",
  });
  return `/?${params.toString()}`;
}

/**
 * ⌘K palette.
 *
 * It offers four kinds of entry: navigation that is always valid, the project
 * list (fetched the first time the palette opens rather than at app start, so
 * it costs nothing for users who never press ⌘K), live component search against
 * the catalog, and whatever the mounted screen has published to the command
 * registry.
 */
// Rows carry their group heading with them so grouping survives ranked search
// results, where a group's entries are no longer contiguous by construction.
function withGroupHeadings(results: PaletteCommand[]) {
  let lastGroup = "";
  return results.map((command) => {
    const heading = command.group === lastGroup ? null : command.group;
    lastGroup = command.group;
    return { command, heading };
  });
}

export function CommandPalette({ open, onOpenChange, user, onShowShortcuts, onLogout }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [rawActiveIndex, setActiveIndex] = useState(0);
  const [projects, setProjects] = useState<Project[]>([]);
  const projectsLoadedRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  const screenCommands = useSyncExternalStore(subscribeToPaletteCommands, getPaletteCommands);
  const canSearchCatalog = canOpenLibraryManager(user?.role);

  useEffect(() => {
    if (!open || projectsLoadedRef.current) return;
    projectsLoadedRef.current = true;
    void fetchJson<BootstrapResponse>("/api/workspace/bootstrap", undefined, "Failed to load projects")
      .then((data) => setProjects(data.projects ?? []))
      // A palette without the project list is still useful, so a failure here
      // stays silent rather than throwing a toast at someone who just pressed ⌘K.
      .catch(() => {
        projectsLoadedRef.current = false;
      });
  }, [open]);

  /**
   * Part search runs on the server: the catalog and the supply data are far too big to hold in the browser, and
   * the server merges them so a part that is both a library component and a supply part is one row.
   */
  const canSearchSupply = canOpenSupply(user?.role);
  const { rows: partRows, searching: searchingComponents } = usePartSearch(open, canSearchCatalog || canSearchSupply, query);

  // Closing is what ends a palette session, so it is where the session's
  // state is dropped. The project list deliberately survives: it is a cache,
  // not part of the session.
  const handleOpenChange = useCallback((next: boolean) => {
    if (!next) {
      setQuery("");
      setActiveIndex(0);
    }
    onOpenChange(next);
  }, [onOpenChange]);
  const close = useCallback(() => handleOpenChange(false), [handleOpenChange]);

  const commands = useMemo<PaletteCommand[]>(() => {
    const run = (action: () => void) => () => {
      close();
      action();
    };

    const goToWorkspace = (params: string) => run(() => navigate(`/${params}`));

    const items: PaletteCommand[] = [
      {
        id: "go:projects",
        label: "Projects",
        group: "Go to",
        icon: CircuitBoard,
        keywords: "workspace home boards",
        run: goToWorkspace(""),
      },
    ];

    if (canSearchCatalog) {
      for (const entry of LIBRARY_VIEWS) {
        items.push({
          id: `go:library:${entry.view}`,
          label: `Library Manager — ${entry.label}`,
          group: "Go to",
          icon: entry.icon,
          keywords: `components parts ${entry.label}`,
          run: goToWorkspace(`?section=library-manager&libraryView=${entry.view}`),
        });
      }
    }

    items.push(...supplyCommands(user?.role, goToWorkspace));

    for (const project of projects) {
      items.push({
        id: `project:${project.id}`,
        label: project.display_name || project.name,
        group: "Projects",
        icon: CircuitBoard,
        detail: project.description || undefined,
        keywords: `${project.name} ${project.path}`,
        run: run(() => navigate(`/project/${project.id}`)),
      });
      items.push(...projectSupplyCommand({ id: project.id, name: project.display_name || project.name }, user?.role, (path) => run(() => navigate(path))()));
    }

    items.push(...screenCommands.map((command) => ({ ...command, run: run(command.run) })));

    items.push({
      id: "help:shortcuts",
      label: "Keyboard shortcuts",
      group: "Help",
      icon: Keyboard,
      detail: shortcutKeys("shift+/").join(" "),
      run: run(onShowShortcuts),
    });

    items.push(...HELP_DIALOG_COMMANDS.map(({ dialog, ...command }) => ({
      ...command,
      run: run(() => openHelpDialog(dialog)),
    })));

    if (user && user.email !== "guest@local") {
      items.push({
        id: "session:logout",
        label: "Log out",
        group: "Help",
        icon: LogOut,
        run: run(onLogout),
      });
    }

    return items;
  }, [canSearchCatalog, close, navigate, onLogout, onShowShortcuts, projects, screenCommands, user]);

  /**
   * Part hits are kept out of the fuzzy pass. The server already ranked them against the same query, and re-scoring
   * an exact part number against a fuzzy threshold is how an exact match gets dropped.
   */
  const componentCommands = useMemo<PaletteCommand[]>(
    () =>
      partRows.map((row) =>
        partCommand(row, {
          canLibrary: canSearchCatalog,
          libraryPath: componentWorkspacePath,
          open: (path) => {
            close();
            navigate(path);
          },
        }),
      ),
    [canSearchCatalog, close, navigate, partRows],
  );

  const trackCommands = useMemo<PaletteCommand[]>(
    () =>
      searchingComponents
        ? []
        : trackCommand(query, user?.role, partRows, (mpn) => {
            close();
            void followNumber({ manufacturer: "", mpn })
              .then(async (watch) => {
                toast.success(`${mpn} is tracked.`);
                navigate(supplyPartPath(watch.part_id));
              })
              .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Could not track the part"));
          }),
    [close, navigate, partRows, query, searchingComponents, user?.role],
  );

  const fuse = useMemo(
    () =>
      new Fuse(commands, PALETTE_SEARCH_OPTIONS),
    [commands],
  );

  const results = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return commands;
    // Navigation and actions first: they are few, and a query that matches one
    // is almost always aimed at it. Part hits follow, in server rank.
    return [...fuse.search(trimmed).map((match) => match.item), ...componentCommands, ...trackCommands];
  }, [commands, componentCommands, fuse, query, trackCommands]);

  // A result list that has shrunk past the highlight takes it back to the top
  // during render, not after a commit that showed the wrong row.
  const activeIndex = rawActiveIndex < results.length ? rawActiveIndex : 0;

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, results]);

  const rows = useMemo(() => withGroupHeadings(results), [results]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown" || (event.key === "n" && event.ctrlKey)) {
      event.preventDefault();
      setActiveIndex((current) => (results.length ? (current + 1) % results.length : 0));
      return;
    }
    if (event.key === "ArrowUp" || (event.key === "p" && event.ctrlKey)) {
      event.preventDefault();
      setActiveIndex((current) => (results.length ? (current - 1 + results.length) % results.length : 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const chosen = results[activeIndex];
      if (event.ctrlKey || event.metaKey) chosen?.alt?.run();
      else chosen?.run();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="top-[15%] max-w-xl translate-y-0 gap-0 p-0 [&>button]:hidden"
        onKeyDown={handleKeyDown}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Search for a project, a part, a library view, or an action. Ctrl or Command and Enter opens a part's other place. Use the arrow keys to choose and
          Enter to run.
        </DialogDescription>
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            placeholder={canSearchCatalog || canSearchSupply ? "Search projects, parts, views, and actions…" : "Search projects, views, and actions…"}
            aria-label="Search commands"
            aria-controls="command-palette-results"
            className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {searchingComponents ? (
            <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
          ) : null}
        </div>
        <div id="command-palette-results" ref={listRef} role="listbox" className="max-h-80 overflow-y-auto p-1">
          {rows.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {searchingComponents ? "Searching…" : `No matches for \u201C${query}\u201D`}
            </p>
          ) : null}
          {rows.map(({ command, heading }, index) => {
            const Icon = command.icon;
            const isActive = index === activeIndex;
            return (
              <div key={command.id}>
                {heading ? (
                  <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {heading}
                  </p>
                ) : null}
                {/* The second action is its own button beside the row, so clicking it runs it rather than the row. */}
                <div
                  className={cn("flex items-center", isActive ? "bg-muted text-foreground" : "text-muted-foreground")}
                  onMouseMove={() => setActiveIndex(index)}
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    data-active={isActive ? "true" : undefined}
                    onClick={() => command.run()}
                    className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm"
                  >
                    {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
                    <span className="min-w-0 flex-1 truncate text-foreground">{command.label}</span>
                    {command.detail ? (
                      <span className="max-w-[45%] shrink-0 truncate text-xs text-muted-foreground">{command.detail}</span>
                    ) : null}
                  </button>
                  {isActive && command.alt ? (
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => command.alt?.run()}
                      className="shrink-0 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {shortcutKeys("mod+enter").join(" ")} {command.alt.label}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
