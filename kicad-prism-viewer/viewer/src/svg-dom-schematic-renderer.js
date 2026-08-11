const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";
const UNSAFE_TAGS = new Set(["script", "foreignobject", "iframe", "object", "embed"]);
const ID_REF_ATTRIBUTES = new Set(["href", "xlink:href"]);
const DEFAULT_MAX_MOUNTED_WORLD_PAGES = 1;
const DEFAULT_MAX_CACHED_SVG_PAGES = 18;
const DEFAULT_PRELOAD_SVG_PAGES = 8;

export class SvgDomSchematicRenderer {
  static create(host, manifestUrl, manifest, featuresByPage, callbacks = {}) {
    return new SvgDomSchematicRenderer(host, manifestUrl, manifest, featuresByPage, callbacks);
  }

  constructor(host, manifestUrl, manifest, featuresByPage, callbacks) {
    this.host = host;
    this.manifestUrl = manifestUrl;
    this.manifest = manifest;
    this.featuresByPage = featuresByPage || {};
    this.callbacks = callbacks;
    this.activePage = null;
    this.activeSvgUrl = "";
    this.container = null;
    this.svg = null;
    this.overlay = null;
    this.mountedPages = new Map();
    this.loadingPages = new Map();
    this.svgCache = new Map();
    this.serial = 0;
    this.maxMountedWorldPages = DEFAULT_MAX_MOUNTED_WORLD_PAGES;
    this.maxCachedSvgPages = DEFAULT_MAX_CACHED_SVG_PAGES;
    this.worldHandlersInstalled = false;
    this.worldDrag = null;
    this.view = { scale: 1, tx: 0, ty: 0 };
    this.drag = null;
    this.selected = null;
    this.highlightedNetUid = "";
    this.index = emptyIndex();
    this.lastStats = {
      mountedPages: 0,
      domNodes: 0,
      indexedFeatures: 0,
      indexedNets: 0,
      mountMs: 0,
      coldMounts: 0,
      warmMounts: 0,
      highlightMs: 0,
      selectionMs: 0,
      cachedSvgPages: 0,
      cachedSvgBytes: 0,
      heapMb: null,
      fallbackReason: "",
    };
  }

  get active() {
    return Boolean(this.container && this.activePage);
  }

  get worldActive() {
    return this.mountedPages.size > 0;
  }

  stats() {
    return {
      ...this.lastStats,
      activePage: this.activePage?.name || [...this.mountedPages.values()][0]?.page?.name || "-",
      mountedPages: this.active ? 1 : this.mountedPages.size,
    };
  }

  dispose() {
    this.unmountPage();
    this.unmountWorldPages();
  }

  unmountPage() {
    this.container?.remove();
    this.container = null;
    this.svg = null;
    this.overlay = null;
    this.activePage = null;
    this.activeSvgUrl = "";
    this.index = emptyIndex();
    this.host.hidden = true;
  }

  unmountWorldPages() {
    for (const entry of this.mountedPages.values()) entry.container.remove();
    this.mountedPages.clear();
    this.loadingPages.clear();
    if (!this.active) this.host.hidden = true;
  }

  async preloadPages(pages) {
    const started = performance.now();
    const results = await Promise.allSettled((pages || [])
      .slice(0, DEFAULT_PRELOAD_SVG_PAGES)
      .map((page) => this.loadSvgTemplate(page)));
    this.lastStats.preloadedPages = results.filter((result) => result.status === "fulfilled" && result.value).length;
    this.lastStats.preloadMs = performance.now() - started;
    this.updateCacheStats();
  }

  syncWorldPages(pages, worldRenderer, options = {}) {
    if (!worldRenderer) return;
    this.installWorldHandlers(worldRenderer);
    const visiblePages = (pages || []).slice(0, options.maxMountedPages || this.maxMountedWorldPages);
    const wanted = new Set(visiblePages.map((page) => page.id));
    for (const [pageId, entry] of this.mountedPages) {
      if (!wanted.has(pageId)) {
        entry.container.remove();
        this.mountedPages.delete(pageId);
      }
    }
    for (const page of visiblePages) {
      const entry = this.mountedPages.get(page.id);
      if (entry) {
        entry.lastUsed = ++this.serial;
        this.positionWorldEntry(entry, worldRenderer);
      }
      else if (!this.loadingPages.has(page.id)) {
        const promise = this.mountWorldPage(page)
          .then((mounted) => {
            if (mounted && wanted.has(page.id)) this.positionWorldEntry(mounted, worldRenderer);
            else mounted?.container.remove();
          })
          .finally(() => this.loadingPages.delete(page.id));
        this.loadingPages.set(page.id, promise);
      }
    }
    this.pruneMountedWorldPages(wanted);
    this.host.hidden = visiblePages.length === 0 && !this.active;
    this.setSelection(this.selected);
    this.setHighlightedNet(options.activeNetUid ?? this.highlightedNetUid);
    this.lastStats.mountedPages = this.mountedPages.size;
    this.updateCacheStats();
  }

