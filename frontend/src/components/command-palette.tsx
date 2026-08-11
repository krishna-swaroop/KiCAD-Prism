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
  CircuitBoard,
  Cpu,
  Database,
  DownloadCloud,
  Keyboard,
  LoaderCircle,
  LogOut,
  PackageCheck,
  Search,
  Table2,
} from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { fetchJson } from "@/lib/api";
import {
  getPaletteCommands,
  subscribeToPaletteCommands,
  type PaletteCommand,
} from "@/lib/command-registry";
import { canOpenLibraryManager } from "@/lib/roles";
import { shortcutKeys } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import type { User } from "@/types/auth";
import type { CatalogComponent, PaginatedComponents } from "@/types/catalog";
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

/** Shortest query worth sending to the catalog. "R" would match everything. */
const COMPONENT_SEARCH_MIN_LENGTH = 2;
const COMPONENT_SEARCH_DEBOUNCE_MS = 180;
const COMPONENT_SEARCH_LIMIT = 8;

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

function componentDetail(component: CatalogComponent): string {
  return [component.manufacturer, component.mpn].filter(Boolean).join(" · ");
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
export function CommandPalette({ open, onOpenChange, user, onShowShortcuts, onLogout }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [projects, setProjects] = useState<Project[]>([]);
  const [components, setComponents] = useState<CatalogComponent[]>([]);
  const [searchingComponents, setSearchingComponents] = useState(false);
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

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setComponents([]);
    }
  }, [open]);

  /**
   * Component search runs on the server: the catalog is tens of thousands of
   * rows, so it is never held in the browser the way the project list is.
   * Requests are debounced and superseded, so typing an MPN issues one search
   * rather than one per keystroke.
   */
  useEffect(() => {
    const trimmed = query.trim();
    if (!open || !canSearchCatalog || trimmed.length < COMPONENT_SEARCH_MIN_LENGTH) {
      setComponents([]);
      setSearchingComponents(false);
      return;
    }

    const controller = new AbortController();
    setSearchingComponents(true);
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        q: trimmed,
        page: "1",
        page_size: String(COMPONENT_SEARCH_LIMIT),
        lightweight: "true",
      });
      void fetchJson<PaginatedComponents>(`/api/catalog/components?${params.toString()}`, {
        signal: controller.signal,
      })
        .then((response) => {
          setComponents(response.items ?? []);
          setSearchingComponents(false);
        })
        .catch(() => {
          // An aborted request is the normal case while typing, and a genuine
          // failure should not interrupt someone mid-keystroke. Either way the
          // palette keeps working without component results.
          if (!controller.signal.aborted) {
            setComponents([]);
            setSearchingComponents(false);
          }
        });
    }, COMPONENT_SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [canSearchCatalog, open, query]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

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
   * Component hits are kept out of the fuzzy pass. The catalog already ranked
   * them against the same query, and re-scoring an exact MPN against a fuzzy
   * threshold is how an exact match gets dropped.
   */
  const componentCommands = useMemo<PaletteCommand[]>(
    () =>
      components.map((component) => ({
        id: `component:${component.id}`,
        label: component.name || component.value || component.mpn || "Untitled component",
        group: "Components",
        icon: Cpu,
        detail: componentDetail(component) || undefined,
        run: () => {
          close();
          navigate(componentWorkspacePath(component.id));
        },
      })),
    [close, components, navigate],
  );

  const fuse = useMemo(
    () =>
      new Fuse(commands, {
        keys: [
          { name: "label", weight: 3 },
          { name: "keywords", weight: 1 },
          { name: "group", weight: 0.5 },
        ],
        threshold: 0.4,
        ignoreLocation: true,
      }),
    [commands],
  );

  const results = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return commands;
    // Navigation and actions first: they are few, and a query that matches one
    // is almost always aimed at it. Component hits follow, in catalog rank.
    return [...fuse.search(trimmed).map((match) => match.item), ...componentCommands];
  }, [commands, componentCommands, fuse, query]);

  useEffect(() => {
    setActiveIndex((current) => (current < results.length ? current : 0));
  }, [results.length]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, results]);

  // Rows carry their group heading with them so grouping survives ranked search
  // results, where a group's entries are no longer contiguous by construction.
  const rows = useMemo(() => {
    let lastGroup = "";
    return results.map((command) => {
      const heading = command.group === lastGroup ? null : command.group;
      lastGroup = command.group;
      return { command, heading };
    });
  }, [results]);

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
      results[activeIndex]?.run();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[15%] max-w-xl translate-y-0 gap-0 p-0 [&>button]:hidden"
        onKeyDown={handleKeyDown}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Search for a project, a component, a library view, or an action. Use the arrow keys to choose and
          Enter to run.
        </DialogDescription>
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            placeholder={canSearchCatalog ? "Search projects, components, views, and actions…" : "Search projects, views, and actions…"}
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
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  data-active={isActive ? "true" : undefined}
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => command.run()}
                  className={cn(
                    "flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm",
                    isActive ? "bg-muted text-foreground" : "text-muted-foreground",
                  )}
                >
                  {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
                  <span className="min-w-0 flex-1 truncate text-foreground">{command.label}</span>
                  {command.detail ? (
                    <span className="max-w-[45%] shrink-0 truncate text-xs text-muted-foreground">{command.detail}</span>
                  ) : null}
                </button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
