var Yo=`:host,
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
`;var Ib=/\/api\/projects\/([^/]+)\/webgpu-3d\/assets\/([^/]+)\/([^/]+)\/(.+)$/,Ab="prism-bundle-cache-a0",jr="manifest.json";function Lr(e){let t;try{t=new URL(e,"http://cache.invalid/")}catch{return null}let a=Ib.exec(t.pathname);if(!a)return null;let[,s,n,r,i]=a.map(decodeURIComponent);if(i.split("/").some(c=>!c||c==="."||c===".."))return null;let o=t.searchParams.get("viewer")||"";return`${s}/${n}/${r}/${i}${o?`?viewer=${o}`:""}`}function Ds(e){return`a_${encodeURIComponent(e)}`}function Rb(e,t,{maxAgeMs:a=2592e6,maxBytes:s=2147483648}={}){let n=new Set,r=[];for(let[o,c]of Object.entries(e))t-Number(c.lastUsed||0)<=a?r.push([o,c]):n.add(o);r.sort((o,c)=>Number(c[1].lastUsed)-Number(o[1].lastUsed));let i=0;for(let[o,c]of r)i+=Number(c.bytes||0),i>s&&n.add(o);return[...n]}var Us=class e{static open(t={}){return e.shared||(e.shared=new e(t)),e.shared}constructor({maxAgeMs:t=2592e6,maxBytes:a=2147483648}={}){this.maxAgeMs=t,this.maxBytes=a,this.stats={hits:0,misses:0,bypassed:0,cachedBytes:0,networkBytes:0,writeErrors:0},this.ready=this.init(),this.flushTimer=null}async init(){try{let t=globalThis.navigator?.storage;if(!t?.getDirectory)return null;let s=await(await t.getDirectory()).getDirectoryHandle(Ab,{create:!0}),n=await s.getFileHandle(jr,{create:!0});if(typeof n.createWritable!="function")return null;let r={};try{let i=await(await n.getFile()).text();r=i?JSON.parse(i).entries||{}:{}}catch{r={}}return this.directory=s,this.entries=r,await this.prune(),globalThis.addEventListener?.("pagehide",()=>void this.flush()),s}catch{return null}}get enabled(){return!!this.directory}async fetchBytes(t,{store:a=!0,signal:s}={}){let n=Lr(t);if(await this.ready,n&&this.directory){let c=await this.read(n);if(c)return this.stats.hits+=1,this.stats.cachedBytes+=c.byteLength,c;this.stats.misses+=1}else this.stats.bypassed+=1;let r=await fetch(t,{cache:"no-store",signal:s});if(!r.ok)throw new Error(`Failed to load ${t}: ${r.status}`);let i=await r.arrayBuffer(),o=Number(r.headers.get("content-length")||0);return this.stats.networkBytes+=i.byteLength,a&&n&&this.directory&&(!o||o===i.byteLength)&&this.write(n,i),i}async fetchJson(t,a={}){let s=await this.fetchBytes(t,a);return JSON.parse(new TextDecoder().decode(s))}async peekJson(t){let a=Lr(t);if(await this.ready,!a||!this.directory)return null;let s=await this.read(a);return s?(this.stats.hits+=1,this.stats.cachedBytes+=s.byteLength,JSON.parse(new TextDecoder().decode(s))):null}async store(t,a){let s=Lr(t);await this.ready,s&&this.directory&&await this.write(s,a)}async read(t){let a=this.entries[t];if(!a)return null;try{let s=await(await this.directory.getFileHandle(Ds(t))).getFile();return s.size!==a.bytes?null:(a.lastUsed=Date.now(),this.scheduleFlush(),await s.arrayBuffer())}catch{return delete this.entries[t],null}}async write(t,a){try{let n=await(await this.directory.getFileHandle(Ds(t),{create:!0})).createWritable();await n.write(a),await n.close(),this.entries[t]={bytes:a.byteLength,lastUsed:Date.now()},this.scheduleFlush()}catch{this.stats.writeErrors+=1}}async prune(t=Date.now()){if(!this.directory)return[];let a=Rb(this.entries,t,{maxAgeMs:this.maxAgeMs,maxBytes:this.maxBytes});for(let n of a)delete this.entries[n],await this.directory.removeEntry(Ds(n)).catch(()=>{});let s=new Set(Object.keys(this.entries).map(Ds));for await(let n of this.directory.keys())n!==jr&&!s.has(n)&&await this.directory.removeEntry(n).catch(()=>{});return a.length&&await this.flush(),a}async clear(){await this.ready,this.directory&&(this.entries={},await this.prune(),await this.flush())}summary(){let t=Object.values(this.entries||{});return{enabled:this.enabled,files:t.length,bytes:t.reduce((a,s)=>a+Number(s.bytes||0),0),...this.stats}}scheduleFlush(){this.flushTimer||(this.flushTimer=setTimeout(()=>{this.flushTimer=null,this.flush()},1e3))}async flush(){if(this.directory)try{let a=await(await this.directory.getFileHandle(jr,{create:!0})).createWritable();await a.write(JSON.stringify({schema:"prism.bundle_cache_manifest.a0",entries:this.entries})),await a.close()}catch{this.stats.writeErrors+=1}}};function _b(e,t){if(!t)return e;let a=new URL(e);return a.searchParams.set("viewer",t),a.toString()}function Jo(e,t,a,s){let n=new URL(a.asset_base||"./",t),r=structuredClone(e||{}),i=o=>!o||typeof o!="string"?o:_b(new URL(o,n).toString(),s);for(let o of["assets","semantic_gltf","schematic_world","schematic_vector","schematic_scene","bom"]){let c=r[o];if(!(!c||typeof c!="object"))for(let[l,f]of Object.entries(c))c[l]=i(f)}return r}function Dr(e){return(e?.readiness?.stage||"semantic-ready")==="semantic-ready"&&(e?.readiness?.progress??100)>=100}var ce=(e,t,a)=>Math.max(t,Math.min(a,e)),zs=(e,t,a)=>e+(t-e)*a;function Ee(e,t){return[e[0]+t[0],e[1]+t[1],e[2]+t[2]]}function Nb(e,t){return[e[0]-t[0],e[1]-t[1],e[2]-t[2]]}function pe(e,t){return[e[0]*t,e[1]*t,e[2]*t]}function Bb(e){return Math.hypot(e[0],e[1],e[2])}function He(e){let t=Bb(e)||1;return pe(e,1/t)}function qe(e,t){return[e[1]*t[2]-e[2]*t[1],e[2]*t[0]-e[0]*t[2],e[0]*t[1]-e[1]*t[0]]}function Ze(e,t){return e[0]*t[0]+e[1]*t[1]+e[2]*t[2]}function Qo(e,t){let a=t/2,s=Math.sin(a),n=He(e);return[n[0]*s,n[1]*s,n[2]*s,Math.cos(a)]}function Gs(e,t){return[e[3]*t[0]+e[0]*t[3]+e[1]*t[2]-e[2]*t[1],e[3]*t[1]-e[0]*t[2]+e[1]*t[3]+e[2]*t[0],e[3]*t[2]+e[0]*t[1]-e[1]*t[0]+e[2]*t[3],e[3]*t[3]-e[0]*t[0]-e[1]*t[1]-e[2]*t[2]]}function Ur(e,t){let a=[t[0],t[1],t[2],0],s=[-e[0],-e[1],-e[2],e[3]];return Gs(Gs(e,a),s).slice(0,3)}function ea(e,t){let a=new Float32Array(16);for(let s=0;s<4;s+=1)for(let n=0;n<4;n+=1)a[s*4+n]=e[n]*t[s*4]+e[4+n]*t[s*4+1]+e[8+n]*t[s*4+2]+e[12+n]*t[s*4+3];return a}function Ks(e,t,a){let s=He(Nb(e,t)),n=He(qe(a,s)),r=qe(s,n);return new Float32Array([n[0],r[0],s[0],0,n[1],r[1],s[1],0,n[2],r[2],s[2],0,-Ze(n,e),-Ze(r,e),-Ze(s,e),1])}function Zo(e,t,a,s){let n=1/Math.tan(e/2);return new Float32Array([n/t,0,0,0,0,n,0,0,0,0,a/(s-a),-1,0,0,a*s/(s-a),0])}function Vs(e,t,a,s){return new Float32Array([2/e,0,0,0,0,2/t,0,0,0,0,1/(s-a),0,0,0,1,1])}function Gr(e){return[(e[0]+e[3])/2,(e[1]+e[4])/2,(e[2]+e[5])/2]}function St(e){return Math.max(.001,Math.hypot(e[3]-e[0],e[4]-e[1],e[5]-e[2])/2)}var Ga=class{constructor(t){let a=Gr(t),s=St(t);this.focus=[...a],this.targetFocus=[...a],this.azimuth=-.62,this.targetAzimuth=this.azimuth,this.polar=.72,this.targetPolar=this.polar,this.distance=s*2.8,this.targetDistance=this.distance,this.orthoScale=s*2.15,this.targetOrthoScale=this.orthoScale,this.sceneRadius=s,this.fov=Math.PI/4}update(t){let a=1-Math.exp(-t*14);this.focus=this.focus.map((s,n)=>zs(s,this.targetFocus[n],a)),this.azimuth=tc(this.azimuth,this.targetAzimuth,a),this.polar=tc(this.polar,this.targetPolar,a),this.distance=zs(this.distance,this.targetDistance,a),this.orthoScale=zs(this.orthoScale,this.targetOrthoScale,a)}snap(){this.focus=[...this.targetFocus],this.azimuth=this.targetAzimuth,this.polar=this.targetPolar,this.distance=this.targetDistance,this.orthoScale=this.targetOrthoScale}basis(){let t=Math.sin(this.polar),a=Math.cos(this.polar),s=He([t*Math.sin(this.azimuth),-t*Math.cos(this.azimuth),a]),n=He([Math.cos(this.azimuth),Math.sin(this.azimuth),0]),r=He(qe(s,n));return{right:n,up:r,back:s}}matrix(t,a,s=!1,n=1){let r=Math.max(.01,t/Math.max(1,a)),{up:i,back:o}=this.basis(),c=Ee(this.focus,pe(o,this.distance)),l=Ks(c,this.focus,i),f=s?Vs(this.orthoScale*n*r,this.orthoScale*n,-this.sceneRadius*40,this.sceneRadius*40):Zo(this.fov,r,Math.max(this.sceneRadius*5e-4,this.distance-this.sceneRadius*3.5),this.distance+this.sceneRadius*4.5);return ea(f,l)}targetMatrix(t,a,s=!1,n=0){let r=(l,f)=>f+(f-l)*n,i=[this.focus,this.azimuth,this.polar,this.distance,this.orthoScale];this.focus=this.focus.map((l,f)=>r(l,this.targetFocus[f]));let o=(l,f)=>f+Math.atan2(Math.sin(f-l),Math.cos(f-l))*n;this.azimuth=o(this.azimuth,this.targetAzimuth),this.polar=o(this.polar,this.targetPolar),this.distance=Math.max(this.sceneRadius*.001,r(this.distance,this.targetDistance)),this.orthoScale=Math.max(this.sceneRadius*.001,r(this.orthoScale,this.targetOrthoScale));let c=this.matrix(t,a,s);return[this.focus,this.azimuth,this.polar,this.distance,this.orthoScale]=i,c}moving(){let t=(a,s)=>Math.abs(a-s)<=Math.max(1e-9,Math.abs(s)*1e-4);return!(this.focus.every((a,s)=>t(a,this.targetFocus[s]))&&t(this.azimuth,this.targetAzimuth)&&t(this.polar,this.targetPolar)&&t(this.distance,this.targetDistance)&&t(this.orthoScale,this.targetOrthoScale))}orbit(t,a){let s=Math.sin(this.targetPolar)<0?-1:1;this.targetAzimuth-=s*t*.006,this.targetPolar=ec(this.targetPolar-a*.006)}isBelow(){return Math.cos(this.targetPolar)<0}pan(t,a,s,n=!1){let{right:r,up:i}=this.basis(),o=n?this.targetOrthoScale/Math.max(1,s):2*this.targetDistance*Math.tan(this.fov/2)/Math.max(1,s),c=Ee(pe(r,-t*o),pe(i,a*o));this.targetFocus=Ee(this.targetFocus,c)}dolly(t,a=!1){let s=Math.exp(t*.0032);a?this.targetOrthoScale=ce(this.targetOrthoScale*s,this.sceneRadius*.008,this.sceneRadius*24):this.targetDistance=ce(this.targetDistance*s,this.sceneRadius*.01,this.sceneRadius*48)}frame(t){if(!t)return;let a=St(t);this.targetFocus=Gr(t),this.targetDistance=Math.max(a*2.8,this.sceneRadius*.02),this.targetOrthoScale=Math.max(a*2.15,this.sceneRadius*.02)}setFocus(t){this.targetFocus=[...t]}setAxis(t,a=!1){t==="z"?(this.targetAzimuth=0,this.targetPolar=a?Math.PI-.015:.015):t==="x"?(this.targetAzimuth=a?-Math.PI/2:Math.PI/2,this.targetPolar=Math.PI/2):(this.targetAzimuth=a?0:Math.PI,this.targetPolar=Math.PI/2)}rotateZ(t=1){this.targetAzimuth+=t*Math.PI/2}flip(){this.targetPolar=ec(Math.PI-this.targetPolar)}};function ec(e){return Math.atan2(Math.sin(e),Math.cos(e))}function tc(e,t,a){let s=Math.atan2(Math.sin(t-e),Math.cos(t-e));return e+s*a}var Hs=class e{static async create(t,a,s={}){let n=await fetch(a,{cache:"default"});if(!n.ok)throw new Error(`Failed to load BoM ${a}: ${n.status}`);let r=await n.json();if(r.schema!=="prism.bom_a0")throw new Error(`Unsupported BoM schema: ${r.schema||"missing"}`);let i=new e(t,r,s);return i.render(),i}constructor(t,a,s){this.container=t,this.payload=a,this.callbacks=s,this.query="",this.selectedRowId="",this.selectedReference="",this.rowsById=new Map((a.rows||[]).map(n=>[n.id,n])),this.componentIndex=new Map(Object.entries(a.componentIndex||{}))}setSelectionByReference(t,a={}){let s=this.componentIndex.get(t);s&&(this.selectedReference=t,this.selectedRowId=s.rowId,this.renderContent(),a.scroll&&this.container.querySelector(`[data-row-id="${Ob(s.rowId)}"]`)?.scrollIntoView({block:"center",behavior:"smooth"}))}clearSelection(){this.selectedReference="",this.selectedRowId="",this.renderContent()}render(){let t=this.filteredRows();this.container.innerHTML=`
      <section class="bom-workspace">
        <header class="bom-toolbar">
          <div>
            <p class="eyebrow">Prism BoM A0</p>
            <h2>Bill of Materials</h2>
            <span data-bom-count>${t.length} of ${(this.payload.rows||[]).length} grouped rows \xB7 ${(this.payload.components||[]).length} components</span>
          </div>
          <label class="bom-search">
            <span>Search</span>
            <input id="bom-search" type="search" value="${Xe(this.query)}" placeholder="Reference, value, footprint, manufacturer..." />
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
            <tr>${a.map(n=>`<th>${Xe(n)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${t.map(n=>this.rowHtml(n,a)).join("")}
          </tbody>
        </table>
      </div>
      ${s?`<aside class="bom-detail">${this.detailHtml(s)}</aside>`:""}
    `}filteredRows(){let t=this.query.trim().toLowerCase(),a=this.payload.rows||[];return t?a.filter(s=>JSON.stringify(s).toLowerCase().includes(t)):a}rowHtml(t,a){return`
      <tr class="${t.id===this.selectedRowId?"selected":""}" data-row-id="${Xe(t.id)}">
        ${a.map(n=>{let r=t.fields?.[n]||"";return n==="Reference"?`<td class="bom-reference-cell">${(t.references||[]).map(i=>`
              <button class="bom-ref-chip ${i===this.selectedReference?"active":""}" data-reference="${Xe(i)}">${Xe(i)}</button>
            `).join("")}</td>`:!r&&Fb(n)?'<td><span class="bom-missing">Missing</span></td>':`<td title="${Xe(r)}">${Xe(r)}</td>`}).join("")}
      </tr>
    `}detailHtml(t){let a=Cb(t,this.payload.displayColumns||[],this.payload.extraColumns||[]);return`
      <div class="bom-detail-head">
        <p class="eyebrow">Line item</p>
        <h3>${Xe((t.references||[]).join(", "))}</h3>
        <span>${t.qty} component${t.qty===1?"":"s"}${t.dnp?" \xB7 DNP":""}</span>
      </div>
      <div class="bom-ref-list">
        ${(t.references||[]).map(s=>`
          <button class="bom-ref-chip detail ${s===this.selectedReference?"active":""}" data-reference="${Xe(s)}">${Xe(s)}</button>
        `).join("")}
      </div>
      <dl class="bom-field-list">
        ${a.map(([s,n])=>`
          <div>
            <dt>${Xe(s)}</dt>
            <dd>${Xe(n)}</dd>
          </div>
        `).join("")}
      </dl>
    `}bind(){let t=this.container.querySelector("#bom-search");t?.addEventListener("input",()=>{this.query=t.value,this.renderContent()}),this.bindContent(this.container)}bindContent(t){t.querySelectorAll("[data-row-id]").forEach(a=>{a.addEventListener("click",s=>{s.target.closest("[data-reference]")||(this.selectedRowId=a.dataset.rowId,this.selectedReference="",this.renderContent())})}),t.querySelectorAll("[data-reference]").forEach(a=>{a.addEventListener("click",s=>{s.stopPropagation();let n=a.dataset.reference;this.setSelectionByReference(n),this.callbacks.onSelectReference?.(n)})})}};function Cb(e,t,a){let s=[],n=new Set(["Reference","Qty"].map(zr));for(let i of t){if(i==="Reference"||i==="Qty")continue;let o=e.fields?.[i]||"";o&&(s.push([i,o]),n.add(zr(i)))}let r=e.canonicalFields||{};for(let i of a){let o=r[i]||"";if(!o)continue;let c=zr(i);n.has(c)||(n.add(c),s.push([i,o]))}return s}function zr(e){return String(e||"").toLowerCase().replace(/[\s_\-()[\]/]+/g,"")}function Fb(e){return["Manufacturer Part Number","Vendor Part Number","Datasheet","Footprint","Value"].includes(e)}function Xe(e){return String(e??"").replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t])}function Ob(e){return String(e).replace(/["\\]/g,"\\$&")}function Kr(e){let t=`${e.nodeName||""} ${e.meshName||""} ${e.material?.name||""}`.toLowerCase();return t.includes("_pad")||t.includes(".pad")||t.endsWith("pad")?"pad":t.includes("silkscreen")?"silkscreen":t.includes("soldermask")?"soldermask":t.includes("paste")?"paste":"substrate"}function Ka(e,t=()=>""){let a=new Map;for(let s of e){let r=`${t(s)}:${JSON.stringify(s.material)}`;a.has(r)||a.set(r,[]),a.get(r).push(s)}return[...a.values()].map(s=>{let n=s.reduce((p,u)=>p+u.position.length/3,0),r=s.reduce((p,u)=>p+u.indices.length,0),i=new Float32Array(n*3),o=new Float32Array(n*3),c=new Uint32Array(n),l=new Uint32Array(n),f=new Uint32Array(r),d=0,h=0,g=[1/0,1/0,1/0,-1/0,-1/0,-1/0];for(let p of s){let u=p.position.length/3;i.set(p.position,d*3),o.set(p.normal,d*3),c.set(p.netId,d),l.set(p.objectFeatureId,d);for(let y=0;y<p.indices.length;y+=1)f[h+y]=Number(p.indices[y])+d;p.bounds&&(g[0]=Math.min(g[0],p.bounds[0]),g[1]=Math.min(g[1],p.bounds[1]),g[2]=Math.min(g[2],p.bounds[2]),g[3]=Math.max(g[3],p.bounds[3]),g[4]=Math.max(g[4],p.bounds[4]),g[5]=Math.max(g[5],p.bounds[5])),d+=u,h+=p.indices.length}return{position:i,normal:o,netId:c,objectFeatureId:l,indices:f,material:s[0].material,groupKey:t(s[0]),bounds:Number.isFinite(g[0])?g:null}})}function Va(e){return!e||e.length!==6?null:[e[0]/1e3,-e[4]/1e3,e[2]/1e3,e[3]/1e3,-e[1]/1e3,e[5]/1e3]}function qs(e){let t=e?.min||[0,0,0],a=e?.max||[.08,.0016,.05];return[t[0],-a[2],t[1],a[0],-t[2],a[1]]}function ya(e){let t=e.filter(a=>Array.isArray(a)&&a.length===6);return t.length?t.reduce((a,s)=>[Math.min(a[0],s[0]),Math.min(a[1],s[1]),Math.min(a[2],s[2]),Math.max(a[3],s[3]),Math.max(a[4],s[4]),Math.max(a[5],s[5])],[...t[0]]):null}function ac(e){let t=e.replace("#","");return[0,2,4].map(a=>parseInt(t.slice(a,a+2),16)/255)}function sc(e,t){if(typeof e?.color=="string"&&/^#[0-9a-fA-F]{6}$/.test(e.color))return[...ac(e.color),1];let a={"F.Cu":"#a9423c","B.Cu":"#315b9a","In1.Cu":"#477a55","In2.Cu":"#806244","In3.Cu":"#347c86","In4.Cu":"#685889","In5.Cu":"#92793e"},s=["#477a55","#806244","#347c86","#685889","#92793e","#82556e"],n=String(e?.name||""),r=Math.max(0,t.findIndex(i=>i.name===n)-1);return[...ac(a[n]||s[r%s.length]),1]}function nc(e,t){let a=t.map(s=>[Number(s.id),Number(s.z_mm||0)]);return a.length<3?!1:(a.sort((s,n)=>s[1]-n[1]),e!==a[0][0]&&e!==a[a.length-1][0])}var za=Object.freeze({gold:[.83,.69,.37,1],silver:[.74,.75,.77,1],copper:[.76,.47,.28,1]});function rc(e){let t=String(e||"").toLowerCase();return/hasl|hal\b|tin|silver|lead/.test(t)?za.silver:/osp|bare|none/.test(t)?za.copper:za.gold}function ic(e,t){let a=String(e?.name||"");return!!a&&(a===t[0]?.name||a===t[t.length-1]?.name)}function oc(e,t){let a=String(e.material?.name||"").endsWith("_bottom"),s=t.find(n=>n.name===(a?"B.Cu":"F.Cu"))||(a?t[t.length-1]:t[0]);return Number(s?.id||0)}function cc(e,t=new Map){let a=new Map;for(let n of e||[]){let r=String(n?.designator||"");if(!r)continue;let i=a.get(r)||{reference:r,featureIds:new Set,modelCount:0},o=Number(n?.featureId)||0;o>0&&i.featureIds.add(o),a.set(r,i)}for(let[n,r]of t||[]){let i=a.get(String(n));i&&(i.modelCount=Math.max(i.modelCount,Number(r)||0))}let s=new Map;for(let[n,r]of a)s.set(n,{reference:n,featureIds:[...r.featureIds].sort((i,o)=>i-o),ambiguous:r.featureIds.size>1||r.modelCount>1});return s}function lc(e,t){let a=[...new Set((Array.isArray(e)?e:[]).map(c=>String(c||"")).filter(Boolean))],s=[],n=[],r=[],i=new Set,o=new Set;for(let c of a){let l=t.get(c);if(!l){r.push(c);continue}if(l.ambiguous){n.push(c);continue}s.push(c),o.add(c);for(let f of l.featureIds)i.add(f)}return{requested:a,applied:s,ambiguous:n,unknown:r,hiddenFeatureIds:i,hiddenReferences:o}}function Xs(e,t){return!!e&&t.has(String(e))}var Pb={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};function z(e){return String(e??"").replace(/[&<>"']/g,t=>Pb[t])}var Ha=`
fn netEmphasized(id: u32) -> bool {
  return id != 0u && id < arrayLength(&netMask) && netMask[id] != 0u;
}
`;function Ws(e){let t=new Set;if(e==null)return t;for(let a of e){let s=Number(a);!Number.isInteger(s)||s<=0||s>4294967295||t.add(s)}return t}function dc(e,t=0){let a=0;for(let n of Ws(e))a=Math.max(a,n);let s=64;for(;s<a+1;)s*=2;return Math.max(s,Math.floor(t)||0)}function uc(e,t){let a=Math.max(64,Math.floor(t)||0),s=new Uint32Array(a);s.fill(0);for(let n of Ws(e))n<a&&(s[n]=1);return s}function ta(e,t){return!Array.isArray(e)||!t?null:e.find(a=>a.name===t||Array.isArray(a.aliases)&&a.aliases.includes(t))||null}function fc(e,t){let a=new Set;if(!Array.isArray(e)||!Array.isArray(t))return a;for(let s of t){if(!s)continue;let n=s.netUid&&e.find(i=>i.uid===s.netUid)||s.netName&&ta(e,s.netName),r=Number(n?.id);Number.isInteger(r)&&r>0&&a.add(r)}return a}var Vr=Object.freeze([[.08,1,.2],[1,.72,.1],[.2,.75,1],[1,.3,.75],[.65,.45,1],[1,.45,.2],[.3,1,.85],[.95,.95,.3]]),hc=`
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
`;function bc(e){let t=null;return Array.isArray(e)&&e.length>=3&&e.slice(0,3).every(a=>Number.isFinite(Number(a)))?t=e.slice(0,3).map(a=>Math.round(Math.min(1,Math.max(0,Number(a)))*255)):typeof e=="string"&&/^#[0-9a-f]{6}$/i.test(e)&&(t=[1,3,5].map(a=>parseInt(e.slice(a,a+2),16))),t?(1<<24|t[0]<<16|t[1]<<8|t[2])>>>0:1}function pc(e){let t=1;for(let s of e)for(let n of s?.keys()||[])t=Math.max(t,n+1);let a=new Uint32Array(Math.max(64,e.length*t));return e.forEach((s,n)=>{for(let[r,i]of s||[])Number.isInteger(r)&&r>0&&(a[n*t+r]=i>>>0)}),{stride:t,data:a}}function jb(e){return(typeof e.composedPath=="function"?e.composedPath():[])[0]??e.target??null}function gc(e){let t=jb(e);if(!t||typeof t!="object")return!1;let a=typeof t.tagName=="string"?t.tagName.toUpperCase():"";return a==="INPUT"||a==="TEXTAREA"||a==="SELECT"||t.isContentEditable===!0}function mc(e){return!!(e.metaKey||e.ctrlKey)}var Lb=4;function yc(e,t=Lb){let a=new Map,s=[];for(let r of e){if(r.placements.length<t){for(let o of r.placements)s.push(Db(r.primitive,o));continue}let i=`${r.placements.map(o=>o.node).join(",")}|${JSON.stringify(r.primitive.material)}`;a.has(i)||a.set(i,[]),a.get(i).push(r)}return{instanced:[...a.values()].map(r=>({primitive:Ub(r.map(i=>i.primitive)),placements:r[0].placements})),baked:Ka(s)}}function Db(e,t){let{rows:a,featureId:s,bounds:n}=t,r=e.position.length/3,i=new Float32Array(r*3),o=new Float32Array(r*3),c=new Uint32Array(r);for(let l=0;l<r;l+=1){let f=l*3,[d,h,g]=[e.position[f],e.position[f+1],e.position[f+2]],[p,u,y]=[e.normal[f],e.normal[f+1],e.normal[f+2]],b=0;for(let m=0;m<3;m+=1){let x=m*4;i[f+m]=a[x]*d+a[x+1]*h+a[x+2]*g+a[x+3],o[f+m]=a[x]*p+a[x+1]*u+a[x+2]*y,b+=o[f+m]**2}b=Math.sqrt(b)||1;for(let m=0;m<3;m+=1)o[f+m]/=b;c[l]=e.objectFeatureId[l]||s||0}return{position:i,normal:o,netId:e.netId,objectFeatureId:c,indices:e.indices,material:e.material,bounds:[...n]}}function Ub(e){if(e.length===1)return e[0];let t=e.reduce((d,h)=>d+h.position.length/3,0),a=e.reduce((d,h)=>d+h.indices.length,0),s=new Float32Array(t*3),n=new Float32Array(t*3),r=new Uint32Array(t),i=new Uint32Array(t),o=new Uint32Array(a),c=[1/0,1/0,1/0,-1/0,-1/0,-1/0],l=0,f=0;for(let d of e){s.set(d.position,l*3),n.set(d.normal,l*3),r.set(d.netId,l),i.set(d.objectFeatureId,l);for(let h=0;h<d.indices.length;h+=1)o[f+h]=d.indices[h]+l;for(let h=0;h<3;h+=1)c[h]=Math.min(c[h],d.bounds[h]),c[h+3]=Math.max(c[h+3],d.bounds[h+3]);l+=d.position.length/3,f+=d.indices.length}return{position:s,normal:n,netId:r,objectFeatureId:i,indices:o,material:e[0].material,bounds:c}}var xc=class{_listeners={};addEventListener(e,t){let a=this._listeners;return a[e]===void 0&&(a[e]=[]),a[e].indexOf(t)===-1&&a[e].push(t),this}removeEventListener(e,t){let a=this._listeners[e];if(a!==void 0){let s=a.indexOf(t);s!==-1&&a.splice(s,1)}return this}dispatchEvent(e){let t=this._listeners[e.type];if(t!==void 0){let a=t.slice(0);for(let s=0,n=a.length;s<n;s++)a[s].call(this,e)}return this}dispose(){for(let e in this._listeners)delete this._listeners[e]}},At=class{_disposed=!1;_name;_parent;_child;_attributes;constructor(e,t,a,s={}){if(this._name=e,this._parent=t,this._child=a,this._attributes=s,!t.isOnGraph(a))throw new Error("Cannot connect disconnected graphs.")}getName(){return this._name}getParent(){return this._parent}getChild(){return this._child}setChild(e){return this._child=e,this}getAttributes(){return this._attributes}dispose(){this._disposed||(this._parent._destroyRef(this),this._disposed=!0)}isDisposed(){return this._disposed}},Hr=class extends xc{_emptySet=new Set;_edges=new Set;_parentEdges=new Map;_childEdges=new Map;listEdges(){return Array.from(this._edges)}listParentEdges(e){return Array.from(this._childEdges.get(e)||this._emptySet)}listParents(e){let t=new Set;for(let a of this.listParentEdges(e))t.add(a.getParent());return Array.from(t)}listChildEdges(e){return Array.from(this._parentEdges.get(e)||this._emptySet)}listChildren(e){let t=new Set;for(let a of this.listChildEdges(e))t.add(a.getChild());return Array.from(t)}disconnectParents(e,t){for(let a of this.listParentEdges(e))(!t||t(a.getParent()))&&a.dispose();return this}_createEdge(e,t,a,s){let n=new At(e,t,a,s);this._edges.add(n);let r=n.getParent();this._parentEdges.has(r)||this._parentEdges.set(r,new Set),this._parentEdges.get(r).add(n);let i=n.getChild();return this._childEdges.has(i)||this._childEdges.set(i,new Set),this._childEdges.get(i).add(n),n}_destroyEdge(e){return this._edges.delete(e),this._parentEdges.get(e.getParent()).delete(e),this._childEdges.get(e.getChild()).delete(e),this}},Te=class{list=[];constructor(e){if(e)for(let t of e)this.list.push(t)}add(e){this.list.push(e)}remove(e){let t=this.list.indexOf(e);t>=0&&this.list.splice(t,1)}removeChild(e){let t=[];for(let a of this.list)a.getChild()===e&&t.push(a);for(let a of t)this.remove(a);return t}listRefsByChild(e){let t=[];for(let a of this.list)a.getChild()===e&&t.push(a);return t}values(){return this.list}},re=class{set=new Set;map=new Map;constructor(e){if(e)for(let t of e)this.add(t)}add(e){let t=e.getChild();this.removeChild(t),this.set.add(e),this.map.set(t,e)}remove(e){this.set.delete(e),this.map.delete(e.getChild())}removeChild(e){let t=this.map.get(e)||null;return t&&this.remove(t),t}getRefByChild(e){return this.map.get(e)||null}values(){return Array.from(this.set)}},ge=class{map={};constructor(e){e&&Object.assign(this.map,e)}set(e,t){this.map[e]=t}delete(e){delete this.map[e]}get(e){return this.map[e]||null}keys(){return Object.keys(this.map)}values(){return Object.values(this.map)}},ee=Symbol("attributes"),It=Symbol("immutableKeys"),vc=class wc extends xc{_disposed=!1;graph;[ee];[It];constructor(t){super(),this.graph=t,this[It]=new Set,this[ee]=this._createAttributes()}getDefaults(){return{}}_createAttributes(){let t=this.getDefaults(),a={};for(let s in t){let n=t[s];if(n instanceof wc){let r=this.graph._createEdge(s,this,n);this[It].add(s),a[s]=r}else a[s]=n}return a}isOnGraph(t){return this.graph===t.graph}isDisposed(){return this._disposed}dispose(){this._disposed||(this.graph.listChildEdges(this).forEach(t=>t.dispose()),this.graph.disconnectParents(this),this._disposed=!0,this.dispatchEvent({type:"dispose"}))}detach(){return this.graph.disconnectParents(this),this}swap(t,a){for(let s in this[ee]){let n=this[ee][s];if(n instanceof At){let r=n;r.getChild()===t&&this.setRef(s,a,r.getAttributes())}else if(n instanceof Te)for(let r of n.listRefsByChild(t)){let i=r.getAttributes();this.removeRef(s,t),this.addRef(s,a,i)}else if(n instanceof re){let r=n.getRefByChild(t);if(r){let i=r.getAttributes();this.removeRef(s,t),this.addRef(s,a,i)}}else if(n instanceof ge)for(let r of n.keys()){let i=n.get(r);i.getChild()===t&&this.setRefMap(s,r,a,i.getAttributes())}}return this}get(t){return this[ee][t]}set(t,a){return this[ee][t]=a,this.dispatchEvent({type:"change",attribute:t})}getRef(t){let a=this[ee][t];return a?a.getChild():null}setRef(t,a,s){if(this[It].has(t))throw new Error(`Cannot overwrite immutable attribute, "${t}".`);let n=this[ee][t];if(n&&n.dispose(),!a)return this;let r=this.graph._createEdge(t,this,a,s);return this[ee][t]=r,this.dispatchEvent({type:"change",attribute:t})}listRefs(t){return this.assertRefList(t).values().map(a=>a.getChild())}addRef(t,a,s){let n=this.graph._createEdge(t,this,a,s);return this.assertRefList(t).add(n),this.dispatchEvent({type:"change",attribute:t})}removeRef(t,a){let s=this.assertRefList(t);if(s instanceof Te)for(let n of s.listRefsByChild(a))n.dispose();else{let n=s.getRefByChild(a);n&&n.dispose()}return this}assertRefList(t){let a=this[ee][t];if(a instanceof Te||a instanceof re)return a;throw new Error(`Expected RefList or RefSet for attribute "${t}"`)}listRefMapKeys(t){return this.assertRefMap(t).keys()}listRefMapValues(t){return this.assertRefMap(t).values().map(a=>a.getChild())}getRefMap(t,a){let s=this.assertRefMap(t).get(a);return s?s.getChild():null}setRefMap(t,a,s,n){let r=this.assertRefMap(t),i=r.get(a);if(i&&i.dispose(),!s)return this;n=Object.assign(n||{},{key:a});let o=this.graph._createEdge(t,this,s,{...n,key:a});return r.set(a,o),this.dispatchEvent({type:"change",attribute:t,key:a})}assertRefMap(t){let a=this[ee][t];if(a instanceof ge)return a;throw new Error(`Expected RefMap for attribute "${t}"`)}dispatchEvent(t){return super.dispatchEvent({...t,target:this}),this.graph.dispatchEvent({...t,target:this,type:`node:${t.type}`}),this}_destroyRef(t){let a=t.getName();if(this[ee][a]===t)this[ee][a]=null,this[It].has(a)&&t.getChild().dispose();else if(this[ee][a]instanceof Te)this[ee][a].remove(t);else if(this[ee][a]instanceof re)this[ee][a].remove(t);else if(this[ee][a]instanceof ge){let s=this[ee][a];for(let n of s.keys())s.get(n)===t&&s.delete(n)}else return;this.graph._destroyEdge(t),this.dispatchEvent({type:"change",attribute:a})}};var Ac="v4.4.2",_t="@glb.bin",C=(function(e){return e.ACCESSOR="Accessor",e.ANIMATION="Animation",e.ANIMATION_CHANNEL="AnimationChannel",e.ANIMATION_SAMPLER="AnimationSampler",e.BUFFER="Buffer",e.CAMERA="Camera",e.MATERIAL="Material",e.MESH="Mesh",e.PRIMITIVE="Primitive",e.PRIMITIVE_TARGET="PrimitiveTarget",e.NODE="Node",e.ROOT="Root",e.SCENE="Scene",e.SKIN="Skin",e.TEXTURE="Texture",e.TEXTURE_INFO="TextureInfo",e})({});var Gb=(function(e){return e.ARRAY_BUFFER="ARRAY_BUFFER",e.ELEMENT_ARRAY_BUFFER="ELEMENT_ARRAY_BUFFER",e.INVERSE_BIND_MATRICES="INVERSE_BIND_MATRICES",e.OTHER="OTHER",e.SPARSE="SPARSE",e})({}),et=(function(e){return e[e.R=4096]="R",e[e.G=256]="G",e[e.B=16]="B",e[e.A=1]="A",e})({});var zb=class extends Float32Array{constructor(){throw super(),new Error("Unsupported typed array instantiation.")}},an={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5131:typeof Float16Array<"u"?Float16Array:zb,5126:Float32Array,5130:Float64Array},q=class{static createBufferFromDataURI(e){if(typeof Buffer>"u"){let t=atob(e.split(",")[1]),a=new Uint8Array(t.length);for(let s=0;s<t.length;s++)a[s]=t.charCodeAt(s);return a}else{let t=e.split(",")[1],a=e.indexOf("base64")>=0;return Buffer.from(t,a?"base64":"utf8")}}static encodeText(e){return new TextEncoder().encode(e)}static decodeText(e){return new TextDecoder().decode(e)}static concat(e){let t=0;for(let n of e)t+=n.byteLength;let a=new Uint8Array(t),s=0;for(let n of e)a.set(n,s),s+=n.byteLength;return a}static pad(e,t=0){let a=this.padNumber(e.byteLength);if(a===e.byteLength)return e;let s=new Uint8Array(a);if(s.set(e),t!==0)for(let n=e.byteLength;n<a;n++)s[n]=t;return s}static padNumber(e){return Math.ceil(e/4)*4}static equals(e,t){if(e===t)return!0;if(e.byteLength!==t.byteLength)return!1;let a=e.byteLength;for(;a--;)if(e[a]!==t[a])return!1;return!0}static toView(e,t=0,a=1/0){return new Uint8Array(e.buffer,e.byteOffset+t,Math.min(e.byteLength,a))}static assertView(e){if(e&&!ArrayBuffer.isView(e))throw new Error(`Method requires Uint8Array parameter; received "${typeof e}".`);return e}};var Kb=class{match(e){return e.length>=3&&e[0]===255&&e[1]===216&&e[2]===255}getSize(e){let t=new DataView(e.buffer,e.byteOffset+4),a,s;for(;t.byteLength;){if(a=t.getUint16(0,!1),Hb(t,a),s=t.getUint8(a+1),s===192||s===193||s===194)return[t.getUint16(a+7,!1),t.getUint16(a+5,!1)];t=new DataView(e.buffer,t.byteOffset+a+2)}throw new TypeError("Invalid JPG, no size found")}getChannels(e){return 3}},Vb=class Rc{static PNG_FRIED_CHUNK_NAME="CgBI";match(t){return t.length>=8&&t[0]===137&&t[1]===80&&t[2]===78&&t[3]===71&&t[4]===13&&t[5]===10&&t[6]===26&&t[7]===10}getSize(t){let a=new DataView(t.buffer,t.byteOffset);return q.decodeText(t.slice(12,16))===Rc.PNG_FRIED_CHUNK_NAME?[a.getUint32(32,!1),a.getUint32(36,!1)]:[a.getUint32(16,!1),a.getUint32(20,!1)]}getChannels(t){return 4}},ct=class{static impls={"image/jpeg":new Kb,"image/png":new Vb};static registerFormat(e,t){this.impls[e]=t}static getMimeType(e){for(let t in this.impls)if(this.impls[t].match(e))return t;return null}static getSize(e,t){return this.impls[t]?this.impls[t].getSize(e):null}static getChannels(e,t){return this.impls[t]?this.impls[t].getChannels(e):null}static getVRAMByteLength(e,t){if(!this.impls[t])return null;if(this.impls[t].getVRAMByteLength)return this.impls[t].getVRAMByteLength(e);let a=0,s=4,n=this.getSize(e,t);if(!n)return null;for(;n[0]>1||n[1]>1;)a+=n[0]*n[1]*s,n[0]=Math.max(Math.floor(n[0]/2),1),n[1]=Math.max(Math.floor(n[1]/2),1);return a+=1*s,a}static mimeTypeToExtension(e){return e==="image/jpeg"?"jpg":e.split("/").pop()}static extensionToMimeType(e){return e==="jpg"?"image/jpeg":e?`image/${e}`:""}};function Hb(e,t){if(t>e.byteLength)throw new TypeError("Corrupt JPG, exceeded buffer limits");if(e.getUint8(t)!==255)throw new TypeError("Invalid JPG, marker table corrupted");return e}var xa=class{static basename(e){let t=e.split(/[\\/]/).pop();return t.substring(0,t.lastIndexOf("."))}static extension(e){if(e.startsWith("data:image/")){let t=e.match(/data:(image\/\w+)/)[1];return ct.mimeTypeToExtension(t)}else{if(e.startsWith("data:model/gltf+json"))return"gltf";if(e.startsWith("data:model/gltf-binary"))return"glb";if(e.startsWith("data:application/"))return"bin"}return e.split(/[\\/]/).pop().split(/[.]/).pop()}},Wr=typeof Float32Array<"u"?Float32Array:Array;Math.PI/180;180/Math.PI;function qb(){var e=new Wr(3);return Wr!=Float32Array&&(e[0]=0,e[1]=0,e[2]=0),e}function qr(e){var t=e[0],a=e[1],s=e[2];return Math.sqrt(t*t+a*a+s*s)}function Xb(e,t,a){var s=t[0],n=t[1],r=t[2],i=a[3]*s+a[7]*n+a[11]*r+a[15];return i=i||1,e[0]=(a[0]*s+a[4]*n+a[8]*r+a[12])/i,e[1]=(a[1]*s+a[5]*n+a[9]*r+a[13])/i,e[2]=(a[2]*s+a[6]*n+a[10]*r+a[14])/i,e}(function(){var e=qb();return function(t,a,s,n,r,i){var o,c;for(a||(a=3),s||(s=0),n?c=Math.min(n*a+s,t.length):c=t.length,o=s;o<c;o+=a)e[0]=t[o],e[1]=t[o+1],e[2]=t[o+2],r(e,e,i),t[o]=e[0],t[o+1]=e[1],t[o+2]=e[2];return t}})();function _c(e){let t=Nc(),a=e.propertyType==="Node"?[e]:e.listChildren();for(let s of a)s.traverse(n=>{let r=n.getMesh();if(!r)return;let i=Wb(r,n.getWorldMatrix());i.min.every(isFinite)&&i.max.every(isFinite)&&($r(i.min,t),$r(i.max,t))});return t}function Wb(e,t){let a=Nc();for(let s of e.listPrimitives()){let n=s.getAttribute("POSITION"),r=s.getIndices();if(!n)continue;let i=[0,0,0],o=[0,0,0];for(let c=0,l=r?r.getCount():n.getCount();c<l;c++){let f=r?r.getScalar(c):c;i=n.getElement(f,i),o=Xb(o,i,t),$r(o,a)}}return a}function $r(e,t){for(let a=0;a<3;a++)t.min[a]=Math.min(e[a],t.min[a]),t.max[a]=Math.max(e[a],t.max[a])}function Nc(){return{min:[1/0,1/0,1/0],max:[-1/0,-1/0,-1/0]}}var Mc="https://null.example",Xr=class{static DEFAULT_INIT={};static PROTOCOL_REGEXP=/^[a-zA-Z]+:\/\//;static dirname(e){let t=e.lastIndexOf("/");return t===-1?"./":e.substring(0,t+1)}static basename(e){return xa.basename(new URL(e,Mc).pathname)}static extension(e){return xa.extension(new URL(e,Mc).pathname)}static resolve(e,t){if(!this.isRelativePath(t))return t;let a=e.split("/"),s=t.split("/");a.pop();for(let n=0;n<s.length;n++)s[n]!=="."&&(s[n]===".."?a.pop():a.push(s[n]));return a.join("/")}static isAbsoluteURL(e){return this.PROTOCOL_REGEXP.test(e)}static isRelativePath(e){return!/^(?:[a-zA-Z]+:)?\//.test(e)}};function kc(e){return Object.prototype.toString.call(e)==="[object Object]"}function aa(e){if(kc(e)===!1)return!1;let t=e.constructor;if(t===void 0)return!0;let a=t.prototype;return!(kc(a)===!1||Object.hasOwn(a,"isPrototypeOf")===!1)}var $b=(function(e){return e[e.SILENT=4]="SILENT",e[e.ERROR=3]="ERROR",e[e.WARN=2]="WARN",e[e.INFO=1]="INFO",e[e.DEBUG=0]="DEBUG",e})({}),sn=class Bc{verbosity;static Verbosity=$b;static DEFAULT_INSTANCE=new Bc(1);constructor(t){this.verbosity=t}debug(t){this.verbosity<=0&&console.debug(t)}info(t){this.verbosity<=1&&console.info(t)}warn(t){this.verbosity<=2&&console.warn(t)}error(t){this.verbosity<=3&&console.error(t)}};function Yb(e){var t=e[0],a=e[1],s=e[2],n=e[3],r=e[4],i=e[5],o=e[6],c=e[7],l=e[8],f=e[9],d=e[10],h=e[11],g=e[12],p=e[13],u=e[14],y=e[15],b=t*i-a*r,m=t*o-s*r,x=a*o-s*i,M=l*p-f*g,E=l*u-d*g,T=f*u-d*p,I=t*T-a*E+s*M,A=r*T-i*E+o*M,R=l*x-f*m+d*b,_=g*x-p*m+u*b;return c*I-n*A+y*R-h*_}function Jb(e,t,a){var s=t[0],n=t[1],r=t[2],i=t[3],o=t[4],c=t[5],l=t[6],f=t[7],d=t[8],h=t[9],g=t[10],p=t[11],u=t[12],y=t[13],b=t[14],m=t[15],x=a[0],M=a[1],E=a[2],T=a[3];return e[0]=x*s+M*o+E*d+T*u,e[1]=x*n+M*c+E*h+T*y,e[2]=x*r+M*l+E*g+T*b,e[3]=x*i+M*f+E*p+T*m,x=a[4],M=a[5],E=a[6],T=a[7],e[4]=x*s+M*o+E*d+T*u,e[5]=x*n+M*c+E*h+T*y,e[6]=x*r+M*l+E*g+T*b,e[7]=x*i+M*f+E*p+T*m,x=a[8],M=a[9],E=a[10],T=a[11],e[8]=x*s+M*o+E*d+T*u,e[9]=x*n+M*c+E*h+T*y,e[10]=x*r+M*l+E*g+T*b,e[11]=x*i+M*f+E*p+T*m,x=a[12],M=a[13],E=a[14],T=a[15],e[12]=x*s+M*o+E*d+T*u,e[13]=x*n+M*c+E*h+T*y,e[14]=x*r+M*l+E*g+T*b,e[15]=x*i+M*f+E*p+T*m,e}function Qb(e,t){var a=t[0],s=t[1],n=t[2],r=t[4],i=t[5],o=t[6],c=t[8],l=t[9],f=t[10];return e[0]=Math.sqrt(a*a+s*s+n*n),e[1]=Math.sqrt(r*r+i*i+o*o),e[2]=Math.sqrt(c*c+l*l+f*f),e}function Zb(e,t){var a=new Wr(3);Qb(a,t);var s=1/a[0],n=1/a[1],r=1/a[2],i=t[0]*s,o=t[1]*n,c=t[2]*r,l=t[4]*s,f=t[5]*n,d=t[6]*r,h=t[8]*s,g=t[9]*n,p=t[10]*r,u=i+f+p,y=0;return u>0?(y=Math.sqrt(u+1)*2,e[3]=.25*y,e[0]=(d-g)/y,e[1]=(h-c)/y,e[2]=(o-l)/y):i>f&&i>p?(y=Math.sqrt(1+i-f-p)*2,e[3]=(d-g)/y,e[0]=.25*y,e[1]=(o+l)/y,e[2]=(h+c)/y):f>p?(y=Math.sqrt(1+f-i-p)*2,e[3]=(h-c)/y,e[0]=(o+l)/y,e[1]=.25*y,e[2]=(d+g)/y):(y=Math.sqrt(1+p-i-f)*2,e[3]=(o-l)/y,e[0]=(h+c)/y,e[1]=(d+g)/y,e[2]=.25*y),e}var le=class qa{static identity(t){return t}static eq(t,a,s=1e-5){if(t.length!==a.length)return!1;for(let n=0;n<t.length;n++)if(Math.abs(t[n]-a[n])>s)return!1;return!0}static clamp(t,a,s){return t<a?a:t>s?s:t}static decodeNormalizedInt(t,a){switch(a){case 5126:return t;case 5123:return t/65535;case 5121:return t/255;case 5122:return Math.max(t/32767,-1);case 5120:return Math.max(t/127,-1);default:throw new Error("Invalid component type.")}}static encodeNormalizedInt(t,a){switch(a){case 5126:return t;case 5123:return Math.round(qa.clamp(t,0,1)*65535);case 5121:return Math.round(qa.clamp(t,0,1)*255);case 5122:return Math.round(qa.clamp(t,-1,1)*32767);case 5120:return Math.round(qa.clamp(t,-1,1)*127);default:throw new Error("Invalid component type.")}}static decompose(t,a,s,n){let r=qr([t[0],t[1],t[2]]),i=qr([t[4],t[5],t[6]]),o=qr([t[8],t[9],t[10]]);Yb(t)<0&&(r=-r),a[0]=t[12],a[1]=t[13],a[2]=t[14];let c=t.slice(),l=1/r,f=1/i,d=1/o;c[0]*=l,c[1]*=l,c[2]*=l,c[4]*=f,c[5]*=f,c[6]*=f,c[8]*=d,c[9]*=d,c[10]*=d,Zb(s,c),n[0]=r,n[1]=i,n[2]=o}static compose(t,a,s,n){let r=n,i=a[0],o=a[1],c=a[2],l=a[3],f=i+i,d=o+o,h=c+c,g=i*f,p=i*d,u=i*h,y=o*d,b=o*h,m=c*h,x=l*f,M=l*d,E=l*h,T=s[0],I=s[1],A=s[2];return r[0]=(1-(y+m))*T,r[1]=(p+E)*T,r[2]=(u-M)*T,r[3]=0,r[4]=(p-E)*I,r[5]=(1-(g+m))*I,r[6]=(b+x)*I,r[7]=0,r[8]=(u+M)*A,r[9]=(b-x)*A,r[10]=(1-(g+y))*A,r[11]=0,r[12]=t[0],r[13]=t[1],r[14]=t[2],r[15]=1,r}};function ep(e,t){if(!!e!=!!t)return!1;let a=e.getChild(),s=t.getChild();return a===s||a.equals(s)}function tp(e,t){if(!!e!=!!t)return!1;let a=e.values(),s=t.values();if(a.length!==s.length)return!1;for(let n=0;n<a.length;n++){let r=a[n],i=s[n];if(r.getChild()!==i.getChild()&&!r.getChild().equals(i.getChild()))return!1}return!0}function ap(e,t){if(!!e!=!!t)return!1;let a=e.keys(),s=t.keys();if(a.length!==s.length)return!1;for(let n of a){let r=e.get(n),i=t.get(n);if(!!r!=!!i)return!1;let o=r.getChild(),c=i.getChild();if(o!==c&&!o.equals(c))return!1}return!0}function Cc(e,t){if(e===t)return!0;if(!!e!=!!t||!e||!t||e.length!==t.length)return!1;for(let a=0;a<e.length;a++)if(e[a]!==t[a])return!1;return!0}function Fc(e,t){if(e===t)return!0;if(!!e!=!!t)return!1;if(!aa(e)||!aa(t))return e===t;let a=e,s=t,n=0,r=0,i;for(i in a)n++;for(i in s)r++;if(n!==r)return!1;for(i in a){let o=a[i],c=s[i];if(en(o)&&en(c)){if(!Cc(o,c))return!1}else if(aa(o)&&aa(c)){if(!Fc(o,c))return!1}else if(o!==c)return!1}return!0}function en(e){return Array.isArray(e)||ArrayBuffer.isView(e)}var sp="23456789abdegjkmnpqrvwxyzABDEGJKMNPQRVWXYZ",np=999,rp=6,Ec=new Set,ip=function(){let e="";for(let t=0;t<rp;t++)e+=sp.charAt(Math.floor(Math.random()*42));return e},op=function(){for(let e=0;e<np;e++){let t=ip();if(!Ec.has(t))return Ec.add(t),t}return""},Nt=e=>e,cp=new Set,Qr=class extends vc{constructor(e,t=""){super(e),this[ee].name=t,this.init(),this.dispatchEvent({type:"create"})}getGraph(){return this.graph}getDefaults(){return Object.assign(super.getDefaults(),{name:"",extras:{}})}set(e,t){return Array.isArray(t)&&(t=t.slice()),super.set(e,t)}getName(){return this.get("name")}setName(e){return this.set("name",e)}getExtras(){return this.get("extras")}setExtras(e){return this.set("extras",e)}clone(){let e=this.constructor;return new e(this.graph).copy(this,Nt)}copy(e,t=Nt){for(let a in this[ee]){let s=this[ee][a];if(s instanceof At)this[It].has(a)||s.dispose();else if(s instanceof Te||s instanceof re)for(let n of s.values())n.dispose();else if(s instanceof ge)for(let n of s.values())n.dispose()}for(let a in e[ee]){let s=this[ee][a],n=e[ee][a];if(n instanceof At)this[It].has(a)?s.getChild().copy(t(n.getChild()),t):this.setRef(a,t(n.getChild()),n.getAttributes());else if(n instanceof re||n instanceof Te)for(let r of n.values())this.addRef(a,t(r.getChild()),r.getAttributes());else if(n instanceof ge)for(let r of n.keys()){let i=n.get(r);this.setRefMap(a,r,t(i.getChild()),i.getAttributes())}else aa(n)?this[ee][a]=JSON.parse(JSON.stringify(n)):Array.isArray(n)||n instanceof ArrayBuffer||ArrayBuffer.isView(n)?this[ee][a]=n.slice():this[ee][a]=n}return this}equals(e,t=cp){if(this===e)return!0;if(this.propertyType!==e.propertyType)return!1;for(let a in this[ee]){if(t.has(a))continue;let s=this[ee][a],n=e[ee][a];if(s instanceof At||n instanceof At){if(!ep(s,n))return!1}else if(s instanceof re||n instanceof re||s instanceof Te||n instanceof Te){if(!tp(s,n))return!1}else if(s instanceof ge||n instanceof ge){if(!ap(s,n))return!1}else if(aa(s)||aa(n)){if(!Fc(s,n))return!1}else if(en(s)||en(n)){if(!Cc(s,n))return!1}else if(s!==n)return!1}return!0}detach(){return this.graph.disconnectParents(this,e=>e.propertyType!=="Root"),this}listParents(){return this.graph.listParents(this)}},Ne=class extends Qr{getDefaults(){return Object.assign(super.getDefaults(),{extensions:new ge})}getExtension(e){return this.getRefMap("extensions",e)}setExtension(e,t){return t&&t._validateParent(this),this.setRefMap("extensions",e,t)}listExtensions(){return this.listRefMapValues("extensions")}},G=class me extends Ne{static Type={SCALAR:"SCALAR",VEC2:"VEC2",VEC3:"VEC3",VEC4:"VEC4",MAT2:"MAT2",MAT3:"MAT3",MAT4:"MAT4"};static ComponentType={BYTE:5120,UNSIGNED_BYTE:5121,SHORT:5122,UNSIGNED_SHORT:5123,UNSIGNED_INT:5125,FLOAT:5126,FLOAT16:5131,FLOAT64:5130};init(){this.propertyType="Accessor"}getDefaults(){return Object.assign(super.getDefaults(),{array:null,type:me.Type.SCALAR,componentType:me.ComponentType.FLOAT,normalized:!1,sparse:!1,buffer:null})}static getElementSize(t){switch(t){case me.Type.SCALAR:return 1;case me.Type.VEC2:return 2;case me.Type.VEC3:return 3;case me.Type.VEC4:return 4;case me.Type.MAT2:return 4;case me.Type.MAT3:return 9;case me.Type.MAT4:return 16;default:throw new Error("Unexpected type: "+t)}}static getComponentSize(t){switch(t){case me.ComponentType.BYTE:case me.ComponentType.UNSIGNED_BYTE:return 1;case me.ComponentType.SHORT:case me.ComponentType.UNSIGNED_SHORT:return 2;case me.ComponentType.UNSIGNED_INT:case me.ComponentType.FLOAT:return 4;case me.ComponentType.FLOAT16:return 2;case me.ComponentType.FLOAT64:return 8;default:throw new Error("Unexpected component type: "+t)}}getMinNormalized(t){let a=this.getNormalized(),s=this.getElementSize(),n=this.getComponentType();if(this.getMin(t),a)for(let r=0;r<s;r++)t[r]=le.decodeNormalizedInt(t[r],n);return t}getMin(t){let a=this.getArray(),s=this.getCount(),n=this.getElementSize();for(let r=0;r<n;r++)t[r]=1/0;for(let r=0;r<s*n;r+=n)for(let i=0;i<n;i++){let o=a[r+i];Number.isFinite(o)&&(t[i]=Math.min(t[i],o))}return t}getMaxNormalized(t){let a=this.getNormalized(),s=this.getElementSize(),n=this.getComponentType();if(this.getMax(t),a)for(let r=0;r<s;r++)t[r]=le.decodeNormalizedInt(t[r],n);return t}getMax(t){let a=this.get("array"),s=this.getCount(),n=this.getElementSize();for(let r=0;r<n;r++)t[r]=-1/0;for(let r=0;r<s*n;r+=n)for(let i=0;i<n;i++){let o=a[r+i];Number.isFinite(o)&&(t[i]=Math.max(t[i],o))}return t}getCount(){let t=this.get("array");return t?t.length/this.getElementSize():0}getType(){return this.get("type")}setType(t){return this.set("type",t)}getElementSize(){return me.getElementSize(this.get("type"))}getComponentSize(){return this.get("array").BYTES_PER_ELEMENT}getComponentType(){return this.get("componentType")}getNormalized(){return this.get("normalized")}setNormalized(t){return this.set("normalized",t)}getScalar(t){let a=this.getElementSize(),s=this.getComponentType(),n=this.getArray();return this.getNormalized()?le.decodeNormalizedInt(n[t*a],s):n[t*a]}setScalar(t,a){let s=this.getElementSize(),n=this.getComponentType(),r=this.getArray();return this.getNormalized()?r[t*s]=le.encodeNormalizedInt(a,n):r[t*s]=a,this}getElement(t,a){let s=this.getNormalized(),n=this.getElementSize(),r=this.getComponentType(),i=this.getArray();for(let o=0;o<n;o++)s?a[o]=le.decodeNormalizedInt(i[t*n+o],r):a[o]=i[t*n+o];return a}setElement(t,a){let s=this.getNormalized(),n=this.getElementSize(),r=this.getComponentType(),i=this.getArray();for(let o=0;o<n;o++)s?i[t*n+o]=le.encodeNormalizedInt(a[o],r):i[t*n+o]=a[o];return this}getSparse(){return this.get("sparse")}setSparse(t){return this.set("sparse",t)}getBuffer(){return this.getRef("buffer")}setBuffer(t){return this.setRef("buffer",t)}getArray(){return this.get("array")}setArray(t){return this.set("componentType",t?lp(t):me.ComponentType.FLOAT),this.set("array",t),this}getByteLength(){let t=this.get("array");return t?t.byteLength:0}};function lp(e){switch(e.constructor){case Float32Array:return G.ComponentType.FLOAT;case Uint32Array:return G.ComponentType.UNSIGNED_INT;case Uint16Array:return G.ComponentType.UNSIGNED_SHORT;case Uint8Array:return G.ComponentType.UNSIGNED_BYTE;case Int16Array:return G.ComponentType.SHORT;case Int8Array:return G.ComponentType.BYTE;case Float64Array:return G.ComponentType.FLOAT64}if(typeof Float16Array<"u"&&e.constructor===Float16Array)return G.ComponentType.FLOAT16;throw new Error("Unknown accessor componentType.")}var Oc=class extends Ne{init(){this.propertyType="Animation"}getDefaults(){return Object.assign(super.getDefaults(),{channels:new re,samplers:new re})}addChannel(e){return this.addRef("channels",e)}removeChannel(e){return this.removeRef("channels",e)}listChannels(){return this.listRefs("channels")}addSampler(e){return this.addRef("samplers",e)}removeSampler(e){return this.removeRef("samplers",e)}listSamplers(){return this.listRefs("samplers")}},Zr=class extends Ne{static TargetPath={TRANSLATION:"translation",ROTATION:"rotation",SCALE:"scale",WEIGHTS:"weights"};init(){this.propertyType="AnimationChannel"}getDefaults(){return Object.assign(super.getDefaults(),{targetPath:null,targetNode:null,sampler:null})}getTargetPath(){return this.get("targetPath")}setTargetPath(e){return this.set("targetPath",e)}getTargetNode(){return this.getRef("targetNode")}setTargetNode(e){return this.setRef("targetNode",e)}getSampler(){return this.getRef("sampler")}setSampler(e){return this.setRef("sampler",e)}},nn=class Pc extends Ne{static Interpolation={LINEAR:"LINEAR",STEP:"STEP",CUBICSPLINE:"CUBICSPLINE"};init(){this.propertyType="AnimationSampler"}getDefaultAttributes(){return Object.assign(super.getDefaults(),{interpolation:Pc.Interpolation.LINEAR,input:null,output:null})}getInterpolation(){return this.get("interpolation")}setInterpolation(t){return this.set("interpolation",t)}getInput(){return this.getRef("input")}setInput(t){return this.setRef("input",t,{usage:"OTHER"})}getOutput(){return this.getRef("output")}setOutput(t){return this.setRef("output",t,{usage:"OTHER"})}},jc=class extends Ne{init(){this.propertyType="Buffer"}getDefaults(){return Object.assign(super.getDefaults(),{uri:""})}getURI(){return this.get("uri")}setURI(e){return this.set("uri",e)}},rn=class Lc extends Ne{static Type={PERSPECTIVE:"perspective",ORTHOGRAPHIC:"orthographic"};init(){this.propertyType="Camera"}getDefaults(){return Object.assign(super.getDefaults(),{type:Lc.Type.PERSPECTIVE,znear:.1,zfar:100,aspectRatio:null,yfov:Math.PI*2*50/360,xmag:1,ymag:1})}getType(){return this.get("type")}setType(t){return this.set("type",t)}getZNear(){return this.get("znear")}setZNear(t){return this.set("znear",t)}getZFar(){return this.get("zfar")}setZFar(t){return this.set("zfar",t)}getAspectRatio(){return this.get("aspectRatio")}setAspectRatio(t){return this.set("aspectRatio",t)}getYFov(){return this.get("yfov")}setYFov(t){return this.set("yfov",t)}getXMag(){return this.get("xmag")}setXMag(t){return this.set("xmag",t)}getYMag(){return this.get("ymag")}setYMag(t){return this.set("ymag",t)}},W=class extends Qr{static EXTENSION_NAME;_validateParent(e){if(!this.parentTypes.includes(e.propertyType))throw new Error(`Parent "${e.propertyType}" invalid for child "${this.propertyType}".`)}},oe=class Yr extends Ne{static WrapMode={CLAMP_TO_EDGE:33071,MIRRORED_REPEAT:33648,REPEAT:10497};static MagFilter={NEAREST:9728,LINEAR:9729};static MinFilter={NEAREST:9728,LINEAR:9729,NEAREST_MIPMAP_NEAREST:9984,LINEAR_MIPMAP_NEAREST:9985,NEAREST_MIPMAP_LINEAR:9986,LINEAR_MIPMAP_LINEAR:9987};init(){this.propertyType="TextureInfo"}getDefaults(){return Object.assign(super.getDefaults(),{texCoord:0,magFilter:null,minFilter:null,wrapS:Yr.WrapMode.REPEAT,wrapT:Yr.WrapMode.REPEAT})}getTexCoord(){return this.get("texCoord")}setTexCoord(t){return this.set("texCoord",t)}getMagFilter(){return this.get("magFilter")}setMagFilter(t){return this.set("magFilter",t)}getMinFilter(){return this.get("minFilter")}setMinFilter(t){return this.set("minFilter",t)}getWrapS(){return this.get("wrapS")}setWrapS(t){return this.set("wrapS",t)}getWrapT(){return this.get("wrapT")}setWrapT(t){return this.set("wrapT",t)}},{R:$s,G:Ys,B:Js,A:dp}=et,tn=class Dc extends Ne{static AlphaMode={OPAQUE:"OPAQUE",MASK:"MASK",BLEND:"BLEND"};init(){this.propertyType="Material"}getDefaults(){return Object.assign(super.getDefaults(),{alphaMode:Dc.AlphaMode.OPAQUE,alphaCutoff:.5,doubleSided:!1,baseColorFactor:[1,1,1,1],baseColorTexture:null,baseColorTextureInfo:new oe(this.graph,"baseColorTextureInfo"),emissiveFactor:[0,0,0],emissiveTexture:null,emissiveTextureInfo:new oe(this.graph,"emissiveTextureInfo"),normalScale:1,normalTexture:null,normalTextureInfo:new oe(this.graph,"normalTextureInfo"),occlusionStrength:1,occlusionTexture:null,occlusionTextureInfo:new oe(this.graph,"occlusionTextureInfo"),roughnessFactor:1,metallicFactor:1,metallicRoughnessTexture:null,metallicRoughnessTextureInfo:new oe(this.graph,"metallicRoughnessTextureInfo")})}getDoubleSided(){return this.get("doubleSided")}setDoubleSided(t){return this.set("doubleSided",t)}getAlpha(){return this.get("baseColorFactor")[3]}setAlpha(t){let a=this.get("baseColorFactor").slice();return a[3]=t,this.set("baseColorFactor",a)}getAlphaMode(){return this.get("alphaMode")}setAlphaMode(t){return this.set("alphaMode",t)}getAlphaCutoff(){return this.get("alphaCutoff")}setAlphaCutoff(t){return this.set("alphaCutoff",t)}getBaseColorFactor(){return this.get("baseColorFactor")}setBaseColorFactor(t){return this.set("baseColorFactor",t)}getBaseColorTexture(){return this.getRef("baseColorTexture")}getBaseColorTextureInfo(){return this.getRef("baseColorTexture")?this.getRef("baseColorTextureInfo"):null}setBaseColorTexture(t){return this.setRef("baseColorTexture",t,{channels:$s|Ys|Js|dp,isColor:!0})}getEmissiveFactor(){return this.get("emissiveFactor")}setEmissiveFactor(t){return this.set("emissiveFactor",t)}getEmissiveTexture(){return this.getRef("emissiveTexture")}getEmissiveTextureInfo(){return this.getRef("emissiveTexture")?this.getRef("emissiveTextureInfo"):null}setEmissiveTexture(t){return this.setRef("emissiveTexture",t,{channels:$s|Ys|Js,isColor:!0})}getNormalScale(){return this.get("normalScale")}setNormalScale(t){return this.set("normalScale",t)}getNormalTexture(){return this.getRef("normalTexture")}getNormalTextureInfo(){return this.getRef("normalTexture")?this.getRef("normalTextureInfo"):null}setNormalTexture(t){return this.setRef("normalTexture",t,{channels:$s|Ys|Js})}getOcclusionStrength(){return this.get("occlusionStrength")}setOcclusionStrength(t){return this.set("occlusionStrength",t)}getOcclusionTexture(){return this.getRef("occlusionTexture")}getOcclusionTextureInfo(){return this.getRef("occlusionTexture")?this.getRef("occlusionTextureInfo"):null}setOcclusionTexture(t){return this.setRef("occlusionTexture",t,{channels:$s})}getRoughnessFactor(){return this.get("roughnessFactor")}setRoughnessFactor(t){return this.set("roughnessFactor",t)}getMetallicFactor(){return this.get("metallicFactor")}setMetallicFactor(t){return this.set("metallicFactor",t)}getMetallicRoughnessTexture(){return this.getRef("metallicRoughnessTexture")}getMetallicRoughnessTextureInfo(){return this.getRef("metallicRoughnessTexture")?this.getRef("metallicRoughnessTextureInfo"):null}setMetallicRoughnessTexture(t){return this.setRef("metallicRoughnessTexture",t,{channels:Ys|Js})}},Uc=class extends Ne{init(){this.propertyType="Mesh"}getDefaults(){return Object.assign(super.getDefaults(),{weights:[],primitives:new re})}addPrimitive(e){return this.addRef("primitives",e)}removePrimitive(e){return this.removeRef("primitives",e)}listPrimitives(){return this.listRefs("primitives")}getWeights(){return this.get("weights")}setWeights(e){return this.set("weights",e)}},Gc=class extends Ne{init(){this.propertyType="Node"}getDefaults(){return Object.assign(super.getDefaults(),{translation:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1],weights:[],camera:null,mesh:null,skin:null,children:new re})}copy(e,t=Nt){if(t===Nt)throw new Error("Node cannot be copied.");return super.copy(e,t)}getTranslation(){return this.get("translation")}getRotation(){return this.get("rotation")}getScale(){return this.get("scale")}setTranslation(e){return this.set("translation",e)}setRotation(e){return this.set("rotation",e)}setScale(e){return this.set("scale",e)}getMatrix(){return le.compose(this.get("translation"),this.get("rotation"),this.get("scale"),[])}setMatrix(e){let t=this.get("translation").slice(),a=this.get("rotation").slice(),s=this.get("scale").slice();return le.decompose(e,t,a,s),this.set("translation",t).set("rotation",a).set("scale",s)}getWorldTranslation(){let e=[0,0,0];return le.decompose(this.getWorldMatrix(),e,[0,0,0,1],[1,1,1]),e}getWorldRotation(){let e=[0,0,0,1];return le.decompose(this.getWorldMatrix(),[0,0,0],e,[1,1,1]),e}getWorldScale(){let e=[1,1,1];return le.decompose(this.getWorldMatrix(),[0,0,0],[0,0,0,1],e),e}getWorldMatrix(){let e=[];for(let s=this;s!=null;s=s.getParentNode())e.push(s);let t,a=e.pop().getMatrix();for(;t=e.pop();)Jb(a,a,t.getMatrix());return a}addChild(e){let t=e.getParentNode();t&&t.removeChild(e);for(let a of e.listParents())a.propertyType==="Scene"&&a.removeChild(e);return this.addRef("children",e)}removeChild(e){return this.removeRef("children",e)}listChildren(){return this.listRefs("children")}getParentNode(){for(let e of this.listParents())if(e.propertyType==="Node")return e;return null}getMesh(){return this.getRef("mesh")}setMesh(e){return this.setRef("mesh",e)}getCamera(){return this.getRef("camera")}setCamera(e){return this.setRef("camera",e)}getSkin(){return this.getRef("skin")}setSkin(e){return this.setRef("skin",e)}getWeights(){return this.get("weights")}setWeights(e){return this.set("weights",e)}traverse(e){e(this);for(let t of this.listChildren())t.traverse(e);return this}},Xa=class zc extends Ne{static Mode={POINTS:0,LINES:1,LINE_LOOP:2,LINE_STRIP:3,TRIANGLES:4,TRIANGLE_STRIP:5,TRIANGLE_FAN:6};init(){this.propertyType="Primitive"}getDefaults(){return Object.assign(super.getDefaults(),{mode:zc.Mode.TRIANGLES,material:null,indices:null,attributes:new ge,targets:new re})}getIndices(){return this.getRef("indices")}setIndices(t){return this.setRef("indices",t,{usage:"ELEMENT_ARRAY_BUFFER"})}getAttribute(t){return this.getRefMap("attributes",t)}setAttribute(t,a){return this.setRefMap("attributes",t,a,{usage:"ARRAY_BUFFER"})}listAttributes(){return this.listRefMapValues("attributes")}listSemantics(){return this.listRefMapKeys("attributes")}getMaterial(){return this.getRef("material")}setMaterial(t){return this.setRef("material",t)}getMode(){return this.get("mode")}setMode(t){return this.set("mode",t)}listTargets(){return this.listRefs("targets")}addTarget(t){return this.addRef("targets",t)}removeTarget(t){return this.removeRef("targets",t)}},up=class extends Qr{init(){this.propertyType="PrimitiveTarget"}getDefaults(){return Object.assign(super.getDefaults(),{attributes:new ge})}getAttribute(e){return this.getRefMap("attributes",e)}setAttribute(e,t){return this.setRefMap("attributes",e,t,{usage:"ARRAY_BUFFER"})}listAttributes(){return this.listRefMapValues("attributes")}listSemantics(){return this.listRefMapKeys("attributes")}},Kc=class extends Ne{init(){this.propertyType="Scene"}getDefaults(){return Object.assign(super.getDefaults(),{children:new re})}copy(e,t=Nt){if(t===Nt)throw new Error("Scene cannot be copied.");return super.copy(e,t)}addChild(e){let t=e.getParentNode();return t&&t.removeChild(e),this.addRef("children",e)}removeChild(e){return this.removeRef("children",e)}listChildren(){return this.listRefs("children")}traverse(e){for(let t of this.listChildren())t.traverse(e);return this}},Vc=class extends Ne{init(){this.propertyType="Skin"}getDefaults(){return Object.assign(super.getDefaults(),{skeleton:null,inverseBindMatrices:null,joints:new re})}getSkeleton(){return this.getRef("skeleton")}setSkeleton(e){return this.setRef("skeleton",e)}getInverseBindMatrices(){return this.getRef("inverseBindMatrices")}setInverseBindMatrices(e){return this.setRef("inverseBindMatrices",e,{usage:"INVERSE_BIND_MATRICES"})}addJoint(e){return this.addRef("joints",e)}removeJoint(e){return this.removeRef("joints",e)}listJoints(){return this.listRefs("joints")}},Hc=class extends Ne{init(){this.propertyType="Texture"}getDefaults(){return Object.assign(super.getDefaults(),{image:null,mimeType:"",uri:""})}getMimeType(){return this.get("mimeType")||ct.extensionToMimeType(xa.extension(this.get("uri")))}setMimeType(e){return this.set("mimeType",e)}getURI(){return this.get("uri")}setURI(e){this.set("uri",e);let t=ct.extensionToMimeType(xa.extension(e));return t&&this.set("mimeType",t),this}getImage(){return this.get("image")}setImage(e){return this.set("image",q.assertView(e))}getSize(){let e=this.get("image");return e?ct.getSize(e,this.getMimeType()):null}},ei=class extends Ne{_extensions=new Set;init(){this.propertyType="Root"}getDefaults(){return Object.assign(super.getDefaults(),{asset:{generator:`glTF-Transform ${Ac}`,version:"2.0"},defaultScene:null,accessors:new re,animations:new re,buffers:new re,cameras:new re,materials:new re,meshes:new re,nodes:new re,scenes:new re,skins:new re,textures:new re})}constructor(e){super(e),e.addEventListener("node:create",t=>{this._addChildOfRoot(t.target)})}clone(){throw new Error("Root cannot be cloned.")}copy(e,t=Nt){if(t===Nt)throw new Error("Root cannot be copied.");this.set("asset",{...e.get("asset")}),this.setName(e.getName()),this.setExtras({...e.getExtras()}),this.setDefaultScene(e.getDefaultScene()?t(e.getDefaultScene()):null);for(let a of e.listRefMapKeys("extensions")){let s=e.getExtension(a);this.setExtension(a,t(s))}return this}_addChildOfRoot(e){return e instanceof Kc?this.addRef("scenes",e):e instanceof Gc?this.addRef("nodes",e):e instanceof rn?this.addRef("cameras",e):e instanceof Vc?this.addRef("skins",e):e instanceof Uc?this.addRef("meshes",e):e instanceof tn?this.addRef("materials",e):e instanceof Hc?this.addRef("textures",e):e instanceof Oc?this.addRef("animations",e):e instanceof G?this.addRef("accessors",e):e instanceof jc&&this.addRef("buffers",e),this}getAsset(){return this.get("asset")}listExtensionsUsed(){return Array.from(this._extensions)}listExtensionsRequired(){return this.listExtensionsUsed().filter(e=>e.isRequired())}_enableExtension(e){return this._extensions.add(e),this}_disableExtension(e){return this._extensions.delete(e),this}listScenes(){return this.listRefs("scenes")}setDefaultScene(e){return this.setRef("defaultScene",e)}getDefaultScene(){return this.getRef("defaultScene")}listNodes(){return this.listRefs("nodes")}listCameras(){return this.listRefs("cameras")}listSkins(){return this.listRefs("skins")}listMeshes(){return this.listRefs("meshes")}listMaterials(){return this.listRefs("materials")}listTextures(){return this.listRefs("textures")}listAnimations(){return this.listRefs("animations")}listAccessors(){return this.listRefs("accessors")}listBuffers(){return this.listRefs("buffers")}},fp=class Jr{_graph=new Hr;_root=new ei(this._graph);_logger=sn.DEFAULT_INSTANCE;static _GRAPH_DOCUMENTS=new WeakMap;static fromGraph(t){return Jr._GRAPH_DOCUMENTS.get(t)||null}constructor(){Jr._GRAPH_DOCUMENTS.set(this._graph,this)}getRoot(){return this._root}getGraph(){return this._graph}getLogger(){return this._logger}setLogger(t){return this._logger=t,this}clone(){throw new Error("Use 'cloneDocument(source)' from '@gltf-transform/functions'.")}merge(t){throw new Error("Use 'mergeDocuments(target, source)' from '@gltf-transform/functions'.")}async transform(...t){let a=t.map(s=>s.name);for(let s of t)await s(this,{stack:a});return this}hasExtension(t){return this.getRoot().listExtensionsUsed().some(a=>a.extensionName===t)}createExtension(t){let a=t.EXTENSION_NAME;return this.getRoot().listExtensionsUsed().find(s=>s.extensionName===a)||new t(this)}disposeExtension(t){let a=this.getRoot().listExtensionsUsed().find(s=>s.extensionName===t);a&&a.dispose()}createScene(t=""){return new Kc(this._graph,t)}createNode(t=""){return new Gc(this._graph,t)}createCamera(t=""){return new rn(this._graph,t)}createSkin(t=""){return new Vc(this._graph,t)}createMesh(t=""){return new Uc(this._graph,t)}createPrimitive(){return new Xa(this._graph)}createPrimitiveTarget(t=""){return new up(this._graph,t)}createMaterial(t=""){return new tn(this._graph,t)}createTexture(t=""){return new Hc(this._graph,t)}createAnimation(t=""){return new Oc(this._graph,t)}createAnimationChannel(t=""){return new Zr(this._graph,t)}createAnimationSampler(t=""){return new nn(this._graph,t)}createAccessor(t="",a=null){return a||(a=this.getRoot().listBuffers()[0]),new G(this._graph,t).setBuffer(a)}createBuffer(t=""){return new jc(this._graph,t)}},ae=class{static EXTENSION_NAME;extensionName="";prereadTypes=[];prewriteTypes=[];readDependencies=[];writeDependencies=[];document;required=!1;properties=new Set;_listener;constructor(e){this.document=e,e.getRoot()._enableExtension(this),this._listener=a=>{let s=a,n=s.target;n instanceof W&&n.extensionName===this.extensionName&&(s.type==="node:create"&&this._addExtensionProperty(n),s.type==="node:dispose"&&this._removeExtensionProperty(n))};let t=e.getGraph();t.addEventListener("node:create",this._listener),t.addEventListener("node:dispose",this._listener)}dispose(){this.document.getRoot()._disableExtension(this);let e=this.document.getGraph();e.removeEventListener("node:create",this._listener),e.removeEventListener("node:dispose",this._listener);for(let t of this.properties)t.dispose()}static register(){}isRequired(){return this.required}setRequired(e){return this.required=e,this}listProperties(){return Array.from(this.properties)}_addExtensionProperty(e){return this.properties.add(e),this}_removeExtensionProperty(e){return this.properties.delete(e),this}install(e,t){return this}preread(e,t){return this}prewrite(e,t){return this}},hp=class{jsonDoc;buffers=[];bufferViews=[];bufferViewBuffers=[];accessors=[];textures=[];textureInfos=new Map;materials=[];meshes=[];cameras=[];nodes=[];skins=[];animations=[];scenes=[];constructor(e){this.jsonDoc=e}setTextureInfo(e,t){this.textureInfos.set(e,t),t.texCoord!==void 0&&e.setTexCoord(t.texCoord),t.extras!==void 0&&e.setExtras(t.extras);let a=this.jsonDoc.json.textures[t.index];if(a.sampler===void 0)return;let s=this.jsonDoc.json.samplers[a.sampler];s.magFilter!==void 0&&e.setMagFilter(s.magFilter),s.minFilter!==void 0&&e.setMinFilter(s.minFilter),s.wrapS!==void 0&&e.setWrapS(s.wrapS),s.wrapT!==void 0&&e.setWrapT(s.wrapT)}},Tc={logger:sn.DEFAULT_INSTANCE,extensions:[],dependencies:{}},bp=new Set(["Buffer","Texture","Material","Mesh","Primitive","Node","Scene"]),pp=class{static read(e,t=Tc){let a={...Tc,...t},{json:s}=e,n=new fp().setLogger(a.logger);this.validate(e,a);let r=new hp(e),i=s.asset,o=n.getRoot().getAsset();i.copyright&&(o.copyright=i.copyright),i.extras&&(o.extras=i.extras),s.extras!==void 0&&n.getRoot().setExtras({...s.extras});let c=s.extensionsUsed||[],l=s.extensionsRequired||[];a.extensions.sort((b,m)=>b.EXTENSION_NAME>m.EXTENSION_NAME?1:-1);for(let b of a.extensions)if(c.includes(b.EXTENSION_NAME)){let m=n.createExtension(b).setRequired(l.includes(b.EXTENSION_NAME)),x=m.prereadTypes.filter(M=>!bp.has(M));x.length&&a.logger.warn(`Preread hooks for some types (${x.join()}), requested by extension ${m.extensionName}, are unsupported. Please file an issue or a PR.`);for(let M of m.readDependencies)m.install(M,a.dependencies[M])}let f=s.buffers||[];n.getRoot().listExtensionsUsed().filter(b=>b.prereadTypes.includes("Buffer")).forEach(b=>b.preread(r,"Buffer")),r.buffers=f.map(b=>{let m=n.createBuffer(b.name);return b.extras&&m.setExtras(b.extras),b.uri&&b.uri.indexOf("__")!==0&&m.setURI(b.uri),m}),r.bufferViewBuffers=(s.bufferViews||[]).map((b,m)=>{if(!r.bufferViews[m]){let x=e.json.buffers[b.buffer],M=x.uri?e.resources[x.uri]:e.resources[_t],E=b.byteOffset||0;r.bufferViews[m]=q.toView(M,E,b.byteLength)}return r.buffers[b.buffer]});let d=s.accessors||[];r.accessors=d.map(b=>{let m=r.bufferViewBuffers[b.bufferView],x=n.createAccessor(b.name,m).setType(b.type);return b.extras&&x.setExtras(b.extras),b.normalized!==void 0&&x.setNormalized(b.normalized),b.bufferView===void 0||x.setArray(Zs(b,r)),x});let h=s.images||[],g=s.textures||[];n.getRoot().listExtensionsUsed().filter(b=>b.prereadTypes.includes("Texture")).forEach(b=>b.preread(r,"Texture")),r.textures=h.map(b=>{let m=n.createTexture(b.name);if(b.extras&&m.setExtras(b.extras),b.bufferView!==void 0){let x=s.bufferViews[b.bufferView],M=e.json.buffers[x.buffer],E=M.uri?e.resources[M.uri]:e.resources[_t],T=x.byteOffset||0,I=x.byteLength,A=E.slice(T,T+I);m.setImage(A)}else b.uri!==void 0&&(m.setImage(e.resources[b.uri]),b.uri.indexOf("__")!==0&&m.setURI(b.uri));if(b.mimeType!==void 0)m.setMimeType(b.mimeType);else if(b.uri){let x=xa.extension(b.uri);m.setMimeType(ct.extensionToMimeType(x))}return m}),n.getRoot().listExtensionsUsed().filter(b=>b.prereadTypes.includes("Material")).forEach(b=>b.preread(r,"Material")),r.materials=(s.materials||[]).map(b=>{let m=n.createMaterial(b.name);b.extras&&m.setExtras(b.extras),b.alphaMode!==void 0&&m.setAlphaMode(b.alphaMode),b.alphaCutoff!==void 0&&m.setAlphaCutoff(b.alphaCutoff),b.doubleSided!==void 0&&m.setDoubleSided(b.doubleSided);let x=b.pbrMetallicRoughness||{};if(x.baseColorFactor!==void 0&&m.setBaseColorFactor(x.baseColorFactor),b.emissiveFactor!==void 0&&m.setEmissiveFactor(b.emissiveFactor),x.metallicFactor!==void 0&&m.setMetallicFactor(x.metallicFactor),x.roughnessFactor!==void 0&&m.setRoughnessFactor(x.roughnessFactor),x.baseColorTexture!==void 0){let M=x.baseColorTexture,E=r.textures[g[M.index].source];m.setBaseColorTexture(E),r.setTextureInfo(m.getBaseColorTextureInfo(),M)}if(b.emissiveTexture!==void 0){let M=b.emissiveTexture,E=r.textures[g[M.index].source];m.setEmissiveTexture(E),r.setTextureInfo(m.getEmissiveTextureInfo(),M)}if(b.normalTexture!==void 0){let M=b.normalTexture,E=r.textures[g[M.index].source];m.setNormalTexture(E),r.setTextureInfo(m.getNormalTextureInfo(),M),b.normalTexture.scale!==void 0&&m.setNormalScale(b.normalTexture.scale)}if(b.occlusionTexture!==void 0){let M=b.occlusionTexture,E=r.textures[g[M.index].source];m.setOcclusionTexture(E),r.setTextureInfo(m.getOcclusionTextureInfo(),M),b.occlusionTexture.strength!==void 0&&m.setOcclusionStrength(b.occlusionTexture.strength)}if(x.metallicRoughnessTexture!==void 0){let M=x.metallicRoughnessTexture,E=r.textures[g[M.index].source];m.setMetallicRoughnessTexture(E),r.setTextureInfo(m.getMetallicRoughnessTextureInfo(),M)}return m}),n.getRoot().listExtensionsUsed().filter(b=>b.prereadTypes.includes("Mesh")).forEach(b=>b.preread(r,"Mesh"));let p=s.meshes||[];n.getRoot().listExtensionsUsed().filter(b=>b.prereadTypes.includes("Primitive")).forEach(b=>b.preread(r,"Primitive")),r.meshes=p.map(b=>{let m=n.createMesh(b.name);return b.extras&&m.setExtras(b.extras),b.weights!==void 0&&m.setWeights(b.weights),(b.primitives||[]).forEach(x=>{let M=n.createPrimitive();x.extras&&M.setExtras(x.extras),x.material!==void 0&&M.setMaterial(r.materials[x.material]),x.mode!==void 0&&M.setMode(x.mode);for(let[T,I]of Object.entries(x.attributes||{}))M.setAttribute(T,r.accessors[I]);x.indices!==void 0&&M.setIndices(r.accessors[x.indices]);let E=b.extras&&b.extras.targetNames||[];(x.targets||[]).forEach((T,I)=>{let A=E[I]||I.toString(),R=n.createPrimitiveTarget(A);for(let[_,B]of Object.entries(T))R.setAttribute(_,r.accessors[B]);M.addTarget(R)}),m.addPrimitive(M)}),m}),r.cameras=(s.cameras||[]).map(b=>{let m=n.createCamera(b.name).setType(b.type);if(b.extras&&m.setExtras(b.extras),b.type===rn.Type.PERSPECTIVE){let x=b.perspective;m.setYFov(x.yfov),m.setZNear(x.znear),x.zfar!==void 0&&m.setZFar(x.zfar),x.aspectRatio!==void 0&&m.setAspectRatio(x.aspectRatio)}else{let x=b.orthographic;m.setZNear(x.znear).setZFar(x.zfar).setXMag(x.xmag).setYMag(x.ymag)}return m});let u=s.nodes||[];n.getRoot().listExtensionsUsed().filter(b=>b.prereadTypes.includes("Node")).forEach(b=>b.preread(r,"Node")),r.nodes=u.map(b=>{let m=n.createNode(b.name);if(b.extras&&m.setExtras(b.extras),b.translation!==void 0&&m.setTranslation(b.translation),b.rotation!==void 0&&m.setRotation(b.rotation),b.scale!==void 0&&m.setScale(b.scale),b.matrix!==void 0){let x=[0,0,0],M=[0,0,0,1],E=[1,1,1];le.decompose(b.matrix,x,M,E),m.setTranslation(x),m.setRotation(M),m.setScale(E)}return b.weights!==void 0&&m.setWeights(b.weights),m}),r.skins=(s.skins||[]).map(b=>{let m=n.createSkin(b.name);b.extras&&m.setExtras(b.extras),b.inverseBindMatrices!==void 0&&m.setInverseBindMatrices(r.accessors[b.inverseBindMatrices]),b.skeleton!==void 0&&m.setSkeleton(r.nodes[b.skeleton]);for(let x of b.joints)m.addJoint(r.nodes[x]);return m}),u.map((b,m)=>{let x=r.nodes[m];(b.children||[]).forEach(M=>x.addChild(r.nodes[M])),b.mesh!==void 0&&x.setMesh(r.meshes[b.mesh]),b.camera!==void 0&&x.setCamera(r.cameras[b.camera]),b.skin!==void 0&&x.setSkin(r.skins[b.skin])}),r.animations=(s.animations||[]).map(b=>{let m=n.createAnimation(b.name);b.extras&&m.setExtras(b.extras);let x=(b.samplers||[]).map(M=>{let E=n.createAnimationSampler().setInput(r.accessors[M.input]).setOutput(r.accessors[M.output]).setInterpolation(M.interpolation||nn.Interpolation.LINEAR);return M.extras&&E.setExtras(M.extras),m.addSampler(E),E});return(b.channels||[]).forEach(M=>{let E=n.createAnimationChannel().setSampler(x[M.sampler]).setTargetPath(M.target.path);M.target.node!==void 0&&E.setTargetNode(r.nodes[M.target.node]),M.extras&&E.setExtras(M.extras),m.addChannel(E)}),m});let y=s.scenes||[];return n.getRoot().listExtensionsUsed().filter(b=>b.prereadTypes.includes("Scene")).forEach(b=>b.preread(r,"Scene")),r.scenes=y.map(b=>{let m=n.createScene(b.name);return b.extras&&m.setExtras(b.extras),(b.nodes||[]).map(x=>r.nodes[x]).forEach(x=>m.addChild(x)),m}),s.scene!==void 0&&n.getRoot().setDefaultScene(r.scenes[s.scene]),n.getRoot().listExtensionsUsed().forEach(b=>b.read(r)),d.forEach((b,m)=>{let x=r.accessors[m],M=!!b.sparse,E=!b.bufferView&&!x.getArray();(M||E)&&x.setSparse(!0).setArray(mp(b,r))}),n}static validate(e,t){let a=e.json;if(a.asset.version!=="2.0")throw new Error(`Unsupported glTF version, "${a.asset.version}".`);if(a.extensionsRequired){for(let s of a.extensionsRequired)if(!t.extensions.find(n=>n.EXTENSION_NAME===s))throw new Error(`Missing required extension, "${s}".`)}if(a.extensionsUsed)for(let s of a.extensionsUsed)t.extensions.find(n=>n.EXTENSION_NAME===s)||t.logger.warn(`Missing optional extension, "${s}".`)}};function gp(e,t){let a=t.jsonDoc,s=t.bufferViews[e.bufferView],n=a.json.bufferViews[e.bufferView],r=an[e.componentType],i=G.getElementSize(e.type),o=r.BYTES_PER_ELEMENT,c=e.byteOffset||0,l=new r(e.count*i),f=new DataView(s.buffer,s.byteOffset,s.byteLength),d=n.byteStride;for(let h=0;h<e.count;h++)for(let g=0;g<i;g++){let p=c+h*d+g*o,u;switch(e.componentType){case G.ComponentType.FLOAT:u=f.getFloat32(p,!0);break;case G.ComponentType.UNSIGNED_INT:u=f.getUint32(p,!0);break;case G.ComponentType.UNSIGNED_SHORT:u=f.getUint16(p,!0);break;case G.ComponentType.UNSIGNED_BYTE:u=f.getUint8(p);break;case G.ComponentType.SHORT:u=f.getInt16(p,!0);break;case G.ComponentType.BYTE:u=f.getInt8(p);break;case G.ComponentType.FLOAT16:u=f.getFloat16(p,!0);break;case G.ComponentType.FLOAT64:u=f.getFloat64(p,!0);break;default:throw new Error(`Unexpected componentType "${e.componentType}".`)}l[h*i+g]=u}return l}function Zs(e,t){let a=t.jsonDoc,s=t.bufferViews[e.bufferView],n=a.json.bufferViews[e.bufferView],r=an[e.componentType],i=G.getElementSize(e.type),o=r.BYTES_PER_ELEMENT,c=i*o;if(n.byteStride!==void 0&&n.byteStride!==c)return gp(e,t);let l=s.byteOffset+(e.byteOffset||0),f=e.count*i*o;return new r(s.buffer.slice(l,l+f))}function mp(e,t){let a=an[e.componentType],s=G.getElementSize(e.type),n;e.bufferView!==void 0?n=Zs(e,t):n=new a(e.count*s);let r=e.sparse;if(!r)return n;let i=r.count,o={...e,...r.indices,count:i,type:"SCALAR"},c={...e,...r.values,count:i},l=Zs(o,t),f=Zs(c,t);for(let d=0;d<o.count;d++)for(let h=0;h<s;h++)n[l[d]*s+h]=f[d*s+h];return n}var qc=(function(e){return e[e.ARRAY_BUFFER=34962]="ARRAY_BUFFER",e[e.ELEMENT_ARRAY_BUFFER=34963]="ELEMENT_ARRAY_BUFFER",e})(qc||{}),Rt=class{_doc;jsonDoc;options;static BufferViewTarget=qc;static BufferViewUsage=Gb;static USAGE_TO_TARGET={ARRAY_BUFFER:34962,ELEMENT_ARRAY_BUFFER:34963};accessorIndexMap=new Map;animationIndexMap=new Map;bufferIndexMap=new Map;cameraIndexMap=new Map;skinIndexMap=new Map;materialIndexMap=new Map;meshIndexMap=new Map;nodeIndexMap=new Map;imageIndexMap=new Map;textureDefIndexMap=new Map;textureInfoDefMap=new Map;samplerDefIndexMap=new Map;sceneIndexMap=new Map;imageBufferViews=[];otherBufferViews=new Map;otherBufferViewsIndexMap=new Map;extensionData={};bufferURIGenerator;imageURIGenerator;logger;_accessorUsageMap=new Map;accessorUsageGroupedByParent=new Set(["ARRAY_BUFFER"]);accessorParents=new Map;constructor(e,t,a){this._doc=e,this.jsonDoc=t,this.options=a;let s=e.getRoot(),n=s.listBuffers().length,r=s.listTextures().length;this.bufferURIGenerator=new Sc(n>1,()=>a.basename||"buffer"),this.imageURIGenerator=new Sc(r>1,i=>yp(e,i)||a.basename||"texture"),this.logger=e.getLogger()}createTextureInfoDef(e,t){let a={magFilter:t.getMagFilter()||void 0,minFilter:t.getMinFilter()||void 0,wrapS:t.getWrapS(),wrapT:t.getWrapT()},s=JSON.stringify(a);this.samplerDefIndexMap.has(s)||(this.samplerDefIndexMap.set(s,this.jsonDoc.json.samplers.length),this.jsonDoc.json.samplers.push(a));let n={source:this.imageIndexMap.get(e),sampler:this.samplerDefIndexMap.get(s)},r=JSON.stringify(n);this.textureDefIndexMap.has(r)||(this.textureDefIndexMap.set(r,this.jsonDoc.json.textures.length),this.jsonDoc.json.textures.push(n));let i={index:this.textureDefIndexMap.get(r)};return t.getTexCoord()!==0&&(i.texCoord=t.getTexCoord()),Object.keys(t.getExtras()).length>0&&(i.extras=t.getExtras()),this.textureInfoDefMap.set(t,i),i}createPropertyDef(e){let t={};return e.getName()&&(t.name=e.getName()),Object.keys(e.getExtras()).length>0&&(t.extras=e.getExtras()),t}createAccessorDef(e){let t=this.createPropertyDef(e);return t.type=e.getType(),t.componentType=e.getComponentType(),t.count=e.getCount(),this._doc.getGraph().listParentEdges(e).some(a=>a.getName()==="attributes"&&a.getAttributes().key==="POSITION"||a.getName()==="input")&&(t.max=e.getMax([]).map(Math.fround),t.min=e.getMin([]).map(Math.fround)),e.getNormalized()&&(t.normalized=e.getNormalized()),t}createImageData(e,t,a){if(this.options.format==="GLB")this.imageBufferViews.push(t),e.bufferView=this.jsonDoc.json.bufferViews.length,this.jsonDoc.json.bufferViews.push({buffer:0,byteOffset:-1,byteLength:t.byteLength});else{let s=ct.mimeTypeToExtension(a.getMimeType());e.uri=this.imageURIGenerator.createURI(a,s),this.assignResourceURI(e.uri,t,!1)}}assignResourceURI(e,t,a){let s=this.jsonDoc.resources;if(!(e in s)){s[e]=t;return}if(t===s[e]){this.logger.warn(`Duplicate resource URI, "${e}".`);return}let n=`Resource URI "${e}" already assigned to different data.`;if(!a){this.logger.warn(n);return}throw new Error(n)}getAccessorUsage(e){let t=this._accessorUsageMap.get(e);if(t)return t;if(e.getSparse())return"SPARSE";for(let a of this._doc.getGraph().listParentEdges(e)){let{usage:s}=a.getAttributes();if(s)return s;a.getParent().propertyType!=="Root"&&this.logger.warn(`Missing attribute ".usage" on edge, "${a.getName()}".`)}return"OTHER"}addAccessorToUsageGroup(e,t){let a=this._accessorUsageMap.get(e);if(a&&a!==t)throw new Error(`Accessor with usage "${a}" cannot be reused as "${t}".`);return this._accessorUsageMap.set(e,t),this}},Sc=class{multiple;basename;counter={};constructor(e,t){this.multiple=e,this.basename=t}createURI(e,t){if(e.getURI())return e.getURI();if(this.multiple){let a=this.basename(e);return this.counter[a]=this.counter[a]||1,`${a}_${this.counter[a]++}.${t}`}else return`${this.basename(e)}.${t}`}};function yp(e,t){let a=e.getGraph().listParentEdges(t).find(s=>s.getParent()!==e.getRoot());return a?a.getName().replace(/texture$/i,""):""}var{BufferViewUsage:Qs}=Rt,{UNSIGNED_INT:xp,UNSIGNED_SHORT:vp,UNSIGNED_BYTE:wp}=G.ComponentType,Mp=new Set(["Accessor","Buffer","Material","Mesh"]),kp=class{static write(e,t){let a=e.getGraph(),s=e.getRoot(),n={asset:{generator:`glTF-Transform ${Ac}`,...s.getAsset()},extras:{...s.getExtras()}},r={json:n,resources:{}},i=new Rt(e,r,t),o=t.logger||sn.DEFAULT_INSTANCE,c=new Set(t.extensions.map(u=>u.EXTENSION_NAME)),l=e.getRoot().listExtensionsUsed().filter(u=>c.has(u.extensionName)).sort((u,y)=>u.extensionName>y.extensionName?1:-1),f=e.getRoot().listExtensionsRequired().filter(u=>c.has(u.extensionName)).sort((u,y)=>u.extensionName>y.extensionName?1:-1);l.length<e.getRoot().listExtensionsUsed().length&&o.warn("Some extensions were not registered for I/O, and will not be written.");for(let u of l){let y=u.prewriteTypes.filter(b=>!Mp.has(b));y.length&&o.warn(`Prewrite hooks for some types (${y.join()}), requested by extension ${u.extensionName}, are unsupported. Please file an issue or a PR.`);for(let b of u.writeDependencies)u.install(b,t.dependencies[b])}function d(u,y,b,m){let x=[],M=0;for(let T of u){let I=i.createAccessorDef(T);I.bufferView=n.bufferViews.length;let A=T.getArray(),R=q.pad(q.toView(A));I.byteOffset=M,M+=R.byteLength,x.push(R),i.accessorIndexMap.set(T,n.accessors.length),n.accessors.push(I)}let E={buffer:y,byteOffset:b,byteLength:q.concat(x).byteLength};return m&&(E.target=m),n.bufferViews.push(E),{buffers:x,byteLength:M}}function h(u,y,b){let m=u[0].getCount(),x=0;for(let A of u){let R=i.createAccessorDef(A);R.bufferView=n.bufferViews.length,R.byteOffset=x;let _=A.getElementSize(),B=A.getComponentSize();x+=q.padNumber(_*B),i.accessorIndexMap.set(A,n.accessors.length),n.accessors.push(R)}let M=m*x,E=new ArrayBuffer(M),T=new DataView(E);for(let A=0;A<m;A++){let R=0;for(let _ of u){let B=_.getElementSize(),O=_.getComponentSize(),F=_.getComponentType(),K=_.getArray();for(let $=0;$<B;$++){let ne=A*x+R+$*O,de=K[A*B+$];switch(F){case G.ComponentType.FLOAT:T.setFloat32(ne,de,!0);break;case G.ComponentType.BYTE:T.setInt8(ne,de);break;case G.ComponentType.SHORT:T.setInt16(ne,de,!0);break;case G.ComponentType.UNSIGNED_BYTE:T.setUint8(ne,de);break;case G.ComponentType.UNSIGNED_SHORT:T.setUint16(ne,de,!0);break;case G.ComponentType.UNSIGNED_INT:T.setUint32(ne,de,!0);break;case G.ComponentType.FLOAT16:T.setFloat16(ne,de,!0);break;case G.ComponentType.FLOAT64:T.setFloat64(ne,de,!0);break;default:throw new Error("Unexpected component type: "+F)}}R+=q.padNumber(B*O)}}let I={buffer:y,byteOffset:b,byteLength:M,byteStride:x,target:Rt.BufferViewTarget.ARRAY_BUFFER};return n.bufferViews.push(I),{byteLength:M,buffers:[new Uint8Array(E)]}}function g(u,y,b){let m=[],x=0,M=new Map,E=-1/0,T=!1;for(let F of u){let K=i.createAccessorDef(F);n.accessors.push(K),i.accessorIndexMap.set(F,n.accessors.length-1);let $=[],ne=[],de=[],Ke=new Array(F.getElementSize()).fill(0);for(let Re=0,it=F.getCount();Re<it;Re++)if(F.getElement(Re,de),!le.eq(de,Ke,0)){E=Math.max(Re,E),$.push(Re);for(let Qe=0;Qe<de.length;Qe++)ne.push(de[Qe])}let be=$.length,Ve={accessorDef:K,count:be};if(M.set(F,Ve),be===0)continue;be>F.getCount()/2&&(T=!0);let Je=an[F.getComponentType()];Ve.indices=$,Ve.values=new Je(ne)}if(!Number.isFinite(E))return{buffers:m,byteLength:x};T&&o.warn("Some sparse accessors have >50% non-zero elements, which may increase file size.");let I=E<255?Uint8Array:E<65535?Uint16Array:Uint32Array,A=E<255?wp:E<65535?vp:xp,R={buffer:y,byteOffset:b+x,byteLength:0};for(let F of u){let K=M.get(F);if(K.count===0)continue;K.indicesByteOffset=R.byteLength;let $=q.pad(q.toView(new I(K.indices)));m.push($),x+=$.byteLength,R.byteLength+=$.byteLength}n.bufferViews.push(R);let _=n.bufferViews.length-1,B={buffer:y,byteOffset:b+x,byteLength:0};for(let F of u){let K=M.get(F);if(K.count===0)continue;K.valuesByteOffset=B.byteLength;let $=q.pad(q.toView(K.values));m.push($),x+=$.byteLength,B.byteLength+=$.byteLength}n.bufferViews.push(B);let O=n.bufferViews.length-1;for(let F of u){let K=M.get(F);K.count!==0&&(K.accessorDef.sparse={count:K.count,indices:{bufferView:_,byteOffset:K.indicesByteOffset,componentType:A},values:{bufferView:O,byteOffset:K.valuesByteOffset}})}return{buffers:m,byteLength:x}}if(n.accessors=[],n.bufferViews=[],n.samplers=[],n.textures=[],n.images=s.listTextures().map((u,y)=>{let b=i.createPropertyDef(u);u.getMimeType()&&(b.mimeType=u.getMimeType());let m=u.getImage();return m&&i.createImageData(b,m,u),i.imageIndexMap.set(u,y),b}),l.filter(u=>u.prewriteTypes.includes("Accessor")).forEach(u=>u.prewrite(i,"Accessor")),s.listAccessors().forEach(u=>{let y=i.accessorUsageGroupedByParent,b=i.accessorParents;if(i.accessorIndexMap.has(u))return;let m=i.getAccessorUsage(u);if(i.addAccessorToUsageGroup(u,m),y.has(m)){let x=a.listParents(u).find(M=>M.propertyType!=="Root");b.set(u,x)}}),l.filter(u=>u.prewriteTypes.includes("Buffer")).forEach(u=>u.prewrite(i,"Buffer")),(s.listAccessors().length>0||i.otherBufferViews.size>0||s.listTextures().length>0&&t.format==="GLB")&&s.listBuffers().length===0)throw new Error("Buffer required for Document resources, but none was found.");n.buffers=[],s.listBuffers().forEach((u,y)=>{let b=i.createPropertyDef(u),m=i.accessorUsageGroupedByParent,x=u.listParents().filter(_=>_ instanceof G),M=new Set(x.map(_=>i.accessorParents.get(_))),E=new Map(Array.from(M).map((_,B)=>[_,B])),T={};for(let _ of x){if(i.accessorIndexMap.has(_))continue;let B=i.getAccessorUsage(_),O=B;if(m.has(B)){let F=i.accessorParents.get(_);O+=`:${E.get(F)}`}T[O]||={usage:B,accessors:[]},T[O].accessors.push(_)}let I=[],A=n.buffers.length,R=0;for(let{usage:_,accessors:B}of Object.values(T))if(_===Qs.ARRAY_BUFFER&&t.vertexLayout==="interleaved"){let O=h(B,A,R);R+=O.byteLength;for(let F of O.buffers)I.push(F)}else if(_===Qs.ARRAY_BUFFER)for(let O of B){let F=h([O],A,R);R+=F.byteLength;for(let K of F.buffers)I.push(K)}else if(_===Qs.SPARSE){let O=g(B,A,R);R+=O.byteLength;for(let F of O.buffers)I.push(F)}else if(_===Qs.ELEMENT_ARRAY_BUFFER){let O=Rt.BufferViewTarget.ELEMENT_ARRAY_BUFFER,F=d(B,A,R,O);R+=F.byteLength;for(let K of F.buffers)I.push(K)}else{let O=d(B,A,R);R+=O.byteLength;for(let F of O.buffers)I.push(F)}if(i.imageBufferViews.length&&y===0){for(let _=0;_<i.imageBufferViews.length;_++)if(n.bufferViews[n.images[_].bufferView].byteOffset=R,R+=i.imageBufferViews[_].byteLength,I.push(i.imageBufferViews[_]),R%8){let B=8-R%8;R+=B,I.push(new Uint8Array(B))}}if(i.otherBufferViews.has(u))for(let _ of i.otherBufferViews.get(u))n.bufferViews.push({buffer:A,byteOffset:R,byteLength:_.byteLength}),i.otherBufferViewsIndexMap.set(_,n.bufferViews.length-1),R+=_.byteLength,I.push(_);if(R){let _;t.format==="GLB"?_=_t:(_=i.bufferURIGenerator.createURI(u,"bin"),b.uri=_),b.byteLength=R,i.assignResourceURI(_,q.concat(I),!0)}n.buffers.push(b),i.bufferIndexMap.set(u,y)}),s.listAccessors().find(u=>!u.getBuffer())&&o.warn("Skipped writing one or more Accessors: no Buffer assigned."),l.filter(u=>u.prewriteTypes.includes("Material")).forEach(u=>u.prewrite(i,"Material")),n.materials=s.listMaterials().map((u,y)=>{let b=i.createPropertyDef(u);if(u.getAlphaMode()!==tn.AlphaMode.OPAQUE&&(b.alphaMode=u.getAlphaMode()),u.getAlphaMode()===tn.AlphaMode.MASK&&(b.alphaCutoff=u.getAlphaCutoff()),u.getDoubleSided()&&(b.doubleSided=!0),b.pbrMetallicRoughness={},le.eq(u.getBaseColorFactor(),[1,1,1,1])||(b.pbrMetallicRoughness.baseColorFactor=u.getBaseColorFactor()),le.eq(u.getEmissiveFactor(),[0,0,0])||(b.emissiveFactor=u.getEmissiveFactor()),u.getRoughnessFactor()!==1&&(b.pbrMetallicRoughness.roughnessFactor=u.getRoughnessFactor()),u.getMetallicFactor()!==1&&(b.pbrMetallicRoughness.metallicFactor=u.getMetallicFactor()),u.getBaseColorTexture()){let m=u.getBaseColorTexture(),x=u.getBaseColorTextureInfo();b.pbrMetallicRoughness.baseColorTexture=i.createTextureInfoDef(m,x)}if(u.getEmissiveTexture()){let m=u.getEmissiveTexture(),x=u.getEmissiveTextureInfo();b.emissiveTexture=i.createTextureInfoDef(m,x)}if(u.getNormalTexture()){let m=u.getNormalTexture(),x=u.getNormalTextureInfo(),M=i.createTextureInfoDef(m,x);u.getNormalScale()!==1&&(M.scale=u.getNormalScale()),b.normalTexture=M}if(u.getOcclusionTexture()){let m=u.getOcclusionTexture(),x=u.getOcclusionTextureInfo(),M=i.createTextureInfoDef(m,x);u.getOcclusionStrength()!==1&&(M.strength=u.getOcclusionStrength()),b.occlusionTexture=M}if(u.getMetallicRoughnessTexture()){let m=u.getMetallicRoughnessTexture(),x=u.getMetallicRoughnessTextureInfo();b.pbrMetallicRoughness.metallicRoughnessTexture=i.createTextureInfoDef(m,x)}return i.materialIndexMap.set(u,y),b}),l.filter(u=>u.prewriteTypes.includes("Mesh")).forEach(u=>u.prewrite(i,"Mesh")),n.meshes=s.listMeshes().map((u,y)=>{let b=i.createPropertyDef(u),m=null;return b.primitives=u.listPrimitives().map(x=>{let M={attributes:{}};M.mode=x.getMode();let E=x.getMaterial();E&&(M.material=i.materialIndexMap.get(E)),Object.keys(x.getExtras()).length&&(M.extras=x.getExtras());let T=x.getIndices();T&&(M.indices=i.accessorIndexMap.get(T));for(let I of x.listSemantics())M.attributes[I]=i.accessorIndexMap.get(x.getAttribute(I));for(let I of x.listTargets()){let A={};for(let R of I.listSemantics())A[R]=i.accessorIndexMap.get(I.getAttribute(R));M.targets=M.targets||[],M.targets.push(A)}return x.listTargets().length&&!m&&(m=x.listTargets().map(I=>I.getName())),M}),u.getWeights().length&&(b.weights=u.getWeights()),m&&(b.extras=b.extras||{},b.extras.targetNames=m),i.meshIndexMap.set(u,y),b}),n.cameras=s.listCameras().map((u,y)=>{let b=i.createPropertyDef(u);if(b.type=u.getType(),b.type===rn.Type.PERSPECTIVE){b.perspective={znear:u.getZNear(),zfar:u.getZFar(),yfov:u.getYFov()};let m=u.getAspectRatio();m!==null&&(b.perspective.aspectRatio=m)}else b.orthographic={znear:u.getZNear(),zfar:u.getZFar(),xmag:u.getXMag(),ymag:u.getYMag()};return i.cameraIndexMap.set(u,y),b}),n.nodes=s.listNodes().map((u,y)=>{let b=i.createPropertyDef(u);return le.eq(u.getTranslation(),[0,0,0])||(b.translation=u.getTranslation()),le.eq(u.getRotation(),[0,0,0,1])||(b.rotation=u.getRotation()),le.eq(u.getScale(),[1,1,1])||(b.scale=u.getScale()),u.getWeights().length&&(b.weights=u.getWeights()),i.nodeIndexMap.set(u,y),b}),n.skins=s.listSkins().map((u,y)=>{let b=i.createPropertyDef(u),m=u.getInverseBindMatrices();m&&(b.inverseBindMatrices=i.accessorIndexMap.get(m));let x=u.getSkeleton();return x&&(b.skeleton=i.nodeIndexMap.get(x)),b.joints=u.listJoints().map(M=>i.nodeIndexMap.get(M)),i.skinIndexMap.set(u,y),b}),s.listNodes().forEach((u,y)=>{let b=n.nodes[y],m=u.getMesh();m&&(b.mesh=i.meshIndexMap.get(m));let x=u.getCamera();x&&(b.camera=i.cameraIndexMap.get(x));let M=u.getSkin();M&&(b.skin=i.skinIndexMap.get(M)),u.listChildren().length>0&&(b.children=u.listChildren().map(E=>i.nodeIndexMap.get(E)))}),n.animations=s.listAnimations().map((u,y)=>{let b=i.createPropertyDef(u),m=new Map;return b.samplers=u.listSamplers().map((x,M)=>{let E=i.createPropertyDef(x);return E.input=i.accessorIndexMap.get(x.getInput()),E.output=i.accessorIndexMap.get(x.getOutput()),E.interpolation=x.getInterpolation(),m.set(x,M),E}),b.channels=u.listChannels().map(x=>{let M=i.createPropertyDef(x);return M.sampler=m.get(x.getSampler()),M.target={node:i.nodeIndexMap.get(x.getTargetNode()),path:x.getTargetPath()},M}),i.animationIndexMap.set(u,y),b}),n.scenes=s.listScenes().map((u,y)=>{let b=i.createPropertyDef(u);return b.nodes=u.listChildren().map(m=>i.nodeIndexMap.get(m)),i.sceneIndexMap.set(u,y),b});let p=s.getDefaultScene();return p&&(n.scene=s.listScenes().indexOf(p)),n.extensionsUsed=l.map(u=>u.extensionName),n.extensionsRequired=f.map(u=>u.extensionName),l.forEach(u=>u.write(i)),Ep(n),r}};function Ep(e){let t=[];for(let a in e){let s=e[a];(Array.isArray(s)&&s.length===0||s===null||s===""||s&&typeof s=="object"&&Object.keys(s).length===0)&&t.push(a)}for(let a of t)delete e[a]}var Tp=class{_logger=sn.DEFAULT_INSTANCE;_extensions=new Set;_dependencies={};_vertexLayout="interleaved";_strictResources=!0;lastReadBytes=0;lastWriteBytes=0;setLogger(e){return this._logger=e,this}registerExtensions(e){for(let t of e)this._extensions.add(t),t.register();return this}registerDependencies(e){return Object.assign(this._dependencies,e),this}setVertexLayout(e){return this._vertexLayout=e,this}setStrictResources(e){return this._strictResources=e,this}async read(e){return await this.readJSON(await this.readAsJSON(e))}async readAsJSON(e){let t=await this.readURI(e,"view");this.lastReadBytes=t.byteLength;let a=Ic(t)?this._binaryToJSON(t):{json:JSON.parse(q.decodeText(t)),resources:{}};return await this._readResourcesExternal(a,this.dirname(e)),this._readResourcesInternal(a),a}async readJSON(e){return e=this._copyJSON(e),this._readResourcesInternal(e),pp.read(e,{extensions:Array.from(this._extensions),dependencies:this._dependencies,logger:this._logger})}async binaryToJSON(e){let t=this._binaryToJSON(q.assertView(e));this._readResourcesInternal(t);let a=t.json;if(a.buffers&&a.buffers.some(s=>Sp(t,s)))throw new Error("Cannot resolve external buffers with binaryToJSON().");if(a.images&&a.images.some(s=>Ip(t,s)))throw new Error("Cannot resolve external images with binaryToJSON().");return t}async readBinary(e){return this.readJSON(await this.binaryToJSON(q.assertView(e)))}async writeJSON(e,t={}){if(t.format==="GLB"&&e.getRoot().listBuffers().length>1)throw new Error("GLB must have 0\u20131 buffers.");return kp.write(e,{format:t.format||"GLTF",basename:t.basename||"",logger:this._logger,vertexLayout:this._vertexLayout,dependencies:{...this._dependencies},extensions:Array.from(this._extensions)})}async writeBinary(e){let{json:t,resources:a}=await this.writeJSON(e,{format:"GLB"}),s=new Uint32Array([1179937895,2,12]),n=JSON.stringify(t),r=q.pad(q.encodeText(n),32),i=q.toView(new Uint32Array([r.byteLength,1313821514])),o=q.concat([i,r]);s[s.length-1]+=o.byteLength;let c=Object.values(a)[0];if(!c||!c.byteLength)return q.concat([q.toView(s),o]);let l=q.pad(c,0),f=q.toView(new Uint32Array([l.byteLength,5130562])),d=q.concat([f,l]);return s[s.length-1]+=d.byteLength,q.concat([q.toView(s),o,d])}async _readResourcesExternal(e,t){let a=e.json.images||[],s=e.json.buffers||[],n=[...a,...s].map(async r=>{let i=r.uri;if(!i||i.match(/data:/))return Promise.resolve();try{e.resources[i]=await this.readURI(this.resolve(t,i),"view"),this.lastReadBytes+=e.resources[i].byteLength}catch(o){if(!this._strictResources&&a.includes(r))this._logger.warn(`Failed to load image URI, "${i}". ${o}`),e.resources[i]=null;else throw o}});await Promise.all(n)}_readResourcesInternal(e){function t(a){if(a.uri){if(a.uri in e.resources){q.assertView(e.resources[a.uri]);return}if(a.uri.match(/data:/)){let s=`__${op()}.${xa.extension(a.uri)}`;e.resources[s]=q.createBufferFromDataURI(a.uri),a.uri=s}}}(e.json.images||[]).forEach(a=>{if(a.bufferView===void 0&&a.uri===void 0)throw new Error("Missing resource URI or buffer view.");t(a)}),(e.json.buffers||[]).forEach(t)}_copyJSON(e){let{images:t,buffers:a}=e.json;return e={json:{...e.json},resources:{...e.resources}},t&&(e.json.images=t.map(s=>({...s}))),a&&(e.json.buffers=a.map(s=>({...s}))),e}_binaryToJSON(e){if(!Ic(e))throw new Error("Invalid glTF 2.0 binary.");let t=new Uint32Array(e.buffer,e.byteOffset+12,2);if(t[1]!==1313821514)throw new Error("Missing required GLB JSON chunk.");let a=20,s=t[0],n=q.decodeText(q.toView(e,a,s)),r=JSON.parse(n),i=a+s;if(e.byteLength<=i)return{json:r,resources:{}};let o=new Uint32Array(e.buffer,e.byteOffset+i,2);if(o[1]!==5130562)return{json:r,resources:{}};let c=o[0],l=q.toView(e,i+8,c);return{json:r,resources:{[_t]:l}}}};function Sp(e,t){return t.uri!==void 0&&!(t.uri in e.resources)}function Ip(e,t){return t.uri!==void 0&&!(t.uri in e.resources)&&t.bufferView===void 0}function Ic(e){if(e.byteLength<3*Uint32Array.BYTES_PER_ELEMENT)return!1;let t=new Uint32Array(e.buffer,e.byteOffset,3);return t[0]===1179937895&&t[1]===2}var Xc=class extends Tp{_fetchConfig;constructor(e=Xr.DEFAULT_INIT){super(),this._fetchConfig=e}async readURI(e,t){let a=await fetch(e,this._fetchConfig);switch(t){case"view":return new Uint8Array(await a.arrayBuffer());case"text":return a.text()}}resolve(e,t){return Xr.resolve(e,t)}dirname(e){return Xr.dirname(e)}};function Ap(){return{vkFormat:0,typeSize:1,pixelWidth:0,pixelHeight:0,pixelDepth:0,layerCount:0,faceCount:1,levelCount:0,supercompressionScheme:0,levels:[],dataFormatDescriptor:[{vendorId:0,descriptorType:0,versionNumber:2,colorModel:0,colorPrimaries:1,transferFunction:2,flags:0,texelBlockDimension:[0,0,0,0],bytesPlane:[0,0,0,0,0,0,0,0],samples:[]}],keyValue:{},globalData:null}}var sa=class{constructor(t,a,s,n){this._dataView=void 0,this._littleEndian=void 0,this._offset=void 0,this._dataView=new DataView(t.buffer,t.byteOffset+a,s),this._littleEndian=n,this._offset=0}_nextUint8(){let t=this._dataView.getUint8(this._offset);return this._offset+=1,t}_nextUint16(){let t=this._dataView.getUint16(this._offset,this._littleEndian);return this._offset+=2,t}_nextUint32(){let t=this._dataView.getUint32(this._offset,this._littleEndian);return this._offset+=4,t}_nextUint64(){let t=this._dataView.getUint32(this._offset,this._littleEndian),a=this._dataView.getUint32(this._offset+4,this._littleEndian),s=t+2**32*a;return this._offset+=8,s}_nextInt32(){let t=this._dataView.getInt32(this._offset,this._littleEndian);return this._offset+=4,t}_nextUint8Array(t){let a=new Uint8Array(this._dataView.buffer,this._dataView.byteOffset+this._offset,t);return this._offset+=t,a}_skip(t){return this._offset+=t,this}_scan(t,a=0){let s=this._offset,n=0;for(;this._dataView.getUint8(this._offset)!==a&&n<t;)n++,this._offset++;return n<t&&this._offset++,new Uint8Array(this._dataView.buffer,this._dataView.byteOffset+s,n)}};var VM=new Uint8Array([0]),Be=[171,75,84,88,32,50,48,187,13,10,26,10];function Wc(e){return new TextDecoder().decode(e)}function on(e){let t=new Uint8Array(e.buffer,e.byteOffset,Be.length);if(t[0]!==Be[0]||t[1]!==Be[1]||t[2]!==Be[2]||t[3]!==Be[3]||t[4]!==Be[4]||t[5]!==Be[5]||t[6]!==Be[6]||t[7]!==Be[7]||t[8]!==Be[8]||t[9]!==Be[9]||t[10]!==Be[10]||t[11]!==Be[11])throw new Error("Missing KTX 2.0 identifier.");let a=Ap(),s=17*Uint32Array.BYTES_PER_ELEMENT,n=new sa(e,Be.length,s,!0);a.vkFormat=n._nextUint32(),a.typeSize=n._nextUint32(),a.pixelWidth=n._nextUint32(),a.pixelHeight=n._nextUint32(),a.pixelDepth=n._nextUint32(),a.layerCount=n._nextUint32(),a.faceCount=n._nextUint32(),a.levelCount=n._nextUint32(),a.supercompressionScheme=n._nextUint32();let r=n._nextUint32(),i=n._nextUint32(),o=n._nextUint32(),c=n._nextUint32(),l=n._nextUint64(),f=n._nextUint64(),d=Math.max(a.levelCount,1)*3*8,h=new sa(e,Be.length+s,d,!0);for(let P=0,L=Math.max(a.levelCount,1);P<L;P++)a.levels.push({levelData:new Uint8Array(e.buffer,e.byteOffset+h._nextUint64(),h._nextUint64()),uncompressedByteLength:h._nextUint64()});let g=new sa(e,r,i,!0);g._skip(4);let p=g._nextUint16(),u=g._nextUint16(),y=g._nextUint16(),b=g._nextUint16(),m=g._nextUint8(),x=g._nextUint8(),M=g._nextUint8(),E=g._nextUint8(),T=[g._nextUint8(),g._nextUint8(),g._nextUint8(),g._nextUint8()],I=[g._nextUint8(),g._nextUint8(),g._nextUint8(),g._nextUint8(),g._nextUint8(),g._nextUint8(),g._nextUint8(),g._nextUint8()],R={vendorId:p,descriptorType:u,versionNumber:y,colorModel:m,colorPrimaries:x,transferFunction:M,flags:E,texelBlockDimension:T,bytesPlane:I,samples:[]},O=(b/4-6)/4;for(let P=0;P<O;P++){let L={bitOffset:g._nextUint16(),bitLength:g._nextUint8(),channelType:g._nextUint8(),samplePosition:[g._nextUint8(),g._nextUint8(),g._nextUint8(),g._nextUint8()],sampleLower:Number.NEGATIVE_INFINITY,sampleUpper:Number.POSITIVE_INFINITY};L.channelType&64?(L.sampleLower=g._nextInt32(),L.sampleUpper=g._nextInt32()):(L.sampleLower=g._nextUint32(),L.sampleUpper=g._nextUint32()),R.samples[P]=L}a.dataFormatDescriptor.length=0,a.dataFormatDescriptor.push(R);let F=new sa(e,o,c,!0);for(;F._offset<c;){let P=F._nextUint32(),L=F._scan(P),J=Wc(L);if(a.keyValue[J]=F._nextUint8Array(P-L.byteLength-1),J.match(/^ktx/i)){let _e=Wc(a.keyValue[J]);a.keyValue[J]=_e.substring(0,_e.lastIndexOf("\0"))}let ue=P%4?4-P%4:0;F._skip(ue)}if(f<=0)return a;let K=new sa(e,l,f,!0),$=K._nextUint16(),ne=K._nextUint16(),de=K._nextUint32(),Ke=K._nextUint32(),be=K._nextUint32(),Ve=K._nextUint32(),Je=[];for(let P=0,L=Math.max(a.levelCount,1);P<L;P++)Je.push({imageFlags:K._nextUint32(),rgbSliceByteOffset:K._nextUint32(),rgbSliceByteLength:K._nextUint32(),alphaSliceByteOffset:K._nextUint32(),alphaSliceByteLength:K._nextUint32()});let Re=l+K._offset,it=Re+de,Qe=it+Ke,Tt=Qe+be,ma=new Uint8Array(e.buffer,e.byteOffset+Re,de),Or=new Uint8Array(e.buffer,e.byteOffset+it,Ke),js=new Uint8Array(e.buffer,e.byteOffset+Qe,be),S=new Uint8Array(e.buffer,e.byteOffset+Tt,Ve);return a.globalData={endpointCount:$,selectorCount:ne,imageDescs:Je,endpointsData:ma,selectorsData:Or,tablesData:js,extendedData:S},a}var Bt="EXT_mesh_gpu_instancing",mt="EXT_mesh_features",je="EXT_meshopt_compression",V="EXT_structural_metadata",cn="EXT_texture_webp",ln="EXT_texture_avif",Fp="KHR_accessor_float16",Op="KHR_accessor_float64",fe="KHR_draco_mesh_compression",gt="KHR_lights_punctual",Ct="KHR_materials_anisotropy",Ft="KHR_materials_clearcoat",Ot="KHR_materials_diffuse_transmission",Pt="KHR_materials_dispersion",jt="KHR_materials_emissive_strength",Lt="KHR_materials_ior",Dt="KHR_materials_iridescence",Ut="KHR_materials_pbrSpecularGlossiness",Gt="KHR_materials_sheen",zt="KHR_materials_specular",Kt="KHR_materials_transmission",va="KHR_materials_unlit",Vt="KHR_materials_volume",Ue="KHR_materials_variants",$c="KHR_mesh_primitive_restart",Yc="KHR_mesh_quantization",Ht="KHR_node_visibility",dn="KHR_texture_basisu",qt="KHR_texture_transform",tt="KHR_xmp_json_ld",Pp=class extends W{static EXTENSION_NAME=mt;init(){this.extensionName=mt,this.propertyType="FeatureID",this.parentTypes=["Features"]}getDefaults(){return Object.assign(super.getDefaults(),{nullFeatureId:null,label:"",attribute:null,texture:null,propertyTable:null})}getFeatureCount(){return this.get("featureCount")}setFeatureCount(e){return this.set("featureCount",e)}getNullFeatureID(){return this.get("nullFeatureId")}setNullFeatureID(e){return this.set("nullFeatureId",e)}getLabel(){return this.get("label")}setLabel(e){return this.set("label",e)}getAttribute(){return this.get("attribute")}setAttribute(e){return this.set("attribute",e)}getTexture(){return this.getRef("texture")}setTexture(e){return this.setRef("texture",e)}getPropertyTable(){return this.getRef("propertyTable")}setPropertyTable(e){return this.setRef("propertyTable",e)}},jp=class extends W{static EXTENSION_NAME=mt;init(){this.extensionName=mt,this.propertyType="FeatureIDTexture",this.parentTypes=["FeatureID"]}getDefaults(){let e=new oe(this.graph,"textureInfo");return e.setMinFilter(oe.MagFilter.NEAREST),e.setMagFilter(oe.MagFilter.NEAREST),Object.assign(super.getDefaults(),{channels:[0],texture:null,textureInfo:e})}getChannels(){return this.get("channels")}setChannels(e){return this.set("channels",e)}getTexture(){return this.getRef("texture")}setTexture(e){return this.setRef("texture",e)}getTextureInfo(){return this.getRef("texture")?this.getRef("textureInfo"):null}},Lp=class extends W{static EXTENSION_NAME=mt;init(){this.extensionName=mt,this.propertyType="Features",this.parentTypes=[C.PRIMITIVE]}getDefaults(){return Object.assign(super.getDefaults(),{featureIds:new re([])})}listFeatureIDs(){return this.listRefs("featureIds")}addFeatureID(e){return this.addRef("featureIds",e)}removeFeatureID(e){return this.removeRef("featureIds",e)}},Wa=mt,ii=class extends ae{extensionName=mt;static EXTENSION_NAME=mt;createFeatures(){return new Lp(this.document.getGraph())}createFeatureID(){return new Pp(this.document.getGraph())}createFeatureIDTexture(){return new jp(this.document.getGraph())}read(e){return(e.jsonDoc.json.meshes||[]).forEach((t,a)=>{(t.primitives||[]).forEach((s,n)=>{this._readPrimitive(e,a,s,n)})}),this}_readPrimitive(e,t,a,s){if(!a.extensions||!a.extensions[Wa])return;let n=this.createFeatures(),r=a.extensions[Wa];for(let i of r.featureIds){let o=Dp(this.document,this,e,i);n.addFeatureID(o)}e.meshes[t].listPrimitives()[s].setExtension(Wa,n)}write(e){let t=e.jsonDoc.json.meshes;if(!t)return this;for(let a of this.document.getRoot().listMeshes()){let s=t[e.meshIndexMap.get(a)];a.listPrimitives().forEach((n,r)=>{let i=s.primitives[r];this._writePrimitive(e,n,i)})}return this}_writePrimitive(e,t,a){let s=t.getExtension(Wa);if(!s)return;let n={featureIds:[]};s.listFeatureIDs().forEach(r=>{n.featureIds.push(Gp(this.document,e,r))}),a.extensions=a.extensions||{},a.extensions[Wa]=n}};function Dp(e,t,a,s){let n=t.createFeatureID().setFeatureCount(s.featureCount);s.nullFeatureId!==void 0&&n.setNullFeatureID(s.nullFeatureId),s.label!==void 0&&n.setLabel(s.label),s.attribute!==void 0&&n.setAttribute(s.attribute);let r=s.texture;if(r!==void 0){let i=Up(t,a,r);n.setTexture(i)}if(s.propertyTable!==void 0){let i=e.getRoot().getExtension(V).listPropertyTables();n.setPropertyTable(i[s.propertyTable])}return n}function Up(e,t,a){let s=e.createFeatureIDTexture(),{json:n}=t.jsonDoc;if(a.channels&&s.setChannels(a.channels),a.index!==void 0){let r=n.textures[a.index].source;s.setTexture(t.textures[r]),t.setTextureInfo(s.getTextureInfo(),a)}return s}function Gp(e,t,a){let s=e.getRoot(),n={featureCount:a.getFeatureCount()};if(a.getNullFeatureID()!=null&&(n.nullFeatureId=a.getNullFeatureID()),a.getLabel()&&(n.label=a.getLabel()),a.getAttribute()!=null&&(n.attribute=a.getAttribute()),a.getTexture()){let r=a.getTexture(),i=r.getTexture(),o=r.getTextureInfo();n.texture=t.createTextureInfoDef(i,o);let c=r.getChannels();le.eq(c,[0])||(n.texture.channels=c)}if(a.getPropertyTable()){let r=s.getExtension(V),i=a.getPropertyTable();n.propertyTable=r.listPropertyTables().indexOf(i)}return n}var si="INSTANCE_ATTRIBUTE",zp=class extends W{static EXTENSION_NAME=Bt;init(){this.extensionName=Bt,this.propertyType="InstancedMesh",this.parentTypes=[C.NODE]}getDefaults(){return Object.assign(super.getDefaults(),{attributes:new ge})}getAttribute(e){return this.getRefMap("attributes",e)}setAttribute(e,t){return this.setRefMap("attributes",e,t,{usage:si})}listAttributes(){return this.listRefMapValues("attributes")}listSemantics(){return this.listRefMapKeys("attributes")}},Kp=class extends ae{static EXTENSION_NAME=Bt;extensionName=Bt;prewriteTypes=[C.ACCESSOR];createInstancedMesh(){return new zp(this.document.getGraph())}read(e){return(e.jsonDoc.json.nodes||[]).forEach((t,a)=>{if(!t.extensions||!t.extensions.EXT_mesh_gpu_instancing)return;let s=t.extensions[Bt],n=this.createInstancedMesh();for(let r in s.attributes)n.setAttribute(r,e.accessors[s.attributes[r]]);e.nodes[a].setExtension(Bt,n)}),this}prewrite(e){e.accessorUsageGroupedByParent.add(si);for(let t of this.properties)for(let a of t.listAttributes())e.addAccessorToUsageGroup(a,si);return this}write(e){let t=e.jsonDoc;return this.document.getRoot().listNodes().forEach(a=>{let s=a.getExtension(Bt);if(s){let n=e.nodeIndexMap.get(a),r=t.json.nodes[n],i={attributes:{}};s.listSemantics().forEach(o=>{let c=s.getAttribute(o);i.attributes[o]=e.accessorIndexMap.get(c)}),r.extensions=r.extensions||{},r.extensions[Bt]=i}}),this}},Vp=(function(e){return e.QUANTIZE="quantize",e.FILTER="filter",e})({});function Hp(e){return!e.extensions||!e.extensions.EXT_meshopt_compression?!1:!!e.extensions[je].fallback}var{BYTE:qp,SHORT:Jc,FLOAT:Xp}=G.ComponentType,{encodeNormalizedInt:Qc,decodeNormalizedInt:ni}=le;function Wp(e,t,a,s){let{filter:n,bits:r}=s,i={array:e.getArray(),byteStride:e.getElementSize()*e.getComponentSize(),componentType:e.getComponentType(),normalized:e.getNormalized()};if(a!=="ATTRIBUTES")return i;if(n!=="NONE"){let o=e.getNormalized()?$p(e):new Float32Array(i.array);switch(n){case"EXPONENTIAL":i.byteStride=e.getElementSize()*4,i.componentType=Xp,i.normalized=!1,i.array=t.encodeFilterExp(o,e.getCount(),i.byteStride,r);break;case"OCTAHEDRAL":i.byteStride=r>8?8:4,i.componentType=r>8?Jc:qp,i.normalized=!0,o=e.getElementSize()===3?Jp(o):o,i.array=t.encodeFilterOct(o,e.getCount(),i.byteStride,r);break;case"QUATERNION":i.byteStride=8,i.componentType=Jc,i.normalized=!0,i.array=t.encodeFilterQuat(o,e.getCount(),i.byteStride,r);break;default:throw new Error("Invalid filter.")}i.min=e.getMin([]),i.max=e.getMax([]),e.getNormalized()&&(i.min=i.min.map(c=>ni(c,e.getComponentType())),i.max=i.max.map(c=>ni(c,e.getComponentType()))),i.normalized&&(i.min=i.min.map(c=>Qc(c,i.componentType)),i.max=i.max.map(c=>Qc(c,i.componentType)))}else i.byteStride%4&&(i.array=Yp(i.array,e.getElementSize()),i.byteStride=i.array.byteLength/e.getCount());return i}function $p(e){let t=e.getComponentType(),a=e.getArray(),s=new Float32Array(a.length);for(let n=0;n<a.length;n++)s[n]=ni(a[n],t);return s}function Yp(e,t){let a=q.padNumber(e.BYTES_PER_ELEMENT*t)/e.BYTES_PER_ELEMENT,s=e.length/t,n=new e.constructor(s*a);for(let r=0;r*t<e.length;r++)for(let i=0;i<t;i++)n[r*a+i]=e[r*t+i];return n}function Jp(e){let t=new Float32Array(e.length*4/3);for(let a=0,s=e.length/3;a<s;a++)t[a*4]=e[a*3],t[a*4+1]=e[a*3+1],t[a*4+2]=e[a*3+2];return t}function Qp(e,t){return t===Rt.BufferViewUsage.ELEMENT_ARRAY_BUFFER?e.listParents().some(a=>a instanceof Xa&&a.getMode()===Xa.Mode.TRIANGLES)?"TRIANGLES":"INDICES":"ATTRIBUTES"}function Zp(e,t){let a=t.getGraph().listParentEdges(e).filter(s=>!(s.getParent()instanceof ei));for(let s of a){let n=s.getName(),r=s.getAttributes().key||"",i=s.getParent().propertyType===C.PRIMITIVE_TARGET;if(n==="indices")return{filter:"NONE"};if(n==="attributes"){if(r==="POSITION")return{filter:"NONE"};if(r==="TEXCOORD_0")return{filter:"NONE"};if(r.startsWith("JOINTS_"))return{filter:"NONE"};if(r.startsWith("WEIGHTS_"))return{filter:"NONE"};if(r==="NORMAL"||r==="TANGENT")return i?{filter:"NONE"}:{filter:"OCTAHEDRAL",bits:8}}if(n==="output"){let o=pl(e);return o==="rotation"?{filter:"QUATERNION",bits:16}:o==="translation"?{filter:"EXPONENTIAL",bits:12}:o==="scale"?{filter:"EXPONENTIAL",bits:12}:{filter:"NONE"}}if(n==="input")return{filter:"NONE"};if(n==="inverseBindMatrices")return{filter:"NONE"}}return{filter:"NONE"}}function pl(e){for(let t of e.listParents())if(t instanceof nn){for(let a of t.listParents())if(a instanceof Zr)return a.getTargetPath()}return null}var Zc={method:"quantize"},oi=class extends ae{extensionName=je;prereadTypes=[C.BUFFER,C.PRIMITIVE];prewriteTypes=[C.BUFFER,C.ACCESSOR];readDependencies=["meshopt.decoder"];writeDependencies=["meshopt.encoder"];static EXTENSION_NAME=je;static EncoderMethod=Vp;_decoder=null;_decoderFallbackBufferMap=new Map;_encoder=null;_encoderOptions=Zc;_encoderFallbackBuffer=null;_encoderBufferViews={};_encoderBufferViewData={};_encoderBufferViewAccessors={};install(e,t){return e==="meshopt.decoder"&&(this._decoder=t),e==="meshopt.encoder"&&(this._encoder=t),this}setEncoderOptions(e){return this._encoderOptions={...Zc,...e},this}preread(e,t){if(!this._decoder){if(!this.isRequired())return this;throw new Error(`[${je}] Please install extension dependency, "meshopt.decoder".`)}if(!this._decoder.supported){if(!this.isRequired())return this;throw new Error(`[${je}]: Missing WASM support.`)}return t===C.BUFFER?this._prereadBuffers(e):t===C.PRIMITIVE&&this._prereadPrimitives(e),this}_prereadBuffers(e){let t=e.jsonDoc;(t.json.bufferViews||[]).forEach((a,s)=>{if(!a.extensions||!a.extensions.EXT_meshopt_compression)return;let n=a.extensions[je],r=n.byteOffset||0,i=n.byteLength||0,o=n.count,c=n.byteStride,l=new Uint8Array(o*c),f=t.json.buffers[n.buffer],d=f.uri?t.resources[f.uri]:t.resources[_t],h=q.toView(d,r,i);this._decoder.decodeGltfBuffer(l,o,c,h,n.mode,n.filter),e.bufferViews[s]=l})}_prereadPrimitives(e){let t=e.jsonDoc;(t.json.bufferViews||[]).forEach(a=>{if(!a.extensions||!a.extensions.EXT_meshopt_compression)return;let s=a.extensions[je],n=e.buffers[s.buffer],r=e.buffers[a.buffer],i=t.json.buffers[a.buffer];Hp(i)&&this._decoderFallbackBufferMap.set(r,n)})}read(e){if(!this.isRequired())return this;for(let[t,a]of this._decoderFallbackBufferMap){for(let s of t.listParents())s instanceof G&&s.swap(t,a);t.dispose()}return this}prewrite(e,t){return t===C.ACCESSOR?this._prewriteAccessors(e):t===C.BUFFER&&this._prewriteBuffers(e),this}_prewriteAccessors(e){let t=e.jsonDoc.json,a=this._encoder,s=this._encoderOptions,n=this.document.getGraph(),r=this.document.createBuffer(),i=this.document.getRoot().listBuffers().indexOf(r),o=1,c=new Map,l=f=>{for(let d of n.listParents(f)){if(d.propertyType===C.ROOT)continue;let h=c.get(f);return h===void 0&&c.set(f,h=o++),h}return-1};this._encoderFallbackBuffer=r,this._encoderBufferViews={},this._encoderBufferViewData={},this._encoderBufferViewAccessors={};for(let f of this.document.getRoot().listAccessors()){if(pl(f)==="weights"||f.getSparse())continue;let d=e.getAccessorUsage(f),h=e.accessorUsageGroupedByParent.has(d)?l(f):null,g=Qp(f,d),p=s.method==="filter"?Zp(f,this.document):{filter:"NONE"},u=Wp(f,a,g,p),{array:y,byteStride:b}=u,m=f.getBuffer();if(!m)throw new Error(`${je}: Missing buffer for accessor.`);let x=this.document.getRoot().listBuffers().indexOf(m),M=[d,h,g,p.filter,b,x].join(":"),E=this._encoderBufferViews[M],T=this._encoderBufferViewData[M],I=this._encoderBufferViewAccessors[M];(!E||!T)&&(I=this._encoderBufferViewAccessors[M]=[],T=this._encoderBufferViewData[M]=[],E=this._encoderBufferViews[M]={buffer:i,target:Rt.USAGE_TO_TARGET[d],byteOffset:0,byteLength:0,byteStride:d===Rt.BufferViewUsage.ARRAY_BUFFER?b:void 0,extensions:{[je]:{buffer:x,byteOffset:0,byteLength:0,mode:g,filter:p.filter!=="NONE"?p.filter:void 0,byteStride:b,count:0}}});let A=e.createAccessorDef(f);A.componentType=u.componentType,A.normalized=u.normalized,A.byteOffset=E.byteLength,A.min&&u.min&&(A.min=u.min),A.max&&u.max&&(A.max=u.max),e.accessorIndexMap.set(f,t.accessors.length),t.accessors.push(A),I.push(A),T.push(new Uint8Array(y.buffer,y.byteOffset,y.byteLength)),E.byteLength+=y.byteLength,E.extensions.EXT_meshopt_compression.count+=f.getCount()}}_prewriteBuffers(e){let t=this._encoder;for(let a in this._encoderBufferViews){let s=this._encoderBufferViews[a],n=this._encoderBufferViewData[a],r=this.document.getRoot().listBuffers()[s.extensions[je].buffer],i=e.otherBufferViews.get(r)||[],{count:o,byteStride:c,mode:l}=s.extensions[je],f=q.concat(n),d=t.encodeGltfBuffer(f,o,c,l),h=q.pad(d);s.extensions[je].byteLength=d.byteLength,n.length=0,n.push(h),i.push(h),e.otherBufferViews.set(r,i)}}write(e){let t=0;for(let r in this._encoderBufferViews){let i=this._encoderBufferViews[r],o=this._encoderBufferViewData[r][0],c=e.otherBufferViewsIndexMap.get(o),l=this._encoderBufferViewAccessors[r];for(let g of l)g.bufferView=c;let f=e.jsonDoc.json.bufferViews[c],d=f.byteOffset||0;Object.assign(f,i),f.byteOffset=t;let h=f.extensions[je];h.byteOffset=d,t+=q.padNumber(i.byteLength)}let a=this._encoderFallbackBuffer,s=e.bufferIndexMap.get(a),n=e.jsonDoc.json.buffers[s];return n.byteLength=t,n.extensions={[je]:{fallback:!0}},a.dispose(),this}},eg=class extends W{static EXTENSION_NAME=V;init(){this.extensionName=V,this.propertyType="StructuralMetadata",this.parentTypes=[C.ROOT]}getDefaults(){return Object.assign(super.getDefaults(),{schema:null,schemaUri:"",propertyTables:new Te,propertyTextures:new Te,propertyAttributes:new Te})}getSchema(){return this.getRef("schema")}setSchema(e){return this.setRef("schema",e)}getSchemaUri(){return this.get("schemaUri")}setSchemaUri(e){return this.set("schemaUri",e)}listPropertyTables(){return this.listRefs("propertyTables")}addPropertyTable(e){return this.addRef("propertyTables",e)}removePropertyTable(e){return this.removeRef("propertyTables",e)}listPropertyTextures(){return this.listRefs("propertyTextures")}addPropertyTexture(e){return this.addRef("propertyTextures",e)}removePropertyTexture(e){return this.removeRef("propertyTextures",e)}listPropertyAttributes(){return this.listRefs("propertyAttributes")}addPropertyAttribute(e){return this.addRef("propertyAttributes",e)}removePropertyAttribute(e){return this.removeRef("propertyAttributes",e)}},tg=class extends W{static EXTENSION_NAME=V;init(){this.extensionName=V,this.propertyType="Schema",this.parentTypes=["StructuralMetadata"]}getDefaults(){return Object.assign(super.getDefaults(),{description:"",version:"",classes:new ge,enums:new ge})}getId(){return this.get("id")}setId(e){return this.set("id",e)}getDescription(){return this.get("description")}setDescription(e){return this.set("description",e)}getVersion(){return this.get("version")}setVersion(e){return this.set("version",e)}setClass(e,t){return this.setRefMap("classes",e,t)}getClass(e){return this.getRefMap("classes",e)}listClassKeys(){return this.listRefMapKeys("classes")}listClassValues(){return this.listRefMapValues("classes")}setEnum(e,t){return this.setRefMap("enums",e,t)}getEnum(e){return this.getRefMap("enums",e)}listEnumKeys(){return this.listRefMapKeys("enums")}listEnumValues(){return this.listRefMapValues("enums")}},ag=class extends W{static EXTENSION_NAME=V;init(){this.extensionName=V,this.propertyType="Class",this.parentTypes=["Schema"]}getDefaults(){return Object.assign(super.getDefaults(),{description:"",properties:new ge})}getDescription(){return this.get("description")}setDescription(e){return this.set("description",e)}setProperty(e,t){return this.setRefMap("properties",e,t)}getProperty(e){return this.getRefMap("properties",e)}listPropertyKeys(){return this.listRefMapKeys("properties")}listPropertyValues(){return this.listRefMapValues("properties")}},sg=class extends W{static EXTENSION_NAME=V;init(){this.extensionName=V,this.propertyType="ClassProperty",this.parentTypes=["Class"]}getDefaults(){return Object.assign(super.getDefaults(),{description:"",componentType:null,enumType:null,array:null,count:null,normalized:null,offset:null,scale:null,max:null,min:null,required:null,noData:null,default:null})}getDescription(){return this.get("description")}setDescription(e){return this.set("description",e)}getType(){return this.get("type")}setType(e){return this.set("type",e)}getComponentType(){return this.get("componentType")}setComponentType(e){return this.set("componentType",e)}getEnumType(){return this.get("enumType")}setEnumType(e){return this.set("enumType",e)}getArray(){return this.get("array")}setArray(e){return this.set("array",e)}getCount(){return this.get("count")}setCount(e){return this.set("count",e)}getNormalized(){return this.get("normalized")}setNormalized(e){return this.set("normalized",e)}getOffset(){return this.get("offset")}setOffset(e){return this.set("offset",e)}getScale(){return this.get("scale")}setScale(e){return this.set("scale",e)}getMax(){return this.get("max")}setMax(e){return this.set("max",e)}getMin(){return this.get("min")}setMin(e){return this.set("min",e)}getRequired(){return this.get("required")}setRequired(e){return this.set("required",e)}getNoData(){return this.get("noData")}setNoData(e){return this.set("noData",e)}getDefault(){return this.get("default")}setDefault(e){return this.set("default",e)}},ng=class extends W{static EXTENSION_NAME=V;init(){this.extensionName=V,this.propertyType="Enum",this.parentTypes=["Schema"]}getDefaults(){return Object.assign(super.getDefaults(),{description:"",valueType:"UINT16",values:new Te})}getDescription(){return this.get("description")}setDescription(e){return this.set("description",e)}getValueType(){return this.get("valueType")}setValueType(e){return this.set("valueType",e)}listValues(){return this.listRefs("values")}addEnumValue(e){return this.addRef("values",e)}removeEnumValue(e){return this.removeRef("values",e)}},rg=class extends W{static EXTENSION_NAME=V;init(){this.extensionName=V,this.propertyType="EnumValue",this.parentTypes=["Enum"]}getDefaults(){return Object.assign(super.getDefaults(),{description:null})}getDescription(){return this.get("description")}setDescription(e){return this.set("description",e)}getValue(){return this.get("value")}setValue(e){return this.set("value",e)}},ig=class extends W{static EXTENSION_NAME=V;init(){this.extensionName=V,this.propertyType="PropertyTable",this.parentTypes=["StructuralMetadata"]}getDefaults(){return Object.assign(super.getDefaults(),{properties:new ge})}getClass(){return this.get("class")}setClass(e){return this.set("class",e)}getCount(){return this.get("count")}setCount(e){return this.set("count",e)}setProperty(e,t){return this.setRefMap("properties",e,t)}getProperty(e){return this.getRefMap("properties",e)}listPropertyKeys(){return this.listRefMapKeys("properties")}listPropertyValues(){return this.listRefMapValues("properties")}},og=class extends W{static EXTENSION_NAME=V;init(){this.extensionName=V,this.propertyType="PropertyTableProperty",this.parentTypes=["PropertyTable"]}getDefaults(){return Object.assign(super.getDefaults(),{arrayOffsets:null,stringOffsets:null,arrayOffsetType:null,stringOffsetType:null,offset:null,scale:null,max:null,min:null})}getValues(){return this.get("values")}setValues(e){return this.set("values",e)}getArrayOffsets(){return this.get("arrayOffsets")}setArrayOffsets(e){return this.set("arrayOffsets",e)}getStringOffsets(){return this.get("stringOffsets")}setStringOffsets(e){return this.set("stringOffsets",e)}getArrayOffsetType(){return this.get("arrayOffsetType")}setArrayOffsetType(e){return this.set("arrayOffsetType",e)}getStringOffsetType(){return this.get("stringOffsetType")}setStringOffsetType(e){return this.set("stringOffsetType",e)}getOffset(){return this.get("offset")}setOffset(e){return this.set("offset",e)}getScale(){return this.get("scale")}setScale(e){return this.set("scale",e)}getMax(){return this.get("max")}setMax(e){return this.set("max",e)}getMin(){return this.get("min")}setMin(e){return this.set("min",e)}},cg=class extends W{static EXTENSION_NAME=V;init(){this.extensionName=V,this.propertyType="PropertyTexture",this.parentTypes=["StructuralMetadata"]}getDefaults(){return Object.assign(super.getDefaults(),{properties:new ge})}getClass(){return this.get("class")}setClass(e){return this.set("class",e)}setProperty(e,t){return this.setRefMap("properties",e,t)}getProperty(e){return this.getRefMap("properties",e)}listPropertyKeys(){return this.listRefMapKeys("properties")}listPropertyValues(){return this.listRefMapValues("properties")}},lg=class extends W{static EXTENSION_NAME=V;init(){this.extensionName=V,this.propertyType="PropertyTextureProperty",this.parentTypes=["PropertyTexture"]}getDefaults(){let e=new oe(this.graph,"textureInfo");return e.setMinFilter(oe.MagFilter.NEAREST),e.setMagFilter(oe.MagFilter.NEAREST),Object.assign(super.getDefaults(),{channels:[0],texture:null,textureInfo:e,offset:null,scale:null,max:null,min:null})}getChannels(){return this.get("channels")}setChannels(e){return this.set("channels",e)}getTexture(){return this.getRef("texture")}setTexture(e){return this.setRef("texture",e)}getTextureInfo(){return this.getRef("texture")?this.getRef("textureInfo"):null}getOffset(){return this.get("offset")}setOffset(e){return this.set("offset",e)}getScale(){return this.get("scale")}setScale(e){return this.set("scale",e)}getMax(){return this.get("max")}setMax(e){return this.set("max",e)}getMin(){return this.get("min")}setMin(e){return this.set("min",e)}},dg=class extends W{static EXTENSION_NAME=V;init(){this.extensionName=V,this.propertyType="PropertyAttribute",this.parentTypes=["StructuralMetadata"]}getDefaults(){return Object.assign(super.getDefaults(),{properties:new ge})}getClass(){return this.get("class")}setClass(e){return this.set("class",e)}setProperty(e,t){return this.setRefMap("properties",e,t)}getProperty(e){return this.getRefMap("properties",e)}listPropertyKeys(){return this.listRefMapKeys("properties")}listPropertyValues(){return this.listRefMapValues("properties")}},ug=class extends W{static EXTENSION_NAME=V;init(){this.extensionName=V,this.propertyType="PropertyAttributeProperty",this.parentTypes=["PropertyAttribute"]}getDefaults(){return Object.assign(super.getDefaults(),{offset:null,scale:null,max:null,min:null})}getAttribute(){return this.get("attribute")}setAttribute(e){return this.set("attribute",e)}getOffset(){return this.get("offset")}setOffset(e){return this.set("offset",e)}getScale(){return this.get("scale")}setScale(e){return this.set("scale",e)}getMax(){return this.get("max")}setMax(e){return this.set("max",e)}getMin(){return this.get("min")}setMin(e){return this.set("min",e)}},fg=class extends W{static EXTENSION_NAME=V;init(){this.extensionName=V,this.propertyType="NodeStructuralMetadata",this.parentTypes=[C.NODE]}getDefaults(){return Object.assign(super.getDefaults(),{class:"",properties:{}})}getClass(){return this.get("class")}setClass(e){return this.set("class",e)}getProperties(){return this.get("properties")}setProperties(e){return this.set("properties",e)}},hg=class extends W{static EXTENSION_NAME=V;init(){this.extensionName=V,this.propertyType="MeshPrimitiveStructuralMetadata",this.parentTypes=[C.PRIMITIVE]}getDefaults(){return Object.assign(super.getDefaults(),{propertyTextures:new Te,propertyAttributes:new Te})}listPropertyTextures(){return this.listRefs("propertyTextures")}addPropertyTexture(e){return this.addRef("propertyTextures",e)}removePropertyTexture(e){return this.removeRef("propertyTextures",e)}listPropertyAttributes(){return this.listRefs("propertyAttributes")}addPropertyAttribute(e){return this.addRef("propertyAttributes",e)}removePropertyAttribute(e){return this.removeRef("propertyAttributes",e)}},bg=class extends ae{extensionName=V;static EXTENSION_NAME=V;prewriteTypes=[C.BUFFER];prereadTypes=[C.SCENE];createStructuralMetadata(){return new eg(this.document.getGraph())}createSchema(){return new tg(this.document.getGraph())}createClass(){return new ag(this.document.getGraph())}createClassProperty(){return new sg(this.document.getGraph())}createEnum(){return new ng(this.document.getGraph())}createEnumValue(){return new rg(this.document.getGraph())}createPropertyTable(){return new ig(this.document.getGraph())}createPropertyTableProperty(){return new og(this.document.getGraph())}createPropertyTexture(){return new cg(this.document.getGraph())}createPropertyTextureProperty(){return new lg(this.document.getGraph())}createPropertyAttribute(){return new dg(this.document.getGraph())}createPropertyAttributeProperty(){return new ug(this.document.getGraph())}createNodeStructuralMetadata(){return new fg(this.document.getGraph())}createMeshPrimitiveStructuralMetadata(){return new hg(this.document.getGraph())}read(e){return this}preread(e){let t=this.document.getRoot(),{json:a}=e.jsonDoc,s=a.extensions[V],n=pg(this,e,s);return t.setExtension(V,n),(a.meshes||[]).forEach((r,i)=>{let o=e.meshes[i].listPrimitives();(r.primitives||[]).forEach((c,l)=>{let f=o[l];this._readPrimitive(n,f,c)})}),(a.nodes||[]).forEach((r,i)=>{this._readNode(e.nodes[i],r)}),this}_readPrimitive(e,t,a){if(!a.extensions||!a.extensions.EXT_structural_metadata)return;let s=this.createMeshPrimitiveStructuralMetadata(),n=a.extensions[V],r=e.listPropertyTextures(),i=n.propertyTextures||[];for(let l of i){let f=r[l];s.addPropertyTexture(f)}let o=e.listPropertyAttributes(),c=n.propertyAttributes||[];for(let l of c){let f=o[l];s.addPropertyAttribute(f)}t.setExtension(V,s)}_readNode(e,t){if(!t.extensions||!t.extensions.EXT_structural_metadata)return;let a=t.extensions[V],s=this.createNodeStructuralMetadata().setClass(a.class).setProperties(a.properties);e.setExtension(V,s)}write(e){let t=this.document.getRoot(),a=t.getExtension(V);if(!a)return this;let s=e.jsonDoc.json,n=Ig(e,a);s.extensions=s.extensions||{},s.extensions[V]=n;let r=t.listMeshes(),i=s.meshes;if(i)for(let l of r){let f=i[e.meshIndexMap.get(l)];l.listPrimitives().forEach((d,h)=>{let g=f.primitives[h];this._writePrimitive(a,d,g)})}let o=t.listNodes(),c=s.nodes;if(c)for(let l of o){let f=e.nodeIndexMap.get(l);this._writeNode(l,c[f])}return this}_writePrimitive(e,t,a){let s=t.getExtension(V);if(!s)return;let n=e.listPropertyTextures(),r=e.listPropertyAttributes(),i,o,c=s.listPropertyTextures();if(c.length>0){i=[];for(let d of c){let h=n.indexOf(d);if(h>=0)i.push(h);else throw new Error(`${V}: Invalid property texture in mesh primitive`)}}let l=s.listPropertyAttributes();if(l.length>0){o=[];for(let d of l){let h=r.indexOf(d);if(h>=0)o.push(h);else throw new Error(`${V}: Invalid property attribute in mesh primitive`)}}let f={propertyTextures:i,propertyAttributes:o};a.extensions=a.extensions||{},a.extensions[V]=f}_writeNode(e,t){let a=e.getExtension("EXT_structural_metadata");a&&(t.extensions=t.extensions||{},t.extensions[V]={class:a.getClass(),properties:a.getProperties()})}prewrite(e,t){return t===C.BUFFER&&this._prewriteBuffers(e),this}_prewriteBuffers(e){let t=this.document,a=t.getRoot().getExtension(V);e.jsonDoc.json.bufferViews||=[];for(let s of a.listPropertyTables())for(let n of s.listPropertyValues()){let r=Dg(t,e);r.push(n.getValues());let i=n.getArrayOffsets();i&&r.push(i);let o=n.getStringOffsets();o&&r.push(o)}}};function pg(e,t,a){let s=e.createStructuralMetadata();if(a.schema!==void 0){let o=gg(e,a.schema);s.setSchema(o)}else if(a.schemaUri){let o=a.schemaUri;s.setSchemaUri(o)}let n=a.propertyTextures||[];for(let o of n){let c=wg(e,t,o);s.addPropertyTexture(c)}let r=a.propertyTables||[];for(let o of r){let c=kg(e,t,o);s.addPropertyTable(c)}let i=a.propertyAttributes||[];for(let o of i){let c=Tg(e,o);s.addPropertyAttribute(c)}return s}function gg(e,t){let a=e.createSchema().setId(t.id);t.name!==void 0&&a.setName(t.name),t.description!==void 0&&a.setDescription(t.description),t.version!==void 0&&a.setVersion(t.version);let s=t.classes||{};for(let r of Object.keys(s)){let i=s[r];a.setClass(r,mg(e,i))}let n=t.enums||{};for(let r of Object.keys(n))a.setEnum(r,xg(e,n[r]));return a}function mg(e,t){let a=e.createClass();t.name!==void 0&&a.setName(t.name),t.description!==void 0&&a.setDescription(t.description);let s=t.properties||{};for(let n of Object.keys(s)){let r=yg(e,s[n]);a.setProperty(n,r)}return a}function yg(e,t){let a=e.createClassProperty().setType(t.type);return t.name!==void 0&&a.setName(t.name),t.description!==void 0&&a.setDescription(t.description),t.componentType!==void 0&&a.setComponentType(t.componentType),t.enumType!==void 0&&a.setEnumType(t.enumType),t.array!==void 0&&a.setArray(t.array),t.count!==void 0&&a.setCount(t.count),t.normalized!==void 0&&a.setNormalized(t.normalized),t.offset!==void 0&&a.setOffset(t.offset),t.scale!==void 0&&a.setScale(t.scale),t.max!==void 0&&a.setMax(t.max),t.min!==void 0&&a.setMin(t.min),t.required!==void 0&&a.setRequired(t.required),t.noData!==void 0&&a.setNoData(t.noData),t.default!==void 0&&a.setDefault(t.default),a}function xg(e,t){let a=e.createEnum();t.name!==void 0&&a.setName(t.name),t.description!==void 0&&a.setDescription(t.description),t.valueType!==void 0&&a.setValueType(t.valueType);let s=t.values||{};for(let n of s)a.addEnumValue(vg(e,n));return a}function vg(e,t){let a=e.createEnumValue();return t.name!==void 0&&a.setName(t.name),t.description!==void 0&&a.setDescription(t.description),t.value!==void 0&&a.setValue(t.value),a}function wg(e,t,a){let s=e.createPropertyTexture();s.setClass(a.class),a.name!==void 0&&s.setName(a.name);let n=a.properties||{};for(let r of Object.keys(n)){let i=Mg(e,t,n[r]);s.setProperty(r,i)}return s}function Mg(e,t,a){let s=e.createPropertyTextureProperty(),n=t.jsonDoc.json.textures||[];a.channels&&s.setChannels(a.channels);let r=n[a.index].source;if(r!==void 0){let i=t.textures[r];s.setTexture(i);let o=s.getTextureInfo();o&&t.setTextureInfo(o,a)}return a.offset!==void 0&&s.setOffset(a.offset),a.scale!==void 0&&s.setScale(a.scale),a.max!==void 0&&s.setMax(a.max),a.min!==void 0&&s.setMin(a.min),s}function kg(e,t,a){let s=e.createPropertyTable().setClass(a.class).setCount(a.count);a.name!==void 0&&s.setName(a.name);let n=a.properties||{};for(let r of Object.keys(n)){let i=Eg(e,t,n[r]);s.setProperty(r,i)}return s}function Eg(e,t,a){let s=e.createPropertyTableProperty(),n=ti(t,a.values);if(s.setValues(n),a.arrayOffsets!==void 0){let r=ti(t,a.arrayOffsets);s.setArrayOffsets(r)}if(a.stringOffsets!==void 0){let r=ti(t,a.stringOffsets);s.setStringOffsets(r)}return a.arrayOffsetType!==void 0&&s.setArrayOffsetType(a.arrayOffsetType),a.stringOffsetType!==void 0&&s.setStringOffsetType(a.stringOffsetType),a.offset!==void 0&&s.setOffset(a.offset),a.scale!==void 0&&s.setScale(a.scale),a.max!==void 0&&s.setMax(a.max),a.min!==void 0&&s.setMin(a.min),s}function Tg(e,t){let a=e.createPropertyAttribute();a.setClass(t.class),t.name!==void 0&&a.setName(t.name);let s=t.properties||{};for(let n of Object.keys(s)){let r=Sg(e,s[n]);a.setProperty(n,r)}return a}function Sg(e,t){let a=e.createPropertyAttributeProperty();return a.setAttribute(t.attribute),t.offset!==void 0&&a.setOffset(t.offset),t.scale!==void 0&&a.setScale(t.scale),t.max!==void 0&&a.setMax(t.max),t.min!==void 0&&a.setMin(t.min),a}function Ig(e,t){let a={},s=t.getSchema();s&&(a.schema=Ag(s));let n=t.getSchemaUri();n&&(a.schemaUri=n);let r=t.listPropertyTables();if(r.length>0){let c=[];for(let l of r){let f=Cg(e,l);c.push(f)}a.propertyTables=c}let i=t.listPropertyTextures();if(i.length>0){let c=[];for(let l of i){let f=jg(e,l);c.push(f)}a.propertyTextures=c}let o=t.listPropertyAttributes();if(o.length>0){let c=[];for(let l of o){let f=Og(l);c.push(f)}a.propertyAttributes=c}return a}function Ag(e){let t={id:e.getId()},a=e.listClassKeys();if(a.length>0){t.classes={};for(let n of a){let r=Rg(e.getClass(n));t.classes[n]=r}}let s=e.listEnumKeys();if(s.length>0){t.enums={};for(let n of s){let r=Ng(e.getEnum(n));t.enums[n]=r}}return e.getName()&&(t.name=e.getName()),e.getDescription()&&(t.description=e.getDescription()),e.getVersion()&&(t.version=e.getVersion()),t}function Rg(e){let t={},a=e.listPropertyKeys();if(a.length>0){t.properties={};for(let s of a){let n=e.getProperty(s);t.properties[s]=_g(n)}}return e.getName()&&(t.name=e.getName()),e.getDescription()&&(t.description=e.getDescription()),t}function _g(e){let t={type:e.getType()};return e.getArray()&&(t.array=e.getArray()),e.getNormalized()&&(t.normalized=e.getNormalized()),e.getRequired()&&(t.required=e.getRequired()),e.getName()&&(t.name=e.getName()),e.getDescription()&&(t.description=e.getDescription()),e.getComponentType()!=null&&(t.componentType=e.getComponentType()),e.getEnumType()!=null&&(t.enumType=e.getEnumType()),e.getCount()!=null&&(t.count=e.getCount()),e.getOffset()!=null&&(t.offset=e.getOffset()),e.getScale()!=null&&(t.scale=e.getScale()),e.getMax()!=null&&(t.max=e.getMax()),e.getMin()!=null&&(t.min=e.getMin()),e.getNoData()!=null&&(t.noData=e.getNoData()),e.getDefault()!=null&&(t.default=e.getDefault()),t}function Ng(e){let t={values:e.listValues().map(Bg)};return e.getName()&&(t.name=e.getName()),e.getDescription()&&(t.description=e.getDescription()),e.getValueType()!=="UINT16"&&(t.valueType=e.getValueType()),t}function Bg(e){let t={name:e.getName(),value:e.getValue()};return e.getDescription()&&(t.description=e.getDescription()),t}function Cg(e,t){let a={class:t.getClass(),count:t.getCount()};t.getName()&&(a.name=t.getName());let s=t.listPropertyKeys();if(s.length>0){a.properties={};for(let n of s){let r=Fg(e,t.getProperty(n));a.properties[n]=r}}return a}function Fg(e,t){let a=t.getValues(),s={values:e.otherBufferViewsIndexMap.get(a)};if(t.getArrayOffsets()){let n=t.getArrayOffsets();s.arrayOffsets=e.otherBufferViewsIndexMap.get(n)}if(t.getStringOffsets()){let n=t.getStringOffsets();s.stringOffsets=e.otherBufferViewsIndexMap.get(n)}return t.getArrayOffsetType()!=null&&(s.arrayOffsetType=t.getArrayOffsetType()),t.getStringOffsetType()!=null&&(s.stringOffsetType=t.getStringOffsetType()),t.getOffset()!=null&&(s.offset=t.getOffset()),t.getScale()!=null&&(s.scale=t.getScale()),t.getMax()!=null&&(s.max=t.getMax()),t.getMin()!=null&&(s.min=t.getMin()),s}function Og(e){let t={class:e.getClass()};e.getName()&&(t.name=e.getName());let a=e.listPropertyKeys();if(a.length>0){t.properties={};for(let s of a){let n=Pg(e.getProperty(s));t.properties[s]=n}}return t}function Pg(e){let t={attribute:e.getAttribute()};return e.getOffset()!=null&&(t.offset=e.getOffset()),e.getScale()!=null&&(t.scale=e.getScale()),e.getMax()!=null&&(t.max=e.getMax()),e.getMin()!=null&&(t.min=e.getMin()),t}function jg(e,t){let a={class:t.getClass()};t.getName()&&(a.name=t.getName());let s=t.listPropertyKeys();if(s.length>0){a.properties={};for(let n of s){let r=Lg(e,t.getProperty(n));a.properties[n]=r}}return a}function Lg(e,t){let a=t.getTexture(),s=t.getTextureInfo(),n=t.getChannels(),r=e.createTextureInfoDef(a,s);return le.eq(n,[0])||(r.channels=n),t.getOffset()!=null&&(r.offset=t.getOffset()),t.getScale()!=null&&(r.scale=t.getScale()),t.getMax()!=null&&(r.max=t.getMax()),t.getMin()!=null&&(r.min=t.getMin()),r}function ti(e,t){let a=e.jsonDoc,s=a.json.buffers||[],n=(a.json.bufferViews||[])[t],r=s[n.buffer],i=r.uri?a.resources[r.uri]:a.resources[_t],o=n.byteOffset||0,c=n.byteLength;return i.slice(o,o+c)}function Dg(e,t){let a=e.getRoot().listBuffers()[0],s=t.otherBufferViews.get(a);return s||(s=[],t.otherBufferViews.set(a,s)),s}var Ug=class{match(e){return e.length>=12&&q.decodeText(e.slice(4,12))==="ftypavif"}getSize(e){if(!this.match(e))return null;let t=new DataView(e.buffer,e.byteOffset,e.byteLength),a=el(t,0);if(!a)return null;let s=a.end;for(;a=el(t,s);)if(a.type==="meta")s=a.start+4;else if(a.type==="iprp"||a.type==="ipco")s=a.start;else{if(a.type==="ispe")return[t.getUint32(a.start+4),t.getUint32(a.start+8)];if(a.type==="mdat")break;s=a.end}return null}getChannels(e){return 4}},Gg=class extends ae{extensionName=ln;prereadTypes=[C.TEXTURE];static EXTENSION_NAME=ln;static register(){ct.registerFormat("image/avif",new Ug)}preread(e){return(e.jsonDoc.json.textures||[]).forEach(t=>{t.extensions&&t.extensions.EXT_texture_avif&&(t.source=t.extensions[ln].source)}),this}read(e){return this}write(e){let t=e.jsonDoc;return this.document.getRoot().listTextures().forEach(a=>{if(a.getMimeType()==="image/avif"){let s=e.imageIndexMap.get(a);(t.json.textures||[]).forEach(n=>{n.source===s&&(n.extensions=n.extensions||{},n.extensions[ln]={source:n.source},delete n.source)})}}),this}};function el(e,t){if(e.byteLength<4+t)return null;let a=e.getUint32(t);return e.byteLength<a+t||a<8?null:{type:q.decodeText(new Uint8Array(e.buffer,e.byteOffset+t+4,4)),start:t+8,end:t+a}}var zg=class{match(e){return e.length>=12&&e[8]===87&&e[9]===69&&e[10]===66&&e[11]===80}getSize(e){let t=q.decodeText(e.slice(0,4)),a=q.decodeText(e.slice(8,12));if(t!=="RIFF"||a!=="WEBP")return null;let s=new DataView(e.buffer,e.byteOffset),n=12;for(;n<s.byteLength;){let r=q.decodeText(new Uint8Array([s.getUint8(n),s.getUint8(n+1),s.getUint8(n+2),s.getUint8(n+3)])),i=s.getUint32(n+4,!0);if(r==="VP8 ")return[s.getInt16(n+14,!0)&16383,s.getInt16(n+16,!0)&16383];if(r==="VP8L"){let o=s.getUint8(n+9),c=s.getUint8(n+10),l=s.getUint8(n+11),f=s.getUint8(n+12);return[1+((c&63)<<8|o),1+((f&15)<<10|l<<2|(c&192)>>6)]}n+=8+i+i%2}return null}getChannels(e){return 4}},Kg=class extends ae{extensionName=cn;prereadTypes=[C.TEXTURE];static EXTENSION_NAME=cn;static register(){ct.registerFormat("image/webp",new zg)}preread(e){return(e.jsonDoc.json.textures||[]).forEach(t=>{t.extensions&&t.extensions.EXT_texture_webp&&(t.source=t.extensions[cn].source)}),this}read(e){return this}write(e){let t=e.jsonDoc;return this.document.getRoot().listTextures().forEach(a=>{if(a.getMimeType()==="image/webp"){let s=e.imageIndexMap.get(a);(t.json.textures||[]).forEach(n=>{n.source===s&&(n.extensions=n.extensions||{},n.extensions[cn]={source:n.source},delete n.source)})}}),this}},tl=Fp,Vg=class extends ae{extensionName=tl;static EXTENSION_NAME=tl;read(e){return this}write(e){return this}},al=Op,Hg=class extends ae{extensionName=al;static EXTENSION_NAME=al;read(e){return this}write(e){return this}},ye,gl,ml;function qg(e,t){let a=new ye.DecoderBuffer;try{if(a.Init(t,t.length),e.GetEncodedGeometryType(a)!==ye.TRIANGULAR_MESH)throw new Error(`[${fe}] Unknown geometry type.`);let s=new ye.Mesh;if(!e.DecodeBufferToMesh(a,s).ok()||s.ptr===0)throw new Error(`[${fe}] Decoding failure.`);return s}finally{ye.destroy(a)}}function Xg(e,t){let a=t.num_faces()*3,s,n;if(t.num_points()<=65534){let r=a*Uint16Array.BYTES_PER_ELEMENT;s=ye._malloc(r),e.GetTrianglesUInt16Array(t,r,s),n=new Uint16Array(ye.HEAPU16.buffer,s,a).slice()}else{let r=a*Uint32Array.BYTES_PER_ELEMENT;s=ye._malloc(r),e.GetTrianglesUInt32Array(t,r,s),n=new Uint32Array(ye.HEAPU32.buffer,s,a).slice()}return ye._free(s),n}function Wg(e,t,a,s){let n=ml[s.componentType],r=gl[s.componentType],i=a.num_components(),o=t.num_points()*i,c=o*r.BYTES_PER_ELEMENT,l=ye._malloc(c);e.GetAttributeDataArrayForAllPoints(t,a,n,c,l);let f=new r(ye.HEAPF32.buffer,l,o).slice();return ye._free(l),f}function $g(e){ye=e,gl={[G.ComponentType.FLOAT]:Float32Array,[G.ComponentType.UNSIGNED_INT]:Uint32Array,[G.ComponentType.UNSIGNED_SHORT]:Uint16Array,[G.ComponentType.UNSIGNED_BYTE]:Uint8Array,[G.ComponentType.SHORT]:Int16Array,[G.ComponentType.BYTE]:Int8Array},ml={[G.ComponentType.FLOAT]:ye.DT_FLOAT32,[G.ComponentType.UNSIGNED_INT]:ye.DT_UINT32,[G.ComponentType.UNSIGNED_SHORT]:ye.DT_UINT16,[G.ComponentType.UNSIGNED_BYTE]:ye.DT_UINT8,[G.ComponentType.SHORT]:ye.DT_INT16,[G.ComponentType.BYTE]:ye.DT_INT8}}var We,Yg=(function(e){return e[e.EDGEBREAKER=1]="EDGEBREAKER",e[e.SEQUENTIAL=0]="SEQUENTIAL",e})({}),yl={POSITION:14,NORMAL:10,COLOR:8,TEX_COORD:12,GENERIC:12},sl={decodeSpeed:5,encodeSpeed:5,method:1,quantizationBits:yl,quantizationVolume:"mesh"};function Jg(e){We=e}function Qg(e,t=sl){let a={...sl,...t};a.quantizationBits={...yl,...t.quantizationBits};let s=new We.MeshBuilder,n=new We.Mesh,r=new We.ExpertEncoder(n),i={},o=new We.DracoInt8Array,c=e.listTargets().length>0,l=!1;for(let u of e.listSemantics()){let y=e.getAttribute(u);if(y.getSparse()){l=!0;continue}let b=Zg(u),m=em(s,y.getComponentType(),n,We[b],y.getCount(),y.getElementSize(),y.getArray());if(m===-1)throw new Error(`Error compressing "${u}" attribute.`);if(i[u]=m,a.quantizationVolume==="mesh"||u!=="POSITION")r.SetAttributeQuantization(m,a.quantizationBits[b]);else if(typeof a.quantizationVolume=="object"){let{quantizationVolume:x}=a,M=Math.max(x.max[0]-x.min[0],x.max[1]-x.min[1],x.max[2]-x.min[2]);r.SetAttributeExplicitQuantization(m,a.quantizationBits[b],y.getElementSize(),x.min,M)}else throw new Error("Invalid quantization volume state.")}let f=e.getIndices();if(!f)throw new ri("Primitive must have indices.");s.AddFacesToMesh(n,f.getCount()/3,f.getArray()),r.SetSpeedOptions(a.encodeSpeed,a.decodeSpeed),r.SetTrackEncodedProperties(!0),a.method===0||c||l?r.SetEncodingMethod(We.MESH_SEQUENTIAL_ENCODING):r.SetEncodingMethod(We.MESH_EDGEBREAKER_ENCODING);let d=r.EncodeToDracoBuffer(!(c||l),o);if(d<=0)throw new ri("Error applying Draco compression.");let h=new Uint8Array(d);for(let u=0;u<d;++u)h[u]=o.GetValue(u);let g=r.GetNumberOfEncodedPoints(),p=r.GetNumberOfEncodedFaces()*3;return We.destroy(o),We.destroy(n),We.destroy(s),We.destroy(r),{numVertices:g,numIndices:p,data:h,attributeIDs:i}}function Zg(e){return e==="POSITION"?"POSITION":e==="NORMAL"?"NORMAL":e.startsWith("COLOR_")?"COLOR":e.startsWith("TEXCOORD_")?"TEX_COORD":"GENERIC"}function em(e,t,a,s,n,r,i){switch(t){case G.ComponentType.UNSIGNED_BYTE:return e.AddUInt8Attribute(a,s,n,r,i);case G.ComponentType.BYTE:return e.AddInt8Attribute(a,s,n,r,i);case G.ComponentType.UNSIGNED_SHORT:return e.AddUInt16Attribute(a,s,n,r,i);case G.ComponentType.SHORT:return e.AddInt16Attribute(a,s,n,r,i);case G.ComponentType.UNSIGNED_INT:return e.AddUInt32Attribute(a,s,n,r,i);case G.ComponentType.FLOAT:return e.AddFloatAttribute(a,s,n,r,i);default:throw new Error(`Unexpected component type, "${t}".`)}}var ri=class extends Error{},tm=class extends ae{extensionName=fe;prereadTypes=[C.PRIMITIVE];prewriteTypes=[C.ACCESSOR];readDependencies=["draco3d.decoder"];writeDependencies=["draco3d.encoder"];static EXTENSION_NAME=fe;static EncoderMethod=Yg;_decoderModule=null;_encoderModule=null;_encoderOptions={};install(e,t){return e==="draco3d.decoder"&&(this._decoderModule=t,$g(this._decoderModule)),e==="draco3d.encoder"&&(this._encoderModule=t,Jg(this._encoderModule)),this}setEncoderOptions(e){return this._encoderOptions=e,this}preread(e){if(!this._decoderModule)throw new Error(`[${fe}] Please install extension dependency, "draco3d.decoder".`);let t=this.document.getLogger(),a=e.jsonDoc,s=new Map;try{let n=a.json.meshes||[];for(let r of n)for(let i of r.primitives){if(!i.extensions||!i.extensions.KHR_draco_mesh_compression)continue;let o=i.extensions[fe],[c,l]=s.get(o.bufferView)||[];if(!l||!c){let f=a.json.bufferViews[o.bufferView],d=a.json.buffers[f.buffer],h=d.uri?a.resources[d.uri]:a.resources[_t],g=f.byteOffset||0,p=f.byteLength,u=q.toView(h,g,p);c=new this._decoderModule.Decoder,l=qg(c,u),s.set(o.bufferView,[c,l]),t.debug(`[${fe}] Decompressed ${u.byteLength} bytes.`)}for(let f in o.attributes){let d=e.jsonDoc.json.accessors[i.attributes[f]],h=c.GetAttributeByUniqueId(l,o.attributes[f]),g=Wg(c,l,h,d);e.accessors[i.attributes[f]].setArray(g)}i.indices!==void 0&&e.accessors[i.indices].setArray(Xg(c,l))}}finally{for(let[n,r]of Array.from(s.values()))this._decoderModule.destroy(n),this._decoderModule.destroy(r)}return this}read(e){return this}prewrite(e,t){if(!this._encoderModule)throw new Error(`[${fe}] Please install extension dependency, "draco3d.encoder".`);let a=this.document.getLogger();a.debug(`[${fe}] Compression options: ${JSON.stringify(this._encoderOptions)}`);let s=am(this.document),n=new Map,r="mesh";this._encoderOptions.quantizationVolume==="scene"&&(this.document.getRoot().listScenes().length!==1?a.warn(`[${fe}]: quantizationVolume=scene requires exactly 1 scene.`):r=_c(this.document.getRoot().listScenes().pop()));for(let i of Array.from(s.keys())){let o=s.get(i);if(!o)throw new Error("Unexpected primitive.");if(n.has(o)){n.set(o,n.get(o));continue}let c=i.getIndices(),l=e.jsonDoc.json.accessors,f;try{f=Qg(i,{...this._encoderOptions,quantizationVolume:r})}catch(g){if(g instanceof ri){a.warn(`[${fe}]: ${g.message} Skipping primitive compression.`);continue}throw g}n.set(o,f);let d=e.createAccessorDef(c);d.count=f.numIndices,e.accessorIndexMap.set(c,l.length),l.push(d),f.numVertices>65534&&G.getComponentSize(d.componentType)<=2?d.componentType=G.ComponentType.UNSIGNED_INT:f.numVertices>254&&G.getComponentSize(d.componentType)<=1&&(d.componentType=G.ComponentType.UNSIGNED_SHORT);for(let g of i.listSemantics()){let p=i.getAttribute(g);if(f.attributeIDs[g]===void 0)continue;let u=e.createAccessorDef(p);u.count=f.numVertices,e.accessorIndexMap.set(p,l.length),l.push(u)}let h=i.getAttribute("POSITION").getBuffer()||this.document.getRoot().listBuffers()[0];e.otherBufferViews.has(h)||e.otherBufferViews.set(h,[]),e.otherBufferViews.get(h).push(f.data)}return a.debug(`[${fe}] Compressed ${s.size} primitives.`),e.extensionData[fe]={primitiveHashMap:s,primitiveEncodingMap:n},this}write(e){let t=e.extensionData[fe];for(let a of this.document.getRoot().listMeshes()){let s=e.jsonDoc.json.meshes[e.meshIndexMap.get(a)];for(let n=0;n<a.listPrimitives().length;n++){let r=a.listPrimitives()[n],i=s.primitives[n],o=t.primitiveHashMap.get(r);if(!o)continue;let c=t.primitiveEncodingMap.get(o);c&&(i.extensions=i.extensions||{},i.extensions[fe]={bufferView:e.otherBufferViewsIndexMap.get(c.data),attributes:c.attributeIDs})}}if(!t.primitiveHashMap.size){let a=e.jsonDoc.json;a.extensionsUsed=(a.extensionsUsed||[]).filter(s=>s!==fe),a.extensionsRequired=(a.extensionsRequired||[]).filter(s=>s!==fe)}return this}};function am(e){let t=e.getLogger(),a=new Set,s=new Set,n=0,r=0;for(let d of e.getRoot().listMeshes())for(let h of d.listPrimitives())h.getIndices()?h.getMode()!==Xa.Mode.TRIANGLES?(s.add(h),r++):a.add(h):(s.add(h),n++);n>0&&t.warn(`[${fe}] Skipping Draco compression of ${n} non-indexed primitives.`),r>0&&t.warn(`[${fe}] Skipping Draco compression of ${r} non-TRIANGLES primitives.`);let i=e.getRoot().listAccessors(),o=new Map;for(let d=0;d<i.length;d++)o.set(i[d],d);let c=new Map,l=new Set,f=new Map;for(let d of Array.from(a)){let h=nl(d,o);if(l.has(h)){f.set(d,h);continue}if(c.has(d.getIndices())){let g=d.getIndices(),p=g.clone();o.set(p,e.getRoot().listAccessors().length-1),d.swap(g,p)}for(let g of d.listAttributes())if(c.has(g)){let p=g.clone();o.set(p,e.getRoot().listAccessors().length-1),d.swap(g,p)}h=nl(d,o),l.add(h),f.set(d,h),c.set(d.getIndices(),h);for(let g of d.listAttributes())c.set(g,h)}for(let d of Array.from(c.keys())){let h=new Set(d.listParents().map(g=>g.propertyType));if(h.size!==2||!h.has(C.PRIMITIVE)||!h.has(C.ROOT))throw new Error(`[${fe}] Compressed accessors must only be used as indices or vertex attributes.`)}for(let d of Array.from(a)){let h=f.get(d),g=d.getIndices();if(c.get(g)!==h||d.listAttributes().some(p=>c.get(p)!==h))throw new Error(`[${fe}] Draco primitives must share all, or no, accessors.`)}for(let d of Array.from(s)){let h=d.getIndices();if(c.has(h)||d.listAttributes().some(g=>c.has(g)))throw new Error(`[${fe}] Accessor cannot be shared by compressed and uncompressed primitives.`)}return f}function nl(e,t){let a=[],s=e.getIndices();a.push(t.get(s));for(let n of e.listAttributes())a.push(t.get(n));return a.sort().join("|")}var rl=class xl extends W{static EXTENSION_NAME=gt;static Type={POINT:"point",SPOT:"spot",DIRECTIONAL:"directional"};init(){this.extensionName=gt,this.propertyType="Light",this.parentTypes=[C.NODE]}getDefaults(){return Object.assign(super.getDefaults(),{color:[1,1,1],intensity:1,type:xl.Type.POINT,range:null,innerConeAngle:0,outerConeAngle:Math.PI/4})}getColor(){return this.get("color")}setColor(t){return this.set("color",t)}getIntensity(){return this.get("intensity")}setIntensity(t){return this.set("intensity",t)}getType(){return this.get("type")}setType(t){return this.set("type",t)}getRange(){return this.get("range")}setRange(t){return this.set("range",t)}getInnerConeAngle(){return this.get("innerConeAngle")}setInnerConeAngle(t){return this.set("innerConeAngle",t)}getOuterConeAngle(){return this.get("outerConeAngle")}setOuterConeAngle(t){return this.set("outerConeAngle",t)}},sm=class extends ae{extensionName=gt;static EXTENSION_NAME=gt;createLight(e=""){return new rl(this.document.getGraph(),e)}read(e){let t=e.jsonDoc;if(!t.json.extensions||!t.json.extensions.KHR_lights_punctual)return this;let a=(t.json.extensions.KHR_lights_punctual.lights||[]).map(s=>{let n=this.createLight().setName(s.name||"").setType(s.type);return s.extras&&n.setExtras(s.extras),s.color!==void 0&&n.setColor(s.color),s.intensity!==void 0&&n.setIntensity(s.intensity),s.range!==void 0&&n.setRange(s.range),s.spot?.innerConeAngle!==void 0&&n.setInnerConeAngle(s.spot.innerConeAngle),s.spot?.outerConeAngle!==void 0&&n.setOuterConeAngle(s.spot.outerConeAngle),n});return t.json.nodes.forEach((s,n)=>{if(!s.extensions||!s.extensions.KHR_lights_punctual)return;let r=s.extensions[gt];e.nodes[n].setExtension(gt,a[r.light])}),this}write(e){let t=e.jsonDoc;if(this.properties.size===0)return this;let a=[],s=new Map;for(let n of this.properties){let r=n,i=e.createPropertyDef(n);i.type=r.getType(),le.eq(r.getColor(),[1,1,1])||(i.color=r.getColor()),r.getIntensity()!==1&&(i.intensity=r.getIntensity()),r.getRange()!=null&&(i.range=r.getRange()),r.getName()&&(i.name=r.getName()),r.getType()===rl.Type.SPOT&&(i.spot={innerConeAngle:r.getInnerConeAngle(),outerConeAngle:r.getOuterConeAngle()}),a.push(i),s.set(r,a.length-1)}return this.document.getRoot().listNodes().forEach(n=>{let r=n.getExtension(gt);if(r){let i=e.nodeIndexMap.get(n),o=t.json.nodes[i];o.extensions=o.extensions||{},o.extensions[gt]={light:s.get(r)}}}),t.json.extensions=t.json.extensions||{},t.json.extensions[gt]={lights:a},this}},{R:nm,G:rm,B:im}=et,om=class extends W{static EXTENSION_NAME=Ct;init(){this.extensionName=Ct,this.propertyType="Anisotropy",this.parentTypes=[C.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{anisotropyStrength:0,anisotropyRotation:0,anisotropyTexture:null,anisotropyTextureInfo:new oe(this.graph,"anisotropyTextureInfo")})}getAnisotropyStrength(){return this.get("anisotropyStrength")}setAnisotropyStrength(e){return this.set("anisotropyStrength",e)}getAnisotropyRotation(){return this.get("anisotropyRotation")}setAnisotropyRotation(e){return this.set("anisotropyRotation",e)}getAnisotropyTexture(){return this.getRef("anisotropyTexture")}getAnisotropyTextureInfo(){return this.getRef("anisotropyTexture")?this.getRef("anisotropyTextureInfo"):null}setAnisotropyTexture(e){return this.setRef("anisotropyTexture",e,{channels:nm|rm|im})}},cm=class extends ae{static EXTENSION_NAME=Ct;extensionName=Ct;prereadTypes=[C.MESH];prewriteTypes=[C.MESH];createAnisotropy(){return new om(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((n,r)=>{if(n.extensions&&n.extensions.KHR_materials_anisotropy){let i=this.createAnisotropy();e.materials[r].setExtension(Ct,i);let o=n.extensions[Ct];if(o.extras&&i.setExtras(o.extras),o.anisotropyStrength!==void 0&&i.setAnisotropyStrength(o.anisotropyStrength),o.anisotropyRotation!==void 0&&i.setAnisotropyRotation(o.anisotropyRotation),o.anisotropyTexture!==void 0){let c=o.anisotropyTexture,l=e.textures[s[c.index].source];i.setAnisotropyTexture(l),e.setTextureInfo(i.getAnisotropyTextureInfo(),c)}}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(Ct);if(s){let n=e.materialIndexMap.get(a),r=t.json.materials[n],i=e.createPropertyDef(s);if(r.extensions=r.extensions||{},r.extensions[Ct]=i,s.getAnisotropyStrength()>0&&(i.anisotropyStrength=s.getAnisotropyStrength()),s.getAnisotropyRotation()!==0&&(i.anisotropyRotation=s.getAnisotropyRotation()),s.getAnisotropyTexture()){let o=s.getAnisotropyTexture(),c=s.getAnisotropyTextureInfo();i.anisotropyTexture=e.createTextureInfoDef(o,c)}}}),this}},{R:il,G:ol,B:lm}=et,dm=class extends W{static EXTENSION_NAME=Ft;init(){this.extensionName=Ft,this.propertyType="Clearcoat",this.parentTypes=[C.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{clearcoatFactor:0,clearcoatTexture:null,clearcoatTextureInfo:new oe(this.graph,"clearcoatTextureInfo"),clearcoatRoughnessFactor:0,clearcoatRoughnessTexture:null,clearcoatRoughnessTextureInfo:new oe(this.graph,"clearcoatRoughnessTextureInfo"),clearcoatNormalScale:1,clearcoatNormalTexture:null,clearcoatNormalTextureInfo:new oe(this.graph,"clearcoatNormalTextureInfo")})}getClearcoatFactor(){return this.get("clearcoatFactor")}setClearcoatFactor(e){return this.set("clearcoatFactor",e)}getClearcoatTexture(){return this.getRef("clearcoatTexture")}getClearcoatTextureInfo(){return this.getRef("clearcoatTexture")?this.getRef("clearcoatTextureInfo"):null}setClearcoatTexture(e){return this.setRef("clearcoatTexture",e,{channels:il})}getClearcoatRoughnessFactor(){return this.get("clearcoatRoughnessFactor")}setClearcoatRoughnessFactor(e){return this.set("clearcoatRoughnessFactor",e)}getClearcoatRoughnessTexture(){return this.getRef("clearcoatRoughnessTexture")}getClearcoatRoughnessTextureInfo(){return this.getRef("clearcoatRoughnessTexture")?this.getRef("clearcoatRoughnessTextureInfo"):null}setClearcoatRoughnessTexture(e){return this.setRef("clearcoatRoughnessTexture",e,{channels:ol})}getClearcoatNormalScale(){return this.get("clearcoatNormalScale")}setClearcoatNormalScale(e){return this.set("clearcoatNormalScale",e)}getClearcoatNormalTexture(){return this.getRef("clearcoatNormalTexture")}getClearcoatNormalTextureInfo(){return this.getRef("clearcoatNormalTexture")?this.getRef("clearcoatNormalTextureInfo"):null}setClearcoatNormalTexture(e){return this.setRef("clearcoatNormalTexture",e,{channels:il|ol|lm})}},um=class extends ae{static EXTENSION_NAME=Ft;extensionName=Ft;prereadTypes=[C.MESH];prewriteTypes=[C.MESH];createClearcoat(){return new dm(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((n,r)=>{if(n.extensions&&n.extensions.KHR_materials_clearcoat){let i=this.createClearcoat();e.materials[r].setExtension(Ft,i);let o=n.extensions[Ft];if(o.extras&&i.setExtras(o.extras),o.clearcoatFactor!==void 0&&i.setClearcoatFactor(o.clearcoatFactor),o.clearcoatRoughnessFactor!==void 0&&i.setClearcoatRoughnessFactor(o.clearcoatRoughnessFactor),o.clearcoatTexture!==void 0){let c=o.clearcoatTexture,l=e.textures[s[c.index].source];i.setClearcoatTexture(l),e.setTextureInfo(i.getClearcoatTextureInfo(),c)}if(o.clearcoatRoughnessTexture!==void 0){let c=o.clearcoatRoughnessTexture,l=e.textures[s[c.index].source];i.setClearcoatRoughnessTexture(l),e.setTextureInfo(i.getClearcoatRoughnessTextureInfo(),c)}if(o.clearcoatNormalTexture!==void 0){let c=o.clearcoatNormalTexture,l=e.textures[s[c.index].source];i.setClearcoatNormalTexture(l),e.setTextureInfo(i.getClearcoatNormalTextureInfo(),c),c.scale!==void 0&&i.setClearcoatNormalScale(c.scale)}}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(Ft);if(s){let n=e.materialIndexMap.get(a),r=t.json.materials[n],i=e.createPropertyDef(s);if(r.extensions=r.extensions||{},r.extensions[Ft]=i,i.clearcoatFactor=s.getClearcoatFactor(),i.clearcoatRoughnessFactor=s.getClearcoatRoughnessFactor(),s.getClearcoatTexture()){let o=s.getClearcoatTexture(),c=s.getClearcoatTextureInfo();i.clearcoatTexture=e.createTextureInfoDef(o,c)}if(s.getClearcoatRoughnessTexture()){let o=s.getClearcoatRoughnessTexture(),c=s.getClearcoatRoughnessTextureInfo();i.clearcoatRoughnessTexture=e.createTextureInfoDef(o,c)}if(s.getClearcoatNormalTexture()){let o=s.getClearcoatNormalTexture(),c=s.getClearcoatNormalTextureInfo();i.clearcoatNormalTexture=e.createTextureInfoDef(o,c),s.getClearcoatNormalScale()!==1&&(i.clearcoatNormalTexture.scale=s.getClearcoatNormalScale())}}}),this}},{R:fm,G:hm,B:bm,A:pm}=et,gm=class extends W{static EXTENSION_NAME=Ot;init(){this.extensionName=Ot,this.propertyType="DiffuseTransmission",this.parentTypes=[C.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{diffuseTransmissionFactor:0,diffuseTransmissionTexture:null,diffuseTransmissionTextureInfo:new oe(this.graph,"diffuseTransmissionTextureInfo"),diffuseTransmissionColorFactor:[1,1,1],diffuseTransmissionColorTexture:null,diffuseTransmissionColorTextureInfo:new oe(this.graph,"diffuseTransmissionColorTextureInfo")})}getDiffuseTransmissionFactor(){return this.get("diffuseTransmissionFactor")}setDiffuseTransmissionFactor(e){return this.set("diffuseTransmissionFactor",e)}getDiffuseTransmissionTexture(){return this.getRef("diffuseTransmissionTexture")}getDiffuseTransmissionTextureInfo(){return this.getRef("diffuseTransmissionTexture")?this.getRef("diffuseTransmissionTextureInfo"):null}setDiffuseTransmissionTexture(e){return this.setRef("diffuseTransmissionTexture",e,{channels:pm})}getDiffuseTransmissionColorFactor(){return this.get("diffuseTransmissionColorFactor")}setDiffuseTransmissionColorFactor(e){return this.set("diffuseTransmissionColorFactor",e)}getDiffuseTransmissionColorTexture(){return this.getRef("diffuseTransmissionColorTexture")}getDiffuseTransmissionColorTextureInfo(){return this.getRef("diffuseTransmissionColorTexture")?this.getRef("diffuseTransmissionColorTextureInfo"):null}setDiffuseTransmissionColorTexture(e){return this.setRef("diffuseTransmissionColorTexture",e,{channels:fm|hm|bm})}},mm=class extends ae{extensionName=Ot;static EXTENSION_NAME=Ot;createDiffuseTransmission(){return new gm(this.document.getGraph())}read(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((n,r)=>{if(n.extensions&&n.extensions.KHR_materials_diffuse_transmission){let i=this.createDiffuseTransmission();e.materials[r].setExtension(Ot,i);let o=n.extensions[Ot];if(o.extras&&i.setExtras(o.extras),o.diffuseTransmissionFactor!==void 0&&i.setDiffuseTransmissionFactor(o.diffuseTransmissionFactor),o.diffuseTransmissionColorFactor!==void 0&&i.setDiffuseTransmissionColorFactor(o.diffuseTransmissionColorFactor),o.diffuseTransmissionTexture!==void 0){let c=o.diffuseTransmissionTexture,l=e.textures[s[c.index].source];i.setDiffuseTransmissionTexture(l),e.setTextureInfo(i.getDiffuseTransmissionTextureInfo(),c)}if(o.diffuseTransmissionColorTexture!==void 0){let c=o.diffuseTransmissionColorTexture,l=e.textures[s[c.index].source];i.setDiffuseTransmissionColorTexture(l),e.setTextureInfo(i.getDiffuseTransmissionColorTextureInfo(),c)}}}),this}write(e){let t=e.jsonDoc;for(let a of this.document.getRoot().listMaterials()){let s=a.getExtension(Ot);if(!s)continue;let n=e.materialIndexMap.get(a),r=t.json.materials[n],i=e.createPropertyDef(s);if(r.extensions=r.extensions||{},r.extensions[Ot]=i,i.diffuseTransmissionFactor=s.getDiffuseTransmissionFactor(),i.diffuseTransmissionColorFactor=s.getDiffuseTransmissionColorFactor(),s.getDiffuseTransmissionTexture()){let o=s.getDiffuseTransmissionTexture(),c=s.getDiffuseTransmissionTextureInfo();i.diffuseTransmissionTexture=e.createTextureInfoDef(o,c)}if(s.getDiffuseTransmissionColorTexture()){let o=s.getDiffuseTransmissionColorTexture(),c=s.getDiffuseTransmissionColorTextureInfo();i.diffuseTransmissionColorTexture=e.createTextureInfoDef(o,c)}}return this}},ym=class extends W{static EXTENSION_NAME=Pt;init(){this.extensionName=Pt,this.propertyType="Dispersion",this.parentTypes=[C.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{dispersion:0})}getDispersion(){return this.get("dispersion")}setDispersion(e){return this.set("dispersion",e)}},xm=class extends ae{static EXTENSION_NAME=Pt;extensionName=Pt;prereadTypes=[C.MESH];prewriteTypes=[C.MESH];createDispersion(){return new ym(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){return(e.jsonDoc.json.materials||[]).forEach((t,a)=>{if(t.extensions&&t.extensions.KHR_materials_dispersion){let s=this.createDispersion();e.materials[a].setExtension(Pt,s);let n=t.extensions[Pt];n.extras&&s.setExtras(n.extras),n.dispersion!==void 0&&s.setDispersion(n.dispersion)}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(Pt);if(s){let n=e.materialIndexMap.get(a),r=t.json.materials[n],i=e.createPropertyDef(s);r.extensions=r.extensions||{},r.extensions[Pt]=i,i.dispersion=s.getDispersion()}}),this}},vm=class extends W{static EXTENSION_NAME=jt;init(){this.extensionName=jt,this.propertyType="EmissiveStrength",this.parentTypes=[C.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{emissiveStrength:1})}getEmissiveStrength(){return this.get("emissiveStrength")}setEmissiveStrength(e){return this.set("emissiveStrength",e)}},wm=class extends ae{static EXTENSION_NAME=jt;extensionName=jt;prereadTypes=[C.MESH];prewriteTypes=[C.MESH];createEmissiveStrength(){return new vm(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){return(e.jsonDoc.json.materials||[]).forEach((t,a)=>{if(t.extensions&&t.extensions.KHR_materials_emissive_strength){let s=this.createEmissiveStrength();e.materials[a].setExtension(jt,s);let n=t.extensions[jt];n.extras&&s.setExtras(n.extras),n.emissiveStrength!==void 0&&s.setEmissiveStrength(n.emissiveStrength)}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(jt);if(s){let n=e.materialIndexMap.get(a),r=t.json.materials[n],i=e.createPropertyDef(s);r.extensions=r.extensions||{},r.extensions[jt]=i,i.emissiveStrength=s.getEmissiveStrength()}}),this}},Mm=class extends W{static EXTENSION_NAME=Lt;init(){this.extensionName=Lt,this.propertyType="IOR",this.parentTypes=[C.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{ior:1.5})}getIOR(){return this.get("ior")}setIOR(e){return this.set("ior",e)}},km=class extends ae{static EXTENSION_NAME=Lt;extensionName=Lt;prereadTypes=[C.MESH];prewriteTypes=[C.MESH];createIOR(){return new Mm(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){return(e.jsonDoc.json.materials||[]).forEach((t,a)=>{if(t.extensions&&t.extensions.KHR_materials_ior){let s=this.createIOR();e.materials[a].setExtension(Lt,s);let n=t.extensions[Lt];n.extras&&s.setExtras(n.extras),n.ior!==void 0&&s.setIOR(n.ior)}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(Lt);if(s){let n=e.materialIndexMap.get(a),r=t.json.materials[n],i=e.createPropertyDef(s);r.extensions=r.extensions||{},r.extensions[Lt]=i,i.ior=s.getIOR()}}),this}},{R:Em,G:Tm}=et,Sm=class extends W{static EXTENSION_NAME=Dt;init(){this.extensionName=Dt,this.propertyType="Iridescence",this.parentTypes=[C.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{iridescenceFactor:0,iridescenceTexture:null,iridescenceTextureInfo:new oe(this.graph,"iridescenceTextureInfo"),iridescenceIOR:1.3,iridescenceThicknessMinimum:100,iridescenceThicknessMaximum:400,iridescenceThicknessTexture:null,iridescenceThicknessTextureInfo:new oe(this.graph,"iridescenceThicknessTextureInfo")})}getIridescenceFactor(){return this.get("iridescenceFactor")}setIridescenceFactor(e){return this.set("iridescenceFactor",e)}getIridescenceTexture(){return this.getRef("iridescenceTexture")}getIridescenceTextureInfo(){return this.getRef("iridescenceTexture")?this.getRef("iridescenceTextureInfo"):null}setIridescenceTexture(e){return this.setRef("iridescenceTexture",e,{channels:Em})}getIridescenceIOR(){return this.get("iridescenceIOR")}setIridescenceIOR(e){return this.set("iridescenceIOR",e)}getIridescenceThicknessMinimum(){return this.get("iridescenceThicknessMinimum")}setIridescenceThicknessMinimum(e){return this.set("iridescenceThicknessMinimum",e)}getIridescenceThicknessMaximum(){return this.get("iridescenceThicknessMaximum")}setIridescenceThicknessMaximum(e){return this.set("iridescenceThicknessMaximum",e)}getIridescenceThicknessTexture(){return this.getRef("iridescenceThicknessTexture")}getIridescenceThicknessTextureInfo(){return this.getRef("iridescenceThicknessTexture")?this.getRef("iridescenceThicknessTextureInfo"):null}setIridescenceThicknessTexture(e){return this.setRef("iridescenceThicknessTexture",e,{channels:Tm})}},Im=class extends ae{static EXTENSION_NAME=Dt;extensionName=Dt;prereadTypes=[C.MESH];prewriteTypes=[C.MESH];createIridescence(){return new Sm(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((n,r)=>{if(n.extensions&&n.extensions.KHR_materials_iridescence){let i=this.createIridescence();e.materials[r].setExtension(Dt,i);let o=n.extensions[Dt];if(o.extras&&i.setExtras(o.extras),o.iridescenceFactor!==void 0&&i.setIridescenceFactor(o.iridescenceFactor),o.iridescenceIor!==void 0&&i.setIridescenceIOR(o.iridescenceIor),o.iridescenceThicknessMinimum!==void 0&&i.setIridescenceThicknessMinimum(o.iridescenceThicknessMinimum),o.iridescenceThicknessMaximum!==void 0&&i.setIridescenceThicknessMaximum(o.iridescenceThicknessMaximum),o.iridescenceTexture!==void 0){let c=o.iridescenceTexture,l=e.textures[s[c.index].source];i.setIridescenceTexture(l),e.setTextureInfo(i.getIridescenceTextureInfo(),c)}if(o.iridescenceThicknessTexture!==void 0){let c=o.iridescenceThicknessTexture,l=e.textures[s[c.index].source];i.setIridescenceThicknessTexture(l),e.setTextureInfo(i.getIridescenceThicknessTextureInfo(),c)}}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(Dt);if(s){let n=e.materialIndexMap.get(a),r=t.json.materials[n],i=e.createPropertyDef(s);if(r.extensions=r.extensions||{},r.extensions[Dt]=i,s.getIridescenceFactor()>0&&(i.iridescenceFactor=s.getIridescenceFactor()),s.getIridescenceIOR()!==1.3&&(i.iridescenceIor=s.getIridescenceIOR()),s.getIridescenceThicknessMinimum()!==100&&(i.iridescenceThicknessMinimum=s.getIridescenceThicknessMinimum()),s.getIridescenceThicknessMaximum()!==400&&(i.iridescenceThicknessMaximum=s.getIridescenceThicknessMaximum()),s.getIridescenceTexture()){let o=s.getIridescenceTexture(),c=s.getIridescenceTextureInfo();i.iridescenceTexture=e.createTextureInfoDef(o,c)}if(s.getIridescenceThicknessTexture()){let o=s.getIridescenceThicknessTexture(),c=s.getIridescenceThicknessTextureInfo();i.iridescenceThicknessTexture=e.createTextureInfoDef(o,c)}}}),this}},{R:cl,G:ll,B:dl,A:ul}=et,Am=class extends W{static EXTENSION_NAME=Ut;init(){this.extensionName=Ut,this.propertyType="PBRSpecularGlossiness",this.parentTypes=[C.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{diffuseFactor:[1,1,1,1],diffuseTexture:null,diffuseTextureInfo:new oe(this.graph,"diffuseTextureInfo"),specularFactor:[1,1,1],glossinessFactor:1,specularGlossinessTexture:null,specularGlossinessTextureInfo:new oe(this.graph,"specularGlossinessTextureInfo")})}getDiffuseFactor(){return this.get("diffuseFactor")}setDiffuseFactor(e){return this.set("diffuseFactor",e)}getDiffuseTexture(){return this.getRef("diffuseTexture")}getDiffuseTextureInfo(){return this.getRef("diffuseTexture")?this.getRef("diffuseTextureInfo"):null}setDiffuseTexture(e){return this.setRef("diffuseTexture",e,{channels:cl|ll|dl|ul,isColor:!0})}getSpecularFactor(){return this.get("specularFactor")}setSpecularFactor(e){return this.set("specularFactor",e)}getGlossinessFactor(){return this.get("glossinessFactor")}setGlossinessFactor(e){return this.set("glossinessFactor",e)}getSpecularGlossinessTexture(){return this.getRef("specularGlossinessTexture")}getSpecularGlossinessTextureInfo(){return this.getRef("specularGlossinessTexture")?this.getRef("specularGlossinessTextureInfo"):null}setSpecularGlossinessTexture(e){return this.setRef("specularGlossinessTexture",e,{channels:cl|ll|dl|ul})}},Rm=class extends ae{static EXTENSION_NAME=Ut;extensionName=Ut;prereadTypes=[C.MESH];prewriteTypes=[C.MESH];createPBRSpecularGlossiness(){return new Am(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((n,r)=>{if(n.extensions&&n.extensions.KHR_materials_pbrSpecularGlossiness){let i=this.createPBRSpecularGlossiness();e.materials[r].setExtension(Ut,i);let o=n.extensions[Ut];if(o.extras&&i.setExtras(o.extras),o.diffuseFactor!==void 0&&i.setDiffuseFactor(o.diffuseFactor),o.specularFactor!==void 0&&i.setSpecularFactor(o.specularFactor),o.glossinessFactor!==void 0&&i.setGlossinessFactor(o.glossinessFactor),o.diffuseTexture!==void 0){let c=o.diffuseTexture,l=e.textures[s[c.index].source];i.setDiffuseTexture(l),e.setTextureInfo(i.getDiffuseTextureInfo(),c)}if(o.specularGlossinessTexture!==void 0){let c=o.specularGlossinessTexture,l=e.textures[s[c.index].source];i.setSpecularGlossinessTexture(l),e.setTextureInfo(i.getSpecularGlossinessTextureInfo(),c)}}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(Ut);if(s){let n=e.materialIndexMap.get(a),r=t.json.materials[n],i=e.createPropertyDef(s);if(r.extensions=r.extensions||{},r.extensions[Ut]=i,i.diffuseFactor=s.getDiffuseFactor(),i.specularFactor=s.getSpecularFactor(),i.glossinessFactor=s.getGlossinessFactor(),s.getDiffuseTexture()){let o=s.getDiffuseTexture(),c=s.getDiffuseTextureInfo();i.diffuseTexture=e.createTextureInfoDef(o,c)}if(s.getSpecularGlossinessTexture()){let o=s.getSpecularGlossinessTexture(),c=s.getSpecularGlossinessTextureInfo();i.specularGlossinessTexture=e.createTextureInfoDef(o,c)}}}),this}},{R:_m,G:Nm,B:Bm,A:Cm}=et,Fm=class extends W{static EXTENSION_NAME=Gt;init(){this.extensionName=Gt,this.propertyType="Sheen",this.parentTypes=[C.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{sheenColorFactor:[0,0,0],sheenColorTexture:null,sheenColorTextureInfo:new oe(this.graph,"sheenColorTextureInfo"),sheenRoughnessFactor:0,sheenRoughnessTexture:null,sheenRoughnessTextureInfo:new oe(this.graph,"sheenRoughnessTextureInfo")})}getSheenColorFactor(){return this.get("sheenColorFactor")}setSheenColorFactor(e){return this.set("sheenColorFactor",e)}getSheenColorTexture(){return this.getRef("sheenColorTexture")}getSheenColorTextureInfo(){return this.getRef("sheenColorTexture")?this.getRef("sheenColorTextureInfo"):null}setSheenColorTexture(e){return this.setRef("sheenColorTexture",e,{channels:_m|Nm|Bm,isColor:!0})}getSheenRoughnessFactor(){return this.get("sheenRoughnessFactor")}setSheenRoughnessFactor(e){return this.set("sheenRoughnessFactor",e)}getSheenRoughnessTexture(){return this.getRef("sheenRoughnessTexture")}getSheenRoughnessTextureInfo(){return this.getRef("sheenRoughnessTexture")?this.getRef("sheenRoughnessTextureInfo"):null}setSheenRoughnessTexture(e){return this.setRef("sheenRoughnessTexture",e,{channels:Cm})}},Om=class extends ae{static EXTENSION_NAME=Gt;extensionName=Gt;prereadTypes=[C.MESH];prewriteTypes=[C.MESH];createSheen(){return new Fm(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((n,r)=>{if(n.extensions&&n.extensions.KHR_materials_sheen){let i=this.createSheen();e.materials[r].setExtension(Gt,i);let o=n.extensions[Gt];if(o.extras&&i.setExtras(o.extras),o.sheenColorFactor!==void 0&&i.setSheenColorFactor(o.sheenColorFactor),o.sheenRoughnessFactor!==void 0&&i.setSheenRoughnessFactor(o.sheenRoughnessFactor),o.sheenColorTexture!==void 0){let c=o.sheenColorTexture,l=e.textures[s[c.index].source];i.setSheenColorTexture(l),e.setTextureInfo(i.getSheenColorTextureInfo(),c)}if(o.sheenRoughnessTexture!==void 0){let c=o.sheenRoughnessTexture,l=e.textures[s[c.index].source];i.setSheenRoughnessTexture(l),e.setTextureInfo(i.getSheenRoughnessTextureInfo(),c)}}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(Gt);if(s){let n=e.materialIndexMap.get(a),r=t.json.materials[n],i=e.createPropertyDef(s);if(r.extensions=r.extensions||{},r.extensions[Gt]=i,i.sheenColorFactor=s.getSheenColorFactor(),i.sheenRoughnessFactor=s.getSheenRoughnessFactor(),s.getSheenColorTexture()){let o=s.getSheenColorTexture(),c=s.getSheenColorTextureInfo();i.sheenColorTexture=e.createTextureInfoDef(o,c)}if(s.getSheenRoughnessTexture()){let o=s.getSheenRoughnessTexture(),c=s.getSheenRoughnessTextureInfo();i.sheenRoughnessTexture=e.createTextureInfoDef(o,c)}}}),this}},{R:Pm,G:jm,B:Lm,A:Dm}=et,Um=class extends W{static EXTENSION_NAME=zt;init(){this.extensionName=zt,this.propertyType="Specular",this.parentTypes=[C.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{specularFactor:1,specularTexture:null,specularTextureInfo:new oe(this.graph,"specularTextureInfo"),specularColorFactor:[1,1,1],specularColorTexture:null,specularColorTextureInfo:new oe(this.graph,"specularColorTextureInfo")})}getSpecularFactor(){return this.get("specularFactor")}setSpecularFactor(e){return this.set("specularFactor",e)}getSpecularColorFactor(){return this.get("specularColorFactor")}setSpecularColorFactor(e){return this.set("specularColorFactor",e)}getSpecularTexture(){return this.getRef("specularTexture")}getSpecularTextureInfo(){return this.getRef("specularTexture")?this.getRef("specularTextureInfo"):null}setSpecularTexture(e){return this.setRef("specularTexture",e,{channels:Dm})}getSpecularColorTexture(){return this.getRef("specularColorTexture")}getSpecularColorTextureInfo(){return this.getRef("specularColorTexture")?this.getRef("specularColorTextureInfo"):null}setSpecularColorTexture(e){return this.setRef("specularColorTexture",e,{channels:Pm|jm|Lm,isColor:!0})}},Gm=class extends ae{static EXTENSION_NAME=zt;extensionName=zt;prereadTypes=[C.MESH];prewriteTypes=[C.MESH];createSpecular(){return new Um(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((n,r)=>{if(n.extensions&&n.extensions.KHR_materials_specular){let i=this.createSpecular();e.materials[r].setExtension(zt,i);let o=n.extensions[zt];if(o.extras&&i.setExtras(o.extras),o.specularFactor!==void 0&&i.setSpecularFactor(o.specularFactor),o.specularColorFactor!==void 0&&i.setSpecularColorFactor(o.specularColorFactor),o.specularTexture!==void 0){let c=o.specularTexture,l=e.textures[s[c.index].source];i.setSpecularTexture(l),e.setTextureInfo(i.getSpecularTextureInfo(),c)}if(o.specularColorTexture!==void 0){let c=o.specularColorTexture,l=e.textures[s[c.index].source];i.setSpecularColorTexture(l),e.setTextureInfo(i.getSpecularColorTextureInfo(),c)}}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(zt);if(s){let n=e.materialIndexMap.get(a),r=t.json.materials[n],i=e.createPropertyDef(s);if(r.extensions=r.extensions||{},r.extensions[zt]=i,s.getSpecularFactor()!==1&&(i.specularFactor=s.getSpecularFactor()),le.eq(s.getSpecularColorFactor(),[1,1,1])||(i.specularColorFactor=s.getSpecularColorFactor()),s.getSpecularTexture()){let o=s.getSpecularTexture(),c=s.getSpecularTextureInfo();i.specularTexture=e.createTextureInfoDef(o,c)}if(s.getSpecularColorTexture()){let o=s.getSpecularColorTexture(),c=s.getSpecularColorTextureInfo();i.specularColorTexture=e.createTextureInfoDef(o,c)}}}),this}},{R:zm}=et,Km=class extends W{static EXTENSION_NAME=Kt;init(){this.extensionName=Kt,this.propertyType="Transmission",this.parentTypes=[C.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{transmissionFactor:0,transmissionTexture:null,transmissionTextureInfo:new oe(this.graph,"transmissionTextureInfo")})}getTransmissionFactor(){return this.get("transmissionFactor")}setTransmissionFactor(e){return this.set("transmissionFactor",e)}getTransmissionTexture(){return this.getRef("transmissionTexture")}getTransmissionTextureInfo(){return this.getRef("transmissionTexture")?this.getRef("transmissionTextureInfo"):null}setTransmissionTexture(e){return this.setRef("transmissionTexture",e,{channels:zm})}},Vm=class extends ae{static EXTENSION_NAME=Kt;extensionName=Kt;prereadTypes=[C.MESH];prewriteTypes=[C.MESH];createTransmission(){return new Km(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((n,r)=>{if(n.extensions&&n.extensions.KHR_materials_transmission){let i=this.createTransmission();e.materials[r].setExtension(Kt,i);let o=n.extensions[Kt];if(o.extras&&i.setExtras(o.extras),o.transmissionFactor!==void 0&&i.setTransmissionFactor(o.transmissionFactor),o.transmissionTexture!==void 0){let c=o.transmissionTexture,l=e.textures[s[c.index].source];i.setTransmissionTexture(l),e.setTextureInfo(i.getTransmissionTextureInfo(),c)}}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(Kt);if(s){let n=e.materialIndexMap.get(a),r=t.json.materials[n],i=e.createPropertyDef(s);if(r.extensions=r.extensions||{},r.extensions[Kt]=i,i.transmissionFactor=s.getTransmissionFactor(),s.getTransmissionTexture()){let o=s.getTransmissionTexture(),c=s.getTransmissionTextureInfo();i.transmissionTexture=e.createTextureInfoDef(o,c)}}}),this}},Hm=class extends W{static EXTENSION_NAME=va;init(){this.extensionName=va,this.propertyType="Unlit",this.parentTypes=[C.MATERIAL]}},qm=class extends ae{static EXTENSION_NAME=va;extensionName=va;prereadTypes=[C.MESH];prewriteTypes=[C.MESH];createUnlit(){return new Hm(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){return(e.jsonDoc.json.materials||[]).forEach((t,a)=>{t.extensions&&t.extensions.KHR_materials_unlit&&e.materials[a].setExtension(va,this.createUnlit())}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{if(a.getExtension("KHR_materials_unlit")){let s=e.materialIndexMap.get(a),n=t.json.materials[s];n.extensions=n.extensions||{},n.extensions[va]={}}}),this}},Xm=class extends W{static EXTENSION_NAME=Ue;init(){this.extensionName=Ue,this.propertyType="Mapping",this.parentTypes=["MappingList"]}getDefaults(){return Object.assign(super.getDefaults(),{material:null,variants:new re})}getMaterial(){return this.getRef("material")}setMaterial(e){return this.setRef("material",e)}addVariant(e){return this.addRef("variants",e)}removeVariant(e){return this.removeRef("variants",e)}listVariants(){return this.listRefs("variants")}},Wm=class extends W{static EXTENSION_NAME=Ue;init(){this.extensionName=Ue,this.propertyType="MappingList",this.parentTypes=[C.PRIMITIVE]}getDefaults(){return Object.assign(super.getDefaults(),{mappings:new re})}addMapping(e){return this.addRef("mappings",e)}removeMapping(e){return this.removeRef("mappings",e)}listMappings(){return this.listRefs("mappings")}},fl=class extends W{static EXTENSION_NAME=Ue;init(){this.extensionName=Ue,this.propertyType="Variant",this.parentTypes=["MappingList"]}},$m=class extends ae{extensionName=Ue;static EXTENSION_NAME=Ue;createMappingList(){return new Wm(this.document.getGraph())}createVariant(e=""){return new fl(this.document.getGraph(),e)}createMapping(){return new Xm(this.document.getGraph())}listVariants(){return Array.from(this.properties).filter(e=>e instanceof fl)}read(e){let t=e.jsonDoc;if(!t.json.extensions||!t.json.extensions.KHR_materials_variants)return this;let a=(t.json.extensions.KHR_materials_variants.variants||[]).map(s=>this.createVariant().setName(s.name||""));return(t.json.meshes||[]).forEach((s,n)=>{let r=e.meshes[n];(s.primitives||[]).forEach((i,o)=>{if(!i.extensions||!i.extensions.KHR_materials_variants)return;let c=this.createMappingList(),l=i.extensions[Ue];for(let f of l.mappings){let d=this.createMapping();f.material!==void 0&&d.setMaterial(e.materials[f.material]);for(let h of f.variants||[])d.addVariant(a[h]);c.addMapping(d)}r.listPrimitives()[o].setExtension(Ue,c)})}),this}write(e){let t=e.jsonDoc,a=this.listVariants();if(!a.length)return this;let s=[],n=new Map;for(let r of a)n.set(r,s.length),s.push(e.createPropertyDef(r));for(let r of this.document.getRoot().listMeshes()){let i=e.meshIndexMap.get(r);r.listPrimitives().forEach((o,c)=>{let l=o.getExtension(Ue);if(!l)return;let f=e.jsonDoc.json.meshes[i].primitives[c],d=l.listMappings().map(h=>{let g=e.createPropertyDef(h),p=h.getMaterial();return p&&(g.material=e.materialIndexMap.get(p)),g.variants=h.listVariants().map(u=>n.get(u)),g});f.extensions=f.extensions||{},f.extensions[Ue]={mappings:d}})}return t.json.extensions=t.json.extensions||{},t.json.extensions[Ue]={variants:s},this}},{G:Ym}=et,Jm=class extends W{static EXTENSION_NAME=Vt;init(){this.extensionName=Vt,this.propertyType="Volume",this.parentTypes=[C.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{thicknessFactor:0,thicknessTexture:null,thicknessTextureInfo:new oe(this.graph,"thicknessTexture"),attenuationDistance:1/0,attenuationColor:[1,1,1]})}getThicknessFactor(){return this.get("thicknessFactor")}setThicknessFactor(e){return this.set("thicknessFactor",e)}getThicknessTexture(){return this.getRef("thicknessTexture")}getThicknessTextureInfo(){return this.getRef("thicknessTexture")?this.getRef("thicknessTextureInfo"):null}setThicknessTexture(e){return this.setRef("thicknessTexture",e,{channels:Ym})}getAttenuationDistance(){return this.get("attenuationDistance")}setAttenuationDistance(e){return this.set("attenuationDistance",e)}getAttenuationColor(){return this.get("attenuationColor")}setAttenuationColor(e){return this.set("attenuationColor",e)}},Qm=class extends ae{static EXTENSION_NAME=Vt;extensionName=Vt;prereadTypes=[C.MESH];prewriteTypes=[C.MESH];createVolume(){return new Jm(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((n,r)=>{if(n.extensions&&n.extensions.KHR_materials_volume){let i=this.createVolume();e.materials[r].setExtension(Vt,i);let o=n.extensions[Vt];if(o.extras&&i.setExtras(o.extras),o.thicknessFactor!==void 0&&i.setThicknessFactor(o.thicknessFactor),o.attenuationDistance!==void 0&&i.setAttenuationDistance(o.attenuationDistance),o.attenuationColor!==void 0&&i.setAttenuationColor(o.attenuationColor),o.thicknessTexture!==void 0){let c=o.thicknessTexture,l=e.textures[s[c.index].source];i.setThicknessTexture(l),e.setTextureInfo(i.getThicknessTextureInfo(),c)}}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(Vt);if(s){let n=e.materialIndexMap.get(a),r=t.json.materials[n],i=e.createPropertyDef(s);if(r.extensions=r.extensions||{},r.extensions[Vt]=i,s.getThicknessFactor()>0&&(i.thicknessFactor=s.getThicknessFactor()),Number.isFinite(s.getAttenuationDistance())&&(i.attenuationDistance=s.getAttenuationDistance()),le.eq(s.getAttenuationColor(),[1,1,1])||(i.attenuationColor=s.getAttenuationColor()),s.getThicknessTexture()){let o=s.getThicknessTexture(),c=s.getThicknessTextureInfo();i.thicknessTexture=e.createTextureInfoDef(o,c)}}}),this}},Zm=class extends ae{extensionName=$c;static EXTENSION_NAME=$c;read(e){return this}write(e){return this}},ci=class extends ae{extensionName=Yc;static EXTENSION_NAME=Yc;read(e){return this}write(e){return this}},ey=class extends W{static EXTENSION_NAME=Ht;init(){this.extensionName=Ht,this.propertyType="Visibility",this.parentTypes=[C.NODE]}getDefaults(){return Object.assign(super.getDefaults(),{visible:!0})}getVisible(){return this.get("visible")}setVisible(e){return this.set("visible",e)}},ty=class extends ae{static EXTENSION_NAME=Ht;extensionName=Ht;createVisibility(){return new ey(this.document.getGraph())}read(e){return(e.jsonDoc.json.nodes||[]).forEach((t,a)=>{if(t.extensions&&t.extensions.KHR_node_visibility){let s=this.createVisibility();e.nodes[a].setExtension(Ht,s);let n=t.extensions[Ht];n.visible!==void 0&&s.setVisible(n.visible)}}),this}write(e){let t=e.jsonDoc;for(let a of this.document.getRoot().listNodes()){let s=a.getExtension(Ht);if(!s)continue;let n=e.nodeIndexMap.get(a),r=t.json.nodes[n];r.extensions=r.extensions||{},r.extensions[Ht]={visible:s.getVisible()}}return this}};function ay(e){return e.vkFormat>0&&e.vkFormat<=123}function hl(e){let t=e.vkFormat===1000066e3&&e.dataFormatDescriptor[0].colorModel===167;return e.vkFormat===0||t}var sy=class{match(e){return e[0]===171&&e[1]===75&&e[2]===84&&e[3]===88&&e[4]===32&&e[5]===50&&e[6]===48&&e[7]===187&&e[8]===13&&e[9]===10&&e[10]===26&&e[11]===10}getSize(e){let t=on(e);return[t.pixelWidth,t.pixelHeight]}getChannels(e){let t=on(e),a=t.dataFormatDescriptor[0];if(ay(t))return a.samples.length;if(hl(t))switch(a.colorModel){case 163:return a.samples.length===2&&(a.samples[1].channelType&15)===15?4:3;case 166:return(a.samples[0].channelType&15)===3?4:3;default:throw new Error(`Unexpected KTX2 colorModel, "${a.colorModel}".`)}throw new Error(`Unexpected KTX2 vkFormat, "${t.vkFormat}".`)}getVRAMByteLength(e){let t=on(e),a=0;if(hl(t)){let s=this.getChannels(e)>3;for(let n=0;n<t.levels.length;n++){let r=t.levels[n];if(r.uncompressedByteLength)a+=r.uncompressedByteLength;else{let i=Math.max(1,Math.floor(t.pixelWidth/Math.pow(2,n))),o=Math.max(1,Math.floor(t.pixelHeight/Math.pow(2,n))),c=s?16:8;a+=i/4*(o/4)*c}}}else for(let s of t.levels)t.supercompressionScheme===0?a+=s.levelData.byteLength:a+=s.uncompressedByteLength;return a}},ny=class extends ae{static EXTENSION_NAME=dn;extensionName=dn;prereadTypes=[C.TEXTURE];static register(){ct.registerFormat("image/ktx2",new sy)}preread(e){return e.jsonDoc.json.textures&&e.jsonDoc.json.textures.forEach(t=>{t.extensions&&t.extensions.KHR_texture_basisu&&(t.source=t.extensions[dn].source)}),this}read(e){return this}write(e){let t=e.jsonDoc;return this.document.getRoot().listTextures().forEach(a=>{if(a.getMimeType()==="image/ktx2"){let s=e.imageIndexMap.get(a);t.json.textures.forEach(n=>{n.source===s&&(n.extensions=n.extensions||{},n.extensions[dn]={source:n.source},delete n.source)})}}),this}},ry=class extends W{static EXTENSION_NAME=qt;init(){this.extensionName=qt,this.propertyType="Transform",this.parentTypes=[C.TEXTURE_INFO]}getDefaults(){return Object.assign(super.getDefaults(),{offset:[0,0],rotation:0,scale:[1,1],texCoord:null})}getOffset(){return this.get("offset")}setOffset(e){return this.set("offset",e)}getRotation(){return this.get("rotation")}setRotation(e){return this.set("rotation",e)}getScale(){return this.get("scale")}setScale(e){return this.set("scale",e)}getTexCoord(){return this.get("texCoord")}setTexCoord(e){return this.set("texCoord",e)}},iy=class extends ae{extensionName=qt;static EXTENSION_NAME=qt;createTransform(){return new ry(this.document.getGraph())}read(e){for(let[t,a]of Array.from(e.textureInfos.entries())){if(!a.extensions||!a.extensions.KHR_texture_transform)continue;let s=this.createTransform(),n=a.extensions[qt];n.offset!==void 0&&s.setOffset(n.offset),n.rotation!==void 0&&s.setRotation(n.rotation),n.scale!==void 0&&s.setScale(n.scale),n.texCoord!==void 0&&s.setTexCoord(n.texCoord),t.setExtension(qt,s)}return this}write(e){let t=Array.from(e.textureInfoDefMap.entries());for(let[a,s]of t){let n=a.getExtension(qt);if(!n)continue;s.extensions=s.extensions||{};let r={},i=le.eq;i(n.getOffset(),[0,0])||(r.offset=n.getOffset()),n.getRotation()!==0&&(r.rotation=n.getRotation()),i(n.getScale(),[1,1])||(r.scale=n.getScale()),n.getTexCoord()!=null&&(r.texCoord=n.getTexCoord()),s.extensions[qt]=r}return this}},oy=[C.ROOT,C.SCENE,C.NODE,C.MESH,C.MATERIAL,C.TEXTURE,C.ANIMATION],cy=class extends W{static EXTENSION_NAME=tt;init(){this.extensionName=tt,this.propertyType="Packet",this.parentTypes=oy}getDefaults(){return Object.assign(super.getDefaults(),{context:{},properties:{}})}getContext(){return this.get("context")}setContext(e){return this.set("context",{...e})}listProperties(){return Object.keys(this.get("properties"))}getProperty(e){let t=this.get("properties");return e in t?t[e]:null}setProperty(e,t){this._assertContext(e);let a={...this.get("properties")};return t?a[e]=t:delete a[e],this.set("properties",a)}toJSONLD(){return{"@context":ai(this.get("context")),...ai(this.get("properties"))}}fromJSONLD(e){e=ai(e);let t=e["@context"];return t&&this.set("context",t),delete e["@context"],this.set("properties",e)}_assertContext(e){if(!(e.split(":")[0]in this.get("context")))throw new Error(`${tt}: Missing context for term, "${e}".`)}};function ai(e){return JSON.parse(JSON.stringify(e))}var ly=class extends ae{extensionName=tt;static EXTENSION_NAME=tt;createPacket(){return new cy(this.document.getGraph())}listPackets(){return Array.from(this.properties)}read(e){let t=e.jsonDoc.json.extensions?.[tt];if(!t||!t.packets)return this;let a=e.jsonDoc.json,s=this.document.getRoot(),n=t.packets.map(o=>this.createPacket().fromJSONLD(o)),r=[[a.asset],a.scenes,a.nodes,a.meshes,a.materials,a.images,a.animations],i=[[s],s.listScenes(),s.listNodes(),s.listMeshes(),s.listMaterials(),s.listTextures(),s.listAnimations()];for(let o=0;o<r.length;o++){let c=r[o]||[];for(let l=0;l<c.length;l++){let f=c[l];if(f.extensions&&f.extensions.KHR_xmp_json_ld){let d=f.extensions[tt];i[o][l].setExtension(tt,n[d.packet])}}}return this}write(e){let{json:t}=e.jsonDoc,a=[];for(let s of this.properties){a.push(s.toJSONLD());for(let n of s.listParents()){let r;switch(n.propertyType){case C.ROOT:r=t.asset;break;case C.SCENE:r=t.scenes[e.sceneIndexMap.get(n)];break;case C.NODE:r=t.nodes[e.nodeIndexMap.get(n)];break;case C.MESH:r=t.meshes[e.meshIndexMap.get(n)];break;case C.MATERIAL:r=t.materials[e.materialIndexMap.get(n)];break;case C.TEXTURE:r=t.images[e.imageIndexMap.get(n)];break;case C.ANIMATION:r=t.animations[e.animationIndexMap.get(n)];break;default:r=null,this.document.getLogger().warn(`[${tt}]: Unsupported parent property, "${n.propertyType}"`);break}r&&(r.extensions=r.extensions||{},r.extensions[tt]={packet:a.length-1})}}return a.length>0&&(t.extensions=t.extensions||{},t.extensions[tt]={packets:a}),this}},dy=[Vg,Hg,tm,sm,cm,um,mm,xm,wm,km,Im,Rm,Gm,Om,Vm,qm,$m,Qm,Zm,ci,ty,ny,iy,ly],WM=[Kp,ii,oi,bg,Gg,Kg,...dy];var hE=(function(){var e="b9H79Tebbbe9ok9Geueu9Geub9Gbb9Gruuuuuuueu9Gvuuuuueu9Gduueu9Gluuuueu9Gvuuuuub9Gouuuuuub9Gluuuub9Giuuueui8AYdilveoveovrrwrrDDoDrbqqbelve9Weiiviebeoweuec;G:Qdkr:nlAo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bb8F9TW79O9V9Wt9FW9U9J9V9KW9wWVtW949c919M9MWV9mW4W2be8A9TW79O9V9Wt9FW9U9J9V9KW9wWVtW949c919M9MWVbd8F9TW79O9V9Wt9FW9U9J9V9KW9wWVtW949c919M9MWV9c9V919U9KbiE9TW79O9V9Wt9FW9U9J9V9KW9wWVtW949wWV79P9V9UblY9TW79O9V9Wt9FW9U9J9V9KW69U9KW949c919M9MWVbv8E9TW79O9V9Wt9FW9U9J9V9KW69U9KW949c919M9MWV9c9V919U9Kbo8A9TW79O9V9Wt9FW9U9J9V9KW69U9KW949wWV79P9V9UbrE9TW79O9V9Wt9FW9U9J9V9KW69U9KW949tWG91W9U9JWbwa9TW79O9V9Wt9FW9U9J9V9KW69U9KW949tWG91W9U9JW9c9V919U9KbDL9TW79O9V9Wt9FW9U9J9V9KWS9P2tWV9p9JtbqK9TW79O9V9Wt9FW9U9J9V9KWS9P2tWV9r919HtbkL9TW79O9V9Wt9FW9U9J9V9KWS9P2tWVT949WbxE9TW79O9V9Wt9F9V9Wt9P9T9P96W9wWVtW94J9H9J9OWbsa9TW79O9V9Wt9F9V9Wt9P9T9P96W9wWVtW94J9H9J9OW9ttV9P9Wbza9TW79O9V9Wt9F9V9Wt9P9T9P96W9wWVtW94SWt9J9O9sW9T9H9WbHK9TW79O9V9Wt9F79W9Ht9P9H29t9VVt9sW9T9H9WbOl79IV9RbCDwebcekdKLqN9OYdbk:Bhdhud9:8Jjjjjbc;qw9Rgr8KjjjjbcbhwdnaeTmbabcbyd;C:kjjbaoaocb9iEgDc:GeV86bbarc;adfcbcjdz:wjjjb8AdnaiTmbarc;adfadalz:vjjjb8Akarc;abfalfcbcbcjdal9RalcFe0Ez:wjjjb8Aarc;abfarc;adfalz:vjjjb8AarcUf9cb83ibarc8Wf9cb83ibarcyf9cb83ibarcaf9cb83ibarcKf9cb83ibarczf9cb83ibar9cb83iwar9cb83ibcj;abal9Uc;WFbGcjdalca0Ehqdnaicd6mbavcd9imbaDTmbadcefhkaqci2gxal2hmarc;alfclfhParc;qlfceVhsarc;qofclVhzarc;qofcKfhHarc;qofczfhOcbhAincdhCcbhodnavci6mbaH9cb83ibaO9cb83ibar9cb83i;yoar9cb83i;qoadaAfgoybbhXcbhQincbhwcbhLdninaoalfhKaoybbgYaX7aLVhLawcP0meaKhoaYhXawcefgwaQfai6mbkkcbhXarc;qofhwincwh8AcwhEdnaLaX93gocFeGg3cs0mbclhEa3ci0mba3cb9hcethEkdnaocw4cFeGg3cs0mbclh8Aa3ci0mba3cb9hceth8Aka8AaEfh3awydbh5cwh8AcwhEdnaocz4cFeGg8Ecs0mbclhEa8Eci0mba8Ecb9hcethEka3a5fh3dnaocFFFFb0mbclh8AaocFFF8F0mbaocFFFr0ceth8Akawa3aEfa8AfBdbawclfhwaXcefgXcw9hmbkaKhoaYhXaQczfgQai6mbkcbhocehwazhLinawaoaLydbarc;qofaocdtfydb6EhoaLclfhLawcefgwcw9hmbkcihCkcbh3arc;qlfcbcjdz:wjjjb8Aarc;alfcwfcbBdbar9cb83i;alaoclth8Fadhaaqhhakh5inarc;qlfadcba3cufgoaoa30Eal2falz:vjjjb8Aaiahaiah6Ehgdnaqaia39Ra3aqfai6EgYcsfc9WGgoaY9nmbarc;qofaYfcbaoaY9Rz:wjjjb8Akada3al2fh8Jcbh8Kina8Ka8FVcl4hQarc;alfa8Kcdtfh8LaAh8Mcbh8Nina8NaAfhwdndndndndndna8KPldebidkasa8Mc98GgLfhoa5aLfh8Aarc;qlfawc98GgLfRbbhXcwhwinaoRbbawtaXVhXaocefhoawcwfgwca9hmbkaYTmla8Ncith8Ea8JaLfhEcbhKinaERbbhLcwhoa8AhwinawRbbaotaLVhLawcefhwaocwfgoca9hmbkarc;qofaKfaLaX7aQ93a8E486bba8Aalfh8AaEalfhEaLhXaKcefgKaY9hmbxlkkaYTmia8Mc9:Ghoa8NcitcwGhEarc;qlfawceVfRbbcwtarc;qlfawc9:GfRbbVhLarc;qofhwaghXinawa5aofRbbcwtaaaofRbbVg8AaL9RgLcetaLcztcz91cs47cFFiGaE486bbaoalfhoawcefhwa8AhLa3aXcufgX9hmbxikkaYTmda8Jawfhoarc;qlfawfRbbhLarc;qofhwaghXinawaoRbbg8AaL9RgLcetaLcKtcK91cr4786bbawcefhwaoalfhoa8AhLa3aXcufgX9hmbxdkkaYTmeka8LydbhEcbhKarc;qofhoincdhLcbhwinaLaoawfRbbcb9hfhLawcefgwcz9hmbkclhXcbhwinaXaoawfRbbcd0fhXawcefgwcz9hmbkcwh8Acbhwina8AaoawfRbbcP0fh8Aawcefgwcz9hmbkaLaXaLaX6Egwa8Aawa8A6Egwczawcz6EaEfhEaoczfhoaKczfgKaY6mbka8LaEBdbka8Mcefh8Ma8Ncefg8Ncl9hmbka8Kcefg8KaC9hmbkaaamfhaahaxfhha5amfh5a3axfg3ai6mbkcbhocehwaPhLinawaoaLydbarc;alfaocdtfydb6EhoaLclfhLawcefgXhwaCaX9hmbkaraAcd4fa8FcdVaoaocdSE86bbaAclfgAal6mbkkabaefh8Kabcefhoalcd4gecbaDEhkadcefhOarc;abfceVhHcbhmdndninaiam9nmearc;qofcbcjdz:wjjjb8Aa8Kao9Rak6mdadamal2gwfhxcbh8JaOawfhzaocbakz:wjjjbghakfh5aqaiam9Ramaqfai6Egscsfgocl4cifcd4hCaoc9WGg8LThPindndndndndndndndndndnaDTmbara8Jcd4fRbbgLciGPlbedlbkasTmdaxa8Jfhoarc;abfa8JfRbbhLarc;qofhwashXinawaoRbbg8AaL9RgLcetaLcKtcK91cr4786bbawcefhwaoalfhoa8AhLaXcufgXmbxikkasTmia8JcitcwGhEarc;abfa8JceVfRbbcwtarc;abfa8Jc9:GgofRbbVhLaxaofhoarc;qofhwashXinawao8Vbbg8AaL9RgLcetaLcztcz91cs47cFFiGaE486bbawcefhwaoalfhoa8AhLaXcufgXmbxdkkaHa8Jc98GgEfhoazaEfh8Aarc;abfaEfRbbhXcwhwinaoRbbawtaXVhXaocefhoawcwfgwca9hmbkasTmbaLcl4hYa8JcitcKGh3axaEfhEcbhKinaERbbhLcwhoa8AhwinawRbbaotaLVhLawcefhwaocwfgoca9hmbkarc;qofaKfaLaX7aY93a3486bba8Aalfh8AaEalfhEaLhXaKcefgKas9hmbkkaDmbcbhoxlka8LTmbcbhodninarc;qofaofgwcwf8Pibaw8Pib:e9qTmeaoczfgoa8L9pmdxbkkdnavmbcehoxikcbhEaChKaChYinarc;qofaEfgocwf8Pibhyao8Pibh8PcdhLcbhwinaLaoawfRbbcb9hfhLawcefgwcz9hmbkclhXcbhwinaXaoawfRbbcd0fhXawcefgwcz9hmbkcwh8Acbhwina8AaoawfRbbcP0fh8Aawcefgwcz9hmbkaLaXaLaX6Egoa8Aaoa8A6Egoczaocz6EaYfhYaocucbaya8P:e9cb9sEgwaoaw6EaKfhKaEczfgEa8L9pmdxbkkaha8Jcd4fgoaoRbbcda8JcetcoGtV86bbxikdnaKas6mbaYas6mbaha8Jcd4fgoaoRbbcia8JcetcoGtV86bba8Ka59Ras6mra5arc;qofasz:vjjjbasfh5xikaKaY9phokaha8Jcd4fgwawRbbaoa8JcetcoGtV86bbka8Ka59RaC6mla5cbaCz:wjjjbgAaCfhYdndna8LmbaPhoxekdna8KaY9RcK9pmbaPhoxekaocdtc:q1jjbfcj1jjbaDEg5ydxggcetc;:FFFeGh8Fcuh3cuagtcu7cFeGhacbh8Marc;qofhLinarc;qofa8MfhQczhEdndndnagPDbeeeeeeedekcucbaQcwf8PibaQ8Pib:e9cb9sEhExekcbhoa8FhEinaEaaaLaofRbb9nfhEaocefgocz9hmbkkcih8Ecbh8Ainczhwdndndna5a8AcdtfydbgKPDbeeeeeeedekcucbaQcwf8PibaQ8Pib:e9cb9sEhwxekaKcetc;:FFFeGhwcuaKtcu7cFeGhXcbhoinawaXaLaofRbb9nfhwaocefgocz9hmbkkdndnawaE6mbaKa39hmeawaE9hmea5a8EcdtfydbcwSmeka8Ah8EawhEka8Acefg8Aci9hmbkaAa8Mco4fgoaoRbba8Ea8Mci4coGtV86bbdndndna5a8Ecdtfydbg3PDdbbbbbbbebkdncwa39Tg8ETmbcua3tcu7hwdndna3ceSmbcbh8NaLhQinaQhoa8Eh8AcbhXinaoRbbgEawcFeGgKaEaK6EaXa3tVhXaocefhoa8Acufg8AmbkaYaX86bbaQa8EfhQaYcefhYa8Na8Efg8Ncz6mbxdkkcbh8NaLhQinaQhoa8Eh8AcbhXinaoRbbgEawcFeGgKaEaK6EaXcetVhXaocefhoa8Acufg8AmbkaYaX:T9cFe:d9c:c:qj:bw9:9c:q;c1:I1e:d9c:b:c:e1z9:9ca188bbaQa8EfhQaYcefhYa8Na8Efg8Ncz6mbkkcbhoinaYaLaofRbbgX86bbaYaXawcFeG9pfhYaocefgocz9hmbxikkdna3ceSmbinaYcb86bbaYcefhYxbkkinaYcb86bbaYcefhYxbkkaYaQ8Pbb83bbaYcwfaQcwf8Pbb83bbaYczfhYka8Mczfg8Ma8L9pgomeaLczfhLa8KaY9RcK9pmbkkaoTmlaYh5aYTmlka8Jcefg8Jal9hmbkarc;abfaxascufal2falz:vjjjb8Aasamfhma5hoa5mbkcbhwxdkdna8Kao9RakalfgwcKcaaDEgLawaL0EgX9pmbcbhwxdkdnawaL9pmbaocbaXaw9Rgwz:wjjjbawfhokaoarc;adfalz:vjjjbalfhodnaDTmbaoaraez:vjjjbaefhokaoab9Rhwxekcbhwkarc;qwf8Kjjjjbawk5babaeadaialcdcbyd;C:kjjbz:bjjjbk9reduaecd4gdaefgicaaica0Eabcj;abae9Uc;WFbGcjdaeca0Egifcufai9Uae2aiadfaicl4cifcd4f2fcefkmbcbabBd;C:kjjbk:Ese5u8Jjjjjbc;ae9Rgl8Kjjjjbcbhvdnaici9UgocHfae0mbabcbyd;m:kjjbgrc;GeV86bbalc;abfcFecjez:wjjjb8AalcUfgw9cu83ibalc8WfgD9cu83ibalcyfgq9cu83ibalcafgk9cu83ibalcKfgx9cu83ibalczfgm9cu83ibal9cu83iwal9cu83ibabaefc9WfhPabcefgsaofhednaiTmbcmcsarcb9kgzEhHcbhOcbhAcbhCcbhXcbhQindnaeaP9nmbcbhvxikaQcufhvadaCcdtfgLydbhKaLcwfydbhYaLclfydbh8AcbhEdndndninalc;abfavcsGcitfgoydlh3dndndnaoydbgoaK9hmba3a8ASmekdnaoa8A9hmba3aY9hmbaEcefhExekaoaY9hmea3aK9hmeaEcdfhEkaEc870mdaXcufhvaLaEciGcx2goc;i1jjbfydbcdtfydbh3aLaoc;e1jjbfydbcdtfydbh8AaLaoc;a1jjbfydbcdtfydbhKcbhodnindnalavcsGcdtfydba39hmbaohYxdkcuhYavcufhvaocefgocz9hmbkkaOa3aOSgvaYce9iaYaH9oVgoGfhOdndndncbcsavEaYaoEgvcs9hmbarce9imba3a3aAa3cefaASgvEgAcefSmecmcsavEhvkasavaEcdtc;WeGV86bbavcs9hmea3aA9Rgvcetavc8F917hvinaeavcFb0crtavcFbGV86bbaecefheavcje6hoavcr4hvaoTmbka3hAxvkcPhvasaEcdtcPV86bba3hAkavTmiavaH9omicdhocehEaQhYxlkavcufhvaEclfgEc;ab9hmbkkdnaLceaYaOSceta8AaOSEcx2gvc;a1jjbfydbcdtfydbgKTaLavc;e1jjbfydbcdtfydbg8AceSGaLavc;i1jjbfydbcdtfydbg3cdSGaOcb9hGazGg5ce9hmbaw9cu83ibaD9cu83ibaq9cu83ibak9cu83ibax9cu83ibam9cu83ibal9cu83iwal9cu83ibcbhOkcbhEaXcufgvhodnindnalaocsGcdtfydba8A9hmbaEhYxdkcuhYaocufhoaEcefgEcz9hmbkkcbhodnindnalavcsGcdtfydba39hmbaohExdkcuhEavcufhvaocefgocz9hmbkkaOaKaOSg8EfhLdndnaYcm0mbaYcefhYxekcbcsa8AaLSgvEhYaLavfhLkdndnaEcm0mbaEcefhExekcbcsa3aLSgvEhEaLavfhLkc9:cua8EEh8FcbhvaEaYcltVgacFeGhodndndninavc:W1jjbfRbbaoSmeavcefgvcz9hmbxdkka5aKaO9havcm0VVmbasavc;WeV86bbxekasa8F86bbaeaa86bbaecefhekdna8EmbaKaA9Rgvcetavc8F917hvinaeavcFb0gocrtavcFbGV86bbavcr4hvaecefheaombkaKhAkdnaYcs9hmba8AaA9Rgvcetavc8F917hvinaeavcFb0gocrtavcFbGV86bbavcr4hvaecefheaombka8AhAkdnaEcs9hmba3aA9Rgvcetavc8F917hvinaeavcFb0gocrtavcFbGV86bbavcr4hvaecefheaombka3hAkalaXcdtfaKBdbaXcefcsGhvdndnaYPzbeeeeeeeeeeeeeebekalavcdtfa8ABdbaXcdfcsGhvkdndnaEPzbeeeeeeeeeeeeeebekalavcdtfa3BdbavcefcsGhvkcihoalc;abfaQcitfgEaKBdlaEa8ABdbaQcefcsGhYcdhEavhXaLhOxekcdhoalaXcdtfa3BdbcehEaXcefcsGhXaQhYkalc;abfaYcitfgva8ABdlava3Bdbalc;abfaQaEfcsGcitfgva3BdlavaKBdbascefhsaQaofcsGhQaCcifgCai6mbkkdnaeaP9nmbcbhvxekcbhvinaeavfavc:W1jjbfRbb86bbavcefgvcz9hmbkaeab9Ravfhvkalc;aef8KjjjjbavkZeeucbhddninadcefgdc8F0meceadtae6mbkkadcrfcFeGcr9Uci2cdfabci9U2cHfkmbcbabBd;m:kjjbk:Adewu8Jjjjjbcz9Rhlcbhvdnaicvfae0mbcbhvabcbRb;m:kjjbc;qeV86bbal9cb83iwabcefhoabaefc98fhrdnaiTmbcbhwcbhDindnaoar6mbcbskadaDcdtfydbgqalcwfawaqav9Rgvavc8F91gv7av9Rc507gwcdtfgkydb9Rgvc8E91c9:Gavcdt7awVhvinaoavcFb0gecrtavcFbGV86bbavcr4hvaocefhoaembkakaqBdbaqhvaDcefgDai9hmbkkdnaoar9nmbcbskaocbBbbaoab9RclfhvkavkBeeucbhddninadcefgdc8F0meceadtae6mbkkadcwfcFeGcr9Uab2cvfk:bvli99dui99ludnaeTmbcuadcetcuftcu7:Zhvdndncuaicuftcu7:ZgoJbbbZMgr:lJbbb9p9DTmbar:Ohwxekcjjjj94hwkcbhicbhDinalclfIdbgrJbbbbJbbjZalIdbgq:lar:lMalcwfIdbgk:lMgr:varJbbbb9BEgrNhxaqarNhrdndnakJbbbb9GTmbaxhqxekJbbjZar:l:tgqaq:maxJbbbb9GEhqJbbjZax:l:tgxax:marJbbbb9GEhrkdndnalcxfIdbgxJbbj:;axJbbj:;9GEgkJbbjZakJbbjZ9FEavNJbbbZJbbb:;axJbbbb9GEMgx:lJbbb9p9DTmbax:Ohmxekcjjjj94hmkdndnaqJbbj:;aqJbbj:;9GEgxJbbjZaxJbbjZ9FEaoNJbbbZJbbb:;aqJbbbb9GEMgq:lJbbb9p9DTmbaq:OhPxekcjjjj94hPkdndnarJbbj:;arJbbj:;9GEgqJbbjZaqJbbjZ9FEaoNJbbbZJbbb:;arJbbbb9GEMgr:lJbbb9p9DTmbar:Ohsxekcjjjj94hskdndnadcl9hmbabaifgzas86bbazcifam86bbazcdfaw86bbazcefaP86bbxekabaDfgzas87ebazcofam87ebazclfaw87ebazcdfaP87ebkalczfhlaiclfhiaDcwfhDaecufgembkkk;hlld99eud99eudnaeTmbdndncuaicuftcu7:ZgvJbbbZMgo:lJbbb9p9DTmbao:Ohixekcjjjj94hikaic;8FiGhrinabcofcicdalclfIdb:lalIdb:l9EgialcwfIdb:lalaicdtfIdb:l9EEgialcxfIdb:lalaicdtfIdb:l9EEgiarV87ebdndnJbbj:;JbbjZalaicdtfIdbJbbbb9DEgoalaicd7cdtfIdbJ;Zl:1ZNNgwJbbj:;awJbbj:;9GEgDJbbjZaDJbbjZ9FEavNJbbbZJbbb:;awJbbbb9GEMgw:lJbbb9p9DTmbaw:Ohqxekcjjjj94hqkabcdfaq87ebdndnalaicefciGcdtfIdbJ;Zl:1ZNaoNgwJbbj:;awJbbj:;9GEgDJbbjZaDJbbjZ9FEavNJbbbZJbbb:;awJbbbb9GEMgw:lJbbb9p9DTmbaw:Ohqxekcjjjj94hqkabaq87ebdndnaoalaicufciGcdtfIdbJ;Zl:1ZNNgoJbbj:;aoJbbj:;9GEgwJbbjZawJbbjZ9FEavNJbbbZJbbb:;aoJbbbb9GEMgo:lJbbb9p9DTmbao:Ohixekcjjjj94hikabclfai87ebabcwfhbalczfhlaecufgembkkk;3viDue99eu8Jjjjjbcjd9Rgo8Kjjjjbadcd4hrdndndndnavcd9hmbadcl6meaohwarhDinawc:CuBdbawclfhwaDcufgDmbkaeTmiadcl6mdarcdthqalhkcbhxinaohwakhDarhminawawydbgPcbaDIdbgs:8cL4cFeGc:cufasJbbbb9BEgzaPaz9kEBdbaDclfhDawclfhwamcufgmmbkakaqfhkaxcefgxaeSmixbkkaeTmdxekaeTmekarcdthkavce9hhqadcl6hdcbhxindndndnaqmbadmdc:CuhDalhwarhminaDcbawIdbgs:8cL4cFeGc:cufasJbbbb9BEgPaDaP9kEhDawclfhwamcufgmmbxdkkc:CuhDdndnavPleddbdkadmdaohwalhmarhPinawcbamIdbgs:8cL4cFeGgzc;:bazc;:b0Ec:cufasJbbbb9BEBdbamclfhmawclfhwaPcufgPmbxdkkadmecbhwarhminaoawfcbalawfIdbgs:8cL4cFeGgPc8AaPc8A0Ec:cufasJbbbb9BEBdbawclfhwamcufgmmbkkadmbcbhwarhPinaDhmdnavceSmbaoawfydbhmkdndnalawfIdbgscjjj;8iamai9RcefgmcLt9R::NJbbbZJbbb:;asJbbbb9GEMgs:lJbbb9p9DTmbas:Ohzxekcjjjj94hzkabawfazcFFFrGamcKtVBdbawclfhwaPcufgPmbkkabakfhbalakfhlaxcefgxae9hmbkkaocjdf8Kjjjjbk;YqdXui998Jjjjjbc:qd9Rgv8Kjjjjbavc:Sefcbc;Kbz:wjjjb8AcbhodnadTmbcbhoaiTmbdndnabaeSmbaehrxekavcuadcdtgwadcFFFFi0Ecbyd;u:kjjbHjjjjbbgrBd:SeavceBd:mdaraeawz:vjjjb8Akavc:GefcwfcbBdbav9cb83i:Geavc:Gefaradaiavc:Sefz:ojjjbavyd:GehDadci9Ugqcbyd;u:kjjbHjjjjbbheavc:Sefavyd:mdgkcdtfaeBdbavakcefgwBd:mdaecbaqz:wjjjbhxavc:SefawcdtfcuaicdtaicFFFFi0Ecbyd;u:kjjbHjjjjbbgmBdbavakcdfgPBd:mdalc;ebfhsaDheamhwinawalIdbasaeydbgzcwazcw6EcdtfIdbMUdbaeclfheawclfhwaicufgimbkavc:SefaPcdtfcuaqcdtadcFFFF970Ecbyd;u:kjjbHjjjjbbgPBdbdnadci6mbarheaPhwaqhiinawamaeydbcdtfIdbamaeclfydbcdtfIdbMamaecwfydbcdtfIdbMUdbaecxfheawclfhwaicufgimbkkakcifhoalc;ebfhHavc;qbfhOavheavyd:KehAavyd:OehCcbhzcbhwcbhXcehQinaehLcihkarawci2gKcdtfgeydbhsaeclfydbhdabaXcx2fgicwfaecwfydbgYBdbaiclfadBdbaiasBdbaxawfce86bbaOaYBdwaOadBdlaOasBdbaPawcdtfcbBdbdnazTmbcihkaLhiinaOakcdtfaiydbgeBdbakaeaY9haeas9haead9hGGfhkaiclfhiazcufgzmbkkaXcefhXcbhzinaCaAarazaKfcdtfydbcdtgifydbcdtfgYheaDaifgdydbgshidnasTmbdninaeydbawSmeaeclfheaicufgiTmdxbkkaeaYascdtfc98fydbBdbadadydbcufBdbkazcefgzci9hmbkdndnakTmbcuhwJbbbbh8Acbhdavyd:KehYavyd:OehKindndnaDaOadcdtfydbcdtgzfydbgembadcefhdxekadcs0hiamazfgsIdbhEasalcbadcefgdaiEcdtfIdbaHaecwaecw6EcdtfIdbMg3Udba3aE:th3aecdthiaKaYazfydbcdtfheinaPaeydbgzcdtfgsa3asIdbMgEUdbaEa8Aa8AaE9DgsEh8AazawasEhwaeclfheaic98fgimbkkadak9hmbkawcu9hmekaQaq9pmdindnaxaQfRbbmbaQhwxdkaqaQcefgQ9hmbxikkakczakcz6EhzaOheaLhOawcu9hmbkkaocdtavc:Seffc98fhedninaoTmeaeydbcbyd;q:kjjbH:bjjjbbaec98fheaocufhoxbkkavc:qdf8Kjjjjbk;IlevucuaicdtgvaicFFFFi0Egocbyd;u:kjjbHjjjjbbhralalyd9GgwcdtfarBdbalawcefBd9GabarBdbaocbyd;u:kjjbHjjjjbbhralalyd9GgocdtfarBdbalaocefBd9GabarBdlcuadcdtadcFFFFi0Ecbyd;u:kjjbHjjjjbbhralalyd9GgocdtfarBdbalaocefBd9GabarBdwabydbcbavz:wjjjb8Aadci9UhDdnadTmbabydbhoaehladhrinaoalydbcdtfgvavydbcefBdbalclfhlarcufgrmbkkdnaiTmbabydbhlabydlhrcbhvaihoinaravBdbarclfhralydbavfhvalclfhlaocufgombkkdnadci6mbabydlhrabydwhvcbhlinaecwfydbhoaeclfydbhdaraeydbcdtfgwawydbgwcefBdbavawcdtfalBdbaradcdtfgdadydbgdcefBdbavadcdtfalBdbaraocdtfgoaoydbgocefBdbavaocdtfalBdbaecxfheaDalcefgl9hmbkkdnaiTmbabydlheabydbhlinaeaeydbalydb9RBdbalclfhlaeclfheaicufgimbkkkQbabaeadaic;K1jjbz:njjjbkQbabaeadaic;m:jjjbz:njjjbk9DeeuabcFeaicdtz:wjjjbhlcbhbdnadTmbindnalaeydbcdtfgiydbcu9hmbaiabBdbabcefhbkaeclfheadcufgdmbkkabk:Vvioud9:du8Jjjjjbc;Wa9Rgl8Kjjjjbcbhvalcxfcbc;Kbz:wjjjb8AalcuadcitgoadcFFFFe0Ecbyd;u:kjjbHjjjjbbgrBdxalceBd2araeadaicez:tjjjbalcuaoadcjjjjoGEcbyd;u:kjjbHjjjjbbgwBdzadcdthednadTmbabhiinaiavBdbaiclfhiadavcefgv9hmbkkawaefhDalabBdwalawBdl9cbhqindnadTmbaq9cq9:hkarhvaDhiadheinaiav8Pibak1:NcFrG87ebavcwfhvaicdfhiaecufgembkkalclfaq:NceGcdtfydbhxalclfaq9ce98gq:NceGcdtfydbhmalc;Wbfcbcjaz:wjjjb8AaDhvadhidnadTmbinalc;Wbfav8VebcdtfgeaeydbcefBdbavcdfhvaicufgimbkkcbhvcbhiinalc;WbfavfgeydbhoaeaiBdbaoaifhiavclfgvcja9hmbkadhvdndnadTmbinalc;WbfaDamydbgicetf8VebcdtfgeaeydbgecefBdbaxaecdtfaiBdbamclfhmavcufgvmbkaq9cv9smdcbhvinabawydbcdtfavBdbawclfhwadavcefgv9hmbxdkkaq9cv9smekkclhvdninavc98Smealcxfavfydbcbyd;q:kjjbH:bjjjbbavc98fhvxbkkalc;Waf8Kjjjjbk:Jwliuo99iud9:cbhv8Jjjjjbca9Rgoczfcwfcbyd:8:kjjbBdbaocb8Pd:0:kjjb83izaocwfcbyd;i:kjjbBdbaocb8Pd;a:kjjb83ibaicd4hrdndnadmbJFFuFhwJFFuuhDJFFuuhqJFFuFhkJFFuuhxJFFuFhmxekarcdthPaehsincbhiinaoczfaifgzasaifIdbgwazIdbgDaDaw9EEUdbaoaifgzawazIdbgDaDaw9DEUdbaiclfgicx9hmbkasaPfhsavcefgvad9hmbkaoIdKhDaoIdwhwaoIdChqaoIdlhkaoIdzhxaoIdbhmkdnadTmbJbbbbJbFu9hJbbbbamax:tgmamJbbbb9DEgmakaq:tgkakam9DEgkawaD:tgwawak9DEgw:vawJbbbb9BEhwdnalmbarcdthoindndnaeclfIdbaq:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikai:S9cC:ghHdndnaeIdbax:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikaHai:S:ehHdndnaecwfIdbaD:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikabaHai:T9cy:g:e83ibaeaofheabcwfhbadcufgdmbxdkkarcdthoindndnaeIdbax:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikai:SgH9ca:gaH9cz:g9cjjj;4s:d:eaH9cFe:d:e9cF:bj;4:pj;ar:d9c:bd9:9c:p;G:d;4j:E;ar:d9cH9:9c;d;H:W:y:m:g;d;Hb:d9cv9:9c;j:KM;j:KM;j:Kd:dhOdndnaeclfIdbaq:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikai:SgH9ca:gaH9cz:g9cjjj;4s:d:eaH9cFe:d:e9cF:bj;4:pj;ar:d9c:bd9:9c:p;G:d;4j:E;ar:d9cH9:9c;d;H:W:y:m:g;d;Hb:d9cq9:9cM;j:KM;j:KM;jl:daO:ehOdndnaecwfIdbaD:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikabaOai:SgH9ca:gaH9cz:g9cjjj;4s:d:eaH9cFe:d:e9cF:bj;4:pj;ar:d9c:bd9:9c:p;G:d;4j:E;ar:d9cH9:9c;d;H:W:y:m:g;d;Hb:d9cC9:9c:KM;j:KM;j:KMD:d:e83ibaeaofheabcwfhbadcufgdmbkkk9teiucbcbyd;y:kjjbgeabcifc98GfgbBd;y:kjjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik;teeeudndnaeabVciGTmbabhixekdndnadcz9pmbabhixekabhiinaiaeydbBdbaiaeydlBdlaiaeydwBdwaiaeydxBdxaeczfheaiczfhiadc9Wfgdcs0mbkkadcl6mbinaiaeydbBdbaeclfheaiclfhiadc98fgdci0mbkkdnadTmbinaiaeRbb86bbaicefhiaecefheadcufgdmbkkabk:3eedudndnabciGTmbabhixekaecFeGc:b:c:ew2hldndnadcz9pmbabhixekabhiinaialBdxaialBdwaialBdlaialBdbaiczfhiadc9Wfgdcs0mbkkadcl6mbinaialBdbaiclfhiadc98fgdci0mbkkdnadTmbinaiae86bbaicefhiadcufgdmbkkabk9teiucbcbyd;y:kjjbgeabcrfc94GfgbBd;y:kjjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik9:eiuZbhedndncbyd;y:kjjbgdaecztgi9nmbcuheadai9RcFFifcz4nbcuSmekadhekcbabae9Rcifc98Gcbyd;y:kjjbfgdBd;y:kjjbdnadZbcztge9nmbadae9RcFFifcz4nb8Akkk;Qddbcjwk;mdbbbbdbbblbbbwbbbbbbbebbbdbbblbbbwbbbbbbbbbbbbbbbb4:h9w9N94:P:gW:j9O:ye9Pbbbbbbebbbdbbbebbbdbbbbbbbdbbbbbbbebbbbbbb:l29hZ;69:9kZ;N;76Z;rg97Z;z;o9xZ8J;B85Z;:;u9yZ;b;k9HZ:2;Z9DZ9e:l9mZ59A8KZ:r;T3Z:A:zYZ79OHZ;j4::8::Y:D9V8:bbbb9s:49:Z8R:hBZ9M9M;M8:L;z;o8:;8:PG89q;x:J878R:hQ8::M:B;e87bbbbbbjZbbjZbbjZ:E;V;N8::Y:DsZ9i;H;68:xd;R8:;h0838:;W:NoZbbbb:WV9O8:uf888:9i;H;68:9c9G;L89;n;m9m89;D8Ko8:bbbbf:8tZ9m836ZS:2AZL;zPZZ818EZ9e:lxZ;U98F8:819E;68:FFuuFFuuFFuuFFuFFFuFFFuFbc;mqkzebbbebbbdbbb9G:vbb",t=new Uint8Array([32,0,65,2,1,106,34,33,3,128,11,4,13,64,6,253,10,7,15,116,127,5,8,12,40,16,19,54,20,9,27,255,113,17,42,67,24,23,146,148,18,14,22,45,70,69,56,114,101,21,25,63,75,136,108,28,118,29,73,115]);if(typeof WebAssembly!="object")return{supported:!1};var a,s=WebAssembly.instantiate(n(e),{}).then(function(g){a=g.instance,a.exports.__wasm_call_ctors(),a.exports.meshopt_encodeVertexVersion(0),a.exports.meshopt_encodeIndexVersion(1)});function n(g){for(var p=new Uint8Array(g.length),u=0;u<g.length;++u){var y=g.charCodeAt(u);p[u]=y>96?y-97:y>64?y-39:y+4}for(var b=0,u=0;u<g.length;++u)p[b++]=p[u]<60?t[p[u]]:(p[u]-60)*64+p[++u];return p.buffer.slice(0,b)}function r(g){if(!g)throw new Error("Assertion failed")}function i(g){return new Uint8Array(g.buffer,g.byteOffset,g.byteLength)}function o(g,p,u,y){var b=a.exports.sbrk,m=b(p.length*4),x=b(u*4),M=new Uint8Array(a.exports.memory.buffer),E=i(p);M.set(E,m),y&&y(m,m,p.length,u);var T=g(x,m,p.length,u);M=new Uint8Array(a.exports.memory.buffer);var I=new Uint32Array(u);new Uint8Array(I.buffer).set(M.subarray(x,x+u*4)),E.set(M.subarray(m,m+p.length*4)),b(m-b(0));for(var A=0;A<p.length;++A)p[A]=I[p[A]];return[I,T]}function c(g,p,u,y){var b=a.exports.sbrk,m=b(u*4),x=b(u*y),M=new Uint8Array(a.exports.memory.buffer);M.set(i(p),x),g(m,x,u,y),M=new Uint8Array(a.exports.memory.buffer);var E=new Uint32Array(u);return new Uint8Array(E.buffer).set(M.subarray(m,m+u*4)),b(m-b(0)),E}function l(g,p,u,y,b){var m=a.exports.sbrk,x=m(p),M=m(y*b),E=new Uint8Array(a.exports.memory.buffer);E.set(i(u),M);var T=g(x,p,M,y,b),I=new Uint8Array(T);return I.set(E.subarray(x,x+T)),m(x-m(0)),I}function f(g){for(var p=0,u=0;u<g.length;++u){var y=g[u];p=p<y?y:p}return p}function d(g,p){if(r(p==2||p==4),p==4)return new Uint32Array(g.buffer,g.byteOffset,g.byteLength/4);var u=new Uint16Array(g.buffer,g.byteOffset,g.byteLength/2);return new Uint32Array(u)}function h(g,p,u,y,b,m,x){var M=a.exports.sbrk,E=M(u*y),T=M(u*m),I=new Uint8Array(a.exports.memory.buffer);I.set(i(p),T),g(E,u,y,b,T,x);var A=new Uint8Array(u*y);return A.set(I.subarray(E,E+u*y)),M(E-M(0)),A}return{ready:s,supported:!0,reorderMesh:function(g,p,u){var y=p?u?a.exports.meshopt_optimizeVertexCacheStrip:a.exports.meshopt_optimizeVertexCache:void 0;return o(a.exports.meshopt_optimizeVertexFetchRemap,g,f(g)+1,y)},reorderPoints:function(g,p){return r(g instanceof Float32Array),r(g.length%p==0),r(p>=3),c(a.exports.meshopt_spatialSortRemap,g,g.length/p,p*4)},encodeVertexBuffer:function(g,p,u){r(u>0&&u<=256),r(u%4==0);var y=a.exports.meshopt_encodeVertexBufferBound(p,u);return l(a.exports.meshopt_encodeVertexBuffer,y,g,p,u)},encodeIndexBuffer:function(g,p,u){r(u==2||u==4),r(p%3==0);var y=d(g,u),b=a.exports.meshopt_encodeIndexBufferBound(p,f(y)+1);return l(a.exports.meshopt_encodeIndexBuffer,b,y,p,4)},encodeIndexSequence:function(g,p,u){r(u==2||u==4);var y=d(g,u),b=a.exports.meshopt_encodeIndexSequenceBound(p,f(y)+1);return l(a.exports.meshopt_encodeIndexSequence,b,y,p,4)},encodeGltfBuffer:function(g,p,u,y){var b={ATTRIBUTES:this.encodeVertexBuffer,TRIANGLES:this.encodeIndexBuffer,INDICES:this.encodeIndexSequence};return r(b[y]),b[y](g,p,u)},encodeFilterOct:function(g,p,u,y){return r(u==4||u==8),r(y>=1&&y<=16),h(a.exports.meshopt_encodeFilterOct,g,p,u,y,16)},encodeFilterQuat:function(g,p,u,y){return r(u==8),r(y>=4&&y<=16),h(a.exports.meshopt_encodeFilterQuat,g,p,u,y,16)},encodeFilterExp:function(g,p,u,y,b){r(u>0&&u%4==0),r(y>=1&&y<=24);var m={Separate:0,SharedVector:1,SharedComponent:2,Clamped:3};return h(a.exports.meshopt_encodeFilterExp,g,p,u,y,u,b?m[b]:1)}}})();var un=(function(){var e="b9H79Tebbbe8Fv9Gbb9Gvuuuuueu9Giuuub9Geueu9Giuuueuikqbeeedddillviebeoweuec:W:Odkr;leDo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bb8A9TW79O9V9Wt9F9KW9J9V9KW9wWVtW949c919M9MWVbeY9TW79O9V9Wt9F9KW9J9V9KW69U9KW949c919M9MWVbdE9TW79O9V9Wt9F9KW9J9V9KW69U9KW949tWG91W9U9JWbiL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9p9JtblK9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9r919HtbvL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWVT949Wbol79IV9Rbrq:S86qdbk;jYi5ud9:du8Jjjjjbcj;kb9Rgv8Kjjjjbc9:hodnalTmbcuhoaiRbbgrc;WeGc:Ge9hmbarcsGgwce0mbc9:hoalcufadcd4cbawEgDadfgrcKcaawEgqaraq0Egk6mbaicefhxcj;abad9Uc;WFbGcjdadca0EhmaialfgPar9Rgoadfhsavaoadz1jjjbgzceVhHcbhOdndninaeaO9nmeaPax9RaD6mdamaeaO9RaOamfgoae6EgAcsfglc9WGhCabaOad2fhXaAcethQaxaDfhiaOaeaoaeao6E9RhLalcl4cifcd4hKazcj;cbfaAfhYcbh8AazcjdfhEaHh3incbhodnawTmbaxa8Acd4fRbbhokaocFeGh5cbh8Eazcj;cbfhqinaih8Fdndndndna5a8Ecet4ciGgoc9:fPdebdkaPa8F9RaA6mrazcj;cbfa8EaA2fa8FaAz1jjjb8Aa8FaAfhixdkazcj;cbfa8EaA2fcbaAz:jjjjb8Aa8FhixekaPa8F9RaK6mva8FaKfhidnaCTmbaPai9RcK6mbaocdtc:q1jjbfcj1jjbawEhaczhrcbhlinargoc9Wfghaqfhrdndndndndndnaaa8Fahco4fRbbalcoG4ciGcdtfydbPDbedvivvvlvkar9cb83bbarcwf9cb83bbxlkarcbaiRbdai8Xbb9c:c:qj:bw9:9c:q;c1:I1e:d9c:b:c:e1z9:gg9cjjjjjz:dg8J9qE86bbaqaofgrcGfag9c8F1:NghcKtc8F91aicdfa8J9c8N1:Nfg8KRbbG86bbarcVfcba8KahcjeGcr4fghRbbag9cjjjjjl:dg8J9qE86bbarc7fcbaha8J9c8L1:NfghRbbag9cjjjjjd:dg8J9qE86bbarctfcbaha8J9c8K1:NfghRbbag9cjjjjje:dg8J9qE86bbarc91fcbaha8J9c8J1:NfghRbbag9cjjjj;ab:dg8J9qE86bbarc4fcbaha8J9cg1:NfghRbbag9cjjjja:dg8J9qE86bbarc93fcbaha8J9ch1:NfghRbbag9cjjjjz:dgg9qE86bbarc94fcbahag9ca1:NfghRbbai8Xbe9c:c:qj:bw9:9c:q;c1:I1e:d9c:b:c:e1z9:gg9cjjjjjz:dg8J9qE86bbarc95fag9c8F1:NgicKtc8F91aha8J9c8N1:NfghRbbG86bbarc96fcbahaicjeGcr4fgiRbbag9cjjjjjl:dg8J9qE86bbarc97fcbaia8J9c8L1:NfgiRbbag9cjjjjjd:dg8J9qE86bbarc98fcbaia8J9c8K1:NfgiRbbag9cjjjjje:dg8J9qE86bbarc99fcbaia8J9c8J1:NfgiRbbag9cjjjj;ab:dg8J9qE86bbarc9:fcbaia8J9cg1:NfgiRbbag9cjjjja:dg8J9qE86bbarcufcbaia8J9ch1:NfgiRbbag9cjjjjz:dgg9qE86bbaiag9ca1:NfhixikaraiRblaiRbbghco4g8Ka8KciSg8KE86bbaqaofgrcGfaiclfa8Kfg8KRbbahcl4ciGg8La8LciSg8LE86bbarcVfa8Ka8Lfg8KRbbahcd4ciGg8La8LciSg8LE86bbarc7fa8Ka8Lfg8KRbbahciGghahciSghE86bbarctfa8Kahfg8KRbbaiRbeghco4g8La8LciSg8LE86bbarc91fa8Ka8Lfg8KRbbahcl4ciGg8La8LciSg8LE86bbarc4fa8Ka8Lfg8KRbbahcd4ciGg8La8LciSg8LE86bbarc93fa8Ka8Lfg8KRbbahciGghahciSghE86bbarc94fa8Kahfg8KRbbaiRbdghco4g8La8LciSg8LE86bbarc95fa8Ka8Lfg8KRbbahcl4ciGg8La8LciSg8LE86bbarc96fa8Ka8Lfg8KRbbahcd4ciGg8La8LciSg8LE86bbarc97fa8Ka8Lfg8KRbbahciGghahciSghE86bbarc98fa8KahfghRbbaiRbigico4g8Ka8KciSg8KE86bbarc99faha8KfghRbbaicl4ciGg8Ka8KciSg8KE86bbarc9:faha8KfghRbbaicd4ciGg8Ka8KciSg8KE86bbarcufaha8KfgrRbbaiciGgiaiciSgiE86bbaraifhixdkaraiRbwaiRbbghcl4g8Ka8KcsSg8KE86bbaqaofgrcGfaicwfa8Kfg8KRbbahcsGghahcsSghE86bbarcVfa8KahfghRbbaiRbeg8Kcl4g8La8LcsSg8LE86bbarc7faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarctfaha8KfghRbbaiRbdg8Kcl4g8La8LcsSg8LE86bbarc91faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc4faha8KfghRbbaiRbig8Kcl4g8La8LcsSg8LE86bbarc93faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc94faha8KfghRbbaiRblg8Kcl4g8La8LcsSg8LE86bbarc95faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc96faha8KfghRbbaiRbvg8Kcl4g8La8LcsSg8LE86bbarc97faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc98faha8KfghRbbaiRbog8Kcl4g8La8LcsSg8LE86bbarc99faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc9:faha8KfghRbbaiRbrgicl4g8Ka8KcsSg8KE86bbarcufaha8KfgrRbbaicsGgiaicsSgiE86bbaraifhixekarai8Pbb83bbarcwfaicwf8Pbb83bbaiczfhikdnaoaC9pmbalcdfhlaoczfhraPai9RcL0mekkaoaC6moaimexokaCmva8FTmvkaqaAfhqa8Ecefg8Ecl9hmbkdndndndnawTmbasa8Acd4fRbbgociGPlbedrbkaATmdaza8Afh8Fazcj;cbfhhcbh8EaEhaina8FRbbhraahocbhlinaoahalfRbbgqce4cbaqceG9R7arfgr86bbaoadfhoaAalcefgl9hmbkaacefhaa8Fcefh8FahaAfhha8Ecefg8Ecl9hmbxikkaATmeaza8Afhaazcj;cbfhhcbhoceh8EaYh8FinaEaofhlaa8Vbbhrcbhoinala8FaofRbbcwtahaofRbbgqVc;:FiGce4cbaqceG9R7arfgr87bbaladfhlaLaocefgofmbka8FaQfh8FcdhoaacdfhaahaQfhha8EceGhlcbh8EalmbxdkkaATmbcbaocl49Rh8Eaza8AfRbbhqcwhoa3hlinalRbbaotaqVhqalcefhlaocwfgoca9hmbkcbhhaEh8FaYhainazcj;cbfahfRbbhrcwhoaahlinalRbbaotarVhralaAfhlaocwfgoca9hmbkara8E93aq7hqcbhoa8Fhlinalaqao486bbalcefhlaocwfgoca9hmbka8Fadfh8FaacefhaahcefghaA9hmbkkaEclfhEa3clfh3a8Aclfg8Aad6mbkaXazcjdfaAad2z1jjjb8AazazcjdfaAcufad2fadz1jjjb8AaAaOfhOaihxaimbkc9:hoxdkcbc99aPax9RakSEhoxekc9:hokavcj;kbf8Kjjjjbaok:XseHu8Jjjjjbc;ae9Rgv8Kjjjjbc9:hodnaeci9UgrcHfal0mbcuhoaiRbbgwc;WeGc;Ge9hmbawcsGgDce0mbavc;abfcFecjez:jjjjb8AavcUf9cu83ibavc8Wf9cu83ibavcyf9cu83ibavcaf9cu83ibavcKf9cu83ibavczf9cu83ibav9cu83iwav9cu83ibaialfc9WfhqaicefgwarfhldnaeTmbcmcsaDceSEhkcbhxcbhmcbhrcbhicbhoindnalaq9nmbc9:hoxikdndnawRbbgDc;Ve0mbavc;abfaoaDcu7gPcl4fcsGcitfgsydlhzasydbhHdndnaDcsGgsak9pmbavaiaPfcsGcdtfydbaxasEhDaxasTgOfhxxekdndnascsSmbcehOasc987asamffcefhDxekalcefhDal8SbbgscFeGhPdndnascu9mmbaDhlxekalcvfhlaPcFbGhPcrhsdninaD8SbbgOcFbGastaPVhPaOcu9kmeaDcefhDascrfgsc8J9hmbxdkkaDcefhlkcehOaPce4cbaPceG9R7amfhDkaDhmkavc;abfaocitfgsaDBdbasazBdlavaicdtfaDBdbavc;abfaocefcsGcitfgsaHBdbasaDBdlaocdfhoaOaifhidnadcd9hmbabarcetfgsaH87ebasclfaD87ebascdfaz87ebxdkabarcdtfgsaHBdbascwfaDBdbasclfazBdbxekdnaDcpe0mbaxcefgOavaiaqaDcsGfRbbgscl49RcsGcdtfydbascz6gPEhDavaias9RcsGcdtfydbaOaPfgzascsGgOEhsaOThOdndnadcd9hmbabarcetfgHax87ebaHclfas87ebaHcdfaD87ebxekabarcdtfgHaxBdbaHcwfasBdbaHclfaDBdbkavaicdtfaxBdbavc;abfaocitfgHaDBdbaHaxBdlavaicefgicsGcdtfaDBdbavc;abfaocefcsGcitfgHasBdbaHaDBdlavaiaPfgicsGcdtfasBdbavc;abfaocdfcsGcitfgDaxBdbaDasBdlaocifhoaiaOfhiazaOfhxxekaxcbalRbbgHEgAaDc;:eSgDfhzaHcsGhCaHcl4hXdndnaHcs0mbazcefhOxekazhOavaiaX9RcsGcdtfydbhzkdndnaCmbaOcefhxxekaOhxavaiaH9RcsGcdtfydbhOkdndnaDTmbalcefhDxekalcdfhDal8SbegPcFeGhsdnaPcu9kmbalcofhAascFbGhscrhldninaD8SbbgPcFbGaltasVhsaPcu9kmeaDcefhDalcrfglc8J9hmbkaAhDxekaDcefhDkasce4cbasceG9R7amfgmhAkdndnaXcsSmbaDhsxekaDcefhsaD8SbbglcFeGhPdnalcu9kmbaDcvfhzaPcFbGhPcrhldninas8SbbgDcFbGaltaPVhPaDcu9kmeascefhsalcrfglc8J9hmbkazhsxekascefhskaPce4cbaPceG9R7amfgmhzkdndnaCcsSmbashlxekascefhlas8SbbgDcFeGhPdnaDcu9kmbascvfhOaPcFbGhPcrhDdninal8SbbgscFbGaDtaPVhPascu9kmealcefhlaDcrfgDc8J9hmbkaOhlxekalcefhlkaPce4cbaPceG9R7amfgmhOkdndnadcd9hmbabarcetfgDaA87ebaDclfaO87ebaDcdfaz87ebxekabarcdtfgDaABdbaDcwfaOBdbaDclfazBdbkavc;abfaocitfgDazBdbaDaABdlavaicdtfaABdbavc;abfaocefcsGcitfgDaOBdbaDazBdlavaicefgicsGcdtfazBdbavc;abfaocdfcsGcitfgDaABdbaDaOBdlavaiaHcz6aXcsSVfgicsGcdtfaOBdbaiaCTaCcsSVfhiaocifhokawcefhwaocsGhoaicsGhiarcifgrae6mbkkcbc99alaqSEhokavc;aef8Kjjjjbaok:clevu8Jjjjjbcz9Rhvdnaecvfal9nmbc9:skdnaiRbbc;:eGc;qeSmbcuskav9cb83iwaicefhoaialfc98fhrdnaeTmbdnadcdSmbcbhwindnaoar6mbc9:skaocefhlao8SbbgicFeGhddndnaicu9mmbalhoxekaocvfhoadcFbGhdcrhidninal8SbbgDcFbGaitadVhdaDcu9kmealcefhlaicrfgic8J9hmbxdkkalcefhokabawcdtfadc8Etc8F91adcd47avcwfadceGcdtVglydbfgiBdbalaiBdbawcefgwae9hmbxdkkcbhwindnaoar6mbc9:skaocefhlao8SbbgicFeGhddndnaicu9mmbalhoxekaocvfhoadcFbGhdcrhidninal8SbbgDcFbGaitadVhdaDcu9kmealcefhlaicrfgic8J9hmbxdkkalcefhokabawcetfadc8Etc8F91adcd47avcwfadceGcdtVglydbfgi87ebalaiBdbawcefgwae9hmbkkcbc99aoarSEk:Lvoeue99dud99eud99dndnadcl9hmbaeTmeindndnabcdfgd8Sbb:Yab8Sbbgi:Ygl:l:tabcefgv8Sbbgo:Ygr:l:tgwJbb;:9cawawNJbbbbawawJbbbb9GgDEgq:mgkaqaicb9iEalMgwawNakaqaocb9iEarMgqaqNMM:r:vglNJbbbZJbbb:;aDEMgr:lJbbb9p9DTmbar:Ohixekcjjjj94hikadai86bbdndnaqalNJbbbZJbbb:;aqJbbbb9GEMgq:lJbbb9p9DTmbaq:Ohdxekcjjjj94hdkavad86bbdndnawalNJbbbZJbbb:;awJbbbb9GEMgw:lJbbb9p9DTmbaw:Ohdxekcjjjj94hdkabad86bbabclfhbaecufgembxdkkaeTmbindndnabclfgd8Ueb:Yab8Uebgi:Ygl:l:tabcdfgv8Uebgo:Ygr:l:tgwJb;:FSawawNJbbbbawawJbbbb9GgDEgq:mgkaqaicb9iEalMgwawNakaqaocb9iEarMgqaqNMM:r:vglNJbbbZJbbb:;aDEMgr:lJbbb9p9DTmbar:Ohixekcjjjj94hikadai87ebdndnaqalNJbbbZJbbb:;aqJbbbb9GEMgq:lJbbb9p9DTmbaq:Ohdxekcjjjj94hdkavad87ebdndnawalNJbbbZJbbb:;awJbbbb9GEMgw:lJbbb9p9DTmbaw:Ohdxekcjjjj94hdkabad87ebabcwfhbaecufgembkkk;oiliui99iue99dnaeTmbcbhiabhlindndnJ;Zl81Zalcof8UebgvciV:Y:vgoal8Ueb:YNgrJb;:FSNJbbbZJbbb:;arJbbbb9GEMgw:lJbbb9p9DTmbaw:OhDxekcjjjj94hDkalclf8Uebhqalcdf8UebhkabaiavcefciGfcetfaD87ebdndnaoak:YNgwJb;:FSNJbbbZJbbb:;awJbbbb9GEMgx:lJbbb9p9DTmbax:OhDxekcjjjj94hDkabaiavciGfgkcd7cetfaD87ebdndnaoaq:YNgoJb;:FSNJbbbZJbbb:;aoJbbbb9GEMgx:lJbbb9p9DTmbax:OhDxekcjjjj94hDkabaiavcufciGfcetfaD87ebdndnJbbjZararN:tawawN:taoaoN:tgrJbbbbarJbbbb9GE:rJb;:FSNJbbbZMgr:lJbbb9p9DTmbar:Ohvxekcjjjj94hvkabakcetfav87ebalcwfhlaiclfhiaecufgembkkk9mbdnadcd4ae2gdTmbinababydbgecwtcw91:Yaece91cjjj98Gcjjj;8if::NUdbabclfhbadcufgdmbkkk9teiucbcbyd:K1jjbgeabcifc98GfgbBd:K1jjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik;teeeudndnaeabVciGTmbabhixekdndnadcz9pmbabhixekabhiinaiaeydbBdbaiaeydlBdlaiaeydwBdwaiaeydxBdxaeczfheaiczfhiadc9Wfgdcs0mbkkadcl6mbinaiaeydbBdbaeclfheaiclfhiadc98fgdci0mbkkdnadTmbinaiaeRbb86bbaicefhiaecefheadcufgdmbkkabk:3eedudndnabciGTmbabhixekaecFeGc:b:c:ew2hldndnadcz9pmbabhixekabhiinaialBdxaialBdwaialBdlaialBdbaiczfhiadc9Wfgdcs0mbkkadcl6mbinaialBdbaiclfhiadc98fgdci0mbkkdnadTmbinaiae86bbaicefhiadcufgdmbkkabkk81dbcjwk8Kbbbbdbbblbbbwbbbbbbbebbbdbbblbbbwbbbbc:Kwkl8WNbb",t="b9H79TebbbeKl9Gbb9Gvuuuuueu9Giuuub9Geueuikqbbebeedddilve9Weeeviebeoweuec:q:6dkr;leDo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bb8A9TW79O9V9Wt9F9KW9J9V9KW9wWVtW949c919M9MWVbdY9TW79O9V9Wt9F9KW9J9V9KW69U9KW949c919M9MWVblE9TW79O9V9Wt9F9KW9J9V9KW69U9KW949tWG91W9U9JWbvL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9p9JtboK9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9r919HtbrL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWVT949Wbwl79IV9RbDq;G9Mqlbzik9:evu8Jjjjjbcz9Rhbcbheincbhdcbhiinabcwfadfaicjuaead4ceGglE86bbaialfhiadcefgdcw9hmbkaec:q:yjjbfai86bbaecitc:q1jjbfab8Piw83ibaecefgecjd9hmbkk:183lYud97dur978Jjjjjbcj;kb9Rgv8Kjjjjbc9:hodnalTmbcuhoaiRbbgrc;WeGc:Ge9hmbarcsGgwce0mbc9:hoalcufadcd4cbawEgDadfgrcKcaawEgqaraq0Egk6mbaicefhxavaialfgmar9Rgoad;8qbbcj;abad9Uc;WFbGcjdadca0EhPdndndnadTmbaoadfhscbhzinaeaz9nmdamax9RaD6miabazad2fhHaxaDfhOaPaeaz9RazaPfae6EgAcsfgocl4cifcd4hCavcj;cbfaoc9WGgXcetfhQavcj;cbfaXci2fhLavcj;cbfaXfhKcbhYaoc;ab6h8AincbhodnawTmbaxaYcd4fRbbhokaocFeGhEcbh3avcj;cbfh5indndndndnaEa3cet4ciGgoc9:fPdebdkamaO9RaX6mwavcj;cbfa3aX2faOaX;8qbbaOaAfhOxdkavcj;cbfa3aX2fcbaX;8kbxekamaO9RaC6moaoclVcbawEhraOaCfhocbhidna8Ambamao9Rc;Gb6mbcbhlina5alfhidndndndndndnaOalco4fRbbgqciGarfPDbedibledibkaipxbbbbbbbbbbbbbbbbpklbxlkaiaopbblaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLg8Ecdp:mea8EpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9og8Fpxiiiiiiiiiiiiiiiip8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaoclffahc:q:yjjbfRbbfhoxikaiaopbbwaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9og8Fpxssssssssssssssssp8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaocwffahc:q:yjjbfRbbfhoxdkaiaopbbbpklbaoczfhoxekaiaopbbdaoRbbgacitc:q1jjbfpbibaac:q:yjjbfRbbgapsaoRbeghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPpklbaaaocdffahc:q:yjjbfRbbfhokdndndndndndnaqcd4ciGarfPDbedibledibkaiczfpxbbbbbbbbbbbbbbbbpklbxlkaiczfaopbblaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLg8Ecdp:mea8EpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9og8Fpxiiiiiiiiiiiiiiiip8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaoclffahc:q:yjjbfRbbfhoxikaiczfaopbbwaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9og8Fpxssssssssssssssssp8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaocwffahc:q:yjjbfRbbfhoxdkaiczfaopbbbpklbaoczfhoxekaiczfaopbbdaoRbbgacitc:q1jjbfpbibaac:q:yjjbfRbbgapsaoRbeghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPpklbaaaocdffahc:q:yjjbfRbbfhokdndndndndndnaqcl4ciGarfPDbedibledibkaicafpxbbbbbbbbbbbbbbbbpklbxlkaicafaopbblaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLg8Ecdp:mea8EpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9og8Fpxiiiiiiiiiiiiiiiip8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaoclffahc:q:yjjbfRbbfhoxikaicafaopbbwaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9og8Fpxssssssssssssssssp8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaocwffahc:q:yjjbfRbbfhoxdkaicafaopbbbpklbaoczfhoxekaicafaopbbdaoRbbgacitc:q1jjbfpbibaac:q:yjjbfRbbgapsaoRbeghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPpklbaaaocdffahc:q:yjjbfRbbfhokdndndndndndnaqco4arfPDbedibledibkaic8Wfpxbbbbbbbbbbbbbbbbpklbxlkaic8Wfaopbblaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLg8Ecdp:mea8EpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9og8Fpxiiiiiiiiiiiiiiiip8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngicitc:q1jjbfpbibaic:q:yjjbfRbbgipsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Ngqcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaiaoclffaqc:q:yjjbfRbbfhoxikaic8Wfaopbbwaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9og8Fpxssssssssssssssssp8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngicitc:q1jjbfpbibaic:q:yjjbfRbbgipsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Ngqcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaiaocwffaqc:q:yjjbfRbbfhoxdkaic8Wfaopbbbpklbaoczfhoxekaic8WfaopbbdaoRbbgicitc:q1jjbfpbibaic:q:yjjbfRbbgipsaoRbegqcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPpklbaiaocdffaqc:q:yjjbfRbbfhokalc;abfhialcjefaX0meaihlamao9Rc;Fb0mbkkdnaiaX9pmbaici4hlinamao9RcK6mwa5aifhqdndndndndndnaOaico4fRbbalcoG4ciGarfPDbedibledibkaqpxbbbbbbbbbbbbbbbbpkbbxlkaqaopbblaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLg8Ecdp:mea8EpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9og8Fpxiiiiiiiiiiiiiiiip8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spkbbaaaoclffahc:q:yjjbfRbbfhoxikaqaopbbwaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9og8Fpxssssssssssssssssp8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spkbbaaaocwffahc:q:yjjbfRbbfhoxdkaqaopbbbpkbbaoczfhoxekaqaopbbdaoRbbgacitc:q1jjbfpbibaac:q:yjjbfRbbgapsaoRbeghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPpkbbaaaocdffahc:q:yjjbfRbbfhokalcdfhlaiczfgiaX6mbkkaohOaoTmoka5aXfh5a3cefg3cl9hmbkdndndndnawTmbasaYcd4fRbbglciGPlbedwbkaXTmdavcjdfaYfhlavaYfpbdbhgcbhoinalavcj;cbfaofpblbg8JaKaofpblbg8KpmbzeHdOiAlCvXoQrLg8LaQaofpblbg8MaLaofpblbg8NpmbzeHdOiAlCvXoQrLgypmbezHdiOAlvCXorQLg8Ecep9Ta8Epxeeeeeeeeeeeeeeeeg8Fp9op9Hp9rg8Eagp9Uggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp9Uggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp9Uggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp9Uggp9Abbbaladfglaga8LaypmwDKYqk8AExm35Ps8E8Fg8Ecep9Ta8Ea8Fp9op9Hp9rg8Ep9Uggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp9Uggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp9Uggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp9Uggp9Abbbaladfglaga8Ja8KpmwKDYq8AkEx3m5P8Es8Fg8Ja8Ma8NpmwKDYq8AkEx3m5P8Es8Fg8KpmbezHdiOAlvCXorQLg8Ecep9Ta8Ea8Fp9op9Hp9rg8Ep9Uggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp9Uggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp9Uggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp9Uggp9Abbbaladfglaga8Ja8KpmwDKYqk8AExm35Ps8E8Fg8Ecep9Ta8Ea8Fp9op9Hp9rg8Ep9Ug8Fp9Abbbaladfgla8Fa8Ea8Epmlvorlvorlvorlvorp9Ug8Fp9Abbbaladfgla8Fa8Ea8EpmwDqkwDqkwDqkwDqkp9Ug8Fp9Abbbaladfgla8Fa8Ea8EpmxmPsxmPsxmPsxmPsp9Uggp9AbbbaladfhlaoczfgoaX6mbxikkaXTmeavcjdfaYfhlavaYfpbdbhgcbhoinalavcj;cbfaofpblbg8JaKaofpblbg8KpmbzeHdOiAlCvXoQrLg8LaQaofpblbg8MaLaofpblbg8NpmbzeHdOiAlCvXoQrLgypmbezHdiOAlvCXorQLg8Ecep:nea8Epxebebebebebebebebg8Fp9op:bep9rg8Eagp:oeggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp:oeggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp:oeggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp:oeggp9Abbbaladfglaga8LaypmwDKYqk8AExm35Ps8E8Fg8Ecep:nea8Ea8Fp9op:bep9rg8Ep:oeggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp:oeggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp:oeggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp:oeggp9Abbbaladfglaga8Ja8KpmwKDYq8AkEx3m5P8Es8Fg8Ja8Ma8NpmwKDYq8AkEx3m5P8Es8Fg8KpmbezHdiOAlvCXorQLg8Ecep:nea8Ea8Fp9op:bep9rg8Ep:oeggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp:oeggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp:oeggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp:oeggp9Abbbaladfglaga8Ja8KpmwDKYqk8AExm35Ps8E8Fg8Ecep:nea8Ea8Fp9op:bep9rg8Ep:oeg8Fp9Abbbaladfgla8Fa8Ea8Epmlvorlvorlvorlvorp:oeg8Fp9Abbbaladfgla8Fa8Ea8EpmwDqkwDqkwDqkwDqkp:oeg8Fp9Abbbaladfgla8Fa8Ea8EpmxmPsxmPsxmPsxmPsp:oeggp9AbbbaladfhlaoczfgoaX6mbxdkkaXTmbcbhocbalcl4gl9Rc8FGhiavcjdfaYfhravaYfpbdbh8Finaravcj;cbfaofpblbggaKaofpblbg8JpmbzeHdOiAlCvXoQrLg8KaQaofpblbg8LaLaofpblbg8MpmbzeHdOiAlCvXoQrLg8NpmbezHdiOAlvCXorQLg8Eaip:Rea8Ealp:Sep9qg8Ea8Fp9rg8Fp9Abbbaradfgra8Fa8Ea8Epmlvorlvorlvorlvorp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmwDqkwDqkwDqkwDqkp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmxmPsxmPsxmPsxmPsp9rg8Fp9Abbbaradfgra8Fa8Ka8NpmwDKYqk8AExm35Ps8E8Fg8Eaip:Rea8Ealp:Sep9qg8Ep9rg8Fp9Abbbaradfgra8Fa8Ea8Epmlvorlvorlvorlvorp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmwDqkwDqkwDqkwDqkp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmxmPsxmPsxmPsxmPsp9rg8Fp9Abbbaradfgra8Faga8JpmwKDYq8AkEx3m5P8Es8Fgga8La8MpmwKDYq8AkEx3m5P8Es8Fg8JpmbezHdiOAlvCXorQLg8Eaip:Rea8Ealp:Sep9qg8Ep9rg8Fp9Abbbaradfgra8Fa8Ea8Epmlvorlvorlvorlvorp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmwDqkwDqkwDqkwDqkp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmxmPsxmPsxmPsxmPsp9rg8Fp9Abbbaradfgra8Faga8JpmwDKYqk8AExm35Ps8E8Fg8Eaip:Rea8Ealp:Sep9qg8Ep9rg8Fp9Abbbaradfgra8Fa8Ea8Epmlvorlvorlvorlvorp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmwDqkwDqkwDqkwDqkp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmxmPsxmPsxmPsxmPsp9rg8Fp9AbbbaradfhraoczfgoaX6mbkkaYclfgYad6mbkaHavcjdfaAad2;8qbbavavcjdfaAcufad2fad;8qbbaAazfhzc9:hoaOhxaOmbxlkkaeTmbaDalfhrcbhocuhlinaralaD9RglfaD6mdaPaeao9RaoaPfae6Eaofgoae6mbkaial9Rhxkcbc99amax9RakSEhoxekc9:hokavcj;kbf8Kjjjjbaokwbz:bjjjbk:TseHu8Jjjjjbc;ae9Rgv8Kjjjjbc9:hodnaeci9UgrcHfal0mbcuhoaiRbbgwc;WeGc;Ge9hmbawcsGgDce0mbavc;abfcFecje;8kbavcUf9cu83ibavc8Wf9cu83ibavcyf9cu83ibavcaf9cu83ibavcKf9cu83ibavczf9cu83ibav9cu83iwav9cu83ibaialfc9WfhqaicefgwarfhldnaeTmbcmcsaDceSEhkcbhxcbhmcbhrcbhicbhoindnalaq9nmbc9:hoxikdndnawRbbgDc;Ve0mbavc;abfaoaDcu7gPcl4fcsGcitfgsydlhzasydbhHdndnaDcsGgsak9pmbavaiaPfcsGcdtfydbaxasEhDaxasTgOfhxxekdndnascsSmbcehOasc987asamffcefhDxekalcefhDal8SbbgscFeGhPdndnascu9mmbaDhlxekalcvfhlaPcFbGhPcrhsdninaD8SbbgOcFbGastaPVhPaOcu9kmeaDcefhDascrfgsc8J9hmbxdkkaDcefhlkcehOaPce4cbaPceG9R7amfhDkaDhmkavc;abfaocitfgsaDBdbasazBdlavaicdtfaDBdbavc;abfaocefcsGcitfgsaHBdbasaDBdlaocdfhoaOaifhidnadcd9hmbabarcetfgsaH87ebasclfaD87ebascdfaz87ebxdkabarcdtfgsaHBdbascwfaDBdbasclfazBdbxekdnaDcpe0mbaxcefgOavaiaqaDcsGfRbbgscl49RcsGcdtfydbascz6gPEhDavaias9RcsGcdtfydbaOaPfgzascsGgOEhsaOThOdndnadcd9hmbabarcetfgHax87ebaHclfas87ebaHcdfaD87ebxekabarcdtfgHaxBdbaHcwfasBdbaHclfaDBdbkavaicdtfaxBdbavc;abfaocitfgHaDBdbaHaxBdlavaicefgicsGcdtfaDBdbavc;abfaocefcsGcitfgHasBdbaHaDBdlavaiaPfgicsGcdtfasBdbavc;abfaocdfcsGcitfgDaxBdbaDasBdlaocifhoaiaOfhiazaOfhxxekaxcbalRbbgHEgAaDc;:eSgDfhzaHcsGhCaHcl4hXdndnaHcs0mbazcefhOxekazhOavaiaX9RcsGcdtfydbhzkdndnaCmbaOcefhxxekaOhxavaiaH9RcsGcdtfydbhOkdndnaDTmbalcefhDxekalcdfhDal8SbegPcFeGhsdnaPcu9kmbalcofhAascFbGhscrhldninaD8SbbgPcFbGaltasVhsaPcu9kmeaDcefhDalcrfglc8J9hmbkaAhDxekaDcefhDkasce4cbasceG9R7amfgmhAkdndnaXcsSmbaDhsxekaDcefhsaD8SbbglcFeGhPdnalcu9kmbaDcvfhzaPcFbGhPcrhldninas8SbbgDcFbGaltaPVhPaDcu9kmeascefhsalcrfglc8J9hmbkazhsxekascefhskaPce4cbaPceG9R7amfgmhzkdndnaCcsSmbashlxekascefhlas8SbbgDcFeGhPdnaDcu9kmbascvfhOaPcFbGhPcrhDdninal8SbbgscFbGaDtaPVhPascu9kmealcefhlaDcrfgDc8J9hmbkaOhlxekalcefhlkaPce4cbaPceG9R7amfgmhOkdndnadcd9hmbabarcetfgDaA87ebaDclfaO87ebaDcdfaz87ebxekabarcdtfgDaABdbaDcwfaOBdbaDclfazBdbkavc;abfaocitfgDazBdbaDaABdlavaicdtfaABdbavc;abfaocefcsGcitfgDaOBdbaDazBdlavaicefgicsGcdtfazBdbavc;abfaocdfcsGcitfgDaABdbaDaOBdlavaiaHcz6aXcsSVfgicsGcdtfaOBdbaiaCTaCcsSVfhiaocifhokawcefhwaocsGhoaicsGhiarcifgrae6mbkkcbc99alaqSEhokavc;aef8Kjjjjbaok:clevu8Jjjjjbcz9Rhvdnaecvfal9nmbc9:skdnaiRbbc;:eGc;qeSmbcuskav9cb83iwaicefhoaialfc98fhrdnaeTmbdnadcdSmbcbhwindnaoar6mbc9:skaocefhlao8SbbgicFeGhddndnaicu9mmbalhoxekaocvfhoadcFbGhdcrhidninal8SbbgDcFbGaitadVhdaDcu9kmealcefhlaicrfgic8J9hmbxdkkalcefhokabawcdtfadc8Etc8F91adcd47avcwfadceGcdtVglydbfgiBdbalaiBdbawcefgwae9hmbxdkkcbhwindnaoar6mbc9:skaocefhlao8SbbgicFeGhddndnaicu9mmbalhoxekaocvfhoadcFbGhdcrhidninal8SbbgDcFbGaitadVhdaDcu9kmealcefhlaicrfgic8J9hmbxdkkalcefhokabawcetfadc8Etc8F91adcd47avcwfadceGcdtVglydbfgi87ebalaiBdbawcefgwae9hmbkkcbc99aoarSEk:SPliuo97eue978Jjjjjbca9Rhiaec98Ghldndnadcl9hmbdnalTmbcbhvabhdinadadpbbbgocKp:RecKp:Sep;6egraocwp:RecKp:Sep;6earp;Geaoczp:RecKp:Sep;6egwp;Gep;Kep;LegDpxbbbbbbbbbbbbbbbbp:2egqarpxbbbjbbbjbbbjbbbjgkp9op9rp;Kegrpxbb;:9cbb;:9cbb;:9cbb;:9cararp;MeaDaDp;Meawaqawakp9op9rp;Kegrarp;Mep;Kep;Kep;Jep;Negwp;Mepxbbn0bbn0bbn0bbn0gqp;KepxFbbbFbbbFbbbFbbbp9oaopxbbbFbbbFbbbFbbbFp9op9qarawp;Meaqp;Kecwp:RepxbFbbbFbbbFbbbFbbp9op9qaDawp;Meaqp;Keczp:RepxbbFbbbFbbbFbbbFbp9op9qpkbbadczfhdavclfgval6mbkkalaeSmeaipxbbbbbbbbbbbbbbbbgqpklbaiabalcdtfgdaeciGglcdtgv;8qbbdnalTmbaiaipblbgocKp:RecKp:Sep;6egraocwp:RecKp:Sep;6earp;Geaoczp:RecKp:Sep;6egwp;Gep;Kep;LegDaqp:2egqarpxbbbjbbbjbbbjbbbjgkp9op9rp;Kegrpxbb;:9cbb;:9cbb;:9cbb;:9cararp;MeaDaDp;Meawaqawakp9op9rp;Kegrarp;Mep;Kep;Kep;Jep;Negwp;Mepxbbn0bbn0bbn0bbn0gqp;KepxFbbbFbbbFbbbFbbbp9oaopxbbbFbbbFbbbFbbbFp9op9qarawp;Meaqp;Kecwp:RepxbFbbbFbbbFbbbFbbp9op9qaDawp;Meaqp;Keczp:RepxbbFbbbFbbbFbbbFbp9op9qpklbkadaiav;8qbbskdnalTmbcbhvabhdinadczfgxaxpbbbgopxbbbbbbFFbbbbbbFFgkp9oadpbbbgDaopmbediwDqkzHOAKY8AEgwczp:Reczp:Sep;6egraDaopmlvorxmPsCXQL358E8FpxFubbFubbFubbFubbp9op;7eawczp:Sep;6egwp;Gearp;Gep;Kep;Legopxbbbbbbbbbbbbbbbbp:2egqarpxbbbjbbbjbbbjbbbjgmp9op9rp;Kegrpxb;:FSb;:FSb;:FSb;:FSararp;Meaoaop;Meawaqawamp9op9rp;Kegrarp;Mep;Kep;Kep;Jep;Negwp;Mepxbbn0bbn0bbn0bbn0gqp;KepxFFbbFFbbFFbbFFbbp9oaoawp;Meaqp;Keczp:Rep9qgoarawp;Meaqp;KepxFFbbFFbbFFbbFFbbp9ogrpmwDKYqk8AExm35Ps8E8Fp9qpkbbadaDakp9oaoarpmbezHdiOAlvCXorQLp9qpkbbadcafhdavclfgval6mbkkalaeSmbaiczfpxbbbbbbbbbbbbbbbbgopklbaiaopklbaiabalcitfgdaeciGglcitgv;8qbbdnalTmbaiaipblzgopxbbbbbbFFbbbbbbFFgkp9oaipblbgDaopmbediwDqkzHOAKY8AEgwczp:Reczp:Sep;6egraDaopmlvorxmPsCXQL358E8FpxFubbFubbFubbFubbp9op;7eawczp:Sep;6egwp;Gearp;Gep;Kep;Legopxbbbbbbbbbbbbbbbbp:2egqarpxbbbjbbbjbbbjbbbjgmp9op9rp;Kegrpxb;:FSb;:FSb;:FSb;:FSararp;Meaoaop;Meawaqawamp9op9rp;Kegrarp;Mep;Kep;Kep;Jep;Negwp;Mepxbbn0bbn0bbn0bbn0gqp;KepxFFbbFFbbFFbbFFbbp9oaoawp;Meaqp;Keczp:Rep9qgoarawp;Meaqp;KepxFFbbFFbbFFbbFFbbp9ogrpmwDKYqk8AExm35Ps8E8Fp9qpklzaiaDakp9oaoarpmbezHdiOAlvCXorQLp9qpklbkadaiav;8qbbkk:oDllue97euv978Jjjjjbc8W9Rhidnaec98GglTmbcbhvabhoinaiaopbbbgraoczfgwpbbbgDpmlvorxmPsCXQL358E8Fgqczp:Segkclp:RepklbaopxbbjZbbjZbbjZbbjZpx;Zl81Z;Zl81Z;Zl81Z;Zl81Zakpxibbbibbbibbbibbbp9qp;6ep;NegkaraDpmbediwDqkzHOAKY8AEgrczp:Reczp:Sep;6ep;MegDaDp;Meakarczp:Sep;6ep;Megxaxp;Meakaqczp:Reczp:Sep;6ep;Megqaqp;Mep;Kep;Kep;Lepxbbbbbbbbbbbbbbbbp:4ep;Jepxb;:FSb;:FSb;:FSb;:FSgkp;Mepxbbn0bbn0bbn0bbn0grp;KepxFFbbFFbbFFbbFFbbgmp9oaxakp;Mearp;Keczp:Rep9qgxaDakp;Mearp;Keamp9oaqakp;Mearp;Keczp:Rep9qgkpmbezHdiOAlvCXorQLgrp5baipblbpEb:T:j83ibaocwfarp5eaipblbpEe:T:j83ibawaxakpmwDKYqk8AExm35Ps8E8Fgkp5baipblbpEd:T:j83ibaocKfakp5eaipblbpEi:T:j83ibaocafhoavclfgval6mbkkdnalaeSmbaiczfpxbbbbbbbbbbbbbbbbgkpklbaiakpklbaiabalcitfgoaeciGgvcitgw;8qbbdnavTmbaiaipblbgraipblzgDpmlvorxmPsCXQL358E8Fgqczp:Segkclp:RepklaaipxbbjZbbjZbbjZbbjZpx;Zl81Z;Zl81Z;Zl81Z;Zl81Zakpxibbbibbbibbbibbbp9qp;6ep;NegkaraDpmbediwDqkzHOAKY8AEgrczp:Reczp:Sep;6ep;MegDaDp;Meakarczp:Sep;6ep;Megxaxp;Meakaqczp:Reczp:Sep;6ep;Megqaqp;Mep;Kep;Kep;Lepxbbbbbbbbbbbbbbbbp:4ep;Jepxb;:FSb;:FSb;:FSb;:FSgkp;Mepxbbn0bbn0bbn0bbn0grp;KepxFFbbFFbbFFbbFFbbgmp9oaxakp;Mearp;Keczp:Rep9qgxaDakp;Mearp;Keamp9oaqakp;Mearp;Keczp:Rep9qgkpmbezHdiOAlvCXorQLgrp5baipblapEb:T:j83ibaiarp5eaipblapEe:T:j83iwaiaxakpmwDKYqk8AExm35Ps8E8Fgkp5baipblapEd:T:j83izaiakp5eaipblapEi:T:j83iKkaoaiaw;8qbbkk;uddiue978Jjjjjbc;ab9Rhidnadcd4ae2glc98GgvTmbcbheabhdinadadpbbbgocwp:Recwp:Sep;6eaocep:SepxbbjFbbjFbbjFbbjFp9opxbbjZbbjZbbjZbbjZp:Uep;Mepkbbadczfhdaeclfgeav6mbkkdnavalSmbaic8WfpxbbbbbbbbbbbbbbbbgopklbaicafaopklbaiczfaopklbaiaopklbaiabavcdtfgdalciGgecdtgv;8qbbdnaeTmbaiaipblbgocwp:Recwp:Sep;6eaocep:SepxbbjFbbjFbbjFbbjFp9opxbbjZbbjZbbjZbbjZp:Uep;Mepklbkadaiav;8qbbkk9teiucbcbydj1jjbgeabcifc98GfgbBdj1jjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaikkkebcjwklz:Dbb",a=new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,3,2,0,0,5,3,1,0,1,12,1,0,10,22,2,12,0,65,0,65,0,65,0,252,10,0,0,11,7,0,65,0,253,15,26,11]),s=new Uint8Array([32,0,65,2,1,106,34,33,3,128,11,4,13,64,6,253,10,7,15,116,127,5,8,12,40,16,19,54,20,9,27,255,113,17,42,67,24,23,146,148,18,14,22,45,70,69,56,114,101,21,25,63,75,136,108,28,118,29,73,115]);if(typeof WebAssembly!="object")return{supported:!1};var n=WebAssembly.validate(a)?o(t):o(e),r,i=WebAssembly.instantiate(n,{}).then(function(b){r=b.instance,r.exports.__wasm_call_ctors()});function o(b){for(var m=new Uint8Array(b.length),x=0;x<b.length;++x){var M=b.charCodeAt(x);m[x]=M>96?M-97:M>64?M-39:M+4}for(var E=0,x=0;x<b.length;++x)m[E++]=m[x]<60?s[m[x]]:(m[x]-60)*64+m[++x];return m.buffer.slice(0,E)}function c(b,m,x,M,E,T,I){var A=b.exports.sbrk,R=M+3&-4,_=A(R*E),B=A(T.length),O=new Uint8Array(b.exports.memory.buffer);O.set(T,B);var F=m(_,M,E,B,T.length);if(F==0&&I&&I(_,R,E),x.set(O.subarray(_,_+M*E)),A(_-A(0)),F!=0)throw new Error("Malformed buffer data: "+F)}var l={NONE:"",OCTAHEDRAL:"meshopt_decodeFilterOct",QUATERNION:"meshopt_decodeFilterQuat",EXPONENTIAL:"meshopt_decodeFilterExp"},f={ATTRIBUTES:"meshopt_decodeVertexBuffer",TRIANGLES:"meshopt_decodeIndexBuffer",INDICES:"meshopt_decodeIndexSequence"},d=[],h=0;function g(b){var m={object:new Worker(b),pending:0,requests:{}};return m.object.onmessage=function(x){var M=x.data;m.pending-=M.count,m.requests[M.id][M.action](M.value),delete m.requests[M.id]},m}function p(b){for(var m="self.ready = WebAssembly.instantiate(new Uint8Array(["+new Uint8Array(n)+"]), {}).then(function(result) { result.instance.exports.__wasm_call_ctors(); return result.instance; });self.onmessage = "+y.name+";"+c.toString()+y.toString(),x=new Blob([m],{type:"text/javascript"}),M=URL.createObjectURL(x),E=d.length;E<b;++E)d[E]=g(M);for(var E=b;E<d.length;++E)d[E].object.postMessage({});d.length=b,URL.revokeObjectURL(M)}function u(b,m,x,M,E){for(var T=d[0],I=1;I<d.length;++I)d[I].pending<T.pending&&(T=d[I]);return new Promise(function(A,R){var _=new Uint8Array(x),B=++h;T.pending+=b,T.requests[B]={resolve:A,reject:R},T.object.postMessage({id:B,count:b,size:m,source:_,mode:M,filter:E},[_.buffer])})}function y(b){var m=b.data;if(!m.id)return self.close();self.ready.then(function(x){try{var M=new Uint8Array(m.count*m.size);c(x,x.exports[m.mode],M,m.count,m.size,m.source,x.exports[m.filter]),self.postMessage({id:m.id,count:m.count,action:"resolve",value:M},[M.buffer])}catch(E){self.postMessage({id:m.id,count:m.count,action:"reject",value:E})}})}return{ready:i,supported:!0,useWorkers:function(b){p(b)},decodeVertexBuffer:function(b,m,x,M,E){c(r,r.exports.meshopt_decodeVertexBuffer,b,m,x,M,r.exports[l[E]])},decodeIndexBuffer:function(b,m,x,M){c(r,r.exports.meshopt_decodeIndexBuffer,b,m,x,M)},decodeIndexSequence:function(b,m,x,M){c(r,r.exports.meshopt_decodeIndexSequence,b,m,x,M)},decodeGltfBuffer:function(b,m,x,M,E,T){c(r,r.exports[f[E]],b,m,x,M,r.exports[l[T]])},decodeGltfBufferAsync:function(b,m,x,M,E){return d.length>0?u(b,m,x,f[M],l[E]):i.then(function(){var T=new Uint8Array(b*m);return c(r,r.exports[f[M]],T,b,m,x,r.exports[l[E]]),T})}}})();var gE=(function(){var e="b9H79Tebbbetm9Geueu9Geub9Gbb9Gsuuuuuuuuuuuu99uueu9Gvuuuuub9Gruuuuuuub9Gvuuuuue999Gvuuuuueu9Gquuuuuuu99uueu9Gwuuuuuu99ueu9Giuuue999Gluuuueu9GiuuueuiOHdilvorlwiDqkbxxbelve9Weiiviebeoweuec:G:Pdkr:Tewo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bbz9TW79O9V9Wt9F79P9T9W29P9M95br8E9TW79O9V9Wt9F79P9T9W29P9M959x9Pt9OcttV9P9I91tW7bwQ9TW79O9V9Wt9F79P9T9W29P9M959q9V9P9Ut7bDX9TW79O9V9Wt9F79P9T9W29P9M959t9J9H2Wbqa9TW79O9V9Wt9F9V9Wt9P9T9P96W9wWVtW94SWt9J9O9sW9T9H9Wbkl79IV9RbxDwebcekdzsq;B:xeHdbkM9Hi8Au8A99Au8Jjjjjbc;W;qb9Rgs8Kjjjjbcbhzascxfcbc;Kbz:ojjjb8AdnabaeSmbabaeadcdtz:njjjb8AkdndnamcdGmbascxfhHcbhOxekasalcrfci4gecbyd:m:jjjbHjjjjbbgABdxasceBd2aAcbaez:ojjjbhCcbhlcbhednadTmbcbhlabheadhAinaCaeydbgXci4fgQaQRbbgQceaXcrGgXtV86bbaQcu7aX4ceGalfhlaeclfheaAcufgAmbkcualcdtalcFFFFi0EhekascCfhHasaecbyd:m:jjjbHjjjjbbgOBdzascdBd2alcd4alfhXcehAinaAgecethAaeaX6mbkcdhzcbhLascuaecdtgAaecFFFFi0Ecbyd:m:jjjbHjjjjbbgXBdCasciBd2aXcFeaAz:ojjjbhKdnadTmbaecufhYcbh8AindndnaKabaLcdtfgEydbgQc:v;t;h;Ev2aYGgXcdtfgCydbgAcuSmbceheinaOaAcdtfydbaQSmdaXaefhAaecefheaKaAaYGgXcdtfgCydbgAcu9hmbkkaOa8AcdtfaQBdbaCa8ABdba8AhAa8Acefh8AkaEaABdbaLcefgLad9hmbkkaKcbyd1:jjjbH:bjjjbbascdBd2kcbh3aHcualcefgecdtaecFFFFi0Ecbyd:m:jjjbHjjjjbbg5Bdbasa5BdlasazceVgeBd2ascxfaecdtfcuadcitadcFFFFe0Ecbyd:m:jjjbHjjjjbbg8EBdbasa8EBdwasazcdfgeBd2asclfabadalcbz:cjjjbascxfaecdtfcualcdtgealcFFFFi0Eg8Fcbyd:m:jjjbHjjjjbbgABdbasazcifgXBd2ascxfaXcdtfa8Fcbyd:m:jjjbHjjjjbbgaBdbasazclVBd2aAaaaialavaOascxfz:djjjbalcbyd:m:jjjbHjjjjbbhCascxfasyd2ghcdtfaCBdbasahcefgXBd2ascxfaXcdtfa8Fcbyd:m:jjjbHjjjjbbgXBdbasahcdfgQBd2ascxfaQcdtfa8Fcbyd:m:jjjbHjjjjbbgQBdbasahcifggBd2aXcFeaez:ojjjbh8JaQcFeaez:ojjjbh8KdnalTmba8Ecwfh8Lindna5a3gQcefg3cdtfydbgKa5aQcdtgefydbgXSmbaKaX9Rhza8EaXcitfhHa8Kaefh8Ma8JaefhEcbhYindndnaHaYcitfydbg8AaQ9hmbaEaQBdba8MaQBdbxekdna5a8Acdtg8NfgeclfydbgXaeydbgeSmba8EaecitgKfydbaQSmeaXae9Rhyaecu7aXfhLa8LaKfhXcbheinaLaeSmeaecefheaXydbhKaXcwfhXaKaQ9hmbkaeay6meka8Ka8NfgeaQa8AaeydbcuSEBdbaEa8AaQaEydbcuSEBdbkaYcefgYaz9hmbkka3al9hmbkaAhXaahQa8KhKa8JhYcbheindndnaeaXydbg8A9hmbdnaeaQydbg8A9hmbaYydbh8AdnaKydbgLcu9hmba8Acu9hmbaCaefcb86bbxikaCaefhEdnaeaLSmbaea8ASmbaEce86bbxikaEcl86bbxdkdnaeaaa8AcdtgLfydb9hmbdnaKydbgEcuSmbaeaESmbaYydbgzcuSmbaeazSmba8KaLfydbgHcuSmbaHa8ASmba8JaLfydbgLcuSmbaLa8ASmbdnaAaEcdtfydbg8AaAaLcdtfydb9hmba8AaAazcdtfydbgLSmbaLaAaHcdtfydb9hmbaCaefcd86bbxlkaCaefcl86bbxikaCaefcl86bbxdkaCaefcl86bbxekaCaefaCa8AfRbb86bbkaXclfhXaQclfhQaKclfhKaYclfhYalaecefge9hmbkdnaqTmbdndnaOTmbaOheaAhXalhQindnaqaeydbfRbbTmbaCaXydbfcl86bbkaeclfheaXclfhXaQcufgQmbxdkkaAhealhXindnaqRbbTmbaCaeydbfcl86bbkaqcefhqaeclfheaXcufgXmbkkaAhealhQaChXindnaCaeydbfRbbcl9hmbaXcl86bbkaeclfheaXcefhXaQcufgQmbkkamceGTmbaChealhXindnaeRbbce9hmbaecl86bbkaecefheaXcufgXmbkkascxfagcdtfcualcx2alc;v:Q;v:Qe0Ecbyd:m:jjjbHjjjjbbg3BdbasahclfgHBd2a3aialavaOz:ejjjbh8PdndnaDmbcbhgcbh8Lxekcbh8LawhecbhXindnaeIdbJbbbb9ETmbasc;Wbfa8LcdtfaXBdba8Lcefh8LkaeclfheaDaXcefgX9hmbkascxfaHcdtfcua8Lal2gecdtaecFFFFi0Ecbyd:m:jjjbHjjjjbbggBdbasahcvfgHBd2alTmba8LTmbarcd4hEdnaOTmba8Lcdthzcbh8AaghLinaoaOa8AcdtfydbaE2cdtfhYasc;WbfheaLhXa8LhQinaXaYaeydbcdtgKfIdbawaKfIdbNUdbaeclfheaXclfhXaQcufgQmbkaLazfhLa8Acefg8Aal9hmbxdkka8Lcdthzcbh8AaghLinaoa8AaE2cdtfhYasc;WbfheaLhXa8LhQinaXaYaeydbcdtgKfIdbawaKfIdbNUdbaeclfheaXclfhXaQcufgQmbkaLazfhLa8Acefg8Aal9hmbkkascxfaHcdtfcualc8S2gealc;D;O;f8U0EgQcbyd:m:jjjbHjjjjbbgXBdbasaHcefgKBd2aXcbaez:ojjjbhqdndndna8LTmbascxfaKcdtfaQcbyd:m:jjjbHjjjjbbgvBdbasaHcdfgXBd2avcbaez:ojjjb8AascxfaXcdtfcua8Lal2gecltgXaecFFFFb0Ecbyd:m:jjjbHjjjjbbgiBdbasaHcifBd2aicbaXz:ojjjb8AadmexdkcbhvcbhiadTmekcbhYabhXindna3aXclfydbg8Acx2fgeIdba3aXydbgLcx2fgQIdbgI:tg8Ra3aXcwfydbgEcx2fgKIdlaQIdlg8S:tgRNaKIdbaI:tg8UaeIdla8S:tg8VN:tg8Wa8WNa8VaKIdwaQIdwg8X:tg8YNaRaeIdwa8X:tg8VN:tgRaRNa8Va8UNa8Ya8RN:tg8Ra8RNMM:rg8UJbbbb9ETmba8Wa8U:vh8Wa8Ra8U:vh8RaRa8U:vhRkaqaAaLcdtfydbc8S2fgeaRa8U:rg8UaRNNg8VaeIdbMUdbaea8Ra8Ua8RNg8ZNg8YaeIdlMUdlaea8Wa8Ua8WNg80Ng81aeIdwMUdwaea8ZaRNg8ZaeIdxMUdxaea80aRNgBaeIdzMUdzaea80a8RNg80aeIdCMUdCaeaRa8Ua8Wa8XNaRaINa8Sa8RNMM:mg8SNgINgRaeIdKMUdKaea8RaINg8RaeId3MUd3aea8WaINg8WaeIdaMUdaaeaIa8SNgIaeId8KMUd8Kaea8UaeIdyMUdyaqaAa8Acdtfydbc8S2fgea8VaeIdbMUdbaea8YaeIdlMUdlaea81aeIdwMUdwaea8ZaeIdxMUdxaeaBaeIdzMUdzaea80aeIdCMUdCaeaRaeIdKMUdKaea8RaeId3MUd3aea8WaeIdaMUdaaeaIaeId8KMUd8Kaea8UaeIdyMUdyaqaAaEcdtfydbc8S2fgea8VaeIdbMUdbaea8YaeIdlMUdlaea81aeIdwMUdwaea8ZaeIdxMUdxaeaBaeIdzMUdzaea80aeIdCMUdCaeaRaeIdKMUdKaea8RaeId3MUd3aea8WaeIdaMUdaaeaIaeId8KMUd8Kaea8UaeIdyMUdyaXcxfhXaYcifgYad6mbkcbhzabhLinabazcdtfh8AcbhXinaCa8AaXc;a1jjbfydbcdtfydbgQfRbbhedndnaCaLaXfydbgKfRbbgYc99fcFeGcpe0mbaec99fcFeGc;:e6mekdnaYcufcFeGce0mba8JaKcdtfydbaQ9hmekdnaecufcFeGce0mba8KaQcdtfydbaK9hmekdnaYcv2aefc:G1jjbfRbbTmbaAaQcdtfydbaAaKcdtfydb0mekJbbacJbbacJbbjZaecFeGceSEaYceSEh80dna3a8AaXc;e1jjbfydbcdtfydbcx2fgeIdwa3aKcx2fgYIdwg8S:tg8Wa3aQcx2fgEIdwa8S:tgRaRNaEIdbaYIdbg8X:tg8Ra8RNaEIdlaYIdlg8V:tg8Ua8UNMMgINa8WaRNaeIdba8X:tg81a8RNa8UaeIdla8V:tg8ZNMMg8YaRN:tg8Wa8WNa81aINa8Ya8RN:tgRaRNa8ZaINa8Ya8UN:tg8Ra8RNMM:rg8UJbbbb9ETmba8Wa8U:vh8Wa8Ra8U:vh8RaRa8U:vhRkaqaAaKcdtfydbc8S2fgeaRa80aI:rNg8UaRNNg8YaeIdbMUdbaea8Ra8Ua8RNg80Ng81aeIdlMUdlaea8Wa8Ua8WNgINg8ZaeIdwMUdwaea80aRNg80aeIdxMUdxaeaIaRNgBaeIdzMUdzaeaIa8RNg83aeIdCMUdCaeaRa8Ua8Wa8SNaRa8XNa8Va8RNMM:mg8SNgINgRaeIdKMUdKaea8RaINg8RaeId3MUd3aea8WaINg8WaeIdaMUdaaeaIa8SNgIaeId8KMUd8Kaea8UaeIdyMUdyaqaAaQcdtfydbc8S2fgea8YaeIdbMUdbaea81aeIdlMUdlaea8ZaeIdwMUdwaea80aeIdxMUdxaeaBaeIdzMUdzaea83aeIdCMUdCaeaRaeIdKMUdKaea8RaeId3MUd3aea8WaeIdaMUdaaeaIaeId8KMUd8Kaea8UaeIdyMUdykaXclfgXcx9hmbkaLcxfhLazcifgzad6mbka8LTmbcbhLinJbbbbh8Xa3abaLcdtfgeclfydbgEcx2fgXIdwa3aeydbgzcx2fgQIdwg8Z:tg8Ra8RNaXIdbaQIdbgB:tg8Wa8WNaXIdlaQIdlg83:tg8Ua8UNMMg80a3aecwfydbgHcx2fgeIdwa8Z:tgINa8Ra8RaINa8WaeIdbaB:tg8SNa8UaeIdla83:tg8VNMMgRN:tJbbbbJbbjZa80aIaINa8Sa8SNa8Va8VNMMg81NaRaRN:tg8Y:va8YJbbbb9BEg8YNhUa81a8RNaIaRN:ta8YNh85a80a8VNa8UaRN:ta8YNh86a81a8UNa8VaRN:ta8YNh87a80a8SNa8WaRN:ta8YNh88a81a8WNa8SaRN:ta8YNh89a8Wa8VNa8Sa8UN:tgRaRNa8UaINa8Va8RN:tgRaRNa8Ra8SNaIa8WN:tgRaRNMM:rJbbbZNhRagaza8L2gwcdtfhXagaHa8L2g8NcdtfhQagaEa8L2g5cdtfhKa8Z:mh8:a83:mhZaB:mhncbhYa8Lh8AJbbbbh8VJbbbbh8YJbbbbh80Jbbbbh81Jbbbbh8ZJbbbbhBJbbbbh83JbbbbhcJbbbbh9cinasc;WbfaYfgecwfaRa85aKIdbaXIdbgI:tg8UNaUaQIdbaI:tg8SNMg8RNUdbaeclfaRa87a8UNa86a8SNMg8WNUdbaeaRa89a8UNa88a8SNMg8UNUdbaecxfaRa8:a8RNaZa8WNaIana8UNMMMgINUdbaRa8Ra8WNNa81Mh81aRa8Ra8UNNa8ZMh8ZaRa8Wa8UNNaBMhBaRaIaINNa8XMh8XaRa8RaINNa8VMh8VaRa8WaINNa8YMh8YaRa8UaINNa80Mh80aRa8Ra8RNNa83Mh83aRa8Wa8WNNacMhcaRa8Ua8UNNa9cMh9caXclfhXaKclfhKaQclfhQaYczfhYa8Acufg8Ambkavazc8S2fgea9caeIdbMUdbaeacaeIdlMUdlaea83aeIdwMUdwaeaBaeIdxMUdxaea8ZaeIdzMUdzaea81aeIdCMUdCaea80aeIdKMUdKaea8YaeId3MUd3aea8VaeIdaMUdaaea8XaeId8KMUd8KaeaRaeIdyMUdyavaEc8S2fgea9caeIdbMUdbaeacaeIdlMUdlaea83aeIdwMUdwaeaBaeIdxMUdxaea8ZaeIdzMUdzaea81aeIdCMUdCaea80aeIdKMUdKaea8YaeId3MUd3aea8VaeIdaMUdaaea8XaeId8KMUd8KaeaRaeIdyMUdyavaHc8S2fgea9caeIdbMUdbaeacaeIdlMUdlaea83aeIdwMUdwaeaBaeIdxMUdxaea8ZaeIdzMUdzaea81aeIdCMUdCaea80aeIdKMUdKaea8YaeId3MUd3aea8VaeIdaMUdaaea8XaeId8KMUd8KaeaRaeIdyMUdyaiawcltfh8AcbhXa8LhKina8AaXfgeasc;WbfaXfgQIdbaeIdbMUdbaeclfgYaQclfIdbaYIdbMUdbaecwfgYaQcwfIdbaYIdbMUdbaecxfgeaQcxfIdbaeIdbMUdbaXczfhXaKcufgKmbkaia5cltfh8AcbhXa8LhKina8AaXfgeasc;WbfaXfgQIdbaeIdbMUdbaeclfgYaQclfIdbaYIdbMUdbaecwfgYaQcwfIdbaYIdbMUdbaecxfgeaQcxfIdbaeIdbMUdbaXczfhXaKcufgKmbkaia8Ncltfh8AcbhXa8LhKina8AaXfgeasc;WbfaXfgQIdbaeIdbMUdbaeclfgYaQclfIdbaYIdbMUdbaecwfgYaQcwfIdbaYIdbMUdbaecxfgeaQcxfIdbaeIdbMUdbaXczfhXaKcufgKmbkaLcifgLad6mbkkcbhQdndnamcwGgJmbJbbbbh8Vcbh9ecbhocbhhxekcbh9ea8Fcbyd:m:jjjbHjjjjbbhhascxfasyd2gecdtfahBdbasaecefgXBd2ascxfaXcdtfcuahalabadaAz:fjjjbgKcltaKcjjjjiGEcbyd:m:jjjbHjjjjbbgoBdbasaecdfBd2aoaKaha3alz:gjjjbJFFuuh8VaKTmbaoheaKhXinaeIdbgRa8Va8VaR9EEh8VaeclfheaXcufgXmbkaKh9ekasydlhTdnalTmbaTclfheaTydbhKaChXalhYcbhQincbaeydbg8AaK9RaXRbbcpeGEaQfhQaXcefhXaeclfhea8AhKaYcufgYmbkaQce4hQkcuadaQ9RcifgScx2aSc;v:Q;v:Qe0Ecbyd:m:jjjbHjjjjbbhDascxfasyd2g9hcdtfaDBdbasa9hcefgeBd2ascxfaecdtfcuaScdtaScFFFFi0Ecbyd:m:jjjbHjjjjbbgrBdbasa9hcdfgeBd2ascxfaecdtfa8Fcbyd:m:jjjbHjjjjbbgyBdbasa9hcifgeBd2ascxfaecdtfalcbyd:m:jjjbHjjjjbbg9iBdbasa9hclfg6Bd2axaxNa8PJbbjZamclGEgUaUN:vh9cJbbbbhcdnadak9nmbdnaSci6mba8Lclth9kaDcwfh0Jbbbbh83JbbbbhcinasclfabadalaAz:cjjjbabhzcbh8Ecbh8Finaba8FcdtfhHcbheindnaAazaefydbgQcdtgEfydbgYaAaHaec;q1jjbfydbcdtfydbgXcdtgwfydbg8ASmbaCaXfRbbgLcv2aCaQfRbbgKfc;G1jjbfRbbg5aKcv2aLfg8Nc;G1jjbfRbbg8MVcFeGTmbdna8AaY9nmba8Nc:G1jjbfRbbcFeGmekaKcufhYdnaKaL9hmbaYcFeGce0mba8JaEfydbaX9hmekdndnaKclSmbaLcl9hmekdnaYcFeGce0mba8JaEfydbaX9hmdkaLcufcFeGce0mba8KawfydbaQ9hmekaDa8Ecx2fgKaXaQa8McFeGgYEBdlaKaQaXaYEBdbaKaYa5Gcb9hBdwa8Ecefh8Ekaeclfgecx9hmbkdna8Fcifg8Fad9pmbazcxfhza8EcifaS9nmekka8ETmdcbhLinaqaAaDaLcx2fgKydbgYcdtgzfydbc8S2fgeIdwa3aKydlg8Acx2fgXIdwg8WNaeIdzaXIdbg8UNaeIdaMgRaRMMa8WNaeIdlaXIdlgINaeIdCa8WNaeId3MgRaRMMaINaeIdba8UNaeIdxaINaeIdKMgRaRMMa8UNaeId8KMMM:lhRJbbbbJbbjZaeIdyg8R:va8RJbbbb9BEh8RdndnaKydwgEmbJFFuuh8YxekJbbbbJbbjZaqaAa8Acdtfydbc8S2fgeIdyg8S:va8SJbbbb9BEaeIdwa3aYcx2fgXIdwg8SNaeIdzaXIdbg8XNaeIdaMg8Ya8YMMa8SNaeIdlaXIdlg8YNaeIdCa8SNaeId3Mg8Sa8SMMa8YNaeIdba8XNaeIdxa8YNaeIdKMg8Sa8SMMa8XNaeId8KMMM:lNh8Yka8RaRNh80dna8LTmbavaYc8S2fgQIdwa8WNaQIdza8UNaQIdaMgRaRMMa8WNaQIdlaINaQIdCa8WNaQId3MgRaRMMaINaQIdba8UNaQIdxaINaQIdKMgRaRMMa8UNaQId8KMMMhRaga8Aa8L2gHcdtfhXaiaYa8L2gwcltfheaQIdyh8Sa8LhQinaXIdbg8Ra8Ra8SNaecxfIdba8WaecwfIdbNa8UaeIdbNaIaeclfIdbNMMMg8Ra8RM:tNaRMhRaXclfhXaeczfheaQcufgQmbkdndnaEmbJbbbbh8Rxekava8Ac8S2fgQIdwa3aYcx2fgeIdwg8UNaQIdzaeIdbgINaQIdaMg8Ra8RMMa8UNaQIdlaeIdlg8SNaQIdCa8UNaQId3Mg8Ra8RMMa8SNaQIdbaINaQIdxa8SNaQIdKMg8Ra8RMMaINaQId8KMMMh8RagawcdtfhXaiaHcltfheaQIdyh8Xa8LhQinaXIdbg8Wa8Wa8XNaecxfIdba8UaecwfIdbNaIaeIdbNa8SaeclfIdbNMMMg8Wa8WM:tNa8RMh8RaXclfhXaeczfheaQcufgQmbka8R:lh8Rka80aR:lMh80a8Ya8RMh8YaCaYfRbbcd9hmbdna8Ka8Ja8Jazfydba8ASEaaazfydbgHcdtfydbgzcu9hmbaaa8AcdtfydbhzkavaHc8S2fgQIdwa3azcx2fgeIdwg8WNaQIdzaeIdbg8UNaQIdaMgRaRMMa8WNaQIdlaeIdlgINaQIdCa8WNaQId3MgRaRMMaINaQIdba8UNaQIdxaINaQIdKMgRaRMMa8UNaQId8KMMMhRagaza8L2gwcdtfhXaiaHa8L2g8NcltfheaQIdyh8Sa8LhQinaXIdbg8Ra8Ra8SNaecxfIdba8WaecwfIdbNa8UaeIdbNaIaeclfIdbNMMMg8Ra8RM:tNaRMhRaXclfhXaeczfheaQcufgQmbkdndnaEmbJbbbbh8Rxekavazc8S2fgQIdwa3aHcx2fgeIdwg8UNaQIdzaeIdbgINaQIdaMg8Ra8RMMa8UNaQIdlaeIdlg8SNaQIdCa8UNaQId3Mg8Ra8RMMa8SNaQIdbaINaQIdxa8SNaQIdKMg8Ra8RMMaINaQId8KMMMh8Raga8NcdtfhXaiawcltfheaQIdyh8Xa8LhQinaXIdbg8Wa8Wa8XNaecxfIdba8UaecwfIdbNaIaeIdbNa8SaeclfIdbNMMMg8Wa8WM:tNa8RMh8RaXclfhXaeczfheaQcufgQmbka8R:lh8Rka80aR:lMh80a8Ya8RMh8YkaKa80a8Ya80a8Y9FgeEUdwaKa8AaYaeaETVgeEBdlaKaYa8AaeEBdbaLcefgLa8E9hmbkasc;Wbfcbcj;qbz:ojjjb8Aa0hea8EhXinasc;WbfaeydbcA4cF8FGgQcFAaQcFA6EcdtfgQaQydbcefBdbaecxfheaXcufgXmbkcbhecbhXinasc;WbfaefgQydbhKaQaXBdbaKaXfhXaeclfgecj;qb9hmbkcbhea0hXinasc;WbfaXydbcA4cF8FGgQcFAaQcFA6EcdtfgQaQydbgQcefBdbaraQcdtfaeBdbaXcxfhXa8Eaecefge9hmbkadak9RgQci9Uh9mdnalTmbcbheayhXinaXaeBdbaXclfhXalaecefge9hmbkkcbh9na9icbalz:ojjjbh8FaQcO9Uh9oa9mce4h9pasydwh9qcbh8Mcbh5dninaDara5cdtfydbcx2fg8NIdwgRa9c9Emea8Ma9m9pmeJFFuuh8Rdna9pa8E9pmbaDara9pcdtfydbcx2fIdwJbb;aZNh8RkdnaRa8R9ETmbaRac9ETmba8Ma9o0mdkdna8FaAa8NydlgHcdtg9rfydbgKfg9sRbba8FaAa8Nydbgzcdtg9tfydbgefg9uRbbVmbaCazfRbbh9vdnaTaecdtfgXclfydbgQaXydbgXSmbaQaX9RhYa3aKcx2fhLa3aecx2fhEa9qaXcitfhecbhXcehwdnindnayaeydbcdtfydbgQaKSmbayaeclfydbcdtfydbg8AaKSmbaQa8ASmba3a8Acx2fg8AIdba3aQcx2fgQIdbg8W:tgRaEIdlaQIdlg8U:tg8XNaEIdba8W:tg8Ya8AIdla8U:tg8RN:tgIaRaLIdla8U:tg80NaLIdba8W:tg81a8RN:tg8UNa8RaEIdwaQIdwg8S:tg8ZNa8Xa8AIdwa8S:tg8WN:tg8Xa8RaLIdwa8S:tgBNa80a8WN:tg8RNa8Wa8YNa8ZaRN:tg8Sa8Wa81NaBaRN:tgRNMMaIaINa8Xa8XNa8Sa8SNMMa8Ua8UNa8Ra8RNaRaRNMMN:rJbbj8:N9FmdkaecwfheaXcefgXaY6hwaYaX9hmbkkawceGTmba9pcefh9pxekdndndndna9vc9:fPdebdkazheinayaecdtgefaHBdbaaaefydbgeaz9hmbxikkdna8Ka8Ja8Ja9tfydbaHSEaaa9tfydbgzcdtfydbgecu9hmbaaa9rfydbhekaya9tfaHBdbaehHkayazcdtfaHBdbka9uce86bba9sce86bba8NIdwgRacacaR9DEhca9ncefh9ncecda9vceSEa8Mfh8Mka5cefg5a8E9hmbkka9nTmddnalTmbcbh8AcbhEindnayaEcdtgefydbgQaESmbaAaQcdtfydbhzdnaEaAaefydb9hgHmbaqazc8S2fgeaqaEc8S2fgXIdbaeIdbMUdbaeaXIdlaeIdlMUdlaeaXIdwaeIdwMUdwaeaXIdxaeIdxMUdxaeaXIdzaeIdzMUdzaeaXIdCaeIdCMUdCaeaXIdKaeIdKMUdKaeaXId3aeId3MUd3aeaXIdaaeIdaMUdaaeaXId8KaeId8KMUd8KaeaXIdyaeIdyMUdyka8LTmbavaQc8S2fgeavaEc8S2gwfgXIdbaeIdbMUdbaeaXIdlaeIdlMUdlaeaXIdwaeIdwMUdwaeaXIdxaeIdxMUdxaeaXIdzaeIdzMUdzaeaXIdCaeIdCMUdCaeaXIdKaeIdKMUdKaeaXId3aeId3MUd3aeaXIdaaeIdaMUdaaeaXId8KaeId8KMUd8KaeaXIdyaeIdyMUdya9kaQ2hLaihXa8LhKinaXaLfgeaXa8AfgQIdbaeIdbMUdbaeclfgYaQclfIdbaYIdbMUdbaecwfgYaQcwfIdbaYIdbMUdbaecxfgeaQcxfIdbaeIdbMUdbaXczfhXaKcufgKmbkaHmbJbbbbJbbjZaqawfgeIdygR:vaRJbbbb9BEaeIdwa3azcx2fgXIdwgRNaeIdzaXIdbg8RNaeIdaMg8Wa8WMMaRNaeIdlaXIdlg8WNaeIdCaRNaeId3MgRaRMMa8WNaeIdba8RNaeIdxa8WNaeIdKMgRaRMMa8RNaeId8KMMM:lNgRa83a83aR9DEh83ka8Aa9kfh8AaEcefgEal9hmbkcbhXa8JheindnaeydbgQcuSmbdnaXayaQcdtgKfydbgQ9hmbcuhQa8JaKfydbgKcuSmbayaKcdtfydbhQkaeaQBdbkaeclfhealaXcefgX9hmbkcbhXa8KheindnaeydbgQcuSmbdnaXayaQcdtgKfydbgQ9hmbcuhQa8KaKfydbgKcuSmbayaKcdtfydbhQkaeaQBdbkaeclfhealaXcefgX9hmbkka83aca8LEh83cbhKabhecbhYindnayaeydbcdtfydbgXayaeclfydbcdtfydbgQSmbaXayaecwfydbcdtfydbg8ASmbaQa8ASmbabaKcdtfgLaXBdbaLcwfa8ABdbaLclfaQBdbaKcifhKkaecxfheaYcifgYad6mbkdndnaJTmbaKak9nmba8Va839FTmbcbhdabhecbhXindnaoahaeydbgQcdtfydbcdtfIdba839ETmbabadcdtfgYaQBdbaYclfaeclfydbBdbaYcwfaecwfydbBdbadcifhdkaecxfheaXcifgXaK6mbkJFFuuh8Va9eTmeaohea9ehXJFFuuhRinaeIdbg8RaRaRa8R9EEg8WaRa8Ra839EgQEhRa8Wa8VaQEh8VaeclfheaXcufgXmbxdkkaKhdkadak0mbxdkkasclfabadalaAz:cjjjbkdndnadak0mbadhXxekdnaJmbadhXxekdna8Va9c9FmbadhXxekina8VJbb;aZNgRa9caRa9c9DEh8WJbbbbhRdna9eTmbaohea9ehAinaeIdbg8RaRa8Ra8W9FEaRa8RaR9EEhRaeclfheaAcufgAmbkkcbhXabhecbhAindnaoahaeydbgQcdtfydbcdtfIdba8W9ETmbabaXcdtfgKaQBdbaKclfaeclfydbBdbaKcwfaecwfydbBdbaXcifhXkaecxfheaAcifgAad6mbkJFFuuh8Vdna9eTmbaohea9ehAJFFuuh8RinaeIdbg8Ua8Ra8Ra8U9EEgIa8Ra8Ua8W9EgQEh8RaIa8VaQEh8VaeclfheaAcufgAmbkkdnaXad9hmbadhXxdkaRacacaR9DEhcaXak9nmeaXhda8Va9c9FmbkkdnamcjjjjlGTmbaOmbaXTmbcbh8AabheinaCaeydbgKfRbbc3thLaecwfgEydbhAdndna8JaKcdtgHfydbaeclfgzydbgQSmbcbhYa8KaQcdtfydbaK9hmekcjjjj94hYkaeaLaYVaKVBdbaCaQfRbbc3thLdndna8JaQcdtfydbaASmbcbhYa8KaAcdtfydbaQ9hmekcjjjj94hYkazaLaYVaQVBdbaCaAfRbbc3thYdndna8JaAcdtfydbaKSmbcbhQa8KaHfydbaA9hmekcjjjj94hQkaEaYaQVaAVBdbaecxfhea8Acifg8AaX6mbkkdnaOTmbaXTmbaXheinabaOabydbcdtfydbBdbabclfhbaecufgembkkdnaPTmbaPaUac:rNUdbka9hcdtascxffcxfhednina6Tmeaeydbcbyd1:jjjbH:bjjjbbaec98fhea6cufh6xbkkasc;W;qbf8KjjjjbaXk;Yieouabydlhvabydbclfcbaicdtz:ojjjbhoadci9UhrdnadTmbdnalTmbaehwadhDinaoalawydbcdtfydbcdtfgqaqydbcefBdbawclfhwaDcufgDmbxdkkaehwadhDinaoawydbcdtfgqaqydbcefBdbawclfhwaDcufgDmbkkdnaiTmbcbhDaohwinawydbhqawaDBdbawclfhwaqaDfhDaicufgimbkkdnadci6mbinaecwfydbhwaeclfydbhDaeydbhidnalTmbalawcdtfydbhwalaDcdtfydbhDalaicdtfydbhikavaoaicdtfgqydbcitfaDBdbavaqydbcitfawBdlaqaqydbcefBdbavaoaDcdtfgqydbcitfawBdbavaqydbcitfaiBdlaqaqydbcefBdbavaoawcdtfgwydbcitfaiBdbavawydbcitfaDBdlawawydbcefBdbaecxfhearcufgrmbkkabydbcbBdbk:todDue99aicd4aifhrcehwinawgDcethwaDar6mbkcuaDcdtgraDcFFFFi0Ecbyd:m:jjjbHjjjjbbhwaoaoyd9GgqcefBd9GaoaqcdtfawBdbawcFearz:ojjjbhkdnaiTmbalcd4hlaDcufhxcbhminamhDdnavTmbavamcdtfydbhDkcbadaDal2cdtfgDydlgwawcjjjj94SEgwcH4aw7c:F:b:DD2cbaDydbgwawcjjjj94SEgwcH4aw7c;D;O:B8J27cbaDydwgDaDcjjjj94SEgDcH4aD7c:3F;N8N27axGhwamcdthPdndndnavTmbakawcdtfgrydbgDcuSmeadavaPfydbal2cdtfgsIdbhzcehqinaqhrdnadavaDcdtfydbal2cdtfgqIdbaz9CmbaqIdlasIdl9CmbaqIdwasIdw9BmlkarcefhqakawarfaxGgwcdtfgrydbgDcu9hmbxdkkakawcdtfgrydbgDcuSmbadamal2cdtfgsIdbhzcehqinaqhrdnadaDal2cdtfgqIdbaz9CmbaqIdlasIdl9CmbaqIdwasIdw9BmikarcefhqakawarfaxGgwcdtfgrydbgDcu9hmbkkaramBdbamhDkabaPfaDBdbamcefgmai9hmbkkakcbyd1:jjjbH:bjjjbbaoaoyd9GcufBd9GdnaeTmbaiTmbcbhDaehwinawaDBdbawclfhwaiaDcefgD9hmbkcbhDaehwindnaDabydbgrSmbawaearcdtfgrydbBdbaraDBdbkawclfhwabclfhbaiaDcefgD9hmbkkk;Qodvuv998Jjjjjbca9Rgvczfcwfcbyd11jjbBdbavcb8Pdj1jjb83izavcwfcbydN1jjbBdbavcb8Pd:m1jjb83ibdnadTmbaicd4hodnabmbdnalTmbcbhrinaealarcdtfydbao2cdtfhwcbhiinavczfaifgDawaifIdbgqaDIdbgkakaq9EEUdbavaifgDaqaDIdbgkakaq9DEUdbaiclfgicx9hmbkarcefgrad9hmbxikkaocdthrcbhwincbhiinavczfaifgDaeaifIdbgqaDIdbgkakaq9EEUdbavaifgDaqaDIdbgkakaq9DEUdbaiclfgicx9hmbkaearfheawcefgwad9hmbxdkkdnalTmbcbhrinabarcx2fgiaealarcdtfydbao2cdtfgwIdbUdbaiawIdlUdlaiawIdwUdwcbhiinavczfaifgDawaifIdbgqaDIdbgkakaq9EEUdbavaifgDaqaDIdbgkakaq9DEUdbaiclfgicx9hmbkarcefgrad9hmbxdkkaocdthlcbhraehwinabarcx2fgiaearao2cdtfgDIdbUdbaiaDIdlUdlaiaDIdwUdwcbhiinavczfaifgDawaifIdbgqaDIdbgkakaq9EEUdbavaifgDaqaDIdbgkakaq9DEUdbaiclfgicx9hmbkawalfhwarcefgrad9hmbkkJbbbbavIdbavIdzgk:tgqaqJbbbb9DEgqavIdlavIdCgx:tgmamaq9DEgqavIdwavIdKgm:tgPaPaq9DEhPdnabTmbadTmbJbbbbJbbjZaP:vaPJbbbb9BEhqinabaqabIdbak:tNUdbabclfgvaqavIdbax:tNUdbabcwfgvaqavIdbam:tNUdbabcxfhbadcufgdmbkkaPk:ZlewudnaeTmbcbhvabhoinaoavBdbaoclfhoaeavcefgv9hmbkkdnaiTmbcbhrinadarcdtfhwcbhDinalawaDcdtgvc;a1jjbfydbcdtfydbcdtfydbhodnabalawavfydbcdtfydbgqcdtfgkydbgvaqSmbinakabavgqcdtfgxydbgvBdbaxhkaqav9hmbkkdnabaocdtfgkydbgvaoSmbinakabavgocdtfgxydbgvBdbaxhkaoav9hmbkkdnaqaoSmbabaqaoaqao0Ecdtfaqaoaqao6EBdbkaDcefgDci9hmbkarcifgrai6mbkkdnaembcbskcbhxindnalaxcdtgvfydbax9hmbaxhodnabavfgDydbgvaxSmbaDhqinaqabavgocdtfgkydbgvBdbakhqaoav9hmbkkaDaoBdbkaxcefgxae9hmbkcbhvabhocbhkindndnavalydbgq9hmbdnavaoydbgq9hmbaoakBdbakcefhkxdkaoabaqcdtfydbBdbxekaoabaqcdtfydbBdbkaoclfhoalclfhlaeavcefgv9hmbkakk;Jiilud99duabcbaecltz:ojjjbhvdnalTmbadhoaihralhwinarcwfIdbhDarclfIdbhqavaoydbcltfgkarIdbakIdbMUdbakclfgxaqaxIdbMUdbakcwfgxaDaxIdbMUdbakcxfgkakIdbJbbjZMUdbaoclfhoarcxfhrawcufgwmbkkdnaeTmbavhraehkinarcxfgoIdbhDaocbBdbararIdbJbbbbJbbjZaD:vaDJbbbb9BEgDNUdbarclfgoaDaoIdbNUdbarcwfgoaDaoIdbNUdbarczfhrakcufgkmbkkdnalTmbinavadydbcltfgrcxfgkaicwfIdbarcwfIdb:tgDaDNaiIdbarIdb:tgDaDNaiclfIdbarclfIdb:tgDaDNMMgDakIdbgqaqaD9DEUdbadclfhdaicxfhialcufglmbkkdnaeTmbavcxfhrinabarIdbUdbarczfhrabclfhbaecufgembkkk8MbabaeadaialavcbcbcbcbcbaoarawaDz:bjjjbk8MbabaeadaialavaoarawaDaqakaxamaPz:bjjjbk:DCoDud99rue99iul998Jjjjjbc;Wb9Rgw8KjjjjbdndnarmbcbhDxekawcxfcbc;Kbz:ojjjb8Aawcuadcx2adc;v:Q;v:Qe0Ecbyd:m:jjjbHjjjjbbgqBdxawceBd2aqaeadaicbz:ejjjb8AawcuadcdtadcFFFFi0Egkcbyd:m:jjjbHjjjjbbgxBdzawcdBd2adcd4adfhmceheinaegicetheaiam6mbkcbhPawcuaicdtgsaicFFFFi0Ecbyd:m:jjjbHjjjjbbgzBdCawciBd2dndnar:ZgH:rJbbbZMgO:lJbbb9p9DTmbaO:Ohexekcjjjj94hekaicufhAc:bwhmcbhCadhXcbhQinaChLaeamgKcufaeaK9iEaPgDcefaeaD9kEhYdndnadTmbaYcuf:YhOaqhiaxheadhmindndnaiIdbaONJbbbZMg8A:lJbbb9p9DTmba8A:OhCxekcjjjj94hCkaCcCthCdndnaiclfIdbaONJbbbZMg8A:lJbbb9p9DTmba8A:OhExekcjjjj94hEkaEcqtaCVhCdndnaicwfIdbaONJbbbZMg8A:lJbbb9p9DTmba8A:OhExekcjjjj94hEkaeaCaEVBdbaicxfhiaeclfheamcufgmmbkazcFeasz:ojjjbh3cbh5cbhPindna3axaPcdtfydbgCcm4aC7c:v;t;h;Ev2gics4ai7aAGgmcdtfgEydbgecuSmbaeaCSmbcehiina3amaifaAGgmcdtfgEydbgecuSmeaicefhiaeaC9hmbkkaEaCBdba5aecuSfh5aPcefgPad9hmbxdkkazcFeasz:ojjjb8Acbh5kaDaYa5ar0giEhPaLa5aiEhCdna5arSmbaYaKaiEgmaP9Rcd9imbdndnaQcl0mbdnaX:ZgOaL:Zg8A:taY:Yg8EaD:Y:tg8Fa8EaK:Y:tgaa5:ZghaH:tNNNaOaH:taaNa8Aah:tNa8AaH:ta8FNahaO:tNM:va8EMJbbbZMgO:lJbbb9p9DTmbaO:Ohexdkcjjjj94hexekaPamfcd9Theka5aXaiEhXaQcefgQcs9hmekkdndnaCmbcihicbhDxekcbhiawakcbyd:m:jjjbHjjjjbbg5BdKawclBd2aPcuf:Yh8AdndnadTmbaqhiaxheadhmindndnaiIdba8ANJbbbZMgO:lJbbb9p9DTmbaO:OhCxekcjjjj94hCkaCcCthCdndnaiclfIdba8ANJbbbZMgO:lJbbb9p9DTmbaO:OhExekcjjjj94hEkaEcqtaCVhCdndnaicwfIdba8ANJbbbZMgO:lJbbb9p9DTmbaO:OhExekcjjjj94hEkaeaCaEVBdbaicxfhiaeclfheamcufgmmbkazcFeasz:ojjjbh3cbhDcbhYindndndna3axaYcdtgKfydbgCcm4aC7c:v;t;h;Ev2gics4ai7aAGgmcdtfgEydbgecuSmbcehiinaxaecdtgefydbaCSmdamaifheaicefhia3aeaAGgmcdtfgEydbgecu9hmbkkaEaYBdbaDhiaDcefhDxeka5aefydbhika5aKfaiBdbaYcefgYad9hmbkcuaDc32giaDc;j:KM;jb0EhexekazcFeasz:ojjjb8AcbhDcbhekawaecbyd:m:jjjbHjjjjbbgeBd3awcvBd2aecbaiz:ojjjbhEavcd4hKdnadTmbdnalTmbaKcdth3a5hCaqhealhmadhAinaEaCydbc32fgiaeIdbaiIdbMUdbaiaeclfIdbaiIdlMUdlaiaecwfIdbaiIdwMUdwaiamIdbaiIdxMUdxaiamclfIdbaiIdzMUdzaiamcwfIdbaiIdCMUdCaiaiIdKJbbjZMUdKaCclfhCaecxfheama3fhmaAcufgAmbxdkka5hmaqheadhCinaEamydbc32fgiaeIdbaiIdbMUdbaiaeclfIdbaiIdlMUdlaiaecwfIdbaiIdwMUdwaiaiIdxJbbbbMUdxaiaiIdzJbbbbMUdzaiaiIdCJbbbbMUdCaiaiIdKJbbjZMUdKamclfhmaecxfheaCcufgCmbkkdnaDTmbaEhiaDheinaiaiIdbJbbbbJbbjZaicKfIdbgO:vaOJbbbb9BEgONUdbaiclfgmaOamIdbNUdbaicwfgmaOamIdbNUdbaicxfgmaOamIdbNUdbaiczfgmaOamIdbNUdbaicCfgmaOamIdbNUdbaic3fhiaecufgembkkcbhCawcuaDcdtgYaDcFFFFi0Egicbyd:m:jjjbHjjjjbbgeBdaawcoBd2awaicbyd:m:jjjbHjjjjbbg3Bd8KaecFeaYz:ojjjbhxdnadTmbJbbjZJbbjZa8A:vaPceSEaoNgOaONh8AaKcdthPalheina8Aaec;81jjbalEgmIdwaEa5ydbgAc32fgiIdC:tgOaONamIdbaiIdx:tgOaONamIdlaiIdz:tgOaONMMNaqcwfIdbaiIdw:tgOaONaqIdbaiIdb:tgOaONaqclfIdbaiIdl:tgOaONMMMhOdndnaxaAcdtgifgmydbcuSmba3aifIdbaO9ETmekamaCBdba3aifaOUdbka5clfh5aqcxfhqaeaPfheadaCcefgC9hmbkkabaxaYz:njjjb8AcrhikaicdthiinaiTmeaic98fgiawcxffydbcbyd1:jjjbH:bjjjbbxbkkawc;Wbf8KjjjjbaDk:Ydidui99ducbhi8Jjjjjbca9Rglczfcwfcbyd11jjbBdbalcb8Pdj1jjb83izalcwfcbydN1jjbBdbalcb8Pd:m1jjb83ibdndnaembJbbjFhvJbbjFhoJbbjFhrxekadcd4cdthwincbhdinalczfadfgDabadfIdbgvaDIdbgoaoav9EEUdbaladfgDavaDIdbgoaoav9DEUdbadclfgdcx9hmbkabawfhbaicefgiae9hmbkalIdwalIdK:thralIdlalIdC:thoalIdbalIdz:thvkJbbbbavavJbbbb9DEgvaoaoav9DEgvararav9DEk9DeeuabcFeaicdtz:ojjjbhlcbhbdnadTmbindnalaeydbcdtfgiydbcu9hmbaiabBdbabcefhbkaeclfheadcufgdmbkkabk9teiucbcbyd:q:jjjbgeabcifc98GfgbBd:q:jjjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik;teeeudndnaeabVciGTmbabhixekdndnadcz9pmbabhixekabhiinaiaeydbBdbaiaeydlBdlaiaeydwBdwaiaeydxBdxaeczfheaiczfhiadc9Wfgdcs0mbkkadcl6mbinaiaeydbBdbaeclfheaiclfhiadc98fgdci0mbkkdnadTmbinaiaeRbb86bbaicefhiaecefheadcufgdmbkkabk:3eedudndnabciGTmbabhixekaecFeGc:b:c:ew2hldndnadcz9pmbabhixekabhiinaialBdxaialBdwaialBdlaialBdbaiczfhiadc9Wfgdcs0mbkkadcl6mbinaialBdbaiclfhiadc98fgdci0mbkkdnadTmbinaiae86bbaicefhiadcufgdmbkkabk9teiucbcbyd:q:jjjbgeabcrfc94GfgbBd:q:jjjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik9:eiuZbhedndncbyd:q:jjjbgdaecztgi9nmbcuheadai9RcFFifcz4nbcuSmekadhekcbabae9Rcifc98Gcbyd:q:jjjbfgdBd:q:jjjbdnadZbcztge9nmbadae9RcFFifcz4nb8Akkk:Iedbcjwk1eFFuuFFuuFFuuFFuFFFuFFFuFbbbbbbbbeeebeebebbeeebebbbbbebebbbbbbbbbebbbdbbbbbbbebbbebbbdbbbbbbbbbbbeeeeebebbebbebebbbeebbbbbbbbbbbbbbbbbbbbbc1Dkxebbbdbbb:GNbb",t=new Uint8Array([32,0,65,2,1,106,34,33,3,128,11,4,13,64,6,253,10,7,15,116,127,5,8,12,40,16,19,54,20,9,27,255,113,17,42,67,24,23,146,148,18,14,22,45,70,69,56,114,101,21,25,63,75,136,108,28,118,29,73,115]);if(typeof WebAssembly!="object")return{supported:!1};var a,s=WebAssembly.instantiate(n(e),{}).then(function(p){a=p.instance,a.exports.__wasm_call_ctors()});function n(p){for(var u=new Uint8Array(p.length),y=0;y<p.length;++y){var b=p.charCodeAt(y);u[y]=b>96?b-97:b>64?b-39:b+4}for(var m=0,y=0;y<p.length;++y)u[m++]=u[y]<60?t[u[y]]:(u[y]-60)*64+u[++y];return u.buffer.slice(0,m)}function r(p){if(!p)throw new Error("Assertion failed")}function i(p){return new Uint8Array(p.buffer,p.byteOffset,p.byteLength)}function o(p,u,y){var b=a.exports.sbrk,m=b(u.length*4),x=b(y*4),M=new Uint8Array(a.exports.memory.buffer),E=i(u);M.set(E,m);var T=p(x,m,u.length,y);M=new Uint8Array(a.exports.memory.buffer);var I=new Uint32Array(y);new Uint8Array(I.buffer).set(M.subarray(x,x+y*4)),E.set(M.subarray(m,m+u.length*4)),b(m-b(0));for(var A=0;A<u.length;++A)u[A]=I[u[A]];return[I,T]}function c(p){for(var u=0,y=0;y<p.length;++y){var b=p[y];u=u<b?b:u}return u}function l(p,u,y,b,m,x,M,E,T){var I=a.exports.sbrk,A=I(4),R=I(y*4),_=I(m*x),B=I(y*4),O=new Uint8Array(a.exports.memory.buffer);O.set(i(b),_),O.set(i(u),B);var F=p(R,B,y,_,m,x,M,E,T,A);O=new Uint8Array(a.exports.memory.buffer);var K=new Uint32Array(F);i(K).set(O.subarray(R,R+F*4));var $=new Float32Array(1);return i($).set(O.subarray(A,A+4)),I(A-I(0)),[K,$[0]]}function f(p,u,y,b,m,x,M,E,T,I,A,R,_){var B=a.exports.sbrk,O=B(4),F=B(y*4),K=B(m*x),$=B(m*E),ne=B(T.length*4),de=B(y*4),Ke=I?B(m):0,be=new Uint8Array(a.exports.memory.buffer);be.set(i(b),K),be.set(i(M),$),be.set(i(T),ne),be.set(i(u),de),I&&be.set(i(I),Ke);var Ve=p(F,de,y,K,m,x,$,E,ne,T.length,Ke,A,R,_,O);be=new Uint8Array(a.exports.memory.buffer);var Je=new Uint32Array(Ve);i(Je).set(be.subarray(F,F+Ve*4));var Re=new Float32Array(1);return i(Re).set(be.subarray(O,O+4)),B(O-B(0)),[Je,Re[0]]}function d(p,u,y,b){var m=a.exports.sbrk,x=m(y*b),M=new Uint8Array(a.exports.memory.buffer);M.set(i(u),x);var E=p(x,y,b);return m(x-m(0)),E}function h(p,u,y,b,m,x,M,E){var T=a.exports.sbrk,I=T(E*4),A=T(y*b),R=T(y*x),_=new Uint8Array(a.exports.memory.buffer);_.set(i(u),A),m&&_.set(i(m),R);var B=p(I,A,y,b,R,x,M,E);_=new Uint8Array(a.exports.memory.buffer);var O=new Uint32Array(B);return i(O).set(_.subarray(I,I+B*4)),T(I-T(0)),O}var g={LockBorder:1,Sparse:2,ErrorAbsolute:4,Prune:8,_InternalDebug:1<<30};return{ready:s,supported:!0,compactMesh:function(p){r(p instanceof Uint32Array||p instanceof Int32Array||p instanceof Uint16Array||p instanceof Int16Array),r(p.length%3==0);var u=p.BYTES_PER_ELEMENT==4?p:new Uint32Array(p);return o(a.exports.meshopt_optimizeVertexFetchRemap,u,c(p)+1)},simplify:function(p,u,y,b,m,x){r(p instanceof Uint32Array||p instanceof Int32Array||p instanceof Uint16Array||p instanceof Int16Array),r(p.length%3==0),r(u instanceof Float32Array),r(u.length%y==0),r(y>=3),r(b>=0&&b<=p.length),r(b%3==0),r(m>=0);for(var M=0,E=0;E<(x?x.length:0);++E)r(x[E]in g),M|=g[x[E]];var T=p.BYTES_PER_ELEMENT==4?p:new Uint32Array(p),I=l(a.exports.meshopt_simplify,T,p.length,u,u.length/y,y*4,b,m,M);return I[0]=p instanceof Uint32Array?I[0]:new p.constructor(I[0]),I},simplifyWithAttributes:function(p,u,y,b,m,x,M,E,T,I){r(p instanceof Uint32Array||p instanceof Int32Array||p instanceof Uint16Array||p instanceof Int16Array),r(p.length%3==0),r(u instanceof Float32Array),r(u.length%y==0),r(y>=3),r(b instanceof Float32Array),r(b.length%m==0),r(m>=0),r(M==null||M instanceof Uint8Array),r(M==null||M.length==u.length/y),r(E>=0&&E<=p.length),r(E%3==0),r(T>=0),r(Array.isArray(x)),r(m>=x.length),r(x.length<=32);for(var A=0;A<x.length;++A)r(x[A]>=0);for(var R=0,A=0;A<(I?I.length:0);++A)r(I[A]in g),R|=g[I[A]];var _=p.BYTES_PER_ELEMENT==4?p:new Uint32Array(p),B=f(a.exports.meshopt_simplifyWithAttributes,_,p.length,u,u.length/y,y*4,b,m*4,new Float32Array(x),M?new Uint8Array(M):null,E,T,R);return B[0]=p instanceof Uint32Array?B[0]:new p.constructor(B[0]),B},getScale:function(p,u){return r(p instanceof Float32Array),r(p.length%u==0),r(u>=3),d(a.exports.meshopt_simplifyScale,p,p.length/u,u*4)},simplifyPoints:function(p,u,y,b,m,x){return r(p instanceof Float32Array),r(p.length%u==0),r(u>=3),r(y>=0&&y<=p.length/u),b?(r(b instanceof Float32Array),r(b.length%m==0),r(m>=3),r(p.length/u==b.length/m),h(a.exports.meshopt_simplifyPoints,p,p.length/u,u*4,b,m*4,x,y)):h(a.exports.meshopt_simplifyPoints,p,p.length/u,u*4,void 0,0,0,y)}}})();var yE=(function(){var e="b9H79TebbbeVx9Geueu9Geub9Gbb9Giuuueu9Gmuuuuuuuuuuu9999eu9Gvuuuuueu9Gwuuuuuuuub9Gxuuuuuuuuuuuueu9Gkuuuuuuuuuu99eu9Gouuuuuub9Gruuuuuuub9GluuuubiOHdilvorwDqqkbiibeilve9Weiiviebeoweuec;G:Odkr:Yewo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bb8A9TW79O9V9Wt9F9I919P29K9nW79O2Wt79c9V919U9KbeX9TW79O9V9Wt9F9I919P29K9nW79O2Wt7bo39TW79O9V9Wt9F9J9V9T9W91tWJ2917tWV9c9V919U9K7br39TW79O9V9Wt9F9J9V9T9W91tW9nW79O2Wt9c9V919U9K7bDL9TW79O9V9Wt9F9V9Wt9P9T9P96W9nW79O2Wtbql79IV9RbkDwebcekdsPq;Q9BHdbkIbabaec9:fgefcufae9Ugeabci9Uadfcufad9Ugbaeab0Ek:w8KDPue99eux99dui99euo99iu8Jjjjjbc:WD9Rgm8KjjjjbdndnalmbcbhPxekamc:Cwfcbc;Kbz:njjjb8Adndnalcb9imbaoal9nmbamcuaocdtaocFFFFi0Egscbyd;y1jjbHjjjjbbgzBd:CwamceBd;8wamascbyd;y1jjbHjjjjbbgHBd:GwamcdBd;8wamcualcdtalcFFFFi0Ecbyd;y1jjbHjjjjbbgOBd:KwamciBd;8waihsalhAinazasydbcdtfcbBdbasclfhsaAcufgAmbkaihsalhAinazasydbcdtfgCaCydbcefBdbasclfhsaAcufgAmbkaihsalhCcbhXindnazasydbcdtgQfgAydbcb9imbaHaQfaXBdbaAaAydbgQcjjjj94VBdbaQaXfhXkasclfhsaCcufgCmbkalci9UhLdnalci6mbcbhsaihAinaAcwfydbhCaAclfydbhXaHaAydbcdtfgQaQydbgQcefBdbaOaQcdtfasBdbaHaXcdtfgXaXydbgXcefBdbaOaXcdtfasBdbaHaCcdtfgCaCydbgCcefBdbaOaCcdtfasBdbaAcxfhAaLascefgs9hmbkkaihsalhAindnazasydbcdtgCfgXydbgQcu9kmbaXaQcFFFFrGgQBdbaHaCfgCaCydbaQ9RBdbkasclfhsaAcufgAmbxdkkamcuaocdtgsaocFFFFi0EgAcbyd;y1jjbHjjjjbbgzBd:CwamceBd;8wamaAcbyd;y1jjbHjjjjbbgHBd:GwamcdBd;8wamcualcdtalcFFFFi0Ecbyd;y1jjbHjjjjbbgOBd:KwamciBd;8wazcbasz:njjjbhXalci9UhLaihsalhAinaXasydbcdtfgCaCydbcefBdbasclfhsaAcufgAmbkdnaoTmbcbhsaHhAaXhCaohQinaAasBdbaAclfhAaCydbasfhsaCclfhCaQcufgQmbkkdnalci6mbcbhsaihAinaAcwfydbhCaAclfydbhQaHaAydbcdtfgKaKydbgKcefBdbaOaKcdtfasBdbaHaQcdtfgQaQydbgQcefBdbaOaQcdtfasBdbaHaCcdtfgCaCydbgCcefBdbaOaCcdtfasBdbaAcxfhAaLascefgs9hmbkkaoTmbcbhsaohAinaHasfgCaCydbaXasfydb9RBdbasclfhsaAcufgAmbkkamaLcbyd;y1jjbHjjjjbbgsBd:OwamclBd;8wascbaLz:njjjbhYamcuaLcK2alcjjjjd0Ecbyd;y1jjbHjjjjbbg8ABd:SwamcvBd;8wJbbbbhEdnalci6g3mbarcd4hKaihAa8AhsaLhrJbbbbh5inavaAclfydbaK2cdtfgCIdlh8EavaAydbaK2cdtfgXIdlhEavaAcwfydbaK2cdtfgQIdlh8FaCIdwhaaXIdwhhaQIdwhgasaCIdbg8JaXIdbg8KMaQIdbg8LMJbbnn:vUdbasclfaXIdlaCIdlMaQIdlMJbbnn:vUdbaQIdwh8MaCIdwh8NaXIdwhyascxfa8EaE:tg8Eagah:tggNa8FaE:tg8Faaah:tgaN:tgEJbbbbJbbjZa8Ja8K:tg8Ja8FNa8La8K:tg8Ka8EN:tghahNaEaENaaa8KNaga8JN:tgEaENMM:rg8K:va8KJbbbb9BEg8ENUdbasczfaEa8ENUdbascCfaha8ENUdbascwfa8Maya8NMMJbbnn:vUdba5a8KMh5aAcxfhAascKfhsarcufgrmbka5aL:Z:vJbbbZNhEkamcuaLcdtalcFFFF970Ecbyd;y1jjbHjjjjbbgCBd:WwamcoBd;8waEaq:ZNhEdna3mbcbhsaChAinaAasBdbaAclfhAaLascefgs9hmbkkaE:rhhcuh8PamcuaLcltalcFFFFd0Ecbyd;y1jjbHjjjjbbgIBd:0wamcrBd;8wcbaIa8AaCaLz:djjjb8AJFFuuhyJFFuuh8RJFFuuh8Sdnalci6gXmbJFFuuh8Sa8AhsaLhAJFFuuh8RJFFuuhyinascwfIdbgEayayaE9EEhyasclfIdbgEa8Ra8RaE9EEh8RasIdbgEa8Sa8SaE9EEh8SascKfhsaAcufgAmbkkahJbbbZNhgamaocetgscuaocu9kEcbyd;y1jjbHjjjjbbgABd:4waAcFeasz:njjjbhCdnaXmbcbhAJFFuuhEa8Ahscuh8PinascwfIdbay:tghahNasIdba8S:tghahNasclfIdba8R:tghahNMM:rghaEa8PcuSahaE9DVgXEhEaAa8PaXEh8PascKfhsaLaAcefgA9hmbkkamczfcbcjwz:njjjb8Aamcwf9cb83ibam9cb83ibagaxNhRJbbjZak:th8Ncbh8UJbbbbh8VJbbbbh8WJbbbbh8XJbbbbh8YJbbbbh8ZJbbbbh80cbh81cbhPinJbbbbhEdna8UTmbJbbjZa8U:Z:vhEkJbbbbhhdna80a80Na8Ya8YNa8Za8ZNMMg8KJbbbb9BmbJbbjZa8K:r:vhhka8XaENh5a8WaENh8Fa8VaENhaa8PhQdndndndndna8UaPVTmbamydwgBTmea80ahNh8Ja8ZahNh8La8YahNh8Maeamydbcdtfh83cbh3JFFuuhEcvhXcuhQindnaza83a3cdtfydbcdtgsfydbgvTmbaOaHasfydbcdtfhAindndnaCaiaAydbgKcx2fgsclfydbgrcetf8Vebcs4aCasydbgLcetf8Vebcs4faCascwfydbglcetf8Vebcs4fgombcbhsxekcehsazaLcdtfydbgLceSmbcehsazarcdtfydbgrceSmbcehsazalcdtfydbglceSmbdnarcdSaLcdSfalcdSfcd6mbaocefhsxekaocdfhskdnasaX9kmba8AaKcK2fgLIdwa5:thhaLIdla8F:th8KaLIdbaa:th8EdndnakJbbbb9DTmba8E:lg8Ea8K:lg8Ka8Ea8K9EEg8Kah:lgha8Kah9EEag:vJbbjZMhhxekahahNa8Ea8ENa8Ka8KNMM:rag:va8NNJbbjZMJ9VO:d86JbbjZaLIdCa8JNaLIdxa8MNa8LaLIdzNMMakN:tghahJ9VO:d869DENhhkaKaQasaX6ahaE9DVgLEhQasaXaLEhXahaEaLEhEkaAclfhAavcufgvmbkka3cefg3aB9hmbkkaQcu9hmekama5Ud:ODama8FUd:KDamaaUd:GDamcuBd:qDamcFFF;7rBdjDaIcba8AaYamc:GDfakJbbbb9Damc:qDfamcjDfz:ejjjbamyd:qDhQdndnaxJbbbb9ETmba8UaD6mbaQcuSmeceh3amIdjDaR9EmixdkaQcu9hmekdna8UTmbdnamydlgza8Uci2fgsciGTmbadasfcba8Uazcu7fciGcefz:njjjb8AkabaPcltfgzam8Pib83dbazcwfamcwf8Pib83dbaPcefhPkc3hzinazc98Smvamc:Cwfazfydbcbyd;u1jjbH:bjjjbbazc98fhzxbkkcbh3a8Uaq9pmbamydwaCaiaQcx2fgsydbcetf8Vebcs4aCascwfydbcetf8Vebcs4faCasclfydbcetf8Vebcs4ffaw9nmekcbhscbhAdna81TmbcbhAamczfhXinamczfaAcdtfaXydbgLBdbaXclfhXaAaYaLfRbbTfhAa81cufg81mbkkamydwhlamydbhXam9cu83i:GDam9cu83i:ODam9cu83i:qDam9cu83i:yDaAc;8eaAclfc:bd6Eh81inamcjDfasfcFFF;7rBdbasclfgscz9hmbka81cdthBdnalTmbaeaXcdtfhocbhrindnazaoarcdtfydbcdtgsfydbgvTmbaOaHasfydbcdtfhAcuhLcuhsinazaiaAydbgKcx2fgXclfydbcdtfydbazaXydbcdtfydbfazaXcwfydbcdtfydbfgXasaXas6gXEhsaKaLaXEhLaAclfhAavcufgvmbkaLcuSmba8AaLcK2fgAIdway:tgEaENaAIdba8S:tgEaENaAIdla8R:tgEaENMM:rhEcbhAindndnasamc:qDfaAfgvydbgX6mbasaX9hmeaEamcjDfaAfIdb9FTmekavasBdbamc:GDfaAfaLBdbamcjDfaAfaEUdbxdkaAclfgAcz9hmbkkarcefgral9hmbkkamczfaBfhLcbhscbhAindnamc:GDfasfydbgXcuSmbaLaAcdtfaXBdbaAcefhAkasclfgscz9hmbkaAa81fg81TmbJFFuuhhcuhKamczfhsa81hvcuhLina8AasydbgXcK2fgAIdway:tgEaENaAIdba8S:tgEaENaAIdla8R:tgEaENMM:rhEdndnazaiaXcx2fgAclfydbcdtfydbazaAydbcdtfydbfazaAcwfydbcdtfydbfgAaL6mbaAaL9hmeaEah9DTmekaEhhaAhLaXhKkasclfhsavcufgvmbkaKcuSmbaKhQkdnamaiaQcx2fgrydbarclfydbarcwfydbaCabaeadaPawaqa3z:fjjjbTmbaPcefhPJbbbbh8VJbbbbh8WJbbbbh8XJbbbbh8YJbbbbh8ZJbbbbh80kcbhXinaOaHaraXcdtfydbcdtgAfydbcdtfgKhsazaAfgvydbgLhAdnaLTmbdninasydbaQSmeasclfhsaAcufgATmdxbkkasaKaLcdtfc98fydbBdbavavydbcufBdbkaXcefgXci9hmbka8AaQcK2fgsIdbhEasIdlhhasIdwh8KasIdxh8EasIdzh5asIdCh8FaYaQfce86bba80a8FMh80a8Za5Mh8Za8Ya8EMh8Ya8Xa8KMh8Xa8WahMh8Wa8VaEMh8Vamydxh8Uxbkkamc:WDf8KjjjjbaPk;Vvivuv99lu8Jjjjjbca9Rgv8Kjjjjbdndnalcw0mbaiydbhoaeabcitfgralcdtcufBdlaraoBdbdnalcd6mbaiclfhoalcufhwarcxfhrinaoydbhDarcuBdbarc98faDBdbarcwfhraoclfhoawcufgwmbkkalabfhrxekcbhDavczfcwfcbBdbav9cb83izavcwfcbBdbav9cb83ibJbbjZhqJbbjZhkinadaiaDcdtfydbcK2fhwcbhrinavczfarfgoawarfIdbgxaoIdbgm:tgPakNamMgmUdbavarfgoaPaxam:tNaoIdbMUdbarclfgrcx9hmbkJbbjZaqJbbjZMgq:vhkaDcefgDal9hmbkcbhoadcbcecdavIdlgxavIdwgm9GEgravIdbgPam9GEaraPax9GEgscdtgrfhzavczfarfIdbhxaihralhwinaiaocdtfgDydbhHaDarydbgOBdbaraHBdbarclfhraoazaOcK2fIdbax9Dfhoawcufgwmbkaeabcitfhrdndnaocv6mbaoalc98f6mekaraiydbBdbaralcdtcufBdlaiclfhoalcufhwarcxfhrinaoydbhDarcuBdbarc98faDBdbarcwfhraoclfhoawcufgwmbkalabfhrxekaraxUdbararydlc98GasVBdlabcefaeadaiaoz:djjjbhwararydlciGawabcu7fcdtVBdlawaeadaiaocdtfalao9Rz:djjjbhrkavcaf8Kjjjjbark:;idiud99dndnabaecitfgwydlgDciGgqciSmbinabcbaDcd4gDalaqcdtfIdbawIdb:tgkJbbbb9FEgwaecefgefadaialavaoarz:ejjjbak:larIdb9FTmdabawaD7aefgecitfgwydlgDciGgqci9hmbkkabaecitfgeclfhbdnavmbcuhwindnaiaeydbgDfRbbmbadaDcK2fgqIdwalIdw:tgkakNaqIdbalIdb:tgkakNaqIdlalIdl:tgkakNMM:rgkarIdb9DTmbarakUdbaoaDBdbkaecwfheawcefgwabydbcd46mbxdkkcuhwindnaiaeydbgDfRbbmbadaDcK2fgqIdbalIdb:t:lgkaqIdlalIdl:t:lgxakax9EEgkaqIdwalIdw:t:lgxakax9EEgkarIdb9DTmbarakUdbaoaDBdbkaecwfheawcefgwabydbcd46mbkkk;llevudnabydwgxaladcetfgm8Vebcs4alaecetfgP8Vebgscs4falaicetfgz8Vebcs4ffaD0abydxaq9pVakVgDce9hmbavawcltfgxab8Pdb83dbaxcwfabcwfgx8Pdb83dbdnaxydbgqTmbaoabydbcdtfhxaqhsinalaxydbcetfcFFi87ebaxclfhxascufgsmbkkdnabydxglci2gsabydlgxfgkciGTmbarakfcbalaxcu7fciGcefz:njjjb8Aabydxci2hsabydlhxabydwhqkab9cb83dwababydbaqfBdbabascifc98GaxfBdlaP8Vebhscbhxkdnascztcz91cu9kmbabaxcefBdwaPax87ebaoabydbcdtfaxcdtfaeBdbkdnam8Uebcu9kmbababydwgxcefBdwamax87ebaoabydbcdtfaxcdtfadBdbkdnaz8Uebcu9kmbababydwgxcefBdwazax87ebaoabydbcdtfaxcdtfaiBdbkarabydlfabydxci2faPRbb86bbarabydlfabydxci2fcefamRbb86bbarabydlfabydxci2fcdfazRbb86bbababydxcefBdxaDk8LbabaeadaialavaoarawaDaDaqJbbbbz:cjjjbk;Nkovud99euv99eul998Jjjjjbc:W;ae9Rgo8KjjjjbdndnadTmbavcd4hrcbhwcbhDindnaiaeclfydbar2cdtfgvIdbaiaeydbar2cdtfgqIdbgk:tgxaiaecwfydbar2cdtfgmIdlaqIdlgP:tgsNamIdbak:tgzavIdlaP:tgPN:tgkakNaPamIdwaqIdwgH:tgONasavIdwaH:tgHN:tgPaPNaHazNaOaxN:tgxaxNMM:rgsJbbbb9Bmbaoc:W:qefawcx2fgAakas:vUdwaAaxas:vUdlaAaPas:vUdbaoc8Wfawc8K2fgAaq8Pdb83dbaAav8Pdb83dxaAam8Pdb83dKaAcwfaqcwfydbBdbaAcCfavcwfydbBdbaAcafamcwfydbBdbawcefhwkaecxfheaDcifgDad6mbkab9cb83dbabcyf9cb83dbabcaf9cb83dbabcKf9cb83dbabczf9cb83dbabcwf9cb83dbawTmeaocbBd8Sao9cb83iKao9cb83izaoczfaoc8Wfawci2cxaoc8Sfcbcrz1jjjbaoIdKhCaoIdChXaoIdzhQao9cb83iwao9cb83ibaoaoc:W:qefawcxaoc8Sfcbciz1jjjbJbbjZhkaoIdwgPJbbbbJbbjZaPaPNaoIdbgPaPNaoIdlgsasNMM:rgx:vaxJbbbb9BEgzNhxasazNhsaPazNhzaoc:W:qefheawhvinaecwfIdbaxNaeIdbazNasaeclfIdbNMMgPakaPak9DEhkaecxfheavcufgvmbkabaCUdwabaXUdlabaQUdbabaoId3UdxdndnakJ;n;m;m899FmbJbbbbhPaoc:W:qefheaoc8WfhvinaCavcwfIdb:taecwfIdbgHNaQavIdb:taeIdbgONaXavclfIdb:taeclfIdbgLNMMaxaHNazaONasaLNMM:vgHaPaHaP9EEhPavc8KfhvaecxfheawcufgwmbkabaxUd8KabasUdaabazUd3abaCaxaPN:tUdKabaXasaPN:tUdCabaQazaPN:tUdzabJbbjZakakN:t:rgkUdydndnaxJbbj:;axJbbj:;9GEgPJbbjZaPJbbjZ9FEJbb;:9cNJbbbZJbbb:;axJbbbb9GEMgP:lJbbb9p9DTmbaP:Ohexekcjjjj94hekabae86b8UdndnasJbbj:;asJbbj:;9GEgPJbbjZaPJbbjZ9FEJbb;:9cNJbbbZJbbb:;asJbbbb9GEMgP:lJbbb9p9DTmbaP:Ohvxekcjjjj94hvkabav86bRdndnazJbbj:;azJbbj:;9GEgPJbbjZaPJbbjZ9FEJbb;:9cNJbbbZJbbb:;azJbbbb9GEMgP:lJbbb9p9DTmbaP:Ohqxekcjjjj94hqkabaq86b8SdndnaecKtcK91:YJbb;:9c:vax:t:lavcKtcK91:YJbb;:9c:vas:t:laqcKtcK91:YJbb;:9c:vaz:t:lakMMMJbb;:9cNJbbjZMgk:lJbbb9p9DTmbak:Ohexekcjjjj94hekaecFbaecFb9iEhexekabcjjj;8iBdycFbhekabae86b8Vxekab9cb83dbabcyf9cb83dbabcaf9cb83dbabcKf9cb83dbabczf9cb83dbabcwf9cb83dbkaoc:W;aef8Kjjjjbk;Iwwvul99iud99eue99eul998Jjjjjbcje9Rgr8Kjjjjbavcd4hwaicd4hDdndnaoTmbarc;abfcbaocdtgvz:njjjb8Aarc;Gbfcbavz:njjjb8AarhvarcafhiaohqinavcFFF97BdbaicFFF;7rBdbaiclfhiavclfhvaqcufgqmbkdnadTmbcbhkinaeakaD2cdtfgvIdwhxavIdlhmavIdbhPalakaw2cdtfIdbhsarc;abfhzarhiarc;GbfhHarcafhqcj1jjbhvaohOinasavcwfIdbaxNavIdbaPNavclfIdbamNMMgAMhCakhXdnaAas:tgAaqIdbgQ9DgLmbaHydbhXkaHaXBdbakhXdnaCaiIdbgK9EmbazydbhXaKhCkazaXBdbaiaCUdbaqaAaQaLEUdbavcxfhvaqclfhqaHclfhHaiclfhiazclfhzaOcufgOmbkakcefgkad9hmbkkadThkJbbbbhCcbhXarc;abfhvarc;Gbfhicbhqinalavydbgzaw2cdtfIdbalaiydbgHaw2cdtfIdbaeazaD2cdtfgzIdwaeaHaD2cdtfgHIdw:tgsasNazIdbaHIdb:tgsasNazIdlaHIdl:tgsasNMM:rMMgsaCasaC9EgzEhCaqaXazEhXaiclfhiavclfhvaoaqcefgq9hmbkaCJbbbZNhKxekadThkcbhXJbbbbhKkJbbbbhCdnaearc;abfaXcdtgifydbgqaD2cdtfgvIdwaearc;GbfaifydbgzaD2cdtfgiIdwgm:tgsasNavIdbaiIdbgY:tgAaANavIdlaiIdlgP:tgQaQNMM:rgxJbbbb9ETmbaxalaqaw2cdtfIdbMalazaw2cdtfIdb:taxaxM:vhCkasaCNamMhmaQaCNaPMhPaAaCNaYMhYdnakmbaDcdthvawcdthiindnalIdbg8AaecwfIdbam:tgCaCNaeIdbaY:tgsasNaeclfIdbaP:tgAaANMM:rgQMgEaK9ETmbJbbbbhxdnaQJbbbb9ETmbaEaK:taQaQM:vhxkaxaCNamMhmaxaANaPMhPaxasNaYMhYa8AaKaQMMJbbbZNhKkaeavfhealaifhladcufgdmbkkabaKUdxabamUdwabaPUdlabaYUdbarcjef8Kjjjjbkjeeiu8Jjjjjbcj8W9Rgr8Kjjjjbaici2hwdnaiTmbawceawce0EhDarhiinaiaeadRbbcdtfydbBdbadcefhdaiclfhiaDcufgDmbkkabarawaladaoz:hjjjbarcj8Wf8Kjjjjbk:3lequ8JjjjjbcjP9Rgl8Kjjjjbcbhvalcjxfcbaiz:njjjb8AdndnadTmbcjehoaehrincuhwarhDcuhqavhkdninawakaoalcjxfaDcefRbbfRbb9RcFeGci6aoalcjxfaDRbbfRbb9RcFeGci6faoalcjxfaDcdfRbbfRbb9RcFeGci6fgxaq9mgmEhwdnammbaxce0mdkaxaqaxaq9kEhqaDcifhDadakcefgk9hmbkkaeawci2fgDcdfRbbhqaDcefRbbhxaDRbbhkaeavci2fgDcifaDawav9Rci2z:qjjjb8Aakalcjxffaocefgo86bbaxalcjxffao86bbaDcdfaq86bbaDcefax86bbaDak86bbaqalcjxffao86bbarcifhravcefgvad9hmbkalcFeaicetz:njjjbhoadci2gDceaDce0EhqcbhxindnaoaeRbbgkcetfgw8UebgDcu9kmbawax87ebaocjlfaxcdtfabakcdtfydbBdbaxhDaxcefhxkaeaD86bbaecefheaqcufgqmbkaxcdthDxekcbhDkabalcjlfaDz:mjjjb8AalcjPf8Kjjjjbk9teiucbcbyd;C1jjbgeabcifc98GfgbBd;C1jjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik;teeeudndnaeabVciGTmbabhixekdndnadcz9pmbabhixekabhiinaiaeydbBdbaiaeydlBdlaiaeydwBdwaiaeydxBdxaeczfheaiczfhiadc9Wfgdcs0mbkkadcl6mbinaiaeydbBdbaeclfheaiclfhiadc98fgdci0mbkkdnadTmbinaiaeRbb86bbaicefhiaecefheadcufgdmbkkabk:3eedudndnabciGTmbabhixekaecFeGc:b:c:ew2hldndnadcz9pmbabhixekabhiinaialBdxaialBdwaialBdlaialBdbaiczfhiadc9Wfgdcs0mbkkadcl6mbinaialBdbaiclfhiadc98fgdci0mbkkdnadTmbinaiae86bbaicefhiadcufgdmbkkabk9teiucbcbyd;C1jjbgeabcrfc94GfgbBd;C1jjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik9:eiuZbhedndncbyd;C1jjbgdaecztgi9nmbcuheadai9RcFFifcz4nbcuSmekadhekcbabae9Rcifc98Gcbyd;C1jjbfgdBd;C1jjbdnadZbcztge9nmbadae9RcFFifcz4nb8Akk:;Deludndndnadch9pmbabaeSmdaeabadfgi9Rcbadcet9R0mekabaead;8qbbxekaeab7ciGhldndndnabae9pmbdnalTmbadhvabhixikdnabciGmbadhvabhixdkadTmiabaeRbb86bbadcufhvdnabcefgiciGmbaecefhexdkavTmiabaeRbe86beadc9:fhvdnabcdfgiciGmbaecdfhexdkavTmiabaeRbd86bdadc99fhvdnabcifgiciGmbaecifhexdkavTmiabaeRbi86biabclfhiaeclfheadc98fhvxekdnalmbdnaiciGTmbadTmlabadcufgifglaeaifRbb86bbdnalciGmbaihdxekaiTmlabadc9:fgifglaeaifRbb86bbdnalciGmbaihdxekaiTmlabadc99fgifglaeaifRbb86bbdnalciGmbaihdxekaiTmlabadc98fgdfaeadfRbb86bbkadcl6mbdnadc98fgocd4cefciGgiTmbaec98fhlabc98fhvinavadfaladfydbBdbadc98fhdaicufgimbkkaocx6mbaec9Wfhvabc9WfhoinaoadfgicxfavadfglcxfydbBdbaicwfalcwfydbBdbaiclfalclfydbBdbaialydbBdbadc9Wfgdci0mbkkadTmdadhidnadciGglTmbaecufhvabcufhoadhiinaoaifavaifRbb86bbaicufhialcufglmbkkadcl6mdaec98fhlabc98fhvinavaifgecifalaifgdcifRbb86bbaecdfadcdfRbb86bbaecefadcefRbb86bbaeadRbb86bbaic98fgimbxikkavcl6mbdnavc98fglcd4cefcrGgdTmbavadcdt9RhvinaiaeydbBdbaeclfheaiclfhiadcufgdmbkkalc36mbinaiaeydbBdbaiaeydlBdlaiaeydwBdwaiaeydxBdxaiaeydzBdzaiaeydCBdCaiaeydKBdKaiaeyd3Bd3aecafheaicafhiavc9Gfgvci0mbkkavTmbdndnavcrGgdmbavhlxekavc94GhlinaiaeRbb86bbaicefhiaecefheadcufgdmbkkavcw6mbinaiaeRbb86bbaiaeRbe86beaiaeRbd86bdaiaeRbi86biaiaeRbl86blaiaeRbv86bvaiaeRbo86boaiaeRbr86braicwfhiaecwfhealc94fglmbkkabkk9Tdbcjwk9ubbjZbbbbbbbbbbbbbbjZbbbbbbbbbbbbbbjZ86;nAZ86;nAZ86;nAZ86;nA:;86;nAZ86;nAZ86;nAZ86;nA:;86;nAZ86;nAZ86;nAZ86;nA:;bc;uwkxebbbdbbb9GNbb",t=new Uint8Array([32,0,65,2,1,106,34,33,3,128,11,4,13,64,6,253,10,7,15,116,127,5,8,12,40,16,19,54,20,9,27,255,113,17,42,67,24,23,146,148,18,14,22,45,70,69,56,114,101,21,25,63,75,136,108,28,118,29,73,115]);if(typeof WebAssembly!="object")return{supported:!1};var a,s=WebAssembly.instantiate(n(e),{}).then(function(p){a=p.instance,a.exports.__wasm_call_ctors()});function n(p){for(var u=new Uint8Array(p.length),y=0;y<p.length;++y){var b=p.charCodeAt(y);u[y]=b>96?b-97:b>64?b-39:b+4}for(var m=0,y=0;y<p.length;++y)u[m++]=u[y]<60?t[u[y]]:(u[y]-60)*64+u[++y];return u.buffer.slice(0,m)}function r(p){if(!p)throw new Error("Assertion failed")}function i(p){return new Uint8Array(p.buffer,p.byteOffset,p.byteLength)}var o=48,c=16;function l(p,u){var y=p.meshlets[u*4+0],b=p.meshlets[u*4+1],m=p.meshlets[u*4+2],x=p.meshlets[u*4+3];return{vertices:p.vertices.subarray(y,y+m),triangles:p.triangles.subarray(b,b+x*3)}}function f(p,u,y,b,m,x,M){var E=a.exports.sbrk,T=a.exports.meshopt_buildMeshletsBound(p.length,m,x),I=E(T*c),A=E(T*m*4),R=E(T*x*3),_=E(p.byteLength),B=E(u.byteLength),O=new Uint8Array(a.exports.memory.buffer);O.set(i(p),_),O.set(i(u),B);var F=a.exports.meshopt_buildMeshlets(I,A,R,_,p.length,B,y,b,m,x,M);O=new Uint8Array(a.exports.memory.buffer);for(var K=O.subarray(I,I+F*c),$=new Uint32Array(K.buffer,K.byteOffset,K.byteLength/4).slice(),ne=0;ne<F;++ne){var de=$[ne*4+0],Ke=$[ne*4+1],y=$[ne*4+2],be=$[ne*4+3];a.exports.meshopt_optimizeMeshlet(A+de*4,R+Ke,be,y)}var Ve=$[(F-1)*4+0],Je=$[(F-1)*4+1],Re=$[(F-1)*4+2],it=$[(F-1)*4+3],Qe=Ve+Re,Tt=Je+(it*3+3&-4),ma={meshlets:$,vertices:new Uint32Array(O.buffer,A,Qe).slice(),triangles:new Uint8Array(O.buffer,R,Tt*3).slice(),meshletCount:F};return E(I-E(0)),ma}function d(p){var u=new Float32Array(a.exports.memory.buffer,p,o/4);return{centerX:u[0],centerY:u[1],centerZ:u[2],radius:u[3],coneApexX:u[4],coneApexY:u[5],coneApexZ:u[6],coneAxisX:u[7],coneAxisY:u[8],coneAxisZ:u[9],coneCutoff:u[10]}}function h(p,u,y,b){var m=a.exports.sbrk,x=[],M=m(u.byteLength),E=m(p.vertices.byteLength),T=m(p.triangles.byteLength),I=m(o),A=new Uint8Array(a.exports.memory.buffer);A.set(i(u),M),A.set(i(p.vertices),E),A.set(i(p.triangles),T);for(var R=0;R<p.meshletCount;++R){var _=p.meshlets[R*4+0],B=p.meshlets[R*4+0+1],O=p.meshlets[R*4+0+3];a.exports.meshopt_computeMeshletBounds(I,E+_*4,T+B,O,M,y,b),x.push(d(I))}return m(M-m(0)),x}function g(p,u,y,b){var m=a.exports.sbrk,x=m(o),M=m(p.byteLength),E=m(u.byteLength),T=new Uint8Array(a.exports.memory.buffer);T.set(i(p),M),T.set(i(u),E),a.exports.meshopt_computeClusterBounds(x,M,p.length,E,y,b);var I=d(x);return m(x-m(0)),I}return{ready:s,supported:!0,buildMeshlets:function(p,u,y,b,m,x){r(p.length%3==0),r(u instanceof Float32Array),r(u.length%y==0),r(y>=3),r(b<=256||b>0),r(m<=512),r(m%4==0),x=x||0;var M=p.BYTES_PER_ELEMENT==4?p:new Uint32Array(p);return f(M,u,u.length/y,y*4,b,m,x)},computeClusterBounds:function(p,u,y){r(p.length%3==0),r(p.length/3<=512),r(u instanceof Float32Array),r(u.length%y==0),r(y>=3);var b=p.BYTES_PER_ELEMENT==4?p:new Uint32Array(p);return g(b,u,u.length/y,y*4)},computeMeshletBounds:function(p,u,y){return r(p.meshletCount!=0),r(u instanceof Float32Array),r(u.length%y==0),r(y>=3),h(p,u,u.length/y,y*4)},extractMeshlet:function(p,u){return r(u>=0&&u<p.meshletCount),l(p,u)}}})();var vl=new Xc().registerExtensions([ii,oi,ci]).registerDependencies({"meshopt.decoder":un});async function Ya(e,t={}){await un.ready;let a;if(t.fetchBytes)a=new Uint8Array(await t.fetchBytes(e));else{let c=await fetch(e,{cache:t.fetchCache||"no-store"});if(!c.ok)throw new Error(`Failed to load ${e}: ${c.status}`);a=new Uint8Array(await c.arrayBuffer())}let s=await vl.readBinary(a),n=[],r=t.componentFeatures||new Map,i=new Map;function o(c,l=""){let f=r.has(c.getName());f&&i.set(c.getName(),(i.get(c.getName())||0)+1);let d=f?c.getName():l,h=c.getMesh();if(h){let g=c.getWorldMatrix();for(let p of h.listPrimitives()){let u=p.getAttribute("POSITION"),y=p.getAttribute("NORMAL"),b=p.getAttribute("_FEATURE_ID_0"),m=p.getAttribute("_FEATURE_ID_1"),x=p.getIndices()?.getArray();if(!u||!x)continue;let M=u.getCount(),E=new Float32Array(M*3),T=new Float32Array(M*3),I=new Uint32Array(M),A=new Uint32Array(M),R=[1/0,1/0,1/0,-1/0,-1/0,-1/0],_=[],B=r.get(d)?.featureId||t.defaultFeatureId||0;for(let F=0;F<M;F+=1)u.getElement(F,_),uy(E,F*3,_,g),R[0]=Math.min(R[0],E[F*3]),R[1]=Math.min(R[1],E[F*3+1]),R[2]=Math.min(R[2],E[F*3+2]),R[3]=Math.max(R[3],E[F*3]),R[4]=Math.max(R[4],E[F*3+1]),R[5]=Math.max(R[5],E[F*3+2]),y?(y.getElement(F,_),fy(T,F*3,_,g)):T.set([0,0,1],F*3),I[F]=Number(b?.getScalar(F)||0),A[F]=Number(m?m.getScalar(F)||0:B);let O=p.getMaterial();n.push({position:E,normal:T,netId:I,objectFeatureId:A,indices:x,designator:d,nodeName:c.getName(),meshName:h.getName(),bounds:R,material:O?{name:O.getName(),baseColor:O.getBaseColorFactor(),metallic:O.getMetallicFactor(),roughness:O.getRoughnessFactor(),emissive:O.getEmissiveFactor()}:{baseColor:t.baseColor||[.55,.58,.64,1],metallic:.05,roughness:.72,emissive:[0,0,0]}})}}for(let g of c.listChildren())o(g,d)}for(let c of s.getRoot().listScenes())for(let l of c.listChildren())o(l);return{byteLength:a.byteLength,primitives:n,componentNodeCounts:i}}function uy(e,t,a,s){let n=s[0]*a[0]+s[4]*a[1]+s[8]*a[2]+s[12],r=s[1]*a[0]+s[5]*a[1]+s[9]*a[2]+s[13],i=s[2]*a[0]+s[6]*a[1]+s[10]*a[2]+s[14];e[t]=n,e[t+1]=-i,e[t+2]=r}function fy(e,t,a,s){let n=s[0]*a[0]+s[4]*a[1]+s[8]*a[2],r=s[1]*a[0]+s[5]*a[1]+s[9]*a[2],i=s[2]*a[0]+s[6]*a[1]+s[10]*a[2],o=Math.hypot(n,r,i)||1;e[t]=n/o,e[t+1]=-i/o,e[t+2]=r/o}async function wl(e,t={}){await un.ready;let a;if(t.fetchBytes)a=new Uint8Array(await t.fetchBytes(e));else{let d=await fetch(e,{cache:t.fetchCache||"no-store"});if(!d.ok)throw new Error(`Failed to load ${e}: ${d.status}`);a=new Uint8Array(await d.arrayBuffer())}let s=await vl.readBinary(a),n=t.componentFeatures||new Map,r=new Map,i=new Map,o=new Map,c=0;function l(d){if(o.has(d))return o.get(d);let h=d.getAttribute("POSITION"),g=d.getIndices()?.getArray();if(!h||!g)return o.set(d,null),null;let p=d.getAttribute("NORMAL"),u=d.getAttribute("_FEATURE_ID_0"),y=d.getAttribute("_FEATURE_ID_1"),b=h.getCount(),m=new Float32Array(b*3),x=new Float32Array(b*3),M=new Uint32Array(b),E=new Uint32Array(b),T=[];for(let B=0;B<b;B+=1)h.getElement(B,T),m.set(T.slice(0,3),B*3),p?(p.getElement(B,T),x.set(T.slice(0,3),B*3)):x.set([0,1,0],B*3),M[B]=Number(u?.getScalar(B)||0),E[B]=Number(y?.getScalar(B)||0);let I=py(d.getMaterial(),t),A=[$a(m),$a(x),$a(M),$a(E),$a(g),b,g.length,JSON.stringify(I)].join(":"),R=i.get(A),_=R;return(!R||!gy(R.primitive,m,x,M,E,g))&&(_={primitive:{position:m,normal:x,netId:M,objectFeatureId:E,indices:Uint32Array.from(g),material:I,bounds:null},placements:[]},i.set(R?`${A}:${i.size}`:A,_)),o.set(d,_),_}function f(d,h=""){let g=n.has(d.getName());g&&r.set(d.getName(),(r.get(d.getName())||0)+1);let p=g?d.getName():h,u=d.getMesh();if(u){let y=hy(d.getWorldMatrix()),b=Number(n.get(p)?.featureId||t.defaultFeatureId||0),m=c++;for(let x of u.listPrimitives()){let M=l(x);if(!M)continue;let E=by(M.primitive.position,y);M.placements.push({rows:y,featureId:b,designator:p,bounds:E,node:m});let T=M.primitive.bounds;M.primitive.bounds=T?[Math.min(T[0],E[0]),Math.min(T[1],E[1]),Math.min(T[2],E[2]),Math.max(T[3],E[3]),Math.max(T[4],E[4]),Math.max(T[5],E[5])]:[...E]}}for(let y of d.listChildren())f(y,p)}for(let d of s.getRoot().listScenes())for(let h of d.listChildren())f(h);return{byteLength:a.byteLength,models:[...i.values()],componentNodeCounts:r}}function hy(e){return[e[0],e[4],e[8],e[12],-e[2],-e[6],-e[10],-e[14],e[1],e[5],e[9],e[13]]}function by(e,t){let a=[1/0,1/0,1/0,-1/0,-1/0,-1/0];for(let s=0;s<e.length;s+=3){let n=e[s],r=e[s+1],i=e[s+2];for(let o=0;o<3;o+=1){let c=o*4,l=t[c]*n+t[c+1]*r+t[c+2]*i+t[c+3];l<a[o]&&(a[o]=l),l>a[o+3]&&(a[o+3]=l)}}return a}function py(e,t){return e?{name:e.getName(),baseColor:e.getBaseColorFactor(),metallic:e.getMetallicFactor(),roughness:e.getRoughnessFactor(),emissive:e.getEmissiveFactor()}:{baseColor:t.baseColor||[.55,.58,.64,1],metallic:.05,roughness:.72,emissive:[0,0,0]}}function $a(e){let t=e.BYTES_PER_ELEMENT===4?new Uint32Array(e.buffer,e.byteOffset,e.length):e,a=2166136261;for(let s=0;s<t.length;s+=1)a^=t[s],a=Math.imul(a,16777619)>>>0;return a.toString(36)}function gy(e,t,a,s,n,r){let i=(o,c)=>o.length===c.length&&o.every((l,f)=>l===c[f]);return i(e.position,t)&&i(e.normal,a)&&i(e.netId,s)&&i(e.objectFeatureId,n)&&i(e.indices,r)}var na=Object.freeze({mm:1,fineMm:.1,deg:15,fineDeg:1}),li=Object.freeze([[1,0,0],[0,1,0],[0,0,1]]);function Ml(e){return Math.round(e*1e9)/1e9+0}function Xt(e){let t=Math.hypot(...e.rotation)||1,a=e.rotation.map(n=>n/t),s=[a[3],a[0],a[1],a[2]].find(n=>Math.abs(n)>1e-12)??1;return{translationMm:e.translationMm.map(Ml),rotation:a.map(n=>Ml(s<0?-n:n))}}function my(e){let[t,a,s,n]=e.rotation,[r,i,o]=e.translationMm;return[1-2*(a*a+s*s),2*(t*a+s*n),2*(t*s-a*n),0,2*(t*a-s*n),1-2*(t*t+s*s),2*(a*s+t*n),0,2*(t*s+a*n),2*(a*s-t*n),1-2*(t*t+a*a),0,r,i,o,1]}function kl(e,t){let a=new Array(16);for(let s=0;s<4;s+=1)for(let n=0;n<4;n+=1)a[s*4+n]=e[n]*t[s*4]+e[4+n]*t[s*4+1]+e[8+n]*t[s*4+2]+e[12+n]*t[s*4+3];return a}function yy(e){let t=[e[0],e[4],e[8],0,e[1],e[5],e[9],0,e[2],e[6],e[10],0,0,0,0,1];for(let a=0;a<3;a+=1)t[12+a]=-(t[a]*e[12]+t[4+a]*e[13]+t[8+a]*e[14]);return t}function fn(e,t){return t>0?Math.round(e/t)*t:e}function di(e,t){let a=t[0]**2+t[1]**2;return a<1e-9?0:(e[0]*t[0]+e[1]*t[1])/a}function El(e,t,a){let s=Math.atan2(t[1]-e[1],t[0]-e[0]),r=Math.atan2(a[1]-e[1],a[0]-e[0])-s;for(;r>Math.PI;)r-=2*Math.PI;for(;r<-Math.PI;)r+=2*Math.PI;return r}function Tl(e,t,a){return Ze(e,t)>=0?-a:a}function Sl(e){return li.map(t=>Ur(e.rotation,t))}function Il(e,t,a){return{translationMm:e.translationMm.map((s,n)=>s+t[n]*a),rotation:[...e.rotation]}}function Al(e,t,a,s){let n=Qo(t,a),r=e.translationMm.map((o,c)=>o-s[c]);return{translationMm:Ur(n,r).map((o,c)=>o+s[c]),rotation:Gs(n,e.rotation)}}function Rl(e,t){if(t==null)return null;let a=`/${String(t).split("/")[1]||""}`;return(e?.occurrences||[]).find(s=>s.path===a&&s.depth===1)??null}function _l(e,t,a){let s=e.occurrences.find(o=>o.path===t);if(!s||s.depth!==1)return e;let n=my(a),r=kl(n,yy(s.worldMatrix)),i=`${t}/`;return{...e,occurrences:e.occurrences.map(o=>o.path===t?{...o,pose:{...Xt(a),source:"manual"},worldMatrix:n}:o.path.startsWith(i)?{...o,worldMatrix:kl(r,o.worldMatrix)}:o)}}function Nl(e){let t=Math.abs(e[0])<.9?[1,0,0]:[0,1,0];return He(qe(e,t))}var xy=Object.freeze([0,1,1,0]),Ja=`
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
`,Wt=Object.freeze([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function vy(e){let t=e?.matrix??e;if(!t||typeof t.length!="number"||t.length!==16)throw new TypeError("An occurrence matrix must have 16 numbers (column-major)");let a=Array.from(t,Number);if(!a.every(Number.isFinite))throw new TypeError("An occurrence matrix must be finite");if(a[3]!==0||a[7]!==0||a[11]!==0||a[15]!==1)throw new TypeError("An occurrence matrix must be affine (last row 0 0 0 1)");return a}function wy(e){let[t,a,s,,n,r,i,,o,c,l]=e,f=r*l-c*i,d=c*s-a*l,h=a*i-r*s,g=o*i-n*l,p=t*l-o*s,u=n*s-t*i,y=n*c-o*r,b=o*a-t*c,m=t*r-n*a,x=t*f+n*d+o*h;if(x===0)throw new TypeError("An occurrence matrix must be invertible");let M=x<0?-1:1;return[M*f,M*g,M*y,0,M*d,M*p,M*b,0,M*h,M*u,M*m,0,0,0,0,1]}function My(e){let t=new Uint32Array(4);for(let a of e||[]){let s=Number(a);!Number.isInteger(s)||s<0||s>=128||(t[s>>>5]|=1<<(s&31)>>>0)}return t}function hn(e,t=[],a=[]){let s=new Float32Array(Math.max(1,e.length)*40),n=new Uint32Array(s.buffer);return e.forEach((r,i)=>{let o=i*40;s.set(r,o),s.set(wy(r),o+16),t[i]&&n.set(My(t[i]),o+32),s.set(a[i]||xy,o+36)}),s}function bn(e,t){let[a,s,n]=t;return[e[0]*a+e[4]*s+e[8]*n+e[12],e[1]*a+e[5]*s+e[9]*n+e[13],e[2]*a+e[6]*s+e[10]*n+e[14]]}function yt(e,t){if(!t)return null;let a=[1/0,1/0,1/0,-1/0,-1/0,-1/0];for(let s=0;s<8;s+=1){let n=bn(e,[t[s&1?3:0],t[s&2?4:1],t[s&4?5:2]]);for(let r=0;r<3;r+=1)a[r]=Math.min(a[r],n[r]),a[r+3]=Math.max(a[r+3],n[r])}return a}function pn(e){return e.every((t,a)=>t===Wt[a])}var ky=0,Ey=4294901759;function Bl(e,t){let a=e>>>0,s=t>>>0;return a===ky?{kind:"none",occurrenceIndex:-1,featureId:0}:{kind:s?"feature":"board",occurrenceIndex:a-1,featureId:s}}function Cl(e){let t=Array.from(e);if(t.length>Ey)throw new RangeError("Too many occurrences for the pick target");let a=t.map(vy),s=o=>o&&!Array.isArray(o)&&!ArrayBuffer.isView(o),n=t.map((o,c)=>s(o)&&o.key!=null?String(o.key):String(c));if(new Set(n).size!==n.length)throw new TypeError("Occurrence keys must be unique");let r=t.map(o=>s(o)&&o.hiddenLayers?[...o.hiddenLayers].map(Number):[]),i=t.map(o=>s(o)&&o.explode?[...o.explode].map(Number):null);return{matrices:a,keys:n,hiddenLayers:r,explode:i}}function Qa(e,t,a){let[s,n,r]=t,i=e[0]*s+e[4]*n+e[8]*r+e[12],o=e[1]*s+e[5]*n+e[9]*r+e[13],c=e[2]*s+e[6]*n+e[10]*r+e[14],l=e[3]*s+e[7]*n+e[11]*r+e[15];return!(l>0)||c<0||c>l?null:{x:a.x+(i/l*.5+.5)*a.width,y:a.y+(.5-o/l*.5)*a.height}}var gn=0;var Fl=3,ui=4,NE=Object.freeze(["full","board","body","box"]),at=Object.freeze({fullPx:140,boardPx:70,boxPx:18,keep:.8});function wa(e={}){let t=(i,o)=>Number.isFinite(Number(e[i]))?Math.max(0,Number(e[i])):o,a=t("boxPx",at.boxPx),s=Math.max(a,t("boardPx",at.boardPx)),n=Math.max(s,t("fullPx",at.fullPx)),r=Math.min(1,Math.max(.05,t("keep",at.keep)));return{fullPx:n,boardPx:s,boxPx:a,keep:r}}function Ol(e){let t=c=>[e[c],e[4+c],e[8+c],e[12+c]],[a,s,n,r]=[t(0),t(1),t(2),t(3)],i=(c,l)=>c.map((f,d)=>f+l[d]),o=(c,l)=>c.map((f,d)=>f-l[d]);return[i(r,a),o(r,a),i(r,s),o(r,s),n,o(r,n)]}var Za=class{constructor(t,a,s,n=16777216){this.device=t,this.usage=a|Pl.COPY_SRC|Pl.COPY_DST,this.label=s,this.chunkBytes=n,this.chunks=[],this.usedBytes=0,this.generation=0,this.repacks=0}alloc(t){let s={buffer:null,offset:0,size:Math.max(4,Math.ceil(t/4)*4),chunk:null};return this.place(s,null),s}place(t,a){let{size:s}=t,n=null;if(s<=this.chunkBytes/2)for(let o of this.chunks)o===a||o.dedicated||o.free.forEach((c,l)=>{c.size>=s&&(!n||c.size<n.range.size)&&(n={chunk:o,index:l,range:c})});let r,i;if(n)({chunk:r}=n),i=n.range.offset,n.range.size===s?r.free.splice(n.index,1):r.free[n.index]={offset:i+s,size:n.range.size-s};else{let o=s>this.chunkBytes/2,c=o?s:this.chunkBytes;r={buffer:this.device.createBuffer({label:`${this.label}-${this.chunks.length}`,size:c,usage:this.usage}),size:c,free:c>s?[{offset:s,size:c-s}]:[],used:0,live:new Set,dedicated:o},this.chunks.push(r),i=0}r.used+=s,r.live.add(t),this.usedBytes+=s,Object.assign(t,{buffer:r.buffer,offset:i,chunk:r})}write(t,a){this.device.queue.writeBuffer(t.buffer,t.offset,a)}free(t){let{chunk:a}=t;if(!(!a||!a.live.has(t))){if(this.release(a,t),t.chunk=null,!a.live.size){this.drop(a);return}!a.dedicated&&a.used<a.size*.5&&this.chunks.length>1&&this.repack(a)}}release(t,a){t.used-=a.size,t.live.delete(a),this.usedBytes-=a.size;let s=t.free,n=s.findIndex(r=>r.offset>a.offset);n<0&&(n=s.length),s.splice(n,0,{offset:a.offset,size:a.size}),n+1<s.length&&s[n].offset+s[n].size===s[n+1].offset&&(s[n].size+=s[n+1].size,s.splice(n+1,1)),n>0&&s[n-1].offset+s[n-1].size===s[n].offset&&(s[n-1].size+=s[n].size,s.splice(n,1))}drop(t){t.buffer.destroy?.(),this.chunks.splice(this.chunks.indexOf(t),1)}repack(t){let a=this.device.createCommandEncoder({label:`${this.label}-repack`});for(let s of[...t.live]){let n={buffer:s.buffer,offset:s.offset};this.release(t,s),this.place(s,t),a.copyBufferToBuffer(n.buffer,n.offset,s.buffer,s.offset,s.size)}this.device.queue.submit([a.finish()]),this.drop(t),this.generation+=1,this.repacks+=1}reservedBytes(){return this.chunks.reduce((t,a)=>t+a.size,0)}destroy(){for(let t of this.chunks)t.buffer.destroy?.();this.chunks=[],this.usedBytes=0}},Pl=globalThis.GPUBufferUsage||{COPY_SRC:4,COPY_DST:8};var fi=Object.freeze(["decl","vs-out","vs-end","fs-begin","fs-return"]),Ty={decl:"decl","vs-out":"vsOut","vs-end":"vsEnd","fs-begin":"fsBegin"},Sy=/^[ \t]*\/\/ @feature:[a-z-]+\n/gm;function ie(e){if(!fi.includes(e))throw new Error(`Unknown shader hook ${e}`);return`// @feature:${e}
`}function Se(e){return e.replace(Sy,"")}function hi(e){return es(e).map(t=>t.name).join("+")}function es(e=[]){let t=new Set;for(let a of e){if(!a?.name||!/^[a-z][a-z0-9-]*$/.test(a.name))throw new Error(`Bad shader feature name ${a?.name}`);if(t.has(a.name))throw new Error(`Shader feature ${a.name} given twice`);t.add(a.name)}return[...e].sort((a,s)=>a.name<s.name?-1:a.name>s.name?1:0)}function Iy(e,t="shader"){for(let a of fi){let s=bi(e,a).length;if(s!==1)throw new Error(`${t}: hook ${a} appears ${s} times, expected once`)}Ll(e,t)}function jl(e,t=[],a={}){let s=es(t);if(!s.length)return Se(e);let n=`${a.family||"shader"}${a.instanced?" (instanced)":""}`;Iy(e,n);let r=e;for(let i of fi){if(i==="fs-return"){let{start:d,end:h,indent:g,expression:p}=Ll(r,n),u=s.reduce((y,b)=>b.fsReturn?b.fsReturn(y,a):y,p);r=`${r.slice(0,d)}${g}return ${u};
${r.slice(h)}`;continue}let o=Ty[i],c=s.map(d=>d[o]?.(a)).filter(Boolean),[l]=bi(r,i),f=c.map(d=>d.endsWith(`
`)?d:`${d}
`).join("");r=`${r.slice(0,l.index)}${f}${r.slice(l.index+l[0].length)}`}return Se(r)}function bi(e,t){return[...e.matchAll(new RegExp(`^[ \\t]*// @feature:${t}\\n`,"gm"))]}function Ll(e,t){let[a]=bi(e,"fs-return"),s=a.index+a[0].length,n=e.slice(s).match(/^([ \t]*)return (.+);\n/);if(!n)throw new Error(`${t}: hook fs-return is not followed by a return line`);return{start:a.index,end:s+n[0].length,indent:n[1],expression:n[2]}}var pi=`
fn featureHidden(id: u32) -> bool {
  return id < arrayLength(&hiddenMask) && hiddenMask[id] == 0u;
}
`;function mn(e){let t=new Set;if(e==null)return t;for(let a of e){let s=Number(a);!Number.isInteger(s)||s<=0||s>4294967295||t.add(s)}return t}function Dl(e,t=0){let a=0;for(let r of mn(e))a=Math.max(a,r);let s=64,n=a+1;for(;s<n;)s*=2;return Math.max(s,Math.floor(t)||0)}function Ul(e,t){let a=Math.max(64,Math.floor(t)||0),s=new Uint32Array(a);s.fill(1);for(let n of mn(e))n<a&&(s[n]=0);return s}function Ay(e){let t=Number(e.drillWidthMm)||0,a=Number(e.drillHeightMm)||t,s=Math.min(t,a),n=Math.min(Number(e.outerWidthMm)||0,Number(e.outerHeightMm)||0),r=Number.isFinite(e.platingThicknessMm)?e.platingThicknessMm:Math.max(0,(n-s)/2),i=(Number(e.rotationDeg)||0)*Math.PI/180+(a>t?Math.PI/2:0);return{x:e.centerMm[0]/1e3,y:-e.centerMm[1]/1e3,drillRadius:s/2e3,outerRadius:(s/2+r)/1e3,halfLength:Math.abs(t-a)/2e3,angle:Math.abs(t-a)>0?-i:0,startZ:e.startZMm/1e3,endZ:e.endZMm/1e3,netId:e.netId||0,objectId:e.objectFeatureId||0,startLayerId:e.startLayerId||0,endLayerId:e.endLayerId||0}}function yi(e,t){let a=new Map((t||[]).map(s=>[Number(s.id),Number(s.thickness_mm)||0]));return(e||[]).map(s=>{let n=i=>Math.max(0,(a.get(Number(i))||0)/2-.001),r=s.startZMm>=s.endZMm?1:-1;return{...s,startZMm:s.startZMm+r*n(s.startLayerId),endZMm:s.endZMm-r*n(s.endLayerId)}})}var ts=0,gi=16,mi=24,as=32,Gl=48,zl=Object.freeze({arrayStride:Gl,stepMode:"instance",attributes:Object.freeze([Object.freeze({shaderLocation:3,offset:ts,format:"float32x4"}),Object.freeze({shaderLocation:4,offset:gi,format:"float32x2"}),Object.freeze({shaderLocation:6,offset:mi,format:"float32x2"}),Object.freeze({shaderLocation:5,offset:as,format:"uint32x4"})])}),xi=48,yn=`struct Input {
  @location(0) unit: vec3f,
  @location(1) normal: vec3f,
  @location(2) radiusMix: f32,
  @location(3) dimensions: vec4f,
  @location(4) span: vec2f,
  @location(5) ids: vec4u,
  @location(6) shape: vec2f,
};`,Kl=`struct Barrel {
  dimensions: vec4f,
  span: vec2f,
  shape: vec2f,
  ids: vec4u,
};
@group(0) @binding(6) var<storage, read> barrels: array<Barrel>;`;function Vl(e,t,a){let s=new ArrayBuffer(Math.max(a,e.length)*t),n=new DataView(s);return e.forEach((r,i)=>{let o=i*t,c=Ay(r);n.setFloat32(o+ts,c.x,!0),n.setFloat32(o+ts+4,c.y,!0),n.setFloat32(o+ts+8,c.drillRadius,!0),n.setFloat32(o+ts+12,c.outerRadius,!0),n.setFloat32(o+gi,c.startZ,!0),n.setFloat32(o+gi+4,c.endZ,!0),n.setFloat32(o+mi,c.halfLength,!0),n.setFloat32(o+mi+4,c.angle,!0),n.setUint32(o+as,c.netId,!0),n.setUint32(o+as+4,c.objectId,!0),n.setUint32(o+as+8,c.startLayerId,!0),n.setUint32(o+as+12,c.endLayerId,!0)}),s}function Hl(e){return Vl(e,Gl,0)}function ql(e){return Vl(e,xi,1)}var Xl=`fn viridis(t: f32) -> vec3f {
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
`,Wl=`
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
  padding0: f32,
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
};
@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<uniform> slice: Slice;
@group(0) @binding(2) var<storage, read> shapes: array<u32>;
@group(0) @binding(3) var<storage, read> covers: array<u32>;
@group(0) @binding(4) var<storage, read> values: array<f32>;
@group(0) @binding(5) var field: texture_2d<f32>;

const SHAPE_WORDS = 20u;
const COVER_WORDS = 6u;
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

${Xl}
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

fn shade(operation: u32, board: vec2f) -> vec4f {
  if (slice.overlay == 1u) {
    let value = values[operation];
    if (present(value)) { return vec4f(viridis(normalized(value)), 1.0); }
  } else if (slice.overlay == 2u && slice.fieldOn == 1u) {
    let value = sampleField(board);
    if (present(value)) { return vec4f(viridis(normalized(value)), 1.0); }
  }
  return vec4f(aces(lit(slice.color.rgb)), slice.color.a);
}

// The base copper lighting (renderer.js) for a flat face of normal (0, 0, z),
// so analytic copper reads exactly as the mesh copper it replaces.
fn lit(base: vec3f) -> vec3f {
  let up = slice.material.z;
  let normal = vec3f(0.0, 0.0, up);
  let side = vec3f(1.0, 1.0, up);
  let light = normalize(globals.lightDirection.xyz * side);
  let diffuse = max(dot(normal, light), 0.0);
  let hemi = 0.62;
  let roughness = clamp(slice.material.y, 0.05, 1.0);
  let metallic = clamp(slice.material.x, 0.0, 1.0);
  let specular = pow(max(dot(normal, normalize(light + vec3f(0.3, -0.4, 0.85) * side)), 0.0), mix(96.0, 6.0, roughness));
  var tinted = base;
  // Copper (material.w = 1) dims while a net is lit, as the mesh copper does.
  if (globals.hasHighlight > 0.5 && slice.material.w > 0.5) { tinted = mix(base, vec3f(0.12, 0.14, 0.17), 0.58); }
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

@fragment fn fs_shape(input: ShapeOut) -> @location(0) vec4f {
  if (shapeDistance(input.record, input.local) > 0.0) { discard; }
  return shade(word(input.record, 1u), input.board);
}

@fragment fn fs_shape_pick(input: ShapeOut) -> @location(0) vec4u {
  if (shapeDistance(input.record, input.local) > 0.0) { discard; }
  return vec4u(PICK_TAG, word(input.record, 1u) + 1u, 0u, 0u);
}

@fragment fn fs_shape_mask(input: ShapeOut) -> @location(0) vec4f {
  if (shapeDistance(input.record, input.local) > 0.0) { discard; }
  return vec4f(0.0);
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
  return shade(input.operation, input.board);
}

@fragment fn fs_cover_pick(input: CoverOut) -> @location(0) vec4u {
  return vec4u(PICK_TAG, input.operation + 1u, 0u, 0u);
}
`;var vi=Object.freeze({shapeMask:{face:{compare:"always",passOp:"replace"},read:255,write:128,reference:128,color:!1,depth:!1},fan:{face:{compare:"always",passOp:"invert"},read:255,write:64,reference:0,color:!1,depth:!1},coverSubtract:{face:{compare:"not-equal",passOp:"replace",failOp:"keep"},read:64,write:192,reference:128,color:!1,depth:!1},shapeAdd:{face:{compare:"greater",passOp:"replace"},read:160,write:33,reference:32,color:!0,depth:!0},coverMark:{face:{compare:"equal",passOp:"replace",failOp:"keep"},read:192,write:1,reference:65,color:!1,depth:!1,depthTest:!0},coverAdd:{face:{compare:"equal",passOp:"invert",failOp:"keep",depthFailOp:"keep"},read:224,write:96,reference:64,color:!0,depth:!0},coverClear:{face:{compare:"always",passOp:"zero"},read:255,write:64,reference:0,color:!1,depth:!1},shapeLay:{face:{compare:"greater",passOp:"replace"},read:160,write:32,reference:32,color:!1,depth:!1,depthTest:!0},coverLay:{face:{compare:"equal",passOp:"invert",failOp:"keep",depthFailOp:"keep"},read:224,write:96,reference:64,color:!1,depth:!1,depthTest:!0},shapeBlend:{face:{compare:"greater",passOp:"replace"},read:160,write:32,reference:32,color:!0,depth:!0},coverBlend:{face:{compare:"equal",passOp:"invert",failOp:"keep",depthFailOp:"keep"},read:224,write:96,reference:64,color:!0,depth:!0},tintCovered:{face:{compare:"equal",passOp:"keep"},read:33,write:0,reference:33,color:!0,depth:!0},tintPlain:{face:{compare:"equal",passOp:"keep"},read:33,write:0,reference:32,color:!0,depth:!0},clear:{face:{compare:"always",passOp:"zero"},read:255,write:224,reference:0,color:!1,depth:!1}});var $l=48,wi=80,Yl=48,Jl=`
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
  padding0: u32,
  padding1: u32,
  padding2: u32,
  range: vec2f,
  padding3: vec2f,
};
struct Barrel {
  shape: vec4f,
  size: vec4f,
  ids: vec4u,
};
@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<uniform> view: View;
@group(0) @binding(2) var<storage, read> barrels: array<Barrel>;
@group(0) @binding(3) var<storage, read> values: array<f32>;
@group(0) @binding(4) var<storage, read> layerOffsets: array<f32>;

const PICK_TAG = ${2147483648}u;
const FAR = 1e30;
fn present(value: f32) -> bool { return value < 1e38; }
${Xl}
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
  @location(0) world: vec3f,
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

fn segmentDistance(p: vec2f, half: f32) -> f32 {
  return length(vec2f(p.x - clamp(p.x, -half, half), p.y));
}
fn outward(p: vec2f, half: f32) -> vec2f {
  return normalize(vec2f(p.x - clamp(p.x, -half, half), p.y) + vec2f(0.0, 1e-30));
}

struct Surface {
  t: f32,
  normal: vec3f,
};

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
  var best = Surface(FAR, vec3f(0.0, 0.0, 1.0));
  let walls = array<vec2f, 2>(prism(o.xy, d.xy, half, outer), prism(o.xy, d.xy, half, inner));
  // The outer wall where the ray enters it; the plating's inner wall where it leaves the bore.
  for (var wall = 0u; wall < 2u; wall += 1u) {
    let t = select(walls[0].x, walls[1].y, wall == 1u);
    let p = o + d * t;
    if (abs(t) < FAR && t > near && t < best.t && p.z <= top && p.z >= bottom) {
      let n = outward(p.xy, half) * select(1.0, -1.0, wall == 1u);
      best = Surface(t, vec3f(n, 0.0));
    }
  }
  // The caps: the ring between the bore and the drill at each end.
  if (abs(d.z) > 1e-24) {
    for (var end = 0u; end < 2u; end += 1u) {
      let plane = select(bottom, top, end == 1u);
      let t = (plane - o.z) / d.z;
      let reach = segmentDistance((o + d * t).xy, half);
      if (t > near && t < best.t && reach <= outer && reach >= inner) {
        best = Surface(t, vec3f(0.0, 0.0, select(-1.0, 1.0, end == 1u)));
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
  // An unplated hole is a bare drill wall in the substrate's colour.
  if (b.ids.w == 1u) {
    let light = normalize(globals.lightDirection.xyz);
    out.color = vec4f(view.wallColor.rgb * (0.38 + max(dot(hit.normal, light), 0.0) * 0.72), 1.0);
    return out;
  }
  if (view.overlay == 1u && present(value)) {
    out.color = vec4f(viridis(normalized(value)), 1.0);
    return out;
  }
  var base = view.color.rgb;
  if (globals.hasHighlight > 0.5) { base = mix(base, vec3f(0.12, 0.14, 0.17), 0.58); }
  let light = normalize(globals.lightDirection.xyz);
  out.color = vec4f(base * (0.38 + max(dot(hit.normal, light), 0.0) * 0.72), 1.0);
  return out;
}

@fragment fn fs_barrel_pick(input: BarrelOut) -> PickOut {
  let hit = surface(input);
  if (hit.t >= FAR) { discard; }
  var out: PickOut;
  out.depth = hitDepth(input, hit.t);
  out.pick = vec4u(PICK_TAG, barrels[input.barrel].ids.x + 1u, 0u, 0u);
  return out;
}
`,Ql=`
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
  padding0: u32,
  padding1: u32,
  padding2: u32,
  range: vec2f,
  padding3: vec2f,
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
  let world = vec3f(mix(wall.ends.xy, wall.ends.zw, corner.x), mix(wall.span.y, wall.span.x, corner.y) + offset);
  let along = wall.ends.zw - wall.ends.xy;
  var out: WallOut;
  out.position = globals.viewProjection * vec4f(world, 1.0);
  out.world = world;
  out.normal = vec3f(normalize(vec2f(along.y, -along.x) + vec2f(1e-30, 0.0)), 0.0);
  return out;
}

@fragment fn fs_wall(input: WallOut) -> @location(0) vec4f {
  var toward = -view.eye.xyz;
  if (abs(view.eye.w) > 1e-12) { toward = view.eye.xyz / view.eye.w - input.world; }
  let normal = select(-input.normal, input.normal, dot(input.normal, toward) >= 0.0);
  let light = normalize(globals.lightDirection.xyz);
  let base = view.wallColor.rgb * (0.38 + max(dot(normal, light), 0.0) * 0.72);
  return vec4f(base, view.wallColor.a);
}
`;var Ti=20,lt=256,Zl=112,ra="rg32uint",Ma=lt/4,Cy=256,ed={compare:"always",passOp:"zero"},Fy={compare:"always",passOp:"replace"},Oy={compare:"not-equal",passOp:"keep"},Py={compare:"equal",passOp:"keep"},nd="fn dequant(p: vec3f) -> vec3f { return draw.quantMin.xyz + p * draw.quantSize.xyz; }",rd=32,id=`  let plating = input.dimensions.w - input.dimensions.z;
  let rim = select(1.0, ${(1/Math.cos(Math.PI/rd)).toFixed(6)}, input.radiusMix > 1.5);
  let radius = mix(max(input.dimensions.z - plating, input.dimensions.z * 0.5), input.dimensions.z, min(input.radiusMix, 1.0)) * rim;
  let turn = vec2f(cos(input.shape.y), sin(input.shape.y));
  let local = vec2f(input.unit.x * radius + select(-input.shape.x, input.shape.x, input.unit.x >= 0.0), input.unit.y * radius);
  let planar = vec2f(local.x * turn.x - local.y * turn.y, local.x * turn.y + local.y * turn.x);
  let turnedNormal = vec3f(input.normal.x * turn.x - input.normal.y * turn.y, input.normal.x * turn.y + input.normal.y * turn.x, input.normal.z);
`,vn=`
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
${nd}
@group(0) @binding(3) var<storage, read> hiddenMask: array<u32>;
@group(0) @binding(4) var<storage, read> netMask: array<u32>;
${pi}
${Ha}
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
`,jy=Se(vn),wn=`
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
${nd}
@group(0) @binding(3) var<storage, read> hiddenMask: array<u32>;
@group(0) @binding(4) var<storage, read> netMask: array<u32>;
${pi}
${Ha}
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
`,Ly=Se(wn),Si=`
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
${Ha}
${ie("decl")}${yn}
struct Output {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) @interpolate(flat) netId: u32,
  @location(2) @interpolate(flat) objectId: u32,
${ie("vs-out")}  @location(3) @interpolate(flat) visible: u32,
};
@vertex fn vs(input: Input) -> Output {
${id}  let z0 = input.span.x + layerOffsets[input.ids.z];
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
`,Dy=Se(Si),Ii=`
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
${Ha}
${ie("decl")}${yn}
struct Output {
  @builtin(position) position: vec4f,
  @location(3) @interpolate(flat) netId: u32,
  @location(0) @interpolate(flat) objectId: u32,
${ie("vs-out")}  @location(1) @interpolate(flat) visible: u32,
};
@vertex fn vs(input: Input) -> Output {
${id}  let world = vec3f(
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
`,Uy=Se(Ii);function oa(e,t){return t.reduce((a,[s,n])=>{if(a.split(s).length!==2)throw new Error(`Shader variant anchor not found once: ${s.slice(0,60)}`);return a.replace(s,()=>n)},e)}var Ai=[`  padding0: u32,
  padding1: u32,`,`  selectedOccurrence: u32,
  occurrenceBase: u32,`],Mn=[["  padding2: u32,","  emphasisStride: u32,"],["fn netEmphasized(id: u32) -> bool {",`${hc}fn netEmphasized(id: u32) -> bool {`]],od="  let lit = netEmphasized(input.netId) || (globals.activeNet != 0u && input.netId == globals.activeNet);",cd=`  let lit = emphasisOf(input.occurrence, input.netId) != 0u
    || (input.occurrence == globals.selectedOccurrence && globals.activeNet != 0u && input.netId == globals.activeNet);`,Ri=oa(vn,[Ai,[`  @location(3) world: vec3f,
};`,`  @location(3) world: vec3f,
  @location(4) @interpolate(flat) occurrence: u32,
  // Mask and silkscreen opacity of this occurrence's own stackup separation (SB2-31f).
  @location(5) @interpolate(flat) fade: f32,
};`],[`@vertex fn vs(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.world = dequant(input.position) + draw.offset.xyz;
  output.position = globals.viewProjection * vec4f(output.world, 1.0);
  output.normal = normalize(input.normal);`,`${Ja}
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
  let selectedComponent = here && component && globals.selectedFeature != 0u && input.objectId == globals.selectedFeature;`],...Mn,["      base = vec3f(0.08, 1.0, 0.2) * pulse;","      base = emphasisColor(mark, vec3f(0.08, 1.0, 0.2)) * pulse;"],["  var alpha = draw.flags.y;","  var alpha = draw.flags.y * input.fade;"]]),ld=Se(Ri),_i=oa(wn,[Ai,[`  @location(0) @interpolate(flat) objectId: u32,
};`,`  @location(0) @interpolate(flat) objectId: u32,
  @location(1) @interpolate(flat) occurrence: u32,
};`],[`@vertex fn vs(input: Input) -> Output {
  var output: Output;
  output.position = globals.viewProjection * vec4f(dequant(input.position) + draw.offset.xyz, 1.0);`,`${Ja}
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
${ie("fs-return")}  return vec2u(input.occurrence, select(input.objectId, 0u, kind == 0u));`],...Mn,[od,cd]]),dd=Se(_i),Gy=`struct Placement { r0: vec4f, r1: vec4f, r2: vec4f, ids: vec4u };
@group(0) @binding(8) var<storage, read> placements: array<Placement>;
fn place(p: Placement, v: vec3f) -> vec3f {
  return vec3f(dot(p.r0.xyz, v) + p.r0.w, dot(p.r1.xyz, v) + p.r1.w, dot(p.r2.xyz, v) + p.r2.w);
}
fn turn(p: Placement, n: vec3f) -> vec3f {
  return vec3f(dot(p.r0.xyz, n), dot(p.r1.xyz, n), dot(p.r2.xyz, n));
}`,td="@group(0) @binding(1) var<uniform> draw: Draw;",kn=[td,`${td}
${Gy}`],En=["  output.objectId = input.objectId;","  output.objectId = select(placement.ids.x, input.objectId, input.objectId != 0u);"],ud=["  let index = listedOccurrence(u32(draw.material.w + 0.5), instance);",`  let placement = placements[draw.placement.x + instance % draw.placement.y];
  let index = listedOccurrence(u32(draw.material.w + 0.5), instance / draw.placement.y);`],fd=oa(vn,[kn,[`@vertex fn vs(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.world = dequant(input.position) + draw.offset.xyz;`,`@vertex fn vs(input: VertexInput, @builtin(instance_index) instance: u32) -> VertexOutput {
  let placement = placements[draw.placement.x + instance];
  var output: VertexOutput;
  output.world = place(placement, dequant(input.position)) + draw.offset.xyz;`],["  output.normal = normalize(input.normal);","  output.normal = normalize(turn(placement, input.normal));"],En]),hd=oa(Ri,[kn,ud,["occurrence.model * vec4f(dequant(input.position) + draw.offset.xyz + lift, 1.0)","occurrence.model * vec4f(place(placement, dequant(input.position)) + draw.offset.xyz + lift, 1.0)"],["(occurrence.normal * vec4f(input.normal, 0.0))","(occurrence.normal * vec4f(turn(placement, input.normal), 0.0))"],En]),bd=oa(wn,[kn,[`@vertex fn vs(input: Input) -> Output {
  var output: Output;
  output.position = globals.viewProjection * vec4f(dequant(input.position) + draw.offset.xyz, 1.0);`,`@vertex fn vs(input: Input, @builtin(instance_index) instance: u32) -> Output {
  let placement = placements[draw.placement.x + instance];
  var output: Output;
  output.position = globals.viewProjection * vec4f(place(placement, dequant(input.position)) + draw.offset.xyz, 1.0);`],En]),pd=oa(_i,[kn,ud,["occurrence.model * vec4f(dequant(input.position) + draw.offset.xyz + lift, 1.0)","occurrence.model * vec4f(place(placement, dequant(input.position)) + draw.offset.xyz + lift, 1.0)"],En]),gd=Se(fd),md=Se(hd),yd=Se(bd),xd=Se(pd),Mi=64,zy=6,Ky=`${Kl}
${Ja}
struct Input {
  @location(0) unit: vec3f,
  @location(1) normal: vec3f,
  @location(2) radiusMix: f32,
};`;function vd(e,t,a=[]){return oa(e,[Ai,[`@group(0) @binding(2) var<storage, read> layerOffsets: array<f32>;
`,""],[yn,Ky],["@vertex fn vs(input: Input) -> Output {",`struct Record {
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
  output.occurrence = index + 1u + globals.occurrenceBase;`],...a])}var wd=vd(Si,`  output.position = globals.viewProjection * vec4f(world, 1.0);
  output.normal = turnedNormal;`,[[`  let z0 = input.span.x + layerOffsets[input.ids.z];
  let z1 = input.span.y + layerOffsets[input.ids.w];`,`  let z0 = input.span.x + layerOffsets[input.ids.z] * spread;
  let z1 = input.span.y + layerOffsets[input.ids.w] * spread;`],[`  output.normal = turnedNormal;
  output.netId`,`  output.normal = (occurrence.normal * vec4f(turnedNormal, 0.0)).xyz;
  output.netId`],[`  @location(3) @interpolate(flat) visible: u32,
};`,`  @location(3) @interpolate(flat) visible: u32,
  @location(4) @interpolate(flat) occurrence: u32,
};`],["  let selected = netEmphasized(input.netId) || (globals.activeNet != 0u && input.netId == globals.activeNet);",`  let mark = emphasisOf(input.occurrence, input.netId);
  let selected = mark != 0u
    || (input.occurrence == globals.selectedOccurrence && globals.activeNet != 0u && input.netId == globals.activeNet);`],...Mn,["      base = vec3f(0.1, 1.0, 0.22) * (","      base = emphasisColor(mark, vec3f(0.1, 1.0, 0.22)) * ("]]),Md=vd(Ii,`  output.position = globals.viewProjection * vec4f(world, 1.0);
  output.objectId`,[["mix(input.span.x + layerOffsets[input.ids.z], input.span.y + layerOffsets[input.ids.w], input.unit.z)","mix(input.span.x + layerOffsets[input.ids.z] * spread, input.span.y + layerOffsets[input.ids.w] * spread, input.unit.z)"],[`  @location(1) @interpolate(flat) visible: u32,
};`,`  @location(1) @interpolate(flat) visible: u32,
  @location(2) @interpolate(flat) occurrence: u32,
};`],["  return vec2u(1u, input.objectId);","  return vec2u(input.occurrence, input.objectId);"],...Mn,[od,cd]]),kd=Se(wd),Ed=Se(Md),Td=`
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
${Ja}
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
`,Sd=`${Td}
@fragment fn fs(input: Output) -> @location(0) vec4f {
${ie("fs-begin")}  let light = normalize(globals.lightDirection.xyz);
${ie("fs-return")}  return vec4f(draw.color.rgb * (0.45 + max(dot(normalize(input.normal), light), 0.0) * 0.55), 1.0);
}
`,Id=Se(Sd),Ad=`${Td}
@fragment fn fs(input: Output) -> @location(0) vec2u {
${ie("fs-begin")}${ie("fs-return")}  return vec2u(input.occurrence, 0u);
}
`,Rd=Se(Ad),Ni=`
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
`,ad=[{arrayStride:24,attributes:[{shaderLocation:0,offset:0,format:"float32x3"},{shaderLocation:1,offset:12,format:"float32x3"}]}],HE=Object.freeze({main:ld,pick:dd,barrel:kd,barrelPick:Ed,box:Id,boxPick:Rd,cull:Ni,component:gd,componentInstanced:md,componentPick:yd,componentPickInstanced:xd}),_d=Object.freeze({main:{output:"color",single:vn,instanced:Ri,world:["output.world","output.world"]},pick:{output:"pick",single:wn,instanced:_i,world:["(dequant(input.position) + draw.offset.xyz)","world"]},barrel:{output:"color",single:Si,instanced:wd,world:["world","(occurrence.model * vec4f(world, 1.0)).xyz"]},barrelPick:{output:"pick",single:Ii,instanced:Md,world:["world","(occurrence.model * vec4f(world, 1.0)).xyz"]},component:{output:"color",single:fd,instanced:hd,world:["output.world","output.world"]},componentPick:{output:"pick",single:bd,instanced:pd,world:["(place(placement, dequant(input.position)) + draw.offset.xyz)","world"]},box:{output:"color",single:null,instanced:Sd,world:[null,"(occurrence.model * vec4f(local, 1.0)).xyz"]},boxPick:{output:"pick",single:null,instanced:Ad,world:[null,"(occurrence.model * vec4f(local, 1.0)).xyz"]}}),qE=Object.freeze(Object.keys(_d));function ki(e,t,a=[]){let s=_d[e],n=s?.[t?"instanced":"single"];if(!n)throw new Error(`No ${t?"instanced":"one-board"} ${e} shader`);return jl(n,a,{family:e,instanced:t,output:s.output,world:s.world[t?1:0]})}var XE=Object.freeze({main:jy,pick:Ly,barrel:Dy,barrelPick:Uy,mainInstanced:ld,pickInstanced:dd,barrelInstanced:kd,barrelPickInstanced:Ed,component:gd,componentInstanced:md,componentPick:yd,componentPickInstanced:xd,box:Id,boxPick:Rd,cull:Ni}),ia=class e{static async create(t){if(!navigator.gpu)throw new Error("WebGPU is unavailable in this browser");let a=await navigator.gpu.requestAdapter({powerPreference:"high-performance"});if(!a)throw new Error("No WebGPU adapter is available");let s=a.features.has("depth32float-stencil8"),n=await a.requestDevice(s?{requiredFeatures:["depth32float-stencil8"]}:void 0);return new e(t,n,{stencil:s})}constructor(t,a,{shareFrom:s=null,stencil:n=!1}={}){if(this.canvas=t,this.device=a,this.shareFrom=s,this.stencil=s?s.stencil:!!n,this.depthFormat=this.stencil?"depth32float-stencil8":"depth32float",this.version=0,this.barrelColor=[.55,.35,.16,.78],this.alwaysInstanced=!!s,this.occurrenceBase=0,s?(this.context=s.context,this.format=s.format):(a.addEventListener("uncapturederror",r=>{console.error(`Uncaptured WebGPU error: ${r.error?.message||r.error}`)}),a.lost.then(r=>{r.reason!=="destroyed"&&console.error(`WebGPU device lost: ${r.reason}`,r.message)}),this.context=t.getContext("webgpu"),this.format=navigator.gpu.getPreferredCanvasFormat(),this.context.configure({device:a,format:this.format,alphaMode:"opaque"})),this.entries=[],this.barrels=null,this.drawSlotCapacity=Cy,this.drawSlotBuffer=this.createDrawSlotBuffer(this.drawSlotCapacity),this.drawStaging=new Float32Array(this.drawSlotCapacity*Ma),this.freeDrawSlots=[],this.nextDrawSlot=0,this.globalBuffer=a.createBuffer({size:Zl,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.layerOffsetBuffer=a.createBuffer({size:1024,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.occurrenceMatrices=[[...Wt]],this.occurrenceKeys=["0"],this.occurrenceHiddenLayers=[[]],this.occurrenceExplode=[null],this.identityOnly=!0,this.occurrenceCapacity=1,this.occurrenceBuffer=this.createOccurrenceBuffer(this.occurrenceCapacity),this.device.queue.writeBuffer(this.occurrenceBuffer,0,hn(this.occurrenceMatrices)),this.barrelRecordBuffer=a.createBuffer({label:"barrel-records",size:xi,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.placementBuffer=a.createBuffer({label:"component-placements",size:Mi,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.componentPipelineSets=new Map,this.instancedPipelines=null,this.shaderFeatures=[],this.shaderFeatureKey="",this.featurePipelineSets=new Map,this.pipelineSetKinds=new WeakMap,this.listBuffer=this.createListBuffer(this.occurrenceCapacity),this.slotCapacity=0,this.slotArgs=new Uint32Array(0),this.slotClasses=new Uint32Array(0),this.freeSlots=[],this.nextSlot=2,this.argsBuffer=null,this.classesBuffer=null,this.growSlots(256),this.setSlot(0,0,4),this.setSlot(1,0,4),this.cull=null,this.box=null,this.boardBounds=null,this.selectedOccurrence=-1,this.lodOverride=null,this.lodThresholds={...at},this.innerCopperAtFull=!0,this.innerCopperMode="all",this.cullCounts={full:0,board:0,body:0,box:0,culled:0},this.frameStats={triangles:0,draws:0},this.boxColor=[.24,.36,.28,1],s)for(let r of["bindGroupLayout","pipelineLayout","vertexBuffers","pipeline","pickPipeline","barrelPipeline","barrelPickPipeline","singlePipelines"])this[r]=s[r];else this.createSinglePipelines();this.depth=null,this.pickTexture=null,this.pickSerial=Promise.resolve(),this.bundleCache=new Map,this.globalScratch=new ArrayBuffer(Zl),this.globalScratchF32=new Float32Array(this.globalScratch),this.globalScratchView=new DataView(this.globalScratch),this.barrelDrawScratch=new Float32Array(lt/4),this.nextEntryId=1,this.hiddenFeatureIds=new Set,this.showPlaceholders=!0,this.featureMaskCapacity=64,this.featureMaskBuffer=this.createFeatureMaskBuffer(this.featureMaskCapacity),this.uploadFeatureMask(),this.emphasizedNetIds=new Set,this.occurrenceEmphasis=null,this.emphasisStride=0,this.dimCopper=!1,this.netMaskCapacity=64,this.netMaskBuffer=this.createNetMaskBuffer(this.netMaskCapacity),this.uploadNetMask(),s&&this.setOccurrences([])}createSinglePipelines(){let t=this.device;this.bindGroupLayout=t.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:2,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:3,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:4,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:5,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:6,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:7,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:8,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}}]});let a=t.createPipelineLayout({bindGroupLayouts:[this.bindGroupLayout]});this.pipelineLayout=a;let s=this.vertexBuffers=[{arrayStride:Ti,attributes:[{shaderLocation:0,offset:0,format:"unorm16x4"},{shaderLocation:1,offset:8,format:"snorm8x4"},{shaderLocation:2,offset:12,format:"uint32"},{shaderLocation:3,offset:16,format:"uint32"}]}];this.singlePipelines=this.makePipelineSet(!1,[]),this.pipeline=this.singlePipelines.main,this.pickPipeline=this.singlePipelines.pick,this.barrelPipeline=this.singlePipelines.barrel,this.barrelPickPipeline=this.singlePipelines.barrelPick}makeMainPipelines(t,a){let s=this.pipelineLayout,n=this.vertexBuffers,r=(c,l)=>this.makePipeline(s,t,this.format,n,`${c}${a}`,l),i=r("main",{stencil:ed}),o=r("main-blend");return{main:i,mark:this.stencil?r("main-mark",{stencil:Fy}):i,blend:o,translucent:r("main-translucent",{depthWrite:!1,cullMode:"back"}),mask:this.stencil?r("mask",{stencil:Oy}):o,maskCovered:this.stencil?r("mask-covered",{stencil:Py,constants:{COVERED:1}}):null}}createOccurrenceBuffer(t){return this.device.createBuffer({label:"occurrences",size:t*160,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST})}createListBuffer(t){return this.device.createBuffer({label:"visible-occurrences",size:t*4*Uint32Array.BYTES_PER_ELEMENT,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST})}growSlots(t){let a=new Uint32Array(t*5);a.set(this.slotArgs);let s=new Uint32Array(t).fill(4);s.set(this.slotClasses),this.slotArgs=a,this.slotClasses=s,this.slotCapacity=t,this.argsBuffer?.destroy?.(),this.classesBuffer?.destroy?.(),this.argsBuffer=this.device.createBuffer({label:"indirect-args",size:a.byteLength,usage:GPUBufferUsage.INDIRECT|GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.classesBuffer=this.device.createBuffer({label:"draw-classes",size:s.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.device.queue.writeBuffer(this.argsBuffer,0,a),this.device.queue.writeBuffer(this.classesBuffer,0,s),this.cull&&(this.cull.bindGroup=this.makeCullBindGroup()),this.bundleCache?.clear()}setSlot(t,a,s){this.slotArgs.fill(0,t*5,t*5+5),this.slotArgs[t*5]=a,this.slotClasses[t]=s,this.device.queue.writeBuffer(this.argsBuffer,t*20,this.slotArgs,t*5,5),this.device.queue.writeBuffer(this.classesBuffer,t*4,this.slotClasses,t,1)}allocSlot(t,a){let s=this.freeSlots.length?this.freeSlots.pop():this.nextSlot++;return s>=this.slotCapacity&&this.growSlots(this.slotCapacity*2),this.setSlot(s,t,a),s}get occurrenceCount(){return this.occurrenceMatrices.length}setOccurrences(t){let{matrices:a,keys:s,hiddenLayers:n,explode:r}=Cl(t??[Wt]);this.occurrenceMatrices=a,this.occurrenceKeys=s,this.occurrenceHiddenLayers=n,this.occurrenceExplode=r,this.identityOnly=!this.alwaysInstanced&&a.length===1&&pn(a[0]),this.identityOnly||this.ensureInstancedPipelines(),a.length>this.occurrenceCapacity&&(this.occurrenceBuffer?.destroy?.(),this.listBuffer?.destroy?.(),this.occurrenceCapacity=Math.max(a.length,this.occurrenceCapacity*2),this.occurrenceBuffer=this.createOccurrenceBuffer(this.occurrenceCapacity),this.listBuffer=this.createListBuffer(this.occurrenceCapacity),this.cull&&(this.cull.lods.destroy(),this.cull.lods=this.createLodBuffer(this.occurrenceCapacity)),this.rebindAll()),a.length&&this.device.queue.writeBuffer(this.occurrenceBuffer,0,hn(a,n,r)),this.cull&&this.device.queue.writeBuffer(this.cull.lods,0,new Uint32Array(this.occurrenceCapacity).fill(ui)),this.selectedOccurrence>=a.length&&(this.selectedOccurrence=-1),this.bundleCache.clear(),this.invalidate()}setOccurrenceHiddenLayers(t){this.occurrenceHiddenLayers=this.occurrenceMatrices.map((a,s)=>[...t?.[s]||[]].map(Number)),this.writeOccurrenceRecords()}setOccurrenceExplode(t){this.occurrenceExplode=this.occurrenceMatrices.map((a,s)=>t?.[s]?[...t[s]].map(Number):null),this.writeOccurrenceRecords()}writeOccurrenceRecords(){this.occurrenceMatrices.length&&this.device.queue.writeBuffer(this.occurrenceBuffer,0,hn(this.occurrenceMatrices,this.occurrenceHiddenLayers,this.occurrenceExplode)),this.invalidate()}setInnerCopperMode(t){this.setInnerCopperAtFull(!1),this.innerCopperMode!==t&&(this.innerCopperMode=t,this.invalidate())}setInnerCopperAtFull(t){if(this.innerCopperAtFull!==t){this.innerCopperAtFull=t;for(let a of this.entries)a.innerCopper&&(a.drawClass=sd(a,t),this.setSlot(a.slot,a.indexCount,a.drawClass));this.invalidate()}}setBoardBounds(t){this.boardBounds=t?[...t]:null,this.invalidate()}setLodThresholds(t){this.lodThresholds=wa({...this.lodThresholds,...t}),this.invalidate()}setAnalytic(t){this.analytic&&this.analytic!==t&&this.analytic.destroy(),this.analytic=t||null,this.bundleCache.clear(),this.invalidate()}setLodOverride(t){this.lodOverride=t==null?null:Number(t),this.invalidate()}createLodBuffer(t){return this.device.createBuffer({label:"occurrence-lods",size:t*Uint32Array.BYTES_PER_ELEMENT,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST})}createCull(){let t=this.device,a=this.shareFrom?.cull,s=i=>({visibility:GPUShaderStage.COMPUTE,buffer:{type:i}}),n=a?.layout||t.createBindGroupLayout({label:"cull",entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}},{binding:1,...s("read-only-storage")},{binding:2,...s("storage")},{binding:3,...s("storage")},{binding:4,...s("storage")},{binding:5,...s("storage")},{binding:6,...s("read-only-storage")}]}),r=a&&{layout:n,classify:a.classify,writeArgs:a.writeArgs};if(!r){let i=this.createShaderModule(Ni,"cull"),o=t.createPipelineLayout({bindGroupLayouts:[n]});r={layout:n,classify:t.createComputePipeline({layout:o,compute:{module:i,entryPoint:"classify"}}),writeArgs:t.createComputePipeline({layout:o,compute:{module:i,entryPoint:"writeArgs"}})}}this.cull={...r,uniform:t.createBuffer({label:"cull-params",size:192,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),lods:this.createLodBuffer(this.occurrenceCapacity),counters:t.createBuffer({label:"cull-counters",size:16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST}),readback:t.createBuffer({label:"cull-readback",size:16,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST}),scratch:new ArrayBuffer(192),reading:!1,readAt:0,bindGroup:null},t.queue.writeBuffer(this.cull.lods,0,new Uint32Array(this.occurrenceCapacity).fill(ui)),this.cull.bindGroup=this.makeCullBindGroup()}makeCullBindGroup(){return this.device.createBindGroup({layout:this.cull.layout,entries:[{binding:0,resource:{buffer:this.cull.uniform}},{binding:1,resource:{buffer:this.occurrenceBuffer}},{binding:2,resource:{buffer:this.cull.lods}},{binding:3,resource:{buffer:this.listBuffer}},{binding:4,resource:{buffer:this.cull.counters}},{binding:5,resource:{buffer:this.argsBuffer}},{binding:6,resource:{buffer:this.classesBuffer}}]})}createBox(){let t=[[[1,0,0],[[1,0,0],[1,1,0],[1,1,1],[1,0,1]]],[[-1,0,0],[[0,0,0],[0,0,1],[0,1,1],[0,1,0]]],[[0,1,0],[[0,1,0],[0,1,1],[1,1,1],[1,1,0]]],[[0,-1,0],[[0,0,0],[1,0,0],[1,0,1],[0,0,1]]],[[0,0,1],[[0,0,1],[1,0,1],[1,1,1],[0,1,1]]],[[0,0,-1],[[0,0,0],[0,1,0],[1,1,0],[1,0,0]]]],a=[],s=[];t.forEach(([l,f],d)=>{for(let g of f)a.push(...g,...l);let h=d*4;s.push(h,h+1,h+2,h,h+2,h+3)});let n=new Float32Array(a),r=new Uint16Array(s),i=this.device.createBuffer({label:"box-vertices",size:n.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),o=this.device.createBuffer({label:"box-indices",size:r.byteLength,usage:GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST});this.device.queue.writeBuffer(i,0,n),this.device.queue.writeBuffer(o,0,r);let c=this.device.createBuffer({size:lt,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.box={vertexBuffer:i,indexBuffer:o,indexCount:r.length,drawBuffer:c,bindGroup:this.makeBindGroup(c),scratch:new Float32Array(lt/4)},this.setSlot(1,r.length,3)}writeBoxDraw(){let t=this.box.scratch,[a,s,n,r,i,o]=this.boardBounds;t.fill(0),t.set(this.boxColor,0),t.set([r-a,i-s,o-n,0],4),t.set([a,s,n,0],8),this.device.queue.writeBuffer(this.box.drawBuffer,0,t)}encodeCull(t,a){let s=this.cull,n=new Float32Array(s.scratch),r=new Uint32Array(s.scratch);n.fill(0),Ol(a.matrix).forEach((u,y)=>n.set(u,y*4));let i=a.lod;i&&n.set([...i.eye,i.orthographic?0:1],24);let o=this.boardBounds||[-1e6,-1e6,-1e6,1e6,1e6,1e6];n.set([o[0],o[1],o[2],0,o[3],o[4],o[5],0],28);let{fullPx:c,boardPx:l,boxPx:f,keep:d}=this.lodThresholds;n.set([i?.pixelScale||0,c,f,d],36);let h=this.lodOverride!=null?this.lodOverride+1:!i||!this.boardBounds?gn+1:0;r.set([this.occurrenceMatrices.length,this.selectedOccurrence+1,h,this.nextSlot],40),r[44]=this.barrels?.instanceCount||0,n[45]=l,this.device.queue.writeBuffer(s.uniform,0,s.scratch),t.clearBuffer(s.counters);let g=t.beginComputePass({label:"cull"});g.setBindGroup(0,s.bindGroup),g.setPipeline(s.classify),g.dispatchWorkgroups(Math.ceil(this.occurrenceMatrices.length/64)),g.setPipeline(s.writeArgs),g.dispatchWorkgroups(Math.ceil(this.nextSlot/64)),g.end();let p=performance.now();return!s.reading&&p-s.readAt>250?(t.copyBufferToBuffer(s.counters,0,s.readback,0,16),s.readAt=p,!0):!1}readCullCounts(){let t=this.cull;t.reading=!0;let a=this.occurrenceMatrices.length;t.readback.mapAsync(GPUMapMode.READ).then(()=>{let[s,n,r,i]=new Uint32Array(t.readback.getMappedRange().slice(0));t.readback.unmap(),this.cullCounts={full:s,board:n-s,body:r-n,box:i,culled:Math.max(0,a-r-i)}}).catch(()=>{}).finally(()=>{t.reading=!1})}countFor(t){if(this.identityOnly)return t===2?this.barrels?.instanceCount||0:t===3?0:1;let{full:a,board:s,body:n,box:r}=this.cullCounts;return t===5?a+s+n:t===0?a+s:t===1?a:t===2?(a+s)*(this.barrels?.instanceCount||0):r}gpuMemoryBytes(){let t=0;for(let a of this.entries)t+=(a.vertexAllocation?.size||0)+(a.indexAllocation?.size||0);this.shareFrom||(t+=this.arenaSlackBytes());for(let a of[this.barrels?.vertexBuffer,this.barrels?.indexBuffer,this.barrels?.instanceBuffer,this.barrelRecordBuffer,this.occurrenceBuffer,this.listBuffer,this.argsBuffer,this.classesBuffer,this.featureMaskBuffer,this.netMaskBuffer,this.cull?.lods])t+=a?.size||0;return t+=this.analytic?.gpuMemoryBytes()||0,t+=this.canvas.width*this.canvas.height*12,t}gpuMemoryBreakdown(){let t={},a=0,s=0;for(let c of this.entries){let l=c.vertexAllocation?.size||0,f=c.indexAllocation?.size||0;a+=l,s+=f;let d=c.kind==="copper"?`copper:${c.layerId??"?"}`:c.boardRole?`${c.kind}:${c.boardRole}`:c.kind||"other";t[d]=(t[d]||0)+l+f}let n=[this.barrels?.vertexBuffer,this.barrels?.indexBuffer,this.barrels?.instanceBuffer,this.barrelRecordBuffer].reduce((c,l)=>c+(l?.size||0),0),r=[this.occurrenceBuffer,this.listBuffer,this.argsBuffer,this.classesBuffer,this.featureMaskBuffer,this.netMaskBuffer,this.cull?.lods].reduce((c,l)=>c+(l?.size||0),0),i=this.shareFrom?null:this.arenaStats(),o=this.analytic?.gpuMemoryBytes()||0;return{vertex:a,index:s,geometry:t,barrels:n,occurrences:r,analytic:o,targets:this.canvas.width*this.canvas.height*12,entries:this.entries.length,arena:i}}ensureInstancedPipelines(){if(!this.instancedPipelines){if(this.shareFrom){this.shareFrom.ensureInstancedPipelines(),this.instancedPipelines=this.shareFrom.instancedPipelines,this.createBox(),this.createCull();return}this.instancedPipelines=this.makePipelineSet(!0,[]),this.createBox(),this.createCull()}}makePipelineSet(t,a){let s=this.pipelineLayout,n=hi(a),r=l=>ki(l,t,a),i=n?`+${n}`:"",o=`${t?"-instanced":""}${i}`,c={...this.makeMainPipelines(r("main"),o),pick:this.makePipeline(s,r("pick"),ra,this.vertexBuffers,`pick${o}`),barrel:this.makeBarrelPipeline(s,r("barrel"),this.format,`barrel${o}`,!t),barrelPick:this.makeBarrelPipeline(s,r("barrelPick"),ra,`barrel-pick${o}`,!t)};return t&&(c.box=this.makePipeline(s,r("box"),this.format,ad,`box${i}`),c.boxPick=this.makePipeline(s,r("boxPick"),ra,ad,`box-pick${i}`)),this.pipelineSetKinds.set(c,{instanced:t,features:es(a),key:n}),c}setShaderFeatures(t=[]){let a=es(t),s=hi(a);s!==this.shaderFeatureKey&&(this.shaderFeatures=a,this.shaderFeatureKey=s,this.bundleCache.clear(),this.invalidate())}pipelinesFor(t){let a=this.shareFrom||this;if(t&&this.ensureInstancedPipelines(),!this.shaderFeatureKey)return t?a.instancedPipelines:a.singlePipelines;let s=`${t?"instanced":"single"}|${this.shaderFeatureKey}`,n=a.featurePipelineSets.get(s);return n||(n=a.makePipelineSet(t,this.shaderFeatures),a.featurePipelineSets.set(s,n)),n}drawSet(){return this.identityOnly?{pipelines:this.pipelinesFor(!1),indirect:!1,barrelInstances:this.barrels?.instanceCount||0}:{pipelines:this.pipelinesFor(!0),indirect:!0,barrelInstances:0}}drawEntry(t,a,s){t.setBindGroup(0,a.bindGroup);let n=a.vertexAllocation,r=a.indexAllocation;t.setVertexBuffer(0,n.buffer,n.offset,n.size),t.setIndexBuffer(r.buffer,a.indexFormat,r.offset,r.size),s?t.drawIndexedIndirect(this.argsBuffer,a.slot*20):t.drawIndexed(a.indexCount,a.placementCount||1)}drawBarrels(t,a,s,n){t.setPipeline(a),t.setBindGroup(0,this.barrels.bindGroup),t.setVertexBuffer(0,this.barrels.vertexBuffer),t.setVertexBuffer(1,this.barrels.instanceBuffer),t.setIndexBuffer(this.barrels.indexBuffer,"uint16"),s?t.drawIndexedIndirect(this.argsBuffer,0):t.drawIndexed(this.barrels.indexCount,n)}drawBox(t,a){!this.box||!this.boardBounds||(this.writeBoxDraw(),t.setPipeline(a),t.setBindGroup(0,this.box.bindGroup),t.setVertexBuffer(0,this.box.vertexBuffer),t.setIndexBuffer(this.box.indexBuffer,"uint16"),t.drawIndexedIndirect(this.argsBuffer,20))}createNetMaskBuffer(t){return this.device.createBuffer({label:"net-emphasis-mask",size:t*Uint32Array.BYTES_PER_ELEMENT,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST})}uploadNetMask(){let t;if(this.occurrenceEmphasis&&!this.identityOnly){let s=pc(this.occurrenceEmphasis);this.emphasisStride=s.stride,t=s.data}else this.emphasisStride=0,t=uc(this.emphasizedNetIds,this.netMaskCapacity);if(t.length>this.netMaskCapacity){this.netMaskBuffer?.destroy?.();let s=this.netMaskCapacity;for(;s<t.length;)s*=2;this.netMaskCapacity=s,this.netMaskBuffer=this.createNetMaskBuffer(s),this.rebindAll()}let a=new Uint32Array(this.netMaskCapacity);a.set(t),this.device.queue.writeBuffer(this.netMaskBuffer,0,a)}setOccurrenceEmphasis(t,{dimCopper:a=!1}={}){let s=Array.isArray(t)&&t.some(n=>n&&n.size);this.occurrenceEmphasis=s?t.map(n=>n&&n.size?new Map(n):null):null,this.dimCopper=!!a,this.uploadNetMask(),this.invalidate()}get netHighlightActive(){return!!(this.emphasizedNetIds.size||this.occurrenceEmphasis||this.dimCopper)}setEmphasizedNetIds(t){this.emphasizedNetIds=Ws(t),this.occurrenceEmphasis=null;let a=dc(this.emphasizedNetIds,this.netMaskCapacity);a!==this.netMaskCapacity&&(this.netMaskBuffer?.destroy?.(),this.netMaskCapacity=a,this.netMaskBuffer=this.createNetMaskBuffer(a),this.rebindAll()),this.uploadNetMask(),this.invalidate()}rebindAll(){for(let t of this.entries)t.bindGroup=this.makeBindGroup(this.drawSlotBuffer,t.drawSlot*lt);this.barrels&&(this.barrels.bindGroup=this.makeBindGroup(this.barrels.drawBuffer)),this.box&&(this.box.bindGroup=this.makeBindGroup(this.box.drawBuffer)),this.cull&&(this.cull.bindGroup=this.makeCullBindGroup()),this.bundleCache.clear()}createFeatureMaskBuffer(t){return this.device.createBuffer({label:"feature-visibility-mask",size:t*Uint32Array.BYTES_PER_ELEMENT,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST})}createDrawSlotBuffer(t){return this.device.createBuffer({label:"draw-uniforms",size:t*lt,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST})}allocateDrawSlot(){if(this.freeDrawSlots.length)return this.freeDrawSlots.pop();if(this.nextDrawSlot>=this.drawSlotCapacity){let t=this.drawSlotCapacity*2,a=new Float32Array(t*Ma);a.set(this.drawStaging),this.drawSlotBuffer.destroy?.(),this.drawSlotCapacity=t,this.drawSlotBuffer=this.createDrawSlotBuffer(t),this.drawStaging=a,this.rebindAll()}return this.nextDrawSlot++}flushDraws(t){if(!t.length)return;let a=1/0,s=-1;for(let n of t)a=Math.min(a,n.drawSlot),s=Math.max(s,n.drawSlot);this.device.queue.writeBuffer(this.drawSlotBuffer,a*lt,this.drawStaging,a*Ma,(s-a+1)*Ma)}invalidate(){this.version+=1}setBarrelColor(t){this.barrelColor=[...t],this.invalidate()}makeBindGroup(t,a=0){return this.device.createBindGroup({layout:this.bindGroupLayout,entries:[{binding:0,resource:{buffer:this.globalBuffer}},{binding:1,resource:{buffer:t,offset:a,size:lt}},{binding:2,resource:{buffer:this.layerOffsetBuffer}},{binding:3,resource:{buffer:this.featureMaskBuffer}},{binding:4,resource:{buffer:this.netMaskBuffer}},{binding:5,resource:{buffer:this.occurrenceBuffer}},{binding:6,resource:{buffer:this.barrelRecordBuffer}},{binding:7,resource:{buffer:this.listBuffer}},{binding:8,resource:{buffer:this.placementBuffer}}]})}uploadFeatureMask(){let t=Ul(this.hiddenFeatureIds,this.featureMaskCapacity);this.device.queue.writeBuffer(this.featureMaskBuffer,0,t)}setHiddenFeatureIds(t){this.hiddenFeatureIds=mn(t);let a=Dl(this.hiddenFeatureIds,this.featureMaskCapacity);a!==this.featureMaskCapacity&&(this.featureMaskBuffer?.destroy?.(),this.featureMaskCapacity=a,this.featureMaskBuffer=this.createFeatureMaskBuffer(a),this.rebindAll()),this.uploadFeatureMask(),this.bundleCache.clear(),this.invalidate()}depthStencilState(t=null,a=!0){let s={format:this.depthFormat,depthWriteEnabled:a,depthCompare:"greater"};return this.stencil&&t&&(s.stencilFront=t,s.stencilBack=t),s}makePipeline(t,a,s,n,r,i={}){let o=this.createShaderModule(a,r);return this.device.createRenderPipeline({layout:t,vertex:{module:o,entryPoint:"vs",buffers:n},fragment:{module:o,entryPoint:"fs",...i.constants?{constants:i.constants}:{},targets:[{format:s,blend:s===ra?void 0:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"triangle-list",cullMode:i.cullMode??"none"},depthStencil:this.depthStencilState(i.stencil,i.depthWrite??!0),multisample:{count:1}})}makeBarrelPipeline(t,a,s,n,r=!0){let i=this.createShaderModule(a,n);return this.device.createRenderPipeline({layout:t,vertex:{module:i,entryPoint:"vs",buffers:[{arrayStride:28,attributes:[{shaderLocation:0,offset:0,format:"float32x3"},{shaderLocation:1,offset:12,format:"float32x3"},{shaderLocation:2,offset:24,format:"float32"}]},...r?[zl]:[]]},fragment:{module:i,entryPoint:"fs",targets:[{format:s,blend:s===ra?void 0:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"triangle-list",cullMode:"none"},depthStencil:this.depthStencilState()})}createShaderModule(t,a){let s=this.device.createShaderModule({label:`pcb-${a}`,code:t});return typeof s.getCompilationInfo=="function"&&s.getCompilationInfo().then(n=>{let r=[...n.messages||[]];if(r.length){console.groupCollapsed(`WebGPU shader compilation info: pcb-${a}`);for(let i of r)console[i.type==="error"?"error":"warn"](`${i.type} ${i.lineNum}:${i.linePos} ${i.message}`);console.groupEnd()}}),s}resize(){let t=Math.min(devicePixelRatio||1,2),a=Math.max(1,Math.floor(this.canvas.clientWidth*t)),s=Math.max(1,Math.floor(this.canvas.clientHeight*t));this.canvas.width===a&&this.canvas.height===s||(this.canvas.width=a,this.canvas.height=s,this.depth?.destroy(),this.pickTexture?.destroy(),this.depth=this.device.createTexture({size:[a,s],format:this.depthFormat,usage:GPUTextureUsage.RENDER_ATTACHMENT}),this.pickTexture=this.device.createTexture({size:[a,s],format:ra,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC}))}addPrimitive(t,a){let s=t.position.length/3,n=new ArrayBuffer(s*Ti),r=new Uint32Array(n),i=new Uint16Array(n),o=new Int8Array(n),c=Hy(t.position);for(let m=0;m<s;m+=1){let x=m*5,M=m*3;qy(i,x*2,t.position,M,c),Xy(o,(x+2)*4,t.normal,M),r[x+3]=t.netId[m]||0,r[x+4]=t.objectFeatureId[m]||0}let l=this.arenas(),f=l.vertex.alloc(n.byteLength);l.vertex.write(f,n);let{indices:d,format:h}=Wy(t.indices,s),g=l.index.alloc(d.byteLength);l.index.write(g,d);let p=this.allocateDrawSlot(),u=this.makeBindGroup(this.drawSlotBuffer,p*lt),y=sd(a,this.innerCopperAtFull),b={...a,drawClass:y,slot:this.allocSlot(t.indices.length,a.placements?zy|a.placements<<3:y),placementCount:a.placements||0,placementBase:0,bounds:t.bounds||a.bounds||null,id:this.nextEntryId++,vertexAllocation:f,indexAllocation:g,quantMin:c.min,quantSize:c.size,indexFormat:h,indexCount:t.indices.length,drawSlot:p,bindGroup:u};return this.entries.push(b),this.bundleCache.clear(),this.invalidate(),b}arenas(){let t=this.shareFrom||this;return t.geometryArenas??={vertex:new Za(t.device,GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST,"geometry-vertices"),index:new Za(t.device,GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST,"geometry-indices")},t.geometryArenas}arenaSlackBytes(){let t=this.geometryArenas;return t?t.vertex.reservedBytes()-t.vertex.usedBytes+t.index.reservedBytes()-t.index.usedBytes:0}arenaStats(){let t=this.geometryArenas;if(!t)return{chunks:0,reserved:0,used:0};let a=s=>s.chunks.reduce((n,r)=>n+r.free.filter(i=>i.offset+i.size<r.size).reduce((i,o)=>i+o.size,0),0);return{chunks:t.vertex.chunks.length+t.index.chunks.length,reserved:t.vertex.reservedBytes()+t.index.reservedBytes(),used:t.vertex.usedBytes+t.index.usedBytes,holes:a(t.vertex)+a(t.index)}}componentPipelines(t){let a=this.shareFrom||this,s=a.componentPipelineSets.get(t);if(!s){let{instanced:n,features:r,key:i}=a.pipelineSetKinds.get(t),o=a.pipelineLayout,c=a.vertexBuffers,l=ki("component",n,r),f=ki("componentPick",n,r),d=`${n?"-instanced":""}${i?`+${i}`:""}`;s={main:a.makePipeline(o,l,a.format,c,`component${d}`,{stencil:ed}),blend:a.makePipeline(o,l,a.format,c,`component-blend${d}`),pick:a.makePipeline(o,f,ra,c,`component-pick${d}`)},a.componentPipelineSets.set(t,s)}return s}addInstancedPrimitives(t){let a=t.map(({primitive:s,placements:n,metadata:r})=>{let i=this.addPrimitive(s,{...r,placements:n.length});return i.placementRecords=n,i});return this.writePlacements(),a}writePlacements(){let t=this.entries.filter(o=>o.placementRecords),a=t.reduce((o,c)=>o+c.placementRecords.length,0),s=new ArrayBuffer(Math.max(1,a)*Mi),n=new Float32Array(s),r=new Uint32Array(s),i=0;for(let o of t){o.placementBase=i;for(let c of o.placementRecords){let l=i*(Mi/4);n.set(c.rows,l),r[l+12]=c.featureId||0,i+=1}}this.placementBuffer.size<s.byteLength&&(this.placementBuffer.destroy?.(),this.placementBuffer=this.device.createBuffer({label:"component-placements",size:s.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.rebindAll()),this.device.queue.writeBuffer(this.placementBuffer,0,s),this.invalidate()}removeEntries(t){if(!t?.length)return;let a=new Set(t.map(s=>s.id));for(let s of t){let n=this.arenas();s.vertexAllocation&&n.vertex.free(s.vertexAllocation),s.indexAllocation&&n.index.free(s.indexAllocation),this.freeDrawSlots.push(s.drawSlot),s.slot!=null&&(this.setSlot(s.slot,0,4),this.freeSlots.push(s.slot))}this.entries=this.entries.filter(s=>!a.has(s.id)),t.some(s=>s.placementRecords)&&this.writePlacements(),this.bundleCache.clear(),this.invalidate()}dispose(){this.removeEntries(this.entries),this.shareFrom||(this.geometryArenas?.vertex.destroy(),this.geometryArenas?.index.destroy(),this.geometryArenas=null),this.barrels&&(this.barrels.vertexBuffer?.destroy?.(),this.barrels.indexBuffer?.destroy?.(),this.barrels.instanceBuffer?.destroy?.(),this.barrels.drawBuffer?.destroy?.(),this.barrels=null),this.depth?.destroy(),this.pickTexture?.destroy(),this.featureMaskBuffer?.destroy?.(),this.occurrenceBuffer?.destroy?.(),this.barrelRecordBuffer?.destroy?.(),this.listBuffer?.destroy?.(),this.argsBuffer?.destroy?.(),this.classesBuffer?.destroy?.();for(let t of[this.box?.vertexBuffer,this.box?.indexBuffer,this.box?.drawBuffer,this.cull?.uniform,this.cull?.lods,this.cull?.counters,this.cull?.readback])t?.destroy?.();this.box=null,this.cull=null,this.drawSlotBuffer?.destroy?.(),this.depth=null,this.pickTexture=null,this.featureMaskBuffer=null,this.bundleCache.clear()}setBarrels(t){if(!t?.length)return;let a=rd,s=[],n=[],r=(u,y,b)=>{let m=s.length/7;for(let x=0;x<a;x+=1){let M=Math.PI*2*(x+.5)/a,E=Math.cos(M),T=Math.sin(M),[I,A,R]=b(E,T);s.push(E,T,y,I,A,R,u)}return m},i=(u,y)=>{for(let b=0;b<a;b+=1){let m=(b+1)%a;n.push(u+b,u+m,y+m,u+b,y+m,y+b)}};for(let u of[0,1]){let y=u?(b,m)=>[-b,-m,0]:(b,m)=>[b,m,0];i(r(u,0,y),r(u,1,y))}for(let[u,y]of[[0,1],[1,-1]]){let b=()=>[0,0,y];i(r(0,u,b),r(2,u,b))}let o=new Float32Array(s),c=new Uint16Array(n),l=Hl(t),f=this.device.createBuffer({size:o.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),d=this.device.createBuffer({size:c.byteLength,usage:GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST}),h=this.device.createBuffer({size:l.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});this.device.queue.writeBuffer(f,0,o),this.device.queue.writeBuffer(d,0,c),this.device.queue.writeBuffer(h,0,l);let g=ql(t);this.barrelRecordBuffer?.destroy?.(),this.barrelRecordBuffer=this.device.createBuffer({label:"barrel-records",size:g.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.device.queue.writeBuffer(this.barrelRecordBuffer,0,g);let p=this.device.createBuffer({size:lt,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.barrels={records:t,vertexBuffer:f,indexBuffer:d,instanceBuffer:h,indexCount:c.length,instanceCount:t.length,drawBuffer:p,bindGroup:null},this.setSlot(0,c.length,2),this.rebindAll(),this.invalidate()}render(t){let{panels:a,layerOffsets:s}=t;this.resize(),this.device.queue.writeBuffer(this.layerOffsetBuffer,0,s);let n=this.context.getCurrentTexture().createView(),r=0,i=0;a.forEach((o,c)=>{let l=this.device.createCommandEncoder(),f=!this.identityOnly&&this.encodeCull(l,o),d=l.beginRenderPass({colorAttachments:[{view:n,clearValue:{r:.91,g:.93,b:.94,a:1},loadOp:c===0?"clear":"load",storeOp:"store"}],depthStencilAttachment:this.depthAttachment()}),h=Ei(o.viewport,this.canvas.width,this.canvas.height);d.setViewport(h.x,h.y,h.width,h.height,0,1),d.setScissorRect(h.x,h.y,h.width,h.height);let g=this.encodeDraws(d,o,t);r+=g.triangles,i+=g.draws,d.end(),this.device.queue.submit([l.finish()]),f&&this.readCullCounts()}),this.frameStats={triangles:Math.round(r),draws:i}}renderInto(t,a,s){if(!this.identityOnly)throw new Error("renderInto: one-board renderer only");let n=this.device.createCommandEncoder({label:"inset"}),r={view:t.depthView,depthClearValue:0,depthLoadOp:"clear",depthStoreOp:"store"};this.stencil&&Object.assign(r,{stencilClearValue:0,stencilLoadOp:"clear",stencilStoreOp:"discard"});let i=n.beginRenderPass({colorAttachments:[{view:t.colorView,clearValue:{r:.91,g:.93,b:.94,a:1},loadOp:"clear",storeOp:"store"}],depthStencilAttachment:r}),o=Ei(a.viewport,t.width,t.height);i.setViewport(o.x,o.y,o.width,o.height,0,1),i.setScissorRect(o.x,o.y,o.width,o.height);let c=this.encodeDraws(i,a,s);return i.end(),this.device.queue.submit([n.finish()]),c}encodeDraws(t,a,{activeNetId:s,selectedFeatureId:n,time:r,visibleLayers:i,showBoard:o,showComponents:c,showPaste:l=!0,componentOpacity:f,boardOpacity:d,isolateNet:h,compareMode:g=!1,compareOffsets:p=new Map,layerAlphas:u=null,visibleTileIds:y=null,layerOffsets:b=null}){let m=0,x=0,M=null;this.stencil&&t.setStencilReference(1),this.writeGlobals(a.matrix,s,a.layerId,r,n);let{pipelines:E,indirect:T,barrelInstances:I}=this.drawSet(),A=!l||!!(s||this.netHighlightActive),R=this.entries.filter(O=>this.visible(O,a.layerId,i,o,c,f,g,y)&&!(A&&O.boardRole==="paste")),_=R.filter(O=>!xn(O)).sort((O,F)=>+!!O.stencilMark-+!!F.stencilMark),B=R.filter(O=>xn(O)).sort((O,F)=>xn(O)-xn(F));for(let O of R)this.writeDraw(O,s,f,d,h,g,p.get(O.layerId),u?.get(O.layerId)??1);this.flushDraws(R),_.length>64?t.executeBundles([this.renderBundle(_,a.layerId)]):this.drawEntries(t,_,E,T);for(let O of R)m+=O.indexCount/3*this.countFor(O.drawClass)*(O.placementCount||1);return x+=R.length,this.analytic&&!g&&(M={matrix:a.matrix,showBoard:o,boardOpacity:d,hidePaste:A,panelLayer:a.layerId,assemblyOpacity:l?1:f},x+=this.analytic.encodeInto(t,b,a.layerId?new Set([a.layerId]):i,!1,M),x+=this.analytic.encodeBarrels(t,b,a.matrix)),!g&&this.barrels&&!this.analytic?.hasBarrels()&&(a.layerId===0||i.has(a.layerId))&&(this.writeBarrelDraw(h),this.drawBarrels(t,E.barrel,T,I),m+=this.barrels.indexCount/3*this.countFor(2),x+=1),T&&!g&&(this.drawBox(t,E.box),m+=12*this.countFor(3),x+=1),M&&(x+=this.analytic.encodeBlended(t,b,a.layerId?new Set([a.layerId]):i,M)),this.drawBlended(t,B,E,T),{triangles:m,draws:x}}depthAttachment(){let t={view:this.depth.createView(),depthClearValue:0,depthLoadOp:"clear",depthStoreOp:"store"};return this.stencil&&Object.assign(t,{stencilClearValue:0,stencilLoadOp:"clear",stencilStoreOp:"discard"}),t}drawEntries(t,a,s,n){let r=null;for(let i of a){let o=i.placementCount?this.componentPipelines(s).main:i.stencilMark?s.mark:s.main;o!==r&&(t.setPipeline(o),r=o),this.drawEntry(t,i,n)}}drawBlended(t,a,s,n){for(let r of a)if(r.boardRole==="soldermask"&&r.kind==="board")t.setPipeline(s.mask),this.drawEntry(t,r,n),s.maskCovered&&(t.setPipeline(s.maskCovered),this.drawEntry(t,r,n));else{let i=r.translucent?s.translucent??s.blend:s.blend;t.setPipeline(r.placementCount?this.componentPipelines(s).blend:i),this.drawEntry(t,r,n)}}setPlaceholdersVisible(t){this.showPlaceholders=!!t,this.invalidate()}visible(t,a,s,n,r,i,o=!1,c=null){return t.placeholder&&!this.showPlaceholders||t.kind==="copper"&&this.analytic?.coversLayer(t.layerId)||t.kind==="board"&&this.analytic?.coversRole(t.boardRole)||t.kind==="board"&&t.boardRole==="pad"||!o&&t.kind==="copper"&&c&&!c.has(t.tileId)?!1:o?t.kind==="copper"&&s.has(t.layerId):t.innerCopper&&this.innerCopperMode==="none"?!1:t.boardRole==="paste"?a===0&&s.has(t.layerId):t.kind==="board"?a===0&&n:t.kind==="component"?a===0&&r&&i>.001:a?t.layerId===a:s.has(t.layerId)}writeGlobals(t,a,s,n,r=0){let i=this.globalScratch,o=this.globalScratchF32;o.fill(0),o.set(t,0);let c=this.globalScratchView;c.setUint32(64,a||0,!0),c.setUint32(68,s||0,!0),c.setFloat32(72,n,!0),c.setFloat32(76,a||this.netHighlightActive?1:0,!0),c.setUint32(80,r||0,!0),c.setUint32(84,this.selectedOccurrence>=0?this.selectedOccurrence+1+this.occurrenceBase:0,!0),c.setUint32(88,this.occurrenceBase,!0),c.setUint32(92,this.emphasisStride,!0),o.set([.35,-.5,.8,0],24),this.device.queue.writeBuffer(this.globalBuffer,0,i)}writeDraw(t,a,s,n=1,r=!1,i=!1,o=null,c=1){let l=this.drawStaging.subarray(t.drawSlot*Ma,(t.drawSlot+1)*Ma);l.fill(0);let f=t.color||t.material.baseColor;l.set(f,0),l.set([t.material.metallic||0,t.material.roughness??.72,t.opacityScale!=null?s:0,Vy[t.drawClass]??1],4);let d=Yy(t);l.set([o?.[0]||0,o?.[1]||0,(i?-(t.baseZ||0):t.layerOffset||0)+d,t.kind==="copper"||t.boardRole==="paste"?Number(t.layerId||0)+1:0],8);let h=Number.isFinite(f?.[3])?f[3]:1,g=t.kind==="component"?s*(t.opacityScale??1):t.kind==="board"&&t.boardRole!=="paste"?n*$y(t,h):c,p=t.kind==="copper"?1:t.kind==="component"?2:0,u=r?1:t.innerCopper&&this.innerCopperMode==="lit"?2:0;if(l.set([p,g,u,i?1:0],12),t.placementCount){let y=new Uint32Array(l.buffer,l.byteOffset+64,2);y[0]=t.placementBase,y[1]=t.placementCount}l.set(t.quantMin,20),l.set(t.quantSize,24)}writeBarrelDraw(t=!1){let a=this.barrelDrawScratch;a.fill(0),a.set(this.barrelColor,0),a.set([.75,.32,0,0],4),a.set([1,1,t?1:0,0],12),this.device.queue.writeBuffer(this.barrels.drawBuffer,0,a)}renderBundle(t,a){let{pipelines:s,indirect:n}=this.drawSet(),{vertex:r,index:i}=this.arenas(),o=`${a}:${n?"indirect":"single"}:${this.shaderFeatureKey}:${r.generation}.${i.generation}:${t.map(d=>d.id).join(",")}`,c=this.bundleCache.get(o);if(c)return c;let l=this.device.createRenderBundleEncoder({colorFormats:[this.format],depthStencilFormat:this.depthFormat});this.drawEntries(l,t,s,n);let f=l.finish();return this.bundleCache.set(o,f),this.bundleCache.size>32&&this.bundleCache.delete(this.bundleCache.keys().next().value),f}pick(t,a,s,n){let r=this.pickSerial.then(()=>this.performPick(t,a,s,n));return this.pickSerial=r.catch(()=>0),r}async performPick(t,a,s,n){this.resize();let r=Math.max(0,Math.min(this.canvas.width-1,Math.floor(a))),i=Math.max(0,Math.min(this.canvas.height-1,Math.floor(s)));this.device.queue.writeBuffer(this.layerOffsetBuffer,0,n.layerOffsets);let o=this.device.createCommandEncoder(),c=o.beginRenderPass({colorAttachments:[{view:this.pickTexture.createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}],depthStencilAttachment:this.depthAttachment()}),l=Ei(t.viewport,this.canvas.width,this.canvas.height);return c.setViewport(l.x,l.y,l.width,l.height,0,1),c.setScissorRect(l.x,l.y,l.width,l.height),this.encodePick(c,t,n),c.end(),this.readPick(o,r,i)}encodePick(t,a,s){this.writeGlobals(a.matrix,s.activeNetId,a.layerId,performance.now()/1e3,s.selectedFeatureId);let{pipelines:n,indirect:r,barrelInstances:i}=this.drawSet();t.setPipeline(n.pick);let o=[];for(let c of this.entries)this.visible(c,a.layerId,s.visibleLayers,s.showBoard,s.showComponents,s.componentOpacity,s.compareMode,s.visibleTileIds)&&(c.kind==="board"&&(this.identityOnly||c.boardRole!=="substrate")||(this.writeDraw(c,s.activeNetId,s.componentOpacity,s.boardOpacity,s.isolateNet,s.compareMode,s.compareOffsets?.get(c.layerId)),o.push(c)));this.flushDraws(o);for(let c of o)t.setPipeline(c.placementCount?this.componentPipelines(n).pick:n.pick),this.drawEntry(t,c,r);if(!s.compareMode&&this.barrels&&!this.analytic?.hasBarrels()&&(this.writeBarrelDraw(s.isolateNet),this.drawBarrels(t,n.barrelPick,r,i)),r&&!s.compareMode&&this.drawBox(t,n.boxPick),this.analytic&&!s.compareMode){let c=a.layerId?new Set([a.layerId]):s.visibleLayers;this.analytic.encodeInto(t,s.layerOffsets,c,!0,{matrix:a.matrix,panelLayer:a.layerId}),this.analytic.encodeBarrels(t,s.layerOffsets,a.matrix,!0)}}async readPick(t,a,s){let n=this.device.createBuffer({label:"pick-readback",size:256,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});t.copyTextureToBuffer({texture:this.pickTexture,origin:{x:a,y:s}},{buffer:n,bytesPerRow:256},{width:1,height:1}),this.device.queue.submit([t.finish()]);try{await n.mapAsync(GPUMapMode.READ);let r=new DataView(n.getMappedRange()),i=r.getUint32(0,!0),o=r.getUint32(4,!0);if(n.unmap(),this.analytic&&i&2147483648&&o)return{kind:"analytic",occurrenceIndex:-1,featureId:0,operationIndex:o-1,occurrenceKey:null};let c=Bl(i,o);return{...c,occurrenceKey:c.occurrenceIndex>=0?this.occurrenceKeys[c.occurrenceIndex]??null:null}}finally{n.mapState==="mapped"&&n.unmap(),n.destroy()}}},Vy=Object.freeze({0:1,1:0,5:2});function Hy(e){let t=[1/0,1/0,1/0],a=[-1/0,-1/0,-1/0];for(let s=0;s<e.length;s+=3)for(let n=0;n<3;n+=1){let r=e[s+n];r<t[n]&&(t[n]=r),r>a[n]&&(a[n]=r)}return Number.isFinite(t[0])?{min:t,size:t.map((s,n)=>a[n]>s?a[n]-s:1)}:{min:[0,0,0],size:[1,1,1]}}function qy(e,t,a,s,n){for(let r=0;r<3;r+=1){let i=(a[s+r]-n.min[r])/n.size[r];e[t+r]=Math.max(0,Math.min(65535,Math.round(i*65535)))}e[t+3]=0}function Xy(e,t,a,s){for(let n=0;n<3;n+=1){let r=Number(a[s+n])||0;e[t+n]=Math.max(-127,Math.min(127,Math.round(r*127)))}e[t+3]=0}function Wy(e,t){if(t<=65536){let a=new Uint16Array(e.length+(e.length&1));return a.set(e),{indices:a,format:"uint16"}}return{indices:e instanceof Uint32Array?e:new Uint32Array(e),format:"uint32"}}function Nd(e,t){return e*Ti+(e<=65536?(t+(t&1))*2:t*4)}function sd(e,t){return e.kind==="component"||e.innerCopper&&t?1:e.kind==="board"&&(e.boardRole==="substrate"||e.boardRole==="soldermask")?5:0}function xn(e){return e.translucent?3:e.kind!=="board"?0:e.boardRole==="soldermask"?1:e.boardRole==="silkscreen"?2:0}function $y(e,t){return e.kind!=="board"||e.boardRole==="substrate"?1:e.boardRole==="soldermask"?Math.min(t,.72):e.boardRole==="silkscreen"?Math.min(t,.92):t}function Yy(e){if(e.kind!=="board"||e.boardRole!=="soldermask"&&e.boardRole!=="silkscreen")return 0;let t=e.bounds,s=(t?(t[2]+t[5])*.5:0)<0?-1:1,n=e.boardRole==="silkscreen"?35e-6:18e-6;return s*n}function Ei(e,t,a){let s=Math.max(0,Math.min(t-1,Math.floor(e.x))),n=Math.max(0,Math.min(a-1,Math.floor(e.y)));return{x:s,y:n,width:Math.max(1,Math.min(t-s,Math.floor(e.width))),height:Math.max(1,Math.min(a-n,Math.floor(e.height)))}}function Bd(e){return e*12+2}function Cd(e){let t=[],a=0,s=0,n=0;for(let g=0;g<e.length;g+=1){let p=Math.floor(e[g].samplesMm.length/3);p<2||(t.push(g),a+=p,s+=Bd(p),n+=(p-1)*12*6+72)}let r=new Float32Array(Math.max(a,1)*4),i=new ArrayBuffer(Math.max(t.length,1)*32),o=new Uint32Array(i),c=new Float32Array(i),l=new Uint32Array(Math.max(n,3)),f=0,d=0,h=0;return t.forEach((g,p)=>{let u=e[g],y=Math.floor(u.samplesMm.length/3);for(let x=0;x<y;x+=1)r[(f+x)*4]=u.samplesMm[x*3]*.001,r[(f+x)*4+1]=u.samplesMm[x*3+1]*.001,r[(f+x)*4+2]=u.samplesMm[x*3+2]*.001;o[p*8]=f,o[p*8+1]=y,o[p*8+2]=d,o[p*8+3]=p,c[p*8+4]=u.radiusMm*.001;let b=(x,M)=>d+x*12+M%12;for(let x=0;x+1<y;x+=1)for(let M=0;M<12;M+=1)l.set([b(x,M),b(x+1,M),b(x+1,M+1),b(x,M),b(x+1,M+1),b(x,M+1)],h),h+=6;let m=d+y*12;for(let x=0;x<12;x+=1)l.set([m,b(0,x+1),b(0,x)],h),l.set([m+1,b(y-1,x),b(y-1,x+1)],h+3),h+=6;f+=y,d+=Bd(y)}),{samples:r,segments:o,indices:l,kept:t,sampleCount:a,vertexCount:s,indexCount:n}}var Qy=`
struct Segment { start: u32, count: u32, vertexStart: u32, color: u32, radius: f32, p0: u32, p1: u32, p2: u32 };
struct Vertex { position: vec4f, normal: vec4f };
`,Zy=`${Qy}
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
`,e0=`
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
`,Fd=96,Tn=class{constructor(t){this.host=t,this.device=t.device,this.counts={segments:0,samples:0,vertices:0,indices:0},this.dirty=!1,this.kept=[];let a=this.device,s=a.createShaderModule({label:"harness-tubes-compute",code:Zy});this.computeLayout=a.createBindGroupLayout({label:"harness-tubes-compute",entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},{binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},{binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},{binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},{binding:4,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}}]});let n=a.createPipelineLayout({bindGroupLayouts:[this.computeLayout]});this.framesPipeline=a.createComputePipeline({layout:n,compute:{module:s,entryPoint:"framesMain"}}),this.ringsPipeline=a.createComputePipeline({layout:n,compute:{module:s,entryPoint:"ringsMain"}});let r=a.createShaderModule({label:"harness-tubes-draw",code:e0});this.drawLayout=a.createBindGroupLayout({label:"harness-tubes-draw",entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}}]}),this.drawPipeline=a.createRenderPipeline({label:"harness-tubes",layout:a.createPipelineLayout({bindGroupLayouts:[this.drawLayout]}),vertex:{module:r,entryPoint:"vs",buffers:[{arrayStride:32,attributes:[{shaderLocation:0,offset:0,format:"float32x4"},{shaderLocation:1,offset:16,format:"float32x4"}]}]},fragment:{module:r,entryPoint:"fs",targets:[{format:t.format}]},primitive:{topology:"triangle-list",cullMode:"none"},depthStencil:t.depthStencilState(),multisample:{count:1}}),this.globals=a.createBuffer({label:"harness-tubes-globals",size:Fd,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.countBuffer=a.createBuffer({label:"harness-tubes-counts",size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.buffers={},this.capacity={samples:0,segments:0,vertices:0,indices:0},this.globalScratch=new Float32Array(Fd/4)}ensure(t,a,s){let n=this.buffers[t];return n&&n.size>=a?!1:(n?.destroy(),this.buffers[t]=this.device.createBuffer({label:`harness-tubes-${t}`,size:Math.max(256,Math.ceil(a*1.5/4)*4),usage:s}),!0)}setTubes(t,a){let s=Cd(t);if(this.kept=s.kept.map(o=>t[o]),this.counts={segments:s.kept.length,samples:s.sampleCount,vertices:s.vertexCount,indices:s.indexCount},!this.counts.segments){this.dirty=!1;return}let n=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,r=!1;r=this.ensure("samples",s.samples.byteLength,n)||r,r=this.ensure("segments",s.segments.byteLength,n)||r,r=this.ensure("frames",s.samples.byteLength,GPUBufferUsage.STORAGE)||r,r=this.ensure("vertices",this.counts.vertices*32,GPUBufferUsage.STORAGE|GPUBufferUsage.VERTEX)||r,this.ensure("indices",s.indices.byteLength,GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST);let i=this.device.queue;i.writeBuffer(this.buffers.samples,0,s.samples),i.writeBuffer(this.buffers.segments,0,s.segments),i.writeBuffer(this.buffers.indices,0,s.indices),i.writeBuffer(this.countBuffer,0,new Uint32Array([this.counts.segments,this.counts.samples,this.counts.vertices,0])),(r||!this.computeGroup)&&(this.computeGroup=this.device.createBindGroup({layout:this.computeLayout,entries:["samples","segments","frames","vertices"].map((o,c)=>({binding:c,resource:{buffer:this.buffers[o]}})).concat([{binding:4,resource:{buffer:this.countBuffer}}])})),this.setColors(a),this.dirty=!0}setColors(t){if(!this.counts.segments)return;let a=new Float32Array(this.counts.segments*4);this.kept.forEach((s,n)=>{let{rgb:r,mode:i}=t(s);a.set([r[0],r[1],r[2],i],n*4)}),(this.ensure("colors",a.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST)||!this.drawGroup||this.drawGroupColors!==this.buffers.colors)&&(this.drawGroup=this.device.createBindGroup({layout:this.drawLayout,entries:[{binding:0,resource:{buffer:this.globals}},{binding:1,resource:{buffer:this.buffers.colors}}]}),this.drawGroupColors=this.buffers.colors),this.device.queue.writeBuffer(this.buffers.colors,0,a)}encodeCompute(t){if(!this.dirty||!this.counts.segments)return;let a=t.beginComputePass({label:"harness-tubes"});a.setBindGroup(0,this.computeGroup),a.setPipeline(this.framesPipeline),a.dispatchWorkgroups(Math.ceil(this.counts.segments/64)),a.setPipeline(this.ringsPipeline),a.dispatchWorkgroups(Math.ceil(this.counts.vertices/64)),a.end(),this.dirty=!1}draw(t,a,s=0){if(!this.counts.segments)return 0;let n=this.globalScratch;return n.fill(0),n.set(a,0),n.set([.35,-.45,.82,0],16),n[20]=s,this.device.queue.writeBuffer(this.globals,0,n),t.setPipeline(this.drawPipeline),t.setBindGroup(0,this.drawGroup),t.setVertexBuffer(0,this.buffers.vertices),t.setIndexBuffer(this.buffers.indices,"uint32"),t.drawIndexed(this.counts.indices),this.counts.indices/3}gpuMemoryBytes(){return Object.values(this.buffers).reduce((t,a)=>t+a.size,0)}dispose(){for(let t of Object.values(this.buffers))t.destroy();this.globals.destroy(),this.countBuffer.destroy(),this.buffers={}}};var t0=[0,0,0,1,1,1],Sn=class e{static async create(t){return new e(await ia.create(t))}constructor(t){this.host=t,this.canvas=t.canvas,this.device=t.device,t.alwaysInstanced=!0,t.setOccurrences([]),this.assets=new Map,this.order=[],this.frameStats={triangles:0,draws:0},this.lodThresholds={...at},this.tubes=null,this.tubeVersion=0}setTubes(t,a){!t.length&&!this.tubes||(this.tubes??=new Tn(this.host),this.tubes.setTubes(t,a),this.tubeVersion+=1)}setTubeColors(t){this.tubes?.setColors(t),this.tubeVersion+=1}asset(t){let a=this.assets.get(t);return a||(a=new ia(this.canvas,this.device,{shareFrom:this.host}),a.setLodThresholds(this.lodThresholds),this.assets.set(t,a)),a}standIn(t,a){let s=this.asset(t);return s.standIn||(s.standIn=!0,s.setBoardBounds(t0),s.setLodOverride(Fl)),s.boxColor=[...a],s}removeAsset(t){let a=this.assets.get(t);a&&(a.dispose(),this.assets.delete(t))}get renderers(){return this.order.map(t=>this.assets.get(t)).filter(Boolean)}setOccurrences(t){this.order=[...t.keys()].filter(s=>this.assets.has(s));for(let[s,n]of this.assets)t.has(s)||n.setOccurrences([]);for(let s of this.order)this.assets.get(s).setOccurrences(t.get(s));let a=0;for(let s of this.renderers)s.occurrenceBase=a,a+=s.occurrenceCount;this.occurrenceCount=a}locate(t){for(let a of this.renderers){let s=t-a.occurrenceBase;if(s>=0&&s<a.occurrenceCount)return{renderer:a,local:s}}return null}keyOf(t){let a=this.locate(t);return a?a.renderer.occurrenceKeys[a.local]??null:null}setSelectedOccurrence(t){let a=t>=0?this.locate(t):null;for(let s of this.renderers)s.selectedOccurrence=!s.standIn&&a?.renderer===s?a.local:-1}resize(){this.host.resize()}render(t,a){let s=this.host;s.resize();let n=this.renderers.filter(d=>d.occurrenceCount>0),r=new Map(n.map(d=>[d,a(d)]));for(let[d,h]of r)Od(d,h);let i=this.device.createCommandEncoder(),o=n.filter(d=>d.encodeCull(i,t));this.tubes?.encodeCompute(i);let c=i.beginRenderPass({colorAttachments:[{view:s.context.getCurrentTexture().createView(),clearValue:{r:.91,g:.93,b:.94,a:1},loadOp:"clear",storeOp:"store"}],depthStencilAttachment:s.depthAttachment()});Pd(c,t.viewport,this.canvas);let l=0,f=0;for(let d of n){let h=d.encodeDraws(c,t,r.get(d));l+=h.triangles,f+=h.draws}this.tubes?.counts.segments&&(l+=this.tubes.draw(c,t.matrix,performance.now()/1e3),f+=1),c.end(),this.device.queue.submit([i.finish()]);for(let d of o)d.readCullCounts();this.frameStats={triangles:Math.round(l),draws:f}}pick(t,a,s,n){let r=this.host.pickSerial.then(()=>this.performPick(t,a,s,n));return this.host.pickSerial=r.catch(()=>0),r}async performPick(t,a,s,n){let r=this.host;r.resize();let i=Math.max(0,Math.min(this.canvas.width-1,Math.floor(a))),o=Math.max(0,Math.min(this.canvas.height-1,Math.floor(s))),c=this.device.createCommandEncoder(),l=c.beginRenderPass({colorAttachments:[{view:r.pickTexture.createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}],depthStencilAttachment:r.depthAttachment()});Pd(l,t.viewport,this.canvas);for(let h of this.renderers){if(h.occurrenceCount===0)continue;let g=n(h);Od(h,g),h.encodePick(l,t,g)}l.end();let f=await r.readPick(c,i,o),d=f.occurrenceIndex>=0?this.locate(f.occurrenceIndex):null;return{...f,occurrenceKey:d?d.renderer.occurrenceKeys[d.local]??null:null,renderer:d?.renderer||null,standIn:!!d?.renderer?.standIn}}gpuMemoryBytes(){let t=0;for(let a of this.renderers)t+=a.gpuMemoryBytes();return t+=this.tubes?.gpuMemoryBytes()||0,t+=this.host.arenaSlackBytes(),t-Math.max(0,this.renderers.length-1)*this.canvas.width*this.canvas.height*12}gpuMemoryBreakdown(){let t={};for(let[a,s]of this.assets){let n=s.gpuMemoryBreakdown();delete n.targets,t[a]=n}return{assets:t,tubes:this.tubes?.gpuMemoryBytes()||0,targets:this.canvas.width*this.canvas.height*12,arena:this.host.arenaStats()}}setLodThresholds(t){this.lodThresholds=wa({...this.lodThresholds,...t});for(let a of this.assets.values())a.setLodThresholds(this.lodThresholds);return{...this.lodThresholds}}cullCounts(){let t={full:0,board:0,body:0,box:0,culled:0};for(let a of this.renderers)if(a.occurrenceCount)for(let s of Object.keys(t))t[s]+=a.cullCounts[s]||0;return t}dispose(){for(let t of[...this.assets.keys()])this.removeAsset(t);this.tubes?.dispose(),this.tubes=null,this.host.dispose(),this.host.context?.unconfigure?.(),this.device.destroy?.()}};function Od(e,t){t?.layerOffsets&&e.device.queue.writeBuffer(e.layerOffsetBuffer,0,t.layerOffsets)}function Pd(e,t,a){let s=Math.max(0,Math.min(a.width-1,Math.floor(t.x))),n=Math.max(0,Math.min(a.height-1,Math.floor(t.y))),r=Math.max(1,Math.min(a.width-s,Math.floor(t.width))),i=Math.max(1,Math.min(a.height-n,Math.floor(t.height)));e.setViewport(s,n,r,i,0,1),e.setScissorRect(s,n,r,i)}var a0=`
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
}`,s0=`
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
}`,n0=`
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
}`,r0=`
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
}`,i0=`
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
}`,o0=`
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
}`,c0=`
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
}`,l0=6.2,d0=4.6,u0=3.8,An=4*1024*1024,f0=Math.floor(An/6),jd=f0*6,In=512*1024,Ld=512*1024,Dd=96,h0=96,b0=18,Ud=96*1024*1024,p0=2,Nn=class e{static async create(t,a){if(!navigator.gpu)throw new Error("WebGPU is unavailable in this browser");let s=await navigator.gpu.requestAdapter({powerPreference:"high-performance"});if(!s)throw new Error("No WebGPU adapter is available");let n=await s.requestDevice(),r=await fetch(a,{cache:"default"});if(!r.ok)throw new Error(`Failed to load schematic manifest: ${r.status}`);let i=await r.json();if(!["prism.schematic_world_a0","prism.schematic_vector_a0"].includes(i.schema))throw new Error(`Unsupported schematic scene schema: ${i.schema}`);let o=i.featureTable||i.features,c=await fetch(new URL(o,a),{cache:"default"});if(!c.ok)throw new Error(`Failed to load schematic features: ${c.status}`);let l=m0(await c.json());return new e(t,n,a,i,l)}constructor(t,a,s,n,r){this.canvas=t,this.device=a,this.manifestUrl=s,this.manifest=n,this.isNativeScene=n.schema==="prism.schematic_vector_a0",this.pages=n.pages||[],this.featuresByPage=r,this.featuresById=new Map;for(let g of Object.values(r))for(let p of g)this.featuresById.set(Number(p.id),p);this.context=t.getContext("webgpu"),this.format=navigator.gpu.getPreferredCanvasFormat(),this.context.configure({device:a,format:this.format,alphaMode:"opaque"}),this.flowCanvas=null,this.flowContext=null,this.globalBuffer=a.createBuffer({size:48,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.bindGroupLayout=a.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:2,visibility:GPUShaderStage.FRAGMENT,sampler:{type:"filtering"}},{binding:3,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:"float"}}]});let i=a.createShaderModule({code:a0});this.pagePipeline=a.createRenderPipeline({layout:a.createPipelineLayout({bindGroupLayouts:[this.bindGroupLayout]}),vertex:{module:i,entryPoint:"vs"},fragment:{module:i,entryPoint:"fs",targets:[{format:this.format}]},primitive:{topology:"triangle-list"}}),this.edgeLayout=a.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}}]});let o=a.createShaderModule({code:s0});this.edgePipeline=a.createRenderPipeline({layout:a.createPipelineLayout({bindGroupLayouts:[this.edgeLayout]}),vertex:{module:o,entryPoint:"vs",buffers:[{arrayStride:8,attributes:[{shaderLocation:0,offset:0,format:"float32x2"}]}]},fragment:{module:o,entryPoint:"fs",targets:[{format:this.format,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"line-list"}}),this.edgeBindGroup=a.createBindGroup({layout:this.edgeLayout,entries:[{binding:0,resource:{buffer:this.globalBuffer}}]});let c=a.createShaderModule({code:n0});this.highlightPipeline=a.createRenderPipeline({layout:a.createPipelineLayout({bindGroupLayouts:[this.edgeLayout]}),vertex:{module:c,entryPoint:"vs",buffers:[{arrayStride:8,attributes:[{shaderLocation:0,offset:0,format:"float32x2"}]}]},fragment:{module:c,entryPoint:"fs",targets:[{format:this.format,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"line-list"}}),this.highlightBufferSize=4*1024*1024,this.highlightBuffer=a.createBuffer({size:this.highlightBufferSize,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});let l=a.createShaderModule({code:r0});this.netFlowPipeline=a.createRenderPipeline({layout:a.createPipelineLayout({bindGroupLayouts:[this.edgeLayout]}),vertex:{module:l,entryPoint:"vs",buffers:[{arrayStride:16,attributes:[{shaderLocation:0,offset:0,format:"float32x2"},{shaderLocation:1,offset:8,format:"float32x2"}]}]},fragment:{module:l,entryPoint:"fs",targets:[{format:this.format,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"triangle-list"}}),this.netFlowBuffer=a.createBuffer({size:Ld*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),this.globalUniformScratch=new Float32Array(12),this.pageUniformScratch=new Float32Array(8),this.imageUniformScratch=new Float32Array(8),this.vectorScratch=new Float32Array(An),this.highlightScratch=new Float32Array(this.highlightBufferSize/4),this.netFlowScratch=new Float32Array(Ld),this.netTrackingCache=null,this.selectedIntrasheetLinkIndex=-1,this.truncatedHighlightCount=0,this.truncatedVectorCount=0,this.frameSerial=0,this.querySerial=0;let f=a.createShaderModule({code:i0});this.vectorPipeline=a.createRenderPipeline({layout:a.createPipelineLayout({bindGroupLayouts:[this.edgeLayout]}),vertex:{module:f,entryPoint:"vs",buffers:[{arrayStride:24,attributes:[{shaderLocation:0,offset:0,format:"float32x2"},{shaderLocation:1,offset:8,format:"float32x4"}]}]},fragment:{module:f,entryPoint:"fs",targets:[{format:this.format,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"triangle-list"}}),this.vectorBuffer=a.createBuffer({size:An*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),this.vectorBuffers=[this.vectorBuffer];let d=a.createShaderModule({code:o0});this.imagePipeline=a.createRenderPipeline({layout:a.createPipelineLayout({bindGroupLayouts:[this.bindGroupLayout]}),vertex:{module:d,entryPoint:"vs"},fragment:{module:d,entryPoint:"fs",targets:[{format:this.format,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"triangle-list"}});let h=a.createShaderModule({code:c0});this.pickPipeline=a.createRenderPipeline({layout:a.createPipelineLayout({bindGroupLayouts:[this.edgeLayout]}),vertex:{module:h,entryPoint:"vs",buffers:[{arrayStride:12,attributes:[{shaderLocation:0,offset:0,format:"float32x2"},{shaderLocation:1,offset:8,format:"uint32"}]}]},fragment:{module:h,entryPoint:"fs",targets:[{format:"r32uint"}]},primitive:{topology:"triangle-list"}}),this.pickVertexBuffer=a.createBuffer({size:In*12,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),this.pickReadBuffer=a.createBuffer({size:256,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST}),this.pickTexture=null,this.pickTextureSize=[0,0],this.pickPending=!1,this.vectorChunks=new Map,this.failedVectorChunks=new Map,this.nativeDetailState=new Map,this.domDetailPageIds=new Set,this.nativeDetailThresholds=new Map,this.residentVectorBytes=0,this.sampler=a.createSampler({magFilter:"linear",minFilter:"linear",mipmapFilter:"linear"}),this.placeholder=this.createSolidTexture([245,247,249,255]),this.pageResources=new Map,this.imageResources=new Map,this.loading=new Map,this.selectedPageId="",this.selectedFeatureId=0,this.activeNetUid="",this.showHierarchy=!0,this.downloadedBytes=0,this.world=n.worldBoundsMm,this.center=[(this.world.minX+this.world.maxX)/2,(this.world.minY+this.world.maxY)/2],this.scale=Math.max((this.world.maxX-this.world.minX)/900,(this.world.maxY-this.world.minY)/650,.1)*1.16,this.edgeBuffer=this.createEdgeBuffer();for(let g of this.pages)this.createPageResource(g)}createSolidTexture(t){let a=this.device.createTexture({size:[1,1],format:"rgba8unorm-srgb",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});return this.device.queue.writeTexture({texture:a},new Uint8Array(t),{bytesPerRow:4},[1,1]),a}createPageResource(t){let a=this.device.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),s={page:t,uniform:a,texture:this.placeholder,textureWidth:0,svgBlob:null,bindGroup:null};this.pageResources.set(t.id,s),this.updateBindGroup(s)}createImageResource(t){let a=this.device.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),s={path:t,uniform:a,texture:this.placeholder,loaded:!1,bindGroup:null};return this.imageResources.set(t,s),this.updateBindGroup(s),s}updateBindGroup(t){t.bindGroup=this.device.createBindGroup({layout:this.bindGroupLayout,entries:[{binding:0,resource:{buffer:this.globalBuffer}},{binding:1,resource:{buffer:t.uniform}},{binding:2,resource:this.sampler},{binding:3,resource:t.texture.createView()}]})}async loadImageTexture(t){let a=this.imageResources.get(t)||this.createImageResource(t);if(a.loaded)return a;let s=`image:${t}`;if(this.loading.has(s))return this.loading.get(s);let n=(async()=>{try{let r=await fetch(new URL(t,this.manifestUrl),{cache:"default"});if(!r.ok)throw new Error(`Failed to load schematic image ${t}: ${r.status}`);let i=await r.blob(),o=await createImageBitmap(i),c=this.device.createTexture({size:[o.width,o.height],format:"rgba8unorm-srgb",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});this.device.queue.copyExternalImageToTexture({source:o},{texture:c},[o.width,o.height]),o.close(),a.texture!==this.placeholder&&a.texture.destroy(),a.texture=c,a.loaded=!0,this.updateBindGroup(a)}finally{this.loading.delete(s)}return a})();return this.loading.set(s,n),n}createEdgeBuffer(){let t=new Map(this.pages.map(r=>[r.id,r])),a=[];for(let r of this.manifest.edges||[]){let i=t.get(r.source),o=t.get(r.target);!i||!o||a.push(i.worldX+i.widthMm/2,i.worldY+i.heightMm,o.worldX+o.widthMm/2,o.worldY)}let s=new Float32Array(a);if(!s.length)return null;let n=this.device.createBuffer({size:s.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});return this.device.queue.writeBuffer(n,0,s),{buffer:n,count:s.length/2}}resize(){let t=Math.min(devicePixelRatio||1,2),a=Math.max(1,Math.floor(this.canvas.clientWidth*t)),s=Math.max(1,Math.floor(this.canvas.clientHeight*t));(this.canvas.width!==a||this.canvas.height!==s)&&(this.canvas.width=a,this.canvas.height=s),this.flowCanvas&&(this.flowCanvas.width!==a||this.flowCanvas.height!==s)&&(this.flowCanvas.width=a,this.flowCanvas.height=s)}setFlowOverlayCanvas(t){t&&(this.flowCanvas=t,this.flowContext=t.getContext("webgpu"),this.flowContext.configure({device:this.device,format:this.format,alphaMode:"premultiplied"}))}writeGlobals(){let t=this.globalUniformScratch;t[0]=this.center[0],t[1]=this.center[1],t[2]=this.scale,t[3]=performance.now()*.001,t[4]=this.canvas.width,t[5]=this.canvas.height,this.device.queue.writeBuffer(this.globalBuffer,0,t)}pagePixelWidth(t){return t.widthMm/this.scale}pageSourcePixelsPerMm(t){let a=this.pagePixelWidth(t)/Math.max(1,t.sourceWidthMm||t.widthMm),s=t.heightMm/this.scale/Math.max(1,t.sourceHeightMm||t.heightMm);return Math.min(a,s)}pageNativeDetailThresholds(t){let a=this.nativeDetailThresholds.get(t.id);if(a)return a;let s=Math.max(1,t.sourceWidthMm||t.widthMm),n=Math.max(1,t.sourceHeightMm||t.heightMm),r=s*n,i=Math.max(0,t.featureCount||t.featureIds?.length||0)/Math.max(1,r),o=ce(1-i*72,.84,1.08),c=ce(Math.sqrt(Math.max(s,n)/Math.max(1,Math.min(s,n)))/1.18,.92,1.14),l=ce(l0*o*c,5,7.4),f={enter:l,exit:ce(Math.min(l-1.2,d0*o),3.8,l-.7),prefetch:ce(Math.min(l-2,u0*o),3,l-1)};return this.nativeDetailThresholds.set(t.id,f),f}pageWantsNativeDetail(t){if(!this.pageHasNativeDetail(t))return!1;let a=this.pageSourcePixelsPerMm(t),s=this.nativeDetailState.get(t.id)===!0,n=this.pageNativeDetailThresholds(t),r=s?n.exit:n.enter,i=a>=r;return i!==s&&this.nativeDetailState.set(t.id,i),i}pageNativeDetailReady(t){if(this.domDetailPageIds.has(t.id)||!this.pageWantsNativeDetail(t))return!1;let a=this.vectorChunks.get(t.id);return!a?.loaded||!a.segments?.length&&!a.fills?.length?!1:this.visibleNativeImagesReady(t,a)}visibleNativeImagesReady(t,a){if(!a?.images?.length)return!0;let s=this.sourceViewportBounds(t,4),n=!0;for(let r of a.images){if(!xt(r.bounds,s))continue;(this.imageResources.get(r.path)||this.createImageResource(r.path)).loaded||(n=!1,this.loadImageTexture(r.path).catch(()=>{}))}return n}visiblePages(){let t=this.canvas.width*this.scale/2,a=this.canvas.height*this.scale/2,s=this.center[0]-t,n=this.center[0]+t,r=this.center[1]-a,i=this.center[1]+a;return this.pages.filter(o=>o.worldX+o.widthMm>=s&&o.worldX<=n&&o.worldY+o.heightMm>=r&&o.worldY<=i)}worldViewportBounds(t=0){let a=this.canvas.width*this.scale/2,s=this.canvas.height*this.scale/2;return[this.center[0]-a-t,this.center[1]-s-t,this.center[0]+a+t,this.center[1]+s+t]}sourceViewportBounds(t,a=2.5){let s=this.worldViewportBounds(this.scale*8),n=(s[0]-t.worldX)/t.widthMm*t.sourceWidthMm-a,r=(s[1]-t.worldY)/t.heightMm*t.sourceHeightMm-a,i=(s[2]-t.worldX)/t.widthMm*t.sourceWidthMm+a,o=(s[3]-t.worldY)/t.heightMm*t.sourceHeightMm+a;return[Math.max(-a,Math.min(n,i)),Math.max(-a,Math.min(r,o)),Math.min(t.sourceWidthMm+a,Math.max(n,i)),Math.min(t.sourceHeightMm+a,Math.max(r,o))]}render(){this.frameSerial+=1,this.resize(),this.writeGlobals();let t=this.visiblePages(),a=this.device.createCommandEncoder(),s=a.beginRenderPass({colorAttachments:[{view:this.context.getCurrentTexture().createView(),clearValue:{r:.045,g:.055,b:.073,a:1},loadOp:"clear",storeOp:"store"}]});this.showHierarchy&&this.edgeBuffer&&(s.setPipeline(this.edgePipeline),s.setBindGroup(0,this.edgeBindGroup),s.setVertexBuffer(0,this.edgeBuffer.buffer),s.draw(this.edgeBuffer.count)),s.setPipeline(this.pagePipeline);for(let i of t){let o=this.pageResources.get(i.id),c=this.activeNetUid&&i.netUids.includes(this.activeNetUid),l=this.domDetailPageIds.has(i.id),f=!l&&this.pageNativeDetailReady(i),d=this.pageUniformScratch;d[0]=i.worldX,d[1]=i.worldY,d[2]=i.widthMm,d[3]=i.heightMm,d[4]=i.id===this.selectedPageId?1:0,d[5]=c?1:0,d[6]=this.activeNetUid?1:0,d[7]=f||l?1:0,this.device.queue.writeBuffer(o.uniform,0,d),s.setBindGroup(0,o.bindGroup),s.draw(6);let h=ce(Math.ceil(this.pagePixelWidth(i)*1.3/512)*512,512,6144);o.textureWidth<h*.82&&this.loadPageTexture(i,h).catch(()=>{})}this.scheduleVisibleVectorLoads(t),this.drawVisibleImages(s,t),this.drawVisibleVectors(s,t);let n=this.writeNetTrackingOverlay();n&&!this.flowContext&&(s.setPipeline(this.netFlowPipeline),s.setBindGroup(0,this.edgeBindGroup),s.setVertexBuffer(0,this.netFlowBuffer),s.draw(n));let r=this.writeNetHighlights(t);return r&&(s.setPipeline(this.highlightPipeline),s.setBindGroup(0,this.edgeBindGroup),s.setVertexBuffer(0,this.highlightBuffer),s.draw(r)),s.end(),this.device.queue.submit([a.finish()]),this.renderFlowOverlay(n),this.evictVectorChunks(t),t}renderFlowOverlay(t){if(!this.flowContext)return;let a=this.device.createCommandEncoder(),s=a.beginRenderPass({colorAttachments:[{view:this.flowContext.getCurrentTexture().createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}]});t&&(s.setPipeline(this.netFlowPipeline),s.setBindGroup(0,this.edgeBindGroup),s.setVertexBuffer(0,this.netFlowBuffer),s.draw(t)),s.end(),this.device.queue.submit([a.finish()])}drawVisibleImages(t,a){if(!this.isNativeScene)return;let s=!1;for(let n of a){if(this.domDetailPageIds.has(n.id)||!this.pageNativeDetailReady(n))continue;let r=this.vectorChunks.get(n.id);if(!r?.images?.length)continue;let i=this.sourceViewportBounds(n,4);for(let o of r.images){if(!xt(o.bounds,i))continue;let c=this.imageResources.get(o.path)||this.createImageResource(o.path);c.loaded||this.loadImageTexture(o.path).catch(()=>{});let l=o.worldOrigin||this.sourceToWorld(n,[o.xMm,o.yMm]),f=o.worldSize||this.sourceSizeToWorld(n,o.widthMm,o.heightMm),d=this.imageUniformScratch;d[0]=l[0],d[1]=l[1],d[2]=f[0],d[3]=f[1],d[4]=0,d[5]=0,d[6]=0,d[7]=0,this.device.queue.writeBuffer(c.uniform,0,d),s||(t.setPipeline(this.imagePipeline),s=!0),t.setBindGroup(0,c.bindGroup),t.draw(6)}}}drawVisibleVectors(t,a){if(!this.isNativeScene)return 0;let s=this.vectorScratch,n=0,r=0,i=0,o=0,c=!1,l=()=>{if(!n)return;let d=this.vectorBuffers[o];d||(d=this.device.createBuffer({size:An*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),this.vectorBuffers.push(d)),this.device.queue.writeBuffer(d,0,s,0,n),c||(t.setPipeline(this.vectorPipeline),t.setBindGroup(0,this.edgeBindGroup),c=!0);let h=Math.floor(n/6);t.setVertexBuffer(0,d),t.draw(h),i+=h,o+=1,n=0},f=d=>d>jd||d>s.length?(r+=1,!1):((n+d>jd||n+d>s.length)&&l(),!0);for(let d of a){if(this.domDetailPageIds.has(d.id)||!this.pageHasNativeDetail(d))continue;let h=this.vectorChunks.get(d.id);if(!h?.segments?.length&&!h?.fills?.length||!this.pageNativeDetailReady(d))continue;h.lastUsedFrame=this.frameSerial;let g=this.sourceViewportBounds(d),p=zd(h.spatial,g);for(let u of p.fills){if(!xt(u.bounds,g)||!f(18))continue;let y=this.featuresById.get(u.featureId),b=this.activeNetUid&&y?.netUid===this.activeNetUid,x=this.selectedFeatureId===u.featureId?[.24,.58,1,1]:b?[.06,1,.24,1]:this.activeNetUid&&rs(y)?qd(y,u.kind,u.color):Oi(y,u.kind,u.color),M=u.worldPoints||u.points.map(E=>this.sourceToWorld(d,E));n=F0(s,n,M[0],M[1],M[2],x)}for(let u of p.segments){if(!xt(u.bounds,g))continue;let y=this.featuresById.get(u.featureId),b=this.activeNetUid&&y?.netUid===this.activeNetUid,m=this.selectedFeatureId===u.featureId,x=m?[.24,.58,1,1]:b?[.06,1,.24,1]:this.activeNetUid&&rs(y)?qd(y,u.kind,u.color):Oi(y,u.kind,u.color),M=this.segmentWorldWidth(d,u,y,b||m);for(let E of this.visibleSegmentParts(d,u,y)){if(!f(36))continue;let T=E.worldA||this.sourceToWorld(d,E.a),I=E.worldB||this.sourceToWorld(d,E.b);n=C0(s,n,T,I,M,x)}}}return l(),this.truncatedVectorCount=r,this.vectorTruncated=r>0,this.lastVectorVertices=i,this.lastVectorChunks=o,i}pageHasNativeDetail(t){return this.isNativeScene?t?.nativeDetail?.enabled!==!1:!1}scheduleVisibleVectorLoads(t){if(!this.isNativeScene)return;let a=[...this.vectorChunks.values()].filter(r=>r?.promise&&!r.loaded).length,s=Math.max(0,p0-a);if(!s)return;let n=t.filter(r=>!this.domDetailPageIds.has(r.id)).filter(r=>this.pageHasNativeDetail(r)&&this.pageSourcePixelsPerMm(r)>=this.pageNativeDetailThresholds(r).prefetch).filter(r=>!this.vectorChunks.get(r.id)?.loaded&&!this.vectorChunks.get(r.id)?.promise).sort((r,i)=>{let o=Math.hypot(r.worldX+r.widthMm/2-this.center[0],r.worldY+r.heightMm/2-this.center[1]),c=Math.hypot(i.worldX+i.widthMm/2-this.center[0],i.worldY+i.heightMm/2-this.center[1]);return o-c});for(let r of n)if(this.loadPageVectors(r).catch(()=>{}),s-=1,!s)break}featurePrimitiveBounds(t,a){let s=this.vectorChunks.get(t.id);if(!s?.segments?.length&&!s?.fills?.length)return null;let n=[],r=[];for(let i of s.segments||[])i.featureId===a&&(n.push(i.a[0],i.b[0]),r.push(i.a[1],i.b[1]));for(let i of s.fills||[])if(i.featureId===a)for(let o of i.points||[])n.push(o[0]),r.push(o[1]);return n.length?[Math.min(...n),Math.min(...r),Math.max(...n),Math.max(...r)]:null}symbolClipBounds(t){if(this._symbolClipBounds||(this._symbolClipBounds=new Map),this._symbolClipBounds.has(t.id))return this._symbolClipBounds.get(t.id);let a=(this.featuresByPage[t.id]||[]).filter(s=>s?.kind==="symbol_body"&&s.boundsMm&&!String(s.sourceId||"").includes(":overplot")).map(s=>{let n=this.featurePrimitiveBounds(t,s.id)||s.boundsMm;return[n[0]-.02,n[1]-.02,n[2]+.02,n[3]+.02]}).filter(s=>{let n=s[2]-s[0],r=s[3]-s[1];return Math.max(n,r)<=12&&n*r<=80});return this._symbolClipBounds.set(t.id,a),a}visibleSegmentParts(t,a,s){if(a._visibleParts)return a._visibleParts;let n=String(s?.kind||""),r=String(s?.semanticRole||"");if(n!=="wire"&&r!=="wire")return a._visibleParts=[a],a._visibleParts;let i=[a];for(let o of this.symbolClipBounds(t)){let c=[];for(let l of i)c.push(...j0(l,o));if(i=c,!i.length)break}for(let o of i)o.worldA=Ea(t,o.a),o.worldB=Ea(t,o.b);return a._visibleParts=i,a._visibleParts}netTrackingSegments(){if(!this.activeNetUid)return{netUid:"",anchorsByPage:new Map,segments:[],intrasheetSegments:[]};let t=Number(this.selectedFeatureId||0),a=String(this.selectedFeatureKey||""),s=String(this.selectedSourceId||"");if(this.netTrackingCache?.netUid===this.activeNetUid&&this.netTrackingCache?.selectedFeatureId===t&&this.netTrackingCache?.selectedFeatureKey===a&&this.netTrackingCache?.selectedSourceId===s)return this.netTrackingCache;this.selectedIntrasheetLinkIndex=-1;let n=new Map(this.pages.map(p=>[p.id,p])),r=this.manifest.netToPages?.[this.activeNetUid]||[],i=r.length?r.map(p=>n.get(p)).filter(Boolean):this.pages.filter(p=>p.netUids?.includes(this.activeNetUid)),o=new Map;for(let p of i.slice(0,h0)){let u=this.netTrackingAnchorsForPage(p);u.length&&o.set(p.id,u)}let c=[],l=[];for(let[p,u]of o){let y=Vd(R0(u),"intrasheet",p);c.push(...y),l.push(...y)}let f=[...o.entries()].map(([p,u])=>_0(n.get(p),u,{featureId:t,stableKey:a,sourceId:s})).filter(Boolean);c.push(...Vd(f,"intersheet",""));let d=l.map((p,u)=>({...p,intrasheetIndex:u})),h=0,g=c.map((p,u)=>{if(p.type!=="intrasheet")return{...p,id:u};let y=h;return h+=1,{...p,id:u,intrasheetIndex:y}});return this.netTrackingCache={netUid:this.activeNetUid,selectedFeatureId:t,selectedFeatureKey:a,selectedSourceId:s,anchorsByPage:o,segments:g,intrasheetSegments:d},this.selectedIntrasheetLinkIndex>=this.netTrackingCache.intrasheetSegments.length&&(this.selectedIntrasheetLinkIndex=-1),this.netTrackingCache}netTrackingAnchorsForPage(t){let a=this.featuresByPage[t.id]||[],s=[];for(let n of a){if(n.netUid!==this.activeNetUid||!n.boundsMm||!I0(n))continue;let r=n.boundsMm,i=[(r[0]+r[2])/2,(r[1]+r[3])/2],o=this.sourceToWorld(t,i);s.push({pageId:t.id,featureId:Number(n.id||0),stableKey:String(n.stableKey||""),sourceId:String(n.sourceId||n.sourceUid||n.objectId||""),kind:n.kind||n.semanticRole||"",source:i,world:o,bounds:r,priority:A0(n)})}return s.sort((n,r)=>r.priority-n.priority||n.source[1]-r.source[1]||n.source[0]-r.source[0]),s}writeNetTrackingOverlay(){let t=this.netTrackingSegments();if(this.lastNetFlowSegments=t.segments.length,this.lastNetFlowIntrasheetSegments=t.intrasheetSegments.length,!t.segments.length)return this.lastNetFlowVertices=0,0;let a=this.worldViewportBounds(this.scale*96),s=this.netFlowScratch,n=0,r=0;for(let i of t.segments){if(!xt(Hd(i),a))continue;let o=i.type==="intrasheet"&&i.intrasheetIndex===this.selectedIntrasheetLinkIndex,c=o?9.5:i.type==="intersheet"?8:4.8,l=o?2:i.type==="intersheet"?1:0,f=O0(s,n,i.a,i.b,c*this.scale,l,r,this.scale);if(f!==n&&(n=f,r+=Math.hypot(i.b[0]-i.a[0],i.b[1]-i.a[1])/Math.max(this.scale,1e-6),n+24>s.length))break}return n?(this.device.queue.writeBuffer(this.netFlowBuffer,0,s,0,n),this.lastNetFlowVertices=n/4,n/4):(this.lastNetFlowVertices=0,0)}cycleNetIntrasheetLink(t=1){let a=this.netTrackingSegments();if(!a.intrasheetSegments.length)return null;let s=a.intrasheetSegments.length;this.selectedIntrasheetLinkIndex=(this.selectedIntrasheetLinkIndex+t+s)%s;let n=a.intrasheetSegments[this.selectedIntrasheetLinkIndex];if(!n)return null;let r=Hd(n,14*this.scale);return this.center=[(r[0]+r[2])/2,(r[1]+r[3])/2],this.scale=Math.max((r[2]-r[0])/Math.max(1,this.canvas.width*.36),(r[3]-r[1])/Math.max(1,this.canvas.height*.3),this.scale*.35,.025),{pageId:n.pageId,segment:n}}writeNetHighlights(t){if(!this.activeNetUid)return 0;let a=this.highlightScratch,s=0,n=0;for(let r of t){let i=this.sourceViewportBounds(r,5);for(let o of this.featuresByPage[r.id]||[]){if(o.netUid!==this.activeNetUid||!o.boundsMm||!xt(o.boundsMm,i))continue;let c=this.featureWorldBounds(r,o.boundsMm);if(s+16>a.length){n+=1;continue}a[s++]=c[0],a[s++]=c[1],a[s++]=c[2],a[s++]=c[1],a[s++]=c[2],a[s++]=c[1],a[s++]=c[2],a[s++]=c[3],a[s++]=c[2],a[s++]=c[3],a[s++]=c[0],a[s++]=c[3],a[s++]=c[0],a[s++]=c[3],a[s++]=c[0],a[s++]=c[1]}}return this.truncatedHighlightCount=n,s?(this.device.queue.writeBuffer(this.highlightBuffer,0,a,0,s),s/2):0}featureWorldBounds(t,a){return[t.worldX+a[0]/t.sourceWidthMm*t.widthMm,t.worldY+a[1]/t.sourceHeightMm*t.heightMm,t.worldX+a[2]/t.sourceWidthMm*t.widthMm,t.worldY+a[3]/t.sourceHeightMm*t.heightMm]}sourceToWorld(t,a){return[t.worldX+a[0]/t.sourceWidthMm*t.widthMm,t.worldY+a[1]/t.sourceHeightMm*t.heightMm]}sourceSizeToWorld(t,a,s){return[a/t.sourceWidthMm*t.widthMm,s/t.sourceHeightMm*t.heightMm]}async loadPageVectors(t){if(!this.pageHasNativeDetail(t)||!t.chunks?.lod2)return null;let a=this.vectorChunks.get(t.id);if(a?.loaded)return a;if(a?.promise)return a.promise;let s=(async()=>{try{let n=await fetch(new URL(t.chunks.lod2,this.manifestUrl));if(!n.ok)throw new Error(`Failed to load schematic vector chunk ${t.id}: ${n.status}`);let r=await n.json(),i=y0(r.primitives||[]);x0(t,i);let c=JSON.stringify(r).length,l={loaded:!0,segments:i.segments,fills:i.fills,images:i.images,spatial:S0(i),unsupported:r.unsupported||[],bytes:c,lastUsedFrame:this.frameSerial};return this.vectorChunks.set(t.id,l),this.failedVectorChunks.delete(t.id),this.residentVectorBytes+=c,l}catch(n){let r=this.failedVectorChunks.get(t.id)||{count:0,message:""};throw this.failedVectorChunks.set(t.id,{count:r.count+1,message:n?.message||String(n)}),this.vectorChunks.delete(t.id),n}})();return this.vectorChunks.set(t.id,{loaded:!1,promise:s,segments:[]}),s}evictVectorChunks(t){if(this.residentVectorBytes<=Ud)return;let a=new Set(t.map(n=>n.id)),s=[...this.vectorChunks.entries()].filter(([,n])=>n?.loaded).filter(([n])=>!a.has(n)&&n!==this.selectedPageId).sort((n,r)=>(n[1].lastUsedFrame||0)-(r[1].lastUsedFrame||0));for(let[n,r]of s)if(this.vectorChunks.delete(n),this.residentVectorBytes=Math.max(0,this.residentVectorBytes-(r.bytes||0)),this.residentVectorBytes<=Ud*.82)break}stats(){let t=this.visiblePages(),a=t.map(n=>this.pageSourcePixelsPerMm(n)),s=t.map(n=>this.pageNativeDetailThresholds(n).enter);return{residentVectorBytes:this.residentVectorBytes,vectorChunks:[...this.vectorChunks.values()].filter(n=>n?.loaded).length,vectorLoads:[...this.vectorChunks.values()].filter(n=>n?.promise&&!n.loaded).length,failedVectorChunks:this.failedVectorChunks.size,vectorVertices:this.lastVectorVertices||0,vectorDrawChunks:this.lastVectorChunks||0,truncatedVectors:this.truncatedVectorCount||0,nativeDetailPages:[...this.nativeDetailState.values()].filter(Boolean).length,nativePxPerMm:Number((Math.max(0,...a)||0).toFixed(2)),nativeThresholdPxPerMm:Number((s.length?Math.min(...s):0).toFixed(2)),domDetailPages:this.domDetailPageIds.size,netFlowSegments:this.lastNetFlowSegments||0,netFlowIntrasheetSegments:this.lastNetFlowIntrasheetSegments||0,netFlowVertices:this.lastNetFlowVertices||0}}setDomDetailPageIds(t){this.domDetailPageIds=new Set(t||[])}async loadPageTexture(t,a){let s=`${t.id}:${a}`;if(this.loading.has(s))return this.loading.get(s);let n=this.pageResources.get(t.id);if(!n||n.textureWidth>=a)return;let r=(async()=>{if(!n.svgBlob){let c=await fetch(new URL(g0(t),this.manifestUrl));if(!c.ok)throw new Error(`Failed to load schematic page ${t.name}: ${c.status}`);n.svgBlob=await c.blob(),this.downloadedBytes+=n.svgBlob.size}let i=n.svgBlob,o=URL.createObjectURL(i);try{let c=new Image;if(c.decoding="async",c.src=o,await c.decode(),n.textureWidth>=a)return;let l=Math.max(64,Math.round(a*t.heightMm/t.widthMm)),f=new OffscreenCanvas(a,l),d=f.getContext("2d",{alpha:!1});d.fillStyle="#ffffff",d.fillRect(0,0,a,l),d.drawImage(c,0,0,a,l);let h=await createImageBitmap(f),g=this.device.createTexture({size:[a,l],format:"rgba8unorm-srgb",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});this.device.queue.copyExternalImageToTexture({source:h},{texture:g},[a,l]),h.close(),n.texture!==this.placeholder&&n.texture.destroy(),n.texture=g,n.textureWidth=a,this.updateBindGroup(n)}finally{URL.revokeObjectURL(o),this.loading.delete(s)}})();return this.loading.set(s,r),r}preloadOverview(){let t=[...this.pages],a=async()=>{for(;t.length;){let s=t.shift();await this.loadPageTexture(s,512).catch(()=>{})}};return Promise.all(Array.from({length:Math.min(4,t.length)},a))}screenToWorld(t,a){let s=this.canvas.getBoundingClientRect(),n=(t-s.left)*this.canvas.width/s.width,r=(a-s.top)*this.canvas.height/s.height;return[this.center[0]+(n-this.canvas.width/2)*this.scale,this.center[1]+(r-this.canvas.height/2)*this.scale]}worldToScreen(t,a){let s=this.canvas.clientWidth/this.canvas.width,n=this.canvas.clientHeight/this.canvas.height;return[((t-this.center[0])/this.scale+this.canvas.width/2)*s,((a-this.center[1])/this.scale+this.canvas.height/2)*n]}hitPage(t,a){let[s,n]=this.screenToWorld(t,a);return[...this.pages].reverse().find(r=>s>=r.worldX&&s<=r.worldX+r.widthMm&&n>=r.worldY&&n<=r.worldY+r.heightMm)||null}async pickFeature(t,a){if(!this.isNativeScene)return this.hitFeature(t,a);let s=this.hitPage(t,a);if(!s)return null;if(!this.pageHasNativeDetail(s))return this.hitFeature(t,a);await this.loadPageVectors(s);let n=await this.gpuPickFeature(s,t,a);return n&&!ns(n)?{page:s,feature:n,source:this.clientToSource(s,t,a),native:!0,gpu:!0}:this.hitFeature(t,a)}hitFeature(t,a){let s=this.hitPage(t,a);if(!s)return null;let[n,r]=this.clientToSource(s,t,a),i=Math.max(.45,5*this.scale*this.canvas.width/Math.max(1,this.canvas.clientWidth)*s.sourceWidthMm/s.widthMm),o=this.hitResidentVectorFeature(s,n,r,i);if(o)return{page:s,feature:o,source:[n,r],native:!0};let c=this.hitSymbolInterior(s,n,r);if(c)return{page:s,feature:c,source:[n,r],native:!0,interior:!0};let l=(this.featuresByPage[s.id]||[]).filter(f=>{if(ns(f))return!1;let d=f.boundsMm;return d&&n>=d[0]-i&&n<=d[2]+i&&r>=d[1]-i&&r<=d[3]+i}).map(f=>({feature:f,priority:ss(f),area:Math.max(1e-4,(f.boundsMm[2]-f.boundsMm[0])*(f.boundsMm[3]-f.boundsMm[1]))})).sort((f,d)=>d.priority-f.priority||f.area-d.area);return{page:s,feature:l[0]?.feature||null,source:[n,r]}}hitSymbolInterior(t,a,s){let n=null;for(let r of this.featuresByPage[t.id]||[]){let i=String(r?.kind||"");if(i!=="symbol_body"&&i!=="symbol_instance"||String(r?.sourceId||"").includes(":overplot"))continue;let o=r.boundsMm;if(!o||a<o[0]||a>o[2]||s<o[1]||s>o[3])continue;let c=Math.max(1e-4,(o[2]-o[0])*(o[3]-o[1])),l=(i==="symbol_body"?0:1e6)+c;(!n||l<n.score)&&(n={feature:r,score:l})}return n?.feature||null}clientToSource(t,a,s){let[n,r]=this.screenToWorld(a,s);return[(n-t.worldX)/t.widthMm*t.sourceWidthMm,(r-t.worldY)/t.heightMm*t.sourceHeightMm]}ensurePickTexture(){this.pickTexture&&this.pickTextureSize[0]===this.canvas.width&&this.pickTextureSize[1]===this.canvas.height||(this.pickTexture&&this.pickTexture.destroy(),this.pickTexture=this.device.createTexture({size:[this.canvas.width,this.canvas.height],format:"r32uint",usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC}),this.pickTextureSize=[this.canvas.width,this.canvas.height])}writePickVectors(t){let a=new ArrayBuffer(In*12),s=new DataView(a),n=0,r=[];for(let i of t){let o=this.vectorChunks.get(i.id);if(!o?.segments?.length&&!o?.fills?.length&&!o?.images?.length)continue;let c=this._pickSourcePointByPage?.get(i.id),l=c?[c[0]-2.5,c[1]-2.5,c[0]+2.5,c[1]+2.5]:[0,0,i.sourceWidthMm,i.sourceHeightMm],f=zd(o.spatial,l);for(let d of f.images){if(!xt(d.bounds,l))continue;let h=this.featuresById.get(d.featureId);!h||ns(h)||r.push({page:i,image:d,feature:h,priority:ss(h)-5})}for(let d of f.fills){if(!xt(d.bounds,l))continue;let h=this.featuresById.get(d.featureId);!h||ns(h)||r.push({page:i,fill:d,feature:h,priority:ss(h)-2})}for(let d of f.segments){if(!xt(d.bounds,l))continue;let h=this.featuresById.get(d.featureId);!h||ns(h)||r.push({page:i,segment:d,feature:h,priority:ss(h)})}}r.sort((i,o)=>i.priority-o.priority);for(let{page:i,segment:o,fill:c,image:l,feature:f}of r){if(n+6>In)break;if(l){let d=this.sourceToWorld(i,[l.xMm,l.yMm]),h=this.sourceToWorld(i,[l.xMm+l.widthMm,l.yMm]),g=this.sourceToWorld(i,[l.xMm,l.yMm+l.heightMm]),p=this.sourceToWorld(i,[l.xMm+l.widthMm,l.yMm+l.heightMm]);n=Fi(s,n,d,h,g,l.featureId),n=Fi(s,n,g,h,p,l.featureId)}else if(c){let d=c.worldPoints||c.points.map(h=>this.sourceToWorld(i,h));n=Fi(s,n,d[0],d[1],d[2],c.featureId)}else{let d=Math.max(this.segmentWorldWidth(i,o,f,!1),this.scale*7);for(let h of this.visibleSegmentParts(i,o,f)){if(n+6>In)break;let g=h.worldA||this.sourceToWorld(i,h.a),p=h.worldB||this.sourceToWorld(i,h.b);n=L0(s,n,g,p,d,o.featureId)}}}return n?(this.device.queue.writeBuffer(this.pickVertexBuffer,0,a,0,n*12),n):0}async gpuPickFeature(t,a,s){if(this.pickPending)return null;let n=this.clientToSource(t,a,s);this._pickSourcePointByPage=new Map([[t.id,n]]);let r=this.writePickVectors([t]);if(this._pickSourcePointByPage=null,!r)return null;this.resize(),this.writeGlobals(),this.ensurePickTexture();let i=this.canvas.getBoundingClientRect(),o=Math.max(0,Math.min(this.canvas.width-1,Math.floor((a-i.left)*this.canvas.width/i.width))),c=Math.max(0,Math.min(this.canvas.height-1,Math.floor((s-i.top)*this.canvas.height/i.height))),l=this.device.createCommandEncoder(),f=l.beginRenderPass({colorAttachments:[{view:this.pickTexture.createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}]});f.setPipeline(this.pickPipeline),f.setBindGroup(0,this.edgeBindGroup),f.setVertexBuffer(0,this.pickVertexBuffer),f.draw(r),f.end(),l.copyTextureToBuffer({texture:this.pickTexture,origin:{x:o,y:c}},{buffer:this.pickReadBuffer,bytesPerRow:256,rowsPerImage:1},{width:1,height:1,depthOrArrayLayers:1}),this.pickPending=!0,this.device.queue.submit([l.finish()]);try{await this.pickReadBuffer.mapAsync(GPUMapMode.READ);let d=new DataView(this.pickReadBuffer.getMappedRange()).getUint32(0,!0);return this.pickReadBuffer.unmap(),d&&this.featuresById.get(d)||null}finally{this.pickReadBuffer.mapState==="mapped"&&this.pickReadBuffer.unmap(),this.pickPending=!1}}hitResidentVectorFeature(t,a,s,n){if(!this.isNativeScene)return null;let r=this.vectorChunks.get(t.id);if(!r?.loaded)return null;let i=null;for(let o of r.segments){let c=this.featuresById.get(o.featureId),l=Math.max(n,(o.widthMm||0)*.5+n*.45);if(c)for(let f of this.visibleSegmentParts(t,o,c)){let d=P0([a,s],f.a,f.b);if(d>l)continue;let h=d-ss(c)*.025+(rs(c)?0:8);(!i||h<i.score)&&(i={feature:c,score:h})}}return i?.feature||null}segmentWorldWidth(t,a,s,n){let r=(a.widthMm||.15)/Math.max(1,t.sourceWidthMm)*t.widthMm;return Math.max(r,this.scale*B0(s,a.kind,n))}pan(t,a){let s=this.canvas.width/Math.max(1,this.canvas.clientWidth);this.center[0]-=t*this.scale*s,this.center[1]-=a*this.scale*s}zoom(t,a,s){let n=this.screenToWorld(a,s);this.scale=ce(this.scale*Math.exp(t*.0015),.015,16);let r=this.screenToWorld(a,s);this.center[0]+=n[0]-r[0],this.center[1]+=n[1]-r[1]}framePage(t){t&&(this.resize(),this.center=[t.worldX+t.widthMm/2,t.worldY+t.heightMm/2],this.scale=Math.max(t.widthMm/Math.max(1,this.canvas.width*.88),t.heightMm/Math.max(1,this.canvas.height*.84)))}frameWorld(){this.resize(),this.center=[(this.world.minX+this.world.maxX)/2,(this.world.minY+this.world.maxY)/2],this.scale=Math.max((this.world.maxX-this.world.minX)/Math.max(1,this.canvas.width*.9),(this.world.maxY-this.world.minY)/Math.max(1,this.canvas.height*.88),.05)}};function g0(e){return e.thumbnail?.path||e.svg}function m0(e){if(e.schema==="prism.schematic_vector_a0.features"){let t=new Map((e.features||[]).map(s=>[Number(s.id),s])),a={};for(let[s,n]of Object.entries(e.pages||{}))a[s]=n.map(r=>t.get(Number(r))).filter(Boolean);return a}return e.pages||{}}function y0(e){let t=[],a=[],s=[];for(let n of e){let r=Number(n.featureId||0);if(!r)continue;if(n.kind==="plotimage"&&n.image?.path){let m=n.xMm||0,x=n.yMm||0,M=n.widthMm||0,E=n.heightMm||0;s.push({featureId:r,kind:n.kind,xMm:m,yMm:x,widthMm:M,heightMm:E,bounds:[m,x,m+M,x+E],path:n.image.path});continue}let i=String(n.semanticRole||""),o=n.radiusMm||n.diameterMm/2||0,c=String(n.fill||"").toUpperCase()==="FILLED_SHAPE",l=n.widthMm||n.pen_widthMm||(i==="junction"?.08:.15),f=String(n.lineStyle||n.line_style||"DEFAULT").toUpperCase(),d=n.color||n.strokeColor||n.style?.color||"",h=n.fillColor||n.color||n.style?.color||"",g=(m,x)=>E0(t,{featureId:r,kind:n.kind,widthMm:l,lineStyle:f,color:d},m,x),p=n.x1Mm,u=n.y1Mm,y=n.x2Mm,b=n.y2Mm;if(n.trianglesMm?.length){for(let m of n.trianglesMm)Array.isArray(m)&&m.length===3&&a.push({featureId:r,kind:n.kind,color:h,points:m,bounds:Xd(m)});if(n.pointsMm?.length>=2){for(let m=1;m<n.pointsMm.length;m+=1)g(n.pointsMm[m-1],n.pointsMm[m]);Kd(n)&&g(n.pointsMm[n.pointsMm.length-1],n.pointsMm[0])}}else if(n.pointsMm?.length>=2){c&&n.pointsMm.length>=3&&k0(a,r,n.kind,n.pointsMm,h);for(let m=1;m<n.pointsMm.length;m+=1)g(n.pointsMm[m-1],n.pointsMm[m]);Kd(n)&&g(n.pointsMm[n.pointsMm.length-1],n.pointsMm[0])}else if(n.polylinesMm?.length){for(let m of n.polylinesMm)if(!(!Array.isArray(m)||m.length<2))for(let x=1;x<m.length;x+=1)g(m[x-1],m[x])}else if(Number.isFinite(p)&&Number.isFinite(u)&&Number.isFinite(y)&&Number.isFinite(b))n.kind==="rect"?(c&&w0(a,r,n.kind,[p,u,y,b],h),g([p,u],[y,u]),g([y,u],[y,b]),g([y,b],[p,b]),g([p,b],[p,u])):g([p,u],[y,b]);else if(Number.isFinite(n.cxMm)&&Number.isFinite(n.cyMm)){let m=n.radiusMm||n.diameterMm/2||.4;c&&M0(a,r,n.kind,[n.cxMm,n.cyMm],m,h),T0(t,{featureId:r,kind:n.kind,widthMm:l,lineStyle:f,color:d},[n.cxMm,n.cyMm],m)}else if(n.contoursMm?.length){for(let m of n.contoursMm)if(!(!Array.isArray(m)||m.length<2)){for(let x=1;x<m.length;x+=1)g(m[x-1],m[x]);g(m[m.length-1],m[0])}}else if(Number.isFinite(n.start_xMm)&&Number.isFinite(n.start_yMm)&&Number.isFinite(n.end_xMm)&&Number.isFinite(n.end_yMm))Number.isFinite(n.mid_xMm)&&Number.isFinite(n.mid_yMm)?(g([n.start_xMm,n.start_yMm],[n.mid_xMm,n.mid_yMm]),g([n.mid_xMm,n.mid_yMm],[n.end_xMm,n.end_yMm])):g([n.start_xMm,n.start_yMm],[n.end_xMm,n.end_yMm]);else if(Number.isFinite(n.start_xMm)&&Number.isFinite(n.start_yMm)&&Number.isFinite(n.mid_xMm)&&Number.isFinite(n.mid_yMm)&&Number.isFinite(n.end_xMm)&&Number.isFinite(n.end_yMm))g([n.start_xMm,n.start_yMm],[n.mid_xMm,n.mid_yMm]),g([n.mid_xMm,n.mid_yMm],[n.end_xMm,n.end_yMm]);else if(n.boundsMm&&n.kind!=="text"){let[m,x,M,E]=n.boundsMm;g([m,x],[M,x]),g([M,x],[M,E]),g([M,E],[m,E]),g([m,E],[m,x])}}return{segments:t,fills:a,images:s}}function x0(e,t){for(let a of t.segments||[])a.worldA=Ea(e,a.a),a.worldB=Ea(e,a.b);for(let a of t.fills||[])a.worldPoints=a.points.map(s=>Ea(e,s));for(let a of t.images||[])a.worldOrigin=Ea(e,[a.xMm,a.yMm]),a.worldSize=v0(e,a.widthMm,a.heightMm)}function Ea(e,t){return[e.worldX+t[0]/e.sourceWidthMm*e.widthMm,e.worldY+t[1]/e.sourceHeightMm*e.heightMm]}function v0(e,t,a){return[t/e.sourceWidthMm*e.widthMm,a/e.sourceHeightMm*e.heightMm]}function w0(e,t,a,s,n){let[r,i,o,c]=s;e.push({featureId:t,kind:a,color:n,points:[[r,i],[o,i],[r,c]],bounds:[r,i,o,c]},{featureId:t,kind:a,color:n,points:[[r,c],[o,i],[o,c]],bounds:[r,i,o,c]})}function M0(e,t,a,s,n,r){for(let o=0;o<36;o+=1){let c=o/36*Math.PI*2,l=(o+1)/36*Math.PI*2;e.push({featureId:t,kind:a,color:r,points:[s,[s[0]+Math.cos(c)*n,s[1]+Math.sin(c)*n],[s[0]+Math.cos(l)*n,s[1]+Math.sin(l)*n]],bounds:[s[0]-n,s[1]-n,s[0]+n,s[1]+n]})}}function k0(e,t,a,s,n){let r=s[0],i=Xd(s);for(let o=2;o<s.length;o+=1)e.push({featureId:t,kind:a,color:n,points:[r,s[o-1],s[o]],bounds:i})}function E0(e,t,a,s){let n=Gd(a,s,t.widthMm||.15),r=t.lineStyle||"DEFAULT";if(!["DASH","DASHED","DOT","DOTTED","DASHDOT","DASH_DOT"].includes(r)){e.push({...t,a,b:s,bounds:n});return}let i=s[0]-a[0],o=s[1]-a[1],c=Math.hypot(i,o);if(c<1e-6)return;let l=i/c,f=o/c,d=Math.max(t.widthMm*4,.45),h=r.includes("DOT")?[d*.8,d*.75,d*3,d*.75]:[d*3,d*1.5],g=0,p=0;for(;g<c;){let u=Math.min(h[p%h.length],c-g);if(p%2===0){let y=[a[0]+l*g,a[1]+f*g],b=[a[0]+l*(g+u),a[1]+f*(g+u)];e.push({...t,a:y,b,bounds:Gd(y,b,t.widthMm||.15)})}g+=u,p+=1}}function T0(e,t,a,s){for(let r=0;r<32;r+=1){let i=r/32*Math.PI*2,o=(r+1)/32*Math.PI*2;e.push({...t,a:[a[0]+Math.cos(i)*s,a[1]+Math.sin(i)*s],b:[a[0]+Math.cos(o)*s,a[1]+Math.sin(o)*s],bounds:[a[0]-s,a[1]-s,a[0]+s,a[1]+s]})}}function Xd(e,t=0){let a=1/0,s=1/0,n=-1/0,r=-1/0;for(let i of e||[])a=Math.min(a,i[0]),s=Math.min(s,i[1]),n=Math.max(n,i[0]),r=Math.max(r,i[1]);return Number.isFinite(a)?[a-t,s-t,n+t,r+t]:[0,0,0,0]}function Gd(e,t,a=0){let s=Math.max(.05,a*.5);return[Math.min(e[0],t[0])-s,Math.min(e[1],t[1])-s,Math.max(e[0],t[0])+s,Math.max(e[1],t[1])+s]}function xt(e,t){return!e||!t?!0:e[0]<=t[2]&&e[2]>=t[0]&&e[1]<=t[3]&&e[3]>=t[1]}function S0(e){let t={cellSize:b0,cells:new Map,segments:e.segments||[],fills:e.fills||[],images:e.images||[],queryId:0};for(let a of t.segments)Bi(t,"segments",a);for(let a of t.fills)Bi(t,"fills",a);for(let a of t.images)Bi(t,"images",a);return t}function Bi(e,t,a){let s=a.bounds;if(!s)return;let n=Math.floor(s[0]/e.cellSize),r=Math.floor(s[2]/e.cellSize),i=Math.floor(s[1]/e.cellSize),o=Math.floor(s[3]/e.cellSize);for(let c=i;c<=o;c+=1)for(let l=n;l<=r;l+=1){let f=`${l}:${c}`,d=e.cells.get(f);d||(d={segments:[],fills:[],images:[]},e.cells.set(f,d)),d[t].push(a)}}function zd(e,t){if(!e)return{segments:[],fills:[],images:[]};e.queryId=(e.queryId||0)+1;let a=e.queryId,s={segments:[],fills:[],images:[]},n=Math.floor(t[0]/e.cellSize),r=Math.floor(t[2]/e.cellSize),i=Math.floor(t[1]/e.cellSize),o=Math.floor(t[3]/e.cellSize);for(let c=i;c<=o;c+=1)for(let l=n;l<=r;l+=1){let f=e.cells.get(`${l}:${c}`);f&&(Ci(f.segments,s.segments,a,"segments"),Ci(f.fills,s.fills,a,"fills"),Ci(f.images,s.images,a,"images"))}return s}function Ci(e,t,a,s){let n=`_${s}QueryId`;for(let r of e)r[n]!==a&&(r[n]=a,t.push(r))}function Kd(e){let t=String(e.kind||"");if(String(e.fill||"").toUpperCase()==="FILLED_SHAPE"||e.closed===!0||["polygon","fill"].includes(t))return!0;let s=e.pointsMm||[];if(s.length>=3){let n=s[0],r=s[s.length-1];return Math.hypot(n[0]-r[0],n[1]-r[1])<1e-6}return!1}function rs(e){return!!e?.netUid}function I0(e){let t=String(e?.kind||""),a=String(e?.semanticRole||"");return t==="pin"||t==="pin_body"||t==="label"||t==="global_label"||t==="hierarchical_label"||t==="netclass_flag"||t==="power_symbol"||t==="power_port"||a==="label"||a==="global_label"||a==="hierarchical_label"}function A0(e){let t=String(e?.kind||""),a=String(e?.semanticRole||"");return t==="global_label"||a==="global_label"?130:t==="hierarchical_label"||a==="hierarchical_label"?125:t==="label"||a==="label"?118:t==="pin"||t==="pin_body"?106:t==="power_symbol"||t==="power_port"||t==="netclass_flag"?98:50}function R0(e){if(e.length<=Dd)return e;let t=e.slice(0,Dd);return t.sort((a,s)=>a.source[1]-s.source[1]||a.source[0]-s.source[0]),t}function _0(e,t,a={}){if(!e||!t?.length)return null;let s=a.featureId||a.stableKey||a.sourceId?t.find(l=>a.featureId&&Number(l.featureId||0)===Number(a.featureId)||a.stableKey&&l.stableKey===a.stableKey||a.sourceId&&l.sourceId===a.sourceId):null;if(s)return{...s,kind:"selected-net-occurrence",priority:200};let n=t.filter(l=>l.priority>=118).slice(0,16),r=n.length?n:t.slice(0,16),i=0,o=0;for(let l of r)i+=l.world[0],o+=l.world[1];let c=[i/r.length,o/r.length];return{pageId:e.id,featureId:r[0]?.featureId||0,kind:"page-net-occurrence",source:[0,0],world:c,bounds:[c[0],c[1],c[0],c[1]],priority:1}}function Vd(e,t,a){if(!e||e.length<2)return[];let s=e.map(i=>({...i})).sort((i,o)=>i.world[1]-o.world[1]||i.world[0]-o.world[0]),n=[],r=s.shift();for(;s.length;){let i=0,o=1/0;for(let l=0;l<s.length;l+=1){let f=s[l],d=Math.hypot(f.world[0]-r.world[0],f.world[1]-r.world[1]);d<o&&(o=d,i=l)}let c=s.splice(i,1)[0];n.push({type:t,pageId:a||r.pageId||c.pageId||"",a:r.world,b:c.world,sourceFeatureIds:[r.featureId,c.featureId].filter(Boolean)}),r=c}return n}function Hd(e,t=0){return[Math.min(e.a[0],e.b[0])-t,Math.min(e.a[1],e.b[1])-t,Math.max(e.a[0],e.b[0])+t,Math.max(e.a[1],e.b[1])+t]}function ss(e){let t=String(e?.kind||""),s=String(e?.semanticRole||"")||t;return s==="pin_number"||s==="pin_name"?120:s==="pin_body"||t==="pin"?110:s==="symbol_reference"||s==="symbol_value"?92:t==="junction"||t==="no_connect"?88:t==="wire"||t==="bus"||t==="bus_entry"?78:s==="symbol_body"||t==="symbol_body"?45:t==="symbol_instance"||t==="symbol_overplot"?30:t==="text"||String(s).includes("text")?24:10}function ns(e){let t=String(e?.kind||""),a=String(e?.semanticRole||"");if(t==="page"||t==="sheet_header")return!0;if(t==="graphic_rect"&&a==="graphic_rect"&&!e?.netUid&&!e?.componentUid){let s=e.boundsMm||[];return s[2]-s[0]>150&&s[3]-s[1]>120}return!1}function N0(e){if(!e||typeof e!="string")return null;let a=e.trim().match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);if(!a)return null;let s=a[1],n=a[2]??"ff";return[parseInt(s.slice(0,2),16)/255,parseInt(s.slice(2,4),16)/255,parseInt(s.slice(4,6),16)/255,parseInt(n,16)/255]}function Oi(e,t,a=""){let s=N0(a||e?.color||"");return e?.kind==="dnp_marker"?s||[.86,.04,.05,.85]:e?.dnp&&["symbol_reference","symbol_value","symbol_text"].includes(String(e?.kind||""))?[.5,.52,.54,.56]:s||(e?.dnp?[.5,.52,.54,.56]:rs(e)?[.12,.56,.2,.96]:e?.kind==="pin_name"?[0,.28,.31,.96]:e?.kind==="pin_number"?[.45,.17,.16,.96]:e?.kind==="pin_body"?[.28,.18,.18,.88]:e?.kind==="symbol_body"||e?.kind==="symbol_instance"?[.42,.18,.18,.72]:e?.kind==="symbol_reference"||e?.kind==="symbol_value"?[.05,.13,.16,.94]:e?.kind==="text"||String(t||"").startsWith("text")?[.05,.13,.16,.94]:[.16,.17,.19,.7])}function qd(e,t,a=""){let s=Oi(e,t,a);return[s[0]*.72,s[1]*.72,s[2]*.72,Math.min(s[3],.38)]}function B0(e,t,a){return a?5.5:e?.kind==="dnp_marker"?3:["pin_name","pin_number"].includes(String(e?.kind||""))?1.5:e?.kind==="pin_body"?1.7:String(t||"").startsWith("text")?1.35:t==="bus"||e?.kind==="bus"?4.2:rs(e)?2.6:e?.kind==="symbol_body"||e?.kind==="symbol_instance"||e?.kind==="sheet"?1.5:1.25}function Rn(e,t,a,s){return e[t++]=a[0],e[t++]=a[1],e[t++]=s[0],e[t++]=s[1],e[t++]=s[2],e[t++]=s[3],t}function C0(e,t,a,s,n,r){let i=Wd(a,s,n);if(!i)return t;for(let o of i)t=Rn(e,t,o,r);return t}function F0(e,t,a,s,n,r){return t=Rn(e,t,a,r),t=Rn(e,t,s,r),t=Rn(e,t,n,r),t}function ka(e,t,a,s,n){return e[t++]=a[0],e[t++]=a[1],e[t++]=s,e[t++]=n,t}function O0(e,t,a,s,n,r,i,o){let c=s[0]-a[0],l=s[1]-a[1],f=Math.hypot(c,l);if(f<1e-6||t+24>e.length)return t;let d=n*.5,h=c/f,p=-(l/f)*d,u=h*d,y=[a[0]+p,a[1]+u],b=[a[0]-p,a[1]-u],m=[s[0]+p,s[1]+u],x=[s[0]-p,s[1]-u],M=i+f/Math.max(o,1e-6);return t=ka(e,t,y,i,r),t=ka(e,t,b,i,r),t=ka(e,t,m,M,r),t=ka(e,t,m,M,r),t=ka(e,t,b,i,r),t=ka(e,t,x,M,r),t}function Wd(e,t,a){let s=t[0]-e[0],n=t[1]-e[1],r=Math.hypot(s,n);if(r<1e-6)return null;let i=a*.5,o=s/r*i,c=n/r*i,l=-n/r*i,f=s/r*i,d=[e[0]-o,e[1]-c],h=[t[0]+o,t[1]+c],g=[d[0]+l,d[1]+f],p=[d[0]-l,d[1]-f],u=[h[0]+l,h[1]+f],y=[h[0]-l,h[1]-f];return[g,p,u,u,p,y]}function P0(e,t,a){let s=a[0]-t[0],n=a[1]-t[1],r=s*s+n*n||1,i=ce(((e[0]-t[0])*s+(e[1]-t[1])*n)/r,0,1),o=t[0]+s*i,c=t[1]+n*i;return Math.hypot(e[0]-o,e[1]-c)}function j0(e,t){let[a,s,n,r]=t,[i,o]=e.a,[c,l]=e.b,f=1e-6,d=(h,g)=>({...e,a:h,b:g});if(Math.abs(o-l)<=f){let h=o;if(h<s-f||h>r+f)return[e];let g=Math.min(i,c),p=Math.max(i,c),u=Math.max(g,a),y=Math.min(p,n);if(y<=u+f)return[e];let b=[],m=i<=c;if(g<u-f){let x=m?[g,h]:[u,h],M=m?[u,h]:[g,h];b.push(d(x,M))}if(y<p-f){let x=m?[y,h]:[p,h],M=m?[p,h]:[y,h];b.push(d(x,M))}return b}if(Math.abs(i-c)<=f){let h=i;if(h<a-f||h>n+f)return[e];let g=Math.min(o,l),p=Math.max(o,l),u=Math.max(g,s),y=Math.min(p,r);if(y<=u+f)return[e];let b=[],m=o<=l;if(g<u-f){let x=m?[h,g]:[h,u],M=m?[h,u]:[h,g];b.push(d(x,M))}if(y<p-f){let x=m?[h,y]:[h,p],M=m?[h,p]:[h,y];b.push(d(x,M))}return b}return[e]}function _n(e,t,a,s){let n=t*12;e.setFloat32(n,a[0],!0),e.setFloat32(n+4,a[1],!0),e.setUint32(n+8,s,!0)}function L0(e,t,a,s,n,r){let i=Wd(a,s,n);if(!i)return t;for(let o of i)_n(e,t,o,r),t+=1;return t}function Fi(e,t,a,s,n,r){return _n(e,t,a,r),_n(e,t+1,s,r),_n(e,t+2,n,r),t+3}function D0(e,t){let a=Array.isArray(e?.layerIds)?e.layerIds:[];if(a.length<2&&e?.startLayerId!=null&&e?.endLayerId!=null&&(a=[e.startLayerId,e.endLayerId]),a.length<2&&e?.layerMask!=null)try{let s=BigInt(String(e.layerMask));a=t.filter((n,r)=>(s&1n<<BigInt(r))!==0n).map(n=>n.id)}catch{a=[]}return a}function U0(e){let t=e?.objectFeatureId??e?.id;if(t!=null&&Number.isFinite(Number(t))&&Number(t)!==0)return`feature:${Number(t)}`;let a=String(e?.sourceUid||"");return a?`source:${a}`:""}function $d(e,t){let a=new Map(e.map((o,c)=>[Number(o.id),c])),s=new Map(e.map(o=>[Number(o.id),o])),n=new Map,r=new Set,i={thru:0,blind:0,buried:0};for(let o of t){let c=U0(o);if(c){if(r.has(c))continue;r.add(c)}let l=[...new Set(D0(o,e).map(Number))].filter(x=>a.has(x)).sort((x,M)=>a.get(x)-a.get(M));if(l.length<2)continue;let f=l[0],d=l[l.length-1],h=a.get(f),g=a.get(d),p=h===0,u=g===e.length-1,y=p&&u?"thru":p||u?"blind":"buried";i[y]+=1;let b=`${f}:${d}:${y}`,m=n.get(b);if(m){m.count+=1;continue}n.set(b,{startId:f,endId:d,startName:s.get(f)?.name||String(f),endName:s.get(d)?.name||String(d),startIndex:h,endIndex:g,type:y,count:1})}return{counts:i,spans:[...n.values()]}}var is="http://www.w3.org/2000/svg";var G0=new Set(["script","foreignobject","iframe","object","embed"]),z0=new Set(["href","xlink:href"]),K0=1,V0=18,H0=8,Fn=class e{static create(t,a,s,n,r={}){return new e(t,a,s,n,r)}constructor(t,a,s,n,r){this.host=t,this.manifestUrl=a,this.manifest=s,this.featuresByPage=n||{},this.callbacks=r,this.activePage=null,this.activeSvgUrl="",this.container=null,this.svg=null,this.overlay=null,this.mountedPages=new Map,this.loadingPages=new Map,this.svgCache=new Map,this.serial=0,this.maxMountedWorldPages=K0,this.maxCachedSvgPages=V0,this.worldHandlersInstalled=!1,this.worldDrag=null,this.view={scale:1,tx:0,ty:0},this.drag=null,this.selected=null,this.highlightedNetUid="",this.index=Zd(),this.lastStats={mountedPages:0,domNodes:0,indexedFeatures:0,indexedNets:0,mountMs:0,coldMounts:0,warmMounts:0,highlightMs:0,selectionMs:0,cachedSvgPages:0,cachedSvgBytes:0,heapMb:null,fallbackReason:""}}get active(){return!!(this.container&&this.activePage)}get worldActive(){return this.mountedPages.size>0}stats(){return{...this.lastStats,activePage:this.activePage?.name||[...this.mountedPages.values()][0]?.page?.name||"-",mountedPages:this.active?1:this.mountedPages.size}}dispose(){this.unmountPage(),this.unmountWorldPages()}unmountPage(){this.container?.remove(),this.container=null,this.svg=null,this.overlay=null,this.activePage=null,this.activeSvgUrl="",this.index=Zd(),this.host.hidden=!0}unmountWorldPages(){for(let t of this.mountedPages.values())t.container.remove();this.mountedPages.clear(),this.loadingPages.clear(),this.active||(this.host.hidden=!0)}async preloadPages(t){let a=performance.now(),s=await Promise.allSettled((t||[]).slice(0,H0).map(n=>this.loadSvgTemplate(n)));this.lastStats.preloadedPages=s.filter(n=>n.status==="fulfilled"&&n.value).length,this.lastStats.preloadMs=performance.now()-a,this.updateCacheStats()}syncWorldPages(t,a,s={}){if(!a)return;this.installWorldHandlers(a);let n=(t||[]).slice(0,s.maxMountedPages||this.maxMountedWorldPages),r=new Set(n.map(i=>i.id));for(let[i,o]of this.mountedPages)r.has(i)||(o.container.remove(),this.mountedPages.delete(i));for(let i of n){let o=this.mountedPages.get(i.id);if(o)o.lastUsed=++this.serial,this.positionWorldEntry(o,a);else if(!this.loadingPages.has(i.id)){let c=this.mountWorldPage(i).then(l=>{l&&r.has(i.id)?this.positionWorldEntry(l,a):l?.container.remove()}).finally(()=>this.loadingPages.delete(i.id));this.loadingPages.set(i.id,c)}}this.pruneMountedWorldPages(r),this.host.hidden=n.length===0&&!this.active,this.setSelection(this.selected),this.setHighlightedNet(s.activeNetUid??this.highlightedNetUid),this.lastStats.mountedPages=this.mountedPages.size,this.updateCacheStats()}async mountWorldPage(t){let a=performance.now(),s=this.hasCachedSvg(t),n=await this.loadImportedSvg(t);if(!n)return null;let r=document.createElement("div");r.className="svg-dom-page svg-dom-world-page",r.dataset.pageId=t.id,r.append(n),this.host.append(r);let i=Jd(n),o=Qd(n),c=Yd(n,t,this.featuresByPage[t.id]||[]),l={page:t,container:r,svg:n,overlay:i,selectionOverlay:o,index:c,mountMs:performance.now()-a,lastUsed:++this.serial,warm:s};return this.mountedPages.set(t.id,l),this.lastStats={...this.lastStats,mountedPages:this.mountedPages.size,domNodes:[...this.mountedPages.values()].reduce((f,d)=>f+d.svg.querySelectorAll("*").length,0),indexedFeatures:[...this.mountedPages.values()].reduce((f,d)=>f+d.index.featureToElements.size,0),indexedNets:new Set([...this.mountedPages.values()].flatMap(f=>[...f.index.netToElements.keys()])).size,mountMs:l.mountMs,coldMounts:this.lastStats.coldMounts+(l.warm?0:1),warmMounts:this.lastStats.warmMounts+(l.warm?1:0),fallbackReason:""},this.updateCacheStats(),l}async loadImportedSvg(t){let a=await this.loadSvgTemplate(t);return a?a.cloneNode(!0):null}async loadSvgTemplate(t){let a=this.svgUrlForPage(t),s=this.svgCache.get(a);if(s?.template)return s.lastUsed=++this.serial,s.template;if(s?.promise)return s.promise;let n=performance.now(),r=(async()=>{let i=await fetch(a,{cache:"default"});if(!i.ok)return this.lastStats.fallbackReason=`Failed to load SVG page ${t.id}: ${i.status}`,this.callbacks.onFallback?.(this.lastStats.fallbackReason),null;let o=await i.text(),l=new DOMParser().parseFromString(o,"image/svg+xml"),f=l.documentElement;if(!f||f.localName.toLowerCase()!=="svg"||l.querySelector("parsererror"))return this.lastStats.fallbackReason=`Invalid SVG for page ${t.id}`,this.callbacks.onFallback?.(this.lastStats.fallbackReason),null;q0(l,a,t.id);let d=document.importNode(f,!0);d.classList.add("svg-dom-page-svg"),Q0(d);let h=this.svgCache.get(a)||{};return Object.assign(h,{template:d,promise:null,pageId:t.id,byteLength:o.length*2,loadMs:performance.now()-n,lastUsed:++this.serial}),this.svgCache.set(a,h),this.pruneSvgCache(),this.updateCacheStats(),d})();return this.svgCache.set(a,{promise:r,pageId:t.id,byteLength:0,loadMs:0,lastUsed:++this.serial}),r}svgUrlForPage(t){return new URL(t.svg||t.thumbnail?.path,this.manifestUrl).toString()}positionWorldEntry(t,a){let{page:s,container:n}=t,[r,i]=a.worldToScreen(s.worldX,s.worldY),[o,c]=a.worldToScreen(s.worldX+s.widthMm,s.worldY+s.heightMm),l=Math.max(1,o-r),f=Math.max(1,c-i);n.style.transform=`translate3d(${r}px, ${i}px, 0)`,n.style.width=`${l}px`,n.style.height=`${f}px`}installWorldHandlers(t){if(this.worldHandlersInstalled)return;this.worldHandlersInstalled=!0;let a=this.host;a.oncontextmenu=s=>s.preventDefault(),a.onpointerdown=s=>{let n=s.button===0&&!s.shiftKey&&!!s.target.closest?.("text"),i=s.target.closest?.("[data-feature-key]")?null:this.featureAtEvent(s);this.worldDrag={pointerId:s.pointerId,startX:s.clientX,startY:s.clientY,lastX:s.clientX,lastY:s.clientY,button:s.button,moved:!1,pan:!n&&(s.button===0||s.button===1||s.shiftKey),allowTextSelection:n},n||a.setPointerCapture(s.pointerId)},a.onpointermove=s=>{if(!this.worldDrag||this.worldDrag.pointerId!==s.pointerId)return;let n=s.clientX-this.worldDrag.lastX,r=s.clientY-this.worldDrag.lastY;this.worldDrag.lastX=s.clientX,this.worldDrag.lastY=s.clientY,Math.hypot(s.clientX-this.worldDrag.startX,s.clientY-this.worldDrag.startY)>3&&(this.worldDrag.moved=!0),this.worldDrag.pan&&t.pan(n,r)},a.onpointerup=s=>{if(!this.worldDrag||this.worldDrag.pointerId!==s.pointerId)return;let n=this.worldDrag;if(this.worldDrag=null,n.allowTextSelection||a.releasePointerCapture(s.pointerId),n.button!==0||n.moved)return;let r=s.target.closest?.("[data-feature-key]");if(r)this.selectElement(r,s);else{let i=this.featureAtEvent(s);i?this.selectFeature(i.entry,i.feature,s):this.callbacks.onBlank?.()}},a.ondblclick=s=>{let n=s.target.closest?.("[data-feature-key]"),r=n?null:this.featureAtEvent(s),i=r?.entry||this.entryForPoint(s.clientX,s.clientY),o=n?this.selectionFromElement(n):r?this.selectionFromFeature(r.entry,r.feature):this.selected;eu(o)?this.callbacks.onOpenPage?.(o):o?.netUid?this.callbacks.onHighlightNet?.(o.netUid,o):!r&&i?.page&&this.callbacks.onOpenPage?.({kind:"page",pageId:i.page.id,page:i.page})},a.onwheel=s=>{s.preventDefault(),Math.abs(s.deltaX)>Math.abs(s.deltaY)*.65?t.pan(-s.deltaX,-s.deltaY):t.zoom(s.deltaY,s.clientX,s.clientY)}}async focusPage(t,a={}){if(!t)return!1;if(this.activePage?.id===t.id&&this.active)return a.frame!==!1&&this.fitPage(),!0;let s=performance.now(),n=await this.loadImportedSvg(t);if(!n)return!1;let r=document.createElement("div");return r.className="svg-dom-page",r.append(n),this.host.replaceChildren(r),this.host.hidden=!1,this.container=r,this.svg=n,this.activePage=t,this.activeSvgUrl=new URL(t.svg||t.thumbnail?.path,this.manifestUrl).toString(),this.overlay=Jd(n),this.selectionOverlay=Qd(n),this.index=Yd(n,t,this.featuresByPage[t.id]||[]),this.installPageHandlers(),this.fitPage(),this.setSelection(this.selected),this.setHighlightedNet(this.highlightedNetUid),this.lastStats={...this.lastStats,mountedPages:1,domNodes:n.querySelectorAll("*").length,indexedFeatures:this.index.featureToElements.size,indexedNets:this.index.netToElements.size,mountMs:performance.now()-s,fallbackReason:""},this.updateCacheStats(),!0}installPageHandlers(){let t=this.host;t.oncontextmenu=a=>a.preventDefault(),t.onpointerdown=a=>{if(!this.active)return;let s=a.button===0&&!a.shiftKey&&!!a.target.closest?.("text"),n=a.target.closest?.("[data-feature-key]"),r=n?null:this.featureAtEvent(a);this.drag={pointerId:a.pointerId,startX:a.clientX,startY:a.clientY,lastX:a.clientX,lastY:a.clientY,button:a.button,moved:!1,pan:!s&&(a.button===0||a.button===1||a.shiftKey),featureElement:n,allowTextSelection:s},s||t.setPointerCapture(a.pointerId)},t.onpointermove=a=>{if(!this.drag||this.drag.pointerId!==a.pointerId)return;let s=a.clientX-this.drag.lastX,n=a.clientY-this.drag.lastY;this.drag.lastX=a.clientX,this.drag.lastY=a.clientY,Math.hypot(a.clientX-this.drag.startX,a.clientY-this.drag.startY)>3&&(this.drag.moved=!0),this.drag.pan&&(this.view.tx+=s,this.view.ty+=n,this.applyTransform())},t.onpointerup=a=>{if(!this.drag||this.drag.pointerId!==a.pointerId)return;let s=this.drag;if(this.drag=null,s.allowTextSelection||t.releasePointerCapture(a.pointerId),s.button!==0||s.moved)return;let n=a.target.closest?.("[data-feature-key]");if(n)this.selectElement(n,a);else{let r=this.featureAtEvent(a);r?this.selectFeature(r.entry,r.feature,a):this.callbacks.onBlank?.()}},t.ondblclick=a=>{let s=a.target.closest?.("[data-feature-key]"),n=s?null:this.featureAtEvent(a),r=s?this.selectionFromElement(s):n?this.selectionFromFeature(n.entry,n.feature):this.selected;eu(r)?this.callbacks.onOpenPage?.(r):r?.netUid?this.callbacks.onHighlightNet?.(r.netUid,r):!n&&this.activePage&&this.callbacks.onOpenPage?.({kind:"page",pageId:this.activePage.id,page:this.activePage})},t.onwheel=a=>{if(a.preventDefault(),!this.active)return;if(Math.abs(a.deltaX)>Math.abs(a.deltaY)*.65){this.view.tx-=a.deltaX,this.view.ty-=a.deltaY,this.applyTransform();return}let s=this.host.getBoundingClientRect(),n=a.clientX-s.left,r=a.clientY-s.top,i=this.screenToSvg(n,r),o=Math.exp(-a.deltaY*.0016);this.view.scale=Bn(this.view.scale*o,.02,80),this.view.tx=n-i[0]*this.view.scale,this.view.ty=r-i[1]*this.view.scale,this.applyTransform()}}selectElement(t,a){let s=performance.now(),n=this.selectionFromElement(t);if(this.setSelection(n),a){let r=this.host.getBoundingClientRect();n.anchor={x:a.clientX-r.left,y:a.clientY-r.top}}this.callbacks.onSelect?.(n),this.lastStats.selectionMs=performance.now()-s}selectFeature(t,a,s){let n=performance.now(),r=this.selectionFromFeature(t,a);if(this.setSelection(r),s){let i=this.host.getBoundingClientRect();r.anchor={x:s.clientX-i.left,y:s.clientY-i.top}}this.callbacks.onSelect?.(r),this.lastStats.selectionMs=performance.now()-n}selectionFromElement(t){let a=t.dataset.featureKey||"",s=this.entryForElement(t),n=s.index.featureByKey.get(a)||{};return this.selectionFromFeature(s,n,t)}selectionFromFeature(t,a,s=null){let n=a?.stableKey||s?.dataset?.featureKey||"",r=t?.page||this.activePage,i=a?.kind||s?.dataset?.role||s?.dataset?.primitive||"feature",o=a?.netUid||s?.dataset?.netUid||"",c=a?.netName||s?.dataset?.netName||"";return i==="sheet"?{kind:"sheet",featureKey:n,sheetInstancePath:a?.sheetInstancePath||r?.sheetInstancePath||"",sourceId:a?.sourceId||s?.dataset?.sourceId||s?.dataset?.objectId||s?.dataset?.uuid||"",sheetName:a?.sheet_name||a?.sheetName||s?.dataset?.sheetName||a?.objectId||"",sheetFile:a?.sheet_file||a?.sheetFile||s?.dataset?.sheetFile||"",feature:a}:i==="pin"||i==="pin_body"||i==="pin_name"||i==="pin_number"||s?.dataset?.pin?{kind:"pin",featureKey:n,sheetInstancePath:a?.sheetInstancePath||r?.sheetInstancePath||"",sourceId:a?.sourceId||s?.dataset?.sourceId||s?.dataset?.objectId||s?.dataset?.uuid||"",symbolUuid:a?.symbolUuid||s?.dataset?.symbolUuid||"",reference:a?.reference||s?.dataset?.designator||s?.dataset?.component||s?.dataset?.ref||"",pinNumber:a?.pinNumber||s?.dataset?.pin||"",pinName:a?.pinName||"",netUid:o,netName:c,feature:a}:i==="symbol_body"||i==="symbol_instance"||i==="component"||s?.dataset?.ref?{kind:"component",featureKey:n,sheetInstancePath:a?.sheetInstancePath||r?.sheetInstancePath||"",sourceId:a?.sourceId||s?.dataset?.sourceId||s?.dataset?.objectId||s?.dataset?.uuid||"",symbolUuid:a?.symbolUuid||s?.dataset?.symbolUuid||"",reference:a?.reference||s?.dataset?.designator||s?.dataset?.component||s?.dataset?.ref||"",netUid:o,netName:c,feature:a}:{kind:o?"feature":i,featureKey:n,sheetInstancePath:a?.sheetInstancePath||r?.sheetInstancePath||"",sourceId:a?.sourceId||s?.dataset?.sourceId||s?.dataset?.objectId||s?.dataset?.uuid||"",role:i,netUid:o,netName:c,feature:a}}setSelection(t){this.selected=t||null;for(let s of this.host.querySelectorAll(".prism-svg-selected"))s.classList.remove("prism-svg-selected");for(let s of this.host.querySelectorAll("[data-prism-overlay='selection']"))s.replaceChildren();let a=t?.featureKey||"";if(a){for(let s of this.entries()){for(let n of s.index.featureToElements.get(a)||[])n.classList.add("prism-svg-selected");this.drawSelectionOverlay(s,t)}for(let s of this.index.featureToElements.get(a)||[])s.classList.add("prism-svg-selected");this.drawSelectionOverlay({page:this.activePage,index:this.index,selectionOverlay:this.selectionOverlay},t)}}setHighlightedNet(t){this.highlightedNetUid=t||"";let a=performance.now();for(let s of this.entries())this.updateEntryHighlight(s);if(!this.svg||!this.overlay){this.lastStats.highlightMs=performance.now()-a;return}this.updateEntryHighlight({svg:this.svg,overlay:this.overlay,index:this.index,page:this.activePage}),this.lastStats.highlightMs=performance.now()-a}updateEntryHighlight(t){if(!t?.svg||!t?.overlay||(t.overlay.replaceChildren(),!this.highlightedNetUid))return;let a=Cn(t.svg,t.page),s=document.createElementNS(is,"rect");s.setAttribute("x",String(a[0])),s.setAttribute("y",String(a[1])),s.setAttribute("width",String(a[2])),s.setAttribute("height",String(a[3])),s.setAttribute("class","prism-svg-net-dimmer"),t.overlay.append(s);let r=(t.index.netToElements.get(this.highlightedNetUid)||[]).slice(0,2200);for(let i of r){let o=Z0(i);t.overlay.append(o)}}entries(){return[...this.mountedPages.values()]}entryForElement(t){let s=t.closest?.(".svg-dom-page")?.dataset.pageId||"";return this.mountedPages.get(s)||{page:this.activePage,index:this.index,svg:this.svg,overlay:this.overlay,selectionOverlay:this.selectionOverlay}}featureAtEvent(t){let a=this.entryForPoint(t.clientX,t.clientY);if(!a)return null;let s=this.clientToSvg(a,t.clientX,t.clientY);if(!s)return null;let n=Math.max(.18,5*tx(a)),i=a.index.features.filter(o=>(o?.domBoundsMm||o?.boundsMm)&&su(o)).filter(o=>s[0]>=(o.domBoundsMm||o.boundsMm)[0]-n&&s[0]<=(o.domBoundsMm||o.boundsMm)[2]+n&&s[1]>=(o.domBoundsMm||o.boundsMm)[1]-n&&s[1]<=(o.domBoundsMm||o.boundsMm)[3]+n).map(o=>({feature:o,priority:sx(o),area:Math.max(1e-4,((o.domBoundsMm||o.boundsMm)[2]-(o.domBoundsMm||o.boundsMm)[0])*((o.domBoundsMm||o.boundsMm)[3]-(o.domBoundsMm||o.boundsMm)[1]))})).sort((o,c)=>c.priority-o.priority||o.area-c.area)[0]?.feature;return i?{entry:a,feature:i,point:s}:null}entryForPoint(t,a){for(let s of[...this.entries()].reverse()){let n=s.container.getBoundingClientRect();if(t>=n.left&&t<=n.right&&a>=n.top&&a<=n.bottom)return s}if(this.container){let s=this.container.getBoundingClientRect();if(t>=s.left&&t<=s.right&&a>=s.top&&a<=s.bottom)return{page:this.activePage,container:this.container,svg:this.svg,index:this.index,selectionOverlay:this.selectionOverlay}}return null}clientToSvg(t,a,s){if(!t?.container||!t?.svg||!t?.page)return null;let n=t.container.getBoundingClientRect();if(!n.width||!n.height)return null;let r=Cn(t.svg,t.page);return[r[0]+(a-n.left)/n.width*r[2],r[1]+(s-n.top)/n.height*r[3]]}drawSelectionOverlay(t,a){if(!t?.selectionOverlay||!a?.featureKey)return;let s=t.index.featureByKey.get(a.featureKey),n=s?.domBoundsMm||s?.boundsMm;if(!n)return;let[r,i,o,c]=n,l=document.createElementNS(is,"rect");l.setAttribute("x",String(r)),l.setAttribute("y",String(i)),l.setAttribute("width",String(Math.max(.001,o-r))),l.setAttribute("height",String(Math.max(.001,c-i))),l.setAttribute("rx","0.65"),l.setAttribute("ry","0.65"),l.setAttribute("class","prism-svg-selection-box"),t.selectionOverlay.append(l)}fitPage(){if(!this.svg||!this.activePage)return;let t=Cn(this.svg,this.activePage),a=t[2]||this.activePage.sourceWidthMm||this.activePage.widthMm||1,s=t[3]||this.activePage.sourceHeightMm||this.activePage.heightMm||1,n=this.host.getBoundingClientRect(),r=Math.min(n.width/a,n.height/s)*.92;this.view.scale=Bn(r,.02,80),this.view.tx=(n.width-a*this.view.scale)/2-t[0]*this.view.scale,this.view.ty=(n.height-s*this.view.scale)/2-t[1]*this.view.scale,this.applyTransform()}frameSelection(t=this.selected){if(!t?.featureKey||!this.active){this.fitPage();return}let a=this.index.featureToElements.get(t.featureKey)||[],s=au(a);if(!s)return;let n=this.host.getBoundingClientRect(),r=Math.max(1,s[2]-s[0]),i=Math.max(1,s[3]-s[1]),o=Math.min(n.width/r,n.height/i)*.36;this.view.scale=Bn(o,.04,80),this.view.tx=n.width/2-(s[0]+s[2])/2*this.view.scale,this.view.ty=n.height/2-(s[1]+s[3])/2*this.view.scale,this.applyTransform()}pan(t,a){this.active&&(this.view.tx+=t,this.view.ty+=a,this.applyTransform())}zoom(t,a,s){if(!this.active)return;let n=this.host.getBoundingClientRect(),r=(a??n.left+n.width/2)-n.left,i=(s??n.top+n.height/2)-n.top,o=this.screenToSvg(r,i),c=Math.exp(-t*.0016);this.view.scale=Bn(this.view.scale*c,.02,80),this.view.tx=r-o[0]*this.view.scale,this.view.ty=i-o[1]*this.view.scale,this.applyTransform()}screenToSvg(t,a){return[(t-this.view.tx)/Math.max(1e-6,this.view.scale),(a-this.view.ty)/Math.max(1e-6,this.view.scale)]}applyTransform(){this.container&&(this.container.style.transform=`translate3d(${this.view.tx}px, ${this.view.ty}px, 0) scale(${this.view.scale})`)}hasCachedSvg(t){return!!this.svgCache.get(this.svgUrlForPage(t))?.template}pruneMountedWorldPages(t=new Set){if(this.mountedPages.size<=this.maxMountedWorldPages)return;let a=[...this.mountedPages.entries()].filter(([s])=>!t.has(s)).sort((s,n)=>(s[1].lastUsed||0)-(n[1].lastUsed||0));for(let[s,n]of a){if(this.mountedPages.size<=this.maxMountedWorldPages)break;n.container.remove(),this.mountedPages.delete(s)}}pruneSvgCache(){let t=[...this.svgCache.entries()].filter(([,n])=>n?.template);if(t.length<=this.maxCachedSvgPages)return;let a=new Set([...this.mountedPages.values()].map(n=>this.svgUrlForPage(n.page)));this.activePage&&a.add(this.svgUrlForPage(this.activePage));let s=t.filter(([n])=>!a.has(n)).sort((n,r)=>(n[1].lastUsed||0)-(r[1].lastUsed||0));for(let[n]of s){if([...this.svgCache.values()].filter(r=>r?.template).length<=this.maxCachedSvgPages)break;this.svgCache.delete(n)}}updateCacheStats(){let t=[...this.svgCache.values()].filter(s=>s?.template);this.lastStats.cachedSvgPages=t.length,this.lastStats.cachedSvgBytes=t.reduce((s,n)=>s+(n.byteLength||0),0);let a=performance?.memory;this.lastStats.heapMb=a?.usedJSHeapSize?a.usedJSHeapSize/1048576:null}};function q0(e,t,a){for(let r of[...e.querySelectorAll("*")]){if(G0.has(r.localName.toLowerCase())){r.remove();continue}for(let i of[...r.attributes]){let o=i.name,c=o.toLowerCase(),l=i.value||"";if(c.startsWith("on")){r.removeAttribute(o);continue}if((c==="href"||c==="xlink:href"||c==="src")&&nu(l)){if((c==="href"||c==="xlink:href")&&r.localName.toLowerCase()==="image"&&rx(l))continue;r.removeAttribute(o);continue}c==="style"&&r.setAttribute(o,ox(l))}}let s=`prism-${Pi(a)}-`,n=new Map;for(let r of e.querySelectorAll("[id]")){let i=r.getAttribute("id"),o=`${s}${Pi(i)}`;n.set(i,o),r.setAttribute("id",o)}for(let r of e.querySelectorAll("*"))for(let i of[...r.attributes]){let o=i.name.toLowerCase(),c=i.value||"";z0.has(o)&&(c.startsWith("#")&&n.has(c.slice(1))?c=`#${n.get(c.slice(1))}`:ix(c)&&(c=new URL(c,t).toString())),c=cx(c,n),r.setAttribute(i.name,c)}}function Yd(e,t,a){let s=new Map,n=new Map,r=new Map,i=[];for(let f of a){let d=$0(f,t);i.push(d),n.set(d.stableKey,d),r.set(Number(d.id||0),d);for(let h of Y0(d))s.has(h)||s.set(h,[]),s.get(h).push(d)}let o=new Map,c=new Map,l=new Map;for(let f of i)l.set(f.stableKey,f);for(let f of e.querySelectorAll("[data-uuid], [data-element-key], [data-primitive], [data-ref], [data-pin], [data-object-id], [data-designator], [data-component]")){let d=X0(f,s,t);if(d&&!su(d)||!d&&!nx(f))continue;let h=J0(f,t),g=d?.stableKey||h,p=d?.netUid||"",u=d?.netName||"";f.classList.add("prism-feature"),f.dataset.featureKey=g,f.dataset.sourceId=d?.sourceId||f.dataset.uuid||f.dataset.elementKey||"",f.dataset.role=d?.kind||f.dataset.primitive||f.dataset.ref||"feature",d?.id&&(f.dataset.featureId=String(d.id)),p&&(f.dataset.netUid=p),u&&(f.dataset.netName=u),f.id||(f.id=`prism-feature-${Pi(g)}`),tu(o,g,f),l.set(g,d||{id:0,stableKey:g,kind:f.dataset.role,sourceId:f.dataset.sourceId,sheetInstancePath:t.sheetInstancePath||""}),p&&tu(c,p,f)}for(let[f,d]of o){let h=l.get(f),g=au(d);h&&g&&(h.domBoundsMm=ex(h.boundsMm,g))}return{featureToElements:o,netToElements:c,featureByKey:l,byId:r,bySource:s,features:i}}function X0(e,t,a){let n=[e.dataset.uuid,e.dataset.elementKey,e.dataset.sourceId,e.dataset.objectId,e.dataset.componentUid,e.dataset.componentUuid,e.dataset.ref&&`${e.dataset.ref}:${e.dataset.pin||""}`].filter(Boolean).flatMap(i=>t.get(i)||[]);if(!n.length)return null;let r=String(e.dataset.primitive||e.dataset.ref||e.dataset.pin||"").toLowerCase();return n.map(i=>({feature:i,score:W0(i,r,a)})).sort((i,o)=>o.score-i.score)[0].feature}function W0(e,t,a){let s=0,n=String(e.kind||"").toLowerCase();return e.sheetInstancePath===a.sheetInstancePath&&(s+=20),e.netUid&&(s+=4),t&&n.includes(t)&&(s+=8),t==="symbol"&&n==="symbol_body"&&(s+=12),(t==="label"||t==="port")&&(n.includes("label")||n.includes("port"))&&(s+=12),t==="sheet"&&n==="sheet"&&(s+=12),n!=="record"&&(s+=2),n.includes("pin")&&(s+=2),s}function $0(e,t){let a=e.sourceId||e.sourceUid||e.uuid||e.objectId||e.stableKey||"";return{...e,id:Number(e.id||0),sourceId:a,stableKey:e.stableKey||`${t.sheetInstancePath||t.id}|${a}|0|${e.kind||"feature"}|0`,sheetInstancePath:e.sheetInstancePath||t.sheetInstancePath||""}}function Y0(e){let t=new Set([e.sourceId,e.sourceUid,e.uuid,e.objectId,e.stableKey].filter(Boolean).map(String));return e.reference&&e.pinNumber&&t.add(`${e.reference}:${e.pinNumber}`),e.componentDesignator&&t.add(e.componentDesignator),e.reference&&t.add(e.reference),[...t]}function J0(e,t){let a=e.dataset.uuid||e.dataset.elementKey||e.dataset.objectId||e.dataset.ref||e.id||"svg",s=e.dataset.primitive||e.dataset.role||e.localName||"feature";return`${t.sheetInstancePath||t.id}|${a}|0|${s}|0`}function Q0(e){let t=document.createElementNS(is,"style");t.textContent=`
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
  `,e.prepend(t)}function Jd(e){let t=document.createElementNS(is,"g");return t.setAttribute("class","prism-svg-net-overlay"),t.setAttribute("data-prism-overlay","net-highlight"),e.append(t),t}function Qd(e){let t=document.createElementNS(is,"g");return t.setAttribute("class","prism-svg-selection-overlay"),t.setAttribute("data-prism-overlay","selection"),t.style.pointerEvents="none",e.append(t),t}function Z0(e){let t=e.cloneNode(!0);t.removeAttribute("id"),t.removeAttribute("data-feature-key"),t.removeAttribute("data-net-uid"),t.removeAttribute("data-net-name"),t.classList.add("prism-svg-net-overlay-clone");for(let a of[t,...Array.from(t.querySelectorAll?.("*")||[])])a instanceof SVGElement&&(a.removeAttribute("filter"),a.style.pointerEvents="none",a.style.stroke="#18ef52",a.style.fill="none",a.style.opacity="0.98",a.style.vectorEffect="non-scaling-stroke");return t}function au(e){let t=null;for(let a of e)if(a.getBBox)try{let s=a.getBBox(),n=[s.x,s.y,s.x+s.width,s.y+s.height];t=t?[Math.min(t[0],n[0]),Math.min(t[1],n[1]),Math.max(t[2],n[2]),Math.max(t[3],n[3])]:n}catch{}return t}function ex(e,t){return e?t?[Math.min(e[0],t[0]),Math.min(e[1],t[1]),Math.max(e[2],t[2]),Math.max(e[3],t[3])]:e:t}function Cn(e,t){let a=e.getAttribute("viewBox");if(a){let s=a.trim().split(/[\s,]+/).map(Number);if(s.length===4&&s.every(Number.isFinite))return s}return[0,0,t.sourceWidthMm||t.widthMm||1,t.sourceHeightMm||t.heightMm||1]}function Zd(){return{featureToElements:new Map,netToElements:new Map,featureByKey:new Map,byId:new Map,bySource:new Map,features:[]}}function tx(e){let t=e?.container?.getBoundingClientRect?.();if(!e?.svg||!e?.page||!t?.width||!t?.height)return .1;let a=Cn(e.svg,e.page);return Math.max(a[2]/t.width,a[3]/t.height)}function ax(e){let t=String(e?.kind||"").toLowerCase(),a=String(e?.semanticRole||"").toLowerCase(),s=`${e?.sourceId||""} ${e?.objectId||""} ${e?.text||""}`.toLowerCase();return t.includes("page")||a.includes("page")||t.includes("background")||a.includes("background")||s.includes("background")||s.includes("sheet_header")||s.includes("sheet header")||s.includes("drawing-sheet")}function sx(e){let t=String(e?.kind||e?.semanticRole||"").toLowerCase();return t.includes("pin")?90:t.includes("label")||t.includes("port")?78:t.includes("wire")||t.includes("bus")||t.includes("junction")?70:t.includes("symbol")||t.includes("component")?54:t.includes("image")?30:20}function su(e){if(!e||ax(e))return!1;let t=String(e.kind||e.semanticRole||"").toLowerCase();return["pin","label","port","wire","bus","junction","no_connect","symbol","component","sheet","image","text"].some(a=>t.includes(a))}function nx(e){let t=`${e?.dataset?.primitive||""} ${e?.dataset?.ref||""} ${e?.dataset?.role||""} ${e?.dataset?.objectId||""} ${e?.dataset?.text||""}`.toLowerCase();return!t||t.includes("background")||t.includes("sheet_header")||t.includes("sheet header")||t.includes("drawing-sheet")?!1:["pin","label","port","wire","bus","junction","no_connect","symbol","component","sheet","image","text"].some(a=>t.includes(a))}function eu(e){return String(e?.kind||e?.feature?.kind||"").toLowerCase()==="sheet"}function tu(e,t,a){e.has(t)||e.set(t,[]),e.get(t).push(a)}function nu(e){let t=String(e||"").trim().toLowerCase();return!t||t.startsWith("#")?!1:t.startsWith("javascript:")||t.startsWith("data:")||t.startsWith("http://")||t.startsWith("https://")}function rx(e){return/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(String(e||"").trim())}function ix(e){let t=String(e||"").trim();return t&&!t.startsWith("#")&&!/^[a-z][a-z0-9+.-]*:/i.test(t)}function ox(e){return String(e||"").replace(/url\(([^)]+)\)/gi,(t,a)=>{let s=a.trim().replace(/^['"]|['"]$/g,"");return nu(s)?"none":t})}function cx(e,t){let a=String(e||"");return a=a.replace(/url\(#([^)]+)\)/g,(s,n)=>t.has(n)?`url(#${t.get(n)})`:s),a=a.replace(/^#(.+)$/,(s,n)=>t.has(n)?`#${t.get(n)}`:s),a}function Pi(e){return String(e||"").trim().replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,96)||"item"}function Bn(e,t,a){return Math.max(t,Math.min(a,e))}function vt(e){return`${e.level||""}/${e.id}`}function ru(e){let t=e.ends||[],a=e.wires||[];return t.length<2?[]:t.length===2?[{key:`${t[0].id}~${t[1].id}`,a:t[0].id,b:t[1].id,wires:new Set(a.map(s=>s.id))}]:t.map(s=>({key:`hub~${s.id}`,a:"hub",b:s.id,wires:new Set(a.filter(n=>n.from===s.id||n.to===s.id).map(n=>n.id))}))}function lx(e,t){return!t||t.harness!==e.id?!1:!e.level||!t.occurrence||t.occurrence.startsWith(`${e.level}/`)}function iu(e,t){let a=new Map;for(let s of e||[]){let n=new Map,r=new Set((s.wires||[]).map(i=>i.id));for(let i of t||[])for(let o of i.wires||[])r.has(o.wire)&&lx(s,o)&&!n.has(o.wire)&&n.set(o.wire,i.color);n.size&&a.set(vt(s),n)}return a}function ou(e,t){if(!t)return null;for(let a of e.wires)if(t.has(a))return t.get(a);return null}function cu(e,t){let a=new Map;if(!t)return a;for(let s of e.wires||[]){let n=t.get(s.id);n&&(a.has(s.from)||a.set(s.from,n),a.has(s.to)||a.set(s.to,n))}return a}function lu(e){let t=e.filter(Boolean);return t.length<2?null:[0,1,2].map(a=>t.reduce((s,n)=>s+n[a],0)/t.length)}var $t="auto",dx=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];function Ta(e,t){return e.level?t(e.level):dx}function ji(e,t){return[0,1,2].map(a=>e[a]*t[0]+e[4+a]*t[1]+e[8+a]*t[2]+e[12+a])}function os(e,t){let a=[t[0]-e[12],t[1]-e[13],t[2]-e[14]];return[0,1,2].map(s=>e[s*4]*a[0]+e[s*4+1]*a[1]+e[s*4+2]*a[2])}function Li(e,t,a){return t?e.map(s=>{if(a(s)!==t.harness)return s;let n=s.nodes??[];if(t.insert)return{...s,nodes:[...n,t.insert]};let r=t.id===$t?[{id:$t,kind:"breakout",positionMm:t.positionMm,pinned:!1,order:-1,ends:[],between:null},...n]:n.map(i=>i.id===t.id?{...i,positionMm:t.positionMm,pinned:i.kind==="waypoint"?!0:i.pinned}:i);return{...s,nodes:r}}):e}var du="__bend__";function uu(e,{kind:t,segment:a,atMm:s,positionMm:n,toWorldMm:r}){if(t==="breakout"){let y=e.filter(b=>b.kind==="breakout").reduce((b,m)=>Math.max(b,m.order??0),-1);return{id:du,kind:"breakout",positionMm:n,pinned:!1,order:y+1,ends:[],between:null}}let i=a.samplesMm.flat(),o=y=>{let b=0,m=1/0;for(let x=0;x+2<i.length;x+=3){let M=Math.hypot(i[x]-y[0],i[x+1]-y[1],i[x+2]-y[2]);M<m&&([b,m]=[x/3,M])}return b},c=y=>[...y].sort().join("|"),l=e.filter(y=>y.kind==="waypoint"&&y.between&&c(y.between)===c([a.from,a.to])).sort((y,b)=>(y.order??0)-(b.order??0)),f=l[0]?.between??[a.from,a.to],d=f[0]===a.from?1:-1,h=y=>d*o(y),g=h(s),p=l.filter(y=>h(r(y.positionMm))<g).length,u=l.length?p===0?(l[0].order??0)-1:p===l.length?(l[l.length-1].order??0)+1:((l[p-1].order??0)+(l[p].order??0))/2:0;return{id:du,kind:"waypoint",positionMm:n,pinned:!0,order:u,ends:[],between:[...f]}}function fu(e,t,a){let s=(e.nodes??[]).map(r=>({id:r.id,kind:r.kind,pinned:!!r.pinned,worldMm:ji(a,r.positionMm)})),n=t.find(r=>r.to===$t);return n&&s.push({id:$t,kind:"breakout",pinned:!1,auto:!0,worldMm:n.samplesMm.slice(-3)}),s}function ux(e,t,a){let s=t[0]-e[0],n=t[1]-e[1],r=s*s+n*n,i=r>0?Math.max(0,Math.min(1,((a[0]-e[0])*s+(a[1]-e[1])*n)/r)):0;return{t:i,distance:Math.hypot(e[0]+i*s-a[0],e[1]+i*n-a[1])}}function hu(e,t,a,s,n=5){let r=null;return e.forEach((i,o)=>{let c=i.samplesMm,l=Math.floor(c.length/3),f=l?a([c[0],c[1],c[2]]):null;for(let d=0;d+1<l;d+=1){let h=[c[d*3+3],c[d*3+4],c[d*3+5]],g=a(h);if(f&&g){let{t:p,distance:u}=ux(f,g,t),y=[0,1,2].map(m=>c[d*3+m]+p*(h[m]-c[d*3+m])),b=n+i.radiusMm*s(y);u<=b&&(!r||u<r.distancePx)&&(r={index:o,sample:d,t:p,pointMm:y,distancePx:u})}f=g}}),r}function bu(e,t,a,s,{right:n,up:r}){if(!(s>0))return[...e];let i=t/s,o=-a/s;return e.map((c,l)=>c+n[l]*i+r[l]*o)}function pu(e,t,a=3){return Math.hypot(t[0]-e[0],t[1]-e[1])>=a}function yu(e,t,a,s){let{right:n,up:r,back:i}=e.basis(),o=Math.tan(e.fov/2),c=Ee(e.focus,pe(i,e.distance)),l=He(Ee(Ee(pe(i,-1),pe(n,t*o*s)),pe(r,a*o)));return{origin:c,direction:l}}function fx(e){let t=new Array(16);t[0]=e[5]*e[10]*e[15]-e[5]*e[11]*e[14]-e[9]*e[6]*e[15]+e[9]*e[7]*e[14]+e[13]*e[6]*e[11]-e[13]*e[7]*e[10],t[4]=-e[4]*e[10]*e[15]+e[4]*e[11]*e[14]+e[8]*e[6]*e[15]-e[8]*e[7]*e[14]-e[12]*e[6]*e[11]+e[12]*e[7]*e[10],t[8]=e[4]*e[9]*e[15]-e[4]*e[11]*e[13]-e[8]*e[5]*e[15]+e[8]*e[7]*e[13]+e[12]*e[5]*e[11]-e[12]*e[7]*e[9],t[12]=-e[4]*e[9]*e[14]+e[4]*e[10]*e[13]+e[8]*e[5]*e[14]-e[8]*e[6]*e[13]-e[12]*e[5]*e[10]+e[12]*e[6]*e[9],t[1]=-e[1]*e[10]*e[15]+e[1]*e[11]*e[14]+e[9]*e[2]*e[15]-e[9]*e[3]*e[14]-e[13]*e[2]*e[11]+e[13]*e[3]*e[10],t[5]=e[0]*e[10]*e[15]-e[0]*e[11]*e[14]-e[8]*e[2]*e[15]+e[8]*e[3]*e[14]+e[12]*e[2]*e[11]-e[12]*e[3]*e[10],t[9]=-e[0]*e[9]*e[15]+e[0]*e[11]*e[13]+e[8]*e[1]*e[15]-e[8]*e[3]*e[13]-e[12]*e[1]*e[11]+e[12]*e[3]*e[9],t[13]=e[0]*e[9]*e[14]-e[0]*e[10]*e[13]-e[8]*e[1]*e[14]+e[8]*e[2]*e[13]+e[12]*e[1]*e[10]-e[12]*e[2]*e[9],t[2]=e[1]*e[6]*e[15]-e[1]*e[7]*e[14]-e[5]*e[2]*e[15]+e[5]*e[3]*e[14]+e[13]*e[2]*e[7]-e[13]*e[3]*e[6],t[6]=-e[0]*e[6]*e[15]+e[0]*e[7]*e[14]+e[4]*e[2]*e[15]-e[4]*e[3]*e[14]-e[12]*e[2]*e[7]+e[12]*e[3]*e[6],t[10]=e[0]*e[5]*e[15]-e[0]*e[7]*e[13]-e[4]*e[1]*e[15]+e[4]*e[3]*e[13]+e[12]*e[1]*e[7]-e[12]*e[3]*e[5],t[14]=-e[0]*e[5]*e[14]+e[0]*e[6]*e[13]+e[4]*e[1]*e[14]-e[4]*e[2]*e[13]-e[12]*e[1]*e[6]+e[12]*e[2]*e[5],t[3]=-e[1]*e[6]*e[11]+e[1]*e[7]*e[10]+e[5]*e[2]*e[11]-e[5]*e[3]*e[10]-e[9]*e[2]*e[7]+e[9]*e[3]*e[6],t[7]=e[0]*e[6]*e[11]-e[0]*e[7]*e[10]-e[4]*e[2]*e[11]+e[4]*e[3]*e[10]+e[8]*e[2]*e[7]-e[8]*e[3]*e[6],t[11]=-e[0]*e[5]*e[11]+e[0]*e[7]*e[9]+e[4]*e[1]*e[11]-e[4]*e[3]*e[9]-e[8]*e[1]*e[7]+e[8]*e[3]*e[5],t[15]=e[0]*e[5]*e[10]-e[0]*e[6]*e[9]-e[4]*e[1]*e[10]+e[4]*e[2]*e[9]+e[8]*e[1]*e[6]-e[8]*e[2]*e[5];let a=e[0]*t[0]+e[1]*t[4]+e[2]*t[8]+e[3]*t[12];return Math.abs(a)<1e-30?null:t.map(s=>s/a)}function gu(e,t){return[0,1,2].map(a=>e[a]*t[0]+e[4+a]*t[1]+e[8+a]*t[2]+e[12+a])}function mu(e,t){return[0,1,2].map(a=>e[a]*t[0]+e[4+a]*t[1]+e[8+a]*t[2])}function hx(e,t,a){let s=-1/0,n=1/0;for(let r=0;r<3;r+=1){if(Math.abs(t[r])<1e-15){if(e[r]<a[r]||e[r]>a[r+3])return!1;continue}let i=(a[r]-e[r])/t[r],o=(a[r+3]-e[r])/t[r];s=Math.max(s,Math.min(i,o)),n=Math.min(n,Math.max(i,o))}return n>=Math.max(s,0)}function bx(e,t,a){let s=null;for(let n of e){if(n.bounds&&!hx(t,a,n.bounds))continue;let r=n.position,i=n.indices,o=i?i.length:r.length/3;for(let c=0;c+2<o;c+=3){let l=(i?i[c]:c)*3,f=(i?i[c+1]:c+1)*3,d=(i?i[c+2]:c+2)*3,h=[r[f]-r[l],r[f+1]-r[l+1],r[f+2]-r[l+2]],g=[r[d]-r[l],r[d+1]-r[l+1],r[d+2]-r[l+2]],p=qe(a,g),u=Ze(h,p);if(Math.abs(u)<1e-18)continue;let y=[t[0]-r[l],t[1]-r[l+1],t[2]-r[l+2]],b=Ze(y,p)/u;if(b<0||b>1)continue;let m=qe(y,h),x=Ze(a,m)/u;if(x<0||b+x>1)continue;let M=Ze(g,m)/u;M>1e-12&&(!s||M<s.t)&&(s={t:M,normal:qe(h,g)})}}return s}function xu(e,t){let a=null;for(let s of e){let n=fx(s.matrix);if(!n)continue;let r=gu(n,t.origin),i=mu(n,t.direction),o=bx(s.primitives,r,i);if(!o)continue;let c=gu(s.matrix,Ee(r,pe(i,o.t))),l=Math.hypot(...c.map((h,g)=>h-t.origin[g]));if(a&&l>=a.distance)continue;let f=[n[0],n[4],n[8],0,n[1],n[5],n[9],0,n[2],n[6],n[10],0,0,0,0,1],d=He(mu(f,o.normal));Ze(d,t.direction)>0&&(d=pe(d,-1)),a={key:s.key,point:c,normal:d,distance:l}}return a?{key:a.key,point:a.point,normal:a.normal}:null}var Ie={bootMm:10,housingDepthMm:8,breakoutLiftMm:10,chordErrorMm:.2,catmullRomAlpha:.5,minBendRadiusFactor:6,bendRelaxIterations:8,packingFactor:1.2,ringSegments:12,breakoutBlendMm:5,lengthAllowance:.1,lengthMismatchTolerance:.15,boardCollisionMarginMm:1,defaultGaugeAwg:"24"},Di={24:1.143,22:1.3208,20:1.524,18:1.8034,16:2.0066,14:2.3622,12:2.8956,10:3.5306,8:5.0546,6:6.35,4:7.9248,2:9.8552,1:10.9474,0:12.1666,"00":13.8684};function vu(e){let t=e==null?null:String(e).trim().toUpperCase().replace(/AWG$/,"").trim();return t!==null&&t in Di?{odMm:Di[t],assumed:!1}:{odMm:Di[Ie.defaultGaugeAwg],assumed:!0}}var On=(Math.sqrt(5)-1)/2,px=60;function gx(e,t,a){let s=0;for(let n=0;n<3;n+=1){let r=e[n]<t[n]?t[n]-e[n]:e[n]>a[n]?e[n]-a[n]:0;s+=r*r}return s}function mx(e,t,a,s){let n=g=>gx([0,1,2].map(p=>e[p]+g*(t[p]-e[p])),a,s),r=0,i=1,o=i-On*(i-r),c=r+On*(i-r),l=n(o),f=n(c);for(let g=0;g<px;g+=1)l<=f?([i,c,f]=[c,o,l],o=i-On*(i-r),l=n(o)):([r,o,l]=[o,c,f],c=r+On*(i-r),f=n(c));let[d,h]=l<=f?[o,l]:[c,f];for(let g of[0,1]){let p=n(g);p<h&&([d,h]=[g,p])}return[Math.sqrt(h),d]}function yx(e,t){let a=[t[0]-e[12],t[1]-e[13],t[2]-e[14]];return[0,1,2].map(s=>e[s*4]*a[0]+e[s*4+1]*a[1]+e[s*4+2]*a[2])}function xx(e,t){let[a,s]=[e[t],e[t+1]],n=0;for(let r=0;r<3;r+=1)n+=(s[r]-a[r])*(s[r]-a[r]);return Math.sqrt(n)}function wu(e,t){let a=e.length-1,s=0;for(let n=0;n<a;n+=1){let r=t?n:a-1-n;if(s>=Ie.bootMm)return n;s+=xx(e,r)}return a}function Mu(e,t){let a=Ie.boardCollisionMarginMm,s=t.map(r=>({board:r,lo:[0,1,2].map(i=>r.minMm[i]-a),hi:[0,1,2].map(i=>r.maxMm[i]+a)})),n=[];for(let r of e.curves){let i=r.diameterMm/2,o=r.samplesMm;if(i<=0||o.length<2)continue;let c=o.length-1,l=new Map,f=(g,p,u)=>{let y=l.get(g)??new Set;for(let b=p;b<u;b+=1)y.add(b);l.set(g,y)},d=e.ends[r.from];d&&f(d.occurrence,0,wu(o,!0));let h=e.ends[r.to];h&&f(h.occurrence,c-wu(o,!1),c);for(let{board:g,lo:p,hi:u}of s){let y=o.map(M=>yx(g.matrix,M)),b=l.get(g.id),m=[],x=null;for(let M=0;M<c;M+=1){if(b?.has(M))continue;let[E,T]=mx(y[M],y[M+1],p,u);E<i&&(m.push(M),(!x||E<x[0])&&(x=[E,M,T]))}if(x){let[M,E,T]=x,[I,A]=[o[E],o[E+1]];n.push({segmentId:r.segmentId,board:g.id,distanceMm:M,radiusMm:i,atMm:[0,1,2].map(R=>I[R]+T*(A[R]-I[R])),spans:m})}}}return n}var vx=/_vertical(_|$)/i,wx=/_(horizontal|rightangle|right_angle|angled)(_|$)|_RA(_|$)/i,Eu=e=>e*Math.PI/180;function ku(e){let t=e.replace(/[0-9]+$/,""),a=e.slice(t.length);return[t,a?Number.parseInt(a,10):-1,e]}function Mx(e,t){let[a,s,n]=ku(e),[r,i,o]=ku(t);return a!==r?a<r?-1:1:s!==i?s-i:n<o?-1:n>o?1:0}function Gi(e,t){let a=Eu(e.rotationDeg),s=t[0]-e.positionMm[0],n=t[1]-e.positionMm[1];return[s*Math.cos(a)+n*Math.sin(a),-s*Math.sin(a)+n*Math.cos(a)]}function Tu(e,t){let a=Eu(e.rotationDeg);return[t[0]*Math.cos(a)-t[1]*Math.sin(a),t[0]*Math.sin(a)+t[1]*Math.cos(a),0]}function kx(e){return new Set(e.pads.map(t=>`${t.positionMm[0]},${t.positionMm[1]}`)).size}function Su(e){let t=e.pads.filter(a=>a.pad);return t.length?t:e.pads}function Iu(e){let t=Su(e),a=t.length;return[t.reduce((s,n)=>s+n.positionMm[0],0)/a,t.reduce((s,n)=>s+n.positionMm[1],0)/a]}function Ex(e,t){let a=Math.atan2(t,e)*180/Math.PI,s=Tx(a/90)*90;return Math.abs(a-s)>20?null:{0:"+x",90:"+y",180:"-x","-180":"-x","-90":"-y"}[String(s===0?0:s)]}function Tx(e){let t=Math.floor(e),a=e-t;return a>.5?t+1:a<.5||t%2===0?t:t+1}function Sx(e){let t=(u,y,...b)=>({axis:y==="low"?null:u,confidence:y,reasons:b});if(!e||kx(e)<2)return t(null,"low","too_few_pads");let a=e.side==="top"?"top":"bottom",s=e.footprintName??"",n=vx.test(s),r=wx.test(s),i=e.courtyard;if(!i)return n?t(a,"medium","name_vertical","no_courtyard"):t(null,"low","no_courtyard");let o=e.pads.map(u=>Gi(e,u.positionMm)),c=o.map(([u])=>u),l=o.map(([,u])=>u),f=[c.reduce((u,y)=>u+y,0)/c.length,l.reduce((u,y)=>u+y,0)/l.length],d=[(i.minMm[0]+i.maxMm[0])/2,(i.minMm[1]+i.maxMm[1])/2],h=Math.min(...c)-1<=d[0]&&d[0]<=Math.max(...c)+1&&Math.min(...l)-1<=d[1]&&d[1]<=Math.max(...l)+1,g=[d[0]-f[0],d[1]-f[1]],p=!h&&Math.hypot(...g)>=.5?Ex(...g):null;return n?h?t(a,"high","name_vertical","body_over_pads"):t(null,"low","name_vertical","name_conflicts_geometry"):r?p?t(p,"high","name_right_angle","body_off_pads"):t(null,"low","name_right_angle","name_conflicts_geometry"):h?t(a,"medium","body_over_pads"):p?t(p,"medium","body_off_pads"):t(null,"low","body_ambiguous")}function Pn(e){let t=Math.sqrt(e.reduce((a,s)=>a+s*s,0));return e.map(a=>a/t)}var Ix=(e,t)=>[e[1]*t[2]-e[2]*t[1],e[2]*t[0]-e[0]*t[2],e[0]*t[1]-e[1]*t[0]],Ui=(e,t)=>e.reduce((a,s,n)=>a+s*t[n],0);function Ax(e){let t=e.pads.filter(s=>s.pad),a=t.find(s=>s.pad==="1");return a||(t.length?[...t].sort((s,n)=>Mx(s.pad,n.pad))[0]:e.pads[0])}function Rx(e){let[t,a]=Iu(e),s=Su(e),n=s.length,r=0,i=0,o=0;for(let g of s)r+=(g.positionMm[0]-t)**2,i+=(g.positionMm[1]-a)**2,o+=(g.positionMm[0]-t)*(g.positionMm[1]-a);r/=n,i/=n,o/=n;let c=(r+i)/2,l=r*i-o*o,f=Math.sqrt(Math.max(c*c-l,0)),d=c+f,h=c-f;return d<=1e-12||d-h<=.05*d?Tu(e,[1,0]):Math.abs(o)>1e-12?Pn([d-i,o,0]):r>=i?[1,0,0]:[0,1,0]}function _x(e,t){if(t==="top")return[0,0,1];if(t==="bottom")return[0,0,-1];let a=t[0]==="-"?-1:1;return Pn(Tu(e,t[1]==="x"?[a,0]:[0,a]))}function zi(e,t,a){let[s,n,r]=e,[i,o,c]=t,[l,f,d]=a,h=s+o+d,g;if(h>0){let u=Math.sqrt(h+1)*2;g=[(c-f)/u,(l-r)/u,(n-i)/u,.25*u]}else if(s>o&&s>d){let u=Math.sqrt(1+s-o-d)*2;g=[.25*u,(i+n)/u,(l+r)/u,(c-f)/u]}else if(o>d){let u=Math.sqrt(1+o-s-d)*2;g=[(i+n)/u,.25*u,(f+c)/u,(l-r)/u]}else{let u=Math.sqrt(1+d-s-o)*2;g=[(l+r)/u,(f+c)/u,.25*u,(n-i)/u]}return g=Pn(g),([g[3],g[0],g[1],g[2]].find(u=>Math.abs(u)>1e-12)??1)<0?g.map(u=>-u):g}function cs(e,t,a){if(!e||e.pads.length===0)return null;let s=a?a.axis:Sx(e).axis;if(!s)return null;let n=a?((a.quarterTurns??0)%4+4)%4:0,[r,i]=Iu(e),o=(t??0)/2,c=[r,i,e.side==="top"?o:-o],l=_x(e,s),f=Rx(e),d=Ui(f,l),h=[f[0]-d*l[0],f[1]-d*l[1],f[2]-d*l[2]];Math.sqrt(Ui(h,h))<1e-9&&(h=[-l[1],l[0],0]),h=Pn(h);let g=Ax(e).positionMm;Ui([g[0]-r,g[1]-i,0],h)>1e-9&&(h=h.map(u=>-u));let p=Ix(l,h);for(let u=0;u<n;u+=1)[h,p]=[p,h.map(y=>-y)];return{axis:s,quarterTurns:n,originMm:c,xAxis:h,yAxis:p,zAxis:l,rotation:zi(h,p,l)}}function xe(e){return Math.round(e*1e9)/1e9+0}function jn(e){let t=Math.hypot(...e)||1,a=e.map(n=>n/t),s=[a[3],a[0],a[1],a[2]].find(n=>Math.abs(n)>1e-12)??1;return a.map(n=>xe(s<0?-n:n))}function ls(e,t){let[a,s,n,r]=e,i=s*t[2]-n*t[1],o=n*t[0]-a*t[2],c=a*t[1]-s*t[0];return[t[0]+2*(r*i+s*c-n*o),t[1]+2*(r*o+n*i-a*c),t[2]+2*(r*c+a*o-s*i)]}function Nx(e,t){let[a,s,n,r]=e,[i,o,c,l]=t;return[r*i+a*l+s*c-n*o,r*o-a*c+s*l+n*i,r*c+a*o-s*i+n*l,r*l-a*i-s*o-n*c]}function dt(e,t){let a=ls(e.rotation,t.translationMm);return{translationMm:e.translationMm.map((s,n)=>xe(s+a[n])),rotation:jn(Nx(e.rotation,t.rotation))}}function Ki(e){let[t,a,s,n]=e.rotation,[r,i,o]=e.translationMm;return[1-2*(a*a+s*s),2*(t*a+s*n),2*(t*s-a*n),0,2*(t*a-s*n),1-2*(t*t+s*s),2*(a*s+t*n),0,2*(t*s+a*n),2*(a*s-t*n),1-2*(t*t+a*a),0,r,i,o,1].map(xe)}var Au=5;var Ln=Math.SQRT1_2,xT=[[0,0,0,1],[0,0,Ln,Ln],[0,0,1,0],[0,0,Ln,-Ln]];function Bx(e,t){let a=[0,1,2].map(s=>t[s]-e.originMm[s]);return[e.xAxis,e.yAxis,e.zAxis].map(s=>a[0]*s[0]+a[1]*s[1]+a[2]*s[2])}function Dn(e,t,a){let s,n;if(a)s=[...a.minMm],n=[...a.maxMm];else if(e.courtyard)s=[...e.courtyard.minMm,0],n=[...e.courtyard.maxMm,Au];else{let d=e.pads.map(h=>Gi(e,h.positionMm));s=[Math.min(...d.map(h=>h[0])),Math.min(...d.map(h=>h[1])),0],n=[Math.max(...d.map(h=>h[0])),Math.max(...d.map(h=>h[1])),Au]}let r=e.rotationDeg*Math.PI/180,[i,o]=e.positionMm,c=(t??0)/2,l=e.side==="top",f=[];for(let d=0;d<8;d+=1){let[h,g,p]=[0,1,2].map(u=>(d>>u&1?n:s)[u]);f.push([i+h*Math.cos(r)-g*Math.sin(r),o+h*Math.sin(r)+g*Math.cos(r),l?c+p:-c-p])}return f}function Un(e,t){let a=t.map(s=>Bx(e,s));return[[0,1,2].map(s=>Math.min(...a.map(n=>n[s]))),[0,1,2].map(s=>Math.max(...a.map(n=>n[s])))]}var Gn=Math.SQRT1_2,Cx=[[0,0,0,1],[0,0,Gn,Gn],[0,0,1,0],[0,0,Gn,-Gn]],Fx=[1,0,0,0],zn=[0,0,0,1],Ox=(e,t)=>{let a=t*Math.PI/360;return[e[0]*Math.sin(a),e[1]*Math.sin(a),e[2]*Math.sin(a),Math.cos(a)]};function Vi(e){if(!e)return{pose:{translationMm:[0,0,0],rotation:zn},scale:1};let[t,a,s]=(e.rotationDeg??[0,0,0]).map(Number),n=zn;for(let[i,o]of[[[0,0,1],s],[[0,1,0],a],[[1,0,0],t]])n=dt({translationMm:[0,0,0],rotation:n},{translationMm:[0,0,0],rotation:Ox(i,o)}).rotation;return{pose:{translationMm:(e.offsetMm??[0,0,0]).map(Number),rotation:jn(n)},scale:Number(e.scale??1)||1}}function Px(e){let t=e?.boundsMm;if(!t)return{exit:[0,0,-Ie.housingDepthMm],depth:Ie.housingDepthMm,modeled:!1};let{pose:a,scale:s}=Vi(e.alignment),n=[];for(let c=0;c<8;c+=1){let l=[0,1,2].map(d=>(c>>d&1?t.maxMm:t.minMm)[d]*s),f=ls(a.rotation,l);n.push([0,1,2].map(d=>f[d]+a.translationMm[d]))}let r=[0,1,2].map(c=>Math.min(...n.map(l=>l[c]))),i=[0,1,2].map(c=>Math.max(...n.map(l=>l[c]))),o=Math.min(r[2],0);return{exit:[(r[0]+i[0])/2,(r[1]+i[1])/2,o],depth:-o+0,modeled:!0}}function jx(e,t=0,a){let s=Cx[(t%4+4)%4],n=dt({translationMm:[0,0,0],rotation:Fx},{translationMm:[0,0,0],rotation:s}),r=dt(e,n),{exit:i,depth:o,modeled:c}=Px(a),l=dt(r,{translationMm:i,rotation:zn}).translationMm,f=ls(r.rotation,[0,0,-1]),d=[0,1,2].map(h=>l[h]+Ie.bootMm*f[h]);return{pose:r,exitMm:l.map(xe),outward:f.map(xe),legMm:d.map(xe),depthMm:xe(o),modeled:c}}function Ru(e,t,a,s,n=0,r,i){let o=cs(t,a,s);if(!o||!t)return null;let c=Math.max(Un(o,Dn(t,a,i))[1][2],0),l=dt(e,{translationMm:o.originMm,rotation:o.rotation});return l=dt(l,{translationMm:[0,0,c],rotation:zn}),{...jx(l,n,r),matingPlaneMm:xe(c)}}function Hi(e,t){let a=new Array(16).fill(0);for(let s=0;s<4;s+=1)for(let n=0;n<4;n+=1){let r=0;for(let i=0;i<4;i+=1)r+=e[i*4+n]*t[s*4+i];a[s*4+n]=r}return a}var Lx=(e,t)=>[t[0]-e[0],0,0,0,0,t[1]-e[1],0,0,0,0,t[2]-e[2],0,e[0],e[1],e[2],1];function Dx(e,t){let a=e.connector,s=a?cs(a.geometry,a.thicknessMm,a.stored):null;if(!a||!s)return null;let[n,r]=Un(s,Dn(a.geometry,a.thicknessMm));return[[n[0],-r[1],-t],[r[0],-n[1],0]]}function _u(e,t){let a=`${e.level||""}/${e.id}`,s=[];for(let n of[...e.ends].sort((r,i)=>r.ordinal-i.ordinal)){let r=t.ends[n.id];if(!r)continue;let i=Ki(r.pose),o={key:`${a}/${n.id}`,harness:a,end:n.id};if(n.housing?.boundsMm){let{pose:l,scale:f}=Vi(n.housing.alignment),d=Hi(Ki(l),[f,0,0,0,0,f,0,0,0,0,f,0,0,0,0,1]);s.push({...o,matrix:Hi(i,d),model:n.housing});continue}let c=Dx(n,r.depthMm);c&&s.push({...o,matrix:Hi(i,Lx(...c)),model:null})}return s}var Ux=12,Gx=2,zx=1e-9,Ia=(e,t)=>[e[0]-t[0],e[1]-t[1],e[2]-t[2]],wt=(e,t)=>Math.sqrt((e[0]-t[0])**2+(e[1]-t[1])**2+(e[2]-t[2])**2);function Sa(e,t,a,s,n){if(s===a)return[e[0],e[1],e[2]];let r=(s-n)/(s-a),i=(n-a)/(s-a);return[r*e[0]+i*t[0],r*e[1]+i*t[1],r*e[2]+i*t[2]]}function Kx(e,t,a,s){let n=Ie.catmullRomAlpha,r=0,i=r+wt(e,t)**n,o=i+wt(t,a)**n,c=o+wt(a,s)**n;return l=>{let f=i+l*(o-i),d=Sa(e,t,r,i,f),h=Sa(t,a,i,o,f),g=Sa(a,s,o,c,f),p=Sa(d,h,r,o,f),u=Sa(h,g,i,c,f);return Sa(p,u,i,o,f)}}function Vx(e,t,a){let s=Ia(a,t),n=Ia(e,t),r=Math.sqrt(s[0]*s[0]+s[1]*s[1]+s[2]*s[2]);if(r<1e-12)return wt(e,t);let i=[s[1]*n[2]-s[2]*n[1],s[2]*n[0]-s[0]*n[2],s[0]*n[1]-s[1]*n[0]];return Math.sqrt(i[0]*i[0]+i[1]*i[1]+i[2]*i[2])/r}function Nu(e){let t=o=>[o[0],o[1],o[2]];if(e.length<2)return{samples:e.map(t),spans:e.map(()=>0)};let a=e[0],s=e[e.length-1],n=[Ia([2*a[0],2*a[1],2*a[2]],e[1]),...e,Ia([2*s[0],2*s[1],2*s[2]],e[e.length-2])],r=[t(a)],i=[0];for(let o=0;o<e.length-1;o+=1){let c=Kx(n[o],n[o+1],n[o+2],n[o+3]),l=(f,d,h,g,p)=>{let u=(f+d)/2,y=c(u);p<Gx||p<Ux&&Vx(y,h,g)>Ie.chordErrorMm?(l(f,u,h,y,p+1),l(u,d,y,g,p+1)):(r.push(g),i.push(o))};l(0,1,t(e[o]),t(e[o+1]),0)}return{samples:r,spans:i}}function Hx(e,t,a){let s=wt(e,t),n=wt(t,a),r=wt(a,e),i=Ia(t,e),o=Ia(a,e),c=[i[1]*o[2]-i[2]*o[1],i[2]*o[0]-i[0]*o[2],i[0]*o[1]-i[1]*o[0]],l=Math.sqrt(c[0]*c[0]+c[1]*c[1]+c[2]*c[2]);return l<1e-12?Number.POSITIVE_INFINITY:s*n*r/(2*l)}function Bu(e){let t=Number.POSITIVE_INFINITY,a=-1;for(let s=1;s<e.length-1;s+=1){let n=Hx(e[s-1],e[s],e[s+1]);n<t&&(t=n,a=s)}return{radius:t,at:a}}function qx(e,t,a){let s=[],n=[];e.forEach((h,g)=>{if(s.length&&wt(s[s.length-1],h)<zx){n[n.length-1]=n[n.length-1]&&t[g];return}s.push([h[0],h[1],h[2]]),n.push(!!t[g])});let r=Ie.minBendRadiusFactor*a,{samples:i,spans:o}=Nu(s),{radius:c,at:l}=Bu(i);for(let h=0;h<Ie.bendRelaxIterations&&!(c>=r||l<0);h+=1){let g=o[l],p=[];for(let m=1;m<s.length-1;m+=1)n[m]&&p.push(m);if(!p.length)break;let u=m=>Math.min(Math.abs(m-g),Math.abs(m-(g+1))),y=p[0];for(let m of p)u(m)<u(y)&&(y=m);let b=[0,1,2].map(m=>(s[y-1][m]+s[y+1][m])/2);s[y]=[0,1,2].map(m=>(s[y][m]+b[m])/2),{samples:i,spans:o}=Nu(s),{radius:c,at:l}=Bu(i)}let f=0;for(let h=0;h+1<i.length;h+=1)f+=wt(i[h],i[h+1]);let d=h=>h.map(xe);return{controlMm:s.map(d),samplesMm:i.map(d),lengthMm:xe(f),minRadiusMm:Number.isFinite(c)?xe(c):null,minRadiusAllowedMm:xe(r),tightBend:l>=0&&c<r?{atMm:d(i[l]),radiusMm:xe(c)}:null}}function Xx(e){let t=Ie.bootMm/2,{exitMm:a,outward:s,legMm:n}=e;return[[a[0],a[1],a[2]],[a[0]+t*s[0],a[1]+t*s[1],a[2]+t*s[2]],[n[0],n[1],n[2]],[n[0]+t*s[0],n[1]+t*s[1],n[2]+t*s[2]]]}function Cu(e,t,a={},s={}){let n=new Map(t.nodes.map(r=>[r.id,r.positionMm]));return t.segments.map(r=>{let i=g=>g in e?Xx(e[g]):[[...n.get(g)]],o=i(r.from),c=i(r.to),l=(a[r.id]??[]).map(g=>[g[0],g[1],g[2]]),f=[...o,...l,...c.reverse()],d=s[r.id]??[],h=[...o.map(()=>!1),...l.map((g,p)=>!d[p]),...c.map(()=>!1)];return{segmentId:r.id,...qx(f,h,r.diameterMm)}})}var Fu=e=>[e[0],e[1],e[2]];function Ou(e,t){return e.filter(a=>a.kind===t).sort((a,s)=>a.order-s.order||(a.id<s.id?-1:a.id>s.id?1:0))}function Pu(e){return Ou(e,"breakout").map(t=>({id:t.id,positionMm:Fu(t.positionMm),ends:[...t.ends??[]]}))}function ju(e,t){let a=(i,o)=>i<o?`${i}
${o}`:`${o}
${i}`,s=new Map;for(let i of Ou(t,"waypoint")){let[o,c]=i.between??[],l=a(o,c),f=s.get(l);f?f.push(i):s.set(l,[i])}let n={waypoints:{},pinned:{},unused:[]},r=new Set;for(let i of e.segments){let o=a(i.from,i.to),c=s.get(o);c&&(r.add(o),c[0].between?.[0]!==i.from&&(c=[...c].reverse()),n.waypoints[i.id]=c.map(l=>Fu(l.positionMm)),n.pinned[i.id]=c.map(l=>!!l.pinned))}for(let[i,o]of s)r.has(i)||n.unused.push(...o.map(c=>c.id));return n.unused.sort(),n}var Lu=(e,t)=>Math.hypot(e[0]-t[0],e[1]-t[1],e[2]-t[2]);function Wx(e){if(!e.length)return{diameterMm:0,assumedGauge:!1};let t=0,a=!1;for(let s of e){let{odMm:n,assumed:r}=vu(s.gaugeAwg);t+=n*n,a=a||r}return{diameterMm:xe(Ie.packingFactor*Math.sqrt(t)),assumedGauge:a}}function $x(e,t){let a=e.map(o=>Math.max(t.get(o.id)??0,0));a.every(o=>o===0)&&(a=e.map(()=>1));let s=a.reduce((o,c)=>o+c,0),n=[0,1,2].map(o=>e.reduce((c,l,f)=>c+a[f]*l.legMm[o],0)/s),r=[0,1,2].map(o=>e.reduce((c,l)=>c+l.outward[o],0)/e.length),i=Math.hypot(...r);return i<1e-9?n:[0,1,2].map(o=>n[o]+Ie.breakoutLiftMm*r[o]/i)}function Du(e,t,a=[]){let s=new Map(e.map(g=>[g.id,g])),n=[],r=[];for(let g of t)s.has(g.from.end)&&s.has(g.to.end)?n.push(g):r.push(g.id);let i=new Map;for(let g of n)for(let p of[g.from.end,g.to.end])i.set(p,(i.get(p)??0)+1);let o=g=>g.map(xe),c=e.map(g=>({id:g.id,kind:"end",positionMm:o(g.legMm)})),l=[];if(a.length){for(let p of a)c.push({id:p.id,kind:"breakout",positionMm:o(p.positionMm)});let g=new Map;for(let p of a)for(let u of p.ends??[])s.has(u)&&!g.has(u)&&g.set(u,p.id);for(let p of e){let u=g.get(p.id);if(u===void 0){let y=a[0];for(let b of a)Lu(b.positionMm,p.legMm)<Lu(y.positionMm,p.legMm)&&(y=b);u=y.id}l.push([p.id,u])}for(let p=0;p+1<a.length;p+=1)l.push([a[p].id,a[p+1].id])}else if(e.length===2)l.push([e[0].id,e[1].id]);else if(e.length>2){c.push({id:"auto",kind:"breakout",positionMm:o($x(e,i))});for(let g of e)l.push([g.id,"auto"])}let f=new Map(c.map(g=>[g.id,[]]));for(let[g,p]of l)f.get(g).push(p),f.get(p).push(g);let d=(g,p)=>{let u=new Set([g]),y=[g];for(;y.length;){let b=y.pop();for(let m of f.get(b))b===p[0]&&m===p[1]||b===p[1]&&m===p[0]||u.has(m)||(u.add(m),y.push(m))}return u},h=l.map(([g,p])=>{let u=d(g,[g,p]),y=n.filter(b=>u.has(b.from.end)!==u.has(b.to.end));return{id:`${g}~${p}`,from:g,to:p,wires:y.map(b=>b.id),...Wx(y)}});return{nodes:c,segments:h,unplaced:r}}var Yx=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];function qi(e){return{translationMm:[e[12],e[13],e[14]],rotation:zi([e[0],e[1],e[2]],[e[4],e[5],e[6]],[e[8],e[9],e[10]])}}function Jx(e,t){return[0,1,2].map(a=>e[a]*t[0]+e[4+a]*t[1]+e[8+a]*t[2]+e[12+a])}function Uu(e,t){let a={};for(let d of[...e.ends].sort((h,g)=>h.ordinal-g.ordinal)){let h=d.occurrence?t(d.occurrence):null;if(!h||!d.connector||!d.occurrence)continue;let g=d.connector.inOccurrence?dt(qi(h),d.connector.inOccurrence):qi(h),p=Ru(g,d.connector.geometry,d.connector.thicknessMm,d.connector.stored,0,d.housing);p&&(a[d.id]={...p,occurrence:d.occurrence})}if(Object.keys(a).length<2)return null;let s=Object.entries(a).map(([d,h])=>({id:d,legMm:h.legMm,outward:h.outward})),n=e.wires.map(d=>({id:d.id,from:{end:d.from},to:{end:d.to},gaugeAwg:d.gaugeAwg??null})),r=e.level?t(e.level):Yx,i=r?(e.nodes??[]).map(d=>({...d,positionMm:Jx(r,d.positionMm)})):[],o=Du(s,n,Pu(i)),c=ju(o,i),l=new Map(o.segments.map(d=>[d.id,d])),f=Cu(a,o,c.waypoints,c.pinned).map(d=>{let h=l.get(d.segmentId);return{...d,from:h.from,to:h.to,wires:[...h.wires],diameterMm:h.diameterMm,assumedGauge:h.assumedGauge}});return{ends:a,tree:o,curves:f,unused:c.unused,unplaced:o.unplaced,wires:e.wires.map(d=>({id:d.id,from:d.from,to:d.to}))}}function Gu(e,t,a=[]){let s=[],n=[];for(let r of e){let i=Uu(r,t);if(!i)continue;n.push(..._u(r,i));let o=new Map;for(let c of a.length?Mu(i,a):[])o.set(c.segmentId,[...o.get(c.segmentId)??[],c.board]);for(let c of i.curves)c.diameterMm<=0||s.push({harness:`${r.level||""}/${r.id}`,segmentId:c.segmentId,from:c.from,to:c.to,samplesMm:c.samplesMm.flat(),radiusMm:c.diameterMm/2,wires:c.wires,tightBend:c.tightBend!==null,assumedGauge:c.assumedGauge,collides:o.get(c.segmentId)??[]})}return{tubes:s,housings:n}}var Kn=Object.freeze({restricted:{color:[.55,.57,.6,1],label:"Restricted"},loading:{color:[.7,.76,.82,1],label:"Loading\u2026"},building:{color:[.62,.72,.84,1],label:"Building 3D view\u2026"},missing:{color:[.78,.76,.7,1],label:"No 3D view"},failed:{color:[.86,.6,.56,1],label:"3D view failed"},unknown:{color:[.78,.76,.7,1],label:""}}),zu=Object.freeze([.001,0,0,0,0,.001,0,0,0,0,.001,0,0,0,0,1]);function ds(e,t){let a=new Array(16);for(let s=0;s<4;s+=1)for(let n=0;n<4;n+=1)a[s*4+n]=e[n]*t[s*4]+e[4+n]*t[s*4+1]+e[8+n]*t[s*4+2]+e[12+n]*t[s*4+3];return a}function Qx([e,t,a]){return[1,0,0,0,0,1,0,0,0,0,1,0,e,t,a,1]}function Zx([e,t,a]){return[e,0,0,0,0,t,0,0,0,0,a,0,0,0,0,1]}function Vn(e,t){return ds(zu,ds(e,t))}function us(e,t){let a=t.minMm,s=t.maxMm.map((n,r)=>Math.max(n-a[r],.2));return ds(zu,ds(e,ds(Qx(a),Zx(s))))}function Ku(e,t,a){return e.restricted?"restricted":!e.assetId||!t?"missing":a==="loaded"?null:a==="failed"?"failed":t.status==="ready"?t.bundleUrl&&t.bundleToBoard?"loading":"building":Kn[t.status]?t.status:"unknown"}function Xi(e){return!!(e&&e.status==="ready"&&e.bundleUrl&&e.bundleToBoard)}function Vu(e,t){return!e||e.bundleUrl!==t.bundleUrl||e.loadState==="failed"?"create":e.loadState==="waiting"&&Xi(t)?"load":"keep"}function Hu(e){return(e?.occurrences||[]).filter(t=>t.kind==="board"||t.restricted||t.model||t.box)}function qu(e){return`box:${e.map(t=>Number(t).toFixed(3)).join(",")}`}function Xu(e){if(!e.length)return!1;let t=0;for(let a of e)if(!a.standIn)t+=1;else if(a.standIn==="loading")return!1;return t>0}function $u(e,t,a=0){return[e/1e3,-t/1e3,a]}function ev({rotation:e=0,mirror:t=!1,tilt:a=0}){let s=t?[-1,0,0]:[1,0,0],n=[0,1,0],r=t?[0,0,-1]:[0,0,1],i=Math.cos(e),o=Math.sin(e),c=s.map((p,u)=>i*p+o*n[u]),l=n.map((p,u)=>-o*s[u]+i*p),f=Math.cos(a),d=Math.sin(a),h=r.map((p,u)=>f*p-d*l[u]),g=l.map((p,u)=>d*r[u]+f*p);return{right:c,up:g,back:h}}function $i(e,t,a,s,n=0){let{up:r,back:i}=ev(e),o=$u(e.center[0],e.center[1],n),c=s*3,l=o.map((h,g)=>h+i[g]*c),f=1/(e.zoom*1e3),d=Vs(t*f,a*f,-s*40,s*40);return ea(d,Ks(l,o,r))}function tv(e,t,a,s){let[n,r,i]=s,o=e[0]*n+e[4]*r+e[8]*i+e[12],c=e[1]*n+e[5]*r+e[9]*i+e[13],l=e[3]*n+e[7]*r+e[11]*i+e[15];return l>0?[(o/l+1)/2*t,(1-c/l)/2*a]:null}function fs(e){let t=e[0]*1e3,a=e[3]*1e3,s=-e[4]*1e3,n=-e[1]*1e3;return{box:{x:t,y:s,w:a-t,h:n-s},bottom:e[2]+e[5]<0}}function Yi(e,t){return e?t?e[2]:e[5]:0}function Yu(e,t,a,s,n){let r=St(e),i=$i(t,a,s,r,t.focusZ??0);return tv(i,a,s,$u(n[0],n[1],t.focusZ??0))}var av=([e,t,a,s])=>({x:Math.min(e,a),y:Math.min(t,s),w:Math.abs(a-e),h:Math.abs(s-t)}),Wi=e=>[e.x+e.w/2,e.y+e.h/2],Wu=new WeakMap;function sv(e,t){let a=Wu.get(e);if(a)return a;let s=new Map,n=new Map;for(let c of e.features.values()){if(c.sourceUid&&s.set(String(c.sourceUid),c),c.kind!=="pad")continue;let l=/^(.*):pad:\d+:(.+)$/.exec(String(c.sourceUid||""));if(!l)continue;let f=`${l[1]}\0${l[2]}`;n.has(f)||n.set(f,[]),n.get(f).push(c)}let r=new Map;for(let c of t?.physical_objects||[])c.kind==="footprint_body"&&c.designator&&c.bbox_mm?.length===4&&r.set(c.designator,c);let i=new Map((t?.physical_objects||[]).map(c=>[c.uid,c])),o={bySource:s,padsByFootprintPin:n,bodies:r,objects:i};return Wu.set(e,o),o}function Ju({scene:e,topology:t},a,s){let n=String(a),r=e.componentFeatures.get(n);if(!r)return null;let i=sv(e,t),o=e.features.get(Number(r.featureId)),c=i.bodies.get(n),l=o?.bounds?fs(o.bounds).box:c?av(c.bbox_mm.map(Number)):null,f=o?.bounds?fs(o.bounds).bottom:String(c?.layer||"").startsWith("B."),d=null;if(s!=null&&s!==""){let g=(t?.terminals||[]).find(u=>u.designator===n&&String(u.pin)===String(s)),p=g?.pcb_pad_id?i.objects.get(g.pcb_pad_id):null;if(d=p?.source_ids?.[0]&&i.bySource.get(String(p.source_ids[0]))||null,!d){let u=i.padsByFootprintPin.get(`${r.footprint}\0${s}`)||[],y=l?Wi(l):null,b=1/0;for(let m of u){let x=Wi(fs(m.bounds).box),M=y?Math.hypot(x[0]-y[0],x[1]-y[1]):0;M<b&&([b,d]=[M,m])}}}let h=d?.bounds?fs(d.bounds).box:null;return!l&&h&&(l=h,f=fs(d.bounds).bottom),l?{reference:n,pin:d?String(s):null,focus:l,anchor:Wi(h||l),anchorBox:h,bottom:f,surfaceZ:Yi(e.runtimeBounds,f)}:null}var Hn=class{#e=new Map;constructor(t=3e3){this.ttlMs=t}get size(){return this.#e.size}record(t,a,s){this.#e.set(t,{matrix:a,at:s})}release(t){this.#e.delete(t)}clear(){this.#e.clear()}active(t){let a=[];for(let[s,n]of this.#e)t-n.at>this.ttlMs?this.#e.delete(s):a.push(n.matrix);return a}};var $n=1.5*1024*1024*1024;function Ji(e){let t=Number(e);return Number.isFinite(t)&&t>0?t:$n}function Qu(e,t){if(t.netName||t.netUid){let a=t.netUid&&e.find(s=>s.uid===t.netUid)||t.netName&&ta(e,t.netName);return a?{kind:"net",id:Number(a.id)}:{kind:"unresolved"}}return t.netId?{kind:"net",id:Number(t.netId)}:t.featureId?{kind:"feature",id:Number(t.featureId)}:t.reference?{kind:"component",reference:String(t.reference)}:{kind:"board"}}function Zu(e,t){if(t.kind==="net")e.selectNet(t.id,!0);else if(t.kind==="feature")e.selectFeature(t.id,!0);else if(t.kind==="component")e.selectComponent(t.reference,!0);else return!1;return!0}function ef(e,t){return t&&!e?"enter":!t&&e?"leave":null}function nv(e){return(Array.isArray(e)?e:[]).map((t,a)=>{let s=bc(t?.color??Vr[a%Vr.length]);return{key:String(t?.key??a),mark:s,color:`#${(s&16777215).toString(16).padStart(6,"0")}`,members:(Array.isArray(t?.members)?t.members:[]).filter(n=>n&&typeof n.occurrence=="string"&&typeof n.net=="string"),wires:(Array.isArray(t?.wires)?t.wires:[]).filter(n=>n&&typeof n.harness=="string"&&typeof n.wire=="string")}})}function Qi(){return{selection:null,gpuBudget:null}}var rv=Object.freeze(["setSelection","resize","getViewState","setLayerVisible","applyLayerPreset","setShowBoard","setShowComponents","setShowPlaceholders","setRealisticColors","setSeparation","showNetLayers","setNetIsolation","setStatsOverlay","getStats","setLodOverride","setGpuBudget","pickAt","projectComponent","projectPoint"]),qn=class{#e=null;constructor(t=Qi()){this.shared=t}get port(){return this.#e}attach(t){if(!t)throw new TypeError("A mode controller attaches to a mounted scene port");this.detach(),this.#e=t,this.replay(t)}detach(){let t=this.#e;this.#e=null,this.release(),t?.dispose?.()}replay(){}release(){}setSelection(t){this.shared.selection=t||null;let a=this.#e;a&&a.quietly(()=>this.applySelection(a,this.shared.selection))}setGpuBudget(t){this.shared.gpuBudget=t,this.#e?.setGpuBudget(Ji(t))}resize(){this.#e?.resize()}getViewState(){return this.#e?.getViewState()??null}setLayerVisible(t,a,s=null){this.#e?.setLayerVisible(t,a,s)}applyLayerPreset(t,a=null){this.#e?.applyLayerPreset(t,a)}setShowBoard(t){this.#e?.setShowBoard(t)}setShowComponents(t){this.#e?.setShowComponents(t)}setShowPlaceholders(t){this.#e?.setShowPlaceholders(t)}setRealisticColors(t){this.#e?.setRealisticColors(t)}setSeparation(t,a=null){this.#e?.setSeparation(t,a)}showNetLayers(){this.#e?.showNetLayers()}setNetIsolation(t){this.#e?.setNetIsolation(t)}setStatsOverlay(t){this.#e?.setStatsOverlay(t)}getStats(){return this.#e?.stats()??null}setLodOverride(t){this.#e?.setLodOverride(t)}pickAt(t,a){return Promise.resolve(this.#e?.pickAt(t,a)??null)}projectComponent(t,a){return this.#e?.projectComponent(t,a)??null}projectPoint(t,a){return this.#e?.projectPoint(t,a)??null}},iv=Object.freeze(["setHighlightedNets","setHiddenComponents","getComponentReferences","setViewMode","renderInset","insetReady","insetSurfaceZ","releaseInset","insetTarget","projectInset","onSceneChange","insetStats","insetSettings","gpuIdle","loadAnalyticPack","setAnalyticOverlay","analyticAt","analyticStats","unloadAnalyticPack"]),Xn=class extends qn{#e=[];#t=null;#a="pcb";#s=new Set;#n=null;#r=null;attach(t,{workspace:a="pcb"}={}){this.#a=a,super.attach(t)}replay(t){this.#n=t.onSceneChange?.(()=>this.#o())??null,this.#o(),t.setWorkspace(this.#a),this.#t&&t.setHiddenComponents(this.#t),this.shared.gpuBudget!=null&&t.setGpuBudget(Ji(this.shared.gpuBudget)),this.shared.selection&&t.quietly(()=>this.applySelection(t,this.shared.selection)),this.#e.length&&this.#i(t,this.#e),this.#r&&this.#c(t,this.#r)}async#c(t,a){await t.loadAnalyticPack(a.bytes,a.options),a.overlay&&t.setAnalyticOverlay(a.overlay)}release(){this.#n?.(),this.#n=null}applySelection(t,a){a?.occurrence!=null&&t.selectOccurrence(a.occurrence),a?Zu(t,Qu(t.nets(),a)):t.clearSelection()}setWorkspace(t){this.#a=t,this.port?.setWorkspace(t)}setHighlightedNets(t){this.#e=Array.isArray(t)?[...t]:[];let a=this.port;a&&this.#i(a,this.#e)}#i(t,a){let s=fc(t.nets(),a),n=t.anyEmphasis();t.setHighlightedNetIds(s);let r=t.anyEmphasis(),i=ef(n,r);i==="enter"?t.showNetProbe():i==="leave"&&t.restoreVisibility(),t.isolating()&&r&&t.isolateLitNets(),t.refreshResidency()}setHiddenComponents(t){this.#t=Array.isArray(t)?[...t]:[],this.port?.setHiddenComponents(this.#t)}getComponentReferences(){return this.port?.getComponentReferences()??[]}setViewMode(t){this.port?.setViewMode(t)}renderInset(t,a,s){return!!this.port?.renderInset(t,a,s)}insetReady(){return!!this.port?.insetReady()}insetSurfaceZ(t){let a=this.port;return a?Yi(a.insetBoard().scene.runtimeBounds,!!t):0}releaseInset(t){this.port?.releaseInset(String(t))}insetTarget(t,a){let s=this.port;return s?Ju(s.insetBoard(),t,a):null}projectInset(t,a,s,n){let r=this.port;return r?Yu(r.insetBoard().scene.runtimeBounds,t,a,s,n):null}onSceneChange(t){return this.#s.add(t),()=>this.#s.delete(t)}#o(){for(let t of this.#s)t()}insetStats(){return this.port?.insetStats()??null}insetSettings(t){return this.port?.insetSettings(t)??null}gpuIdle(){return this.port?.gpuIdle()??Promise.resolve()}async loadAnalyticPack(t,a={}){let s=t instanceof Uint8Array?t:new Uint8Array(t);return this.#r={bytes:s,options:a,overlay:null},this.port?this.port.loadAnalyticPack(s,a):null}setAnalyticOverlay(t){return this.#r&&(this.#r.overlay=t),this.port?.setAnalyticOverlay(t)??null}analyticAt(t,a){return this.port?.analyticAt(t,a)??Promise.resolve(null)}analyticStats(){return this.port?.analyticStats()??null}unloadAnalyticPack(){this.#r=null,this.port?.unloadAnalyticPack()}},ov=Object.freeze(["setSystemScene","setNetEmphasis","frameNetEmphasis","frameAll","frameBoard","frameParts","setMoveMode","setRouteMode","setMoveSpace","previewPose","cancelMove","getMoveState","targetHarnessNode","selectHarness","previewHarnessNode","cancelHarnessNode","getHarnessState","setLabelsVisible","setHarnessesVisible","setHelpVisible","isHelpVisible","setLodThresholds","pickSurfaceAt","focusMoveTarget","viewAxis"]),Wn=class extends qn{#e=null;#t=null;#a=null;#s=!1;attach(t,{moveAllowed:a=!1}={}){this.#s=!!a,super.attach(t)}replay(t){this.shared.gpuBudget!=null&&t.setGpuBudget(Ji(this.shared.gpuBudget)),this.#e&&t.setSystemScene(this.#e),this.#t&&this.#n(t,this.#t),t.setMoveAllowed(this.#s),this.#a!=null&&t.setLabelsVisible(this.#a)}applySelection(t,a){if(!a){t.clearSelection();return}if(t.focusPlacement(a.occurrence)!=="board")return;let s=Qu(t.nets(),a);s.kind==="board"?t.selectBoardContext():Zu(t,s)}setSystemScene(t){this.#e=t||null,t&&this.port?.setSystemScene(t)}setNetEmphasis(t){this.#t=Array.isArray(t)?t:[];let a=this.port;return a?this.#n(a,this.#t):[]}#n(t,a){let s=t.anyEmphasis(),n=t.setEmphasisSets(nv(a));if(!n)return[];let r=t.anyEmphasis(),i=ef(s,r);return i==="enter"?t.showNetProbe():i==="leave"&&(t.isolating()&&t.setNetIsolation(!1),t.restoreVisibility()),t.isolating()&&r&&t.isolateLitNets(),n}frameNetEmphasis(t=null,a=null){return this.port?.frameNetEmphasis(t,a)??!1}frameAll(){this.port?.frameAll()}frameBoard(t){return this.port?.frameBoard(t)??!1}frameParts(t){return this.port?.frameParts(t)??!1}setMoveAllowed(t){this.#s=!!t,this.port?.setMoveAllowed(this.#s)}setMoveMode(t,a){this.port?.setMoveMode(t,a)}setRouteMode(t){this.port?.setMoveMode(t,{route:!0})}setMoveSpace(t){this.port?.setMoveSpace(t)}previewPose(t){this.port?.previewPose(t)}cancelMove(){this.port?.cancelMove()}getMoveState(){return this.port?.getMoveState()??null}targetHarnessNode(t){this.port?.targetHarnessNode(t)}selectHarness(t){return this.port?.selectHarness(t)??!1}previewHarnessNode(t){this.port?.previewHarnessNode(t)}cancelHarnessNode(){this.port?.cancelHarnessNode()}getHarnessState(){return this.port?.getHarnessState()??null}setLabelsVisible(t){this.#a=!!t,this.port?.setLabelsVisible(this.#a)}setHarnessesVisible(t){this.port?.setHarnessesVisible(!!t)}setHelpVisible(t){this.port?.setHelpVisible(t)}isHelpVisible(){return!!this.port?.isHelpVisible()}setLodThresholds(t){return this.port?.setLodThresholds(t)??null}pickSurfaceAt(t,a){return this.port?.pickSurfaceAt(t,a)??null}focusMoveTarget(t){return!!this.port?.focusMoveTarget(t)}viewAxis(t,a=!1){this.port?.viewAxis(t,a)}};function tf(e){let t=(a,s)=>{for(let n of a)Object.defineProperty(e,n,{configurable:!0,writable:!0,value(...r){return s(this)[n](...r)}})};t(rv,a=>a.activeMode),t(iv,a=>a.modes.board),t(ov,a=>a.modes.system)}var Aa=class{__destroy_into_raw(){let t=this.__wbg_ptr;return this.__wbg_ptr=0,af.unregister(this),t}free(){let t=this.__destroy_into_raw();H.__wbg_analyticpack_free(t,0)}barrelRecords(){let t=H.analyticpack_barrelRecords(this.__wbg_ptr);return ys.__wrap(t)}bindingJson(t){let a,s;try{let i=H.analyticpack_bindingJson(this.__wbg_ptr,t);var n=i[0],r=i[1];if(i[3])throw n=0,r=0,Yn(i[2]);return a=n,s=r,vs(n,r)}finally{H.__wbindgen_free(a,s,1)}}headerJson(){let t,a;try{let r=H.analyticpack_headerJson(this.__wbg_ptr);var s=r[0],n=r[1];if(r[3])throw s=0,n=0,Yn(r[2]);return t=s,a=n,vs(s,n)}finally{H.__wbindgen_free(t,a,1)}}lowerSlice(t,a){let s=fv(t,H.__wbindgen_malloc,H.__wbindgen_realloc),n=ws,r=H.analyticpack_lowerSlice(this.__wbg_ptr,s,n,a);if(r[2])throw Yn(r[1]);return xs.__wrap(r[0])}constructor(t){let a=uv(t,H.__wbindgen_malloc),s=ws,n=H.analyticpack_new(a,s);if(n[2])throw Yn(n[1]);return this.__wbg_ptr=n[0],af.register(this,this.__wbg_ptr,this),this}};Symbol.dispose&&(Aa.prototype[Symbol.dispose]=Aa.prototype.free);var ys=class e{static __wrap(t){let a=Object.create(e.prototype);return a.__wbg_ptr=t,sf.register(a,a.__wbg_ptr,a),a}__destroy_into_raw(){let t=this.__wbg_ptr;return this.__wbg_ptr=0,sf.unregister(this),t}free(){let t=this.__destroy_into_raw();H.__wbg_barrelrecords_free(t,0)}floats(){let t=H.barrelrecords_floats(this.__wbg_ptr);var a=eo(t[0],t[1]).slice();return H.__wbindgen_free(t[0],t[1]*4,4),a}skipped(){return H.barrelrecords_skipped(this.__wbg_ptr)>>>0}words(){let t=H.barrelrecords_words(this.__wbg_ptr);var a=Jn(t[0],t[1]).slice();return H.__wbindgen_free(t[0],t[1]*4,4),a}};Symbol.dispose&&(ys.prototype[Symbol.dispose]=ys.prototype.free);var xs=class e{static __wrap(t){let a=Object.create(e.prototype);return a.__wbg_ptr=t,nf.register(a,a.__wbg_ptr,a),a}__destroy_into_raw(){let t=this.__wbg_ptr;return this.__wbg_ptr=0,nf.unregister(this),t}free(){let t=this.__destroy_into_raw();H.__wbg_loweredslicerecords_free(t,0)}batches(){let t=H.loweredslicerecords_batches(this.__wbg_ptr);var a=Jn(t[0],t[1]).slice();return H.__wbindgen_free(t[0],t[1]*4,4),a}contourEdges(){let t=H.loweredslicerecords_contourEdges(this.__wbg_ptr);var a=eo(t[0],t[1]).slice();return H.__wbindgen_free(t[0],t[1]*4,4),a}covers(){let t=H.loweredslicerecords_covers(this.__wbg_ptr);var a=Jn(t[0],t[1]).slice();return H.__wbindgen_free(t[0],t[1]*4,4),a}fanVertices(){let t=H.loweredslicerecords_fanVertices(this.__wbg_ptr);var a=eo(t[0],t[1]).slice();return H.__wbindgen_free(t[0],t[1]*4,4),a}shapes(){let t=H.loweredslicerecords_shapes(this.__wbg_ptr);var a=Jn(t[0],t[1]).slice();return H.__wbindgen_free(t[0],t[1]*4,4),a}statsJson(){let t,a;try{let s=H.loweredslicerecords_statsJson(this.__wbg_ptr);return t=s[0],a=s[1],vs(s[0],s[1])}finally{H.__wbindgen_free(t,a,1)}}subtractShapes(){return H.loweredslicerecords_subtractShapes(this.__wbg_ptr)>>>0}};Symbol.dispose&&(xs.prototype[Symbol.dispose]=xs.prototype.free);function cv(){return{__proto__:null,"./kicad_monkey_analytic_bg.js":{__proto__:null,__wbg___wbindgen_throw_bb96b2010945f0bc:function(t,a){throw new Error(vs(t,a))},__wbindgen_cast_0000000000000001:function(t,a){return vs(t,a)},__wbindgen_init_externref_table:function(){let t=H.__wbindgen_externrefs,a=t.grow(4);t.set(0,void 0),t.set(a+0,void 0),t.set(a+1,null),t.set(a+2,!0),t.set(a+3,!1)}}}}var af=typeof FinalizationRegistry>"u"?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(e=>H.__wbg_analyticpack_free(e,1)),sf=typeof FinalizationRegistry>"u"?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(e=>H.__wbg_barrelrecords_free(e,1)),nf=typeof FinalizationRegistry>"u"?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(e=>H.__wbg_loweredslicerecords_free(e,1));function eo(e,t){return e=e>>>0,lv().subarray(e/4,e/4+t)}function Jn(e,t){return e=e>>>0,dv().subarray(e/4,e/4+t)}var hs=null;function lv(){return(hs===null||hs.byteLength===0)&&(hs=new Float32Array(H.memory.buffer)),hs}function vs(e,t){return bv(e>>>0,t)}var bs=null;function dv(){return(bs===null||bs.byteLength===0)&&(bs=new Uint32Array(H.memory.buffer)),bs}var ps=null;function gs(){return(ps===null||ps.byteLength===0)&&(ps=new Uint8Array(H.memory.buffer)),ps}function uv(e,t){let a=t(e.length*1,1)>>>0;return gs().set(e,a/1),ws=e.length,a}function fv(e,t,a){if(a===void 0){let o=ms.encode(e),c=t(o.length,1)>>>0;return gs().subarray(c,c+o.length).set(o),ws=o.length,c}let s=e.length,n=t(s,1)>>>0,r=gs(),i=0;for(;i<s;i++){let o=e.charCodeAt(i);if(o>127)break;r[n+i]=o}if(i!==s){i!==0&&(e=e.slice(i)),n=a(n,s,s=i+e.length*3,1)>>>0;let o=gs().subarray(n+i,n+s),c=ms.encodeInto(e,o);i+=c.written,n=a(n,s,i,1)>>>0}return ws=i,n}function Yn(e){let t=H.__wbindgen_externrefs.get(e);return H.__externref_table_dealloc(e),t}var Qn=new TextDecoder("utf-8",{ignoreBOM:!0,fatal:!0});Qn.decode();var hv=2146435072,Zi=0;function bv(e,t){return Zi+=t,Zi>=hv&&(Qn=new TextDecoder("utf-8",{ignoreBOM:!0,fatal:!0}),Qn.decode(),Zi=t),Qn.decode(gs().subarray(e,e+t))}var ms=new TextEncoder;"encodeInto"in ms||(ms.encodeInto=function(e,t){let a=ms.encode(e);return t.set(a),{read:e.length,written:a.length}});var ws=0,pv,gv,H;function mv(e,t){return gv=e,H=e.exports,pv=t,hs=null,bs=null,ps=null,H.__wbindgen_start(),H}async function yv(e,t){if(typeof Response=="function"&&e instanceof Response){if(typeof WebAssembly.instantiateStreaming=="function")try{return await WebAssembly.instantiateStreaming(e,t)}catch(n){if(e.ok&&a(e.type)&&e.headers.get("Content-Type")!=="application/wasm")console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n",n);else throw n}let s=await e.arrayBuffer();return await WebAssembly.instantiate(s,t)}else{let s=await WebAssembly.instantiate(e,t);return s instanceof WebAssembly.Instance?{instance:s,module:e}:s}function a(s){switch(s){case"basic":case"cors":case"default":return!0}return!1}}async function rf(e){if(H!==void 0)return H;e!==void 0&&(Object.getPrototypeOf(e)===Object.prototype?{module_or_path:e}=e:console.warn("using deprecated parameters for the initialization function; pass a single object instead")),e===void 0&&(e=new URL("kicad_monkey_analytic_bg.wasm",import.meta.url));let t=cv();(typeof e=="string"||typeof Request=="function"&&e instanceof Request||typeof URL=="function"&&e instanceof URL)&&(e=fetch(e));let{instance:a,module:s}=await yv(await e,t);return mv(a,s)}var of={schema:"prism.vendored_wasm.a0",purpose:"Reads kicad_monkey.materialization.a0 packs in the browser and lowers their slices for the analytic renderer.",source:{repository:"https://github.com/krishna-swaroop/kicad_monkey.git",revision:"b40c1c78481e981ac7d575f171d567930c7e434d",crate:"kicad-monkey-wasm",license:"MIT"},build:{target:"wasm32-unknown-unknown",profile:"release",features:["materialization"],wasm_bindgen:"0.2.126",rustc:"rustc 1.98.0 (88d9e12ae 2026-08-18)",command:"node scripts/build-analytic-wasm.mjs --monkey <kicad_monkey checkout at revision>"},files:{"kicad_monkey_analytic.js":"273fe6182ce5f939dc933ef6ccee12bb05246de410e5bda88aaeb48f07d99c91","kicad_monkey_analytic_bg.wasm":"4e346b821311138e982cb11d80165ea430491ba0307893ce55bd4f1f10bdeb2a"}};var cf="kicad-monkey-analytic.wasm",vv="kicad_monkey.materialization.a0",wv=1e3,to=null;function Mv(){let e=String(of.files?.["kicad_monkey_analytic_bg.wasm"]||"").slice(0,16);try{return new URL(`${cf}?v=${e}`,import.meta.url)}catch{return`/${cf}?v=${e}`}}function kv(e=Mv()){return to??=rf({module_or_path:e}).catch(t=>{throw to=null,t}),to}async function uf(e,{wasm:t}={}){await kv(t);let a=new Aa(e instanceof Uint8Array?e:new Uint8Array(e)),s=JSON.parse(a.headerJson());if(s.schema!==vv)throw new Error(`unsupported materialization schema ${s.schema}`);return{header:s,lowerSlice(n,r=wv){let i=a.lowerSlice(n,r);try{return{shapes:new Uint32Array(i.shapes()),subtractShapes:i.subtractShapes(),fanVertices:new Float32Array(i.fanVertices()),covers:new Uint32Array(i.covers()),batches:new Uint32Array(i.batches()),contourEdges:new Float32Array(i.contourEdges()),stats:JSON.parse(i.statsJson())}}finally{i.free()}},barrels(){let n=a.barrelRecords();try{return{floats:new Float32Array(n.floats()),words:new Uint32Array(n.words()),skipped:n.skipped()}}finally{n.free()}},binding(n){return JSON.parse(a.bindingJson(n))},free(){a.free()}}}function ff(e){return(e.chunks||[]).reduce((t,a)=>t+Number(a.operation_count||0),0)}function Ev(e,t){let a=null;for(let s of e.chunks||[]){if(s.slice_key!==t)continue;let n=s.bounds,r=[n.min_x_nm,n.min_y_nm,n.max_x_nm,n.max_y_nm].map(i=>i/1e6);a=a?[Math.min(a[0],r[0]),Math.min(a[1],r[1]),Math.max(a[2],r[2]),Math.max(a[3],r[3])]:r}return a}var Tv={conductor:"copper",solder_mask:"mask",silkscreen:"silk",paste:"paste",dielectric:"dielectric"},Sv=1e-6,Iv=2e-6;function hf(e,t,a=0){let s=new Map((t||[]).map(h=>[String(h.name),h])),n=[...e.stack?.slices||[]].sort((h,g)=>h.order-g.order),r=n.filter(h=>h.role==="conductor"),i=h=>Number(s.get(String(h?.kicad_layer||""))?.id||0),o=i(r[0]),c=i(r[r.length-1]),l=[],f=[];for(let h of n){let g=Tv[h.role],p=s.get(String(h.kicad_layer||"")),u=Ev(e,h.key);if(!g||!p||!u){g&&f.push(h.key);continue}let y=Number(p.z_mm||0)/1e3+a,b=(Number(p.thickness_mm)||Number(h.thickness_nm||0)/1e6)/2e3,m=h.side==="back"||g!=="dielectric"&&g!=="copper"&&y<a,x={key:h.key,role:g,layerId:Number(p.id),side:h.side||null,bounds:u};if(g==="dielectric"){let M=[...r].reverse().find(I=>I.order<h.order),E=r.find(I=>I.order>h.order),T=[i(M)||i(E),i(E)||i(M)];l.push({...x,face:"top",z:y+b,faceDown:!1,outer:!1,offsetLayers:T}),l.push({...x,face:"bottom",z:y-b,faceDown:!0,outer:!1,offsetLayers:T})}else if(g==="copper"){let M=r.indexOf(h),E=M===r.length-1&&r.length>1;l.push({...x,z:E?y-b:y+b,faceDown:E,bottom:E,outer:M===0||E,offsetLayers:[Number(p.id),Number(p.id)]})}else{let M=g==="silk"?Iv:g==="paste"?Sv:0,E=m?c:o;l.push({...x,z:m?y-b-M:y+b+M,faceDown:m,outer:!1,offsetLayers:[E,E]})}}let d={dielectric:0,copper:1,mask:2,paste:3,silk:4};return l.sort((h,g)=>d[h.role]-d[g.role]),{planned:l,unmatched:f}}function bf(e,t){let a=new Float32Array(Math.max(1,t)).fill(Number.NaN);if(ArrayBuffer.isView(e)||Array.isArray(e))for(let s=0;s<Math.min(t,e.length);s+=1)a[s]=Number(e[s]);else for(let[s,n]of Object.entries(e||{})){let r=Number(s);Number.isInteger(r)&&r>=0&&r<t&&(a[r]=Number(n))}return a}function Zn(e){let t=1/0,a=-1/0;for(let s of e)Number.isFinite(s)&&(t=Math.min(t,s),a=Math.max(a,s));return Number.isFinite(t)?[t,a]:[0,1]}function pf(e){let t=new Map;for(let s of e||[])t.has(s.slice_key)||t.set(s.slice_key,[]),t.get(s.slice_key).push(s);let a=new Map;for(let[s,n]of t){let r=Number(n[0].pitch_nm);if(!(r>0)||n.some(h=>Number(h.pitch_nm)!==r))throw new Error(`field tiles of ${s} must share one positive pitch`);let i=Math.min(...n.map(h=>h.origin_nm[0])),o=Math.min(...n.map(h=>h.origin_nm[1])),c=(h,g)=>{let p=(h-g)/r;if(!Number.isInteger(p))throw new Error(`field tile of ${s} is off its pitch grid`);return p},l=Math.max(...n.map(h=>c(h.origin_nm[0],i)+h.width)),f=Math.max(...n.map(h=>c(h.origin_nm[1],o)+h.height)),d=new Float32Array(l*f).fill(Number.NaN);for(let h of n){let g=c(h.origin_nm[0],i),p=c(h.origin_nm[1],o);for(let u=0;u<h.height;u+=1)d.set(h.values.subarray?h.values.subarray(u*h.width,(u+1)*h.width):h.values.slice(u*h.width,(u+1)*h.width),(p+u)*l+g)}a.set(s,{originMm:[i/1e6,o/1e6],pitchMm:r/1e6,width:l,height:f,values:d})}return a}var ao=8,lf=8,df=4294967295,Av=2,so=12;function gf(e,t,a){let s=(e.stack?.slices||[]).filter(h=>h.role==="conductor").sort((h,g)=>h.order-g.order),n=new Map((a||[]).filter(h=>h.role===void 0||h.role==="copper").map(h=>[h.key,h])),r=h=>{let g=n.get(h.key);if(!g)return null;let p=Number(h.thickness_nm||0)/1e9;return g.bottom?{top:g.z+p,bottom:g.z,layerId:g.layerId}:{top:g.z,bottom:g.z-p,layerId:g.layerId}},i=Math.floor(t.floats.length/ao),o=new ArrayBuffer(i*so*4),c=new Float32Array(o),l=new Uint32Array(o),f=0,d=t.skipped||0;for(let h=0;h<i;h+=1){let g=t.floats.subarray(h*ao,(h+1)*ao),p=t.words.subarray(h*lf,(h+1)*lf),[u,y]=[Math.min(p[1],p[2]),Math.max(p[1],p[2])],b=s.filter(E=>E.order>=u&&E.order<=y&&(p[3]===df||E.order>p[3])&&(p[4]===df||E.order<p[4])),m=b.length?r(b[0]):null,x=b.length?r(b[b.length-1]):null;if(!m||!x){d+=1;continue}let M=f*so;c.set([g[0]/1e3,-g[1]/1e3,g[2]/1e3,-g[3],g[4]/1e3,g[5]/1e3,m.top,x.bottom],M),l.set([p[0],m.layerId,x.layerId,p[5]&Av?1:0],M+8),f+=1}return{data:o.slice(0,f*so*4),count:f,skipped:d}}var no=12;function mf(e,t,a,s=0){let n=new Map((a||[]).map(b=>[Number(b.id),b])),r=b=>Number(n.get(Number(b))?.z_mm||0)/1e3+s,i=(a||[]).filter(b=>b.role==="soldermask").map(b=>Number(b.z_mm)/1e3+s+Math.sign(Number(b.z_mm))*Number(b.thickness_mm||0)/2e3),o=i.length?Math.max(...i):null,c=i.length?Math.min(...i):null,l=e.filter(b=>b.role==="dielectric"&&b.face==="top"),f=[],d=[...new Set(e.filter(b=>b.role==="copper").map(b=>b.layerId))],h=d[0],g=d[d.length-1];for(let b of l){let m=t.get(b.key)?.contourEdges;if(!m?.length)continue;let x=e.find(A=>A.key===b.key&&A.face==="bottom"),[M,E]=b.offsetLayers,T=M===h&&o!=null?o:Math.max(b.z,r(M)),I=E===g&&c!=null?c:Math.min(x.z,r(E));for(let A=0;A+3<m.length;A+=4)f.push([m[A],m[A+1],m[A+2],m[A+3],T,I,M,E])}let p=new ArrayBuffer(f.length*no*4),u=new Float32Array(p),y=new Uint32Array(p);return f.forEach(([b,m,x,M,E,T,I,A],R)=>{u.set([b/1e3,-m/1e3,x/1e3,-M/1e3,E,T,0,0],R*no),y.set([I,A,0,0],R*no+8)}),{data:p,count:f.length}}var Mf={color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}};function kf(e){let t=Float32Array.from(e);for(let a=0;a<t.length;a+=1)Number.isFinite(t[a])||(t[a]=3e38);return t}var er=class{constructor(t){this.renderer=t,this.device=t.device,this.stencil=t.stencil,this.slices=[],this.overlay={mode:0,range:[0,1]},this.layout=this.device.createBindGroupLayout({label:"analytic",entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:2,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:3,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:4,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:5,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:"unfilterable-float"}}]}),this.module=this.device.createShaderModule({label:"analytic",code:Wl}),this.pipelines={color:this.makePipelines(t.format,!1),pick:this.makePipelines("rg32uint",!0)},this.emptyValues=this.buffer(new Float32Array([3e38]),GPUBufferUsage.STORAGE,"analytic-values-empty"),this.valuesBuffer=this.emptyValues,this.emptyField=this.fieldTexture(1,1,new Float32Array([3e38])),this.uniformScratch=new ArrayBuffer(256),this.makeBarrelPipelines()}makeBarrelPipelines(){let t=GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT;this.barrelLayout=this.device.createBindGroupLayout({label:"analytic-barrels",entries:[{binding:0,visibility:t,buffer:{type:"uniform"}},{binding:1,visibility:t,buffer:{type:"uniform"}},{binding:2,visibility:t,buffer:{type:"read-only-storage"}},{binding:3,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:4,visibility:t,buffer:{type:"read-only-storage"}}]});let a=this.device.createShaderModule({label:"analytic-barrels",code:Jl}),s=this.device.createPipelineLayout({bindGroupLayouts:[this.barrelLayout]}),n=(o,c)=>this.device.createRenderPipeline({label:`analytic-barrel${c?"-pick":""}`,layout:s,vertex:{module:a,entryPoint:"vs_barrel"},fragment:{module:a,entryPoint:c?"fs_barrel_pick":"fs_barrel",targets:[{format:o}]},primitive:{topology:"triangle-list",cullMode:"none"},depthStencil:{format:this.renderer.depthFormat,depthWriteEnabled:!0,depthCompare:"greater"},multisample:{count:1}});this.barrelPipelines={color:n(this.renderer.format,!1),pick:n("rg32uint",!0)},this.barrelView=this.device.createBuffer({label:"analytic-barrel-view",size:wi,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.layerOffsets=this.device.createBuffer({label:"analytic-layer-offsets",size:256*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.viewScratch=new ArrayBuffer(wi),this.barrels=null;let r=this.device.createShaderModule({label:"analytic-walls",code:Ql}),i=o=>this.device.createRenderPipeline({label:`analytic-wall${o?"-blend":""}`,layout:s,vertex:{module:r,entryPoint:"vs_wall"},fragment:{module:r,entryPoint:"fs_wall",targets:[{format:this.renderer.format,...o?{blend:Mf}:{}}]},primitive:{topology:"triangle-list",cullMode:"none"},depthStencil:{format:this.renderer.depthFormat,depthWriteEnabled:!0,depthCompare:"greater"},multisample:{count:1}});this.wallPipelines={opaque:i(!1),blend:i(!0)},this.walls=null}setWalls({data:t,count:a}){this.walls?.buffer.destroy(),this.walls=a?{buffer:this.buffer(new Uint8Array(t),GPUBufferUsage.STORAGE,"analytic-walls"),count:a,bindGroup:null}:null,this.walls&&(this.walls.bindGroup=this.wallBindGroup()),this.renderer.invalidate?.()}wallBindGroup(){return this.device.createBindGroup({layout:this.barrelLayout,entries:[{binding:0,resource:{buffer:this.renderer.globalBuffer}},{binding:1,resource:{buffer:this.barrelView}},{binding:2,resource:{buffer:this.walls.buffer}},{binding:3,resource:{buffer:this.valuesBuffer}},{binding:4,resource:{buffer:this.layerOffsets}}]})}encodeWalls(t,a){return this.walls?(t.setPipeline(a?this.wallPipelines.blend:this.wallPipelines.opaque),t.setBindGroup(0,this.walls.bindGroup),t.draw(6,this.walls.count),1):0}writeView(t,a,s={}){let n=new Float32Array(256);a&&n.set(a.subarray?a.subarray(0,256):a.slice(0,256)),this.device.queue.writeBuffer(this.layerOffsets,0,n);let r=new Float32Array(this.viewScratch),i=new Uint32Array(this.viewScratch);r.fill(0),r.set(Bv(t),0),r.set(this.renderer.barrelColor||[.55,.35,.16,1],4);let o=this.boardLooks().substrate,c=(s.boardOpacity??1)*(.15+.85*(s.assemblyOpacity??1));r.set([...(o?.color||[.3,.32,.25,1]).slice(0,3),c],8),i[12]=this.overlay.mode===1?1:0,r.set(this.overlay.range,16),this.device.queue.writeBuffer(this.barrelView,0,this.viewScratch)}setBarrels({data:t,count:a,skipped:s=0}){this.barrels?.buffer.destroy(),this.barrels=a?{buffer:this.buffer(new Uint8Array(t),GPUBufferUsage.STORAGE,"analytic-barrels"),count:a,skipped:s,bindGroup:null}:null,this.barrels&&(this.barrels.bindGroup=this.barrelBindGroup()),this.renderer.invalidate?.()}hasBarrels(){return!!this.barrels}barrelBindGroup(){return this.device.createBindGroup({layout:this.barrelLayout,entries:[{binding:0,resource:{buffer:this.renderer.globalBuffer}},{binding:1,resource:{buffer:this.barrelView}},{binding:2,resource:{buffer:this.barrels.buffer}},{binding:3,resource:{buffer:this.valuesBuffer}},{binding:4,resource:{buffer:this.layerOffsets}}]})}encodeBarrels(t,a,s,n=!1){return this.barrels?(s&&this.writeView(s,a,this.context),t.setPipeline(n?this.barrelPipelines.pick:this.barrelPipelines.color),t.setBindGroup(0,this.barrels.bindGroup),t.draw(36,this.barrels.count),1):0}buffer(t,a,s){let n=Math.max(16,Math.ceil(t.byteLength/4)*4),r=this.device.createBuffer({label:s,size:n,usage:a|GPUBufferUsage.COPY_DST});return t.byteLength&&this.device.queue.writeBuffer(r,0,t),r}fieldTexture(t,a,s){let n=this.device.createTexture({label:"analytic-field",size:[t,a],format:"r32float",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});return this.device.queue.writeTexture({texture:n},s,{bytesPerRow:t*4},[t,a]),n}makePipelines(t,a){let s=this.device.createPipelineLayout({bindGroupLayouts:[this.layout]}),n=(i,o,c,l,f=[],d=!1)=>{let h=vi[l],g={format:this.renderer.depthFormat,depthWriteEnabled:h.depth,depthCompare:h.depth||h.depthTest?"greater":"always"};return this.stencil&&Object.assign(g,{stencilFront:h.face,stencilBack:h.face,stencilReadMask:h.read,stencilWriteMask:h.write}),this.device.createRenderPipeline({label:`analytic-${i}${a?"-pick":""}`,layout:s,vertex:{module:this.module,entryPoint:o,buffers:f},fragment:{module:this.module,entryPoint:a?`${c}_pick`:c,targets:[{format:t,writeMask:h.color?GPUColorWrite.ALL:0,...d&&!a?{blend:Mf}:{}}]},primitive:{topology:"triangle-list",cullMode:"none"},depthStencil:g,multisample:{count:1}})},r=[{arrayStride:8,attributes:[{shaderLocation:0,offset:0,format:"float32x2"}]}];return{shapeMask:n("shape-mask","vs_shape","fs_shape_mask","shapeMask"),shapeAdd:n("shape","vs_shape","fs_shape","shapeAdd"),fan:n("fan","vs_fan","fs_plain_mask","fan",r),coverSubtract:n("cover-subtract","vs_cover","fs_plain_mask","coverSubtract"),coverMark:n("cover-mark","vs_cover","fs_plain_mask","coverMark"),coverAdd:n("cover","vs_cover","fs_cover","coverAdd"),coverClear:n("cover-clear","vs_cover","fs_plain_mask","coverClear"),clear:n("clear","vs_clear","fs_plain_mask","clear"),...a?{}:{shapeLay:n("shape-lay","vs_shape","fs_shape_mask","shapeLay"),coverLay:n("cover-lay","vs_cover","fs_plain_mask","coverLay"),shapeBlend:n("shape-blend","vs_shape","fs_shape","shapeBlend",[],!0),coverBlend:n("cover-blend","vs_cover","fs_cover","coverBlend",[],!0),tintCovered:n("tint-covered","vs_clear","fs_tint_covered","tintCovered",[],!0),tintPlain:n("tint-plain","vs_clear","fs_tint_plain","tintPlain",[],!0)}}}setSlices(t){this.releaseSlices();let a=new Map;this.slices=t.map(s=>this.uploadSlice(s,a)),this.renderer.invalidate?.()}uploadSlice(t,a=new Map){let{lowered:s}=t,n=GPUBufferUsage.STORAGE;a.has(s)||a.set(s,{shapes:this.buffer(s.shapes,n,`analytic-shapes-${t.key}`),covers:this.buffer(s.covers,n,`analytic-covers-${t.key}`),fans:s.fanVertices.length?this.buffer(s.fanVertices,GPUBufferUsage.VERTEX,`analytic-fans-${t.key}`):null});let r={...t,...a.get(s),uniform:this.device.createBuffer({label:`analytic-slice-${t.key}`,size:256,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),shapeCount:s.shapes.length/20,subtractShapes:s.subtractShapes,batches:[],field:null};for(let i=0;i<s.batches.length;i+=5){let[o,c,l,f,d]=s.batches.subarray(i,i+5);r.batches.push({subtract:o===1,firstVertex:c,vertexCount:l,firstCover:f,coverCount:d})}return r.bindGroup=this.bindGroup(r),r}bindGroup(t){return this.device.createBindGroup({layout:this.layout,entries:[{binding:0,resource:{buffer:this.renderer.globalBuffer}},{binding:1,resource:{buffer:t.uniform}},{binding:2,resource:{buffer:t.shapes}},{binding:3,resource:{buffer:t.covers}},{binding:4,resource:{buffer:this.valuesBuffer}},{binding:5,resource:(t.field?.texture||this.emptyField).createView()}]})}coversLayer(t){return this.slices.some(a=>a.role!==void 0?a.role==="copper"&&a.layerId===Number(t):a.layerId===Number(t))}coversRole(t){let a={substrate:"dielectric",soldermask:"mask",silkscreen:"silk",paste:"paste"}[t];return!!a&&this.slices.some(s=>s.role===a)}setOperationValues(t,a){this.clearOverlay(),this.valuesBuffer=this.buffer(kf(t),GPUBufferUsage.STORAGE,"analytic-values"),this.overlay={mode:1,range:a},this.rebind()}setFieldRasters(t,a){this.clearOverlay();for(let s of this.slices){let n=t.get(s.key);n&&(s.field={...n,texture:this.fieldTexture(n.width,n.height,kf(n.values))})}this.overlay={mode:2,range:a},this.rebind()}clearOverlay(){this.valuesBuffer!==this.emptyValues&&this.valuesBuffer.destroy(),this.valuesBuffer=this.emptyValues;for(let t of this.slices)t.field?.texture.destroy(),t.field=null;this.overlay={mode:0,range:[0,1]},this.rebind()}rebind(){for(let t of this.slices)t.bindGroup=this.bindGroup(t);this.barrels&&(this.barrels.bindGroup=this.barrelBindGroup()),this.renderer.invalidate?.()}writeSlice(t,a,s=null){let n=new Float32Array(this.uniformScratch),r=new Uint32Array(this.uniformScratch);n.fill(0),n.set(s?.color||t.color,0);let[i,o]=t.offsetLayers||[t.layerId,t.layerId];n[4]=t.z+.5*((a?.[i]||0)+(a?.[o]||0));let c=t.role===void 0||t.role==="copper";r[5]=c?this.overlay.mode:0;let l=c?t.field:null;r[6]=l?1:0,l&&(n.set(l.originMm,8),n[10]=l.pitchMm,r[12]=l.width,r[13]=l.height),n.set(this.overlay.range,16),n.set(t.bounds,20),n.set([s?.metallic??0,s?.roughness??.72,t.faceDown??t.bottom?-1:1,c?1:0],24),this.device.queue.writeBuffer(t.uniform,0,this.uniformScratch)}copperLooks(){let t=new Map;for(let a of this.renderer.entries||[]){let s=Number(a.layerId);if(a.kind!=="copper"||t.has(s))continue;let n=a.color||a.material?.baseColor;t.set(s,{color:n&&n.length<4?[...n,1]:n,metallic:a.material?.metallic||0,roughness:a.material?.roughness??.72})}return t}boardLooks(){let t={};for(let a of this.renderer.entries||[]){if(a.kind!=="board"||t[a.boardRole])continue;let s=a.color||a.material?.baseColor;t[a.boardRole]={color:s&&s.length<4?[...s,1]:s,metallic:a.material?.metallic||0,roughness:a.material?.roughness??.72}}return t}lookFor(t,a,s,n){if(t.role===void 0||t.role==="copper")return a.get(t.layerId);let r=n.boardOpacity??1,i=(c,l)=>{let f=s[c];if(!f)return null;let d=f.color||[1,1,1,1];return{...f,color:[d[0],d[1],d[2],l(Number.isFinite(d[3])?d[3]:1)]}};if(t.role==="dielectric")return i("substrate",()=>r*(.15+.85*(n.assemblyOpacity??1)));let o=n.assemblyOpacity??1;return t.role==="mask"?i("soldermask",c=>Math.min(c,.72)*r*o):t.role==="silk"?i("silkscreen",c=>Math.min(c,.92)*r*o):i("paste",c=>c)}encodeInto(t,a,s,n=!1,r={}){this.context=r,r.matrix&&this.writeView(r.matrix,a,r);let i=n?this.pipelines.pick:this.pipelines.color,o=this.copperLooks(),c=this.boardLooks(),f=this.boardShown(r)&&(r.boardOpacity??1)>=.999,d=0;for(let h of this.slices)(h.role===void 0||h.role==="copper"?s&&!s.has(h.layerId):n||h.role!=="dielectric"||!f)||(this.encodeSlice(t,i,h,"opaque",a,this.lookFor(h,o,c,r)),d+=1);return f&&!n&&(d+=this.encodeWalls(t,!1)),this.stencil&&t.setStencilReference(1),d}boardShown(t){return(t.showBoard??!0)&&!t.panelLayer}encodeBlended(t,a,s,n={}){if(!this.stencil)return 0;let r=this.copperLooks(),i=this.boardLooks(),o=this.boardShown(n),c=o&&(n.boardOpacity??1)<.999,l=0,f=(h,g)=>{this.encodeSlice(t,this.pipelines.color,h,g,a,this.lookFor(h,r,i,n)),l+=1};for(let h of this.slices)c&&h.role==="dielectric"&&f(h,"blend");c&&(l+=this.encodeWalls(t,!0));let d=o&&(n.assemblyOpacity??1)>.01;for(let h of this.slices)h.role==="mask"&&d?f(h,"mask"):h.role==="paste"&&!n.hidePaste&&!n.panelLayer&&(!s||s.has(h.offsetLayers?.[0]))&&f(h,"blend");for(let h of this.slices)h.role==="silk"&&d&&f(h,"blend");return t.setStencilReference(1),l}encodeSlice(t,a,s,n,r,i){this.writeSlice(s,r,i),t.setBindGroup(0,s.bindGroup),this.stencil?this.encodeStencilled(t,a,s,n):this.encodeAddsOnly(t,a,s)}encodeAddsOnly(t,a,s){let n=s.shapeCount-s.subtractShapes;n&&(t.setPipeline(a.shapeAdd),t.draw(6,n,0,s.subtractShapes))}encodeStencilled(t,a,s,n="opaque"){let r=(o,c=vi[o].reference)=>{t.setPipeline(a[o]),t.setStencilReference(c)};s.subtractShapes&&(r("shapeMask"),t.draw(6,s.subtractShapes,0,0)),this.encodeBatches(t,s,!0,r,n);let i=s.shapeCount-s.subtractShapes;i&&(n==="opaque"?r("shapeAdd",s.outer?33:32):r(n==="mask"?"shapeLay":"shapeBlend"),t.draw(6,i,0,s.subtractShapes)),this.encodeBatches(t,s,!1,r,n),n==="mask"&&(r("tintCovered"),t.draw(6),r("tintPlain"),t.draw(6)),r("clear"),t.draw(6)}encodeBatches(t,a,s,n,r="opaque"){for(let i of a.batches){if(i.subtract!==s||!a.fans)continue;n("fan"),t.setVertexBuffer(0,a.fans),t.draw(i.vertexCount,1,i.firstVertex,0),!s&&r==="opaque"&&(a.outer||a.role==="dielectric")&&(n("coverMark",a.outer?65:64),t.draw(6,i.coverCount,0,i.firstCover));let o={opaque:"coverAdd",blend:"coverBlend",mask:"coverLay"}[r];n(s?"coverSubtract":o),t.draw(6,i.coverCount,0,i.firstCover),s||(n("coverClear"),t.draw(6,i.coverCount,0,i.firstCover))}}gpuMemoryBytes(){let t=this.valuesBuffer===this.emptyValues?0:this.valuesBuffer.size;this.barrels&&(t+=this.barrels.count*$l),this.walls&&(t+=this.walls.count*Yl);for(let a of this.slices)t+=a.shapes.size+a.covers.size+(a.fans?.size||0)+a.uniform.size,a.field&&(t+=a.field.width*a.field.height*4);return t}stats(){return{slices:this.slices.map(t=>({key:t.key,role:t.role||"copper",face:t.face,layerId:t.layerId,z:t.z,shapes:t.shapeCount,subtractShapes:t.subtractShapes,regionBatches:t.batches.length,fanVertices:t.lowered.fanVertices.length/2,covers:t.lowered.covers.length/6,approximations:t.lowered.stats})),overlay:this.overlay.mode,barrels:this.barrels?{count:this.barrels.count,skipped:this.barrels.skipped}:null,walls:this.walls?.count||0,gpuMemoryBytes:this.gpuMemoryBytes(),degraded:!this.stencil}}releaseSlices(){let t=new Set;for(let a of this.slices){for(let s of[a.shapes,a.covers,a.fans,a.uniform])s&&t.add(s);a.field?.texture.destroy()}for(let a of t)a.destroy();this.slices=[]}destroy(){this.releaseSlices(),this.barrels?.buffer.destroy(),this.walls?.buffer.destroy(),this.barrelView.destroy(),this.layerOffsets.destroy(),this.valuesBuffer!==this.emptyValues&&this.valuesBuffer.destroy(),this.emptyValues.destroy(),this.emptyField.destroy()}};function Bv(e){let t=Cv(Array.from(e,Number));if(!t)return[0,0,-1,0];let a=l=>[0,1,2,3].map(f=>t[f]*l[0]+t[4+f]*l[1]+t[8+f]*l[2]+t[12+f]*l[3]),s=a([0,0,1,0]),n=Math.hypot(s[0],s[1],s[2]);if(Math.abs(s[3])>1e-9*Math.max(n,1e-30))return[s[0]/s[3],s[1]/s[3],s[2]/s[3],1];let r=a([0,0,1,1]),i=a([0,0,0,1]),o=[0,1,2].map(l=>i[l]/i[3]-r[l]/r[3]),c=Math.hypot(...o)||1;return[...o.map(l=>l/c),0]}function Cv(e){let t=new Array(16);t[0]=e[5]*e[10]*e[15]-e[5]*e[11]*e[14]-e[9]*e[6]*e[15]+e[9]*e[7]*e[14]+e[13]*e[6]*e[11]-e[13]*e[7]*e[10],t[4]=-e[4]*e[10]*e[15]+e[4]*e[11]*e[14]+e[8]*e[6]*e[15]-e[8]*e[7]*e[14]-e[12]*e[6]*e[11]+e[12]*e[7]*e[10],t[8]=e[4]*e[9]*e[15]-e[4]*e[11]*e[13]-e[8]*e[5]*e[15]+e[8]*e[7]*e[13]+e[12]*e[5]*e[11]-e[12]*e[7]*e[9],t[12]=-e[4]*e[9]*e[14]+e[4]*e[10]*e[13]+e[8]*e[5]*e[14]-e[8]*e[6]*e[13]-e[12]*e[5]*e[10]+e[12]*e[6]*e[9],t[1]=-e[1]*e[10]*e[15]+e[1]*e[11]*e[14]+e[9]*e[2]*e[15]-e[9]*e[3]*e[14]-e[13]*e[2]*e[11]+e[13]*e[3]*e[10],t[5]=e[0]*e[10]*e[15]-e[0]*e[11]*e[14]-e[8]*e[2]*e[15]+e[8]*e[3]*e[14]+e[12]*e[2]*e[11]-e[12]*e[3]*e[10],t[9]=-e[0]*e[9]*e[15]+e[0]*e[11]*e[13]+e[8]*e[1]*e[15]-e[8]*e[3]*e[13]-e[12]*e[1]*e[11]+e[12]*e[3]*e[9],t[13]=e[0]*e[9]*e[14]-e[0]*e[10]*e[13]-e[8]*e[1]*e[14]+e[8]*e[2]*e[13]+e[12]*e[1]*e[10]-e[12]*e[2]*e[9],t[2]=e[1]*e[6]*e[15]-e[1]*e[7]*e[14]-e[5]*e[2]*e[15]+e[5]*e[3]*e[14]+e[13]*e[2]*e[7]-e[13]*e[3]*e[6],t[6]=-e[0]*e[6]*e[15]+e[0]*e[7]*e[14]+e[4]*e[2]*e[15]-e[4]*e[3]*e[14]-e[12]*e[2]*e[7]+e[12]*e[3]*e[6],t[10]=e[0]*e[5]*e[15]-e[0]*e[7]*e[13]-e[4]*e[1]*e[15]+e[4]*e[3]*e[13]+e[12]*e[1]*e[7]-e[12]*e[3]*e[5],t[14]=-e[0]*e[5]*e[14]+e[0]*e[6]*e[13]+e[4]*e[1]*e[14]-e[4]*e[2]*e[13]-e[12]*e[1]*e[6]+e[12]*e[2]*e[5],t[3]=-e[1]*e[6]*e[11]+e[1]*e[7]*e[10]+e[5]*e[2]*e[11]-e[5]*e[3]*e[10]-e[9]*e[2]*e[7]+e[9]*e[3]*e[6],t[7]=e[0]*e[6]*e[11]-e[0]*e[7]*e[10]-e[4]*e[2]*e[11]+e[4]*e[3]*e[10]+e[8]*e[2]*e[7]-e[8]*e[3]*e[6],t[11]=-e[0]*e[5]*e[11]+e[0]*e[7]*e[9]+e[4]*e[1]*e[11]-e[4]*e[3]*e[9]-e[8]*e[1]*e[7]+e[8]*e[3]*e[5],t[15]=e[0]*e[5]*e[10]-e[0]*e[6]*e[9]-e[4]*e[1]*e[10]+e[4]*e[2]*e[9]+e[8]*e[1]*e[6]-e[8]*e[2]*e[5];let a=e[0]*t[0]+e[1]*t[4]+e[2]*t[8]+e[3]*t[12];return a?t.map(s=>s/a):null}function Fv(e,t){let a=new Map((t||[]).map(s=>[Number(s.id),s]));for(let s of e||[]){let n=a.get(Number(s.layerId));if(s.kind!=="copper"||!n||!s.quantMin||!s.quantSize)continue;let r=s.quantSize[2]===1;return s.quantMin[2]+(r?0:s.quantSize[2]/2)-Number(n.z_mm||0)/1e3}return 0}async function Ef({renderer:e,layers:t,colorFor:a,bytes:s,wasm:n,toleranceNm:r}){let i=await uf(s,{wasm:n}),o=Fv(e.entries,t),{planned:c,unmatched:l}=hf(i.header,t,o),f=new Map(t.map(y=>[Number(y.id),y])),d=performance.now(),h=new Map;for(let y of c)h.has(y.key)||h.set(y.key,i.lowerSlice(y.key,r));let g=c.map(y=>({...y,color:y.role==="copper"?a(f.get(y.layerId)):[1,1,1,1],lowered:h.get(y.key)})),p=performance.now()-d,u=new er(e);return u.setSlices(g),u.setBarrels(gf(i.header,i.barrels(),g)),u.setWalls(mf(g,h,t,o)),e.setAnalytic(u),{pack:i,analytic:u,unmatched:l,lowerMs:p,zOffset:o,operations:ff(i.header),overlay:null}}function Tf(e,t){if(!t)return e.analytic.clearOverlay(),e.overlay=null,null;if(t.kind==="operation_values"){let a=bf(t.values,e.operations),s=t.range||Zn(a);e.analytic.setOperationValues(a,s),e.overlay={...t,values:a,range:s}}else if(t.kind==="field_tiles"){let a=pf(t.tiles),s=t.range||Zn([...a.values()].flatMap(n=>[...Zn(n.values)]));e.analytic.setFieldRasters(a,s),e.overlay={...t,range:s,slices:[...a.keys()]}}else throw new TypeError(`unknown analytic overlay kind ${t.kind}`);return{kind:t.kind,range:e.overlay.range}}function Sf(e,t){let a=e.overlay,s=a?.kind==="operation_values"?a.values[t]:void 0;return{operationIndex:t,binding:e.pack.binding(t),...Number.isFinite(s)?{value:s,quantity:a.quantity,units:a.units}:{}}}var If=512*1024*1024,Ov=.65,Pv=1.5,jv=15e3,Lv=120,Dv=12,Uv=48,zf=230,Mo=document,kt,j,Fe,cr,lr,dr,Ba,Mr,bt,ar,Es,ft,st,ve,De,sr,ur,Ts,Ce,te,kr,Er,Le,Ra,da,$e,Mt,fr,_a,Y=e=>Mo.querySelector(e),la=e=>Mo.querySelectorAll(e);function Kf(e=document){Mo=e,kt=Y("#app"),j=Y("#viewport"),Fe=Y("#schematic-viewport"),cr=Y("#schematic-dom-layer"),lr=Y("#schematic-flow-overlay"),dr=Y("#bom-view"),Ba=Y("#status")||{set textContent(t){}},Mr=Y("#viewer-kind")||{set textContent(t){}},bt=Y("#selection")||{set textContent(t){}},ar=Y("#diagnostics")||{set innerHTML(t){}},Es=Y("#scene-stats"),ft=Y("#lod-tuning"),st=Y("#layers"),ve=Y("#search-controls"),De=Y("#view-controls"),Le=Y("#stackup-workspace-view"),sr=Y("#fallback"),ur=Y("#panel-labels"),Ts=Y("#schematic-labels"),Ce=Y("#axis-gizmo"),te=Y("#selection-card"),kr=Y("#primary-heading"),Er=Y("#primary-description"),Ra=Y("#mode-switch"),da=Y("#system-labels"),$e=Y("#move-gizmo"),Mt=Y("#system-help"),fr=Y("#system-harnesses"),_a=Y("#harness-nodes"),_a?.addEventListener("pointermove",t=>Ph(t)),_a?.addEventListener("pointerup",t=>jh(t)),kt.classList.add("workspace-pcb")}function Vf(){return{workspace:"pcb",mode:"3d",activeNetId:0,selectedFeatureId:0,selectedOccurrence:0,selectionAnchor:null,showBoard:!0,showComponents:!0,showPlaceholders:!0,realisticColors:!0,isolateNet:!1,savedShowBoard:!0,savedShowComponents:!0,preIsolationShowBoard:null,separation:0,dragging:!1,dragMode:"orbit",lastX:0,lastY:0,pointerStartX:0,pointerStartY:0,frameCpuMs:0,frameCpuP95Ms:0,frameIntervalMs:0,frameIntervalP95Ms:0,frameSamples:[],fps:0,frames:0,fpsAt:performance.now(),activeTab:"layers",selectedPageId:"",selectedSchematicFeature:null,schematicDragging:!1,schematicLastX:0,schematicLastY:0,schematicStartX:0,schematicStartY:0}}function _s(e={}){return{key:e.key??"board",topology:e.topology||window.__TOPOLOGY__||{},semanticGeometry:e.semanticGeometry||window.__SEMANTIC_GEOMETRY__||{},viewerReadiness:e.readiness||{stage:"semantic-ready",progress:100},assetCache:e.assetCache||null,deferComponents:!!e.deferComponents,scene:Gv(),renderer:null,compareLayers:new Set,desiredCompareLayers:new Set,visible3dLayers:new Set,preIsolation3dLayers:null,preIsolationCompareLayers:null,highlightedNetIds:new Set,hiddenComponents:new Set,hiddenComponentRequest:null,loadedBytes:0,triangles:0,residentTileBytes:0,residentTileGpuBytes:0,residentTileTriangles:0,tileLoads:0,tileEvictions:0,tileSchedulerMs:0,lastTileScheduleAt:0,visibleTileIds:new Set,gpuBytes:0}}function Gv(){return{manifest:null,manifestUrl:"",layers:[],copperLayers:[],nets:[],features:new Map,tiles:new Map,loaded:new Set,loading:new Map,failed:new Map,residentTiles:new Map,componentFeatures:new Map,componentModelCounts:new Map,componentTier:"idle",componentEntries:[],componentsWantedAt:0,componentEvictions:0,runtimeBounds:null,layerZOffsets:new Float32Array(256),layerZOffsetSignature:""}}function Hf(){return{key:"",started:0,from:new Map,current:new Map}}function qf(){return{phase:"idle",previous:new Set,target:new Set,previousOffsets:new Map,started:0}}function Xf(){return{manifest:null,manifestUrl:"",pages:[],byId:new Map,activeNetUid:"",visiblePages:[],fitted:!1,rendererMode:new URLSearchParams(location.search).get("schematicRenderer")||"svg-dom",domFallbackReason:""}}var w=Vf(),k=_s(),v=null,Ae=Hf(),X=qf(),D=Xf(),hr=[],zv=5e3,Kv=5e3,N,Z,nt,U,Q,ua=new Map,Yt=performance.now(),we=0,nr=0,Ns=null,br=null,pr=null,io=!1,ze=!1,Tr=()=>!0,Ss=!0;!window.__PRISM_SEMANTIC_VIEWER_MANUAL_BOOT__&&document.getElementById("app")&&Eo().catch(e=>{console.error(e),Ba&&(Ba.textContent="Renderer failed"),sr&&(sr.hidden=!1,sr.textContent=e.stack||e.message||String(e))});function Wf(e){let t=new Map((e.components||[]).map(s=>[s.uid,s])),a={};for(let s of e.terminals||[]){let n=s.net_uid;if(!n)continue;let r=t.get(s.component_uid)||{},i={designator:s.designator||r.designator||"",pin:s.pin||"",value:r.value||"",pcb_pad_id:s.pcb_pad_id||"",pcb_pad_source_uid:s.pcb_pad_source_uid||""};a[n]||(a[n]={terminals:[]});let o=a[n].terminals;o.some(c=>c.designator===i.designator&&c.pin===i.pin)||o.push(i)}return a}function Vv(e,t=k){if(!e||!t.scene?.features)return 0;let a=e.pcb_pad_source_uid||"";if(!a&&e.pcb_pad_id&&(a=(t.topology?.physical_objects||[]).find(n=>n.uid===e.pcb_pad_id)?.source_ids?.[0]||""),!a)return 0;for(let[s,n]of t.scene.features.entries())if(n.sourceUid===a&&n.kind==="pad")return s;return 0}function ko(e,t=k){return!e||!t.topology||!t.topology.components?null:t.topology.components.find(a=>a.designator===e)}function tr(e,t){for(let a of Object.keys(e))delete e[a];Object.assign(e,t)}function $f(){if(nr&&(cancelAnimationFrame(nr),nr=0),window.removeEventListener("keydown",bb),v){for(let e of v.boards.values())e.abort?.abort();v.scene.dispose(),v=null}else lo(),k.renderer?.dispose?.();k.renderer=null,N=null,Z?.dispose?.(),Z=null,nt=null,Ns=null,Tr=()=>!0,Ss=!0}function Yf(){return we+=1,$f(),tr(w,Vf()),k=_s(),tr(Ae,Hf()),tr(X,qf()),tr(D,Xf()),hr=[],U=null,Q=null,ua=new Map,Yt=performance.now(),we}function Jf(e){e===we&&(we+=1,$f())}function Is(e){e===we&&(nr=requestAnimationFrame(t=>c1(t,e)))}function he(e){return e===we}async function Eo(e={}){let t=Yf(),a={};if(k.topology=e.topology||window.__TOPOLOGY__||{},k.topology&&!k.topology.net_details&&(k.topology.net_details=Wf(k.topology)),k.semanticGeometry=e.semanticGeometry||window.__SEMANTIC_GEOMETRY__||{},k.viewerReadiness=e.readiness||k.semanticGeometry.readiness||{stage:"semantic-ready",progress:100},Ns=typeof e.onSelectionChange=="function"?e.onSelectionChange:null,pr=typeof e.onContextMenu=="function"?e.onContextMenu:null,br=typeof e.onViewStateChange=="function"?e.onViewStateChange:null,Tr=typeof e.isActive=="function"?e.isActive:()=>!0,Ss=e.workspaceScope!=="3d",k.assetCache=e.assetCache||null,w.gpuBudgetBytes=$n,Kf(e.root||document),!kt||!j)throw new Error("Semantic viewer shell is missing required DOM nodes");return await Xv(t,a,e.onPerformanceEvent),{performance:a,...Qf(),selectOccurrence:qv,setHighlightedNetIds(s){k.highlightedNetIds=s,k.renderer?.setEmphasizedNetIds(s)},refreshResidency(){Me(performance.now(),{force:!0})},resize(){k.renderer?.resize(),N?.resize(),w.workspace==="pcb"&&w.mode==="layer"&&Uo()},setWorkspace(s){let n=s==="stackup"?"stackup":"pcb";w.workspace!==n&&lb(n)},setHiddenComponents:ob,getComponentReferences(){return[...k.scene.componentFeatures.keys()]},async loadAnalyticPack(s,n={}){return k.renderer?(lo(),k.analytic=await Ef({renderer:k.renderer,layers:k.scene.layers,colorFor:r=>{let i=Do(r,k);return i.length>=4?i.slice(0,4):[...i,1]},bytes:s,wasm:n.wasm,toleranceNm:n.toleranceNm}),Af()):null},setAnalyticOverlay(s){return k.analytic?Tf(k.analytic,s):null},async analyticAt(s,n){if(!k.analytic)return null;let r=await fb(s,n);return r?.kind==="analytic"?Sf(k.analytic,r.operationIndex):null},analyticStats:Af,unloadAnalyticPack(){lo()},setLodOverride(s){k.renderer?.setLodOverride(s)},projectComponent(s){return hb(k,s,n=>xo(n,Wt))},projectPoint(s){return xo(s,Wt)},setViewMode:Zh,renderInset:d1,insetReady:qh,releaseInset(s){Rs.release(s)},insetBoard:()=>({scene:k.scene,topology:k.topology}),onSceneChange(s){return xr.add(s),()=>xr.delete(s)},insetStats(){return{...rr,views:Rs.size,targets:[se.width,se.height]}},insetSettings(s){return Object.assign(yo,s||{}),{...yo}},gpuIdle(){return k.renderer?.device.queue.onSubmittedWorkDone()??Promise.resolve()},dispose(){Hv(),Jf(t)}}}function Af(){let e=k.analytic;return e?{operations:e.operations,lowerMs:e.lowerMs,zOffset:e.zOffset,unmatched:e.unmatched,...e.analytic.stats()}:null}function lo(){k.renderer?.setAnalytic(null),k.analytic?.pack.free(),k.analytic=null}function Qf(){return{nets:()=>k.scene.nets,quietly(e){ze=!0;try{e()}finally{ze=!1}},selectNet:Vo,selectFeature:ga,selectComponent:Ho,clearSelection:Oe,anyEmphasis:La,showNetProbe:So,restoreVisibility:sh,isolating:()=>w.isolateNet,isolateLitNets:Pa,setNetIsolation:Ua,setGpuBudget(e){w.gpuBudgetBytes=e;for(let t of v?v.boards.values():[k])t.tiersCheckedAt=0},setStatsOverlay:gh,stats:ph,pickAt(e,t){return fb(e,t)},getViewState:Zf,setLayerVisible:eb,applyLayerPreset:tb,setShowBoard:ab,setShowComponents:sb,setShowPlaceholders:S1,setRealisticColors:I1,setSeparation:nb,showNetLayers:Ko}}function Hv(){se.depth?.destroy(),Object.assign(se,{canvas:null,context:null,depth:null,depthView:null,width:0,height:0}),Rs.clear(),xr.clear(),Na=null}function Qt(){!br||io||(io=!0,queueMicrotask(()=>{io=!1,br?.(Zf())}))}function Zf(){let e=w.mode==="3d"?k.visible3dLayers:k.desiredCompareLayers;return{mode:w.mode,layers:k.scene.copperLayers.map(t=>({id:Number(t.id),name:String(t.name),color:$o(Cr(t)),visible:e.has(Number(t.id))})),showBoard:w.showBoard,showComponents:w.showComponents,showPlaceholders:w.showPlaceholders,realisticColors:w.realisticColors,separation:v?v.separation.get(As())||0:w.separation,isolateNet:w.isolateNet,hasNet:!!w.activeNetId||La(),...v?{boards:Rw(),selectedBoard:As()}:{}}}function Sr(e){if(v?.move.enabled&&Cs(),ze)return;let t=k.renderer&&!k.renderer.identityOnly?k.renderer.occurrenceKeys[w.selectedOccurrence]:null;Ns?.(e&&t!=null?{...e,occurrence:t}:e)}function qv(e){let t=k.renderer?.occurrenceKeys.indexOf(String(e))??-1;t>=0&&(w.selectedOccurrence=t)}function To(e){if(!e||!k.renderer||k.renderer.identityOnly)return e;let t=k.renderer.occurrenceMatrices[w.selectedOccurrence];return t?yt(t,e):e}function eh(e,t=null){return e?{kind:"net",sourceContext:"3D",netName:String(e.name||""),netUid:String(e.uid||"")||void 0,netCode:Number(e.id||0)||void 0,featureId:Number(t?.id||0)||void 0,uuid:String(t?.sourceUid||"")||void 0}:null}function th(e,t=k){if(!e)return null;let a=ja(e),s=String(e.padNumber||e.pin||e.pinNumber||""),n=t.scene.nets.find(r=>Number(r.id)===Number(e.netId||0));if(a&&s)return{kind:"terminal",sourceContext:"3D",reference:a,pin:s,netUid:n?.uid,netName:n?.name,netCode:n?Number(n.id):void 0,uuid:String(e.sourceUid||"")||void 0,featureId:Number(e.id||0)||void 0};if(a){let r=ko(a,t);return{kind:"component",sourceContext:"3D",reference:a,componentUid:r?.uid,uuid:String(e.sourceUid||"")||void 0,featureId:Number(e.id||0)||void 0}}return eh(n,e)}function ah(){w.showBoard=!0,w.showComponents=!0,pa(),typeof Pe=="function"&&Pe()}function La(){return Ca().size>0||!!v?.emphasisSets.length}function Ca(){let e=new Set(k.highlightedNetIds);return w.activeNetId&&e.add(Number(w.activeNetId)),e}function So(){(w.showBoard||w.showComponents)&&(w.savedShowBoard=w.showBoard,w.savedShowComponents=w.showComponents),w.showBoard=!1,w.showComponents=!1,pa(),typeof Pe=="function"&&Pe()}function sh(){w.showBoard=w.savedShowBoard!==!1,w.showComponents=w.savedShowComponents!==!1,pa(),typeof Pe=="function"&&Pe()}async function nh(e,t,a={}){let s=e.semanticGeometry.assets?.scene_manifest||e.semanticGeometry.semantic_gltf?.path,n=performance.now();if(s){if(e.scene.manifestUrl=new URL(s,location.href).toString(),e.scene.manifest=await Yv(e.scene.manifestUrl,e),a.scene_manifest_fetch_parse_ms=performance.now()-n,!he(t))return!1;if(e.scene.manifest.schema!=="prism.semantic_gltf_a0")throw new Error(`Unsupported scene schema: ${e.scene.manifest.schema}`)}else e.scene.manifest={schema:"prism.semantic_gltf_partial.a0",bbox:null,layers:[],nets:[],objectFeatures:[],components:[],tiles:[],barrels:[]},a.scene_manifest_fetch_parse_ms=0;n=performance.now(),e.scene.layers=e.scene.manifest.layers||[],e.scene.copperLayers=e.scene.layers.filter(i=>i.role==="copper"||String(i.name).endsWith(".Cu")),e.scene.nets=e.scene.manifest.nets||[];for(let i of e.scene.manifest.objectFeatures||[])e.scene.features.set(Number(i.id),{...i,bounds:Va(i.boundsMm)});for(let i of e.scene.manifest.components||[])e.scene.componentFeatures.set(i.designator,i),e.scene.features.set(Number(i.featureId),{...i,kind:"component",sourceUid:i.uid,netId:0,bounds:null});for(let i of e.scene.manifest.tiles||[])e.scene.tiles.set(i.id,i);a.scene_manifest_index_ms=performance.now()-n;let r=ch(e);for(let i of r)e.compareLayers.add(i),e.desiredCompareLayers.add(i);for(let i of e.scene.copperLayers)e.visible3dLayers.add(Number(i.id));return!0}async function Xv(e,t={},a=null){let s=performance.now();if(!await nh(k,e,t))return;let n=performance.now();if(k.renderer=await ia.create(j),t.webgpu_renderer_create_ms=performance.now()-n,!he(e)){k.renderer?.dispose?.(),k.renderer=null;return}k.renderer.setBarrels(yi(k.scene.manifest.barrels,k.scene.manifest.layers)),Ps(),n=performance.now();let r=await hh(e);if(t.board_fetch_parse_upload_ms=performance.now()-n,!he(e)||(k.scene.runtimeBounds=r||qs(k.scene.manifest.bbox),U=new Ga(k.scene.runtimeBounds),Ss&&(await Wv(e),!he(e)||(await $v(e),!he(e)))))return;n=performance.now(),Go(),cb(),Ss&&(P1(),O1()),rb(),gb(),t.controls_and_bindings_ms=performance.now()-n;let i={"board-ready":"Board ready \xB7 components and semantic layers are still generating","components-ready":"Board and components ready \xB7 semantic layers are still generating","semantic-ready":"WebGPU semantic glTF active"};if(Ba.textContent=i[k.viewerReadiness.stage]||"Loading 3D assets",k.semanticGeometry.assets?.components_glb&&!k.deferComponents){let o=performance.now();Uh(e).then(()=>{he(e)&&(mo(r),a?.({schema:"prism.semantic_viewer_performance.a0",milestone:"components-loaded",readiness_stage:k.viewerReadiness.stage,elapsed_ms:performance.now()-o,bytes_loaded:k.loadedBytes}))})}else mo(r);Me(performance.now(),{force:!0}),Is(e),n=performance.now(),await new Promise(o=>requestAnimationFrame(o)),t.first_frame_wait_ms=performance.now()-n,t.boot_total_ms=performance.now()-s}async function Wv(e=we){let t=k.semanticGeometry.assets?.schematic_native_manifest||k.semanticGeometry.schematic_vector?.path||k.semanticGeometry.schematic_scene?.path,a=k.semanticGeometry.assets?.schematic_manifest||k.semanticGeometry.schematic_world?.path,s=Y("[data-workspace=schematic]");if(!t&&!a){s.disabled=!0,s.title="No schematic world assets are available";return}let n=[t,a].filter(Boolean),r=null;for(let o of n)try{D.manifestUrl=new URL(o,location.href).toString();let c=await Nn.create(Fe,D.manifestUrl);if(!he(e))return;N=c,N.setFlowOverlayCanvas(lr);break}catch(c){if(r=c,N=null,o===a)throw c}if(!N)throw r||new Error("Failed to load schematic viewer assets");D.manifest=N.manifest,D.pages=N.pages,D.byId=new Map(D.pages.map(o=>[o.id,o])),w.selectedPageId=D.pages[0]?.id||"",N.selectedPageId=w.selectedPageId,!["native","legacy","webgpu"].includes(String(D.rendererMode).toLowerCase())&&(Z=Fn.create(cr,D.manifestUrl,D.manifest,N.featuresByPage,{onSelect:k1,onBlank:Os,onHighlightNet:Jh,onOpenPage:w1,onFallback:o=>{D.domFallbackReason=o,console.warn(o)}}),Z.preloadPages(D.pages)),N.preloadOverview()}async function $v(e=we){let t=k.semanticGeometry.assets?.bom||k.semanticGeometry.bom?.path,a=Y("[data-workspace=bom]");if(!t){a&&(a.disabled=!0,a.title="No BoM artifact is available");return}try{let s=await Hs.create(dr,new URL(t,location.href).toString(),{onSelectReference:n=>Ho(n,!0)});if(!he(e))return;nt=s}catch(s){if(!he(e))return;console.warn(s),a&&(a.disabled=!0,a.title=s?.message||"BoM artifact could not be loaded")}}async function Yv(e,t=k){if(t.assetCache)return t.assetCache.fetchJson(String(e));let a=await fetch(e,{cache:"default"});if(!a.ok)throw new Error(`Failed to load ${e}: ${a.status}`);return a.json()}function Jv(){return!v||v.timing.boardsDrawnAt!=null?!0:![...v.boards.values()].some(e=>e.loadState==="loading"||e.loadState==="waiting")}var Qv=24*1024*1024,ca={bytes:0,waiting:null};async function rh(e){for(;;){if(ca.bytes===0||ca.bytes+e<=Qv){ca.bytes+=e,ca.waiting??=new Promise(t=>requestAnimationFrame(()=>{ca.bytes=0,ca.waiting=null,t()}));return}await ca.waiting}}async function Zv(e,t=we,a=k){if(!he(t))return;let s=a.scene.residentTiles.get(e.id);if(s){s.lastUsed=performance.now();return}if(a.scene.failed.get(e.id))return;if(a.scene.loading.has(e.id))return a.scene.loading.get(e.id);let r=(async()=>{try{let i=await Ya(new URL(e.path,a.scene.manifestUrl).toString(),{fetchBytes:yr(a),fetchCache:"no-store"});if(!he(t)||!a.renderer||(await rh(i.primitives.reduce((h,g)=>h+uo(g),0)),!he(t)||!a.renderer))return;a.loadedBytes+=i.byteLength;let o=a.scene.layers.find(h=>Number(h.id)===Number(e.layerId)),c=[],l=0,f=0;for(let h of i.primitives){let g=a.renderer.addPrimitive(h,{kind:"copper",tileId:e.id,layerId:Number(e.layerId),innerCopper:Ir(Number(e.layerId),a),color:Do(o,a),stencilMark:Kh(o,a),baseZ:Number(o?.z_mm||0)/1e3,material:{baseColor:[1,1,1,1],metallic:.78,roughness:.32}});c.push(g),l+=h.indices.length/3,f+=uo(h)}let d={tile:e,entries:c,byteLength:i.byteLength,gpuBytes:f,triangles:l,lastUsed:performance.now(),pinned:!1};a.scene.residentTiles.set(e.id,d),a.scene.loaded.add(e.id),a.tileLoads+=1,a.residentTileBytes+=i.byteLength,a.residentTileGpuBytes+=f,a.residentTileTriangles+=l,a.triangles=a.residentTileTriangles,a.scene.failed.delete(e.id)}catch(i){if(!he(t))return;let o=a.scene.failed.get(e.id)||{count:0,message:""};a.scene.failed.set(e.id,{count:o.count+1,message:i?.message||String(i)}),o.count||console.warn(`Failed to load tile ${e.id}; suppressing retries until assets are regenerated`,i)}finally{he(t)&&a.scene.loading.delete(e.id)}})();return a.scene.loading.set(e.id,r),r}function uo(e){return Nd(e.position.length/3,e.indices.length)}function Io(e,t=k){let a=t.scene.residentTiles.get(e);a&&(t.renderer.removeEntries(a.entries),t.scene.residentTiles.delete(e),t.scene.loaded.delete(e),t.residentTileBytes=Math.max(0,t.residentTileBytes-a.byteLength),t.residentTileGpuBytes=Math.max(0,t.residentTileGpuBytes-a.gpuBytes),t.residentTileTriangles=Math.max(0,t.residentTileTriangles-a.triangles),t.triangles=t.residentTileTriangles,t.tileEvictions+=1)}function Me(e=performance.now(),t={},a=k){if(!a.renderer||!U||w.workspace!=="pcb")return;let s=w.mode==="layer"&&X.phase==="preload";if(!t.force&&!s&&e-a.lastTileScheduleAt<Lv)return;let n=performance.now();a.lastTileScheduleAt=e;let r=ew(a);a.visibleTileIds=r;let i=a.scene.loading.size,c=Math.max(0,(s?Uv:Dv)-i),l=[...r].map(d=>a.scene.tiles.get(d)).filter(d=>d&&!a.scene.residentTiles.has(d.id)&&!a.scene.loading.has(d.id)&&!a.scene.failed.has(d.id)).sort((d,h)=>_f(d,a)-_f(h,a)).slice(0,c),f=we;for(let d of l)Zv(d,f,a);for(let d of r){let h=a.scene.residentTiles.get(d);h&&(h.lastUsed=e)}dh(r,void 0,a),sw(r,e,a),aw(r,e,a),a.tileSchedulerMs=performance.now()-n}function ew(e=k){let t=new Set,a=w.mode==="3d"?e.visible3dLayers:nw();if(!a.size||!Q)return t;if(w.mode==="layer"){for(let c of e.scene.tiles.values())a.has(Number(c.layerId))&&t.add(c.id);return t}let s=new Set,n=No(e);if(n.size){for(let c of e.scene.tiles.values())if(a.has(Number(c.layerId))){for(let l of n)if(fh(c,l)){s.add(c.id);break}}}let r=Ao(e),i=[Q.matrix,...tw(),...e===k?Rs.active(performance.now()):[]],o=0;for(let c of e.scene.tiles.values()){if(!a.has(Number(c.layerId))||r&&Ir(Number(c.layerId),e))continue;let l=w.mode==="layer"?ua.get(Number(c.layerId)):null;i.some(f=>gr(c,f,l,Ov,e))&&t.add(c.id),!e.scene.residentTiles.has(c.id)&&gr(c,Q.matrix,l,0,e)&&(o+=1)}for(let c of s)t.add(c);return e.visibleTileMisses=o,t}function tw(){if(!U?.moving?.()||w.mode==="layer")return[];let e=performance.now();return Ms.at===e||(Ms.at=e,Ms.views=[0,1].map(t=>U.targetMatrix(j.width,j.height,!1,t))),Ms.views}var Ms={at:-1,views:[]};function aw(e,t,a){if(w.mode==="layer"||!Q)return;let s=Ao(a);for(let n of[...a.scene.residentTiles.values()]){if(e.has(n.tile.id)||a.scene.loading.has(n.tile.id))continue;let r=Number(n.tile.layerId);if(a.visible3dLayers.has(r)&&!(s&&Ir(r,a))&&gr(n.tile,Q.matrix,null,Pv,a)){n.lastUsed=t;continue}t-n.lastUsed>jv&&Io(n.tile.id,a)}}function ih(e,t){return e?"all":t?"lit":"none"}function Ao(e){return!!e.renderer&&e.renderer.innerCopperMode!=="all"}function sw(e,t,a){if(Ao(a))for(let s of[...a.scene.residentTiles.values()])e.has(s.tile.id)||a.scene.loading.has(s.tile.id)||Ir(Number(s.tile.layerId),a)&&t-s.lastUsed>Kv&&Io(s.tile.id,a)}function nw(){return w.mode!=="layer"||X.phase==="idle"?k.compareLayers:lh(X.previous,X.target)}function oh(){return w.mode!=="layer"?k.visible3dLayers:X.phase==="reveal"?lh(X.previous,X.target):k.compareLayers}function ch(e=k){let t=e.scene.copperLayers.map(a=>Number(a.id)).filter(Number.isFinite);return t.length?t.length===1?new Set([t[0]]):new Set([t[0],t[t.length-1]]):new Set}function rw(){let e=k.desiredCompareLayers.size?k.desiredCompareLayers:k.compareLayers;return e.size?new Set([...e].map(Number)):ch()}function lh(...e){let t=new Set;for(let a of e)for(let s of a||[])t.add(Number(s));return t}function dh(e,t=If,a=k){if(w.mode==="layer")return;let s=Math.min(If,t);if(a.residentTileGpuBytes<=s)return;let n=[...a.scene.residentTiles.values()].filter(r=>!e.has(r.tile.id)&&!a.scene.loading.has(r.tile.id)).sort((r,i)=>r.lastUsed-i.lastUsed);for(let r of n){if(a.residentTileGpuBytes<=s)break;Io(r.tile.id,a)}}function gr(e,t,a=null,s=0,n=k){let r=uh(e,n);if(!r)return!0;let i=Math.max(r[3]-r[0],r[4]-r[1])*s,o=[r[0]-i+(a?.[0]||0),r[1]-i+(a?.[1]||0),r[2]-.002,r[3]+i+(a?.[0]||0),r[4]+i+(a?.[1]||0),r[5]+.002],c=n.renderer?.occurrenceMatrices;return!c||c.length===1&&pn(c[0])?Rf(o,t):c.some(l=>Rf(o,ea(t,l)))}function uh(e,t=k){let a=e.boundsMm;if(!a||a.length!==4)return null;let s=t.scene.layers.find(r=>Number(r.id)===Number(e.layerId)),n=Number(s?.z_mm||0)/1e3;return[a[0]/1e3,-a[3]/1e3,n-4e-4,a[2]/1e3,-a[1]/1e3,n+4e-4]}function Rf(e,t){let a=[[e[0],e[1],e[2]],[e[3],e[1],e[2]],[e[0],e[4],e[2]],[e[3],e[4],e[2]],[e[0],e[1],e[5]],[e[3],e[1],e[5]],[e[0],e[4],e[5]],[e[3],e[4],e[5]]].map(n=>iw(t,n));return![n=>n[0]<-n[3],n=>n[0]>n[3],n=>n[1]<-n[3],n=>n[1]>n[3],n=>n[2]<0,n=>n[2]>n[3]].some(n=>a.every(n))}function iw(e,t){let a=t[0],s=t[1],n=t[2];return[e[0]*a+e[4]*s+e[8]*n+e[12],e[1]*a+e[5]*s+e[9]*n+e[13],e[2]*a+e[6]*s+e[10]*n+e[14],e[3]*a+e[7]*s+e[11]*n+e[15]]}function fh(e,t){return Array.isArray(e.netIds)&&e.netIds.some(a=>Number(a)===Number(t))}function _f(e,t=k){let a=uh(e,t);if(!a||!U)return 0;let s=(a[0]+a[3])*.5-U.focus[0],n=(a[1]+a[4])*.5-U.focus[1];return s*s+n*n}async function hh(e=we,t=k){let a=t.semanticGeometry.assets?.base_board_glb;if(!a)return null;let s=t.semanticGeometry.assets?.soldermask_glb,[n,r]=await Promise.all([Ya(new URL(a,location.href).toString(),{defaultFeatureId:0,fetchBytes:yr(t)}),s?Ya(new URL(s,location.href).toString(),{defaultFeatureId:0,fetchBytes:yr(t)}).catch(o=>(console.warn("[prism-semantic-viewer] solder mask failed to load",o),null)):null]);if(!he(e)||!t.renderer)return null;t.loadedBytes+=n.byteLength,r&&(t.loadedBytes+=r.byteLength);let i=[...n.primitives.filter(o=>{let c=Kr(o);return c!=="pad"&&!(r&&c==="soldermask")}),...r?.primitives||[]];for(let o of Ka(i,Kr))t.renderer.addPrimitive(o,{kind:"board",boardRole:o.groupKey,layerId:o.groupKey==="paste"?a1(o,t):0,material:o.material,color:o.material.baseColor});return ya(i.map(o=>o.bounds))}function fa(e=k){return e.scene.runtimeBounds||qs(e.scene.manifest?.bbox)}function Ir(e,t=k){return nc(e,t.scene.copperLayers)}function bh(e,t){let{back:a}=U.basis();return{eye:Ee(U.focus,pe(a,U.distance)),orthographic:t,pixelScale:t?e/Math.max(1e-9,U.orthoScale):e/2/Math.tan(U.fov/2)}}function ph(){if(v)return ow();let e=k.renderer?.cullCounts||{full:0,board:0,body:0,box:0,culled:0},t=!k.renderer||k.renderer.identityOnly;return{occurrences:k.renderer?.occurrenceMatrices.length||0,lod:t?{full:1,board:0,body:0,box:0,culled:0}:{...e},triangles:k.renderer?.frameStats.triangles||0,draws:k.renderer?.frameStats.draws||0,gpuMemoryBytes:k.renderer?.gpuMemoryBytes()||0,gpuBreakdown:k.renderer?.gpuMemoryBreakdown()||null,gpuBudgetBytes:w.gpuBudgetBytes,componentTier:k.scene.componentTier,componentEvictions:k.scene.componentEvictions,tileEvictions:k.tileEvictions,visibleTileMisses:k.visibleTileMisses||0,cache:k.assetCache?k.assetCache.summary():{enabled:!1},frameIntervalMs:w.frameIntervalMs,frameIntervalP95Ms:w.frameIntervalP95Ms,frameCpuMs:w.frameCpuMs,frameCpuP95Ms:w.frameCpuP95Ms,fps:w.fps}}function ow(){let e=rt(),t=e.map(a=>a.scene.componentTier);return{occurrences:v.scene.occurrenceCount||0,lod:v.scene.cullCounts(),triangles:v.scene.frameStats.triangles,draws:v.scene.frameStats.draws,gpuMemoryBytes:v.scene.gpuMemoryBytes(),gpuBreakdown:v.scene.gpuMemoryBreakdown(),gpuBudgetBytes:w.gpuBudgetBytes,componentTier:`${t.filter(a=>a==="loaded").length}/${e.length} loaded`,componentEvictions:e.reduce((a,s)=>a+s.scene.componentEvictions,0),tileEvictions:e.reduce((a,s)=>a+s.tileEvictions,0),visibleTileMisses:e.reduce((a,s)=>a+(s.visibleTileMisses||0),0),componentMisses:e.filter(a=>a.renderer.cullCounts.full>0&&a.scene.componentTier!=="loaded"&&a.semanticGeometry.assets?.components_glb).length,cache:e.find(a=>a.assetCache)?.assetCache.summary()||{enabled:!1},frameIntervalMs:w.frameIntervalMs,frameIntervalP95Ms:w.frameIntervalP95Ms,frameCpuMs:w.frameCpuMs,frameCpuP95Ms:w.frameCpuP95Ms,fps:w.fps,firstFrame:v.timing.boardsDrawnAt==null?null:{sinceSceneMs:v.timing.boardsDrawnAt-v.timing.descriptorAt,sinceNavigationMs:v.timing.boardsDrawnAt}}}function gh(e){w.showStats=!!e,Es&&(Es.hidden=!w.showStats),ft&&(ft.hidden=!(w.showStats&&v)),w.showStats&&v&&uw(),mh()}var fo="prism.systemScene.lodThresholds",cw=Object.freeze([{key:"fullPx",label:"Parts",max:600},{key:"boardPx",label:"Copper",max:400},{key:"boxPx",label:"Box below",max:120}]);function lw(){try{let e=JSON.parse(globalThis.localStorage?.getItem(fo)||"null");if(e&&typeof e=="object")return wa(e)}catch{}return{...at}}function dw(e){try{e?globalThis.localStorage?.setItem(fo,JSON.stringify(e)):globalThis.localStorage?.removeItem(fo)}catch{}}function ho(e){if(!v)return null;let t=e==null?{...at}:{...v.scene.lodThresholds,...e},a=v.scene.setLodThresholds(t);return dw(e==null?null:a),bo(),a}function uw(){if(!ft||ft.childElementCount)return bo();let e=document.createElement("h2");e.textContent="Detail thresholds (CSS px)",ft.append(e);for(let a of cw){let s=document.createElement("label"),n=document.createElement("span");n.textContent=a.label;let r=document.createElement("input");Object.assign(r,{type:"range",min:"0",max:String(a.max),step:"1"}),r.dataset.key=a.key;let i=document.createElement("output");r.addEventListener("input",()=>ho({[a.key]:Number(r.value)})),s.append(n,r,i),ft.append(s)}let t=document.createElement("button");t.type="button",t.textContent="Defaults",t.addEventListener("click",()=>ho(null)),ft.append(t),bo()}function bo(){if(!ft||!v)return;let e=v.scene.lodThresholds;for(let t of ft.querySelectorAll("input[data-key]"))t.value=String(e[t.dataset.key]),t.nextElementSibling.value=String(Math.round(e[t.dataset.key]))}function mh(){if(!Es||!w.showStats)return;let e=ph(),{full:t,board:a,body:s,box:n,culled:r}=e.lod,i=[["Occurrences",`${e.occurrences} (${t+a+s+n} visible)`],["Detail",`${t} full \xB7 ${a} board \xB7 ${s} body \xB7 ${n} box \xB7 ${r} culled`],["Triangles",e.triangles.toLocaleString()],["Draws",e.draws.toLocaleString()],["GPU memory",`${(e.gpuMemoryBytes/1048576).toFixed(1)} / ${(e.gpuBudgetBytes/1048576).toFixed(0)} MB`],["Components",`${e.componentTier}${e.componentEvictions?` \xB7 ${e.componentEvictions} evicted`:""}`],["Cache",e.cache.enabled?`${e.cache.hits} hits \xB7 ${e.cache.misses} misses \xB7 ${(e.cache.bytes/1048576).toFixed(0)} MB`:"off"],["Frame",`${e.frameIntervalMs.toFixed(1)} ms \xB7 p95 ${e.frameIntervalP95Ms.toFixed(1)}`],["CPU",`${e.frameCpuMs.toFixed(2)} ms \xB7 p95 ${e.frameCpuP95Ms.toFixed(2)}`],["FPS",e.fps.toFixed(0)]];Es.innerHTML=i.map(([o,c])=>`<dt>${o}</dt><dd>${c}</dd>`).join("")}var fw="prism.system_scene.a0";function rt(){return v?[...v.boards.values()].filter(e=>e.renderer&&e.loadState==="loaded"):[]}async function yh(e={}){let t=Yf();if(Ns=typeof e.onSelectionChange=="function"?e.onSelectionChange:null,pr=typeof e.onContextMenu=="function"?e.onContextMenu:null,br=typeof e.onViewStateChange=="function"?e.onViewStateChange:null,Tr=typeof e.isActive=="function"?e.isActive:()=>!0,Ss=!1,w.gpuBudgetBytes=$n,Kf(e.root||document),!kt||!j)throw new Error("Semantic viewer shell is missing required DOM nodes");if(typeof e.loadBundle!="function")throw new Error("A system scene needs a bundle loader");let a=await Sn.create(j);return he(t)?(a.setLodThresholds(lw()),v={scene:a,loadBundle:e.loadBundle,onEmphasis:typeof e.onEmphasis=="function"?e.onEmphasis:null,onMove:typeof e.onMove=="function"?e.onMove:null,onHarness:typeof e.onHarness=="function"?e.onHarness:null,baseDescriptor:null,descriptor:null,move:Fw(),gizmo:null,standInKey:null,showLabels:!0,harnesses:[],harnessLit:new Map,showHarnesses:!0,harnessDrawn:null,tubes:[],tubedHarnesses:new Set,harnessPick:null,worlds:new Map,nodePreview:null,housingModels:new Map,timing:{descriptorAt:null,boardsDrawnAt:null},boards:new Map,groups:new Map,placed:[],placements:new Map,hiddenLayers:new Map,separation:new Map,bounds:null,framed:!1,snapped:!1,boardSelected:!1,inputs:new Map,emphasisSets:[],emphasisBounds:new Map,emphasisReport:null},k=_s({key:""}),U=new Ga([-.1,-.1,-.01,.1,.1,.01]),Go(),cb(),rb(),gb(),Ba.textContent="System scene",Is(t),{...Qf(),focusPlacement:kw,selectBoardContext:Wo,setEmphasisSets:_w,setSystemScene:hw,frameNetEmphasis:Nw,frameAll(){v?.bounds&&U.frame(v.bounds)},setMoveAllowed:Ow,setMoveMode:mr,setMoveSpace:Ch,previewPose:Pw,cancelMove:Po,getMoveState:()=>v?Bh():null,targetHarnessNode:Br,selectHarness:Yw,previewHarnessNode:Jw,cancelHarnessNode:Dh,getHarnessState:()=>v?Lh():null,setLabelsVisible(s){v&&(v.showLabels=!!s,da&&(da.hidden=!v.showLabels))},setHelpVisible:Oh,isHelpVisible:()=>!!(Mt&&!Mt.hidden),setHarnessesVisible(s){v&&(v.showHarnesses=!!s,v.harnessDrawn=null,Fa({relabel:!1}))},frameBoard(s){let n=v?.placements.get(String(s));return n&&U.frame(n.worldBounds),!!n},frameParts:Bw,resize(){v?.scene.resize()},setLodOverride(s){for(let n of rt())n.renderer.setLodOverride(s)},setLodThresholds:ho,pickSurfaceAt:L1,focusMoveTarget:D1,viewAxis(s,n=!1){!v||!["x","y","z"].includes(s)||(U.setAxis(s,!!n),v.bounds&&U.frame(v.bounds))},projectPoint(s,n){return Cf(s,n)},projectComponent(s,n){let r=v?.placements.get(String(n));return r?.board?hb(r.board,s,i=>Cf(i,n)):null},dispose(){Jf(t)}}):(a.dispose(),null)}function hw(e){if(!v)return;if(e?.schema!==fw)throw new Error(`Unsupported system scene schema: ${e?.schema||"missing"}`);v.baseDescriptor=e,v.timing.descriptorAt??=performance.now();let t=v.move.target?e.occurrences.find(s=>s.path===v.move.target):null;t?!v.move.drag&&_h(v.move.preview,t.pose)&&(v.move.preview=null):(v.move.drag=null,v.move.preview=null,v.move.target=null),v.descriptor=Nh(),v.harnesses=Array.isArray(e.harnesses)?e.harnesses:[],v.harnessDrawn=null;let a=new Set;for(let s of e.assets||[]){a.add(s.assetId);let n=v.boards.get(s.assetId),r=Vu(n,s);if(r!=="create"){n.asset=s,r==="load"&&Bf(n,we);continue}n&&Nf(s.assetId);let i=_s({key:s.assetId,topology:{},semanticGeometry:{},deferComponents:!0});Object.assign(i,{asset:s,bundleUrl:s.bundleUrl,loadState:"waiting",abort:null}),v.boards.set(s.assetId,i),Xi(s)&&Bf(i,we)}for(let s of[...v.boards.keys()])a.has(s)||Nf(s);Fa(),Qw(),v.move.enabled&&(Cs({quiet:!0}),pt("sync"))}function Nf(e){let t=v.boards.get(e);t?.abort?.abort(),v.boards.delete(e),v.scene.removeAsset(e),t&&(t.renderer=null),k===t&&Ro()}async function Bf(e,t){e.loadState="loading",e.abort=new AbortController;let a=()=>he(t)&&v?.boards.get(e.key)===e&&!e.abort.signal.aborted;try{let s=await v.loadBundle(e.bundleUrl,e.abort.signal);if(!a()||(e.topology=s.topology||{},e.topology.net_details||(e.topology.net_details=Wf(e.topology)),e.semanticGeometry=s.semanticGeometry||{},e.viewerReadiness=s.readiness||e.semanticGeometry.readiness||{stage:"semantic-ready",progress:100},e.assetCache=s.assetCache||null,!await nh(e,t)||!a()))return;e.renderer=v.scene.asset(e.key),e.renderer.setBarrels(yi(e.scene.manifest.barrels,e.scene.manifest.layers)),Ps(e);let n=await hh(t,e);if(!a())return;e.scene.runtimeBounds=n||qs(e.scene.manifest.bbox),e.renderer.setBoardBounds(e.scene.runtimeBounds),e.loadState="loaded",Fa()}catch(s){if(!a())return;console.warn(`[prism-semantic-viewer] system board ${e.key} failed to load`,s),e.loadState="failed",e.error=s?.message||String(s),v.scene.removeAsset(e.key),e.renderer=null,k===e&&Ro(),Fa()}}function Fa({relabel:e=!0}={}){let t=v?.descriptor;if(!t)return;v.harnessDrawn=null;let a=As(),s=new Map((t.assets||[]).map(c=>[c.assetId,c])),n=new Map,r=[];for(let c of Hu(t)){let l=c.assetId?s.get(c.assetId):null,f=c.assetId?v.boards.get(c.assetId):null,d=c.kind!=="board"&&!c.restricted?mw(c):null;if(d){n.has(d.rendererId)||n.set(d.rendererId,[]),n.get(d.rendererId).push({matrix:d.matrix,key:c.path,hiddenLayers:[],explode:null}),r.push({occurrence:c,rendererId:d.rendererId,board:null,matrix:d.matrix,worldBounds:d.worldBounds,standIn:null,own:d.kind,primitives:d.primitives});continue}if(c.model||c.box)continue;let h=Ku(c,l,f?.loadState),g,p,u;if(!h)g=f.key,p=Vn(c.worldMatrix,l.bundleToBoard),u=yt(p,f.scene.runtimeBounds);else{if(!c.boundsMm)continue;g=`stand-in:${h}`,v.scene.standIn(g,Kn[h].color),p=us(c.worldMatrix,c.boundsMm),u=yt(p,[0,0,0,1,1,1])}n.has(g)||n.set(g,[]),n.get(g).push({matrix:p,key:c.path,hiddenLayers:h?[]:[...v.hiddenLayers.get(c.path)||[]],explode:h?null:Ah(f,v.separation.get(c.path)||0)}),r.push({occurrence:c,rendererId:g,board:h?null:f,matrix:p,worldBounds:u,standIn:h})}let i=vh();yw(n,i.housings);for(let c of v.scene.assets.keys())n.has(c)||n.set(c,[]);v.scene.setOccurrences(n),v.groups=n;let o=v.placements;if(v.placed=r,v.placements=new Map(r.map(c=>[c.occurrence.path,c])),e||!o)e1();else for(let c of r)c.label=o.get(c.occurrence.path)?.label;v.bounds=ya(r.map(c=>c.worldBounds)),v.bounds&&(U.sceneRadius=St(v.bounds),v.framed||(U.frame(v.bounds),v.snapped||U.snap(),v.snapped=!0,r.some(c=>c.standIn==="loading")||(v.framed=!0)));for(let c of rt())Ar(c);a!=null&&(v.placements.get(a)?.board===k?w.selectedOccurrence=k.renderer.occurrenceKeys.indexOf(a):Ro()),ht(i),Rh(),Qt()}var xh=[.17,.18,.2],bw=[.24,.39,.87],pw=[.9,.28,.3];function vh(){if(v.worlds=new Map(v.descriptor.occurrences.map(e=>[e.path,e.worldMatrix])),!v.showHarnesses||!v.harnesses.length)return{tubes:[],housings:[]};try{let e=v.descriptor.occurrences.filter(t=>t.kind==="board"&&t.boundsMm).map(t=>({id:t.path,matrix:t.worldMatrix,...t.boundsMm}));return Gu(Li(v.harnesses,v.nodePreview,vt),Da,e)}catch(e){return console.warn("[prism-semantic-viewer] harness geometry failed",e),{tubes:[],housings:[]}}}function ht(e=null){if(!v?.descriptor)return;let t=(e??vh()).tubes;v.tubes=t,v.tubedHarnesses=new Set(t.map(a=>a.harness)),v.scene.setTubes(t,Eh)}var po=[.42,.45,.5,1],wh=Object.freeze([1e3,0,0,0,0,0,-1e3,0,0,1e3,0,0,0,0,0,1]);function gw(e){return{...Ih(e),showBoard:!1,showComponents:!0}}function Mh(e,t){return e.housing?gw(t):Ih(t)}function mw(e){if(e.model?.glbKey){let t=ea(e.worldMatrix,e.model.matrixMm||Wt),a=v.housingModels.get(e.model.glbKey);if(a||kh(e.model.glbKey),a?.state==="ready"){let s=Vn(t,wh);return{kind:"model",rendererId:`housing:${e.model.glbKey}`,matrix:s,worldBounds:yt(s,a.bounds),primitives:a.primitives}}if(e.model.boundsMm){v.scene.standIn("housing:proxy",po);let s=us(t,e.model.boundsMm);return{kind:"model",rendererId:"housing:proxy",matrix:s,worldBounds:yt(s,[0,0,0,1,1,1])}}}if(e.box?.boundsMm){let t=e.box.rgba||po,a=qu(t);v.scene.standIn(a,t);let s=us(e.worldMatrix,e.box.boundsMm);return{kind:"box",rendererId:a,matrix:s,worldBounds:yt(s,[0,0,0,1,1,1])}}return null}function yw(e,t){let a=(s,n)=>{e.has(s)||e.set(s,[]),e.get(s).push({...n,hiddenLayers:[],explode:null})};for(let s of t){let n=`housing:${s.key}`,r=s.model?v.housingModels.get(s.model.glbKey):null;if(s.model&&!r&&kh(s.model.glbKey),r?.state==="ready"){a(`housing:${s.model.glbKey}`,{key:n,matrix:Vn(s.matrix,wh)});continue}v.scene.standIn("housing:proxy",po);let i=s.model?s.model.boundsMm:{minMm:[0,0,0],maxMm:[1,1,1]};a("housing:proxy",{key:n,matrix:us(s.matrix,i)})}}async function kh(e){v.housingModels.set(e,{state:"loading"});let t=we;try{let a=await Ya(new URL(`/api/catalog/models/${encodeURIComponent(e)}.glb`,location.href).toString(),{fetchCache:"force-cache"});if(!he(t)||!v)return;let s=v.scene.asset(`housing:${e}`);s.housing=!0,s.setLodOverride(gn);let n=[1/0,1/0,1/0,-1/0,-1/0,-1/0];for(let r of a.primitives){for(let i=0;i<3;i+=1)n[i]=Math.min(n[i],r.bounds[i]),n[i+3]=Math.max(n[i+3],r.bounds[i+3]);s.addPrimitive(r,{kind:"component",layerId:0,material:r.material,color:r.material.baseColor})}a.primitives.length&&s.setBoardBounds(n),v.housingModels.set(e,{state:"ready",bounds:n,primitives:a.primitives})}catch(a){console.warn("[prism-semantic-viewer] housing model failed",e,a),v&&v.housingModels.set(e,{state:"failed"})}v?.descriptor&&Fa({relabel:!1})}function Da(e){return v.worlds.get(e)??null}function Eh(e){let t=v.harnessLit.get(e.harness),a=t?e.wires.map(s=>t.get(s)).find(Boolean):null;return a?{rgb:xw(a),mode:1}:e.collides.length?{rgb:pw,mode:0}:v.harnessPick?.key===e.harness?{rgb:bw,mode:0}:{rgb:xh,mode:v.emphasisSets.length?2:0}}function xw(e){let t=/^#?([0-9a-f]{6})$/i.exec(String(e));if(!t)return xh;let a=Number.parseInt(t[1],16);return[(a>>16&255)/255,(a>>8&255)/255,(a&255)/255]}function As(){return!v||!k.renderer||!Th()?null:k.renderer.occurrenceKeys[w.selectedOccurrence]??null}function Th(){return!!(w.selectedFeatureId||w.activeNetId||v?.boardSelected)}function Sh(e){if(k===e)return;let t=ze;ze=!0;try{Oe()}finally{ze=t}k=e,Pe()}function Ro(){Oe(),k=_s({key:""}),Pe()}function vw(e,t){let a=performance.now(),s=Math.max(0,e-Yt),n=Math.min(.05,(e-Yt)/1e3);Yt=e,U.update(n),v.scene.resize(),Q={layerId:0,viewport:{x:0,y:0,width:j.width,height:j.height},matrix:U.matrix(j.width,j.height,!1),lod:bh(j.height/Math.min(devicePixelRatio||1,2),!1)};let r=La(),i=new Map;for(let o of rt()){let c=Sw(o);o.scene.copperRealism!==Oa()&&Ps(o),o.renderer.setInnerCopperMode(ih(!w.showBoard||Iw(o),No(o).size>0)),o.renderer.dimCopper=r,Me(e,{},o);let l=o===k;i.set(o.renderer,{activeNetId:l?w.activeNetId:0,selectedFeatureId:l?w.selectedFeatureId:0,time:e/1e3,layerOffsets:c,visibleLayers:o.visible3dLayers,showBoard:w.showBoard,showComponents:w.showComponents,showPaste:!0,componentOpacity:1,boardOpacity:r?.34:1,isolateNet:w.isolateNet,compareMode:!1,compareOffsets:new Map,layerAlphas:null,visibleTileIds:o.visibleTileIds})}v.inputs=i,v.scene.setSelectedOccurrence(k.renderer&&Th()?k.renderer.occurrenceBase+w.selectedOccurrence:-1),h1(e,i,r)&&(v.scene.render(Q,o=>i.get(o)||Mh(o,e)),pb(),t1()),qw(),Zw(),Lw(),v.timing.boardsDrawnAt==null&&Xu(v.placed)&&(v.timing.boardsDrawnAt=performance.now());for(let o of rt())Gh(e,o);vo(s,performance.now()-a),wo(e),Is(t)}function Ih(e){return{activeNetId:0,selectedFeatureId:0,time:e/1e3,visibleLayers:new Set,showBoard:!0,showComponents:!1,componentOpacity:1,boardOpacity:1,isolateNet:!1}}function ww(e,t){let a=performance.now();return v.scene.pick(Q,e,t,s=>v.inputs.get(s)||Mh(s,a))}function Mw(e){let t=typeof e.occurrenceKey=="string"&&e.occurrenceKey.startsWith("housing:")?e.occurrenceKey.slice(8):null;if(t){let n=t.lastIndexOf("/"),[r,i]=[t.slice(0,n),t.slice(n+1)],o=v.tubes.find(c=>c.harness===r&&(c.from===i||c.to===i));o?ha({key:r,segmentId:o.segmentId,pointMm:null}):Oe();return}let a=e.occurrenceKey!=null?v.placements.get(e.occurrenceKey):null;if(!a)return Oe();if(a.standIn||a.own)return _o(a);let s=a.board;if(w.isolateNet&&!Ew(s,a.occurrence.path,e.featureId))return Oe();Sh(s),w.selectedOccurrence=s.renderer.occurrenceKeys.indexOf(a.occurrence.path),e.featureId&&!v.move.enabled?ga(e.featureId,!0):Wo()}function kw(e){let t=e!=null?v?.placements.get(String(e)):null;return t?t.standIn||t.own?(_o(t),"stand-in"):(Sh(t.board),w.selectedOccurrence=k.renderer.occurrenceKeys.indexOf(t.occurrence.path),"board"):null}function _o(e){let t=ze;ze=!0;try{Oe()}finally{ze=t}v.standInKey=e.occurrence.path,v.move.enabled&&Cs(),ze||Ns?.({kind:"board",sourceContext:"3D",occurrence:e.occurrence.path,standIn:e.standIn})}function Ew(e,t,a){let s=Number(e.scene.features.get(Number(a))?.netId)||0;if(!s)return!1;let n=e.renderer.occurrenceKeys.indexOf(t);return n<0?!1:e.renderer.occurrenceEmphasis?.[n]?.has(s)?!0:e===k&&n===w.selectedOccurrence&&s===Number(w.activeNetId)}function Cf(e,t){let a=v?.placements.get(String(t));return a?xo(e,a.matrix):null}function No(e=k){if(!v)return Ca();let t=new Set(e===k?Ca():[]);for(let a of e.renderer?.occurrenceEmphasis||[])if(a)for(let s of a.keys())t.add(Number(s));return t}function Ar(e){let t=v.groups.get(e.key)||[],a=new Set;for(let s of e.scene.copperLayers){let n=Number(s.id);t.some(r=>!v.hiddenLayers.get(r.key)?.has(n))&&a.add(n)}if(w.isolateNet){let s=new Set;for(let n of No(e))for(let r of zo(n,e))s.add(r);e.visible3dLayers=new Set([...a].filter(n=>s.has(n)))}else e.visible3dLayers=a;Me(performance.now(),{force:!0},e)}function Bo(e,t){let a=e??(v.groups.get(k.key)||[]).map(s=>s.key);for(let s of a){let n=new Set(v.hiddenLayers.get(String(s))||[]);t(n,v.placements.get(String(s))?.board),v.hiddenLayers.set(String(s),n)}for(let s of rt()){let n=v.groups.get(s.key)||[];for(let r of n)r.hiddenLayers=[...v.hiddenLayers.get(r.key)||[]];s.renderer.setOccurrenceHiddenLayers(n.map(r=>r.hiddenLayers)),Ar(s)}Pe(),Qt()}function Tw(){let e=As();if(e==null||!w.activeNetId)return;let t=zo(w.activeNetId,k);t.size&&Bo([e],a=>{a.clear();for(let s of k.scene.copperLayers)t.has(Number(s.id))||a.add(Number(s.id))})}function Sw(e){if(e.scene.layerSteps)return e.scene.layerSteps;let t=new Float32Array(256),a=(e.scene.copperLayers.length-1)/2;return e.scene.copperLayers.forEach((s,n)=>{t[Number(s.id)]=a-n}),e.scene.layerSteps=t,t}function Ah(e,t){let a=e?.scene.runtimeBounds,s=a?Math.hypot((a[3]-a[0])*1e3,(a[4]-a[1])*1e3):0;return[t*t*ce(s*.12,8,25)/1e3,t<.0999?1:0,1-t*.72,1]}function Iw(e){return(v.groups.get(e.key)||[]).some(t=>(v.separation.get(t.key)||0)>.001)}function Aw(e,t){let a=t!=null?[String(t)]:(v.groups.get(k.key)||[]).map(s=>s.key);for(let s of a)v.separation.set(s,e);for(let s of rt()){let n=v.groups.get(s.key)||[];s.renderer.setOccurrenceExplode(n.map(r=>Ah(s,v.separation.get(r.key)||0)))}Qt()}function Rw(){return v.placed.filter(e=>!e.own).map(e=>{let t=v.hiddenLayers.get(e.occurrence.path)||new Set,a=e.board;return{key:e.occurrence.path,name:e.occurrence.displayPath||e.occurrence.path,standIn:e.standIn||null,separation:v.separation.get(e.occurrence.path)||0,layers:a?a.scene.copperLayers.map(s=>({id:Number(s.id),name:String(s.name),color:$o(Cr(s,a)),visible:!t.has(Number(s.id))})):[]}})}function _w(e){return v?(v.emphasisSets=e,Rh()):null}function Rh(){if(!v)return[];let e=new Map;for(let[r,i]of v.groups)e.set(r,i.map(()=>null));let t=new Map;for(let r of v.groups.values())r.forEach((i,o)=>t.set(i.key,o));v.emphasisBounds=new Map;let a=v.emphasisSets.map(r=>{let i={key:r.key,color:r.color,lit:0,unresolved:[]},o=[];v.emphasisBounds.set(r.key,o);for(let c of r.members){let l=v.placements.get(c.occurrence),f=l?.board;if(!f&&l?.own){i.lit+=1,l.worldBounds&&o.push({occurrence:c.occurrence,box:l.worldBounds});continue}if(!f){let y=l?l.standIn==="loading"||l.standIn==="building"?"loading":l.standIn==="restricted"?"restricted":"not-drawn":"not-drawn";i.unresolved.push({occurrence:c.occurrence,net:c.net,reason:y});continue}let d=ta(f.scene.nets,c.net),h=Number(d?.id)||0;if(!h){i.unresolved.push({occurrence:c.occurrence,net:c.net,reason:"unknown-net"});continue}let g=e.get(f.key),p=t.get(c.occurrence);if(!g||p==null)continue;g[p]=g[p]||new Map,g[p].has(h)||g[p].set(h,r.mark),i.lit+=1;let u=Va(d.boundsMm);u&&o.push({occurrence:c.occurrence,box:yt(l.matrix,u)})}return i});v.harnessLit=iu(v.harnesses,v.emphasisSets),v.harnessDrawn=null,v.scene.setTubeColors(Eh);for(let r of a){r.wires=0;for(let i of v.harnessLit.values())for(let o of i.values())o===r.color&&(r.wires+=1)}let s=v.emphasisSets.length>0;for(let r of rt())r.renderer.setOccurrenceEmphasis(s&&e.get(r.key)||null,{dimCopper:s});if(w.isolateNet)for(let r of rt())Ar(r);let n=JSON.stringify(a)!==JSON.stringify(v.emphasisReport);return v.emphasisReport=a,n&&v.onEmphasis?.(a),a}function Nw(e=null,t=null){let a=[];for(let[n,r]of v?.emphasisBounds||[])if(!(e!=null&&n!==String(e)))for(let i of r)(t==null||i.occurrence===t)&&a.push(i.box);let s=ya(a);return s?(U.frame(s),!0):!1}function Bw(e){let t=[];for(let s of Array.isArray(e)?e:[]){let n=v?.placements.get(String(s?.occurrence));if(n&&!s?.reference){n.worldBounds&&t.push(n.worldBounds);continue}let r=n?.board?.scene.componentFeatures.get(String(s?.reference)),i=r?n.board.scene.features.get(Number(r.featureId))?.bounds:null;i&&t.push(yt(n.matrix,i))}let a=ya(t);return a?(U.frame(a),!0):!1}var Co=.001,Cw=90,Ff=["#e5484d","#30a46c","#3e63dd"],oo=["X","Y","Z"];function _h(e,t){if(!e||!t)return!1;let a=Xt(e),s=Xt(t),n=[...a.translationMm,...a.rotation],r=[...s.translationMm,...s.rotation];return n.every((i,o)=>Math.abs(i-r[o])<1e-6)}function Fw(){return{allowed:!1,enabled:!1,route:!1,space:"world",target:null,preview:null,drag:null,node:null}}function Nh(){let e=v.baseDescriptor;return!e||!v.move.target||!v.move.preview?e:_l(e,v.move.target,v.move.preview)}function Bs(){v.baseDescriptor&&(v.descriptor=Nh(),Fa({relabel:!1}))}function Fo(){let e=v.move.target;return e?v.baseDescriptor?.occurrences.find(t=>t.path===e)??null:null}function Bh(){let e=v.move,t=Fo();return{allowed:e.allowed,enabled:e.enabled,route:e.route,space:e.space,dragging:!!e.drag,target:t?{occurrence:t.path,instanceId:t.instanceId,displayPath:t.displayPath,kind:t.kind,restricted:!!t.restricted,pose:Xt(e.preview??t.pose),source:e.preview?"manual":t.pose?.source??"default",unsaved:!!e.preview}:null}}function pt(e){v.onMove?.({phase:e,...Bh()})}function Ow(e){v.move.allowed=!!e,!v.move.allowed&&v.move.enabled&&mr(!1)}function mr(e,{route:t=!1}={}){let a=!!e&&v.move.allowed,s=a&&!!t;a===v.move.enabled&&s===v.move.route||(v.move.route=s,s&&go(),a||(go(),v.move.node&&(v.move.node=null,v.nodePreview&&(v.nodePreview=null,ht()),ke("target"))),v.move.enabled=a,a&&Cs({quiet:!0}),pt("mode"))}function Ch(e){v.move.space=e==="local"?"local":"world",pt("mode")}function Oo(){return v.standInKey??As()}function Cs({quiet:e=!1}={}){if(!v)return;let t=Oo(),a=v.move.enabled&&!v.move.route&&t!=null?Rl(v.baseDescriptor,t):null,s=a&&a.move!==!1?a.path:null;s!==v.move.target&&(go(),v.move.target=s,e||pt("target"))}function go(){let e=!!v.move.preview;v.move.drag=null,v.move.preview=null,v.move.target=null,e&&Bs()}function Pw(e){v?.move.target&&(v.move.preview=e?Xt(e):null,Bs(),pt("preview"))}function Po(){!v||!v.move.preview&&!v.move.drag||(v.move.drag=null,v.move.preview=null,Bs(),pt("cancel"))}function jw(){let e=`${v.move.target}/`,t=ya(v.placed.filter(a=>a.occurrence.path===v.move.target||a.occurrence.path.startsWith(e)).map(a=>a.worldBounds));return t?[0,1,2].map(a=>(t[a]+t[a+3])/2/Co):null}function Jt(e){let t=Qa(Q.matrix,pe(e,Co),Q.viewport);if(!t)return null;let a=j.getBoundingClientRect();return[t.x*a.width/j.width,t.y*a.height/j.height]}function Lw(){let e=$e;if(!e)return;let t=v.move.enabled&&Q?Nr():null,a=t?null:Fo(),s=a&&typeof a.move=="object"?a.move:null,n=s?v.move.preview??a.pose:null,r=t?t.worldMm:v.move.enabled&&a&&Q?s?.pivot==="origin"?[...n.translationMm]:jw():null,i=r?Jt(r):null;if(!i){e.toggleAttribute("hidden",!0),v.gizmo=null;return}e.toggleAttribute("hidden",!1),e.firstChild||Dw(e);let{right:o,back:c}=U.basis(),l=Jt(Ee(r,o)),f=l?Math.hypot(l[0]-i[0],l[1]-i[1]):0;if(!(f>1e-6)){e.toggleAttribute("hidden",!0);return}let d=Cw/f,h=a?v.move.preview??a.pose:null,g=h&&(s||v.move.space==="local")?Sl(h):li,p=[];g.forEach((y,b)=>{let m=Jt(Ee(r,pe(y,d))),x=e.querySelector(`[data-part="t${b}"]`),M=m&&Math.hypot(m[0]-i[0],m[1]-i[1])>12&&(!s||(s.translate||[]).includes(b));if(x.style.display=M?"":"none",M){let R=x.querySelector("line");R.setAttribute("x1",i[0]),R.setAttribute("y1",i[1]),R.setAttribute("x2",m[0]),R.setAttribute("y2",m[1]),x.querySelector("circle").setAttribute("cx",m[0]),x.querySelector("circle").setAttribute("cy",m[1]),x.querySelector("text").setAttribute("x",m[0]+9),x.querySelector("text").setAttribute("y",m[1]-7)}let E=Nl(y),T=qe(y,E),I=[];for(let R=0;R<=64;R+=1){let _=R/64*Math.PI*2,B=Jt(Ee(r,pe(Ee(pe(E,Math.cos(_)),pe(T,Math.sin(_))),d*.7)));B&&I.push(`${B[0].toFixed(1)},${B[1].toFixed(1)}`)}let A=e.querySelector(`[data-part="r${b}"]`);A.setAttribute("points",I.join(" ")),A.style.display=t||s&&!(s.rotate||[]).includes(b)?"none":"",p.push({axis:y,pxPerMm:m?[(m[0]-i[0])/d,(m[1]-i[1])/d]:[0,0]})});let u=e.querySelector('[data-part="pivot"]');u.setAttribute("cx",i[0]),u.setAttribute("cy",i[1]),v.gizmo={center:i,pivot:r,handles:p,back:c,limits:s}}function Dw(e){let t="http://www.w3.org/2000/svg",a=(s,n)=>{let r=document.createElementNS(t,s);for(let[i,o]of Object.entries(n))r.setAttribute(i,o);return r};Ff.forEach((s,n)=>{let r=a("polyline",{"data-part":`r${n}`,class:"ring",stroke:s,fill:"none"}),i=a("title",{});i.textContent=`Rotate about ${oo[n]}`,r.append(i),e.append(r)}),Ff.forEach((s,n)=>{let r=a("g",{"data-part":`t${n}`,class:"arrow",stroke:s,fill:s}),i=a("title",{});i.textContent=`Move along ${oo[n]}`;let o=a("text",{stroke:"none"});o.textContent=oo[n],r.append(i,a("line",{}),a("circle",{r:6}),o),e.append(r)}),e.append(a("circle",{"data-part":"pivot",r:4,class:"pivot"})),e.append(a("text",{"data-part":"readout",class:"readout"})),e.addEventListener("pointerdown",Uw),e.addEventListener("pointermove",Gw),e.addEventListener("pointerup",zw),e.addEventListener("dblclick",s=>{!v?.move.node||v.move.node===$t||(s.preventDefault(),s.stopPropagation(),ke("delete"))}),e.addEventListener("pointercancel",()=>Fh())}function Uw(e){let t=e.target.closest?.("[data-part]")?.dataset.part;if(!v||!t||!v.gizmo||!/^[tr][012]$/.test(t))return;e.preventDefault(),e.stopPropagation();let a=$e.getBoundingClientRect(),s=Nr();if(s){if(t[0]!=="t")return;v.move.drag={kind:"node",handle:v.gizmo.handles[Number(t[1])],start:[e.clientX-a.left,e.clientY-a.top],startMm:s.worldMm,startPreview:v.nodePreview,matrix:Ta(ba(),Da),changed:!1};try{$e.setPointerCapture(e.pointerId)}catch{}return}let n=Fo(),r=v.gizmo.limits;if(!(r&&!((t[0]==="t"?r.translate:r.rotate)||[]).includes(Number(t[1])))){v.move.drag={kind:t[0]==="t"?"translate":"rotate",snapDeg:r?.rotateSnapDeg??null,handle:v.gizmo.handles[Number(t[1])],start:[e.clientX-a.left,e.clientY-a.top],startPose:Xt(v.move.preview??n.pose),hadPreview:!!v.move.preview,center:v.gizmo.center,pivot:v.gizmo.pivot,back:v.gizmo.back,changed:!1};try{$e.setPointerCapture(e.pointerId)}catch{}}}function Gw(e){let t=v?.move.drag;if(!t)return;let a=$e.getBoundingClientRect(),s=[e.clientX-a.left,e.clientY-a.top],n=e.shiftKey;if(t.kind==="node"){let o=fn(di([s[0]-t.start[0],s[1]-t.start[1]],t.handle.pxPerMm),n?na.fineMm:na.mm),c=Ee(t.startMm,pe(t.handle.axis,o));t.changed=t.changed||o!==0,v.nodePreview={harness:v.harnessPick.key,id:v.move.node,positionMm:t.matrix?os(t.matrix,c):c},Of(`${o>=0?"+":""}${o.toFixed(n?1:0)} mm`,s),ht(),ke("preview");return}let r,i;if(t.kind==="translate"){let o=fn(di([s[0]-t.start[0],s[1]-t.start[1]],t.handle.pxPerMm),n?na.fineMm:na.mm);r=Il(t.startPose,t.handle.axis,o),i=`${o>=0?"+":""}${o.toFixed(n?1:0)} mm`}else{let o=Tl(t.handle.axis,t.back,El(t.center,t.start,s))*180/Math.PI,c=fn(o,t.snapDeg??(n?na.fineDeg:na.deg));r=Al(t.startPose,t.handle.axis,c*Math.PI/180,t.pivot),i=`${c>=0?"+":""}${c.toFixed(0)}\xB0`}t.changed=t.changed||!_h(r,t.startPose),v.move.preview=Xt(r),Of(i,s),Bs(),pt("preview")}function Of(e,t){let a=$e.querySelector('[data-part="readout"]');a.textContent=e,a.setAttribute("x",t[0]+14),a.setAttribute("y",t[1]-10)}function zw(e){let t=v?.move.drag;if(t){if($e.hasPointerCapture?.(e.pointerId)&&$e.releasePointerCapture(e.pointerId),v.move.drag=null,$e.querySelector('[data-part="readout"]').textContent="",t.kind==="node"){t.changed&&ke("commit");return}t.changed?pt("commit"):t.hadPreview||Po()}}function Fh(){let e=v?.move.drag;return e?e.kind==="route"||e.kind==="handle"?(v.move.drag=null,e.changed&&(v.nodePreview=e.kind==="handle"?e.startPreview:null,ht(),ke("cancel")),!0):(v.move.drag=null,e.kind==="node"?($e.querySelector('[data-part="readout"]').textContent="",v.nodePreview=e.startPreview,ht(),ke("cancel"),!0):(v.move.preview=e.hadPreview?e.startPose:null,$e.querySelector('[data-part="readout"]').textContent="",Bs(),pt("cancel"),!0)):!1}function Kw(e,t){let a=v.move;if(t==="escape"){if(Mt&&!Mt.hidden)Mt.hidden=!0;else if(!Fh()){if(!Dh())if(a.node)Br(null);else if(a.preview)Po();else if(v.harnessPick)ha(null);else if(a.enabled)mr(!1);else return!1}return!0}if(t==="m"&&a.allowed)mr(!a.enabled);else if(t==="l"&&a.enabled)Ch(a.space==="world"?"local":"world");else if(t==="enter"&&a.node&&v.nodePreview&&!a.drag)ke("commit");else if(t==="enter"&&a.preview&&!a.drag)pt("commit");else if((t==="delete"||t==="backspace")&&a.node&&a.node!==$t&&!a.drag)ke("delete");else if(e.key==="?")Oh(!!Mt?.hidden);else if(t==="a")U.frame(v.bounds||fa());else return!1;return!0}function Oh(e){Mt&&(Mt.hidden=!e)}var ks="http://www.w3.org/2000/svg";function Vw(e){let t=e.occurrence?v.placements.get(e.occurrence):null;if(!t)return null;let a=e.reference&&t.board?t.board.scene.componentFeatures.get(e.reference):null,s=a?t.board.scene.features.get(Number(a.featureId))?.bounds:null;if(s)return bn(t.matrix,[0,1,2].map(r=>(s[r]+s[r+3])/2));let n=t.worldBounds;return n?[0,1,2].map(r=>(n[r]+n[r+3])/2):null}function Hw(){let e=v.emphasisSets.length>0,t=[],a=[];for(let s of v.showHarnesses?v.harnesses:[]){let n=v.harnessLit.get(vt(s)),r=cu(s,n),i=new Map(s.ends.map(c=>[c.id,Vw(c)]));i.set("hub",s.ends.length>2?lu([...i.values()]):null);let o=s.name||"Harness";for(let c of v.tubedHarnesses.has(vt(s))?[]:ru(s)){let l=ou(c,n),f=document.createElementNS(ks,"line");f.setAttribute("class",`segment${l?" lit":e?" dim":""}`),l&&Object.assign(f.style,{stroke:l,color:l});let d=document.createElementNS(ks,"title");d.textContent=`${o}: ${c.wires.size} wire${c.wires.size===1?"":"s"}`,f.append(d),a.push(f),t.push({node:f,kind:"line",a:i.get(c.a),b:i.get(c.b)})}for(let c of s.ends){let l=r.get(c.id),f=document.createElementNS(ks,"circle");f.setAttribute("class",`end${l?" lit":e?" dim":""}`),f.setAttribute("r",l?"6":"4"),l&&(f.style.fill=l),a.push(f),t.push({node:f,kind:"dot",a:i.get(c.id)})}}fr.replaceChildren(...a),v.harnessDrawn={items:t,matrix:null}}function qw(){if(!fr||!Q)return;v.harnessDrawn||Hw();let e=v.harnessDrawn;fr.toggleAttribute("hidden",!e.items.length);let t=Q.matrix.join(",");if(e.matrix===t)return;e.matrix=t;let a=j.getBoundingClientRect(),s=a.width/Math.max(1,j.width),n=a.height/Math.max(1,j.height),r=i=>{let o=i?Qa(Q.matrix,i,Q.viewport):null;return o?[o.x*s,o.y*n]:null};for(let i of e.items){let o=r(i.a),c=i.kind==="line"?r(i.b):null,l=i.kind==="line"?!!(o&&c):!!o;i.node.style.display=l?"":"none",l&&(i.kind==="line"?(i.node.setAttribute("x1",o[0].toFixed(1)),i.node.setAttribute("y1",o[1].toFixed(1)),i.node.setAttribute("x2",c[0].toFixed(1)),i.node.setAttribute("y2",c[1].toFixed(1))):(i.node.setAttribute("cx",o[0].toFixed(1)),i.node.setAttribute("cy",o[1].toFixed(1))))}}function jo(e){let{right:t}=U.basis(),a=Jt(e),s=Jt(Ee(e,t));return a&&s?Math.hypot(s[0]-a[0],s[1]-a[1]):0}function Lo(e){if(!v?.tubes.length||!Q)return null;let t=j.getBoundingClientRect(),a=hu(v.tubes,[e.clientX-t.left,e.clientY-t.top],Jt,jo,v.move.route?10:5);return a?{tube:v.tubes[a.index],pointMm:a.pointMm}:null}function Xw(e){let t=Lo(e);return t?(ha({key:t.tube.harness,segmentId:t.tube.segmentId,pointMm:t.pointMm}),!0):(ha(null),!1)}function Ww(e){if(!v?.move.enabled||!v.move.route||e.button!==0||e.shiftKey)return!1;let t=Lo(e),a=t?v.harnesses.find(s=>vt(s)===t.tube.harness):null;return!t||!Rr(a)?!1:(ha({key:t.tube.harness,segmentId:t.tube.segmentId,pointMm:t.pointMm}),v.move.drag={kind:"route",start:[e.clientX,e.clientY],startMm:t.pointMm,nowMm:t.pointMm,pxPerMm:jo(t.pointMm),basis:U.basis(),breakout:e.altKey,changed:!1,matrix:Ta(a,Da),capture:j,harness:a,segment:{from:t.tube.from,to:t.tube.to,samplesMm:t.tube.samplesMm}},j.setPointerCapture(e.pointerId),!0)}function $w(e,t){Br(t);let a=Nr();if(a){v.move.drag={kind:"handle",start:[e.clientX,e.clientY],startMm:a.worldMm,nowMm:a.worldMm,pxPerMm:jo(a.worldMm),basis:U.basis(),changed:!1,startPreview:v.nodePreview,matrix:Ta(ba(),Da),capture:_a};try{_a.setPointerCapture(e.pointerId)}catch{}}}function Ph(e){let t=v?.move.drag;if(!t||t.kind!=="route"&&t.kind!=="handle")return!1;let a=[e.clientX,e.clientY];if(!t.changed&&!pu(t.start,a))return!0;t.changed=!0,t.nowMm=bu(t.startMm,a[0]-t.start[0],a[1]-t.start[1],t.pxPerMm,t.basis);let s=t.matrix?os(t.matrix,t.nowMm):[...t.nowMm];return t.kind==="handle"?v.nodePreview={harness:v.harnessPick.key,id:v.move.node,positionMm:s}:v.nodePreview={harness:v.harnessPick.key,insert:uu(t.harness.nodes??[],{kind:t.breakout?"breakout":"waypoint",segment:t.segment,atMm:t.startMm,positionMm:s,toWorldMm:n=>t.matrix?ji(t.matrix,n):n})},ht(),ke("preview"),!0}function jh(e){let t=v?.move.drag;if(!t||t.kind!=="route"&&t.kind!=="handle")return!1;if(t.capture?.hasPointerCapture?.(e.pointerId)&&t.capture.releasePointerCapture(e.pointerId),v.move.drag=null,!t.changed)return!0;if(t.kind==="handle")return ke("commit"),!0;let a=s=>t.matrix?os(t.matrix,s):[...s];return ke("route-drag",{atMm:a(t.startMm),positionMm:a(t.nowMm),breakout:t.breakout}),!0}function Yw(e){if(!v)return!1;if(e==null)return ha(null),!0;let t=vt({level:"",id:String(e)});if(v.harnessPick?.key===t)return!0;let a=v.tubes.find(n=>n.harness===t);if(!a)return!1;let s=Math.floor(a.samplesMm.length/6)*3;return ha({key:t,segmentId:a.segmentId,pointMm:a.samplesMm.slice(s,s+3)}),!0}function ha(e){if(!e&&!v.harnessPick)return;e&&(Oe(),Cs({quiet:!0}));let t=e&&v.harnessPick?.key===e.key;v.harnessPick=e,t||(v.move.node=null,v.nodePreview=null),ht(),ke("select")}function ba(){let e=v?.harnessPick;return e?v.harnesses.find(t=>vt(t)===e.key)??null:null}function Rr(e){return!!e&&!e.level&&v.move.allowed}function _r(){let e=ba();if(!e)return[];let t=Li([e],v.nodePreview,vt)[0],a=v.tubes.filter(s=>s.harness===v.harnessPick.key);return fu(t,a,Ta(e,Da)??[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])}function Nr(){return v.move.node?_r().find(e=>e.id===v.move.node)??null:null}function Lh(){let e=ba();if(!e)return{harness:null,segment:null,pointMm:null,autoMm:null,node:null,editable:!1};let t=Ta(e,Da),a=f=>t?os(t,f):[...f],s=v.harnessPick,n=v.tubes.find(f=>f.harness===s.key&&f.segmentId===s.segmentId),r=[];for(let f=0;n&&f+2<n.samplesMm.length;f+=3)r.push(a(n.samplesMm.slice(f,f+3)));let o=_r().find(f=>f.auto),c=Nr(),l=!!(c&&v.nodePreview?.id===c.id);return{harness:{id:e.id,level:e.level??null,name:e.name||""},segment:n?{id:n.segmentId,from:n.from,to:n.to,samplesMm:r}:null,pointMm:s.pointMm?a(s.pointMm):null,autoMm:o?a(o.worldMm):null,node:c?{id:c.id,kind:c.kind,auto:!!c.auto,pinned:c.pinned,positionMm:l?[...v.nodePreview.positionMm]:a(c.worldMm),unsaved:l}:null,editable:Rr(e)}}function ke(e,t={}){v.onHarness?.({phase:e,...Lh(),...t})}function Br(e){if(!v)return;let t=e&&Rr(ba())&&v.move.enabled?String(e):null;t!==v.move.node&&(v.move.node=t,v.move.drag=null,v.nodePreview&&v.nodePreview.id!==t&&(v.nodePreview=null,ht()),ke("target"))}function Jw(e){!v?.move.node||!v.harnessPick||(v.nodePreview=e?{harness:v.harnessPick.key,id:v.move.node,positionMm:[...e]}:null,ht(),ke("preview"))}function Dh(){return v?.nodePreview?(v.nodePreview=null,v.move.drag=null,ht(),ke("cancel"),!0):!1}function Qw(){if(!ba()){v.harnessPick&&(v.harnessPick=null,v.move.node=null,v.nodePreview=null,ke("select"));return}v.move.drag||(v.nodePreview=null),v.move.node&&!_r().some(s=>s.id===v.move.node)&&(v.move.node=null);let t=v.harnessPick,a=v.tubes.filter(s=>s.harness===t.key);if(t.pointMm&&a.length&&!a.some(s=>s.segmentId===t.segmentId)){let s=n=>{let r=1/0;for(let i=0;i+2<n.samplesMm.length;i+=3)r=Math.min(r,Math.hypot(n.samplesMm[i]-t.pointMm[0],n.samplesMm[i+1]-t.pointMm[1],n.samplesMm[i+2]-t.pointMm[2]));return r};t.segmentId=a.reduce((n,r)=>s(r)<s(n)?r:n).segmentId}ke("sync")}function Zw(){let e=_a;if(!e)return;let t=v.move.enabled&&Q?ba():null,a=Rr(t)?_r():[];if(e.toggleAttribute("hidden",!a.length),!a.length){e.firstChild&&e.replaceChildren();return}let s=new Map([...e.children].map(r=>[r.dataset.node,r])),n=new Set;for(let r of a){let i=Jt(r.worldMm),o=s.get(r.id);if(!o){o=document.createElementNS(ks,"circle"),o.dataset.node=r.id;let c=document.createElementNS(ks,"title");o.append(c),o.addEventListener("pointerdown",l=>{l.preventDefault(),l.stopPropagation(),$w(l,o.dataset.node)}),o.addEventListener("dblclick",l=>{l.preventDefault(),l.stopPropagation(),Br(o.dataset.node),v.move.node&&v.move.node!==$t&&ke("delete")}),e.append(o)}n.add(r.id),o.setAttribute("class",`node ${r.kind}${r.auto?" auto":""}${r.pinned?" pinned":""}${r.id===v.move.node?" target":""}`),o.setAttribute("r",r.kind==="breakout"?"7":"5.5"),o.querySelector("title").textContent=r.auto?"Automatic breakout: drag to place it":r.kind==="breakout"?"Breakout":r.pinned?"Pinned waypoint":"Waypoint",o.style.display=i?"":"none",i&&(o.setAttribute("cx",i[0].toFixed(1)),o.setAttribute("cy",i[1].toFixed(1)))}for(let[r,i]of s)n.has(r)||i.remove()}function e1(){da&&(v.labelsDrawn=null,da.replaceChildren(...v.placed.map(e=>{let t=document.createElement("div");t.className=`scene-label${e.standIn?` stand-in ${e.standIn}`:""}`;let a=document.createElement("strong");a.textContent=e.occurrence.displayPath||e.occurrence.labels?.join(" / ")||e.occurrence.path,t.append(a);let s=e.standIn?Kn[e.standIn]?.label:"";if(s){let n=document.createElement("span");n.textContent=s,t.append(n)}return e.label=t,t})))}function t1(){if(!da||!Q)return;if(da.hidden=!v.showLabels,!v.showLabels){v.labelsDrawn=null;return}let e=j.getBoundingClientRect(),t=Oo(),a=`${t}|${e.width}x${e.height}|${Array.prototype.join.call(Q.matrix,",")}`;if(v.labelsDrawn?.placed===v.placed&&v.labelsDrawn.key===a)return;v.labelsDrawn={placed:v.placed,key:a};let s=e.width/Math.max(1,j.width),n=e.height/Math.max(1,j.height);for(let r of v.placed){if(!r.label)continue;let[i,o,,c,l,f]=r.worldBounds,d=Qa(Q.matrix,[(i+c)/2,(o+l)/2,f],Q.viewport),h=d&&d.x>=0&&d.y>=0&&d.x<=j.width&&d.y<=j.height;r.label.hidden=!h,h&&(r.label.style.transform=`translate(${(d.x*s).toFixed(1)}px, ${(d.y*n).toFixed(1)}px) translate(-50%, -100%)`),r.label.classList.toggle("selected",t===r.occurrence.path)}}function a1(e,t=k){return oc(e,t.scene.copperLayers)}async function Uh(e=we,t=k){let a=t.semanticGeometry.assets?.components_glb;if(!a||t.scene.componentTier!=="idle")return;t.scene.componentTier="loading";let s;try{s=await wl(new URL(a,location.href).toString(),{componentFeatures:t.scene.componentFeatures,fetchBytes:yr(t)})}catch(i){throw he(e)&&(t.scene.componentTier="idle"),i}if(!he(e)||!t.renderer)return;let n=yc(s.models);if(await rh([...n.instanced.map(i=>i.primitive),...n.baked].reduce((i,o)=>i+uo(o),0)),!he(e)||!t.renderer)return;t.scene.componentTier="loaded",t.loadedBytes+=s.byteLength;for(let i of s.models)for(let o of i.placements){let c=t.scene.componentFeatures.get(o.designator);c&&r1(c.featureId,o.bounds,t)}v&&(v.harnessDrawn=null,v.labelsDrawn=null);for(let[i,o]of s.componentNodeCounts||[])t.scene.componentModelCounts.set(i,o);t.hiddenComponentRequest&&ob(t.hiddenComponentRequest);let r=i=>({kind:"component",layerId:0,material:i.material,color:i.material.baseColor});t.scene.componentEntries=[...t.renderer.addInstancedPrimitives(n.instanced.map(i=>({primitive:i.primitive,placements:i.placements,metadata:r(i.primitive)}))),...n.baked.map(i=>t.renderer.addPrimitive(i,r(i)))]}function yr(e=k){return e.assetCache?t=>e.assetCache.fetchBytes(t):void 0}function Gh(e,t=k){if(!t.renderer||e-(t.tiersCheckedAt||0)<250)return;t.tiersCheckedAt=e;let a=t.renderer.cullCounts,s=Jv()&&a.board+a.body>0,n=t.renderer.identityOnly&&!t.deferComponents||!t.renderer.identityOnly&&(a.full>0||s);n&&(t.scene.componentsWantedAt=e),n&&t.scene.componentTier==="idle"&&t.semanticGeometry.assets?.components_glb&&Uh(we,t).then(()=>{v&&t.renderer&&t.scene.componentTier==="loaded"&&mo(t.scene.runtimeBounds,t)}).catch(i=>console.warn("Failed to load components",i));let r=()=>v?v.scene.gpuMemoryBytes():t.renderer.gpuMemoryBytes();t.gpuBytes=r(),!(t.gpuBytes<=w.gpuBudgetBytes)&&(t.scene.componentTier==="loaded"&&e-t.scene.componentsWantedAt>zv&&(t.renderer.removeEntries(t.scene.componentEntries),t.scene.componentEntries=[],t.scene.componentTier="idle",t.scene.componentEvictions+=1,t.gpuBytes=r()),t.gpuBytes>w.gpuBudgetBytes&&dh(t.visibleTileIds||new Set,Math.max(0,t.residentTileGpuBytes-(t.gpuBytes-w.gpuBudgetBytes)),t))}var Pf=4e-4,jf=5e-5,s1={baseColor:[.62,.7,.8,1],metallic:0,roughness:.8,emissive:[0,0,0]};function mo(e,t=k){if(!t.renderer)return;let a=new Map;for(let i of t.topology.physical_objects||[])i.kind==="footprint_body"&&i.designator&&i.bbox_mm?.length===4&&a.set(i.designator,i);let s=(e?.[5]??8e-4)+jf,n=(e?.[2]??-8e-4)-jf,r=[];for(let i of t.scene.componentFeatures.values()){let o=Number(i.featureId),c=t.scene.features.get(o),l=a.get(i.designator);if(!c||c.bounds||!l)continue;let[f,d,h,g]=l.bbox_mm.map(Number),p=String(l.layer||"").startsWith("B."),u=[f/1e3,-g/1e3,p?n-Pf:s,h/1e3,-d/1e3,p?n:s+Pf];c.bounds=u,c.placeholder=!0,r.push(n1(u,o))}if(r.length)for(let i of Ka(r))t.renderer.addPrimitive(i,{kind:"component",layerId:0,material:i.material,color:i.material.baseColor,opacityScale:.3,translucent:!0,placeholder:!0})}function n1([e,t,a,s,n,r],i){let o=[[[0,0,1],[[e,t,r],[s,t,r],[s,n,r],[e,n,r]]],[[0,0,-1],[[e,n,a],[s,n,a],[s,t,a],[e,t,a]]],[[1,0,0],[[s,t,a],[s,n,a],[s,n,r],[s,t,r]]],[[-1,0,0],[[e,n,a],[e,t,a],[e,t,r],[e,n,r]]],[[0,1,0],[[s,n,a],[e,n,a],[e,n,r],[s,n,r]]],[[0,-1,0],[[e,t,a],[s,t,a],[s,t,r],[e,t,r]]]],c=new Float32Array(72),l=new Float32Array(72),f=new Uint32Array(36);return o.forEach(([d,h],g)=>{h.forEach((u,y)=>{c.set(u,(g*4+y)*3),l.set(d,(g*4+y)*3)});let p=g*4;f.set([p,p+1,p+2,p,p+2,p+3],g*6)}),{position:c,normal:l,netId:new Uint32Array(24),objectFeatureId:new Uint32Array(24).fill(i),indices:f,material:s1,bounds:[e,t,a,s,n,r]}}function r1(e,t,a=k){let s=a.scene.features.get(Number(e));if(!s||!t.length)return;let n=[1/0,1/0,1/0,-1/0,-1/0,-1/0];for(let r=0;r<t.length;r+=3)n[0]=Math.min(n[0],t[r]),n[1]=Math.min(n[1],t[r+1]),n[2]=Math.min(n[2],t[r+2]),n[3]=Math.max(n[3],t[r]),n[4]=Math.max(n[4],t[r+1]),n[5]=Math.max(n[5],t[r+2]);s.bounds=s.bounds?[Math.min(s.bounds[0],n[0]),Math.min(s.bounds[1],n[1]),Math.min(s.bounds[2],n[2]),Math.max(s.bounds[3],n[3]),Math.max(s.bounds[4],n[4]),Math.max(s.bounds[5],n[5])]:n}function Cr(e,t=k){return sc(e,t.scene.copperLayers)}var i1=[.55,.35,.16,.78];function zh(e=k){return rc(e.topology?.board?.stackup?.copper_finish)}function Kh(e,t=k){return ic(e,t.scene.copperLayers)}var o1=.25;function Oa(){return!w.realisticColors||w.mode==="layer"?0:1-ce(w.separation/o1,0,1)}function Do(e,t=k){let a=Kh(e,t)?zh(t):za.copper;return Vh(Cr(e,t),a,Oa())}function Vh(e,t,a){return e.map((s,n)=>s+(t[n]-s)*a)}function c1(e,t=we){if(t===we&&v&&U){vw(e,t);return}if(t!==we||!k.renderer||!U)return;let a=performance.now(),s=Math.max(0,e-Yt);if(w.workspace==="schematic"&&N){Yt=e;let l=N.visiblePages(),f=Z?p1(l):[];N.setDomDetailPageIds(f.map(d=>d.id)),D.visiblePages=N.render(),Z?.syncWorldPages(f,N,{activeNetUid:D.activeNetUid}),mb(),vo(s,performance.now()-a),wo(e),Is(t);return}let n=Math.min(.05,(e-Yt)/1e3);Yt=e,U.update(n),k.renderer.resize();let r=Wh();k.scene.copperRealism!==Oa()&&Ps();for(let l of k.renderer.entries)l.layerOffset=r[l.layerId]||0;g1(e),ua=$h(e);let i=y1(e);Q={layerId:0,viewport:{x:0,y:0,width:j.width,height:j.height},matrix:U.matrix(j.width,j.height,w.mode==="layer"),lod:bh(j.height,w.mode==="layer")},k.renderer.selectedOccurrence=w.selectedFeatureId||w.activeNetId?w.selectedOccurrence:-1,k.renderer.setInnerCopperMode(ih(!w.showBoard||w.separation>.001,Ca().size>0)),Me(e);let o=w.mode==="3d"?k.visible3dLayers:oh(),c={panels:[Q],activeNetId:w.activeNetId,selectedFeatureId:w.selectedFeatureId,time:e/1e3,layerOffsets:r,visibleLayers:o,showBoard:w.showBoard,showComponents:w.showComponents,showPaste:w.separation===0,componentOpacity:ce(1-w.separation/.1,0,1),boardOpacity:Ca().size?.34:1-w.separation*.72,isolateNet:w.isolateNet,compareMode:w.mode==="layer",compareOffsets:ua,layerAlphas:i,visibleTileIds:w.mode==="3d"?k.visibleTileIds:null};if(Na=c,u1(e,c)){k.renderer.render(c),pb(),U1();for(let l of xr)l()}Gh(e),vo(s,performance.now()-a),wo(e),Is(t)}var Hh=1e3,ut={key:"",matrix:new Float32Array(16),tiles:null,at:0},Na=null,se={canvas:null,context:null,depth:null,depthView:null,width:0,height:0},Rs=new Hn(3e3),xr=new Set,rr={frames:0,cpuMs:0,gpuMs:0,lastTriangles:0},yo={cullTiles:!0};function l1(e,t){let a=k.renderer;se.canvas||(se.canvas=document.createElement("canvas"),se.context=se.canvas.getContext("webgpu")),!(se.width>=e&&se.height>=t&&se.depth)&&(se.width=Math.max(se.width,e),se.height=Math.max(se.height,t),se.canvas.width=se.width,se.canvas.height=se.height,se.context.configure({device:a.device,format:a.format,alphaMode:"opaque"}),se.depth?.destroy(),se.depth=a.device.createTexture({label:"inset-depth",size:[se.width,se.height],format:a.depthFormat,usage:GPUTextureUsage.RENDER_ATTACHMENT}),se.depthView=se.depth.createView())}function qh(){return!!(!v&&k.renderer&&Na&&w.workspace==="pcb")}function d1(e,t,a="inset"){if(!qh())return!1;let s=e.clientWidth,n=e.clientHeight;if(!s||!n)return!1;let r=performance.now(),i=Math.min(devicePixelRatio||1,2),o=Math.round(s*i),c=Math.round(n*i);l1(o,c);let l=St(k.scene.runtimeBounds),f=$i(t,s,n,l,t.focusZ??0);Rs.record(a,f,r);let d={layerId:0,viewport:{x:0,y:0,width:o,height:c},matrix:f,lod:Na.panels[0].lod},h=Na.visibleTileIds;if(h&&yo.cullTiles){let u=new Set;for(let y of h){let b=k.scene.tiles.get(y);b&&gr(b,f,null,0,k)&&u.add(y)}h=u}let g=k.renderer.renderInto({colorView:se.context.getCurrentTexture().createView(),depthView:se.depthView,width:se.width,height:se.height},d,{...Na,panels:[d],visibleTileIds:h});return e.width!==o&&(e.width=o),e.height!==c&&(e.height=c),e.getContext("2d").drawImage(se.canvas,0,0,o,c,0,0,o,c),rr.frames+=1,rr.cpuMs+=performance.now()-r,rr.lastTriangles=g.triangles,!0}function u1(e,t){let a=t.panels[0].matrix,s=!1;for(let o=0;o<16;o+=1)if(a[o]!==ut.matrix[o]){s=!0;break}if(s)return ut.matrix.set(a),ut.key="",ut.at=e,!0;let n=[j.width,j.height,k.renderer.version,k.renderer.selectedOccurrence,w.workspace,w.mode,t.activeNetId,t.selectedFeatureId,t.showBoard,t.showComponents,t.showPaste,t.componentOpacity,t.boardOpacity,t.isolateNet,k.scene.layerZOffsetSignature,[...t.visibleLayers].join(","),[...t.compareOffsets].map(([o,c])=>`${o}:${c}`).join(";"),t.layerAlphas?[...t.layerAlphas].join(";"):""].join("|");return!!(t.activeNetId||t.selectedFeatureId||k.renderer.emphasizedNetIds.size)||n!==ut.key||!Xh(t.visibleTileIds,ut.tiles)||e-ut.at>Hh?(ut.key=n,ut.tiles=t.visibleTileIds,ut.at=e,!0):!1}var f1=1e3/30-2,Ge={scene:null,key:"",matrix:new Float32Array(16),tiles:new Map,at:0};function h1(e,t,a){let s=Q.matrix,n=!1;for(let h=0;h<16;h+=1)if(s[h]!==Ge.matrix[h]){n=!0;break}if(Ge.scene!==v.scene&&(Ge.scene=v.scene,n=!0),n)return Ge.matrix.set(s),Ge.key="",Ge.at=e,!0;let r=[j.width,j.height,w.showBoard,w.showComponents,w.isolateNet,w.activeNetId,w.selectedFeatureId,w.selectedOccurrence,v.showLabels,a,Oa(),Oo(),v.scene.tubeVersion];for(let h of v.scene.renderers){let g=t.get(h);r.push(h.version,h.occurrenceCount,h.selectedOccurrence,h.dimCopper,h.standIn?h.boxColor.join(","):"",g?[...g.visibleLayers].join(","):"",g?.layerOffsets?Array.prototype.join.call(g.layerOffsets,","):"")}let i=r.join("|"),o=!1;for(let[h,g]of t)Xh(g.visibleTileIds,Ge.tiles.get(h))||(o=!0);let c=!!(a||w.activeNetId||w.selectedFeatureId),l=o||i!==Ge.key,f=c&&e-Ge.at>=f1;return l||f||e-Ge.at>Hh?(Ge.key=i,Ge.tiles=new Map([...t].map(([h,g])=>[h,g.visibleTileIds])),Ge.at=e,!0):!1}function Xh(e,t){if(!e||!t)return e===t;if(e.size!==t.size)return!1;for(let a of e)if(!t.has(a))return!1;return!0}function b1(e){if(!N||!e)return{widthPx:0,heightPx:0,sourcePxPerMm:0,area:0};let t=N.pagePixelWidth(e),a=e.heightMm/Math.max(1e-6,N.scale),s=N.pageSourcePixelsPerMm(e);return{widthPx:t,heightPx:a,sourcePxPerMm:s,area:t*a}}function p1(e){if(!Z||!N)return[];let t=e||[],a=Math.max(1,Fe.clientWidth*Fe.clientHeight);return t.map(r=>({page:r,...b1(r)})).filter(r=>r.widthPx>=760&&r.heightPx>=520&&r.area>=a*.36&&r.sourcePxPerMm>=1.25).sort((r,i)=>i.area-r.area).slice(0,1).map(r=>r.page)}function Wh(e=k){let t=fa(e),a=Math.hypot((t[3]-t[0])*1e3,(t[4]-t[1])*1e3),s=w.separation*w.separation*ce(a*.12,8,25)/1e3,n=`${w.separation}:${s}:${e.scene.copperLayers.length}`;if(e.scene.layerZOffsetSignature===n)return e.scene.layerZOffsets;let r=e.scene.layerZOffsets;r.fill(0);let i=(e.scene.copperLayers.length-1)/2;return e.scene.copperLayers.forEach((o,c)=>{r[Number(o.id)]=(i-c)*s}),e.scene.layerZOffsetSignature=n,r}function $h(e){if(w.mode!=="layer")return Ae.key="3d",Ae.current.clear(),new Map;let t=k.scene.copperLayers.filter(y=>k.compareLayers.has(Number(y.id))),a=Math.max(1,t.length),s=j.width/Math.max(1,j.height),n=1;a===2?n=s>=1?2:1:a===3||a===4?n=2:a>4&&(n=Math.ceil(Math.sqrt(a*s)));let r=Math.ceil(a/n),i=fa(),o=i[3]-i[0],c=i[4]-i[1],l=o*1.18,f=c*1.22,d=t.map((y,b)=>{let m=b%n,x=Math.floor(b/n);return{layer:y,layerId:Number(y.id),column:m,row:x,offset:[(m-(n-1)/2)*l,((r-1)/2-x)*f,0]}}),h=`${n}x${r}:${d.map(y=>y.layerId).join(",")}`;if(h!==Ae.key){Ae.key=h,Ae.started=e,Ae.from=new Map(Ae.current);let y=n*o+(n-1)*(l-o),b=r*c+(r-1)*(f-c);U.targetFocus=[(i[0]+i[3])/2,(i[1]+i[4])/2,(i[2]+i[5])/2],U.targetOrthoScale=Math.max(b,y/s)*1.08}let g=ce((e-Ae.started)/420,0,1),p=1-Math.pow(1-g,3),u=new Map;for(let y of d){let b=Ae.from.get(y.layerId)||[0,0,0],m=y.offset.map((x,M)=>b[M]+(x-b[M])*p);u.set(y.layerId,m),Ae.current.set(y.layerId,m)}if(X.phase==="reveal")for(let y of X.previous)u.has(Number(y))||u.set(Number(y),X.previousOffsets.get(Number(y))||[0,0,0]);for(let y of[...Ae.current.keys()])d.some(b=>b.layerId===y)||Ae.current.delete(y);return u}function Fs(e){let t=new Set([...e].map(Number));if(!(Lf(t,k.desiredCompareLayers)&&X.phase!=="idle")){if(k.desiredCompareLayers=t,Lf(t,k.compareLayers)){X.phase="idle",X.previous.clear(),X.target.clear();return}X.phase="preload",X.previous=new Set(k.compareLayers),X.target=new Set(t),X.previousOffsets=new Map(Ae.current),X.started=performance.now(),Me(X.started,{force:!0})}}function Uo({snap:e=!0}={}){w.mode="layer";let t=rw();k.desiredCompareLayers=new Set(t),!k.compareLayers.size&&t.size&&(k.compareLayers=new Set(t)),X.phase="idle",X.previous.clear(),X.target.clear(),Ae.key="",U.setAxis("z",!1),k.renderer?.resize(),ua=$h(performance.now()),e&&U.snap(),Me(performance.now(),{force:!0})}function g1(e){if(!(w.mode!=="layer"||X.phase==="idle")){if(X.phase==="preload"){if(!m1(X.target)){Me(e,{force:!0});return}X.phase="reveal",X.started=e,X.previousOffsets=new Map(Ae.current),k.compareLayers=new Set(X.target),Ae.key="";return}X.phase==="reveal"&&e-X.started>=zf&&(k.compareLayers=new Set(X.target),X.phase="idle",X.previous.clear(),X.target.clear(),X.previousOffsets.clear(),Me(e,{force:!0}))}}function m1(e,t=k){for(let a of t.scene.tiles.values())if(e.has(Number(a.layerId))&&!t.scene.residentTiles.has(a.id)&&!t.scene.failed.has(a.id))return!1;return!0}function y1(e){if(w.mode!=="layer"||X.phase!=="reveal")return null;let t=ce((e-X.started)/zf,0,1),a=t*t*(3-2*t),s=new Map;for(let n of X.previous)s.set(Number(n),X.target.has(Number(n))?1:1-a);for(let n of X.target)s.set(Number(n),X.previous.has(Number(n))?1:a);return s}function Lf(e,t){if(e.size!==t.size)return!1;for(let a of e)if(!t.has(a))return!1;return!0}function Go(){if(w.workspace==="schematic"){v1();return}if(w.workspace==="bom"){x1();return}if(w.workspace==="stackup")return;Mr.textContent=k.viewerReadiness.stage==="semantic-ready"?"Semantic GLTF A0":"Prism staged 3D",kr.textContent="Layers",Er.textContent="Visibility and compare",Y('[data-panel="search"] .section-heading span').textContent="Nets, components and pins",Y('[data-panel="view"] .section-heading span').textContent="Camera and stackup";let e=`
    <div class="mode-toolbar">
      <button data-mode="layer">PCB</button>
      <button data-mode="3d">3D</button>
    </div>`;Ra&&(Ra.innerHTML=e),st.innerHTML=`
    ${Ra?"":e}
    <div class="layer-presets">
      <button data-preset="all">All</button><button data-preset="none">None</button>
      <button data-preset="outer">Outer</button><button data-preset="inner">Inner</button>
    </div>
    <div class="layer-list"></div>`,ve.innerHTML=`
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
    </label>`,Pe(),A1()}function x1(){Mr.textContent="BoM A0",kr.textContent="Bill of Materials",Er.textContent="Grouped procurement view",Y('[data-panel="search"] .section-heading span').textContent="Search inside the BoM table",Y('[data-panel="view"] .section-heading span').textContent="BoM actions";let e=nt?.payload?.counts||{};st.innerHTML=`
    <div class="selection-properties">
      <div class="selection-property"><small>Rows</small><strong>${e.rows||0}</strong></div>
      <div class="selection-property"><small>Components</small><strong>${e.components||0}</strong></div>
      <div class="selection-property"><small>DNP</small><strong>${e.dnpComponents||0}</strong></div>
    </div>
    <div class="selection-section">
      <span class="selection-section-title">Columns</span>
      <div class="selection-empty">Primary procurement and thermal columns are shown first. Additional symbol and footprint metadata is available in the row detail panel.</div>
    </div>`,ve.innerHTML=`
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
    </div>`,ve.querySelector("#clear-selection")?.addEventListener("click",Oe)}function v1(){Mr.textContent=Z?"Schematic SVG DOM":D.manifest?.schema==="prism.schematic_vector_a0"?"Schematic Vector A0":"Schematic World A0",kr.textContent="Pages",Er.textContent=`${D.pages.length} hierarchy instances`,Y('[data-panel="search"] .section-heading span').textContent="Pages, nets and components",Y('[data-panel="view"] .section-heading span').textContent="World navigation",st.innerHTML=`
    <div class="layer-presets">
      <button data-page-action="world">Fit world</button>
      <button data-page-action="parent">Parent</button>
      <button data-page-action="previous">Previous</button>
      <button data-page-action="next">Next</button>
    </div>
    <div class="page-list">${D.pages.map(e=>`
      <button class="page-row ${e.id===w.selectedPageId?"active":""}" data-page="${e.id}">
        <span>${e.sheetNumber}</span>
        <strong>${z(e.name)}</strong>
        <small>L${e.depth}</small>
      </button>`).join("")}</div>`,ve.innerHTML=`
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
    </div>`,st.querySelectorAll("[data-page]").forEach(e=>{e.addEventListener("click",()=>Et(e.dataset.page,!0))}),st.querySelectorAll("[data-page-action]").forEach(e=>{e.addEventListener("click",()=>ir(e.dataset.pageAction))}),ve.querySelector("#entity-search").addEventListener("input",e=>{M1(e.target.value)}),ve.querySelector("#frame-selection").addEventListener("click",Qh),ve.querySelector("#clear-selection").addEventListener("click",Os),De.querySelector("#show-hierarchy").checked=N?.showHierarchy??!0,De.querySelector("#show-hierarchy").addEventListener("change",e=>{N.showHierarchy=e.target.checked})}function Et(e,t){let a=D.byId.get(e);!a||!N||(w.selectedPageId=a.id,w.selectedSchematicFeature=null,N.selectedPageId=a.id,N.selectedFeatureId=0,bt.textContent=JSON.stringify(a,null,2),t&&N.framePage(a),st.querySelectorAll("[data-page]").forEach(s=>{s.classList.toggle("active",s.dataset.page===a.id)}))}function ir(e){if(!N)return;if(e==="world"){N.frameWorld();return}let t=Math.max(0,D.pages.findIndex(s=>s.id===w.selectedPageId)),a=null;e==="previous"?a=D.pages[(t-1+D.pages.length)%D.pages.length]:e==="next"?a=D.pages[(t+1)%D.pages.length]:e==="parent"&&(a=D.byId.get(D.pages[t]?.parentId)),a&&Et(a.id,!0)}function w1(e){if(!e||!N)return;if(Os(),e.kind==="page"&&e.pageId){Et(e.pageId,!0);return}if(e.kind!=="sheet")return;let t=D.pages.find(r=>r.sheetInstancePath===e.sheetInstancePath)||D.byId.get(w.selectedPageId),a=String(e.sheetFile||e.feature?.sheet_file||"").replace(/\\/g,"/"),s=String(e.sheetName||e.feature?.sheet_name||e.feature?.objectId||""),n=D.pages.find(r=>{if(t&&r.parentId&&r.parentId!==t.id)return!1;let i=String(r.sourcePath||"").replace(/\\/g,"/");return a&&i.endsWith(a)||s&&r.name===s})||D.pages.find(r=>{let i=String(r.sourcePath||"").replace(/\\/g,"/");return a&&i.endsWith(a)||s&&r.name===s});n&&Et(n.id,!0)}function M1(e){let t=ve.querySelector("#search-results"),a=e.trim().toLowerCase();if(!a){t.innerHTML="";return}let s=D.pages.filter(r=>`${r.name} ${r.sheetPath}`.toLowerCase().includes(a)).slice(0,8),n=k.scene.nets.filter(r=>String(r.name).toLowerCase().includes(a)).slice(0,8);t.innerHTML=[...s.map(r=>`<button data-page="${r.id}"><b>${z(r.name)}</b><span>Page ${r.sheetNumber}</span></button>`),...n.map(r=>`<button data-schematic-net="${r.id}"><b>${z(r.name)}</b><span>${(D.manifest.netToPages?.[r.uid]||[]).length} pages</span></button>`)].join(""),t.querySelectorAll("[data-page]").forEach(r=>{r.addEventListener("click",()=>Et(r.dataset.page,!0))}),t.querySelectorAll("[data-schematic-net]").forEach(r=>{r.addEventListener("click",()=>Yh(Number(r.dataset.schematicNet),!0))})}function Yh(e,t){let a=k.scene.nets.find(n=>Number(n.id)===e);if(!a||!N)return;w.activeNetId=e,w.selectedFeatureId=0,w.selectedSchematicFeature=null,N.selectedFeatureId=0,N.selectedFeatureKey="",N.selectedSourceId="",D.activeNetUid=a.uid,N.activeNetUid=a.uid,Z?.setHighlightedNet(a.uid),bt.textContent=JSON.stringify(a,null,2),Ye();let s=D.manifest.netToPages?.[a.uid]||[];t&&s.length&&Et(s[0],!0)}function Jh(e,t=null){let a=k.scene.nets.find(s=>s.uid===e);a&&(w.activeNetId=Number(a.id),D.activeNetUid=a.uid,N&&(N.activeNetUid=a.uid,N.selectedFeatureId=Number(t?.feature?.id||t?.featureId||0),N.selectedFeatureKey=t?.feature?.stableKey||t?.featureKey||"",N.selectedSourceId=t?.feature?.sourceId||t?.sourceId||""),Z?.setHighlightedNet(a.uid),t&&(w.selectedSchematicFeature={...t,pageId:w.selectedPageId}),bt.textContent=JSON.stringify(t?{...t,net:a}:a,null,2),Ye())}function Os(){w.activeNetId=0,w.selectedFeatureId=0,w.selectedSchematicFeature=null,D.activeNetUid="",N&&(N.activeNetUid="",N.selectedFeatureId=0,N.selectedFeatureKey="",N.selectedSourceId=""),Z?.setSelection(null),Z?.setHighlightedNet(""),bt.textContent="No object selected",Ye()}function Qh(){let e=D.byId.get(w.selectedPageId);e?N.framePage(e):N.frameWorld()}function k1(e){w.selectedPageId=e.sheetInstancePath&&D.pages.find(s=>s.sheetInstancePath===e.sheetInstancePath)?.id||w.selectedPageId,w.selectedFeatureId=0,w.selectedSchematicFeature={...e,pageId:w.selectedPageId},e.anchor&&(w.selectionAnchor=e.anchor),N&&(N.selectedPageId=w.selectedPageId,N.selectedFeatureId=Number(e.feature?.id||0));let t=e.netUid?k.scene.nets.find(s=>s.uid===e.netUid):null,a=e.reference?k.scene.componentFeatures.get(e.reference):null;a&&(w.selectedFeatureId=Number(a.featureId||0),nt?.setSelectionByReference(e.reference,{scroll:w.workspace==="bom"})),bt.textContent=JSON.stringify({...e,net:t,component:a},null,2),Ye()}function E1(e){let{page:t,feature:a}=e;if(!a){w.selectedSchematicFeature=null,N.selectedFeatureId=0,Et(t.id,!1),Ye();return}let s=Number(a.id||0);if(w.selectedPageId=t.id,N.selectedPageId=t.id,N.selectedFeatureId=s,w.selectedSchematicFeature={...a,pageId:t.id},w.selectionAnchor=null,a.netUid){let n=k.scene.nets.find(r=>r.uid===a.netUid);if(n){Yh(Number(n.id),!1),w.selectedSchematicFeature={...a,pageId:t.id},N.selectedFeatureId=s;return}}if(a.reference){let n=k.scene.componentFeatures.get(a.reference);if(n){ga(Number(n.featureId),!1),w.selectedSchematicFeature={...a,pageId:t.id},N.selectedFeatureId=s;return}}w.activeNetId=0,w.selectedFeatureId=0,N.activeNetUid="",bt.textContent=JSON.stringify({page:t.name,...a},null,2),Ye()}function pa(){let e=w.isolateNet,t=ve?.querySelector?.("#isolate-net");t?.classList.toggle("active",e),t?.setAttribute("aria-pressed",String(e));let a=te?.querySelector?.("[data-action=isolate]");a?.classList.toggle("active",e),a?.setAttribute("aria-pressed",String(e));let s=De?.querySelector?.("#show-board");s&&(s.checked=w.showBoard);let n=De?.querySelector?.("#show-components");n&&(n.checked=w.showComponents),Qt()}function T1(){let e=new Set;for(let t of Ca())for(let a of zo(t))e.add(a);return e}function zo(e,t=k){let a=new Set,s=t.scene.nets.find(r=>Number(r.id)===Number(e)),n=new Set(t.scene.copperLayers.map(r=>Number(r.id)));for(let r of Object.keys(s?.layerBoundsMm||{})){let i=Number(r);n.has(i)&&a.add(i)}if(!a.size){let r=new Map(t.scene.copperLayers.map(i=>[i.name,Number(i.id)]));for(let i of s?.metrics?.layers||[]){let o=r.get(i);o!=null&&a.add(o)}}if(a.size)return a;for(let r of t.scene.tiles.values())fh(r,e)&&a.add(Number(r.layerId));return a}function Pa(){if(v){for(let t of rt())Ar(t);return}let e=T1();e.size&&(k.visible3dLayers=new Set(e),w.mode==="layer"?Fs(e):(k.compareLayers=new Set(e),k.desiredCompareLayers=new Set(e)),Me(performance.now(),{force:!0}))}function Ua(e){let t=!!(e&&La()),a=w.isolateNet;if(t&&!w.isolateNet&&!v&&(k.preIsolation3dLayers=new Set(k.visible3dLayers),k.preIsolationCompareLayers=new Set(k.desiredCompareLayers.size?k.desiredCompareLayers:k.compareLayers)),w.isolateNet=t,v)Pa();else if(w.isolateNet)Pa();else if(k.preIsolation3dLayers||k.preIsolationCompareLayers){if(k.preIsolation3dLayers&&(k.visible3dLayers=new Set(k.preIsolation3dLayers)),k.preIsolationCompareLayers){let s=new Set(k.preIsolationCompareLayers);w.mode==="layer"?Fs(s):(k.compareLayers=s,k.desiredCompareLayers=new Set(s))}k.preIsolation3dLayers=null,k.preIsolationCompareLayers=null,Me(performance.now(),{force:!0})}t&&!a?(w.preIsolationShowBoard=w.showBoard,w.showBoard=!1):!t&&a&&(typeof w.preIsolationShowBoard=="boolean"&&(w.showBoard=w.preIsolationShowBoard),w.preIsolationShowBoard=null),pa(),Pe()}function Pe(){(Ra||st).querySelectorAll("[data-mode]").forEach(a=>{let s=a.dataset.mode===w.mode;a.classList.toggle("active",s),a.setAttribute("aria-pressed",String(s))}),De.querySelector("#show-board").checked=w.showBoard,De.querySelector("#show-components").checked=w.showComponents,De.querySelector("#separation").value=w.separation;let e=st.querySelector(".layer-list"),t=w.mode==="3d"?k.visible3dLayers:k.desiredCompareLayers;e.innerHTML=k.scene.copperLayers.map((a,s)=>`
    <label class="layer-row">
      <input type="checkbox" data-layer="${a.id}" ${t.has(Number(a.id))?"checked":""}>
      <span class="swatch" style="background:${$o(Cr(a))}"></span>
      <span>${z(a.name)}</span><small>${s+1}</small>
    </label>`).join(""),e.querySelectorAll("[data-layer]").forEach(a=>a.addEventListener("change",()=>{eb(Number(a.dataset.layer),a.checked)})),pa()}function Zh(e){e==="layer"?Uo():(w.mode="3d",U.frame(fa()),U.snap(),k.visibleTileIds=new Set,Me(performance.now(),{force:!0})),Pe()}function eb(e,t,a=null){if(v){let s=Number(e);Bo(a==null?null:[a],n=>t?n.delete(s):n.add(s));return}if(w.mode==="3d")t?k.visible3dLayers.add(e):k.visible3dLayers.delete(e),Me(performance.now(),{force:!0});else{let s=new Set(k.desiredCompareLayers);t?s.add(e):s.delete(e),Fs(s)}Pe()}function tb(e,t=null){if(v){Bo(t==null?null:[t],(s,n)=>{let r=n?.scene.copperLayers||[];s.clear(),r.forEach((i,o)=>{e==="all"||e==="outer"&&(o===0||o===r.length-1)||e==="inner"&&o>0&&o<r.length-1||s.add(Number(i.id))})});return}let a=w.mode==="3d"?k.visible3dLayers:new Set;a.clear();for(let[s,n]of k.scene.copperLayers.entries())(e==="all"||e==="outer"&&(s===0||s===k.scene.copperLayers.length-1)||e==="inner"&&s>0&&s<k.scene.copperLayers.length-1)&&a.add(Number(n.id));w.mode==="3d"?Me(performance.now(),{force:!0}):Fs(a),Pe()}function ab(e){w.showBoard=!!e,w.savedShowBoard=w.showBoard,w.showBoard&&w.isolateNet?Ua(!1):pa()}function sb(e){w.showComponents=!!e,w.savedShowComponents=w.showComponents,pa()}function S1(e){w.showPlaceholders=!!e;for(let t of v?rt():[k])t.renderer?.setPlaceholdersVisible(w.showPlaceholders);Qt()}function I1(e){w.realisticColors=!!e,Ps(),Qt()}function Ps(e=k){if(!e.renderer)return;let t=new Map(e.scene.layers.map(a=>[Number(a.id),a]));for(let a of e.renderer.entries)a.kind==="copper"&&(a.color=Do(t.get(Number(a.layerId)),e));e.renderer.setBarrelColor(Vh(i1,[...zh(e).slice(0,3),.78],Oa())),e.scene.copperRealism=Oa()}function nb(e,t=null){if(v){Aw(ce(Number(e)||0,0,1),t);return}w.separation=ce(Number(e)||0,0,1),Qt()}function A1(){(Ra||st).querySelectorAll("[data-mode]").forEach(t=>t.addEventListener("click",()=>{Zh(t.dataset.mode)})),st.querySelectorAll("[data-preset]").forEach(t=>t.addEventListener("click",()=>{tb(t.dataset.preset)})),De.querySelector("#show-board").addEventListener("change",t=>{ab(t.target.checked)}),De.querySelector("#show-components").addEventListener("change",t=>{sb(t.target.checked)}),De.querySelector("#separation").addEventListener("input",t=>{nb(t.target.value)}),ve.querySelector("#clear-selection").addEventListener("click",Oe),ve.querySelector("#isolate-net").addEventListener("click",()=>{Ua(!w.isolateNet)}),ve.querySelector("#frame-selection").addEventListener("click",Xo),ve.querySelector("#show-net-layers").addEventListener("click",Ko);let e=ve.querySelector("#entity-search");e.addEventListener("input",()=>ib(e.value))}function rb(){la(".rail-tab").forEach(e=>e.addEventListener("click",()=>{let t=e.dataset.tab,a=w.activeTab===t&&!kt.classList.contains("panel-collapsed");w.activeTab=t,kt.classList.toggle("panel-collapsed",a),la(".rail-tab").forEach(s=>{s.classList.toggle("active",!a&&s.dataset.tab===t)}),la(".tab-panel").forEach(s=>{s.classList.toggle("active",!a&&s.dataset.panel===t)})}))}function Ko(){if(v){Tw();return}let e=k.scene.nets.find(s=>Number(s.id)===w.activeNetId);if(!e)return;let t=new Set(e.metrics?.layers||[]),a=w.mode==="3d"?k.visible3dLayers:new Set;a.clear();for(let s of k.scene.copperLayers)t.has(s.name)&&a.add(Number(s.id));w.mode==="3d"?Me(performance.now(),{force:!0}):Fs(a),Pe()}function ib(e){let t=ve.querySelector("#search-results"),a=e.trim().toLowerCase();if(!a){t.innerHTML="";return}let s=k.scene.nets.filter(r=>String(r.name).toLowerCase().includes(a)).slice(0,8),n=[...k.scene.componentFeatures.values()].filter(r=>!k.hiddenComponents.has(String(r.designator||""))&&`${r.designator} ${r.value} ${r.footprint}`.toLowerCase().includes(a)).slice(0,6);t.innerHTML=[...s.map(r=>`<button data-net="${r.id}"><b>${z(r.name)}</b><span>${z(r.netClass||"")}</span></button>`),...n.map(r=>`<button data-feature="${r.featureId}"><b>${z(r.designator)}</b><span>${z(r.value)}</span></button>`)].join(""),t.querySelectorAll("[data-net]").forEach(r=>{r.addEventListener("click",()=>Vo(Number(r.dataset.net),!0))}),t.querySelectorAll("[data-feature]").forEach(r=>{r.addEventListener("click",()=>ga(Number(r.dataset.feature),!0))})}function Vo(e,t){t&&(w.selectionAnchor=null),w.activeNetId=e,w.selectedFeatureId=0;let a=k.scene.nets.find(s=>Number(s.id)===e);w.workspace==="schematic"&&a&&N&&(D.activeNetUid=a.uid,N.activeNetUid=a.uid),So(),bt.textContent=JSON.stringify(a||{},null,2),Ye(),w.isolateNet&&Pa(),t&&a?.boundsMm&&U.frame(To(Va(a.boundsMm))),Me(performance.now(),{force:!0}),Sr(eh(a))}function ga(e,t=!1){let a=k.scene.features.get(e);if(a?.kind==="component"&&Xs(ja(a),k.hiddenComponents))return;t&&(w.selectionAnchor=null),w.selectedFeatureId=e,w.activeNetId=Number(a?.netId||0);let s=ja(a);s&&nt?.setSelectionByReference(s,{scroll:w.workspace==="bom"});let n=th(a);n?.kind==="net"?So():ah(),bt.textContent=a?JSON.stringify(a,null,2):"No object selected",Ye(),w.isolateNet&&w.activeNetId&&Pa(),t&&a?.bounds&&qo(a),Me(performance.now(),{force:!0}),Sr(n)}function Ho(e,t=!1){if(Xs(e,k.hiddenComponents))return;let a=k.scene.componentFeatures.get(e);if(nt?.setSelectionByReference(e,{scroll:w.workspace==="bom"}),!a?.featureId)return;ah(),ga(Number(a.featureId),!1);let s=_1(e);if(s){let{page:n,feature:r}=s;w.selectedPageId=n.id,w.selectedSchematicFeature={...r,pageId:n.id},N&&(N.selectedPageId=n.id,N.selectedFeatureId=Number(r.id||0)),Z?.setSelection?.({kind:"component",featureKey:r.stableKey||"",sheetInstancePath:r.sheetInstancePath||n.sheetInstancePath||"",sourceId:r.sourceId||r.uuid||"",reference:e,feature:r,pageId:n.id}),t&&w.workspace==="schematic"&&(Et(n.id,!0),Z?.frameSelection?.())}if(t&&w.workspace==="pcb"){let n=k.scene.features.get(Number(a.featureId));n?.bounds&&qo(n,!0)}Ye()}function ja(e){return e?.designator||e?.reference||e?.componentDesignator||""}function R1(e=k){return cc(e.scene.manifest?.components||[],e.scene.componentModelCounts)}function ob(e){k.hiddenComponentRequest=e;let t=lc(e,R1());k.hiddenComponents=t.hiddenReferences,k.renderer?.setHiddenFeatureIds(t.hiddenFeatureIds),t.ambiguous.length&&console.warn(`[prism-semantic-viewer] keeping ambiguous components visible: ${t.ambiguous.join(", ")}`),t.unknown.length&&console.warn(`[prism-semantic-viewer] ignoring unknown components: ${t.unknown.join(", ")}`);let a=ja(k.scene.features.get(w.selectedFeatureId));Xs(a,k.hiddenComponents)&&Oe();let s=ve.querySelector("input");return s?.value&&ib(s.value),t}function qo(e,t=!1){if(!e?.bounds)return;let a=To(e.bounds);if(t||e.kind==="component"||!!ja(e)){let r=(a[2]+a[5])*.5<0,i=U.isBelow();r!==i&&U.setAxis("z",r)}U.frame(a)}function _1(e){if(!e||!N?.featuresByPage)return null;let t=D.byId.get(w.selectedPageId),a=[...t?[t]:[],...(D.pages||[]).filter(n=>n.id!==t?.id)],s=n=>{let r=String(n.kind||"").toLowerCase();return r==="component"||r==="symbol_body"||r==="symbol_instance"?0:r==="symbol_reference"?1:r.startsWith("pin")?2:3};for(let n of a){let r=(N.featuresByPage[n.id]||[]).filter(i=>String(i.reference||i.designator||i.componentDesignator||"")===e).sort((i,o)=>s(i)-s(o));if(r.length)return{page:n,feature:r[0]}}return null}function Oe(){w.activeNetId=0,w.selectedFeatureId=0,v&&(v.boardSelected=!1,v.standInKey=null),w.selectedSchematicFeature=null,w.selectionAnchor=null;let e=La(),t=w.isolateNet;t&&!e?Ua(!1):e?t&&Pa():w.isolateNet=!1,e||sh(),D.activeNetUid="",N&&(N.activeNetUid=""),Z?.setSelection(null),Z?.setHighlightedNet(""),bt.textContent="No object selected",nt?.clearSelection?.(),Ye(),Sr(null)}function or(e){return`<div class="selection-properties">${e.map(([t,a])=>`
    <div class="selection-property">
      <small>${z(t)}</small>
      <strong title="${z(String(a))}">${z(String(a))}</strong>
    </div>`).join("")}</div>`}function vr(e,t,a){return`
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
      <div class="selection-card-title"><small>${z(e)}</small><strong>${z(t)}</strong></div>
      <button class="selection-card-close" type="button" aria-label="Clear selection">&times;</button>
    </div>`}function N1(e){let a=(k.topology.net_details?.[e.uid]||{}).terminals||[],s=e.metrics||{},n=Number(s.traceLengthMm||0).toFixed(2),r=s.objectCounts?.via||0,i=a.length,c=/^(VCC|VDD|GND|3V3|5V|12V|VIN|POWER)/i.test(e.name)?"#10b981":"#8b5cf6",l=e.netClass||"Default",f=a.length?a.map(d=>`
      <div class="selection-row pin-row-interactive" data-ref="${z(d.designator)}" data-pin="${z(d.pin)}">
        <span class="refdes-col"><strong>${z(d.designator)}</strong></span>
        <span class="pin-col">Pin ${z(d.pin)}</span>
        <span class="val-col" title="${z(d.value||"")}">${z(d.value||"-")}</span>
      </div>`).join(""):'<div class="selection-empty">No connected pin metadata is available.</div>';return`
    ${vr("Net",e.name,c)}
    <div class="selection-net-dashboard">
      <div class="net-metric-grid">
        <div class="metric-card">
          <small>Length</small>
          <strong>${n} <span class="unit">mm</span></strong>
        </div>
        <div class="metric-card">
          <small>Vias</small>
          <strong>${r}</strong>
        </div>
        <div class="metric-card">
          <small>Pins</small>
          <strong>${i}</strong>
        </div>
        <div class="metric-card">
          <small>Class</small>
          <strong title="${z(l)}">${z(l)}</strong>
        </div>
      </div>
      
      <div class="selection-section">
        <span class="selection-section-title">Layers</span>
        <div class="net-layers-badges">
          ${(s.layers||[]).length?s.layers.map(d=>`<span class="layer-badge">${z(d)}</span>`).join(""):'<span class="layer-badge unknown">None</span>'}
        </div>
      </div>

      <div class="selection-section">
        <span class="selection-section-title">Connected Pins</span>
        <div class="selection-table compact-scroll" style="max-height: 120px;">
          ${f}
        </div>
      </div>
    </div>`}function B1(e,t=null){let a=ko(e.designator),s=a?a.value:e.value||"Not specified",n=a?a.footprint:e.footprint||"Not specified",r=a?.parameters||{},i=r.Manufacturer||r.Mfr||"",o=r["Manufacturer Part Number"]||r.MPN||r["Part Number"]||"",c=r.kicad_dnp==="true"||r.DNP==="true"||r.kicad_in_bom==="false",l="";(i||o)&&(l=`
      <div class="selection-section">
        <span class="selection-section-title">Component details</span>
        <div class="selection-table">
          <div class="selection-row">
            <span><strong>Manufacturer</strong></span>
            <span title="${z(i)}">${z(i||"-")}</span>
          </div>
          <div class="selection-row">
            <span><strong>Part Number</strong></span>
            <span title="${z(o)}">${z(o||"-")}</span>
          </div>
        </div>
      </div>`);let f="";return t&&(f=`
      <div class="selection-section">
        <span class="selection-section-title">Selected Pin</span>
        <div class="selection-table">
          <div class="selection-row">
            <span><strong>Pin</strong></span>
            <span>Pin ${z(t.pinNumber||t.pin||"")}</span>
            <span title="${z(t.pinName||"")}">${z(t.pinName||"No name")}</span>
          </div>
          <div class="selection-row">
            <span><strong>Net</strong></span>
            <span class="net-ref-interactive" data-net-name="${z(t.netName||"")}">${z(t.netName||"Not connected")}</span>
          </div>
        </div>
      </div>`),`
    ${vr("Component",e.designator||"Unknown","#3b82f6")}
    <div class="selection-component-dashboard">
      ${c?'<div class="dnp-banner" style="background:#b45309;color:#fff;font-size:9px;font-weight:750;text-align:center;padding:3px;margin-bottom:8px;border-radius:2px;text-transform:uppercase;letter-spacing:0.05em;">DNP (Do Not Populate)</div>':""}
      ${or([["Value",s],["Footprint",n.split(":").pop()||n]])}
      ${l}
      ${f}
    </div>`}function C1(e,t){let a=String(e.kind||"").toLowerCase(),s=a.startsWith("pin");if(a==="component"||a.includes("symbol"))return`
      ${vr("Component",e.reference||e.componentDesignator||"Unknown","#3b82f6")}
      ${or([["Value",e.value||e.componentValue||"Not specified"],["Footprint",e.componentFootprint||e.footprint||"Not specified"],["Library",e.libraryRef||"Not specified"],["UID",e.componentUid||e.uuid||e.sourceId||"Not resolved"]])}
      <div class="selection-section">
        <span class="selection-section-title">Schematic placement</span>
        ${or([["Page",t?.name||"Unknown"],["Sheet",e.sheetInstancePath||"/"]])}
      </div>`;let r=s?[["Symbol",e.reference||e.designator||"Unknown"],["Value",e.value||e.componentValue||"Not specified"],["Pin",`${e.pinNumber||"-"}${e.pinName?` ${e.pinName}`:""}`],["Net",e.netName||"Not connected"],["PCB Pad",e.pcbPadId||"Not resolved"],["Component UID",e.componentUid||"Not resolved"]]:[["Page",t?.name||"Unknown"],["Kind",e.kind.replaceAll("_"," ")],["Net",e.netName||"Not connected"]];return`
    ${vr(e.kind.replaceAll("_"," "),e.pinName||e.reference||e.designator||e.text||e.netName||"Schematic object","#3b82f6")}
    ${or(r)}
    <div class="selection-section">
      <span class="selection-section-title">Source identity</span>
      <div class="selection-table">
        <div class="selection-row">
          <span><strong>${s?"Pin UUID":"UUID"}</strong></span>
          <span title="${z(e.uuid||e.sourceId||"")}">${z(e.uuid||e.sourceId||"-")}</span>
          <span title="${z(e.objectId||"")}">${z(e.objectId||"No object ID")}</span>
        </div>
        <div class="selection-row">
          <span><strong>Sheet</strong></span>
          <span>${z(t?.name||"Unknown")}</span>
          <span title="${z(e.sheetInstancePath||"")}">${z(e.sheetInstancePath||"/")}</span>
        </div>
      </div>
    </div>`}function Ye(){if(Qt(),w.workspace==="bom"){te.hidden=!0,te.innerHTML="";return}let e=k.scene.features.get(w.selectedFeatureId),t=e?.kind==="component"?e:null,a=w.workspace==="schematic"?w.selectedSchematicFeature:null,s=a?D.byId.get(a.pageId):null,n=w.activeNetId?k.scene.nets.find(d=>Number(d.id)===w.activeNetId):null;if(!n&&a&&(a.netUid?n=k.scene.nets.find(d=>d.uid===a.netUid):a.netName&&(n=ta(k.scene.nets,a.netName))),!t&&a){let d=a.reference||a.componentDesignator||a.designator;d&&(t=k.scene.componentFeatures.get(d)||{designator:d})}if(!t&&!n&&!a){te.hidden=!0,te.innerHTML="";return}let r="";if(n)r=N1(n);else if(t){let d=a?.kind?.startsWith("pin")?a:null;r=B1(t,d)}else a&&(r=C1(a,s));te.innerHTML=`
    ${r}
    <div class="selection-card-actions">
      ${n?`
        <button type="button" data-action="isolate" aria-keyshortcuts="I" title="Toggle isolated net view (I)" class="${w.isolateNet?"active":""}">Isolate</button>
        <button type="button" data-action="net-layers">Layers</button>
      `:""}
      <button type="button" data-action="frame">Frame selection</button>
    </div>`,te.hidden=!1;let i=w.workspace==="schematic"?Fe:j,o=w.selectionAnchor,c=te.offsetWidth||360,l=te.offsetHeight||330;if(o){let d=Math.max(16,i.clientWidth-c-24),h=Math.max(16,i.clientHeight-l-24);te.style.left=`${ce(o.x+18,16,d)}px`,te.style.top=`${ce(o.y+18,16,h)}px`}else te.style.left="20px",te.style.top="20px";if(te.querySelector(".selection-card-close").addEventListener("click",Oe),te.querySelector("[data-action=frame]").addEventListener("click",Xo),n){let d=te.querySelector("[data-action=isolate]");d&&d.addEventListener("click",()=>{Ua(!w.isolateNet)});let h=te.querySelector("[data-action=net-layers]");h&&h.addEventListener("click",Ko),te.querySelectorAll(".pin-row-interactive").forEach(g=>{g.addEventListener("click",()=>{let p=g.dataset.ref,u=g.dataset.pin;if(!p)return;let m=((k.topology.net_details?.[n.uid]||{}).terminals||[]).find(M=>M.designator===p&&M.pin===u),x=Vv(m);x?ga(x,!0):Ho(p,!0)})})}let f=te.querySelector(".net-ref-interactive");f&&f.addEventListener("click",()=>{let d=f.dataset.netName;if(!d)return;let h=ta(k.scene.nets,d);h&&Vo(Number(h.id),!0)})}function Xo(){if(w.workspace==="schematic"){Qh();return}let e=k.scene.features.get(w.selectedFeatureId);if(e?.bounds)qo(e);else{let t=k.scene.nets.find(a=>Number(a.id)===w.activeNetId);t?.boundsMm&&U.frame(To(Va(t.boundsMm)))}}function cb(){j.addEventListener("contextmenu",e=>e.preventDefault()),j.addEventListener("pointerdown",e=>{v&&(v.framed=!0),!(v&&Ww(e))&&(w.dragging=!0,w.lastX=e.clientX,w.lastY=e.clientY,w.pointerStartX=e.clientX,w.pointerStartY=e.clientY,w.dragMode=w.mode==="layer"||e.shiftKey||e.button!==0?"pan":"orbit",j.setPointerCapture(e.pointerId))}),j.addEventListener("pointermove",e=>{if(v&&Ph(e)||(v?.move.route&&!w.dragging&&(j.style.cursor=Lo(e)?"crosshair":""),!w.dragging))return;let t=e.clientX-w.lastX,a=e.clientY-w.lastY;w.lastX=e.clientX,w.lastY=e.clientY,w.dragMode==="pan"?U.pan(t,a,j.clientHeight,w.mode==="layer"):U.orbit(t,a)}),j.addEventListener("pointerup",async e=>{v&&jh(e)||(w.dragging=!1,j.releasePointerCapture(e.pointerId),!(Math.hypot(e.clientX-w.pointerStartX,e.clientY-w.pointerStartY)>=3)&&(e.button===0?await Uf(e):e.button===2&&await j1(e)))}),j.addEventListener("dblclick",async e=>{await Uf(e),Xo()}),j.addEventListener("wheel",e=>{v&&(v.framed=!0),e.preventDefault(),Math.abs(e.deltaX)>Math.abs(e.deltaY)*.4?U.pan(-e.deltaX,0,j.clientHeight,w.mode==="layer"):U.dolly(e.deltaY,w.mode==="layer")},{passive:!1}),window.addEventListener("keydown",bb),F1()}function F1(){let e=!1,t,a,s=0,n=0;te.addEventListener("pointerdown",r=>{if(!r.target.closest(".selection-card-head")||r.target.closest(".selection-card-close"))return;e=!0,te.classList.add("dragging");let o=te.getBoundingClientRect();s=o.left,n=o.top,t=r.clientX,a=r.clientY,te.setPointerCapture(r.pointerId),r.stopPropagation()}),te.addEventListener("pointermove",r=>{if(!e)return;let i=r.clientX-t,o=r.clientY-a,c=w.workspace==="schematic"?Fe:j,l=te.offsetWidth||360,f=te.offsetHeight||330,d=Math.max(16,c.clientWidth-l-24),h=Math.max(16,c.clientHeight-f-24),g=ce(s+i,16,d),p=ce(n+o,16,h);te.style.left=`${g}px`,te.style.top=`${p}px`,w.selectionAnchor={x:g-18,y:p-18},r.stopPropagation()}),te.addEventListener("pointerup",r=>{e&&(e=!1,te.classList.remove("dragging"),te.releasePointerCapture(r.pointerId),r.stopPropagation())})}function O1(){la("[data-workspace]").forEach(e=>{e.addEventListener("click",()=>lb(e.dataset.workspace))})}function lb(e){if(e==="schematic"&&!N||e==="bom"&&!nt)return;w.workspace=e,kt.classList.remove("workspace-pcb","workspace-schematic","workspace-bom","workspace-stackup"),kt.classList.add(`workspace-${e}`),(e==="schematic"&&(w.activeTab==="view"||w.activeTab==="inspect"||w.activeTab==="stats")||e==="bom"||e==="stackup")&&wr("layers");let t=Y('.rail-tab[data-tab="layers"]');t&&(e==="schematic"?(t.textContent="Pages",t.title="Schematic pages"):e==="bom"?(t.textContent="Summary",t.title="BoM summary"):(t.textContent="Layers",t.title="Layers and compare"));let a=e==="schematic",s=e==="bom",n=e==="stackup";if(j.hidden=a||s||n,Fe&&(Fe.hidden=!a),cr&&(cr.hidden=!a||!Z),lr&&(lr.hidden=!a),dr&&(dr.hidden=!s),Le&&(Le.hidden=!n),Ce.hidden=a||s||n,ur.hidden=a||s||n,Ts&&(Ts.hidden=!a),la("[data-workspace]").forEach(r=>{r.classList.toggle("active",r.dataset.workspace===e)}),Ba.textContent=s?"Semantic BoM active":a?Z?"SVG DOM + WebGPU schematic world active":"WebGPU schematic world active":n?"Layer Stackup active":"WebGPU semantic glTF active",a&&!D.fitted&&(N.resize(),N.frameWorld(),D.fitted=!0),!a&&!s&&!n&&(k.renderer?.resize(),w.mode==="layer"?Uo():Me(performance.now(),{force:!0})),n)try{K1()}catch(r){console.error("Failed to render stackup workspace",r),Le&&(Le.innerHTML=`
          <div class="selection-empty" style="padding:40px;text-align:center;">
            Stackup view failed to render. ${z(r?.message||String(r))}
          </div>
        `)}Go(),Ye()}function P1(){Fe.addEventListener("pointerdown",e=>{Z?.worldActive||Z?.active||(w.schematicDragging=!0,w.schematicLastX=e.clientX,w.schematicLastY=e.clientY,w.schematicStartX=e.clientX,w.schematicStartY=e.clientY,Fe.setPointerCapture(e.pointerId))}),Fe.addEventListener("pointermove",e=>{if(Z?.worldActive||Z?.active||!w.schematicDragging||!N)return;let t=e.clientX-w.schematicLastX,a=e.clientY-w.schematicLastY;w.schematicLastX=e.clientX,w.schematicLastY=e.clientY,N.pan(t,a)}),Fe.addEventListener("pointerup",async e=>{if(!(Z?.worldActive||Z?.active)&&(w.schematicDragging=!1,Fe.releasePointerCapture(e.pointerId),Math.hypot(e.clientX-w.schematicStartX,e.clientY-w.schematicStartY)<3)){let t=await N.pickFeature(e.clientX,e.clientY);t?E1(t):Os()}}),Fe.addEventListener("dblclick",e=>{if(Z?.worldActive||Z?.active)return;let t=N.hitPage(e.clientX,e.clientY);t&&Et(t.id,!0)}),Fe.addEventListener("wheel",e=>{Z?.worldActive||Z?.active||(e.preventDefault(),N.zoom(e.deltaY,e.clientX,e.clientY))},{passive:!1})}var Df=0;async function Uf(e){if(!Q)return;let t=++Df,a=j.getBoundingClientRect();if(w.selectionAnchor={x:e.clientX-a.left,y:e.clientY-a.top},v&&Xw(e))return;let s=await db(e);if(t===Df){if(v){Mw(s);return}(s.kind==="feature"||s.kind==="board")&&(w.selectedOccurrence=s.occurrenceIndex),s.featureId?ga(s.featureId,!0):s.kind==="board"&&!k.renderer.identityOnly?Wo():Oe()}}async function j1(e){if(!Q||!pr)return;let t=await db(e),a=v?v.placements.get(t.occurrenceKey)?.board:k;if(!a)return;let s=a.scene.features.get(t.featureId),n=ja(s),r=n?ko(n,a):null;pr({clientX:e.clientX,clientY:e.clientY,reference:n||void 0,value:String(r?.value||s?.value||"")||void 0})}function L1(e,t){if(!v||!j)return null;let a=j.getBoundingClientRect(),s=(e-a.left)/a.width*2-1,n=1-(t-a.top)/a.height*2,r=yu(U,s,n,a.width/Math.max(a.height,1)),i=v.placed.filter(c=>c.primitives&&c.occurrence.pickSurface).map(c=>({key:c.occurrence.path,matrix:c.matrix,primitives:c.primitives})),o=xu(i,r);return o?{occurrence:o.key,pointMm:o.point.map(c=>c/Co),normal:o.normal,toCamera:r.direction.map(c=>-c)}:null}function D1(e){let t=e!=null?v?.placements.get(String(e)):null;return t?(_o(t),!0):!1}function db(e){let t=j.getBoundingClientRect();return ub((e.clientX-t.left)*j.width/t.width,(e.clientY-t.top)*j.height/t.height)}function ub(e,t){return v?ww(e,t):k.renderer.pick(Q,e,t,{activeNetId:w.activeNetId,selectedFeatureId:w.selectedFeatureId,layerOffsets:Wh(),visibleLayers:w.mode==="3d"?k.visible3dLayers:k.compareLayers,showBoard:w.showBoard,showComponents:w.showComponents,componentOpacity:ce(1-w.separation/.1,0,1),boardOpacity:1-w.separation*.72,isolateNet:w.isolateNet,compareMode:w.mode==="layer",compareOffsets:ua,visibleTileIds:w.mode==="3d"?k.visibleTileIds:null})}async function fb(e,t){if(!Q||!(v||k.renderer))return null;let a=j.getBoundingClientRect(),s=await ub((e-a.left)*j.width/a.width,(t-a.top)*j.height/a.height),n=v?v.placements.get(s.occurrenceKey)?.board:k,r=s.featureId&&n?th(n.scene.features.get(s.featureId),n):null;return{...s,renderer:void 0,selection:r}}function Wo(){let e=w.selectedOccurrence,t=ze;ze=!0;try{Oe()}finally{ze=t}w.selectedOccurrence=e,v&&(v.boardSelected=!0),Sr({kind:"board",sourceContext:"3D"})}function hb(e,t,a){let s=e.scene.componentFeatures.get(String(t)),n=s?e.scene.features.get(Number(s.featureId))?.bounds:null;if(!n)return null;let r=n[2]+n[5]>=0;return a([(n[0]+n[3])/2,(n[1]+n[4])/2,r?n[5]:n[2]])}function xo(e,t){if(!Q)return null;let a=Qa(Q.matrix,bn(t,e),Q.viewport);if(!a)return null;let s=j.getBoundingClientRect();return{x:s.left+a.x*s.width/j.width,y:s.top+a.y*s.height/j.height}}function bb(e){if(!Tr())return;if(gc(e)){e.key==="Escape"&&e.target instanceof HTMLInputElement&&e.target.blur();return}if(mc(e))return;let t=e.key.toLowerCase();if(w.workspace==="schematic"){if(t==="/")e.preventDefault(),wr("search"),ve.querySelector("#entity-search")?.focus();else if(t==="escape")D.activeNetUid?(D.activeNetUid="",w.activeNetId=0,N.activeNetUid="",Z?.setHighlightedNet(""),Ye()):Os();else if(t==="~"||e.key==="~"){e.preventDefault();let a=w.selectedSchematicFeature?.netUid;a&&(D.activeNetUid===a?(D.activeNetUid="",w.activeNetId=0,N.activeNetUid="",Z?.setHighlightedNet("")):Jh(a,w.selectedSchematicFeature))}else if(t==="home")N?.frameWorld();else if(t==="[")ir("previous");else if(t==="]")ir("next");else if(t==="n"){e.preventDefault();let a=N?.cycleNetIntrasheetLink(e.shiftKey?-1:1);a?.pageId&&(w.selectedPageId=a.pageId,N.selectedPageId=a.pageId,mb())}else if(e.altKey&&t==="arrowup")ir("parent");else if(e.key.startsWith("Arrow")){e.preventDefault();let a=e.key==="ArrowRight"?32:e.key==="ArrowLeft"?-32:0,s=e.key==="ArrowDown"?32:e.key==="ArrowUp"?-32:0;N?.pan(a,s)}return}if(v&&Kw(e,t)){e.preventDefault();return}if(t==="/")e.preventDefault(),wr("search"),ve.querySelector("#entity-search").focus();else if(t==="escape")Oe();else if(t==="i"&&w.workspace==="pcb"&&La())e.preventDefault(),Ua(!w.isolateNet);else if(t==="home")U.frame(v&&v.bounds||fa());else if(t==="`")gh(!w.showStats);else if(["x","y","z"].includes(t))U.setAxis(t,e.shiftKey);else if(t==="f")U.flip();else if(t==="r")U.rotateZ(e.shiftKey?-1:1);else if(t===" "){e.preventDefault();let a=k.scene.features.get(w.selectedFeatureId);a?.bounds&&U.setFocus([(a.bounds[0]+a.bounds[3])/2,(a.bounds[1]+a.bounds[4])/2,(a.bounds[2]+a.bounds[5])/2])}else if(e.key.startsWith("Arrow")){e.preventDefault();let a=e.key==="ArrowRight"?32:e.key==="ArrowLeft"?-32:0,s=e.key==="ArrowDown"?32:e.key==="ArrowUp"?-32:0;U.pan(a,s,j.clientHeight,w.mode==="layer")}}function wr(e){w.activeTab=e,kt.classList.remove("panel-collapsed"),la(".rail-tab").forEach(t=>{t.classList.toggle("active",t.dataset.tab===e)}),la(".tab-panel").forEach(t=>{t.classList.toggle("active",t.dataset.panel===e)})}function pb(){let e=Ce.getContext("2d");e.clearRect(0,0,Ce.width,Ce.height);let t=[Ce.width/2,Ce.height/2],a=U.basis(),s=[{axis:"x",label:"X",color:"#e23838",vector:[1,0,0]},{axis:"y",label:"Y",color:"#2dbd50",vector:[0,1,0]},{axis:"z",label:"Z",color:"#3157d5",vector:[0,0,1]}],n=[];for(let r of s)for(let i of[-1,1]){let o=r.vector.map(l=>l*i),c=[co(o,a.right),-co(o,a.up),co(o,a.back)];n.push({...r,sign:i,depth:c[2],point:[t[0]+c[0]*34,t[1]+c[1]*34]})}for(let r of s){let i=n.find(o=>o.axis===r.axis&&o.sign===1);e.strokeStyle=r.color,e.lineWidth=2.4,e.beginPath(),e.moveTo(...t),e.lineTo(...i.point),e.stroke()}hr=[];for(let r of n.sort((i,o)=>o.depth-i.depth)){let i=r.sign===1,o=i?13:9;e.beginPath(),e.arc(r.point[0],r.point[1],o,0,Math.PI*2),e.fillStyle=i?r.color:`${r.color}66`,e.fill(),e.lineWidth=2,e.strokeStyle=z1(r.color,i?.45:.58),e.stroke(),i&&(e.fillStyle="#07101c",e.font="700 13px system-ui",e.textAlign="center",e.textBaseline="middle",e.fillText(r.label,r.point[0],r.point[1]+.5)),hr.push({...r,radius:o+5})}}function gb(){!Ce||Ce.dataset.bound==="true"||(Ce.dataset.bound="true",Ce.addEventListener("click",e=>{let t=Ce.width/Ce.clientWidth,a=Ce.height/Ce.clientHeight,s=[e.offsetX*t,e.offsetY*a],n=hr.map(r=>({item:r,distance:Math.hypot(s[0]-r.point[0],s[1]-r.point[1])})).filter(({item:r,distance:i})=>i<=r.radius).sort((r,i)=>r.distance-i.distance)[0]?.item;n&&U.setAxis(n.axis,n.sign<0)}))}function U1(){if(w.mode!=="layer"||!Q){ur.innerHTML="";return}let e=fa(),t=oh();ur.innerHTML=k.scene.copperLayers.filter(a=>t.has(Number(a.id))).map(a=>{let s=ua.get(Number(a.id))||[0,0,0],n=G1([e[0]+s[0],e[4]+s[1],0],Q.matrix,j.clientWidth,j.clientHeight);return!n||n[0]<-100||n[0]>j.clientWidth+100||n[1]<-100||n[1]>j.clientHeight+100?"":`<span style="left:${n[0]}px;top:${n[1]}px">${z(a.name)}</span>`}).join("")}function mb(){if(w.workspace!=="schematic"||!N){Ts.innerHTML="";return}Ts.innerHTML=D.visiblePages.filter(e=>N.pagePixelWidth(e)>120).map(e=>{let[t,a]=N.worldToScreen(e.worldX+8*N.scale,e.worldY-6*N.scale),s=e.id===w.selectedPageId,r=D.activeNetUid&&e.netUids.includes(D.activeNetUid)?"#18ef52":s?"#3b82f6":"#4b8de8";return`<div class="schematic-page-label" style="left:${t}px;top:${a}px;border-left-color:${r}">
        <strong>${z(e.name)}</strong>
        <small>Page ${e.sheetNumber} &middot; ${e.featureCount.toLocaleString()} features</small>
      </div>`}).join("")}function G1(e,t,a,s){let n=e[0],r=e[1],i=e[2],o=t[0]*n+t[4]*r+t[8]*i+t[12],c=t[1]*n+t[5]*r+t[9]*i+t[13],l=t[3]*n+t[7]*r+t[11]*i+t[15];return Math.abs(l)<1e-8?null:[(o/l*.5+.5)*a,(.5-c/l*.5)*s]}function co(e,t){return e[0]*t[0]+e[1]*t[1]+e[2]*t[2]}function z1(e,t){let a=e.replace("#","");return`#${[0,2,4].map(s=>Math.round(parseInt(a.slice(s,s+2),16)*t).toString(16).padStart(2,"0")).join("")}`}function vo(e,t){w.frameSamples.push({intervalMs:e,cpuMs:t}),w.frameSamples.length>180&&w.frameSamples.shift()}function Gf(e,t){if(!e.length)return 0;let a=[...e].sort((s,n)=>s-n);return a[Math.min(a.length-1,Math.floor((a.length-1)*t))]}function wo(e){if(!ar||(w.frames+=1,e-w.fpsAt<=500))return;w.fps=w.frames*1e3/(e-w.fpsAt);let t=w.frameSamples;if(w.frameIntervalMs=t.length?t.reduce((r,i)=>r+i.intervalMs,0)/t.length:0,w.frameCpuMs=t.length?t.reduce((r,i)=>r+i.cpuMs,0)/t.length:0,w.frameIntervalP95Ms=Gf(t.map(r=>r.intervalMs),.95),w.frameCpuP95Ms=Gf(t.map(r=>r.cpuMs),.95),w.frames=0,w.fpsAt=e,mh(),w.workspace==="bom"){let r=nt?.payload?.counts||{},i=[["Renderer","BoM DOM table"],["Schema",nt?.payload?.schema||"-"],["Grouped rows",r.rows||0],["Components",r.components||0],["DNP components",r.dnpComponents||0],["Extra columns",nt?.payload?.extraColumns?.length||0],["Frame interval",`${w.frameIntervalMs.toFixed(2)} ms avg / ${w.frameIntervalP95Ms.toFixed(2)} p95`],["CPU frame",`${w.frameCpuMs.toFixed(2)} ms avg / ${w.frameCpuP95Ms.toFixed(2)} p95`],["FPS",w.fps.toFixed(1)]];ar.innerHTML=i.map(([o,c])=>`<dt>${o}</dt><dd>${c}</dd>`).join("");return}let a=w.workspace==="schematic"&&N?N.stats():null,s=w.workspace==="schematic"&&Z?Z.stats():null,n=w.workspace==="schematic"&&N?Z?.active?[["Renderer","SVG DOM schematic detail"],["Pages",D.pages.length],["Mounted pages",s.mountedPages],["Active page",s.activePage],["DOM nodes",s.domNodes.toLocaleString()],["Indexed features",s.indexedFeatures.toLocaleString()],["Indexed nets",s.indexedNets.toLocaleString()],["SVG cache",`${s.cachedSvgPages} pages / ${(s.cachedSvgBytes/1048576).toFixed(1)} MB`],["Selection",`${s.selectionMs.toFixed(1)} ms`],["Active net",k.scene.nets.find(r=>r.uid===D.activeNetUid)?.name||"-"],["Tracking links",`${a.netFlowSegments} total / ${a.netFlowIntrasheetSegments} local`],["Tracking verts",a.netFlowVertices.toLocaleString()],["Mount",`${s.mountMs.toFixed(1)} ms`],["Highlight",`${s.highlightMs.toFixed(1)} ms`],["Fallback",s.fallbackReason||"-"],["Frame interval",`${w.frameIntervalMs.toFixed(2)} ms avg / ${w.frameIntervalP95Ms.toFixed(2)} p95`],["CPU frame",`${w.frameCpuMs.toFixed(2)} ms avg / ${w.frameCpuP95Ms.toFixed(2)} p95`],["FPS",w.fps.toFixed(1)]]:[["Renderer",Z?"SVG DOM + WebGPU world":"WebGPU schematic world"],["Pages",D.pages.length],["Visible pages",D.visiblePages.length],["DOM pages",s?s.mountedPages:0],["DOM nodes",s?s.domNodes.toLocaleString():"0"],["Indexed SVG features",s?s.indexedFeatures.toLocaleString():"0"],["SVG cache",s?`${s.cachedSvgPages} pages / ${(s.cachedSvgBytes/1048576).toFixed(1)} MB`:"0 pages"],["JS heap",s?.heapMb?`${s.heapMb.toFixed(1)} MB`:"-"],["Hierarchy links",D.manifest.edges?.length||0],["Selected page",D.byId.get(w.selectedPageId)?.name||"-"],["Active net",k.scene.nets.find(r=>r.uid===D.activeNetUid)?.name||"-"],["Tracking links",`${a.netFlowSegments} total / ${a.netFlowIntrasheetSegments} local`],["Downloaded",`${(N.downloadedBytes/1048576).toFixed(1)} MB`],["Resident vectors",`${(a.residentVectorBytes/1048576).toFixed(1)} MB`],["Vector pages",`${a.vectorChunks} loaded / ${a.vectorLoads} loading`],["Vector draw",`${a.vectorVertices.toLocaleString()} verts / ${a.vectorDrawChunks} chunks`],["Native detail",`${a.nativeDetailPages} pages @ ${a.nativePxPerMm} / ${a.nativeThresholdPxPerMm} px/mm`],["Vector failures",a.failedVectorChunks],["Truncated",a.truncatedVectors],["Frame interval",`${w.frameIntervalMs.toFixed(2)} ms avg / ${w.frameIntervalP95Ms.toFixed(2)} p95`],["CPU frame",`${w.frameCpuMs.toFixed(2)} ms avg / ${w.frameCpuP95Ms.toFixed(2)} p95`],["FPS",w.fps.toFixed(1)]]:[["Renderer","WebGPU semantic glTF"],["Mode",w.mode==="3d"?"3D":"Layer Compare"],["Visible layers",w.mode==="3d"?k.visible3dLayers.size:k.compareLayers.size],["Resident tiles",k.scene.loaded.size],["Loading tiles",k.scene.loading.size],["Failed tiles",k.scene.failed.size],["Triangles",Math.round(k.triangles).toLocaleString()],["Downloaded",`${(k.loadedBytes/1048576).toFixed(1)} MB`],["Resident GLB",`${(k.residentTileBytes/1048576).toFixed(1)} MB`],["Resident GPU",`${(k.residentTileGpuBytes/1048576).toFixed(1)} MB`],["Tile loads",k.tileLoads.toLocaleString()],["Tile evictions",k.tileEvictions.toLocaleString()],["Tile scheduler",`${k.tileSchedulerMs.toFixed(2)} ms`],["Active net",k.scene.nets.find(r=>Number(r.id)===w.activeNetId)?.name||"-"],["Frame interval",`${w.frameIntervalMs.toFixed(2)} ms avg / ${w.frameIntervalP95Ms.toFixed(2)} p95`],["CPU frame",`${w.frameCpuMs.toFixed(2)} ms avg / ${w.frameCpuP95Ms.toFixed(2)} p95`],["FPS",w.fps.toFixed(1)]];ar.innerHTML=n.map(([r,i])=>`<dt>${r}</dt><dd>${i}</dd>`).join("")}function $o(e){return`rgb(${e.slice(0,3).map(t=>Math.round(t*255)).join(" ")})`}function K1(){if(!Le)return;let e=k.scene.layers||[];if(!e.length){Le.innerHTML='<div class="selection-empty" style="padding:40px;text-align:center;">No stackup information available for this board.</div>';return}let t=e.filter(S=>["copper","dielectric","paste","silkscreen","soldermask"].includes(S.role)),a=k.topology.board?.stackup||{},s=S=>{if(S==null||S==="")return"None";let P=String(S);return z(P.includes(".")?P.split(".").pop():P)},n=(S,P=4)=>{let L=Number(S);return Number.isFinite(L)&&L>0?L.toFixed(P):"-"},r=(S,P=3)=>{let L=Number(S);return Number.isFinite(L)?L.toFixed(P):"-"},i=S=>{if(S==null||S==="")return"No";if(typeof S=="boolean")return S?"Yes":"No";let P=String(S).trim().toLowerCase(),L=P.includes(".")?P.split(".").pop():P;return["0","false","no","n","off","none"].includes(L)?"No":(["1","true","yes","y","on"].includes(L),"Yes")},o=S=>({copper:"Copper",dielectric:"Dielectric",paste:"Paste",silkscreen:"Silkscreen",soldermask:"Solder mask"})[S]||String(S||"Layer"),c=S=>S.role!=="dielectric"?"":S.type==="core"?"Core":S.type==="prepreg"||(S.material||"").toLowerCase().includes("prepreg")?"Prepreg":"Core",l=(S,P=4)=>{let L=Number(S.thickness_mm);return Number.isFinite(L)&&L>0?`${L.toFixed(P)} mm`:"Not specified"},f=S=>{let P=o(S.role),L=String(S.material||"").trim(),J=L&&L.toLowerCase()!==String(S.role||"").toLowerCase();if(S.role==="dielectric"){let ue=[J?L:"",n(S.epsilon_r,3)!=="-"?`\u03B5r ${n(S.epsilon_r,3)}`:"",n(S.loss_tangent,4)!=="-"?`tan \u03B4 ${n(S.loss_tangent,4)}`:""].filter(Boolean).join(" \xB7 ");return{primary:`${S.name} \xB7 ${c(S)}`,secondary:ue}}return{primary:[S.name,P,J?L:""].filter(Boolean).join(" \xB7 "),secondary:""}},d=0,h=0,g=0,p=0;t.forEach(S=>{p+=S.thickness_mm||0,S.role==="copper"?S.name.toLowerCase().includes("gnd")||S.name.toLowerCase().includes("pwr")||S.name.toLowerCase().includes("plane")?h++:d++:S.role==="dielectric"&&g++});let u=k.scene.copperLayers||[],y=0,b=0,m=0,x=[...(k.scene.manifest?.barrels||[]).filter(S=>S.kind==="via"),...[...k.scene.features.values()].filter(S=>S.kind==="via")],M=$d(u,x);y=M.counts.thru,b=M.counts.blind,m=M.counts.buried;let E=M.spans,T=30,I=T,A=[],R=new Map(t.map((S,P)=>[S,P])),_=V1(t),B=(S,P)=>{let L=_.get(S.name);if(L!==void 0)return L;let J=Number(S.stack_index);return Number.isFinite(J)?J:P+1e5},O=[...t].sort((S,P)=>{let L=B(S,R.get(S)||0),J=B(P,R.get(P)||0);return L!==J?L-J:(P.z_mm||0)-(S.z_mm||0)});O.forEach(S=>{let P=12;S.role==="dielectric"?P=Math.max(160,Math.min(360,(S.thickness_mm||.1)*140)):S.role==="copper"?P=22:S.role==="soldermask"&&(P=14),A.push({...S,svgY:I,svgHeight:P}),I+=P});let F=800,K=130,$=240,ne=K+$+16,de=ne+84,Ke="";A.forEach(S=>{let P=S.color||"#7f7f7f";S.role==="copper"?P=S.color||"#f97316":S.role==="dielectric"?P="#a98d5c":S.role==="paste"?P="#cbd5e1":S.role==="soldermask"?P="#1b4332":S.role==="silkscreen"&&(P="#e2e8f0");let L=u.findIndex(Tb=>Tb.name===S.name),J=f(S),ue=S.svgY+S.svgHeight/2,_e=!!J.secondary&&S.svgHeight>=38,Zt=_e?ue-5:ue+3,Pr=z(S.id),Ls=z(S.name),ot=Number.isFinite(Number(S.thickness_mm))&&Number(S.thickness_mm)>0,kb=z(ot?l(S):"\u2014"),Eb=z([J.primary,J.secondary,`Thickness ${l(S)}`].filter(Boolean).join("; "));Ke+=`
      <g class="stackup-svg-layer" data-layer-id="${Pr}" data-layer-name="${Ls}">
        <title>${Eb}</title>
        <rect x="${K}" y="${S.svgY}" width="${$}" height="${S.svgHeight}" fill="${P}" opacity="0.85" rx="1"/>
        <text x="${K-8}" y="${S.svgY+S.svgHeight/2+3}" fill="var(--muted)" font-size="9px" text-anchor="end" font-weight="700">
          ${S.role==="copper"?L+1:""}
        </text>
        <path class="stackup-layer-dimension" d="M ${ne+6} ${S.svgY+1} H ${ne} V ${S.svgY+S.svgHeight-1} H ${ne+6}" />
        <text class="stackup-layer-thickness" x="${ne+10}" y="${ue+3}" fill="var(--muted)" font-size="8.5px" font-weight="650">
          ${kb}
        </text>
        <text class="stackup-layer-name" x="${de}" y="${Zt}" fill="var(--foreground)" font-size="9px" font-weight="650">
          ${z(J.primary)}
        </text>
        ${_e?`<text class="stackup-layer-metadata" x="${de}" y="${ue+10}" fill="var(--muted)" font-size="8px">${z(J.secondary)}</text>`:""}
      </g>
    `});let be="",Ve=A.filter(S=>S.role==="copper");E.forEach((S,P)=>{let L=A.find(ot=>ot.name===S.startName),J=A.find(ot=>ot.name===S.endName);if(!L||!J)return;let ue=L.svgY,_e=J.svgY+J.svgHeight,Zt=K+(P+1)*$/(E.length+1),Pr=S.type==="thru"?"Thru":S.type==="blind"?"Blind":"Buried",Ls=`var(--stackup-via-${S.type})`;be+=`
      <g class="stackup-svg-via" data-via-type="${S.type}">
        <title>${Pr}: ${S.startName} \u2192 ${S.endName}</title>
        ${Ve.map(ot=>ot.svgY>=L.svgY&&ot.svgY<=J.svgY?`<rect x="${Zt-5}" y="${ot.svgY}" width="10" height="${ot.svgHeight}" fill="${Ls}" rx="0.5" />`:"").join("")}
        <rect x="${Zt-2}" y="${ue}" width="4" height="${_e-ue}" fill="${Ls}" opacity="0.95" />
        <rect x="${Zt-.75}" y="${ue-1}" width="1.5" height="${_e-ue+2}" fill="var(--panel)" opacity="0.9" />
      </g>
    `});let Je=`
    <svg class="stackup-visual-svg" viewBox="0 0 ${F} ${I+10}" width="${F}" height="${I+10}">
      <g class="stackup-svg-column-headings" aria-hidden="true">
        <text x="${ne+10}" y="15">Thickness</text>
        <text x="${de}" y="15">Layer / material properties</text>
      </g>
      <g class="stackup-total-dimension" aria-label="Total board thickness ${p.toFixed(4)} millimetres">
        <path d="M 76 ${T} H 68 V ${I} H 76" />
        <text x="68" y="15">Total ${p.toFixed(4)} mm</text>
      </g>
      ${Ke}
      ${be}
    </svg>
    <div class="stackup-via-legend" aria-label="Via span legend">
      <span><i data-via-type="thru"></i>Thru</span>
      <span><i data-via-type="blind"></i>Blind</span>
      <span><i data-via-type="buried"></i>Buried</span>
    </div>
  `,Re="";O.forEach(S=>{let P="silk";S.role==="copper"?P="copper":S.role==="dielectric"?P="dielectric":S.role==="paste"?P="paste":S.role==="soldermask"&&(P="mask");let L=c(S),J=z(S.id),ue=z(S.name),_e=f(S);Re+=`
      <tr data-layer-id="${J}" data-layer-name="${ue}" tabindex="0" aria-label="${z(`${_e.primary}; thickness ${l(S)}`)}">
        <td><strong>${ue}</strong></td>
        <td><span class="stackup-badge ${P}">${S.role}</span></td>
        <td>${L||"-"}</td>
        <td>${z(S.material||"-")}</td>
        <td>${S.role==="dielectric"?n(S.epsilon_r,3):"-"}</td>
        <td>${S.role==="dielectric"?n(S.loss_tangent,4):"-"}</td>
        <td>${S.thickness_mm?S.thickness_mm.toFixed(4)+" mm":"-"}</td>
      </tr>
    `});let it="",Qe=k.topology.board?.net_classes||[],Tt=S=>{let P=r(S);return P==="-"?P:`${P} mm`};Qe.length?Qe.forEach(S=>{it+=`
        <tr>
          <td><strong>${S.name}</strong></td>
          <td>${Tt(S.track_width)}</td>
          <td>${Tt(S.clearance)}</td>
          <td>${Tt(S.diff_pair_width)}</td>
          <td>${Tt(S.diff_pair_gap)}</td>
          <td>${Number.isFinite(Number(S.via_diameter))?`${r(S.via_drill)}/${r(S.via_diameter)} mm`:"-"}</td>
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
        ${Je}
      </div>
      <aside class="stackup-side-panel">
      <div class="stackup-summary-grid">
        <div class="stackup-summary-card">
          <label>Total Thickness</label>
          <span>${p.toFixed(4)} mm</span>
        </div>
        <div class="stackup-summary-card">
          <label>Copper Layers</label>
          <span>${u.length} (${d} Sig / ${h} Plane)</span>
        </div>
        <div class="stackup-summary-card">
          <label>Dielectrics</label>
          <span>${g} Layers</span>
        </div>
        <div class="stackup-summary-card">
          <label>Thru Vias</label>
          <span>${y}</span>
        </div>
        <div class="stackup-summary-card">
          <label>Blind Vias</label>
          <span>${b}</span>
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
                ${Re}
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
  `;let ma=(S,P)=>{Le.querySelectorAll(".stackup-svg-layer").forEach(L=>{let J=L.dataset.layerId===S;L.classList.toggle("active",J&&P)}),Le.querySelectorAll(".stackup-table tbody tr[data-layer-id]").forEach(L=>{let J=L.dataset.layerId===S;L.classList.toggle("active",J&&P)})},Or=S=>{let P=Le.querySelector(".stackup-diagram-card"),L=Le.querySelector(`.stackup-svg-layer[data-layer-id="${CSS.escape(S)}"]`);if(!P||!L||P.scrollHeight<=P.clientHeight)return;let J=P.getBoundingClientRect(),ue=L.getBoundingClientRect(),_e=P.scrollTop+ue.top-J.top-(P.clientHeight-ue.height)/2,Zt=window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;P.scrollTo({top:Math.max(0,_e),behavior:Zt?"auto":"smooth"})},js=(S,{revealDiagram:P=!1}={})=>{S.forEach(L=>{let J=()=>{let _e=L.dataset.layerId;ma(_e,!0),P&&Or(_e)},ue=()=>ma(null,!1);L.addEventListener("mouseenter",J),L.addEventListener("mouseleave",ue),P&&(L.addEventListener("focus",J),L.addEventListener("blur",ue))})};js(Le.querySelectorAll(".stackup-svg-layer")),js(Le.querySelectorAll(".stackup-table tbody tr[data-layer-id]"),{revealDiagram:!0})}function V1(e){let t=e.filter(n=>n.role==="dielectric");if(!(t.length===1&&t[0]?.name==="Board"))return new Map;let s=new Map;return["F.SilkS","F.Paste","F.Mask","F.Cu","Board","B.Cu","B.Mask","B.Paste","B.SilkS"].forEach((n,r)=>s.set(n,r)),s}function yb(){let e=null;return{begin(){return e?.abort(),e=new AbortController,e},owns(t){return t!==null&&t===e&&!t.signal.aborted},cancel(){e?.abort(),e=null}}}async function xb(e,t,{owner:a,bundleUrl:s,loadBundle:n,now:r=()=>performance.now()}){let i=r(),o={},{signal:c}=t,l=()=>a.owns(t)&&e.isConnected;try{e.renderLoading();let f=r(),{bundle:d,topology:h,semanticGeometry:g,assetCache:p}=await n(s,o,c);if(o.bundle_group_total_ms=r()-f,!l())return;e.renderShell();let u=r(),y=await e.mountViewer({topology:h,semanticGeometry:g,readiness:d.readiness,assetCache:p,signal:c});if(!l()){y?.dispose?.();return}e.publishController(y),o.mount_and_first_frame_ms=r()-u,Object.assign(o,y?.performance||{}),o.reload_to_visible_ms=r()-i,e.emitReady({schema:"prism.semantic_viewer_performance.a0",milestone:"board-visible",readiness_stage:d.readiness?.stage||"semantic-ready",readiness_progress:d.readiness?.progress??100,timings:o})}catch(f){if(!l())return;e.renderError(f),e.emitError(f)}}var H1="prism.visualizer_bundle.a0";function q1(){return`
    <style>
      ${Yo}
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
  `}function X1(e){return String(e).replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t])}async function vb(e,t=null,a="fetch",s=void 0){let n=performance.now(),r=await fetch(e,{cache:"no-store",signal:s});if(!r.ok)throw new Error(`Failed to load ${e}: ${r.status}`);let i=await r.json();return t&&(t[`${a}_fetch_parse_ms`]=performance.now()-n,t[`${a}_content_length`]=Number(r.headers.get("content-length")||0)),i}async function wb(e,t,a){let s=new URL(e,document.baseURI).toString(),n=new URL(s).searchParams.get("viewer")||"",r=Us.open(),i=await r.peekJson(s).catch(()=>null),o=!!i;i||(i=await vb(s,t,"bundle",a),Dr(i)&&r.store(s,new TextEncoder().encode(JSON.stringify(i)))),t&&(t.bundle_from_cache=o);let c=Dr(i)&&r.enabled?r:null;if(i.schema!==H1)throw new Error(`Unsupported visualizer bundle schema: ${i.schema||"missing"}`);let l=new URL(i.topology||"topology.json",s),f=new URL(i.semantic_geometry||"semantic_geometry.json",s),d=(p,u)=>c?c.fetchJson(p.toString(),{signal:a}):vb(p,t,u,a),[h,g]=await Promise.all([d(l,"topology"),d(f,"semantic_geometry")]);return{bundle:i,topology:h,semanticGeometry:Jo(g,s,i,n),assetCache:c}}var Fr=class extends HTMLElement{static get observedAttributes(){return["bundle-url","workspace","mode","move-allowed"]}constructor(){super(),this.attachShadow({mode:"open"}),this.reloadOwner=yb(),this.reloadQueued=!1,this.reloadSource=null;let t=Qi();this.modes=Object.freeze({board:new Xn(t),system:new Wn(t)}),this.mounted=null}get activeMode(){return this.mounted??(this.systemMode?this.modes.system:this.modes.board)}detachModes(){this.modes.board.detach(),this.modes.system.detach(),this.mounted=null}connectedCallback(){this.queueReload()}disconnectedCallback(){this.reloadOwner.cancel(),this.detachModes(),this.reloadSource=null}attributeChangedCallback(t,a,s){if(!(!this.isConnected||a===s)){if(t==="workspace"){this.modes.board.setWorkspace(this.workspace);return}if(t==="move-allowed"){this.modes.system.setMoveAllowed(s==="true");return}this.queueReload()}}get workspace(){return this.getAttribute("workspace")==="stackup"?"stackup":"pcb"}get systemMode(){return this.getAttribute("mode")==="system"}queueReload(){let t=this.systemMode?"system":this.getAttribute("bundle-url");!t||t===this.reloadSource||(this.reloadSource=t,!this.reloadQueued&&(this.reloadQueued=!0,queueMicrotask(()=>{this.reloadQueued=!1,this.isConnected&&this.reload()})))}async reload(){let t=this.getAttribute("bundle-url"),a=this.reloadOwner.begin();if(this.detachModes(),this.systemMode){await this.reloadSystem(a);return}if(!t){this.shadowRoot.innerHTML="<style>:host{display:block;height:100%;font:14px system-ui;color:#94a3b8}</style><div>Semantic bundle URL is missing.</div>";return}await xb(this,a,{owner:this.reloadOwner,bundleUrl:t,loadBundle:wb})}async reloadSystem(t){let{signal:a}=t,s=()=>this.reloadOwner.owns(t)&&this.isConnected;try{this.renderShell();let n=await yh({root:this.shadowRoot,loadBundle:(i,o)=>wb(i,null,o),isActive:()=>this.getAttribute("active")==="true",onSelectionChange:i=>{a.aborted||this.emit("selectionchange",{selection:i})},onContextMenu:i=>{a.aborted||this.emit("contextmenu",i)},onViewStateChange:i=>{a.aborted||this.emitViewState(i)},onEmphasis:i=>{a.aborted||this.emit("emphasis",{results:i})},onMove:i=>{a.aborted||this.emit("move",i)},onHarness:i=>{a.aborted||this.emit("harness",i)}});if(!s()){n?.dispose?.();return}this.mounted=this.modes.system,this.mounted.attach(n,{moveAllowed:this.getAttribute("move-allowed")==="true"});let r=this.getViewState();r&&this.emitViewState(r),this.emitReady({schema:"prism.semantic_viewer_performance.a0",milestone:"system-mounted"})}catch(n){if(!s())return;this.renderError(n),this.emitError(n)}}emit(t,a){this.dispatchEvent(new CustomEvent(`prism-semantic-viewer:${t}`,{bubbles:!0,composed:!0,detail:a}))}renderLoading(){this.shadowRoot.innerHTML='<style>:host{display:block;height:100%;background:#020817;color:#e5e7eb;font:14px system-ui}</style><div style="display:grid;place-items:center;height:100%">Loading semantic visualizer...</div>'}renderShell(){this.shadowRoot.innerHTML=q1()}renderError(t){console.error(t),this.shadowRoot.innerHTML=`
      <style>
        :host{display:block;height:100%;background:#020817;color:#e5e7eb;font:14px system-ui}
        .error{height:100%;display:grid;place-items:center;padding:24px}
        pre{max-width:100%;white-space:pre-wrap;color:#fecaca;background:#111827;border:1px solid #374151;padding:16px}
      </style>
      <div class="error"><pre>${X1(t?.stack||t?.message||String(t))}</pre></div>
    `}mountViewer({topology:t,semanticGeometry:a,readiness:s,assetCache:n=null,signal:r}){return Eo({root:this.shadowRoot,topology:t,semanticGeometry:a,readiness:s,workspaceScope:"3d",assetCache:n,isActive:()=>this.getAttribute("active")==="true",onSelectionChange:i=>{r.aborted||this.dispatchEvent(new CustomEvent("prism-semantic-viewer:selectionchange",{bubbles:!0,composed:!0,detail:{selection:i}}))},onContextMenu:i=>{r.aborted||this.dispatchEvent(new CustomEvent("prism-semantic-viewer:contextmenu",{bubbles:!0,composed:!0,detail:i}))},onViewStateChange:i=>{r.aborted||this.emitViewState(i)},onPerformanceEvent:i=>{r.aborted||(console.info("[prism-3d-perf]",i),this.dispatchEvent(new CustomEvent("prism-semantic-viewer:performance",{bubbles:!0,composed:!0,detail:i})))}})}publishController(t){this.mounted=this.modes.board,this.mounted.attach(t,{workspace:this.workspace});let a=this.getViewState();a&&this.emitViewState(a)}emitViewState(t){this.dispatchEvent(new CustomEvent("prism-semantic-viewer:viewstatechange",{bubbles:!0,composed:!0,detail:t}))}emitReady(t){console.info("[prism-3d-perf]",t),this.dispatchEvent(new CustomEvent("prism-semantic-viewer:ready",{bubbles:!0,composed:!0,detail:t}))}emitError(t){this.dispatchEvent(new CustomEvent("prism-semantic-viewer:error",{bubbles:!0,detail:{error:t}}))}};tf(Fr.prototype);function Mb(){customElements.get("prism-semantic-viewer")||customElements.define("prism-semantic-viewer",Fr)}window.__PRISM_SEMANTIC_VIEWER_MANUAL_BOOT__=!0;Mb();