  async mountWorldPage(page) {
    const started = performance.now();
    const wasCached = this.hasCachedSvg(page);
    const imported = await this.loadImportedSvg(page);
    if (!imported) return null;
    const container = document.createElement("div");
    container.className = "svg-dom-page svg-dom-world-page";
    container.dataset.pageId = page.id;
    container.append(imported);
    this.host.append(container);
    const overlay = createOverlay(imported);
    const selectionOverlay = createSelectionOverlay(imported);
    const index = buildDomIndex(imported, page, this.featuresByPage[page.id] || []);
    const entry = {
      page,
      container,
      svg: imported,
      overlay,
      selectionOverlay,
      index,
      mountMs: performance.now() - started,
      lastUsed: ++this.serial,
      warm: wasCached,
    };
    this.mountedPages.set(page.id, entry);
    this.lastStats = {
      ...this.lastStats,
      mountedPages: this.mountedPages.size,
      domNodes: [...this.mountedPages.values()].reduce((total, item) => total + item.svg.querySelectorAll("*").length, 0),
      indexedFeatures: [...this.mountedPages.values()].reduce((total, item) => total + item.index.featureToElements.size, 0),
      indexedNets: new Set([...this.mountedPages.values()].flatMap((item) => [...item.index.netToElements.keys()])).size,
      mountMs: entry.mountMs,
      coldMounts: this.lastStats.coldMounts + (entry.warm ? 0 : 1),
      warmMounts: this.lastStats.warmMounts + (entry.warm ? 1 : 0),
      fallbackReason: "",
    };
    this.updateCacheStats();
    return entry;
  }

  async loadImportedSvg(page) {
    const template = await this.loadSvgTemplate(page);
    if (!template) return null;
    return template.cloneNode(true);
  }

  async loadSvgTemplate(page) {
    const svgUrl = this.svgUrlForPage(page);
    const cached = this.svgCache.get(svgUrl);
    if (cached?.template) {
      cached.lastUsed = ++this.serial;
      return cached.template;
    }
    if (cached?.promise) return cached.promise;
    const started = performance.now();
    const promise = (async () => {
    const response = await fetch(svgUrl, { cache: "default" });
    if (!response.ok) {
      this.lastStats.fallbackReason = `Failed to load SVG page ${page.id}: ${response.status}`;
      this.callbacks.onFallback?.(this.lastStats.fallbackReason);
      return null;
    }
    const svgText = await response.text();
    const parser = new DOMParser();
    const svgDocument = parser.parseFromString(svgText, "image/svg+xml");
    const svg = svgDocument.documentElement;
    if (!svg || svg.localName.toLowerCase() !== "svg" || svgDocument.querySelector("parsererror")) {
      this.lastStats.fallbackReason = `Invalid SVG for page ${page.id}`;
      this.callbacks.onFallback?.(this.lastStats.fallbackReason);
      return null;
    }
    sanitizeSvgDocument(svgDocument, svgUrl, page.id);
    const imported = document.importNode(svg, true);
    imported.classList.add("svg-dom-page-svg");
    ensureSvgStyle(imported);
      const entry = this.svgCache.get(svgUrl) || {};
      Object.assign(entry, {
        template: imported,
        promise: null,
        pageId: page.id,
        byteLength: svgText.length * 2,
        loadMs: performance.now() - started,
        lastUsed: ++this.serial,
      });
      this.svgCache.set(svgUrl, entry);
      this.pruneSvgCache();
      this.updateCacheStats();
    return imported;
    })();
    this.svgCache.set(svgUrl, {
      promise,
      pageId: page.id,
      byteLength: 0,
      loadMs: 0,
      lastUsed: ++this.serial,
    });
    return promise;
  }

  svgUrlForPage(page) {
    return new URL(page.svg || page.thumbnail?.path, this.manifestUrl).toString();
  }

  positionWorldEntry(entry, worldRenderer) {
    const { page, container } = entry;
    const [x0, y0] = worldRenderer.worldToScreen(page.worldX, page.worldY);
    const [x1, y1] = worldRenderer.worldToScreen(page.worldX + page.widthMm, page.worldY + page.heightMm);
    const width = Math.max(1, x1 - x0);
    const height = Math.max(1, y1 - y0);
    container.style.transform = `translate3d(${x0}px, ${y0}px, 0)`;
    container.style.width = `${width}px`;
    container.style.height = `${height}px`;
  }

