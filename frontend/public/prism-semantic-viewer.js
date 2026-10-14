var xc=`:host,
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
`;var np=/\/api\/projects\/([^/]+)\/webgpu-3d\/assets\/([^/]+)\/([^/]+)\/(.+)$/,ip="prism-bundle-cache-a0",Xn="manifest.json";function $n(e){let t;try{t=new URL(e,"http://cache.invalid/")}catch{return null}let a=np.exec(t.pathname);if(!a)return null;let[,s,r,n,i]=a.map(decodeURIComponent);if(i.split("/").some(c=>!c||c==="."||c===".."))return null;let o=t.searchParams.get("viewer")||"";return`${s}/${r}/${n}/${i}${o?`?viewer=${o}`:""}`}function Hs(e){return`a_${encodeURIComponent(e)}`}function op(e,t,{maxAgeMs:a=2592e6,maxBytes:s=2147483648}={}){let r=new Set,n=[];for(let[o,c]of Object.entries(e))t-Number(c.lastUsed||0)<=a?n.push([o,c]):r.add(o);n.sort((o,c)=>Number(c[1].lastUsed)-Number(o[1].lastUsed));let i=0;for(let[o,c]of n)i+=Number(c.bytes||0),i>s&&r.add(o);return[...r]}var qs=class e{static open(t={}){return e.shared||(e.shared=new e(t)),e.shared}constructor({maxAgeMs:t=2592e6,maxBytes:a=2147483648}={}){this.maxAgeMs=t,this.maxBytes=a,this.stats={hits:0,misses:0,bypassed:0,cachedBytes:0,networkBytes:0,writeErrors:0},this.ready=this.init(),this.flushTimer=null}async init(){try{let t=globalThis.navigator?.storage;if(!t?.getDirectory)return null;let s=await(await t.getDirectory()).getDirectoryHandle(ip,{create:!0}),r=await s.getFileHandle(Xn,{create:!0});if(typeof r.createWritable!="function")return null;let n={};try{let i=await(await r.getFile()).text();n=i?JSON.parse(i).entries||{}:{}}catch{n={}}return this.directory=s,this.entries=n,await this.prune(),globalThis.addEventListener?.("pagehide",()=>void this.flush()),s}catch{return null}}get enabled(){return!!this.directory}async fetchBytes(t,{store:a=!0,signal:s}={}){let r=$n(t);if(await this.ready,r&&this.directory){let c=await this.read(r);if(c)return this.stats.hits+=1,this.stats.cachedBytes+=c.byteLength,c;this.stats.misses+=1}else this.stats.bypassed+=1;let n=await fetch(t,{cache:"no-store",signal:s});if(!n.ok)throw new Error(`Failed to load ${t}: ${n.status}`);let i=await n.arrayBuffer(),o=Number(n.headers.get("content-length")||0);return this.stats.networkBytes+=i.byteLength,a&&r&&this.directory&&(!o||o===i.byteLength)&&this.write(r,i),i}async fetchJson(t,a={}){let s=await this.fetchBytes(t,a);return JSON.parse(new TextDecoder().decode(s))}async peekJson(t){let a=$n(t);if(await this.ready,!a||!this.directory)return null;let s=await this.read(a);return s?(this.stats.hits+=1,this.stats.cachedBytes+=s.byteLength,JSON.parse(new TextDecoder().decode(s))):null}async store(t,a){let s=$n(t);await this.ready,s&&this.directory&&await this.write(s,a)}async read(t){let a=this.entries[t];if(!a)return null;try{let s=await(await this.directory.getFileHandle(Hs(t))).getFile();return s.size!==a.bytes?null:(a.lastUsed=Date.now(),this.scheduleFlush(),await s.arrayBuffer())}catch{return delete this.entries[t],null}}async write(t,a){try{let r=await(await this.directory.getFileHandle(Hs(t),{create:!0})).createWritable();await r.write(a),await r.close(),this.entries[t]={bytes:a.byteLength,lastUsed:Date.now()},this.scheduleFlush()}catch{this.stats.writeErrors+=1}}async prune(t=Date.now()){if(!this.directory)return[];let a=op(this.entries,t,{maxAgeMs:this.maxAgeMs,maxBytes:this.maxBytes});for(let r of a)delete this.entries[r],await this.directory.removeEntry(Hs(r)).catch(()=>{});let s=new Set(Object.keys(this.entries).map(Hs));for await(let r of this.directory.keys())r!==Xn&&!s.has(r)&&await this.directory.removeEntry(r).catch(()=>{});return a.length&&await this.flush(),a}async clear(){await this.ready,this.directory&&(this.entries={},await this.prune(),await this.flush())}summary(){let t=Object.values(this.entries||{});return{enabled:this.enabled,files:t.length,bytes:t.reduce((a,s)=>a+Number(s.bytes||0),0),...this.stats}}scheduleFlush(){this.flushTimer||(this.flushTimer=setTimeout(()=>{this.flushTimer=null,this.flush()},1e3))}async flush(){if(this.directory)try{let a=await(await this.directory.getFileHandle(Xn,{create:!0})).createWritable();await a.write(JSON.stringify({schema:"prism.bundle_cache_manifest.a0",entries:this.entries})),await a.close()}catch{this.stats.writeErrors+=1}}};function cp(e,t){if(!t)return e;let a=new URL(e);return a.searchParams.set("viewer",t),a.toString()}function wc(e,t,a,s){let r=new URL(a.asset_base||"./",t),n=structuredClone(e||{}),i=o=>!o||typeof o!="string"?o:cp(new URL(o,r).toString(),s);for(let o of["assets","semantic_gltf","schematic_world","schematic_vector","schematic_scene","bom"]){let c=n[o];if(!(!c||typeof c!="object"))for(let[l,f]of Object.entries(c))c[l]=i(f)}return n}function Yn(e){return(e?.readiness?.stage||"semantic-ready")==="semantic-ready"&&(e?.readiness?.progress??100)>=100}var ce=(e,t,a)=>Math.max(t,Math.min(a,e)),Xs=(e,t,a)=>e+(t-e)*a;function Ee(e,t){return[e[0]+t[0],e[1]+t[1],e[2]+t[2]]}function lp(e,t){return[e[0]-t[0],e[1]-t[1],e[2]-t[2]]}function pe(e,t){return[e[0]*t,e[1]*t,e[2]*t]}function dp(e){return Math.hypot(e[0],e[1],e[2])}function He(e){let t=dp(e)||1;return pe(e,1/t)}function qe(e,t){return[e[1]*t[2]-e[2]*t[1],e[2]*t[0]-e[0]*t[2],e[0]*t[1]-e[1]*t[0]]}function tt(e,t){return e[0]*t[0]+e[1]*t[1]+e[2]*t[2]}function vc(e,t){let a=t/2,s=Math.sin(a),r=He(e);return[r[0]*s,r[1]*s,r[2]*s,Math.cos(a)]}function Ws(e,t){return[e[3]*t[0]+e[0]*t[3]+e[1]*t[2]-e[2]*t[1],e[3]*t[1]-e[0]*t[2]+e[1]*t[3]+e[2]*t[0],e[3]*t[2]+e[0]*t[1]-e[1]*t[0]+e[2]*t[3],e[3]*t[3]-e[0]*t[0]-e[1]*t[1]-e[2]*t[2]]}function Jn(e,t){let a=[t[0],t[1],t[2],0],s=[-e[0],-e[1],-e[2],e[3]];return Ws(Ws(e,a),s).slice(0,3)}function aa(e,t){let a=new Float32Array(16);for(let s=0;s<4;s+=1)for(let r=0;r<4;r+=1)a[s*4+r]=e[r]*t[s*4]+e[4+r]*t[s*4+1]+e[8+r]*t[s*4+2]+e[12+r]*t[s*4+3];return a}function $s(e,t,a){let s=He(lp(e,t)),r=He(qe(a,s)),n=qe(s,r);return new Float32Array([r[0],n[0],s[0],0,r[1],n[1],s[1],0,r[2],n[2],s[2],0,-tt(r,e),-tt(n,e),-tt(s,e),1])}function Mc(e,t,a,s){let r=1/Math.tan(e/2);return new Float32Array([r/t,0,0,0,0,r,0,0,0,0,a/(s-a),-1,0,0,a*s/(s-a),0])}function Ys(e,t,a,s){return new Float32Array([2/e,0,0,0,0,2/t,0,0,0,0,1/(s-a),0,0,0,1,1])}function Qn(e){return[(e[0]+e[3])/2,(e[1]+e[4])/2,(e[2]+e[5])/2]}function _t(e){return Math.max(.001,Math.hypot(e[3]-e[0],e[4]-e[1],e[5]-e[2])/2)}var qa=class{constructor(t){let a=Qn(t),s=_t(t);this.focus=[...a],this.targetFocus=[...a],this.azimuth=-.62,this.targetAzimuth=this.azimuth,this.polar=.72,this.targetPolar=this.polar,this.distance=s*2.8,this.targetDistance=this.distance,this.orthoScale=s*2.15,this.targetOrthoScale=this.orthoScale,this.sceneRadius=s,this.fov=Math.PI/4}update(t){let a=1-Math.exp(-t*14);this.focus=this.focus.map((s,r)=>Xs(s,this.targetFocus[r],a)),this.azimuth=Ec(this.azimuth,this.targetAzimuth,a),this.polar=Ec(this.polar,this.targetPolar,a),this.distance=Xs(this.distance,this.targetDistance,a),this.orthoScale=Xs(this.orthoScale,this.targetOrthoScale,a)}snap(){this.focus=[...this.targetFocus],this.azimuth=this.targetAzimuth,this.polar=this.targetPolar,this.distance=this.targetDistance,this.orthoScale=this.targetOrthoScale}basis(){let t=Math.sin(this.polar),a=Math.cos(this.polar),s=He([t*Math.sin(this.azimuth),-t*Math.cos(this.azimuth),a]),r=He([Math.cos(this.azimuth),Math.sin(this.azimuth),0]),n=He(qe(s,r));return{right:r,up:n,back:s}}matrix(t,a,s=!1,r=1){let n=Math.max(.01,t/Math.max(1,a)),{up:i,back:o}=this.basis(),c=Ee(this.focus,pe(o,this.distance)),l=$s(c,this.focus,i),f=s?Ys(this.orthoScale*r*n,this.orthoScale*r,-this.sceneRadius*40,this.sceneRadius*40):Mc(this.fov,n,Math.max(this.sceneRadius*5e-4,this.distance-this.sceneRadius*3.5),this.distance+this.sceneRadius*4.5);return aa(f,l)}targetMatrix(t,a,s=!1,r=0){let n=(l,f)=>f+(f-l)*r,i=[this.focus,this.azimuth,this.polar,this.distance,this.orthoScale];this.focus=this.focus.map((l,f)=>n(l,this.targetFocus[f]));let o=(l,f)=>f+Math.atan2(Math.sin(f-l),Math.cos(f-l))*r;this.azimuth=o(this.azimuth,this.targetAzimuth),this.polar=o(this.polar,this.targetPolar),this.distance=Math.max(this.sceneRadius*.001,n(this.distance,this.targetDistance)),this.orthoScale=Math.max(this.sceneRadius*.001,n(this.orthoScale,this.targetOrthoScale));let c=this.matrix(t,a,s);return[this.focus,this.azimuth,this.polar,this.distance,this.orthoScale]=i,c}moving(){let t=(a,s)=>Math.abs(a-s)<=Math.max(1e-9,Math.abs(s)*1e-4);return!(this.focus.every((a,s)=>t(a,this.targetFocus[s]))&&t(this.azimuth,this.targetAzimuth)&&t(this.polar,this.targetPolar)&&t(this.distance,this.targetDistance)&&t(this.orthoScale,this.targetOrthoScale))}orbit(t,a){let s=Math.sin(this.targetPolar)<0?-1:1;this.targetAzimuth-=s*t*.006,this.targetPolar=kc(this.targetPolar-a*.006)}isBelow(){return Math.cos(this.targetPolar)<0}pan(t,a,s,r=!1){let{right:n,up:i}=this.basis(),o=r?this.targetOrthoScale/Math.max(1,s):2*this.targetDistance*Math.tan(this.fov/2)/Math.max(1,s),c=Ee(pe(n,-t*o),pe(i,a*o));this.targetFocus=Ee(this.targetFocus,c)}dolly(t,a=!1){let s=Math.exp(t*.0032);a?this.targetOrthoScale=ce(this.targetOrthoScale*s,this.sceneRadius*.008,this.sceneRadius*24):this.targetDistance=ce(this.targetDistance*s,this.sceneRadius*.01,this.sceneRadius*48)}frame(t){if(!t)return;let a=_t(t);this.targetFocus=Qn(t),this.targetDistance=Math.max(a*2.8,this.sceneRadius*.02),this.targetOrthoScale=Math.max(a*2.15,this.sceneRadius*.02)}setFocus(t){this.targetFocus=[...t]}setAxis(t,a=!1){t==="z"?(this.targetAzimuth=0,this.targetPolar=a?Math.PI-.015:.015):t==="x"?(this.targetAzimuth=a?-Math.PI/2:Math.PI/2,this.targetPolar=Math.PI/2):(this.targetAzimuth=a?0:Math.PI,this.targetPolar=Math.PI/2)}rotateZ(t=1){this.targetAzimuth+=t*Math.PI/2}flip(){this.targetPolar=kc(Math.PI-this.targetPolar)}};function kc(e){return Math.atan2(Math.sin(e),Math.cos(e))}function Ec(e,t,a){let s=Math.atan2(Math.sin(t-e),Math.cos(t-e));return e+s*a}var Js=class e{static async create(t,a,s={}){let r=await fetch(a,{cache:"default"});if(!r.ok)throw new Error(`Failed to load BoM ${a}: ${r.status}`);let n=await r.json();if(n.schema!=="prism.bom_a0")throw new Error(`Unsupported BoM schema: ${n.schema||"missing"}`);let i=new e(t,n,s);return i.render(),i}constructor(t,a,s){this.container=t,this.payload=a,this.callbacks=s,this.query="",this.selectedRowId="",this.selectedReference="",this.rowsById=new Map((a.rows||[]).map(r=>[r.id,r])),this.componentIndex=new Map(Object.entries(a.componentIndex||{}))}setSelectionByReference(t,a={}){let s=this.componentIndex.get(t);s&&(this.selectedReference=t,this.selectedRowId=s.rowId,this.renderContent(),a.scroll&&this.container.querySelector(`[data-row-id="${hp(s.rowId)}"]`)?.scrollIntoView({block:"center",behavior:"smooth"}))}clearSelection(){this.selectedReference="",this.selectedRowId="",this.renderContent()}render(){let t=this.filteredRows();this.container.innerHTML=`
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
            `).join("")}</td>`:!n&&fp(r)?'<td><span class="bom-missing">Missing</span></td>':`<td title="${We(n)}">${We(n)}</td>`}).join("")}
      </tr>
    `}detailHtml(t){let a=up(t,this.payload.displayColumns||[],this.payload.extraColumns||[]);return`
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
    `}bind(){let t=this.container.querySelector("#bom-search");t?.addEventListener("input",()=>{this.query=t.value,this.renderContent()}),this.bindContent(this.container)}bindContent(t){t.querySelectorAll("[data-row-id]").forEach(a=>{a.addEventListener("click",s=>{s.target.closest("[data-reference]")||(this.selectedRowId=a.dataset.rowId,this.selectedReference="",this.renderContent())})}),t.querySelectorAll("[data-reference]").forEach(a=>{a.addEventListener("click",s=>{s.stopPropagation();let r=a.dataset.reference;this.setSelectionByReference(r),this.callbacks.onSelectReference?.(r)})})}};function up(e,t,a){let s=[],r=new Set(["Reference","Qty"].map(Zn));for(let i of t){if(i==="Reference"||i==="Qty")continue;let o=e.fields?.[i]||"";o&&(s.push([i,o]),r.add(Zn(i)))}let n=e.canonicalFields||{};for(let i of a){let o=n[i]||"";if(!o)continue;let c=Zn(i);r.has(c)||(r.add(c),s.push([i,o]))}return s}function Zn(e){return String(e||"").toLowerCase().replace(/[\s_\-()[\]/]+/g,"")}function fp(e){return["Manufacturer Part Number","Vendor Part Number","Datasheet","Footprint","Value"].includes(e)}function We(e){return String(e??"").replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t])}function hp(e){return String(e).replace(/["\\]/g,"\\$&")}function ei(e){let t=`${e.nodeName||""} ${e.meshName||""} ${e.material?.name||""}`.toLowerCase();return t.includes("_pad")||t.includes(".pad")||t.endsWith("pad")?"pad":t.includes("silkscreen")?"silkscreen":t.includes("soldermask")?"soldermask":t.includes("paste")?"paste":"substrate"}function Tc(e){let t=String(e.material?.name||"").toLowerCase();if(t.endsWith("_bottom"))return"back";if(t.endsWith("_top"))return"front";let a=e.bounds;return a&&(a[2]+a[5])/2<0?"back":"front"}function Xa(e,t=()=>""){let a=new Map;for(let s of e){let n=`${t(s)}:${JSON.stringify(s.material)}`;a.has(n)||a.set(n,[]),a.get(n).push(s)}return[...a.values()].map(s=>{let r=s.reduce((h,d)=>h+d.position.length/3,0),n=s.reduce((h,d)=>h+d.indices.length,0),i=new Float32Array(r*3),o=new Float32Array(r*3),c=new Uint32Array(r),l=new Uint32Array(r),f=new Uint32Array(n),u=0,p=0,b=[1/0,1/0,1/0,-1/0,-1/0,-1/0];for(let h of s){let d=h.position.length/3;i.set(h.position,u*3),o.set(h.normal,u*3),c.set(h.netId,u),l.set(h.objectFeatureId,u);for(let x=0;x<h.indices.length;x+=1)f[p+x]=Number(h.indices[x])+u;h.bounds&&(b[0]=Math.min(b[0],h.bounds[0]),b[1]=Math.min(b[1],h.bounds[1]),b[2]=Math.min(b[2],h.bounds[2]),b[3]=Math.max(b[3],h.bounds[3]),b[4]=Math.max(b[4],h.bounds[4]),b[5]=Math.max(b[5],h.bounds[5])),u+=d,p+=h.indices.length}return{position:i,normal:o,netId:c,objectFeatureId:l,indices:f,material:s[0].material,groupKey:t(s[0]),bounds:Number.isFinite(b[0])?b:null}})}function $a(e){return!e||e.length!==6?null:[e[0]/1e3,-e[4]/1e3,e[2]/1e3,e[3]/1e3,-e[1]/1e3,e[5]/1e3]}function Qs(e){let t=e?.min||[0,0,0],a=e?.max||[.08,.0016,.05];return[t[0],-a[2],t[1],a[0],-t[2],a[1]]}function wa(e){let t=e.filter(a=>Array.isArray(a)&&a.length===6);return t.length?t.reduce((a,s)=>[Math.min(a[0],s[0]),Math.min(a[1],s[1]),Math.min(a[2],s[2]),Math.max(a[3],s[3]),Math.max(a[4],s[4]),Math.max(a[5],s[5])],[...t[0]]):null}function Sc(e){let t=e.replace("#","");return[0,2,4].map(a=>parseInt(t.slice(a,a+2),16)/255)}function Ac(e,t){if(typeof e?.color=="string"&&/^#[0-9a-fA-F]{6}$/.test(e.color))return[...Sc(e.color),1];let a={"F.Cu":"#a9423c","B.Cu":"#315b9a","In1.Cu":"#477a55","In2.Cu":"#806244","In3.Cu":"#347c86","In4.Cu":"#685889","In5.Cu":"#92793e"},s=["#477a55","#806244","#347c86","#685889","#92793e","#82556e"],r=String(e?.name||""),n=Math.max(0,t.findIndex(i=>i.name===r)-1);return[...Sc(a[r]||s[n%s.length]),1]}function Ic(e,t){let a=t.map(s=>[Number(s.id),Number(s.z_mm||0)]);return a.length<3?!1:(a.sort((s,r)=>s[1]-r[1]),e!==a[0][0]&&e!==a[a.length-1][0])}var Wa=Object.freeze({gold:[.83,.69,.37,1],silver:[.74,.75,.77,1],copper:[.76,.47,.28,1]});function _c(e){let t=String(e||"").toLowerCase();return/hasl|hal\b|tin|silver|lead/.test(t)?Wa.silver:/osp|bare|none/.test(t)?Wa.copper:Wa.gold}function Rc(e,t){let a=String(e?.name||"");return!!a&&(a===t[0]?.name||a===t[t.length-1]?.name)}function Nc(e,t){let a=String(e.material?.name||"").endsWith("_bottom"),s=t.find(r=>r.name===(a?"B.Cu":"F.Cu"))||(a?t[t.length-1]:t[0]);return Number(s?.id||0)}function Cc(e,t=new Map){let a=new Map;for(let r of e||[]){let n=String(r?.designator||"");if(!n)continue;let i=a.get(n)||{reference:n,featureIds:new Set,modelCount:0},o=Number(r?.featureId)||0;o>0&&i.featureIds.add(o),a.set(n,i)}for(let[r,n]of t||[]){let i=a.get(String(r));i&&(i.modelCount=Math.max(i.modelCount,Number(n)||0))}let s=new Map;for(let[r,n]of a)s.set(r,{reference:r,featureIds:[...n.featureIds].sort((i,o)=>i-o),ambiguous:n.featureIds.size>1||n.modelCount>1});return s}function Bc(e,t){let a=[...new Set((Array.isArray(e)?e:[]).map(c=>String(c||"")).filter(Boolean))],s=[],r=[],n=[],i=new Set,o=new Set;for(let c of a){let l=t.get(c);if(!l){n.push(c);continue}if(l.ambiguous){r.push(c);continue}s.push(c),o.add(c);for(let f of l.featureIds)i.add(f)}return{requested:a,applied:s,ambiguous:r,unknown:n,hiddenFeatureIds:i,hiddenReferences:o}}function Zs(e,t){return!!e&&t.has(String(e))}var bp={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};function V(e){return String(e??"").replace(/[&<>"']/g,t=>bp[t])}var Ya=`
fn netEmphasized(id: u32) -> bool {
  return id != 0u && id < arrayLength(&netMask) && netMask[id] != 0u;
}
`;function er(e){let t=new Set;if(e==null)return t;for(let a of e){let s=Number(a);!Number.isInteger(s)||s<=0||s>4294967295||t.add(s)}return t}function Fc(e,t=0){let a=0;for(let r of er(e))a=Math.max(a,r);let s=64;for(;s<a+1;)s*=2;return Math.max(s,Math.floor(t)||0)}function Oc(e,t){let a=Math.max(64,Math.floor(t)||0),s=new Uint32Array(a);s.fill(0);for(let r of er(e))r<a&&(s[r]=1);return s}function sa(e,t){return!Array.isArray(e)||!t?null:e.find(a=>a.name===t||Array.isArray(a.aliases)&&a.aliases.includes(t))||null}function Pc(e,t){let a=new Set;if(!Array.isArray(e)||!Array.isArray(t))return a;for(let s of t){if(!s)continue;let r=s.netUid&&e.find(i=>i.uid===s.netUid)||s.netName&&sa(e,s.netName),n=Number(r?.id);Number.isInteger(n)&&n>0&&a.add(n)}return a}var ti=Object.freeze([[.08,1,.2],[1,.72,.1],[.2,.75,1],[1,.3,.75],[.65,.45,1],[1,.45,.2],[.3,1,.85],[.95,.95,.3]]),jc=`
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
`;function Lc(e){let t=null;return Array.isArray(e)&&e.length>=3&&e.slice(0,3).every(a=>Number.isFinite(Number(a)))?t=e.slice(0,3).map(a=>Math.round(Math.min(1,Math.max(0,Number(a)))*255)):typeof e=="string"&&/^#[0-9a-f]{6}$/i.test(e)&&(t=[1,3,5].map(a=>parseInt(e.slice(a,a+2),16))),t?(1<<24|t[0]<<16|t[1]<<8|t[2])>>>0:1}function Dc(e){let t=1;for(let s of e)for(let r of s?.keys()||[])t=Math.max(t,r+1);let a=new Uint32Array(Math.max(64,e.length*t));return e.forEach((s,r)=>{for(let[n,i]of s||[])Number.isInteger(n)&&n>0&&(a[r*t+n]=i>>>0)}),{stride:t,data:a}}function pp(e){return(typeof e.composedPath=="function"?e.composedPath():[])[0]??e.target??null}function Uc(e){let t=pp(e);if(!t||typeof t!="object")return!1;let a=typeof t.tagName=="string"?t.tagName.toUpperCase():"";return a==="INPUT"||a==="TEXTAREA"||a==="SELECT"||t.isContentEditable===!0}function zc(e){return!!(e.metaKey||e.ctrlKey)}var gp=4;function Gc(e,t=gp){let a=new Map,s=[];for(let n of e){if(n.placements.length<t){for(let o of n.placements)s.push(mp(n.primitive,o));continue}let i=`${n.placements.map(o=>o.node).join(",")}|${JSON.stringify(n.primitive.material)}`;a.has(i)||a.set(i,[]),a.get(i).push(n)}return{instanced:[...a.values()].map(n=>({primitive:yp(n.map(i=>i.primitive)),placements:n[0].placements})),baked:Xa(s)}}function mp(e,t){let{rows:a,featureId:s,bounds:r}=t,n=e.position.length/3,i=new Float32Array(n*3),o=new Float32Array(n*3),c=new Uint32Array(n);for(let l=0;l<n;l+=1){let f=l*3,[u,p,b]=[e.position[f],e.position[f+1],e.position[f+2]],[h,d,x]=[e.normal[f],e.normal[f+1],e.normal[f+2]],g=0;for(let y=0;y<3;y+=1){let m=y*4;i[f+y]=a[m]*u+a[m+1]*p+a[m+2]*b+a[m+3],o[f+y]=a[m]*h+a[m+1]*d+a[m+2]*x,g+=o[f+y]**2}g=Math.sqrt(g)||1;for(let y=0;y<3;y+=1)o[f+y]/=g;c[l]=e.objectFeatureId[l]||s||0}return{position:i,normal:o,netId:e.netId,objectFeatureId:c,indices:e.indices,material:e.material,bounds:[...r]}}function yp(e){if(e.length===1)return e[0];let t=e.reduce((u,p)=>u+p.position.length/3,0),a=e.reduce((u,p)=>u+p.indices.length,0),s=new Float32Array(t*3),r=new Float32Array(t*3),n=new Uint32Array(t),i=new Uint32Array(t),o=new Uint32Array(a),c=[1/0,1/0,1/0,-1/0,-1/0,-1/0],l=0,f=0;for(let u of e){s.set(u.position,l*3),r.set(u.normal,l*3),n.set(u.netId,l),i.set(u.objectFeatureId,l);for(let p=0;p<u.indices.length;p+=1)o[f+p]=u.indices[p]+l;for(let p=0;p<3;p+=1)c[p]=Math.min(c[p],u.bounds[p]),c[p+3]=Math.max(c[p+3],u.bounds[p+3]);l+=u.position.length/3,f+=u.indices.length}return{position:s,normal:r,netId:n,objectFeatureId:i,indices:o,material:e[0].material,bounds:c}}var Kc=class{_listeners={};addEventListener(e,t){let a=this._listeners;return a[e]===void 0&&(a[e]=[]),a[e].indexOf(t)===-1&&a[e].push(t),this}removeEventListener(e,t){let a=this._listeners[e];if(a!==void 0){let s=a.indexOf(t);s!==-1&&a.splice(s,1)}return this}dispatchEvent(e){let t=this._listeners[e.type];if(t!==void 0){let a=t.slice(0);for(let s=0,r=a.length;s<r;s++)a[s].call(this,e)}return this}dispose(){for(let e in this._listeners)delete this._listeners[e]}},Nt=class{_disposed=!1;_name;_parent;_child;_attributes;constructor(e,t,a,s={}){if(this._name=e,this._parent=t,this._child=a,this._attributes=s,!t.isOnGraph(a))throw new Error("Cannot connect disconnected graphs.")}getName(){return this._name}getParent(){return this._parent}getChild(){return this._child}setChild(e){return this._child=e,this}getAttributes(){return this._attributes}dispose(){this._disposed||(this._parent._destroyRef(this),this._disposed=!0)}isDisposed(){return this._disposed}},ai=class extends Kc{_emptySet=new Set;_edges=new Set;_parentEdges=new Map;_childEdges=new Map;listEdges(){return Array.from(this._edges)}listParentEdges(e){return Array.from(this._childEdges.get(e)||this._emptySet)}listParents(e){let t=new Set;for(let a of this.listParentEdges(e))t.add(a.getParent());return Array.from(t)}listChildEdges(e){return Array.from(this._parentEdges.get(e)||this._emptySet)}listChildren(e){let t=new Set;for(let a of this.listChildEdges(e))t.add(a.getChild());return Array.from(t)}disconnectParents(e,t){for(let a of this.listParentEdges(e))(!t||t(a.getParent()))&&a.dispose();return this}_createEdge(e,t,a,s){let r=new Nt(e,t,a,s);this._edges.add(r);let n=r.getParent();this._parentEdges.has(n)||this._parentEdges.set(n,new Set),this._parentEdges.get(n).add(r);let i=r.getChild();return this._childEdges.has(i)||this._childEdges.set(i,new Set),this._childEdges.get(i).add(r),r}_destroyEdge(e){return this._edges.delete(e),this._parentEdges.get(e.getParent()).delete(e),this._childEdges.get(e.getChild()).delete(e),this}},Se=class{list=[];constructor(e){if(e)for(let t of e)this.list.push(t)}add(e){this.list.push(e)}remove(e){let t=this.list.indexOf(e);t>=0&&this.list.splice(t,1)}removeChild(e){let t=[];for(let a of this.list)a.getChild()===e&&t.push(a);for(let a of t)this.remove(a);return t}listRefsByChild(e){let t=[];for(let a of this.list)a.getChild()===e&&t.push(a);return t}values(){return this.list}},ne=class{set=new Set;map=new Map;constructor(e){if(e)for(let t of e)this.add(t)}add(e){let t=e.getChild();this.removeChild(t),this.set.add(e),this.map.set(t,e)}remove(e){this.set.delete(e),this.map.delete(e.getChild())}removeChild(e){let t=this.map.get(e)||null;return t&&this.remove(t),t}getRefByChild(e){return this.map.get(e)||null}values(){return Array.from(this.set)}},ge=class{map={};constructor(e){e&&Object.assign(this.map,e)}set(e,t){this.map[e]=t}delete(e){delete this.map[e]}get(e){return this.map[e]||null}keys(){return Object.keys(this.map)}values(){return Object.values(this.map)}},ee=Symbol("attributes"),Rt=Symbol("immutableKeys"),Vc=class Hc extends Kc{_disposed=!1;graph;[ee];[Rt];constructor(t){super(),this.graph=t,this[Rt]=new Set,this[ee]=this._createAttributes()}getDefaults(){return{}}_createAttributes(){let t=this.getDefaults(),a={};for(let s in t){let r=t[s];if(r instanceof Hc){let n=this.graph._createEdge(s,this,r);this[Rt].add(s),a[s]=n}else a[s]=r}return a}isOnGraph(t){return this.graph===t.graph}isDisposed(){return this._disposed}dispose(){this._disposed||(this.graph.listChildEdges(this).forEach(t=>t.dispose()),this.graph.disconnectParents(this),this._disposed=!0,this.dispatchEvent({type:"dispose"}))}detach(){return this.graph.disconnectParents(this),this}swap(t,a){for(let s in this[ee]){let r=this[ee][s];if(r instanceof Nt){let n=r;n.getChild()===t&&this.setRef(s,a,n.getAttributes())}else if(r instanceof Se)for(let n of r.listRefsByChild(t)){let i=n.getAttributes();this.removeRef(s,t),this.addRef(s,a,i)}else if(r instanceof ne){let n=r.getRefByChild(t);if(n){let i=n.getAttributes();this.removeRef(s,t),this.addRef(s,a,i)}}else if(r instanceof ge)for(let n of r.keys()){let i=r.get(n);i.getChild()===t&&this.setRefMap(s,n,a,i.getAttributes())}}return this}get(t){return this[ee][t]}set(t,a){return this[ee][t]=a,this.dispatchEvent({type:"change",attribute:t})}getRef(t){let a=this[ee][t];return a?a.getChild():null}setRef(t,a,s){if(this[Rt].has(t))throw new Error(`Cannot overwrite immutable attribute, "${t}".`);let r=this[ee][t];if(r&&r.dispose(),!a)return this;let n=this.graph._createEdge(t,this,a,s);return this[ee][t]=n,this.dispatchEvent({type:"change",attribute:t})}listRefs(t){return this.assertRefList(t).values().map(a=>a.getChild())}addRef(t,a,s){let r=this.graph._createEdge(t,this,a,s);return this.assertRefList(t).add(r),this.dispatchEvent({type:"change",attribute:t})}removeRef(t,a){let s=this.assertRefList(t);if(s instanceof Se)for(let r of s.listRefsByChild(a))r.dispose();else{let r=s.getRefByChild(a);r&&r.dispose()}return this}assertRefList(t){let a=this[ee][t];if(a instanceof Se||a instanceof ne)return a;throw new Error(`Expected RefList or RefSet for attribute "${t}"`)}listRefMapKeys(t){return this.assertRefMap(t).keys()}listRefMapValues(t){return this.assertRefMap(t).values().map(a=>a.getChild())}getRefMap(t,a){let s=this.assertRefMap(t).get(a);return s?s.getChild():null}setRefMap(t,a,s,r){let n=this.assertRefMap(t),i=n.get(a);if(i&&i.dispose(),!s)return this;r=Object.assign(r||{},{key:a});let o=this.graph._createEdge(t,this,s,{...r,key:a});return n.set(a,o),this.dispatchEvent({type:"change",attribute:t,key:a})}assertRefMap(t){let a=this[ee][t];if(a instanceof ge)return a;throw new Error(`Expected RefMap for attribute "${t}"`)}dispatchEvent(t){return super.dispatchEvent({...t,target:this}),this.graph.dispatchEvent({...t,target:this,type:`node:${t.type}`}),this}_destroyRef(t){let a=t.getName();if(this[ee][a]===t)this[ee][a]=null,this[Rt].has(a)&&t.getChild().dispose();else if(this[ee][a]instanceof Se)this[ee][a].remove(t);else if(this[ee][a]instanceof ne)this[ee][a].remove(t);else if(this[ee][a]instanceof ge){let s=this[ee][a];for(let r of s.keys())s.get(r)===t&&s.delete(r)}else return;this.graph._destroyEdge(t),this.dispatchEvent({type:"change",attribute:a})}};var Qc="v4.4.2",Bt="@glb.bin",O=(function(e){return e.ACCESSOR="Accessor",e.ANIMATION="Animation",e.ANIMATION_CHANNEL="AnimationChannel",e.ANIMATION_SAMPLER="AnimationSampler",e.BUFFER="Buffer",e.CAMERA="Camera",e.MATERIAL="Material",e.MESH="Mesh",e.PRIMITIVE="Primitive",e.PRIMITIVE_TARGET="PrimitiveTarget",e.NODE="Node",e.ROOT="Root",e.SCENE="Scene",e.SKIN="Skin",e.TEXTURE="Texture",e.TEXTURE_INFO="TextureInfo",e})({});var xp=(function(e){return e.ARRAY_BUFFER="ARRAY_BUFFER",e.ELEMENT_ARRAY_BUFFER="ELEMENT_ARRAY_BUFFER",e.INVERSE_BIND_MATRICES="INVERSE_BIND_MATRICES",e.OTHER="OTHER",e.SPARSE="SPARSE",e})({}),at=(function(e){return e[e.R=4096]="R",e[e.G=256]="G",e[e.B=16]="B",e[e.A=1]="A",e})({});var wp=class extends Float32Array{constructor(){throw super(),new Error("Unsupported typed array instantiation.")}},cr={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5131:typeof Float16Array<"u"?Float16Array:wp,5126:Float32Array,5130:Float64Array},q=class{static createBufferFromDataURI(e){if(typeof Buffer>"u"){let t=atob(e.split(",")[1]),a=new Uint8Array(t.length);for(let s=0;s<t.length;s++)a[s]=t.charCodeAt(s);return a}else{let t=e.split(",")[1],a=e.indexOf("base64")>=0;return Buffer.from(t,a?"base64":"utf8")}}static encodeText(e){return new TextEncoder().encode(e)}static decodeText(e){return new TextDecoder().decode(e)}static concat(e){let t=0;for(let r of e)t+=r.byteLength;let a=new Uint8Array(t),s=0;for(let r of e)a.set(r,s),s+=r.byteLength;return a}static pad(e,t=0){let a=this.padNumber(e.byteLength);if(a===e.byteLength)return e;let s=new Uint8Array(a);if(s.set(e),t!==0)for(let r=e.byteLength;r<a;r++)s[r]=t;return s}static padNumber(e){return Math.ceil(e/4)*4}static equals(e,t){if(e===t)return!0;if(e.byteLength!==t.byteLength)return!1;let a=e.byteLength;for(;a--;)if(e[a]!==t[a])return!1;return!0}static toView(e,t=0,a=1/0){return new Uint8Array(e.buffer,e.byteOffset+t,Math.min(e.byteLength,a))}static assertView(e){if(e&&!ArrayBuffer.isView(e))throw new Error(`Method requires Uint8Array parameter; received "${typeof e}".`);return e}};var vp=class{match(e){return e.length>=3&&e[0]===255&&e[1]===216&&e[2]===255}getSize(e){let t=new DataView(e.buffer,e.byteOffset+4),a,s;for(;t.byteLength;){if(a=t.getUint16(0,!1),kp(t,a),s=t.getUint8(a+1),s===192||s===193||s===194)return[t.getUint16(a+7,!1),t.getUint16(a+5,!1)];t=new DataView(e.buffer,t.byteOffset+a+2)}throw new TypeError("Invalid JPG, no size found")}getChannels(e){return 3}},Mp=class Zc{static PNG_FRIED_CHUNK_NAME="CgBI";match(t){return t.length>=8&&t[0]===137&&t[1]===80&&t[2]===78&&t[3]===71&&t[4]===13&&t[5]===10&&t[6]===26&&t[7]===10}getSize(t){let a=new DataView(t.buffer,t.byteOffset);return q.decodeText(t.slice(12,16))===Zc.PNG_FRIED_CHUNK_NAME?[a.getUint32(32,!1),a.getUint32(36,!1)]:[a.getUint32(16,!1),a.getUint32(20,!1)]}getChannels(t){return 4}},lt=class{static impls={"image/jpeg":new vp,"image/png":new Mp};static registerFormat(e,t){this.impls[e]=t}static getMimeType(e){for(let t in this.impls)if(this.impls[t].match(e))return t;return null}static getSize(e,t){return this.impls[t]?this.impls[t].getSize(e):null}static getChannels(e,t){return this.impls[t]?this.impls[t].getChannels(e):null}static getVRAMByteLength(e,t){if(!this.impls[t])return null;if(this.impls[t].getVRAMByteLength)return this.impls[t].getVRAMByteLength(e);let a=0,s=4,r=this.getSize(e,t);if(!r)return null;for(;r[0]>1||r[1]>1;)a+=r[0]*r[1]*s,r[0]=Math.max(Math.floor(r[0]/2),1),r[1]=Math.max(Math.floor(r[1]/2),1);return a+=1*s,a}static mimeTypeToExtension(e){return e==="image/jpeg"?"jpg":e.split("/").pop()}static extensionToMimeType(e){return e==="jpg"?"image/jpeg":e?`image/${e}`:""}};function kp(e,t){if(t>e.byteLength)throw new TypeError("Corrupt JPG, exceeded buffer limits");if(e.getUint8(t)!==255)throw new TypeError("Invalid JPG, marker table corrupted");return e}var va=class{static basename(e){let t=e.split(/[\\/]/).pop();return t.substring(0,t.lastIndexOf("."))}static extension(e){if(e.startsWith("data:image/")){let t=e.match(/data:(image\/\w+)/)[1];return lt.mimeTypeToExtension(t)}else{if(e.startsWith("data:model/gltf+json"))return"gltf";if(e.startsWith("data:model/gltf-binary"))return"glb";if(e.startsWith("data:application/"))return"bin"}return e.split(/[\\/]/).pop().split(/[.]/).pop()}},ni=typeof Float32Array<"u"?Float32Array:Array;Math.PI/180;180/Math.PI;function Ep(){var e=new ni(3);return ni!=Float32Array&&(e[0]=0,e[1]=0,e[2]=0),e}function si(e){var t=e[0],a=e[1],s=e[2];return Math.sqrt(t*t+a*a+s*s)}function Sp(e,t,a){var s=t[0],r=t[1],n=t[2],i=a[3]*s+a[7]*r+a[11]*n+a[15];return i=i||1,e[0]=(a[0]*s+a[4]*r+a[8]*n+a[12])/i,e[1]=(a[1]*s+a[5]*r+a[9]*n+a[13])/i,e[2]=(a[2]*s+a[6]*r+a[10]*n+a[14])/i,e}(function(){var e=Ep();return function(t,a,s,r,n,i){var o,c;for(a||(a=3),s||(s=0),r?c=Math.min(r*a+s,t.length):c=t.length,o=s;o<c;o+=a)e[0]=t[o],e[1]=t[o+1],e[2]=t[o+2],n(e,e,i),t[o]=e[0],t[o+1]=e[1],t[o+2]=e[2];return t}})();function el(e){let t=tl(),a=e.propertyType==="Node"?[e]:e.listChildren();for(let s of a)s.traverse(r=>{let n=r.getMesh();if(!n)return;let i=Tp(n,r.getWorldMatrix());i.min.every(isFinite)&&i.max.every(isFinite)&&(ii(i.min,t),ii(i.max,t))});return t}function Tp(e,t){let a=tl();for(let s of e.listPrimitives()){let r=s.getAttribute("POSITION"),n=s.getIndices();if(!r)continue;let i=[0,0,0],o=[0,0,0];for(let c=0,l=n?n.getCount():r.getCount();c<l;c++){let f=n?n.getScalar(c):c;i=r.getElement(f,i),o=Sp(o,i,t),ii(o,a)}}return a}function ii(e,t){for(let a=0;a<3;a++)t.min[a]=Math.min(e[a],t.min[a]),t.max[a]=Math.max(e[a],t.max[a])}function tl(){return{min:[1/0,1/0,1/0],max:[-1/0,-1/0,-1/0]}}var qc="https://null.example",ri=class{static DEFAULT_INIT={};static PROTOCOL_REGEXP=/^[a-zA-Z]+:\/\//;static dirname(e){let t=e.lastIndexOf("/");return t===-1?"./":e.substring(0,t+1)}static basename(e){return va.basename(new URL(e,qc).pathname)}static extension(e){return va.extension(new URL(e,qc).pathname)}static resolve(e,t){if(!this.isRelativePath(t))return t;let a=e.split("/"),s=t.split("/");a.pop();for(let r=0;r<s.length;r++)s[r]!=="."&&(s[r]===".."?a.pop():a.push(s[r]));return a.join("/")}static isAbsoluteURL(e){return this.PROTOCOL_REGEXP.test(e)}static isRelativePath(e){return!/^(?:[a-zA-Z]+:)?\//.test(e)}};function Wc(e){return Object.prototype.toString.call(e)==="[object Object]"}function ra(e){if(Wc(e)===!1)return!1;let t=e.constructor;if(t===void 0)return!0;let a=t.prototype;return!(Wc(a)===!1||Object.hasOwn(a,"isPrototypeOf")===!1)}var Ap=(function(e){return e[e.SILENT=4]="SILENT",e[e.ERROR=3]="ERROR",e[e.WARN=2]="WARN",e[e.INFO=1]="INFO",e[e.DEBUG=0]="DEBUG",e})({}),lr=class al{verbosity;static Verbosity=Ap;static DEFAULT_INSTANCE=new al(1);constructor(t){this.verbosity=t}debug(t){this.verbosity<=0&&console.debug(t)}info(t){this.verbosity<=1&&console.info(t)}warn(t){this.verbosity<=2&&console.warn(t)}error(t){this.verbosity<=3&&console.error(t)}};function Ip(e){var t=e[0],a=e[1],s=e[2],r=e[3],n=e[4],i=e[5],o=e[6],c=e[7],l=e[8],f=e[9],u=e[10],p=e[11],b=e[12],h=e[13],d=e[14],x=e[15],g=t*i-a*n,y=t*o-s*n,m=a*o-s*i,v=l*h-f*b,E=l*d-u*b,S=f*d-u*h,A=t*S-a*E+s*v,T=n*S-i*E+o*v,_=l*m-f*y+u*g,R=b*m-h*y+d*g;return c*A-r*T+x*_-p*R}function _p(e,t,a){var s=t[0],r=t[1],n=t[2],i=t[3],o=t[4],c=t[5],l=t[6],f=t[7],u=t[8],p=t[9],b=t[10],h=t[11],d=t[12],x=t[13],g=t[14],y=t[15],m=a[0],v=a[1],E=a[2],S=a[3];return e[0]=m*s+v*o+E*u+S*d,e[1]=m*r+v*c+E*p+S*x,e[2]=m*n+v*l+E*b+S*g,e[3]=m*i+v*f+E*h+S*y,m=a[4],v=a[5],E=a[6],S=a[7],e[4]=m*s+v*o+E*u+S*d,e[5]=m*r+v*c+E*p+S*x,e[6]=m*n+v*l+E*b+S*g,e[7]=m*i+v*f+E*h+S*y,m=a[8],v=a[9],E=a[10],S=a[11],e[8]=m*s+v*o+E*u+S*d,e[9]=m*r+v*c+E*p+S*x,e[10]=m*n+v*l+E*b+S*g,e[11]=m*i+v*f+E*h+S*y,m=a[12],v=a[13],E=a[14],S=a[15],e[12]=m*s+v*o+E*u+S*d,e[13]=m*r+v*c+E*p+S*x,e[14]=m*n+v*l+E*b+S*g,e[15]=m*i+v*f+E*h+S*y,e}function Rp(e,t){var a=t[0],s=t[1],r=t[2],n=t[4],i=t[5],o=t[6],c=t[8],l=t[9],f=t[10];return e[0]=Math.sqrt(a*a+s*s+r*r),e[1]=Math.sqrt(n*n+i*i+o*o),e[2]=Math.sqrt(c*c+l*l+f*f),e}function Np(e,t){var a=new ni(3);Rp(a,t);var s=1/a[0],r=1/a[1],n=1/a[2],i=t[0]*s,o=t[1]*r,c=t[2]*n,l=t[4]*s,f=t[5]*r,u=t[6]*n,p=t[8]*s,b=t[9]*r,h=t[10]*n,d=i+f+h,x=0;return d>0?(x=Math.sqrt(d+1)*2,e[3]=.25*x,e[0]=(u-b)/x,e[1]=(p-c)/x,e[2]=(o-l)/x):i>f&&i>h?(x=Math.sqrt(1+i-f-h)*2,e[3]=(u-b)/x,e[0]=.25*x,e[1]=(o+l)/x,e[2]=(p+c)/x):f>h?(x=Math.sqrt(1+f-i-h)*2,e[3]=(p-c)/x,e[0]=(o+l)/x,e[1]=.25*x,e[2]=(u+b)/x):(x=Math.sqrt(1+h-i-f)*2,e[3]=(o-l)/x,e[0]=(p+c)/x,e[1]=(u+b)/x,e[2]=.25*x),e}var le=class Ja{static identity(t){return t}static eq(t,a,s=1e-5){if(t.length!==a.length)return!1;for(let r=0;r<t.length;r++)if(Math.abs(t[r]-a[r])>s)return!1;return!0}static clamp(t,a,s){return t<a?a:t>s?s:t}static decodeNormalizedInt(t,a){switch(a){case 5126:return t;case 5123:return t/65535;case 5121:return t/255;case 5122:return Math.max(t/32767,-1);case 5120:return Math.max(t/127,-1);default:throw new Error("Invalid component type.")}}static encodeNormalizedInt(t,a){switch(a){case 5126:return t;case 5123:return Math.round(Ja.clamp(t,0,1)*65535);case 5121:return Math.round(Ja.clamp(t,0,1)*255);case 5122:return Math.round(Ja.clamp(t,-1,1)*32767);case 5120:return Math.round(Ja.clamp(t,-1,1)*127);default:throw new Error("Invalid component type.")}}static decompose(t,a,s,r){let n=si([t[0],t[1],t[2]]),i=si([t[4],t[5],t[6]]),o=si([t[8],t[9],t[10]]);Ip(t)<0&&(n=-n),a[0]=t[12],a[1]=t[13],a[2]=t[14];let c=t.slice(),l=1/n,f=1/i,u=1/o;c[0]*=l,c[1]*=l,c[2]*=l,c[4]*=f,c[5]*=f,c[6]*=f,c[8]*=u,c[9]*=u,c[10]*=u,Np(s,c),r[0]=n,r[1]=i,r[2]=o}static compose(t,a,s,r){let n=r,i=a[0],o=a[1],c=a[2],l=a[3],f=i+i,u=o+o,p=c+c,b=i*f,h=i*u,d=i*p,x=o*u,g=o*p,y=c*p,m=l*f,v=l*u,E=l*p,S=s[0],A=s[1],T=s[2];return n[0]=(1-(x+y))*S,n[1]=(h+E)*S,n[2]=(d-v)*S,n[3]=0,n[4]=(h-E)*A,n[5]=(1-(b+y))*A,n[6]=(g+m)*A,n[7]=0,n[8]=(d+v)*T,n[9]=(g-m)*T,n[10]=(1-(b+x))*T,n[11]=0,n[12]=t[0],n[13]=t[1],n[14]=t[2],n[15]=1,n}};function Cp(e,t){if(!!e!=!!t)return!1;let a=e.getChild(),s=t.getChild();return a===s||a.equals(s)}function Bp(e,t){if(!!e!=!!t)return!1;let a=e.values(),s=t.values();if(a.length!==s.length)return!1;for(let r=0;r<a.length;r++){let n=a[r],i=s[r];if(n.getChild()!==i.getChild()&&!n.getChild().equals(i.getChild()))return!1}return!0}function Fp(e,t){if(!!e!=!!t)return!1;let a=e.keys(),s=t.keys();if(a.length!==s.length)return!1;for(let r of a){let n=e.get(r),i=t.get(r);if(!!n!=!!i)return!1;let o=n.getChild(),c=i.getChild();if(o!==c&&!o.equals(c))return!1}return!0}function sl(e,t){if(e===t)return!0;if(!!e!=!!t||!e||!t||e.length!==t.length)return!1;for(let a=0;a<e.length;a++)if(e[a]!==t[a])return!1;return!0}function rl(e,t){if(e===t)return!0;if(!!e!=!!t)return!1;if(!ra(e)||!ra(t))return e===t;let a=e,s=t,r=0,n=0,i;for(i in a)r++;for(i in s)n++;if(r!==n)return!1;for(i in a){let o=a[i],c=s[i];if(ir(o)&&ir(c)){if(!sl(o,c))return!1}else if(ra(o)&&ra(c)){if(!rl(o,c))return!1}else if(o!==c)return!1}return!0}function ir(e){return Array.isArray(e)||ArrayBuffer.isView(e)}var Op="23456789abdegjkmnpqrvwxyzABDEGJKMNPQRVWXYZ",Pp=999,jp=6,Xc=new Set,Lp=function(){let e="";for(let t=0;t<jp;t++)e+=Op.charAt(Math.floor(Math.random()*42));return e},Dp=function(){for(let e=0;e<Pp;e++){let t=Lp();if(!Xc.has(t))return Xc.add(t),t}return""},Ft=e=>e,Up=new Set,li=class extends Vc{constructor(e,t=""){super(e),this[ee].name=t,this.init(),this.dispatchEvent({type:"create"})}getGraph(){return this.graph}getDefaults(){return Object.assign(super.getDefaults(),{name:"",extras:{}})}set(e,t){return Array.isArray(t)&&(t=t.slice()),super.set(e,t)}getName(){return this.get("name")}setName(e){return this.set("name",e)}getExtras(){return this.get("extras")}setExtras(e){return this.set("extras",e)}clone(){let e=this.constructor;return new e(this.graph).copy(this,Ft)}copy(e,t=Ft){for(let a in this[ee]){let s=this[ee][a];if(s instanceof Nt)this[Rt].has(a)||s.dispose();else if(s instanceof Se||s instanceof ne)for(let r of s.values())r.dispose();else if(s instanceof ge)for(let r of s.values())r.dispose()}for(let a in e[ee]){let s=this[ee][a],r=e[ee][a];if(r instanceof Nt)this[Rt].has(a)?s.getChild().copy(t(r.getChild()),t):this.setRef(a,t(r.getChild()),r.getAttributes());else if(r instanceof ne||r instanceof Se)for(let n of r.values())this.addRef(a,t(n.getChild()),n.getAttributes());else if(r instanceof ge)for(let n of r.keys()){let i=r.get(n);this.setRefMap(a,n,t(i.getChild()),i.getAttributes())}else ra(r)?this[ee][a]=JSON.parse(JSON.stringify(r)):Array.isArray(r)||r instanceof ArrayBuffer||ArrayBuffer.isView(r)?this[ee][a]=r.slice():this[ee][a]=r}return this}equals(e,t=Up){if(this===e)return!0;if(this.propertyType!==e.propertyType)return!1;for(let a in this[ee]){if(t.has(a))continue;let s=this[ee][a],r=e[ee][a];if(s instanceof Nt||r instanceof Nt){if(!Cp(s,r))return!1}else if(s instanceof ne||r instanceof ne||s instanceof Se||r instanceof Se){if(!Bp(s,r))return!1}else if(s instanceof ge||r instanceof ge){if(!Fp(s,r))return!1}else if(ra(s)||ra(r)){if(!rl(s,r))return!1}else if(ir(s)||ir(r)){if(!sl(s,r))return!1}else if(s!==r)return!1}return!0}detach(){return this.graph.disconnectParents(this,e=>e.propertyType!=="Root"),this}listParents(){return this.graph.listParents(this)}},Ne=class extends li{getDefaults(){return Object.assign(super.getDefaults(),{extensions:new ge})}getExtension(e){return this.getRefMap("extensions",e)}setExtension(e,t){return t&&t._validateParent(this),this.setRefMap("extensions",e,t)}listExtensions(){return this.listRefMapValues("extensions")}},G=class me extends Ne{static Type={SCALAR:"SCALAR",VEC2:"VEC2",VEC3:"VEC3",VEC4:"VEC4",MAT2:"MAT2",MAT3:"MAT3",MAT4:"MAT4"};static ComponentType={BYTE:5120,UNSIGNED_BYTE:5121,SHORT:5122,UNSIGNED_SHORT:5123,UNSIGNED_INT:5125,FLOAT:5126,FLOAT16:5131,FLOAT64:5130};init(){this.propertyType="Accessor"}getDefaults(){return Object.assign(super.getDefaults(),{array:null,type:me.Type.SCALAR,componentType:me.ComponentType.FLOAT,normalized:!1,sparse:!1,buffer:null})}static getElementSize(t){switch(t){case me.Type.SCALAR:return 1;case me.Type.VEC2:return 2;case me.Type.VEC3:return 3;case me.Type.VEC4:return 4;case me.Type.MAT2:return 4;case me.Type.MAT3:return 9;case me.Type.MAT4:return 16;default:throw new Error("Unexpected type: "+t)}}static getComponentSize(t){switch(t){case me.ComponentType.BYTE:case me.ComponentType.UNSIGNED_BYTE:return 1;case me.ComponentType.SHORT:case me.ComponentType.UNSIGNED_SHORT:return 2;case me.ComponentType.UNSIGNED_INT:case me.ComponentType.FLOAT:return 4;case me.ComponentType.FLOAT16:return 2;case me.ComponentType.FLOAT64:return 8;default:throw new Error("Unexpected component type: "+t)}}getMinNormalized(t){let a=this.getNormalized(),s=this.getElementSize(),r=this.getComponentType();if(this.getMin(t),a)for(let n=0;n<s;n++)t[n]=le.decodeNormalizedInt(t[n],r);return t}getMin(t){let a=this.getArray(),s=this.getCount(),r=this.getElementSize();for(let n=0;n<r;n++)t[n]=1/0;for(let n=0;n<s*r;n+=r)for(let i=0;i<r;i++){let o=a[n+i];Number.isFinite(o)&&(t[i]=Math.min(t[i],o))}return t}getMaxNormalized(t){let a=this.getNormalized(),s=this.getElementSize(),r=this.getComponentType();if(this.getMax(t),a)for(let n=0;n<s;n++)t[n]=le.decodeNormalizedInt(t[n],r);return t}getMax(t){let a=this.get("array"),s=this.getCount(),r=this.getElementSize();for(let n=0;n<r;n++)t[n]=-1/0;for(let n=0;n<s*r;n+=r)for(let i=0;i<r;i++){let o=a[n+i];Number.isFinite(o)&&(t[i]=Math.max(t[i],o))}return t}getCount(){let t=this.get("array");return t?t.length/this.getElementSize():0}getType(){return this.get("type")}setType(t){return this.set("type",t)}getElementSize(){return me.getElementSize(this.get("type"))}getComponentSize(){return this.get("array").BYTES_PER_ELEMENT}getComponentType(){return this.get("componentType")}getNormalized(){return this.get("normalized")}setNormalized(t){return this.set("normalized",t)}getScalar(t){let a=this.getElementSize(),s=this.getComponentType(),r=this.getArray();return this.getNormalized()?le.decodeNormalizedInt(r[t*a],s):r[t*a]}setScalar(t,a){let s=this.getElementSize(),r=this.getComponentType(),n=this.getArray();return this.getNormalized()?n[t*s]=le.encodeNormalizedInt(a,r):n[t*s]=a,this}getElement(t,a){let s=this.getNormalized(),r=this.getElementSize(),n=this.getComponentType(),i=this.getArray();for(let o=0;o<r;o++)s?a[o]=le.decodeNormalizedInt(i[t*r+o],n):a[o]=i[t*r+o];return a}setElement(t,a){let s=this.getNormalized(),r=this.getElementSize(),n=this.getComponentType(),i=this.getArray();for(let o=0;o<r;o++)s?i[t*r+o]=le.encodeNormalizedInt(a[o],n):i[t*r+o]=a[o];return this}getSparse(){return this.get("sparse")}setSparse(t){return this.set("sparse",t)}getBuffer(){return this.getRef("buffer")}setBuffer(t){return this.setRef("buffer",t)}getArray(){return this.get("array")}setArray(t){return this.set("componentType",t?zp(t):me.ComponentType.FLOAT),this.set("array",t),this}getByteLength(){let t=this.get("array");return t?t.byteLength:0}};function zp(e){switch(e.constructor){case Float32Array:return G.ComponentType.FLOAT;case Uint32Array:return G.ComponentType.UNSIGNED_INT;case Uint16Array:return G.ComponentType.UNSIGNED_SHORT;case Uint8Array:return G.ComponentType.UNSIGNED_BYTE;case Int16Array:return G.ComponentType.SHORT;case Int8Array:return G.ComponentType.BYTE;case Float64Array:return G.ComponentType.FLOAT64}if(typeof Float16Array<"u"&&e.constructor===Float16Array)return G.ComponentType.FLOAT16;throw new Error("Unknown accessor componentType.")}var nl=class extends Ne{init(){this.propertyType="Animation"}getDefaults(){return Object.assign(super.getDefaults(),{channels:new ne,samplers:new ne})}addChannel(e){return this.addRef("channels",e)}removeChannel(e){return this.removeRef("channels",e)}listChannels(){return this.listRefs("channels")}addSampler(e){return this.addRef("samplers",e)}removeSampler(e){return this.removeRef("samplers",e)}listSamplers(){return this.listRefs("samplers")}},di=class extends Ne{static TargetPath={TRANSLATION:"translation",ROTATION:"rotation",SCALE:"scale",WEIGHTS:"weights"};init(){this.propertyType="AnimationChannel"}getDefaults(){return Object.assign(super.getDefaults(),{targetPath:null,targetNode:null,sampler:null})}getTargetPath(){return this.get("targetPath")}setTargetPath(e){return this.set("targetPath",e)}getTargetNode(){return this.getRef("targetNode")}setTargetNode(e){return this.setRef("targetNode",e)}getSampler(){return this.getRef("sampler")}setSampler(e){return this.setRef("sampler",e)}},dr=class il extends Ne{static Interpolation={LINEAR:"LINEAR",STEP:"STEP",CUBICSPLINE:"CUBICSPLINE"};init(){this.propertyType="AnimationSampler"}getDefaultAttributes(){return Object.assign(super.getDefaults(),{interpolation:il.Interpolation.LINEAR,input:null,output:null})}getInterpolation(){return this.get("interpolation")}setInterpolation(t){return this.set("interpolation",t)}getInput(){return this.getRef("input")}setInput(t){return this.setRef("input",t,{usage:"OTHER"})}getOutput(){return this.getRef("output")}setOutput(t){return this.setRef("output",t,{usage:"OTHER"})}},ol=class extends Ne{init(){this.propertyType="Buffer"}getDefaults(){return Object.assign(super.getDefaults(),{uri:""})}getURI(){return this.get("uri")}setURI(e){return this.set("uri",e)}},ur=class cl extends Ne{static Type={PERSPECTIVE:"perspective",ORTHOGRAPHIC:"orthographic"};init(){this.propertyType="Camera"}getDefaults(){return Object.assign(super.getDefaults(),{type:cl.Type.PERSPECTIVE,znear:.1,zfar:100,aspectRatio:null,yfov:Math.PI*2*50/360,xmag:1,ymag:1})}getType(){return this.get("type")}setType(t){return this.set("type",t)}getZNear(){return this.get("znear")}setZNear(t){return this.set("znear",t)}getZFar(){return this.get("zfar")}setZFar(t){return this.set("zfar",t)}getAspectRatio(){return this.get("aspectRatio")}setAspectRatio(t){return this.set("aspectRatio",t)}getYFov(){return this.get("yfov")}setYFov(t){return this.set("yfov",t)}getXMag(){return this.get("xmag")}setXMag(t){return this.set("xmag",t)}getYMag(){return this.get("ymag")}setYMag(t){return this.set("ymag",t)}},X=class extends li{static EXTENSION_NAME;_validateParent(e){if(!this.parentTypes.includes(e.propertyType))throw new Error(`Parent "${e.propertyType}" invalid for child "${this.propertyType}".`)}},oe=class oi extends Ne{static WrapMode={CLAMP_TO_EDGE:33071,MIRRORED_REPEAT:33648,REPEAT:10497};static MagFilter={NEAREST:9728,LINEAR:9729};static MinFilter={NEAREST:9728,LINEAR:9729,NEAREST_MIPMAP_NEAREST:9984,LINEAR_MIPMAP_NEAREST:9985,NEAREST_MIPMAP_LINEAR:9986,LINEAR_MIPMAP_LINEAR:9987};init(){this.propertyType="TextureInfo"}getDefaults(){return Object.assign(super.getDefaults(),{texCoord:0,magFilter:null,minFilter:null,wrapS:oi.WrapMode.REPEAT,wrapT:oi.WrapMode.REPEAT})}getTexCoord(){return this.get("texCoord")}setTexCoord(t){return this.set("texCoord",t)}getMagFilter(){return this.get("magFilter")}setMagFilter(t){return this.set("magFilter",t)}getMinFilter(){return this.get("minFilter")}setMinFilter(t){return this.set("minFilter",t)}getWrapS(){return this.get("wrapS")}setWrapS(t){return this.set("wrapS",t)}getWrapT(){return this.get("wrapT")}setWrapT(t){return this.set("wrapT",t)}},{R:tr,G:ar,B:sr,A:Gp}=at,or=class ll extends Ne{static AlphaMode={OPAQUE:"OPAQUE",MASK:"MASK",BLEND:"BLEND"};init(){this.propertyType="Material"}getDefaults(){return Object.assign(super.getDefaults(),{alphaMode:ll.AlphaMode.OPAQUE,alphaCutoff:.5,doubleSided:!1,baseColorFactor:[1,1,1,1],baseColorTexture:null,baseColorTextureInfo:new oe(this.graph,"baseColorTextureInfo"),emissiveFactor:[0,0,0],emissiveTexture:null,emissiveTextureInfo:new oe(this.graph,"emissiveTextureInfo"),normalScale:1,normalTexture:null,normalTextureInfo:new oe(this.graph,"normalTextureInfo"),occlusionStrength:1,occlusionTexture:null,occlusionTextureInfo:new oe(this.graph,"occlusionTextureInfo"),roughnessFactor:1,metallicFactor:1,metallicRoughnessTexture:null,metallicRoughnessTextureInfo:new oe(this.graph,"metallicRoughnessTextureInfo")})}getDoubleSided(){return this.get("doubleSided")}setDoubleSided(t){return this.set("doubleSided",t)}getAlpha(){return this.get("baseColorFactor")[3]}setAlpha(t){let a=this.get("baseColorFactor").slice();return a[3]=t,this.set("baseColorFactor",a)}getAlphaMode(){return this.get("alphaMode")}setAlphaMode(t){return this.set("alphaMode",t)}getAlphaCutoff(){return this.get("alphaCutoff")}setAlphaCutoff(t){return this.set("alphaCutoff",t)}getBaseColorFactor(){return this.get("baseColorFactor")}setBaseColorFactor(t){return this.set("baseColorFactor",t)}getBaseColorTexture(){return this.getRef("baseColorTexture")}getBaseColorTextureInfo(){return this.getRef("baseColorTexture")?this.getRef("baseColorTextureInfo"):null}setBaseColorTexture(t){return this.setRef("baseColorTexture",t,{channels:tr|ar|sr|Gp,isColor:!0})}getEmissiveFactor(){return this.get("emissiveFactor")}setEmissiveFactor(t){return this.set("emissiveFactor",t)}getEmissiveTexture(){return this.getRef("emissiveTexture")}getEmissiveTextureInfo(){return this.getRef("emissiveTexture")?this.getRef("emissiveTextureInfo"):null}setEmissiveTexture(t){return this.setRef("emissiveTexture",t,{channels:tr|ar|sr,isColor:!0})}getNormalScale(){return this.get("normalScale")}setNormalScale(t){return this.set("normalScale",t)}getNormalTexture(){return this.getRef("normalTexture")}getNormalTextureInfo(){return this.getRef("normalTexture")?this.getRef("normalTextureInfo"):null}setNormalTexture(t){return this.setRef("normalTexture",t,{channels:tr|ar|sr})}getOcclusionStrength(){return this.get("occlusionStrength")}setOcclusionStrength(t){return this.set("occlusionStrength",t)}getOcclusionTexture(){return this.getRef("occlusionTexture")}getOcclusionTextureInfo(){return this.getRef("occlusionTexture")?this.getRef("occlusionTextureInfo"):null}setOcclusionTexture(t){return this.setRef("occlusionTexture",t,{channels:tr})}getRoughnessFactor(){return this.get("roughnessFactor")}setRoughnessFactor(t){return this.set("roughnessFactor",t)}getMetallicFactor(){return this.get("metallicFactor")}setMetallicFactor(t){return this.set("metallicFactor",t)}getMetallicRoughnessTexture(){return this.getRef("metallicRoughnessTexture")}getMetallicRoughnessTextureInfo(){return this.getRef("metallicRoughnessTexture")?this.getRef("metallicRoughnessTextureInfo"):null}setMetallicRoughnessTexture(t){return this.setRef("metallicRoughnessTexture",t,{channels:ar|sr})}},dl=class extends Ne{init(){this.propertyType="Mesh"}getDefaults(){return Object.assign(super.getDefaults(),{weights:[],primitives:new ne})}addPrimitive(e){return this.addRef("primitives",e)}removePrimitive(e){return this.removeRef("primitives",e)}listPrimitives(){return this.listRefs("primitives")}getWeights(){return this.get("weights")}setWeights(e){return this.set("weights",e)}},ul=class extends Ne{init(){this.propertyType="Node"}getDefaults(){return Object.assign(super.getDefaults(),{translation:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1],weights:[],camera:null,mesh:null,skin:null,children:new ne})}copy(e,t=Ft){if(t===Ft)throw new Error("Node cannot be copied.");return super.copy(e,t)}getTranslation(){return this.get("translation")}getRotation(){return this.get("rotation")}getScale(){return this.get("scale")}setTranslation(e){return this.set("translation",e)}setRotation(e){return this.set("rotation",e)}setScale(e){return this.set("scale",e)}getMatrix(){return le.compose(this.get("translation"),this.get("rotation"),this.get("scale"),[])}setMatrix(e){let t=this.get("translation").slice(),a=this.get("rotation").slice(),s=this.get("scale").slice();return le.decompose(e,t,a,s),this.set("translation",t).set("rotation",a).set("scale",s)}getWorldTranslation(){let e=[0,0,0];return le.decompose(this.getWorldMatrix(),e,[0,0,0,1],[1,1,1]),e}getWorldRotation(){let e=[0,0,0,1];return le.decompose(this.getWorldMatrix(),[0,0,0],e,[1,1,1]),e}getWorldScale(){let e=[1,1,1];return le.decompose(this.getWorldMatrix(),[0,0,0],[0,0,0,1],e),e}getWorldMatrix(){let e=[];for(let s=this;s!=null;s=s.getParentNode())e.push(s);let t,a=e.pop().getMatrix();for(;t=e.pop();)_p(a,a,t.getMatrix());return a}addChild(e){let t=e.getParentNode();t&&t.removeChild(e);for(let a of e.listParents())a.propertyType==="Scene"&&a.removeChild(e);return this.addRef("children",e)}removeChild(e){return this.removeRef("children",e)}listChildren(){return this.listRefs("children")}getParentNode(){for(let e of this.listParents())if(e.propertyType==="Node")return e;return null}getMesh(){return this.getRef("mesh")}setMesh(e){return this.setRef("mesh",e)}getCamera(){return this.getRef("camera")}setCamera(e){return this.setRef("camera",e)}getSkin(){return this.getRef("skin")}setSkin(e){return this.setRef("skin",e)}getWeights(){return this.get("weights")}setWeights(e){return this.set("weights",e)}traverse(e){e(this);for(let t of this.listChildren())t.traverse(e);return this}},Qa=class fl extends Ne{static Mode={POINTS:0,LINES:1,LINE_LOOP:2,LINE_STRIP:3,TRIANGLES:4,TRIANGLE_STRIP:5,TRIANGLE_FAN:6};init(){this.propertyType="Primitive"}getDefaults(){return Object.assign(super.getDefaults(),{mode:fl.Mode.TRIANGLES,material:null,indices:null,attributes:new ge,targets:new ne})}getIndices(){return this.getRef("indices")}setIndices(t){return this.setRef("indices",t,{usage:"ELEMENT_ARRAY_BUFFER"})}getAttribute(t){return this.getRefMap("attributes",t)}setAttribute(t,a){return this.setRefMap("attributes",t,a,{usage:"ARRAY_BUFFER"})}listAttributes(){return this.listRefMapValues("attributes")}listSemantics(){return this.listRefMapKeys("attributes")}getMaterial(){return this.getRef("material")}setMaterial(t){return this.setRef("material",t)}getMode(){return this.get("mode")}setMode(t){return this.set("mode",t)}listTargets(){return this.listRefs("targets")}addTarget(t){return this.addRef("targets",t)}removeTarget(t){return this.removeRef("targets",t)}},Kp=class extends li{init(){this.propertyType="PrimitiveTarget"}getDefaults(){return Object.assign(super.getDefaults(),{attributes:new ge})}getAttribute(e){return this.getRefMap("attributes",e)}setAttribute(e,t){return this.setRefMap("attributes",e,t,{usage:"ARRAY_BUFFER"})}listAttributes(){return this.listRefMapValues("attributes")}listSemantics(){return this.listRefMapKeys("attributes")}},hl=class extends Ne{init(){this.propertyType="Scene"}getDefaults(){return Object.assign(super.getDefaults(),{children:new ne})}copy(e,t=Ft){if(t===Ft)throw new Error("Scene cannot be copied.");return super.copy(e,t)}addChild(e){let t=e.getParentNode();return t&&t.removeChild(e),this.addRef("children",e)}removeChild(e){return this.removeRef("children",e)}listChildren(){return this.listRefs("children")}traverse(e){for(let t of this.listChildren())t.traverse(e);return this}},bl=class extends Ne{init(){this.propertyType="Skin"}getDefaults(){return Object.assign(super.getDefaults(),{skeleton:null,inverseBindMatrices:null,joints:new ne})}getSkeleton(){return this.getRef("skeleton")}setSkeleton(e){return this.setRef("skeleton",e)}getInverseBindMatrices(){return this.getRef("inverseBindMatrices")}setInverseBindMatrices(e){return this.setRef("inverseBindMatrices",e,{usage:"INVERSE_BIND_MATRICES"})}addJoint(e){return this.addRef("joints",e)}removeJoint(e){return this.removeRef("joints",e)}listJoints(){return this.listRefs("joints")}},pl=class extends Ne{init(){this.propertyType="Texture"}getDefaults(){return Object.assign(super.getDefaults(),{image:null,mimeType:"",uri:""})}getMimeType(){return this.get("mimeType")||lt.extensionToMimeType(va.extension(this.get("uri")))}setMimeType(e){return this.set("mimeType",e)}getURI(){return this.get("uri")}setURI(e){this.set("uri",e);let t=lt.extensionToMimeType(va.extension(e));return t&&this.set("mimeType",t),this}getImage(){return this.get("image")}setImage(e){return this.set("image",q.assertView(e))}getSize(){let e=this.get("image");return e?lt.getSize(e,this.getMimeType()):null}},ui=class extends Ne{_extensions=new Set;init(){this.propertyType="Root"}getDefaults(){return Object.assign(super.getDefaults(),{asset:{generator:`glTF-Transform ${Qc}`,version:"2.0"},defaultScene:null,accessors:new ne,animations:new ne,buffers:new ne,cameras:new ne,materials:new ne,meshes:new ne,nodes:new ne,scenes:new ne,skins:new ne,textures:new ne})}constructor(e){super(e),e.addEventListener("node:create",t=>{this._addChildOfRoot(t.target)})}clone(){throw new Error("Root cannot be cloned.")}copy(e,t=Ft){if(t===Ft)throw new Error("Root cannot be copied.");this.set("asset",{...e.get("asset")}),this.setName(e.getName()),this.setExtras({...e.getExtras()}),this.setDefaultScene(e.getDefaultScene()?t(e.getDefaultScene()):null);for(let a of e.listRefMapKeys("extensions")){let s=e.getExtension(a);this.setExtension(a,t(s))}return this}_addChildOfRoot(e){return e instanceof hl?this.addRef("scenes",e):e instanceof ul?this.addRef("nodes",e):e instanceof ur?this.addRef("cameras",e):e instanceof bl?this.addRef("skins",e):e instanceof dl?this.addRef("meshes",e):e instanceof or?this.addRef("materials",e):e instanceof pl?this.addRef("textures",e):e instanceof nl?this.addRef("animations",e):e instanceof G?this.addRef("accessors",e):e instanceof ol&&this.addRef("buffers",e),this}getAsset(){return this.get("asset")}listExtensionsUsed(){return Array.from(this._extensions)}listExtensionsRequired(){return this.listExtensionsUsed().filter(e=>e.isRequired())}_enableExtension(e){return this._extensions.add(e),this}_disableExtension(e){return this._extensions.delete(e),this}listScenes(){return this.listRefs("scenes")}setDefaultScene(e){return this.setRef("defaultScene",e)}getDefaultScene(){return this.getRef("defaultScene")}listNodes(){return this.listRefs("nodes")}listCameras(){return this.listRefs("cameras")}listSkins(){return this.listRefs("skins")}listMeshes(){return this.listRefs("meshes")}listMaterials(){return this.listRefs("materials")}listTextures(){return this.listRefs("textures")}listAnimations(){return this.listRefs("animations")}listAccessors(){return this.listRefs("accessors")}listBuffers(){return this.listRefs("buffers")}},Vp=class ci{_graph=new ai;_root=new ui(this._graph);_logger=lr.DEFAULT_INSTANCE;static _GRAPH_DOCUMENTS=new WeakMap;static fromGraph(t){return ci._GRAPH_DOCUMENTS.get(t)||null}constructor(){ci._GRAPH_DOCUMENTS.set(this._graph,this)}getRoot(){return this._root}getGraph(){return this._graph}getLogger(){return this._logger}setLogger(t){return this._logger=t,this}clone(){throw new Error("Use 'cloneDocument(source)' from '@gltf-transform/functions'.")}merge(t){throw new Error("Use 'mergeDocuments(target, source)' from '@gltf-transform/functions'.")}async transform(...t){let a=t.map(s=>s.name);for(let s of t)await s(this,{stack:a});return this}hasExtension(t){return this.getRoot().listExtensionsUsed().some(a=>a.extensionName===t)}createExtension(t){let a=t.EXTENSION_NAME;return this.getRoot().listExtensionsUsed().find(s=>s.extensionName===a)||new t(this)}disposeExtension(t){let a=this.getRoot().listExtensionsUsed().find(s=>s.extensionName===t);a&&a.dispose()}createScene(t=""){return new hl(this._graph,t)}createNode(t=""){return new ul(this._graph,t)}createCamera(t=""){return new ur(this._graph,t)}createSkin(t=""){return new bl(this._graph,t)}createMesh(t=""){return new dl(this._graph,t)}createPrimitive(){return new Qa(this._graph)}createPrimitiveTarget(t=""){return new Kp(this._graph,t)}createMaterial(t=""){return new or(this._graph,t)}createTexture(t=""){return new pl(this._graph,t)}createAnimation(t=""){return new nl(this._graph,t)}createAnimationChannel(t=""){return new di(this._graph,t)}createAnimationSampler(t=""){return new dr(this._graph,t)}createAccessor(t="",a=null){return a||(a=this.getRoot().listBuffers()[0]),new G(this._graph,t).setBuffer(a)}createBuffer(t=""){return new ol(this._graph,t)}},ae=class{static EXTENSION_NAME;extensionName="";prereadTypes=[];prewriteTypes=[];readDependencies=[];writeDependencies=[];document;required=!1;properties=new Set;_listener;constructor(e){this.document=e,e.getRoot()._enableExtension(this),this._listener=a=>{let s=a,r=s.target;r instanceof X&&r.extensionName===this.extensionName&&(s.type==="node:create"&&this._addExtensionProperty(r),s.type==="node:dispose"&&this._removeExtensionProperty(r))};let t=e.getGraph();t.addEventListener("node:create",this._listener),t.addEventListener("node:dispose",this._listener)}dispose(){this.document.getRoot()._disableExtension(this);let e=this.document.getGraph();e.removeEventListener("node:create",this._listener),e.removeEventListener("node:dispose",this._listener);for(let t of this.properties)t.dispose()}static register(){}isRequired(){return this.required}setRequired(e){return this.required=e,this}listProperties(){return Array.from(this.properties)}_addExtensionProperty(e){return this.properties.add(e),this}_removeExtensionProperty(e){return this.properties.delete(e),this}install(e,t){return this}preread(e,t){return this}prewrite(e,t){return this}},Hp=class{jsonDoc;buffers=[];bufferViews=[];bufferViewBuffers=[];accessors=[];textures=[];textureInfos=new Map;materials=[];meshes=[];cameras=[];nodes=[];skins=[];animations=[];scenes=[];constructor(e){this.jsonDoc=e}setTextureInfo(e,t){this.textureInfos.set(e,t),t.texCoord!==void 0&&e.setTexCoord(t.texCoord),t.extras!==void 0&&e.setExtras(t.extras);let a=this.jsonDoc.json.textures[t.index];if(a.sampler===void 0)return;let s=this.jsonDoc.json.samplers[a.sampler];s.magFilter!==void 0&&e.setMagFilter(s.magFilter),s.minFilter!==void 0&&e.setMinFilter(s.minFilter),s.wrapS!==void 0&&e.setWrapS(s.wrapS),s.wrapT!==void 0&&e.setWrapT(s.wrapT)}},$c={logger:lr.DEFAULT_INSTANCE,extensions:[],dependencies:{}},qp=new Set(["Buffer","Texture","Material","Mesh","Primitive","Node","Scene"]),Wp=class{static read(e,t=$c){let a={...$c,...t},{json:s}=e,r=new Vp().setLogger(a.logger);this.validate(e,a);let n=new Hp(e),i=s.asset,o=r.getRoot().getAsset();i.copyright&&(o.copyright=i.copyright),i.extras&&(o.extras=i.extras),s.extras!==void 0&&r.getRoot().setExtras({...s.extras});let c=s.extensionsUsed||[],l=s.extensionsRequired||[];a.extensions.sort((g,y)=>g.EXTENSION_NAME>y.EXTENSION_NAME?1:-1);for(let g of a.extensions)if(c.includes(g.EXTENSION_NAME)){let y=r.createExtension(g).setRequired(l.includes(g.EXTENSION_NAME)),m=y.prereadTypes.filter(v=>!qp.has(v));m.length&&a.logger.warn(`Preread hooks for some types (${m.join()}), requested by extension ${y.extensionName}, are unsupported. Please file an issue or a PR.`);for(let v of y.readDependencies)y.install(v,a.dependencies[v])}let f=s.buffers||[];r.getRoot().listExtensionsUsed().filter(g=>g.prereadTypes.includes("Buffer")).forEach(g=>g.preread(n,"Buffer")),n.buffers=f.map(g=>{let y=r.createBuffer(g.name);return g.extras&&y.setExtras(g.extras),g.uri&&g.uri.indexOf("__")!==0&&y.setURI(g.uri),y}),n.bufferViewBuffers=(s.bufferViews||[]).map((g,y)=>{if(!n.bufferViews[y]){let m=e.json.buffers[g.buffer],v=m.uri?e.resources[m.uri]:e.resources[Bt],E=g.byteOffset||0;n.bufferViews[y]=q.toView(v,E,g.byteLength)}return n.buffers[g.buffer]});let u=s.accessors||[];n.accessors=u.map(g=>{let y=n.bufferViewBuffers[g.bufferView],m=r.createAccessor(g.name,y).setType(g.type);return g.extras&&m.setExtras(g.extras),g.normalized!==void 0&&m.setNormalized(g.normalized),g.bufferView===void 0||m.setArray(nr(g,n)),m});let p=s.images||[],b=s.textures||[];r.getRoot().listExtensionsUsed().filter(g=>g.prereadTypes.includes("Texture")).forEach(g=>g.preread(n,"Texture")),n.textures=p.map(g=>{let y=r.createTexture(g.name);if(g.extras&&y.setExtras(g.extras),g.bufferView!==void 0){let m=s.bufferViews[g.bufferView],v=e.json.buffers[m.buffer],E=v.uri?e.resources[v.uri]:e.resources[Bt],S=m.byteOffset||0,A=m.byteLength,T=E.slice(S,S+A);y.setImage(T)}else g.uri!==void 0&&(y.setImage(e.resources[g.uri]),g.uri.indexOf("__")!==0&&y.setURI(g.uri));if(g.mimeType!==void 0)y.setMimeType(g.mimeType);else if(g.uri){let m=va.extension(g.uri);y.setMimeType(lt.extensionToMimeType(m))}return y}),r.getRoot().listExtensionsUsed().filter(g=>g.prereadTypes.includes("Material")).forEach(g=>g.preread(n,"Material")),n.materials=(s.materials||[]).map(g=>{let y=r.createMaterial(g.name);g.extras&&y.setExtras(g.extras),g.alphaMode!==void 0&&y.setAlphaMode(g.alphaMode),g.alphaCutoff!==void 0&&y.setAlphaCutoff(g.alphaCutoff),g.doubleSided!==void 0&&y.setDoubleSided(g.doubleSided);let m=g.pbrMetallicRoughness||{};if(m.baseColorFactor!==void 0&&y.setBaseColorFactor(m.baseColorFactor),g.emissiveFactor!==void 0&&y.setEmissiveFactor(g.emissiveFactor),m.metallicFactor!==void 0&&y.setMetallicFactor(m.metallicFactor),m.roughnessFactor!==void 0&&y.setRoughnessFactor(m.roughnessFactor),m.baseColorTexture!==void 0){let v=m.baseColorTexture,E=n.textures[b[v.index].source];y.setBaseColorTexture(E),n.setTextureInfo(y.getBaseColorTextureInfo(),v)}if(g.emissiveTexture!==void 0){let v=g.emissiveTexture,E=n.textures[b[v.index].source];y.setEmissiveTexture(E),n.setTextureInfo(y.getEmissiveTextureInfo(),v)}if(g.normalTexture!==void 0){let v=g.normalTexture,E=n.textures[b[v.index].source];y.setNormalTexture(E),n.setTextureInfo(y.getNormalTextureInfo(),v),g.normalTexture.scale!==void 0&&y.setNormalScale(g.normalTexture.scale)}if(g.occlusionTexture!==void 0){let v=g.occlusionTexture,E=n.textures[b[v.index].source];y.setOcclusionTexture(E),n.setTextureInfo(y.getOcclusionTextureInfo(),v),g.occlusionTexture.strength!==void 0&&y.setOcclusionStrength(g.occlusionTexture.strength)}if(m.metallicRoughnessTexture!==void 0){let v=m.metallicRoughnessTexture,E=n.textures[b[v.index].source];y.setMetallicRoughnessTexture(E),n.setTextureInfo(y.getMetallicRoughnessTextureInfo(),v)}return y}),r.getRoot().listExtensionsUsed().filter(g=>g.prereadTypes.includes("Mesh")).forEach(g=>g.preread(n,"Mesh"));let h=s.meshes||[];r.getRoot().listExtensionsUsed().filter(g=>g.prereadTypes.includes("Primitive")).forEach(g=>g.preread(n,"Primitive")),n.meshes=h.map(g=>{let y=r.createMesh(g.name);return g.extras&&y.setExtras(g.extras),g.weights!==void 0&&y.setWeights(g.weights),(g.primitives||[]).forEach(m=>{let v=r.createPrimitive();m.extras&&v.setExtras(m.extras),m.material!==void 0&&v.setMaterial(n.materials[m.material]),m.mode!==void 0&&v.setMode(m.mode);for(let[S,A]of Object.entries(m.attributes||{}))v.setAttribute(S,n.accessors[A]);m.indices!==void 0&&v.setIndices(n.accessors[m.indices]);let E=g.extras&&g.extras.targetNames||[];(m.targets||[]).forEach((S,A)=>{let T=E[A]||A.toString(),_=r.createPrimitiveTarget(T);for(let[R,N]of Object.entries(S))_.setAttribute(R,n.accessors[N]);v.addTarget(_)}),y.addPrimitive(v)}),y}),n.cameras=(s.cameras||[]).map(g=>{let y=r.createCamera(g.name).setType(g.type);if(g.extras&&y.setExtras(g.extras),g.type===ur.Type.PERSPECTIVE){let m=g.perspective;y.setYFov(m.yfov),y.setZNear(m.znear),m.zfar!==void 0&&y.setZFar(m.zfar),m.aspectRatio!==void 0&&y.setAspectRatio(m.aspectRatio)}else{let m=g.orthographic;y.setZNear(m.znear).setZFar(m.zfar).setXMag(m.xmag).setYMag(m.ymag)}return y});let d=s.nodes||[];r.getRoot().listExtensionsUsed().filter(g=>g.prereadTypes.includes("Node")).forEach(g=>g.preread(n,"Node")),n.nodes=d.map(g=>{let y=r.createNode(g.name);if(g.extras&&y.setExtras(g.extras),g.translation!==void 0&&y.setTranslation(g.translation),g.rotation!==void 0&&y.setRotation(g.rotation),g.scale!==void 0&&y.setScale(g.scale),g.matrix!==void 0){let m=[0,0,0],v=[0,0,0,1],E=[1,1,1];le.decompose(g.matrix,m,v,E),y.setTranslation(m),y.setRotation(v),y.setScale(E)}return g.weights!==void 0&&y.setWeights(g.weights),y}),n.skins=(s.skins||[]).map(g=>{let y=r.createSkin(g.name);g.extras&&y.setExtras(g.extras),g.inverseBindMatrices!==void 0&&y.setInverseBindMatrices(n.accessors[g.inverseBindMatrices]),g.skeleton!==void 0&&y.setSkeleton(n.nodes[g.skeleton]);for(let m of g.joints)y.addJoint(n.nodes[m]);return y}),d.map((g,y)=>{let m=n.nodes[y];(g.children||[]).forEach(v=>m.addChild(n.nodes[v])),g.mesh!==void 0&&m.setMesh(n.meshes[g.mesh]),g.camera!==void 0&&m.setCamera(n.cameras[g.camera]),g.skin!==void 0&&m.setSkin(n.skins[g.skin])}),n.animations=(s.animations||[]).map(g=>{let y=r.createAnimation(g.name);g.extras&&y.setExtras(g.extras);let m=(g.samplers||[]).map(v=>{let E=r.createAnimationSampler().setInput(n.accessors[v.input]).setOutput(n.accessors[v.output]).setInterpolation(v.interpolation||dr.Interpolation.LINEAR);return v.extras&&E.setExtras(v.extras),y.addSampler(E),E});return(g.channels||[]).forEach(v=>{let E=r.createAnimationChannel().setSampler(m[v.sampler]).setTargetPath(v.target.path);v.target.node!==void 0&&E.setTargetNode(n.nodes[v.target.node]),v.extras&&E.setExtras(v.extras),y.addChannel(E)}),y});let x=s.scenes||[];return r.getRoot().listExtensionsUsed().filter(g=>g.prereadTypes.includes("Scene")).forEach(g=>g.preread(n,"Scene")),n.scenes=x.map(g=>{let y=r.createScene(g.name);return g.extras&&y.setExtras(g.extras),(g.nodes||[]).map(m=>n.nodes[m]).forEach(m=>y.addChild(m)),y}),s.scene!==void 0&&r.getRoot().setDefaultScene(n.scenes[s.scene]),r.getRoot().listExtensionsUsed().forEach(g=>g.read(n)),u.forEach((g,y)=>{let m=n.accessors[y],v=!!g.sparse,E=!g.bufferView&&!m.getArray();(v||E)&&m.setSparse(!0).setArray($p(g,n))}),r}static validate(e,t){let a=e.json;if(a.asset.version!=="2.0")throw new Error(`Unsupported glTF version, "${a.asset.version}".`);if(a.extensionsRequired){for(let s of a.extensionsRequired)if(!t.extensions.find(r=>r.EXTENSION_NAME===s))throw new Error(`Missing required extension, "${s}".`)}if(a.extensionsUsed)for(let s of a.extensionsUsed)t.extensions.find(r=>r.EXTENSION_NAME===s)||t.logger.warn(`Missing optional extension, "${s}".`)}};function Xp(e,t){let a=t.jsonDoc,s=t.bufferViews[e.bufferView],r=a.json.bufferViews[e.bufferView],n=cr[e.componentType],i=G.getElementSize(e.type),o=n.BYTES_PER_ELEMENT,c=e.byteOffset||0,l=new n(e.count*i),f=new DataView(s.buffer,s.byteOffset,s.byteLength),u=r.byteStride;for(let p=0;p<e.count;p++)for(let b=0;b<i;b++){let h=c+p*u+b*o,d;switch(e.componentType){case G.ComponentType.FLOAT:d=f.getFloat32(h,!0);break;case G.ComponentType.UNSIGNED_INT:d=f.getUint32(h,!0);break;case G.ComponentType.UNSIGNED_SHORT:d=f.getUint16(h,!0);break;case G.ComponentType.UNSIGNED_BYTE:d=f.getUint8(h);break;case G.ComponentType.SHORT:d=f.getInt16(h,!0);break;case G.ComponentType.BYTE:d=f.getInt8(h);break;case G.ComponentType.FLOAT16:d=f.getFloat16(h,!0);break;case G.ComponentType.FLOAT64:d=f.getFloat64(h,!0);break;default:throw new Error(`Unexpected componentType "${e.componentType}".`)}l[p*i+b]=d}return l}function nr(e,t){let a=t.jsonDoc,s=t.bufferViews[e.bufferView],r=a.json.bufferViews[e.bufferView],n=cr[e.componentType],i=G.getElementSize(e.type),o=n.BYTES_PER_ELEMENT,c=i*o;if(r.byteStride!==void 0&&r.byteStride!==c)return Xp(e,t);let l=s.byteOffset+(e.byteOffset||0),f=e.count*i*o;return new n(s.buffer.slice(l,l+f))}function $p(e,t){let a=cr[e.componentType],s=G.getElementSize(e.type),r;e.bufferView!==void 0?r=nr(e,t):r=new a(e.count*s);let n=e.sparse;if(!n)return r;let i=n.count,o={...e,...n.indices,count:i,type:"SCALAR"},c={...e,...n.values,count:i},l=nr(o,t),f=nr(c,t);for(let u=0;u<o.count;u++)for(let p=0;p<s;p++)r[l[u]*s+p]=f[u*s+p];return r}var gl=(function(e){return e[e.ARRAY_BUFFER=34962]="ARRAY_BUFFER",e[e.ELEMENT_ARRAY_BUFFER=34963]="ELEMENT_ARRAY_BUFFER",e})(gl||{}),Ct=class{_doc;jsonDoc;options;static BufferViewTarget=gl;static BufferViewUsage=xp;static USAGE_TO_TARGET={ARRAY_BUFFER:34962,ELEMENT_ARRAY_BUFFER:34963};accessorIndexMap=new Map;animationIndexMap=new Map;bufferIndexMap=new Map;cameraIndexMap=new Map;skinIndexMap=new Map;materialIndexMap=new Map;meshIndexMap=new Map;nodeIndexMap=new Map;imageIndexMap=new Map;textureDefIndexMap=new Map;textureInfoDefMap=new Map;samplerDefIndexMap=new Map;sceneIndexMap=new Map;imageBufferViews=[];otherBufferViews=new Map;otherBufferViewsIndexMap=new Map;extensionData={};bufferURIGenerator;imageURIGenerator;logger;_accessorUsageMap=new Map;accessorUsageGroupedByParent=new Set(["ARRAY_BUFFER"]);accessorParents=new Map;constructor(e,t,a){this._doc=e,this.jsonDoc=t,this.options=a;let s=e.getRoot(),r=s.listBuffers().length,n=s.listTextures().length;this.bufferURIGenerator=new Yc(r>1,()=>a.basename||"buffer"),this.imageURIGenerator=new Yc(n>1,i=>Yp(e,i)||a.basename||"texture"),this.logger=e.getLogger()}createTextureInfoDef(e,t){let a={magFilter:t.getMagFilter()||void 0,minFilter:t.getMinFilter()||void 0,wrapS:t.getWrapS(),wrapT:t.getWrapT()},s=JSON.stringify(a);this.samplerDefIndexMap.has(s)||(this.samplerDefIndexMap.set(s,this.jsonDoc.json.samplers.length),this.jsonDoc.json.samplers.push(a));let r={source:this.imageIndexMap.get(e),sampler:this.samplerDefIndexMap.get(s)},n=JSON.stringify(r);this.textureDefIndexMap.has(n)||(this.textureDefIndexMap.set(n,this.jsonDoc.json.textures.length),this.jsonDoc.json.textures.push(r));let i={index:this.textureDefIndexMap.get(n)};return t.getTexCoord()!==0&&(i.texCoord=t.getTexCoord()),Object.keys(t.getExtras()).length>0&&(i.extras=t.getExtras()),this.textureInfoDefMap.set(t,i),i}createPropertyDef(e){let t={};return e.getName()&&(t.name=e.getName()),Object.keys(e.getExtras()).length>0&&(t.extras=e.getExtras()),t}createAccessorDef(e){let t=this.createPropertyDef(e);return t.type=e.getType(),t.componentType=e.getComponentType(),t.count=e.getCount(),this._doc.getGraph().listParentEdges(e).some(a=>a.getName()==="attributes"&&a.getAttributes().key==="POSITION"||a.getName()==="input")&&(t.max=e.getMax([]).map(Math.fround),t.min=e.getMin([]).map(Math.fround)),e.getNormalized()&&(t.normalized=e.getNormalized()),t}createImageData(e,t,a){if(this.options.format==="GLB")this.imageBufferViews.push(t),e.bufferView=this.jsonDoc.json.bufferViews.length,this.jsonDoc.json.bufferViews.push({buffer:0,byteOffset:-1,byteLength:t.byteLength});else{let s=lt.mimeTypeToExtension(a.getMimeType());e.uri=this.imageURIGenerator.createURI(a,s),this.assignResourceURI(e.uri,t,!1)}}assignResourceURI(e,t,a){let s=this.jsonDoc.resources;if(!(e in s)){s[e]=t;return}if(t===s[e]){this.logger.warn(`Duplicate resource URI, "${e}".`);return}let r=`Resource URI "${e}" already assigned to different data.`;if(!a){this.logger.warn(r);return}throw new Error(r)}getAccessorUsage(e){let t=this._accessorUsageMap.get(e);if(t)return t;if(e.getSparse())return"SPARSE";for(let a of this._doc.getGraph().listParentEdges(e)){let{usage:s}=a.getAttributes();if(s)return s;a.getParent().propertyType!=="Root"&&this.logger.warn(`Missing attribute ".usage" on edge, "${a.getName()}".`)}return"OTHER"}addAccessorToUsageGroup(e,t){let a=this._accessorUsageMap.get(e);if(a&&a!==t)throw new Error(`Accessor with usage "${a}" cannot be reused as "${t}".`);return this._accessorUsageMap.set(e,t),this}},Yc=class{multiple;basename;counter={};constructor(e,t){this.multiple=e,this.basename=t}createURI(e,t){if(e.getURI())return e.getURI();if(this.multiple){let a=this.basename(e);return this.counter[a]=this.counter[a]||1,`${a}_${this.counter[a]++}.${t}`}else return`${this.basename(e)}.${t}`}};function Yp(e,t){let a=e.getGraph().listParentEdges(t).find(s=>s.getParent()!==e.getRoot());return a?a.getName().replace(/texture$/i,""):""}var{BufferViewUsage:rr}=Ct,{UNSIGNED_INT:Jp,UNSIGNED_SHORT:Qp,UNSIGNED_BYTE:Zp}=G.ComponentType,eg=new Set(["Accessor","Buffer","Material","Mesh"]),tg=class{static write(e,t){let a=e.getGraph(),s=e.getRoot(),r={asset:{generator:`glTF-Transform ${Qc}`,...s.getAsset()},extras:{...s.getExtras()}},n={json:r,resources:{}},i=new Ct(e,n,t),o=t.logger||lr.DEFAULT_INSTANCE,c=new Set(t.extensions.map(d=>d.EXTENSION_NAME)),l=e.getRoot().listExtensionsUsed().filter(d=>c.has(d.extensionName)).sort((d,x)=>d.extensionName>x.extensionName?1:-1),f=e.getRoot().listExtensionsRequired().filter(d=>c.has(d.extensionName)).sort((d,x)=>d.extensionName>x.extensionName?1:-1);l.length<e.getRoot().listExtensionsUsed().length&&o.warn("Some extensions were not registered for I/O, and will not be written.");for(let d of l){let x=d.prewriteTypes.filter(g=>!eg.has(g));x.length&&o.warn(`Prewrite hooks for some types (${x.join()}), requested by extension ${d.extensionName}, are unsupported. Please file an issue or a PR.`);for(let g of d.writeDependencies)d.install(g,t.dependencies[g])}function u(d,x,g,y){let m=[],v=0;for(let S of d){let A=i.createAccessorDef(S);A.bufferView=r.bufferViews.length;let T=S.getArray(),_=q.pad(q.toView(T));A.byteOffset=v,v+=_.byteLength,m.push(_),i.accessorIndexMap.set(S,r.accessors.length),r.accessors.push(A)}let E={buffer:x,byteOffset:g,byteLength:q.concat(m).byteLength};return y&&(E.target=y),r.bufferViews.push(E),{buffers:m,byteLength:v}}function p(d,x,g){let y=d[0].getCount(),m=0;for(let T of d){let _=i.createAccessorDef(T);_.bufferView=r.bufferViews.length,_.byteOffset=m;let R=T.getElementSize(),N=T.getComponentSize();m+=q.padNumber(R*N),i.accessorIndexMap.set(T,r.accessors.length),r.accessors.push(_)}let v=y*m,E=new ArrayBuffer(v),S=new DataView(E);for(let T=0;T<y;T++){let _=0;for(let R of d){let N=R.getElementSize(),B=R.getComponentSize(),F=R.getComponentType(),K=R.getArray();for(let $=0;$<N;$++){let re=T*m+_+$*B,de=K[T*N+$];switch(F){case G.ComponentType.FLOAT:S.setFloat32(re,de,!0);break;case G.ComponentType.BYTE:S.setInt8(re,de);break;case G.ComponentType.SHORT:S.setInt16(re,de,!0);break;case G.ComponentType.UNSIGNED_BYTE:S.setUint8(re,de);break;case G.ComponentType.UNSIGNED_SHORT:S.setUint16(re,de,!0);break;case G.ComponentType.UNSIGNED_INT:S.setUint32(re,de,!0);break;case G.ComponentType.FLOAT16:S.setFloat16(re,de,!0);break;case G.ComponentType.FLOAT64:S.setFloat64(re,de,!0);break;default:throw new Error("Unexpected component type: "+F)}}_+=q.padNumber(N*B)}}let A={buffer:x,byteOffset:g,byteLength:v,byteStride:m,target:Ct.BufferViewTarget.ARRAY_BUFFER};return r.bufferViews.push(A),{byteLength:v,buffers:[new Uint8Array(E)]}}function b(d,x,g){let y=[],m=0,v=new Map,E=-1/0,S=!1;for(let F of d){let K=i.createAccessorDef(F);r.accessors.push(K),i.accessorIndexMap.set(F,r.accessors.length-1);let $=[],re=[],de=[],Ke=new Array(F.getElementSize()).fill(0);for(let _e=0,ot=F.getCount();_e<ot;_e++)if(F.getElement(_e,de),!le.eq(de,Ke,0)){E=Math.max(_e,E),$.push(_e);for(let et=0;et<de.length;et++)re.push(de[et])}let be=$.length,Ve={accessorDef:K,count:be};if(v.set(F,Ve),be===0)continue;be>F.getCount()/2&&(S=!0);let Ze=cr[F.getComponentType()];Ve.indices=$,Ve.values=new Ze(re)}if(!Number.isFinite(E))return{buffers:y,byteLength:m};S&&o.warn("Some sparse accessors have >50% non-zero elements, which may increase file size.");let A=E<255?Uint8Array:E<65535?Uint16Array:Uint32Array,T=E<255?Zp:E<65535?Qp:Jp,_={buffer:x,byteOffset:g+m,byteLength:0};for(let F of d){let K=v.get(F);if(K.count===0)continue;K.indicesByteOffset=_.byteLength;let $=q.pad(q.toView(new A(K.indices)));y.push($),m+=$.byteLength,_.byteLength+=$.byteLength}r.bufferViews.push(_);let R=r.bufferViews.length-1,N={buffer:x,byteOffset:g+m,byteLength:0};for(let F of d){let K=v.get(F);if(K.count===0)continue;K.valuesByteOffset=N.byteLength;let $=q.pad(q.toView(K.values));y.push($),m+=$.byteLength,N.byteLength+=$.byteLength}r.bufferViews.push(N);let B=r.bufferViews.length-1;for(let F of d){let K=v.get(F);K.count!==0&&(K.accessorDef.sparse={count:K.count,indices:{bufferView:R,byteOffset:K.indicesByteOffset,componentType:T},values:{bufferView:B,byteOffset:K.valuesByteOffset}})}return{buffers:y,byteLength:m}}if(r.accessors=[],r.bufferViews=[],r.samplers=[],r.textures=[],r.images=s.listTextures().map((d,x)=>{let g=i.createPropertyDef(d);d.getMimeType()&&(g.mimeType=d.getMimeType());let y=d.getImage();return y&&i.createImageData(g,y,d),i.imageIndexMap.set(d,x),g}),l.filter(d=>d.prewriteTypes.includes("Accessor")).forEach(d=>d.prewrite(i,"Accessor")),s.listAccessors().forEach(d=>{let x=i.accessorUsageGroupedByParent,g=i.accessorParents;if(i.accessorIndexMap.has(d))return;let y=i.getAccessorUsage(d);if(i.addAccessorToUsageGroup(d,y),x.has(y)){let m=a.listParents(d).find(v=>v.propertyType!=="Root");g.set(d,m)}}),l.filter(d=>d.prewriteTypes.includes("Buffer")).forEach(d=>d.prewrite(i,"Buffer")),(s.listAccessors().length>0||i.otherBufferViews.size>0||s.listTextures().length>0&&t.format==="GLB")&&s.listBuffers().length===0)throw new Error("Buffer required for Document resources, but none was found.");r.buffers=[],s.listBuffers().forEach((d,x)=>{let g=i.createPropertyDef(d),y=i.accessorUsageGroupedByParent,m=d.listParents().filter(R=>R instanceof G),v=new Set(m.map(R=>i.accessorParents.get(R))),E=new Map(Array.from(v).map((R,N)=>[R,N])),S={};for(let R of m){if(i.accessorIndexMap.has(R))continue;let N=i.getAccessorUsage(R),B=N;if(y.has(N)){let F=i.accessorParents.get(R);B+=`:${E.get(F)}`}S[B]||={usage:N,accessors:[]},S[B].accessors.push(R)}let A=[],T=r.buffers.length,_=0;for(let{usage:R,accessors:N}of Object.values(S))if(R===rr.ARRAY_BUFFER&&t.vertexLayout==="interleaved"){let B=p(N,T,_);_+=B.byteLength;for(let F of B.buffers)A.push(F)}else if(R===rr.ARRAY_BUFFER)for(let B of N){let F=p([B],T,_);_+=F.byteLength;for(let K of F.buffers)A.push(K)}else if(R===rr.SPARSE){let B=b(N,T,_);_+=B.byteLength;for(let F of B.buffers)A.push(F)}else if(R===rr.ELEMENT_ARRAY_BUFFER){let B=Ct.BufferViewTarget.ELEMENT_ARRAY_BUFFER,F=u(N,T,_,B);_+=F.byteLength;for(let K of F.buffers)A.push(K)}else{let B=u(N,T,_);_+=B.byteLength;for(let F of B.buffers)A.push(F)}if(i.imageBufferViews.length&&x===0){for(let R=0;R<i.imageBufferViews.length;R++)if(r.bufferViews[r.images[R].bufferView].byteOffset=_,_+=i.imageBufferViews[R].byteLength,A.push(i.imageBufferViews[R]),_%8){let N=8-_%8;_+=N,A.push(new Uint8Array(N))}}if(i.otherBufferViews.has(d))for(let R of i.otherBufferViews.get(d))r.bufferViews.push({buffer:T,byteOffset:_,byteLength:R.byteLength}),i.otherBufferViewsIndexMap.set(R,r.bufferViews.length-1),_+=R.byteLength,A.push(R);if(_){let R;t.format==="GLB"?R=Bt:(R=i.bufferURIGenerator.createURI(d,"bin"),g.uri=R),g.byteLength=_,i.assignResourceURI(R,q.concat(A),!0)}r.buffers.push(g),i.bufferIndexMap.set(d,x)}),s.listAccessors().find(d=>!d.getBuffer())&&o.warn("Skipped writing one or more Accessors: no Buffer assigned."),l.filter(d=>d.prewriteTypes.includes("Material")).forEach(d=>d.prewrite(i,"Material")),r.materials=s.listMaterials().map((d,x)=>{let g=i.createPropertyDef(d);if(d.getAlphaMode()!==or.AlphaMode.OPAQUE&&(g.alphaMode=d.getAlphaMode()),d.getAlphaMode()===or.AlphaMode.MASK&&(g.alphaCutoff=d.getAlphaCutoff()),d.getDoubleSided()&&(g.doubleSided=!0),g.pbrMetallicRoughness={},le.eq(d.getBaseColorFactor(),[1,1,1,1])||(g.pbrMetallicRoughness.baseColorFactor=d.getBaseColorFactor()),le.eq(d.getEmissiveFactor(),[0,0,0])||(g.emissiveFactor=d.getEmissiveFactor()),d.getRoughnessFactor()!==1&&(g.pbrMetallicRoughness.roughnessFactor=d.getRoughnessFactor()),d.getMetallicFactor()!==1&&(g.pbrMetallicRoughness.metallicFactor=d.getMetallicFactor()),d.getBaseColorTexture()){let y=d.getBaseColorTexture(),m=d.getBaseColorTextureInfo();g.pbrMetallicRoughness.baseColorTexture=i.createTextureInfoDef(y,m)}if(d.getEmissiveTexture()){let y=d.getEmissiveTexture(),m=d.getEmissiveTextureInfo();g.emissiveTexture=i.createTextureInfoDef(y,m)}if(d.getNormalTexture()){let y=d.getNormalTexture(),m=d.getNormalTextureInfo(),v=i.createTextureInfoDef(y,m);d.getNormalScale()!==1&&(v.scale=d.getNormalScale()),g.normalTexture=v}if(d.getOcclusionTexture()){let y=d.getOcclusionTexture(),m=d.getOcclusionTextureInfo(),v=i.createTextureInfoDef(y,m);d.getOcclusionStrength()!==1&&(v.strength=d.getOcclusionStrength()),g.occlusionTexture=v}if(d.getMetallicRoughnessTexture()){let y=d.getMetallicRoughnessTexture(),m=d.getMetallicRoughnessTextureInfo();g.pbrMetallicRoughness.metallicRoughnessTexture=i.createTextureInfoDef(y,m)}return i.materialIndexMap.set(d,x),g}),l.filter(d=>d.prewriteTypes.includes("Mesh")).forEach(d=>d.prewrite(i,"Mesh")),r.meshes=s.listMeshes().map((d,x)=>{let g=i.createPropertyDef(d),y=null;return g.primitives=d.listPrimitives().map(m=>{let v={attributes:{}};v.mode=m.getMode();let E=m.getMaterial();E&&(v.material=i.materialIndexMap.get(E)),Object.keys(m.getExtras()).length&&(v.extras=m.getExtras());let S=m.getIndices();S&&(v.indices=i.accessorIndexMap.get(S));for(let A of m.listSemantics())v.attributes[A]=i.accessorIndexMap.get(m.getAttribute(A));for(let A of m.listTargets()){let T={};for(let _ of A.listSemantics())T[_]=i.accessorIndexMap.get(A.getAttribute(_));v.targets=v.targets||[],v.targets.push(T)}return m.listTargets().length&&!y&&(y=m.listTargets().map(A=>A.getName())),v}),d.getWeights().length&&(g.weights=d.getWeights()),y&&(g.extras=g.extras||{},g.extras.targetNames=y),i.meshIndexMap.set(d,x),g}),r.cameras=s.listCameras().map((d,x)=>{let g=i.createPropertyDef(d);if(g.type=d.getType(),g.type===ur.Type.PERSPECTIVE){g.perspective={znear:d.getZNear(),zfar:d.getZFar(),yfov:d.getYFov()};let y=d.getAspectRatio();y!==null&&(g.perspective.aspectRatio=y)}else g.orthographic={znear:d.getZNear(),zfar:d.getZFar(),xmag:d.getXMag(),ymag:d.getYMag()};return i.cameraIndexMap.set(d,x),g}),r.nodes=s.listNodes().map((d,x)=>{let g=i.createPropertyDef(d);return le.eq(d.getTranslation(),[0,0,0])||(g.translation=d.getTranslation()),le.eq(d.getRotation(),[0,0,0,1])||(g.rotation=d.getRotation()),le.eq(d.getScale(),[1,1,1])||(g.scale=d.getScale()),d.getWeights().length&&(g.weights=d.getWeights()),i.nodeIndexMap.set(d,x),g}),r.skins=s.listSkins().map((d,x)=>{let g=i.createPropertyDef(d),y=d.getInverseBindMatrices();y&&(g.inverseBindMatrices=i.accessorIndexMap.get(y));let m=d.getSkeleton();return m&&(g.skeleton=i.nodeIndexMap.get(m)),g.joints=d.listJoints().map(v=>i.nodeIndexMap.get(v)),i.skinIndexMap.set(d,x),g}),s.listNodes().forEach((d,x)=>{let g=r.nodes[x],y=d.getMesh();y&&(g.mesh=i.meshIndexMap.get(y));let m=d.getCamera();m&&(g.camera=i.cameraIndexMap.get(m));let v=d.getSkin();v&&(g.skin=i.skinIndexMap.get(v)),d.listChildren().length>0&&(g.children=d.listChildren().map(E=>i.nodeIndexMap.get(E)))}),r.animations=s.listAnimations().map((d,x)=>{let g=i.createPropertyDef(d),y=new Map;return g.samplers=d.listSamplers().map((m,v)=>{let E=i.createPropertyDef(m);return E.input=i.accessorIndexMap.get(m.getInput()),E.output=i.accessorIndexMap.get(m.getOutput()),E.interpolation=m.getInterpolation(),y.set(m,v),E}),g.channels=d.listChannels().map(m=>{let v=i.createPropertyDef(m);return v.sampler=y.get(m.getSampler()),v.target={node:i.nodeIndexMap.get(m.getTargetNode()),path:m.getTargetPath()},v}),i.animationIndexMap.set(d,x),g}),r.scenes=s.listScenes().map((d,x)=>{let g=i.createPropertyDef(d);return g.nodes=d.listChildren().map(y=>i.nodeIndexMap.get(y)),i.sceneIndexMap.set(d,x),g});let h=s.getDefaultScene();return h&&(r.scene=s.listScenes().indexOf(h)),r.extensionsUsed=l.map(d=>d.extensionName),r.extensionsRequired=f.map(d=>d.extensionName),l.forEach(d=>d.write(i)),ag(r),n}};function ag(e){let t=[];for(let a in e){let s=e[a];(Array.isArray(s)&&s.length===0||s===null||s===""||s&&typeof s=="object"&&Object.keys(s).length===0)&&t.push(a)}for(let a of t)delete e[a]}var sg=class{_logger=lr.DEFAULT_INSTANCE;_extensions=new Set;_dependencies={};_vertexLayout="interleaved";_strictResources=!0;lastReadBytes=0;lastWriteBytes=0;setLogger(e){return this._logger=e,this}registerExtensions(e){for(let t of e)this._extensions.add(t),t.register();return this}registerDependencies(e){return Object.assign(this._dependencies,e),this}setVertexLayout(e){return this._vertexLayout=e,this}setStrictResources(e){return this._strictResources=e,this}async read(e){return await this.readJSON(await this.readAsJSON(e))}async readAsJSON(e){let t=await this.readURI(e,"view");this.lastReadBytes=t.byteLength;let a=Jc(t)?this._binaryToJSON(t):{json:JSON.parse(q.decodeText(t)),resources:{}};return await this._readResourcesExternal(a,this.dirname(e)),this._readResourcesInternal(a),a}async readJSON(e){return e=this._copyJSON(e),this._readResourcesInternal(e),Wp.read(e,{extensions:Array.from(this._extensions),dependencies:this._dependencies,logger:this._logger})}async binaryToJSON(e){let t=this._binaryToJSON(q.assertView(e));this._readResourcesInternal(t);let a=t.json;if(a.buffers&&a.buffers.some(s=>rg(t,s)))throw new Error("Cannot resolve external buffers with binaryToJSON().");if(a.images&&a.images.some(s=>ng(t,s)))throw new Error("Cannot resolve external images with binaryToJSON().");return t}async readBinary(e){return this.readJSON(await this.binaryToJSON(q.assertView(e)))}async writeJSON(e,t={}){if(t.format==="GLB"&&e.getRoot().listBuffers().length>1)throw new Error("GLB must have 0\u20131 buffers.");return tg.write(e,{format:t.format||"GLTF",basename:t.basename||"",logger:this._logger,vertexLayout:this._vertexLayout,dependencies:{...this._dependencies},extensions:Array.from(this._extensions)})}async writeBinary(e){let{json:t,resources:a}=await this.writeJSON(e,{format:"GLB"}),s=new Uint32Array([1179937895,2,12]),r=JSON.stringify(t),n=q.pad(q.encodeText(r),32),i=q.toView(new Uint32Array([n.byteLength,1313821514])),o=q.concat([i,n]);s[s.length-1]+=o.byteLength;let c=Object.values(a)[0];if(!c||!c.byteLength)return q.concat([q.toView(s),o]);let l=q.pad(c,0),f=q.toView(new Uint32Array([l.byteLength,5130562])),u=q.concat([f,l]);return s[s.length-1]+=u.byteLength,q.concat([q.toView(s),o,u])}async _readResourcesExternal(e,t){let a=e.json.images||[],s=e.json.buffers||[],r=[...a,...s].map(async n=>{let i=n.uri;if(!i||i.match(/data:/))return Promise.resolve();try{e.resources[i]=await this.readURI(this.resolve(t,i),"view"),this.lastReadBytes+=e.resources[i].byteLength}catch(o){if(!this._strictResources&&a.includes(n))this._logger.warn(`Failed to load image URI, "${i}". ${o}`),e.resources[i]=null;else throw o}});await Promise.all(r)}_readResourcesInternal(e){function t(a){if(a.uri){if(a.uri in e.resources){q.assertView(e.resources[a.uri]);return}if(a.uri.match(/data:/)){let s=`__${Dp()}.${va.extension(a.uri)}`;e.resources[s]=q.createBufferFromDataURI(a.uri),a.uri=s}}}(e.json.images||[]).forEach(a=>{if(a.bufferView===void 0&&a.uri===void 0)throw new Error("Missing resource URI or buffer view.");t(a)}),(e.json.buffers||[]).forEach(t)}_copyJSON(e){let{images:t,buffers:a}=e.json;return e={json:{...e.json},resources:{...e.resources}},t&&(e.json.images=t.map(s=>({...s}))),a&&(e.json.buffers=a.map(s=>({...s}))),e}_binaryToJSON(e){if(!Jc(e))throw new Error("Invalid glTF 2.0 binary.");let t=new Uint32Array(e.buffer,e.byteOffset+12,2);if(t[1]!==1313821514)throw new Error("Missing required GLB JSON chunk.");let a=20,s=t[0],r=q.decodeText(q.toView(e,a,s)),n=JSON.parse(r),i=a+s;if(e.byteLength<=i)return{json:n,resources:{}};let o=new Uint32Array(e.buffer,e.byteOffset+i,2);if(o[1]!==5130562)return{json:n,resources:{}};let c=o[0],l=q.toView(e,i+8,c);return{json:n,resources:{[Bt]:l}}}};function rg(e,t){return t.uri!==void 0&&!(t.uri in e.resources)}function ng(e,t){return t.uri!==void 0&&!(t.uri in e.resources)&&t.bufferView===void 0}function Jc(e){if(e.byteLength<3*Uint32Array.BYTES_PER_ELEMENT)return!1;let t=new Uint32Array(e.buffer,e.byteOffset,3);return t[0]===1179937895&&t[1]===2}var ml=class extends sg{_fetchConfig;constructor(e=ri.DEFAULT_INIT){super(),this._fetchConfig=e}async readURI(e,t){let a=await fetch(e,this._fetchConfig);switch(t){case"view":return new Uint8Array(await a.arrayBuffer());case"text":return a.text()}}resolve(e,t){return ri.resolve(e,t)}dirname(e){return ri.dirname(e)}};function ig(){return{vkFormat:0,typeSize:1,pixelWidth:0,pixelHeight:0,pixelDepth:0,layerCount:0,faceCount:1,levelCount:0,supercompressionScheme:0,levels:[],dataFormatDescriptor:[{vendorId:0,descriptorType:0,versionNumber:2,colorModel:0,colorPrimaries:1,transferFunction:2,flags:0,texelBlockDimension:[0,0,0,0],bytesPlane:[0,0,0,0,0,0,0,0],samples:[]}],keyValue:{},globalData:null}}var na=class{constructor(t,a,s,r){this._dataView=void 0,this._littleEndian=void 0,this._offset=void 0,this._dataView=new DataView(t.buffer,t.byteOffset+a,s),this._littleEndian=r,this._offset=0}_nextUint8(){let t=this._dataView.getUint8(this._offset);return this._offset+=1,t}_nextUint16(){let t=this._dataView.getUint16(this._offset,this._littleEndian);return this._offset+=2,t}_nextUint32(){let t=this._dataView.getUint32(this._offset,this._littleEndian);return this._offset+=4,t}_nextUint64(){let t=this._dataView.getUint32(this._offset,this._littleEndian),a=this._dataView.getUint32(this._offset+4,this._littleEndian),s=t+2**32*a;return this._offset+=8,s}_nextInt32(){let t=this._dataView.getInt32(this._offset,this._littleEndian);return this._offset+=4,t}_nextUint8Array(t){let a=new Uint8Array(this._dataView.buffer,this._dataView.byteOffset+this._offset,t);return this._offset+=t,a}_skip(t){return this._offset+=t,this}_scan(t,a=0){let s=this._offset,r=0;for(;this._dataView.getUint8(this._offset)!==a&&r<t;)r++,this._offset++;return r<t&&this._offset++,new Uint8Array(this._dataView.buffer,this._dataView.byteOffset+s,r)}};var Dk=new Uint8Array([0]),Ce=[171,75,84,88,32,50,48,187,13,10,26,10];function yl(e){return new TextDecoder().decode(e)}function fr(e){let t=new Uint8Array(e.buffer,e.byteOffset,Ce.length);if(t[0]!==Ce[0]||t[1]!==Ce[1]||t[2]!==Ce[2]||t[3]!==Ce[3]||t[4]!==Ce[4]||t[5]!==Ce[5]||t[6]!==Ce[6]||t[7]!==Ce[7]||t[8]!==Ce[8]||t[9]!==Ce[9]||t[10]!==Ce[10]||t[11]!==Ce[11])throw new Error("Missing KTX 2.0 identifier.");let a=ig(),s=17*Uint32Array.BYTES_PER_ELEMENT,r=new na(e,Ce.length,s,!0);a.vkFormat=r._nextUint32(),a.typeSize=r._nextUint32(),a.pixelWidth=r._nextUint32(),a.pixelHeight=r._nextUint32(),a.pixelDepth=r._nextUint32(),a.layerCount=r._nextUint32(),a.faceCount=r._nextUint32(),a.levelCount=r._nextUint32(),a.supercompressionScheme=r._nextUint32();let n=r._nextUint32(),i=r._nextUint32(),o=r._nextUint32(),c=r._nextUint32(),l=r._nextUint64(),f=r._nextUint64(),u=Math.max(a.levelCount,1)*3*8,p=new na(e,Ce.length+s,u,!0);for(let P=0,L=Math.max(a.levelCount,1);P<L;P++)a.levels.push({levelData:new Uint8Array(e.buffer,e.byteOffset+p._nextUint64(),p._nextUint64()),uncompressedByteLength:p._nextUint64()});let b=new na(e,n,i,!0);b._skip(4);let h=b._nextUint16(),d=b._nextUint16(),x=b._nextUint16(),g=b._nextUint16(),y=b._nextUint8(),m=b._nextUint8(),v=b._nextUint8(),E=b._nextUint8(),S=[b._nextUint8(),b._nextUint8(),b._nextUint8(),b._nextUint8()],A=[b._nextUint8(),b._nextUint8(),b._nextUint8(),b._nextUint8(),b._nextUint8(),b._nextUint8(),b._nextUint8(),b._nextUint8()],_={vendorId:h,descriptorType:d,versionNumber:x,colorModel:y,colorPrimaries:m,transferFunction:v,flags:E,texelBlockDimension:S,bytesPlane:A,samples:[]},B=(g/4-6)/4;for(let P=0;P<B;P++){let L={bitOffset:b._nextUint16(),bitLength:b._nextUint8(),channelType:b._nextUint8(),samplePosition:[b._nextUint8(),b._nextUint8(),b._nextUint8(),b._nextUint8()],sampleLower:Number.NEGATIVE_INFINITY,sampleUpper:Number.POSITIVE_INFINITY};L.channelType&64?(L.sampleLower=b._nextInt32(),L.sampleUpper=b._nextInt32()):(L.sampleLower=b._nextUint32(),L.sampleUpper=b._nextUint32()),_.samples[P]=L}a.dataFormatDescriptor.length=0,a.dataFormatDescriptor.push(_);let F=new na(e,o,c,!0);for(;F._offset<c;){let P=F._nextUint32(),L=F._scan(P),Q=yl(L);if(a.keyValue[Q]=F._nextUint8Array(P-L.byteLength-1),Q.match(/^ktx/i)){let Re=yl(a.keyValue[Q]);a.keyValue[Q]=Re.substring(0,Re.lastIndexOf("\0"))}let ue=P%4?4-P%4:0;F._skip(ue)}if(f<=0)return a;let K=new na(e,l,f,!0),$=K._nextUint16(),re=K._nextUint16(),de=K._nextUint32(),Ke=K._nextUint32(),be=K._nextUint32(),Ve=K._nextUint32(),Ze=[];for(let P=0,L=Math.max(a.levelCount,1);P<L;P++)Ze.push({imageFlags:K._nextUint32(),rgbSliceByteOffset:K._nextUint32(),rgbSliceByteLength:K._nextUint32(),alphaSliceByteOffset:K._nextUint32(),alphaSliceByteLength:K._nextUint32()});let _e=l+K._offset,ot=_e+de,et=ot+Ke,It=et+be,xa=new Uint8Array(e.buffer,e.byteOffset+_e,de),qn=new Uint8Array(e.buffer,e.byteOffset+ot,Ke),Ks=new Uint8Array(e.buffer,e.byteOffset+et,be),I=new Uint8Array(e.buffer,e.byteOffset+It,Ve);return a.globalData={endpointCount:$,selectorCount:re,imageDescs:Ze,endpointsData:xa,selectorsData:qn,tablesData:Ks,extendedData:I},a}var Ot="EXT_mesh_gpu_instancing",yt="EXT_mesh_features",je="EXT_meshopt_compression",H="EXT_structural_metadata",hr="EXT_texture_webp",br="EXT_texture_avif",fg="KHR_accessor_float16",hg="KHR_accessor_float64",fe="KHR_draco_mesh_compression",mt="KHR_lights_punctual",Pt="KHR_materials_anisotropy",jt="KHR_materials_clearcoat",Lt="KHR_materials_diffuse_transmission",Dt="KHR_materials_dispersion",Ut="KHR_materials_emissive_strength",zt="KHR_materials_ior",Gt="KHR_materials_iridescence",Kt="KHR_materials_pbrSpecularGlossiness",Vt="KHR_materials_sheen",Ht="KHR_materials_specular",qt="KHR_materials_transmission",Ma="KHR_materials_unlit",Wt="KHR_materials_volume",Ue="KHR_materials_variants",xl="KHR_mesh_primitive_restart",wl="KHR_mesh_quantization",Xt="KHR_node_visibility",pr="KHR_texture_basisu",$t="KHR_texture_transform",st="KHR_xmp_json_ld",bg=class extends X{static EXTENSION_NAME=yt;init(){this.extensionName=yt,this.propertyType="FeatureID",this.parentTypes=["Features"]}getDefaults(){return Object.assign(super.getDefaults(),{nullFeatureId:null,label:"",attribute:null,texture:null,propertyTable:null})}getFeatureCount(){return this.get("featureCount")}setFeatureCount(e){return this.set("featureCount",e)}getNullFeatureID(){return this.get("nullFeatureId")}setNullFeatureID(e){return this.set("nullFeatureId",e)}getLabel(){return this.get("label")}setLabel(e){return this.set("label",e)}getAttribute(){return this.get("attribute")}setAttribute(e){return this.set("attribute",e)}getTexture(){return this.getRef("texture")}setTexture(e){return this.setRef("texture",e)}getPropertyTable(){return this.getRef("propertyTable")}setPropertyTable(e){return this.setRef("propertyTable",e)}},pg=class extends X{static EXTENSION_NAME=yt;init(){this.extensionName=yt,this.propertyType="FeatureIDTexture",this.parentTypes=["FeatureID"]}getDefaults(){let e=new oe(this.graph,"textureInfo");return e.setMinFilter(oe.MagFilter.NEAREST),e.setMagFilter(oe.MagFilter.NEAREST),Object.assign(super.getDefaults(),{channels:[0],texture:null,textureInfo:e})}getChannels(){return this.get("channels")}setChannels(e){return this.set("channels",e)}getTexture(){return this.getRef("texture")}setTexture(e){return this.setRef("texture",e)}getTextureInfo(){return this.getRef("texture")?this.getRef("textureInfo"):null}},gg=class extends X{static EXTENSION_NAME=yt;init(){this.extensionName=yt,this.propertyType="Features",this.parentTypes=[O.PRIMITIVE]}getDefaults(){return Object.assign(super.getDefaults(),{featureIds:new ne([])})}listFeatureIDs(){return this.listRefs("featureIds")}addFeatureID(e){return this.addRef("featureIds",e)}removeFeatureID(e){return this.removeRef("featureIds",e)}},Za=yt,mi=class extends ae{extensionName=yt;static EXTENSION_NAME=yt;createFeatures(){return new gg(this.document.getGraph())}createFeatureID(){return new bg(this.document.getGraph())}createFeatureIDTexture(){return new pg(this.document.getGraph())}read(e){return(e.jsonDoc.json.meshes||[]).forEach((t,a)=>{(t.primitives||[]).forEach((s,r)=>{this._readPrimitive(e,a,s,r)})}),this}_readPrimitive(e,t,a,s){if(!a.extensions||!a.extensions[Za])return;let r=this.createFeatures(),n=a.extensions[Za];for(let i of n.featureIds){let o=mg(this.document,this,e,i);r.addFeatureID(o)}e.meshes[t].listPrimitives()[s].setExtension(Za,r)}write(e){let t=e.jsonDoc.json.meshes;if(!t)return this;for(let a of this.document.getRoot().listMeshes()){let s=t[e.meshIndexMap.get(a)];a.listPrimitives().forEach((r,n)=>{let i=s.primitives[n];this._writePrimitive(e,r,i)})}return this}_writePrimitive(e,t,a){let s=t.getExtension(Za);if(!s)return;let r={featureIds:[]};s.listFeatureIDs().forEach(n=>{r.featureIds.push(xg(this.document,e,n))}),a.extensions=a.extensions||{},a.extensions[Za]=r}};function mg(e,t,a,s){let r=t.createFeatureID().setFeatureCount(s.featureCount);s.nullFeatureId!==void 0&&r.setNullFeatureID(s.nullFeatureId),s.label!==void 0&&r.setLabel(s.label),s.attribute!==void 0&&r.setAttribute(s.attribute);let n=s.texture;if(n!==void 0){let i=yg(t,a,n);r.setTexture(i)}if(s.propertyTable!==void 0){let i=e.getRoot().getExtension(H).listPropertyTables();r.setPropertyTable(i[s.propertyTable])}return r}function yg(e,t,a){let s=e.createFeatureIDTexture(),{json:r}=t.jsonDoc;if(a.channels&&s.setChannels(a.channels),a.index!==void 0){let n=r.textures[a.index].source;s.setTexture(t.textures[n]),t.setTextureInfo(s.getTextureInfo(),a)}return s}function xg(e,t,a){let s=e.getRoot(),r={featureCount:a.getFeatureCount()};if(a.getNullFeatureID()!=null&&(r.nullFeatureId=a.getNullFeatureID()),a.getLabel()&&(r.label=a.getLabel()),a.getAttribute()!=null&&(r.attribute=a.getAttribute()),a.getTexture()){let n=a.getTexture(),i=n.getTexture(),o=n.getTextureInfo();r.texture=t.createTextureInfoDef(i,o);let c=n.getChannels();le.eq(c,[0])||(r.texture.channels=c)}if(a.getPropertyTable()){let n=s.getExtension(H),i=a.getPropertyTable();r.propertyTable=n.listPropertyTables().indexOf(i)}return r}var bi="INSTANCE_ATTRIBUTE",wg=class extends X{static EXTENSION_NAME=Ot;init(){this.extensionName=Ot,this.propertyType="InstancedMesh",this.parentTypes=[O.NODE]}getDefaults(){return Object.assign(super.getDefaults(),{attributes:new ge})}getAttribute(e){return this.getRefMap("attributes",e)}setAttribute(e,t){return this.setRefMap("attributes",e,t,{usage:bi})}listAttributes(){return this.listRefMapValues("attributes")}listSemantics(){return this.listRefMapKeys("attributes")}},vg=class extends ae{static EXTENSION_NAME=Ot;extensionName=Ot;prewriteTypes=[O.ACCESSOR];createInstancedMesh(){return new wg(this.document.getGraph())}read(e){return(e.jsonDoc.json.nodes||[]).forEach((t,a)=>{if(!t.extensions||!t.extensions.EXT_mesh_gpu_instancing)return;let s=t.extensions[Ot],r=this.createInstancedMesh();for(let n in s.attributes)r.setAttribute(n,e.accessors[s.attributes[n]]);e.nodes[a].setExtension(Ot,r)}),this}prewrite(e){e.accessorUsageGroupedByParent.add(bi);for(let t of this.properties)for(let a of t.listAttributes())e.addAccessorToUsageGroup(a,bi);return this}write(e){let t=e.jsonDoc;return this.document.getRoot().listNodes().forEach(a=>{let s=a.getExtension(Ot);if(s){let r=e.nodeIndexMap.get(a),n=t.json.nodes[r],i={attributes:{}};s.listSemantics().forEach(o=>{let c=s.getAttribute(o);i.attributes[o]=e.accessorIndexMap.get(c)}),n.extensions=n.extensions||{},n.extensions[Ot]=i}}),this}},Mg=(function(e){return e.QUANTIZE="quantize",e.FILTER="filter",e})({});function kg(e){return!e.extensions||!e.extensions.EXT_meshopt_compression?!1:!!e.extensions[je].fallback}var{BYTE:Eg,SHORT:vl,FLOAT:Sg}=G.ComponentType,{encodeNormalizedInt:Ml,decodeNormalizedInt:pi}=le;function Tg(e,t,a,s){let{filter:r,bits:n}=s,i={array:e.getArray(),byteStride:e.getElementSize()*e.getComponentSize(),componentType:e.getComponentType(),normalized:e.getNormalized()};if(a!=="ATTRIBUTES")return i;if(r!=="NONE"){let o=e.getNormalized()?Ag(e):new Float32Array(i.array);switch(r){case"EXPONENTIAL":i.byteStride=e.getElementSize()*4,i.componentType=Sg,i.normalized=!1,i.array=t.encodeFilterExp(o,e.getCount(),i.byteStride,n);break;case"OCTAHEDRAL":i.byteStride=n>8?8:4,i.componentType=n>8?vl:Eg,i.normalized=!0,o=e.getElementSize()===3?_g(o):o,i.array=t.encodeFilterOct(o,e.getCount(),i.byteStride,n);break;case"QUATERNION":i.byteStride=8,i.componentType=vl,i.normalized=!0,i.array=t.encodeFilterQuat(o,e.getCount(),i.byteStride,n);break;default:throw new Error("Invalid filter.")}i.min=e.getMin([]),i.max=e.getMax([]),e.getNormalized()&&(i.min=i.min.map(c=>pi(c,e.getComponentType())),i.max=i.max.map(c=>pi(c,e.getComponentType()))),i.normalized&&(i.min=i.min.map(c=>Ml(c,i.componentType)),i.max=i.max.map(c=>Ml(c,i.componentType)))}else i.byteStride%4&&(i.array=Ig(i.array,e.getElementSize()),i.byteStride=i.array.byteLength/e.getCount());return i}function Ag(e){let t=e.getComponentType(),a=e.getArray(),s=new Float32Array(a.length);for(let r=0;r<a.length;r++)s[r]=pi(a[r],t);return s}function Ig(e,t){let a=q.padNumber(e.BYTES_PER_ELEMENT*t)/e.BYTES_PER_ELEMENT,s=e.length/t,r=new e.constructor(s*a);for(let n=0;n*t<e.length;n++)for(let i=0;i<t;i++)r[n*a+i]=e[n*t+i];return r}function _g(e){let t=new Float32Array(e.length*4/3);for(let a=0,s=e.length/3;a<s;a++)t[a*4]=e[a*3],t[a*4+1]=e[a*3+1],t[a*4+2]=e[a*3+2];return t}function Rg(e,t){return t===Ct.BufferViewUsage.ELEMENT_ARRAY_BUFFER?e.listParents().some(a=>a instanceof Qa&&a.getMode()===Qa.Mode.TRIANGLES)?"TRIANGLES":"INDICES":"ATTRIBUTES"}function Ng(e,t){let a=t.getGraph().listParentEdges(e).filter(s=>!(s.getParent()instanceof ui));for(let s of a){let r=s.getName(),n=s.getAttributes().key||"",i=s.getParent().propertyType===O.PRIMITIVE_TARGET;if(r==="indices")return{filter:"NONE"};if(r==="attributes"){if(n==="POSITION")return{filter:"NONE"};if(n==="TEXCOORD_0")return{filter:"NONE"};if(n.startsWith("JOINTS_"))return{filter:"NONE"};if(n.startsWith("WEIGHTS_"))return{filter:"NONE"};if(n==="NORMAL"||n==="TANGENT")return i?{filter:"NONE"}:{filter:"OCTAHEDRAL",bits:8}}if(r==="output"){let o=Dl(e);return o==="rotation"?{filter:"QUATERNION",bits:16}:o==="translation"?{filter:"EXPONENTIAL",bits:12}:o==="scale"?{filter:"EXPONENTIAL",bits:12}:{filter:"NONE"}}if(r==="input")return{filter:"NONE"};if(r==="inverseBindMatrices")return{filter:"NONE"}}return{filter:"NONE"}}function Dl(e){for(let t of e.listParents())if(t instanceof dr){for(let a of t.listParents())if(a instanceof di)return a.getTargetPath()}return null}var kl={method:"quantize"},yi=class extends ae{extensionName=je;prereadTypes=[O.BUFFER,O.PRIMITIVE];prewriteTypes=[O.BUFFER,O.ACCESSOR];readDependencies=["meshopt.decoder"];writeDependencies=["meshopt.encoder"];static EXTENSION_NAME=je;static EncoderMethod=Mg;_decoder=null;_decoderFallbackBufferMap=new Map;_encoder=null;_encoderOptions=kl;_encoderFallbackBuffer=null;_encoderBufferViews={};_encoderBufferViewData={};_encoderBufferViewAccessors={};install(e,t){return e==="meshopt.decoder"&&(this._decoder=t),e==="meshopt.encoder"&&(this._encoder=t),this}setEncoderOptions(e){return this._encoderOptions={...kl,...e},this}preread(e,t){if(!this._decoder){if(!this.isRequired())return this;throw new Error(`[${je}] Please install extension dependency, "meshopt.decoder".`)}if(!this._decoder.supported){if(!this.isRequired())return this;throw new Error(`[${je}]: Missing WASM support.`)}return t===O.BUFFER?this._prereadBuffers(e):t===O.PRIMITIVE&&this._prereadPrimitives(e),this}_prereadBuffers(e){let t=e.jsonDoc;(t.json.bufferViews||[]).forEach((a,s)=>{if(!a.extensions||!a.extensions.EXT_meshopt_compression)return;let r=a.extensions[je],n=r.byteOffset||0,i=r.byteLength||0,o=r.count,c=r.byteStride,l=new Uint8Array(o*c),f=t.json.buffers[r.buffer],u=f.uri?t.resources[f.uri]:t.resources[Bt],p=q.toView(u,n,i);this._decoder.decodeGltfBuffer(l,o,c,p,r.mode,r.filter),e.bufferViews[s]=l})}_prereadPrimitives(e){let t=e.jsonDoc;(t.json.bufferViews||[]).forEach(a=>{if(!a.extensions||!a.extensions.EXT_meshopt_compression)return;let s=a.extensions[je],r=e.buffers[s.buffer],n=e.buffers[a.buffer],i=t.json.buffers[a.buffer];kg(i)&&this._decoderFallbackBufferMap.set(n,r)})}read(e){if(!this.isRequired())return this;for(let[t,a]of this._decoderFallbackBufferMap){for(let s of t.listParents())s instanceof G&&s.swap(t,a);t.dispose()}return this}prewrite(e,t){return t===O.ACCESSOR?this._prewriteAccessors(e):t===O.BUFFER&&this._prewriteBuffers(e),this}_prewriteAccessors(e){let t=e.jsonDoc.json,a=this._encoder,s=this._encoderOptions,r=this.document.getGraph(),n=this.document.createBuffer(),i=this.document.getRoot().listBuffers().indexOf(n),o=1,c=new Map,l=f=>{for(let u of r.listParents(f)){if(u.propertyType===O.ROOT)continue;let p=c.get(f);return p===void 0&&c.set(f,p=o++),p}return-1};this._encoderFallbackBuffer=n,this._encoderBufferViews={},this._encoderBufferViewData={},this._encoderBufferViewAccessors={};for(let f of this.document.getRoot().listAccessors()){if(Dl(f)==="weights"||f.getSparse())continue;let u=e.getAccessorUsage(f),p=e.accessorUsageGroupedByParent.has(u)?l(f):null,b=Rg(f,u),h=s.method==="filter"?Ng(f,this.document):{filter:"NONE"},d=Tg(f,a,b,h),{array:x,byteStride:g}=d,y=f.getBuffer();if(!y)throw new Error(`${je}: Missing buffer for accessor.`);let m=this.document.getRoot().listBuffers().indexOf(y),v=[u,p,b,h.filter,g,m].join(":"),E=this._encoderBufferViews[v],S=this._encoderBufferViewData[v],A=this._encoderBufferViewAccessors[v];(!E||!S)&&(A=this._encoderBufferViewAccessors[v]=[],S=this._encoderBufferViewData[v]=[],E=this._encoderBufferViews[v]={buffer:i,target:Ct.USAGE_TO_TARGET[u],byteOffset:0,byteLength:0,byteStride:u===Ct.BufferViewUsage.ARRAY_BUFFER?g:void 0,extensions:{[je]:{buffer:m,byteOffset:0,byteLength:0,mode:b,filter:h.filter!=="NONE"?h.filter:void 0,byteStride:g,count:0}}});let T=e.createAccessorDef(f);T.componentType=d.componentType,T.normalized=d.normalized,T.byteOffset=E.byteLength,T.min&&d.min&&(T.min=d.min),T.max&&d.max&&(T.max=d.max),e.accessorIndexMap.set(f,t.accessors.length),t.accessors.push(T),A.push(T),S.push(new Uint8Array(x.buffer,x.byteOffset,x.byteLength)),E.byteLength+=x.byteLength,E.extensions.EXT_meshopt_compression.count+=f.getCount()}}_prewriteBuffers(e){let t=this._encoder;for(let a in this._encoderBufferViews){let s=this._encoderBufferViews[a],r=this._encoderBufferViewData[a],n=this.document.getRoot().listBuffers()[s.extensions[je].buffer],i=e.otherBufferViews.get(n)||[],{count:o,byteStride:c,mode:l}=s.extensions[je],f=q.concat(r),u=t.encodeGltfBuffer(f,o,c,l),p=q.pad(u);s.extensions[je].byteLength=u.byteLength,r.length=0,r.push(p),i.push(p),e.otherBufferViews.set(n,i)}}write(e){let t=0;for(let n in this._encoderBufferViews){let i=this._encoderBufferViews[n],o=this._encoderBufferViewData[n][0],c=e.otherBufferViewsIndexMap.get(o),l=this._encoderBufferViewAccessors[n];for(let b of l)b.bufferView=c;let f=e.jsonDoc.json.bufferViews[c],u=f.byteOffset||0;Object.assign(f,i),f.byteOffset=t;let p=f.extensions[je];p.byteOffset=u,t+=q.padNumber(i.byteLength)}let a=this._encoderFallbackBuffer,s=e.bufferIndexMap.get(a),r=e.jsonDoc.json.buffers[s];return r.byteLength=t,r.extensions={[je]:{fallback:!0}},a.dispose(),this}},Cg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="StructuralMetadata",this.parentTypes=[O.ROOT]}getDefaults(){return Object.assign(super.getDefaults(),{schema:null,schemaUri:"",propertyTables:new Se,propertyTextures:new Se,propertyAttributes:new Se})}getSchema(){return this.getRef("schema")}setSchema(e){return this.setRef("schema",e)}getSchemaUri(){return this.get("schemaUri")}setSchemaUri(e){return this.set("schemaUri",e)}listPropertyTables(){return this.listRefs("propertyTables")}addPropertyTable(e){return this.addRef("propertyTables",e)}removePropertyTable(e){return this.removeRef("propertyTables",e)}listPropertyTextures(){return this.listRefs("propertyTextures")}addPropertyTexture(e){return this.addRef("propertyTextures",e)}removePropertyTexture(e){return this.removeRef("propertyTextures",e)}listPropertyAttributes(){return this.listRefs("propertyAttributes")}addPropertyAttribute(e){return this.addRef("propertyAttributes",e)}removePropertyAttribute(e){return this.removeRef("propertyAttributes",e)}},Bg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="Schema",this.parentTypes=["StructuralMetadata"]}getDefaults(){return Object.assign(super.getDefaults(),{description:"",version:"",classes:new ge,enums:new ge})}getId(){return this.get("id")}setId(e){return this.set("id",e)}getDescription(){return this.get("description")}setDescription(e){return this.set("description",e)}getVersion(){return this.get("version")}setVersion(e){return this.set("version",e)}setClass(e,t){return this.setRefMap("classes",e,t)}getClass(e){return this.getRefMap("classes",e)}listClassKeys(){return this.listRefMapKeys("classes")}listClassValues(){return this.listRefMapValues("classes")}setEnum(e,t){return this.setRefMap("enums",e,t)}getEnum(e){return this.getRefMap("enums",e)}listEnumKeys(){return this.listRefMapKeys("enums")}listEnumValues(){return this.listRefMapValues("enums")}},Fg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="Class",this.parentTypes=["Schema"]}getDefaults(){return Object.assign(super.getDefaults(),{description:"",properties:new ge})}getDescription(){return this.get("description")}setDescription(e){return this.set("description",e)}setProperty(e,t){return this.setRefMap("properties",e,t)}getProperty(e){return this.getRefMap("properties",e)}listPropertyKeys(){return this.listRefMapKeys("properties")}listPropertyValues(){return this.listRefMapValues("properties")}},Og=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="ClassProperty",this.parentTypes=["Class"]}getDefaults(){return Object.assign(super.getDefaults(),{description:"",componentType:null,enumType:null,array:null,count:null,normalized:null,offset:null,scale:null,max:null,min:null,required:null,noData:null,default:null})}getDescription(){return this.get("description")}setDescription(e){return this.set("description",e)}getType(){return this.get("type")}setType(e){return this.set("type",e)}getComponentType(){return this.get("componentType")}setComponentType(e){return this.set("componentType",e)}getEnumType(){return this.get("enumType")}setEnumType(e){return this.set("enumType",e)}getArray(){return this.get("array")}setArray(e){return this.set("array",e)}getCount(){return this.get("count")}setCount(e){return this.set("count",e)}getNormalized(){return this.get("normalized")}setNormalized(e){return this.set("normalized",e)}getOffset(){return this.get("offset")}setOffset(e){return this.set("offset",e)}getScale(){return this.get("scale")}setScale(e){return this.set("scale",e)}getMax(){return this.get("max")}setMax(e){return this.set("max",e)}getMin(){return this.get("min")}setMin(e){return this.set("min",e)}getRequired(){return this.get("required")}setRequired(e){return this.set("required",e)}getNoData(){return this.get("noData")}setNoData(e){return this.set("noData",e)}getDefault(){return this.get("default")}setDefault(e){return this.set("default",e)}},Pg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="Enum",this.parentTypes=["Schema"]}getDefaults(){return Object.assign(super.getDefaults(),{description:"",valueType:"UINT16",values:new Se})}getDescription(){return this.get("description")}setDescription(e){return this.set("description",e)}getValueType(){return this.get("valueType")}setValueType(e){return this.set("valueType",e)}listValues(){return this.listRefs("values")}addEnumValue(e){return this.addRef("values",e)}removeEnumValue(e){return this.removeRef("values",e)}},jg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="EnumValue",this.parentTypes=["Enum"]}getDefaults(){return Object.assign(super.getDefaults(),{description:null})}getDescription(){return this.get("description")}setDescription(e){return this.set("description",e)}getValue(){return this.get("value")}setValue(e){return this.set("value",e)}},Lg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="PropertyTable",this.parentTypes=["StructuralMetadata"]}getDefaults(){return Object.assign(super.getDefaults(),{properties:new ge})}getClass(){return this.get("class")}setClass(e){return this.set("class",e)}getCount(){return this.get("count")}setCount(e){return this.set("count",e)}setProperty(e,t){return this.setRefMap("properties",e,t)}getProperty(e){return this.getRefMap("properties",e)}listPropertyKeys(){return this.listRefMapKeys("properties")}listPropertyValues(){return this.listRefMapValues("properties")}},Dg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="PropertyTableProperty",this.parentTypes=["PropertyTable"]}getDefaults(){return Object.assign(super.getDefaults(),{arrayOffsets:null,stringOffsets:null,arrayOffsetType:null,stringOffsetType:null,offset:null,scale:null,max:null,min:null})}getValues(){return this.get("values")}setValues(e){return this.set("values",e)}getArrayOffsets(){return this.get("arrayOffsets")}setArrayOffsets(e){return this.set("arrayOffsets",e)}getStringOffsets(){return this.get("stringOffsets")}setStringOffsets(e){return this.set("stringOffsets",e)}getArrayOffsetType(){return this.get("arrayOffsetType")}setArrayOffsetType(e){return this.set("arrayOffsetType",e)}getStringOffsetType(){return this.get("stringOffsetType")}setStringOffsetType(e){return this.set("stringOffsetType",e)}getOffset(){return this.get("offset")}setOffset(e){return this.set("offset",e)}getScale(){return this.get("scale")}setScale(e){return this.set("scale",e)}getMax(){return this.get("max")}setMax(e){return this.set("max",e)}getMin(){return this.get("min")}setMin(e){return this.set("min",e)}},Ug=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="PropertyTexture",this.parentTypes=["StructuralMetadata"]}getDefaults(){return Object.assign(super.getDefaults(),{properties:new ge})}getClass(){return this.get("class")}setClass(e){return this.set("class",e)}setProperty(e,t){return this.setRefMap("properties",e,t)}getProperty(e){return this.getRefMap("properties",e)}listPropertyKeys(){return this.listRefMapKeys("properties")}listPropertyValues(){return this.listRefMapValues("properties")}},zg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="PropertyTextureProperty",this.parentTypes=["PropertyTexture"]}getDefaults(){let e=new oe(this.graph,"textureInfo");return e.setMinFilter(oe.MagFilter.NEAREST),e.setMagFilter(oe.MagFilter.NEAREST),Object.assign(super.getDefaults(),{channels:[0],texture:null,textureInfo:e,offset:null,scale:null,max:null,min:null})}getChannels(){return this.get("channels")}setChannels(e){return this.set("channels",e)}getTexture(){return this.getRef("texture")}setTexture(e){return this.setRef("texture",e)}getTextureInfo(){return this.getRef("texture")?this.getRef("textureInfo"):null}getOffset(){return this.get("offset")}setOffset(e){return this.set("offset",e)}getScale(){return this.get("scale")}setScale(e){return this.set("scale",e)}getMax(){return this.get("max")}setMax(e){return this.set("max",e)}getMin(){return this.get("min")}setMin(e){return this.set("min",e)}},Gg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="PropertyAttribute",this.parentTypes=["StructuralMetadata"]}getDefaults(){return Object.assign(super.getDefaults(),{properties:new ge})}getClass(){return this.get("class")}setClass(e){return this.set("class",e)}setProperty(e,t){return this.setRefMap("properties",e,t)}getProperty(e){return this.getRefMap("properties",e)}listPropertyKeys(){return this.listRefMapKeys("properties")}listPropertyValues(){return this.listRefMapValues("properties")}},Kg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="PropertyAttributeProperty",this.parentTypes=["PropertyAttribute"]}getDefaults(){return Object.assign(super.getDefaults(),{offset:null,scale:null,max:null,min:null})}getAttribute(){return this.get("attribute")}setAttribute(e){return this.set("attribute",e)}getOffset(){return this.get("offset")}setOffset(e){return this.set("offset",e)}getScale(){return this.get("scale")}setScale(e){return this.set("scale",e)}getMax(){return this.get("max")}setMax(e){return this.set("max",e)}getMin(){return this.get("min")}setMin(e){return this.set("min",e)}},Vg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="NodeStructuralMetadata",this.parentTypes=[O.NODE]}getDefaults(){return Object.assign(super.getDefaults(),{class:"",properties:{}})}getClass(){return this.get("class")}setClass(e){return this.set("class",e)}getProperties(){return this.get("properties")}setProperties(e){return this.set("properties",e)}},Hg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="MeshPrimitiveStructuralMetadata",this.parentTypes=[O.PRIMITIVE]}getDefaults(){return Object.assign(super.getDefaults(),{propertyTextures:new Se,propertyAttributes:new Se})}listPropertyTextures(){return this.listRefs("propertyTextures")}addPropertyTexture(e){return this.addRef("propertyTextures",e)}removePropertyTexture(e){return this.removeRef("propertyTextures",e)}listPropertyAttributes(){return this.listRefs("propertyAttributes")}addPropertyAttribute(e){return this.addRef("propertyAttributes",e)}removePropertyAttribute(e){return this.removeRef("propertyAttributes",e)}},qg=class extends ae{extensionName=H;static EXTENSION_NAME=H;prewriteTypes=[O.BUFFER];prereadTypes=[O.SCENE];createStructuralMetadata(){return new Cg(this.document.getGraph())}createSchema(){return new Bg(this.document.getGraph())}createClass(){return new Fg(this.document.getGraph())}createClassProperty(){return new Og(this.document.getGraph())}createEnum(){return new Pg(this.document.getGraph())}createEnumValue(){return new jg(this.document.getGraph())}createPropertyTable(){return new Lg(this.document.getGraph())}createPropertyTableProperty(){return new Dg(this.document.getGraph())}createPropertyTexture(){return new Ug(this.document.getGraph())}createPropertyTextureProperty(){return new zg(this.document.getGraph())}createPropertyAttribute(){return new Gg(this.document.getGraph())}createPropertyAttributeProperty(){return new Kg(this.document.getGraph())}createNodeStructuralMetadata(){return new Vg(this.document.getGraph())}createMeshPrimitiveStructuralMetadata(){return new Hg(this.document.getGraph())}read(e){return this}preread(e){let t=this.document.getRoot(),{json:a}=e.jsonDoc,s=a.extensions[H],r=Wg(this,e,s);return t.setExtension(H,r),(a.meshes||[]).forEach((n,i)=>{let o=e.meshes[i].listPrimitives();(n.primitives||[]).forEach((c,l)=>{let f=o[l];this._readPrimitive(r,f,c)})}),(a.nodes||[]).forEach((n,i)=>{this._readNode(e.nodes[i],n)}),this}_readPrimitive(e,t,a){if(!a.extensions||!a.extensions.EXT_structural_metadata)return;let s=this.createMeshPrimitiveStructuralMetadata(),r=a.extensions[H],n=e.listPropertyTextures(),i=r.propertyTextures||[];for(let l of i){let f=n[l];s.addPropertyTexture(f)}let o=e.listPropertyAttributes(),c=r.propertyAttributes||[];for(let l of c){let f=o[l];s.addPropertyAttribute(f)}t.setExtension(H,s)}_readNode(e,t){if(!t.extensions||!t.extensions.EXT_structural_metadata)return;let a=t.extensions[H],s=this.createNodeStructuralMetadata().setClass(a.class).setProperties(a.properties);e.setExtension(H,s)}write(e){let t=this.document.getRoot(),a=t.getExtension(H);if(!a)return this;let s=e.jsonDoc.json,r=nm(e,a);s.extensions=s.extensions||{},s.extensions[H]=r;let n=t.listMeshes(),i=s.meshes;if(i)for(let l of n){let f=i[e.meshIndexMap.get(l)];l.listPrimitives().forEach((u,p)=>{let b=f.primitives[p];this._writePrimitive(a,u,b)})}let o=t.listNodes(),c=s.nodes;if(c)for(let l of o){let f=e.nodeIndexMap.get(l);this._writeNode(l,c[f])}return this}_writePrimitive(e,t,a){let s=t.getExtension(H);if(!s)return;let r=e.listPropertyTextures(),n=e.listPropertyAttributes(),i,o,c=s.listPropertyTextures();if(c.length>0){i=[];for(let u of c){let p=r.indexOf(u);if(p>=0)i.push(p);else throw new Error(`${H}: Invalid property texture in mesh primitive`)}}let l=s.listPropertyAttributes();if(l.length>0){o=[];for(let u of l){let p=n.indexOf(u);if(p>=0)o.push(p);else throw new Error(`${H}: Invalid property attribute in mesh primitive`)}}let f={propertyTextures:i,propertyAttributes:o};a.extensions=a.extensions||{},a.extensions[H]=f}_writeNode(e,t){let a=e.getExtension("EXT_structural_metadata");a&&(t.extensions=t.extensions||{},t.extensions[H]={class:a.getClass(),properties:a.getProperties()})}prewrite(e,t){return t===O.BUFFER&&this._prewriteBuffers(e),this}_prewriteBuffers(e){let t=this.document,a=t.getRoot().getExtension(H);e.jsonDoc.json.bufferViews||=[];for(let s of a.listPropertyTables())for(let r of s.listPropertyValues()){let n=mm(t,e);n.push(r.getValues());let i=r.getArrayOffsets();i&&n.push(i);let o=r.getStringOffsets();o&&n.push(o)}}};function Wg(e,t,a){let s=e.createStructuralMetadata();if(a.schema!==void 0){let o=Xg(e,a.schema);s.setSchema(o)}else if(a.schemaUri){let o=a.schemaUri;s.setSchemaUri(o)}let r=a.propertyTextures||[];for(let o of r){let c=Zg(e,t,o);s.addPropertyTexture(c)}let n=a.propertyTables||[];for(let o of n){let c=tm(e,t,o);s.addPropertyTable(c)}let i=a.propertyAttributes||[];for(let o of i){let c=sm(e,o);s.addPropertyAttribute(c)}return s}function Xg(e,t){let a=e.createSchema().setId(t.id);t.name!==void 0&&a.setName(t.name),t.description!==void 0&&a.setDescription(t.description),t.version!==void 0&&a.setVersion(t.version);let s=t.classes||{};for(let n of Object.keys(s)){let i=s[n];a.setClass(n,$g(e,i))}let r=t.enums||{};for(let n of Object.keys(r))a.setEnum(n,Jg(e,r[n]));return a}function $g(e,t){let a=e.createClass();t.name!==void 0&&a.setName(t.name),t.description!==void 0&&a.setDescription(t.description);let s=t.properties||{};for(let r of Object.keys(s)){let n=Yg(e,s[r]);a.setProperty(r,n)}return a}function Yg(e,t){let a=e.createClassProperty().setType(t.type);return t.name!==void 0&&a.setName(t.name),t.description!==void 0&&a.setDescription(t.description),t.componentType!==void 0&&a.setComponentType(t.componentType),t.enumType!==void 0&&a.setEnumType(t.enumType),t.array!==void 0&&a.setArray(t.array),t.count!==void 0&&a.setCount(t.count),t.normalized!==void 0&&a.setNormalized(t.normalized),t.offset!==void 0&&a.setOffset(t.offset),t.scale!==void 0&&a.setScale(t.scale),t.max!==void 0&&a.setMax(t.max),t.min!==void 0&&a.setMin(t.min),t.required!==void 0&&a.setRequired(t.required),t.noData!==void 0&&a.setNoData(t.noData),t.default!==void 0&&a.setDefault(t.default),a}function Jg(e,t){let a=e.createEnum();t.name!==void 0&&a.setName(t.name),t.description!==void 0&&a.setDescription(t.description),t.valueType!==void 0&&a.setValueType(t.valueType);let s=t.values||{};for(let r of s)a.addEnumValue(Qg(e,r));return a}function Qg(e,t){let a=e.createEnumValue();return t.name!==void 0&&a.setName(t.name),t.description!==void 0&&a.setDescription(t.description),t.value!==void 0&&a.setValue(t.value),a}function Zg(e,t,a){let s=e.createPropertyTexture();s.setClass(a.class),a.name!==void 0&&s.setName(a.name);let r=a.properties||{};for(let n of Object.keys(r)){let i=em(e,t,r[n]);s.setProperty(n,i)}return s}function em(e,t,a){let s=e.createPropertyTextureProperty(),r=t.jsonDoc.json.textures||[];a.channels&&s.setChannels(a.channels);let n=r[a.index].source;if(n!==void 0){let i=t.textures[n];s.setTexture(i);let o=s.getTextureInfo();o&&t.setTextureInfo(o,a)}return a.offset!==void 0&&s.setOffset(a.offset),a.scale!==void 0&&s.setScale(a.scale),a.max!==void 0&&s.setMax(a.max),a.min!==void 0&&s.setMin(a.min),s}function tm(e,t,a){let s=e.createPropertyTable().setClass(a.class).setCount(a.count);a.name!==void 0&&s.setName(a.name);let r=a.properties||{};for(let n of Object.keys(r)){let i=am(e,t,r[n]);s.setProperty(n,i)}return s}function am(e,t,a){let s=e.createPropertyTableProperty(),r=fi(t,a.values);if(s.setValues(r),a.arrayOffsets!==void 0){let n=fi(t,a.arrayOffsets);s.setArrayOffsets(n)}if(a.stringOffsets!==void 0){let n=fi(t,a.stringOffsets);s.setStringOffsets(n)}return a.arrayOffsetType!==void 0&&s.setArrayOffsetType(a.arrayOffsetType),a.stringOffsetType!==void 0&&s.setStringOffsetType(a.stringOffsetType),a.offset!==void 0&&s.setOffset(a.offset),a.scale!==void 0&&s.setScale(a.scale),a.max!==void 0&&s.setMax(a.max),a.min!==void 0&&s.setMin(a.min),s}function sm(e,t){let a=e.createPropertyAttribute();a.setClass(t.class),t.name!==void 0&&a.setName(t.name);let s=t.properties||{};for(let r of Object.keys(s)){let n=rm(e,s[r]);a.setProperty(r,n)}return a}function rm(e,t){let a=e.createPropertyAttributeProperty();return a.setAttribute(t.attribute),t.offset!==void 0&&a.setOffset(t.offset),t.scale!==void 0&&a.setScale(t.scale),t.max!==void 0&&a.setMax(t.max),t.min!==void 0&&a.setMin(t.min),a}function nm(e,t){let a={},s=t.getSchema();s&&(a.schema=im(s));let r=t.getSchemaUri();r&&(a.schemaUri=r);let n=t.listPropertyTables();if(n.length>0){let c=[];for(let l of n){let f=um(e,l);c.push(f)}a.propertyTables=c}let i=t.listPropertyTextures();if(i.length>0){let c=[];for(let l of i){let f=pm(e,l);c.push(f)}a.propertyTextures=c}let o=t.listPropertyAttributes();if(o.length>0){let c=[];for(let l of o){let f=hm(l);c.push(f)}a.propertyAttributes=c}return a}function im(e){let t={id:e.getId()},a=e.listClassKeys();if(a.length>0){t.classes={};for(let r of a){let n=om(e.getClass(r));t.classes[r]=n}}let s=e.listEnumKeys();if(s.length>0){t.enums={};for(let r of s){let n=lm(e.getEnum(r));t.enums[r]=n}}return e.getName()&&(t.name=e.getName()),e.getDescription()&&(t.description=e.getDescription()),e.getVersion()&&(t.version=e.getVersion()),t}function om(e){let t={},a=e.listPropertyKeys();if(a.length>0){t.properties={};for(let s of a){let r=e.getProperty(s);t.properties[s]=cm(r)}}return e.getName()&&(t.name=e.getName()),e.getDescription()&&(t.description=e.getDescription()),t}function cm(e){let t={type:e.getType()};return e.getArray()&&(t.array=e.getArray()),e.getNormalized()&&(t.normalized=e.getNormalized()),e.getRequired()&&(t.required=e.getRequired()),e.getName()&&(t.name=e.getName()),e.getDescription()&&(t.description=e.getDescription()),e.getComponentType()!=null&&(t.componentType=e.getComponentType()),e.getEnumType()!=null&&(t.enumType=e.getEnumType()),e.getCount()!=null&&(t.count=e.getCount()),e.getOffset()!=null&&(t.offset=e.getOffset()),e.getScale()!=null&&(t.scale=e.getScale()),e.getMax()!=null&&(t.max=e.getMax()),e.getMin()!=null&&(t.min=e.getMin()),e.getNoData()!=null&&(t.noData=e.getNoData()),e.getDefault()!=null&&(t.default=e.getDefault()),t}function lm(e){let t={values:e.listValues().map(dm)};return e.getName()&&(t.name=e.getName()),e.getDescription()&&(t.description=e.getDescription()),e.getValueType()!=="UINT16"&&(t.valueType=e.getValueType()),t}function dm(e){let t={name:e.getName(),value:e.getValue()};return e.getDescription()&&(t.description=e.getDescription()),t}function um(e,t){let a={class:t.getClass(),count:t.getCount()};t.getName()&&(a.name=t.getName());let s=t.listPropertyKeys();if(s.length>0){a.properties={};for(let r of s){let n=fm(e,t.getProperty(r));a.properties[r]=n}}return a}function fm(e,t){let a=t.getValues(),s={values:e.otherBufferViewsIndexMap.get(a)};if(t.getArrayOffsets()){let r=t.getArrayOffsets();s.arrayOffsets=e.otherBufferViewsIndexMap.get(r)}if(t.getStringOffsets()){let r=t.getStringOffsets();s.stringOffsets=e.otherBufferViewsIndexMap.get(r)}return t.getArrayOffsetType()!=null&&(s.arrayOffsetType=t.getArrayOffsetType()),t.getStringOffsetType()!=null&&(s.stringOffsetType=t.getStringOffsetType()),t.getOffset()!=null&&(s.offset=t.getOffset()),t.getScale()!=null&&(s.scale=t.getScale()),t.getMax()!=null&&(s.max=t.getMax()),t.getMin()!=null&&(s.min=t.getMin()),s}function hm(e){let t={class:e.getClass()};e.getName()&&(t.name=e.getName());let a=e.listPropertyKeys();if(a.length>0){t.properties={};for(let s of a){let r=bm(e.getProperty(s));t.properties[s]=r}}return t}function bm(e){let t={attribute:e.getAttribute()};return e.getOffset()!=null&&(t.offset=e.getOffset()),e.getScale()!=null&&(t.scale=e.getScale()),e.getMax()!=null&&(t.max=e.getMax()),e.getMin()!=null&&(t.min=e.getMin()),t}function pm(e,t){let a={class:t.getClass()};t.getName()&&(a.name=t.getName());let s=t.listPropertyKeys();if(s.length>0){a.properties={};for(let r of s){let n=gm(e,t.getProperty(r));a.properties[r]=n}}return a}function gm(e,t){let a=t.getTexture(),s=t.getTextureInfo(),r=t.getChannels(),n=e.createTextureInfoDef(a,s);return le.eq(r,[0])||(n.channels=r),t.getOffset()!=null&&(n.offset=t.getOffset()),t.getScale()!=null&&(n.scale=t.getScale()),t.getMax()!=null&&(n.max=t.getMax()),t.getMin()!=null&&(n.min=t.getMin()),n}function fi(e,t){let a=e.jsonDoc,s=a.json.buffers||[],r=(a.json.bufferViews||[])[t],n=s[r.buffer],i=n.uri?a.resources[n.uri]:a.resources[Bt],o=r.byteOffset||0,c=r.byteLength;return i.slice(o,o+c)}function mm(e,t){let a=e.getRoot().listBuffers()[0],s=t.otherBufferViews.get(a);return s||(s=[],t.otherBufferViews.set(a,s)),s}var ym=class{match(e){return e.length>=12&&q.decodeText(e.slice(4,12))==="ftypavif"}getSize(e){if(!this.match(e))return null;let t=new DataView(e.buffer,e.byteOffset,e.byteLength),a=El(t,0);if(!a)return null;let s=a.end;for(;a=El(t,s);)if(a.type==="meta")s=a.start+4;else if(a.type==="iprp"||a.type==="ipco")s=a.start;else{if(a.type==="ispe")return[t.getUint32(a.start+4),t.getUint32(a.start+8)];if(a.type==="mdat")break;s=a.end}return null}getChannels(e){return 4}},xm=class extends ae{extensionName=br;prereadTypes=[O.TEXTURE];static EXTENSION_NAME=br;static register(){lt.registerFormat("image/avif",new ym)}preread(e){return(e.jsonDoc.json.textures||[]).forEach(t=>{t.extensions&&t.extensions.EXT_texture_avif&&(t.source=t.extensions[br].source)}),this}read(e){return this}write(e){let t=e.jsonDoc;return this.document.getRoot().listTextures().forEach(a=>{if(a.getMimeType()==="image/avif"){let s=e.imageIndexMap.get(a);(t.json.textures||[]).forEach(r=>{r.source===s&&(r.extensions=r.extensions||{},r.extensions[br]={source:r.source},delete r.source)})}}),this}};function El(e,t){if(e.byteLength<4+t)return null;let a=e.getUint32(t);return e.byteLength<a+t||a<8?null:{type:q.decodeText(new Uint8Array(e.buffer,e.byteOffset+t+4,4)),start:t+8,end:t+a}}var wm=class{match(e){return e.length>=12&&e[8]===87&&e[9]===69&&e[10]===66&&e[11]===80}getSize(e){let t=q.decodeText(e.slice(0,4)),a=q.decodeText(e.slice(8,12));if(t!=="RIFF"||a!=="WEBP")return null;let s=new DataView(e.buffer,e.byteOffset),r=12;for(;r<s.byteLength;){let n=q.decodeText(new Uint8Array([s.getUint8(r),s.getUint8(r+1),s.getUint8(r+2),s.getUint8(r+3)])),i=s.getUint32(r+4,!0);if(n==="VP8 ")return[s.getInt16(r+14,!0)&16383,s.getInt16(r+16,!0)&16383];if(n==="VP8L"){let o=s.getUint8(r+9),c=s.getUint8(r+10),l=s.getUint8(r+11),f=s.getUint8(r+12);return[1+((c&63)<<8|o),1+((f&15)<<10|l<<2|(c&192)>>6)]}r+=8+i+i%2}return null}getChannels(e){return 4}},vm=class extends ae{extensionName=hr;prereadTypes=[O.TEXTURE];static EXTENSION_NAME=hr;static register(){lt.registerFormat("image/webp",new wm)}preread(e){return(e.jsonDoc.json.textures||[]).forEach(t=>{t.extensions&&t.extensions.EXT_texture_webp&&(t.source=t.extensions[hr].source)}),this}read(e){return this}write(e){let t=e.jsonDoc;return this.document.getRoot().listTextures().forEach(a=>{if(a.getMimeType()==="image/webp"){let s=e.imageIndexMap.get(a);(t.json.textures||[]).forEach(r=>{r.source===s&&(r.extensions=r.extensions||{},r.extensions[hr]={source:r.source},delete r.source)})}}),this}},Sl=fg,Mm=class extends ae{extensionName=Sl;static EXTENSION_NAME=Sl;read(e){return this}write(e){return this}},Tl=hg,km=class extends ae{extensionName=Tl;static EXTENSION_NAME=Tl;read(e){return this}write(e){return this}},ye,Ul,zl;function Em(e,t){let a=new ye.DecoderBuffer;try{if(a.Init(t,t.length),e.GetEncodedGeometryType(a)!==ye.TRIANGULAR_MESH)throw new Error(`[${fe}] Unknown geometry type.`);let s=new ye.Mesh;if(!e.DecodeBufferToMesh(a,s).ok()||s.ptr===0)throw new Error(`[${fe}] Decoding failure.`);return s}finally{ye.destroy(a)}}function Sm(e,t){let a=t.num_faces()*3,s,r;if(t.num_points()<=65534){let n=a*Uint16Array.BYTES_PER_ELEMENT;s=ye._malloc(n),e.GetTrianglesUInt16Array(t,n,s),r=new Uint16Array(ye.HEAPU16.buffer,s,a).slice()}else{let n=a*Uint32Array.BYTES_PER_ELEMENT;s=ye._malloc(n),e.GetTrianglesUInt32Array(t,n,s),r=new Uint32Array(ye.HEAPU32.buffer,s,a).slice()}return ye._free(s),r}function Tm(e,t,a,s){let r=zl[s.componentType],n=Ul[s.componentType],i=a.num_components(),o=t.num_points()*i,c=o*n.BYTES_PER_ELEMENT,l=ye._malloc(c);e.GetAttributeDataArrayForAllPoints(t,a,r,c,l);let f=new n(ye.HEAPF32.buffer,l,o).slice();return ye._free(l),f}function Am(e){ye=e,Ul={[G.ComponentType.FLOAT]:Float32Array,[G.ComponentType.UNSIGNED_INT]:Uint32Array,[G.ComponentType.UNSIGNED_SHORT]:Uint16Array,[G.ComponentType.UNSIGNED_BYTE]:Uint8Array,[G.ComponentType.SHORT]:Int16Array,[G.ComponentType.BYTE]:Int8Array},zl={[G.ComponentType.FLOAT]:ye.DT_FLOAT32,[G.ComponentType.UNSIGNED_INT]:ye.DT_UINT32,[G.ComponentType.UNSIGNED_SHORT]:ye.DT_UINT16,[G.ComponentType.UNSIGNED_BYTE]:ye.DT_UINT8,[G.ComponentType.SHORT]:ye.DT_INT16,[G.ComponentType.BYTE]:ye.DT_INT8}}var Xe,Im=(function(e){return e[e.EDGEBREAKER=1]="EDGEBREAKER",e[e.SEQUENTIAL=0]="SEQUENTIAL",e})({}),Gl={POSITION:14,NORMAL:10,COLOR:8,TEX_COORD:12,GENERIC:12},Al={decodeSpeed:5,encodeSpeed:5,method:1,quantizationBits:Gl,quantizationVolume:"mesh"};function _m(e){Xe=e}function Rm(e,t=Al){let a={...Al,...t};a.quantizationBits={...Gl,...t.quantizationBits};let s=new Xe.MeshBuilder,r=new Xe.Mesh,n=new Xe.ExpertEncoder(r),i={},o=new Xe.DracoInt8Array,c=e.listTargets().length>0,l=!1;for(let d of e.listSemantics()){let x=e.getAttribute(d);if(x.getSparse()){l=!0;continue}let g=Nm(d),y=Cm(s,x.getComponentType(),r,Xe[g],x.getCount(),x.getElementSize(),x.getArray());if(y===-1)throw new Error(`Error compressing "${d}" attribute.`);if(i[d]=y,a.quantizationVolume==="mesh"||d!=="POSITION")n.SetAttributeQuantization(y,a.quantizationBits[g]);else if(typeof a.quantizationVolume=="object"){let{quantizationVolume:m}=a,v=Math.max(m.max[0]-m.min[0],m.max[1]-m.min[1],m.max[2]-m.min[2]);n.SetAttributeExplicitQuantization(y,a.quantizationBits[g],x.getElementSize(),m.min,v)}else throw new Error("Invalid quantization volume state.")}let f=e.getIndices();if(!f)throw new gi("Primitive must have indices.");s.AddFacesToMesh(r,f.getCount()/3,f.getArray()),n.SetSpeedOptions(a.encodeSpeed,a.decodeSpeed),n.SetTrackEncodedProperties(!0),a.method===0||c||l?n.SetEncodingMethod(Xe.MESH_SEQUENTIAL_ENCODING):n.SetEncodingMethod(Xe.MESH_EDGEBREAKER_ENCODING);let u=n.EncodeToDracoBuffer(!(c||l),o);if(u<=0)throw new gi("Error applying Draco compression.");let p=new Uint8Array(u);for(let d=0;d<u;++d)p[d]=o.GetValue(d);let b=n.GetNumberOfEncodedPoints(),h=n.GetNumberOfEncodedFaces()*3;return Xe.destroy(o),Xe.destroy(r),Xe.destroy(s),Xe.destroy(n),{numVertices:b,numIndices:h,data:p,attributeIDs:i}}function Nm(e){return e==="POSITION"?"POSITION":e==="NORMAL"?"NORMAL":e.startsWith("COLOR_")?"COLOR":e.startsWith("TEXCOORD_")?"TEX_COORD":"GENERIC"}function Cm(e,t,a,s,r,n,i){switch(t){case G.ComponentType.UNSIGNED_BYTE:return e.AddUInt8Attribute(a,s,r,n,i);case G.ComponentType.BYTE:return e.AddInt8Attribute(a,s,r,n,i);case G.ComponentType.UNSIGNED_SHORT:return e.AddUInt16Attribute(a,s,r,n,i);case G.ComponentType.SHORT:return e.AddInt16Attribute(a,s,r,n,i);case G.ComponentType.UNSIGNED_INT:return e.AddUInt32Attribute(a,s,r,n,i);case G.ComponentType.FLOAT:return e.AddFloatAttribute(a,s,r,n,i);default:throw new Error(`Unexpected component type, "${t}".`)}}var gi=class extends Error{},Bm=class extends ae{extensionName=fe;prereadTypes=[O.PRIMITIVE];prewriteTypes=[O.ACCESSOR];readDependencies=["draco3d.decoder"];writeDependencies=["draco3d.encoder"];static EXTENSION_NAME=fe;static EncoderMethod=Im;_decoderModule=null;_encoderModule=null;_encoderOptions={};install(e,t){return e==="draco3d.decoder"&&(this._decoderModule=t,Am(this._decoderModule)),e==="draco3d.encoder"&&(this._encoderModule=t,_m(this._encoderModule)),this}setEncoderOptions(e){return this._encoderOptions=e,this}preread(e){if(!this._decoderModule)throw new Error(`[${fe}] Please install extension dependency, "draco3d.decoder".`);let t=this.document.getLogger(),a=e.jsonDoc,s=new Map;try{let r=a.json.meshes||[];for(let n of r)for(let i of n.primitives){if(!i.extensions||!i.extensions.KHR_draco_mesh_compression)continue;let o=i.extensions[fe],[c,l]=s.get(o.bufferView)||[];if(!l||!c){let f=a.json.bufferViews[o.bufferView],u=a.json.buffers[f.buffer],p=u.uri?a.resources[u.uri]:a.resources[Bt],b=f.byteOffset||0,h=f.byteLength,d=q.toView(p,b,h);c=new this._decoderModule.Decoder,l=Em(c,d),s.set(o.bufferView,[c,l]),t.debug(`[${fe}] Decompressed ${d.byteLength} bytes.`)}for(let f in o.attributes){let u=e.jsonDoc.json.accessors[i.attributes[f]],p=c.GetAttributeByUniqueId(l,o.attributes[f]),b=Tm(c,l,p,u);e.accessors[i.attributes[f]].setArray(b)}i.indices!==void 0&&e.accessors[i.indices].setArray(Sm(c,l))}}finally{for(let[r,n]of Array.from(s.values()))this._decoderModule.destroy(r),this._decoderModule.destroy(n)}return this}read(e){return this}prewrite(e,t){if(!this._encoderModule)throw new Error(`[${fe}] Please install extension dependency, "draco3d.encoder".`);let a=this.document.getLogger();a.debug(`[${fe}] Compression options: ${JSON.stringify(this._encoderOptions)}`);let s=Fm(this.document),r=new Map,n="mesh";this._encoderOptions.quantizationVolume==="scene"&&(this.document.getRoot().listScenes().length!==1?a.warn(`[${fe}]: quantizationVolume=scene requires exactly 1 scene.`):n=el(this.document.getRoot().listScenes().pop()));for(let i of Array.from(s.keys())){let o=s.get(i);if(!o)throw new Error("Unexpected primitive.");if(r.has(o)){r.set(o,r.get(o));continue}let c=i.getIndices(),l=e.jsonDoc.json.accessors,f;try{f=Rm(i,{...this._encoderOptions,quantizationVolume:n})}catch(b){if(b instanceof gi){a.warn(`[${fe}]: ${b.message} Skipping primitive compression.`);continue}throw b}r.set(o,f);let u=e.createAccessorDef(c);u.count=f.numIndices,e.accessorIndexMap.set(c,l.length),l.push(u),f.numVertices>65534&&G.getComponentSize(u.componentType)<=2?u.componentType=G.ComponentType.UNSIGNED_INT:f.numVertices>254&&G.getComponentSize(u.componentType)<=1&&(u.componentType=G.ComponentType.UNSIGNED_SHORT);for(let b of i.listSemantics()){let h=i.getAttribute(b);if(f.attributeIDs[b]===void 0)continue;let d=e.createAccessorDef(h);d.count=f.numVertices,e.accessorIndexMap.set(h,l.length),l.push(d)}let p=i.getAttribute("POSITION").getBuffer()||this.document.getRoot().listBuffers()[0];e.otherBufferViews.has(p)||e.otherBufferViews.set(p,[]),e.otherBufferViews.get(p).push(f.data)}return a.debug(`[${fe}] Compressed ${s.size} primitives.`),e.extensionData[fe]={primitiveHashMap:s,primitiveEncodingMap:r},this}write(e){let t=e.extensionData[fe];for(let a of this.document.getRoot().listMeshes()){let s=e.jsonDoc.json.meshes[e.meshIndexMap.get(a)];for(let r=0;r<a.listPrimitives().length;r++){let n=a.listPrimitives()[r],i=s.primitives[r],o=t.primitiveHashMap.get(n);if(!o)continue;let c=t.primitiveEncodingMap.get(o);c&&(i.extensions=i.extensions||{},i.extensions[fe]={bufferView:e.otherBufferViewsIndexMap.get(c.data),attributes:c.attributeIDs})}}if(!t.primitiveHashMap.size){let a=e.jsonDoc.json;a.extensionsUsed=(a.extensionsUsed||[]).filter(s=>s!==fe),a.extensionsRequired=(a.extensionsRequired||[]).filter(s=>s!==fe)}return this}};function Fm(e){let t=e.getLogger(),a=new Set,s=new Set,r=0,n=0;for(let u of e.getRoot().listMeshes())for(let p of u.listPrimitives())p.getIndices()?p.getMode()!==Qa.Mode.TRIANGLES?(s.add(p),n++):a.add(p):(s.add(p),r++);r>0&&t.warn(`[${fe}] Skipping Draco compression of ${r} non-indexed primitives.`),n>0&&t.warn(`[${fe}] Skipping Draco compression of ${n} non-TRIANGLES primitives.`);let i=e.getRoot().listAccessors(),o=new Map;for(let u=0;u<i.length;u++)o.set(i[u],u);let c=new Map,l=new Set,f=new Map;for(let u of Array.from(a)){let p=Il(u,o);if(l.has(p)){f.set(u,p);continue}if(c.has(u.getIndices())){let b=u.getIndices(),h=b.clone();o.set(h,e.getRoot().listAccessors().length-1),u.swap(b,h)}for(let b of u.listAttributes())if(c.has(b)){let h=b.clone();o.set(h,e.getRoot().listAccessors().length-1),u.swap(b,h)}p=Il(u,o),l.add(p),f.set(u,p),c.set(u.getIndices(),p);for(let b of u.listAttributes())c.set(b,p)}for(let u of Array.from(c.keys())){let p=new Set(u.listParents().map(b=>b.propertyType));if(p.size!==2||!p.has(O.PRIMITIVE)||!p.has(O.ROOT))throw new Error(`[${fe}] Compressed accessors must only be used as indices or vertex attributes.`)}for(let u of Array.from(a)){let p=f.get(u),b=u.getIndices();if(c.get(b)!==p||u.listAttributes().some(h=>c.get(h)!==p))throw new Error(`[${fe}] Draco primitives must share all, or no, accessors.`)}for(let u of Array.from(s)){let p=u.getIndices();if(c.has(p)||u.listAttributes().some(b=>c.has(b)))throw new Error(`[${fe}] Accessor cannot be shared by compressed and uncompressed primitives.`)}return f}function Il(e,t){let a=[],s=e.getIndices();a.push(t.get(s));for(let r of e.listAttributes())a.push(t.get(r));return a.sort().join("|")}var _l=class Kl extends X{static EXTENSION_NAME=mt;static Type={POINT:"point",SPOT:"spot",DIRECTIONAL:"directional"};init(){this.extensionName=mt,this.propertyType="Light",this.parentTypes=[O.NODE]}getDefaults(){return Object.assign(super.getDefaults(),{color:[1,1,1],intensity:1,type:Kl.Type.POINT,range:null,innerConeAngle:0,outerConeAngle:Math.PI/4})}getColor(){return this.get("color")}setColor(t){return this.set("color",t)}getIntensity(){return this.get("intensity")}setIntensity(t){return this.set("intensity",t)}getType(){return this.get("type")}setType(t){return this.set("type",t)}getRange(){return this.get("range")}setRange(t){return this.set("range",t)}getInnerConeAngle(){return this.get("innerConeAngle")}setInnerConeAngle(t){return this.set("innerConeAngle",t)}getOuterConeAngle(){return this.get("outerConeAngle")}setOuterConeAngle(t){return this.set("outerConeAngle",t)}},Om=class extends ae{extensionName=mt;static EXTENSION_NAME=mt;createLight(e=""){return new _l(this.document.getGraph(),e)}read(e){let t=e.jsonDoc;if(!t.json.extensions||!t.json.extensions.KHR_lights_punctual)return this;let a=(t.json.extensions.KHR_lights_punctual.lights||[]).map(s=>{let r=this.createLight().setName(s.name||"").setType(s.type);return s.extras&&r.setExtras(s.extras),s.color!==void 0&&r.setColor(s.color),s.intensity!==void 0&&r.setIntensity(s.intensity),s.range!==void 0&&r.setRange(s.range),s.spot?.innerConeAngle!==void 0&&r.setInnerConeAngle(s.spot.innerConeAngle),s.spot?.outerConeAngle!==void 0&&r.setOuterConeAngle(s.spot.outerConeAngle),r});return t.json.nodes.forEach((s,r)=>{if(!s.extensions||!s.extensions.KHR_lights_punctual)return;let n=s.extensions[mt];e.nodes[r].setExtension(mt,a[n.light])}),this}write(e){let t=e.jsonDoc;if(this.properties.size===0)return this;let a=[],s=new Map;for(let r of this.properties){let n=r,i=e.createPropertyDef(r);i.type=n.getType(),le.eq(n.getColor(),[1,1,1])||(i.color=n.getColor()),n.getIntensity()!==1&&(i.intensity=n.getIntensity()),n.getRange()!=null&&(i.range=n.getRange()),n.getName()&&(i.name=n.getName()),n.getType()===_l.Type.SPOT&&(i.spot={innerConeAngle:n.getInnerConeAngle(),outerConeAngle:n.getOuterConeAngle()}),a.push(i),s.set(n,a.length-1)}return this.document.getRoot().listNodes().forEach(r=>{let n=r.getExtension(mt);if(n){let i=e.nodeIndexMap.get(r),o=t.json.nodes[i];o.extensions=o.extensions||{},o.extensions[mt]={light:s.get(n)}}}),t.json.extensions=t.json.extensions||{},t.json.extensions[mt]={lights:a},this}},{R:Pm,G:jm,B:Lm}=at,Dm=class extends X{static EXTENSION_NAME=Pt;init(){this.extensionName=Pt,this.propertyType="Anisotropy",this.parentTypes=[O.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{anisotropyStrength:0,anisotropyRotation:0,anisotropyTexture:null,anisotropyTextureInfo:new oe(this.graph,"anisotropyTextureInfo")})}getAnisotropyStrength(){return this.get("anisotropyStrength")}setAnisotropyStrength(e){return this.set("anisotropyStrength",e)}getAnisotropyRotation(){return this.get("anisotropyRotation")}setAnisotropyRotation(e){return this.set("anisotropyRotation",e)}getAnisotropyTexture(){return this.getRef("anisotropyTexture")}getAnisotropyTextureInfo(){return this.getRef("anisotropyTexture")?this.getRef("anisotropyTextureInfo"):null}setAnisotropyTexture(e){return this.setRef("anisotropyTexture",e,{channels:Pm|jm|Lm})}},Um=class extends ae{static EXTENSION_NAME=Pt;extensionName=Pt;prereadTypes=[O.MESH];prewriteTypes=[O.MESH];createAnisotropy(){return new Dm(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((r,n)=>{if(r.extensions&&r.extensions.KHR_materials_anisotropy){let i=this.createAnisotropy();e.materials[n].setExtension(Pt,i);let o=r.extensions[Pt];if(o.extras&&i.setExtras(o.extras),o.anisotropyStrength!==void 0&&i.setAnisotropyStrength(o.anisotropyStrength),o.anisotropyRotation!==void 0&&i.setAnisotropyRotation(o.anisotropyRotation),o.anisotropyTexture!==void 0){let c=o.anisotropyTexture,l=e.textures[s[c.index].source];i.setAnisotropyTexture(l),e.setTextureInfo(i.getAnisotropyTextureInfo(),c)}}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(Pt);if(s){let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);if(n.extensions=n.extensions||{},n.extensions[Pt]=i,s.getAnisotropyStrength()>0&&(i.anisotropyStrength=s.getAnisotropyStrength()),s.getAnisotropyRotation()!==0&&(i.anisotropyRotation=s.getAnisotropyRotation()),s.getAnisotropyTexture()){let o=s.getAnisotropyTexture(),c=s.getAnisotropyTextureInfo();i.anisotropyTexture=e.createTextureInfoDef(o,c)}}}),this}},{R:Rl,G:Nl,B:zm}=at,Gm=class extends X{static EXTENSION_NAME=jt;init(){this.extensionName=jt,this.propertyType="Clearcoat",this.parentTypes=[O.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{clearcoatFactor:0,clearcoatTexture:null,clearcoatTextureInfo:new oe(this.graph,"clearcoatTextureInfo"),clearcoatRoughnessFactor:0,clearcoatRoughnessTexture:null,clearcoatRoughnessTextureInfo:new oe(this.graph,"clearcoatRoughnessTextureInfo"),clearcoatNormalScale:1,clearcoatNormalTexture:null,clearcoatNormalTextureInfo:new oe(this.graph,"clearcoatNormalTextureInfo")})}getClearcoatFactor(){return this.get("clearcoatFactor")}setClearcoatFactor(e){return this.set("clearcoatFactor",e)}getClearcoatTexture(){return this.getRef("clearcoatTexture")}getClearcoatTextureInfo(){return this.getRef("clearcoatTexture")?this.getRef("clearcoatTextureInfo"):null}setClearcoatTexture(e){return this.setRef("clearcoatTexture",e,{channels:Rl})}getClearcoatRoughnessFactor(){return this.get("clearcoatRoughnessFactor")}setClearcoatRoughnessFactor(e){return this.set("clearcoatRoughnessFactor",e)}getClearcoatRoughnessTexture(){return this.getRef("clearcoatRoughnessTexture")}getClearcoatRoughnessTextureInfo(){return this.getRef("clearcoatRoughnessTexture")?this.getRef("clearcoatRoughnessTextureInfo"):null}setClearcoatRoughnessTexture(e){return this.setRef("clearcoatRoughnessTexture",e,{channels:Nl})}getClearcoatNormalScale(){return this.get("clearcoatNormalScale")}setClearcoatNormalScale(e){return this.set("clearcoatNormalScale",e)}getClearcoatNormalTexture(){return this.getRef("clearcoatNormalTexture")}getClearcoatNormalTextureInfo(){return this.getRef("clearcoatNormalTexture")?this.getRef("clearcoatNormalTextureInfo"):null}setClearcoatNormalTexture(e){return this.setRef("clearcoatNormalTexture",e,{channels:Rl|Nl|zm})}},Km=class extends ae{static EXTENSION_NAME=jt;extensionName=jt;prereadTypes=[O.MESH];prewriteTypes=[O.MESH];createClearcoat(){return new Gm(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((r,n)=>{if(r.extensions&&r.extensions.KHR_materials_clearcoat){let i=this.createClearcoat();e.materials[n].setExtension(jt,i);let o=r.extensions[jt];if(o.extras&&i.setExtras(o.extras),o.clearcoatFactor!==void 0&&i.setClearcoatFactor(o.clearcoatFactor),o.clearcoatRoughnessFactor!==void 0&&i.setClearcoatRoughnessFactor(o.clearcoatRoughnessFactor),o.clearcoatTexture!==void 0){let c=o.clearcoatTexture,l=e.textures[s[c.index].source];i.setClearcoatTexture(l),e.setTextureInfo(i.getClearcoatTextureInfo(),c)}if(o.clearcoatRoughnessTexture!==void 0){let c=o.clearcoatRoughnessTexture,l=e.textures[s[c.index].source];i.setClearcoatRoughnessTexture(l),e.setTextureInfo(i.getClearcoatRoughnessTextureInfo(),c)}if(o.clearcoatNormalTexture!==void 0){let c=o.clearcoatNormalTexture,l=e.textures[s[c.index].source];i.setClearcoatNormalTexture(l),e.setTextureInfo(i.getClearcoatNormalTextureInfo(),c),c.scale!==void 0&&i.setClearcoatNormalScale(c.scale)}}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(jt);if(s){let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);if(n.extensions=n.extensions||{},n.extensions[jt]=i,i.clearcoatFactor=s.getClearcoatFactor(),i.clearcoatRoughnessFactor=s.getClearcoatRoughnessFactor(),s.getClearcoatTexture()){let o=s.getClearcoatTexture(),c=s.getClearcoatTextureInfo();i.clearcoatTexture=e.createTextureInfoDef(o,c)}if(s.getClearcoatRoughnessTexture()){let o=s.getClearcoatRoughnessTexture(),c=s.getClearcoatRoughnessTextureInfo();i.clearcoatRoughnessTexture=e.createTextureInfoDef(o,c)}if(s.getClearcoatNormalTexture()){let o=s.getClearcoatNormalTexture(),c=s.getClearcoatNormalTextureInfo();i.clearcoatNormalTexture=e.createTextureInfoDef(o,c),s.getClearcoatNormalScale()!==1&&(i.clearcoatNormalTexture.scale=s.getClearcoatNormalScale())}}}),this}},{R:Vm,G:Hm,B:qm,A:Wm}=at,Xm=class extends X{static EXTENSION_NAME=Lt;init(){this.extensionName=Lt,this.propertyType="DiffuseTransmission",this.parentTypes=[O.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{diffuseTransmissionFactor:0,diffuseTransmissionTexture:null,diffuseTransmissionTextureInfo:new oe(this.graph,"diffuseTransmissionTextureInfo"),diffuseTransmissionColorFactor:[1,1,1],diffuseTransmissionColorTexture:null,diffuseTransmissionColorTextureInfo:new oe(this.graph,"diffuseTransmissionColorTextureInfo")})}getDiffuseTransmissionFactor(){return this.get("diffuseTransmissionFactor")}setDiffuseTransmissionFactor(e){return this.set("diffuseTransmissionFactor",e)}getDiffuseTransmissionTexture(){return this.getRef("diffuseTransmissionTexture")}getDiffuseTransmissionTextureInfo(){return this.getRef("diffuseTransmissionTexture")?this.getRef("diffuseTransmissionTextureInfo"):null}setDiffuseTransmissionTexture(e){return this.setRef("diffuseTransmissionTexture",e,{channels:Wm})}getDiffuseTransmissionColorFactor(){return this.get("diffuseTransmissionColorFactor")}setDiffuseTransmissionColorFactor(e){return this.set("diffuseTransmissionColorFactor",e)}getDiffuseTransmissionColorTexture(){return this.getRef("diffuseTransmissionColorTexture")}getDiffuseTransmissionColorTextureInfo(){return this.getRef("diffuseTransmissionColorTexture")?this.getRef("diffuseTransmissionColorTextureInfo"):null}setDiffuseTransmissionColorTexture(e){return this.setRef("diffuseTransmissionColorTexture",e,{channels:Vm|Hm|qm})}},$m=class extends ae{extensionName=Lt;static EXTENSION_NAME=Lt;createDiffuseTransmission(){return new Xm(this.document.getGraph())}read(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((r,n)=>{if(r.extensions&&r.extensions.KHR_materials_diffuse_transmission){let i=this.createDiffuseTransmission();e.materials[n].setExtension(Lt,i);let o=r.extensions[Lt];if(o.extras&&i.setExtras(o.extras),o.diffuseTransmissionFactor!==void 0&&i.setDiffuseTransmissionFactor(o.diffuseTransmissionFactor),o.diffuseTransmissionColorFactor!==void 0&&i.setDiffuseTransmissionColorFactor(o.diffuseTransmissionColorFactor),o.diffuseTransmissionTexture!==void 0){let c=o.diffuseTransmissionTexture,l=e.textures[s[c.index].source];i.setDiffuseTransmissionTexture(l),e.setTextureInfo(i.getDiffuseTransmissionTextureInfo(),c)}if(o.diffuseTransmissionColorTexture!==void 0){let c=o.diffuseTransmissionColorTexture,l=e.textures[s[c.index].source];i.setDiffuseTransmissionColorTexture(l),e.setTextureInfo(i.getDiffuseTransmissionColorTextureInfo(),c)}}}),this}write(e){let t=e.jsonDoc;for(let a of this.document.getRoot().listMaterials()){let s=a.getExtension(Lt);if(!s)continue;let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);if(n.extensions=n.extensions||{},n.extensions[Lt]=i,i.diffuseTransmissionFactor=s.getDiffuseTransmissionFactor(),i.diffuseTransmissionColorFactor=s.getDiffuseTransmissionColorFactor(),s.getDiffuseTransmissionTexture()){let o=s.getDiffuseTransmissionTexture(),c=s.getDiffuseTransmissionTextureInfo();i.diffuseTransmissionTexture=e.createTextureInfoDef(o,c)}if(s.getDiffuseTransmissionColorTexture()){let o=s.getDiffuseTransmissionColorTexture(),c=s.getDiffuseTransmissionColorTextureInfo();i.diffuseTransmissionColorTexture=e.createTextureInfoDef(o,c)}}return this}},Ym=class extends X{static EXTENSION_NAME=Dt;init(){this.extensionName=Dt,this.propertyType="Dispersion",this.parentTypes=[O.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{dispersion:0})}getDispersion(){return this.get("dispersion")}setDispersion(e){return this.set("dispersion",e)}},Jm=class extends ae{static EXTENSION_NAME=Dt;extensionName=Dt;prereadTypes=[O.MESH];prewriteTypes=[O.MESH];createDispersion(){return new Ym(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){return(e.jsonDoc.json.materials||[]).forEach((t,a)=>{if(t.extensions&&t.extensions.KHR_materials_dispersion){let s=this.createDispersion();e.materials[a].setExtension(Dt,s);let r=t.extensions[Dt];r.extras&&s.setExtras(r.extras),r.dispersion!==void 0&&s.setDispersion(r.dispersion)}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(Dt);if(s){let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);n.extensions=n.extensions||{},n.extensions[Dt]=i,i.dispersion=s.getDispersion()}}),this}},Qm=class extends X{static EXTENSION_NAME=Ut;init(){this.extensionName=Ut,this.propertyType="EmissiveStrength",this.parentTypes=[O.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{emissiveStrength:1})}getEmissiveStrength(){return this.get("emissiveStrength")}setEmissiveStrength(e){return this.set("emissiveStrength",e)}},Zm=class extends ae{static EXTENSION_NAME=Ut;extensionName=Ut;prereadTypes=[O.MESH];prewriteTypes=[O.MESH];createEmissiveStrength(){return new Qm(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){return(e.jsonDoc.json.materials||[]).forEach((t,a)=>{if(t.extensions&&t.extensions.KHR_materials_emissive_strength){let s=this.createEmissiveStrength();e.materials[a].setExtension(Ut,s);let r=t.extensions[Ut];r.extras&&s.setExtras(r.extras),r.emissiveStrength!==void 0&&s.setEmissiveStrength(r.emissiveStrength)}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(Ut);if(s){let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);n.extensions=n.extensions||{},n.extensions[Ut]=i,i.emissiveStrength=s.getEmissiveStrength()}}),this}},e0=class extends X{static EXTENSION_NAME=zt;init(){this.extensionName=zt,this.propertyType="IOR",this.parentTypes=[O.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{ior:1.5})}getIOR(){return this.get("ior")}setIOR(e){return this.set("ior",e)}},t0=class extends ae{static EXTENSION_NAME=zt;extensionName=zt;prereadTypes=[O.MESH];prewriteTypes=[O.MESH];createIOR(){return new e0(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){return(e.jsonDoc.json.materials||[]).forEach((t,a)=>{if(t.extensions&&t.extensions.KHR_materials_ior){let s=this.createIOR();e.materials[a].setExtension(zt,s);let r=t.extensions[zt];r.extras&&s.setExtras(r.extras),r.ior!==void 0&&s.setIOR(r.ior)}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(zt);if(s){let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);n.extensions=n.extensions||{},n.extensions[zt]=i,i.ior=s.getIOR()}}),this}},{R:a0,G:s0}=at,r0=class extends X{static EXTENSION_NAME=Gt;init(){this.extensionName=Gt,this.propertyType="Iridescence",this.parentTypes=[O.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{iridescenceFactor:0,iridescenceTexture:null,iridescenceTextureInfo:new oe(this.graph,"iridescenceTextureInfo"),iridescenceIOR:1.3,iridescenceThicknessMinimum:100,iridescenceThicknessMaximum:400,iridescenceThicknessTexture:null,iridescenceThicknessTextureInfo:new oe(this.graph,"iridescenceThicknessTextureInfo")})}getIridescenceFactor(){return this.get("iridescenceFactor")}setIridescenceFactor(e){return this.set("iridescenceFactor",e)}getIridescenceTexture(){return this.getRef("iridescenceTexture")}getIridescenceTextureInfo(){return this.getRef("iridescenceTexture")?this.getRef("iridescenceTextureInfo"):null}setIridescenceTexture(e){return this.setRef("iridescenceTexture",e,{channels:a0})}getIridescenceIOR(){return this.get("iridescenceIOR")}setIridescenceIOR(e){return this.set("iridescenceIOR",e)}getIridescenceThicknessMinimum(){return this.get("iridescenceThicknessMinimum")}setIridescenceThicknessMinimum(e){return this.set("iridescenceThicknessMinimum",e)}getIridescenceThicknessMaximum(){return this.get("iridescenceThicknessMaximum")}setIridescenceThicknessMaximum(e){return this.set("iridescenceThicknessMaximum",e)}getIridescenceThicknessTexture(){return this.getRef("iridescenceThicknessTexture")}getIridescenceThicknessTextureInfo(){return this.getRef("iridescenceThicknessTexture")?this.getRef("iridescenceThicknessTextureInfo"):null}setIridescenceThicknessTexture(e){return this.setRef("iridescenceThicknessTexture",e,{channels:s0})}},n0=class extends ae{static EXTENSION_NAME=Gt;extensionName=Gt;prereadTypes=[O.MESH];prewriteTypes=[O.MESH];createIridescence(){return new r0(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((r,n)=>{if(r.extensions&&r.extensions.KHR_materials_iridescence){let i=this.createIridescence();e.materials[n].setExtension(Gt,i);let o=r.extensions[Gt];if(o.extras&&i.setExtras(o.extras),o.iridescenceFactor!==void 0&&i.setIridescenceFactor(o.iridescenceFactor),o.iridescenceIor!==void 0&&i.setIridescenceIOR(o.iridescenceIor),o.iridescenceThicknessMinimum!==void 0&&i.setIridescenceThicknessMinimum(o.iridescenceThicknessMinimum),o.iridescenceThicknessMaximum!==void 0&&i.setIridescenceThicknessMaximum(o.iridescenceThicknessMaximum),o.iridescenceTexture!==void 0){let c=o.iridescenceTexture,l=e.textures[s[c.index].source];i.setIridescenceTexture(l),e.setTextureInfo(i.getIridescenceTextureInfo(),c)}if(o.iridescenceThicknessTexture!==void 0){let c=o.iridescenceThicknessTexture,l=e.textures[s[c.index].source];i.setIridescenceThicknessTexture(l),e.setTextureInfo(i.getIridescenceThicknessTextureInfo(),c)}}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(Gt);if(s){let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);if(n.extensions=n.extensions||{},n.extensions[Gt]=i,s.getIridescenceFactor()>0&&(i.iridescenceFactor=s.getIridescenceFactor()),s.getIridescenceIOR()!==1.3&&(i.iridescenceIor=s.getIridescenceIOR()),s.getIridescenceThicknessMinimum()!==100&&(i.iridescenceThicknessMinimum=s.getIridescenceThicknessMinimum()),s.getIridescenceThicknessMaximum()!==400&&(i.iridescenceThicknessMaximum=s.getIridescenceThicknessMaximum()),s.getIridescenceTexture()){let o=s.getIridescenceTexture(),c=s.getIridescenceTextureInfo();i.iridescenceTexture=e.createTextureInfoDef(o,c)}if(s.getIridescenceThicknessTexture()){let o=s.getIridescenceThicknessTexture(),c=s.getIridescenceThicknessTextureInfo();i.iridescenceThicknessTexture=e.createTextureInfoDef(o,c)}}}),this}},{R:Cl,G:Bl,B:Fl,A:Ol}=at,i0=class extends X{static EXTENSION_NAME=Kt;init(){this.extensionName=Kt,this.propertyType="PBRSpecularGlossiness",this.parentTypes=[O.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{diffuseFactor:[1,1,1,1],diffuseTexture:null,diffuseTextureInfo:new oe(this.graph,"diffuseTextureInfo"),specularFactor:[1,1,1],glossinessFactor:1,specularGlossinessTexture:null,specularGlossinessTextureInfo:new oe(this.graph,"specularGlossinessTextureInfo")})}getDiffuseFactor(){return this.get("diffuseFactor")}setDiffuseFactor(e){return this.set("diffuseFactor",e)}getDiffuseTexture(){return this.getRef("diffuseTexture")}getDiffuseTextureInfo(){return this.getRef("diffuseTexture")?this.getRef("diffuseTextureInfo"):null}setDiffuseTexture(e){return this.setRef("diffuseTexture",e,{channels:Cl|Bl|Fl|Ol,isColor:!0})}getSpecularFactor(){return this.get("specularFactor")}setSpecularFactor(e){return this.set("specularFactor",e)}getGlossinessFactor(){return this.get("glossinessFactor")}setGlossinessFactor(e){return this.set("glossinessFactor",e)}getSpecularGlossinessTexture(){return this.getRef("specularGlossinessTexture")}getSpecularGlossinessTextureInfo(){return this.getRef("specularGlossinessTexture")?this.getRef("specularGlossinessTextureInfo"):null}setSpecularGlossinessTexture(e){return this.setRef("specularGlossinessTexture",e,{channels:Cl|Bl|Fl|Ol})}},o0=class extends ae{static EXTENSION_NAME=Kt;extensionName=Kt;prereadTypes=[O.MESH];prewriteTypes=[O.MESH];createPBRSpecularGlossiness(){return new i0(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((r,n)=>{if(r.extensions&&r.extensions.KHR_materials_pbrSpecularGlossiness){let i=this.createPBRSpecularGlossiness();e.materials[n].setExtension(Kt,i);let o=r.extensions[Kt];if(o.extras&&i.setExtras(o.extras),o.diffuseFactor!==void 0&&i.setDiffuseFactor(o.diffuseFactor),o.specularFactor!==void 0&&i.setSpecularFactor(o.specularFactor),o.glossinessFactor!==void 0&&i.setGlossinessFactor(o.glossinessFactor),o.diffuseTexture!==void 0){let c=o.diffuseTexture,l=e.textures[s[c.index].source];i.setDiffuseTexture(l),e.setTextureInfo(i.getDiffuseTextureInfo(),c)}if(o.specularGlossinessTexture!==void 0){let c=o.specularGlossinessTexture,l=e.textures[s[c.index].source];i.setSpecularGlossinessTexture(l),e.setTextureInfo(i.getSpecularGlossinessTextureInfo(),c)}}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(Kt);if(s){let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);if(n.extensions=n.extensions||{},n.extensions[Kt]=i,i.diffuseFactor=s.getDiffuseFactor(),i.specularFactor=s.getSpecularFactor(),i.glossinessFactor=s.getGlossinessFactor(),s.getDiffuseTexture()){let o=s.getDiffuseTexture(),c=s.getDiffuseTextureInfo();i.diffuseTexture=e.createTextureInfoDef(o,c)}if(s.getSpecularGlossinessTexture()){let o=s.getSpecularGlossinessTexture(),c=s.getSpecularGlossinessTextureInfo();i.specularGlossinessTexture=e.createTextureInfoDef(o,c)}}}),this}},{R:c0,G:l0,B:d0,A:u0}=at,f0=class extends X{static EXTENSION_NAME=Vt;init(){this.extensionName=Vt,this.propertyType="Sheen",this.parentTypes=[O.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{sheenColorFactor:[0,0,0],sheenColorTexture:null,sheenColorTextureInfo:new oe(this.graph,"sheenColorTextureInfo"),sheenRoughnessFactor:0,sheenRoughnessTexture:null,sheenRoughnessTextureInfo:new oe(this.graph,"sheenRoughnessTextureInfo")})}getSheenColorFactor(){return this.get("sheenColorFactor")}setSheenColorFactor(e){return this.set("sheenColorFactor",e)}getSheenColorTexture(){return this.getRef("sheenColorTexture")}getSheenColorTextureInfo(){return this.getRef("sheenColorTexture")?this.getRef("sheenColorTextureInfo"):null}setSheenColorTexture(e){return this.setRef("sheenColorTexture",e,{channels:c0|l0|d0,isColor:!0})}getSheenRoughnessFactor(){return this.get("sheenRoughnessFactor")}setSheenRoughnessFactor(e){return this.set("sheenRoughnessFactor",e)}getSheenRoughnessTexture(){return this.getRef("sheenRoughnessTexture")}getSheenRoughnessTextureInfo(){return this.getRef("sheenRoughnessTexture")?this.getRef("sheenRoughnessTextureInfo"):null}setSheenRoughnessTexture(e){return this.setRef("sheenRoughnessTexture",e,{channels:u0})}},h0=class extends ae{static EXTENSION_NAME=Vt;extensionName=Vt;prereadTypes=[O.MESH];prewriteTypes=[O.MESH];createSheen(){return new f0(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((r,n)=>{if(r.extensions&&r.extensions.KHR_materials_sheen){let i=this.createSheen();e.materials[n].setExtension(Vt,i);let o=r.extensions[Vt];if(o.extras&&i.setExtras(o.extras),o.sheenColorFactor!==void 0&&i.setSheenColorFactor(o.sheenColorFactor),o.sheenRoughnessFactor!==void 0&&i.setSheenRoughnessFactor(o.sheenRoughnessFactor),o.sheenColorTexture!==void 0){let c=o.sheenColorTexture,l=e.textures[s[c.index].source];i.setSheenColorTexture(l),e.setTextureInfo(i.getSheenColorTextureInfo(),c)}if(o.sheenRoughnessTexture!==void 0){let c=o.sheenRoughnessTexture,l=e.textures[s[c.index].source];i.setSheenRoughnessTexture(l),e.setTextureInfo(i.getSheenRoughnessTextureInfo(),c)}}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(Vt);if(s){let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);if(n.extensions=n.extensions||{},n.extensions[Vt]=i,i.sheenColorFactor=s.getSheenColorFactor(),i.sheenRoughnessFactor=s.getSheenRoughnessFactor(),s.getSheenColorTexture()){let o=s.getSheenColorTexture(),c=s.getSheenColorTextureInfo();i.sheenColorTexture=e.createTextureInfoDef(o,c)}if(s.getSheenRoughnessTexture()){let o=s.getSheenRoughnessTexture(),c=s.getSheenRoughnessTextureInfo();i.sheenRoughnessTexture=e.createTextureInfoDef(o,c)}}}),this}},{R:b0,G:p0,B:g0,A:m0}=at,y0=class extends X{static EXTENSION_NAME=Ht;init(){this.extensionName=Ht,this.propertyType="Specular",this.parentTypes=[O.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{specularFactor:1,specularTexture:null,specularTextureInfo:new oe(this.graph,"specularTextureInfo"),specularColorFactor:[1,1,1],specularColorTexture:null,specularColorTextureInfo:new oe(this.graph,"specularColorTextureInfo")})}getSpecularFactor(){return this.get("specularFactor")}setSpecularFactor(e){return this.set("specularFactor",e)}getSpecularColorFactor(){return this.get("specularColorFactor")}setSpecularColorFactor(e){return this.set("specularColorFactor",e)}getSpecularTexture(){return this.getRef("specularTexture")}getSpecularTextureInfo(){return this.getRef("specularTexture")?this.getRef("specularTextureInfo"):null}setSpecularTexture(e){return this.setRef("specularTexture",e,{channels:m0})}getSpecularColorTexture(){return this.getRef("specularColorTexture")}getSpecularColorTextureInfo(){return this.getRef("specularColorTexture")?this.getRef("specularColorTextureInfo"):null}setSpecularColorTexture(e){return this.setRef("specularColorTexture",e,{channels:b0|p0|g0,isColor:!0})}},x0=class extends ae{static EXTENSION_NAME=Ht;extensionName=Ht;prereadTypes=[O.MESH];prewriteTypes=[O.MESH];createSpecular(){return new y0(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((r,n)=>{if(r.extensions&&r.extensions.KHR_materials_specular){let i=this.createSpecular();e.materials[n].setExtension(Ht,i);let o=r.extensions[Ht];if(o.extras&&i.setExtras(o.extras),o.specularFactor!==void 0&&i.setSpecularFactor(o.specularFactor),o.specularColorFactor!==void 0&&i.setSpecularColorFactor(o.specularColorFactor),o.specularTexture!==void 0){let c=o.specularTexture,l=e.textures[s[c.index].source];i.setSpecularTexture(l),e.setTextureInfo(i.getSpecularTextureInfo(),c)}if(o.specularColorTexture!==void 0){let c=o.specularColorTexture,l=e.textures[s[c.index].source];i.setSpecularColorTexture(l),e.setTextureInfo(i.getSpecularColorTextureInfo(),c)}}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(Ht);if(s){let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);if(n.extensions=n.extensions||{},n.extensions[Ht]=i,s.getSpecularFactor()!==1&&(i.specularFactor=s.getSpecularFactor()),le.eq(s.getSpecularColorFactor(),[1,1,1])||(i.specularColorFactor=s.getSpecularColorFactor()),s.getSpecularTexture()){let o=s.getSpecularTexture(),c=s.getSpecularTextureInfo();i.specularTexture=e.createTextureInfoDef(o,c)}if(s.getSpecularColorTexture()){let o=s.getSpecularColorTexture(),c=s.getSpecularColorTextureInfo();i.specularColorTexture=e.createTextureInfoDef(o,c)}}}),this}},{R:w0}=at,v0=class extends X{static EXTENSION_NAME=qt;init(){this.extensionName=qt,this.propertyType="Transmission",this.parentTypes=[O.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{transmissionFactor:0,transmissionTexture:null,transmissionTextureInfo:new oe(this.graph,"transmissionTextureInfo")})}getTransmissionFactor(){return this.get("transmissionFactor")}setTransmissionFactor(e){return this.set("transmissionFactor",e)}getTransmissionTexture(){return this.getRef("transmissionTexture")}getTransmissionTextureInfo(){return this.getRef("transmissionTexture")?this.getRef("transmissionTextureInfo"):null}setTransmissionTexture(e){return this.setRef("transmissionTexture",e,{channels:w0})}},M0=class extends ae{static EXTENSION_NAME=qt;extensionName=qt;prereadTypes=[O.MESH];prewriteTypes=[O.MESH];createTransmission(){return new v0(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((r,n)=>{if(r.extensions&&r.extensions.KHR_materials_transmission){let i=this.createTransmission();e.materials[n].setExtension(qt,i);let o=r.extensions[qt];if(o.extras&&i.setExtras(o.extras),o.transmissionFactor!==void 0&&i.setTransmissionFactor(o.transmissionFactor),o.transmissionTexture!==void 0){let c=o.transmissionTexture,l=e.textures[s[c.index].source];i.setTransmissionTexture(l),e.setTextureInfo(i.getTransmissionTextureInfo(),c)}}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(qt);if(s){let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);if(n.extensions=n.extensions||{},n.extensions[qt]=i,i.transmissionFactor=s.getTransmissionFactor(),s.getTransmissionTexture()){let o=s.getTransmissionTexture(),c=s.getTransmissionTextureInfo();i.transmissionTexture=e.createTextureInfoDef(o,c)}}}),this}},k0=class extends X{static EXTENSION_NAME=Ma;init(){this.extensionName=Ma,this.propertyType="Unlit",this.parentTypes=[O.MATERIAL]}},E0=class extends ae{static EXTENSION_NAME=Ma;extensionName=Ma;prereadTypes=[O.MESH];prewriteTypes=[O.MESH];createUnlit(){return new k0(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){return(e.jsonDoc.json.materials||[]).forEach((t,a)=>{t.extensions&&t.extensions.KHR_materials_unlit&&e.materials[a].setExtension(Ma,this.createUnlit())}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{if(a.getExtension("KHR_materials_unlit")){let s=e.materialIndexMap.get(a),r=t.json.materials[s];r.extensions=r.extensions||{},r.extensions[Ma]={}}}),this}},S0=class extends X{static EXTENSION_NAME=Ue;init(){this.extensionName=Ue,this.propertyType="Mapping",this.parentTypes=["MappingList"]}getDefaults(){return Object.assign(super.getDefaults(),{material:null,variants:new ne})}getMaterial(){return this.getRef("material")}setMaterial(e){return this.setRef("material",e)}addVariant(e){return this.addRef("variants",e)}removeVariant(e){return this.removeRef("variants",e)}listVariants(){return this.listRefs("variants")}},T0=class extends X{static EXTENSION_NAME=Ue;init(){this.extensionName=Ue,this.propertyType="MappingList",this.parentTypes=[O.PRIMITIVE]}getDefaults(){return Object.assign(super.getDefaults(),{mappings:new ne})}addMapping(e){return this.addRef("mappings",e)}removeMapping(e){return this.removeRef("mappings",e)}listMappings(){return this.listRefs("mappings")}},Pl=class extends X{static EXTENSION_NAME=Ue;init(){this.extensionName=Ue,this.propertyType="Variant",this.parentTypes=["MappingList"]}},A0=class extends ae{extensionName=Ue;static EXTENSION_NAME=Ue;createMappingList(){return new T0(this.document.getGraph())}createVariant(e=""){return new Pl(this.document.getGraph(),e)}createMapping(){return new S0(this.document.getGraph())}listVariants(){return Array.from(this.properties).filter(e=>e instanceof Pl)}read(e){let t=e.jsonDoc;if(!t.json.extensions||!t.json.extensions.KHR_materials_variants)return this;let a=(t.json.extensions.KHR_materials_variants.variants||[]).map(s=>this.createVariant().setName(s.name||""));return(t.json.meshes||[]).forEach((s,r)=>{let n=e.meshes[r];(s.primitives||[]).forEach((i,o)=>{if(!i.extensions||!i.extensions.KHR_materials_variants)return;let c=this.createMappingList(),l=i.extensions[Ue];for(let f of l.mappings){let u=this.createMapping();f.material!==void 0&&u.setMaterial(e.materials[f.material]);for(let p of f.variants||[])u.addVariant(a[p]);c.addMapping(u)}n.listPrimitives()[o].setExtension(Ue,c)})}),this}write(e){let t=e.jsonDoc,a=this.listVariants();if(!a.length)return this;let s=[],r=new Map;for(let n of a)r.set(n,s.length),s.push(e.createPropertyDef(n));for(let n of this.document.getRoot().listMeshes()){let i=e.meshIndexMap.get(n);n.listPrimitives().forEach((o,c)=>{let l=o.getExtension(Ue);if(!l)return;let f=e.jsonDoc.json.meshes[i].primitives[c],u=l.listMappings().map(p=>{let b=e.createPropertyDef(p),h=p.getMaterial();return h&&(b.material=e.materialIndexMap.get(h)),b.variants=p.listVariants().map(d=>r.get(d)),b});f.extensions=f.extensions||{},f.extensions[Ue]={mappings:u}})}return t.json.extensions=t.json.extensions||{},t.json.extensions[Ue]={variants:s},this}},{G:I0}=at,_0=class extends X{static EXTENSION_NAME=Wt;init(){this.extensionName=Wt,this.propertyType="Volume",this.parentTypes=[O.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{thicknessFactor:0,thicknessTexture:null,thicknessTextureInfo:new oe(this.graph,"thicknessTexture"),attenuationDistance:1/0,attenuationColor:[1,1,1]})}getThicknessFactor(){return this.get("thicknessFactor")}setThicknessFactor(e){return this.set("thicknessFactor",e)}getThicknessTexture(){return this.getRef("thicknessTexture")}getThicknessTextureInfo(){return this.getRef("thicknessTexture")?this.getRef("thicknessTextureInfo"):null}setThicknessTexture(e){return this.setRef("thicknessTexture",e,{channels:I0})}getAttenuationDistance(){return this.get("attenuationDistance")}setAttenuationDistance(e){return this.set("attenuationDistance",e)}getAttenuationColor(){return this.get("attenuationColor")}setAttenuationColor(e){return this.set("attenuationColor",e)}},R0=class extends ae{static EXTENSION_NAME=Wt;extensionName=Wt;prereadTypes=[O.MESH];prewriteTypes=[O.MESH];createVolume(){return new _0(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((r,n)=>{if(r.extensions&&r.extensions.KHR_materials_volume){let i=this.createVolume();e.materials[n].setExtension(Wt,i);let o=r.extensions[Wt];if(o.extras&&i.setExtras(o.extras),o.thicknessFactor!==void 0&&i.setThicknessFactor(o.thicknessFactor),o.attenuationDistance!==void 0&&i.setAttenuationDistance(o.attenuationDistance),o.attenuationColor!==void 0&&i.setAttenuationColor(o.attenuationColor),o.thicknessTexture!==void 0){let c=o.thicknessTexture,l=e.textures[s[c.index].source];i.setThicknessTexture(l),e.setTextureInfo(i.getThicknessTextureInfo(),c)}}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(Wt);if(s){let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);if(n.extensions=n.extensions||{},n.extensions[Wt]=i,s.getThicknessFactor()>0&&(i.thicknessFactor=s.getThicknessFactor()),Number.isFinite(s.getAttenuationDistance())&&(i.attenuationDistance=s.getAttenuationDistance()),le.eq(s.getAttenuationColor(),[1,1,1])||(i.attenuationColor=s.getAttenuationColor()),s.getThicknessTexture()){let o=s.getThicknessTexture(),c=s.getThicknessTextureInfo();i.thicknessTexture=e.createTextureInfoDef(o,c)}}}),this}},N0=class extends ae{extensionName=xl;static EXTENSION_NAME=xl;read(e){return this}write(e){return this}},xi=class extends ae{extensionName=wl;static EXTENSION_NAME=wl;read(e){return this}write(e){return this}},C0=class extends X{static EXTENSION_NAME=Xt;init(){this.extensionName=Xt,this.propertyType="Visibility",this.parentTypes=[O.NODE]}getDefaults(){return Object.assign(super.getDefaults(),{visible:!0})}getVisible(){return this.get("visible")}setVisible(e){return this.set("visible",e)}},B0=class extends ae{static EXTENSION_NAME=Xt;extensionName=Xt;createVisibility(){return new C0(this.document.getGraph())}read(e){return(e.jsonDoc.json.nodes||[]).forEach((t,a)=>{if(t.extensions&&t.extensions.KHR_node_visibility){let s=this.createVisibility();e.nodes[a].setExtension(Xt,s);let r=t.extensions[Xt];r.visible!==void 0&&s.setVisible(r.visible)}}),this}write(e){let t=e.jsonDoc;for(let a of this.document.getRoot().listNodes()){let s=a.getExtension(Xt);if(!s)continue;let r=e.nodeIndexMap.get(a),n=t.json.nodes[r];n.extensions=n.extensions||{},n.extensions[Xt]={visible:s.getVisible()}}return this}};function F0(e){return e.vkFormat>0&&e.vkFormat<=123}function jl(e){let t=e.vkFormat===1000066e3&&e.dataFormatDescriptor[0].colorModel===167;return e.vkFormat===0||t}var O0=class{match(e){return e[0]===171&&e[1]===75&&e[2]===84&&e[3]===88&&e[4]===32&&e[5]===50&&e[6]===48&&e[7]===187&&e[8]===13&&e[9]===10&&e[10]===26&&e[11]===10}getSize(e){let t=fr(e);return[t.pixelWidth,t.pixelHeight]}getChannels(e){let t=fr(e),a=t.dataFormatDescriptor[0];if(F0(t))return a.samples.length;if(jl(t))switch(a.colorModel){case 163:return a.samples.length===2&&(a.samples[1].channelType&15)===15?4:3;case 166:return(a.samples[0].channelType&15)===3?4:3;default:throw new Error(`Unexpected KTX2 colorModel, "${a.colorModel}".`)}throw new Error(`Unexpected KTX2 vkFormat, "${t.vkFormat}".`)}getVRAMByteLength(e){let t=fr(e),a=0;if(jl(t)){let s=this.getChannels(e)>3;for(let r=0;r<t.levels.length;r++){let n=t.levels[r];if(n.uncompressedByteLength)a+=n.uncompressedByteLength;else{let i=Math.max(1,Math.floor(t.pixelWidth/Math.pow(2,r))),o=Math.max(1,Math.floor(t.pixelHeight/Math.pow(2,r))),c=s?16:8;a+=i/4*(o/4)*c}}}else for(let s of t.levels)t.supercompressionScheme===0?a+=s.levelData.byteLength:a+=s.uncompressedByteLength;return a}},P0=class extends ae{static EXTENSION_NAME=pr;extensionName=pr;prereadTypes=[O.TEXTURE];static register(){lt.registerFormat("image/ktx2",new O0)}preread(e){return e.jsonDoc.json.textures&&e.jsonDoc.json.textures.forEach(t=>{t.extensions&&t.extensions.KHR_texture_basisu&&(t.source=t.extensions[pr].source)}),this}read(e){return this}write(e){let t=e.jsonDoc;return this.document.getRoot().listTextures().forEach(a=>{if(a.getMimeType()==="image/ktx2"){let s=e.imageIndexMap.get(a);t.json.textures.forEach(r=>{r.source===s&&(r.extensions=r.extensions||{},r.extensions[pr]={source:r.source},delete r.source)})}}),this}},j0=class extends X{static EXTENSION_NAME=$t;init(){this.extensionName=$t,this.propertyType="Transform",this.parentTypes=[O.TEXTURE_INFO]}getDefaults(){return Object.assign(super.getDefaults(),{offset:[0,0],rotation:0,scale:[1,1],texCoord:null})}getOffset(){return this.get("offset")}setOffset(e){return this.set("offset",e)}getRotation(){return this.get("rotation")}setRotation(e){return this.set("rotation",e)}getScale(){return this.get("scale")}setScale(e){return this.set("scale",e)}getTexCoord(){return this.get("texCoord")}setTexCoord(e){return this.set("texCoord",e)}},L0=class extends ae{extensionName=$t;static EXTENSION_NAME=$t;createTransform(){return new j0(this.document.getGraph())}read(e){for(let[t,a]of Array.from(e.textureInfos.entries())){if(!a.extensions||!a.extensions.KHR_texture_transform)continue;let s=this.createTransform(),r=a.extensions[$t];r.offset!==void 0&&s.setOffset(r.offset),r.rotation!==void 0&&s.setRotation(r.rotation),r.scale!==void 0&&s.setScale(r.scale),r.texCoord!==void 0&&s.setTexCoord(r.texCoord),t.setExtension($t,s)}return this}write(e){let t=Array.from(e.textureInfoDefMap.entries());for(let[a,s]of t){let r=a.getExtension($t);if(!r)continue;s.extensions=s.extensions||{};let n={},i=le.eq;i(r.getOffset(),[0,0])||(n.offset=r.getOffset()),r.getRotation()!==0&&(n.rotation=r.getRotation()),i(r.getScale(),[1,1])||(n.scale=r.getScale()),r.getTexCoord()!=null&&(n.texCoord=r.getTexCoord()),s.extensions[$t]=n}return this}},D0=[O.ROOT,O.SCENE,O.NODE,O.MESH,O.MATERIAL,O.TEXTURE,O.ANIMATION],U0=class extends X{static EXTENSION_NAME=st;init(){this.extensionName=st,this.propertyType="Packet",this.parentTypes=D0}getDefaults(){return Object.assign(super.getDefaults(),{context:{},properties:{}})}getContext(){return this.get("context")}setContext(e){return this.set("context",{...e})}listProperties(){return Object.keys(this.get("properties"))}getProperty(e){let t=this.get("properties");return e in t?t[e]:null}setProperty(e,t){this._assertContext(e);let a={...this.get("properties")};return t?a[e]=t:delete a[e],this.set("properties",a)}toJSONLD(){return{"@context":hi(this.get("context")),...hi(this.get("properties"))}}fromJSONLD(e){e=hi(e);let t=e["@context"];return t&&this.set("context",t),delete e["@context"],this.set("properties",e)}_assertContext(e){if(!(e.split(":")[0]in this.get("context")))throw new Error(`${st}: Missing context for term, "${e}".`)}};function hi(e){return JSON.parse(JSON.stringify(e))}var z0=class extends ae{extensionName=st;static EXTENSION_NAME=st;createPacket(){return new U0(this.document.getGraph())}listPackets(){return Array.from(this.properties)}read(e){let t=e.jsonDoc.json.extensions?.[st];if(!t||!t.packets)return this;let a=e.jsonDoc.json,s=this.document.getRoot(),r=t.packets.map(o=>this.createPacket().fromJSONLD(o)),n=[[a.asset],a.scenes,a.nodes,a.meshes,a.materials,a.images,a.animations],i=[[s],s.listScenes(),s.listNodes(),s.listMeshes(),s.listMaterials(),s.listTextures(),s.listAnimations()];for(let o=0;o<n.length;o++){let c=n[o]||[];for(let l=0;l<c.length;l++){let f=c[l];if(f.extensions&&f.extensions.KHR_xmp_json_ld){let u=f.extensions[st];i[o][l].setExtension(st,r[u.packet])}}}return this}write(e){let{json:t}=e.jsonDoc,a=[];for(let s of this.properties){a.push(s.toJSONLD());for(let r of s.listParents()){let n;switch(r.propertyType){case O.ROOT:n=t.asset;break;case O.SCENE:n=t.scenes[e.sceneIndexMap.get(r)];break;case O.NODE:n=t.nodes[e.nodeIndexMap.get(r)];break;case O.MESH:n=t.meshes[e.meshIndexMap.get(r)];break;case O.MATERIAL:n=t.materials[e.materialIndexMap.get(r)];break;case O.TEXTURE:n=t.images[e.imageIndexMap.get(r)];break;case O.ANIMATION:n=t.animations[e.animationIndexMap.get(r)];break;default:n=null,this.document.getLogger().warn(`[${st}]: Unsupported parent property, "${r.propertyType}"`);break}n&&(n.extensions=n.extensions||{},n.extensions[st]={packet:a.length-1})}}return a.length>0&&(t.extensions=t.extensions||{},t.extensions[st]={packets:a}),this}},G0=[Mm,km,Bm,Om,Um,Km,$m,Jm,Zm,t0,n0,o0,x0,h0,M0,E0,A0,R0,N0,xi,B0,P0,L0,z0],Kk=[vg,mi,yi,qg,xm,vm,...G0];var cS=(function(){var e="b9H79Tebbbe9ok9Geueu9Geub9Gbb9Gruuuuuuueu9Gvuuuuueu9Gduueu9Gluuuueu9Gvuuuuub9Gouuuuuub9Gluuuub9Giuuueui8AYdilveoveovrrwrrDDoDrbqqbelve9Weiiviebeoweuec;G:Qdkr:nlAo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bb8F9TW79O9V9Wt9FW9U9J9V9KW9wWVtW949c919M9MWV9mW4W2be8A9TW79O9V9Wt9FW9U9J9V9KW9wWVtW949c919M9MWVbd8F9TW79O9V9Wt9FW9U9J9V9KW9wWVtW949c919M9MWV9c9V919U9KbiE9TW79O9V9Wt9FW9U9J9V9KW9wWVtW949wWV79P9V9UblY9TW79O9V9Wt9FW9U9J9V9KW69U9KW949c919M9MWVbv8E9TW79O9V9Wt9FW9U9J9V9KW69U9KW949c919M9MWV9c9V919U9Kbo8A9TW79O9V9Wt9FW9U9J9V9KW69U9KW949wWV79P9V9UbrE9TW79O9V9Wt9FW9U9J9V9KW69U9KW949tWG91W9U9JWbwa9TW79O9V9Wt9FW9U9J9V9KW69U9KW949tWG91W9U9JW9c9V919U9KbDL9TW79O9V9Wt9FW9U9J9V9KWS9P2tWV9p9JtbqK9TW79O9V9Wt9FW9U9J9V9KWS9P2tWV9r919HtbkL9TW79O9V9Wt9FW9U9J9V9KWS9P2tWVT949WbxE9TW79O9V9Wt9F9V9Wt9P9T9P96W9wWVtW94J9H9J9OWbsa9TW79O9V9Wt9F9V9Wt9P9T9P96W9wWVtW94J9H9J9OW9ttV9P9Wbza9TW79O9V9Wt9F9V9Wt9P9T9P96W9wWVtW94SWt9J9O9sW9T9H9WbHK9TW79O9V9Wt9F79W9Ht9P9H29t9VVt9sW9T9H9WbOl79IV9RbCDwebcekdKLqN9OYdbk:Bhdhud9:8Jjjjjbc;qw9Rgr8KjjjjbcbhwdnaeTmbabcbyd;C:kjjbaoaocb9iEgDc:GeV86bbarc;adfcbcjdz:wjjjb8AdnaiTmbarc;adfadalz:vjjjb8Akarc;abfalfcbcbcjdal9RalcFe0Ez:wjjjb8Aarc;abfarc;adfalz:vjjjb8AarcUf9cb83ibarc8Wf9cb83ibarcyf9cb83ibarcaf9cb83ibarcKf9cb83ibarczf9cb83ibar9cb83iwar9cb83ibcj;abal9Uc;WFbGcjdalca0Ehqdnaicd6mbavcd9imbaDTmbadcefhkaqci2gxal2hmarc;alfclfhParc;qlfceVhsarc;qofclVhzarc;qofcKfhHarc;qofczfhOcbhAincdhCcbhodnavci6mbaH9cb83ibaO9cb83ibar9cb83i;yoar9cb83i;qoadaAfgoybbhXcbhQincbhwcbhLdninaoalfhKaoybbgYaX7aLVhLawcP0meaKhoaYhXawcefgwaQfai6mbkkcbhXarc;qofhwincwh8AcwhEdnaLaX93gocFeGg3cs0mbclhEa3ci0mba3cb9hcethEkdnaocw4cFeGg3cs0mbclh8Aa3ci0mba3cb9hceth8Aka8AaEfh3awydbh5cwh8AcwhEdnaocz4cFeGg8Ecs0mbclhEa8Eci0mba8Ecb9hcethEka3a5fh3dnaocFFFFb0mbclh8AaocFFF8F0mbaocFFFr0ceth8Akawa3aEfa8AfBdbawclfhwaXcefgXcw9hmbkaKhoaYhXaQczfgQai6mbkcbhocehwazhLinawaoaLydbarc;qofaocdtfydb6EhoaLclfhLawcefgwcw9hmbkcihCkcbh3arc;qlfcbcjdz:wjjjb8Aarc;alfcwfcbBdbar9cb83i;alaoclth8Fadhaaqhhakh5inarc;qlfadcba3cufgoaoa30Eal2falz:vjjjb8Aaiahaiah6Ehgdnaqaia39Ra3aqfai6EgYcsfc9WGgoaY9nmbarc;qofaYfcbaoaY9Rz:wjjjb8Akada3al2fh8Jcbh8Kina8Ka8FVcl4hQarc;alfa8Kcdtfh8LaAh8Mcbh8Nina8NaAfhwdndndndndndna8KPldebidkasa8Mc98GgLfhoa5aLfh8Aarc;qlfawc98GgLfRbbhXcwhwinaoRbbawtaXVhXaocefhoawcwfgwca9hmbkaYTmla8Ncith8Ea8JaLfhEcbhKinaERbbhLcwhoa8AhwinawRbbaotaLVhLawcefhwaocwfgoca9hmbkarc;qofaKfaLaX7aQ93a8E486bba8Aalfh8AaEalfhEaLhXaKcefgKaY9hmbxlkkaYTmia8Mc9:Ghoa8NcitcwGhEarc;qlfawceVfRbbcwtarc;qlfawc9:GfRbbVhLarc;qofhwaghXinawa5aofRbbcwtaaaofRbbVg8AaL9RgLcetaLcztcz91cs47cFFiGaE486bbaoalfhoawcefhwa8AhLa3aXcufgX9hmbxikkaYTmda8Jawfhoarc;qlfawfRbbhLarc;qofhwaghXinawaoRbbg8AaL9RgLcetaLcKtcK91cr4786bbawcefhwaoalfhoa8AhLa3aXcufgX9hmbxdkkaYTmeka8LydbhEcbhKarc;qofhoincdhLcbhwinaLaoawfRbbcb9hfhLawcefgwcz9hmbkclhXcbhwinaXaoawfRbbcd0fhXawcefgwcz9hmbkcwh8Acbhwina8AaoawfRbbcP0fh8Aawcefgwcz9hmbkaLaXaLaX6Egwa8Aawa8A6Egwczawcz6EaEfhEaoczfhoaKczfgKaY6mbka8LaEBdbka8Mcefh8Ma8Ncefg8Ncl9hmbka8Kcefg8KaC9hmbkaaamfhaahaxfhha5amfh5a3axfg3ai6mbkcbhocehwaPhLinawaoaLydbarc;alfaocdtfydb6EhoaLclfhLawcefgXhwaCaX9hmbkaraAcd4fa8FcdVaoaocdSE86bbaAclfgAal6mbkkabaefh8Kabcefhoalcd4gecbaDEhkadcefhOarc;abfceVhHcbhmdndninaiam9nmearc;qofcbcjdz:wjjjb8Aa8Kao9Rak6mdadamal2gwfhxcbh8JaOawfhzaocbakz:wjjjbghakfh5aqaiam9Ramaqfai6Egscsfgocl4cifcd4hCaoc9WGg8LThPindndndndndndndndndndnaDTmbara8Jcd4fRbbgLciGPlbedlbkasTmdaxa8Jfhoarc;abfa8JfRbbhLarc;qofhwashXinawaoRbbg8AaL9RgLcetaLcKtcK91cr4786bbawcefhwaoalfhoa8AhLaXcufgXmbxikkasTmia8JcitcwGhEarc;abfa8JceVfRbbcwtarc;abfa8Jc9:GgofRbbVhLaxaofhoarc;qofhwashXinawao8Vbbg8AaL9RgLcetaLcztcz91cs47cFFiGaE486bbawcefhwaoalfhoa8AhLaXcufgXmbxdkkaHa8Jc98GgEfhoazaEfh8Aarc;abfaEfRbbhXcwhwinaoRbbawtaXVhXaocefhoawcwfgwca9hmbkasTmbaLcl4hYa8JcitcKGh3axaEfhEcbhKinaERbbhLcwhoa8AhwinawRbbaotaLVhLawcefhwaocwfgoca9hmbkarc;qofaKfaLaX7aY93a3486bba8Aalfh8AaEalfhEaLhXaKcefgKas9hmbkkaDmbcbhoxlka8LTmbcbhodninarc;qofaofgwcwf8Pibaw8Pib:e9qTmeaoczfgoa8L9pmdxbkkdnavmbcehoxikcbhEaChKaChYinarc;qofaEfgocwf8Pibhyao8Pibh8PcdhLcbhwinaLaoawfRbbcb9hfhLawcefgwcz9hmbkclhXcbhwinaXaoawfRbbcd0fhXawcefgwcz9hmbkcwh8Acbhwina8AaoawfRbbcP0fh8Aawcefgwcz9hmbkaLaXaLaX6Egoa8Aaoa8A6Egoczaocz6EaYfhYaocucbaya8P:e9cb9sEgwaoaw6EaKfhKaEczfgEa8L9pmdxbkkaha8Jcd4fgoaoRbbcda8JcetcoGtV86bbxikdnaKas6mbaYas6mbaha8Jcd4fgoaoRbbcia8JcetcoGtV86bba8Ka59Ras6mra5arc;qofasz:vjjjbasfh5xikaKaY9phokaha8Jcd4fgwawRbbaoa8JcetcoGtV86bbka8Ka59RaC6mla5cbaCz:wjjjbgAaCfhYdndna8LmbaPhoxekdna8KaY9RcK9pmbaPhoxekaocdtc:q1jjbfcj1jjbaDEg5ydxggcetc;:FFFeGh8Fcuh3cuagtcu7cFeGhacbh8Marc;qofhLinarc;qofa8MfhQczhEdndndnagPDbeeeeeeedekcucbaQcwf8PibaQ8Pib:e9cb9sEhExekcbhoa8FhEinaEaaaLaofRbb9nfhEaocefgocz9hmbkkcih8Ecbh8Ainczhwdndndna5a8AcdtfydbgKPDbeeeeeeedekcucbaQcwf8PibaQ8Pib:e9cb9sEhwxekaKcetc;:FFFeGhwcuaKtcu7cFeGhXcbhoinawaXaLaofRbb9nfhwaocefgocz9hmbkkdndnawaE6mbaKa39hmeawaE9hmea5a8EcdtfydbcwSmeka8Ah8EawhEka8Acefg8Aci9hmbkaAa8Mco4fgoaoRbba8Ea8Mci4coGtV86bbdndndna5a8Ecdtfydbg3PDdbbbbbbbebkdncwa39Tg8ETmbcua3tcu7hwdndna3ceSmbcbh8NaLhQinaQhoa8Eh8AcbhXinaoRbbgEawcFeGgKaEaK6EaXa3tVhXaocefhoa8Acufg8AmbkaYaX86bbaQa8EfhQaYcefhYa8Na8Efg8Ncz6mbxdkkcbh8NaLhQinaQhoa8Eh8AcbhXinaoRbbgEawcFeGgKaEaK6EaXcetVhXaocefhoa8Acufg8AmbkaYaX:T9cFe:d9c:c:qj:bw9:9c:q;c1:I1e:d9c:b:c:e1z9:9ca188bbaQa8EfhQaYcefhYa8Na8Efg8Ncz6mbkkcbhoinaYaLaofRbbgX86bbaYaXawcFeG9pfhYaocefgocz9hmbxikkdna3ceSmbinaYcb86bbaYcefhYxbkkinaYcb86bbaYcefhYxbkkaYaQ8Pbb83bbaYcwfaQcwf8Pbb83bbaYczfhYka8Mczfg8Ma8L9pgomeaLczfhLa8KaY9RcK9pmbkkaoTmlaYh5aYTmlka8Jcefg8Jal9hmbkarc;abfaxascufal2falz:vjjjb8Aasamfhma5hoa5mbkcbhwxdkdna8Kao9RakalfgwcKcaaDEgLawaL0EgX9pmbcbhwxdkdnawaL9pmbaocbaXaw9Rgwz:wjjjbawfhokaoarc;adfalz:vjjjbalfhodnaDTmbaoaraez:vjjjbaefhokaoab9Rhwxekcbhwkarc;qwf8Kjjjjbawk5babaeadaialcdcbyd;C:kjjbz:bjjjbk9reduaecd4gdaefgicaaica0Eabcj;abae9Uc;WFbGcjdaeca0Egifcufai9Uae2aiadfaicl4cifcd4f2fcefkmbcbabBd;C:kjjbk:Ese5u8Jjjjjbc;ae9Rgl8Kjjjjbcbhvdnaici9UgocHfae0mbabcbyd;m:kjjbgrc;GeV86bbalc;abfcFecjez:wjjjb8AalcUfgw9cu83ibalc8WfgD9cu83ibalcyfgq9cu83ibalcafgk9cu83ibalcKfgx9cu83ibalczfgm9cu83ibal9cu83iwal9cu83ibabaefc9WfhPabcefgsaofhednaiTmbcmcsarcb9kgzEhHcbhOcbhAcbhCcbhXcbhQindnaeaP9nmbcbhvxikaQcufhvadaCcdtfgLydbhKaLcwfydbhYaLclfydbh8AcbhEdndndninalc;abfavcsGcitfgoydlh3dndndnaoydbgoaK9hmba3a8ASmekdnaoa8A9hmba3aY9hmbaEcefhExekaoaY9hmea3aK9hmeaEcdfhEkaEc870mdaXcufhvaLaEciGcx2goc;i1jjbfydbcdtfydbh3aLaoc;e1jjbfydbcdtfydbh8AaLaoc;a1jjbfydbcdtfydbhKcbhodnindnalavcsGcdtfydba39hmbaohYxdkcuhYavcufhvaocefgocz9hmbkkaOa3aOSgvaYce9iaYaH9oVgoGfhOdndndncbcsavEaYaoEgvcs9hmbarce9imba3a3aAa3cefaASgvEgAcefSmecmcsavEhvkasavaEcdtc;WeGV86bbavcs9hmea3aA9Rgvcetavc8F917hvinaeavcFb0crtavcFbGV86bbaecefheavcje6hoavcr4hvaoTmbka3hAxvkcPhvasaEcdtcPV86bba3hAkavTmiavaH9omicdhocehEaQhYxlkavcufhvaEclfgEc;ab9hmbkkdnaLceaYaOSceta8AaOSEcx2gvc;a1jjbfydbcdtfydbgKTaLavc;e1jjbfydbcdtfydbg8AceSGaLavc;i1jjbfydbcdtfydbg3cdSGaOcb9hGazGg5ce9hmbaw9cu83ibaD9cu83ibaq9cu83ibak9cu83ibax9cu83ibam9cu83ibal9cu83iwal9cu83ibcbhOkcbhEaXcufgvhodnindnalaocsGcdtfydba8A9hmbaEhYxdkcuhYaocufhoaEcefgEcz9hmbkkcbhodnindnalavcsGcdtfydba39hmbaohExdkcuhEavcufhvaocefgocz9hmbkkaOaKaOSg8EfhLdndnaYcm0mbaYcefhYxekcbcsa8AaLSgvEhYaLavfhLkdndnaEcm0mbaEcefhExekcbcsa3aLSgvEhEaLavfhLkc9:cua8EEh8FcbhvaEaYcltVgacFeGhodndndninavc:W1jjbfRbbaoSmeavcefgvcz9hmbxdkka5aKaO9havcm0VVmbasavc;WeV86bbxekasa8F86bbaeaa86bbaecefhekdna8EmbaKaA9Rgvcetavc8F917hvinaeavcFb0gocrtavcFbGV86bbavcr4hvaecefheaombkaKhAkdnaYcs9hmba8AaA9Rgvcetavc8F917hvinaeavcFb0gocrtavcFbGV86bbavcr4hvaecefheaombka8AhAkdnaEcs9hmba3aA9Rgvcetavc8F917hvinaeavcFb0gocrtavcFbGV86bbavcr4hvaecefheaombka3hAkalaXcdtfaKBdbaXcefcsGhvdndnaYPzbeeeeeeeeeeeeeebekalavcdtfa8ABdbaXcdfcsGhvkdndnaEPzbeeeeeeeeeeeeeebekalavcdtfa3BdbavcefcsGhvkcihoalc;abfaQcitfgEaKBdlaEa8ABdbaQcefcsGhYcdhEavhXaLhOxekcdhoalaXcdtfa3BdbcehEaXcefcsGhXaQhYkalc;abfaYcitfgva8ABdlava3Bdbalc;abfaQaEfcsGcitfgva3BdlavaKBdbascefhsaQaofcsGhQaCcifgCai6mbkkdnaeaP9nmbcbhvxekcbhvinaeavfavc:W1jjbfRbb86bbavcefgvcz9hmbkaeab9Ravfhvkalc;aef8KjjjjbavkZeeucbhddninadcefgdc8F0meceadtae6mbkkadcrfcFeGcr9Uci2cdfabci9U2cHfkmbcbabBd;m:kjjbk:Adewu8Jjjjjbcz9Rhlcbhvdnaicvfae0mbcbhvabcbRb;m:kjjbc;qeV86bbal9cb83iwabcefhoabaefc98fhrdnaiTmbcbhwcbhDindnaoar6mbcbskadaDcdtfydbgqalcwfawaqav9Rgvavc8F91gv7av9Rc507gwcdtfgkydb9Rgvc8E91c9:Gavcdt7awVhvinaoavcFb0gecrtavcFbGV86bbavcr4hvaocefhoaembkakaqBdbaqhvaDcefgDai9hmbkkdnaoar9nmbcbskaocbBbbaoab9RclfhvkavkBeeucbhddninadcefgdc8F0meceadtae6mbkkadcwfcFeGcr9Uab2cvfk:bvli99dui99ludnaeTmbcuadcetcuftcu7:Zhvdndncuaicuftcu7:ZgoJbbbZMgr:lJbbb9p9DTmbar:Ohwxekcjjjj94hwkcbhicbhDinalclfIdbgrJbbbbJbbjZalIdbgq:lar:lMalcwfIdbgk:lMgr:varJbbbb9BEgrNhxaqarNhrdndnakJbbbb9GTmbaxhqxekJbbjZar:l:tgqaq:maxJbbbb9GEhqJbbjZax:l:tgxax:marJbbbb9GEhrkdndnalcxfIdbgxJbbj:;axJbbj:;9GEgkJbbjZakJbbjZ9FEavNJbbbZJbbb:;axJbbbb9GEMgx:lJbbb9p9DTmbax:Ohmxekcjjjj94hmkdndnaqJbbj:;aqJbbj:;9GEgxJbbjZaxJbbjZ9FEaoNJbbbZJbbb:;aqJbbbb9GEMgq:lJbbb9p9DTmbaq:OhPxekcjjjj94hPkdndnarJbbj:;arJbbj:;9GEgqJbbjZaqJbbjZ9FEaoNJbbbZJbbb:;arJbbbb9GEMgr:lJbbb9p9DTmbar:Ohsxekcjjjj94hskdndnadcl9hmbabaifgzas86bbazcifam86bbazcdfaw86bbazcefaP86bbxekabaDfgzas87ebazcofam87ebazclfaw87ebazcdfaP87ebkalczfhlaiclfhiaDcwfhDaecufgembkkk;hlld99eud99eudnaeTmbdndncuaicuftcu7:ZgvJbbbZMgo:lJbbb9p9DTmbao:Ohixekcjjjj94hikaic;8FiGhrinabcofcicdalclfIdb:lalIdb:l9EgialcwfIdb:lalaicdtfIdb:l9EEgialcxfIdb:lalaicdtfIdb:l9EEgiarV87ebdndnJbbj:;JbbjZalaicdtfIdbJbbbb9DEgoalaicd7cdtfIdbJ;Zl:1ZNNgwJbbj:;awJbbj:;9GEgDJbbjZaDJbbjZ9FEavNJbbbZJbbb:;awJbbbb9GEMgw:lJbbb9p9DTmbaw:Ohqxekcjjjj94hqkabcdfaq87ebdndnalaicefciGcdtfIdbJ;Zl:1ZNaoNgwJbbj:;awJbbj:;9GEgDJbbjZaDJbbjZ9FEavNJbbbZJbbb:;awJbbbb9GEMgw:lJbbb9p9DTmbaw:Ohqxekcjjjj94hqkabaq87ebdndnaoalaicufciGcdtfIdbJ;Zl:1ZNNgoJbbj:;aoJbbj:;9GEgwJbbjZawJbbjZ9FEavNJbbbZJbbb:;aoJbbbb9GEMgo:lJbbb9p9DTmbao:Ohixekcjjjj94hikabclfai87ebabcwfhbalczfhlaecufgembkkk;3viDue99eu8Jjjjjbcjd9Rgo8Kjjjjbadcd4hrdndndndnavcd9hmbadcl6meaohwarhDinawc:CuBdbawclfhwaDcufgDmbkaeTmiadcl6mdarcdthqalhkcbhxinaohwakhDarhminawawydbgPcbaDIdbgs:8cL4cFeGc:cufasJbbbb9BEgzaPaz9kEBdbaDclfhDawclfhwamcufgmmbkakaqfhkaxcefgxaeSmixbkkaeTmdxekaeTmekarcdthkavce9hhqadcl6hdcbhxindndndnaqmbadmdc:CuhDalhwarhminaDcbawIdbgs:8cL4cFeGc:cufasJbbbb9BEgPaDaP9kEhDawclfhwamcufgmmbxdkkc:CuhDdndnavPleddbdkadmdaohwalhmarhPinawcbamIdbgs:8cL4cFeGgzc;:bazc;:b0Ec:cufasJbbbb9BEBdbamclfhmawclfhwaPcufgPmbxdkkadmecbhwarhminaoawfcbalawfIdbgs:8cL4cFeGgPc8AaPc8A0Ec:cufasJbbbb9BEBdbawclfhwamcufgmmbkkadmbcbhwarhPinaDhmdnavceSmbaoawfydbhmkdndnalawfIdbgscjjj;8iamai9RcefgmcLt9R::NJbbbZJbbb:;asJbbbb9GEMgs:lJbbb9p9DTmbas:Ohzxekcjjjj94hzkabawfazcFFFrGamcKtVBdbawclfhwaPcufgPmbkkabakfhbalakfhlaxcefgxae9hmbkkaocjdf8Kjjjjbk;YqdXui998Jjjjjbc:qd9Rgv8Kjjjjbavc:Sefcbc;Kbz:wjjjb8AcbhodnadTmbcbhoaiTmbdndnabaeSmbaehrxekavcuadcdtgwadcFFFFi0Ecbyd;u:kjjbHjjjjbbgrBd:SeavceBd:mdaraeawz:vjjjb8Akavc:GefcwfcbBdbav9cb83i:Geavc:Gefaradaiavc:Sefz:ojjjbavyd:GehDadci9Ugqcbyd;u:kjjbHjjjjbbheavc:Sefavyd:mdgkcdtfaeBdbavakcefgwBd:mdaecbaqz:wjjjbhxavc:SefawcdtfcuaicdtaicFFFFi0Ecbyd;u:kjjbHjjjjbbgmBdbavakcdfgPBd:mdalc;ebfhsaDheamhwinawalIdbasaeydbgzcwazcw6EcdtfIdbMUdbaeclfheawclfhwaicufgimbkavc:SefaPcdtfcuaqcdtadcFFFF970Ecbyd;u:kjjbHjjjjbbgPBdbdnadci6mbarheaPhwaqhiinawamaeydbcdtfIdbamaeclfydbcdtfIdbMamaecwfydbcdtfIdbMUdbaecxfheawclfhwaicufgimbkkakcifhoalc;ebfhHavc;qbfhOavheavyd:KehAavyd:OehCcbhzcbhwcbhXcehQinaehLcihkarawci2gKcdtfgeydbhsaeclfydbhdabaXcx2fgicwfaecwfydbgYBdbaiclfadBdbaiasBdbaxawfce86bbaOaYBdwaOadBdlaOasBdbaPawcdtfcbBdbdnazTmbcihkaLhiinaOakcdtfaiydbgeBdbakaeaY9haeas9haead9hGGfhkaiclfhiazcufgzmbkkaXcefhXcbhzinaCaAarazaKfcdtfydbcdtgifydbcdtfgYheaDaifgdydbgshidnasTmbdninaeydbawSmeaeclfheaicufgiTmdxbkkaeaYascdtfc98fydbBdbadadydbcufBdbkazcefgzci9hmbkdndnakTmbcuhwJbbbbh8Acbhdavyd:KehYavyd:OehKindndnaDaOadcdtfydbcdtgzfydbgembadcefhdxekadcs0hiamazfgsIdbhEasalcbadcefgdaiEcdtfIdbaHaecwaecw6EcdtfIdbMg3Udba3aE:th3aecdthiaKaYazfydbcdtfheinaPaeydbgzcdtfgsa3asIdbMgEUdbaEa8Aa8AaE9DgsEh8AazawasEhwaeclfheaic98fgimbkkadak9hmbkawcu9hmekaQaq9pmdindnaxaQfRbbmbaQhwxdkaqaQcefgQ9hmbxikkakczakcz6EhzaOheaLhOawcu9hmbkkaocdtavc:Seffc98fhedninaoTmeaeydbcbyd;q:kjjbH:bjjjbbaec98fheaocufhoxbkkavc:qdf8Kjjjjbk;IlevucuaicdtgvaicFFFFi0Egocbyd;u:kjjbHjjjjbbhralalyd9GgwcdtfarBdbalawcefBd9GabarBdbaocbyd;u:kjjbHjjjjbbhralalyd9GgocdtfarBdbalaocefBd9GabarBdlcuadcdtadcFFFFi0Ecbyd;u:kjjbHjjjjbbhralalyd9GgocdtfarBdbalaocefBd9GabarBdwabydbcbavz:wjjjb8Aadci9UhDdnadTmbabydbhoaehladhrinaoalydbcdtfgvavydbcefBdbalclfhlarcufgrmbkkdnaiTmbabydbhlabydlhrcbhvaihoinaravBdbarclfhralydbavfhvalclfhlaocufgombkkdnadci6mbabydlhrabydwhvcbhlinaecwfydbhoaeclfydbhdaraeydbcdtfgwawydbgwcefBdbavawcdtfalBdbaradcdtfgdadydbgdcefBdbavadcdtfalBdbaraocdtfgoaoydbgocefBdbavaocdtfalBdbaecxfheaDalcefgl9hmbkkdnaiTmbabydlheabydbhlinaeaeydbalydb9RBdbalclfhlaeclfheaicufgimbkkkQbabaeadaic;K1jjbz:njjjbkQbabaeadaic;m:jjjbz:njjjbk9DeeuabcFeaicdtz:wjjjbhlcbhbdnadTmbindnalaeydbcdtfgiydbcu9hmbaiabBdbabcefhbkaeclfheadcufgdmbkkabk:Vvioud9:du8Jjjjjbc;Wa9Rgl8Kjjjjbcbhvalcxfcbc;Kbz:wjjjb8AalcuadcitgoadcFFFFe0Ecbyd;u:kjjbHjjjjbbgrBdxalceBd2araeadaicez:tjjjbalcuaoadcjjjjoGEcbyd;u:kjjbHjjjjbbgwBdzadcdthednadTmbabhiinaiavBdbaiclfhiadavcefgv9hmbkkawaefhDalabBdwalawBdl9cbhqindnadTmbaq9cq9:hkarhvaDhiadheinaiav8Pibak1:NcFrG87ebavcwfhvaicdfhiaecufgembkkalclfaq:NceGcdtfydbhxalclfaq9ce98gq:NceGcdtfydbhmalc;Wbfcbcjaz:wjjjb8AaDhvadhidnadTmbinalc;Wbfav8VebcdtfgeaeydbcefBdbavcdfhvaicufgimbkkcbhvcbhiinalc;WbfavfgeydbhoaeaiBdbaoaifhiavclfgvcja9hmbkadhvdndnadTmbinalc;WbfaDamydbgicetf8VebcdtfgeaeydbgecefBdbaxaecdtfaiBdbamclfhmavcufgvmbkaq9cv9smdcbhvinabawydbcdtfavBdbawclfhwadavcefgv9hmbxdkkaq9cv9smekkclhvdninavc98Smealcxfavfydbcbyd;q:kjjbH:bjjjbbavc98fhvxbkkalc;Waf8Kjjjjbk:Jwliuo99iud9:cbhv8Jjjjjbca9Rgoczfcwfcbyd:8:kjjbBdbaocb8Pd:0:kjjb83izaocwfcbyd;i:kjjbBdbaocb8Pd;a:kjjb83ibaicd4hrdndnadmbJFFuFhwJFFuuhDJFFuuhqJFFuFhkJFFuuhxJFFuFhmxekarcdthPaehsincbhiinaoczfaifgzasaifIdbgwazIdbgDaDaw9EEUdbaoaifgzawazIdbgDaDaw9DEUdbaiclfgicx9hmbkasaPfhsavcefgvad9hmbkaoIdKhDaoIdwhwaoIdChqaoIdlhkaoIdzhxaoIdbhmkdnadTmbJbbbbJbFu9hJbbbbamax:tgmamJbbbb9DEgmakaq:tgkakam9DEgkawaD:tgwawak9DEgw:vawJbbbb9BEhwdnalmbarcdthoindndnaeclfIdbaq:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikai:S9cC:ghHdndnaeIdbax:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikaHai:S:ehHdndnaecwfIdbaD:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikabaHai:T9cy:g:e83ibaeaofheabcwfhbadcufgdmbxdkkarcdthoindndnaeIdbax:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikai:SgH9ca:gaH9cz:g9cjjj;4s:d:eaH9cFe:d:e9cF:bj;4:pj;ar:d9c:bd9:9c:p;G:d;4j:E;ar:d9cH9:9c;d;H:W:y:m:g;d;Hb:d9cv9:9c;j:KM;j:KM;j:Kd:dhOdndnaeclfIdbaq:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikai:SgH9ca:gaH9cz:g9cjjj;4s:d:eaH9cFe:d:e9cF:bj;4:pj;ar:d9c:bd9:9c:p;G:d;4j:E;ar:d9cH9:9c;d;H:W:y:m:g;d;Hb:d9cq9:9cM;j:KM;j:KM;jl:daO:ehOdndnaecwfIdbaD:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikabaOai:SgH9ca:gaH9cz:g9cjjj;4s:d:eaH9cFe:d:e9cF:bj;4:pj;ar:d9c:bd9:9c:p;G:d;4j:E;ar:d9cH9:9c;d;H:W:y:m:g;d;Hb:d9cC9:9c:KM;j:KM;j:KMD:d:e83ibaeaofheabcwfhbadcufgdmbkkk9teiucbcbyd;y:kjjbgeabcifc98GfgbBd;y:kjjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik;teeeudndnaeabVciGTmbabhixekdndnadcz9pmbabhixekabhiinaiaeydbBdbaiaeydlBdlaiaeydwBdwaiaeydxBdxaeczfheaiczfhiadc9Wfgdcs0mbkkadcl6mbinaiaeydbBdbaeclfheaiclfhiadc98fgdci0mbkkdnadTmbinaiaeRbb86bbaicefhiaecefheadcufgdmbkkabk:3eedudndnabciGTmbabhixekaecFeGc:b:c:ew2hldndnadcz9pmbabhixekabhiinaialBdxaialBdwaialBdlaialBdbaiczfhiadc9Wfgdcs0mbkkadcl6mbinaialBdbaiclfhiadc98fgdci0mbkkdnadTmbinaiae86bbaicefhiadcufgdmbkkabk9teiucbcbyd;y:kjjbgeabcrfc94GfgbBd;y:kjjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik9:eiuZbhedndncbyd;y:kjjbgdaecztgi9nmbcuheadai9RcFFifcz4nbcuSmekadhekcbabae9Rcifc98Gcbyd;y:kjjbfgdBd;y:kjjbdnadZbcztge9nmbadae9RcFFifcz4nb8Akkk;Qddbcjwk;mdbbbbdbbblbbbwbbbbbbbebbbdbbblbbbwbbbbbbbbbbbbbbbb4:h9w9N94:P:gW:j9O:ye9Pbbbbbbebbbdbbbebbbdbbbbbbbdbbbbbbbebbbbbbb:l29hZ;69:9kZ;N;76Z;rg97Z;z;o9xZ8J;B85Z;:;u9yZ;b;k9HZ:2;Z9DZ9e:l9mZ59A8KZ:r;T3Z:A:zYZ79OHZ;j4::8::Y:D9V8:bbbb9s:49:Z8R:hBZ9M9M;M8:L;z;o8:;8:PG89q;x:J878R:hQ8::M:B;e87bbbbbbjZbbjZbbjZ:E;V;N8::Y:DsZ9i;H;68:xd;R8:;h0838:;W:NoZbbbb:WV9O8:uf888:9i;H;68:9c9G;L89;n;m9m89;D8Ko8:bbbbf:8tZ9m836ZS:2AZL;zPZZ818EZ9e:lxZ;U98F8:819E;68:FFuuFFuuFFuuFFuFFFuFFFuFbc;mqkzebbbebbbdbbb9G:vbb",t=new Uint8Array([32,0,65,2,1,106,34,33,3,128,11,4,13,64,6,253,10,7,15,116,127,5,8,12,40,16,19,54,20,9,27,255,113,17,42,67,24,23,146,148,18,14,22,45,70,69,56,114,101,21,25,63,75,136,108,28,118,29,73,115]);if(typeof WebAssembly!="object")return{supported:!1};var a,s=WebAssembly.instantiate(r(e),{}).then(function(b){a=b.instance,a.exports.__wasm_call_ctors(),a.exports.meshopt_encodeVertexVersion(0),a.exports.meshopt_encodeIndexVersion(1)});function r(b){for(var h=new Uint8Array(b.length),d=0;d<b.length;++d){var x=b.charCodeAt(d);h[d]=x>96?x-97:x>64?x-39:x+4}for(var g=0,d=0;d<b.length;++d)h[g++]=h[d]<60?t[h[d]]:(h[d]-60)*64+h[++d];return h.buffer.slice(0,g)}function n(b){if(!b)throw new Error("Assertion failed")}function i(b){return new Uint8Array(b.buffer,b.byteOffset,b.byteLength)}function o(b,h,d,x){var g=a.exports.sbrk,y=g(h.length*4),m=g(d*4),v=new Uint8Array(a.exports.memory.buffer),E=i(h);v.set(E,y),x&&x(y,y,h.length,d);var S=b(m,y,h.length,d);v=new Uint8Array(a.exports.memory.buffer);var A=new Uint32Array(d);new Uint8Array(A.buffer).set(v.subarray(m,m+d*4)),E.set(v.subarray(y,y+h.length*4)),g(y-g(0));for(var T=0;T<h.length;++T)h[T]=A[h[T]];return[A,S]}function c(b,h,d,x){var g=a.exports.sbrk,y=g(d*4),m=g(d*x),v=new Uint8Array(a.exports.memory.buffer);v.set(i(h),m),b(y,m,d,x),v=new Uint8Array(a.exports.memory.buffer);var E=new Uint32Array(d);return new Uint8Array(E.buffer).set(v.subarray(y,y+d*4)),g(y-g(0)),E}function l(b,h,d,x,g){var y=a.exports.sbrk,m=y(h),v=y(x*g),E=new Uint8Array(a.exports.memory.buffer);E.set(i(d),v);var S=b(m,h,v,x,g),A=new Uint8Array(S);return A.set(E.subarray(m,m+S)),y(m-y(0)),A}function f(b){for(var h=0,d=0;d<b.length;++d){var x=b[d];h=h<x?x:h}return h}function u(b,h){if(n(h==2||h==4),h==4)return new Uint32Array(b.buffer,b.byteOffset,b.byteLength/4);var d=new Uint16Array(b.buffer,b.byteOffset,b.byteLength/2);return new Uint32Array(d)}function p(b,h,d,x,g,y,m){var v=a.exports.sbrk,E=v(d*x),S=v(d*y),A=new Uint8Array(a.exports.memory.buffer);A.set(i(h),S),b(E,d,x,g,S,m);var T=new Uint8Array(d*x);return T.set(A.subarray(E,E+d*x)),v(E-v(0)),T}return{ready:s,supported:!0,reorderMesh:function(b,h,d){var x=h?d?a.exports.meshopt_optimizeVertexCacheStrip:a.exports.meshopt_optimizeVertexCache:void 0;return o(a.exports.meshopt_optimizeVertexFetchRemap,b,f(b)+1,x)},reorderPoints:function(b,h){return n(b instanceof Float32Array),n(b.length%h==0),n(h>=3),c(a.exports.meshopt_spatialSortRemap,b,b.length/h,h*4)},encodeVertexBuffer:function(b,h,d){n(d>0&&d<=256),n(d%4==0);var x=a.exports.meshopt_encodeVertexBufferBound(h,d);return l(a.exports.meshopt_encodeVertexBuffer,x,b,h,d)},encodeIndexBuffer:function(b,h,d){n(d==2||d==4),n(h%3==0);var x=u(b,d),g=a.exports.meshopt_encodeIndexBufferBound(h,f(x)+1);return l(a.exports.meshopt_encodeIndexBuffer,g,x,h,4)},encodeIndexSequence:function(b,h,d){n(d==2||d==4);var x=u(b,d),g=a.exports.meshopt_encodeIndexSequenceBound(h,f(x)+1);return l(a.exports.meshopt_encodeIndexSequence,g,x,h,4)},encodeGltfBuffer:function(b,h,d,x){var g={ATTRIBUTES:this.encodeVertexBuffer,TRIANGLES:this.encodeIndexBuffer,INDICES:this.encodeIndexSequence};return n(g[x]),g[x](b,h,d)},encodeFilterOct:function(b,h,d,x){return n(d==4||d==8),n(x>=1&&x<=16),p(a.exports.meshopt_encodeFilterOct,b,h,d,x,16)},encodeFilterQuat:function(b,h,d,x){return n(d==8),n(x>=4&&x<=16),p(a.exports.meshopt_encodeFilterQuat,b,h,d,x,16)},encodeFilterExp:function(b,h,d,x,g){n(d>0&&d%4==0),n(x>=1&&x<=24);var y={Separate:0,SharedVector:1,SharedComponent:2,Clamped:3};return p(a.exports.meshopt_encodeFilterExp,b,h,d,x,d,g?y[g]:1)}}})();var gr=(function(){var e="b9H79Tebbbe8Fv9Gbb9Gvuuuuueu9Giuuub9Geueu9Giuuueuikqbeeedddillviebeoweuec:W:Odkr;leDo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bb8A9TW79O9V9Wt9F9KW9J9V9KW9wWVtW949c919M9MWVbeY9TW79O9V9Wt9F9KW9J9V9KW69U9KW949c919M9MWVbdE9TW79O9V9Wt9F9KW9J9V9KW69U9KW949tWG91W9U9JWbiL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9p9JtblK9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9r919HtbvL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWVT949Wbol79IV9Rbrq:S86qdbk;jYi5ud9:du8Jjjjjbcj;kb9Rgv8Kjjjjbc9:hodnalTmbcuhoaiRbbgrc;WeGc:Ge9hmbarcsGgwce0mbc9:hoalcufadcd4cbawEgDadfgrcKcaawEgqaraq0Egk6mbaicefhxcj;abad9Uc;WFbGcjdadca0EhmaialfgPar9Rgoadfhsavaoadz1jjjbgzceVhHcbhOdndninaeaO9nmeaPax9RaD6mdamaeaO9RaOamfgoae6EgAcsfglc9WGhCabaOad2fhXaAcethQaxaDfhiaOaeaoaeao6E9RhLalcl4cifcd4hKazcj;cbfaAfhYcbh8AazcjdfhEaHh3incbhodnawTmbaxa8Acd4fRbbhokaocFeGh5cbh8Eazcj;cbfhqinaih8Fdndndndna5a8Ecet4ciGgoc9:fPdebdkaPa8F9RaA6mrazcj;cbfa8EaA2fa8FaAz1jjjb8Aa8FaAfhixdkazcj;cbfa8EaA2fcbaAz:jjjjb8Aa8FhixekaPa8F9RaK6mva8FaKfhidnaCTmbaPai9RcK6mbaocdtc:q1jjbfcj1jjbawEhaczhrcbhlinargoc9Wfghaqfhrdndndndndndnaaa8Fahco4fRbbalcoG4ciGcdtfydbPDbedvivvvlvkar9cb83bbarcwf9cb83bbxlkarcbaiRbdai8Xbb9c:c:qj:bw9:9c:q;c1:I1e:d9c:b:c:e1z9:gg9cjjjjjz:dg8J9qE86bbaqaofgrcGfag9c8F1:NghcKtc8F91aicdfa8J9c8N1:Nfg8KRbbG86bbarcVfcba8KahcjeGcr4fghRbbag9cjjjjjl:dg8J9qE86bbarc7fcbaha8J9c8L1:NfghRbbag9cjjjjjd:dg8J9qE86bbarctfcbaha8J9c8K1:NfghRbbag9cjjjjje:dg8J9qE86bbarc91fcbaha8J9c8J1:NfghRbbag9cjjjj;ab:dg8J9qE86bbarc4fcbaha8J9cg1:NfghRbbag9cjjjja:dg8J9qE86bbarc93fcbaha8J9ch1:NfghRbbag9cjjjjz:dgg9qE86bbarc94fcbahag9ca1:NfghRbbai8Xbe9c:c:qj:bw9:9c:q;c1:I1e:d9c:b:c:e1z9:gg9cjjjjjz:dg8J9qE86bbarc95fag9c8F1:NgicKtc8F91aha8J9c8N1:NfghRbbG86bbarc96fcbahaicjeGcr4fgiRbbag9cjjjjjl:dg8J9qE86bbarc97fcbaia8J9c8L1:NfgiRbbag9cjjjjjd:dg8J9qE86bbarc98fcbaia8J9c8K1:NfgiRbbag9cjjjjje:dg8J9qE86bbarc99fcbaia8J9c8J1:NfgiRbbag9cjjjj;ab:dg8J9qE86bbarc9:fcbaia8J9cg1:NfgiRbbag9cjjjja:dg8J9qE86bbarcufcbaia8J9ch1:NfgiRbbag9cjjjjz:dgg9qE86bbaiag9ca1:NfhixikaraiRblaiRbbghco4g8Ka8KciSg8KE86bbaqaofgrcGfaiclfa8Kfg8KRbbahcl4ciGg8La8LciSg8LE86bbarcVfa8Ka8Lfg8KRbbahcd4ciGg8La8LciSg8LE86bbarc7fa8Ka8Lfg8KRbbahciGghahciSghE86bbarctfa8Kahfg8KRbbaiRbeghco4g8La8LciSg8LE86bbarc91fa8Ka8Lfg8KRbbahcl4ciGg8La8LciSg8LE86bbarc4fa8Ka8Lfg8KRbbahcd4ciGg8La8LciSg8LE86bbarc93fa8Ka8Lfg8KRbbahciGghahciSghE86bbarc94fa8Kahfg8KRbbaiRbdghco4g8La8LciSg8LE86bbarc95fa8Ka8Lfg8KRbbahcl4ciGg8La8LciSg8LE86bbarc96fa8Ka8Lfg8KRbbahcd4ciGg8La8LciSg8LE86bbarc97fa8Ka8Lfg8KRbbahciGghahciSghE86bbarc98fa8KahfghRbbaiRbigico4g8Ka8KciSg8KE86bbarc99faha8KfghRbbaicl4ciGg8Ka8KciSg8KE86bbarc9:faha8KfghRbbaicd4ciGg8Ka8KciSg8KE86bbarcufaha8KfgrRbbaiciGgiaiciSgiE86bbaraifhixdkaraiRbwaiRbbghcl4g8Ka8KcsSg8KE86bbaqaofgrcGfaicwfa8Kfg8KRbbahcsGghahcsSghE86bbarcVfa8KahfghRbbaiRbeg8Kcl4g8La8LcsSg8LE86bbarc7faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarctfaha8KfghRbbaiRbdg8Kcl4g8La8LcsSg8LE86bbarc91faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc4faha8KfghRbbaiRbig8Kcl4g8La8LcsSg8LE86bbarc93faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc94faha8KfghRbbaiRblg8Kcl4g8La8LcsSg8LE86bbarc95faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc96faha8KfghRbbaiRbvg8Kcl4g8La8LcsSg8LE86bbarc97faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc98faha8KfghRbbaiRbog8Kcl4g8La8LcsSg8LE86bbarc99faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc9:faha8KfghRbbaiRbrgicl4g8Ka8KcsSg8KE86bbarcufaha8KfgrRbbaicsGgiaicsSgiE86bbaraifhixekarai8Pbb83bbarcwfaicwf8Pbb83bbaiczfhikdnaoaC9pmbalcdfhlaoczfhraPai9RcL0mekkaoaC6moaimexokaCmva8FTmvkaqaAfhqa8Ecefg8Ecl9hmbkdndndndnawTmbasa8Acd4fRbbgociGPlbedrbkaATmdaza8Afh8Fazcj;cbfhhcbh8EaEhaina8FRbbhraahocbhlinaoahalfRbbgqce4cbaqceG9R7arfgr86bbaoadfhoaAalcefgl9hmbkaacefhaa8Fcefh8FahaAfhha8Ecefg8Ecl9hmbxikkaATmeaza8Afhaazcj;cbfhhcbhoceh8EaYh8FinaEaofhlaa8Vbbhrcbhoinala8FaofRbbcwtahaofRbbgqVc;:FiGce4cbaqceG9R7arfgr87bbaladfhlaLaocefgofmbka8FaQfh8FcdhoaacdfhaahaQfhha8EceGhlcbh8EalmbxdkkaATmbcbaocl49Rh8Eaza8AfRbbhqcwhoa3hlinalRbbaotaqVhqalcefhlaocwfgoca9hmbkcbhhaEh8FaYhainazcj;cbfahfRbbhrcwhoaahlinalRbbaotarVhralaAfhlaocwfgoca9hmbkara8E93aq7hqcbhoa8Fhlinalaqao486bbalcefhlaocwfgoca9hmbka8Fadfh8FaacefhaahcefghaA9hmbkkaEclfhEa3clfh3a8Aclfg8Aad6mbkaXazcjdfaAad2z1jjjb8AazazcjdfaAcufad2fadz1jjjb8AaAaOfhOaihxaimbkc9:hoxdkcbc99aPax9RakSEhoxekc9:hokavcj;kbf8Kjjjjbaok:XseHu8Jjjjjbc;ae9Rgv8Kjjjjbc9:hodnaeci9UgrcHfal0mbcuhoaiRbbgwc;WeGc;Ge9hmbawcsGgDce0mbavc;abfcFecjez:jjjjb8AavcUf9cu83ibavc8Wf9cu83ibavcyf9cu83ibavcaf9cu83ibavcKf9cu83ibavczf9cu83ibav9cu83iwav9cu83ibaialfc9WfhqaicefgwarfhldnaeTmbcmcsaDceSEhkcbhxcbhmcbhrcbhicbhoindnalaq9nmbc9:hoxikdndnawRbbgDc;Ve0mbavc;abfaoaDcu7gPcl4fcsGcitfgsydlhzasydbhHdndnaDcsGgsak9pmbavaiaPfcsGcdtfydbaxasEhDaxasTgOfhxxekdndnascsSmbcehOasc987asamffcefhDxekalcefhDal8SbbgscFeGhPdndnascu9mmbaDhlxekalcvfhlaPcFbGhPcrhsdninaD8SbbgOcFbGastaPVhPaOcu9kmeaDcefhDascrfgsc8J9hmbxdkkaDcefhlkcehOaPce4cbaPceG9R7amfhDkaDhmkavc;abfaocitfgsaDBdbasazBdlavaicdtfaDBdbavc;abfaocefcsGcitfgsaHBdbasaDBdlaocdfhoaOaifhidnadcd9hmbabarcetfgsaH87ebasclfaD87ebascdfaz87ebxdkabarcdtfgsaHBdbascwfaDBdbasclfazBdbxekdnaDcpe0mbaxcefgOavaiaqaDcsGfRbbgscl49RcsGcdtfydbascz6gPEhDavaias9RcsGcdtfydbaOaPfgzascsGgOEhsaOThOdndnadcd9hmbabarcetfgHax87ebaHclfas87ebaHcdfaD87ebxekabarcdtfgHaxBdbaHcwfasBdbaHclfaDBdbkavaicdtfaxBdbavc;abfaocitfgHaDBdbaHaxBdlavaicefgicsGcdtfaDBdbavc;abfaocefcsGcitfgHasBdbaHaDBdlavaiaPfgicsGcdtfasBdbavc;abfaocdfcsGcitfgDaxBdbaDasBdlaocifhoaiaOfhiazaOfhxxekaxcbalRbbgHEgAaDc;:eSgDfhzaHcsGhCaHcl4hXdndnaHcs0mbazcefhOxekazhOavaiaX9RcsGcdtfydbhzkdndnaCmbaOcefhxxekaOhxavaiaH9RcsGcdtfydbhOkdndnaDTmbalcefhDxekalcdfhDal8SbegPcFeGhsdnaPcu9kmbalcofhAascFbGhscrhldninaD8SbbgPcFbGaltasVhsaPcu9kmeaDcefhDalcrfglc8J9hmbkaAhDxekaDcefhDkasce4cbasceG9R7amfgmhAkdndnaXcsSmbaDhsxekaDcefhsaD8SbbglcFeGhPdnalcu9kmbaDcvfhzaPcFbGhPcrhldninas8SbbgDcFbGaltaPVhPaDcu9kmeascefhsalcrfglc8J9hmbkazhsxekascefhskaPce4cbaPceG9R7amfgmhzkdndnaCcsSmbashlxekascefhlas8SbbgDcFeGhPdnaDcu9kmbascvfhOaPcFbGhPcrhDdninal8SbbgscFbGaDtaPVhPascu9kmealcefhlaDcrfgDc8J9hmbkaOhlxekalcefhlkaPce4cbaPceG9R7amfgmhOkdndnadcd9hmbabarcetfgDaA87ebaDclfaO87ebaDcdfaz87ebxekabarcdtfgDaABdbaDcwfaOBdbaDclfazBdbkavc;abfaocitfgDazBdbaDaABdlavaicdtfaABdbavc;abfaocefcsGcitfgDaOBdbaDazBdlavaicefgicsGcdtfazBdbavc;abfaocdfcsGcitfgDaABdbaDaOBdlavaiaHcz6aXcsSVfgicsGcdtfaOBdbaiaCTaCcsSVfhiaocifhokawcefhwaocsGhoaicsGhiarcifgrae6mbkkcbc99alaqSEhokavc;aef8Kjjjjbaok:clevu8Jjjjjbcz9Rhvdnaecvfal9nmbc9:skdnaiRbbc;:eGc;qeSmbcuskav9cb83iwaicefhoaialfc98fhrdnaeTmbdnadcdSmbcbhwindnaoar6mbc9:skaocefhlao8SbbgicFeGhddndnaicu9mmbalhoxekaocvfhoadcFbGhdcrhidninal8SbbgDcFbGaitadVhdaDcu9kmealcefhlaicrfgic8J9hmbxdkkalcefhokabawcdtfadc8Etc8F91adcd47avcwfadceGcdtVglydbfgiBdbalaiBdbawcefgwae9hmbxdkkcbhwindnaoar6mbc9:skaocefhlao8SbbgicFeGhddndnaicu9mmbalhoxekaocvfhoadcFbGhdcrhidninal8SbbgDcFbGaitadVhdaDcu9kmealcefhlaicrfgic8J9hmbxdkkalcefhokabawcetfadc8Etc8F91adcd47avcwfadceGcdtVglydbfgi87ebalaiBdbawcefgwae9hmbkkcbc99aoarSEk:Lvoeue99dud99eud99dndnadcl9hmbaeTmeindndnabcdfgd8Sbb:Yab8Sbbgi:Ygl:l:tabcefgv8Sbbgo:Ygr:l:tgwJbb;:9cawawNJbbbbawawJbbbb9GgDEgq:mgkaqaicb9iEalMgwawNakaqaocb9iEarMgqaqNMM:r:vglNJbbbZJbbb:;aDEMgr:lJbbb9p9DTmbar:Ohixekcjjjj94hikadai86bbdndnaqalNJbbbZJbbb:;aqJbbbb9GEMgq:lJbbb9p9DTmbaq:Ohdxekcjjjj94hdkavad86bbdndnawalNJbbbZJbbb:;awJbbbb9GEMgw:lJbbb9p9DTmbaw:Ohdxekcjjjj94hdkabad86bbabclfhbaecufgembxdkkaeTmbindndnabclfgd8Ueb:Yab8Uebgi:Ygl:l:tabcdfgv8Uebgo:Ygr:l:tgwJb;:FSawawNJbbbbawawJbbbb9GgDEgq:mgkaqaicb9iEalMgwawNakaqaocb9iEarMgqaqNMM:r:vglNJbbbZJbbb:;aDEMgr:lJbbb9p9DTmbar:Ohixekcjjjj94hikadai87ebdndnaqalNJbbbZJbbb:;aqJbbbb9GEMgq:lJbbb9p9DTmbaq:Ohdxekcjjjj94hdkavad87ebdndnawalNJbbbZJbbb:;awJbbbb9GEMgw:lJbbb9p9DTmbaw:Ohdxekcjjjj94hdkabad87ebabcwfhbaecufgembkkk;oiliui99iue99dnaeTmbcbhiabhlindndnJ;Zl81Zalcof8UebgvciV:Y:vgoal8Ueb:YNgrJb;:FSNJbbbZJbbb:;arJbbbb9GEMgw:lJbbb9p9DTmbaw:OhDxekcjjjj94hDkalclf8Uebhqalcdf8UebhkabaiavcefciGfcetfaD87ebdndnaoak:YNgwJb;:FSNJbbbZJbbb:;awJbbbb9GEMgx:lJbbb9p9DTmbax:OhDxekcjjjj94hDkabaiavciGfgkcd7cetfaD87ebdndnaoaq:YNgoJb;:FSNJbbbZJbbb:;aoJbbbb9GEMgx:lJbbb9p9DTmbax:OhDxekcjjjj94hDkabaiavcufciGfcetfaD87ebdndnJbbjZararN:tawawN:taoaoN:tgrJbbbbarJbbbb9GE:rJb;:FSNJbbbZMgr:lJbbb9p9DTmbar:Ohvxekcjjjj94hvkabakcetfav87ebalcwfhlaiclfhiaecufgembkkk9mbdnadcd4ae2gdTmbinababydbgecwtcw91:Yaece91cjjj98Gcjjj;8if::NUdbabclfhbadcufgdmbkkk9teiucbcbyd:K1jjbgeabcifc98GfgbBd:K1jjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik;teeeudndnaeabVciGTmbabhixekdndnadcz9pmbabhixekabhiinaiaeydbBdbaiaeydlBdlaiaeydwBdwaiaeydxBdxaeczfheaiczfhiadc9Wfgdcs0mbkkadcl6mbinaiaeydbBdbaeclfheaiclfhiadc98fgdci0mbkkdnadTmbinaiaeRbb86bbaicefhiaecefheadcufgdmbkkabk:3eedudndnabciGTmbabhixekaecFeGc:b:c:ew2hldndnadcz9pmbabhixekabhiinaialBdxaialBdwaialBdlaialBdbaiczfhiadc9Wfgdcs0mbkkadcl6mbinaialBdbaiclfhiadc98fgdci0mbkkdnadTmbinaiae86bbaicefhiadcufgdmbkkabkk81dbcjwk8Kbbbbdbbblbbbwbbbbbbbebbbdbbblbbbwbbbbc:Kwkl8WNbb",t="b9H79TebbbeKl9Gbb9Gvuuuuueu9Giuuub9Geueuikqbbebeedddilve9Weeeviebeoweuec:q:6dkr;leDo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bb8A9TW79O9V9Wt9F9KW9J9V9KW9wWVtW949c919M9MWVbdY9TW79O9V9Wt9F9KW9J9V9KW69U9KW949c919M9MWVblE9TW79O9V9Wt9F9KW9J9V9KW69U9KW949tWG91W9U9JWbvL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9p9JtboK9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9r919HtbrL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWVT949Wbwl79IV9RbDq;G9Mqlbzik9:evu8Jjjjjbcz9Rhbcbheincbhdcbhiinabcwfadfaicjuaead4ceGglE86bbaialfhiadcefgdcw9hmbkaec:q:yjjbfai86bbaecitc:q1jjbfab8Piw83ibaecefgecjd9hmbkk:183lYud97dur978Jjjjjbcj;kb9Rgv8Kjjjjbc9:hodnalTmbcuhoaiRbbgrc;WeGc:Ge9hmbarcsGgwce0mbc9:hoalcufadcd4cbawEgDadfgrcKcaawEgqaraq0Egk6mbaicefhxavaialfgmar9Rgoad;8qbbcj;abad9Uc;WFbGcjdadca0EhPdndndnadTmbaoadfhscbhzinaeaz9nmdamax9RaD6miabazad2fhHaxaDfhOaPaeaz9RazaPfae6EgAcsfgocl4cifcd4hCavcj;cbfaoc9WGgXcetfhQavcj;cbfaXci2fhLavcj;cbfaXfhKcbhYaoc;ab6h8AincbhodnawTmbaxaYcd4fRbbhokaocFeGhEcbh3avcj;cbfh5indndndndnaEa3cet4ciGgoc9:fPdebdkamaO9RaX6mwavcj;cbfa3aX2faOaX;8qbbaOaAfhOxdkavcj;cbfa3aX2fcbaX;8kbxekamaO9RaC6moaoclVcbawEhraOaCfhocbhidna8Ambamao9Rc;Gb6mbcbhlina5alfhidndndndndndnaOalco4fRbbgqciGarfPDbedibledibkaipxbbbbbbbbbbbbbbbbpklbxlkaiaopbblaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLg8Ecdp:mea8EpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9og8Fpxiiiiiiiiiiiiiiiip8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaoclffahc:q:yjjbfRbbfhoxikaiaopbbwaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9og8Fpxssssssssssssssssp8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaocwffahc:q:yjjbfRbbfhoxdkaiaopbbbpklbaoczfhoxekaiaopbbdaoRbbgacitc:q1jjbfpbibaac:q:yjjbfRbbgapsaoRbeghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPpklbaaaocdffahc:q:yjjbfRbbfhokdndndndndndnaqcd4ciGarfPDbedibledibkaiczfpxbbbbbbbbbbbbbbbbpklbxlkaiczfaopbblaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLg8Ecdp:mea8EpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9og8Fpxiiiiiiiiiiiiiiiip8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaoclffahc:q:yjjbfRbbfhoxikaiczfaopbbwaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9og8Fpxssssssssssssssssp8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaocwffahc:q:yjjbfRbbfhoxdkaiczfaopbbbpklbaoczfhoxekaiczfaopbbdaoRbbgacitc:q1jjbfpbibaac:q:yjjbfRbbgapsaoRbeghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPpklbaaaocdffahc:q:yjjbfRbbfhokdndndndndndnaqcl4ciGarfPDbedibledibkaicafpxbbbbbbbbbbbbbbbbpklbxlkaicafaopbblaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLg8Ecdp:mea8EpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9og8Fpxiiiiiiiiiiiiiiiip8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaoclffahc:q:yjjbfRbbfhoxikaicafaopbbwaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9og8Fpxssssssssssssssssp8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaocwffahc:q:yjjbfRbbfhoxdkaicafaopbbbpklbaoczfhoxekaicafaopbbdaoRbbgacitc:q1jjbfpbibaac:q:yjjbfRbbgapsaoRbeghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPpklbaaaocdffahc:q:yjjbfRbbfhokdndndndndndnaqco4arfPDbedibledibkaic8Wfpxbbbbbbbbbbbbbbbbpklbxlkaic8Wfaopbblaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLg8Ecdp:mea8EpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9og8Fpxiiiiiiiiiiiiiiiip8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngicitc:q1jjbfpbibaic:q:yjjbfRbbgipsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Ngqcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaiaoclffaqc:q:yjjbfRbbfhoxikaic8Wfaopbbwaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9og8Fpxssssssssssssssssp8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngicitc:q1jjbfpbibaic:q:yjjbfRbbgipsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Ngqcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaiaocwffaqc:q:yjjbfRbbfhoxdkaic8Wfaopbbbpklbaoczfhoxekaic8WfaopbbdaoRbbgicitc:q1jjbfpbibaic:q:yjjbfRbbgipsaoRbegqcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPpklbaiaocdffaqc:q:yjjbfRbbfhokalc;abfhialcjefaX0meaihlamao9Rc;Fb0mbkkdnaiaX9pmbaici4hlinamao9RcK6mwa5aifhqdndndndndndnaOaico4fRbbalcoG4ciGarfPDbedibledibkaqpxbbbbbbbbbbbbbbbbpkbbxlkaqaopbblaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLg8Ecdp:mea8EpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9og8Fpxiiiiiiiiiiiiiiiip8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spkbbaaaoclffahc:q:yjjbfRbbfhoxikaqaopbbwaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9og8Fpxssssssssssssssssp8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spkbbaaaocwffahc:q:yjjbfRbbfhoxdkaqaopbbbpkbbaoczfhoxekaqaopbbdaoRbbgacitc:q1jjbfpbibaac:q:yjjbfRbbgapsaoRbeghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPpkbbaaaocdffahc:q:yjjbfRbbfhokalcdfhlaiczfgiaX6mbkkaohOaoTmoka5aXfh5a3cefg3cl9hmbkdndndndnawTmbasaYcd4fRbbglciGPlbedwbkaXTmdavcjdfaYfhlavaYfpbdbhgcbhoinalavcj;cbfaofpblbg8JaKaofpblbg8KpmbzeHdOiAlCvXoQrLg8LaQaofpblbg8MaLaofpblbg8NpmbzeHdOiAlCvXoQrLgypmbezHdiOAlvCXorQLg8Ecep9Ta8Epxeeeeeeeeeeeeeeeeg8Fp9op9Hp9rg8Eagp9Uggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp9Uggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp9Uggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp9Uggp9Abbbaladfglaga8LaypmwDKYqk8AExm35Ps8E8Fg8Ecep9Ta8Ea8Fp9op9Hp9rg8Ep9Uggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp9Uggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp9Uggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp9Uggp9Abbbaladfglaga8Ja8KpmwKDYq8AkEx3m5P8Es8Fg8Ja8Ma8NpmwKDYq8AkEx3m5P8Es8Fg8KpmbezHdiOAlvCXorQLg8Ecep9Ta8Ea8Fp9op9Hp9rg8Ep9Uggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp9Uggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp9Uggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp9Uggp9Abbbaladfglaga8Ja8KpmwDKYqk8AExm35Ps8E8Fg8Ecep9Ta8Ea8Fp9op9Hp9rg8Ep9Ug8Fp9Abbbaladfgla8Fa8Ea8Epmlvorlvorlvorlvorp9Ug8Fp9Abbbaladfgla8Fa8Ea8EpmwDqkwDqkwDqkwDqkp9Ug8Fp9Abbbaladfgla8Fa8Ea8EpmxmPsxmPsxmPsxmPsp9Uggp9AbbbaladfhlaoczfgoaX6mbxikkaXTmeavcjdfaYfhlavaYfpbdbhgcbhoinalavcj;cbfaofpblbg8JaKaofpblbg8KpmbzeHdOiAlCvXoQrLg8LaQaofpblbg8MaLaofpblbg8NpmbzeHdOiAlCvXoQrLgypmbezHdiOAlvCXorQLg8Ecep:nea8Epxebebebebebebebebg8Fp9op:bep9rg8Eagp:oeggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp:oeggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp:oeggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp:oeggp9Abbbaladfglaga8LaypmwDKYqk8AExm35Ps8E8Fg8Ecep:nea8Ea8Fp9op:bep9rg8Ep:oeggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp:oeggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp:oeggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp:oeggp9Abbbaladfglaga8Ja8KpmwKDYq8AkEx3m5P8Es8Fg8Ja8Ma8NpmwKDYq8AkEx3m5P8Es8Fg8KpmbezHdiOAlvCXorQLg8Ecep:nea8Ea8Fp9op:bep9rg8Ep:oeggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp:oeggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp:oeggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp:oeggp9Abbbaladfglaga8Ja8KpmwDKYqk8AExm35Ps8E8Fg8Ecep:nea8Ea8Fp9op:bep9rg8Ep:oeg8Fp9Abbbaladfgla8Fa8Ea8Epmlvorlvorlvorlvorp:oeg8Fp9Abbbaladfgla8Fa8Ea8EpmwDqkwDqkwDqkwDqkp:oeg8Fp9Abbbaladfgla8Fa8Ea8EpmxmPsxmPsxmPsxmPsp:oeggp9AbbbaladfhlaoczfgoaX6mbxdkkaXTmbcbhocbalcl4gl9Rc8FGhiavcjdfaYfhravaYfpbdbh8Finaravcj;cbfaofpblbggaKaofpblbg8JpmbzeHdOiAlCvXoQrLg8KaQaofpblbg8LaLaofpblbg8MpmbzeHdOiAlCvXoQrLg8NpmbezHdiOAlvCXorQLg8Eaip:Rea8Ealp:Sep9qg8Ea8Fp9rg8Fp9Abbbaradfgra8Fa8Ea8Epmlvorlvorlvorlvorp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmwDqkwDqkwDqkwDqkp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmxmPsxmPsxmPsxmPsp9rg8Fp9Abbbaradfgra8Fa8Ka8NpmwDKYqk8AExm35Ps8E8Fg8Eaip:Rea8Ealp:Sep9qg8Ep9rg8Fp9Abbbaradfgra8Fa8Ea8Epmlvorlvorlvorlvorp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmwDqkwDqkwDqkwDqkp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmxmPsxmPsxmPsxmPsp9rg8Fp9Abbbaradfgra8Faga8JpmwKDYq8AkEx3m5P8Es8Fgga8La8MpmwKDYq8AkEx3m5P8Es8Fg8JpmbezHdiOAlvCXorQLg8Eaip:Rea8Ealp:Sep9qg8Ep9rg8Fp9Abbbaradfgra8Fa8Ea8Epmlvorlvorlvorlvorp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmwDqkwDqkwDqkwDqkp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmxmPsxmPsxmPsxmPsp9rg8Fp9Abbbaradfgra8Faga8JpmwDKYqk8AExm35Ps8E8Fg8Eaip:Rea8Ealp:Sep9qg8Ep9rg8Fp9Abbbaradfgra8Fa8Ea8Epmlvorlvorlvorlvorp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmwDqkwDqkwDqkwDqkp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmxmPsxmPsxmPsxmPsp9rg8Fp9AbbbaradfhraoczfgoaX6mbkkaYclfgYad6mbkaHavcjdfaAad2;8qbbavavcjdfaAcufad2fad;8qbbaAazfhzc9:hoaOhxaOmbxlkkaeTmbaDalfhrcbhocuhlinaralaD9RglfaD6mdaPaeao9RaoaPfae6Eaofgoae6mbkaial9Rhxkcbc99amax9RakSEhoxekc9:hokavcj;kbf8Kjjjjbaokwbz:bjjjbk:TseHu8Jjjjjbc;ae9Rgv8Kjjjjbc9:hodnaeci9UgrcHfal0mbcuhoaiRbbgwc;WeGc;Ge9hmbawcsGgDce0mbavc;abfcFecje;8kbavcUf9cu83ibavc8Wf9cu83ibavcyf9cu83ibavcaf9cu83ibavcKf9cu83ibavczf9cu83ibav9cu83iwav9cu83ibaialfc9WfhqaicefgwarfhldnaeTmbcmcsaDceSEhkcbhxcbhmcbhrcbhicbhoindnalaq9nmbc9:hoxikdndnawRbbgDc;Ve0mbavc;abfaoaDcu7gPcl4fcsGcitfgsydlhzasydbhHdndnaDcsGgsak9pmbavaiaPfcsGcdtfydbaxasEhDaxasTgOfhxxekdndnascsSmbcehOasc987asamffcefhDxekalcefhDal8SbbgscFeGhPdndnascu9mmbaDhlxekalcvfhlaPcFbGhPcrhsdninaD8SbbgOcFbGastaPVhPaOcu9kmeaDcefhDascrfgsc8J9hmbxdkkaDcefhlkcehOaPce4cbaPceG9R7amfhDkaDhmkavc;abfaocitfgsaDBdbasazBdlavaicdtfaDBdbavc;abfaocefcsGcitfgsaHBdbasaDBdlaocdfhoaOaifhidnadcd9hmbabarcetfgsaH87ebasclfaD87ebascdfaz87ebxdkabarcdtfgsaHBdbascwfaDBdbasclfazBdbxekdnaDcpe0mbaxcefgOavaiaqaDcsGfRbbgscl49RcsGcdtfydbascz6gPEhDavaias9RcsGcdtfydbaOaPfgzascsGgOEhsaOThOdndnadcd9hmbabarcetfgHax87ebaHclfas87ebaHcdfaD87ebxekabarcdtfgHaxBdbaHcwfasBdbaHclfaDBdbkavaicdtfaxBdbavc;abfaocitfgHaDBdbaHaxBdlavaicefgicsGcdtfaDBdbavc;abfaocefcsGcitfgHasBdbaHaDBdlavaiaPfgicsGcdtfasBdbavc;abfaocdfcsGcitfgDaxBdbaDasBdlaocifhoaiaOfhiazaOfhxxekaxcbalRbbgHEgAaDc;:eSgDfhzaHcsGhCaHcl4hXdndnaHcs0mbazcefhOxekazhOavaiaX9RcsGcdtfydbhzkdndnaCmbaOcefhxxekaOhxavaiaH9RcsGcdtfydbhOkdndnaDTmbalcefhDxekalcdfhDal8SbegPcFeGhsdnaPcu9kmbalcofhAascFbGhscrhldninaD8SbbgPcFbGaltasVhsaPcu9kmeaDcefhDalcrfglc8J9hmbkaAhDxekaDcefhDkasce4cbasceG9R7amfgmhAkdndnaXcsSmbaDhsxekaDcefhsaD8SbbglcFeGhPdnalcu9kmbaDcvfhzaPcFbGhPcrhldninas8SbbgDcFbGaltaPVhPaDcu9kmeascefhsalcrfglc8J9hmbkazhsxekascefhskaPce4cbaPceG9R7amfgmhzkdndnaCcsSmbashlxekascefhlas8SbbgDcFeGhPdnaDcu9kmbascvfhOaPcFbGhPcrhDdninal8SbbgscFbGaDtaPVhPascu9kmealcefhlaDcrfgDc8J9hmbkaOhlxekalcefhlkaPce4cbaPceG9R7amfgmhOkdndnadcd9hmbabarcetfgDaA87ebaDclfaO87ebaDcdfaz87ebxekabarcdtfgDaABdbaDcwfaOBdbaDclfazBdbkavc;abfaocitfgDazBdbaDaABdlavaicdtfaABdbavc;abfaocefcsGcitfgDaOBdbaDazBdlavaicefgicsGcdtfazBdbavc;abfaocdfcsGcitfgDaABdbaDaOBdlavaiaHcz6aXcsSVfgicsGcdtfaOBdbaiaCTaCcsSVfhiaocifhokawcefhwaocsGhoaicsGhiarcifgrae6mbkkcbc99alaqSEhokavc;aef8Kjjjjbaok:clevu8Jjjjjbcz9Rhvdnaecvfal9nmbc9:skdnaiRbbc;:eGc;qeSmbcuskav9cb83iwaicefhoaialfc98fhrdnaeTmbdnadcdSmbcbhwindnaoar6mbc9:skaocefhlao8SbbgicFeGhddndnaicu9mmbalhoxekaocvfhoadcFbGhdcrhidninal8SbbgDcFbGaitadVhdaDcu9kmealcefhlaicrfgic8J9hmbxdkkalcefhokabawcdtfadc8Etc8F91adcd47avcwfadceGcdtVglydbfgiBdbalaiBdbawcefgwae9hmbxdkkcbhwindnaoar6mbc9:skaocefhlao8SbbgicFeGhddndnaicu9mmbalhoxekaocvfhoadcFbGhdcrhidninal8SbbgDcFbGaitadVhdaDcu9kmealcefhlaicrfgic8J9hmbxdkkalcefhokabawcetfadc8Etc8F91adcd47avcwfadceGcdtVglydbfgi87ebalaiBdbawcefgwae9hmbkkcbc99aoarSEk:SPliuo97eue978Jjjjjbca9Rhiaec98Ghldndnadcl9hmbdnalTmbcbhvabhdinadadpbbbgocKp:RecKp:Sep;6egraocwp:RecKp:Sep;6earp;Geaoczp:RecKp:Sep;6egwp;Gep;Kep;LegDpxbbbbbbbbbbbbbbbbp:2egqarpxbbbjbbbjbbbjbbbjgkp9op9rp;Kegrpxbb;:9cbb;:9cbb;:9cbb;:9cararp;MeaDaDp;Meawaqawakp9op9rp;Kegrarp;Mep;Kep;Kep;Jep;Negwp;Mepxbbn0bbn0bbn0bbn0gqp;KepxFbbbFbbbFbbbFbbbp9oaopxbbbFbbbFbbbFbbbFp9op9qarawp;Meaqp;Kecwp:RepxbFbbbFbbbFbbbFbbp9op9qaDawp;Meaqp;Keczp:RepxbbFbbbFbbbFbbbFbp9op9qpkbbadczfhdavclfgval6mbkkalaeSmeaipxbbbbbbbbbbbbbbbbgqpklbaiabalcdtfgdaeciGglcdtgv;8qbbdnalTmbaiaipblbgocKp:RecKp:Sep;6egraocwp:RecKp:Sep;6earp;Geaoczp:RecKp:Sep;6egwp;Gep;Kep;LegDaqp:2egqarpxbbbjbbbjbbbjbbbjgkp9op9rp;Kegrpxbb;:9cbb;:9cbb;:9cbb;:9cararp;MeaDaDp;Meawaqawakp9op9rp;Kegrarp;Mep;Kep;Kep;Jep;Negwp;Mepxbbn0bbn0bbn0bbn0gqp;KepxFbbbFbbbFbbbFbbbp9oaopxbbbFbbbFbbbFbbbFp9op9qarawp;Meaqp;Kecwp:RepxbFbbbFbbbFbbbFbbp9op9qaDawp;Meaqp;Keczp:RepxbbFbbbFbbbFbbbFbp9op9qpklbkadaiav;8qbbskdnalTmbcbhvabhdinadczfgxaxpbbbgopxbbbbbbFFbbbbbbFFgkp9oadpbbbgDaopmbediwDqkzHOAKY8AEgwczp:Reczp:Sep;6egraDaopmlvorxmPsCXQL358E8FpxFubbFubbFubbFubbp9op;7eawczp:Sep;6egwp;Gearp;Gep;Kep;Legopxbbbbbbbbbbbbbbbbp:2egqarpxbbbjbbbjbbbjbbbjgmp9op9rp;Kegrpxb;:FSb;:FSb;:FSb;:FSararp;Meaoaop;Meawaqawamp9op9rp;Kegrarp;Mep;Kep;Kep;Jep;Negwp;Mepxbbn0bbn0bbn0bbn0gqp;KepxFFbbFFbbFFbbFFbbp9oaoawp;Meaqp;Keczp:Rep9qgoarawp;Meaqp;KepxFFbbFFbbFFbbFFbbp9ogrpmwDKYqk8AExm35Ps8E8Fp9qpkbbadaDakp9oaoarpmbezHdiOAlvCXorQLp9qpkbbadcafhdavclfgval6mbkkalaeSmbaiczfpxbbbbbbbbbbbbbbbbgopklbaiaopklbaiabalcitfgdaeciGglcitgv;8qbbdnalTmbaiaipblzgopxbbbbbbFFbbbbbbFFgkp9oaipblbgDaopmbediwDqkzHOAKY8AEgwczp:Reczp:Sep;6egraDaopmlvorxmPsCXQL358E8FpxFubbFubbFubbFubbp9op;7eawczp:Sep;6egwp;Gearp;Gep;Kep;Legopxbbbbbbbbbbbbbbbbp:2egqarpxbbbjbbbjbbbjbbbjgmp9op9rp;Kegrpxb;:FSb;:FSb;:FSb;:FSararp;Meaoaop;Meawaqawamp9op9rp;Kegrarp;Mep;Kep;Kep;Jep;Negwp;Mepxbbn0bbn0bbn0bbn0gqp;KepxFFbbFFbbFFbbFFbbp9oaoawp;Meaqp;Keczp:Rep9qgoarawp;Meaqp;KepxFFbbFFbbFFbbFFbbp9ogrpmwDKYqk8AExm35Ps8E8Fp9qpklzaiaDakp9oaoarpmbezHdiOAlvCXorQLp9qpklbkadaiav;8qbbkk:oDllue97euv978Jjjjjbc8W9Rhidnaec98GglTmbcbhvabhoinaiaopbbbgraoczfgwpbbbgDpmlvorxmPsCXQL358E8Fgqczp:Segkclp:RepklbaopxbbjZbbjZbbjZbbjZpx;Zl81Z;Zl81Z;Zl81Z;Zl81Zakpxibbbibbbibbbibbbp9qp;6ep;NegkaraDpmbediwDqkzHOAKY8AEgrczp:Reczp:Sep;6ep;MegDaDp;Meakarczp:Sep;6ep;Megxaxp;Meakaqczp:Reczp:Sep;6ep;Megqaqp;Mep;Kep;Kep;Lepxbbbbbbbbbbbbbbbbp:4ep;Jepxb;:FSb;:FSb;:FSb;:FSgkp;Mepxbbn0bbn0bbn0bbn0grp;KepxFFbbFFbbFFbbFFbbgmp9oaxakp;Mearp;Keczp:Rep9qgxaDakp;Mearp;Keamp9oaqakp;Mearp;Keczp:Rep9qgkpmbezHdiOAlvCXorQLgrp5baipblbpEb:T:j83ibaocwfarp5eaipblbpEe:T:j83ibawaxakpmwDKYqk8AExm35Ps8E8Fgkp5baipblbpEd:T:j83ibaocKfakp5eaipblbpEi:T:j83ibaocafhoavclfgval6mbkkdnalaeSmbaiczfpxbbbbbbbbbbbbbbbbgkpklbaiakpklbaiabalcitfgoaeciGgvcitgw;8qbbdnavTmbaiaipblbgraipblzgDpmlvorxmPsCXQL358E8Fgqczp:Segkclp:RepklaaipxbbjZbbjZbbjZbbjZpx;Zl81Z;Zl81Z;Zl81Z;Zl81Zakpxibbbibbbibbbibbbp9qp;6ep;NegkaraDpmbediwDqkzHOAKY8AEgrczp:Reczp:Sep;6ep;MegDaDp;Meakarczp:Sep;6ep;Megxaxp;Meakaqczp:Reczp:Sep;6ep;Megqaqp;Mep;Kep;Kep;Lepxbbbbbbbbbbbbbbbbp:4ep;Jepxb;:FSb;:FSb;:FSb;:FSgkp;Mepxbbn0bbn0bbn0bbn0grp;KepxFFbbFFbbFFbbFFbbgmp9oaxakp;Mearp;Keczp:Rep9qgxaDakp;Mearp;Keamp9oaqakp;Mearp;Keczp:Rep9qgkpmbezHdiOAlvCXorQLgrp5baipblapEb:T:j83ibaiarp5eaipblapEe:T:j83iwaiaxakpmwDKYqk8AExm35Ps8E8Fgkp5baipblapEd:T:j83izaiakp5eaipblapEi:T:j83iKkaoaiaw;8qbbkk;uddiue978Jjjjjbc;ab9Rhidnadcd4ae2glc98GgvTmbcbheabhdinadadpbbbgocwp:Recwp:Sep;6eaocep:SepxbbjFbbjFbbjFbbjFp9opxbbjZbbjZbbjZbbjZp:Uep;Mepkbbadczfhdaeclfgeav6mbkkdnavalSmbaic8WfpxbbbbbbbbbbbbbbbbgopklbaicafaopklbaiczfaopklbaiaopklbaiabavcdtfgdalciGgecdtgv;8qbbdnaeTmbaiaipblbgocwp:Recwp:Sep;6eaocep:SepxbbjFbbjFbbjFbbjFp9opxbbjZbbjZbbjZbbjZp:Uep;Mepklbkadaiav;8qbbkk9teiucbcbydj1jjbgeabcifc98GfgbBdj1jjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaikkkebcjwklz:Dbb",a=new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,3,2,0,0,5,3,1,0,1,12,1,0,10,22,2,12,0,65,0,65,0,65,0,252,10,0,0,11,7,0,65,0,253,15,26,11]),s=new Uint8Array([32,0,65,2,1,106,34,33,3,128,11,4,13,64,6,253,10,7,15,116,127,5,8,12,40,16,19,54,20,9,27,255,113,17,42,67,24,23,146,148,18,14,22,45,70,69,56,114,101,21,25,63,75,136,108,28,118,29,73,115]);if(typeof WebAssembly!="object")return{supported:!1};var r=WebAssembly.validate(a)?o(t):o(e),n,i=WebAssembly.instantiate(r,{}).then(function(g){n=g.instance,n.exports.__wasm_call_ctors()});function o(g){for(var y=new Uint8Array(g.length),m=0;m<g.length;++m){var v=g.charCodeAt(m);y[m]=v>96?v-97:v>64?v-39:v+4}for(var E=0,m=0;m<g.length;++m)y[E++]=y[m]<60?s[y[m]]:(y[m]-60)*64+y[++m];return y.buffer.slice(0,E)}function c(g,y,m,v,E,S,A){var T=g.exports.sbrk,_=v+3&-4,R=T(_*E),N=T(S.length),B=new Uint8Array(g.exports.memory.buffer);B.set(S,N);var F=y(R,v,E,N,S.length);if(F==0&&A&&A(R,_,E),m.set(B.subarray(R,R+v*E)),T(R-T(0)),F!=0)throw new Error("Malformed buffer data: "+F)}var l={NONE:"",OCTAHEDRAL:"meshopt_decodeFilterOct",QUATERNION:"meshopt_decodeFilterQuat",EXPONENTIAL:"meshopt_decodeFilterExp"},f={ATTRIBUTES:"meshopt_decodeVertexBuffer",TRIANGLES:"meshopt_decodeIndexBuffer",INDICES:"meshopt_decodeIndexSequence"},u=[],p=0;function b(g){var y={object:new Worker(g),pending:0,requests:{}};return y.object.onmessage=function(m){var v=m.data;y.pending-=v.count,y.requests[v.id][v.action](v.value),delete y.requests[v.id]},y}function h(g){for(var y="self.ready = WebAssembly.instantiate(new Uint8Array(["+new Uint8Array(r)+"]), {}).then(function(result) { result.instance.exports.__wasm_call_ctors(); return result.instance; });self.onmessage = "+x.name+";"+c.toString()+x.toString(),m=new Blob([y],{type:"text/javascript"}),v=URL.createObjectURL(m),E=u.length;E<g;++E)u[E]=b(v);for(var E=g;E<u.length;++E)u[E].object.postMessage({});u.length=g,URL.revokeObjectURL(v)}function d(g,y,m,v,E){for(var S=u[0],A=1;A<u.length;++A)u[A].pending<S.pending&&(S=u[A]);return new Promise(function(T,_){var R=new Uint8Array(m),N=++p;S.pending+=g,S.requests[N]={resolve:T,reject:_},S.object.postMessage({id:N,count:g,size:y,source:R,mode:v,filter:E},[R.buffer])})}function x(g){var y=g.data;if(!y.id)return self.close();self.ready.then(function(m){try{var v=new Uint8Array(y.count*y.size);c(m,m.exports[y.mode],v,y.count,y.size,y.source,m.exports[y.filter]),self.postMessage({id:y.id,count:y.count,action:"resolve",value:v},[v.buffer])}catch(E){self.postMessage({id:y.id,count:y.count,action:"reject",value:E})}})}return{ready:i,supported:!0,useWorkers:function(g){h(g)},decodeVertexBuffer:function(g,y,m,v,E){c(n,n.exports.meshopt_decodeVertexBuffer,g,y,m,v,n.exports[l[E]])},decodeIndexBuffer:function(g,y,m,v){c(n,n.exports.meshopt_decodeIndexBuffer,g,y,m,v)},decodeIndexSequence:function(g,y,m,v){c(n,n.exports.meshopt_decodeIndexSequence,g,y,m,v)},decodeGltfBuffer:function(g,y,m,v,E,S){c(n,n.exports[f[E]],g,y,m,v,n.exports[l[S]])},decodeGltfBufferAsync:function(g,y,m,v,E){return u.length>0?d(g,y,m,f[v],l[E]):i.then(function(){var S=new Uint8Array(g*y);return c(n,n.exports[f[v]],S,g,y,m,n.exports[l[E]]),S})}}})();var uS=(function(){var e="b9H79Tebbbetm9Geueu9Geub9Gbb9Gsuuuuuuuuuuuu99uueu9Gvuuuuub9Gruuuuuuub9Gvuuuuue999Gvuuuuueu9Gquuuuuuu99uueu9Gwuuuuuu99ueu9Giuuue999Gluuuueu9GiuuueuiOHdilvorlwiDqkbxxbelve9Weiiviebeoweuec:G:Pdkr:Tewo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bbz9TW79O9V9Wt9F79P9T9W29P9M95br8E9TW79O9V9Wt9F79P9T9W29P9M959x9Pt9OcttV9P9I91tW7bwQ9TW79O9V9Wt9F79P9T9W29P9M959q9V9P9Ut7bDX9TW79O9V9Wt9F79P9T9W29P9M959t9J9H2Wbqa9TW79O9V9Wt9F9V9Wt9P9T9P96W9wWVtW94SWt9J9O9sW9T9H9Wbkl79IV9RbxDwebcekdzsq;B:xeHdbkM9Hi8Au8A99Au8Jjjjjbc;W;qb9Rgs8Kjjjjbcbhzascxfcbc;Kbz:ojjjb8AdnabaeSmbabaeadcdtz:njjjb8AkdndnamcdGmbascxfhHcbhOxekasalcrfci4gecbyd:m:jjjbHjjjjbbgABdxasceBd2aAcbaez:ojjjbhCcbhlcbhednadTmbcbhlabheadhAinaCaeydbgXci4fgQaQRbbgQceaXcrGgXtV86bbaQcu7aX4ceGalfhlaeclfheaAcufgAmbkcualcdtalcFFFFi0EhekascCfhHasaecbyd:m:jjjbHjjjjbbgOBdzascdBd2alcd4alfhXcehAinaAgecethAaeaX6mbkcdhzcbhLascuaecdtgAaecFFFFi0Ecbyd:m:jjjbHjjjjbbgXBdCasciBd2aXcFeaAz:ojjjbhKdnadTmbaecufhYcbh8AindndnaKabaLcdtfgEydbgQc:v;t;h;Ev2aYGgXcdtfgCydbgAcuSmbceheinaOaAcdtfydbaQSmdaXaefhAaecefheaKaAaYGgXcdtfgCydbgAcu9hmbkkaOa8AcdtfaQBdbaCa8ABdba8AhAa8Acefh8AkaEaABdbaLcefgLad9hmbkkaKcbyd1:jjjbH:bjjjbbascdBd2kcbh3aHcualcefgecdtaecFFFFi0Ecbyd:m:jjjbHjjjjbbg5Bdbasa5BdlasazceVgeBd2ascxfaecdtfcuadcitadcFFFFe0Ecbyd:m:jjjbHjjjjbbg8EBdbasa8EBdwasazcdfgeBd2asclfabadalcbz:cjjjbascxfaecdtfcualcdtgealcFFFFi0Eg8Fcbyd:m:jjjbHjjjjbbgABdbasazcifgXBd2ascxfaXcdtfa8Fcbyd:m:jjjbHjjjjbbgaBdbasazclVBd2aAaaaialavaOascxfz:djjjbalcbyd:m:jjjbHjjjjbbhCascxfasyd2ghcdtfaCBdbasahcefgXBd2ascxfaXcdtfa8Fcbyd:m:jjjbHjjjjbbgXBdbasahcdfgQBd2ascxfaQcdtfa8Fcbyd:m:jjjbHjjjjbbgQBdbasahcifggBd2aXcFeaez:ojjjbh8JaQcFeaez:ojjjbh8KdnalTmba8Ecwfh8Lindna5a3gQcefg3cdtfydbgKa5aQcdtgefydbgXSmbaKaX9Rhza8EaXcitfhHa8Kaefh8Ma8JaefhEcbhYindndnaHaYcitfydbg8AaQ9hmbaEaQBdba8MaQBdbxekdna5a8Acdtg8NfgeclfydbgXaeydbgeSmba8EaecitgKfydbaQSmeaXae9Rhyaecu7aXfhLa8LaKfhXcbheinaLaeSmeaecefheaXydbhKaXcwfhXaKaQ9hmbkaeay6meka8Ka8NfgeaQa8AaeydbcuSEBdbaEa8AaQaEydbcuSEBdbkaYcefgYaz9hmbkka3al9hmbkaAhXaahQa8KhKa8JhYcbheindndnaeaXydbg8A9hmbdnaeaQydbg8A9hmbaYydbh8AdnaKydbgLcu9hmba8Acu9hmbaCaefcb86bbxikaCaefhEdnaeaLSmbaea8ASmbaEce86bbxikaEcl86bbxdkdnaeaaa8AcdtgLfydb9hmbdnaKydbgEcuSmbaeaESmbaYydbgzcuSmbaeazSmba8KaLfydbgHcuSmbaHa8ASmba8JaLfydbgLcuSmbaLa8ASmbdnaAaEcdtfydbg8AaAaLcdtfydb9hmba8AaAazcdtfydbgLSmbaLaAaHcdtfydb9hmbaCaefcd86bbxlkaCaefcl86bbxikaCaefcl86bbxdkaCaefcl86bbxekaCaefaCa8AfRbb86bbkaXclfhXaQclfhQaKclfhKaYclfhYalaecefge9hmbkdnaqTmbdndnaOTmbaOheaAhXalhQindnaqaeydbfRbbTmbaCaXydbfcl86bbkaeclfheaXclfhXaQcufgQmbxdkkaAhealhXindnaqRbbTmbaCaeydbfcl86bbkaqcefhqaeclfheaXcufgXmbkkaAhealhQaChXindnaCaeydbfRbbcl9hmbaXcl86bbkaeclfheaXcefhXaQcufgQmbkkamceGTmbaChealhXindnaeRbbce9hmbaecl86bbkaecefheaXcufgXmbkkascxfagcdtfcualcx2alc;v:Q;v:Qe0Ecbyd:m:jjjbHjjjjbbg3BdbasahclfgHBd2a3aialavaOz:ejjjbh8PdndnaDmbcbhgcbh8Lxekcbh8LawhecbhXindnaeIdbJbbbb9ETmbasc;Wbfa8LcdtfaXBdba8Lcefh8LkaeclfheaDaXcefgX9hmbkascxfaHcdtfcua8Lal2gecdtaecFFFFi0Ecbyd:m:jjjbHjjjjbbggBdbasahcvfgHBd2alTmba8LTmbarcd4hEdnaOTmba8Lcdthzcbh8AaghLinaoaOa8AcdtfydbaE2cdtfhYasc;WbfheaLhXa8LhQinaXaYaeydbcdtgKfIdbawaKfIdbNUdbaeclfheaXclfhXaQcufgQmbkaLazfhLa8Acefg8Aal9hmbxdkka8Lcdthzcbh8AaghLinaoa8AaE2cdtfhYasc;WbfheaLhXa8LhQinaXaYaeydbcdtgKfIdbawaKfIdbNUdbaeclfheaXclfhXaQcufgQmbkaLazfhLa8Acefg8Aal9hmbkkascxfaHcdtfcualc8S2gealc;D;O;f8U0EgQcbyd:m:jjjbHjjjjbbgXBdbasaHcefgKBd2aXcbaez:ojjjbhqdndndna8LTmbascxfaKcdtfaQcbyd:m:jjjbHjjjjbbgvBdbasaHcdfgXBd2avcbaez:ojjjb8AascxfaXcdtfcua8Lal2gecltgXaecFFFFb0Ecbyd:m:jjjbHjjjjbbgiBdbasaHcifBd2aicbaXz:ojjjb8AadmexdkcbhvcbhiadTmekcbhYabhXindna3aXclfydbg8Acx2fgeIdba3aXydbgLcx2fgQIdbgI:tg8Ra3aXcwfydbgEcx2fgKIdlaQIdlg8S:tgRNaKIdbaI:tg8UaeIdla8S:tg8VN:tg8Wa8WNa8VaKIdwaQIdwg8X:tg8YNaRaeIdwa8X:tg8VN:tgRaRNa8Va8UNa8Ya8RN:tg8Ra8RNMM:rg8UJbbbb9ETmba8Wa8U:vh8Wa8Ra8U:vh8RaRa8U:vhRkaqaAaLcdtfydbc8S2fgeaRa8U:rg8UaRNNg8VaeIdbMUdbaea8Ra8Ua8RNg8ZNg8YaeIdlMUdlaea8Wa8Ua8WNg80Ng81aeIdwMUdwaea8ZaRNg8ZaeIdxMUdxaea80aRNgBaeIdzMUdzaea80a8RNg80aeIdCMUdCaeaRa8Ua8Wa8XNaRaINa8Sa8RNMM:mg8SNgINgRaeIdKMUdKaea8RaINg8RaeId3MUd3aea8WaINg8WaeIdaMUdaaeaIa8SNgIaeId8KMUd8Kaea8UaeIdyMUdyaqaAa8Acdtfydbc8S2fgea8VaeIdbMUdbaea8YaeIdlMUdlaea81aeIdwMUdwaea8ZaeIdxMUdxaeaBaeIdzMUdzaea80aeIdCMUdCaeaRaeIdKMUdKaea8RaeId3MUd3aea8WaeIdaMUdaaeaIaeId8KMUd8Kaea8UaeIdyMUdyaqaAaEcdtfydbc8S2fgea8VaeIdbMUdbaea8YaeIdlMUdlaea81aeIdwMUdwaea8ZaeIdxMUdxaeaBaeIdzMUdzaea80aeIdCMUdCaeaRaeIdKMUdKaea8RaeId3MUd3aea8WaeIdaMUdaaeaIaeId8KMUd8Kaea8UaeIdyMUdyaXcxfhXaYcifgYad6mbkcbhzabhLinabazcdtfh8AcbhXinaCa8AaXc;a1jjbfydbcdtfydbgQfRbbhedndnaCaLaXfydbgKfRbbgYc99fcFeGcpe0mbaec99fcFeGc;:e6mekdnaYcufcFeGce0mba8JaKcdtfydbaQ9hmekdnaecufcFeGce0mba8KaQcdtfydbaK9hmekdnaYcv2aefc:G1jjbfRbbTmbaAaQcdtfydbaAaKcdtfydb0mekJbbacJbbacJbbjZaecFeGceSEaYceSEh80dna3a8AaXc;e1jjbfydbcdtfydbcx2fgeIdwa3aKcx2fgYIdwg8S:tg8Wa3aQcx2fgEIdwa8S:tgRaRNaEIdbaYIdbg8X:tg8Ra8RNaEIdlaYIdlg8V:tg8Ua8UNMMgINa8WaRNaeIdba8X:tg81a8RNa8UaeIdla8V:tg8ZNMMg8YaRN:tg8Wa8WNa81aINa8Ya8RN:tgRaRNa8ZaINa8Ya8UN:tg8Ra8RNMM:rg8UJbbbb9ETmba8Wa8U:vh8Wa8Ra8U:vh8RaRa8U:vhRkaqaAaKcdtfydbc8S2fgeaRa80aI:rNg8UaRNNg8YaeIdbMUdbaea8Ra8Ua8RNg80Ng81aeIdlMUdlaea8Wa8Ua8WNgINg8ZaeIdwMUdwaea80aRNg80aeIdxMUdxaeaIaRNgBaeIdzMUdzaeaIa8RNg83aeIdCMUdCaeaRa8Ua8Wa8SNaRa8XNa8Va8RNMM:mg8SNgINgRaeIdKMUdKaea8RaINg8RaeId3MUd3aea8WaINg8WaeIdaMUdaaeaIa8SNgIaeId8KMUd8Kaea8UaeIdyMUdyaqaAaQcdtfydbc8S2fgea8YaeIdbMUdbaea81aeIdlMUdlaea8ZaeIdwMUdwaea80aeIdxMUdxaeaBaeIdzMUdzaea83aeIdCMUdCaeaRaeIdKMUdKaea8RaeId3MUd3aea8WaeIdaMUdaaeaIaeId8KMUd8Kaea8UaeIdyMUdykaXclfgXcx9hmbkaLcxfhLazcifgzad6mbka8LTmbcbhLinJbbbbh8Xa3abaLcdtfgeclfydbgEcx2fgXIdwa3aeydbgzcx2fgQIdwg8Z:tg8Ra8RNaXIdbaQIdbgB:tg8Wa8WNaXIdlaQIdlg83:tg8Ua8UNMMg80a3aecwfydbgHcx2fgeIdwa8Z:tgINa8Ra8RaINa8WaeIdbaB:tg8SNa8UaeIdla83:tg8VNMMgRN:tJbbbbJbbjZa80aIaINa8Sa8SNa8Va8VNMMg81NaRaRN:tg8Y:va8YJbbbb9BEg8YNhUa81a8RNaIaRN:ta8YNh85a80a8VNa8UaRN:ta8YNh86a81a8UNa8VaRN:ta8YNh87a80a8SNa8WaRN:ta8YNh88a81a8WNa8SaRN:ta8YNh89a8Wa8VNa8Sa8UN:tgRaRNa8UaINa8Va8RN:tgRaRNa8Ra8SNaIa8WN:tgRaRNMM:rJbbbZNhRagaza8L2gwcdtfhXagaHa8L2g8NcdtfhQagaEa8L2g5cdtfhKa8Z:mh8:a83:mhZaB:mhncbhYa8Lh8AJbbbbh8VJbbbbh8YJbbbbh80Jbbbbh81Jbbbbh8ZJbbbbhBJbbbbh83JbbbbhcJbbbbh9cinasc;WbfaYfgecwfaRa85aKIdbaXIdbgI:tg8UNaUaQIdbaI:tg8SNMg8RNUdbaeclfaRa87a8UNa86a8SNMg8WNUdbaeaRa89a8UNa88a8SNMg8UNUdbaecxfaRa8:a8RNaZa8WNaIana8UNMMMgINUdbaRa8Ra8WNNa81Mh81aRa8Ra8UNNa8ZMh8ZaRa8Wa8UNNaBMhBaRaIaINNa8XMh8XaRa8RaINNa8VMh8VaRa8WaINNa8YMh8YaRa8UaINNa80Mh80aRa8Ra8RNNa83Mh83aRa8Wa8WNNacMhcaRa8Ua8UNNa9cMh9caXclfhXaKclfhKaQclfhQaYczfhYa8Acufg8Ambkavazc8S2fgea9caeIdbMUdbaeacaeIdlMUdlaea83aeIdwMUdwaeaBaeIdxMUdxaea8ZaeIdzMUdzaea81aeIdCMUdCaea80aeIdKMUdKaea8YaeId3MUd3aea8VaeIdaMUdaaea8XaeId8KMUd8KaeaRaeIdyMUdyavaEc8S2fgea9caeIdbMUdbaeacaeIdlMUdlaea83aeIdwMUdwaeaBaeIdxMUdxaea8ZaeIdzMUdzaea81aeIdCMUdCaea80aeIdKMUdKaea8YaeId3MUd3aea8VaeIdaMUdaaea8XaeId8KMUd8KaeaRaeIdyMUdyavaHc8S2fgea9caeIdbMUdbaeacaeIdlMUdlaea83aeIdwMUdwaeaBaeIdxMUdxaea8ZaeIdzMUdzaea81aeIdCMUdCaea80aeIdKMUdKaea8YaeId3MUd3aea8VaeIdaMUdaaea8XaeId8KMUd8KaeaRaeIdyMUdyaiawcltfh8AcbhXa8LhKina8AaXfgeasc;WbfaXfgQIdbaeIdbMUdbaeclfgYaQclfIdbaYIdbMUdbaecwfgYaQcwfIdbaYIdbMUdbaecxfgeaQcxfIdbaeIdbMUdbaXczfhXaKcufgKmbkaia5cltfh8AcbhXa8LhKina8AaXfgeasc;WbfaXfgQIdbaeIdbMUdbaeclfgYaQclfIdbaYIdbMUdbaecwfgYaQcwfIdbaYIdbMUdbaecxfgeaQcxfIdbaeIdbMUdbaXczfhXaKcufgKmbkaia8Ncltfh8AcbhXa8LhKina8AaXfgeasc;WbfaXfgQIdbaeIdbMUdbaeclfgYaQclfIdbaYIdbMUdbaecwfgYaQcwfIdbaYIdbMUdbaecxfgeaQcxfIdbaeIdbMUdbaXczfhXaKcufgKmbkaLcifgLad6mbkkcbhQdndnamcwGgJmbJbbbbh8Vcbh9ecbhocbhhxekcbh9ea8Fcbyd:m:jjjbHjjjjbbhhascxfasyd2gecdtfahBdbasaecefgXBd2ascxfaXcdtfcuahalabadaAz:fjjjbgKcltaKcjjjjiGEcbyd:m:jjjbHjjjjbbgoBdbasaecdfBd2aoaKaha3alz:gjjjbJFFuuh8VaKTmbaoheaKhXinaeIdbgRa8Va8VaR9EEh8VaeclfheaXcufgXmbkaKh9ekasydlhTdnalTmbaTclfheaTydbhKaChXalhYcbhQincbaeydbg8AaK9RaXRbbcpeGEaQfhQaXcefhXaeclfhea8AhKaYcufgYmbkaQce4hQkcuadaQ9RcifgScx2aSc;v:Q;v:Qe0Ecbyd:m:jjjbHjjjjbbhDascxfasyd2g9hcdtfaDBdbasa9hcefgeBd2ascxfaecdtfcuaScdtaScFFFFi0Ecbyd:m:jjjbHjjjjbbgrBdbasa9hcdfgeBd2ascxfaecdtfa8Fcbyd:m:jjjbHjjjjbbgyBdbasa9hcifgeBd2ascxfaecdtfalcbyd:m:jjjbHjjjjbbg9iBdbasa9hclfg6Bd2axaxNa8PJbbjZamclGEgUaUN:vh9cJbbbbhcdnadak9nmbdnaSci6mba8Lclth9kaDcwfh0Jbbbbh83JbbbbhcinasclfabadalaAz:cjjjbabhzcbh8Ecbh8Finaba8FcdtfhHcbheindnaAazaefydbgQcdtgEfydbgYaAaHaec;q1jjbfydbcdtfydbgXcdtgwfydbg8ASmbaCaXfRbbgLcv2aCaQfRbbgKfc;G1jjbfRbbg5aKcv2aLfg8Nc;G1jjbfRbbg8MVcFeGTmbdna8AaY9nmba8Nc:G1jjbfRbbcFeGmekaKcufhYdnaKaL9hmbaYcFeGce0mba8JaEfydbaX9hmekdndnaKclSmbaLcl9hmekdnaYcFeGce0mba8JaEfydbaX9hmdkaLcufcFeGce0mba8KawfydbaQ9hmekaDa8Ecx2fgKaXaQa8McFeGgYEBdlaKaQaXaYEBdbaKaYa5Gcb9hBdwa8Ecefh8Ekaeclfgecx9hmbkdna8Fcifg8Fad9pmbazcxfhza8EcifaS9nmekka8ETmdcbhLinaqaAaDaLcx2fgKydbgYcdtgzfydbc8S2fgeIdwa3aKydlg8Acx2fgXIdwg8WNaeIdzaXIdbg8UNaeIdaMgRaRMMa8WNaeIdlaXIdlgINaeIdCa8WNaeId3MgRaRMMaINaeIdba8UNaeIdxaINaeIdKMgRaRMMa8UNaeId8KMMM:lhRJbbbbJbbjZaeIdyg8R:va8RJbbbb9BEh8RdndnaKydwgEmbJFFuuh8YxekJbbbbJbbjZaqaAa8Acdtfydbc8S2fgeIdyg8S:va8SJbbbb9BEaeIdwa3aYcx2fgXIdwg8SNaeIdzaXIdbg8XNaeIdaMg8Ya8YMMa8SNaeIdlaXIdlg8YNaeIdCa8SNaeId3Mg8Sa8SMMa8YNaeIdba8XNaeIdxa8YNaeIdKMg8Sa8SMMa8XNaeId8KMMM:lNh8Yka8RaRNh80dna8LTmbavaYc8S2fgQIdwa8WNaQIdza8UNaQIdaMgRaRMMa8WNaQIdlaINaQIdCa8WNaQId3MgRaRMMaINaQIdba8UNaQIdxaINaQIdKMgRaRMMa8UNaQId8KMMMhRaga8Aa8L2gHcdtfhXaiaYa8L2gwcltfheaQIdyh8Sa8LhQinaXIdbg8Ra8Ra8SNaecxfIdba8WaecwfIdbNa8UaeIdbNaIaeclfIdbNMMMg8Ra8RM:tNaRMhRaXclfhXaeczfheaQcufgQmbkdndnaEmbJbbbbh8Rxekava8Ac8S2fgQIdwa3aYcx2fgeIdwg8UNaQIdzaeIdbgINaQIdaMg8Ra8RMMa8UNaQIdlaeIdlg8SNaQIdCa8UNaQId3Mg8Ra8RMMa8SNaQIdbaINaQIdxa8SNaQIdKMg8Ra8RMMaINaQId8KMMMh8RagawcdtfhXaiaHcltfheaQIdyh8Xa8LhQinaXIdbg8Wa8Wa8XNaecxfIdba8UaecwfIdbNaIaeIdbNa8SaeclfIdbNMMMg8Wa8WM:tNa8RMh8RaXclfhXaeczfheaQcufgQmbka8R:lh8Rka80aR:lMh80a8Ya8RMh8YaCaYfRbbcd9hmbdna8Ka8Ja8Jazfydba8ASEaaazfydbgHcdtfydbgzcu9hmbaaa8AcdtfydbhzkavaHc8S2fgQIdwa3azcx2fgeIdwg8WNaQIdzaeIdbg8UNaQIdaMgRaRMMa8WNaQIdlaeIdlgINaQIdCa8WNaQId3MgRaRMMaINaQIdba8UNaQIdxaINaQIdKMgRaRMMa8UNaQId8KMMMhRagaza8L2gwcdtfhXaiaHa8L2g8NcltfheaQIdyh8Sa8LhQinaXIdbg8Ra8Ra8SNaecxfIdba8WaecwfIdbNa8UaeIdbNaIaeclfIdbNMMMg8Ra8RM:tNaRMhRaXclfhXaeczfheaQcufgQmbkdndnaEmbJbbbbh8Rxekavazc8S2fgQIdwa3aHcx2fgeIdwg8UNaQIdzaeIdbgINaQIdaMg8Ra8RMMa8UNaQIdlaeIdlg8SNaQIdCa8UNaQId3Mg8Ra8RMMa8SNaQIdbaINaQIdxa8SNaQIdKMg8Ra8RMMaINaQId8KMMMh8Raga8NcdtfhXaiawcltfheaQIdyh8Xa8LhQinaXIdbg8Wa8Wa8XNaecxfIdba8UaecwfIdbNaIaeIdbNa8SaeclfIdbNMMMg8Wa8WM:tNa8RMh8RaXclfhXaeczfheaQcufgQmbka8R:lh8Rka80aR:lMh80a8Ya8RMh8YkaKa80a8Ya80a8Y9FgeEUdwaKa8AaYaeaETVgeEBdlaKaYa8AaeEBdbaLcefgLa8E9hmbkasc;Wbfcbcj;qbz:ojjjb8Aa0hea8EhXinasc;WbfaeydbcA4cF8FGgQcFAaQcFA6EcdtfgQaQydbcefBdbaecxfheaXcufgXmbkcbhecbhXinasc;WbfaefgQydbhKaQaXBdbaKaXfhXaeclfgecj;qb9hmbkcbhea0hXinasc;WbfaXydbcA4cF8FGgQcFAaQcFA6EcdtfgQaQydbgQcefBdbaraQcdtfaeBdbaXcxfhXa8Eaecefge9hmbkadak9RgQci9Uh9mdnalTmbcbheayhXinaXaeBdbaXclfhXalaecefge9hmbkkcbh9na9icbalz:ojjjbh8FaQcO9Uh9oa9mce4h9pasydwh9qcbh8Mcbh5dninaDara5cdtfydbcx2fg8NIdwgRa9c9Emea8Ma9m9pmeJFFuuh8Rdna9pa8E9pmbaDara9pcdtfydbcx2fIdwJbb;aZNh8RkdnaRa8R9ETmbaRac9ETmba8Ma9o0mdkdna8FaAa8NydlgHcdtg9rfydbgKfg9sRbba8FaAa8Nydbgzcdtg9tfydbgefg9uRbbVmbaCazfRbbh9vdnaTaecdtfgXclfydbgQaXydbgXSmbaQaX9RhYa3aKcx2fhLa3aecx2fhEa9qaXcitfhecbhXcehwdnindnayaeydbcdtfydbgQaKSmbayaeclfydbcdtfydbg8AaKSmbaQa8ASmba3a8Acx2fg8AIdba3aQcx2fgQIdbg8W:tgRaEIdlaQIdlg8U:tg8XNaEIdba8W:tg8Ya8AIdla8U:tg8RN:tgIaRaLIdla8U:tg80NaLIdba8W:tg81a8RN:tg8UNa8RaEIdwaQIdwg8S:tg8ZNa8Xa8AIdwa8S:tg8WN:tg8Xa8RaLIdwa8S:tgBNa80a8WN:tg8RNa8Wa8YNa8ZaRN:tg8Sa8Wa81NaBaRN:tgRNMMaIaINa8Xa8XNa8Sa8SNMMa8Ua8UNa8Ra8RNaRaRNMMN:rJbbj8:N9FmdkaecwfheaXcefgXaY6hwaYaX9hmbkkawceGTmba9pcefh9pxekdndndndna9vc9:fPdebdkazheinayaecdtgefaHBdbaaaefydbgeaz9hmbxikkdna8Ka8Ja8Ja9tfydbaHSEaaa9tfydbgzcdtfydbgecu9hmbaaa9rfydbhekaya9tfaHBdbaehHkayazcdtfaHBdbka9uce86bba9sce86bba8NIdwgRacacaR9DEhca9ncefh9ncecda9vceSEa8Mfh8Mka5cefg5a8E9hmbkka9nTmddnalTmbcbh8AcbhEindnayaEcdtgefydbgQaESmbaAaQcdtfydbhzdnaEaAaefydb9hgHmbaqazc8S2fgeaqaEc8S2fgXIdbaeIdbMUdbaeaXIdlaeIdlMUdlaeaXIdwaeIdwMUdwaeaXIdxaeIdxMUdxaeaXIdzaeIdzMUdzaeaXIdCaeIdCMUdCaeaXIdKaeIdKMUdKaeaXId3aeId3MUd3aeaXIdaaeIdaMUdaaeaXId8KaeId8KMUd8KaeaXIdyaeIdyMUdyka8LTmbavaQc8S2fgeavaEc8S2gwfgXIdbaeIdbMUdbaeaXIdlaeIdlMUdlaeaXIdwaeIdwMUdwaeaXIdxaeIdxMUdxaeaXIdzaeIdzMUdzaeaXIdCaeIdCMUdCaeaXIdKaeIdKMUdKaeaXId3aeId3MUd3aeaXIdaaeIdaMUdaaeaXId8KaeId8KMUd8KaeaXIdyaeIdyMUdya9kaQ2hLaihXa8LhKinaXaLfgeaXa8AfgQIdbaeIdbMUdbaeclfgYaQclfIdbaYIdbMUdbaecwfgYaQcwfIdbaYIdbMUdbaecxfgeaQcxfIdbaeIdbMUdbaXczfhXaKcufgKmbkaHmbJbbbbJbbjZaqawfgeIdygR:vaRJbbbb9BEaeIdwa3azcx2fgXIdwgRNaeIdzaXIdbg8RNaeIdaMg8Wa8WMMaRNaeIdlaXIdlg8WNaeIdCaRNaeId3MgRaRMMa8WNaeIdba8RNaeIdxa8WNaeIdKMgRaRMMa8RNaeId8KMMM:lNgRa83a83aR9DEh83ka8Aa9kfh8AaEcefgEal9hmbkcbhXa8JheindnaeydbgQcuSmbdnaXayaQcdtgKfydbgQ9hmbcuhQa8JaKfydbgKcuSmbayaKcdtfydbhQkaeaQBdbkaeclfhealaXcefgX9hmbkcbhXa8KheindnaeydbgQcuSmbdnaXayaQcdtgKfydbgQ9hmbcuhQa8KaKfydbgKcuSmbayaKcdtfydbhQkaeaQBdbkaeclfhealaXcefgX9hmbkka83aca8LEh83cbhKabhecbhYindnayaeydbcdtfydbgXayaeclfydbcdtfydbgQSmbaXayaecwfydbcdtfydbg8ASmbaQa8ASmbabaKcdtfgLaXBdbaLcwfa8ABdbaLclfaQBdbaKcifhKkaecxfheaYcifgYad6mbkdndnaJTmbaKak9nmba8Va839FTmbcbhdabhecbhXindnaoahaeydbgQcdtfydbcdtfIdba839ETmbabadcdtfgYaQBdbaYclfaeclfydbBdbaYcwfaecwfydbBdbadcifhdkaecxfheaXcifgXaK6mbkJFFuuh8Va9eTmeaohea9ehXJFFuuhRinaeIdbg8RaRaRa8R9EEg8WaRa8Ra839EgQEhRa8Wa8VaQEh8VaeclfheaXcufgXmbxdkkaKhdkadak0mbxdkkasclfabadalaAz:cjjjbkdndnadak0mbadhXxekdnaJmbadhXxekdna8Va9c9FmbadhXxekina8VJbb;aZNgRa9caRa9c9DEh8WJbbbbhRdna9eTmbaohea9ehAinaeIdbg8RaRa8Ra8W9FEaRa8RaR9EEhRaeclfheaAcufgAmbkkcbhXabhecbhAindnaoahaeydbgQcdtfydbcdtfIdba8W9ETmbabaXcdtfgKaQBdbaKclfaeclfydbBdbaKcwfaecwfydbBdbaXcifhXkaecxfheaAcifgAad6mbkJFFuuh8Vdna9eTmbaohea9ehAJFFuuh8RinaeIdbg8Ua8Ra8Ra8U9EEgIa8Ra8Ua8W9EgQEh8RaIa8VaQEh8VaeclfheaAcufgAmbkkdnaXad9hmbadhXxdkaRacacaR9DEhcaXak9nmeaXhda8Va9c9FmbkkdnamcjjjjlGTmbaOmbaXTmbcbh8AabheinaCaeydbgKfRbbc3thLaecwfgEydbhAdndna8JaKcdtgHfydbaeclfgzydbgQSmbcbhYa8KaQcdtfydbaK9hmekcjjjj94hYkaeaLaYVaKVBdbaCaQfRbbc3thLdndna8JaQcdtfydbaASmbcbhYa8KaAcdtfydbaQ9hmekcjjjj94hYkazaLaYVaQVBdbaCaAfRbbc3thYdndna8JaAcdtfydbaKSmbcbhQa8KaHfydbaA9hmekcjjjj94hQkaEaYaQVaAVBdbaecxfhea8Acifg8AaX6mbkkdnaOTmbaXTmbaXheinabaOabydbcdtfydbBdbabclfhbaecufgembkkdnaPTmbaPaUac:rNUdbka9hcdtascxffcxfhednina6Tmeaeydbcbyd1:jjjbH:bjjjbbaec98fhea6cufh6xbkkasc;W;qbf8KjjjjbaXk;Yieouabydlhvabydbclfcbaicdtz:ojjjbhoadci9UhrdnadTmbdnalTmbaehwadhDinaoalawydbcdtfydbcdtfgqaqydbcefBdbawclfhwaDcufgDmbxdkkaehwadhDinaoawydbcdtfgqaqydbcefBdbawclfhwaDcufgDmbkkdnaiTmbcbhDaohwinawydbhqawaDBdbawclfhwaqaDfhDaicufgimbkkdnadci6mbinaecwfydbhwaeclfydbhDaeydbhidnalTmbalawcdtfydbhwalaDcdtfydbhDalaicdtfydbhikavaoaicdtfgqydbcitfaDBdbavaqydbcitfawBdlaqaqydbcefBdbavaoaDcdtfgqydbcitfawBdbavaqydbcitfaiBdlaqaqydbcefBdbavaoawcdtfgwydbcitfaiBdbavawydbcitfaDBdlawawydbcefBdbaecxfhearcufgrmbkkabydbcbBdbk:todDue99aicd4aifhrcehwinawgDcethwaDar6mbkcuaDcdtgraDcFFFFi0Ecbyd:m:jjjbHjjjjbbhwaoaoyd9GgqcefBd9GaoaqcdtfawBdbawcFearz:ojjjbhkdnaiTmbalcd4hlaDcufhxcbhminamhDdnavTmbavamcdtfydbhDkcbadaDal2cdtfgDydlgwawcjjjj94SEgwcH4aw7c:F:b:DD2cbaDydbgwawcjjjj94SEgwcH4aw7c;D;O:B8J27cbaDydwgDaDcjjjj94SEgDcH4aD7c:3F;N8N27axGhwamcdthPdndndnavTmbakawcdtfgrydbgDcuSmeadavaPfydbal2cdtfgsIdbhzcehqinaqhrdnadavaDcdtfydbal2cdtfgqIdbaz9CmbaqIdlasIdl9CmbaqIdwasIdw9BmlkarcefhqakawarfaxGgwcdtfgrydbgDcu9hmbxdkkakawcdtfgrydbgDcuSmbadamal2cdtfgsIdbhzcehqinaqhrdnadaDal2cdtfgqIdbaz9CmbaqIdlasIdl9CmbaqIdwasIdw9BmikarcefhqakawarfaxGgwcdtfgrydbgDcu9hmbkkaramBdbamhDkabaPfaDBdbamcefgmai9hmbkkakcbyd1:jjjbH:bjjjbbaoaoyd9GcufBd9GdnaeTmbaiTmbcbhDaehwinawaDBdbawclfhwaiaDcefgD9hmbkcbhDaehwindnaDabydbgrSmbawaearcdtfgrydbBdbaraDBdbkawclfhwabclfhbaiaDcefgD9hmbkkk;Qodvuv998Jjjjjbca9Rgvczfcwfcbyd11jjbBdbavcb8Pdj1jjb83izavcwfcbydN1jjbBdbavcb8Pd:m1jjb83ibdnadTmbaicd4hodnabmbdnalTmbcbhrinaealarcdtfydbao2cdtfhwcbhiinavczfaifgDawaifIdbgqaDIdbgkakaq9EEUdbavaifgDaqaDIdbgkakaq9DEUdbaiclfgicx9hmbkarcefgrad9hmbxikkaocdthrcbhwincbhiinavczfaifgDaeaifIdbgqaDIdbgkakaq9EEUdbavaifgDaqaDIdbgkakaq9DEUdbaiclfgicx9hmbkaearfheawcefgwad9hmbxdkkdnalTmbcbhrinabarcx2fgiaealarcdtfydbao2cdtfgwIdbUdbaiawIdlUdlaiawIdwUdwcbhiinavczfaifgDawaifIdbgqaDIdbgkakaq9EEUdbavaifgDaqaDIdbgkakaq9DEUdbaiclfgicx9hmbkarcefgrad9hmbxdkkaocdthlcbhraehwinabarcx2fgiaearao2cdtfgDIdbUdbaiaDIdlUdlaiaDIdwUdwcbhiinavczfaifgDawaifIdbgqaDIdbgkakaq9EEUdbavaifgDaqaDIdbgkakaq9DEUdbaiclfgicx9hmbkawalfhwarcefgrad9hmbkkJbbbbavIdbavIdzgk:tgqaqJbbbb9DEgqavIdlavIdCgx:tgmamaq9DEgqavIdwavIdKgm:tgPaPaq9DEhPdnabTmbadTmbJbbbbJbbjZaP:vaPJbbbb9BEhqinabaqabIdbak:tNUdbabclfgvaqavIdbax:tNUdbabcwfgvaqavIdbam:tNUdbabcxfhbadcufgdmbkkaPk:ZlewudnaeTmbcbhvabhoinaoavBdbaoclfhoaeavcefgv9hmbkkdnaiTmbcbhrinadarcdtfhwcbhDinalawaDcdtgvc;a1jjbfydbcdtfydbcdtfydbhodnabalawavfydbcdtfydbgqcdtfgkydbgvaqSmbinakabavgqcdtfgxydbgvBdbaxhkaqav9hmbkkdnabaocdtfgkydbgvaoSmbinakabavgocdtfgxydbgvBdbaxhkaoav9hmbkkdnaqaoSmbabaqaoaqao0Ecdtfaqaoaqao6EBdbkaDcefgDci9hmbkarcifgrai6mbkkdnaembcbskcbhxindnalaxcdtgvfydbax9hmbaxhodnabavfgDydbgvaxSmbaDhqinaqabavgocdtfgkydbgvBdbakhqaoav9hmbkkaDaoBdbkaxcefgxae9hmbkcbhvabhocbhkindndnavalydbgq9hmbdnavaoydbgq9hmbaoakBdbakcefhkxdkaoabaqcdtfydbBdbxekaoabaqcdtfydbBdbkaoclfhoalclfhlaeavcefgv9hmbkakk;Jiilud99duabcbaecltz:ojjjbhvdnalTmbadhoaihralhwinarcwfIdbhDarclfIdbhqavaoydbcltfgkarIdbakIdbMUdbakclfgxaqaxIdbMUdbakcwfgxaDaxIdbMUdbakcxfgkakIdbJbbjZMUdbaoclfhoarcxfhrawcufgwmbkkdnaeTmbavhraehkinarcxfgoIdbhDaocbBdbararIdbJbbbbJbbjZaD:vaDJbbbb9BEgDNUdbarclfgoaDaoIdbNUdbarcwfgoaDaoIdbNUdbarczfhrakcufgkmbkkdnalTmbinavadydbcltfgrcxfgkaicwfIdbarcwfIdb:tgDaDNaiIdbarIdb:tgDaDNaiclfIdbarclfIdb:tgDaDNMMgDakIdbgqaqaD9DEUdbadclfhdaicxfhialcufglmbkkdnaeTmbavcxfhrinabarIdbUdbarczfhrabclfhbaecufgembkkk8MbabaeadaialavcbcbcbcbcbaoarawaDz:bjjjbk8MbabaeadaialavaoarawaDaqakaxamaPz:bjjjbk:DCoDud99rue99iul998Jjjjjbc;Wb9Rgw8KjjjjbdndnarmbcbhDxekawcxfcbc;Kbz:ojjjb8Aawcuadcx2adc;v:Q;v:Qe0Ecbyd:m:jjjbHjjjjbbgqBdxawceBd2aqaeadaicbz:ejjjb8AawcuadcdtadcFFFFi0Egkcbyd:m:jjjbHjjjjbbgxBdzawcdBd2adcd4adfhmceheinaegicetheaiam6mbkcbhPawcuaicdtgsaicFFFFi0Ecbyd:m:jjjbHjjjjbbgzBdCawciBd2dndnar:ZgH:rJbbbZMgO:lJbbb9p9DTmbaO:Ohexekcjjjj94hekaicufhAc:bwhmcbhCadhXcbhQinaChLaeamgKcufaeaK9iEaPgDcefaeaD9kEhYdndnadTmbaYcuf:YhOaqhiaxheadhmindndnaiIdbaONJbbbZMg8A:lJbbb9p9DTmba8A:OhCxekcjjjj94hCkaCcCthCdndnaiclfIdbaONJbbbZMg8A:lJbbb9p9DTmba8A:OhExekcjjjj94hEkaEcqtaCVhCdndnaicwfIdbaONJbbbZMg8A:lJbbb9p9DTmba8A:OhExekcjjjj94hEkaeaCaEVBdbaicxfhiaeclfheamcufgmmbkazcFeasz:ojjjbh3cbh5cbhPindna3axaPcdtfydbgCcm4aC7c:v;t;h;Ev2gics4ai7aAGgmcdtfgEydbgecuSmbaeaCSmbcehiina3amaifaAGgmcdtfgEydbgecuSmeaicefhiaeaC9hmbkkaEaCBdba5aecuSfh5aPcefgPad9hmbxdkkazcFeasz:ojjjb8Acbh5kaDaYa5ar0giEhPaLa5aiEhCdna5arSmbaYaKaiEgmaP9Rcd9imbdndnaQcl0mbdnaX:ZgOaL:Zg8A:taY:Yg8EaD:Y:tg8Fa8EaK:Y:tgaa5:ZghaH:tNNNaOaH:taaNa8Aah:tNa8AaH:ta8FNahaO:tNM:va8EMJbbbZMgO:lJbbb9p9DTmbaO:Ohexdkcjjjj94hexekaPamfcd9Theka5aXaiEhXaQcefgQcs9hmekkdndnaCmbcihicbhDxekcbhiawakcbyd:m:jjjbHjjjjbbg5BdKawclBd2aPcuf:Yh8AdndnadTmbaqhiaxheadhmindndnaiIdba8ANJbbbZMgO:lJbbb9p9DTmbaO:OhCxekcjjjj94hCkaCcCthCdndnaiclfIdba8ANJbbbZMgO:lJbbb9p9DTmbaO:OhExekcjjjj94hEkaEcqtaCVhCdndnaicwfIdba8ANJbbbZMgO:lJbbb9p9DTmbaO:OhExekcjjjj94hEkaeaCaEVBdbaicxfhiaeclfheamcufgmmbkazcFeasz:ojjjbh3cbhDcbhYindndndna3axaYcdtgKfydbgCcm4aC7c:v;t;h;Ev2gics4ai7aAGgmcdtfgEydbgecuSmbcehiinaxaecdtgefydbaCSmdamaifheaicefhia3aeaAGgmcdtfgEydbgecu9hmbkkaEaYBdbaDhiaDcefhDxeka5aefydbhika5aKfaiBdbaYcefgYad9hmbkcuaDc32giaDc;j:KM;jb0EhexekazcFeasz:ojjjb8AcbhDcbhekawaecbyd:m:jjjbHjjjjbbgeBd3awcvBd2aecbaiz:ojjjbhEavcd4hKdnadTmbdnalTmbaKcdth3a5hCaqhealhmadhAinaEaCydbc32fgiaeIdbaiIdbMUdbaiaeclfIdbaiIdlMUdlaiaecwfIdbaiIdwMUdwaiamIdbaiIdxMUdxaiamclfIdbaiIdzMUdzaiamcwfIdbaiIdCMUdCaiaiIdKJbbjZMUdKaCclfhCaecxfheama3fhmaAcufgAmbxdkka5hmaqheadhCinaEamydbc32fgiaeIdbaiIdbMUdbaiaeclfIdbaiIdlMUdlaiaecwfIdbaiIdwMUdwaiaiIdxJbbbbMUdxaiaiIdzJbbbbMUdzaiaiIdCJbbbbMUdCaiaiIdKJbbjZMUdKamclfhmaecxfheaCcufgCmbkkdnaDTmbaEhiaDheinaiaiIdbJbbbbJbbjZaicKfIdbgO:vaOJbbbb9BEgONUdbaiclfgmaOamIdbNUdbaicwfgmaOamIdbNUdbaicxfgmaOamIdbNUdbaiczfgmaOamIdbNUdbaicCfgmaOamIdbNUdbaic3fhiaecufgembkkcbhCawcuaDcdtgYaDcFFFFi0Egicbyd:m:jjjbHjjjjbbgeBdaawcoBd2awaicbyd:m:jjjbHjjjjbbg3Bd8KaecFeaYz:ojjjbhxdnadTmbJbbjZJbbjZa8A:vaPceSEaoNgOaONh8AaKcdthPalheina8Aaec;81jjbalEgmIdwaEa5ydbgAc32fgiIdC:tgOaONamIdbaiIdx:tgOaONamIdlaiIdz:tgOaONMMNaqcwfIdbaiIdw:tgOaONaqIdbaiIdb:tgOaONaqclfIdbaiIdl:tgOaONMMMhOdndnaxaAcdtgifgmydbcuSmba3aifIdbaO9ETmekamaCBdba3aifaOUdbka5clfh5aqcxfhqaeaPfheadaCcefgC9hmbkkabaxaYz:njjjb8AcrhikaicdthiinaiTmeaic98fgiawcxffydbcbyd1:jjjbH:bjjjbbxbkkawc;Wbf8KjjjjbaDk:Ydidui99ducbhi8Jjjjjbca9Rglczfcwfcbyd11jjbBdbalcb8Pdj1jjb83izalcwfcbydN1jjbBdbalcb8Pd:m1jjb83ibdndnaembJbbjFhvJbbjFhoJbbjFhrxekadcd4cdthwincbhdinalczfadfgDabadfIdbgvaDIdbgoaoav9EEUdbaladfgDavaDIdbgoaoav9DEUdbadclfgdcx9hmbkabawfhbaicefgiae9hmbkalIdwalIdK:thralIdlalIdC:thoalIdbalIdz:thvkJbbbbavavJbbbb9DEgvaoaoav9DEgvararav9DEk9DeeuabcFeaicdtz:ojjjbhlcbhbdnadTmbindnalaeydbcdtfgiydbcu9hmbaiabBdbabcefhbkaeclfheadcufgdmbkkabk9teiucbcbyd:q:jjjbgeabcifc98GfgbBd:q:jjjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik;teeeudndnaeabVciGTmbabhixekdndnadcz9pmbabhixekabhiinaiaeydbBdbaiaeydlBdlaiaeydwBdwaiaeydxBdxaeczfheaiczfhiadc9Wfgdcs0mbkkadcl6mbinaiaeydbBdbaeclfheaiclfhiadc98fgdci0mbkkdnadTmbinaiaeRbb86bbaicefhiaecefheadcufgdmbkkabk:3eedudndnabciGTmbabhixekaecFeGc:b:c:ew2hldndnadcz9pmbabhixekabhiinaialBdxaialBdwaialBdlaialBdbaiczfhiadc9Wfgdcs0mbkkadcl6mbinaialBdbaiclfhiadc98fgdci0mbkkdnadTmbinaiae86bbaicefhiadcufgdmbkkabk9teiucbcbyd:q:jjjbgeabcrfc94GfgbBd:q:jjjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik9:eiuZbhedndncbyd:q:jjjbgdaecztgi9nmbcuheadai9RcFFifcz4nbcuSmekadhekcbabae9Rcifc98Gcbyd:q:jjjbfgdBd:q:jjjbdnadZbcztge9nmbadae9RcFFifcz4nb8Akkk:Iedbcjwk1eFFuuFFuuFFuuFFuFFFuFFFuFbbbbbbbbeeebeebebbeeebebbbbbebebbbbbbbbbebbbdbbbbbbbebbbebbbdbbbbbbbbbbbeeeeebebbebbebebbbeebbbbbbbbbbbbbbbbbbbbbc1Dkxebbbdbbb:GNbb",t=new Uint8Array([32,0,65,2,1,106,34,33,3,128,11,4,13,64,6,253,10,7,15,116,127,5,8,12,40,16,19,54,20,9,27,255,113,17,42,67,24,23,146,148,18,14,22,45,70,69,56,114,101,21,25,63,75,136,108,28,118,29,73,115]);if(typeof WebAssembly!="object")return{supported:!1};var a,s=WebAssembly.instantiate(r(e),{}).then(function(h){a=h.instance,a.exports.__wasm_call_ctors()});function r(h){for(var d=new Uint8Array(h.length),x=0;x<h.length;++x){var g=h.charCodeAt(x);d[x]=g>96?g-97:g>64?g-39:g+4}for(var y=0,x=0;x<h.length;++x)d[y++]=d[x]<60?t[d[x]]:(d[x]-60)*64+d[++x];return d.buffer.slice(0,y)}function n(h){if(!h)throw new Error("Assertion failed")}function i(h){return new Uint8Array(h.buffer,h.byteOffset,h.byteLength)}function o(h,d,x){var g=a.exports.sbrk,y=g(d.length*4),m=g(x*4),v=new Uint8Array(a.exports.memory.buffer),E=i(d);v.set(E,y);var S=h(m,y,d.length,x);v=new Uint8Array(a.exports.memory.buffer);var A=new Uint32Array(x);new Uint8Array(A.buffer).set(v.subarray(m,m+x*4)),E.set(v.subarray(y,y+d.length*4)),g(y-g(0));for(var T=0;T<d.length;++T)d[T]=A[d[T]];return[A,S]}function c(h){for(var d=0,x=0;x<h.length;++x){var g=h[x];d=d<g?g:d}return d}function l(h,d,x,g,y,m,v,E,S){var A=a.exports.sbrk,T=A(4),_=A(x*4),R=A(y*m),N=A(x*4),B=new Uint8Array(a.exports.memory.buffer);B.set(i(g),R),B.set(i(d),N);var F=h(_,N,x,R,y,m,v,E,S,T);B=new Uint8Array(a.exports.memory.buffer);var K=new Uint32Array(F);i(K).set(B.subarray(_,_+F*4));var $=new Float32Array(1);return i($).set(B.subarray(T,T+4)),A(T-A(0)),[K,$[0]]}function f(h,d,x,g,y,m,v,E,S,A,T,_,R){var N=a.exports.sbrk,B=N(4),F=N(x*4),K=N(y*m),$=N(y*E),re=N(S.length*4),de=N(x*4),Ke=A?N(y):0,be=new Uint8Array(a.exports.memory.buffer);be.set(i(g),K),be.set(i(v),$),be.set(i(S),re),be.set(i(d),de),A&&be.set(i(A),Ke);var Ve=h(F,de,x,K,y,m,$,E,re,S.length,Ke,T,_,R,B);be=new Uint8Array(a.exports.memory.buffer);var Ze=new Uint32Array(Ve);i(Ze).set(be.subarray(F,F+Ve*4));var _e=new Float32Array(1);return i(_e).set(be.subarray(B,B+4)),N(B-N(0)),[Ze,_e[0]]}function u(h,d,x,g){var y=a.exports.sbrk,m=y(x*g),v=new Uint8Array(a.exports.memory.buffer);v.set(i(d),m);var E=h(m,x,g);return y(m-y(0)),E}function p(h,d,x,g,y,m,v,E){var S=a.exports.sbrk,A=S(E*4),T=S(x*g),_=S(x*m),R=new Uint8Array(a.exports.memory.buffer);R.set(i(d),T),y&&R.set(i(y),_);var N=h(A,T,x,g,_,m,v,E);R=new Uint8Array(a.exports.memory.buffer);var B=new Uint32Array(N);return i(B).set(R.subarray(A,A+N*4)),S(A-S(0)),B}var b={LockBorder:1,Sparse:2,ErrorAbsolute:4,Prune:8,_InternalDebug:1<<30};return{ready:s,supported:!0,compactMesh:function(h){n(h instanceof Uint32Array||h instanceof Int32Array||h instanceof Uint16Array||h instanceof Int16Array),n(h.length%3==0);var d=h.BYTES_PER_ELEMENT==4?h:new Uint32Array(h);return o(a.exports.meshopt_optimizeVertexFetchRemap,d,c(h)+1)},simplify:function(h,d,x,g,y,m){n(h instanceof Uint32Array||h instanceof Int32Array||h instanceof Uint16Array||h instanceof Int16Array),n(h.length%3==0),n(d instanceof Float32Array),n(d.length%x==0),n(x>=3),n(g>=0&&g<=h.length),n(g%3==0),n(y>=0);for(var v=0,E=0;E<(m?m.length:0);++E)n(m[E]in b),v|=b[m[E]];var S=h.BYTES_PER_ELEMENT==4?h:new Uint32Array(h),A=l(a.exports.meshopt_simplify,S,h.length,d,d.length/x,x*4,g,y,v);return A[0]=h instanceof Uint32Array?A[0]:new h.constructor(A[0]),A},simplifyWithAttributes:function(h,d,x,g,y,m,v,E,S,A){n(h instanceof Uint32Array||h instanceof Int32Array||h instanceof Uint16Array||h instanceof Int16Array),n(h.length%3==0),n(d instanceof Float32Array),n(d.length%x==0),n(x>=3),n(g instanceof Float32Array),n(g.length%y==0),n(y>=0),n(v==null||v instanceof Uint8Array),n(v==null||v.length==d.length/x),n(E>=0&&E<=h.length),n(E%3==0),n(S>=0),n(Array.isArray(m)),n(y>=m.length),n(m.length<=32);for(var T=0;T<m.length;++T)n(m[T]>=0);for(var _=0,T=0;T<(A?A.length:0);++T)n(A[T]in b),_|=b[A[T]];var R=h.BYTES_PER_ELEMENT==4?h:new Uint32Array(h),N=f(a.exports.meshopt_simplifyWithAttributes,R,h.length,d,d.length/x,x*4,g,y*4,new Float32Array(m),v?new Uint8Array(v):null,E,S,_);return N[0]=h instanceof Uint32Array?N[0]:new h.constructor(N[0]),N},getScale:function(h,d){return n(h instanceof Float32Array),n(h.length%d==0),n(d>=3),u(a.exports.meshopt_simplifyScale,h,h.length/d,d*4)},simplifyPoints:function(h,d,x,g,y,m){return n(h instanceof Float32Array),n(h.length%d==0),n(d>=3),n(x>=0&&x<=h.length/d),g?(n(g instanceof Float32Array),n(g.length%y==0),n(y>=3),n(h.length/d==g.length/y),p(a.exports.meshopt_simplifyPoints,h,h.length/d,d*4,g,y*4,m,x)):p(a.exports.meshopt_simplifyPoints,h,h.length/d,d*4,void 0,0,0,x)}}})();var hS=(function(){var e="b9H79TebbbeVx9Geueu9Geub9Gbb9Giuuueu9Gmuuuuuuuuuuu9999eu9Gvuuuuueu9Gwuuuuuuuub9Gxuuuuuuuuuuuueu9Gkuuuuuuuuuu99eu9Gouuuuuub9Gruuuuuuub9GluuuubiOHdilvorwDqqkbiibeilve9Weiiviebeoweuec;G:Odkr:Yewo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bb8A9TW79O9V9Wt9F9I919P29K9nW79O2Wt79c9V919U9KbeX9TW79O9V9Wt9F9I919P29K9nW79O2Wt7bo39TW79O9V9Wt9F9J9V9T9W91tWJ2917tWV9c9V919U9K7br39TW79O9V9Wt9F9J9V9T9W91tW9nW79O2Wt9c9V919U9K7bDL9TW79O9V9Wt9F9V9Wt9P9T9P96W9nW79O2Wtbql79IV9RbkDwebcekdsPq;Q9BHdbkIbabaec9:fgefcufae9Ugeabci9Uadfcufad9Ugbaeab0Ek:w8KDPue99eux99dui99euo99iu8Jjjjjbc:WD9Rgm8KjjjjbdndnalmbcbhPxekamc:Cwfcbc;Kbz:njjjb8Adndnalcb9imbaoal9nmbamcuaocdtaocFFFFi0Egscbyd;y1jjbHjjjjbbgzBd:CwamceBd;8wamascbyd;y1jjbHjjjjbbgHBd:GwamcdBd;8wamcualcdtalcFFFFi0Ecbyd;y1jjbHjjjjbbgOBd:KwamciBd;8waihsalhAinazasydbcdtfcbBdbasclfhsaAcufgAmbkaihsalhAinazasydbcdtfgCaCydbcefBdbasclfhsaAcufgAmbkaihsalhCcbhXindnazasydbcdtgQfgAydbcb9imbaHaQfaXBdbaAaAydbgQcjjjj94VBdbaQaXfhXkasclfhsaCcufgCmbkalci9UhLdnalci6mbcbhsaihAinaAcwfydbhCaAclfydbhXaHaAydbcdtfgQaQydbgQcefBdbaOaQcdtfasBdbaHaXcdtfgXaXydbgXcefBdbaOaXcdtfasBdbaHaCcdtfgCaCydbgCcefBdbaOaCcdtfasBdbaAcxfhAaLascefgs9hmbkkaihsalhAindnazasydbcdtgCfgXydbgQcu9kmbaXaQcFFFFrGgQBdbaHaCfgCaCydbaQ9RBdbkasclfhsaAcufgAmbxdkkamcuaocdtgsaocFFFFi0EgAcbyd;y1jjbHjjjjbbgzBd:CwamceBd;8wamaAcbyd;y1jjbHjjjjbbgHBd:GwamcdBd;8wamcualcdtalcFFFFi0Ecbyd;y1jjbHjjjjbbgOBd:KwamciBd;8wazcbasz:njjjbhXalci9UhLaihsalhAinaXasydbcdtfgCaCydbcefBdbasclfhsaAcufgAmbkdnaoTmbcbhsaHhAaXhCaohQinaAasBdbaAclfhAaCydbasfhsaCclfhCaQcufgQmbkkdnalci6mbcbhsaihAinaAcwfydbhCaAclfydbhQaHaAydbcdtfgKaKydbgKcefBdbaOaKcdtfasBdbaHaQcdtfgQaQydbgQcefBdbaOaQcdtfasBdbaHaCcdtfgCaCydbgCcefBdbaOaCcdtfasBdbaAcxfhAaLascefgs9hmbkkaoTmbcbhsaohAinaHasfgCaCydbaXasfydb9RBdbasclfhsaAcufgAmbkkamaLcbyd;y1jjbHjjjjbbgsBd:OwamclBd;8wascbaLz:njjjbhYamcuaLcK2alcjjjjd0Ecbyd;y1jjbHjjjjbbg8ABd:SwamcvBd;8wJbbbbhEdnalci6g3mbarcd4hKaihAa8AhsaLhrJbbbbh5inavaAclfydbaK2cdtfgCIdlh8EavaAydbaK2cdtfgXIdlhEavaAcwfydbaK2cdtfgQIdlh8FaCIdwhaaXIdwhhaQIdwhgasaCIdbg8JaXIdbg8KMaQIdbg8LMJbbnn:vUdbasclfaXIdlaCIdlMaQIdlMJbbnn:vUdbaQIdwh8MaCIdwh8NaXIdwhyascxfa8EaE:tg8Eagah:tggNa8FaE:tg8Faaah:tgaN:tgEJbbbbJbbjZa8Ja8K:tg8Ja8FNa8La8K:tg8Ka8EN:tghahNaEaENaaa8KNaga8JN:tgEaENMM:rg8K:va8KJbbbb9BEg8ENUdbasczfaEa8ENUdbascCfaha8ENUdbascwfa8Maya8NMMJbbnn:vUdba5a8KMh5aAcxfhAascKfhsarcufgrmbka5aL:Z:vJbbbZNhEkamcuaLcdtalcFFFF970Ecbyd;y1jjbHjjjjbbgCBd:WwamcoBd;8waEaq:ZNhEdna3mbcbhsaChAinaAasBdbaAclfhAaLascefgs9hmbkkaE:rhhcuh8PamcuaLcltalcFFFFd0Ecbyd;y1jjbHjjjjbbgIBd:0wamcrBd;8wcbaIa8AaCaLz:djjjb8AJFFuuhyJFFuuh8RJFFuuh8Sdnalci6gXmbJFFuuh8Sa8AhsaLhAJFFuuh8RJFFuuhyinascwfIdbgEayayaE9EEhyasclfIdbgEa8Ra8RaE9EEh8RasIdbgEa8Sa8SaE9EEh8SascKfhsaAcufgAmbkkahJbbbZNhgamaocetgscuaocu9kEcbyd;y1jjbHjjjjbbgABd:4waAcFeasz:njjjbhCdnaXmbcbhAJFFuuhEa8Ahscuh8PinascwfIdbay:tghahNasIdba8S:tghahNasclfIdba8R:tghahNMM:rghaEa8PcuSahaE9DVgXEhEaAa8PaXEh8PascKfhsaLaAcefgA9hmbkkamczfcbcjwz:njjjb8Aamcwf9cb83ibam9cb83ibagaxNhRJbbjZak:th8Ncbh8UJbbbbh8VJbbbbh8WJbbbbh8XJbbbbh8YJbbbbh8ZJbbbbh80cbh81cbhPinJbbbbhEdna8UTmbJbbjZa8U:Z:vhEkJbbbbhhdna80a80Na8Ya8YNa8Za8ZNMMg8KJbbbb9BmbJbbjZa8K:r:vhhka8XaENh5a8WaENh8Fa8VaENhaa8PhQdndndndndna8UaPVTmbamydwgBTmea80ahNh8Ja8ZahNh8La8YahNh8Maeamydbcdtfh83cbh3JFFuuhEcvhXcuhQindnaza83a3cdtfydbcdtgsfydbgvTmbaOaHasfydbcdtfhAindndnaCaiaAydbgKcx2fgsclfydbgrcetf8Vebcs4aCasydbgLcetf8Vebcs4faCascwfydbglcetf8Vebcs4fgombcbhsxekcehsazaLcdtfydbgLceSmbcehsazarcdtfydbgrceSmbcehsazalcdtfydbglceSmbdnarcdSaLcdSfalcdSfcd6mbaocefhsxekaocdfhskdnasaX9kmba8AaKcK2fgLIdwa5:thhaLIdla8F:th8KaLIdbaa:th8EdndnakJbbbb9DTmba8E:lg8Ea8K:lg8Ka8Ea8K9EEg8Kah:lgha8Kah9EEag:vJbbjZMhhxekahahNa8Ea8ENa8Ka8KNMM:rag:va8NNJbbjZMJ9VO:d86JbbjZaLIdCa8JNaLIdxa8MNa8LaLIdzNMMakN:tghahJ9VO:d869DENhhkaKaQasaX6ahaE9DVgLEhQasaXaLEhXahaEaLEhEkaAclfhAavcufgvmbkka3cefg3aB9hmbkkaQcu9hmekama5Ud:ODama8FUd:KDamaaUd:GDamcuBd:qDamcFFF;7rBdjDaIcba8AaYamc:GDfakJbbbb9Damc:qDfamcjDfz:ejjjbamyd:qDhQdndnaxJbbbb9ETmba8UaD6mbaQcuSmeceh3amIdjDaR9EmixdkaQcu9hmekdna8UTmbdnamydlgza8Uci2fgsciGTmbadasfcba8Uazcu7fciGcefz:njjjb8AkabaPcltfgzam8Pib83dbazcwfamcwf8Pib83dbaPcefhPkc3hzinazc98Smvamc:Cwfazfydbcbyd;u1jjbH:bjjjbbazc98fhzxbkkcbh3a8Uaq9pmbamydwaCaiaQcx2fgsydbcetf8Vebcs4aCascwfydbcetf8Vebcs4faCasclfydbcetf8Vebcs4ffaw9nmekcbhscbhAdna81TmbcbhAamczfhXinamczfaAcdtfaXydbgLBdbaXclfhXaAaYaLfRbbTfhAa81cufg81mbkkamydwhlamydbhXam9cu83i:GDam9cu83i:ODam9cu83i:qDam9cu83i:yDaAc;8eaAclfc:bd6Eh81inamcjDfasfcFFF;7rBdbasclfgscz9hmbka81cdthBdnalTmbaeaXcdtfhocbhrindnazaoarcdtfydbcdtgsfydbgvTmbaOaHasfydbcdtfhAcuhLcuhsinazaiaAydbgKcx2fgXclfydbcdtfydbazaXydbcdtfydbfazaXcwfydbcdtfydbfgXasaXas6gXEhsaKaLaXEhLaAclfhAavcufgvmbkaLcuSmba8AaLcK2fgAIdway:tgEaENaAIdba8S:tgEaENaAIdla8R:tgEaENMM:rhEcbhAindndnasamc:qDfaAfgvydbgX6mbasaX9hmeaEamcjDfaAfIdb9FTmekavasBdbamc:GDfaAfaLBdbamcjDfaAfaEUdbxdkaAclfgAcz9hmbkkarcefgral9hmbkkamczfaBfhLcbhscbhAindnamc:GDfasfydbgXcuSmbaLaAcdtfaXBdbaAcefhAkasclfgscz9hmbkaAa81fg81TmbJFFuuhhcuhKamczfhsa81hvcuhLina8AasydbgXcK2fgAIdway:tgEaENaAIdba8S:tgEaENaAIdla8R:tgEaENMM:rhEdndnazaiaXcx2fgAclfydbcdtfydbazaAydbcdtfydbfazaAcwfydbcdtfydbfgAaL6mbaAaL9hmeaEah9DTmekaEhhaAhLaXhKkasclfhsavcufgvmbkaKcuSmbaKhQkdnamaiaQcx2fgrydbarclfydbarcwfydbaCabaeadaPawaqa3z:fjjjbTmbaPcefhPJbbbbh8VJbbbbh8WJbbbbh8XJbbbbh8YJbbbbh8ZJbbbbh80kcbhXinaOaHaraXcdtfydbcdtgAfydbcdtfgKhsazaAfgvydbgLhAdnaLTmbdninasydbaQSmeasclfhsaAcufgATmdxbkkasaKaLcdtfc98fydbBdbavavydbcufBdbkaXcefgXci9hmbka8AaQcK2fgsIdbhEasIdlhhasIdwh8KasIdxh8EasIdzh5asIdCh8FaYaQfce86bba80a8FMh80a8Za5Mh8Za8Ya8EMh8Ya8Xa8KMh8Xa8WahMh8Wa8VaEMh8Vamydxh8Uxbkkamc:WDf8KjjjjbaPk;Vvivuv99lu8Jjjjjbca9Rgv8Kjjjjbdndnalcw0mbaiydbhoaeabcitfgralcdtcufBdlaraoBdbdnalcd6mbaiclfhoalcufhwarcxfhrinaoydbhDarcuBdbarc98faDBdbarcwfhraoclfhoawcufgwmbkkalabfhrxekcbhDavczfcwfcbBdbav9cb83izavcwfcbBdbav9cb83ibJbbjZhqJbbjZhkinadaiaDcdtfydbcK2fhwcbhrinavczfarfgoawarfIdbgxaoIdbgm:tgPakNamMgmUdbavarfgoaPaxam:tNaoIdbMUdbarclfgrcx9hmbkJbbjZaqJbbjZMgq:vhkaDcefgDal9hmbkcbhoadcbcecdavIdlgxavIdwgm9GEgravIdbgPam9GEaraPax9GEgscdtgrfhzavczfarfIdbhxaihralhwinaiaocdtfgDydbhHaDarydbgOBdbaraHBdbarclfhraoazaOcK2fIdbax9Dfhoawcufgwmbkaeabcitfhrdndnaocv6mbaoalc98f6mekaraiydbBdbaralcdtcufBdlaiclfhoalcufhwarcxfhrinaoydbhDarcuBdbarc98faDBdbarcwfhraoclfhoawcufgwmbkalabfhrxekaraxUdbararydlc98GasVBdlabcefaeadaiaoz:djjjbhwararydlciGawabcu7fcdtVBdlawaeadaiaocdtfalao9Rz:djjjbhrkavcaf8Kjjjjbark:;idiud99dndnabaecitfgwydlgDciGgqciSmbinabcbaDcd4gDalaqcdtfIdbawIdb:tgkJbbbb9FEgwaecefgefadaialavaoarz:ejjjbak:larIdb9FTmdabawaD7aefgecitfgwydlgDciGgqci9hmbkkabaecitfgeclfhbdnavmbcuhwindnaiaeydbgDfRbbmbadaDcK2fgqIdwalIdw:tgkakNaqIdbalIdb:tgkakNaqIdlalIdl:tgkakNMM:rgkarIdb9DTmbarakUdbaoaDBdbkaecwfheawcefgwabydbcd46mbxdkkcuhwindnaiaeydbgDfRbbmbadaDcK2fgqIdbalIdb:t:lgkaqIdlalIdl:t:lgxakax9EEgkaqIdwalIdw:t:lgxakax9EEgkarIdb9DTmbarakUdbaoaDBdbkaecwfheawcefgwabydbcd46mbkkk;llevudnabydwgxaladcetfgm8Vebcs4alaecetfgP8Vebgscs4falaicetfgz8Vebcs4ffaD0abydxaq9pVakVgDce9hmbavawcltfgxab8Pdb83dbaxcwfabcwfgx8Pdb83dbdnaxydbgqTmbaoabydbcdtfhxaqhsinalaxydbcetfcFFi87ebaxclfhxascufgsmbkkdnabydxglci2gsabydlgxfgkciGTmbarakfcbalaxcu7fciGcefz:njjjb8Aabydxci2hsabydlhxabydwhqkab9cb83dwababydbaqfBdbabascifc98GaxfBdlaP8Vebhscbhxkdnascztcz91cu9kmbabaxcefBdwaPax87ebaoabydbcdtfaxcdtfaeBdbkdnam8Uebcu9kmbababydwgxcefBdwamax87ebaoabydbcdtfaxcdtfadBdbkdnaz8Uebcu9kmbababydwgxcefBdwazax87ebaoabydbcdtfaxcdtfaiBdbkarabydlfabydxci2faPRbb86bbarabydlfabydxci2fcefamRbb86bbarabydlfabydxci2fcdfazRbb86bbababydxcefBdxaDk8LbabaeadaialavaoarawaDaDaqJbbbbz:cjjjbk;Nkovud99euv99eul998Jjjjjbc:W;ae9Rgo8KjjjjbdndnadTmbavcd4hrcbhwcbhDindnaiaeclfydbar2cdtfgvIdbaiaeydbar2cdtfgqIdbgk:tgxaiaecwfydbar2cdtfgmIdlaqIdlgP:tgsNamIdbak:tgzavIdlaP:tgPN:tgkakNaPamIdwaqIdwgH:tgONasavIdwaH:tgHN:tgPaPNaHazNaOaxN:tgxaxNMM:rgsJbbbb9Bmbaoc:W:qefawcx2fgAakas:vUdwaAaxas:vUdlaAaPas:vUdbaoc8Wfawc8K2fgAaq8Pdb83dbaAav8Pdb83dxaAam8Pdb83dKaAcwfaqcwfydbBdbaAcCfavcwfydbBdbaAcafamcwfydbBdbawcefhwkaecxfheaDcifgDad6mbkab9cb83dbabcyf9cb83dbabcaf9cb83dbabcKf9cb83dbabczf9cb83dbabcwf9cb83dbawTmeaocbBd8Sao9cb83iKao9cb83izaoczfaoc8Wfawci2cxaoc8Sfcbcrz1jjjbaoIdKhCaoIdChXaoIdzhQao9cb83iwao9cb83ibaoaoc:W:qefawcxaoc8Sfcbciz1jjjbJbbjZhkaoIdwgPJbbbbJbbjZaPaPNaoIdbgPaPNaoIdlgsasNMM:rgx:vaxJbbbb9BEgzNhxasazNhsaPazNhzaoc:W:qefheawhvinaecwfIdbaxNaeIdbazNasaeclfIdbNMMgPakaPak9DEhkaecxfheavcufgvmbkabaCUdwabaXUdlabaQUdbabaoId3UdxdndnakJ;n;m;m899FmbJbbbbhPaoc:W:qefheaoc8WfhvinaCavcwfIdb:taecwfIdbgHNaQavIdb:taeIdbgONaXavclfIdb:taeclfIdbgLNMMaxaHNazaONasaLNMM:vgHaPaHaP9EEhPavc8KfhvaecxfheawcufgwmbkabaxUd8KabasUdaabazUd3abaCaxaPN:tUdKabaXasaPN:tUdCabaQazaPN:tUdzabJbbjZakakN:t:rgkUdydndnaxJbbj:;axJbbj:;9GEgPJbbjZaPJbbjZ9FEJbb;:9cNJbbbZJbbb:;axJbbbb9GEMgP:lJbbb9p9DTmbaP:Ohexekcjjjj94hekabae86b8UdndnasJbbj:;asJbbj:;9GEgPJbbjZaPJbbjZ9FEJbb;:9cNJbbbZJbbb:;asJbbbb9GEMgP:lJbbb9p9DTmbaP:Ohvxekcjjjj94hvkabav86bRdndnazJbbj:;azJbbj:;9GEgPJbbjZaPJbbjZ9FEJbb;:9cNJbbbZJbbb:;azJbbbb9GEMgP:lJbbb9p9DTmbaP:Ohqxekcjjjj94hqkabaq86b8SdndnaecKtcK91:YJbb;:9c:vax:t:lavcKtcK91:YJbb;:9c:vas:t:laqcKtcK91:YJbb;:9c:vaz:t:lakMMMJbb;:9cNJbbjZMgk:lJbbb9p9DTmbak:Ohexekcjjjj94hekaecFbaecFb9iEhexekabcjjj;8iBdycFbhekabae86b8Vxekab9cb83dbabcyf9cb83dbabcaf9cb83dbabcKf9cb83dbabczf9cb83dbabcwf9cb83dbkaoc:W;aef8Kjjjjbk;Iwwvul99iud99eue99eul998Jjjjjbcje9Rgr8Kjjjjbavcd4hwaicd4hDdndnaoTmbarc;abfcbaocdtgvz:njjjb8Aarc;Gbfcbavz:njjjb8AarhvarcafhiaohqinavcFFF97BdbaicFFF;7rBdbaiclfhiavclfhvaqcufgqmbkdnadTmbcbhkinaeakaD2cdtfgvIdwhxavIdlhmavIdbhPalakaw2cdtfIdbhsarc;abfhzarhiarc;GbfhHarcafhqcj1jjbhvaohOinasavcwfIdbaxNavIdbaPNavclfIdbamNMMgAMhCakhXdnaAas:tgAaqIdbgQ9DgLmbaHydbhXkaHaXBdbakhXdnaCaiIdbgK9EmbazydbhXaKhCkazaXBdbaiaCUdbaqaAaQaLEUdbavcxfhvaqclfhqaHclfhHaiclfhiazclfhzaOcufgOmbkakcefgkad9hmbkkadThkJbbbbhCcbhXarc;abfhvarc;Gbfhicbhqinalavydbgzaw2cdtfIdbalaiydbgHaw2cdtfIdbaeazaD2cdtfgzIdwaeaHaD2cdtfgHIdw:tgsasNazIdbaHIdb:tgsasNazIdlaHIdl:tgsasNMM:rMMgsaCasaC9EgzEhCaqaXazEhXaiclfhiavclfhvaoaqcefgq9hmbkaCJbbbZNhKxekadThkcbhXJbbbbhKkJbbbbhCdnaearc;abfaXcdtgifydbgqaD2cdtfgvIdwaearc;GbfaifydbgzaD2cdtfgiIdwgm:tgsasNavIdbaiIdbgY:tgAaANavIdlaiIdlgP:tgQaQNMM:rgxJbbbb9ETmbaxalaqaw2cdtfIdbMalazaw2cdtfIdb:taxaxM:vhCkasaCNamMhmaQaCNaPMhPaAaCNaYMhYdnakmbaDcdthvawcdthiindnalIdbg8AaecwfIdbam:tgCaCNaeIdbaY:tgsasNaeclfIdbaP:tgAaANMM:rgQMgEaK9ETmbJbbbbhxdnaQJbbbb9ETmbaEaK:taQaQM:vhxkaxaCNamMhmaxaANaPMhPaxasNaYMhYa8AaKaQMMJbbbZNhKkaeavfhealaifhladcufgdmbkkabaKUdxabamUdwabaPUdlabaYUdbarcjef8Kjjjjbkjeeiu8Jjjjjbcj8W9Rgr8Kjjjjbaici2hwdnaiTmbawceawce0EhDarhiinaiaeadRbbcdtfydbBdbadcefhdaiclfhiaDcufgDmbkkabarawaladaoz:hjjjbarcj8Wf8Kjjjjbk:3lequ8JjjjjbcjP9Rgl8Kjjjjbcbhvalcjxfcbaiz:njjjb8AdndnadTmbcjehoaehrincuhwarhDcuhqavhkdninawakaoalcjxfaDcefRbbfRbb9RcFeGci6aoalcjxfaDRbbfRbb9RcFeGci6faoalcjxfaDcdfRbbfRbb9RcFeGci6fgxaq9mgmEhwdnammbaxce0mdkaxaqaxaq9kEhqaDcifhDadakcefgk9hmbkkaeawci2fgDcdfRbbhqaDcefRbbhxaDRbbhkaeavci2fgDcifaDawav9Rci2z:qjjjb8Aakalcjxffaocefgo86bbaxalcjxffao86bbaDcdfaq86bbaDcefax86bbaDak86bbaqalcjxffao86bbarcifhravcefgvad9hmbkalcFeaicetz:njjjbhoadci2gDceaDce0EhqcbhxindnaoaeRbbgkcetfgw8UebgDcu9kmbawax87ebaocjlfaxcdtfabakcdtfydbBdbaxhDaxcefhxkaeaD86bbaecefheaqcufgqmbkaxcdthDxekcbhDkabalcjlfaDz:mjjjb8AalcjPf8Kjjjjbk9teiucbcbyd;C1jjbgeabcifc98GfgbBd;C1jjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik;teeeudndnaeabVciGTmbabhixekdndnadcz9pmbabhixekabhiinaiaeydbBdbaiaeydlBdlaiaeydwBdwaiaeydxBdxaeczfheaiczfhiadc9Wfgdcs0mbkkadcl6mbinaiaeydbBdbaeclfheaiclfhiadc98fgdci0mbkkdnadTmbinaiaeRbb86bbaicefhiaecefheadcufgdmbkkabk:3eedudndnabciGTmbabhixekaecFeGc:b:c:ew2hldndnadcz9pmbabhixekabhiinaialBdxaialBdwaialBdlaialBdbaiczfhiadc9Wfgdcs0mbkkadcl6mbinaialBdbaiclfhiadc98fgdci0mbkkdnadTmbinaiae86bbaicefhiadcufgdmbkkabk9teiucbcbyd;C1jjbgeabcrfc94GfgbBd;C1jjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik9:eiuZbhedndncbyd;C1jjbgdaecztgi9nmbcuheadai9RcFFifcz4nbcuSmekadhekcbabae9Rcifc98Gcbyd;C1jjbfgdBd;C1jjbdnadZbcztge9nmbadae9RcFFifcz4nb8Akk:;Deludndndnadch9pmbabaeSmdaeabadfgi9Rcbadcet9R0mekabaead;8qbbxekaeab7ciGhldndndnabae9pmbdnalTmbadhvabhixikdnabciGmbadhvabhixdkadTmiabaeRbb86bbadcufhvdnabcefgiciGmbaecefhexdkavTmiabaeRbe86beadc9:fhvdnabcdfgiciGmbaecdfhexdkavTmiabaeRbd86bdadc99fhvdnabcifgiciGmbaecifhexdkavTmiabaeRbi86biabclfhiaeclfheadc98fhvxekdnalmbdnaiciGTmbadTmlabadcufgifglaeaifRbb86bbdnalciGmbaihdxekaiTmlabadc9:fgifglaeaifRbb86bbdnalciGmbaihdxekaiTmlabadc99fgifglaeaifRbb86bbdnalciGmbaihdxekaiTmlabadc98fgdfaeadfRbb86bbkadcl6mbdnadc98fgocd4cefciGgiTmbaec98fhlabc98fhvinavadfaladfydbBdbadc98fhdaicufgimbkkaocx6mbaec9Wfhvabc9WfhoinaoadfgicxfavadfglcxfydbBdbaicwfalcwfydbBdbaiclfalclfydbBdbaialydbBdbadc9Wfgdci0mbkkadTmdadhidnadciGglTmbaecufhvabcufhoadhiinaoaifavaifRbb86bbaicufhialcufglmbkkadcl6mdaec98fhlabc98fhvinavaifgecifalaifgdcifRbb86bbaecdfadcdfRbb86bbaecefadcefRbb86bbaeadRbb86bbaic98fgimbxikkavcl6mbdnavc98fglcd4cefcrGgdTmbavadcdt9RhvinaiaeydbBdbaeclfheaiclfhiadcufgdmbkkalc36mbinaiaeydbBdbaiaeydlBdlaiaeydwBdwaiaeydxBdxaiaeydzBdzaiaeydCBdCaiaeydKBdKaiaeyd3Bd3aecafheaicafhiavc9Gfgvci0mbkkavTmbdndnavcrGgdmbavhlxekavc94GhlinaiaeRbb86bbaicefhiaecefheadcufgdmbkkavcw6mbinaiaeRbb86bbaiaeRbe86beaiaeRbd86bdaiaeRbi86biaiaeRbl86blaiaeRbv86bvaiaeRbo86boaiaeRbr86braicwfhiaecwfhealc94fglmbkkabkk9Tdbcjwk9ubbjZbbbbbbbbbbbbbbjZbbbbbbbbbbbbbbjZ86;nAZ86;nAZ86;nAZ86;nA:;86;nAZ86;nAZ86;nAZ86;nA:;86;nAZ86;nAZ86;nAZ86;nA:;bc;uwkxebbbdbbb9GNbb",t=new Uint8Array([32,0,65,2,1,106,34,33,3,128,11,4,13,64,6,253,10,7,15,116,127,5,8,12,40,16,19,54,20,9,27,255,113,17,42,67,24,23,146,148,18,14,22,45,70,69,56,114,101,21,25,63,75,136,108,28,118,29,73,115]);if(typeof WebAssembly!="object")return{supported:!1};var a,s=WebAssembly.instantiate(r(e),{}).then(function(h){a=h.instance,a.exports.__wasm_call_ctors()});function r(h){for(var d=new Uint8Array(h.length),x=0;x<h.length;++x){var g=h.charCodeAt(x);d[x]=g>96?g-97:g>64?g-39:g+4}for(var y=0,x=0;x<h.length;++x)d[y++]=d[x]<60?t[d[x]]:(d[x]-60)*64+d[++x];return d.buffer.slice(0,y)}function n(h){if(!h)throw new Error("Assertion failed")}function i(h){return new Uint8Array(h.buffer,h.byteOffset,h.byteLength)}var o=48,c=16;function l(h,d){var x=h.meshlets[d*4+0],g=h.meshlets[d*4+1],y=h.meshlets[d*4+2],m=h.meshlets[d*4+3];return{vertices:h.vertices.subarray(x,x+y),triangles:h.triangles.subarray(g,g+m*3)}}function f(h,d,x,g,y,m,v){var E=a.exports.sbrk,S=a.exports.meshopt_buildMeshletsBound(h.length,y,m),A=E(S*c),T=E(S*y*4),_=E(S*m*3),R=E(h.byteLength),N=E(d.byteLength),B=new Uint8Array(a.exports.memory.buffer);B.set(i(h),R),B.set(i(d),N);var F=a.exports.meshopt_buildMeshlets(A,T,_,R,h.length,N,x,g,y,m,v);B=new Uint8Array(a.exports.memory.buffer);for(var K=B.subarray(A,A+F*c),$=new Uint32Array(K.buffer,K.byteOffset,K.byteLength/4).slice(),re=0;re<F;++re){var de=$[re*4+0],Ke=$[re*4+1],x=$[re*4+2],be=$[re*4+3];a.exports.meshopt_optimizeMeshlet(T+de*4,_+Ke,be,x)}var Ve=$[(F-1)*4+0],Ze=$[(F-1)*4+1],_e=$[(F-1)*4+2],ot=$[(F-1)*4+3],et=Ve+_e,It=Ze+(ot*3+3&-4),xa={meshlets:$,vertices:new Uint32Array(B.buffer,T,et).slice(),triangles:new Uint8Array(B.buffer,_,It*3).slice(),meshletCount:F};return E(A-E(0)),xa}function u(h){var d=new Float32Array(a.exports.memory.buffer,h,o/4);return{centerX:d[0],centerY:d[1],centerZ:d[2],radius:d[3],coneApexX:d[4],coneApexY:d[5],coneApexZ:d[6],coneAxisX:d[7],coneAxisY:d[8],coneAxisZ:d[9],coneCutoff:d[10]}}function p(h,d,x,g){var y=a.exports.sbrk,m=[],v=y(d.byteLength),E=y(h.vertices.byteLength),S=y(h.triangles.byteLength),A=y(o),T=new Uint8Array(a.exports.memory.buffer);T.set(i(d),v),T.set(i(h.vertices),E),T.set(i(h.triangles),S);for(var _=0;_<h.meshletCount;++_){var R=h.meshlets[_*4+0],N=h.meshlets[_*4+0+1],B=h.meshlets[_*4+0+3];a.exports.meshopt_computeMeshletBounds(A,E+R*4,S+N,B,v,x,g),m.push(u(A))}return y(v-y(0)),m}function b(h,d,x,g){var y=a.exports.sbrk,m=y(o),v=y(h.byteLength),E=y(d.byteLength),S=new Uint8Array(a.exports.memory.buffer);S.set(i(h),v),S.set(i(d),E),a.exports.meshopt_computeClusterBounds(m,v,h.length,E,x,g);var A=u(m);return y(m-y(0)),A}return{ready:s,supported:!0,buildMeshlets:function(h,d,x,g,y,m){n(h.length%3==0),n(d instanceof Float32Array),n(d.length%x==0),n(x>=3),n(g<=256||g>0),n(y<=512),n(y%4==0),m=m||0;var v=h.BYTES_PER_ELEMENT==4?h:new Uint32Array(h);return f(v,d,d.length/x,x*4,g,y,m)},computeClusterBounds:function(h,d,x){n(h.length%3==0),n(h.length/3<=512),n(d instanceof Float32Array),n(d.length%x==0),n(x>=3);var g=h.BYTES_PER_ELEMENT==4?h:new Uint32Array(h);return b(g,d,d.length/x,x*4)},computeMeshletBounds:function(h,d,x){return n(h.meshletCount!=0),n(d instanceof Float32Array),n(d.length%x==0),n(x>=3),p(h,d,d.length/x,x*4)},extractMeshlet:function(h,d){return n(d>=0&&d<h.meshletCount),l(h,d)}}})();var Vl=new ml().registerExtensions([mi,yi,xi]).registerDependencies({"meshopt.decoder":gr});async function ts(e,t={}){await gr.ready;let a;if(t.fetchBytes)a=new Uint8Array(await t.fetchBytes(e));else{let c=await fetch(e,{cache:t.fetchCache||"no-store"});if(!c.ok)throw new Error(`Failed to load ${e}: ${c.status}`);a=new Uint8Array(await c.arrayBuffer())}let s=await Vl.readBinary(a),r=[],n=t.componentFeatures||new Map,i=new Map;function o(c,l=""){let f=n.has(c.getName());f&&i.set(c.getName(),(i.get(c.getName())||0)+1);let u=f?c.getName():l,p=c.getMesh();if(p){let b=c.getWorldMatrix();for(let h of p.listPrimitives()){let d=h.getAttribute("POSITION"),x=h.getAttribute("NORMAL"),g=h.getAttribute("_FEATURE_ID_0"),y=h.getAttribute("_FEATURE_ID_1"),m=h.getIndices()?.getArray();if(!d||!m)continue;let v=d.getCount(),E=new Float32Array(v*3),S=new Float32Array(v*3),A=new Uint32Array(v),T=new Uint32Array(v),_=[1/0,1/0,1/0,-1/0,-1/0,-1/0],R=[],N=n.get(u)?.featureId||t.defaultFeatureId||0;for(let F=0;F<v;F+=1)d.getElement(F,R),K0(E,F*3,R,b),_[0]=Math.min(_[0],E[F*3]),_[1]=Math.min(_[1],E[F*3+1]),_[2]=Math.min(_[2],E[F*3+2]),_[3]=Math.max(_[3],E[F*3]),_[4]=Math.max(_[4],E[F*3+1]),_[5]=Math.max(_[5],E[F*3+2]),x?(x.getElement(F,R),V0(S,F*3,R,b)):S.set([0,0,1],F*3),A[F]=Number(g?.getScalar(F)||0),T[F]=Number(y?y.getScalar(F)||0:N);let B=h.getMaterial();r.push({position:E,normal:S,netId:A,objectFeatureId:T,indices:m,designator:u,nodeName:c.getName(),meshName:p.getName(),bounds:_,material:B?{name:B.getName(),baseColor:B.getBaseColorFactor(),metallic:B.getMetallicFactor(),roughness:B.getRoughnessFactor(),emissive:B.getEmissiveFactor()}:{baseColor:t.baseColor||[.55,.58,.64,1],metallic:.05,roughness:.72,emissive:[0,0,0]}})}}for(let b of c.listChildren())o(b,u)}for(let c of s.getRoot().listScenes())for(let l of c.listChildren())o(l);return{byteLength:a.byteLength,primitives:r,componentNodeCounts:i}}function K0(e,t,a,s){let r=s[0]*a[0]+s[4]*a[1]+s[8]*a[2]+s[12],n=s[1]*a[0]+s[5]*a[1]+s[9]*a[2]+s[13],i=s[2]*a[0]+s[6]*a[1]+s[10]*a[2]+s[14];e[t]=r,e[t+1]=-i,e[t+2]=n}function V0(e,t,a,s){let r=s[0]*a[0]+s[4]*a[1]+s[8]*a[2],n=s[1]*a[0]+s[5]*a[1]+s[9]*a[2],i=s[2]*a[0]+s[6]*a[1]+s[10]*a[2],o=Math.hypot(r,n,i)||1;e[t]=r/o,e[t+1]=-i/o,e[t+2]=n/o}async function Hl(e,t={}){await gr.ready;let a;if(t.fetchBytes)a=new Uint8Array(await t.fetchBytes(e));else{let u=await fetch(e,{cache:t.fetchCache||"no-store"});if(!u.ok)throw new Error(`Failed to load ${e}: ${u.status}`);a=new Uint8Array(await u.arrayBuffer())}let s=await Vl.readBinary(a),r=t.componentFeatures||new Map,n=new Map,i=new Map,o=new Map,c=0;function l(u){if(o.has(u))return o.get(u);let p=u.getAttribute("POSITION"),b=u.getIndices()?.getArray();if(!p||!b)return o.set(u,null),null;let h=u.getAttribute("NORMAL"),d=u.getAttribute("_FEATURE_ID_0"),x=u.getAttribute("_FEATURE_ID_1"),g=p.getCount(),y=new Float32Array(g*3),m=new Float32Array(g*3),v=new Uint32Array(g),E=new Uint32Array(g),S=[];for(let N=0;N<g;N+=1)p.getElement(N,S),y.set(S.slice(0,3),N*3),h?(h.getElement(N,S),m.set(S.slice(0,3),N*3)):m.set([0,1,0],N*3),v[N]=Number(d?.getScalar(N)||0),E[N]=Number(x?.getScalar(N)||0);let A=W0(u.getMaterial(),t),T=[es(y),es(m),es(v),es(E),es(b),g,b.length,JSON.stringify(A)].join(":"),_=i.get(T),R=_;return(!_||!X0(_.primitive,y,m,v,E,b))&&(R={primitive:{position:y,normal:m,netId:v,objectFeatureId:E,indices:Uint32Array.from(b),material:A,bounds:null},placements:[]},i.set(_?`${T}:${i.size}`:T,R)),o.set(u,R),R}function f(u,p=""){let b=r.has(u.getName());b&&n.set(u.getName(),(n.get(u.getName())||0)+1);let h=b?u.getName():p,d=u.getMesh();if(d){let x=H0(u.getWorldMatrix()),g=Number(r.get(h)?.featureId||t.defaultFeatureId||0),y=c++;for(let m of d.listPrimitives()){let v=l(m);if(!v)continue;let E=q0(v.primitive.position,x);v.placements.push({rows:x,featureId:g,designator:h,bounds:E,node:y});let S=v.primitive.bounds;v.primitive.bounds=S?[Math.min(S[0],E[0]),Math.min(S[1],E[1]),Math.min(S[2],E[2]),Math.max(S[3],E[3]),Math.max(S[4],E[4]),Math.max(S[5],E[5])]:[...E]}}for(let x of u.listChildren())f(x,h)}for(let u of s.getRoot().listScenes())for(let p of u.listChildren())f(p);return{byteLength:a.byteLength,models:[...i.values()],componentNodeCounts:n}}function H0(e){return[e[0],e[4],e[8],e[12],-e[2],-e[6],-e[10],-e[14],e[1],e[5],e[9],e[13]]}function q0(e,t){let a=[1/0,1/0,1/0,-1/0,-1/0,-1/0];for(let s=0;s<e.length;s+=3){let r=e[s],n=e[s+1],i=e[s+2];for(let o=0;o<3;o+=1){let c=o*4,l=t[c]*r+t[c+1]*n+t[c+2]*i+t[c+3];l<a[o]&&(a[o]=l),l>a[o+3]&&(a[o+3]=l)}}return a}function W0(e,t){return e?{name:e.getName(),baseColor:e.getBaseColorFactor(),metallic:e.getMetallicFactor(),roughness:e.getRoughnessFactor(),emissive:e.getEmissiveFactor()}:{baseColor:t.baseColor||[.55,.58,.64,1],metallic:.05,roughness:.72,emissive:[0,0,0]}}function es(e){let t=e.BYTES_PER_ELEMENT===4?new Uint32Array(e.buffer,e.byteOffset,e.length):e,a=2166136261;for(let s=0;s<t.length;s+=1)a^=t[s],a=Math.imul(a,16777619)>>>0;return a.toString(36)}function X0(e,t,a,s,r,n){let i=(o,c)=>o.length===c.length&&o.every((l,f)=>l===c[f]);return i(e.position,t)&&i(e.normal,a)&&i(e.netId,s)&&i(e.objectFeatureId,r)&&i(e.indices,n)}var ia=Object.freeze({mm:1,fineMm:.1,deg:15,fineDeg:1}),wi=Object.freeze([[1,0,0],[0,1,0],[0,0,1]]);function ql(e){return Math.round(e*1e9)/1e9+0}function Yt(e){let t=Math.hypot(...e.rotation)||1,a=e.rotation.map(r=>r/t),s=[a[3],a[0],a[1],a[2]].find(r=>Math.abs(r)>1e-12)??1;return{translationMm:e.translationMm.map(ql),rotation:a.map(r=>ql(s<0?-r:r))}}function $0(e){let[t,a,s,r]=e.rotation,[n,i,o]=e.translationMm;return[1-2*(a*a+s*s),2*(t*a+s*r),2*(t*s-a*r),0,2*(t*a-s*r),1-2*(t*t+s*s),2*(a*s+t*r),0,2*(t*s+a*r),2*(a*s-t*r),1-2*(t*t+a*a),0,n,i,o,1]}function Wl(e,t){let a=new Array(16);for(let s=0;s<4;s+=1)for(let r=0;r<4;r+=1)a[s*4+r]=e[r]*t[s*4]+e[4+r]*t[s*4+1]+e[8+r]*t[s*4+2]+e[12+r]*t[s*4+3];return a}function Y0(e){let t=[e[0],e[4],e[8],0,e[1],e[5],e[9],0,e[2],e[6],e[10],0,0,0,0,1];for(let a=0;a<3;a+=1)t[12+a]=-(t[a]*e[12]+t[4+a]*e[13]+t[8+a]*e[14]);return t}function mr(e,t){return t>0?Math.round(e/t)*t:e}function vi(e,t){let a=t[0]**2+t[1]**2;return a<1e-9?0:(e[0]*t[0]+e[1]*t[1])/a}function Xl(e,t,a){let s=Math.atan2(t[1]-e[1],t[0]-e[0]),n=Math.atan2(a[1]-e[1],a[0]-e[0])-s;for(;n>Math.PI;)n-=2*Math.PI;for(;n<-Math.PI;)n+=2*Math.PI;return n}function $l(e,t,a){return tt(e,t)>=0?-a:a}function Yl(e){return wi.map(t=>Jn(e.rotation,t))}function Jl(e,t,a){return{translationMm:e.translationMm.map((s,r)=>s+t[r]*a),rotation:[...e.rotation]}}function Ql(e,t,a,s){let r=vc(t,a),n=e.translationMm.map((o,c)=>o-s[c]);return{translationMm:Jn(r,n).map((o,c)=>o+s[c]),rotation:Ws(r,e.rotation)}}function Zl(e,t){if(t==null)return null;let a=`/${String(t).split("/")[1]||""}`;return(e?.occurrences||[]).find(s=>s.path===a&&s.depth===1)??null}function ed(e,t,a){let s=e.occurrences.find(o=>o.path===t);if(!s||s.depth!==1)return e;let r=$0(a),n=Wl(r,Y0(s.worldMatrix)),i=`${t}/`;return{...e,occurrences:e.occurrences.map(o=>o.path===t?{...o,pose:{...Yt(a),source:"manual"},worldMatrix:r}:o.path.startsWith(i)?{...o,worldMatrix:Wl(n,o.worldMatrix)}:o)}}function td(e){let t=Math.abs(e[0])<.9?[1,0,0]:[0,1,0];return He(qe(e,t))}var J0=Object.freeze([0,1,1,0]),as=`
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
`,$e=Object.freeze([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function Q0(e){let t=e?.matrix??e;if(!t||typeof t.length!="number"||t.length!==16)throw new TypeError("An occurrence matrix must have 16 numbers (column-major)");let a=Array.from(t,Number);if(!a.every(Number.isFinite))throw new TypeError("An occurrence matrix must be finite");if(a[3]!==0||a[7]!==0||a[11]!==0||a[15]!==1)throw new TypeError("An occurrence matrix must be affine (last row 0 0 0 1)");return a}function Z0(e){let[t,a,s,,r,n,i,,o,c,l]=e,f=n*l-c*i,u=c*s-a*l,p=a*i-n*s,b=o*i-r*l,h=t*l-o*s,d=r*s-t*i,x=r*c-o*n,g=o*a-t*c,y=t*n-r*a,m=t*f+r*u+o*p;if(m===0)throw new TypeError("An occurrence matrix must be invertible");let v=m<0?-1:1;return[v*f,v*b,v*x,0,v*u,v*h,v*g,0,v*p,v*d,v*y,0,0,0,0,1]}function ey(e){let t=new Uint32Array(4);for(let a of e||[]){let s=Number(a);!Number.isInteger(s)||s<0||s>=128||(t[s>>>5]|=1<<(s&31)>>>0)}return t}function yr(e,t=[],a=[]){let s=new Float32Array(Math.max(1,e.length)*40),r=new Uint32Array(s.buffer);return e.forEach((n,i)=>{let o=i*40;s.set(n,o),s.set(Z0(n),o+16),t[i]&&r.set(ey(t[i]),o+32),s.set(a[i]||J0,o+36)}),s}function xr(e,t){let[a,s,r]=t;return[e[0]*a+e[4]*s+e[8]*r+e[12],e[1]*a+e[5]*s+e[9]*r+e[13],e[2]*a+e[6]*s+e[10]*r+e[14]]}function xt(e,t){if(!t)return null;let a=[1/0,1/0,1/0,-1/0,-1/0,-1/0];for(let s=0;s<8;s+=1){let r=xr(e,[t[s&1?3:0],t[s&2?4:1],t[s&4?5:2]]);for(let n=0;n<3;n+=1)a[n]=Math.min(a[n],r[n]),a[n+3]=Math.max(a[n+3],r[n])}return a}function wr(e){return e.every((t,a)=>t===$e[a])}var ty=0,ay=4294901759;function ad(e,t){let a=e>>>0,s=t>>>0;return a===ty?{kind:"none",occurrenceIndex:-1,featureId:0}:{kind:s?"feature":"board",occurrenceIndex:a-1,featureId:s}}function sd(e){let t=Array.from(e);if(t.length>ay)throw new RangeError("Too many occurrences for the pick target");let a=t.map(Q0),s=o=>o&&!Array.isArray(o)&&!ArrayBuffer.isView(o),r=t.map((o,c)=>s(o)&&o.key!=null?String(o.key):String(c));if(new Set(r).size!==r.length)throw new TypeError("Occurrence keys must be unique");let n=t.map(o=>s(o)&&o.hiddenLayers?[...o.hiddenLayers].map(Number):[]),i=t.map(o=>s(o)&&o.explode?[...o.explode].map(Number):null);return{matrices:a,keys:r,hiddenLayers:n,explode:i}}function ss(e,t,a){let[s,r,n]=t,i=e[0]*s+e[4]*r+e[8]*n+e[12],o=e[1]*s+e[5]*r+e[9]*n+e[13],c=e[2]*s+e[6]*r+e[10]*n+e[14],l=e[3]*s+e[7]*r+e[11]*n+e[15];return!(l>0)||c<0||c>l?null:{x:a.x+(i/l*.5+.5)*a.width,y:a.y+(.5-o/l*.5)*a.height}}var vr=0;var rd=3,Mi=4,TS=Object.freeze(["full","board","body","box"]),rt=Object.freeze({fullPx:140,boardPx:70,boxPx:18,keep:.8});function ka(e={}){let t=(i,o)=>Number.isFinite(Number(e[i]))?Math.max(0,Number(e[i])):o,a=t("boxPx",rt.boxPx),s=Math.max(a,t("boardPx",rt.boardPx)),r=Math.max(s,t("fullPx",rt.fullPx)),n=Math.min(1,Math.max(.05,t("keep",rt.keep)));return{fullPx:r,boardPx:s,boxPx:a,keep:n}}function nd(e){let t=c=>[e[c],e[4+c],e[8+c],e[12+c]],[a,s,r,n]=[t(0),t(1),t(2),t(3)],i=(c,l)=>c.map((f,u)=>f+l[u]),o=(c,l)=>c.map((f,u)=>f-l[u]);return[i(n,a),o(n,a),i(n,s),o(n,s),r,o(n,r)]}var rs=class{constructor(t,a,s,r=16777216){this.device=t,this.usage=a|id.COPY_SRC|id.COPY_DST,this.label=s,this.chunkBytes=r,this.chunks=[],this.usedBytes=0,this.generation=0,this.repacks=0}alloc(t){let s={buffer:null,offset:0,size:Math.max(4,Math.ceil(t/4)*4),chunk:null};return this.place(s,null),s}place(t,a){let{size:s}=t,r=null;if(s<=this.chunkBytes/2)for(let o of this.chunks)o===a||o.dedicated||o.free.forEach((c,l)=>{c.size>=s&&(!r||c.size<r.range.size)&&(r={chunk:o,index:l,range:c})});let n,i;if(r)({chunk:n}=r),i=r.range.offset,r.range.size===s?n.free.splice(r.index,1):n.free[r.index]={offset:i+s,size:r.range.size-s};else{let o=s>this.chunkBytes/2,c=o?s:this.chunkBytes;n={buffer:this.device.createBuffer({label:`${this.label}-${this.chunks.length}`,size:c,usage:this.usage}),size:c,free:c>s?[{offset:s,size:c-s}]:[],used:0,live:new Set,dedicated:o},this.chunks.push(n),i=0}n.used+=s,n.live.add(t),this.usedBytes+=s,Object.assign(t,{buffer:n.buffer,offset:i,chunk:n})}write(t,a){this.device.queue.writeBuffer(t.buffer,t.offset,a)}free(t){let{chunk:a}=t;if(!(!a||!a.live.has(t))){if(this.release(a,t),t.chunk=null,!a.live.size){this.drop(a);return}!a.dedicated&&a.used<a.size*.5&&this.chunks.length>1&&this.repack(a)}}release(t,a){t.used-=a.size,t.live.delete(a),this.usedBytes-=a.size;let s=t.free,r=s.findIndex(n=>n.offset>a.offset);r<0&&(r=s.length),s.splice(r,0,{offset:a.offset,size:a.size}),r+1<s.length&&s[r].offset+s[r].size===s[r+1].offset&&(s[r].size+=s[r+1].size,s.splice(r+1,1)),r>0&&s[r-1].offset+s[r-1].size===s[r].offset&&(s[r-1].size+=s[r].size,s.splice(r,1))}drop(t){t.buffer.destroy?.(),this.chunks.splice(this.chunks.indexOf(t),1)}repack(t){let a=this.device.createCommandEncoder({label:`${this.label}-repack`});for(let s of[...t.live]){let r={buffer:s.buffer,offset:s.offset};this.release(t,s),this.place(s,t),a.copyBufferToBuffer(r.buffer,r.offset,s.buffer,s.offset,s.size)}this.device.queue.submit([a.finish()]),this.drop(t),this.generation+=1,this.repacks+=1}reservedBytes(){return this.chunks.reduce((t,a)=>t+a.size,0)}destroy(){for(let t of this.chunks)t.buffer.destroy?.();this.chunks=[],this.usedBytes=0}},id=globalThis.GPUBufferUsage||{COPY_SRC:4,COPY_DST:8};var ki=Object.freeze(["decl","vs-out","vs-end","fs-begin","fs-return"]),sy={decl:"decl","vs-out":"vsOut","vs-end":"vsEnd","fs-begin":"fsBegin"},ry=/^[ \t]*\/\/ @feature:[a-z-]+\n/gm;function ie(e){if(!ki.includes(e))throw new Error(`Unknown shader hook ${e}`);return`// @feature:${e}
`}function Te(e){return e.replace(ry,"")}function Ei(e){return ns(e).map(t=>t.name).join("+")}function ns(e=[]){let t=new Set;for(let a of e){if(!a?.name||!/^[a-z][a-z0-9-]*$/.test(a.name))throw new Error(`Bad shader feature name ${a?.name}`);if(t.has(a.name))throw new Error(`Shader feature ${a.name} given twice`);t.add(a.name)}return[...e].sort((a,s)=>a.name<s.name?-1:a.name>s.name?1:0)}function ny(e,t="shader"){for(let a of ki){let s=Si(e,a).length;if(s!==1)throw new Error(`${t}: hook ${a} appears ${s} times, expected once`)}cd(e,t)}function od(e,t=[],a={}){let s=ns(t);if(!s.length)return Te(e);let r=`${a.family||"shader"}${a.instanced?" (instanced)":""}`;ny(e,r);let n=e;for(let i of ki){if(i==="fs-return"){let{start:u,end:p,indent:b,expression:h}=cd(n,r),d=s.reduce((x,g)=>g.fsReturn?g.fsReturn(x,a):x,h);n=`${n.slice(0,u)}${b}return ${d};
${n.slice(p)}`;continue}let o=sy[i],c=s.map(u=>u[o]?.(a)).filter(Boolean),[l]=Si(n,i),f=c.map(u=>u.endsWith(`
`)?u:`${u}
`).join("");n=`${n.slice(0,l.index)}${f}${n.slice(l.index+l[0].length)}`}return Te(n)}function Si(e,t){return[...e.matchAll(new RegExp(`^[ \\t]*// @feature:${t}\\n`,"gm"))]}function cd(e,t){let[a]=Si(e,"fs-return"),s=a.index+a[0].length,r=e.slice(s).match(/^([ \t]*)return (.+);\n/);if(!r)throw new Error(`${t}: hook fs-return is not followed by a return line`);return{start:a.index,end:s+r[0].length,indent:r[1],expression:r[2]}}var Ti=`
fn featureHidden(id: u32) -> bool {
  return id < arrayLength(&hiddenMask) && hiddenMask[id] == 0u;
}
`;function Mr(e){let t=new Set;if(e==null)return t;for(let a of e){let s=Number(a);!Number.isInteger(s)||s<=0||s>4294967295||t.add(s)}return t}function ld(e,t=0){let a=0;for(let n of Mr(e))a=Math.max(a,n);let s=64,r=a+1;for(;s<r;)s*=2;return Math.max(s,Math.floor(t)||0)}function dd(e,t){let a=Math.max(64,Math.floor(t)||0),s=new Uint32Array(a);s.fill(1);for(let r of Mr(e))r<a&&(s[r]=0);return s}function iy(e){let t=Number(e.drillWidthMm)||0,a=Number(e.drillHeightMm)||t,s=Math.min(t,a),r=Math.min(Number(e.outerWidthMm)||0,Number(e.outerHeightMm)||0),n=Number.isFinite(e.platingThicknessMm)?e.platingThicknessMm:Math.max(0,(r-s)/2),i=(Number(e.rotationDeg)||0)*Math.PI/180+(a>t?Math.PI/2:0);return{x:e.centerMm[0]/1e3,y:-e.centerMm[1]/1e3,drillRadius:s/2e3,outerRadius:(s/2+n)/1e3,halfLength:Math.abs(t-a)/2e3,angle:Math.abs(t-a)>0?-i:0,startZ:e.startZMm/1e3,endZ:e.endZMm/1e3,netId:e.netId||0,objectId:e.objectFeatureId||0,startLayerId:e.startLayerId||0,endLayerId:e.endLayerId||0}}function _i(e,t){let a=new Map((t||[]).map(s=>[Number(s.id),Number(s.thickness_mm)||0]));return(e||[]).map(s=>{let r=i=>Math.max(0,(a.get(Number(i))||0)/2-.001),n=s.startZMm>=s.endZMm?1:-1;return{...s,startZMm:s.startZMm+n*r(s.startLayerId),endZMm:s.endZMm-n*r(s.endLayerId)}})}var is=0,Ai=16,Ii=24,os=32,ud=48,fd=Object.freeze({arrayStride:ud,stepMode:"instance",attributes:Object.freeze([Object.freeze({shaderLocation:3,offset:is,format:"float32x4"}),Object.freeze({shaderLocation:4,offset:Ai,format:"float32x2"}),Object.freeze({shaderLocation:6,offset:Ii,format:"float32x2"}),Object.freeze({shaderLocation:5,offset:os,format:"uint32x4"})])}),Ri=48,kr=`struct Input {
  @location(0) unit: vec3f,
  @location(1) normal: vec3f,
  @location(2) radiusMix: f32,
  @location(3) dimensions: vec4f,
  @location(4) span: vec2f,
  @location(5) ids: vec4u,
  @location(6) shape: vec2f,
};`,hd=`struct Barrel {
  dimensions: vec4f,
  span: vec2f,
  shape: vec2f,
  ids: vec4u,
};
@group(0) @binding(6) var<storage, read> barrels: array<Barrel>;`;function bd(e,t,a){let s=new ArrayBuffer(Math.max(a,e.length)*t),r=new DataView(s);return e.forEach((n,i)=>{let o=i*t,c=iy(n);r.setFloat32(o+is,c.x,!0),r.setFloat32(o+is+4,c.y,!0),r.setFloat32(o+is+8,c.drillRadius,!0),r.setFloat32(o+is+12,c.outerRadius,!0),r.setFloat32(o+Ai,c.startZ,!0),r.setFloat32(o+Ai+4,c.endZ,!0),r.setFloat32(o+Ii,c.halfLength,!0),r.setFloat32(o+Ii+4,c.angle,!0),r.setUint32(o+os,c.netId,!0),r.setUint32(o+os+4,c.objectId,!0),r.setUint32(o+os+8,c.startLayerId,!0),r.setUint32(o+os+12,c.endLayerId,!0)}),s}function pd(e){return bd(e,ud,0)}function gd(e){return bd(e,Ri,1)}var Ni=e=>`
struct Palette {
  ramps: array<vec4f, 512>,
  outline: vec4f,
};
@group(0) @binding(${e}) var<uniform> palette: Palette;
fn ramp(t: f32, which: u32) -> vec3f {
  let x = clamp(t, 0.0, 1.0) * 255.0;
  let i = u32(floor(x));
  let j = min(i + 1u, 255u);
  return mix(palette.ramps[which * 256u + i].rgb, palette.ramps[which * 256u + j].rgb, x - floor(x));
}
fn fieldColor(t: f32) -> vec3f {
  return ramp(t, 0u);
}
`,md=`
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
  // Cell pitch along board X and Y (mm); a grid's two pitches may differ.
  fieldPitch: vec2f,
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

${Ni(10)}
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
  // A result overlay outranks the lit-net glow: an isolated net shows its values.
  if (slice.overlay == 1u) {
    let value = values[operation];
    if (present(value)) { return vec4f(fieldColor(normalized(value)), 1.0); }
  } else if (slice.overlay == 2u && slice.fieldOn == 1u) {
    let value = sampleField(board);
    if (present(value)) { return vec4f(fieldColor(normalized(value)), 1.0); }
  }
  if (copperSlice() && netLit(netOf(operation))) {
    // A lit net glows, pulsing, as the mesh copper does.
    let pulse = 0.88 + 0.12 * sin(globals.time * 3.2);
    return vec4f(aces(lightNormal(vec3f(0.08, 1.0, 0.2) * pulse, normal)), 1.0);
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
`,oy={compare:"always",passOp:"keep"},Er=Object.freeze({shapeMask:{face:{compare:"always",passOp:"replace"},read:255,write:128,reference:128,color:!1,depth:!1},fan:{face:{compare:"always",passOp:"invert"},read:255,write:64,reference:0,color:!1,depth:!1},coverSubtract:{face:{compare:"not-equal",passOp:"replace",failOp:"keep"},read:64,write:192,reference:128,color:!1,depth:!1},shapeAdd:{face:{compare:"greater",passOp:"replace"},read:160,write:33,reference:32,color:!0,depth:!0},coverMark:{face:{compare:"equal",passOp:"replace",failOp:"keep"},read:192,write:1,reference:65,color:!1,depth:!1,depthTest:!0},coverAdd:{face:{compare:"equal",passOp:"invert",failOp:"keep",depthFailOp:"keep"},read:224,write:96,reference:64,color:!0,depth:!0},coverClear:{face:{compare:"always",passOp:"zero"},read:255,write:64,reference:0,color:!1,depth:!1},shapeLay:{face:{compare:"greater",passOp:"replace"},read:160,write:32,reference:32,color:!1,depth:!1,depthTest:!0},coverLay:{face:{compare:"equal",passOp:"invert",failOp:"keep",depthFailOp:"keep"},read:224,write:96,reference:64,color:!1,depth:!1,depthTest:!0},shapeBlend:{face:{compare:"greater",passOp:"replace"},read:160,write:32,reference:32,color:!0,depth:!0},coverBlend:{face:{compare:"equal",passOp:"invert",failOp:"keep",depthFailOp:"keep"},read:224,write:96,reference:64,color:!0,depth:!0},tintCovered:{face:{compare:"equal",passOp:"keep"},read:33,write:0,reference:33,color:!0,depth:!0},tintPlain:{face:{compare:"equal",passOp:"keep"},read:33,write:0,reference:32,color:!0,depth:!0},footShape:{face:{compare:"always",passOp:"replace"},read:0,write:2,reference:2,color:!1,depth:!1},footCover:{face:{compare:"equal",passOp:"replace",failOp:"keep"},read:64,write:2,reference:66,color:!1,depth:!1},tintHigh:{face:{compare:"equal",passOp:"replace"},read:34,write:4,reference:38,color:!0,depth:!0},tintLow:{face:{compare:"equal",passOp:"replace"},read:34,write:4,reference:36,color:!0,depth:!0},clearLay:{face:{compare:"always",passOp:"zero"},read:0,write:224,reference:0,color:!1,depth:!1},shapeOnFoot:{face:{compare:"equal",passOp:"invert"},read:166,write:32,reference:6,color:!0,depth:!0},shapeOffFoot:{face:{compare:"equal",passOp:"invert"},read:166,write:32,reference:4,color:!0,depth:!0},coverOnFoot:{face:{compare:"equal",passOp:"invert",failOp:"keep",depthFailOp:"keep"},read:230,write:96,reference:70,color:!0,depth:!0},coverOffFoot:{face:{compare:"equal",passOp:"invert",failOp:"keep",depthFailOp:"keep"},read:230,write:96,reference:68,color:!0,depth:!0},clearFoot:{face:{compare:"always",passOp:"zero"},read:0,write:6,reference:0,color:!1,depth:!1},coat:{face:{compare:"equal",passOp:"keep",failOp:"keep",depthFailOp:"keep"},read:2,write:0,reference:0,color:!0,depth:!0},solid:{face:oy,read:0,write:0,reference:0,color:!0,depth:!0},clear:{face:{compare:"always",passOp:"zero"},read:255,write:224,reference:0,color:!1,depth:!1}});var yd=64,Ci=112,xd=48,wd=`
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
${Ni(7)}
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
  if (view.overlay == 1u && present(value)) {
    out.color = vec4f(fieldColor(normalized(value)), 1.0);
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
`,vd=`
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
`;var Md=`
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
struct Arrow {
  base: vec4f,
  dir: vec4f,
  ids: vec4u,
};
@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<storage, read> arrows: array<Arrow>;
@group(0) @binding(2) var<storage, read> layerOffsets: array<f32>;
// 1 for each layer whose copper this frame drew: arrows show only on it.
@group(0) @binding(4) var<storage, read> drawnLayers: array<u32>;
${Ni(3)}

struct ArrowOut {
  @builtin(position) position: vec4f,
  @location(0) @interpolate(flat) outline: u32,
  @location(1) @interpolate(flat) share: f32,
};


@vertex fn vs_arrow(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> ArrowOut {
  let count = arrayLength(&arrows);
  let outline = instance < count;
  let arrow = arrows[instance % count];
  let length = arrow.dir.z;
  let half = arrow.base.w;
  let head = min(0.45 * length, 4.0 * half);
  let neck = length - head;
  // Shaft quad, then head triangle; x along the arrow from its tail, y across.
  var shape = array<vec2f, 9>(
    vec2f(0.0, -half), vec2f(neck, -half), vec2f(neck, half),
    vec2f(0.0, -half), vec2f(neck, half), vec2f(0.0, half),
    vec2f(neck, -2.4 * half), vec2f(length, 0.0), vec2f(neck, 2.4 * half));
  var local = shape[vertex] - vec2f(0.5 * length, 0.0);
  if (outline) {
    // Grown about the arrow's centre by a fixed rim.
    let rim = 0.9 * half;
    local = local * vec2f((length + 2.0 * rim) / max(length, 1e-12), (half + rim) / max(half, 1e-12));
  }
  let along = arrow.dir.xy;
  let across = vec2f(-along.y, along.x);
  let offset = 0.5 * (layerOffsets[arrow.ids.x] + layerOffsets[arrow.ids.y]);
  let point = arrow.base.xy + along * local.x + across * local.y;
  var out: ArrowOut;
  out.position = globals.viewProjection * vec4f(point, arrow.base.z + offset, 1.0);
  if (drawnLayers[arrow.ids.x] == 0u) { out.position = vec4f(0.0, 0.0, 2.0, 1.0); }
  out.outline = select(0u, 1u, outline);
  out.share = clamp(arrow.dir.w, 0.0, 1.0);
  return out;
}

@fragment fn fs_arrow(input: ArrowOut) -> @location(0) vec4f {
  return select(vec4f(ramp(input.share, 1u), 1.0), palette.outline, input.outline == 1u);
}
`;var Pi=20,dt=256,kd=112,Jt="rg32uint",Ea=dt/4,fy=256,Ed={compare:"always",passOp:"zero"},hy={compare:"always",passOp:"replace"},by={compare:"not-equal",passOp:"keep"},py={compare:"equal",passOp:"keep"},Id="fn dequant(p: vec3f) -> vec3f { return draw.quantMin.xyz + p * draw.quantSize.xyz; }",_d=32,Rd=`  let plating = input.dimensions.w - input.dimensions.z;
  let rim = select(1.0, ${(1/Math.cos(Math.PI/_d)).toFixed(6)}, input.radiusMix > 1.5);
  let radius = mix(max(input.dimensions.z - plating, input.dimensions.z * 0.5), input.dimensions.z, min(input.radiusMix, 1.0)) * rim;
  let turn = vec2f(cos(input.shape.y), sin(input.shape.y));
  let local = vec2f(input.unit.x * radius + select(-input.shape.x, input.shape.x, input.unit.x >= 0.0), input.unit.y * radius);
  let planar = vec2f(local.x * turn.x - local.y * turn.y, local.x * turn.y + local.y * turn.x);
  let turnedNormal = vec3f(input.normal.x * turn.x - input.normal.y * turn.y, input.normal.x * turn.y + input.normal.y * turn.x, input.normal.z);
`,Tr=`
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
${Id}
@group(0) @binding(3) var<storage, read> hiddenMask: array<u32>;
@group(0) @binding(4) var<storage, read> netMask: array<u32>;
${Ti}
${Ya}
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
`,gy=Te(Tr),Ar=`
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
${Id}
@group(0) @binding(3) var<storage, read> hiddenMask: array<u32>;
@group(0) @binding(4) var<storage, read> netMask: array<u32>;
${Ti}
${Ya}
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
`,my=Te(Ar),ji=`
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
${Ya}
${ie("decl")}${kr}
struct Output {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) @interpolate(flat) netId: u32,
  @location(2) @interpolate(flat) objectId: u32,
${ie("vs-out")}  @location(3) @interpolate(flat) visible: u32,
};
@vertex fn vs(input: Input) -> Output {
${Rd}  let z0 = input.span.x + layerOffsets[input.ids.z];
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
`,yy=Te(ji),Li=`
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
${Ya}
${ie("decl")}${kr}
struct Output {
  @builtin(position) position: vec4f,
  @location(3) @interpolate(flat) netId: u32,
  @location(0) @interpolate(flat) objectId: u32,
${ie("vs-out")}  @location(1) @interpolate(flat) visible: u32,
};
@vertex fn vs(input: Input) -> Output {
${Rd}  let world = vec3f(
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
`,xy=Te(Li);function ca(e,t){return t.reduce((a,[s,r])=>{if(a.split(s).length!==2)throw new Error(`Shader variant anchor not found once: ${s.slice(0,60)}`);return a.replace(s,()=>r)},e)}var Di=[`  padding0: u32,
  padding1: u32,`,`  selectedOccurrence: u32,
  occurrenceBase: u32,`],Ir=[["  padding2: u32,","  emphasisStride: u32,"],["fn netEmphasized(id: u32) -> bool {",`${jc}fn netEmphasized(id: u32) -> bool {`]],Nd="  let lit = netEmphasized(input.netId) || (globals.activeNet != 0u && input.netId == globals.activeNet);",Cd=`  let lit = emphasisOf(input.occurrence, input.netId) != 0u
    || (input.occurrence == globals.selectedOccurrence && globals.activeNet != 0u && input.netId == globals.activeNet);`,Ui=ca(Tr,[Di,[`  @location(3) world: vec3f,
};`,`  @location(3) world: vec3f,
  @location(4) @interpolate(flat) occurrence: u32,
  // Mask and silkscreen opacity of this occurrence's own stackup separation (SB2-31f).
  @location(5) @interpolate(flat) fade: f32,
};`],[`@vertex fn vs(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.world = dequant(input.position) + draw.offset.xyz;
  output.position = globals.viewProjection * vec4f(output.world, 1.0);
  output.normal = normalize(input.normal);`,`${as}
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
  let selectedComponent = here && component && globals.selectedFeature != 0u && input.objectId == globals.selectedFeature;`],...Ir,["      base = vec3f(0.08, 1.0, 0.2) * pulse;","      base = emphasisColor(mark, vec3f(0.08, 1.0, 0.2)) * pulse;"],["  var alpha = draw.flags.y;","  var alpha = draw.flags.y * input.fade;"]]),Bd=Te(Ui),zi=ca(Ar,[Di,[`  @location(0) @interpolate(flat) objectId: u32,
};`,`  @location(0) @interpolate(flat) objectId: u32,
  @location(1) @interpolate(flat) occurrence: u32,
};`],[`@vertex fn vs(input: Input) -> Output {
  var output: Output;
  output.position = globals.viewProjection * vec4f(dequant(input.position) + draw.offset.xyz, 1.0);`,`${as}
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
${ie("fs-return")}  return vec2u(input.occurrence, select(input.objectId, 0u, kind == 0u));`],...Ir,[Nd,Cd]]),Fd=Te(zi),wy=`struct Placement { r0: vec4f, r1: vec4f, r2: vec4f, ids: vec4u };
@group(0) @binding(8) var<storage, read> placements: array<Placement>;
fn place(p: Placement, v: vec3f) -> vec3f {
  return vec3f(dot(p.r0.xyz, v) + p.r0.w, dot(p.r1.xyz, v) + p.r1.w, dot(p.r2.xyz, v) + p.r2.w);
}
fn turn(p: Placement, n: vec3f) -> vec3f {
  return vec3f(dot(p.r0.xyz, n), dot(p.r1.xyz, n), dot(p.r2.xyz, n));
}`,Sd="@group(0) @binding(1) var<uniform> draw: Draw;",_r=[Sd,`${Sd}
${wy}`],Rr=["  output.objectId = input.objectId;","  output.objectId = select(placement.ids.x, input.objectId, input.objectId != 0u);"],Od=["  let index = listedOccurrence(u32(draw.material.w + 0.5), instance);",`  let placement = placements[draw.placement.x + instance % draw.placement.y];
  let index = listedOccurrence(u32(draw.material.w + 0.5), instance / draw.placement.y);`],Pd=ca(Tr,[_r,[`@vertex fn vs(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.world = dequant(input.position) + draw.offset.xyz;`,`@vertex fn vs(input: VertexInput, @builtin(instance_index) instance: u32) -> VertexOutput {
  let placement = placements[draw.placement.x + instance];
  var output: VertexOutput;
  output.world = place(placement, dequant(input.position)) + draw.offset.xyz;`],["  output.normal = normalize(input.normal);","  output.normal = normalize(turn(placement, input.normal));"],Rr]),jd=ca(Ui,[_r,Od,["occurrence.model * vec4f(dequant(input.position) + draw.offset.xyz + lift, 1.0)","occurrence.model * vec4f(place(placement, dequant(input.position)) + draw.offset.xyz + lift, 1.0)"],["(occurrence.normal * vec4f(input.normal, 0.0))","(occurrence.normal * vec4f(turn(placement, input.normal), 0.0))"],Rr]),Ld=ca(Ar,[_r,[`@vertex fn vs(input: Input) -> Output {
  var output: Output;
  output.position = globals.viewProjection * vec4f(dequant(input.position) + draw.offset.xyz, 1.0);`,`@vertex fn vs(input: Input, @builtin(instance_index) instance: u32) -> Output {
  let placement = placements[draw.placement.x + instance];
  var output: Output;
  output.position = globals.viewProjection * vec4f(place(placement, dequant(input.position)) + draw.offset.xyz, 1.0);`],Rr]),Dd=ca(zi,[_r,Od,["occurrence.model * vec4f(dequant(input.position) + draw.offset.xyz + lift, 1.0)","occurrence.model * vec4f(place(placement, dequant(input.position)) + draw.offset.xyz + lift, 1.0)"],Rr]),Ud=Te(Pd),zd=Te(jd),Gd=Te(Ld),Kd=Te(Dd),Bi=64,vy=6,My=`${hd}
${as}
struct Input {
  @location(0) unit: vec3f,
  @location(1) normal: vec3f,
  @location(2) radiusMix: f32,
};`;function Vd(e,t,a=[]){return ca(e,[Di,[`@group(0) @binding(2) var<storage, read> layerOffsets: array<f32>;
`,""],[kr,My],["@vertex fn vs(input: Input) -> Output {",`struct Record {
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
  output.occurrence = index + 1u + globals.occurrenceBase;`],...a])}var Hd=Vd(ji,`  output.position = globals.viewProjection * vec4f(world, 1.0);
  output.normal = turnedNormal;`,[[`  let z0 = input.span.x + layerOffsets[input.ids.z];
  let z1 = input.span.y + layerOffsets[input.ids.w];`,`  let z0 = input.span.x + layerOffsets[input.ids.z] * spread;
  let z1 = input.span.y + layerOffsets[input.ids.w] * spread;`],[`  output.normal = turnedNormal;
  output.netId`,`  output.normal = (occurrence.normal * vec4f(turnedNormal, 0.0)).xyz;
  output.netId`],[`  @location(3) @interpolate(flat) visible: u32,
};`,`  @location(3) @interpolate(flat) visible: u32,
  @location(4) @interpolate(flat) occurrence: u32,
};`],["  let selected = netEmphasized(input.netId) || (globals.activeNet != 0u && input.netId == globals.activeNet);",`  let mark = emphasisOf(input.occurrence, input.netId);
  let selected = mark != 0u
    || (input.occurrence == globals.selectedOccurrence && globals.activeNet != 0u && input.netId == globals.activeNet);`],...Ir,["      base = vec3f(0.1, 1.0, 0.22) * (","      base = emphasisColor(mark, vec3f(0.1, 1.0, 0.22)) * ("]]),qd=Vd(Li,`  output.position = globals.viewProjection * vec4f(world, 1.0);
  output.objectId`,[["mix(input.span.x + layerOffsets[input.ids.z], input.span.y + layerOffsets[input.ids.w], input.unit.z)","mix(input.span.x + layerOffsets[input.ids.z] * spread, input.span.y + layerOffsets[input.ids.w] * spread, input.unit.z)"],[`  @location(1) @interpolate(flat) visible: u32,
};`,`  @location(1) @interpolate(flat) visible: u32,
  @location(2) @interpolate(flat) occurrence: u32,
};`],["  return vec2u(1u, input.objectId);","  return vec2u(input.occurrence, input.objectId);"],...Ir,[Nd,Cd]]),Wd=Te(Hd),Xd=Te(qd),$d=`
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
${as}
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
`,Yd=`${$d}
@fragment fn fs(input: Output) -> @location(0) vec4f {
${ie("fs-begin")}  let light = normalize(globals.lightDirection.xyz);
${ie("fs-return")}  return vec4f(draw.color.rgb * (0.45 + max(dot(normalize(input.normal), light), 0.0) * 0.55), 1.0);
}
`,Jd=Te(Yd),Qd=`${$d}
@fragment fn fs(input: Output) -> @location(0) vec2u {
${ie("fs-begin")}${ie("fs-return")}  return vec2u(input.occurrence, 0u);
}
`,Zd=Te(Qd),Gi=`
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
`,Td=[{arrayStride:24,attributes:[{shaderLocation:0,offset:0,format:"float32x3"},{shaderLocation:1,offset:12,format:"float32x3"}]}],US=Object.freeze({main:Bd,pick:Fd,barrel:Wd,barrelPick:Xd,box:Jd,boxPick:Zd,cull:Gi,component:Ud,componentInstanced:zd,componentPick:Gd,componentPickInstanced:Kd}),eu=Object.freeze({main:{output:"color",single:Tr,instanced:Ui,world:["output.world","output.world"]},pick:{output:"pick",single:Ar,instanced:zi,world:["(dequant(input.position) + draw.offset.xyz)","world"]},barrel:{output:"color",single:ji,instanced:Hd,world:["world","(occurrence.model * vec4f(world, 1.0)).xyz"]},barrelPick:{output:"pick",single:Li,instanced:qd,world:["world","(occurrence.model * vec4f(world, 1.0)).xyz"]},component:{output:"color",single:Pd,instanced:jd,world:["output.world","output.world"]},componentPick:{output:"pick",single:Ld,instanced:Dd,world:["(place(placement, dequant(input.position)) + draw.offset.xyz)","world"]},box:{output:"color",single:null,instanced:Yd,world:[null,"(occurrence.model * vec4f(local, 1.0)).xyz"]},boxPick:{output:"pick",single:null,instanced:Qd,world:[null,"(occurrence.model * vec4f(local, 1.0)).xyz"]}}),zS=Object.freeze(Object.keys(eu));function Fi(e,t,a=[]){let s=eu[e],r=s?.[t?"instanced":"single"];if(!r)throw new Error(`No ${t?"instanced":"one-board"} ${e} shader`);return od(r,a,{family:e,instanced:t,output:s.output,world:s.world[t?1:0]})}var GS=Object.freeze({main:gy,pick:my,barrel:yy,barrelPick:xy,mainInstanced:Bd,pickInstanced:Fd,barrelInstanced:Wd,barrelPickInstanced:Xd,component:Ud,componentInstanced:zd,componentPick:Gd,componentPickInstanced:Kd,box:Jd,boxPick:Zd,cull:Gi}),oa=class e{static async create(t,{sampleCount:a=4}={}){if(!navigator.gpu)throw new Error("WebGPU is unavailable in this browser");let s=await navigator.gpu.requestAdapter({powerPreference:"high-performance"});if(!s)throw new Error("No WebGPU adapter is available");let r=s.features.has("depth32float-stencil8"),n=await s.requestDevice(r?{requiredFeatures:["depth32float-stencil8"]}:void 0);return new e(t,n,{stencil:r,sampleCount:a})}constructor(t,a,{shareFrom:s=null,stencil:r=!1,sampleCount:n=1}={}){if(this.canvas=t,this.device=a,this.shareFrom=s,this.stencil=s?s.stencil:!!r,this.sampleCount=s?s.sampleCount:n===4?4:1,this.depthFormat=this.stencil?"depth32float-stencil8":"depth32float",this.version=0,this.barrelColor=[.55,.35,.16,.78],this.alwaysInstanced=!!s,this.occurrenceBase=0,s?(this.context=s.context,this.format=s.format):(a.addEventListener("uncapturederror",i=>{console.error(`Uncaptured WebGPU error: ${i.error?.message||i.error}`)}),a.lost.then(i=>{i.reason!=="destroyed"&&console.error(`WebGPU device lost: ${i.reason}`,i.message)}),this.context=t.getContext("webgpu"),this.format=navigator.gpu.getPreferredCanvasFormat(),this.context.configure({device:a,format:this.format,alphaMode:"opaque"})),this.entries=[],this.barrels=null,this.drawSlotCapacity=fy,this.drawSlotBuffer=this.createDrawSlotBuffer(this.drawSlotCapacity),this.drawStaging=new Float32Array(this.drawSlotCapacity*Ea),this.freeDrawSlots=[],this.nextDrawSlot=0,this.globalBuffer=a.createBuffer({size:kd,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.layerOffsetBuffer=a.createBuffer({size:1024,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.occurrenceMatrices=[[...$e]],this.occurrenceKeys=["0"],this.occurrenceHiddenLayers=[[]],this.occurrenceExplode=[null],this.identityOnly=!0,this.occurrenceCapacity=1,this.occurrenceBuffer=this.createOccurrenceBuffer(this.occurrenceCapacity),this.device.queue.writeBuffer(this.occurrenceBuffer,0,yr(this.occurrenceMatrices)),this.barrelRecordBuffer=a.createBuffer({label:"barrel-records",size:Ri,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.placementBuffer=a.createBuffer({label:"component-placements",size:Bi,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.componentPipelineSets=new Map,this.instancedPipelines=null,this.shaderFeatures=[],this.shaderFeatureKey="",this.featurePipelineSets=new Map,this.pipelineSetKinds=new WeakMap,this.listBuffer=this.createListBuffer(this.occurrenceCapacity),this.slotCapacity=0,this.slotArgs=new Uint32Array(0),this.slotClasses=new Uint32Array(0),this.freeSlots=[],this.nextSlot=2,this.argsBuffer=null,this.classesBuffer=null,this.growSlots(256),this.setSlot(0,0,4),this.setSlot(1,0,4),this.cull=null,this.box=null,this.boardBounds=null,this.selectedOccurrence=-1,this.lodOverride=null,this.lodThresholds={...rt},this.innerCopperAtFull=!0,this.innerCopperMode="all",this.cullCounts={full:0,board:0,body:0,box:0,culled:0},this.frameStats={triangles:0,draws:0},this.boxColor=[.24,.36,.28,1],s)for(let i of["bindGroupLayout","pipelineLayout","vertexBuffers","pipeline","pickPipeline","barrelPipeline","barrelPickPipeline","singlePipelines"])this[i]=s[i];else this.createSinglePipelines();this.depth=null,this.colorTarget=null,this.pickDepth=null,this.pickTexture=null,this.insetColor=null,this.pickSerial=Promise.resolve(),this.bundleCache=new Map,this.globalScratch=new ArrayBuffer(kd),this.globalScratchF32=new Float32Array(this.globalScratch),this.globalScratchView=new DataView(this.globalScratch),this.barrelDrawScratch=new Float32Array(dt/4),this.nextEntryId=1,this.hiddenFeatureIds=new Set,this.showPlaceholders=!0,this.hiddenBoardLayers=new Set,this.featureMaskCapacity=64,this.featureMaskBuffer=this.createFeatureMaskBuffer(this.featureMaskCapacity),this.uploadFeatureMask(),this.emphasizedNetIds=new Set,this.occurrenceEmphasis=null,this.emphasisStride=0,this.dimCopper=!1,this.netMaskCapacity=64,this.netMaskBuffer=this.createNetMaskBuffer(this.netMaskCapacity),this.uploadNetMask(),s&&this.setOccurrences([])}createSinglePipelines(){let t=this.device;this.bindGroupLayout=t.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:2,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:3,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:4,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:5,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:6,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:7,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:8,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}}]});let a=t.createPipelineLayout({bindGroupLayouts:[this.bindGroupLayout]});this.pipelineLayout=a;let s=this.vertexBuffers=[{arrayStride:Pi,attributes:[{shaderLocation:0,offset:0,format:"unorm16x4"},{shaderLocation:1,offset:8,format:"snorm8x4"},{shaderLocation:2,offset:12,format:"uint32"},{shaderLocation:3,offset:16,format:"uint32"}]}];this.singlePipelines=this.makePipelineSet(!1,[]),this.pipeline=this.singlePipelines.main,this.pickPipeline=this.singlePipelines.pick,this.barrelPipeline=this.singlePipelines.barrel,this.barrelPickPipeline=this.singlePipelines.barrelPick}makeMainPipelines(t,a){let s=this.pipelineLayout,r=this.vertexBuffers,n=(c,l)=>this.makePipeline(s,t,this.format,r,`${c}${a}`,l),i=n("main",{stencil:Ed}),o=n("main-blend");return{main:i,mark:this.stencil?n("main-mark",{stencil:hy}):i,blend:o,translucent:n("main-translucent",{depthWrite:!1,cullMode:"back"}),mask:this.stencil?n("mask",{stencil:by}):o,maskCovered:this.stencil?n("mask-covered",{stencil:py,constants:{COVERED:1}}):null}}createOccurrenceBuffer(t){return this.device.createBuffer({label:"occurrences",size:t*160,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST})}createListBuffer(t){return this.device.createBuffer({label:"visible-occurrences",size:t*4*Uint32Array.BYTES_PER_ELEMENT,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST})}growSlots(t){let a=new Uint32Array(t*5);a.set(this.slotArgs);let s=new Uint32Array(t).fill(4);s.set(this.slotClasses),this.slotArgs=a,this.slotClasses=s,this.slotCapacity=t,this.argsBuffer?.destroy?.(),this.classesBuffer?.destroy?.(),this.argsBuffer=this.device.createBuffer({label:"indirect-args",size:a.byteLength,usage:GPUBufferUsage.INDIRECT|GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.classesBuffer=this.device.createBuffer({label:"draw-classes",size:s.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.device.queue.writeBuffer(this.argsBuffer,0,a),this.device.queue.writeBuffer(this.classesBuffer,0,s),this.cull&&(this.cull.bindGroup=this.makeCullBindGroup()),this.bundleCache?.clear()}setSlot(t,a,s){this.slotArgs.fill(0,t*5,t*5+5),this.slotArgs[t*5]=a,this.slotClasses[t]=s,this.device.queue.writeBuffer(this.argsBuffer,t*20,this.slotArgs,t*5,5),this.device.queue.writeBuffer(this.classesBuffer,t*4,this.slotClasses,t,1)}allocSlot(t,a){let s=this.freeSlots.length?this.freeSlots.pop():this.nextSlot++;return s>=this.slotCapacity&&this.growSlots(this.slotCapacity*2),this.setSlot(s,t,a),s}get occurrenceCount(){return this.occurrenceMatrices.length}setOccurrences(t){let{matrices:a,keys:s,hiddenLayers:r,explode:n}=sd(t??[$e]);this.occurrenceMatrices=a,this.occurrenceKeys=s,this.occurrenceHiddenLayers=r,this.occurrenceExplode=n,this.identityOnly=!this.alwaysInstanced&&a.length===1&&wr(a[0]),this.identityOnly||this.ensureInstancedPipelines(),a.length>this.occurrenceCapacity&&(this.occurrenceBuffer?.destroy?.(),this.listBuffer?.destroy?.(),this.occurrenceCapacity=Math.max(a.length,this.occurrenceCapacity*2),this.occurrenceBuffer=this.createOccurrenceBuffer(this.occurrenceCapacity),this.listBuffer=this.createListBuffer(this.occurrenceCapacity),this.cull&&(this.cull.lods.destroy(),this.cull.lods=this.createLodBuffer(this.occurrenceCapacity)),this.rebindAll()),a.length&&this.device.queue.writeBuffer(this.occurrenceBuffer,0,yr(a,r,n)),this.cull&&this.device.queue.writeBuffer(this.cull.lods,0,new Uint32Array(this.occurrenceCapacity).fill(Mi)),this.selectedOccurrence>=a.length&&(this.selectedOccurrence=-1),this.bundleCache.clear(),this.invalidate()}setOccurrenceHiddenLayers(t){this.occurrenceHiddenLayers=this.occurrenceMatrices.map((a,s)=>[...t?.[s]||[]].map(Number)),this.writeOccurrenceRecords()}setOccurrenceExplode(t){this.occurrenceExplode=this.occurrenceMatrices.map((a,s)=>t?.[s]?[...t[s]].map(Number):null),this.writeOccurrenceRecords()}writeOccurrenceRecords(){this.occurrenceMatrices.length&&this.device.queue.writeBuffer(this.occurrenceBuffer,0,yr(this.occurrenceMatrices,this.occurrenceHiddenLayers,this.occurrenceExplode)),this.invalidate()}setInnerCopperMode(t){this.setInnerCopperAtFull(!1),this.innerCopperMode!==t&&(this.innerCopperMode=t,this.invalidate())}setInnerCopperAtFull(t){if(this.innerCopperAtFull!==t){this.innerCopperAtFull=t;for(let a of this.entries)a.innerCopper&&(a.drawClass=Ad(a,t),this.setSlot(a.slot,a.indexCount,a.drawClass));this.invalidate()}}setBoardBounds(t){this.boardBounds=t?[...t]:null,this.invalidate()}setLodThresholds(t){this.lodThresholds=ka({...this.lodThresholds,...t}),this.invalidate()}setAnalytic(t){this.analytic&&this.analytic!==t&&this.analytic.destroy(),this.analytic=t||null,this.bundleCache.clear(),this.invalidate()}setLodOverride(t){this.lodOverride=t==null?null:Number(t),this.invalidate()}createLodBuffer(t){return this.device.createBuffer({label:"occurrence-lods",size:t*Uint32Array.BYTES_PER_ELEMENT,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST})}createCull(){let t=this.device,a=this.shareFrom?.cull,s=i=>({visibility:GPUShaderStage.COMPUTE,buffer:{type:i}}),r=a?.layout||t.createBindGroupLayout({label:"cull",entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}},{binding:1,...s("read-only-storage")},{binding:2,...s("storage")},{binding:3,...s("storage")},{binding:4,...s("storage")},{binding:5,...s("storage")},{binding:6,...s("read-only-storage")}]}),n=a&&{layout:r,classify:a.classify,writeArgs:a.writeArgs};if(!n){let i=this.createShaderModule(Gi,"cull"),o=t.createPipelineLayout({bindGroupLayouts:[r]});n={layout:r,classify:t.createComputePipeline({layout:o,compute:{module:i,entryPoint:"classify"}}),writeArgs:t.createComputePipeline({layout:o,compute:{module:i,entryPoint:"writeArgs"}})}}this.cull={...n,uniform:t.createBuffer({label:"cull-params",size:192,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),lods:this.createLodBuffer(this.occurrenceCapacity),counters:t.createBuffer({label:"cull-counters",size:16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST}),readback:t.createBuffer({label:"cull-readback",size:16,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST}),scratch:new ArrayBuffer(192),reading:!1,readAt:0,bindGroup:null},t.queue.writeBuffer(this.cull.lods,0,new Uint32Array(this.occurrenceCapacity).fill(Mi)),this.cull.bindGroup=this.makeCullBindGroup()}makeCullBindGroup(){return this.device.createBindGroup({layout:this.cull.layout,entries:[{binding:0,resource:{buffer:this.cull.uniform}},{binding:1,resource:{buffer:this.occurrenceBuffer}},{binding:2,resource:{buffer:this.cull.lods}},{binding:3,resource:{buffer:this.listBuffer}},{binding:4,resource:{buffer:this.cull.counters}},{binding:5,resource:{buffer:this.argsBuffer}},{binding:6,resource:{buffer:this.classesBuffer}}]})}createBox(){let t=[[[1,0,0],[[1,0,0],[1,1,0],[1,1,1],[1,0,1]]],[[-1,0,0],[[0,0,0],[0,0,1],[0,1,1],[0,1,0]]],[[0,1,0],[[0,1,0],[0,1,1],[1,1,1],[1,1,0]]],[[0,-1,0],[[0,0,0],[1,0,0],[1,0,1],[0,0,1]]],[[0,0,1],[[0,0,1],[1,0,1],[1,1,1],[0,1,1]]],[[0,0,-1],[[0,0,0],[0,1,0],[1,1,0],[1,0,0]]]],a=[],s=[];t.forEach(([l,f],u)=>{for(let b of f)a.push(...b,...l);let p=u*4;s.push(p,p+1,p+2,p,p+2,p+3)});let r=new Float32Array(a),n=new Uint16Array(s),i=this.device.createBuffer({label:"box-vertices",size:r.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),o=this.device.createBuffer({label:"box-indices",size:n.byteLength,usage:GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST});this.device.queue.writeBuffer(i,0,r),this.device.queue.writeBuffer(o,0,n);let c=this.device.createBuffer({size:dt,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.box={vertexBuffer:i,indexBuffer:o,indexCount:n.length,drawBuffer:c,bindGroup:this.makeBindGroup(c),scratch:new Float32Array(dt/4)},this.setSlot(1,n.length,3)}writeBoxDraw(){let t=this.box.scratch,[a,s,r,n,i,o]=this.boardBounds;t.fill(0),t.set(this.boxColor,0),t.set([n-a,i-s,o-r,0],4),t.set([a,s,r,0],8),this.device.queue.writeBuffer(this.box.drawBuffer,0,t)}encodeCull(t,a){let s=this.cull,r=new Float32Array(s.scratch),n=new Uint32Array(s.scratch);r.fill(0),nd(a.matrix).forEach((d,x)=>r.set(d,x*4));let i=a.lod;i&&r.set([...i.eye,i.orthographic?0:1],24);let o=this.boardBounds||[-1e6,-1e6,-1e6,1e6,1e6,1e6];r.set([o[0],o[1],o[2],0,o[3],o[4],o[5],0],28);let{fullPx:c,boardPx:l,boxPx:f,keep:u}=this.lodThresholds;r.set([i?.pixelScale||0,c,f,u],36);let p=this.lodOverride!=null?this.lodOverride+1:!i||!this.boardBounds?vr+1:0;n.set([this.occurrenceMatrices.length,this.selectedOccurrence+1,p,this.nextSlot],40),n[44]=this.barrels?.instanceCount||0,r[45]=l,this.device.queue.writeBuffer(s.uniform,0,s.scratch),t.clearBuffer(s.counters);let b=t.beginComputePass({label:"cull"});b.setBindGroup(0,s.bindGroup),b.setPipeline(s.classify),b.dispatchWorkgroups(Math.ceil(this.occurrenceMatrices.length/64)),b.setPipeline(s.writeArgs),b.dispatchWorkgroups(Math.ceil(this.nextSlot/64)),b.end();let h=performance.now();return!s.reading&&h-s.readAt>250?(t.copyBufferToBuffer(s.counters,0,s.readback,0,16),s.readAt=h,!0):!1}readCullCounts(){let t=this.cull;t.reading=!0;let a=this.occurrenceMatrices.length;t.readback.mapAsync(GPUMapMode.READ).then(()=>{let[s,r,n,i]=new Uint32Array(t.readback.getMappedRange().slice(0));t.readback.unmap(),this.cullCounts={full:s,board:r-s,body:n-r,box:i,culled:Math.max(0,a-n-i)}}).catch(()=>{}).finally(()=>{t.reading=!1})}countFor(t){if(this.identityOnly)return t===2?this.barrels?.instanceCount||0:t===3?0:1;let{full:a,board:s,body:r,box:n}=this.cullCounts;return t===5?a+s+r:t===0?a+s:t===1?a:t===2?(a+s)*(this.barrels?.instanceCount||0):n}gpuMemoryBytes(){let t=0;for(let a of this.entries)t+=(a.vertexAllocation?.size||0)+(a.indexAllocation?.size||0);this.shareFrom||(t+=this.arenaSlackBytes());for(let a of[this.barrels?.vertexBuffer,this.barrels?.indexBuffer,this.barrels?.instanceBuffer,this.barrelRecordBuffer,this.occurrenceBuffer,this.listBuffer,this.argsBuffer,this.classesBuffer,this.featureMaskBuffer,this.netMaskBuffer,this.cull?.lods])t+=a?.size||0;return t+=this.analytic?.gpuMemoryBytes()||0,t+=this.canvas.width*this.canvas.height*12,t}gpuMemoryBreakdown(){let t={},a=0,s=0;for(let c of this.entries){let l=c.vertexAllocation?.size||0,f=c.indexAllocation?.size||0;a+=l,s+=f;let u=c.kind==="copper"?`copper:${c.layerId??"?"}`:c.boardRole?`${c.kind}:${c.boardRole}`:c.kind||"other";t[u]=(t[u]||0)+l+f}let r=[this.barrels?.vertexBuffer,this.barrels?.indexBuffer,this.barrels?.instanceBuffer,this.barrelRecordBuffer].reduce((c,l)=>c+(l?.size||0),0),n=[this.occurrenceBuffer,this.listBuffer,this.argsBuffer,this.classesBuffer,this.featureMaskBuffer,this.netMaskBuffer,this.cull?.lods].reduce((c,l)=>c+(l?.size||0),0),i=this.shareFrom?null:this.arenaStats(),o=this.analytic?.gpuMemoryBytes()||0;return{vertex:a,index:s,geometry:t,barrels:r,occurrences:n,analytic:o,targets:this.canvas.width*this.canvas.height*12,entries:this.entries.length,arena:i}}ensureInstancedPipelines(){if(!this.instancedPipelines){if(this.shareFrom){this.shareFrom.ensureInstancedPipelines(),this.instancedPipelines=this.shareFrom.instancedPipelines,this.createBox(),this.createCull();return}this.instancedPipelines=this.makePipelineSet(!0,[]),this.createBox(),this.createCull()}}makePipelineSet(t,a){let s=this.pipelineLayout,r=Ei(a),n=l=>Fi(l,t,a),i=r?`+${r}`:"",o=`${t?"-instanced":""}${i}`,c={...this.makeMainPipelines(n("main"),o),pick:this.makePipeline(s,n("pick"),Jt,this.vertexBuffers,`pick${o}`),barrel:this.makeBarrelPipeline(s,n("barrel"),this.format,`barrel${o}`,!t),barrelPick:this.makeBarrelPipeline(s,n("barrelPick"),Jt,`barrel-pick${o}`,!t)};return t&&(c.box=this.makePipeline(s,n("box"),this.format,Td,`box${i}`),c.boxPick=this.makePipeline(s,n("boxPick"),Jt,Td,`box-pick${i}`)),this.pipelineSetKinds.set(c,{instanced:t,features:ns(a),key:r}),c}setShaderFeatures(t=[]){let a=ns(t),s=Ei(a);s!==this.shaderFeatureKey&&(this.shaderFeatures=a,this.shaderFeatureKey=s,this.bundleCache.clear(),this.invalidate())}pipelinesFor(t){let a=this.shareFrom||this;if(t&&this.ensureInstancedPipelines(),!this.shaderFeatureKey)return t?a.instancedPipelines:a.singlePipelines;let s=`${t?"instanced":"single"}|${this.shaderFeatureKey}`,r=a.featurePipelineSets.get(s);return r||(r=a.makePipelineSet(t,this.shaderFeatures),a.featurePipelineSets.set(s,r)),r}drawSet(){return this.identityOnly?{pipelines:this.pipelinesFor(!1),indirect:!1,barrelInstances:this.barrels?.instanceCount||0}:{pipelines:this.pipelinesFor(!0),indirect:!0,barrelInstances:0}}drawEntry(t,a,s){t.setBindGroup(0,a.bindGroup);let r=a.vertexAllocation,n=a.indexAllocation;t.setVertexBuffer(0,r.buffer,r.offset,r.size),t.setIndexBuffer(n.buffer,a.indexFormat,n.offset,n.size),s?t.drawIndexedIndirect(this.argsBuffer,a.slot*20):t.drawIndexed(a.indexCount,a.placementCount||1)}drawBarrels(t,a,s,r){t.setPipeline(a),t.setBindGroup(0,this.barrels.bindGroup),t.setVertexBuffer(0,this.barrels.vertexBuffer),t.setVertexBuffer(1,this.barrels.instanceBuffer),t.setIndexBuffer(this.barrels.indexBuffer,"uint16"),s?t.drawIndexedIndirect(this.argsBuffer,0):t.drawIndexed(this.barrels.indexCount,r)}drawBox(t,a){!this.box||!this.boardBounds||(this.writeBoxDraw(),t.setPipeline(a),t.setBindGroup(0,this.box.bindGroup),t.setVertexBuffer(0,this.box.vertexBuffer),t.setIndexBuffer(this.box.indexBuffer,"uint16"),t.drawIndexedIndirect(this.argsBuffer,20))}createNetMaskBuffer(t){return this.device.createBuffer({label:"net-emphasis-mask",size:t*Uint32Array.BYTES_PER_ELEMENT,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST})}uploadNetMask(){let t;if(this.occurrenceEmphasis&&!this.identityOnly){let s=Dc(this.occurrenceEmphasis);this.emphasisStride=s.stride,t=s.data}else this.emphasisStride=0,t=Oc(this.emphasizedNetIds,this.netMaskCapacity);if(t.length>this.netMaskCapacity){this.netMaskBuffer?.destroy?.();let s=this.netMaskCapacity;for(;s<t.length;)s*=2;this.netMaskCapacity=s,this.netMaskBuffer=this.createNetMaskBuffer(s),this.rebindAll()}let a=new Uint32Array(this.netMaskCapacity);a.set(t),this.device.queue.writeBuffer(this.netMaskBuffer,0,a)}setOccurrenceEmphasis(t,{dimCopper:a=!1}={}){let s=Array.isArray(t)&&t.some(r=>r&&r.size);this.occurrenceEmphasis=s?t.map(r=>r&&r.size?new Map(r):null):null,this.dimCopper=!!a,this.uploadNetMask(),this.invalidate()}get netHighlightActive(){return!!(this.emphasizedNetIds.size||this.occurrenceEmphasis||this.dimCopper)}setEmphasizedNetIds(t){this.emphasizedNetIds=er(t),this.occurrenceEmphasis=null;let a=Fc(this.emphasizedNetIds,this.netMaskCapacity);a!==this.netMaskCapacity&&(this.netMaskBuffer?.destroy?.(),this.netMaskCapacity=a,this.netMaskBuffer=this.createNetMaskBuffer(a),this.rebindAll()),this.uploadNetMask(),this.invalidate()}rebindAll(){for(let t of this.entries)t.bindGroup=this.makeBindGroup(this.drawSlotBuffer,t.drawSlot*dt);this.barrels&&(this.barrels.bindGroup=this.makeBindGroup(this.barrels.drawBuffer)),this.box&&(this.box.bindGroup=this.makeBindGroup(this.box.drawBuffer)),this.cull&&(this.cull.bindGroup=this.makeCullBindGroup()),this.bundleCache.clear()}createFeatureMaskBuffer(t){return this.device.createBuffer({label:"feature-visibility-mask",size:t*Uint32Array.BYTES_PER_ELEMENT,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST})}createDrawSlotBuffer(t){return this.device.createBuffer({label:"draw-uniforms",size:t*dt,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST})}allocateDrawSlot(){if(this.freeDrawSlots.length)return this.freeDrawSlots.pop();if(this.nextDrawSlot>=this.drawSlotCapacity){let t=this.drawSlotCapacity*2,a=new Float32Array(t*Ea);a.set(this.drawStaging),this.drawSlotBuffer.destroy?.(),this.drawSlotCapacity=t,this.drawSlotBuffer=this.createDrawSlotBuffer(t),this.drawStaging=a,this.rebindAll()}return this.nextDrawSlot++}flushDraws(t){if(!t.length)return;let a=1/0,s=-1;for(let r of t)a=Math.min(a,r.drawSlot),s=Math.max(s,r.drawSlot);this.device.queue.writeBuffer(this.drawSlotBuffer,a*dt,this.drawStaging,a*Ea,(s-a+1)*Ea)}invalidate(){this.version+=1}setBarrelColor(t){this.barrelColor=[...t],this.invalidate()}makeBindGroup(t,a=0){return this.device.createBindGroup({layout:this.bindGroupLayout,entries:[{binding:0,resource:{buffer:this.globalBuffer}},{binding:1,resource:{buffer:t,offset:a,size:dt}},{binding:2,resource:{buffer:this.layerOffsetBuffer}},{binding:3,resource:{buffer:this.featureMaskBuffer}},{binding:4,resource:{buffer:this.netMaskBuffer}},{binding:5,resource:{buffer:this.occurrenceBuffer}},{binding:6,resource:{buffer:this.barrelRecordBuffer}},{binding:7,resource:{buffer:this.listBuffer}},{binding:8,resource:{buffer:this.placementBuffer}}]})}uploadFeatureMask(){let t=dd(this.hiddenFeatureIds,this.featureMaskCapacity);this.device.queue.writeBuffer(this.featureMaskBuffer,0,t)}setHiddenFeatureIds(t){this.hiddenFeatureIds=Mr(t);let a=ld(this.hiddenFeatureIds,this.featureMaskCapacity);a!==this.featureMaskCapacity&&(this.featureMaskBuffer?.destroy?.(),this.featureMaskCapacity=a,this.featureMaskBuffer=this.createFeatureMaskBuffer(a),this.rebindAll()),this.uploadFeatureMask(),this.bundleCache.clear(),this.invalidate()}depthStencilState(t=null,a=!0){let s={format:this.depthFormat,depthWriteEnabled:a,depthCompare:"greater"};return this.stencil&&t&&(s.stencilFront=t,s.stencilBack=t),s}makePipeline(t,a,s,r,n,i={}){let o=this.createShaderModule(a,n);return this.device.createRenderPipeline({layout:t,vertex:{module:o,entryPoint:"vs",buffers:r},fragment:{module:o,entryPoint:"fs",...i.constants?{constants:i.constants}:{},targets:[{format:s,blend:s===Jt?void 0:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"triangle-list",cullMode:i.cullMode??"none"},depthStencil:this.depthStencilState(i.stencil,i.depthWrite??!0),multisample:{count:this.samplesFor(s)}})}makeBarrelPipeline(t,a,s,r,n=!0){let i=this.createShaderModule(a,r);return this.device.createRenderPipeline({layout:t,vertex:{module:i,entryPoint:"vs",buffers:[{arrayStride:28,attributes:[{shaderLocation:0,offset:0,format:"float32x3"},{shaderLocation:1,offset:12,format:"float32x3"},{shaderLocation:2,offset:24,format:"float32"}]},...n?[fd]:[]]},fragment:{module:i,entryPoint:"fs",targets:[{format:s,blend:s===Jt?void 0:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"triangle-list",cullMode:"none"},depthStencil:this.depthStencilState(),multisample:{count:this.samplesFor(s)}})}samplesFor(t){return t===Jt?1:this.sampleCount}createShaderModule(t,a){let s=this.device.createShaderModule({label:`pcb-${a}`,code:t});return typeof s.getCompilationInfo=="function"&&s.getCompilationInfo().then(r=>{let n=[...r.messages||[]];if(n.length){console.groupCollapsed(`WebGPU shader compilation info: pcb-${a}`);for(let i of n)console[i.type==="error"?"error":"warn"](`${i.type} ${i.lineNum}:${i.linePos} ${i.message}`);console.groupEnd()}}),s}resize(){let t=Math.min(devicePixelRatio||1,2),a=Math.max(1,Math.floor(this.canvas.clientWidth*t)),s=Math.max(1,Math.floor(this.canvas.clientHeight*t));if(this.canvas.width===a&&this.canvas.height===s)return;this.canvas.width=a,this.canvas.height=s,this.depth?.destroy(),this.colorTarget?.destroy(),this.pickDepth?.destroy(),this.pickTexture?.destroy();let r=this.sampleCount;this.depth=this.device.createTexture({label:"depth",size:[a,s],format:this.depthFormat,sampleCount:r,usage:GPUTextureUsage.RENDER_ATTACHMENT}),this.colorTarget=r>1?this.device.createTexture({label:"color-msaa",size:[a,s],format:this.format,sampleCount:r,usage:GPUTextureUsage.RENDER_ATTACHMENT}):null,this.pickDepth=r>1?this.device.createTexture({label:"pick-depth",size:[a,s],format:this.depthFormat,usage:GPUTextureUsage.RENDER_ATTACHMENT}):this.depth,this.pickTexture=this.device.createTexture({size:[a,s],format:Jt,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC})}addPrimitive(t,a){let s=t.position.length/3,r=new ArrayBuffer(s*Pi),n=new Uint32Array(r),i=new Uint16Array(r),o=new Int8Array(r),c=Ey(t.position);for(let y=0;y<s;y+=1){let m=y*5,v=y*3;Sy(i,m*2,t.position,v,c),Ty(o,(m+2)*4,t.normal,v),n[m+3]=t.netId[y]||0,n[m+4]=t.objectFeatureId[y]||0}let l=this.arenas(),f=l.vertex.alloc(r.byteLength);l.vertex.write(f,r);let{indices:u,format:p}=Ay(t.indices,s),b=l.index.alloc(u.byteLength);l.index.write(b,u);let h=this.allocateDrawSlot(),d=this.makeBindGroup(this.drawSlotBuffer,h*dt),x=Ad(a,this.innerCopperAtFull),g={...a,drawClass:x,slot:this.allocSlot(t.indices.length,a.placements?vy|a.placements<<3:x),placementCount:a.placements||0,placementBase:0,bounds:t.bounds||a.bounds||null,id:this.nextEntryId++,vertexAllocation:f,indexAllocation:b,quantMin:c.min,quantSize:c.size,indexFormat:p,indexCount:t.indices.length,drawSlot:h,bindGroup:d};return this.entries.push(g),this.bundleCache.clear(),this.invalidate(),g}arenas(){let t=this.shareFrom||this;return t.geometryArenas??={vertex:new rs(t.device,GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST,"geometry-vertices"),index:new rs(t.device,GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST,"geometry-indices")},t.geometryArenas}arenaSlackBytes(){let t=this.geometryArenas;return t?t.vertex.reservedBytes()-t.vertex.usedBytes+t.index.reservedBytes()-t.index.usedBytes:0}arenaStats(){let t=this.geometryArenas;if(!t)return{chunks:0,reserved:0,used:0};let a=s=>s.chunks.reduce((r,n)=>r+n.free.filter(i=>i.offset+i.size<n.size).reduce((i,o)=>i+o.size,0),0);return{chunks:t.vertex.chunks.length+t.index.chunks.length,reserved:t.vertex.reservedBytes()+t.index.reservedBytes(),used:t.vertex.usedBytes+t.index.usedBytes,holes:a(t.vertex)+a(t.index)}}componentPipelines(t){let a=this.shareFrom||this,s=a.componentPipelineSets.get(t);if(!s){let{instanced:r,features:n,key:i}=a.pipelineSetKinds.get(t),o=a.pipelineLayout,c=a.vertexBuffers,l=Fi("component",r,n),f=Fi("componentPick",r,n),u=`${r?"-instanced":""}${i?`+${i}`:""}`;s={main:a.makePipeline(o,l,a.format,c,`component${u}`,{stencil:Ed}),blend:a.makePipeline(o,l,a.format,c,`component-blend${u}`),pick:a.makePipeline(o,f,Jt,c,`component-pick${u}`)},a.componentPipelineSets.set(t,s)}return s}addInstancedPrimitives(t){let a=t.map(({primitive:s,placements:r,metadata:n})=>{let i=this.addPrimitive(s,{...n,placements:r.length});return i.placementRecords=r,i});return this.writePlacements(),a}writePlacements(){let t=this.entries.filter(o=>o.placementRecords),a=t.reduce((o,c)=>o+c.placementRecords.length,0),s=new ArrayBuffer(Math.max(1,a)*Bi),r=new Float32Array(s),n=new Uint32Array(s),i=0;for(let o of t){o.placementBase=i;for(let c of o.placementRecords){let l=i*(Bi/4);r.set(c.rows,l),n[l+12]=c.featureId||0,i+=1}}this.placementBuffer.size<s.byteLength&&(this.placementBuffer.destroy?.(),this.placementBuffer=this.device.createBuffer({label:"component-placements",size:s.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.rebindAll()),this.device.queue.writeBuffer(this.placementBuffer,0,s),this.invalidate()}removeEntries(t){if(!t?.length)return;let a=new Set(t.map(s=>s.id));for(let s of t){let r=this.arenas();s.vertexAllocation&&r.vertex.free(s.vertexAllocation),s.indexAllocation&&r.index.free(s.indexAllocation),this.freeDrawSlots.push(s.drawSlot),s.slot!=null&&(this.setSlot(s.slot,0,4),this.freeSlots.push(s.slot))}this.entries=this.entries.filter(s=>!a.has(s.id)),t.some(s=>s.placementRecords)&&this.writePlacements(),this.bundleCache.clear(),this.invalidate()}dispose(){this.removeEntries(this.entries),this.shareFrom||(this.geometryArenas?.vertex.destroy(),this.geometryArenas?.index.destroy(),this.geometryArenas=null),this.barrels&&(this.barrels.vertexBuffer?.destroy?.(),this.barrels.indexBuffer?.destroy?.(),this.barrels.instanceBuffer?.destroy?.(),this.barrels.drawBuffer?.destroy?.(),this.barrels=null),this.depth?.destroy(),this.colorTarget?.destroy(),this.pickDepth!==this.depth&&this.pickDepth?.destroy(),this.insetColor?.texture.destroy(),this.pickTexture?.destroy(),this.featureMaskBuffer?.destroy?.(),this.occurrenceBuffer?.destroy?.(),this.barrelRecordBuffer?.destroy?.(),this.listBuffer?.destroy?.(),this.argsBuffer?.destroy?.(),this.classesBuffer?.destroy?.();for(let t of[this.box?.vertexBuffer,this.box?.indexBuffer,this.box?.drawBuffer,this.cull?.uniform,this.cull?.lods,this.cull?.counters,this.cull?.readback])t?.destroy?.();this.box=null,this.cull=null,this.drawSlotBuffer?.destroy?.(),this.depth=null,this.colorTarget=null,this.pickDepth=null,this.insetColor=null,this.pickTexture=null,this.featureMaskBuffer=null,this.bundleCache.clear()}setBarrels(t){if(!t?.length)return;let a=_d,s=[],r=[],n=(d,x,g)=>{let y=s.length/7;for(let m=0;m<a;m+=1){let v=Math.PI*2*(m+.5)/a,E=Math.cos(v),S=Math.sin(v),[A,T,_]=g(E,S);s.push(E,S,x,A,T,_,d)}return y},i=(d,x)=>{for(let g=0;g<a;g+=1){let y=(g+1)%a;r.push(d+g,d+y,x+y,d+g,x+y,x+g)}};for(let d of[0,1]){let x=d?(g,y)=>[-g,-y,0]:(g,y)=>[g,y,0];i(n(d,0,x),n(d,1,x))}for(let[d,x]of[[0,1],[1,-1]]){let g=()=>[0,0,x];i(n(0,d,g),n(2,d,g))}let o=new Float32Array(s),c=new Uint16Array(r),l=pd(t),f=this.device.createBuffer({size:o.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),u=this.device.createBuffer({size:c.byteLength,usage:GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST}),p=this.device.createBuffer({size:l.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});this.device.queue.writeBuffer(f,0,o),this.device.queue.writeBuffer(u,0,c),this.device.queue.writeBuffer(p,0,l);let b=gd(t);this.barrelRecordBuffer?.destroy?.(),this.barrelRecordBuffer=this.device.createBuffer({label:"barrel-records",size:b.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.device.queue.writeBuffer(this.barrelRecordBuffer,0,b);let h=this.device.createBuffer({size:dt,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.barrels={records:t,vertexBuffer:f,indexBuffer:u,instanceBuffer:p,indexCount:c.length,instanceCount:t.length,drawBuffer:h,bindGroup:null},this.setSlot(0,c.length,2),this.rebindAll(),this.invalidate()}render(t){let{panels:a,layerOffsets:s}=t;this.resize(),this.device.queue.writeBuffer(this.layerOffsetBuffer,0,s);let r=this.context.getCurrentTexture().createView(),n=0,i=0;a.forEach((o,c)=>{let l=this.device.createCommandEncoder(),f=!this.identityOnly&&this.encodeCull(l,o),u=l.beginRenderPass({colorAttachments:[this.colorAttachment(r,c===0,c===a.length-1)],depthStencilAttachment:this.depthAttachment()}),p=Oi(o.viewport,this.canvas.width,this.canvas.height);u.setViewport(p.x,p.y,p.width,p.height,0,1),u.setScissorRect(p.x,p.y,p.width,p.height);let b=this.encodeDraws(u,o,t);n+=b.triangles,i+=b.draws,u.end(),this.device.queue.submit([l.finish()]),f&&this.readCullCounts()}),this.frameStats={triangles:Math.round(n),draws:i}}renderInto(t,a,s){if(!this.identityOnly)throw new Error("renderInto: one-board renderer only");let r=this.device.createCommandEncoder({label:"inset"}),n={view:t.depthView,depthClearValue:0,depthLoadOp:"clear",depthStoreOp:"discard"};this.stencil&&Object.assign(n,{stencilClearValue:0,stencilLoadOp:"clear",stencilStoreOp:"discard"});let i=r.beginRenderPass({colorAttachments:[this.colorAttachment(t.colorView,!0,!0,this.insetColorView(t.width,t.height))],depthStencilAttachment:n}),o=Oi(a.viewport,t.width,t.height);i.setViewport(o.x,o.y,o.width,o.height,0,1),i.setScissorRect(o.x,o.y,o.width,o.height);let c=this.encodeDraws(i,a,s);return i.end(),this.device.queue.submit([r.finish()]),c}encodeDraws(t,a,{activeNetId:s,selectedFeatureId:r,time:n,visibleLayers:i,showBoard:o,showComponents:c,showPaste:l=!0,componentOpacity:f,boardOpacity:u,isolateNet:p,compareMode:b=!1,compareOffsets:h=new Map,layerAlphas:d=null,visibleTileIds:x=null,layerOffsets:g=null}){let y=0,m=0,v=null;this.stencil&&t.setStencilReference(1),this.writeGlobals(a.matrix,s,a.layerId,n,r);let{pipelines:E,indirect:S,barrelInstances:A}=this.drawSet(),T=!l||!!(s||this.netHighlightActive),_=this.entries.filter(B=>this.visible(B,a.layerId,i,o,c,f,b,x)&&!(T&&B.boardRole==="paste")&&!(B.side&&this.hiddenBoardLayers?.has(`${B.boardRole}:${B.side}`))),R=_.filter(B=>!Sr(B)).sort((B,F)=>+!!B.stencilMark-+!!F.stencilMark),N=_.filter(B=>Sr(B)).sort((B,F)=>Sr(B)-Sr(F));for(let B of _)this.writeDraw(B,s,f,u,p,b,h.get(B.layerId),d?.get(B.layerId)??1);this.flushDraws(_),R.length>64?t.executeBundles([this.renderBundle(R,a.layerId)]):this.drawEntries(t,R,E,S);for(let B of _)y+=B.indexCount/3*this.countFor(B.drawClass)*(B.placementCount||1);return m+=_.length,this.analytic&&!b&&(v={matrix:a.matrix,showBoard:o,boardOpacity:u,hidePaste:T,isolateNet:p,panelLayer:a.layerId,assemblyOpacity:l?1:f,hiddenBoardLayers:this.hiddenBoardLayers},m+=this.analytic.encodeInto(t,g,a.layerId?new Set([a.layerId]):i,!1,v),m+=this.analytic.encodeBarrels(t,g,a.matrix),m+=this.analytic.encodeArrows(t)),!b&&this.barrels&&!this.analytic?.hasBarrels()&&(a.layerId===0||i.has(a.layerId))&&(this.writeBarrelDraw(p),this.drawBarrels(t,E.barrel,S,A),y+=this.barrels.indexCount/3*this.countFor(2),m+=1),S&&!b&&(this.drawBox(t,E.box),y+=12*this.countFor(3),m+=1),v&&(m+=this.analytic.encodeBlended(t,g,a.layerId?new Set([a.layerId]):i,v)),this.drawBlended(t,N,E,S),{triangles:y,draws:m}}colorAttachment(t,a=!0,s=!0,r=this.colorTarget?.createView()){let n={view:t,clearValue:{r:.91,g:.93,b:.94,a:1},loadOp:a?"clear":"load",storeOp:"store"};return this.sampleCount===1?n:{...n,view:r,resolveTarget:t,storeOp:s?"discard":"store"}}insetColorView(t,a){if(this.sampleCount!==1){if(this.insetColor?.width!==t||this.insetColor?.height!==a){this.insetColor?.texture.destroy();let s=this.device.createTexture({label:"inset-msaa",size:[t,a],format:this.format,sampleCount:this.sampleCount,usage:GPUTextureUsage.RENDER_ATTACHMENT});this.insetColor={texture:s,view:s.createView(),width:t,height:a}}return this.insetColor.view}}depthAttachment(t=!1){let a={view:(t?this.pickDepth:this.depth).createView(),depthClearValue:0,depthLoadOp:"clear",depthStoreOp:"discard"};return this.stencil&&Object.assign(a,{stencilClearValue:0,stencilLoadOp:"clear",stencilStoreOp:"discard"}),a}drawEntries(t,a,s,r){let n=null;for(let i of a){let o=i.placementCount?this.componentPipelines(s).main:i.stencilMark?s.mark:s.main;o!==n&&(t.setPipeline(o),n=o),this.drawEntry(t,i,r)}}drawBlended(t,a,s,r){for(let n of a)if(n.boardRole==="soldermask"&&n.kind==="board")t.setPipeline(s.mask),this.drawEntry(t,n,r),s.maskCovered&&(t.setPipeline(s.maskCovered),this.drawEntry(t,n,r));else{let i=n.translucent?s.translucent??s.blend:s.blend;t.setPipeline(n.placementCount?this.componentPipelines(s).blend:i),this.drawEntry(t,n,r)}}setPlaceholdersVisible(t){this.showPlaceholders=!!t,this.invalidate()}setHiddenBoardLayers(t){this.hiddenBoardLayers=new Set(t||[]),this.invalidate()}visible(t,a,s,r,n,i,o=!1,c=null){return t.placeholder&&!this.showPlaceholders||t.kind==="copper"&&this.analytic?.coversLayer(t.layerId)||t.kind==="board"&&this.analytic?.coversRole(t.boardRole)||t.kind==="board"&&t.boardRole==="pad"||!o&&t.kind==="copper"&&c&&!c.has(t.tileId)?!1:o?t.kind==="copper"&&s.has(t.layerId):t.innerCopper&&this.innerCopperMode==="none"?!1:t.boardRole==="paste"?a===0&&s.has(t.layerId):t.kind==="board"?a===0&&r:t.kind==="component"?a===0&&n&&i>.001:a?t.layerId===a:s.has(t.layerId)}writeGlobals(t,a,s,r,n=0){let i=this.globalScratch,o=this.globalScratchF32;o.fill(0),o.set(t,0);let c=this.globalScratchView;c.setUint32(64,a||0,!0),c.setUint32(68,s||0,!0),c.setFloat32(72,r,!0),c.setFloat32(76,a||this.netHighlightActive?1:0,!0),c.setUint32(80,n||0,!0),c.setUint32(84,this.selectedOccurrence>=0?this.selectedOccurrence+1+this.occurrenceBase:0,!0),c.setUint32(88,this.occurrenceBase,!0),c.setUint32(92,this.emphasisStride,!0),o.set([.35,-.5,.8,0],24),this.device.queue.writeBuffer(this.globalBuffer,0,i)}writeDraw(t,a,s,r=1,n=!1,i=!1,o=null,c=1){let l=this.drawStaging.subarray(t.drawSlot*Ea,(t.drawSlot+1)*Ea);l.fill(0);let f=t.color||t.material.baseColor;l.set(f,0),l.set([t.material.metallic||0,t.material.roughness??.72,t.opacityScale!=null?s:0,ky[t.drawClass]??1],4);let u=_y(t);l.set([o?.[0]||0,o?.[1]||0,(i?-(t.baseZ||0):t.layerOffset||0)+u,t.kind==="copper"||t.boardRole==="paste"?Number(t.layerId||0)+1:0],8);let p=Number.isFinite(f?.[3])?f[3]:1,b=t.kind==="component"?s*(t.opacityScale??1):t.kind==="board"&&t.boardRole!=="paste"?r*Iy(t,p):c,h=t.kind==="copper"?1:t.kind==="component"?2:0,d=n?1:t.innerCopper&&this.innerCopperMode==="lit"?2:0;if(l.set([h,b,d,i?1:0],12),t.placementCount){let x=new Uint32Array(l.buffer,l.byteOffset+64,2);x[0]=t.placementBase,x[1]=t.placementCount}l.set(t.quantMin,20),l.set(t.quantSize,24)}writeBarrelDraw(t=!1){let a=this.barrelDrawScratch;a.fill(0),a.set(this.barrelColor,0),a.set([.75,.32,0,0],4),a.set([1,1,t?1:0,0],12),this.device.queue.writeBuffer(this.barrels.drawBuffer,0,a)}renderBundle(t,a){let{pipelines:s,indirect:r}=this.drawSet(),{vertex:n,index:i}=this.arenas(),o=`${a}:${r?"indirect":"single"}:${this.shaderFeatureKey}:${n.generation}.${i.generation}:${t.map(u=>u.id).join(",")}`,c=this.bundleCache.get(o);if(c)return c;let l=this.device.createRenderBundleEncoder({colorFormats:[this.format],depthStencilFormat:this.depthFormat,sampleCount:this.sampleCount});this.drawEntries(l,t,s,r);let f=l.finish();return this.bundleCache.set(o,f),this.bundleCache.size>32&&this.bundleCache.delete(this.bundleCache.keys().next().value),f}pick(t,a,s,r){let n=this.pickSerial.then(()=>this.performPick(t,a,s,r));return this.pickSerial=n.catch(()=>0),n}async performPick(t,a,s,r){this.resize();let n=Math.max(0,Math.min(this.canvas.width-1,Math.floor(a))),i=Math.max(0,Math.min(this.canvas.height-1,Math.floor(s)));this.device.queue.writeBuffer(this.layerOffsetBuffer,0,r.layerOffsets);let o=this.device.createCommandEncoder(),c=o.beginRenderPass({colorAttachments:[{view:this.pickTexture.createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}],depthStencilAttachment:this.depthAttachment(!0)}),l=Oi(t.viewport,this.canvas.width,this.canvas.height);return c.setViewport(l.x,l.y,l.width,l.height,0,1),c.setScissorRect(l.x,l.y,l.width,l.height),this.encodePick(c,t,r),c.end(),this.readPick(o,n,i)}encodePick(t,a,s){this.writeGlobals(a.matrix,s.activeNetId,a.layerId,performance.now()/1e3,s.selectedFeatureId);let{pipelines:r,indirect:n,barrelInstances:i}=this.drawSet();t.setPipeline(r.pick);let o=[];for(let c of this.entries)this.visible(c,a.layerId,s.visibleLayers,s.showBoard,s.showComponents,s.componentOpacity,s.compareMode,s.visibleTileIds)&&(c.kind==="board"&&(this.identityOnly||c.boardRole!=="substrate")||(this.writeDraw(c,s.activeNetId,s.componentOpacity,s.boardOpacity,s.isolateNet,s.compareMode,s.compareOffsets?.get(c.layerId)),o.push(c)));this.flushDraws(o);for(let c of o)t.setPipeline(c.placementCount?this.componentPipelines(r).pick:r.pick),this.drawEntry(t,c,n);if(!s.compareMode&&this.barrels&&!this.analytic?.hasBarrels()&&(this.writeBarrelDraw(s.isolateNet),this.drawBarrels(t,r.barrelPick,n,i)),n&&!s.compareMode&&this.drawBox(t,r.boxPick),this.analytic&&!s.compareMode){let c=a.layerId?new Set([a.layerId]):s.visibleLayers;this.analytic.encodeInto(t,s.layerOffsets,c,!0,{matrix:a.matrix,panelLayer:a.layerId,isolateNet:s.isolateNet,showBoard:s.showBoard}),this.analytic.encodeBarrels(t,s.layerOffsets,a.matrix,!0)}}async readPick(t,a,s){let r=this.device.createBuffer({label:"pick-readback",size:256,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});t.copyTextureToBuffer({texture:this.pickTexture,origin:{x:a,y:s}},{buffer:r,bytesPerRow:256},{width:1,height:1}),this.device.queue.submit([t.finish()]);try{await r.mapAsync(GPUMapMode.READ);let n=new DataView(r.getMappedRange()),i=n.getUint32(0,!0),o=n.getUint32(4,!0);if(r.unmap(),this.analytic&&i&2147483648&&o)return{kind:"analytic",occurrenceIndex:-1,featureId:0,operationIndex:o-1,occurrenceKey:null};let c=ad(i,o);return{...c,occurrenceKey:c.occurrenceIndex>=0?this.occurrenceKeys[c.occurrenceIndex]??null:null}}finally{r.mapState==="mapped"&&r.unmap(),r.destroy()}}},ky=Object.freeze({0:1,1:0,5:2});function Ey(e){let t=[1/0,1/0,1/0],a=[-1/0,-1/0,-1/0];for(let s=0;s<e.length;s+=3)for(let r=0;r<3;r+=1){let n=e[s+r];n<t[r]&&(t[r]=n),n>a[r]&&(a[r]=n)}return Number.isFinite(t[0])?{min:t,size:t.map((s,r)=>a[r]>s?a[r]-s:1)}:{min:[0,0,0],size:[1,1,1]}}function Sy(e,t,a,s,r){for(let n=0;n<3;n+=1){let i=(a[s+n]-r.min[n])/r.size[n];e[t+n]=Math.max(0,Math.min(65535,Math.round(i*65535)))}e[t+3]=0}function Ty(e,t,a,s){for(let r=0;r<3;r+=1){let n=Number(a[s+r])||0;e[t+r]=Math.max(-127,Math.min(127,Math.round(n*127)))}e[t+3]=0}function Ay(e,t){if(t<=65536){let a=new Uint16Array(e.length+(e.length&1));return a.set(e),{indices:a,format:"uint16"}}return{indices:e instanceof Uint32Array?e:new Uint32Array(e),format:"uint32"}}function tu(e,t){return e*Pi+(e<=65536?(t+(t&1))*2:t*4)}function Ad(e,t){return e.kind==="component"||e.innerCopper&&t?1:e.kind==="board"&&(e.boardRole==="substrate"||e.boardRole==="soldermask")?5:0}function Sr(e){return e.translucent?3:e.kind!=="board"?0:e.boardRole==="soldermask"?1:e.boardRole==="silkscreen"?2:0}function Iy(e,t){return e.kind!=="board"||e.boardRole==="substrate"?1:e.boardRole==="soldermask"?Math.min(t,.72):e.boardRole==="silkscreen"?Math.min(t,.92):t}function _y(e){if(e.kind!=="board"||e.boardRole!=="soldermask"&&e.boardRole!=="silkscreen")return 0;let t=e.bounds,s=(t?(t[2]+t[5])*.5:0)<0?-1:1,r=e.boardRole==="silkscreen"?35e-6:18e-6;return s*r}function Oi(e,t,a){let s=Math.max(0,Math.min(t-1,Math.floor(e.x))),r=Math.max(0,Math.min(a-1,Math.floor(e.y)));return{x:s,y:r,width:Math.max(1,Math.min(t-s,Math.floor(e.width))),height:Math.max(1,Math.min(a-r,Math.floor(e.height)))}}function au(e){return e*12+2}function su(e){let t=[],a=0,s=0,r=0;for(let b=0;b<e.length;b+=1){let h=Math.floor(e[b].samplesMm.length/3);h<2||(t.push(b),a+=h,s+=au(h),r+=(h-1)*12*6+72)}let n=new Float32Array(Math.max(a,1)*4),i=new ArrayBuffer(Math.max(t.length,1)*32),o=new Uint32Array(i),c=new Float32Array(i),l=new Uint32Array(Math.max(r,3)),f=0,u=0,p=0;return t.forEach((b,h)=>{let d=e[b],x=Math.floor(d.samplesMm.length/3);for(let m=0;m<x;m+=1)n[(f+m)*4]=d.samplesMm[m*3]*.001,n[(f+m)*4+1]=d.samplesMm[m*3+1]*.001,n[(f+m)*4+2]=d.samplesMm[m*3+2]*.001;o[h*8]=f,o[h*8+1]=x,o[h*8+2]=u,o[h*8+3]=h,c[h*8+4]=d.radiusMm*.001;let g=(m,v)=>u+m*12+v%12;for(let m=0;m+1<x;m+=1)for(let v=0;v<12;v+=1)l.set([g(m,v),g(m+1,v),g(m+1,v+1),g(m,v),g(m+1,v+1),g(m,v+1)],p),p+=6;let y=u+x*12;for(let m=0;m<12;m+=1)l.set([y,g(0,m+1),g(0,m)],p),l.set([y+1,g(x-1,m),g(x-1,m+1)],p+3),p+=6;f+=x,u+=au(x)}),{samples:n,segments:o,indices:l,kept:t,sampleCount:a,vertexCount:s,indexCount:r}}var Ny=`
struct Segment { start: u32, count: u32, vertexStart: u32, color: u32, radius: f32, p0: u32, p1: u32, p2: u32 };
struct Vertex { position: vec4f, normal: vec4f };
`,Cy=`${Ny}
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
`,By=`
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
`,ru=96,Nr=class{constructor(t){this.host=t,this.device=t.device,this.counts={segments:0,samples:0,vertices:0,indices:0},this.dirty=!1,this.kept=[];let a=this.device,s=a.createShaderModule({label:"harness-tubes-compute",code:Cy});this.computeLayout=a.createBindGroupLayout({label:"harness-tubes-compute",entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},{binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},{binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},{binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},{binding:4,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}}]});let r=a.createPipelineLayout({bindGroupLayouts:[this.computeLayout]});this.framesPipeline=a.createComputePipeline({layout:r,compute:{module:s,entryPoint:"framesMain"}}),this.ringsPipeline=a.createComputePipeline({layout:r,compute:{module:s,entryPoint:"ringsMain"}});let n=a.createShaderModule({label:"harness-tubes-draw",code:By});this.drawLayout=a.createBindGroupLayout({label:"harness-tubes-draw",entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}}]}),this.drawPipeline=a.createRenderPipeline({label:"harness-tubes",layout:a.createPipelineLayout({bindGroupLayouts:[this.drawLayout]}),vertex:{module:n,entryPoint:"vs",buffers:[{arrayStride:32,attributes:[{shaderLocation:0,offset:0,format:"float32x4"},{shaderLocation:1,offset:16,format:"float32x4"}]}]},fragment:{module:n,entryPoint:"fs",targets:[{format:t.format}]},primitive:{topology:"triangle-list",cullMode:"none"},depthStencil:t.depthStencilState(),multisample:{count:t.sampleCount}}),this.globals=a.createBuffer({label:"harness-tubes-globals",size:ru,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.countBuffer=a.createBuffer({label:"harness-tubes-counts",size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.buffers={},this.capacity={samples:0,segments:0,vertices:0,indices:0},this.globalScratch=new Float32Array(ru/4)}ensure(t,a,s){let r=this.buffers[t];return r&&r.size>=a?!1:(r?.destroy(),this.buffers[t]=this.device.createBuffer({label:`harness-tubes-${t}`,size:Math.max(256,Math.ceil(a*1.5/4)*4),usage:s}),!0)}setTubes(t,a){let s=su(t);if(this.kept=s.kept.map(o=>t[o]),this.counts={segments:s.kept.length,samples:s.sampleCount,vertices:s.vertexCount,indices:s.indexCount},!this.counts.segments){this.dirty=!1;return}let r=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,n=!1;n=this.ensure("samples",s.samples.byteLength,r)||n,n=this.ensure("segments",s.segments.byteLength,r)||n,n=this.ensure("frames",s.samples.byteLength,GPUBufferUsage.STORAGE)||n,n=this.ensure("vertices",this.counts.vertices*32,GPUBufferUsage.STORAGE|GPUBufferUsage.VERTEX)||n,this.ensure("indices",s.indices.byteLength,GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST);let i=this.device.queue;i.writeBuffer(this.buffers.samples,0,s.samples),i.writeBuffer(this.buffers.segments,0,s.segments),i.writeBuffer(this.buffers.indices,0,s.indices),i.writeBuffer(this.countBuffer,0,new Uint32Array([this.counts.segments,this.counts.samples,this.counts.vertices,0])),(n||!this.computeGroup)&&(this.computeGroup=this.device.createBindGroup({layout:this.computeLayout,entries:["samples","segments","frames","vertices"].map((o,c)=>({binding:c,resource:{buffer:this.buffers[o]}})).concat([{binding:4,resource:{buffer:this.countBuffer}}])})),this.setColors(a),this.dirty=!0}setColors(t){if(!this.counts.segments)return;let a=new Float32Array(this.counts.segments*4);this.kept.forEach((s,r)=>{let{rgb:n,mode:i}=t(s);a.set([n[0],n[1],n[2],i],r*4)}),(this.ensure("colors",a.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST)||!this.drawGroup||this.drawGroupColors!==this.buffers.colors)&&(this.drawGroup=this.device.createBindGroup({layout:this.drawLayout,entries:[{binding:0,resource:{buffer:this.globals}},{binding:1,resource:{buffer:this.buffers.colors}}]}),this.drawGroupColors=this.buffers.colors),this.device.queue.writeBuffer(this.buffers.colors,0,a)}encodeCompute(t){if(!this.dirty||!this.counts.segments)return;let a=t.beginComputePass({label:"harness-tubes"});a.setBindGroup(0,this.computeGroup),a.setPipeline(this.framesPipeline),a.dispatchWorkgroups(Math.ceil(this.counts.segments/64)),a.setPipeline(this.ringsPipeline),a.dispatchWorkgroups(Math.ceil(this.counts.vertices/64)),a.end(),this.dirty=!1}draw(t,a,s=0){if(!this.counts.segments)return 0;let r=this.globalScratch;return r.fill(0),r.set(a,0),r.set([.35,-.45,.82,0],16),r[20]=s,this.device.queue.writeBuffer(this.globals,0,r),t.setPipeline(this.drawPipeline),t.setBindGroup(0,this.drawGroup),t.setVertexBuffer(0,this.buffers.vertices),t.setIndexBuffer(this.buffers.indices,"uint32"),t.drawIndexed(this.counts.indices),this.counts.indices/3}gpuMemoryBytes(){return Object.values(this.buffers).reduce((t,a)=>t+a.size,0)}dispose(){for(let t of Object.values(this.buffers))t.destroy();this.globals.destroy(),this.countBuffer.destroy(),this.buffers={}}};var Fy=[0,0,0,1,1,1],Cr=class e{static async create(t){return new e(await oa.create(t))}constructor(t){this.host=t,this.canvas=t.canvas,this.device=t.device,t.alwaysInstanced=!0,t.setOccurrences([]),this.assets=new Map,this.order=[],this.frameStats={triangles:0,draws:0},this.lodThresholds={...rt},this.tubes=null,this.tubeVersion=0}setTubes(t,a){!t.length&&!this.tubes||(this.tubes??=new Nr(this.host),this.tubes.setTubes(t,a),this.tubeVersion+=1)}setTubeColors(t){this.tubes?.setColors(t),this.tubeVersion+=1}asset(t){let a=this.assets.get(t);return a||(a=new oa(this.canvas,this.device,{shareFrom:this.host}),a.setLodThresholds(this.lodThresholds),this.assets.set(t,a)),a}standIn(t,a){let s=this.asset(t);return s.standIn||(s.standIn=!0,s.setBoardBounds(Fy),s.setLodOverride(rd)),s.boxColor=[...a],s}removeAsset(t){let a=this.assets.get(t);a&&(a.dispose(),this.assets.delete(t))}get renderers(){return this.order.map(t=>this.assets.get(t)).filter(Boolean)}setOccurrences(t){this.order=[...t.keys()].filter(s=>this.assets.has(s));for(let[s,r]of this.assets)t.has(s)||r.setOccurrences([]);for(let s of this.order)this.assets.get(s).setOccurrences(t.get(s));let a=0;for(let s of this.renderers)s.occurrenceBase=a,a+=s.occurrenceCount;this.occurrenceCount=a}locate(t){for(let a of this.renderers){let s=t-a.occurrenceBase;if(s>=0&&s<a.occurrenceCount)return{renderer:a,local:s}}return null}keyOf(t){let a=this.locate(t);return a?a.renderer.occurrenceKeys[a.local]??null:null}setSelectedOccurrence(t){let a=t>=0?this.locate(t):null;for(let s of this.renderers)s.selectedOccurrence=!s.standIn&&a?.renderer===s?a.local:-1}resize(){this.host.resize()}render(t,a){let s=this.host;s.resize();let r=this.renderers.filter(u=>u.occurrenceCount>0),n=new Map(r.map(u=>[u,a(u)]));for(let[u,p]of n)nu(u,p);let i=this.device.createCommandEncoder(),o=r.filter(u=>u.encodeCull(i,t));this.tubes?.encodeCompute(i);let c=i.beginRenderPass({colorAttachments:[s.colorAttachment(s.context.getCurrentTexture().createView())],depthStencilAttachment:s.depthAttachment()});iu(c,t.viewport,this.canvas);let l=0,f=0;for(let u of r){let p=u.encodeDraws(c,t,n.get(u));l+=p.triangles,f+=p.draws}this.tubes?.counts.segments&&(l+=this.tubes.draw(c,t.matrix,performance.now()/1e3),f+=1),c.end(),this.device.queue.submit([i.finish()]);for(let u of o)u.readCullCounts();this.frameStats={triangles:Math.round(l),draws:f}}pick(t,a,s,r){let n=this.host.pickSerial.then(()=>this.performPick(t,a,s,r));return this.host.pickSerial=n.catch(()=>0),n}async performPick(t,a,s,r){let n=this.host;n.resize();let i=Math.max(0,Math.min(this.canvas.width-1,Math.floor(a))),o=Math.max(0,Math.min(this.canvas.height-1,Math.floor(s))),c=this.device.createCommandEncoder(),l=c.beginRenderPass({colorAttachments:[{view:n.pickTexture.createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}],depthStencilAttachment:n.depthAttachment(!0)});iu(l,t.viewport,this.canvas);for(let p of this.renderers){if(p.occurrenceCount===0)continue;let b=r(p);nu(p,b),p.encodePick(l,t,b)}l.end();let f=await n.readPick(c,i,o),u=f.occurrenceIndex>=0?this.locate(f.occurrenceIndex):null;return{...f,occurrenceKey:u?u.renderer.occurrenceKeys[u.local]??null:null,renderer:u?.renderer||null,standIn:!!u?.renderer?.standIn}}gpuMemoryBytes(){let t=0;for(let a of this.renderers)t+=a.gpuMemoryBytes();return t+=this.tubes?.gpuMemoryBytes()||0,t+=this.host.arenaSlackBytes(),t-Math.max(0,this.renderers.length-1)*this.canvas.width*this.canvas.height*12}gpuMemoryBreakdown(){let t={};for(let[a,s]of this.assets){let r=s.gpuMemoryBreakdown();delete r.targets,t[a]=r}return{assets:t,tubes:this.tubes?.gpuMemoryBytes()||0,targets:this.canvas.width*this.canvas.height*12,arena:this.host.arenaStats()}}setLodThresholds(t){this.lodThresholds=ka({...this.lodThresholds,...t});for(let a of this.assets.values())a.setLodThresholds(this.lodThresholds);return{...this.lodThresholds}}cullCounts(){let t={full:0,board:0,body:0,box:0,culled:0};for(let a of this.renderers)if(a.occurrenceCount)for(let s of Object.keys(t))t[s]+=a.cullCounts[s]||0;return t}dispose(){for(let t of[...this.assets.keys()])this.removeAsset(t);this.tubes?.dispose(),this.tubes=null,this.host.dispose(),this.host.context?.unconfigure?.(),this.device.destroy?.()}};function nu(e,t){t?.layerOffsets&&e.device.queue.writeBuffer(e.layerOffsetBuffer,0,t.layerOffsets)}function iu(e,t,a){let s=Math.max(0,Math.min(a.width-1,Math.floor(t.x))),r=Math.max(0,Math.min(a.height-1,Math.floor(t.y))),n=Math.max(1,Math.min(a.width-s,Math.floor(t.width))),i=Math.max(1,Math.min(a.height-r,Math.floor(t.height)));e.setViewport(s,r,n,i,0,1),e.setScissorRect(s,r,n,i)}var Oy=`
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
}`,Py=`
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
}`,jy=`
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
}`,Ly=`
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
}`,Dy=`
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
}`,Uy=`
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
}`,zy=`
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
}`,Gy=6.2,Ky=4.6,Vy=3.8,Fr=4*1024*1024,Hy=Math.floor(Fr/6),ou=Hy*6,Br=512*1024,cu=512*1024,lu=96,qy=96,Wy=18,du=96*1024*1024,Xy=2,jr=class e{static async create(t,a){if(!navigator.gpu)throw new Error("WebGPU is unavailable in this browser");let s=await navigator.gpu.requestAdapter({powerPreference:"high-performance"});if(!s)throw new Error("No WebGPU adapter is available");let r=await s.requestDevice(),n=await fetch(a,{cache:"default"});if(!n.ok)throw new Error(`Failed to load schematic manifest: ${n.status}`);let i=await n.json();if(!["prism.schematic_world_a0","prism.schematic_vector_a0"].includes(i.schema))throw new Error(`Unsupported schematic scene schema: ${i.schema}`);let o=i.featureTable||i.features,c=await fetch(new URL(o,a),{cache:"default"});if(!c.ok)throw new Error(`Failed to load schematic features: ${c.status}`);let l=Yy(await c.json());return new e(t,r,a,i,l)}constructor(t,a,s,r,n){this.canvas=t,this.device=a,this.manifestUrl=s,this.manifest=r,this.isNativeScene=r.schema==="prism.schematic_vector_a0",this.pages=r.pages||[],this.featuresByPage=n,this.featuresById=new Map;for(let b of Object.values(n))for(let h of b)this.featuresById.set(Number(h.id),h);this.context=t.getContext("webgpu"),this.format=navigator.gpu.getPreferredCanvasFormat(),this.context.configure({device:a,format:this.format,alphaMode:"opaque"}),this.flowCanvas=null,this.flowContext=null,this.globalBuffer=a.createBuffer({size:48,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.bindGroupLayout=a.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:2,visibility:GPUShaderStage.FRAGMENT,sampler:{type:"filtering"}},{binding:3,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:"float"}}]});let i=a.createShaderModule({code:Oy});this.pagePipeline=a.createRenderPipeline({layout:a.createPipelineLayout({bindGroupLayouts:[this.bindGroupLayout]}),vertex:{module:i,entryPoint:"vs"},fragment:{module:i,entryPoint:"fs",targets:[{format:this.format}]},primitive:{topology:"triangle-list"}}),this.edgeLayout=a.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}}]});let o=a.createShaderModule({code:Py});this.edgePipeline=a.createRenderPipeline({layout:a.createPipelineLayout({bindGroupLayouts:[this.edgeLayout]}),vertex:{module:o,entryPoint:"vs",buffers:[{arrayStride:8,attributes:[{shaderLocation:0,offset:0,format:"float32x2"}]}]},fragment:{module:o,entryPoint:"fs",targets:[{format:this.format,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"line-list"}}),this.edgeBindGroup=a.createBindGroup({layout:this.edgeLayout,entries:[{binding:0,resource:{buffer:this.globalBuffer}}]});let c=a.createShaderModule({code:jy});this.highlightPipeline=a.createRenderPipeline({layout:a.createPipelineLayout({bindGroupLayouts:[this.edgeLayout]}),vertex:{module:c,entryPoint:"vs",buffers:[{arrayStride:8,attributes:[{shaderLocation:0,offset:0,format:"float32x2"}]}]},fragment:{module:c,entryPoint:"fs",targets:[{format:this.format,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"line-list"}}),this.highlightBufferSize=4*1024*1024,this.highlightBuffer=a.createBuffer({size:this.highlightBufferSize,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});let l=a.createShaderModule({code:Ly});this.netFlowPipeline=a.createRenderPipeline({layout:a.createPipelineLayout({bindGroupLayouts:[this.edgeLayout]}),vertex:{module:l,entryPoint:"vs",buffers:[{arrayStride:16,attributes:[{shaderLocation:0,offset:0,format:"float32x2"},{shaderLocation:1,offset:8,format:"float32x2"}]}]},fragment:{module:l,entryPoint:"fs",targets:[{format:this.format,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"triangle-list"}}),this.netFlowBuffer=a.createBuffer({size:cu*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),this.globalUniformScratch=new Float32Array(12),this.pageUniformScratch=new Float32Array(8),this.imageUniformScratch=new Float32Array(8),this.vectorScratch=new Float32Array(Fr),this.highlightScratch=new Float32Array(this.highlightBufferSize/4),this.netFlowScratch=new Float32Array(cu),this.netTrackingCache=null,this.selectedIntrasheetLinkIndex=-1,this.truncatedHighlightCount=0,this.truncatedVectorCount=0,this.frameSerial=0,this.querySerial=0;let f=a.createShaderModule({code:Dy});this.vectorPipeline=a.createRenderPipeline({layout:a.createPipelineLayout({bindGroupLayouts:[this.edgeLayout]}),vertex:{module:f,entryPoint:"vs",buffers:[{arrayStride:24,attributes:[{shaderLocation:0,offset:0,format:"float32x2"},{shaderLocation:1,offset:8,format:"float32x4"}]}]},fragment:{module:f,entryPoint:"fs",targets:[{format:this.format,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"triangle-list"}}),this.vectorBuffer=a.createBuffer({size:Fr*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),this.vectorBuffers=[this.vectorBuffer];let u=a.createShaderModule({code:Uy});this.imagePipeline=a.createRenderPipeline({layout:a.createPipelineLayout({bindGroupLayouts:[this.bindGroupLayout]}),vertex:{module:u,entryPoint:"vs"},fragment:{module:u,entryPoint:"fs",targets:[{format:this.format,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"triangle-list"}});let p=a.createShaderModule({code:zy});this.pickPipeline=a.createRenderPipeline({layout:a.createPipelineLayout({bindGroupLayouts:[this.edgeLayout]}),vertex:{module:p,entryPoint:"vs",buffers:[{arrayStride:12,attributes:[{shaderLocation:0,offset:0,format:"float32x2"},{shaderLocation:1,offset:8,format:"uint32"}]}]},fragment:{module:p,entryPoint:"fs",targets:[{format:"r32uint"}]},primitive:{topology:"triangle-list"}}),this.pickVertexBuffer=a.createBuffer({size:Br*12,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),this.pickReadBuffer=a.createBuffer({size:256,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST}),this.pickTexture=null,this.pickTextureSize=[0,0],this.pickPending=!1,this.vectorChunks=new Map,this.failedVectorChunks=new Map,this.nativeDetailState=new Map,this.domDetailPageIds=new Set,this.nativeDetailThresholds=new Map,this.residentVectorBytes=0,this.sampler=a.createSampler({magFilter:"linear",minFilter:"linear",mipmapFilter:"linear"}),this.placeholder=this.createSolidTexture([245,247,249,255]),this.pageResources=new Map,this.imageResources=new Map,this.loading=new Map,this.selectedPageId="",this.selectedFeatureId=0,this.activeNetUid="",this.showHierarchy=!0,this.downloadedBytes=0,this.world=r.worldBoundsMm,this.center=[(this.world.minX+this.world.maxX)/2,(this.world.minY+this.world.maxY)/2],this.scale=Math.max((this.world.maxX-this.world.minX)/900,(this.world.maxY-this.world.minY)/650,.1)*1.16,this.edgeBuffer=this.createEdgeBuffer();for(let b of this.pages)this.createPageResource(b)}createSolidTexture(t){let a=this.device.createTexture({size:[1,1],format:"rgba8unorm-srgb",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});return this.device.queue.writeTexture({texture:a},new Uint8Array(t),{bytesPerRow:4},[1,1]),a}createPageResource(t){let a=this.device.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),s={page:t,uniform:a,texture:this.placeholder,textureWidth:0,svgBlob:null,bindGroup:null};this.pageResources.set(t.id,s),this.updateBindGroup(s)}createImageResource(t){let a=this.device.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),s={path:t,uniform:a,texture:this.placeholder,loaded:!1,bindGroup:null};return this.imageResources.set(t,s),this.updateBindGroup(s),s}updateBindGroup(t){t.bindGroup=this.device.createBindGroup({layout:this.bindGroupLayout,entries:[{binding:0,resource:{buffer:this.globalBuffer}},{binding:1,resource:{buffer:t.uniform}},{binding:2,resource:this.sampler},{binding:3,resource:t.texture.createView()}]})}async loadImageTexture(t){let a=this.imageResources.get(t)||this.createImageResource(t);if(a.loaded)return a;let s=`image:${t}`;if(this.loading.has(s))return this.loading.get(s);let r=(async()=>{try{let n=await fetch(new URL(t,this.manifestUrl),{cache:"default"});if(!n.ok)throw new Error(`Failed to load schematic image ${t}: ${n.status}`);let i=await n.blob(),o=await createImageBitmap(i),c=this.device.createTexture({size:[o.width,o.height],format:"rgba8unorm-srgb",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});this.device.queue.copyExternalImageToTexture({source:o},{texture:c},[o.width,o.height]),o.close(),a.texture!==this.placeholder&&a.texture.destroy(),a.texture=c,a.loaded=!0,this.updateBindGroup(a)}finally{this.loading.delete(s)}return a})();return this.loading.set(s,r),r}createEdgeBuffer(){let t=new Map(this.pages.map(n=>[n.id,n])),a=[];for(let n of this.manifest.edges||[]){let i=t.get(n.source),o=t.get(n.target);!i||!o||a.push(i.worldX+i.widthMm/2,i.worldY+i.heightMm,o.worldX+o.widthMm/2,o.worldY)}let s=new Float32Array(a);if(!s.length)return null;let r=this.device.createBuffer({size:s.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});return this.device.queue.writeBuffer(r,0,s),{buffer:r,count:s.length/2}}resize(){let t=Math.min(devicePixelRatio||1,2),a=Math.max(1,Math.floor(this.canvas.clientWidth*t)),s=Math.max(1,Math.floor(this.canvas.clientHeight*t));(this.canvas.width!==a||this.canvas.height!==s)&&(this.canvas.width=a,this.canvas.height=s),this.flowCanvas&&(this.flowCanvas.width!==a||this.flowCanvas.height!==s)&&(this.flowCanvas.width=a,this.flowCanvas.height=s)}setFlowOverlayCanvas(t){t&&(this.flowCanvas=t,this.flowContext=t.getContext("webgpu"),this.flowContext.configure({device:this.device,format:this.format,alphaMode:"premultiplied"}))}writeGlobals(){let t=this.globalUniformScratch;t[0]=this.center[0],t[1]=this.center[1],t[2]=this.scale,t[3]=performance.now()*.001,t[4]=this.canvas.width,t[5]=this.canvas.height,this.device.queue.writeBuffer(this.globalBuffer,0,t)}pagePixelWidth(t){return t.widthMm/this.scale}pageSourcePixelsPerMm(t){let a=this.pagePixelWidth(t)/Math.max(1,t.sourceWidthMm||t.widthMm),s=t.heightMm/this.scale/Math.max(1,t.sourceHeightMm||t.heightMm);return Math.min(a,s)}pageNativeDetailThresholds(t){let a=this.nativeDetailThresholds.get(t.id);if(a)return a;let s=Math.max(1,t.sourceWidthMm||t.widthMm),r=Math.max(1,t.sourceHeightMm||t.heightMm),n=s*r,i=Math.max(0,t.featureCount||t.featureIds?.length||0)/Math.max(1,n),o=ce(1-i*72,.84,1.08),c=ce(Math.sqrt(Math.max(s,r)/Math.max(1,Math.min(s,r)))/1.18,.92,1.14),l=ce(Gy*o*c,5,7.4),f={enter:l,exit:ce(Math.min(l-1.2,Ky*o),3.8,l-.7),prefetch:ce(Math.min(l-2,Vy*o),3,l-1)};return this.nativeDetailThresholds.set(t.id,f),f}pageWantsNativeDetail(t){if(!this.pageHasNativeDetail(t))return!1;let a=this.pageSourcePixelsPerMm(t),s=this.nativeDetailState.get(t.id)===!0,r=this.pageNativeDetailThresholds(t),n=s?r.exit:r.enter,i=a>=n;return i!==s&&this.nativeDetailState.set(t.id,i),i}pageNativeDetailReady(t){if(this.domDetailPageIds.has(t.id)||!this.pageWantsNativeDetail(t))return!1;let a=this.vectorChunks.get(t.id);return!a?.loaded||!a.segments?.length&&!a.fills?.length?!1:this.visibleNativeImagesReady(t,a)}visibleNativeImagesReady(t,a){if(!a?.images?.length)return!0;let s=this.sourceViewportBounds(t,4),r=!0;for(let n of a.images){if(!wt(n.bounds,s))continue;(this.imageResources.get(n.path)||this.createImageResource(n.path)).loaded||(r=!1,this.loadImageTexture(n.path).catch(()=>{}))}return r}visiblePages(){let t=this.canvas.width*this.scale/2,a=this.canvas.height*this.scale/2,s=this.center[0]-t,r=this.center[0]+t,n=this.center[1]-a,i=this.center[1]+a;return this.pages.filter(o=>o.worldX+o.widthMm>=s&&o.worldX<=r&&o.worldY+o.heightMm>=n&&o.worldY<=i)}worldViewportBounds(t=0){let a=this.canvas.width*this.scale/2,s=this.canvas.height*this.scale/2;return[this.center[0]-a-t,this.center[1]-s-t,this.center[0]+a+t,this.center[1]+s+t]}sourceViewportBounds(t,a=2.5){let s=this.worldViewportBounds(this.scale*8),r=(s[0]-t.worldX)/t.widthMm*t.sourceWidthMm-a,n=(s[1]-t.worldY)/t.heightMm*t.sourceHeightMm-a,i=(s[2]-t.worldX)/t.widthMm*t.sourceWidthMm+a,o=(s[3]-t.worldY)/t.heightMm*t.sourceHeightMm+a;return[Math.max(-a,Math.min(r,i)),Math.max(-a,Math.min(n,o)),Math.min(t.sourceWidthMm+a,Math.max(r,i)),Math.min(t.sourceHeightMm+a,Math.max(n,o))]}render(){this.frameSerial+=1,this.resize(),this.writeGlobals();let t=this.visiblePages(),a=this.device.createCommandEncoder(),s=a.beginRenderPass({colorAttachments:[{view:this.context.getCurrentTexture().createView(),clearValue:{r:.045,g:.055,b:.073,a:1},loadOp:"clear",storeOp:"store"}]});this.showHierarchy&&this.edgeBuffer&&(s.setPipeline(this.edgePipeline),s.setBindGroup(0,this.edgeBindGroup),s.setVertexBuffer(0,this.edgeBuffer.buffer),s.draw(this.edgeBuffer.count)),s.setPipeline(this.pagePipeline);for(let i of t){let o=this.pageResources.get(i.id),c=this.activeNetUid&&i.netUids.includes(this.activeNetUid),l=this.domDetailPageIds.has(i.id),f=!l&&this.pageNativeDetailReady(i),u=this.pageUniformScratch;u[0]=i.worldX,u[1]=i.worldY,u[2]=i.widthMm,u[3]=i.heightMm,u[4]=i.id===this.selectedPageId?1:0,u[5]=c?1:0,u[6]=this.activeNetUid?1:0,u[7]=f||l?1:0,this.device.queue.writeBuffer(o.uniform,0,u),s.setBindGroup(0,o.bindGroup),s.draw(6);let p=ce(Math.ceil(this.pagePixelWidth(i)*1.3/512)*512,512,6144);o.textureWidth<p*.82&&this.loadPageTexture(i,p).catch(()=>{})}this.scheduleVisibleVectorLoads(t),this.drawVisibleImages(s,t),this.drawVisibleVectors(s,t);let r=this.writeNetTrackingOverlay();r&&!this.flowContext&&(s.setPipeline(this.netFlowPipeline),s.setBindGroup(0,this.edgeBindGroup),s.setVertexBuffer(0,this.netFlowBuffer),s.draw(r));let n=this.writeNetHighlights(t);return n&&(s.setPipeline(this.highlightPipeline),s.setBindGroup(0,this.edgeBindGroup),s.setVertexBuffer(0,this.highlightBuffer),s.draw(n)),s.end(),this.device.queue.submit([a.finish()]),this.renderFlowOverlay(r),this.evictVectorChunks(t),t}renderFlowOverlay(t){if(!this.flowContext)return;let a=this.device.createCommandEncoder(),s=a.beginRenderPass({colorAttachments:[{view:this.flowContext.getCurrentTexture().createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}]});t&&(s.setPipeline(this.netFlowPipeline),s.setBindGroup(0,this.edgeBindGroup),s.setVertexBuffer(0,this.netFlowBuffer),s.draw(t)),s.end(),this.device.queue.submit([a.finish()])}drawVisibleImages(t,a){if(!this.isNativeScene)return;let s=!1;for(let r of a){if(this.domDetailPageIds.has(r.id)||!this.pageNativeDetailReady(r))continue;let n=this.vectorChunks.get(r.id);if(!n?.images?.length)continue;let i=this.sourceViewportBounds(r,4);for(let o of n.images){if(!wt(o.bounds,i))continue;let c=this.imageResources.get(o.path)||this.createImageResource(o.path);c.loaded||this.loadImageTexture(o.path).catch(()=>{});let l=o.worldOrigin||this.sourceToWorld(r,[o.xMm,o.yMm]),f=o.worldSize||this.sourceSizeToWorld(r,o.widthMm,o.heightMm),u=this.imageUniformScratch;u[0]=l[0],u[1]=l[1],u[2]=f[0],u[3]=f[1],u[4]=0,u[5]=0,u[6]=0,u[7]=0,this.device.queue.writeBuffer(c.uniform,0,u),s||(t.setPipeline(this.imagePipeline),s=!0),t.setBindGroup(0,c.bindGroup),t.draw(6)}}}drawVisibleVectors(t,a){if(!this.isNativeScene)return 0;let s=this.vectorScratch,r=0,n=0,i=0,o=0,c=!1,l=()=>{if(!r)return;let u=this.vectorBuffers[o];u||(u=this.device.createBuffer({size:Fr*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),this.vectorBuffers.push(u)),this.device.queue.writeBuffer(u,0,s,0,r),c||(t.setPipeline(this.vectorPipeline),t.setBindGroup(0,this.edgeBindGroup),c=!0);let p=Math.floor(r/6);t.setVertexBuffer(0,u),t.draw(p),i+=p,o+=1,r=0},f=u=>u>ou||u>s.length?(n+=1,!1):((r+u>ou||r+u>s.length)&&l(),!0);for(let u of a){if(this.domDetailPageIds.has(u.id)||!this.pageHasNativeDetail(u))continue;let p=this.vectorChunks.get(u.id);if(!p?.segments?.length&&!p?.fills?.length||!this.pageNativeDetailReady(u))continue;p.lastUsedFrame=this.frameSerial;let b=this.sourceViewportBounds(u),h=fu(p.spatial,b);for(let d of h.fills){if(!wt(d.bounds,b)||!f(18))continue;let x=this.featuresById.get(d.featureId),g=this.activeNetUid&&x?.netUid===this.activeNetUid,m=this.selectedFeatureId===d.featureId?[.24,.58,1,1]:g?[.06,1,.24,1]:this.activeNetUid&&ds(x)?gu(x,d.kind,d.color):qi(x,d.kind,d.color),v=d.worldPoints||d.points.map(E=>this.sourceToWorld(u,E));r=hx(s,r,v[0],v[1],v[2],m)}for(let d of h.segments){if(!wt(d.bounds,b))continue;let x=this.featuresById.get(d.featureId),g=this.activeNetUid&&x?.netUid===this.activeNetUid,y=this.selectedFeatureId===d.featureId,m=y?[.24,.58,1,1]:g?[.06,1,.24,1]:this.activeNetUid&&ds(x)?gu(x,d.kind,d.color):qi(x,d.kind,d.color),v=this.segmentWorldWidth(u,d,x,g||y);for(let E of this.visibleSegmentParts(u,d,x)){if(!f(36))continue;let S=E.worldA||this.sourceToWorld(u,E.a),A=E.worldB||this.sourceToWorld(u,E.b);r=fx(s,r,S,A,v,m)}}}return l(),this.truncatedVectorCount=n,this.vectorTruncated=n>0,this.lastVectorVertices=i,this.lastVectorChunks=o,i}pageHasNativeDetail(t){return this.isNativeScene?t?.nativeDetail?.enabled!==!1:!1}scheduleVisibleVectorLoads(t){if(!this.isNativeScene)return;let a=[...this.vectorChunks.values()].filter(n=>n?.promise&&!n.loaded).length,s=Math.max(0,Xy-a);if(!s)return;let r=t.filter(n=>!this.domDetailPageIds.has(n.id)).filter(n=>this.pageHasNativeDetail(n)&&this.pageSourcePixelsPerMm(n)>=this.pageNativeDetailThresholds(n).prefetch).filter(n=>!this.vectorChunks.get(n.id)?.loaded&&!this.vectorChunks.get(n.id)?.promise).sort((n,i)=>{let o=Math.hypot(n.worldX+n.widthMm/2-this.center[0],n.worldY+n.heightMm/2-this.center[1]),c=Math.hypot(i.worldX+i.widthMm/2-this.center[0],i.worldY+i.heightMm/2-this.center[1]);return o-c});for(let n of r)if(this.loadPageVectors(n).catch(()=>{}),s-=1,!s)break}featurePrimitiveBounds(t,a){let s=this.vectorChunks.get(t.id);if(!s?.segments?.length&&!s?.fills?.length)return null;let r=[],n=[];for(let i of s.segments||[])i.featureId===a&&(r.push(i.a[0],i.b[0]),n.push(i.a[1],i.b[1]));for(let i of s.fills||[])if(i.featureId===a)for(let o of i.points||[])r.push(o[0]),n.push(o[1]);return r.length?[Math.min(...r),Math.min(...n),Math.max(...r),Math.max(...n)]:null}symbolClipBounds(t){if(this._symbolClipBounds||(this._symbolClipBounds=new Map),this._symbolClipBounds.has(t.id))return this._symbolClipBounds.get(t.id);let a=(this.featuresByPage[t.id]||[]).filter(s=>s?.kind==="symbol_body"&&s.boundsMm&&!String(s.sourceId||"").includes(":overplot")).map(s=>{let r=this.featurePrimitiveBounds(t,s.id)||s.boundsMm;return[r[0]-.02,r[1]-.02,r[2]+.02,r[3]+.02]}).filter(s=>{let r=s[2]-s[0],n=s[3]-s[1];return Math.max(r,n)<=12&&r*n<=80});return this._symbolClipBounds.set(t.id,a),a}visibleSegmentParts(t,a,s){if(a._visibleParts)return a._visibleParts;let r=String(s?.kind||""),n=String(s?.semanticRole||"");if(r!=="wire"&&n!=="wire")return a._visibleParts=[a],a._visibleParts;let i=[a];for(let o of this.symbolClipBounds(t)){let c=[];for(let l of i)c.push(...gx(l,o));if(i=c,!i.length)break}for(let o of i)o.worldA=Ta(t,o.a),o.worldB=Ta(t,o.b);return a._visibleParts=i,a._visibleParts}netTrackingSegments(){if(!this.activeNetUid)return{netUid:"",anchorsByPage:new Map,segments:[],intrasheetSegments:[]};let t=Number(this.selectedFeatureId||0),a=String(this.selectedFeatureKey||""),s=String(this.selectedSourceId||"");if(this.netTrackingCache?.netUid===this.activeNetUid&&this.netTrackingCache?.selectedFeatureId===t&&this.netTrackingCache?.selectedFeatureKey===a&&this.netTrackingCache?.selectedSourceId===s)return this.netTrackingCache;this.selectedIntrasheetLinkIndex=-1;let r=new Map(this.pages.map(h=>[h.id,h])),n=this.manifest.netToPages?.[this.activeNetUid]||[],i=n.length?n.map(h=>r.get(h)).filter(Boolean):this.pages.filter(h=>h.netUids?.includes(this.activeNetUid)),o=new Map;for(let h of i.slice(0,qy)){let d=this.netTrackingAnchorsForPage(h);d.length&&o.set(h.id,d)}let c=[],l=[];for(let[h,d]of o){let x=bu(cx(d),"intrasheet",h);c.push(...x),l.push(...x)}let f=[...o.entries()].map(([h,d])=>lx(r.get(h),d,{featureId:t,stableKey:a,sourceId:s})).filter(Boolean);c.push(...bu(f,"intersheet",""));let u=l.map((h,d)=>({...h,intrasheetIndex:d})),p=0,b=c.map((h,d)=>{if(h.type!=="intrasheet")return{...h,id:d};let x=p;return p+=1,{...h,id:d,intrasheetIndex:x}});return this.netTrackingCache={netUid:this.activeNetUid,selectedFeatureId:t,selectedFeatureKey:a,selectedSourceId:s,anchorsByPage:o,segments:b,intrasheetSegments:u},this.selectedIntrasheetLinkIndex>=this.netTrackingCache.intrasheetSegments.length&&(this.selectedIntrasheetLinkIndex=-1),this.netTrackingCache}netTrackingAnchorsForPage(t){let a=this.featuresByPage[t.id]||[],s=[];for(let r of a){if(r.netUid!==this.activeNetUid||!r.boundsMm||!ix(r))continue;let n=r.boundsMm,i=[(n[0]+n[2])/2,(n[1]+n[3])/2],o=this.sourceToWorld(t,i);s.push({pageId:t.id,featureId:Number(r.id||0),stableKey:String(r.stableKey||""),sourceId:String(r.sourceId||r.sourceUid||r.objectId||""),kind:r.kind||r.semanticRole||"",source:i,world:o,bounds:n,priority:ox(r)})}return s.sort((r,n)=>n.priority-r.priority||r.source[1]-n.source[1]||r.source[0]-n.source[0]),s}writeNetTrackingOverlay(){let t=this.netTrackingSegments();if(this.lastNetFlowSegments=t.segments.length,this.lastNetFlowIntrasheetSegments=t.intrasheetSegments.length,!t.segments.length)return this.lastNetFlowVertices=0,0;let a=this.worldViewportBounds(this.scale*96),s=this.netFlowScratch,r=0,n=0;for(let i of t.segments){if(!wt(pu(i),a))continue;let o=i.type==="intrasheet"&&i.intrasheetIndex===this.selectedIntrasheetLinkIndex,c=o?9.5:i.type==="intersheet"?8:4.8,l=o?2:i.type==="intersheet"?1:0,f=bx(s,r,i.a,i.b,c*this.scale,l,n,this.scale);if(f!==r&&(r=f,n+=Math.hypot(i.b[0]-i.a[0],i.b[1]-i.a[1])/Math.max(this.scale,1e-6),r+24>s.length))break}return r?(this.device.queue.writeBuffer(this.netFlowBuffer,0,s,0,r),this.lastNetFlowVertices=r/4,r/4):(this.lastNetFlowVertices=0,0)}cycleNetIntrasheetLink(t=1){let a=this.netTrackingSegments();if(!a.intrasheetSegments.length)return null;let s=a.intrasheetSegments.length;this.selectedIntrasheetLinkIndex=(this.selectedIntrasheetLinkIndex+t+s)%s;let r=a.intrasheetSegments[this.selectedIntrasheetLinkIndex];if(!r)return null;let n=pu(r,14*this.scale);return this.center=[(n[0]+n[2])/2,(n[1]+n[3])/2],this.scale=Math.max((n[2]-n[0])/Math.max(1,this.canvas.width*.36),(n[3]-n[1])/Math.max(1,this.canvas.height*.3),this.scale*.35,.025),{pageId:r.pageId,segment:r}}writeNetHighlights(t){if(!this.activeNetUid)return 0;let a=this.highlightScratch,s=0,r=0;for(let n of t){let i=this.sourceViewportBounds(n,5);for(let o of this.featuresByPage[n.id]||[]){if(o.netUid!==this.activeNetUid||!o.boundsMm||!wt(o.boundsMm,i))continue;let c=this.featureWorldBounds(n,o.boundsMm);if(s+16>a.length){r+=1;continue}a[s++]=c[0],a[s++]=c[1],a[s++]=c[2],a[s++]=c[1],a[s++]=c[2],a[s++]=c[1],a[s++]=c[2],a[s++]=c[3],a[s++]=c[2],a[s++]=c[3],a[s++]=c[0],a[s++]=c[3],a[s++]=c[0],a[s++]=c[3],a[s++]=c[0],a[s++]=c[1]}}return this.truncatedHighlightCount=r,s?(this.device.queue.writeBuffer(this.highlightBuffer,0,a,0,s),s/2):0}featureWorldBounds(t,a){return[t.worldX+a[0]/t.sourceWidthMm*t.widthMm,t.worldY+a[1]/t.sourceHeightMm*t.heightMm,t.worldX+a[2]/t.sourceWidthMm*t.widthMm,t.worldY+a[3]/t.sourceHeightMm*t.heightMm]}sourceToWorld(t,a){return[t.worldX+a[0]/t.sourceWidthMm*t.widthMm,t.worldY+a[1]/t.sourceHeightMm*t.heightMm]}sourceSizeToWorld(t,a,s){return[a/t.sourceWidthMm*t.widthMm,s/t.sourceHeightMm*t.heightMm]}async loadPageVectors(t){if(!this.pageHasNativeDetail(t)||!t.chunks?.lod2)return null;let a=this.vectorChunks.get(t.id);if(a?.loaded)return a;if(a?.promise)return a.promise;let s=(async()=>{try{let r=await fetch(new URL(t.chunks.lod2,this.manifestUrl));if(!r.ok)throw new Error(`Failed to load schematic vector chunk ${t.id}: ${r.status}`);let n=await r.json(),i=Jy(n.primitives||[]);Qy(t,i);let c=JSON.stringify(n).length,l={loaded:!0,segments:i.segments,fills:i.fills,images:i.images,spatial:nx(i),unsupported:n.unsupported||[],bytes:c,lastUsedFrame:this.frameSerial};return this.vectorChunks.set(t.id,l),this.failedVectorChunks.delete(t.id),this.residentVectorBytes+=c,l}catch(r){let n=this.failedVectorChunks.get(t.id)||{count:0,message:""};throw this.failedVectorChunks.set(t.id,{count:n.count+1,message:r?.message||String(r)}),this.vectorChunks.delete(t.id),r}})();return this.vectorChunks.set(t.id,{loaded:!1,promise:s,segments:[]}),s}evictVectorChunks(t){if(this.residentVectorBytes<=du)return;let a=new Set(t.map(r=>r.id)),s=[...this.vectorChunks.entries()].filter(([,r])=>r?.loaded).filter(([r])=>!a.has(r)&&r!==this.selectedPageId).sort((r,n)=>(r[1].lastUsedFrame||0)-(n[1].lastUsedFrame||0));for(let[r,n]of s)if(this.vectorChunks.delete(r),this.residentVectorBytes=Math.max(0,this.residentVectorBytes-(n.bytes||0)),this.residentVectorBytes<=du*.82)break}stats(){let t=this.visiblePages(),a=t.map(r=>this.pageSourcePixelsPerMm(r)),s=t.map(r=>this.pageNativeDetailThresholds(r).enter);return{residentVectorBytes:this.residentVectorBytes,vectorChunks:[...this.vectorChunks.values()].filter(r=>r?.loaded).length,vectorLoads:[...this.vectorChunks.values()].filter(r=>r?.promise&&!r.loaded).length,failedVectorChunks:this.failedVectorChunks.size,vectorVertices:this.lastVectorVertices||0,vectorDrawChunks:this.lastVectorChunks||0,truncatedVectors:this.truncatedVectorCount||0,nativeDetailPages:[...this.nativeDetailState.values()].filter(Boolean).length,nativePxPerMm:Number((Math.max(0,...a)||0).toFixed(2)),nativeThresholdPxPerMm:Number((s.length?Math.min(...s):0).toFixed(2)),domDetailPages:this.domDetailPageIds.size,netFlowSegments:this.lastNetFlowSegments||0,netFlowIntrasheetSegments:this.lastNetFlowIntrasheetSegments||0,netFlowVertices:this.lastNetFlowVertices||0}}setDomDetailPageIds(t){this.domDetailPageIds=new Set(t||[])}async loadPageTexture(t,a){let s=`${t.id}:${a}`;if(this.loading.has(s))return this.loading.get(s);let r=this.pageResources.get(t.id);if(!r||r.textureWidth>=a)return;let n=(async()=>{if(!r.svgBlob){let c=await fetch(new URL($y(t),this.manifestUrl));if(!c.ok)throw new Error(`Failed to load schematic page ${t.name}: ${c.status}`);r.svgBlob=await c.blob(),this.downloadedBytes+=r.svgBlob.size}let i=r.svgBlob,o=URL.createObjectURL(i);try{let c=new Image;if(c.decoding="async",c.src=o,await c.decode(),r.textureWidth>=a)return;let l=Math.max(64,Math.round(a*t.heightMm/t.widthMm)),f=new OffscreenCanvas(a,l),u=f.getContext("2d",{alpha:!1});u.fillStyle="#ffffff",u.fillRect(0,0,a,l),u.drawImage(c,0,0,a,l);let p=await createImageBitmap(f),b=this.device.createTexture({size:[a,l],format:"rgba8unorm-srgb",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});this.device.queue.copyExternalImageToTexture({source:p},{texture:b},[a,l]),p.close(),r.texture!==this.placeholder&&r.texture.destroy(),r.texture=b,r.textureWidth=a,this.updateBindGroup(r)}finally{URL.revokeObjectURL(o),this.loading.delete(s)}})();return this.loading.set(s,n),n}preloadOverview(){let t=[...this.pages],a=async()=>{for(;t.length;){let s=t.shift();await this.loadPageTexture(s,512).catch(()=>{})}};return Promise.all(Array.from({length:Math.min(4,t.length)},a))}screenToWorld(t,a){let s=this.canvas.getBoundingClientRect(),r=(t-s.left)*this.canvas.width/s.width,n=(a-s.top)*this.canvas.height/s.height;return[this.center[0]+(r-this.canvas.width/2)*this.scale,this.center[1]+(n-this.canvas.height/2)*this.scale]}worldToScreen(t,a){let s=this.canvas.clientWidth/this.canvas.width,r=this.canvas.clientHeight/this.canvas.height;return[((t-this.center[0])/this.scale+this.canvas.width/2)*s,((a-this.center[1])/this.scale+this.canvas.height/2)*r]}hitPage(t,a){let[s,r]=this.screenToWorld(t,a);return[...this.pages].reverse().find(n=>s>=n.worldX&&s<=n.worldX+n.widthMm&&r>=n.worldY&&r<=n.worldY+n.heightMm)||null}async pickFeature(t,a){if(!this.isNativeScene)return this.hitFeature(t,a);let s=this.hitPage(t,a);if(!s)return null;if(!this.pageHasNativeDetail(s))return this.hitFeature(t,a);await this.loadPageVectors(s);let r=await this.gpuPickFeature(s,t,a);return r&&!ls(r)?{page:s,feature:r,source:this.clientToSource(s,t,a),native:!0,gpu:!0}:this.hitFeature(t,a)}hitFeature(t,a){let s=this.hitPage(t,a);if(!s)return null;let[r,n]=this.clientToSource(s,t,a),i=Math.max(.45,5*this.scale*this.canvas.width/Math.max(1,this.canvas.clientWidth)*s.sourceWidthMm/s.widthMm),o=this.hitResidentVectorFeature(s,r,n,i);if(o)return{page:s,feature:o,source:[r,n],native:!0};let c=this.hitSymbolInterior(s,r,n);if(c)return{page:s,feature:c,source:[r,n],native:!0,interior:!0};let l=(this.featuresByPage[s.id]||[]).filter(f=>{if(ls(f))return!1;let u=f.boundsMm;return u&&r>=u[0]-i&&r<=u[2]+i&&n>=u[1]-i&&n<=u[3]+i}).map(f=>({feature:f,priority:cs(f),area:Math.max(1e-4,(f.boundsMm[2]-f.boundsMm[0])*(f.boundsMm[3]-f.boundsMm[1]))})).sort((f,u)=>u.priority-f.priority||f.area-u.area);return{page:s,feature:l[0]?.feature||null,source:[r,n]}}hitSymbolInterior(t,a,s){let r=null;for(let n of this.featuresByPage[t.id]||[]){let i=String(n?.kind||"");if(i!=="symbol_body"&&i!=="symbol_instance"||String(n?.sourceId||"").includes(":overplot"))continue;let o=n.boundsMm;if(!o||a<o[0]||a>o[2]||s<o[1]||s>o[3])continue;let c=Math.max(1e-4,(o[2]-o[0])*(o[3]-o[1])),l=(i==="symbol_body"?0:1e6)+c;(!r||l<r.score)&&(r={feature:n,score:l})}return r?.feature||null}clientToSource(t,a,s){let[r,n]=this.screenToWorld(a,s);return[(r-t.worldX)/t.widthMm*t.sourceWidthMm,(n-t.worldY)/t.heightMm*t.sourceHeightMm]}ensurePickTexture(){this.pickTexture&&this.pickTextureSize[0]===this.canvas.width&&this.pickTextureSize[1]===this.canvas.height||(this.pickTexture&&this.pickTexture.destroy(),this.pickTexture=this.device.createTexture({size:[this.canvas.width,this.canvas.height],format:"r32uint",usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC}),this.pickTextureSize=[this.canvas.width,this.canvas.height])}writePickVectors(t){let a=new ArrayBuffer(Br*12),s=new DataView(a),r=0,n=[];for(let i of t){let o=this.vectorChunks.get(i.id);if(!o?.segments?.length&&!o?.fills?.length&&!o?.images?.length)continue;let c=this._pickSourcePointByPage?.get(i.id),l=c?[c[0]-2.5,c[1]-2.5,c[0]+2.5,c[1]+2.5]:[0,0,i.sourceWidthMm,i.sourceHeightMm],f=fu(o.spatial,l);for(let u of f.images){if(!wt(u.bounds,l))continue;let p=this.featuresById.get(u.featureId);!p||ls(p)||n.push({page:i,image:u,feature:p,priority:cs(p)-5})}for(let u of f.fills){if(!wt(u.bounds,l))continue;let p=this.featuresById.get(u.featureId);!p||ls(p)||n.push({page:i,fill:u,feature:p,priority:cs(p)-2})}for(let u of f.segments){if(!wt(u.bounds,l))continue;let p=this.featuresById.get(u.featureId);!p||ls(p)||n.push({page:i,segment:u,feature:p,priority:cs(p)})}}n.sort((i,o)=>i.priority-o.priority);for(let{page:i,segment:o,fill:c,image:l,feature:f}of n){if(r+6>Br)break;if(l){let u=this.sourceToWorld(i,[l.xMm,l.yMm]),p=this.sourceToWorld(i,[l.xMm+l.widthMm,l.yMm]),b=this.sourceToWorld(i,[l.xMm,l.yMm+l.heightMm]),h=this.sourceToWorld(i,[l.xMm+l.widthMm,l.yMm+l.heightMm]);r=Hi(s,r,u,p,b,l.featureId),r=Hi(s,r,b,p,h,l.featureId)}else if(c){let u=c.worldPoints||c.points.map(p=>this.sourceToWorld(i,p));r=Hi(s,r,u[0],u[1],u[2],c.featureId)}else{let u=Math.max(this.segmentWorldWidth(i,o,f,!1),this.scale*7);for(let p of this.visibleSegmentParts(i,o,f)){if(r+6>Br)break;let b=p.worldA||this.sourceToWorld(i,p.a),h=p.worldB||this.sourceToWorld(i,p.b);r=mx(s,r,b,h,u,o.featureId)}}}return r?(this.device.queue.writeBuffer(this.pickVertexBuffer,0,a,0,r*12),r):0}async gpuPickFeature(t,a,s){if(this.pickPending)return null;let r=this.clientToSource(t,a,s);this._pickSourcePointByPage=new Map([[t.id,r]]);let n=this.writePickVectors([t]);if(this._pickSourcePointByPage=null,!n)return null;this.resize(),this.writeGlobals(),this.ensurePickTexture();let i=this.canvas.getBoundingClientRect(),o=Math.max(0,Math.min(this.canvas.width-1,Math.floor((a-i.left)*this.canvas.width/i.width))),c=Math.max(0,Math.min(this.canvas.height-1,Math.floor((s-i.top)*this.canvas.height/i.height))),l=this.device.createCommandEncoder(),f=l.beginRenderPass({colorAttachments:[{view:this.pickTexture.createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}]});f.setPipeline(this.pickPipeline),f.setBindGroup(0,this.edgeBindGroup),f.setVertexBuffer(0,this.pickVertexBuffer),f.draw(n),f.end(),l.copyTextureToBuffer({texture:this.pickTexture,origin:{x:o,y:c}},{buffer:this.pickReadBuffer,bytesPerRow:256,rowsPerImage:1},{width:1,height:1,depthOrArrayLayers:1}),this.pickPending=!0,this.device.queue.submit([l.finish()]);try{await this.pickReadBuffer.mapAsync(GPUMapMode.READ);let u=new DataView(this.pickReadBuffer.getMappedRange()).getUint32(0,!0);return this.pickReadBuffer.unmap(),u&&this.featuresById.get(u)||null}finally{this.pickReadBuffer.mapState==="mapped"&&this.pickReadBuffer.unmap(),this.pickPending=!1}}hitResidentVectorFeature(t,a,s,r){if(!this.isNativeScene)return null;let n=this.vectorChunks.get(t.id);if(!n?.loaded)return null;let i=null;for(let o of n.segments){let c=this.featuresById.get(o.featureId),l=Math.max(r,(o.widthMm||0)*.5+r*.45);if(c)for(let f of this.visibleSegmentParts(t,o,c)){let u=px([a,s],f.a,f.b);if(u>l)continue;let p=u-cs(c)*.025+(ds(c)?0:8);(!i||p<i.score)&&(i={feature:c,score:p})}}return i?.feature||null}segmentWorldWidth(t,a,s,r){let n=(a.widthMm||.15)/Math.max(1,t.sourceWidthMm)*t.widthMm;return Math.max(n,this.scale*ux(s,a.kind,r))}pan(t,a){let s=this.canvas.width/Math.max(1,this.canvas.clientWidth);this.center[0]-=t*this.scale*s,this.center[1]-=a*this.scale*s}zoom(t,a,s){let r=this.screenToWorld(a,s);this.scale=ce(this.scale*Math.exp(t*.0015),.015,16);let n=this.screenToWorld(a,s);this.center[0]+=r[0]-n[0],this.center[1]+=r[1]-n[1]}framePage(t){t&&(this.resize(),this.center=[t.worldX+t.widthMm/2,t.worldY+t.heightMm/2],this.scale=Math.max(t.widthMm/Math.max(1,this.canvas.width*.88),t.heightMm/Math.max(1,this.canvas.height*.84)))}frameWorld(){this.resize(),this.center=[(this.world.minX+this.world.maxX)/2,(this.world.minY+this.world.maxY)/2],this.scale=Math.max((this.world.maxX-this.world.minX)/Math.max(1,this.canvas.width*.9),(this.world.maxY-this.world.minY)/Math.max(1,this.canvas.height*.88),.05)}};function $y(e){return e.thumbnail?.path||e.svg}function Yy(e){if(e.schema==="prism.schematic_vector_a0.features"){let t=new Map((e.features||[]).map(s=>[Number(s.id),s])),a={};for(let[s,r]of Object.entries(e.pages||{}))a[s]=r.map(n=>t.get(Number(n))).filter(Boolean);return a}return e.pages||{}}function Jy(e){let t=[],a=[],s=[];for(let r of e){let n=Number(r.featureId||0);if(!n)continue;if(r.kind==="plotimage"&&r.image?.path){let y=r.xMm||0,m=r.yMm||0,v=r.widthMm||0,E=r.heightMm||0;s.push({featureId:n,kind:r.kind,xMm:y,yMm:m,widthMm:v,heightMm:E,bounds:[y,m,y+v,m+E],path:r.image.path});continue}let i=String(r.semanticRole||""),o=r.radiusMm||r.diameterMm/2||0,c=String(r.fill||"").toUpperCase()==="FILLED_SHAPE",l=r.widthMm||r.pen_widthMm||(i==="junction"?.08:.15),f=String(r.lineStyle||r.line_style||"DEFAULT").toUpperCase(),u=r.color||r.strokeColor||r.style?.color||"",p=r.fillColor||r.color||r.style?.color||"",b=(y,m)=>sx(t,{featureId:n,kind:r.kind,widthMm:l,lineStyle:f,color:u},y,m),h=r.x1Mm,d=r.y1Mm,x=r.x2Mm,g=r.y2Mm;if(r.trianglesMm?.length){for(let y of r.trianglesMm)Array.isArray(y)&&y.length===3&&a.push({featureId:n,kind:r.kind,color:p,points:y,bounds:mu(y)});if(r.pointsMm?.length>=2){for(let y=1;y<r.pointsMm.length;y+=1)b(r.pointsMm[y-1],r.pointsMm[y]);hu(r)&&b(r.pointsMm[r.pointsMm.length-1],r.pointsMm[0])}}else if(r.pointsMm?.length>=2){c&&r.pointsMm.length>=3&&ax(a,n,r.kind,r.pointsMm,p);for(let y=1;y<r.pointsMm.length;y+=1)b(r.pointsMm[y-1],r.pointsMm[y]);hu(r)&&b(r.pointsMm[r.pointsMm.length-1],r.pointsMm[0])}else if(r.polylinesMm?.length){for(let y of r.polylinesMm)if(!(!Array.isArray(y)||y.length<2))for(let m=1;m<y.length;m+=1)b(y[m-1],y[m])}else if(Number.isFinite(h)&&Number.isFinite(d)&&Number.isFinite(x)&&Number.isFinite(g))r.kind==="rect"?(c&&ex(a,n,r.kind,[h,d,x,g],p),b([h,d],[x,d]),b([x,d],[x,g]),b([x,g],[h,g]),b([h,g],[h,d])):b([h,d],[x,g]);else if(Number.isFinite(r.cxMm)&&Number.isFinite(r.cyMm)){let y=r.radiusMm||r.diameterMm/2||.4;c&&tx(a,n,r.kind,[r.cxMm,r.cyMm],y,p),rx(t,{featureId:n,kind:r.kind,widthMm:l,lineStyle:f,color:u},[r.cxMm,r.cyMm],y)}else if(r.contoursMm?.length){for(let y of r.contoursMm)if(!(!Array.isArray(y)||y.length<2)){for(let m=1;m<y.length;m+=1)b(y[m-1],y[m]);b(y[y.length-1],y[0])}}else if(Number.isFinite(r.start_xMm)&&Number.isFinite(r.start_yMm)&&Number.isFinite(r.end_xMm)&&Number.isFinite(r.end_yMm))Number.isFinite(r.mid_xMm)&&Number.isFinite(r.mid_yMm)?(b([r.start_xMm,r.start_yMm],[r.mid_xMm,r.mid_yMm]),b([r.mid_xMm,r.mid_yMm],[r.end_xMm,r.end_yMm])):b([r.start_xMm,r.start_yMm],[r.end_xMm,r.end_yMm]);else if(Number.isFinite(r.start_xMm)&&Number.isFinite(r.start_yMm)&&Number.isFinite(r.mid_xMm)&&Number.isFinite(r.mid_yMm)&&Number.isFinite(r.end_xMm)&&Number.isFinite(r.end_yMm))b([r.start_xMm,r.start_yMm],[r.mid_xMm,r.mid_yMm]),b([r.mid_xMm,r.mid_yMm],[r.end_xMm,r.end_yMm]);else if(r.boundsMm&&r.kind!=="text"){let[y,m,v,E]=r.boundsMm;b([y,m],[v,m]),b([v,m],[v,E]),b([v,E],[y,E]),b([y,E],[y,m])}}return{segments:t,fills:a,images:s}}function Qy(e,t){for(let a of t.segments||[])a.worldA=Ta(e,a.a),a.worldB=Ta(e,a.b);for(let a of t.fills||[])a.worldPoints=a.points.map(s=>Ta(e,s));for(let a of t.images||[])a.worldOrigin=Ta(e,[a.xMm,a.yMm]),a.worldSize=Zy(e,a.widthMm,a.heightMm)}function Ta(e,t){return[e.worldX+t[0]/e.sourceWidthMm*e.widthMm,e.worldY+t[1]/e.sourceHeightMm*e.heightMm]}function Zy(e,t,a){return[t/e.sourceWidthMm*e.widthMm,a/e.sourceHeightMm*e.heightMm]}function ex(e,t,a,s,r){let[n,i,o,c]=s;e.push({featureId:t,kind:a,color:r,points:[[n,i],[o,i],[n,c]],bounds:[n,i,o,c]},{featureId:t,kind:a,color:r,points:[[n,c],[o,i],[o,c]],bounds:[n,i,o,c]})}function tx(e,t,a,s,r,n){for(let o=0;o<36;o+=1){let c=o/36*Math.PI*2,l=(o+1)/36*Math.PI*2;e.push({featureId:t,kind:a,color:n,points:[s,[s[0]+Math.cos(c)*r,s[1]+Math.sin(c)*r],[s[0]+Math.cos(l)*r,s[1]+Math.sin(l)*r]],bounds:[s[0]-r,s[1]-r,s[0]+r,s[1]+r]})}}function ax(e,t,a,s,r){let n=s[0],i=mu(s);for(let o=2;o<s.length;o+=1)e.push({featureId:t,kind:a,color:r,points:[n,s[o-1],s[o]],bounds:i})}function sx(e,t,a,s){let r=uu(a,s,t.widthMm||.15),n=t.lineStyle||"DEFAULT";if(!["DASH","DASHED","DOT","DOTTED","DASHDOT","DASH_DOT"].includes(n)){e.push({...t,a,b:s,bounds:r});return}let i=s[0]-a[0],o=s[1]-a[1],c=Math.hypot(i,o);if(c<1e-6)return;let l=i/c,f=o/c,u=Math.max(t.widthMm*4,.45),p=n.includes("DOT")?[u*.8,u*.75,u*3,u*.75]:[u*3,u*1.5],b=0,h=0;for(;b<c;){let d=Math.min(p[h%p.length],c-b);if(h%2===0){let x=[a[0]+l*b,a[1]+f*b],g=[a[0]+l*(b+d),a[1]+f*(b+d)];e.push({...t,a:x,b:g,bounds:uu(x,g,t.widthMm||.15)})}b+=d,h+=1}}function rx(e,t,a,s){for(let n=0;n<32;n+=1){let i=n/32*Math.PI*2,o=(n+1)/32*Math.PI*2;e.push({...t,a:[a[0]+Math.cos(i)*s,a[1]+Math.sin(i)*s],b:[a[0]+Math.cos(o)*s,a[1]+Math.sin(o)*s],bounds:[a[0]-s,a[1]-s,a[0]+s,a[1]+s]})}}function mu(e,t=0){let a=1/0,s=1/0,r=-1/0,n=-1/0;for(let i of e||[])a=Math.min(a,i[0]),s=Math.min(s,i[1]),r=Math.max(r,i[0]),n=Math.max(n,i[1]);return Number.isFinite(a)?[a-t,s-t,r+t,n+t]:[0,0,0,0]}function uu(e,t,a=0){let s=Math.max(.05,a*.5);return[Math.min(e[0],t[0])-s,Math.min(e[1],t[1])-s,Math.max(e[0],t[0])+s,Math.max(e[1],t[1])+s]}function wt(e,t){return!e||!t?!0:e[0]<=t[2]&&e[2]>=t[0]&&e[1]<=t[3]&&e[3]>=t[1]}function nx(e){let t={cellSize:Wy,cells:new Map,segments:e.segments||[],fills:e.fills||[],images:e.images||[],queryId:0};for(let a of t.segments)Ki(t,"segments",a);for(let a of t.fills)Ki(t,"fills",a);for(let a of t.images)Ki(t,"images",a);return t}function Ki(e,t,a){let s=a.bounds;if(!s)return;let r=Math.floor(s[0]/e.cellSize),n=Math.floor(s[2]/e.cellSize),i=Math.floor(s[1]/e.cellSize),o=Math.floor(s[3]/e.cellSize);for(let c=i;c<=o;c+=1)for(let l=r;l<=n;l+=1){let f=`${l}:${c}`,u=e.cells.get(f);u||(u={segments:[],fills:[],images:[]},e.cells.set(f,u)),u[t].push(a)}}function fu(e,t){if(!e)return{segments:[],fills:[],images:[]};e.queryId=(e.queryId||0)+1;let a=e.queryId,s={segments:[],fills:[],images:[]},r=Math.floor(t[0]/e.cellSize),n=Math.floor(t[2]/e.cellSize),i=Math.floor(t[1]/e.cellSize),o=Math.floor(t[3]/e.cellSize);for(let c=i;c<=o;c+=1)for(let l=r;l<=n;l+=1){let f=e.cells.get(`${l}:${c}`);f&&(Vi(f.segments,s.segments,a,"segments"),Vi(f.fills,s.fills,a,"fills"),Vi(f.images,s.images,a,"images"))}return s}function Vi(e,t,a,s){let r=`_${s}QueryId`;for(let n of e)n[r]!==a&&(n[r]=a,t.push(n))}function hu(e){let t=String(e.kind||"");if(String(e.fill||"").toUpperCase()==="FILLED_SHAPE"||e.closed===!0||["polygon","fill"].includes(t))return!0;let s=e.pointsMm||[];if(s.length>=3){let r=s[0],n=s[s.length-1];return Math.hypot(r[0]-n[0],r[1]-n[1])<1e-6}return!1}function ds(e){return!!e?.netUid}function ix(e){let t=String(e?.kind||""),a=String(e?.semanticRole||"");return t==="pin"||t==="pin_body"||t==="label"||t==="global_label"||t==="hierarchical_label"||t==="netclass_flag"||t==="power_symbol"||t==="power_port"||a==="label"||a==="global_label"||a==="hierarchical_label"}function ox(e){let t=String(e?.kind||""),a=String(e?.semanticRole||"");return t==="global_label"||a==="global_label"?130:t==="hierarchical_label"||a==="hierarchical_label"?125:t==="label"||a==="label"?118:t==="pin"||t==="pin_body"?106:t==="power_symbol"||t==="power_port"||t==="netclass_flag"?98:50}function cx(e){if(e.length<=lu)return e;let t=e.slice(0,lu);return t.sort((a,s)=>a.source[1]-s.source[1]||a.source[0]-s.source[0]),t}function lx(e,t,a={}){if(!e||!t?.length)return null;let s=a.featureId||a.stableKey||a.sourceId?t.find(l=>a.featureId&&Number(l.featureId||0)===Number(a.featureId)||a.stableKey&&l.stableKey===a.stableKey||a.sourceId&&l.sourceId===a.sourceId):null;if(s)return{...s,kind:"selected-net-occurrence",priority:200};let r=t.filter(l=>l.priority>=118).slice(0,16),n=r.length?r:t.slice(0,16),i=0,o=0;for(let l of n)i+=l.world[0],o+=l.world[1];let c=[i/n.length,o/n.length];return{pageId:e.id,featureId:n[0]?.featureId||0,kind:"page-net-occurrence",source:[0,0],world:c,bounds:[c[0],c[1],c[0],c[1]],priority:1}}function bu(e,t,a){if(!e||e.length<2)return[];let s=e.map(i=>({...i})).sort((i,o)=>i.world[1]-o.world[1]||i.world[0]-o.world[0]),r=[],n=s.shift();for(;s.length;){let i=0,o=1/0;for(let l=0;l<s.length;l+=1){let f=s[l],u=Math.hypot(f.world[0]-n.world[0],f.world[1]-n.world[1]);u<o&&(o=u,i=l)}let c=s.splice(i,1)[0];r.push({type:t,pageId:a||n.pageId||c.pageId||"",a:n.world,b:c.world,sourceFeatureIds:[n.featureId,c.featureId].filter(Boolean)}),n=c}return r}function pu(e,t=0){return[Math.min(e.a[0],e.b[0])-t,Math.min(e.a[1],e.b[1])-t,Math.max(e.a[0],e.b[0])+t,Math.max(e.a[1],e.b[1])+t]}function cs(e){let t=String(e?.kind||""),s=String(e?.semanticRole||"")||t;return s==="pin_number"||s==="pin_name"?120:s==="pin_body"||t==="pin"?110:s==="symbol_reference"||s==="symbol_value"?92:t==="junction"||t==="no_connect"?88:t==="wire"||t==="bus"||t==="bus_entry"?78:s==="symbol_body"||t==="symbol_body"?45:t==="symbol_instance"||t==="symbol_overplot"?30:t==="text"||String(s).includes("text")?24:10}function ls(e){let t=String(e?.kind||""),a=String(e?.semanticRole||"");if(t==="page"||t==="sheet_header")return!0;if(t==="graphic_rect"&&a==="graphic_rect"&&!e?.netUid&&!e?.componentUid){let s=e.boundsMm||[];return s[2]-s[0]>150&&s[3]-s[1]>120}return!1}function dx(e){if(!e||typeof e!="string")return null;let a=e.trim().match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);if(!a)return null;let s=a[1],r=a[2]??"ff";return[parseInt(s.slice(0,2),16)/255,parseInt(s.slice(2,4),16)/255,parseInt(s.slice(4,6),16)/255,parseInt(r,16)/255]}function qi(e,t,a=""){let s=dx(a||e?.color||"");return e?.kind==="dnp_marker"?s||[.86,.04,.05,.85]:e?.dnp&&["symbol_reference","symbol_value","symbol_text"].includes(String(e?.kind||""))?[.5,.52,.54,.56]:s||(e?.dnp?[.5,.52,.54,.56]:ds(e)?[.12,.56,.2,.96]:e?.kind==="pin_name"?[0,.28,.31,.96]:e?.kind==="pin_number"?[.45,.17,.16,.96]:e?.kind==="pin_body"?[.28,.18,.18,.88]:e?.kind==="symbol_body"||e?.kind==="symbol_instance"?[.42,.18,.18,.72]:e?.kind==="symbol_reference"||e?.kind==="symbol_value"?[.05,.13,.16,.94]:e?.kind==="text"||String(t||"").startsWith("text")?[.05,.13,.16,.94]:[.16,.17,.19,.7])}function gu(e,t,a=""){let s=qi(e,t,a);return[s[0]*.72,s[1]*.72,s[2]*.72,Math.min(s[3],.38)]}function ux(e,t,a){return a?5.5:e?.kind==="dnp_marker"?3:["pin_name","pin_number"].includes(String(e?.kind||""))?1.5:e?.kind==="pin_body"?1.7:String(t||"").startsWith("text")?1.35:t==="bus"||e?.kind==="bus"?4.2:ds(e)?2.6:e?.kind==="symbol_body"||e?.kind==="symbol_instance"||e?.kind==="sheet"?1.5:1.25}function Or(e,t,a,s){return e[t++]=a[0],e[t++]=a[1],e[t++]=s[0],e[t++]=s[1],e[t++]=s[2],e[t++]=s[3],t}function fx(e,t,a,s,r,n){let i=yu(a,s,r);if(!i)return t;for(let o of i)t=Or(e,t,o,n);return t}function hx(e,t,a,s,r,n){return t=Or(e,t,a,n),t=Or(e,t,s,n),t=Or(e,t,r,n),t}function Sa(e,t,a,s,r){return e[t++]=a[0],e[t++]=a[1],e[t++]=s,e[t++]=r,t}function bx(e,t,a,s,r,n,i,o){let c=s[0]-a[0],l=s[1]-a[1],f=Math.hypot(c,l);if(f<1e-6||t+24>e.length)return t;let u=r*.5,p=c/f,h=-(l/f)*u,d=p*u,x=[a[0]+h,a[1]+d],g=[a[0]-h,a[1]-d],y=[s[0]+h,s[1]+d],m=[s[0]-h,s[1]-d],v=i+f/Math.max(o,1e-6);return t=Sa(e,t,x,i,n),t=Sa(e,t,g,i,n),t=Sa(e,t,y,v,n),t=Sa(e,t,y,v,n),t=Sa(e,t,g,i,n),t=Sa(e,t,m,v,n),t}function yu(e,t,a){let s=t[0]-e[0],r=t[1]-e[1],n=Math.hypot(s,r);if(n<1e-6)return null;let i=a*.5,o=s/n*i,c=r/n*i,l=-r/n*i,f=s/n*i,u=[e[0]-o,e[1]-c],p=[t[0]+o,t[1]+c],b=[u[0]+l,u[1]+f],h=[u[0]-l,u[1]-f],d=[p[0]+l,p[1]+f],x=[p[0]-l,p[1]-f];return[b,h,d,d,h,x]}function px(e,t,a){let s=a[0]-t[0],r=a[1]-t[1],n=s*s+r*r||1,i=ce(((e[0]-t[0])*s+(e[1]-t[1])*r)/n,0,1),o=t[0]+s*i,c=t[1]+r*i;return Math.hypot(e[0]-o,e[1]-c)}function gx(e,t){let[a,s,r,n]=t,[i,o]=e.a,[c,l]=e.b,f=1e-6,u=(p,b)=>({...e,a:p,b});if(Math.abs(o-l)<=f){let p=o;if(p<s-f||p>n+f)return[e];let b=Math.min(i,c),h=Math.max(i,c),d=Math.max(b,a),x=Math.min(h,r);if(x<=d+f)return[e];let g=[],y=i<=c;if(b<d-f){let m=y?[b,p]:[d,p],v=y?[d,p]:[b,p];g.push(u(m,v))}if(x<h-f){let m=y?[x,p]:[h,p],v=y?[h,p]:[x,p];g.push(u(m,v))}return g}if(Math.abs(i-c)<=f){let p=i;if(p<a-f||p>r+f)return[e];let b=Math.min(o,l),h=Math.max(o,l),d=Math.max(b,s),x=Math.min(h,n);if(x<=d+f)return[e];let g=[],y=o<=l;if(b<d-f){let m=y?[p,b]:[p,d],v=y?[p,d]:[p,b];g.push(u(m,v))}if(x<h-f){let m=y?[p,x]:[p,h],v=y?[p,h]:[p,x];g.push(u(m,v))}return g}return[e]}function Pr(e,t,a,s){let r=t*12;e.setFloat32(r,a[0],!0),e.setFloat32(r+4,a[1],!0),e.setUint32(r+8,s,!0)}function mx(e,t,a,s,r,n){let i=yu(a,s,r);if(!i)return t;for(let o of i)Pr(e,t,o,n),t+=1;return t}function Hi(e,t,a,s,r,n){return Pr(e,t,a,n),Pr(e,t+1,s,n),Pr(e,t+2,r,n),t+3}function yx(e,t){let a=Array.isArray(e?.layerIds)?e.layerIds:[];if(a.length<2&&e?.startLayerId!=null&&e?.endLayerId!=null&&(a=[e.startLayerId,e.endLayerId]),a.length<2&&e?.layerMask!=null)try{let s=BigInt(String(e.layerMask));a=t.filter((r,n)=>(s&1n<<BigInt(n))!==0n).map(r=>r.id)}catch{a=[]}return a}function xx(e){let t=e?.objectFeatureId??e?.id;if(t!=null&&Number.isFinite(Number(t))&&Number(t)!==0)return`feature:${Number(t)}`;let a=String(e?.sourceUid||"");return a?`source:${a}`:""}function xu(e,t){let a=new Map(e.map((o,c)=>[Number(o.id),c])),s=new Map(e.map(o=>[Number(o.id),o])),r=new Map,n=new Set,i={thru:0,blind:0,buried:0};for(let o of t){let c=xx(o);if(c){if(n.has(c))continue;n.add(c)}let l=[...new Set(yx(o,e).map(Number))].filter(m=>a.has(m)).sort((m,v)=>a.get(m)-a.get(v));if(l.length<2)continue;let f=l[0],u=l[l.length-1],p=a.get(f),b=a.get(u),h=p===0,d=b===e.length-1,x=h&&d?"thru":h||d?"blind":"buried";i[x]+=1;let g=`${f}:${u}:${x}`,y=r.get(g);if(y){y.count+=1;continue}r.set(g,{startId:f,endId:u,startName:s.get(f)?.name||String(f),endName:s.get(u)?.name||String(u),startIndex:p,endIndex:b,type:x,count:1})}return{counts:i,spans:[...r.values()]}}var us="http://www.w3.org/2000/svg";var wx=new Set(["script","foreignobject","iframe","object","embed"]),vx=new Set(["href","xlink:href"]),Mx=1,kx=18,Ex=8,Ur=class e{static create(t,a,s,r,n={}){return new e(t,a,s,r,n)}constructor(t,a,s,r,n){this.host=t,this.manifestUrl=a,this.manifest=s,this.featuresByPage=r||{},this.callbacks=n,this.activePage=null,this.activeSvgUrl="",this.container=null,this.svg=null,this.overlay=null,this.mountedPages=new Map,this.loadingPages=new Map,this.svgCache=new Map,this.serial=0,this.maxMountedWorldPages=Mx,this.maxCachedSvgPages=kx,this.worldHandlersInstalled=!1,this.worldDrag=null,this.view={scale:1,tx:0,ty:0},this.drag=null,this.selected=null,this.highlightedNetUid="",this.index=ku(),this.lastStats={mountedPages:0,domNodes:0,indexedFeatures:0,indexedNets:0,mountMs:0,coldMounts:0,warmMounts:0,highlightMs:0,selectionMs:0,cachedSvgPages:0,cachedSvgBytes:0,heapMb:null,fallbackReason:""}}get active(){return!!(this.container&&this.activePage)}get worldActive(){return this.mountedPages.size>0}stats(){return{...this.lastStats,activePage:this.activePage?.name||[...this.mountedPages.values()][0]?.page?.name||"-",mountedPages:this.active?1:this.mountedPages.size}}dispose(){this.unmountPage(),this.unmountWorldPages()}unmountPage(){this.container?.remove(),this.container=null,this.svg=null,this.overlay=null,this.activePage=null,this.activeSvgUrl="",this.index=ku(),this.host.hidden=!0}unmountWorldPages(){for(let t of this.mountedPages.values())t.container.remove();this.mountedPages.clear(),this.loadingPages.clear(),this.active||(this.host.hidden=!0)}async preloadPages(t){let a=performance.now(),s=await Promise.allSettled((t||[]).slice(0,Ex).map(r=>this.loadSvgTemplate(r)));this.lastStats.preloadedPages=s.filter(r=>r.status==="fulfilled"&&r.value).length,this.lastStats.preloadMs=performance.now()-a,this.updateCacheStats()}syncWorldPages(t,a,s={}){if(!a)return;this.installWorldHandlers(a);let r=(t||[]).slice(0,s.maxMountedPages||this.maxMountedWorldPages),n=new Set(r.map(i=>i.id));for(let[i,o]of this.mountedPages)n.has(i)||(o.container.remove(),this.mountedPages.delete(i));for(let i of r){let o=this.mountedPages.get(i.id);if(o)o.lastUsed=++this.serial,this.positionWorldEntry(o,a);else if(!this.loadingPages.has(i.id)){let c=this.mountWorldPage(i).then(l=>{l&&n.has(i.id)?this.positionWorldEntry(l,a):l?.container.remove()}).finally(()=>this.loadingPages.delete(i.id));this.loadingPages.set(i.id,c)}}this.pruneMountedWorldPages(n),this.host.hidden=r.length===0&&!this.active,this.setSelection(this.selected),this.setHighlightedNet(s.activeNetUid??this.highlightedNetUid),this.lastStats.mountedPages=this.mountedPages.size,this.updateCacheStats()}async mountWorldPage(t){let a=performance.now(),s=this.hasCachedSvg(t),r=await this.loadImportedSvg(t);if(!r)return null;let n=document.createElement("div");n.className="svg-dom-page svg-dom-world-page",n.dataset.pageId=t.id,n.append(r),this.host.append(n);let i=vu(r),o=Mu(r),c=wu(r,t,this.featuresByPage[t.id]||[]),l={page:t,container:n,svg:r,overlay:i,selectionOverlay:o,index:c,mountMs:performance.now()-a,lastUsed:++this.serial,warm:s};return this.mountedPages.set(t.id,l),this.lastStats={...this.lastStats,mountedPages:this.mountedPages.size,domNodes:[...this.mountedPages.values()].reduce((f,u)=>f+u.svg.querySelectorAll("*").length,0),indexedFeatures:[...this.mountedPages.values()].reduce((f,u)=>f+u.index.featureToElements.size,0),indexedNets:new Set([...this.mountedPages.values()].flatMap(f=>[...f.index.netToElements.keys()])).size,mountMs:l.mountMs,coldMounts:this.lastStats.coldMounts+(l.warm?0:1),warmMounts:this.lastStats.warmMounts+(l.warm?1:0),fallbackReason:""},this.updateCacheStats(),l}async loadImportedSvg(t){let a=await this.loadSvgTemplate(t);return a?a.cloneNode(!0):null}async loadSvgTemplate(t){let a=this.svgUrlForPage(t),s=this.svgCache.get(a);if(s?.template)return s.lastUsed=++this.serial,s.template;if(s?.promise)return s.promise;let r=performance.now(),n=(async()=>{let i=await fetch(a,{cache:"default"});if(!i.ok)return this.lastStats.fallbackReason=`Failed to load SVG page ${t.id}: ${i.status}`,this.callbacks.onFallback?.(this.lastStats.fallbackReason),null;let o=await i.text(),l=new DOMParser().parseFromString(o,"image/svg+xml"),f=l.documentElement;if(!f||f.localName.toLowerCase()!=="svg"||l.querySelector("parsererror"))return this.lastStats.fallbackReason=`Invalid SVG for page ${t.id}`,this.callbacks.onFallback?.(this.lastStats.fallbackReason),null;Sx(l,a,t.id);let u=document.importNode(f,!0);u.classList.add("svg-dom-page-svg"),Nx(u);let p=this.svgCache.get(a)||{};return Object.assign(p,{template:u,promise:null,pageId:t.id,byteLength:o.length*2,loadMs:performance.now()-r,lastUsed:++this.serial}),this.svgCache.set(a,p),this.pruneSvgCache(),this.updateCacheStats(),u})();return this.svgCache.set(a,{promise:n,pageId:t.id,byteLength:0,loadMs:0,lastUsed:++this.serial}),n}svgUrlForPage(t){return new URL(t.svg||t.thumbnail?.path,this.manifestUrl).toString()}positionWorldEntry(t,a){let{page:s,container:r}=t,[n,i]=a.worldToScreen(s.worldX,s.worldY),[o,c]=a.worldToScreen(s.worldX+s.widthMm,s.worldY+s.heightMm),l=Math.max(1,o-n),f=Math.max(1,c-i);r.style.transform=`translate3d(${n}px, ${i}px, 0)`,r.style.width=`${l}px`,r.style.height=`${f}px`}installWorldHandlers(t){if(this.worldHandlersInstalled)return;this.worldHandlersInstalled=!0;let a=this.host;a.oncontextmenu=s=>s.preventDefault(),a.onpointerdown=s=>{let r=s.button===0&&!s.shiftKey&&!!s.target.closest?.("text"),i=s.target.closest?.("[data-feature-key]")?null:this.featureAtEvent(s);this.worldDrag={pointerId:s.pointerId,startX:s.clientX,startY:s.clientY,lastX:s.clientX,lastY:s.clientY,button:s.button,moved:!1,pan:!r&&(s.button===0||s.button===1||s.shiftKey),allowTextSelection:r},r||a.setPointerCapture(s.pointerId)},a.onpointermove=s=>{if(!this.worldDrag||this.worldDrag.pointerId!==s.pointerId)return;let r=s.clientX-this.worldDrag.lastX,n=s.clientY-this.worldDrag.lastY;this.worldDrag.lastX=s.clientX,this.worldDrag.lastY=s.clientY,Math.hypot(s.clientX-this.worldDrag.startX,s.clientY-this.worldDrag.startY)>3&&(this.worldDrag.moved=!0),this.worldDrag.pan&&t.pan(r,n)},a.onpointerup=s=>{if(!this.worldDrag||this.worldDrag.pointerId!==s.pointerId)return;let r=this.worldDrag;if(this.worldDrag=null,r.allowTextSelection||a.releasePointerCapture(s.pointerId),r.button!==0||r.moved)return;let n=s.target.closest?.("[data-feature-key]");if(n)this.selectElement(n,s);else{let i=this.featureAtEvent(s);i?this.selectFeature(i.entry,i.feature,s):this.callbacks.onBlank?.()}},a.ondblclick=s=>{let r=s.target.closest?.("[data-feature-key]"),n=r?null:this.featureAtEvent(s),i=n?.entry||this.entryForPoint(s.clientX,s.clientY),o=r?this.selectionFromElement(r):n?this.selectionFromFeature(n.entry,n.feature):this.selected;Eu(o)?this.callbacks.onOpenPage?.(o):o?.netUid?this.callbacks.onHighlightNet?.(o.netUid,o):!n&&i?.page&&this.callbacks.onOpenPage?.({kind:"page",pageId:i.page.id,page:i.page})},a.onwheel=s=>{s.preventDefault(),Math.abs(s.deltaX)>Math.abs(s.deltaY)*.65?t.pan(-s.deltaX,-s.deltaY):t.zoom(s.deltaY,s.clientX,s.clientY)}}async focusPage(t,a={}){if(!t)return!1;if(this.activePage?.id===t.id&&this.active)return a.frame!==!1&&this.fitPage(),!0;let s=performance.now(),r=await this.loadImportedSvg(t);if(!r)return!1;let n=document.createElement("div");return n.className="svg-dom-page",n.append(r),this.host.replaceChildren(n),this.host.hidden=!1,this.container=n,this.svg=r,this.activePage=t,this.activeSvgUrl=new URL(t.svg||t.thumbnail?.path,this.manifestUrl).toString(),this.overlay=vu(r),this.selectionOverlay=Mu(r),this.index=wu(r,t,this.featuresByPage[t.id]||[]),this.installPageHandlers(),this.fitPage(),this.setSelection(this.selected),this.setHighlightedNet(this.highlightedNetUid),this.lastStats={...this.lastStats,mountedPages:1,domNodes:r.querySelectorAll("*").length,indexedFeatures:this.index.featureToElements.size,indexedNets:this.index.netToElements.size,mountMs:performance.now()-s,fallbackReason:""},this.updateCacheStats(),!0}installPageHandlers(){let t=this.host;t.oncontextmenu=a=>a.preventDefault(),t.onpointerdown=a=>{if(!this.active)return;let s=a.button===0&&!a.shiftKey&&!!a.target.closest?.("text"),r=a.target.closest?.("[data-feature-key]"),n=r?null:this.featureAtEvent(a);this.drag={pointerId:a.pointerId,startX:a.clientX,startY:a.clientY,lastX:a.clientX,lastY:a.clientY,button:a.button,moved:!1,pan:!s&&(a.button===0||a.button===1||a.shiftKey),featureElement:r,allowTextSelection:s},s||t.setPointerCapture(a.pointerId)},t.onpointermove=a=>{if(!this.drag||this.drag.pointerId!==a.pointerId)return;let s=a.clientX-this.drag.lastX,r=a.clientY-this.drag.lastY;this.drag.lastX=a.clientX,this.drag.lastY=a.clientY,Math.hypot(a.clientX-this.drag.startX,a.clientY-this.drag.startY)>3&&(this.drag.moved=!0),this.drag.pan&&(this.view.tx+=s,this.view.ty+=r,this.applyTransform())},t.onpointerup=a=>{if(!this.drag||this.drag.pointerId!==a.pointerId)return;let s=this.drag;if(this.drag=null,s.allowTextSelection||t.releasePointerCapture(a.pointerId),s.button!==0||s.moved)return;let r=a.target.closest?.("[data-feature-key]");if(r)this.selectElement(r,a);else{let n=this.featureAtEvent(a);n?this.selectFeature(n.entry,n.feature,a):this.callbacks.onBlank?.()}},t.ondblclick=a=>{let s=a.target.closest?.("[data-feature-key]"),r=s?null:this.featureAtEvent(a),n=s?this.selectionFromElement(s):r?this.selectionFromFeature(r.entry,r.feature):this.selected;Eu(n)?this.callbacks.onOpenPage?.(n):n?.netUid?this.callbacks.onHighlightNet?.(n.netUid,n):!r&&this.activePage&&this.callbacks.onOpenPage?.({kind:"page",pageId:this.activePage.id,page:this.activePage})},t.onwheel=a=>{if(a.preventDefault(),!this.active)return;if(Math.abs(a.deltaX)>Math.abs(a.deltaY)*.65){this.view.tx-=a.deltaX,this.view.ty-=a.deltaY,this.applyTransform();return}let s=this.host.getBoundingClientRect(),r=a.clientX-s.left,n=a.clientY-s.top,i=this.screenToSvg(r,n),o=Math.exp(-a.deltaY*.0016);this.view.scale=Lr(this.view.scale*o,.02,80),this.view.tx=r-i[0]*this.view.scale,this.view.ty=n-i[1]*this.view.scale,this.applyTransform()}}selectElement(t,a){let s=performance.now(),r=this.selectionFromElement(t);if(this.setSelection(r),a){let n=this.host.getBoundingClientRect();r.anchor={x:a.clientX-n.left,y:a.clientY-n.top}}this.callbacks.onSelect?.(r),this.lastStats.selectionMs=performance.now()-s}selectFeature(t,a,s){let r=performance.now(),n=this.selectionFromFeature(t,a);if(this.setSelection(n),s){let i=this.host.getBoundingClientRect();n.anchor={x:s.clientX-i.left,y:s.clientY-i.top}}this.callbacks.onSelect?.(n),this.lastStats.selectionMs=performance.now()-r}selectionFromElement(t){let a=t.dataset.featureKey||"",s=this.entryForElement(t),r=s.index.featureByKey.get(a)||{};return this.selectionFromFeature(s,r,t)}selectionFromFeature(t,a,s=null){let r=a?.stableKey||s?.dataset?.featureKey||"",n=t?.page||this.activePage,i=a?.kind||s?.dataset?.role||s?.dataset?.primitive||"feature",o=a?.netUid||s?.dataset?.netUid||"",c=a?.netName||s?.dataset?.netName||"";return i==="sheet"?{kind:"sheet",featureKey:r,sheetInstancePath:a?.sheetInstancePath||n?.sheetInstancePath||"",sourceId:a?.sourceId||s?.dataset?.sourceId||s?.dataset?.objectId||s?.dataset?.uuid||"",sheetName:a?.sheet_name||a?.sheetName||s?.dataset?.sheetName||a?.objectId||"",sheetFile:a?.sheet_file||a?.sheetFile||s?.dataset?.sheetFile||"",feature:a}:i==="pin"||i==="pin_body"||i==="pin_name"||i==="pin_number"||s?.dataset?.pin?{kind:"pin",featureKey:r,sheetInstancePath:a?.sheetInstancePath||n?.sheetInstancePath||"",sourceId:a?.sourceId||s?.dataset?.sourceId||s?.dataset?.objectId||s?.dataset?.uuid||"",symbolUuid:a?.symbolUuid||s?.dataset?.symbolUuid||"",reference:a?.reference||s?.dataset?.designator||s?.dataset?.component||s?.dataset?.ref||"",pinNumber:a?.pinNumber||s?.dataset?.pin||"",pinName:a?.pinName||"",netUid:o,netName:c,feature:a}:i==="symbol_body"||i==="symbol_instance"||i==="component"||s?.dataset?.ref?{kind:"component",featureKey:r,sheetInstancePath:a?.sheetInstancePath||n?.sheetInstancePath||"",sourceId:a?.sourceId||s?.dataset?.sourceId||s?.dataset?.objectId||s?.dataset?.uuid||"",symbolUuid:a?.symbolUuid||s?.dataset?.symbolUuid||"",reference:a?.reference||s?.dataset?.designator||s?.dataset?.component||s?.dataset?.ref||"",netUid:o,netName:c,feature:a}:{kind:o?"feature":i,featureKey:r,sheetInstancePath:a?.sheetInstancePath||n?.sheetInstancePath||"",sourceId:a?.sourceId||s?.dataset?.sourceId||s?.dataset?.objectId||s?.dataset?.uuid||"",role:i,netUid:o,netName:c,feature:a}}setSelection(t){this.selected=t||null;for(let s of this.host.querySelectorAll(".prism-svg-selected"))s.classList.remove("prism-svg-selected");for(let s of this.host.querySelectorAll("[data-prism-overlay='selection']"))s.replaceChildren();let a=t?.featureKey||"";if(a){for(let s of this.entries()){for(let r of s.index.featureToElements.get(a)||[])r.classList.add("prism-svg-selected");this.drawSelectionOverlay(s,t)}for(let s of this.index.featureToElements.get(a)||[])s.classList.add("prism-svg-selected");this.drawSelectionOverlay({page:this.activePage,index:this.index,selectionOverlay:this.selectionOverlay},t)}}setHighlightedNet(t){this.highlightedNetUid=t||"";let a=performance.now();for(let s of this.entries())this.updateEntryHighlight(s);if(!this.svg||!this.overlay){this.lastStats.highlightMs=performance.now()-a;return}this.updateEntryHighlight({svg:this.svg,overlay:this.overlay,index:this.index,page:this.activePage}),this.lastStats.highlightMs=performance.now()-a}updateEntryHighlight(t){if(!t?.svg||!t?.overlay||(t.overlay.replaceChildren(),!this.highlightedNetUid))return;let a=Dr(t.svg,t.page),s=document.createElementNS(us,"rect");s.setAttribute("x",String(a[0])),s.setAttribute("y",String(a[1])),s.setAttribute("width",String(a[2])),s.setAttribute("height",String(a[3])),s.setAttribute("class","prism-svg-net-dimmer"),t.overlay.append(s);let n=(t.index.netToElements.get(this.highlightedNetUid)||[]).slice(0,2200);for(let i of n){let o=Cx(i);t.overlay.append(o)}}entries(){return[...this.mountedPages.values()]}entryForElement(t){let s=t.closest?.(".svg-dom-page")?.dataset.pageId||"";return this.mountedPages.get(s)||{page:this.activePage,index:this.index,svg:this.svg,overlay:this.overlay,selectionOverlay:this.selectionOverlay}}featureAtEvent(t){let a=this.entryForPoint(t.clientX,t.clientY);if(!a)return null;let s=this.clientToSvg(a,t.clientX,t.clientY);if(!s)return null;let r=Math.max(.18,5*Fx(a)),i=a.index.features.filter(o=>(o?.domBoundsMm||o?.boundsMm)&&Au(o)).filter(o=>s[0]>=(o.domBoundsMm||o.boundsMm)[0]-r&&s[0]<=(o.domBoundsMm||o.boundsMm)[2]+r&&s[1]>=(o.domBoundsMm||o.boundsMm)[1]-r&&s[1]<=(o.domBoundsMm||o.boundsMm)[3]+r).map(o=>({feature:o,priority:Px(o),area:Math.max(1e-4,((o.domBoundsMm||o.boundsMm)[2]-(o.domBoundsMm||o.boundsMm)[0])*((o.domBoundsMm||o.boundsMm)[3]-(o.domBoundsMm||o.boundsMm)[1]))})).sort((o,c)=>c.priority-o.priority||o.area-c.area)[0]?.feature;return i?{entry:a,feature:i,point:s}:null}entryForPoint(t,a){for(let s of[...this.entries()].reverse()){let r=s.container.getBoundingClientRect();if(t>=r.left&&t<=r.right&&a>=r.top&&a<=r.bottom)return s}if(this.container){let s=this.container.getBoundingClientRect();if(t>=s.left&&t<=s.right&&a>=s.top&&a<=s.bottom)return{page:this.activePage,container:this.container,svg:this.svg,index:this.index,selectionOverlay:this.selectionOverlay}}return null}clientToSvg(t,a,s){if(!t?.container||!t?.svg||!t?.page)return null;let r=t.container.getBoundingClientRect();if(!r.width||!r.height)return null;let n=Dr(t.svg,t.page);return[n[0]+(a-r.left)/r.width*n[2],n[1]+(s-r.top)/r.height*n[3]]}drawSelectionOverlay(t,a){if(!t?.selectionOverlay||!a?.featureKey)return;let s=t.index.featureByKey.get(a.featureKey),r=s?.domBoundsMm||s?.boundsMm;if(!r)return;let[n,i,o,c]=r,l=document.createElementNS(us,"rect");l.setAttribute("x",String(n)),l.setAttribute("y",String(i)),l.setAttribute("width",String(Math.max(.001,o-n))),l.setAttribute("height",String(Math.max(.001,c-i))),l.setAttribute("rx","0.65"),l.setAttribute("ry","0.65"),l.setAttribute("class","prism-svg-selection-box"),t.selectionOverlay.append(l)}fitPage(){if(!this.svg||!this.activePage)return;let t=Dr(this.svg,this.activePage),a=t[2]||this.activePage.sourceWidthMm||this.activePage.widthMm||1,s=t[3]||this.activePage.sourceHeightMm||this.activePage.heightMm||1,r=this.host.getBoundingClientRect(),n=Math.min(r.width/a,r.height/s)*.92;this.view.scale=Lr(n,.02,80),this.view.tx=(r.width-a*this.view.scale)/2-t[0]*this.view.scale,this.view.ty=(r.height-s*this.view.scale)/2-t[1]*this.view.scale,this.applyTransform()}frameSelection(t=this.selected){if(!t?.featureKey||!this.active){this.fitPage();return}let a=this.index.featureToElements.get(t.featureKey)||[],s=Tu(a);if(!s)return;let r=this.host.getBoundingClientRect(),n=Math.max(1,s[2]-s[0]),i=Math.max(1,s[3]-s[1]),o=Math.min(r.width/n,r.height/i)*.36;this.view.scale=Lr(o,.04,80),this.view.tx=r.width/2-(s[0]+s[2])/2*this.view.scale,this.view.ty=r.height/2-(s[1]+s[3])/2*this.view.scale,this.applyTransform()}pan(t,a){this.active&&(this.view.tx+=t,this.view.ty+=a,this.applyTransform())}zoom(t,a,s){if(!this.active)return;let r=this.host.getBoundingClientRect(),n=(a??r.left+r.width/2)-r.left,i=(s??r.top+r.height/2)-r.top,o=this.screenToSvg(n,i),c=Math.exp(-t*.0016);this.view.scale=Lr(this.view.scale*c,.02,80),this.view.tx=n-o[0]*this.view.scale,this.view.ty=i-o[1]*this.view.scale,this.applyTransform()}screenToSvg(t,a){return[(t-this.view.tx)/Math.max(1e-6,this.view.scale),(a-this.view.ty)/Math.max(1e-6,this.view.scale)]}applyTransform(){this.container&&(this.container.style.transform=`translate3d(${this.view.tx}px, ${this.view.ty}px, 0) scale(${this.view.scale})`)}hasCachedSvg(t){return!!this.svgCache.get(this.svgUrlForPage(t))?.template}pruneMountedWorldPages(t=new Set){if(this.mountedPages.size<=this.maxMountedWorldPages)return;let a=[...this.mountedPages.entries()].filter(([s])=>!t.has(s)).sort((s,r)=>(s[1].lastUsed||0)-(r[1].lastUsed||0));for(let[s,r]of a){if(this.mountedPages.size<=this.maxMountedWorldPages)break;r.container.remove(),this.mountedPages.delete(s)}}pruneSvgCache(){let t=[...this.svgCache.entries()].filter(([,r])=>r?.template);if(t.length<=this.maxCachedSvgPages)return;let a=new Set([...this.mountedPages.values()].map(r=>this.svgUrlForPage(r.page)));this.activePage&&a.add(this.svgUrlForPage(this.activePage));let s=t.filter(([r])=>!a.has(r)).sort((r,n)=>(r[1].lastUsed||0)-(n[1].lastUsed||0));for(let[r]of s){if([...this.svgCache.values()].filter(n=>n?.template).length<=this.maxCachedSvgPages)break;this.svgCache.delete(r)}}updateCacheStats(){let t=[...this.svgCache.values()].filter(s=>s?.template);this.lastStats.cachedSvgPages=t.length,this.lastStats.cachedSvgBytes=t.reduce((s,r)=>s+(r.byteLength||0),0);let a=performance?.memory;this.lastStats.heapMb=a?.usedJSHeapSize?a.usedJSHeapSize/1048576:null}};function Sx(e,t,a){for(let n of[...e.querySelectorAll("*")]){if(wx.has(n.localName.toLowerCase())){n.remove();continue}for(let i of[...n.attributes]){let o=i.name,c=o.toLowerCase(),l=i.value||"";if(c.startsWith("on")){n.removeAttribute(o);continue}if((c==="href"||c==="xlink:href"||c==="src")&&Iu(l)){if((c==="href"||c==="xlink:href")&&n.localName.toLowerCase()==="image"&&Lx(l))continue;n.removeAttribute(o);continue}c==="style"&&n.setAttribute(o,Ux(l))}}let s=`prism-${Wi(a)}-`,r=new Map;for(let n of e.querySelectorAll("[id]")){let i=n.getAttribute("id"),o=`${s}${Wi(i)}`;r.set(i,o),n.setAttribute("id",o)}for(let n of e.querySelectorAll("*"))for(let i of[...n.attributes]){let o=i.name.toLowerCase(),c=i.value||"";vx.has(o)&&(c.startsWith("#")&&r.has(c.slice(1))?c=`#${r.get(c.slice(1))}`:Dx(c)&&(c=new URL(c,t).toString())),c=zx(c,r),n.setAttribute(i.name,c)}}function wu(e,t,a){let s=new Map,r=new Map,n=new Map,i=[];for(let f of a){let u=Ix(f,t);i.push(u),r.set(u.stableKey,u),n.set(Number(u.id||0),u);for(let p of _x(u))s.has(p)||s.set(p,[]),s.get(p).push(u)}let o=new Map,c=new Map,l=new Map;for(let f of i)l.set(f.stableKey,f);for(let f of e.querySelectorAll("[data-uuid], [data-element-key], [data-primitive], [data-ref], [data-pin], [data-object-id], [data-designator], [data-component]")){let u=Tx(f,s,t);if(u&&!Au(u)||!u&&!jx(f))continue;let p=Rx(f,t),b=u?.stableKey||p,h=u?.netUid||"",d=u?.netName||"";f.classList.add("prism-feature"),f.dataset.featureKey=b,f.dataset.sourceId=u?.sourceId||f.dataset.uuid||f.dataset.elementKey||"",f.dataset.role=u?.kind||f.dataset.primitive||f.dataset.ref||"feature",u?.id&&(f.dataset.featureId=String(u.id)),h&&(f.dataset.netUid=h),d&&(f.dataset.netName=d),f.id||(f.id=`prism-feature-${Wi(b)}`),Su(o,b,f),l.set(b,u||{id:0,stableKey:b,kind:f.dataset.role,sourceId:f.dataset.sourceId,sheetInstancePath:t.sheetInstancePath||""}),h&&Su(c,h,f)}for(let[f,u]of o){let p=l.get(f),b=Tu(u);p&&b&&(p.domBoundsMm=Bx(p.boundsMm,b))}return{featureToElements:o,netToElements:c,featureByKey:l,byId:n,bySource:s,features:i}}function Tx(e,t,a){let r=[e.dataset.uuid,e.dataset.elementKey,e.dataset.sourceId,e.dataset.objectId,e.dataset.componentUid,e.dataset.componentUuid,e.dataset.ref&&`${e.dataset.ref}:${e.dataset.pin||""}`].filter(Boolean).flatMap(i=>t.get(i)||[]);if(!r.length)return null;let n=String(e.dataset.primitive||e.dataset.ref||e.dataset.pin||"").toLowerCase();return r.map(i=>({feature:i,score:Ax(i,n,a)})).sort((i,o)=>o.score-i.score)[0].feature}function Ax(e,t,a){let s=0,r=String(e.kind||"").toLowerCase();return e.sheetInstancePath===a.sheetInstancePath&&(s+=20),e.netUid&&(s+=4),t&&r.includes(t)&&(s+=8),t==="symbol"&&r==="symbol_body"&&(s+=12),(t==="label"||t==="port")&&(r.includes("label")||r.includes("port"))&&(s+=12),t==="sheet"&&r==="sheet"&&(s+=12),r!=="record"&&(s+=2),r.includes("pin")&&(s+=2),s}function Ix(e,t){let a=e.sourceId||e.sourceUid||e.uuid||e.objectId||e.stableKey||"";return{...e,id:Number(e.id||0),sourceId:a,stableKey:e.stableKey||`${t.sheetInstancePath||t.id}|${a}|0|${e.kind||"feature"}|0`,sheetInstancePath:e.sheetInstancePath||t.sheetInstancePath||""}}function _x(e){let t=new Set([e.sourceId,e.sourceUid,e.uuid,e.objectId,e.stableKey].filter(Boolean).map(String));return e.reference&&e.pinNumber&&t.add(`${e.reference}:${e.pinNumber}`),e.componentDesignator&&t.add(e.componentDesignator),e.reference&&t.add(e.reference),[...t]}function Rx(e,t){let a=e.dataset.uuid||e.dataset.elementKey||e.dataset.objectId||e.dataset.ref||e.id||"svg",s=e.dataset.primitive||e.dataset.role||e.localName||"feature";return`${t.sheetInstancePath||t.id}|${a}|0|${s}|0`}function Nx(e){let t=document.createElementNS(us,"style");t.textContent=`
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
  `,e.prepend(t)}function vu(e){let t=document.createElementNS(us,"g");return t.setAttribute("class","prism-svg-net-overlay"),t.setAttribute("data-prism-overlay","net-highlight"),e.append(t),t}function Mu(e){let t=document.createElementNS(us,"g");return t.setAttribute("class","prism-svg-selection-overlay"),t.setAttribute("data-prism-overlay","selection"),t.style.pointerEvents="none",e.append(t),t}function Cx(e){let t=e.cloneNode(!0);t.removeAttribute("id"),t.removeAttribute("data-feature-key"),t.removeAttribute("data-net-uid"),t.removeAttribute("data-net-name"),t.classList.add("prism-svg-net-overlay-clone");for(let a of[t,...Array.from(t.querySelectorAll?.("*")||[])])a instanceof SVGElement&&(a.removeAttribute("filter"),a.style.pointerEvents="none",a.style.stroke="#18ef52",a.style.fill="none",a.style.opacity="0.98",a.style.vectorEffect="non-scaling-stroke");return t}function Tu(e){let t=null;for(let a of e)if(a.getBBox)try{let s=a.getBBox(),r=[s.x,s.y,s.x+s.width,s.y+s.height];t=t?[Math.min(t[0],r[0]),Math.min(t[1],r[1]),Math.max(t[2],r[2]),Math.max(t[3],r[3])]:r}catch{}return t}function Bx(e,t){return e?t?[Math.min(e[0],t[0]),Math.min(e[1],t[1]),Math.max(e[2],t[2]),Math.max(e[3],t[3])]:e:t}function Dr(e,t){let a=e.getAttribute("viewBox");if(a){let s=a.trim().split(/[\s,]+/).map(Number);if(s.length===4&&s.every(Number.isFinite))return s}return[0,0,t.sourceWidthMm||t.widthMm||1,t.sourceHeightMm||t.heightMm||1]}function ku(){return{featureToElements:new Map,netToElements:new Map,featureByKey:new Map,byId:new Map,bySource:new Map,features:[]}}function Fx(e){let t=e?.container?.getBoundingClientRect?.();if(!e?.svg||!e?.page||!t?.width||!t?.height)return .1;let a=Dr(e.svg,e.page);return Math.max(a[2]/t.width,a[3]/t.height)}function Ox(e){let t=String(e?.kind||"").toLowerCase(),a=String(e?.semanticRole||"").toLowerCase(),s=`${e?.sourceId||""} ${e?.objectId||""} ${e?.text||""}`.toLowerCase();return t.includes("page")||a.includes("page")||t.includes("background")||a.includes("background")||s.includes("background")||s.includes("sheet_header")||s.includes("sheet header")||s.includes("drawing-sheet")}function Px(e){let t=String(e?.kind||e?.semanticRole||"").toLowerCase();return t.includes("pin")?90:t.includes("label")||t.includes("port")?78:t.includes("wire")||t.includes("bus")||t.includes("junction")?70:t.includes("symbol")||t.includes("component")?54:t.includes("image")?30:20}function Au(e){if(!e||Ox(e))return!1;let t=String(e.kind||e.semanticRole||"").toLowerCase();return["pin","label","port","wire","bus","junction","no_connect","symbol","component","sheet","image","text"].some(a=>t.includes(a))}function jx(e){let t=`${e?.dataset?.primitive||""} ${e?.dataset?.ref||""} ${e?.dataset?.role||""} ${e?.dataset?.objectId||""} ${e?.dataset?.text||""}`.toLowerCase();return!t||t.includes("background")||t.includes("sheet_header")||t.includes("sheet header")||t.includes("drawing-sheet")?!1:["pin","label","port","wire","bus","junction","no_connect","symbol","component","sheet","image","text"].some(a=>t.includes(a))}function Eu(e){return String(e?.kind||e?.feature?.kind||"").toLowerCase()==="sheet"}function Su(e,t,a){e.has(t)||e.set(t,[]),e.get(t).push(a)}function Iu(e){let t=String(e||"").trim().toLowerCase();return!t||t.startsWith("#")?!1:t.startsWith("javascript:")||t.startsWith("data:")||t.startsWith("http://")||t.startsWith("https://")}function Lx(e){return/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(String(e||"").trim())}function Dx(e){let t=String(e||"").trim();return t&&!t.startsWith("#")&&!/^[a-z][a-z0-9+.-]*:/i.test(t)}function Ux(e){return String(e||"").replace(/url\(([^)]+)\)/gi,(t,a)=>{let s=a.trim().replace(/^['"]|['"]$/g,"");return Iu(s)?"none":t})}function zx(e,t){let a=String(e||"");return a=a.replace(/url\(#([^)]+)\)/g,(s,r)=>t.has(r)?`url(#${t.get(r)})`:s),a=a.replace(/^#(.+)$/,(s,r)=>t.has(r)?`#${t.get(r)}`:s),a}function Wi(e){return String(e||"").trim().replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,96)||"item"}function Lr(e,t,a){return Math.max(t,Math.min(a,e))}function vt(e){return`${e.level||""}/${e.id}`}function _u(e){let t=e.ends||[],a=e.wires||[];return t.length<2?[]:t.length===2?[{key:`${t[0].id}~${t[1].id}`,a:t[0].id,b:t[1].id,wires:new Set(a.map(s=>s.id))}]:t.map(s=>({key:`hub~${s.id}`,a:"hub",b:s.id,wires:new Set(a.filter(r=>r.from===s.id||r.to===s.id).map(r=>r.id))}))}function Gx(e,t){return!t||t.harness!==e.id?!1:!e.level||!t.occurrence||t.occurrence.startsWith(`${e.level}/`)}function Ru(e,t){let a=new Map;for(let s of e||[]){let r=new Map,n=new Set((s.wires||[]).map(i=>i.id));for(let i of t||[])for(let o of i.wires||[])n.has(o.wire)&&Gx(s,o)&&!r.has(o.wire)&&r.set(o.wire,i.color);r.size&&a.set(vt(s),r)}return a}function Nu(e,t){if(!t)return null;for(let a of e.wires)if(t.has(a))return t.get(a);return null}function Cu(e,t){let a=new Map;if(!t)return a;for(let s of e.wires||[]){let r=t.get(s.id);r&&(a.has(s.from)||a.set(s.from,r),a.has(s.to)||a.set(s.to,r))}return a}function Bu(e){let t=e.filter(Boolean);return t.length<2?null:[0,1,2].map(a=>t.reduce((s,r)=>s+r[a],0)/t.length)}var Qt="auto",Kx=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];function Aa(e,t){return e.level?t(e.level):Kx}function Xi(e,t){return[0,1,2].map(a=>e[a]*t[0]+e[4+a]*t[1]+e[8+a]*t[2]+e[12+a])}function fs(e,t){let a=[t[0]-e[12],t[1]-e[13],t[2]-e[14]];return[0,1,2].map(s=>e[s*4]*a[0]+e[s*4+1]*a[1]+e[s*4+2]*a[2])}function $i(e,t,a){return t?e.map(s=>{if(a(s)!==t.harness)return s;let r=s.nodes??[];if(t.insert)return{...s,nodes:[...r,t.insert]};let n=t.id===Qt?[{id:Qt,kind:"breakout",positionMm:t.positionMm,pinned:!1,order:-1,ends:[],between:null},...r]:r.map(i=>i.id===t.id?{...i,positionMm:t.positionMm,pinned:i.kind==="waypoint"?!0:i.pinned}:i);return{...s,nodes:n}}):e}var Fu="__bend__";function Ou(e,{kind:t,segment:a,atMm:s,positionMm:r,toWorldMm:n}){if(t==="breakout"){let x=e.filter(g=>g.kind==="breakout").reduce((g,y)=>Math.max(g,y.order??0),-1);return{id:Fu,kind:"breakout",positionMm:r,pinned:!1,order:x+1,ends:[],between:null}}let i=a.samplesMm.flat(),o=x=>{let g=0,y=1/0;for(let m=0;m+2<i.length;m+=3){let v=Math.hypot(i[m]-x[0],i[m+1]-x[1],i[m+2]-x[2]);v<y&&([g,y]=[m/3,v])}return g},c=x=>[...x].sort().join("|"),l=e.filter(x=>x.kind==="waypoint"&&x.between&&c(x.between)===c([a.from,a.to])).sort((x,g)=>(x.order??0)-(g.order??0)),f=l[0]?.between??[a.from,a.to],u=f[0]===a.from?1:-1,p=x=>u*o(x),b=p(s),h=l.filter(x=>p(n(x.positionMm))<b).length,d=l.length?h===0?(l[0].order??0)-1:h===l.length?(l[l.length-1].order??0)+1:((l[h-1].order??0)+(l[h].order??0))/2:0;return{id:Fu,kind:"waypoint",positionMm:r,pinned:!0,order:d,ends:[],between:[...f]}}function Pu(e,t,a){let s=(e.nodes??[]).map(n=>({id:n.id,kind:n.kind,pinned:!!n.pinned,worldMm:Xi(a,n.positionMm)})),r=t.find(n=>n.to===Qt);return r&&s.push({id:Qt,kind:"breakout",pinned:!1,auto:!0,worldMm:r.samplesMm.slice(-3)}),s}function Vx(e,t,a){let s=t[0]-e[0],r=t[1]-e[1],n=s*s+r*r,i=n>0?Math.max(0,Math.min(1,((a[0]-e[0])*s+(a[1]-e[1])*r)/n)):0;return{t:i,distance:Math.hypot(e[0]+i*s-a[0],e[1]+i*r-a[1])}}function ju(e,t,a,s,r=5){let n=null;return e.forEach((i,o)=>{let c=i.samplesMm,l=Math.floor(c.length/3),f=l?a([c[0],c[1],c[2]]):null;for(let u=0;u+1<l;u+=1){let p=[c[u*3+3],c[u*3+4],c[u*3+5]],b=a(p);if(f&&b){let{t:h,distance:d}=Vx(f,b,t),x=[0,1,2].map(y=>c[u*3+y]+h*(p[y]-c[u*3+y])),g=r+i.radiusMm*s(x);d<=g&&(!n||d<n.distancePx)&&(n={index:o,sample:u,t:h,pointMm:x,distancePx:d})}f=b}}),n}function Lu(e,t,a,s,{right:r,up:n}){if(!(s>0))return[...e];let i=t/s,o=-a/s;return e.map((c,l)=>c+r[l]*i+n[l]*o)}function Du(e,t,a=3){return Math.hypot(t[0]-e[0],t[1]-e[1])>=a}function Gu(e,t,a,s){let{right:r,up:n,back:i}=e.basis(),o=Math.tan(e.fov/2),c=Ee(e.focus,pe(i,e.distance)),l=He(Ee(Ee(pe(i,-1),pe(r,t*o*s)),pe(n,a*o)));return{origin:c,direction:l}}function Yi(e){let t=new Array(16);t[0]=e[5]*e[10]*e[15]-e[5]*e[11]*e[14]-e[9]*e[6]*e[15]+e[9]*e[7]*e[14]+e[13]*e[6]*e[11]-e[13]*e[7]*e[10],t[4]=-e[4]*e[10]*e[15]+e[4]*e[11]*e[14]+e[8]*e[6]*e[15]-e[8]*e[7]*e[14]-e[12]*e[6]*e[11]+e[12]*e[7]*e[10],t[8]=e[4]*e[9]*e[15]-e[4]*e[11]*e[13]-e[8]*e[5]*e[15]+e[8]*e[7]*e[13]+e[12]*e[5]*e[11]-e[12]*e[7]*e[9],t[12]=-e[4]*e[9]*e[14]+e[4]*e[10]*e[13]+e[8]*e[5]*e[14]-e[8]*e[6]*e[13]-e[12]*e[5]*e[10]+e[12]*e[6]*e[9],t[1]=-e[1]*e[10]*e[15]+e[1]*e[11]*e[14]+e[9]*e[2]*e[15]-e[9]*e[3]*e[14]-e[13]*e[2]*e[11]+e[13]*e[3]*e[10],t[5]=e[0]*e[10]*e[15]-e[0]*e[11]*e[14]-e[8]*e[2]*e[15]+e[8]*e[3]*e[14]+e[12]*e[2]*e[11]-e[12]*e[3]*e[10],t[9]=-e[0]*e[9]*e[15]+e[0]*e[11]*e[13]+e[8]*e[1]*e[15]-e[8]*e[3]*e[13]-e[12]*e[1]*e[11]+e[12]*e[3]*e[9],t[13]=e[0]*e[9]*e[14]-e[0]*e[10]*e[13]-e[8]*e[1]*e[14]+e[8]*e[2]*e[13]+e[12]*e[1]*e[10]-e[12]*e[2]*e[9],t[2]=e[1]*e[6]*e[15]-e[1]*e[7]*e[14]-e[5]*e[2]*e[15]+e[5]*e[3]*e[14]+e[13]*e[2]*e[7]-e[13]*e[3]*e[6],t[6]=-e[0]*e[6]*e[15]+e[0]*e[7]*e[14]+e[4]*e[2]*e[15]-e[4]*e[3]*e[14]-e[12]*e[2]*e[7]+e[12]*e[3]*e[6],t[10]=e[0]*e[5]*e[15]-e[0]*e[7]*e[13]-e[4]*e[1]*e[15]+e[4]*e[3]*e[13]+e[12]*e[1]*e[7]-e[12]*e[3]*e[5],t[14]=-e[0]*e[5]*e[14]+e[0]*e[6]*e[13]+e[4]*e[1]*e[14]-e[4]*e[2]*e[13]-e[12]*e[1]*e[6]+e[12]*e[2]*e[5],t[3]=-e[1]*e[6]*e[11]+e[1]*e[7]*e[10]+e[5]*e[2]*e[11]-e[5]*e[3]*e[10]-e[9]*e[2]*e[7]+e[9]*e[3]*e[6],t[7]=e[0]*e[6]*e[11]-e[0]*e[7]*e[10]-e[4]*e[2]*e[11]+e[4]*e[3]*e[10]+e[8]*e[2]*e[7]-e[8]*e[3]*e[6],t[11]=-e[0]*e[5]*e[11]+e[0]*e[7]*e[9]+e[4]*e[1]*e[11]-e[4]*e[3]*e[9]-e[8]*e[1]*e[7]+e[8]*e[3]*e[5],t[15]=e[0]*e[5]*e[10]-e[0]*e[6]*e[9]-e[4]*e[1]*e[10]+e[4]*e[2]*e[9]+e[8]*e[1]*e[6]-e[8]*e[2]*e[5];let a=e[0]*t[0]+e[1]*t[4]+e[2]*t[8]+e[3]*t[12];return Math.abs(a)<1e-30?null:t.map(s=>s/a)}function Uu(e,t){return[0,1,2].map(a=>e[a]*t[0]+e[4+a]*t[1]+e[8+a]*t[2]+e[12+a])}function zu(e,t){return[0,1,2].map(a=>e[a]*t[0]+e[4+a]*t[1]+e[8+a]*t[2])}function Hx(e,t,a){let s=-1/0,r=1/0;for(let n=0;n<3;n+=1){if(Math.abs(t[n])<1e-15){if(e[n]<a[n]||e[n]>a[n+3])return!1;continue}let i=(a[n]-e[n])/t[n],o=(a[n+3]-e[n])/t[n];s=Math.max(s,Math.min(i,o)),r=Math.min(r,Math.max(i,o))}return r>=Math.max(s,0)}function qx(e,t,a){let s=null;for(let r of e){if(r.bounds&&!Hx(t,a,r.bounds))continue;let n=r.position,i=r.indices,o=i?i.length:n.length/3;for(let c=0;c+2<o;c+=3){let l=(i?i[c]:c)*3,f=(i?i[c+1]:c+1)*3,u=(i?i[c+2]:c+2)*3,p=[n[f]-n[l],n[f+1]-n[l+1],n[f+2]-n[l+2]],b=[n[u]-n[l],n[u+1]-n[l+1],n[u+2]-n[l+2]],h=qe(a,b),d=tt(p,h);if(Math.abs(d)<1e-18)continue;let x=[t[0]-n[l],t[1]-n[l+1],t[2]-n[l+2]],g=tt(x,h)/d;if(g<0||g>1)continue;let y=qe(x,p),m=tt(a,y)/d;if(m<0||g+m>1)continue;let v=tt(b,y)/d;v>1e-12&&(!s||v<s.t)&&(s={t:v,normal:qe(p,b)})}}return s}function Ku(e,t){let a=null;for(let s of e){let r=Yi(s.matrix);if(!r)continue;let n=Uu(r,t.origin),i=zu(r,t.direction),o=qx(s.primitives,n,i);if(!o)continue;let c=Uu(s.matrix,Ee(n,pe(i,o.t))),l=Math.hypot(...c.map((p,b)=>p-t.origin[b]));if(a&&l>=a.distance)continue;let f=[r[0],r[4],r[8],0,r[1],r[5],r[9],0,r[2],r[6],r[10],0,0,0,0,1],u=He(zu(f,o.normal));tt(u,t.direction)>0&&(u=pe(u,-1)),a={key:s.key,point:c,normal:u,distance:l}}return a?{key:a.key,point:a.point,normal:a.normal}:null}var Ae={bootMm:10,housingDepthMm:8,breakoutLiftMm:10,chordErrorMm:.2,catmullRomAlpha:.5,minBendRadiusFactor:6,bendRelaxIterations:8,packingFactor:1.2,ringSegments:12,breakoutBlendMm:5,lengthAllowance:.1,lengthMismatchTolerance:.15,boardCollisionMarginMm:1,defaultGaugeAwg:"24"},Ji={24:1.143,22:1.3208,20:1.524,18:1.8034,16:2.0066,14:2.3622,12:2.8956,10:3.5306,8:5.0546,6:6.35,4:7.9248,2:9.8552,1:10.9474,0:12.1666,"00":13.8684};function Vu(e){let t=e==null?null:String(e).trim().toUpperCase().replace(/AWG$/,"").trim();return t!==null&&t in Ji?{odMm:Ji[t],assumed:!1}:{odMm:Ji[Ae.defaultGaugeAwg],assumed:!0}}var zr=(Math.sqrt(5)-1)/2,Wx=60;function Xx(e,t,a){let s=0;for(let r=0;r<3;r+=1){let n=e[r]<t[r]?t[r]-e[r]:e[r]>a[r]?e[r]-a[r]:0;s+=n*n}return s}function $x(e,t,a,s){let r=b=>Xx([0,1,2].map(h=>e[h]+b*(t[h]-e[h])),a,s),n=0,i=1,o=i-zr*(i-n),c=n+zr*(i-n),l=r(o),f=r(c);for(let b=0;b<Wx;b+=1)l<=f?([i,c,f]=[c,o,l],o=i-zr*(i-n),l=r(o)):([n,o,l]=[o,c,f],c=n+zr*(i-n),f=r(c));let[u,p]=l<=f?[o,l]:[c,f];for(let b of[0,1]){let h=r(b);h<p&&([u,p]=[b,h])}return[Math.sqrt(p),u]}function Yx(e,t){let a=[t[0]-e[12],t[1]-e[13],t[2]-e[14]];return[0,1,2].map(s=>e[s*4]*a[0]+e[s*4+1]*a[1]+e[s*4+2]*a[2])}function Jx(e,t){let[a,s]=[e[t],e[t+1]],r=0;for(let n=0;n<3;n+=1)r+=(s[n]-a[n])*(s[n]-a[n]);return Math.sqrt(r)}function Hu(e,t){let a=e.length-1,s=0;for(let r=0;r<a;r+=1){let n=t?r:a-1-r;if(s>=Ae.bootMm)return r;s+=Jx(e,n)}return a}function qu(e,t){let a=Ae.boardCollisionMarginMm,s=t.map(n=>({board:n,lo:[0,1,2].map(i=>n.minMm[i]-a),hi:[0,1,2].map(i=>n.maxMm[i]+a)})),r=[];for(let n of e.curves){let i=n.diameterMm/2,o=n.samplesMm;if(i<=0||o.length<2)continue;let c=o.length-1,l=new Map,f=(b,h,d)=>{let x=l.get(b)??new Set;for(let g=h;g<d;g+=1)x.add(g);l.set(b,x)},u=e.ends[n.from];u&&f(u.occurrence,0,Hu(o,!0));let p=e.ends[n.to];p&&f(p.occurrence,c-Hu(o,!1),c);for(let{board:b,lo:h,hi:d}of s){let x=o.map(v=>Yx(b.matrix,v)),g=l.get(b.id),y=[],m=null;for(let v=0;v<c;v+=1){if(g?.has(v))continue;let[E,S]=$x(x[v],x[v+1],h,d);E<i&&(y.push(v),(!m||E<m[0])&&(m=[E,v,S]))}if(m){let[v,E,S]=m,[A,T]=[o[E],o[E+1]];r.push({segmentId:n.segmentId,board:b.id,distanceMm:v,radiusMm:i,atMm:[0,1,2].map(_=>A[_]+S*(T[_]-A[_])),spans:y})}}}return r}var Qx=/_vertical(_|$)/i,Zx=/_(horizontal|rightangle|right_angle|angled)(_|$)|_RA(_|$)/i,Xu=e=>e*Math.PI/180;function Wu(e){let t=e.replace(/[0-9]+$/,""),a=e.slice(t.length);return[t,a?Number.parseInt(a,10):-1,e]}function ew(e,t){let[a,s,r]=Wu(e),[n,i,o]=Wu(t);return a!==n?a<n?-1:1:s!==i?s-i:r<o?-1:r>o?1:0}function Zi(e,t){let a=Xu(e.rotationDeg),s=t[0]-e.positionMm[0],r=t[1]-e.positionMm[1];return[s*Math.cos(a)+r*Math.sin(a),-s*Math.sin(a)+r*Math.cos(a)]}function $u(e,t){let a=Xu(e.rotationDeg);return[t[0]*Math.cos(a)-t[1]*Math.sin(a),t[0]*Math.sin(a)+t[1]*Math.cos(a),0]}function tw(e){return new Set(e.pads.map(t=>`${t.positionMm[0]},${t.positionMm[1]}`)).size}function Yu(e){let t=e.pads.filter(a=>a.pad);return t.length?t:e.pads}function Ju(e){let t=Yu(e),a=t.length;return[t.reduce((s,r)=>s+r.positionMm[0],0)/a,t.reduce((s,r)=>s+r.positionMm[1],0)/a]}function aw(e,t){let a=Math.atan2(t,e)*180/Math.PI,s=sw(a/90)*90;return Math.abs(a-s)>20?null:{0:"+x",90:"+y",180:"-x","-180":"-x","-90":"-y"}[String(s===0?0:s)]}function sw(e){let t=Math.floor(e),a=e-t;return a>.5?t+1:a<.5||t%2===0?t:t+1}function rw(e){let t=(d,x,...g)=>({axis:x==="low"?null:d,confidence:x,reasons:g});if(!e||tw(e)<2)return t(null,"low","too_few_pads");let a=e.side==="top"?"top":"bottom",s=e.footprintName??"",r=Qx.test(s),n=Zx.test(s),i=e.courtyard;if(!i)return r?t(a,"medium","name_vertical","no_courtyard"):t(null,"low","no_courtyard");let o=e.pads.map(d=>Zi(e,d.positionMm)),c=o.map(([d])=>d),l=o.map(([,d])=>d),f=[c.reduce((d,x)=>d+x,0)/c.length,l.reduce((d,x)=>d+x,0)/l.length],u=[(i.minMm[0]+i.maxMm[0])/2,(i.minMm[1]+i.maxMm[1])/2],p=Math.min(...c)-1<=u[0]&&u[0]<=Math.max(...c)+1&&Math.min(...l)-1<=u[1]&&u[1]<=Math.max(...l)+1,b=[u[0]-f[0],u[1]-f[1]],h=!p&&Math.hypot(...b)>=.5?aw(...b):null;return r?p?t(a,"high","name_vertical","body_over_pads"):t(null,"low","name_vertical","name_conflicts_geometry"):n?h?t(h,"high","name_right_angle","body_off_pads"):t(null,"low","name_right_angle","name_conflicts_geometry"):p?t(a,"medium","body_over_pads"):h?t(h,"medium","body_off_pads"):t(null,"low","body_ambiguous")}function Gr(e){let t=Math.sqrt(e.reduce((a,s)=>a+s*s,0));return e.map(a=>a/t)}var nw=(e,t)=>[e[1]*t[2]-e[2]*t[1],e[2]*t[0]-e[0]*t[2],e[0]*t[1]-e[1]*t[0]],Qi=(e,t)=>e.reduce((a,s,r)=>a+s*t[r],0);function iw(e){let t=e.pads.filter(s=>s.pad),a=t.find(s=>s.pad==="1");return a||(t.length?[...t].sort((s,r)=>ew(s.pad,r.pad))[0]:e.pads[0])}function ow(e){let[t,a]=Ju(e),s=Yu(e),r=s.length,n=0,i=0,o=0;for(let b of s)n+=(b.positionMm[0]-t)**2,i+=(b.positionMm[1]-a)**2,o+=(b.positionMm[0]-t)*(b.positionMm[1]-a);n/=r,i/=r,o/=r;let c=(n+i)/2,l=n*i-o*o,f=Math.sqrt(Math.max(c*c-l,0)),u=c+f,p=c-f;return u<=1e-12||u-p<=.05*u?$u(e,[1,0]):Math.abs(o)>1e-12?Gr([u-i,o,0]):n>=i?[1,0,0]:[0,1,0]}function cw(e,t){if(t==="top")return[0,0,1];if(t==="bottom")return[0,0,-1];let a=t[0]==="-"?-1:1;return Gr($u(e,t[1]==="x"?[a,0]:[0,a]))}function eo(e,t,a){let[s,r,n]=e,[i,o,c]=t,[l,f,u]=a,p=s+o+u,b;if(p>0){let d=Math.sqrt(p+1)*2;b=[(c-f)/d,(l-n)/d,(r-i)/d,.25*d]}else if(s>o&&s>u){let d=Math.sqrt(1+s-o-u)*2;b=[.25*d,(i+r)/d,(l+n)/d,(c-f)/d]}else if(o>u){let d=Math.sqrt(1+o-s-u)*2;b=[(i+r)/d,.25*d,(f+c)/d,(l-n)/d]}else{let d=Math.sqrt(1+u-s-o)*2;b=[(l+n)/d,(f+c)/d,.25*d,(r-i)/d]}return b=Gr(b),([b[3],b[0],b[1],b[2]].find(d=>Math.abs(d)>1e-12)??1)<0?b.map(d=>-d):b}function hs(e,t,a){if(!e||e.pads.length===0)return null;let s=a?a.axis:rw(e).axis;if(!s)return null;let r=a?((a.quarterTurns??0)%4+4)%4:0,[n,i]=Ju(e),o=(t??0)/2,c=[n,i,e.side==="top"?o:-o],l=cw(e,s),f=ow(e),u=Qi(f,l),p=[f[0]-u*l[0],f[1]-u*l[1],f[2]-u*l[2]];Math.sqrt(Qi(p,p))<1e-9&&(p=[-l[1],l[0],0]),p=Gr(p);let b=iw(e).positionMm;Qi([b[0]-n,b[1]-i,0],p)>1e-9&&(p=p.map(d=>-d));let h=nw(l,p);for(let d=0;d<r;d+=1)[p,h]=[h,p.map(x=>-x)];return{axis:s,quarterTurns:r,originMm:c,xAxis:p,yAxis:h,zAxis:l,rotation:eo(p,h,l)}}function xe(e){return Math.round(e*1e9)/1e9+0}function Kr(e){let t=Math.hypot(...e)||1,a=e.map(r=>r/t),s=[a[3],a[0],a[1],a[2]].find(r=>Math.abs(r)>1e-12)??1;return a.map(r=>xe(s<0?-r:r))}function bs(e,t){let[a,s,r,n]=e,i=s*t[2]-r*t[1],o=r*t[0]-a*t[2],c=a*t[1]-s*t[0];return[t[0]+2*(n*i+s*c-r*o),t[1]+2*(n*o+r*i-a*c),t[2]+2*(n*c+a*o-s*i)]}function lw(e,t){let[a,s,r,n]=e,[i,o,c,l]=t;return[n*i+a*l+s*c-r*o,n*o-a*c+s*l+r*i,n*c+a*o-s*i+r*l,n*l-a*i-s*o-r*c]}function ut(e,t){let a=bs(e.rotation,t.translationMm);return{translationMm:e.translationMm.map((s,r)=>xe(s+a[r])),rotation:Kr(lw(e.rotation,t.rotation))}}function to(e){let[t,a,s,r]=e.rotation,[n,i,o]=e.translationMm;return[1-2*(a*a+s*s),2*(t*a+s*r),2*(t*s-a*r),0,2*(t*a-s*r),1-2*(t*t+s*s),2*(a*s+t*r),0,2*(t*s+a*r),2*(a*s-t*r),1-2*(t*t+a*a),0,n,i,o,1].map(xe)}var Qu=5;var Vr=Math.SQRT1_2,bT=[[0,0,0,1],[0,0,Vr,Vr],[0,0,1,0],[0,0,Vr,-Vr]];function dw(e,t){let a=[0,1,2].map(s=>t[s]-e.originMm[s]);return[e.xAxis,e.yAxis,e.zAxis].map(s=>a[0]*s[0]+a[1]*s[1]+a[2]*s[2])}function Hr(e,t,a){let s,r;if(a)s=[...a.minMm],r=[...a.maxMm];else if(e.courtyard)s=[...e.courtyard.minMm,0],r=[...e.courtyard.maxMm,Qu];else{let u=e.pads.map(p=>Zi(e,p.positionMm));s=[Math.min(...u.map(p=>p[0])),Math.min(...u.map(p=>p[1])),0],r=[Math.max(...u.map(p=>p[0])),Math.max(...u.map(p=>p[1])),Qu]}let n=e.rotationDeg*Math.PI/180,[i,o]=e.positionMm,c=(t??0)/2,l=e.side==="top",f=[];for(let u=0;u<8;u+=1){let[p,b,h]=[0,1,2].map(d=>(u>>d&1?r:s)[d]);f.push([i+p*Math.cos(n)-b*Math.sin(n),o+p*Math.sin(n)+b*Math.cos(n),l?c+h:-c-h])}return f}function qr(e,t){let a=t.map(s=>dw(e,s));return[[0,1,2].map(s=>Math.min(...a.map(r=>r[s]))),[0,1,2].map(s=>Math.max(...a.map(r=>r[s])))]}var Wr=Math.SQRT1_2,uw=[[0,0,0,1],[0,0,Wr,Wr],[0,0,1,0],[0,0,Wr,-Wr]],fw=[1,0,0,0],Xr=[0,0,0,1],hw=(e,t)=>{let a=t*Math.PI/360;return[e[0]*Math.sin(a),e[1]*Math.sin(a),e[2]*Math.sin(a),Math.cos(a)]};function ao(e){if(!e)return{pose:{translationMm:[0,0,0],rotation:Xr},scale:1};let[t,a,s]=(e.rotationDeg??[0,0,0]).map(Number),r=Xr;for(let[i,o]of[[[0,0,1],s],[[0,1,0],a],[[1,0,0],t]])r=ut({translationMm:[0,0,0],rotation:r},{translationMm:[0,0,0],rotation:hw(i,o)}).rotation;return{pose:{translationMm:(e.offsetMm??[0,0,0]).map(Number),rotation:Kr(r)},scale:Number(e.scale??1)||1}}function bw(e){let t=e?.boundsMm;if(!t)return{exit:[0,0,-Ae.housingDepthMm],depth:Ae.housingDepthMm,modeled:!1};let{pose:a,scale:s}=ao(e.alignment),r=[];for(let c=0;c<8;c+=1){let l=[0,1,2].map(u=>(c>>u&1?t.maxMm:t.minMm)[u]*s),f=bs(a.rotation,l);r.push([0,1,2].map(u=>f[u]+a.translationMm[u]))}let n=[0,1,2].map(c=>Math.min(...r.map(l=>l[c]))),i=[0,1,2].map(c=>Math.max(...r.map(l=>l[c]))),o=Math.min(n[2],0);return{exit:[(n[0]+i[0])/2,(n[1]+i[1])/2,o],depth:-o+0,modeled:!0}}function pw(e,t=0,a){let s=uw[(t%4+4)%4],r=ut({translationMm:[0,0,0],rotation:fw},{translationMm:[0,0,0],rotation:s}),n=ut(e,r),{exit:i,depth:o,modeled:c}=bw(a),l=ut(n,{translationMm:i,rotation:Xr}).translationMm,f=bs(n.rotation,[0,0,-1]),u=[0,1,2].map(p=>l[p]+Ae.bootMm*f[p]);return{pose:n,exitMm:l.map(xe),outward:f.map(xe),legMm:u.map(xe),depthMm:xe(o),modeled:c}}function Zu(e,t,a,s,r=0,n,i){let o=hs(t,a,s);if(!o||!t)return null;let c=Math.max(qr(o,Hr(t,a,i))[1][2],0),l=ut(e,{translationMm:o.originMm,rotation:o.rotation});return l=ut(l,{translationMm:[0,0,c],rotation:Xr}),{...pw(l,r,n),matingPlaneMm:xe(c)}}function so(e,t){let a=new Array(16).fill(0);for(let s=0;s<4;s+=1)for(let r=0;r<4;r+=1){let n=0;for(let i=0;i<4;i+=1)n+=e[i*4+r]*t[s*4+i];a[s*4+r]=n}return a}var gw=(e,t)=>[t[0]-e[0],0,0,0,0,t[1]-e[1],0,0,0,0,t[2]-e[2],0,e[0],e[1],e[2],1];function mw(e,t){let a=e.connector,s=a?hs(a.geometry,a.thicknessMm,a.stored):null;if(!a||!s)return null;let[r,n]=qr(s,Hr(a.geometry,a.thicknessMm));return[[r[0],-n[1],-t],[n[0],-r[1],0]]}function ef(e,t){let a=`${e.level||""}/${e.id}`,s=[];for(let r of[...e.ends].sort((n,i)=>n.ordinal-i.ordinal)){let n=t.ends[r.id];if(!n)continue;let i=to(n.pose),o={key:`${a}/${r.id}`,harness:a,end:r.id};if(r.housing?.boundsMm){let{pose:l,scale:f}=ao(r.housing.alignment),u=so(to(l),[f,0,0,0,0,f,0,0,0,0,f,0,0,0,0,1]);s.push({...o,matrix:so(i,u),model:r.housing});continue}let c=mw(r,n.depthMm);c&&s.push({...o,matrix:so(i,gw(...c)),model:null})}return s}var yw=12,xw=2,ww=1e-9,_a=(e,t)=>[e[0]-t[0],e[1]-t[1],e[2]-t[2]],Mt=(e,t)=>Math.sqrt((e[0]-t[0])**2+(e[1]-t[1])**2+(e[2]-t[2])**2);function Ia(e,t,a,s,r){if(s===a)return[e[0],e[1],e[2]];let n=(s-r)/(s-a),i=(r-a)/(s-a);return[n*e[0]+i*t[0],n*e[1]+i*t[1],n*e[2]+i*t[2]]}function vw(e,t,a,s){let r=Ae.catmullRomAlpha,n=0,i=n+Mt(e,t)**r,o=i+Mt(t,a)**r,c=o+Mt(a,s)**r;return l=>{let f=i+l*(o-i),u=Ia(e,t,n,i,f),p=Ia(t,a,i,o,f),b=Ia(a,s,o,c,f),h=Ia(u,p,n,o,f),d=Ia(p,b,i,c,f);return Ia(h,d,i,o,f)}}function Mw(e,t,a){let s=_a(a,t),r=_a(e,t),n=Math.sqrt(s[0]*s[0]+s[1]*s[1]+s[2]*s[2]);if(n<1e-12)return Mt(e,t);let i=[s[1]*r[2]-s[2]*r[1],s[2]*r[0]-s[0]*r[2],s[0]*r[1]-s[1]*r[0]];return Math.sqrt(i[0]*i[0]+i[1]*i[1]+i[2]*i[2])/n}function tf(e){let t=o=>[o[0],o[1],o[2]];if(e.length<2)return{samples:e.map(t),spans:e.map(()=>0)};let a=e[0],s=e[e.length-1],r=[_a([2*a[0],2*a[1],2*a[2]],e[1]),...e,_a([2*s[0],2*s[1],2*s[2]],e[e.length-2])],n=[t(a)],i=[0];for(let o=0;o<e.length-1;o+=1){let c=vw(r[o],r[o+1],r[o+2],r[o+3]),l=(f,u,p,b,h)=>{let d=(f+u)/2,x=c(d);h<xw||h<yw&&Mw(x,p,b)>Ae.chordErrorMm?(l(f,d,p,x,h+1),l(d,u,x,b,h+1)):(n.push(b),i.push(o))};l(0,1,t(e[o]),t(e[o+1]),0)}return{samples:n,spans:i}}function kw(e,t,a){let s=Mt(e,t),r=Mt(t,a),n=Mt(a,e),i=_a(t,e),o=_a(a,e),c=[i[1]*o[2]-i[2]*o[1],i[2]*o[0]-i[0]*o[2],i[0]*o[1]-i[1]*o[0]],l=Math.sqrt(c[0]*c[0]+c[1]*c[1]+c[2]*c[2]);return l<1e-12?Number.POSITIVE_INFINITY:s*r*n/(2*l)}function af(e){let t=Number.POSITIVE_INFINITY,a=-1;for(let s=1;s<e.length-1;s+=1){let r=kw(e[s-1],e[s],e[s+1]);r<t&&(t=r,a=s)}return{radius:t,at:a}}function Ew(e,t,a){let s=[],r=[];e.forEach((p,b)=>{if(s.length&&Mt(s[s.length-1],p)<ww){r[r.length-1]=r[r.length-1]&&t[b];return}s.push([p[0],p[1],p[2]]),r.push(!!t[b])});let n=Ae.minBendRadiusFactor*a,{samples:i,spans:o}=tf(s),{radius:c,at:l}=af(i);for(let p=0;p<Ae.bendRelaxIterations&&!(c>=n||l<0);p+=1){let b=o[l],h=[];for(let y=1;y<s.length-1;y+=1)r[y]&&h.push(y);if(!h.length)break;let d=y=>Math.min(Math.abs(y-b),Math.abs(y-(b+1))),x=h[0];for(let y of h)d(y)<d(x)&&(x=y);let g=[0,1,2].map(y=>(s[x-1][y]+s[x+1][y])/2);s[x]=[0,1,2].map(y=>(s[x][y]+g[y])/2),{samples:i,spans:o}=tf(s),{radius:c,at:l}=af(i)}let f=0;for(let p=0;p+1<i.length;p+=1)f+=Mt(i[p],i[p+1]);let u=p=>p.map(xe);return{controlMm:s.map(u),samplesMm:i.map(u),lengthMm:xe(f),minRadiusMm:Number.isFinite(c)?xe(c):null,minRadiusAllowedMm:xe(n),tightBend:l>=0&&c<n?{atMm:u(i[l]),radiusMm:xe(c)}:null}}function Sw(e){let t=Ae.bootMm/2,{exitMm:a,outward:s,legMm:r}=e;return[[a[0],a[1],a[2]],[a[0]+t*s[0],a[1]+t*s[1],a[2]+t*s[2]],[r[0],r[1],r[2]],[r[0]+t*s[0],r[1]+t*s[1],r[2]+t*s[2]]]}function sf(e,t,a={},s={}){let r=new Map(t.nodes.map(n=>[n.id,n.positionMm]));return t.segments.map(n=>{let i=b=>b in e?Sw(e[b]):[[...r.get(b)]],o=i(n.from),c=i(n.to),l=(a[n.id]??[]).map(b=>[b[0],b[1],b[2]]),f=[...o,...l,...c.reverse()],u=s[n.id]??[],p=[...o.map(()=>!1),...l.map((b,h)=>!u[h]),...c.map(()=>!1)];return{segmentId:n.id,...Ew(f,p,n.diameterMm)}})}var rf=e=>[e[0],e[1],e[2]];function nf(e,t){return e.filter(a=>a.kind===t).sort((a,s)=>a.order-s.order||(a.id<s.id?-1:a.id>s.id?1:0))}function of(e){return nf(e,"breakout").map(t=>({id:t.id,positionMm:rf(t.positionMm),ends:[...t.ends??[]]}))}function cf(e,t){let a=(i,o)=>i<o?`${i}
${o}`:`${o}
${i}`,s=new Map;for(let i of nf(t,"waypoint")){let[o,c]=i.between??[],l=a(o,c),f=s.get(l);f?f.push(i):s.set(l,[i])}let r={waypoints:{},pinned:{},unused:[]},n=new Set;for(let i of e.segments){let o=a(i.from,i.to),c=s.get(o);c&&(n.add(o),c[0].between?.[0]!==i.from&&(c=[...c].reverse()),r.waypoints[i.id]=c.map(l=>rf(l.positionMm)),r.pinned[i.id]=c.map(l=>!!l.pinned))}for(let[i,o]of s)n.has(i)||r.unused.push(...o.map(c=>c.id));return r.unused.sort(),r}var lf=(e,t)=>Math.hypot(e[0]-t[0],e[1]-t[1],e[2]-t[2]);function Tw(e){if(!e.length)return{diameterMm:0,assumedGauge:!1};let t=0,a=!1;for(let s of e){let{odMm:r,assumed:n}=Vu(s.gaugeAwg);t+=r*r,a=a||n}return{diameterMm:xe(Ae.packingFactor*Math.sqrt(t)),assumedGauge:a}}function Aw(e,t){let a=e.map(o=>Math.max(t.get(o.id)??0,0));a.every(o=>o===0)&&(a=e.map(()=>1));let s=a.reduce((o,c)=>o+c,0),r=[0,1,2].map(o=>e.reduce((c,l,f)=>c+a[f]*l.legMm[o],0)/s),n=[0,1,2].map(o=>e.reduce((c,l)=>c+l.outward[o],0)/e.length),i=Math.hypot(...n);return i<1e-9?r:[0,1,2].map(o=>r[o]+Ae.breakoutLiftMm*n[o]/i)}function df(e,t,a=[]){let s=new Map(e.map(b=>[b.id,b])),r=[],n=[];for(let b of t)s.has(b.from.end)&&s.has(b.to.end)?r.push(b):n.push(b.id);let i=new Map;for(let b of r)for(let h of[b.from.end,b.to.end])i.set(h,(i.get(h)??0)+1);let o=b=>b.map(xe),c=e.map(b=>({id:b.id,kind:"end",positionMm:o(b.legMm)})),l=[];if(a.length){for(let h of a)c.push({id:h.id,kind:"breakout",positionMm:o(h.positionMm)});let b=new Map;for(let h of a)for(let d of h.ends??[])s.has(d)&&!b.has(d)&&b.set(d,h.id);for(let h of e){let d=b.get(h.id);if(d===void 0){let x=a[0];for(let g of a)lf(g.positionMm,h.legMm)<lf(x.positionMm,h.legMm)&&(x=g);d=x.id}l.push([h.id,d])}for(let h=0;h+1<a.length;h+=1)l.push([a[h].id,a[h+1].id])}else if(e.length===2)l.push([e[0].id,e[1].id]);else if(e.length>2){c.push({id:"auto",kind:"breakout",positionMm:o(Aw(e,i))});for(let b of e)l.push([b.id,"auto"])}let f=new Map(c.map(b=>[b.id,[]]));for(let[b,h]of l)f.get(b).push(h),f.get(h).push(b);let u=(b,h)=>{let d=new Set([b]),x=[b];for(;x.length;){let g=x.pop();for(let y of f.get(g))g===h[0]&&y===h[1]||g===h[1]&&y===h[0]||d.has(y)||(d.add(y),x.push(y))}return d},p=l.map(([b,h])=>{let d=u(b,[b,h]),x=r.filter(g=>d.has(g.from.end)!==d.has(g.to.end));return{id:`${b}~${h}`,from:b,to:h,wires:x.map(g=>g.id),...Tw(x)}});return{nodes:c,segments:p,unplaced:n}}var Iw=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];function ro(e){return{translationMm:[e[12],e[13],e[14]],rotation:eo([e[0],e[1],e[2]],[e[4],e[5],e[6]],[e[8],e[9],e[10]])}}function _w(e,t){return[0,1,2].map(a=>e[a]*t[0]+e[4+a]*t[1]+e[8+a]*t[2]+e[12+a])}function uf(e,t){let a={};for(let u of[...e.ends].sort((p,b)=>p.ordinal-b.ordinal)){let p=u.occurrence?t(u.occurrence):null;if(!p||!u.connector||!u.occurrence)continue;let b=u.connector.inOccurrence?ut(ro(p),u.connector.inOccurrence):ro(p),h=Zu(b,u.connector.geometry,u.connector.thicknessMm,u.connector.stored,0,u.housing);h&&(a[u.id]={...h,occurrence:u.occurrence})}if(Object.keys(a).length<2)return null;let s=Object.entries(a).map(([u,p])=>({id:u,legMm:p.legMm,outward:p.outward})),r=e.wires.map(u=>({id:u.id,from:{end:u.from},to:{end:u.to},gaugeAwg:u.gaugeAwg??null})),n=e.level?t(e.level):Iw,i=n?(e.nodes??[]).map(u=>({...u,positionMm:_w(n,u.positionMm)})):[],o=df(s,r,of(i)),c=cf(o,i),l=new Map(o.segments.map(u=>[u.id,u])),f=sf(a,o,c.waypoints,c.pinned).map(u=>{let p=l.get(u.segmentId);return{...u,from:p.from,to:p.to,wires:[...p.wires],diameterMm:p.diameterMm,assumedGauge:p.assumedGauge}});return{ends:a,tree:o,curves:f,unused:c.unused,unplaced:o.unplaced,wires:e.wires.map(u=>({id:u.id,from:u.from,to:u.to}))}}function ff(e,t,a=[]){let s=[],r=[];for(let n of e){let i=uf(n,t);if(!i)continue;r.push(...ef(n,i));let o=new Map;for(let c of a.length?qu(i,a):[])o.set(c.segmentId,[...o.get(c.segmentId)??[],c.board]);for(let c of i.curves)c.diameterMm<=0||s.push({harness:`${n.level||""}/${n.id}`,segmentId:c.segmentId,from:c.from,to:c.to,samplesMm:c.samplesMm.flat(),radiusMm:c.diameterMm/2,wires:c.wires,tightBend:c.tightBend!==null,assumedGauge:c.assumedGauge,collides:o.get(c.segmentId)??[]})}return{tubes:s,housings:r}}var $r=Object.freeze({restricted:{color:[.55,.57,.6,1],label:"Restricted"},loading:{color:[.7,.76,.82,1],label:"Loading\u2026"},building:{color:[.62,.72,.84,1],label:"Building 3D view\u2026"},missing:{color:[.78,.76,.7,1],label:"No 3D view"},failed:{color:[.86,.6,.56,1],label:"3D view failed"},unknown:{color:[.78,.76,.7,1],label:""}}),hf=Object.freeze([.001,0,0,0,0,.001,0,0,0,0,.001,0,0,0,0,1]);function ps(e,t){let a=new Array(16);for(let s=0;s<4;s+=1)for(let r=0;r<4;r+=1)a[s*4+r]=e[r]*t[s*4]+e[4+r]*t[s*4+1]+e[8+r]*t[s*4+2]+e[12+r]*t[s*4+3];return a}function Rw([e,t,a]){return[1,0,0,0,0,1,0,0,0,0,1,0,e,t,a,1]}function Nw([e,t,a]){return[e,0,0,0,0,t,0,0,0,0,a,0,0,0,0,1]}function Yr(e,t){return ps(hf,ps(e,t))}function gs(e,t){let a=t.minMm,s=t.maxMm.map((r,n)=>Math.max(r-a[n],.2));return ps(hf,ps(e,ps(Rw(a),Nw(s))))}function bf(e,t,a){return e.restricted?"restricted":!e.assetId||!t?"missing":a==="loaded"?null:a==="failed"?"failed":t.status==="ready"?t.bundleUrl&&t.bundleToBoard?"loading":"building":$r[t.status]?t.status:"unknown"}function no(e){return!!(e&&e.status==="ready"&&e.bundleUrl&&e.bundleToBoard)}function pf(e,t){return!e||e.bundleUrl!==t.bundleUrl||e.loadState==="failed"?"create":e.loadState==="waiting"&&no(t)?"load":"keep"}function gf(e){return(e?.occurrences||[]).filter(t=>t.kind==="board"||t.restricted||t.model||t.box)}function mf(e){return`box:${e.map(t=>Number(t).toFixed(3)).join(",")}`}function yf(e){if(!e.length)return!1;let t=0;for(let a of e)if(!a.standIn)t+=1;else if(a.standIn==="loading")return!1;return t>0}function wf(e,t,a=0){return[e/1e3,-t/1e3,a]}function Cw({rotation:e=0,mirror:t=!1,tilt:a=0}){let s=t?[-1,0,0]:[1,0,0],r=[0,1,0],n=t?[0,0,-1]:[0,0,1],i=Math.cos(e),o=Math.sin(e),c=s.map((h,d)=>i*h+o*r[d]),l=r.map((h,d)=>-o*s[d]+i*h),f=Math.cos(a),u=Math.sin(a),p=n.map((h,d)=>f*h-u*l[d]),b=l.map((h,d)=>u*n[d]+f*h);return{right:c,up:b,back:p}}function oo(e,t,a,s,r=0){let{up:n,back:i}=Cw(e),o=wf(e.center[0],e.center[1],r),c=s*3,l=o.map((p,b)=>p+i[b]*c),f=1/(e.zoom*1e3),u=Ys(t*f,a*f,-s*40,s*40);return aa(u,$s(l,o,n))}function Bw(e,t,a,s){let[r,n,i]=s,o=e[0]*r+e[4]*n+e[8]*i+e[12],c=e[1]*r+e[5]*n+e[9]*i+e[13],l=e[3]*r+e[7]*n+e[11]*i+e[15];return l>0?[(o/l+1)/2*t,(1-c/l)/2*a]:null}function ms(e){let t=e[0]*1e3,a=e[3]*1e3,s=-e[4]*1e3,r=-e[1]*1e3;return{box:{x:t,y:s,w:a-t,h:r-s},bottom:e[2]+e[5]<0}}function co(e,t){return e?t?e[2]:e[5]:0}function vf(e,t,a,s,r){let n=_t(e),i=oo(t,a,s,n,t.focusZ??0);return Bw(i,a,s,wf(r[0],r[1],t.focusZ??0))}var Fw=([e,t,a,s])=>({x:Math.min(e,a),y:Math.min(t,s),w:Math.abs(a-e),h:Math.abs(s-t)}),io=e=>[e.x+e.w/2,e.y+e.h/2],xf=new WeakMap;function Ow(e,t){let a=xf.get(e);if(a)return a;let s=new Map,r=new Map;for(let c of e.features.values()){if(c.sourceUid&&s.set(String(c.sourceUid),c),c.kind!=="pad")continue;let l=/^(.*):pad:\d+:(.+)$/.exec(String(c.sourceUid||""));if(!l)continue;let f=`${l[1]}\0${l[2]}`;r.has(f)||r.set(f,[]),r.get(f).push(c)}let n=new Map;for(let c of t?.physical_objects||[])c.kind==="footprint_body"&&c.designator&&c.bbox_mm?.length===4&&n.set(c.designator,c);let i=new Map((t?.physical_objects||[]).map(c=>[c.uid,c])),o={bySource:s,padsByFootprintPin:r,bodies:n,objects:i};return xf.set(e,o),o}function Mf({scene:e,topology:t},a,s){let r=String(a),n=e.componentFeatures.get(r);if(!n)return null;let i=Ow(e,t),o=e.features.get(Number(n.featureId)),c=i.bodies.get(r),l=o?.bounds?ms(o.bounds).box:c?Fw(c.bbox_mm.map(Number)):null,f=o?.bounds?ms(o.bounds).bottom:String(c?.layer||"").startsWith("B."),u=null;if(s!=null&&s!==""){let b=(t?.terminals||[]).find(d=>d.designator===r&&String(d.pin)===String(s)),h=b?.pcb_pad_id?i.objects.get(b.pcb_pad_id):null;if(u=h?.source_ids?.[0]&&i.bySource.get(String(h.source_ids[0]))||null,!u){let d=i.padsByFootprintPin.get(`${n.footprint}\0${s}`)||[],x=l?io(l):null,g=1/0;for(let y of d){let m=io(ms(y.bounds).box),v=x?Math.hypot(m[0]-x[0],m[1]-x[1]):0;v<g&&([g,u]=[v,y])}}}let p=u?.bounds?ms(u.bounds).box:null;return!l&&p&&(l=p,f=ms(u.bounds).bottom),l?{reference:r,pin:u?String(s):null,focus:l,anchor:io(p||l),anchorBox:p,bottom:f,surfaceZ:co(e.runtimeBounds,f)}:null}var Jr=class{#e=new Map;constructor(t=3e3){this.ttlMs=t}get size(){return this.#e.size}record(t,a,s){this.#e.set(t,{matrix:a,at:s})}release(t){this.#e.delete(t)}clear(){this.#e.clear()}active(t){let a=[];for(let[s,r]of this.#e)t-r.at>this.ttlMs?this.#e.delete(s):a.push(r.matrix);return a}};var tn=1.5*1024*1024*1024;function lo(e){let t=Number(e);return Number.isFinite(t)&&t>0?t:tn}function kf(e,t){if(t.netName||t.netUid){let a=t.netUid&&e.find(s=>s.uid===t.netUid)||t.netName&&sa(e,t.netName);return a?{kind:"net",id:Number(a.id)}:{kind:"unresolved"}}return t.netId?{kind:"net",id:Number(t.netId)}:t.featureId?{kind:"feature",id:Number(t.featureId)}:t.reference?{kind:"component",reference:String(t.reference)}:{kind:"board"}}function Ef(e,t){if(t.kind==="net")e.selectNet(t.id,!0);else if(t.kind==="feature")e.selectFeature(t.id,!0);else if(t.kind==="component")e.selectComponent(t.reference,!0);else return!1;return!0}function Sf(e,t){return t&&!e?"enter":!t&&e?"leave":null}function Pw(e){return(Array.isArray(e)?e:[]).map((t,a)=>{let s=Lc(t?.color??ti[a%ti.length]);return{key:String(t?.key??a),mark:s,color:`#${(s&16777215).toString(16).padStart(6,"0")}`,members:(Array.isArray(t?.members)?t.members:[]).filter(r=>r&&typeof r.occurrence=="string"&&typeof r.net=="string"),wires:(Array.isArray(t?.wires)?t.wires:[]).filter(r=>r&&typeof r.harness=="string"&&typeof r.wire=="string")}})}function uo(){return{selection:null,gpuBudget:null}}var jw=Object.freeze(["setSelection","resize","getViewState","setLayerVisible","applyLayerPreset","setShowBoard","setShowComponents","setShowPlaceholders","setRealisticColors","setBoardLayerVisible","setSeparation","showNetLayers","setNetIsolation","setStatsOverlay","getStats","setLodOverride","setGpuBudget","pickAt","projectComponent","projectPoint"]),Qr=class{#e=null;constructor(t=uo()){this.shared=t}get port(){return this.#e}attach(t){if(!t)throw new TypeError("A mode controller attaches to a mounted scene port");this.detach(),this.#e=t,this.replay(t)}detach(){let t=this.#e;this.#e=null,this.release(),t?.dispose?.()}replay(){}release(){}setSelection(t){this.shared.selection=t||null;let a=this.#e;a&&a.quietly(()=>this.applySelection(a,this.shared.selection))}setGpuBudget(t){this.shared.gpuBudget=t,this.#e?.setGpuBudget(lo(t))}resize(){this.#e?.resize()}getViewState(){return this.#e?.getViewState()??null}setLayerVisible(t,a,s=null){this.#e?.setLayerVisible(t,a,s)}applyLayerPreset(t,a=null){this.#e?.applyLayerPreset(t,a)}setShowBoard(t){this.#e?.setShowBoard(t)}setShowComponents(t){this.#e?.setShowComponents(t)}setShowPlaceholders(t){this.#e?.setShowPlaceholders(t)}setRealisticColors(t){this.#e?.setRealisticColors(t)}setBoardLayerVisible(t,a,s){this.#e?.setBoardLayerVisible(t,a,s)}setSeparation(t,a=null){this.#e?.setSeparation(t,a)}showNetLayers(){this.#e?.showNetLayers()}setNetIsolation(t){this.#e?.setNetIsolation(t)}setStatsOverlay(t){this.#e?.setStatsOverlay(t)}getStats(){return this.#e?.stats()??null}setLodOverride(t){this.#e?.setLodOverride(t)}pickAt(t,a){return Promise.resolve(this.#e?.pickAt(t,a)??null)}projectComponent(t,a){return this.#e?.projectComponent(t,a)??null}projectPoint(t,a){return this.#e?.projectPoint(t,a)??null}},Lw=Object.freeze(["setHighlightedNets","setHiddenComponents","getComponentReferences","setViewMode","renderInset","insetReady","insetSurfaceZ","releaseInset","insetTarget","projectInset","onSceneChange","insetStats","insetSettings","gpuIdle","loadAnalyticPack","setAnalyticOverlay","setAnalyticVectors","setAnalyticStyle","analyticColormaps","setClickSelect","analyticProbe","analyticAt","analyticStats","unloadAnalyticPack"]),Zr=class extends Qr{#e=[];#a=null;#s="pcb";#r=new Set;#n=null;#t=null;#i=!0;attach(t,{workspace:a="pcb"}={}){this.#s=a,super.attach(t)}replay(t){this.#n=t.onSceneChange?.(()=>this.#c())??null,this.#c(),t.setWorkspace(this.#s),this.#a&&t.setHiddenComponents(this.#a),this.shared.gpuBudget!=null&&t.setGpuBudget(lo(this.shared.gpuBudget)),this.shared.selection&&t.quietly(()=>this.applySelection(t,this.shared.selection)),this.#e.length&&this.#o(t,this.#e),this.#t&&this.#l(t,this.#t),this.#i||t.setClickSelect(!1)}async#l(t,a){await t.loadAnalyticPack(a.bytes,a.options),a.overlay&&t.setAnalyticOverlay(a.overlay),a.style&&t.setAnalyticStyle(a.style),a.vectors&&t.setAnalyticVectors(a.vectors)}release(){this.#n?.(),this.#n=null}applySelection(t,a){a?.occurrence!=null&&t.selectOccurrence(a.occurrence),a?Ef(t,kf(t.nets(),a)):t.clearSelection()}setWorkspace(t){this.#s=t,this.port?.setWorkspace(t)}setHighlightedNets(t){this.#e=Array.isArray(t)?[...t]:[];let a=this.port;a&&this.#o(a,this.#e)}#o(t,a){let s=Pc(t.nets(),a),r=t.anyEmphasis();t.setHighlightedNetIds(s);let n=t.anyEmphasis(),i=Sf(r,n);i==="enter"?t.showNetProbe():i==="leave"&&t.restoreVisibility(),t.isolating()&&n&&t.isolateLitNets(),t.refreshResidency()}setHiddenComponents(t){this.#a=Array.isArray(t)?[...t]:[],this.port?.setHiddenComponents(this.#a)}getComponentReferences(){return this.port?.getComponentReferences()??[]}setViewMode(t){this.port?.setViewMode(t)}renderInset(t,a,s){return!!this.port?.renderInset(t,a,s)}insetReady(){return!!this.port?.insetReady()}insetSurfaceZ(t){let a=this.port;return a?co(a.insetBoard().scene.runtimeBounds,!!t):0}releaseInset(t){this.port?.releaseInset(String(t))}insetTarget(t,a){let s=this.port;return s?Mf(s.insetBoard(),t,a):null}projectInset(t,a,s,r){let n=this.port;return n?vf(n.insetBoard().scene.runtimeBounds,t,a,s,r):null}onSceneChange(t){return this.#r.add(t),()=>this.#r.delete(t)}#c(){for(let t of this.#r)t()}insetStats(){return this.port?.insetStats()??null}insetSettings(t){return this.port?.insetSettings(t)??null}gpuIdle(){return this.port?.gpuIdle()??Promise.resolve()}async loadAnalyticPack(t,a={}){let s=t instanceof Uint8Array?t:new Uint8Array(t);return this.#t={bytes:s,options:a,overlay:null,vectors:null,style:this.#t?.style??null},this.port?this.port.loadAnalyticPack(s,a):null}setAnalyticOverlay(t){return this.#t&&(this.#t.overlay=t),this.port?.setAnalyticOverlay(t)??null}setAnalyticVectors(t){return this.#t&&(this.#t.vectors=t),this.port?.setAnalyticVectors(t)??null}setAnalyticStyle(t){return this.#t&&(this.#t.style={...this.#t.style||{},...t}),this.port?.setAnalyticStyle(t)??null}analyticColormaps(){return this.port?.analyticColormaps()??null}setClickSelect(t){this.#i=t!==!1,this.port?.setClickSelect(this.#i)}analyticProbe(t,a){return this.port?.analyticProbe(t,a)??null}analyticAt(t,a){return this.port?.analyticAt(t,a)??Promise.resolve(null)}analyticStats(){return this.port?.analyticStats()??null}unloadAnalyticPack(){this.#t=null,this.port?.unloadAnalyticPack()}},Dw=Object.freeze(["setSystemScene","setNetEmphasis","frameNetEmphasis","frameAll","frameBoard","frameParts","setMoveMode","setRouteMode","setMoveSpace","previewPose","cancelMove","getMoveState","targetHarnessNode","selectHarness","previewHarnessNode","cancelHarnessNode","getHarnessState","setLabelsVisible","setHarnessesVisible","setHelpVisible","isHelpVisible","setLodThresholds","pickSurfaceAt","focusMoveTarget","viewAxis"]),en=class extends Qr{#e=null;#a=null;#s=null;#r=!1;attach(t,{moveAllowed:a=!1}={}){this.#r=!!a,super.attach(t)}replay(t){this.shared.gpuBudget!=null&&t.setGpuBudget(lo(this.shared.gpuBudget)),this.#e&&t.setSystemScene(this.#e),this.#a&&this.#n(t,this.#a),t.setMoveAllowed(this.#r),this.#s!=null&&t.setLabelsVisible(this.#s)}applySelection(t,a){if(!a){t.clearSelection();return}if(t.focusPlacement(a.occurrence)!=="board")return;let s=kf(t.nets(),a);s.kind==="board"?t.selectBoardContext():Ef(t,s)}setSystemScene(t){this.#e=t||null,t&&this.port?.setSystemScene(t)}setNetEmphasis(t){this.#a=Array.isArray(t)?t:[];let a=this.port;return a?this.#n(a,this.#a):[]}#n(t,a){let s=t.anyEmphasis(),r=t.setEmphasisSets(Pw(a));if(!r)return[];let n=t.anyEmphasis(),i=Sf(s,n);return i==="enter"?t.showNetProbe():i==="leave"&&(t.isolating()&&t.setNetIsolation(!1),t.restoreVisibility()),t.isolating()&&n&&t.isolateLitNets(),r}frameNetEmphasis(t=null,a=null){return this.port?.frameNetEmphasis(t,a)??!1}frameAll(){this.port?.frameAll()}frameBoard(t){return this.port?.frameBoard(t)??!1}frameParts(t){return this.port?.frameParts(t)??!1}setMoveAllowed(t){this.#r=!!t,this.port?.setMoveAllowed(this.#r)}setMoveMode(t,a){this.port?.setMoveMode(t,a)}setRouteMode(t){this.port?.setMoveMode(t,{route:!0})}setMoveSpace(t){this.port?.setMoveSpace(t)}previewPose(t){this.port?.previewPose(t)}cancelMove(){this.port?.cancelMove()}getMoveState(){return this.port?.getMoveState()??null}targetHarnessNode(t){this.port?.targetHarnessNode(t)}selectHarness(t){return this.port?.selectHarness(t)??!1}previewHarnessNode(t){this.port?.previewHarnessNode(t)}cancelHarnessNode(){this.port?.cancelHarnessNode()}getHarnessState(){return this.port?.getHarnessState()??null}setLabelsVisible(t){this.#s=!!t,this.port?.setLabelsVisible(this.#s)}setHarnessesVisible(t){this.port?.setHarnessesVisible(!!t)}setHelpVisible(t){this.port?.setHelpVisible(t)}isHelpVisible(){return!!this.port?.isHelpVisible()}setLodThresholds(t){return this.port?.setLodThresholds(t)??null}pickSurfaceAt(t,a){return this.port?.pickSurfaceAt(t,a)??null}focusMoveTarget(t){return!!this.port?.focusMoveTarget(t)}viewAxis(t,a=!1){this.port?.viewAxis(t,a)}};function Tf(e){let t=(a,s)=>{for(let r of a)Object.defineProperty(e,r,{configurable:!0,writable:!0,value(...n){return s(this)[r](...n)}})};t(jw,a=>a.activeMode),t(Lw,a=>a.modes.board),t(Dw,a=>a.modes.system)}var ho=Object.freeze({viridis:["#440154","#482878","#3e4989","#31688e","#26828e","#1f9e89","#35b779","#6ece58","#b5de2b","#fde725"],inferno:["#000004","#1b0c41","#4a0c6b","#781c6d","#a52c60","#cf4446","#ed6925","#fb9b06","#f7d13d","#fcffa4"],magma:["#000004","#180f3d","#440f76","#721f81","#9e2f7f","#cd4071","#f1605d","#fd9668","#feca8d","#fcfdbf"],plasma:["#0d0887","#46039f","#7201a8","#9c179e","#bd3786","#d8576b","#ed7953","#fb9f3a","#fdca26","#f0f921"],cividis:["#00224e","#123570","#3b496c","#575d6d","#707173","#8a8678","#a59c74","#c3b369","#e1cc55","#fee838"],turbo:["#30123b","#4662d7","#36aaf9","#1ae4b6","#72fe5e","#c8ef34","#faba39","#f66b19","#ca2a04","#7a0403"],coolwarm:["#3b4cc0","#6788ee","#9abbff","#c9d7f0","#edd1c2","#f7a889","#e26952","#b40426"],ember:["#e0e3ed","#ff9e1f","#db141a"],ice:["#f4f7fb","#9ecae1","#2171b5","#08306b"],white:["#fafaf5","#fafaf5"],greys:["#f7f7f7","#bdbdbd","#737373","#252525"]}),Ra=256,ys=Object.freeze({fieldColormap:"viridis",arrowColormap:"ember",arrowDensity:70,arrowWidth:.07,arrowMinLength:.3,arrowOutline:[.05,.05,.07,.85]});function Af(e){let t=String(e).replace(/^#/,"");if(!/^[0-9a-fA-F]{6}$/.test(t))throw new TypeError(`colour ${e} is not #rrggbb`);return[0,2,4].map(a=>Number.parseInt(t.slice(a,a+2),16)/255)}function fo(e){if(Array.isArray(e)){if(e.length<2)throw new TypeError("a colormap needs two or more stops");return e.forEach(Af),[...e]}let t=ho[e];if(!t)throw new TypeError(`unknown colormap ${e}`);return[...t]}function bo(e,t=Ra){let a=fo(e).map(Af),s=new Float32Array(t*4);for(let r=0;r<t;r++){let n=r/(t-1)*(a.length-1),i=Math.min(a.length-2,Math.floor(n)),o=n-i;for(let c=0;c<3;c++)s[r*4+c]=a[i][c]*(1-o)+a[i+1][c]*o;s[r*4+3]=1}return s}function po(e={},t=ys){let a={...t,...e||{}};fo(a.fieldColormap),fo(a.arrowColormap);let s=(r,n)=>{if(!(Number(a[r])>0&&Number(a[r])<=n))throw new RangeError(`${r} must be in (0, ${n}]`);a[r]=Number(a[r])};if(s("arrowDensity",400),s("arrowWidth",.5),s("arrowMinLength",1),!Array.isArray(a.arrowOutline)||a.arrowOutline.length!==4)throw new TypeError("arrowOutline is [r, g, b, a]");return a}var Na=class{__destroy_into_raw(){let t=this.__wbg_ptr;return this.__wbg_ptr=0,If.unregister(this),t}free(){let t=this.__destroy_into_raw();z.__wbg_analyticpack_free(t,0)}barrelRecords(){let t=z.analyticpack_barrelRecords(this.__wbg_ptr);return Es.__wrap(t)}bindingJson(t){let a,s;try{let i=z.analyticpack_bindingJson(this.__wbg_ptr,t);var r=i[0],n=i[1];if(i[3])throw r=0,n=0,an(i[2]);return a=r,s=n,Ts(r,n)}finally{z.__wbindgen_free(a,s,1)}}headerJson(){let t,a;try{let n=z.analyticpack_headerJson(this.__wbg_ptr);var s=n[0],r=n[1];if(n[3])throw s=0,r=0,an(n[2]);return t=s,a=r,Ts(s,r)}finally{z.__wbindgen_free(t,a,1)}}lowerSlice(t,a){let s=Vw(t,z.__wbindgen_malloc,z.__wbindgen_realloc),r=As,n=z.analyticpack_lowerSlice(this.__wbg_ptr,s,r,a);if(n[2])throw an(n[1]);return Ss.__wrap(n[0])}constructor(t){let a=Kw(t,z.__wbindgen_malloc),s=As,r=z.analyticpack_new(a,s);if(r[2])throw an(r[1]);return this.__wbg_ptr=r[0],If.register(this,this.__wbg_ptr,this),this}};Symbol.dispose&&(Na.prototype[Symbol.dispose]=Na.prototype.free);var Es=class e{static __wrap(t){let a=Object.create(e.prototype);return a.__wbg_ptr=t,_f.register(a,a.__wbg_ptr,a),a}__destroy_into_raw(){let t=this.__wbg_ptr;return this.__wbg_ptr=0,_f.unregister(this),t}free(){let t=this.__destroy_into_raw();z.__wbg_barrelrecords_free(t,0)}floats(){let t=z.barrelrecords_floats(this.__wbg_ptr);var a=sn(t[0],t[1]).slice();return z.__wbindgen_free(t[0],t[1]*4,4),a}skipped(){return z.barrelrecords_skipped(this.__wbg_ptr)>>>0}words(){let t=z.barrelrecords_words(this.__wbg_ptr);var a=kt(t[0],t[1]).slice();return z.__wbindgen_free(t[0],t[1]*4,4),a}};Symbol.dispose&&(Es.prototype[Symbol.dispose]=Es.prototype.free);var Ss=class e{static __wrap(t){let a=Object.create(e.prototype);return a.__wbg_ptr=t,Rf.register(a,a.__wbg_ptr,a),a}__destroy_into_raw(){let t=this.__wbg_ptr;return this.__wbg_ptr=0,Rf.unregister(this),t}free(){let t=this.__destroy_into_raw();z.__wbg_loweredslicerecords_free(t,0)}batches(){let t=z.loweredslicerecords_batches(this.__wbg_ptr);var a=kt(t[0],t[1]).slice();return z.__wbindgen_free(t[0],t[1]*4,4),a}contourEdgeOperations(){let t=z.loweredslicerecords_contourEdgeOperations(this.__wbg_ptr);var a=kt(t[0],t[1]).slice();return z.__wbindgen_free(t[0],t[1]*4,4),a}contourEdges(){let t=z.loweredslicerecords_contourEdges(this.__wbg_ptr);var a=sn(t[0],t[1]).slice();return z.__wbindgen_free(t[0],t[1]*4,4),a}covers(){let t=z.loweredslicerecords_covers(this.__wbg_ptr);var a=kt(t[0],t[1]).slice();return z.__wbindgen_free(t[0],t[1]*4,4),a}cutIndices(){let t=z.loweredslicerecords_cutIndices(this.__wbg_ptr);var a=kt(t[0],t[1]).slice();return z.__wbindgen_free(t[0],t[1]*4,4),a}edgeCuts(){let t=z.loweredslicerecords_edgeCuts(this.__wbg_ptr);var a=kt(t[0],t[1]).slice();return z.__wbindgen_free(t[0],t[1]*4,4),a}fanVertices(){let t=z.loweredslicerecords_fanVertices(this.__wbg_ptr);var a=sn(t[0],t[1]).slice();return z.__wbindgen_free(t[0],t[1]*4,4),a}outlineEdges(){let t=z.loweredslicerecords_outlineEdges(this.__wbg_ptr);var a=sn(t[0],t[1]).slice();return z.__wbindgen_free(t[0],t[1]*4,4),a}outlineShapes(){let t=z.loweredslicerecords_outlineShapes(this.__wbg_ptr);var a=kt(t[0],t[1]).slice();return z.__wbindgen_free(t[0],t[1]*4,4),a}shapeCuts(){let t=z.loweredslicerecords_shapeCuts(this.__wbg_ptr);var a=kt(t[0],t[1]).slice();return z.__wbindgen_free(t[0],t[1]*4,4),a}shapes(){let t=z.loweredslicerecords_shapes(this.__wbg_ptr);var a=kt(t[0],t[1]).slice();return z.__wbindgen_free(t[0],t[1]*4,4),a}statsJson(){let t,a;try{let s=z.loweredslicerecords_statsJson(this.__wbg_ptr);return t=s[0],a=s[1],Ts(s[0],s[1])}finally{z.__wbindgen_free(t,a,1)}}subtractShapes(){return z.loweredslicerecords_subtractShapes(this.__wbg_ptr)>>>0}};Symbol.dispose&&(Ss.prototype[Symbol.dispose]=Ss.prototype.free);function Uw(){return{__proto__:null,"./kicad_monkey_analytic_bg.js":{__proto__:null,__wbg___wbindgen_throw_bb96b2010945f0bc:function(t,a){throw new Error(Ts(t,a))},__wbindgen_cast_0000000000000001:function(t,a){return Ts(t,a)},__wbindgen_init_externref_table:function(){let t=z.__wbindgen_externrefs,a=t.grow(4);t.set(0,void 0),t.set(a+0,void 0),t.set(a+1,null),t.set(a+2,!0),t.set(a+3,!1)}}}}var If=typeof FinalizationRegistry>"u"?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(e=>z.__wbg_analyticpack_free(e,1)),_f=typeof FinalizationRegistry>"u"?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(e=>z.__wbg_barrelrecords_free(e,1)),Rf=typeof FinalizationRegistry>"u"?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(e=>z.__wbg_loweredslicerecords_free(e,1));function sn(e,t){return e=e>>>0,zw().subarray(e/4,e/4+t)}function kt(e,t){return e=e>>>0,Gw().subarray(e/4,e/4+t)}var xs=null;function zw(){return(xs===null||xs.byteLength===0)&&(xs=new Float32Array(z.memory.buffer)),xs}function Ts(e,t){return qw(e>>>0,t)}var ws=null;function Gw(){return(ws===null||ws.byteLength===0)&&(ws=new Uint32Array(z.memory.buffer)),ws}var vs=null;function Ms(){return(vs===null||vs.byteLength===0)&&(vs=new Uint8Array(z.memory.buffer)),vs}function Kw(e,t){let a=t(e.length*1,1)>>>0;return Ms().set(e,a/1),As=e.length,a}function Vw(e,t,a){if(a===void 0){let o=ks.encode(e),c=t(o.length,1)>>>0;return Ms().subarray(c,c+o.length).set(o),As=o.length,c}let s=e.length,r=t(s,1)>>>0,n=Ms(),i=0;for(;i<s;i++){let o=e.charCodeAt(i);if(o>127)break;n[r+i]=o}if(i!==s){i!==0&&(e=e.slice(i)),r=a(r,s,s=i+e.length*3,1)>>>0;let o=Ms().subarray(r+i,r+s),c=ks.encodeInto(e,o);i+=c.written,r=a(r,s,i,1)>>>0}return As=i,r}function an(e){let t=z.__wbindgen_externrefs.get(e);return z.__externref_table_dealloc(e),t}var rn=new TextDecoder("utf-8",{ignoreBOM:!0,fatal:!0});rn.decode();var Hw=2146435072,go=0;function qw(e,t){return go+=t,go>=Hw&&(rn=new TextDecoder("utf-8",{ignoreBOM:!0,fatal:!0}),rn.decode(),go=t),rn.decode(Ms().subarray(e,e+t))}var ks=new TextEncoder;"encodeInto"in ks||(ks.encodeInto=function(e,t){let a=ks.encode(e);return t.set(a),{read:e.length,written:a.length}});var As=0,Ww,Xw,z;function $w(e,t){return Xw=e,z=e.exports,Ww=t,xs=null,ws=null,vs=null,z.__wbindgen_start(),z}async function Yw(e,t){if(typeof Response=="function"&&e instanceof Response){if(typeof WebAssembly.instantiateStreaming=="function")try{return await WebAssembly.instantiateStreaming(e,t)}catch(r){if(e.ok&&a(e.type)&&e.headers.get("Content-Type")!=="application/wasm")console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n",r);else throw r}let s=await e.arrayBuffer();return await WebAssembly.instantiate(s,t)}else{let s=await WebAssembly.instantiate(e,t);return s instanceof WebAssembly.Instance?{instance:s,module:e}:s}function a(s){switch(s){case"basic":case"cors":case"default":return!0}return!1}}async function Nf(e){if(z!==void 0)return z;e!==void 0&&(Object.getPrototypeOf(e)===Object.prototype?{module_or_path:e}=e:console.warn("using deprecated parameters for the initialization function; pass a single object instead")),e===void 0&&(e=new URL("kicad_monkey_analytic_bg.wasm",import.meta.url));let t=Uw();(typeof e=="string"||typeof Request=="function"&&e instanceof Request||typeof URL=="function"&&e instanceof URL)&&(e=fetch(e));let{instance:a,module:s}=await Yw(await e,t);return $w(a,s)}var Cf={schema:"prism.vendored_wasm.a0",purpose:"Reads kicad_monkey.materialization.a0 packs in the browser and lowers their slices for the analytic renderer.",source:{repository:"https://github.com/krishna-swaroop/kicad_monkey.git",revision:"b6316117901b344114385242b0ad13be45dfefae",crate:"kicad-monkey-wasm",license:"MIT"},build:{target:"wasm32-unknown-unknown",profile:"release",features:["materialization"],wasm_bindgen:"0.2.126",rustc:"rustc 1.98.0 (88d9e12ae 2026-08-18)",command:"node scripts/build-analytic-wasm.mjs --monkey <kicad_monkey checkout at revision>"},files:{"kicad_monkey_analytic.js":"f4093245af543a7a87cf6ce6aa3d7ce4feb82d17912a35c4171c59b8104dfb9d","kicad_monkey_analytic_bg.wasm":"c48e1f23b0522ed18342f374bdc59db070d4424a95adf0e803d717256d9cfd72"}};var Bf="kicad-monkey-analytic.wasm",Qw="kicad_monkey.materialization.a0",Zw=1e3,mo=null;function ev(){let e=String(Cf.files?.["kicad_monkey_analytic_bg.wasm"]||"").slice(0,16);try{return new URL(`${Bf}?v=${e}`,import.meta.url)}catch{return`/${Bf}?v=${e}`}}function tv(e=ev()){return mo??=Nf({module_or_path:e}).catch(t=>{throw mo=null,t}),mo}async function jf(e,{wasm:t}={}){await tv(t);let a=new Na(e instanceof Uint8Array?e:new Uint8Array(e)),s=JSON.parse(a.headerJson());if(s.schema!==Qw)throw new Error(`unsupported materialization schema ${s.schema}`);return{header:s,lowerSlice(r,n=Zw){let i=a.lowerSlice(r,n);try{return{shapes:new Uint32Array(i.shapes()),subtractShapes:i.subtractShapes(),fanVertices:new Float32Array(i.fanVertices()),covers:new Uint32Array(i.covers()),batches:new Uint32Array(i.batches()),contourEdges:new Float32Array(i.contourEdges()),contourEdgeOperations:new Uint32Array(i.contourEdgeOperations()),shapeCuts:new Uint32Array(i.shapeCuts()),edgeCuts:new Uint32Array(i.edgeCuts()),cutIndices:new Uint32Array(i.cutIndices()),outlineEdges:new Float32Array(i.outlineEdges()),outlineShapes:new Uint32Array(i.outlineShapes()),stats:JSON.parse(i.statsJson())}}finally{i.free()}},barrels(){let r=a.barrelRecords();try{return{floats:new Float32Array(r.floats()),words:new Uint32Array(r.words()),skipped:r.skipped()}}finally{r.free()}},binding(r){return JSON.parse(a.bindingJson(r))},free(){a.free()}}}function vo(e){return(e.chunks||[]).reduce((t,a)=>t+Number(a.operation_count||0),0)}function av(e,t){let a=null;for(let s of e.chunks||[]){if(s.slice_key!==t)continue;let r=s.bounds,n=[r.min_x_nm,r.min_y_nm,r.max_x_nm,r.max_y_nm].map(i=>i/1e6);a=a?[Math.min(a[0],n[0]),Math.min(a[1],n[1]),Math.max(a[2],n[2]),Math.max(a[3],n[3])]:n}return a}var sv={conductor:"copper",solder_mask:"mask",silkscreen:"silk",paste:"paste",dielectric:"dielectric"},Lf=1e-6,Df=2e-6,Ff=1e-7,Of={"fr4 natural":[109,116,75],"ptfe natural":[252,252,250],polyimide:[205,130,0],"phenolic natural":[92,17,6],aluminum:[213,213,213]};function rv(e){let t=String(e||"").trim(),a=/^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(t);return[...(a?[0,2,4].map(r=>parseInt(a[1].slice(r,r+2),16)):Of[t.toLowerCase()]||Of["fr4 natural"]).map(r=>r/255),1]}function Uf(e,t,a=0){let s=new Map((t||[]).map(d=>[String(d.name),d])),r=[...e.stack?.slices||[]].sort((d,x)=>d.order-x.order),n=r.filter(d=>d.role==="conductor"),i=d=>Number(s.get(String(d?.kicad_layer||""))?.id||0),o=i(n[0]),c=i(n[n.length-1]),l=[],f=[];for(let d of r){let x=sv[d.role],g=s.get(String(d.kicad_layer||"")),y=av(e,d.key);if(!x||!g||!y){x&&f.push(d.key);continue}let m=Number(g.z_mm||0)/1e3+a,v=(Number(g.thickness_mm)||Number(d.thickness_nm||0)/1e6)/2e3,E=d.side==="back"||x!=="dielectric"&&x!=="copper"&&m<a,S={key:d.key,role:x,layerId:Number(g.id),side:d.side||null,bounds:y};if(x==="dielectric"){S.color=rv(g.color);let A=[...n].reverse().find(N=>N.order<d.order),T=n.find(N=>N.order>d.order),_=[i(A)||i(T),i(T)||i(A)],R={zTop:m+v,zBottom:m-v};l.push({...S,...R,face:"top",z:m+v-Ff,faceDown:!1,outer:!1,offsetLayers:_}),l.push({...S,...R,face:"bottom",z:m-v+Ff,faceDown:!0,outer:!1,offsetLayers:_})}else if(x==="copper"){let A=n.indexOf(d),T=A===n.length-1&&n.length>1,_=A===0||T,R={...S,bottom:T,outer:_,zTop:m+v,zBottom:m-v,offsetLayers:[Number(g.id),Number(g.id)]};l.push({...R,face:"top",z:m+v,faceDown:!1,mark:_&&!T,walls:!T}),l.push({...R,face:"bottom",z:m-v,faceDown:!0,mark:T,walls:T})}else{let A=x==="silk"?Df:x==="paste"?Lf:0,T=E?c:o;l.push({...S,z:E?m-v-A:m+v+A,faceDown:E,outer:!1,thickness:v*2,offsetLayers:[T,T]})}}nv(l);let u=l.filter(d=>d.role==="dielectric"),p=u.filter(d=>!d.faceDown).sort((d,x)=>x.z-d.z)[0],b=u.filter(d=>d.faceDown).sort((d,x)=>d.z-x.z)[0];for(let d of u)d.skin=d===p||d===b;let h={dielectric:0,copper:1,mask:2,paste:3,silk:4};return l.sort((d,x)=>h[d.role]-h[x.role]),{planned:l,unmatched:f}}function nv(e){for(let t of e){if(t.role!=="mask"&&t.role!=="silk"&&t.role!=="paste")continue;let a=e.find(c=>c.role==="copper"&&c.mark&&c.faceDown===t.faceDown);if(!a)continue;let s=t.faceDown?-1:1,r=t.faceDown?a.zTop:a.zBottom,n=t.faceDown?a.zBottom:a.zTop,o=e.find(c=>c.role==="mask"&&c.faceDown===t.faceDown)?.thickness||0;t.role==="mask"?(t.coat=o,t.zLow=r+s*o):t.role==="silk"?t.zLow=r+s*(o+Df):t.z=n+s*Lf}}function Mo(e,t){let a=new Float32Array(Math.max(1,t)).fill(Number.NaN);if(ArrayBuffer.isView(e)||Array.isArray(e))for(let s=0;s<Math.min(t,e.length);s+=1)a[s]=Number(e[s]);else for(let[s,r]of Object.entries(e||{})){let n=Number(s);Number.isInteger(n)&&n>=0&&n<t&&(a[n]=Number(r))}return a}function Ca(e){let t=1/0,a=-1/0;for(let s of e)Number.isFinite(s)&&(t=Math.min(t,s),a=Math.max(a,s));return Number.isFinite(t)?[t,a]:[0,1]}function on(e){let t=new Map,a=1e3;for(let s of e.slices||[]){if(!(s.nx>0&&s.ny>0)||s.values.length!==s.nx*s.ny)throw new Error(`grid field slice ${s.slice_key} has ${s.values.length} values for ${s.nx} x ${s.ny} cells`);t.set(s.slice_key,{originMm:[(e.origin_x_m+s.ix0*e.dx_m)*a,(e.origin_y_m+s.iy0*e.dy_m)*a],pitchMm:[e.dx_m*a,e.dy_m*a],width:s.nx,height:s.ny,values:s.values})}return t}function zf(e){let t=new Map;for(let s of e||[])t.has(s.slice_key)||t.set(s.slice_key,[]),t.get(s.slice_key).push(s);let a=new Map;for(let[s,r]of t){let n=Number(r[0].pitch_nm);if(!(n>0)||r.some(p=>Number(p.pitch_nm)!==n))throw new Error(`field tiles of ${s} must share one positive pitch`);let i=Math.min(...r.map(p=>p.origin_nm[0])),o=Math.min(...r.map(p=>p.origin_nm[1])),c=(p,b)=>{let h=(p-b)/n;if(!Number.isInteger(h))throw new Error(`field tile of ${s} is off its pitch grid`);return h},l=Math.max(...r.map(p=>c(p.origin_nm[0],i)+p.width)),f=Math.max(...r.map(p=>c(p.origin_nm[1],o)+p.height)),u=new Float32Array(l*f).fill(Number.NaN);for(let p of r){let b=c(p.origin_nm[0],i),h=c(p.origin_nm[1],o);for(let d=0;d<p.height;d+=1)u.set(p.values.subarray?p.values.subarray(d*p.width,(d+1)*p.width):p.values.slice(d*p.width,(d+1)*p.width),(h+d)*l+b)}a.set(s,{originMm:[i/1e6,o/1e6],pitchMm:n/1e6,width:l,height:f,values:u})}return a}var yo=8,nn=8,Pf=4294967295,iv=Object.freeze({unplated:2,tentedFront:4,tentedBack:8,coveredFront:16,coveredBack:32,pluggedFront:64,pluggedBack:128,filled:256,capped:512,castellated:1024}),xo=16;function ov(e,t,a){let s=null;for(let r=0;e&&r+3<e.length;r+=4){let n=[e[r],e[r+1]],i=[e[r+2],e[r+3]],o=[i[0]-n[0],i[1]-n[1]],c=o[0]*o[0]+o[1]*o[1];if(c<=0)continue;let l=Math.max(0,Math.min(1,((t[0]-n[0])*o[0]+(t[1]-n[1])*o[1])/c)),f=Math.hypot(t[0]-n[0]-l*o[0],t[1]-n[1]-l*o[1]);if(f>a||s&&f>=s.distance)continue;let u=Math.sqrt(c),p=[o[1]/u,o[0]/u];s={distance:f,normal:p,offset:(p[0]*n[0]-p[1]*n[1])/1e3}}return s&&{normal:s.normal,offset:s.offset}}function Gf(e,t,a,s=null){let r=(e.stack?.slices||[]).filter(b=>b.role==="conductor").sort((b,h)=>b.order-h.order),n=new Map((a||[]).filter(b=>b.role===void 0||b.role==="copper").map(b=>[b.key,b])),i=b=>{let h=n.get(b.key);if(!h)return null;if(h.zTop!==void 0)return{top:h.zTop,bottom:h.zBottom,layerId:h.layerId};let d=Number(b.thickness_nm||0)/1e9;return h.bottom?{top:h.z+d,bottom:h.z,layerId:h.layerId}:{top:h.z,bottom:h.z-d,layerId:h.layerId}},o=Math.floor(t.floats.length/yo),c=new ArrayBuffer(o*xo*4),l=new Float32Array(c),f=new Uint32Array(c),u=0,p=t.skipped||0;for(let b=0;b<o;b+=1){let h=t.floats.subarray(b*yo,(b+1)*yo),d=t.words.subarray(b*nn,(b+1)*nn),[x,g]=[Math.min(d[1],d[2]),Math.max(d[1],d[2])],y=r.filter(A=>A.order>=x&&A.order<=g&&(d[3]===Pf||A.order>d[3])&&(d[4]===Pf||A.order<d[4])),m=y.length?i(y[0]):null,v=y.length?i(y[y.length-1]):null;if(!m||!v){p+=1;continue}let E=u*xo;l.set([h[0]/1e3,-h[1]/1e3,h[2]/1e3,-h[3],h[4]/1e3,h[5]/1e3,m.top,v.bottom],E),f.set([d[0],m.layerId,v.layerId,d[5]],E+8);let S=d[5]&iv.castellated?ov(s,[h[0],h[1]],h[4]+h[2]):null;l.set(S?[S.normal[0],S.normal[1],S.offset,0]:[0,0,1,0],E+12),u+=1}return{data:c.slice(0,u*xo*4),count:u,skipped:p}}var wo=12,cv=0,lv=1;function Kf(e,t,a,s=0){let r=(a||[]).filter(b=>b.role==="soldermask").map(b=>Number(b.z_mm)/1e3+s+Math.sign(Number(b.z_mm))*Number(b.thickness_mm||0)/2e3),n=r.length?Math.max(...r):null,i=r.length?Math.min(...r):null,o=e.filter(b=>b.role==="dielectric"&&b.face==="top"&&t.get(b.key)?.contourEdges?.length),c=[],l=(b,h,d,x,g,y)=>{let m=t.get(b.key).contourEdges;for(let v=0;v+3<m.length;v+=4)c.push([m[v],m[v+1],m[v+2],m[v+3],h,d,x,g,y])};for(let b of o)l(b,b.zTop,b.zBottom,b.offsetLayers[0],b.offsetLayers[1],cv);for(let b of e.filter(h=>h.role==="copper"&&h.face==="top")){let h=v=>Math.min(Math.abs(v.zBottom-b.zTop),Math.abs(v.zTop-b.zBottom)),d=[...o].sort((v,E)=>h(v)-h(E))[0];if(!d)continue;let x=b.outer&&!b.bottom,g=b.outer&&b.bottom,y=x&&n!=null?Math.max(n,b.zTop):b.zTop,m=g&&i!=null?Math.min(i,b.zBottom):b.zBottom;l(d,y,m,b.layerId,b.layerId,lv)}let f=new ArrayBuffer(c.length*wo*4),u=new Float32Array(f),p=new Uint32Array(f);return c.forEach(([b,h,d,x,g,y,m,v,E],S)=>{u.set([b/1e3,-h/1e3,d/1e3,-x/1e3,g,y,0,0],S*wo),p.set([m,v,E,0],S*wo+8)}),{data:f,count:c.length}}function Vf(e,t){let a=new Map;for(let i of t||[])for(let o of i?.aliases||[])a.has(String(o))||a.set(String(o),Number(i.id));for(let i of t||[])i?.name&&a.set(String(i.name),Number(i.id));let s=new Map((e.header.nets||[]).map(i=>[i.key,i.name])),r=vo(e.header),n=new Uint32Array(r);for(let i=0;i<r;i+=1){let o=e.binding(i)?.net_key;o&&(n[i]=a.get(s.get(o)??o)||0)}return n}var So={color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}};function To(e){let t=Float32Array.from(e);for(let a=0;a<t.length;a+=1)Number.isFinite(t[a])||(t[a]=3e38);return t}function Yf(e,t){let a=new Float32Array(e.buffer,e.byteOffset+t*20*4,20),[s,r,n,i,o,c]=[a[4],a[5],a[6],a[7],a[8],a[9]],l=[1/0,1/0,-1/0,-1/0];for(let[f,u]of[[a[10],a[11]],[a[12],a[11]],[a[10],a[13]],[a[12],a[13]]]){let p=s*f+r*u+o,b=n*f+i*u+c;l[0]=Math.min(l[0],p),l[1]=Math.min(l[1],b),l[2]=Math.max(l[2],p),l[3]=Math.max(l[3],b)}return l}var hv=5e-4,bv={mask:"soldermask",silk:"silkscreen",paste:"paste"};function pv(e,t){let a=bv[t.role];return!!(e?.size&&a)&&e.has(gv(a,t.faceDown?"back":"front"))}function gv(e,t){return`${e}:${t}`}var Jf=.3,cn=class{constructor(t){this.renderer=t,this.device=t.device,this.stencil=t.stencil,this.samples=t.sampleCount||1,this.slices=[],this.skin=null,this.eye=null,this.viewMatrix=null,this.extent=null,this.overlay={mode:0,range:[0,1]},this.layout=this.device.createBindGroupLayout({label:"analytic",entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:2,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:3,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:4,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:5,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:"unfilterable-float"}},{binding:6,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:7,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:8,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:9,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:10,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}}]}),this.palette=this.device.createBuffer({label:"analytic-palette",size:8208,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.style=po(ys),this.writePalette(),this.module=this.device.createShaderModule({label:"analytic",code:md}),this.pipelines={color:this.makePipelines(t.format,!1),pick:this.makePipelines("rg32uint",!0)},this.emptyValues=this.buffer(new Float32Array([3e38]),GPUBufferUsage.STORAGE,"analytic-values-empty"),this.valuesBuffer=this.emptyValues,this.emptyField=this.fieldTexture(1,1,new Float32Array([3e38])),this.uniformScratch=new ArrayBuffer(256),this.netsBuffer=this.buffer(new Uint32Array(1),GPUBufferUsage.STORAGE,"analytic-nets"),this.makeBarrelPipelines(),this.makeArrowPipeline()}makeArrowPipeline(){this.arrowLayout=this.device.createBindGroupLayout({label:"analytic-arrows",entries:[{binding:0,visibility:GPUShaderStage.VERTEX,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:2,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:3,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:4,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}}]}),this.drawnLayers=new Uint32Array(256),this.drawnLayersBuffer=this.buffer(this.drawnLayers,GPUBufferUsage.STORAGE,"analytic-drawn-layers");let t=this.device.createShaderModule({label:"analytic-arrows",code:Md});this.arrowPipeline=this.device.createRenderPipeline({label:"analytic-arrow",layout:this.device.createPipelineLayout({bindGroupLayouts:[this.arrowLayout]}),vertex:{module:t,entryPoint:"vs_arrow"},fragment:{module:t,entryPoint:"fs_arrow",targets:[{format:this.renderer.format,blend:So}]},primitive:{topology:"triangle-list",cullMode:"none"},depthStencil:{format:this.renderer.depthFormat,depthWriteEnabled:!1,depthCompare:"greater-equal"},multisample:{count:this.samples}}),this.arrows=null}writePalette(){let t=new Float32Array(8208/4);t.set(bo(this.style.fieldColormap,Ra),0),t.set(bo(this.style.arrowColormap,Ra),Ra*4),t.set(this.style.arrowOutline,2*Ra*4),this.device.queue.writeBuffer(this.palette,0,t),this.renderer.invalidate?.()}setStyle(t){return this.style=po(t,this.style),this.writePalette(),this.style}setArrows(t){this.arrows?.buffer.destroy(),this.arrows=t?.count?{buffer:this.buffer(new Uint8Array(t.data),GPUBufferUsage.STORAGE,"analytic-arrows"),count:t.count}:null,this.arrows&&(this.arrows.bindGroup=this.device.createBindGroup({layout:this.arrowLayout,entries:[{binding:0,resource:{buffer:this.renderer.globalBuffer}},{binding:1,resource:{buffer:this.arrows.buffer}},{binding:2,resource:{buffer:this.layerOffsets}},{binding:3,resource:{buffer:this.palette}},{binding:4,resource:{buffer:this.drawnLayersBuffer}}]})),this.renderer.invalidate?.()}encodeArrows(t){return this.arrows?(this.device.queue.writeBuffer(this.drawnLayersBuffer,0,this.drawnLayers),t.setPipeline(this.arrowPipeline),t.setBindGroup(0,this.arrows.bindGroup),t.draw(9,2*this.arrows.count),1):0}makeBarrelPipelines(){let t=GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT;this.barrelLayout=this.device.createBindGroupLayout({label:"analytic-barrels",entries:[{binding:0,visibility:t,buffer:{type:"uniform"}},{binding:1,visibility:t,buffer:{type:"uniform"}},{binding:2,visibility:t,buffer:{type:"read-only-storage"}},{binding:3,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:4,visibility:t,buffer:{type:"read-only-storage"}},{binding:5,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:6,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:7,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}}]});let a=this.device.createShaderModule({label:"analytic-barrels",code:wd}),s=this.device.createPipelineLayout({bindGroupLayouts:[this.barrelLayout]}),r=(o,c)=>this.device.createRenderPipeline({label:`analytic-barrel${c?"-pick":""}`,layout:s,vertex:{module:a,entryPoint:"vs_barrel"},fragment:{module:a,entryPoint:c?"fs_barrel_pick":"fs_barrel",targets:[{format:o}]},primitive:{topology:"triangle-list",cullMode:"back"},depthStencil:{format:this.renderer.depthFormat,depthWriteEnabled:!0,depthCompare:"greater"},multisample:{count:c?1:this.samples}});this.barrelPipelines={color:r(this.renderer.format,!1),pick:r("rg32uint",!0)},this.barrelView=this.device.createBuffer({label:"analytic-barrel-view",size:Ci,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.layerOffsets=this.device.createBuffer({label:"analytic-layer-offsets",size:256*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.viewScratch=new ArrayBuffer(Ci),this.barrels=null;let n=this.device.createShaderModule({label:"analytic-walls",code:vd}),i=o=>this.device.createRenderPipeline({label:`analytic-wall${o?"-blend":""}`,layout:s,vertex:{module:n,entryPoint:"vs_wall"},fragment:{module:n,entryPoint:"fs_wall",targets:[{format:this.renderer.format,...o?{blend:So}:{}}]},primitive:{topology:"triangle-list",cullMode:"none"},depthStencil:{format:this.renderer.depthFormat,depthWriteEnabled:!0,depthCompare:"greater"},multisample:{count:this.samples}});this.wallPipelines={opaque:i(!1),blend:i(!0)},this.walls=null}setWalls({data:t,count:a}){this.walls?.buffer.destroy(),this.walls=a?{buffer:this.buffer(new Uint8Array(t),GPUBufferUsage.STORAGE,"analytic-walls"),count:a,bindGroup:null}:null,this.walls&&(this.walls.bindGroup=this.wallBindGroup()),this.renderer.invalidate?.()}wallBindGroup(){return this.device.createBindGroup({layout:this.barrelLayout,entries:[{binding:0,resource:{buffer:this.renderer.globalBuffer}},{binding:1,resource:{buffer:this.barrelView}},{binding:2,resource:{buffer:this.walls.buffer}},{binding:3,resource:{buffer:this.valuesBuffer}},{binding:4,resource:{buffer:this.layerOffsets}},{binding:5,resource:{buffer:this.netsBuffer}},{binding:6,resource:{buffer:this.renderer.netMaskBuffer}},{binding:7,resource:{buffer:this.palette}}]})}encodeWalls(t,a){return this.walls?(t.setPipeline(a?this.wallPipelines.blend:this.wallPipelines.opaque),t.setBindGroup(0,this.walls.bindGroup),t.draw(6,this.walls.count),1):0}writeView(t,a,s={}){let r=new Float32Array(256);a&&r.set(a.subarray?a.subarray(0,256):a.slice(0,256)),this.device.queue.writeBuffer(this.layerOffsets,0,r);let n=new Float32Array(this.viewScratch),i=new Uint32Array(this.viewScratch);n.fill(0),this.eye=mv(t),this.viewMatrix=t,n.set(this.eye,0),n.set(this.renderer.barrelColor||[.55,.35,.16,1],4);let o=this.laminateColor()||this.boardLooks().substrate?.color||[.3,.32,.25,1],c=(s.boardOpacity??1)*(.15+.85*(s.assemblyOpacity??1));n.set([...o.slice(0,3),c],8);let l=this.overlay.mode===1||this.overlay.mode===2&&this.valuesBuffer!==this.emptyValues;i[12]=l?1:0,i[13]=s.isolateNet?1:0,i[14]=this.boardShown(s)?1:0,i[15]=this.boardShown(s)&&(s.boardOpacity??1)>=.999&&this.renderer.innerCopperMode!=="all"?1:0,n.set(this.overlay.range,16),n.set(this.edgePlated?[...(this.renderer.barrelColor||[.55,.35,.16]).slice(0,3),c]:[...o.slice(0,3),c],20),n.set([...(this.boardLooks().soldermask?.color||[.06,.16,.11]).slice(0,3),1],24),this.device.queue.writeBuffer(this.barrelView,0,this.viewScratch)}setBarrels({data:t,count:a,skipped:s=0}){this.barrels?.buffer.destroy(),this.barrels=a?{buffer:this.buffer(new Uint8Array(t),GPUBufferUsage.STORAGE,"analytic-barrels"),count:a,skipped:s,bindGroup:null}:null,this.barrels&&(this.barrels.bindGroup=this.barrelBindGroup()),this.renderer.invalidate?.()}hasBarrels(){return!!this.barrels}barrelBindGroup(){return this.device.createBindGroup({layout:this.barrelLayout,entries:[{binding:0,resource:{buffer:this.renderer.globalBuffer}},{binding:1,resource:{buffer:this.barrelView}},{binding:2,resource:{buffer:this.barrels.buffer}},{binding:3,resource:{buffer:this.valuesBuffer}},{binding:4,resource:{buffer:this.layerOffsets}},{binding:5,resource:{buffer:this.netsBuffer}},{binding:6,resource:{buffer:this.renderer.netMaskBuffer}},{binding:7,resource:{buffer:this.palette}}]})}encodeBarrels(t,a,s,r=!1){return this.barrels?(s&&this.writeView(s,a,this.context),t.setPipeline(r?this.barrelPipelines.pick:this.barrelPipelines.color),t.setBindGroup(0,this.barrels.bindGroup),t.draw(36,this.barrels.count),1):0}buffer(t,a,s){let r=Math.max(16,Math.ceil(t.byteLength/4)*4),n=this.device.createBuffer({label:s,size:r,usage:a|GPUBufferUsage.COPY_DST});return t.byteLength&&this.device.queue.writeBuffer(n,0,t),n}fieldTexture(t,a,s){let r=this.device.createTexture({label:"analytic-field",size:[t,a],format:"r32float",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});return this.device.queue.writeTexture({texture:r},s,{bytesPerRow:t*4},[t,a]),r}makePipelines(t,a){let s=this.device.createPipelineLayout({bindGroupLayouts:[this.layout]}),r=(i,o,c,l,f=[],u=!1,p="none")=>{let b=Er[l],h={format:this.renderer.depthFormat,depthWriteEnabled:b.depth,depthCompare:b.depth||b.depthTest?"greater":"always"};return this.stencil&&Object.assign(h,{stencilFront:b.face,stencilBack:b.face,stencilReadMask:b.read,stencilWriteMask:b.write}),this.device.createRenderPipeline({label:`analytic-${i}${a?"-pick":""}`,layout:s,vertex:{module:this.module,entryPoint:o,buffers:f},fragment:{module:this.module,entryPoint:a?`${c}_pick`:c,...a?{}:{constants:{SAMPLES:this.samples}},targets:[{format:t,writeMask:b.color?GPUColorWrite.ALL:0,...u&&!a?{blend:So}:{}}]},primitive:{topology:"triangle-list",cullMode:p},depthStencil:h,multisample:{count:a?1:this.samples}})},n=[{arrayStride:8,attributes:[{shaderLocation:0,offset:0,format:"float32x2"}]}];return{shapeMask:r("shape-mask","vs_shape","fs_shape_mask","shapeMask"),shapeAdd:r("shape","vs_shape","fs_shape","shapeAdd"),fan:r("fan","vs_fan","fs_plain_mask","fan",n),coverSubtract:r("cover-subtract","vs_cover","fs_plain_mask","coverSubtract"),coverMark:r("cover-mark","vs_cover","fs_plain_mask","coverMark"),coverAdd:r("cover","vs_cover","fs_cover","coverAdd"),coverClear:r("cover-clear","vs_cover","fs_plain_mask","coverClear"),clear:r("clear","vs_clear","fs_plain_mask","clear"),regionWall:r("region-wall","vs_region_wall","fs_region_wall","solid"),skirt:r("skirt","vs_skirt","fs_skirt","solid"),...a?{}:{shapeLay:r("shape-lay","vs_shape","fs_shape_mask","shapeLay"),coverLay:r("cover-lay","vs_cover","fs_plain_mask","coverLay"),shapeBlend:r("shape-blend","vs_shape","fs_shape","shapeBlend",[],!0),coverBlend:r("cover-blend","vs_cover","fs_cover","coverBlend",[],!0),tintCovered:r("tint-covered","vs_clear","fs_tint_covered","tintCovered",[],!0),tintPlain:r("tint-plain","vs_clear","fs_tint_plain","tintPlain",[],!0),footShape:r("foot-shape","vs_shape","fs_shape_mask","footShape"),footCover:r("foot-cover","vs_cover","fs_plain_mask","footCover"),tintHigh:r("tint-high","vs_clear","fs_tint_covered","tintHigh",[],!0),tintLow:r("tint-low","vs_clear","fs_tint_plain","tintLow",[],!0),regionStep:r("region-step","vs_region_step","fs_region_step","coat"),step:r("step","vs_step","fs_step","coat"),clearLay:r("clear-lay","vs_clear","fs_plain_mask","clearLay"),clearFoot:r("clear-foot","vs_clear","fs_plain_mask","clearFoot"),shapeOnFoot:r("shape-on-foot","vs_shape","fs_shape","shapeOnFoot",[],!0),shapeOffFoot:r("shape-off-foot","vs_shape","fs_shape","shapeOffFoot",[],!0),coverOnFoot:r("cover-on-foot","vs_cover","fs_cover","coverOnFoot",[],!0),coverOffFoot:r("cover-off-foot","vs_cover","fs_cover","coverOffFoot",[],!0)}}}setSlices(t){this.releaseSlices();let a=new Map;this.slices=t.map(o=>this.uploadSlice(o,a)),this.makeTwins();let s=t.map(o=>o.z),r=t.flatMap(o=>[o.bounds[0],o.bounds[2]]),n=t.flatMap(o=>[o.bounds[1],o.bounds[3]]);this.extent=t.length?[[Math.min(...r)/1e3,-Math.max(...n)/1e3,Math.min(...s)],[Math.max(...r)/1e3,-Math.min(...n)/1e3,Math.max(...s)]]:null;let i=t.filter(o=>o.skin);this.skin=i.length===2?{top:Math.max(...i.map(o=>o.z)),bottom:Math.min(...i.map(o=>o.z))}:null,this.renderer.invalidate?.()}makeTwins(){this.twinBuffers?.forEach(a=>a.destroy()),this.twinBuffers=[];let t=(a,s)=>{let r={...a,...s,uniform:this.device.createBuffer({label:`analytic-twin-${a.key}`,size:256,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),field:null};return r.bindGroup=this.bindGroup(r),r};this.twins=new Map;for(let a of this.slices){if(a.zLow===void 0||a.role!=="mask"&&a.role!=="silk")continue;let s={low:t(a,{z:a.zLow})},r=a.role==="mask"&&this.slices.find(n=>n.role==="copper"&&n.mark&&n.faceDown===a.faceDown);if(r){let n=this.uploadOpenings(r,a),i=a.faceDown?r.zTop:r.zBottom;s.foot=t(r,{role:"footprint",z:a.z,dilate:hv,mark:!1,walls:!1,zTop:Math.max(a.z,i),zBottom:Math.min(a.z,i),...n})}this.twins.set(a,s)}}uploadOpenings(t,a){let{lowered:s}=t,r=a.lowered.shapes.subarray(0,a.lowered.subtractShapes*20),n=s.shapes.length/20,i=new Uint32Array(s.shapes.length+r.length);i.set(s.shapes),i.set(r,s.shapes.length);let o=new Map,c=(m,v)=>`${Math.floor(m)},${Math.floor(v)}`,l=[];for(let m=0;m<r.length/20;m+=1){let v=Yf(r,m);l.push(v);for(let E=Math.floor(v[0]);E<=Math.floor(v[2]);E+=1)for(let S=Math.floor(v[1]);S<=Math.floor(v[3]);S+=1){let A=c(E,S);o.has(A)||o.set(A,[]),o.get(A).push(m)}}let f=[],u=[],p=m=>{let v=new Set;for(let E=Math.floor(m[0]);E<=Math.floor(m[2]);E+=1)for(let S=Math.floor(m[1]);S<=Math.floor(m[3]);S+=1)for(let A of o.get(c(E,S))||[]){let T=l[A];T[0]<=m[2]&&m[0]<=T[2]&&T[1]<=m[3]&&m[1]<=T[3]&&v.add(A)}u.push(f.length,v.size);for(let E of v)f.push(n+E)},b=m=>[m[0]-.05,m[1]-.05,m[2]+.05,m[3]+.05];for(let m=s.subtractShapes;m<n;m+=1)p(b(Yf(s.shapes,m)));let h=n-s.subtractShapes,d=s.contourEdges||new Float32Array(0);for(let m=0;m+3<d.length;m+=4)p(b([Math.min(d[m],d[m+2]),Math.min(d[m+1],d[m+3]),Math.max(d[m],d[m+2]),Math.max(d[m+1],d[m+3])]));let x={shapeCuts:new Uint32Array(u.slice(0,h*2)),edgeCuts:new Uint32Array(u.slice(h*2)),cutIndices:new Uint32Array(f)},g=this.uploadEdges({...s,...x},`${t.key}-step`),y=this.buffer(i,GPUBufferUsage.STORAGE,`analytic-step-shapes-${t.key}`);return this.twinBuffers.push(y,g.edges,g.cuts),{...g,shapes:y}}uploadSlice(t,a=new Map){let{lowered:s}=t,r=GPUBufferUsage.STORAGE;a.has(s)||a.set(s,{shapes:this.buffer(s.shapes,r,`analytic-shapes-${t.key}`),covers:this.buffer(s.covers,r,`analytic-covers-${t.key}`),fans:s.fanVertices.length?this.buffer(s.fanVertices,GPUBufferUsage.VERTEX,`analytic-fans-${t.key}`):null,...this.uploadEdges(s,t.key)});let n={...t,...a.get(s),uniform:this.device.createBuffer({label:`analytic-slice-${t.key}`,size:256,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),shapeCount:s.shapes.length/20,subtractShapes:s.subtractShapes,batches:[],field:null};for(let i=0;i<s.batches.length;i+=5){let[o,c,l,f,u]=s.batches.subarray(i,i+5);n.batches.push({subtract:o===1,firstVertex:c,vertexCount:l,firstCover:f,coverCount:u})}return n.bindGroup=this.bindGroup(n),n}uploadEdges(t,a){let s=t.contourEdges||new Float32Array(0),r=t.contourEdgeOperations||new Uint32Array(0),n=t.shapeCuts||new Uint32Array(0),i=t.edgeCuts||new Uint32Array(0),o=t.cutIndices||new Uint32Array(0),c=n.length,l=new Uint32Array(Math.max(1,c+o.length));for(let y=0;y<c;y+=2)l.set([n[y]+c,n[y+1]],y);l.set(o,c);let f=t.outlineEdges||new Float32Array(0),u=t.outlineShapes||new Uint32Array(0),p=Math.min(s.length/4,r.length),b=new Uint32Array(Math.max(1,p+u.length)*7),h=new Uint32Array(s.buffer,s.byteOffset,s.length),d=0;for(let y=0;y<p;y+=1){if(r[y]&2147483648)continue;let m=d*7;b.set(h.subarray(y*4,y*4+4),m),b[m+4]=r[y],b[m+5]=(i[y*2]??0)+c,b[m+6]=i[y*2+1]??0,d+=1}let x=d,g=new Uint32Array(f.buffer,f.byteOffset,f.length);for(let y=0;y<u.length;y+=1){let m=d*7;b.set(g.subarray(y*4,y*4+4),m),b[m+4]=(1073741824|u[y])>>>0,d+=1}return{edges:this.buffer(b,GPUBufferUsage.STORAGE,`analytic-edges-${a}`),regionEdges:x,skirtEdges:d-x,cuts:this.buffer(l,GPUBufferUsage.STORAGE,`analytic-cuts-${a}`)}}bindGroup(t){return this.device.createBindGroup({layout:this.layout,entries:[{binding:0,resource:{buffer:this.renderer.globalBuffer}},{binding:1,resource:{buffer:t.uniform}},{binding:2,resource:{buffer:t.shapes}},{binding:3,resource:{buffer:t.covers}},{binding:4,resource:{buffer:this.valuesBuffer}},{binding:5,resource:(t.field?.texture||this.emptyField).createView()},{binding:6,resource:{buffer:this.netsBuffer}},{binding:7,resource:{buffer:this.renderer.netMaskBuffer}},{binding:8,resource:{buffer:t.edges}},{binding:9,resource:{buffer:t.cuts}},{binding:10,resource:{buffer:this.palette}}]})}coversLayer(t){return this.slices.some(a=>a.role!==void 0?a.role==="copper"&&a.layerId===Number(t):a.layerId===Number(t))}coversRole(t){let a={substrate:"dielectric",soldermask:"mask",silkscreen:"silk",paste:"paste"}[t];return!!a&&this.slices.some(s=>s.role===a)}setOperationValues(t,a){this.clearOverlay(),this.valuesBuffer=this.buffer(To(t),GPUBufferUsage.STORAGE,"analytic-values"),this.overlay={mode:1,range:a},this.rebind()}setFieldRasters(t,a,s=null){this.clearOverlay(),s&&(this.valuesBuffer=this.buffer(To(s),GPUBufferUsage.STORAGE,"analytic-values"));for(let r of this.slices){let n=t.get(r.key);n&&(r.field={...n,texture:this.fieldTexture(n.width,n.height,To(n.values))})}this.overlay={mode:2,range:a},this.rebind()}clearOverlay(){this.valuesBuffer!==this.emptyValues&&this.valuesBuffer.destroy(),this.valuesBuffer=this.emptyValues;for(let t of this.slices)t.field?.texture.destroy(),t.field=null;this.overlay={mode:0,range:[0,1]},this.rebind()}setOperationNets(t){this.netsBuffer.destroy(),this.netsBuffer=this.buffer(t.length?t:new Uint32Array(1),GPUBufferUsage.STORAGE,"analytic-nets"),this.rebind()}rebind(){this.boundNetMask=this.renderer.netMaskBuffer;for(let t of this.slices)t.bindGroup=this.bindGroup(t);for(let t of this.twins?.values()||[])for(let a of Object.values(t))a.bindGroup=this.bindGroup(a);this.barrels&&(this.barrels.bindGroup=this.barrelBindGroup()),this.walls&&(this.walls.bindGroup=this.wallBindGroup()),this.renderer.invalidate?.()}writeSlice(t,a,s=null){let r=new Float32Array(this.uniformScratch),n=new Uint32Array(this.uniformScratch);r.fill(0),r.set(s?.color||t.color,0);let[i,o]=t.offsetLayers||[t.layerId,t.layerId];r[4]=t.z+.5*((a?.[i]||0)+(a?.[o]||0));let c=t.role===void 0||t.role==="copper";n[5]=c?this.overlay.mode:0;let f=(this.context||{}).isolateNet||!t.outer&&this.renderer.innerCopperMode==="lit";n[7]=c?2|(f?1:0):0;let u=c?t.field:null;if(n[6]=u?1:0,u){r.set(u.originMm,8);let[p,b]=Array.isArray(u.pitchMm)?u.pitchMm:[u.pitchMm,u.pitchMm];r[10]=p,r[11]=b,n[12]=u.width,n[13]=u.height}if(r.set(this.overlay.range,16),r.set(t.bounds,20),r.set([s?.metallic??0,s?.roughness??.72,t.faceDown??t.bottom?-1:1,c?1:0],24),t.zTop!==void 0){let p=r[4]-t.z;r.set([t.zBottom+p,t.zTop+p],28)}n[30]=t.subtractShapes||0,r[31]=t.dilate||0,this.eye&&r.set(this.eye,32),this.device.queue.writeBuffer(t.uniform,0,this.uniformScratch)}copperLooks(){let t=new Map;for(let a of this.renderer.entries||[]){let s=Number(a.layerId);if(a.kind!=="copper"||t.has(s))continue;let r=a.color||a.material?.baseColor;t.set(s,{color:r&&r.length<4?[...r,1]:r,metallic:a.material?.metallic||0,roughness:a.material?.roughness??.72})}return t}boardLooks(){let t={};for(let a of this.renderer.entries||[]){if(a.kind!=="board"||t[a.boardRole])continue;let s=a.color||a.material?.baseColor;t[a.boardRole]={color:s&&s.length<4?[...s,1]:s,metallic:a.material?.metallic||0,roughness:a.material?.roughness??.72}}return t}laminateColor(){return this.slices.find(t=>t.role==="dielectric"&&t.color)?.color||null}lookFor(t,a,s,r){if(t.role===void 0||t.role==="copper")return a.get(t.layerId);let n=r.boardOpacity??1,i=(c,l)=>{let f=s[c];if(!f)return null;let u=f.color||[1,1,1,1];return{...f,color:[u[0],u[1],u[2],l(Number.isFinite(u[3])?u[3]:1)]}};if(t.role==="dielectric"){let c=n*(.15+.85*(r.assemblyOpacity??1));return t.color?{...s.substrate||{metallic:0,roughness:.72},color:[...t.color.slice(0,3),c]}:i("substrate",()=>c)}let o=r.assemblyOpacity??1;return t.role==="mask"?i("soldermask",c=>Math.min(c,.72)*n*o):t.role==="silk"?i("silkscreen",c=>Math.min(c,.92)*n*o):i("paste",c=>c)}encodeInto(t,a,s,r=!1,n={}){this.context=n,this.renderer.netMaskBuffer!==this.boundNetMask&&this.rebind(),n.matrix&&this.writeView(n.matrix,a,n);let i=r?this.pipelines.pick:this.pipelines.color,o=this.copperLooks(),c=this.boardLooks(),f=this.boardShown(n)&&(n.boardOpacity??1)>=.999,u=0;r||this.drawnLayers.fill(0);for(let p of this.slices){let b=p.role===void 0||p.role==="copper";(b?s&&!s.has(p.layerId):r||p.role!=="dielectric"||!f)||b&&!p.outer&&p.role!==void 0&&this.renderer.innerCopperMode==="none"||p.role==="dielectric"&&!p.skin&&this.renderer.innerCopperMode!=="all"||this.behindBoard(p,n)||(this.encodeSlice(t,i,p,"opaque",a,this.lookFor(p,o,c,n)),!r&&b&&p.face===(p.bottom?"bottom":"top")&&(this.drawnLayers[p.layerId]=1),u+=1)}return f&&!r&&(u+=this.encodeWalls(t,!1)),this.stencil&&t.setStencilReference(1),u}boardShown(t){return(t.showBoard??!0)&&!t.panelLayer}behindBoard(t,a){if(!this.skin||!this.eye||this.renderer.innerCopperMode==="all"||!this.boardShown(a)||(a.boardOpacity??1)<.999)return!1;let[,,s,r]=this.eye,n=r?s>this.skin.top:s<0,i=r?s<this.skin.bottom:s>0;return t.faceDown?n:i}encodeBlended(t,a,s,r={}){if(!this.stencil)return 0;this.context=r;let n=this.copperLooks(),i=this.boardLooks(),o=this.boardShown(r),c=o&&(r.boardOpacity??1)<.999,l=0,f=(h,d)=>{this.behindBoard(h,r)||(this.encodeSlice(t,this.pipelines.color,h,d,a,this.lookFor(h,n,i,r)),l+=1)};for(let h of this.slices)c&&h.role==="dielectric"&&f(h,"blend");c&&(l+=this.encodeWalls(t,!0));let u=o&&(r.assemblyOpacity??1)>.01,p=h=>!pv(r.hiddenBoardLayers,h),b=new Set;for(let h of this.slices){if(h.role!=="mask"||!u||!p(h)||this.behindBoard(h,r))continue;let d=this.twins.get(h);if(!d?.foot){f(h,"mask");continue}let x=this.slices.filter(g=>g.role==="silk"&&g.faceDown===h.faceDown&&p(g)&&!this.behindBoard(g,r));for(let g of x)b.add(g);l+=this.encodeConformal(t,h,d,x,a,g=>this.lookFor(g,n,i,r))}for(let h of this.slices)h.role==="paste"&&p(h)&&!r.hidePaste&&!r.panelLayer&&(!s||s.has(h.offsetLayers?.[0]))&&f(h,"blend");for(let h of this.slices)h.role==="silk"&&u&&p(h)&&!b.has(h)&&f(h,"blend");return t.setStencilReference(1),l}encodeSlice(t,a,s,r,n,i){this.writeSlice(s,n,i),t.setBindGroup(0,s.bindGroup),this.stencil?this.encodeStencilled(t,a,s,r):this.encodeAddsOnly(t,a,s),r==="opaque"&&s.walls&&this.encodeSlabWalls(t,a,s)}wallPixels(t){let a=this.viewMatrix,s=this.renderer.canvas;if(!a||!this.extent||!s)return 1/0;let[r,n]=this.extent,i=[];for(let l of[r[0],n[0]])for(let f of[r[1],n[1]])for(let u of[r[2],n[2]])i.push([l,f,u]);this.eye?.[3]&&i.push(this.eye.slice(0,3).map((l,f)=>Math.min(n[f],Math.max(r[f],l/this.eye[3]))));let o=([l,f,u])=>{let p=[0,1,2,3].map(b=>a[b]*l+a[4+b]*f+a[8+b]*u+a[12+b]);return p[3]>1e-9?[p[0]/p[3],p[1]/p[3]]:null},c=0;for(let l of i){let f=o(l),u=o([l[0],l[1],l[2]+t]);if(!f||!u)return 1/0;c=Math.max(c,Math.hypot((u[0]-f[0])*s.width/2,(u[1]-f[1])*s.height/2))}return c}encodeSlabWalls(t,a,s){this.stencil&&t.setStencilReference(0),s.regionEdges&&(t.setPipeline(a.regionWall),t.draw(6,s.regionEdges,0,0)),s.skirtEdges&&this.wallPixels(s.zTop-s.zBottom)>=Jf&&(t.setPipeline(a.skirt),t.draw(12,s.skirtEdges,0,s.regionEdges))}encodeAddsOnly(t,a,s){let r=s.shapeCount-s.subtractShapes;r&&(t.setPipeline(a.shapeAdd),t.draw(6,r,0,s.subtractShapes))}encodeStencilled(t,a,s,r="opaque"){let n=(i,o=Er[i].reference)=>{t.setPipeline(a[i]),t.setStencilReference(o)};this.encodeFill(t,s,n,r),r==="mask"&&(n("tintCovered"),t.draw(6),n("tintPlain"),t.draw(6)),n("clear"),t.draw(6)}encodeFill(t,a,s,r){let n=r==="footprint";a.subtractShapes&&!n&&(s("shapeMask"),t.draw(6,a.subtractShapes,0,0)),n||this.encodeBatches(t,a,!0,s,r);let i=a.shapeCount-a.subtractShapes;i&&(r==="opaque"?s("shapeAdd",a.mark?33:32):s({mask:"shapeLay",blend:"shapeBlend",footprint:"footShape",onFoot:"shapeOnFoot",offFoot:"shapeOffFoot"}[r]),t.draw(6,i,0,a.subtractShapes)),this.encodeBatches(t,a,!1,s,r)}encodeConformal(t,a,{low:s,foot:r},n,i,o){let c=this.pipelines.color,l=b=>Er[b==="step"||b==="regionStep"?"coat":b],f=(b,h=l(b).reference)=>{t.setPipeline(c[b]),t.setStencilReference(h)},u=(b,h)=>{this.writeSlice(b,i,h),t.setBindGroup(0,b.bindGroup)},p=o(a);u(r,p),this.encodeFill(t,r,f,"footprint"),u(a,p),this.encodeFill(t,a,f,"mask"),f("tintHigh"),t.draw(6),t.setBindGroup(0,r.bindGroup),r.regionEdges&&(f("regionStep"),t.draw(6,r.regionEdges,0,0)),r.skirtEdges&&this.wallPixels(r.zTop-r.zBottom)>=Jf&&(f("step"),t.draw(12,r.skirtEdges,0,r.regionEdges)),t.setBindGroup(0,a.bindGroup),f("clearLay"),t.draw(6),u(s,p),this.encodeFill(t,s,f,"mask"),f("tintLow"),t.draw(6),f("clearLay"),t.draw(6);for(let b of n){let h=o(b);u(b,h),this.encodeFill(t,b,f,"onFoot"),f("clear"),t.draw(6);let d=this.twins.get(b)?.low;d&&(u(d,h),this.encodeFill(t,d,f,"offFoot"),f("clear"),t.draw(6))}return t.setBindGroup(0,a.bindGroup),f("clearFoot"),t.draw(6),t.setStencilReference(1),1+n.length}encodeBatches(t,a,s,r,n="opaque"){let i=a.batches.findLast(o=>!o.subtract);for(let o of a.batches){if(o.subtract!==s||!a.fans)continue;r("fan"),t.setVertexBuffer(0,a.fans),t.draw(o.vertexCount,1,o.firstVertex,0),!s&&n==="opaque"&&(a.mark||a.role==="dielectric")&&(r("coverMark",a.mark?65:64),t.draw(6,o.coverCount,0,o.firstCover));let c={opaque:"coverAdd",blend:"coverBlend",mask:"coverLay",footprint:"footCover",onFoot:"coverOnFoot",offFoot:"coverOffFoot"}[n];r(s?"coverSubtract":c),t.draw(6,o.coverCount,0,o.firstCover),!s&&(o!==i||n==="footprint")&&(r("coverClear"),t.draw(6,o.coverCount,0,o.firstCover))}}gpuMemoryBytes(){let t=this.valuesBuffer===this.emptyValues?0:this.valuesBuffer.size;this.barrels&&(t+=this.barrels.count*yd),this.walls&&(t+=this.walls.count*xd);let a=new Set;for(let s of this.slices){for(let r of[s.shapes,s.covers,s.fans,s.uniform,s.edges,s.cuts])r&&a.add(r);s.field&&(t+=s.field.width*s.field.height*4)}for(let s of a)t+=s.size;return t}stats(){return{slices:this.slices.map(t=>({key:t.key,role:t.role||"copper",face:t.face,layerId:t.layerId,z:t.z,shapes:t.shapeCount,subtractShapes:t.subtractShapes,regionBatches:t.batches.length,fanVertices:t.lowered.fanVertices.length/2,covers:t.lowered.covers.length/6,approximations:t.lowered.stats})),overlay:this.overlay.mode,barrels:this.barrels?{count:this.barrels.count,skipped:this.barrels.skipped}:null,walls:this.walls?.count||0,gpuMemoryBytes:this.gpuMemoryBytes(),degraded:!this.stencil}}releaseSlices(){for(let a of this.twins?.values()||[])for(let s of Object.values(a))s.uniform.destroy();this.twinBuffers?.forEach(a=>a.destroy()),this.twinBuffers=[],this.twins=new Map;let t=new Set;for(let a of this.slices){for(let s of[a.shapes,a.covers,a.fans,a.uniform,a.edges,a.cuts])s&&t.add(s);a.field?.texture.destroy()}for(let a of t)a.destroy();this.slices=[]}destroy(){this.releaseSlices(),this.barrels?.buffer.destroy(),this.walls?.buffer.destroy(),this.arrows?.buffer.destroy(),this.drawnLayersBuffer.destroy(),this.palette.destroy(),this.netsBuffer.destroy(),this.barrelView.destroy(),this.layerOffsets.destroy(),this.valuesBuffer!==this.emptyValues&&this.valuesBuffer.destroy(),this.emptyValues.destroy(),this.emptyField.destroy()}};function mv(e){let t=yv(Array.from(e,Number));if(!t)return[0,0,-1,0];let a=l=>[0,1,2,3].map(f=>t[f]*l[0]+t[4+f]*l[1]+t[8+f]*l[2]+t[12+f]*l[3]),s=a([0,0,1,0]),r=Math.hypot(s[0],s[1],s[2]);if(Math.abs(s[3])>1e-9*Math.max(r,1e-30))return[s[0]/s[3],s[1]/s[3],s[2]/s[3],1];let n=a([0,0,1,1]),i=a([0,0,0,1]),o=[0,1,2].map(l=>i[l]/i[3]-n[l]/n[3]),c=Math.hypot(...o)||1;return[...o.map(l=>l/c),0]}function yv(e){let t=new Array(16);t[0]=e[5]*e[10]*e[15]-e[5]*e[11]*e[14]-e[9]*e[6]*e[15]+e[9]*e[7]*e[14]+e[13]*e[6]*e[11]-e[13]*e[7]*e[10],t[4]=-e[4]*e[10]*e[15]+e[4]*e[11]*e[14]+e[8]*e[6]*e[15]-e[8]*e[7]*e[14]-e[12]*e[6]*e[11]+e[12]*e[7]*e[10],t[8]=e[4]*e[9]*e[15]-e[4]*e[11]*e[13]-e[8]*e[5]*e[15]+e[8]*e[7]*e[13]+e[12]*e[5]*e[11]-e[12]*e[7]*e[9],t[12]=-e[4]*e[9]*e[14]+e[4]*e[10]*e[13]+e[8]*e[5]*e[14]-e[8]*e[6]*e[13]-e[12]*e[5]*e[10]+e[12]*e[6]*e[9],t[1]=-e[1]*e[10]*e[15]+e[1]*e[11]*e[14]+e[9]*e[2]*e[15]-e[9]*e[3]*e[14]-e[13]*e[2]*e[11]+e[13]*e[3]*e[10],t[5]=e[0]*e[10]*e[15]-e[0]*e[11]*e[14]-e[8]*e[2]*e[15]+e[8]*e[3]*e[14]+e[12]*e[2]*e[11]-e[12]*e[3]*e[10],t[9]=-e[0]*e[9]*e[15]+e[0]*e[11]*e[13]+e[8]*e[1]*e[15]-e[8]*e[3]*e[13]-e[12]*e[1]*e[11]+e[12]*e[3]*e[9],t[13]=e[0]*e[9]*e[14]-e[0]*e[10]*e[13]-e[8]*e[1]*e[14]+e[8]*e[2]*e[13]+e[12]*e[1]*e[10]-e[12]*e[2]*e[9],t[2]=e[1]*e[6]*e[15]-e[1]*e[7]*e[14]-e[5]*e[2]*e[15]+e[5]*e[3]*e[14]+e[13]*e[2]*e[7]-e[13]*e[3]*e[6],t[6]=-e[0]*e[6]*e[15]+e[0]*e[7]*e[14]+e[4]*e[2]*e[15]-e[4]*e[3]*e[14]-e[12]*e[2]*e[7]+e[12]*e[3]*e[6],t[10]=e[0]*e[5]*e[15]-e[0]*e[7]*e[13]-e[4]*e[1]*e[15]+e[4]*e[3]*e[13]+e[12]*e[1]*e[7]-e[12]*e[3]*e[5],t[14]=-e[0]*e[5]*e[14]+e[0]*e[6]*e[13]+e[4]*e[1]*e[14]-e[4]*e[2]*e[13]-e[12]*e[1]*e[6]+e[12]*e[2]*e[5],t[3]=-e[1]*e[6]*e[11]+e[1]*e[7]*e[10]+e[5]*e[2]*e[11]-e[5]*e[3]*e[10]-e[9]*e[2]*e[7]+e[9]*e[3]*e[6],t[7]=e[0]*e[6]*e[11]-e[0]*e[7]*e[10]-e[4]*e[2]*e[11]+e[4]*e[3]*e[10]+e[8]*e[2]*e[7]-e[8]*e[3]*e[6],t[11]=-e[0]*e[5]*e[11]+e[0]*e[7]*e[9]+e[4]*e[1]*e[11]-e[4]*e[3]*e[9]-e[8]*e[1]*e[7]+e[8]*e[3]*e[5],t[15]=e[0]*e[5]*e[10]-e[0]*e[6]*e[9]-e[4]*e[1]*e[10]+e[4]*e[2]*e[9]+e[8]*e[1]*e[6]-e[8]*e[2]*e[5];let a=e[0]*t[0]+e[1]*t[4]+e[2]*t[8]+e[3]*t[12];return a?t.map(s=>s/a):null}function xv(e,t,a=0){let s=new Map((t||[]).map(r=>[Number(r.id),r]));for(let r of e||[]){let n=s.get(Number(r.layerId));if(r.kind!=="copper"||!n||!r.quantMin||!r.quantSize)continue;let i=r.quantSize[2]===1;return r.quantMin[2]+(i?0:r.quantSize[2]/2)-Number(n.z_mm||0)/1e3}return Number(a||0)/1e3}async function eh({renderer:e,layers:t,colorFor:a,bytes:s,wasm:r,toleranceNm:n,nets:i=[],features:o=[],boardZOffsetMm:c=0}){let l=await jf(s,{wasm:r}),f=xv(e.entries,t,c),{planned:u,unmatched:p}=Uf(l.header,t,f),b=new Map(t.map(T=>[Number(T.id),T])),h=performance.now(),d=new Map;for(let T of u)d.has(T.key)||d.set(T.key,l.lowerSlice(T.key,n));let x=u.map(T=>({...T,color:T.role==="copper"?a(b.get(T.layerId)):T.color||[1,1,1,1],lowered:d.get(T.key)})),g=performance.now()-h,y=new cn(e);y.setSlices(x);let m=x.find(T=>T.role==="dielectric"&&T.lowered?.contourEdges?.length)?.lowered.contourEdges,v=l.barrels();y.setBarrels(Gf(l.header,v,x,m));let E=new Set;for(let T=0;T<v.words.length;T+=nn)E.add(v.words[T]);y.edgePlated=!!l.header.stack?.edge_plating,y.setWalls(Kf(x,d,t,f));let S=Vf(l,i);y.setOperationNets(S),e.setAnalytic(y);let A=new Map;for(let T of o||[])T?.sourceUid&&(A.has(T.sourceUid)||A.set(T.sourceUid,[]),A.get(T.sourceUid).push(T));return{pack:l,analytic:y,unmatched:p,lowerMs:g,zOffset:f,operations:vo(l.header),overlay:null,netIds:S,featuresBySource:A,barrelOperations:E}}function _o(e,t){let a=e.pack.binding(t)?.source_uid,s=a?e.featuresBySource?.get(a)||[]:[],r=e.netIds?.[t]||0,n=s.find(i=>Number(i.netId)===r)||s[0];return n?Number(n.id):0}function th(e,t){if(!t)return e.analytic.clearOverlay(),e.overlay=null,null;if(t.kind==="operation_values"){let a=Mo(t.values,e.operations),s=t.range||Ca(a);e.analytic.setOperationValues(a,s),e.overlay={...t,values:a,range:s}}else if(t.kind==="field_tiles"){let a=zf(t.tiles),s=t.range||Ca([...a.values()].flatMap(r=>[...Ca(r.values)]));e.analytic.setFieldRasters(a,s),e.overlay={...t,range:s,slices:[...a.keys()]}}else if(t.kind==="field_grid"){let a=on(t.grid),s=t.range||Ca([...a.values()].flatMap(n=>[...Ca(n.values)])),r=t.values?Mo(t.values,e.operations):null;e.analytic.setFieldRasters(a,s,r),e.overlay={kind:t.kind,quantity:t.quantity,units:t.units,range:s,slices:[...a.keys()],barrels:r}}else throw new TypeError(`unknown analytic overlay kind ${t.kind}`);return{kind:t.kind,range:e.overlay.range}}function Io(e,t,a=!1){let[s,r]=Array.isArray(e.pitchMm)?e.pitchMm:[e.pitchMm,e.pitchMm],n=(t[0]-e.originMm[0])/s-.5,i=(t[1]-e.originMm[1])/r-.5,o=(x,g)=>x<0||g<0||x>=e.width||g>=e.height?NaN:e.values[g*e.width+x],[c,l]=[Math.floor(n),Math.floor(i)],[f,u]=[n-c,i-l],p=o(c,l),b=o(c+1,l),h=o(c,l+1),d=o(c+1,l+1);return[p,b,h,d].every(Number.isFinite)?(p*(1-f)+b*f)*(1-u)+(h*(1-f)+d*f)*u:a?NaN:o(Math.floor(n+.5),Math.floor(i+.5))}function wv(e,t,a){let[s,r]=Array.isArray(e.pitchMm)?e.pitchMm:[e.pitchMm,e.pitchMm],n=(t[0]-e.originMm[0])/s-.5,i=(t[1]-e.originMm[1])/r-.5,o=NaN,c=1/0;for(let l=Math.floor(i)-a+1;l<=Math.floor(i)+a;l+=1)for(let f=Math.floor(n)-a+1;f<=Math.floor(n)+a;f+=1){if(f<0||l<0||f>=e.width||l>=e.height)continue;let u=e.values[l*e.width+f],p=(f-n)**2+(l-i)**2;Number.isFinite(u)&&p<c&&([o,c]=[u,p])}return o}var Qf=48,vv=70,Zf=2e-6,Mv=.95;function kv(e,t,a,{spacingMm:s=null,floor:r=.001,density:n=vv,width:i=.07,minLength:o=.3}={}){let c=e.filter(m=>m.role==="copper"&&t.has(m.key)&&a.has(m.key)&&m.face===(m.bottom?"bottom":"top"));if(!c.length)return{data:new ArrayBuffer(0),count:0,spacingMm:0,max:0,reference:0};let l=c.reduce((m,v)=>[Math.min(m[0],v.bounds[0]),Math.min(m[1],v.bounds[1]),Math.max(m[2],v.bounds[2]),Math.max(m[3],v.bounds[3])],[1/0,1/0,-1/0,-1/0]),f=s||Math.max(l[2]-l[0],l[3]-l[1])/n,u=[];for(let m of c){let[v,E]=[t.get(m.key),a.get(m.key)],[S,A,T,_]=m.bounds;for(let R=l[0]+Math.ceil((S-l[0])/f)*f+f/2;R<=T;R+=f)for(let N=l[1]+Math.ceil((A-l[1])/f)*f+f/2;N<=_;N+=f){let B=Io(v,[R,N],!0),F=Io(E,[R,N],!0),K=Math.hypot(B,F);K>0&&u.push({face:m,x:R,y:N,jx:B,jy:F,size:K})}}let p=u.map(m=>m.size).sort((m,v)=>m-v),b=p.length?p[p.length-1]:0,h=p.length?p[Math.min(p.length-1,Math.floor(Mv*p.length))]:0,d=u.filter(m=>m.size>=r*h),x=new ArrayBuffer(d.length*Qf),g=new Float32Array(x),y=new Uint32Array(x);return d.forEach((m,v)=>{let E=v*(Qf/4),[S,A]=m.face.offsetLayers||[m.face.layerId,m.face.layerId],T=m.face.bottom?-Zf:Zf,_=Math.min(1,m.size/h),R=.9*f*(o+(1-o)*Math.sqrt(_))/1e3;g.set([m.x/1e3,-m.y/1e3,m.face.z+T,i*f/1e3,m.jx/m.size,-m.jy/m.size,R,_],E),y.set([S,A,0,0],E+8)}),{data:x,count:d.length,spacingMm:f,max:b,reference:h}}function Ro(e,t){if(!t)return e.analytic.setArrows(null),e.vectors=null,e.vectorInput=null,null;let a=e.analytic.style,s=kv(e.analytic.slices,on(t.x),on(t.y),{density:a.arrowDensity,width:a.arrowWidth,minLength:a.arrowMinLength});return e.analytic.setArrows(s),e.vectorInput=t,e.vectors={quantity:t.quantity,units:t.units,max:s.max,reference:s.reference,spacingMm:s.spacingMm},{count:s.count,max:s.max,reference:s.reference,spacingMm:s.spacingMm}}function ah(e,t){let a=e.analytic.style,s=e.analytic.setStyle(t);return["arrowDensity","arrowWidth","arrowMinLength"].some(n=>a[n]!==s[n])&&e.vectorInput&&Ro(e,e.vectorInput),s}function sh(e,t){for(let a of e?.chunks||[]){let s=Number(a.first_operation_index);if(t>=s&&t<s+Number(a.operation_count||0))return a.slice_key}return null}function ln(e,t,a,s=null,r=null,n=0){let i=null;for(let o of e.analytic.slices){if(!o.field||Math.abs(t.direction[2])<1e-12||s&&o.key!==s||r&&!r.has(Number(o.layerId)))continue;let[c,l]=o.offsetLayers||[o.layerId,o.layerId],f=o.z+.5*((a?.[c]||0)+(a?.[l]||0)),u=(f-t.origin[2])/t.direction[2];if(!s&&!(u>0)||i&&u>=i.t)continue;let p=[t.origin[0]+u*t.direction[0],t.origin[1]+u*t.direction[1],f],b=[p[0]*1e3,-p[1]*1e3],h=Io(o.field,b);!Number.isFinite(h)&&n>0&&(h=wv(o.field,b,n)),Number.isFinite(h)&&(i={t:u,value:h,sliceKey:o.key,boardMm:b,world:p})}return i&&{value:i.value,sliceKey:i.sliceKey,boardMm:i.boardMm,world:i.world}}function No(e,t,a=null){let s=e.overlay,r=s?.kind==="operation_values"?s.values[t]:s?.barrels?.[t],n=s?.kind!=="operation_values"&&Number.isFinite(r)&&(!e.barrelOperations||e.barrelOperations.has(t)),i=s?.kind==="operation_values"||n?r:a?.value;return n&&(a={...a,sliceKey:"via barrel"}),{operationIndex:t,featureId:_o(e,t)||null,binding:e.pack.binding(t),...Number.isFinite(i)?{value:i,quantity:s.quantity,units:s.units}:{},...a?{sliceKey:a.sliceKey,boardMm:a.boardMm,world:a.world}:{}}}var rh=512*1024*1024,Ev=.65,Sv=1.5,Tv=15e3,Av=120,Iv=12,_v=48,vh=230,qo=document,St,j,Fe,mn,yn,xn,ja,Cn,pt,un,Rs,ht,nt,we,De,fn,wn,Ns,Be,te,Bn,Fn,Le,Fa,fa,Ye,Et,vn,Oa,Y=e=>qo.querySelector(e),ua=e=>qo.querySelectorAll(e);function Mh(e=document){qo=e,St=Y("#app"),j=Y("#viewport"),Fe=Y("#schematic-viewport"),mn=Y("#schematic-dom-layer"),yn=Y("#schematic-flow-overlay"),xn=Y("#bom-view"),ja=Y("#status")||{set textContent(t){}},Cn=Y("#viewer-kind")||{set textContent(t){}},pt=Y("#selection")||{set textContent(t){}},un=Y("#diagnostics")||{set innerHTML(t){}},Rs=Y("#scene-stats"),ht=Y("#lod-tuning"),nt=Y("#layers"),we=Y("#search-controls"),De=Y("#view-controls"),Le=Y("#stackup-workspace-view"),fn=Y("#fallback"),wn=Y("#panel-labels"),Ns=Y("#schematic-labels"),Be=Y("#axis-gizmo"),te=Y("#selection-card"),Bn=Y("#primary-heading"),Fn=Y("#primary-description"),Fa=Y("#mode-switch"),fa=Y("#system-labels"),Ye=Y("#move-gizmo"),Et=Y("#system-help"),vn=Y("#system-harnesses"),Oa=Y("#harness-nodes"),Oa?.addEventListener("pointermove",t=>pb(t)),Oa?.addEventListener("pointerup",t=>gb(t)),St.classList.add("workspace-pcb")}var Rv=["soldermask","silkscreen","paste"],Nv=Object.freeze([{role:"soldermask",side:"front",name:"F.Mask"},{role:"soldermask",side:"back",name:"B.Mask"},{role:"silkscreen",side:"front",name:"F.SilkS"},{role:"silkscreen",side:"back",name:"B.SilkS"},{role:"paste",side:"front",name:"F.Paste"},{role:"paste",side:"back",name:"B.Paste"}]),Cv={soldermask:"#1f6b45",silkscreen:"#f2f2f2",paste:"#a0a3a8"};function kh(){return{workspace:"pcb",clickSelect:!0,mode:"3d",activeNetId:0,selectedFeatureId:0,selectedOccurrence:0,selectionAnchor:null,showBoard:!0,showComponents:!0,showPlaceholders:!0,realisticColors:!0,hiddenBoardLayers:[],isolateNet:!1,savedShowBoard:!0,savedShowComponents:!0,preIsolationShowBoard:null,separation:0,dragging:!1,dragMode:"orbit",lastX:0,lastY:0,pointerStartX:0,pointerStartY:0,frameCpuMs:0,frameCpuP95Ms:0,frameIntervalMs:0,frameIntervalP95Ms:0,frameSamples:[],fps:0,frames:0,fpsAt:performance.now(),activeTab:"layers",selectedPageId:"",selectedSchematicFeature:null,schematicDragging:!1,schematicLastX:0,schematicLastY:0,schematicStartX:0,schematicStartY:0}}function Ps(e={}){return{key:e.key??"board",topology:e.topology||window.__TOPOLOGY__||{},semanticGeometry:e.semanticGeometry||window.__SEMANTIC_GEOMETRY__||{},viewerReadiness:e.readiness||{stage:"semantic-ready",progress:100},assetCache:e.assetCache||null,deferComponents:!!e.deferComponents,scene:Bv(),renderer:null,compareLayers:new Set,desiredCompareLayers:new Set,visible3dLayers:new Set,preIsolation3dLayers:null,preIsolationCompareLayers:null,highlightedNetIds:new Set,hiddenComponents:new Set,hiddenComponentRequest:null,loadedBytes:0,triangles:0,residentTileBytes:0,residentTileGpuBytes:0,residentTileTriangles:0,tileLoads:0,tileEvictions:0,tileSchedulerMs:0,lastTileScheduleAt:0,visibleTileIds:new Set,gpuBytes:0}}function Bv(){return{manifest:null,manifestUrl:"",layers:[],copperLayers:[],nets:[],features:new Map,tiles:new Map,loaded:new Set,loading:new Map,failed:new Map,residentTiles:new Map,componentFeatures:new Map,componentModelCounts:new Map,componentTier:"idle",componentEntries:[],componentsWantedAt:0,componentEvictions:0,runtimeBounds:null,layerZOffsets:new Float32Array(256),layerZOffsetSignature:""}}function Eh(){return{key:"",started:0,from:new Map,current:new Map}}function Sh(){return{phase:"idle",previous:new Set,target:new Set,previousOffsets:new Map,started:0}}function Th(){return{manifest:null,manifestUrl:"",pages:[],byId:new Map,activeNetUid:"",visiblePages:[],fitted:!1,rendererMode:new URLSearchParams(location.search).get("schematicRenderer")||"svg-dom",domFallbackReason:""}}var M=kh(),k=Ps(),w=null,Ie=Eh(),W=Sh(),D=Th(),Mn=[],Fv=5e3,Ov=5e3,C,Z,it,U,J,ha=new Map,Zt=performance.now(),ve=0,hn=0,js=null,kn=null,En=null,Co=!1,Ge=!1,On=()=>!0,Cs=!0;!window.__PRISM_SEMANTIC_VIEWER_MANUAL_BOOT__&&document.getElementById("app")&&Xo().catch(e=>{console.error(e),ja&&(ja.textContent="Renderer failed"),fn&&(fn.hidden=!1,fn.textContent=e.stack||e.message||String(e))});function Ah(e){let t=new Map((e.components||[]).map(s=>[s.uid,s])),a={};for(let s of e.terminals||[]){let r=s.net_uid;if(!r)continue;let n=t.get(s.component_uid)||{},i={designator:s.designator||n.designator||"",pin:s.pin||"",value:n.value||"",pcb_pad_id:s.pcb_pad_id||"",pcb_pad_source_uid:s.pcb_pad_source_uid||""};a[r]||(a[r]={terminals:[]});let o=a[r].terminals;o.some(c=>c.designator===i.designator&&c.pin===i.pin)||o.push(i)}return a}function Pv(e,t=k){if(!e||!t.scene?.features)return 0;let a=e.pcb_pad_source_uid||"";if(!a&&e.pcb_pad_id&&(a=(t.topology?.physical_objects||[]).find(r=>r.uid===e.pcb_pad_id)?.source_ids?.[0]||""),!a)return 0;for(let[s,r]of t.scene.features.entries())if(r.sourceUid===a&&r.kind==="pad")return s;return 0}function Wo(e,t=k){return!e||!t.topology||!t.topology.components?null:t.topology.components.find(a=>a.designator===e)}function dn(e,t){for(let a of Object.keys(e))delete e[a];Object.assign(e,t)}function Ih(){if(hn&&(cancelAnimationFrame(hn),hn=0),window.removeEventListener("keydown",qb),w){for(let e of w.boards.values())e.abort?.abort();w.scene.dispose(),w=null}else Oo(),k.renderer?.dispose?.();k.renderer=null,C=null,Z?.dispose?.(),Z=null,it=null,js=null,On=()=>!0,Cs=!0}function _h(){return ve+=1,Ih(),dn(M,kh()),k=Ps(),dn(Ie,Eh()),dn(W,Sh()),dn(D,Th()),Mn=[],U=null,J=null,ha=new Map,Zt=performance.now(),ve}function Rh(e){e===ve&&(ve+=1,Ih())}function Bs(e){e===ve&&(hn=requestAnimationFrame(t=>eM(t,e)))}function he(e){return e===ve}async function Xo(e={}){let t=_h(),a={};if(k.topology=e.topology||window.__TOPOLOGY__||{},k.topology&&!k.topology.net_details&&(k.topology.net_details=Ah(k.topology)),k.semanticGeometry=e.semanticGeometry||window.__SEMANTIC_GEOMETRY__||{},k.viewerReadiness=e.readiness||k.semanticGeometry.readiness||{stage:"semantic-ready",progress:100},js=typeof e.onSelectionChange=="function"?e.onSelectionChange:null,En=typeof e.onContextMenu=="function"?e.onContextMenu:null,kn=typeof e.onViewStateChange=="function"?e.onViewStateChange:null,On=typeof e.isActive=="function"?e.isActive:()=>!0,Cs=e.workspaceScope!=="3d",k.assetCache=e.assetCache||null,M.gpuBudgetBytes=tn,Mh(e.root||document),!St||!j)throw new Error("Semantic viewer shell is missing required DOM nodes");return await Dv(t,a,e.onPerformanceEvent),{performance:a,...Nh(),selectOccurrence:Lv,setHighlightedNetIds(s){k.highlightedNetIds=s,k.renderer?.setEmphasizedNetIds(s)},refreshResidency(){Me(performance.now(),{force:!0})},resize(){k.renderer?.resize(),C?.resize(),M.workspace==="pcb"&&M.mode==="layer"&&dc()},setWorkspace(s){let r=s==="stackup"?"stackup":"pcb";M.workspace!==r&&zb(r)},setHiddenComponents:Db,getComponentReferences(){return[...k.scene.componentFeatures.keys()]},async loadAnalyticPack(s,r={}){return k.renderer?(Oo(),k.analytic=await eh({renderer:k.renderer,layers:k.scene.layers,colorFor:n=>{let i=lc(n,k);return i.length>=4?i.slice(0,4):[...i,1]},bytes:s,wasm:r.wasm,toleranceNm:r.toleranceNm,nets:k.scene.manifest?.nets,features:k.scene.manifest?.objectFeatures,boardZOffsetMm:k.scene.manifest?.boardZOffsetMm}),nh()):null},setAnalyticOverlay(s){return k.analytic?th(k.analytic,s):null},setAnalyticVectors(s){return k.analytic?Ro(k.analytic,s):null},setAnalyticStyle(s){return k.analytic?ah(k.analytic,s):null},analyticColormaps(){return{colormaps:ho,defaults:ys}},setClickSelect(s){M.clickSelect=s!==!1},analyticProbe(s,r){if(!k.analytic?.overlay||k.analytic.overlay.kind==="operation_values")return null;let n=mh(s,r);if(!n)return null;let i=M.mode==="3d"?k.visible3dLayers:null,o=ln(k.analytic,n,_n(),null,i,1);if(!o)return null;let{quantity:c,units:l}=k.analytic.overlay;return{value:o.value,quantity:c,units:l,sliceKey:o.sliceKey,boardMm:o.boardMm,world:o.world,marker:gh(o.world)}},async analyticAt(s,r){if(!k.analytic)return null;let n=await Vb(s,r);if(n?.kind!=="analytic")return null;let i=mh(s,r);if(!i||k.analytic.overlay?.kind==="operation_values")return No(k.analytic,n.operationIndex);let o=_n(),c=sh(k.analytic.pack.header,n.operationIndex),l=c&&ln(k.analytic,i,o,c)||ln(k.analytic,i,o),f=No(k.analytic,n.operationIndex,l);return l?{...f,marker:gh(l.world)}:f},analyticStats:nh,unloadAnalyticPack(){Oo()},setLodOverride(s){k.renderer?.setLodOverride(s)},projectComponent(s){return Hb(k,s,r=>da(r,$e))},projectPoint(s){return da(s,$e)},setViewMode:Nb,renderInset:aM,insetReady:Sb,releaseInset(s){Os.release(s)},insetBoard:()=>({scene:k.scene,topology:k.topology}),onSceneChange(s){return In.add(s),()=>In.delete(s)},insetStats(){return{...bn,views:Os.size,targets:[se.width,se.height]}},insetSettings(s){return Object.assign(Ko,s||{}),{...Ko}},gpuIdle(){return k.renderer?.device.queue.onSubmittedWorkDone()??Promise.resolve()},dispose(){jv(),Rh(t)}}}function nh(){let e=k.analytic;return e?{operations:e.operations,lowerMs:e.lowerMs,zOffset:e.zOffset,unmatched:e.unmatched,...e.analytic.stats()}:null}function Oo(){k.renderer?.setAnalytic(null),k.analytic?.pack.free(),k.analytic=null}function Nh(){return{nets:()=>k.scene.nets,quietly(e){Ge=!0;try{e()}finally{Ge=!1}},selectNet:bc,selectFeature:ya,selectComponent:pc,clearSelection:Oe,anyEmphasis:Ka,showNetProbe:Yo,restoreVisibility:Ph,isolating:()=>M.isolateNet,isolateLitNets:za,setNetIsolation:Ha,setGpuBudget(e){M.gpuBudgetBytes=e;for(let t of w?w.boards.values():[k])t.tiersCheckedAt=0},setStatsOverlay:$h,stats:Xh,pickAt(e,t){return Vb(e,t)},getViewState:Ch,setLayerVisible:Cb,applyLayerPreset:Bb,setShowBoard:Fb,setShowComponents:Ob,setShowPlaceholders:yM,setRealisticColors:vM,setBoardLayerVisible:wM,setSeparation:Pb,showNetLayers:hc}}function jv(){se.depth?.destroy(),Object.assign(se,{canvas:null,context:null,depth:null,depthView:null,width:0,height:0}),Os.clear(),In.clear(),Pa=null}function At(){!kn||Co||(Co=!0,queueMicrotask(()=>{Co=!1,kn?.(Ch())}))}function Ch(){let e=M.mode==="3d"?k.visible3dLayers:k.desiredCompareLayers;return{mode:M.mode,layers:k.scene.copperLayers.map(t=>({id:Number(t.id),name:String(t.name),color:Vn(Kn(t)),visible:e.has(Number(t.id))})),boardLayers:xM(),showBoard:M.showBoard,showComponents:M.showComponents,showPlaceholders:M.showPlaceholders,realisticColors:M.realisticColors,separation:w?w.separation.get(Fs())||0:M.separation,isolateNet:M.isolateNet,hasNet:!!M.activeNetId||Ka(),...w?{boards:v1(),selectedBoard:Fs()}:{}}}function Pn(e){if(w?.move.enabled&&Ds(),Ge)return;let t=k.renderer&&!k.renderer.identityOnly?k.renderer.occurrenceKeys[M.selectedOccurrence]:null;js?.(e&&t!=null?{...e,occurrence:t}:e)}function Lv(e){let t=k.renderer?.occurrenceKeys.indexOf(String(e))??-1;t>=0&&(M.selectedOccurrence=t)}function $o(e){if(!e||!k.renderer||k.renderer.identityOnly)return e;let t=k.renderer.occurrenceMatrices[M.selectedOccurrence];return t?xt(t,e):e}function Bh(e,t=null){return e?{kind:"net",sourceContext:"3D",netName:String(e.name||""),netUid:String(e.uid||"")||void 0,netCode:Number(e.id||0)||void 0,featureId:Number(t?.id||0)||void 0,uuid:String(t?.sourceUid||"")||void 0}:null}function Fh(e,t=k){if(!e)return null;let a=Ga(e),s=String(e.padNumber||e.pin||e.pinNumber||""),r=t.scene.nets.find(n=>Number(n.id)===Number(e.netId||0));if(a&&s)return{kind:"terminal",sourceContext:"3D",reference:a,pin:s,netUid:r?.uid,netName:r?.name,netCode:r?Number(r.id):void 0,uuid:String(e.sourceUid||"")||void 0,featureId:Number(e.id||0)||void 0};if(a){let n=Wo(a,t);return{kind:"component",sourceContext:"3D",reference:a,componentUid:n?.uid,uuid:String(e.sourceUid||"")||void 0,featureId:Number(e.id||0)||void 0}}return Bh(r,e)}function Oh(){M.showBoard=!0,M.showComponents=!0,ma(),typeof Pe=="function"&&Pe()}function Ka(){return La().size>0||!!w?.emphasisSets.length}function La(){let e=new Set(k.highlightedNetIds);return M.activeNetId&&e.add(Number(M.activeNetId)),e}function Yo(){(M.showBoard||M.showComponents)&&(M.savedShowBoard=M.showBoard,M.savedShowComponents=M.showComponents),M.showBoard=!1,M.showComponents=!1,ma(),typeof Pe=="function"&&Pe()}function Ph(){M.showBoard=M.savedShowBoard!==!1,M.showComponents=M.savedShowComponents!==!1,ma(),typeof Pe=="function"&&Pe()}async function jh(e,t,a={}){let s=e.semanticGeometry.assets?.scene_manifest||e.semanticGeometry.semantic_gltf?.path,r=performance.now();if(s){if(e.scene.manifestUrl=new URL(s,location.href).toString(),e.scene.manifest=await Gv(e.scene.manifestUrl,e),a.scene_manifest_fetch_parse_ms=performance.now()-r,!he(t))return!1;if(e.scene.manifest.schema!=="prism.semantic_gltf_a0")throw new Error(`Unsupported scene schema: ${e.scene.manifest.schema}`)}else e.scene.manifest={schema:"prism.semantic_gltf_partial.a0",bbox:null,layers:[],nets:[],objectFeatures:[],components:[],tiles:[],barrels:[]},a.scene_manifest_fetch_parse_ms=0;r=performance.now(),e.scene.layers=e.scene.manifest.layers||[],e.scene.copperLayers=e.scene.layers.filter(i=>i.role==="copper"||String(i.name).endsWith(".Cu")),e.scene.nets=e.scene.manifest.nets||[];for(let i of e.scene.manifest.objectFeatures||[])e.scene.features.set(Number(i.id),{...i,bounds:$a(i.boundsMm)});for(let i of e.scene.manifest.components||[])e.scene.componentFeatures.set(i.designator,i),e.scene.features.set(Number(i.featureId),{...i,kind:"component",sourceUid:i.uid,netId:0,bounds:null});for(let i of e.scene.manifest.tiles||[])e.scene.tiles.set(i.id,i);a.scene_manifest_index_ms=performance.now()-r;let n=zh(e);for(let i of n)e.compareLayers.add(i),e.desiredCompareLayers.add(i);for(let i of e.scene.copperLayers)e.visible3dLayers.add(Number(i.id));return!0}async function Dv(e,t={},a=null){let s=performance.now();if(!await jh(k,e,t))return;let r=performance.now();if(k.renderer=await oa.create(j),t.webgpu_renderer_create_ms=performance.now()-r,!he(e)){k.renderer?.dispose?.(),k.renderer=null;return}k.renderer.setBarrels(_i(k.scene.manifest.barrels,k.scene.manifest.layers)),Gs(),r=performance.now();let n=await qh(e);if(t.board_fetch_parse_upload_ms=performance.now()-r,!he(e)||(k.scene.runtimeBounds=n||Qs(k.scene.manifest.bbox),U=new qa(k.scene.runtimeBounds),Cs&&(await Uv(e),!he(e)||(await zv(e),!he(e)))))return;r=performance.now(),uc(),Ub(),Cs&&(RM(),_M()),jb(),Xb(),t.controls_and_bindings_ms=performance.now()-r;let i={"board-ready":"Board ready \xB7 components and semantic layers are still generating","components-ready":"Board and components ready \xB7 semantic layers are still generating","semantic-ready":"WebGPU semantic glTF active"};if(ja.textContent=i[k.viewerReadiness.stage]||"Loading 3D assets",k.semanticGeometry.assets?.components_glb&&!k.deferComponents){let o=performance.now();xb(e).then(()=>{he(e)&&(Go(n),a?.({schema:"prism.semantic_viewer_performance.a0",milestone:"components-loaded",readiness_stage:k.viewerReadiness.stage,elapsed_ms:performance.now()-o,bytes_loaded:k.loadedBytes}))})}else Go(n);Me(performance.now(),{force:!0}),Bs(e),r=performance.now(),await new Promise(o=>requestAnimationFrame(o)),t.first_frame_wait_ms=performance.now()-r,t.boot_total_ms=performance.now()-s}async function Uv(e=ve){let t=k.semanticGeometry.assets?.schematic_native_manifest||k.semanticGeometry.schematic_vector?.path||k.semanticGeometry.schematic_scene?.path,a=k.semanticGeometry.assets?.schematic_manifest||k.semanticGeometry.schematic_world?.path,s=Y("[data-workspace=schematic]");if(!t&&!a){s.disabled=!0,s.title="No schematic world assets are available";return}let r=[t,a].filter(Boolean),n=null;for(let o of r)try{D.manifestUrl=new URL(o,location.href).toString();let c=await jr.create(Fe,D.manifestUrl);if(!he(e))return;C=c,C.setFlowOverlayCanvas(yn);break}catch(c){if(n=c,C=null,o===a)throw c}if(!C)throw n||new Error("Failed to load schematic viewer assets");D.manifest=C.manifest,D.pages=C.pages,D.byId=new Map(D.pages.map(o=>[o.id,o])),M.selectedPageId=D.pages[0]?.id||"",C.selectedPageId=M.selectedPageId,!["native","legacy","webgpu"].includes(String(D.rendererMode).toLowerCase())&&(Z=Ur.create(mn,D.manifestUrl,D.manifest,C.featuresByPage,{onSelect:pM,onBlank:zs,onHighlightNet:_b,onOpenPage:hM,onFallback:o=>{D.domFallbackReason=o,console.warn(o)}}),Z.preloadPages(D.pages)),C.preloadOverview()}async function zv(e=ve){let t=k.semanticGeometry.assets?.bom||k.semanticGeometry.bom?.path,a=Y("[data-workspace=bom]");if(!t){a&&(a.disabled=!0,a.title="No BoM artifact is available");return}try{let s=await Js.create(xn,new URL(t,location.href).toString(),{onSelectReference:r=>pc(r,!0)});if(!he(e))return;it=s}catch(s){if(!he(e))return;console.warn(s),a&&(a.disabled=!0,a.title=s?.message||"BoM artifact could not be loaded")}}async function Gv(e,t=k){if(t.assetCache)return t.assetCache.fetchJson(String(e));let a=await fetch(e,{cache:"default"});if(!a.ok)throw new Error(`Failed to load ${e}: ${a.status}`);return a.json()}function Kv(){return!w||w.timing.boardsDrawnAt!=null?!0:![...w.boards.values()].some(e=>e.loadState==="loading"||e.loadState==="waiting")}var Vv=24*1024*1024,la={bytes:0,waiting:null};async function Lh(e){for(;;){if(la.bytes===0||la.bytes+e<=Vv){la.bytes+=e,la.waiting??=new Promise(t=>requestAnimationFrame(()=>{la.bytes=0,la.waiting=null,t()}));return}await la.waiting}}async function Hv(e,t=ve,a=k){if(!he(t))return;let s=a.scene.residentTiles.get(e.id);if(s){s.lastUsed=performance.now();return}if(a.scene.failed.get(e.id))return;if(a.scene.loading.has(e.id))return a.scene.loading.get(e.id);let n=(async()=>{try{let i=await ts(new URL(e.path,a.scene.manifestUrl).toString(),{fetchBytes:An(a),fetchCache:"no-store"});if(!he(t)||!a.renderer||(await Lh(i.primitives.reduce((p,b)=>p+Po(b),0)),!he(t)||!a.renderer))return;a.loadedBytes+=i.byteLength;let o=a.scene.layers.find(p=>Number(p.id)===Number(e.layerId)),c=[],l=0,f=0;for(let p of i.primitives){let b=a.renderer.addPrimitive(p,{kind:"copper",tileId:e.id,layerId:Number(e.layerId),innerCopper:jn(Number(e.layerId),a),color:lc(o,a),stencilMark:Mb(o,a),baseZ:Number(o?.z_mm||0)/1e3,material:{baseColor:[1,1,1,1],metallic:.78,roughness:.32}});c.push(b),l+=p.indices.length/3,f+=Po(p)}let u={tile:e,entries:c,byteLength:i.byteLength,gpuBytes:f,triangles:l,lastUsed:performance.now(),pinned:!1};a.scene.residentTiles.set(e.id,u),a.scene.loaded.add(e.id),a.tileLoads+=1,a.residentTileBytes+=i.byteLength,a.residentTileGpuBytes+=f,a.residentTileTriangles+=l,a.triangles=a.residentTileTriangles,a.scene.failed.delete(e.id)}catch(i){if(!he(t))return;let o=a.scene.failed.get(e.id)||{count:0,message:""};a.scene.failed.set(e.id,{count:o.count+1,message:i?.message||String(i)}),o.count||console.warn(`Failed to load tile ${e.id}; suppressing retries until assets are regenerated`,i)}finally{he(t)&&a.scene.loading.delete(e.id)}})();return a.scene.loading.set(e.id,n),n}function Po(e){return tu(e.position.length/3,e.indices.length)}function Jo(e,t=k){let a=t.scene.residentTiles.get(e);a&&(t.renderer.removeEntries(a.entries),t.scene.residentTiles.delete(e),t.scene.loaded.delete(e),t.residentTileBytes=Math.max(0,t.residentTileBytes-a.byteLength),t.residentTileGpuBytes=Math.max(0,t.residentTileGpuBytes-a.gpuBytes),t.residentTileTriangles=Math.max(0,t.residentTileTriangles-a.triangles),t.triangles=t.residentTileTriangles,t.tileEvictions+=1)}function Me(e=performance.now(),t={},a=k){if(!a.renderer||!U||M.workspace!=="pcb")return;let s=M.mode==="layer"&&W.phase==="preload";if(!t.force&&!s&&e-a.lastTileScheduleAt<Av)return;let r=performance.now();a.lastTileScheduleAt=e;let n=qv(a);a.visibleTileIds=n;let i=a.scene.loading.size,c=Math.max(0,(s?_v:Iv)-i),l=[...n].map(u=>a.scene.tiles.get(u)).filter(u=>u&&!a.scene.residentTiles.has(u.id)&&!a.scene.loading.has(u.id)&&!a.scene.failed.has(u.id)).sort((u,p)=>oh(u,a)-oh(p,a)).slice(0,c),f=ve;for(let u of l)Hv(u,f,a);for(let u of n){let p=a.scene.residentTiles.get(u);p&&(p.lastUsed=e)}Kh(n,void 0,a),$v(n,e,a),Xv(n,e,a),a.tileSchedulerMs=performance.now()-r}function qv(e=k){let t=new Set,a=M.mode==="3d"?e.visible3dLayers:Yv();if(!a.size||!J)return t;if(M.mode==="layer"){for(let c of e.scene.tiles.values())a.has(Number(c.layerId))&&t.add(c.id);return t}let s=new Set,r=tc(e);if(r.size){for(let c of e.scene.tiles.values())if(a.has(Number(c.layerId))){for(let l of r)if(Hh(c,l)){s.add(c.id);break}}}let n=Qo(e),i=[J.matrix,...Wv(),...e===k?Os.active(performance.now()):[]],o=0;for(let c of e.scene.tiles.values()){if(!a.has(Number(c.layerId))||n&&jn(Number(c.layerId),e))continue;let l=M.mode==="layer"?ha.get(Number(c.layerId)):null;i.some(f=>Sn(c,f,l,Ev,e))&&t.add(c.id),!e.scene.residentTiles.has(c.id)&&Sn(c,J.matrix,l,0,e)&&(o+=1)}for(let c of s)t.add(c);return e.visibleTileMisses=o,t}function Wv(){if(!U?.moving?.()||M.mode==="layer")return[];let e=performance.now();return Is.at===e||(Is.at=e,Is.views=[0,1].map(t=>U.targetMatrix(j.width,j.height,!1,t))),Is.views}var Is={at:-1,views:[]};function Xv(e,t,a){if(M.mode==="layer"||!J)return;let s=Qo(a);for(let r of[...a.scene.residentTiles.values()]){if(e.has(r.tile.id)||a.scene.loading.has(r.tile.id))continue;let n=Number(r.tile.layerId);if(a.visible3dLayers.has(n)&&!(s&&jn(n,a))&&Sn(r.tile,J.matrix,null,Sv,a)){r.lastUsed=t;continue}t-r.lastUsed>Tv&&Jo(r.tile.id,a)}}function Dh(e,t){return e?"all":t?"lit":"none"}function Qo(e){return!!e.renderer&&e.renderer.innerCopperMode!=="all"}function $v(e,t,a){if(Qo(a))for(let s of[...a.scene.residentTiles.values()])e.has(s.tile.id)||a.scene.loading.has(s.tile.id)||jn(Number(s.tile.layerId),a)&&t-s.lastUsed>Ov&&Jo(s.tile.id,a)}function Yv(){return M.mode!=="layer"||W.phase==="idle"?k.compareLayers:Gh(W.previous,W.target)}function Uh(){return M.mode!=="layer"?k.visible3dLayers:W.phase==="reveal"?Gh(W.previous,W.target):k.compareLayers}function zh(e=k){let t=e.scene.copperLayers.map(a=>Number(a.id)).filter(Number.isFinite);return t.length?t.length===1?new Set([t[0]]):new Set([t[0],t[t.length-1]]):new Set}function Jv(){let e=k.desiredCompareLayers.size?k.desiredCompareLayers:k.compareLayers;return e.size?new Set([...e].map(Number)):zh()}function Gh(...e){let t=new Set;for(let a of e)for(let s of a||[])t.add(Number(s));return t}function Kh(e,t=rh,a=k){if(M.mode==="layer")return;let s=Math.min(rh,t);if(a.residentTileGpuBytes<=s)return;let r=[...a.scene.residentTiles.values()].filter(n=>!e.has(n.tile.id)&&!a.scene.loading.has(n.tile.id)).sort((n,i)=>n.lastUsed-i.lastUsed);for(let n of r){if(a.residentTileGpuBytes<=s)break;Jo(n.tile.id,a)}}function Sn(e,t,a=null,s=0,r=k){let n=Vh(e,r);if(!n)return!0;let i=Math.max(n[3]-n[0],n[4]-n[1])*s,o=[n[0]-i+(a?.[0]||0),n[1]-i+(a?.[1]||0),n[2]-.002,n[3]+i+(a?.[0]||0),n[4]+i+(a?.[1]||0),n[5]+.002],c=r.renderer?.occurrenceMatrices;return!c||c.length===1&&wr(c[0])?ih(o,t):c.some(l=>ih(o,aa(t,l)))}function Vh(e,t=k){let a=e.boundsMm;if(!a||a.length!==4)return null;let s=t.scene.layers.find(n=>Number(n.id)===Number(e.layerId)),r=Number(s?.z_mm||0)/1e3;return[a[0]/1e3,-a[3]/1e3,r-4e-4,a[2]/1e3,-a[1]/1e3,r+4e-4]}function ih(e,t){let a=[[e[0],e[1],e[2]],[e[3],e[1],e[2]],[e[0],e[4],e[2]],[e[3],e[4],e[2]],[e[0],e[1],e[5]],[e[3],e[1],e[5]],[e[0],e[4],e[5]],[e[3],e[4],e[5]]].map(r=>Qv(t,r));return![r=>r[0]<-r[3],r=>r[0]>r[3],r=>r[1]<-r[3],r=>r[1]>r[3],r=>r[2]<0,r=>r[2]>r[3]].some(r=>a.every(r))}function Qv(e,t){let a=t[0],s=t[1],r=t[2];return[e[0]*a+e[4]*s+e[8]*r+e[12],e[1]*a+e[5]*s+e[9]*r+e[13],e[2]*a+e[6]*s+e[10]*r+e[14],e[3]*a+e[7]*s+e[11]*r+e[15]]}function Hh(e,t){return Array.isArray(e.netIds)&&e.netIds.some(a=>Number(a)===Number(t))}function oh(e,t=k){let a=Vh(e,t);if(!a||!U)return 0;let s=(a[0]+a[3])*.5-U.focus[0],r=(a[1]+a[4])*.5-U.focus[1];return s*s+r*r}async function qh(e=ve,t=k){let a=t.semanticGeometry.assets?.base_board_glb;if(!a)return null;let s=t.semanticGeometry.assets?.soldermask_glb,[r,n]=await Promise.all([ts(new URL(a,location.href).toString(),{defaultFeatureId:0,fetchBytes:An(t)}),s?ts(new URL(s,location.href).toString(),{defaultFeatureId:0,fetchBytes:An(t)}).catch(o=>(console.warn("[prism-semantic-viewer] solder mask failed to load",o),null)):null]);if(!he(e)||!t.renderer)return null;t.loadedBytes+=r.byteLength,n&&(t.loadedBytes+=n.byteLength);let i=[...r.primitives.filter(o=>{let c=ei(o);return c!=="pad"&&!(n&&c==="soldermask")}),...n?.primitives||[]];for(let o of Xa(i,ei)){let c=Rv.includes(o.groupKey);t.renderer.addPrimitive(o,{kind:"board",boardRole:o.groupKey,...c?{side:Tc(o)}:{},layerId:o.groupKey==="paste"?X1(o,t):0,material:o.material,color:o.material.baseColor})}return t.renderer.setHiddenBoardLayers(M.hiddenBoardLayers),wa(i.map(o=>o.bounds))}function ba(e=k){return e.scene.runtimeBounds||Qs(e.scene.manifest?.bbox)}function jn(e,t=k){return Ic(e,t.scene.copperLayers)}function Wh(e,t){let{back:a}=U.basis();return{eye:Ee(U.focus,pe(a,U.distance)),orthographic:t,pixelScale:t?e/Math.max(1e-9,U.orthoScale):e/2/Math.tan(U.fov/2)}}function Xh(){if(w)return Zv();let e=k.renderer?.cullCounts||{full:0,board:0,body:0,box:0,culled:0},t=!k.renderer||k.renderer.identityOnly;return{occurrences:k.renderer?.occurrenceMatrices.length||0,lod:t?{full:1,board:0,body:0,box:0,culled:0}:{...e},triangles:k.renderer?.frameStats.triangles||0,draws:k.renderer?.frameStats.draws||0,gpuMemoryBytes:k.renderer?.gpuMemoryBytes()||0,gpuBreakdown:k.renderer?.gpuMemoryBreakdown()||null,gpuBudgetBytes:M.gpuBudgetBytes,componentTier:k.scene.componentTier,componentEvictions:k.scene.componentEvictions,tileEvictions:k.tileEvictions,visibleTileMisses:k.visibleTileMisses||0,cache:k.assetCache?k.assetCache.summary():{enabled:!1},frameIntervalMs:M.frameIntervalMs,frameIntervalP95Ms:M.frameIntervalP95Ms,frameCpuMs:M.frameCpuMs,frameCpuP95Ms:M.frameCpuP95Ms,fps:M.fps}}function Zv(){let e=Je(),t=e.map(a=>a.scene.componentTier);return{occurrences:w.scene.occurrenceCount||0,lod:w.scene.cullCounts(),triangles:w.scene.frameStats.triangles,draws:w.scene.frameStats.draws,gpuMemoryBytes:w.scene.gpuMemoryBytes(),gpuBreakdown:w.scene.gpuMemoryBreakdown(),gpuBudgetBytes:M.gpuBudgetBytes,componentTier:`${t.filter(a=>a==="loaded").length}/${e.length} loaded`,componentEvictions:e.reduce((a,s)=>a+s.scene.componentEvictions,0),tileEvictions:e.reduce((a,s)=>a+s.tileEvictions,0),visibleTileMisses:e.reduce((a,s)=>a+(s.visibleTileMisses||0),0),componentMisses:e.filter(a=>a.renderer.cullCounts.full>0&&a.scene.componentTier!=="loaded"&&a.semanticGeometry.assets?.components_glb).length,cache:e.find(a=>a.assetCache)?.assetCache.summary()||{enabled:!1},frameIntervalMs:M.frameIntervalMs,frameIntervalP95Ms:M.frameIntervalP95Ms,frameCpuMs:M.frameCpuMs,frameCpuP95Ms:M.frameCpuP95Ms,fps:M.fps,firstFrame:w.timing.boardsDrawnAt==null?null:{sinceSceneMs:w.timing.boardsDrawnAt-w.timing.descriptorAt,sinceNavigationMs:w.timing.boardsDrawnAt}}}function $h(e){M.showStats=!!e,Rs&&(Rs.hidden=!M.showStats),ht&&(ht.hidden=!(M.showStats&&w)),M.showStats&&w&&s1(),Yh()}var jo="prism.systemScene.lodThresholds",e1=Object.freeze([{key:"fullPx",label:"Parts",max:600},{key:"boardPx",label:"Copper",max:400},{key:"boxPx",label:"Box below",max:120}]);function t1(){try{let e=JSON.parse(globalThis.localStorage?.getItem(jo)||"null");if(e&&typeof e=="object")return ka(e)}catch{}return{...rt}}function a1(e){try{e?globalThis.localStorage?.setItem(jo,JSON.stringify(e)):globalThis.localStorage?.removeItem(jo)}catch{}}function Lo(e){if(!w)return null;let t=e==null?{...rt}:{...w.scene.lodThresholds,...e},a=w.scene.setLodThresholds(t);return a1(e==null?null:a),Do(),a}function s1(){if(!ht||ht.childElementCount)return Do();let e=document.createElement("h2");e.textContent="Detail thresholds (CSS px)",ht.append(e);for(let a of e1){let s=document.createElement("label"),r=document.createElement("span");r.textContent=a.label;let n=document.createElement("input");Object.assign(n,{type:"range",min:"0",max:String(a.max),step:"1"}),n.dataset.key=a.key;let i=document.createElement("output");n.addEventListener("input",()=>Lo({[a.key]:Number(n.value)})),s.append(r,n,i),ht.append(s)}let t=document.createElement("button");t.type="button",t.textContent="Defaults",t.addEventListener("click",()=>Lo(null)),ht.append(t),Do()}function Do(){if(!ht||!w)return;let e=w.scene.lodThresholds;for(let t of ht.querySelectorAll("input[data-key]"))t.value=String(e[t.dataset.key]),t.nextElementSibling.value=String(Math.round(e[t.dataset.key]))}function Yh(){if(!Rs||!M.showStats)return;let e=Xh(),{full:t,board:a,body:s,box:r,culled:n}=e.lod,i=[["Occurrences",`${e.occurrences} (${t+a+s+r} visible)`],["Detail",`${t} full \xB7 ${a} board \xB7 ${s} body \xB7 ${r} box \xB7 ${n} culled`],["Triangles",e.triangles.toLocaleString()],["Draws",e.draws.toLocaleString()],["GPU memory",`${(e.gpuMemoryBytes/1048576).toFixed(1)} / ${(e.gpuBudgetBytes/1048576).toFixed(0)} MB`],["Components",`${e.componentTier}${e.componentEvictions?` \xB7 ${e.componentEvictions} evicted`:""}`],["Cache",e.cache.enabled?`${e.cache.hits} hits \xB7 ${e.cache.misses} misses \xB7 ${(e.cache.bytes/1048576).toFixed(0)} MB`:"off"],["Frame",`${e.frameIntervalMs.toFixed(1)} ms \xB7 p95 ${e.frameIntervalP95Ms.toFixed(1)}`],["CPU",`${e.frameCpuMs.toFixed(2)} ms \xB7 p95 ${e.frameCpuP95Ms.toFixed(2)}`],["FPS",e.fps.toFixed(0)]];Rs.innerHTML=i.map(([o,c])=>`<dt>${o}</dt><dd>${c}</dd>`).join("")}var r1="prism.system_scene.a0";function Je(){return w?[...w.boards.values()].filter(e=>e.renderer&&e.loadState==="loaded"):[]}async function Jh(e={}){let t=_h();if(js=typeof e.onSelectionChange=="function"?e.onSelectionChange:null,En=typeof e.onContextMenu=="function"?e.onContextMenu:null,kn=typeof e.onViewStateChange=="function"?e.onViewStateChange:null,On=typeof e.isActive=="function"?e.isActive:()=>!0,Cs=!1,M.gpuBudgetBytes=tn,Mh(e.root||document),!St||!j)throw new Error("Semantic viewer shell is missing required DOM nodes");if(typeof e.loadBundle!="function")throw new Error("A system scene needs a bundle loader");let a=await Cr.create(j);return he(t)?(a.setLodThresholds(t1()),w={scene:a,loadBundle:e.loadBundle,onEmphasis:typeof e.onEmphasis=="function"?e.onEmphasis:null,onMove:typeof e.onMove=="function"?e.onMove:null,onHarness:typeof e.onHarness=="function"?e.onHarness:null,baseDescriptor:null,descriptor:null,move:T1(),gizmo:null,standInKey:null,showLabels:!0,harnesses:[],harnessLit:new Map,showHarnesses:!0,harnessDrawn:null,tubes:[],tubedHarnesses:new Set,harnessPick:null,worlds:new Map,nodePreview:null,housingModels:new Map,timing:{descriptorAt:null,boardsDrawnAt:null},boards:new Map,groups:new Map,placed:[],placements:new Map,hiddenLayers:new Map,separation:new Map,bounds:null,framed:!1,snapped:!1,boardSelected:!1,inputs:new Map,emphasisSets:[],emphasisBounds:new Map,emphasisReport:null},k=Ps({key:""}),U=new qa([-.1,-.1,-.01,.1,.1,.01]),uc(),Ub(),jb(),Xb(),ja.textContent="System scene",Bs(t),{...Nh(),focusPlacement:p1,selectBoardContext:yc,setEmphasisSets:M1,setSystemScene:n1,frameNetEmphasis:k1,frameAll(){w?.bounds&&U.frame(w.bounds)},setMoveAllowed:A1,setMoveMode:Tn,setMoveSpace:fb,previewPose:I1,cancelMove:ic,getMoveState:()=>w?ub():null,targetHarnessNode:Gn,selectHarness:G1,previewHarnessNode:K1,cancelHarnessNode:yb,getHarnessState:()=>w?mb():null,setLabelsVisible(s){w&&(w.showLabels=!!s,fa&&(fa.hidden=!w.showLabels))},setHelpVisible:bb,isHelpVisible:()=>!!(Et&&!Et.hidden),setHarnessesVisible(s){w&&(w.showHarnesses=!!s,w.harnessDrawn=null,Da({relabel:!1}))},frameBoard(s){let r=w?.placements.get(String(s));return r&&U.frame(r.worldBounds),!!r},frameParts:E1,resize(){w?.scene.resize()},setLodOverride(s){for(let r of Je())r.renderer.setLodOverride(s)},setLodThresholds:Lo,pickSurfaceAt:CM,focusMoveTarget:BM,viewAxis(s,r=!1){!w||!["x","y","z"].includes(s)||(U.setAxis(s,!!r),w.bounds&&U.frame(w.bounds))},projectPoint(s,r){return dh(s,r)},projectComponent(s,r){let n=w?.placements.get(String(r));return n?.board?Hb(n.board,s,i=>dh(i,r)):null},dispose(){Rh(t)}}):(a.dispose(),null)}function n1(e){if(!w)return;if(e?.schema!==r1)throw new Error(`Unsupported system scene schema: ${e?.schema||"missing"}`);w.baseDescriptor=e,w.timing.descriptorAt??=performance.now();let t=w.move.target?e.occurrences.find(s=>s.path===w.move.target):null;t?!w.move.drag&&lb(w.move.preview,t.pose)&&(w.move.preview=null):(w.move.drag=null,w.move.preview=null,w.move.target=null),w.descriptor=db(),w.harnesses=Array.isArray(e.harnesses)?e.harnesses:[],w.harnessDrawn=null;let a=new Set;for(let s of e.assets||[]){a.add(s.assetId);let r=w.boards.get(s.assetId),n=pf(r,s);if(n!=="create"){r.asset=s,n==="load"&&lh(r,ve);continue}r&&ch(s.assetId);let i=Ps({key:s.assetId,topology:{},semanticGeometry:{},deferComponents:!0});Object.assign(i,{asset:s,bundleUrl:s.bundleUrl,loadState:"waiting",abort:null}),w.boards.set(s.assetId,i),no(s)&&lh(i,ve)}for(let s of[...w.boards.keys()])a.has(s)||ch(s);Da(),V1(),w.move.enabled&&(Ds({quiet:!0}),gt("sync"))}function ch(e){let t=w.boards.get(e);t?.abort?.abort(),w.boards.delete(e),w.scene.removeAsset(e),t&&(t.renderer=null),k===t&&Zo()}async function lh(e,t){e.loadState="loading",e.abort=new AbortController;let a=()=>he(t)&&w?.boards.get(e.key)===e&&!e.abort.signal.aborted;try{let s=await w.loadBundle(e.bundleUrl,e.abort.signal);if(!a()||(e.topology=s.topology||{},e.topology.net_details||(e.topology.net_details=Ah(e.topology)),e.semanticGeometry=s.semanticGeometry||{},e.viewerReadiness=s.readiness||e.semanticGeometry.readiness||{stage:"semantic-ready",progress:100},e.assetCache=s.assetCache||null,!await jh(e,t)||!a()))return;e.renderer=w.scene.asset(e.key),e.renderer.setBarrels(_i(e.scene.manifest.barrels,e.scene.manifest.layers)),Gs(e);let r=await qh(t,e);if(!a())return;e.scene.runtimeBounds=r||Qs(e.scene.manifest.bbox),e.renderer.setBoardBounds(e.scene.runtimeBounds),e.loadState="loaded",Da()}catch(s){if(!a())return;console.warn(`[prism-semantic-viewer] system board ${e.key} failed to load`,s),e.loadState="failed",e.error=s?.message||String(s),w.scene.removeAsset(e.key),e.renderer=null,k===e&&Zo(),Da()}}function Da({relabel:e=!0}={}){let t=w?.descriptor;if(!t)return;w.harnessDrawn=null;let a=Fs(),s=new Map((t.assets||[]).map(c=>[c.assetId,c])),r=new Map,n=[];for(let c of gf(t)){let l=c.assetId?s.get(c.assetId):null,f=c.assetId?w.boards.get(c.assetId):null,u=c.kind!=="board"&&!c.restricted?l1(c):null;if(u){r.has(u.rendererId)||r.set(u.rendererId,[]),r.get(u.rendererId).push({matrix:u.matrix,key:c.path,hiddenLayers:[],explode:null}),n.push({occurrence:c,rendererId:u.rendererId,board:null,matrix:u.matrix,worldBounds:u.worldBounds,standIn:null,own:u.kind,primitives:u.primitives});continue}if(c.model||c.box)continue;let p=bf(c,l,f?.loadState),b,h,d;if(!p)b=f.key,h=Yr(c.worldMatrix,l.bundleToBoard),d=xt(h,f.scene.runtimeBounds);else{if(!c.boundsMm)continue;b=`stand-in:${p}`,w.scene.standIn(b,$r[p].color),h=gs(c.worldMatrix,c.boundsMm),d=xt(h,[0,0,0,1,1,1])}r.has(b)||r.set(b,[]),r.get(b).push({matrix:h,key:c.path,hiddenLayers:p?[]:[...w.hiddenLayers.get(c.path)||[]],explode:p?null:ob(f,w.separation.get(c.path)||0)}),n.push({occurrence:c,rendererId:b,board:p?null:f,matrix:h,worldBounds:d,standIn:p})}let i=Zh();d1(r,i.housings);for(let c of w.scene.assets.keys())r.has(c)||r.set(c,[]);w.scene.setOccurrences(r),w.groups=r;let o=w.placements;if(w.placed=n,w.placements=new Map(n.map(c=>[c.occurrence.path,c])),e||!o)q1();else for(let c of n)c.label=o.get(c.occurrence.path)?.label;w.bounds=wa(n.map(c=>c.worldBounds)),w.bounds&&(U.sceneRadius=_t(w.bounds),w.framed||(U.frame(w.bounds),w.snapped||U.snap(),w.snapped=!0,n.some(c=>c.standIn==="loading")||(w.framed=!0)));for(let c of Je())Ln(c);a!=null&&(w.placements.get(a)?.board===k?M.selectedOccurrence=k.renderer.occurrenceKeys.indexOf(a):Zo()),bt(i),cb(),At()}var Qh=[.17,.18,.2],i1=[.24,.39,.87],o1=[.9,.28,.3];function Zh(){if(w.worlds=new Map(w.descriptor.occurrences.map(e=>[e.path,e.worldMatrix])),!w.showHarnesses||!w.harnesses.length)return{tubes:[],housings:[]};try{let e=w.descriptor.occurrences.filter(t=>t.kind==="board"&&t.boundsMm).map(t=>({id:t.path,matrix:t.worldMatrix,...t.boundsMm}));return ff($i(w.harnesses,w.nodePreview,vt),Va,e)}catch(e){return console.warn("[prism-semantic-viewer] harness geometry failed",e),{tubes:[],housings:[]}}}function bt(e=null){if(!w?.descriptor)return;let t=(e??Zh()).tubes;w.tubes=t,w.tubedHarnesses=new Set(t.map(a=>a.harness)),w.scene.setTubes(t,sb)}var Uo=[.42,.45,.5,1],eb=Object.freeze([1e3,0,0,0,0,0,-1e3,0,0,1e3,0,0,0,0,0,1]);function c1(e){return{...ib(e),showBoard:!1,showComponents:!0}}function tb(e,t){return e.housing?c1(t):ib(t)}function l1(e){if(e.model?.glbKey){let t=aa(e.worldMatrix,e.model.matrixMm||$e),a=w.housingModels.get(e.model.glbKey);if(a||ab(e.model.glbKey),a?.state==="ready"){let s=Yr(t,eb);return{kind:"model",rendererId:`housing:${e.model.glbKey}`,matrix:s,worldBounds:xt(s,a.bounds),primitives:a.primitives}}if(e.model.boundsMm){w.scene.standIn("housing:proxy",Uo);let s=gs(t,e.model.boundsMm);return{kind:"model",rendererId:"housing:proxy",matrix:s,worldBounds:xt(s,[0,0,0,1,1,1])}}}if(e.box?.boundsMm){let t=e.box.rgba||Uo,a=mf(t);w.scene.standIn(a,t);let s=gs(e.worldMatrix,e.box.boundsMm);return{kind:"box",rendererId:a,matrix:s,worldBounds:xt(s,[0,0,0,1,1,1])}}return null}function d1(e,t){let a=(s,r)=>{e.has(s)||e.set(s,[]),e.get(s).push({...r,hiddenLayers:[],explode:null})};for(let s of t){let r=`housing:${s.key}`,n=s.model?w.housingModels.get(s.model.glbKey):null;if(s.model&&!n&&ab(s.model.glbKey),n?.state==="ready"){a(`housing:${s.model.glbKey}`,{key:r,matrix:Yr(s.matrix,eb)});continue}w.scene.standIn("housing:proxy",Uo);let i=s.model?s.model.boundsMm:{minMm:[0,0,0],maxMm:[1,1,1]};a("housing:proxy",{key:r,matrix:gs(s.matrix,i)})}}async function ab(e){w.housingModels.set(e,{state:"loading"});let t=ve;try{let a=await ts(new URL(`/api/catalog/models/${encodeURIComponent(e)}.glb`,location.href).toString(),{fetchCache:"force-cache"});if(!he(t)||!w)return;let s=w.scene.asset(`housing:${e}`);s.housing=!0,s.setLodOverride(vr);let r=[1/0,1/0,1/0,-1/0,-1/0,-1/0];for(let n of a.primitives){for(let i=0;i<3;i+=1)r[i]=Math.min(r[i],n.bounds[i]),r[i+3]=Math.max(r[i+3],n.bounds[i+3]);s.addPrimitive(n,{kind:"component",layerId:0,material:n.material,color:n.material.baseColor})}a.primitives.length&&s.setBoardBounds(r),w.housingModels.set(e,{state:"ready",bounds:r,primitives:a.primitives})}catch(a){console.warn("[prism-semantic-viewer] housing model failed",e,a),w&&w.housingModels.set(e,{state:"failed"})}w?.descriptor&&Da({relabel:!1})}function Va(e){return w.worlds.get(e)??null}function sb(e){let t=w.harnessLit.get(e.harness),a=t?e.wires.map(s=>t.get(s)).find(Boolean):null;return a?{rgb:u1(a),mode:1}:e.collides.length?{rgb:o1,mode:0}:w.harnessPick?.key===e.harness?{rgb:i1,mode:0}:{rgb:Qh,mode:w.emphasisSets.length?2:0}}function u1(e){let t=/^#?([0-9a-f]{6})$/i.exec(String(e));if(!t)return Qh;let a=Number.parseInt(t[1],16);return[(a>>16&255)/255,(a>>8&255)/255,(a&255)/255]}function Fs(){return!w||!k.renderer||!rb()?null:k.renderer.occurrenceKeys[M.selectedOccurrence]??null}function rb(){return!!(M.selectedFeatureId||M.activeNetId||w?.boardSelected)}function nb(e){if(k===e)return;let t=Ge;Ge=!0;try{Oe()}finally{Ge=t}k=e,Pe()}function Zo(){Oe(),k=Ps({key:""}),Pe()}function f1(e,t){let a=performance.now(),s=Math.max(0,e-Zt),r=Math.min(.05,(e-Zt)/1e3);Zt=e,U.update(r),w.scene.resize(),J={layerId:0,viewport:{x:0,y:0,width:j.width,height:j.height},matrix:U.matrix(j.width,j.height,!1),lod:Wh(j.height/Math.min(devicePixelRatio||1,2),!1)};let n=Ka(),i=new Map;for(let o of Je()){let c=y1(o);o.scene.copperRealism!==Ua()&&Gs(o),o.renderer.setInnerCopperMode(Dh(!M.showBoard||x1(o),tc(o).size>0)),o.renderer.dimCopper=n,Me(e,{},o);let l=o===k;i.set(o.renderer,{activeNetId:l?M.activeNetId:0,selectedFeatureId:l?M.selectedFeatureId:0,time:e/1e3,layerOffsets:c,visibleLayers:o.visible3dLayers,showBoard:M.showBoard,showComponents:M.showComponents,showPaste:!0,componentOpacity:1,boardOpacity:n?.34:1,isolateNet:M.isolateNet,compareMode:!1,compareOffsets:new Map,layerAlphas:null,visibleTileIds:o.visibleTileIds})}w.inputs=i,w.scene.setSelectedOccurrence(k.renderer&&rb()?k.renderer.occurrenceBase+M.selectedOccurrence:-1),nM(e,i,n)&&(w.scene.render(J,o=>i.get(o)||tb(o,e)),Wb(),W1()),L1(),H1(),R1(),w.timing.boardsDrawnAt==null&&yf(w.placed)&&(w.timing.boardsDrawnAt=performance.now());for(let o of Je())wb(e,o);Vo(s,performance.now()-a),Ho(e),Bs(t)}function ib(e){return{activeNetId:0,selectedFeatureId:0,time:e/1e3,visibleLayers:new Set,showBoard:!0,showComponents:!1,componentOpacity:1,boardOpacity:1,isolateNet:!1}}function h1(e,t){let a=performance.now();return w.scene.pick(J,e,t,s=>w.inputs.get(s)||tb(s,a))}function b1(e){let t=typeof e.occurrenceKey=="string"&&e.occurrenceKey.startsWith("housing:")?e.occurrenceKey.slice(8):null;if(t){let r=t.lastIndexOf("/"),[n,i]=[t.slice(0,r),t.slice(r+1)],o=w.tubes.find(c=>c.harness===n&&(c.from===i||c.to===i));o?pa({key:n,segmentId:o.segmentId,pointMm:null}):Oe();return}let a=e.occurrenceKey!=null?w.placements.get(e.occurrenceKey):null;if(!a)return Oe();if(a.standIn||a.own)return ec(a);let s=a.board;if(M.isolateNet&&!g1(s,a.occurrence.path,e.featureId))return Oe();nb(s),M.selectedOccurrence=s.renderer.occurrenceKeys.indexOf(a.occurrence.path),e.featureId&&!w.move.enabled?ya(e.featureId,!0):yc()}function p1(e){let t=e!=null?w?.placements.get(String(e)):null;return t?t.standIn||t.own?(ec(t),"stand-in"):(nb(t.board),M.selectedOccurrence=k.renderer.occurrenceKeys.indexOf(t.occurrence.path),"board"):null}function ec(e){let t=Ge;Ge=!0;try{Oe()}finally{Ge=t}w.standInKey=e.occurrence.path,w.move.enabled&&Ds(),Ge||js?.({kind:"board",sourceContext:"3D",occurrence:e.occurrence.path,standIn:e.standIn})}function g1(e,t,a){let s=Number(e.scene.features.get(Number(a))?.netId)||0;if(!s)return!1;let r=e.renderer.occurrenceKeys.indexOf(t);return r<0?!1:e.renderer.occurrenceEmphasis?.[r]?.has(s)?!0:e===k&&r===M.selectedOccurrence&&s===Number(M.activeNetId)}function dh(e,t){let a=w?.placements.get(String(t));return a?da(e,a.matrix):null}function tc(e=k){if(!w)return La();let t=new Set(e===k?La():[]);for(let a of e.renderer?.occurrenceEmphasis||[])if(a)for(let s of a.keys())t.add(Number(s));return t}function Ln(e){let t=w.groups.get(e.key)||[],a=new Set;for(let s of e.scene.copperLayers){let r=Number(s.id);t.some(n=>!w.hiddenLayers.get(n.key)?.has(r))&&a.add(r)}if(M.isolateNet){let s=new Set;for(let r of tc(e))for(let n of fc(r,e))s.add(n);e.visible3dLayers=new Set([...a].filter(r=>s.has(r)))}else e.visible3dLayers=a;Me(performance.now(),{force:!0},e)}function ac(e,t){let a=e??(w.groups.get(k.key)||[]).map(s=>s.key);for(let s of a){let r=new Set(w.hiddenLayers.get(String(s))||[]);t(r,w.placements.get(String(s))?.board),w.hiddenLayers.set(String(s),r)}for(let s of Je()){let r=w.groups.get(s.key)||[];for(let n of r)n.hiddenLayers=[...w.hiddenLayers.get(n.key)||[]];s.renderer.setOccurrenceHiddenLayers(r.map(n=>n.hiddenLayers)),Ln(s)}Pe(),At()}function m1(){let e=Fs();if(e==null||!M.activeNetId)return;let t=fc(M.activeNetId,k);t.size&&ac([e],a=>{a.clear();for(let s of k.scene.copperLayers)t.has(Number(s.id))||a.add(Number(s.id))})}function y1(e){if(e.scene.layerSteps)return e.scene.layerSteps;let t=new Float32Array(256),a=(e.scene.copperLayers.length-1)/2;return e.scene.copperLayers.forEach((s,r)=>{t[Number(s.id)]=a-r}),e.scene.layerSteps=t,t}function ob(e,t){let a=e?.scene.runtimeBounds,s=a?Math.hypot((a[3]-a[0])*1e3,(a[4]-a[1])*1e3):0;return[t*t*ce(s*.12,8,25)/1e3,t<.0999?1:0,1-t*.72,1]}function x1(e){return(w.groups.get(e.key)||[]).some(t=>(w.separation.get(t.key)||0)>.001)}function w1(e,t){let a=t!=null?[String(t)]:(w.groups.get(k.key)||[]).map(s=>s.key);for(let s of a)w.separation.set(s,e);for(let s of Je()){let r=w.groups.get(s.key)||[];s.renderer.setOccurrenceExplode(r.map(n=>ob(s,w.separation.get(n.key)||0)))}At()}function v1(){return w.placed.filter(e=>!e.own).map(e=>{let t=w.hiddenLayers.get(e.occurrence.path)||new Set,a=e.board;return{key:e.occurrence.path,name:e.occurrence.displayPath||e.occurrence.path,standIn:e.standIn||null,separation:w.separation.get(e.occurrence.path)||0,layers:a?a.scene.copperLayers.map(s=>({id:Number(s.id),name:String(s.name),color:Vn(Kn(s,a)),visible:!t.has(Number(s.id))})):[]}})}function M1(e){return w?(w.emphasisSets=e,cb()):null}function cb(){if(!w)return[];let e=new Map;for(let[n,i]of w.groups)e.set(n,i.map(()=>null));let t=new Map;for(let n of w.groups.values())n.forEach((i,o)=>t.set(i.key,o));w.emphasisBounds=new Map;let a=w.emphasisSets.map(n=>{let i={key:n.key,color:n.color,lit:0,unresolved:[]},o=[];w.emphasisBounds.set(n.key,o);for(let c of n.members){let l=w.placements.get(c.occurrence),f=l?.board;if(!f&&l?.own){i.lit+=1,l.worldBounds&&o.push({occurrence:c.occurrence,box:l.worldBounds});continue}if(!f){let x=l?l.standIn==="loading"||l.standIn==="building"?"loading":l.standIn==="restricted"?"restricted":"not-drawn":"not-drawn";i.unresolved.push({occurrence:c.occurrence,net:c.net,reason:x});continue}let u=sa(f.scene.nets,c.net),p=Number(u?.id)||0;if(!p){i.unresolved.push({occurrence:c.occurrence,net:c.net,reason:"unknown-net"});continue}let b=e.get(f.key),h=t.get(c.occurrence);if(!b||h==null)continue;b[h]=b[h]||new Map,b[h].has(p)||b[h].set(p,n.mark),i.lit+=1;let d=$a(u.boundsMm);d&&o.push({occurrence:c.occurrence,box:xt(l.matrix,d)})}return i});w.harnessLit=Ru(w.harnesses,w.emphasisSets),w.harnessDrawn=null,w.scene.setTubeColors(sb);for(let n of a){n.wires=0;for(let i of w.harnessLit.values())for(let o of i.values())o===n.color&&(n.wires+=1)}let s=w.emphasisSets.length>0;for(let n of Je())n.renderer.setOccurrenceEmphasis(s&&e.get(n.key)||null,{dimCopper:s});if(M.isolateNet)for(let n of Je())Ln(n);let r=JSON.stringify(a)!==JSON.stringify(w.emphasisReport);return w.emphasisReport=a,r&&w.onEmphasis?.(a),a}function k1(e=null,t=null){let a=[];for(let[r,n]of w?.emphasisBounds||[])if(!(e!=null&&r!==String(e)))for(let i of n)(t==null||i.occurrence===t)&&a.push(i.box);let s=wa(a);return s?(U.frame(s),!0):!1}function E1(e){let t=[];for(let s of Array.isArray(e)?e:[]){let r=w?.placements.get(String(s?.occurrence));if(r&&!s?.reference){r.worldBounds&&t.push(r.worldBounds);continue}let n=r?.board?.scene.componentFeatures.get(String(s?.reference)),i=n?r.board.scene.features.get(Number(n.featureId))?.bounds:null;i&&t.push(xt(r.matrix,i))}let a=wa(t);return a?(U.frame(a),!0):!1}var sc=.001,S1=90,uh=["#e5484d","#30a46c","#3e63dd"],Bo=["X","Y","Z"];function lb(e,t){if(!e||!t)return!1;let a=Yt(e),s=Yt(t),r=[...a.translationMm,...a.rotation],n=[...s.translationMm,...s.rotation];return r.every((i,o)=>Math.abs(i-n[o])<1e-6)}function T1(){return{allowed:!1,enabled:!1,route:!1,space:"world",target:null,preview:null,drag:null,node:null}}function db(){let e=w.baseDescriptor;return!e||!w.move.target||!w.move.preview?e:ed(e,w.move.target,w.move.preview)}function Ls(){w.baseDescriptor&&(w.descriptor=db(),Da({relabel:!1}))}function rc(){let e=w.move.target;return e?w.baseDescriptor?.occurrences.find(t=>t.path===e)??null:null}function ub(){let e=w.move,t=rc();return{allowed:e.allowed,enabled:e.enabled,route:e.route,space:e.space,dragging:!!e.drag,target:t?{occurrence:t.path,instanceId:t.instanceId,displayPath:t.displayPath,kind:t.kind,restricted:!!t.restricted,pose:Yt(e.preview??t.pose),source:e.preview?"manual":t.pose?.source??"default",unsaved:!!e.preview}:null}}function gt(e){w.onMove?.({phase:e,...ub()})}function A1(e){w.move.allowed=!!e,!w.move.allowed&&w.move.enabled&&Tn(!1)}function Tn(e,{route:t=!1}={}){let a=!!e&&w.move.allowed,s=a&&!!t;a===w.move.enabled&&s===w.move.route||(w.move.route=s,s&&zo(),a||(zo(),w.move.node&&(w.move.node=null,w.nodePreview&&(w.nodePreview=null,bt()),ke("target"))),w.move.enabled=a,a&&Ds({quiet:!0}),gt("mode"))}function fb(e){w.move.space=e==="local"?"local":"world",gt("mode")}function nc(){return w.standInKey??Fs()}function Ds({quiet:e=!1}={}){if(!w)return;let t=nc(),a=w.move.enabled&&!w.move.route&&t!=null?Zl(w.baseDescriptor,t):null,s=a&&a.move!==!1?a.path:null;s!==w.move.target&&(zo(),w.move.target=s,e||gt("target"))}function zo(){let e=!!w.move.preview;w.move.drag=null,w.move.preview=null,w.move.target=null,e&&Ls()}function I1(e){w?.move.target&&(w.move.preview=e?Yt(e):null,Ls(),gt("preview"))}function ic(){!w||!w.move.preview&&!w.move.drag||(w.move.drag=null,w.move.preview=null,Ls(),gt("cancel"))}function _1(){let e=`${w.move.target}/`,t=wa(w.placed.filter(a=>a.occurrence.path===w.move.target||a.occurrence.path.startsWith(e)).map(a=>a.worldBounds));return t?[0,1,2].map(a=>(t[a]+t[a+3])/2/sc):null}function ea(e){let t=ss(J.matrix,pe(e,sc),J.viewport);if(!t)return null;let a=j.getBoundingClientRect();return[t.x*a.width/j.width,t.y*a.height/j.height]}function R1(){let e=Ye;if(!e)return;let t=w.move.enabled&&J?zn():null,a=t?null:rc(),s=a&&typeof a.move=="object"?a.move:null,r=s?w.move.preview??a.pose:null,n=t?t.worldMm:w.move.enabled&&a&&J?s?.pivot==="origin"?[...r.translationMm]:_1():null,i=n?ea(n):null;if(!i){e.toggleAttribute("hidden",!0),w.gizmo=null;return}e.toggleAttribute("hidden",!1),e.firstChild||N1(e);let{right:o,back:c}=U.basis(),l=ea(Ee(n,o)),f=l?Math.hypot(l[0]-i[0],l[1]-i[1]):0;if(!(f>1e-6)){e.toggleAttribute("hidden",!0);return}let u=S1/f,p=a?w.move.preview??a.pose:null,b=p&&(s||w.move.space==="local")?Yl(p):wi,h=[];b.forEach((x,g)=>{let y=ea(Ee(n,pe(x,u))),m=e.querySelector(`[data-part="t${g}"]`),v=y&&Math.hypot(y[0]-i[0],y[1]-i[1])>12&&(!s||(s.translate||[]).includes(g));if(m.style.display=v?"":"none",v){let _=m.querySelector("line");_.setAttribute("x1",i[0]),_.setAttribute("y1",i[1]),_.setAttribute("x2",y[0]),_.setAttribute("y2",y[1]),m.querySelector("circle").setAttribute("cx",y[0]),m.querySelector("circle").setAttribute("cy",y[1]),m.querySelector("text").setAttribute("x",y[0]+9),m.querySelector("text").setAttribute("y",y[1]-7)}let E=td(x),S=qe(x,E),A=[];for(let _=0;_<=64;_+=1){let R=_/64*Math.PI*2,N=ea(Ee(n,pe(Ee(pe(E,Math.cos(R)),pe(S,Math.sin(R))),u*.7)));N&&A.push(`${N[0].toFixed(1)},${N[1].toFixed(1)}`)}let T=e.querySelector(`[data-part="r${g}"]`);T.setAttribute("points",A.join(" ")),T.style.display=t||s&&!(s.rotate||[]).includes(g)?"none":"",h.push({axis:x,pxPerMm:y?[(y[0]-i[0])/u,(y[1]-i[1])/u]:[0,0]})});let d=e.querySelector('[data-part="pivot"]');d.setAttribute("cx",i[0]),d.setAttribute("cy",i[1]),w.gizmo={center:i,pivot:n,handles:h,back:c,limits:s}}function N1(e){let t="http://www.w3.org/2000/svg",a=(s,r)=>{let n=document.createElementNS(t,s);for(let[i,o]of Object.entries(r))n.setAttribute(i,o);return n};uh.forEach((s,r)=>{let n=a("polyline",{"data-part":`r${r}`,class:"ring",stroke:s,fill:"none"}),i=a("title",{});i.textContent=`Rotate about ${Bo[r]}`,n.append(i),e.append(n)}),uh.forEach((s,r)=>{let n=a("g",{"data-part":`t${r}`,class:"arrow",stroke:s,fill:s}),i=a("title",{});i.textContent=`Move along ${Bo[r]}`;let o=a("text",{stroke:"none"});o.textContent=Bo[r],n.append(i,a("line",{}),a("circle",{r:6}),o),e.append(n)}),e.append(a("circle",{"data-part":"pivot",r:4,class:"pivot"})),e.append(a("text",{"data-part":"readout",class:"readout"})),e.addEventListener("pointerdown",C1),e.addEventListener("pointermove",B1),e.addEventListener("pointerup",F1),e.addEventListener("dblclick",s=>{!w?.move.node||w.move.node===Qt||(s.preventDefault(),s.stopPropagation(),ke("delete"))}),e.addEventListener("pointercancel",()=>hb())}function C1(e){let t=e.target.closest?.("[data-part]")?.dataset.part;if(!w||!t||!w.gizmo||!/^[tr][012]$/.test(t))return;e.preventDefault(),e.stopPropagation();let a=Ye.getBoundingClientRect(),s=zn();if(s){if(t[0]!=="t")return;w.move.drag={kind:"node",handle:w.gizmo.handles[Number(t[1])],start:[e.clientX-a.left,e.clientY-a.top],startMm:s.worldMm,startPreview:w.nodePreview,matrix:Aa(ga(),Va),changed:!1};try{Ye.setPointerCapture(e.pointerId)}catch{}return}let r=rc(),n=w.gizmo.limits;if(!(n&&!((t[0]==="t"?n.translate:n.rotate)||[]).includes(Number(t[1])))){w.move.drag={kind:t[0]==="t"?"translate":"rotate",snapDeg:n?.rotateSnapDeg??null,handle:w.gizmo.handles[Number(t[1])],start:[e.clientX-a.left,e.clientY-a.top],startPose:Yt(w.move.preview??r.pose),hadPreview:!!w.move.preview,center:w.gizmo.center,pivot:w.gizmo.pivot,back:w.gizmo.back,changed:!1};try{Ye.setPointerCapture(e.pointerId)}catch{}}}function B1(e){let t=w?.move.drag;if(!t)return;let a=Ye.getBoundingClientRect(),s=[e.clientX-a.left,e.clientY-a.top],r=e.shiftKey;if(t.kind==="node"){let o=mr(vi([s[0]-t.start[0],s[1]-t.start[1]],t.handle.pxPerMm),r?ia.fineMm:ia.mm),c=Ee(t.startMm,pe(t.handle.axis,o));t.changed=t.changed||o!==0,w.nodePreview={harness:w.harnessPick.key,id:w.move.node,positionMm:t.matrix?fs(t.matrix,c):c},fh(`${o>=0?"+":""}${o.toFixed(r?1:0)} mm`,s),bt(),ke("preview");return}let n,i;if(t.kind==="translate"){let o=mr(vi([s[0]-t.start[0],s[1]-t.start[1]],t.handle.pxPerMm),r?ia.fineMm:ia.mm);n=Jl(t.startPose,t.handle.axis,o),i=`${o>=0?"+":""}${o.toFixed(r?1:0)} mm`}else{let o=$l(t.handle.axis,t.back,Xl(t.center,t.start,s))*180/Math.PI,c=mr(o,t.snapDeg??(r?ia.fineDeg:ia.deg));n=Ql(t.startPose,t.handle.axis,c*Math.PI/180,t.pivot),i=`${c>=0?"+":""}${c.toFixed(0)}\xB0`}t.changed=t.changed||!lb(n,t.startPose),w.move.preview=Yt(n),fh(i,s),Ls(),gt("preview")}function fh(e,t){let a=Ye.querySelector('[data-part="readout"]');a.textContent=e,a.setAttribute("x",t[0]+14),a.setAttribute("y",t[1]-10)}function F1(e){let t=w?.move.drag;if(t){if(Ye.hasPointerCapture?.(e.pointerId)&&Ye.releasePointerCapture(e.pointerId),w.move.drag=null,Ye.querySelector('[data-part="readout"]').textContent="",t.kind==="node"){t.changed&&ke("commit");return}t.changed?gt("commit"):t.hadPreview||ic()}}function hb(){let e=w?.move.drag;return e?e.kind==="route"||e.kind==="handle"?(w.move.drag=null,e.changed&&(w.nodePreview=e.kind==="handle"?e.startPreview:null,bt(),ke("cancel")),!0):(w.move.drag=null,e.kind==="node"?(Ye.querySelector('[data-part="readout"]').textContent="",w.nodePreview=e.startPreview,bt(),ke("cancel"),!0):(w.move.preview=e.hadPreview?e.startPose:null,Ye.querySelector('[data-part="readout"]').textContent="",Ls(),gt("cancel"),!0)):!1}function O1(e,t){let a=w.move;if(t==="escape"){if(Et&&!Et.hidden)Et.hidden=!0;else if(!hb()){if(!yb())if(a.node)Gn(null);else if(a.preview)ic();else if(w.harnessPick)pa(null);else if(a.enabled)Tn(!1);else return!1}return!0}if(t==="m"&&a.allowed)Tn(!a.enabled);else if(t==="l"&&a.enabled)fb(a.space==="world"?"local":"world");else if(t==="enter"&&a.node&&w.nodePreview&&!a.drag)ke("commit");else if(t==="enter"&&a.preview&&!a.drag)gt("commit");else if((t==="delete"||t==="backspace")&&a.node&&a.node!==Qt&&!a.drag)ke("delete");else if(e.key==="?")bb(!!Et?.hidden);else if(t==="a")U.frame(w.bounds||ba());else return!1;return!0}function bb(e){Et&&(Et.hidden=!e)}var _s="http://www.w3.org/2000/svg";function P1(e){let t=e.occurrence?w.placements.get(e.occurrence):null;if(!t)return null;let a=e.reference&&t.board?t.board.scene.componentFeatures.get(e.reference):null,s=a?t.board.scene.features.get(Number(a.featureId))?.bounds:null;if(s)return xr(t.matrix,[0,1,2].map(n=>(s[n]+s[n+3])/2));let r=t.worldBounds;return r?[0,1,2].map(n=>(r[n]+r[n+3])/2):null}function j1(){let e=w.emphasisSets.length>0,t=[],a=[];for(let s of w.showHarnesses?w.harnesses:[]){let r=w.harnessLit.get(vt(s)),n=Cu(s,r),i=new Map(s.ends.map(c=>[c.id,P1(c)]));i.set("hub",s.ends.length>2?Bu([...i.values()]):null);let o=s.name||"Harness";for(let c of w.tubedHarnesses.has(vt(s))?[]:_u(s)){let l=Nu(c,r),f=document.createElementNS(_s,"line");f.setAttribute("class",`segment${l?" lit":e?" dim":""}`),l&&Object.assign(f.style,{stroke:l,color:l});let u=document.createElementNS(_s,"title");u.textContent=`${o}: ${c.wires.size} wire${c.wires.size===1?"":"s"}`,f.append(u),a.push(f),t.push({node:f,kind:"line",a:i.get(c.a),b:i.get(c.b)})}for(let c of s.ends){let l=n.get(c.id),f=document.createElementNS(_s,"circle");f.setAttribute("class",`end${l?" lit":e?" dim":""}`),f.setAttribute("r",l?"6":"4"),l&&(f.style.fill=l),a.push(f),t.push({node:f,kind:"dot",a:i.get(c.id)})}}vn.replaceChildren(...a),w.harnessDrawn={items:t,matrix:null}}function L1(){if(!vn||!J)return;w.harnessDrawn||j1();let e=w.harnessDrawn;vn.toggleAttribute("hidden",!e.items.length);let t=J.matrix.join(",");if(e.matrix===t)return;e.matrix=t;let a=j.getBoundingClientRect(),s=a.width/Math.max(1,j.width),r=a.height/Math.max(1,j.height),n=i=>{let o=i?ss(J.matrix,i,J.viewport):null;return o?[o.x*s,o.y*r]:null};for(let i of e.items){let o=n(i.a),c=i.kind==="line"?n(i.b):null,l=i.kind==="line"?!!(o&&c):!!o;i.node.style.display=l?"":"none",l&&(i.kind==="line"?(i.node.setAttribute("x1",o[0].toFixed(1)),i.node.setAttribute("y1",o[1].toFixed(1)),i.node.setAttribute("x2",c[0].toFixed(1)),i.node.setAttribute("y2",c[1].toFixed(1))):(i.node.setAttribute("cx",o[0].toFixed(1)),i.node.setAttribute("cy",o[1].toFixed(1))))}}function oc(e){let{right:t}=U.basis(),a=ea(e),s=ea(Ee(e,t));return a&&s?Math.hypot(s[0]-a[0],s[1]-a[1]):0}function cc(e){if(!w?.tubes.length||!J)return null;let t=j.getBoundingClientRect(),a=ju(w.tubes,[e.clientX-t.left,e.clientY-t.top],ea,oc,w.move.route?10:5);return a?{tube:w.tubes[a.index],pointMm:a.pointMm}:null}function D1(e){let t=cc(e);return t?(pa({key:t.tube.harness,segmentId:t.tube.segmentId,pointMm:t.pointMm}),!0):(pa(null),!1)}function U1(e){if(!w?.move.enabled||!w.move.route||e.button!==0||e.shiftKey)return!1;let t=cc(e),a=t?w.harnesses.find(s=>vt(s)===t.tube.harness):null;return!t||!Dn(a)?!1:(pa({key:t.tube.harness,segmentId:t.tube.segmentId,pointMm:t.pointMm}),w.move.drag={kind:"route",start:[e.clientX,e.clientY],startMm:t.pointMm,nowMm:t.pointMm,pxPerMm:oc(t.pointMm),basis:U.basis(),breakout:e.altKey,changed:!1,matrix:Aa(a,Va),capture:j,harness:a,segment:{from:t.tube.from,to:t.tube.to,samplesMm:t.tube.samplesMm}},j.setPointerCapture(e.pointerId),!0)}function z1(e,t){Gn(t);let a=zn();if(a){w.move.drag={kind:"handle",start:[e.clientX,e.clientY],startMm:a.worldMm,nowMm:a.worldMm,pxPerMm:oc(a.worldMm),basis:U.basis(),changed:!1,startPreview:w.nodePreview,matrix:Aa(ga(),Va),capture:Oa};try{Oa.setPointerCapture(e.pointerId)}catch{}}}function pb(e){let t=w?.move.drag;if(!t||t.kind!=="route"&&t.kind!=="handle")return!1;let a=[e.clientX,e.clientY];if(!t.changed&&!Du(t.start,a))return!0;t.changed=!0,t.nowMm=Lu(t.startMm,a[0]-t.start[0],a[1]-t.start[1],t.pxPerMm,t.basis);let s=t.matrix?fs(t.matrix,t.nowMm):[...t.nowMm];return t.kind==="handle"?w.nodePreview={harness:w.harnessPick.key,id:w.move.node,positionMm:s}:w.nodePreview={harness:w.harnessPick.key,insert:Ou(t.harness.nodes??[],{kind:t.breakout?"breakout":"waypoint",segment:t.segment,atMm:t.startMm,positionMm:s,toWorldMm:r=>t.matrix?Xi(t.matrix,r):r})},bt(),ke("preview"),!0}function gb(e){let t=w?.move.drag;if(!t||t.kind!=="route"&&t.kind!=="handle")return!1;if(t.capture?.hasPointerCapture?.(e.pointerId)&&t.capture.releasePointerCapture(e.pointerId),w.move.drag=null,!t.changed)return!0;if(t.kind==="handle")return ke("commit"),!0;let a=s=>t.matrix?fs(t.matrix,s):[...s];return ke("route-drag",{atMm:a(t.startMm),positionMm:a(t.nowMm),breakout:t.breakout}),!0}function G1(e){if(!w)return!1;if(e==null)return pa(null),!0;let t=vt({level:"",id:String(e)});if(w.harnessPick?.key===t)return!0;let a=w.tubes.find(r=>r.harness===t);if(!a)return!1;let s=Math.floor(a.samplesMm.length/6)*3;return pa({key:t,segmentId:a.segmentId,pointMm:a.samplesMm.slice(s,s+3)}),!0}function pa(e){if(!e&&!w.harnessPick)return;e&&(Oe(),Ds({quiet:!0}));let t=e&&w.harnessPick?.key===e.key;w.harnessPick=e,t||(w.move.node=null,w.nodePreview=null),bt(),ke("select")}function ga(){let e=w?.harnessPick;return e?w.harnesses.find(t=>vt(t)===e.key)??null:null}function Dn(e){return!!e&&!e.level&&w.move.allowed}function Un(){let e=ga();if(!e)return[];let t=$i([e],w.nodePreview,vt)[0],a=w.tubes.filter(s=>s.harness===w.harnessPick.key);return Pu(t,a,Aa(e,Va)??[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])}function zn(){return w.move.node?Un().find(e=>e.id===w.move.node)??null:null}function mb(){let e=ga();if(!e)return{harness:null,segment:null,pointMm:null,autoMm:null,node:null,editable:!1};let t=Aa(e,Va),a=f=>t?fs(t,f):[...f],s=w.harnessPick,r=w.tubes.find(f=>f.harness===s.key&&f.segmentId===s.segmentId),n=[];for(let f=0;r&&f+2<r.samplesMm.length;f+=3)n.push(a(r.samplesMm.slice(f,f+3)));let o=Un().find(f=>f.auto),c=zn(),l=!!(c&&w.nodePreview?.id===c.id);return{harness:{id:e.id,level:e.level??null,name:e.name||""},segment:r?{id:r.segmentId,from:r.from,to:r.to,samplesMm:n}:null,pointMm:s.pointMm?a(s.pointMm):null,autoMm:o?a(o.worldMm):null,node:c?{id:c.id,kind:c.kind,auto:!!c.auto,pinned:c.pinned,positionMm:l?[...w.nodePreview.positionMm]:a(c.worldMm),unsaved:l}:null,editable:Dn(e)}}function ke(e,t={}){w.onHarness?.({phase:e,...mb(),...t})}function Gn(e){if(!w)return;let t=e&&Dn(ga())&&w.move.enabled?String(e):null;t!==w.move.node&&(w.move.node=t,w.move.drag=null,w.nodePreview&&w.nodePreview.id!==t&&(w.nodePreview=null,bt()),ke("target"))}function K1(e){!w?.move.node||!w.harnessPick||(w.nodePreview=e?{harness:w.harnessPick.key,id:w.move.node,positionMm:[...e]}:null,bt(),ke("preview"))}function yb(){return w?.nodePreview?(w.nodePreview=null,w.move.drag=null,bt(),ke("cancel"),!0):!1}function V1(){if(!ga()){w.harnessPick&&(w.harnessPick=null,w.move.node=null,w.nodePreview=null,ke("select"));return}w.move.drag||(w.nodePreview=null),w.move.node&&!Un().some(s=>s.id===w.move.node)&&(w.move.node=null);let t=w.harnessPick,a=w.tubes.filter(s=>s.harness===t.key);if(t.pointMm&&a.length&&!a.some(s=>s.segmentId===t.segmentId)){let s=r=>{let n=1/0;for(let i=0;i+2<r.samplesMm.length;i+=3)n=Math.min(n,Math.hypot(r.samplesMm[i]-t.pointMm[0],r.samplesMm[i+1]-t.pointMm[1],r.samplesMm[i+2]-t.pointMm[2]));return n};t.segmentId=a.reduce((r,n)=>s(n)<s(r)?n:r).segmentId}ke("sync")}function H1(){let e=Oa;if(!e)return;let t=w.move.enabled&&J?ga():null,a=Dn(t)?Un():[];if(e.toggleAttribute("hidden",!a.length),!a.length){e.firstChild&&e.replaceChildren();return}let s=new Map([...e.children].map(n=>[n.dataset.node,n])),r=new Set;for(let n of a){let i=ea(n.worldMm),o=s.get(n.id);if(!o){o=document.createElementNS(_s,"circle"),o.dataset.node=n.id;let c=document.createElementNS(_s,"title");o.append(c),o.addEventListener("pointerdown",l=>{l.preventDefault(),l.stopPropagation(),z1(l,o.dataset.node)}),o.addEventListener("dblclick",l=>{l.preventDefault(),l.stopPropagation(),Gn(o.dataset.node),w.move.node&&w.move.node!==Qt&&ke("delete")}),e.append(o)}r.add(n.id),o.setAttribute("class",`node ${n.kind}${n.auto?" auto":""}${n.pinned?" pinned":""}${n.id===w.move.node?" target":""}`),o.setAttribute("r",n.kind==="breakout"?"7":"5.5"),o.querySelector("title").textContent=n.auto?"Automatic breakout: drag to place it":n.kind==="breakout"?"Breakout":n.pinned?"Pinned waypoint":"Waypoint",o.style.display=i?"":"none",i&&(o.setAttribute("cx",i[0].toFixed(1)),o.setAttribute("cy",i[1].toFixed(1)))}for(let[n,i]of s)r.has(n)||i.remove()}function q1(){fa&&(w.labelsDrawn=null,fa.replaceChildren(...w.placed.map(e=>{let t=document.createElement("div");t.className=`scene-label${e.standIn?` stand-in ${e.standIn}`:""}`;let a=document.createElement("strong");a.textContent=e.occurrence.displayPath||e.occurrence.labels?.join(" / ")||e.occurrence.path,t.append(a);let s=e.standIn?$r[e.standIn]?.label:"";if(s){let r=document.createElement("span");r.textContent=s,t.append(r)}return e.label=t,t})))}function W1(){if(!fa||!J)return;if(fa.hidden=!w.showLabels,!w.showLabels){w.labelsDrawn=null;return}let e=j.getBoundingClientRect(),t=nc(),a=`${t}|${e.width}x${e.height}|${Array.prototype.join.call(J.matrix,",")}`;if(w.labelsDrawn?.placed===w.placed&&w.labelsDrawn.key===a)return;w.labelsDrawn={placed:w.placed,key:a};let s=e.width/Math.max(1,j.width),r=e.height/Math.max(1,j.height);for(let n of w.placed){if(!n.label)continue;let[i,o,,c,l,f]=n.worldBounds,u=ss(J.matrix,[(i+c)/2,(o+l)/2,f],J.viewport),p=u&&u.x>=0&&u.y>=0&&u.x<=j.width&&u.y<=j.height;n.label.hidden=!p,p&&(n.label.style.transform=`translate(${(u.x*s).toFixed(1)}px, ${(u.y*r).toFixed(1)}px) translate(-50%, -100%)`),n.label.classList.toggle("selected",t===n.occurrence.path)}}function X1(e,t=k){return Nc(e,t.scene.copperLayers)}async function xb(e=ve,t=k){let a=t.semanticGeometry.assets?.components_glb;if(!a||t.scene.componentTier!=="idle")return;t.scene.componentTier="loading";let s;try{s=await Hl(new URL(a,location.href).toString(),{componentFeatures:t.scene.componentFeatures,fetchBytes:An(t)})}catch(i){throw he(e)&&(t.scene.componentTier="idle"),i}if(!he(e)||!t.renderer)return;let r=Gc(s.models);if(await Lh([...r.instanced.map(i=>i.primitive),...r.baked].reduce((i,o)=>i+Po(o),0)),!he(e)||!t.renderer)return;t.scene.componentTier="loaded",t.loadedBytes+=s.byteLength;for(let i of s.models)for(let o of i.placements){let c=t.scene.componentFeatures.get(o.designator);c&&J1(c.featureId,o.bounds,t)}w&&(w.harnessDrawn=null,w.labelsDrawn=null);for(let[i,o]of s.componentNodeCounts||[])t.scene.componentModelCounts.set(i,o);t.hiddenComponentRequest&&Db(t.hiddenComponentRequest);let n=i=>({kind:"component",layerId:0,material:i.material,color:i.material.baseColor});t.scene.componentEntries=[...t.renderer.addInstancedPrimitives(r.instanced.map(i=>({primitive:i.primitive,placements:i.placements,metadata:n(i.primitive)}))),...r.baked.map(i=>t.renderer.addPrimitive(i,n(i)))]}function An(e=k){return e.assetCache?t=>e.assetCache.fetchBytes(t):void 0}function wb(e,t=k){if(!t.renderer||e-(t.tiersCheckedAt||0)<250)return;t.tiersCheckedAt=e;let a=t.renderer.cullCounts,s=Kv()&&a.board+a.body>0,r=t.renderer.identityOnly&&!t.deferComponents||!t.renderer.identityOnly&&(a.full>0||s);r&&(t.scene.componentsWantedAt=e),r&&t.scene.componentTier==="idle"&&t.semanticGeometry.assets?.components_glb&&xb(ve,t).then(()=>{w&&t.renderer&&t.scene.componentTier==="loaded"&&Go(t.scene.runtimeBounds,t)}).catch(i=>console.warn("Failed to load components",i));let n=()=>w?w.scene.gpuMemoryBytes():t.renderer.gpuMemoryBytes();t.gpuBytes=n(),!(t.gpuBytes<=M.gpuBudgetBytes)&&(t.scene.componentTier==="loaded"&&e-t.scene.componentsWantedAt>Fv&&(t.renderer.removeEntries(t.scene.componentEntries),t.scene.componentEntries=[],t.scene.componentTier="idle",t.scene.componentEvictions+=1,t.gpuBytes=n()),t.gpuBytes>M.gpuBudgetBytes&&Kh(t.visibleTileIds||new Set,Math.max(0,t.residentTileGpuBytes-(t.gpuBytes-M.gpuBudgetBytes)),t))}var hh=4e-4,bh=5e-5,$1={baseColor:[.62,.7,.8,1],metallic:0,roughness:.8,emissive:[0,0,0]};function Go(e,t=k){if(!t.renderer)return;let a=new Map;for(let i of t.topology.physical_objects||[])i.kind==="footprint_body"&&i.designator&&i.bbox_mm?.length===4&&a.set(i.designator,i);let s=(e?.[5]??8e-4)+bh,r=(e?.[2]??-8e-4)-bh,n=[];for(let i of t.scene.componentFeatures.values()){let o=Number(i.featureId),c=t.scene.features.get(o),l=a.get(i.designator);if(!c||c.bounds||!l)continue;let[f,u,p,b]=l.bbox_mm.map(Number),h=String(l.layer||"").startsWith("B."),d=[f/1e3,-b/1e3,h?r-hh:s,p/1e3,-u/1e3,h?r:s+hh];c.bounds=d,c.placeholder=!0,n.push(Y1(d,o))}if(n.length)for(let i of Xa(n))t.renderer.addPrimitive(i,{kind:"component",layerId:0,material:i.material,color:i.material.baseColor,opacityScale:.3,translucent:!0,placeholder:!0})}function Y1([e,t,a,s,r,n],i){let o=[[[0,0,1],[[e,t,n],[s,t,n],[s,r,n],[e,r,n]]],[[0,0,-1],[[e,r,a],[s,r,a],[s,t,a],[e,t,a]]],[[1,0,0],[[s,t,a],[s,r,a],[s,r,n],[s,t,n]]],[[-1,0,0],[[e,r,a],[e,t,a],[e,t,n],[e,r,n]]],[[0,1,0],[[s,r,a],[e,r,a],[e,r,n],[s,r,n]]],[[0,-1,0],[[e,t,a],[s,t,a],[s,t,n],[e,t,n]]]],c=new Float32Array(72),l=new Float32Array(72),f=new Uint32Array(36);return o.forEach(([u,p],b)=>{p.forEach((d,x)=>{c.set(d,(b*4+x)*3),l.set(u,(b*4+x)*3)});let h=b*4;f.set([h,h+1,h+2,h,h+2,h+3],b*6)}),{position:c,normal:l,netId:new Uint32Array(24),objectFeatureId:new Uint32Array(24).fill(i),indices:f,material:$1,bounds:[e,t,a,s,r,n]}}function J1(e,t,a=k){let s=a.scene.features.get(Number(e));if(!s||!t.length)return;let r=[1/0,1/0,1/0,-1/0,-1/0,-1/0];for(let n=0;n<t.length;n+=3)r[0]=Math.min(r[0],t[n]),r[1]=Math.min(r[1],t[n+1]),r[2]=Math.min(r[2],t[n+2]),r[3]=Math.max(r[3],t[n]),r[4]=Math.max(r[4],t[n+1]),r[5]=Math.max(r[5],t[n+2]);s.bounds=s.bounds?[Math.min(s.bounds[0],r[0]),Math.min(s.bounds[1],r[1]),Math.min(s.bounds[2],r[2]),Math.max(s.bounds[3],r[3]),Math.max(s.bounds[4],r[4]),Math.max(s.bounds[5],r[5])]:r}function Kn(e,t=k){return Ac(e,t.scene.copperLayers)}var Q1=[.55,.35,.16,.78];function vb(e=k){return _c(e.topology?.board?.stackup?.copper_finish)}function Mb(e,t=k){return Rc(e,t.scene.copperLayers)}var Z1=.25;function Ua(){return!M.realisticColors||M.mode==="layer"?0:1-ce(M.separation/Z1,0,1)}function lc(e,t=k){let a=Mb(e,t)?vb(t):Wa.copper;return kb(Kn(e,t),a,Ua())}function kb(e,t,a){return e.map((s,r)=>s+(t[r]-s)*a)}function eM(e,t=ve){if(t===ve&&w&&U){f1(e,t);return}if(t!==ve||!k.renderer||!U)return;let a=performance.now(),s=Math.max(0,e-Zt);if(M.workspace==="schematic"&&C){Zt=e;let l=C.visiblePages(),f=Z?oM(l):[];C.setDomDetailPageIds(f.map(u=>u.id)),D.visiblePages=C.render(),Z?.syncWorldPages(f,C,{activeNetUid:D.activeNetUid}),$b(),Vo(s,performance.now()-a),Ho(e),Bs(t);return}let r=Math.min(.05,(e-Zt)/1e3);Zt=e,U.update(r),k.renderer.resize();let n=_n();k.scene.copperRealism!==Ua()&&Gs();for(let l of k.renderer.entries)l.layerOffset=n[l.layerId]||0;cM(e),ha=Ab(e);let i=dM(e);J={layerId:0,viewport:{x:0,y:0,width:j.width,height:j.height},matrix:U.matrix(j.width,j.height,M.mode==="layer"),lod:Wh(j.height,M.mode==="layer")},k.renderer.selectedOccurrence=M.selectedFeatureId||M.activeNetId?M.selectedOccurrence:-1,k.renderer.setInnerCopperMode(Dh(!M.showBoard||M.separation>.001,La().size>0)),Me(e);let o=M.mode==="3d"?k.visible3dLayers:Uh(),c={panels:[J],activeNetId:M.activeNetId,selectedFeatureId:M.selectedFeatureId,time:e/1e3,layerOffsets:n,visibleLayers:o,showBoard:M.showBoard,showComponents:M.showComponents,showPaste:M.separation===0,componentOpacity:ce(1-M.separation/.1,0,1),boardOpacity:La().size?.34:1-M.separation*.72,isolateNet:M.isolateNet,compareMode:M.mode==="layer",compareOffsets:ha,layerAlphas:i,visibleTileIds:M.mode==="3d"?k.visibleTileIds:null};if(Pa=c,sM(e,c)){k.renderer.render(c),Wb(),OM();for(let l of In)l()}wb(e),Vo(s,performance.now()-a),Ho(e),Bs(t)}var Eb=1e3,ft={key:"",matrix:new Float32Array(16),tiles:null,at:0},Pa=null,se={canvas:null,context:null,depth:null,depthView:null,width:0,height:0},Os=new Jr(3e3),In=new Set,bn={frames:0,cpuMs:0,gpuMs:0,lastTriangles:0},Ko={cullTiles:!0};function tM(e,t){let a=k.renderer;se.canvas||(se.canvas=document.createElement("canvas"),se.context=se.canvas.getContext("webgpu")),!(se.width>=e&&se.height>=t&&se.depth)&&(se.width=Math.max(se.width,e),se.height=Math.max(se.height,t),se.canvas.width=se.width,se.canvas.height=se.height,se.context.configure({device:a.device,format:a.format,alphaMode:"opaque"}),se.depth?.destroy(),se.depth=a.device.createTexture({label:"inset-depth",size:[se.width,se.height],format:a.depthFormat,sampleCount:a.sampleCount,usage:GPUTextureUsage.RENDER_ATTACHMENT}),se.depthView=se.depth.createView())}function Sb(){return!!(!w&&k.renderer&&Pa&&M.workspace==="pcb")}function aM(e,t,a="inset"){if(!Sb())return!1;let s=e.clientWidth,r=e.clientHeight;if(!s||!r)return!1;let n=performance.now(),i=Math.min(devicePixelRatio||1,2),o=Math.round(s*i),c=Math.round(r*i);tM(o,c);let l=_t(k.scene.runtimeBounds),f=oo(t,s,r,l,t.focusZ??0);Os.record(a,f,n);let u={layerId:0,viewport:{x:0,y:0,width:o,height:c},matrix:f,lod:Pa.panels[0].lod},p=Pa.visibleTileIds;if(p&&Ko.cullTiles){let d=new Set;for(let x of p){let g=k.scene.tiles.get(x);g&&Sn(g,f,null,0,k)&&d.add(x)}p=d}let b=k.renderer.renderInto({colorView:se.context.getCurrentTexture().createView(),depthView:se.depthView,width:se.width,height:se.height},u,{...Pa,panels:[u],visibleTileIds:p});return e.width!==o&&(e.width=o),e.height!==c&&(e.height=c),e.getContext("2d").drawImage(se.canvas,0,0,o,c,0,0,o,c),bn.frames+=1,bn.cpuMs+=performance.now()-n,bn.lastTriangles=b.triangles,!0}function sM(e,t){let a=t.panels[0].matrix,s=!1;for(let o=0;o<16;o+=1)if(a[o]!==ft.matrix[o]){s=!0;break}if(s)return ft.matrix.set(a),ft.key="",ft.at=e,!0;let r=[j.width,j.height,k.renderer.version,k.renderer.selectedOccurrence,M.workspace,M.mode,t.activeNetId,t.selectedFeatureId,t.showBoard,t.showComponents,t.showPaste,t.componentOpacity,t.boardOpacity,t.isolateNet,k.scene.layerZOffsetSignature,[...t.visibleLayers].join(","),[...t.compareOffsets].map(([o,c])=>`${o}:${c}`).join(";"),t.layerAlphas?[...t.layerAlphas].join(";"):""].join("|");return!!(t.activeNetId||t.selectedFeatureId||k.renderer.emphasizedNetIds.size)||r!==ft.key||!Tb(t.visibleTileIds,ft.tiles)||e-ft.at>Eb?(ft.key=r,ft.tiles=t.visibleTileIds,ft.at=e,!0):!1}var rM=1e3/30-2,ze={scene:null,key:"",matrix:new Float32Array(16),tiles:new Map,at:0};function nM(e,t,a){let s=J.matrix,r=!1;for(let p=0;p<16;p+=1)if(s[p]!==ze.matrix[p]){r=!0;break}if(ze.scene!==w.scene&&(ze.scene=w.scene,r=!0),r)return ze.matrix.set(s),ze.key="",ze.at=e,!0;let n=[j.width,j.height,M.showBoard,M.showComponents,M.isolateNet,M.activeNetId,M.selectedFeatureId,M.selectedOccurrence,w.showLabels,a,Ua(),nc(),w.scene.tubeVersion];for(let p of w.scene.renderers){let b=t.get(p);n.push(p.version,p.occurrenceCount,p.selectedOccurrence,p.dimCopper,p.standIn?p.boxColor.join(","):"",b?[...b.visibleLayers].join(","):"",b?.layerOffsets?Array.prototype.join.call(b.layerOffsets,","):"")}let i=n.join("|"),o=!1;for(let[p,b]of t)Tb(b.visibleTileIds,ze.tiles.get(p))||(o=!0);let c=!!(a||M.activeNetId||M.selectedFeatureId),l=o||i!==ze.key,f=c&&e-ze.at>=rM;return l||f||e-ze.at>Eb?(ze.key=i,ze.tiles=new Map([...t].map(([p,b])=>[p,b.visibleTileIds])),ze.at=e,!0):!1}function Tb(e,t){if(!e||!t)return e===t;if(e.size!==t.size)return!1;for(let a of e)if(!t.has(a))return!1;return!0}function iM(e){if(!C||!e)return{widthPx:0,heightPx:0,sourcePxPerMm:0,area:0};let t=C.pagePixelWidth(e),a=e.heightMm/Math.max(1e-6,C.scale),s=C.pageSourcePixelsPerMm(e);return{widthPx:t,heightPx:a,sourcePxPerMm:s,area:t*a}}function oM(e){if(!Z||!C)return[];let t=e||[],a=Math.max(1,Fe.clientWidth*Fe.clientHeight);return t.map(n=>({page:n,...iM(n)})).filter(n=>n.widthPx>=760&&n.heightPx>=520&&n.area>=a*.36&&n.sourcePxPerMm>=1.25).sort((n,i)=>i.area-n.area).slice(0,1).map(n=>n.page)}function _n(e=k){let t=ba(e),a=Math.hypot((t[3]-t[0])*1e3,(t[4]-t[1])*1e3),s=M.separation*M.separation*ce(a*.12,8,25)/1e3,r=`${M.separation}:${s}:${e.scene.copperLayers.length}`;if(e.scene.layerZOffsetSignature===r)return e.scene.layerZOffsets;let n=e.scene.layerZOffsets;n.fill(0);let i=(e.scene.copperLayers.length-1)/2;return e.scene.copperLayers.forEach((o,c)=>{n[Number(o.id)]=(i-c)*s}),e.scene.layerZOffsetSignature=r,n}function Ab(e){if(M.mode!=="layer")return Ie.key="3d",Ie.current.clear(),new Map;let t=k.scene.copperLayers.filter(x=>k.compareLayers.has(Number(x.id))),a=Math.max(1,t.length),s=j.width/Math.max(1,j.height),r=1;a===2?r=s>=1?2:1:a===3||a===4?r=2:a>4&&(r=Math.ceil(Math.sqrt(a*s)));let n=Math.ceil(a/r),i=ba(),o=i[3]-i[0],c=i[4]-i[1],l=o*1.18,f=c*1.22,u=t.map((x,g)=>{let y=g%r,m=Math.floor(g/r);return{layer:x,layerId:Number(x.id),column:y,row:m,offset:[(y-(r-1)/2)*l,((n-1)/2-m)*f,0]}}),p=`${r}x${n}:${u.map(x=>x.layerId).join(",")}`;if(p!==Ie.key){Ie.key=p,Ie.started=e,Ie.from=new Map(Ie.current);let x=r*o+(r-1)*(l-o),g=n*c+(n-1)*(f-c);U.targetFocus=[(i[0]+i[3])/2,(i[1]+i[4])/2,(i[2]+i[5])/2],U.targetOrthoScale=Math.max(g,x/s)*1.08}let b=ce((e-Ie.started)/420,0,1),h=1-Math.pow(1-b,3),d=new Map;for(let x of u){let g=Ie.from.get(x.layerId)||[0,0,0],y=x.offset.map((m,v)=>g[v]+(m-g[v])*h);d.set(x.layerId,y),Ie.current.set(x.layerId,y)}if(W.phase==="reveal")for(let x of W.previous)d.has(Number(x))||d.set(Number(x),W.previousOffsets.get(Number(x))||[0,0,0]);for(let x of[...Ie.current.keys()])u.some(g=>g.layerId===x)||Ie.current.delete(x);return d}function Us(e){let t=new Set([...e].map(Number));if(!(ph(t,k.desiredCompareLayers)&&W.phase!=="idle")){if(k.desiredCompareLayers=t,ph(t,k.compareLayers)){W.phase="idle",W.previous.clear(),W.target.clear();return}W.phase="preload",W.previous=new Set(k.compareLayers),W.target=new Set(t),W.previousOffsets=new Map(Ie.current),W.started=performance.now(),Me(W.started,{force:!0})}}function dc({snap:e=!0}={}){M.mode="layer";let t=Jv();k.desiredCompareLayers=new Set(t),!k.compareLayers.size&&t.size&&(k.compareLayers=new Set(t)),W.phase="idle",W.previous.clear(),W.target.clear(),Ie.key="",U.setAxis("z",!1),k.renderer?.resize(),ha=Ab(performance.now()),e&&U.snap(),Me(performance.now(),{force:!0})}function cM(e){if(!(M.mode!=="layer"||W.phase==="idle")){if(W.phase==="preload"){if(!lM(W.target)){Me(e,{force:!0});return}W.phase="reveal",W.started=e,W.previousOffsets=new Map(Ie.current),k.compareLayers=new Set(W.target),Ie.key="";return}W.phase==="reveal"&&e-W.started>=vh&&(k.compareLayers=new Set(W.target),W.phase="idle",W.previous.clear(),W.target.clear(),W.previousOffsets.clear(),Me(e,{force:!0}))}}function lM(e,t=k){for(let a of t.scene.tiles.values())if(e.has(Number(a.layerId))&&!t.scene.residentTiles.has(a.id)&&!t.scene.failed.has(a.id))return!1;return!0}function dM(e){if(M.mode!=="layer"||W.phase!=="reveal")return null;let t=ce((e-W.started)/vh,0,1),a=t*t*(3-2*t),s=new Map;for(let r of W.previous)s.set(Number(r),W.target.has(Number(r))?1:1-a);for(let r of W.target)s.set(Number(r),W.previous.has(Number(r))?1:a);return s}function ph(e,t){if(e.size!==t.size)return!1;for(let a of e)if(!t.has(a))return!1;return!0}function uc(){if(M.workspace==="schematic"){fM();return}if(M.workspace==="bom"){uM();return}if(M.workspace==="stackup")return;Cn.textContent=k.viewerReadiness.stage==="semantic-ready"?"Semantic GLTF A0":"Prism staged 3D",Bn.textContent="Layers",Fn.textContent="Visibility and compare",Y('[data-panel="search"] .section-heading span').textContent="Nets, components and pins",Y('[data-panel="view"] .section-heading span').textContent="Camera and stackup";let e=`
    <div class="mode-toolbar">
      <button data-mode="layer">PCB</button>
      <button data-mode="3d">3D</button>
    </div>`;Fa&&(Fa.innerHTML=e),nt.innerHTML=`
    ${Fa?"":e}
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
    </label>`,Pe(),MM()}function uM(){Cn.textContent="BoM A0",Bn.textContent="Bill of Materials",Fn.textContent="Grouped procurement view",Y('[data-panel="search"] .section-heading span').textContent="Search inside the BoM table",Y('[data-panel="view"] .section-heading span').textContent="BoM actions";let e=it?.payload?.counts||{};nt.innerHTML=`
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
    </div>`,we.querySelector("#clear-selection")?.addEventListener("click",Oe)}function fM(){Cn.textContent=Z?"Schematic SVG DOM":D.manifest?.schema==="prism.schematic_vector_a0"?"Schematic Vector A0":"Schematic World A0",Bn.textContent="Pages",Fn.textContent=`${D.pages.length} hierarchy instances`,Y('[data-panel="search"] .section-heading span').textContent="Pages, nets and components",Y('[data-panel="view"] .section-heading span').textContent="World navigation",nt.innerHTML=`
    <div class="layer-presets">
      <button data-page-action="world">Fit world</button>
      <button data-page-action="parent">Parent</button>
      <button data-page-action="previous">Previous</button>
      <button data-page-action="next">Next</button>
    </div>
    <div class="page-list">${D.pages.map(e=>`
      <button class="page-row ${e.id===M.selectedPageId?"active":""}" data-page="${e.id}">
        <span>${e.sheetNumber}</span>
        <strong>${V(e.name)}</strong>
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
    </div>`,nt.querySelectorAll("[data-page]").forEach(e=>{e.addEventListener("click",()=>Tt(e.dataset.page,!0))}),nt.querySelectorAll("[data-page-action]").forEach(e=>{e.addEventListener("click",()=>pn(e.dataset.pageAction))}),we.querySelector("#entity-search").addEventListener("input",e=>{bM(e.target.value)}),we.querySelector("#frame-selection").addEventListener("click",Rb),we.querySelector("#clear-selection").addEventListener("click",zs),De.querySelector("#show-hierarchy").checked=C?.showHierarchy??!0,De.querySelector("#show-hierarchy").addEventListener("change",e=>{C.showHierarchy=e.target.checked})}function Tt(e,t){let a=D.byId.get(e);!a||!C||(M.selectedPageId=a.id,M.selectedSchematicFeature=null,C.selectedPageId=a.id,C.selectedFeatureId=0,pt.textContent=JSON.stringify(a,null,2),t&&C.framePage(a),nt.querySelectorAll("[data-page]").forEach(s=>{s.classList.toggle("active",s.dataset.page===a.id)}))}function pn(e){if(!C)return;if(e==="world"){C.frameWorld();return}let t=Math.max(0,D.pages.findIndex(s=>s.id===M.selectedPageId)),a=null;e==="previous"?a=D.pages[(t-1+D.pages.length)%D.pages.length]:e==="next"?a=D.pages[(t+1)%D.pages.length]:e==="parent"&&(a=D.byId.get(D.pages[t]?.parentId)),a&&Tt(a.id,!0)}function hM(e){if(!e||!C)return;if(zs(),e.kind==="page"&&e.pageId){Tt(e.pageId,!0);return}if(e.kind!=="sheet")return;let t=D.pages.find(n=>n.sheetInstancePath===e.sheetInstancePath)||D.byId.get(M.selectedPageId),a=String(e.sheetFile||e.feature?.sheet_file||"").replace(/\\/g,"/"),s=String(e.sheetName||e.feature?.sheet_name||e.feature?.objectId||""),r=D.pages.find(n=>{if(t&&n.parentId&&n.parentId!==t.id)return!1;let i=String(n.sourcePath||"").replace(/\\/g,"/");return a&&i.endsWith(a)||s&&n.name===s})||D.pages.find(n=>{let i=String(n.sourcePath||"").replace(/\\/g,"/");return a&&i.endsWith(a)||s&&n.name===s});r&&Tt(r.id,!0)}function bM(e){let t=we.querySelector("#search-results"),a=e.trim().toLowerCase();if(!a){t.innerHTML="";return}let s=D.pages.filter(n=>`${n.name} ${n.sheetPath}`.toLowerCase().includes(a)).slice(0,8),r=k.scene.nets.filter(n=>String(n.name).toLowerCase().includes(a)).slice(0,8);t.innerHTML=[...s.map(n=>`<button data-page="${n.id}"><b>${V(n.name)}</b><span>Page ${n.sheetNumber}</span></button>`),...r.map(n=>`<button data-schematic-net="${n.id}"><b>${V(n.name)}</b><span>${(D.manifest.netToPages?.[n.uid]||[]).length} pages</span></button>`)].join(""),t.querySelectorAll("[data-page]").forEach(n=>{n.addEventListener("click",()=>Tt(n.dataset.page,!0))}),t.querySelectorAll("[data-schematic-net]").forEach(n=>{n.addEventListener("click",()=>Ib(Number(n.dataset.schematicNet),!0))})}function Ib(e,t){let a=k.scene.nets.find(r=>Number(r.id)===e);if(!a||!C)return;M.activeNetId=e,M.selectedFeatureId=0,M.selectedSchematicFeature=null,C.selectedFeatureId=0,C.selectedFeatureKey="",C.selectedSourceId="",D.activeNetUid=a.uid,C.activeNetUid=a.uid,Z?.setHighlightedNet(a.uid),pt.textContent=JSON.stringify(a,null,2),Qe();let s=D.manifest.netToPages?.[a.uid]||[];t&&s.length&&Tt(s[0],!0)}function _b(e,t=null){let a=k.scene.nets.find(s=>s.uid===e);a&&(M.activeNetId=Number(a.id),D.activeNetUid=a.uid,C&&(C.activeNetUid=a.uid,C.selectedFeatureId=Number(t?.feature?.id||t?.featureId||0),C.selectedFeatureKey=t?.feature?.stableKey||t?.featureKey||"",C.selectedSourceId=t?.feature?.sourceId||t?.sourceId||""),Z?.setHighlightedNet(a.uid),t&&(M.selectedSchematicFeature={...t,pageId:M.selectedPageId}),pt.textContent=JSON.stringify(t?{...t,net:a}:a,null,2),Qe())}function zs(){M.activeNetId=0,M.selectedFeatureId=0,M.selectedSchematicFeature=null,D.activeNetUid="",C&&(C.activeNetUid="",C.selectedFeatureId=0,C.selectedFeatureKey="",C.selectedSourceId=""),Z?.setSelection(null),Z?.setHighlightedNet(""),pt.textContent="No object selected",Qe()}function Rb(){let e=D.byId.get(M.selectedPageId);e?C.framePage(e):C.frameWorld()}function pM(e){M.selectedPageId=e.sheetInstancePath&&D.pages.find(s=>s.sheetInstancePath===e.sheetInstancePath)?.id||M.selectedPageId,M.selectedFeatureId=0,M.selectedSchematicFeature={...e,pageId:M.selectedPageId},e.anchor&&(M.selectionAnchor=e.anchor),C&&(C.selectedPageId=M.selectedPageId,C.selectedFeatureId=Number(e.feature?.id||0));let t=e.netUid?k.scene.nets.find(s=>s.uid===e.netUid):null,a=e.reference?k.scene.componentFeatures.get(e.reference):null;a&&(M.selectedFeatureId=Number(a.featureId||0),it?.setSelectionByReference(e.reference,{scroll:M.workspace==="bom"})),pt.textContent=JSON.stringify({...e,net:t,component:a},null,2),Qe()}function gM(e){let{page:t,feature:a}=e;if(!a){M.selectedSchematicFeature=null,C.selectedFeatureId=0,Tt(t.id,!1),Qe();return}let s=Number(a.id||0);if(M.selectedPageId=t.id,C.selectedPageId=t.id,C.selectedFeatureId=s,M.selectedSchematicFeature={...a,pageId:t.id},M.selectionAnchor=null,a.netUid){let r=k.scene.nets.find(n=>n.uid===a.netUid);if(r){Ib(Number(r.id),!1),M.selectedSchematicFeature={...a,pageId:t.id},C.selectedFeatureId=s;return}}if(a.reference){let r=k.scene.componentFeatures.get(a.reference);if(r){ya(Number(r.featureId),!1),M.selectedSchematicFeature={...a,pageId:t.id},C.selectedFeatureId=s;return}}M.activeNetId=0,M.selectedFeatureId=0,C.activeNetUid="",pt.textContent=JSON.stringify({page:t.name,...a},null,2),Qe()}function ma(){let e=M.isolateNet,t=we?.querySelector?.("#isolate-net");t?.classList.toggle("active",e),t?.setAttribute("aria-pressed",String(e));let a=te?.querySelector?.("[data-action=isolate]");a?.classList.toggle("active",e),a?.setAttribute("aria-pressed",String(e));let s=De?.querySelector?.("#show-board");s&&(s.checked=M.showBoard);let r=De?.querySelector?.("#show-components");r&&(r.checked=M.showComponents),At()}function mM(){let e=new Set;for(let t of La())for(let a of fc(t))e.add(a);return e}function fc(e,t=k){let a=new Set,s=t.scene.nets.find(n=>Number(n.id)===Number(e)),r=new Set(t.scene.copperLayers.map(n=>Number(n.id)));for(let n of Object.keys(s?.layerBoundsMm||{})){let i=Number(n);r.has(i)&&a.add(i)}if(!a.size){let n=new Map(t.scene.copperLayers.map(i=>[i.name,Number(i.id)]));for(let i of s?.metrics?.layers||[]){let o=n.get(i);o!=null&&a.add(o)}}if(a.size)return a;for(let n of t.scene.tiles.values())Hh(n,e)&&a.add(Number(n.layerId));return a}function za(){if(w){for(let t of Je())Ln(t);return}let e=mM();e.size&&(k.visible3dLayers=new Set(e),M.mode==="layer"?Us(e):(k.compareLayers=new Set(e),k.desiredCompareLayers=new Set(e)),Me(performance.now(),{force:!0}))}function Ha(e){let t=!!(e&&Ka()),a=M.isolateNet;if(t&&!M.isolateNet&&!w&&(k.preIsolation3dLayers=new Set(k.visible3dLayers),k.preIsolationCompareLayers=new Set(k.desiredCompareLayers.size?k.desiredCompareLayers:k.compareLayers)),M.isolateNet=t,w)za();else if(M.isolateNet)za();else if(k.preIsolation3dLayers||k.preIsolationCompareLayers){if(k.preIsolation3dLayers&&(k.visible3dLayers=new Set(k.preIsolation3dLayers)),k.preIsolationCompareLayers){let s=new Set(k.preIsolationCompareLayers);M.mode==="layer"?Us(s):(k.compareLayers=s,k.desiredCompareLayers=new Set(s))}k.preIsolation3dLayers=null,k.preIsolationCompareLayers=null,Me(performance.now(),{force:!0})}t&&!a?(M.preIsolationShowBoard=M.showBoard,M.showBoard=!1):!t&&a&&(typeof M.preIsolationShowBoard=="boolean"&&(M.showBoard=M.preIsolationShowBoard),M.preIsolationShowBoard=null),ma(),Pe()}function Pe(){(Fa||nt).querySelectorAll("[data-mode]").forEach(a=>{let s=a.dataset.mode===M.mode;a.classList.toggle("active",s),a.setAttribute("aria-pressed",String(s))}),De.querySelector("#show-board").checked=M.showBoard,De.querySelector("#show-components").checked=M.showComponents,De.querySelector("#separation").value=M.separation;let e=nt.querySelector(".layer-list"),t=M.mode==="3d"?k.visible3dLayers:k.desiredCompareLayers;e.innerHTML=k.scene.copperLayers.map((a,s)=>`
    <label class="layer-row">
      <input type="checkbox" data-layer="${a.id}" ${t.has(Number(a.id))?"checked":""}>
      <span class="swatch" style="background:${Vn(Kn(a))}"></span>
      <span>${V(a.name)}</span><small>${s+1}</small>
    </label>`).join(""),e.querySelectorAll("[data-layer]").forEach(a=>a.addEventListener("change",()=>{Cb(Number(a.dataset.layer),a.checked)})),ma()}function Nb(e){e==="layer"?dc():(M.mode="3d",U.frame(ba()),U.snap(),k.visibleTileIds=new Set,Me(performance.now(),{force:!0})),Pe()}function Cb(e,t,a=null){if(w){let s=Number(e);ac(a==null?null:[a],r=>t?r.delete(s):r.add(s));return}if(M.mode==="3d")t?k.visible3dLayers.add(e):k.visible3dLayers.delete(e),Me(performance.now(),{force:!0});else{let s=new Set(k.desiredCompareLayers);t?s.add(e):s.delete(e),Us(s)}Pe()}function Bb(e,t=null){if(w){ac(t==null?null:[t],(s,r)=>{let n=r?.scene.copperLayers||[];s.clear(),n.forEach((i,o)=>{e==="all"||e==="outer"&&(o===0||o===n.length-1)||e==="inner"&&o>0&&o<n.length-1||s.add(Number(i.id))})});return}let a=M.mode==="3d"?k.visible3dLayers:new Set;a.clear();for(let[s,r]of k.scene.copperLayers.entries())(e==="all"||e==="outer"&&(s===0||s===k.scene.copperLayers.length-1)||e==="inner"&&s>0&&s<k.scene.copperLayers.length-1)&&a.add(Number(r.id));M.mode==="3d"?Me(performance.now(),{force:!0}):Us(a),Pe()}function Fb(e){M.showBoard=!!e,M.savedShowBoard=M.showBoard,M.showBoard&&M.isolateNet?Ha(!1):ma()}function Ob(e){M.showComponents=!!e,M.savedShowComponents=M.showComponents,ma()}function yM(e){M.showPlaceholders=!!e;for(let t of w?Je():[k])t.renderer?.setPlaceholdersVisible(M.showPlaceholders);At()}function xM(){let e=new Set((k.scene?.layers||[]).map(s=>String(s.name))),t=new Set(M.hiddenBoardLayers),a=s=>{let r=(k.renderer?.entries||[]).find(i=>i.kind==="board"&&i.boardRole===s),n=r?.color||r?.material?.baseColor;return n?Vn(n):Cv[s]};return Nv.filter(s=>!e.size||e.has(s.name)).map(s=>({...s,color:a(s.role),visible:!t.has(`${s.role}:${s.side}`)}))}function wM(e,t,a){let s=`${e}:${t}`,r=new Set(M.hiddenBoardLayers);a?r.delete(s):r.add(s),M.hiddenBoardLayers=[...r];for(let n of w?Je():[k])n.renderer?.setHiddenBoardLayers(M.hiddenBoardLayers);At()}function vM(e){M.realisticColors=!!e,Gs(),At()}function Gs(e=k){if(!e.renderer)return;let t=new Map(e.scene.layers.map(a=>[Number(a.id),a]));for(let a of e.renderer.entries)a.kind==="copper"&&(a.color=lc(t.get(Number(a.layerId)),e));e.renderer.setBarrelColor(kb(Q1,[...vb(e).slice(0,3),.78],Ua())),e.scene.copperRealism=Ua()}function Pb(e,t=null){if(w){w1(ce(Number(e)||0,0,1),t);return}M.separation=ce(Number(e)||0,0,1),At()}function MM(){(Fa||nt).querySelectorAll("[data-mode]").forEach(t=>t.addEventListener("click",()=>{Nb(t.dataset.mode)})),nt.querySelectorAll("[data-preset]").forEach(t=>t.addEventListener("click",()=>{Bb(t.dataset.preset)})),De.querySelector("#show-board").addEventListener("change",t=>{Fb(t.target.checked)}),De.querySelector("#show-components").addEventListener("change",t=>{Ob(t.target.checked)}),De.querySelector("#separation").addEventListener("input",t=>{Pb(t.target.value)}),we.querySelector("#clear-selection").addEventListener("click",Oe),we.querySelector("#isolate-net").addEventListener("click",()=>{Ha(!M.isolateNet)}),we.querySelector("#frame-selection").addEventListener("click",mc),we.querySelector("#show-net-layers").addEventListener("click",hc);let e=we.querySelector("#entity-search");e.addEventListener("input",()=>Lb(e.value))}function jb(){ua(".rail-tab").forEach(e=>e.addEventListener("click",()=>{let t=e.dataset.tab,a=M.activeTab===t&&!St.classList.contains("panel-collapsed");M.activeTab=t,St.classList.toggle("panel-collapsed",a),ua(".rail-tab").forEach(s=>{s.classList.toggle("active",!a&&s.dataset.tab===t)}),ua(".tab-panel").forEach(s=>{s.classList.toggle("active",!a&&s.dataset.panel===t)})}))}function hc(){if(w){m1();return}let e=k.scene.nets.find(s=>Number(s.id)===M.activeNetId);if(!e)return;let t=new Set(e.metrics?.layers||[]),a=M.mode==="3d"?k.visible3dLayers:new Set;a.clear();for(let s of k.scene.copperLayers)t.has(s.name)&&a.add(Number(s.id));M.mode==="3d"?Me(performance.now(),{force:!0}):Us(a),Pe()}function Lb(e){let t=we.querySelector("#search-results"),a=e.trim().toLowerCase();if(!a){t.innerHTML="";return}let s=k.scene.nets.filter(n=>String(n.name).toLowerCase().includes(a)).slice(0,8),r=[...k.scene.componentFeatures.values()].filter(n=>!k.hiddenComponents.has(String(n.designator||""))&&`${n.designator} ${n.value} ${n.footprint}`.toLowerCase().includes(a)).slice(0,6);t.innerHTML=[...s.map(n=>`<button data-net="${n.id}"><b>${V(n.name)}</b><span>${V(n.netClass||"")}</span></button>`),...r.map(n=>`<button data-feature="${n.featureId}"><b>${V(n.designator)}</b><span>${V(n.value)}</span></button>`)].join(""),t.querySelectorAll("[data-net]").forEach(n=>{n.addEventListener("click",()=>bc(Number(n.dataset.net),!0))}),t.querySelectorAll("[data-feature]").forEach(n=>{n.addEventListener("click",()=>ya(Number(n.dataset.feature),!0))})}function bc(e,t){t&&(M.selectionAnchor=null),M.activeNetId=e,M.selectedFeatureId=0;let a=k.scene.nets.find(s=>Number(s.id)===e);M.workspace==="schematic"&&a&&C&&(D.activeNetUid=a.uid,C.activeNetUid=a.uid),Yo(),pt.textContent=JSON.stringify(a||{},null,2),Qe(),M.isolateNet&&za(),t&&a?.boundsMm&&U.frame($o($a(a.boundsMm))),Me(performance.now(),{force:!0}),Pn(Bh(a))}function ya(e,t=!1){let a=k.scene.features.get(e);if(a?.kind==="component"&&Zs(Ga(a),k.hiddenComponents))return;t&&(M.selectionAnchor=null),M.selectedFeatureId=e,M.activeNetId=Number(a?.netId||0);let s=Ga(a);s&&it?.setSelectionByReference(s,{scroll:M.workspace==="bom"});let r=Fh(a);r?.kind==="net"?Yo():Oh(),pt.textContent=a?JSON.stringify(a,null,2):"No object selected",Qe(),M.isolateNet&&M.activeNetId&&za(),t&&a?.bounds&&gc(a),Me(performance.now(),{force:!0}),Pn(r)}function pc(e,t=!1){if(Zs(e,k.hiddenComponents))return;let a=k.scene.componentFeatures.get(e);if(it?.setSelectionByReference(e,{scroll:M.workspace==="bom"}),!a?.featureId)return;Oh(),ya(Number(a.featureId),!1);let s=EM(e);if(s){let{page:r,feature:n}=s;M.selectedPageId=r.id,M.selectedSchematicFeature={...n,pageId:r.id},C&&(C.selectedPageId=r.id,C.selectedFeatureId=Number(n.id||0)),Z?.setSelection?.({kind:"component",featureKey:n.stableKey||"",sheetInstancePath:n.sheetInstancePath||r.sheetInstancePath||"",sourceId:n.sourceId||n.uuid||"",reference:e,feature:n,pageId:r.id}),t&&M.workspace==="schematic"&&(Tt(r.id,!0),Z?.frameSelection?.())}if(t&&M.workspace==="pcb"){let r=k.scene.features.get(Number(a.featureId));r?.bounds&&gc(r,!0)}Qe()}function Ga(e){return e?.designator||e?.reference||e?.componentDesignator||""}function kM(e=k){return Cc(e.scene.manifest?.components||[],e.scene.componentModelCounts)}function Db(e){k.hiddenComponentRequest=e;let t=Bc(e,kM());k.hiddenComponents=t.hiddenReferences,k.renderer?.setHiddenFeatureIds(t.hiddenFeatureIds),t.ambiguous.length&&console.warn(`[prism-semantic-viewer] keeping ambiguous components visible: ${t.ambiguous.join(", ")}`),t.unknown.length&&console.warn(`[prism-semantic-viewer] ignoring unknown components: ${t.unknown.join(", ")}`);let a=Ga(k.scene.features.get(M.selectedFeatureId));Zs(a,k.hiddenComponents)&&Oe();let s=we.querySelector("input");return s?.value&&Lb(s.value),t}function gc(e,t=!1){if(!e?.bounds)return;let a=$o(e.bounds);if(t||e.kind==="component"||!!Ga(e)){let n=(a[2]+a[5])*.5<0,i=U.isBelow();n!==i&&U.setAxis("z",n)}U.frame(a)}function EM(e){if(!e||!C?.featuresByPage)return null;let t=D.byId.get(M.selectedPageId),a=[...t?[t]:[],...(D.pages||[]).filter(r=>r.id!==t?.id)],s=r=>{let n=String(r.kind||"").toLowerCase();return n==="component"||n==="symbol_body"||n==="symbol_instance"?0:n==="symbol_reference"?1:n.startsWith("pin")?2:3};for(let r of a){let n=(C.featuresByPage[r.id]||[]).filter(i=>String(i.reference||i.designator||i.componentDesignator||"")===e).sort((i,o)=>s(i)-s(o));if(n.length)return{page:r,feature:n[0]}}return null}function Oe(){M.activeNetId=0,M.selectedFeatureId=0,w&&(w.boardSelected=!1,w.standInKey=null),M.selectedSchematicFeature=null,M.selectionAnchor=null;let e=Ka(),t=M.isolateNet;t&&!e?Ha(!1):e?t&&za():M.isolateNet=!1,e||Ph(),D.activeNetUid="",C&&(C.activeNetUid=""),Z?.setSelection(null),Z?.setHighlightedNet(""),pt.textContent="No object selected",it?.clearSelection?.(),Qe(),Pn(null)}function gn(e){return`<div class="selection-properties">${e.map(([t,a])=>`
    <div class="selection-property">
      <small>${V(t)}</small>
      <strong title="${V(String(a))}">${V(String(a))}</strong>
    </div>`).join("")}</div>`}function Rn(e,t,a){return`
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
      <div class="selection-card-title"><small>${V(e)}</small><strong>${V(t)}</strong></div>
      <button class="selection-card-close" type="button" aria-label="Clear selection">&times;</button>
    </div>`}function SM(e){let a=(k.topology.net_details?.[e.uid]||{}).terminals||[],s=e.metrics||{},r=Number(s.traceLengthMm||0).toFixed(2),n=s.objectCounts?.via||0,i=a.length,c=/^(VCC|VDD|GND|3V3|5V|12V|VIN|POWER)/i.test(e.name)?"#10b981":"#8b5cf6",l=e.netClass||"Default",f=a.length?a.map(u=>`
      <div class="selection-row pin-row-interactive" data-ref="${V(u.designator)}" data-pin="${V(u.pin)}">
        <span class="refdes-col"><strong>${V(u.designator)}</strong></span>
        <span class="pin-col">Pin ${V(u.pin)}</span>
        <span class="val-col" title="${V(u.value||"")}">${V(u.value||"-")}</span>
      </div>`).join(""):'<div class="selection-empty">No connected pin metadata is available.</div>';return`
    ${Rn("Net",e.name,c)}
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
          <strong title="${V(l)}">${V(l)}</strong>
        </div>
      </div>
      
      <div class="selection-section">
        <span class="selection-section-title">Layers</span>
        <div class="net-layers-badges">
          ${(s.layers||[]).length?s.layers.map(u=>`<span class="layer-badge">${V(u)}</span>`).join(""):'<span class="layer-badge unknown">None</span>'}
        </div>
      </div>

      <div class="selection-section">
        <span class="selection-section-title">Connected Pins</span>
        <div class="selection-table compact-scroll" style="max-height: 120px;">
          ${f}
        </div>
      </div>
    </div>`}function TM(e,t=null){let a=Wo(e.designator),s=a?a.value:e.value||"Not specified",r=a?a.footprint:e.footprint||"Not specified",n=a?.parameters||{},i=n.Manufacturer||n.Mfr||"",o=n["Manufacturer Part Number"]||n.MPN||n["Part Number"]||"",c=n.kicad_dnp==="true"||n.DNP==="true"||n.kicad_in_bom==="false",l="";(i||o)&&(l=`
      <div class="selection-section">
        <span class="selection-section-title">Component details</span>
        <div class="selection-table">
          <div class="selection-row">
            <span><strong>Manufacturer</strong></span>
            <span title="${V(i)}">${V(i||"-")}</span>
          </div>
          <div class="selection-row">
            <span><strong>Part Number</strong></span>
            <span title="${V(o)}">${V(o||"-")}</span>
          </div>
        </div>
      </div>`);let f="";return t&&(f=`
      <div class="selection-section">
        <span class="selection-section-title">Selected Pin</span>
        <div class="selection-table">
          <div class="selection-row">
            <span><strong>Pin</strong></span>
            <span>Pin ${V(t.pinNumber||t.pin||"")}</span>
            <span title="${V(t.pinName||"")}">${V(t.pinName||"No name")}</span>
          </div>
          <div class="selection-row">
            <span><strong>Net</strong></span>
            <span class="net-ref-interactive" data-net-name="${V(t.netName||"")}">${V(t.netName||"Not connected")}</span>
          </div>
        </div>
      </div>`),`
    ${Rn("Component",e.designator||"Unknown","#3b82f6")}
    <div class="selection-component-dashboard">
      ${c?'<div class="dnp-banner" style="background:#b45309;color:#fff;font-size:9px;font-weight:750;text-align:center;padding:3px;margin-bottom:8px;border-radius:2px;text-transform:uppercase;letter-spacing:0.05em;">DNP (Do Not Populate)</div>':""}
      ${gn([["Value",s],["Footprint",r.split(":").pop()||r]])}
      ${l}
      ${f}
    </div>`}function AM(e,t){let a=String(e.kind||"").toLowerCase(),s=a.startsWith("pin");if(a==="component"||a.includes("symbol"))return`
      ${Rn("Component",e.reference||e.componentDesignator||"Unknown","#3b82f6")}
      ${gn([["Value",e.value||e.componentValue||"Not specified"],["Footprint",e.componentFootprint||e.footprint||"Not specified"],["Library",e.libraryRef||"Not specified"],["UID",e.componentUid||e.uuid||e.sourceId||"Not resolved"]])}
      <div class="selection-section">
        <span class="selection-section-title">Schematic placement</span>
        ${gn([["Page",t?.name||"Unknown"],["Sheet",e.sheetInstancePath||"/"]])}
      </div>`;let n=s?[["Symbol",e.reference||e.designator||"Unknown"],["Value",e.value||e.componentValue||"Not specified"],["Pin",`${e.pinNumber||"-"}${e.pinName?` ${e.pinName}`:""}`],["Net",e.netName||"Not connected"],["PCB Pad",e.pcbPadId||"Not resolved"],["Component UID",e.componentUid||"Not resolved"]]:[["Page",t?.name||"Unknown"],["Kind",e.kind.replaceAll("_"," ")],["Net",e.netName||"Not connected"]];return`
    ${Rn(e.kind.replaceAll("_"," "),e.pinName||e.reference||e.designator||e.text||e.netName||"Schematic object","#3b82f6")}
    ${gn(n)}
    <div class="selection-section">
      <span class="selection-section-title">Source identity</span>
      <div class="selection-table">
        <div class="selection-row">
          <span><strong>${s?"Pin UUID":"UUID"}</strong></span>
          <span title="${V(e.uuid||e.sourceId||"")}">${V(e.uuid||e.sourceId||"-")}</span>
          <span title="${V(e.objectId||"")}">${V(e.objectId||"No object ID")}</span>
        </div>
        <div class="selection-row">
          <span><strong>Sheet</strong></span>
          <span>${V(t?.name||"Unknown")}</span>
          <span title="${V(e.sheetInstancePath||"")}">${V(e.sheetInstancePath||"/")}</span>
        </div>
      </div>
    </div>`}function Qe(){if(At(),M.workspace==="bom"){te.hidden=!0,te.innerHTML="";return}let e=k.scene.features.get(M.selectedFeatureId),t=e?.kind==="component"?e:null,a=M.workspace==="schematic"?M.selectedSchematicFeature:null,s=a?D.byId.get(a.pageId):null,r=M.activeNetId?k.scene.nets.find(u=>Number(u.id)===M.activeNetId):null;if(!r&&a&&(a.netUid?r=k.scene.nets.find(u=>u.uid===a.netUid):a.netName&&(r=sa(k.scene.nets,a.netName))),!t&&a){let u=a.reference||a.componentDesignator||a.designator;u&&(t=k.scene.componentFeatures.get(u)||{designator:u})}if(!t&&!r&&!a){te.hidden=!0,te.innerHTML="";return}let n="";if(r)n=SM(r);else if(t){let u=a?.kind?.startsWith("pin")?a:null;n=TM(t,u)}else a&&(n=AM(a,s));te.innerHTML=`
    ${n}
    <div class="selection-card-actions">
      ${r?`
        <button type="button" data-action="isolate" aria-keyshortcuts="I" title="Toggle isolated net view (I)" class="${M.isolateNet?"active":""}">Isolate</button>
        <button type="button" data-action="net-layers">Layers</button>
      `:""}
      <button type="button" data-action="frame">Frame selection</button>
    </div>`,te.hidden=!1;let i=M.workspace==="schematic"?Fe:j,o=M.selectionAnchor,c=te.offsetWidth||360,l=te.offsetHeight||330;if(o){let u=Math.max(16,i.clientWidth-c-24),p=Math.max(16,i.clientHeight-l-24);te.style.left=`${ce(o.x+18,16,u)}px`,te.style.top=`${ce(o.y+18,16,p)}px`}else te.style.left="20px",te.style.top="20px";if(te.querySelector(".selection-card-close").addEventListener("click",Oe),te.querySelector("[data-action=frame]").addEventListener("click",mc),r){let u=te.querySelector("[data-action=isolate]");u&&u.addEventListener("click",()=>{Ha(!M.isolateNet)});let p=te.querySelector("[data-action=net-layers]");p&&p.addEventListener("click",hc),te.querySelectorAll(".pin-row-interactive").forEach(b=>{b.addEventListener("click",()=>{let h=b.dataset.ref,d=b.dataset.pin;if(!h)return;let y=((k.topology.net_details?.[r.uid]||{}).terminals||[]).find(v=>v.designator===h&&v.pin===d),m=Pv(y);m?ya(m,!0):pc(h,!0)})})}let f=te.querySelector(".net-ref-interactive");f&&f.addEventListener("click",()=>{let u=f.dataset.netName;if(!u)return;let p=sa(k.scene.nets,u);p&&bc(Number(p.id),!0)})}function mc(){if(M.workspace==="schematic"){Rb();return}let e=k.scene.features.get(M.selectedFeatureId);if(e?.bounds)gc(e);else{let t=k.scene.nets.find(a=>Number(a.id)===M.activeNetId);t?.boundsMm&&U.frame($o($a(t.boundsMm)))}}function Ub(){j.addEventListener("contextmenu",e=>e.preventDefault()),j.addEventListener("pointerdown",e=>{w&&(w.framed=!0),!(w&&U1(e))&&(M.dragging=!0,M.lastX=e.clientX,M.lastY=e.clientY,M.pointerStartX=e.clientX,M.pointerStartY=e.clientY,M.dragMode=M.mode==="layer"||e.shiftKey||e.button!==0?"pan":"orbit",j.setPointerCapture(e.pointerId))}),j.addEventListener("pointermove",e=>{if(w&&pb(e)||(w?.move.route&&!M.dragging&&(j.style.cursor=cc(e)?"crosshair":""),!M.dragging))return;let t=e.clientX-M.lastX,a=e.clientY-M.lastY;M.lastX=e.clientX,M.lastY=e.clientY,M.dragMode==="pan"?U.pan(t,a,j.clientHeight,M.mode==="layer"):U.orbit(t,a)}),j.addEventListener("pointerup",async e=>{w&&gb(e)||(M.dragging=!1,j.releasePointerCapture(e.pointerId),!(Math.hypot(e.clientX-M.pointerStartX,e.clientY-M.pointerStartY)>=3)&&M.clickSelect&&(e.button===0?await xh(e):e.button===2&&await NM(e)))}),j.addEventListener("dblclick",async e=>{M.clickSelect&&(await xh(e),mc())}),j.addEventListener("wheel",e=>{w&&(w.framed=!0),e.preventDefault(),Math.abs(e.deltaX)>Math.abs(e.deltaY)*.4?U.pan(-e.deltaX,0,j.clientHeight,M.mode==="layer"):U.dolly(e.deltaY,M.mode==="layer")},{passive:!1}),window.addEventListener("keydown",qb),IM()}function IM(){let e=!1,t,a,s=0,r=0;te.addEventListener("pointerdown",n=>{if(!n.target.closest(".selection-card-head")||n.target.closest(".selection-card-close"))return;e=!0,te.classList.add("dragging");let o=te.getBoundingClientRect();s=o.left,r=o.top,t=n.clientX,a=n.clientY,te.setPointerCapture(n.pointerId),n.stopPropagation()}),te.addEventListener("pointermove",n=>{if(!e)return;let i=n.clientX-t,o=n.clientY-a,c=M.workspace==="schematic"?Fe:j,l=te.offsetWidth||360,f=te.offsetHeight||330,u=Math.max(16,c.clientWidth-l-24),p=Math.max(16,c.clientHeight-f-24),b=ce(s+i,16,u),h=ce(r+o,16,p);te.style.left=`${b}px`,te.style.top=`${h}px`,M.selectionAnchor={x:b-18,y:h-18},n.stopPropagation()}),te.addEventListener("pointerup",n=>{e&&(e=!1,te.classList.remove("dragging"),te.releasePointerCapture(n.pointerId),n.stopPropagation())})}function _M(){ua("[data-workspace]").forEach(e=>{e.addEventListener("click",()=>zb(e.dataset.workspace))})}function zb(e){if(e==="schematic"&&!C||e==="bom"&&!it)return;M.workspace=e,St.classList.remove("workspace-pcb","workspace-schematic","workspace-bom","workspace-stackup"),St.classList.add(`workspace-${e}`),(e==="schematic"&&(M.activeTab==="view"||M.activeTab==="inspect"||M.activeTab==="stats")||e==="bom"||e==="stackup")&&Nn("layers");let t=Y('.rail-tab[data-tab="layers"]');t&&(e==="schematic"?(t.textContent="Pages",t.title="Schematic pages"):e==="bom"?(t.textContent="Summary",t.title="BoM summary"):(t.textContent="Layers",t.title="Layers and compare"));let a=e==="schematic",s=e==="bom",r=e==="stackup";if(j.hidden=a||s||r,Fe&&(Fe.hidden=!a),mn&&(mn.hidden=!a||!Z),yn&&(yn.hidden=!a),xn&&(xn.hidden=!s),Le&&(Le.hidden=!r),Be.hidden=a||s||r,wn.hidden=a||s||r,Ns&&(Ns.hidden=!a),ua("[data-workspace]").forEach(n=>{n.classList.toggle("active",n.dataset.workspace===e)}),ja.textContent=s?"Semantic BoM active":a?Z?"SVG DOM + WebGPU schematic world active":"WebGPU schematic world active":r?"Layer Stackup active":"WebGPU semantic glTF active",a&&!D.fitted&&(C.resize(),C.frameWorld(),D.fitted=!0),!a&&!s&&!r&&(k.renderer?.resize(),M.mode==="layer"?dc():Me(performance.now(),{force:!0})),r)try{LM()}catch(n){console.error("Failed to render stackup workspace",n),Le&&(Le.innerHTML=`
          <div class="selection-empty" style="padding:40px;text-align:center;">
            Stackup view failed to render. ${V(n?.message||String(n))}
          </div>
        `)}uc(),Qe()}function RM(){Fe.addEventListener("pointerdown",e=>{Z?.worldActive||Z?.active||(M.schematicDragging=!0,M.schematicLastX=e.clientX,M.schematicLastY=e.clientY,M.schematicStartX=e.clientX,M.schematicStartY=e.clientY,Fe.setPointerCapture(e.pointerId))}),Fe.addEventListener("pointermove",e=>{if(Z?.worldActive||Z?.active||!M.schematicDragging||!C)return;let t=e.clientX-M.schematicLastX,a=e.clientY-M.schematicLastY;M.schematicLastX=e.clientX,M.schematicLastY=e.clientY,C.pan(t,a)}),Fe.addEventListener("pointerup",async e=>{if(!(Z?.worldActive||Z?.active)&&(M.schematicDragging=!1,Fe.releasePointerCapture(e.pointerId),Math.hypot(e.clientX-M.schematicStartX,e.clientY-M.schematicStartY)<3)){let t=await C.pickFeature(e.clientX,e.clientY);t?gM(t):zs()}}),Fe.addEventListener("dblclick",e=>{if(Z?.worldActive||Z?.active)return;let t=C.hitPage(e.clientX,e.clientY);t&&Tt(t.id,!0)}),Fe.addEventListener("wheel",e=>{Z?.worldActive||Z?.active||(e.preventDefault(),C.zoom(e.deltaY,e.clientX,e.clientY))},{passive:!1})}function gh(e,t=11,a=32){let s=da(e,$e),r=da([e[0]+1e-4,e[1],e[2]],$e),n=da([e[0],e[1]+1e-4,e[2]],$e);if(!s||!r||!n)return null;let i=Math.max(Math.hypot(r.x-s.x,r.y-s.y),Math.hypot(n.x-s.x,n.y-s.y))/1e-4;if(!(i>0))return null;let o=t/i,c=[];for(let l=0;l<a;l++){let f=2*Math.PI*l/a,u=da([e[0]+o*Math.cos(f),e[1]+o*Math.sin(f),e[2]],$e);if(!u)return null;c.push(u)}return{centre:s,ring:c}}function mh(e,t){if(!J||!j)return null;let a=Yi(J.matrix);if(!a)return null;let s=j.getBoundingClientRect(),r=(e-s.left)/s.width*2-1,n=1-(t-s.top)/s.height*2,i=u=>{let p=[r,n,u,1],b=[0,1,2,3].map(h=>a[h]*p[0]+a[4+h]*p[1]+a[8+h]*p[2]+a[12+h]*p[3]);return b.slice(0,3).map(h=>h/b[3])},o=i(0),l=i(1).map((u,p)=>u-o[p]),f=Math.hypot(...l);return f>0?{origin:o,direction:l.map(u=>u/f)}:null}var yh=0;async function xh(e){if(!J)return;let t=++yh,a=j.getBoundingClientRect();if(M.selectionAnchor={x:e.clientX-a.left,y:e.clientY-a.top},w&&D1(e))return;let s=await Gb(e);if(t===yh){if(w){b1(s);return}(s.kind==="feature"||s.kind==="board")&&(M.selectedOccurrence=s.occurrenceIndex),s.featureId?ya(s.featureId,!0):s.kind==="board"&&!k.renderer.identityOnly?yc():Oe()}}async function NM(e){if(!J||!En)return;let t=await Gb(e),a=w?w.placements.get(t.occurrenceKey)?.board:k;if(!a)return;let s=a.scene.features.get(t.featureId),r=Ga(s),n=r?Wo(r,a):null;En({clientX:e.clientX,clientY:e.clientY,reference:r||void 0,value:String(n?.value||s?.value||"")||void 0})}function CM(e,t){if(!w||!j)return null;let a=j.getBoundingClientRect(),s=(e-a.left)/a.width*2-1,r=1-(t-a.top)/a.height*2,n=Gu(U,s,r,a.width/Math.max(a.height,1)),i=w.placed.filter(c=>c.primitives&&c.occurrence.pickSurface).map(c=>({key:c.occurrence.path,matrix:c.matrix,primitives:c.primitives})),o=Ku(i,n);return o?{occurrence:o.key,pointMm:o.point.map(c=>c/sc),normal:o.normal,toCamera:n.direction.map(c=>-c)}:null}function BM(e){let t=e!=null?w?.placements.get(String(e)):null;return t?(ec(t),!0):!1}function Gb(e){let t=j.getBoundingClientRect();return Kb((e.clientX-t.left)*j.width/t.width,(e.clientY-t.top)*j.height/t.height)}async function Kb(e,t){if(w)return h1(e,t);let a=await FM(e,t);return a?.kind==="analytic"&&k.analytic?{...a,featureId:_o(k.analytic,a.operationIndex)||null}:a}function FM(e,t){return k.renderer.pick(J,e,t,{activeNetId:M.activeNetId,selectedFeatureId:M.selectedFeatureId,layerOffsets:_n(),visibleLayers:M.mode==="3d"?k.visible3dLayers:k.compareLayers,showBoard:M.showBoard,showComponents:M.showComponents,componentOpacity:ce(1-M.separation/.1,0,1),boardOpacity:1-M.separation*.72,isolateNet:M.isolateNet,compareMode:M.mode==="layer",compareOffsets:ha,visibleTileIds:M.mode==="3d"?k.visibleTileIds:null})}async function Vb(e,t){if(!J||!(w||k.renderer))return null;let a=j.getBoundingClientRect(),s=await Kb((e-a.left)*j.width/a.width,(t-a.top)*j.height/a.height),r=w?w.placements.get(s.occurrenceKey)?.board:k,n=s.featureId&&r?Fh(r.scene.features.get(s.featureId),r):null;return{...s,renderer:void 0,selection:n}}function yc(){let e=M.selectedOccurrence,t=Ge;Ge=!0;try{Oe()}finally{Ge=t}M.selectedOccurrence=e,w&&(w.boardSelected=!0),Pn({kind:"board",sourceContext:"3D"})}function Hb(e,t,a){let s=e.scene.componentFeatures.get(String(t)),r=s?e.scene.features.get(Number(s.featureId))?.bounds:null;if(!r)return null;let n=r[2]+r[5]>=0;return a([(r[0]+r[3])/2,(r[1]+r[4])/2,n?r[5]:r[2]])}function da(e,t){if(!J)return null;let a=ss(J.matrix,xr(t,e),J.viewport);if(!a)return null;let s=j.getBoundingClientRect();return{x:s.left+a.x*s.width/j.width,y:s.top+a.y*s.height/j.height}}function qb(e){if(!On())return;if(Uc(e)){e.key==="Escape"&&e.target instanceof HTMLInputElement&&e.target.blur();return}if(zc(e))return;let t=e.key.toLowerCase();if(M.workspace==="schematic"){if(t==="/")e.preventDefault(),Nn("search"),we.querySelector("#entity-search")?.focus();else if(t==="escape")D.activeNetUid?(D.activeNetUid="",M.activeNetId=0,C.activeNetUid="",Z?.setHighlightedNet(""),Qe()):zs();else if(t==="~"||e.key==="~"){e.preventDefault();let a=M.selectedSchematicFeature?.netUid;a&&(D.activeNetUid===a?(D.activeNetUid="",M.activeNetId=0,C.activeNetUid="",Z?.setHighlightedNet("")):_b(a,M.selectedSchematicFeature))}else if(t==="home")C?.frameWorld();else if(t==="[")pn("previous");else if(t==="]")pn("next");else if(t==="n"){e.preventDefault();let a=C?.cycleNetIntrasheetLink(e.shiftKey?-1:1);a?.pageId&&(M.selectedPageId=a.pageId,C.selectedPageId=a.pageId,$b())}else if(e.altKey&&t==="arrowup")pn("parent");else if(e.key.startsWith("Arrow")){e.preventDefault();let a=e.key==="ArrowRight"?32:e.key==="ArrowLeft"?-32:0,s=e.key==="ArrowDown"?32:e.key==="ArrowUp"?-32:0;C?.pan(a,s)}return}if(w&&O1(e,t)){e.preventDefault();return}if(t==="/")e.preventDefault(),Nn("search"),we.querySelector("#entity-search").focus();else if(t==="escape")Oe();else if(t==="i"&&M.workspace==="pcb"&&Ka())e.preventDefault(),Ha(!M.isolateNet);else if(t==="home")U.frame(w&&w.bounds||ba());else if(t==="`")$h(!M.showStats);else if(["x","y","z"].includes(t))U.setAxis(t,e.shiftKey);else if(t==="f")U.flip();else if(t==="r")U.rotateZ(e.shiftKey?-1:1);else if(t===" "){e.preventDefault();let a=k.scene.features.get(M.selectedFeatureId);a?.bounds&&U.setFocus([(a.bounds[0]+a.bounds[3])/2,(a.bounds[1]+a.bounds[4])/2,(a.bounds[2]+a.bounds[5])/2])}else if(e.key.startsWith("Arrow")){e.preventDefault();let a=e.key==="ArrowRight"?32:e.key==="ArrowLeft"?-32:0,s=e.key==="ArrowDown"?32:e.key==="ArrowUp"?-32:0;U.pan(a,s,j.clientHeight,M.mode==="layer")}}function Nn(e){M.activeTab=e,St.classList.remove("panel-collapsed"),ua(".rail-tab").forEach(t=>{t.classList.toggle("active",t.dataset.tab===e)}),ua(".tab-panel").forEach(t=>{t.classList.toggle("active",t.dataset.panel===e)})}function Wb(){let e=Be.getContext("2d");e.clearRect(0,0,Be.width,Be.height);let t=[Be.width/2,Be.height/2],a=U.basis(),s=[{axis:"x",label:"X",color:"#e23838",vector:[1,0,0]},{axis:"y",label:"Y",color:"#2dbd50",vector:[0,1,0]},{axis:"z",label:"Z",color:"#3157d5",vector:[0,0,1]}],r=[];for(let n of s)for(let i of[-1,1]){let o=n.vector.map(l=>l*i),c=[Fo(o,a.right),-Fo(o,a.up),Fo(o,a.back)];r.push({...n,sign:i,depth:c[2],point:[t[0]+c[0]*34,t[1]+c[1]*34]})}for(let n of s){let i=r.find(o=>o.axis===n.axis&&o.sign===1);e.strokeStyle=n.color,e.lineWidth=2.4,e.beginPath(),e.moveTo(...t),e.lineTo(...i.point),e.stroke()}Mn=[];for(let n of r.sort((i,o)=>o.depth-i.depth)){let i=n.sign===1,o=i?13:9;e.beginPath(),e.arc(n.point[0],n.point[1],o,0,Math.PI*2),e.fillStyle=i?n.color:`${n.color}66`,e.fill(),e.lineWidth=2,e.strokeStyle=jM(n.color,i?.45:.58),e.stroke(),i&&(e.fillStyle="#07101c",e.font="700 13px system-ui",e.textAlign="center",e.textBaseline="middle",e.fillText(n.label,n.point[0],n.point[1]+.5)),Mn.push({...n,radius:o+5})}}function Xb(){!Be||Be.dataset.bound==="true"||(Be.dataset.bound="true",Be.addEventListener("click",e=>{let t=Be.width/Be.clientWidth,a=Be.height/Be.clientHeight,s=[e.offsetX*t,e.offsetY*a],r=Mn.map(n=>({item:n,distance:Math.hypot(s[0]-n.point[0],s[1]-n.point[1])})).filter(({item:n,distance:i})=>i<=n.radius).sort((n,i)=>n.distance-i.distance)[0]?.item;r&&U.setAxis(r.axis,r.sign<0)}))}function OM(){if(M.mode!=="layer"||!J){wn.innerHTML="";return}let e=ba(),t=Uh();wn.innerHTML=k.scene.copperLayers.filter(a=>t.has(Number(a.id))).map(a=>{let s=ha.get(Number(a.id))||[0,0,0],r=PM([e[0]+s[0],e[4]+s[1],0],J.matrix,j.clientWidth,j.clientHeight);return!r||r[0]<-100||r[0]>j.clientWidth+100||r[1]<-100||r[1]>j.clientHeight+100?"":`<span style="left:${r[0]}px;top:${r[1]}px">${V(a.name)}</span>`}).join("")}function $b(){if(M.workspace!=="schematic"||!C){Ns.innerHTML="";return}Ns.innerHTML=D.visiblePages.filter(e=>C.pagePixelWidth(e)>120).map(e=>{let[t,a]=C.worldToScreen(e.worldX+8*C.scale,e.worldY-6*C.scale),s=e.id===M.selectedPageId,n=D.activeNetUid&&e.netUids.includes(D.activeNetUid)?"#18ef52":s?"#3b82f6":"#4b8de8";return`<div class="schematic-page-label" style="left:${t}px;top:${a}px;border-left-color:${n}">
        <strong>${V(e.name)}</strong>
        <small>Page ${e.sheetNumber} &middot; ${e.featureCount.toLocaleString()} features</small>
      </div>`}).join("")}function PM(e,t,a,s){let r=e[0],n=e[1],i=e[2],o=t[0]*r+t[4]*n+t[8]*i+t[12],c=t[1]*r+t[5]*n+t[9]*i+t[13],l=t[3]*r+t[7]*n+t[11]*i+t[15];return Math.abs(l)<1e-8?null:[(o/l*.5+.5)*a,(.5-c/l*.5)*s]}function Fo(e,t){return e[0]*t[0]+e[1]*t[1]+e[2]*t[2]}function jM(e,t){let a=e.replace("#","");return`#${[0,2,4].map(s=>Math.round(parseInt(a.slice(s,s+2),16)*t).toString(16).padStart(2,"0")).join("")}`}function Vo(e,t){M.frameSamples.push({intervalMs:e,cpuMs:t}),M.frameSamples.length>180&&M.frameSamples.shift()}function wh(e,t){if(!e.length)return 0;let a=[...e].sort((s,r)=>s-r);return a[Math.min(a.length-1,Math.floor((a.length-1)*t))]}function Ho(e){if(!un||(M.frames+=1,e-M.fpsAt<=500))return;M.fps=M.frames*1e3/(e-M.fpsAt);let t=M.frameSamples;if(M.frameIntervalMs=t.length?t.reduce((n,i)=>n+i.intervalMs,0)/t.length:0,M.frameCpuMs=t.length?t.reduce((n,i)=>n+i.cpuMs,0)/t.length:0,M.frameIntervalP95Ms=wh(t.map(n=>n.intervalMs),.95),M.frameCpuP95Ms=wh(t.map(n=>n.cpuMs),.95),M.frames=0,M.fpsAt=e,Yh(),M.workspace==="bom"){let n=it?.payload?.counts||{},i=[["Renderer","BoM DOM table"],["Schema",it?.payload?.schema||"-"],["Grouped rows",n.rows||0],["Components",n.components||0],["DNP components",n.dnpComponents||0],["Extra columns",it?.payload?.extraColumns?.length||0],["Frame interval",`${M.frameIntervalMs.toFixed(2)} ms avg / ${M.frameIntervalP95Ms.toFixed(2)} p95`],["CPU frame",`${M.frameCpuMs.toFixed(2)} ms avg / ${M.frameCpuP95Ms.toFixed(2)} p95`],["FPS",M.fps.toFixed(1)]];un.innerHTML=i.map(([o,c])=>`<dt>${o}</dt><dd>${c}</dd>`).join("");return}let a=M.workspace==="schematic"&&C?C.stats():null,s=M.workspace==="schematic"&&Z?Z.stats():null,r=M.workspace==="schematic"&&C?Z?.active?[["Renderer","SVG DOM schematic detail"],["Pages",D.pages.length],["Mounted pages",s.mountedPages],["Active page",s.activePage],["DOM nodes",s.domNodes.toLocaleString()],["Indexed features",s.indexedFeatures.toLocaleString()],["Indexed nets",s.indexedNets.toLocaleString()],["SVG cache",`${s.cachedSvgPages} pages / ${(s.cachedSvgBytes/1048576).toFixed(1)} MB`],["Selection",`${s.selectionMs.toFixed(1)} ms`],["Active net",k.scene.nets.find(n=>n.uid===D.activeNetUid)?.name||"-"],["Tracking links",`${a.netFlowSegments} total / ${a.netFlowIntrasheetSegments} local`],["Tracking verts",a.netFlowVertices.toLocaleString()],["Mount",`${s.mountMs.toFixed(1)} ms`],["Highlight",`${s.highlightMs.toFixed(1)} ms`],["Fallback",s.fallbackReason||"-"],["Frame interval",`${M.frameIntervalMs.toFixed(2)} ms avg / ${M.frameIntervalP95Ms.toFixed(2)} p95`],["CPU frame",`${M.frameCpuMs.toFixed(2)} ms avg / ${M.frameCpuP95Ms.toFixed(2)} p95`],["FPS",M.fps.toFixed(1)]]:[["Renderer",Z?"SVG DOM + WebGPU world":"WebGPU schematic world"],["Pages",D.pages.length],["Visible pages",D.visiblePages.length],["DOM pages",s?s.mountedPages:0],["DOM nodes",s?s.domNodes.toLocaleString():"0"],["Indexed SVG features",s?s.indexedFeatures.toLocaleString():"0"],["SVG cache",s?`${s.cachedSvgPages} pages / ${(s.cachedSvgBytes/1048576).toFixed(1)} MB`:"0 pages"],["JS heap",s?.heapMb?`${s.heapMb.toFixed(1)} MB`:"-"],["Hierarchy links",D.manifest.edges?.length||0],["Selected page",D.byId.get(M.selectedPageId)?.name||"-"],["Active net",k.scene.nets.find(n=>n.uid===D.activeNetUid)?.name||"-"],["Tracking links",`${a.netFlowSegments} total / ${a.netFlowIntrasheetSegments} local`],["Downloaded",`${(C.downloadedBytes/1048576).toFixed(1)} MB`],["Resident vectors",`${(a.residentVectorBytes/1048576).toFixed(1)} MB`],["Vector pages",`${a.vectorChunks} loaded / ${a.vectorLoads} loading`],["Vector draw",`${a.vectorVertices.toLocaleString()} verts / ${a.vectorDrawChunks} chunks`],["Native detail",`${a.nativeDetailPages} pages @ ${a.nativePxPerMm} / ${a.nativeThresholdPxPerMm} px/mm`],["Vector failures",a.failedVectorChunks],["Truncated",a.truncatedVectors],["Frame interval",`${M.frameIntervalMs.toFixed(2)} ms avg / ${M.frameIntervalP95Ms.toFixed(2)} p95`],["CPU frame",`${M.frameCpuMs.toFixed(2)} ms avg / ${M.frameCpuP95Ms.toFixed(2)} p95`],["FPS",M.fps.toFixed(1)]]:[["Renderer","WebGPU semantic glTF"],["Mode",M.mode==="3d"?"3D":"Layer Compare"],["Visible layers",M.mode==="3d"?k.visible3dLayers.size:k.compareLayers.size],["Resident tiles",k.scene.loaded.size],["Loading tiles",k.scene.loading.size],["Failed tiles",k.scene.failed.size],["Triangles",Math.round(k.triangles).toLocaleString()],["Downloaded",`${(k.loadedBytes/1048576).toFixed(1)} MB`],["Resident GLB",`${(k.residentTileBytes/1048576).toFixed(1)} MB`],["Resident GPU",`${(k.residentTileGpuBytes/1048576).toFixed(1)} MB`],["Tile loads",k.tileLoads.toLocaleString()],["Tile evictions",k.tileEvictions.toLocaleString()],["Tile scheduler",`${k.tileSchedulerMs.toFixed(2)} ms`],["Active net",k.scene.nets.find(n=>Number(n.id)===M.activeNetId)?.name||"-"],["Frame interval",`${M.frameIntervalMs.toFixed(2)} ms avg / ${M.frameIntervalP95Ms.toFixed(2)} p95`],["CPU frame",`${M.frameCpuMs.toFixed(2)} ms avg / ${M.frameCpuP95Ms.toFixed(2)} p95`],["FPS",M.fps.toFixed(1)]];un.innerHTML=r.map(([n,i])=>`<dt>${n}</dt><dd>${i}</dd>`).join("")}function Vn(e){return`rgb(${e.slice(0,3).map(t=>Math.round(t*255)).join(" ")})`}function LM(){if(!Le)return;let e=k.scene.layers||[];if(!e.length){Le.innerHTML='<div class="selection-empty" style="padding:40px;text-align:center;">No stackup information available for this board.</div>';return}let t=e.filter(I=>["copper","dielectric","paste","silkscreen","soldermask"].includes(I.role)),a=k.topology.board?.stackup||{},s=I=>{if(I==null||I==="")return"None";let P=String(I);return V(P.includes(".")?P.split(".").pop():P)},r=(I,P=4)=>{let L=Number(I);return Number.isFinite(L)&&L>0?L.toFixed(P):"-"},n=(I,P=3)=>{let L=Number(I);return Number.isFinite(L)?L.toFixed(P):"-"},i=I=>{if(I==null||I==="")return"No";if(typeof I=="boolean")return I?"Yes":"No";let P=String(I).trim().toLowerCase(),L=P.includes(".")?P.split(".").pop():P;return["0","false","no","n","off","none"].includes(L)?"No":(["1","true","yes","y","on"].includes(L),"Yes")},o=I=>({copper:"Copper",dielectric:"Dielectric",paste:"Paste",silkscreen:"Silkscreen",soldermask:"Solder mask"})[I]||String(I||"Layer"),c=I=>I.role!=="dielectric"?"":I.type==="core"?"Core":I.type==="prepreg"||(I.material||"").toLowerCase().includes("prepreg")?"Prepreg":"Core",l=(I,P=4)=>{let L=Number(I.thickness_mm);return Number.isFinite(L)&&L>0?`${L.toFixed(P)} mm`:"Not specified"},f=I=>{let P=o(I.role),L=String(I.material||"").trim(),Q=L&&L.toLowerCase()!==String(I.role||"").toLowerCase();if(I.role==="dielectric"){let ue=[Q?L:"",r(I.epsilon_r,3)!=="-"?`\u03B5r ${r(I.epsilon_r,3)}`:"",r(I.loss_tangent,4)!=="-"?`tan \u03B4 ${r(I.loss_tangent,4)}`:""].filter(Boolean).join(" \xB7 ");return{primary:`${I.name} \xB7 ${c(I)}`,secondary:ue}}return{primary:[I.name,P,Q?L:""].filter(Boolean).join(" \xB7 "),secondary:""}},u=0,p=0,b=0,h=0;t.forEach(I=>{h+=I.thickness_mm||0,I.role==="copper"?I.name.toLowerCase().includes("gnd")||I.name.toLowerCase().includes("pwr")||I.name.toLowerCase().includes("plane")?p++:u++:I.role==="dielectric"&&b++});let d=k.scene.copperLayers||[],x=0,g=0,y=0,m=[...(k.scene.manifest?.barrels||[]).filter(I=>I.kind==="via"),...[...k.scene.features.values()].filter(I=>I.kind==="via")],v=xu(d,m);x=v.counts.thru,g=v.counts.blind,y=v.counts.buried;let E=v.spans,S=30,A=S,T=[],_=new Map(t.map((I,P)=>[I,P])),R=DM(t),N=(I,P)=>{let L=R.get(I.name);if(L!==void 0)return L;let Q=Number(I.stack_index);return Number.isFinite(Q)?Q:P+1e5},B=[...t].sort((I,P)=>{let L=N(I,_.get(I)||0),Q=N(P,_.get(P)||0);return L!==Q?L-Q:(P.z_mm||0)-(I.z_mm||0)});B.forEach(I=>{let P=12;I.role==="dielectric"?P=Math.max(160,Math.min(360,(I.thickness_mm||.1)*140)):I.role==="copper"?P=22:I.role==="soldermask"&&(P=14),T.push({...I,svgY:A,svgHeight:P}),A+=P});let F=800,K=130,$=240,re=K+$+16,de=re+84,Ke="";T.forEach(I=>{let P=I.color||"#7f7f7f";I.role==="copper"?P=I.color||"#f97316":I.role==="dielectric"?P="#a98d5c":I.role==="paste"?P="#cbd5e1":I.role==="soldermask"?P="#1b4332":I.role==="silkscreen"&&(P="#e2e8f0");let L=d.findIndex(sp=>sp.name===I.name),Q=f(I),ue=I.svgY+I.svgHeight/2,Re=!!Q.secondary&&I.svgHeight>=38,ta=Re?ue-5:ue+3,Wn=V(I.id),Vs=V(I.name),ct=Number.isFinite(Number(I.thickness_mm))&&Number(I.thickness_mm)>0,tp=V(ct?l(I):"\u2014"),ap=V([Q.primary,Q.secondary,`Thickness ${l(I)}`].filter(Boolean).join("; "));Ke+=`
      <g class="stackup-svg-layer" data-layer-id="${Wn}" data-layer-name="${Vs}">
        <title>${ap}</title>
        <rect x="${K}" y="${I.svgY}" width="${$}" height="${I.svgHeight}" fill="${P}" opacity="0.85" rx="1"/>
        <text x="${K-8}" y="${I.svgY+I.svgHeight/2+3}" fill="var(--muted)" font-size="9px" text-anchor="end" font-weight="700">
          ${I.role==="copper"?L+1:""}
        </text>
        <path class="stackup-layer-dimension" d="M ${re+6} ${I.svgY+1} H ${re} V ${I.svgY+I.svgHeight-1} H ${re+6}" />
        <text class="stackup-layer-thickness" x="${re+10}" y="${ue+3}" fill="var(--muted)" font-size="8.5px" font-weight="650">
          ${tp}
        </text>
        <text class="stackup-layer-name" x="${de}" y="${ta}" fill="var(--foreground)" font-size="9px" font-weight="650">
          ${V(Q.primary)}
        </text>
        ${Re?`<text class="stackup-layer-metadata" x="${de}" y="${ue+10}" fill="var(--muted)" font-size="8px">${V(Q.secondary)}</text>`:""}
      </g>
    `});let be="",Ve=T.filter(I=>I.role==="copper");E.forEach((I,P)=>{let L=T.find(ct=>ct.name===I.startName),Q=T.find(ct=>ct.name===I.endName);if(!L||!Q)return;let ue=L.svgY,Re=Q.svgY+Q.svgHeight,ta=K+(P+1)*$/(E.length+1),Wn=I.type==="thru"?"Thru":I.type==="blind"?"Blind":"Buried",Vs=`var(--stackup-via-${I.type})`;be+=`
      <g class="stackup-svg-via" data-via-type="${I.type}">
        <title>${Wn}: ${I.startName} \u2192 ${I.endName}</title>
        ${Ve.map(ct=>ct.svgY>=L.svgY&&ct.svgY<=Q.svgY?`<rect x="${ta-5}" y="${ct.svgY}" width="10" height="${ct.svgHeight}" fill="${Vs}" rx="0.5" />`:"").join("")}
        <rect x="${ta-2}" y="${ue}" width="4" height="${Re-ue}" fill="${Vs}" opacity="0.95" />
        <rect x="${ta-.75}" y="${ue-1}" width="1.5" height="${Re-ue+2}" fill="var(--panel)" opacity="0.9" />
      </g>
    `});let Ze=`
    <svg class="stackup-visual-svg" viewBox="0 0 ${F} ${A+10}" width="${F}" height="${A+10}">
      <g class="stackup-svg-column-headings" aria-hidden="true">
        <text x="${re+10}" y="15">Thickness</text>
        <text x="${de}" y="15">Layer / material properties</text>
      </g>
      <g class="stackup-total-dimension" aria-label="Total board thickness ${h.toFixed(4)} millimetres">
        <path d="M 76 ${S} H 68 V ${A} H 76" />
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
  `,_e="";B.forEach(I=>{let P="silk";I.role==="copper"?P="copper":I.role==="dielectric"?P="dielectric":I.role==="paste"?P="paste":I.role==="soldermask"&&(P="mask");let L=c(I),Q=V(I.id),ue=V(I.name),Re=f(I);_e+=`
      <tr data-layer-id="${Q}" data-layer-name="${ue}" tabindex="0" aria-label="${V(`${Re.primary}; thickness ${l(I)}`)}">
        <td><strong>${ue}</strong></td>
        <td><span class="stackup-badge ${P}">${I.role}</span></td>
        <td>${L||"-"}</td>
        <td>${V(I.material||"-")}</td>
        <td>${I.role==="dielectric"?r(I.epsilon_r,3):"-"}</td>
        <td>${I.role==="dielectric"?r(I.loss_tangent,4):"-"}</td>
        <td>${I.thickness_mm?I.thickness_mm.toFixed(4)+" mm":"-"}</td>
      </tr>
    `});let ot="",et=k.topology.board?.net_classes||[],It=I=>{let P=n(I);return P==="-"?P:`${P} mm`};et.length?et.forEach(I=>{ot+=`
        <tr>
          <td><strong>${I.name}</strong></td>
          <td>${It(I.track_width)}</td>
          <td>${It(I.clearance)}</td>
          <td>${It(I.diff_pair_width)}</td>
          <td>${It(I.diff_pair_gap)}</td>
          <td>${Number.isFinite(Number(I.via_diameter))?`${n(I.via_drill)}/${n(I.via_diameter)} mm`:"-"}</td>
        </tr>
      `}):ot=`
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
        ${Ze}
      </div>
      <aside class="stackup-side-panel">
      <div class="stackup-summary-grid">
        <div class="stackup-summary-card">
          <label>Total Thickness</label>
          <span>${h.toFixed(4)} mm</span>
        </div>
        <div class="stackup-summary-card">
          <label>Copper Layers</label>
          <span>${d.length} (${u} Sig / ${p} Plane)</span>
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
          <span>${g}</span>
        </div>
        <div class="stackup-summary-card">
          <label>Buried Vias</label>
          <span>${y}</span>
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
                ${ot}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      </aside>
    </div>
  `;let xa=(I,P)=>{Le.querySelectorAll(".stackup-svg-layer").forEach(L=>{let Q=L.dataset.layerId===I;L.classList.toggle("active",Q&&P)}),Le.querySelectorAll(".stackup-table tbody tr[data-layer-id]").forEach(L=>{let Q=L.dataset.layerId===I;L.classList.toggle("active",Q&&P)})},qn=I=>{let P=Le.querySelector(".stackup-diagram-card"),L=Le.querySelector(`.stackup-svg-layer[data-layer-id="${CSS.escape(I)}"]`);if(!P||!L||P.scrollHeight<=P.clientHeight)return;let Q=P.getBoundingClientRect(),ue=L.getBoundingClientRect(),Re=P.scrollTop+ue.top-Q.top-(P.clientHeight-ue.height)/2,ta=window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;P.scrollTo({top:Math.max(0,Re),behavior:ta?"auto":"smooth"})},Ks=(I,{revealDiagram:P=!1}={})=>{I.forEach(L=>{let Q=()=>{let Re=L.dataset.layerId;xa(Re,!0),P&&qn(Re)},ue=()=>xa(null,!1);L.addEventListener("mouseenter",Q),L.addEventListener("mouseleave",ue),P&&(L.addEventListener("focus",Q),L.addEventListener("blur",ue))})};Ks(Le.querySelectorAll(".stackup-svg-layer")),Ks(Le.querySelectorAll(".stackup-table tbody tr[data-layer-id]"),{revealDiagram:!0})}function DM(e){let t=e.filter(r=>r.role==="dielectric");if(!(t.length===1&&t[0]?.name==="Board"))return new Map;let s=new Map;return["F.SilkS","F.Paste","F.Mask","F.Cu","Board","B.Cu","B.Mask","B.Paste","B.SilkS"].forEach((r,n)=>s.set(r,n)),s}function Yb(){let e=null;return{begin(){return e?.abort(),e=new AbortController,e},owns(t){return t!==null&&t===e&&!t.signal.aborted},cancel(){e?.abort(),e=null}}}async function Jb(e,t,{owner:a,bundleUrl:s,loadBundle:r,now:n=()=>performance.now()}){let i=n(),o={},{signal:c}=t,l=()=>a.owns(t)&&e.isConnected;try{e.renderLoading();let f=n(),{bundle:u,topology:p,semanticGeometry:b,assetCache:h}=await r(s,o,c);if(o.bundle_group_total_ms=n()-f,!l())return;e.renderShell();let d=n(),x=await e.mountViewer({topology:p,semanticGeometry:b,readiness:u.readiness,assetCache:h,signal:c});if(!l()){x?.dispose?.();return}e.publishController(x),o.mount_and_first_frame_ms=n()-d,Object.assign(o,x?.performance||{}),o.reload_to_visible_ms=n()-i,e.emitReady({schema:"prism.semantic_viewer_performance.a0",milestone:"board-visible",readiness_stage:u.readiness?.stage||"semantic-ready",readiness_progress:u.readiness?.progress??100,timings:o})}catch(f){if(!l())return;e.renderError(f),e.emitError(f)}}var UM="prism.visualizer_bundle.a0";function zM(){return`
    <style>
      ${xc}
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
  `}function GM(e){return String(e).replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t])}async function Qb(e,t=null,a="fetch",s=void 0){let r=performance.now(),n=await fetch(e,{cache:"no-store",signal:s});if(!n.ok)throw new Error(`Failed to load ${e}: ${n.status}`);let i=await n.json();return t&&(t[`${a}_fetch_parse_ms`]=performance.now()-r,t[`${a}_content_length`]=Number(n.headers.get("content-length")||0)),i}async function Zb(e,t,a){let s=new URL(e,document.baseURI).toString(),r=new URL(s).searchParams.get("viewer")||"",n=qs.open(),i=await n.peekJson(s).catch(()=>null),o=!!i;i||(i=await Qb(s,t,"bundle",a),Yn(i)&&n.store(s,new TextEncoder().encode(JSON.stringify(i)))),t&&(t.bundle_from_cache=o);let c=Yn(i)&&n.enabled?n:null;if(i.schema!==UM)throw new Error(`Unsupported visualizer bundle schema: ${i.schema||"missing"}`);let l=new URL(i.topology||"topology.json",s),f=new URL(i.semantic_geometry||"semantic_geometry.json",s),u=(h,d)=>c?c.fetchJson(h.toString(),{signal:a}):Qb(h,t,d,a),[p,b]=await Promise.all([u(l,"topology"),u(f,"semantic_geometry")]);return{bundle:i,topology:p,semanticGeometry:wc(b,s,i,r),assetCache:c}}var Hn=class extends HTMLElement{static get observedAttributes(){return["bundle-url","workspace","mode","move-allowed"]}constructor(){super(),this.attachShadow({mode:"open"}),this.reloadOwner=Yb(),this.reloadQueued=!1,this.reloadSource=null;let t=uo();this.modes=Object.freeze({board:new Zr(t),system:new en(t)}),this.mounted=null}get activeMode(){return this.mounted??(this.systemMode?this.modes.system:this.modes.board)}detachModes(){this.modes.board.detach(),this.modes.system.detach(),this.mounted=null}connectedCallback(){this.queueReload()}disconnectedCallback(){this.reloadOwner.cancel(),this.detachModes(),this.reloadSource=null}attributeChangedCallback(t,a,s){if(!(!this.isConnected||a===s)){if(t==="workspace"){this.modes.board.setWorkspace(this.workspace);return}if(t==="move-allowed"){this.modes.system.setMoveAllowed(s==="true");return}this.queueReload()}}get workspace(){return this.getAttribute("workspace")==="stackup"?"stackup":"pcb"}get systemMode(){return this.getAttribute("mode")==="system"}queueReload(){let t=this.systemMode?"system":this.getAttribute("bundle-url");!t||t===this.reloadSource||(this.reloadSource=t,!this.reloadQueued&&(this.reloadQueued=!0,queueMicrotask(()=>{this.reloadQueued=!1,this.isConnected&&this.reload()})))}async reload(){let t=this.getAttribute("bundle-url"),a=this.reloadOwner.begin();if(this.detachModes(),this.systemMode){await this.reloadSystem(a);return}if(!t){this.shadowRoot.innerHTML="<style>:host{display:block;height:100%;font:14px system-ui;color:#94a3b8}</style><div>Semantic bundle URL is missing.</div>";return}await Jb(this,a,{owner:this.reloadOwner,bundleUrl:t,loadBundle:Zb})}async reloadSystem(t){let{signal:a}=t,s=()=>this.reloadOwner.owns(t)&&this.isConnected;try{this.renderShell();let r=await Jh({root:this.shadowRoot,loadBundle:(i,o)=>Zb(i,null,o),isActive:()=>this.getAttribute("active")==="true",onSelectionChange:i=>{a.aborted||this.emit("selectionchange",{selection:i})},onContextMenu:i=>{a.aborted||this.emit("contextmenu",i)},onViewStateChange:i=>{a.aborted||this.emitViewState(i)},onEmphasis:i=>{a.aborted||this.emit("emphasis",{results:i})},onMove:i=>{a.aborted||this.emit("move",i)},onHarness:i=>{a.aborted||this.emit("harness",i)}});if(!s()){r?.dispose?.();return}this.mounted=this.modes.system,this.mounted.attach(r,{moveAllowed:this.getAttribute("move-allowed")==="true"});let n=this.getViewState();n&&this.emitViewState(n),this.emitReady({schema:"prism.semantic_viewer_performance.a0",milestone:"system-mounted"})}catch(r){if(!s())return;this.renderError(r),this.emitError(r)}}emit(t,a){this.dispatchEvent(new CustomEvent(`prism-semantic-viewer:${t}`,{bubbles:!0,composed:!0,detail:a}))}renderLoading(){this.shadowRoot.innerHTML='<style>:host{display:block;height:100%;background:#020817;color:#e5e7eb;font:14px system-ui}</style><div style="display:grid;place-items:center;height:100%">Loading semantic visualizer...</div>'}renderShell(){this.shadowRoot.innerHTML=zM()}renderError(t){console.error(t),this.shadowRoot.innerHTML=`
      <style>
        :host{display:block;height:100%;background:#020817;color:#e5e7eb;font:14px system-ui}
        .error{height:100%;display:grid;place-items:center;padding:24px}
        pre{max-width:100%;white-space:pre-wrap;color:#fecaca;background:#111827;border:1px solid #374151;padding:16px}
      </style>
      <div class="error"><pre>${GM(t?.stack||t?.message||String(t))}</pre></div>
    `}mountViewer({topology:t,semanticGeometry:a,readiness:s,assetCache:r=null,signal:n}){return Xo({root:this.shadowRoot,topology:t,semanticGeometry:a,readiness:s,workspaceScope:"3d",assetCache:r,isActive:()=>this.getAttribute("active")==="true",onSelectionChange:i=>{n.aborted||this.dispatchEvent(new CustomEvent("prism-semantic-viewer:selectionchange",{bubbles:!0,composed:!0,detail:{selection:i}}))},onContextMenu:i=>{n.aborted||this.dispatchEvent(new CustomEvent("prism-semantic-viewer:contextmenu",{bubbles:!0,composed:!0,detail:i}))},onViewStateChange:i=>{n.aborted||this.emitViewState(i)},onPerformanceEvent:i=>{n.aborted||(console.info("[prism-3d-perf]",i),this.dispatchEvent(new CustomEvent("prism-semantic-viewer:performance",{bubbles:!0,composed:!0,detail:i})))}})}publishController(t){this.mounted=this.modes.board,this.mounted.attach(t,{workspace:this.workspace});let a=this.getViewState();a&&this.emitViewState(a)}emitViewState(t){this.dispatchEvent(new CustomEvent("prism-semantic-viewer:viewstatechange",{bubbles:!0,composed:!0,detail:t}))}emitReady(t){console.info("[prism-3d-perf]",t),this.dispatchEvent(new CustomEvent("prism-semantic-viewer:ready",{bubbles:!0,composed:!0,detail:t}))}emitError(t){this.dispatchEvent(new CustomEvent("prism-semantic-viewer:error",{bubbles:!0,detail:{error:t}}))}};Tf(Hn.prototype);function ep(){customElements.get("prism-semantic-viewer")||customElements.define("prism-semantic-viewer",Hn)}window.__PRISM_SEMANTIC_VIEWER_MANUAL_BOOT__=!0;ep();
