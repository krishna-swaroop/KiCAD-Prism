var tc=`:host,
:root {
  color-scheme: dark;
  --shell: var(--prism-shell, #09090b);
  --panel: var(--prism-panel, #09090b);
  --panel-raised: var(--prism-panel-raised, #18181b);
  --control: var(--prism-control, #18181b);
  --control-hover: var(--prism-control-hover, #27272a);
  --foreground: var(--prism-foreground, #fafafa);
  --muted: var(--prism-muted, #a1a1aa);
  --border: var(--prism-border, #27272a);
  --primary: var(--prism-primary, #3b82f6);
  --primary-foreground: var(--prism-primary-foreground, var(--panel));
  --surface: var(--prism-shell, #09090b);
  --stackup-via-thru: color-mix(in srgb, var(--primary) 34%, var(--foreground));
  --stackup-via-blind: var(--primary);
  --stackup-via-buried: color-mix(in srgb, var(--primary) 58%, var(--muted));
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

:host {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--shell);
  color: var(--foreground);
}

html,
body {
  width: 100%;
  height: 100%;
  min-height: 0;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  overflow: hidden;
  background: var(--shell);
  color: var(--foreground);
}

button,
input {
  font: inherit;
}

#app {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) 376px;
  height: 100%;
  min-height: 0;
  background: var(--shell);
  color: var(--foreground);
  transition: grid-template-columns 180ms ease;
}

#app.panel-collapsed {
  grid-template-columns: 48px minmax(0, 1fr) 46px;
}

.workspace-rail {
  position: relative;
  z-index: 8;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border);
  background: var(--panel);
}

.workspace-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 132px;
  padding: 0;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 11px;
  font-weight: 700;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
}

.workspace-tab:hover {
  background: var(--control);
  color: var(--foreground);
}

.workspace-tab.active {
  box-shadow: inset -2px 0 var(--primary);
  background: var(--panel-raised);
  color: var(--foreground);
}

.viewport-shell {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--surface);
}

#viewport {
  display: block;
  width: 100%;
  height: 100%;
}

#schematic-viewport {
  display: block;
  width: 100%;
  height: 100%;
  background: #0b0e13;
}

#schematic-dom-layer {
  position: absolute;
  inset: 0;
  z-index: 2;
  overflow: hidden;
  background: transparent;
  touch-action: none;
}

#schematic-flow-overlay {
  position: absolute;
  inset: 0;
  z-index: 3;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.svg-dom-page {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
  will-change: transform;
}

.svg-dom-page-svg {
  display: block;
  overflow: visible;
  background: #f4f1e7;
  box-shadow: 0 18px 58px rgba(0, 0, 0, 0.22);
}

.svg-dom-world-page {
  overflow: hidden;
  pointer-events: auto;
}

.svg-dom-world-page .svg-dom-page-svg {
  width: 100%;
  height: 100%;
  overflow: hidden;
  box-shadow: none;
}

#viewport[hidden],
#schematic-viewport[hidden],
#schematic-dom-layer[hidden],
#schematic-flow-overlay[hidden],
#bom-view[hidden] {
  display: none;
}

#bom-view {
  position: absolute;
  inset: 0;
  z-index: 2;
  overflow: hidden;
  background: var(--shell);
  color: var(--foreground);
}

.bom-workspace {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: 100%;
  min-height: 0;
}

.bom-toolbar {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 18px;
  padding: 18px 22px 14px;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--panel) 88%, transparent);
  backdrop-filter: blur(14px);
}

.bom-toolbar h2 {
  margin: 2px 0 1px;
  color: var(--foreground);
  font-size: 20px;
  letter-spacing: 0;
}

.bom-toolbar span,
.bom-search span {
  color: var(--muted);
  font-size: 12px;
  font-weight: 650;
}

.bom-search {
  display: grid;
  gap: 6px;
  min-width: min(420px, 46vw);
}

.bom-search input {
  min-height: 38px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--control);
  color: var(--foreground);
  padding: 0 11px;
  outline: none;
}

.bom-search input:focus {
  border-color: rgba(59, 130, 246, 0.7);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.13);
}

.bom-content {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 24vw);
  min-height: 0;
}

.bom-content:not(:has(.bom-detail)) {
  grid-template-columns: minmax(0, 1fr);
}

.bom-table-wrap {
  min-width: 0;
  overflow: auto;
}

.bom-table {
  width: 100%;
  min-width: 1680px;
  border-collapse: separate;
  border-spacing: 0;
  color: var(--foreground);
  font-size: 12px;
}

.bom-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  border-bottom: 1px solid var(--border);
  background: var(--panel-raised);
  color: var(--muted);
  padding: 9px 10px;
  text-align: left;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.bom-table td {
  max-width: 220px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  padding: 9px 10px;
  vertical-align: top;
  white-space: normal;
  overflow-wrap: anywhere;
}

.bom-table tr {
  cursor: pointer;
}

.bom-table tr:hover td {
  background: color-mix(in srgb, var(--primary) 8%, transparent);
}

.bom-table tr.selected td {
  background: color-mix(in srgb, var(--primary) 15%, transparent);
}

.bom-reference-cell {
  min-width: 180px;
}

.bom-ref-chip {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  margin: 0 4px 4px 0;
  border: 1px solid color-mix(in srgb, var(--primary) 42%, var(--border));
  border-radius: 4px;
  background: color-mix(in srgb, var(--primary) 9%, var(--control));
  color: color-mix(in srgb, var(--primary) 45%, var(--foreground));
  padding: 2px 7px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 750;
}

.bom-ref-chip:hover,
.bom-ref-chip.active {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 24%, var(--control));
  color: var(--foreground);
}

.bom-ref-chip.detail {
  margin-bottom: 6px;
}

.bom-missing {
  color: #f59e0b;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.bom-detail {
  min-width: 0;
  overflow: auto;
  border-left: 1px solid var(--border);
  background: color-mix(in srgb, var(--panel-raised) 90%, transparent);
  padding: 18px;
}

.bom-detail-head {
  border-bottom: 1px solid var(--border);
  padding-bottom: 14px;
}

.bom-detail-head h3 {
  margin: 4px 0;
  color: var(--foreground);
  font-size: 18px;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.bom-detail-head span {
  color: var(--muted);
  font-size: 12px;
}

.bom-ref-list {
  padding: 14px 0 10px;
}

.bom-field-list {
  display: grid;
  gap: 9px;
  margin: 0;
}

.bom-field-list div {
  border-top: 1px solid color-mix(in srgb, var(--border) 74%, transparent);
  padding-top: 8px;
}

.bom-field-list dt {
  color: var(--muted);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.bom-field-list dd {
  margin: 3px 0 0;
  color: var(--foreground);
  overflow-wrap: anywhere;
}

.bom-empty {
  color: var(--muted);
  font-size: 13px;
}

#panel-labels {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

#panel-labels span {
  position: absolute;
  padding: 4px 8px;
  border: 1px solid rgba(26, 36, 51, 0.14);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
  color: #253047;
  font-size: 11px;
  font-weight: 650;
  backdrop-filter: blur(8px);
  transform: translate(10px, -50%);
  transition: left 60ms linear, top 60ms linear;
}

#axis-gizmo {
  position: absolute;
  left: calc(var(--prism-viewport-inset-left, 0px) + 14px);
  bottom: 14px;
  width: 104px;
  height: 104px;
  cursor: pointer;
  border: 0;
  background: transparent;
  filter: drop-shadow(0 4px 8px rgba(15, 23, 42, 0.18));
}

#selection-card {
  position: absolute;
  z-index: 4;
  width: min(360px, calc(100% - 32px));
  border: 1px solid var(--border);
  border-radius: 3px;
  background: color-mix(in srgb, var(--panel-raised) 96%, transparent);
  box-shadow: 0 22px 58px rgba(0, 0, 0, 0.34);
  color: var(--foreground);
  font-family: Inter, "SF Pro Text", "Segoe UI", ui-sans-serif, system-ui, sans-serif;
  font-feature-settings: "tnum" 1, "ss01" 1;
  backdrop-filter: blur(16px);
}

#selection-card[hidden] {
  display: none;
}

.selection-card-head {
  display: grid;
  grid-template-columns: 4px auto minmax(0, 1fr) 24px;
  min-height: 48px;
  border-bottom: 1px solid var(--border);
  align-items: center;
  cursor: grab;
  user-select: none;
}

.selection-card-head:active {
  cursor: grabbing;
}

.selection-card-drag-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  padding: 6px;
  margin-left: 2px;
}

.selection-card-drag-handle svg {
  opacity: 0.5;
  transition: opacity 120ms ease;
}

.selection-card-head:hover .selection-card-drag-handle svg {
  opacity: 0.8;
  color: var(--foreground);
}

.selection-card-accent {
  width: 4px;
  height: 100%;
  background: #18ef52;
  box-shadow: 3px 0 14px rgba(24, 239, 82, 0.24);
}

.selection-card-title {
  display: grid;
  align-content: center;
  gap: 1px;
  min-width: 0;
  padding: 6px 10px;
}

.selection-card-title small,
.selection-section-title {
  color: var(--muted);
  font-size: 9px;
  font-weight: 750;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.selection-card-title strong {
  overflow: hidden;
  font-size: 14px;
  font-weight: 670;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selection-card-close {
  width: 24px;
  height: 24px;
  margin: 6px 6px 0 0;
  padding: 0;
  border: 0;
  border-radius: 2px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
}

.selection-card-close:hover {
  background: var(--control-hover);
  color: var(--foreground);
}

.selection-properties {
  display: flex;
  flex-direction: row;
  border-bottom: 1px solid var(--border);
}

.selection-property {
  flex: 1;
  min-width: 0;
  padding: 8px 12px;
  border-right: 1px solid var(--border);
}

.selection-property:last-child {
  border-right: 0;
}

.selection-property small {
  display: block;
  margin-bottom: 2px;
  color: var(--muted);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.selection-property strong {
  display: block;
  overflow: hidden;
  color: var(--foreground);
  font-size: 11px;
  font-weight: 620;
  text-overflow: clip;
  white-space: normal;
  overflow-wrap: anywhere;
}

.selection-section {
  padding: 8px 12px;
}

.selection-section-title {
  display: block;
  margin-bottom: 5px;
}

.selection-table {
  max-height: 152px;
  overflow: auto;
  border: 1px solid var(--border);
  background: var(--panel);
}

.selection-row {
  display: grid;
  grid-template-columns: minmax(48px, 0.7fr) minmax(42px, 0.55fr) minmax(0, 1.4fr);
  min-height: 26px;
  border-bottom: 1px solid var(--border);
}

.selection-row:last-child {
  border-bottom: 0;
}

.selection-row > span {
  overflow: hidden;
  padding: 5px 8px;
  border-right: 1px solid var(--border);
  color: var(--muted);
  font-size: 10px;
  text-overflow: clip;
  white-space: normal;
  overflow-wrap: anywhere;
}

.selection-row > span:last-child {
  border-right: 0;
}

.selection-row strong {
  color: var(--foreground);
  font-weight: 680;
}

.selection-empty {
  padding: 10px;
  color: var(--muted);
  font-size: 10px;
}

.selection-card-actions {
  display: flex;
  justify-content: flex-end;
  padding: 6px 12px;
  border-top: 1px solid var(--border);
  background: var(--panel);
}

.selection-card-actions button {
  min-height: 26px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--control);
  color: var(--foreground);
  cursor: pointer;
  font-size: 10px;
  font-weight: 650;
}

.selection-card-actions button:hover {
  border-color: var(--primary);
  background: var(--control-hover);
}

/* Net Dashboard styles */
.selection-net-dashboard {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 12px;
}

.net-metric-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 5px;
}

.metric-card {
  display: flex;
  flex-direction: column;
  padding: 8px 10px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 3px;
}

.metric-card small {
  color: var(--muted);
  font-size: 8px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 2px;
}

.metric-card strong {
  font-size: 13px;
  color: var(--foreground);
  font-weight: 670;
}

.metric-card .unit {
  font-size: 9px;
  color: var(--muted);
  font-weight: normal;
}

.net-layers-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.layer-badge {
  font-size: 9px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 3px;
  background: var(--control-hover);
  color: var(--foreground);
  border: 1px solid var(--border);
}

.layer-badge.unknown {
  color: var(--muted);
  font-style: italic;
}

.pin-row-interactive {
  cursor: pointer;
  transition: background 100ms ease;
}

.pin-row-interactive:hover {
  background: color-mix(in srgb, var(--primary) 12%, transparent);
}

.refdes-col {
  color: var(--primary) !important;
}

.refdes-col:hover {
  text-decoration: underline;
}

.pin-col {
  font-weight: 600;
}

.compact-scroll::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

.compact-scroll::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 2px;
}

.compact-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--muted);
}

.selection-card-actions button {
  margin-left: 6px;
}

.selection-card-actions button.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

#fallback {
  position: absolute;
  inset: 16px;
  color: #171d28;
  font-size: 13px;
}

.panel {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  border-left: 1px solid var(--border);
  background: var(--panel);
}

.panel-rail {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  border-right: 1px solid var(--border);
  background: var(--panel);
}

.rail-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 94px;
  padding: 0;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: #718096;
  cursor: pointer;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  transition: color 120ms ease, background 120ms ease;
}

.rail-tab:hover {
  background: var(--control);
  color: var(--foreground);
}

.rail-tab.active {
  box-shadow: inset -2px 0 var(--primary);
  background: var(--panel-raised);
  color: var(--foreground);
}

.panel-drawer {
  min-width: 0;
  overflow: auto;
  padding: 18px;
  opacity: 1;
  transition: opacity 100ms ease;
}

.panel-collapsed .panel-drawer {
  visibility: hidden;
  padding: 0;
  opacity: 0;
}

.panel header {
  margin-bottom: 18px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}

.panel-mode-header {
  padding-top: 1px;
}

.eyebrow {
  margin: 0 0 5px;
  color: #60a5fa;
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

h1,
h2 {
  margin: 0;
  letter-spacing: 0;
}

h1 {
  overflow: hidden;
  font-size: 18px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

h2 {
  font-size: 13px;
  font-weight: 700;
}

#status {
  margin: 7px 0 0;
  color: var(--muted);
  font-size: 12px;
}

.tab-panel {
  display: none;
}

.tab-panel.active {
  display: block;
}

.section-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.section-heading span {
  color: var(--muted);
  font-size: 10px;
}

.mode-toolbar {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-raised);
}

.mode-toolbar button,
.layer-presets button,
.quick-actions button {
  min-width: 0;
  height: 32px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 120ms ease;
}

.mode-toolbar button:hover,
.layer-presets button:hover,
.quick-actions button:hover {
  background: var(--control-hover);
  color: var(--foreground);
}

.mode-toolbar button.active {
  background: var(--primary);
  border: 1px solid var(--primary);
  color: var(--primary-foreground);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--primary) 30%, transparent);
}

.quick-actions button.active {
  background: var(--control-hover);
  border: 1px solid var(--border);
  color: var(--foreground);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--shell) 60%, transparent);
}

.layer-presets,
.quick-actions {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  margin-top: 10px;
}

.layer-presets button,
.quick-actions button {
  border: 1px solid var(--border);
  background: var(--control);
  font-size: 11px;
}

.layer-list {
  display: grid;
  gap: 1px;
  margin-top: 12px;
}

.layer-row {
  display: grid;
  grid-template-columns: 16px 12px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  min-height: 31px;
  padding: 0 7px;
  border-radius: 4px;
  color: #d9e0ea;
  font-size: 12px;
}

.layer-row:hover {
  background: #111b2a;
}

.layer-row input,
.toggle-row input {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: var(--primary);
}

.layer-row small {
  color: #68758a;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.swatch {
  width: 11px;
  height: 11px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 2px;
}

.control-field {
  display: grid;
  gap: 7px;
  margin-top: 12px;
}

.control-field > span {
  color: var(--muted);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}

.layer-select {
  width: 100%;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 5px;
  outline: none;
  background: var(--control);
  color: var(--foreground);
  font-size: 12px;
}

.layer-select:focus {
  border-color: #3974be;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.13);
}

.search-results {
  display: grid;
  gap: 2px;
}

.search-results button {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  width: 100%;
  min-height: 32px;
  padding: 6px 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--foreground);
  text-align: left;
  cursor: pointer;
}

.search-results button:hover {
  background: var(--control);
}

.search-results span {
  overflow: hidden;
  color: var(--muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toggle-list {
  display: grid;
  gap: 2px;
  padding: 8px 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.toggle-row {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  min-height: 32px;
  color: #dce3ed;
  font-size: 12px;
}

.range-field {
  margin-top: 18px;
}

input[type="range"] {
  width: 100%;
  height: 4px;
  margin: 8px 0;
  accent-color: var(--primary);
}

pre {
  overflow: auto;
  max-height: calc(100vh - 170px);
  margin: 0;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: #070c14;
  color: #dbe4f0;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
}

#diagnostics {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px 14px;
  margin: 0;
  font-size: 11px;
}

#diagnostics dt {
  color: var(--muted);
}

#diagnostics dd {
  margin: 0;
  color: #dbe4f0;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

#schematic-labels {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
}

#schematic-labels[hidden] {
  display: none;
}

.schematic-page-label {
  position: absolute;
  display: grid;
  gap: 1px;
  min-width: 96px;
  max-width: 220px;
  padding: 5px 7px;
  border-left: 2px solid #4b8de8;
  background: rgba(8, 13, 22, 0.88);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.22);
  color: #edf3fb;
  font-size: 10px;
  transform: translateY(-100%);
  backdrop-filter: blur(8px);
}

.schematic-page-label strong {
  overflow: hidden;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.schematic-page-label small {
  color: #8f9caf;
  font-size: 8px;
}

.page-list {
  display: grid;
  gap: 2px;
  margin-top: 12px;
}

.page-row {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  min-height: 36px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 3px;
  background: transparent;
  color: #dce3ee;
  cursor: pointer;
  text-align: left;
}

.page-row:hover {
  border-color: #28364a;
  background: #111a28;
}

.page-row.active {
  border-color: #346db6;
  background: #14243c;
}

.page-row > span:first-child {
  color: #6f7d92;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.page-row strong {
  overflow: hidden;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.page-row small {
  color: #718096;
  font-size: 9px;
}

@media (max-width: 900px) {
  #app {
    grid-template-columns: 42px minmax(0, 1fr) 326px;
  }

  #app.panel-collapsed {
    grid-template-columns: 42px minmax(0, 1fr) 46px;
  }
}

/* Workspace specific panel rail controls */
.workspace-schematic [data-tab="view"] {
  display: none !important;
}

.workspace-schematic [data-tab="stackup"],
.workspace-bom [data-tab="stackup"] {
  display: none !important;
}

/* Stackup Workspace layout */
#app.workspace-stackup {
  grid-template-columns: 48px minmax(0, 1fr);
}

.workspace-stackup .panel {
  display: none !important;
}

#stackup-workspace-view {
  position: absolute;
  inset: 0;
  z-index: 2;
  overflow: hidden;
  background: var(--shell);
  color: var(--foreground);
  padding: clamp(20px, 3vw, 40px);
  display: flex;
  flex-direction: column;
  gap: 24px;
}

#stackup-workspace-view[hidden] {
  display: none !important;
}

.stackup-header {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--border);
}

.stackup-header-title {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stackup-header-title h1 {
  font-size: clamp(22px, 2vw, 30px);
  font-weight: 700;
  margin: 0;
  color: var(--foreground);
}

.stackup-header-title p {
  font-size: 13px;
  color: var(--muted);
  margin: 0;
}

.stackup-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.stackup-summary-card {
  background: color-mix(in srgb, var(--panel-raised) 54%, var(--panel));
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.stackup-summary-card label {
  font-size: 9px;
  color: var(--muted);
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.stackup-summary-card span {
  font-size: 16px;
  font-weight: 650;
  color: var(--foreground);
}

.stackup-workspace-body {
  display: grid;
  grid-template-columns: minmax(520px, 1fr) minmax(360px, 44vw);
  gap: 28px;
  align-items: stretch;
  flex: 1;
  min-height: 0;
}

.stackup-diagram-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  justify-content: flex-start;
  background: color-mix(in srgb, var(--panel-raised) 38%, var(--panel));
  border: 1px solid var(--border);
  border-radius: 6px;
  min-height: 0;
  height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 32px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.stackup-visual-svg {
  width: 96%;
  max-width: 720px;
  height: auto;
  flex: none;
  overflow: visible;
}

.stackup-side-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
  height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 4px;
}

.stackup-via-legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 14px;
  color: var(--muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.stackup-via-legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.stackup-via-legend i {
  width: 9px;
  height: 9px;
  border-radius: 2px;
  background: var(--stackup-via-thru);
}

.stackup-via-legend i[data-via-type="blind"] {
  background: var(--stackup-via-blind);
}

.stackup-via-legend i[data-via-type="buried"] {
  background: var(--stackup-via-buried);
}

.stackup-svg-layer {
  cursor: pointer;
  transition: opacity 120ms ease, filter 120ms ease;
}

.stackup-svg-column-headings text {
  fill: var(--muted);
  font-size: 8px;
  font-weight: 750;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.stackup-layer-dimension,
.stackup-total-dimension path {
  fill: none;
  stroke: var(--muted);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.stackup-total-dimension text {
  fill: var(--muted);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-anchor: middle;
  text-transform: uppercase;
}

.stackup-layer-name,
.stackup-layer-thickness,
.stackup-layer-metadata {
  transition: fill 120ms ease, font-weight 120ms ease;
}

.stackup-svg-layer:hover {
  filter: brightness(1.2) contrast(1.1);
  opacity: 0.95;
}

.stackup-svg-layer.active rect {
  stroke: var(--primary);
  stroke-width: 1.5px;
  filter: brightness(1.3);
}

.stackup-svg-layer.active .stackup-layer-dimension {
  stroke: var(--primary);
  stroke-width: 1.5px;
}

.stackup-svg-layer.active .stackup-layer-name,
.stackup-svg-layer.active .stackup-layer-thickness {
  fill: var(--primary);
  font-weight: 800;
}

.stackup-tables-container {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.stackup-table-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stackup-section-title {
  color: var(--muted);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin-bottom: 2px;
}

.stackup-section-heading {
  min-height: 28px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  border-left: 3px solid var(--primary);
  background: color-mix(in srgb, var(--primary) 9%, var(--panel));
  color: var(--foreground);
  font-size: 11px;
  letter-spacing: 0.1em;
}

.stackup-section-heading small {
  margin-left: auto;
  color: var(--muted);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
}

.stackup-table-wrapper {
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: color-mix(in srgb, var(--panel-raised) 26%, var(--panel));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  max-height: min(360px, calc(100vh - 420px));
}

.stackup-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
  text-align: left;
}

.stackup-table th {
  position: sticky;
  top: 0;
  background: var(--control);
  color: var(--muted);
  font-weight: 700;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  text-transform: uppercase;
  font-size: 9px;
  letter-spacing: 0.05em;
  z-index: 1;
}

.stackup-table td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  color: var(--foreground);
  vertical-align: middle;
}

.stackup-table tr:last-child td {
  border-bottom: 0;
}

.stackup-table tr.active td {
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  color: var(--primary);
}

.stackup-table tr:hover td {
  background: var(--control-hover);
}

.stackup-table tbody tr[data-layer-id] {
  cursor: crosshair;
}

.stackup-table tbody tr[data-layer-id]:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: -2px;
}

.stackup-badge {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 8px;
  font-weight: 700;
  text-transform: uppercase;
}

.stackup-badge.copper {
  background: rgba(224, 133, 36, 0.15);
  color: #f97316;
}

.stackup-badge.dielectric {
  background: rgba(169, 141, 92, 0.15);
  color: #ca8a04;
}

.stackup-badge.mask {
  background: rgba(47, 107, 79, 0.15);
  color: #10b981;
}

.stackup-badge.paste {
  background: rgba(203, 213, 225, 0.12);
  color: #cbd5e1;
}

.stackup-badge.silk {
  background: rgba(255, 255, 255, 0.1);
  color: var(--foreground);
}

@media (max-width: 1180px) {
  #stackup-workspace-view {
    overflow-y: auto;
  }

  .stackup-workspace-body {
    grid-template-columns: 1fr;
    flex: none;
  }

  .stackup-diagram-card {
    min-height: auto;
    height: auto;
    overflow: visible;
  }

  .stackup-side-panel {
    height: auto;
    overflow: visible;
    padding-right: 0;
  }

  .stackup-table-wrapper {
    max-height: none;
  }
}

@media (max-width: 760px) {
  #stackup-workspace-view {
    padding: 16px;
  }

  .stackup-diagram-card {
    align-items: flex-start;
    overflow-x: auto;
  }

  .stackup-visual-svg,
  .stackup-via-legend {
    width: 680px;
    max-width: none;
  }

  .stackup-summary-grid {
    grid-template-columns: 1fr;
  }
}
`;var Lb=/\/api\/projects\/([^/]+)\/webgpu-3d\/assets\/([^/]+)\/([^/]+)\/(.+)$/,Db="prism-bundle-cache-a0",zn="manifest.json";function Gn(e){let t;try{t=new URL(e,"http://cache.invalid/")}catch{return null}let a=Lb.exec(t.pathname);if(!a)return null;let[,s,r,n,i]=a.map(decodeURIComponent);if(i.split("/").some(c=>!c||c==="."||c===".."))return null;let o=t.searchParams.get("viewer")||"";return`${s}/${r}/${n}/${i}${o?`?viewer=${o}`:""}`}function zs(e){return`a_${encodeURIComponent(e)}`}function Ub(e,t,{maxAgeMs:a=2592e6,maxBytes:s=2147483648}={}){let r=new Set,n=[];for(let[o,c]of Object.entries(e))t-Number(c.lastUsed||0)<=a?n.push([o,c]):r.add(o);n.sort((o,c)=>Number(c[1].lastUsed)-Number(o[1].lastUsed));let i=0;for(let[o,c]of n)i+=Number(c.bytes||0),i>s&&r.add(o);return[...r]}var Gs=class e{static open(t={}){return e.shared||(e.shared=new e(t)),e.shared}constructor({maxAgeMs:t=2592e6,maxBytes:a=2147483648}={}){this.maxAgeMs=t,this.maxBytes=a,this.stats={hits:0,misses:0,bypassed:0,cachedBytes:0,networkBytes:0,writeErrors:0},this.ready=this.init(),this.flushTimer=null}async init(){try{let t=globalThis.navigator?.storage;if(!t?.getDirectory)return null;let s=await(await t.getDirectory()).getDirectoryHandle(Db,{create:!0}),r=await s.getFileHandle(zn,{create:!0});if(typeof r.createWritable!="function")return null;let n={};try{let i=await(await r.getFile()).text();n=i?JSON.parse(i).entries||{}:{}}catch{n={}}return this.directory=s,this.entries=n,await this.prune(),globalThis.addEventListener?.("pagehide",()=>void this.flush()),s}catch{return null}}get enabled(){return!!this.directory}async fetchBytes(t,{store:a=!0,signal:s}={}){let r=Gn(t);if(await this.ready,r&&this.directory){let c=await this.read(r);if(c)return this.stats.hits+=1,this.stats.cachedBytes+=c.byteLength,c;this.stats.misses+=1}else this.stats.bypassed+=1;let n=await fetch(t,{cache:"no-store",signal:s});if(!n.ok)throw new Error(`Failed to load ${t}: ${n.status}`);let i=await n.arrayBuffer(),o=Number(n.headers.get("content-length")||0);return this.stats.networkBytes+=i.byteLength,a&&r&&this.directory&&(!o||o===i.byteLength)&&this.write(r,i),i}async fetchJson(t,a={}){let s=await this.fetchBytes(t,a);return JSON.parse(new TextDecoder().decode(s))}async peekJson(t){let a=Gn(t);if(await this.ready,!a||!this.directory)return null;let s=await this.read(a);return s?(this.stats.hits+=1,this.stats.cachedBytes+=s.byteLength,JSON.parse(new TextDecoder().decode(s))):null}async store(t,a){let s=Gn(t);await this.ready,s&&this.directory&&await this.write(s,a)}async read(t){let a=this.entries[t];if(!a)return null;try{let s=await(await this.directory.getFileHandle(zs(t))).getFile();return s.size!==a.bytes?null:(a.lastUsed=Date.now(),this.scheduleFlush(),await s.arrayBuffer())}catch{return delete this.entries[t],null}}async write(t,a){try{let r=await(await this.directory.getFileHandle(zs(t),{create:!0})).createWritable();await r.write(a),await r.close(),this.entries[t]={bytes:a.byteLength,lastUsed:Date.now()},this.scheduleFlush()}catch{this.stats.writeErrors+=1}}async prune(t=Date.now()){if(!this.directory)return[];let a=Ub(this.entries,t,{maxAgeMs:this.maxAgeMs,maxBytes:this.maxBytes});for(let r of a)delete this.entries[r],await this.directory.removeEntry(zs(r)).catch(()=>{});let s=new Set(Object.keys(this.entries).map(zs));for await(let r of this.directory.keys())r!==zn&&!s.has(r)&&await this.directory.removeEntry(r).catch(()=>{});return a.length&&await this.flush(),a}async clear(){await this.ready,this.directory&&(this.entries={},await this.prune(),await this.flush())}summary(){let t=Object.values(this.entries||{});return{enabled:this.enabled,files:t.length,bytes:t.reduce((a,s)=>a+Number(s.bytes||0),0),...this.stats}}scheduleFlush(){this.flushTimer||(this.flushTimer=setTimeout(()=>{this.flushTimer=null,this.flush()},1e3))}async flush(){if(this.directory)try{let a=await(await this.directory.getFileHandle(zn,{create:!0})).createWritable();await a.write(JSON.stringify({schema:"prism.bundle_cache_manifest.a0",entries:this.entries})),await a.close()}catch{this.stats.writeErrors+=1}}};function zb(e,t){if(!t)return e;let a=new URL(e);return a.searchParams.set("viewer",t),a.toString()}function ac(e,t,a,s){let r=new URL(a.asset_base||"./",t),n=structuredClone(e||{}),i=o=>!o||typeof o!="string"?o:zb(new URL(o,r).toString(),s);for(let o of["assets","semantic_gltf","schematic_world","schematic_vector","schematic_scene","bom"]){let c=n[o];if(!(!c||typeof c!="object"))for(let[l,f]of Object.entries(c))c[l]=i(f)}return n}function Kn(e){return(e?.readiness?.stage||"semantic-ready")==="semantic-ready"&&(e?.readiness?.progress??100)>=100}var ce=(e,t,a)=>Math.max(t,Math.min(a,e)),Vs=(e,t,a)=>e+(t-e)*a;function Ee(e,t){return[e[0]+t[0],e[1]+t[1],e[2]+t[2]]}function Gb(e,t){return[e[0]-t[0],e[1]-t[1],e[2]-t[2]]}function pe(e,t){return[e[0]*t,e[1]*t,e[2]*t]}function Kb(e){return Math.hypot(e[0],e[1],e[2])}function He(e){let t=Kb(e)||1;return pe(e,1/t)}function qe(e,t){return[e[1]*t[2]-e[2]*t[1],e[2]*t[0]-e[0]*t[2],e[0]*t[1]-e[1]*t[0]]}function et(e,t){return e[0]*t[0]+e[1]*t[1]+e[2]*t[2]}function sc(e,t){let a=t/2,s=Math.sin(a),r=He(e);return[r[0]*s,r[1]*s,r[2]*s,Math.cos(a)]}function Ks(e,t){return[e[3]*t[0]+e[0]*t[3]+e[1]*t[2]-e[2]*t[1],e[3]*t[1]-e[0]*t[2]+e[1]*t[3]+e[2]*t[0],e[3]*t[2]+e[0]*t[1]-e[1]*t[0]+e[2]*t[3],e[3]*t[3]-e[0]*t[0]-e[1]*t[1]-e[2]*t[2]]}function Vn(e,t){let a=[t[0],t[1],t[2],0],s=[-e[0],-e[1],-e[2],e[3]];return Ks(Ks(e,a),s).slice(0,3)}function aa(e,t){let a=new Float32Array(16);for(let s=0;s<4;s+=1)for(let r=0;r<4;r+=1)a[s*4+r]=e[r]*t[s*4]+e[4+r]*t[s*4+1]+e[8+r]*t[s*4+2]+e[12+r]*t[s*4+3];return a}function Hs(e,t,a){let s=He(Gb(e,t)),r=He(qe(a,s)),n=qe(s,r);return new Float32Array([r[0],n[0],s[0],0,r[1],n[1],s[1],0,r[2],n[2],s[2],0,-et(r,e),-et(n,e),-et(s,e),1])}function rc(e,t,a,s){let r=1/Math.tan(e/2);return new Float32Array([r/t,0,0,0,0,r,0,0,0,0,a/(s-a),-1,0,0,a*s/(s-a),0])}function qs(e,t,a,s){return new Float32Array([2/e,0,0,0,0,2/t,0,0,0,0,1/(s-a),0,0,0,1,1])}function Hn(e){return[(e[0]+e[3])/2,(e[1]+e[4])/2,(e[2]+e[5])/2]}function At(e){return Math.max(.001,Math.hypot(e[3]-e[0],e[4]-e[1],e[5]-e[2])/2)}var Ka=class{constructor(t){let a=Hn(t),s=At(t);this.focus=[...a],this.targetFocus=[...a],this.azimuth=-.62,this.targetAzimuth=this.azimuth,this.polar=.72,this.targetPolar=this.polar,this.distance=s*2.8,this.targetDistance=this.distance,this.orthoScale=s*2.15,this.targetOrthoScale=this.orthoScale,this.sceneRadius=s,this.fov=Math.PI/4}update(t){let a=1-Math.exp(-t*14);this.focus=this.focus.map((s,r)=>Vs(s,this.targetFocus[r],a)),this.azimuth=ic(this.azimuth,this.targetAzimuth,a),this.polar=ic(this.polar,this.targetPolar,a),this.distance=Vs(this.distance,this.targetDistance,a),this.orthoScale=Vs(this.orthoScale,this.targetOrthoScale,a)}snap(){this.focus=[...this.targetFocus],this.azimuth=this.targetAzimuth,this.polar=this.targetPolar,this.distance=this.targetDistance,this.orthoScale=this.targetOrthoScale}basis(){let t=Math.sin(this.polar),a=Math.cos(this.polar),s=He([t*Math.sin(this.azimuth),-t*Math.cos(this.azimuth),a]),r=He([Math.cos(this.azimuth),Math.sin(this.azimuth),0]),n=He(qe(s,r));return{right:r,up:n,back:s}}matrix(t,a,s=!1,r=1){let n=Math.max(.01,t/Math.max(1,a)),{up:i,back:o}=this.basis(),c=Ee(this.focus,pe(o,this.distance)),l=Hs(c,this.focus,i),f=s?qs(this.orthoScale*r*n,this.orthoScale*r,-this.sceneRadius*40,this.sceneRadius*40):rc(this.fov,n,Math.max(this.sceneRadius*5e-4,this.distance-this.sceneRadius*3.5),this.distance+this.sceneRadius*4.5);return aa(f,l)}targetMatrix(t,a,s=!1,r=0){let n=(l,f)=>f+(f-l)*r,i=[this.focus,this.azimuth,this.polar,this.distance,this.orthoScale];this.focus=this.focus.map((l,f)=>n(l,this.targetFocus[f]));let o=(l,f)=>f+Math.atan2(Math.sin(f-l),Math.cos(f-l))*r;this.azimuth=o(this.azimuth,this.targetAzimuth),this.polar=o(this.polar,this.targetPolar),this.distance=Math.max(this.sceneRadius*.001,n(this.distance,this.targetDistance)),this.orthoScale=Math.max(this.sceneRadius*.001,n(this.orthoScale,this.targetOrthoScale));let c=this.matrix(t,a,s);return[this.focus,this.azimuth,this.polar,this.distance,this.orthoScale]=i,c}moving(){let t=(a,s)=>Math.abs(a-s)<=Math.max(1e-9,Math.abs(s)*1e-4);return!(this.focus.every((a,s)=>t(a,this.targetFocus[s]))&&t(this.azimuth,this.targetAzimuth)&&t(this.polar,this.targetPolar)&&t(this.distance,this.targetDistance)&&t(this.orthoScale,this.targetOrthoScale))}orbit(t,a){let s=Math.sin(this.targetPolar)<0?-1:1;this.targetAzimuth-=s*t*.006,this.targetPolar=nc(this.targetPolar-a*.006)}isBelow(){return Math.cos(this.targetPolar)<0}pan(t,a,s,r=!1){let{right:n,up:i}=this.basis(),o=r?this.targetOrthoScale/Math.max(1,s):2*this.targetDistance*Math.tan(this.fov/2)/Math.max(1,s),c=Ee(pe(n,-t*o),pe(i,a*o));this.targetFocus=Ee(this.targetFocus,c)}dolly(t,a=!1){let s=Math.exp(t*.0032);a?this.targetOrthoScale=ce(this.targetOrthoScale*s,this.sceneRadius*.008,this.sceneRadius*24):this.targetDistance=ce(this.targetDistance*s,this.sceneRadius*.01,this.sceneRadius*48)}frame(t){if(!t)return;let a=At(t);this.targetFocus=Hn(t),this.targetDistance=Math.max(a*2.8,this.sceneRadius*.02),this.targetOrthoScale=Math.max(a*2.15,this.sceneRadius*.02)}setFocus(t){this.targetFocus=[...t]}setAxis(t,a=!1){t==="z"?(this.targetAzimuth=0,this.targetPolar=a?Math.PI-.015:.015):t==="x"?(this.targetAzimuth=a?-Math.PI/2:Math.PI/2,this.targetPolar=Math.PI/2):(this.targetAzimuth=a?0:Math.PI,this.targetPolar=Math.PI/2)}rotateZ(t=1){this.targetAzimuth+=t*Math.PI/2}flip(){this.targetPolar=nc(Math.PI-this.targetPolar)}};function nc(e){return Math.atan2(Math.sin(e),Math.cos(e))}function ic(e,t,a){let s=Math.atan2(Math.sin(t-e),Math.cos(t-e));return e+s*a}var Ws=class e{static async create(t,a,s={}){let r=await fetch(a,{cache:"default"});if(!r.ok)throw new Error(`Failed to load BoM ${a}: ${r.status}`);let n=await r.json();if(n.schema!=="prism.bom_a0")throw new Error(`Unsupported BoM schema: ${n.schema||"missing"}`);let i=new e(t,n,s);return i.render(),i}constructor(t,a,s){this.container=t,this.payload=a,this.callbacks=s,this.query="",this.selectedRowId="",this.selectedReference="",this.rowsById=new Map((a.rows||[]).map(r=>[r.id,r])),this.componentIndex=new Map(Object.entries(a.componentIndex||{}))}setSelectionByReference(t,a={}){let s=this.componentIndex.get(t);s&&(this.selectedReference=t,this.selectedRowId=s.rowId,this.renderContent(),a.scroll&&this.container.querySelector(`[data-row-id="${qb(s.rowId)}"]`)?.scrollIntoView({block:"center",behavior:"smooth"}))}clearSelection(){this.selectedReference="",this.selectedRowId="",this.renderContent()}render(){let t=this.filteredRows();this.container.innerHTML=`
      <section class="bom-workspace">
        <header class="bom-toolbar">
          <div>
            <p class="eyebrow">Prism BoM A0</p>
            <h2>Bill of Materials</h2>
            <span data-bom-count>${t.length} of ${(this.payload.rows||[]).length} grouped rows \xB7 ${(this.payload.components||[]).length} components</span>
          </div>
          <label class="bom-search">
            <span>Search</span>
            <input id="bom-search" type="search" value="${We(this.query)}" placeholder="Reference, value, footprint, manufacturer..." />
          </label>
        </header>
        <div class="bom-content" data-bom-content>
          ${this.contentHtml(t,this.payload.displayColumns||[])}
        </div>
      </section>
    `,this.bind()}renderContent(){let t=this.container.querySelector("[data-bom-content]");if(!t){this.render();return}let a=this.filteredRows();t.innerHTML=this.contentHtml(a,this.payload.displayColumns||[]);let s=this.container.querySelector("[data-bom-count]");s&&(s.textContent=`${a.length} of ${(this.payload.rows||[]).length} grouped rows \xB7 ${(this.payload.components||[]).length} components`),this.bindContent(t)}contentHtml(t,a){let s=this.rowsById.get(this.selectedRowId);return`
      <div class="bom-table-wrap">
        <table class="bom-table">
          <thead>
            <tr>${a.map(r=>`<th>${We(r)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${t.map(r=>this.rowHtml(r,a)).join("")}
          </tbody>
        </table>
      </div>
      ${s?`<aside class="bom-detail">${this.detailHtml(s)}</aside>`:""}
    `}filteredRows(){let t=this.query.trim().toLowerCase(),a=this.payload.rows||[];return t?a.filter(s=>JSON.stringify(s).toLowerCase().includes(t)):a}rowHtml(t,a){return`
      <tr class="${t.id===this.selectedRowId?"selected":""}" data-row-id="${We(t.id)}">
        ${a.map(r=>{let n=t.fields?.[r]||"";return r==="Reference"?`<td class="bom-reference-cell">${(t.references||[]).map(i=>`
              <button class="bom-ref-chip ${i===this.selectedReference?"active":""}" data-reference="${We(i)}">${We(i)}</button>
            `).join("")}</td>`:!n&&Hb(r)?'<td><span class="bom-missing">Missing</span></td>':`<td title="${We(n)}">${We(n)}</td>`}).join("")}
      </tr>
    `}detailHtml(t){let a=Vb(t,this.payload.displayColumns||[],this.payload.extraColumns||[]);return`
      <div class="bom-detail-head">
        <p class="eyebrow">Line item</p>
        <h3>${We((t.references||[]).join(", "))}</h3>
        <span>${t.qty} component${t.qty===1?"":"s"}${t.dnp?" \xB7 DNP":""}</span>
      </div>
      <div class="bom-ref-list">
        ${(t.references||[]).map(s=>`
          <button class="bom-ref-chip detail ${s===this.selectedReference?"active":""}" data-reference="${We(s)}">${We(s)}</button>
        `).join("")}
      </div>
      <dl class="bom-field-list">
        ${a.map(([s,r])=>`
          <div>
            <dt>${We(s)}</dt>
            <dd>${We(r)}</dd>
          </div>
        `).join("")}
      </dl>
    `}bind(){let t=this.container.querySelector("#bom-search");t?.addEventListener("input",()=>{this.query=t.value,this.renderContent()}),this.bindContent(this.container)}bindContent(t){t.querySelectorAll("[data-row-id]").forEach(a=>{a.addEventListener("click",s=>{s.target.closest("[data-reference]")||(this.selectedRowId=a.dataset.rowId,this.selectedReference="",this.renderContent())})}),t.querySelectorAll("[data-reference]").forEach(a=>{a.addEventListener("click",s=>{s.stopPropagation();let r=a.dataset.reference;this.setSelectionByReference(r),this.callbacks.onSelectReference?.(r)})})}};function Vb(e,t,a){let s=[],r=new Set(["Reference","Qty"].map(qn));for(let i of t){if(i==="Reference"||i==="Qty")continue;let o=e.fields?.[i]||"";o&&(s.push([i,o]),r.add(qn(i)))}let n=e.canonicalFields||{};for(let i of a){let o=n[i]||"";if(!o)continue;let c=qn(i);r.has(c)||(r.add(c),s.push([i,o]))}return s}function qn(e){return String(e||"").toLowerCase().replace(/[\s_\-()[\]/]+/g,"")}function Hb(e){return["Manufacturer Part Number","Vendor Part Number","Datasheet","Footprint","Value"].includes(e)}function We(e){return String(e??"").replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t])}function qb(e){return String(e).replace(/["\\]/g,"\\$&")}function Wn(e){let t=`${e.nodeName||""} ${e.meshName||""} ${e.material?.name||""}`.toLowerCase();return t.includes("_pad")||t.includes(".pad")||t.endsWith("pad")?"pad":t.includes("silkscreen")?"silkscreen":t.includes("soldermask")?"soldermask":t.includes("paste")?"paste":"substrate"}function cc(e){let t=String(e.material?.name||"").toLowerCase();if(t.endsWith("_bottom"))return"back";if(t.endsWith("_top"))return"front";let a=e.bounds;return a&&(a[2]+a[5])/2<0?"back":"front"}function Ha(e,t=()=>""){let a=new Map;for(let s of e){let n=`${t(s)}:${JSON.stringify(s.material)}`;a.has(n)||a.set(n,[]),a.get(n).push(s)}return[...a.values()].map(s=>{let r=s.reduce((h,d)=>h+d.position.length/3,0),n=s.reduce((h,d)=>h+d.indices.length,0),i=new Float32Array(r*3),o=new Float32Array(r*3),c=new Uint32Array(r),l=new Uint32Array(r),f=new Uint32Array(n),u=0,g=0,b=[1/0,1/0,1/0,-1/0,-1/0,-1/0];for(let h of s){let d=h.position.length/3;i.set(h.position,u*3),o.set(h.normal,u*3),c.set(h.netId,u),l.set(h.objectFeatureId,u);for(let x=0;x<h.indices.length;x+=1)f[g+x]=Number(h.indices[x])+u;h.bounds&&(b[0]=Math.min(b[0],h.bounds[0]),b[1]=Math.min(b[1],h.bounds[1]),b[2]=Math.min(b[2],h.bounds[2]),b[3]=Math.max(b[3],h.bounds[3]),b[4]=Math.max(b[4],h.bounds[4]),b[5]=Math.max(b[5],h.bounds[5])),u+=d,g+=h.indices.length}return{position:i,normal:o,netId:c,objectFeatureId:l,indices:f,material:s[0].material,groupKey:t(s[0]),bounds:Number.isFinite(b[0])?b:null}})}function qa(e){return!e||e.length!==6?null:[e[0]/1e3,-e[4]/1e3,e[2]/1e3,e[3]/1e3,-e[1]/1e3,e[5]/1e3]}function Xs(e){let t=e?.min||[0,0,0],a=e?.max||[.08,.0016,.05];return[t[0],-a[2],t[1],a[0],-t[2],a[1]]}function xa(e){let t=e.filter(a=>Array.isArray(a)&&a.length===6);return t.length?t.reduce((a,s)=>[Math.min(a[0],s[0]),Math.min(a[1],s[1]),Math.min(a[2],s[2]),Math.max(a[3],s[3]),Math.max(a[4],s[4]),Math.max(a[5],s[5])],[...t[0]]):null}function oc(e){let t=e.replace("#","");return[0,2,4].map(a=>parseInt(t.slice(a,a+2),16)/255)}function lc(e,t){if(typeof e?.color=="string"&&/^#[0-9a-fA-F]{6}$/.test(e.color))return[...oc(e.color),1];let a={"F.Cu":"#a9423c","B.Cu":"#315b9a","In1.Cu":"#477a55","In2.Cu":"#806244","In3.Cu":"#347c86","In4.Cu":"#685889","In5.Cu":"#92793e"},s=["#477a55","#806244","#347c86","#685889","#92793e","#82556e"],r=String(e?.name||""),n=Math.max(0,t.findIndex(i=>i.name===r)-1);return[...oc(a[r]||s[n%s.length]),1]}function dc(e,t){let a=t.map(s=>[Number(s.id),Number(s.z_mm||0)]);return a.length<3?!1:(a.sort((s,r)=>s[1]-r[1]),e!==a[0][0]&&e!==a[a.length-1][0])}var Va=Object.freeze({gold:[.83,.69,.37,1],silver:[.74,.75,.77,1],copper:[.76,.47,.28,1]});function uc(e){let t=String(e||"").toLowerCase();return/hasl|hal\b|tin|silver|lead/.test(t)?Va.silver:/osp|bare|none/.test(t)?Va.copper:Va.gold}function fc(e,t){let a=String(e?.name||"");return!!a&&(a===t[0]?.name||a===t[t.length-1]?.name)}function hc(e,t){let a=String(e.material?.name||"").endsWith("_bottom"),s=t.find(r=>r.name===(a?"B.Cu":"F.Cu"))||(a?t[t.length-1]:t[0]);return Number(s?.id||0)}function bc(e,t=new Map){let a=new Map;for(let r of e||[]){let n=String(r?.designator||"");if(!n)continue;let i=a.get(n)||{reference:n,featureIds:new Set,modelCount:0},o=Number(r?.featureId)||0;o>0&&i.featureIds.add(o),a.set(n,i)}for(let[r,n]of t||[]){let i=a.get(String(r));i&&(i.modelCount=Math.max(i.modelCount,Number(n)||0))}let s=new Map;for(let[r,n]of a)s.set(r,{reference:r,featureIds:[...n.featureIds].sort((i,o)=>i-o),ambiguous:n.featureIds.size>1||n.modelCount>1});return s}function pc(e,t){let a=[...new Set((Array.isArray(e)?e:[]).map(c=>String(c||"")).filter(Boolean))],s=[],r=[],n=[],i=new Set,o=new Set;for(let c of a){let l=t.get(c);if(!l){n.push(c);continue}if(l.ambiguous){r.push(c);continue}s.push(c),o.add(c);for(let f of l.featureIds)i.add(f)}return{requested:a,applied:s,ambiguous:r,unknown:n,hiddenFeatureIds:i,hiddenReferences:o}}function $s(e,t){return!!e&&t.has(String(e))}var Wb={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};function K(e){return String(e??"").replace(/[&<>"']/g,t=>Wb[t])}var Wa=`
fn netEmphasized(id: u32) -> bool {
  return id != 0u && id < arrayLength(&netMask) && netMask[id] != 0u;
}
`;function Ys(e){let t=new Set;if(e==null)return t;for(let a of e){let s=Number(a);!Number.isInteger(s)||s<=0||s>4294967295||t.add(s)}return t}function gc(e,t=0){let a=0;for(let r of Ys(e))a=Math.max(a,r);let s=64;for(;s<a+1;)s*=2;return Math.max(s,Math.floor(t)||0)}function mc(e,t){let a=Math.max(64,Math.floor(t)||0),s=new Uint32Array(a);s.fill(0);for(let r of Ys(e))r<a&&(s[r]=1);return s}function sa(e,t){return!Array.isArray(e)||!t?null:e.find(a=>a.name===t||Array.isArray(a.aliases)&&a.aliases.includes(t))||null}function yc(e,t){let a=new Set;if(!Array.isArray(e)||!Array.isArray(t))return a;for(let s of t){if(!s)continue;let r=s.netUid&&e.find(i=>i.uid===s.netUid)||s.netName&&sa(e,s.netName),n=Number(r?.id);Number.isInteger(n)&&n>0&&a.add(n)}return a}var Xn=Object.freeze([[.08,1,.2],[1,.72,.1],[.2,.75,1],[1,.3,.75],[.65,.45,1],[1,.45,.2],[.3,1,.85],[.95,.95,.3]]),xc=`
// 0: off; 1: the default colour; 0x01RRGGBB: that colour.
fn emphasisOf(occurrence: u32, id: u32) -> u32 {
  if (id == 0u) { return 0u; }
  if (globals.emphasisStride == 0u) { return select(0u, 1u, netEmphasized(id)); }
  if (id >= globals.emphasisStride || occurrence <= globals.occurrenceBase) { return 0u; }
  let slot = (occurrence - 1u - globals.occurrenceBase) * globals.emphasisStride + id;
  if (slot >= arrayLength(&netMask)) { return 0u; }
  return netMask[slot];
}
fn emphasisColor(mark: u32, fallback: vec3f) -> vec3f {
  if ((mark >> 24u) == 0u) { return fallback; }
  return vec3f(f32((mark >> 16u) & 255u), f32((mark >> 8u) & 255u), f32(mark & 255u)) / 255.0;
}
`;function wc(e){let t=null;return Array.isArray(e)&&e.length>=3&&e.slice(0,3).every(a=>Number.isFinite(Number(a)))?t=e.slice(0,3).map(a=>Math.round(Math.min(1,Math.max(0,Number(a)))*255)):typeof e=="string"&&/^#[0-9a-f]{6}$/i.test(e)&&(t=[1,3,5].map(a=>parseInt(e.slice(a,a+2),16))),t?(1<<24|t[0]<<16|t[1]<<8|t[2])>>>0:1}function vc(e){let t=1;for(let s of e)for(let r of s?.keys()||[])t=Math.max(t,r+1);let a=new Uint32Array(Math.max(64,e.length*t));return e.forEach((s,r)=>{for(let[n,i]of s||[])Number.isInteger(n)&&n>0&&(a[r*t+n]=i>>>0)}),{stride:t,data:a}}function Xb(e){return(typeof e.composedPath=="function"?e.composedPath():[])[0]??e.target??null}function Mc(e){let t=Xb(e);if(!t||typeof t!="object")return!1;let a=typeof t.tagName=="string"?t.tagName.toUpperCase():"";return a==="INPUT"||a==="TEXTAREA"||a==="SELECT"||t.isContentEditable===!0}function kc(e){return!!(e.metaKey||e.ctrlKey)}var $b=4;function Ec(e,t=$b){let a=new Map,s=[];for(let n of e){if(n.placements.length<t){for(let o of n.placements)s.push(Yb(n.primitive,o));continue}let i=`${n.placements.map(o=>o.node).join(",")}|${JSON.stringify(n.primitive.material)}`;a.has(i)||a.set(i,[]),a.get(i).push(n)}return{instanced:[...a.values()].map(n=>({primitive:Jb(n.map(i=>i.primitive)),placements:n[0].placements})),baked:Ha(s)}}function Yb(e,t){let{rows:a,featureId:s,bounds:r}=t,n=e.position.length/3,i=new Float32Array(n*3),o=new Float32Array(n*3),c=new Uint32Array(n);for(let l=0;l<n;l+=1){let f=l*3,[u,g,b]=[e.position[f],e.position[f+1],e.position[f+2]],[h,d,x]=[e.normal[f],e.normal[f+1],e.normal[f+2]],p=0;for(let m=0;m<3;m+=1){let y=m*4;i[f+m]=a[y]*u+a[y+1]*g+a[y+2]*b+a[y+3],o[f+m]=a[y]*h+a[y+1]*d+a[y+2]*x,p+=o[f+m]**2}p=Math.sqrt(p)||1;for(let m=0;m<3;m+=1)o[f+m]/=p;c[l]=e.objectFeatureId[l]||s||0}return{position:i,normal:o,netId:e.netId,objectFeatureId:c,indices:e.indices,material:e.material,bounds:[...r]}}function Jb(e){if(e.length===1)return e[0];let t=e.reduce((u,g)=>u+g.position.length/3,0),a=e.reduce((u,g)=>u+g.indices.length,0),s=new Float32Array(t*3),r=new Float32Array(t*3),n=new Uint32Array(t),i=new Uint32Array(t),o=new Uint32Array(a),c=[1/0,1/0,1/0,-1/0,-1/0,-1/0],l=0,f=0;for(let u of e){s.set(u.position,l*3),r.set(u.normal,l*3),n.set(u.netId,l),i.set(u.objectFeatureId,l);for(let g=0;g<u.indices.length;g+=1)o[f+g]=u.indices[g]+l;for(let g=0;g<3;g+=1)c[g]=Math.min(c[g],u.bounds[g]),c[g+3]=Math.max(c[g+3],u.bounds[g+3]);l+=u.position.length/3,f+=u.indices.length}return{position:s,normal:r,netId:n,objectFeatureId:i,indices:o,material:e[0].material,bounds:c}}var Sc=class{_listeners={};addEventListener(e,t){let a=this._listeners;return a[e]===void 0&&(a[e]=[]),a[e].indexOf(t)===-1&&a[e].push(t),this}removeEventListener(e,t){let a=this._listeners[e];if(a!==void 0){let s=a.indexOf(t);s!==-1&&a.splice(s,1)}return this}dispatchEvent(e){let t=this._listeners[e.type];if(t!==void 0){let a=t.slice(0);for(let s=0,r=a.length;s<r;s++)a[s].call(this,e)}return this}dispose(){for(let e in this._listeners)delete this._listeners[e]}},Rt=class{_disposed=!1;_name;_parent;_child;_attributes;constructor(e,t,a,s={}){if(this._name=e,this._parent=t,this._child=a,this._attributes=s,!t.isOnGraph(a))throw new Error("Cannot connect disconnected graphs.")}getName(){return this._name}getParent(){return this._parent}getChild(){return this._child}setChild(e){return this._child=e,this}getAttributes(){return this._attributes}dispose(){this._disposed||(this._parent._destroyRef(this),this._disposed=!0)}isDisposed(){return this._disposed}},$n=class extends Sc{_emptySet=new Set;_edges=new Set;_parentEdges=new Map;_childEdges=new Map;listEdges(){return Array.from(this._edges)}listParentEdges(e){return Array.from(this._childEdges.get(e)||this._emptySet)}listParents(e){let t=new Set;for(let a of this.listParentEdges(e))t.add(a.getParent());return Array.from(t)}listChildEdges(e){return Array.from(this._parentEdges.get(e)||this._emptySet)}listChildren(e){let t=new Set;for(let a of this.listChildEdges(e))t.add(a.getChild());return Array.from(t)}disconnectParents(e,t){for(let a of this.listParentEdges(e))(!t||t(a.getParent()))&&a.dispose();return this}_createEdge(e,t,a,s){let r=new Rt(e,t,a,s);this._edges.add(r);let n=r.getParent();this._parentEdges.has(n)||this._parentEdges.set(n,new Set),this._parentEdges.get(n).add(r);let i=r.getChild();return this._childEdges.has(i)||this._childEdges.set(i,new Set),this._childEdges.get(i).add(r),r}_destroyEdge(e){return this._edges.delete(e),this._parentEdges.get(e.getParent()).delete(e),this._childEdges.get(e.getChild()).delete(e),this}},Se=class{list=[];constructor(e){if(e)for(let t of e)this.list.push(t)}add(e){this.list.push(e)}remove(e){let t=this.list.indexOf(e);t>=0&&this.list.splice(t,1)}removeChild(e){let t=[];for(let a of this.list)a.getChild()===e&&t.push(a);for(let a of t)this.remove(a);return t}listRefsByChild(e){let t=[];for(let a of this.list)a.getChild()===e&&t.push(a);return t}values(){return this.list}},ne=class{set=new Set;map=new Map;constructor(e){if(e)for(let t of e)this.add(t)}add(e){let t=e.getChild();this.removeChild(t),this.set.add(e),this.map.set(t,e)}remove(e){this.set.delete(e),this.map.delete(e.getChild())}removeChild(e){let t=this.map.get(e)||null;return t&&this.remove(t),t}getRefByChild(e){return this.map.get(e)||null}values(){return Array.from(this.set)}},ge=class{map={};constructor(e){e&&Object.assign(this.map,e)}set(e,t){this.map[e]=t}delete(e){delete this.map[e]}get(e){return this.map[e]||null}keys(){return Object.keys(this.map)}values(){return Object.values(this.map)}},ee=Symbol("attributes"),_t=Symbol("immutableKeys"),Tc=class Ic extends Sc{_disposed=!1;graph;[ee];[_t];constructor(t){super(),this.graph=t,this[_t]=new Set,this[ee]=this._createAttributes()}getDefaults(){return{}}_createAttributes(){let t=this.getDefaults(),a={};for(let s in t){let r=t[s];if(r instanceof Ic){let n=this.graph._createEdge(s,this,r);this[_t].add(s),a[s]=n}else a[s]=r}return a}isOnGraph(t){return this.graph===t.graph}isDisposed(){return this._disposed}dispose(){this._disposed||(this.graph.listChildEdges(this).forEach(t=>t.dispose()),this.graph.disconnectParents(this),this._disposed=!0,this.dispatchEvent({type:"dispose"}))}detach(){return this.graph.disconnectParents(this),this}swap(t,a){for(let s in this[ee]){let r=this[ee][s];if(r instanceof Rt){let n=r;n.getChild()===t&&this.setRef(s,a,n.getAttributes())}else if(r instanceof Se)for(let n of r.listRefsByChild(t)){let i=n.getAttributes();this.removeRef(s,t),this.addRef(s,a,i)}else if(r instanceof ne){let n=r.getRefByChild(t);if(n){let i=n.getAttributes();this.removeRef(s,t),this.addRef(s,a,i)}}else if(r instanceof ge)for(let n of r.keys()){let i=r.get(n);i.getChild()===t&&this.setRefMap(s,n,a,i.getAttributes())}}return this}get(t){return this[ee][t]}set(t,a){return this[ee][t]=a,this.dispatchEvent({type:"change",attribute:t})}getRef(t){let a=this[ee][t];return a?a.getChild():null}setRef(t,a,s){if(this[_t].has(t))throw new Error(`Cannot overwrite immutable attribute, "${t}".`);let r=this[ee][t];if(r&&r.dispose(),!a)return this;let n=this.graph._createEdge(t,this,a,s);return this[ee][t]=n,this.dispatchEvent({type:"change",attribute:t})}listRefs(t){return this.assertRefList(t).values().map(a=>a.getChild())}addRef(t,a,s){let r=this.graph._createEdge(t,this,a,s);return this.assertRefList(t).add(r),this.dispatchEvent({type:"change",attribute:t})}removeRef(t,a){let s=this.assertRefList(t);if(s instanceof Se)for(let r of s.listRefsByChild(a))r.dispose();else{let r=s.getRefByChild(a);r&&r.dispose()}return this}assertRefList(t){let a=this[ee][t];if(a instanceof Se||a instanceof ne)return a;throw new Error(`Expected RefList or RefSet for attribute "${t}"`)}listRefMapKeys(t){return this.assertRefMap(t).keys()}listRefMapValues(t){return this.assertRefMap(t).values().map(a=>a.getChild())}getRefMap(t,a){let s=this.assertRefMap(t).get(a);return s?s.getChild():null}setRefMap(t,a,s,r){let n=this.assertRefMap(t),i=n.get(a);if(i&&i.dispose(),!s)return this;r=Object.assign(r||{},{key:a});let o=this.graph._createEdge(t,this,s,{...r,key:a});return n.set(a,o),this.dispatchEvent({type:"change",attribute:t,key:a})}assertRefMap(t){let a=this[ee][t];if(a instanceof ge)return a;throw new Error(`Expected RefMap for attribute "${t}"`)}dispatchEvent(t){return super.dispatchEvent({...t,target:this}),this.graph.dispatchEvent({...t,target:this,type:`node:${t.type}`}),this}_destroyRef(t){let a=t.getName();if(this[ee][a]===t)this[ee][a]=null,this[_t].has(a)&&t.getChild().dispose();else if(this[ee][a]instanceof Se)this[ee][a].remove(t);else if(this[ee][a]instanceof ne)this[ee][a].remove(t);else if(this[ee][a]instanceof ge){let s=this[ee][a];for(let r of s.keys())s.get(r)===t&&s.delete(r)}else return;this.graph._destroyEdge(t),this.dispatchEvent({type:"change",attribute:a})}};var Fc="v4.4.2",Ct="@glb.bin",B=(function(e){return e.ACCESSOR="Accessor",e.ANIMATION="Animation",e.ANIMATION_CHANNEL="AnimationChannel",e.ANIMATION_SAMPLER="AnimationSampler",e.BUFFER="Buffer",e.CAMERA="Camera",e.MATERIAL="Material",e.MESH="Mesh",e.PRIMITIVE="Primitive",e.PRIMITIVE_TARGET="PrimitiveTarget",e.NODE="Node",e.ROOT="Root",e.SCENE="Scene",e.SKIN="Skin",e.TEXTURE="Texture",e.TEXTURE_INFO="TextureInfo",e})({});var Qb=(function(e){return e.ARRAY_BUFFER="ARRAY_BUFFER",e.ELEMENT_ARRAY_BUFFER="ELEMENT_ARRAY_BUFFER",e.INVERSE_BIND_MATRICES="INVERSE_BIND_MATRICES",e.OTHER="OTHER",e.SPARSE="SPARSE",e})({}),tt=(function(e){return e[e.R=4096]="R",e[e.G=256]="G",e[e.B=16]="B",e[e.A=1]="A",e})({});var Zb=class extends Float32Array{constructor(){throw super(),new Error("Unsupported typed array instantiation.")}},rr={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5131:typeof Float16Array<"u"?Float16Array:Zb,5126:Float32Array,5130:Float64Array},q=class{static createBufferFromDataURI(e){if(typeof Buffer>"u"){let t=atob(e.split(",")[1]),a=new Uint8Array(t.length);for(let s=0;s<t.length;s++)a[s]=t.charCodeAt(s);return a}else{let t=e.split(",")[1],a=e.indexOf("base64")>=0;return Buffer.from(t,a?"base64":"utf8")}}static encodeText(e){return new TextEncoder().encode(e)}static decodeText(e){return new TextDecoder().decode(e)}static concat(e){let t=0;for(let r of e)t+=r.byteLength;let a=new Uint8Array(t),s=0;for(let r of e)a.set(r,s),s+=r.byteLength;return a}static pad(e,t=0){let a=this.padNumber(e.byteLength);if(a===e.byteLength)return e;let s=new Uint8Array(a);if(s.set(e),t!==0)for(let r=e.byteLength;r<a;r++)s[r]=t;return s}static padNumber(e){return Math.ceil(e/4)*4}static equals(e,t){if(e===t)return!0;if(e.byteLength!==t.byteLength)return!1;let a=e.byteLength;for(;a--;)if(e[a]!==t[a])return!1;return!0}static toView(e,t=0,a=1/0){return new Uint8Array(e.buffer,e.byteOffset+t,Math.min(e.byteLength,a))}static assertView(e){if(e&&!ArrayBuffer.isView(e))throw new Error(`Method requires Uint8Array parameter; received "${typeof e}".`);return e}};var ep=class{match(e){return e.length>=3&&e[0]===255&&e[1]===216&&e[2]===255}getSize(e){let t=new DataView(e.buffer,e.byteOffset+4),a,s;for(;t.byteLength;){if(a=t.getUint16(0,!1),ap(t,a),s=t.getUint8(a+1),s===192||s===193||s===194)return[t.getUint16(a+7,!1),t.getUint16(a+5,!1)];t=new DataView(e.buffer,t.byteOffset+a+2)}throw new TypeError("Invalid JPG, no size found")}getChannels(e){return 3}},tp=class Oc{static PNG_FRIED_CHUNK_NAME="CgBI";match(t){return t.length>=8&&t[0]===137&&t[1]===80&&t[2]===78&&t[3]===71&&t[4]===13&&t[5]===10&&t[6]===26&&t[7]===10}getSize(t){let a=new DataView(t.buffer,t.byteOffset);return q.decodeText(t.slice(12,16))===Oc.PNG_FRIED_CHUNK_NAME?[a.getUint32(32,!1),a.getUint32(36,!1)]:[a.getUint32(16,!1),a.getUint32(20,!1)]}getChannels(t){return 4}},ct=class{static impls={"image/jpeg":new ep,"image/png":new tp};static registerFormat(e,t){this.impls[e]=t}static getMimeType(e){for(let t in this.impls)if(this.impls[t].match(e))return t;return null}static getSize(e,t){return this.impls[t]?this.impls[t].getSize(e):null}static getChannels(e,t){return this.impls[t]?this.impls[t].getChannels(e):null}static getVRAMByteLength(e,t){if(!this.impls[t])return null;if(this.impls[t].getVRAMByteLength)return this.impls[t].getVRAMByteLength(e);let a=0,s=4,r=this.getSize(e,t);if(!r)return null;for(;r[0]>1||r[1]>1;)a+=r[0]*r[1]*s,r[0]=Math.max(Math.floor(r[0]/2),1),r[1]=Math.max(Math.floor(r[1]/2),1);return a+=1*s,a}static mimeTypeToExtension(e){return e==="image/jpeg"?"jpg":e.split("/").pop()}static extensionToMimeType(e){return e==="jpg"?"image/jpeg":e?`image/${e}`:""}};function ap(e,t){if(t>e.byteLength)throw new TypeError("Corrupt JPG, exceeded buffer limits");if(e.getUint8(t)!==255)throw new TypeError("Invalid JPG, marker table corrupted");return e}var wa=class{static basename(e){let t=e.split(/[\\/]/).pop();return t.substring(0,t.lastIndexOf("."))}static extension(e){if(e.startsWith("data:image/")){let t=e.match(/data:(image\/\w+)/)[1];return ct.mimeTypeToExtension(t)}else{if(e.startsWith("data:model/gltf+json"))return"gltf";if(e.startsWith("data:model/gltf-binary"))return"glb";if(e.startsWith("data:application/"))return"bin"}return e.split(/[\\/]/).pop().split(/[.]/).pop()}},Qn=typeof Float32Array<"u"?Float32Array:Array;Math.PI/180;180/Math.PI;function sp(){var e=new Qn(3);return Qn!=Float32Array&&(e[0]=0,e[1]=0,e[2]=0),e}function Yn(e){var t=e[0],a=e[1],s=e[2];return Math.sqrt(t*t+a*a+s*s)}function rp(e,t,a){var s=t[0],r=t[1],n=t[2],i=a[3]*s+a[7]*r+a[11]*n+a[15];return i=i||1,e[0]=(a[0]*s+a[4]*r+a[8]*n+a[12])/i,e[1]=(a[1]*s+a[5]*r+a[9]*n+a[13])/i,e[2]=(a[2]*s+a[6]*r+a[10]*n+a[14])/i,e}(function(){var e=sp();return function(t,a,s,r,n,i){var o,c;for(a||(a=3),s||(s=0),r?c=Math.min(r*a+s,t.length):c=t.length,o=s;o<c;o+=a)e[0]=t[o],e[1]=t[o+1],e[2]=t[o+2],n(e,e,i),t[o]=e[0],t[o+1]=e[1],t[o+2]=e[2];return t}})();function Pc(e){let t=jc(),a=e.propertyType==="Node"?[e]:e.listChildren();for(let s of a)s.traverse(r=>{let n=r.getMesh();if(!n)return;let i=np(n,r.getWorldMatrix());i.min.every(isFinite)&&i.max.every(isFinite)&&(Zn(i.min,t),Zn(i.max,t))});return t}function np(e,t){let a=jc();for(let s of e.listPrimitives()){let r=s.getAttribute("POSITION"),n=s.getIndices();if(!r)continue;let i=[0,0,0],o=[0,0,0];for(let c=0,l=n?n.getCount():r.getCount();c<l;c++){let f=n?n.getScalar(c):c;i=r.getElement(f,i),o=rp(o,i,t),Zn(o,a)}}return a}function Zn(e,t){for(let a=0;a<3;a++)t.min[a]=Math.min(e[a],t.min[a]),t.max[a]=Math.max(e[a],t.max[a])}function jc(){return{min:[1/0,1/0,1/0],max:[-1/0,-1/0,-1/0]}}var Ac="https://null.example",Jn=class{static DEFAULT_INIT={};static PROTOCOL_REGEXP=/^[a-zA-Z]+:\/\//;static dirname(e){let t=e.lastIndexOf("/");return t===-1?"./":e.substring(0,t+1)}static basename(e){return wa.basename(new URL(e,Ac).pathname)}static extension(e){return wa.extension(new URL(e,Ac).pathname)}static resolve(e,t){if(!this.isRelativePath(t))return t;let a=e.split("/"),s=t.split("/");a.pop();for(let r=0;r<s.length;r++)s[r]!=="."&&(s[r]===".."?a.pop():a.push(s[r]));return a.join("/")}static isAbsoluteURL(e){return this.PROTOCOL_REGEXP.test(e)}static isRelativePath(e){return!/^(?:[a-zA-Z]+:)?\//.test(e)}};function _c(e){return Object.prototype.toString.call(e)==="[object Object]"}function ra(e){if(_c(e)===!1)return!1;let t=e.constructor;if(t===void 0)return!0;let a=t.prototype;return!(_c(a)===!1||Object.hasOwn(a,"isPrototypeOf")===!1)}var ip=(function(e){return e[e.SILENT=4]="SILENT",e[e.ERROR=3]="ERROR",e[e.WARN=2]="WARN",e[e.INFO=1]="INFO",e[e.DEBUG=0]="DEBUG",e})({}),nr=class Lc{verbosity;static Verbosity=ip;static DEFAULT_INSTANCE=new Lc(1);constructor(t){this.verbosity=t}debug(t){this.verbosity<=0&&console.debug(t)}info(t){this.verbosity<=1&&console.info(t)}warn(t){this.verbosity<=2&&console.warn(t)}error(t){this.verbosity<=3&&console.error(t)}};function op(e){var t=e[0],a=e[1],s=e[2],r=e[3],n=e[4],i=e[5],o=e[6],c=e[7],l=e[8],f=e[9],u=e[10],g=e[11],b=e[12],h=e[13],d=e[14],x=e[15],p=t*i-a*n,m=t*o-s*n,y=a*o-s*i,v=l*h-f*b,E=l*d-u*b,S=f*d-u*h,T=t*S-a*E+s*v,A=n*S-i*E+o*v,_=l*y-f*m+u*p,R=b*y-h*m+d*p;return c*T-r*A+x*_-g*R}function cp(e,t,a){var s=t[0],r=t[1],n=t[2],i=t[3],o=t[4],c=t[5],l=t[6],f=t[7],u=t[8],g=t[9],b=t[10],h=t[11],d=t[12],x=t[13],p=t[14],m=t[15],y=a[0],v=a[1],E=a[2],S=a[3];return e[0]=y*s+v*o+E*u+S*d,e[1]=y*r+v*c+E*g+S*x,e[2]=y*n+v*l+E*b+S*p,e[3]=y*i+v*f+E*h+S*m,y=a[4],v=a[5],E=a[6],S=a[7],e[4]=y*s+v*o+E*u+S*d,e[5]=y*r+v*c+E*g+S*x,e[6]=y*n+v*l+E*b+S*p,e[7]=y*i+v*f+E*h+S*m,y=a[8],v=a[9],E=a[10],S=a[11],e[8]=y*s+v*o+E*u+S*d,e[9]=y*r+v*c+E*g+S*x,e[10]=y*n+v*l+E*b+S*p,e[11]=y*i+v*f+E*h+S*m,y=a[12],v=a[13],E=a[14],S=a[15],e[12]=y*s+v*o+E*u+S*d,e[13]=y*r+v*c+E*g+S*x,e[14]=y*n+v*l+E*b+S*p,e[15]=y*i+v*f+E*h+S*m,e}function lp(e,t){var a=t[0],s=t[1],r=t[2],n=t[4],i=t[5],o=t[6],c=t[8],l=t[9],f=t[10];return e[0]=Math.sqrt(a*a+s*s+r*r),e[1]=Math.sqrt(n*n+i*i+o*o),e[2]=Math.sqrt(c*c+l*l+f*f),e}function dp(e,t){var a=new Qn(3);lp(a,t);var s=1/a[0],r=1/a[1],n=1/a[2],i=t[0]*s,o=t[1]*r,c=t[2]*n,l=t[4]*s,f=t[5]*r,u=t[6]*n,g=t[8]*s,b=t[9]*r,h=t[10]*n,d=i+f+h,x=0;return d>0?(x=Math.sqrt(d+1)*2,e[3]=.25*x,e[0]=(u-b)/x,e[1]=(g-c)/x,e[2]=(o-l)/x):i>f&&i>h?(x=Math.sqrt(1+i-f-h)*2,e[3]=(u-b)/x,e[0]=.25*x,e[1]=(o+l)/x,e[2]=(g+c)/x):f>h?(x=Math.sqrt(1+f-i-h)*2,e[3]=(g-c)/x,e[0]=(o+l)/x,e[1]=.25*x,e[2]=(u+b)/x):(x=Math.sqrt(1+h-i-f)*2,e[3]=(o-l)/x,e[0]=(g+c)/x,e[1]=(u+b)/x,e[2]=.25*x),e}var le=class Xa{static identity(t){return t}static eq(t,a,s=1e-5){if(t.length!==a.length)return!1;for(let r=0;r<t.length;r++)if(Math.abs(t[r]-a[r])>s)return!1;return!0}static clamp(t,a,s){return t<a?a:t>s?s:t}static decodeNormalizedInt(t,a){switch(a){case 5126:return t;case 5123:return t/65535;case 5121:return t/255;case 5122:return Math.max(t/32767,-1);case 5120:return Math.max(t/127,-1);default:throw new Error("Invalid component type.")}}static encodeNormalizedInt(t,a){switch(a){case 5126:return t;case 5123:return Math.round(Xa.clamp(t,0,1)*65535);case 5121:return Math.round(Xa.clamp(t,0,1)*255);case 5122:return Math.round(Xa.clamp(t,-1,1)*32767);case 5120:return Math.round(Xa.clamp(t,-1,1)*127);default:throw new Error("Invalid component type.")}}static decompose(t,a,s,r){let n=Yn([t[0],t[1],t[2]]),i=Yn([t[4],t[5],t[6]]),o=Yn([t[8],t[9],t[10]]);op(t)<0&&(n=-n),a[0]=t[12],a[1]=t[13],a[2]=t[14];let c=t.slice(),l=1/n,f=1/i,u=1/o;c[0]*=l,c[1]*=l,c[2]*=l,c[4]*=f,c[5]*=f,c[6]*=f,c[8]*=u,c[9]*=u,c[10]*=u,dp(s,c),r[0]=n,r[1]=i,r[2]=o}static compose(t,a,s,r){let n=r,i=a[0],o=a[1],c=a[2],l=a[3],f=i+i,u=o+o,g=c+c,b=i*f,h=i*u,d=i*g,x=o*u,p=o*g,m=c*g,y=l*f,v=l*u,E=l*g,S=s[0],T=s[1],A=s[2];return n[0]=(1-(x+m))*S,n[1]=(h+E)*S,n[2]=(d-v)*S,n[3]=0,n[4]=(h-E)*T,n[5]=(1-(b+m))*T,n[6]=(p+y)*T,n[7]=0,n[8]=(d+v)*A,n[9]=(p-y)*A,n[10]=(1-(b+x))*A,n[11]=0,n[12]=t[0],n[13]=t[1],n[14]=t[2],n[15]=1,n}};function up(e,t){if(!!e!=!!t)return!1;let a=e.getChild(),s=t.getChild();return a===s||a.equals(s)}function fp(e,t){if(!!e!=!!t)return!1;let a=e.values(),s=t.values();if(a.length!==s.length)return!1;for(let r=0;r<a.length;r++){let n=a[r],i=s[r];if(n.getChild()!==i.getChild()&&!n.getChild().equals(i.getChild()))return!1}return!0}function hp(e,t){if(!!e!=!!t)return!1;let a=e.keys(),s=t.keys();if(a.length!==s.length)return!1;for(let r of a){let n=e.get(r),i=t.get(r);if(!!n!=!!i)return!1;let o=n.getChild(),c=i.getChild();if(o!==c&&!o.equals(c))return!1}return!0}function Dc(e,t){if(e===t)return!0;if(!!e!=!!t||!e||!t||e.length!==t.length)return!1;for(let a=0;a<e.length;a++)if(e[a]!==t[a])return!1;return!0}function Uc(e,t){if(e===t)return!0;if(!!e!=!!t)return!1;if(!ra(e)||!ra(t))return e===t;let a=e,s=t,r=0,n=0,i;for(i in a)r++;for(i in s)n++;if(r!==n)return!1;for(i in a){let o=a[i],c=s[i];if(ar(o)&&ar(c)){if(!Dc(o,c))return!1}else if(ra(o)&&ra(c)){if(!Uc(o,c))return!1}else if(o!==c)return!1}return!0}function ar(e){return Array.isArray(e)||ArrayBuffer.isView(e)}var bp="23456789abdegjkmnpqrvwxyzABDEGJKMNPQRVWXYZ",pp=999,gp=6,Rc=new Set,mp=function(){let e="";for(let t=0;t<gp;t++)e+=bp.charAt(Math.floor(Math.random()*42));return e},yp=function(){for(let e=0;e<pp;e++){let t=mp();if(!Rc.has(t))return Rc.add(t),t}return""},Bt=e=>e,xp=new Set,ai=class extends Tc{constructor(e,t=""){super(e),this[ee].name=t,this.init(),this.dispatchEvent({type:"create"})}getGraph(){return this.graph}getDefaults(){return Object.assign(super.getDefaults(),{name:"",extras:{}})}set(e,t){return Array.isArray(t)&&(t=t.slice()),super.set(e,t)}getName(){return this.get("name")}setName(e){return this.set("name",e)}getExtras(){return this.get("extras")}setExtras(e){return this.set("extras",e)}clone(){let e=this.constructor;return new e(this.graph).copy(this,Bt)}copy(e,t=Bt){for(let a in this[ee]){let s=this[ee][a];if(s instanceof Rt)this[_t].has(a)||s.dispose();else if(s instanceof Se||s instanceof ne)for(let r of s.values())r.dispose();else if(s instanceof ge)for(let r of s.values())r.dispose()}for(let a in e[ee]){let s=this[ee][a],r=e[ee][a];if(r instanceof Rt)this[_t].has(a)?s.getChild().copy(t(r.getChild()),t):this.setRef(a,t(r.getChild()),r.getAttributes());else if(r instanceof ne||r instanceof Se)for(let n of r.values())this.addRef(a,t(n.getChild()),n.getAttributes());else if(r instanceof ge)for(let n of r.keys()){let i=r.get(n);this.setRefMap(a,n,t(i.getChild()),i.getAttributes())}else ra(r)?this[ee][a]=JSON.parse(JSON.stringify(r)):Array.isArray(r)||r instanceof ArrayBuffer||ArrayBuffer.isView(r)?this[ee][a]=r.slice():this[ee][a]=r}return this}equals(e,t=xp){if(this===e)return!0;if(this.propertyType!==e.propertyType)return!1;for(let a in this[ee]){if(t.has(a))continue;let s=this[ee][a],r=e[ee][a];if(s instanceof Rt||r instanceof Rt){if(!up(s,r))return!1}else if(s instanceof ne||r instanceof ne||s instanceof Se||r instanceof Se){if(!fp(s,r))return!1}else if(s instanceof ge||r instanceof ge){if(!hp(s,r))return!1}else if(ra(s)||ra(r)){if(!Uc(s,r))return!1}else if(ar(s)||ar(r)){if(!Dc(s,r))return!1}else if(s!==r)return!1}return!0}detach(){return this.graph.disconnectParents(this,e=>e.propertyType!=="Root"),this}listParents(){return this.graph.listParents(this)}},Ne=class extends ai{getDefaults(){return Object.assign(super.getDefaults(),{extensions:new ge})}getExtension(e){return this.getRefMap("extensions",e)}setExtension(e,t){return t&&t._validateParent(this),this.setRefMap("extensions",e,t)}listExtensions(){return this.listRefMapValues("extensions")}},G=class me extends Ne{static Type={SCALAR:"SCALAR",VEC2:"VEC2",VEC3:"VEC3",VEC4:"VEC4",MAT2:"MAT2",MAT3:"MAT3",MAT4:"MAT4"};static ComponentType={BYTE:5120,UNSIGNED_BYTE:5121,SHORT:5122,UNSIGNED_SHORT:5123,UNSIGNED_INT:5125,FLOAT:5126,FLOAT16:5131,FLOAT64:5130};init(){this.propertyType="Accessor"}getDefaults(){return Object.assign(super.getDefaults(),{array:null,type:me.Type.SCALAR,componentType:me.ComponentType.FLOAT,normalized:!1,sparse:!1,buffer:null})}static getElementSize(t){switch(t){case me.Type.SCALAR:return 1;case me.Type.VEC2:return 2;case me.Type.VEC3:return 3;case me.Type.VEC4:return 4;case me.Type.MAT2:return 4;case me.Type.MAT3:return 9;case me.Type.MAT4:return 16;default:throw new Error("Unexpected type: "+t)}}static getComponentSize(t){switch(t){case me.ComponentType.BYTE:case me.ComponentType.UNSIGNED_BYTE:return 1;case me.ComponentType.SHORT:case me.ComponentType.UNSIGNED_SHORT:return 2;case me.ComponentType.UNSIGNED_INT:case me.ComponentType.FLOAT:return 4;case me.ComponentType.FLOAT16:return 2;case me.ComponentType.FLOAT64:return 8;default:throw new Error("Unexpected component type: "+t)}}getMinNormalized(t){let a=this.getNormalized(),s=this.getElementSize(),r=this.getComponentType();if(this.getMin(t),a)for(let n=0;n<s;n++)t[n]=le.decodeNormalizedInt(t[n],r);return t}getMin(t){let a=this.getArray(),s=this.getCount(),r=this.getElementSize();for(let n=0;n<r;n++)t[n]=1/0;for(let n=0;n<s*r;n+=r)for(let i=0;i<r;i++){let o=a[n+i];Number.isFinite(o)&&(t[i]=Math.min(t[i],o))}return t}getMaxNormalized(t){let a=this.getNormalized(),s=this.getElementSize(),r=this.getComponentType();if(this.getMax(t),a)for(let n=0;n<s;n++)t[n]=le.decodeNormalizedInt(t[n],r);return t}getMax(t){let a=this.get("array"),s=this.getCount(),r=this.getElementSize();for(let n=0;n<r;n++)t[n]=-1/0;for(let n=0;n<s*r;n+=r)for(let i=0;i<r;i++){let o=a[n+i];Number.isFinite(o)&&(t[i]=Math.max(t[i],o))}return t}getCount(){let t=this.get("array");return t?t.length/this.getElementSize():0}getType(){return this.get("type")}setType(t){return this.set("type",t)}getElementSize(){return me.getElementSize(this.get("type"))}getComponentSize(){return this.get("array").BYTES_PER_ELEMENT}getComponentType(){return this.get("componentType")}getNormalized(){return this.get("normalized")}setNormalized(t){return this.set("normalized",t)}getScalar(t){let a=this.getElementSize(),s=this.getComponentType(),r=this.getArray();return this.getNormalized()?le.decodeNormalizedInt(r[t*a],s):r[t*a]}setScalar(t,a){let s=this.getElementSize(),r=this.getComponentType(),n=this.getArray();return this.getNormalized()?n[t*s]=le.encodeNormalizedInt(a,r):n[t*s]=a,this}getElement(t,a){let s=this.getNormalized(),r=this.getElementSize(),n=this.getComponentType(),i=this.getArray();for(let o=0;o<r;o++)s?a[o]=le.decodeNormalizedInt(i[t*r+o],n):a[o]=i[t*r+o];return a}setElement(t,a){let s=this.getNormalized(),r=this.getElementSize(),n=this.getComponentType(),i=this.getArray();for(let o=0;o<r;o++)s?i[t*r+o]=le.encodeNormalizedInt(a[o],n):i[t*r+o]=a[o];return this}getSparse(){return this.get("sparse")}setSparse(t){return this.set("sparse",t)}getBuffer(){return this.getRef("buffer")}setBuffer(t){return this.setRef("buffer",t)}getArray(){return this.get("array")}setArray(t){return this.set("componentType",t?wp(t):me.ComponentType.FLOAT),this.set("array",t),this}getByteLength(){let t=this.get("array");return t?t.byteLength:0}};function wp(e){switch(e.constructor){case Float32Array:return G.ComponentType.FLOAT;case Uint32Array:return G.ComponentType.UNSIGNED_INT;case Uint16Array:return G.ComponentType.UNSIGNED_SHORT;case Uint8Array:return G.ComponentType.UNSIGNED_BYTE;case Int16Array:return G.ComponentType.SHORT;case Int8Array:return G.ComponentType.BYTE;case Float64Array:return G.ComponentType.FLOAT64}if(typeof Float16Array<"u"&&e.constructor===Float16Array)return G.ComponentType.FLOAT16;throw new Error("Unknown accessor componentType.")}var zc=class extends Ne{init(){this.propertyType="Animation"}getDefaults(){return Object.assign(super.getDefaults(),{channels:new ne,samplers:new ne})}addChannel(e){return this.addRef("channels",e)}removeChannel(e){return this.removeRef("channels",e)}listChannels(){return this.listRefs("channels")}addSampler(e){return this.addRef("samplers",e)}removeSampler(e){return this.removeRef("samplers",e)}listSamplers(){return this.listRefs("samplers")}},si=class extends Ne{static TargetPath={TRANSLATION:"translation",ROTATION:"rotation",SCALE:"scale",WEIGHTS:"weights"};init(){this.propertyType="AnimationChannel"}getDefaults(){return Object.assign(super.getDefaults(),{targetPath:null,targetNode:null,sampler:null})}getTargetPath(){return this.get("targetPath")}setTargetPath(e){return this.set("targetPath",e)}getTargetNode(){return this.getRef("targetNode")}setTargetNode(e){return this.setRef("targetNode",e)}getSampler(){return this.getRef("sampler")}setSampler(e){return this.setRef("sampler",e)}},ir=class Gc extends Ne{static Interpolation={LINEAR:"LINEAR",STEP:"STEP",CUBICSPLINE:"CUBICSPLINE"};init(){this.propertyType="AnimationSampler"}getDefaultAttributes(){return Object.assign(super.getDefaults(),{interpolation:Gc.Interpolation.LINEAR,input:null,output:null})}getInterpolation(){return this.get("interpolation")}setInterpolation(t){return this.set("interpolation",t)}getInput(){return this.getRef("input")}setInput(t){return this.setRef("input",t,{usage:"OTHER"})}getOutput(){return this.getRef("output")}setOutput(t){return this.setRef("output",t,{usage:"OTHER"})}},Kc=class extends Ne{init(){this.propertyType="Buffer"}getDefaults(){return Object.assign(super.getDefaults(),{uri:""})}getURI(){return this.get("uri")}setURI(e){return this.set("uri",e)}},or=class Vc extends Ne{static Type={PERSPECTIVE:"perspective",ORTHOGRAPHIC:"orthographic"};init(){this.propertyType="Camera"}getDefaults(){return Object.assign(super.getDefaults(),{type:Vc.Type.PERSPECTIVE,znear:.1,zfar:100,aspectRatio:null,yfov:Math.PI*2*50/360,xmag:1,ymag:1})}getType(){return this.get("type")}setType(t){return this.set("type",t)}getZNear(){return this.get("znear")}setZNear(t){return this.set("znear",t)}getZFar(){return this.get("zfar")}setZFar(t){return this.set("zfar",t)}getAspectRatio(){return this.get("aspectRatio")}setAspectRatio(t){return this.set("aspectRatio",t)}getYFov(){return this.get("yfov")}setYFov(t){return this.set("yfov",t)}getXMag(){return this.get("xmag")}setXMag(t){return this.set("xmag",t)}getYMag(){return this.get("ymag")}setYMag(t){return this.set("ymag",t)}},X=class extends ai{static EXTENSION_NAME;_validateParent(e){if(!this.parentTypes.includes(e.propertyType))throw new Error(`Parent "${e.propertyType}" invalid for child "${this.propertyType}".`)}},oe=class ei extends Ne{static WrapMode={CLAMP_TO_EDGE:33071,MIRRORED_REPEAT:33648,REPEAT:10497};static MagFilter={NEAREST:9728,LINEAR:9729};static MinFilter={NEAREST:9728,LINEAR:9729,NEAREST_MIPMAP_NEAREST:9984,LINEAR_MIPMAP_NEAREST:9985,NEAREST_MIPMAP_LINEAR:9986,LINEAR_MIPMAP_LINEAR:9987};init(){this.propertyType="TextureInfo"}getDefaults(){return Object.assign(super.getDefaults(),{texCoord:0,magFilter:null,minFilter:null,wrapS:ei.WrapMode.REPEAT,wrapT:ei.WrapMode.REPEAT})}getTexCoord(){return this.get("texCoord")}setTexCoord(t){return this.set("texCoord",t)}getMagFilter(){return this.get("magFilter")}setMagFilter(t){return this.set("magFilter",t)}getMinFilter(){return this.get("minFilter")}setMinFilter(t){return this.set("minFilter",t)}getWrapS(){return this.get("wrapS")}setWrapS(t){return this.set("wrapS",t)}getWrapT(){return this.get("wrapT")}setWrapT(t){return this.set("wrapT",t)}},{R:Js,G:Qs,B:Zs,A:vp}=tt,sr=class Hc extends Ne{static AlphaMode={OPAQUE:"OPAQUE",MASK:"MASK",BLEND:"BLEND"};init(){this.propertyType="Material"}getDefaults(){return Object.assign(super.getDefaults(),{alphaMode:Hc.AlphaMode.OPAQUE,alphaCutoff:.5,doubleSided:!1,baseColorFactor:[1,1,1,1],baseColorTexture:null,baseColorTextureInfo:new oe(this.graph,"baseColorTextureInfo"),emissiveFactor:[0,0,0],emissiveTexture:null,emissiveTextureInfo:new oe(this.graph,"emissiveTextureInfo"),normalScale:1,normalTexture:null,normalTextureInfo:new oe(this.graph,"normalTextureInfo"),occlusionStrength:1,occlusionTexture:null,occlusionTextureInfo:new oe(this.graph,"occlusionTextureInfo"),roughnessFactor:1,metallicFactor:1,metallicRoughnessTexture:null,metallicRoughnessTextureInfo:new oe(this.graph,"metallicRoughnessTextureInfo")})}getDoubleSided(){return this.get("doubleSided")}setDoubleSided(t){return this.set("doubleSided",t)}getAlpha(){return this.get("baseColorFactor")[3]}setAlpha(t){let a=this.get("baseColorFactor").slice();return a[3]=t,this.set("baseColorFactor",a)}getAlphaMode(){return this.get("alphaMode")}setAlphaMode(t){return this.set("alphaMode",t)}getAlphaCutoff(){return this.get("alphaCutoff")}setAlphaCutoff(t){return this.set("alphaCutoff",t)}getBaseColorFactor(){return this.get("baseColorFactor")}setBaseColorFactor(t){return this.set("baseColorFactor",t)}getBaseColorTexture(){return this.getRef("baseColorTexture")}getBaseColorTextureInfo(){return this.getRef("baseColorTexture")?this.getRef("baseColorTextureInfo"):null}setBaseColorTexture(t){return this.setRef("baseColorTexture",t,{channels:Js|Qs|Zs|vp,isColor:!0})}getEmissiveFactor(){return this.get("emissiveFactor")}setEmissiveFactor(t){return this.set("emissiveFactor",t)}getEmissiveTexture(){return this.getRef("emissiveTexture")}getEmissiveTextureInfo(){return this.getRef("emissiveTexture")?this.getRef("emissiveTextureInfo"):null}setEmissiveTexture(t){return this.setRef("emissiveTexture",t,{channels:Js|Qs|Zs,isColor:!0})}getNormalScale(){return this.get("normalScale")}setNormalScale(t){return this.set("normalScale",t)}getNormalTexture(){return this.getRef("normalTexture")}getNormalTextureInfo(){return this.getRef("normalTexture")?this.getRef("normalTextureInfo"):null}setNormalTexture(t){return this.setRef("normalTexture",t,{channels:Js|Qs|Zs})}getOcclusionStrength(){return this.get("occlusionStrength")}setOcclusionStrength(t){return this.set("occlusionStrength",t)}getOcclusionTexture(){return this.getRef("occlusionTexture")}getOcclusionTextureInfo(){return this.getRef("occlusionTexture")?this.getRef("occlusionTextureInfo"):null}setOcclusionTexture(t){return this.setRef("occlusionTexture",t,{channels:Js})}getRoughnessFactor(){return this.get("roughnessFactor")}setRoughnessFactor(t){return this.set("roughnessFactor",t)}getMetallicFactor(){return this.get("metallicFactor")}setMetallicFactor(t){return this.set("metallicFactor",t)}getMetallicRoughnessTexture(){return this.getRef("metallicRoughnessTexture")}getMetallicRoughnessTextureInfo(){return this.getRef("metallicRoughnessTexture")?this.getRef("metallicRoughnessTextureInfo"):null}setMetallicRoughnessTexture(t){return this.setRef("metallicRoughnessTexture",t,{channels:Qs|Zs})}},qc=class extends Ne{init(){this.propertyType="Mesh"}getDefaults(){return Object.assign(super.getDefaults(),{weights:[],primitives:new ne})}addPrimitive(e){return this.addRef("primitives",e)}removePrimitive(e){return this.removeRef("primitives",e)}listPrimitives(){return this.listRefs("primitives")}getWeights(){return this.get("weights")}setWeights(e){return this.set("weights",e)}},Wc=class extends Ne{init(){this.propertyType="Node"}getDefaults(){return Object.assign(super.getDefaults(),{translation:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1],weights:[],camera:null,mesh:null,skin:null,children:new ne})}copy(e,t=Bt){if(t===Bt)throw new Error("Node cannot be copied.");return super.copy(e,t)}getTranslation(){return this.get("translation")}getRotation(){return this.get("rotation")}getScale(){return this.get("scale")}setTranslation(e){return this.set("translation",e)}setRotation(e){return this.set("rotation",e)}setScale(e){return this.set("scale",e)}getMatrix(){return le.compose(this.get("translation"),this.get("rotation"),this.get("scale"),[])}setMatrix(e){let t=this.get("translation").slice(),a=this.get("rotation").slice(),s=this.get("scale").slice();return le.decompose(e,t,a,s),this.set("translation",t).set("rotation",a).set("scale",s)}getWorldTranslation(){let e=[0,0,0];return le.decompose(this.getWorldMatrix(),e,[0,0,0,1],[1,1,1]),e}getWorldRotation(){let e=[0,0,0,1];return le.decompose(this.getWorldMatrix(),[0,0,0],e,[1,1,1]),e}getWorldScale(){let e=[1,1,1];return le.decompose(this.getWorldMatrix(),[0,0,0],[0,0,0,1],e),e}getWorldMatrix(){let e=[];for(let s=this;s!=null;s=s.getParentNode())e.push(s);let t,a=e.pop().getMatrix();for(;t=e.pop();)cp(a,a,t.getMatrix());return a}addChild(e){let t=e.getParentNode();t&&t.removeChild(e);for(let a of e.listParents())a.propertyType==="Scene"&&a.removeChild(e);return this.addRef("children",e)}removeChild(e){return this.removeRef("children",e)}listChildren(){return this.listRefs("children")}getParentNode(){for(let e of this.listParents())if(e.propertyType==="Node")return e;return null}getMesh(){return this.getRef("mesh")}setMesh(e){return this.setRef("mesh",e)}getCamera(){return this.getRef("camera")}setCamera(e){return this.setRef("camera",e)}getSkin(){return this.getRef("skin")}setSkin(e){return this.setRef("skin",e)}getWeights(){return this.get("weights")}setWeights(e){return this.set("weights",e)}traverse(e){e(this);for(let t of this.listChildren())t.traverse(e);return this}},$a=class Xc extends Ne{static Mode={POINTS:0,LINES:1,LINE_LOOP:2,LINE_STRIP:3,TRIANGLES:4,TRIANGLE_STRIP:5,TRIANGLE_FAN:6};init(){this.propertyType="Primitive"}getDefaults(){return Object.assign(super.getDefaults(),{mode:Xc.Mode.TRIANGLES,material:null,indices:null,attributes:new ge,targets:new ne})}getIndices(){return this.getRef("indices")}setIndices(t){return this.setRef("indices",t,{usage:"ELEMENT_ARRAY_BUFFER"})}getAttribute(t){return this.getRefMap("attributes",t)}setAttribute(t,a){return this.setRefMap("attributes",t,a,{usage:"ARRAY_BUFFER"})}listAttributes(){return this.listRefMapValues("attributes")}listSemantics(){return this.listRefMapKeys("attributes")}getMaterial(){return this.getRef("material")}setMaterial(t){return this.setRef("material",t)}getMode(){return this.get("mode")}setMode(t){return this.set("mode",t)}listTargets(){return this.listRefs("targets")}addTarget(t){return this.addRef("targets",t)}removeTarget(t){return this.removeRef("targets",t)}},Mp=class extends ai{init(){this.propertyType="PrimitiveTarget"}getDefaults(){return Object.assign(super.getDefaults(),{attributes:new ge})}getAttribute(e){return this.getRefMap("attributes",e)}setAttribute(e,t){return this.setRefMap("attributes",e,t,{usage:"ARRAY_BUFFER"})}listAttributes(){return this.listRefMapValues("attributes")}listSemantics(){return this.listRefMapKeys("attributes")}},$c=class extends Ne{init(){this.propertyType="Scene"}getDefaults(){return Object.assign(super.getDefaults(),{children:new ne})}copy(e,t=Bt){if(t===Bt)throw new Error("Scene cannot be copied.");return super.copy(e,t)}addChild(e){let t=e.getParentNode();return t&&t.removeChild(e),this.addRef("children",e)}removeChild(e){return this.removeRef("children",e)}listChildren(){return this.listRefs("children")}traverse(e){for(let t of this.listChildren())t.traverse(e);return this}},Yc=class extends Ne{init(){this.propertyType="Skin"}getDefaults(){return Object.assign(super.getDefaults(),{skeleton:null,inverseBindMatrices:null,joints:new ne})}getSkeleton(){return this.getRef("skeleton")}setSkeleton(e){return this.setRef("skeleton",e)}getInverseBindMatrices(){return this.getRef("inverseBindMatrices")}setInverseBindMatrices(e){return this.setRef("inverseBindMatrices",e,{usage:"INVERSE_BIND_MATRICES"})}addJoint(e){return this.addRef("joints",e)}removeJoint(e){return this.removeRef("joints",e)}listJoints(){return this.listRefs("joints")}},Jc=class extends Ne{init(){this.propertyType="Texture"}getDefaults(){return Object.assign(super.getDefaults(),{image:null,mimeType:"",uri:""})}getMimeType(){return this.get("mimeType")||ct.extensionToMimeType(wa.extension(this.get("uri")))}setMimeType(e){return this.set("mimeType",e)}getURI(){return this.get("uri")}setURI(e){this.set("uri",e);let t=ct.extensionToMimeType(wa.extension(e));return t&&this.set("mimeType",t),this}getImage(){return this.get("image")}setImage(e){return this.set("image",q.assertView(e))}getSize(){let e=this.get("image");return e?ct.getSize(e,this.getMimeType()):null}},ri=class extends Ne{_extensions=new Set;init(){this.propertyType="Root"}getDefaults(){return Object.assign(super.getDefaults(),{asset:{generator:`glTF-Transform ${Fc}`,version:"2.0"},defaultScene:null,accessors:new ne,animations:new ne,buffers:new ne,cameras:new ne,materials:new ne,meshes:new ne,nodes:new ne,scenes:new ne,skins:new ne,textures:new ne})}constructor(e){super(e),e.addEventListener("node:create",t=>{this._addChildOfRoot(t.target)})}clone(){throw new Error("Root cannot be cloned.")}copy(e,t=Bt){if(t===Bt)throw new Error("Root cannot be copied.");this.set("asset",{...e.get("asset")}),this.setName(e.getName()),this.setExtras({...e.getExtras()}),this.setDefaultScene(e.getDefaultScene()?t(e.getDefaultScene()):null);for(let a of e.listRefMapKeys("extensions")){let s=e.getExtension(a);this.setExtension(a,t(s))}return this}_addChildOfRoot(e){return e instanceof $c?this.addRef("scenes",e):e instanceof Wc?this.addRef("nodes",e):e instanceof or?this.addRef("cameras",e):e instanceof Yc?this.addRef("skins",e):e instanceof qc?this.addRef("meshes",e):e instanceof sr?this.addRef("materials",e):e instanceof Jc?this.addRef("textures",e):e instanceof zc?this.addRef("animations",e):e instanceof G?this.addRef("accessors",e):e instanceof Kc&&this.addRef("buffers",e),this}getAsset(){return this.get("asset")}listExtensionsUsed(){return Array.from(this._extensions)}listExtensionsRequired(){return this.listExtensionsUsed().filter(e=>e.isRequired())}_enableExtension(e){return this._extensions.add(e),this}_disableExtension(e){return this._extensions.delete(e),this}listScenes(){return this.listRefs("scenes")}setDefaultScene(e){return this.setRef("defaultScene",e)}getDefaultScene(){return this.getRef("defaultScene")}listNodes(){return this.listRefs("nodes")}listCameras(){return this.listRefs("cameras")}listSkins(){return this.listRefs("skins")}listMeshes(){return this.listRefs("meshes")}listMaterials(){return this.listRefs("materials")}listTextures(){return this.listRefs("textures")}listAnimations(){return this.listRefs("animations")}listAccessors(){return this.listRefs("accessors")}listBuffers(){return this.listRefs("buffers")}},kp=class ti{_graph=new $n;_root=new ri(this._graph);_logger=nr.DEFAULT_INSTANCE;static _GRAPH_DOCUMENTS=new WeakMap;static fromGraph(t){return ti._GRAPH_DOCUMENTS.get(t)||null}constructor(){ti._GRAPH_DOCUMENTS.set(this._graph,this)}getRoot(){return this._root}getGraph(){return this._graph}getLogger(){return this._logger}setLogger(t){return this._logger=t,this}clone(){throw new Error("Use 'cloneDocument(source)' from '@gltf-transform/functions'.")}merge(t){throw new Error("Use 'mergeDocuments(target, source)' from '@gltf-transform/functions'.")}async transform(...t){let a=t.map(s=>s.name);for(let s of t)await s(this,{stack:a});return this}hasExtension(t){return this.getRoot().listExtensionsUsed().some(a=>a.extensionName===t)}createExtension(t){let a=t.EXTENSION_NAME;return this.getRoot().listExtensionsUsed().find(s=>s.extensionName===a)||new t(this)}disposeExtension(t){let a=this.getRoot().listExtensionsUsed().find(s=>s.extensionName===t);a&&a.dispose()}createScene(t=""){return new $c(this._graph,t)}createNode(t=""){return new Wc(this._graph,t)}createCamera(t=""){return new or(this._graph,t)}createSkin(t=""){return new Yc(this._graph,t)}createMesh(t=""){return new qc(this._graph,t)}createPrimitive(){return new $a(this._graph)}createPrimitiveTarget(t=""){return new Mp(this._graph,t)}createMaterial(t=""){return new sr(this._graph,t)}createTexture(t=""){return new Jc(this._graph,t)}createAnimation(t=""){return new zc(this._graph,t)}createAnimationChannel(t=""){return new si(this._graph,t)}createAnimationSampler(t=""){return new ir(this._graph,t)}createAccessor(t="",a=null){return a||(a=this.getRoot().listBuffers()[0]),new G(this._graph,t).setBuffer(a)}createBuffer(t=""){return new Kc(this._graph,t)}},ae=class{static EXTENSION_NAME;extensionName="";prereadTypes=[];prewriteTypes=[];readDependencies=[];writeDependencies=[];document;required=!1;properties=new Set;_listener;constructor(e){this.document=e,e.getRoot()._enableExtension(this),this._listener=a=>{let s=a,r=s.target;r instanceof X&&r.extensionName===this.extensionName&&(s.type==="node:create"&&this._addExtensionProperty(r),s.type==="node:dispose"&&this._removeExtensionProperty(r))};let t=e.getGraph();t.addEventListener("node:create",this._listener),t.addEventListener("node:dispose",this._listener)}dispose(){this.document.getRoot()._disableExtension(this);let e=this.document.getGraph();e.removeEventListener("node:create",this._listener),e.removeEventListener("node:dispose",this._listener);for(let t of this.properties)t.dispose()}static register(){}isRequired(){return this.required}setRequired(e){return this.required=e,this}listProperties(){return Array.from(this.properties)}_addExtensionProperty(e){return this.properties.add(e),this}_removeExtensionProperty(e){return this.properties.delete(e),this}install(e,t){return this}preread(e,t){return this}prewrite(e,t){return this}},Ep=class{jsonDoc;buffers=[];bufferViews=[];bufferViewBuffers=[];accessors=[];textures=[];textureInfos=new Map;materials=[];meshes=[];cameras=[];nodes=[];skins=[];animations=[];scenes=[];constructor(e){this.jsonDoc=e}setTextureInfo(e,t){this.textureInfos.set(e,t),t.texCoord!==void 0&&e.setTexCoord(t.texCoord),t.extras!==void 0&&e.setExtras(t.extras);let a=this.jsonDoc.json.textures[t.index];if(a.sampler===void 0)return;let s=this.jsonDoc.json.samplers[a.sampler];s.magFilter!==void 0&&e.setMagFilter(s.magFilter),s.minFilter!==void 0&&e.setMinFilter(s.minFilter),s.wrapS!==void 0&&e.setWrapS(s.wrapS),s.wrapT!==void 0&&e.setWrapT(s.wrapT)}},Nc={logger:nr.DEFAULT_INSTANCE,extensions:[],dependencies:{}},Sp=new Set(["Buffer","Texture","Material","Mesh","Primitive","Node","Scene"]),Tp=class{static read(e,t=Nc){let a={...Nc,...t},{json:s}=e,r=new kp().setLogger(a.logger);this.validate(e,a);let n=new Ep(e),i=s.asset,o=r.getRoot().getAsset();i.copyright&&(o.copyright=i.copyright),i.extras&&(o.extras=i.extras),s.extras!==void 0&&r.getRoot().setExtras({...s.extras});let c=s.extensionsUsed||[],l=s.extensionsRequired||[];a.extensions.sort((p,m)=>p.EXTENSION_NAME>m.EXTENSION_NAME?1:-1);for(let p of a.extensions)if(c.includes(p.EXTENSION_NAME)){let m=r.createExtension(p).setRequired(l.includes(p.EXTENSION_NAME)),y=m.prereadTypes.filter(v=>!Sp.has(v));y.length&&a.logger.warn(`Preread hooks for some types (${y.join()}), requested by extension ${m.extensionName}, are unsupported. Please file an issue or a PR.`);for(let v of m.readDependencies)m.install(v,a.dependencies[v])}let f=s.buffers||[];r.getRoot().listExtensionsUsed().filter(p=>p.prereadTypes.includes("Buffer")).forEach(p=>p.preread(n,"Buffer")),n.buffers=f.map(p=>{let m=r.createBuffer(p.name);return p.extras&&m.setExtras(p.extras),p.uri&&p.uri.indexOf("__")!==0&&m.setURI(p.uri),m}),n.bufferViewBuffers=(s.bufferViews||[]).map((p,m)=>{if(!n.bufferViews[m]){let y=e.json.buffers[p.buffer],v=y.uri?e.resources[y.uri]:e.resources[Ct],E=p.byteOffset||0;n.bufferViews[m]=q.toView(v,E,p.byteLength)}return n.buffers[p.buffer]});let u=s.accessors||[];n.accessors=u.map(p=>{let m=n.bufferViewBuffers[p.bufferView],y=r.createAccessor(p.name,m).setType(p.type);return p.extras&&y.setExtras(p.extras),p.normalized!==void 0&&y.setNormalized(p.normalized),p.bufferView===void 0||y.setArray(tr(p,n)),y});let g=s.images||[],b=s.textures||[];r.getRoot().listExtensionsUsed().filter(p=>p.prereadTypes.includes("Texture")).forEach(p=>p.preread(n,"Texture")),n.textures=g.map(p=>{let m=r.createTexture(p.name);if(p.extras&&m.setExtras(p.extras),p.bufferView!==void 0){let y=s.bufferViews[p.bufferView],v=e.json.buffers[y.buffer],E=v.uri?e.resources[v.uri]:e.resources[Ct],S=y.byteOffset||0,T=y.byteLength,A=E.slice(S,S+T);m.setImage(A)}else p.uri!==void 0&&(m.setImage(e.resources[p.uri]),p.uri.indexOf("__")!==0&&m.setURI(p.uri));if(p.mimeType!==void 0)m.setMimeType(p.mimeType);else if(p.uri){let y=wa.extension(p.uri);m.setMimeType(ct.extensionToMimeType(y))}return m}),r.getRoot().listExtensionsUsed().filter(p=>p.prereadTypes.includes("Material")).forEach(p=>p.preread(n,"Material")),n.materials=(s.materials||[]).map(p=>{let m=r.createMaterial(p.name);p.extras&&m.setExtras(p.extras),p.alphaMode!==void 0&&m.setAlphaMode(p.alphaMode),p.alphaCutoff!==void 0&&m.setAlphaCutoff(p.alphaCutoff),p.doubleSided!==void 0&&m.setDoubleSided(p.doubleSided);let y=p.pbrMetallicRoughness||{};if(y.baseColorFactor!==void 0&&m.setBaseColorFactor(y.baseColorFactor),p.emissiveFactor!==void 0&&m.setEmissiveFactor(p.emissiveFactor),y.metallicFactor!==void 0&&m.setMetallicFactor(y.metallicFactor),y.roughnessFactor!==void 0&&m.setRoughnessFactor(y.roughnessFactor),y.baseColorTexture!==void 0){let v=y.baseColorTexture,E=n.textures[b[v.index].source];m.setBaseColorTexture(E),n.setTextureInfo(m.getBaseColorTextureInfo(),v)}if(p.emissiveTexture!==void 0){let v=p.emissiveTexture,E=n.textures[b[v.index].source];m.setEmissiveTexture(E),n.setTextureInfo(m.getEmissiveTextureInfo(),v)}if(p.normalTexture!==void 0){let v=p.normalTexture,E=n.textures[b[v.index].source];m.setNormalTexture(E),n.setTextureInfo(m.getNormalTextureInfo(),v),p.normalTexture.scale!==void 0&&m.setNormalScale(p.normalTexture.scale)}if(p.occlusionTexture!==void 0){let v=p.occlusionTexture,E=n.textures[b[v.index].source];m.setOcclusionTexture(E),n.setTextureInfo(m.getOcclusionTextureInfo(),v),p.occlusionTexture.strength!==void 0&&m.setOcclusionStrength(p.occlusionTexture.strength)}if(y.metallicRoughnessTexture!==void 0){let v=y.metallicRoughnessTexture,E=n.textures[b[v.index].source];m.setMetallicRoughnessTexture(E),n.setTextureInfo(m.getMetallicRoughnessTextureInfo(),v)}return m}),r.getRoot().listExtensionsUsed().filter(p=>p.prereadTypes.includes("Mesh")).forEach(p=>p.preread(n,"Mesh"));let h=s.meshes||[];r.getRoot().listExtensionsUsed().filter(p=>p.prereadTypes.includes("Primitive")).forEach(p=>p.preread(n,"Primitive")),n.meshes=h.map(p=>{let m=r.createMesh(p.name);return p.extras&&m.setExtras(p.extras),p.weights!==void 0&&m.setWeights(p.weights),(p.primitives||[]).forEach(y=>{let v=r.createPrimitive();y.extras&&v.setExtras(y.extras),y.material!==void 0&&v.setMaterial(n.materials[y.material]),y.mode!==void 0&&v.setMode(y.mode);for(let[S,T]of Object.entries(y.attributes||{}))v.setAttribute(S,n.accessors[T]);y.indices!==void 0&&v.setIndices(n.accessors[y.indices]);let E=p.extras&&p.extras.targetNames||[];(y.targets||[]).forEach((S,T)=>{let A=E[T]||T.toString(),_=r.createPrimitiveTarget(A);for(let[R,C]of Object.entries(S))_.setAttribute(R,n.accessors[C]);v.addTarget(_)}),m.addPrimitive(v)}),m}),n.cameras=(s.cameras||[]).map(p=>{let m=r.createCamera(p.name).setType(p.type);if(p.extras&&m.setExtras(p.extras),p.type===or.Type.PERSPECTIVE){let y=p.perspective;m.setYFov(y.yfov),m.setZNear(y.znear),y.zfar!==void 0&&m.setZFar(y.zfar),y.aspectRatio!==void 0&&m.setAspectRatio(y.aspectRatio)}else{let y=p.orthographic;m.setZNear(y.znear).setZFar(y.zfar).setXMag(y.xmag).setYMag(y.ymag)}return m});let d=s.nodes||[];r.getRoot().listExtensionsUsed().filter(p=>p.prereadTypes.includes("Node")).forEach(p=>p.preread(n,"Node")),n.nodes=d.map(p=>{let m=r.createNode(p.name);if(p.extras&&m.setExtras(p.extras),p.translation!==void 0&&m.setTranslation(p.translation),p.rotation!==void 0&&m.setRotation(p.rotation),p.scale!==void 0&&m.setScale(p.scale),p.matrix!==void 0){let y=[0,0,0],v=[0,0,0,1],E=[1,1,1];le.decompose(p.matrix,y,v,E),m.setTranslation(y),m.setRotation(v),m.setScale(E)}return p.weights!==void 0&&m.setWeights(p.weights),m}),n.skins=(s.skins||[]).map(p=>{let m=r.createSkin(p.name);p.extras&&m.setExtras(p.extras),p.inverseBindMatrices!==void 0&&m.setInverseBindMatrices(n.accessors[p.inverseBindMatrices]),p.skeleton!==void 0&&m.setSkeleton(n.nodes[p.skeleton]);for(let y of p.joints)m.addJoint(n.nodes[y]);return m}),d.map((p,m)=>{let y=n.nodes[m];(p.children||[]).forEach(v=>y.addChild(n.nodes[v])),p.mesh!==void 0&&y.setMesh(n.meshes[p.mesh]),p.camera!==void 0&&y.setCamera(n.cameras[p.camera]),p.skin!==void 0&&y.setSkin(n.skins[p.skin])}),n.animations=(s.animations||[]).map(p=>{let m=r.createAnimation(p.name);p.extras&&m.setExtras(p.extras);let y=(p.samplers||[]).map(v=>{let E=r.createAnimationSampler().setInput(n.accessors[v.input]).setOutput(n.accessors[v.output]).setInterpolation(v.interpolation||ir.Interpolation.LINEAR);return v.extras&&E.setExtras(v.extras),m.addSampler(E),E});return(p.channels||[]).forEach(v=>{let E=r.createAnimationChannel().setSampler(y[v.sampler]).setTargetPath(v.target.path);v.target.node!==void 0&&E.setTargetNode(n.nodes[v.target.node]),v.extras&&E.setExtras(v.extras),m.addChannel(E)}),m});let x=s.scenes||[];return r.getRoot().listExtensionsUsed().filter(p=>p.prereadTypes.includes("Scene")).forEach(p=>p.preread(n,"Scene")),n.scenes=x.map(p=>{let m=r.createScene(p.name);return p.extras&&m.setExtras(p.extras),(p.nodes||[]).map(y=>n.nodes[y]).forEach(y=>m.addChild(y)),m}),s.scene!==void 0&&r.getRoot().setDefaultScene(n.scenes[s.scene]),r.getRoot().listExtensionsUsed().forEach(p=>p.read(n)),u.forEach((p,m)=>{let y=n.accessors[m],v=!!p.sparse,E=!p.bufferView&&!y.getArray();(v||E)&&y.setSparse(!0).setArray(Ap(p,n))}),r}static validate(e,t){let a=e.json;if(a.asset.version!=="2.0")throw new Error(`Unsupported glTF version, "${a.asset.version}".`);if(a.extensionsRequired){for(let s of a.extensionsRequired)if(!t.extensions.find(r=>r.EXTENSION_NAME===s))throw new Error(`Missing required extension, "${s}".`)}if(a.extensionsUsed)for(let s of a.extensionsUsed)t.extensions.find(r=>r.EXTENSION_NAME===s)||t.logger.warn(`Missing optional extension, "${s}".`)}};function Ip(e,t){let a=t.jsonDoc,s=t.bufferViews[e.bufferView],r=a.json.bufferViews[e.bufferView],n=rr[e.componentType],i=G.getElementSize(e.type),o=n.BYTES_PER_ELEMENT,c=e.byteOffset||0,l=new n(e.count*i),f=new DataView(s.buffer,s.byteOffset,s.byteLength),u=r.byteStride;for(let g=0;g<e.count;g++)for(let b=0;b<i;b++){let h=c+g*u+b*o,d;switch(e.componentType){case G.ComponentType.FLOAT:d=f.getFloat32(h,!0);break;case G.ComponentType.UNSIGNED_INT:d=f.getUint32(h,!0);break;case G.ComponentType.UNSIGNED_SHORT:d=f.getUint16(h,!0);break;case G.ComponentType.UNSIGNED_BYTE:d=f.getUint8(h);break;case G.ComponentType.SHORT:d=f.getInt16(h,!0);break;case G.ComponentType.BYTE:d=f.getInt8(h);break;case G.ComponentType.FLOAT16:d=f.getFloat16(h,!0);break;case G.ComponentType.FLOAT64:d=f.getFloat64(h,!0);break;default:throw new Error(`Unexpected componentType "${e.componentType}".`)}l[g*i+b]=d}return l}function tr(e,t){let a=t.jsonDoc,s=t.bufferViews[e.bufferView],r=a.json.bufferViews[e.bufferView],n=rr[e.componentType],i=G.getElementSize(e.type),o=n.BYTES_PER_ELEMENT,c=i*o;if(r.byteStride!==void 0&&r.byteStride!==c)return Ip(e,t);let l=s.byteOffset+(e.byteOffset||0),f=e.count*i*o;return new n(s.buffer.slice(l,l+f))}function Ap(e,t){let a=rr[e.componentType],s=G.getElementSize(e.type),r;e.bufferView!==void 0?r=tr(e,t):r=new a(e.count*s);let n=e.sparse;if(!n)return r;let i=n.count,o={...e,...n.indices,count:i,type:"SCALAR"},c={...e,...n.values,count:i},l=tr(o,t),f=tr(c,t);for(let u=0;u<o.count;u++)for(let g=0;g<s;g++)r[l[u]*s+g]=f[u*s+g];return r}var Qc=(function(e){return e[e.ARRAY_BUFFER=34962]="ARRAY_BUFFER",e[e.ELEMENT_ARRAY_BUFFER=34963]="ELEMENT_ARRAY_BUFFER",e})(Qc||{}),Nt=class{_doc;jsonDoc;options;static BufferViewTarget=Qc;static BufferViewUsage=Qb;static USAGE_TO_TARGET={ARRAY_BUFFER:34962,ELEMENT_ARRAY_BUFFER:34963};accessorIndexMap=new Map;animationIndexMap=new Map;bufferIndexMap=new Map;cameraIndexMap=new Map;skinIndexMap=new Map;materialIndexMap=new Map;meshIndexMap=new Map;nodeIndexMap=new Map;imageIndexMap=new Map;textureDefIndexMap=new Map;textureInfoDefMap=new Map;samplerDefIndexMap=new Map;sceneIndexMap=new Map;imageBufferViews=[];otherBufferViews=new Map;otherBufferViewsIndexMap=new Map;extensionData={};bufferURIGenerator;imageURIGenerator;logger;_accessorUsageMap=new Map;accessorUsageGroupedByParent=new Set(["ARRAY_BUFFER"]);accessorParents=new Map;constructor(e,t,a){this._doc=e,this.jsonDoc=t,this.options=a;let s=e.getRoot(),r=s.listBuffers().length,n=s.listTextures().length;this.bufferURIGenerator=new Cc(r>1,()=>a.basename||"buffer"),this.imageURIGenerator=new Cc(n>1,i=>_p(e,i)||a.basename||"texture"),this.logger=e.getLogger()}createTextureInfoDef(e,t){let a={magFilter:t.getMagFilter()||void 0,minFilter:t.getMinFilter()||void 0,wrapS:t.getWrapS(),wrapT:t.getWrapT()},s=JSON.stringify(a);this.samplerDefIndexMap.has(s)||(this.samplerDefIndexMap.set(s,this.jsonDoc.json.samplers.length),this.jsonDoc.json.samplers.push(a));let r={source:this.imageIndexMap.get(e),sampler:this.samplerDefIndexMap.get(s)},n=JSON.stringify(r);this.textureDefIndexMap.has(n)||(this.textureDefIndexMap.set(n,this.jsonDoc.json.textures.length),this.jsonDoc.json.textures.push(r));let i={index:this.textureDefIndexMap.get(n)};return t.getTexCoord()!==0&&(i.texCoord=t.getTexCoord()),Object.keys(t.getExtras()).length>0&&(i.extras=t.getExtras()),this.textureInfoDefMap.set(t,i),i}createPropertyDef(e){let t={};return e.getName()&&(t.name=e.getName()),Object.keys(e.getExtras()).length>0&&(t.extras=e.getExtras()),t}createAccessorDef(e){let t=this.createPropertyDef(e);return t.type=e.getType(),t.componentType=e.getComponentType(),t.count=e.getCount(),this._doc.getGraph().listParentEdges(e).some(a=>a.getName()==="attributes"&&a.getAttributes().key==="POSITION"||a.getName()==="input")&&(t.max=e.getMax([]).map(Math.fround),t.min=e.getMin([]).map(Math.fround)),e.getNormalized()&&(t.normalized=e.getNormalized()),t}createImageData(e,t,a){if(this.options.format==="GLB")this.imageBufferViews.push(t),e.bufferView=this.jsonDoc.json.bufferViews.length,this.jsonDoc.json.bufferViews.push({buffer:0,byteOffset:-1,byteLength:t.byteLength});else{let s=ct.mimeTypeToExtension(a.getMimeType());e.uri=this.imageURIGenerator.createURI(a,s),this.assignResourceURI(e.uri,t,!1)}}assignResourceURI(e,t,a){let s=this.jsonDoc.resources;if(!(e in s)){s[e]=t;return}if(t===s[e]){this.logger.warn(`Duplicate resource URI, "${e}".`);return}let r=`Resource URI "${e}" already assigned to different data.`;if(!a){this.logger.warn(r);return}throw new Error(r)}getAccessorUsage(e){let t=this._accessorUsageMap.get(e);if(t)return t;if(e.getSparse())return"SPARSE";for(let a of this._doc.getGraph().listParentEdges(e)){let{usage:s}=a.getAttributes();if(s)return s;a.getParent().propertyType!=="Root"&&this.logger.warn(`Missing attribute ".usage" on edge, "${a.getName()}".`)}return"OTHER"}addAccessorToUsageGroup(e,t){let a=this._accessorUsageMap.get(e);if(a&&a!==t)throw new Error(`Accessor with usage "${a}" cannot be reused as "${t}".`);return this._accessorUsageMap.set(e,t),this}},Cc=class{multiple;basename;counter={};constructor(e,t){this.multiple=e,this.basename=t}createURI(e,t){if(e.getURI())return e.getURI();if(this.multiple){let a=this.basename(e);return this.counter[a]=this.counter[a]||1,`${a}_${this.counter[a]++}.${t}`}else return`${this.basename(e)}.${t}`}};function _p(e,t){let a=e.getGraph().listParentEdges(t).find(s=>s.getParent()!==e.getRoot());return a?a.getName().replace(/texture$/i,""):""}var{BufferViewUsage:er}=Nt,{UNSIGNED_INT:Rp,UNSIGNED_SHORT:Np,UNSIGNED_BYTE:Cp}=G.ComponentType,Bp=new Set(["Accessor","Buffer","Material","Mesh"]),Fp=class{static write(e,t){let a=e.getGraph(),s=e.getRoot(),r={asset:{generator:`glTF-Transform ${Fc}`,...s.getAsset()},extras:{...s.getExtras()}},n={json:r,resources:{}},i=new Nt(e,n,t),o=t.logger||nr.DEFAULT_INSTANCE,c=new Set(t.extensions.map(d=>d.EXTENSION_NAME)),l=e.getRoot().listExtensionsUsed().filter(d=>c.has(d.extensionName)).sort((d,x)=>d.extensionName>x.extensionName?1:-1),f=e.getRoot().listExtensionsRequired().filter(d=>c.has(d.extensionName)).sort((d,x)=>d.extensionName>x.extensionName?1:-1);l.length<e.getRoot().listExtensionsUsed().length&&o.warn("Some extensions were not registered for I/O, and will not be written.");for(let d of l){let x=d.prewriteTypes.filter(p=>!Bp.has(p));x.length&&o.warn(`Prewrite hooks for some types (${x.join()}), requested by extension ${d.extensionName}, are unsupported. Please file an issue or a PR.`);for(let p of d.writeDependencies)d.install(p,t.dependencies[p])}function u(d,x,p,m){let y=[],v=0;for(let S of d){let T=i.createAccessorDef(S);T.bufferView=r.bufferViews.length;let A=S.getArray(),_=q.pad(q.toView(A));T.byteOffset=v,v+=_.byteLength,y.push(_),i.accessorIndexMap.set(S,r.accessors.length),r.accessors.push(T)}let E={buffer:x,byteOffset:p,byteLength:q.concat(y).byteLength};return m&&(E.target=m),r.bufferViews.push(E),{buffers:y,byteLength:v}}function g(d,x,p){let m=d[0].getCount(),y=0;for(let A of d){let _=i.createAccessorDef(A);_.bufferView=r.bufferViews.length,_.byteOffset=y;let R=A.getElementSize(),C=A.getComponentSize();y+=q.padNumber(R*C),i.accessorIndexMap.set(A,r.accessors.length),r.accessors.push(_)}let v=m*y,E=new ArrayBuffer(v),S=new DataView(E);for(let A=0;A<m;A++){let _=0;for(let R of d){let C=R.getElementSize(),F=R.getComponentSize(),O=R.getComponentType(),V=R.getArray();for(let $=0;$<C;$++){let re=A*y+_+$*F,de=V[A*C+$];switch(O){case G.ComponentType.FLOAT:S.setFloat32(re,de,!0);break;case G.ComponentType.BYTE:S.setInt8(re,de);break;case G.ComponentType.SHORT:S.setInt16(re,de,!0);break;case G.ComponentType.UNSIGNED_BYTE:S.setUint8(re,de);break;case G.ComponentType.UNSIGNED_SHORT:S.setUint16(re,de,!0);break;case G.ComponentType.UNSIGNED_INT:S.setUint32(re,de,!0);break;case G.ComponentType.FLOAT16:S.setFloat16(re,de,!0);break;case G.ComponentType.FLOAT64:S.setFloat64(re,de,!0);break;default:throw new Error("Unexpected component type: "+O)}}_+=q.padNumber(C*F)}}let T={buffer:x,byteOffset:p,byteLength:v,byteStride:y,target:Nt.BufferViewTarget.ARRAY_BUFFER};return r.bufferViews.push(T),{byteLength:v,buffers:[new Uint8Array(E)]}}function b(d,x,p){let m=[],y=0,v=new Map,E=-1/0,S=!1;for(let O of d){let V=i.createAccessorDef(O);r.accessors.push(V),i.accessorIndexMap.set(O,r.accessors.length-1);let $=[],re=[],de=[],Ke=new Array(O.getElementSize()).fill(0);for(let _e=0,it=O.getCount();_e<it;_e++)if(O.getElement(_e,de),!le.eq(de,Ke,0)){E=Math.max(_e,E),$.push(_e);for(let Ze=0;Ze<de.length;Ze++)re.push(de[Ze])}let be=$.length,Ve={accessorDef:V,count:be};if(v.set(O,Ve),be===0)continue;be>O.getCount()/2&&(S=!0);let Qe=rr[O.getComponentType()];Ve.indices=$,Ve.values=new Qe(re)}if(!Number.isFinite(E))return{buffers:m,byteLength:y};S&&o.warn("Some sparse accessors have >50% non-zero elements, which may increase file size.");let T=E<255?Uint8Array:E<65535?Uint16Array:Uint32Array,A=E<255?Cp:E<65535?Np:Rp,_={buffer:x,byteOffset:p+y,byteLength:0};for(let O of d){let V=v.get(O);if(V.count===0)continue;V.indicesByteOffset=_.byteLength;let $=q.pad(q.toView(new T(V.indices)));m.push($),y+=$.byteLength,_.byteLength+=$.byteLength}r.bufferViews.push(_);let R=r.bufferViews.length-1,C={buffer:x,byteOffset:p+y,byteLength:0};for(let O of d){let V=v.get(O);if(V.count===0)continue;V.valuesByteOffset=C.byteLength;let $=q.pad(q.toView(V.values));m.push($),y+=$.byteLength,C.byteLength+=$.byteLength}r.bufferViews.push(C);let F=r.bufferViews.length-1;for(let O of d){let V=v.get(O);V.count!==0&&(V.accessorDef.sparse={count:V.count,indices:{bufferView:R,byteOffset:V.indicesByteOffset,componentType:A},values:{bufferView:F,byteOffset:V.valuesByteOffset}})}return{buffers:m,byteLength:y}}if(r.accessors=[],r.bufferViews=[],r.samplers=[],r.textures=[],r.images=s.listTextures().map((d,x)=>{let p=i.createPropertyDef(d);d.getMimeType()&&(p.mimeType=d.getMimeType());let m=d.getImage();return m&&i.createImageData(p,m,d),i.imageIndexMap.set(d,x),p}),l.filter(d=>d.prewriteTypes.includes("Accessor")).forEach(d=>d.prewrite(i,"Accessor")),s.listAccessors().forEach(d=>{let x=i.accessorUsageGroupedByParent,p=i.accessorParents;if(i.accessorIndexMap.has(d))return;let m=i.getAccessorUsage(d);if(i.addAccessorToUsageGroup(d,m),x.has(m)){let y=a.listParents(d).find(v=>v.propertyType!=="Root");p.set(d,y)}}),l.filter(d=>d.prewriteTypes.includes("Buffer")).forEach(d=>d.prewrite(i,"Buffer")),(s.listAccessors().length>0||i.otherBufferViews.size>0||s.listTextures().length>0&&t.format==="GLB")&&s.listBuffers().length===0)throw new Error("Buffer required for Document resources, but none was found.");r.buffers=[],s.listBuffers().forEach((d,x)=>{let p=i.createPropertyDef(d),m=i.accessorUsageGroupedByParent,y=d.listParents().filter(R=>R instanceof G),v=new Set(y.map(R=>i.accessorParents.get(R))),E=new Map(Array.from(v).map((R,C)=>[R,C])),S={};for(let R of y){if(i.accessorIndexMap.has(R))continue;let C=i.getAccessorUsage(R),F=C;if(m.has(C)){let O=i.accessorParents.get(R);F+=`:${E.get(O)}`}S[F]||={usage:C,accessors:[]},S[F].accessors.push(R)}let T=[],A=r.buffers.length,_=0;for(let{usage:R,accessors:C}of Object.values(S))if(R===er.ARRAY_BUFFER&&t.vertexLayout==="interleaved"){let F=g(C,A,_);_+=F.byteLength;for(let O of F.buffers)T.push(O)}else if(R===er.ARRAY_BUFFER)for(let F of C){let O=g([F],A,_);_+=O.byteLength;for(let V of O.buffers)T.push(V)}else if(R===er.SPARSE){let F=b(C,A,_);_+=F.byteLength;for(let O of F.buffers)T.push(O)}else if(R===er.ELEMENT_ARRAY_BUFFER){let F=Nt.BufferViewTarget.ELEMENT_ARRAY_BUFFER,O=u(C,A,_,F);_+=O.byteLength;for(let V of O.buffers)T.push(V)}else{let F=u(C,A,_);_+=F.byteLength;for(let O of F.buffers)T.push(O)}if(i.imageBufferViews.length&&x===0){for(let R=0;R<i.imageBufferViews.length;R++)if(r.bufferViews[r.images[R].bufferView].byteOffset=_,_+=i.imageBufferViews[R].byteLength,T.push(i.imageBufferViews[R]),_%8){let C=8-_%8;_+=C,T.push(new Uint8Array(C))}}if(i.otherBufferViews.has(d))for(let R of i.otherBufferViews.get(d))r.bufferViews.push({buffer:A,byteOffset:_,byteLength:R.byteLength}),i.otherBufferViewsIndexMap.set(R,r.bufferViews.length-1),_+=R.byteLength,T.push(R);if(_){let R;t.format==="GLB"?R=Ct:(R=i.bufferURIGenerator.createURI(d,"bin"),p.uri=R),p.byteLength=_,i.assignResourceURI(R,q.concat(T),!0)}r.buffers.push(p),i.bufferIndexMap.set(d,x)}),s.listAccessors().find(d=>!d.getBuffer())&&o.warn("Skipped writing one or more Accessors: no Buffer assigned."),l.filter(d=>d.prewriteTypes.includes("Material")).forEach(d=>d.prewrite(i,"Material")),r.materials=s.listMaterials().map((d,x)=>{let p=i.createPropertyDef(d);if(d.getAlphaMode()!==sr.AlphaMode.OPAQUE&&(p.alphaMode=d.getAlphaMode()),d.getAlphaMode()===sr.AlphaMode.MASK&&(p.alphaCutoff=d.getAlphaCutoff()),d.getDoubleSided()&&(p.doubleSided=!0),p.pbrMetallicRoughness={},le.eq(d.getBaseColorFactor(),[1,1,1,1])||(p.pbrMetallicRoughness.baseColorFactor=d.getBaseColorFactor()),le.eq(d.getEmissiveFactor(),[0,0,0])||(p.emissiveFactor=d.getEmissiveFactor()),d.getRoughnessFactor()!==1&&(p.pbrMetallicRoughness.roughnessFactor=d.getRoughnessFactor()),d.getMetallicFactor()!==1&&(p.pbrMetallicRoughness.metallicFactor=d.getMetallicFactor()),d.getBaseColorTexture()){let m=d.getBaseColorTexture(),y=d.getBaseColorTextureInfo();p.pbrMetallicRoughness.baseColorTexture=i.createTextureInfoDef(m,y)}if(d.getEmissiveTexture()){let m=d.getEmissiveTexture(),y=d.getEmissiveTextureInfo();p.emissiveTexture=i.createTextureInfoDef(m,y)}if(d.getNormalTexture()){let m=d.getNormalTexture(),y=d.getNormalTextureInfo(),v=i.createTextureInfoDef(m,y);d.getNormalScale()!==1&&(v.scale=d.getNormalScale()),p.normalTexture=v}if(d.getOcclusionTexture()){let m=d.getOcclusionTexture(),y=d.getOcclusionTextureInfo(),v=i.createTextureInfoDef(m,y);d.getOcclusionStrength()!==1&&(v.strength=d.getOcclusionStrength()),p.occlusionTexture=v}if(d.getMetallicRoughnessTexture()){let m=d.getMetallicRoughnessTexture(),y=d.getMetallicRoughnessTextureInfo();p.pbrMetallicRoughness.metallicRoughnessTexture=i.createTextureInfoDef(m,y)}return i.materialIndexMap.set(d,x),p}),l.filter(d=>d.prewriteTypes.includes("Mesh")).forEach(d=>d.prewrite(i,"Mesh")),r.meshes=s.listMeshes().map((d,x)=>{let p=i.createPropertyDef(d),m=null;return p.primitives=d.listPrimitives().map(y=>{let v={attributes:{}};v.mode=y.getMode();let E=y.getMaterial();E&&(v.material=i.materialIndexMap.get(E)),Object.keys(y.getExtras()).length&&(v.extras=y.getExtras());let S=y.getIndices();S&&(v.indices=i.accessorIndexMap.get(S));for(let T of y.listSemantics())v.attributes[T]=i.accessorIndexMap.get(y.getAttribute(T));for(let T of y.listTargets()){let A={};for(let _ of T.listSemantics())A[_]=i.accessorIndexMap.get(T.getAttribute(_));v.targets=v.targets||[],v.targets.push(A)}return y.listTargets().length&&!m&&(m=y.listTargets().map(T=>T.getName())),v}),d.getWeights().length&&(p.weights=d.getWeights()),m&&(p.extras=p.extras||{},p.extras.targetNames=m),i.meshIndexMap.set(d,x),p}),r.cameras=s.listCameras().map((d,x)=>{let p=i.createPropertyDef(d);if(p.type=d.getType(),p.type===or.Type.PERSPECTIVE){p.perspective={znear:d.getZNear(),zfar:d.getZFar(),yfov:d.getYFov()};let m=d.getAspectRatio();m!==null&&(p.perspective.aspectRatio=m)}else p.orthographic={znear:d.getZNear(),zfar:d.getZFar(),xmag:d.getXMag(),ymag:d.getYMag()};return i.cameraIndexMap.set(d,x),p}),r.nodes=s.listNodes().map((d,x)=>{let p=i.createPropertyDef(d);return le.eq(d.getTranslation(),[0,0,0])||(p.translation=d.getTranslation()),le.eq(d.getRotation(),[0,0,0,1])||(p.rotation=d.getRotation()),le.eq(d.getScale(),[1,1,1])||(p.scale=d.getScale()),d.getWeights().length&&(p.weights=d.getWeights()),i.nodeIndexMap.set(d,x),p}),r.skins=s.listSkins().map((d,x)=>{let p=i.createPropertyDef(d),m=d.getInverseBindMatrices();m&&(p.inverseBindMatrices=i.accessorIndexMap.get(m));let y=d.getSkeleton();return y&&(p.skeleton=i.nodeIndexMap.get(y)),p.joints=d.listJoints().map(v=>i.nodeIndexMap.get(v)),i.skinIndexMap.set(d,x),p}),s.listNodes().forEach((d,x)=>{let p=r.nodes[x],m=d.getMesh();m&&(p.mesh=i.meshIndexMap.get(m));let y=d.getCamera();y&&(p.camera=i.cameraIndexMap.get(y));let v=d.getSkin();v&&(p.skin=i.skinIndexMap.get(v)),d.listChildren().length>0&&(p.children=d.listChildren().map(E=>i.nodeIndexMap.get(E)))}),r.animations=s.listAnimations().map((d,x)=>{let p=i.createPropertyDef(d),m=new Map;return p.samplers=d.listSamplers().map((y,v)=>{let E=i.createPropertyDef(y);return E.input=i.accessorIndexMap.get(y.getInput()),E.output=i.accessorIndexMap.get(y.getOutput()),E.interpolation=y.getInterpolation(),m.set(y,v),E}),p.channels=d.listChannels().map(y=>{let v=i.createPropertyDef(y);return v.sampler=m.get(y.getSampler()),v.target={node:i.nodeIndexMap.get(y.getTargetNode()),path:y.getTargetPath()},v}),i.animationIndexMap.set(d,x),p}),r.scenes=s.listScenes().map((d,x)=>{let p=i.createPropertyDef(d);return p.nodes=d.listChildren().map(m=>i.nodeIndexMap.get(m)),i.sceneIndexMap.set(d,x),p});let h=s.getDefaultScene();return h&&(r.scene=s.listScenes().indexOf(h)),r.extensionsUsed=l.map(d=>d.extensionName),r.extensionsRequired=f.map(d=>d.extensionName),l.forEach(d=>d.write(i)),Op(r),n}};function Op(e){let t=[];for(let a in e){let s=e[a];(Array.isArray(s)&&s.length===0||s===null||s===""||s&&typeof s=="object"&&Object.keys(s).length===0)&&t.push(a)}for(let a of t)delete e[a]}var Pp=class{_logger=nr.DEFAULT_INSTANCE;_extensions=new Set;_dependencies={};_vertexLayout="interleaved";_strictResources=!0;lastReadBytes=0;lastWriteBytes=0;setLogger(e){return this._logger=e,this}registerExtensions(e){for(let t of e)this._extensions.add(t),t.register();return this}registerDependencies(e){return Object.assign(this._dependencies,e),this}setVertexLayout(e){return this._vertexLayout=e,this}setStrictResources(e){return this._strictResources=e,this}async read(e){return await this.readJSON(await this.readAsJSON(e))}async readAsJSON(e){let t=await this.readURI(e,"view");this.lastReadBytes=t.byteLength;let a=Bc(t)?this._binaryToJSON(t):{json:JSON.parse(q.decodeText(t)),resources:{}};return await this._readResourcesExternal(a,this.dirname(e)),this._readResourcesInternal(a),a}async readJSON(e){return e=this._copyJSON(e),this._readResourcesInternal(e),Tp.read(e,{extensions:Array.from(this._extensions),dependencies:this._dependencies,logger:this._logger})}async binaryToJSON(e){let t=this._binaryToJSON(q.assertView(e));this._readResourcesInternal(t);let a=t.json;if(a.buffers&&a.buffers.some(s=>jp(t,s)))throw new Error("Cannot resolve external buffers with binaryToJSON().");if(a.images&&a.images.some(s=>Lp(t,s)))throw new Error("Cannot resolve external images with binaryToJSON().");return t}async readBinary(e){return this.readJSON(await this.binaryToJSON(q.assertView(e)))}async writeJSON(e,t={}){if(t.format==="GLB"&&e.getRoot().listBuffers().length>1)throw new Error("GLB must have 0\u20131 buffers.");return Fp.write(e,{format:t.format||"GLTF",basename:t.basename||"",logger:this._logger,vertexLayout:this._vertexLayout,dependencies:{...this._dependencies},extensions:Array.from(this._extensions)})}async writeBinary(e){let{json:t,resources:a}=await this.writeJSON(e,{format:"GLB"}),s=new Uint32Array([1179937895,2,12]),r=JSON.stringify(t),n=q.pad(q.encodeText(r),32),i=q.toView(new Uint32Array([n.byteLength,1313821514])),o=q.concat([i,n]);s[s.length-1]+=o.byteLength;let c=Object.values(a)[0];if(!c||!c.byteLength)return q.concat([q.toView(s),o]);let l=q.pad(c,0),f=q.toView(new Uint32Array([l.byteLength,5130562])),u=q.concat([f,l]);return s[s.length-1]+=u.byteLength,q.concat([q.toView(s),o,u])}async _readResourcesExternal(e,t){let a=e.json.images||[],s=e.json.buffers||[],r=[...a,...s].map(async n=>{let i=n.uri;if(!i||i.match(/data:/))return Promise.resolve();try{e.resources[i]=await this.readURI(this.resolve(t,i),"view"),this.lastReadBytes+=e.resources[i].byteLength}catch(o){if(!this._strictResources&&a.includes(n))this._logger.warn(`Failed to load image URI, "${i}". ${o}`),e.resources[i]=null;else throw o}});await Promise.all(r)}_readResourcesInternal(e){function t(a){if(a.uri){if(a.uri in e.resources){q.assertView(e.resources[a.uri]);return}if(a.uri.match(/data:/)){let s=`__${yp()}.${wa.extension(a.uri)}`;e.resources[s]=q.createBufferFromDataURI(a.uri),a.uri=s}}}(e.json.images||[]).forEach(a=>{if(a.bufferView===void 0&&a.uri===void 0)throw new Error("Missing resource URI or buffer view.");t(a)}),(e.json.buffers||[]).forEach(t)}_copyJSON(e){let{images:t,buffers:a}=e.json;return e={json:{...e.json},resources:{...e.resources}},t&&(e.json.images=t.map(s=>({...s}))),a&&(e.json.buffers=a.map(s=>({...s}))),e}_binaryToJSON(e){if(!Bc(e))throw new Error("Invalid glTF 2.0 binary.");let t=new Uint32Array(e.buffer,e.byteOffset+12,2);if(t[1]!==1313821514)throw new Error("Missing required GLB JSON chunk.");let a=20,s=t[0],r=q.decodeText(q.toView(e,a,s)),n=JSON.parse(r),i=a+s;if(e.byteLength<=i)return{json:n,resources:{}};let o=new Uint32Array(e.buffer,e.byteOffset+i,2);if(o[1]!==5130562)return{json:n,resources:{}};let c=o[0],l=q.toView(e,i+8,c);return{json:n,resources:{[Ct]:l}}}};function jp(e,t){return t.uri!==void 0&&!(t.uri in e.resources)}function Lp(e,t){return t.uri!==void 0&&!(t.uri in e.resources)&&t.bufferView===void 0}function Bc(e){if(e.byteLength<3*Uint32Array.BYTES_PER_ELEMENT)return!1;let t=new Uint32Array(e.buffer,e.byteOffset,3);return t[0]===1179937895&&t[1]===2}var Zc=class extends Pp{_fetchConfig;constructor(e=Jn.DEFAULT_INIT){super(),this._fetchConfig=e}async readURI(e,t){let a=await fetch(e,this._fetchConfig);switch(t){case"view":return new Uint8Array(await a.arrayBuffer());case"text":return a.text()}}resolve(e,t){return Jn.resolve(e,t)}dirname(e){return Jn.dirname(e)}};function Dp(){return{vkFormat:0,typeSize:1,pixelWidth:0,pixelHeight:0,pixelDepth:0,layerCount:0,faceCount:1,levelCount:0,supercompressionScheme:0,levels:[],dataFormatDescriptor:[{vendorId:0,descriptorType:0,versionNumber:2,colorModel:0,colorPrimaries:1,transferFunction:2,flags:0,texelBlockDimension:[0,0,0,0],bytesPlane:[0,0,0,0,0,0,0,0],samples:[]}],keyValue:{},globalData:null}}var na=class{constructor(t,a,s,r){this._dataView=void 0,this._littleEndian=void 0,this._offset=void 0,this._dataView=new DataView(t.buffer,t.byteOffset+a,s),this._littleEndian=r,this._offset=0}_nextUint8(){let t=this._dataView.getUint8(this._offset);return this._offset+=1,t}_nextUint16(){let t=this._dataView.getUint16(this._offset,this._littleEndian);return this._offset+=2,t}_nextUint32(){let t=this._dataView.getUint32(this._offset,this._littleEndian);return this._offset+=4,t}_nextUint64(){let t=this._dataView.getUint32(this._offset,this._littleEndian),a=this._dataView.getUint32(this._offset+4,this._littleEndian),s=t+2**32*a;return this._offset+=8,s}_nextInt32(){let t=this._dataView.getInt32(this._offset,this._littleEndian);return this._offset+=4,t}_nextUint8Array(t){let a=new Uint8Array(this._dataView.buffer,this._dataView.byteOffset+this._offset,t);return this._offset+=t,a}_skip(t){return this._offset+=t,this}_scan(t,a=0){let s=this._offset,r=0;for(;this._dataView.getUint8(this._offset)!==a&&r<t;)r++,this._offset++;return r<t&&this._offset++,new Uint8Array(this._dataView.buffer,this._dataView.byteOffset+s,r)}};var gk=new Uint8Array([0]),Ce=[171,75,84,88,32,50,48,187,13,10,26,10];function el(e){return new TextDecoder().decode(e)}function cr(e){let t=new Uint8Array(e.buffer,e.byteOffset,Ce.length);if(t[0]!==Ce[0]||t[1]!==Ce[1]||t[2]!==Ce[2]||t[3]!==Ce[3]||t[4]!==Ce[4]||t[5]!==Ce[5]||t[6]!==Ce[6]||t[7]!==Ce[7]||t[8]!==Ce[8]||t[9]!==Ce[9]||t[10]!==Ce[10]||t[11]!==Ce[11])throw new Error("Missing KTX 2.0 identifier.");let a=Dp(),s=17*Uint32Array.BYTES_PER_ELEMENT,r=new na(e,Ce.length,s,!0);a.vkFormat=r._nextUint32(),a.typeSize=r._nextUint32(),a.pixelWidth=r._nextUint32(),a.pixelHeight=r._nextUint32(),a.pixelDepth=r._nextUint32(),a.layerCount=r._nextUint32(),a.faceCount=r._nextUint32(),a.levelCount=r._nextUint32(),a.supercompressionScheme=r._nextUint32();let n=r._nextUint32(),i=r._nextUint32(),o=r._nextUint32(),c=r._nextUint32(),l=r._nextUint64(),f=r._nextUint64(),u=Math.max(a.levelCount,1)*3*8,g=new na(e,Ce.length+s,u,!0);for(let P=0,L=Math.max(a.levelCount,1);P<L;P++)a.levels.push({levelData:new Uint8Array(e.buffer,e.byteOffset+g._nextUint64(),g._nextUint64()),uncompressedByteLength:g._nextUint64()});let b=new na(e,n,i,!0);b._skip(4);let h=b._nextUint16(),d=b._nextUint16(),x=b._nextUint16(),p=b._nextUint16(),m=b._nextUint8(),y=b._nextUint8(),v=b._nextUint8(),E=b._nextUint8(),S=[b._nextUint8(),b._nextUint8(),b._nextUint8(),b._nextUint8()],T=[b._nextUint8(),b._nextUint8(),b._nextUint8(),b._nextUint8(),b._nextUint8(),b._nextUint8(),b._nextUint8(),b._nextUint8()],_={vendorId:h,descriptorType:d,versionNumber:x,colorModel:m,colorPrimaries:y,transferFunction:v,flags:E,texelBlockDimension:S,bytesPlane:T,samples:[]},F=(p/4-6)/4;for(let P=0;P<F;P++){let L={bitOffset:b._nextUint16(),bitLength:b._nextUint8(),channelType:b._nextUint8(),samplePosition:[b._nextUint8(),b._nextUint8(),b._nextUint8(),b._nextUint8()],sampleLower:Number.NEGATIVE_INFINITY,sampleUpper:Number.POSITIVE_INFINITY};L.channelType&64?(L.sampleLower=b._nextInt32(),L.sampleUpper=b._nextInt32()):(L.sampleLower=b._nextUint32(),L.sampleUpper=b._nextUint32()),_.samples[P]=L}a.dataFormatDescriptor.length=0,a.dataFormatDescriptor.push(_);let O=new na(e,o,c,!0);for(;O._offset<c;){let P=O._nextUint32(),L=O._scan(P),J=el(L);if(a.keyValue[J]=O._nextUint8Array(P-L.byteLength-1),J.match(/^ktx/i)){let Re=el(a.keyValue[J]);a.keyValue[J]=Re.substring(0,Re.lastIndexOf("\0"))}let ue=P%4?4-P%4:0;O._skip(ue)}if(f<=0)return a;let V=new na(e,l,f,!0),$=V._nextUint16(),re=V._nextUint16(),de=V._nextUint32(),Ke=V._nextUint32(),be=V._nextUint32(),Ve=V._nextUint32(),Qe=[];for(let P=0,L=Math.max(a.levelCount,1);P<L;P++)Qe.push({imageFlags:V._nextUint32(),rgbSliceByteOffset:V._nextUint32(),rgbSliceByteLength:V._nextUint32(),alphaSliceByteOffset:V._nextUint32(),alphaSliceByteLength:V._nextUint32()});let _e=l+V._offset,it=_e+de,Ze=it+Ke,It=Ze+be,ya=new Uint8Array(e.buffer,e.byteOffset+_e,de),Dn=new Uint8Array(e.buffer,e.byteOffset+it,Ke),Ds=new Uint8Array(e.buffer,e.byteOffset+Ze,be),I=new Uint8Array(e.buffer,e.byteOffset+It,Ve);return a.globalData={endpointCount:$,selectorCount:re,imageDescs:Qe,endpointsData:ya,selectorsData:Dn,tablesData:Ds,extendedData:I},a}var Ft="EXT_mesh_gpu_instancing",mt="EXT_mesh_features",je="EXT_meshopt_compression",H="EXT_structural_metadata",lr="EXT_texture_webp",dr="EXT_texture_avif",Hp="KHR_accessor_float16",qp="KHR_accessor_float64",fe="KHR_draco_mesh_compression",gt="KHR_lights_punctual",Ot="KHR_materials_anisotropy",Pt="KHR_materials_clearcoat",jt="KHR_materials_diffuse_transmission",Lt="KHR_materials_dispersion",Dt="KHR_materials_emissive_strength",Ut="KHR_materials_ior",zt="KHR_materials_iridescence",Gt="KHR_materials_pbrSpecularGlossiness",Kt="KHR_materials_sheen",Vt="KHR_materials_specular",Ht="KHR_materials_transmission",va="KHR_materials_unlit",qt="KHR_materials_volume",Ue="KHR_materials_variants",tl="KHR_mesh_primitive_restart",al="KHR_mesh_quantization",Wt="KHR_node_visibility",ur="KHR_texture_basisu",Xt="KHR_texture_transform",at="KHR_xmp_json_ld",Wp=class extends X{static EXTENSION_NAME=mt;init(){this.extensionName=mt,this.propertyType="FeatureID",this.parentTypes=["Features"]}getDefaults(){return Object.assign(super.getDefaults(),{nullFeatureId:null,label:"",attribute:null,texture:null,propertyTable:null})}getFeatureCount(){return this.get("featureCount")}setFeatureCount(e){return this.set("featureCount",e)}getNullFeatureID(){return this.get("nullFeatureId")}setNullFeatureID(e){return this.set("nullFeatureId",e)}getLabel(){return this.get("label")}setLabel(e){return this.set("label",e)}getAttribute(){return this.get("attribute")}setAttribute(e){return this.set("attribute",e)}getTexture(){return this.getRef("texture")}setTexture(e){return this.setRef("texture",e)}getPropertyTable(){return this.getRef("propertyTable")}setPropertyTable(e){return this.setRef("propertyTable",e)}},Xp=class extends X{static EXTENSION_NAME=mt;init(){this.extensionName=mt,this.propertyType="FeatureIDTexture",this.parentTypes=["FeatureID"]}getDefaults(){let e=new oe(this.graph,"textureInfo");return e.setMinFilter(oe.MagFilter.NEAREST),e.setMagFilter(oe.MagFilter.NEAREST),Object.assign(super.getDefaults(),{channels:[0],texture:null,textureInfo:e})}getChannels(){return this.get("channels")}setChannels(e){return this.set("channels",e)}getTexture(){return this.getRef("texture")}setTexture(e){return this.setRef("texture",e)}getTextureInfo(){return this.getRef("texture")?this.getRef("textureInfo"):null}},$p=class extends X{static EXTENSION_NAME=mt;init(){this.extensionName=mt,this.propertyType="Features",this.parentTypes=[B.PRIMITIVE]}getDefaults(){return Object.assign(super.getDefaults(),{featureIds:new ne([])})}listFeatureIDs(){return this.listRefs("featureIds")}addFeatureID(e){return this.addRef("featureIds",e)}removeFeatureID(e){return this.removeRef("featureIds",e)}},Ya=mt,di=class extends ae{extensionName=mt;static EXTENSION_NAME=mt;createFeatures(){return new $p(this.document.getGraph())}createFeatureID(){return new Wp(this.document.getGraph())}createFeatureIDTexture(){return new Xp(this.document.getGraph())}read(e){return(e.jsonDoc.json.meshes||[]).forEach((t,a)=>{(t.primitives||[]).forEach((s,r)=>{this._readPrimitive(e,a,s,r)})}),this}_readPrimitive(e,t,a,s){if(!a.extensions||!a.extensions[Ya])return;let r=this.createFeatures(),n=a.extensions[Ya];for(let i of n.featureIds){let o=Yp(this.document,this,e,i);r.addFeatureID(o)}e.meshes[t].listPrimitives()[s].setExtension(Ya,r)}write(e){let t=e.jsonDoc.json.meshes;if(!t)return this;for(let a of this.document.getRoot().listMeshes()){let s=t[e.meshIndexMap.get(a)];a.listPrimitives().forEach((r,n)=>{let i=s.primitives[n];this._writePrimitive(e,r,i)})}return this}_writePrimitive(e,t,a){let s=t.getExtension(Ya);if(!s)return;let r={featureIds:[]};s.listFeatureIDs().forEach(n=>{r.featureIds.push(Qp(this.document,e,n))}),a.extensions=a.extensions||{},a.extensions[Ya]=r}};function Yp(e,t,a,s){let r=t.createFeatureID().setFeatureCount(s.featureCount);s.nullFeatureId!==void 0&&r.setNullFeatureID(s.nullFeatureId),s.label!==void 0&&r.setLabel(s.label),s.attribute!==void 0&&r.setAttribute(s.attribute);let n=s.texture;if(n!==void 0){let i=Jp(t,a,n);r.setTexture(i)}if(s.propertyTable!==void 0){let i=e.getRoot().getExtension(H).listPropertyTables();r.setPropertyTable(i[s.propertyTable])}return r}function Jp(e,t,a){let s=e.createFeatureIDTexture(),{json:r}=t.jsonDoc;if(a.channels&&s.setChannels(a.channels),a.index!==void 0){let n=r.textures[a.index].source;s.setTexture(t.textures[n]),t.setTextureInfo(s.getTextureInfo(),a)}return s}function Qp(e,t,a){let s=e.getRoot(),r={featureCount:a.getFeatureCount()};if(a.getNullFeatureID()!=null&&(r.nullFeatureId=a.getNullFeatureID()),a.getLabel()&&(r.label=a.getLabel()),a.getAttribute()!=null&&(r.attribute=a.getAttribute()),a.getTexture()){let n=a.getTexture(),i=n.getTexture(),o=n.getTextureInfo();r.texture=t.createTextureInfoDef(i,o);let c=n.getChannels();le.eq(c,[0])||(r.texture.channels=c)}if(a.getPropertyTable()){let n=s.getExtension(H),i=a.getPropertyTable();r.propertyTable=n.listPropertyTables().indexOf(i)}return r}var oi="INSTANCE_ATTRIBUTE",Zp=class extends X{static EXTENSION_NAME=Ft;init(){this.extensionName=Ft,this.propertyType="InstancedMesh",this.parentTypes=[B.NODE]}getDefaults(){return Object.assign(super.getDefaults(),{attributes:new ge})}getAttribute(e){return this.getRefMap("attributes",e)}setAttribute(e,t){return this.setRefMap("attributes",e,t,{usage:oi})}listAttributes(){return this.listRefMapValues("attributes")}listSemantics(){return this.listRefMapKeys("attributes")}},eg=class extends ae{static EXTENSION_NAME=Ft;extensionName=Ft;prewriteTypes=[B.ACCESSOR];createInstancedMesh(){return new Zp(this.document.getGraph())}read(e){return(e.jsonDoc.json.nodes||[]).forEach((t,a)=>{if(!t.extensions||!t.extensions.EXT_mesh_gpu_instancing)return;let s=t.extensions[Ft],r=this.createInstancedMesh();for(let n in s.attributes)r.setAttribute(n,e.accessors[s.attributes[n]]);e.nodes[a].setExtension(Ft,r)}),this}prewrite(e){e.accessorUsageGroupedByParent.add(oi);for(let t of this.properties)for(let a of t.listAttributes())e.addAccessorToUsageGroup(a,oi);return this}write(e){let t=e.jsonDoc;return this.document.getRoot().listNodes().forEach(a=>{let s=a.getExtension(Ft);if(s){let r=e.nodeIndexMap.get(a),n=t.json.nodes[r],i={attributes:{}};s.listSemantics().forEach(o=>{let c=s.getAttribute(o);i.attributes[o]=e.accessorIndexMap.get(c)}),n.extensions=n.extensions||{},n.extensions[Ft]=i}}),this}},tg=(function(e){return e.QUANTIZE="quantize",e.FILTER="filter",e})({});function ag(e){return!e.extensions||!e.extensions.EXT_meshopt_compression?!1:!!e.extensions[je].fallback}var{BYTE:sg,SHORT:sl,FLOAT:rg}=G.ComponentType,{encodeNormalizedInt:rl,decodeNormalizedInt:ci}=le;function ng(e,t,a,s){let{filter:r,bits:n}=s,i={array:e.getArray(),byteStride:e.getElementSize()*e.getComponentSize(),componentType:e.getComponentType(),normalized:e.getNormalized()};if(a!=="ATTRIBUTES")return i;if(r!=="NONE"){let o=e.getNormalized()?ig(e):new Float32Array(i.array);switch(r){case"EXPONENTIAL":i.byteStride=e.getElementSize()*4,i.componentType=rg,i.normalized=!1,i.array=t.encodeFilterExp(o,e.getCount(),i.byteStride,n);break;case"OCTAHEDRAL":i.byteStride=n>8?8:4,i.componentType=n>8?sl:sg,i.normalized=!0,o=e.getElementSize()===3?cg(o):o,i.array=t.encodeFilterOct(o,e.getCount(),i.byteStride,n);break;case"QUATERNION":i.byteStride=8,i.componentType=sl,i.normalized=!0,i.array=t.encodeFilterQuat(o,e.getCount(),i.byteStride,n);break;default:throw new Error("Invalid filter.")}i.min=e.getMin([]),i.max=e.getMax([]),e.getNormalized()&&(i.min=i.min.map(c=>ci(c,e.getComponentType())),i.max=i.max.map(c=>ci(c,e.getComponentType()))),i.normalized&&(i.min=i.min.map(c=>rl(c,i.componentType)),i.max=i.max.map(c=>rl(c,i.componentType)))}else i.byteStride%4&&(i.array=og(i.array,e.getElementSize()),i.byteStride=i.array.byteLength/e.getCount());return i}function ig(e){let t=e.getComponentType(),a=e.getArray(),s=new Float32Array(a.length);for(let r=0;r<a.length;r++)s[r]=ci(a[r],t);return s}function og(e,t){let a=q.padNumber(e.BYTES_PER_ELEMENT*t)/e.BYTES_PER_ELEMENT,s=e.length/t,r=new e.constructor(s*a);for(let n=0;n*t<e.length;n++)for(let i=0;i<t;i++)r[n*a+i]=e[n*t+i];return r}function cg(e){let t=new Float32Array(e.length*4/3);for(let a=0,s=e.length/3;a<s;a++)t[a*4]=e[a*3],t[a*4+1]=e[a*3+1],t[a*4+2]=e[a*3+2];return t}function lg(e,t){return t===Nt.BufferViewUsage.ELEMENT_ARRAY_BUFFER?e.listParents().some(a=>a instanceof $a&&a.getMode()===$a.Mode.TRIANGLES)?"TRIANGLES":"INDICES":"ATTRIBUTES"}function dg(e,t){let a=t.getGraph().listParentEdges(e).filter(s=>!(s.getParent()instanceof ri));for(let s of a){let r=s.getName(),n=s.getAttributes().key||"",i=s.getParent().propertyType===B.PRIMITIVE_TARGET;if(r==="indices")return{filter:"NONE"};if(r==="attributes"){if(n==="POSITION")return{filter:"NONE"};if(n==="TEXCOORD_0")return{filter:"NONE"};if(n.startsWith("JOINTS_"))return{filter:"NONE"};if(n.startsWith("WEIGHTS_"))return{filter:"NONE"};if(n==="NORMAL"||n==="TANGENT")return i?{filter:"NONE"}:{filter:"OCTAHEDRAL",bits:8}}if(r==="output"){let o=vl(e);return o==="rotation"?{filter:"QUATERNION",bits:16}:o==="translation"?{filter:"EXPONENTIAL",bits:12}:o==="scale"?{filter:"EXPONENTIAL",bits:12}:{filter:"NONE"}}if(r==="input")return{filter:"NONE"};if(r==="inverseBindMatrices")return{filter:"NONE"}}return{filter:"NONE"}}function vl(e){for(let t of e.listParents())if(t instanceof ir){for(let a of t.listParents())if(a instanceof si)return a.getTargetPath()}return null}var nl={method:"quantize"},ui=class extends ae{extensionName=je;prereadTypes=[B.BUFFER,B.PRIMITIVE];prewriteTypes=[B.BUFFER,B.ACCESSOR];readDependencies=["meshopt.decoder"];writeDependencies=["meshopt.encoder"];static EXTENSION_NAME=je;static EncoderMethod=tg;_decoder=null;_decoderFallbackBufferMap=new Map;_encoder=null;_encoderOptions=nl;_encoderFallbackBuffer=null;_encoderBufferViews={};_encoderBufferViewData={};_encoderBufferViewAccessors={};install(e,t){return e==="meshopt.decoder"&&(this._decoder=t),e==="meshopt.encoder"&&(this._encoder=t),this}setEncoderOptions(e){return this._encoderOptions={...nl,...e},this}preread(e,t){if(!this._decoder){if(!this.isRequired())return this;throw new Error(`[${je}] Please install extension dependency, "meshopt.decoder".`)}if(!this._decoder.supported){if(!this.isRequired())return this;throw new Error(`[${je}]: Missing WASM support.`)}return t===B.BUFFER?this._prereadBuffers(e):t===B.PRIMITIVE&&this._prereadPrimitives(e),this}_prereadBuffers(e){let t=e.jsonDoc;(t.json.bufferViews||[]).forEach((a,s)=>{if(!a.extensions||!a.extensions.EXT_meshopt_compression)return;let r=a.extensions[je],n=r.byteOffset||0,i=r.byteLength||0,o=r.count,c=r.byteStride,l=new Uint8Array(o*c),f=t.json.buffers[r.buffer],u=f.uri?t.resources[f.uri]:t.resources[Ct],g=q.toView(u,n,i);this._decoder.decodeGltfBuffer(l,o,c,g,r.mode,r.filter),e.bufferViews[s]=l})}_prereadPrimitives(e){let t=e.jsonDoc;(t.json.bufferViews||[]).forEach(a=>{if(!a.extensions||!a.extensions.EXT_meshopt_compression)return;let s=a.extensions[je],r=e.buffers[s.buffer],n=e.buffers[a.buffer],i=t.json.buffers[a.buffer];ag(i)&&this._decoderFallbackBufferMap.set(n,r)})}read(e){if(!this.isRequired())return this;for(let[t,a]of this._decoderFallbackBufferMap){for(let s of t.listParents())s instanceof G&&s.swap(t,a);t.dispose()}return this}prewrite(e,t){return t===B.ACCESSOR?this._prewriteAccessors(e):t===B.BUFFER&&this._prewriteBuffers(e),this}_prewriteAccessors(e){let t=e.jsonDoc.json,a=this._encoder,s=this._encoderOptions,r=this.document.getGraph(),n=this.document.createBuffer(),i=this.document.getRoot().listBuffers().indexOf(n),o=1,c=new Map,l=f=>{for(let u of r.listParents(f)){if(u.propertyType===B.ROOT)continue;let g=c.get(f);return g===void 0&&c.set(f,g=o++),g}return-1};this._encoderFallbackBuffer=n,this._encoderBufferViews={},this._encoderBufferViewData={},this._encoderBufferViewAccessors={};for(let f of this.document.getRoot().listAccessors()){if(vl(f)==="weights"||f.getSparse())continue;let u=e.getAccessorUsage(f),g=e.accessorUsageGroupedByParent.has(u)?l(f):null,b=lg(f,u),h=s.method==="filter"?dg(f,this.document):{filter:"NONE"},d=ng(f,a,b,h),{array:x,byteStride:p}=d,m=f.getBuffer();if(!m)throw new Error(`${je}: Missing buffer for accessor.`);let y=this.document.getRoot().listBuffers().indexOf(m),v=[u,g,b,h.filter,p,y].join(":"),E=this._encoderBufferViews[v],S=this._encoderBufferViewData[v],T=this._encoderBufferViewAccessors[v];(!E||!S)&&(T=this._encoderBufferViewAccessors[v]=[],S=this._encoderBufferViewData[v]=[],E=this._encoderBufferViews[v]={buffer:i,target:Nt.USAGE_TO_TARGET[u],byteOffset:0,byteLength:0,byteStride:u===Nt.BufferViewUsage.ARRAY_BUFFER?p:void 0,extensions:{[je]:{buffer:y,byteOffset:0,byteLength:0,mode:b,filter:h.filter!=="NONE"?h.filter:void 0,byteStride:p,count:0}}});let A=e.createAccessorDef(f);A.componentType=d.componentType,A.normalized=d.normalized,A.byteOffset=E.byteLength,A.min&&d.min&&(A.min=d.min),A.max&&d.max&&(A.max=d.max),e.accessorIndexMap.set(f,t.accessors.length),t.accessors.push(A),T.push(A),S.push(new Uint8Array(x.buffer,x.byteOffset,x.byteLength)),E.byteLength+=x.byteLength,E.extensions.EXT_meshopt_compression.count+=f.getCount()}}_prewriteBuffers(e){let t=this._encoder;for(let a in this._encoderBufferViews){let s=this._encoderBufferViews[a],r=this._encoderBufferViewData[a],n=this.document.getRoot().listBuffers()[s.extensions[je].buffer],i=e.otherBufferViews.get(n)||[],{count:o,byteStride:c,mode:l}=s.extensions[je],f=q.concat(r),u=t.encodeGltfBuffer(f,o,c,l),g=q.pad(u);s.extensions[je].byteLength=u.byteLength,r.length=0,r.push(g),i.push(g),e.otherBufferViews.set(n,i)}}write(e){let t=0;for(let n in this._encoderBufferViews){let i=this._encoderBufferViews[n],o=this._encoderBufferViewData[n][0],c=e.otherBufferViewsIndexMap.get(o),l=this._encoderBufferViewAccessors[n];for(let b of l)b.bufferView=c;let f=e.jsonDoc.json.bufferViews[c],u=f.byteOffset||0;Object.assign(f,i),f.byteOffset=t;let g=f.extensions[je];g.byteOffset=u,t+=q.padNumber(i.byteLength)}let a=this._encoderFallbackBuffer,s=e.bufferIndexMap.get(a),r=e.jsonDoc.json.buffers[s];return r.byteLength=t,r.extensions={[je]:{fallback:!0}},a.dispose(),this}},ug=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="StructuralMetadata",this.parentTypes=[B.ROOT]}getDefaults(){return Object.assign(super.getDefaults(),{schema:null,schemaUri:"",propertyTables:new Se,propertyTextures:new Se,propertyAttributes:new Se})}getSchema(){return this.getRef("schema")}setSchema(e){return this.setRef("schema",e)}getSchemaUri(){return this.get("schemaUri")}setSchemaUri(e){return this.set("schemaUri",e)}listPropertyTables(){return this.listRefs("propertyTables")}addPropertyTable(e){return this.addRef("propertyTables",e)}removePropertyTable(e){return this.removeRef("propertyTables",e)}listPropertyTextures(){return this.listRefs("propertyTextures")}addPropertyTexture(e){return this.addRef("propertyTextures",e)}removePropertyTexture(e){return this.removeRef("propertyTextures",e)}listPropertyAttributes(){return this.listRefs("propertyAttributes")}addPropertyAttribute(e){return this.addRef("propertyAttributes",e)}removePropertyAttribute(e){return this.removeRef("propertyAttributes",e)}},fg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="Schema",this.parentTypes=["StructuralMetadata"]}getDefaults(){return Object.assign(super.getDefaults(),{description:"",version:"",classes:new ge,enums:new ge})}getId(){return this.get("id")}setId(e){return this.set("id",e)}getDescription(){return this.get("description")}setDescription(e){return this.set("description",e)}getVersion(){return this.get("version")}setVersion(e){return this.set("version",e)}setClass(e,t){return this.setRefMap("classes",e,t)}getClass(e){return this.getRefMap("classes",e)}listClassKeys(){return this.listRefMapKeys("classes")}listClassValues(){return this.listRefMapValues("classes")}setEnum(e,t){return this.setRefMap("enums",e,t)}getEnum(e){return this.getRefMap("enums",e)}listEnumKeys(){return this.listRefMapKeys("enums")}listEnumValues(){return this.listRefMapValues("enums")}},hg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="Class",this.parentTypes=["Schema"]}getDefaults(){return Object.assign(super.getDefaults(),{description:"",properties:new ge})}getDescription(){return this.get("description")}setDescription(e){return this.set("description",e)}setProperty(e,t){return this.setRefMap("properties",e,t)}getProperty(e){return this.getRefMap("properties",e)}listPropertyKeys(){return this.listRefMapKeys("properties")}listPropertyValues(){return this.listRefMapValues("properties")}},bg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="ClassProperty",this.parentTypes=["Class"]}getDefaults(){return Object.assign(super.getDefaults(),{description:"",componentType:null,enumType:null,array:null,count:null,normalized:null,offset:null,scale:null,max:null,min:null,required:null,noData:null,default:null})}getDescription(){return this.get("description")}setDescription(e){return this.set("description",e)}getType(){return this.get("type")}setType(e){return this.set("type",e)}getComponentType(){return this.get("componentType")}setComponentType(e){return this.set("componentType",e)}getEnumType(){return this.get("enumType")}setEnumType(e){return this.set("enumType",e)}getArray(){return this.get("array")}setArray(e){return this.set("array",e)}getCount(){return this.get("count")}setCount(e){return this.set("count",e)}getNormalized(){return this.get("normalized")}setNormalized(e){return this.set("normalized",e)}getOffset(){return this.get("offset")}setOffset(e){return this.set("offset",e)}getScale(){return this.get("scale")}setScale(e){return this.set("scale",e)}getMax(){return this.get("max")}setMax(e){return this.set("max",e)}getMin(){return this.get("min")}setMin(e){return this.set("min",e)}getRequired(){return this.get("required")}setRequired(e){return this.set("required",e)}getNoData(){return this.get("noData")}setNoData(e){return this.set("noData",e)}getDefault(){return this.get("default")}setDefault(e){return this.set("default",e)}},pg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="Enum",this.parentTypes=["Schema"]}getDefaults(){return Object.assign(super.getDefaults(),{description:"",valueType:"UINT16",values:new Se})}getDescription(){return this.get("description")}setDescription(e){return this.set("description",e)}getValueType(){return this.get("valueType")}setValueType(e){return this.set("valueType",e)}listValues(){return this.listRefs("values")}addEnumValue(e){return this.addRef("values",e)}removeEnumValue(e){return this.removeRef("values",e)}},gg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="EnumValue",this.parentTypes=["Enum"]}getDefaults(){return Object.assign(super.getDefaults(),{description:null})}getDescription(){return this.get("description")}setDescription(e){return this.set("description",e)}getValue(){return this.get("value")}setValue(e){return this.set("value",e)}},mg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="PropertyTable",this.parentTypes=["StructuralMetadata"]}getDefaults(){return Object.assign(super.getDefaults(),{properties:new ge})}getClass(){return this.get("class")}setClass(e){return this.set("class",e)}getCount(){return this.get("count")}setCount(e){return this.set("count",e)}setProperty(e,t){return this.setRefMap("properties",e,t)}getProperty(e){return this.getRefMap("properties",e)}listPropertyKeys(){return this.listRefMapKeys("properties")}listPropertyValues(){return this.listRefMapValues("properties")}},yg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="PropertyTableProperty",this.parentTypes=["PropertyTable"]}getDefaults(){return Object.assign(super.getDefaults(),{arrayOffsets:null,stringOffsets:null,arrayOffsetType:null,stringOffsetType:null,offset:null,scale:null,max:null,min:null})}getValues(){return this.get("values")}setValues(e){return this.set("values",e)}getArrayOffsets(){return this.get("arrayOffsets")}setArrayOffsets(e){return this.set("arrayOffsets",e)}getStringOffsets(){return this.get("stringOffsets")}setStringOffsets(e){return this.set("stringOffsets",e)}getArrayOffsetType(){return this.get("arrayOffsetType")}setArrayOffsetType(e){return this.set("arrayOffsetType",e)}getStringOffsetType(){return this.get("stringOffsetType")}setStringOffsetType(e){return this.set("stringOffsetType",e)}getOffset(){return this.get("offset")}setOffset(e){return this.set("offset",e)}getScale(){return this.get("scale")}setScale(e){return this.set("scale",e)}getMax(){return this.get("max")}setMax(e){return this.set("max",e)}getMin(){return this.get("min")}setMin(e){return this.set("min",e)}},xg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="PropertyTexture",this.parentTypes=["StructuralMetadata"]}getDefaults(){return Object.assign(super.getDefaults(),{properties:new ge})}getClass(){return this.get("class")}setClass(e){return this.set("class",e)}setProperty(e,t){return this.setRefMap("properties",e,t)}getProperty(e){return this.getRefMap("properties",e)}listPropertyKeys(){return this.listRefMapKeys("properties")}listPropertyValues(){return this.listRefMapValues("properties")}},wg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="PropertyTextureProperty",this.parentTypes=["PropertyTexture"]}getDefaults(){let e=new oe(this.graph,"textureInfo");return e.setMinFilter(oe.MagFilter.NEAREST),e.setMagFilter(oe.MagFilter.NEAREST),Object.assign(super.getDefaults(),{channels:[0],texture:null,textureInfo:e,offset:null,scale:null,max:null,min:null})}getChannels(){return this.get("channels")}setChannels(e){return this.set("channels",e)}getTexture(){return this.getRef("texture")}setTexture(e){return this.setRef("texture",e)}getTextureInfo(){return this.getRef("texture")?this.getRef("textureInfo"):null}getOffset(){return this.get("offset")}setOffset(e){return this.set("offset",e)}getScale(){return this.get("scale")}setScale(e){return this.set("scale",e)}getMax(){return this.get("max")}setMax(e){return this.set("max",e)}getMin(){return this.get("min")}setMin(e){return this.set("min",e)}},vg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="PropertyAttribute",this.parentTypes=["StructuralMetadata"]}getDefaults(){return Object.assign(super.getDefaults(),{properties:new ge})}getClass(){return this.get("class")}setClass(e){return this.set("class",e)}setProperty(e,t){return this.setRefMap("properties",e,t)}getProperty(e){return this.getRefMap("properties",e)}listPropertyKeys(){return this.listRefMapKeys("properties")}listPropertyValues(){return this.listRefMapValues("properties")}},Mg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="PropertyAttributeProperty",this.parentTypes=["PropertyAttribute"]}getDefaults(){return Object.assign(super.getDefaults(),{offset:null,scale:null,max:null,min:null})}getAttribute(){return this.get("attribute")}setAttribute(e){return this.set("attribute",e)}getOffset(){return this.get("offset")}setOffset(e){return this.set("offset",e)}getScale(){return this.get("scale")}setScale(e){return this.set("scale",e)}getMax(){return this.get("max")}setMax(e){return this.set("max",e)}getMin(){return this.get("min")}setMin(e){return this.set("min",e)}},kg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="NodeStructuralMetadata",this.parentTypes=[B.NODE]}getDefaults(){return Object.assign(super.getDefaults(),{class:"",properties:{}})}getClass(){return this.get("class")}setClass(e){return this.set("class",e)}getProperties(){return this.get("properties")}setProperties(e){return this.set("properties",e)}},Eg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="MeshPrimitiveStructuralMetadata",this.parentTypes=[B.PRIMITIVE]}getDefaults(){return Object.assign(super.getDefaults(),{propertyTextures:new Se,propertyAttributes:new Se})}listPropertyTextures(){return this.listRefs("propertyTextures")}addPropertyTexture(e){return this.addRef("propertyTextures",e)}removePropertyTexture(e){return this.removeRef("propertyTextures",e)}listPropertyAttributes(){return this.listRefs("propertyAttributes")}addPropertyAttribute(e){return this.addRef("propertyAttributes",e)}removePropertyAttribute(e){return this.removeRef("propertyAttributes",e)}},Sg=class extends ae{extensionName=H;static EXTENSION_NAME=H;prewriteTypes=[B.BUFFER];prereadTypes=[B.SCENE];createStructuralMetadata(){return new ug(this.document.getGraph())}createSchema(){return new fg(this.document.getGraph())}createClass(){return new hg(this.document.getGraph())}createClassProperty(){return new bg(this.document.getGraph())}createEnum(){return new pg(this.document.getGraph())}createEnumValue(){return new gg(this.document.getGraph())}createPropertyTable(){return new mg(this.document.getGraph())}createPropertyTableProperty(){return new yg(this.document.getGraph())}createPropertyTexture(){return new xg(this.document.getGraph())}createPropertyTextureProperty(){return new wg(this.document.getGraph())}createPropertyAttribute(){return new vg(this.document.getGraph())}createPropertyAttributeProperty(){return new Mg(this.document.getGraph())}createNodeStructuralMetadata(){return new kg(this.document.getGraph())}createMeshPrimitiveStructuralMetadata(){return new Eg(this.document.getGraph())}read(e){return this}preread(e){let t=this.document.getRoot(),{json:a}=e.jsonDoc,s=a.extensions[H],r=Tg(this,e,s);return t.setExtension(H,r),(a.meshes||[]).forEach((n,i)=>{let o=e.meshes[i].listPrimitives();(n.primitives||[]).forEach((c,l)=>{let f=o[l];this._readPrimitive(r,f,c)})}),(a.nodes||[]).forEach((n,i)=>{this._readNode(e.nodes[i],n)}),this}_readPrimitive(e,t,a){if(!a.extensions||!a.extensions.EXT_structural_metadata)return;let s=this.createMeshPrimitiveStructuralMetadata(),r=a.extensions[H],n=e.listPropertyTextures(),i=r.propertyTextures||[];for(let l of i){let f=n[l];s.addPropertyTexture(f)}let o=e.listPropertyAttributes(),c=r.propertyAttributes||[];for(let l of c){let f=o[l];s.addPropertyAttribute(f)}t.setExtension(H,s)}_readNode(e,t){if(!t.extensions||!t.extensions.EXT_structural_metadata)return;let a=t.extensions[H],s=this.createNodeStructuralMetadata().setClass(a.class).setProperties(a.properties);e.setExtension(H,s)}write(e){let t=this.document.getRoot(),a=t.getExtension(H);if(!a)return this;let s=e.jsonDoc.json,r=Lg(e,a);s.extensions=s.extensions||{},s.extensions[H]=r;let n=t.listMeshes(),i=s.meshes;if(i)for(let l of n){let f=i[e.meshIndexMap.get(l)];l.listPrimitives().forEach((u,g)=>{let b=f.primitives[g];this._writePrimitive(a,u,b)})}let o=t.listNodes(),c=s.nodes;if(c)for(let l of o){let f=e.nodeIndexMap.get(l);this._writeNode(l,c[f])}return this}_writePrimitive(e,t,a){let s=t.getExtension(H);if(!s)return;let r=e.listPropertyTextures(),n=e.listPropertyAttributes(),i,o,c=s.listPropertyTextures();if(c.length>0){i=[];for(let u of c){let g=r.indexOf(u);if(g>=0)i.push(g);else throw new Error(`${H}: Invalid property texture in mesh primitive`)}}let l=s.listPropertyAttributes();if(l.length>0){o=[];for(let u of l){let g=n.indexOf(u);if(g>=0)o.push(g);else throw new Error(`${H}: Invalid property attribute in mesh primitive`)}}let f={propertyTextures:i,propertyAttributes:o};a.extensions=a.extensions||{},a.extensions[H]=f}_writeNode(e,t){let a=e.getExtension("EXT_structural_metadata");a&&(t.extensions=t.extensions||{},t.extensions[H]={class:a.getClass(),properties:a.getProperties()})}prewrite(e,t){return t===B.BUFFER&&this._prewriteBuffers(e),this}_prewriteBuffers(e){let t=this.document,a=t.getRoot().getExtension(H);e.jsonDoc.json.bufferViews||=[];for(let s of a.listPropertyTables())for(let r of s.listPropertyValues()){let n=Yg(t,e);n.push(r.getValues());let i=r.getArrayOffsets();i&&n.push(i);let o=r.getStringOffsets();o&&n.push(o)}}};function Tg(e,t,a){let s=e.createStructuralMetadata();if(a.schema!==void 0){let o=Ig(e,a.schema);s.setSchema(o)}else if(a.schemaUri){let o=a.schemaUri;s.setSchemaUri(o)}let r=a.propertyTextures||[];for(let o of r){let c=Cg(e,t,o);s.addPropertyTexture(c)}let n=a.propertyTables||[];for(let o of n){let c=Fg(e,t,o);s.addPropertyTable(c)}let i=a.propertyAttributes||[];for(let o of i){let c=Pg(e,o);s.addPropertyAttribute(c)}return s}function Ig(e,t){let a=e.createSchema().setId(t.id);t.name!==void 0&&a.setName(t.name),t.description!==void 0&&a.setDescription(t.description),t.version!==void 0&&a.setVersion(t.version);let s=t.classes||{};for(let n of Object.keys(s)){let i=s[n];a.setClass(n,Ag(e,i))}let r=t.enums||{};for(let n of Object.keys(r))a.setEnum(n,Rg(e,r[n]));return a}function Ag(e,t){let a=e.createClass();t.name!==void 0&&a.setName(t.name),t.description!==void 0&&a.setDescription(t.description);let s=t.properties||{};for(let r of Object.keys(s)){let n=_g(e,s[r]);a.setProperty(r,n)}return a}function _g(e,t){let a=e.createClassProperty().setType(t.type);return t.name!==void 0&&a.setName(t.name),t.description!==void 0&&a.setDescription(t.description),t.componentType!==void 0&&a.setComponentType(t.componentType),t.enumType!==void 0&&a.setEnumType(t.enumType),t.array!==void 0&&a.setArray(t.array),t.count!==void 0&&a.setCount(t.count),t.normalized!==void 0&&a.setNormalized(t.normalized),t.offset!==void 0&&a.setOffset(t.offset),t.scale!==void 0&&a.setScale(t.scale),t.max!==void 0&&a.setMax(t.max),t.min!==void 0&&a.setMin(t.min),t.required!==void 0&&a.setRequired(t.required),t.noData!==void 0&&a.setNoData(t.noData),t.default!==void 0&&a.setDefault(t.default),a}function Rg(e,t){let a=e.createEnum();t.name!==void 0&&a.setName(t.name),t.description!==void 0&&a.setDescription(t.description),t.valueType!==void 0&&a.setValueType(t.valueType);let s=t.values||{};for(let r of s)a.addEnumValue(Ng(e,r));return a}function Ng(e,t){let a=e.createEnumValue();return t.name!==void 0&&a.setName(t.name),t.description!==void 0&&a.setDescription(t.description),t.value!==void 0&&a.setValue(t.value),a}function Cg(e,t,a){let s=e.createPropertyTexture();s.setClass(a.class),a.name!==void 0&&s.setName(a.name);let r=a.properties||{};for(let n of Object.keys(r)){let i=Bg(e,t,r[n]);s.setProperty(n,i)}return s}function Bg(e,t,a){let s=e.createPropertyTextureProperty(),r=t.jsonDoc.json.textures||[];a.channels&&s.setChannels(a.channels);let n=r[a.index].source;if(n!==void 0){let i=t.textures[n];s.setTexture(i);let o=s.getTextureInfo();o&&t.setTextureInfo(o,a)}return a.offset!==void 0&&s.setOffset(a.offset),a.scale!==void 0&&s.setScale(a.scale),a.max!==void 0&&s.setMax(a.max),a.min!==void 0&&s.setMin(a.min),s}function Fg(e,t,a){let s=e.createPropertyTable().setClass(a.class).setCount(a.count);a.name!==void 0&&s.setName(a.name);let r=a.properties||{};for(let n of Object.keys(r)){let i=Og(e,t,r[n]);s.setProperty(n,i)}return s}function Og(e,t,a){let s=e.createPropertyTableProperty(),r=ni(t,a.values);if(s.setValues(r),a.arrayOffsets!==void 0){let n=ni(t,a.arrayOffsets);s.setArrayOffsets(n)}if(a.stringOffsets!==void 0){let n=ni(t,a.stringOffsets);s.setStringOffsets(n)}return a.arrayOffsetType!==void 0&&s.setArrayOffsetType(a.arrayOffsetType),a.stringOffsetType!==void 0&&s.setStringOffsetType(a.stringOffsetType),a.offset!==void 0&&s.setOffset(a.offset),a.scale!==void 0&&s.setScale(a.scale),a.max!==void 0&&s.setMax(a.max),a.min!==void 0&&s.setMin(a.min),s}function Pg(e,t){let a=e.createPropertyAttribute();a.setClass(t.class),t.name!==void 0&&a.setName(t.name);let s=t.properties||{};for(let r of Object.keys(s)){let n=jg(e,s[r]);a.setProperty(r,n)}return a}function jg(e,t){let a=e.createPropertyAttributeProperty();return a.setAttribute(t.attribute),t.offset!==void 0&&a.setOffset(t.offset),t.scale!==void 0&&a.setScale(t.scale),t.max!==void 0&&a.setMax(t.max),t.min!==void 0&&a.setMin(t.min),a}function Lg(e,t){let a={},s=t.getSchema();s&&(a.schema=Dg(s));let r=t.getSchemaUri();r&&(a.schemaUri=r);let n=t.listPropertyTables();if(n.length>0){let c=[];for(let l of n){let f=Vg(e,l);c.push(f)}a.propertyTables=c}let i=t.listPropertyTextures();if(i.length>0){let c=[];for(let l of i){let f=Xg(e,l);c.push(f)}a.propertyTextures=c}let o=t.listPropertyAttributes();if(o.length>0){let c=[];for(let l of o){let f=qg(l);c.push(f)}a.propertyAttributes=c}return a}function Dg(e){let t={id:e.getId()},a=e.listClassKeys();if(a.length>0){t.classes={};for(let r of a){let n=Ug(e.getClass(r));t.classes[r]=n}}let s=e.listEnumKeys();if(s.length>0){t.enums={};for(let r of s){let n=Gg(e.getEnum(r));t.enums[r]=n}}return e.getName()&&(t.name=e.getName()),e.getDescription()&&(t.description=e.getDescription()),e.getVersion()&&(t.version=e.getVersion()),t}function Ug(e){let t={},a=e.listPropertyKeys();if(a.length>0){t.properties={};for(let s of a){let r=e.getProperty(s);t.properties[s]=zg(r)}}return e.getName()&&(t.name=e.getName()),e.getDescription()&&(t.description=e.getDescription()),t}function zg(e){let t={type:e.getType()};return e.getArray()&&(t.array=e.getArray()),e.getNormalized()&&(t.normalized=e.getNormalized()),e.getRequired()&&(t.required=e.getRequired()),e.getName()&&(t.name=e.getName()),e.getDescription()&&(t.description=e.getDescription()),e.getComponentType()!=null&&(t.componentType=e.getComponentType()),e.getEnumType()!=null&&(t.enumType=e.getEnumType()),e.getCount()!=null&&(t.count=e.getCount()),e.getOffset()!=null&&(t.offset=e.getOffset()),e.getScale()!=null&&(t.scale=e.getScale()),e.getMax()!=null&&(t.max=e.getMax()),e.getMin()!=null&&(t.min=e.getMin()),e.getNoData()!=null&&(t.noData=e.getNoData()),e.getDefault()!=null&&(t.default=e.getDefault()),t}function Gg(e){let t={values:e.listValues().map(Kg)};return e.getName()&&(t.name=e.getName()),e.getDescription()&&(t.description=e.getDescription()),e.getValueType()!=="UINT16"&&(t.valueType=e.getValueType()),t}function Kg(e){let t={name:e.getName(),value:e.getValue()};return e.getDescription()&&(t.description=e.getDescription()),t}function Vg(e,t){let a={class:t.getClass(),count:t.getCount()};t.getName()&&(a.name=t.getName());let s=t.listPropertyKeys();if(s.length>0){a.properties={};for(let r of s){let n=Hg(e,t.getProperty(r));a.properties[r]=n}}return a}function Hg(e,t){let a=t.getValues(),s={values:e.otherBufferViewsIndexMap.get(a)};if(t.getArrayOffsets()){let r=t.getArrayOffsets();s.arrayOffsets=e.otherBufferViewsIndexMap.get(r)}if(t.getStringOffsets()){let r=t.getStringOffsets();s.stringOffsets=e.otherBufferViewsIndexMap.get(r)}return t.getArrayOffsetType()!=null&&(s.arrayOffsetType=t.getArrayOffsetType()),t.getStringOffsetType()!=null&&(s.stringOffsetType=t.getStringOffsetType()),t.getOffset()!=null&&(s.offset=t.getOffset()),t.getScale()!=null&&(s.scale=t.getScale()),t.getMax()!=null&&(s.max=t.getMax()),t.getMin()!=null&&(s.min=t.getMin()),s}function qg(e){let t={class:e.getClass()};e.getName()&&(t.name=e.getName());let a=e.listPropertyKeys();if(a.length>0){t.properties={};for(let s of a){let r=Wg(e.getProperty(s));t.properties[s]=r}}return t}function Wg(e){let t={attribute:e.getAttribute()};return e.getOffset()!=null&&(t.offset=e.getOffset()),e.getScale()!=null&&(t.scale=e.getScale()),e.getMax()!=null&&(t.max=e.getMax()),e.getMin()!=null&&(t.min=e.getMin()),t}function Xg(e,t){let a={class:t.getClass()};t.getName()&&(a.name=t.getName());let s=t.listPropertyKeys();if(s.length>0){a.properties={};for(let r of s){let n=$g(e,t.getProperty(r));a.properties[r]=n}}return a}function $g(e,t){let a=t.getTexture(),s=t.getTextureInfo(),r=t.getChannels(),n=e.createTextureInfoDef(a,s);return le.eq(r,[0])||(n.channels=r),t.getOffset()!=null&&(n.offset=t.getOffset()),t.getScale()!=null&&(n.scale=t.getScale()),t.getMax()!=null&&(n.max=t.getMax()),t.getMin()!=null&&(n.min=t.getMin()),n}function ni(e,t){let a=e.jsonDoc,s=a.json.buffers||[],r=(a.json.bufferViews||[])[t],n=s[r.buffer],i=n.uri?a.resources[n.uri]:a.resources[Ct],o=r.byteOffset||0,c=r.byteLength;return i.slice(o,o+c)}function Yg(e,t){let a=e.getRoot().listBuffers()[0],s=t.otherBufferViews.get(a);return s||(s=[],t.otherBufferViews.set(a,s)),s}var Jg=class{match(e){return e.length>=12&&q.decodeText(e.slice(4,12))==="ftypavif"}getSize(e){if(!this.match(e))return null;let t=new DataView(e.buffer,e.byteOffset,e.byteLength),a=il(t,0);if(!a)return null;let s=a.end;for(;a=il(t,s);)if(a.type==="meta")s=a.start+4;else if(a.type==="iprp"||a.type==="ipco")s=a.start;else{if(a.type==="ispe")return[t.getUint32(a.start+4),t.getUint32(a.start+8)];if(a.type==="mdat")break;s=a.end}return null}getChannels(e){return 4}},Qg=class extends ae{extensionName=dr;prereadTypes=[B.TEXTURE];static EXTENSION_NAME=dr;static register(){ct.registerFormat("image/avif",new Jg)}preread(e){return(e.jsonDoc.json.textures||[]).forEach(t=>{t.extensions&&t.extensions.EXT_texture_avif&&(t.source=t.extensions[dr].source)}),this}read(e){return this}write(e){let t=e.jsonDoc;return this.document.getRoot().listTextures().forEach(a=>{if(a.getMimeType()==="image/avif"){let s=e.imageIndexMap.get(a);(t.json.textures||[]).forEach(r=>{r.source===s&&(r.extensions=r.extensions||{},r.extensions[dr]={source:r.source},delete r.source)})}}),this}};function il(e,t){if(e.byteLength<4+t)return null;let a=e.getUint32(t);return e.byteLength<a+t||a<8?null:{type:q.decodeText(new Uint8Array(e.buffer,e.byteOffset+t+4,4)),start:t+8,end:t+a}}var Zg=class{match(e){return e.length>=12&&e[8]===87&&e[9]===69&&e[10]===66&&e[11]===80}getSize(e){let t=q.decodeText(e.slice(0,4)),a=q.decodeText(e.slice(8,12));if(t!=="RIFF"||a!=="WEBP")return null;let s=new DataView(e.buffer,e.byteOffset),r=12;for(;r<s.byteLength;){let n=q.decodeText(new Uint8Array([s.getUint8(r),s.getUint8(r+1),s.getUint8(r+2),s.getUint8(r+3)])),i=s.getUint32(r+4,!0);if(n==="VP8 ")return[s.getInt16(r+14,!0)&16383,s.getInt16(r+16,!0)&16383];if(n==="VP8L"){let o=s.getUint8(r+9),c=s.getUint8(r+10),l=s.getUint8(r+11),f=s.getUint8(r+12);return[1+((c&63)<<8|o),1+((f&15)<<10|l<<2|(c&192)>>6)]}r+=8+i+i%2}return null}getChannels(e){return 4}},em=class extends ae{extensionName=lr;prereadTypes=[B.TEXTURE];static EXTENSION_NAME=lr;static register(){ct.registerFormat("image/webp",new Zg)}preread(e){return(e.jsonDoc.json.textures||[]).forEach(t=>{t.extensions&&t.extensions.EXT_texture_webp&&(t.source=t.extensions[lr].source)}),this}read(e){return this}write(e){let t=e.jsonDoc;return this.document.getRoot().listTextures().forEach(a=>{if(a.getMimeType()==="image/webp"){let s=e.imageIndexMap.get(a);(t.json.textures||[]).forEach(r=>{r.source===s&&(r.extensions=r.extensions||{},r.extensions[lr]={source:r.source},delete r.source)})}}),this}},ol=Hp,tm=class extends ae{extensionName=ol;static EXTENSION_NAME=ol;read(e){return this}write(e){return this}},cl=qp,am=class extends ae{extensionName=cl;static EXTENSION_NAME=cl;read(e){return this}write(e){return this}},ye,Ml,kl;function sm(e,t){let a=new ye.DecoderBuffer;try{if(a.Init(t,t.length),e.GetEncodedGeometryType(a)!==ye.TRIANGULAR_MESH)throw new Error(`[${fe}] Unknown geometry type.`);let s=new ye.Mesh;if(!e.DecodeBufferToMesh(a,s).ok()||s.ptr===0)throw new Error(`[${fe}] Decoding failure.`);return s}finally{ye.destroy(a)}}function rm(e,t){let a=t.num_faces()*3,s,r;if(t.num_points()<=65534){let n=a*Uint16Array.BYTES_PER_ELEMENT;s=ye._malloc(n),e.GetTrianglesUInt16Array(t,n,s),r=new Uint16Array(ye.HEAPU16.buffer,s,a).slice()}else{let n=a*Uint32Array.BYTES_PER_ELEMENT;s=ye._malloc(n),e.GetTrianglesUInt32Array(t,n,s),r=new Uint32Array(ye.HEAPU32.buffer,s,a).slice()}return ye._free(s),r}function nm(e,t,a,s){let r=kl[s.componentType],n=Ml[s.componentType],i=a.num_components(),o=t.num_points()*i,c=o*n.BYTES_PER_ELEMENT,l=ye._malloc(c);e.GetAttributeDataArrayForAllPoints(t,a,r,c,l);let f=new n(ye.HEAPF32.buffer,l,o).slice();return ye._free(l),f}function im(e){ye=e,Ml={[G.ComponentType.FLOAT]:Float32Array,[G.ComponentType.UNSIGNED_INT]:Uint32Array,[G.ComponentType.UNSIGNED_SHORT]:Uint16Array,[G.ComponentType.UNSIGNED_BYTE]:Uint8Array,[G.ComponentType.SHORT]:Int16Array,[G.ComponentType.BYTE]:Int8Array},kl={[G.ComponentType.FLOAT]:ye.DT_FLOAT32,[G.ComponentType.UNSIGNED_INT]:ye.DT_UINT32,[G.ComponentType.UNSIGNED_SHORT]:ye.DT_UINT16,[G.ComponentType.UNSIGNED_BYTE]:ye.DT_UINT8,[G.ComponentType.SHORT]:ye.DT_INT16,[G.ComponentType.BYTE]:ye.DT_INT8}}var Xe,om=(function(e){return e[e.EDGEBREAKER=1]="EDGEBREAKER",e[e.SEQUENTIAL=0]="SEQUENTIAL",e})({}),El={POSITION:14,NORMAL:10,COLOR:8,TEX_COORD:12,GENERIC:12},ll={decodeSpeed:5,encodeSpeed:5,method:1,quantizationBits:El,quantizationVolume:"mesh"};function cm(e){Xe=e}function lm(e,t=ll){let a={...ll,...t};a.quantizationBits={...El,...t.quantizationBits};let s=new Xe.MeshBuilder,r=new Xe.Mesh,n=new Xe.ExpertEncoder(r),i={},o=new Xe.DracoInt8Array,c=e.listTargets().length>0,l=!1;for(let d of e.listSemantics()){let x=e.getAttribute(d);if(x.getSparse()){l=!0;continue}let p=dm(d),m=um(s,x.getComponentType(),r,Xe[p],x.getCount(),x.getElementSize(),x.getArray());if(m===-1)throw new Error(`Error compressing "${d}" attribute.`);if(i[d]=m,a.quantizationVolume==="mesh"||d!=="POSITION")n.SetAttributeQuantization(m,a.quantizationBits[p]);else if(typeof a.quantizationVolume=="object"){let{quantizationVolume:y}=a,v=Math.max(y.max[0]-y.min[0],y.max[1]-y.min[1],y.max[2]-y.min[2]);n.SetAttributeExplicitQuantization(m,a.quantizationBits[p],x.getElementSize(),y.min,v)}else throw new Error("Invalid quantization volume state.")}let f=e.getIndices();if(!f)throw new li("Primitive must have indices.");s.AddFacesToMesh(r,f.getCount()/3,f.getArray()),n.SetSpeedOptions(a.encodeSpeed,a.decodeSpeed),n.SetTrackEncodedProperties(!0),a.method===0||c||l?n.SetEncodingMethod(Xe.MESH_SEQUENTIAL_ENCODING):n.SetEncodingMethod(Xe.MESH_EDGEBREAKER_ENCODING);let u=n.EncodeToDracoBuffer(!(c||l),o);if(u<=0)throw new li("Error applying Draco compression.");let g=new Uint8Array(u);for(let d=0;d<u;++d)g[d]=o.GetValue(d);let b=n.GetNumberOfEncodedPoints(),h=n.GetNumberOfEncodedFaces()*3;return Xe.destroy(o),Xe.destroy(r),Xe.destroy(s),Xe.destroy(n),{numVertices:b,numIndices:h,data:g,attributeIDs:i}}function dm(e){return e==="POSITION"?"POSITION":e==="NORMAL"?"NORMAL":e.startsWith("COLOR_")?"COLOR":e.startsWith("TEXCOORD_")?"TEX_COORD":"GENERIC"}function um(e,t,a,s,r,n,i){switch(t){case G.ComponentType.UNSIGNED_BYTE:return e.AddUInt8Attribute(a,s,r,n,i);case G.ComponentType.BYTE:return e.AddInt8Attribute(a,s,r,n,i);case G.ComponentType.UNSIGNED_SHORT:return e.AddUInt16Attribute(a,s,r,n,i);case G.ComponentType.SHORT:return e.AddInt16Attribute(a,s,r,n,i);case G.ComponentType.UNSIGNED_INT:return e.AddUInt32Attribute(a,s,r,n,i);case G.ComponentType.FLOAT:return e.AddFloatAttribute(a,s,r,n,i);default:throw new Error(`Unexpected component type, "${t}".`)}}var li=class extends Error{},fm=class extends ae{extensionName=fe;prereadTypes=[B.PRIMITIVE];prewriteTypes=[B.ACCESSOR];readDependencies=["draco3d.decoder"];writeDependencies=["draco3d.encoder"];static EXTENSION_NAME=fe;static EncoderMethod=om;_decoderModule=null;_encoderModule=null;_encoderOptions={};install(e,t){return e==="draco3d.decoder"&&(this._decoderModule=t,im(this._decoderModule)),e==="draco3d.encoder"&&(this._encoderModule=t,cm(this._encoderModule)),this}setEncoderOptions(e){return this._encoderOptions=e,this}preread(e){if(!this._decoderModule)throw new Error(`[${fe}] Please install extension dependency, "draco3d.decoder".`);let t=this.document.getLogger(),a=e.jsonDoc,s=new Map;try{let r=a.json.meshes||[];for(let n of r)for(let i of n.primitives){if(!i.extensions||!i.extensions.KHR_draco_mesh_compression)continue;let o=i.extensions[fe],[c,l]=s.get(o.bufferView)||[];if(!l||!c){let f=a.json.bufferViews[o.bufferView],u=a.json.buffers[f.buffer],g=u.uri?a.resources[u.uri]:a.resources[Ct],b=f.byteOffset||0,h=f.byteLength,d=q.toView(g,b,h);c=new this._decoderModule.Decoder,l=sm(c,d),s.set(o.bufferView,[c,l]),t.debug(`[${fe}] Decompressed ${d.byteLength} bytes.`)}for(let f in o.attributes){let u=e.jsonDoc.json.accessors[i.attributes[f]],g=c.GetAttributeByUniqueId(l,o.attributes[f]),b=nm(c,l,g,u);e.accessors[i.attributes[f]].setArray(b)}i.indices!==void 0&&e.accessors[i.indices].setArray(rm(c,l))}}finally{for(let[r,n]of Array.from(s.values()))this._decoderModule.destroy(r),this._decoderModule.destroy(n)}return this}read(e){return this}prewrite(e,t){if(!this._encoderModule)throw new Error(`[${fe}] Please install extension dependency, "draco3d.encoder".`);let a=this.document.getLogger();a.debug(`[${fe}] Compression options: ${JSON.stringify(this._encoderOptions)}`);let s=hm(this.document),r=new Map,n="mesh";this._encoderOptions.quantizationVolume==="scene"&&(this.document.getRoot().listScenes().length!==1?a.warn(`[${fe}]: quantizationVolume=scene requires exactly 1 scene.`):n=Pc(this.document.getRoot().listScenes().pop()));for(let i of Array.from(s.keys())){let o=s.get(i);if(!o)throw new Error("Unexpected primitive.");if(r.has(o)){r.set(o,r.get(o));continue}let c=i.getIndices(),l=e.jsonDoc.json.accessors,f;try{f=lm(i,{...this._encoderOptions,quantizationVolume:n})}catch(b){if(b instanceof li){a.warn(`[${fe}]: ${b.message} Skipping primitive compression.`);continue}throw b}r.set(o,f);let u=e.createAccessorDef(c);u.count=f.numIndices,e.accessorIndexMap.set(c,l.length),l.push(u),f.numVertices>65534&&G.getComponentSize(u.componentType)<=2?u.componentType=G.ComponentType.UNSIGNED_INT:f.numVertices>254&&G.getComponentSize(u.componentType)<=1&&(u.componentType=G.ComponentType.UNSIGNED_SHORT);for(let b of i.listSemantics()){let h=i.getAttribute(b);if(f.attributeIDs[b]===void 0)continue;let d=e.createAccessorDef(h);d.count=f.numVertices,e.accessorIndexMap.set(h,l.length),l.push(d)}let g=i.getAttribute("POSITION").getBuffer()||this.document.getRoot().listBuffers()[0];e.otherBufferViews.has(g)||e.otherBufferViews.set(g,[]),e.otherBufferViews.get(g).push(f.data)}return a.debug(`[${fe}] Compressed ${s.size} primitives.`),e.extensionData[fe]={primitiveHashMap:s,primitiveEncodingMap:r},this}write(e){let t=e.extensionData[fe];for(let a of this.document.getRoot().listMeshes()){let s=e.jsonDoc.json.meshes[e.meshIndexMap.get(a)];for(let r=0;r<a.listPrimitives().length;r++){let n=a.listPrimitives()[r],i=s.primitives[r],o=t.primitiveHashMap.get(n);if(!o)continue;let c=t.primitiveEncodingMap.get(o);c&&(i.extensions=i.extensions||{},i.extensions[fe]={bufferView:e.otherBufferViewsIndexMap.get(c.data),attributes:c.attributeIDs})}}if(!t.primitiveHashMap.size){let a=e.jsonDoc.json;a.extensionsUsed=(a.extensionsUsed||[]).filter(s=>s!==fe),a.extensionsRequired=(a.extensionsRequired||[]).filter(s=>s!==fe)}return this}};function hm(e){let t=e.getLogger(),a=new Set,s=new Set,r=0,n=0;for(let u of e.getRoot().listMeshes())for(let g of u.listPrimitives())g.getIndices()?g.getMode()!==$a.Mode.TRIANGLES?(s.add(g),n++):a.add(g):(s.add(g),r++);r>0&&t.warn(`[${fe}] Skipping Draco compression of ${r} non-indexed primitives.`),n>0&&t.warn(`[${fe}] Skipping Draco compression of ${n} non-TRIANGLES primitives.`);let i=e.getRoot().listAccessors(),o=new Map;for(let u=0;u<i.length;u++)o.set(i[u],u);let c=new Map,l=new Set,f=new Map;for(let u of Array.from(a)){let g=dl(u,o);if(l.has(g)){f.set(u,g);continue}if(c.has(u.getIndices())){let b=u.getIndices(),h=b.clone();o.set(h,e.getRoot().listAccessors().length-1),u.swap(b,h)}for(let b of u.listAttributes())if(c.has(b)){let h=b.clone();o.set(h,e.getRoot().listAccessors().length-1),u.swap(b,h)}g=dl(u,o),l.add(g),f.set(u,g),c.set(u.getIndices(),g);for(let b of u.listAttributes())c.set(b,g)}for(let u of Array.from(c.keys())){let g=new Set(u.listParents().map(b=>b.propertyType));if(g.size!==2||!g.has(B.PRIMITIVE)||!g.has(B.ROOT))throw new Error(`[${fe}] Compressed accessors must only be used as indices or vertex attributes.`)}for(let u of Array.from(a)){let g=f.get(u),b=u.getIndices();if(c.get(b)!==g||u.listAttributes().some(h=>c.get(h)!==g))throw new Error(`[${fe}] Draco primitives must share all, or no, accessors.`)}for(let u of Array.from(s)){let g=u.getIndices();if(c.has(g)||u.listAttributes().some(b=>c.has(b)))throw new Error(`[${fe}] Accessor cannot be shared by compressed and uncompressed primitives.`)}return f}function dl(e,t){let a=[],s=e.getIndices();a.push(t.get(s));for(let r of e.listAttributes())a.push(t.get(r));return a.sort().join("|")}var ul=class Sl extends X{static EXTENSION_NAME=gt;static Type={POINT:"point",SPOT:"spot",DIRECTIONAL:"directional"};init(){this.extensionName=gt,this.propertyType="Light",this.parentTypes=[B.NODE]}getDefaults(){return Object.assign(super.getDefaults(),{color:[1,1,1],intensity:1,type:Sl.Type.POINT,range:null,innerConeAngle:0,outerConeAngle:Math.PI/4})}getColor(){return this.get("color")}setColor(t){return this.set("color",t)}getIntensity(){return this.get("intensity")}setIntensity(t){return this.set("intensity",t)}getType(){return this.get("type")}setType(t){return this.set("type",t)}getRange(){return this.get("range")}setRange(t){return this.set("range",t)}getInnerConeAngle(){return this.get("innerConeAngle")}setInnerConeAngle(t){return this.set("innerConeAngle",t)}getOuterConeAngle(){return this.get("outerConeAngle")}setOuterConeAngle(t){return this.set("outerConeAngle",t)}},bm=class extends ae{extensionName=gt;static EXTENSION_NAME=gt;createLight(e=""){return new ul(this.document.getGraph(),e)}read(e){let t=e.jsonDoc;if(!t.json.extensions||!t.json.extensions.KHR_lights_punctual)return this;let a=(t.json.extensions.KHR_lights_punctual.lights||[]).map(s=>{let r=this.createLight().setName(s.name||"").setType(s.type);return s.extras&&r.setExtras(s.extras),s.color!==void 0&&r.setColor(s.color),s.intensity!==void 0&&r.setIntensity(s.intensity),s.range!==void 0&&r.setRange(s.range),s.spot?.innerConeAngle!==void 0&&r.setInnerConeAngle(s.spot.innerConeAngle),s.spot?.outerConeAngle!==void 0&&r.setOuterConeAngle(s.spot.outerConeAngle),r});return t.json.nodes.forEach((s,r)=>{if(!s.extensions||!s.extensions.KHR_lights_punctual)return;let n=s.extensions[gt];e.nodes[r].setExtension(gt,a[n.light])}),this}write(e){let t=e.jsonDoc;if(this.properties.size===0)return this;let a=[],s=new Map;for(let r of this.properties){let n=r,i=e.createPropertyDef(r);i.type=n.getType(),le.eq(n.getColor(),[1,1,1])||(i.color=n.getColor()),n.getIntensity()!==1&&(i.intensity=n.getIntensity()),n.getRange()!=null&&(i.range=n.getRange()),n.getName()&&(i.name=n.getName()),n.getType()===ul.Type.SPOT&&(i.spot={innerConeAngle:n.getInnerConeAngle(),outerConeAngle:n.getOuterConeAngle()}),a.push(i),s.set(n,a.length-1)}return this.document.getRoot().listNodes().forEach(r=>{let n=r.getExtension(gt);if(n){let i=e.nodeIndexMap.get(r),o=t.json.nodes[i];o.extensions=o.extensions||{},o.extensions[gt]={light:s.get(n)}}}),t.json.extensions=t.json.extensions||{},t.json.extensions[gt]={lights:a},this}},{R:pm,G:gm,B:mm}=tt,ym=class extends X{static EXTENSION_NAME=Ot;init(){this.extensionName=Ot,this.propertyType="Anisotropy",this.parentTypes=[B.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{anisotropyStrength:0,anisotropyRotation:0,anisotropyTexture:null,anisotropyTextureInfo:new oe(this.graph,"anisotropyTextureInfo")})}getAnisotropyStrength(){return this.get("anisotropyStrength")}setAnisotropyStrength(e){return this.set("anisotropyStrength",e)}getAnisotropyRotation(){return this.get("anisotropyRotation")}setAnisotropyRotation(e){return this.set("anisotropyRotation",e)}getAnisotropyTexture(){return this.getRef("anisotropyTexture")}getAnisotropyTextureInfo(){return this.getRef("anisotropyTexture")?this.getRef("anisotropyTextureInfo"):null}setAnisotropyTexture(e){return this.setRef("anisotropyTexture",e,{channels:pm|gm|mm})}},xm=class extends ae{static EXTENSION_NAME=Ot;extensionName=Ot;prereadTypes=[B.MESH];prewriteTypes=[B.MESH];createAnisotropy(){return new ym(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((r,n)=>{if(r.extensions&&r.extensions.KHR_materials_anisotropy){let i=this.createAnisotropy();e.materials[n].setExtension(Ot,i);let o=r.extensions[Ot];if(o.extras&&i.setExtras(o.extras),o.anisotropyStrength!==void 0&&i.setAnisotropyStrength(o.anisotropyStrength),o.anisotropyRotation!==void 0&&i.setAnisotropyRotation(o.anisotropyRotation),o.anisotropyTexture!==void 0){let c=o.anisotropyTexture,l=e.textures[s[c.index].source];i.setAnisotropyTexture(l),e.setTextureInfo(i.getAnisotropyTextureInfo(),c)}}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(Ot);if(s){let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);if(n.extensions=n.extensions||{},n.extensions[Ot]=i,s.getAnisotropyStrength()>0&&(i.anisotropyStrength=s.getAnisotropyStrength()),s.getAnisotropyRotation()!==0&&(i.anisotropyRotation=s.getAnisotropyRotation()),s.getAnisotropyTexture()){let o=s.getAnisotropyTexture(),c=s.getAnisotropyTextureInfo();i.anisotropyTexture=e.createTextureInfoDef(o,c)}}}),this}},{R:fl,G:hl,B:wm}=tt,vm=class extends X{static EXTENSION_NAME=Pt;init(){this.extensionName=Pt,this.propertyType="Clearcoat",this.parentTypes=[B.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{clearcoatFactor:0,clearcoatTexture:null,clearcoatTextureInfo:new oe(this.graph,"clearcoatTextureInfo"),clearcoatRoughnessFactor:0,clearcoatRoughnessTexture:null,clearcoatRoughnessTextureInfo:new oe(this.graph,"clearcoatRoughnessTextureInfo"),clearcoatNormalScale:1,clearcoatNormalTexture:null,clearcoatNormalTextureInfo:new oe(this.graph,"clearcoatNormalTextureInfo")})}getClearcoatFactor(){return this.get("clearcoatFactor")}setClearcoatFactor(e){return this.set("clearcoatFactor",e)}getClearcoatTexture(){return this.getRef("clearcoatTexture")}getClearcoatTextureInfo(){return this.getRef("clearcoatTexture")?this.getRef("clearcoatTextureInfo"):null}setClearcoatTexture(e){return this.setRef("clearcoatTexture",e,{channels:fl})}getClearcoatRoughnessFactor(){return this.get("clearcoatRoughnessFactor")}setClearcoatRoughnessFactor(e){return this.set("clearcoatRoughnessFactor",e)}getClearcoatRoughnessTexture(){return this.getRef("clearcoatRoughnessTexture")}getClearcoatRoughnessTextureInfo(){return this.getRef("clearcoatRoughnessTexture")?this.getRef("clearcoatRoughnessTextureInfo"):null}setClearcoatRoughnessTexture(e){return this.setRef("clearcoatRoughnessTexture",e,{channels:hl})}getClearcoatNormalScale(){return this.get("clearcoatNormalScale")}setClearcoatNormalScale(e){return this.set("clearcoatNormalScale",e)}getClearcoatNormalTexture(){return this.getRef("clearcoatNormalTexture")}getClearcoatNormalTextureInfo(){return this.getRef("clearcoatNormalTexture")?this.getRef("clearcoatNormalTextureInfo"):null}setClearcoatNormalTexture(e){return this.setRef("clearcoatNormalTexture",e,{channels:fl|hl|wm})}},Mm=class extends ae{static EXTENSION_NAME=Pt;extensionName=Pt;prereadTypes=[B.MESH];prewriteTypes=[B.MESH];createClearcoat(){return new vm(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((r,n)=>{if(r.extensions&&r.extensions.KHR_materials_clearcoat){let i=this.createClearcoat();e.materials[n].setExtension(Pt,i);let o=r.extensions[Pt];if(o.extras&&i.setExtras(o.extras),o.clearcoatFactor!==void 0&&i.setClearcoatFactor(o.clearcoatFactor),o.clearcoatRoughnessFactor!==void 0&&i.setClearcoatRoughnessFactor(o.clearcoatRoughnessFactor),o.clearcoatTexture!==void 0){let c=o.clearcoatTexture,l=e.textures[s[c.index].source];i.setClearcoatTexture(l),e.setTextureInfo(i.getClearcoatTextureInfo(),c)}if(o.clearcoatRoughnessTexture!==void 0){let c=o.clearcoatRoughnessTexture,l=e.textures[s[c.index].source];i.setClearcoatRoughnessTexture(l),e.setTextureInfo(i.getClearcoatRoughnessTextureInfo(),c)}if(o.clearcoatNormalTexture!==void 0){let c=o.clearcoatNormalTexture,l=e.textures[s[c.index].source];i.setClearcoatNormalTexture(l),e.setTextureInfo(i.getClearcoatNormalTextureInfo(),c),c.scale!==void 0&&i.setClearcoatNormalScale(c.scale)}}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(Pt);if(s){let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);if(n.extensions=n.extensions||{},n.extensions[Pt]=i,i.clearcoatFactor=s.getClearcoatFactor(),i.clearcoatRoughnessFactor=s.getClearcoatRoughnessFactor(),s.getClearcoatTexture()){let o=s.getClearcoatTexture(),c=s.getClearcoatTextureInfo();i.clearcoatTexture=e.createTextureInfoDef(o,c)}if(s.getClearcoatRoughnessTexture()){let o=s.getClearcoatRoughnessTexture(),c=s.getClearcoatRoughnessTextureInfo();i.clearcoatRoughnessTexture=e.createTextureInfoDef(o,c)}if(s.getClearcoatNormalTexture()){let o=s.getClearcoatNormalTexture(),c=s.getClearcoatNormalTextureInfo();i.clearcoatNormalTexture=e.createTextureInfoDef(o,c),s.getClearcoatNormalScale()!==1&&(i.clearcoatNormalTexture.scale=s.getClearcoatNormalScale())}}}),this}},{R:km,G:Em,B:Sm,A:Tm}=tt,Im=class extends X{static EXTENSION_NAME=jt;init(){this.extensionName=jt,this.propertyType="DiffuseTransmission",this.parentTypes=[B.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{diffuseTransmissionFactor:0,diffuseTransmissionTexture:null,diffuseTransmissionTextureInfo:new oe(this.graph,"diffuseTransmissionTextureInfo"),diffuseTransmissionColorFactor:[1,1,1],diffuseTransmissionColorTexture:null,diffuseTransmissionColorTextureInfo:new oe(this.graph,"diffuseTransmissionColorTextureInfo")})}getDiffuseTransmissionFactor(){return this.get("diffuseTransmissionFactor")}setDiffuseTransmissionFactor(e){return this.set("diffuseTransmissionFactor",e)}getDiffuseTransmissionTexture(){return this.getRef("diffuseTransmissionTexture")}getDiffuseTransmissionTextureInfo(){return this.getRef("diffuseTransmissionTexture")?this.getRef("diffuseTransmissionTextureInfo"):null}setDiffuseTransmissionTexture(e){return this.setRef("diffuseTransmissionTexture",e,{channels:Tm})}getDiffuseTransmissionColorFactor(){return this.get("diffuseTransmissionColorFactor")}setDiffuseTransmissionColorFactor(e){return this.set("diffuseTransmissionColorFactor",e)}getDiffuseTransmissionColorTexture(){return this.getRef("diffuseTransmissionColorTexture")}getDiffuseTransmissionColorTextureInfo(){return this.getRef("diffuseTransmissionColorTexture")?this.getRef("diffuseTransmissionColorTextureInfo"):null}setDiffuseTransmissionColorTexture(e){return this.setRef("diffuseTransmissionColorTexture",e,{channels:km|Em|Sm})}},Am=class extends ae{extensionName=jt;static EXTENSION_NAME=jt;createDiffuseTransmission(){return new Im(this.document.getGraph())}read(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((r,n)=>{if(r.extensions&&r.extensions.KHR_materials_diffuse_transmission){let i=this.createDiffuseTransmission();e.materials[n].setExtension(jt,i);let o=r.extensions[jt];if(o.extras&&i.setExtras(o.extras),o.diffuseTransmissionFactor!==void 0&&i.setDiffuseTransmissionFactor(o.diffuseTransmissionFactor),o.diffuseTransmissionColorFactor!==void 0&&i.setDiffuseTransmissionColorFactor(o.diffuseTransmissionColorFactor),o.diffuseTransmissionTexture!==void 0){let c=o.diffuseTransmissionTexture,l=e.textures[s[c.index].source];i.setDiffuseTransmissionTexture(l),e.setTextureInfo(i.getDiffuseTransmissionTextureInfo(),c)}if(o.diffuseTransmissionColorTexture!==void 0){let c=o.diffuseTransmissionColorTexture,l=e.textures[s[c.index].source];i.setDiffuseTransmissionColorTexture(l),e.setTextureInfo(i.getDiffuseTransmissionColorTextureInfo(),c)}}}),this}write(e){let t=e.jsonDoc;for(let a of this.document.getRoot().listMaterials()){let s=a.getExtension(jt);if(!s)continue;let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);if(n.extensions=n.extensions||{},n.extensions[jt]=i,i.diffuseTransmissionFactor=s.getDiffuseTransmissionFactor(),i.diffuseTransmissionColorFactor=s.getDiffuseTransmissionColorFactor(),s.getDiffuseTransmissionTexture()){let o=s.getDiffuseTransmissionTexture(),c=s.getDiffuseTransmissionTextureInfo();i.diffuseTransmissionTexture=e.createTextureInfoDef(o,c)}if(s.getDiffuseTransmissionColorTexture()){let o=s.getDiffuseTransmissionColorTexture(),c=s.getDiffuseTransmissionColorTextureInfo();i.diffuseTransmissionColorTexture=e.createTextureInfoDef(o,c)}}return this}},_m=class extends X{static EXTENSION_NAME=Lt;init(){this.extensionName=Lt,this.propertyType="Dispersion",this.parentTypes=[B.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{dispersion:0})}getDispersion(){return this.get("dispersion")}setDispersion(e){return this.set("dispersion",e)}},Rm=class extends ae{static EXTENSION_NAME=Lt;extensionName=Lt;prereadTypes=[B.MESH];prewriteTypes=[B.MESH];createDispersion(){return new _m(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){return(e.jsonDoc.json.materials||[]).forEach((t,a)=>{if(t.extensions&&t.extensions.KHR_materials_dispersion){let s=this.createDispersion();e.materials[a].setExtension(Lt,s);let r=t.extensions[Lt];r.extras&&s.setExtras(r.extras),r.dispersion!==void 0&&s.setDispersion(r.dispersion)}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(Lt);if(s){let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);n.extensions=n.extensions||{},n.extensions[Lt]=i,i.dispersion=s.getDispersion()}}),this}},Nm=class extends X{static EXTENSION_NAME=Dt;init(){this.extensionName=Dt,this.propertyType="EmissiveStrength",this.parentTypes=[B.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{emissiveStrength:1})}getEmissiveStrength(){return this.get("emissiveStrength")}setEmissiveStrength(e){return this.set("emissiveStrength",e)}},Cm=class extends ae{static EXTENSION_NAME=Dt;extensionName=Dt;prereadTypes=[B.MESH];prewriteTypes=[B.MESH];createEmissiveStrength(){return new Nm(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){return(e.jsonDoc.json.materials||[]).forEach((t,a)=>{if(t.extensions&&t.extensions.KHR_materials_emissive_strength){let s=this.createEmissiveStrength();e.materials[a].setExtension(Dt,s);let r=t.extensions[Dt];r.extras&&s.setExtras(r.extras),r.emissiveStrength!==void 0&&s.setEmissiveStrength(r.emissiveStrength)}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(Dt);if(s){let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);n.extensions=n.extensions||{},n.extensions[Dt]=i,i.emissiveStrength=s.getEmissiveStrength()}}),this}},Bm=class extends X{static EXTENSION_NAME=Ut;init(){this.extensionName=Ut,this.propertyType="IOR",this.parentTypes=[B.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{ior:1.5})}getIOR(){return this.get("ior")}setIOR(e){return this.set("ior",e)}},Fm=class extends ae{static EXTENSION_NAME=Ut;extensionName=Ut;prereadTypes=[B.MESH];prewriteTypes=[B.MESH];createIOR(){return new Bm(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){return(e.jsonDoc.json.materials||[]).forEach((t,a)=>{if(t.extensions&&t.extensions.KHR_materials_ior){let s=this.createIOR();e.materials[a].setExtension(Ut,s);let r=t.extensions[Ut];r.extras&&s.setExtras(r.extras),r.ior!==void 0&&s.setIOR(r.ior)}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(Ut);if(s){let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);n.extensions=n.extensions||{},n.extensions[Ut]=i,i.ior=s.getIOR()}}),this}},{R:Om,G:Pm}=tt,jm=class extends X{static EXTENSION_NAME=zt;init(){this.extensionName=zt,this.propertyType="Iridescence",this.parentTypes=[B.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{iridescenceFactor:0,iridescenceTexture:null,iridescenceTextureInfo:new oe(this.graph,"iridescenceTextureInfo"),iridescenceIOR:1.3,iridescenceThicknessMinimum:100,iridescenceThicknessMaximum:400,iridescenceThicknessTexture:null,iridescenceThicknessTextureInfo:new oe(this.graph,"iridescenceThicknessTextureInfo")})}getIridescenceFactor(){return this.get("iridescenceFactor")}setIridescenceFactor(e){return this.set("iridescenceFactor",e)}getIridescenceTexture(){return this.getRef("iridescenceTexture")}getIridescenceTextureInfo(){return this.getRef("iridescenceTexture")?this.getRef("iridescenceTextureInfo"):null}setIridescenceTexture(e){return this.setRef("iridescenceTexture",e,{channels:Om})}getIridescenceIOR(){return this.get("iridescenceIOR")}setIridescenceIOR(e){return this.set("iridescenceIOR",e)}getIridescenceThicknessMinimum(){return this.get("iridescenceThicknessMinimum")}setIridescenceThicknessMinimum(e){return this.set("iridescenceThicknessMinimum",e)}getIridescenceThicknessMaximum(){return this.get("iridescenceThicknessMaximum")}setIridescenceThicknessMaximum(e){return this.set("iridescenceThicknessMaximum",e)}getIridescenceThicknessTexture(){return this.getRef("iridescenceThicknessTexture")}getIridescenceThicknessTextureInfo(){return this.getRef("iridescenceThicknessTexture")?this.getRef("iridescenceThicknessTextureInfo"):null}setIridescenceThicknessTexture(e){return this.setRef("iridescenceThicknessTexture",e,{channels:Pm})}},Lm=class extends ae{static EXTENSION_NAME=zt;extensionName=zt;prereadTypes=[B.MESH];prewriteTypes=[B.MESH];createIridescence(){return new jm(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((r,n)=>{if(r.extensions&&r.extensions.KHR_materials_iridescence){let i=this.createIridescence();e.materials[n].setExtension(zt,i);let o=r.extensions[zt];if(o.extras&&i.setExtras(o.extras),o.iridescenceFactor!==void 0&&i.setIridescenceFactor(o.iridescenceFactor),o.iridescenceIor!==void 0&&i.setIridescenceIOR(o.iridescenceIor),o.iridescenceThicknessMinimum!==void 0&&i.setIridescenceThicknessMinimum(o.iridescenceThicknessMinimum),o.iridescenceThicknessMaximum!==void 0&&i.setIridescenceThicknessMaximum(o.iridescenceThicknessMaximum),o.iridescenceTexture!==void 0){let c=o.iridescenceTexture,l=e.textures[s[c.index].source];i.setIridescenceTexture(l),e.setTextureInfo(i.getIridescenceTextureInfo(),c)}if(o.iridescenceThicknessTexture!==void 0){let c=o.iridescenceThicknessTexture,l=e.textures[s[c.index].source];i.setIridescenceThicknessTexture(l),e.setTextureInfo(i.getIridescenceThicknessTextureInfo(),c)}}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(zt);if(s){let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);if(n.extensions=n.extensions||{},n.extensions[zt]=i,s.getIridescenceFactor()>0&&(i.iridescenceFactor=s.getIridescenceFactor()),s.getIridescenceIOR()!==1.3&&(i.iridescenceIor=s.getIridescenceIOR()),s.getIridescenceThicknessMinimum()!==100&&(i.iridescenceThicknessMinimum=s.getIridescenceThicknessMinimum()),s.getIridescenceThicknessMaximum()!==400&&(i.iridescenceThicknessMaximum=s.getIridescenceThicknessMaximum()),s.getIridescenceTexture()){let o=s.getIridescenceTexture(),c=s.getIridescenceTextureInfo();i.iridescenceTexture=e.createTextureInfoDef(o,c)}if(s.getIridescenceThicknessTexture()){let o=s.getIridescenceThicknessTexture(),c=s.getIridescenceThicknessTextureInfo();i.iridescenceThicknessTexture=e.createTextureInfoDef(o,c)}}}),this}},{R:bl,G:pl,B:gl,A:ml}=tt,Dm=class extends X{static EXTENSION_NAME=Gt;init(){this.extensionName=Gt,this.propertyType="PBRSpecularGlossiness",this.parentTypes=[B.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{diffuseFactor:[1,1,1,1],diffuseTexture:null,diffuseTextureInfo:new oe(this.graph,"diffuseTextureInfo"),specularFactor:[1,1,1],glossinessFactor:1,specularGlossinessTexture:null,specularGlossinessTextureInfo:new oe(this.graph,"specularGlossinessTextureInfo")})}getDiffuseFactor(){return this.get("diffuseFactor")}setDiffuseFactor(e){return this.set("diffuseFactor",e)}getDiffuseTexture(){return this.getRef("diffuseTexture")}getDiffuseTextureInfo(){return this.getRef("diffuseTexture")?this.getRef("diffuseTextureInfo"):null}setDiffuseTexture(e){return this.setRef("diffuseTexture",e,{channels:bl|pl|gl|ml,isColor:!0})}getSpecularFactor(){return this.get("specularFactor")}setSpecularFactor(e){return this.set("specularFactor",e)}getGlossinessFactor(){return this.get("glossinessFactor")}setGlossinessFactor(e){return this.set("glossinessFactor",e)}getSpecularGlossinessTexture(){return this.getRef("specularGlossinessTexture")}getSpecularGlossinessTextureInfo(){return this.getRef("specularGlossinessTexture")?this.getRef("specularGlossinessTextureInfo"):null}setSpecularGlossinessTexture(e){return this.setRef("specularGlossinessTexture",e,{channels:bl|pl|gl|ml})}},Um=class extends ae{static EXTENSION_NAME=Gt;extensionName=Gt;prereadTypes=[B.MESH];prewriteTypes=[B.MESH];createPBRSpecularGlossiness(){return new Dm(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((r,n)=>{if(r.extensions&&r.extensions.KHR_materials_pbrSpecularGlossiness){let i=this.createPBRSpecularGlossiness();e.materials[n].setExtension(Gt,i);let o=r.extensions[Gt];if(o.extras&&i.setExtras(o.extras),o.diffuseFactor!==void 0&&i.setDiffuseFactor(o.diffuseFactor),o.specularFactor!==void 0&&i.setSpecularFactor(o.specularFactor),o.glossinessFactor!==void 0&&i.setGlossinessFactor(o.glossinessFactor),o.diffuseTexture!==void 0){let c=o.diffuseTexture,l=e.textures[s[c.index].source];i.setDiffuseTexture(l),e.setTextureInfo(i.getDiffuseTextureInfo(),c)}if(o.specularGlossinessTexture!==void 0){let c=o.specularGlossinessTexture,l=e.textures[s[c.index].source];i.setSpecularGlossinessTexture(l),e.setTextureInfo(i.getSpecularGlossinessTextureInfo(),c)}}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(Gt);if(s){let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);if(n.extensions=n.extensions||{},n.extensions[Gt]=i,i.diffuseFactor=s.getDiffuseFactor(),i.specularFactor=s.getSpecularFactor(),i.glossinessFactor=s.getGlossinessFactor(),s.getDiffuseTexture()){let o=s.getDiffuseTexture(),c=s.getDiffuseTextureInfo();i.diffuseTexture=e.createTextureInfoDef(o,c)}if(s.getSpecularGlossinessTexture()){let o=s.getSpecularGlossinessTexture(),c=s.getSpecularGlossinessTextureInfo();i.specularGlossinessTexture=e.createTextureInfoDef(o,c)}}}),this}},{R:zm,G:Gm,B:Km,A:Vm}=tt,Hm=class extends X{static EXTENSION_NAME=Kt;init(){this.extensionName=Kt,this.propertyType="Sheen",this.parentTypes=[B.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{sheenColorFactor:[0,0,0],sheenColorTexture:null,sheenColorTextureInfo:new oe(this.graph,"sheenColorTextureInfo"),sheenRoughnessFactor:0,sheenRoughnessTexture:null,sheenRoughnessTextureInfo:new oe(this.graph,"sheenRoughnessTextureInfo")})}getSheenColorFactor(){return this.get("sheenColorFactor")}setSheenColorFactor(e){return this.set("sheenColorFactor",e)}getSheenColorTexture(){return this.getRef("sheenColorTexture")}getSheenColorTextureInfo(){return this.getRef("sheenColorTexture")?this.getRef("sheenColorTextureInfo"):null}setSheenColorTexture(e){return this.setRef("sheenColorTexture",e,{channels:zm|Gm|Km,isColor:!0})}getSheenRoughnessFactor(){return this.get("sheenRoughnessFactor")}setSheenRoughnessFactor(e){return this.set("sheenRoughnessFactor",e)}getSheenRoughnessTexture(){return this.getRef("sheenRoughnessTexture")}getSheenRoughnessTextureInfo(){return this.getRef("sheenRoughnessTexture")?this.getRef("sheenRoughnessTextureInfo"):null}setSheenRoughnessTexture(e){return this.setRef("sheenRoughnessTexture",e,{channels:Vm})}},qm=class extends ae{static EXTENSION_NAME=Kt;extensionName=Kt;prereadTypes=[B.MESH];prewriteTypes=[B.MESH];createSheen(){return new Hm(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((r,n)=>{if(r.extensions&&r.extensions.KHR_materials_sheen){let i=this.createSheen();e.materials[n].setExtension(Kt,i);let o=r.extensions[Kt];if(o.extras&&i.setExtras(o.extras),o.sheenColorFactor!==void 0&&i.setSheenColorFactor(o.sheenColorFactor),o.sheenRoughnessFactor!==void 0&&i.setSheenRoughnessFactor(o.sheenRoughnessFactor),o.sheenColorTexture!==void 0){let c=o.sheenColorTexture,l=e.textures[s[c.index].source];i.setSheenColorTexture(l),e.setTextureInfo(i.getSheenColorTextureInfo(),c)}if(o.sheenRoughnessTexture!==void 0){let c=o.sheenRoughnessTexture,l=e.textures[s[c.index].source];i.setSheenRoughnessTexture(l),e.setTextureInfo(i.getSheenRoughnessTextureInfo(),c)}}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(Kt);if(s){let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);if(n.extensions=n.extensions||{},n.extensions[Kt]=i,i.sheenColorFactor=s.getSheenColorFactor(),i.sheenRoughnessFactor=s.getSheenRoughnessFactor(),s.getSheenColorTexture()){let o=s.getSheenColorTexture(),c=s.getSheenColorTextureInfo();i.sheenColorTexture=e.createTextureInfoDef(o,c)}if(s.getSheenRoughnessTexture()){let o=s.getSheenRoughnessTexture(),c=s.getSheenRoughnessTextureInfo();i.sheenRoughnessTexture=e.createTextureInfoDef(o,c)}}}),this}},{R:Wm,G:Xm,B:$m,A:Ym}=tt,Jm=class extends X{static EXTENSION_NAME=Vt;init(){this.extensionName=Vt,this.propertyType="Specular",this.parentTypes=[B.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{specularFactor:1,specularTexture:null,specularTextureInfo:new oe(this.graph,"specularTextureInfo"),specularColorFactor:[1,1,1],specularColorTexture:null,specularColorTextureInfo:new oe(this.graph,"specularColorTextureInfo")})}getSpecularFactor(){return this.get("specularFactor")}setSpecularFactor(e){return this.set("specularFactor",e)}getSpecularColorFactor(){return this.get("specularColorFactor")}setSpecularColorFactor(e){return this.set("specularColorFactor",e)}getSpecularTexture(){return this.getRef("specularTexture")}getSpecularTextureInfo(){return this.getRef("specularTexture")?this.getRef("specularTextureInfo"):null}setSpecularTexture(e){return this.setRef("specularTexture",e,{channels:Ym})}getSpecularColorTexture(){return this.getRef("specularColorTexture")}getSpecularColorTextureInfo(){return this.getRef("specularColorTexture")?this.getRef("specularColorTextureInfo"):null}setSpecularColorTexture(e){return this.setRef("specularColorTexture",e,{channels:Wm|Xm|$m,isColor:!0})}},Qm=class extends ae{static EXTENSION_NAME=Vt;extensionName=Vt;prereadTypes=[B.MESH];prewriteTypes=[B.MESH];createSpecular(){return new Jm(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((r,n)=>{if(r.extensions&&r.extensions.KHR_materials_specular){let i=this.createSpecular();e.materials[n].setExtension(Vt,i);let o=r.extensions[Vt];if(o.extras&&i.setExtras(o.extras),o.specularFactor!==void 0&&i.setSpecularFactor(o.specularFactor),o.specularColorFactor!==void 0&&i.setSpecularColorFactor(o.specularColorFactor),o.specularTexture!==void 0){let c=o.specularTexture,l=e.textures[s[c.index].source];i.setSpecularTexture(l),e.setTextureInfo(i.getSpecularTextureInfo(),c)}if(o.specularColorTexture!==void 0){let c=o.specularColorTexture,l=e.textures[s[c.index].source];i.setSpecularColorTexture(l),e.setTextureInfo(i.getSpecularColorTextureInfo(),c)}}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(Vt);if(s){let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);if(n.extensions=n.extensions||{},n.extensions[Vt]=i,s.getSpecularFactor()!==1&&(i.specularFactor=s.getSpecularFactor()),le.eq(s.getSpecularColorFactor(),[1,1,1])||(i.specularColorFactor=s.getSpecularColorFactor()),s.getSpecularTexture()){let o=s.getSpecularTexture(),c=s.getSpecularTextureInfo();i.specularTexture=e.createTextureInfoDef(o,c)}if(s.getSpecularColorTexture()){let o=s.getSpecularColorTexture(),c=s.getSpecularColorTextureInfo();i.specularColorTexture=e.createTextureInfoDef(o,c)}}}),this}},{R:Zm}=tt,e0=class extends X{static EXTENSION_NAME=Ht;init(){this.extensionName=Ht,this.propertyType="Transmission",this.parentTypes=[B.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{transmissionFactor:0,transmissionTexture:null,transmissionTextureInfo:new oe(this.graph,"transmissionTextureInfo")})}getTransmissionFactor(){return this.get("transmissionFactor")}setTransmissionFactor(e){return this.set("transmissionFactor",e)}getTransmissionTexture(){return this.getRef("transmissionTexture")}getTransmissionTextureInfo(){return this.getRef("transmissionTexture")?this.getRef("transmissionTextureInfo"):null}setTransmissionTexture(e){return this.setRef("transmissionTexture",e,{channels:Zm})}},t0=class extends ae{static EXTENSION_NAME=Ht;extensionName=Ht;prereadTypes=[B.MESH];prewriteTypes=[B.MESH];createTransmission(){return new e0(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((r,n)=>{if(r.extensions&&r.extensions.KHR_materials_transmission){let i=this.createTransmission();e.materials[n].setExtension(Ht,i);let o=r.extensions[Ht];if(o.extras&&i.setExtras(o.extras),o.transmissionFactor!==void 0&&i.setTransmissionFactor(o.transmissionFactor),o.transmissionTexture!==void 0){let c=o.transmissionTexture,l=e.textures[s[c.index].source];i.setTransmissionTexture(l),e.setTextureInfo(i.getTransmissionTextureInfo(),c)}}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(Ht);if(s){let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);if(n.extensions=n.extensions||{},n.extensions[Ht]=i,i.transmissionFactor=s.getTransmissionFactor(),s.getTransmissionTexture()){let o=s.getTransmissionTexture(),c=s.getTransmissionTextureInfo();i.transmissionTexture=e.createTextureInfoDef(o,c)}}}),this}},a0=class extends X{static EXTENSION_NAME=va;init(){this.extensionName=va,this.propertyType="Unlit",this.parentTypes=[B.MATERIAL]}},s0=class extends ae{static EXTENSION_NAME=va;extensionName=va;prereadTypes=[B.MESH];prewriteTypes=[B.MESH];createUnlit(){return new a0(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){return(e.jsonDoc.json.materials||[]).forEach((t,a)=>{t.extensions&&t.extensions.KHR_materials_unlit&&e.materials[a].setExtension(va,this.createUnlit())}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{if(a.getExtension("KHR_materials_unlit")){let s=e.materialIndexMap.get(a),r=t.json.materials[s];r.extensions=r.extensions||{},r.extensions[va]={}}}),this}},r0=class extends X{static EXTENSION_NAME=Ue;init(){this.extensionName=Ue,this.propertyType="Mapping",this.parentTypes=["MappingList"]}getDefaults(){return Object.assign(super.getDefaults(),{material:null,variants:new ne})}getMaterial(){return this.getRef("material")}setMaterial(e){return this.setRef("material",e)}addVariant(e){return this.addRef("variants",e)}removeVariant(e){return this.removeRef("variants",e)}listVariants(){return this.listRefs("variants")}},n0=class extends X{static EXTENSION_NAME=Ue;init(){this.extensionName=Ue,this.propertyType="MappingList",this.parentTypes=[B.PRIMITIVE]}getDefaults(){return Object.assign(super.getDefaults(),{mappings:new ne})}addMapping(e){return this.addRef("mappings",e)}removeMapping(e){return this.removeRef("mappings",e)}listMappings(){return this.listRefs("mappings")}},yl=class extends X{static EXTENSION_NAME=Ue;init(){this.extensionName=Ue,this.propertyType="Variant",this.parentTypes=["MappingList"]}},i0=class extends ae{extensionName=Ue;static EXTENSION_NAME=Ue;createMappingList(){return new n0(this.document.getGraph())}createVariant(e=""){return new yl(this.document.getGraph(),e)}createMapping(){return new r0(this.document.getGraph())}listVariants(){return Array.from(this.properties).filter(e=>e instanceof yl)}read(e){let t=e.jsonDoc;if(!t.json.extensions||!t.json.extensions.KHR_materials_variants)return this;let a=(t.json.extensions.KHR_materials_variants.variants||[]).map(s=>this.createVariant().setName(s.name||""));return(t.json.meshes||[]).forEach((s,r)=>{let n=e.meshes[r];(s.primitives||[]).forEach((i,o)=>{if(!i.extensions||!i.extensions.KHR_materials_variants)return;let c=this.createMappingList(),l=i.extensions[Ue];for(let f of l.mappings){let u=this.createMapping();f.material!==void 0&&u.setMaterial(e.materials[f.material]);for(let g of f.variants||[])u.addVariant(a[g]);c.addMapping(u)}n.listPrimitives()[o].setExtension(Ue,c)})}),this}write(e){let t=e.jsonDoc,a=this.listVariants();if(!a.length)return this;let s=[],r=new Map;for(let n of a)r.set(n,s.length),s.push(e.createPropertyDef(n));for(let n of this.document.getRoot().listMeshes()){let i=e.meshIndexMap.get(n);n.listPrimitives().forEach((o,c)=>{let l=o.getExtension(Ue);if(!l)return;let f=e.jsonDoc.json.meshes[i].primitives[c],u=l.listMappings().map(g=>{let b=e.createPropertyDef(g),h=g.getMaterial();return h&&(b.material=e.materialIndexMap.get(h)),b.variants=g.listVariants().map(d=>r.get(d)),b});f.extensions=f.extensions||{},f.extensions[Ue]={mappings:u}})}return t.json.extensions=t.json.extensions||{},t.json.extensions[Ue]={variants:s},this}},{G:o0}=tt,c0=class extends X{static EXTENSION_NAME=qt;init(){this.extensionName=qt,this.propertyType="Volume",this.parentTypes=[B.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{thicknessFactor:0,thicknessTexture:null,thicknessTextureInfo:new oe(this.graph,"thicknessTexture"),attenuationDistance:1/0,attenuationColor:[1,1,1]})}getThicknessFactor(){return this.get("thicknessFactor")}setThicknessFactor(e){return this.set("thicknessFactor",e)}getThicknessTexture(){return this.getRef("thicknessTexture")}getThicknessTextureInfo(){return this.getRef("thicknessTexture")?this.getRef("thicknessTextureInfo"):null}setThicknessTexture(e){return this.setRef("thicknessTexture",e,{channels:o0})}getAttenuationDistance(){return this.get("attenuationDistance")}setAttenuationDistance(e){return this.set("attenuationDistance",e)}getAttenuationColor(){return this.get("attenuationColor")}setAttenuationColor(e){return this.set("attenuationColor",e)}},l0=class extends ae{static EXTENSION_NAME=qt;extensionName=qt;prereadTypes=[B.MESH];prewriteTypes=[B.MESH];createVolume(){return new c0(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((r,n)=>{if(r.extensions&&r.extensions.KHR_materials_volume){let i=this.createVolume();e.materials[n].setExtension(qt,i);let o=r.extensions[qt];if(o.extras&&i.setExtras(o.extras),o.thicknessFactor!==void 0&&i.setThicknessFactor(o.thicknessFactor),o.attenuationDistance!==void 0&&i.setAttenuationDistance(o.attenuationDistance),o.attenuationColor!==void 0&&i.setAttenuationColor(o.attenuationColor),o.thicknessTexture!==void 0){let c=o.thicknessTexture,l=e.textures[s[c.index].source];i.setThicknessTexture(l),e.setTextureInfo(i.getThicknessTextureInfo(),c)}}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(qt);if(s){let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);if(n.extensions=n.extensions||{},n.extensions[qt]=i,s.getThicknessFactor()>0&&(i.thicknessFactor=s.getThicknessFactor()),Number.isFinite(s.getAttenuationDistance())&&(i.attenuationDistance=s.getAttenuationDistance()),le.eq(s.getAttenuationColor(),[1,1,1])||(i.attenuationColor=s.getAttenuationColor()),s.getThicknessTexture()){let o=s.getThicknessTexture(),c=s.getThicknessTextureInfo();i.thicknessTexture=e.createTextureInfoDef(o,c)}}}),this}},d0=class extends ae{extensionName=tl;static EXTENSION_NAME=tl;read(e){return this}write(e){return this}},fi=class extends ae{extensionName=al;static EXTENSION_NAME=al;read(e){return this}write(e){return this}},u0=class extends X{static EXTENSION_NAME=Wt;init(){this.extensionName=Wt,this.propertyType="Visibility",this.parentTypes=[B.NODE]}getDefaults(){return Object.assign(super.getDefaults(),{visible:!0})}getVisible(){return this.get("visible")}setVisible(e){return this.set("visible",e)}},f0=class extends ae{static EXTENSION_NAME=Wt;extensionName=Wt;createVisibility(){return new u0(this.document.getGraph())}read(e){return(e.jsonDoc.json.nodes||[]).forEach((t,a)=>{if(t.extensions&&t.extensions.KHR_node_visibility){let s=this.createVisibility();e.nodes[a].setExtension(Wt,s);let r=t.extensions[Wt];r.visible!==void 0&&s.setVisible(r.visible)}}),this}write(e){let t=e.jsonDoc;for(let a of this.document.getRoot().listNodes()){let s=a.getExtension(Wt);if(!s)continue;let r=e.nodeIndexMap.get(a),n=t.json.nodes[r];n.extensions=n.extensions||{},n.extensions[Wt]={visible:s.getVisible()}}return this}};function h0(e){return e.vkFormat>0&&e.vkFormat<=123}function xl(e){let t=e.vkFormat===1000066e3&&e.dataFormatDescriptor[0].colorModel===167;return e.vkFormat===0||t}var b0=class{match(e){return e[0]===171&&e[1]===75&&e[2]===84&&e[3]===88&&e[4]===32&&e[5]===50&&e[6]===48&&e[7]===187&&e[8]===13&&e[9]===10&&e[10]===26&&e[11]===10}getSize(e){let t=cr(e);return[t.pixelWidth,t.pixelHeight]}getChannels(e){let t=cr(e),a=t.dataFormatDescriptor[0];if(h0(t))return a.samples.length;if(xl(t))switch(a.colorModel){case 163:return a.samples.length===2&&(a.samples[1].channelType&15)===15?4:3;case 166:return(a.samples[0].channelType&15)===3?4:3;default:throw new Error(`Unexpected KTX2 colorModel, "${a.colorModel}".`)}throw new Error(`Unexpected KTX2 vkFormat, "${t.vkFormat}".`)}getVRAMByteLength(e){let t=cr(e),a=0;if(xl(t)){let s=this.getChannels(e)>3;for(let r=0;r<t.levels.length;r++){let n=t.levels[r];if(n.uncompressedByteLength)a+=n.uncompressedByteLength;else{let i=Math.max(1,Math.floor(t.pixelWidth/Math.pow(2,r))),o=Math.max(1,Math.floor(t.pixelHeight/Math.pow(2,r))),c=s?16:8;a+=i/4*(o/4)*c}}}else for(let s of t.levels)t.supercompressionScheme===0?a+=s.levelData.byteLength:a+=s.uncompressedByteLength;return a}},p0=class extends ae{static EXTENSION_NAME=ur;extensionName=ur;prereadTypes=[B.TEXTURE];static register(){ct.registerFormat("image/ktx2",new b0)}preread(e){return e.jsonDoc.json.textures&&e.jsonDoc.json.textures.forEach(t=>{t.extensions&&t.extensions.KHR_texture_basisu&&(t.source=t.extensions[ur].source)}),this}read(e){return this}write(e){let t=e.jsonDoc;return this.document.getRoot().listTextures().forEach(a=>{if(a.getMimeType()==="image/ktx2"){let s=e.imageIndexMap.get(a);t.json.textures.forEach(r=>{r.source===s&&(r.extensions=r.extensions||{},r.extensions[ur]={source:r.source},delete r.source)})}}),this}},g0=class extends X{static EXTENSION_NAME=Xt;init(){this.extensionName=Xt,this.propertyType="Transform",this.parentTypes=[B.TEXTURE_INFO]}getDefaults(){return Object.assign(super.getDefaults(),{offset:[0,0],rotation:0,scale:[1,1],texCoord:null})}getOffset(){return this.get("offset")}setOffset(e){return this.set("offset",e)}getRotation(){return this.get("rotation")}setRotation(e){return this.set("rotation",e)}getScale(){return this.get("scale")}setScale(e){return this.set("scale",e)}getTexCoord(){return this.get("texCoord")}setTexCoord(e){return this.set("texCoord",e)}},m0=class extends ae{extensionName=Xt;static EXTENSION_NAME=Xt;createTransform(){return new g0(this.document.getGraph())}read(e){for(let[t,a]of Array.from(e.textureInfos.entries())){if(!a.extensions||!a.extensions.KHR_texture_transform)continue;let s=this.createTransform(),r=a.extensions[Xt];r.offset!==void 0&&s.setOffset(r.offset),r.rotation!==void 0&&s.setRotation(r.rotation),r.scale!==void 0&&s.setScale(r.scale),r.texCoord!==void 0&&s.setTexCoord(r.texCoord),t.setExtension(Xt,s)}return this}write(e){let t=Array.from(e.textureInfoDefMap.entries());for(let[a,s]of t){let r=a.getExtension(Xt);if(!r)continue;s.extensions=s.extensions||{};let n={},i=le.eq;i(r.getOffset(),[0,0])||(n.offset=r.getOffset()),r.getRotation()!==0&&(n.rotation=r.getRotation()),i(r.getScale(),[1,1])||(n.scale=r.getScale()),r.getTexCoord()!=null&&(n.texCoord=r.getTexCoord()),s.extensions[Xt]=n}return this}},y0=[B.ROOT,B.SCENE,B.NODE,B.MESH,B.MATERIAL,B.TEXTURE,B.ANIMATION],x0=class extends X{static EXTENSION_NAME=at;init(){this.extensionName=at,this.propertyType="Packet",this.parentTypes=y0}getDefaults(){return Object.assign(super.getDefaults(),{context:{},properties:{}})}getContext(){return this.get("context")}setContext(e){return this.set("context",{...e})}listProperties(){return Object.keys(this.get("properties"))}getProperty(e){let t=this.get("properties");return e in t?t[e]:null}setProperty(e,t){this._assertContext(e);let a={...this.get("properties")};return t?a[e]=t:delete a[e],this.set("properties",a)}toJSONLD(){return{"@context":ii(this.get("context")),...ii(this.get("properties"))}}fromJSONLD(e){e=ii(e);let t=e["@context"];return t&&this.set("context",t),delete e["@context"],this.set("properties",e)}_assertContext(e){if(!(e.split(":")[0]in this.get("context")))throw new Error(`${at}: Missing context for term, "${e}".`)}};function ii(e){return JSON.parse(JSON.stringify(e))}var w0=class extends ae{extensionName=at;static EXTENSION_NAME=at;createPacket(){return new x0(this.document.getGraph())}listPackets(){return Array.from(this.properties)}read(e){let t=e.jsonDoc.json.extensions?.[at];if(!t||!t.packets)return this;let a=e.jsonDoc.json,s=this.document.getRoot(),r=t.packets.map(o=>this.createPacket().fromJSONLD(o)),n=[[a.asset],a.scenes,a.nodes,a.meshes,a.materials,a.images,a.animations],i=[[s],s.listScenes(),s.listNodes(),s.listMeshes(),s.listMaterials(),s.listTextures(),s.listAnimations()];for(let o=0;o<n.length;o++){let c=n[o]||[];for(let l=0;l<c.length;l++){let f=c[l];if(f.extensions&&f.extensions.KHR_xmp_json_ld){let u=f.extensions[at];i[o][l].setExtension(at,r[u.packet])}}}return this}write(e){let{json:t}=e.jsonDoc,a=[];for(let s of this.properties){a.push(s.toJSONLD());for(let r of s.listParents()){let n;switch(r.propertyType){case B.ROOT:n=t.asset;break;case B.SCENE:n=t.scenes[e.sceneIndexMap.get(r)];break;case B.NODE:n=t.nodes[e.nodeIndexMap.get(r)];break;case B.MESH:n=t.meshes[e.meshIndexMap.get(r)];break;case B.MATERIAL:n=t.materials[e.materialIndexMap.get(r)];break;case B.TEXTURE:n=t.images[e.imageIndexMap.get(r)];break;case B.ANIMATION:n=t.animations[e.animationIndexMap.get(r)];break;default:n=null,this.document.getLogger().warn(`[${at}]: Unsupported parent property, "${r.propertyType}"`);break}n&&(n.extensions=n.extensions||{},n.extensions[at]={packet:a.length-1})}}return a.length>0&&(t.extensions=t.extensions||{},t.extensions[at]={packets:a}),this}},v0=[tm,am,fm,bm,xm,Mm,Am,Rm,Cm,Fm,Lm,Um,Qm,qm,t0,s0,i0,l0,d0,fi,f0,p0,m0,w0],wk=[eg,di,ui,Sg,Qg,em,...v0];var DE=(function(){var e="b9H79Tebbbe9ok9Geueu9Geub9Gbb9Gruuuuuuueu9Gvuuuuueu9Gduueu9Gluuuueu9Gvuuuuub9Gouuuuuub9Gluuuub9Giuuueui8AYdilveoveovrrwrrDDoDrbqqbelve9Weiiviebeoweuec;G:Qdkr:nlAo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bb8F9TW79O9V9Wt9FW9U9J9V9KW9wWVtW949c919M9MWV9mW4W2be8A9TW79O9V9Wt9FW9U9J9V9KW9wWVtW949c919M9MWVbd8F9TW79O9V9Wt9FW9U9J9V9KW9wWVtW949c919M9MWV9c9V919U9KbiE9TW79O9V9Wt9FW9U9J9V9KW9wWVtW949wWV79P9V9UblY9TW79O9V9Wt9FW9U9J9V9KW69U9KW949c919M9MWVbv8E9TW79O9V9Wt9FW9U9J9V9KW69U9KW949c919M9MWV9c9V919U9Kbo8A9TW79O9V9Wt9FW9U9J9V9KW69U9KW949wWV79P9V9UbrE9TW79O9V9Wt9FW9U9J9V9KW69U9KW949tWG91W9U9JWbwa9TW79O9V9Wt9FW9U9J9V9KW69U9KW949tWG91W9U9JW9c9V919U9KbDL9TW79O9V9Wt9FW9U9J9V9KWS9P2tWV9p9JtbqK9TW79O9V9Wt9FW9U9J9V9KWS9P2tWV9r919HtbkL9TW79O9V9Wt9FW9U9J9V9KWS9P2tWVT949WbxE9TW79O9V9Wt9F9V9Wt9P9T9P96W9wWVtW94J9H9J9OWbsa9TW79O9V9Wt9F9V9Wt9P9T9P96W9wWVtW94J9H9J9OW9ttV9P9Wbza9TW79O9V9Wt9F9V9Wt9P9T9P96W9wWVtW94SWt9J9O9sW9T9H9WbHK9TW79O9V9Wt9F79W9Ht9P9H29t9VVt9sW9T9H9WbOl79IV9RbCDwebcekdKLqN9OYdbk:Bhdhud9:8Jjjjjbc;qw9Rgr8KjjjjbcbhwdnaeTmbabcbyd;C:kjjbaoaocb9iEgDc:GeV86bbarc;adfcbcjdz:wjjjb8AdnaiTmbarc;adfadalz:vjjjb8Akarc;abfalfcbcbcjdal9RalcFe0Ez:wjjjb8Aarc;abfarc;adfalz:vjjjb8AarcUf9cb83ibarc8Wf9cb83ibarcyf9cb83ibarcaf9cb83ibarcKf9cb83ibarczf9cb83ibar9cb83iwar9cb83ibcj;abal9Uc;WFbGcjdalca0Ehqdnaicd6mbavcd9imbaDTmbadcefhkaqci2gxal2hmarc;alfclfhParc;qlfceVhsarc;qofclVhzarc;qofcKfhHarc;qofczfhOcbhAincdhCcbhodnavci6mbaH9cb83ibaO9cb83ibar9cb83i;yoar9cb83i;qoadaAfgoybbhXcbhQincbhwcbhLdninaoalfhKaoybbgYaX7aLVhLawcP0meaKhoaYhXawcefgwaQfai6mbkkcbhXarc;qofhwincwh8AcwhEdnaLaX93gocFeGg3cs0mbclhEa3ci0mba3cb9hcethEkdnaocw4cFeGg3cs0mbclh8Aa3ci0mba3cb9hceth8Aka8AaEfh3awydbh5cwh8AcwhEdnaocz4cFeGg8Ecs0mbclhEa8Eci0mba8Ecb9hcethEka3a5fh3dnaocFFFFb0mbclh8AaocFFF8F0mbaocFFFr0ceth8Akawa3aEfa8AfBdbawclfhwaXcefgXcw9hmbkaKhoaYhXaQczfgQai6mbkcbhocehwazhLinawaoaLydbarc;qofaocdtfydb6EhoaLclfhLawcefgwcw9hmbkcihCkcbh3arc;qlfcbcjdz:wjjjb8Aarc;alfcwfcbBdbar9cb83i;alaoclth8Fadhaaqhhakh5inarc;qlfadcba3cufgoaoa30Eal2falz:vjjjb8Aaiahaiah6Ehgdnaqaia39Ra3aqfai6EgYcsfc9WGgoaY9nmbarc;qofaYfcbaoaY9Rz:wjjjb8Akada3al2fh8Jcbh8Kina8Ka8FVcl4hQarc;alfa8Kcdtfh8LaAh8Mcbh8Nina8NaAfhwdndndndndndna8KPldebidkasa8Mc98GgLfhoa5aLfh8Aarc;qlfawc98GgLfRbbhXcwhwinaoRbbawtaXVhXaocefhoawcwfgwca9hmbkaYTmla8Ncith8Ea8JaLfhEcbhKinaERbbhLcwhoa8AhwinawRbbaotaLVhLawcefhwaocwfgoca9hmbkarc;qofaKfaLaX7aQ93a8E486bba8Aalfh8AaEalfhEaLhXaKcefgKaY9hmbxlkkaYTmia8Mc9:Ghoa8NcitcwGhEarc;qlfawceVfRbbcwtarc;qlfawc9:GfRbbVhLarc;qofhwaghXinawa5aofRbbcwtaaaofRbbVg8AaL9RgLcetaLcztcz91cs47cFFiGaE486bbaoalfhoawcefhwa8AhLa3aXcufgX9hmbxikkaYTmda8Jawfhoarc;qlfawfRbbhLarc;qofhwaghXinawaoRbbg8AaL9RgLcetaLcKtcK91cr4786bbawcefhwaoalfhoa8AhLa3aXcufgX9hmbxdkkaYTmeka8LydbhEcbhKarc;qofhoincdhLcbhwinaLaoawfRbbcb9hfhLawcefgwcz9hmbkclhXcbhwinaXaoawfRbbcd0fhXawcefgwcz9hmbkcwh8Acbhwina8AaoawfRbbcP0fh8Aawcefgwcz9hmbkaLaXaLaX6Egwa8Aawa8A6Egwczawcz6EaEfhEaoczfhoaKczfgKaY6mbka8LaEBdbka8Mcefh8Ma8Ncefg8Ncl9hmbka8Kcefg8KaC9hmbkaaamfhaahaxfhha5amfh5a3axfg3ai6mbkcbhocehwaPhLinawaoaLydbarc;alfaocdtfydb6EhoaLclfhLawcefgXhwaCaX9hmbkaraAcd4fa8FcdVaoaocdSE86bbaAclfgAal6mbkkabaefh8Kabcefhoalcd4gecbaDEhkadcefhOarc;abfceVhHcbhmdndninaiam9nmearc;qofcbcjdz:wjjjb8Aa8Kao9Rak6mdadamal2gwfhxcbh8JaOawfhzaocbakz:wjjjbghakfh5aqaiam9Ramaqfai6Egscsfgocl4cifcd4hCaoc9WGg8LThPindndndndndndndndndndnaDTmbara8Jcd4fRbbgLciGPlbedlbkasTmdaxa8Jfhoarc;abfa8JfRbbhLarc;qofhwashXinawaoRbbg8AaL9RgLcetaLcKtcK91cr4786bbawcefhwaoalfhoa8AhLaXcufgXmbxikkasTmia8JcitcwGhEarc;abfa8JceVfRbbcwtarc;abfa8Jc9:GgofRbbVhLaxaofhoarc;qofhwashXinawao8Vbbg8AaL9RgLcetaLcztcz91cs47cFFiGaE486bbawcefhwaoalfhoa8AhLaXcufgXmbxdkkaHa8Jc98GgEfhoazaEfh8Aarc;abfaEfRbbhXcwhwinaoRbbawtaXVhXaocefhoawcwfgwca9hmbkasTmbaLcl4hYa8JcitcKGh3axaEfhEcbhKinaERbbhLcwhoa8AhwinawRbbaotaLVhLawcefhwaocwfgoca9hmbkarc;qofaKfaLaX7aY93a3486bba8Aalfh8AaEalfhEaLhXaKcefgKas9hmbkkaDmbcbhoxlka8LTmbcbhodninarc;qofaofgwcwf8Pibaw8Pib:e9qTmeaoczfgoa8L9pmdxbkkdnavmbcehoxikcbhEaChKaChYinarc;qofaEfgocwf8Pibhyao8Pibh8PcdhLcbhwinaLaoawfRbbcb9hfhLawcefgwcz9hmbkclhXcbhwinaXaoawfRbbcd0fhXawcefgwcz9hmbkcwh8Acbhwina8AaoawfRbbcP0fh8Aawcefgwcz9hmbkaLaXaLaX6Egoa8Aaoa8A6Egoczaocz6EaYfhYaocucbaya8P:e9cb9sEgwaoaw6EaKfhKaEczfgEa8L9pmdxbkkaha8Jcd4fgoaoRbbcda8JcetcoGtV86bbxikdnaKas6mbaYas6mbaha8Jcd4fgoaoRbbcia8JcetcoGtV86bba8Ka59Ras6mra5arc;qofasz:vjjjbasfh5xikaKaY9phokaha8Jcd4fgwawRbbaoa8JcetcoGtV86bbka8Ka59RaC6mla5cbaCz:wjjjbgAaCfhYdndna8LmbaPhoxekdna8KaY9RcK9pmbaPhoxekaocdtc:q1jjbfcj1jjbaDEg5ydxggcetc;:FFFeGh8Fcuh3cuagtcu7cFeGhacbh8Marc;qofhLinarc;qofa8MfhQczhEdndndnagPDbeeeeeeedekcucbaQcwf8PibaQ8Pib:e9cb9sEhExekcbhoa8FhEinaEaaaLaofRbb9nfhEaocefgocz9hmbkkcih8Ecbh8Ainczhwdndndna5a8AcdtfydbgKPDbeeeeeeedekcucbaQcwf8PibaQ8Pib:e9cb9sEhwxekaKcetc;:FFFeGhwcuaKtcu7cFeGhXcbhoinawaXaLaofRbb9nfhwaocefgocz9hmbkkdndnawaE6mbaKa39hmeawaE9hmea5a8EcdtfydbcwSmeka8Ah8EawhEka8Acefg8Aci9hmbkaAa8Mco4fgoaoRbba8Ea8Mci4coGtV86bbdndndna5a8Ecdtfydbg3PDdbbbbbbbebkdncwa39Tg8ETmbcua3tcu7hwdndna3ceSmbcbh8NaLhQinaQhoa8Eh8AcbhXinaoRbbgEawcFeGgKaEaK6EaXa3tVhXaocefhoa8Acufg8AmbkaYaX86bbaQa8EfhQaYcefhYa8Na8Efg8Ncz6mbxdkkcbh8NaLhQinaQhoa8Eh8AcbhXinaoRbbgEawcFeGgKaEaK6EaXcetVhXaocefhoa8Acufg8AmbkaYaX:T9cFe:d9c:c:qj:bw9:9c:q;c1:I1e:d9c:b:c:e1z9:9ca188bbaQa8EfhQaYcefhYa8Na8Efg8Ncz6mbkkcbhoinaYaLaofRbbgX86bbaYaXawcFeG9pfhYaocefgocz9hmbxikkdna3ceSmbinaYcb86bbaYcefhYxbkkinaYcb86bbaYcefhYxbkkaYaQ8Pbb83bbaYcwfaQcwf8Pbb83bbaYczfhYka8Mczfg8Ma8L9pgomeaLczfhLa8KaY9RcK9pmbkkaoTmlaYh5aYTmlka8Jcefg8Jal9hmbkarc;abfaxascufal2falz:vjjjb8Aasamfhma5hoa5mbkcbhwxdkdna8Kao9RakalfgwcKcaaDEgLawaL0EgX9pmbcbhwxdkdnawaL9pmbaocbaXaw9Rgwz:wjjjbawfhokaoarc;adfalz:vjjjbalfhodnaDTmbaoaraez:vjjjbaefhokaoab9Rhwxekcbhwkarc;qwf8Kjjjjbawk5babaeadaialcdcbyd;C:kjjbz:bjjjbk9reduaecd4gdaefgicaaica0Eabcj;abae9Uc;WFbGcjdaeca0Egifcufai9Uae2aiadfaicl4cifcd4f2fcefkmbcbabBd;C:kjjbk:Ese5u8Jjjjjbc;ae9Rgl8Kjjjjbcbhvdnaici9UgocHfae0mbabcbyd;m:kjjbgrc;GeV86bbalc;abfcFecjez:wjjjb8AalcUfgw9cu83ibalc8WfgD9cu83ibalcyfgq9cu83ibalcafgk9cu83ibalcKfgx9cu83ibalczfgm9cu83ibal9cu83iwal9cu83ibabaefc9WfhPabcefgsaofhednaiTmbcmcsarcb9kgzEhHcbhOcbhAcbhCcbhXcbhQindnaeaP9nmbcbhvxikaQcufhvadaCcdtfgLydbhKaLcwfydbhYaLclfydbh8AcbhEdndndninalc;abfavcsGcitfgoydlh3dndndnaoydbgoaK9hmba3a8ASmekdnaoa8A9hmba3aY9hmbaEcefhExekaoaY9hmea3aK9hmeaEcdfhEkaEc870mdaXcufhvaLaEciGcx2goc;i1jjbfydbcdtfydbh3aLaoc;e1jjbfydbcdtfydbh8AaLaoc;a1jjbfydbcdtfydbhKcbhodnindnalavcsGcdtfydba39hmbaohYxdkcuhYavcufhvaocefgocz9hmbkkaOa3aOSgvaYce9iaYaH9oVgoGfhOdndndncbcsavEaYaoEgvcs9hmbarce9imba3a3aAa3cefaASgvEgAcefSmecmcsavEhvkasavaEcdtc;WeGV86bbavcs9hmea3aA9Rgvcetavc8F917hvinaeavcFb0crtavcFbGV86bbaecefheavcje6hoavcr4hvaoTmbka3hAxvkcPhvasaEcdtcPV86bba3hAkavTmiavaH9omicdhocehEaQhYxlkavcufhvaEclfgEc;ab9hmbkkdnaLceaYaOSceta8AaOSEcx2gvc;a1jjbfydbcdtfydbgKTaLavc;e1jjbfydbcdtfydbg8AceSGaLavc;i1jjbfydbcdtfydbg3cdSGaOcb9hGazGg5ce9hmbaw9cu83ibaD9cu83ibaq9cu83ibak9cu83ibax9cu83ibam9cu83ibal9cu83iwal9cu83ibcbhOkcbhEaXcufgvhodnindnalaocsGcdtfydba8A9hmbaEhYxdkcuhYaocufhoaEcefgEcz9hmbkkcbhodnindnalavcsGcdtfydba39hmbaohExdkcuhEavcufhvaocefgocz9hmbkkaOaKaOSg8EfhLdndnaYcm0mbaYcefhYxekcbcsa8AaLSgvEhYaLavfhLkdndnaEcm0mbaEcefhExekcbcsa3aLSgvEhEaLavfhLkc9:cua8EEh8FcbhvaEaYcltVgacFeGhodndndninavc:W1jjbfRbbaoSmeavcefgvcz9hmbxdkka5aKaO9havcm0VVmbasavc;WeV86bbxekasa8F86bbaeaa86bbaecefhekdna8EmbaKaA9Rgvcetavc8F917hvinaeavcFb0gocrtavcFbGV86bbavcr4hvaecefheaombkaKhAkdnaYcs9hmba8AaA9Rgvcetavc8F917hvinaeavcFb0gocrtavcFbGV86bbavcr4hvaecefheaombka8AhAkdnaEcs9hmba3aA9Rgvcetavc8F917hvinaeavcFb0gocrtavcFbGV86bbavcr4hvaecefheaombka3hAkalaXcdtfaKBdbaXcefcsGhvdndnaYPzbeeeeeeeeeeeeeebekalavcdtfa8ABdbaXcdfcsGhvkdndnaEPzbeeeeeeeeeeeeeebekalavcdtfa3BdbavcefcsGhvkcihoalc;abfaQcitfgEaKBdlaEa8ABdbaQcefcsGhYcdhEavhXaLhOxekcdhoalaXcdtfa3BdbcehEaXcefcsGhXaQhYkalc;abfaYcitfgva8ABdlava3Bdbalc;abfaQaEfcsGcitfgva3BdlavaKBdbascefhsaQaofcsGhQaCcifgCai6mbkkdnaeaP9nmbcbhvxekcbhvinaeavfavc:W1jjbfRbb86bbavcefgvcz9hmbkaeab9Ravfhvkalc;aef8KjjjjbavkZeeucbhddninadcefgdc8F0meceadtae6mbkkadcrfcFeGcr9Uci2cdfabci9U2cHfkmbcbabBd;m:kjjbk:Adewu8Jjjjjbcz9Rhlcbhvdnaicvfae0mbcbhvabcbRb;m:kjjbc;qeV86bbal9cb83iwabcefhoabaefc98fhrdnaiTmbcbhwcbhDindnaoar6mbcbskadaDcdtfydbgqalcwfawaqav9Rgvavc8F91gv7av9Rc507gwcdtfgkydb9Rgvc8E91c9:Gavcdt7awVhvinaoavcFb0gecrtavcFbGV86bbavcr4hvaocefhoaembkakaqBdbaqhvaDcefgDai9hmbkkdnaoar9nmbcbskaocbBbbaoab9RclfhvkavkBeeucbhddninadcefgdc8F0meceadtae6mbkkadcwfcFeGcr9Uab2cvfk:bvli99dui99ludnaeTmbcuadcetcuftcu7:Zhvdndncuaicuftcu7:ZgoJbbbZMgr:lJbbb9p9DTmbar:Ohwxekcjjjj94hwkcbhicbhDinalclfIdbgrJbbbbJbbjZalIdbgq:lar:lMalcwfIdbgk:lMgr:varJbbbb9BEgrNhxaqarNhrdndnakJbbbb9GTmbaxhqxekJbbjZar:l:tgqaq:maxJbbbb9GEhqJbbjZax:l:tgxax:marJbbbb9GEhrkdndnalcxfIdbgxJbbj:;axJbbj:;9GEgkJbbjZakJbbjZ9FEavNJbbbZJbbb:;axJbbbb9GEMgx:lJbbb9p9DTmbax:Ohmxekcjjjj94hmkdndnaqJbbj:;aqJbbj:;9GEgxJbbjZaxJbbjZ9FEaoNJbbbZJbbb:;aqJbbbb9GEMgq:lJbbb9p9DTmbaq:OhPxekcjjjj94hPkdndnarJbbj:;arJbbj:;9GEgqJbbjZaqJbbjZ9FEaoNJbbbZJbbb:;arJbbbb9GEMgr:lJbbb9p9DTmbar:Ohsxekcjjjj94hskdndnadcl9hmbabaifgzas86bbazcifam86bbazcdfaw86bbazcefaP86bbxekabaDfgzas87ebazcofam87ebazclfaw87ebazcdfaP87ebkalczfhlaiclfhiaDcwfhDaecufgembkkk;hlld99eud99eudnaeTmbdndncuaicuftcu7:ZgvJbbbZMgo:lJbbb9p9DTmbao:Ohixekcjjjj94hikaic;8FiGhrinabcofcicdalclfIdb:lalIdb:l9EgialcwfIdb:lalaicdtfIdb:l9EEgialcxfIdb:lalaicdtfIdb:l9EEgiarV87ebdndnJbbj:;JbbjZalaicdtfIdbJbbbb9DEgoalaicd7cdtfIdbJ;Zl:1ZNNgwJbbj:;awJbbj:;9GEgDJbbjZaDJbbjZ9FEavNJbbbZJbbb:;awJbbbb9GEMgw:lJbbb9p9DTmbaw:Ohqxekcjjjj94hqkabcdfaq87ebdndnalaicefciGcdtfIdbJ;Zl:1ZNaoNgwJbbj:;awJbbj:;9GEgDJbbjZaDJbbjZ9FEavNJbbbZJbbb:;awJbbbb9GEMgw:lJbbb9p9DTmbaw:Ohqxekcjjjj94hqkabaq87ebdndnaoalaicufciGcdtfIdbJ;Zl:1ZNNgoJbbj:;aoJbbj:;9GEgwJbbjZawJbbjZ9FEavNJbbbZJbbb:;aoJbbbb9GEMgo:lJbbb9p9DTmbao:Ohixekcjjjj94hikabclfai87ebabcwfhbalczfhlaecufgembkkk;3viDue99eu8Jjjjjbcjd9Rgo8Kjjjjbadcd4hrdndndndnavcd9hmbadcl6meaohwarhDinawc:CuBdbawclfhwaDcufgDmbkaeTmiadcl6mdarcdthqalhkcbhxinaohwakhDarhminawawydbgPcbaDIdbgs:8cL4cFeGc:cufasJbbbb9BEgzaPaz9kEBdbaDclfhDawclfhwamcufgmmbkakaqfhkaxcefgxaeSmixbkkaeTmdxekaeTmekarcdthkavce9hhqadcl6hdcbhxindndndnaqmbadmdc:CuhDalhwarhminaDcbawIdbgs:8cL4cFeGc:cufasJbbbb9BEgPaDaP9kEhDawclfhwamcufgmmbxdkkc:CuhDdndnavPleddbdkadmdaohwalhmarhPinawcbamIdbgs:8cL4cFeGgzc;:bazc;:b0Ec:cufasJbbbb9BEBdbamclfhmawclfhwaPcufgPmbxdkkadmecbhwarhminaoawfcbalawfIdbgs:8cL4cFeGgPc8AaPc8A0Ec:cufasJbbbb9BEBdbawclfhwamcufgmmbkkadmbcbhwarhPinaDhmdnavceSmbaoawfydbhmkdndnalawfIdbgscjjj;8iamai9RcefgmcLt9R::NJbbbZJbbb:;asJbbbb9GEMgs:lJbbb9p9DTmbas:Ohzxekcjjjj94hzkabawfazcFFFrGamcKtVBdbawclfhwaPcufgPmbkkabakfhbalakfhlaxcefgxae9hmbkkaocjdf8Kjjjjbk;YqdXui998Jjjjjbc:qd9Rgv8Kjjjjbavc:Sefcbc;Kbz:wjjjb8AcbhodnadTmbcbhoaiTmbdndnabaeSmbaehrxekavcuadcdtgwadcFFFFi0Ecbyd;u:kjjbHjjjjbbgrBd:SeavceBd:mdaraeawz:vjjjb8Akavc:GefcwfcbBdbav9cb83i:Geavc:Gefaradaiavc:Sefz:ojjjbavyd:GehDadci9Ugqcbyd;u:kjjbHjjjjbbheavc:Sefavyd:mdgkcdtfaeBdbavakcefgwBd:mdaecbaqz:wjjjbhxavc:SefawcdtfcuaicdtaicFFFFi0Ecbyd;u:kjjbHjjjjbbgmBdbavakcdfgPBd:mdalc;ebfhsaDheamhwinawalIdbasaeydbgzcwazcw6EcdtfIdbMUdbaeclfheawclfhwaicufgimbkavc:SefaPcdtfcuaqcdtadcFFFF970Ecbyd;u:kjjbHjjjjbbgPBdbdnadci6mbarheaPhwaqhiinawamaeydbcdtfIdbamaeclfydbcdtfIdbMamaecwfydbcdtfIdbMUdbaecxfheawclfhwaicufgimbkkakcifhoalc;ebfhHavc;qbfhOavheavyd:KehAavyd:OehCcbhzcbhwcbhXcehQinaehLcihkarawci2gKcdtfgeydbhsaeclfydbhdabaXcx2fgicwfaecwfydbgYBdbaiclfadBdbaiasBdbaxawfce86bbaOaYBdwaOadBdlaOasBdbaPawcdtfcbBdbdnazTmbcihkaLhiinaOakcdtfaiydbgeBdbakaeaY9haeas9haead9hGGfhkaiclfhiazcufgzmbkkaXcefhXcbhzinaCaAarazaKfcdtfydbcdtgifydbcdtfgYheaDaifgdydbgshidnasTmbdninaeydbawSmeaeclfheaicufgiTmdxbkkaeaYascdtfc98fydbBdbadadydbcufBdbkazcefgzci9hmbkdndnakTmbcuhwJbbbbh8Acbhdavyd:KehYavyd:OehKindndnaDaOadcdtfydbcdtgzfydbgembadcefhdxekadcs0hiamazfgsIdbhEasalcbadcefgdaiEcdtfIdbaHaecwaecw6EcdtfIdbMg3Udba3aE:th3aecdthiaKaYazfydbcdtfheinaPaeydbgzcdtfgsa3asIdbMgEUdbaEa8Aa8AaE9DgsEh8AazawasEhwaeclfheaic98fgimbkkadak9hmbkawcu9hmekaQaq9pmdindnaxaQfRbbmbaQhwxdkaqaQcefgQ9hmbxikkakczakcz6EhzaOheaLhOawcu9hmbkkaocdtavc:Seffc98fhedninaoTmeaeydbcbyd;q:kjjbH:bjjjbbaec98fheaocufhoxbkkavc:qdf8Kjjjjbk;IlevucuaicdtgvaicFFFFi0Egocbyd;u:kjjbHjjjjbbhralalyd9GgwcdtfarBdbalawcefBd9GabarBdbaocbyd;u:kjjbHjjjjbbhralalyd9GgocdtfarBdbalaocefBd9GabarBdlcuadcdtadcFFFFi0Ecbyd;u:kjjbHjjjjbbhralalyd9GgocdtfarBdbalaocefBd9GabarBdwabydbcbavz:wjjjb8Aadci9UhDdnadTmbabydbhoaehladhrinaoalydbcdtfgvavydbcefBdbalclfhlarcufgrmbkkdnaiTmbabydbhlabydlhrcbhvaihoinaravBdbarclfhralydbavfhvalclfhlaocufgombkkdnadci6mbabydlhrabydwhvcbhlinaecwfydbhoaeclfydbhdaraeydbcdtfgwawydbgwcefBdbavawcdtfalBdbaradcdtfgdadydbgdcefBdbavadcdtfalBdbaraocdtfgoaoydbgocefBdbavaocdtfalBdbaecxfheaDalcefgl9hmbkkdnaiTmbabydlheabydbhlinaeaeydbalydb9RBdbalclfhlaeclfheaicufgimbkkkQbabaeadaic;K1jjbz:njjjbkQbabaeadaic;m:jjjbz:njjjbk9DeeuabcFeaicdtz:wjjjbhlcbhbdnadTmbindnalaeydbcdtfgiydbcu9hmbaiabBdbabcefhbkaeclfheadcufgdmbkkabk:Vvioud9:du8Jjjjjbc;Wa9Rgl8Kjjjjbcbhvalcxfcbc;Kbz:wjjjb8AalcuadcitgoadcFFFFe0Ecbyd;u:kjjbHjjjjbbgrBdxalceBd2araeadaicez:tjjjbalcuaoadcjjjjoGEcbyd;u:kjjbHjjjjbbgwBdzadcdthednadTmbabhiinaiavBdbaiclfhiadavcefgv9hmbkkawaefhDalabBdwalawBdl9cbhqindnadTmbaq9cq9:hkarhvaDhiadheinaiav8Pibak1:NcFrG87ebavcwfhvaicdfhiaecufgembkkalclfaq:NceGcdtfydbhxalclfaq9ce98gq:NceGcdtfydbhmalc;Wbfcbcjaz:wjjjb8AaDhvadhidnadTmbinalc;Wbfav8VebcdtfgeaeydbcefBdbavcdfhvaicufgimbkkcbhvcbhiinalc;WbfavfgeydbhoaeaiBdbaoaifhiavclfgvcja9hmbkadhvdndnadTmbinalc;WbfaDamydbgicetf8VebcdtfgeaeydbgecefBdbaxaecdtfaiBdbamclfhmavcufgvmbkaq9cv9smdcbhvinabawydbcdtfavBdbawclfhwadavcefgv9hmbxdkkaq9cv9smekkclhvdninavc98Smealcxfavfydbcbyd;q:kjjbH:bjjjbbavc98fhvxbkkalc;Waf8Kjjjjbk:Jwliuo99iud9:cbhv8Jjjjjbca9Rgoczfcwfcbyd:8:kjjbBdbaocb8Pd:0:kjjb83izaocwfcbyd;i:kjjbBdbaocb8Pd;a:kjjb83ibaicd4hrdndnadmbJFFuFhwJFFuuhDJFFuuhqJFFuFhkJFFuuhxJFFuFhmxekarcdthPaehsincbhiinaoczfaifgzasaifIdbgwazIdbgDaDaw9EEUdbaoaifgzawazIdbgDaDaw9DEUdbaiclfgicx9hmbkasaPfhsavcefgvad9hmbkaoIdKhDaoIdwhwaoIdChqaoIdlhkaoIdzhxaoIdbhmkdnadTmbJbbbbJbFu9hJbbbbamax:tgmamJbbbb9DEgmakaq:tgkakam9DEgkawaD:tgwawak9DEgw:vawJbbbb9BEhwdnalmbarcdthoindndnaeclfIdbaq:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikai:S9cC:ghHdndnaeIdbax:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikaHai:S:ehHdndnaecwfIdbaD:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikabaHai:T9cy:g:e83ibaeaofheabcwfhbadcufgdmbxdkkarcdthoindndnaeIdbax:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikai:SgH9ca:gaH9cz:g9cjjj;4s:d:eaH9cFe:d:e9cF:bj;4:pj;ar:d9c:bd9:9c:p;G:d;4j:E;ar:d9cH9:9c;d;H:W:y:m:g;d;Hb:d9cv9:9c;j:KM;j:KM;j:Kd:dhOdndnaeclfIdbaq:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikai:SgH9ca:gaH9cz:g9cjjj;4s:d:eaH9cFe:d:e9cF:bj;4:pj;ar:d9c:bd9:9c:p;G:d;4j:E;ar:d9cH9:9c;d;H:W:y:m:g;d;Hb:d9cq9:9cM;j:KM;j:KM;jl:daO:ehOdndnaecwfIdbaD:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikabaOai:SgH9ca:gaH9cz:g9cjjj;4s:d:eaH9cFe:d:e9cF:bj;4:pj;ar:d9c:bd9:9c:p;G:d;4j:E;ar:d9cH9:9c;d;H:W:y:m:g;d;Hb:d9cC9:9c:KM;j:KM;j:KMD:d:e83ibaeaofheabcwfhbadcufgdmbkkk9teiucbcbyd;y:kjjbgeabcifc98GfgbBd;y:kjjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik;teeeudndnaeabVciGTmbabhixekdndnadcz9pmbabhixekabhiinaiaeydbBdbaiaeydlBdlaiaeydwBdwaiaeydxBdxaeczfheaiczfhiadc9Wfgdcs0mbkkadcl6mbinaiaeydbBdbaeclfheaiclfhiadc98fgdci0mbkkdnadTmbinaiaeRbb86bbaicefhiaecefheadcufgdmbkkabk:3eedudndnabciGTmbabhixekaecFeGc:b:c:ew2hldndnadcz9pmbabhixekabhiinaialBdxaialBdwaialBdlaialBdbaiczfhiadc9Wfgdcs0mbkkadcl6mbinaialBdbaiclfhiadc98fgdci0mbkkdnadTmbinaiae86bbaicefhiadcufgdmbkkabk9teiucbcbyd;y:kjjbgeabcrfc94GfgbBd;y:kjjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik9:eiuZbhedndncbyd;y:kjjbgdaecztgi9nmbcuheadai9RcFFifcz4nbcuSmekadhekcbabae9Rcifc98Gcbyd;y:kjjbfgdBd;y:kjjbdnadZbcztge9nmbadae9RcFFifcz4nb8Akkk;Qddbcjwk;mdbbbbdbbblbbbwbbbbbbbebbbdbbblbbbwbbbbbbbbbbbbbbbb4:h9w9N94:P:gW:j9O:ye9Pbbbbbbebbbdbbbebbbdbbbbbbbdbbbbbbbebbbbbbb:l29hZ;69:9kZ;N;76Z;rg97Z;z;o9xZ8J;B85Z;:;u9yZ;b;k9HZ:2;Z9DZ9e:l9mZ59A8KZ:r;T3Z:A:zYZ79OHZ;j4::8::Y:D9V8:bbbb9s:49:Z8R:hBZ9M9M;M8:L;z;o8:;8:PG89q;x:J878R:hQ8::M:B;e87bbbbbbjZbbjZbbjZ:E;V;N8::Y:DsZ9i;H;68:xd;R8:;h0838:;W:NoZbbbb:WV9O8:uf888:9i;H;68:9c9G;L89;n;m9m89;D8Ko8:bbbbf:8tZ9m836ZS:2AZL;zPZZ818EZ9e:lxZ;U98F8:819E;68:FFuuFFuuFFuuFFuFFFuFFFuFbc;mqkzebbbebbbdbbb9G:vbb",t=new Uint8Array([32,0,65,2,1,106,34,33,3,128,11,4,13,64,6,253,10,7,15,116,127,5,8,12,40,16,19,54,20,9,27,255,113,17,42,67,24,23,146,148,18,14,22,45,70,69,56,114,101,21,25,63,75,136,108,28,118,29,73,115]);if(typeof WebAssembly!="object")return{supported:!1};var a,s=WebAssembly.instantiate(r(e),{}).then(function(b){a=b.instance,a.exports.__wasm_call_ctors(),a.exports.meshopt_encodeVertexVersion(0),a.exports.meshopt_encodeIndexVersion(1)});function r(b){for(var h=new Uint8Array(b.length),d=0;d<b.length;++d){var x=b.charCodeAt(d);h[d]=x>96?x-97:x>64?x-39:x+4}for(var p=0,d=0;d<b.length;++d)h[p++]=h[d]<60?t[h[d]]:(h[d]-60)*64+h[++d];return h.buffer.slice(0,p)}function n(b){if(!b)throw new Error("Assertion failed")}function i(b){return new Uint8Array(b.buffer,b.byteOffset,b.byteLength)}function o(b,h,d,x){var p=a.exports.sbrk,m=p(h.length*4),y=p(d*4),v=new Uint8Array(a.exports.memory.buffer),E=i(h);v.set(E,m),x&&x(m,m,h.length,d);var S=b(y,m,h.length,d);v=new Uint8Array(a.exports.memory.buffer);var T=new Uint32Array(d);new Uint8Array(T.buffer).set(v.subarray(y,y+d*4)),E.set(v.subarray(m,m+h.length*4)),p(m-p(0));for(var A=0;A<h.length;++A)h[A]=T[h[A]];return[T,S]}function c(b,h,d,x){var p=a.exports.sbrk,m=p(d*4),y=p(d*x),v=new Uint8Array(a.exports.memory.buffer);v.set(i(h),y),b(m,y,d,x),v=new Uint8Array(a.exports.memory.buffer);var E=new Uint32Array(d);return new Uint8Array(E.buffer).set(v.subarray(m,m+d*4)),p(m-p(0)),E}function l(b,h,d,x,p){var m=a.exports.sbrk,y=m(h),v=m(x*p),E=new Uint8Array(a.exports.memory.buffer);E.set(i(d),v);var S=b(y,h,v,x,p),T=new Uint8Array(S);return T.set(E.subarray(y,y+S)),m(y-m(0)),T}function f(b){for(var h=0,d=0;d<b.length;++d){var x=b[d];h=h<x?x:h}return h}function u(b,h){if(n(h==2||h==4),h==4)return new Uint32Array(b.buffer,b.byteOffset,b.byteLength/4);var d=new Uint16Array(b.buffer,b.byteOffset,b.byteLength/2);return new Uint32Array(d)}function g(b,h,d,x,p,m,y){var v=a.exports.sbrk,E=v(d*x),S=v(d*m),T=new Uint8Array(a.exports.memory.buffer);T.set(i(h),S),b(E,d,x,p,S,y);var A=new Uint8Array(d*x);return A.set(T.subarray(E,E+d*x)),v(E-v(0)),A}return{ready:s,supported:!0,reorderMesh:function(b,h,d){var x=h?d?a.exports.meshopt_optimizeVertexCacheStrip:a.exports.meshopt_optimizeVertexCache:void 0;return o(a.exports.meshopt_optimizeVertexFetchRemap,b,f(b)+1,x)},reorderPoints:function(b,h){return n(b instanceof Float32Array),n(b.length%h==0),n(h>=3),c(a.exports.meshopt_spatialSortRemap,b,b.length/h,h*4)},encodeVertexBuffer:function(b,h,d){n(d>0&&d<=256),n(d%4==0);var x=a.exports.meshopt_encodeVertexBufferBound(h,d);return l(a.exports.meshopt_encodeVertexBuffer,x,b,h,d)},encodeIndexBuffer:function(b,h,d){n(d==2||d==4),n(h%3==0);var x=u(b,d),p=a.exports.meshopt_encodeIndexBufferBound(h,f(x)+1);return l(a.exports.meshopt_encodeIndexBuffer,p,x,h,4)},encodeIndexSequence:function(b,h,d){n(d==2||d==4);var x=u(b,d),p=a.exports.meshopt_encodeIndexSequenceBound(h,f(x)+1);return l(a.exports.meshopt_encodeIndexSequence,p,x,h,4)},encodeGltfBuffer:function(b,h,d,x){var p={ATTRIBUTES:this.encodeVertexBuffer,TRIANGLES:this.encodeIndexBuffer,INDICES:this.encodeIndexSequence};return n(p[x]),p[x](b,h,d)},encodeFilterOct:function(b,h,d,x){return n(d==4||d==8),n(x>=1&&x<=16),g(a.exports.meshopt_encodeFilterOct,b,h,d,x,16)},encodeFilterQuat:function(b,h,d,x){return n(d==8),n(x>=4&&x<=16),g(a.exports.meshopt_encodeFilterQuat,b,h,d,x,16)},encodeFilterExp:function(b,h,d,x,p){n(d>0&&d%4==0),n(x>=1&&x<=24);var m={Separate:0,SharedVector:1,SharedComponent:2,Clamped:3};return g(a.exports.meshopt_encodeFilterExp,b,h,d,x,d,p?m[p]:1)}}})();var fr=(function(){var e="b9H79Tebbbe8Fv9Gbb9Gvuuuuueu9Giuuub9Geueu9Giuuueuikqbeeedddillviebeoweuec:W:Odkr;leDo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bb8A9TW79O9V9Wt9F9KW9J9V9KW9wWVtW949c919M9MWVbeY9TW79O9V9Wt9F9KW9J9V9KW69U9KW949c919M9MWVbdE9TW79O9V9Wt9F9KW9J9V9KW69U9KW949tWG91W9U9JWbiL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9p9JtblK9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9r919HtbvL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWVT949Wbol79IV9Rbrq:S86qdbk;jYi5ud9:du8Jjjjjbcj;kb9Rgv8Kjjjjbc9:hodnalTmbcuhoaiRbbgrc;WeGc:Ge9hmbarcsGgwce0mbc9:hoalcufadcd4cbawEgDadfgrcKcaawEgqaraq0Egk6mbaicefhxcj;abad9Uc;WFbGcjdadca0EhmaialfgPar9Rgoadfhsavaoadz1jjjbgzceVhHcbhOdndninaeaO9nmeaPax9RaD6mdamaeaO9RaOamfgoae6EgAcsfglc9WGhCabaOad2fhXaAcethQaxaDfhiaOaeaoaeao6E9RhLalcl4cifcd4hKazcj;cbfaAfhYcbh8AazcjdfhEaHh3incbhodnawTmbaxa8Acd4fRbbhokaocFeGh5cbh8Eazcj;cbfhqinaih8Fdndndndna5a8Ecet4ciGgoc9:fPdebdkaPa8F9RaA6mrazcj;cbfa8EaA2fa8FaAz1jjjb8Aa8FaAfhixdkazcj;cbfa8EaA2fcbaAz:jjjjb8Aa8FhixekaPa8F9RaK6mva8FaKfhidnaCTmbaPai9RcK6mbaocdtc:q1jjbfcj1jjbawEhaczhrcbhlinargoc9Wfghaqfhrdndndndndndnaaa8Fahco4fRbbalcoG4ciGcdtfydbPDbedvivvvlvkar9cb83bbarcwf9cb83bbxlkarcbaiRbdai8Xbb9c:c:qj:bw9:9c:q;c1:I1e:d9c:b:c:e1z9:gg9cjjjjjz:dg8J9qE86bbaqaofgrcGfag9c8F1:NghcKtc8F91aicdfa8J9c8N1:Nfg8KRbbG86bbarcVfcba8KahcjeGcr4fghRbbag9cjjjjjl:dg8J9qE86bbarc7fcbaha8J9c8L1:NfghRbbag9cjjjjjd:dg8J9qE86bbarctfcbaha8J9c8K1:NfghRbbag9cjjjjje:dg8J9qE86bbarc91fcbaha8J9c8J1:NfghRbbag9cjjjj;ab:dg8J9qE86bbarc4fcbaha8J9cg1:NfghRbbag9cjjjja:dg8J9qE86bbarc93fcbaha8J9ch1:NfghRbbag9cjjjjz:dgg9qE86bbarc94fcbahag9ca1:NfghRbbai8Xbe9c:c:qj:bw9:9c:q;c1:I1e:d9c:b:c:e1z9:gg9cjjjjjz:dg8J9qE86bbarc95fag9c8F1:NgicKtc8F91aha8J9c8N1:NfghRbbG86bbarc96fcbahaicjeGcr4fgiRbbag9cjjjjjl:dg8J9qE86bbarc97fcbaia8J9c8L1:NfgiRbbag9cjjjjjd:dg8J9qE86bbarc98fcbaia8J9c8K1:NfgiRbbag9cjjjjje:dg8J9qE86bbarc99fcbaia8J9c8J1:NfgiRbbag9cjjjj;ab:dg8J9qE86bbarc9:fcbaia8J9cg1:NfgiRbbag9cjjjja:dg8J9qE86bbarcufcbaia8J9ch1:NfgiRbbag9cjjjjz:dgg9qE86bbaiag9ca1:NfhixikaraiRblaiRbbghco4g8Ka8KciSg8KE86bbaqaofgrcGfaiclfa8Kfg8KRbbahcl4ciGg8La8LciSg8LE86bbarcVfa8Ka8Lfg8KRbbahcd4ciGg8La8LciSg8LE86bbarc7fa8Ka8Lfg8KRbbahciGghahciSghE86bbarctfa8Kahfg8KRbbaiRbeghco4g8La8LciSg8LE86bbarc91fa8Ka8Lfg8KRbbahcl4ciGg8La8LciSg8LE86bbarc4fa8Ka8Lfg8KRbbahcd4ciGg8La8LciSg8LE86bbarc93fa8Ka8Lfg8KRbbahciGghahciSghE86bbarc94fa8Kahfg8KRbbaiRbdghco4g8La8LciSg8LE86bbarc95fa8Ka8Lfg8KRbbahcl4ciGg8La8LciSg8LE86bbarc96fa8Ka8Lfg8KRbbahcd4ciGg8La8LciSg8LE86bbarc97fa8Ka8Lfg8KRbbahciGghahciSghE86bbarc98fa8KahfghRbbaiRbigico4g8Ka8KciSg8KE86bbarc99faha8KfghRbbaicl4ciGg8Ka8KciSg8KE86bbarc9:faha8KfghRbbaicd4ciGg8Ka8KciSg8KE86bbarcufaha8KfgrRbbaiciGgiaiciSgiE86bbaraifhixdkaraiRbwaiRbbghcl4g8Ka8KcsSg8KE86bbaqaofgrcGfaicwfa8Kfg8KRbbahcsGghahcsSghE86bbarcVfa8KahfghRbbaiRbeg8Kcl4g8La8LcsSg8LE86bbarc7faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarctfaha8KfghRbbaiRbdg8Kcl4g8La8LcsSg8LE86bbarc91faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc4faha8KfghRbbaiRbig8Kcl4g8La8LcsSg8LE86bbarc93faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc94faha8KfghRbbaiRblg8Kcl4g8La8LcsSg8LE86bbarc95faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc96faha8KfghRbbaiRbvg8Kcl4g8La8LcsSg8LE86bbarc97faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc98faha8KfghRbbaiRbog8Kcl4g8La8LcsSg8LE86bbarc99faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc9:faha8KfghRbbaiRbrgicl4g8Ka8KcsSg8KE86bbarcufaha8KfgrRbbaicsGgiaicsSgiE86bbaraifhixekarai8Pbb83bbarcwfaicwf8Pbb83bbaiczfhikdnaoaC9pmbalcdfhlaoczfhraPai9RcL0mekkaoaC6moaimexokaCmva8FTmvkaqaAfhqa8Ecefg8Ecl9hmbkdndndndnawTmbasa8Acd4fRbbgociGPlbedrbkaATmdaza8Afh8Fazcj;cbfhhcbh8EaEhaina8FRbbhraahocbhlinaoahalfRbbgqce4cbaqceG9R7arfgr86bbaoadfhoaAalcefgl9hmbkaacefhaa8Fcefh8FahaAfhha8Ecefg8Ecl9hmbxikkaATmeaza8Afhaazcj;cbfhhcbhoceh8EaYh8FinaEaofhlaa8Vbbhrcbhoinala8FaofRbbcwtahaofRbbgqVc;:FiGce4cbaqceG9R7arfgr87bbaladfhlaLaocefgofmbka8FaQfh8FcdhoaacdfhaahaQfhha8EceGhlcbh8EalmbxdkkaATmbcbaocl49Rh8Eaza8AfRbbhqcwhoa3hlinalRbbaotaqVhqalcefhlaocwfgoca9hmbkcbhhaEh8FaYhainazcj;cbfahfRbbhrcwhoaahlinalRbbaotarVhralaAfhlaocwfgoca9hmbkara8E93aq7hqcbhoa8Fhlinalaqao486bbalcefhlaocwfgoca9hmbka8Fadfh8FaacefhaahcefghaA9hmbkkaEclfhEa3clfh3a8Aclfg8Aad6mbkaXazcjdfaAad2z1jjjb8AazazcjdfaAcufad2fadz1jjjb8AaAaOfhOaihxaimbkc9:hoxdkcbc99aPax9RakSEhoxekc9:hokavcj;kbf8Kjjjjbaok:XseHu8Jjjjjbc;ae9Rgv8Kjjjjbc9:hodnaeci9UgrcHfal0mbcuhoaiRbbgwc;WeGc;Ge9hmbawcsGgDce0mbavc;abfcFecjez:jjjjb8AavcUf9cu83ibavc8Wf9cu83ibavcyf9cu83ibavcaf9cu83ibavcKf9cu83ibavczf9cu83ibav9cu83iwav9cu83ibaialfc9WfhqaicefgwarfhldnaeTmbcmcsaDceSEhkcbhxcbhmcbhrcbhicbhoindnalaq9nmbc9:hoxikdndnawRbbgDc;Ve0mbavc;abfaoaDcu7gPcl4fcsGcitfgsydlhzasydbhHdndnaDcsGgsak9pmbavaiaPfcsGcdtfydbaxasEhDaxasTgOfhxxekdndnascsSmbcehOasc987asamffcefhDxekalcefhDal8SbbgscFeGhPdndnascu9mmbaDhlxekalcvfhlaPcFbGhPcrhsdninaD8SbbgOcFbGastaPVhPaOcu9kmeaDcefhDascrfgsc8J9hmbxdkkaDcefhlkcehOaPce4cbaPceG9R7amfhDkaDhmkavc;abfaocitfgsaDBdbasazBdlavaicdtfaDBdbavc;abfaocefcsGcitfgsaHBdbasaDBdlaocdfhoaOaifhidnadcd9hmbabarcetfgsaH87ebasclfaD87ebascdfaz87ebxdkabarcdtfgsaHBdbascwfaDBdbasclfazBdbxekdnaDcpe0mbaxcefgOavaiaqaDcsGfRbbgscl49RcsGcdtfydbascz6gPEhDavaias9RcsGcdtfydbaOaPfgzascsGgOEhsaOThOdndnadcd9hmbabarcetfgHax87ebaHclfas87ebaHcdfaD87ebxekabarcdtfgHaxBdbaHcwfasBdbaHclfaDBdbkavaicdtfaxBdbavc;abfaocitfgHaDBdbaHaxBdlavaicefgicsGcdtfaDBdbavc;abfaocefcsGcitfgHasBdbaHaDBdlavaiaPfgicsGcdtfasBdbavc;abfaocdfcsGcitfgDaxBdbaDasBdlaocifhoaiaOfhiazaOfhxxekaxcbalRbbgHEgAaDc;:eSgDfhzaHcsGhCaHcl4hXdndnaHcs0mbazcefhOxekazhOavaiaX9RcsGcdtfydbhzkdndnaCmbaOcefhxxekaOhxavaiaH9RcsGcdtfydbhOkdndnaDTmbalcefhDxekalcdfhDal8SbegPcFeGhsdnaPcu9kmbalcofhAascFbGhscrhldninaD8SbbgPcFbGaltasVhsaPcu9kmeaDcefhDalcrfglc8J9hmbkaAhDxekaDcefhDkasce4cbasceG9R7amfgmhAkdndnaXcsSmbaDhsxekaDcefhsaD8SbbglcFeGhPdnalcu9kmbaDcvfhzaPcFbGhPcrhldninas8SbbgDcFbGaltaPVhPaDcu9kmeascefhsalcrfglc8J9hmbkazhsxekascefhskaPce4cbaPceG9R7amfgmhzkdndnaCcsSmbashlxekascefhlas8SbbgDcFeGhPdnaDcu9kmbascvfhOaPcFbGhPcrhDdninal8SbbgscFbGaDtaPVhPascu9kmealcefhlaDcrfgDc8J9hmbkaOhlxekalcefhlkaPce4cbaPceG9R7amfgmhOkdndnadcd9hmbabarcetfgDaA87ebaDclfaO87ebaDcdfaz87ebxekabarcdtfgDaABdbaDcwfaOBdbaDclfazBdbkavc;abfaocitfgDazBdbaDaABdlavaicdtfaABdbavc;abfaocefcsGcitfgDaOBdbaDazBdlavaicefgicsGcdtfazBdbavc;abfaocdfcsGcitfgDaABdbaDaOBdlavaiaHcz6aXcsSVfgicsGcdtfaOBdbaiaCTaCcsSVfhiaocifhokawcefhwaocsGhoaicsGhiarcifgrae6mbkkcbc99alaqSEhokavc;aef8Kjjjjbaok:clevu8Jjjjjbcz9Rhvdnaecvfal9nmbc9:skdnaiRbbc;:eGc;qeSmbcuskav9cb83iwaicefhoaialfc98fhrdnaeTmbdnadcdSmbcbhwindnaoar6mbc9:skaocefhlao8SbbgicFeGhddndnaicu9mmbalhoxekaocvfhoadcFbGhdcrhidninal8SbbgDcFbGaitadVhdaDcu9kmealcefhlaicrfgic8J9hmbxdkkalcefhokabawcdtfadc8Etc8F91adcd47avcwfadceGcdtVglydbfgiBdbalaiBdbawcefgwae9hmbxdkkcbhwindnaoar6mbc9:skaocefhlao8SbbgicFeGhddndnaicu9mmbalhoxekaocvfhoadcFbGhdcrhidninal8SbbgDcFbGaitadVhdaDcu9kmealcefhlaicrfgic8J9hmbxdkkalcefhokabawcetfadc8Etc8F91adcd47avcwfadceGcdtVglydbfgi87ebalaiBdbawcefgwae9hmbkkcbc99aoarSEk:Lvoeue99dud99eud99dndnadcl9hmbaeTmeindndnabcdfgd8Sbb:Yab8Sbbgi:Ygl:l:tabcefgv8Sbbgo:Ygr:l:tgwJbb;:9cawawNJbbbbawawJbbbb9GgDEgq:mgkaqaicb9iEalMgwawNakaqaocb9iEarMgqaqNMM:r:vglNJbbbZJbbb:;aDEMgr:lJbbb9p9DTmbar:Ohixekcjjjj94hikadai86bbdndnaqalNJbbbZJbbb:;aqJbbbb9GEMgq:lJbbb9p9DTmbaq:Ohdxekcjjjj94hdkavad86bbdndnawalNJbbbZJbbb:;awJbbbb9GEMgw:lJbbb9p9DTmbaw:Ohdxekcjjjj94hdkabad86bbabclfhbaecufgembxdkkaeTmbindndnabclfgd8Ueb:Yab8Uebgi:Ygl:l:tabcdfgv8Uebgo:Ygr:l:tgwJb;:FSawawNJbbbbawawJbbbb9GgDEgq:mgkaqaicb9iEalMgwawNakaqaocb9iEarMgqaqNMM:r:vglNJbbbZJbbb:;aDEMgr:lJbbb9p9DTmbar:Ohixekcjjjj94hikadai87ebdndnaqalNJbbbZJbbb:;aqJbbbb9GEMgq:lJbbb9p9DTmbaq:Ohdxekcjjjj94hdkavad87ebdndnawalNJbbbZJbbb:;awJbbbb9GEMgw:lJbbb9p9DTmbaw:Ohdxekcjjjj94hdkabad87ebabcwfhbaecufgembkkk;oiliui99iue99dnaeTmbcbhiabhlindndnJ;Zl81Zalcof8UebgvciV:Y:vgoal8Ueb:YNgrJb;:FSNJbbbZJbbb:;arJbbbb9GEMgw:lJbbb9p9DTmbaw:OhDxekcjjjj94hDkalclf8Uebhqalcdf8UebhkabaiavcefciGfcetfaD87ebdndnaoak:YNgwJb;:FSNJbbbZJbbb:;awJbbbb9GEMgx:lJbbb9p9DTmbax:OhDxekcjjjj94hDkabaiavciGfgkcd7cetfaD87ebdndnaoaq:YNgoJb;:FSNJbbbZJbbb:;aoJbbbb9GEMgx:lJbbb9p9DTmbax:OhDxekcjjjj94hDkabaiavcufciGfcetfaD87ebdndnJbbjZararN:tawawN:taoaoN:tgrJbbbbarJbbbb9GE:rJb;:FSNJbbbZMgr:lJbbb9p9DTmbar:Ohvxekcjjjj94hvkabakcetfav87ebalcwfhlaiclfhiaecufgembkkk9mbdnadcd4ae2gdTmbinababydbgecwtcw91:Yaece91cjjj98Gcjjj;8if::NUdbabclfhbadcufgdmbkkk9teiucbcbyd:K1jjbgeabcifc98GfgbBd:K1jjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik;teeeudndnaeabVciGTmbabhixekdndnadcz9pmbabhixekabhiinaiaeydbBdbaiaeydlBdlaiaeydwBdwaiaeydxBdxaeczfheaiczfhiadc9Wfgdcs0mbkkadcl6mbinaiaeydbBdbaeclfheaiclfhiadc98fgdci0mbkkdnadTmbinaiaeRbb86bbaicefhiaecefheadcufgdmbkkabk:3eedudndnabciGTmbabhixekaecFeGc:b:c:ew2hldndnadcz9pmbabhixekabhiinaialBdxaialBdwaialBdlaialBdbaiczfhiadc9Wfgdcs0mbkkadcl6mbinaialBdbaiclfhiadc98fgdci0mbkkdnadTmbinaiae86bbaicefhiadcufgdmbkkabkk81dbcjwk8Kbbbbdbbblbbbwbbbbbbbebbbdbbblbbbwbbbbc:Kwkl8WNbb",t="b9H79TebbbeKl9Gbb9Gvuuuuueu9Giuuub9Geueuikqbbebeedddilve9Weeeviebeoweuec:q:6dkr;leDo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bb8A9TW79O9V9Wt9F9KW9J9V9KW9wWVtW949c919M9MWVbdY9TW79O9V9Wt9F9KW9J9V9KW69U9KW949c919M9MWVblE9TW79O9V9Wt9F9KW9J9V9KW69U9KW949tWG91W9U9JWbvL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9p9JtboK9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9r919HtbrL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWVT949Wbwl79IV9RbDq;G9Mqlbzik9:evu8Jjjjjbcz9Rhbcbheincbhdcbhiinabcwfadfaicjuaead4ceGglE86bbaialfhiadcefgdcw9hmbkaec:q:yjjbfai86bbaecitc:q1jjbfab8Piw83ibaecefgecjd9hmbkk:183lYud97dur978Jjjjjbcj;kb9Rgv8Kjjjjbc9:hodnalTmbcuhoaiRbbgrc;WeGc:Ge9hmbarcsGgwce0mbc9:hoalcufadcd4cbawEgDadfgrcKcaawEgqaraq0Egk6mbaicefhxavaialfgmar9Rgoad;8qbbcj;abad9Uc;WFbGcjdadca0EhPdndndnadTmbaoadfhscbhzinaeaz9nmdamax9RaD6miabazad2fhHaxaDfhOaPaeaz9RazaPfae6EgAcsfgocl4cifcd4hCavcj;cbfaoc9WGgXcetfhQavcj;cbfaXci2fhLavcj;cbfaXfhKcbhYaoc;ab6h8AincbhodnawTmbaxaYcd4fRbbhokaocFeGhEcbh3avcj;cbfh5indndndndnaEa3cet4ciGgoc9:fPdebdkamaO9RaX6mwavcj;cbfa3aX2faOaX;8qbbaOaAfhOxdkavcj;cbfa3aX2fcbaX;8kbxekamaO9RaC6moaoclVcbawEhraOaCfhocbhidna8Ambamao9Rc;Gb6mbcbhlina5alfhidndndndndndnaOalco4fRbbgqciGarfPDbedibledibkaipxbbbbbbbbbbbbbbbbpklbxlkaiaopbblaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLg8Ecdp:mea8EpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9og8Fpxiiiiiiiiiiiiiiiip8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaoclffahc:q:yjjbfRbbfhoxikaiaopbbwaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9og8Fpxssssssssssssssssp8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaocwffahc:q:yjjbfRbbfhoxdkaiaopbbbpklbaoczfhoxekaiaopbbdaoRbbgacitc:q1jjbfpbibaac:q:yjjbfRbbgapsaoRbeghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPpklbaaaocdffahc:q:yjjbfRbbfhokdndndndndndnaqcd4ciGarfPDbedibledibkaiczfpxbbbbbbbbbbbbbbbbpklbxlkaiczfaopbblaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLg8Ecdp:mea8EpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9og8Fpxiiiiiiiiiiiiiiiip8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaoclffahc:q:yjjbfRbbfhoxikaiczfaopbbwaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9og8Fpxssssssssssssssssp8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaocwffahc:q:yjjbfRbbfhoxdkaiczfaopbbbpklbaoczfhoxekaiczfaopbbdaoRbbgacitc:q1jjbfpbibaac:q:yjjbfRbbgapsaoRbeghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPpklbaaaocdffahc:q:yjjbfRbbfhokdndndndndndnaqcl4ciGarfPDbedibledibkaicafpxbbbbbbbbbbbbbbbbpklbxlkaicafaopbblaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLg8Ecdp:mea8EpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9og8Fpxiiiiiiiiiiiiiiiip8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaoclffahc:q:yjjbfRbbfhoxikaicafaopbbwaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9og8Fpxssssssssssssssssp8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaocwffahc:q:yjjbfRbbfhoxdkaicafaopbbbpklbaoczfhoxekaicafaopbbdaoRbbgacitc:q1jjbfpbibaac:q:yjjbfRbbgapsaoRbeghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPpklbaaaocdffahc:q:yjjbfRbbfhokdndndndndndnaqco4arfPDbedibledibkaic8Wfpxbbbbbbbbbbbbbbbbpklbxlkaic8Wfaopbblaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLg8Ecdp:mea8EpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9og8Fpxiiiiiiiiiiiiiiiip8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngicitc:q1jjbfpbibaic:q:yjjbfRbbgipsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Ngqcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaiaoclffaqc:q:yjjbfRbbfhoxikaic8Wfaopbbwaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9og8Fpxssssssssssssssssp8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngicitc:q1jjbfpbibaic:q:yjjbfRbbgipsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Ngqcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaiaocwffaqc:q:yjjbfRbbfhoxdkaic8Wfaopbbbpklbaoczfhoxekaic8WfaopbbdaoRbbgicitc:q1jjbfpbibaic:q:yjjbfRbbgipsaoRbegqcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPpklbaiaocdffaqc:q:yjjbfRbbfhokalc;abfhialcjefaX0meaihlamao9Rc;Fb0mbkkdnaiaX9pmbaici4hlinamao9RcK6mwa5aifhqdndndndndndnaOaico4fRbbalcoG4ciGarfPDbedibledibkaqpxbbbbbbbbbbbbbbbbpkbbxlkaqaopbblaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLg8Ecdp:mea8EpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9og8Fpxiiiiiiiiiiiiiiiip8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spkbbaaaoclffahc:q:yjjbfRbbfhoxikaqaopbbwaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9og8Fpxssssssssssssssssp8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spkbbaaaocwffahc:q:yjjbfRbbfhoxdkaqaopbbbpkbbaoczfhoxekaqaopbbdaoRbbgacitc:q1jjbfpbibaac:q:yjjbfRbbgapsaoRbeghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPpkbbaaaocdffahc:q:yjjbfRbbfhokalcdfhlaiczfgiaX6mbkkaohOaoTmoka5aXfh5a3cefg3cl9hmbkdndndndnawTmbasaYcd4fRbbglciGPlbedwbkaXTmdavcjdfaYfhlavaYfpbdbhgcbhoinalavcj;cbfaofpblbg8JaKaofpblbg8KpmbzeHdOiAlCvXoQrLg8LaQaofpblbg8MaLaofpblbg8NpmbzeHdOiAlCvXoQrLgypmbezHdiOAlvCXorQLg8Ecep9Ta8Epxeeeeeeeeeeeeeeeeg8Fp9op9Hp9rg8Eagp9Uggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp9Uggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp9Uggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp9Uggp9Abbbaladfglaga8LaypmwDKYqk8AExm35Ps8E8Fg8Ecep9Ta8Ea8Fp9op9Hp9rg8Ep9Uggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp9Uggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp9Uggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp9Uggp9Abbbaladfglaga8Ja8KpmwKDYq8AkEx3m5P8Es8Fg8Ja8Ma8NpmwKDYq8AkEx3m5P8Es8Fg8KpmbezHdiOAlvCXorQLg8Ecep9Ta8Ea8Fp9op9Hp9rg8Ep9Uggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp9Uggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp9Uggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp9Uggp9Abbbaladfglaga8Ja8KpmwDKYqk8AExm35Ps8E8Fg8Ecep9Ta8Ea8Fp9op9Hp9rg8Ep9Ug8Fp9Abbbaladfgla8Fa8Ea8Epmlvorlvorlvorlvorp9Ug8Fp9Abbbaladfgla8Fa8Ea8EpmwDqkwDqkwDqkwDqkp9Ug8Fp9Abbbaladfgla8Fa8Ea8EpmxmPsxmPsxmPsxmPsp9Uggp9AbbbaladfhlaoczfgoaX6mbxikkaXTmeavcjdfaYfhlavaYfpbdbhgcbhoinalavcj;cbfaofpblbg8JaKaofpblbg8KpmbzeHdOiAlCvXoQrLg8LaQaofpblbg8MaLaofpblbg8NpmbzeHdOiAlCvXoQrLgypmbezHdiOAlvCXorQLg8Ecep:nea8Epxebebebebebebebebg8Fp9op:bep9rg8Eagp:oeggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp:oeggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp:oeggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp:oeggp9Abbbaladfglaga8LaypmwDKYqk8AExm35Ps8E8Fg8Ecep:nea8Ea8Fp9op:bep9rg8Ep:oeggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp:oeggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp:oeggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp:oeggp9Abbbaladfglaga8Ja8KpmwKDYq8AkEx3m5P8Es8Fg8Ja8Ma8NpmwKDYq8AkEx3m5P8Es8Fg8KpmbezHdiOAlvCXorQLg8Ecep:nea8Ea8Fp9op:bep9rg8Ep:oeggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp:oeggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp:oeggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp:oeggp9Abbbaladfglaga8Ja8KpmwDKYqk8AExm35Ps8E8Fg8Ecep:nea8Ea8Fp9op:bep9rg8Ep:oeg8Fp9Abbbaladfgla8Fa8Ea8Epmlvorlvorlvorlvorp:oeg8Fp9Abbbaladfgla8Fa8Ea8EpmwDqkwDqkwDqkwDqkp:oeg8Fp9Abbbaladfgla8Fa8Ea8EpmxmPsxmPsxmPsxmPsp:oeggp9AbbbaladfhlaoczfgoaX6mbxdkkaXTmbcbhocbalcl4gl9Rc8FGhiavcjdfaYfhravaYfpbdbh8Finaravcj;cbfaofpblbggaKaofpblbg8JpmbzeHdOiAlCvXoQrLg8KaQaofpblbg8LaLaofpblbg8MpmbzeHdOiAlCvXoQrLg8NpmbezHdiOAlvCXorQLg8Eaip:Rea8Ealp:Sep9qg8Ea8Fp9rg8Fp9Abbbaradfgra8Fa8Ea8Epmlvorlvorlvorlvorp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmwDqkwDqkwDqkwDqkp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmxmPsxmPsxmPsxmPsp9rg8Fp9Abbbaradfgra8Fa8Ka8NpmwDKYqk8AExm35Ps8E8Fg8Eaip:Rea8Ealp:Sep9qg8Ep9rg8Fp9Abbbaradfgra8Fa8Ea8Epmlvorlvorlvorlvorp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmwDqkwDqkwDqkwDqkp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmxmPsxmPsxmPsxmPsp9rg8Fp9Abbbaradfgra8Faga8JpmwKDYq8AkEx3m5P8Es8Fgga8La8MpmwKDYq8AkEx3m5P8Es8Fg8JpmbezHdiOAlvCXorQLg8Eaip:Rea8Ealp:Sep9qg8Ep9rg8Fp9Abbbaradfgra8Fa8Ea8Epmlvorlvorlvorlvorp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmwDqkwDqkwDqkwDqkp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmxmPsxmPsxmPsxmPsp9rg8Fp9Abbbaradfgra8Faga8JpmwDKYqk8AExm35Ps8E8Fg8Eaip:Rea8Ealp:Sep9qg8Ep9rg8Fp9Abbbaradfgra8Fa8Ea8Epmlvorlvorlvorlvorp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmwDqkwDqkwDqkwDqkp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmxmPsxmPsxmPsxmPsp9rg8Fp9AbbbaradfhraoczfgoaX6mbkkaYclfgYad6mbkaHavcjdfaAad2;8qbbavavcjdfaAcufad2fad;8qbbaAazfhzc9:hoaOhxaOmbxlkkaeTmbaDalfhrcbhocuhlinaralaD9RglfaD6mdaPaeao9RaoaPfae6Eaofgoae6mbkaial9Rhxkcbc99amax9RakSEhoxekc9:hokavcj;kbf8Kjjjjbaokwbz:bjjjbk:TseHu8Jjjjjbc;ae9Rgv8Kjjjjbc9:hodnaeci9UgrcHfal0mbcuhoaiRbbgwc;WeGc;Ge9hmbawcsGgDce0mbavc;abfcFecje;8kbavcUf9cu83ibavc8Wf9cu83ibavcyf9cu83ibavcaf9cu83ibavcKf9cu83ibavczf9cu83ibav9cu83iwav9cu83ibaialfc9WfhqaicefgwarfhldnaeTmbcmcsaDceSEhkcbhxcbhmcbhrcbhicbhoindnalaq9nmbc9:hoxikdndnawRbbgDc;Ve0mbavc;abfaoaDcu7gPcl4fcsGcitfgsydlhzasydbhHdndnaDcsGgsak9pmbavaiaPfcsGcdtfydbaxasEhDaxasTgOfhxxekdndnascsSmbcehOasc987asamffcefhDxekalcefhDal8SbbgscFeGhPdndnascu9mmbaDhlxekalcvfhlaPcFbGhPcrhsdninaD8SbbgOcFbGastaPVhPaOcu9kmeaDcefhDascrfgsc8J9hmbxdkkaDcefhlkcehOaPce4cbaPceG9R7amfhDkaDhmkavc;abfaocitfgsaDBdbasazBdlavaicdtfaDBdbavc;abfaocefcsGcitfgsaHBdbasaDBdlaocdfhoaOaifhidnadcd9hmbabarcetfgsaH87ebasclfaD87ebascdfaz87ebxdkabarcdtfgsaHBdbascwfaDBdbasclfazBdbxekdnaDcpe0mbaxcefgOavaiaqaDcsGfRbbgscl49RcsGcdtfydbascz6gPEhDavaias9RcsGcdtfydbaOaPfgzascsGgOEhsaOThOdndnadcd9hmbabarcetfgHax87ebaHclfas87ebaHcdfaD87ebxekabarcdtfgHaxBdbaHcwfasBdbaHclfaDBdbkavaicdtfaxBdbavc;abfaocitfgHaDBdbaHaxBdlavaicefgicsGcdtfaDBdbavc;abfaocefcsGcitfgHasBdbaHaDBdlavaiaPfgicsGcdtfasBdbavc;abfaocdfcsGcitfgDaxBdbaDasBdlaocifhoaiaOfhiazaOfhxxekaxcbalRbbgHEgAaDc;:eSgDfhzaHcsGhCaHcl4hXdndnaHcs0mbazcefhOxekazhOavaiaX9RcsGcdtfydbhzkdndnaCmbaOcefhxxekaOhxavaiaH9RcsGcdtfydbhOkdndnaDTmbalcefhDxekalcdfhDal8SbegPcFeGhsdnaPcu9kmbalcofhAascFbGhscrhldninaD8SbbgPcFbGaltasVhsaPcu9kmeaDcefhDalcrfglc8J9hmbkaAhDxekaDcefhDkasce4cbasceG9R7amfgmhAkdndnaXcsSmbaDhsxekaDcefhsaD8SbbglcFeGhPdnalcu9kmbaDcvfhzaPcFbGhPcrhldninas8SbbgDcFbGaltaPVhPaDcu9kmeascefhsalcrfglc8J9hmbkazhsxekascefhskaPce4cbaPceG9R7amfgmhzkdndnaCcsSmbashlxekascefhlas8SbbgDcFeGhPdnaDcu9kmbascvfhOaPcFbGhPcrhDdninal8SbbgscFbGaDtaPVhPascu9kmealcefhlaDcrfgDc8J9hmbkaOhlxekalcefhlkaPce4cbaPceG9R7amfgmhOkdndnadcd9hmbabarcetfgDaA87ebaDclfaO87ebaDcdfaz87ebxekabarcdtfgDaABdbaDcwfaOBdbaDclfazBdbkavc;abfaocitfgDazBdbaDaABdlavaicdtfaABdbavc;abfaocefcsGcitfgDaOBdbaDazBdlavaicefgicsGcdtfazBdbavc;abfaocdfcsGcitfgDaABdbaDaOBdlavaiaHcz6aXcsSVfgicsGcdtfaOBdbaiaCTaCcsSVfhiaocifhokawcefhwaocsGhoaicsGhiarcifgrae6mbkkcbc99alaqSEhokavc;aef8Kjjjjbaok:clevu8Jjjjjbcz9Rhvdnaecvfal9nmbc9:skdnaiRbbc;:eGc;qeSmbcuskav9cb83iwaicefhoaialfc98fhrdnaeTmbdnadcdSmbcbhwindnaoar6mbc9:skaocefhlao8SbbgicFeGhddndnaicu9mmbalhoxekaocvfhoadcFbGhdcrhidninal8SbbgDcFbGaitadVhdaDcu9kmealcefhlaicrfgic8J9hmbxdkkalcefhokabawcdtfadc8Etc8F91adcd47avcwfadceGcdtVglydbfgiBdbalaiBdbawcefgwae9hmbxdkkcbhwindnaoar6mbc9:skaocefhlao8SbbgicFeGhddndnaicu9mmbalhoxekaocvfhoadcFbGhdcrhidninal8SbbgDcFbGaitadVhdaDcu9kmealcefhlaicrfgic8J9hmbxdkkalcefhokabawcetfadc8Etc8F91adcd47avcwfadceGcdtVglydbfgi87ebalaiBdbawcefgwae9hmbkkcbc99aoarSEk:SPliuo97eue978Jjjjjbca9Rhiaec98Ghldndnadcl9hmbdnalTmbcbhvabhdinadadpbbbgocKp:RecKp:Sep;6egraocwp:RecKp:Sep;6earp;Geaoczp:RecKp:Sep;6egwp;Gep;Kep;LegDpxbbbbbbbbbbbbbbbbp:2egqarpxbbbjbbbjbbbjbbbjgkp9op9rp;Kegrpxbb;:9cbb;:9cbb;:9cbb;:9cararp;MeaDaDp;Meawaqawakp9op9rp;Kegrarp;Mep;Kep;Kep;Jep;Negwp;Mepxbbn0bbn0bbn0bbn0gqp;KepxFbbbFbbbFbbbFbbbp9oaopxbbbFbbbFbbbFbbbFp9op9qarawp;Meaqp;Kecwp:RepxbFbbbFbbbFbbbFbbp9op9qaDawp;Meaqp;Keczp:RepxbbFbbbFbbbFbbbFbp9op9qpkbbadczfhdavclfgval6mbkkalaeSmeaipxbbbbbbbbbbbbbbbbgqpklbaiabalcdtfgdaeciGglcdtgv;8qbbdnalTmbaiaipblbgocKp:RecKp:Sep;6egraocwp:RecKp:Sep;6earp;Geaoczp:RecKp:Sep;6egwp;Gep;Kep;LegDaqp:2egqarpxbbbjbbbjbbbjbbbjgkp9op9rp;Kegrpxbb;:9cbb;:9cbb;:9cbb;:9cararp;MeaDaDp;Meawaqawakp9op9rp;Kegrarp;Mep;Kep;Kep;Jep;Negwp;Mepxbbn0bbn0bbn0bbn0gqp;KepxFbbbFbbbFbbbFbbbp9oaopxbbbFbbbFbbbFbbbFp9op9qarawp;Meaqp;Kecwp:RepxbFbbbFbbbFbbbFbbp9op9qaDawp;Meaqp;Keczp:RepxbbFbbbFbbbFbbbFbp9op9qpklbkadaiav;8qbbskdnalTmbcbhvabhdinadczfgxaxpbbbgopxbbbbbbFFbbbbbbFFgkp9oadpbbbgDaopmbediwDqkzHOAKY8AEgwczp:Reczp:Sep;6egraDaopmlvorxmPsCXQL358E8FpxFubbFubbFubbFubbp9op;7eawczp:Sep;6egwp;Gearp;Gep;Kep;Legopxbbbbbbbbbbbbbbbbp:2egqarpxbbbjbbbjbbbjbbbjgmp9op9rp;Kegrpxb;:FSb;:FSb;:FSb;:FSararp;Meaoaop;Meawaqawamp9op9rp;Kegrarp;Mep;Kep;Kep;Jep;Negwp;Mepxbbn0bbn0bbn0bbn0gqp;KepxFFbbFFbbFFbbFFbbp9oaoawp;Meaqp;Keczp:Rep9qgoarawp;Meaqp;KepxFFbbFFbbFFbbFFbbp9ogrpmwDKYqk8AExm35Ps8E8Fp9qpkbbadaDakp9oaoarpmbezHdiOAlvCXorQLp9qpkbbadcafhdavclfgval6mbkkalaeSmbaiczfpxbbbbbbbbbbbbbbbbgopklbaiaopklbaiabalcitfgdaeciGglcitgv;8qbbdnalTmbaiaipblzgopxbbbbbbFFbbbbbbFFgkp9oaipblbgDaopmbediwDqkzHOAKY8AEgwczp:Reczp:Sep;6egraDaopmlvorxmPsCXQL358E8FpxFubbFubbFubbFubbp9op;7eawczp:Sep;6egwp;Gearp;Gep;Kep;Legopxbbbbbbbbbbbbbbbbp:2egqarpxbbbjbbbjbbbjbbbjgmp9op9rp;Kegrpxb;:FSb;:FSb;:FSb;:FSararp;Meaoaop;Meawaqawamp9op9rp;Kegrarp;Mep;Kep;Kep;Jep;Negwp;Mepxbbn0bbn0bbn0bbn0gqp;KepxFFbbFFbbFFbbFFbbp9oaoawp;Meaqp;Keczp:Rep9qgoarawp;Meaqp;KepxFFbbFFbbFFbbFFbbp9ogrpmwDKYqk8AExm35Ps8E8Fp9qpklzaiaDakp9oaoarpmbezHdiOAlvCXorQLp9qpklbkadaiav;8qbbkk:oDllue97euv978Jjjjjbc8W9Rhidnaec98GglTmbcbhvabhoinaiaopbbbgraoczfgwpbbbgDpmlvorxmPsCXQL358E8Fgqczp:Segkclp:RepklbaopxbbjZbbjZbbjZbbjZpx;Zl81Z;Zl81Z;Zl81Z;Zl81Zakpxibbbibbbibbbibbbp9qp;6ep;NegkaraDpmbediwDqkzHOAKY8AEgrczp:Reczp:Sep;6ep;MegDaDp;Meakarczp:Sep;6ep;Megxaxp;Meakaqczp:Reczp:Sep;6ep;Megqaqp;Mep;Kep;Kep;Lepxbbbbbbbbbbbbbbbbp:4ep;Jepxb;:FSb;:FSb;:FSb;:FSgkp;Mepxbbn0bbn0bbn0bbn0grp;KepxFFbbFFbbFFbbFFbbgmp9oaxakp;Mearp;Keczp:Rep9qgxaDakp;Mearp;Keamp9oaqakp;Mearp;Keczp:Rep9qgkpmbezHdiOAlvCXorQLgrp5baipblbpEb:T:j83ibaocwfarp5eaipblbpEe:T:j83ibawaxakpmwDKYqk8AExm35Ps8E8Fgkp5baipblbpEd:T:j83ibaocKfakp5eaipblbpEi:T:j83ibaocafhoavclfgval6mbkkdnalaeSmbaiczfpxbbbbbbbbbbbbbbbbgkpklbaiakpklbaiabalcitfgoaeciGgvcitgw;8qbbdnavTmbaiaipblbgraipblzgDpmlvorxmPsCXQL358E8Fgqczp:Segkclp:RepklaaipxbbjZbbjZbbjZbbjZpx;Zl81Z;Zl81Z;Zl81Z;Zl81Zakpxibbbibbbibbbibbbp9qp;6ep;NegkaraDpmbediwDqkzHOAKY8AEgrczp:Reczp:Sep;6ep;MegDaDp;Meakarczp:Sep;6ep;Megxaxp;Meakaqczp:Reczp:Sep;6ep;Megqaqp;Mep;Kep;Kep;Lepxbbbbbbbbbbbbbbbbp:4ep;Jepxb;:FSb;:FSb;:FSb;:FSgkp;Mepxbbn0bbn0bbn0bbn0grp;KepxFFbbFFbbFFbbFFbbgmp9oaxakp;Mearp;Keczp:Rep9qgxaDakp;Mearp;Keamp9oaqakp;Mearp;Keczp:Rep9qgkpmbezHdiOAlvCXorQLgrp5baipblapEb:T:j83ibaiarp5eaipblapEe:T:j83iwaiaxakpmwDKYqk8AExm35Ps8E8Fgkp5baipblapEd:T:j83izaiakp5eaipblapEi:T:j83iKkaoaiaw;8qbbkk;uddiue978Jjjjjbc;ab9Rhidnadcd4ae2glc98GgvTmbcbheabhdinadadpbbbgocwp:Recwp:Sep;6eaocep:SepxbbjFbbjFbbjFbbjFp9opxbbjZbbjZbbjZbbjZp:Uep;Mepkbbadczfhdaeclfgeav6mbkkdnavalSmbaic8WfpxbbbbbbbbbbbbbbbbgopklbaicafaopklbaiczfaopklbaiaopklbaiabavcdtfgdalciGgecdtgv;8qbbdnaeTmbaiaipblbgocwp:Recwp:Sep;6eaocep:SepxbbjFbbjFbbjFbbjFp9opxbbjZbbjZbbjZbbjZp:Uep;Mepklbkadaiav;8qbbkk9teiucbcbydj1jjbgeabcifc98GfgbBdj1jjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaikkkebcjwklz:Dbb",a=new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,3,2,0,0,5,3,1,0,1,12,1,0,10,22,2,12,0,65,0,65,0,65,0,252,10,0,0,11,7,0,65,0,253,15,26,11]),s=new Uint8Array([32,0,65,2,1,106,34,33,3,128,11,4,13,64,6,253,10,7,15,116,127,5,8,12,40,16,19,54,20,9,27,255,113,17,42,67,24,23,146,148,18,14,22,45,70,69,56,114,101,21,25,63,75,136,108,28,118,29,73,115]);if(typeof WebAssembly!="object")return{supported:!1};var r=WebAssembly.validate(a)?o(t):o(e),n,i=WebAssembly.instantiate(r,{}).then(function(p){n=p.instance,n.exports.__wasm_call_ctors()});function o(p){for(var m=new Uint8Array(p.length),y=0;y<p.length;++y){var v=p.charCodeAt(y);m[y]=v>96?v-97:v>64?v-39:v+4}for(var E=0,y=0;y<p.length;++y)m[E++]=m[y]<60?s[m[y]]:(m[y]-60)*64+m[++y];return m.buffer.slice(0,E)}function c(p,m,y,v,E,S,T){var A=p.exports.sbrk,_=v+3&-4,R=A(_*E),C=A(S.length),F=new Uint8Array(p.exports.memory.buffer);F.set(S,C);var O=m(R,v,E,C,S.length);if(O==0&&T&&T(R,_,E),y.set(F.subarray(R,R+v*E)),A(R-A(0)),O!=0)throw new Error("Malformed buffer data: "+O)}var l={NONE:"",OCTAHEDRAL:"meshopt_decodeFilterOct",QUATERNION:"meshopt_decodeFilterQuat",EXPONENTIAL:"meshopt_decodeFilterExp"},f={ATTRIBUTES:"meshopt_decodeVertexBuffer",TRIANGLES:"meshopt_decodeIndexBuffer",INDICES:"meshopt_decodeIndexSequence"},u=[],g=0;function b(p){var m={object:new Worker(p),pending:0,requests:{}};return m.object.onmessage=function(y){var v=y.data;m.pending-=v.count,m.requests[v.id][v.action](v.value),delete m.requests[v.id]},m}function h(p){for(var m="self.ready = WebAssembly.instantiate(new Uint8Array(["+new Uint8Array(r)+"]), {}).then(function(result) { result.instance.exports.__wasm_call_ctors(); return result.instance; });self.onmessage = "+x.name+";"+c.toString()+x.toString(),y=new Blob([m],{type:"text/javascript"}),v=URL.createObjectURL(y),E=u.length;E<p;++E)u[E]=b(v);for(var E=p;E<u.length;++E)u[E].object.postMessage({});u.length=p,URL.revokeObjectURL(v)}function d(p,m,y,v,E){for(var S=u[0],T=1;T<u.length;++T)u[T].pending<S.pending&&(S=u[T]);return new Promise(function(A,_){var R=new Uint8Array(y),C=++g;S.pending+=p,S.requests[C]={resolve:A,reject:_},S.object.postMessage({id:C,count:p,size:m,source:R,mode:v,filter:E},[R.buffer])})}function x(p){var m=p.data;if(!m.id)return self.close();self.ready.then(function(y){try{var v=new Uint8Array(m.count*m.size);c(y,y.exports[m.mode],v,m.count,m.size,m.source,y.exports[m.filter]),self.postMessage({id:m.id,count:m.count,action:"resolve",value:v},[v.buffer])}catch(E){self.postMessage({id:m.id,count:m.count,action:"reject",value:E})}})}return{ready:i,supported:!0,useWorkers:function(p){h(p)},decodeVertexBuffer:function(p,m,y,v,E){c(n,n.exports.meshopt_decodeVertexBuffer,p,m,y,v,n.exports[l[E]])},decodeIndexBuffer:function(p,m,y,v){c(n,n.exports.meshopt_decodeIndexBuffer,p,m,y,v)},decodeIndexSequence:function(p,m,y,v){c(n,n.exports.meshopt_decodeIndexSequence,p,m,y,v)},decodeGltfBuffer:function(p,m,y,v,E,S){c(n,n.exports[f[E]],p,m,y,v,n.exports[l[S]])},decodeGltfBufferAsync:function(p,m,y,v,E){return u.length>0?d(p,m,y,f[v],l[E]):i.then(function(){var S=new Uint8Array(p*m);return c(n,n.exports[f[v]],S,p,m,y,n.exports[l[E]]),S})}}})();var GE=(function(){var e="b9H79Tebbbetm9Geueu9Geub9Gbb9Gsuuuuuuuuuuuu99uueu9Gvuuuuub9Gruuuuuuub9Gvuuuuue999Gvuuuuueu9Gquuuuuuu99uueu9Gwuuuuuu99ueu9Giuuue999Gluuuueu9GiuuueuiOHdilvorlwiDqkbxxbelve9Weiiviebeoweuec:G:Pdkr:Tewo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bbz9TW79O9V9Wt9F79P9T9W29P9M95br8E9TW79O9V9Wt9F79P9T9W29P9M959x9Pt9OcttV9P9I91tW7bwQ9TW79O9V9Wt9F79P9T9W29P9M959q9V9P9Ut7bDX9TW79O9V9Wt9F79P9T9W29P9M959t9J9H2Wbqa9TW79O9V9Wt9F9V9Wt9P9T9P96W9wWVtW94SWt9J9O9sW9T9H9Wbkl79IV9RbxDwebcekdzsq;B:xeHdbkM9Hi8Au8A99Au8Jjjjjbc;W;qb9Rgs8Kjjjjbcbhzascxfcbc;Kbz:ojjjb8AdnabaeSmbabaeadcdtz:njjjb8AkdndnamcdGmbascxfhHcbhOxekasalcrfci4gecbyd:m:jjjbHjjjjbbgABdxasceBd2aAcbaez:ojjjbhCcbhlcbhednadTmbcbhlabheadhAinaCaeydbgXci4fgQaQRbbgQceaXcrGgXtV86bbaQcu7aX4ceGalfhlaeclfheaAcufgAmbkcualcdtalcFFFFi0EhekascCfhHasaecbyd:m:jjjbHjjjjbbgOBdzascdBd2alcd4alfhXcehAinaAgecethAaeaX6mbkcdhzcbhLascuaecdtgAaecFFFFi0Ecbyd:m:jjjbHjjjjbbgXBdCasciBd2aXcFeaAz:ojjjbhKdnadTmbaecufhYcbh8AindndnaKabaLcdtfgEydbgQc:v;t;h;Ev2aYGgXcdtfgCydbgAcuSmbceheinaOaAcdtfydbaQSmdaXaefhAaecefheaKaAaYGgXcdtfgCydbgAcu9hmbkkaOa8AcdtfaQBdbaCa8ABdba8AhAa8Acefh8AkaEaABdbaLcefgLad9hmbkkaKcbyd1:jjjbH:bjjjbbascdBd2kcbh3aHcualcefgecdtaecFFFFi0Ecbyd:m:jjjbHjjjjbbg5Bdbasa5BdlasazceVgeBd2ascxfaecdtfcuadcitadcFFFFe0Ecbyd:m:jjjbHjjjjbbg8EBdbasa8EBdwasazcdfgeBd2asclfabadalcbz:cjjjbascxfaecdtfcualcdtgealcFFFFi0Eg8Fcbyd:m:jjjbHjjjjbbgABdbasazcifgXBd2ascxfaXcdtfa8Fcbyd:m:jjjbHjjjjbbgaBdbasazclVBd2aAaaaialavaOascxfz:djjjbalcbyd:m:jjjbHjjjjbbhCascxfasyd2ghcdtfaCBdbasahcefgXBd2ascxfaXcdtfa8Fcbyd:m:jjjbHjjjjbbgXBdbasahcdfgQBd2ascxfaQcdtfa8Fcbyd:m:jjjbHjjjjbbgQBdbasahcifggBd2aXcFeaez:ojjjbh8JaQcFeaez:ojjjbh8KdnalTmba8Ecwfh8Lindna5a3gQcefg3cdtfydbgKa5aQcdtgefydbgXSmbaKaX9Rhza8EaXcitfhHa8Kaefh8Ma8JaefhEcbhYindndnaHaYcitfydbg8AaQ9hmbaEaQBdba8MaQBdbxekdna5a8Acdtg8NfgeclfydbgXaeydbgeSmba8EaecitgKfydbaQSmeaXae9Rhyaecu7aXfhLa8LaKfhXcbheinaLaeSmeaecefheaXydbhKaXcwfhXaKaQ9hmbkaeay6meka8Ka8NfgeaQa8AaeydbcuSEBdbaEa8AaQaEydbcuSEBdbkaYcefgYaz9hmbkka3al9hmbkaAhXaahQa8KhKa8JhYcbheindndnaeaXydbg8A9hmbdnaeaQydbg8A9hmbaYydbh8AdnaKydbgLcu9hmba8Acu9hmbaCaefcb86bbxikaCaefhEdnaeaLSmbaea8ASmbaEce86bbxikaEcl86bbxdkdnaeaaa8AcdtgLfydb9hmbdnaKydbgEcuSmbaeaESmbaYydbgzcuSmbaeazSmba8KaLfydbgHcuSmbaHa8ASmba8JaLfydbgLcuSmbaLa8ASmbdnaAaEcdtfydbg8AaAaLcdtfydb9hmba8AaAazcdtfydbgLSmbaLaAaHcdtfydb9hmbaCaefcd86bbxlkaCaefcl86bbxikaCaefcl86bbxdkaCaefcl86bbxekaCaefaCa8AfRbb86bbkaXclfhXaQclfhQaKclfhKaYclfhYalaecefge9hmbkdnaqTmbdndnaOTmbaOheaAhXalhQindnaqaeydbfRbbTmbaCaXydbfcl86bbkaeclfheaXclfhXaQcufgQmbxdkkaAhealhXindnaqRbbTmbaCaeydbfcl86bbkaqcefhqaeclfheaXcufgXmbkkaAhealhQaChXindnaCaeydbfRbbcl9hmbaXcl86bbkaeclfheaXcefhXaQcufgQmbkkamceGTmbaChealhXindnaeRbbce9hmbaecl86bbkaecefheaXcufgXmbkkascxfagcdtfcualcx2alc;v:Q;v:Qe0Ecbyd:m:jjjbHjjjjbbg3BdbasahclfgHBd2a3aialavaOz:ejjjbh8PdndnaDmbcbhgcbh8Lxekcbh8LawhecbhXindnaeIdbJbbbb9ETmbasc;Wbfa8LcdtfaXBdba8Lcefh8LkaeclfheaDaXcefgX9hmbkascxfaHcdtfcua8Lal2gecdtaecFFFFi0Ecbyd:m:jjjbHjjjjbbggBdbasahcvfgHBd2alTmba8LTmbarcd4hEdnaOTmba8Lcdthzcbh8AaghLinaoaOa8AcdtfydbaE2cdtfhYasc;WbfheaLhXa8LhQinaXaYaeydbcdtgKfIdbawaKfIdbNUdbaeclfheaXclfhXaQcufgQmbkaLazfhLa8Acefg8Aal9hmbxdkka8Lcdthzcbh8AaghLinaoa8AaE2cdtfhYasc;WbfheaLhXa8LhQinaXaYaeydbcdtgKfIdbawaKfIdbNUdbaeclfheaXclfhXaQcufgQmbkaLazfhLa8Acefg8Aal9hmbkkascxfaHcdtfcualc8S2gealc;D;O;f8U0EgQcbyd:m:jjjbHjjjjbbgXBdbasaHcefgKBd2aXcbaez:ojjjbhqdndndna8LTmbascxfaKcdtfaQcbyd:m:jjjbHjjjjbbgvBdbasaHcdfgXBd2avcbaez:ojjjb8AascxfaXcdtfcua8Lal2gecltgXaecFFFFb0Ecbyd:m:jjjbHjjjjbbgiBdbasaHcifBd2aicbaXz:ojjjb8AadmexdkcbhvcbhiadTmekcbhYabhXindna3aXclfydbg8Acx2fgeIdba3aXydbgLcx2fgQIdbgI:tg8Ra3aXcwfydbgEcx2fgKIdlaQIdlg8S:tgRNaKIdbaI:tg8UaeIdla8S:tg8VN:tg8Wa8WNa8VaKIdwaQIdwg8X:tg8YNaRaeIdwa8X:tg8VN:tgRaRNa8Va8UNa8Ya8RN:tg8Ra8RNMM:rg8UJbbbb9ETmba8Wa8U:vh8Wa8Ra8U:vh8RaRa8U:vhRkaqaAaLcdtfydbc8S2fgeaRa8U:rg8UaRNNg8VaeIdbMUdbaea8Ra8Ua8RNg8ZNg8YaeIdlMUdlaea8Wa8Ua8WNg80Ng81aeIdwMUdwaea8ZaRNg8ZaeIdxMUdxaea80aRNgBaeIdzMUdzaea80a8RNg80aeIdCMUdCaeaRa8Ua8Wa8XNaRaINa8Sa8RNMM:mg8SNgINgRaeIdKMUdKaea8RaINg8RaeId3MUd3aea8WaINg8WaeIdaMUdaaeaIa8SNgIaeId8KMUd8Kaea8UaeIdyMUdyaqaAa8Acdtfydbc8S2fgea8VaeIdbMUdbaea8YaeIdlMUdlaea81aeIdwMUdwaea8ZaeIdxMUdxaeaBaeIdzMUdzaea80aeIdCMUdCaeaRaeIdKMUdKaea8RaeId3MUd3aea8WaeIdaMUdaaeaIaeId8KMUd8Kaea8UaeIdyMUdyaqaAaEcdtfydbc8S2fgea8VaeIdbMUdbaea8YaeIdlMUdlaea81aeIdwMUdwaea8ZaeIdxMUdxaeaBaeIdzMUdzaea80aeIdCMUdCaeaRaeIdKMUdKaea8RaeId3MUd3aea8WaeIdaMUdaaeaIaeId8KMUd8Kaea8UaeIdyMUdyaXcxfhXaYcifgYad6mbkcbhzabhLinabazcdtfh8AcbhXinaCa8AaXc;a1jjbfydbcdtfydbgQfRbbhedndnaCaLaXfydbgKfRbbgYc99fcFeGcpe0mbaec99fcFeGc;:e6mekdnaYcufcFeGce0mba8JaKcdtfydbaQ9hmekdnaecufcFeGce0mba8KaQcdtfydbaK9hmekdnaYcv2aefc:G1jjbfRbbTmbaAaQcdtfydbaAaKcdtfydb0mekJbbacJbbacJbbjZaecFeGceSEaYceSEh80dna3a8AaXc;e1jjbfydbcdtfydbcx2fgeIdwa3aKcx2fgYIdwg8S:tg8Wa3aQcx2fgEIdwa8S:tgRaRNaEIdbaYIdbg8X:tg8Ra8RNaEIdlaYIdlg8V:tg8Ua8UNMMgINa8WaRNaeIdba8X:tg81a8RNa8UaeIdla8V:tg8ZNMMg8YaRN:tg8Wa8WNa81aINa8Ya8RN:tgRaRNa8ZaINa8Ya8UN:tg8Ra8RNMM:rg8UJbbbb9ETmba8Wa8U:vh8Wa8Ra8U:vh8RaRa8U:vhRkaqaAaKcdtfydbc8S2fgeaRa80aI:rNg8UaRNNg8YaeIdbMUdbaea8Ra8Ua8RNg80Ng81aeIdlMUdlaea8Wa8Ua8WNgINg8ZaeIdwMUdwaea80aRNg80aeIdxMUdxaeaIaRNgBaeIdzMUdzaeaIa8RNg83aeIdCMUdCaeaRa8Ua8Wa8SNaRa8XNa8Va8RNMM:mg8SNgINgRaeIdKMUdKaea8RaINg8RaeId3MUd3aea8WaINg8WaeIdaMUdaaeaIa8SNgIaeId8KMUd8Kaea8UaeIdyMUdyaqaAaQcdtfydbc8S2fgea8YaeIdbMUdbaea81aeIdlMUdlaea8ZaeIdwMUdwaea80aeIdxMUdxaeaBaeIdzMUdzaea83aeIdCMUdCaeaRaeIdKMUdKaea8RaeId3MUd3aea8WaeIdaMUdaaeaIaeId8KMUd8Kaea8UaeIdyMUdykaXclfgXcx9hmbkaLcxfhLazcifgzad6mbka8LTmbcbhLinJbbbbh8Xa3abaLcdtfgeclfydbgEcx2fgXIdwa3aeydbgzcx2fgQIdwg8Z:tg8Ra8RNaXIdbaQIdbgB:tg8Wa8WNaXIdlaQIdlg83:tg8Ua8UNMMg80a3aecwfydbgHcx2fgeIdwa8Z:tgINa8Ra8RaINa8WaeIdbaB:tg8SNa8UaeIdla83:tg8VNMMgRN:tJbbbbJbbjZa80aIaINa8Sa8SNa8Va8VNMMg81NaRaRN:tg8Y:va8YJbbbb9BEg8YNhUa81a8RNaIaRN:ta8YNh85a80a8VNa8UaRN:ta8YNh86a81a8UNa8VaRN:ta8YNh87a80a8SNa8WaRN:ta8YNh88a81a8WNa8SaRN:ta8YNh89a8Wa8VNa8Sa8UN:tgRaRNa8UaINa8Va8RN:tgRaRNa8Ra8SNaIa8WN:tgRaRNMM:rJbbbZNhRagaza8L2gwcdtfhXagaHa8L2g8NcdtfhQagaEa8L2g5cdtfhKa8Z:mh8:a83:mhZaB:mhncbhYa8Lh8AJbbbbh8VJbbbbh8YJbbbbh80Jbbbbh81Jbbbbh8ZJbbbbhBJbbbbh83JbbbbhcJbbbbh9cinasc;WbfaYfgecwfaRa85aKIdbaXIdbgI:tg8UNaUaQIdbaI:tg8SNMg8RNUdbaeclfaRa87a8UNa86a8SNMg8WNUdbaeaRa89a8UNa88a8SNMg8UNUdbaecxfaRa8:a8RNaZa8WNaIana8UNMMMgINUdbaRa8Ra8WNNa81Mh81aRa8Ra8UNNa8ZMh8ZaRa8Wa8UNNaBMhBaRaIaINNa8XMh8XaRa8RaINNa8VMh8VaRa8WaINNa8YMh8YaRa8UaINNa80Mh80aRa8Ra8RNNa83Mh83aRa8Wa8WNNacMhcaRa8Ua8UNNa9cMh9caXclfhXaKclfhKaQclfhQaYczfhYa8Acufg8Ambkavazc8S2fgea9caeIdbMUdbaeacaeIdlMUdlaea83aeIdwMUdwaeaBaeIdxMUdxaea8ZaeIdzMUdzaea81aeIdCMUdCaea80aeIdKMUdKaea8YaeId3MUd3aea8VaeIdaMUdaaea8XaeId8KMUd8KaeaRaeIdyMUdyavaEc8S2fgea9caeIdbMUdbaeacaeIdlMUdlaea83aeIdwMUdwaeaBaeIdxMUdxaea8ZaeIdzMUdzaea81aeIdCMUdCaea80aeIdKMUdKaea8YaeId3MUd3aea8VaeIdaMUdaaea8XaeId8KMUd8KaeaRaeIdyMUdyavaHc8S2fgea9caeIdbMUdbaeacaeIdlMUdlaea83aeIdwMUdwaeaBaeIdxMUdxaea8ZaeIdzMUdzaea81aeIdCMUdCaea80aeIdKMUdKaea8YaeId3MUd3aea8VaeIdaMUdaaea8XaeId8KMUd8KaeaRaeIdyMUdyaiawcltfh8AcbhXa8LhKina8AaXfgeasc;WbfaXfgQIdbaeIdbMUdbaeclfgYaQclfIdbaYIdbMUdbaecwfgYaQcwfIdbaYIdbMUdbaecxfgeaQcxfIdbaeIdbMUdbaXczfhXaKcufgKmbkaia5cltfh8AcbhXa8LhKina8AaXfgeasc;WbfaXfgQIdbaeIdbMUdbaeclfgYaQclfIdbaYIdbMUdbaecwfgYaQcwfIdbaYIdbMUdbaecxfgeaQcxfIdbaeIdbMUdbaXczfhXaKcufgKmbkaia8Ncltfh8AcbhXa8LhKina8AaXfgeasc;WbfaXfgQIdbaeIdbMUdbaeclfgYaQclfIdbaYIdbMUdbaecwfgYaQcwfIdbaYIdbMUdbaecxfgeaQcxfIdbaeIdbMUdbaXczfhXaKcufgKmbkaLcifgLad6mbkkcbhQdndnamcwGgJmbJbbbbh8Vcbh9ecbhocbhhxekcbh9ea8Fcbyd:m:jjjbHjjjjbbhhascxfasyd2gecdtfahBdbasaecefgXBd2ascxfaXcdtfcuahalabadaAz:fjjjbgKcltaKcjjjjiGEcbyd:m:jjjbHjjjjbbgoBdbasaecdfBd2aoaKaha3alz:gjjjbJFFuuh8VaKTmbaoheaKhXinaeIdbgRa8Va8VaR9EEh8VaeclfheaXcufgXmbkaKh9ekasydlhTdnalTmbaTclfheaTydbhKaChXalhYcbhQincbaeydbg8AaK9RaXRbbcpeGEaQfhQaXcefhXaeclfhea8AhKaYcufgYmbkaQce4hQkcuadaQ9RcifgScx2aSc;v:Q;v:Qe0Ecbyd:m:jjjbHjjjjbbhDascxfasyd2g9hcdtfaDBdbasa9hcefgeBd2ascxfaecdtfcuaScdtaScFFFFi0Ecbyd:m:jjjbHjjjjbbgrBdbasa9hcdfgeBd2ascxfaecdtfa8Fcbyd:m:jjjbHjjjjbbgyBdbasa9hcifgeBd2ascxfaecdtfalcbyd:m:jjjbHjjjjbbg9iBdbasa9hclfg6Bd2axaxNa8PJbbjZamclGEgUaUN:vh9cJbbbbhcdnadak9nmbdnaSci6mba8Lclth9kaDcwfh0Jbbbbh83JbbbbhcinasclfabadalaAz:cjjjbabhzcbh8Ecbh8Finaba8FcdtfhHcbheindnaAazaefydbgQcdtgEfydbgYaAaHaec;q1jjbfydbcdtfydbgXcdtgwfydbg8ASmbaCaXfRbbgLcv2aCaQfRbbgKfc;G1jjbfRbbg5aKcv2aLfg8Nc;G1jjbfRbbg8MVcFeGTmbdna8AaY9nmba8Nc:G1jjbfRbbcFeGmekaKcufhYdnaKaL9hmbaYcFeGce0mba8JaEfydbaX9hmekdndnaKclSmbaLcl9hmekdnaYcFeGce0mba8JaEfydbaX9hmdkaLcufcFeGce0mba8KawfydbaQ9hmekaDa8Ecx2fgKaXaQa8McFeGgYEBdlaKaQaXaYEBdbaKaYa5Gcb9hBdwa8Ecefh8Ekaeclfgecx9hmbkdna8Fcifg8Fad9pmbazcxfhza8EcifaS9nmekka8ETmdcbhLinaqaAaDaLcx2fgKydbgYcdtgzfydbc8S2fgeIdwa3aKydlg8Acx2fgXIdwg8WNaeIdzaXIdbg8UNaeIdaMgRaRMMa8WNaeIdlaXIdlgINaeIdCa8WNaeId3MgRaRMMaINaeIdba8UNaeIdxaINaeIdKMgRaRMMa8UNaeId8KMMM:lhRJbbbbJbbjZaeIdyg8R:va8RJbbbb9BEh8RdndnaKydwgEmbJFFuuh8YxekJbbbbJbbjZaqaAa8Acdtfydbc8S2fgeIdyg8S:va8SJbbbb9BEaeIdwa3aYcx2fgXIdwg8SNaeIdzaXIdbg8XNaeIdaMg8Ya8YMMa8SNaeIdlaXIdlg8YNaeIdCa8SNaeId3Mg8Sa8SMMa8YNaeIdba8XNaeIdxa8YNaeIdKMg8Sa8SMMa8XNaeId8KMMM:lNh8Yka8RaRNh80dna8LTmbavaYc8S2fgQIdwa8WNaQIdza8UNaQIdaMgRaRMMa8WNaQIdlaINaQIdCa8WNaQId3MgRaRMMaINaQIdba8UNaQIdxaINaQIdKMgRaRMMa8UNaQId8KMMMhRaga8Aa8L2gHcdtfhXaiaYa8L2gwcltfheaQIdyh8Sa8LhQinaXIdbg8Ra8Ra8SNaecxfIdba8WaecwfIdbNa8UaeIdbNaIaeclfIdbNMMMg8Ra8RM:tNaRMhRaXclfhXaeczfheaQcufgQmbkdndnaEmbJbbbbh8Rxekava8Ac8S2fgQIdwa3aYcx2fgeIdwg8UNaQIdzaeIdbgINaQIdaMg8Ra8RMMa8UNaQIdlaeIdlg8SNaQIdCa8UNaQId3Mg8Ra8RMMa8SNaQIdbaINaQIdxa8SNaQIdKMg8Ra8RMMaINaQId8KMMMh8RagawcdtfhXaiaHcltfheaQIdyh8Xa8LhQinaXIdbg8Wa8Wa8XNaecxfIdba8UaecwfIdbNaIaeIdbNa8SaeclfIdbNMMMg8Wa8WM:tNa8RMh8RaXclfhXaeczfheaQcufgQmbka8R:lh8Rka80aR:lMh80a8Ya8RMh8YaCaYfRbbcd9hmbdna8Ka8Ja8Jazfydba8ASEaaazfydbgHcdtfydbgzcu9hmbaaa8AcdtfydbhzkavaHc8S2fgQIdwa3azcx2fgeIdwg8WNaQIdzaeIdbg8UNaQIdaMgRaRMMa8WNaQIdlaeIdlgINaQIdCa8WNaQId3MgRaRMMaINaQIdba8UNaQIdxaINaQIdKMgRaRMMa8UNaQId8KMMMhRagaza8L2gwcdtfhXaiaHa8L2g8NcltfheaQIdyh8Sa8LhQinaXIdbg8Ra8Ra8SNaecxfIdba8WaecwfIdbNa8UaeIdbNaIaeclfIdbNMMMg8Ra8RM:tNaRMhRaXclfhXaeczfheaQcufgQmbkdndnaEmbJbbbbh8Rxekavazc8S2fgQIdwa3aHcx2fgeIdwg8UNaQIdzaeIdbgINaQIdaMg8Ra8RMMa8UNaQIdlaeIdlg8SNaQIdCa8UNaQId3Mg8Ra8RMMa8SNaQIdbaINaQIdxa8SNaQIdKMg8Ra8RMMaINaQId8KMMMh8Raga8NcdtfhXaiawcltfheaQIdyh8Xa8LhQinaXIdbg8Wa8Wa8XNaecxfIdba8UaecwfIdbNaIaeIdbNa8SaeclfIdbNMMMg8Wa8WM:tNa8RMh8RaXclfhXaeczfheaQcufgQmbka8R:lh8Rka80aR:lMh80a8Ya8RMh8YkaKa80a8Ya80a8Y9FgeEUdwaKa8AaYaeaETVgeEBdlaKaYa8AaeEBdbaLcefgLa8E9hmbkasc;Wbfcbcj;qbz:ojjjb8Aa0hea8EhXinasc;WbfaeydbcA4cF8FGgQcFAaQcFA6EcdtfgQaQydbcefBdbaecxfheaXcufgXmbkcbhecbhXinasc;WbfaefgQydbhKaQaXBdbaKaXfhXaeclfgecj;qb9hmbkcbhea0hXinasc;WbfaXydbcA4cF8FGgQcFAaQcFA6EcdtfgQaQydbgQcefBdbaraQcdtfaeBdbaXcxfhXa8Eaecefge9hmbkadak9RgQci9Uh9mdnalTmbcbheayhXinaXaeBdbaXclfhXalaecefge9hmbkkcbh9na9icbalz:ojjjbh8FaQcO9Uh9oa9mce4h9pasydwh9qcbh8Mcbh5dninaDara5cdtfydbcx2fg8NIdwgRa9c9Emea8Ma9m9pmeJFFuuh8Rdna9pa8E9pmbaDara9pcdtfydbcx2fIdwJbb;aZNh8RkdnaRa8R9ETmbaRac9ETmba8Ma9o0mdkdna8FaAa8NydlgHcdtg9rfydbgKfg9sRbba8FaAa8Nydbgzcdtg9tfydbgefg9uRbbVmbaCazfRbbh9vdnaTaecdtfgXclfydbgQaXydbgXSmbaQaX9RhYa3aKcx2fhLa3aecx2fhEa9qaXcitfhecbhXcehwdnindnayaeydbcdtfydbgQaKSmbayaeclfydbcdtfydbg8AaKSmbaQa8ASmba3a8Acx2fg8AIdba3aQcx2fgQIdbg8W:tgRaEIdlaQIdlg8U:tg8XNaEIdba8W:tg8Ya8AIdla8U:tg8RN:tgIaRaLIdla8U:tg80NaLIdba8W:tg81a8RN:tg8UNa8RaEIdwaQIdwg8S:tg8ZNa8Xa8AIdwa8S:tg8WN:tg8Xa8RaLIdwa8S:tgBNa80a8WN:tg8RNa8Wa8YNa8ZaRN:tg8Sa8Wa81NaBaRN:tgRNMMaIaINa8Xa8XNa8Sa8SNMMa8Ua8UNa8Ra8RNaRaRNMMN:rJbbj8:N9FmdkaecwfheaXcefgXaY6hwaYaX9hmbkkawceGTmba9pcefh9pxekdndndndna9vc9:fPdebdkazheinayaecdtgefaHBdbaaaefydbgeaz9hmbxikkdna8Ka8Ja8Ja9tfydbaHSEaaa9tfydbgzcdtfydbgecu9hmbaaa9rfydbhekaya9tfaHBdbaehHkayazcdtfaHBdbka9uce86bba9sce86bba8NIdwgRacacaR9DEhca9ncefh9ncecda9vceSEa8Mfh8Mka5cefg5a8E9hmbkka9nTmddnalTmbcbh8AcbhEindnayaEcdtgefydbgQaESmbaAaQcdtfydbhzdnaEaAaefydb9hgHmbaqazc8S2fgeaqaEc8S2fgXIdbaeIdbMUdbaeaXIdlaeIdlMUdlaeaXIdwaeIdwMUdwaeaXIdxaeIdxMUdxaeaXIdzaeIdzMUdzaeaXIdCaeIdCMUdCaeaXIdKaeIdKMUdKaeaXId3aeId3MUd3aeaXIdaaeIdaMUdaaeaXId8KaeId8KMUd8KaeaXIdyaeIdyMUdyka8LTmbavaQc8S2fgeavaEc8S2gwfgXIdbaeIdbMUdbaeaXIdlaeIdlMUdlaeaXIdwaeIdwMUdwaeaXIdxaeIdxMUdxaeaXIdzaeIdzMUdzaeaXIdCaeIdCMUdCaeaXIdKaeIdKMUdKaeaXId3aeId3MUd3aeaXIdaaeIdaMUdaaeaXId8KaeId8KMUd8KaeaXIdyaeIdyMUdya9kaQ2hLaihXa8LhKinaXaLfgeaXa8AfgQIdbaeIdbMUdbaeclfgYaQclfIdbaYIdbMUdbaecwfgYaQcwfIdbaYIdbMUdbaecxfgeaQcxfIdbaeIdbMUdbaXczfhXaKcufgKmbkaHmbJbbbbJbbjZaqawfgeIdygR:vaRJbbbb9BEaeIdwa3azcx2fgXIdwgRNaeIdzaXIdbg8RNaeIdaMg8Wa8WMMaRNaeIdlaXIdlg8WNaeIdCaRNaeId3MgRaRMMa8WNaeIdba8RNaeIdxa8WNaeIdKMgRaRMMa8RNaeId8KMMM:lNgRa83a83aR9DEh83ka8Aa9kfh8AaEcefgEal9hmbkcbhXa8JheindnaeydbgQcuSmbdnaXayaQcdtgKfydbgQ9hmbcuhQa8JaKfydbgKcuSmbayaKcdtfydbhQkaeaQBdbkaeclfhealaXcefgX9hmbkcbhXa8KheindnaeydbgQcuSmbdnaXayaQcdtgKfydbgQ9hmbcuhQa8KaKfydbgKcuSmbayaKcdtfydbhQkaeaQBdbkaeclfhealaXcefgX9hmbkka83aca8LEh83cbhKabhecbhYindnayaeydbcdtfydbgXayaeclfydbcdtfydbgQSmbaXayaecwfydbcdtfydbg8ASmbaQa8ASmbabaKcdtfgLaXBdbaLcwfa8ABdbaLclfaQBdbaKcifhKkaecxfheaYcifgYad6mbkdndnaJTmbaKak9nmba8Va839FTmbcbhdabhecbhXindnaoahaeydbgQcdtfydbcdtfIdba839ETmbabadcdtfgYaQBdbaYclfaeclfydbBdbaYcwfaecwfydbBdbadcifhdkaecxfheaXcifgXaK6mbkJFFuuh8Va9eTmeaohea9ehXJFFuuhRinaeIdbg8RaRaRa8R9EEg8WaRa8Ra839EgQEhRa8Wa8VaQEh8VaeclfheaXcufgXmbxdkkaKhdkadak0mbxdkkasclfabadalaAz:cjjjbkdndnadak0mbadhXxekdnaJmbadhXxekdna8Va9c9FmbadhXxekina8VJbb;aZNgRa9caRa9c9DEh8WJbbbbhRdna9eTmbaohea9ehAinaeIdbg8RaRa8Ra8W9FEaRa8RaR9EEhRaeclfheaAcufgAmbkkcbhXabhecbhAindnaoahaeydbgQcdtfydbcdtfIdba8W9ETmbabaXcdtfgKaQBdbaKclfaeclfydbBdbaKcwfaecwfydbBdbaXcifhXkaecxfheaAcifgAad6mbkJFFuuh8Vdna9eTmbaohea9ehAJFFuuh8RinaeIdbg8Ua8Ra8Ra8U9EEgIa8Ra8Ua8W9EgQEh8RaIa8VaQEh8VaeclfheaAcufgAmbkkdnaXad9hmbadhXxdkaRacacaR9DEhcaXak9nmeaXhda8Va9c9FmbkkdnamcjjjjlGTmbaOmbaXTmbcbh8AabheinaCaeydbgKfRbbc3thLaecwfgEydbhAdndna8JaKcdtgHfydbaeclfgzydbgQSmbcbhYa8KaQcdtfydbaK9hmekcjjjj94hYkaeaLaYVaKVBdbaCaQfRbbc3thLdndna8JaQcdtfydbaASmbcbhYa8KaAcdtfydbaQ9hmekcjjjj94hYkazaLaYVaQVBdbaCaAfRbbc3thYdndna8JaAcdtfydbaKSmbcbhQa8KaHfydbaA9hmekcjjjj94hQkaEaYaQVaAVBdbaecxfhea8Acifg8AaX6mbkkdnaOTmbaXTmbaXheinabaOabydbcdtfydbBdbabclfhbaecufgembkkdnaPTmbaPaUac:rNUdbka9hcdtascxffcxfhednina6Tmeaeydbcbyd1:jjjbH:bjjjbbaec98fhea6cufh6xbkkasc;W;qbf8KjjjjbaXk;Yieouabydlhvabydbclfcbaicdtz:ojjjbhoadci9UhrdnadTmbdnalTmbaehwadhDinaoalawydbcdtfydbcdtfgqaqydbcefBdbawclfhwaDcufgDmbxdkkaehwadhDinaoawydbcdtfgqaqydbcefBdbawclfhwaDcufgDmbkkdnaiTmbcbhDaohwinawydbhqawaDBdbawclfhwaqaDfhDaicufgimbkkdnadci6mbinaecwfydbhwaeclfydbhDaeydbhidnalTmbalawcdtfydbhwalaDcdtfydbhDalaicdtfydbhikavaoaicdtfgqydbcitfaDBdbavaqydbcitfawBdlaqaqydbcefBdbavaoaDcdtfgqydbcitfawBdbavaqydbcitfaiBdlaqaqydbcefBdbavaoawcdtfgwydbcitfaiBdbavawydbcitfaDBdlawawydbcefBdbaecxfhearcufgrmbkkabydbcbBdbk:todDue99aicd4aifhrcehwinawgDcethwaDar6mbkcuaDcdtgraDcFFFFi0Ecbyd:m:jjjbHjjjjbbhwaoaoyd9GgqcefBd9GaoaqcdtfawBdbawcFearz:ojjjbhkdnaiTmbalcd4hlaDcufhxcbhminamhDdnavTmbavamcdtfydbhDkcbadaDal2cdtfgDydlgwawcjjjj94SEgwcH4aw7c:F:b:DD2cbaDydbgwawcjjjj94SEgwcH4aw7c;D;O:B8J27cbaDydwgDaDcjjjj94SEgDcH4aD7c:3F;N8N27axGhwamcdthPdndndnavTmbakawcdtfgrydbgDcuSmeadavaPfydbal2cdtfgsIdbhzcehqinaqhrdnadavaDcdtfydbal2cdtfgqIdbaz9CmbaqIdlasIdl9CmbaqIdwasIdw9BmlkarcefhqakawarfaxGgwcdtfgrydbgDcu9hmbxdkkakawcdtfgrydbgDcuSmbadamal2cdtfgsIdbhzcehqinaqhrdnadaDal2cdtfgqIdbaz9CmbaqIdlasIdl9CmbaqIdwasIdw9BmikarcefhqakawarfaxGgwcdtfgrydbgDcu9hmbkkaramBdbamhDkabaPfaDBdbamcefgmai9hmbkkakcbyd1:jjjbH:bjjjbbaoaoyd9GcufBd9GdnaeTmbaiTmbcbhDaehwinawaDBdbawclfhwaiaDcefgD9hmbkcbhDaehwindnaDabydbgrSmbawaearcdtfgrydbBdbaraDBdbkawclfhwabclfhbaiaDcefgD9hmbkkk;Qodvuv998Jjjjjbca9Rgvczfcwfcbyd11jjbBdbavcb8Pdj1jjb83izavcwfcbydN1jjbBdbavcb8Pd:m1jjb83ibdnadTmbaicd4hodnabmbdnalTmbcbhrinaealarcdtfydbao2cdtfhwcbhiinavczfaifgDawaifIdbgqaDIdbgkakaq9EEUdbavaifgDaqaDIdbgkakaq9DEUdbaiclfgicx9hmbkarcefgrad9hmbxikkaocdthrcbhwincbhiinavczfaifgDaeaifIdbgqaDIdbgkakaq9EEUdbavaifgDaqaDIdbgkakaq9DEUdbaiclfgicx9hmbkaearfheawcefgwad9hmbxdkkdnalTmbcbhrinabarcx2fgiaealarcdtfydbao2cdtfgwIdbUdbaiawIdlUdlaiawIdwUdwcbhiinavczfaifgDawaifIdbgqaDIdbgkakaq9EEUdbavaifgDaqaDIdbgkakaq9DEUdbaiclfgicx9hmbkarcefgrad9hmbxdkkaocdthlcbhraehwinabarcx2fgiaearao2cdtfgDIdbUdbaiaDIdlUdlaiaDIdwUdwcbhiinavczfaifgDawaifIdbgqaDIdbgkakaq9EEUdbavaifgDaqaDIdbgkakaq9DEUdbaiclfgicx9hmbkawalfhwarcefgrad9hmbkkJbbbbavIdbavIdzgk:tgqaqJbbbb9DEgqavIdlavIdCgx:tgmamaq9DEgqavIdwavIdKgm:tgPaPaq9DEhPdnabTmbadTmbJbbbbJbbjZaP:vaPJbbbb9BEhqinabaqabIdbak:tNUdbabclfgvaqavIdbax:tNUdbabcwfgvaqavIdbam:tNUdbabcxfhbadcufgdmbkkaPk:ZlewudnaeTmbcbhvabhoinaoavBdbaoclfhoaeavcefgv9hmbkkdnaiTmbcbhrinadarcdtfhwcbhDinalawaDcdtgvc;a1jjbfydbcdtfydbcdtfydbhodnabalawavfydbcdtfydbgqcdtfgkydbgvaqSmbinakabavgqcdtfgxydbgvBdbaxhkaqav9hmbkkdnabaocdtfgkydbgvaoSmbinakabavgocdtfgxydbgvBdbaxhkaoav9hmbkkdnaqaoSmbabaqaoaqao0Ecdtfaqaoaqao6EBdbkaDcefgDci9hmbkarcifgrai6mbkkdnaembcbskcbhxindnalaxcdtgvfydbax9hmbaxhodnabavfgDydbgvaxSmbaDhqinaqabavgocdtfgkydbgvBdbakhqaoav9hmbkkaDaoBdbkaxcefgxae9hmbkcbhvabhocbhkindndnavalydbgq9hmbdnavaoydbgq9hmbaoakBdbakcefhkxdkaoabaqcdtfydbBdbxekaoabaqcdtfydbBdbkaoclfhoalclfhlaeavcefgv9hmbkakk;Jiilud99duabcbaecltz:ojjjbhvdnalTmbadhoaihralhwinarcwfIdbhDarclfIdbhqavaoydbcltfgkarIdbakIdbMUdbakclfgxaqaxIdbMUdbakcwfgxaDaxIdbMUdbakcxfgkakIdbJbbjZMUdbaoclfhoarcxfhrawcufgwmbkkdnaeTmbavhraehkinarcxfgoIdbhDaocbBdbararIdbJbbbbJbbjZaD:vaDJbbbb9BEgDNUdbarclfgoaDaoIdbNUdbarcwfgoaDaoIdbNUdbarczfhrakcufgkmbkkdnalTmbinavadydbcltfgrcxfgkaicwfIdbarcwfIdb:tgDaDNaiIdbarIdb:tgDaDNaiclfIdbarclfIdb:tgDaDNMMgDakIdbgqaqaD9DEUdbadclfhdaicxfhialcufglmbkkdnaeTmbavcxfhrinabarIdbUdbarczfhrabclfhbaecufgembkkk8MbabaeadaialavcbcbcbcbcbaoarawaDz:bjjjbk8MbabaeadaialavaoarawaDaqakaxamaPz:bjjjbk:DCoDud99rue99iul998Jjjjjbc;Wb9Rgw8KjjjjbdndnarmbcbhDxekawcxfcbc;Kbz:ojjjb8Aawcuadcx2adc;v:Q;v:Qe0Ecbyd:m:jjjbHjjjjbbgqBdxawceBd2aqaeadaicbz:ejjjb8AawcuadcdtadcFFFFi0Egkcbyd:m:jjjbHjjjjbbgxBdzawcdBd2adcd4adfhmceheinaegicetheaiam6mbkcbhPawcuaicdtgsaicFFFFi0Ecbyd:m:jjjbHjjjjbbgzBdCawciBd2dndnar:ZgH:rJbbbZMgO:lJbbb9p9DTmbaO:Ohexekcjjjj94hekaicufhAc:bwhmcbhCadhXcbhQinaChLaeamgKcufaeaK9iEaPgDcefaeaD9kEhYdndnadTmbaYcuf:YhOaqhiaxheadhmindndnaiIdbaONJbbbZMg8A:lJbbb9p9DTmba8A:OhCxekcjjjj94hCkaCcCthCdndnaiclfIdbaONJbbbZMg8A:lJbbb9p9DTmba8A:OhExekcjjjj94hEkaEcqtaCVhCdndnaicwfIdbaONJbbbZMg8A:lJbbb9p9DTmba8A:OhExekcjjjj94hEkaeaCaEVBdbaicxfhiaeclfheamcufgmmbkazcFeasz:ojjjbh3cbh5cbhPindna3axaPcdtfydbgCcm4aC7c:v;t;h;Ev2gics4ai7aAGgmcdtfgEydbgecuSmbaeaCSmbcehiina3amaifaAGgmcdtfgEydbgecuSmeaicefhiaeaC9hmbkkaEaCBdba5aecuSfh5aPcefgPad9hmbxdkkazcFeasz:ojjjb8Acbh5kaDaYa5ar0giEhPaLa5aiEhCdna5arSmbaYaKaiEgmaP9Rcd9imbdndnaQcl0mbdnaX:ZgOaL:Zg8A:taY:Yg8EaD:Y:tg8Fa8EaK:Y:tgaa5:ZghaH:tNNNaOaH:taaNa8Aah:tNa8AaH:ta8FNahaO:tNM:va8EMJbbbZMgO:lJbbb9p9DTmbaO:Ohexdkcjjjj94hexekaPamfcd9Theka5aXaiEhXaQcefgQcs9hmekkdndnaCmbcihicbhDxekcbhiawakcbyd:m:jjjbHjjjjbbg5BdKawclBd2aPcuf:Yh8AdndnadTmbaqhiaxheadhmindndnaiIdba8ANJbbbZMgO:lJbbb9p9DTmbaO:OhCxekcjjjj94hCkaCcCthCdndnaiclfIdba8ANJbbbZMgO:lJbbb9p9DTmbaO:OhExekcjjjj94hEkaEcqtaCVhCdndnaicwfIdba8ANJbbbZMgO:lJbbb9p9DTmbaO:OhExekcjjjj94hEkaeaCaEVBdbaicxfhiaeclfheamcufgmmbkazcFeasz:ojjjbh3cbhDcbhYindndndna3axaYcdtgKfydbgCcm4aC7c:v;t;h;Ev2gics4ai7aAGgmcdtfgEydbgecuSmbcehiinaxaecdtgefydbaCSmdamaifheaicefhia3aeaAGgmcdtfgEydbgecu9hmbkkaEaYBdbaDhiaDcefhDxeka5aefydbhika5aKfaiBdbaYcefgYad9hmbkcuaDc32giaDc;j:KM;jb0EhexekazcFeasz:ojjjb8AcbhDcbhekawaecbyd:m:jjjbHjjjjbbgeBd3awcvBd2aecbaiz:ojjjbhEavcd4hKdnadTmbdnalTmbaKcdth3a5hCaqhealhmadhAinaEaCydbc32fgiaeIdbaiIdbMUdbaiaeclfIdbaiIdlMUdlaiaecwfIdbaiIdwMUdwaiamIdbaiIdxMUdxaiamclfIdbaiIdzMUdzaiamcwfIdbaiIdCMUdCaiaiIdKJbbjZMUdKaCclfhCaecxfheama3fhmaAcufgAmbxdkka5hmaqheadhCinaEamydbc32fgiaeIdbaiIdbMUdbaiaeclfIdbaiIdlMUdlaiaecwfIdbaiIdwMUdwaiaiIdxJbbbbMUdxaiaiIdzJbbbbMUdzaiaiIdCJbbbbMUdCaiaiIdKJbbjZMUdKamclfhmaecxfheaCcufgCmbkkdnaDTmbaEhiaDheinaiaiIdbJbbbbJbbjZaicKfIdbgO:vaOJbbbb9BEgONUdbaiclfgmaOamIdbNUdbaicwfgmaOamIdbNUdbaicxfgmaOamIdbNUdbaiczfgmaOamIdbNUdbaicCfgmaOamIdbNUdbaic3fhiaecufgembkkcbhCawcuaDcdtgYaDcFFFFi0Egicbyd:m:jjjbHjjjjbbgeBdaawcoBd2awaicbyd:m:jjjbHjjjjbbg3Bd8KaecFeaYz:ojjjbhxdnadTmbJbbjZJbbjZa8A:vaPceSEaoNgOaONh8AaKcdthPalheina8Aaec;81jjbalEgmIdwaEa5ydbgAc32fgiIdC:tgOaONamIdbaiIdx:tgOaONamIdlaiIdz:tgOaONMMNaqcwfIdbaiIdw:tgOaONaqIdbaiIdb:tgOaONaqclfIdbaiIdl:tgOaONMMMhOdndnaxaAcdtgifgmydbcuSmba3aifIdbaO9ETmekamaCBdba3aifaOUdbka5clfh5aqcxfhqaeaPfheadaCcefgC9hmbkkabaxaYz:njjjb8AcrhikaicdthiinaiTmeaic98fgiawcxffydbcbyd1:jjjbH:bjjjbbxbkkawc;Wbf8KjjjjbaDk:Ydidui99ducbhi8Jjjjjbca9Rglczfcwfcbyd11jjbBdbalcb8Pdj1jjb83izalcwfcbydN1jjbBdbalcb8Pd:m1jjb83ibdndnaembJbbjFhvJbbjFhoJbbjFhrxekadcd4cdthwincbhdinalczfadfgDabadfIdbgvaDIdbgoaoav9EEUdbaladfgDavaDIdbgoaoav9DEUdbadclfgdcx9hmbkabawfhbaicefgiae9hmbkalIdwalIdK:thralIdlalIdC:thoalIdbalIdz:thvkJbbbbavavJbbbb9DEgvaoaoav9DEgvararav9DEk9DeeuabcFeaicdtz:ojjjbhlcbhbdnadTmbindnalaeydbcdtfgiydbcu9hmbaiabBdbabcefhbkaeclfheadcufgdmbkkabk9teiucbcbyd:q:jjjbgeabcifc98GfgbBd:q:jjjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik;teeeudndnaeabVciGTmbabhixekdndnadcz9pmbabhixekabhiinaiaeydbBdbaiaeydlBdlaiaeydwBdwaiaeydxBdxaeczfheaiczfhiadc9Wfgdcs0mbkkadcl6mbinaiaeydbBdbaeclfheaiclfhiadc98fgdci0mbkkdnadTmbinaiaeRbb86bbaicefhiaecefheadcufgdmbkkabk:3eedudndnabciGTmbabhixekaecFeGc:b:c:ew2hldndnadcz9pmbabhixekabhiinaialBdxaialBdwaialBdlaialBdbaiczfhiadc9Wfgdcs0mbkkadcl6mbinaialBdbaiclfhiadc98fgdci0mbkkdnadTmbinaiae86bbaicefhiadcufgdmbkkabk9teiucbcbyd:q:jjjbgeabcrfc94GfgbBd:q:jjjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik9:eiuZbhedndncbyd:q:jjjbgdaecztgi9nmbcuheadai9RcFFifcz4nbcuSmekadhekcbabae9Rcifc98Gcbyd:q:jjjbfgdBd:q:jjjbdnadZbcztge9nmbadae9RcFFifcz4nb8Akkk:Iedbcjwk1eFFuuFFuuFFuuFFuFFFuFFFuFbbbbbbbbeeebeebebbeeebebbbbbebebbbbbbbbbebbbdbbbbbbbebbbebbbdbbbbbbbbbbbeeeeebebbebbebebbbeebbbbbbbbbbbbbbbbbbbbbc1Dkxebbbdbbb:GNbb",t=new Uint8Array([32,0,65,2,1,106,34,33,3,128,11,4,13,64,6,253,10,7,15,116,127,5,8,12,40,16,19,54,20,9,27,255,113,17,42,67,24,23,146,148,18,14,22,45,70,69,56,114,101,21,25,63,75,136,108,28,118,29,73,115]);if(typeof WebAssembly!="object")return{supported:!1};var a,s=WebAssembly.instantiate(r(e),{}).then(function(h){a=h.instance,a.exports.__wasm_call_ctors()});function r(h){for(var d=new Uint8Array(h.length),x=0;x<h.length;++x){var p=h.charCodeAt(x);d[x]=p>96?p-97:p>64?p-39:p+4}for(var m=0,x=0;x<h.length;++x)d[m++]=d[x]<60?t[d[x]]:(d[x]-60)*64+d[++x];return d.buffer.slice(0,m)}function n(h){if(!h)throw new Error("Assertion failed")}function i(h){return new Uint8Array(h.buffer,h.byteOffset,h.byteLength)}function o(h,d,x){var p=a.exports.sbrk,m=p(d.length*4),y=p(x*4),v=new Uint8Array(a.exports.memory.buffer),E=i(d);v.set(E,m);var S=h(y,m,d.length,x);v=new Uint8Array(a.exports.memory.buffer);var T=new Uint32Array(x);new Uint8Array(T.buffer).set(v.subarray(y,y+x*4)),E.set(v.subarray(m,m+d.length*4)),p(m-p(0));for(var A=0;A<d.length;++A)d[A]=T[d[A]];return[T,S]}function c(h){for(var d=0,x=0;x<h.length;++x){var p=h[x];d=d<p?p:d}return d}function l(h,d,x,p,m,y,v,E,S){var T=a.exports.sbrk,A=T(4),_=T(x*4),R=T(m*y),C=T(x*4),F=new Uint8Array(a.exports.memory.buffer);F.set(i(p),R),F.set(i(d),C);var O=h(_,C,x,R,m,y,v,E,S,A);F=new Uint8Array(a.exports.memory.buffer);var V=new Uint32Array(O);i(V).set(F.subarray(_,_+O*4));var $=new Float32Array(1);return i($).set(F.subarray(A,A+4)),T(A-T(0)),[V,$[0]]}function f(h,d,x,p,m,y,v,E,S,T,A,_,R){var C=a.exports.sbrk,F=C(4),O=C(x*4),V=C(m*y),$=C(m*E),re=C(S.length*4),de=C(x*4),Ke=T?C(m):0,be=new Uint8Array(a.exports.memory.buffer);be.set(i(p),V),be.set(i(v),$),be.set(i(S),re),be.set(i(d),de),T&&be.set(i(T),Ke);var Ve=h(O,de,x,V,m,y,$,E,re,S.length,Ke,A,_,R,F);be=new Uint8Array(a.exports.memory.buffer);var Qe=new Uint32Array(Ve);i(Qe).set(be.subarray(O,O+Ve*4));var _e=new Float32Array(1);return i(_e).set(be.subarray(F,F+4)),C(F-C(0)),[Qe,_e[0]]}function u(h,d,x,p){var m=a.exports.sbrk,y=m(x*p),v=new Uint8Array(a.exports.memory.buffer);v.set(i(d),y);var E=h(y,x,p);return m(y-m(0)),E}function g(h,d,x,p,m,y,v,E){var S=a.exports.sbrk,T=S(E*4),A=S(x*p),_=S(x*y),R=new Uint8Array(a.exports.memory.buffer);R.set(i(d),A),m&&R.set(i(m),_);var C=h(T,A,x,p,_,y,v,E);R=new Uint8Array(a.exports.memory.buffer);var F=new Uint32Array(C);return i(F).set(R.subarray(T,T+C*4)),S(T-S(0)),F}var b={LockBorder:1,Sparse:2,ErrorAbsolute:4,Prune:8,_InternalDebug:1<<30};return{ready:s,supported:!0,compactMesh:function(h){n(h instanceof Uint32Array||h instanceof Int32Array||h instanceof Uint16Array||h instanceof Int16Array),n(h.length%3==0);var d=h.BYTES_PER_ELEMENT==4?h:new Uint32Array(h);return o(a.exports.meshopt_optimizeVertexFetchRemap,d,c(h)+1)},simplify:function(h,d,x,p,m,y){n(h instanceof Uint32Array||h instanceof Int32Array||h instanceof Uint16Array||h instanceof Int16Array),n(h.length%3==0),n(d instanceof Float32Array),n(d.length%x==0),n(x>=3),n(p>=0&&p<=h.length),n(p%3==0),n(m>=0);for(var v=0,E=0;E<(y?y.length:0);++E)n(y[E]in b),v|=b[y[E]];var S=h.BYTES_PER_ELEMENT==4?h:new Uint32Array(h),T=l(a.exports.meshopt_simplify,S,h.length,d,d.length/x,x*4,p,m,v);return T[0]=h instanceof Uint32Array?T[0]:new h.constructor(T[0]),T},simplifyWithAttributes:function(h,d,x,p,m,y,v,E,S,T){n(h instanceof Uint32Array||h instanceof Int32Array||h instanceof Uint16Array||h instanceof Int16Array),n(h.length%3==0),n(d instanceof Float32Array),n(d.length%x==0),n(x>=3),n(p instanceof Float32Array),n(p.length%m==0),n(m>=0),n(v==null||v instanceof Uint8Array),n(v==null||v.length==d.length/x),n(E>=0&&E<=h.length),n(E%3==0),n(S>=0),n(Array.isArray(y)),n(m>=y.length),n(y.length<=32);for(var A=0;A<y.length;++A)n(y[A]>=0);for(var _=0,A=0;A<(T?T.length:0);++A)n(T[A]in b),_|=b[T[A]];var R=h.BYTES_PER_ELEMENT==4?h:new Uint32Array(h),C=f(a.exports.meshopt_simplifyWithAttributes,R,h.length,d,d.length/x,x*4,p,m*4,new Float32Array(y),v?new Uint8Array(v):null,E,S,_);return C[0]=h instanceof Uint32Array?C[0]:new h.constructor(C[0]),C},getScale:function(h,d){return n(h instanceof Float32Array),n(h.length%d==0),n(d>=3),u(a.exports.meshopt_simplifyScale,h,h.length/d,d*4)},simplifyPoints:function(h,d,x,p,m,y){return n(h instanceof Float32Array),n(h.length%d==0),n(d>=3),n(x>=0&&x<=h.length/d),p?(n(p instanceof Float32Array),n(p.length%m==0),n(m>=3),n(h.length/d==p.length/m),g(a.exports.meshopt_simplifyPoints,h,h.length/d,d*4,p,m*4,y,x)):g(a.exports.meshopt_simplifyPoints,h,h.length/d,d*4,void 0,0,0,x)}}})();var VE=(function(){var e="b9H79TebbbeVx9Geueu9Geub9Gbb9Giuuueu9Gmuuuuuuuuuuu9999eu9Gvuuuuueu9Gwuuuuuuuub9Gxuuuuuuuuuuuueu9Gkuuuuuuuuuu99eu9Gouuuuuub9Gruuuuuuub9GluuuubiOHdilvorwDqqkbiibeilve9Weiiviebeoweuec;G:Odkr:Yewo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bb8A9TW79O9V9Wt9F9I919P29K9nW79O2Wt79c9V919U9KbeX9TW79O9V9Wt9F9I919P29K9nW79O2Wt7bo39TW79O9V9Wt9F9J9V9T9W91tWJ2917tWV9c9V919U9K7br39TW79O9V9Wt9F9J9V9T9W91tW9nW79O2Wt9c9V919U9K7bDL9TW79O9V9Wt9F9V9Wt9P9T9P96W9nW79O2Wtbql79IV9RbkDwebcekdsPq;Q9BHdbkIbabaec9:fgefcufae9Ugeabci9Uadfcufad9Ugbaeab0Ek:w8KDPue99eux99dui99euo99iu8Jjjjjbc:WD9Rgm8KjjjjbdndnalmbcbhPxekamc:Cwfcbc;Kbz:njjjb8Adndnalcb9imbaoal9nmbamcuaocdtaocFFFFi0Egscbyd;y1jjbHjjjjbbgzBd:CwamceBd;8wamascbyd;y1jjbHjjjjbbgHBd:GwamcdBd;8wamcualcdtalcFFFFi0Ecbyd;y1jjbHjjjjbbgOBd:KwamciBd;8waihsalhAinazasydbcdtfcbBdbasclfhsaAcufgAmbkaihsalhAinazasydbcdtfgCaCydbcefBdbasclfhsaAcufgAmbkaihsalhCcbhXindnazasydbcdtgQfgAydbcb9imbaHaQfaXBdbaAaAydbgQcjjjj94VBdbaQaXfhXkasclfhsaCcufgCmbkalci9UhLdnalci6mbcbhsaihAinaAcwfydbhCaAclfydbhXaHaAydbcdtfgQaQydbgQcefBdbaOaQcdtfasBdbaHaXcdtfgXaXydbgXcefBdbaOaXcdtfasBdbaHaCcdtfgCaCydbgCcefBdbaOaCcdtfasBdbaAcxfhAaLascefgs9hmbkkaihsalhAindnazasydbcdtgCfgXydbgQcu9kmbaXaQcFFFFrGgQBdbaHaCfgCaCydbaQ9RBdbkasclfhsaAcufgAmbxdkkamcuaocdtgsaocFFFFi0EgAcbyd;y1jjbHjjjjbbgzBd:CwamceBd;8wamaAcbyd;y1jjbHjjjjbbgHBd:GwamcdBd;8wamcualcdtalcFFFFi0Ecbyd;y1jjbHjjjjbbgOBd:KwamciBd;8wazcbasz:njjjbhXalci9UhLaihsalhAinaXasydbcdtfgCaCydbcefBdbasclfhsaAcufgAmbkdnaoTmbcbhsaHhAaXhCaohQinaAasBdbaAclfhAaCydbasfhsaCclfhCaQcufgQmbkkdnalci6mbcbhsaihAinaAcwfydbhCaAclfydbhQaHaAydbcdtfgKaKydbgKcefBdbaOaKcdtfasBdbaHaQcdtfgQaQydbgQcefBdbaOaQcdtfasBdbaHaCcdtfgCaCydbgCcefBdbaOaCcdtfasBdbaAcxfhAaLascefgs9hmbkkaoTmbcbhsaohAinaHasfgCaCydbaXasfydb9RBdbasclfhsaAcufgAmbkkamaLcbyd;y1jjbHjjjjbbgsBd:OwamclBd;8wascbaLz:njjjbhYamcuaLcK2alcjjjjd0Ecbyd;y1jjbHjjjjbbg8ABd:SwamcvBd;8wJbbbbhEdnalci6g3mbarcd4hKaihAa8AhsaLhrJbbbbh5inavaAclfydbaK2cdtfgCIdlh8EavaAydbaK2cdtfgXIdlhEavaAcwfydbaK2cdtfgQIdlh8FaCIdwhaaXIdwhhaQIdwhgasaCIdbg8JaXIdbg8KMaQIdbg8LMJbbnn:vUdbasclfaXIdlaCIdlMaQIdlMJbbnn:vUdbaQIdwh8MaCIdwh8NaXIdwhyascxfa8EaE:tg8Eagah:tggNa8FaE:tg8Faaah:tgaN:tgEJbbbbJbbjZa8Ja8K:tg8Ja8FNa8La8K:tg8Ka8EN:tghahNaEaENaaa8KNaga8JN:tgEaENMM:rg8K:va8KJbbbb9BEg8ENUdbasczfaEa8ENUdbascCfaha8ENUdbascwfa8Maya8NMMJbbnn:vUdba5a8KMh5aAcxfhAascKfhsarcufgrmbka5aL:Z:vJbbbZNhEkamcuaLcdtalcFFFF970Ecbyd;y1jjbHjjjjbbgCBd:WwamcoBd;8waEaq:ZNhEdna3mbcbhsaChAinaAasBdbaAclfhAaLascefgs9hmbkkaE:rhhcuh8PamcuaLcltalcFFFFd0Ecbyd;y1jjbHjjjjbbgIBd:0wamcrBd;8wcbaIa8AaCaLz:djjjb8AJFFuuhyJFFuuh8RJFFuuh8Sdnalci6gXmbJFFuuh8Sa8AhsaLhAJFFuuh8RJFFuuhyinascwfIdbgEayayaE9EEhyasclfIdbgEa8Ra8RaE9EEh8RasIdbgEa8Sa8SaE9EEh8SascKfhsaAcufgAmbkkahJbbbZNhgamaocetgscuaocu9kEcbyd;y1jjbHjjjjbbgABd:4waAcFeasz:njjjbhCdnaXmbcbhAJFFuuhEa8Ahscuh8PinascwfIdbay:tghahNasIdba8S:tghahNasclfIdba8R:tghahNMM:rghaEa8PcuSahaE9DVgXEhEaAa8PaXEh8PascKfhsaLaAcefgA9hmbkkamczfcbcjwz:njjjb8Aamcwf9cb83ibam9cb83ibagaxNhRJbbjZak:th8Ncbh8UJbbbbh8VJbbbbh8WJbbbbh8XJbbbbh8YJbbbbh8ZJbbbbh80cbh81cbhPinJbbbbhEdna8UTmbJbbjZa8U:Z:vhEkJbbbbhhdna80a80Na8Ya8YNa8Za8ZNMMg8KJbbbb9BmbJbbjZa8K:r:vhhka8XaENh5a8WaENh8Fa8VaENhaa8PhQdndndndndna8UaPVTmbamydwgBTmea80ahNh8Ja8ZahNh8La8YahNh8Maeamydbcdtfh83cbh3JFFuuhEcvhXcuhQindnaza83a3cdtfydbcdtgsfydbgvTmbaOaHasfydbcdtfhAindndnaCaiaAydbgKcx2fgsclfydbgrcetf8Vebcs4aCasydbgLcetf8Vebcs4faCascwfydbglcetf8Vebcs4fgombcbhsxekcehsazaLcdtfydbgLceSmbcehsazarcdtfydbgrceSmbcehsazalcdtfydbglceSmbdnarcdSaLcdSfalcdSfcd6mbaocefhsxekaocdfhskdnasaX9kmba8AaKcK2fgLIdwa5:thhaLIdla8F:th8KaLIdbaa:th8EdndnakJbbbb9DTmba8E:lg8Ea8K:lg8Ka8Ea8K9EEg8Kah:lgha8Kah9EEag:vJbbjZMhhxekahahNa8Ea8ENa8Ka8KNMM:rag:va8NNJbbjZMJ9VO:d86JbbjZaLIdCa8JNaLIdxa8MNa8LaLIdzNMMakN:tghahJ9VO:d869DENhhkaKaQasaX6ahaE9DVgLEhQasaXaLEhXahaEaLEhEkaAclfhAavcufgvmbkka3cefg3aB9hmbkkaQcu9hmekama5Ud:ODama8FUd:KDamaaUd:GDamcuBd:qDamcFFF;7rBdjDaIcba8AaYamc:GDfakJbbbb9Damc:qDfamcjDfz:ejjjbamyd:qDhQdndnaxJbbbb9ETmba8UaD6mbaQcuSmeceh3amIdjDaR9EmixdkaQcu9hmekdna8UTmbdnamydlgza8Uci2fgsciGTmbadasfcba8Uazcu7fciGcefz:njjjb8AkabaPcltfgzam8Pib83dbazcwfamcwf8Pib83dbaPcefhPkc3hzinazc98Smvamc:Cwfazfydbcbyd;u1jjbH:bjjjbbazc98fhzxbkkcbh3a8Uaq9pmbamydwaCaiaQcx2fgsydbcetf8Vebcs4aCascwfydbcetf8Vebcs4faCasclfydbcetf8Vebcs4ffaw9nmekcbhscbhAdna81TmbcbhAamczfhXinamczfaAcdtfaXydbgLBdbaXclfhXaAaYaLfRbbTfhAa81cufg81mbkkamydwhlamydbhXam9cu83i:GDam9cu83i:ODam9cu83i:qDam9cu83i:yDaAc;8eaAclfc:bd6Eh81inamcjDfasfcFFF;7rBdbasclfgscz9hmbka81cdthBdnalTmbaeaXcdtfhocbhrindnazaoarcdtfydbcdtgsfydbgvTmbaOaHasfydbcdtfhAcuhLcuhsinazaiaAydbgKcx2fgXclfydbcdtfydbazaXydbcdtfydbfazaXcwfydbcdtfydbfgXasaXas6gXEhsaKaLaXEhLaAclfhAavcufgvmbkaLcuSmba8AaLcK2fgAIdway:tgEaENaAIdba8S:tgEaENaAIdla8R:tgEaENMM:rhEcbhAindndnasamc:qDfaAfgvydbgX6mbasaX9hmeaEamcjDfaAfIdb9FTmekavasBdbamc:GDfaAfaLBdbamcjDfaAfaEUdbxdkaAclfgAcz9hmbkkarcefgral9hmbkkamczfaBfhLcbhscbhAindnamc:GDfasfydbgXcuSmbaLaAcdtfaXBdbaAcefhAkasclfgscz9hmbkaAa81fg81TmbJFFuuhhcuhKamczfhsa81hvcuhLina8AasydbgXcK2fgAIdway:tgEaENaAIdba8S:tgEaENaAIdla8R:tgEaENMM:rhEdndnazaiaXcx2fgAclfydbcdtfydbazaAydbcdtfydbfazaAcwfydbcdtfydbfgAaL6mbaAaL9hmeaEah9DTmekaEhhaAhLaXhKkasclfhsavcufgvmbkaKcuSmbaKhQkdnamaiaQcx2fgrydbarclfydbarcwfydbaCabaeadaPawaqa3z:fjjjbTmbaPcefhPJbbbbh8VJbbbbh8WJbbbbh8XJbbbbh8YJbbbbh8ZJbbbbh80kcbhXinaOaHaraXcdtfydbcdtgAfydbcdtfgKhsazaAfgvydbgLhAdnaLTmbdninasydbaQSmeasclfhsaAcufgATmdxbkkasaKaLcdtfc98fydbBdbavavydbcufBdbkaXcefgXci9hmbka8AaQcK2fgsIdbhEasIdlhhasIdwh8KasIdxh8EasIdzh5asIdCh8FaYaQfce86bba80a8FMh80a8Za5Mh8Za8Ya8EMh8Ya8Xa8KMh8Xa8WahMh8Wa8VaEMh8Vamydxh8Uxbkkamc:WDf8KjjjjbaPk;Vvivuv99lu8Jjjjjbca9Rgv8Kjjjjbdndnalcw0mbaiydbhoaeabcitfgralcdtcufBdlaraoBdbdnalcd6mbaiclfhoalcufhwarcxfhrinaoydbhDarcuBdbarc98faDBdbarcwfhraoclfhoawcufgwmbkkalabfhrxekcbhDavczfcwfcbBdbav9cb83izavcwfcbBdbav9cb83ibJbbjZhqJbbjZhkinadaiaDcdtfydbcK2fhwcbhrinavczfarfgoawarfIdbgxaoIdbgm:tgPakNamMgmUdbavarfgoaPaxam:tNaoIdbMUdbarclfgrcx9hmbkJbbjZaqJbbjZMgq:vhkaDcefgDal9hmbkcbhoadcbcecdavIdlgxavIdwgm9GEgravIdbgPam9GEaraPax9GEgscdtgrfhzavczfarfIdbhxaihralhwinaiaocdtfgDydbhHaDarydbgOBdbaraHBdbarclfhraoazaOcK2fIdbax9Dfhoawcufgwmbkaeabcitfhrdndnaocv6mbaoalc98f6mekaraiydbBdbaralcdtcufBdlaiclfhoalcufhwarcxfhrinaoydbhDarcuBdbarc98faDBdbarcwfhraoclfhoawcufgwmbkalabfhrxekaraxUdbararydlc98GasVBdlabcefaeadaiaoz:djjjbhwararydlciGawabcu7fcdtVBdlawaeadaiaocdtfalao9Rz:djjjbhrkavcaf8Kjjjjbark:;idiud99dndnabaecitfgwydlgDciGgqciSmbinabcbaDcd4gDalaqcdtfIdbawIdb:tgkJbbbb9FEgwaecefgefadaialavaoarz:ejjjbak:larIdb9FTmdabawaD7aefgecitfgwydlgDciGgqci9hmbkkabaecitfgeclfhbdnavmbcuhwindnaiaeydbgDfRbbmbadaDcK2fgqIdwalIdw:tgkakNaqIdbalIdb:tgkakNaqIdlalIdl:tgkakNMM:rgkarIdb9DTmbarakUdbaoaDBdbkaecwfheawcefgwabydbcd46mbxdkkcuhwindnaiaeydbgDfRbbmbadaDcK2fgqIdbalIdb:t:lgkaqIdlalIdl:t:lgxakax9EEgkaqIdwalIdw:t:lgxakax9EEgkarIdb9DTmbarakUdbaoaDBdbkaecwfheawcefgwabydbcd46mbkkk;llevudnabydwgxaladcetfgm8Vebcs4alaecetfgP8Vebgscs4falaicetfgz8Vebcs4ffaD0abydxaq9pVakVgDce9hmbavawcltfgxab8Pdb83dbaxcwfabcwfgx8Pdb83dbdnaxydbgqTmbaoabydbcdtfhxaqhsinalaxydbcetfcFFi87ebaxclfhxascufgsmbkkdnabydxglci2gsabydlgxfgkciGTmbarakfcbalaxcu7fciGcefz:njjjb8Aabydxci2hsabydlhxabydwhqkab9cb83dwababydbaqfBdbabascifc98GaxfBdlaP8Vebhscbhxkdnascztcz91cu9kmbabaxcefBdwaPax87ebaoabydbcdtfaxcdtfaeBdbkdnam8Uebcu9kmbababydwgxcefBdwamax87ebaoabydbcdtfaxcdtfadBdbkdnaz8Uebcu9kmbababydwgxcefBdwazax87ebaoabydbcdtfaxcdtfaiBdbkarabydlfabydxci2faPRbb86bbarabydlfabydxci2fcefamRbb86bbarabydlfabydxci2fcdfazRbb86bbababydxcefBdxaDk8LbabaeadaialavaoarawaDaDaqJbbbbz:cjjjbk;Nkovud99euv99eul998Jjjjjbc:W;ae9Rgo8KjjjjbdndnadTmbavcd4hrcbhwcbhDindnaiaeclfydbar2cdtfgvIdbaiaeydbar2cdtfgqIdbgk:tgxaiaecwfydbar2cdtfgmIdlaqIdlgP:tgsNamIdbak:tgzavIdlaP:tgPN:tgkakNaPamIdwaqIdwgH:tgONasavIdwaH:tgHN:tgPaPNaHazNaOaxN:tgxaxNMM:rgsJbbbb9Bmbaoc:W:qefawcx2fgAakas:vUdwaAaxas:vUdlaAaPas:vUdbaoc8Wfawc8K2fgAaq8Pdb83dbaAav8Pdb83dxaAam8Pdb83dKaAcwfaqcwfydbBdbaAcCfavcwfydbBdbaAcafamcwfydbBdbawcefhwkaecxfheaDcifgDad6mbkab9cb83dbabcyf9cb83dbabcaf9cb83dbabcKf9cb83dbabczf9cb83dbabcwf9cb83dbawTmeaocbBd8Sao9cb83iKao9cb83izaoczfaoc8Wfawci2cxaoc8Sfcbcrz1jjjbaoIdKhCaoIdChXaoIdzhQao9cb83iwao9cb83ibaoaoc:W:qefawcxaoc8Sfcbciz1jjjbJbbjZhkaoIdwgPJbbbbJbbjZaPaPNaoIdbgPaPNaoIdlgsasNMM:rgx:vaxJbbbb9BEgzNhxasazNhsaPazNhzaoc:W:qefheawhvinaecwfIdbaxNaeIdbazNasaeclfIdbNMMgPakaPak9DEhkaecxfheavcufgvmbkabaCUdwabaXUdlabaQUdbabaoId3UdxdndnakJ;n;m;m899FmbJbbbbhPaoc:W:qefheaoc8WfhvinaCavcwfIdb:taecwfIdbgHNaQavIdb:taeIdbgONaXavclfIdb:taeclfIdbgLNMMaxaHNazaONasaLNMM:vgHaPaHaP9EEhPavc8KfhvaecxfheawcufgwmbkabaxUd8KabasUdaabazUd3abaCaxaPN:tUdKabaXasaPN:tUdCabaQazaPN:tUdzabJbbjZakakN:t:rgkUdydndnaxJbbj:;axJbbj:;9GEgPJbbjZaPJbbjZ9FEJbb;:9cNJbbbZJbbb:;axJbbbb9GEMgP:lJbbb9p9DTmbaP:Ohexekcjjjj94hekabae86b8UdndnasJbbj:;asJbbj:;9GEgPJbbjZaPJbbjZ9FEJbb;:9cNJbbbZJbbb:;asJbbbb9GEMgP:lJbbb9p9DTmbaP:Ohvxekcjjjj94hvkabav86bRdndnazJbbj:;azJbbj:;9GEgPJbbjZaPJbbjZ9FEJbb;:9cNJbbbZJbbb:;azJbbbb9GEMgP:lJbbb9p9DTmbaP:Ohqxekcjjjj94hqkabaq86b8SdndnaecKtcK91:YJbb;:9c:vax:t:lavcKtcK91:YJbb;:9c:vas:t:laqcKtcK91:YJbb;:9c:vaz:t:lakMMMJbb;:9cNJbbjZMgk:lJbbb9p9DTmbak:Ohexekcjjjj94hekaecFbaecFb9iEhexekabcjjj;8iBdycFbhekabae86b8Vxekab9cb83dbabcyf9cb83dbabcaf9cb83dbabcKf9cb83dbabczf9cb83dbabcwf9cb83dbkaoc:W;aef8Kjjjjbk;Iwwvul99iud99eue99eul998Jjjjjbcje9Rgr8Kjjjjbavcd4hwaicd4hDdndnaoTmbarc;abfcbaocdtgvz:njjjb8Aarc;Gbfcbavz:njjjb8AarhvarcafhiaohqinavcFFF97BdbaicFFF;7rBdbaiclfhiavclfhvaqcufgqmbkdnadTmbcbhkinaeakaD2cdtfgvIdwhxavIdlhmavIdbhPalakaw2cdtfIdbhsarc;abfhzarhiarc;GbfhHarcafhqcj1jjbhvaohOinasavcwfIdbaxNavIdbaPNavclfIdbamNMMgAMhCakhXdnaAas:tgAaqIdbgQ9DgLmbaHydbhXkaHaXBdbakhXdnaCaiIdbgK9EmbazydbhXaKhCkazaXBdbaiaCUdbaqaAaQaLEUdbavcxfhvaqclfhqaHclfhHaiclfhiazclfhzaOcufgOmbkakcefgkad9hmbkkadThkJbbbbhCcbhXarc;abfhvarc;Gbfhicbhqinalavydbgzaw2cdtfIdbalaiydbgHaw2cdtfIdbaeazaD2cdtfgzIdwaeaHaD2cdtfgHIdw:tgsasNazIdbaHIdb:tgsasNazIdlaHIdl:tgsasNMM:rMMgsaCasaC9EgzEhCaqaXazEhXaiclfhiavclfhvaoaqcefgq9hmbkaCJbbbZNhKxekadThkcbhXJbbbbhKkJbbbbhCdnaearc;abfaXcdtgifydbgqaD2cdtfgvIdwaearc;GbfaifydbgzaD2cdtfgiIdwgm:tgsasNavIdbaiIdbgY:tgAaANavIdlaiIdlgP:tgQaQNMM:rgxJbbbb9ETmbaxalaqaw2cdtfIdbMalazaw2cdtfIdb:taxaxM:vhCkasaCNamMhmaQaCNaPMhPaAaCNaYMhYdnakmbaDcdthvawcdthiindnalIdbg8AaecwfIdbam:tgCaCNaeIdbaY:tgsasNaeclfIdbaP:tgAaANMM:rgQMgEaK9ETmbJbbbbhxdnaQJbbbb9ETmbaEaK:taQaQM:vhxkaxaCNamMhmaxaANaPMhPaxasNaYMhYa8AaKaQMMJbbbZNhKkaeavfhealaifhladcufgdmbkkabaKUdxabamUdwabaPUdlabaYUdbarcjef8Kjjjjbkjeeiu8Jjjjjbcj8W9Rgr8Kjjjjbaici2hwdnaiTmbawceawce0EhDarhiinaiaeadRbbcdtfydbBdbadcefhdaiclfhiaDcufgDmbkkabarawaladaoz:hjjjbarcj8Wf8Kjjjjbk:3lequ8JjjjjbcjP9Rgl8Kjjjjbcbhvalcjxfcbaiz:njjjb8AdndnadTmbcjehoaehrincuhwarhDcuhqavhkdninawakaoalcjxfaDcefRbbfRbb9RcFeGci6aoalcjxfaDRbbfRbb9RcFeGci6faoalcjxfaDcdfRbbfRbb9RcFeGci6fgxaq9mgmEhwdnammbaxce0mdkaxaqaxaq9kEhqaDcifhDadakcefgk9hmbkkaeawci2fgDcdfRbbhqaDcefRbbhxaDRbbhkaeavci2fgDcifaDawav9Rci2z:qjjjb8Aakalcjxffaocefgo86bbaxalcjxffao86bbaDcdfaq86bbaDcefax86bbaDak86bbaqalcjxffao86bbarcifhravcefgvad9hmbkalcFeaicetz:njjjbhoadci2gDceaDce0EhqcbhxindnaoaeRbbgkcetfgw8UebgDcu9kmbawax87ebaocjlfaxcdtfabakcdtfydbBdbaxhDaxcefhxkaeaD86bbaecefheaqcufgqmbkaxcdthDxekcbhDkabalcjlfaDz:mjjjb8AalcjPf8Kjjjjbk9teiucbcbyd;C1jjbgeabcifc98GfgbBd;C1jjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik;teeeudndnaeabVciGTmbabhixekdndnadcz9pmbabhixekabhiinaiaeydbBdbaiaeydlBdlaiaeydwBdwaiaeydxBdxaeczfheaiczfhiadc9Wfgdcs0mbkkadcl6mbinaiaeydbBdbaeclfheaiclfhiadc98fgdci0mbkkdnadTmbinaiaeRbb86bbaicefhiaecefheadcufgdmbkkabk:3eedudndnabciGTmbabhixekaecFeGc:b:c:ew2hldndnadcz9pmbabhixekabhiinaialBdxaialBdwaialBdlaialBdbaiczfhiadc9Wfgdcs0mbkkadcl6mbinaialBdbaiclfhiadc98fgdci0mbkkdnadTmbinaiae86bbaicefhiadcufgdmbkkabk9teiucbcbyd;C1jjbgeabcrfc94GfgbBd;C1jjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik9:eiuZbhedndncbyd;C1jjbgdaecztgi9nmbcuheadai9RcFFifcz4nbcuSmekadhekcbabae9Rcifc98Gcbyd;C1jjbfgdBd;C1jjbdnadZbcztge9nmbadae9RcFFifcz4nb8Akk:;Deludndndnadch9pmbabaeSmdaeabadfgi9Rcbadcet9R0mekabaead;8qbbxekaeab7ciGhldndndnabae9pmbdnalTmbadhvabhixikdnabciGmbadhvabhixdkadTmiabaeRbb86bbadcufhvdnabcefgiciGmbaecefhexdkavTmiabaeRbe86beadc9:fhvdnabcdfgiciGmbaecdfhexdkavTmiabaeRbd86bdadc99fhvdnabcifgiciGmbaecifhexdkavTmiabaeRbi86biabclfhiaeclfheadc98fhvxekdnalmbdnaiciGTmbadTmlabadcufgifglaeaifRbb86bbdnalciGmbaihdxekaiTmlabadc9:fgifglaeaifRbb86bbdnalciGmbaihdxekaiTmlabadc99fgifglaeaifRbb86bbdnalciGmbaihdxekaiTmlabadc98fgdfaeadfRbb86bbkadcl6mbdnadc98fgocd4cefciGgiTmbaec98fhlabc98fhvinavadfaladfydbBdbadc98fhdaicufgimbkkaocx6mbaec9Wfhvabc9WfhoinaoadfgicxfavadfglcxfydbBdbaicwfalcwfydbBdbaiclfalclfydbBdbaialydbBdbadc9Wfgdci0mbkkadTmdadhidnadciGglTmbaecufhvabcufhoadhiinaoaifavaifRbb86bbaicufhialcufglmbkkadcl6mdaec98fhlabc98fhvinavaifgecifalaifgdcifRbb86bbaecdfadcdfRbb86bbaecefadcefRbb86bbaeadRbb86bbaic98fgimbxikkavcl6mbdnavc98fglcd4cefcrGgdTmbavadcdt9RhvinaiaeydbBdbaeclfheaiclfhiadcufgdmbkkalc36mbinaiaeydbBdbaiaeydlBdlaiaeydwBdwaiaeydxBdxaiaeydzBdzaiaeydCBdCaiaeydKBdKaiaeyd3Bd3aecafheaicafhiavc9Gfgvci0mbkkavTmbdndnavcrGgdmbavhlxekavc94GhlinaiaeRbb86bbaicefhiaecefheadcufgdmbkkavcw6mbinaiaeRbb86bbaiaeRbe86beaiaeRbd86bdaiaeRbi86biaiaeRbl86blaiaeRbv86bvaiaeRbo86boaiaeRbr86braicwfhiaecwfhealc94fglmbkkabkk9Tdbcjwk9ubbjZbbbbbbbbbbbbbbjZbbbbbbbbbbbbbbjZ86;nAZ86;nAZ86;nAZ86;nA:;86;nAZ86;nAZ86;nAZ86;nA:;86;nAZ86;nAZ86;nAZ86;nA:;bc;uwkxebbbdbbb9GNbb",t=new Uint8Array([32,0,65,2,1,106,34,33,3,128,11,4,13,64,6,253,10,7,15,116,127,5,8,12,40,16,19,54,20,9,27,255,113,17,42,67,24,23,146,148,18,14,22,45,70,69,56,114,101,21,25,63,75,136,108,28,118,29,73,115]);if(typeof WebAssembly!="object")return{supported:!1};var a,s=WebAssembly.instantiate(r(e),{}).then(function(h){a=h.instance,a.exports.__wasm_call_ctors()});function r(h){for(var d=new Uint8Array(h.length),x=0;x<h.length;++x){var p=h.charCodeAt(x);d[x]=p>96?p-97:p>64?p-39:p+4}for(var m=0,x=0;x<h.length;++x)d[m++]=d[x]<60?t[d[x]]:(d[x]-60)*64+d[++x];return d.buffer.slice(0,m)}function n(h){if(!h)throw new Error("Assertion failed")}function i(h){return new Uint8Array(h.buffer,h.byteOffset,h.byteLength)}var o=48,c=16;function l(h,d){var x=h.meshlets[d*4+0],p=h.meshlets[d*4+1],m=h.meshlets[d*4+2],y=h.meshlets[d*4+3];return{vertices:h.vertices.subarray(x,x+m),triangles:h.triangles.subarray(p,p+y*3)}}function f(h,d,x,p,m,y,v){var E=a.exports.sbrk,S=a.exports.meshopt_buildMeshletsBound(h.length,m,y),T=E(S*c),A=E(S*m*4),_=E(S*y*3),R=E(h.byteLength),C=E(d.byteLength),F=new Uint8Array(a.exports.memory.buffer);F.set(i(h),R),F.set(i(d),C);var O=a.exports.meshopt_buildMeshlets(T,A,_,R,h.length,C,x,p,m,y,v);F=new Uint8Array(a.exports.memory.buffer);for(var V=F.subarray(T,T+O*c),$=new Uint32Array(V.buffer,V.byteOffset,V.byteLength/4).slice(),re=0;re<O;++re){var de=$[re*4+0],Ke=$[re*4+1],x=$[re*4+2],be=$[re*4+3];a.exports.meshopt_optimizeMeshlet(A+de*4,_+Ke,be,x)}var Ve=$[(O-1)*4+0],Qe=$[(O-1)*4+1],_e=$[(O-1)*4+2],it=$[(O-1)*4+3],Ze=Ve+_e,It=Qe+(it*3+3&-4),ya={meshlets:$,vertices:new Uint32Array(F.buffer,A,Ze).slice(),triangles:new Uint8Array(F.buffer,_,It*3).slice(),meshletCount:O};return E(T-E(0)),ya}function u(h){var d=new Float32Array(a.exports.memory.buffer,h,o/4);return{centerX:d[0],centerY:d[1],centerZ:d[2],radius:d[3],coneApexX:d[4],coneApexY:d[5],coneApexZ:d[6],coneAxisX:d[7],coneAxisY:d[8],coneAxisZ:d[9],coneCutoff:d[10]}}function g(h,d,x,p){var m=a.exports.sbrk,y=[],v=m(d.byteLength),E=m(h.vertices.byteLength),S=m(h.triangles.byteLength),T=m(o),A=new Uint8Array(a.exports.memory.buffer);A.set(i(d),v),A.set(i(h.vertices),E),A.set(i(h.triangles),S);for(var _=0;_<h.meshletCount;++_){var R=h.meshlets[_*4+0],C=h.meshlets[_*4+0+1],F=h.meshlets[_*4+0+3];a.exports.meshopt_computeMeshletBounds(T,E+R*4,S+C,F,v,x,p),y.push(u(T))}return m(v-m(0)),y}function b(h,d,x,p){var m=a.exports.sbrk,y=m(o),v=m(h.byteLength),E=m(d.byteLength),S=new Uint8Array(a.exports.memory.buffer);S.set(i(h),v),S.set(i(d),E),a.exports.meshopt_computeClusterBounds(y,v,h.length,E,x,p);var T=u(y);return m(y-m(0)),T}return{ready:s,supported:!0,buildMeshlets:function(h,d,x,p,m,y){n(h.length%3==0),n(d instanceof Float32Array),n(d.length%x==0),n(x>=3),n(p<=256||p>0),n(m<=512),n(m%4==0),y=y||0;var v=h.BYTES_PER_ELEMENT==4?h:new Uint32Array(h);return f(v,d,d.length/x,x*4,p,m,y)},computeClusterBounds:function(h,d,x){n(h.length%3==0),n(h.length/3<=512),n(d instanceof Float32Array),n(d.length%x==0),n(x>=3);var p=h.BYTES_PER_ELEMENT==4?h:new Uint32Array(h);return b(p,d,d.length/x,x*4)},computeMeshletBounds:function(h,d,x){return n(h.meshletCount!=0),n(d instanceof Float32Array),n(d.length%x==0),n(x>=3),g(h,d,d.length/x,x*4)},extractMeshlet:function(h,d){return n(d>=0&&d<h.meshletCount),l(h,d)}}})();var Tl=new Zc().registerExtensions([di,ui,fi]).registerDependencies({"meshopt.decoder":fr});async function Qa(e,t={}){await fr.ready;let a;if(t.fetchBytes)a=new Uint8Array(await t.fetchBytes(e));else{let c=await fetch(e,{cache:t.fetchCache||"no-store"});if(!c.ok)throw new Error(`Failed to load ${e}: ${c.status}`);a=new Uint8Array(await c.arrayBuffer())}let s=await Tl.readBinary(a),r=[],n=t.componentFeatures||new Map,i=new Map;function o(c,l=""){let f=n.has(c.getName());f&&i.set(c.getName(),(i.get(c.getName())||0)+1);let u=f?c.getName():l,g=c.getMesh();if(g){let b=c.getWorldMatrix();for(let h of g.listPrimitives()){let d=h.getAttribute("POSITION"),x=h.getAttribute("NORMAL"),p=h.getAttribute("_FEATURE_ID_0"),m=h.getAttribute("_FEATURE_ID_1"),y=h.getIndices()?.getArray();if(!d||!y)continue;let v=d.getCount(),E=new Float32Array(v*3),S=new Float32Array(v*3),T=new Uint32Array(v),A=new Uint32Array(v),_=[1/0,1/0,1/0,-1/0,-1/0,-1/0],R=[],C=n.get(u)?.featureId||t.defaultFeatureId||0;for(let O=0;O<v;O+=1)d.getElement(O,R),M0(E,O*3,R,b),_[0]=Math.min(_[0],E[O*3]),_[1]=Math.min(_[1],E[O*3+1]),_[2]=Math.min(_[2],E[O*3+2]),_[3]=Math.max(_[3],E[O*3]),_[4]=Math.max(_[4],E[O*3+1]),_[5]=Math.max(_[5],E[O*3+2]),x?(x.getElement(O,R),k0(S,O*3,R,b)):S.set([0,0,1],O*3),T[O]=Number(p?.getScalar(O)||0),A[O]=Number(m?m.getScalar(O)||0:C);let F=h.getMaterial();r.push({position:E,normal:S,netId:T,objectFeatureId:A,indices:y,designator:u,nodeName:c.getName(),meshName:g.getName(),bounds:_,material:F?{name:F.getName(),baseColor:F.getBaseColorFactor(),metallic:F.getMetallicFactor(),roughness:F.getRoughnessFactor(),emissive:F.getEmissiveFactor()}:{baseColor:t.baseColor||[.55,.58,.64,1],metallic:.05,roughness:.72,emissive:[0,0,0]}})}}for(let b of c.listChildren())o(b,u)}for(let c of s.getRoot().listScenes())for(let l of c.listChildren())o(l);return{byteLength:a.byteLength,primitives:r,componentNodeCounts:i}}function M0(e,t,a,s){let r=s[0]*a[0]+s[4]*a[1]+s[8]*a[2]+s[12],n=s[1]*a[0]+s[5]*a[1]+s[9]*a[2]+s[13],i=s[2]*a[0]+s[6]*a[1]+s[10]*a[2]+s[14];e[t]=r,e[t+1]=-i,e[t+2]=n}function k0(e,t,a,s){let r=s[0]*a[0]+s[4]*a[1]+s[8]*a[2],n=s[1]*a[0]+s[5]*a[1]+s[9]*a[2],i=s[2]*a[0]+s[6]*a[1]+s[10]*a[2],o=Math.hypot(r,n,i)||1;e[t]=r/o,e[t+1]=-i/o,e[t+2]=n/o}async function Il(e,t={}){await fr.ready;let a;if(t.fetchBytes)a=new Uint8Array(await t.fetchBytes(e));else{let u=await fetch(e,{cache:t.fetchCache||"no-store"});if(!u.ok)throw new Error(`Failed to load ${e}: ${u.status}`);a=new Uint8Array(await u.arrayBuffer())}let s=await Tl.readBinary(a),r=t.componentFeatures||new Map,n=new Map,i=new Map,o=new Map,c=0;function l(u){if(o.has(u))return o.get(u);let g=u.getAttribute("POSITION"),b=u.getIndices()?.getArray();if(!g||!b)return o.set(u,null),null;let h=u.getAttribute("NORMAL"),d=u.getAttribute("_FEATURE_ID_0"),x=u.getAttribute("_FEATURE_ID_1"),p=g.getCount(),m=new Float32Array(p*3),y=new Float32Array(p*3),v=new Uint32Array(p),E=new Uint32Array(p),S=[];for(let C=0;C<p;C+=1)g.getElement(C,S),m.set(S.slice(0,3),C*3),h?(h.getElement(C,S),y.set(S.slice(0,3),C*3)):y.set([0,1,0],C*3),v[C]=Number(d?.getScalar(C)||0),E[C]=Number(x?.getScalar(C)||0);let T=T0(u.getMaterial(),t),A=[Ja(m),Ja(y),Ja(v),Ja(E),Ja(b),p,b.length,JSON.stringify(T)].join(":"),_=i.get(A),R=_;return(!_||!I0(_.primitive,m,y,v,E,b))&&(R={primitive:{position:m,normal:y,netId:v,objectFeatureId:E,indices:Uint32Array.from(b),material:T,bounds:null},placements:[]},i.set(_?`${A}:${i.size}`:A,R)),o.set(u,R),R}function f(u,g=""){let b=r.has(u.getName());b&&n.set(u.getName(),(n.get(u.getName())||0)+1);let h=b?u.getName():g,d=u.getMesh();if(d){let x=E0(u.getWorldMatrix()),p=Number(r.get(h)?.featureId||t.defaultFeatureId||0),m=c++;for(let y of d.listPrimitives()){let v=l(y);if(!v)continue;let E=S0(v.primitive.position,x);v.placements.push({rows:x,featureId:p,designator:h,bounds:E,node:m});let S=v.primitive.bounds;v.primitive.bounds=S?[Math.min(S[0],E[0]),Math.min(S[1],E[1]),Math.min(S[2],E[2]),Math.max(S[3],E[3]),Math.max(S[4],E[4]),Math.max(S[5],E[5])]:[...E]}}for(let x of u.listChildren())f(x,h)}for(let u of s.getRoot().listScenes())for(let g of u.listChildren())f(g);return{byteLength:a.byteLength,models:[...i.values()],componentNodeCounts:n}}function E0(e){return[e[0],e[4],e[8],e[12],-e[2],-e[6],-e[10],-e[14],e[1],e[5],e[9],e[13]]}function S0(e,t){let a=[1/0,1/0,1/0,-1/0,-1/0,-1/0];for(let s=0;s<e.length;s+=3){let r=e[s],n=e[s+1],i=e[s+2];for(let o=0;o<3;o+=1){let c=o*4,l=t[c]*r+t[c+1]*n+t[c+2]*i+t[c+3];l<a[o]&&(a[o]=l),l>a[o+3]&&(a[o+3]=l)}}return a}function T0(e,t){return e?{name:e.getName(),baseColor:e.getBaseColorFactor(),metallic:e.getMetallicFactor(),roughness:e.getRoughnessFactor(),emissive:e.getEmissiveFactor()}:{baseColor:t.baseColor||[.55,.58,.64,1],metallic:.05,roughness:.72,emissive:[0,0,0]}}function Ja(e){let t=e.BYTES_PER_ELEMENT===4?new Uint32Array(e.buffer,e.byteOffset,e.length):e,a=2166136261;for(let s=0;s<t.length;s+=1)a^=t[s],a=Math.imul(a,16777619)>>>0;return a.toString(36)}function I0(e,t,a,s,r,n){let i=(o,c)=>o.length===c.length&&o.every((l,f)=>l===c[f]);return i(e.position,t)&&i(e.normal,a)&&i(e.netId,s)&&i(e.objectFeatureId,r)&&i(e.indices,n)}var ia=Object.freeze({mm:1,fineMm:.1,deg:15,fineDeg:1}),hi=Object.freeze([[1,0,0],[0,1,0],[0,0,1]]);function Al(e){return Math.round(e*1e9)/1e9+0}function $t(e){let t=Math.hypot(...e.rotation)||1,a=e.rotation.map(r=>r/t),s=[a[3],a[0],a[1],a[2]].find(r=>Math.abs(r)>1e-12)??1;return{translationMm:e.translationMm.map(Al),rotation:a.map(r=>Al(s<0?-r:r))}}function A0(e){let[t,a,s,r]=e.rotation,[n,i,o]=e.translationMm;return[1-2*(a*a+s*s),2*(t*a+s*r),2*(t*s-a*r),0,2*(t*a-s*r),1-2*(t*t+s*s),2*(a*s+t*r),0,2*(t*s+a*r),2*(a*s-t*r),1-2*(t*t+a*a),0,n,i,o,1]}function _l(e,t){let a=new Array(16);for(let s=0;s<4;s+=1)for(let r=0;r<4;r+=1)a[s*4+r]=e[r]*t[s*4]+e[4+r]*t[s*4+1]+e[8+r]*t[s*4+2]+e[12+r]*t[s*4+3];return a}function _0(e){let t=[e[0],e[4],e[8],0,e[1],e[5],e[9],0,e[2],e[6],e[10],0,0,0,0,1];for(let a=0;a<3;a+=1)t[12+a]=-(t[a]*e[12]+t[4+a]*e[13]+t[8+a]*e[14]);return t}function hr(e,t){return t>0?Math.round(e/t)*t:e}function bi(e,t){let a=t[0]**2+t[1]**2;return a<1e-9?0:(e[0]*t[0]+e[1]*t[1])/a}function Rl(e,t,a){let s=Math.atan2(t[1]-e[1],t[0]-e[0]),n=Math.atan2(a[1]-e[1],a[0]-e[0])-s;for(;n>Math.PI;)n-=2*Math.PI;for(;n<-Math.PI;)n+=2*Math.PI;return n}function Nl(e,t,a){return et(e,t)>=0?-a:a}function Cl(e){return hi.map(t=>Vn(e.rotation,t))}function Bl(e,t,a){return{translationMm:e.translationMm.map((s,r)=>s+t[r]*a),rotation:[...e.rotation]}}function Fl(e,t,a,s){let r=sc(t,a),n=e.translationMm.map((o,c)=>o-s[c]);return{translationMm:Vn(r,n).map((o,c)=>o+s[c]),rotation:Ks(r,e.rotation)}}function Ol(e,t){if(t==null)return null;let a=`/${String(t).split("/")[1]||""}`;return(e?.occurrences||[]).find(s=>s.path===a&&s.depth===1)??null}function Pl(e,t,a){let s=e.occurrences.find(o=>o.path===t);if(!s||s.depth!==1)return e;let r=A0(a),n=_l(r,_0(s.worldMatrix)),i=`${t}/`;return{...e,occurrences:e.occurrences.map(o=>o.path===t?{...o,pose:{...$t(a),source:"manual"},worldMatrix:r}:o.path.startsWith(i)?{...o,worldMatrix:_l(n,o.worldMatrix)}:o)}}function jl(e){let t=Math.abs(e[0])<.9?[1,0,0]:[0,1,0];return He(qe(e,t))}var R0=Object.freeze([0,1,1,0]),Za=`
struct Occurrence {
  model: mat4x4f,
  normal: mat4x4f,
  hiddenLayers: vec4u,
  explode: vec4f,
};
@group(0) @binding(2) var<storage, read> layerOffsets: array<f32>;
@group(0) @binding(5) var<storage, read> occurrences: array<Occurrence>;
// The cull pass (SB2-25) lists the occurrences to draw, interleaved by level of
// detail: slot * 4 + list. Components draw for LIST_FULL; copper, barrels,
// silkscreen and paste for LIST_BOARD (full or board); substrate and mask for
// LIST_BODY (full, board or body); the stand-in box for LIST_BOX.
@group(0) @binding(7) var<storage, read> visibleOccurrences: array<u32>;
const LIST_FULL = 0u;
const LIST_BOARD = 1u;
const LIST_BODY = 2u;
const LIST_BOX = 3u;
fn listedOccurrence(list: u32, instance: u32) -> u32 { return visibleOccurrences[instance * 4u + list]; }
// draw.offset.w is the draw's layer id + 1 for copper and paste (0: no layer).
// A draw this occurrence's separation removes: components once exploded, paste whenever separated.
fn explodeHides(occurrence: Occurrence, kind: f32, layerPlusOne: f32) -> bool {
  let explode = occurrence.explode;
  if (explode.w < 0.5) { return false; }
  if (kind > 1.5 && kind < 2.5 && explode.y < 0.5) { return true; }
  return kind < 0.5 && layerPlusOne > 0.5 && explode.x > 0.0;
}
// How far this occurrence lifts a copper or paste draw's layer (0: the draw's own offset stands).
fn explodeLift(occurrence: Occurrence, layerPlusOne: f32) -> f32 {
  if (occurrence.explode.w < 0.5 || layerPlusOne < 0.5) { return 0.0; }
  return layerOffsets[u32(layerPlusOne + 0.5) - 1u] * occurrence.explode.x;
}
fn layerHiddenAt(occurrence: Occurrence, layerPlusOne: f32) -> bool {
  if (layerPlusOne < 0.5) { return false; }
  let layer = u32(layerPlusOne + 0.5) - 1u;
  if (layer >= 128u) { return false; }
  return (occurrence.hiddenLayers[layer / 32u] & (1u << (layer % 32u))) != 0u;
}
`,Yt=Object.freeze([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function N0(e){let t=e?.matrix??e;if(!t||typeof t.length!="number"||t.length!==16)throw new TypeError("An occurrence matrix must have 16 numbers (column-major)");let a=Array.from(t,Number);if(!a.every(Number.isFinite))throw new TypeError("An occurrence matrix must be finite");if(a[3]!==0||a[7]!==0||a[11]!==0||a[15]!==1)throw new TypeError("An occurrence matrix must be affine (last row 0 0 0 1)");return a}function C0(e){let[t,a,s,,r,n,i,,o,c,l]=e,f=n*l-c*i,u=c*s-a*l,g=a*i-n*s,b=o*i-r*l,h=t*l-o*s,d=r*s-t*i,x=r*c-o*n,p=o*a-t*c,m=t*n-r*a,y=t*f+r*u+o*g;if(y===0)throw new TypeError("An occurrence matrix must be invertible");let v=y<0?-1:1;return[v*f,v*b,v*x,0,v*u,v*h,v*p,0,v*g,v*d,v*m,0,0,0,0,1]}function B0(e){let t=new Uint32Array(4);for(let a of e||[]){let s=Number(a);!Number.isInteger(s)||s<0||s>=128||(t[s>>>5]|=1<<(s&31)>>>0)}return t}function br(e,t=[],a=[]){let s=new Float32Array(Math.max(1,e.length)*40),r=new Uint32Array(s.buffer);return e.forEach((n,i)=>{let o=i*40;s.set(n,o),s.set(C0(n),o+16),t[i]&&r.set(B0(t[i]),o+32),s.set(a[i]||R0,o+36)}),s}function pr(e,t){let[a,s,r]=t;return[e[0]*a+e[4]*s+e[8]*r+e[12],e[1]*a+e[5]*s+e[9]*r+e[13],e[2]*a+e[6]*s+e[10]*r+e[14]]}function yt(e,t){if(!t)return null;let a=[1/0,1/0,1/0,-1/0,-1/0,-1/0];for(let s=0;s<8;s+=1){let r=pr(e,[t[s&1?3:0],t[s&2?4:1],t[s&4?5:2]]);for(let n=0;n<3;n+=1)a[n]=Math.min(a[n],r[n]),a[n+3]=Math.max(a[n+3],r[n])}return a}function gr(e){return e.every((t,a)=>t===Yt[a])}var F0=0,O0=4294901759;function Ll(e,t){let a=e>>>0,s=t>>>0;return a===F0?{kind:"none",occurrenceIndex:-1,featureId:0}:{kind:s?"feature":"board",occurrenceIndex:a-1,featureId:s}}function Dl(e){let t=Array.from(e);if(t.length>O0)throw new RangeError("Too many occurrences for the pick target");let a=t.map(N0),s=o=>o&&!Array.isArray(o)&&!ArrayBuffer.isView(o),r=t.map((o,c)=>s(o)&&o.key!=null?String(o.key):String(c));if(new Set(r).size!==r.length)throw new TypeError("Occurrence keys must be unique");let n=t.map(o=>s(o)&&o.hiddenLayers?[...o.hiddenLayers].map(Number):[]),i=t.map(o=>s(o)&&o.explode?[...o.explode].map(Number):null);return{matrices:a,keys:r,hiddenLayers:n,explode:i}}function es(e,t,a){let[s,r,n]=t,i=e[0]*s+e[4]*r+e[8]*n+e[12],o=e[1]*s+e[5]*r+e[9]*n+e[13],c=e[2]*s+e[6]*r+e[10]*n+e[14],l=e[3]*s+e[7]*r+e[11]*n+e[15];return!(l>0)||c<0||c>l?null:{x:a.x+(i/l*.5+.5)*a.width,y:a.y+(.5-o/l*.5)*a.height}}var mr=0;var Ul=3,pi=4,sS=Object.freeze(["full","board","body","box"]),st=Object.freeze({fullPx:140,boardPx:70,boxPx:18,keep:.8});function Ma(e={}){let t=(i,o)=>Number.isFinite(Number(e[i]))?Math.max(0,Number(e[i])):o,a=t("boxPx",st.boxPx),s=Math.max(a,t("boardPx",st.boardPx)),r=Math.max(s,t("fullPx",st.fullPx)),n=Math.min(1,Math.max(.05,t("keep",st.keep)));return{fullPx:r,boardPx:s,boxPx:a,keep:n}}function zl(e){let t=c=>[e[c],e[4+c],e[8+c],e[12+c]],[a,s,r,n]=[t(0),t(1),t(2),t(3)],i=(c,l)=>c.map((f,u)=>f+l[u]),o=(c,l)=>c.map((f,u)=>f-l[u]);return[i(n,a),o(n,a),i(n,s),o(n,s),r,o(n,r)]}var ts=class{constructor(t,a,s,r=16777216){this.device=t,this.usage=a|Gl.COPY_SRC|Gl.COPY_DST,this.label=s,this.chunkBytes=r,this.chunks=[],this.usedBytes=0,this.generation=0,this.repacks=0}alloc(t){let s={buffer:null,offset:0,size:Math.max(4,Math.ceil(t/4)*4),chunk:null};return this.place(s,null),s}place(t,a){let{size:s}=t,r=null;if(s<=this.chunkBytes/2)for(let o of this.chunks)o===a||o.dedicated||o.free.forEach((c,l)=>{c.size>=s&&(!r||c.size<r.range.size)&&(r={chunk:o,index:l,range:c})});let n,i;if(r)({chunk:n}=r),i=r.range.offset,r.range.size===s?n.free.splice(r.index,1):n.free[r.index]={offset:i+s,size:r.range.size-s};else{let o=s>this.chunkBytes/2,c=o?s:this.chunkBytes;n={buffer:this.device.createBuffer({label:`${this.label}-${this.chunks.length}`,size:c,usage:this.usage}),size:c,free:c>s?[{offset:s,size:c-s}]:[],used:0,live:new Set,dedicated:o},this.chunks.push(n),i=0}n.used+=s,n.live.add(t),this.usedBytes+=s,Object.assign(t,{buffer:n.buffer,offset:i,chunk:n})}write(t,a){this.device.queue.writeBuffer(t.buffer,t.offset,a)}free(t){let{chunk:a}=t;if(!(!a||!a.live.has(t))){if(this.release(a,t),t.chunk=null,!a.live.size){this.drop(a);return}!a.dedicated&&a.used<a.size*.5&&this.chunks.length>1&&this.repack(a)}}release(t,a){t.used-=a.size,t.live.delete(a),this.usedBytes-=a.size;let s=t.free,r=s.findIndex(n=>n.offset>a.offset);r<0&&(r=s.length),s.splice(r,0,{offset:a.offset,size:a.size}),r+1<s.length&&s[r].offset+s[r].size===s[r+1].offset&&(s[r].size+=s[r+1].size,s.splice(r+1,1)),r>0&&s[r-1].offset+s[r-1].size===s[r].offset&&(s[r-1].size+=s[r].size,s.splice(r,1))}drop(t){t.buffer.destroy?.(),this.chunks.splice(this.chunks.indexOf(t),1)}repack(t){let a=this.device.createCommandEncoder({label:`${this.label}-repack`});for(let s of[...t.live]){let r={buffer:s.buffer,offset:s.offset};this.release(t,s),this.place(s,t),a.copyBufferToBuffer(r.buffer,r.offset,s.buffer,s.offset,s.size)}this.device.queue.submit([a.finish()]),this.drop(t),this.generation+=1,this.repacks+=1}reservedBytes(){return this.chunks.reduce((t,a)=>t+a.size,0)}destroy(){for(let t of this.chunks)t.buffer.destroy?.();this.chunks=[],this.usedBytes=0}},Gl=globalThis.GPUBufferUsage||{COPY_SRC:4,COPY_DST:8};var gi=Object.freeze(["decl","vs-out","vs-end","fs-begin","fs-return"]),P0={decl:"decl","vs-out":"vsOut","vs-end":"vsEnd","fs-begin":"fsBegin"},j0=/^[ \t]*\/\/ @feature:[a-z-]+\n/gm;function ie(e){if(!gi.includes(e))throw new Error(`Unknown shader hook ${e}`);return`// @feature:${e}
`}function Te(e){return e.replace(j0,"")}function mi(e){return as(e).map(t=>t.name).join("+")}function as(e=[]){let t=new Set;for(let a of e){if(!a?.name||!/^[a-z][a-z0-9-]*$/.test(a.name))throw new Error(`Bad shader feature name ${a?.name}`);if(t.has(a.name))throw new Error(`Shader feature ${a.name} given twice`);t.add(a.name)}return[...e].sort((a,s)=>a.name<s.name?-1:a.name>s.name?1:0)}function L0(e,t="shader"){for(let a of gi){let s=yi(e,a).length;if(s!==1)throw new Error(`${t}: hook ${a} appears ${s} times, expected once`)}Vl(e,t)}function Kl(e,t=[],a={}){let s=as(t);if(!s.length)return Te(e);let r=`${a.family||"shader"}${a.instanced?" (instanced)":""}`;L0(e,r);let n=e;for(let i of gi){if(i==="fs-return"){let{start:u,end:g,indent:b,expression:h}=Vl(n,r),d=s.reduce((x,p)=>p.fsReturn?p.fsReturn(x,a):x,h);n=`${n.slice(0,u)}${b}return ${d};
${n.slice(g)}`;continue}let o=P0[i],c=s.map(u=>u[o]?.(a)).filter(Boolean),[l]=yi(n,i),f=c.map(u=>u.endsWith(`
`)?u:`${u}
`).join("");n=`${n.slice(0,l.index)}${f}${n.slice(l.index+l[0].length)}`}return Te(n)}function yi(e,t){return[...e.matchAll(new RegExp(`^[ \\t]*// @feature:${t}\\n`,"gm"))]}function Vl(e,t){let[a]=yi(e,"fs-return"),s=a.index+a[0].length,r=e.slice(s).match(/^([ \t]*)return (.+);\n/);if(!r)throw new Error(`${t}: hook fs-return is not followed by a return line`);return{start:a.index,end:s+r[0].length,indent:r[1],expression:r[2]}}var xi=`
fn featureHidden(id: u32) -> bool {
  return id < arrayLength(&hiddenMask) && hiddenMask[id] == 0u;
}
`;function yr(e){let t=new Set;if(e==null)return t;for(let a of e){let s=Number(a);!Number.isInteger(s)||s<=0||s>4294967295||t.add(s)}return t}function Hl(e,t=0){let a=0;for(let n of yr(e))a=Math.max(a,n);let s=64,r=a+1;for(;s<r;)s*=2;return Math.max(s,Math.floor(t)||0)}function ql(e,t){let a=Math.max(64,Math.floor(t)||0),s=new Uint32Array(a);s.fill(1);for(let r of yr(e))r<a&&(s[r]=0);return s}function D0(e){let t=Number(e.drillWidthMm)||0,a=Number(e.drillHeightMm)||t,s=Math.min(t,a),r=Math.min(Number(e.outerWidthMm)||0,Number(e.outerHeightMm)||0),n=Number.isFinite(e.platingThicknessMm)?e.platingThicknessMm:Math.max(0,(r-s)/2),i=(Number(e.rotationDeg)||0)*Math.PI/180+(a>t?Math.PI/2:0);return{x:e.centerMm[0]/1e3,y:-e.centerMm[1]/1e3,drillRadius:s/2e3,outerRadius:(s/2+n)/1e3,halfLength:Math.abs(t-a)/2e3,angle:Math.abs(t-a)>0?-i:0,startZ:e.startZMm/1e3,endZ:e.endZMm/1e3,netId:e.netId||0,objectId:e.objectFeatureId||0,startLayerId:e.startLayerId||0,endLayerId:e.endLayerId||0}}function Mi(e,t){let a=new Map((t||[]).map(s=>[Number(s.id),Number(s.thickness_mm)||0]));return(e||[]).map(s=>{let r=i=>Math.max(0,(a.get(Number(i))||0)/2-.001),n=s.startZMm>=s.endZMm?1:-1;return{...s,startZMm:s.startZMm+n*r(s.startLayerId),endZMm:s.endZMm-n*r(s.endLayerId)}})}var ss=0,wi=16,vi=24,rs=32,Wl=48,Xl=Object.freeze({arrayStride:Wl,stepMode:"instance",attributes:Object.freeze([Object.freeze({shaderLocation:3,offset:ss,format:"float32x4"}),Object.freeze({shaderLocation:4,offset:wi,format:"float32x2"}),Object.freeze({shaderLocation:6,offset:vi,format:"float32x2"}),Object.freeze({shaderLocation:5,offset:rs,format:"uint32x4"})])}),ki=48,xr=`struct Input {
  @location(0) unit: vec3f,
  @location(1) normal: vec3f,
  @location(2) radiusMix: f32,
  @location(3) dimensions: vec4f,
  @location(4) span: vec2f,
  @location(5) ids: vec4u,
  @location(6) shape: vec2f,
};`,$l=`struct Barrel {
  dimensions: vec4f,
  span: vec2f,
  shape: vec2f,
  ids: vec4u,
};
@group(0) @binding(6) var<storage, read> barrels: array<Barrel>;`;function Yl(e,t,a){let s=new ArrayBuffer(Math.max(a,e.length)*t),r=new DataView(s);return e.forEach((n,i)=>{let o=i*t,c=D0(n);r.setFloat32(o+ss,c.x,!0),r.setFloat32(o+ss+4,c.y,!0),r.setFloat32(o+ss+8,c.drillRadius,!0),r.setFloat32(o+ss+12,c.outerRadius,!0),r.setFloat32(o+wi,c.startZ,!0),r.setFloat32(o+wi+4,c.endZ,!0),r.setFloat32(o+vi,c.halfLength,!0),r.setFloat32(o+vi+4,c.angle,!0),r.setUint32(o+rs,c.netId,!0),r.setUint32(o+rs+4,c.objectId,!0),r.setUint32(o+rs+8,c.startLayerId,!0),r.setUint32(o+rs+12,c.endLayerId,!0)}),s}function Jl(e){return Yl(e,Wl,0)}function Ql(e){return Yl(e,ki,1)}var Zl=`fn viridis(t: f32) -> vec3f {
  let c0 = vec3f(0.2777273272234177, 0.005407344544966578, 0.3340998053353061);
  let c1 = vec3f(0.1050930431085774, 1.404613529898575, 1.384590162594685);
  let c2 = vec3f(-0.3308618287255563, 0.214847559468213, 0.09509516302823659);
  let c3 = vec3f(-4.634230498983486, -5.799100973351585, -19.33244095627987);
  let c4 = vec3f(6.228269936347081, 14.17993336680509, 56.69055260068105);
  let c5 = vec3f(4.776384997670288, -13.74514537774601, -65.35303263337234);
  let c6 = vec3f(-5.435455855934631, 4.645852612178535, 26.3124352495832);
  let x = clamp(t, 0.0, 1.0);
  return c0 + x * (c1 + x * (c2 + x * (c3 + x * (c4 + x * (c5 + x * c6)))));
}
`,ed=`
struct Globals {
  viewProjection: mat4x4f,
  activeNet: u32,
  selectedLayer: u32,
  time: f32,
  hasHighlight: f32,
  selectedFeature: u32,
  padding0: u32,
  padding1: u32,
  padding2: u32,
  lightDirection: vec4f,
};
struct Slice {
  color: vec4f,
  z: f32,
  overlay: u32,
  fieldOn: u32,
  // 1: copper off the lit nets is not drawn (net isolation, or inner copper
  // shown only where lit); 2: the layer is copper (it glows with its nets).
  netMode: u32,
  fieldOrigin: vec2f,
  fieldPitch: f32,
  padding1: f32,
  fieldSize: vec2u,
  padding2: vec2u,
  range: vec2f,
  padding3: vec2f,
  clearBounds: vec4f,
  // The layer's material: metallic, roughness, the face normal's z, and 1
  // for copper (which dims while a net is lit).
  material: vec4f,
  // The slab's bottom and top heights (world metres, exploded offset in).
  slab: vec2f,
  // How many of the slice's shapes subtract (they come first).
  subtracts: u32,
  // Millimetres the shapes grow by (a conformal coat's footprint), else 0.
  dilate: f32,
  // The camera in homogeneous world coordinates: a point (w = 1) for a
  // perspective view, the view direction (w = 0) for an orthographic one.
  eye: vec4f,
};
@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<uniform> slice: Slice;
@group(0) @binding(2) var<storage, read> shapes: array<u32>;
@group(0) @binding(3) var<storage, read> covers: array<u32>;
@group(0) @binding(4) var<storage, read> values: array<f32>;
@group(0) @binding(5) var field: texture_2d<f32>;
@group(0) @binding(6) var<storage, read> nets: array<u32>;
@group(0) @binding(7) var<storage, read> netMask: array<u32>;
@group(0) @binding(8) var<storage, read> edges: array<u32>;
// Per add shape a (first, count) range of hole records, then the records.
@group(0) @binding(9) var<storage, read> cuts: array<u32>;

const SHAPE_WORDS = 20u;
const COVER_WORDS = 6u;
const EDGE_WORDS = 7u;
const EDGE_SKIRT = 1073741824u;
const PICK_TAG = ${2147483648}u;
const TAU = 6.283185307179586;

const ABSENT = 3e38;
fn present(value: f32) -> bool { return value < 1e38; }
fn word(record: u32, index: u32) -> u32 { return shapes[record * SHAPE_WORDS + index]; }
fn fword(record: u32, index: u32) -> f32 { return bitcast<f32>(word(record, index)); }
fn coverWord(record: u32, index: u32) -> u32 { return covers[record * COVER_WORDS + index]; }

// Two triangles over the unit square.
fn corner(index: u32) -> vec2f {
  var corners = array<vec2f, 6>(vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0));
  return corners[index];
}

// Board millimetres (KiCad frame, Y down) to clip space; the viewer's world
// is metres with Y up.
fn clip(board: vec2f) -> vec4f {
  return globals.viewProjection * vec4f(board.x * 0.001, -board.y * 0.001, slice.z, 1.0);
}

fn sdBox(p: vec2f, half: vec2f) -> f32 {
  let d = abs(p) - half;
  return length(max(d, vec2f(0.0))) + min(max(d.x, d.y), 0.0);
}

fn sdSegment(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-12), 0.0, 1.0);
  return length(pa - ba * h);
}

fn sdFlatSegment(p: vec2f, a: vec2f, b: vec2f, half: f32) -> f32 {
  let span = b - a;
  let len = length(span);
  let along = span / max(len, 1e-12);
  let q = p - (a + b) * 0.5;
  return sdBox(vec2f(dot(q, along), dot(q, vec2f(-along.y, along.x))), vec2f(len * 0.5, half));
}

// KiCad pad corners: top left 1, top right 2, bottom left 4, bottom right 8 (Y down).
fn sdPadBox(p: vec2f, half: vec2f, radius: f32, chamfer: f32, corners: u32) -> f32 {
  let left = p.x < 0.0;
  let top = p.y < 0.0;
  let bit = select(select(8u, 4u, left), select(2u, 1u, left), top);
  let a = abs(p);
  if ((corners & bit) != 0u && chamfer > 0.0) {
    let cut = (a.x + a.y - (half.x + half.y - chamfer)) * 0.7071067811865476;
    return max(sdBox(p, half), cut);
  }
  let r = min(radius, min(half.x, half.y));
  let d = a - half + vec2f(r);
  return length(max(d, vec2f(0.0))) + min(max(d.x, d.y), 0.0) - r;
}

fn sdQuad(p: vec2f, v: array<vec2f, 4>) -> f32 {
  var d = dot(p - v[0], p - v[0]);
  var s = 1.0;
  for (var i = 0u; i < 4u; i = i + 1u) {
    let j = (i + 3u) % 4u;
    let e = v[j] - v[i];
    let w = p - v[i];
    let b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    d = min(d, dot(b, b));
    let c = vec3<bool>((p.y >= v[i].y), (p.y < v[j].y), (e.x * w.y > e.y * w.x));
    if (all(c) || all(!c)) { s = -s; }
  }
  return s * sqrt(d);
}

fn sdArc(p: vec2f, center: vec2f, radius: f32, start: f32, sweep: f32, half: f32) -> f32 {
  let q = p - center;
  let angle = atan2(q.y, q.x);
  var t = select(start - angle, angle - start, sweep >= 0.0);
  t = t - TAU * floor(t / TAU);
  if (t <= abs(sweep)) {
    return abs(length(q) - radius) - half;
  }
  let a = center + radius * vec2f(cos(start), sin(start));
  let b = center + radius * vec2f(cos(start + sweep), sin(start + sweep));
  return min(length(p - a), length(p - b)) - half;
}

fn shapeDistance(r: u32, p: vec2f) -> f32 {
  let kind = word(r, 0u);
  let a = vec2f(fword(r, 14u), fword(r, 15u));
  let b = vec2f(fword(r, 16u), fword(r, 17u));
  let c = fword(r, 18u);
  let d = fword(r, 19u);
  var distance = 1e30;
  switch kind {
    case 1u: {
      let length_ = length(p - a);
      distance = length_ - b.x;
      if (b.y > 0.0) { distance = max(distance, b.y - length_); }
    }
    case 2u: {
      distance = sdPadBox(p - a, b, c, d, (word(r, 2u) >> 8u) & 15u);
    }
    case 3u: {
      let q = p - a;
      let v = array<vec2f, 4>(
        vec2f(-b.x + d, -b.y - c), vec2f(b.x - d, -b.y + c),
        vec2f(b.x + d, b.y - c), vec2f(-b.x - d, b.y + c));
      distance = sdQuad(q, v);
    }
    case 4u: { distance = sdSegment(p, a, b) - c; }
    case 5u: { distance = sdFlatSegment(p, a, b, c); }
    case 6u: { distance = sdArc(p, a, b.x, b.y, c, d); }
    default: {}
  }
  return distance - fword(r, 3u);
}

${Zl}
fn normalized(value: f32) -> f32 {
  let span = slice.range.y - slice.range.x;
  return select(0.5, (value - slice.range.x) / span, abs(span) > 1e-30);
}

fn fieldAt(texel: vec2i) -> f32 {
  let size = vec2i(slice.fieldSize);
  if (any(texel < vec2i(0)) || any(texel >= size)) { return ABSENT; }
  return textureLoad(field, texel, 0).r;
}

// Bilinear inside the raster; nearest where a neighbour holds no value.
fn sampleField(board: vec2f) -> f32 {
  let uv = (board - slice.fieldOrigin) / slice.fieldPitch - vec2f(0.5);
  let base = vec2i(floor(uv));
  let f = fract(uv);
  let s00 = fieldAt(base);
  let s10 = fieldAt(base + vec2i(1, 0));
  let s01 = fieldAt(base + vec2i(0, 1));
  let s11 = fieldAt(base + vec2i(1, 1));
  if (present(s00) && present(s10) && present(s01) && present(s11)) {
    return mix(mix(s00, s10, f.x), mix(s01, s11, f.x), f.y);
  }
  return fieldAt(vec2i(floor(uv + vec2f(0.5))));
}

fn aces(color: vec3f) -> vec3f {
  return clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), vec3f(0.0), vec3f(1.0));
}

fn netOf(operation: u32) -> u32 {
  return select(0u, nets[operation], operation < arrayLength(&nets));
}
// A net is lit when it is the active one or emphasised (the mesh's rule).
fn netLit(net: u32) -> bool {
  let emphasised = net != 0u && net < arrayLength(&netMask) && netMask[net] != 0u;
  return emphasised || (globals.activeNet != 0u && net == globals.activeNet);
}
fn copperSlice() -> bool { return (slice.netMode & 2u) != 0u; }
// Whether this operation's copper is hidden because its net is not lit.
fn netHidden(operation: u32) -> bool {
  return copperSlice() && (slice.netMode & 1u) != 0u && !netLit(netOf(operation));
}

fn faceNormal() -> vec3f { return vec3f(0.0, 0.0, slice.material.z); }

fn shade(operation: u32, board: vec2f) -> vec4f {
  return shadeNormal(operation, board, faceNormal());
}

// As \`shade\`, for a surface of world normal \`normal\` (a slab's side wall).
fn shadeNormal(operation: u32, board: vec2f, normal: vec3f) -> vec4f {
  if (copperSlice() && netLit(netOf(operation))) {
    // A lit net glows, pulsing, as the mesh copper does.
    let pulse = 0.88 + 0.12 * sin(globals.time * 3.2);
    return vec4f(aces(lightNormal(vec3f(0.08, 1.0, 0.2) * pulse, normal)), 1.0);
  }
  if (slice.overlay == 1u) {
    let value = values[operation];
    if (present(value)) { return vec4f(viridis(normalized(value)), 1.0); }
  } else if (slice.overlay == 2u && slice.fieldOn == 1u) {
    let value = sampleField(board);
    if (present(value)) { return vec4f(viridis(normalized(value)), 1.0); }
  }
  return vec4f(aces(litNormal(slice.color.rgb, normal)), slice.color.a);
}

// The base copper lighting (renderer.js) for a flat face of normal (0, 0, z),
// so analytic copper reads exactly as the mesh copper it replaces.
fn lit(base: vec3f) -> vec3f {
  return litNormal(base, faceNormal());
}

fn litNormal(base: vec3f, normal: vec3f) -> vec3f {
  var tinted = base;
  // Copper (material.w = 1) dims while a net is lit, as the mesh copper does.
  if (globals.hasHighlight > 0.5 && slice.material.w > 0.5) { tinted = mix(base, vec3f(0.12, 0.14, 0.17), 0.58); }
  return lightNormal(tinted, normal);
}

// The copper lighting for world normal \`normal\`. A layer facing down (its
// material.z -1) is lit from below, as the mesh lights its bottom faces.
fn lightNormal(tinted: vec3f, normal: vec3f) -> vec3f {
  let up = slice.material.z;
  let side = vec3f(1.0, 1.0, up);
  let light = normalize(globals.lightDirection.xyz * side);
  let diffuse = max(dot(normal, light), 0.0);
  let hemi = 0.62;
  let roughness = clamp(slice.material.y, 0.05, 1.0);
  let metallic = clamp(slice.material.x, 0.0, 1.0);
  let specular = pow(max(dot(normal, normalize(light + vec3f(0.3, -0.4, 0.85) * side)), 0.0), mix(96.0, 6.0, roughness));
  return tinted * (hemi + diffuse * 0.72) + mix(vec3f(0.04), tinted, metallic) * specular * 0.5;
}

struct ShapeOut {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) board: vec2f,
  @location(2) @interpolate(flat) record: u32,
};

@vertex fn vs_shape(@builtin(vertex_index) vertex: u32, @builtin(instance_index) record: u32) -> ShapeOut {
  let lo = vec2f(fword(record, 10u), fword(record, 11u));
  let hi = vec2f(fword(record, 12u), fword(record, 13u));
  let local = mix(lo, hi, corner(vertex));
  let linear = mat2x2f(fword(record, 4u), fword(record, 6u), fword(record, 5u), fword(record, 7u));
  let board = linear * local + vec2f(fword(record, 8u), fword(record, 9u));
  var out: ShapeOut;
  out.position = clip(board);
  out.local = local;
  out.board = board;
  out.record = record;
  return out;
}

// Samples per pixel of the colour pass (1 or 4).
override SAMPLES: u32 = 1u;

// The samples of this pixel inside the shape: the shape at each of WebGPU's
// standard 4x sample positions (offsets from the pixel's centre), so its
// edges anti-alias with exact coverage. Stencil and depth follow the same
// samples. A pixel clear of the edge is all in or all out.
fn coverage(record: u32, local: vec2f) -> u32 {
  let dx = dpdx(local);
  let dy = dpdy(local);
  let centre = shapeDistance(record, local) - slice.dilate;
  if (SAMPLES == 1u) { return select(1u, 0u, centre > 0.0); }
  let all = (1u << SAMPLES) - 1u;
  if (abs(centre) > length(dx) + length(dy)) { return select(all, 0u, centre > 0.0); }
  var offsets = array<vec2f, 4>(vec2f(-0.125, -0.375), vec2f(0.375, -0.125), vec2f(-0.375, 0.125), vec2f(0.125, 0.375));
  var mask = 0u;
  for (var i = 0u; i < 4u; i += 1u) {
    if (shapeDistance(record, local + dx * offsets[i].x + dy * offsets[i].y) - slice.dilate <= 0.0) { mask |= 1u << i; }
  }
  return mask;
}

struct Covered {
  @location(0) color: vec4f,
  @builtin(sample_mask) mask: u32,
};

@fragment fn fs_shape(input: ShapeOut) -> Covered {
  let mask = coverage(input.record, input.local);
  if (mask == 0u || netHidden(word(input.record, 1u))) { discard; }
  return Covered(shade(word(input.record, 1u), input.board), mask);
}

@fragment fn fs_shape_pick(input: ShapeOut) -> @location(0) vec4u {
  if (shapeDistance(input.record, input.local) > 0.0 || netHidden(word(input.record, 1u))) { discard; }
  return vec4u(PICK_TAG, word(input.record, 1u) + 1u, 0u, 0u);
}

@fragment fn fs_shape_mask(input: ShapeOut) -> Covered {
  let mask = coverage(input.record, input.local);
  if (mask == 0u) { discard; }
  return Covered(vec4f(0.0), mask);
}

@fragment fn fs_shape_mask_pick(input: ShapeOut) -> @location(0) vec4u {
  if (shapeDistance(input.record, input.local) > 0.0) { discard; }
  return vec4u(0u);
}

struct PlainOut {
  @builtin(position) position: vec4f,
};

@vertex fn vs_fan(@location(0) board: vec2f) -> PlainOut {
  var out: PlainOut;
  out.position = clip(board);
  return out;
}

@vertex fn vs_clear(@builtin(vertex_index) vertex: u32) -> PlainOut {
  var out: PlainOut;
  out.position = clip(mix(slice.clearBounds.xy, slice.clearBounds.zw, corner(vertex)));
  return out;
}

@fragment fn fs_plain_mask() -> @location(0) vec4f { return vec4f(0.0); }

// Solder mask, coloured over the slice where it was laid down (stencil bit
// 5): plain, or lighter over outer copper (bit 0), as the mesh mask reads.
@fragment fn fs_tint_plain() -> @location(0) vec4f {
  return vec4f(aces(lit(slice.color.rgb)), slice.color.a);
}
@fragment fn fs_tint_covered() -> @location(0) vec4f {
  let base = min(slice.color.rgb * 1.6 + vec3f(0.03, 0.05, 0.02), vec3f(1.0));
  return vec4f(aces(lit(base)), min(1.0, slice.color.a * 1.2));
}
@fragment fn fs_plain_mask_pick() -> @location(0) vec4u { return vec4u(0u); }

struct CoverOut {
  @builtin(position) position: vec4f,
  @location(0) board: vec2f,
  @location(1) @interpolate(flat) operation: u32,
};

@vertex fn vs_cover(@builtin(vertex_index) vertex: u32, @builtin(instance_index) record: u32) -> CoverOut {
  let lo = vec2f(bitcast<f32>(coverWord(record, 2u)), bitcast<f32>(coverWord(record, 3u)));
  let hi = vec2f(bitcast<f32>(coverWord(record, 4u)), bitcast<f32>(coverWord(record, 5u)));
  let board = mix(lo, hi, corner(vertex));
  var out: CoverOut;
  out.position = clip(board);
  out.board = board;
  out.operation = coverWord(record, 0u);
  return out;
}

@fragment fn fs_cover(input: CoverOut) -> @location(0) vec4f {
  if (netHidden(input.operation)) { discard; }
  return shade(input.operation, input.board);
}

@fragment fn fs_cover_pick(input: CoverOut) -> @location(0) vec4u {
  if (netHidden(input.operation)) { discard; }
  return vec4u(PICK_TAG, input.operation + 1u, 0u, 0u);
}

// Side walls of a slab (copper of its stackup thickness), from wall edges
// extruded through it. A region's walls are its contour edges. A shape's
// wall is exact: its edges are a skirt just outside its outline (the
// lowering's outline polygon), and each sample's view ray, entering the
// skirt, marches on to the shape's true outline by its distance, keeping
// that hit with its depth. Only the thin band along outlines is shaded.

fn shapeLinear(record: u32) -> mat2x2f {
  return mat2x2f(fword(record, 4u), fword(record, 6u), fword(record, 5u), fword(record, 7u));
}

fn boardToWorld(board: vec2f, z: f32) -> vec3f { return vec3f(board.x * 0.001, -board.y * 0.001, z); }

// The unit view ray through a world point, from the eye.
fn viewDirection(world: vec3f) -> vec3f {
  var direction = slice.eye.xyz;
  if (abs(slice.eye.w) > 1e-12) { direction = world - slice.eye.xyz / slice.eye.w; }
  return normalize(direction);
}

struct WallHit {
  hit: bool,
  board: vec2f,
  z: f32,
  normal: vec3f,
};

// The view ray through \`world\` (a point on the shape's skirt, where the ray
// enters it) within the slab, in the shape's local frame: board millimetres,
// s millimetres along the ray from \`world\` on to where it leaves the slab.
struct WallRay {
  ok: bool,
  at: vec3f,
  dir: vec3f,
  local0: vec2f,
  localDir: vec2f,
  speed: f32,
  s0: f32,
  s1: f32,
};

fn wallRay(record: u32, world: vec3f) -> WallRay {
  return wallRayFrom(record, world, false);
}

// As \`wallRay\`, or when \`whole\` over the ray's whole run through the slab
// (a mask's step: the point is only where the ray met the step's trigger).
fn wallRayFrom(record: u32, world: vec3f, whole: bool) -> WallRay {
  var ray: WallRay;
  ray.ok = false;
  let linear = shapeLinear(record);
  let inverse = mat2x2f(linear[1][1], -linear[0][1], -linear[1][0], linear[0][0]) * (1.0 / determinant(linear));
  let d3 = viewDirection(world);
  // Millimetres throughout: board (y down) in xy, height in z.
  ray.dir = vec3f(d3.x, -d3.y, d3.z);
  ray.at = vec3f(world.x * 1000.0, -world.y * 1000.0, world.z * 1000.0);
  // Walls stop a hair inside the slab, so where one meets a face (a track's
  // wall inside a pour) the face always wins the depth test.
  let inset = (slice.slab.y - slice.slab.x) * 1000.0 * WALL_INSET;
  var zb = slice.slab.x * 1000.0 + inset;
  var zt = slice.slab.y * 1000.0 - inset;
  // A step reaches a hair past the mask's outer face instead, so no seam
  // opens between it and the mask over copper.
  if (whole) {
    if (slice.material.z < 0.0) { zb -= 2.0 * inset; } else { zt += 2.0 * inset; }
  }
  ray.s0 = -1e9;
  ray.s1 = 1e9;
  if (abs(ray.dir.z) > 1e-9) {
    let a = (zb - ray.at.z) / ray.dir.z;
    let b = (zt - ray.at.z) / ray.dir.z;
    ray.s0 = min(a, b);
    ray.s1 = max(a, b);
  } else if (ray.at.z < zb || ray.at.z > zt) {
    return ray;
  }
  let reach = length(vec2f(fword(record, 12u), fword(record, 13u)) - vec2f(fword(record, 10u), fword(record, 11u))) + 1.0;
  ray.s0 = max(ray.s0, select(0.0, -reach * 4.0, whole));
  ray.s1 = min(ray.s1, reach * 4.0);
  ray.local0 = inverse * (ray.at.xy - vec2f(fword(record, 8u), fword(record, 9u)));
  ray.localDir = inverse * ray.dir.xy;
  ray.speed = length(ray.localDir);
  ray.ok = ray.s0 < ray.s1;
  return ray;
}

// The ray against the shape's side walls, marched by the shape's distance
// (a bound on how far the ray can go without meeting its outline).
fn marchWall(record: u32, ray: WallRay) -> WallHit {
  var result: WallHit;
  result.hit = false;
  if (!ray.ok || ray.speed < 1e-7) { return result; }
  var s = ray.s0;
  // A dilated shape (a mask step) is its outline grown by \`slice.dilate\`.
  var distance = shapeDistance(record, ray.local0 + ray.localDir * s) - slice.dilate;
  // Starting inside the shape: the ray came through a face, not a wall.
  if (distance <= 0.0) { return result; }
  for (var i = 0u; i < 48u; i += 1u) {
    s += distance / ray.speed;
    if (s > ray.s1) { return result; }
    distance = shapeDistance(record, ray.local0 + ray.localDir * s) - slice.dilate;
    if (distance < 1e-4) { break; }
  }
  if (distance >= 1e-4) { return result; }
  let local = ray.local0 + ray.localDir * s;
  let board = ray.at.xy + ray.dir.xy * s;
  let add = (record - slice.subtracts) * 2u;
  if (inHole(cuts[add], cuts[add + 1u], board)) { return result; }
  let e = 1e-3;
  let gradient = vec2f(
    shapeDistance(record, local + vec2f(e, 0.0)) - shapeDistance(record, local - vec2f(e, 0.0)),
    shapeDistance(record, local + vec2f(0.0, e)) - shapeDistance(record, local - vec2f(0.0, e)));
  let normalBoard = normalize(shapeLinear(record) * gradient);
  result.hit = true;
  result.board = board;
  result.z = (ray.at.z + ray.dir.z * s) * 0.001;
  result.normal = vec3f(normalBoard.x, -normalBoard.y, 0.0);
  return result;
}

const WALL_INSET = 0.02;

// Whether a board point lies in one of the holes \`cuts[first..first + count]\`
// names: there the slab is drilled away, its walls with it.
fn inHole(first: u32, count: u32, board: vec2f) -> bool {
  for (var i = 0u; i < count; i += 1u) {
    let hole = cuts[first + i];
    let linear = shapeLinear(hole);
    let inverse = mat2x2f(linear[1][1], -linear[0][1], -linear[1][0], linear[0][0]) * (1.0 / determinant(linear));
    if (shapeDistance(hole, inverse * (board - vec2f(fword(hole, 8u), fword(hole, 9u)))) < 0.0) { return true; }
  }
  return false;
}

fn worldDepth(world: vec3f) -> f32 {
  let clipped = globals.viewProjection * vec4f(world, 1.0);
  return clipped.z / clipped.w;
}

struct WallColor {
  @location(0) color: vec4f,
  @builtin(frag_depth) depth: f32,
};
struct WallPick {
  @location(0) pick: vec4u,
  @builtin(frag_depth) depth: f32,
};

fn edgeEnd(edge: u32, end: u32) -> vec2f {
  let base = edge * EDGE_WORDS + end * 2u;
  return vec2f(bitcast<f32>(edges[base]), bitcast<f32>(edges[base + 1u]));
}

// An edge's outward normal in the world: edges run with their material on
// the left (as the lowering writes them), and board y is the world's -y.
fn edgeOutward(edge: u32) -> vec3f {
  let along = edgeEnd(edge, 1u) - edgeEnd(edge, 0u);
  return normalize(vec3f(along.y, along.x, 0.0));
}

// An edge's wall quad, inset a hair from the slab's faces; or nothing when
// the wall faces away from the eye (only its outward side shows: the
// material, or for a skirt the rest of the shape's wall, lies behind it).
fn wallCorner(vertex: u32, edge: u32) -> vec3f {
  let c = corner(vertex);
  let board = mix(edgeEnd(edge, 0u), edgeEnd(edge, 1u), c.x);
  let inset = (slice.slab.y - slice.slab.x) * WALL_INSET;
  return boardToWorld(board, mix(slice.slab.x + inset, slice.slab.y - inset, c.y));
}

fn facesEye(edge: u32) -> bool {
  let middle = boardToWorld(0.5 * (edgeEnd(edge, 0u) + edgeEnd(edge, 1u)), 0.5 * (slice.slab.x + slice.slab.y));
  return dot(edgeOutward(edge), viewDirection(middle)) < 0.0;
}

// Off the clip volume: a culled wall's quad draws nothing.
const CULLED = vec4f(0.0, 0.0, 2.0, 1.0);

struct EdgeOut {
  @builtin(position) position: vec4f,
  @location(0) world: vec3f,
  @location(1) @interpolate(flat) edge: u32,
};

@vertex fn vs_region_wall(@builtin(vertex_index) vertex: u32, @builtin(instance_index) edge: u32) -> EdgeOut {
  let world = wallCorner(vertex, edge);
  var out: EdgeOut;
  out.position = select(CULLED, globals.viewProjection * vec4f(world, 1.0), facesEye(edge));
  out.world = world;
  out.edge = edge;
  return out;
}

fn edgeCut(edge: u32, world: vec3f) -> bool {
  let base = edge * EDGE_WORDS;
  return inHole(edges[base + 5u], edges[base + 6u], vec2f(world.x * 1000.0, -world.y * 1000.0));
}

// A region's wall is its edge's own quad: shaded once per pixel, at its
// own depth.
@fragment fn fs_region_wall(input: EdgeOut) -> @location(0) vec4f {
  let operation = edges[input.edge * EDGE_WORDS + 4u];
  if (netHidden(operation) || edgeCut(input.edge, input.world)) { discard; }
  let board = vec2f(input.world.x * 1000.0, -input.world.y * 1000.0);
  return shadeNormal(operation, board, edgeOutward(input.edge));
}

@fragment fn fs_region_wall_pick(input: EdgeOut) -> @location(0) vec4u {
  let operation = edges[input.edge * EDGE_WORDS + 4u];
  if (netHidden(operation) || edgeCut(input.edge, input.world)) { discard; }
  return vec4u(PICK_TAG, operation + 1u, 0u, 0u);
}

struct SkirtOut {
  @builtin(position) position: vec4f,
  // Shaded once per pixel: the skirt spans the wall's height, so its own
  // coverage anti-aliases the wall's top and bottom edges, and the inset
  // keeps the face in front where the two meet.
  @location(0) world: vec3f,
  @location(1) @interpolate(flat) record: u32,
};

// How far in from its skirt a shape's ring reaches, millimetres: past the
// outline's least tolerance (kicad_monkey's OUTLINE_TOLERANCE_MM, 4 um).
const RING_MM = 0.01;

// A skirt edge draws two quads (twelve vertices): the skirt itself, and a
// ring on the slab face toward the eye, reaching in over the gap between
// skirt and outline. A ray through that gap meets the wall without crossing
// the skirt (steep views), so the ring starts its march instead.
fn skirtCorner(vertex: u32, edge: u32) -> vec3f {
  if (vertex < 6u) { return wallCorner(vertex, edge); }
  let c = corner(vertex - 6u);
  let a = edgeEnd(edge, 0u);
  let b = edgeEnd(edge, 1u);
  let along = normalize(b - a);
  // The material lies on the edge's left.
  let inward = vec2f(-along.y, along.x) * RING_MM * c.y;
  let board = mix(a, b, c.x) + inward;
  let inset = (slice.slab.y - slice.slab.x) * WALL_INSET;
  let middle = 0.5 * (slice.slab.x + slice.slab.y);
  // A perspective eye is a point; an orthographic one the view direction.
  var above = (slice.eye.z < 0.0);
  if (abs(slice.eye.w) > 1e-12) { above = (slice.eye.z / slice.eye.w > middle); }
  return boardToWorld(board, select(slice.slab.x + inset, slice.slab.y - inset, above));
}

@vertex fn vs_skirt(@builtin(vertex_index) vertex: u32, @builtin(instance_index) edge: u32) -> SkirtOut {
  let world = skirtCorner(vertex, edge);
  var out: SkirtOut;
  out.position = select(CULLED, globals.viewProjection * vec4f(world, 1.0), facesEye(edge));
  out.world = world;
  out.record = slice.subtracts + (edges[edge * EDGE_WORDS + 4u] & ~EDGE_SKIRT);
  return out;
}

// A shape's wall: the ray entering its skirt marches on to its outline.
@fragment fn fs_skirt(input: SkirtOut) -> WallColor {
  let operation = word(input.record, 1u);
  if (netHidden(operation)) { discard; }
  let hit = marchWall(input.record, wallRay(input.record, input.world));
  if (!hit.hit) { discard; }
  var out: WallColor;
  out.color = shadeNormal(operation, hit.board, hit.normal);
  out.depth = worldDepth(boardToWorld(hit.board, hit.z));
  return out;
}

// The conformal mask's step: where the mask rises from laminate onto copper,
// a face just off the copper's outline (by slice.dilate), from the laminate
// to the mask's outer face (the foot twin's slab), opaque (a coat seen edge
// on), and only outside the mask's openings (the foot twin's cuts list
// those). A shape's step is found by marching its distance less the
// clearance over the ray's run through the slab, triggered by its skirt and
// by a ring on the inner face reaching out past the step; a region's step
// is its edges pushed out.
fn coatColor(normal: vec3f) -> vec4f {
  let base = min(slice.color.rgb * 1.6 + vec3f(0.03, 0.05, 0.02), vec3f(1.0));
  return vec4f(aces(litNormal(base, normal)), 1.0);
}

// The face the mask lies on over laminate: the slab's inner one.
fn innerFace() -> f32 {
  let inset = (slice.slab.y - slice.slab.x) * WALL_INSET;
  return select(slice.slab.x + inset, slice.slab.y - inset, slice.material.z < 0.0);
}

fn stepCorner(vertex: u32, edge: u32) -> vec3f {
  if (vertex < 6u) { return wallCorner(vertex, edge); }
  let c = corner(vertex - 6u);
  let a = edgeEnd(edge, 0u);
  let b = edgeEnd(edge, 1u);
  let along = normalize(b - a);
  // Out from the material (on the edge's left), past the step.
  let outward = vec2f(along.y, -along.x) * (slice.dilate + RING_MM) * c.y;
  return boardToWorld(mix(a, b, c.x) + outward, innerFace());
}

// A step's quads reach a hair past the mask's outer face (see wallRayFrom).
fn stepReach(world: vec3f) -> vec3f {
  let inset = (slice.slab.y - slice.slab.x) * WALL_INSET;
  let outer = select(slice.slab.y - inset, slice.slab.x + inset, slice.material.z < 0.0);
  let past = select(slice.slab.y + inset, slice.slab.x - inset, slice.material.z < 0.0);
  return select(world, vec3f(world.xy, past), abs(world.z - outer) < inset * 0.5);
}

@vertex fn vs_step(@builtin(vertex_index) vertex: u32, @builtin(instance_index) edge: u32) -> SkirtOut {
  let world = stepReach(stepCorner(vertex, edge));
  var out: SkirtOut;
  out.position = select(CULLED, globals.viewProjection * vec4f(world, 1.0), facesEye(edge));
  out.world = world;
  out.record = slice.subtracts + (edges[edge * EDGE_WORDS + 4u] & ~EDGE_SKIRT);
  return out;
}

@fragment fn fs_step(input: SkirtOut) -> WallColor {
  let hit = marchWall(input.record, wallRayFrom(input.record, input.world, true));
  if (!hit.hit) { discard; }
  var out: WallColor;
  out.color = coatColor(hit.normal);
  out.depth = worldDepth(boardToWorld(hit.board, hit.z));
  return out;
}

@vertex fn vs_region_step(@builtin(vertex_index) vertex: u32, @builtin(instance_index) edge: u32) -> EdgeOut {
  var world = stepReach(wallCorner(vertex, edge));
  let along = normalize(edgeEnd(edge, 1u) - edgeEnd(edge, 0u));
  // Out from the material by the step's clearance (board y down is the
  // world's -y), as a shape's step is by its distance.
  world += vec3f(along.y, along.x, 0.0) * slice.dilate * 0.001;
  var out: EdgeOut;
  out.position = select(CULLED, globals.viewProjection * vec4f(world, 1.0), facesEye(edge));
  out.world = world;
  out.edge = edge;
  return out;
}

@fragment fn fs_region_step(input: EdgeOut) -> @location(0) vec4f {
  if (edgeCut(input.edge, input.world)) { discard; }
  return coatColor(edgeOutward(input.edge));
}

@fragment fn fs_skirt_pick(input: SkirtOut) -> WallPick {
  let operation = word(input.record, 1u);
  if (netHidden(operation)) { discard; }
  let hit = marchWall(input.record, wallRay(input.record, input.world));
  if (!hit.hit) { discard; }
  var out: WallPick;
  out.pick = vec4u(PICK_TAG, operation + 1u, 0u, 0u);
  out.depth = worldDepth(boardToWorld(hit.board, hit.z));
  return out;
}
`,U0={compare:"always",passOp:"keep"},wr=Object.freeze({shapeMask:{face:{compare:"always",passOp:"replace"},read:255,write:128,reference:128,color:!1,depth:!1},fan:{face:{compare:"always",passOp:"invert"},read:255,write:64,reference:0,color:!1,depth:!1},coverSubtract:{face:{compare:"not-equal",passOp:"replace",failOp:"keep"},read:64,write:192,reference:128,color:!1,depth:!1},shapeAdd:{face:{compare:"greater",passOp:"replace"},read:160,write:33,reference:32,color:!0,depth:!0},coverMark:{face:{compare:"equal",passOp:"replace",failOp:"keep"},read:192,write:1,reference:65,color:!1,depth:!1,depthTest:!0},coverAdd:{face:{compare:"equal",passOp:"invert",failOp:"keep",depthFailOp:"keep"},read:224,write:96,reference:64,color:!0,depth:!0},coverClear:{face:{compare:"always",passOp:"zero"},read:255,write:64,reference:0,color:!1,depth:!1},shapeLay:{face:{compare:"greater",passOp:"replace"},read:160,write:32,reference:32,color:!1,depth:!1,depthTest:!0},coverLay:{face:{compare:"equal",passOp:"invert",failOp:"keep",depthFailOp:"keep"},read:224,write:96,reference:64,color:!1,depth:!1,depthTest:!0},shapeBlend:{face:{compare:"greater",passOp:"replace"},read:160,write:32,reference:32,color:!0,depth:!0},coverBlend:{face:{compare:"equal",passOp:"invert",failOp:"keep",depthFailOp:"keep"},read:224,write:96,reference:64,color:!0,depth:!0},tintCovered:{face:{compare:"equal",passOp:"keep"},read:33,write:0,reference:33,color:!0,depth:!0},tintPlain:{face:{compare:"equal",passOp:"keep"},read:33,write:0,reference:32,color:!0,depth:!0},footShape:{face:{compare:"always",passOp:"replace"},read:0,write:2,reference:2,color:!1,depth:!1},footCover:{face:{compare:"equal",passOp:"replace",failOp:"keep"},read:64,write:2,reference:66,color:!1,depth:!1},tintHigh:{face:{compare:"equal",passOp:"replace"},read:34,write:4,reference:38,color:!0,depth:!0},tintLow:{face:{compare:"equal",passOp:"replace"},read:34,write:4,reference:36,color:!0,depth:!0},clearLay:{face:{compare:"always",passOp:"zero"},read:0,write:224,reference:0,color:!1,depth:!1},shapeOnFoot:{face:{compare:"equal",passOp:"invert"},read:166,write:32,reference:6,color:!0,depth:!0},shapeOffFoot:{face:{compare:"equal",passOp:"invert"},read:166,write:32,reference:4,color:!0,depth:!0},coverOnFoot:{face:{compare:"equal",passOp:"invert",failOp:"keep",depthFailOp:"keep"},read:230,write:96,reference:70,color:!0,depth:!0},coverOffFoot:{face:{compare:"equal",passOp:"invert",failOp:"keep",depthFailOp:"keep"},read:230,write:96,reference:68,color:!0,depth:!0},clearFoot:{face:{compare:"always",passOp:"zero"},read:0,write:6,reference:0,color:!1,depth:!1},coat:{face:{compare:"equal",passOp:"keep",failOp:"keep",depthFailOp:"keep"},read:2,write:0,reference:0,color:!0,depth:!0},solid:{face:U0,read:0,write:0,reference:0,color:!0,depth:!0},clear:{face:{compare:"always",passOp:"zero"},read:255,write:224,reference:0,color:!1,depth:!1}});var td=64,Ei=112,ad=48,sd=`
struct Globals {
  viewProjection: mat4x4f,
  activeNet: u32,
  selectedLayer: u32,
  time: f32,
  hasHighlight: f32,
  selectedFeature: u32,
  padding0: u32,
  padding1: u32,
  padding2: u32,
  lightDirection: vec4f,
};
struct View {
  eye: vec4f,
  color: vec4f,
  wallColor: vec4f,
  overlay: u32,
  isolate: u32,
  // 1 while the board (substrate) is shown: bare drill walls belong to it.
  board: u32,
  padding2: u32,
  range: vec2f,
  padding3: vec2f,
  // The board's side walls (laminate, or plating on a plated edge).
  edgeColor: vec4f,
  // What covers or plugs a via from one side: the solder mask's colour.
  coverColor: vec4f,
};
struct Barrel {
  shape: vec4f,
  size: vec4f,
  // Operation, top layer, bottom layer, flags (BARREL_FLAGS).
  ids: vec4u,
  // A castellated hole's board edge: the board is where dot(xy, edge.xy) <= edge.z.
  edge: vec4f,
};
@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<uniform> view: View;
@group(0) @binding(2) var<storage, read> barrels: array<Barrel>;
@group(0) @binding(3) var<storage, read> values: array<f32>;
@group(0) @binding(4) var<storage, read> layerOffsets: array<f32>;
@group(0) @binding(5) var<storage, read> nets: array<u32>;
@group(0) @binding(6) var<storage, read> netMask: array<u32>;

const PICK_TAG = ${2147483648}u;
const FAR = 1e30;
fn netLit(operation: u32) -> bool {
  let net = select(0u, nets[operation], operation < arrayLength(&nets));
  let emphasised = net != 0u && net < arrayLength(&netMask) && netMask[net] != 0u;
  return emphasised || (globals.activeNet != 0u && net == globals.activeNet);
}
fn present(value: f32) -> bool { return value < 1e38; }
${Zl}
fn normalized(value: f32) -> f32 {
  let span = view.range.y - view.range.x;
  return select(0.5, (value - view.range.x) / span, abs(span) > 1e-30);
}

// The barrel's top and bottom z, with the layers' exploded offsets.
fn span(b: Barrel) -> vec2f {
  return vec2f(b.size.z + layerOffsets[b.ids.y], b.size.w + layerOffsets[b.ids.z]);
}
fn turn(v: vec2f, angle: f32) -> vec2f {
  let c = cos(angle);
  let s = sin(angle);
  return vec2f(v.x * c - v.y * s, v.x * s + v.y * c);
}

// Twelve triangles of the unit cube.
fn cubeCorner(vertex: u32) -> vec3f {
  var faces = array<u32, 36>(0u, 1u, 3u, 0u, 3u, 2u, 4u, 6u, 7u, 4u, 7u, 5u, 0u, 4u, 5u, 0u, 5u, 1u,
    2u, 3u, 7u, 2u, 7u, 6u, 0u, 2u, 6u, 0u, 6u, 4u, 1u, 5u, 7u, 1u, 7u, 3u);
  let corner = faces[vertex];
  return vec3f(f32(corner & 1u), f32((corner >> 1u) & 1u), f32((corner >> 2u) & 1u));
}

struct BarrelOut {
  @builtin(position) position: vec4f,
  // Per sample: each sample casts its own ray, so the tube's silhouette and
  // depth anti-alias exactly.
  @location(0) @interpolate(perspective, sample) world: vec3f,
  @location(1) @interpolate(flat) barrel: u32,
};

@vertex fn vs_barrel(@builtin(vertex_index) vertex: u32, @builtin(instance_index) index: u32) -> BarrelOut {
  let b = barrels[index];
  let corner = cubeCorner(vertex);
  // A little over the tube, so its silhouette never touches the box's edges.
  let half = vec2f(b.shape.z + b.size.x, b.size.x) * 1.01 + vec2f(1e-7);
  let z = span(b);
  let lift = 1e-7 * sign(z.x - z.y + 1e-12);
  let world = vec3f(
    b.shape.xy + turn((corner.xy * 2.0 - 1.0) * half, b.shape.w),
    mix(z.y - lift, z.x + lift, corner.z)
  );
  var out: BarrelOut;
  out.position = globals.viewProjection * vec4f(world, 1.0);
  out.world = world;
  out.barrel = index;
  return out;
}

// Where a ray (origin o, direction d, in the tube's frame) is inside the
// infinite prism over a stadium of half length \`half\` and radius r: the union
// of two disks and a rectangle, convex, so its hit is one interval.
fn prism(o: vec2f, d: vec2f, half: f32, r: f32) -> vec2f {
  let dd = dot(d, d);
  if (dd < 1e-24) {
    let q = vec2f(max(abs(o.x) - half, 0.0), o.y);
    return select(vec2f(FAR, -FAR), vec2f(-FAR, FAR), dot(q, q) <= r * r);
  }
  var lo = FAR;
  var hi = -FAR;
  for (var end = 0u; end < 2u; end += 1u) {
    let oc = o - vec2f(select(-half, half, end == 1u), 0.0);
    let b = dot(oc, d);
    let disc = b * b - dd * (dot(oc, oc) - r * r);
    if (disc >= 0.0) {
      let root = sqrt(disc);
      lo = min(lo, (-b - root) / dd);
      hi = max(hi, (-b + root) / dd);
    }
  }
  if (half > 0.0) {
    var enter = -FAR;
    var exit = FAR;
    let bounds = vec2f(half, r);
    for (var axis = 0u; axis < 2u; axis += 1u) {
      if (abs(d[axis]) < 1e-24) {
        if (abs(o[axis]) > bounds[axis]) { enter = FAR; exit = -FAR; }
      } else {
        let a = (-bounds[axis] - o[axis]) / d[axis];
        let c = (bounds[axis] - o[axis]) / d[axis];
        enter = max(enter, min(a, c));
        exit = min(exit, max(a, c));
      }
    }
    if (enter <= exit) {
      lo = min(lo, enter);
      hi = max(hi, exit);
    }
  }
  return vec2f(lo, hi);
}

// A point of the tube's frame (xy) in the world.
fn toWorld(b: Barrel, p: vec2f) -> vec2f {
  return b.shape.xy + turn(p, b.shape.w);
}

fn segmentDistance(p: vec2f, half: f32) -> f32 {
  return length(vec2f(p.x - clamp(p.x, -half, half), p.y));
}
fn outward(p: vec2f, half: f32) -> vec2f {
  return normalize(vec2f(p.x - clamp(p.x, -half, half), p.y) + vec2f(0.0, 1e-30));
}

const UNPLATED = 2u;
const COVERED_FRONT = 16u;
const COVERED_BACK = 32u;
const PLUGGED_FRONT = 64u;
const PLUGGED_BACK = 128u;
const FILLED = 256u;
const CAPPED = 512u;
// How far into the bore a plug's face lies, as a share of the barrel.
const PLUG_RECESS = 0.2;
// Via fill and plug resin: a cured epoxy's warm grey.
const RESIN = vec3f(0.46, 0.43, 0.36);

// What a ray meets: the plating, a cap's copper, resin, or a cover.
const MEETS_PLATING = 0u;
const MEETS_RESIN = 1u;
const MEETS_COVER = 2u;

struct Surface {
  t: f32,
  normal: vec3f,
  meets: u32,
};

// Whether a world point lies on the board's side of a castellated hole's edge.
fn onBoard(b: Barrel, world: vec2f) -> bool {
  return dot(world, b.edge.xy) <= b.edge.z;
}

// The nearest tube surface along the fragment's view ray, or t = FAR.
fn surface(input: BarrelOut) -> Surface {
  let b = barrels[input.barrel];
  var dir: vec3f;
  var near = -FAR;
  if (abs(view.eye.w) > 1e-12) {
    // From the camera through this point: the camera sits at t = -1.
    dir = input.world - view.eye.xyz / view.eye.w;
    near = -1.0 + 1e-6;
  } else {
    dir = view.eye.xyz;
  }
  // The tube's frame: centred, its long axis along x.
  let o = vec3f(turn(input.world.xy - b.shape.xy, -b.shape.w), input.world.z);
  let d = vec3f(turn(dir.xy, -b.shape.w), dir.z);
  let z = span(b);
  let top = max(z.x, z.y);
  let bottom = min(z.x, z.y);
  let half = b.shape.z;
  let outer = b.size.x;
  let inner = max(outer - b.size.y, outer * 0.5);
  var best = Surface(FAR, vec3f(0.0, 0.0, 1.0), MEETS_PLATING);
  let flags = b.ids.w;
  // A castellated hole is cut by the board's edge: only its board side stands.
  let walls = array<vec2f, 2>(prism(o.xy, d.xy, half, outer), prism(o.xy, d.xy, half, inner));
  // The outer wall where the ray enters it; the plating's inner wall where it leaves the bore.
  for (var wall = 0u; wall < 2u; wall += 1u) {
    let t = select(walls[0].x, walls[1].y, wall == 1u);
    let p = o + d * t;
    if (abs(t) < FAR && t > near && t < best.t && p.z <= top && p.z >= bottom && onBoard(b, toWorld(b, p.xy))) {
      let n = outward(p.xy, half) * select(1.0, -1.0, wall == 1u);
      best = Surface(t, vec3f(n, 0.0), MEETS_PLATING);
    }
  }
  if (abs(d.z) > 1e-24) {
    // The caps: the ring between the bore and the drill at each end.
    for (var end = 0u; end < 2u; end += 1u) {
      let plane = select(bottom, top, end == 1u);
      let t = (plane - o.z) / d.z;
      let p = o + d * t;
      let reach = segmentDistance(p.xy, half);
      if (t > near && t < best.t && reach <= outer && reach >= inner && onBoard(b, toWorld(b, p.xy))) {
        best = Surface(t, vec3f(0.0, 0.0, select(-1.0, 1.0, end == 1u)), MEETS_PLATING);
      }
    }
    // Across the bore (IPC-4761): a copper cap over a filled via, else
    // resin flush with each end when filled, or recessed from a plugged
    // side; a cover over the end of a covered side.
    let recess = (top - bottom) * PLUG_RECESS;
    for (var end = 0u; end < 2u; end += 1u) {
      let front = end == 1u;
      let covered = (flags & select(COVERED_BACK, COVERED_FRONT, front)) != 0u;
      let plugged = (flags & select(PLUGGED_BACK, PLUGGED_FRONT, front)) != 0u;
      let filled = (flags & FILLED) != 0u;
      let capped = (flags & CAPPED) != 0u;
      if (!(covered || plugged || filled || capped)) { continue; }
      let face = select(bottom, top, front);
      var plane = face;
      var meets = MEETS_RESIN;
      if (capped) { meets = MEETS_PLATING; }
      else if (covered) { meets = MEETS_COVER; }
      else if (!filled) { plane = face + select(recess, -recess, front); }
      let t = (plane - o.z) / d.z;
      let p = o + d * t;
      if (t > near && t < best.t && segmentDistance(p.xy, half) < inner && onBoard(b, toWorld(b, p.xy))) {
        best = Surface(t, vec3f(0.0, 0.0, select(-1.0, 1.0, front)), meets);
      }
    }
  }
  if (best.t < FAR) {
    best.normal = vec3f(turn(best.normal.xy, b.shape.w), best.normal.z);
  }
  return best;
}

fn hitDepth(input: BarrelOut, t: f32) -> f32 {
  let b = barrels[input.barrel];
  var dir = view.eye.xyz;
  if (abs(view.eye.w) > 1e-12) { dir = input.world - view.eye.xyz / view.eye.w; }
  let clip = globals.viewProjection * vec4f(input.world + dir * t, 1.0);
  return clip.z / clip.w;
}

struct ColorOut {
  @location(0) color: vec4f,
  @builtin(frag_depth) depth: f32,
};
struct PickOut {
  @location(0) pick: vec4u,
  @builtin(frag_depth) depth: f32,
};

@fragment fn fs_barrel(input: BarrelOut) -> ColorOut {
  let hit = surface(input);
  if (hit.t >= FAR) { discard; }
  let b = barrels[input.barrel];
  var out: ColorOut;
  out.depth = hitDepth(input, hit.t);
  let value = values[b.ids.x];
  // An unplated hole is a bare drill wall in the substrate's colour, shown with the board.
  if ((b.ids.w & UNPLATED) != 0u) {
    if (view.board == 0u) { discard; }
    let light = normalize(globals.lightDirection.xyz);
    out.color = vec4f(view.wallColor.rgb * (0.62 + max(dot(hit.normal, light), 0.0) * 0.72), 1.0);
    return out;
  }
  let lit = netLit(b.ids.x);
  // Net isolation draws only the lit nets' barrels.
  if (view.isolate == 1u && !lit) { discard; }
  if (view.overlay == 1u && present(value) && !lit) {
    out.color = vec4f(viridis(normalized(value)), 1.0);
    return out;
  }
  let light = normalize(globals.lightDirection.xyz);
  // Resin and covers are not the net's copper: they keep their own colour.
  if (hit.meets != MEETS_PLATING) {
    let surfaceColor = select(RESIN, view.coverColor.rgb, hit.meets == MEETS_COVER);
    out.color = vec4f(surfaceColor * (0.62 + max(dot(hit.normal, light), 0.0) * 0.72), 1.0);
    return out;
  }
  var base = view.color.rgb;
  if (lit) {
    base = vec3f(0.1, 1.0, 0.22) * (0.88 + 0.12 * sin(globals.time * 3.2));
  } else if (globals.hasHighlight > 0.5) {
    base = mix(base, vec3f(0.12, 0.14, 0.17), 0.58);
  }
  out.color = vec4f(base * (0.38 + max(dot(hit.normal, light), 0.0) * 0.72), 1.0);
  return out;
}

@fragment fn fs_barrel_pick(input: BarrelOut) -> PickOut {
  let hit = surface(input);
  let b = barrels[input.barrel];
  if (hit.t >= FAR || (view.isolate == 1u && !netLit(b.ids.x)) || ((b.ids.w & UNPLATED) != 0u && view.board == 0u)) { discard; }
  var out: PickOut;
  out.depth = hitDepth(input, hit.t);
  out.pick = vec4u(PICK_TAG, b.ids.x + 1u, 0u, 0u);
  return out;
}
`,rd=`
struct Globals {
  viewProjection: mat4x4f,
  activeNet: u32,
  selectedLayer: u32,
  time: f32,
  hasHighlight: f32,
  selectedFeature: u32,
  padding0: u32,
  padding1: u32,
  padding2: u32,
  lightDirection: vec4f,
};
struct View {
  eye: vec4f,
  color: vec4f,
  wallColor: vec4f,
  overlay: u32,
  isolate: u32,
  // 1 while the board (substrate) is shown: bare drill walls belong to it.
  board: u32,
  // 1 while the board is solid and unseparated: the copper levels' bands show.
  solid: u32,
  range: vec2f,
  padding3: vec2f,
  edgeColor: vec4f,
  coverColor: vec4f,
};
struct Wall {
  ends: vec4f,
  span: vec4f,
  ids: vec4u,
};
@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<uniform> view: View;
@group(0) @binding(2) var<storage, read> walls: array<Wall>;
@group(0) @binding(4) var<storage, read> layerOffsets: array<f32>;

struct WallOut {
  @builtin(position) position: vec4f,
  @location(0) world: vec3f,
  @location(1) @interpolate(flat) normal: vec3f,
};

@vertex fn vs_wall(@builtin(vertex_index) vertex: u32, @builtin(instance_index) index: u32) -> WallOut {
  let wall = walls[index];
  var corners = array<vec2f, 6>(vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
    vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0));
  let corner = corners[vertex];
  let offset = 0.5 * (layerOffsets[wall.ids.x] + layerOffsets[wall.ids.y]);
  // A copper level's band (ids.z 1) shows only on a solid board.
  let shown = wall.ids.z == 0u || view.solid == 1u;
  let world = vec3f(mix(wall.ends.xy, wall.ends.zw, corner.x), mix(wall.span.y, wall.span.x, corner.y) + offset);
  let along = wall.ends.zw - wall.ends.xy;
  var out: WallOut;
  out.position = select(vec4f(0.0, 0.0, 2.0, 1.0), globals.viewProjection * vec4f(world, 1.0), shown);
  out.world = world;
  out.normal = vec3f(normalize(vec2f(along.y, -along.x) + vec2f(1e-30, 0.0)), 0.0);
  return out;
}

fn aces(color: vec3f) -> vec3f {
  return clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), vec3f(0.0), vec3f(1.0));
}

@fragment fn fs_wall(input: WallOut) -> @location(0) vec4f {
  var toward = -view.eye.xyz;
  if (abs(view.eye.w) > 1e-12) { toward = view.eye.xyz / view.eye.w - input.world; }
  let normal = select(-input.normal, input.normal, dot(input.normal, toward) >= 0.0);
  let light = normalize(globals.lightDirection.xyz);
  // Lit and tone mapped as the slabs' faces are (lightNormal's ambient), so
  // an edge turned from the light still reads as laminate, not black.
  let base = view.edgeColor.rgb * (0.62 + max(dot(normal, light), 0.0) * 0.72);
  return vec4f(aces(base), view.wallColor.a);
}
`;var Ai=20,lt=256,nd=112,Jt="rg32uint",ka=lt/4,H0=256,id={compare:"always",passOp:"zero"},q0={compare:"always",passOp:"replace"},W0={compare:"not-equal",passOp:"keep"},X0={compare:"equal",passOp:"keep"},dd="fn dequant(p: vec3f) -> vec3f { return draw.quantMin.xyz + p * draw.quantSize.xyz; }",ud=32,fd=`  let plating = input.dimensions.w - input.dimensions.z;
  let rim = select(1.0, ${(1/Math.cos(Math.PI/ud)).toFixed(6)}, input.radiusMix > 1.5);
  let radius = mix(max(input.dimensions.z - plating, input.dimensions.z * 0.5), input.dimensions.z, min(input.radiusMix, 1.0)) * rim;
  let turn = vec2f(cos(input.shape.y), sin(input.shape.y));
  let local = vec2f(input.unit.x * radius + select(-input.shape.x, input.shape.x, input.unit.x >= 0.0), input.unit.y * radius);
  let planar = vec2f(local.x * turn.x - local.y * turn.y, local.x * turn.y + local.y * turn.x);
  let turnedNormal = vec3f(input.normal.x * turn.x - input.normal.y * turn.y, input.normal.x * turn.y + input.normal.y * turn.x, input.normal.z);
`,Mr=`
struct Globals {
  viewProjection: mat4x4f,
  activeNet: u32,
  selectedLayer: u32,
  time: f32,
  hasHighlight: f32,
  selectedFeature: u32,
  padding0: u32,
  padding1: u32,
  padding2: u32,
  lightDirection: vec4f,
};
struct Draw {
  color: vec4f,
  material: vec4f,
  offset: vec4f,
  flags: vec4f,
  placement: vec4u,
  quantMin: vec4f,
  quantSize: vec4f,
};
@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<uniform> draw: Draw;
${dd}
@group(0) @binding(3) var<storage, read> hiddenMask: array<u32>;
@group(0) @binding(4) var<storage, read> netMask: array<u32>;
${xi}
${Wa}
// Set on the pipeline that draws the solder mask over copper.
override COVERED: bool = false;

${ie("decl")}struct VertexInput {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) netId: u32,
  @location(3) objectId: u32,
};
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) @interpolate(flat) netId: u32,
  @location(2) @interpolate(flat) objectId: u32,
${ie("vs-out")}  @location(3) world: vec3f,
};
@vertex fn vs(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.world = dequant(input.position) + draw.offset.xyz;
  output.position = globals.viewProjection * vec4f(output.world, 1.0);
  output.normal = normalize(input.normal);
  output.netId = input.netId;
  output.objectId = input.objectId;
${ie("vs-end")}  return output;
}
fn aces(color: vec3f) -> vec3f {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((color * (a * color + b)) / (color * (c * color + d) + e), vec3f(0), vec3f(1));
}
@fragment fn fs(input: VertexOutput) -> @location(0) vec4f {
${ie("fs-begin")}  let kind = u32(draw.flags.x);
  let copper = kind == 1u;
  let component = kind == 2u;
  if (component && featureHidden(input.objectId)) { discard; }
  let selected = netEmphasized(input.netId) || (globals.activeNet != 0u && input.netId == globals.activeNet);
  let selectedComponent = component && globals.selectedFeature != 0u && input.objectId == globals.selectedFeature;
  var base = draw.color.rgb;
  if (COVERED) {
    // Mask over copper reads lighter, as in KiCad.
    base = min(base * 1.6 + vec3f(0.03, 0.05, 0.02), vec3f(1.0));
  }
  if (selected && copper) {
    // flags.z: 0 draws all copper, 1 isolates (lit copper keeps its colour), 2 is inner copper
    // that shows only where lit (SB2-85) and pulses like the outer layers.
    if (draw.flags.z < 0.5 || draw.flags.z > 1.5) {
      let pulse = 0.88 + 0.12 * sin(globals.time * 3.2);
      base = vec3f(0.08, 1.0, 0.2) * pulse;
    }
  } else if (globals.hasHighlight > 0.5 && copper) {
    base = mix(base, vec3f(0.12, 0.14, 0.17), 0.58);
  }
  if (selectedComponent) {
    let pulse = 0.84 + 0.16 * sin(globals.time * 3.6);
    base = mix(base, vec3f(0.15, 0.72, 1.0) * pulse, 0.72);
  }
  if (draw.flags.z > 0.5 && copper && !selected) { discard; }
  let normal = normalize(input.normal);
  // Light each side of the board from its own side, as KiCad does, so the
  // bottom reads as clearly as the top.
  let side = vec3f(1.0, 1.0, select(1.0, -1.0, normal.z < 0.0));
  let light = normalize(globals.lightDirection.xyz * side);
  let diffuse = max(dot(normal, light), 0.0);
  let hemi = mix(0.28, 0.62, abs(normal.z) * 0.5 + 0.5);
  let roughness = clamp(draw.material.y, 0.05, 1.0);
  let metallic = clamp(draw.material.x, 0.0, 1.0);
  let specular = pow(max(dot(normal, normalize(light + vec3f(0.3, -0.4, 0.85) * side)), 0.0), mix(96.0, 6.0, roughness));
  let shaded = base * (hemi + diffuse * 0.72) + mix(vec3f(0.04), base, metallic) * specular * 0.5;
  var lit = shaded;
  if (draw.flags.w > 0.5) {
    lit = base;
  }
  var alpha = draw.flags.y;
  // Translucent placeholders (material.z = full component opacity) turn solid when selected.
  if (selectedComponent) { alpha = max(alpha, draw.material.z * 0.9); }
  if (COVERED) { alpha = min(1.0, alpha * 1.2); }
${ie("fs-return")}  return vec4f(aces(lit), alpha);
}
`,$0=Te(Mr),kr=`
struct Globals {
  viewProjection: mat4x4f,
  activeNet: u32,
  selectedLayer: u32,
  time: f32,
  hasHighlight: f32,
  selectedFeature: u32,
  padding0: u32,
  padding1: u32,
  padding2: u32,
  lightDirection: vec4f,
};
struct Draw { color: vec4f, material: vec4f, offset: vec4f, flags: vec4f, placement: vec4u, quantMin: vec4f, quantSize: vec4f };
@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<uniform> draw: Draw;
${dd}
@group(0) @binding(3) var<storage, read> hiddenMask: array<u32>;
@group(0) @binding(4) var<storage, read> netMask: array<u32>;
${xi}
${Wa}
${ie("decl")}struct Input {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) netId: u32,
  @location(3) objectId: u32,
};
struct Output {
  @builtin(position) position: vec4f,
  @location(2) @interpolate(flat) netId: u32,
${ie("vs-out")}  @location(0) @interpolate(flat) objectId: u32,
};
@vertex fn vs(input: Input) -> Output {
  var output: Output;
  output.position = globals.viewProjection * vec4f(dequant(input.position) + draw.offset.xyz, 1.0);
  output.objectId = input.objectId;
  output.netId = input.netId;
${ie("vs-end")}  return output;
}
@fragment fn fs(input: Output) -> @location(0) vec2u {
${ie("fs-begin")}  if (u32(draw.flags.x) == 2u && featureHidden(input.objectId)) { discard; }
  // Isolated (flags.z), unlit copper is not drawn, so it is not there to pick (SB2-31e).
  let lit = netEmphasized(input.netId) || (globals.activeNet != 0u && input.netId == globals.activeNet);
  if (u32(draw.flags.x) == 1u && draw.flags.z > 0.5 && !lit) { discard; }
${ie("fs-return")}  return vec2u(1u, input.objectId);
}
`,Y0=Te(kr),_i=`
struct Globals {
  viewProjection: mat4x4f,
  activeNet: u32,
  selectedLayer: u32,
  time: f32,
  hasHighlight: f32,
  selectedFeature: u32,
  padding0: u32,
  padding1: u32,
  padding2: u32,
  lightDirection: vec4f,
};
struct Draw { color: vec4f, material: vec4f, offset: vec4f, flags: vec4f };
@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<uniform> draw: Draw;
@group(0) @binding(2) var<storage, read> layerOffsets: array<f32>;
@group(0) @binding(4) var<storage, read> netMask: array<u32>;
${Wa}
${ie("decl")}${xr}
struct Output {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) @interpolate(flat) netId: u32,
  @location(2) @interpolate(flat) objectId: u32,
${ie("vs-out")}  @location(3) @interpolate(flat) visible: u32,
};
@vertex fn vs(input: Input) -> Output {
${fd}  let z0 = input.span.x + layerOffsets[input.ids.z];
  let z1 = input.span.y + layerOffsets[input.ids.w];
  let world = vec3f(
    input.dimensions.x + planar.x,
    input.dimensions.y + planar.y,
    mix(z0, z1, input.unit.z)
  );
  var output: Output;
  output.position = globals.viewProjection * vec4f(world, 1.0);
  output.normal = turnedNormal;
  output.netId = input.ids.x;
  output.objectId = input.ids.y;
  output.visible = 0u;
  if (globals.selectedLayer == 0u || (globals.selectedLayer >= input.ids.z && globals.selectedLayer <= input.ids.w)) {
    output.visible = 1u;
  }
${ie("vs-end")}  return output;
}
@fragment fn fs(input: Output) -> @location(0) vec4f {
${ie("fs-begin")}  if (input.visible == 0u) { discard; }
  let selected = netEmphasized(input.netId) || (globals.activeNet != 0u && input.netId == globals.activeNet);
  var base = draw.color.rgb;
  if (selected) {
    if (draw.flags.z < 0.5) {
      base = vec3f(0.1, 1.0, 0.22) * (0.88 + 0.12 * sin(globals.time * 3.2));
    }
  } else if (globals.hasHighlight > 0.5) {
    base = mix(base, vec3f(0.12, 0.14, 0.17), 0.58);
  }
  if (draw.flags.z > 0.5 && !selected) { discard; }
  let light = normalize(globals.lightDirection.xyz);
  let lit = base * (0.38 + max(dot(normalize(input.normal), light), 0.0) * 0.72);
${ie("fs-return")}  return vec4f(lit, 1.0);
}
`,J0=Te(_i),Ri=`
struct Globals {
  viewProjection: mat4x4f,
  activeNet: u32,
  selectedLayer: u32,
  time: f32,
  hasHighlight: f32,
  selectedFeature: u32,
  padding0: u32,
  padding1: u32,
  padding2: u32,
  lightDirection: vec4f,
};
struct Draw { color: vec4f, material: vec4f, offset: vec4f, flags: vec4f };
@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<uniform> draw: Draw;
@group(0) @binding(2) var<storage, read> layerOffsets: array<f32>;
@group(0) @binding(4) var<storage, read> netMask: array<u32>;
${Wa}
${ie("decl")}${xr}
struct Output {
  @builtin(position) position: vec4f,
  @location(3) @interpolate(flat) netId: u32,
  @location(0) @interpolate(flat) objectId: u32,
${ie("vs-out")}  @location(1) @interpolate(flat) visible: u32,
};
@vertex fn vs(input: Input) -> Output {
${fd}  let world = vec3f(
    input.dimensions.x + planar.x,
    input.dimensions.y + planar.y,
    mix(input.span.x + layerOffsets[input.ids.z], input.span.y + layerOffsets[input.ids.w], input.unit.z)
  );
  var output: Output;
  output.position = globals.viewProjection * vec4f(world, 1.0);
  output.objectId = input.ids.y;
  output.netId = input.ids.x;
  output.visible = 0u;
  if (globals.selectedLayer == 0u || (globals.selectedLayer >= input.ids.z && globals.selectedLayer <= input.ids.w)) {
    output.visible = 1u;
  }
${ie("vs-end")}  return output;
}
@fragment fn fs(input: Output) -> @location(0) vec2u {
${ie("fs-begin")}  if (input.visible == 0u) { discard; }
  let lit = netEmphasized(input.netId) || (globals.activeNet != 0u && input.netId == globals.activeNet);
  if (draw.flags.z > 0.5 && !lit) { discard; }
${ie("fs-return")}  return vec2u(1u, input.objectId);
}
`,Q0=Te(Ri);function ca(e,t){return t.reduce((a,[s,r])=>{if(a.split(s).length!==2)throw new Error(`Shader variant anchor not found once: ${s.slice(0,60)}`);return a.replace(s,()=>r)},e)}var Ni=[`  padding0: u32,
  padding1: u32,`,`  selectedOccurrence: u32,
  occurrenceBase: u32,`],Er=[["  padding2: u32,","  emphasisStride: u32,"],["fn netEmphasized(id: u32) -> bool {",`${xc}fn netEmphasized(id: u32) -> bool {`]],hd="  let lit = netEmphasized(input.netId) || (globals.activeNet != 0u && input.netId == globals.activeNet);",bd=`  let lit = emphasisOf(input.occurrence, input.netId) != 0u
    || (input.occurrence == globals.selectedOccurrence && globals.activeNet != 0u && input.netId == globals.activeNet);`,Ci=ca(Mr,[Ni,[`  @location(3) world: vec3f,
};`,`  @location(3) world: vec3f,
  @location(4) @interpolate(flat) occurrence: u32,
  // Mask and silkscreen opacity of this occurrence's own stackup separation (SB2-31f).
  @location(5) @interpolate(flat) fade: f32,
};`],[`@vertex fn vs(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.world = dequant(input.position) + draw.offset.xyz;
  output.position = globals.viewProjection * vec4f(output.world, 1.0);
  output.normal = normalize(input.normal);`,`${Za}
@vertex fn vs(input: VertexInput, @builtin(instance_index) instance: u32) -> VertexOutput {
  // Full-detail draws (components; inner copper behind an opaque board) list only
  // occurrences at full detail (draw.material.w = LIST_FULL); copper and the
  // like list full or board, substrate and mask full, board or body.
  let index = listedOccurrence(u32(draw.material.w + 0.5), instance);
  let occurrence = occurrences[index];
  var output: VertexOutput;
  let lift = vec3f(0.0, 0.0, explodeLift(occurrence, draw.offset.w));
  output.world = (occurrence.model * vec4f(dequant(input.position) + draw.offset.xyz + lift, 1.0)).xyz;
  output.position = globals.viewProjection * vec4f(output.world, 1.0);
  output.normal = normalize((occurrence.normal * vec4f(input.normal, 0.0)).xyz);
  output.occurrence = index + 1u + globals.occurrenceBase;
  output.fade = select(1.0, occurrence.explode.z, occurrence.explode.w > 0.5 && draw.flags.x < 0.5);
  // A layer this copy hides (SB2-31e), or a draw its separation removes (SB2-31f), collapses outside the clip volume.
  if (layerHiddenAt(occurrence, draw.offset.w) || explodeHides(occurrence, draw.flags.x, draw.offset.w)) {
    output.position = vec4f(0.0, 0.0, 2.0, 1.0);
  }`],[`  let selected = netEmphasized(input.netId) || (globals.activeNet != 0u && input.netId == globals.activeNet);
  let selectedComponent = component && globals.selectedFeature != 0u && input.objectId == globals.selectedFeature;`,`  // The inspected selection lights its own copy; host-highlighted nets light every copy.
  let here = input.occurrence == globals.selectedOccurrence;
  let mark = emphasisOf(input.occurrence, input.netId);
  let selected = mark != 0u || (here && globals.activeNet != 0u && input.netId == globals.activeNet);
  let selectedComponent = here && component && globals.selectedFeature != 0u && input.objectId == globals.selectedFeature;`],...Er,["      base = vec3f(0.08, 1.0, 0.2) * pulse;","      base = emphasisColor(mark, vec3f(0.08, 1.0, 0.2)) * pulse;"],["  var alpha = draw.flags.y;","  var alpha = draw.flags.y * input.fade;"]]),pd=Te(Ci),Bi=ca(kr,[Ni,[`  @location(0) @interpolate(flat) objectId: u32,
};`,`  @location(0) @interpolate(flat) objectId: u32,
  @location(1) @interpolate(flat) occurrence: u32,
};`],[`@vertex fn vs(input: Input) -> Output {
  var output: Output;
  output.position = globals.viewProjection * vec4f(dequant(input.position) + draw.offset.xyz, 1.0);`,`${Za}
@vertex fn vs(input: Input, @builtin(instance_index) instance: u32) -> Output {
  let index = listedOccurrence(u32(draw.material.w + 0.5), instance);
  let occurrence = occurrences[index];
  let lift = vec3f(0.0, 0.0, explodeLift(occurrence, draw.offset.w));
  let world = (occurrence.model * vec4f(dequant(input.position) + draw.offset.xyz + lift, 1.0)).xyz;
  var output: Output;
  output.position = globals.viewProjection * vec4f(world, 1.0);
  output.occurrence = index + 1u + globals.occurrenceBase;
  if (layerHiddenAt(occurrence, draw.offset.w) || explodeHides(occurrence, draw.flags.x, draw.offset.w)) {
    output.position = vec4f(0.0, 0.0, 2.0, 1.0);
  }`],[`${ie("fs-return")}  return vec2u(1u, input.objectId);`,`  let kind = u32(draw.flags.x);
${ie("fs-return")}  return vec2u(input.occurrence, select(input.objectId, 0u, kind == 0u));`],...Er,[hd,bd]]),gd=Te(Bi),Z0=`struct Placement { r0: vec4f, r1: vec4f, r2: vec4f, ids: vec4u };
@group(0) @binding(8) var<storage, read> placements: array<Placement>;
fn place(p: Placement, v: vec3f) -> vec3f {
  return vec3f(dot(p.r0.xyz, v) + p.r0.w, dot(p.r1.xyz, v) + p.r1.w, dot(p.r2.xyz, v) + p.r2.w);
}
fn turn(p: Placement, n: vec3f) -> vec3f {
  return vec3f(dot(p.r0.xyz, n), dot(p.r1.xyz, n), dot(p.r2.xyz, n));
}`,od="@group(0) @binding(1) var<uniform> draw: Draw;",Sr=[od,`${od}
${Z0}`],Tr=["  output.objectId = input.objectId;","  output.objectId = select(placement.ids.x, input.objectId, input.objectId != 0u);"],md=["  let index = listedOccurrence(u32(draw.material.w + 0.5), instance);",`  let placement = placements[draw.placement.x + instance % draw.placement.y];
  let index = listedOccurrence(u32(draw.material.w + 0.5), instance / draw.placement.y);`],yd=ca(Mr,[Sr,[`@vertex fn vs(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.world = dequant(input.position) + draw.offset.xyz;`,`@vertex fn vs(input: VertexInput, @builtin(instance_index) instance: u32) -> VertexOutput {
  let placement = placements[draw.placement.x + instance];
  var output: VertexOutput;
  output.world = place(placement, dequant(input.position)) + draw.offset.xyz;`],["  output.normal = normalize(input.normal);","  output.normal = normalize(turn(placement, input.normal));"],Tr]),xd=ca(Ci,[Sr,md,["occurrence.model * vec4f(dequant(input.position) + draw.offset.xyz + lift, 1.0)","occurrence.model * vec4f(place(placement, dequant(input.position)) + draw.offset.xyz + lift, 1.0)"],["(occurrence.normal * vec4f(input.normal, 0.0))","(occurrence.normal * vec4f(turn(placement, input.normal), 0.0))"],Tr]),wd=ca(kr,[Sr,[`@vertex fn vs(input: Input) -> Output {
  var output: Output;
  output.position = globals.viewProjection * vec4f(dequant(input.position) + draw.offset.xyz, 1.0);`,`@vertex fn vs(input: Input, @builtin(instance_index) instance: u32) -> Output {
  let placement = placements[draw.placement.x + instance];
  var output: Output;
  output.position = globals.viewProjection * vec4f(place(placement, dequant(input.position)) + draw.offset.xyz, 1.0);`],Tr]),vd=ca(Bi,[Sr,md,["occurrence.model * vec4f(dequant(input.position) + draw.offset.xyz + lift, 1.0)","occurrence.model * vec4f(place(placement, dequant(input.position)) + draw.offset.xyz + lift, 1.0)"],Tr]),Md=Te(yd),kd=Te(xd),Ed=Te(wd),Sd=Te(vd),Si=64,ey=6,ty=`${$l}
${Za}
struct Input {
  @location(0) unit: vec3f,
  @location(1) normal: vec3f,
  @location(2) radiusMix: f32,
};`;function Td(e,t,a=[]){return ca(e,[Ni,[`@group(0) @binding(2) var<storage, read> layerOffsets: array<f32>;
`,""],[xr,ty],["@vertex fn vs(input: Input) -> Output {",`struct Record {
  unit: vec3f,
  normal: vec3f,
  radiusMix: f32,
  dimensions: vec4f,
  span: vec2f,
  shape: vec2f,
  ids: vec4u,
};
@vertex fn vs(vertex: Input, @builtin(instance_index) instance: u32) -> Output {
  let count = arrayLength(&barrels);
  let barrel = barrels[instance % count];
  let index = listedOccurrence(LIST_BOARD, instance / count);
  let occurrence = occurrences[index];
  // An occurrence that explodes itself (SB2-31f) scales the renderer's per-layer steps by its own gap.
  let spread = select(1.0, occurrence.explode.x, occurrence.explode.w > 0.5);
  let input = Record(vertex.unit, vertex.normal, vertex.radiusMix, barrel.dimensions, barrel.span, barrel.shape, barrel.ids);`],[t,t.replace("vec4f(world, 1.0)","vec4f((occurrence.model * vec4f(world, 1.0)).xyz, 1.0)")],["  output.objectId = input.ids.y;",`  output.objectId = input.ids.y;
  output.occurrence = index + 1u + globals.occurrenceBase;`],...a])}var Id=Td(_i,`  output.position = globals.viewProjection * vec4f(world, 1.0);
  output.normal = turnedNormal;`,[[`  let z0 = input.span.x + layerOffsets[input.ids.z];
  let z1 = input.span.y + layerOffsets[input.ids.w];`,`  let z0 = input.span.x + layerOffsets[input.ids.z] * spread;
  let z1 = input.span.y + layerOffsets[input.ids.w] * spread;`],[`  output.normal = turnedNormal;
  output.netId`,`  output.normal = (occurrence.normal * vec4f(turnedNormal, 0.0)).xyz;
  output.netId`],[`  @location(3) @interpolate(flat) visible: u32,
};`,`  @location(3) @interpolate(flat) visible: u32,
  @location(4) @interpolate(flat) occurrence: u32,
};`],["  let selected = netEmphasized(input.netId) || (globals.activeNet != 0u && input.netId == globals.activeNet);",`  let mark = emphasisOf(input.occurrence, input.netId);
  let selected = mark != 0u
    || (input.occurrence == globals.selectedOccurrence && globals.activeNet != 0u && input.netId == globals.activeNet);`],...Er,["      base = vec3f(0.1, 1.0, 0.22) * (","      base = emphasisColor(mark, vec3f(0.1, 1.0, 0.22)) * ("]]),Ad=Td(Ri,`  output.position = globals.viewProjection * vec4f(world, 1.0);
  output.objectId`,[["mix(input.span.x + layerOffsets[input.ids.z], input.span.y + layerOffsets[input.ids.w], input.unit.z)","mix(input.span.x + layerOffsets[input.ids.z] * spread, input.span.y + layerOffsets[input.ids.w] * spread, input.unit.z)"],[`  @location(1) @interpolate(flat) visible: u32,
};`,`  @location(1) @interpolate(flat) visible: u32,
  @location(2) @interpolate(flat) occurrence: u32,
};`],["  return vec2u(1u, input.objectId);","  return vec2u(input.occurrence, input.objectId);"],...Er,[hd,bd]]),_d=Te(Id),Rd=Te(Ad),Nd=`
struct Globals {
  viewProjection: mat4x4f,
  activeNet: u32,
  selectedLayer: u32,
  time: f32,
  hasHighlight: f32,
  selectedFeature: u32,
  selectedOccurrence: u32,
  occurrenceBase: u32,
  padding2: u32,
  lightDirection: vec4f,
};
struct Draw { color: vec4f, material: vec4f, offset: vec4f, flags: vec4f };
@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<uniform> draw: Draw;
${Za}
${ie("decl")}struct Input {
  @location(0) corner: vec3f,
  @location(1) normal: vec3f,
};
struct Output {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
${ie("vs-out")}  @location(1) @interpolate(flat) occurrence: u32,
};
@vertex fn vs(input: Input, @builtin(instance_index) instance: u32) -> Output {
  let index = listedOccurrence(LIST_BOX, instance);
  let occurrence = occurrences[index];
  let local = draw.offset.xyz + input.corner * draw.material.xyz;
  var output: Output;
  output.position = globals.viewProjection * vec4f((occurrence.model * vec4f(local, 1.0)).xyz, 1.0);
  output.normal = (occurrence.normal * vec4f(input.normal, 0.0)).xyz;
  output.occurrence = index + 1u + globals.occurrenceBase;
${ie("vs-end")}  return output;
}
`,Cd=`${Nd}
@fragment fn fs(input: Output) -> @location(0) vec4f {
${ie("fs-begin")}  let light = normalize(globals.lightDirection.xyz);
${ie("fs-return")}  return vec4f(draw.color.rgb * (0.45 + max(dot(normalize(input.normal), light), 0.0) * 0.55), 1.0);
}
`,Bd=Te(Cd),Fd=`${Nd}
@fragment fn fs(input: Output) -> @location(0) vec2u {
${ie("fs-begin")}${ie("fs-return")}  return vec2u(input.occurrence, 0u);
}
`,Od=Te(Fd),Fi=`
struct Occurrence {
  model: mat4x4f,
  normal: mat4x4f,
  hiddenLayers: vec4u,
  explode: vec4f,
};
struct Cull {
  planes: array<vec4f, 6>,
  eye: vec4f,
  boundsMin: vec4f,
  boundsMax: vec4f,
  lod: vec4f,
  info: vec4u,
  extra: vec4u,
};
@group(0) @binding(0) var<uniform> cull: Cull;
@group(0) @binding(1) var<storage, read> occurrences: array<Occurrence>;
@group(0) @binding(2) var<storage, read_write> lods: array<u32>;
@group(0) @binding(3) var<storage, read_write> lists: array<u32>;
@group(0) @binding(4) var<storage, read_write> counters: array<atomic<u32>, 4>;
@group(0) @binding(5) var<storage, read_write> args: array<u32>;
@group(0) @binding(6) var<storage, read> classes: array<u32>;

fn chooseLod(previous: u32, pixels: f32) -> u32 {
  var limits = array<f32, 3>(cull.lod.y, bitcast<f32>(cull.extra.y), cull.lod.z);
  let keep = cull.lod.w;
  var lod = 3u;
  if (pixels >= limits[2]) { lod = 2u; }
  if (pixels >= limits[1]) { lod = 1u; }
  if (pixels >= limits[0]) { lod = 0u; }
  for (var level = 0u; level < lod; level += 1u) {
    if (previous <= level && pixels >= limits[level] * keep) { return level; }
  }
  return lod;
}

@compute @workgroup_size(64) fn classify(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= cull.info.x) { return; }
  let model = occurrences[i].model;
  var lo = vec3f(3.0e38);
  var hi = vec3f(-3.0e38);
  for (var corner = 0u; corner < 8u; corner += 1u) {
    let local = vec3f(
      select(cull.boundsMin.x, cull.boundsMax.x, (corner & 1u) != 0u),
      select(cull.boundsMin.y, cull.boundsMax.y, (corner & 2u) != 0u),
      select(cull.boundsMin.z, cull.boundsMax.z, (corner & 4u) != 0u));
    let point = (model * vec4f(local, 1.0)).xyz;
    lo = min(lo, point);
    hi = max(hi, point);
  }
  var inside = true;
  for (var k = 0u; k < 6u; k += 1u) {
    let plane = cull.planes[k];
    let far = select(lo, hi, plane.xyz >= vec3f(0.0));
    if (dot(plane.xyz, far) + plane.w < 0.0) { inside = false; }
  }
  var lod = 3u;
  if (inside) {
    let center = (lo + hi) * 0.5;
    let radius = length(hi - lo) * 0.5;
    // Perspective: pixels per unit at unit distance over the distance; orthographic: per unit.
    let distance = select(1.0, max(length(center - cull.eye.xyz), 1.0e-6), cull.eye.w > 0.5);
    lod = chooseLod(lods[i], radius * cull.lod.x / distance);
    if (cull.info.z != 0u) { lod = cull.info.z - 1u; }
    if (i + 1u == cull.info.y) { lod = 0u; }
  }
  lods[i] = lod;
  if (lod == 0u) { lists[atomicAdd(&counters[0], 1u) * 4u] = i; }
  if (lod <= 1u) { lists[atomicAdd(&counters[1], 1u) * 4u + 1u] = i; }
  if (lod <= 2u) { lists[atomicAdd(&counters[2], 1u) * 4u + 2u] = i; }
  if (lod == 3u) { lists[atomicAdd(&counters[3], 1u) * 4u + 3u] = i; }
}

@compute @workgroup_size(64) fn writeArgs(@builtin(global_invocation_id) id: vec3u) {
  let slot = id.x;
  if (slot >= cull.info.w) { return; }
  let full = atomicLoad(&counters[0]);
  let board = atomicLoad(&counters[1]);
  let body = atomicLoad(&counters[2]);
  let box = atomicLoad(&counters[3]);
  let kind = classes[slot];
  var count = 0u;
  if (kind == 0u) { count = board; }
  else if (kind == 1u) { count = full; }
  else if (kind == 2u) { count = board * cull.extra.x; }
  else if (kind == 3u) { count = box; }
  else if (kind == 5u) { count = body; }
  else if ((kind & 7u) == 6u) { count = full * (kind >> 3u); }
  args[slot * 5u + 1u] = count;
}
`,cd=[{arrayStride:24,attributes:[{shaderLocation:0,offset:0,format:"float32x3"},{shaderLocation:1,offset:12,format:"float32x3"}]}],mS=Object.freeze({main:pd,pick:gd,barrel:_d,barrelPick:Rd,box:Bd,boxPick:Od,cull:Fi,component:Md,componentInstanced:kd,componentPick:Ed,componentPickInstanced:Sd}),Pd=Object.freeze({main:{output:"color",single:Mr,instanced:Ci,world:["output.world","output.world"]},pick:{output:"pick",single:kr,instanced:Bi,world:["(dequant(input.position) + draw.offset.xyz)","world"]},barrel:{output:"color",single:_i,instanced:Id,world:["world","(occurrence.model * vec4f(world, 1.0)).xyz"]},barrelPick:{output:"pick",single:Ri,instanced:Ad,world:["world","(occurrence.model * vec4f(world, 1.0)).xyz"]},component:{output:"color",single:yd,instanced:xd,world:["output.world","output.world"]},componentPick:{output:"pick",single:wd,instanced:vd,world:["(place(placement, dequant(input.position)) + draw.offset.xyz)","world"]},box:{output:"color",single:null,instanced:Cd,world:[null,"(occurrence.model * vec4f(local, 1.0)).xyz"]},boxPick:{output:"pick",single:null,instanced:Fd,world:[null,"(occurrence.model * vec4f(local, 1.0)).xyz"]}}),yS=Object.freeze(Object.keys(Pd));function Ti(e,t,a=[]){let s=Pd[e],r=s?.[t?"instanced":"single"];if(!r)throw new Error(`No ${t?"instanced":"one-board"} ${e} shader`);return Kl(r,a,{family:e,instanced:t,output:s.output,world:s.world[t?1:0]})}var xS=Object.freeze({main:$0,pick:Y0,barrel:J0,barrelPick:Q0,mainInstanced:pd,pickInstanced:gd,barrelInstanced:_d,barrelPickInstanced:Rd,component:Md,componentInstanced:kd,componentPick:Ed,componentPickInstanced:Sd,box:Bd,boxPick:Od,cull:Fi}),oa=class e{static async create(t,{sampleCount:a=4}={}){if(!navigator.gpu)throw new Error("WebGPU is unavailable in this browser");let s=await navigator.gpu.requestAdapter({powerPreference:"high-performance"});if(!s)throw new Error("No WebGPU adapter is available");let r=s.features.has("depth32float-stencil8"),n=await s.requestDevice(r?{requiredFeatures:["depth32float-stencil8"]}:void 0);return new e(t,n,{stencil:r,sampleCount:a})}constructor(t,a,{shareFrom:s=null,stencil:r=!1,sampleCount:n=1}={}){if(this.canvas=t,this.device=a,this.shareFrom=s,this.stencil=s?s.stencil:!!r,this.sampleCount=s?s.sampleCount:n===4?4:1,this.depthFormat=this.stencil?"depth32float-stencil8":"depth32float",this.version=0,this.barrelColor=[.55,.35,.16,.78],this.alwaysInstanced=!!s,this.occurrenceBase=0,s?(this.context=s.context,this.format=s.format):(a.addEventListener("uncapturederror",i=>{console.error(`Uncaptured WebGPU error: ${i.error?.message||i.error}`)}),a.lost.then(i=>{i.reason!=="destroyed"&&console.error(`WebGPU device lost: ${i.reason}`,i.message)}),this.context=t.getContext("webgpu"),this.format=navigator.gpu.getPreferredCanvasFormat(),this.context.configure({device:a,format:this.format,alphaMode:"opaque"})),this.entries=[],this.barrels=null,this.drawSlotCapacity=H0,this.drawSlotBuffer=this.createDrawSlotBuffer(this.drawSlotCapacity),this.drawStaging=new Float32Array(this.drawSlotCapacity*ka),this.freeDrawSlots=[],this.nextDrawSlot=0,this.globalBuffer=a.createBuffer({size:nd,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.layerOffsetBuffer=a.createBuffer({size:1024,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.occurrenceMatrices=[[...Yt]],this.occurrenceKeys=["0"],this.occurrenceHiddenLayers=[[]],this.occurrenceExplode=[null],this.identityOnly=!0,this.occurrenceCapacity=1,this.occurrenceBuffer=this.createOccurrenceBuffer(this.occurrenceCapacity),this.device.queue.writeBuffer(this.occurrenceBuffer,0,br(this.occurrenceMatrices)),this.barrelRecordBuffer=a.createBuffer({label:"barrel-records",size:ki,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.placementBuffer=a.createBuffer({label:"component-placements",size:Si,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.componentPipelineSets=new Map,this.instancedPipelines=null,this.shaderFeatures=[],this.shaderFeatureKey="",this.featurePipelineSets=new Map,this.pipelineSetKinds=new WeakMap,this.listBuffer=this.createListBuffer(this.occurrenceCapacity),this.slotCapacity=0,this.slotArgs=new Uint32Array(0),this.slotClasses=new Uint32Array(0),this.freeSlots=[],this.nextSlot=2,this.argsBuffer=null,this.classesBuffer=null,this.growSlots(256),this.setSlot(0,0,4),this.setSlot(1,0,4),this.cull=null,this.box=null,this.boardBounds=null,this.selectedOccurrence=-1,this.lodOverride=null,this.lodThresholds={...st},this.innerCopperAtFull=!0,this.innerCopperMode="all",this.cullCounts={full:0,board:0,body:0,box:0,culled:0},this.frameStats={triangles:0,draws:0},this.boxColor=[.24,.36,.28,1],s)for(let i of["bindGroupLayout","pipelineLayout","vertexBuffers","pipeline","pickPipeline","barrelPipeline","barrelPickPipeline","singlePipelines"])this[i]=s[i];else this.createSinglePipelines();this.depth=null,this.colorTarget=null,this.pickDepth=null,this.pickTexture=null,this.insetColor=null,this.pickSerial=Promise.resolve(),this.bundleCache=new Map,this.globalScratch=new ArrayBuffer(nd),this.globalScratchF32=new Float32Array(this.globalScratch),this.globalScratchView=new DataView(this.globalScratch),this.barrelDrawScratch=new Float32Array(lt/4),this.nextEntryId=1,this.hiddenFeatureIds=new Set,this.showPlaceholders=!0,this.hiddenBoardLayers=new Set,this.featureMaskCapacity=64,this.featureMaskBuffer=this.createFeatureMaskBuffer(this.featureMaskCapacity),this.uploadFeatureMask(),this.emphasizedNetIds=new Set,this.occurrenceEmphasis=null,this.emphasisStride=0,this.dimCopper=!1,this.netMaskCapacity=64,this.netMaskBuffer=this.createNetMaskBuffer(this.netMaskCapacity),this.uploadNetMask(),s&&this.setOccurrences([])}createSinglePipelines(){let t=this.device;this.bindGroupLayout=t.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:2,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:3,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:4,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:5,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:6,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:7,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:8,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}}]});let a=t.createPipelineLayout({bindGroupLayouts:[this.bindGroupLayout]});this.pipelineLayout=a;let s=this.vertexBuffers=[{arrayStride:Ai,attributes:[{shaderLocation:0,offset:0,format:"unorm16x4"},{shaderLocation:1,offset:8,format:"snorm8x4"},{shaderLocation:2,offset:12,format:"uint32"},{shaderLocation:3,offset:16,format:"uint32"}]}];this.singlePipelines=this.makePipelineSet(!1,[]),this.pipeline=this.singlePipelines.main,this.pickPipeline=this.singlePipelines.pick,this.barrelPipeline=this.singlePipelines.barrel,this.barrelPickPipeline=this.singlePipelines.barrelPick}makeMainPipelines(t,a){let s=this.pipelineLayout,r=this.vertexBuffers,n=(c,l)=>this.makePipeline(s,t,this.format,r,`${c}${a}`,l),i=n("main",{stencil:id}),o=n("main-blend");return{main:i,mark:this.stencil?n("main-mark",{stencil:q0}):i,blend:o,translucent:n("main-translucent",{depthWrite:!1,cullMode:"back"}),mask:this.stencil?n("mask",{stencil:W0}):o,maskCovered:this.stencil?n("mask-covered",{stencil:X0,constants:{COVERED:1}}):null}}createOccurrenceBuffer(t){return this.device.createBuffer({label:"occurrences",size:t*160,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST})}createListBuffer(t){return this.device.createBuffer({label:"visible-occurrences",size:t*4*Uint32Array.BYTES_PER_ELEMENT,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST})}growSlots(t){let a=new Uint32Array(t*5);a.set(this.slotArgs);let s=new Uint32Array(t).fill(4);s.set(this.slotClasses),this.slotArgs=a,this.slotClasses=s,this.slotCapacity=t,this.argsBuffer?.destroy?.(),this.classesBuffer?.destroy?.(),this.argsBuffer=this.device.createBuffer({label:"indirect-args",size:a.byteLength,usage:GPUBufferUsage.INDIRECT|GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.classesBuffer=this.device.createBuffer({label:"draw-classes",size:s.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.device.queue.writeBuffer(this.argsBuffer,0,a),this.device.queue.writeBuffer(this.classesBuffer,0,s),this.cull&&(this.cull.bindGroup=this.makeCullBindGroup()),this.bundleCache?.clear()}setSlot(t,a,s){this.slotArgs.fill(0,t*5,t*5+5),this.slotArgs[t*5]=a,this.slotClasses[t]=s,this.device.queue.writeBuffer(this.argsBuffer,t*20,this.slotArgs,t*5,5),this.device.queue.writeBuffer(this.classesBuffer,t*4,this.slotClasses,t,1)}allocSlot(t,a){let s=this.freeSlots.length?this.freeSlots.pop():this.nextSlot++;return s>=this.slotCapacity&&this.growSlots(this.slotCapacity*2),this.setSlot(s,t,a),s}get occurrenceCount(){return this.occurrenceMatrices.length}setOccurrences(t){let{matrices:a,keys:s,hiddenLayers:r,explode:n}=Dl(t??[Yt]);this.occurrenceMatrices=a,this.occurrenceKeys=s,this.occurrenceHiddenLayers=r,this.occurrenceExplode=n,this.identityOnly=!this.alwaysInstanced&&a.length===1&&gr(a[0]),this.identityOnly||this.ensureInstancedPipelines(),a.length>this.occurrenceCapacity&&(this.occurrenceBuffer?.destroy?.(),this.listBuffer?.destroy?.(),this.occurrenceCapacity=Math.max(a.length,this.occurrenceCapacity*2),this.occurrenceBuffer=this.createOccurrenceBuffer(this.occurrenceCapacity),this.listBuffer=this.createListBuffer(this.occurrenceCapacity),this.cull&&(this.cull.lods.destroy(),this.cull.lods=this.createLodBuffer(this.occurrenceCapacity)),this.rebindAll()),a.length&&this.device.queue.writeBuffer(this.occurrenceBuffer,0,br(a,r,n)),this.cull&&this.device.queue.writeBuffer(this.cull.lods,0,new Uint32Array(this.occurrenceCapacity).fill(pi)),this.selectedOccurrence>=a.length&&(this.selectedOccurrence=-1),this.bundleCache.clear(),this.invalidate()}setOccurrenceHiddenLayers(t){this.occurrenceHiddenLayers=this.occurrenceMatrices.map((a,s)=>[...t?.[s]||[]].map(Number)),this.writeOccurrenceRecords()}setOccurrenceExplode(t){this.occurrenceExplode=this.occurrenceMatrices.map((a,s)=>t?.[s]?[...t[s]].map(Number):null),this.writeOccurrenceRecords()}writeOccurrenceRecords(){this.occurrenceMatrices.length&&this.device.queue.writeBuffer(this.occurrenceBuffer,0,br(this.occurrenceMatrices,this.occurrenceHiddenLayers,this.occurrenceExplode)),this.invalidate()}setInnerCopperMode(t){this.setInnerCopperAtFull(!1),this.innerCopperMode!==t&&(this.innerCopperMode=t,this.invalidate())}setInnerCopperAtFull(t){if(this.innerCopperAtFull!==t){this.innerCopperAtFull=t;for(let a of this.entries)a.innerCopper&&(a.drawClass=ld(a,t),this.setSlot(a.slot,a.indexCount,a.drawClass));this.invalidate()}}setBoardBounds(t){this.boardBounds=t?[...t]:null,this.invalidate()}setLodThresholds(t){this.lodThresholds=Ma({...this.lodThresholds,...t}),this.invalidate()}setAnalytic(t){this.analytic&&this.analytic!==t&&this.analytic.destroy(),this.analytic=t||null,this.bundleCache.clear(),this.invalidate()}setLodOverride(t){this.lodOverride=t==null?null:Number(t),this.invalidate()}createLodBuffer(t){return this.device.createBuffer({label:"occurrence-lods",size:t*Uint32Array.BYTES_PER_ELEMENT,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST})}createCull(){let t=this.device,a=this.shareFrom?.cull,s=i=>({visibility:GPUShaderStage.COMPUTE,buffer:{type:i}}),r=a?.layout||t.createBindGroupLayout({label:"cull",entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}},{binding:1,...s("read-only-storage")},{binding:2,...s("storage")},{binding:3,...s("storage")},{binding:4,...s("storage")},{binding:5,...s("storage")},{binding:6,...s("read-only-storage")}]}),n=a&&{layout:r,classify:a.classify,writeArgs:a.writeArgs};if(!n){let i=this.createShaderModule(Fi,"cull"),o=t.createPipelineLayout({bindGroupLayouts:[r]});n={layout:r,classify:t.createComputePipeline({layout:o,compute:{module:i,entryPoint:"classify"}}),writeArgs:t.createComputePipeline({layout:o,compute:{module:i,entryPoint:"writeArgs"}})}}this.cull={...n,uniform:t.createBuffer({label:"cull-params",size:192,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),lods:this.createLodBuffer(this.occurrenceCapacity),counters:t.createBuffer({label:"cull-counters",size:16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST}),readback:t.createBuffer({label:"cull-readback",size:16,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST}),scratch:new ArrayBuffer(192),reading:!1,readAt:0,bindGroup:null},t.queue.writeBuffer(this.cull.lods,0,new Uint32Array(this.occurrenceCapacity).fill(pi)),this.cull.bindGroup=this.makeCullBindGroup()}makeCullBindGroup(){return this.device.createBindGroup({layout:this.cull.layout,entries:[{binding:0,resource:{buffer:this.cull.uniform}},{binding:1,resource:{buffer:this.occurrenceBuffer}},{binding:2,resource:{buffer:this.cull.lods}},{binding:3,resource:{buffer:this.listBuffer}},{binding:4,resource:{buffer:this.cull.counters}},{binding:5,resource:{buffer:this.argsBuffer}},{binding:6,resource:{buffer:this.classesBuffer}}]})}createBox(){let t=[[[1,0,0],[[1,0,0],[1,1,0],[1,1,1],[1,0,1]]],[[-1,0,0],[[0,0,0],[0,0,1],[0,1,1],[0,1,0]]],[[0,1,0],[[0,1,0],[0,1,1],[1,1,1],[1,1,0]]],[[0,-1,0],[[0,0,0],[1,0,0],[1,0,1],[0,0,1]]],[[0,0,1],[[0,0,1],[1,0,1],[1,1,1],[0,1,1]]],[[0,0,-1],[[0,0,0],[0,1,0],[1,1,0],[1,0,0]]]],a=[],s=[];t.forEach(([l,f],u)=>{for(let b of f)a.push(...b,...l);let g=u*4;s.push(g,g+1,g+2,g,g+2,g+3)});let r=new Float32Array(a),n=new Uint16Array(s),i=this.device.createBuffer({label:"box-vertices",size:r.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),o=this.device.createBuffer({label:"box-indices",size:n.byteLength,usage:GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST});this.device.queue.writeBuffer(i,0,r),this.device.queue.writeBuffer(o,0,n);let c=this.device.createBuffer({size:lt,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.box={vertexBuffer:i,indexBuffer:o,indexCount:n.length,drawBuffer:c,bindGroup:this.makeBindGroup(c),scratch:new Float32Array(lt/4)},this.setSlot(1,n.length,3)}writeBoxDraw(){let t=this.box.scratch,[a,s,r,n,i,o]=this.boardBounds;t.fill(0),t.set(this.boxColor,0),t.set([n-a,i-s,o-r,0],4),t.set([a,s,r,0],8),this.device.queue.writeBuffer(this.box.drawBuffer,0,t)}encodeCull(t,a){let s=this.cull,r=new Float32Array(s.scratch),n=new Uint32Array(s.scratch);r.fill(0),zl(a.matrix).forEach((d,x)=>r.set(d,x*4));let i=a.lod;i&&r.set([...i.eye,i.orthographic?0:1],24);let o=this.boardBounds||[-1e6,-1e6,-1e6,1e6,1e6,1e6];r.set([o[0],o[1],o[2],0,o[3],o[4],o[5],0],28);let{fullPx:c,boardPx:l,boxPx:f,keep:u}=this.lodThresholds;r.set([i?.pixelScale||0,c,f,u],36);let g=this.lodOverride!=null?this.lodOverride+1:!i||!this.boardBounds?mr+1:0;n.set([this.occurrenceMatrices.length,this.selectedOccurrence+1,g,this.nextSlot],40),n[44]=this.barrels?.instanceCount||0,r[45]=l,this.device.queue.writeBuffer(s.uniform,0,s.scratch),t.clearBuffer(s.counters);let b=t.beginComputePass({label:"cull"});b.setBindGroup(0,s.bindGroup),b.setPipeline(s.classify),b.dispatchWorkgroups(Math.ceil(this.occurrenceMatrices.length/64)),b.setPipeline(s.writeArgs),b.dispatchWorkgroups(Math.ceil(this.nextSlot/64)),b.end();let h=performance.now();return!s.reading&&h-s.readAt>250?(t.copyBufferToBuffer(s.counters,0,s.readback,0,16),s.readAt=h,!0):!1}readCullCounts(){let t=this.cull;t.reading=!0;let a=this.occurrenceMatrices.length;t.readback.mapAsync(GPUMapMode.READ).then(()=>{let[s,r,n,i]=new Uint32Array(t.readback.getMappedRange().slice(0));t.readback.unmap(),this.cullCounts={full:s,board:r-s,body:n-r,box:i,culled:Math.max(0,a-n-i)}}).catch(()=>{}).finally(()=>{t.reading=!1})}countFor(t){if(this.identityOnly)return t===2?this.barrels?.instanceCount||0:t===3?0:1;let{full:a,board:s,body:r,box:n}=this.cullCounts;return t===5?a+s+r:t===0?a+s:t===1?a:t===2?(a+s)*(this.barrels?.instanceCount||0):n}gpuMemoryBytes(){let t=0;for(let a of this.entries)t+=(a.vertexAllocation?.size||0)+(a.indexAllocation?.size||0);this.shareFrom||(t+=this.arenaSlackBytes());for(let a of[this.barrels?.vertexBuffer,this.barrels?.indexBuffer,this.barrels?.instanceBuffer,this.barrelRecordBuffer,this.occurrenceBuffer,this.listBuffer,this.argsBuffer,this.classesBuffer,this.featureMaskBuffer,this.netMaskBuffer,this.cull?.lods])t+=a?.size||0;return t+=this.analytic?.gpuMemoryBytes()||0,t+=this.canvas.width*this.canvas.height*12,t}gpuMemoryBreakdown(){let t={},a=0,s=0;for(let c of this.entries){let l=c.vertexAllocation?.size||0,f=c.indexAllocation?.size||0;a+=l,s+=f;let u=c.kind==="copper"?`copper:${c.layerId??"?"}`:c.boardRole?`${c.kind}:${c.boardRole}`:c.kind||"other";t[u]=(t[u]||0)+l+f}let r=[this.barrels?.vertexBuffer,this.barrels?.indexBuffer,this.barrels?.instanceBuffer,this.barrelRecordBuffer].reduce((c,l)=>c+(l?.size||0),0),n=[this.occurrenceBuffer,this.listBuffer,this.argsBuffer,this.classesBuffer,this.featureMaskBuffer,this.netMaskBuffer,this.cull?.lods].reduce((c,l)=>c+(l?.size||0),0),i=this.shareFrom?null:this.arenaStats(),o=this.analytic?.gpuMemoryBytes()||0;return{vertex:a,index:s,geometry:t,barrels:r,occurrences:n,analytic:o,targets:this.canvas.width*this.canvas.height*12,entries:this.entries.length,arena:i}}ensureInstancedPipelines(){if(!this.instancedPipelines){if(this.shareFrom){this.shareFrom.ensureInstancedPipelines(),this.instancedPipelines=this.shareFrom.instancedPipelines,this.createBox(),this.createCull();return}this.instancedPipelines=this.makePipelineSet(!0,[]),this.createBox(),this.createCull()}}makePipelineSet(t,a){let s=this.pipelineLayout,r=mi(a),n=l=>Ti(l,t,a),i=r?`+${r}`:"",o=`${t?"-instanced":""}${i}`,c={...this.makeMainPipelines(n("main"),o),pick:this.makePipeline(s,n("pick"),Jt,this.vertexBuffers,`pick${o}`),barrel:this.makeBarrelPipeline(s,n("barrel"),this.format,`barrel${o}`,!t),barrelPick:this.makeBarrelPipeline(s,n("barrelPick"),Jt,`barrel-pick${o}`,!t)};return t&&(c.box=this.makePipeline(s,n("box"),this.format,cd,`box${i}`),c.boxPick=this.makePipeline(s,n("boxPick"),Jt,cd,`box-pick${i}`)),this.pipelineSetKinds.set(c,{instanced:t,features:as(a),key:r}),c}setShaderFeatures(t=[]){let a=as(t),s=mi(a);s!==this.shaderFeatureKey&&(this.shaderFeatures=a,this.shaderFeatureKey=s,this.bundleCache.clear(),this.invalidate())}pipelinesFor(t){let a=this.shareFrom||this;if(t&&this.ensureInstancedPipelines(),!this.shaderFeatureKey)return t?a.instancedPipelines:a.singlePipelines;let s=`${t?"instanced":"single"}|${this.shaderFeatureKey}`,r=a.featurePipelineSets.get(s);return r||(r=a.makePipelineSet(t,this.shaderFeatures),a.featurePipelineSets.set(s,r)),r}drawSet(){return this.identityOnly?{pipelines:this.pipelinesFor(!1),indirect:!1,barrelInstances:this.barrels?.instanceCount||0}:{pipelines:this.pipelinesFor(!0),indirect:!0,barrelInstances:0}}drawEntry(t,a,s){t.setBindGroup(0,a.bindGroup);let r=a.vertexAllocation,n=a.indexAllocation;t.setVertexBuffer(0,r.buffer,r.offset,r.size),t.setIndexBuffer(n.buffer,a.indexFormat,n.offset,n.size),s?t.drawIndexedIndirect(this.argsBuffer,a.slot*20):t.drawIndexed(a.indexCount,a.placementCount||1)}drawBarrels(t,a,s,r){t.setPipeline(a),t.setBindGroup(0,this.barrels.bindGroup),t.setVertexBuffer(0,this.barrels.vertexBuffer),t.setVertexBuffer(1,this.barrels.instanceBuffer),t.setIndexBuffer(this.barrels.indexBuffer,"uint16"),s?t.drawIndexedIndirect(this.argsBuffer,0):t.drawIndexed(this.barrels.indexCount,r)}drawBox(t,a){!this.box||!this.boardBounds||(this.writeBoxDraw(),t.setPipeline(a),t.setBindGroup(0,this.box.bindGroup),t.setVertexBuffer(0,this.box.vertexBuffer),t.setIndexBuffer(this.box.indexBuffer,"uint16"),t.drawIndexedIndirect(this.argsBuffer,20))}createNetMaskBuffer(t){return this.device.createBuffer({label:"net-emphasis-mask",size:t*Uint32Array.BYTES_PER_ELEMENT,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST})}uploadNetMask(){let t;if(this.occurrenceEmphasis&&!this.identityOnly){let s=vc(this.occurrenceEmphasis);this.emphasisStride=s.stride,t=s.data}else this.emphasisStride=0,t=mc(this.emphasizedNetIds,this.netMaskCapacity);if(t.length>this.netMaskCapacity){this.netMaskBuffer?.destroy?.();let s=this.netMaskCapacity;for(;s<t.length;)s*=2;this.netMaskCapacity=s,this.netMaskBuffer=this.createNetMaskBuffer(s),this.rebindAll()}let a=new Uint32Array(this.netMaskCapacity);a.set(t),this.device.queue.writeBuffer(this.netMaskBuffer,0,a)}setOccurrenceEmphasis(t,{dimCopper:a=!1}={}){let s=Array.isArray(t)&&t.some(r=>r&&r.size);this.occurrenceEmphasis=s?t.map(r=>r&&r.size?new Map(r):null):null,this.dimCopper=!!a,this.uploadNetMask(),this.invalidate()}get netHighlightActive(){return!!(this.emphasizedNetIds.size||this.occurrenceEmphasis||this.dimCopper)}setEmphasizedNetIds(t){this.emphasizedNetIds=Ys(t),this.occurrenceEmphasis=null;let a=gc(this.emphasizedNetIds,this.netMaskCapacity);a!==this.netMaskCapacity&&(this.netMaskBuffer?.destroy?.(),this.netMaskCapacity=a,this.netMaskBuffer=this.createNetMaskBuffer(a),this.rebindAll()),this.uploadNetMask(),this.invalidate()}rebindAll(){for(let t of this.entries)t.bindGroup=this.makeBindGroup(this.drawSlotBuffer,t.drawSlot*lt);this.barrels&&(this.barrels.bindGroup=this.makeBindGroup(this.barrels.drawBuffer)),this.box&&(this.box.bindGroup=this.makeBindGroup(this.box.drawBuffer)),this.cull&&(this.cull.bindGroup=this.makeCullBindGroup()),this.bundleCache.clear()}createFeatureMaskBuffer(t){return this.device.createBuffer({label:"feature-visibility-mask",size:t*Uint32Array.BYTES_PER_ELEMENT,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST})}createDrawSlotBuffer(t){return this.device.createBuffer({label:"draw-uniforms",size:t*lt,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST})}allocateDrawSlot(){if(this.freeDrawSlots.length)return this.freeDrawSlots.pop();if(this.nextDrawSlot>=this.drawSlotCapacity){let t=this.drawSlotCapacity*2,a=new Float32Array(t*ka);a.set(this.drawStaging),this.drawSlotBuffer.destroy?.(),this.drawSlotCapacity=t,this.drawSlotBuffer=this.createDrawSlotBuffer(t),this.drawStaging=a,this.rebindAll()}return this.nextDrawSlot++}flushDraws(t){if(!t.length)return;let a=1/0,s=-1;for(let r of t)a=Math.min(a,r.drawSlot),s=Math.max(s,r.drawSlot);this.device.queue.writeBuffer(this.drawSlotBuffer,a*lt,this.drawStaging,a*ka,(s-a+1)*ka)}invalidate(){this.version+=1}setBarrelColor(t){this.barrelColor=[...t],this.invalidate()}makeBindGroup(t,a=0){return this.device.createBindGroup({layout:this.bindGroupLayout,entries:[{binding:0,resource:{buffer:this.globalBuffer}},{binding:1,resource:{buffer:t,offset:a,size:lt}},{binding:2,resource:{buffer:this.layerOffsetBuffer}},{binding:3,resource:{buffer:this.featureMaskBuffer}},{binding:4,resource:{buffer:this.netMaskBuffer}},{binding:5,resource:{buffer:this.occurrenceBuffer}},{binding:6,resource:{buffer:this.barrelRecordBuffer}},{binding:7,resource:{buffer:this.listBuffer}},{binding:8,resource:{buffer:this.placementBuffer}}]})}uploadFeatureMask(){let t=ql(this.hiddenFeatureIds,this.featureMaskCapacity);this.device.queue.writeBuffer(this.featureMaskBuffer,0,t)}setHiddenFeatureIds(t){this.hiddenFeatureIds=yr(t);let a=Hl(this.hiddenFeatureIds,this.featureMaskCapacity);a!==this.featureMaskCapacity&&(this.featureMaskBuffer?.destroy?.(),this.featureMaskCapacity=a,this.featureMaskBuffer=this.createFeatureMaskBuffer(a),this.rebindAll()),this.uploadFeatureMask(),this.bundleCache.clear(),this.invalidate()}depthStencilState(t=null,a=!0){let s={format:this.depthFormat,depthWriteEnabled:a,depthCompare:"greater"};return this.stencil&&t&&(s.stencilFront=t,s.stencilBack=t),s}makePipeline(t,a,s,r,n,i={}){let o=this.createShaderModule(a,n);return this.device.createRenderPipeline({layout:t,vertex:{module:o,entryPoint:"vs",buffers:r},fragment:{module:o,entryPoint:"fs",...i.constants?{constants:i.constants}:{},targets:[{format:s,blend:s===Jt?void 0:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"triangle-list",cullMode:i.cullMode??"none"},depthStencil:this.depthStencilState(i.stencil,i.depthWrite??!0),multisample:{count:this.samplesFor(s)}})}makeBarrelPipeline(t,a,s,r,n=!0){let i=this.createShaderModule(a,r);return this.device.createRenderPipeline({layout:t,vertex:{module:i,entryPoint:"vs",buffers:[{arrayStride:28,attributes:[{shaderLocation:0,offset:0,format:"float32x3"},{shaderLocation:1,offset:12,format:"float32x3"},{shaderLocation:2,offset:24,format:"float32"}]},...n?[Xl]:[]]},fragment:{module:i,entryPoint:"fs",targets:[{format:s,blend:s===Jt?void 0:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"triangle-list",cullMode:"none"},depthStencil:this.depthStencilState(),multisample:{count:this.samplesFor(s)}})}samplesFor(t){return t===Jt?1:this.sampleCount}createShaderModule(t,a){let s=this.device.createShaderModule({label:`pcb-${a}`,code:t});return typeof s.getCompilationInfo=="function"&&s.getCompilationInfo().then(r=>{let n=[...r.messages||[]];if(n.length){console.groupCollapsed(`WebGPU shader compilation info: pcb-${a}`);for(let i of n)console[i.type==="error"?"error":"warn"](`${i.type} ${i.lineNum}:${i.linePos} ${i.message}`);console.groupEnd()}}),s}resize(){let t=Math.min(devicePixelRatio||1,2),a=Math.max(1,Math.floor(this.canvas.clientWidth*t)),s=Math.max(1,Math.floor(this.canvas.clientHeight*t));if(this.canvas.width===a&&this.canvas.height===s)return;this.canvas.width=a,this.canvas.height=s,this.depth?.destroy(),this.colorTarget?.destroy(),this.pickDepth?.destroy(),this.pickTexture?.destroy();let r=this.sampleCount;this.depth=this.device.createTexture({label:"depth",size:[a,s],format:this.depthFormat,sampleCount:r,usage:GPUTextureUsage.RENDER_ATTACHMENT}),this.colorTarget=r>1?this.device.createTexture({label:"color-msaa",size:[a,s],format:this.format,sampleCount:r,usage:GPUTextureUsage.RENDER_ATTACHMENT}):null,this.pickDepth=r>1?this.device.createTexture({label:"pick-depth",size:[a,s],format:this.depthFormat,usage:GPUTextureUsage.RENDER_ATTACHMENT}):this.depth,this.pickTexture=this.device.createTexture({size:[a,s],format:Jt,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC})}addPrimitive(t,a){let s=t.position.length/3,r=new ArrayBuffer(s*Ai),n=new Uint32Array(r),i=new Uint16Array(r),o=new Int8Array(r),c=sy(t.position);for(let m=0;m<s;m+=1){let y=m*5,v=m*3;ry(i,y*2,t.position,v,c),ny(o,(y+2)*4,t.normal,v),n[y+3]=t.netId[m]||0,n[y+4]=t.objectFeatureId[m]||0}let l=this.arenas(),f=l.vertex.alloc(r.byteLength);l.vertex.write(f,r);let{indices:u,format:g}=iy(t.indices,s),b=l.index.alloc(u.byteLength);l.index.write(b,u);let h=this.allocateDrawSlot(),d=this.makeBindGroup(this.drawSlotBuffer,h*lt),x=ld(a,this.innerCopperAtFull),p={...a,drawClass:x,slot:this.allocSlot(t.indices.length,a.placements?ey|a.placements<<3:x),placementCount:a.placements||0,placementBase:0,bounds:t.bounds||a.bounds||null,id:this.nextEntryId++,vertexAllocation:f,indexAllocation:b,quantMin:c.min,quantSize:c.size,indexFormat:g,indexCount:t.indices.length,drawSlot:h,bindGroup:d};return this.entries.push(p),this.bundleCache.clear(),this.invalidate(),p}arenas(){let t=this.shareFrom||this;return t.geometryArenas??={vertex:new ts(t.device,GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST,"geometry-vertices"),index:new ts(t.device,GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST,"geometry-indices")},t.geometryArenas}arenaSlackBytes(){let t=this.geometryArenas;return t?t.vertex.reservedBytes()-t.vertex.usedBytes+t.index.reservedBytes()-t.index.usedBytes:0}arenaStats(){let t=this.geometryArenas;if(!t)return{chunks:0,reserved:0,used:0};let a=s=>s.chunks.reduce((r,n)=>r+n.free.filter(i=>i.offset+i.size<n.size).reduce((i,o)=>i+o.size,0),0);return{chunks:t.vertex.chunks.length+t.index.chunks.length,reserved:t.vertex.reservedBytes()+t.index.reservedBytes(),used:t.vertex.usedBytes+t.index.usedBytes,holes:a(t.vertex)+a(t.index)}}componentPipelines(t){let a=this.shareFrom||this,s=a.componentPipelineSets.get(t);if(!s){let{instanced:r,features:n,key:i}=a.pipelineSetKinds.get(t),o=a.pipelineLayout,c=a.vertexBuffers,l=Ti("component",r,n),f=Ti("componentPick",r,n),u=`${r?"-instanced":""}${i?`+${i}`:""}`;s={main:a.makePipeline(o,l,a.format,c,`component${u}`,{stencil:id}),blend:a.makePipeline(o,l,a.format,c,`component-blend${u}`),pick:a.makePipeline(o,f,Jt,c,`component-pick${u}`)},a.componentPipelineSets.set(t,s)}return s}addInstancedPrimitives(t){let a=t.map(({primitive:s,placements:r,metadata:n})=>{let i=this.addPrimitive(s,{...n,placements:r.length});return i.placementRecords=r,i});return this.writePlacements(),a}writePlacements(){let t=this.entries.filter(o=>o.placementRecords),a=t.reduce((o,c)=>o+c.placementRecords.length,0),s=new ArrayBuffer(Math.max(1,a)*Si),r=new Float32Array(s),n=new Uint32Array(s),i=0;for(let o of t){o.placementBase=i;for(let c of o.placementRecords){let l=i*(Si/4);r.set(c.rows,l),n[l+12]=c.featureId||0,i+=1}}this.placementBuffer.size<s.byteLength&&(this.placementBuffer.destroy?.(),this.placementBuffer=this.device.createBuffer({label:"component-placements",size:s.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.rebindAll()),this.device.queue.writeBuffer(this.placementBuffer,0,s),this.invalidate()}removeEntries(t){if(!t?.length)return;let a=new Set(t.map(s=>s.id));for(let s of t){let r=this.arenas();s.vertexAllocation&&r.vertex.free(s.vertexAllocation),s.indexAllocation&&r.index.free(s.indexAllocation),this.freeDrawSlots.push(s.drawSlot),s.slot!=null&&(this.setSlot(s.slot,0,4),this.freeSlots.push(s.slot))}this.entries=this.entries.filter(s=>!a.has(s.id)),t.some(s=>s.placementRecords)&&this.writePlacements(),this.bundleCache.clear(),this.invalidate()}dispose(){this.removeEntries(this.entries),this.shareFrom||(this.geometryArenas?.vertex.destroy(),this.geometryArenas?.index.destroy(),this.geometryArenas=null),this.barrels&&(this.barrels.vertexBuffer?.destroy?.(),this.barrels.indexBuffer?.destroy?.(),this.barrels.instanceBuffer?.destroy?.(),this.barrels.drawBuffer?.destroy?.(),this.barrels=null),this.depth?.destroy(),this.colorTarget?.destroy(),this.pickDepth!==this.depth&&this.pickDepth?.destroy(),this.insetColor?.texture.destroy(),this.pickTexture?.destroy(),this.featureMaskBuffer?.destroy?.(),this.occurrenceBuffer?.destroy?.(),this.barrelRecordBuffer?.destroy?.(),this.listBuffer?.destroy?.(),this.argsBuffer?.destroy?.(),this.classesBuffer?.destroy?.();for(let t of[this.box?.vertexBuffer,this.box?.indexBuffer,this.box?.drawBuffer,this.cull?.uniform,this.cull?.lods,this.cull?.counters,this.cull?.readback])t?.destroy?.();this.box=null,this.cull=null,this.drawSlotBuffer?.destroy?.(),this.depth=null,this.colorTarget=null,this.pickDepth=null,this.insetColor=null,this.pickTexture=null,this.featureMaskBuffer=null,this.bundleCache.clear()}setBarrels(t){if(!t?.length)return;let a=ud,s=[],r=[],n=(d,x,p)=>{let m=s.length/7;for(let y=0;y<a;y+=1){let v=Math.PI*2*(y+.5)/a,E=Math.cos(v),S=Math.sin(v),[T,A,_]=p(E,S);s.push(E,S,x,T,A,_,d)}return m},i=(d,x)=>{for(let p=0;p<a;p+=1){let m=(p+1)%a;r.push(d+p,d+m,x+m,d+p,x+m,x+p)}};for(let d of[0,1]){let x=d?(p,m)=>[-p,-m,0]:(p,m)=>[p,m,0];i(n(d,0,x),n(d,1,x))}for(let[d,x]of[[0,1],[1,-1]]){let p=()=>[0,0,x];i(n(0,d,p),n(2,d,p))}let o=new Float32Array(s),c=new Uint16Array(r),l=Jl(t),f=this.device.createBuffer({size:o.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),u=this.device.createBuffer({size:c.byteLength,usage:GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST}),g=this.device.createBuffer({size:l.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});this.device.queue.writeBuffer(f,0,o),this.device.queue.writeBuffer(u,0,c),this.device.queue.writeBuffer(g,0,l);let b=Ql(t);this.barrelRecordBuffer?.destroy?.(),this.barrelRecordBuffer=this.device.createBuffer({label:"barrel-records",size:b.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.device.queue.writeBuffer(this.barrelRecordBuffer,0,b);let h=this.device.createBuffer({size:lt,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.barrels={records:t,vertexBuffer:f,indexBuffer:u,instanceBuffer:g,indexCount:c.length,instanceCount:t.length,drawBuffer:h,bindGroup:null},this.setSlot(0,c.length,2),this.rebindAll(),this.invalidate()}render(t){let{panels:a,layerOffsets:s}=t;this.resize(),this.device.queue.writeBuffer(this.layerOffsetBuffer,0,s);let r=this.context.getCurrentTexture().createView(),n=0,i=0;a.forEach((o,c)=>{let l=this.device.createCommandEncoder(),f=!this.identityOnly&&this.encodeCull(l,o),u=l.beginRenderPass({colorAttachments:[this.colorAttachment(r,c===0,c===a.length-1)],depthStencilAttachment:this.depthAttachment()}),g=Ii(o.viewport,this.canvas.width,this.canvas.height);u.setViewport(g.x,g.y,g.width,g.height,0,1),u.setScissorRect(g.x,g.y,g.width,g.height);let b=this.encodeDraws(u,o,t);n+=b.triangles,i+=b.draws,u.end(),this.device.queue.submit([l.finish()]),f&&this.readCullCounts()}),this.frameStats={triangles:Math.round(n),draws:i}}renderInto(t,a,s){if(!this.identityOnly)throw new Error("renderInto: one-board renderer only");let r=this.device.createCommandEncoder({label:"inset"}),n={view:t.depthView,depthClearValue:0,depthLoadOp:"clear",depthStoreOp:"discard"};this.stencil&&Object.assign(n,{stencilClearValue:0,stencilLoadOp:"clear",stencilStoreOp:"discard"});let i=r.beginRenderPass({colorAttachments:[this.colorAttachment(t.colorView,!0,!0,this.insetColorView(t.width,t.height))],depthStencilAttachment:n}),o=Ii(a.viewport,t.width,t.height);i.setViewport(o.x,o.y,o.width,o.height,0,1),i.setScissorRect(o.x,o.y,o.width,o.height);let c=this.encodeDraws(i,a,s);return i.end(),this.device.queue.submit([r.finish()]),c}encodeDraws(t,a,{activeNetId:s,selectedFeatureId:r,time:n,visibleLayers:i,showBoard:o,showComponents:c,showPaste:l=!0,componentOpacity:f,boardOpacity:u,isolateNet:g,compareMode:b=!1,compareOffsets:h=new Map,layerAlphas:d=null,visibleTileIds:x=null,layerOffsets:p=null}){let m=0,y=0,v=null;this.stencil&&t.setStencilReference(1),this.writeGlobals(a.matrix,s,a.layerId,n,r);let{pipelines:E,indirect:S,barrelInstances:T}=this.drawSet(),A=!l||!!(s||this.netHighlightActive),_=this.entries.filter(F=>this.visible(F,a.layerId,i,o,c,f,b,x)&&!(A&&F.boardRole==="paste")&&!(F.side&&this.hiddenBoardLayers?.has(`${F.boardRole}:${F.side}`))),R=_.filter(F=>!vr(F)).sort((F,O)=>+!!F.stencilMark-+!!O.stencilMark),C=_.filter(F=>vr(F)).sort((F,O)=>vr(F)-vr(O));for(let F of _)this.writeDraw(F,s,f,u,g,b,h.get(F.layerId),d?.get(F.layerId)??1);this.flushDraws(_),R.length>64?t.executeBundles([this.renderBundle(R,a.layerId)]):this.drawEntries(t,R,E,S);for(let F of _)m+=F.indexCount/3*this.countFor(F.drawClass)*(F.placementCount||1);return y+=_.length,this.analytic&&!b&&(v={matrix:a.matrix,showBoard:o,boardOpacity:u,hidePaste:A,isolateNet:g,panelLayer:a.layerId,assemblyOpacity:l?1:f,hiddenBoardLayers:this.hiddenBoardLayers},y+=this.analytic.encodeInto(t,p,a.layerId?new Set([a.layerId]):i,!1,v),y+=this.analytic.encodeBarrels(t,p,a.matrix)),!b&&this.barrels&&!this.analytic?.hasBarrels()&&(a.layerId===0||i.has(a.layerId))&&(this.writeBarrelDraw(g),this.drawBarrels(t,E.barrel,S,T),m+=this.barrels.indexCount/3*this.countFor(2),y+=1),S&&!b&&(this.drawBox(t,E.box),m+=12*this.countFor(3),y+=1),v&&(y+=this.analytic.encodeBlended(t,p,a.layerId?new Set([a.layerId]):i,v)),this.drawBlended(t,C,E,S),{triangles:m,draws:y}}colorAttachment(t,a=!0,s=!0,r=this.colorTarget?.createView()){let n={view:t,clearValue:{r:.91,g:.93,b:.94,a:1},loadOp:a?"clear":"load",storeOp:"store"};return this.sampleCount===1?n:{...n,view:r,resolveTarget:t,storeOp:s?"discard":"store"}}insetColorView(t,a){if(this.sampleCount!==1){if(this.insetColor?.width!==t||this.insetColor?.height!==a){this.insetColor?.texture.destroy();let s=this.device.createTexture({label:"inset-msaa",size:[t,a],format:this.format,sampleCount:this.sampleCount,usage:GPUTextureUsage.RENDER_ATTACHMENT});this.insetColor={texture:s,view:s.createView(),width:t,height:a}}return this.insetColor.view}}depthAttachment(t=!1){let a={view:(t?this.pickDepth:this.depth).createView(),depthClearValue:0,depthLoadOp:"clear",depthStoreOp:"discard"};return this.stencil&&Object.assign(a,{stencilClearValue:0,stencilLoadOp:"clear",stencilStoreOp:"discard"}),a}drawEntries(t,a,s,r){let n=null;for(let i of a){let o=i.placementCount?this.componentPipelines(s).main:i.stencilMark?s.mark:s.main;o!==n&&(t.setPipeline(o),n=o),this.drawEntry(t,i,r)}}drawBlended(t,a,s,r){for(let n of a)if(n.boardRole==="soldermask"&&n.kind==="board")t.setPipeline(s.mask),this.drawEntry(t,n,r),s.maskCovered&&(t.setPipeline(s.maskCovered),this.drawEntry(t,n,r));else{let i=n.translucent?s.translucent??s.blend:s.blend;t.setPipeline(n.placementCount?this.componentPipelines(s).blend:i),this.drawEntry(t,n,r)}}setPlaceholdersVisible(t){this.showPlaceholders=!!t,this.invalidate()}setHiddenBoardLayers(t){this.hiddenBoardLayers=new Set(t||[]),this.invalidate()}visible(t,a,s,r,n,i,o=!1,c=null){return t.placeholder&&!this.showPlaceholders||t.kind==="copper"&&this.analytic?.coversLayer(t.layerId)||t.kind==="board"&&this.analytic?.coversRole(t.boardRole)||t.kind==="board"&&t.boardRole==="pad"||!o&&t.kind==="copper"&&c&&!c.has(t.tileId)?!1:o?t.kind==="copper"&&s.has(t.layerId):t.innerCopper&&this.innerCopperMode==="none"?!1:t.boardRole==="paste"?a===0&&s.has(t.layerId):t.kind==="board"?a===0&&r:t.kind==="component"?a===0&&n&&i>.001:a?t.layerId===a:s.has(t.layerId)}writeGlobals(t,a,s,r,n=0){let i=this.globalScratch,o=this.globalScratchF32;o.fill(0),o.set(t,0);let c=this.globalScratchView;c.setUint32(64,a||0,!0),c.setUint32(68,s||0,!0),c.setFloat32(72,r,!0),c.setFloat32(76,a||this.netHighlightActive?1:0,!0),c.setUint32(80,n||0,!0),c.setUint32(84,this.selectedOccurrence>=0?this.selectedOccurrence+1+this.occurrenceBase:0,!0),c.setUint32(88,this.occurrenceBase,!0),c.setUint32(92,this.emphasisStride,!0),o.set([.35,-.5,.8,0],24),this.device.queue.writeBuffer(this.globalBuffer,0,i)}writeDraw(t,a,s,r=1,n=!1,i=!1,o=null,c=1){let l=this.drawStaging.subarray(t.drawSlot*ka,(t.drawSlot+1)*ka);l.fill(0);let f=t.color||t.material.baseColor;l.set(f,0),l.set([t.material.metallic||0,t.material.roughness??.72,t.opacityScale!=null?s:0,ay[t.drawClass]??1],4);let u=cy(t);l.set([o?.[0]||0,o?.[1]||0,(i?-(t.baseZ||0):t.layerOffset||0)+u,t.kind==="copper"||t.boardRole==="paste"?Number(t.layerId||0)+1:0],8);let g=Number.isFinite(f?.[3])?f[3]:1,b=t.kind==="component"?s*(t.opacityScale??1):t.kind==="board"&&t.boardRole!=="paste"?r*oy(t,g):c,h=t.kind==="copper"?1:t.kind==="component"?2:0,d=n?1:t.innerCopper&&this.innerCopperMode==="lit"?2:0;if(l.set([h,b,d,i?1:0],12),t.placementCount){let x=new Uint32Array(l.buffer,l.byteOffset+64,2);x[0]=t.placementBase,x[1]=t.placementCount}l.set(t.quantMin,20),l.set(t.quantSize,24)}writeBarrelDraw(t=!1){let a=this.barrelDrawScratch;a.fill(0),a.set(this.barrelColor,0),a.set([.75,.32,0,0],4),a.set([1,1,t?1:0,0],12),this.device.queue.writeBuffer(this.barrels.drawBuffer,0,a)}renderBundle(t,a){let{pipelines:s,indirect:r}=this.drawSet(),{vertex:n,index:i}=this.arenas(),o=`${a}:${r?"indirect":"single"}:${this.shaderFeatureKey}:${n.generation}.${i.generation}:${t.map(u=>u.id).join(",")}`,c=this.bundleCache.get(o);if(c)return c;let l=this.device.createRenderBundleEncoder({colorFormats:[this.format],depthStencilFormat:this.depthFormat,sampleCount:this.sampleCount});this.drawEntries(l,t,s,r);let f=l.finish();return this.bundleCache.set(o,f),this.bundleCache.size>32&&this.bundleCache.delete(this.bundleCache.keys().next().value),f}pick(t,a,s,r){let n=this.pickSerial.then(()=>this.performPick(t,a,s,r));return this.pickSerial=n.catch(()=>0),n}async performPick(t,a,s,r){this.resize();let n=Math.max(0,Math.min(this.canvas.width-1,Math.floor(a))),i=Math.max(0,Math.min(this.canvas.height-1,Math.floor(s)));this.device.queue.writeBuffer(this.layerOffsetBuffer,0,r.layerOffsets);let o=this.device.createCommandEncoder(),c=o.beginRenderPass({colorAttachments:[{view:this.pickTexture.createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}],depthStencilAttachment:this.depthAttachment(!0)}),l=Ii(t.viewport,this.canvas.width,this.canvas.height);return c.setViewport(l.x,l.y,l.width,l.height,0,1),c.setScissorRect(l.x,l.y,l.width,l.height),this.encodePick(c,t,r),c.end(),this.readPick(o,n,i)}encodePick(t,a,s){this.writeGlobals(a.matrix,s.activeNetId,a.layerId,performance.now()/1e3,s.selectedFeatureId);let{pipelines:r,indirect:n,barrelInstances:i}=this.drawSet();t.setPipeline(r.pick);let o=[];for(let c of this.entries)this.visible(c,a.layerId,s.visibleLayers,s.showBoard,s.showComponents,s.componentOpacity,s.compareMode,s.visibleTileIds)&&(c.kind==="board"&&(this.identityOnly||c.boardRole!=="substrate")||(this.writeDraw(c,s.activeNetId,s.componentOpacity,s.boardOpacity,s.isolateNet,s.compareMode,s.compareOffsets?.get(c.layerId)),o.push(c)));this.flushDraws(o);for(let c of o)t.setPipeline(c.placementCount?this.componentPipelines(r).pick:r.pick),this.drawEntry(t,c,n);if(!s.compareMode&&this.barrels&&!this.analytic?.hasBarrels()&&(this.writeBarrelDraw(s.isolateNet),this.drawBarrels(t,r.barrelPick,n,i)),n&&!s.compareMode&&this.drawBox(t,r.boxPick),this.analytic&&!s.compareMode){let c=a.layerId?new Set([a.layerId]):s.visibleLayers;this.analytic.encodeInto(t,s.layerOffsets,c,!0,{matrix:a.matrix,panelLayer:a.layerId,isolateNet:s.isolateNet,showBoard:s.showBoard}),this.analytic.encodeBarrels(t,s.layerOffsets,a.matrix,!0)}}async readPick(t,a,s){let r=this.device.createBuffer({label:"pick-readback",size:256,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});t.copyTextureToBuffer({texture:this.pickTexture,origin:{x:a,y:s}},{buffer:r,bytesPerRow:256},{width:1,height:1}),this.device.queue.submit([t.finish()]);try{await r.mapAsync(GPUMapMode.READ);let n=new DataView(r.getMappedRange()),i=n.getUint32(0,!0),o=n.getUint32(4,!0);if(r.unmap(),this.analytic&&i&2147483648&&o)return{kind:"analytic",occurrenceIndex:-1,featureId:0,operationIndex:o-1,occurrenceKey:null};let c=Ll(i,o);return{...c,occurrenceKey:c.occurrenceIndex>=0?this.occurrenceKeys[c.occurrenceIndex]??null:null}}finally{r.mapState==="mapped"&&r.unmap(),r.destroy()}}},ay=Object.freeze({0:1,1:0,5:2});function sy(e){let t=[1/0,1/0,1/0],a=[-1/0,-1/0,-1/0];for(let s=0;s<e.length;s+=3)for(let r=0;r<3;r+=1){let n=e[s+r];n<t[r]&&(t[r]=n),n>a[r]&&(a[r]=n)}return Number.isFinite(t[0])?{min:t,size:t.map((s,r)=>a[r]>s?a[r]-s:1)}:{min:[0,0,0],size:[1,1,1]}}function ry(e,t,a,s,r){for(let n=0;n<3;n+=1){let i=(a[s+n]-r.min[n])/r.size[n];e[t+n]=Math.max(0,Math.min(65535,Math.round(i*65535)))}e[t+3]=0}function ny(e,t,a,s){for(let r=0;r<3;r+=1){let n=Number(a[s+r])||0;e[t+r]=Math.max(-127,Math.min(127,Math.round(n*127)))}e[t+3]=0}function iy(e,t){if(t<=65536){let a=new Uint16Array(e.length+(e.length&1));return a.set(e),{indices:a,format:"uint16"}}return{indices:e instanceof Uint32Array?e:new Uint32Array(e),format:"uint32"}}function jd(e,t){return e*Ai+(e<=65536?(t+(t&1))*2:t*4)}function ld(e,t){return e.kind==="component"||e.innerCopper&&t?1:e.kind==="board"&&(e.boardRole==="substrate"||e.boardRole==="soldermask")?5:0}function vr(e){return e.translucent?3:e.kind!=="board"?0:e.boardRole==="soldermask"?1:e.boardRole==="silkscreen"?2:0}function oy(e,t){return e.kind!=="board"||e.boardRole==="substrate"?1:e.boardRole==="soldermask"?Math.min(t,.72):e.boardRole==="silkscreen"?Math.min(t,.92):t}function cy(e){if(e.kind!=="board"||e.boardRole!=="soldermask"&&e.boardRole!=="silkscreen")return 0;let t=e.bounds,s=(t?(t[2]+t[5])*.5:0)<0?-1:1,r=e.boardRole==="silkscreen"?35e-6:18e-6;return s*r}function Ii(e,t,a){let s=Math.max(0,Math.min(t-1,Math.floor(e.x))),r=Math.max(0,Math.min(a-1,Math.floor(e.y)));return{x:s,y:r,width:Math.max(1,Math.min(t-s,Math.floor(e.width))),height:Math.max(1,Math.min(a-r,Math.floor(e.height)))}}function Ld(e){return e*12+2}function Dd(e){let t=[],a=0,s=0,r=0;for(let b=0;b<e.length;b+=1){let h=Math.floor(e[b].samplesMm.length/3);h<2||(t.push(b),a+=h,s+=Ld(h),r+=(h-1)*12*6+72)}let n=new Float32Array(Math.max(a,1)*4),i=new ArrayBuffer(Math.max(t.length,1)*32),o=new Uint32Array(i),c=new Float32Array(i),l=new Uint32Array(Math.max(r,3)),f=0,u=0,g=0;return t.forEach((b,h)=>{let d=e[b],x=Math.floor(d.samplesMm.length/3);for(let y=0;y<x;y+=1)n[(f+y)*4]=d.samplesMm[y*3]*.001,n[(f+y)*4+1]=d.samplesMm[y*3+1]*.001,n[(f+y)*4+2]=d.samplesMm[y*3+2]*.001;o[h*8]=f,o[h*8+1]=x,o[h*8+2]=u,o[h*8+3]=h,c[h*8+4]=d.radiusMm*.001;let p=(y,v)=>u+y*12+v%12;for(let y=0;y+1<x;y+=1)for(let v=0;v<12;v+=1)l.set([p(y,v),p(y+1,v),p(y+1,v+1),p(y,v),p(y+1,v+1),p(y,v+1)],g),g+=6;let m=u+x*12;for(let y=0;y<12;y+=1)l.set([m,p(0,y+1),p(0,y)],g),l.set([m+1,p(x-1,y),p(x-1,y+1)],g+3),g+=6;f+=x,u+=Ld(x)}),{samples:n,segments:o,indices:l,kept:t,sampleCount:a,vertexCount:s,indexCount:r}}var dy=`
struct Segment { start: u32, count: u32, vertexStart: u32, color: u32, radius: f32, p0: u32, p1: u32, p2: u32 };
struct Vertex { position: vec4f, normal: vec4f };
`,uy=`${dy}
const RING: u32 = ${12}u;
const TAU: f32 = 6.283185307179586;
@group(0) @binding(0) var<storage, read> samples: array<vec4f>;
@group(0) @binding(1) var<storage, read> segments: array<Segment>;
@group(0) @binding(2) var<storage, read_write> frames: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> vertices: array<Vertex>;
@group(0) @binding(4) var<uniform> counts: vec4u; // segments, samples, vertices

fn safeNormalize(v: vec3f) -> vec3f {
  let length = sqrt(dot(v, v));
  return select(vec3f(0.0, 0.0, 1.0), v / length, length > 1e-12);
}
fn point(s: Segment, i: u32) -> vec3f { return samples[s.start + i].xyz; }
fn tangent(s: Segment, i: u32) -> vec3f {
  let a = point(s, select(i - 1u, 0u, i == 0u));
  let b = point(s, min(i + 1u, s.count - 1u));
  return safeNormalize(b - a);
}
fn perpendicularTo(t: vec3f) -> vec3f {
  let a = abs(t);
  var axis = vec3f(0.0, 0.0, 1.0);
  if (a.x <= a.y && a.x <= a.z) { axis = vec3f(1.0, 0.0, 0.0); } else if (a.y <= a.z) { axis = vec3f(0.0, 1.0, 0.0); }
  return safeNormalize(cross(t, axis));
}

@compute @workgroup_size(64) fn framesMain(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= counts.x) { return; }
  let s = segments[id.x];
  var r = perpendicularTo(tangent(s, 0u));
  frames[s.start] = vec4f(r, 0.0);
  for (var i = 0u; i + 1u < s.count; i++) {
    let v1 = point(s, i + 1u) - point(s, i);
    let c1 = dot(v1, v1);
    if (c1 >= 1e-24) {
      let rL = r - (2.0 / c1) * dot(v1, r) * v1;
      let tL = tangent(s, i) - (2.0 / c1) * dot(v1, tangent(s, i)) * v1;
      let v2 = tangent(s, i + 1u) - tL;
      let c2 = dot(v2, v2);
      r = safeNormalize(select(rL - (2.0 / c2) * dot(v2, rL) * v2, rL, c2 < 1e-24));
    }
    frames[s.start + i + 1u] = vec4f(r, 0.0);
  }
}

fn segmentOf(vertex: u32) -> u32 {
  var low = 0u;
  var high = counts.x - 1u;
  loop {
    if (low >= high) { break; }
    let middle = (low + high + 1u) / 2u;
    if (segments[middle].vertexStart <= vertex) { low = middle; } else { high = middle - 1u; }
  }
  return low;
}

@compute @workgroup_size(64) fn ringsMain(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= counts.z) { return; }
  let index = segmentOf(id.x);
  let s = segments[index];
  let local = id.x - s.vertexStart;
  let ringVertices = s.count * RING;
  var position: vec3f;
  var normal: vec3f;
  if (local < ringVertices) {
    let i = local / RING;
    let angle = TAU * f32(local % RING) / f32(RING);
    let t = tangent(s, i);
    let r = frames[s.start + i].xyz;
    normal = cos(angle) * r + sin(angle) * cross(t, r);
    position = point(s, i) + s.radius * normal;
  } else if (local == ringVertices) {
    normal = -tangent(s, 0u);
    position = point(s, 0u);
  } else {
    normal = tangent(s, s.count - 1u);
    position = point(s, s.count - 1u);
  }
  vertices[id.x] = Vertex(vec4f(position, bitcast<f32>(s.color)), vec4f(normal, 0.0));
}
`,fy=`
struct Globals { viewProjection: mat4x4f, light: vec4f, time: vec4f };
@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<storage, read> colors: array<vec4f>; // rgb, mode: 0 idle, 1 lit, 2 dim

struct Out {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) @interpolate(flat) color: u32,
};
@vertex fn vs(@location(0) position: vec4f, @location(1) normal: vec4f) -> Out {
  var out: Out;
  out.position = globals.viewProjection * vec4f(position.xyz, 1.0);
  out.normal = normal.xyz;
  out.color = bitcast<u32>(position.w);
  return out;
}
@fragment fn fs(input: Out) -> @location(0) vec4f {
  let entry = colors[input.color];
  let mode = u32(entry.a + 0.5);
  var base = entry.rgb;
  if (mode == 1u) { base = base * (0.9 + 0.1 * sin(globals.time.x * 3.2)); }
  if (mode == 2u) { base = mix(base, vec3f(0.62, 0.64, 0.67), 0.7); }
  let n = normalize(input.normal);
  let diffuse = max(dot(n, normalize(globals.light.xyz)), 0.0);
  let hemi = mix(0.35, 0.7, n.z * 0.5 + 0.5);
  let lit = base * (hemi + 0.6 * diffuse);
  return vec4f(select(lit, max(lit, base * 0.95), mode == 1u), 1.0);
}
`,Ud=96,Ir=class{constructor(t){this.host=t,this.device=t.device,this.counts={segments:0,samples:0,vertices:0,indices:0},this.dirty=!1,this.kept=[];let a=this.device,s=a.createShaderModule({label:"harness-tubes-compute",code:uy});this.computeLayout=a.createBindGroupLayout({label:"harness-tubes-compute",entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},{binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},{binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},{binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},{binding:4,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}}]});let r=a.createPipelineLayout({bindGroupLayouts:[this.computeLayout]});this.framesPipeline=a.createComputePipeline({layout:r,compute:{module:s,entryPoint:"framesMain"}}),this.ringsPipeline=a.createComputePipeline({layout:r,compute:{module:s,entryPoint:"ringsMain"}});let n=a.createShaderModule({label:"harness-tubes-draw",code:fy});this.drawLayout=a.createBindGroupLayout({label:"harness-tubes-draw",entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}}]}),this.drawPipeline=a.createRenderPipeline({label:"harness-tubes",layout:a.createPipelineLayout({bindGroupLayouts:[this.drawLayout]}),vertex:{module:n,entryPoint:"vs",buffers:[{arrayStride:32,attributes:[{shaderLocation:0,offset:0,format:"float32x4"},{shaderLocation:1,offset:16,format:"float32x4"}]}]},fragment:{module:n,entryPoint:"fs",targets:[{format:t.format}]},primitive:{topology:"triangle-list",cullMode:"none"},depthStencil:t.depthStencilState(),multisample:{count:t.sampleCount}}),this.globals=a.createBuffer({label:"harness-tubes-globals",size:Ud,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.countBuffer=a.createBuffer({label:"harness-tubes-counts",size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.buffers={},this.capacity={samples:0,segments:0,vertices:0,indices:0},this.globalScratch=new Float32Array(Ud/4)}ensure(t,a,s){let r=this.buffers[t];return r&&r.size>=a?!1:(r?.destroy(),this.buffers[t]=this.device.createBuffer({label:`harness-tubes-${t}`,size:Math.max(256,Math.ceil(a*1.5/4)*4),usage:s}),!0)}setTubes(t,a){let s=Dd(t);if(this.kept=s.kept.map(o=>t[o]),this.counts={segments:s.kept.length,samples:s.sampleCount,vertices:s.vertexCount,indices:s.indexCount},!this.counts.segments){this.dirty=!1;return}let r=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,n=!1;n=this.ensure("samples",s.samples.byteLength,r)||n,n=this.ensure("segments",s.segments.byteLength,r)||n,n=this.ensure("frames",s.samples.byteLength,GPUBufferUsage.STORAGE)||n,n=this.ensure("vertices",this.counts.vertices*32,GPUBufferUsage.STORAGE|GPUBufferUsage.VERTEX)||n,this.ensure("indices",s.indices.byteLength,GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST);let i=this.device.queue;i.writeBuffer(this.buffers.samples,0,s.samples),i.writeBuffer(this.buffers.segments,0,s.segments),i.writeBuffer(this.buffers.indices,0,s.indices),i.writeBuffer(this.countBuffer,0,new Uint32Array([this.counts.segments,this.counts.samples,this.counts.vertices,0])),(n||!this.computeGroup)&&(this.computeGroup=this.device.createBindGroup({layout:this.computeLayout,entries:["samples","segments","frames","vertices"].map((o,c)=>({binding:c,resource:{buffer:this.buffers[o]}})).concat([{binding:4,resource:{buffer:this.countBuffer}}])})),this.setColors(a),this.dirty=!0}setColors(t){if(!this.counts.segments)return;let a=new Float32Array(this.counts.segments*4);this.kept.forEach((s,r)=>{let{rgb:n,mode:i}=t(s);a.set([n[0],n[1],n[2],i],r*4)}),(this.ensure("colors",a.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST)||!this.drawGroup||this.drawGroupColors!==this.buffers.colors)&&(this.drawGroup=this.device.createBindGroup({layout:this.drawLayout,entries:[{binding:0,resource:{buffer:this.globals}},{binding:1,resource:{buffer:this.buffers.colors}}]}),this.drawGroupColors=this.buffers.colors),this.device.queue.writeBuffer(this.buffers.colors,0,a)}encodeCompute(t){if(!this.dirty||!this.counts.segments)return;let a=t.beginComputePass({label:"harness-tubes"});a.setBindGroup(0,this.computeGroup),a.setPipeline(this.framesPipeline),a.dispatchWorkgroups(Math.ceil(this.counts.segments/64)),a.setPipeline(this.ringsPipeline),a.dispatchWorkgroups(Math.ceil(this.counts.vertices/64)),a.end(),this.dirty=!1}draw(t,a,s=0){if(!this.counts.segments)return 0;let r=this.globalScratch;return r.fill(0),r.set(a,0),r.set([.35,-.45,.82,0],16),r[20]=s,this.device.queue.writeBuffer(this.globals,0,r),t.setPipeline(this.drawPipeline),t.setBindGroup(0,this.drawGroup),t.setVertexBuffer(0,this.buffers.vertices),t.setIndexBuffer(this.buffers.indices,"uint32"),t.drawIndexed(this.counts.indices),this.counts.indices/3}gpuMemoryBytes(){return Object.values(this.buffers).reduce((t,a)=>t+a.size,0)}dispose(){for(let t of Object.values(this.buffers))t.destroy();this.globals.destroy(),this.countBuffer.destroy(),this.buffers={}}};var hy=[0,0,0,1,1,1],Ar=class e{static async create(t){return new e(await oa.create(t))}constructor(t){this.host=t,this.canvas=t.canvas,this.device=t.device,t.alwaysInstanced=!0,t.setOccurrences([]),this.assets=new Map,this.order=[],this.frameStats={triangles:0,draws:0},this.lodThresholds={...st},this.tubes=null,this.tubeVersion=0}setTubes(t,a){!t.length&&!this.tubes||(this.tubes??=new Ir(this.host),this.tubes.setTubes(t,a),this.tubeVersion+=1)}setTubeColors(t){this.tubes?.setColors(t),this.tubeVersion+=1}asset(t){let a=this.assets.get(t);return a||(a=new oa(this.canvas,this.device,{shareFrom:this.host}),a.setLodThresholds(this.lodThresholds),this.assets.set(t,a)),a}standIn(t,a){let s=this.asset(t);return s.standIn||(s.standIn=!0,s.setBoardBounds(hy),s.setLodOverride(Ul)),s.boxColor=[...a],s}removeAsset(t){let a=this.assets.get(t);a&&(a.dispose(),this.assets.delete(t))}get renderers(){return this.order.map(t=>this.assets.get(t)).filter(Boolean)}setOccurrences(t){this.order=[...t.keys()].filter(s=>this.assets.has(s));for(let[s,r]of this.assets)t.has(s)||r.setOccurrences([]);for(let s of this.order)this.assets.get(s).setOccurrences(t.get(s));let a=0;for(let s of this.renderers)s.occurrenceBase=a,a+=s.occurrenceCount;this.occurrenceCount=a}locate(t){for(let a of this.renderers){let s=t-a.occurrenceBase;if(s>=0&&s<a.occurrenceCount)return{renderer:a,local:s}}return null}keyOf(t){let a=this.locate(t);return a?a.renderer.occurrenceKeys[a.local]??null:null}setSelectedOccurrence(t){let a=t>=0?this.locate(t):null;for(let s of this.renderers)s.selectedOccurrence=!s.standIn&&a?.renderer===s?a.local:-1}resize(){this.host.resize()}render(t,a){let s=this.host;s.resize();let r=this.renderers.filter(u=>u.occurrenceCount>0),n=new Map(r.map(u=>[u,a(u)]));for(let[u,g]of n)zd(u,g);let i=this.device.createCommandEncoder(),o=r.filter(u=>u.encodeCull(i,t));this.tubes?.encodeCompute(i);let c=i.beginRenderPass({colorAttachments:[s.colorAttachment(s.context.getCurrentTexture().createView())],depthStencilAttachment:s.depthAttachment()});Gd(c,t.viewport,this.canvas);let l=0,f=0;for(let u of r){let g=u.encodeDraws(c,t,n.get(u));l+=g.triangles,f+=g.draws}this.tubes?.counts.segments&&(l+=this.tubes.draw(c,t.matrix,performance.now()/1e3),f+=1),c.end(),this.device.queue.submit([i.finish()]);for(let u of o)u.readCullCounts();this.frameStats={triangles:Math.round(l),draws:f}}pick(t,a,s,r){let n=this.host.pickSerial.then(()=>this.performPick(t,a,s,r));return this.host.pickSerial=n.catch(()=>0),n}async performPick(t,a,s,r){let n=this.host;n.resize();let i=Math.max(0,Math.min(this.canvas.width-1,Math.floor(a))),o=Math.max(0,Math.min(this.canvas.height-1,Math.floor(s))),c=this.device.createCommandEncoder(),l=c.beginRenderPass({colorAttachments:[{view:n.pickTexture.createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}],depthStencilAttachment:n.depthAttachment(!0)});Gd(l,t.viewport,this.canvas);for(let g of this.renderers){if(g.occurrenceCount===0)continue;let b=r(g);zd(g,b),g.encodePick(l,t,b)}l.end();let f=await n.readPick(c,i,o),u=f.occurrenceIndex>=0?this.locate(f.occurrenceIndex):null;return{...f,occurrenceKey:u?u.renderer.occurrenceKeys[u.local]??null:null,renderer:u?.renderer||null,standIn:!!u?.renderer?.standIn}}gpuMemoryBytes(){let t=0;for(let a of this.renderers)t+=a.gpuMemoryBytes();return t+=this.tubes?.gpuMemoryBytes()||0,t+=this.host.arenaSlackBytes(),t-Math.max(0,this.renderers.length-1)*this.canvas.width*this.canvas.height*12}gpuMemoryBreakdown(){let t={};for(let[a,s]of this.assets){let r=s.gpuMemoryBreakdown();delete r.targets,t[a]=r}return{assets:t,tubes:this.tubes?.gpuMemoryBytes()||0,targets:this.canvas.width*this.canvas.height*12,arena:this.host.arenaStats()}}setLodThresholds(t){this.lodThresholds=Ma({...this.lodThresholds,...t});for(let a of this.assets.values())a.setLodThresholds(this.lodThresholds);return{...this.lodThresholds}}cullCounts(){let t={full:0,board:0,body:0,box:0,culled:0};for(let a of this.renderers)if(a.occurrenceCount)for(let s of Object.keys(t))t[s]+=a.cullCounts[s]||0;return t}dispose(){for(let t of[...this.assets.keys()])this.removeAsset(t);this.tubes?.dispose(),this.tubes=null,this.host.dispose(),this.host.context?.unconfigure?.(),this.device.destroy?.()}};function zd(e,t){t?.layerOffsets&&e.device.queue.writeBuffer(e.layerOffsetBuffer,0,t.layerOffsets)}function Gd(e,t,a){let s=Math.max(0,Math.min(a.width-1,Math.floor(t.x))),r=Math.max(0,Math.min(a.height-1,Math.floor(t.y))),n=Math.max(1,Math.min(a.width-s,Math.floor(t.width))),i=Math.max(1,Math.min(a.height-r,Math.floor(t.height)));e.setViewport(s,r,n,i,0,1),e.setScissorRect(s,r,n,i)}var by=`
struct Globals {
  camera: vec4f,
  viewport: vec2f,
  activeNet: u32,
  _pad: u32,
};
struct Page {
  originSize: vec4f,
  flags: vec4f,
};
@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<uniform> page: Page;
@group(0) @binding(2) var pageSampler: sampler;
@group(0) @binding(3) var pageTexture: texture_2d<f32>;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex fn vs(@builtin(vertex_index) index: u32) -> VertexOut {
  var positions = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0)
  );
  let uv = positions[index];
  let world = page.originSize.xy + uv * page.originSize.zw;
  let halfViewport = globals.viewport * globals.camera.z * 0.5;
  let clip = vec2f(
    (world.x - globals.camera.x) / halfViewport.x,
    -(world.y - globals.camera.y) / halfViewport.y
  );
  var out: VertexOut;
  out.position = vec4f(clip, 0.0, 1.0);
  out.uv = uv;
  return out;
}

@fragment fn fs(input: VertexOut) -> @location(0) vec4f {
  let sampled = textureSample(pageTexture, pageSampler, input.uv);
  let edge = min(min(input.uv.x, 1.0 - input.uv.x), min(input.uv.y, 1.0 - input.uv.y));
  let selected = page.flags.x > 0.5;
  let containsNet = page.flags.y > 0.5;
  let hasActiveNet = page.flags.z > 0.5;
  let nativeDetail = page.flags.w > 0.5;
  if (edge < 0.006) {
    if (containsNet) { return vec4f(0.12, 0.92, 0.35, 1.0); }
    if (selected) { return vec4f(0.12, 0.45, 0.95, 1.0); }
    return vec4f(0.28, 0.32, 0.39, 1.0);
  }
  if (nativeDetail) {
    return vec4f(0.925, 0.918, 0.865, 1.0);
  }
  var dim = 1.0;
  if (hasActiveNet) {
    dim = 0.42;
    if (containsNet) {
      dim = 1.0;
    }
  }
  return vec4f(sampled.rgb * dim, 1.0);
}`,py=`
struct Globals {
  camera: vec4f,
  viewport: vec2f,
  activeNet: u32,
  _pad: u32,
};
@group(0) @binding(0) var<uniform> globals: Globals;
struct Out { @builtin(position) position: vec4f };
@vertex fn vs(@location(0) world: vec2f) -> Out {
  let halfViewport = globals.viewport * globals.camera.z * 0.5;
  let clip = vec2f(
    (world.x - globals.camera.x) / halfViewport.x,
    -(world.y - globals.camera.y) / halfViewport.y
  );
  var out: Out;
  out.position = vec4f(clip, 0.4, 1.0);
  return out;
}
@fragment fn fs() -> @location(0) vec4f {
  return vec4f(0.22, 0.48, 0.82, 0.82);
}`,gy=`
struct Globals {
  camera: vec4f,
  viewport: vec2f,
  activeNet: u32,
  _pad: u32,
};
@group(0) @binding(0) var<uniform> globals: Globals;
struct Out { @builtin(position) position: vec4f };
@vertex fn vs(@location(0) world: vec2f) -> Out {
  let halfViewport = globals.viewport * globals.camera.z * 0.5;
  let clip = vec2f(
    (world.x - globals.camera.x) / halfViewport.x,
    -(world.y - globals.camera.y) / halfViewport.y
  );
  var out: Out;
  out.position = vec4f(clip, 0.2, 1.0);
  return out;
}
@fragment fn fs() -> @location(0) vec4f {
  return vec4f(0.08, 1.0, 0.27, 0.96);
}`,my=`
struct Globals {
  camera: vec4f,
  viewport: vec2f,
  activeNet: u32,
  _pad: u32,
};
@group(0) @binding(0) var<uniform> globals: Globals;
struct Out {
  @builtin(position) position: vec4f,
  @location(0) distance: f32,
  @location(1) kind: f32,
};
@vertex fn vs(@location(0) world: vec2f, @location(1) flow: vec2f) -> Out {
  let halfViewport = globals.viewport * globals.camera.z * 0.5;
  let clip = vec2f(
    (world.x - globals.camera.x) / halfViewport.x,
    -(world.y - globals.camera.y) / halfViewport.y
  );
  var out: Out;
  out.position = vec4f(clip, 0.05, 1.0);
  out.distance = flow.x;
  out.kind = flow.y;
  return out;
}
@fragment fn fs(input: Out) -> @location(0) vec4f {
  let selected = input.kind > 1.5;
  let intersheet = input.kind > 0.5 && !selected;
  var speed = 0.62;
  var period = 18.0;
  if (intersheet || selected) {
    speed = 0.88;
    period = 28.0;
  }
  let phase = fract(input.distance / period - globals.camera.w * speed);
  let dash = smoothstep(0.04, 0.13, phase) * (1.0 - smoothstep(0.38, 0.52, phase));
  let intraBase = vec3f(0.94, 0.48, 0.12);
  let intraDash = vec3f(1.0, 0.86, 0.24);
  let interBase = vec3f(0.10, 0.46, 0.92);
  let interDash = vec3f(0.42, 0.82, 1.0);
  let selectedBase = vec3f(0.08, 1.0, 0.34);
  let selectedDash = vec3f(0.86, 1.0, 0.72);
  var base = intraBase;
  var bright = intraDash;
  if (intersheet) {
    base = interBase;
    bright = interDash;
  }
  if (selected) {
    base = selectedBase;
    bright = selectedDash;
  }
  let color = base + (bright - base) * dash;
  var alpha = 0.24 + dash * 0.54;
  if (intersheet) {
    alpha = 0.30 + dash * 0.54;
  }
  if (selected) {
    alpha = 0.44 + dash * 0.50;
  }
  return vec4f(color, alpha);
}`,yy=`
struct Globals {
  camera: vec4f,
  viewport: vec2f,
  activeNet: u32,
  _pad: u32,
};
@group(0) @binding(0) var<uniform> globals: Globals;
struct Out {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
};
@vertex fn vs(@location(0) world: vec2f, @location(1) color: vec4f) -> Out {
  let halfViewport = globals.viewport * globals.camera.z * 0.5;
  let clip = vec2f(
    (world.x - globals.camera.x) / halfViewport.x,
    -(world.y - globals.camera.y) / halfViewport.y
  );
  var out: Out;
  out.position = vec4f(clip, 0.1, 1.0);
  out.color = color;
  return out;
}
@fragment fn fs(input: Out) -> @location(0) vec4f {
  return input.color;
}`,xy=`
struct Globals {
  camera: vec4f,
  viewport: vec2f,
  activeNet: u32,
  _pad: u32,
};
struct ImageQuad {
  originSize: vec4f,
  flags: vec4f,
};
@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<uniform> imageQuad: ImageQuad;
@group(0) @binding(2) var imageSampler: sampler;
@group(0) @binding(3) var imageTexture: texture_2d<f32>;

struct Out {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex fn vs(@builtin(vertex_index) index: u32) -> Out {
  var positions = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0)
  );
  let uv = positions[index];
  let world = imageQuad.originSize.xy + uv * imageQuad.originSize.zw;
  let halfViewport = globals.viewport * globals.camera.z * 0.5;
  let clip = vec2f(
    (world.x - globals.camera.x) / halfViewport.x,
    -(world.y - globals.camera.y) / halfViewport.y
  );
  var out: Out;
  out.position = vec4f(clip, 0.08, 1.0);
  out.uv = uv;
  return out;
}

@fragment fn fs(input: Out) -> @location(0) vec4f {
  return textureSample(imageTexture, imageSampler, input.uv);
}`,wy=`
struct Globals {
  camera: vec4f,
  viewport: vec2f,
  activeNet: u32,
  _pad: u32,
};
@group(0) @binding(0) var<uniform> globals: Globals;
struct Out {
  @builtin(position) position: vec4f,
  @location(0) featureId: u32,
};
@vertex fn vs(@location(0) world: vec2f, @location(1) featureId: u32) -> Out {
  let halfViewport = globals.viewport * globals.camera.z * 0.5;
  let clip = vec2f(
    (world.x - globals.camera.x) / halfViewport.x,
    -(world.y - globals.camera.y) / halfViewport.y
  );
  var out: Out;
  out.position = vec4f(clip, 0.0, 1.0);
  out.featureId = featureId;
  return out;
}
@fragment fn fs(input: Out) -> @location(0) u32 {
  return input.featureId;
}`,vy=6.2,My=4.6,ky=3.8,Rr=4*1024*1024,Ey=Math.floor(Rr/6),Kd=Ey*6,_r=512*1024,Vd=512*1024,Hd=96,Sy=96,Ty=18,qd=96*1024*1024,Iy=2,Br=class e{static async create(t,a){if(!navigator.gpu)throw new Error("WebGPU is unavailable in this browser");let s=await navigator.gpu.requestAdapter({powerPreference:"high-performance"});if(!s)throw new Error("No WebGPU adapter is available");let r=await s.requestDevice(),n=await fetch(a,{cache:"default"});if(!n.ok)throw new Error(`Failed to load schematic manifest: ${n.status}`);let i=await n.json();if(!["prism.schematic_world_a0","prism.schematic_vector_a0"].includes(i.schema))throw new Error(`Unsupported schematic scene schema: ${i.schema}`);let o=i.featureTable||i.features,c=await fetch(new URL(o,a),{cache:"default"});if(!c.ok)throw new Error(`Failed to load schematic features: ${c.status}`);let l=_y(await c.json());return new e(t,r,a,i,l)}constructor(t,a,s,r,n){this.canvas=t,this.device=a,this.manifestUrl=s,this.manifest=r,this.isNativeScene=r.schema==="prism.schematic_vector_a0",this.pages=r.pages||[],this.featuresByPage=n,this.featuresById=new Map;for(let b of Object.values(n))for(let h of b)this.featuresById.set(Number(h.id),h);this.context=t.getContext("webgpu"),this.format=navigator.gpu.getPreferredCanvasFormat(),this.context.configure({device:a,format:this.format,alphaMode:"opaque"}),this.flowCanvas=null,this.flowContext=null,this.globalBuffer=a.createBuffer({size:48,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.bindGroupLayout=a.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:2,visibility:GPUShaderStage.FRAGMENT,sampler:{type:"filtering"}},{binding:3,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:"float"}}]});let i=a.createShaderModule({code:by});this.pagePipeline=a.createRenderPipeline({layout:a.createPipelineLayout({bindGroupLayouts:[this.bindGroupLayout]}),vertex:{module:i,entryPoint:"vs"},fragment:{module:i,entryPoint:"fs",targets:[{format:this.format}]},primitive:{topology:"triangle-list"}}),this.edgeLayout=a.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}}]});let o=a.createShaderModule({code:py});this.edgePipeline=a.createRenderPipeline({layout:a.createPipelineLayout({bindGroupLayouts:[this.edgeLayout]}),vertex:{module:o,entryPoint:"vs",buffers:[{arrayStride:8,attributes:[{shaderLocation:0,offset:0,format:"float32x2"}]}]},fragment:{module:o,entryPoint:"fs",targets:[{format:this.format,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"line-list"}}),this.edgeBindGroup=a.createBindGroup({layout:this.edgeLayout,entries:[{binding:0,resource:{buffer:this.globalBuffer}}]});let c=a.createShaderModule({code:gy});this.highlightPipeline=a.createRenderPipeline({layout:a.createPipelineLayout({bindGroupLayouts:[this.edgeLayout]}),vertex:{module:c,entryPoint:"vs",buffers:[{arrayStride:8,attributes:[{shaderLocation:0,offset:0,format:"float32x2"}]}]},fragment:{module:c,entryPoint:"fs",targets:[{format:this.format,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"line-list"}}),this.highlightBufferSize=4*1024*1024,this.highlightBuffer=a.createBuffer({size:this.highlightBufferSize,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});let l=a.createShaderModule({code:my});this.netFlowPipeline=a.createRenderPipeline({layout:a.createPipelineLayout({bindGroupLayouts:[this.edgeLayout]}),vertex:{module:l,entryPoint:"vs",buffers:[{arrayStride:16,attributes:[{shaderLocation:0,offset:0,format:"float32x2"},{shaderLocation:1,offset:8,format:"float32x2"}]}]},fragment:{module:l,entryPoint:"fs",targets:[{format:this.format,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"triangle-list"}}),this.netFlowBuffer=a.createBuffer({size:Vd*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),this.globalUniformScratch=new Float32Array(12),this.pageUniformScratch=new Float32Array(8),this.imageUniformScratch=new Float32Array(8),this.vectorScratch=new Float32Array(Rr),this.highlightScratch=new Float32Array(this.highlightBufferSize/4),this.netFlowScratch=new Float32Array(Vd),this.netTrackingCache=null,this.selectedIntrasheetLinkIndex=-1,this.truncatedHighlightCount=0,this.truncatedVectorCount=0,this.frameSerial=0,this.querySerial=0;let f=a.createShaderModule({code:yy});this.vectorPipeline=a.createRenderPipeline({layout:a.createPipelineLayout({bindGroupLayouts:[this.edgeLayout]}),vertex:{module:f,entryPoint:"vs",buffers:[{arrayStride:24,attributes:[{shaderLocation:0,offset:0,format:"float32x2"},{shaderLocation:1,offset:8,format:"float32x4"}]}]},fragment:{module:f,entryPoint:"fs",targets:[{format:this.format,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"triangle-list"}}),this.vectorBuffer=a.createBuffer({size:Rr*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),this.vectorBuffers=[this.vectorBuffer];let u=a.createShaderModule({code:xy});this.imagePipeline=a.createRenderPipeline({layout:a.createPipelineLayout({bindGroupLayouts:[this.bindGroupLayout]}),vertex:{module:u,entryPoint:"vs"},fragment:{module:u,entryPoint:"fs",targets:[{format:this.format,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"triangle-list"}});let g=a.createShaderModule({code:wy});this.pickPipeline=a.createRenderPipeline({layout:a.createPipelineLayout({bindGroupLayouts:[this.edgeLayout]}),vertex:{module:g,entryPoint:"vs",buffers:[{arrayStride:12,attributes:[{shaderLocation:0,offset:0,format:"float32x2"},{shaderLocation:1,offset:8,format:"uint32"}]}]},fragment:{module:g,entryPoint:"fs",targets:[{format:"r32uint"}]},primitive:{topology:"triangle-list"}}),this.pickVertexBuffer=a.createBuffer({size:_r*12,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),this.pickReadBuffer=a.createBuffer({size:256,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST}),this.pickTexture=null,this.pickTextureSize=[0,0],this.pickPending=!1,this.vectorChunks=new Map,this.failedVectorChunks=new Map,this.nativeDetailState=new Map,this.domDetailPageIds=new Set,this.nativeDetailThresholds=new Map,this.residentVectorBytes=0,this.sampler=a.createSampler({magFilter:"linear",minFilter:"linear",mipmapFilter:"linear"}),this.placeholder=this.createSolidTexture([245,247,249,255]),this.pageResources=new Map,this.imageResources=new Map,this.loading=new Map,this.selectedPageId="",this.selectedFeatureId=0,this.activeNetUid="",this.showHierarchy=!0,this.downloadedBytes=0,this.world=r.worldBoundsMm,this.center=[(this.world.minX+this.world.maxX)/2,(this.world.minY+this.world.maxY)/2],this.scale=Math.max((this.world.maxX-this.world.minX)/900,(this.world.maxY-this.world.minY)/650,.1)*1.16,this.edgeBuffer=this.createEdgeBuffer();for(let b of this.pages)this.createPageResource(b)}createSolidTexture(t){let a=this.device.createTexture({size:[1,1],format:"rgba8unorm-srgb",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});return this.device.queue.writeTexture({texture:a},new Uint8Array(t),{bytesPerRow:4},[1,1]),a}createPageResource(t){let a=this.device.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),s={page:t,uniform:a,texture:this.placeholder,textureWidth:0,svgBlob:null,bindGroup:null};this.pageResources.set(t.id,s),this.updateBindGroup(s)}createImageResource(t){let a=this.device.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),s={path:t,uniform:a,texture:this.placeholder,loaded:!1,bindGroup:null};return this.imageResources.set(t,s),this.updateBindGroup(s),s}updateBindGroup(t){t.bindGroup=this.device.createBindGroup({layout:this.bindGroupLayout,entries:[{binding:0,resource:{buffer:this.globalBuffer}},{binding:1,resource:{buffer:t.uniform}},{binding:2,resource:this.sampler},{binding:3,resource:t.texture.createView()}]})}async loadImageTexture(t){let a=this.imageResources.get(t)||this.createImageResource(t);if(a.loaded)return a;let s=`image:${t}`;if(this.loading.has(s))return this.loading.get(s);let r=(async()=>{try{let n=await fetch(new URL(t,this.manifestUrl),{cache:"default"});if(!n.ok)throw new Error(`Failed to load schematic image ${t}: ${n.status}`);let i=await n.blob(),o=await createImageBitmap(i),c=this.device.createTexture({size:[o.width,o.height],format:"rgba8unorm-srgb",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});this.device.queue.copyExternalImageToTexture({source:o},{texture:c},[o.width,o.height]),o.close(),a.texture!==this.placeholder&&a.texture.destroy(),a.texture=c,a.loaded=!0,this.updateBindGroup(a)}finally{this.loading.delete(s)}return a})();return this.loading.set(s,r),r}createEdgeBuffer(){let t=new Map(this.pages.map(n=>[n.id,n])),a=[];for(let n of this.manifest.edges||[]){let i=t.get(n.source),o=t.get(n.target);!i||!o||a.push(i.worldX+i.widthMm/2,i.worldY+i.heightMm,o.worldX+o.widthMm/2,o.worldY)}let s=new Float32Array(a);if(!s.length)return null;let r=this.device.createBuffer({size:s.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});return this.device.queue.writeBuffer(r,0,s),{buffer:r,count:s.length/2}}resize(){let t=Math.min(devicePixelRatio||1,2),a=Math.max(1,Math.floor(this.canvas.clientWidth*t)),s=Math.max(1,Math.floor(this.canvas.clientHeight*t));(this.canvas.width!==a||this.canvas.height!==s)&&(this.canvas.width=a,this.canvas.height=s),this.flowCanvas&&(this.flowCanvas.width!==a||this.flowCanvas.height!==s)&&(this.flowCanvas.width=a,this.flowCanvas.height=s)}setFlowOverlayCanvas(t){t&&(this.flowCanvas=t,this.flowContext=t.getContext("webgpu"),this.flowContext.configure({device:this.device,format:this.format,alphaMode:"premultiplied"}))}writeGlobals(){let t=this.globalUniformScratch;t[0]=this.center[0],t[1]=this.center[1],t[2]=this.scale,t[3]=performance.now()*.001,t[4]=this.canvas.width,t[5]=this.canvas.height,this.device.queue.writeBuffer(this.globalBuffer,0,t)}pagePixelWidth(t){return t.widthMm/this.scale}pageSourcePixelsPerMm(t){let a=this.pagePixelWidth(t)/Math.max(1,t.sourceWidthMm||t.widthMm),s=t.heightMm/this.scale/Math.max(1,t.sourceHeightMm||t.heightMm);return Math.min(a,s)}pageNativeDetailThresholds(t){let a=this.nativeDetailThresholds.get(t.id);if(a)return a;let s=Math.max(1,t.sourceWidthMm||t.widthMm),r=Math.max(1,t.sourceHeightMm||t.heightMm),n=s*r,i=Math.max(0,t.featureCount||t.featureIds?.length||0)/Math.max(1,n),o=ce(1-i*72,.84,1.08),c=ce(Math.sqrt(Math.max(s,r)/Math.max(1,Math.min(s,r)))/1.18,.92,1.14),l=ce(vy*o*c,5,7.4),f={enter:l,exit:ce(Math.min(l-1.2,My*o),3.8,l-.7),prefetch:ce(Math.min(l-2,ky*o),3,l-1)};return this.nativeDetailThresholds.set(t.id,f),f}pageWantsNativeDetail(t){if(!this.pageHasNativeDetail(t))return!1;let a=this.pageSourcePixelsPerMm(t),s=this.nativeDetailState.get(t.id)===!0,r=this.pageNativeDetailThresholds(t),n=s?r.exit:r.enter,i=a>=n;return i!==s&&this.nativeDetailState.set(t.id,i),i}pageNativeDetailReady(t){if(this.domDetailPageIds.has(t.id)||!this.pageWantsNativeDetail(t))return!1;let a=this.vectorChunks.get(t.id);return!a?.loaded||!a.segments?.length&&!a.fills?.length?!1:this.visibleNativeImagesReady(t,a)}visibleNativeImagesReady(t,a){if(!a?.images?.length)return!0;let s=this.sourceViewportBounds(t,4),r=!0;for(let n of a.images){if(!xt(n.bounds,s))continue;(this.imageResources.get(n.path)||this.createImageResource(n.path)).loaded||(r=!1,this.loadImageTexture(n.path).catch(()=>{}))}return r}visiblePages(){let t=this.canvas.width*this.scale/2,a=this.canvas.height*this.scale/2,s=this.center[0]-t,r=this.center[0]+t,n=this.center[1]-a,i=this.center[1]+a;return this.pages.filter(o=>o.worldX+o.widthMm>=s&&o.worldX<=r&&o.worldY+o.heightMm>=n&&o.worldY<=i)}worldViewportBounds(t=0){let a=this.canvas.width*this.scale/2,s=this.canvas.height*this.scale/2;return[this.center[0]-a-t,this.center[1]-s-t,this.center[0]+a+t,this.center[1]+s+t]}sourceViewportBounds(t,a=2.5){let s=this.worldViewportBounds(this.scale*8),r=(s[0]-t.worldX)/t.widthMm*t.sourceWidthMm-a,n=(s[1]-t.worldY)/t.heightMm*t.sourceHeightMm-a,i=(s[2]-t.worldX)/t.widthMm*t.sourceWidthMm+a,o=(s[3]-t.worldY)/t.heightMm*t.sourceHeightMm+a;return[Math.max(-a,Math.min(r,i)),Math.max(-a,Math.min(n,o)),Math.min(t.sourceWidthMm+a,Math.max(r,i)),Math.min(t.sourceHeightMm+a,Math.max(n,o))]}render(){this.frameSerial+=1,this.resize(),this.writeGlobals();let t=this.visiblePages(),a=this.device.createCommandEncoder(),s=a.beginRenderPass({colorAttachments:[{view:this.context.getCurrentTexture().createView(),clearValue:{r:.045,g:.055,b:.073,a:1},loadOp:"clear",storeOp:"store"}]});this.showHierarchy&&this.edgeBuffer&&(s.setPipeline(this.edgePipeline),s.setBindGroup(0,this.edgeBindGroup),s.setVertexBuffer(0,this.edgeBuffer.buffer),s.draw(this.edgeBuffer.count)),s.setPipeline(this.pagePipeline);for(let i of t){let o=this.pageResources.get(i.id),c=this.activeNetUid&&i.netUids.includes(this.activeNetUid),l=this.domDetailPageIds.has(i.id),f=!l&&this.pageNativeDetailReady(i),u=this.pageUniformScratch;u[0]=i.worldX,u[1]=i.worldY,u[2]=i.widthMm,u[3]=i.heightMm,u[4]=i.id===this.selectedPageId?1:0,u[5]=c?1:0,u[6]=this.activeNetUid?1:0,u[7]=f||l?1:0,this.device.queue.writeBuffer(o.uniform,0,u),s.setBindGroup(0,o.bindGroup),s.draw(6);let g=ce(Math.ceil(this.pagePixelWidth(i)*1.3/512)*512,512,6144);o.textureWidth<g*.82&&this.loadPageTexture(i,g).catch(()=>{})}this.scheduleVisibleVectorLoads(t),this.drawVisibleImages(s,t),this.drawVisibleVectors(s,t);let r=this.writeNetTrackingOverlay();r&&!this.flowContext&&(s.setPipeline(this.netFlowPipeline),s.setBindGroup(0,this.edgeBindGroup),s.setVertexBuffer(0,this.netFlowBuffer),s.draw(r));let n=this.writeNetHighlights(t);return n&&(s.setPipeline(this.highlightPipeline),s.setBindGroup(0,this.edgeBindGroup),s.setVertexBuffer(0,this.highlightBuffer),s.draw(n)),s.end(),this.device.queue.submit([a.finish()]),this.renderFlowOverlay(r),this.evictVectorChunks(t),t}renderFlowOverlay(t){if(!this.flowContext)return;let a=this.device.createCommandEncoder(),s=a.beginRenderPass({colorAttachments:[{view:this.flowContext.getCurrentTexture().createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}]});t&&(s.setPipeline(this.netFlowPipeline),s.setBindGroup(0,this.edgeBindGroup),s.setVertexBuffer(0,this.netFlowBuffer),s.draw(t)),s.end(),this.device.queue.submit([a.finish()])}drawVisibleImages(t,a){if(!this.isNativeScene)return;let s=!1;for(let r of a){if(this.domDetailPageIds.has(r.id)||!this.pageNativeDetailReady(r))continue;let n=this.vectorChunks.get(r.id);if(!n?.images?.length)continue;let i=this.sourceViewportBounds(r,4);for(let o of n.images){if(!xt(o.bounds,i))continue;let c=this.imageResources.get(o.path)||this.createImageResource(o.path);c.loaded||this.loadImageTexture(o.path).catch(()=>{});let l=o.worldOrigin||this.sourceToWorld(r,[o.xMm,o.yMm]),f=o.worldSize||this.sourceSizeToWorld(r,o.widthMm,o.heightMm),u=this.imageUniformScratch;u[0]=l[0],u[1]=l[1],u[2]=f[0],u[3]=f[1],u[4]=0,u[5]=0,u[6]=0,u[7]=0,this.device.queue.writeBuffer(c.uniform,0,u),s||(t.setPipeline(this.imagePipeline),s=!0),t.setBindGroup(0,c.bindGroup),t.draw(6)}}}drawVisibleVectors(t,a){if(!this.isNativeScene)return 0;let s=this.vectorScratch,r=0,n=0,i=0,o=0,c=!1,l=()=>{if(!r)return;let u=this.vectorBuffers[o];u||(u=this.device.createBuffer({size:Rr*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),this.vectorBuffers.push(u)),this.device.queue.writeBuffer(u,0,s,0,r),c||(t.setPipeline(this.vectorPipeline),t.setBindGroup(0,this.edgeBindGroup),c=!0);let g=Math.floor(r/6);t.setVertexBuffer(0,u),t.draw(g),i+=g,o+=1,r=0},f=u=>u>Kd||u>s.length?(n+=1,!1):((r+u>Kd||r+u>s.length)&&l(),!0);for(let u of a){if(this.domDetailPageIds.has(u.id)||!this.pageHasNativeDetail(u))continue;let g=this.vectorChunks.get(u.id);if(!g?.segments?.length&&!g?.fills?.length||!this.pageNativeDetailReady(u))continue;g.lastUsedFrame=this.frameSerial;let b=this.sourceViewportBounds(u),h=Xd(g.spatial,b);for(let d of h.fills){if(!xt(d.bounds,b)||!f(18))continue;let x=this.featuresById.get(d.featureId),p=this.activeNetUid&&x?.netUid===this.activeNetUid,y=this.selectedFeatureId===d.featureId?[.24,.58,1,1]:p?[.06,1,.24,1]:this.activeNetUid&&os(x)?Qd(x,d.kind,d.color):Li(x,d.kind,d.color),v=d.worldPoints||d.points.map(E=>this.sourceToWorld(u,E));r=qy(s,r,v[0],v[1],v[2],y)}for(let d of h.segments){if(!xt(d.bounds,b))continue;let x=this.featuresById.get(d.featureId),p=this.activeNetUid&&x?.netUid===this.activeNetUid,m=this.selectedFeatureId===d.featureId,y=m?[.24,.58,1,1]:p?[.06,1,.24,1]:this.activeNetUid&&os(x)?Qd(x,d.kind,d.color):Li(x,d.kind,d.color),v=this.segmentWorldWidth(u,d,x,p||m);for(let E of this.visibleSegmentParts(u,d,x)){if(!f(36))continue;let S=E.worldA||this.sourceToWorld(u,E.a),T=E.worldB||this.sourceToWorld(u,E.b);r=Hy(s,r,S,T,v,y)}}}return l(),this.truncatedVectorCount=n,this.vectorTruncated=n>0,this.lastVectorVertices=i,this.lastVectorChunks=o,i}pageHasNativeDetail(t){return this.isNativeScene?t?.nativeDetail?.enabled!==!1:!1}scheduleVisibleVectorLoads(t){if(!this.isNativeScene)return;let a=[...this.vectorChunks.values()].filter(n=>n?.promise&&!n.loaded).length,s=Math.max(0,Iy-a);if(!s)return;let r=t.filter(n=>!this.domDetailPageIds.has(n.id)).filter(n=>this.pageHasNativeDetail(n)&&this.pageSourcePixelsPerMm(n)>=this.pageNativeDetailThresholds(n).prefetch).filter(n=>!this.vectorChunks.get(n.id)?.loaded&&!this.vectorChunks.get(n.id)?.promise).sort((n,i)=>{let o=Math.hypot(n.worldX+n.widthMm/2-this.center[0],n.worldY+n.heightMm/2-this.center[1]),c=Math.hypot(i.worldX+i.widthMm/2-this.center[0],i.worldY+i.heightMm/2-this.center[1]);return o-c});for(let n of r)if(this.loadPageVectors(n).catch(()=>{}),s-=1,!s)break}featurePrimitiveBounds(t,a){let s=this.vectorChunks.get(t.id);if(!s?.segments?.length&&!s?.fills?.length)return null;let r=[],n=[];for(let i of s.segments||[])i.featureId===a&&(r.push(i.a[0],i.b[0]),n.push(i.a[1],i.b[1]));for(let i of s.fills||[])if(i.featureId===a)for(let o of i.points||[])r.push(o[0]),n.push(o[1]);return r.length?[Math.min(...r),Math.min(...n),Math.max(...r),Math.max(...n)]:null}symbolClipBounds(t){if(this._symbolClipBounds||(this._symbolClipBounds=new Map),this._symbolClipBounds.has(t.id))return this._symbolClipBounds.get(t.id);let a=(this.featuresByPage[t.id]||[]).filter(s=>s?.kind==="symbol_body"&&s.boundsMm&&!String(s.sourceId||"").includes(":overplot")).map(s=>{let r=this.featurePrimitiveBounds(t,s.id)||s.boundsMm;return[r[0]-.02,r[1]-.02,r[2]+.02,r[3]+.02]}).filter(s=>{let r=s[2]-s[0],n=s[3]-s[1];return Math.max(r,n)<=12&&r*n<=80});return this._symbolClipBounds.set(t.id,a),a}visibleSegmentParts(t,a,s){if(a._visibleParts)return a._visibleParts;let r=String(s?.kind||""),n=String(s?.semanticRole||"");if(r!=="wire"&&n!=="wire")return a._visibleParts=[a],a._visibleParts;let i=[a];for(let o of this.symbolClipBounds(t)){let c=[];for(let l of i)c.push(...$y(l,o));if(i=c,!i.length)break}for(let o of i)o.worldA=Sa(t,o.a),o.worldB=Sa(t,o.b);return a._visibleParts=i,a._visibleParts}netTrackingSegments(){if(!this.activeNetUid)return{netUid:"",anchorsByPage:new Map,segments:[],intrasheetSegments:[]};let t=Number(this.selectedFeatureId||0),a=String(this.selectedFeatureKey||""),s=String(this.selectedSourceId||"");if(this.netTrackingCache?.netUid===this.activeNetUid&&this.netTrackingCache?.selectedFeatureId===t&&this.netTrackingCache?.selectedFeatureKey===a&&this.netTrackingCache?.selectedSourceId===s)return this.netTrackingCache;this.selectedIntrasheetLinkIndex=-1;let r=new Map(this.pages.map(h=>[h.id,h])),n=this.manifest.netToPages?.[this.activeNetUid]||[],i=n.length?n.map(h=>r.get(h)).filter(Boolean):this.pages.filter(h=>h.netUids?.includes(this.activeNetUid)),o=new Map;for(let h of i.slice(0,Sy)){let d=this.netTrackingAnchorsForPage(h);d.length&&o.set(h.id,d)}let c=[],l=[];for(let[h,d]of o){let x=Yd(zy(d),"intrasheet",h);c.push(...x),l.push(...x)}let f=[...o.entries()].map(([h,d])=>Gy(r.get(h),d,{featureId:t,stableKey:a,sourceId:s})).filter(Boolean);c.push(...Yd(f,"intersheet",""));let u=l.map((h,d)=>({...h,intrasheetIndex:d})),g=0,b=c.map((h,d)=>{if(h.type!=="intrasheet")return{...h,id:d};let x=g;return g+=1,{...h,id:d,intrasheetIndex:x}});return this.netTrackingCache={netUid:this.activeNetUid,selectedFeatureId:t,selectedFeatureKey:a,selectedSourceId:s,anchorsByPage:o,segments:b,intrasheetSegments:u},this.selectedIntrasheetLinkIndex>=this.netTrackingCache.intrasheetSegments.length&&(this.selectedIntrasheetLinkIndex=-1),this.netTrackingCache}netTrackingAnchorsForPage(t){let a=this.featuresByPage[t.id]||[],s=[];for(let r of a){if(r.netUid!==this.activeNetUid||!r.boundsMm||!Dy(r))continue;let n=r.boundsMm,i=[(n[0]+n[2])/2,(n[1]+n[3])/2],o=this.sourceToWorld(t,i);s.push({pageId:t.id,featureId:Number(r.id||0),stableKey:String(r.stableKey||""),sourceId:String(r.sourceId||r.sourceUid||r.objectId||""),kind:r.kind||r.semanticRole||"",source:i,world:o,bounds:n,priority:Uy(r)})}return s.sort((r,n)=>n.priority-r.priority||r.source[1]-n.source[1]||r.source[0]-n.source[0]),s}writeNetTrackingOverlay(){let t=this.netTrackingSegments();if(this.lastNetFlowSegments=t.segments.length,this.lastNetFlowIntrasheetSegments=t.intrasheetSegments.length,!t.segments.length)return this.lastNetFlowVertices=0,0;let a=this.worldViewportBounds(this.scale*96),s=this.netFlowScratch,r=0,n=0;for(let i of t.segments){if(!xt(Jd(i),a))continue;let o=i.type==="intrasheet"&&i.intrasheetIndex===this.selectedIntrasheetLinkIndex,c=o?9.5:i.type==="intersheet"?8:4.8,l=o?2:i.type==="intersheet"?1:0,f=Wy(s,r,i.a,i.b,c*this.scale,l,n,this.scale);if(f!==r&&(r=f,n+=Math.hypot(i.b[0]-i.a[0],i.b[1]-i.a[1])/Math.max(this.scale,1e-6),r+24>s.length))break}return r?(this.device.queue.writeBuffer(this.netFlowBuffer,0,s,0,r),this.lastNetFlowVertices=r/4,r/4):(this.lastNetFlowVertices=0,0)}cycleNetIntrasheetLink(t=1){let a=this.netTrackingSegments();if(!a.intrasheetSegments.length)return null;let s=a.intrasheetSegments.length;this.selectedIntrasheetLinkIndex=(this.selectedIntrasheetLinkIndex+t+s)%s;let r=a.intrasheetSegments[this.selectedIntrasheetLinkIndex];if(!r)return null;let n=Jd(r,14*this.scale);return this.center=[(n[0]+n[2])/2,(n[1]+n[3])/2],this.scale=Math.max((n[2]-n[0])/Math.max(1,this.canvas.width*.36),(n[3]-n[1])/Math.max(1,this.canvas.height*.3),this.scale*.35,.025),{pageId:r.pageId,segment:r}}writeNetHighlights(t){if(!this.activeNetUid)return 0;let a=this.highlightScratch,s=0,r=0;for(let n of t){let i=this.sourceViewportBounds(n,5);for(let o of this.featuresByPage[n.id]||[]){if(o.netUid!==this.activeNetUid||!o.boundsMm||!xt(o.boundsMm,i))continue;let c=this.featureWorldBounds(n,o.boundsMm);if(s+16>a.length){r+=1;continue}a[s++]=c[0],a[s++]=c[1],a[s++]=c[2],a[s++]=c[1],a[s++]=c[2],a[s++]=c[1],a[s++]=c[2],a[s++]=c[3],a[s++]=c[2],a[s++]=c[3],a[s++]=c[0],a[s++]=c[3],a[s++]=c[0],a[s++]=c[3],a[s++]=c[0],a[s++]=c[1]}}return this.truncatedHighlightCount=r,s?(this.device.queue.writeBuffer(this.highlightBuffer,0,a,0,s),s/2):0}featureWorldBounds(t,a){return[t.worldX+a[0]/t.sourceWidthMm*t.widthMm,t.worldY+a[1]/t.sourceHeightMm*t.heightMm,t.worldX+a[2]/t.sourceWidthMm*t.widthMm,t.worldY+a[3]/t.sourceHeightMm*t.heightMm]}sourceToWorld(t,a){return[t.worldX+a[0]/t.sourceWidthMm*t.widthMm,t.worldY+a[1]/t.sourceHeightMm*t.heightMm]}sourceSizeToWorld(t,a,s){return[a/t.sourceWidthMm*t.widthMm,s/t.sourceHeightMm*t.heightMm]}async loadPageVectors(t){if(!this.pageHasNativeDetail(t)||!t.chunks?.lod2)return null;let a=this.vectorChunks.get(t.id);if(a?.loaded)return a;if(a?.promise)return a.promise;let s=(async()=>{try{let r=await fetch(new URL(t.chunks.lod2,this.manifestUrl));if(!r.ok)throw new Error(`Failed to load schematic vector chunk ${t.id}: ${r.status}`);let n=await r.json(),i=Ry(n.primitives||[]);Ny(t,i);let c=JSON.stringify(n).length,l={loaded:!0,segments:i.segments,fills:i.fills,images:i.images,spatial:Ly(i),unsupported:n.unsupported||[],bytes:c,lastUsedFrame:this.frameSerial};return this.vectorChunks.set(t.id,l),this.failedVectorChunks.delete(t.id),this.residentVectorBytes+=c,l}catch(r){let n=this.failedVectorChunks.get(t.id)||{count:0,message:""};throw this.failedVectorChunks.set(t.id,{count:n.count+1,message:r?.message||String(r)}),this.vectorChunks.delete(t.id),r}})();return this.vectorChunks.set(t.id,{loaded:!1,promise:s,segments:[]}),s}evictVectorChunks(t){if(this.residentVectorBytes<=qd)return;let a=new Set(t.map(r=>r.id)),s=[...this.vectorChunks.entries()].filter(([,r])=>r?.loaded).filter(([r])=>!a.has(r)&&r!==this.selectedPageId).sort((r,n)=>(r[1].lastUsedFrame||0)-(n[1].lastUsedFrame||0));for(let[r,n]of s)if(this.vectorChunks.delete(r),this.residentVectorBytes=Math.max(0,this.residentVectorBytes-(n.bytes||0)),this.residentVectorBytes<=qd*.82)break}stats(){let t=this.visiblePages(),a=t.map(r=>this.pageSourcePixelsPerMm(r)),s=t.map(r=>this.pageNativeDetailThresholds(r).enter);return{residentVectorBytes:this.residentVectorBytes,vectorChunks:[...this.vectorChunks.values()].filter(r=>r?.loaded).length,vectorLoads:[...this.vectorChunks.values()].filter(r=>r?.promise&&!r.loaded).length,failedVectorChunks:this.failedVectorChunks.size,vectorVertices:this.lastVectorVertices||0,vectorDrawChunks:this.lastVectorChunks||0,truncatedVectors:this.truncatedVectorCount||0,nativeDetailPages:[...this.nativeDetailState.values()].filter(Boolean).length,nativePxPerMm:Number((Math.max(0,...a)||0).toFixed(2)),nativeThresholdPxPerMm:Number((s.length?Math.min(...s):0).toFixed(2)),domDetailPages:this.domDetailPageIds.size,netFlowSegments:this.lastNetFlowSegments||0,netFlowIntrasheetSegments:this.lastNetFlowIntrasheetSegments||0,netFlowVertices:this.lastNetFlowVertices||0}}setDomDetailPageIds(t){this.domDetailPageIds=new Set(t||[])}async loadPageTexture(t,a){let s=`${t.id}:${a}`;if(this.loading.has(s))return this.loading.get(s);let r=this.pageResources.get(t.id);if(!r||r.textureWidth>=a)return;let n=(async()=>{if(!r.svgBlob){let c=await fetch(new URL(Ay(t),this.manifestUrl));if(!c.ok)throw new Error(`Failed to load schematic page ${t.name}: ${c.status}`);r.svgBlob=await c.blob(),this.downloadedBytes+=r.svgBlob.size}let i=r.svgBlob,o=URL.createObjectURL(i);try{let c=new Image;if(c.decoding="async",c.src=o,await c.decode(),r.textureWidth>=a)return;let l=Math.max(64,Math.round(a*t.heightMm/t.widthMm)),f=new OffscreenCanvas(a,l),u=f.getContext("2d",{alpha:!1});u.fillStyle="#ffffff",u.fillRect(0,0,a,l),u.drawImage(c,0,0,a,l);let g=await createImageBitmap(f),b=this.device.createTexture({size:[a,l],format:"rgba8unorm-srgb",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});this.device.queue.copyExternalImageToTexture({source:g},{texture:b},[a,l]),g.close(),r.texture!==this.placeholder&&r.texture.destroy(),r.texture=b,r.textureWidth=a,this.updateBindGroup(r)}finally{URL.revokeObjectURL(o),this.loading.delete(s)}})();return this.loading.set(s,n),n}preloadOverview(){let t=[...this.pages],a=async()=>{for(;t.length;){let s=t.shift();await this.loadPageTexture(s,512).catch(()=>{})}};return Promise.all(Array.from({length:Math.min(4,t.length)},a))}screenToWorld(t,a){let s=this.canvas.getBoundingClientRect(),r=(t-s.left)*this.canvas.width/s.width,n=(a-s.top)*this.canvas.height/s.height;return[this.center[0]+(r-this.canvas.width/2)*this.scale,this.center[1]+(n-this.canvas.height/2)*this.scale]}worldToScreen(t,a){let s=this.canvas.clientWidth/this.canvas.width,r=this.canvas.clientHeight/this.canvas.height;return[((t-this.center[0])/this.scale+this.canvas.width/2)*s,((a-this.center[1])/this.scale+this.canvas.height/2)*r]}hitPage(t,a){let[s,r]=this.screenToWorld(t,a);return[...this.pages].reverse().find(n=>s>=n.worldX&&s<=n.worldX+n.widthMm&&r>=n.worldY&&r<=n.worldY+n.heightMm)||null}async pickFeature(t,a){if(!this.isNativeScene)return this.hitFeature(t,a);let s=this.hitPage(t,a);if(!s)return null;if(!this.pageHasNativeDetail(s))return this.hitFeature(t,a);await this.loadPageVectors(s);let r=await this.gpuPickFeature(s,t,a);return r&&!is(r)?{page:s,feature:r,source:this.clientToSource(s,t,a),native:!0,gpu:!0}:this.hitFeature(t,a)}hitFeature(t,a){let s=this.hitPage(t,a);if(!s)return null;let[r,n]=this.clientToSource(s,t,a),i=Math.max(.45,5*this.scale*this.canvas.width/Math.max(1,this.canvas.clientWidth)*s.sourceWidthMm/s.widthMm),o=this.hitResidentVectorFeature(s,r,n,i);if(o)return{page:s,feature:o,source:[r,n],native:!0};let c=this.hitSymbolInterior(s,r,n);if(c)return{page:s,feature:c,source:[r,n],native:!0,interior:!0};let l=(this.featuresByPage[s.id]||[]).filter(f=>{if(is(f))return!1;let u=f.boundsMm;return u&&r>=u[0]-i&&r<=u[2]+i&&n>=u[1]-i&&n<=u[3]+i}).map(f=>({feature:f,priority:ns(f),area:Math.max(1e-4,(f.boundsMm[2]-f.boundsMm[0])*(f.boundsMm[3]-f.boundsMm[1]))})).sort((f,u)=>u.priority-f.priority||f.area-u.area);return{page:s,feature:l[0]?.feature||null,source:[r,n]}}hitSymbolInterior(t,a,s){let r=null;for(let n of this.featuresByPage[t.id]||[]){let i=String(n?.kind||"");if(i!=="symbol_body"&&i!=="symbol_instance"||String(n?.sourceId||"").includes(":overplot"))continue;let o=n.boundsMm;if(!o||a<o[0]||a>o[2]||s<o[1]||s>o[3])continue;let c=Math.max(1e-4,(o[2]-o[0])*(o[3]-o[1])),l=(i==="symbol_body"?0:1e6)+c;(!r||l<r.score)&&(r={feature:n,score:l})}return r?.feature||null}clientToSource(t,a,s){let[r,n]=this.screenToWorld(a,s);return[(r-t.worldX)/t.widthMm*t.sourceWidthMm,(n-t.worldY)/t.heightMm*t.sourceHeightMm]}ensurePickTexture(){this.pickTexture&&this.pickTextureSize[0]===this.canvas.width&&this.pickTextureSize[1]===this.canvas.height||(this.pickTexture&&this.pickTexture.destroy(),this.pickTexture=this.device.createTexture({size:[this.canvas.width,this.canvas.height],format:"r32uint",usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC}),this.pickTextureSize=[this.canvas.width,this.canvas.height])}writePickVectors(t){let a=new ArrayBuffer(_r*12),s=new DataView(a),r=0,n=[];for(let i of t){let o=this.vectorChunks.get(i.id);if(!o?.segments?.length&&!o?.fills?.length&&!o?.images?.length)continue;let c=this._pickSourcePointByPage?.get(i.id),l=c?[c[0]-2.5,c[1]-2.5,c[0]+2.5,c[1]+2.5]:[0,0,i.sourceWidthMm,i.sourceHeightMm],f=Xd(o.spatial,l);for(let u of f.images){if(!xt(u.bounds,l))continue;let g=this.featuresById.get(u.featureId);!g||is(g)||n.push({page:i,image:u,feature:g,priority:ns(g)-5})}for(let u of f.fills){if(!xt(u.bounds,l))continue;let g=this.featuresById.get(u.featureId);!g||is(g)||n.push({page:i,fill:u,feature:g,priority:ns(g)-2})}for(let u of f.segments){if(!xt(u.bounds,l))continue;let g=this.featuresById.get(u.featureId);!g||is(g)||n.push({page:i,segment:u,feature:g,priority:ns(g)})}}n.sort((i,o)=>i.priority-o.priority);for(let{page:i,segment:o,fill:c,image:l,feature:f}of n){if(r+6>_r)break;if(l){let u=this.sourceToWorld(i,[l.xMm,l.yMm]),g=this.sourceToWorld(i,[l.xMm+l.widthMm,l.yMm]),b=this.sourceToWorld(i,[l.xMm,l.yMm+l.heightMm]),h=this.sourceToWorld(i,[l.xMm+l.widthMm,l.yMm+l.heightMm]);r=ji(s,r,u,g,b,l.featureId),r=ji(s,r,b,g,h,l.featureId)}else if(c){let u=c.worldPoints||c.points.map(g=>this.sourceToWorld(i,g));r=ji(s,r,u[0],u[1],u[2],c.featureId)}else{let u=Math.max(this.segmentWorldWidth(i,o,f,!1),this.scale*7);for(let g of this.visibleSegmentParts(i,o,f)){if(r+6>_r)break;let b=g.worldA||this.sourceToWorld(i,g.a),h=g.worldB||this.sourceToWorld(i,g.b);r=Yy(s,r,b,h,u,o.featureId)}}}return r?(this.device.queue.writeBuffer(this.pickVertexBuffer,0,a,0,r*12),r):0}async gpuPickFeature(t,a,s){if(this.pickPending)return null;let r=this.clientToSource(t,a,s);this._pickSourcePointByPage=new Map([[t.id,r]]);let n=this.writePickVectors([t]);if(this._pickSourcePointByPage=null,!n)return null;this.resize(),this.writeGlobals(),this.ensurePickTexture();let i=this.canvas.getBoundingClientRect(),o=Math.max(0,Math.min(this.canvas.width-1,Math.floor((a-i.left)*this.canvas.width/i.width))),c=Math.max(0,Math.min(this.canvas.height-1,Math.floor((s-i.top)*this.canvas.height/i.height))),l=this.device.createCommandEncoder(),f=l.beginRenderPass({colorAttachments:[{view:this.pickTexture.createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}]});f.setPipeline(this.pickPipeline),f.setBindGroup(0,this.edgeBindGroup),f.setVertexBuffer(0,this.pickVertexBuffer),f.draw(n),f.end(),l.copyTextureToBuffer({texture:this.pickTexture,origin:{x:o,y:c}},{buffer:this.pickReadBuffer,bytesPerRow:256,rowsPerImage:1},{width:1,height:1,depthOrArrayLayers:1}),this.pickPending=!0,this.device.queue.submit([l.finish()]);try{await this.pickReadBuffer.mapAsync(GPUMapMode.READ);let u=new DataView(this.pickReadBuffer.getMappedRange()).getUint32(0,!0);return this.pickReadBuffer.unmap(),u&&this.featuresById.get(u)||null}finally{this.pickReadBuffer.mapState==="mapped"&&this.pickReadBuffer.unmap(),this.pickPending=!1}}hitResidentVectorFeature(t,a,s,r){if(!this.isNativeScene)return null;let n=this.vectorChunks.get(t.id);if(!n?.loaded)return null;let i=null;for(let o of n.segments){let c=this.featuresById.get(o.featureId),l=Math.max(r,(o.widthMm||0)*.5+r*.45);if(c)for(let f of this.visibleSegmentParts(t,o,c)){let u=Xy([a,s],f.a,f.b);if(u>l)continue;let g=u-ns(c)*.025+(os(c)?0:8);(!i||g<i.score)&&(i={feature:c,score:g})}}return i?.feature||null}segmentWorldWidth(t,a,s,r){let n=(a.widthMm||.15)/Math.max(1,t.sourceWidthMm)*t.widthMm;return Math.max(n,this.scale*Vy(s,a.kind,r))}pan(t,a){let s=this.canvas.width/Math.max(1,this.canvas.clientWidth);this.center[0]-=t*this.scale*s,this.center[1]-=a*this.scale*s}zoom(t,a,s){let r=this.screenToWorld(a,s);this.scale=ce(this.scale*Math.exp(t*.0015),.015,16);let n=this.screenToWorld(a,s);this.center[0]+=r[0]-n[0],this.center[1]+=r[1]-n[1]}framePage(t){t&&(this.resize(),this.center=[t.worldX+t.widthMm/2,t.worldY+t.heightMm/2],this.scale=Math.max(t.widthMm/Math.max(1,this.canvas.width*.88),t.heightMm/Math.max(1,this.canvas.height*.84)))}frameWorld(){this.resize(),this.center=[(this.world.minX+this.world.maxX)/2,(this.world.minY+this.world.maxY)/2],this.scale=Math.max((this.world.maxX-this.world.minX)/Math.max(1,this.canvas.width*.9),(this.world.maxY-this.world.minY)/Math.max(1,this.canvas.height*.88),.05)}};function Ay(e){return e.thumbnail?.path||e.svg}function _y(e){if(e.schema==="prism.schematic_vector_a0.features"){let t=new Map((e.features||[]).map(s=>[Number(s.id),s])),a={};for(let[s,r]of Object.entries(e.pages||{}))a[s]=r.map(n=>t.get(Number(n))).filter(Boolean);return a}return e.pages||{}}function Ry(e){let t=[],a=[],s=[];for(let r of e){let n=Number(r.featureId||0);if(!n)continue;if(r.kind==="plotimage"&&r.image?.path){let m=r.xMm||0,y=r.yMm||0,v=r.widthMm||0,E=r.heightMm||0;s.push({featureId:n,kind:r.kind,xMm:m,yMm:y,widthMm:v,heightMm:E,bounds:[m,y,m+v,y+E],path:r.image.path});continue}let i=String(r.semanticRole||""),o=r.radiusMm||r.diameterMm/2||0,c=String(r.fill||"").toUpperCase()==="FILLED_SHAPE",l=r.widthMm||r.pen_widthMm||(i==="junction"?.08:.15),f=String(r.lineStyle||r.line_style||"DEFAULT").toUpperCase(),u=r.color||r.strokeColor||r.style?.color||"",g=r.fillColor||r.color||r.style?.color||"",b=(m,y)=>Py(t,{featureId:n,kind:r.kind,widthMm:l,lineStyle:f,color:u},m,y),h=r.x1Mm,d=r.y1Mm,x=r.x2Mm,p=r.y2Mm;if(r.trianglesMm?.length){for(let m of r.trianglesMm)Array.isArray(m)&&m.length===3&&a.push({featureId:n,kind:r.kind,color:g,points:m,bounds:Zd(m)});if(r.pointsMm?.length>=2){for(let m=1;m<r.pointsMm.length;m+=1)b(r.pointsMm[m-1],r.pointsMm[m]);$d(r)&&b(r.pointsMm[r.pointsMm.length-1],r.pointsMm[0])}}else if(r.pointsMm?.length>=2){c&&r.pointsMm.length>=3&&Oy(a,n,r.kind,r.pointsMm,g);for(let m=1;m<r.pointsMm.length;m+=1)b(r.pointsMm[m-1],r.pointsMm[m]);$d(r)&&b(r.pointsMm[r.pointsMm.length-1],r.pointsMm[0])}else if(r.polylinesMm?.length){for(let m of r.polylinesMm)if(!(!Array.isArray(m)||m.length<2))for(let y=1;y<m.length;y+=1)b(m[y-1],m[y])}else if(Number.isFinite(h)&&Number.isFinite(d)&&Number.isFinite(x)&&Number.isFinite(p))r.kind==="rect"?(c&&By(a,n,r.kind,[h,d,x,p],g),b([h,d],[x,d]),b([x,d],[x,p]),b([x,p],[h,p]),b([h,p],[h,d])):b([h,d],[x,p]);else if(Number.isFinite(r.cxMm)&&Number.isFinite(r.cyMm)){let m=r.radiusMm||r.diameterMm/2||.4;c&&Fy(a,n,r.kind,[r.cxMm,r.cyMm],m,g),jy(t,{featureId:n,kind:r.kind,widthMm:l,lineStyle:f,color:u},[r.cxMm,r.cyMm],m)}else if(r.contoursMm?.length){for(let m of r.contoursMm)if(!(!Array.isArray(m)||m.length<2)){for(let y=1;y<m.length;y+=1)b(m[y-1],m[y]);b(m[m.length-1],m[0])}}else if(Number.isFinite(r.start_xMm)&&Number.isFinite(r.start_yMm)&&Number.isFinite(r.end_xMm)&&Number.isFinite(r.end_yMm))Number.isFinite(r.mid_xMm)&&Number.isFinite(r.mid_yMm)?(b([r.start_xMm,r.start_yMm],[r.mid_xMm,r.mid_yMm]),b([r.mid_xMm,r.mid_yMm],[r.end_xMm,r.end_yMm])):b([r.start_xMm,r.start_yMm],[r.end_xMm,r.end_yMm]);else if(Number.isFinite(r.start_xMm)&&Number.isFinite(r.start_yMm)&&Number.isFinite(r.mid_xMm)&&Number.isFinite(r.mid_yMm)&&Number.isFinite(r.end_xMm)&&Number.isFinite(r.end_yMm))b([r.start_xMm,r.start_yMm],[r.mid_xMm,r.mid_yMm]),b([r.mid_xMm,r.mid_yMm],[r.end_xMm,r.end_yMm]);else if(r.boundsMm&&r.kind!=="text"){let[m,y,v,E]=r.boundsMm;b([m,y],[v,y]),b([v,y],[v,E]),b([v,E],[m,E]),b([m,E],[m,y])}}return{segments:t,fills:a,images:s}}function Ny(e,t){for(let a of t.segments||[])a.worldA=Sa(e,a.a),a.worldB=Sa(e,a.b);for(let a of t.fills||[])a.worldPoints=a.points.map(s=>Sa(e,s));for(let a of t.images||[])a.worldOrigin=Sa(e,[a.xMm,a.yMm]),a.worldSize=Cy(e,a.widthMm,a.heightMm)}function Sa(e,t){return[e.worldX+t[0]/e.sourceWidthMm*e.widthMm,e.worldY+t[1]/e.sourceHeightMm*e.heightMm]}function Cy(e,t,a){return[t/e.sourceWidthMm*e.widthMm,a/e.sourceHeightMm*e.heightMm]}function By(e,t,a,s,r){let[n,i,o,c]=s;e.push({featureId:t,kind:a,color:r,points:[[n,i],[o,i],[n,c]],bounds:[n,i,o,c]},{featureId:t,kind:a,color:r,points:[[n,c],[o,i],[o,c]],bounds:[n,i,o,c]})}function Fy(e,t,a,s,r,n){for(let o=0;o<36;o+=1){let c=o/36*Math.PI*2,l=(o+1)/36*Math.PI*2;e.push({featureId:t,kind:a,color:n,points:[s,[s[0]+Math.cos(c)*r,s[1]+Math.sin(c)*r],[s[0]+Math.cos(l)*r,s[1]+Math.sin(l)*r]],bounds:[s[0]-r,s[1]-r,s[0]+r,s[1]+r]})}}function Oy(e,t,a,s,r){let n=s[0],i=Zd(s);for(let o=2;o<s.length;o+=1)e.push({featureId:t,kind:a,color:r,points:[n,s[o-1],s[o]],bounds:i})}function Py(e,t,a,s){let r=Wd(a,s,t.widthMm||.15),n=t.lineStyle||"DEFAULT";if(!["DASH","DASHED","DOT","DOTTED","DASHDOT","DASH_DOT"].includes(n)){e.push({...t,a,b:s,bounds:r});return}let i=s[0]-a[0],o=s[1]-a[1],c=Math.hypot(i,o);if(c<1e-6)return;let l=i/c,f=o/c,u=Math.max(t.widthMm*4,.45),g=n.includes("DOT")?[u*.8,u*.75,u*3,u*.75]:[u*3,u*1.5],b=0,h=0;for(;b<c;){let d=Math.min(g[h%g.length],c-b);if(h%2===0){let x=[a[0]+l*b,a[1]+f*b],p=[a[0]+l*(b+d),a[1]+f*(b+d)];e.push({...t,a:x,b:p,bounds:Wd(x,p,t.widthMm||.15)})}b+=d,h+=1}}function jy(e,t,a,s){for(let n=0;n<32;n+=1){let i=n/32*Math.PI*2,o=(n+1)/32*Math.PI*2;e.push({...t,a:[a[0]+Math.cos(i)*s,a[1]+Math.sin(i)*s],b:[a[0]+Math.cos(o)*s,a[1]+Math.sin(o)*s],bounds:[a[0]-s,a[1]-s,a[0]+s,a[1]+s]})}}function Zd(e,t=0){let a=1/0,s=1/0,r=-1/0,n=-1/0;for(let i of e||[])a=Math.min(a,i[0]),s=Math.min(s,i[1]),r=Math.max(r,i[0]),n=Math.max(n,i[1]);return Number.isFinite(a)?[a-t,s-t,r+t,n+t]:[0,0,0,0]}function Wd(e,t,a=0){let s=Math.max(.05,a*.5);return[Math.min(e[0],t[0])-s,Math.min(e[1],t[1])-s,Math.max(e[0],t[0])+s,Math.max(e[1],t[1])+s]}function xt(e,t){return!e||!t?!0:e[0]<=t[2]&&e[2]>=t[0]&&e[1]<=t[3]&&e[3]>=t[1]}function Ly(e){let t={cellSize:Ty,cells:new Map,segments:e.segments||[],fills:e.fills||[],images:e.images||[],queryId:0};for(let a of t.segments)Oi(t,"segments",a);for(let a of t.fills)Oi(t,"fills",a);for(let a of t.images)Oi(t,"images",a);return t}function Oi(e,t,a){let s=a.bounds;if(!s)return;let r=Math.floor(s[0]/e.cellSize),n=Math.floor(s[2]/e.cellSize),i=Math.floor(s[1]/e.cellSize),o=Math.floor(s[3]/e.cellSize);for(let c=i;c<=o;c+=1)for(let l=r;l<=n;l+=1){let f=`${l}:${c}`,u=e.cells.get(f);u||(u={segments:[],fills:[],images:[]},e.cells.set(f,u)),u[t].push(a)}}function Xd(e,t){if(!e)return{segments:[],fills:[],images:[]};e.queryId=(e.queryId||0)+1;let a=e.queryId,s={segments:[],fills:[],images:[]},r=Math.floor(t[0]/e.cellSize),n=Math.floor(t[2]/e.cellSize),i=Math.floor(t[1]/e.cellSize),o=Math.floor(t[3]/e.cellSize);for(let c=i;c<=o;c+=1)for(let l=r;l<=n;l+=1){let f=e.cells.get(`${l}:${c}`);f&&(Pi(f.segments,s.segments,a,"segments"),Pi(f.fills,s.fills,a,"fills"),Pi(f.images,s.images,a,"images"))}return s}function Pi(e,t,a,s){let r=`_${s}QueryId`;for(let n of e)n[r]!==a&&(n[r]=a,t.push(n))}function $d(e){let t=String(e.kind||"");if(String(e.fill||"").toUpperCase()==="FILLED_SHAPE"||e.closed===!0||["polygon","fill"].includes(t))return!0;let s=e.pointsMm||[];if(s.length>=3){let r=s[0],n=s[s.length-1];return Math.hypot(r[0]-n[0],r[1]-n[1])<1e-6}return!1}function os(e){return!!e?.netUid}function Dy(e){let t=String(e?.kind||""),a=String(e?.semanticRole||"");return t==="pin"||t==="pin_body"||t==="label"||t==="global_label"||t==="hierarchical_label"||t==="netclass_flag"||t==="power_symbol"||t==="power_port"||a==="label"||a==="global_label"||a==="hierarchical_label"}function Uy(e){let t=String(e?.kind||""),a=String(e?.semanticRole||"");return t==="global_label"||a==="global_label"?130:t==="hierarchical_label"||a==="hierarchical_label"?125:t==="label"||a==="label"?118:t==="pin"||t==="pin_body"?106:t==="power_symbol"||t==="power_port"||t==="netclass_flag"?98:50}function zy(e){if(e.length<=Hd)return e;let t=e.slice(0,Hd);return t.sort((a,s)=>a.source[1]-s.source[1]||a.source[0]-s.source[0]),t}function Gy(e,t,a={}){if(!e||!t?.length)return null;let s=a.featureId||a.stableKey||a.sourceId?t.find(l=>a.featureId&&Number(l.featureId||0)===Number(a.featureId)||a.stableKey&&l.stableKey===a.stableKey||a.sourceId&&l.sourceId===a.sourceId):null;if(s)return{...s,kind:"selected-net-occurrence",priority:200};let r=t.filter(l=>l.priority>=118).slice(0,16),n=r.length?r:t.slice(0,16),i=0,o=0;for(let l of n)i+=l.world[0],o+=l.world[1];let c=[i/n.length,o/n.length];return{pageId:e.id,featureId:n[0]?.featureId||0,kind:"page-net-occurrence",source:[0,0],world:c,bounds:[c[0],c[1],c[0],c[1]],priority:1}}function Yd(e,t,a){if(!e||e.length<2)return[];let s=e.map(i=>({...i})).sort((i,o)=>i.world[1]-o.world[1]||i.world[0]-o.world[0]),r=[],n=s.shift();for(;s.length;){let i=0,o=1/0;for(let l=0;l<s.length;l+=1){let f=s[l],u=Math.hypot(f.world[0]-n.world[0],f.world[1]-n.world[1]);u<o&&(o=u,i=l)}let c=s.splice(i,1)[0];r.push({type:t,pageId:a||n.pageId||c.pageId||"",a:n.world,b:c.world,sourceFeatureIds:[n.featureId,c.featureId].filter(Boolean)}),n=c}return r}function Jd(e,t=0){return[Math.min(e.a[0],e.b[0])-t,Math.min(e.a[1],e.b[1])-t,Math.max(e.a[0],e.b[0])+t,Math.max(e.a[1],e.b[1])+t]}function ns(e){let t=String(e?.kind||""),s=String(e?.semanticRole||"")||t;return s==="pin_number"||s==="pin_name"?120:s==="pin_body"||t==="pin"?110:s==="symbol_reference"||s==="symbol_value"?92:t==="junction"||t==="no_connect"?88:t==="wire"||t==="bus"||t==="bus_entry"?78:s==="symbol_body"||t==="symbol_body"?45:t==="symbol_instance"||t==="symbol_overplot"?30:t==="text"||String(s).includes("text")?24:10}function is(e){let t=String(e?.kind||""),a=String(e?.semanticRole||"");if(t==="page"||t==="sheet_header")return!0;if(t==="graphic_rect"&&a==="graphic_rect"&&!e?.netUid&&!e?.componentUid){let s=e.boundsMm||[];return s[2]-s[0]>150&&s[3]-s[1]>120}return!1}function Ky(e){if(!e||typeof e!="string")return null;let a=e.trim().match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);if(!a)return null;let s=a[1],r=a[2]??"ff";return[parseInt(s.slice(0,2),16)/255,parseInt(s.slice(2,4),16)/255,parseInt(s.slice(4,6),16)/255,parseInt(r,16)/255]}function Li(e,t,a=""){let s=Ky(a||e?.color||"");return e?.kind==="dnp_marker"?s||[.86,.04,.05,.85]:e?.dnp&&["symbol_reference","symbol_value","symbol_text"].includes(String(e?.kind||""))?[.5,.52,.54,.56]:s||(e?.dnp?[.5,.52,.54,.56]:os(e)?[.12,.56,.2,.96]:e?.kind==="pin_name"?[0,.28,.31,.96]:e?.kind==="pin_number"?[.45,.17,.16,.96]:e?.kind==="pin_body"?[.28,.18,.18,.88]:e?.kind==="symbol_body"||e?.kind==="symbol_instance"?[.42,.18,.18,.72]:e?.kind==="symbol_reference"||e?.kind==="symbol_value"?[.05,.13,.16,.94]:e?.kind==="text"||String(t||"").startsWith("text")?[.05,.13,.16,.94]:[.16,.17,.19,.7])}function Qd(e,t,a=""){let s=Li(e,t,a);return[s[0]*.72,s[1]*.72,s[2]*.72,Math.min(s[3],.38)]}function Vy(e,t,a){return a?5.5:e?.kind==="dnp_marker"?3:["pin_name","pin_number"].includes(String(e?.kind||""))?1.5:e?.kind==="pin_body"?1.7:String(t||"").startsWith("text")?1.35:t==="bus"||e?.kind==="bus"?4.2:os(e)?2.6:e?.kind==="symbol_body"||e?.kind==="symbol_instance"||e?.kind==="sheet"?1.5:1.25}function Nr(e,t,a,s){return e[t++]=a[0],e[t++]=a[1],e[t++]=s[0],e[t++]=s[1],e[t++]=s[2],e[t++]=s[3],t}function Hy(e,t,a,s,r,n){let i=eu(a,s,r);if(!i)return t;for(let o of i)t=Nr(e,t,o,n);return t}function qy(e,t,a,s,r,n){return t=Nr(e,t,a,n),t=Nr(e,t,s,n),t=Nr(e,t,r,n),t}function Ea(e,t,a,s,r){return e[t++]=a[0],e[t++]=a[1],e[t++]=s,e[t++]=r,t}function Wy(e,t,a,s,r,n,i,o){let c=s[0]-a[0],l=s[1]-a[1],f=Math.hypot(c,l);if(f<1e-6||t+24>e.length)return t;let u=r*.5,g=c/f,h=-(l/f)*u,d=g*u,x=[a[0]+h,a[1]+d],p=[a[0]-h,a[1]-d],m=[s[0]+h,s[1]+d],y=[s[0]-h,s[1]-d],v=i+f/Math.max(o,1e-6);return t=Ea(e,t,x,i,n),t=Ea(e,t,p,i,n),t=Ea(e,t,m,v,n),t=Ea(e,t,m,v,n),t=Ea(e,t,p,i,n),t=Ea(e,t,y,v,n),t}function eu(e,t,a){let s=t[0]-e[0],r=t[1]-e[1],n=Math.hypot(s,r);if(n<1e-6)return null;let i=a*.5,o=s/n*i,c=r/n*i,l=-r/n*i,f=s/n*i,u=[e[0]-o,e[1]-c],g=[t[0]+o,t[1]+c],b=[u[0]+l,u[1]+f],h=[u[0]-l,u[1]-f],d=[g[0]+l,g[1]+f],x=[g[0]-l,g[1]-f];return[b,h,d,d,h,x]}function Xy(e,t,a){let s=a[0]-t[0],r=a[1]-t[1],n=s*s+r*r||1,i=ce(((e[0]-t[0])*s+(e[1]-t[1])*r)/n,0,1),o=t[0]+s*i,c=t[1]+r*i;return Math.hypot(e[0]-o,e[1]-c)}function $y(e,t){let[a,s,r,n]=t,[i,o]=e.a,[c,l]=e.b,f=1e-6,u=(g,b)=>({...e,a:g,b});if(Math.abs(o-l)<=f){let g=o;if(g<s-f||g>n+f)return[e];let b=Math.min(i,c),h=Math.max(i,c),d=Math.max(b,a),x=Math.min(h,r);if(x<=d+f)return[e];let p=[],m=i<=c;if(b<d-f){let y=m?[b,g]:[d,g],v=m?[d,g]:[b,g];p.push(u(y,v))}if(x<h-f){let y=m?[x,g]:[h,g],v=m?[h,g]:[x,g];p.push(u(y,v))}return p}if(Math.abs(i-c)<=f){let g=i;if(g<a-f||g>r+f)return[e];let b=Math.min(o,l),h=Math.max(o,l),d=Math.max(b,s),x=Math.min(h,n);if(x<=d+f)return[e];let p=[],m=o<=l;if(b<d-f){let y=m?[g,b]:[g,d],v=m?[g,d]:[g,b];p.push(u(y,v))}if(x<h-f){let y=m?[g,x]:[g,h],v=m?[g,h]:[g,x];p.push(u(y,v))}return p}return[e]}function Cr(e,t,a,s){let r=t*12;e.setFloat32(r,a[0],!0),e.setFloat32(r+4,a[1],!0),e.setUint32(r+8,s,!0)}function Yy(e,t,a,s,r,n){let i=eu(a,s,r);if(!i)return t;for(let o of i)Cr(e,t,o,n),t+=1;return t}function ji(e,t,a,s,r,n){return Cr(e,t,a,n),Cr(e,t+1,s,n),Cr(e,t+2,r,n),t+3}function Jy(e,t){let a=Array.isArray(e?.layerIds)?e.layerIds:[];if(a.length<2&&e?.startLayerId!=null&&e?.endLayerId!=null&&(a=[e.startLayerId,e.endLayerId]),a.length<2&&e?.layerMask!=null)try{let s=BigInt(String(e.layerMask));a=t.filter((r,n)=>(s&1n<<BigInt(n))!==0n).map(r=>r.id)}catch{a=[]}return a}function Qy(e){let t=e?.objectFeatureId??e?.id;if(t!=null&&Number.isFinite(Number(t))&&Number(t)!==0)return`feature:${Number(t)}`;let a=String(e?.sourceUid||"");return a?`source:${a}`:""}function tu(e,t){let a=new Map(e.map((o,c)=>[Number(o.id),c])),s=new Map(e.map(o=>[Number(o.id),o])),r=new Map,n=new Set,i={thru:0,blind:0,buried:0};for(let o of t){let c=Qy(o);if(c){if(n.has(c))continue;n.add(c)}let l=[...new Set(Jy(o,e).map(Number))].filter(y=>a.has(y)).sort((y,v)=>a.get(y)-a.get(v));if(l.length<2)continue;let f=l[0],u=l[l.length-1],g=a.get(f),b=a.get(u),h=g===0,d=b===e.length-1,x=h&&d?"thru":h||d?"blind":"buried";i[x]+=1;let p=`${f}:${u}:${x}`,m=r.get(p);if(m){m.count+=1;continue}r.set(p,{startId:f,endId:u,startName:s.get(f)?.name||String(f),endName:s.get(u)?.name||String(u),startIndex:g,endIndex:b,type:x,count:1})}return{counts:i,spans:[...r.values()]}}var cs="http://www.w3.org/2000/svg";var Zy=new Set(["script","foreignobject","iframe","object","embed"]),ex=new Set(["href","xlink:href"]),tx=1,ax=18,sx=8,Pr=class e{static create(t,a,s,r,n={}){return new e(t,a,s,r,n)}constructor(t,a,s,r,n){this.host=t,this.manifestUrl=a,this.manifest=s,this.featuresByPage=r||{},this.callbacks=n,this.activePage=null,this.activeSvgUrl="",this.container=null,this.svg=null,this.overlay=null,this.mountedPages=new Map,this.loadingPages=new Map,this.svgCache=new Map,this.serial=0,this.maxMountedWorldPages=tx,this.maxCachedSvgPages=ax,this.worldHandlersInstalled=!1,this.worldDrag=null,this.view={scale:1,tx:0,ty:0},this.drag=null,this.selected=null,this.highlightedNetUid="",this.index=nu(),this.lastStats={mountedPages:0,domNodes:0,indexedFeatures:0,indexedNets:0,mountMs:0,coldMounts:0,warmMounts:0,highlightMs:0,selectionMs:0,cachedSvgPages:0,cachedSvgBytes:0,heapMb:null,fallbackReason:""}}get active(){return!!(this.container&&this.activePage)}get worldActive(){return this.mountedPages.size>0}stats(){return{...this.lastStats,activePage:this.activePage?.name||[...this.mountedPages.values()][0]?.page?.name||"-",mountedPages:this.active?1:this.mountedPages.size}}dispose(){this.unmountPage(),this.unmountWorldPages()}unmountPage(){this.container?.remove(),this.container=null,this.svg=null,this.overlay=null,this.activePage=null,this.activeSvgUrl="",this.index=nu(),this.host.hidden=!0}unmountWorldPages(){for(let t of this.mountedPages.values())t.container.remove();this.mountedPages.clear(),this.loadingPages.clear(),this.active||(this.host.hidden=!0)}async preloadPages(t){let a=performance.now(),s=await Promise.allSettled((t||[]).slice(0,sx).map(r=>this.loadSvgTemplate(r)));this.lastStats.preloadedPages=s.filter(r=>r.status==="fulfilled"&&r.value).length,this.lastStats.preloadMs=performance.now()-a,this.updateCacheStats()}syncWorldPages(t,a,s={}){if(!a)return;this.installWorldHandlers(a);let r=(t||[]).slice(0,s.maxMountedPages||this.maxMountedWorldPages),n=new Set(r.map(i=>i.id));for(let[i,o]of this.mountedPages)n.has(i)||(o.container.remove(),this.mountedPages.delete(i));for(let i of r){let o=this.mountedPages.get(i.id);if(o)o.lastUsed=++this.serial,this.positionWorldEntry(o,a);else if(!this.loadingPages.has(i.id)){let c=this.mountWorldPage(i).then(l=>{l&&n.has(i.id)?this.positionWorldEntry(l,a):l?.container.remove()}).finally(()=>this.loadingPages.delete(i.id));this.loadingPages.set(i.id,c)}}this.pruneMountedWorldPages(n),this.host.hidden=r.length===0&&!this.active,this.setSelection(this.selected),this.setHighlightedNet(s.activeNetUid??this.highlightedNetUid),this.lastStats.mountedPages=this.mountedPages.size,this.updateCacheStats()}async mountWorldPage(t){let a=performance.now(),s=this.hasCachedSvg(t),r=await this.loadImportedSvg(t);if(!r)return null;let n=document.createElement("div");n.className="svg-dom-page svg-dom-world-page",n.dataset.pageId=t.id,n.append(r),this.host.append(n);let i=su(r),o=ru(r),c=au(r,t,this.featuresByPage[t.id]||[]),l={page:t,container:n,svg:r,overlay:i,selectionOverlay:o,index:c,mountMs:performance.now()-a,lastUsed:++this.serial,warm:s};return this.mountedPages.set(t.id,l),this.lastStats={...this.lastStats,mountedPages:this.mountedPages.size,domNodes:[...this.mountedPages.values()].reduce((f,u)=>f+u.svg.querySelectorAll("*").length,0),indexedFeatures:[...this.mountedPages.values()].reduce((f,u)=>f+u.index.featureToElements.size,0),indexedNets:new Set([...this.mountedPages.values()].flatMap(f=>[...f.index.netToElements.keys()])).size,mountMs:l.mountMs,coldMounts:this.lastStats.coldMounts+(l.warm?0:1),warmMounts:this.lastStats.warmMounts+(l.warm?1:0),fallbackReason:""},this.updateCacheStats(),l}async loadImportedSvg(t){let a=await this.loadSvgTemplate(t);return a?a.cloneNode(!0):null}async loadSvgTemplate(t){let a=this.svgUrlForPage(t),s=this.svgCache.get(a);if(s?.template)return s.lastUsed=++this.serial,s.template;if(s?.promise)return s.promise;let r=performance.now(),n=(async()=>{let i=await fetch(a,{cache:"default"});if(!i.ok)return this.lastStats.fallbackReason=`Failed to load SVG page ${t.id}: ${i.status}`,this.callbacks.onFallback?.(this.lastStats.fallbackReason),null;let o=await i.text(),l=new DOMParser().parseFromString(o,"image/svg+xml"),f=l.documentElement;if(!f||f.localName.toLowerCase()!=="svg"||l.querySelector("parsererror"))return this.lastStats.fallbackReason=`Invalid SVG for page ${t.id}`,this.callbacks.onFallback?.(this.lastStats.fallbackReason),null;rx(l,a,t.id);let u=document.importNode(f,!0);u.classList.add("svg-dom-page-svg"),dx(u);let g=this.svgCache.get(a)||{};return Object.assign(g,{template:u,promise:null,pageId:t.id,byteLength:o.length*2,loadMs:performance.now()-r,lastUsed:++this.serial}),this.svgCache.set(a,g),this.pruneSvgCache(),this.updateCacheStats(),u})();return this.svgCache.set(a,{promise:n,pageId:t.id,byteLength:0,loadMs:0,lastUsed:++this.serial}),n}svgUrlForPage(t){return new URL(t.svg||t.thumbnail?.path,this.manifestUrl).toString()}positionWorldEntry(t,a){let{page:s,container:r}=t,[n,i]=a.worldToScreen(s.worldX,s.worldY),[o,c]=a.worldToScreen(s.worldX+s.widthMm,s.worldY+s.heightMm),l=Math.max(1,o-n),f=Math.max(1,c-i);r.style.transform=`translate3d(${n}px, ${i}px, 0)`,r.style.width=`${l}px`,r.style.height=`${f}px`}installWorldHandlers(t){if(this.worldHandlersInstalled)return;this.worldHandlersInstalled=!0;let a=this.host;a.oncontextmenu=s=>s.preventDefault(),a.onpointerdown=s=>{let r=s.button===0&&!s.shiftKey&&!!s.target.closest?.("text"),i=s.target.closest?.("[data-feature-key]")?null:this.featureAtEvent(s);this.worldDrag={pointerId:s.pointerId,startX:s.clientX,startY:s.clientY,lastX:s.clientX,lastY:s.clientY,button:s.button,moved:!1,pan:!r&&(s.button===0||s.button===1||s.shiftKey),allowTextSelection:r},r||a.setPointerCapture(s.pointerId)},a.onpointermove=s=>{if(!this.worldDrag||this.worldDrag.pointerId!==s.pointerId)return;let r=s.clientX-this.worldDrag.lastX,n=s.clientY-this.worldDrag.lastY;this.worldDrag.lastX=s.clientX,this.worldDrag.lastY=s.clientY,Math.hypot(s.clientX-this.worldDrag.startX,s.clientY-this.worldDrag.startY)>3&&(this.worldDrag.moved=!0),this.worldDrag.pan&&t.pan(r,n)},a.onpointerup=s=>{if(!this.worldDrag||this.worldDrag.pointerId!==s.pointerId)return;let r=this.worldDrag;if(this.worldDrag=null,r.allowTextSelection||a.releasePointerCapture(s.pointerId),r.button!==0||r.moved)return;let n=s.target.closest?.("[data-feature-key]");if(n)this.selectElement(n,s);else{let i=this.featureAtEvent(s);i?this.selectFeature(i.entry,i.feature,s):this.callbacks.onBlank?.()}},a.ondblclick=s=>{let r=s.target.closest?.("[data-feature-key]"),n=r?null:this.featureAtEvent(s),i=n?.entry||this.entryForPoint(s.clientX,s.clientY),o=r?this.selectionFromElement(r):n?this.selectionFromFeature(n.entry,n.feature):this.selected;iu(o)?this.callbacks.onOpenPage?.(o):o?.netUid?this.callbacks.onHighlightNet?.(o.netUid,o):!n&&i?.page&&this.callbacks.onOpenPage?.({kind:"page",pageId:i.page.id,page:i.page})},a.onwheel=s=>{s.preventDefault(),Math.abs(s.deltaX)>Math.abs(s.deltaY)*.65?t.pan(-s.deltaX,-s.deltaY):t.zoom(s.deltaY,s.clientX,s.clientY)}}async focusPage(t,a={}){if(!t)return!1;if(this.activePage?.id===t.id&&this.active)return a.frame!==!1&&this.fitPage(),!0;let s=performance.now(),r=await this.loadImportedSvg(t);if(!r)return!1;let n=document.createElement("div");return n.className="svg-dom-page",n.append(r),this.host.replaceChildren(n),this.host.hidden=!1,this.container=n,this.svg=r,this.activePage=t,this.activeSvgUrl=new URL(t.svg||t.thumbnail?.path,this.manifestUrl).toString(),this.overlay=su(r),this.selectionOverlay=ru(r),this.index=au(r,t,this.featuresByPage[t.id]||[]),this.installPageHandlers(),this.fitPage(),this.setSelection(this.selected),this.setHighlightedNet(this.highlightedNetUid),this.lastStats={...this.lastStats,mountedPages:1,domNodes:r.querySelectorAll("*").length,indexedFeatures:this.index.featureToElements.size,indexedNets:this.index.netToElements.size,mountMs:performance.now()-s,fallbackReason:""},this.updateCacheStats(),!0}installPageHandlers(){let t=this.host;t.oncontextmenu=a=>a.preventDefault(),t.onpointerdown=a=>{if(!this.active)return;let s=a.button===0&&!a.shiftKey&&!!a.target.closest?.("text"),r=a.target.closest?.("[data-feature-key]"),n=r?null:this.featureAtEvent(a);this.drag={pointerId:a.pointerId,startX:a.clientX,startY:a.clientY,lastX:a.clientX,lastY:a.clientY,button:a.button,moved:!1,pan:!s&&(a.button===0||a.button===1||a.shiftKey),featureElement:r,allowTextSelection:s},s||t.setPointerCapture(a.pointerId)},t.onpointermove=a=>{if(!this.drag||this.drag.pointerId!==a.pointerId)return;let s=a.clientX-this.drag.lastX,r=a.clientY-this.drag.lastY;this.drag.lastX=a.clientX,this.drag.lastY=a.clientY,Math.hypot(a.clientX-this.drag.startX,a.clientY-this.drag.startY)>3&&(this.drag.moved=!0),this.drag.pan&&(this.view.tx+=s,this.view.ty+=r,this.applyTransform())},t.onpointerup=a=>{if(!this.drag||this.drag.pointerId!==a.pointerId)return;let s=this.drag;if(this.drag=null,s.allowTextSelection||t.releasePointerCapture(a.pointerId),s.button!==0||s.moved)return;let r=a.target.closest?.("[data-feature-key]");if(r)this.selectElement(r,a);else{let n=this.featureAtEvent(a);n?this.selectFeature(n.entry,n.feature,a):this.callbacks.onBlank?.()}},t.ondblclick=a=>{let s=a.target.closest?.("[data-feature-key]"),r=s?null:this.featureAtEvent(a),n=s?this.selectionFromElement(s):r?this.selectionFromFeature(r.entry,r.feature):this.selected;iu(n)?this.callbacks.onOpenPage?.(n):n?.netUid?this.callbacks.onHighlightNet?.(n.netUid,n):!r&&this.activePage&&this.callbacks.onOpenPage?.({kind:"page",pageId:this.activePage.id,page:this.activePage})},t.onwheel=a=>{if(a.preventDefault(),!this.active)return;if(Math.abs(a.deltaX)>Math.abs(a.deltaY)*.65){this.view.tx-=a.deltaX,this.view.ty-=a.deltaY,this.applyTransform();return}let s=this.host.getBoundingClientRect(),r=a.clientX-s.left,n=a.clientY-s.top,i=this.screenToSvg(r,n),o=Math.exp(-a.deltaY*.0016);this.view.scale=Fr(this.view.scale*o,.02,80),this.view.tx=r-i[0]*this.view.scale,this.view.ty=n-i[1]*this.view.scale,this.applyTransform()}}selectElement(t,a){let s=performance.now(),r=this.selectionFromElement(t);if(this.setSelection(r),a){let n=this.host.getBoundingClientRect();r.anchor={x:a.clientX-n.left,y:a.clientY-n.top}}this.callbacks.onSelect?.(r),this.lastStats.selectionMs=performance.now()-s}selectFeature(t,a,s){let r=performance.now(),n=this.selectionFromFeature(t,a);if(this.setSelection(n),s){let i=this.host.getBoundingClientRect();n.anchor={x:s.clientX-i.left,y:s.clientY-i.top}}this.callbacks.onSelect?.(n),this.lastStats.selectionMs=performance.now()-r}selectionFromElement(t){let a=t.dataset.featureKey||"",s=this.entryForElement(t),r=s.index.featureByKey.get(a)||{};return this.selectionFromFeature(s,r,t)}selectionFromFeature(t,a,s=null){let r=a?.stableKey||s?.dataset?.featureKey||"",n=t?.page||this.activePage,i=a?.kind||s?.dataset?.role||s?.dataset?.primitive||"feature",o=a?.netUid||s?.dataset?.netUid||"",c=a?.netName||s?.dataset?.netName||"";return i==="sheet"?{kind:"sheet",featureKey:r,sheetInstancePath:a?.sheetInstancePath||n?.sheetInstancePath||"",sourceId:a?.sourceId||s?.dataset?.sourceId||s?.dataset?.objectId||s?.dataset?.uuid||"",sheetName:a?.sheet_name||a?.sheetName||s?.dataset?.sheetName||a?.objectId||"",sheetFile:a?.sheet_file||a?.sheetFile||s?.dataset?.sheetFile||"",feature:a}:i==="pin"||i==="pin_body"||i==="pin_name"||i==="pin_number"||s?.dataset?.pin?{kind:"pin",featureKey:r,sheetInstancePath:a?.sheetInstancePath||n?.sheetInstancePath||"",sourceId:a?.sourceId||s?.dataset?.sourceId||s?.dataset?.objectId||s?.dataset?.uuid||"",symbolUuid:a?.symbolUuid||s?.dataset?.symbolUuid||"",reference:a?.reference||s?.dataset?.designator||s?.dataset?.component||s?.dataset?.ref||"",pinNumber:a?.pinNumber||s?.dataset?.pin||"",pinName:a?.pinName||"",netUid:o,netName:c,feature:a}:i==="symbol_body"||i==="symbol_instance"||i==="component"||s?.dataset?.ref?{kind:"component",featureKey:r,sheetInstancePath:a?.sheetInstancePath||n?.sheetInstancePath||"",sourceId:a?.sourceId||s?.dataset?.sourceId||s?.dataset?.objectId||s?.dataset?.uuid||"",symbolUuid:a?.symbolUuid||s?.dataset?.symbolUuid||"",reference:a?.reference||s?.dataset?.designator||s?.dataset?.component||s?.dataset?.ref||"",netUid:o,netName:c,feature:a}:{kind:o?"feature":i,featureKey:r,sheetInstancePath:a?.sheetInstancePath||n?.sheetInstancePath||"",sourceId:a?.sourceId||s?.dataset?.sourceId||s?.dataset?.objectId||s?.dataset?.uuid||"",role:i,netUid:o,netName:c,feature:a}}setSelection(t){this.selected=t||null;for(let s of this.host.querySelectorAll(".prism-svg-selected"))s.classList.remove("prism-svg-selected");for(let s of this.host.querySelectorAll("[data-prism-overlay='selection']"))s.replaceChildren();let a=t?.featureKey||"";if(a){for(let s of this.entries()){for(let r of s.index.featureToElements.get(a)||[])r.classList.add("prism-svg-selected");this.drawSelectionOverlay(s,t)}for(let s of this.index.featureToElements.get(a)||[])s.classList.add("prism-svg-selected");this.drawSelectionOverlay({page:this.activePage,index:this.index,selectionOverlay:this.selectionOverlay},t)}}setHighlightedNet(t){this.highlightedNetUid=t||"";let a=performance.now();for(let s of this.entries())this.updateEntryHighlight(s);if(!this.svg||!this.overlay){this.lastStats.highlightMs=performance.now()-a;return}this.updateEntryHighlight({svg:this.svg,overlay:this.overlay,index:this.index,page:this.activePage}),this.lastStats.highlightMs=performance.now()-a}updateEntryHighlight(t){if(!t?.svg||!t?.overlay||(t.overlay.replaceChildren(),!this.highlightedNetUid))return;let a=Or(t.svg,t.page),s=document.createElementNS(cs,"rect");s.setAttribute("x",String(a[0])),s.setAttribute("y",String(a[1])),s.setAttribute("width",String(a[2])),s.setAttribute("height",String(a[3])),s.setAttribute("class","prism-svg-net-dimmer"),t.overlay.append(s);let n=(t.index.netToElements.get(this.highlightedNetUid)||[]).slice(0,2200);for(let i of n){let o=ux(i);t.overlay.append(o)}}entries(){return[...this.mountedPages.values()]}entryForElement(t){let s=t.closest?.(".svg-dom-page")?.dataset.pageId||"";return this.mountedPages.get(s)||{page:this.activePage,index:this.index,svg:this.svg,overlay:this.overlay,selectionOverlay:this.selectionOverlay}}featureAtEvent(t){let a=this.entryForPoint(t.clientX,t.clientY);if(!a)return null;let s=this.clientToSvg(a,t.clientX,t.clientY);if(!s)return null;let r=Math.max(.18,5*hx(a)),i=a.index.features.filter(o=>(o?.domBoundsMm||o?.boundsMm)&&lu(o)).filter(o=>s[0]>=(o.domBoundsMm||o.boundsMm)[0]-r&&s[0]<=(o.domBoundsMm||o.boundsMm)[2]+r&&s[1]>=(o.domBoundsMm||o.boundsMm)[1]-r&&s[1]<=(o.domBoundsMm||o.boundsMm)[3]+r).map(o=>({feature:o,priority:px(o),area:Math.max(1e-4,((o.domBoundsMm||o.boundsMm)[2]-(o.domBoundsMm||o.boundsMm)[0])*((o.domBoundsMm||o.boundsMm)[3]-(o.domBoundsMm||o.boundsMm)[1]))})).sort((o,c)=>c.priority-o.priority||o.area-c.area)[0]?.feature;return i?{entry:a,feature:i,point:s}:null}entryForPoint(t,a){for(let s of[...this.entries()].reverse()){let r=s.container.getBoundingClientRect();if(t>=r.left&&t<=r.right&&a>=r.top&&a<=r.bottom)return s}if(this.container){let s=this.container.getBoundingClientRect();if(t>=s.left&&t<=s.right&&a>=s.top&&a<=s.bottom)return{page:this.activePage,container:this.container,svg:this.svg,index:this.index,selectionOverlay:this.selectionOverlay}}return null}clientToSvg(t,a,s){if(!t?.container||!t?.svg||!t?.page)return null;let r=t.container.getBoundingClientRect();if(!r.width||!r.height)return null;let n=Or(t.svg,t.page);return[n[0]+(a-r.left)/r.width*n[2],n[1]+(s-r.top)/r.height*n[3]]}drawSelectionOverlay(t,a){if(!t?.selectionOverlay||!a?.featureKey)return;let s=t.index.featureByKey.get(a.featureKey),r=s?.domBoundsMm||s?.boundsMm;if(!r)return;let[n,i,o,c]=r,l=document.createElementNS(cs,"rect");l.setAttribute("x",String(n)),l.setAttribute("y",String(i)),l.setAttribute("width",String(Math.max(.001,o-n))),l.setAttribute("height",String(Math.max(.001,c-i))),l.setAttribute("rx","0.65"),l.setAttribute("ry","0.65"),l.setAttribute("class","prism-svg-selection-box"),t.selectionOverlay.append(l)}fitPage(){if(!this.svg||!this.activePage)return;let t=Or(this.svg,this.activePage),a=t[2]||this.activePage.sourceWidthMm||this.activePage.widthMm||1,s=t[3]||this.activePage.sourceHeightMm||this.activePage.heightMm||1,r=this.host.getBoundingClientRect(),n=Math.min(r.width/a,r.height/s)*.92;this.view.scale=Fr(n,.02,80),this.view.tx=(r.width-a*this.view.scale)/2-t[0]*this.view.scale,this.view.ty=(r.height-s*this.view.scale)/2-t[1]*this.view.scale,this.applyTransform()}frameSelection(t=this.selected){if(!t?.featureKey||!this.active){this.fitPage();return}let a=this.index.featureToElements.get(t.featureKey)||[],s=cu(a);if(!s)return;let r=this.host.getBoundingClientRect(),n=Math.max(1,s[2]-s[0]),i=Math.max(1,s[3]-s[1]),o=Math.min(r.width/n,r.height/i)*.36;this.view.scale=Fr(o,.04,80),this.view.tx=r.width/2-(s[0]+s[2])/2*this.view.scale,this.view.ty=r.height/2-(s[1]+s[3])/2*this.view.scale,this.applyTransform()}pan(t,a){this.active&&(this.view.tx+=t,this.view.ty+=a,this.applyTransform())}zoom(t,a,s){if(!this.active)return;let r=this.host.getBoundingClientRect(),n=(a??r.left+r.width/2)-r.left,i=(s??r.top+r.height/2)-r.top,o=this.screenToSvg(n,i),c=Math.exp(-t*.0016);this.view.scale=Fr(this.view.scale*c,.02,80),this.view.tx=n-o[0]*this.view.scale,this.view.ty=i-o[1]*this.view.scale,this.applyTransform()}screenToSvg(t,a){return[(t-this.view.tx)/Math.max(1e-6,this.view.scale),(a-this.view.ty)/Math.max(1e-6,this.view.scale)]}applyTransform(){this.container&&(this.container.style.transform=`translate3d(${this.view.tx}px, ${this.view.ty}px, 0) scale(${this.view.scale})`)}hasCachedSvg(t){return!!this.svgCache.get(this.svgUrlForPage(t))?.template}pruneMountedWorldPages(t=new Set){if(this.mountedPages.size<=this.maxMountedWorldPages)return;let a=[...this.mountedPages.entries()].filter(([s])=>!t.has(s)).sort((s,r)=>(s[1].lastUsed||0)-(r[1].lastUsed||0));for(let[s,r]of a){if(this.mountedPages.size<=this.maxMountedWorldPages)break;r.container.remove(),this.mountedPages.delete(s)}}pruneSvgCache(){let t=[...this.svgCache.entries()].filter(([,r])=>r?.template);if(t.length<=this.maxCachedSvgPages)return;let a=new Set([...this.mountedPages.values()].map(r=>this.svgUrlForPage(r.page)));this.activePage&&a.add(this.svgUrlForPage(this.activePage));let s=t.filter(([r])=>!a.has(r)).sort((r,n)=>(r[1].lastUsed||0)-(n[1].lastUsed||0));for(let[r]of s){if([...this.svgCache.values()].filter(n=>n?.template).length<=this.maxCachedSvgPages)break;this.svgCache.delete(r)}}updateCacheStats(){let t=[...this.svgCache.values()].filter(s=>s?.template);this.lastStats.cachedSvgPages=t.length,this.lastStats.cachedSvgBytes=t.reduce((s,r)=>s+(r.byteLength||0),0);let a=performance?.memory;this.lastStats.heapMb=a?.usedJSHeapSize?a.usedJSHeapSize/1048576:null}};function rx(e,t,a){for(let n of[...e.querySelectorAll("*")]){if(Zy.has(n.localName.toLowerCase())){n.remove();continue}for(let i of[...n.attributes]){let o=i.name,c=o.toLowerCase(),l=i.value||"";if(c.startsWith("on")){n.removeAttribute(o);continue}if((c==="href"||c==="xlink:href"||c==="src")&&du(l)){if((c==="href"||c==="xlink:href")&&n.localName.toLowerCase()==="image"&&mx(l))continue;n.removeAttribute(o);continue}c==="style"&&n.setAttribute(o,xx(l))}}let s=`prism-${Di(a)}-`,r=new Map;for(let n of e.querySelectorAll("[id]")){let i=n.getAttribute("id"),o=`${s}${Di(i)}`;r.set(i,o),n.setAttribute("id",o)}for(let n of e.querySelectorAll("*"))for(let i of[...n.attributes]){let o=i.name.toLowerCase(),c=i.value||"";ex.has(o)&&(c.startsWith("#")&&r.has(c.slice(1))?c=`#${r.get(c.slice(1))}`:yx(c)&&(c=new URL(c,t).toString())),c=wx(c,r),n.setAttribute(i.name,c)}}function au(e,t,a){let s=new Map,r=new Map,n=new Map,i=[];for(let f of a){let u=ox(f,t);i.push(u),r.set(u.stableKey,u),n.set(Number(u.id||0),u);for(let g of cx(u))s.has(g)||s.set(g,[]),s.get(g).push(u)}let o=new Map,c=new Map,l=new Map;for(let f of i)l.set(f.stableKey,f);for(let f of e.querySelectorAll("[data-uuid], [data-element-key], [data-primitive], [data-ref], [data-pin], [data-object-id], [data-designator], [data-component]")){let u=nx(f,s,t);if(u&&!lu(u)||!u&&!gx(f))continue;let g=lx(f,t),b=u?.stableKey||g,h=u?.netUid||"",d=u?.netName||"";f.classList.add("prism-feature"),f.dataset.featureKey=b,f.dataset.sourceId=u?.sourceId||f.dataset.uuid||f.dataset.elementKey||"",f.dataset.role=u?.kind||f.dataset.primitive||f.dataset.ref||"feature",u?.id&&(f.dataset.featureId=String(u.id)),h&&(f.dataset.netUid=h),d&&(f.dataset.netName=d),f.id||(f.id=`prism-feature-${Di(b)}`),ou(o,b,f),l.set(b,u||{id:0,stableKey:b,kind:f.dataset.role,sourceId:f.dataset.sourceId,sheetInstancePath:t.sheetInstancePath||""}),h&&ou(c,h,f)}for(let[f,u]of o){let g=l.get(f),b=cu(u);g&&b&&(g.domBoundsMm=fx(g.boundsMm,b))}return{featureToElements:o,netToElements:c,featureByKey:l,byId:n,bySource:s,features:i}}function nx(e,t,a){let r=[e.dataset.uuid,e.dataset.elementKey,e.dataset.sourceId,e.dataset.objectId,e.dataset.componentUid,e.dataset.componentUuid,e.dataset.ref&&`${e.dataset.ref}:${e.dataset.pin||""}`].filter(Boolean).flatMap(i=>t.get(i)||[]);if(!r.length)return null;let n=String(e.dataset.primitive||e.dataset.ref||e.dataset.pin||"").toLowerCase();return r.map(i=>({feature:i,score:ix(i,n,a)})).sort((i,o)=>o.score-i.score)[0].feature}function ix(e,t,a){let s=0,r=String(e.kind||"").toLowerCase();return e.sheetInstancePath===a.sheetInstancePath&&(s+=20),e.netUid&&(s+=4),t&&r.includes(t)&&(s+=8),t==="symbol"&&r==="symbol_body"&&(s+=12),(t==="label"||t==="port")&&(r.includes("label")||r.includes("port"))&&(s+=12),t==="sheet"&&r==="sheet"&&(s+=12),r!=="record"&&(s+=2),r.includes("pin")&&(s+=2),s}function ox(e,t){let a=e.sourceId||e.sourceUid||e.uuid||e.objectId||e.stableKey||"";return{...e,id:Number(e.id||0),sourceId:a,stableKey:e.stableKey||`${t.sheetInstancePath||t.id}|${a}|0|${e.kind||"feature"}|0`,sheetInstancePath:e.sheetInstancePath||t.sheetInstancePath||""}}function cx(e){let t=new Set([e.sourceId,e.sourceUid,e.uuid,e.objectId,e.stableKey].filter(Boolean).map(String));return e.reference&&e.pinNumber&&t.add(`${e.reference}:${e.pinNumber}`),e.componentDesignator&&t.add(e.componentDesignator),e.reference&&t.add(e.reference),[...t]}function lx(e,t){let a=e.dataset.uuid||e.dataset.elementKey||e.dataset.objectId||e.dataset.ref||e.id||"svg",s=e.dataset.primitive||e.dataset.role||e.localName||"feature";return`${t.sheetInstancePath||t.id}|${a}|0|${s}|0`}function dx(e){let t=document.createElementNS(cs,"style");t.textContent=`
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
  `,e.prepend(t)}function su(e){let t=document.createElementNS(cs,"g");return t.setAttribute("class","prism-svg-net-overlay"),t.setAttribute("data-prism-overlay","net-highlight"),e.append(t),t}function ru(e){let t=document.createElementNS(cs,"g");return t.setAttribute("class","prism-svg-selection-overlay"),t.setAttribute("data-prism-overlay","selection"),t.style.pointerEvents="none",e.append(t),t}function ux(e){let t=e.cloneNode(!0);t.removeAttribute("id"),t.removeAttribute("data-feature-key"),t.removeAttribute("data-net-uid"),t.removeAttribute("data-net-name"),t.classList.add("prism-svg-net-overlay-clone");for(let a of[t,...Array.from(t.querySelectorAll?.("*")||[])])a instanceof SVGElement&&(a.removeAttribute("filter"),a.style.pointerEvents="none",a.style.stroke="#18ef52",a.style.fill="none",a.style.opacity="0.98",a.style.vectorEffect="non-scaling-stroke");return t}function cu(e){let t=null;for(let a of e)if(a.getBBox)try{let s=a.getBBox(),r=[s.x,s.y,s.x+s.width,s.y+s.height];t=t?[Math.min(t[0],r[0]),Math.min(t[1],r[1]),Math.max(t[2],r[2]),Math.max(t[3],r[3])]:r}catch{}return t}function fx(e,t){return e?t?[Math.min(e[0],t[0]),Math.min(e[1],t[1]),Math.max(e[2],t[2]),Math.max(e[3],t[3])]:e:t}function Or(e,t){let a=e.getAttribute("viewBox");if(a){let s=a.trim().split(/[\s,]+/).map(Number);if(s.length===4&&s.every(Number.isFinite))return s}return[0,0,t.sourceWidthMm||t.widthMm||1,t.sourceHeightMm||t.heightMm||1]}function nu(){return{featureToElements:new Map,netToElements:new Map,featureByKey:new Map,byId:new Map,bySource:new Map,features:[]}}function hx(e){let t=e?.container?.getBoundingClientRect?.();if(!e?.svg||!e?.page||!t?.width||!t?.height)return .1;let a=Or(e.svg,e.page);return Math.max(a[2]/t.width,a[3]/t.height)}function bx(e){let t=String(e?.kind||"").toLowerCase(),a=String(e?.semanticRole||"").toLowerCase(),s=`${e?.sourceId||""} ${e?.objectId||""} ${e?.text||""}`.toLowerCase();return t.includes("page")||a.includes("page")||t.includes("background")||a.includes("background")||s.includes("background")||s.includes("sheet_header")||s.includes("sheet header")||s.includes("drawing-sheet")}function px(e){let t=String(e?.kind||e?.semanticRole||"").toLowerCase();return t.includes("pin")?90:t.includes("label")||t.includes("port")?78:t.includes("wire")||t.includes("bus")||t.includes("junction")?70:t.includes("symbol")||t.includes("component")?54:t.includes("image")?30:20}function lu(e){if(!e||bx(e))return!1;let t=String(e.kind||e.semanticRole||"").toLowerCase();return["pin","label","port","wire","bus","junction","no_connect","symbol","component","sheet","image","text"].some(a=>t.includes(a))}function gx(e){let t=`${e?.dataset?.primitive||""} ${e?.dataset?.ref||""} ${e?.dataset?.role||""} ${e?.dataset?.objectId||""} ${e?.dataset?.text||""}`.toLowerCase();return!t||t.includes("background")||t.includes("sheet_header")||t.includes("sheet header")||t.includes("drawing-sheet")?!1:["pin","label","port","wire","bus","junction","no_connect","symbol","component","sheet","image","text"].some(a=>t.includes(a))}function iu(e){return String(e?.kind||e?.feature?.kind||"").toLowerCase()==="sheet"}function ou(e,t,a){e.has(t)||e.set(t,[]),e.get(t).push(a)}function du(e){let t=String(e||"").trim().toLowerCase();return!t||t.startsWith("#")?!1:t.startsWith("javascript:")||t.startsWith("data:")||t.startsWith("http://")||t.startsWith("https://")}function mx(e){return/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(String(e||"").trim())}function yx(e){let t=String(e||"").trim();return t&&!t.startsWith("#")&&!/^[a-z][a-z0-9+.-]*:/i.test(t)}function xx(e){return String(e||"").replace(/url\(([^)]+)\)/gi,(t,a)=>{let s=a.trim().replace(/^['"]|['"]$/g,"");return du(s)?"none":t})}function wx(e,t){let a=String(e||"");return a=a.replace(/url\(#([^)]+)\)/g,(s,r)=>t.has(r)?`url(#${t.get(r)})`:s),a=a.replace(/^#(.+)$/,(s,r)=>t.has(r)?`#${t.get(r)}`:s),a}function Di(e){return String(e||"").trim().replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,96)||"item"}function Fr(e,t,a){return Math.max(t,Math.min(a,e))}function wt(e){return`${e.level||""}/${e.id}`}function uu(e){let t=e.ends||[],a=e.wires||[];return t.length<2?[]:t.length===2?[{key:`${t[0].id}~${t[1].id}`,a:t[0].id,b:t[1].id,wires:new Set(a.map(s=>s.id))}]:t.map(s=>({key:`hub~${s.id}`,a:"hub",b:s.id,wires:new Set(a.filter(r=>r.from===s.id||r.to===s.id).map(r=>r.id))}))}function vx(e,t){return!t||t.harness!==e.id?!1:!e.level||!t.occurrence||t.occurrence.startsWith(`${e.level}/`)}function fu(e,t){let a=new Map;for(let s of e||[]){let r=new Map,n=new Set((s.wires||[]).map(i=>i.id));for(let i of t||[])for(let o of i.wires||[])n.has(o.wire)&&vx(s,o)&&!r.has(o.wire)&&r.set(o.wire,i.color);r.size&&a.set(wt(s),r)}return a}function hu(e,t){if(!t)return null;for(let a of e.wires)if(t.has(a))return t.get(a);return null}function bu(e,t){let a=new Map;if(!t)return a;for(let s of e.wires||[]){let r=t.get(s.id);r&&(a.has(s.from)||a.set(s.from,r),a.has(s.to)||a.set(s.to,r))}return a}function pu(e){let t=e.filter(Boolean);return t.length<2?null:[0,1,2].map(a=>t.reduce((s,r)=>s+r[a],0)/t.length)}var Qt="auto",Mx=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];function Ta(e,t){return e.level?t(e.level):Mx}function Ui(e,t){return[0,1,2].map(a=>e[a]*t[0]+e[4+a]*t[1]+e[8+a]*t[2]+e[12+a])}function ls(e,t){let a=[t[0]-e[12],t[1]-e[13],t[2]-e[14]];return[0,1,2].map(s=>e[s*4]*a[0]+e[s*4+1]*a[1]+e[s*4+2]*a[2])}function zi(e,t,a){return t?e.map(s=>{if(a(s)!==t.harness)return s;let r=s.nodes??[];if(t.insert)return{...s,nodes:[...r,t.insert]};let n=t.id===Qt?[{id:Qt,kind:"breakout",positionMm:t.positionMm,pinned:!1,order:-1,ends:[],between:null},...r]:r.map(i=>i.id===t.id?{...i,positionMm:t.positionMm,pinned:i.kind==="waypoint"?!0:i.pinned}:i);return{...s,nodes:n}}):e}var gu="__bend__";function mu(e,{kind:t,segment:a,atMm:s,positionMm:r,toWorldMm:n}){if(t==="breakout"){let x=e.filter(p=>p.kind==="breakout").reduce((p,m)=>Math.max(p,m.order??0),-1);return{id:gu,kind:"breakout",positionMm:r,pinned:!1,order:x+1,ends:[],between:null}}let i=a.samplesMm.flat(),o=x=>{let p=0,m=1/0;for(let y=0;y+2<i.length;y+=3){let v=Math.hypot(i[y]-x[0],i[y+1]-x[1],i[y+2]-x[2]);v<m&&([p,m]=[y/3,v])}return p},c=x=>[...x].sort().join("|"),l=e.filter(x=>x.kind==="waypoint"&&x.between&&c(x.between)===c([a.from,a.to])).sort((x,p)=>(x.order??0)-(p.order??0)),f=l[0]?.between??[a.from,a.to],u=f[0]===a.from?1:-1,g=x=>u*o(x),b=g(s),h=l.filter(x=>g(n(x.positionMm))<b).length,d=l.length?h===0?(l[0].order??0)-1:h===l.length?(l[l.length-1].order??0)+1:((l[h-1].order??0)+(l[h].order??0))/2:0;return{id:gu,kind:"waypoint",positionMm:r,pinned:!0,order:d,ends:[],between:[...f]}}function yu(e,t,a){let s=(e.nodes??[]).map(n=>({id:n.id,kind:n.kind,pinned:!!n.pinned,worldMm:Ui(a,n.positionMm)})),r=t.find(n=>n.to===Qt);return r&&s.push({id:Qt,kind:"breakout",pinned:!1,auto:!0,worldMm:r.samplesMm.slice(-3)}),s}function kx(e,t,a){let s=t[0]-e[0],r=t[1]-e[1],n=s*s+r*r,i=n>0?Math.max(0,Math.min(1,((a[0]-e[0])*s+(a[1]-e[1])*r)/n)):0;return{t:i,distance:Math.hypot(e[0]+i*s-a[0],e[1]+i*r-a[1])}}function xu(e,t,a,s,r=5){let n=null;return e.forEach((i,o)=>{let c=i.samplesMm,l=Math.floor(c.length/3),f=l?a([c[0],c[1],c[2]]):null;for(let u=0;u+1<l;u+=1){let g=[c[u*3+3],c[u*3+4],c[u*3+5]],b=a(g);if(f&&b){let{t:h,distance:d}=kx(f,b,t),x=[0,1,2].map(m=>c[u*3+m]+h*(g[m]-c[u*3+m])),p=r+i.radiusMm*s(x);d<=p&&(!n||d<n.distancePx)&&(n={index:o,sample:u,t:h,pointMm:x,distancePx:d})}f=b}}),n}function wu(e,t,a,s,{right:r,up:n}){if(!(s>0))return[...e];let i=t/s,o=-a/s;return e.map((c,l)=>c+r[l]*i+n[l]*o)}function vu(e,t,a=3){return Math.hypot(t[0]-e[0],t[1]-e[1])>=a}function Eu(e,t,a,s){let{right:r,up:n,back:i}=e.basis(),o=Math.tan(e.fov/2),c=Ee(e.focus,pe(i,e.distance)),l=He(Ee(Ee(pe(i,-1),pe(r,t*o*s)),pe(n,a*o)));return{origin:c,direction:l}}function Ex(e){let t=new Array(16);t[0]=e[5]*e[10]*e[15]-e[5]*e[11]*e[14]-e[9]*e[6]*e[15]+e[9]*e[7]*e[14]+e[13]*e[6]*e[11]-e[13]*e[7]*e[10],t[4]=-e[4]*e[10]*e[15]+e[4]*e[11]*e[14]+e[8]*e[6]*e[15]-e[8]*e[7]*e[14]-e[12]*e[6]*e[11]+e[12]*e[7]*e[10],t[8]=e[4]*e[9]*e[15]-e[4]*e[11]*e[13]-e[8]*e[5]*e[15]+e[8]*e[7]*e[13]+e[12]*e[5]*e[11]-e[12]*e[7]*e[9],t[12]=-e[4]*e[9]*e[14]+e[4]*e[10]*e[13]+e[8]*e[5]*e[14]-e[8]*e[6]*e[13]-e[12]*e[5]*e[10]+e[12]*e[6]*e[9],t[1]=-e[1]*e[10]*e[15]+e[1]*e[11]*e[14]+e[9]*e[2]*e[15]-e[9]*e[3]*e[14]-e[13]*e[2]*e[11]+e[13]*e[3]*e[10],t[5]=e[0]*e[10]*e[15]-e[0]*e[11]*e[14]-e[8]*e[2]*e[15]+e[8]*e[3]*e[14]+e[12]*e[2]*e[11]-e[12]*e[3]*e[10],t[9]=-e[0]*e[9]*e[15]+e[0]*e[11]*e[13]+e[8]*e[1]*e[15]-e[8]*e[3]*e[13]-e[12]*e[1]*e[11]+e[12]*e[3]*e[9],t[13]=e[0]*e[9]*e[14]-e[0]*e[10]*e[13]-e[8]*e[1]*e[14]+e[8]*e[2]*e[13]+e[12]*e[1]*e[10]-e[12]*e[2]*e[9],t[2]=e[1]*e[6]*e[15]-e[1]*e[7]*e[14]-e[5]*e[2]*e[15]+e[5]*e[3]*e[14]+e[13]*e[2]*e[7]-e[13]*e[3]*e[6],t[6]=-e[0]*e[6]*e[15]+e[0]*e[7]*e[14]+e[4]*e[2]*e[15]-e[4]*e[3]*e[14]-e[12]*e[2]*e[7]+e[12]*e[3]*e[6],t[10]=e[0]*e[5]*e[15]-e[0]*e[7]*e[13]-e[4]*e[1]*e[15]+e[4]*e[3]*e[13]+e[12]*e[1]*e[7]-e[12]*e[3]*e[5],t[14]=-e[0]*e[5]*e[14]+e[0]*e[6]*e[13]+e[4]*e[1]*e[14]-e[4]*e[2]*e[13]-e[12]*e[1]*e[6]+e[12]*e[2]*e[5],t[3]=-e[1]*e[6]*e[11]+e[1]*e[7]*e[10]+e[5]*e[2]*e[11]-e[5]*e[3]*e[10]-e[9]*e[2]*e[7]+e[9]*e[3]*e[6],t[7]=e[0]*e[6]*e[11]-e[0]*e[7]*e[10]-e[4]*e[2]*e[11]+e[4]*e[3]*e[10]+e[8]*e[2]*e[7]-e[8]*e[3]*e[6],t[11]=-e[0]*e[5]*e[11]+e[0]*e[7]*e[9]+e[4]*e[1]*e[11]-e[4]*e[3]*e[9]-e[8]*e[1]*e[7]+e[8]*e[3]*e[5],t[15]=e[0]*e[5]*e[10]-e[0]*e[6]*e[9]-e[4]*e[1]*e[10]+e[4]*e[2]*e[9]+e[8]*e[1]*e[6]-e[8]*e[2]*e[5];let a=e[0]*t[0]+e[1]*t[4]+e[2]*t[8]+e[3]*t[12];return Math.abs(a)<1e-30?null:t.map(s=>s/a)}function Mu(e,t){return[0,1,2].map(a=>e[a]*t[0]+e[4+a]*t[1]+e[8+a]*t[2]+e[12+a])}function ku(e,t){return[0,1,2].map(a=>e[a]*t[0]+e[4+a]*t[1]+e[8+a]*t[2])}function Sx(e,t,a){let s=-1/0,r=1/0;for(let n=0;n<3;n+=1){if(Math.abs(t[n])<1e-15){if(e[n]<a[n]||e[n]>a[n+3])return!1;continue}let i=(a[n]-e[n])/t[n],o=(a[n+3]-e[n])/t[n];s=Math.max(s,Math.min(i,o)),r=Math.min(r,Math.max(i,o))}return r>=Math.max(s,0)}function Tx(e,t,a){let s=null;for(let r of e){if(r.bounds&&!Sx(t,a,r.bounds))continue;let n=r.position,i=r.indices,o=i?i.length:n.length/3;for(let c=0;c+2<o;c+=3){let l=(i?i[c]:c)*3,f=(i?i[c+1]:c+1)*3,u=(i?i[c+2]:c+2)*3,g=[n[f]-n[l],n[f+1]-n[l+1],n[f+2]-n[l+2]],b=[n[u]-n[l],n[u+1]-n[l+1],n[u+2]-n[l+2]],h=qe(a,b),d=et(g,h);if(Math.abs(d)<1e-18)continue;let x=[t[0]-n[l],t[1]-n[l+1],t[2]-n[l+2]],p=et(x,h)/d;if(p<0||p>1)continue;let m=qe(x,g),y=et(a,m)/d;if(y<0||p+y>1)continue;let v=et(b,m)/d;v>1e-12&&(!s||v<s.t)&&(s={t:v,normal:qe(g,b)})}}return s}function Su(e,t){let a=null;for(let s of e){let r=Ex(s.matrix);if(!r)continue;let n=Mu(r,t.origin),i=ku(r,t.direction),o=Tx(s.primitives,n,i);if(!o)continue;let c=Mu(s.matrix,Ee(n,pe(i,o.t))),l=Math.hypot(...c.map((g,b)=>g-t.origin[b]));if(a&&l>=a.distance)continue;let f=[r[0],r[4],r[8],0,r[1],r[5],r[9],0,r[2],r[6],r[10],0,0,0,0,1],u=He(ku(f,o.normal));et(u,t.direction)>0&&(u=pe(u,-1)),a={key:s.key,point:c,normal:u,distance:l}}return a?{key:a.key,point:a.point,normal:a.normal}:null}var Ie={bootMm:10,housingDepthMm:8,breakoutLiftMm:10,chordErrorMm:.2,catmullRomAlpha:.5,minBendRadiusFactor:6,bendRelaxIterations:8,packingFactor:1.2,ringSegments:12,breakoutBlendMm:5,lengthAllowance:.1,lengthMismatchTolerance:.15,boardCollisionMarginMm:1,defaultGaugeAwg:"24"},Gi={24:1.143,22:1.3208,20:1.524,18:1.8034,16:2.0066,14:2.3622,12:2.8956,10:3.5306,8:5.0546,6:6.35,4:7.9248,2:9.8552,1:10.9474,0:12.1666,"00":13.8684};function Tu(e){let t=e==null?null:String(e).trim().toUpperCase().replace(/AWG$/,"").trim();return t!==null&&t in Gi?{odMm:Gi[t],assumed:!1}:{odMm:Gi[Ie.defaultGaugeAwg],assumed:!0}}var jr=(Math.sqrt(5)-1)/2,Ix=60;function Ax(e,t,a){let s=0;for(let r=0;r<3;r+=1){let n=e[r]<t[r]?t[r]-e[r]:e[r]>a[r]?e[r]-a[r]:0;s+=n*n}return s}function _x(e,t,a,s){let r=b=>Ax([0,1,2].map(h=>e[h]+b*(t[h]-e[h])),a,s),n=0,i=1,o=i-jr*(i-n),c=n+jr*(i-n),l=r(o),f=r(c);for(let b=0;b<Ix;b+=1)l<=f?([i,c,f]=[c,o,l],o=i-jr*(i-n),l=r(o)):([n,o,l]=[o,c,f],c=n+jr*(i-n),f=r(c));let[u,g]=l<=f?[o,l]:[c,f];for(let b of[0,1]){let h=r(b);h<g&&([u,g]=[b,h])}return[Math.sqrt(g),u]}function Rx(e,t){let a=[t[0]-e[12],t[1]-e[13],t[2]-e[14]];return[0,1,2].map(s=>e[s*4]*a[0]+e[s*4+1]*a[1]+e[s*4+2]*a[2])}function Nx(e,t){let[a,s]=[e[t],e[t+1]],r=0;for(let n=0;n<3;n+=1)r+=(s[n]-a[n])*(s[n]-a[n]);return Math.sqrt(r)}function Iu(e,t){let a=e.length-1,s=0;for(let r=0;r<a;r+=1){let n=t?r:a-1-r;if(s>=Ie.bootMm)return r;s+=Nx(e,n)}return a}function Au(e,t){let a=Ie.boardCollisionMarginMm,s=t.map(n=>({board:n,lo:[0,1,2].map(i=>n.minMm[i]-a),hi:[0,1,2].map(i=>n.maxMm[i]+a)})),r=[];for(let n of e.curves){let i=n.diameterMm/2,o=n.samplesMm;if(i<=0||o.length<2)continue;let c=o.length-1,l=new Map,f=(b,h,d)=>{let x=l.get(b)??new Set;for(let p=h;p<d;p+=1)x.add(p);l.set(b,x)},u=e.ends[n.from];u&&f(u.occurrence,0,Iu(o,!0));let g=e.ends[n.to];g&&f(g.occurrence,c-Iu(o,!1),c);for(let{board:b,lo:h,hi:d}of s){let x=o.map(v=>Rx(b.matrix,v)),p=l.get(b.id),m=[],y=null;for(let v=0;v<c;v+=1){if(p?.has(v))continue;let[E,S]=_x(x[v],x[v+1],h,d);E<i&&(m.push(v),(!y||E<y[0])&&(y=[E,v,S]))}if(y){let[v,E,S]=y,[T,A]=[o[E],o[E+1]];r.push({segmentId:n.segmentId,board:b.id,distanceMm:v,radiusMm:i,atMm:[0,1,2].map(_=>T[_]+S*(A[_]-T[_])),spans:m})}}}return r}var Cx=/_vertical(_|$)/i,Bx=/_(horizontal|rightangle|right_angle|angled)(_|$)|_RA(_|$)/i,Ru=e=>e*Math.PI/180;function _u(e){let t=e.replace(/[0-9]+$/,""),a=e.slice(t.length);return[t,a?Number.parseInt(a,10):-1,e]}function Fx(e,t){let[a,s,r]=_u(e),[n,i,o]=_u(t);return a!==n?a<n?-1:1:s!==i?s-i:r<o?-1:r>o?1:0}function Vi(e,t){let a=Ru(e.rotationDeg),s=t[0]-e.positionMm[0],r=t[1]-e.positionMm[1];return[s*Math.cos(a)+r*Math.sin(a),-s*Math.sin(a)+r*Math.cos(a)]}function Nu(e,t){let a=Ru(e.rotationDeg);return[t[0]*Math.cos(a)-t[1]*Math.sin(a),t[0]*Math.sin(a)+t[1]*Math.cos(a),0]}function Ox(e){return new Set(e.pads.map(t=>`${t.positionMm[0]},${t.positionMm[1]}`)).size}function Cu(e){let t=e.pads.filter(a=>a.pad);return t.length?t:e.pads}function Bu(e){let t=Cu(e),a=t.length;return[t.reduce((s,r)=>s+r.positionMm[0],0)/a,t.reduce((s,r)=>s+r.positionMm[1],0)/a]}function Px(e,t){let a=Math.atan2(t,e)*180/Math.PI,s=jx(a/90)*90;return Math.abs(a-s)>20?null:{0:"+x",90:"+y",180:"-x","-180":"-x","-90":"-y"}[String(s===0?0:s)]}function jx(e){let t=Math.floor(e),a=e-t;return a>.5?t+1:a<.5||t%2===0?t:t+1}function Lx(e){let t=(d,x,...p)=>({axis:x==="low"?null:d,confidence:x,reasons:p});if(!e||Ox(e)<2)return t(null,"low","too_few_pads");let a=e.side==="top"?"top":"bottom",s=e.footprintName??"",r=Cx.test(s),n=Bx.test(s),i=e.courtyard;if(!i)return r?t(a,"medium","name_vertical","no_courtyard"):t(null,"low","no_courtyard");let o=e.pads.map(d=>Vi(e,d.positionMm)),c=o.map(([d])=>d),l=o.map(([,d])=>d),f=[c.reduce((d,x)=>d+x,0)/c.length,l.reduce((d,x)=>d+x,0)/l.length],u=[(i.minMm[0]+i.maxMm[0])/2,(i.minMm[1]+i.maxMm[1])/2],g=Math.min(...c)-1<=u[0]&&u[0]<=Math.max(...c)+1&&Math.min(...l)-1<=u[1]&&u[1]<=Math.max(...l)+1,b=[u[0]-f[0],u[1]-f[1]],h=!g&&Math.hypot(...b)>=.5?Px(...b):null;return r?g?t(a,"high","name_vertical","body_over_pads"):t(null,"low","name_vertical","name_conflicts_geometry"):n?h?t(h,"high","name_right_angle","body_off_pads"):t(null,"low","name_right_angle","name_conflicts_geometry"):g?t(a,"medium","body_over_pads"):h?t(h,"medium","body_off_pads"):t(null,"low","body_ambiguous")}function Lr(e){let t=Math.sqrt(e.reduce((a,s)=>a+s*s,0));return e.map(a=>a/t)}var Dx=(e,t)=>[e[1]*t[2]-e[2]*t[1],e[2]*t[0]-e[0]*t[2],e[0]*t[1]-e[1]*t[0]],Ki=(e,t)=>e.reduce((a,s,r)=>a+s*t[r],0);function Ux(e){let t=e.pads.filter(s=>s.pad),a=t.find(s=>s.pad==="1");return a||(t.length?[...t].sort((s,r)=>Fx(s.pad,r.pad))[0]:e.pads[0])}function zx(e){let[t,a]=Bu(e),s=Cu(e),r=s.length,n=0,i=0,o=0;for(let b of s)n+=(b.positionMm[0]-t)**2,i+=(b.positionMm[1]-a)**2,o+=(b.positionMm[0]-t)*(b.positionMm[1]-a);n/=r,i/=r,o/=r;let c=(n+i)/2,l=n*i-o*o,f=Math.sqrt(Math.max(c*c-l,0)),u=c+f,g=c-f;return u<=1e-12||u-g<=.05*u?Nu(e,[1,0]):Math.abs(o)>1e-12?Lr([u-i,o,0]):n>=i?[1,0,0]:[0,1,0]}function Gx(e,t){if(t==="top")return[0,0,1];if(t==="bottom")return[0,0,-1];let a=t[0]==="-"?-1:1;return Lr(Nu(e,t[1]==="x"?[a,0]:[0,a]))}function Hi(e,t,a){let[s,r,n]=e,[i,o,c]=t,[l,f,u]=a,g=s+o+u,b;if(g>0){let d=Math.sqrt(g+1)*2;b=[(c-f)/d,(l-n)/d,(r-i)/d,.25*d]}else if(s>o&&s>u){let d=Math.sqrt(1+s-o-u)*2;b=[.25*d,(i+r)/d,(l+n)/d,(c-f)/d]}else if(o>u){let d=Math.sqrt(1+o-s-u)*2;b=[(i+r)/d,.25*d,(f+c)/d,(l-n)/d]}else{let d=Math.sqrt(1+u-s-o)*2;b=[(l+n)/d,(f+c)/d,.25*d,(r-i)/d]}return b=Lr(b),([b[3],b[0],b[1],b[2]].find(d=>Math.abs(d)>1e-12)??1)<0?b.map(d=>-d):b}function ds(e,t,a){if(!e||e.pads.length===0)return null;let s=a?a.axis:Lx(e).axis;if(!s)return null;let r=a?((a.quarterTurns??0)%4+4)%4:0,[n,i]=Bu(e),o=(t??0)/2,c=[n,i,e.side==="top"?o:-o],l=Gx(e,s),f=zx(e),u=Ki(f,l),g=[f[0]-u*l[0],f[1]-u*l[1],f[2]-u*l[2]];Math.sqrt(Ki(g,g))<1e-9&&(g=[-l[1],l[0],0]),g=Lr(g);let b=Ux(e).positionMm;Ki([b[0]-n,b[1]-i,0],g)>1e-9&&(g=g.map(d=>-d));let h=Dx(l,g);for(let d=0;d<r;d+=1)[g,h]=[h,g.map(x=>-x)];return{axis:s,quarterTurns:r,originMm:c,xAxis:g,yAxis:h,zAxis:l,rotation:Hi(g,h,l)}}function xe(e){return Math.round(e*1e9)/1e9+0}function Dr(e){let t=Math.hypot(...e)||1,a=e.map(r=>r/t),s=[a[3],a[0],a[1],a[2]].find(r=>Math.abs(r)>1e-12)??1;return a.map(r=>xe(s<0?-r:r))}function us(e,t){let[a,s,r,n]=e,i=s*t[2]-r*t[1],o=r*t[0]-a*t[2],c=a*t[1]-s*t[0];return[t[0]+2*(n*i+s*c-r*o),t[1]+2*(n*o+r*i-a*c),t[2]+2*(n*c+a*o-s*i)]}function Kx(e,t){let[a,s,r,n]=e,[i,o,c,l]=t;return[n*i+a*l+s*c-r*o,n*o-a*c+s*l+r*i,n*c+a*o-s*i+r*l,n*l-a*i-s*o-r*c]}function dt(e,t){let a=us(e.rotation,t.translationMm);return{translationMm:e.translationMm.map((s,r)=>xe(s+a[r])),rotation:Dr(Kx(e.rotation,t.rotation))}}function qi(e){let[t,a,s,r]=e.rotation,[n,i,o]=e.translationMm;return[1-2*(a*a+s*s),2*(t*a+s*r),2*(t*s-a*r),0,2*(t*a-s*r),1-2*(t*t+s*s),2*(a*s+t*r),0,2*(t*s+a*r),2*(a*s-t*r),1-2*(t*t+a*a),0,n,i,o,1].map(xe)}var Fu=5;var Ur=Math.SQRT1_2,HS=[[0,0,0,1],[0,0,Ur,Ur],[0,0,1,0],[0,0,Ur,-Ur]];function Vx(e,t){let a=[0,1,2].map(s=>t[s]-e.originMm[s]);return[e.xAxis,e.yAxis,e.zAxis].map(s=>a[0]*s[0]+a[1]*s[1]+a[2]*s[2])}function zr(e,t,a){let s,r;if(a)s=[...a.minMm],r=[...a.maxMm];else if(e.courtyard)s=[...e.courtyard.minMm,0],r=[...e.courtyard.maxMm,Fu];else{let u=e.pads.map(g=>Vi(e,g.positionMm));s=[Math.min(...u.map(g=>g[0])),Math.min(...u.map(g=>g[1])),0],r=[Math.max(...u.map(g=>g[0])),Math.max(...u.map(g=>g[1])),Fu]}let n=e.rotationDeg*Math.PI/180,[i,o]=e.positionMm,c=(t??0)/2,l=e.side==="top",f=[];for(let u=0;u<8;u+=1){let[g,b,h]=[0,1,2].map(d=>(u>>d&1?r:s)[d]);f.push([i+g*Math.cos(n)-b*Math.sin(n),o+g*Math.sin(n)+b*Math.cos(n),l?c+h:-c-h])}return f}function Gr(e,t){let a=t.map(s=>Vx(e,s));return[[0,1,2].map(s=>Math.min(...a.map(r=>r[s]))),[0,1,2].map(s=>Math.max(...a.map(r=>r[s])))]}var Kr=Math.SQRT1_2,Hx=[[0,0,0,1],[0,0,Kr,Kr],[0,0,1,0],[0,0,Kr,-Kr]],qx=[1,0,0,0],Vr=[0,0,0,1],Wx=(e,t)=>{let a=t*Math.PI/360;return[e[0]*Math.sin(a),e[1]*Math.sin(a),e[2]*Math.sin(a),Math.cos(a)]};function Wi(e){if(!e)return{pose:{translationMm:[0,0,0],rotation:Vr},scale:1};let[t,a,s]=(e.rotationDeg??[0,0,0]).map(Number),r=Vr;for(let[i,o]of[[[0,0,1],s],[[0,1,0],a],[[1,0,0],t]])r=dt({translationMm:[0,0,0],rotation:r},{translationMm:[0,0,0],rotation:Wx(i,o)}).rotation;return{pose:{translationMm:(e.offsetMm??[0,0,0]).map(Number),rotation:Dr(r)},scale:Number(e.scale??1)||1}}function Xx(e){let t=e?.boundsMm;if(!t)return{exit:[0,0,-Ie.housingDepthMm],depth:Ie.housingDepthMm,modeled:!1};let{pose:a,scale:s}=Wi(e.alignment),r=[];for(let c=0;c<8;c+=1){let l=[0,1,2].map(u=>(c>>u&1?t.maxMm:t.minMm)[u]*s),f=us(a.rotation,l);r.push([0,1,2].map(u=>f[u]+a.translationMm[u]))}let n=[0,1,2].map(c=>Math.min(...r.map(l=>l[c]))),i=[0,1,2].map(c=>Math.max(...r.map(l=>l[c]))),o=Math.min(n[2],0);return{exit:[(n[0]+i[0])/2,(n[1]+i[1])/2,o],depth:-o+0,modeled:!0}}function $x(e,t=0,a){let s=Hx[(t%4+4)%4],r=dt({translationMm:[0,0,0],rotation:qx},{translationMm:[0,0,0],rotation:s}),n=dt(e,r),{exit:i,depth:o,modeled:c}=Xx(a),l=dt(n,{translationMm:i,rotation:Vr}).translationMm,f=us(n.rotation,[0,0,-1]),u=[0,1,2].map(g=>l[g]+Ie.bootMm*f[g]);return{pose:n,exitMm:l.map(xe),outward:f.map(xe),legMm:u.map(xe),depthMm:xe(o),modeled:c}}function Ou(e,t,a,s,r=0,n,i){let o=ds(t,a,s);if(!o||!t)return null;let c=Math.max(Gr(o,zr(t,a,i))[1][2],0),l=dt(e,{translationMm:o.originMm,rotation:o.rotation});return l=dt(l,{translationMm:[0,0,c],rotation:Vr}),{...$x(l,r,n),matingPlaneMm:xe(c)}}function Xi(e,t){let a=new Array(16).fill(0);for(let s=0;s<4;s+=1)for(let r=0;r<4;r+=1){let n=0;for(let i=0;i<4;i+=1)n+=e[i*4+r]*t[s*4+i];a[s*4+r]=n}return a}var Yx=(e,t)=>[t[0]-e[0],0,0,0,0,t[1]-e[1],0,0,0,0,t[2]-e[2],0,e[0],e[1],e[2],1];function Jx(e,t){let a=e.connector,s=a?ds(a.geometry,a.thicknessMm,a.stored):null;if(!a||!s)return null;let[r,n]=Gr(s,zr(a.geometry,a.thicknessMm));return[[r[0],-n[1],-t],[n[0],-r[1],0]]}function Pu(e,t){let a=`${e.level||""}/${e.id}`,s=[];for(let r of[...e.ends].sort((n,i)=>n.ordinal-i.ordinal)){let n=t.ends[r.id];if(!n)continue;let i=qi(n.pose),o={key:`${a}/${r.id}`,harness:a,end:r.id};if(r.housing?.boundsMm){let{pose:l,scale:f}=Wi(r.housing.alignment),u=Xi(qi(l),[f,0,0,0,0,f,0,0,0,0,f,0,0,0,0,1]);s.push({...o,matrix:Xi(i,u),model:r.housing});continue}let c=Jx(r,n.depthMm);c&&s.push({...o,matrix:Xi(i,Yx(...c)),model:null})}return s}var Qx=12,Zx=2,ew=1e-9,Aa=(e,t)=>[e[0]-t[0],e[1]-t[1],e[2]-t[2]],vt=(e,t)=>Math.sqrt((e[0]-t[0])**2+(e[1]-t[1])**2+(e[2]-t[2])**2);function Ia(e,t,a,s,r){if(s===a)return[e[0],e[1],e[2]];let n=(s-r)/(s-a),i=(r-a)/(s-a);return[n*e[0]+i*t[0],n*e[1]+i*t[1],n*e[2]+i*t[2]]}function tw(e,t,a,s){let r=Ie.catmullRomAlpha,n=0,i=n+vt(e,t)**r,o=i+vt(t,a)**r,c=o+vt(a,s)**r;return l=>{let f=i+l*(o-i),u=Ia(e,t,n,i,f),g=Ia(t,a,i,o,f),b=Ia(a,s,o,c,f),h=Ia(u,g,n,o,f),d=Ia(g,b,i,c,f);return Ia(h,d,i,o,f)}}function aw(e,t,a){let s=Aa(a,t),r=Aa(e,t),n=Math.sqrt(s[0]*s[0]+s[1]*s[1]+s[2]*s[2]);if(n<1e-12)return vt(e,t);let i=[s[1]*r[2]-s[2]*r[1],s[2]*r[0]-s[0]*r[2],s[0]*r[1]-s[1]*r[0]];return Math.sqrt(i[0]*i[0]+i[1]*i[1]+i[2]*i[2])/n}function ju(e){let t=o=>[o[0],o[1],o[2]];if(e.length<2)return{samples:e.map(t),spans:e.map(()=>0)};let a=e[0],s=e[e.length-1],r=[Aa([2*a[0],2*a[1],2*a[2]],e[1]),...e,Aa([2*s[0],2*s[1],2*s[2]],e[e.length-2])],n=[t(a)],i=[0];for(let o=0;o<e.length-1;o+=1){let c=tw(r[o],r[o+1],r[o+2],r[o+3]),l=(f,u,g,b,h)=>{let d=(f+u)/2,x=c(d);h<Zx||h<Qx&&aw(x,g,b)>Ie.chordErrorMm?(l(f,d,g,x,h+1),l(d,u,x,b,h+1)):(n.push(b),i.push(o))};l(0,1,t(e[o]),t(e[o+1]),0)}return{samples:n,spans:i}}function sw(e,t,a){let s=vt(e,t),r=vt(t,a),n=vt(a,e),i=Aa(t,e),o=Aa(a,e),c=[i[1]*o[2]-i[2]*o[1],i[2]*o[0]-i[0]*o[2],i[0]*o[1]-i[1]*o[0]],l=Math.sqrt(c[0]*c[0]+c[1]*c[1]+c[2]*c[2]);return l<1e-12?Number.POSITIVE_INFINITY:s*r*n/(2*l)}function Lu(e){let t=Number.POSITIVE_INFINITY,a=-1;for(let s=1;s<e.length-1;s+=1){let r=sw(e[s-1],e[s],e[s+1]);r<t&&(t=r,a=s)}return{radius:t,at:a}}function rw(e,t,a){let s=[],r=[];e.forEach((g,b)=>{if(s.length&&vt(s[s.length-1],g)<ew){r[r.length-1]=r[r.length-1]&&t[b];return}s.push([g[0],g[1],g[2]]),r.push(!!t[b])});let n=Ie.minBendRadiusFactor*a,{samples:i,spans:o}=ju(s),{radius:c,at:l}=Lu(i);for(let g=0;g<Ie.bendRelaxIterations&&!(c>=n||l<0);g+=1){let b=o[l],h=[];for(let m=1;m<s.length-1;m+=1)r[m]&&h.push(m);if(!h.length)break;let d=m=>Math.min(Math.abs(m-b),Math.abs(m-(b+1))),x=h[0];for(let m of h)d(m)<d(x)&&(x=m);let p=[0,1,2].map(m=>(s[x-1][m]+s[x+1][m])/2);s[x]=[0,1,2].map(m=>(s[x][m]+p[m])/2),{samples:i,spans:o}=ju(s),{radius:c,at:l}=Lu(i)}let f=0;for(let g=0;g+1<i.length;g+=1)f+=vt(i[g],i[g+1]);let u=g=>g.map(xe);return{controlMm:s.map(u),samplesMm:i.map(u),lengthMm:xe(f),minRadiusMm:Number.isFinite(c)?xe(c):null,minRadiusAllowedMm:xe(n),tightBend:l>=0&&c<n?{atMm:u(i[l]),radiusMm:xe(c)}:null}}function nw(e){let t=Ie.bootMm/2,{exitMm:a,outward:s,legMm:r}=e;return[[a[0],a[1],a[2]],[a[0]+t*s[0],a[1]+t*s[1],a[2]+t*s[2]],[r[0],r[1],r[2]],[r[0]+t*s[0],r[1]+t*s[1],r[2]+t*s[2]]]}function Du(e,t,a={},s={}){let r=new Map(t.nodes.map(n=>[n.id,n.positionMm]));return t.segments.map(n=>{let i=b=>b in e?nw(e[b]):[[...r.get(b)]],o=i(n.from),c=i(n.to),l=(a[n.id]??[]).map(b=>[b[0],b[1],b[2]]),f=[...o,...l,...c.reverse()],u=s[n.id]??[],g=[...o.map(()=>!1),...l.map((b,h)=>!u[h]),...c.map(()=>!1)];return{segmentId:n.id,...rw(f,g,n.diameterMm)}})}var Uu=e=>[e[0],e[1],e[2]];function zu(e,t){return e.filter(a=>a.kind===t).sort((a,s)=>a.order-s.order||(a.id<s.id?-1:a.id>s.id?1:0))}function Gu(e){return zu(e,"breakout").map(t=>({id:t.id,positionMm:Uu(t.positionMm),ends:[...t.ends??[]]}))}function Ku(e,t){let a=(i,o)=>i<o?`${i}
${o}`:`${o}
${i}`,s=new Map;for(let i of zu(t,"waypoint")){let[o,c]=i.between??[],l=a(o,c),f=s.get(l);f?f.push(i):s.set(l,[i])}let r={waypoints:{},pinned:{},unused:[]},n=new Set;for(let i of e.segments){let o=a(i.from,i.to),c=s.get(o);c&&(n.add(o),c[0].between?.[0]!==i.from&&(c=[...c].reverse()),r.waypoints[i.id]=c.map(l=>Uu(l.positionMm)),r.pinned[i.id]=c.map(l=>!!l.pinned))}for(let[i,o]of s)n.has(i)||r.unused.push(...o.map(c=>c.id));return r.unused.sort(),r}var Vu=(e,t)=>Math.hypot(e[0]-t[0],e[1]-t[1],e[2]-t[2]);function iw(e){if(!e.length)return{diameterMm:0,assumedGauge:!1};let t=0,a=!1;for(let s of e){let{odMm:r,assumed:n}=Tu(s.gaugeAwg);t+=r*r,a=a||n}return{diameterMm:xe(Ie.packingFactor*Math.sqrt(t)),assumedGauge:a}}function ow(e,t){let a=e.map(o=>Math.max(t.get(o.id)??0,0));a.every(o=>o===0)&&(a=e.map(()=>1));let s=a.reduce((o,c)=>o+c,0),r=[0,1,2].map(o=>e.reduce((c,l,f)=>c+a[f]*l.legMm[o],0)/s),n=[0,1,2].map(o=>e.reduce((c,l)=>c+l.outward[o],0)/e.length),i=Math.hypot(...n);return i<1e-9?r:[0,1,2].map(o=>r[o]+Ie.breakoutLiftMm*n[o]/i)}function Hu(e,t,a=[]){let s=new Map(e.map(b=>[b.id,b])),r=[],n=[];for(let b of t)s.has(b.from.end)&&s.has(b.to.end)?r.push(b):n.push(b.id);let i=new Map;for(let b of r)for(let h of[b.from.end,b.to.end])i.set(h,(i.get(h)??0)+1);let o=b=>b.map(xe),c=e.map(b=>({id:b.id,kind:"end",positionMm:o(b.legMm)})),l=[];if(a.length){for(let h of a)c.push({id:h.id,kind:"breakout",positionMm:o(h.positionMm)});let b=new Map;for(let h of a)for(let d of h.ends??[])s.has(d)&&!b.has(d)&&b.set(d,h.id);for(let h of e){let d=b.get(h.id);if(d===void 0){let x=a[0];for(let p of a)Vu(p.positionMm,h.legMm)<Vu(x.positionMm,h.legMm)&&(x=p);d=x.id}l.push([h.id,d])}for(let h=0;h+1<a.length;h+=1)l.push([a[h].id,a[h+1].id])}else if(e.length===2)l.push([e[0].id,e[1].id]);else if(e.length>2){c.push({id:"auto",kind:"breakout",positionMm:o(ow(e,i))});for(let b of e)l.push([b.id,"auto"])}let f=new Map(c.map(b=>[b.id,[]]));for(let[b,h]of l)f.get(b).push(h),f.get(h).push(b);let u=(b,h)=>{let d=new Set([b]),x=[b];for(;x.length;){let p=x.pop();for(let m of f.get(p))p===h[0]&&m===h[1]||p===h[1]&&m===h[0]||d.has(m)||(d.add(m),x.push(m))}return d},g=l.map(([b,h])=>{let d=u(b,[b,h]),x=r.filter(p=>d.has(p.from.end)!==d.has(p.to.end));return{id:`${b}~${h}`,from:b,to:h,wires:x.map(p=>p.id),...iw(x)}});return{nodes:c,segments:g,unplaced:n}}var cw=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];function $i(e){return{translationMm:[e[12],e[13],e[14]],rotation:Hi([e[0],e[1],e[2]],[e[4],e[5],e[6]],[e[8],e[9],e[10]])}}function lw(e,t){return[0,1,2].map(a=>e[a]*t[0]+e[4+a]*t[1]+e[8+a]*t[2]+e[12+a])}function qu(e,t){let a={};for(let u of[...e.ends].sort((g,b)=>g.ordinal-b.ordinal)){let g=u.occurrence?t(u.occurrence):null;if(!g||!u.connector||!u.occurrence)continue;let b=u.connector.inOccurrence?dt($i(g),u.connector.inOccurrence):$i(g),h=Ou(b,u.connector.geometry,u.connector.thicknessMm,u.connector.stored,0,u.housing);h&&(a[u.id]={...h,occurrence:u.occurrence})}if(Object.keys(a).length<2)return null;let s=Object.entries(a).map(([u,g])=>({id:u,legMm:g.legMm,outward:g.outward})),r=e.wires.map(u=>({id:u.id,from:{end:u.from},to:{end:u.to},gaugeAwg:u.gaugeAwg??null})),n=e.level?t(e.level):cw,i=n?(e.nodes??[]).map(u=>({...u,positionMm:lw(n,u.positionMm)})):[],o=Hu(s,r,Gu(i)),c=Ku(o,i),l=new Map(o.segments.map(u=>[u.id,u])),f=Du(a,o,c.waypoints,c.pinned).map(u=>{let g=l.get(u.segmentId);return{...u,from:g.from,to:g.to,wires:[...g.wires],diameterMm:g.diameterMm,assumedGauge:g.assumedGauge}});return{ends:a,tree:o,curves:f,unused:c.unused,unplaced:o.unplaced,wires:e.wires.map(u=>({id:u.id,from:u.from,to:u.to}))}}function Wu(e,t,a=[]){let s=[],r=[];for(let n of e){let i=qu(n,t);if(!i)continue;r.push(...Pu(n,i));let o=new Map;for(let c of a.length?Au(i,a):[])o.set(c.segmentId,[...o.get(c.segmentId)??[],c.board]);for(let c of i.curves)c.diameterMm<=0||s.push({harness:`${n.level||""}/${n.id}`,segmentId:c.segmentId,from:c.from,to:c.to,samplesMm:c.samplesMm.flat(),radiusMm:c.diameterMm/2,wires:c.wires,tightBend:c.tightBend!==null,assumedGauge:c.assumedGauge,collides:o.get(c.segmentId)??[]})}return{tubes:s,housings:r}}var Hr=Object.freeze({restricted:{color:[.55,.57,.6,1],label:"Restricted"},loading:{color:[.7,.76,.82,1],label:"Loading\u2026"},building:{color:[.62,.72,.84,1],label:"Building 3D view\u2026"},missing:{color:[.78,.76,.7,1],label:"No 3D view"},failed:{color:[.86,.6,.56,1],label:"3D view failed"},unknown:{color:[.78,.76,.7,1],label:""}}),Xu=Object.freeze([.001,0,0,0,0,.001,0,0,0,0,.001,0,0,0,0,1]);function fs(e,t){let a=new Array(16);for(let s=0;s<4;s+=1)for(let r=0;r<4;r+=1)a[s*4+r]=e[r]*t[s*4]+e[4+r]*t[s*4+1]+e[8+r]*t[s*4+2]+e[12+r]*t[s*4+3];return a}function dw([e,t,a]){return[1,0,0,0,0,1,0,0,0,0,1,0,e,t,a,1]}function uw([e,t,a]){return[e,0,0,0,0,t,0,0,0,0,a,0,0,0,0,1]}function qr(e,t){return fs(Xu,fs(e,t))}function hs(e,t){let a=t.minMm,s=t.maxMm.map((r,n)=>Math.max(r-a[n],.2));return fs(Xu,fs(e,fs(dw(a),uw(s))))}function $u(e,t,a){return e.restricted?"restricted":!e.assetId||!t?"missing":a==="loaded"?null:a==="failed"?"failed":t.status==="ready"?t.bundleUrl&&t.bundleToBoard?"loading":"building":Hr[t.status]?t.status:"unknown"}function Yi(e){return!!(e&&e.status==="ready"&&e.bundleUrl&&e.bundleToBoard)}function Yu(e,t){return!e||e.bundleUrl!==t.bundleUrl||e.loadState==="failed"?"create":e.loadState==="waiting"&&Yi(t)?"load":"keep"}function Ju(e){return(e?.occurrences||[]).filter(t=>t.kind==="board"||t.restricted||t.model||t.box)}function Qu(e){return`box:${e.map(t=>Number(t).toFixed(3)).join(",")}`}function Zu(e){if(!e.length)return!1;let t=0;for(let a of e)if(!a.standIn)t+=1;else if(a.standIn==="loading")return!1;return t>0}function tf(e,t,a=0){return[e/1e3,-t/1e3,a]}function fw({rotation:e=0,mirror:t=!1,tilt:a=0}){let s=t?[-1,0,0]:[1,0,0],r=[0,1,0],n=t?[0,0,-1]:[0,0,1],i=Math.cos(e),o=Math.sin(e),c=s.map((h,d)=>i*h+o*r[d]),l=r.map((h,d)=>-o*s[d]+i*h),f=Math.cos(a),u=Math.sin(a),g=n.map((h,d)=>f*h-u*l[d]),b=l.map((h,d)=>u*n[d]+f*h);return{right:c,up:b,back:g}}function Qi(e,t,a,s,r=0){let{up:n,back:i}=fw(e),o=tf(e.center[0],e.center[1],r),c=s*3,l=o.map((g,b)=>g+i[b]*c),f=1/(e.zoom*1e3),u=qs(t*f,a*f,-s*40,s*40);return aa(u,Hs(l,o,n))}function hw(e,t,a,s){let[r,n,i]=s,o=e[0]*r+e[4]*n+e[8]*i+e[12],c=e[1]*r+e[5]*n+e[9]*i+e[13],l=e[3]*r+e[7]*n+e[11]*i+e[15];return l>0?[(o/l+1)/2*t,(1-c/l)/2*a]:null}function bs(e){let t=e[0]*1e3,a=e[3]*1e3,s=-e[4]*1e3,r=-e[1]*1e3;return{box:{x:t,y:s,w:a-t,h:r-s},bottom:e[2]+e[5]<0}}function Zi(e,t){return e?t?e[2]:e[5]:0}function af(e,t,a,s,r){let n=At(e),i=Qi(t,a,s,n,t.focusZ??0);return hw(i,a,s,tf(r[0],r[1],t.focusZ??0))}var bw=([e,t,a,s])=>({x:Math.min(e,a),y:Math.min(t,s),w:Math.abs(a-e),h:Math.abs(s-t)}),Ji=e=>[e.x+e.w/2,e.y+e.h/2],ef=new WeakMap;function pw(e,t){let a=ef.get(e);if(a)return a;let s=new Map,r=new Map;for(let c of e.features.values()){if(c.sourceUid&&s.set(String(c.sourceUid),c),c.kind!=="pad")continue;let l=/^(.*):pad:\d+:(.+)$/.exec(String(c.sourceUid||""));if(!l)continue;let f=`${l[1]}\0${l[2]}`;r.has(f)||r.set(f,[]),r.get(f).push(c)}let n=new Map;for(let c of t?.physical_objects||[])c.kind==="footprint_body"&&c.designator&&c.bbox_mm?.length===4&&n.set(c.designator,c);let i=new Map((t?.physical_objects||[]).map(c=>[c.uid,c])),o={bySource:s,padsByFootprintPin:r,bodies:n,objects:i};return ef.set(e,o),o}function sf({scene:e,topology:t},a,s){let r=String(a),n=e.componentFeatures.get(r);if(!n)return null;let i=pw(e,t),o=e.features.get(Number(n.featureId)),c=i.bodies.get(r),l=o?.bounds?bs(o.bounds).box:c?bw(c.bbox_mm.map(Number)):null,f=o?.bounds?bs(o.bounds).bottom:String(c?.layer||"").startsWith("B."),u=null;if(s!=null&&s!==""){let b=(t?.terminals||[]).find(d=>d.designator===r&&String(d.pin)===String(s)),h=b?.pcb_pad_id?i.objects.get(b.pcb_pad_id):null;if(u=h?.source_ids?.[0]&&i.bySource.get(String(h.source_ids[0]))||null,!u){let d=i.padsByFootprintPin.get(`${n.footprint}\0${s}`)||[],x=l?Ji(l):null,p=1/0;for(let m of d){let y=Ji(bs(m.bounds).box),v=x?Math.hypot(y[0]-x[0],y[1]-x[1]):0;v<p&&([p,u]=[v,m])}}}let g=u?.bounds?bs(u.bounds).box:null;return!l&&g&&(l=g,f=bs(u.bounds).bottom),l?{reference:r,pin:u?String(s):null,focus:l,anchor:Ji(g||l),anchorBox:g,bottom:f,surfaceZ:Zi(e.runtimeBounds,f)}:null}var Wr=class{#e=new Map;constructor(t=3e3){this.ttlMs=t}get size(){return this.#e.size}record(t,a,s){this.#e.set(t,{matrix:a,at:s})}release(t){this.#e.delete(t)}clear(){this.#e.clear()}active(t){let a=[];for(let[s,r]of this.#e)t-r.at>this.ttlMs?this.#e.delete(s):a.push(r.matrix);return a}};var Jr=1.5*1024*1024*1024;function eo(e){let t=Number(e);return Number.isFinite(t)&&t>0?t:Jr}function rf(e,t){if(t.netName||t.netUid){let a=t.netUid&&e.find(s=>s.uid===t.netUid)||t.netName&&sa(e,t.netName);return a?{kind:"net",id:Number(a.id)}:{kind:"unresolved"}}return t.netId?{kind:"net",id:Number(t.netId)}:t.featureId?{kind:"feature",id:Number(t.featureId)}:t.reference?{kind:"component",reference:String(t.reference)}:{kind:"board"}}function nf(e,t){if(t.kind==="net")e.selectNet(t.id,!0);else if(t.kind==="feature")e.selectFeature(t.id,!0);else if(t.kind==="component")e.selectComponent(t.reference,!0);else return!1;return!0}function of(e,t){return t&&!e?"enter":!t&&e?"leave":null}function gw(e){return(Array.isArray(e)?e:[]).map((t,a)=>{let s=wc(t?.color??Xn[a%Xn.length]);return{key:String(t?.key??a),mark:s,color:`#${(s&16777215).toString(16).padStart(6,"0")}`,members:(Array.isArray(t?.members)?t.members:[]).filter(r=>r&&typeof r.occurrence=="string"&&typeof r.net=="string"),wires:(Array.isArray(t?.wires)?t.wires:[]).filter(r=>r&&typeof r.harness=="string"&&typeof r.wire=="string")}})}function to(){return{selection:null,gpuBudget:null}}var mw=Object.freeze(["setSelection","resize","getViewState","setLayerVisible","applyLayerPreset","setShowBoard","setShowComponents","setShowPlaceholders","setRealisticColors","setBoardLayerVisible","setSeparation","showNetLayers","setNetIsolation","setStatsOverlay","getStats","setLodOverride","setGpuBudget","pickAt","projectComponent","projectPoint"]),Xr=class{#e=null;constructor(t=to()){this.shared=t}get port(){return this.#e}attach(t){if(!t)throw new TypeError("A mode controller attaches to a mounted scene port");this.detach(),this.#e=t,this.replay(t)}detach(){let t=this.#e;this.#e=null,this.release(),t?.dispose?.()}replay(){}release(){}setSelection(t){this.shared.selection=t||null;let a=this.#e;a&&a.quietly(()=>this.applySelection(a,this.shared.selection))}setGpuBudget(t){this.shared.gpuBudget=t,this.#e?.setGpuBudget(eo(t))}resize(){this.#e?.resize()}getViewState(){return this.#e?.getViewState()??null}setLayerVisible(t,a,s=null){this.#e?.setLayerVisible(t,a,s)}applyLayerPreset(t,a=null){this.#e?.applyLayerPreset(t,a)}setShowBoard(t){this.#e?.setShowBoard(t)}setShowComponents(t){this.#e?.setShowComponents(t)}setShowPlaceholders(t){this.#e?.setShowPlaceholders(t)}setRealisticColors(t){this.#e?.setRealisticColors(t)}setBoardLayerVisible(t,a,s){this.#e?.setBoardLayerVisible(t,a,s)}setSeparation(t,a=null){this.#e?.setSeparation(t,a)}showNetLayers(){this.#e?.showNetLayers()}setNetIsolation(t){this.#e?.setNetIsolation(t)}setStatsOverlay(t){this.#e?.setStatsOverlay(t)}getStats(){return this.#e?.stats()??null}setLodOverride(t){this.#e?.setLodOverride(t)}pickAt(t,a){return Promise.resolve(this.#e?.pickAt(t,a)??null)}projectComponent(t,a){return this.#e?.projectComponent(t,a)??null}projectPoint(t,a){return this.#e?.projectPoint(t,a)??null}},yw=Object.freeze(["setHighlightedNets","setHiddenComponents","getComponentReferences","setViewMode","renderInset","insetReady","insetSurfaceZ","releaseInset","insetTarget","projectInset","onSceneChange","insetStats","insetSettings","gpuIdle","loadAnalyticPack","setAnalyticOverlay","analyticAt","analyticStats","unloadAnalyticPack"]),$r=class extends Xr{#e=[];#t=null;#a="pcb";#s=new Set;#r=null;#n=null;attach(t,{workspace:a="pcb"}={}){this.#a=a,super.attach(t)}replay(t){this.#r=t.onSceneChange?.(()=>this.#o())??null,this.#o(),t.setWorkspace(this.#a),this.#t&&t.setHiddenComponents(this.#t),this.shared.gpuBudget!=null&&t.setGpuBudget(eo(this.shared.gpuBudget)),this.shared.selection&&t.quietly(()=>this.applySelection(t,this.shared.selection)),this.#e.length&&this.#i(t,this.#e),this.#n&&this.#c(t,this.#n)}async#c(t,a){await t.loadAnalyticPack(a.bytes,a.options),a.overlay&&t.setAnalyticOverlay(a.overlay)}release(){this.#r?.(),this.#r=null}applySelection(t,a){a?.occurrence!=null&&t.selectOccurrence(a.occurrence),a?nf(t,rf(t.nets(),a)):t.clearSelection()}setWorkspace(t){this.#a=t,this.port?.setWorkspace(t)}setHighlightedNets(t){this.#e=Array.isArray(t)?[...t]:[];let a=this.port;a&&this.#i(a,this.#e)}#i(t,a){let s=yc(t.nets(),a),r=t.anyEmphasis();t.setHighlightedNetIds(s);let n=t.anyEmphasis(),i=of(r,n);i==="enter"?t.showNetProbe():i==="leave"&&t.restoreVisibility(),t.isolating()&&n&&t.isolateLitNets(),t.refreshResidency()}setHiddenComponents(t){this.#t=Array.isArray(t)?[...t]:[],this.port?.setHiddenComponents(this.#t)}getComponentReferences(){return this.port?.getComponentReferences()??[]}setViewMode(t){this.port?.setViewMode(t)}renderInset(t,a,s){return!!this.port?.renderInset(t,a,s)}insetReady(){return!!this.port?.insetReady()}insetSurfaceZ(t){let a=this.port;return a?Zi(a.insetBoard().scene.runtimeBounds,!!t):0}releaseInset(t){this.port?.releaseInset(String(t))}insetTarget(t,a){let s=this.port;return s?sf(s.insetBoard(),t,a):null}projectInset(t,a,s,r){let n=this.port;return n?af(n.insetBoard().scene.runtimeBounds,t,a,s,r):null}onSceneChange(t){return this.#s.add(t),()=>this.#s.delete(t)}#o(){for(let t of this.#s)t()}insetStats(){return this.port?.insetStats()??null}insetSettings(t){return this.port?.insetSettings(t)??null}gpuIdle(){return this.port?.gpuIdle()??Promise.resolve()}async loadAnalyticPack(t,a={}){let s=t instanceof Uint8Array?t:new Uint8Array(t);return this.#n={bytes:s,options:a,overlay:null},this.port?this.port.loadAnalyticPack(s,a):null}setAnalyticOverlay(t){return this.#n&&(this.#n.overlay=t),this.port?.setAnalyticOverlay(t)??null}analyticAt(t,a){return this.port?.analyticAt(t,a)??Promise.resolve(null)}analyticStats(){return this.port?.analyticStats()??null}unloadAnalyticPack(){this.#n=null,this.port?.unloadAnalyticPack()}},xw=Object.freeze(["setSystemScene","setNetEmphasis","frameNetEmphasis","frameAll","frameBoard","frameParts","setMoveMode","setRouteMode","setMoveSpace","previewPose","cancelMove","getMoveState","targetHarnessNode","selectHarness","previewHarnessNode","cancelHarnessNode","getHarnessState","setLabelsVisible","setHarnessesVisible","setHelpVisible","isHelpVisible","setLodThresholds","pickSurfaceAt","focusMoveTarget","viewAxis"]),Yr=class extends Xr{#e=null;#t=null;#a=null;#s=!1;attach(t,{moveAllowed:a=!1}={}){this.#s=!!a,super.attach(t)}replay(t){this.shared.gpuBudget!=null&&t.setGpuBudget(eo(this.shared.gpuBudget)),this.#e&&t.setSystemScene(this.#e),this.#t&&this.#r(t,this.#t),t.setMoveAllowed(this.#s),this.#a!=null&&t.setLabelsVisible(this.#a)}applySelection(t,a){if(!a){t.clearSelection();return}if(t.focusPlacement(a.occurrence)!=="board")return;let s=rf(t.nets(),a);s.kind==="board"?t.selectBoardContext():nf(t,s)}setSystemScene(t){this.#e=t||null,t&&this.port?.setSystemScene(t)}setNetEmphasis(t){this.#t=Array.isArray(t)?t:[];let a=this.port;return a?this.#r(a,this.#t):[]}#r(t,a){let s=t.anyEmphasis(),r=t.setEmphasisSets(gw(a));if(!r)return[];let n=t.anyEmphasis(),i=of(s,n);return i==="enter"?t.showNetProbe():i==="leave"&&(t.isolating()&&t.setNetIsolation(!1),t.restoreVisibility()),t.isolating()&&n&&t.isolateLitNets(),r}frameNetEmphasis(t=null,a=null){return this.port?.frameNetEmphasis(t,a)??!1}frameAll(){this.port?.frameAll()}frameBoard(t){return this.port?.frameBoard(t)??!1}frameParts(t){return this.port?.frameParts(t)??!1}setMoveAllowed(t){this.#s=!!t,this.port?.setMoveAllowed(this.#s)}setMoveMode(t,a){this.port?.setMoveMode(t,a)}setRouteMode(t){this.port?.setMoveMode(t,{route:!0})}setMoveSpace(t){this.port?.setMoveSpace(t)}previewPose(t){this.port?.previewPose(t)}cancelMove(){this.port?.cancelMove()}getMoveState(){return this.port?.getMoveState()??null}targetHarnessNode(t){this.port?.targetHarnessNode(t)}selectHarness(t){return this.port?.selectHarness(t)??!1}previewHarnessNode(t){this.port?.previewHarnessNode(t)}cancelHarnessNode(){this.port?.cancelHarnessNode()}getHarnessState(){return this.port?.getHarnessState()??null}setLabelsVisible(t){this.#a=!!t,this.port?.setLabelsVisible(this.#a)}setHarnessesVisible(t){this.port?.setHarnessesVisible(!!t)}setHelpVisible(t){this.port?.setHelpVisible(t)}isHelpVisible(){return!!this.port?.isHelpVisible()}setLodThresholds(t){return this.port?.setLodThresholds(t)??null}pickSurfaceAt(t,a){return this.port?.pickSurfaceAt(t,a)??null}focusMoveTarget(t){return!!this.port?.focusMoveTarget(t)}viewAxis(t,a=!1){this.port?.viewAxis(t,a)}};function cf(e){let t=(a,s)=>{for(let r of a)Object.defineProperty(e,r,{configurable:!0,writable:!0,value(...n){return s(this)[r](...n)}})};t(mw,a=>a.activeMode),t(yw,a=>a.modes.board),t(xw,a=>a.modes.system)}var _a=class{__destroy_into_raw(){let t=this.__wbg_ptr;return this.__wbg_ptr=0,lf.unregister(this),t}free(){let t=this.__destroy_into_raw();z.__wbg_analyticpack_free(t,0)}barrelRecords(){let t=z.analyticpack_barrelRecords(this.__wbg_ptr);return ws.__wrap(t)}bindingJson(t){let a,s;try{let i=z.analyticpack_bindingJson(this.__wbg_ptr,t);var r=i[0],n=i[1];if(i[3])throw r=0,n=0,Qr(i[2]);return a=r,s=n,Ms(r,n)}finally{z.__wbindgen_free(a,s,1)}}headerJson(){let t,a;try{let n=z.analyticpack_headerJson(this.__wbg_ptr);var s=n[0],r=n[1];if(n[3])throw s=0,r=0,Qr(n[2]);return t=s,a=r,Ms(s,r)}finally{z.__wbindgen_free(t,a,1)}}lowerSlice(t,a){let s=Ew(t,z.__wbindgen_malloc,z.__wbindgen_realloc),r=ks,n=z.analyticpack_lowerSlice(this.__wbg_ptr,s,r,a);if(n[2])throw Qr(n[1]);return vs.__wrap(n[0])}constructor(t){let a=kw(t,z.__wbindgen_malloc),s=ks,r=z.analyticpack_new(a,s);if(r[2])throw Qr(r[1]);return this.__wbg_ptr=r[0],lf.register(this,this.__wbg_ptr,this),this}};Symbol.dispose&&(_a.prototype[Symbol.dispose]=_a.prototype.free);var ws=class e{static __wrap(t){let a=Object.create(e.prototype);return a.__wbg_ptr=t,df.register(a,a.__wbg_ptr,a),a}__destroy_into_raw(){let t=this.__wbg_ptr;return this.__wbg_ptr=0,df.unregister(this),t}free(){let t=this.__destroy_into_raw();z.__wbg_barrelrecords_free(t,0)}floats(){let t=z.barrelrecords_floats(this.__wbg_ptr);var a=Zr(t[0],t[1]).slice();return z.__wbindgen_free(t[0],t[1]*4,4),a}skipped(){return z.barrelrecords_skipped(this.__wbg_ptr)>>>0}words(){let t=z.barrelrecords_words(this.__wbg_ptr);var a=Mt(t[0],t[1]).slice();return z.__wbindgen_free(t[0],t[1]*4,4),a}};Symbol.dispose&&(ws.prototype[Symbol.dispose]=ws.prototype.free);var vs=class e{static __wrap(t){let a=Object.create(e.prototype);return a.__wbg_ptr=t,uf.register(a,a.__wbg_ptr,a),a}__destroy_into_raw(){let t=this.__wbg_ptr;return this.__wbg_ptr=0,uf.unregister(this),t}free(){let t=this.__destroy_into_raw();z.__wbg_loweredslicerecords_free(t,0)}batches(){let t=z.loweredslicerecords_batches(this.__wbg_ptr);var a=Mt(t[0],t[1]).slice();return z.__wbindgen_free(t[0],t[1]*4,4),a}contourEdgeOperations(){let t=z.loweredslicerecords_contourEdgeOperations(this.__wbg_ptr);var a=Mt(t[0],t[1]).slice();return z.__wbindgen_free(t[0],t[1]*4,4),a}contourEdges(){let t=z.loweredslicerecords_contourEdges(this.__wbg_ptr);var a=Zr(t[0],t[1]).slice();return z.__wbindgen_free(t[0],t[1]*4,4),a}covers(){let t=z.loweredslicerecords_covers(this.__wbg_ptr);var a=Mt(t[0],t[1]).slice();return z.__wbindgen_free(t[0],t[1]*4,4),a}cutIndices(){let t=z.loweredslicerecords_cutIndices(this.__wbg_ptr);var a=Mt(t[0],t[1]).slice();return z.__wbindgen_free(t[0],t[1]*4,4),a}edgeCuts(){let t=z.loweredslicerecords_edgeCuts(this.__wbg_ptr);var a=Mt(t[0],t[1]).slice();return z.__wbindgen_free(t[0],t[1]*4,4),a}fanVertices(){let t=z.loweredslicerecords_fanVertices(this.__wbg_ptr);var a=Zr(t[0],t[1]).slice();return z.__wbindgen_free(t[0],t[1]*4,4),a}outlineEdges(){let t=z.loweredslicerecords_outlineEdges(this.__wbg_ptr);var a=Zr(t[0],t[1]).slice();return z.__wbindgen_free(t[0],t[1]*4,4),a}outlineShapes(){let t=z.loweredslicerecords_outlineShapes(this.__wbg_ptr);var a=Mt(t[0],t[1]).slice();return z.__wbindgen_free(t[0],t[1]*4,4),a}shapeCuts(){let t=z.loweredslicerecords_shapeCuts(this.__wbg_ptr);var a=Mt(t[0],t[1]).slice();return z.__wbindgen_free(t[0],t[1]*4,4),a}shapes(){let t=z.loweredslicerecords_shapes(this.__wbg_ptr);var a=Mt(t[0],t[1]).slice();return z.__wbindgen_free(t[0],t[1]*4,4),a}statsJson(){let t,a;try{let s=z.loweredslicerecords_statsJson(this.__wbg_ptr);return t=s[0],a=s[1],Ms(s[0],s[1])}finally{z.__wbindgen_free(t,a,1)}}subtractShapes(){return z.loweredslicerecords_subtractShapes(this.__wbg_ptr)>>>0}};Symbol.dispose&&(vs.prototype[Symbol.dispose]=vs.prototype.free);function ww(){return{__proto__:null,"./kicad_monkey_analytic_bg.js":{__proto__:null,__wbg___wbindgen_throw_bb96b2010945f0bc:function(t,a){throw new Error(Ms(t,a))},__wbindgen_cast_0000000000000001:function(t,a){return Ms(t,a)},__wbindgen_init_externref_table:function(){let t=z.__wbindgen_externrefs,a=t.grow(4);t.set(0,void 0),t.set(a+0,void 0),t.set(a+1,null),t.set(a+2,!0),t.set(a+3,!1)}}}}var lf=typeof FinalizationRegistry>"u"?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(e=>z.__wbg_analyticpack_free(e,1)),df=typeof FinalizationRegistry>"u"?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(e=>z.__wbg_barrelrecords_free(e,1)),uf=typeof FinalizationRegistry>"u"?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(e=>z.__wbg_loweredslicerecords_free(e,1));function Zr(e,t){return e=e>>>0,vw().subarray(e/4,e/4+t)}function Mt(e,t){return e=e>>>0,Mw().subarray(e/4,e/4+t)}var ps=null;function vw(){return(ps===null||ps.byteLength===0)&&(ps=new Float32Array(z.memory.buffer)),ps}function Ms(e,t){return Tw(e>>>0,t)}var gs=null;function Mw(){return(gs===null||gs.byteLength===0)&&(gs=new Uint32Array(z.memory.buffer)),gs}var ms=null;function ys(){return(ms===null||ms.byteLength===0)&&(ms=new Uint8Array(z.memory.buffer)),ms}function kw(e,t){let a=t(e.length*1,1)>>>0;return ys().set(e,a/1),ks=e.length,a}function Ew(e,t,a){if(a===void 0){let o=xs.encode(e),c=t(o.length,1)>>>0;return ys().subarray(c,c+o.length).set(o),ks=o.length,c}let s=e.length,r=t(s,1)>>>0,n=ys(),i=0;for(;i<s;i++){let o=e.charCodeAt(i);if(o>127)break;n[r+i]=o}if(i!==s){i!==0&&(e=e.slice(i)),r=a(r,s,s=i+e.length*3,1)>>>0;let o=ys().subarray(r+i,r+s),c=xs.encodeInto(e,o);i+=c.written,r=a(r,s,i,1)>>>0}return ks=i,r}function Qr(e){let t=z.__wbindgen_externrefs.get(e);return z.__externref_table_dealloc(e),t}var en=new TextDecoder("utf-8",{ignoreBOM:!0,fatal:!0});en.decode();var Sw=2146435072,ao=0;function Tw(e,t){return ao+=t,ao>=Sw&&(en=new TextDecoder("utf-8",{ignoreBOM:!0,fatal:!0}),en.decode(),ao=t),en.decode(ys().subarray(e,e+t))}var xs=new TextEncoder;"encodeInto"in xs||(xs.encodeInto=function(e,t){let a=xs.encode(e);return t.set(a),{read:e.length,written:a.length}});var ks=0,Iw,Aw,z;function _w(e,t){return Aw=e,z=e.exports,Iw=t,ps=null,gs=null,ms=null,z.__wbindgen_start(),z}async function Rw(e,t){if(typeof Response=="function"&&e instanceof Response){if(typeof WebAssembly.instantiateStreaming=="function")try{return await WebAssembly.instantiateStreaming(e,t)}catch(r){if(e.ok&&a(e.type)&&e.headers.get("Content-Type")!=="application/wasm")console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n",r);else throw r}let s=await e.arrayBuffer();return await WebAssembly.instantiate(s,t)}else{let s=await WebAssembly.instantiate(e,t);return s instanceof WebAssembly.Instance?{instance:s,module:e}:s}function a(s){switch(s){case"basic":case"cors":case"default":return!0}return!1}}async function ff(e){if(z!==void 0)return z;e!==void 0&&(Object.getPrototypeOf(e)===Object.prototype?{module_or_path:e}=e:console.warn("using deprecated parameters for the initialization function; pass a single object instead")),e===void 0&&(e=new URL("kicad_monkey_analytic_bg.wasm",import.meta.url));let t=ww();(typeof e=="string"||typeof Request=="function"&&e instanceof Request||typeof URL=="function"&&e instanceof URL)&&(e=fetch(e));let{instance:a,module:s}=await Rw(await e,t);return _w(a,s)}var hf={schema:"prism.vendored_wasm.a0",purpose:"Reads kicad_monkey.materialization.a0 packs in the browser and lowers their slices for the analytic renderer.",source:{repository:"https://github.com/krishna-swaroop/kicad_monkey.git",revision:"b6316117901b344114385242b0ad13be45dfefae",crate:"kicad-monkey-wasm",license:"MIT"},build:{target:"wasm32-unknown-unknown",profile:"release",features:["materialization"],wasm_bindgen:"0.2.126",rustc:"rustc 1.98.0 (88d9e12ae 2026-08-18)",command:"node scripts/build-analytic-wasm.mjs --monkey <kicad_monkey checkout at revision>"},files:{"kicad_monkey_analytic.js":"f4093245af543a7a87cf6ce6aa3d7ce4feb82d17912a35c4171c59b8104dfb9d","kicad_monkey_analytic_bg.wasm":"c48e1f23b0522ed18342f374bdc59db070d4424a95adf0e803d717256d9cfd72"}};var bf="kicad-monkey-analytic.wasm",Cw="kicad_monkey.materialization.a0",Bw=1e3,so=null;function Fw(){let e=String(hf.files?.["kicad_monkey_analytic_bg.wasm"]||"").slice(0,16);try{return new URL(`${bf}?v=${e}`,import.meta.url)}catch{return`/${bf}?v=${e}`}}function Ow(e=Fw()){return so??=ff({module_or_path:e}).catch(t=>{throw so=null,t}),so}async function xf(e,{wasm:t}={}){await Ow(t);let a=new _a(e instanceof Uint8Array?e:new Uint8Array(e)),s=JSON.parse(a.headerJson());if(s.schema!==Cw)throw new Error(`unsupported materialization schema ${s.schema}`);return{header:s,lowerSlice(r,n=Bw){let i=a.lowerSlice(r,n);try{return{shapes:new Uint32Array(i.shapes()),subtractShapes:i.subtractShapes(),fanVertices:new Float32Array(i.fanVertices()),covers:new Uint32Array(i.covers()),batches:new Uint32Array(i.batches()),contourEdges:new Float32Array(i.contourEdges()),contourEdgeOperations:new Uint32Array(i.contourEdgeOperations()),shapeCuts:new Uint32Array(i.shapeCuts()),edgeCuts:new Uint32Array(i.edgeCuts()),cutIndices:new Uint32Array(i.cutIndices()),outlineEdges:new Float32Array(i.outlineEdges()),outlineShapes:new Uint32Array(i.outlineShapes()),stats:JSON.parse(i.statsJson())}}finally{i.free()}},barrels(){let r=a.barrelRecords();try{return{floats:new Float32Array(r.floats()),words:new Uint32Array(r.words()),skipped:r.skipped()}}finally{r.free()}},binding(r){return JSON.parse(a.bindingJson(r))},free(){a.free()}}}function oo(e){return(e.chunks||[]).reduce((t,a)=>t+Number(a.operation_count||0),0)}function Pw(e,t){let a=null;for(let s of e.chunks||[]){if(s.slice_key!==t)continue;let r=s.bounds,n=[r.min_x_nm,r.min_y_nm,r.max_x_nm,r.max_y_nm].map(i=>i/1e6);a=a?[Math.min(a[0],n[0]),Math.min(a[1],n[1]),Math.max(a[2],n[2]),Math.max(a[3],n[3])]:n}return a}var jw={conductor:"copper",solder_mask:"mask",silkscreen:"silk",paste:"paste",dielectric:"dielectric"},wf=1e-6,vf=2e-6,pf=1e-7,gf={"fr4 natural":[109,116,75],"ptfe natural":[252,252,250],polyimide:[205,130,0],"phenolic natural":[92,17,6],aluminum:[213,213,213]};function Lw(e){let t=String(e||"").trim(),a=/^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(t);return[...(a?[0,2,4].map(r=>parseInt(a[1].slice(r,r+2),16)):gf[t.toLowerCase()]||gf["fr4 natural"]).map(r=>r/255),1]}function Mf(e,t,a=0){let s=new Map((t||[]).map(d=>[String(d.name),d])),r=[...e.stack?.slices||[]].sort((d,x)=>d.order-x.order),n=r.filter(d=>d.role==="conductor"),i=d=>Number(s.get(String(d?.kicad_layer||""))?.id||0),o=i(n[0]),c=i(n[n.length-1]),l=[],f=[];for(let d of r){let x=jw[d.role],p=s.get(String(d.kicad_layer||"")),m=Pw(e,d.key);if(!x||!p||!m){x&&f.push(d.key);continue}let y=Number(p.z_mm||0)/1e3+a,v=(Number(p.thickness_mm)||Number(d.thickness_nm||0)/1e6)/2e3,E=d.side==="back"||x!=="dielectric"&&x!=="copper"&&y<a,S={key:d.key,role:x,layerId:Number(p.id),side:d.side||null,bounds:m};if(x==="dielectric"){S.color=Lw(p.color);let T=[...n].reverse().find(C=>C.order<d.order),A=n.find(C=>C.order>d.order),_=[i(T)||i(A),i(A)||i(T)],R={zTop:y+v,zBottom:y-v};l.push({...S,...R,face:"top",z:y+v-pf,faceDown:!1,outer:!1,offsetLayers:_}),l.push({...S,...R,face:"bottom",z:y-v+pf,faceDown:!0,outer:!1,offsetLayers:_})}else if(x==="copper"){let T=n.indexOf(d),A=T===n.length-1&&n.length>1,_=T===0||A,R={...S,bottom:A,outer:_,zTop:y+v,zBottom:y-v,offsetLayers:[Number(p.id),Number(p.id)]};l.push({...R,face:"top",z:y+v,faceDown:!1,mark:_&&!A,walls:!A}),l.push({...R,face:"bottom",z:y-v,faceDown:!0,mark:A,walls:A})}else{let T=x==="silk"?vf:x==="paste"?wf:0,A=E?c:o;l.push({...S,z:E?y-v-T:y+v+T,faceDown:E,outer:!1,thickness:v*2,offsetLayers:[A,A]})}}Dw(l);let u=l.filter(d=>d.role==="dielectric"),g=u.filter(d=>!d.faceDown).sort((d,x)=>x.z-d.z)[0],b=u.filter(d=>d.faceDown).sort((d,x)=>d.z-x.z)[0];for(let d of u)d.skin=d===g||d===b;let h={dielectric:0,copper:1,mask:2,paste:3,silk:4};return l.sort((d,x)=>h[d.role]-h[x.role]),{planned:l,unmatched:f}}function Dw(e){for(let t of e){if(t.role!=="mask"&&t.role!=="silk"&&t.role!=="paste")continue;let a=e.find(c=>c.role==="copper"&&c.mark&&c.faceDown===t.faceDown);if(!a)continue;let s=t.faceDown?-1:1,r=t.faceDown?a.zTop:a.zBottom,n=t.faceDown?a.zBottom:a.zTop,o=e.find(c=>c.role==="mask"&&c.faceDown===t.faceDown)?.thickness||0;t.role==="mask"?(t.coat=o,t.zLow=r+s*o):t.role==="silk"?t.zLow=r+s*(o+vf):t.z=n+s*wf}}function kf(e,t){let a=new Float32Array(Math.max(1,t)).fill(Number.NaN);if(ArrayBuffer.isView(e)||Array.isArray(e))for(let s=0;s<Math.min(t,e.length);s+=1)a[s]=Number(e[s]);else for(let[s,r]of Object.entries(e||{})){let n=Number(s);Number.isInteger(n)&&n>=0&&n<t&&(a[n]=Number(r))}return a}function tn(e){let t=1/0,a=-1/0;for(let s of e)Number.isFinite(s)&&(t=Math.min(t,s),a=Math.max(a,s));return Number.isFinite(t)?[t,a]:[0,1]}function Ef(e){let t=new Map;for(let s of e||[])t.has(s.slice_key)||t.set(s.slice_key,[]),t.get(s.slice_key).push(s);let a=new Map;for(let[s,r]of t){let n=Number(r[0].pitch_nm);if(!(n>0)||r.some(g=>Number(g.pitch_nm)!==n))throw new Error(`field tiles of ${s} must share one positive pitch`);let i=Math.min(...r.map(g=>g.origin_nm[0])),o=Math.min(...r.map(g=>g.origin_nm[1])),c=(g,b)=>{let h=(g-b)/n;if(!Number.isInteger(h))throw new Error(`field tile of ${s} is off its pitch grid`);return h},l=Math.max(...r.map(g=>c(g.origin_nm[0],i)+g.width)),f=Math.max(...r.map(g=>c(g.origin_nm[1],o)+g.height)),u=new Float32Array(l*f).fill(Number.NaN);for(let g of r){let b=c(g.origin_nm[0],i),h=c(g.origin_nm[1],o);for(let d=0;d<g.height;d+=1)u.set(g.values.subarray?g.values.subarray(d*g.width,(d+1)*g.width):g.values.slice(d*g.width,(d+1)*g.width),(h+d)*l+b)}a.set(s,{originMm:[i/1e6,o/1e6],pitchMm:n/1e6,width:l,height:f,values:u})}return a}var ro=8,mf=8,yf=4294967295,Uw=Object.freeze({unplated:2,tentedFront:4,tentedBack:8,coveredFront:16,coveredBack:32,pluggedFront:64,pluggedBack:128,filled:256,capped:512,castellated:1024}),no=16;function zw(e,t,a){let s=null;for(let r=0;e&&r+3<e.length;r+=4){let n=[e[r],e[r+1]],i=[e[r+2],e[r+3]],o=[i[0]-n[0],i[1]-n[1]],c=o[0]*o[0]+o[1]*o[1];if(c<=0)continue;let l=Math.max(0,Math.min(1,((t[0]-n[0])*o[0]+(t[1]-n[1])*o[1])/c)),f=Math.hypot(t[0]-n[0]-l*o[0],t[1]-n[1]-l*o[1]);if(f>a||s&&f>=s.distance)continue;let u=Math.sqrt(c),g=[o[1]/u,o[0]/u];s={distance:f,normal:g,offset:(g[0]*n[0]-g[1]*n[1])/1e3}}return s&&{normal:s.normal,offset:s.offset}}function Sf(e,t,a,s=null){let r=(e.stack?.slices||[]).filter(b=>b.role==="conductor").sort((b,h)=>b.order-h.order),n=new Map((a||[]).filter(b=>b.role===void 0||b.role==="copper").map(b=>[b.key,b])),i=b=>{let h=n.get(b.key);if(!h)return null;if(h.zTop!==void 0)return{top:h.zTop,bottom:h.zBottom,layerId:h.layerId};let d=Number(b.thickness_nm||0)/1e9;return h.bottom?{top:h.z+d,bottom:h.z,layerId:h.layerId}:{top:h.z,bottom:h.z-d,layerId:h.layerId}},o=Math.floor(t.floats.length/ro),c=new ArrayBuffer(o*no*4),l=new Float32Array(c),f=new Uint32Array(c),u=0,g=t.skipped||0;for(let b=0;b<o;b+=1){let h=t.floats.subarray(b*ro,(b+1)*ro),d=t.words.subarray(b*mf,(b+1)*mf),[x,p]=[Math.min(d[1],d[2]),Math.max(d[1],d[2])],m=r.filter(T=>T.order>=x&&T.order<=p&&(d[3]===yf||T.order>d[3])&&(d[4]===yf||T.order<d[4])),y=m.length?i(m[0]):null,v=m.length?i(m[m.length-1]):null;if(!y||!v){g+=1;continue}let E=u*no;l.set([h[0]/1e3,-h[1]/1e3,h[2]/1e3,-h[3],h[4]/1e3,h[5]/1e3,y.top,v.bottom],E),f.set([d[0],y.layerId,v.layerId,d[5]],E+8);let S=d[5]&Uw.castellated?zw(s,[h[0],h[1]],h[4]+h[2]):null;l.set(S?[S.normal[0],S.normal[1],S.offset,0]:[0,0,1,0],E+12),u+=1}return{data:c.slice(0,u*no*4),count:u,skipped:g}}var io=12,Gw=0,Kw=1;function Tf(e,t,a,s=0){let r=(a||[]).filter(b=>b.role==="soldermask").map(b=>Number(b.z_mm)/1e3+s+Math.sign(Number(b.z_mm))*Number(b.thickness_mm||0)/2e3),n=r.length?Math.max(...r):null,i=r.length?Math.min(...r):null,o=e.filter(b=>b.role==="dielectric"&&b.face==="top"&&t.get(b.key)?.contourEdges?.length),c=[],l=(b,h,d,x,p,m)=>{let y=t.get(b.key).contourEdges;for(let v=0;v+3<y.length;v+=4)c.push([y[v],y[v+1],y[v+2],y[v+3],h,d,x,p,m])};for(let b of o)l(b,b.zTop,b.zBottom,b.offsetLayers[0],b.offsetLayers[1],Gw);for(let b of e.filter(h=>h.role==="copper"&&h.face==="top")){let h=v=>Math.min(Math.abs(v.zBottom-b.zTop),Math.abs(v.zTop-b.zBottom)),d=[...o].sort((v,E)=>h(v)-h(E))[0];if(!d)continue;let x=b.outer&&!b.bottom,p=b.outer&&b.bottom,m=x&&n!=null?Math.max(n,b.zTop):b.zTop,y=p&&i!=null?Math.min(i,b.zBottom):b.zBottom;l(d,m,y,b.layerId,b.layerId,Kw)}let f=new ArrayBuffer(c.length*io*4),u=new Float32Array(f),g=new Uint32Array(f);return c.forEach(([b,h,d,x,p,m,y,v,E],S)=>{u.set([b/1e3,-h/1e3,d/1e3,-x/1e3,p,m,0,0],S*io),g.set([y,v,E,0],S*io+8)}),{data:f,count:c.length}}function If(e,t){let a=new Map;for(let i of t||[])for(let o of i?.aliases||[])a.has(String(o))||a.set(String(o),Number(i.id));for(let i of t||[])i?.name&&a.set(String(i.name),Number(i.id));let s=new Map((e.header.nets||[]).map(i=>[i.key,i.name])),r=oo(e.header),n=new Uint32Array(r);for(let i=0;i<r;i+=1){let o=e.binding(i)?.net_key;o&&(n[i]=a.get(s.get(o)??o)||0)}return n}var Nf={color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}};function Cf(e){let t=Float32Array.from(e);for(let a=0;a<t.length;a+=1)Number.isFinite(t[a])||(t[a]=3e38);return t}function Bf(e,t){let a=new Float32Array(e.buffer,e.byteOffset+t*20*4,20),[s,r,n,i,o,c]=[a[4],a[5],a[6],a[7],a[8],a[9]],l=[1/0,1/0,-1/0,-1/0];for(let[f,u]of[[a[10],a[11]],[a[12],a[11]],[a[10],a[13]],[a[12],a[13]]]){let g=s*f+r*u+o,b=n*f+i*u+c;l[0]=Math.min(l[0],g),l[1]=Math.min(l[1],b),l[2]=Math.max(l[2],g),l[3]=Math.max(l[3],b)}return l}var Xw=5e-4,$w={mask:"soldermask",silk:"silkscreen",paste:"paste"};function Yw(e,t){let a=$w[t.role];return!!(e?.size&&a)&&e.has(Jw(a,t.faceDown?"back":"front"))}function Jw(e,t){return`${e}:${t}`}var Ff=.3,an=class{constructor(t){this.renderer=t,this.device=t.device,this.stencil=t.stencil,this.samples=t.sampleCount||1,this.slices=[],this.skin=null,this.eye=null,this.viewMatrix=null,this.extent=null,this.overlay={mode:0,range:[0,1]},this.layout=this.device.createBindGroupLayout({label:"analytic",entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:2,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:3,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:4,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:5,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:"unfilterable-float"}},{binding:6,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:7,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:8,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:9,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}}]}),this.module=this.device.createShaderModule({label:"analytic",code:ed}),this.pipelines={color:this.makePipelines(t.format,!1),pick:this.makePipelines("rg32uint",!0)},this.emptyValues=this.buffer(new Float32Array([3e38]),GPUBufferUsage.STORAGE,"analytic-values-empty"),this.valuesBuffer=this.emptyValues,this.emptyField=this.fieldTexture(1,1,new Float32Array([3e38])),this.uniformScratch=new ArrayBuffer(256),this.netsBuffer=this.buffer(new Uint32Array(1),GPUBufferUsage.STORAGE,"analytic-nets"),this.makeBarrelPipelines()}makeBarrelPipelines(){let t=GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT;this.barrelLayout=this.device.createBindGroupLayout({label:"analytic-barrels",entries:[{binding:0,visibility:t,buffer:{type:"uniform"}},{binding:1,visibility:t,buffer:{type:"uniform"}},{binding:2,visibility:t,buffer:{type:"read-only-storage"}},{binding:3,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:4,visibility:t,buffer:{type:"read-only-storage"}},{binding:5,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:6,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}}]});let a=this.device.createShaderModule({label:"analytic-barrels",code:sd}),s=this.device.createPipelineLayout({bindGroupLayouts:[this.barrelLayout]}),r=(o,c)=>this.device.createRenderPipeline({label:`analytic-barrel${c?"-pick":""}`,layout:s,vertex:{module:a,entryPoint:"vs_barrel"},fragment:{module:a,entryPoint:c?"fs_barrel_pick":"fs_barrel",targets:[{format:o}]},primitive:{topology:"triangle-list",cullMode:"back"},depthStencil:{format:this.renderer.depthFormat,depthWriteEnabled:!0,depthCompare:"greater"},multisample:{count:c?1:this.samples}});this.barrelPipelines={color:r(this.renderer.format,!1),pick:r("rg32uint",!0)},this.barrelView=this.device.createBuffer({label:"analytic-barrel-view",size:Ei,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.layerOffsets=this.device.createBuffer({label:"analytic-layer-offsets",size:256*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.viewScratch=new ArrayBuffer(Ei),this.barrels=null;let n=this.device.createShaderModule({label:"analytic-walls",code:rd}),i=o=>this.device.createRenderPipeline({label:`analytic-wall${o?"-blend":""}`,layout:s,vertex:{module:n,entryPoint:"vs_wall"},fragment:{module:n,entryPoint:"fs_wall",targets:[{format:this.renderer.format,...o?{blend:Nf}:{}}]},primitive:{topology:"triangle-list",cullMode:"none"},depthStencil:{format:this.renderer.depthFormat,depthWriteEnabled:!0,depthCompare:"greater"},multisample:{count:this.samples}});this.wallPipelines={opaque:i(!1),blend:i(!0)},this.walls=null}setWalls({data:t,count:a}){this.walls?.buffer.destroy(),this.walls=a?{buffer:this.buffer(new Uint8Array(t),GPUBufferUsage.STORAGE,"analytic-walls"),count:a,bindGroup:null}:null,this.walls&&(this.walls.bindGroup=this.wallBindGroup()),this.renderer.invalidate?.()}wallBindGroup(){return this.device.createBindGroup({layout:this.barrelLayout,entries:[{binding:0,resource:{buffer:this.renderer.globalBuffer}},{binding:1,resource:{buffer:this.barrelView}},{binding:2,resource:{buffer:this.walls.buffer}},{binding:3,resource:{buffer:this.valuesBuffer}},{binding:4,resource:{buffer:this.layerOffsets}},{binding:5,resource:{buffer:this.netsBuffer}},{binding:6,resource:{buffer:this.renderer.netMaskBuffer}}]})}encodeWalls(t,a){return this.walls?(t.setPipeline(a?this.wallPipelines.blend:this.wallPipelines.opaque),t.setBindGroup(0,this.walls.bindGroup),t.draw(6,this.walls.count),1):0}writeView(t,a,s={}){let r=new Float32Array(256);a&&r.set(a.subarray?a.subarray(0,256):a.slice(0,256)),this.device.queue.writeBuffer(this.layerOffsets,0,r);let n=new Float32Array(this.viewScratch),i=new Uint32Array(this.viewScratch);n.fill(0),this.eye=Qw(t),this.viewMatrix=t,n.set(this.eye,0),n.set(this.renderer.barrelColor||[.55,.35,.16,1],4);let o=this.laminateColor()||this.boardLooks().substrate?.color||[.3,.32,.25,1],c=(s.boardOpacity??1)*(.15+.85*(s.assemblyOpacity??1));n.set([...o.slice(0,3),c],8),i[12]=this.overlay.mode===1?1:0,i[13]=s.isolateNet?1:0,i[14]=this.boardShown(s)?1:0,i[15]=this.boardShown(s)&&(s.boardOpacity??1)>=.999&&this.renderer.innerCopperMode!=="all"?1:0,n.set(this.overlay.range,16),n.set(this.edgePlated?[...(this.renderer.barrelColor||[.55,.35,.16]).slice(0,3),c]:[...o.slice(0,3),c],20),n.set([...(this.boardLooks().soldermask?.color||[.06,.16,.11]).slice(0,3),1],24),this.device.queue.writeBuffer(this.barrelView,0,this.viewScratch)}setBarrels({data:t,count:a,skipped:s=0}){this.barrels?.buffer.destroy(),this.barrels=a?{buffer:this.buffer(new Uint8Array(t),GPUBufferUsage.STORAGE,"analytic-barrels"),count:a,skipped:s,bindGroup:null}:null,this.barrels&&(this.barrels.bindGroup=this.barrelBindGroup()),this.renderer.invalidate?.()}hasBarrels(){return!!this.barrels}barrelBindGroup(){return this.device.createBindGroup({layout:this.barrelLayout,entries:[{binding:0,resource:{buffer:this.renderer.globalBuffer}},{binding:1,resource:{buffer:this.barrelView}},{binding:2,resource:{buffer:this.barrels.buffer}},{binding:3,resource:{buffer:this.valuesBuffer}},{binding:4,resource:{buffer:this.layerOffsets}},{binding:5,resource:{buffer:this.netsBuffer}},{binding:6,resource:{buffer:this.renderer.netMaskBuffer}}]})}encodeBarrels(t,a,s,r=!1){return this.barrels?(s&&this.writeView(s,a,this.context),t.setPipeline(r?this.barrelPipelines.pick:this.barrelPipelines.color),t.setBindGroup(0,this.barrels.bindGroup),t.draw(36,this.barrels.count),1):0}buffer(t,a,s){let r=Math.max(16,Math.ceil(t.byteLength/4)*4),n=this.device.createBuffer({label:s,size:r,usage:a|GPUBufferUsage.COPY_DST});return t.byteLength&&this.device.queue.writeBuffer(n,0,t),n}fieldTexture(t,a,s){let r=this.device.createTexture({label:"analytic-field",size:[t,a],format:"r32float",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});return this.device.queue.writeTexture({texture:r},s,{bytesPerRow:t*4},[t,a]),r}makePipelines(t,a){let s=this.device.createPipelineLayout({bindGroupLayouts:[this.layout]}),r=(i,o,c,l,f=[],u=!1,g="none")=>{let b=wr[l],h={format:this.renderer.depthFormat,depthWriteEnabled:b.depth,depthCompare:b.depth||b.depthTest?"greater":"always"};return this.stencil&&Object.assign(h,{stencilFront:b.face,stencilBack:b.face,stencilReadMask:b.read,stencilWriteMask:b.write}),this.device.createRenderPipeline({label:`analytic-${i}${a?"-pick":""}`,layout:s,vertex:{module:this.module,entryPoint:o,buffers:f},fragment:{module:this.module,entryPoint:a?`${c}_pick`:c,...a?{}:{constants:{SAMPLES:this.samples}},targets:[{format:t,writeMask:b.color?GPUColorWrite.ALL:0,...u&&!a?{blend:Nf}:{}}]},primitive:{topology:"triangle-list",cullMode:g},depthStencil:h,multisample:{count:a?1:this.samples}})},n=[{arrayStride:8,attributes:[{shaderLocation:0,offset:0,format:"float32x2"}]}];return{shapeMask:r("shape-mask","vs_shape","fs_shape_mask","shapeMask"),shapeAdd:r("shape","vs_shape","fs_shape","shapeAdd"),fan:r("fan","vs_fan","fs_plain_mask","fan",n),coverSubtract:r("cover-subtract","vs_cover","fs_plain_mask","coverSubtract"),coverMark:r("cover-mark","vs_cover","fs_plain_mask","coverMark"),coverAdd:r("cover","vs_cover","fs_cover","coverAdd"),coverClear:r("cover-clear","vs_cover","fs_plain_mask","coverClear"),clear:r("clear","vs_clear","fs_plain_mask","clear"),regionWall:r("region-wall","vs_region_wall","fs_region_wall","solid"),skirt:r("skirt","vs_skirt","fs_skirt","solid"),...a?{}:{shapeLay:r("shape-lay","vs_shape","fs_shape_mask","shapeLay"),coverLay:r("cover-lay","vs_cover","fs_plain_mask","coverLay"),shapeBlend:r("shape-blend","vs_shape","fs_shape","shapeBlend",[],!0),coverBlend:r("cover-blend","vs_cover","fs_cover","coverBlend",[],!0),tintCovered:r("tint-covered","vs_clear","fs_tint_covered","tintCovered",[],!0),tintPlain:r("tint-plain","vs_clear","fs_tint_plain","tintPlain",[],!0),footShape:r("foot-shape","vs_shape","fs_shape_mask","footShape"),footCover:r("foot-cover","vs_cover","fs_plain_mask","footCover"),tintHigh:r("tint-high","vs_clear","fs_tint_covered","tintHigh",[],!0),tintLow:r("tint-low","vs_clear","fs_tint_plain","tintLow",[],!0),regionStep:r("region-step","vs_region_step","fs_region_step","coat"),step:r("step","vs_step","fs_step","coat"),clearLay:r("clear-lay","vs_clear","fs_plain_mask","clearLay"),clearFoot:r("clear-foot","vs_clear","fs_plain_mask","clearFoot"),shapeOnFoot:r("shape-on-foot","vs_shape","fs_shape","shapeOnFoot",[],!0),shapeOffFoot:r("shape-off-foot","vs_shape","fs_shape","shapeOffFoot",[],!0),coverOnFoot:r("cover-on-foot","vs_cover","fs_cover","coverOnFoot",[],!0),coverOffFoot:r("cover-off-foot","vs_cover","fs_cover","coverOffFoot",[],!0)}}}setSlices(t){this.releaseSlices();let a=new Map;this.slices=t.map(o=>this.uploadSlice(o,a)),this.makeTwins();let s=t.map(o=>o.z),r=t.flatMap(o=>[o.bounds[0],o.bounds[2]]),n=t.flatMap(o=>[o.bounds[1],o.bounds[3]]);this.extent=t.length?[[Math.min(...r)/1e3,-Math.max(...n)/1e3,Math.min(...s)],[Math.max(...r)/1e3,-Math.min(...n)/1e3,Math.max(...s)]]:null;let i=t.filter(o=>o.skin);this.skin=i.length===2?{top:Math.max(...i.map(o=>o.z)),bottom:Math.min(...i.map(o=>o.z))}:null,this.renderer.invalidate?.()}makeTwins(){this.twinBuffers?.forEach(a=>a.destroy()),this.twinBuffers=[];let t=(a,s)=>{let r={...a,...s,uniform:this.device.createBuffer({label:`analytic-twin-${a.key}`,size:256,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),field:null};return r.bindGroup=this.bindGroup(r),r};this.twins=new Map;for(let a of this.slices){if(a.zLow===void 0||a.role!=="mask"&&a.role!=="silk")continue;let s={low:t(a,{z:a.zLow})},r=a.role==="mask"&&this.slices.find(n=>n.role==="copper"&&n.mark&&n.faceDown===a.faceDown);if(r){let n=this.uploadOpenings(r,a),i=a.faceDown?r.zTop:r.zBottom;s.foot=t(r,{role:"footprint",z:a.z,dilate:Xw,mark:!1,walls:!1,zTop:Math.max(a.z,i),zBottom:Math.min(a.z,i),...n})}this.twins.set(a,s)}}uploadOpenings(t,a){let{lowered:s}=t,r=a.lowered.shapes.subarray(0,a.lowered.subtractShapes*20),n=s.shapes.length/20,i=new Uint32Array(s.shapes.length+r.length);i.set(s.shapes),i.set(r,s.shapes.length);let o=new Map,c=(y,v)=>`${Math.floor(y)},${Math.floor(v)}`,l=[];for(let y=0;y<r.length/20;y+=1){let v=Bf(r,y);l.push(v);for(let E=Math.floor(v[0]);E<=Math.floor(v[2]);E+=1)for(let S=Math.floor(v[1]);S<=Math.floor(v[3]);S+=1){let T=c(E,S);o.has(T)||o.set(T,[]),o.get(T).push(y)}}let f=[],u=[],g=y=>{let v=new Set;for(let E=Math.floor(y[0]);E<=Math.floor(y[2]);E+=1)for(let S=Math.floor(y[1]);S<=Math.floor(y[3]);S+=1)for(let T of o.get(c(E,S))||[]){let A=l[T];A[0]<=y[2]&&y[0]<=A[2]&&A[1]<=y[3]&&y[1]<=A[3]&&v.add(T)}u.push(f.length,v.size);for(let E of v)f.push(n+E)},b=y=>[y[0]-.05,y[1]-.05,y[2]+.05,y[3]+.05];for(let y=s.subtractShapes;y<n;y+=1)g(b(Bf(s.shapes,y)));let h=n-s.subtractShapes,d=s.contourEdges||new Float32Array(0);for(let y=0;y+3<d.length;y+=4)g(b([Math.min(d[y],d[y+2]),Math.min(d[y+1],d[y+3]),Math.max(d[y],d[y+2]),Math.max(d[y+1],d[y+3])]));let x={shapeCuts:new Uint32Array(u.slice(0,h*2)),edgeCuts:new Uint32Array(u.slice(h*2)),cutIndices:new Uint32Array(f)},p=this.uploadEdges({...s,...x},`${t.key}-step`),m=this.buffer(i,GPUBufferUsage.STORAGE,`analytic-step-shapes-${t.key}`);return this.twinBuffers.push(m,p.edges,p.cuts),{...p,shapes:m}}uploadSlice(t,a=new Map){let{lowered:s}=t,r=GPUBufferUsage.STORAGE;a.has(s)||a.set(s,{shapes:this.buffer(s.shapes,r,`analytic-shapes-${t.key}`),covers:this.buffer(s.covers,r,`analytic-covers-${t.key}`),fans:s.fanVertices.length?this.buffer(s.fanVertices,GPUBufferUsage.VERTEX,`analytic-fans-${t.key}`):null,...this.uploadEdges(s,t.key)});let n={...t,...a.get(s),uniform:this.device.createBuffer({label:`analytic-slice-${t.key}`,size:256,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),shapeCount:s.shapes.length/20,subtractShapes:s.subtractShapes,batches:[],field:null};for(let i=0;i<s.batches.length;i+=5){let[o,c,l,f,u]=s.batches.subarray(i,i+5);n.batches.push({subtract:o===1,firstVertex:c,vertexCount:l,firstCover:f,coverCount:u})}return n.bindGroup=this.bindGroup(n),n}uploadEdges(t,a){let s=t.contourEdges||new Float32Array(0),r=t.contourEdgeOperations||new Uint32Array(0),n=t.shapeCuts||new Uint32Array(0),i=t.edgeCuts||new Uint32Array(0),o=t.cutIndices||new Uint32Array(0),c=n.length,l=new Uint32Array(Math.max(1,c+o.length));for(let m=0;m<c;m+=2)l.set([n[m]+c,n[m+1]],m);l.set(o,c);let f=t.outlineEdges||new Float32Array(0),u=t.outlineShapes||new Uint32Array(0),g=Math.min(s.length/4,r.length),b=new Uint32Array(Math.max(1,g+u.length)*7),h=new Uint32Array(s.buffer,s.byteOffset,s.length),d=0;for(let m=0;m<g;m+=1){if(r[m]&2147483648)continue;let y=d*7;b.set(h.subarray(m*4,m*4+4),y),b[y+4]=r[m],b[y+5]=(i[m*2]??0)+c,b[y+6]=i[m*2+1]??0,d+=1}let x=d,p=new Uint32Array(f.buffer,f.byteOffset,f.length);for(let m=0;m<u.length;m+=1){let y=d*7;b.set(p.subarray(m*4,m*4+4),y),b[y+4]=(1073741824|u[m])>>>0,d+=1}return{edges:this.buffer(b,GPUBufferUsage.STORAGE,`analytic-edges-${a}`),regionEdges:x,skirtEdges:d-x,cuts:this.buffer(l,GPUBufferUsage.STORAGE,`analytic-cuts-${a}`)}}bindGroup(t){return this.device.createBindGroup({layout:this.layout,entries:[{binding:0,resource:{buffer:this.renderer.globalBuffer}},{binding:1,resource:{buffer:t.uniform}},{binding:2,resource:{buffer:t.shapes}},{binding:3,resource:{buffer:t.covers}},{binding:4,resource:{buffer:this.valuesBuffer}},{binding:5,resource:(t.field?.texture||this.emptyField).createView()},{binding:6,resource:{buffer:this.netsBuffer}},{binding:7,resource:{buffer:this.renderer.netMaskBuffer}},{binding:8,resource:{buffer:t.edges}},{binding:9,resource:{buffer:t.cuts}}]})}coversLayer(t){return this.slices.some(a=>a.role!==void 0?a.role==="copper"&&a.layerId===Number(t):a.layerId===Number(t))}coversRole(t){let a={substrate:"dielectric",soldermask:"mask",silkscreen:"silk",paste:"paste"}[t];return!!a&&this.slices.some(s=>s.role===a)}setOperationValues(t,a){this.clearOverlay(),this.valuesBuffer=this.buffer(Cf(t),GPUBufferUsage.STORAGE,"analytic-values"),this.overlay={mode:1,range:a},this.rebind()}setFieldRasters(t,a){this.clearOverlay();for(let s of this.slices){let r=t.get(s.key);r&&(s.field={...r,texture:this.fieldTexture(r.width,r.height,Cf(r.values))})}this.overlay={mode:2,range:a},this.rebind()}clearOverlay(){this.valuesBuffer!==this.emptyValues&&this.valuesBuffer.destroy(),this.valuesBuffer=this.emptyValues;for(let t of this.slices)t.field?.texture.destroy(),t.field=null;this.overlay={mode:0,range:[0,1]},this.rebind()}setOperationNets(t){this.netsBuffer.destroy(),this.netsBuffer=this.buffer(t.length?t:new Uint32Array(1),GPUBufferUsage.STORAGE,"analytic-nets"),this.rebind()}rebind(){this.boundNetMask=this.renderer.netMaskBuffer;for(let t of this.slices)t.bindGroup=this.bindGroup(t);for(let t of this.twins?.values()||[])for(let a of Object.values(t))a.bindGroup=this.bindGroup(a);this.barrels&&(this.barrels.bindGroup=this.barrelBindGroup()),this.walls&&(this.walls.bindGroup=this.wallBindGroup()),this.renderer.invalidate?.()}writeSlice(t,a,s=null){let r=new Float32Array(this.uniformScratch),n=new Uint32Array(this.uniformScratch);r.fill(0),r.set(s?.color||t.color,0);let[i,o]=t.offsetLayers||[t.layerId,t.layerId];r[4]=t.z+.5*((a?.[i]||0)+(a?.[o]||0));let c=t.role===void 0||t.role==="copper";n[5]=c?this.overlay.mode:0;let f=(this.context||{}).isolateNet||!t.outer&&this.renderer.innerCopperMode==="lit";n[7]=c?2|(f?1:0):0;let u=c?t.field:null;if(n[6]=u?1:0,u&&(r.set(u.originMm,8),r[10]=u.pitchMm,n[12]=u.width,n[13]=u.height),r.set(this.overlay.range,16),r.set(t.bounds,20),r.set([s?.metallic??0,s?.roughness??.72,t.faceDown??t.bottom?-1:1,c?1:0],24),t.zTop!==void 0){let g=r[4]-t.z;r.set([t.zBottom+g,t.zTop+g],28)}n[30]=t.subtractShapes||0,r[31]=t.dilate||0,this.eye&&r.set(this.eye,32),this.device.queue.writeBuffer(t.uniform,0,this.uniformScratch)}copperLooks(){let t=new Map;for(let a of this.renderer.entries||[]){let s=Number(a.layerId);if(a.kind!=="copper"||t.has(s))continue;let r=a.color||a.material?.baseColor;t.set(s,{color:r&&r.length<4?[...r,1]:r,metallic:a.material?.metallic||0,roughness:a.material?.roughness??.72})}return t}boardLooks(){let t={};for(let a of this.renderer.entries||[]){if(a.kind!=="board"||t[a.boardRole])continue;let s=a.color||a.material?.baseColor;t[a.boardRole]={color:s&&s.length<4?[...s,1]:s,metallic:a.material?.metallic||0,roughness:a.material?.roughness??.72}}return t}laminateColor(){return this.slices.find(t=>t.role==="dielectric"&&t.color)?.color||null}lookFor(t,a,s,r){if(t.role===void 0||t.role==="copper")return a.get(t.layerId);let n=r.boardOpacity??1,i=(c,l)=>{let f=s[c];if(!f)return null;let u=f.color||[1,1,1,1];return{...f,color:[u[0],u[1],u[2],l(Number.isFinite(u[3])?u[3]:1)]}};if(t.role==="dielectric"){let c=n*(.15+.85*(r.assemblyOpacity??1));return t.color?{...s.substrate||{metallic:0,roughness:.72},color:[...t.color.slice(0,3),c]}:i("substrate",()=>c)}let o=r.assemblyOpacity??1;return t.role==="mask"?i("soldermask",c=>Math.min(c,.72)*n*o):t.role==="silk"?i("silkscreen",c=>Math.min(c,.92)*n*o):i("paste",c=>c)}encodeInto(t,a,s,r=!1,n={}){this.context=n,this.renderer.netMaskBuffer!==this.boundNetMask&&this.rebind(),n.matrix&&this.writeView(n.matrix,a,n);let i=r?this.pipelines.pick:this.pipelines.color,o=this.copperLooks(),c=this.boardLooks(),f=this.boardShown(n)&&(n.boardOpacity??1)>=.999,u=0;for(let g of this.slices){let b=g.role===void 0||g.role==="copper";(b?s&&!s.has(g.layerId):r||g.role!=="dielectric"||!f)||b&&!g.outer&&g.role!==void 0&&this.renderer.innerCopperMode==="none"||g.role==="dielectric"&&!g.skin&&this.renderer.innerCopperMode!=="all"||this.behindBoard(g,n)||(this.encodeSlice(t,i,g,"opaque",a,this.lookFor(g,o,c,n)),u+=1)}return f&&!r&&(u+=this.encodeWalls(t,!1)),this.stencil&&t.setStencilReference(1),u}boardShown(t){return(t.showBoard??!0)&&!t.panelLayer}behindBoard(t,a){if(!this.skin||!this.eye||this.renderer.innerCopperMode==="all"||!this.boardShown(a)||(a.boardOpacity??1)<.999)return!1;let[,,s,r]=this.eye,n=r?s>this.skin.top:s<0,i=r?s<this.skin.bottom:s>0;return t.faceDown?n:i}encodeBlended(t,a,s,r={}){if(!this.stencil)return 0;this.context=r;let n=this.copperLooks(),i=this.boardLooks(),o=this.boardShown(r),c=o&&(r.boardOpacity??1)<.999,l=0,f=(h,d)=>{this.behindBoard(h,r)||(this.encodeSlice(t,this.pipelines.color,h,d,a,this.lookFor(h,n,i,r)),l+=1)};for(let h of this.slices)c&&h.role==="dielectric"&&f(h,"blend");c&&(l+=this.encodeWalls(t,!0));let u=o&&(r.assemblyOpacity??1)>.01,g=h=>!Yw(r.hiddenBoardLayers,h),b=new Set;for(let h of this.slices){if(h.role!=="mask"||!u||!g(h)||this.behindBoard(h,r))continue;let d=this.twins.get(h);if(!d?.foot){f(h,"mask");continue}let x=this.slices.filter(p=>p.role==="silk"&&p.faceDown===h.faceDown&&g(p)&&!this.behindBoard(p,r));for(let p of x)b.add(p);l+=this.encodeConformal(t,h,d,x,a,p=>this.lookFor(p,n,i,r))}for(let h of this.slices)h.role==="paste"&&g(h)&&!r.hidePaste&&!r.panelLayer&&(!s||s.has(h.offsetLayers?.[0]))&&f(h,"blend");for(let h of this.slices)h.role==="silk"&&u&&g(h)&&!b.has(h)&&f(h,"blend");return t.setStencilReference(1),l}encodeSlice(t,a,s,r,n,i){this.writeSlice(s,n,i),t.setBindGroup(0,s.bindGroup),this.stencil?this.encodeStencilled(t,a,s,r):this.encodeAddsOnly(t,a,s),r==="opaque"&&s.walls&&this.encodeSlabWalls(t,a,s)}wallPixels(t){let a=this.viewMatrix,s=this.renderer.canvas;if(!a||!this.extent||!s)return 1/0;let[r,n]=this.extent,i=[];for(let l of[r[0],n[0]])for(let f of[r[1],n[1]])for(let u of[r[2],n[2]])i.push([l,f,u]);this.eye?.[3]&&i.push(this.eye.slice(0,3).map((l,f)=>Math.min(n[f],Math.max(r[f],l/this.eye[3]))));let o=([l,f,u])=>{let g=[0,1,2,3].map(b=>a[b]*l+a[4+b]*f+a[8+b]*u+a[12+b]);return g[3]>1e-9?[g[0]/g[3],g[1]/g[3]]:null},c=0;for(let l of i){let f=o(l),u=o([l[0],l[1],l[2]+t]);if(!f||!u)return 1/0;c=Math.max(c,Math.hypot((u[0]-f[0])*s.width/2,(u[1]-f[1])*s.height/2))}return c}encodeSlabWalls(t,a,s){this.stencil&&t.setStencilReference(0),s.regionEdges&&(t.setPipeline(a.regionWall),t.draw(6,s.regionEdges,0,0)),s.skirtEdges&&this.wallPixels(s.zTop-s.zBottom)>=Ff&&(t.setPipeline(a.skirt),t.draw(12,s.skirtEdges,0,s.regionEdges))}encodeAddsOnly(t,a,s){let r=s.shapeCount-s.subtractShapes;r&&(t.setPipeline(a.shapeAdd),t.draw(6,r,0,s.subtractShapes))}encodeStencilled(t,a,s,r="opaque"){let n=(i,o=wr[i].reference)=>{t.setPipeline(a[i]),t.setStencilReference(o)};this.encodeFill(t,s,n,r),r==="mask"&&(n("tintCovered"),t.draw(6),n("tintPlain"),t.draw(6)),n("clear"),t.draw(6)}encodeFill(t,a,s,r){let n=r==="footprint";a.subtractShapes&&!n&&(s("shapeMask"),t.draw(6,a.subtractShapes,0,0)),n||this.encodeBatches(t,a,!0,s,r);let i=a.shapeCount-a.subtractShapes;i&&(r==="opaque"?s("shapeAdd",a.mark?33:32):s({mask:"shapeLay",blend:"shapeBlend",footprint:"footShape",onFoot:"shapeOnFoot",offFoot:"shapeOffFoot"}[r]),t.draw(6,i,0,a.subtractShapes)),this.encodeBatches(t,a,!1,s,r)}encodeConformal(t,a,{low:s,foot:r},n,i,o){let c=this.pipelines.color,l=b=>wr[b==="step"||b==="regionStep"?"coat":b],f=(b,h=l(b).reference)=>{t.setPipeline(c[b]),t.setStencilReference(h)},u=(b,h)=>{this.writeSlice(b,i,h),t.setBindGroup(0,b.bindGroup)},g=o(a);u(r,g),this.encodeFill(t,r,f,"footprint"),u(a,g),this.encodeFill(t,a,f,"mask"),f("tintHigh"),t.draw(6),t.setBindGroup(0,r.bindGroup),r.regionEdges&&(f("regionStep"),t.draw(6,r.regionEdges,0,0)),r.skirtEdges&&this.wallPixels(r.zTop-r.zBottom)>=Ff&&(f("step"),t.draw(12,r.skirtEdges,0,r.regionEdges)),t.setBindGroup(0,a.bindGroup),f("clearLay"),t.draw(6),u(s,g),this.encodeFill(t,s,f,"mask"),f("tintLow"),t.draw(6),f("clearLay"),t.draw(6);for(let b of n){let h=o(b);u(b,h),this.encodeFill(t,b,f,"onFoot"),f("clear"),t.draw(6);let d=this.twins.get(b)?.low;d&&(u(d,h),this.encodeFill(t,d,f,"offFoot"),f("clear"),t.draw(6))}return t.setBindGroup(0,a.bindGroup),f("clearFoot"),t.draw(6),t.setStencilReference(1),1+n.length}encodeBatches(t,a,s,r,n="opaque"){let i=a.batches.findLast(o=>!o.subtract);for(let o of a.batches){if(o.subtract!==s||!a.fans)continue;r("fan"),t.setVertexBuffer(0,a.fans),t.draw(o.vertexCount,1,o.firstVertex,0),!s&&n==="opaque"&&(a.mark||a.role==="dielectric")&&(r("coverMark",a.mark?65:64),t.draw(6,o.coverCount,0,o.firstCover));let c={opaque:"coverAdd",blend:"coverBlend",mask:"coverLay",footprint:"footCover",onFoot:"coverOnFoot",offFoot:"coverOffFoot"}[n];r(s?"coverSubtract":c),t.draw(6,o.coverCount,0,o.firstCover),!s&&(o!==i||n==="footprint")&&(r("coverClear"),t.draw(6,o.coverCount,0,o.firstCover))}}gpuMemoryBytes(){let t=this.valuesBuffer===this.emptyValues?0:this.valuesBuffer.size;this.barrels&&(t+=this.barrels.count*td),this.walls&&(t+=this.walls.count*ad);let a=new Set;for(let s of this.slices){for(let r of[s.shapes,s.covers,s.fans,s.uniform,s.edges,s.cuts])r&&a.add(r);s.field&&(t+=s.field.width*s.field.height*4)}for(let s of a)t+=s.size;return t}stats(){return{slices:this.slices.map(t=>({key:t.key,role:t.role||"copper",face:t.face,layerId:t.layerId,z:t.z,shapes:t.shapeCount,subtractShapes:t.subtractShapes,regionBatches:t.batches.length,fanVertices:t.lowered.fanVertices.length/2,covers:t.lowered.covers.length/6,approximations:t.lowered.stats})),overlay:this.overlay.mode,barrels:this.barrels?{count:this.barrels.count,skipped:this.barrels.skipped}:null,walls:this.walls?.count||0,gpuMemoryBytes:this.gpuMemoryBytes(),degraded:!this.stencil}}releaseSlices(){for(let a of this.twins?.values()||[])for(let s of Object.values(a))s.uniform.destroy();this.twinBuffers?.forEach(a=>a.destroy()),this.twinBuffers=[],this.twins=new Map;let t=new Set;for(let a of this.slices){for(let s of[a.shapes,a.covers,a.fans,a.uniform,a.edges,a.cuts])s&&t.add(s);a.field?.texture.destroy()}for(let a of t)a.destroy();this.slices=[]}destroy(){this.releaseSlices(),this.barrels?.buffer.destroy(),this.walls?.buffer.destroy(),this.netsBuffer.destroy(),this.barrelView.destroy(),this.layerOffsets.destroy(),this.valuesBuffer!==this.emptyValues&&this.valuesBuffer.destroy(),this.emptyValues.destroy(),this.emptyField.destroy()}};function Qw(e){let t=Zw(Array.from(e,Number));if(!t)return[0,0,-1,0];let a=l=>[0,1,2,3].map(f=>t[f]*l[0]+t[4+f]*l[1]+t[8+f]*l[2]+t[12+f]*l[3]),s=a([0,0,1,0]),r=Math.hypot(s[0],s[1],s[2]);if(Math.abs(s[3])>1e-9*Math.max(r,1e-30))return[s[0]/s[3],s[1]/s[3],s[2]/s[3],1];let n=a([0,0,1,1]),i=a([0,0,0,1]),o=[0,1,2].map(l=>i[l]/i[3]-n[l]/n[3]),c=Math.hypot(...o)||1;return[...o.map(l=>l/c),0]}function Zw(e){let t=new Array(16);t[0]=e[5]*e[10]*e[15]-e[5]*e[11]*e[14]-e[9]*e[6]*e[15]+e[9]*e[7]*e[14]+e[13]*e[6]*e[11]-e[13]*e[7]*e[10],t[4]=-e[4]*e[10]*e[15]+e[4]*e[11]*e[14]+e[8]*e[6]*e[15]-e[8]*e[7]*e[14]-e[12]*e[6]*e[11]+e[12]*e[7]*e[10],t[8]=e[4]*e[9]*e[15]-e[4]*e[11]*e[13]-e[8]*e[5]*e[15]+e[8]*e[7]*e[13]+e[12]*e[5]*e[11]-e[12]*e[7]*e[9],t[12]=-e[4]*e[9]*e[14]+e[4]*e[10]*e[13]+e[8]*e[5]*e[14]-e[8]*e[6]*e[13]-e[12]*e[5]*e[10]+e[12]*e[6]*e[9],t[1]=-e[1]*e[10]*e[15]+e[1]*e[11]*e[14]+e[9]*e[2]*e[15]-e[9]*e[3]*e[14]-e[13]*e[2]*e[11]+e[13]*e[3]*e[10],t[5]=e[0]*e[10]*e[15]-e[0]*e[11]*e[14]-e[8]*e[2]*e[15]+e[8]*e[3]*e[14]+e[12]*e[2]*e[11]-e[12]*e[3]*e[10],t[9]=-e[0]*e[9]*e[15]+e[0]*e[11]*e[13]+e[8]*e[1]*e[15]-e[8]*e[3]*e[13]-e[12]*e[1]*e[11]+e[12]*e[3]*e[9],t[13]=e[0]*e[9]*e[14]-e[0]*e[10]*e[13]-e[8]*e[1]*e[14]+e[8]*e[2]*e[13]+e[12]*e[1]*e[10]-e[12]*e[2]*e[9],t[2]=e[1]*e[6]*e[15]-e[1]*e[7]*e[14]-e[5]*e[2]*e[15]+e[5]*e[3]*e[14]+e[13]*e[2]*e[7]-e[13]*e[3]*e[6],t[6]=-e[0]*e[6]*e[15]+e[0]*e[7]*e[14]+e[4]*e[2]*e[15]-e[4]*e[3]*e[14]-e[12]*e[2]*e[7]+e[12]*e[3]*e[6],t[10]=e[0]*e[5]*e[15]-e[0]*e[7]*e[13]-e[4]*e[1]*e[15]+e[4]*e[3]*e[13]+e[12]*e[1]*e[7]-e[12]*e[3]*e[5],t[14]=-e[0]*e[5]*e[14]+e[0]*e[6]*e[13]+e[4]*e[1]*e[14]-e[4]*e[2]*e[13]-e[12]*e[1]*e[6]+e[12]*e[2]*e[5],t[3]=-e[1]*e[6]*e[11]+e[1]*e[7]*e[10]+e[5]*e[2]*e[11]-e[5]*e[3]*e[10]-e[9]*e[2]*e[7]+e[9]*e[3]*e[6],t[7]=e[0]*e[6]*e[11]-e[0]*e[7]*e[10]-e[4]*e[2]*e[11]+e[4]*e[3]*e[10]+e[8]*e[2]*e[7]-e[8]*e[3]*e[6],t[11]=-e[0]*e[5]*e[11]+e[0]*e[7]*e[9]+e[4]*e[1]*e[11]-e[4]*e[3]*e[9]-e[8]*e[1]*e[7]+e[8]*e[3]*e[5],t[15]=e[0]*e[5]*e[10]-e[0]*e[6]*e[9]-e[4]*e[1]*e[10]+e[4]*e[2]*e[9]+e[8]*e[1]*e[6]-e[8]*e[2]*e[5];let a=e[0]*t[0]+e[1]*t[4]+e[2]*t[8]+e[3]*t[12];return a?t.map(s=>s/a):null}function ev(e,t){let a=new Map((t||[]).map(s=>[Number(s.id),s]));for(let s of e||[]){let r=a.get(Number(s.layerId));if(s.kind!=="copper"||!r||!s.quantMin||!s.quantSize)continue;let n=s.quantSize[2]===1;return s.quantMin[2]+(n?0:s.quantSize[2]/2)-Number(r.z_mm||0)/1e3}return 0}async function Of({renderer:e,layers:t,colorFor:a,bytes:s,wasm:r,toleranceNm:n,nets:i=[],features:o=[]}){let c=await xf(s,{wasm:r}),l=ev(e.entries,t),{planned:f,unmatched:u}=Mf(c.header,t,l),g=new Map(t.map(E=>[Number(E.id),E])),b=performance.now(),h=new Map;for(let E of f)h.has(E.key)||h.set(E.key,c.lowerSlice(E.key,n));let d=f.map(E=>({...E,color:E.role==="copper"?a(g.get(E.layerId)):E.color||[1,1,1,1],lowered:h.get(E.key)})),x=performance.now()-b,p=new an(e);p.setSlices(d);let m=d.find(E=>E.role==="dielectric"&&E.lowered?.contourEdges?.length)?.lowered.contourEdges;p.setBarrels(Sf(c.header,c.barrels(),d,m)),p.edgePlated=!!c.header.stack?.edge_plating,p.setWalls(Tf(d,h,t,l));let y=If(c,i);p.setOperationNets(y),e.setAnalytic(p);let v=new Map;for(let E of o||[])E?.sourceUid&&(v.has(E.sourceUid)||v.set(E.sourceUid,[]),v.get(E.sourceUid).push(E));return{pack:c,analytic:p,unmatched:u,lowerMs:x,zOffset:l,operations:oo(c.header),overlay:null,netIds:y,featuresBySource:v}}function fo(e,t){let a=e.pack.binding(t)?.source_uid,s=a?e.featuresBySource?.get(a)||[]:[],r=e.netIds?.[t]||0,n=s.find(i=>Number(i.netId)===r)||s[0];return n?Number(n.id):0}function Pf(e,t){if(!t)return e.analytic.clearOverlay(),e.overlay=null,null;if(t.kind==="operation_values"){let a=kf(t.values,e.operations),s=t.range||tn(a);e.analytic.setOperationValues(a,s),e.overlay={...t,values:a,range:s}}else if(t.kind==="field_tiles"){let a=Ef(t.tiles),s=t.range||tn([...a.values()].flatMap(r=>[...tn(r.values)]));e.analytic.setFieldRasters(a,s),e.overlay={...t,range:s,slices:[...a.keys()]}}else throw new TypeError(`unknown analytic overlay kind ${t.kind}`);return{kind:t.kind,range:e.overlay.range}}function jf(e,t){let a=e.overlay,s=a?.kind==="operation_values"?a.values[t]:void 0;return{operationIndex:t,featureId:fo(e,t)||null,binding:e.pack.binding(t),...Number.isFinite(s)?{value:s,quantity:a.quantity,units:a.units}:{}}}var Lf=512*1024*1024,tv=.65,av=1.5,sv=15e3,rv=120,nv=12,iv=48,Zf=230,Ao=document,Et,j,Fe,un,fn,hn,Fa,Sn,bt,rn,Ts,ft,rt,we,De,nn,bn,Is,Be,te,Tn,In,Le,Na,ua,$e,kt,pn,Ca,Y=e=>Ao.querySelector(e),da=e=>Ao.querySelectorAll(e);function eh(e=document){Ao=e,Et=Y("#app"),j=Y("#viewport"),Fe=Y("#schematic-viewport"),un=Y("#schematic-dom-layer"),fn=Y("#schematic-flow-overlay"),hn=Y("#bom-view"),Fa=Y("#status")||{set textContent(t){}},Sn=Y("#viewer-kind")||{set textContent(t){}},bt=Y("#selection")||{set textContent(t){}},rn=Y("#diagnostics")||{set innerHTML(t){}},Ts=Y("#scene-stats"),ft=Y("#lod-tuning"),rt=Y("#layers"),we=Y("#search-controls"),De=Y("#view-controls"),Le=Y("#stackup-workspace-view"),nn=Y("#fallback"),bn=Y("#panel-labels"),Is=Y("#schematic-labels"),Be=Y("#axis-gizmo"),te=Y("#selection-card"),Tn=Y("#primary-heading"),In=Y("#primary-description"),Na=Y("#mode-switch"),ua=Y("#system-labels"),$e=Y("#move-gizmo"),kt=Y("#system-help"),pn=Y("#system-harnesses"),Ca=Y("#harness-nodes"),Ca?.addEventListener("pointermove",t=>Wh(t)),Ca?.addEventListener("pointerup",t=>Xh(t)),Et.classList.add("workspace-pcb")}var ov=["soldermask","silkscreen","paste"],cv=Object.freeze([{role:"soldermask",side:"front",name:"F.Mask"},{role:"soldermask",side:"back",name:"B.Mask"},{role:"silkscreen",side:"front",name:"F.SilkS"},{role:"silkscreen",side:"back",name:"B.SilkS"},{role:"paste",side:"front",name:"F.Paste"},{role:"paste",side:"back",name:"B.Paste"}]),lv={soldermask:"#1f6b45",silkscreen:"#f2f2f2",paste:"#a0a3a8"};function th(){return{workspace:"pcb",mode:"3d",activeNetId:0,selectedFeatureId:0,selectedOccurrence:0,selectionAnchor:null,showBoard:!0,showComponents:!0,showPlaceholders:!0,realisticColors:!0,hiddenBoardLayers:[],isolateNet:!1,savedShowBoard:!0,savedShowComponents:!0,preIsolationShowBoard:null,separation:0,dragging:!1,dragMode:"orbit",lastX:0,lastY:0,pointerStartX:0,pointerStartY:0,frameCpuMs:0,frameCpuP95Ms:0,frameIntervalMs:0,frameIntervalP95Ms:0,frameSamples:[],fps:0,frames:0,fpsAt:performance.now(),activeTab:"layers",selectedPageId:"",selectedSchematicFeature:null,schematicDragging:!1,schematicLastX:0,schematicLastY:0,schematicStartX:0,schematicStartY:0}}function Cs(e={}){return{key:e.key??"board",topology:e.topology||window.__TOPOLOGY__||{},semanticGeometry:e.semanticGeometry||window.__SEMANTIC_GEOMETRY__||{},viewerReadiness:e.readiness||{stage:"semantic-ready",progress:100},assetCache:e.assetCache||null,deferComponents:!!e.deferComponents,scene:dv(),renderer:null,compareLayers:new Set,desiredCompareLayers:new Set,visible3dLayers:new Set,preIsolation3dLayers:null,preIsolationCompareLayers:null,highlightedNetIds:new Set,hiddenComponents:new Set,hiddenComponentRequest:null,loadedBytes:0,triangles:0,residentTileBytes:0,residentTileGpuBytes:0,residentTileTriangles:0,tileLoads:0,tileEvictions:0,tileSchedulerMs:0,lastTileScheduleAt:0,visibleTileIds:new Set,gpuBytes:0}}function dv(){return{manifest:null,manifestUrl:"",layers:[],copperLayers:[],nets:[],features:new Map,tiles:new Map,loaded:new Set,loading:new Map,failed:new Map,residentTiles:new Map,componentFeatures:new Map,componentModelCounts:new Map,componentTier:"idle",componentEntries:[],componentsWantedAt:0,componentEvictions:0,runtimeBounds:null,layerZOffsets:new Float32Array(256),layerZOffsetSignature:""}}function ah(){return{key:"",started:0,from:new Map,current:new Map}}function sh(){return{phase:"idle",previous:new Set,target:new Set,previousOffsets:new Map,started:0}}function rh(){return{manifest:null,manifestUrl:"",pages:[],byId:new Map,activeNetUid:"",visiblePages:[],fitted:!1,rendererMode:new URLSearchParams(location.search).get("schematicRenderer")||"svg-dom",domFallbackReason:""}}var M=th(),k=Cs(),w=null,Ae=ah(),W=sh(),D=rh(),gn=[],uv=5e3,fv=5e3,N,Z,nt,U,Q,fa=new Map,Zt=performance.now(),ve=0,on=0,Bs=null,mn=null,yn=null,ho=!1,Ge=!1,An=()=>!0,As=!0;!window.__PRISM_SEMANTIC_VIEWER_MANUAL_BOOT__&&document.getElementById("app")&&Ro().catch(e=>{console.error(e),Fa&&(Fa.textContent="Renderer failed"),nn&&(nn.hidden=!1,nn.textContent=e.stack||e.message||String(e))});function nh(e){let t=new Map((e.components||[]).map(s=>[s.uid,s])),a={};for(let s of e.terminals||[]){let r=s.net_uid;if(!r)continue;let n=t.get(s.component_uid)||{},i={designator:s.designator||n.designator||"",pin:s.pin||"",value:n.value||"",pcb_pad_id:s.pcb_pad_id||"",pcb_pad_source_uid:s.pcb_pad_source_uid||""};a[r]||(a[r]={terminals:[]});let o=a[r].terminals;o.some(c=>c.designator===i.designator&&c.pin===i.pin)||o.push(i)}return a}function hv(e,t=k){if(!e||!t.scene?.features)return 0;let a=e.pcb_pad_source_uid||"";if(!a&&e.pcb_pad_id&&(a=(t.topology?.physical_objects||[]).find(r=>r.uid===e.pcb_pad_id)?.source_ids?.[0]||""),!a)return 0;for(let[s,r]of t.scene.features.entries())if(r.sourceUid===a&&r.kind==="pad")return s;return 0}function _o(e,t=k){return!e||!t.topology||!t.topology.components?null:t.topology.components.find(a=>a.designator===e)}function sn(e,t){for(let a of Object.keys(e))delete e[a];Object.assign(e,t)}function ih(){if(on&&(cancelAnimationFrame(on),on=0),window.removeEventListener("keydown",Sb),w){for(let e of w.boards.values())e.abort?.abort();w.scene.dispose(),w=null}else go(),k.renderer?.dispose?.();k.renderer=null,N=null,Z?.dispose?.(),Z=null,nt=null,Bs=null,An=()=>!0,As=!0}function oh(){return ve+=1,ih(),sn(M,th()),k=Cs(),sn(Ae,ah()),sn(W,sh()),sn(D,rh()),gn=[],U=null,Q=null,fa=new Map,Zt=performance.now(),ve}function ch(e){e===ve&&(ve+=1,ih())}function _s(e){e===ve&&(on=requestAnimationFrame(t=>N1(t,e)))}function he(e){return e===ve}async function Ro(e={}){let t=oh(),a={};if(k.topology=e.topology||window.__TOPOLOGY__||{},k.topology&&!k.topology.net_details&&(k.topology.net_details=nh(k.topology)),k.semanticGeometry=e.semanticGeometry||window.__SEMANTIC_GEOMETRY__||{},k.viewerReadiness=e.readiness||k.semanticGeometry.readiness||{stage:"semantic-ready",progress:100},Bs=typeof e.onSelectionChange=="function"?e.onSelectionChange:null,yn=typeof e.onContextMenu=="function"?e.onContextMenu:null,mn=typeof e.onViewStateChange=="function"?e.onViewStateChange:null,An=typeof e.isActive=="function"?e.isActive:()=>!0,As=e.workspaceScope!=="3d",k.assetCache=e.assetCache||null,M.gpuBudgetBytes=Jr,eh(e.root||document),!Et||!j)throw new Error("Semantic viewer shell is missing required DOM nodes");return await gv(t,a,e.onPerformanceEvent),{performance:a,...lh(),selectOccurrence:pv,setHighlightedNetIds(s){k.highlightedNetIds=s,k.renderer?.setEmphasizedNetIds(s)},refreshResidency(){Me(performance.now(),{force:!0})},resize(){k.renderer?.resize(),N?.resize(),M.workspace==="pcb"&&M.mode==="layer"&&qo()},setWorkspace(s){let r=s==="stackup"?"stackup":"pcb";M.workspace!==r&&wb(r)},setHiddenComponents:yb,getComponentReferences(){return[...k.scene.componentFeatures.keys()]},async loadAnalyticPack(s,r={}){return k.renderer?(go(),k.analytic=await Of({renderer:k.renderer,layers:k.scene.layers,colorFor:n=>{let i=Ho(n,k);return i.length>=4?i.slice(0,4):[...i,1]},bytes:s,wasm:r.wasm,toleranceNm:r.toleranceNm,nets:k.scene.manifest?.nets,features:k.scene.manifest?.objectFeatures}),Df()):null},setAnalyticOverlay(s){return k.analytic?Pf(k.analytic,s):null},async analyticAt(s,r){if(!k.analytic)return null;let n=await kb(s,r);return n?.kind==="analytic"?jf(k.analytic,n.operationIndex):null},analyticStats:Df,unloadAnalyticPack(){go()},setLodOverride(s){k.renderer?.setLodOverride(s)},projectComponent(s){return Eb(k,s,r=>So(r,Yt))},projectPoint(s){return So(s,Yt)},setViewMode:db,renderInset:B1,insetReady:sb,releaseInset(s){Ns.release(s)},insetBoard:()=>({scene:k.scene,topology:k.topology}),onSceneChange(s){return Mn.add(s),()=>Mn.delete(s)},insetStats(){return{...cn,views:Ns.size,targets:[se.width,se.height]}},insetSettings(s){return Object.assign(Eo,s||{}),{...Eo}},gpuIdle(){return k.renderer?.device.queue.onSubmittedWorkDone()??Promise.resolve()},dispose(){bv(),ch(t)}}}function Df(){let e=k.analytic;return e?{operations:e.operations,lowerMs:e.lowerMs,zOffset:e.zOffset,unmatched:e.unmatched,...e.analytic.stats()}:null}function go(){k.renderer?.setAnalytic(null),k.analytic?.pack.free(),k.analytic=null}function lh(){return{nets:()=>k.scene.nets,quietly(e){Ge=!0;try{e()}finally{Ge=!1}},selectNet:Yo,selectFeature:ma,selectComponent:Jo,clearSelection:Oe,anyEmphasis:Ua,showNetProbe:Co,restoreVisibility:bh,isolating:()=>M.isolateNet,isolateLitNets:La,setNetIsolation:Ga,setGpuBudget(e){M.gpuBudgetBytes=e;for(let t of w?w.boards.values():[k])t.tiersCheckedAt=0},setStatsOverlay:Ih,stats:Th,pickAt(e,t){return kb(e,t)},getViewState:dh,setLayerVisible:ub,applyLayerPreset:fb,setShowBoard:hb,setShowComponents:bb,setShowPlaceholders:$1,setRealisticColors:Q1,setBoardLayerVisible:J1,setSeparation:pb,showNetLayers:$o}}function bv(){se.depth?.destroy(),Object.assign(se,{canvas:null,context:null,depth:null,depthView:null,width:0,height:0}),Ns.clear(),Mn.clear(),Ba=null}function Tt(){!mn||ho||(ho=!0,queueMicrotask(()=>{ho=!1,mn?.(dh())}))}function dh(){let e=M.mode==="3d"?k.visible3dLayers:k.desiredCompareLayers;return{mode:M.mode,layers:k.scene.copperLayers.map(t=>({id:Number(t.id),name:String(t.name),color:jn(Pn(t)),visible:e.has(Number(t.id))})),boardLayers:Y1(),showBoard:M.showBoard,showComponents:M.showComponents,showPlaceholders:M.showPlaceholders,realisticColors:M.realisticColors,separation:w?w.separation.get(Rs())||0:M.separation,isolateNet:M.isolateNet,hasNet:!!M.activeNetId||Ua(),...w?{boards:Qv(),selectedBoard:Rs()}:{}}}function _n(e){if(w?.move.enabled&&Os(),Ge)return;let t=k.renderer&&!k.renderer.identityOnly?k.renderer.occurrenceKeys[M.selectedOccurrence]:null;Bs?.(e&&t!=null?{...e,occurrence:t}:e)}function pv(e){let t=k.renderer?.occurrenceKeys.indexOf(String(e))??-1;t>=0&&(M.selectedOccurrence=t)}function No(e){if(!e||!k.renderer||k.renderer.identityOnly)return e;let t=k.renderer.occurrenceMatrices[M.selectedOccurrence];return t?yt(t,e):e}function uh(e,t=null){return e?{kind:"net",sourceContext:"3D",netName:String(e.name||""),netUid:String(e.uid||"")||void 0,netCode:Number(e.id||0)||void 0,featureId:Number(t?.id||0)||void 0,uuid:String(t?.sourceUid||"")||void 0}:null}function fh(e,t=k){if(!e)return null;let a=Da(e),s=String(e.padNumber||e.pin||e.pinNumber||""),r=t.scene.nets.find(n=>Number(n.id)===Number(e.netId||0));if(a&&s)return{kind:"terminal",sourceContext:"3D",reference:a,pin:s,netUid:r?.uid,netName:r?.name,netCode:r?Number(r.id):void 0,uuid:String(e.sourceUid||"")||void 0,featureId:Number(e.id||0)||void 0};if(a){let n=_o(a,t);return{kind:"component",sourceContext:"3D",reference:a,componentUid:n?.uid,uuid:String(e.sourceUid||"")||void 0,featureId:Number(e.id||0)||void 0}}return uh(r,e)}function hh(){M.showBoard=!0,M.showComponents=!0,ga(),typeof Pe=="function"&&Pe()}function Ua(){return Oa().size>0||!!w?.emphasisSets.length}function Oa(){let e=new Set(k.highlightedNetIds);return M.activeNetId&&e.add(Number(M.activeNetId)),e}function Co(){(M.showBoard||M.showComponents)&&(M.savedShowBoard=M.showBoard,M.savedShowComponents=M.showComponents),M.showBoard=!1,M.showComponents=!1,ga(),typeof Pe=="function"&&Pe()}function bh(){M.showBoard=M.savedShowBoard!==!1,M.showComponents=M.savedShowComponents!==!1,ga(),typeof Pe=="function"&&Pe()}async function ph(e,t,a={}){let s=e.semanticGeometry.assets?.scene_manifest||e.semanticGeometry.semantic_gltf?.path,r=performance.now();if(s){if(e.scene.manifestUrl=new URL(s,location.href).toString(),e.scene.manifest=await xv(e.scene.manifestUrl,e),a.scene_manifest_fetch_parse_ms=performance.now()-r,!he(t))return!1;if(e.scene.manifest.schema!=="prism.semantic_gltf_a0")throw new Error(`Unsupported scene schema: ${e.scene.manifest.schema}`)}else e.scene.manifest={schema:"prism.semantic_gltf_partial.a0",bbox:null,layers:[],nets:[],objectFeatures:[],components:[],tiles:[],barrels:[]},a.scene_manifest_fetch_parse_ms=0;r=performance.now(),e.scene.layers=e.scene.manifest.layers||[],e.scene.copperLayers=e.scene.layers.filter(i=>i.role==="copper"||String(i.name).endsWith(".Cu")),e.scene.nets=e.scene.manifest.nets||[];for(let i of e.scene.manifest.objectFeatures||[])e.scene.features.set(Number(i.id),{...i,bounds:qa(i.boundsMm)});for(let i of e.scene.manifest.components||[])e.scene.componentFeatures.set(i.designator,i),e.scene.features.set(Number(i.featureId),{...i,kind:"component",sourceUid:i.uid,netId:0,bounds:null});for(let i of e.scene.manifest.tiles||[])e.scene.tiles.set(i.id,i);a.scene_manifest_index_ms=performance.now()-r;let n=xh(e);for(let i of n)e.compareLayers.add(i),e.desiredCompareLayers.add(i);for(let i of e.scene.copperLayers)e.visible3dLayers.add(Number(i.id));return!0}async function gv(e,t={},a=null){let s=performance.now();if(!await ph(k,e,t))return;let r=performance.now();if(k.renderer=await oa.create(j),t.webgpu_renderer_create_ms=performance.now()-r,!he(e)){k.renderer?.dispose?.(),k.renderer=null;return}k.renderer.setBarrels(Mi(k.scene.manifest.barrels,k.scene.manifest.layers)),Ls(),r=performance.now();let n=await Eh(e);if(t.board_fetch_parse_upload_ms=performance.now()-r,!he(e)||(k.scene.runtimeBounds=n||Xs(k.scene.manifest.bbox),U=new Ka(k.scene.runtimeBounds),As&&(await mv(e),!he(e)||(await yv(e),!he(e)))))return;r=performance.now(),Wo(),xb(),As&&(oM(),iM()),gb(),Ib(),t.controls_and_bindings_ms=performance.now()-r;let i={"board-ready":"Board ready \xB7 components and semantic layers are still generating","components-ready":"Board and components ready \xB7 semantic layers are still generating","semantic-ready":"WebGPU semantic glTF active"};if(Fa.textContent=i[k.viewerReadiness.stage]||"Loading 3D assets",k.semanticGeometry.assets?.components_glb&&!k.deferComponents){let o=performance.now();Jh(e).then(()=>{he(e)&&(ko(n),a?.({schema:"prism.semantic_viewer_performance.a0",milestone:"components-loaded",readiness_stage:k.viewerReadiness.stage,elapsed_ms:performance.now()-o,bytes_loaded:k.loadedBytes}))})}else ko(n);Me(performance.now(),{force:!0}),_s(e),r=performance.now(),await new Promise(o=>requestAnimationFrame(o)),t.first_frame_wait_ms=performance.now()-r,t.boot_total_ms=performance.now()-s}async function mv(e=ve){let t=k.semanticGeometry.assets?.schematic_native_manifest||k.semanticGeometry.schematic_vector?.path||k.semanticGeometry.schematic_scene?.path,a=k.semanticGeometry.assets?.schematic_manifest||k.semanticGeometry.schematic_world?.path,s=Y("[data-workspace=schematic]");if(!t&&!a){s.disabled=!0,s.title="No schematic world assets are available";return}let r=[t,a].filter(Boolean),n=null;for(let o of r)try{D.manifestUrl=new URL(o,location.href).toString();let c=await Br.create(Fe,D.manifestUrl);if(!he(e))return;N=c,N.setFlowOverlayCanvas(fn);break}catch(c){if(n=c,N=null,o===a)throw c}if(!N)throw n||new Error("Failed to load schematic viewer assets");D.manifest=N.manifest,D.pages=N.pages,D.byId=new Map(D.pages.map(o=>[o.id,o])),M.selectedPageId=D.pages[0]?.id||"",N.selectedPageId=M.selectedPageId,!["native","legacy","webgpu"].includes(String(D.rendererMode).toLowerCase())&&(Z=Pr.create(un,D.manifestUrl,D.manifest,N.featuresByPage,{onSelect:q1,onBlank:js,onHighlightNet:cb,onOpenPage:V1,onFallback:o=>{D.domFallbackReason=o,console.warn(o)}}),Z.preloadPages(D.pages)),N.preloadOverview()}async function yv(e=ve){let t=k.semanticGeometry.assets?.bom||k.semanticGeometry.bom?.path,a=Y("[data-workspace=bom]");if(!t){a&&(a.disabled=!0,a.title="No BoM artifact is available");return}try{let s=await Ws.create(hn,new URL(t,location.href).toString(),{onSelectReference:r=>Jo(r,!0)});if(!he(e))return;nt=s}catch(s){if(!he(e))return;console.warn(s),a&&(a.disabled=!0,a.title=s?.message||"BoM artifact could not be loaded")}}async function xv(e,t=k){if(t.assetCache)return t.assetCache.fetchJson(String(e));let a=await fetch(e,{cache:"default"});if(!a.ok)throw new Error(`Failed to load ${e}: ${a.status}`);return a.json()}function wv(){return!w||w.timing.boardsDrawnAt!=null?!0:![...w.boards.values()].some(e=>e.loadState==="loading"||e.loadState==="waiting")}var vv=24*1024*1024,la={bytes:0,waiting:null};async function gh(e){for(;;){if(la.bytes===0||la.bytes+e<=vv){la.bytes+=e,la.waiting??=new Promise(t=>requestAnimationFrame(()=>{la.bytes=0,la.waiting=null,t()}));return}await la.waiting}}async function Mv(e,t=ve,a=k){if(!he(t))return;let s=a.scene.residentTiles.get(e.id);if(s){s.lastUsed=performance.now();return}if(a.scene.failed.get(e.id))return;if(a.scene.loading.has(e.id))return a.scene.loading.get(e.id);let n=(async()=>{try{let i=await Qa(new URL(e.path,a.scene.manifestUrl).toString(),{fetchBytes:vn(a),fetchCache:"no-store"});if(!he(t)||!a.renderer||(await gh(i.primitives.reduce((g,b)=>g+mo(b),0)),!he(t)||!a.renderer))return;a.loadedBytes+=i.byteLength;let o=a.scene.layers.find(g=>Number(g.id)===Number(e.layerId)),c=[],l=0,f=0;for(let g of i.primitives){let b=a.renderer.addPrimitive(g,{kind:"copper",tileId:e.id,layerId:Number(e.layerId),innerCopper:Rn(Number(e.layerId),a),color:Ho(o,a),stencilMark:eb(o,a),baseZ:Number(o?.z_mm||0)/1e3,material:{baseColor:[1,1,1,1],metallic:.78,roughness:.32}});c.push(b),l+=g.indices.length/3,f+=mo(g)}let u={tile:e,entries:c,byteLength:i.byteLength,gpuBytes:f,triangles:l,lastUsed:performance.now(),pinned:!1};a.scene.residentTiles.set(e.id,u),a.scene.loaded.add(e.id),a.tileLoads+=1,a.residentTileBytes+=i.byteLength,a.residentTileGpuBytes+=f,a.residentTileTriangles+=l,a.triangles=a.residentTileTriangles,a.scene.failed.delete(e.id)}catch(i){if(!he(t))return;let o=a.scene.failed.get(e.id)||{count:0,message:""};a.scene.failed.set(e.id,{count:o.count+1,message:i?.message||String(i)}),o.count||console.warn(`Failed to load tile ${e.id}; suppressing retries until assets are regenerated`,i)}finally{he(t)&&a.scene.loading.delete(e.id)}})();return a.scene.loading.set(e.id,n),n}function mo(e){return jd(e.position.length/3,e.indices.length)}function Bo(e,t=k){let a=t.scene.residentTiles.get(e);a&&(t.renderer.removeEntries(a.entries),t.scene.residentTiles.delete(e),t.scene.loaded.delete(e),t.residentTileBytes=Math.max(0,t.residentTileBytes-a.byteLength),t.residentTileGpuBytes=Math.max(0,t.residentTileGpuBytes-a.gpuBytes),t.residentTileTriangles=Math.max(0,t.residentTileTriangles-a.triangles),t.triangles=t.residentTileTriangles,t.tileEvictions+=1)}function Me(e=performance.now(),t={},a=k){if(!a.renderer||!U||M.workspace!=="pcb")return;let s=M.mode==="layer"&&W.phase==="preload";if(!t.force&&!s&&e-a.lastTileScheduleAt<rv)return;let r=performance.now();a.lastTileScheduleAt=e;let n=kv(a);a.visibleTileIds=n;let i=a.scene.loading.size,c=Math.max(0,(s?iv:nv)-i),l=[...n].map(u=>a.scene.tiles.get(u)).filter(u=>u&&!a.scene.residentTiles.has(u.id)&&!a.scene.loading.has(u.id)&&!a.scene.failed.has(u.id)).sort((u,g)=>zf(u,a)-zf(g,a)).slice(0,c),f=ve;for(let u of l)Mv(u,f,a);for(let u of n){let g=a.scene.residentTiles.get(u);g&&(g.lastUsed=e)}vh(n,void 0,a),Tv(n,e,a),Sv(n,e,a),a.tileSchedulerMs=performance.now()-r}function kv(e=k){let t=new Set,a=M.mode==="3d"?e.visible3dLayers:Iv();if(!a.size||!Q)return t;if(M.mode==="layer"){for(let c of e.scene.tiles.values())a.has(Number(c.layerId))&&t.add(c.id);return t}let s=new Set,r=jo(e);if(r.size){for(let c of e.scene.tiles.values())if(a.has(Number(c.layerId))){for(let l of r)if(kh(c,l)){s.add(c.id);break}}}let n=Fo(e),i=[Q.matrix,...Ev(),...e===k?Ns.active(performance.now()):[]],o=0;for(let c of e.scene.tiles.values()){if(!a.has(Number(c.layerId))||n&&Rn(Number(c.layerId),e))continue;let l=M.mode==="layer"?fa.get(Number(c.layerId)):null;i.some(f=>xn(c,f,l,tv,e))&&t.add(c.id),!e.scene.residentTiles.has(c.id)&&xn(c,Q.matrix,l,0,e)&&(o+=1)}for(let c of s)t.add(c);return e.visibleTileMisses=o,t}function Ev(){if(!U?.moving?.()||M.mode==="layer")return[];let e=performance.now();return Es.at===e||(Es.at=e,Es.views=[0,1].map(t=>U.targetMatrix(j.width,j.height,!1,t))),Es.views}var Es={at:-1,views:[]};function Sv(e,t,a){if(M.mode==="layer"||!Q)return;let s=Fo(a);for(let r of[...a.scene.residentTiles.values()]){if(e.has(r.tile.id)||a.scene.loading.has(r.tile.id))continue;let n=Number(r.tile.layerId);if(a.visible3dLayers.has(n)&&!(s&&Rn(n,a))&&xn(r.tile,Q.matrix,null,av,a)){r.lastUsed=t;continue}t-r.lastUsed>sv&&Bo(r.tile.id,a)}}function mh(e,t){return e?"all":t?"lit":"none"}function Fo(e){return!!e.renderer&&e.renderer.innerCopperMode!=="all"}function Tv(e,t,a){if(Fo(a))for(let s of[...a.scene.residentTiles.values()])e.has(s.tile.id)||a.scene.loading.has(s.tile.id)||Rn(Number(s.tile.layerId),a)&&t-s.lastUsed>fv&&Bo(s.tile.id,a)}function Iv(){return M.mode!=="layer"||W.phase==="idle"?k.compareLayers:wh(W.previous,W.target)}function yh(){return M.mode!=="layer"?k.visible3dLayers:W.phase==="reveal"?wh(W.previous,W.target):k.compareLayers}function xh(e=k){let t=e.scene.copperLayers.map(a=>Number(a.id)).filter(Number.isFinite);return t.length?t.length===1?new Set([t[0]]):new Set([t[0],t[t.length-1]]):new Set}function Av(){let e=k.desiredCompareLayers.size?k.desiredCompareLayers:k.compareLayers;return e.size?new Set([...e].map(Number)):xh()}function wh(...e){let t=new Set;for(let a of e)for(let s of a||[])t.add(Number(s));return t}function vh(e,t=Lf,a=k){if(M.mode==="layer")return;let s=Math.min(Lf,t);if(a.residentTileGpuBytes<=s)return;let r=[...a.scene.residentTiles.values()].filter(n=>!e.has(n.tile.id)&&!a.scene.loading.has(n.tile.id)).sort((n,i)=>n.lastUsed-i.lastUsed);for(let n of r){if(a.residentTileGpuBytes<=s)break;Bo(n.tile.id,a)}}function xn(e,t,a=null,s=0,r=k){let n=Mh(e,r);if(!n)return!0;let i=Math.max(n[3]-n[0],n[4]-n[1])*s,o=[n[0]-i+(a?.[0]||0),n[1]-i+(a?.[1]||0),n[2]-.002,n[3]+i+(a?.[0]||0),n[4]+i+(a?.[1]||0),n[5]+.002],c=r.renderer?.occurrenceMatrices;return!c||c.length===1&&gr(c[0])?Uf(o,t):c.some(l=>Uf(o,aa(t,l)))}function Mh(e,t=k){let a=e.boundsMm;if(!a||a.length!==4)return null;let s=t.scene.layers.find(n=>Number(n.id)===Number(e.layerId)),r=Number(s?.z_mm||0)/1e3;return[a[0]/1e3,-a[3]/1e3,r-4e-4,a[2]/1e3,-a[1]/1e3,r+4e-4]}function Uf(e,t){let a=[[e[0],e[1],e[2]],[e[3],e[1],e[2]],[e[0],e[4],e[2]],[e[3],e[4],e[2]],[e[0],e[1],e[5]],[e[3],e[1],e[5]],[e[0],e[4],e[5]],[e[3],e[4],e[5]]].map(r=>_v(t,r));return![r=>r[0]<-r[3],r=>r[0]>r[3],r=>r[1]<-r[3],r=>r[1]>r[3],r=>r[2]<0,r=>r[2]>r[3]].some(r=>a.every(r))}function _v(e,t){let a=t[0],s=t[1],r=t[2];return[e[0]*a+e[4]*s+e[8]*r+e[12],e[1]*a+e[5]*s+e[9]*r+e[13],e[2]*a+e[6]*s+e[10]*r+e[14],e[3]*a+e[7]*s+e[11]*r+e[15]]}function kh(e,t){return Array.isArray(e.netIds)&&e.netIds.some(a=>Number(a)===Number(t))}function zf(e,t=k){let a=Mh(e,t);if(!a||!U)return 0;let s=(a[0]+a[3])*.5-U.focus[0],r=(a[1]+a[4])*.5-U.focus[1];return s*s+r*r}async function Eh(e=ve,t=k){let a=t.semanticGeometry.assets?.base_board_glb;if(!a)return null;let s=t.semanticGeometry.assets?.soldermask_glb,[r,n]=await Promise.all([Qa(new URL(a,location.href).toString(),{defaultFeatureId:0,fetchBytes:vn(t)}),s?Qa(new URL(s,location.href).toString(),{defaultFeatureId:0,fetchBytes:vn(t)}).catch(o=>(console.warn("[prism-semantic-viewer] solder mask failed to load",o),null)):null]);if(!he(e)||!t.renderer)return null;t.loadedBytes+=r.byteLength,n&&(t.loadedBytes+=n.byteLength);let i=[...r.primitives.filter(o=>{let c=Wn(o);return c!=="pad"&&!(n&&c==="soldermask")}),...n?.primitives||[]];for(let o of Ha(i,Wn)){let c=ov.includes(o.groupKey);t.renderer.addPrimitive(o,{kind:"board",boardRole:o.groupKey,...c?{side:cc(o)}:{},layerId:o.groupKey==="paste"?S1(o,t):0,material:o.material,color:o.material.baseColor})}return t.renderer.setHiddenBoardLayers(M.hiddenBoardLayers),xa(i.map(o=>o.bounds))}function ha(e=k){return e.scene.runtimeBounds||Xs(e.scene.manifest?.bbox)}function Rn(e,t=k){return dc(e,t.scene.copperLayers)}function Sh(e,t){let{back:a}=U.basis();return{eye:Ee(U.focus,pe(a,U.distance)),orthographic:t,pixelScale:t?e/Math.max(1e-9,U.orthoScale):e/2/Math.tan(U.fov/2)}}function Th(){if(w)return Rv();let e=k.renderer?.cullCounts||{full:0,board:0,body:0,box:0,culled:0},t=!k.renderer||k.renderer.identityOnly;return{occurrences:k.renderer?.occurrenceMatrices.length||0,lod:t?{full:1,board:0,body:0,box:0,culled:0}:{...e},triangles:k.renderer?.frameStats.triangles||0,draws:k.renderer?.frameStats.draws||0,gpuMemoryBytes:k.renderer?.gpuMemoryBytes()||0,gpuBreakdown:k.renderer?.gpuMemoryBreakdown()||null,gpuBudgetBytes:M.gpuBudgetBytes,componentTier:k.scene.componentTier,componentEvictions:k.scene.componentEvictions,tileEvictions:k.tileEvictions,visibleTileMisses:k.visibleTileMisses||0,cache:k.assetCache?k.assetCache.summary():{enabled:!1},frameIntervalMs:M.frameIntervalMs,frameIntervalP95Ms:M.frameIntervalP95Ms,frameCpuMs:M.frameCpuMs,frameCpuP95Ms:M.frameCpuP95Ms,fps:M.fps}}function Rv(){let e=Ye(),t=e.map(a=>a.scene.componentTier);return{occurrences:w.scene.occurrenceCount||0,lod:w.scene.cullCounts(),triangles:w.scene.frameStats.triangles,draws:w.scene.frameStats.draws,gpuMemoryBytes:w.scene.gpuMemoryBytes(),gpuBreakdown:w.scene.gpuMemoryBreakdown(),gpuBudgetBytes:M.gpuBudgetBytes,componentTier:`${t.filter(a=>a==="loaded").length}/${e.length} loaded`,componentEvictions:e.reduce((a,s)=>a+s.scene.componentEvictions,0),tileEvictions:e.reduce((a,s)=>a+s.tileEvictions,0),visibleTileMisses:e.reduce((a,s)=>a+(s.visibleTileMisses||0),0),componentMisses:e.filter(a=>a.renderer.cullCounts.full>0&&a.scene.componentTier!=="loaded"&&a.semanticGeometry.assets?.components_glb).length,cache:e.find(a=>a.assetCache)?.assetCache.summary()||{enabled:!1},frameIntervalMs:M.frameIntervalMs,frameIntervalP95Ms:M.frameIntervalP95Ms,frameCpuMs:M.frameCpuMs,frameCpuP95Ms:M.frameCpuP95Ms,fps:M.fps,firstFrame:w.timing.boardsDrawnAt==null?null:{sinceSceneMs:w.timing.boardsDrawnAt-w.timing.descriptorAt,sinceNavigationMs:w.timing.boardsDrawnAt}}}function Ih(e){M.showStats=!!e,Ts&&(Ts.hidden=!M.showStats),ft&&(ft.hidden=!(M.showStats&&w)),M.showStats&&w&&Fv(),Ah()}var yo="prism.systemScene.lodThresholds",Nv=Object.freeze([{key:"fullPx",label:"Parts",max:600},{key:"boardPx",label:"Copper",max:400},{key:"boxPx",label:"Box below",max:120}]);function Cv(){try{let e=JSON.parse(globalThis.localStorage?.getItem(yo)||"null");if(e&&typeof e=="object")return Ma(e)}catch{}return{...st}}function Bv(e){try{e?globalThis.localStorage?.setItem(yo,JSON.stringify(e)):globalThis.localStorage?.removeItem(yo)}catch{}}function xo(e){if(!w)return null;let t=e==null?{...st}:{...w.scene.lodThresholds,...e},a=w.scene.setLodThresholds(t);return Bv(e==null?null:a),wo(),a}function Fv(){if(!ft||ft.childElementCount)return wo();let e=document.createElement("h2");e.textContent="Detail thresholds (CSS px)",ft.append(e);for(let a of Nv){let s=document.createElement("label"),r=document.createElement("span");r.textContent=a.label;let n=document.createElement("input");Object.assign(n,{type:"range",min:"0",max:String(a.max),step:"1"}),n.dataset.key=a.key;let i=document.createElement("output");n.addEventListener("input",()=>xo({[a.key]:Number(n.value)})),s.append(r,n,i),ft.append(s)}let t=document.createElement("button");t.type="button",t.textContent="Defaults",t.addEventListener("click",()=>xo(null)),ft.append(t),wo()}function wo(){if(!ft||!w)return;let e=w.scene.lodThresholds;for(let t of ft.querySelectorAll("input[data-key]"))t.value=String(e[t.dataset.key]),t.nextElementSibling.value=String(Math.round(e[t.dataset.key]))}function Ah(){if(!Ts||!M.showStats)return;let e=Th(),{full:t,board:a,body:s,box:r,culled:n}=e.lod,i=[["Occurrences",`${e.occurrences} (${t+a+s+r} visible)`],["Detail",`${t} full \xB7 ${a} board \xB7 ${s} body \xB7 ${r} box \xB7 ${n} culled`],["Triangles",e.triangles.toLocaleString()],["Draws",e.draws.toLocaleString()],["GPU memory",`${(e.gpuMemoryBytes/1048576).toFixed(1)} / ${(e.gpuBudgetBytes/1048576).toFixed(0)} MB`],["Components",`${e.componentTier}${e.componentEvictions?` \xB7 ${e.componentEvictions} evicted`:""}`],["Cache",e.cache.enabled?`${e.cache.hits} hits \xB7 ${e.cache.misses} misses \xB7 ${(e.cache.bytes/1048576).toFixed(0)} MB`:"off"],["Frame",`${e.frameIntervalMs.toFixed(1)} ms \xB7 p95 ${e.frameIntervalP95Ms.toFixed(1)}`],["CPU",`${e.frameCpuMs.toFixed(2)} ms \xB7 p95 ${e.frameCpuP95Ms.toFixed(2)}`],["FPS",e.fps.toFixed(0)]];Ts.innerHTML=i.map(([o,c])=>`<dt>${o}</dt><dd>${c}</dd>`).join("")}var Ov="prism.system_scene.a0";function Ye(){return w?[...w.boards.values()].filter(e=>e.renderer&&e.loadState==="loaded"):[]}async function _h(e={}){let t=oh();if(Bs=typeof e.onSelectionChange=="function"?e.onSelectionChange:null,yn=typeof e.onContextMenu=="function"?e.onContextMenu:null,mn=typeof e.onViewStateChange=="function"?e.onViewStateChange:null,An=typeof e.isActive=="function"?e.isActive:()=>!0,As=!1,M.gpuBudgetBytes=Jr,eh(e.root||document),!Et||!j)throw new Error("Semantic viewer shell is missing required DOM nodes");if(typeof e.loadBundle!="function")throw new Error("A system scene needs a bundle loader");let a=await Ar.create(j);return he(t)?(a.setLodThresholds(Cv()),w={scene:a,loadBundle:e.loadBundle,onEmphasis:typeof e.onEmphasis=="function"?e.onEmphasis:null,onMove:typeof e.onMove=="function"?e.onMove:null,onHarness:typeof e.onHarness=="function"?e.onHarness:null,baseDescriptor:null,descriptor:null,move:s1(),gizmo:null,standInKey:null,showLabels:!0,harnesses:[],harnessLit:new Map,showHarnesses:!0,harnessDrawn:null,tubes:[],tubedHarnesses:new Set,harnessPick:null,worlds:new Map,nodePreview:null,housingModels:new Map,timing:{descriptorAt:null,boardsDrawnAt:null},boards:new Map,groups:new Map,placed:[],placements:new Map,hiddenLayers:new Map,separation:new Map,bounds:null,framed:!1,snapped:!1,boardSelected:!1,inputs:new Map,emphasisSets:[],emphasisBounds:new Map,emphasisReport:null},k=Cs({key:""}),U=new Ka([-.1,-.1,-.01,.1,.1,.01]),Wo(),xb(),gb(),Ib(),Fa.textContent="System scene",_s(t),{...lh(),focusPlacement:qv,selectBoardContext:ec,setEmphasisSets:Zv,setSystemScene:Pv,frameNetEmphasis:e1,frameAll(){w?.bounds&&U.frame(w.bounds)},setMoveAllowed:r1,setMoveMode:wn,setMoveSpace:Vh,previewPose:n1,cancelMove:Go,getMoveState:()=>w?Kh():null,targetHarnessNode:On,selectHarness:x1,previewHarnessNode:w1,cancelHarnessNode:Yh,getHarnessState:()=>w?$h():null,setLabelsVisible(s){w&&(w.showLabels=!!s,ua&&(ua.hidden=!w.showLabels))},setHelpVisible:qh,isHelpVisible:()=>!!(kt&&!kt.hidden),setHarnessesVisible(s){w&&(w.showHarnesses=!!s,w.harnessDrawn=null,Pa({relabel:!1}))},frameBoard(s){let r=w?.placements.get(String(s));return r&&U.frame(r.worldBounds),!!r},frameParts:t1,resize(){w?.scene.resize()},setLodOverride(s){for(let r of Ye())r.renderer.setLodOverride(s)},setLodThresholds:xo,pickSurfaceAt:lM,focusMoveTarget:dM,viewAxis(s,r=!1){!w||!["x","y","z"].includes(s)||(U.setAxis(s,!!r),w.bounds&&U.frame(w.bounds))},projectPoint(s,r){return Vf(s,r)},projectComponent(s,r){let n=w?.placements.get(String(r));return n?.board?Eb(n.board,s,i=>Vf(i,r)):null},dispose(){ch(t)}}):(a.dispose(),null)}function Pv(e){if(!w)return;if(e?.schema!==Ov)throw new Error(`Unsupported system scene schema: ${e?.schema||"missing"}`);w.baseDescriptor=e,w.timing.descriptorAt??=performance.now();let t=w.move.target?e.occurrences.find(s=>s.path===w.move.target):null;t?!w.move.drag&&zh(w.move.preview,t.pose)&&(w.move.preview=null):(w.move.drag=null,w.move.preview=null,w.move.target=null),w.descriptor=Gh(),w.harnesses=Array.isArray(e.harnesses)?e.harnesses:[],w.harnessDrawn=null;let a=new Set;for(let s of e.assets||[]){a.add(s.assetId);let r=w.boards.get(s.assetId),n=Yu(r,s);if(n!=="create"){r.asset=s,n==="load"&&Kf(r,ve);continue}r&&Gf(s.assetId);let i=Cs({key:s.assetId,topology:{},semanticGeometry:{},deferComponents:!0});Object.assign(i,{asset:s,bundleUrl:s.bundleUrl,loadState:"waiting",abort:null}),w.boards.set(s.assetId,i),Yi(s)&&Kf(i,ve)}for(let s of[...w.boards.keys()])a.has(s)||Gf(s);Pa(),v1(),w.move.enabled&&(Os({quiet:!0}),pt("sync"))}function Gf(e){let t=w.boards.get(e);t?.abort?.abort(),w.boards.delete(e),w.scene.removeAsset(e),t&&(t.renderer=null),k===t&&Oo()}async function Kf(e,t){e.loadState="loading",e.abort=new AbortController;let a=()=>he(t)&&w?.boards.get(e.key)===e&&!e.abort.signal.aborted;try{let s=await w.loadBundle(e.bundleUrl,e.abort.signal);if(!a()||(e.topology=s.topology||{},e.topology.net_details||(e.topology.net_details=nh(e.topology)),e.semanticGeometry=s.semanticGeometry||{},e.viewerReadiness=s.readiness||e.semanticGeometry.readiness||{stage:"semantic-ready",progress:100},e.assetCache=s.assetCache||null,!await ph(e,t)||!a()))return;e.renderer=w.scene.asset(e.key),e.renderer.setBarrels(Mi(e.scene.manifest.barrels,e.scene.manifest.layers)),Ls(e);let r=await Eh(t,e);if(!a())return;e.scene.runtimeBounds=r||Xs(e.scene.manifest.bbox),e.renderer.setBoardBounds(e.scene.runtimeBounds),e.loadState="loaded",Pa()}catch(s){if(!a())return;console.warn(`[prism-semantic-viewer] system board ${e.key} failed to load`,s),e.loadState="failed",e.error=s?.message||String(s),w.scene.removeAsset(e.key),e.renderer=null,k===e&&Oo(),Pa()}}function Pa({relabel:e=!0}={}){let t=w?.descriptor;if(!t)return;w.harnessDrawn=null;let a=Rs(),s=new Map((t.assets||[]).map(c=>[c.assetId,c])),r=new Map,n=[];for(let c of Ju(t)){let l=c.assetId?s.get(c.assetId):null,f=c.assetId?w.boards.get(c.assetId):null,u=c.kind!=="board"&&!c.restricted?Uv(c):null;if(u){r.has(u.rendererId)||r.set(u.rendererId,[]),r.get(u.rendererId).push({matrix:u.matrix,key:c.path,hiddenLayers:[],explode:null}),n.push({occurrence:c,rendererId:u.rendererId,board:null,matrix:u.matrix,worldBounds:u.worldBounds,standIn:null,own:u.kind,primitives:u.primitives});continue}if(c.model||c.box)continue;let g=$u(c,l,f?.loadState),b,h,d;if(!g)b=f.key,h=qr(c.worldMatrix,l.bundleToBoard),d=yt(h,f.scene.runtimeBounds);else{if(!c.boundsMm)continue;b=`stand-in:${g}`,w.scene.standIn(b,Hr[g].color),h=hs(c.worldMatrix,c.boundsMm),d=yt(h,[0,0,0,1,1,1])}r.has(b)||r.set(b,[]),r.get(b).push({matrix:h,key:c.path,hiddenLayers:g?[]:[...w.hiddenLayers.get(c.path)||[]],explode:g?null:Dh(f,w.separation.get(c.path)||0)}),n.push({occurrence:c,rendererId:b,board:g?null:f,matrix:h,worldBounds:d,standIn:g})}let i=Nh();zv(r,i.housings);for(let c of w.scene.assets.keys())r.has(c)||r.set(c,[]);w.scene.setOccurrences(r),w.groups=r;let o=w.placements;if(w.placed=n,w.placements=new Map(n.map(c=>[c.occurrence.path,c])),e||!o)k1();else for(let c of n)c.label=o.get(c.occurrence.path)?.label;w.bounds=xa(n.map(c=>c.worldBounds)),w.bounds&&(U.sceneRadius=At(w.bounds),w.framed||(U.frame(w.bounds),w.snapped||U.snap(),w.snapped=!0,n.some(c=>c.standIn==="loading")||(w.framed=!0)));for(let c of Ye())Nn(c);a!=null&&(w.placements.get(a)?.board===k?M.selectedOccurrence=k.renderer.occurrenceKeys.indexOf(a):Oo()),ht(i),Uh(),Tt()}var Rh=[.17,.18,.2],jv=[.24,.39,.87],Lv=[.9,.28,.3];function Nh(){if(w.worlds=new Map(w.descriptor.occurrences.map(e=>[e.path,e.worldMatrix])),!w.showHarnesses||!w.harnesses.length)return{tubes:[],housings:[]};try{let e=w.descriptor.occurrences.filter(t=>t.kind==="board"&&t.boundsMm).map(t=>({id:t.path,matrix:t.worldMatrix,...t.boundsMm}));return Wu(zi(w.harnesses,w.nodePreview,wt),za,e)}catch(e){return console.warn("[prism-semantic-viewer] harness geometry failed",e),{tubes:[],housings:[]}}}function ht(e=null){if(!w?.descriptor)return;let t=(e??Nh()).tubes;w.tubes=t,w.tubedHarnesses=new Set(t.map(a=>a.harness)),w.scene.setTubes(t,Oh)}var vo=[.42,.45,.5,1],Ch=Object.freeze([1e3,0,0,0,0,0,-1e3,0,0,1e3,0,0,0,0,0,1]);function Dv(e){return{...Lh(e),showBoard:!1,showComponents:!0}}function Bh(e,t){return e.housing?Dv(t):Lh(t)}function Uv(e){if(e.model?.glbKey){let t=aa(e.worldMatrix,e.model.matrixMm||Yt),a=w.housingModels.get(e.model.glbKey);if(a||Fh(e.model.glbKey),a?.state==="ready"){let s=qr(t,Ch);return{kind:"model",rendererId:`housing:${e.model.glbKey}`,matrix:s,worldBounds:yt(s,a.bounds),primitives:a.primitives}}if(e.model.boundsMm){w.scene.standIn("housing:proxy",vo);let s=hs(t,e.model.boundsMm);return{kind:"model",rendererId:"housing:proxy",matrix:s,worldBounds:yt(s,[0,0,0,1,1,1])}}}if(e.box?.boundsMm){let t=e.box.rgba||vo,a=Qu(t);w.scene.standIn(a,t);let s=hs(e.worldMatrix,e.box.boundsMm);return{kind:"box",rendererId:a,matrix:s,worldBounds:yt(s,[0,0,0,1,1,1])}}return null}function zv(e,t){let a=(s,r)=>{e.has(s)||e.set(s,[]),e.get(s).push({...r,hiddenLayers:[],explode:null})};for(let s of t){let r=`housing:${s.key}`,n=s.model?w.housingModels.get(s.model.glbKey):null;if(s.model&&!n&&Fh(s.model.glbKey),n?.state==="ready"){a(`housing:${s.model.glbKey}`,{key:r,matrix:qr(s.matrix,Ch)});continue}w.scene.standIn("housing:proxy",vo);let i=s.model?s.model.boundsMm:{minMm:[0,0,0],maxMm:[1,1,1]};a("housing:proxy",{key:r,matrix:hs(s.matrix,i)})}}async function Fh(e){w.housingModels.set(e,{state:"loading"});let t=ve;try{let a=await Qa(new URL(`/api/catalog/models/${encodeURIComponent(e)}.glb`,location.href).toString(),{fetchCache:"force-cache"});if(!he(t)||!w)return;let s=w.scene.asset(`housing:${e}`);s.housing=!0,s.setLodOverride(mr);let r=[1/0,1/0,1/0,-1/0,-1/0,-1/0];for(let n of a.primitives){for(let i=0;i<3;i+=1)r[i]=Math.min(r[i],n.bounds[i]),r[i+3]=Math.max(r[i+3],n.bounds[i+3]);s.addPrimitive(n,{kind:"component",layerId:0,material:n.material,color:n.material.baseColor})}a.primitives.length&&s.setBoardBounds(r),w.housingModels.set(e,{state:"ready",bounds:r,primitives:a.primitives})}catch(a){console.warn("[prism-semantic-viewer] housing model failed",e,a),w&&w.housingModels.set(e,{state:"failed"})}w?.descriptor&&Pa({relabel:!1})}function za(e){return w.worlds.get(e)??null}function Oh(e){let t=w.harnessLit.get(e.harness),a=t?e.wires.map(s=>t.get(s)).find(Boolean):null;return a?{rgb:Gv(a),mode:1}:e.collides.length?{rgb:Lv,mode:0}:w.harnessPick?.key===e.harness?{rgb:jv,mode:0}:{rgb:Rh,mode:w.emphasisSets.length?2:0}}function Gv(e){let t=/^#?([0-9a-f]{6})$/i.exec(String(e));if(!t)return Rh;let a=Number.parseInt(t[1],16);return[(a>>16&255)/255,(a>>8&255)/255,(a&255)/255]}function Rs(){return!w||!k.renderer||!Ph()?null:k.renderer.occurrenceKeys[M.selectedOccurrence]??null}function Ph(){return!!(M.selectedFeatureId||M.activeNetId||w?.boardSelected)}function jh(e){if(k===e)return;let t=Ge;Ge=!0;try{Oe()}finally{Ge=t}k=e,Pe()}function Oo(){Oe(),k=Cs({key:""}),Pe()}function Kv(e,t){let a=performance.now(),s=Math.max(0,e-Zt),r=Math.min(.05,(e-Zt)/1e3);Zt=e,U.update(r),w.scene.resize(),Q={layerId:0,viewport:{x:0,y:0,width:j.width,height:j.height},matrix:U.matrix(j.width,j.height,!1),lod:Sh(j.height/Math.min(devicePixelRatio||1,2),!1)};let n=Ua(),i=new Map;for(let o of Ye()){let c=$v(o);o.scene.copperRealism!==ja()&&Ls(o),o.renderer.setInnerCopperMode(mh(!M.showBoard||Yv(o),jo(o).size>0)),o.renderer.dimCopper=n,Me(e,{},o);let l=o===k;i.set(o.renderer,{activeNetId:l?M.activeNetId:0,selectedFeatureId:l?M.selectedFeatureId:0,time:e/1e3,layerOffsets:c,visibleLayers:o.visible3dLayers,showBoard:M.showBoard,showComponents:M.showComponents,showPaste:!0,componentOpacity:1,boardOpacity:n?.34:1,isolateNet:M.isolateNet,compareMode:!1,compareOffsets:new Map,layerAlphas:null,visibleTileIds:o.visibleTileIds})}w.inputs=i,w.scene.setSelectedOccurrence(k.renderer&&Ph()?k.renderer.occurrenceBase+M.selectedOccurrence:-1),P1(e,i,n)&&(w.scene.render(Q,o=>i.get(o)||Bh(o,e)),Tb(),E1()),p1(),M1(),o1(),w.timing.boardsDrawnAt==null&&Zu(w.placed)&&(w.timing.boardsDrawnAt=performance.now());for(let o of Ye())Qh(e,o);To(s,performance.now()-a),Io(e),_s(t)}function Lh(e){return{activeNetId:0,selectedFeatureId:0,time:e/1e3,visibleLayers:new Set,showBoard:!0,showComponents:!1,componentOpacity:1,boardOpacity:1,isolateNet:!1}}function Vv(e,t){let a=performance.now();return w.scene.pick(Q,e,t,s=>w.inputs.get(s)||Bh(s,a))}function Hv(e){let t=typeof e.occurrenceKey=="string"&&e.occurrenceKey.startsWith("housing:")?e.occurrenceKey.slice(8):null;if(t){let r=t.lastIndexOf("/"),[n,i]=[t.slice(0,r),t.slice(r+1)],o=w.tubes.find(c=>c.harness===n&&(c.from===i||c.to===i));o?ba({key:n,segmentId:o.segmentId,pointMm:null}):Oe();return}let a=e.occurrenceKey!=null?w.placements.get(e.occurrenceKey):null;if(!a)return Oe();if(a.standIn||a.own)return Po(a);let s=a.board;if(M.isolateNet&&!Wv(s,a.occurrence.path,e.featureId))return Oe();jh(s),M.selectedOccurrence=s.renderer.occurrenceKeys.indexOf(a.occurrence.path),e.featureId&&!w.move.enabled?ma(e.featureId,!0):ec()}function qv(e){let t=e!=null?w?.placements.get(String(e)):null;return t?t.standIn||t.own?(Po(t),"stand-in"):(jh(t.board),M.selectedOccurrence=k.renderer.occurrenceKeys.indexOf(t.occurrence.path),"board"):null}function Po(e){let t=Ge;Ge=!0;try{Oe()}finally{Ge=t}w.standInKey=e.occurrence.path,w.move.enabled&&Os(),Ge||Bs?.({kind:"board",sourceContext:"3D",occurrence:e.occurrence.path,standIn:e.standIn})}function Wv(e,t,a){let s=Number(e.scene.features.get(Number(a))?.netId)||0;if(!s)return!1;let r=e.renderer.occurrenceKeys.indexOf(t);return r<0?!1:e.renderer.occurrenceEmphasis?.[r]?.has(s)?!0:e===k&&r===M.selectedOccurrence&&s===Number(M.activeNetId)}function Vf(e,t){let a=w?.placements.get(String(t));return a?So(e,a.matrix):null}function jo(e=k){if(!w)return Oa();let t=new Set(e===k?Oa():[]);for(let a of e.renderer?.occurrenceEmphasis||[])if(a)for(let s of a.keys())t.add(Number(s));return t}function Nn(e){let t=w.groups.get(e.key)||[],a=new Set;for(let s of e.scene.copperLayers){let r=Number(s.id);t.some(n=>!w.hiddenLayers.get(n.key)?.has(r))&&a.add(r)}if(M.isolateNet){let s=new Set;for(let r of jo(e))for(let n of Xo(r,e))s.add(n);e.visible3dLayers=new Set([...a].filter(r=>s.has(r)))}else e.visible3dLayers=a;Me(performance.now(),{force:!0},e)}function Lo(e,t){let a=e??(w.groups.get(k.key)||[]).map(s=>s.key);for(let s of a){let r=new Set(w.hiddenLayers.get(String(s))||[]);t(r,w.placements.get(String(s))?.board),w.hiddenLayers.set(String(s),r)}for(let s of Ye()){let r=w.groups.get(s.key)||[];for(let n of r)n.hiddenLayers=[...w.hiddenLayers.get(n.key)||[]];s.renderer.setOccurrenceHiddenLayers(r.map(n=>n.hiddenLayers)),Nn(s)}Pe(),Tt()}function Xv(){let e=Rs();if(e==null||!M.activeNetId)return;let t=Xo(M.activeNetId,k);t.size&&Lo([e],a=>{a.clear();for(let s of k.scene.copperLayers)t.has(Number(s.id))||a.add(Number(s.id))})}function $v(e){if(e.scene.layerSteps)return e.scene.layerSteps;let t=new Float32Array(256),a=(e.scene.copperLayers.length-1)/2;return e.scene.copperLayers.forEach((s,r)=>{t[Number(s.id)]=a-r}),e.scene.layerSteps=t,t}function Dh(e,t){let a=e?.scene.runtimeBounds,s=a?Math.hypot((a[3]-a[0])*1e3,(a[4]-a[1])*1e3):0;return[t*t*ce(s*.12,8,25)/1e3,t<.0999?1:0,1-t*.72,1]}function Yv(e){return(w.groups.get(e.key)||[]).some(t=>(w.separation.get(t.key)||0)>.001)}function Jv(e,t){let a=t!=null?[String(t)]:(w.groups.get(k.key)||[]).map(s=>s.key);for(let s of a)w.separation.set(s,e);for(let s of Ye()){let r=w.groups.get(s.key)||[];s.renderer.setOccurrenceExplode(r.map(n=>Dh(s,w.separation.get(n.key)||0)))}Tt()}function Qv(){return w.placed.filter(e=>!e.own).map(e=>{let t=w.hiddenLayers.get(e.occurrence.path)||new Set,a=e.board;return{key:e.occurrence.path,name:e.occurrence.displayPath||e.occurrence.path,standIn:e.standIn||null,separation:w.separation.get(e.occurrence.path)||0,layers:a?a.scene.copperLayers.map(s=>({id:Number(s.id),name:String(s.name),color:jn(Pn(s,a)),visible:!t.has(Number(s.id))})):[]}})}function Zv(e){return w?(w.emphasisSets=e,Uh()):null}function Uh(){if(!w)return[];let e=new Map;for(let[n,i]of w.groups)e.set(n,i.map(()=>null));let t=new Map;for(let n of w.groups.values())n.forEach((i,o)=>t.set(i.key,o));w.emphasisBounds=new Map;let a=w.emphasisSets.map(n=>{let i={key:n.key,color:n.color,lit:0,unresolved:[]},o=[];w.emphasisBounds.set(n.key,o);for(let c of n.members){let l=w.placements.get(c.occurrence),f=l?.board;if(!f&&l?.own){i.lit+=1,l.worldBounds&&o.push({occurrence:c.occurrence,box:l.worldBounds});continue}if(!f){let x=l?l.standIn==="loading"||l.standIn==="building"?"loading":l.standIn==="restricted"?"restricted":"not-drawn":"not-drawn";i.unresolved.push({occurrence:c.occurrence,net:c.net,reason:x});continue}let u=sa(f.scene.nets,c.net),g=Number(u?.id)||0;if(!g){i.unresolved.push({occurrence:c.occurrence,net:c.net,reason:"unknown-net"});continue}let b=e.get(f.key),h=t.get(c.occurrence);if(!b||h==null)continue;b[h]=b[h]||new Map,b[h].has(g)||b[h].set(g,n.mark),i.lit+=1;let d=qa(u.boundsMm);d&&o.push({occurrence:c.occurrence,box:yt(l.matrix,d)})}return i});w.harnessLit=fu(w.harnesses,w.emphasisSets),w.harnessDrawn=null,w.scene.setTubeColors(Oh);for(let n of a){n.wires=0;for(let i of w.harnessLit.values())for(let o of i.values())o===n.color&&(n.wires+=1)}let s=w.emphasisSets.length>0;for(let n of Ye())n.renderer.setOccurrenceEmphasis(s&&e.get(n.key)||null,{dimCopper:s});if(M.isolateNet)for(let n of Ye())Nn(n);let r=JSON.stringify(a)!==JSON.stringify(w.emphasisReport);return w.emphasisReport=a,r&&w.onEmphasis?.(a),a}function e1(e=null,t=null){let a=[];for(let[r,n]of w?.emphasisBounds||[])if(!(e!=null&&r!==String(e)))for(let i of n)(t==null||i.occurrence===t)&&a.push(i.box);let s=xa(a);return s?(U.frame(s),!0):!1}function t1(e){let t=[];for(let s of Array.isArray(e)?e:[]){let r=w?.placements.get(String(s?.occurrence));if(r&&!s?.reference){r.worldBounds&&t.push(r.worldBounds);continue}let n=r?.board?.scene.componentFeatures.get(String(s?.reference)),i=n?r.board.scene.features.get(Number(n.featureId))?.bounds:null;i&&t.push(yt(r.matrix,i))}let a=xa(t);return a?(U.frame(a),!0):!1}var Do=.001,a1=90,Hf=["#e5484d","#30a46c","#3e63dd"],bo=["X","Y","Z"];function zh(e,t){if(!e||!t)return!1;let a=$t(e),s=$t(t),r=[...a.translationMm,...a.rotation],n=[...s.translationMm,...s.rotation];return r.every((i,o)=>Math.abs(i-n[o])<1e-6)}function s1(){return{allowed:!1,enabled:!1,route:!1,space:"world",target:null,preview:null,drag:null,node:null}}function Gh(){let e=w.baseDescriptor;return!e||!w.move.target||!w.move.preview?e:Pl(e,w.move.target,w.move.preview)}function Fs(){w.baseDescriptor&&(w.descriptor=Gh(),Pa({relabel:!1}))}function Uo(){let e=w.move.target;return e?w.baseDescriptor?.occurrences.find(t=>t.path===e)??null:null}function Kh(){let e=w.move,t=Uo();return{allowed:e.allowed,enabled:e.enabled,route:e.route,space:e.space,dragging:!!e.drag,target:t?{occurrence:t.path,instanceId:t.instanceId,displayPath:t.displayPath,kind:t.kind,restricted:!!t.restricted,pose:$t(e.preview??t.pose),source:e.preview?"manual":t.pose?.source??"default",unsaved:!!e.preview}:null}}function pt(e){w.onMove?.({phase:e,...Kh()})}function r1(e){w.move.allowed=!!e,!w.move.allowed&&w.move.enabled&&wn(!1)}function wn(e,{route:t=!1}={}){let a=!!e&&w.move.allowed,s=a&&!!t;a===w.move.enabled&&s===w.move.route||(w.move.route=s,s&&Mo(),a||(Mo(),w.move.node&&(w.move.node=null,w.nodePreview&&(w.nodePreview=null,ht()),ke("target"))),w.move.enabled=a,a&&Os({quiet:!0}),pt("mode"))}function Vh(e){w.move.space=e==="local"?"local":"world",pt("mode")}function zo(){return w.standInKey??Rs()}function Os({quiet:e=!1}={}){if(!w)return;let t=zo(),a=w.move.enabled&&!w.move.route&&t!=null?Ol(w.baseDescriptor,t):null,s=a&&a.move!==!1?a.path:null;s!==w.move.target&&(Mo(),w.move.target=s,e||pt("target"))}function Mo(){let e=!!w.move.preview;w.move.drag=null,w.move.preview=null,w.move.target=null,e&&Fs()}function n1(e){w?.move.target&&(w.move.preview=e?$t(e):null,Fs(),pt("preview"))}function Go(){!w||!w.move.preview&&!w.move.drag||(w.move.drag=null,w.move.preview=null,Fs(),pt("cancel"))}function i1(){let e=`${w.move.target}/`,t=xa(w.placed.filter(a=>a.occurrence.path===w.move.target||a.occurrence.path.startsWith(e)).map(a=>a.worldBounds));return t?[0,1,2].map(a=>(t[a]+t[a+3])/2/Do):null}function ea(e){let t=es(Q.matrix,pe(e,Do),Q.viewport);if(!t)return null;let a=j.getBoundingClientRect();return[t.x*a.width/j.width,t.y*a.height/j.height]}function o1(){let e=$e;if(!e)return;let t=w.move.enabled&&Q?Fn():null,a=t?null:Uo(),s=a&&typeof a.move=="object"?a.move:null,r=s?w.move.preview??a.pose:null,n=t?t.worldMm:w.move.enabled&&a&&Q?s?.pivot==="origin"?[...r.translationMm]:i1():null,i=n?ea(n):null;if(!i){e.toggleAttribute("hidden",!0),w.gizmo=null;return}e.toggleAttribute("hidden",!1),e.firstChild||c1(e);let{right:o,back:c}=U.basis(),l=ea(Ee(n,o)),f=l?Math.hypot(l[0]-i[0],l[1]-i[1]):0;if(!(f>1e-6)){e.toggleAttribute("hidden",!0);return}let u=a1/f,g=a?w.move.preview??a.pose:null,b=g&&(s||w.move.space==="local")?Cl(g):hi,h=[];b.forEach((x,p)=>{let m=ea(Ee(n,pe(x,u))),y=e.querySelector(`[data-part="t${p}"]`),v=m&&Math.hypot(m[0]-i[0],m[1]-i[1])>12&&(!s||(s.translate||[]).includes(p));if(y.style.display=v?"":"none",v){let _=y.querySelector("line");_.setAttribute("x1",i[0]),_.setAttribute("y1",i[1]),_.setAttribute("x2",m[0]),_.setAttribute("y2",m[1]),y.querySelector("circle").setAttribute("cx",m[0]),y.querySelector("circle").setAttribute("cy",m[1]),y.querySelector("text").setAttribute("x",m[0]+9),y.querySelector("text").setAttribute("y",m[1]-7)}let E=jl(x),S=qe(x,E),T=[];for(let _=0;_<=64;_+=1){let R=_/64*Math.PI*2,C=ea(Ee(n,pe(Ee(pe(E,Math.cos(R)),pe(S,Math.sin(R))),u*.7)));C&&T.push(`${C[0].toFixed(1)},${C[1].toFixed(1)}`)}let A=e.querySelector(`[data-part="r${p}"]`);A.setAttribute("points",T.join(" ")),A.style.display=t||s&&!(s.rotate||[]).includes(p)?"none":"",h.push({axis:x,pxPerMm:m?[(m[0]-i[0])/u,(m[1]-i[1])/u]:[0,0]})});let d=e.querySelector('[data-part="pivot"]');d.setAttribute("cx",i[0]),d.setAttribute("cy",i[1]),w.gizmo={center:i,pivot:n,handles:h,back:c,limits:s}}function c1(e){let t="http://www.w3.org/2000/svg",a=(s,r)=>{let n=document.createElementNS(t,s);for(let[i,o]of Object.entries(r))n.setAttribute(i,o);return n};Hf.forEach((s,r)=>{let n=a("polyline",{"data-part":`r${r}`,class:"ring",stroke:s,fill:"none"}),i=a("title",{});i.textContent=`Rotate about ${bo[r]}`,n.append(i),e.append(n)}),Hf.forEach((s,r)=>{let n=a("g",{"data-part":`t${r}`,class:"arrow",stroke:s,fill:s}),i=a("title",{});i.textContent=`Move along ${bo[r]}`;let o=a("text",{stroke:"none"});o.textContent=bo[r],n.append(i,a("line",{}),a("circle",{r:6}),o),e.append(n)}),e.append(a("circle",{"data-part":"pivot",r:4,class:"pivot"})),e.append(a("text",{"data-part":"readout",class:"readout"})),e.addEventListener("pointerdown",l1),e.addEventListener("pointermove",d1),e.addEventListener("pointerup",u1),e.addEventListener("dblclick",s=>{!w?.move.node||w.move.node===Qt||(s.preventDefault(),s.stopPropagation(),ke("delete"))}),e.addEventListener("pointercancel",()=>Hh())}function l1(e){let t=e.target.closest?.("[data-part]")?.dataset.part;if(!w||!t||!w.gizmo||!/^[tr][012]$/.test(t))return;e.preventDefault(),e.stopPropagation();let a=$e.getBoundingClientRect(),s=Fn();if(s){if(t[0]!=="t")return;w.move.drag={kind:"node",handle:w.gizmo.handles[Number(t[1])],start:[e.clientX-a.left,e.clientY-a.top],startMm:s.worldMm,startPreview:w.nodePreview,matrix:Ta(pa(),za),changed:!1};try{$e.setPointerCapture(e.pointerId)}catch{}return}let r=Uo(),n=w.gizmo.limits;if(!(n&&!((t[0]==="t"?n.translate:n.rotate)||[]).includes(Number(t[1])))){w.move.drag={kind:t[0]==="t"?"translate":"rotate",snapDeg:n?.rotateSnapDeg??null,handle:w.gizmo.handles[Number(t[1])],start:[e.clientX-a.left,e.clientY-a.top],startPose:$t(w.move.preview??r.pose),hadPreview:!!w.move.preview,center:w.gizmo.center,pivot:w.gizmo.pivot,back:w.gizmo.back,changed:!1};try{$e.setPointerCapture(e.pointerId)}catch{}}}function d1(e){let t=w?.move.drag;if(!t)return;let a=$e.getBoundingClientRect(),s=[e.clientX-a.left,e.clientY-a.top],r=e.shiftKey;if(t.kind==="node"){let o=hr(bi([s[0]-t.start[0],s[1]-t.start[1]],t.handle.pxPerMm),r?ia.fineMm:ia.mm),c=Ee(t.startMm,pe(t.handle.axis,o));t.changed=t.changed||o!==0,w.nodePreview={harness:w.harnessPick.key,id:w.move.node,positionMm:t.matrix?ls(t.matrix,c):c},qf(`${o>=0?"+":""}${o.toFixed(r?1:0)} mm`,s),ht(),ke("preview");return}let n,i;if(t.kind==="translate"){let o=hr(bi([s[0]-t.start[0],s[1]-t.start[1]],t.handle.pxPerMm),r?ia.fineMm:ia.mm);n=Bl(t.startPose,t.handle.axis,o),i=`${o>=0?"+":""}${o.toFixed(r?1:0)} mm`}else{let o=Nl(t.handle.axis,t.back,Rl(t.center,t.start,s))*180/Math.PI,c=hr(o,t.snapDeg??(r?ia.fineDeg:ia.deg));n=Fl(t.startPose,t.handle.axis,c*Math.PI/180,t.pivot),i=`${c>=0?"+":""}${c.toFixed(0)}\xB0`}t.changed=t.changed||!zh(n,t.startPose),w.move.preview=$t(n),qf(i,s),Fs(),pt("preview")}function qf(e,t){let a=$e.querySelector('[data-part="readout"]');a.textContent=e,a.setAttribute("x",t[0]+14),a.setAttribute("y",t[1]-10)}function u1(e){let t=w?.move.drag;if(t){if($e.hasPointerCapture?.(e.pointerId)&&$e.releasePointerCapture(e.pointerId),w.move.drag=null,$e.querySelector('[data-part="readout"]').textContent="",t.kind==="node"){t.changed&&ke("commit");return}t.changed?pt("commit"):t.hadPreview||Go()}}function Hh(){let e=w?.move.drag;return e?e.kind==="route"||e.kind==="handle"?(w.move.drag=null,e.changed&&(w.nodePreview=e.kind==="handle"?e.startPreview:null,ht(),ke("cancel")),!0):(w.move.drag=null,e.kind==="node"?($e.querySelector('[data-part="readout"]').textContent="",w.nodePreview=e.startPreview,ht(),ke("cancel"),!0):(w.move.preview=e.hadPreview?e.startPose:null,$e.querySelector('[data-part="readout"]').textContent="",Fs(),pt("cancel"),!0)):!1}function f1(e,t){let a=w.move;if(t==="escape"){if(kt&&!kt.hidden)kt.hidden=!0;else if(!Hh()){if(!Yh())if(a.node)On(null);else if(a.preview)Go();else if(w.harnessPick)ba(null);else if(a.enabled)wn(!1);else return!1}return!0}if(t==="m"&&a.allowed)wn(!a.enabled);else if(t==="l"&&a.enabled)Vh(a.space==="world"?"local":"world");else if(t==="enter"&&a.node&&w.nodePreview&&!a.drag)ke("commit");else if(t==="enter"&&a.preview&&!a.drag)pt("commit");else if((t==="delete"||t==="backspace")&&a.node&&a.node!==Qt&&!a.drag)ke("delete");else if(e.key==="?")qh(!!kt?.hidden);else if(t==="a")U.frame(w.bounds||ha());else return!1;return!0}function qh(e){kt&&(kt.hidden=!e)}var Ss="http://www.w3.org/2000/svg";function h1(e){let t=e.occurrence?w.placements.get(e.occurrence):null;if(!t)return null;let a=e.reference&&t.board?t.board.scene.componentFeatures.get(e.reference):null,s=a?t.board.scene.features.get(Number(a.featureId))?.bounds:null;if(s)return pr(t.matrix,[0,1,2].map(n=>(s[n]+s[n+3])/2));let r=t.worldBounds;return r?[0,1,2].map(n=>(r[n]+r[n+3])/2):null}function b1(){let e=w.emphasisSets.length>0,t=[],a=[];for(let s of w.showHarnesses?w.harnesses:[]){let r=w.harnessLit.get(wt(s)),n=bu(s,r),i=new Map(s.ends.map(c=>[c.id,h1(c)]));i.set("hub",s.ends.length>2?pu([...i.values()]):null);let o=s.name||"Harness";for(let c of w.tubedHarnesses.has(wt(s))?[]:uu(s)){let l=hu(c,r),f=document.createElementNS(Ss,"line");f.setAttribute("class",`segment${l?" lit":e?" dim":""}`),l&&Object.assign(f.style,{stroke:l,color:l});let u=document.createElementNS(Ss,"title");u.textContent=`${o}: ${c.wires.size} wire${c.wires.size===1?"":"s"}`,f.append(u),a.push(f),t.push({node:f,kind:"line",a:i.get(c.a),b:i.get(c.b)})}for(let c of s.ends){let l=n.get(c.id),f=document.createElementNS(Ss,"circle");f.setAttribute("class",`end${l?" lit":e?" dim":""}`),f.setAttribute("r",l?"6":"4"),l&&(f.style.fill=l),a.push(f),t.push({node:f,kind:"dot",a:i.get(c.id)})}}pn.replaceChildren(...a),w.harnessDrawn={items:t,matrix:null}}function p1(){if(!pn||!Q)return;w.harnessDrawn||b1();let e=w.harnessDrawn;pn.toggleAttribute("hidden",!e.items.length);let t=Q.matrix.join(",");if(e.matrix===t)return;e.matrix=t;let a=j.getBoundingClientRect(),s=a.width/Math.max(1,j.width),r=a.height/Math.max(1,j.height),n=i=>{let o=i?es(Q.matrix,i,Q.viewport):null;return o?[o.x*s,o.y*r]:null};for(let i of e.items){let o=n(i.a),c=i.kind==="line"?n(i.b):null,l=i.kind==="line"?!!(o&&c):!!o;i.node.style.display=l?"":"none",l&&(i.kind==="line"?(i.node.setAttribute("x1",o[0].toFixed(1)),i.node.setAttribute("y1",o[1].toFixed(1)),i.node.setAttribute("x2",c[0].toFixed(1)),i.node.setAttribute("y2",c[1].toFixed(1))):(i.node.setAttribute("cx",o[0].toFixed(1)),i.node.setAttribute("cy",o[1].toFixed(1))))}}function Ko(e){let{right:t}=U.basis(),a=ea(e),s=ea(Ee(e,t));return a&&s?Math.hypot(s[0]-a[0],s[1]-a[1]):0}function Vo(e){if(!w?.tubes.length||!Q)return null;let t=j.getBoundingClientRect(),a=xu(w.tubes,[e.clientX-t.left,e.clientY-t.top],ea,Ko,w.move.route?10:5);return a?{tube:w.tubes[a.index],pointMm:a.pointMm}:null}function g1(e){let t=Vo(e);return t?(ba({key:t.tube.harness,segmentId:t.tube.segmentId,pointMm:t.pointMm}),!0):(ba(null),!1)}function m1(e){if(!w?.move.enabled||!w.move.route||e.button!==0||e.shiftKey)return!1;let t=Vo(e),a=t?w.harnesses.find(s=>wt(s)===t.tube.harness):null;return!t||!Cn(a)?!1:(ba({key:t.tube.harness,segmentId:t.tube.segmentId,pointMm:t.pointMm}),w.move.drag={kind:"route",start:[e.clientX,e.clientY],startMm:t.pointMm,nowMm:t.pointMm,pxPerMm:Ko(t.pointMm),basis:U.basis(),breakout:e.altKey,changed:!1,matrix:Ta(a,za),capture:j,harness:a,segment:{from:t.tube.from,to:t.tube.to,samplesMm:t.tube.samplesMm}},j.setPointerCapture(e.pointerId),!0)}function y1(e,t){On(t);let a=Fn();if(a){w.move.drag={kind:"handle",start:[e.clientX,e.clientY],startMm:a.worldMm,nowMm:a.worldMm,pxPerMm:Ko(a.worldMm),basis:U.basis(),changed:!1,startPreview:w.nodePreview,matrix:Ta(pa(),za),capture:Ca};try{Ca.setPointerCapture(e.pointerId)}catch{}}}function Wh(e){let t=w?.move.drag;if(!t||t.kind!=="route"&&t.kind!=="handle")return!1;let a=[e.clientX,e.clientY];if(!t.changed&&!vu(t.start,a))return!0;t.changed=!0,t.nowMm=wu(t.startMm,a[0]-t.start[0],a[1]-t.start[1],t.pxPerMm,t.basis);let s=t.matrix?ls(t.matrix,t.nowMm):[...t.nowMm];return t.kind==="handle"?w.nodePreview={harness:w.harnessPick.key,id:w.move.node,positionMm:s}:w.nodePreview={harness:w.harnessPick.key,insert:mu(t.harness.nodes??[],{kind:t.breakout?"breakout":"waypoint",segment:t.segment,atMm:t.startMm,positionMm:s,toWorldMm:r=>t.matrix?Ui(t.matrix,r):r})},ht(),ke("preview"),!0}function Xh(e){let t=w?.move.drag;if(!t||t.kind!=="route"&&t.kind!=="handle")return!1;if(t.capture?.hasPointerCapture?.(e.pointerId)&&t.capture.releasePointerCapture(e.pointerId),w.move.drag=null,!t.changed)return!0;if(t.kind==="handle")return ke("commit"),!0;let a=s=>t.matrix?ls(t.matrix,s):[...s];return ke("route-drag",{atMm:a(t.startMm),positionMm:a(t.nowMm),breakout:t.breakout}),!0}function x1(e){if(!w)return!1;if(e==null)return ba(null),!0;let t=wt({level:"",id:String(e)});if(w.harnessPick?.key===t)return!0;let a=w.tubes.find(r=>r.harness===t);if(!a)return!1;let s=Math.floor(a.samplesMm.length/6)*3;return ba({key:t,segmentId:a.segmentId,pointMm:a.samplesMm.slice(s,s+3)}),!0}function ba(e){if(!e&&!w.harnessPick)return;e&&(Oe(),Os({quiet:!0}));let t=e&&w.harnessPick?.key===e.key;w.harnessPick=e,t||(w.move.node=null,w.nodePreview=null),ht(),ke("select")}function pa(){let e=w?.harnessPick;return e?w.harnesses.find(t=>wt(t)===e.key)??null:null}function Cn(e){return!!e&&!e.level&&w.move.allowed}function Bn(){let e=pa();if(!e)return[];let t=zi([e],w.nodePreview,wt)[0],a=w.tubes.filter(s=>s.harness===w.harnessPick.key);return yu(t,a,Ta(e,za)??[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])}function Fn(){return w.move.node?Bn().find(e=>e.id===w.move.node)??null:null}function $h(){let e=pa();if(!e)return{harness:null,segment:null,pointMm:null,autoMm:null,node:null,editable:!1};let t=Ta(e,za),a=f=>t?ls(t,f):[...f],s=w.harnessPick,r=w.tubes.find(f=>f.harness===s.key&&f.segmentId===s.segmentId),n=[];for(let f=0;r&&f+2<r.samplesMm.length;f+=3)n.push(a(r.samplesMm.slice(f,f+3)));let o=Bn().find(f=>f.auto),c=Fn(),l=!!(c&&w.nodePreview?.id===c.id);return{harness:{id:e.id,level:e.level??null,name:e.name||""},segment:r?{id:r.segmentId,from:r.from,to:r.to,samplesMm:n}:null,pointMm:s.pointMm?a(s.pointMm):null,autoMm:o?a(o.worldMm):null,node:c?{id:c.id,kind:c.kind,auto:!!c.auto,pinned:c.pinned,positionMm:l?[...w.nodePreview.positionMm]:a(c.worldMm),unsaved:l}:null,editable:Cn(e)}}function ke(e,t={}){w.onHarness?.({phase:e,...$h(),...t})}function On(e){if(!w)return;let t=e&&Cn(pa())&&w.move.enabled?String(e):null;t!==w.move.node&&(w.move.node=t,w.move.drag=null,w.nodePreview&&w.nodePreview.id!==t&&(w.nodePreview=null,ht()),ke("target"))}function w1(e){!w?.move.node||!w.harnessPick||(w.nodePreview=e?{harness:w.harnessPick.key,id:w.move.node,positionMm:[...e]}:null,ht(),ke("preview"))}function Yh(){return w?.nodePreview?(w.nodePreview=null,w.move.drag=null,ht(),ke("cancel"),!0):!1}function v1(){if(!pa()){w.harnessPick&&(w.harnessPick=null,w.move.node=null,w.nodePreview=null,ke("select"));return}w.move.drag||(w.nodePreview=null),w.move.node&&!Bn().some(s=>s.id===w.move.node)&&(w.move.node=null);let t=w.harnessPick,a=w.tubes.filter(s=>s.harness===t.key);if(t.pointMm&&a.length&&!a.some(s=>s.segmentId===t.segmentId)){let s=r=>{let n=1/0;for(let i=0;i+2<r.samplesMm.length;i+=3)n=Math.min(n,Math.hypot(r.samplesMm[i]-t.pointMm[0],r.samplesMm[i+1]-t.pointMm[1],r.samplesMm[i+2]-t.pointMm[2]));return n};t.segmentId=a.reduce((r,n)=>s(n)<s(r)?n:r).segmentId}ke("sync")}function M1(){let e=Ca;if(!e)return;let t=w.move.enabled&&Q?pa():null,a=Cn(t)?Bn():[];if(e.toggleAttribute("hidden",!a.length),!a.length){e.firstChild&&e.replaceChildren();return}let s=new Map([...e.children].map(n=>[n.dataset.node,n])),r=new Set;for(let n of a){let i=ea(n.worldMm),o=s.get(n.id);if(!o){o=document.createElementNS(Ss,"circle"),o.dataset.node=n.id;let c=document.createElementNS(Ss,"title");o.append(c),o.addEventListener("pointerdown",l=>{l.preventDefault(),l.stopPropagation(),y1(l,o.dataset.node)}),o.addEventListener("dblclick",l=>{l.preventDefault(),l.stopPropagation(),On(o.dataset.node),w.move.node&&w.move.node!==Qt&&ke("delete")}),e.append(o)}r.add(n.id),o.setAttribute("class",`node ${n.kind}${n.auto?" auto":""}${n.pinned?" pinned":""}${n.id===w.move.node?" target":""}`),o.setAttribute("r",n.kind==="breakout"?"7":"5.5"),o.querySelector("title").textContent=n.auto?"Automatic breakout: drag to place it":n.kind==="breakout"?"Breakout":n.pinned?"Pinned waypoint":"Waypoint",o.style.display=i?"":"none",i&&(o.setAttribute("cx",i[0].toFixed(1)),o.setAttribute("cy",i[1].toFixed(1)))}for(let[n,i]of s)r.has(n)||i.remove()}function k1(){ua&&(w.labelsDrawn=null,ua.replaceChildren(...w.placed.map(e=>{let t=document.createElement("div");t.className=`scene-label${e.standIn?` stand-in ${e.standIn}`:""}`;let a=document.createElement("strong");a.textContent=e.occurrence.displayPath||e.occurrence.labels?.join(" / ")||e.occurrence.path,t.append(a);let s=e.standIn?Hr[e.standIn]?.label:"";if(s){let r=document.createElement("span");r.textContent=s,t.append(r)}return e.label=t,t})))}function E1(){if(!ua||!Q)return;if(ua.hidden=!w.showLabels,!w.showLabels){w.labelsDrawn=null;return}let e=j.getBoundingClientRect(),t=zo(),a=`${t}|${e.width}x${e.height}|${Array.prototype.join.call(Q.matrix,",")}`;if(w.labelsDrawn?.placed===w.placed&&w.labelsDrawn.key===a)return;w.labelsDrawn={placed:w.placed,key:a};let s=e.width/Math.max(1,j.width),r=e.height/Math.max(1,j.height);for(let n of w.placed){if(!n.label)continue;let[i,o,,c,l,f]=n.worldBounds,u=es(Q.matrix,[(i+c)/2,(o+l)/2,f],Q.viewport),g=u&&u.x>=0&&u.y>=0&&u.x<=j.width&&u.y<=j.height;n.label.hidden=!g,g&&(n.label.style.transform=`translate(${(u.x*s).toFixed(1)}px, ${(u.y*r).toFixed(1)}px) translate(-50%, -100%)`),n.label.classList.toggle("selected",t===n.occurrence.path)}}function S1(e,t=k){return hc(e,t.scene.copperLayers)}async function Jh(e=ve,t=k){let a=t.semanticGeometry.assets?.components_glb;if(!a||t.scene.componentTier!=="idle")return;t.scene.componentTier="loading";let s;try{s=await Il(new URL(a,location.href).toString(),{componentFeatures:t.scene.componentFeatures,fetchBytes:vn(t)})}catch(i){throw he(e)&&(t.scene.componentTier="idle"),i}if(!he(e)||!t.renderer)return;let r=Ec(s.models);if(await gh([...r.instanced.map(i=>i.primitive),...r.baked].reduce((i,o)=>i+mo(o),0)),!he(e)||!t.renderer)return;t.scene.componentTier="loaded",t.loadedBytes+=s.byteLength;for(let i of s.models)for(let o of i.placements){let c=t.scene.componentFeatures.get(o.designator);c&&A1(c.featureId,o.bounds,t)}w&&(w.harnessDrawn=null,w.labelsDrawn=null);for(let[i,o]of s.componentNodeCounts||[])t.scene.componentModelCounts.set(i,o);t.hiddenComponentRequest&&yb(t.hiddenComponentRequest);let n=i=>({kind:"component",layerId:0,material:i.material,color:i.material.baseColor});t.scene.componentEntries=[...t.renderer.addInstancedPrimitives(r.instanced.map(i=>({primitive:i.primitive,placements:i.placements,metadata:n(i.primitive)}))),...r.baked.map(i=>t.renderer.addPrimitive(i,n(i)))]}function vn(e=k){return e.assetCache?t=>e.assetCache.fetchBytes(t):void 0}function Qh(e,t=k){if(!t.renderer||e-(t.tiersCheckedAt||0)<250)return;t.tiersCheckedAt=e;let a=t.renderer.cullCounts,s=wv()&&a.board+a.body>0,r=t.renderer.identityOnly&&!t.deferComponents||!t.renderer.identityOnly&&(a.full>0||s);r&&(t.scene.componentsWantedAt=e),r&&t.scene.componentTier==="idle"&&t.semanticGeometry.assets?.components_glb&&Jh(ve,t).then(()=>{w&&t.renderer&&t.scene.componentTier==="loaded"&&ko(t.scene.runtimeBounds,t)}).catch(i=>console.warn("Failed to load components",i));let n=()=>w?w.scene.gpuMemoryBytes():t.renderer.gpuMemoryBytes();t.gpuBytes=n(),!(t.gpuBytes<=M.gpuBudgetBytes)&&(t.scene.componentTier==="loaded"&&e-t.scene.componentsWantedAt>uv&&(t.renderer.removeEntries(t.scene.componentEntries),t.scene.componentEntries=[],t.scene.componentTier="idle",t.scene.componentEvictions+=1,t.gpuBytes=n()),t.gpuBytes>M.gpuBudgetBytes&&vh(t.visibleTileIds||new Set,Math.max(0,t.residentTileGpuBytes-(t.gpuBytes-M.gpuBudgetBytes)),t))}var Wf=4e-4,Xf=5e-5,T1={baseColor:[.62,.7,.8,1],metallic:0,roughness:.8,emissive:[0,0,0]};function ko(e,t=k){if(!t.renderer)return;let a=new Map;for(let i of t.topology.physical_objects||[])i.kind==="footprint_body"&&i.designator&&i.bbox_mm?.length===4&&a.set(i.designator,i);let s=(e?.[5]??8e-4)+Xf,r=(e?.[2]??-8e-4)-Xf,n=[];for(let i of t.scene.componentFeatures.values()){let o=Number(i.featureId),c=t.scene.features.get(o),l=a.get(i.designator);if(!c||c.bounds||!l)continue;let[f,u,g,b]=l.bbox_mm.map(Number),h=String(l.layer||"").startsWith("B."),d=[f/1e3,-b/1e3,h?r-Wf:s,g/1e3,-u/1e3,h?r:s+Wf];c.bounds=d,c.placeholder=!0,n.push(I1(d,o))}if(n.length)for(let i of Ha(n))t.renderer.addPrimitive(i,{kind:"component",layerId:0,material:i.material,color:i.material.baseColor,opacityScale:.3,translucent:!0,placeholder:!0})}function I1([e,t,a,s,r,n],i){let o=[[[0,0,1],[[e,t,n],[s,t,n],[s,r,n],[e,r,n]]],[[0,0,-1],[[e,r,a],[s,r,a],[s,t,a],[e,t,a]]],[[1,0,0],[[s,t,a],[s,r,a],[s,r,n],[s,t,n]]],[[-1,0,0],[[e,r,a],[e,t,a],[e,t,n],[e,r,n]]],[[0,1,0],[[s,r,a],[e,r,a],[e,r,n],[s,r,n]]],[[0,-1,0],[[e,t,a],[s,t,a],[s,t,n],[e,t,n]]]],c=new Float32Array(72),l=new Float32Array(72),f=new Uint32Array(36);return o.forEach(([u,g],b)=>{g.forEach((d,x)=>{c.set(d,(b*4+x)*3),l.set(u,(b*4+x)*3)});let h=b*4;f.set([h,h+1,h+2,h,h+2,h+3],b*6)}),{position:c,normal:l,netId:new Uint32Array(24),objectFeatureId:new Uint32Array(24).fill(i),indices:f,material:T1,bounds:[e,t,a,s,r,n]}}function A1(e,t,a=k){let s=a.scene.features.get(Number(e));if(!s||!t.length)return;let r=[1/0,1/0,1/0,-1/0,-1/0,-1/0];for(let n=0;n<t.length;n+=3)r[0]=Math.min(r[0],t[n]),r[1]=Math.min(r[1],t[n+1]),r[2]=Math.min(r[2],t[n+2]),r[3]=Math.max(r[3],t[n]),r[4]=Math.max(r[4],t[n+1]),r[5]=Math.max(r[5],t[n+2]);s.bounds=s.bounds?[Math.min(s.bounds[0],r[0]),Math.min(s.bounds[1],r[1]),Math.min(s.bounds[2],r[2]),Math.max(s.bounds[3],r[3]),Math.max(s.bounds[4],r[4]),Math.max(s.bounds[5],r[5])]:r}function Pn(e,t=k){return lc(e,t.scene.copperLayers)}var _1=[.55,.35,.16,.78];function Zh(e=k){return uc(e.topology?.board?.stackup?.copper_finish)}function eb(e,t=k){return fc(e,t.scene.copperLayers)}var R1=.25;function ja(){return!M.realisticColors||M.mode==="layer"?0:1-ce(M.separation/R1,0,1)}function Ho(e,t=k){let a=eb(e,t)?Zh(t):Va.copper;return tb(Pn(e,t),a,ja())}function tb(e,t,a){return e.map((s,r)=>s+(t[r]-s)*a)}function N1(e,t=ve){if(t===ve&&w&&U){Kv(e,t);return}if(t!==ve||!k.renderer||!U)return;let a=performance.now(),s=Math.max(0,e-Zt);if(M.workspace==="schematic"&&N){Zt=e;let l=N.visiblePages(),f=Z?L1(l):[];N.setDomDetailPageIds(f.map(u=>u.id)),D.visiblePages=N.render(),Z?.syncWorldPages(f,N,{activeNetUid:D.activeNetUid}),Ab(),To(s,performance.now()-a),Io(e),_s(t);return}let r=Math.min(.05,(e-Zt)/1e3);Zt=e,U.update(r),k.renderer.resize();let n=nb();k.scene.copperRealism!==ja()&&Ls();for(let l of k.renderer.entries)l.layerOffset=n[l.layerId]||0;D1(e),fa=ib(e);let i=z1(e);Q={layerId:0,viewport:{x:0,y:0,width:j.width,height:j.height},matrix:U.matrix(j.width,j.height,M.mode==="layer"),lod:Sh(j.height,M.mode==="layer")},k.renderer.selectedOccurrence=M.selectedFeatureId||M.activeNetId?M.selectedOccurrence:-1,k.renderer.setInnerCopperMode(mh(!M.showBoard||M.separation>.001,Oa().size>0)),Me(e);let o=M.mode==="3d"?k.visible3dLayers:yh(),c={panels:[Q],activeNetId:M.activeNetId,selectedFeatureId:M.selectedFeatureId,time:e/1e3,layerOffsets:n,visibleLayers:o,showBoard:M.showBoard,showComponents:M.showComponents,showPaste:M.separation===0,componentOpacity:ce(1-M.separation/.1,0,1),boardOpacity:Oa().size?.34:1-M.separation*.72,isolateNet:M.isolateNet,compareMode:M.mode==="layer",compareOffsets:fa,layerAlphas:i,visibleTileIds:M.mode==="3d"?k.visibleTileIds:null};if(Ba=c,F1(e,c)){k.renderer.render(c),Tb(),fM();for(let l of Mn)l()}Qh(e),To(s,performance.now()-a),Io(e),_s(t)}var ab=1e3,ut={key:"",matrix:new Float32Array(16),tiles:null,at:0},Ba=null,se={canvas:null,context:null,depth:null,depthView:null,width:0,height:0},Ns=new Wr(3e3),Mn=new Set,cn={frames:0,cpuMs:0,gpuMs:0,lastTriangles:0},Eo={cullTiles:!0};function C1(e,t){let a=k.renderer;se.canvas||(se.canvas=document.createElement("canvas"),se.context=se.canvas.getContext("webgpu")),!(se.width>=e&&se.height>=t&&se.depth)&&(se.width=Math.max(se.width,e),se.height=Math.max(se.height,t),se.canvas.width=se.width,se.canvas.height=se.height,se.context.configure({device:a.device,format:a.format,alphaMode:"opaque"}),se.depth?.destroy(),se.depth=a.device.createTexture({label:"inset-depth",size:[se.width,se.height],format:a.depthFormat,sampleCount:a.sampleCount,usage:GPUTextureUsage.RENDER_ATTACHMENT}),se.depthView=se.depth.createView())}function sb(){return!!(!w&&k.renderer&&Ba&&M.workspace==="pcb")}function B1(e,t,a="inset"){if(!sb())return!1;let s=e.clientWidth,r=e.clientHeight;if(!s||!r)return!1;let n=performance.now(),i=Math.min(devicePixelRatio||1,2),o=Math.round(s*i),c=Math.round(r*i);C1(o,c);let l=At(k.scene.runtimeBounds),f=Qi(t,s,r,l,t.focusZ??0);Ns.record(a,f,n);let u={layerId:0,viewport:{x:0,y:0,width:o,height:c},matrix:f,lod:Ba.panels[0].lod},g=Ba.visibleTileIds;if(g&&Eo.cullTiles){let d=new Set;for(let x of g){let p=k.scene.tiles.get(x);p&&xn(p,f,null,0,k)&&d.add(x)}g=d}let b=k.renderer.renderInto({colorView:se.context.getCurrentTexture().createView(),depthView:se.depthView,width:se.width,height:se.height},u,{...Ba,panels:[u],visibleTileIds:g});return e.width!==o&&(e.width=o),e.height!==c&&(e.height=c),e.getContext("2d").drawImage(se.canvas,0,0,o,c,0,0,o,c),cn.frames+=1,cn.cpuMs+=performance.now()-n,cn.lastTriangles=b.triangles,!0}function F1(e,t){let a=t.panels[0].matrix,s=!1;for(let o=0;o<16;o+=1)if(a[o]!==ut.matrix[o]){s=!0;break}if(s)return ut.matrix.set(a),ut.key="",ut.at=e,!0;let r=[j.width,j.height,k.renderer.version,k.renderer.selectedOccurrence,M.workspace,M.mode,t.activeNetId,t.selectedFeatureId,t.showBoard,t.showComponents,t.showPaste,t.componentOpacity,t.boardOpacity,t.isolateNet,k.scene.layerZOffsetSignature,[...t.visibleLayers].join(","),[...t.compareOffsets].map(([o,c])=>`${o}:${c}`).join(";"),t.layerAlphas?[...t.layerAlphas].join(";"):""].join("|");return!!(t.activeNetId||t.selectedFeatureId||k.renderer.emphasizedNetIds.size)||r!==ut.key||!rb(t.visibleTileIds,ut.tiles)||e-ut.at>ab?(ut.key=r,ut.tiles=t.visibleTileIds,ut.at=e,!0):!1}var O1=1e3/30-2,ze={scene:null,key:"",matrix:new Float32Array(16),tiles:new Map,at:0};function P1(e,t,a){let s=Q.matrix,r=!1;for(let g=0;g<16;g+=1)if(s[g]!==ze.matrix[g]){r=!0;break}if(ze.scene!==w.scene&&(ze.scene=w.scene,r=!0),r)return ze.matrix.set(s),ze.key="",ze.at=e,!0;let n=[j.width,j.height,M.showBoard,M.showComponents,M.isolateNet,M.activeNetId,M.selectedFeatureId,M.selectedOccurrence,w.showLabels,a,ja(),zo(),w.scene.tubeVersion];for(let g of w.scene.renderers){let b=t.get(g);n.push(g.version,g.occurrenceCount,g.selectedOccurrence,g.dimCopper,g.standIn?g.boxColor.join(","):"",b?[...b.visibleLayers].join(","):"",b?.layerOffsets?Array.prototype.join.call(b.layerOffsets,","):"")}let i=n.join("|"),o=!1;for(let[g,b]of t)rb(b.visibleTileIds,ze.tiles.get(g))||(o=!0);let c=!!(a||M.activeNetId||M.selectedFeatureId),l=o||i!==ze.key,f=c&&e-ze.at>=O1;return l||f||e-ze.at>ab?(ze.key=i,ze.tiles=new Map([...t].map(([g,b])=>[g,b.visibleTileIds])),ze.at=e,!0):!1}function rb(e,t){if(!e||!t)return e===t;if(e.size!==t.size)return!1;for(let a of e)if(!t.has(a))return!1;return!0}function j1(e){if(!N||!e)return{widthPx:0,heightPx:0,sourcePxPerMm:0,area:0};let t=N.pagePixelWidth(e),a=e.heightMm/Math.max(1e-6,N.scale),s=N.pageSourcePixelsPerMm(e);return{widthPx:t,heightPx:a,sourcePxPerMm:s,area:t*a}}function L1(e){if(!Z||!N)return[];let t=e||[],a=Math.max(1,Fe.clientWidth*Fe.clientHeight);return t.map(n=>({page:n,...j1(n)})).filter(n=>n.widthPx>=760&&n.heightPx>=520&&n.area>=a*.36&&n.sourcePxPerMm>=1.25).sort((n,i)=>i.area-n.area).slice(0,1).map(n=>n.page)}function nb(e=k){let t=ha(e),a=Math.hypot((t[3]-t[0])*1e3,(t[4]-t[1])*1e3),s=M.separation*M.separation*ce(a*.12,8,25)/1e3,r=`${M.separation}:${s}:${e.scene.copperLayers.length}`;if(e.scene.layerZOffsetSignature===r)return e.scene.layerZOffsets;let n=e.scene.layerZOffsets;n.fill(0);let i=(e.scene.copperLayers.length-1)/2;return e.scene.copperLayers.forEach((o,c)=>{n[Number(o.id)]=(i-c)*s}),e.scene.layerZOffsetSignature=r,n}function ib(e){if(M.mode!=="layer")return Ae.key="3d",Ae.current.clear(),new Map;let t=k.scene.copperLayers.filter(x=>k.compareLayers.has(Number(x.id))),a=Math.max(1,t.length),s=j.width/Math.max(1,j.height),r=1;a===2?r=s>=1?2:1:a===3||a===4?r=2:a>4&&(r=Math.ceil(Math.sqrt(a*s)));let n=Math.ceil(a/r),i=ha(),o=i[3]-i[0],c=i[4]-i[1],l=o*1.18,f=c*1.22,u=t.map((x,p)=>{let m=p%r,y=Math.floor(p/r);return{layer:x,layerId:Number(x.id),column:m,row:y,offset:[(m-(r-1)/2)*l,((n-1)/2-y)*f,0]}}),g=`${r}x${n}:${u.map(x=>x.layerId).join(",")}`;if(g!==Ae.key){Ae.key=g,Ae.started=e,Ae.from=new Map(Ae.current);let x=r*o+(r-1)*(l-o),p=n*c+(n-1)*(f-c);U.targetFocus=[(i[0]+i[3])/2,(i[1]+i[4])/2,(i[2]+i[5])/2],U.targetOrthoScale=Math.max(p,x/s)*1.08}let b=ce((e-Ae.started)/420,0,1),h=1-Math.pow(1-b,3),d=new Map;for(let x of u){let p=Ae.from.get(x.layerId)||[0,0,0],m=x.offset.map((y,v)=>p[v]+(y-p[v])*h);d.set(x.layerId,m),Ae.current.set(x.layerId,m)}if(W.phase==="reveal")for(let x of W.previous)d.has(Number(x))||d.set(Number(x),W.previousOffsets.get(Number(x))||[0,0,0]);for(let x of[...Ae.current.keys()])u.some(p=>p.layerId===x)||Ae.current.delete(x);return d}function Ps(e){let t=new Set([...e].map(Number));if(!($f(t,k.desiredCompareLayers)&&W.phase!=="idle")){if(k.desiredCompareLayers=t,$f(t,k.compareLayers)){W.phase="idle",W.previous.clear(),W.target.clear();return}W.phase="preload",W.previous=new Set(k.compareLayers),W.target=new Set(t),W.previousOffsets=new Map(Ae.current),W.started=performance.now(),Me(W.started,{force:!0})}}function qo({snap:e=!0}={}){M.mode="layer";let t=Av();k.desiredCompareLayers=new Set(t),!k.compareLayers.size&&t.size&&(k.compareLayers=new Set(t)),W.phase="idle",W.previous.clear(),W.target.clear(),Ae.key="",U.setAxis("z",!1),k.renderer?.resize(),fa=ib(performance.now()),e&&U.snap(),Me(performance.now(),{force:!0})}function D1(e){if(!(M.mode!=="layer"||W.phase==="idle")){if(W.phase==="preload"){if(!U1(W.target)){Me(e,{force:!0});return}W.phase="reveal",W.started=e,W.previousOffsets=new Map(Ae.current),k.compareLayers=new Set(W.target),Ae.key="";return}W.phase==="reveal"&&e-W.started>=Zf&&(k.compareLayers=new Set(W.target),W.phase="idle",W.previous.clear(),W.target.clear(),W.previousOffsets.clear(),Me(e,{force:!0}))}}function U1(e,t=k){for(let a of t.scene.tiles.values())if(e.has(Number(a.layerId))&&!t.scene.residentTiles.has(a.id)&&!t.scene.failed.has(a.id))return!1;return!0}function z1(e){if(M.mode!=="layer"||W.phase!=="reveal")return null;let t=ce((e-W.started)/Zf,0,1),a=t*t*(3-2*t),s=new Map;for(let r of W.previous)s.set(Number(r),W.target.has(Number(r))?1:1-a);for(let r of W.target)s.set(Number(r),W.previous.has(Number(r))?1:a);return s}function $f(e,t){if(e.size!==t.size)return!1;for(let a of e)if(!t.has(a))return!1;return!0}function Wo(){if(M.workspace==="schematic"){K1();return}if(M.workspace==="bom"){G1();return}if(M.workspace==="stackup")return;Sn.textContent=k.viewerReadiness.stage==="semantic-ready"?"Semantic GLTF A0":"Prism staged 3D",Tn.textContent="Layers",In.textContent="Visibility and compare",Y('[data-panel="search"] .section-heading span').textContent="Nets, components and pins",Y('[data-panel="view"] .section-heading span').textContent="Camera and stackup";let e=`
    <div class="mode-toolbar">
      <button data-mode="layer">PCB</button>
      <button data-mode="3d">3D</button>
    </div>`;Na&&(Na.innerHTML=e),rt.innerHTML=`
    ${Na?"":e}
    <div class="layer-presets">
      <button data-preset="all">All</button><button data-preset="none">None</button>
      <button data-preset="outer">Outer</button><button data-preset="inner">Inner</button>
    </div>
    <div class="layer-list"></div>`,we.innerHTML=`
    <label class="control-field"><span>Search</span>
      <input id="entity-search" class="layer-select" type="search" placeholder="Net, component or pin">
      <div id="search-results" class="search-results"></div>
    </label>
    <div class="quick-actions">
      <button id="frame-selection">Frame</button>
      <button id="show-net-layers">Net layers</button>
      <button id="isolate-net" aria-keyshortcuts="I" title="Toggle isolated net view (I)">Isolate</button>
      <button id="clear-selection">Clear</button>
    </div>`,De.innerHTML=`
    <div class="toggle-list">
      <label class="toggle-row"><input id="show-board" type="checkbox"><span>Board substrate</span></label>
      <label class="toggle-row"><input id="show-components" type="checkbox"><span>Components</span></label>
    </div>
    <label class="control-field range-field"><span>Stackup separation</span>
      <input id="separation" type="range" min="0" max="1" step="0.002">
    </label>`,Pe(),Z1()}function G1(){Sn.textContent="BoM A0",Tn.textContent="Bill of Materials",In.textContent="Grouped procurement view",Y('[data-panel="search"] .section-heading span').textContent="Search inside the BoM table",Y('[data-panel="view"] .section-heading span').textContent="BoM actions";let e=nt?.payload?.counts||{};rt.innerHTML=`
    <div class="selection-properties">
      <div class="selection-property"><small>Rows</small><strong>${e.rows||0}</strong></div>
      <div class="selection-property"><small>Components</small><strong>${e.components||0}</strong></div>
      <div class="selection-property"><small>DNP</small><strong>${e.dnpComponents||0}</strong></div>
    </div>
    <div class="selection-section">
      <span class="selection-section-title">Columns</span>
      <div class="selection-empty">Primary procurement and thermal columns are shown first. Additional symbol and footprint metadata is available in the row detail panel.</div>
    </div>`,we.innerHTML=`
    <div class="selection-empty">Use the BoM search box in the main view. Reference chips update the shared PCB and schematic selection without changing workspaces.</div>
    <div class="quick-actions">
      <button id="clear-selection">Clear</button>
    </div>`,De.innerHTML=`
    <div class="selection-section">
      <span class="selection-section-title">Cross-probing</span>
      <div class="selection-table">
        <div class="selection-row"><span><strong>PCB/Schematic</strong></span><span>Select component</span><span>Highlights matching BoM row</span></div>
        <div class="selection-row"><span><strong>BoM reference</strong></span><span>Click chip</span><span>Holds component selection for PCB and schematic</span></div>
      </div>
    </div>`,we.querySelector("#clear-selection")?.addEventListener("click",Oe)}function K1(){Sn.textContent=Z?"Schematic SVG DOM":D.manifest?.schema==="prism.schematic_vector_a0"?"Schematic Vector A0":"Schematic World A0",Tn.textContent="Pages",In.textContent=`${D.pages.length} hierarchy instances`,Y('[data-panel="search"] .section-heading span').textContent="Pages, nets and components",Y('[data-panel="view"] .section-heading span').textContent="World navigation",rt.innerHTML=`
    <div class="layer-presets">
      <button data-page-action="world">Fit world</button>
      <button data-page-action="parent">Parent</button>
      <button data-page-action="previous">Previous</button>
      <button data-page-action="next">Next</button>
    </div>
    <div class="page-list">${D.pages.map(e=>`
      <button class="page-row ${e.id===M.selectedPageId?"active":""}" data-page="${e.id}">
        <span>${e.sheetNumber}</span>
        <strong>${K(e.name)}</strong>
        <small>L${e.depth}</small>
      </button>`).join("")}</div>`,we.innerHTML=`
    <label class="control-field"><span>Search</span>
      <input id="entity-search" class="layer-select" type="search" placeholder="Page, net or component">
      <div id="search-results" class="search-results"></div>
    </label>
    <div class="quick-actions">
      <button id="frame-selection">Frame</button>
      <button id="clear-selection">Clear</button>
    </div>`,De.innerHTML=`
    <div class="toggle-list">
      <label class="toggle-row"><input id="show-hierarchy" type="checkbox" checked><span>Hierarchy links</span></label>
    </div>
    <div class="selection-section">
      <span class="selection-section-title">Navigation</span>
      <div class="selection-table">
        <div class="selection-row"><span><strong>Home</strong></span><span>World</span><span>Frame every page</span></div>
        <div class="selection-row"><span><strong>[ / ]</strong></span><span>Pages</span><span>Previous or next instance</span></div>
        <div class="selection-row"><span><strong>Alt+Up</strong></span><span>Parent</span><span>Move up hierarchy</span></div>
      </div>
    </div>`,rt.querySelectorAll("[data-page]").forEach(e=>{e.addEventListener("click",()=>St(e.dataset.page,!0))}),rt.querySelectorAll("[data-page-action]").forEach(e=>{e.addEventListener("click",()=>ln(e.dataset.pageAction))}),we.querySelector("#entity-search").addEventListener("input",e=>{H1(e.target.value)}),we.querySelector("#frame-selection").addEventListener("click",lb),we.querySelector("#clear-selection").addEventListener("click",js),De.querySelector("#show-hierarchy").checked=N?.showHierarchy??!0,De.querySelector("#show-hierarchy").addEventListener("change",e=>{N.showHierarchy=e.target.checked})}function St(e,t){let a=D.byId.get(e);!a||!N||(M.selectedPageId=a.id,M.selectedSchematicFeature=null,N.selectedPageId=a.id,N.selectedFeatureId=0,bt.textContent=JSON.stringify(a,null,2),t&&N.framePage(a),rt.querySelectorAll("[data-page]").forEach(s=>{s.classList.toggle("active",s.dataset.page===a.id)}))}function ln(e){if(!N)return;if(e==="world"){N.frameWorld();return}let t=Math.max(0,D.pages.findIndex(s=>s.id===M.selectedPageId)),a=null;e==="previous"?a=D.pages[(t-1+D.pages.length)%D.pages.length]:e==="next"?a=D.pages[(t+1)%D.pages.length]:e==="parent"&&(a=D.byId.get(D.pages[t]?.parentId)),a&&St(a.id,!0)}function V1(e){if(!e||!N)return;if(js(),e.kind==="page"&&e.pageId){St(e.pageId,!0);return}if(e.kind!=="sheet")return;let t=D.pages.find(n=>n.sheetInstancePath===e.sheetInstancePath)||D.byId.get(M.selectedPageId),a=String(e.sheetFile||e.feature?.sheet_file||"").replace(/\\/g,"/"),s=String(e.sheetName||e.feature?.sheet_name||e.feature?.objectId||""),r=D.pages.find(n=>{if(t&&n.parentId&&n.parentId!==t.id)return!1;let i=String(n.sourcePath||"").replace(/\\/g,"/");return a&&i.endsWith(a)||s&&n.name===s})||D.pages.find(n=>{let i=String(n.sourcePath||"").replace(/\\/g,"/");return a&&i.endsWith(a)||s&&n.name===s});r&&St(r.id,!0)}function H1(e){let t=we.querySelector("#search-results"),a=e.trim().toLowerCase();if(!a){t.innerHTML="";return}let s=D.pages.filter(n=>`${n.name} ${n.sheetPath}`.toLowerCase().includes(a)).slice(0,8),r=k.scene.nets.filter(n=>String(n.name).toLowerCase().includes(a)).slice(0,8);t.innerHTML=[...s.map(n=>`<button data-page="${n.id}"><b>${K(n.name)}</b><span>Page ${n.sheetNumber}</span></button>`),...r.map(n=>`<button data-schematic-net="${n.id}"><b>${K(n.name)}</b><span>${(D.manifest.netToPages?.[n.uid]||[]).length} pages</span></button>`)].join(""),t.querySelectorAll("[data-page]").forEach(n=>{n.addEventListener("click",()=>St(n.dataset.page,!0))}),t.querySelectorAll("[data-schematic-net]").forEach(n=>{n.addEventListener("click",()=>ob(Number(n.dataset.schematicNet),!0))})}function ob(e,t){let a=k.scene.nets.find(r=>Number(r.id)===e);if(!a||!N)return;M.activeNetId=e,M.selectedFeatureId=0,M.selectedSchematicFeature=null,N.selectedFeatureId=0,N.selectedFeatureKey="",N.selectedSourceId="",D.activeNetUid=a.uid,N.activeNetUid=a.uid,Z?.setHighlightedNet(a.uid),bt.textContent=JSON.stringify(a,null,2),Je();let s=D.manifest.netToPages?.[a.uid]||[];t&&s.length&&St(s[0],!0)}function cb(e,t=null){let a=k.scene.nets.find(s=>s.uid===e);a&&(M.activeNetId=Number(a.id),D.activeNetUid=a.uid,N&&(N.activeNetUid=a.uid,N.selectedFeatureId=Number(t?.feature?.id||t?.featureId||0),N.selectedFeatureKey=t?.feature?.stableKey||t?.featureKey||"",N.selectedSourceId=t?.feature?.sourceId||t?.sourceId||""),Z?.setHighlightedNet(a.uid),t&&(M.selectedSchematicFeature={...t,pageId:M.selectedPageId}),bt.textContent=JSON.stringify(t?{...t,net:a}:a,null,2),Je())}function js(){M.activeNetId=0,M.selectedFeatureId=0,M.selectedSchematicFeature=null,D.activeNetUid="",N&&(N.activeNetUid="",N.selectedFeatureId=0,N.selectedFeatureKey="",N.selectedSourceId=""),Z?.setSelection(null),Z?.setHighlightedNet(""),bt.textContent="No object selected",Je()}function lb(){let e=D.byId.get(M.selectedPageId);e?N.framePage(e):N.frameWorld()}function q1(e){M.selectedPageId=e.sheetInstancePath&&D.pages.find(s=>s.sheetInstancePath===e.sheetInstancePath)?.id||M.selectedPageId,M.selectedFeatureId=0,M.selectedSchematicFeature={...e,pageId:M.selectedPageId},e.anchor&&(M.selectionAnchor=e.anchor),N&&(N.selectedPageId=M.selectedPageId,N.selectedFeatureId=Number(e.feature?.id||0));let t=e.netUid?k.scene.nets.find(s=>s.uid===e.netUid):null,a=e.reference?k.scene.componentFeatures.get(e.reference):null;a&&(M.selectedFeatureId=Number(a.featureId||0),nt?.setSelectionByReference(e.reference,{scroll:M.workspace==="bom"})),bt.textContent=JSON.stringify({...e,net:t,component:a},null,2),Je()}function W1(e){let{page:t,feature:a}=e;if(!a){M.selectedSchematicFeature=null,N.selectedFeatureId=0,St(t.id,!1),Je();return}let s=Number(a.id||0);if(M.selectedPageId=t.id,N.selectedPageId=t.id,N.selectedFeatureId=s,M.selectedSchematicFeature={...a,pageId:t.id},M.selectionAnchor=null,a.netUid){let r=k.scene.nets.find(n=>n.uid===a.netUid);if(r){ob(Number(r.id),!1),M.selectedSchematicFeature={...a,pageId:t.id},N.selectedFeatureId=s;return}}if(a.reference){let r=k.scene.componentFeatures.get(a.reference);if(r){ma(Number(r.featureId),!1),M.selectedSchematicFeature={...a,pageId:t.id},N.selectedFeatureId=s;return}}M.activeNetId=0,M.selectedFeatureId=0,N.activeNetUid="",bt.textContent=JSON.stringify({page:t.name,...a},null,2),Je()}function ga(){let e=M.isolateNet,t=we?.querySelector?.("#isolate-net");t?.classList.toggle("active",e),t?.setAttribute("aria-pressed",String(e));let a=te?.querySelector?.("[data-action=isolate]");a?.classList.toggle("active",e),a?.setAttribute("aria-pressed",String(e));let s=De?.querySelector?.("#show-board");s&&(s.checked=M.showBoard);let r=De?.querySelector?.("#show-components");r&&(r.checked=M.showComponents),Tt()}function X1(){let e=new Set;for(let t of Oa())for(let a of Xo(t))e.add(a);return e}function Xo(e,t=k){let a=new Set,s=t.scene.nets.find(n=>Number(n.id)===Number(e)),r=new Set(t.scene.copperLayers.map(n=>Number(n.id)));for(let n of Object.keys(s?.layerBoundsMm||{})){let i=Number(n);r.has(i)&&a.add(i)}if(!a.size){let n=new Map(t.scene.copperLayers.map(i=>[i.name,Number(i.id)]));for(let i of s?.metrics?.layers||[]){let o=n.get(i);o!=null&&a.add(o)}}if(a.size)return a;for(let n of t.scene.tiles.values())kh(n,e)&&a.add(Number(n.layerId));return a}function La(){if(w){for(let t of Ye())Nn(t);return}let e=X1();e.size&&(k.visible3dLayers=new Set(e),M.mode==="layer"?Ps(e):(k.compareLayers=new Set(e),k.desiredCompareLayers=new Set(e)),Me(performance.now(),{force:!0}))}function Ga(e){let t=!!(e&&Ua()),a=M.isolateNet;if(t&&!M.isolateNet&&!w&&(k.preIsolation3dLayers=new Set(k.visible3dLayers),k.preIsolationCompareLayers=new Set(k.desiredCompareLayers.size?k.desiredCompareLayers:k.compareLayers)),M.isolateNet=t,w)La();else if(M.isolateNet)La();else if(k.preIsolation3dLayers||k.preIsolationCompareLayers){if(k.preIsolation3dLayers&&(k.visible3dLayers=new Set(k.preIsolation3dLayers)),k.preIsolationCompareLayers){let s=new Set(k.preIsolationCompareLayers);M.mode==="layer"?Ps(s):(k.compareLayers=s,k.desiredCompareLayers=new Set(s))}k.preIsolation3dLayers=null,k.preIsolationCompareLayers=null,Me(performance.now(),{force:!0})}t&&!a?(M.preIsolationShowBoard=M.showBoard,M.showBoard=!1):!t&&a&&(typeof M.preIsolationShowBoard=="boolean"&&(M.showBoard=M.preIsolationShowBoard),M.preIsolationShowBoard=null),ga(),Pe()}function Pe(){(Na||rt).querySelectorAll("[data-mode]").forEach(a=>{let s=a.dataset.mode===M.mode;a.classList.toggle("active",s),a.setAttribute("aria-pressed",String(s))}),De.querySelector("#show-board").checked=M.showBoard,De.querySelector("#show-components").checked=M.showComponents,De.querySelector("#separation").value=M.separation;let e=rt.querySelector(".layer-list"),t=M.mode==="3d"?k.visible3dLayers:k.desiredCompareLayers;e.innerHTML=k.scene.copperLayers.map((a,s)=>`
    <label class="layer-row">
      <input type="checkbox" data-layer="${a.id}" ${t.has(Number(a.id))?"checked":""}>
      <span class="swatch" style="background:${jn(Pn(a))}"></span>
      <span>${K(a.name)}</span><small>${s+1}</small>
    </label>`).join(""),e.querySelectorAll("[data-layer]").forEach(a=>a.addEventListener("change",()=>{ub(Number(a.dataset.layer),a.checked)})),ga()}function db(e){e==="layer"?qo():(M.mode="3d",U.frame(ha()),U.snap(),k.visibleTileIds=new Set,Me(performance.now(),{force:!0})),Pe()}function ub(e,t,a=null){if(w){let s=Number(e);Lo(a==null?null:[a],r=>t?r.delete(s):r.add(s));return}if(M.mode==="3d")t?k.visible3dLayers.add(e):k.visible3dLayers.delete(e),Me(performance.now(),{force:!0});else{let s=new Set(k.desiredCompareLayers);t?s.add(e):s.delete(e),Ps(s)}Pe()}function fb(e,t=null){if(w){Lo(t==null?null:[t],(s,r)=>{let n=r?.scene.copperLayers||[];s.clear(),n.forEach((i,o)=>{e==="all"||e==="outer"&&(o===0||o===n.length-1)||e==="inner"&&o>0&&o<n.length-1||s.add(Number(i.id))})});return}let a=M.mode==="3d"?k.visible3dLayers:new Set;a.clear();for(let[s,r]of k.scene.copperLayers.entries())(e==="all"||e==="outer"&&(s===0||s===k.scene.copperLayers.length-1)||e==="inner"&&s>0&&s<k.scene.copperLayers.length-1)&&a.add(Number(r.id));M.mode==="3d"?Me(performance.now(),{force:!0}):Ps(a),Pe()}function hb(e){M.showBoard=!!e,M.savedShowBoard=M.showBoard,M.showBoard&&M.isolateNet?Ga(!1):ga()}function bb(e){M.showComponents=!!e,M.savedShowComponents=M.showComponents,ga()}function $1(e){M.showPlaceholders=!!e;for(let t of w?Ye():[k])t.renderer?.setPlaceholdersVisible(M.showPlaceholders);Tt()}function Y1(){let e=new Set((k.scene?.layers||[]).map(s=>String(s.name))),t=new Set(M.hiddenBoardLayers),a=s=>{let r=(k.renderer?.entries||[]).find(i=>i.kind==="board"&&i.boardRole===s),n=r?.color||r?.material?.baseColor;return n?jn(n):lv[s]};return cv.filter(s=>!e.size||e.has(s.name)).map(s=>({...s,color:a(s.role),visible:!t.has(`${s.role}:${s.side}`)}))}function J1(e,t,a){let s=`${e}:${t}`,r=new Set(M.hiddenBoardLayers);a?r.delete(s):r.add(s),M.hiddenBoardLayers=[...r];for(let n of w?Ye():[k])n.renderer?.setHiddenBoardLayers(M.hiddenBoardLayers);Tt()}function Q1(e){M.realisticColors=!!e,Ls(),Tt()}function Ls(e=k){if(!e.renderer)return;let t=new Map(e.scene.layers.map(a=>[Number(a.id),a]));for(let a of e.renderer.entries)a.kind==="copper"&&(a.color=Ho(t.get(Number(a.layerId)),e));e.renderer.setBarrelColor(tb(_1,[...Zh(e).slice(0,3),.78],ja())),e.scene.copperRealism=ja()}function pb(e,t=null){if(w){Jv(ce(Number(e)||0,0,1),t);return}M.separation=ce(Number(e)||0,0,1),Tt()}function Z1(){(Na||rt).querySelectorAll("[data-mode]").forEach(t=>t.addEventListener("click",()=>{db(t.dataset.mode)})),rt.querySelectorAll("[data-preset]").forEach(t=>t.addEventListener("click",()=>{fb(t.dataset.preset)})),De.querySelector("#show-board").addEventListener("change",t=>{hb(t.target.checked)}),De.querySelector("#show-components").addEventListener("change",t=>{bb(t.target.checked)}),De.querySelector("#separation").addEventListener("input",t=>{pb(t.target.value)}),we.querySelector("#clear-selection").addEventListener("click",Oe),we.querySelector("#isolate-net").addEventListener("click",()=>{Ga(!M.isolateNet)}),we.querySelector("#frame-selection").addEventListener("click",Zo),we.querySelector("#show-net-layers").addEventListener("click",$o);let e=we.querySelector("#entity-search");e.addEventListener("input",()=>mb(e.value))}function gb(){da(".rail-tab").forEach(e=>e.addEventListener("click",()=>{let t=e.dataset.tab,a=M.activeTab===t&&!Et.classList.contains("panel-collapsed");M.activeTab=t,Et.classList.toggle("panel-collapsed",a),da(".rail-tab").forEach(s=>{s.classList.toggle("active",!a&&s.dataset.tab===t)}),da(".tab-panel").forEach(s=>{s.classList.toggle("active",!a&&s.dataset.panel===t)})}))}function $o(){if(w){Xv();return}let e=k.scene.nets.find(s=>Number(s.id)===M.activeNetId);if(!e)return;let t=new Set(e.metrics?.layers||[]),a=M.mode==="3d"?k.visible3dLayers:new Set;a.clear();for(let s of k.scene.copperLayers)t.has(s.name)&&a.add(Number(s.id));M.mode==="3d"?Me(performance.now(),{force:!0}):Ps(a),Pe()}function mb(e){let t=we.querySelector("#search-results"),a=e.trim().toLowerCase();if(!a){t.innerHTML="";return}let s=k.scene.nets.filter(n=>String(n.name).toLowerCase().includes(a)).slice(0,8),r=[...k.scene.componentFeatures.values()].filter(n=>!k.hiddenComponents.has(String(n.designator||""))&&`${n.designator} ${n.value} ${n.footprint}`.toLowerCase().includes(a)).slice(0,6);t.innerHTML=[...s.map(n=>`<button data-net="${n.id}"><b>${K(n.name)}</b><span>${K(n.netClass||"")}</span></button>`),...r.map(n=>`<button data-feature="${n.featureId}"><b>${K(n.designator)}</b><span>${K(n.value)}</span></button>`)].join(""),t.querySelectorAll("[data-net]").forEach(n=>{n.addEventListener("click",()=>Yo(Number(n.dataset.net),!0))}),t.querySelectorAll("[data-feature]").forEach(n=>{n.addEventListener("click",()=>ma(Number(n.dataset.feature),!0))})}function Yo(e,t){t&&(M.selectionAnchor=null),M.activeNetId=e,M.selectedFeatureId=0;let a=k.scene.nets.find(s=>Number(s.id)===e);M.workspace==="schematic"&&a&&N&&(D.activeNetUid=a.uid,N.activeNetUid=a.uid),Co(),bt.textContent=JSON.stringify(a||{},null,2),Je(),M.isolateNet&&La(),t&&a?.boundsMm&&U.frame(No(qa(a.boundsMm))),Me(performance.now(),{force:!0}),_n(uh(a))}function ma(e,t=!1){let a=k.scene.features.get(e);if(a?.kind==="component"&&$s(Da(a),k.hiddenComponents))return;t&&(M.selectionAnchor=null),M.selectedFeatureId=e,M.activeNetId=Number(a?.netId||0);let s=Da(a);s&&nt?.setSelectionByReference(s,{scroll:M.workspace==="bom"});let r=fh(a);r?.kind==="net"?Co():hh(),bt.textContent=a?JSON.stringify(a,null,2):"No object selected",Je(),M.isolateNet&&M.activeNetId&&La(),t&&a?.bounds&&Qo(a),Me(performance.now(),{force:!0}),_n(r)}function Jo(e,t=!1){if($s(e,k.hiddenComponents))return;let a=k.scene.componentFeatures.get(e);if(nt?.setSelectionByReference(e,{scroll:M.workspace==="bom"}),!a?.featureId)return;hh(),ma(Number(a.featureId),!1);let s=tM(e);if(s){let{page:r,feature:n}=s;M.selectedPageId=r.id,M.selectedSchematicFeature={...n,pageId:r.id},N&&(N.selectedPageId=r.id,N.selectedFeatureId=Number(n.id||0)),Z?.setSelection?.({kind:"component",featureKey:n.stableKey||"",sheetInstancePath:n.sheetInstancePath||r.sheetInstancePath||"",sourceId:n.sourceId||n.uuid||"",reference:e,feature:n,pageId:r.id}),t&&M.workspace==="schematic"&&(St(r.id,!0),Z?.frameSelection?.())}if(t&&M.workspace==="pcb"){let r=k.scene.features.get(Number(a.featureId));r?.bounds&&Qo(r,!0)}Je()}function Da(e){return e?.designator||e?.reference||e?.componentDesignator||""}function eM(e=k){return bc(e.scene.manifest?.components||[],e.scene.componentModelCounts)}function yb(e){k.hiddenComponentRequest=e;let t=pc(e,eM());k.hiddenComponents=t.hiddenReferences,k.renderer?.setHiddenFeatureIds(t.hiddenFeatureIds),t.ambiguous.length&&console.warn(`[prism-semantic-viewer] keeping ambiguous components visible: ${t.ambiguous.join(", ")}`),t.unknown.length&&console.warn(`[prism-semantic-viewer] ignoring unknown components: ${t.unknown.join(", ")}`);let a=Da(k.scene.features.get(M.selectedFeatureId));$s(a,k.hiddenComponents)&&Oe();let s=we.querySelector("input");return s?.value&&mb(s.value),t}function Qo(e,t=!1){if(!e?.bounds)return;let a=No(e.bounds);if(t||e.kind==="component"||!!Da(e)){let n=(a[2]+a[5])*.5<0,i=U.isBelow();n!==i&&U.setAxis("z",n)}U.frame(a)}function tM(e){if(!e||!N?.featuresByPage)return null;let t=D.byId.get(M.selectedPageId),a=[...t?[t]:[],...(D.pages||[]).filter(r=>r.id!==t?.id)],s=r=>{let n=String(r.kind||"").toLowerCase();return n==="component"||n==="symbol_body"||n==="symbol_instance"?0:n==="symbol_reference"?1:n.startsWith("pin")?2:3};for(let r of a){let n=(N.featuresByPage[r.id]||[]).filter(i=>String(i.reference||i.designator||i.componentDesignator||"")===e).sort((i,o)=>s(i)-s(o));if(n.length)return{page:r,feature:n[0]}}return null}function Oe(){M.activeNetId=0,M.selectedFeatureId=0,w&&(w.boardSelected=!1,w.standInKey=null),M.selectedSchematicFeature=null,M.selectionAnchor=null;let e=Ua(),t=M.isolateNet;t&&!e?Ga(!1):e?t&&La():M.isolateNet=!1,e||bh(),D.activeNetUid="",N&&(N.activeNetUid=""),Z?.setSelection(null),Z?.setHighlightedNet(""),bt.textContent="No object selected",nt?.clearSelection?.(),Je(),_n(null)}function dn(e){return`<div class="selection-properties">${e.map(([t,a])=>`
    <div class="selection-property">
      <small>${K(t)}</small>
      <strong title="${K(String(a))}">${K(String(a))}</strong>
    </div>`).join("")}</div>`}function kn(e,t,a){return`
    <div class="selection-card-head">
      <span class="selection-card-accent" style="background:${a}"></span>
      <div class="selection-card-drag-handle" title="Drag to move card">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
          <circle cx="2" cy="2" r="1"/>
          <circle cx="6" cy="2" r="1"/>
          <circle cx="10" cy="2" r="1"/>
          <circle cx="2" cy="6" r="1"/>
          <circle cx="6" cy="6" r="1"/>
          <circle cx="10" cy="6" r="1"/>
          <circle cx="2" cy="10" r="1"/>
          <circle cx="6" cy="10" r="1"/>
          <circle cx="10" cy="10" r="1"/>
        </svg>
      </div>
      <div class="selection-card-title"><small>${K(e)}</small><strong>${K(t)}</strong></div>
      <button class="selection-card-close" type="button" aria-label="Clear selection">&times;</button>
    </div>`}function aM(e){let a=(k.topology.net_details?.[e.uid]||{}).terminals||[],s=e.metrics||{},r=Number(s.traceLengthMm||0).toFixed(2),n=s.objectCounts?.via||0,i=a.length,c=/^(VCC|VDD|GND|3V3|5V|12V|VIN|POWER)/i.test(e.name)?"#10b981":"#8b5cf6",l=e.netClass||"Default",f=a.length?a.map(u=>`
      <div class="selection-row pin-row-interactive" data-ref="${K(u.designator)}" data-pin="${K(u.pin)}">
        <span class="refdes-col"><strong>${K(u.designator)}</strong></span>
        <span class="pin-col">Pin ${K(u.pin)}</span>
        <span class="val-col" title="${K(u.value||"")}">${K(u.value||"-")}</span>
      </div>`).join(""):'<div class="selection-empty">No connected pin metadata is available.</div>';return`
    ${kn("Net",e.name,c)}
    <div class="selection-net-dashboard">
      <div class="net-metric-grid">
        <div class="metric-card">
          <small>Length</small>
          <strong>${r} <span class="unit">mm</span></strong>
        </div>
        <div class="metric-card">
          <small>Vias</small>
          <strong>${n}</strong>
        </div>
        <div class="metric-card">
          <small>Pins</small>
          <strong>${i}</strong>
        </div>
        <div class="metric-card">
          <small>Class</small>
          <strong title="${K(l)}">${K(l)}</strong>
        </div>
      </div>
      
      <div class="selection-section">
        <span class="selection-section-title">Layers</span>
        <div class="net-layers-badges">
          ${(s.layers||[]).length?s.layers.map(u=>`<span class="layer-badge">${K(u)}</span>`).join(""):'<span class="layer-badge unknown">None</span>'}
        </div>
      </div>

      <div class="selection-section">
        <span class="selection-section-title">Connected Pins</span>
        <div class="selection-table compact-scroll" style="max-height: 120px;">
          ${f}
        </div>
      </div>
    </div>`}function sM(e,t=null){let a=_o(e.designator),s=a?a.value:e.value||"Not specified",r=a?a.footprint:e.footprint||"Not specified",n=a?.parameters||{},i=n.Manufacturer||n.Mfr||"",o=n["Manufacturer Part Number"]||n.MPN||n["Part Number"]||"",c=n.kicad_dnp==="true"||n.DNP==="true"||n.kicad_in_bom==="false",l="";(i||o)&&(l=`
      <div class="selection-section">
        <span class="selection-section-title">Component details</span>
        <div class="selection-table">
          <div class="selection-row">
            <span><strong>Manufacturer</strong></span>
            <span title="${K(i)}">${K(i||"-")}</span>
          </div>
          <div class="selection-row">
            <span><strong>Part Number</strong></span>
            <span title="${K(o)}">${K(o||"-")}</span>
          </div>
        </div>
      </div>`);let f="";return t&&(f=`
      <div class="selection-section">
        <span class="selection-section-title">Selected Pin</span>
        <div class="selection-table">
          <div class="selection-row">
            <span><strong>Pin</strong></span>
            <span>Pin ${K(t.pinNumber||t.pin||"")}</span>
            <span title="${K(t.pinName||"")}">${K(t.pinName||"No name")}</span>
          </div>
          <div class="selection-row">
            <span><strong>Net</strong></span>
            <span class="net-ref-interactive" data-net-name="${K(t.netName||"")}">${K(t.netName||"Not connected")}</span>
          </div>
        </div>
      </div>`),`
    ${kn("Component",e.designator||"Unknown","#3b82f6")}
    <div class="selection-component-dashboard">
      ${c?'<div class="dnp-banner" style="background:#b45309;color:#fff;font-size:9px;font-weight:750;text-align:center;padding:3px;margin-bottom:8px;border-radius:2px;text-transform:uppercase;letter-spacing:0.05em;">DNP (Do Not Populate)</div>':""}
      ${dn([["Value",s],["Footprint",r.split(":").pop()||r]])}
      ${l}
      ${f}
    </div>`}function rM(e,t){let a=String(e.kind||"").toLowerCase(),s=a.startsWith("pin");if(a==="component"||a.includes("symbol"))return`
      ${kn("Component",e.reference||e.componentDesignator||"Unknown","#3b82f6")}
      ${dn([["Value",e.value||e.componentValue||"Not specified"],["Footprint",e.componentFootprint||e.footprint||"Not specified"],["Library",e.libraryRef||"Not specified"],["UID",e.componentUid||e.uuid||e.sourceId||"Not resolved"]])}
      <div class="selection-section">
        <span class="selection-section-title">Schematic placement</span>
        ${dn([["Page",t?.name||"Unknown"],["Sheet",e.sheetInstancePath||"/"]])}
      </div>`;let n=s?[["Symbol",e.reference||e.designator||"Unknown"],["Value",e.value||e.componentValue||"Not specified"],["Pin",`${e.pinNumber||"-"}${e.pinName?` ${e.pinName}`:""}`],["Net",e.netName||"Not connected"],["PCB Pad",e.pcbPadId||"Not resolved"],["Component UID",e.componentUid||"Not resolved"]]:[["Page",t?.name||"Unknown"],["Kind",e.kind.replaceAll("_"," ")],["Net",e.netName||"Not connected"]];return`
    ${kn(e.kind.replaceAll("_"," "),e.pinName||e.reference||e.designator||e.text||e.netName||"Schematic object","#3b82f6")}
    ${dn(n)}
    <div class="selection-section">
      <span class="selection-section-title">Source identity</span>
      <div class="selection-table">
        <div class="selection-row">
          <span><strong>${s?"Pin UUID":"UUID"}</strong></span>
          <span title="${K(e.uuid||e.sourceId||"")}">${K(e.uuid||e.sourceId||"-")}</span>
          <span title="${K(e.objectId||"")}">${K(e.objectId||"No object ID")}</span>
        </div>
        <div class="selection-row">
          <span><strong>Sheet</strong></span>
          <span>${K(t?.name||"Unknown")}</span>
          <span title="${K(e.sheetInstancePath||"")}">${K(e.sheetInstancePath||"/")}</span>
        </div>
      </div>
    </div>`}function Je(){if(Tt(),M.workspace==="bom"){te.hidden=!0,te.innerHTML="";return}let e=k.scene.features.get(M.selectedFeatureId),t=e?.kind==="component"?e:null,a=M.workspace==="schematic"?M.selectedSchematicFeature:null,s=a?D.byId.get(a.pageId):null,r=M.activeNetId?k.scene.nets.find(u=>Number(u.id)===M.activeNetId):null;if(!r&&a&&(a.netUid?r=k.scene.nets.find(u=>u.uid===a.netUid):a.netName&&(r=sa(k.scene.nets,a.netName))),!t&&a){let u=a.reference||a.componentDesignator||a.designator;u&&(t=k.scene.componentFeatures.get(u)||{designator:u})}if(!t&&!r&&!a){te.hidden=!0,te.innerHTML="";return}let n="";if(r)n=aM(r);else if(t){let u=a?.kind?.startsWith("pin")?a:null;n=sM(t,u)}else a&&(n=rM(a,s));te.innerHTML=`
    ${n}
    <div class="selection-card-actions">
      ${r?`
        <button type="button" data-action="isolate" aria-keyshortcuts="I" title="Toggle isolated net view (I)" class="${M.isolateNet?"active":""}">Isolate</button>
        <button type="button" data-action="net-layers">Layers</button>
      `:""}
      <button type="button" data-action="frame">Frame selection</button>
    </div>`,te.hidden=!1;let i=M.workspace==="schematic"?Fe:j,o=M.selectionAnchor,c=te.offsetWidth||360,l=te.offsetHeight||330;if(o){let u=Math.max(16,i.clientWidth-c-24),g=Math.max(16,i.clientHeight-l-24);te.style.left=`${ce(o.x+18,16,u)}px`,te.style.top=`${ce(o.y+18,16,g)}px`}else te.style.left="20px",te.style.top="20px";if(te.querySelector(".selection-card-close").addEventListener("click",Oe),te.querySelector("[data-action=frame]").addEventListener("click",Zo),r){let u=te.querySelector("[data-action=isolate]");u&&u.addEventListener("click",()=>{Ga(!M.isolateNet)});let g=te.querySelector("[data-action=net-layers]");g&&g.addEventListener("click",$o),te.querySelectorAll(".pin-row-interactive").forEach(b=>{b.addEventListener("click",()=>{let h=b.dataset.ref,d=b.dataset.pin;if(!h)return;let m=((k.topology.net_details?.[r.uid]||{}).terminals||[]).find(v=>v.designator===h&&v.pin===d),y=hv(m);y?ma(y,!0):Jo(h,!0)})})}let f=te.querySelector(".net-ref-interactive");f&&f.addEventListener("click",()=>{let u=f.dataset.netName;if(!u)return;let g=sa(k.scene.nets,u);g&&Yo(Number(g.id),!0)})}function Zo(){if(M.workspace==="schematic"){lb();return}let e=k.scene.features.get(M.selectedFeatureId);if(e?.bounds)Qo(e);else{let t=k.scene.nets.find(a=>Number(a.id)===M.activeNetId);t?.boundsMm&&U.frame(No(qa(t.boundsMm)))}}function xb(){j.addEventListener("contextmenu",e=>e.preventDefault()),j.addEventListener("pointerdown",e=>{w&&(w.framed=!0),!(w&&m1(e))&&(M.dragging=!0,M.lastX=e.clientX,M.lastY=e.clientY,M.pointerStartX=e.clientX,M.pointerStartY=e.clientY,M.dragMode=M.mode==="layer"||e.shiftKey||e.button!==0?"pan":"orbit",j.setPointerCapture(e.pointerId))}),j.addEventListener("pointermove",e=>{if(w&&Wh(e)||(w?.move.route&&!M.dragging&&(j.style.cursor=Vo(e)?"crosshair":""),!M.dragging))return;let t=e.clientX-M.lastX,a=e.clientY-M.lastY;M.lastX=e.clientX,M.lastY=e.clientY,M.dragMode==="pan"?U.pan(t,a,j.clientHeight,M.mode==="layer"):U.orbit(t,a)}),j.addEventListener("pointerup",async e=>{w&&Xh(e)||(M.dragging=!1,j.releasePointerCapture(e.pointerId),!(Math.hypot(e.clientX-M.pointerStartX,e.clientY-M.pointerStartY)>=3)&&(e.button===0?await Jf(e):e.button===2&&await cM(e)))}),j.addEventListener("dblclick",async e=>{await Jf(e),Zo()}),j.addEventListener("wheel",e=>{w&&(w.framed=!0),e.preventDefault(),Math.abs(e.deltaX)>Math.abs(e.deltaY)*.4?U.pan(-e.deltaX,0,j.clientHeight,M.mode==="layer"):U.dolly(e.deltaY,M.mode==="layer")},{passive:!1}),window.addEventListener("keydown",Sb),nM()}function nM(){let e=!1,t,a,s=0,r=0;te.addEventListener("pointerdown",n=>{if(!n.target.closest(".selection-card-head")||n.target.closest(".selection-card-close"))return;e=!0,te.classList.add("dragging");let o=te.getBoundingClientRect();s=o.left,r=o.top,t=n.clientX,a=n.clientY,te.setPointerCapture(n.pointerId),n.stopPropagation()}),te.addEventListener("pointermove",n=>{if(!e)return;let i=n.clientX-t,o=n.clientY-a,c=M.workspace==="schematic"?Fe:j,l=te.offsetWidth||360,f=te.offsetHeight||330,u=Math.max(16,c.clientWidth-l-24),g=Math.max(16,c.clientHeight-f-24),b=ce(s+i,16,u),h=ce(r+o,16,g);te.style.left=`${b}px`,te.style.top=`${h}px`,M.selectionAnchor={x:b-18,y:h-18},n.stopPropagation()}),te.addEventListener("pointerup",n=>{e&&(e=!1,te.classList.remove("dragging"),te.releasePointerCapture(n.pointerId),n.stopPropagation())})}function iM(){da("[data-workspace]").forEach(e=>{e.addEventListener("click",()=>wb(e.dataset.workspace))})}function wb(e){if(e==="schematic"&&!N||e==="bom"&&!nt)return;M.workspace=e,Et.classList.remove("workspace-pcb","workspace-schematic","workspace-bom","workspace-stackup"),Et.classList.add(`workspace-${e}`),(e==="schematic"&&(M.activeTab==="view"||M.activeTab==="inspect"||M.activeTab==="stats")||e==="bom"||e==="stackup")&&En("layers");let t=Y('.rail-tab[data-tab="layers"]');t&&(e==="schematic"?(t.textContent="Pages",t.title="Schematic pages"):e==="bom"?(t.textContent="Summary",t.title="BoM summary"):(t.textContent="Layers",t.title="Layers and compare"));let a=e==="schematic",s=e==="bom",r=e==="stackup";if(j.hidden=a||s||r,Fe&&(Fe.hidden=!a),un&&(un.hidden=!a||!Z),fn&&(fn.hidden=!a),hn&&(hn.hidden=!s),Le&&(Le.hidden=!r),Be.hidden=a||s||r,bn.hidden=a||s||r,Is&&(Is.hidden=!a),da("[data-workspace]").forEach(n=>{n.classList.toggle("active",n.dataset.workspace===e)}),Fa.textContent=s?"Semantic BoM active":a?Z?"SVG DOM + WebGPU schematic world active":"WebGPU schematic world active":r?"Layer Stackup active":"WebGPU semantic glTF active",a&&!D.fitted&&(N.resize(),N.frameWorld(),D.fitted=!0),!a&&!s&&!r&&(k.renderer?.resize(),M.mode==="layer"?qo():Me(performance.now(),{force:!0})),r)try{pM()}catch(n){console.error("Failed to render stackup workspace",n),Le&&(Le.innerHTML=`
          <div class="selection-empty" style="padding:40px;text-align:center;">
            Stackup view failed to render. ${K(n?.message||String(n))}
          </div>
        `)}Wo(),Je()}function oM(){Fe.addEventListener("pointerdown",e=>{Z?.worldActive||Z?.active||(M.schematicDragging=!0,M.schematicLastX=e.clientX,M.schematicLastY=e.clientY,M.schematicStartX=e.clientX,M.schematicStartY=e.clientY,Fe.setPointerCapture(e.pointerId))}),Fe.addEventListener("pointermove",e=>{if(Z?.worldActive||Z?.active||!M.schematicDragging||!N)return;let t=e.clientX-M.schematicLastX,a=e.clientY-M.schematicLastY;M.schematicLastX=e.clientX,M.schematicLastY=e.clientY,N.pan(t,a)}),Fe.addEventListener("pointerup",async e=>{if(!(Z?.worldActive||Z?.active)&&(M.schematicDragging=!1,Fe.releasePointerCapture(e.pointerId),Math.hypot(e.clientX-M.schematicStartX,e.clientY-M.schematicStartY)<3)){let t=await N.pickFeature(e.clientX,e.clientY);t?W1(t):js()}}),Fe.addEventListener("dblclick",e=>{if(Z?.worldActive||Z?.active)return;let t=N.hitPage(e.clientX,e.clientY);t&&St(t.id,!0)}),Fe.addEventListener("wheel",e=>{Z?.worldActive||Z?.active||(e.preventDefault(),N.zoom(e.deltaY,e.clientX,e.clientY))},{passive:!1})}var Yf=0;async function Jf(e){if(!Q)return;let t=++Yf,a=j.getBoundingClientRect();if(M.selectionAnchor={x:e.clientX-a.left,y:e.clientY-a.top},w&&g1(e))return;let s=await vb(e);if(t===Yf){if(w){Hv(s);return}(s.kind==="feature"||s.kind==="board")&&(M.selectedOccurrence=s.occurrenceIndex),s.featureId?ma(s.featureId,!0):s.kind==="board"&&!k.renderer.identityOnly?ec():Oe()}}async function cM(e){if(!Q||!yn)return;let t=await vb(e),a=w?w.placements.get(t.occurrenceKey)?.board:k;if(!a)return;let s=a.scene.features.get(t.featureId),r=Da(s),n=r?_o(r,a):null;yn({clientX:e.clientX,clientY:e.clientY,reference:r||void 0,value:String(n?.value||s?.value||"")||void 0})}function lM(e,t){if(!w||!j)return null;let a=j.getBoundingClientRect(),s=(e-a.left)/a.width*2-1,r=1-(t-a.top)/a.height*2,n=Eu(U,s,r,a.width/Math.max(a.height,1)),i=w.placed.filter(c=>c.primitives&&c.occurrence.pickSurface).map(c=>({key:c.occurrence.path,matrix:c.matrix,primitives:c.primitives})),o=Su(i,n);return o?{occurrence:o.key,pointMm:o.point.map(c=>c/Do),normal:o.normal,toCamera:n.direction.map(c=>-c)}:null}function dM(e){let t=e!=null?w?.placements.get(String(e)):null;return t?(Po(t),!0):!1}function vb(e){let t=j.getBoundingClientRect();return Mb((e.clientX-t.left)*j.width/t.width,(e.clientY-t.top)*j.height/t.height)}async function Mb(e,t){if(w)return Vv(e,t);let a=await uM(e,t);return a?.kind==="analytic"&&k.analytic?{...a,featureId:fo(k.analytic,a.operationIndex)||null}:a}function uM(e,t){return k.renderer.pick(Q,e,t,{activeNetId:M.activeNetId,selectedFeatureId:M.selectedFeatureId,layerOffsets:nb(),visibleLayers:M.mode==="3d"?k.visible3dLayers:k.compareLayers,showBoard:M.showBoard,showComponents:M.showComponents,componentOpacity:ce(1-M.separation/.1,0,1),boardOpacity:1-M.separation*.72,isolateNet:M.isolateNet,compareMode:M.mode==="layer",compareOffsets:fa,visibleTileIds:M.mode==="3d"?k.visibleTileIds:null})}async function kb(e,t){if(!Q||!(w||k.renderer))return null;let a=j.getBoundingClientRect(),s=await Mb((e-a.left)*j.width/a.width,(t-a.top)*j.height/a.height),r=w?w.placements.get(s.occurrenceKey)?.board:k,n=s.featureId&&r?fh(r.scene.features.get(s.featureId),r):null;return{...s,renderer:void 0,selection:n}}function ec(){let e=M.selectedOccurrence,t=Ge;Ge=!0;try{Oe()}finally{Ge=t}M.selectedOccurrence=e,w&&(w.boardSelected=!0),_n({kind:"board",sourceContext:"3D"})}function Eb(e,t,a){let s=e.scene.componentFeatures.get(String(t)),r=s?e.scene.features.get(Number(s.featureId))?.bounds:null;if(!r)return null;let n=r[2]+r[5]>=0;return a([(r[0]+r[3])/2,(r[1]+r[4])/2,n?r[5]:r[2]])}function So(e,t){if(!Q)return null;let a=es(Q.matrix,pr(t,e),Q.viewport);if(!a)return null;let s=j.getBoundingClientRect();return{x:s.left+a.x*s.width/j.width,y:s.top+a.y*s.height/j.height}}function Sb(e){if(!An())return;if(Mc(e)){e.key==="Escape"&&e.target instanceof HTMLInputElement&&e.target.blur();return}if(kc(e))return;let t=e.key.toLowerCase();if(M.workspace==="schematic"){if(t==="/")e.preventDefault(),En("search"),we.querySelector("#entity-search")?.focus();else if(t==="escape")D.activeNetUid?(D.activeNetUid="",M.activeNetId=0,N.activeNetUid="",Z?.setHighlightedNet(""),Je()):js();else if(t==="~"||e.key==="~"){e.preventDefault();let a=M.selectedSchematicFeature?.netUid;a&&(D.activeNetUid===a?(D.activeNetUid="",M.activeNetId=0,N.activeNetUid="",Z?.setHighlightedNet("")):cb(a,M.selectedSchematicFeature))}else if(t==="home")N?.frameWorld();else if(t==="[")ln("previous");else if(t==="]")ln("next");else if(t==="n"){e.preventDefault();let a=N?.cycleNetIntrasheetLink(e.shiftKey?-1:1);a?.pageId&&(M.selectedPageId=a.pageId,N.selectedPageId=a.pageId,Ab())}else if(e.altKey&&t==="arrowup")ln("parent");else if(e.key.startsWith("Arrow")){e.preventDefault();let a=e.key==="ArrowRight"?32:e.key==="ArrowLeft"?-32:0,s=e.key==="ArrowDown"?32:e.key==="ArrowUp"?-32:0;N?.pan(a,s)}return}if(w&&f1(e,t)){e.preventDefault();return}if(t==="/")e.preventDefault(),En("search"),we.querySelector("#entity-search").focus();else if(t==="escape")Oe();else if(t==="i"&&M.workspace==="pcb"&&Ua())e.preventDefault(),Ga(!M.isolateNet);else if(t==="home")U.frame(w&&w.bounds||ha());else if(t==="`")Ih(!M.showStats);else if(["x","y","z"].includes(t))U.setAxis(t,e.shiftKey);else if(t==="f")U.flip();else if(t==="r")U.rotateZ(e.shiftKey?-1:1);else if(t===" "){e.preventDefault();let a=k.scene.features.get(M.selectedFeatureId);a?.bounds&&U.setFocus([(a.bounds[0]+a.bounds[3])/2,(a.bounds[1]+a.bounds[4])/2,(a.bounds[2]+a.bounds[5])/2])}else if(e.key.startsWith("Arrow")){e.preventDefault();let a=e.key==="ArrowRight"?32:e.key==="ArrowLeft"?-32:0,s=e.key==="ArrowDown"?32:e.key==="ArrowUp"?-32:0;U.pan(a,s,j.clientHeight,M.mode==="layer")}}function En(e){M.activeTab=e,Et.classList.remove("panel-collapsed"),da(".rail-tab").forEach(t=>{t.classList.toggle("active",t.dataset.tab===e)}),da(".tab-panel").forEach(t=>{t.classList.toggle("active",t.dataset.panel===e)})}function Tb(){let e=Be.getContext("2d");e.clearRect(0,0,Be.width,Be.height);let t=[Be.width/2,Be.height/2],a=U.basis(),s=[{axis:"x",label:"X",color:"#e23838",vector:[1,0,0]},{axis:"y",label:"Y",color:"#2dbd50",vector:[0,1,0]},{axis:"z",label:"Z",color:"#3157d5",vector:[0,0,1]}],r=[];for(let n of s)for(let i of[-1,1]){let o=n.vector.map(l=>l*i),c=[po(o,a.right),-po(o,a.up),po(o,a.back)];r.push({...n,sign:i,depth:c[2],point:[t[0]+c[0]*34,t[1]+c[1]*34]})}for(let n of s){let i=r.find(o=>o.axis===n.axis&&o.sign===1);e.strokeStyle=n.color,e.lineWidth=2.4,e.beginPath(),e.moveTo(...t),e.lineTo(...i.point),e.stroke()}gn=[];for(let n of r.sort((i,o)=>o.depth-i.depth)){let i=n.sign===1,o=i?13:9;e.beginPath(),e.arc(n.point[0],n.point[1],o,0,Math.PI*2),e.fillStyle=i?n.color:`${n.color}66`,e.fill(),e.lineWidth=2,e.strokeStyle=bM(n.color,i?.45:.58),e.stroke(),i&&(e.fillStyle="#07101c",e.font="700 13px system-ui",e.textAlign="center",e.textBaseline="middle",e.fillText(n.label,n.point[0],n.point[1]+.5)),gn.push({...n,radius:o+5})}}function Ib(){!Be||Be.dataset.bound==="true"||(Be.dataset.bound="true",Be.addEventListener("click",e=>{let t=Be.width/Be.clientWidth,a=Be.height/Be.clientHeight,s=[e.offsetX*t,e.offsetY*a],r=gn.map(n=>({item:n,distance:Math.hypot(s[0]-n.point[0],s[1]-n.point[1])})).filter(({item:n,distance:i})=>i<=n.radius).sort((n,i)=>n.distance-i.distance)[0]?.item;r&&U.setAxis(r.axis,r.sign<0)}))}function fM(){if(M.mode!=="layer"||!Q){bn.innerHTML="";return}let e=ha(),t=yh();bn.innerHTML=k.scene.copperLayers.filter(a=>t.has(Number(a.id))).map(a=>{let s=fa.get(Number(a.id))||[0,0,0],r=hM([e[0]+s[0],e[4]+s[1],0],Q.matrix,j.clientWidth,j.clientHeight);return!r||r[0]<-100||r[0]>j.clientWidth+100||r[1]<-100||r[1]>j.clientHeight+100?"":`<span style="left:${r[0]}px;top:${r[1]}px">${K(a.name)}</span>`}).join("")}function Ab(){if(M.workspace!=="schematic"||!N){Is.innerHTML="";return}Is.innerHTML=D.visiblePages.filter(e=>N.pagePixelWidth(e)>120).map(e=>{let[t,a]=N.worldToScreen(e.worldX+8*N.scale,e.worldY-6*N.scale),s=e.id===M.selectedPageId,n=D.activeNetUid&&e.netUids.includes(D.activeNetUid)?"#18ef52":s?"#3b82f6":"#4b8de8";return`<div class="schematic-page-label" style="left:${t}px;top:${a}px;border-left-color:${n}">
        <strong>${K(e.name)}</strong>
        <small>Page ${e.sheetNumber} &middot; ${e.featureCount.toLocaleString()} features</small>
      </div>`}).join("")}function hM(e,t,a,s){let r=e[0],n=e[1],i=e[2],o=t[0]*r+t[4]*n+t[8]*i+t[12],c=t[1]*r+t[5]*n+t[9]*i+t[13],l=t[3]*r+t[7]*n+t[11]*i+t[15];return Math.abs(l)<1e-8?null:[(o/l*.5+.5)*a,(.5-c/l*.5)*s]}function po(e,t){return e[0]*t[0]+e[1]*t[1]+e[2]*t[2]}function bM(e,t){let a=e.replace("#","");return`#${[0,2,4].map(s=>Math.round(parseInt(a.slice(s,s+2),16)*t).toString(16).padStart(2,"0")).join("")}`}function To(e,t){M.frameSamples.push({intervalMs:e,cpuMs:t}),M.frameSamples.length>180&&M.frameSamples.shift()}function Qf(e,t){if(!e.length)return 0;let a=[...e].sort((s,r)=>s-r);return a[Math.min(a.length-1,Math.floor((a.length-1)*t))]}function Io(e){if(!rn||(M.frames+=1,e-M.fpsAt<=500))return;M.fps=M.frames*1e3/(e-M.fpsAt);let t=M.frameSamples;if(M.frameIntervalMs=t.length?t.reduce((n,i)=>n+i.intervalMs,0)/t.length:0,M.frameCpuMs=t.length?t.reduce((n,i)=>n+i.cpuMs,0)/t.length:0,M.frameIntervalP95Ms=Qf(t.map(n=>n.intervalMs),.95),M.frameCpuP95Ms=Qf(t.map(n=>n.cpuMs),.95),M.frames=0,M.fpsAt=e,Ah(),M.workspace==="bom"){let n=nt?.payload?.counts||{},i=[["Renderer","BoM DOM table"],["Schema",nt?.payload?.schema||"-"],["Grouped rows",n.rows||0],["Components",n.components||0],["DNP components",n.dnpComponents||0],["Extra columns",nt?.payload?.extraColumns?.length||0],["Frame interval",`${M.frameIntervalMs.toFixed(2)} ms avg / ${M.frameIntervalP95Ms.toFixed(2)} p95`],["CPU frame",`${M.frameCpuMs.toFixed(2)} ms avg / ${M.frameCpuP95Ms.toFixed(2)} p95`],["FPS",M.fps.toFixed(1)]];rn.innerHTML=i.map(([o,c])=>`<dt>${o}</dt><dd>${c}</dd>`).join("");return}let a=M.workspace==="schematic"&&N?N.stats():null,s=M.workspace==="schematic"&&Z?Z.stats():null,r=M.workspace==="schematic"&&N?Z?.active?[["Renderer","SVG DOM schematic detail"],["Pages",D.pages.length],["Mounted pages",s.mountedPages],["Active page",s.activePage],["DOM nodes",s.domNodes.toLocaleString()],["Indexed features",s.indexedFeatures.toLocaleString()],["Indexed nets",s.indexedNets.toLocaleString()],["SVG cache",`${s.cachedSvgPages} pages / ${(s.cachedSvgBytes/1048576).toFixed(1)} MB`],["Selection",`${s.selectionMs.toFixed(1)} ms`],["Active net",k.scene.nets.find(n=>n.uid===D.activeNetUid)?.name||"-"],["Tracking links",`${a.netFlowSegments} total / ${a.netFlowIntrasheetSegments} local`],["Tracking verts",a.netFlowVertices.toLocaleString()],["Mount",`${s.mountMs.toFixed(1)} ms`],["Highlight",`${s.highlightMs.toFixed(1)} ms`],["Fallback",s.fallbackReason||"-"],["Frame interval",`${M.frameIntervalMs.toFixed(2)} ms avg / ${M.frameIntervalP95Ms.toFixed(2)} p95`],["CPU frame",`${M.frameCpuMs.toFixed(2)} ms avg / ${M.frameCpuP95Ms.toFixed(2)} p95`],["FPS",M.fps.toFixed(1)]]:[["Renderer",Z?"SVG DOM + WebGPU world":"WebGPU schematic world"],["Pages",D.pages.length],["Visible pages",D.visiblePages.length],["DOM pages",s?s.mountedPages:0],["DOM nodes",s?s.domNodes.toLocaleString():"0"],["Indexed SVG features",s?s.indexedFeatures.toLocaleString():"0"],["SVG cache",s?`${s.cachedSvgPages} pages / ${(s.cachedSvgBytes/1048576).toFixed(1)} MB`:"0 pages"],["JS heap",s?.heapMb?`${s.heapMb.toFixed(1)} MB`:"-"],["Hierarchy links",D.manifest.edges?.length||0],["Selected page",D.byId.get(M.selectedPageId)?.name||"-"],["Active net",k.scene.nets.find(n=>n.uid===D.activeNetUid)?.name||"-"],["Tracking links",`${a.netFlowSegments} total / ${a.netFlowIntrasheetSegments} local`],["Downloaded",`${(N.downloadedBytes/1048576).toFixed(1)} MB`],["Resident vectors",`${(a.residentVectorBytes/1048576).toFixed(1)} MB`],["Vector pages",`${a.vectorChunks} loaded / ${a.vectorLoads} loading`],["Vector draw",`${a.vectorVertices.toLocaleString()} verts / ${a.vectorDrawChunks} chunks`],["Native detail",`${a.nativeDetailPages} pages @ ${a.nativePxPerMm} / ${a.nativeThresholdPxPerMm} px/mm`],["Vector failures",a.failedVectorChunks],["Truncated",a.truncatedVectors],["Frame interval",`${M.frameIntervalMs.toFixed(2)} ms avg / ${M.frameIntervalP95Ms.toFixed(2)} p95`],["CPU frame",`${M.frameCpuMs.toFixed(2)} ms avg / ${M.frameCpuP95Ms.toFixed(2)} p95`],["FPS",M.fps.toFixed(1)]]:[["Renderer","WebGPU semantic glTF"],["Mode",M.mode==="3d"?"3D":"Layer Compare"],["Visible layers",M.mode==="3d"?k.visible3dLayers.size:k.compareLayers.size],["Resident tiles",k.scene.loaded.size],["Loading tiles",k.scene.loading.size],["Failed tiles",k.scene.failed.size],["Triangles",Math.round(k.triangles).toLocaleString()],["Downloaded",`${(k.loadedBytes/1048576).toFixed(1)} MB`],["Resident GLB",`${(k.residentTileBytes/1048576).toFixed(1)} MB`],["Resident GPU",`${(k.residentTileGpuBytes/1048576).toFixed(1)} MB`],["Tile loads",k.tileLoads.toLocaleString()],["Tile evictions",k.tileEvictions.toLocaleString()],["Tile scheduler",`${k.tileSchedulerMs.toFixed(2)} ms`],["Active net",k.scene.nets.find(n=>Number(n.id)===M.activeNetId)?.name||"-"],["Frame interval",`${M.frameIntervalMs.toFixed(2)} ms avg / ${M.frameIntervalP95Ms.toFixed(2)} p95`],["CPU frame",`${M.frameCpuMs.toFixed(2)} ms avg / ${M.frameCpuP95Ms.toFixed(2)} p95`],["FPS",M.fps.toFixed(1)]];rn.innerHTML=r.map(([n,i])=>`<dt>${n}</dt><dd>${i}</dd>`).join("")}function jn(e){return`rgb(${e.slice(0,3).map(t=>Math.round(t*255)).join(" ")})`}function pM(){if(!Le)return;let e=k.scene.layers||[];if(!e.length){Le.innerHTML='<div class="selection-empty" style="padding:40px;text-align:center;">No stackup information available for this board.</div>';return}let t=e.filter(I=>["copper","dielectric","paste","silkscreen","soldermask"].includes(I.role)),a=k.topology.board?.stackup||{},s=I=>{if(I==null||I==="")return"None";let P=String(I);return K(P.includes(".")?P.split(".").pop():P)},r=(I,P=4)=>{let L=Number(I);return Number.isFinite(L)&&L>0?L.toFixed(P):"-"},n=(I,P=3)=>{let L=Number(I);return Number.isFinite(L)?L.toFixed(P):"-"},i=I=>{if(I==null||I==="")return"No";if(typeof I=="boolean")return I?"Yes":"No";let P=String(I).trim().toLowerCase(),L=P.includes(".")?P.split(".").pop():P;return["0","false","no","n","off","none"].includes(L)?"No":(["1","true","yes","y","on"].includes(L),"Yes")},o=I=>({copper:"Copper",dielectric:"Dielectric",paste:"Paste",silkscreen:"Silkscreen",soldermask:"Solder mask"})[I]||String(I||"Layer"),c=I=>I.role!=="dielectric"?"":I.type==="core"?"Core":I.type==="prepreg"||(I.material||"").toLowerCase().includes("prepreg")?"Prepreg":"Core",l=(I,P=4)=>{let L=Number(I.thickness_mm);return Number.isFinite(L)&&L>0?`${L.toFixed(P)} mm`:"Not specified"},f=I=>{let P=o(I.role),L=String(I.material||"").trim(),J=L&&L.toLowerCase()!==String(I.role||"").toLowerCase();if(I.role==="dielectric"){let ue=[J?L:"",r(I.epsilon_r,3)!=="-"?`\u03B5r ${r(I.epsilon_r,3)}`:"",r(I.loss_tangent,4)!=="-"?`tan \u03B4 ${r(I.loss_tangent,4)}`:""].filter(Boolean).join(" \xB7 ");return{primary:`${I.name} \xB7 ${c(I)}`,secondary:ue}}return{primary:[I.name,P,J?L:""].filter(Boolean).join(" \xB7 "),secondary:""}},u=0,g=0,b=0,h=0;t.forEach(I=>{h+=I.thickness_mm||0,I.role==="copper"?I.name.toLowerCase().includes("gnd")||I.name.toLowerCase().includes("pwr")||I.name.toLowerCase().includes("plane")?g++:u++:I.role==="dielectric"&&b++});let d=k.scene.copperLayers||[],x=0,p=0,m=0,y=[...(k.scene.manifest?.barrels||[]).filter(I=>I.kind==="via"),...[...k.scene.features.values()].filter(I=>I.kind==="via")],v=tu(d,y);x=v.counts.thru,p=v.counts.blind,m=v.counts.buried;let E=v.spans,S=30,T=S,A=[],_=new Map(t.map((I,P)=>[I,P])),R=gM(t),C=(I,P)=>{let L=R.get(I.name);if(L!==void 0)return L;let J=Number(I.stack_index);return Number.isFinite(J)?J:P+1e5},F=[...t].sort((I,P)=>{let L=C(I,_.get(I)||0),J=C(P,_.get(P)||0);return L!==J?L-J:(P.z_mm||0)-(I.z_mm||0)});F.forEach(I=>{let P=12;I.role==="dielectric"?P=Math.max(160,Math.min(360,(I.thickness_mm||.1)*140)):I.role==="copper"?P=22:I.role==="soldermask"&&(P=14),A.push({...I,svgY:T,svgHeight:P}),T+=P});let O=800,V=130,$=240,re=V+$+16,de=re+84,Ke="";A.forEach(I=>{let P=I.color||"#7f7f7f";I.role==="copper"?P=I.color||"#f97316":I.role==="dielectric"?P="#a98d5c":I.role==="paste"?P="#cbd5e1":I.role==="soldermask"?P="#1b4332":I.role==="silkscreen"&&(P="#e2e8f0");let L=d.findIndex(Pb=>Pb.name===I.name),J=f(I),ue=I.svgY+I.svgHeight/2,Re=!!J.secondary&&I.svgHeight>=38,ta=Re?ue-5:ue+3,Un=K(I.id),Us=K(I.name),ot=Number.isFinite(Number(I.thickness_mm))&&Number(I.thickness_mm)>0,Fb=K(ot?l(I):"\u2014"),Ob=K([J.primary,J.secondary,`Thickness ${l(I)}`].filter(Boolean).join("; "));Ke+=`
      <g class="stackup-svg-layer" data-layer-id="${Un}" data-layer-name="${Us}">
        <title>${Ob}</title>
        <rect x="${V}" y="${I.svgY}" width="${$}" height="${I.svgHeight}" fill="${P}" opacity="0.85" rx="1"/>
        <text x="${V-8}" y="${I.svgY+I.svgHeight/2+3}" fill="var(--muted)" font-size="9px" text-anchor="end" font-weight="700">
          ${I.role==="copper"?L+1:""}
        </text>
        <path class="stackup-layer-dimension" d="M ${re+6} ${I.svgY+1} H ${re} V ${I.svgY+I.svgHeight-1} H ${re+6}" />
        <text class="stackup-layer-thickness" x="${re+10}" y="${ue+3}" fill="var(--muted)" font-size="8.5px" font-weight="650">
          ${Fb}
        </text>
        <text class="stackup-layer-name" x="${de}" y="${ta}" fill="var(--foreground)" font-size="9px" font-weight="650">
          ${K(J.primary)}
        </text>
        ${Re?`<text class="stackup-layer-metadata" x="${de}" y="${ue+10}" fill="var(--muted)" font-size="8px">${K(J.secondary)}</text>`:""}
      </g>
    `});let be="",Ve=A.filter(I=>I.role==="copper");E.forEach((I,P)=>{let L=A.find(ot=>ot.name===I.startName),J=A.find(ot=>ot.name===I.endName);if(!L||!J)return;let ue=L.svgY,Re=J.svgY+J.svgHeight,ta=V+(P+1)*$/(E.length+1),Un=I.type==="thru"?"Thru":I.type==="blind"?"Blind":"Buried",Us=`var(--stackup-via-${I.type})`;be+=`
      <g class="stackup-svg-via" data-via-type="${I.type}">
        <title>${Un}: ${I.startName} \u2192 ${I.endName}</title>
        ${Ve.map(ot=>ot.svgY>=L.svgY&&ot.svgY<=J.svgY?`<rect x="${ta-5}" y="${ot.svgY}" width="10" height="${ot.svgHeight}" fill="${Us}" rx="0.5" />`:"").join("")}
        <rect x="${ta-2}" y="${ue}" width="4" height="${Re-ue}" fill="${Us}" opacity="0.95" />
        <rect x="${ta-.75}" y="${ue-1}" width="1.5" height="${Re-ue+2}" fill="var(--panel)" opacity="0.9" />
      </g>
    `});let Qe=`
    <svg class="stackup-visual-svg" viewBox="0 0 ${O} ${T+10}" width="${O}" height="${T+10}">
      <g class="stackup-svg-column-headings" aria-hidden="true">
        <text x="${re+10}" y="15">Thickness</text>
        <text x="${de}" y="15">Layer / material properties</text>
      </g>
      <g class="stackup-total-dimension" aria-label="Total board thickness ${h.toFixed(4)} millimetres">
        <path d="M 76 ${S} H 68 V ${T} H 76" />
        <text x="68" y="15">Total ${h.toFixed(4)} mm</text>
      </g>
      ${Ke}
      ${be}
    </svg>
    <div class="stackup-via-legend" aria-label="Via span legend">
      <span><i data-via-type="thru"></i>Thru</span>
      <span><i data-via-type="blind"></i>Blind</span>
      <span><i data-via-type="buried"></i>Buried</span>
    </div>
  `,_e="";F.forEach(I=>{let P="silk";I.role==="copper"?P="copper":I.role==="dielectric"?P="dielectric":I.role==="paste"?P="paste":I.role==="soldermask"&&(P="mask");let L=c(I),J=K(I.id),ue=K(I.name),Re=f(I);_e+=`
      <tr data-layer-id="${J}" data-layer-name="${ue}" tabindex="0" aria-label="${K(`${Re.primary}; thickness ${l(I)}`)}">
        <td><strong>${ue}</strong></td>
        <td><span class="stackup-badge ${P}">${I.role}</span></td>
        <td>${L||"-"}</td>
        <td>${K(I.material||"-")}</td>
        <td>${I.role==="dielectric"?r(I.epsilon_r,3):"-"}</td>
        <td>${I.role==="dielectric"?r(I.loss_tangent,4):"-"}</td>
        <td>${I.thickness_mm?I.thickness_mm.toFixed(4)+" mm":"-"}</td>
      </tr>
    `});let it="",Ze=k.topology.board?.net_classes||[],It=I=>{let P=n(I);return P==="-"?P:`${P} mm`};Ze.length?Ze.forEach(I=>{it+=`
        <tr>
          <td><strong>${I.name}</strong></td>
          <td>${It(I.track_width)}</td>
          <td>${It(I.clearance)}</td>
          <td>${It(I.diff_pair_width)}</td>
          <td>${It(I.diff_pair_gap)}</td>
          <td>${Number.isFinite(Number(I.via_diameter))?`${n(I.via_drill)}/${n(I.via_diameter)} mm`:"-"}</td>
        </tr>
      `}):it=`
      <tr>
        <td colspan="6" class="selection-empty" style="text-align: center;">No design rules or impedance classes defined.</td>
      </tr>
    `,Le.innerHTML=`
    <div class="stackup-header">
      <div class="stackup-header-title">
        <h1>Layer Stackup</h1>
        <p>Board cross-section profile, layer properties & design rules</p>
      </div>
    </div>

    <div class="stackup-workspace-body">
      <div class="stackup-diagram-card">
        <span class="stackup-section-title">Cross-Section Profile</span>
        ${Qe}
      </div>
      <aside class="stackup-side-panel">
      <div class="stackup-summary-grid">
        <div class="stackup-summary-card">
          <label>Total Thickness</label>
          <span>${h.toFixed(4)} mm</span>
        </div>
        <div class="stackup-summary-card">
          <label>Copper Layers</label>
          <span>${d.length} (${u} Sig / ${g} Plane)</span>
        </div>
        <div class="stackup-summary-card">
          <label>Dielectrics</label>
          <span>${b} Layers</span>
        </div>
        <div class="stackup-summary-card">
          <label>Thru Vias</label>
          <span>${x}</span>
        </div>
        <div class="stackup-summary-card">
          <label>Blind Vias</label>
          <span>${p}</span>
        </div>
        <div class="stackup-summary-card">
          <label>Buried Vias</label>
          <span>${m}</span>
        </div>
      </div>
      <span class="stackup-section-title stackup-section-heading">Fabrication</span>
      <div class="stackup-summary-grid">
        <div class="stackup-summary-card">
          <label>Copper Finish</label>
          <span>${s(a.copper_finish)}</span>
        </div>
        <div class="stackup-summary-card">
          <label>Edge Connector</label>
          <span>${i(a.edge_connector)}</span>
        </div>
        <div class="stackup-summary-card">
          <label>Castellated Holes</label>
          <span>${i(a.castellated_pads)}</span>
        </div>
        <div class="stackup-summary-card">
          <label>Edge Plating</label>
          <span>${i(a.edge_plating)}</span>
        </div>
      </div>
      <div class="stackup-tables-container">
        <div class="stackup-table-section">
          <div class="stackup-section-title stackup-section-heading">
            <span>Layers Stackup</span>
            <small>Hover or focus a row to locate it</small>
          </div>
          <div class="stackup-table-wrapper">
            <table class="stackup-table">
              <thead>
                <tr>
                  <th>Layer</th>
                  <th>Type</th>
                  <th>Subtype</th>
                  <th>Material</th>
                  <th>\u03B5r</th>
                  <th>tan \u03B4</th>
                  <th>Thickness</th>
                </tr>
              </thead>
              <tbody>
                ${_e}
              </tbody>
            </table>
          </div>
        </div>

        <div class="stackup-table-section">
          <span class="stackup-section-title stackup-section-heading">Impedance Net Classes</span>
          <div class="stackup-table-wrapper">
            <table class="stackup-table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Width</th>
                  <th>Clearance</th>
                  <th>Diff W</th>
                  <th>Diff Gap</th>
                  <th>Drill/Dia</th>
                </tr>
              </thead>
              <tbody>
                ${it}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      </aside>
    </div>
  `;let ya=(I,P)=>{Le.querySelectorAll(".stackup-svg-layer").forEach(L=>{let J=L.dataset.layerId===I;L.classList.toggle("active",J&&P)}),Le.querySelectorAll(".stackup-table tbody tr[data-layer-id]").forEach(L=>{let J=L.dataset.layerId===I;L.classList.toggle("active",J&&P)})},Dn=I=>{let P=Le.querySelector(".stackup-diagram-card"),L=Le.querySelector(`.stackup-svg-layer[data-layer-id="${CSS.escape(I)}"]`);if(!P||!L||P.scrollHeight<=P.clientHeight)return;let J=P.getBoundingClientRect(),ue=L.getBoundingClientRect(),Re=P.scrollTop+ue.top-J.top-(P.clientHeight-ue.height)/2,ta=window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;P.scrollTo({top:Math.max(0,Re),behavior:ta?"auto":"smooth"})},Ds=(I,{revealDiagram:P=!1}={})=>{I.forEach(L=>{let J=()=>{let Re=L.dataset.layerId;ya(Re,!0),P&&Dn(Re)},ue=()=>ya(null,!1);L.addEventListener("mouseenter",J),L.addEventListener("mouseleave",ue),P&&(L.addEventListener("focus",J),L.addEventListener("blur",ue))})};Ds(Le.querySelectorAll(".stackup-svg-layer")),Ds(Le.querySelectorAll(".stackup-table tbody tr[data-layer-id]"),{revealDiagram:!0})}function gM(e){let t=e.filter(r=>r.role==="dielectric");if(!(t.length===1&&t[0]?.name==="Board"))return new Map;let s=new Map;return["F.SilkS","F.Paste","F.Mask","F.Cu","Board","B.Cu","B.Mask","B.Paste","B.SilkS"].forEach((r,n)=>s.set(r,n)),s}function _b(){let e=null;return{begin(){return e?.abort(),e=new AbortController,e},owns(t){return t!==null&&t===e&&!t.signal.aborted},cancel(){e?.abort(),e=null}}}async function Rb(e,t,{owner:a,bundleUrl:s,loadBundle:r,now:n=()=>performance.now()}){let i=n(),o={},{signal:c}=t,l=()=>a.owns(t)&&e.isConnected;try{e.renderLoading();let f=n(),{bundle:u,topology:g,semanticGeometry:b,assetCache:h}=await r(s,o,c);if(o.bundle_group_total_ms=n()-f,!l())return;e.renderShell();let d=n(),x=await e.mountViewer({topology:g,semanticGeometry:b,readiness:u.readiness,assetCache:h,signal:c});if(!l()){x?.dispose?.();return}e.publishController(x),o.mount_and_first_frame_ms=n()-d,Object.assign(o,x?.performance||{}),o.reload_to_visible_ms=n()-i,e.emitReady({schema:"prism.semantic_viewer_performance.a0",milestone:"board-visible",readiness_stage:u.readiness?.stage||"semantic-ready",readiness_progress:u.readiness?.progress??100,timings:o})}catch(f){if(!l())return;e.renderError(f),e.emitError(f)}}var mM="prism.visualizer_bundle.a0";function yM(){return`
    <style>
      ${tc}
      #app { grid-template-columns: minmax(0, 1fr) 376px; }
      #app.panel-collapsed { grid-template-columns: minmax(0, 1fr) 46px; }
      #app.workspace-stackup { grid-template-columns: minmax(0, 1fr); }
      #selection-card { display: none !important; }
      #scene-stats {
        position: absolute; top: 12px; right: 12px; z-index: 4; margin: 0; padding: 8px 10px;
        display: grid; grid-template-columns: auto auto; gap: 2px 12px;
        background: rgb(15 20 28 / 0.82); color: #dbe4f0; border-radius: 6px;
        font: 11px/1.4 "SFMono-Regular", Consolas, monospace; font-variant-numeric: tabular-nums;
        pointer-events: none;
      }
      #scene-stats[hidden] { display: none; }
      #scene-stats dt { color: #8a97a8; }
      #scene-stats dd { margin: 0; text-align: right; }
      /* SB2-30a: level-of-detail thresholds, beside the stats in mode="system". */
      #lod-tuning {
        position: absolute; right: 12px; bottom: 12px; z-index: 4; width: 230px; padding: 8px 10px;
        background: rgb(15 20 28 / 0.86); color: #dbe4f0; border-radius: 6px;
        font: 11px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
      }
      #lod-tuning[hidden] { display: none; }
      #lod-tuning h2 { margin: 0 0 6px; font-size: 11px; font-weight: 600; }
      #lod-tuning label { display: grid; grid-template-columns: 64px 1fr 30px; align-items: center; gap: 6px; }
      #lod-tuning input { width: 100%; margin: 0; }
      #lod-tuning output { text-align: right; font: 11px "SFMono-Regular", Consolas, monospace; font-variant-numeric: tabular-nums; }
      #lod-tuning button {
        margin-top: 6px; font: inherit; color: inherit; background: rgb(255 255 255 / 0.12);
        border: 0; border-radius: 4px; padding: 2px 8px; cursor: pointer;
      }
      /* System mode (SB2-31f): board labels, the move gizmo and the key list. */
      #system-labels { position: absolute; inset: 0; z-index: 2; pointer-events: none; overflow: hidden; }
      /* SB2-34: proxy harnesses, straight segments between connectors until M5's geometry. */
      #system-harnesses { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 1; pointer-events: none; overflow: hidden; }
      #system-harnesses[hidden] { display: none; }
      #system-harnesses .segment { stroke: #1e293b; stroke-width: 2.5; stroke-dasharray: 7 5; stroke-linecap: round; filter: drop-shadow(0 0 1.5px rgb(255 255 255 / 0.9)); }
      #system-harnesses .segment.dim { opacity: 0.25; }
      #system-harnesses .segment.lit { stroke-width: 4.5; stroke-dasharray: none; opacity: 1; filter: drop-shadow(0 0 4px currentColor); }
      #system-harnesses .end { fill: #f8fafc; stroke: #1e293b; stroke-width: 2; }
      #system-harnesses .end.dim { opacity: 0.3; }
      #system-harnesses .end.lit { stroke: #fff; animation: harness-glow 1.9s ease-in-out infinite; }
      @keyframes harness-glow { 50% { opacity: 0.65; } }
      #system-labels[hidden] { display: none; }
      .scene-label {
        position: absolute; left: 0; top: 0; display: flex; flex-direction: column; align-items: center;
        padding: 2px 7px; border-radius: 5px; background: rgb(15 20 28 / 0.72); color: #f1f5f9;
        font: 500 11px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif; white-space: nowrap; margin-top: -6px;
      }
      .scene-label[hidden] { display: none; }
      .scene-label span { font-weight: 400; color: #cbd5e1; font-size: 10px; }
      .scene-label.stand-in { background: rgb(71 85 105 / 0.78); }
      .scene-label.restricted { background: rgb(55 65 81 / 0.85); }
      .scene-label.failed { background: rgb(153 27 27 / 0.8); }
      .scene-label.selected { background: rgb(37 99 235 / 0.92); }
      /* SB2-45b: the picked harness's breakouts and waypoints in move mode, under the gizmo. */
      #harness-nodes { position: absolute; inset: 0; z-index: 2; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
      #harness-nodes[hidden] { display: none; }
      #harness-nodes .node { fill: #f8fafc; stroke: #3e63dd; stroke-width: 2.5; pointer-events: visiblePainted; cursor: pointer; }
      #harness-nodes .node.breakout { fill: #3e63dd; stroke: #fff; }
      #harness-nodes .node.auto { fill: none; stroke: #3e63dd; stroke-dasharray: 3 2; }
      #harness-nodes .node { cursor: grab; }
      #harness-nodes .node.pinned { fill: #0f172a; }
      #harness-nodes .node.target { stroke: #f59e0b; stroke-width: 3.5; }
      #harness-nodes .node:hover { stroke-width: 4; }
      #move-gizmo { position: absolute; inset: 0; z-index: 3; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
      #move-gizmo[hidden] { display: none; }
      #move-gizmo .ring { stroke-width: 2.5; opacity: 0.75; pointer-events: stroke; cursor: grab; }
      #move-gizmo .ring:hover { stroke-width: 5; opacity: 1; }
      #move-gizmo .arrow { pointer-events: visiblePainted; cursor: grab; }
      #move-gizmo .arrow line { stroke-width: 4; stroke-linecap: round; }
      #move-gizmo .arrow:hover line { stroke-width: 6; }
      #move-gizmo .arrow text { font: 700 11px system-ui, -apple-system, "Segoe UI", sans-serif; paint-order: stroke; }
      #move-gizmo .pivot { fill: #0f172a; stroke: #fff; stroke-width: 1.5; }
      #move-gizmo .readout { font: 600 12px system-ui, -apple-system, "Segoe UI", sans-serif; fill: #0f172a;
        paint-order: stroke; stroke: #fff; stroke-width: 3px; }
      #system-help { position: absolute; right: 12px; bottom: 12px; z-index: 4; margin: 0; padding: 10px 12px; max-width: 340px;
        display: grid; grid-template-columns: auto 1fr; gap: 3px 12px;
        background: rgb(15 20 28 / 0.9); color: #e2e8f0; border-radius: 8px;
        font: 12px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
      #system-help[hidden] { display: none; }
      #system-help h2 { grid-column: 1 / -1; margin: 0 0 4px; font-size: 12px; font-weight: 600; }
      #system-help kbd { font: 600 11px "SFMono-Regular", Consolas, monospace; color: #fff; }
      #system-help dd { margin: 0; color: #cbd5e1; }
      /* The host renders the PCB controls itself (see getViewState). */
      :host([hide-panel]) #app,
      :host([hide-panel]) #app.panel-collapsed { grid-template-columns: minmax(0, 1fr); }
      :host([hide-panel]) .panel { display: none !important; }
    </style>
    <main id="app">
      <section class="viewport-shell">
        <canvas id="viewport"></canvas>
        <div id="stackup-workspace-view" hidden></div>
        <div id="panel-labels"></div>
        <div id="selection-card" hidden></div>
        <canvas id="axis-gizmo" width="112" height="112" title="Click an axis to align the camera"></canvas>
        <dl id="scene-stats" hidden></dl>
        <div id="lod-tuning" role="group" aria-label="Level of detail thresholds" hidden></div>
        <svg id="system-harnesses" hidden aria-hidden="true"></svg>
        <div id="system-labels" hidden></div>
        <svg id="harness-nodes" hidden aria-hidden="true"></svg>
        <svg id="move-gizmo" hidden aria-hidden="true"></svg>
        <dl id="system-help" hidden aria-label="Keyboard shortcuts">
          <h2>Keyboard</h2>
          <dt><kbd>Home</kbd> <kbd>A</kbd></dt><dd>Frame every board</dd>
          <dt><kbd>Double-click</kbd></dt><dd>Select and frame</dd>
          <dt><kbd>X</kbd> <kbd>Y</kbd> <kbd>Z</kbd></dt><dd>Look along an axis (Shift: from the other side)</dd>
          <dt><kbd>F</kbd> <kbd>R</kbd></dt><dd>Flip the view, turn it a quarter</dd>
          <dt><kbd>I</kbd></dt><dd>Isolate the lit nets' copper, or back</dd>
          <dt><kbd>M</kbd></dt><dd>Move mode on or off (editors)</dd>
          <dt><kbd>L</kbd></dt><dd>Gizmo axes: world or the board's own</dd>
          <dt><kbd>Shift</kbd></dt><dd>While dragging: 0.1 mm and 1\xB0 steps (else 1 mm, 15\xB0)</dd>
          <dt><kbd>Enter</kbd></dt><dd>Save the shown position</dd>
          <dt><kbd>Esc</kbd></dt><dd>Undo the drag, leave move mode, or clear the selection</dd>
          <dt><kbd>\`</kbd></dt><dd>Scene stats</dd>
          <dt><kbd>?</kbd></dt><dd>This list</dd>
        </dl>
        <div id="fallback" hidden></div>
      </section>
      <aside class="panel">
        <nav class="panel-rail" aria-label="Viewer tools">
          <button class="rail-tab active" data-tab="layers" title="Layers">Layers</button>
          <button class="rail-tab" data-tab="search" title="Search and selection">Find</button>
          <button class="rail-tab" data-tab="view" title="View controls">View</button>
        </nav>
        <div class="panel-drawer">
          <header class="panel-mode-header">
            <div id="mode-switch"></div>
          </header>
          <section class="tab-panel active" data-panel="layers">
            <div class="section-heading"><h2 id="primary-heading">Layers</h2><span id="primary-description">Visibility and compare</span></div>
            <div id="layers"></div>
          </section>
          <section class="tab-panel" data-panel="search">
            <div class="section-heading"><h2>Find</h2><span>Nets, components and pins</span></div>
            <div id="search-controls"></div>
          </section>
          <section class="tab-panel" data-panel="view">
            <div class="section-heading"><h2>View</h2><span>Camera and stackup</span></div>
            <div id="view-controls"></div>
          </section>
        </div>
      </aside>
    </main>
  `}function xM(e){return String(e).replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t])}async function Nb(e,t=null,a="fetch",s=void 0){let r=performance.now(),n=await fetch(e,{cache:"no-store",signal:s});if(!n.ok)throw new Error(`Failed to load ${e}: ${n.status}`);let i=await n.json();return t&&(t[`${a}_fetch_parse_ms`]=performance.now()-r,t[`${a}_content_length`]=Number(n.headers.get("content-length")||0)),i}async function Cb(e,t,a){let s=new URL(e,document.baseURI).toString(),r=new URL(s).searchParams.get("viewer")||"",n=Gs.open(),i=await n.peekJson(s).catch(()=>null),o=!!i;i||(i=await Nb(s,t,"bundle",a),Kn(i)&&n.store(s,new TextEncoder().encode(JSON.stringify(i)))),t&&(t.bundle_from_cache=o);let c=Kn(i)&&n.enabled?n:null;if(i.schema!==mM)throw new Error(`Unsupported visualizer bundle schema: ${i.schema||"missing"}`);let l=new URL(i.topology||"topology.json",s),f=new URL(i.semantic_geometry||"semantic_geometry.json",s),u=(h,d)=>c?c.fetchJson(h.toString(),{signal:a}):Nb(h,t,d,a),[g,b]=await Promise.all([u(l,"topology"),u(f,"semantic_geometry")]);return{bundle:i,topology:g,semanticGeometry:ac(b,s,i,r),assetCache:c}}var Ln=class extends HTMLElement{static get observedAttributes(){return["bundle-url","workspace","mode","move-allowed"]}constructor(){super(),this.attachShadow({mode:"open"}),this.reloadOwner=_b(),this.reloadQueued=!1,this.reloadSource=null;let t=to();this.modes=Object.freeze({board:new $r(t),system:new Yr(t)}),this.mounted=null}get activeMode(){return this.mounted??(this.systemMode?this.modes.system:this.modes.board)}detachModes(){this.modes.board.detach(),this.modes.system.detach(),this.mounted=null}connectedCallback(){this.queueReload()}disconnectedCallback(){this.reloadOwner.cancel(),this.detachModes(),this.reloadSource=null}attributeChangedCallback(t,a,s){if(!(!this.isConnected||a===s)){if(t==="workspace"){this.modes.board.setWorkspace(this.workspace);return}if(t==="move-allowed"){this.modes.system.setMoveAllowed(s==="true");return}this.queueReload()}}get workspace(){return this.getAttribute("workspace")==="stackup"?"stackup":"pcb"}get systemMode(){return this.getAttribute("mode")==="system"}queueReload(){let t=this.systemMode?"system":this.getAttribute("bundle-url");!t||t===this.reloadSource||(this.reloadSource=t,!this.reloadQueued&&(this.reloadQueued=!0,queueMicrotask(()=>{this.reloadQueued=!1,this.isConnected&&this.reload()})))}async reload(){let t=this.getAttribute("bundle-url"),a=this.reloadOwner.begin();if(this.detachModes(),this.systemMode){await this.reloadSystem(a);return}if(!t){this.shadowRoot.innerHTML="<style>:host{display:block;height:100%;font:14px system-ui;color:#94a3b8}</style><div>Semantic bundle URL is missing.</div>";return}await Rb(this,a,{owner:this.reloadOwner,bundleUrl:t,loadBundle:Cb})}async reloadSystem(t){let{signal:a}=t,s=()=>this.reloadOwner.owns(t)&&this.isConnected;try{this.renderShell();let r=await _h({root:this.shadowRoot,loadBundle:(i,o)=>Cb(i,null,o),isActive:()=>this.getAttribute("active")==="true",onSelectionChange:i=>{a.aborted||this.emit("selectionchange",{selection:i})},onContextMenu:i=>{a.aborted||this.emit("contextmenu",i)},onViewStateChange:i=>{a.aborted||this.emitViewState(i)},onEmphasis:i=>{a.aborted||this.emit("emphasis",{results:i})},onMove:i=>{a.aborted||this.emit("move",i)},onHarness:i=>{a.aborted||this.emit("harness",i)}});if(!s()){r?.dispose?.();return}this.mounted=this.modes.system,this.mounted.attach(r,{moveAllowed:this.getAttribute("move-allowed")==="true"});let n=this.getViewState();n&&this.emitViewState(n),this.emitReady({schema:"prism.semantic_viewer_performance.a0",milestone:"system-mounted"})}catch(r){if(!s())return;this.renderError(r),this.emitError(r)}}emit(t,a){this.dispatchEvent(new CustomEvent(`prism-semantic-viewer:${t}`,{bubbles:!0,composed:!0,detail:a}))}renderLoading(){this.shadowRoot.innerHTML='<style>:host{display:block;height:100%;background:#020817;color:#e5e7eb;font:14px system-ui}</style><div style="display:grid;place-items:center;height:100%">Loading semantic visualizer...</div>'}renderShell(){this.shadowRoot.innerHTML=yM()}renderError(t){console.error(t),this.shadowRoot.innerHTML=`
      <style>
        :host{display:block;height:100%;background:#020817;color:#e5e7eb;font:14px system-ui}
        .error{height:100%;display:grid;place-items:center;padding:24px}
        pre{max-width:100%;white-space:pre-wrap;color:#fecaca;background:#111827;border:1px solid #374151;padding:16px}
      </style>
      <div class="error"><pre>${xM(t?.stack||t?.message||String(t))}</pre></div>
    `}mountViewer({topology:t,semanticGeometry:a,readiness:s,assetCache:r=null,signal:n}){return Ro({root:this.shadowRoot,topology:t,semanticGeometry:a,readiness:s,workspaceScope:"3d",assetCache:r,isActive:()=>this.getAttribute("active")==="true",onSelectionChange:i=>{n.aborted||this.dispatchEvent(new CustomEvent("prism-semantic-viewer:selectionchange",{bubbles:!0,composed:!0,detail:{selection:i}}))},onContextMenu:i=>{n.aborted||this.dispatchEvent(new CustomEvent("prism-semantic-viewer:contextmenu",{bubbles:!0,composed:!0,detail:i}))},onViewStateChange:i=>{n.aborted||this.emitViewState(i)},onPerformanceEvent:i=>{n.aborted||(console.info("[prism-3d-perf]",i),this.dispatchEvent(new CustomEvent("prism-semantic-viewer:performance",{bubbles:!0,composed:!0,detail:i})))}})}publishController(t){this.mounted=this.modes.board,this.mounted.attach(t,{workspace:this.workspace});let a=this.getViewState();a&&this.emitViewState(a)}emitViewState(t){this.dispatchEvent(new CustomEvent("prism-semantic-viewer:viewstatechange",{bubbles:!0,composed:!0,detail:t}))}emitReady(t){console.info("[prism-3d-perf]",t),this.dispatchEvent(new CustomEvent("prism-semantic-viewer:ready",{bubbles:!0,composed:!0,detail:t}))}emitError(t){this.dispatchEvent(new CustomEvent("prism-semantic-viewer:error",{bubbles:!0,detail:{error:t}}))}};cf(Ln.prototype);function Bb(){customElements.get("prism-semantic-viewer")||customElements.define("prism-semantic-viewer",Ln)}window.__PRISM_SEMANTIC_VIEWER_MANUAL_BOOT__=!0;Bb();