  installWorldHandlers(worldRenderer) {
    if (this.worldHandlersInstalled) return;
    this.worldHandlersInstalled = true;
    const target = this.host;
    target.oncontextmenu = (event) => event.preventDefault();
    target.onpointerdown = (event) => {
      const allowTextSelection = event.button === 0 && !event.shiftKey && Boolean(event.target.closest?.("text"));
      const featureElement = event.target.closest?.("[data-feature-key]");
      const fallbackFeature = featureElement ? null : this.featureAtEvent(event);
      this.worldDrag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        button: event.button,
        moved: false,
        pan: !allowTextSelection && (event.button === 0 || event.button === 1 || event.shiftKey),
        allowTextSelection,
      };
      if (!allowTextSelection) target.setPointerCapture(event.pointerId);
    };
    target.onpointermove = (event) => {
      if (!this.worldDrag || this.worldDrag.pointerId !== event.pointerId) return;
      const dx = event.clientX - this.worldDrag.lastX;
      const dy = event.clientY - this.worldDrag.lastY;
      this.worldDrag.lastX = event.clientX;
      this.worldDrag.lastY = event.clientY;
      if (Math.hypot(event.clientX - this.worldDrag.startX, event.clientY - this.worldDrag.startY) > 3) {
        this.worldDrag.moved = true;
      }
      if (this.worldDrag.pan) worldRenderer.pan(dx, dy);
    };
    target.onpointerup = (event) => {
      if (!this.worldDrag || this.worldDrag.pointerId !== event.pointerId) return;
      const drag = this.worldDrag;
      this.worldDrag = null;
      if (!drag.allowTextSelection) target.releasePointerCapture(event.pointerId);
      if (drag.button !== 0) return;
      if (drag.moved) return;
      const element = event.target.closest?.("[data-feature-key]");
      if (element) this.selectElement(element, event);
      else {
        const hit = this.featureAtEvent(event);
        if (hit) this.selectFeature(hit.entry, hit.feature, event);
        else this.callbacks.onBlank?.();
      }
    };
    target.ondblclick = (event) => {
      const element = event.target.closest?.("[data-feature-key]");
      const hit = element ? null : this.featureAtEvent(event);
      const entry = hit?.entry || this.entryForPoint(event.clientX, event.clientY);
      const selection = element ? this.selectionFromElement(element) : hit ? this.selectionFromFeature(hit.entry, hit.feature) : this.selected;
      if (isSheetSelection(selection)) this.callbacks.onOpenPage?.(selection);
      else if (selection?.netUid) this.callbacks.onHighlightNet?.(selection.netUid, selection);
      else if (!hit && entry?.page) this.callbacks.onOpenPage?.({ kind: "page", pageId: entry.page.id, page: entry.page });
    };
    target.onwheel = (event) => {
      event.preventDefault();
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY) * 0.65) {
        worldRenderer.pan(-event.deltaX, -event.deltaY);
      } else {
        worldRenderer.zoom(event.deltaY, event.clientX, event.clientY);
      }
    };
  }

  async focusPage(page, options = {}) {
    if (!page) return false;
    if (this.activePage?.id === page.id && this.active) {
      if (options.frame !== false) this.fitPage();
      return true;
    }

    const started = performance.now();
    const imported = await this.loadImportedSvg(page);
    if (!imported) return false;

    const container = document.createElement("div");
    container.className = "svg-dom-page";
    container.append(imported);

    this.host.replaceChildren(container);
    this.host.hidden = false;
    this.container = container;
    this.svg = imported;
    this.activePage = page;
    this.activeSvgUrl = new URL(page.svg || page.thumbnail?.path, this.manifestUrl).toString();
    this.overlay = createOverlay(imported);
    this.selectionOverlay = createSelectionOverlay(imported);
    this.index = buildDomIndex(imported, page, this.featuresByPage[page.id] || []);
    this.installPageHandlers();
    this.fitPage();
    this.setSelection(this.selected);
    this.setHighlightedNet(this.highlightedNetUid);
    this.lastStats = {
      ...this.lastStats,
      mountedPages: 1,
      domNodes: imported.querySelectorAll("*").length,
      indexedFeatures: this.index.featureToElements.size,
      indexedNets: this.index.netToElements.size,
      mountMs: performance.now() - started,
      fallbackReason: "",
    };
    this.updateCacheStats();
    return true;
  }

  installPageHandlers() {
    const target = this.host;
    target.oncontextmenu = (event) => event.preventDefault();
    target.onpointerdown = (event) => {
      if (!this.active) return;
      const allowTextSelection = event.button === 0 && !event.shiftKey && Boolean(event.target.closest?.("text"));
      const featureElement = event.target.closest?.("[data-feature-key]");
      const fallbackFeature = featureElement ? null : this.featureAtEvent(event);
      this.drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        button: event.button,
        moved: false,
        pan: !allowTextSelection && (event.button === 0 || event.button === 1 || event.shiftKey),
        featureElement,
        allowTextSelection,
      };
      if (!allowTextSelection) target.setPointerCapture(event.pointerId);
    };
    target.onpointermove = (event) => {
      if (!this.drag || this.drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - this.drag.lastX;
      const dy = event.clientY - this.drag.lastY;
      this.drag.lastX = event.clientX;
      this.drag.lastY = event.clientY;
      if (Math.hypot(event.clientX - this.drag.startX, event.clientY - this.drag.startY) > 3) {
        this.drag.moved = true;
      }
      if (this.drag.pan) {
        this.view.tx += dx;
        this.view.ty += dy;
        this.applyTransform();
      }
    };
    target.onpointerup = (event) => {
      if (!this.drag || this.drag.pointerId !== event.pointerId) return;
      const drag = this.drag;
      this.drag = null;
      if (!drag.allowTextSelection) target.releasePointerCapture(event.pointerId);
      if (drag.button !== 0) return;
      if (drag.moved) return;
      const element = event.target.closest?.("[data-feature-key]");
      if (element) this.selectElement(element, event);
      else {
        const hit = this.featureAtEvent(event);
        if (hit) this.selectFeature(hit.entry, hit.feature, event);
        else this.callbacks.onBlank?.();
      }
    };
    target.ondblclick = (event) => {
      const element = event.target.closest?.("[data-feature-key]");
      const hit = element ? null : this.featureAtEvent(event);
      const selection = element ? this.selectionFromElement(element) : hit ? this.selectionFromFeature(hit.entry, hit.feature) : this.selected;
      if (isSheetSelection(selection)) this.callbacks.onOpenPage?.(selection);
      else if (selection?.netUid) this.callbacks.onHighlightNet?.(selection.netUid, selection);
      else if (!hit && this.activePage) this.callbacks.onOpenPage?.({ kind: "page", pageId: this.activePage.id, page: this.activePage });
    };
    target.onwheel = (event) => {
      event.preventDefault();
      if (!this.active) return;
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY) * 0.65) {
        this.view.tx -= event.deltaX;
        this.view.ty -= event.deltaY;
        this.applyTransform();
        return;
      }
      const rect = this.host.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      const before = this.screenToSvg(localX, localY);
      const factor = Math.exp(-event.deltaY * 0.0016);
      this.view.scale = clamp(this.view.scale * factor, 0.02, 80);
      this.view.tx = localX - before[0] * this.view.scale;
      this.view.ty = localY - before[1] * this.view.scale;
      this.applyTransform();
    };
  }

  selectElement(element, event) {
    const started = performance.now();
    const selection = this.selectionFromElement(element);
    this.setSelection(selection);
    if (event) {
      const rect = this.host.getBoundingClientRect();
      selection.anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }
    this.callbacks.onSelect?.(selection);
    this.lastStats.selectionMs = performance.now() - started;
  }

  selectFeature(entry, feature, event) {
    const started = performance.now();
    const selection = this.selectionFromFeature(entry, feature);
    this.setSelection(selection);
    if (event) {
      const rect = this.host.getBoundingClientRect();
      selection.anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }
    this.callbacks.onSelect?.(selection);
    this.lastStats.selectionMs = performance.now() - started;
  }

  selectionFromElement(element) {
    const featureKey = element.dataset.featureKey || "";
    const entry = this.entryForElement(element);
    const feature = entry.index.featureByKey.get(featureKey) || {};
    return this.selectionFromFeature(entry, feature, element);
  }

  selectionFromFeature(entry, feature, element = null) {
    const featureKey = feature?.stableKey || element?.dataset?.featureKey || "";
    const page = entry?.page || this.activePage;
    const kind = feature?.kind || element?.dataset?.role || element?.dataset?.primitive || "feature";
    const netUid = feature?.netUid || element?.dataset?.netUid || "";
    const netName = feature?.netName || element?.dataset?.netName || "";
    if (kind === "sheet") {
      return {
        kind: "sheet",
        featureKey,
        sheetInstancePath: feature?.sheetInstancePath || page?.sheetInstancePath || "",
        sourceId: feature?.sourceId || element?.dataset?.sourceId || element?.dataset?.objectId || element?.dataset?.uuid || "",
        sheetName: feature?.sheet_name || feature?.sheetName || element?.dataset?.sheetName || feature?.objectId || "",
        sheetFile: feature?.sheet_file || feature?.sheetFile || element?.dataset?.sheetFile || "",
        feature,
      };
    }
    if (kind === "pin" || kind === "pin_body" || kind === "pin_name" || kind === "pin_number" || element?.dataset?.pin) {
      return {
        kind: "pin",
        featureKey,
        sheetInstancePath: feature?.sheetInstancePath || page?.sheetInstancePath || "",
        sourceId: feature?.sourceId || element?.dataset?.sourceId || element?.dataset?.objectId || element?.dataset?.uuid || "",
        symbolUuid: feature?.symbolUuid || element?.dataset?.symbolUuid || "",
        reference: feature?.reference || element?.dataset?.designator || element?.dataset?.component || element?.dataset?.ref || "",
        pinNumber: feature?.pinNumber || element?.dataset?.pin || "",
        pinName: feature?.pinName || "",
        netUid,
        netName,
        feature,
      };
    }
    if (kind === "symbol_body" || kind === "symbol_instance" || kind === "component" || element?.dataset?.ref) {
      return {
        kind: "component",
        featureKey,
        sheetInstancePath: feature?.sheetInstancePath || page?.sheetInstancePath || "",
        sourceId: feature?.sourceId || element?.dataset?.sourceId || element?.dataset?.objectId || element?.dataset?.uuid || "",
        symbolUuid: feature?.symbolUuid || element?.dataset?.symbolUuid || "",
        reference: feature?.reference || element?.dataset?.designator || element?.dataset?.component || element?.dataset?.ref || "",
        netUid,
        netName,
        feature,
      };
    }
    return {
      kind: netUid ? "feature" : kind,
      featureKey,
      sheetInstancePath: feature?.sheetInstancePath || page?.sheetInstancePath || "",
      sourceId: feature?.sourceId || element?.dataset?.sourceId || element?.dataset?.objectId || element?.dataset?.uuid || "",
      role: kind,
      netUid,
      netName,
      feature,
    };
  }

  setSelection(selection) {
    this.selected = selection || null;
    for (const element of this.host.querySelectorAll(".prism-svg-selected")) {
      element.classList.remove("prism-svg-selected");
    }
    for (const overlay of this.host.querySelectorAll("[data-prism-overlay='selection']")) {
      overlay.replaceChildren();
    }
    const featureKey = selection?.featureKey || "";
    if (!featureKey) return;
    for (const entry of this.entries()) {
      for (const element of entry.index.featureToElements.get(featureKey) || []) {
        element.classList.add("prism-svg-selected");
      }
      this.drawSelectionOverlay(entry, selection);
    }
    for (const element of this.index.featureToElements.get(featureKey) || []) {
      element.classList.add("prism-svg-selected");
    }
    this.drawSelectionOverlay({ page: this.activePage, index: this.index, selectionOverlay: this.selectionOverlay }, selection);
  }

  setHighlightedNet(netUid) {
    this.highlightedNetUid = netUid || "";
    const started = performance.now();
    for (const entry of this.entries()) this.updateEntryHighlight(entry);
    if (!this.svg || !this.overlay) {
      this.lastStats.highlightMs = performance.now() - started;
      return;
    }
    this.updateEntryHighlight({ svg: this.svg, overlay: this.overlay, index: this.index, page: this.activePage });
    this.lastStats.highlightMs = performance.now() - started;
  }

  updateEntryHighlight(entry) {
    if (!entry?.svg || !entry?.overlay) return;
    entry.overlay.replaceChildren();
    if (!this.highlightedNetUid) {
      return;
    }
    const viewBox = svgViewBox(entry.svg, entry.page);
    const dimmer = document.createElementNS(SVG_NS, "rect");
    dimmer.setAttribute("x", String(viewBox[0]));
    dimmer.setAttribute("y", String(viewBox[1]));
    dimmer.setAttribute("width", String(viewBox[2]));
    dimmer.setAttribute("height", String(viewBox[3]));
    dimmer.setAttribute("class", "prism-svg-net-dimmer");
    entry.overlay.append(dimmer);

    const elements = entry.index.netToElements.get(this.highlightedNetUid) || [];
    const limited = elements.slice(0, 2200);
    for (const element of limited) {
      const overlayElement = overlayClone(element);
      entry.overlay.append(overlayElement);
    }
  }

  entries() {
    return [...this.mountedPages.values()];
  }

  entryForElement(element) {
    const container = element.closest?.(".svg-dom-page");
    const pageId = container?.dataset.pageId || "";
    return this.mountedPages.get(pageId) || {
      page: this.activePage,
      index: this.index,
      svg: this.svg,
      overlay: this.overlay,
      selectionOverlay: this.selectionOverlay,
    };
  }

  featureAtEvent(event) {
    const entry = this.entryForPoint(event.clientX, event.clientY);
    if (!entry) return null;
    const point = this.clientToSvg(entry, event.clientX, event.clientY);
    if (!point) return null;
    const tolerance = Math.max(0.18, 5 * svgUnitsPerCssPixel(entry));
    const candidates = entry.index.features
      .filter((feature) => (feature?.domBoundsMm || feature?.boundsMm) && isSelectableFeature(feature))
      .filter((feature) =>
        point[0] >= (feature.domBoundsMm || feature.boundsMm)[0] - tolerance
        && point[0] <= (feature.domBoundsMm || feature.boundsMm)[2] + tolerance
        && point[1] >= (feature.domBoundsMm || feature.boundsMm)[1] - tolerance
        && point[1] <= (feature.domBoundsMm || feature.boundsMm)[3] + tolerance)
      .map((feature) => ({
        feature,
        priority: featurePriority(feature),
        area: Math.max(
          0.0001,
          ((feature.domBoundsMm || feature.boundsMm)[2] - (feature.domBoundsMm || feature.boundsMm)[0])
          * ((feature.domBoundsMm || feature.boundsMm)[3] - (feature.domBoundsMm || feature.boundsMm)[1]),
        ),
      }))
      .sort((a, b) => b.priority - a.priority || a.area - b.area);
    const feature = candidates[0]?.feature;
    return feature ? { entry, feature, point } : null;
  }

  entryForPoint(clientX, clientY) {
    for (const entry of [...this.entries()].reverse()) {
      const rect = entry.container.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) return entry;
    }
    if (this.container) {
      const rect = this.container.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        return { page: this.activePage, container: this.container, svg: this.svg, index: this.index, selectionOverlay: this.selectionOverlay };
      }
    }
    return null;
  }

  clientToSvg(entry, clientX, clientY) {
    if (!entry?.container || !entry?.svg || !entry?.page) return null;
    const rect = entry.container.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const viewBox = svgViewBox(entry.svg, entry.page);
    return [
      viewBox[0] + ((clientX - rect.left) / rect.width) * viewBox[2],
      viewBox[1] + ((clientY - rect.top) / rect.height) * viewBox[3],
    ];
  }

  drawSelectionOverlay(entry, selection) {
    if (!entry?.selectionOverlay || !selection?.featureKey) return;
    const feature = entry.index.featureByKey.get(selection.featureKey);
    const bounds = feature?.domBoundsMm || feature?.boundsMm;
    if (!bounds) return;
    const [x0, y0, x1, y1] = bounds;
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", String(x0));
    rect.setAttribute("y", String(y0));
    rect.setAttribute("width", String(Math.max(0.001, x1 - x0)));
    rect.setAttribute("height", String(Math.max(0.001, y1 - y0)));
    rect.setAttribute("rx", "0.65");
    rect.setAttribute("ry", "0.65");
    rect.setAttribute("class", "prism-svg-selection-box");
    entry.selectionOverlay.append(rect);
  }

  fitPage() {
    if (!this.svg || !this.activePage) return;
    const viewBox = svgViewBox(this.svg, this.activePage);
    const width = viewBox[2] || this.activePage.sourceWidthMm || this.activePage.widthMm || 1;
    const height = viewBox[3] || this.activePage.sourceHeightMm || this.activePage.heightMm || 1;
    const rect = this.host.getBoundingClientRect();
    const scale = Math.min(rect.width / width, rect.height / height) * 0.92;
    this.view.scale = clamp(scale, 0.02, 80);
    this.view.tx = (rect.width - width * this.view.scale) / 2 - viewBox[0] * this.view.scale;
    this.view.ty = (rect.height - height * this.view.scale) / 2 - viewBox[1] * this.view.scale;
    this.applyTransform();
  }

  frameSelection(selection = this.selected) {
    if (!selection?.featureKey || !this.active) {
      this.fitPage();
      return;
    }
    const elements = this.index.featureToElements.get(selection.featureKey) || [];
    const bounds = elementBounds(elements);
    if (!bounds) return;
    const rect = this.host.getBoundingClientRect();
    const width = Math.max(1, bounds[2] - bounds[0]);
    const height = Math.max(1, bounds[3] - bounds[1]);
    const scale = Math.min(rect.width / width, rect.height / height) * 0.36;
    this.view.scale = clamp(scale, 0.04, 80);
    this.view.tx = rect.width / 2 - ((bounds[0] + bounds[2]) / 2) * this.view.scale;
    this.view.ty = rect.height / 2 - ((bounds[1] + bounds[3]) / 2) * this.view.scale;
    this.applyTransform();
  }

  pan(dx, dy) {
    if (!this.active) return;
    this.view.tx += dx;
    this.view.ty += dy;
    this.applyTransform();
  }

  zoom(deltaY, clientX, clientY) {
    if (!this.active) return;
    const rect = this.host.getBoundingClientRect();
    const localX = (clientX ?? rect.left + rect.width / 2) - rect.left;
    const localY = (clientY ?? rect.top + rect.height / 2) - rect.top;
    const before = this.screenToSvg(localX, localY);
    const factor = Math.exp(-deltaY * 0.0016);
    this.view.scale = clamp(this.view.scale * factor, 0.02, 80);
    this.view.tx = localX - before[0] * this.view.scale;
    this.view.ty = localY - before[1] * this.view.scale;
    this.applyTransform();
  }

  screenToSvg(x, y) {
    return [
      (x - this.view.tx) / Math.max(1e-6, this.view.scale),
      (y - this.view.ty) / Math.max(1e-6, this.view.scale),
    ];
  }

  applyTransform() {
    if (!this.container) return;
    this.container.style.transform = `translate3d(${this.view.tx}px, ${this.view.ty}px, 0) scale(${this.view.scale})`;
  }

  hasCachedSvg(page) {
    const entry = this.svgCache.get(this.svgUrlForPage(page));
    return Boolean(entry?.template);
  }

  pruneMountedWorldPages(wanted = new Set()) {
    if (this.mountedPages.size <= this.maxMountedWorldPages) return;
    const candidates = [...this.mountedPages.entries()]
      .filter(([pageId]) => !wanted.has(pageId))
      .sort((a, b) => (a[1].lastUsed || 0) - (b[1].lastUsed || 0));
    for (const [pageId, entry] of candidates) {
      if (this.mountedPages.size <= this.maxMountedWorldPages) break;
      entry.container.remove();
      this.mountedPages.delete(pageId);
    }
  }

  pruneSvgCache() {
    const entries = [...this.svgCache.entries()].filter(([, entry]) => entry?.template);
    if (entries.length <= this.maxCachedSvgPages) return;
    const mountedUrls = new Set([...this.mountedPages.values()].map((entry) => this.svgUrlForPage(entry.page)));
    if (this.activePage) mountedUrls.add(this.svgUrlForPage(this.activePage));
    const candidates = entries
      .filter(([url]) => !mountedUrls.has(url))
      .sort((a, b) => (a[1].lastUsed || 0) - (b[1].lastUsed || 0));
    for (const [url] of candidates) {
      if ([...this.svgCache.values()].filter((entry) => entry?.template).length <= this.maxCachedSvgPages) break;
      this.svgCache.delete(url);
    }
  }

  updateCacheStats() {
    const cached = [...this.svgCache.values()].filter((entry) => entry?.template);
    this.lastStats.cachedSvgPages = cached.length;
    this.lastStats.cachedSvgBytes = cached.reduce((total, entry) => total + (entry.byteLength || 0), 0);
    const memory = performance?.memory;
    this.lastStats.heapMb = memory?.usedJSHeapSize ? memory.usedJSHeapSize / 1048576 : null;
  }
}

