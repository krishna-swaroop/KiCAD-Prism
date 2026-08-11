export class BomViewer {
  static async create(container, url, callbacks = {}) {
    const response = await fetch(url, { cache: "default" });
    if (!response.ok) throw new Error(`Failed to load BoM ${url}: ${response.status}`);
    const payload = await response.json();
    if (payload.schema !== "prism.bom_a0") {
      throw new Error(`Unsupported BoM schema: ${payload.schema || "missing"}`);
    }
    const viewer = new BomViewer(container, payload, callbacks);
    viewer.render();
    return viewer;
  }

  constructor(container, payload, callbacks) {
    this.container = container;
    this.payload = payload;
    this.callbacks = callbacks;
    this.query = "";
    this.selectedRowId = "";
    this.selectedReference = "";
    this.rowsById = new Map((payload.rows || []).map((row) => [row.id, row]));
    this.componentIndex = new Map(Object.entries(payload.componentIndex || {}));
  }

  setSelectionByReference(reference, options = {}) {
    const entry = this.componentIndex.get(reference);
    if (!entry) return;
    this.selectedReference = reference;
    this.selectedRowId = entry.rowId;
    this.renderContent();
    if (options.scroll) {
      this.container.querySelector(`[data-row-id="${cssEscape(entry.rowId)}"]`)?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    }
  }

  clearSelection() {
    this.selectedReference = "";
    this.selectedRowId = "";
    this.renderContent();
  }

  render() {
    const rows = this.filteredRows();
    this.container.innerHTML = `
      <section class="bom-workspace">
        <header class="bom-toolbar">
          <div>
            <p class="eyebrow">Prism BoM A0</p>
            <h2>Bill of Materials</h2>
            <span data-bom-count>${rows.length} of ${(this.payload.rows || []).length} grouped rows · ${(this.payload.components || []).length} components</span>
          </div>
          <label class="bom-search">
            <span>Search</span>
            <input id="bom-search" type="search" value="${escapeHtml(this.query)}" placeholder="Reference, value, footprint, manufacturer..." />
          </label>
        </header>
        <div class="bom-content" data-bom-content>
          ${this.contentHtml(rows, this.payload.displayColumns || [])}
        </div>
      </section>
    `;
    this.bind();
  }

  renderContent() {
    const content = this.container.querySelector("[data-bom-content]");
    if (!content) {
      this.render();
      return;
    }
    const rows = this.filteredRows();
    content.innerHTML = this.contentHtml(rows, this.payload.displayColumns || []);
    const count = this.container.querySelector("[data-bom-count]");
    if (count) {
      count.textContent = `${rows.length} of ${(this.payload.rows || []).length} grouped rows · ${(this.payload.components || []).length} components`;
    }
    this.bindContent(content);
  }

  contentHtml(rows, columns) {
    const selected = this.rowsById.get(this.selectedRowId);
    return `
      <div class="bom-table-wrap">
        <table class="bom-table">
          <thead>
            <tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rows.map((row) => this.rowHtml(row, columns)).join("")}
          </tbody>
        </table>
      </div>
      ${selected ? `<aside class="bom-detail">${this.detailHtml(selected)}</aside>` : ""}
    `;
  }

  filteredRows() {
    const value = this.query.trim().toLowerCase();
    const rows = this.payload.rows || [];
    if (!value) return rows;
    return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(value));
  }

  rowHtml(row, columns) {
    const selected = row.id === this.selectedRowId;
    return `
      <tr class="${selected ? "selected" : ""}" data-row-id="${escapeHtml(row.id)}">
        ${columns.map((column) => {
          const value = row.fields?.[column] || "";
          if (column === "Reference") {
            return `<td class="bom-reference-cell">${(row.references || []).map((reference) => `
              <button class="bom-ref-chip ${reference === this.selectedReference ? "active" : ""}" data-reference="${escapeHtml(reference)}">${escapeHtml(reference)}</button>
            `).join("")}</td>`;
          }
          if (!value && importantColumn(column)) return `<td><span class="bom-missing">Missing</span></td>`;
          return `<td title="${escapeHtml(value)}">${escapeHtml(value)}</td>`;
        }).join("")}
      </tr>
    `;
  }

  detailHtml(row) {
    const fields = normalizedDetailFields(row, this.payload.displayColumns || [], this.payload.extraColumns || []);
    return `
      <div class="bom-detail-head">
        <p class="eyebrow">Line item</p>
        <h3>${escapeHtml((row.references || []).join(", "))}</h3>
        <span>${row.qty} component${row.qty === 1 ? "" : "s"}${row.dnp ? " · DNP" : ""}</span>
      </div>
      <div class="bom-ref-list">
        ${(row.references || []).map((reference) => `
          <button class="bom-ref-chip detail ${reference === this.selectedReference ? "active" : ""}" data-reference="${escapeHtml(reference)}">${escapeHtml(reference)}</button>
        `).join("")}
      </div>
      <dl class="bom-field-list">
        ${fields.map(([name, value]) => `
          <div>
            <dt>${escapeHtml(name)}</dt>
            <dd>${escapeHtml(value)}</dd>
          </div>
        `).join("")}
      </dl>
    `;
  }

  bind() {
    const search = this.container.querySelector("#bom-search");
    search?.addEventListener("input", () => {
      this.query = search.value;
      this.renderContent();
    });
    this.bindContent(this.container);
  }

  bindContent(root) {
    root.querySelectorAll("[data-row-id]").forEach((row) => {
      row.addEventListener("click", (event) => {
        if (event.target.closest("[data-reference]")) return;
        this.selectedRowId = row.dataset.rowId;
        this.selectedReference = "";
        this.renderContent();
      });
    });
    root.querySelectorAll("[data-reference]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const reference = button.dataset.reference;
        this.setSelectionByReference(reference);
        this.callbacks.onSelectReference?.(reference);
      });
    });
  }
}

function normalizedDetailFields(row, displayColumns, extraColumns) {
  const result = [];
  const seen = new Set(["Reference", "Qty"].map(normalizeName));
  for (const column of displayColumns) {
    if (column === "Reference" || column === "Qty") continue;
    const value = row.fields?.[column] || "";
    if (!value) continue;
    result.push([column, value]);
    seen.add(normalizeName(column));
  }

  const raw = row.canonicalFields || {};
  for (const name of extraColumns) {
    const value = raw[name] || "";
    if (!value) continue;
    const normalized = normalizeName(name);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push([name, value]);
  }
  return result;
}

function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[\s_\-()[\]/]+/g, "");
}

function importantColumn(column) {
  return [
    "Manufacturer Part Number",
    "Vendor Part Number",
    "Datasheet",
    "Footprint",
    "Value",
  ].includes(column);
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
  );
}

function cssEscape(value) {
  return String(value).replace(/["\\]/g, "\\$&");
}