export function sanitizeSvgDocument(document, svgUrl, pageId) {
  for (const element of [...document.querySelectorAll("*")]) {
    if (UNSAFE_TAGS.has(element.localName.toLowerCase())) {
      element.remove();
      continue;
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name;
      const lower = name.toLowerCase();
      const value = attribute.value || "";
      if (lower.startsWith("on")) {
        element.removeAttribute(name);
        continue;
      }
      if ((lower === "href" || lower === "xlink:href" || lower === "src") && isUnsafeUrl(value)) {
        if ((lower === "href" || lower === "xlink:href") && element.localName.toLowerCase() === "image" && isSafeImageDataUrl(value)) {
          continue;
        }
        element.removeAttribute(name);
        continue;
      }
      if (lower === "style") {
        element.setAttribute(name, stripUnsafeCssUrls(value));
      }
    }
  }

  const prefix = `prism-${slug(pageId)}-`;
  const idMap = new Map();
  for (const element of document.querySelectorAll("[id]")) {
    const oldId = element.getAttribute("id");
    const newId = `${prefix}${slug(oldId)}`;
    idMap.set(oldId, newId);
    element.setAttribute("id", newId);
  }

  for (const element of document.querySelectorAll("*")) {
    for (const attribute of [...element.attributes]) {
      const lower = attribute.name.toLowerCase();
      let value = attribute.value || "";
      if (ID_REF_ATTRIBUTES.has(lower)) {
        if (value.startsWith("#") && idMap.has(value.slice(1))) {
          value = `#${idMap.get(value.slice(1))}`;
        } else if (isRelativeResourceUrl(value)) {
          value = new URL(value, svgUrl).toString();
        }
      }
      value = rewriteLocalRefs(value, idMap);
      element.setAttribute(attribute.name, value);
    }
  }
}

function buildDomIndex(svg, page, features) {
  const bySource = new Map();
  const byStableKey = new Map();
  const byId = new Map();
  const normalizedFeatures = [];
  for (const feature of features) {
    const normalized = normalizeFeature(feature, page);
    normalizedFeatures.push(normalized);
    byStableKey.set(normalized.stableKey, normalized);
    byId.set(Number(normalized.id || 0), normalized);
    for (const key of sourceKeys(normalized)) {
      if (!bySource.has(key)) bySource.set(key, []);
      bySource.get(key).push(normalized);
    }
  }

  const featureToElements = new Map();
  const netToElements = new Map();
  const featureByKey = new Map();
  for (const feature of normalizedFeatures) {
    featureByKey.set(feature.stableKey, feature);
  }
  for (const element of svg.querySelectorAll("[data-uuid], [data-element-key], [data-primitive], [data-ref], [data-pin], [data-object-id], [data-designator], [data-component]")) {
    const feature = matchFeature(element, bySource, page);
    if (feature && !isSelectableFeature(feature)) continue;
    if (!feature && !isSelectableElement(element)) continue;
    const fallbackKey = stableFallbackKey(element, page);
    const stableKey = feature?.stableKey || fallbackKey;
    const netUid = feature?.netUid || "";
    const netName = feature?.netName || "";
    element.classList.add("prism-feature");
    element.dataset.featureKey = stableKey;
    element.dataset.sourceId = feature?.sourceId || element.dataset.uuid || element.dataset.elementKey || "";
    element.dataset.role = feature?.kind || element.dataset.primitive || element.dataset.ref || "feature";
    if (feature?.id) element.dataset.featureId = String(feature.id);
    if (netUid) element.dataset.netUid = netUid;
    if (netName) element.dataset.netName = netName;
    if (!element.id) element.id = `prism-feature-${slug(stableKey)}`;
    addToMap(featureToElements, stableKey, element);
    featureByKey.set(stableKey, feature || {
      id: 0,
      stableKey,
      kind: element.dataset.role,
      sourceId: element.dataset.sourceId,
      sheetInstancePath: page.sheetInstancePath || "",
    });
    if (netUid) addToMap(netToElements, netUid, element);
  }
  for (const [stableKey, elements] of featureToElements) {
    const feature = featureByKey.get(stableKey);
    const bounds = elementBounds(elements);
    if (feature && bounds) feature.domBoundsMm = mergeBounds(feature.boundsMm, bounds);
  }
  return { featureToElements, netToElements, featureByKey, byId, bySource, features: normalizedFeatures };
}

function matchFeature(element, bySource, page) {
  const keys = [
    element.dataset.uuid,
    element.dataset.elementKey,
    element.dataset.sourceId,
    element.dataset.objectId,
    element.dataset.componentUid,
    element.dataset.componentUuid,
    element.dataset.ref && `${element.dataset.ref}:${element.dataset.pin || ""}`,
  ].filter(Boolean);
  const candidates = keys.flatMap((key) => bySource.get(key) || []);
  if (!candidates.length) return null;
  const role = String(element.dataset.primitive || element.dataset.ref || element.dataset.pin || "").toLowerCase();
  return candidates
    .map((feature) => ({ feature, score: featureMatchScore(feature, role, page) }))
    .sort((a, b) => b.score - a.score)[0].feature;
}

function featureMatchScore(feature, role, page) {
  let score = 0;
  const kind = String(feature.kind || "").toLowerCase();
  if (feature.sheetInstancePath === page.sheetInstancePath) score += 20;
  if (feature.netUid) score += 4;
  if (role && kind.includes(role)) score += 8;
  if (role === "symbol" && kind === "symbol_body") score += 12;
  if ((role === "label" || role === "port") && (kind.includes("label") || kind.includes("port"))) score += 12;
  if (role === "sheet" && kind === "sheet") score += 12;
  if (kind !== "record") score += 2;
  if (kind.includes("pin")) score += 2;
  return score;
}

function normalizeFeature(feature, page) {
  const sourceId = feature.sourceId || feature.sourceUid || feature.uuid || feature.objectId || feature.stableKey || "";
  return {
    ...feature,
    id: Number(feature.id || 0),
    sourceId,
    stableKey: feature.stableKey || `${page.sheetInstancePath || page.id}|${sourceId}|0|${feature.kind || "feature"}|0`,
    sheetInstancePath: feature.sheetInstancePath || page.sheetInstancePath || "",
  };
}

function sourceKeys(feature) {
  const keys = new Set([
    feature.sourceId,
    feature.sourceUid,
    feature.uuid,
    feature.objectId,
    feature.stableKey,
  ].filter(Boolean).map(String));
  if (feature.reference && feature.pinNumber) keys.add(`${feature.reference}:${feature.pinNumber}`);
  if (feature.componentDesignator) keys.add(feature.componentDesignator);
  if (feature.reference) keys.add(feature.reference);
  return [...keys];
}

function stableFallbackKey(element, page) {
  const source = element.dataset.uuid || element.dataset.elementKey || element.dataset.objectId || element.dataset.ref || element.id || "svg";
  const role = element.dataset.primitive || element.dataset.role || element.localName || "feature";
  return `${page.sheetInstancePath || page.id}|${source}|0|${role}|0`;
}

function ensureSvgStyle(svg) {
  const style = document.createElementNS(SVG_NS, "style");
  style.textContent = `
    .prism-feature { cursor: pointer; }
    .prism-svg-selected { outline: none; filter: drop-shadow(0 0 2.4px rgba(59,130,246,0.98)); }
    .prism-svg-selection-box {
      fill: rgba(59, 130, 246, 0.12);
      stroke: #3b82f6;
      stroke-width: 0.38mm;
      stroke-dasharray: 1.4 0.7;
      vector-effect: non-scaling-stroke;
      pointer-events: none;
    }
    .prism-svg-net-dimmer { fill: rgba(10, 14, 22, 0.055); pointer-events: none; }
    .prism-svg-net-overlay { pointer-events: none; }
    .prism-svg-net-overlay * {
      stroke: #18ef52 !important;
      fill: none !important;
      stroke-width: 0.34mm !important;
      vector-effect: non-scaling-stroke;
      opacity: 0.98;
    }
  `;
  svg.prepend(style);
}

function createOverlay(svg) {
  const overlay = document.createElementNS(SVG_NS, "g");
  overlay.setAttribute("class", "prism-svg-net-overlay");
  overlay.setAttribute("data-prism-overlay", "net-highlight");
  svg.append(overlay);
  return overlay;
}

function createSelectionOverlay(svg) {
  const overlay = document.createElementNS(SVG_NS, "g");
  overlay.setAttribute("class", "prism-svg-selection-overlay");
  overlay.setAttribute("data-prism-overlay", "selection");
  overlay.style.pointerEvents = "none";
  svg.append(overlay);
  return overlay;
}

function overlayClone(element) {
  const clone = element.cloneNode(true);
  clone.removeAttribute("id");
  clone.removeAttribute("data-feature-key");
  clone.removeAttribute("data-net-uid");
  clone.removeAttribute("data-net-name");
  clone.classList.add("prism-svg-net-overlay-clone");
  for (const node of [clone, ...Array.from(clone.querySelectorAll?.("*") || [])]) {
    if (node instanceof SVGElement) {
      node.removeAttribute("filter");
      node.style.pointerEvents = "none";
      node.style.stroke = "#18ef52";
      node.style.fill = "none";
      node.style.opacity = "0.98";
      node.style.vectorEffect = "non-scaling-stroke";
    }
  }
  return clone;
}

function elementBounds(elements) {
  let bounds = null;
  for (const element of elements) {
    if (!element.getBBox) continue;
    try {
      const box = element.getBBox();
      const next = [box.x, box.y, box.x + box.width, box.y + box.height];
      bounds = bounds
        ? [
          Math.min(bounds[0], next[0]),
          Math.min(bounds[1], next[1]),
          Math.max(bounds[2], next[2]),
          Math.max(bounds[3], next[3]),
        ]
        : next;
    } catch {
      // Detached or display:none nodes can throw; ignore them.
    }
  }
  return bounds;
}

function mergeBounds(a, b) {
  if (!a) return b;
  if (!b) return a;
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[2], b[2]),
    Math.max(a[3], b[3]),
  ];
}

function svgViewBox(svg, page) {
  const value = svg.getAttribute("viewBox");
  if (value) {
    const parts = value.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) return parts;
  }
  return [0, 0, page.sourceWidthMm || page.widthMm || 1, page.sourceHeightMm || page.heightMm || 1];
}

function emptyIndex() {
  return {
    featureToElements: new Map(),
    netToElements: new Map(),
    featureByKey: new Map(),
    byId: new Map(),
    bySource: new Map(),
    features: [],
  };
}

function svgUnitsPerCssPixel(entry) {
  const rect = entry?.container?.getBoundingClientRect?.();
  if (!entry?.svg || !entry?.page || !rect?.width || !rect?.height) return 0.1;
  const viewBox = svgViewBox(entry.svg, entry.page);
  return Math.max(viewBox[2] / rect.width, viewBox[3] / rect.height);
}

function isBackgroundFeature(feature) {
  const kind = String(feature?.kind || "").toLowerCase();
  const role = String(feature?.semanticRole || "").toLowerCase();
  const source = String(`${feature?.sourceId || ""} ${feature?.objectId || ""} ${feature?.text || ""}`).toLowerCase();
  return kind.includes("page")
    || role.includes("page")
    || kind.includes("background")
    || role.includes("background")
    || source.includes("background")
    || source.includes("sheet_header")
    || source.includes("sheet header")
    || source.includes("drawing-sheet");
}

function featurePriority(feature) {
  const kind = String(feature?.kind || feature?.semanticRole || "").toLowerCase();
  if (kind.includes("pin")) return 90;
  if (kind.includes("label") || kind.includes("port")) return 78;
  if (kind.includes("wire") || kind.includes("bus") || kind.includes("junction")) return 70;
  if (kind.includes("symbol") || kind.includes("component")) return 54;
  if (kind.includes("image")) return 30;
  return 20;
}

function isSelectableFeature(feature) {
  if (!feature || isBackgroundFeature(feature)) return false;
  const kind = String(feature.kind || feature.semanticRole || "").toLowerCase();
  return [
    "pin",
    "label",
    "port",
    "wire",
    "bus",
    "junction",
    "no_connect",
    "symbol",
    "component",
    "sheet",
    "image",
    "text",
  ].some((token) => kind.includes(token));
}

function isSelectableElement(element) {
  const role = String(`${element?.dataset?.primitive || ""} ${element?.dataset?.ref || ""} ${element?.dataset?.role || ""} ${element?.dataset?.objectId || ""} ${element?.dataset?.text || ""}`).toLowerCase();
  if (!role || role.includes("background") || role.includes("sheet_header") || role.includes("sheet header") || role.includes("drawing-sheet")) {
    return false;
  }
  return [
    "pin",
    "label",
    "port",
    "wire",
    "bus",
    "junction",
    "no_connect",
    "symbol",
    "component",
    "sheet",
    "image",
    "text",
  ].some((token) => role.includes(token));
}

function isSheetSelection(selection) {
  return String(selection?.kind || selection?.feature?.kind || "").toLowerCase() === "sheet";
}

function addToMap(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function isUnsafeUrl(value) {
  const clean = String(value || "").trim().toLowerCase();
  if (!clean || clean.startsWith("#")) return false;
  return clean.startsWith("javascript:") || clean.startsWith("data:") || clean.startsWith("http://") || clean.startsWith("https://");
}

function isSafeImageDataUrl(value) {
  return /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(String(value || "").trim());
}

function isRelativeResourceUrl(value) {
  const clean = String(value || "").trim();
  return clean && !clean.startsWith("#") && !/^[a-z][a-z0-9+.-]*:/i.test(clean);
}

function stripUnsafeCssUrls(value) {
  return String(value || "").replace(/url\(([^)]+)\)/gi, (match, raw) => {
    const clean = raw.trim().replace(/^['"]|['"]$/g, "");
    return isUnsafeUrl(clean) ? "none" : match;
  });
}

function rewriteLocalRefs(value, idMap) {
  let output = String(value || "");
  output = output.replace(/url\(#([^)]+)\)/g, (match, id) => idMap.has(id) ? `url(#${idMap.get(id)})` : match);
  output = output.replace(/^#(.+)$/, (match, id) => idMap.has(id) ? `#${idMap.get(id)}` : match);
  return output;
}

function slug(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "item";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export const __test__ = {
  isUnsafeUrl,
  isSafeImageDataUrl,
  rewriteLocalRefs,
  stableFallbackKey,
  normalizeFeature,
};
