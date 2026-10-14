var wc=`:host,
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
`;var hp=/\/api\/projects\/([^/]+)\/webgpu-3d\/assets\/([^/]+)\/([^/]+)\/(.+)$/,bp="prism-bundle-cache-a0",Yn="manifest.json";function Jn(t){let e;try{e=new URL(t,"http://cache.invalid/")}catch{return null}let r=hp.exec(e.pathname);if(!r)return null;let[,a,s,n,i]=r.map(decodeURIComponent);if(i.split("/").some(c=>!c||c==="."||c===".."))return null;let o=e.searchParams.get("viewer")||"";return`${a}/${s}/${n}/${i}${o?`?viewer=${o}`:""}`}function qa(t){return`a_${encodeURIComponent(t)}`}function pp(t,e,{maxAgeMs:r=2592e6,maxBytes:a=2147483648}={}){let s=new Set,n=[];for(let[o,c]of Object.entries(t))e-Number(c.lastUsed||0)<=r?n.push([o,c]):s.add(o);n.sort((o,c)=>Number(c[1].lastUsed)-Number(o[1].lastUsed));let i=0;for(let[o,c]of n)i+=Number(c.bytes||0),i>a&&s.add(o);return[...s]}var Wa=class t{static open(e={}){return t.shared||(t.shared=new t(e)),t.shared}constructor({maxAgeMs:e=2592e6,maxBytes:r=2147483648}={}){this.maxAgeMs=e,this.maxBytes=r,this.stats={hits:0,misses:0,bypassed:0,cachedBytes:0,networkBytes:0,writeErrors:0},this.ready=this.init(),this.flushTimer=null}async init(){try{let e=globalThis.navigator?.storage;if(!e?.getDirectory)return null;let a=await(await e.getDirectory()).getDirectoryHandle(bp,{create:!0}),s=await a.getFileHandle(Yn,{create:!0});if(typeof s.createWritable!="function")return null;let n={};try{let i=await(await s.getFile()).text();n=i?JSON.parse(i).entries||{}:{}}catch{n={}}return this.directory=a,this.entries=n,await this.prune(),globalThis.addEventListener?.("pagehide",()=>void this.flush()),a}catch{return null}}get enabled(){return!!this.directory}async fetchBytes(e,{store:r=!0,signal:a}={}){let s=Jn(e);if(await this.ready,s&&this.directory){let c=await this.read(s);if(c)return this.stats.hits+=1,this.stats.cachedBytes+=c.byteLength,c;this.stats.misses+=1}else this.stats.bypassed+=1;let n=await fetch(e,{cache:"no-store",signal:a});if(!n.ok)throw new Error(`Failed to load ${e}: ${n.status}`);let i=await n.arrayBuffer(),o=Number(n.headers.get("content-length")||0);return this.stats.networkBytes+=i.byteLength,r&&s&&this.directory&&(!o||o===i.byteLength)&&this.write(s,i),i}async fetchJson(e,r={}){let a=await this.fetchBytes(e,r);return JSON.parse(new TextDecoder().decode(a))}async peekJson(e){let r=Jn(e);if(await this.ready,!r||!this.directory)return null;let a=await this.read(r);return a?(this.stats.hits+=1,this.stats.cachedBytes+=a.byteLength,JSON.parse(new TextDecoder().decode(a))):null}async store(e,r){let a=Jn(e);await this.ready,a&&this.directory&&await this.write(a,r)}async read(e){let r=this.entries[e];if(!r)return null;try{let a=await(await this.directory.getFileHandle(qa(e))).getFile();return a.size!==r.bytes?null:(r.lastUsed=Date.now(),this.scheduleFlush(),await a.arrayBuffer())}catch{return delete this.entries[e],null}}async write(e,r){try{let s=await(await this.directory.getFileHandle(qa(e),{create:!0})).createWritable();await s.write(r),await s.close(),this.entries[e]={bytes:r.byteLength,lastUsed:Date.now()},this.scheduleFlush()}catch{this.stats.writeErrors+=1}}async prune(e=Date.now()){if(!this.directory)return[];let r=pp(this.entries,e,{maxAgeMs:this.maxAgeMs,maxBytes:this.maxBytes});for(let s of r)delete this.entries[s],await this.directory.removeEntry(qa(s)).catch(()=>{});let a=new Set(Object.keys(this.entries).map(qa));for await(let s of this.directory.keys())s!==Yn&&!a.has(s)&&await this.directory.removeEntry(s).catch(()=>{});return r.length&&await this.flush(),r}async clear(){await this.ready,this.directory&&(this.entries={},await this.prune(),await this.flush())}summary(){let e=Object.values(this.entries||{});return{enabled:this.enabled,files:e.length,bytes:e.reduce((r,a)=>r+Number(a.bytes||0),0),...this.stats}}scheduleFlush(){this.flushTimer||(this.flushTimer=setTimeout(()=>{this.flushTimer=null,this.flush()},1e3))}async flush(){if(this.directory)try{let r=await(await this.directory.getFileHandle(Yn,{create:!0})).createWritable();await r.write(JSON.stringify({schema:"prism.bundle_cache_manifest.a0",entries:this.entries})),await r.close()}catch{this.stats.writeErrors+=1}}};function gp(t,e){if(!e)return t;let r=new URL(t);return r.searchParams.set("viewer",e),r.toString()}function Mc(t,e,r,a){let s=new URL(r.asset_base||"./",e),n=structuredClone(t||{}),i=o=>!o||typeof o!="string"?o:gp(new URL(o,s).toString(),a);for(let o of["assets","semantic_gltf","schematic_world","schematic_vector","schematic_scene","bom"]){let c=n[o];if(!(!c||typeof c!="object"))for(let[l,f]of Object.entries(c))c[l]=i(f)}return n}function Qn(t){return(t?.readiness?.stage||"semantic-ready")==="semantic-ready"&&(t?.readiness?.progress??100)>=100}var ce=(t,e,r)=>Math.max(e,Math.min(r,t)),$a=(t,e,r)=>t+(e-t)*r;function Ee(t,e){return[t[0]+e[0],t[1]+e[1],t[2]+e[2]]}function mp(t,e){return[t[0]-e[0],t[1]-e[1],t[2]-e[2]]}function pe(t,e){return[t[0]*e,t[1]*e,t[2]*e]}function yp(t){return Math.hypot(t[0],t[1],t[2])}function He(t){let e=yp(t)||1;return pe(t,1/e)}function qe(t,e){return[t[1]*e[2]-t[2]*e[1],t[2]*e[0]-t[0]*e[2],t[0]*e[1]-t[1]*e[0]]}function tt(t,e){return t[0]*e[0]+t[1]*e[1]+t[2]*e[2]}function kc(t,e){let r=e/2,a=Math.sin(r),s=He(t);return[s[0]*a,s[1]*a,s[2]*a,Math.cos(r)]}function Xa(t,e){return[t[3]*e[0]+t[0]*e[3]+t[1]*e[2]-t[2]*e[1],t[3]*e[1]-t[0]*e[2]+t[1]*e[3]+t[2]*e[0],t[3]*e[2]+t[0]*e[1]-t[1]*e[0]+t[2]*e[3],t[3]*e[3]-t[0]*e[0]-t[1]*e[1]-t[2]*e[2]]}function Zn(t,e){let r=[e[0],e[1],e[2],0],a=[-t[0],-t[1],-t[2],t[3]];return Xa(Xa(t,r),a).slice(0,3)}function ar(t,e){let r=new Float32Array(16);for(let a=0;a<4;a+=1)for(let s=0;s<4;s+=1)r[a*4+s]=t[s]*e[a*4]+t[4+s]*e[a*4+1]+t[8+s]*e[a*4+2]+t[12+s]*e[a*4+3];return r}function Ya(t,e,r){let a=He(mp(t,e)),s=He(qe(r,a)),n=qe(a,s);return new Float32Array([s[0],n[0],a[0],0,s[1],n[1],a[1],0,s[2],n[2],a[2],0,-tt(s,t),-tt(n,t),-tt(a,t),1])}function Ec(t,e,r,a){let s=1/Math.tan(t/2);return new Float32Array([s/e,0,0,0,0,s,0,0,0,0,r/(a-r),-1,0,0,r*a/(a-r),0])}function Ja(t,e,r,a){return new Float32Array([2/t,0,0,0,0,2/e,0,0,0,0,1/(a-r),0,0,0,1,1])}function ei(t){return[(t[0]+t[3])/2,(t[1]+t[4])/2,(t[2]+t[5])/2]}function _t(t){return Math.max(.001,Math.hypot(t[3]-t[0],t[4]-t[1],t[5]-t[2])/2)}var qr=class{constructor(e){let r=ei(e),a=_t(e);this.focus=[...r],this.targetFocus=[...r],this.azimuth=-.62,this.targetAzimuth=this.azimuth,this.polar=.72,this.targetPolar=this.polar,this.distance=a*2.8,this.targetDistance=this.distance,this.orthoScale=a*2.15,this.targetOrthoScale=this.orthoScale,this.sceneRadius=a,this.fov=Math.PI/4}update(e){let r=1-Math.exp(-e*14);this.focus=this.focus.map((a,s)=>$a(a,this.targetFocus[s],r)),this.azimuth=Tc(this.azimuth,this.targetAzimuth,r),this.polar=Tc(this.polar,this.targetPolar,r),this.distance=$a(this.distance,this.targetDistance,r),this.orthoScale=$a(this.orthoScale,this.targetOrthoScale,r)}snap(){this.focus=[...this.targetFocus],this.azimuth=this.targetAzimuth,this.polar=this.targetPolar,this.distance=this.targetDistance,this.orthoScale=this.targetOrthoScale}basis(){let e=Math.sin(this.polar),r=Math.cos(this.polar),a=He([e*Math.sin(this.azimuth),-e*Math.cos(this.azimuth),r]),s=He([Math.cos(this.azimuth),Math.sin(this.azimuth),0]),n=He(qe(a,s));return{right:s,up:n,back:a}}matrix(e,r,a=!1,s=1){let n=Math.max(.01,e/Math.max(1,r)),{up:i,back:o}=this.basis(),c=Ee(this.focus,pe(o,this.distance)),l=Ya(c,this.focus,i),f=a?Ja(this.orthoScale*s*n,this.orthoScale*s,-this.sceneRadius*40,this.sceneRadius*40):Ec(this.fov,n,Math.max(this.sceneRadius*5e-4,this.distance-this.sceneRadius*3.5),this.distance+this.sceneRadius*4.5);return ar(f,l)}targetMatrix(e,r,a=!1,s=0){let n=(l,f)=>f+(f-l)*s,i=[this.focus,this.azimuth,this.polar,this.distance,this.orthoScale];this.focus=this.focus.map((l,f)=>n(l,this.targetFocus[f]));let o=(l,f)=>f+Math.atan2(Math.sin(f-l),Math.cos(f-l))*s;this.azimuth=o(this.azimuth,this.targetAzimuth),this.polar=o(this.polar,this.targetPolar),this.distance=Math.max(this.sceneRadius*.001,n(this.distance,this.targetDistance)),this.orthoScale=Math.max(this.sceneRadius*.001,n(this.orthoScale,this.targetOrthoScale));let c=this.matrix(e,r,a);return[this.focus,this.azimuth,this.polar,this.distance,this.orthoScale]=i,c}moving(){let e=(r,a)=>Math.abs(r-a)<=Math.max(1e-9,Math.abs(a)*1e-4);return!(this.focus.every((r,a)=>e(r,this.targetFocus[a]))&&e(this.azimuth,this.targetAzimuth)&&e(this.polar,this.targetPolar)&&e(this.distance,this.targetDistance)&&e(this.orthoScale,this.targetOrthoScale))}orbit(e,r){let a=Math.sin(this.targetPolar)<0?-1:1;this.targetAzimuth-=a*e*.006,this.targetPolar=Sc(this.targetPolar-r*.006)}isBelow(){return Math.cos(this.targetPolar)<0}pan(e,r,a,s=!1){let{right:n,up:i}=this.basis(),o=s?this.targetOrthoScale/Math.max(1,a):2*this.targetDistance*Math.tan(this.fov/2)/Math.max(1,a),c=Ee(pe(n,-e*o),pe(i,r*o));this.targetFocus=Ee(this.targetFocus,c)}dolly(e,r=!1){let a=Math.exp(e*.0032);r?this.targetOrthoScale=ce(this.targetOrthoScale*a,this.sceneRadius*.008,this.sceneRadius*24):this.targetDistance=ce(this.targetDistance*a,this.sceneRadius*.01,this.sceneRadius*48)}frame(e){if(!e)return;let r=_t(e);this.targetFocus=ei(e),this.targetDistance=Math.max(r*2.8,this.sceneRadius*.02),this.targetOrthoScale=Math.max(r*2.15,this.sceneRadius*.02)}setFocus(e){this.targetFocus=[...e]}setAxis(e,r=!1){e==="z"?(this.targetAzimuth=0,this.targetPolar=r?Math.PI-.015:.015):e==="x"?(this.targetAzimuth=r?-Math.PI/2:Math.PI/2,this.targetPolar=Math.PI/2):(this.targetAzimuth=r?0:Math.PI,this.targetPolar=Math.PI/2)}rotateZ(e=1){this.targetAzimuth+=e*Math.PI/2}flip(){this.targetPolar=Sc(Math.PI-this.targetPolar)}};function Sc(t){return Math.atan2(Math.sin(t),Math.cos(t))}function Tc(t,e,r){let a=Math.atan2(Math.sin(e-t),Math.cos(e-t));return t+a*r}var Qa=class t{static async create(e,r,a={}){let s=await fetch(r,{cache:"default"});if(!s.ok)throw new Error(`Failed to load BoM ${r}: ${s.status}`);let n=await s.json();if(n.schema!=="prism.bom_a0")throw new Error(`Unsupported BoM schema: ${n.schema||"missing"}`);let i=new t(e,n,a);return i.render(),i}constructor(e,r,a){this.container=e,this.payload=r,this.callbacks=a,this.query="",this.selectedRowId="",this.selectedReference="",this.rowsById=new Map((r.rows||[]).map(s=>[s.id,s])),this.componentIndex=new Map(Object.entries(r.componentIndex||{}))}setSelectionByReference(e,r={}){let a=this.componentIndex.get(e);a&&(this.selectedReference=e,this.selectedRowId=a.rowId,this.renderContent(),r.scroll&&this.container.querySelector(`[data-row-id="${wp(a.rowId)}"]`)?.scrollIntoView({block:"center",behavior:"smooth"}))}clearSelection(){this.selectedReference="",this.selectedRowId="",this.renderContent()}render(){let e=this.filteredRows();this.container.innerHTML=`
      <section class="bom-workspace">
        <header class="bom-toolbar">
          <div>
            <p class="eyebrow">Prism BoM A0</p>
            <h2>Bill of Materials</h2>
            <span data-bom-count>${e.length} of ${(this.payload.rows||[]).length} grouped rows \xB7 ${(this.payload.components||[]).length} components</span>
          </div>
          <label class="bom-search">
            <span>Search</span>
            <input id="bom-search" type="search" value="${We(this.query)}" placeholder="Reference, value, footprint, manufacturer..." />
          </label>
        </header>
        <div class="bom-content" data-bom-content>
          ${this.contentHtml(e,this.payload.displayColumns||[])}
        </div>
      </section>
    `,this.bind()}renderContent(){let e=this.container.querySelector("[data-bom-content]");if(!e){this.render();return}let r=this.filteredRows();e.innerHTML=this.contentHtml(r,this.payload.displayColumns||[]);let a=this.container.querySelector("[data-bom-count]");a&&(a.textContent=`${r.length} of ${(this.payload.rows||[]).length} grouped rows \xB7 ${(this.payload.components||[]).length} components`),this.bindContent(e)}contentHtml(e,r){let a=this.rowsById.get(this.selectedRowId);return`
      <div class="bom-table-wrap">
        <table class="bom-table">
          <thead>
            <tr>${r.map(s=>`<th>${We(s)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${e.map(s=>this.rowHtml(s,r)).join("")}
          </tbody>
        </table>
      </div>
      ${a?`<aside class="bom-detail">${this.detailHtml(a)}</aside>`:""}
    `}filteredRows(){let e=this.query.trim().toLowerCase(),r=this.payload.rows||[];return e?r.filter(a=>JSON.stringify(a).toLowerCase().includes(e)):r}rowHtml(e,r){return`
      <tr class="${e.id===this.selectedRowId?"selected":""}" data-row-id="${We(e.id)}">
        ${r.map(s=>{let n=e.fields?.[s]||"";return s==="Reference"?`<td class="bom-reference-cell">${(e.references||[]).map(i=>`
              <button class="bom-ref-chip ${i===this.selectedReference?"active":""}" data-reference="${We(i)}">${We(i)}</button>
            `).join("")}</td>`:!n&&vp(s)?'<td><span class="bom-missing">Missing</span></td>':`<td title="${We(n)}">${We(n)}</td>`}).join("")}
      </tr>
    `}detailHtml(e){let r=xp(e,this.payload.displayColumns||[],this.payload.extraColumns||[]);return`
      <div class="bom-detail-head">
        <p class="eyebrow">Line item</p>
        <h3>${We((e.references||[]).join(", "))}</h3>
        <span>${e.qty} component${e.qty===1?"":"s"}${e.dnp?" \xB7 DNP":""}</span>
      </div>
      <div class="bom-ref-list">
        ${(e.references||[]).map(a=>`
          <button class="bom-ref-chip detail ${a===this.selectedReference?"active":""}" data-reference="${We(a)}">${We(a)}</button>
        `).join("")}
      </div>
      <dl class="bom-field-list">
        ${r.map(([a,s])=>`
          <div>
            <dt>${We(a)}</dt>
            <dd>${We(s)}</dd>
          </div>
        `).join("")}
      </dl>
    `}bind(){let e=this.container.querySelector("#bom-search");e?.addEventListener("input",()=>{this.query=e.value,this.renderContent()}),this.bindContent(this.container)}bindContent(e){e.querySelectorAll("[data-row-id]").forEach(r=>{r.addEventListener("click",a=>{a.target.closest("[data-reference]")||(this.selectedRowId=r.dataset.rowId,this.selectedReference="",this.renderContent())})}),e.querySelectorAll("[data-reference]").forEach(r=>{r.addEventListener("click",a=>{a.stopPropagation();let s=r.dataset.reference;this.setSelectionByReference(s),this.callbacks.onSelectReference?.(s)})})}};function xp(t,e,r){let a=[],s=new Set(["Reference","Qty"].map(ti));for(let i of e){if(i==="Reference"||i==="Qty")continue;let o=t.fields?.[i]||"";o&&(a.push([i,o]),s.add(ti(i)))}let n=t.canonicalFields||{};for(let i of r){let o=n[i]||"";if(!o)continue;let c=ti(i);s.has(c)||(s.add(c),a.push([i,o]))}return a}function ti(t){return String(t||"").toLowerCase().replace(/[\s_\-()[\]/]+/g,"")}function vp(t){return["Manufacturer Part Number","Vendor Part Number","Datasheet","Footprint","Value"].includes(t)}function We(t){return String(t??"").replace(/[&<>"']/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[e])}function wp(t){return String(t).replace(/["\\]/g,"\\$&")}function ri(t){let e=`${t.nodeName||""} ${t.meshName||""} ${t.material?.name||""}`.toLowerCase();return e.includes("_pad")||e.includes(".pad")||e.endsWith("pad")?"pad":e.includes("silkscreen")?"silkscreen":e.includes("soldermask")?"soldermask":e.includes("paste")?"paste":"substrate"}function Ic(t){let e=String(t.material?.name||"").toLowerCase();if(e.endsWith("_bottom"))return"back";if(e.endsWith("_top"))return"front";let r=t.bounds;return r&&(r[2]+r[5])/2<0?"back":"front"}function Xr(t,e=()=>""){let r=new Map;for(let a of t){let n=`${e(a)}:${JSON.stringify(a.material)}`;r.has(n)||r.set(n,[]),r.get(n).push(a)}return[...r.values()].map(a=>{let s=a.reduce((h,d)=>h+d.position.length/3,0),n=a.reduce((h,d)=>h+d.indices.length,0),i=new Float32Array(s*3),o=new Float32Array(s*3),c=new Uint32Array(s),l=new Uint32Array(s),f=new Uint32Array(n),u=0,p=0,b=[1/0,1/0,1/0,-1/0,-1/0,-1/0];for(let h of a){let d=h.position.length/3;i.set(h.position,u*3),o.set(h.normal,u*3),c.set(h.netId,u),l.set(h.objectFeatureId,u);for(let x=0;x<h.indices.length;x+=1)f[p+x]=Number(h.indices[x])+u;h.bounds&&(b[0]=Math.min(b[0],h.bounds[0]),b[1]=Math.min(b[1],h.bounds[1]),b[2]=Math.min(b[2],h.bounds[2]),b[3]=Math.max(b[3],h.bounds[3]),b[4]=Math.max(b[4],h.bounds[4]),b[5]=Math.max(b[5],h.bounds[5])),u+=d,p+=h.indices.length}return{position:i,normal:o,netId:c,objectFeatureId:l,indices:f,material:a[0].material,groupKey:e(a[0]),bounds:Number.isFinite(b[0])?b:null}})}function $r(t){return!t||t.length!==6?null:[t[0]/1e3,-t[4]/1e3,t[2]/1e3,t[3]/1e3,-t[1]/1e3,t[5]/1e3]}function Za(t){let e=t?.min||[0,0,0],r=t?.max||[.08,.0016,.05];return[e[0],-r[2],e[1],r[0],-e[2],r[1]]}function vr(t){let e=t.filter(r=>Array.isArray(r)&&r.length===6);return e.length?e.reduce((r,a)=>[Math.min(r[0],a[0]),Math.min(r[1],a[1]),Math.min(r[2],a[2]),Math.max(r[3],a[3]),Math.max(r[4],a[4]),Math.max(r[5],a[5])],[...e[0]]):null}function Ac(t){let e=t.replace("#","");return[0,2,4].map(r=>parseInt(e.slice(r,r+2),16)/255)}function _c(t,e){if(typeof t?.color=="string"&&/^#[0-9a-fA-F]{6}$/.test(t.color))return[...Ac(t.color),1];let r={"F.Cu":"#a9423c","B.Cu":"#315b9a","In1.Cu":"#477a55","In2.Cu":"#806244","In3.Cu":"#347c86","In4.Cu":"#685889","In5.Cu":"#92793e"},a=["#477a55","#806244","#347c86","#685889","#92793e","#82556e"],s=String(t?.name||""),n=Math.max(0,e.findIndex(i=>i.name===s)-1);return[...Ac(r[s]||a[n%a.length]),1]}function Rc(t,e){let r=e.map(a=>[Number(a.id),Number(a.z_mm||0)]);return r.length<3?!1:(r.sort((a,s)=>a[1]-s[1]),t!==r[0][0]&&t!==r[r.length-1][0])}var Wr=Object.freeze({gold:[.83,.69,.37,1],silver:[.74,.75,.77,1],copper:[.76,.47,.28,1]});function Nc(t){let e=String(t||"").toLowerCase();return/hasl|hal\b|tin|silver|lead/.test(e)?Wr.silver:/osp|bare|none/.test(e)?Wr.copper:Wr.gold}function Cc(t,e){let r=String(t?.name||"");return!!r&&(r===e[0]?.name||r===e[e.length-1]?.name)}function Bc(t,e){let r=String(t.material?.name||"").endsWith("_bottom"),a=e.find(s=>s.name===(r?"B.Cu":"F.Cu"))||(r?e[e.length-1]:e[0]);return Number(a?.id||0)}function Fc(t,e=new Map){let r=new Map;for(let s of t||[]){let n=String(s?.designator||"");if(!n)continue;let i=r.get(n)||{reference:n,featureIds:new Set,modelCount:0},o=Number(s?.featureId)||0;o>0&&i.featureIds.add(o),r.set(n,i)}for(let[s,n]of e||[]){let i=r.get(String(s));i&&(i.modelCount=Math.max(i.modelCount,Number(n)||0))}let a=new Map;for(let[s,n]of r)a.set(s,{reference:s,featureIds:[...n.featureIds].sort((i,o)=>i-o),ambiguous:n.featureIds.size>1||n.modelCount>1});return a}function Oc(t,e){let r=[...new Set((Array.isArray(t)?t:[]).map(c=>String(c||"")).filter(Boolean))],a=[],s=[],n=[],i=new Set,o=new Set;for(let c of r){let l=e.get(c);if(!l){n.push(c);continue}if(l.ambiguous){s.push(c);continue}a.push(c),o.add(c);for(let f of l.featureIds)i.add(f)}return{requested:r,applied:a,ambiguous:s,unknown:n,hiddenFeatureIds:i,hiddenReferences:o}}function es(t,e){return!!t&&e.has(String(t))}var Mp={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};function V(t){return String(t??"").replace(/[&<>"']/g,e=>Mp[e])}var Yr=`
fn netEmphasized(id: u32) -> bool {
  return id != 0u && id < arrayLength(&netMask) && netMask[id] != 0u;
}
`;function ts(t){let e=new Set;if(t==null)return e;for(let r of t){let a=Number(r);!Number.isInteger(a)||a<=0||a>4294967295||e.add(a)}return e}function Pc(t,e=0){let r=0;for(let s of ts(t))r=Math.max(r,s);let a=64;for(;a<r+1;)a*=2;return Math.max(a,Math.floor(e)||0)}function jc(t,e){let r=Math.max(64,Math.floor(e)||0),a=new Uint32Array(r);a.fill(0);for(let s of ts(t))s<r&&(a[s]=1);return a}function sr(t,e){return!Array.isArray(t)||!e?null:t.find(r=>r.name===e||Array.isArray(r.aliases)&&r.aliases.includes(e))||null}function Lc(t,e){let r=new Set;if(!Array.isArray(t)||!Array.isArray(e))return r;for(let a of e){if(!a)continue;let s=a.netUid&&t.find(i=>i.uid===a.netUid)||a.netName&&sr(t,a.netName),n=Number(s?.id);Number.isInteger(n)&&n>0&&r.add(n)}return r}var ai=Object.freeze([[.08,1,.2],[1,.72,.1],[.2,.75,1],[1,.3,.75],[.65,.45,1],[1,.45,.2],[.3,1,.85],[.95,.95,.3]]),Dc=`
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
`;function Uc(t){let e=null;return Array.isArray(t)&&t.length>=3&&t.slice(0,3).every(r=>Number.isFinite(Number(r)))?e=t.slice(0,3).map(r=>Math.round(Math.min(1,Math.max(0,Number(r)))*255)):typeof t=="string"&&/^#[0-9a-f]{6}$/i.test(t)&&(e=[1,3,5].map(r=>parseInt(t.slice(r,r+2),16))),e?(1<<24|e[0]<<16|e[1]<<8|e[2])>>>0:1}function zc(t){let e=1;for(let a of t)for(let s of a?.keys()||[])e=Math.max(e,s+1);let r=new Uint32Array(Math.max(64,t.length*e));return t.forEach((a,s)=>{for(let[n,i]of a||[])Number.isInteger(n)&&n>0&&(r[s*e+n]=i>>>0)}),{stride:e,data:r}}function kp(t){return(typeof t.composedPath=="function"?t.composedPath():[])[0]??t.target??null}function Gc(t){let e=kp(t);if(!e||typeof e!="object")return!1;let r=typeof e.tagName=="string"?e.tagName.toUpperCase():"";return r==="INPUT"||r==="TEXTAREA"||r==="SELECT"||e.isContentEditable===!0}function Kc(t){return!!(t.metaKey||t.ctrlKey)}var Ep=4;function Vc(t,e=Ep){let r=new Map,a=[];for(let n of t){if(n.placements.length<e){for(let o of n.placements)a.push(Sp(n.primitive,o));continue}let i=`${n.placements.map(o=>o.node).join(",")}|${JSON.stringify(n.primitive.material)}`;r.has(i)||r.set(i,[]),r.get(i).push(n)}return{instanced:[...r.values()].map(n=>({primitive:Tp(n.map(i=>i.primitive)),placements:n[0].placements})),baked:Xr(a)}}function Sp(t,e){let{rows:r,featureId:a,bounds:s}=e,n=t.position.length/3,i=new Float32Array(n*3),o=new Float32Array(n*3),c=new Uint32Array(n);for(let l=0;l<n;l+=1){let f=l*3,[u,p,b]=[t.position[f],t.position[f+1],t.position[f+2]],[h,d,x]=[t.normal[f],t.normal[f+1],t.normal[f+2]],g=0;for(let y=0;y<3;y+=1){let m=y*4;i[f+y]=r[m]*u+r[m+1]*p+r[m+2]*b+r[m+3],o[f+y]=r[m]*h+r[m+1]*d+r[m+2]*x,g+=o[f+y]**2}g=Math.sqrt(g)||1;for(let y=0;y<3;y+=1)o[f+y]/=g;c[l]=t.objectFeatureId[l]||a||0}return{position:i,normal:o,netId:t.netId,objectFeatureId:c,indices:t.indices,material:t.material,bounds:[...s]}}function Tp(t){if(t.length===1)return t[0];let e=t.reduce((u,p)=>u+p.position.length/3,0),r=t.reduce((u,p)=>u+p.indices.length,0),a=new Float32Array(e*3),s=new Float32Array(e*3),n=new Uint32Array(e),i=new Uint32Array(e),o=new Uint32Array(r),c=[1/0,1/0,1/0,-1/0,-1/0,-1/0],l=0,f=0;for(let u of t){a.set(u.position,l*3),s.set(u.normal,l*3),n.set(u.netId,l),i.set(u.objectFeatureId,l);for(let p=0;p<u.indices.length;p+=1)o[f+p]=u.indices[p]+l;for(let p=0;p<3;p+=1)c[p]=Math.min(c[p],u.bounds[p]),c[p+3]=Math.max(c[p+3],u.bounds[p+3]);l+=u.position.length/3,f+=u.indices.length}return{position:a,normal:s,netId:n,objectFeatureId:i,indices:o,material:t[0].material,bounds:c}}var Hc=class{_listeners={};addEventListener(t,e){let r=this._listeners;return r[t]===void 0&&(r[t]=[]),r[t].indexOf(e)===-1&&r[t].push(e),this}removeEventListener(t,e){let r=this._listeners[t];if(r!==void 0){let a=r.indexOf(e);a!==-1&&r.splice(a,1)}return this}dispatchEvent(t){let e=this._listeners[t.type];if(e!==void 0){let r=e.slice(0);for(let a=0,s=r.length;a<s;a++)r[a].call(this,t)}return this}dispose(){for(let t in this._listeners)delete this._listeners[t]}},Nt=class{_disposed=!1;_name;_parent;_child;_attributes;constructor(t,e,r,a={}){if(this._name=t,this._parent=e,this._child=r,this._attributes=a,!e.isOnGraph(r))throw new Error("Cannot connect disconnected graphs.")}getName(){return this._name}getParent(){return this._parent}getChild(){return this._child}setChild(t){return this._child=t,this}getAttributes(){return this._attributes}dispose(){this._disposed||(this._parent._destroyRef(this),this._disposed=!0)}isDisposed(){return this._disposed}},si=class extends Hc{_emptySet=new Set;_edges=new Set;_parentEdges=new Map;_childEdges=new Map;listEdges(){return Array.from(this._edges)}listParentEdges(t){return Array.from(this._childEdges.get(t)||this._emptySet)}listParents(t){let e=new Set;for(let r of this.listParentEdges(t))e.add(r.getParent());return Array.from(e)}listChildEdges(t){return Array.from(this._parentEdges.get(t)||this._emptySet)}listChildren(t){let e=new Set;for(let r of this.listChildEdges(t))e.add(r.getChild());return Array.from(e)}disconnectParents(t,e){for(let r of this.listParentEdges(t))(!e||e(r.getParent()))&&r.dispose();return this}_createEdge(t,e,r,a){let s=new Nt(t,e,r,a);this._edges.add(s);let n=s.getParent();this._parentEdges.has(n)||this._parentEdges.set(n,new Set),this._parentEdges.get(n).add(s);let i=s.getChild();return this._childEdges.has(i)||this._childEdges.set(i,new Set),this._childEdges.get(i).add(s),s}_destroyEdge(t){return this._edges.delete(t),this._parentEdges.get(t.getParent()).delete(t),this._childEdges.get(t.getChild()).delete(t),this}},Se=class{list=[];constructor(t){if(t)for(let e of t)this.list.push(e)}add(t){this.list.push(t)}remove(t){let e=this.list.indexOf(t);e>=0&&this.list.splice(e,1)}removeChild(t){let e=[];for(let r of this.list)r.getChild()===t&&e.push(r);for(let r of e)this.remove(r);return e}listRefsByChild(t){let e=[];for(let r of this.list)r.getChild()===t&&e.push(r);return e}values(){return this.list}},ne=class{set=new Set;map=new Map;constructor(t){if(t)for(let e of t)this.add(e)}add(t){let e=t.getChild();this.removeChild(e),this.set.add(t),this.map.set(e,t)}remove(t){this.set.delete(t),this.map.delete(t.getChild())}removeChild(t){let e=this.map.get(t)||null;return e&&this.remove(e),e}getRefByChild(t){return this.map.get(t)||null}values(){return Array.from(this.set)}},ge=class{map={};constructor(t){t&&Object.assign(this.map,t)}set(t,e){this.map[t]=e}delete(t){delete this.map[t]}get(t){return this.map[t]||null}keys(){return Object.keys(this.map)}values(){return Object.values(this.map)}},ee=Symbol("attributes"),Rt=Symbol("immutableKeys"),qc=class Wc extends Hc{_disposed=!1;graph;[ee];[Rt];constructor(e){super(),this.graph=e,this[Rt]=new Set,this[ee]=this._createAttributes()}getDefaults(){return{}}_createAttributes(){let e=this.getDefaults(),r={};for(let a in e){let s=e[a];if(s instanceof Wc){let n=this.graph._createEdge(a,this,s);this[Rt].add(a),r[a]=n}else r[a]=s}return r}isOnGraph(e){return this.graph===e.graph}isDisposed(){return this._disposed}dispose(){this._disposed||(this.graph.listChildEdges(this).forEach(e=>e.dispose()),this.graph.disconnectParents(this),this._disposed=!0,this.dispatchEvent({type:"dispose"}))}detach(){return this.graph.disconnectParents(this),this}swap(e,r){for(let a in this[ee]){let s=this[ee][a];if(s instanceof Nt){let n=s;n.getChild()===e&&this.setRef(a,r,n.getAttributes())}else if(s instanceof Se)for(let n of s.listRefsByChild(e)){let i=n.getAttributes();this.removeRef(a,e),this.addRef(a,r,i)}else if(s instanceof ne){let n=s.getRefByChild(e);if(n){let i=n.getAttributes();this.removeRef(a,e),this.addRef(a,r,i)}}else if(s instanceof ge)for(let n of s.keys()){let i=s.get(n);i.getChild()===e&&this.setRefMap(a,n,r,i.getAttributes())}}return this}get(e){return this[ee][e]}set(e,r){return this[ee][e]=r,this.dispatchEvent({type:"change",attribute:e})}getRef(e){let r=this[ee][e];return r?r.getChild():null}setRef(e,r,a){if(this[Rt].has(e))throw new Error(`Cannot overwrite immutable attribute, "${e}".`);let s=this[ee][e];if(s&&s.dispose(),!r)return this;let n=this.graph._createEdge(e,this,r,a);return this[ee][e]=n,this.dispatchEvent({type:"change",attribute:e})}listRefs(e){return this.assertRefList(e).values().map(r=>r.getChild())}addRef(e,r,a){let s=this.graph._createEdge(e,this,r,a);return this.assertRefList(e).add(s),this.dispatchEvent({type:"change",attribute:e})}removeRef(e,r){let a=this.assertRefList(e);if(a instanceof Se)for(let s of a.listRefsByChild(r))s.dispose();else{let s=a.getRefByChild(r);s&&s.dispose()}return this}assertRefList(e){let r=this[ee][e];if(r instanceof Se||r instanceof ne)return r;throw new Error(`Expected RefList or RefSet for attribute "${e}"`)}listRefMapKeys(e){return this.assertRefMap(e).keys()}listRefMapValues(e){return this.assertRefMap(e).values().map(r=>r.getChild())}getRefMap(e,r){let a=this.assertRefMap(e).get(r);return a?a.getChild():null}setRefMap(e,r,a,s){let n=this.assertRefMap(e),i=n.get(r);if(i&&i.dispose(),!a)return this;s=Object.assign(s||{},{key:r});let o=this.graph._createEdge(e,this,a,{...s,key:r});return n.set(r,o),this.dispatchEvent({type:"change",attribute:e,key:r})}assertRefMap(e){let r=this[ee][e];if(r instanceof ge)return r;throw new Error(`Expected RefMap for attribute "${e}"`)}dispatchEvent(e){return super.dispatchEvent({...e,target:this}),this.graph.dispatchEvent({...e,target:this,type:`node:${e.type}`}),this}_destroyRef(e){let r=e.getName();if(this[ee][r]===e)this[ee][r]=null,this[Rt].has(r)&&e.getChild().dispose();else if(this[ee][r]instanceof Se)this[ee][r].remove(e);else if(this[ee][r]instanceof ne)this[ee][r].remove(e);else if(this[ee][r]instanceof ge){let a=this[ee][r];for(let s of a.keys())a.get(s)===e&&a.delete(s)}else return;this.graph._destroyEdge(e),this.dispatchEvent({type:"change",attribute:r})}};var el="v4.4.2",Bt="@glb.bin",O=(function(t){return t.ACCESSOR="Accessor",t.ANIMATION="Animation",t.ANIMATION_CHANNEL="AnimationChannel",t.ANIMATION_SAMPLER="AnimationSampler",t.BUFFER="Buffer",t.CAMERA="Camera",t.MATERIAL="Material",t.MESH="Mesh",t.PRIMITIVE="Primitive",t.PRIMITIVE_TARGET="PrimitiveTarget",t.NODE="Node",t.ROOT="Root",t.SCENE="Scene",t.SKIN="Skin",t.TEXTURE="Texture",t.TEXTURE_INFO="TextureInfo",t})({});var Ap=(function(t){return t.ARRAY_BUFFER="ARRAY_BUFFER",t.ELEMENT_ARRAY_BUFFER="ELEMENT_ARRAY_BUFFER",t.INVERSE_BIND_MATRICES="INVERSE_BIND_MATRICES",t.OTHER="OTHER",t.SPARSE="SPARSE",t})({}),rt=(function(t){return t[t.R=4096]="R",t[t.G=256]="G",t[t.B=16]="B",t[t.A=1]="A",t})({});var Ip=class extends Float32Array{constructor(){throw super(),new Error("Unsupported typed array instantiation.")}},ls={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5131:typeof Float16Array<"u"?Float16Array:Ip,5126:Float32Array,5130:Float64Array},q=class{static createBufferFromDataURI(t){if(typeof Buffer>"u"){let e=atob(t.split(",")[1]),r=new Uint8Array(e.length);for(let a=0;a<e.length;a++)r[a]=e.charCodeAt(a);return r}else{let e=t.split(",")[1],r=t.indexOf("base64")>=0;return Buffer.from(e,r?"base64":"utf8")}}static encodeText(t){return new TextEncoder().encode(t)}static decodeText(t){return new TextDecoder().decode(t)}static concat(t){let e=0;for(let s of t)e+=s.byteLength;let r=new Uint8Array(e),a=0;for(let s of t)r.set(s,a),a+=s.byteLength;return r}static pad(t,e=0){let r=this.padNumber(t.byteLength);if(r===t.byteLength)return t;let a=new Uint8Array(r);if(a.set(t),e!==0)for(let s=t.byteLength;s<r;s++)a[s]=e;return a}static padNumber(t){return Math.ceil(t/4)*4}static equals(t,e){if(t===e)return!0;if(t.byteLength!==e.byteLength)return!1;let r=t.byteLength;for(;r--;)if(t[r]!==e[r])return!1;return!0}static toView(t,e=0,r=1/0){return new Uint8Array(t.buffer,t.byteOffset+e,Math.min(t.byteLength,r))}static assertView(t){if(t&&!ArrayBuffer.isView(t))throw new Error(`Method requires Uint8Array parameter; received "${typeof t}".`);return t}};var _p=class{match(t){return t.length>=3&&t[0]===255&&t[1]===216&&t[2]===255}getSize(t){let e=new DataView(t.buffer,t.byteOffset+4),r,a;for(;e.byteLength;){if(r=e.getUint16(0,!1),Np(e,r),a=e.getUint8(r+1),a===192||a===193||a===194)return[e.getUint16(r+7,!1),e.getUint16(r+5,!1)];e=new DataView(t.buffer,e.byteOffset+r+2)}throw new TypeError("Invalid JPG, no size found")}getChannels(t){return 3}},Rp=class tl{static PNG_FRIED_CHUNK_NAME="CgBI";match(e){return e.length>=8&&e[0]===137&&e[1]===80&&e[2]===78&&e[3]===71&&e[4]===13&&e[5]===10&&e[6]===26&&e[7]===10}getSize(e){let r=new DataView(e.buffer,e.byteOffset);return q.decodeText(e.slice(12,16))===tl.PNG_FRIED_CHUNK_NAME?[r.getUint32(32,!1),r.getUint32(36,!1)]:[r.getUint32(16,!1),r.getUint32(20,!1)]}getChannels(e){return 4}},lt=class{static impls={"image/jpeg":new _p,"image/png":new Rp};static registerFormat(t,e){this.impls[t]=e}static getMimeType(t){for(let e in this.impls)if(this.impls[e].match(t))return e;return null}static getSize(t,e){return this.impls[e]?this.impls[e].getSize(t):null}static getChannels(t,e){return this.impls[e]?this.impls[e].getChannels(t):null}static getVRAMByteLength(t,e){if(!this.impls[e])return null;if(this.impls[e].getVRAMByteLength)return this.impls[e].getVRAMByteLength(t);let r=0,a=4,s=this.getSize(t,e);if(!s)return null;for(;s[0]>1||s[1]>1;)r+=s[0]*s[1]*a,s[0]=Math.max(Math.floor(s[0]/2),1),s[1]=Math.max(Math.floor(s[1]/2),1);return r+=1*a,r}static mimeTypeToExtension(t){return t==="image/jpeg"?"jpg":t.split("/").pop()}static extensionToMimeType(t){return t==="jpg"?"image/jpeg":t?`image/${t}`:""}};function Np(t,e){if(e>t.byteLength)throw new TypeError("Corrupt JPG, exceeded buffer limits");if(t.getUint8(e)!==255)throw new TypeError("Invalid JPG, marker table corrupted");return t}var wr=class{static basename(t){let e=t.split(/[\\/]/).pop();return e.substring(0,e.lastIndexOf("."))}static extension(t){if(t.startsWith("data:image/")){let e=t.match(/data:(image\/\w+)/)[1];return lt.mimeTypeToExtension(e)}else{if(t.startsWith("data:model/gltf+json"))return"gltf";if(t.startsWith("data:model/gltf-binary"))return"glb";if(t.startsWith("data:application/"))return"bin"}return t.split(/[\\/]/).pop().split(/[.]/).pop()}},oi=typeof Float32Array<"u"?Float32Array:Array;Math.PI/180;180/Math.PI;function Cp(){var t=new oi(3);return oi!=Float32Array&&(t[0]=0,t[1]=0,t[2]=0),t}function ni(t){var e=t[0],r=t[1],a=t[2];return Math.sqrt(e*e+r*r+a*a)}function Bp(t,e,r){var a=e[0],s=e[1],n=e[2],i=r[3]*a+r[7]*s+r[11]*n+r[15];return i=i||1,t[0]=(r[0]*a+r[4]*s+r[8]*n+r[12])/i,t[1]=(r[1]*a+r[5]*s+r[9]*n+r[13])/i,t[2]=(r[2]*a+r[6]*s+r[10]*n+r[14])/i,t}(function(){var t=Cp();return function(e,r,a,s,n,i){var o,c;for(r||(r=3),a||(a=0),s?c=Math.min(s*r+a,e.length):c=e.length,o=a;o<c;o+=r)t[0]=e[o],t[1]=e[o+1],t[2]=e[o+2],n(t,t,i),e[o]=t[0],e[o+1]=t[1],e[o+2]=t[2];return e}})();function rl(t){let e=al(),r=t.propertyType==="Node"?[t]:t.listChildren();for(let a of r)a.traverse(s=>{let n=s.getMesh();if(!n)return;let i=Fp(n,s.getWorldMatrix());i.min.every(isFinite)&&i.max.every(isFinite)&&(ci(i.min,e),ci(i.max,e))});return e}function Fp(t,e){let r=al();for(let a of t.listPrimitives()){let s=a.getAttribute("POSITION"),n=a.getIndices();if(!s)continue;let i=[0,0,0],o=[0,0,0];for(let c=0,l=n?n.getCount():s.getCount();c<l;c++){let f=n?n.getScalar(c):c;i=s.getElement(f,i),o=Bp(o,i,e),ci(o,r)}}return r}function ci(t,e){for(let r=0;r<3;r++)e.min[r]=Math.min(t[r],e.min[r]),e.max[r]=Math.max(t[r],e.max[r])}function al(){return{min:[1/0,1/0,1/0],max:[-1/0,-1/0,-1/0]}}var Xc="https://null.example",ii=class{static DEFAULT_INIT={};static PROTOCOL_REGEXP=/^[a-zA-Z]+:\/\//;static dirname(t){let e=t.lastIndexOf("/");return e===-1?"./":t.substring(0,e+1)}static basename(t){return wr.basename(new URL(t,Xc).pathname)}static extension(t){return wr.extension(new URL(t,Xc).pathname)}static resolve(t,e){if(!this.isRelativePath(e))return e;let r=t.split("/"),a=e.split("/");r.pop();for(let s=0;s<a.length;s++)a[s]!=="."&&(a[s]===".."?r.pop():r.push(a[s]));return r.join("/")}static isAbsoluteURL(t){return this.PROTOCOL_REGEXP.test(t)}static isRelativePath(t){return!/^(?:[a-zA-Z]+:)?\//.test(t)}};function $c(t){return Object.prototype.toString.call(t)==="[object Object]"}function nr(t){if($c(t)===!1)return!1;let e=t.constructor;if(e===void 0)return!0;let r=e.prototype;return!($c(r)===!1||Object.hasOwn(r,"isPrototypeOf")===!1)}var Op=(function(t){return t[t.SILENT=4]="SILENT",t[t.ERROR=3]="ERROR",t[t.WARN=2]="WARN",t[t.INFO=1]="INFO",t[t.DEBUG=0]="DEBUG",t})({}),ds=class sl{verbosity;static Verbosity=Op;static DEFAULT_INSTANCE=new sl(1);constructor(e){this.verbosity=e}debug(e){this.verbosity<=0&&console.debug(e)}info(e){this.verbosity<=1&&console.info(e)}warn(e){this.verbosity<=2&&console.warn(e)}error(e){this.verbosity<=3&&console.error(e)}};function Pp(t){var e=t[0],r=t[1],a=t[2],s=t[3],n=t[4],i=t[5],o=t[6],c=t[7],l=t[8],f=t[9],u=t[10],p=t[11],b=t[12],h=t[13],d=t[14],x=t[15],g=e*i-r*n,y=e*o-a*n,m=r*o-a*i,w=l*h-f*b,E=l*d-u*b,S=f*d-u*h,A=e*S-r*E+a*w,T=n*S-i*E+o*w,_=l*m-f*y+u*g,R=b*m-h*y+d*g;return c*A-s*T+x*_-p*R}function jp(t,e,r){var a=e[0],s=e[1],n=e[2],i=e[3],o=e[4],c=e[5],l=e[6],f=e[7],u=e[8],p=e[9],b=e[10],h=e[11],d=e[12],x=e[13],g=e[14],y=e[15],m=r[0],w=r[1],E=r[2],S=r[3];return t[0]=m*a+w*o+E*u+S*d,t[1]=m*s+w*c+E*p+S*x,t[2]=m*n+w*l+E*b+S*g,t[3]=m*i+w*f+E*h+S*y,m=r[4],w=r[5],E=r[6],S=r[7],t[4]=m*a+w*o+E*u+S*d,t[5]=m*s+w*c+E*p+S*x,t[6]=m*n+w*l+E*b+S*g,t[7]=m*i+w*f+E*h+S*y,m=r[8],w=r[9],E=r[10],S=r[11],t[8]=m*a+w*o+E*u+S*d,t[9]=m*s+w*c+E*p+S*x,t[10]=m*n+w*l+E*b+S*g,t[11]=m*i+w*f+E*h+S*y,m=r[12],w=r[13],E=r[14],S=r[15],t[12]=m*a+w*o+E*u+S*d,t[13]=m*s+w*c+E*p+S*x,t[14]=m*n+w*l+E*b+S*g,t[15]=m*i+w*f+E*h+S*y,t}function Lp(t,e){var r=e[0],a=e[1],s=e[2],n=e[4],i=e[5],o=e[6],c=e[8],l=e[9],f=e[10];return t[0]=Math.sqrt(r*r+a*a+s*s),t[1]=Math.sqrt(n*n+i*i+o*o),t[2]=Math.sqrt(c*c+l*l+f*f),t}function Dp(t,e){var r=new oi(3);Lp(r,e);var a=1/r[0],s=1/r[1],n=1/r[2],i=e[0]*a,o=e[1]*s,c=e[2]*n,l=e[4]*a,f=e[5]*s,u=e[6]*n,p=e[8]*a,b=e[9]*s,h=e[10]*n,d=i+f+h,x=0;return d>0?(x=Math.sqrt(d+1)*2,t[3]=.25*x,t[0]=(u-b)/x,t[1]=(p-c)/x,t[2]=(o-l)/x):i>f&&i>h?(x=Math.sqrt(1+i-f-h)*2,t[3]=(u-b)/x,t[0]=.25*x,t[1]=(o+l)/x,t[2]=(p+c)/x):f>h?(x=Math.sqrt(1+f-i-h)*2,t[3]=(p-c)/x,t[0]=(o+l)/x,t[1]=.25*x,t[2]=(u+b)/x):(x=Math.sqrt(1+h-i-f)*2,t[3]=(o-l)/x,t[0]=(p+c)/x,t[1]=(u+b)/x,t[2]=.25*x),t}var le=class Jr{static identity(e){return e}static eq(e,r,a=1e-5){if(e.length!==r.length)return!1;for(let s=0;s<e.length;s++)if(Math.abs(e[s]-r[s])>a)return!1;return!0}static clamp(e,r,a){return e<r?r:e>a?a:e}static decodeNormalizedInt(e,r){switch(r){case 5126:return e;case 5123:return e/65535;case 5121:return e/255;case 5122:return Math.max(e/32767,-1);case 5120:return Math.max(e/127,-1);default:throw new Error("Invalid component type.")}}static encodeNormalizedInt(e,r){switch(r){case 5126:return e;case 5123:return Math.round(Jr.clamp(e,0,1)*65535);case 5121:return Math.round(Jr.clamp(e,0,1)*255);case 5122:return Math.round(Jr.clamp(e,-1,1)*32767);case 5120:return Math.round(Jr.clamp(e,-1,1)*127);default:throw new Error("Invalid component type.")}}static decompose(e,r,a,s){let n=ni([e[0],e[1],e[2]]),i=ni([e[4],e[5],e[6]]),o=ni([e[8],e[9],e[10]]);Pp(e)<0&&(n=-n),r[0]=e[12],r[1]=e[13],r[2]=e[14];let c=e.slice(),l=1/n,f=1/i,u=1/o;c[0]*=l,c[1]*=l,c[2]*=l,c[4]*=f,c[5]*=f,c[6]*=f,c[8]*=u,c[9]*=u,c[10]*=u,Dp(a,c),s[0]=n,s[1]=i,s[2]=o}static compose(e,r,a,s){let n=s,i=r[0],o=r[1],c=r[2],l=r[3],f=i+i,u=o+o,p=c+c,b=i*f,h=i*u,d=i*p,x=o*u,g=o*p,y=c*p,m=l*f,w=l*u,E=l*p,S=a[0],A=a[1],T=a[2];return n[0]=(1-(x+y))*S,n[1]=(h+E)*S,n[2]=(d-w)*S,n[3]=0,n[4]=(h-E)*A,n[5]=(1-(b+y))*A,n[6]=(g+m)*A,n[7]=0,n[8]=(d+w)*T,n[9]=(g-m)*T,n[10]=(1-(b+x))*T,n[11]=0,n[12]=e[0],n[13]=e[1],n[14]=e[2],n[15]=1,n}};function Up(t,e){if(!!t!=!!e)return!1;let r=t.getChild(),a=e.getChild();return r===a||r.equals(a)}function zp(t,e){if(!!t!=!!e)return!1;let r=t.values(),a=e.values();if(r.length!==a.length)return!1;for(let s=0;s<r.length;s++){let n=r[s],i=a[s];if(n.getChild()!==i.getChild()&&!n.getChild().equals(i.getChild()))return!1}return!0}function Gp(t,e){if(!!t!=!!e)return!1;let r=t.keys(),a=e.keys();if(r.length!==a.length)return!1;for(let s of r){let n=t.get(s),i=e.get(s);if(!!n!=!!i)return!1;let o=n.getChild(),c=i.getChild();if(o!==c&&!o.equals(c))return!1}return!0}function nl(t,e){if(t===e)return!0;if(!!t!=!!e||!t||!e||t.length!==e.length)return!1;for(let r=0;r<t.length;r++)if(t[r]!==e[r])return!1;return!0}function il(t,e){if(t===e)return!0;if(!!t!=!!e)return!1;if(!nr(t)||!nr(e))return t===e;let r=t,a=e,s=0,n=0,i;for(i in r)s++;for(i in a)n++;if(s!==n)return!1;for(i in r){let o=r[i],c=a[i];if(os(o)&&os(c)){if(!nl(o,c))return!1}else if(nr(o)&&nr(c)){if(!il(o,c))return!1}else if(o!==c)return!1}return!0}function os(t){return Array.isArray(t)||ArrayBuffer.isView(t)}var Kp="23456789abdegjkmnpqrvwxyzABDEGJKMNPQRVWXYZ",Vp=999,Hp=6,Yc=new Set,qp=function(){let t="";for(let e=0;e<Hp;e++)t+=Kp.charAt(Math.floor(Math.random()*42));return t},Wp=function(){for(let t=0;t<Vp;t++){let e=qp();if(!Yc.has(e))return Yc.add(e),e}return""},Ft=t=>t,Xp=new Set,ui=class extends qc{constructor(t,e=""){super(t),this[ee].name=e,this.init(),this.dispatchEvent({type:"create"})}getGraph(){return this.graph}getDefaults(){return Object.assign(super.getDefaults(),{name:"",extras:{}})}set(t,e){return Array.isArray(e)&&(e=e.slice()),super.set(t,e)}getName(){return this.get("name")}setName(t){return this.set("name",t)}getExtras(){return this.get("extras")}setExtras(t){return this.set("extras",t)}clone(){let t=this.constructor;return new t(this.graph).copy(this,Ft)}copy(t,e=Ft){for(let r in this[ee]){let a=this[ee][r];if(a instanceof Nt)this[Rt].has(r)||a.dispose();else if(a instanceof Se||a instanceof ne)for(let s of a.values())s.dispose();else if(a instanceof ge)for(let s of a.values())s.dispose()}for(let r in t[ee]){let a=this[ee][r],s=t[ee][r];if(s instanceof Nt)this[Rt].has(r)?a.getChild().copy(e(s.getChild()),e):this.setRef(r,e(s.getChild()),s.getAttributes());else if(s instanceof ne||s instanceof Se)for(let n of s.values())this.addRef(r,e(n.getChild()),n.getAttributes());else if(s instanceof ge)for(let n of s.keys()){let i=s.get(n);this.setRefMap(r,n,e(i.getChild()),i.getAttributes())}else nr(s)?this[ee][r]=JSON.parse(JSON.stringify(s)):Array.isArray(s)||s instanceof ArrayBuffer||ArrayBuffer.isView(s)?this[ee][r]=s.slice():this[ee][r]=s}return this}equals(t,e=Xp){if(this===t)return!0;if(this.propertyType!==t.propertyType)return!1;for(let r in this[ee]){if(e.has(r))continue;let a=this[ee][r],s=t[ee][r];if(a instanceof Nt||s instanceof Nt){if(!Up(a,s))return!1}else if(a instanceof ne||s instanceof ne||a instanceof Se||s instanceof Se){if(!zp(a,s))return!1}else if(a instanceof ge||s instanceof ge){if(!Gp(a,s))return!1}else if(nr(a)||nr(s)){if(!il(a,s))return!1}else if(os(a)||os(s)){if(!nl(a,s))return!1}else if(a!==s)return!1}return!0}detach(){return this.graph.disconnectParents(this,t=>t.propertyType!=="Root"),this}listParents(){return this.graph.listParents(this)}},Ne=class extends ui{getDefaults(){return Object.assign(super.getDefaults(),{extensions:new ge})}getExtension(t){return this.getRefMap("extensions",t)}setExtension(t,e){return e&&e._validateParent(this),this.setRefMap("extensions",t,e)}listExtensions(){return this.listRefMapValues("extensions")}},G=class me extends Ne{static Type={SCALAR:"SCALAR",VEC2:"VEC2",VEC3:"VEC3",VEC4:"VEC4",MAT2:"MAT2",MAT3:"MAT3",MAT4:"MAT4"};static ComponentType={BYTE:5120,UNSIGNED_BYTE:5121,SHORT:5122,UNSIGNED_SHORT:5123,UNSIGNED_INT:5125,FLOAT:5126,FLOAT16:5131,FLOAT64:5130};init(){this.propertyType="Accessor"}getDefaults(){return Object.assign(super.getDefaults(),{array:null,type:me.Type.SCALAR,componentType:me.ComponentType.FLOAT,normalized:!1,sparse:!1,buffer:null})}static getElementSize(e){switch(e){case me.Type.SCALAR:return 1;case me.Type.VEC2:return 2;case me.Type.VEC3:return 3;case me.Type.VEC4:return 4;case me.Type.MAT2:return 4;case me.Type.MAT3:return 9;case me.Type.MAT4:return 16;default:throw new Error("Unexpected type: "+e)}}static getComponentSize(e){switch(e){case me.ComponentType.BYTE:case me.ComponentType.UNSIGNED_BYTE:return 1;case me.ComponentType.SHORT:case me.ComponentType.UNSIGNED_SHORT:return 2;case me.ComponentType.UNSIGNED_INT:case me.ComponentType.FLOAT:return 4;case me.ComponentType.FLOAT16:return 2;case me.ComponentType.FLOAT64:return 8;default:throw new Error("Unexpected component type: "+e)}}getMinNormalized(e){let r=this.getNormalized(),a=this.getElementSize(),s=this.getComponentType();if(this.getMin(e),r)for(let n=0;n<a;n++)e[n]=le.decodeNormalizedInt(e[n],s);return e}getMin(e){let r=this.getArray(),a=this.getCount(),s=this.getElementSize();for(let n=0;n<s;n++)e[n]=1/0;for(let n=0;n<a*s;n+=s)for(let i=0;i<s;i++){let o=r[n+i];Number.isFinite(o)&&(e[i]=Math.min(e[i],o))}return e}getMaxNormalized(e){let r=this.getNormalized(),a=this.getElementSize(),s=this.getComponentType();if(this.getMax(e),r)for(let n=0;n<a;n++)e[n]=le.decodeNormalizedInt(e[n],s);return e}getMax(e){let r=this.get("array"),a=this.getCount(),s=this.getElementSize();for(let n=0;n<s;n++)e[n]=-1/0;for(let n=0;n<a*s;n+=s)for(let i=0;i<s;i++){let o=r[n+i];Number.isFinite(o)&&(e[i]=Math.max(e[i],o))}return e}getCount(){let e=this.get("array");return e?e.length/this.getElementSize():0}getType(){return this.get("type")}setType(e){return this.set("type",e)}getElementSize(){return me.getElementSize(this.get("type"))}getComponentSize(){return this.get("array").BYTES_PER_ELEMENT}getComponentType(){return this.get("componentType")}getNormalized(){return this.get("normalized")}setNormalized(e){return this.set("normalized",e)}getScalar(e){let r=this.getElementSize(),a=this.getComponentType(),s=this.getArray();return this.getNormalized()?le.decodeNormalizedInt(s[e*r],a):s[e*r]}setScalar(e,r){let a=this.getElementSize(),s=this.getComponentType(),n=this.getArray();return this.getNormalized()?n[e*a]=le.encodeNormalizedInt(r,s):n[e*a]=r,this}getElement(e,r){let a=this.getNormalized(),s=this.getElementSize(),n=this.getComponentType(),i=this.getArray();for(let o=0;o<s;o++)a?r[o]=le.decodeNormalizedInt(i[e*s+o],n):r[o]=i[e*s+o];return r}setElement(e,r){let a=this.getNormalized(),s=this.getElementSize(),n=this.getComponentType(),i=this.getArray();for(let o=0;o<s;o++)a?i[e*s+o]=le.encodeNormalizedInt(r[o],n):i[e*s+o]=r[o];return this}getSparse(){return this.get("sparse")}setSparse(e){return this.set("sparse",e)}getBuffer(){return this.getRef("buffer")}setBuffer(e){return this.setRef("buffer",e)}getArray(){return this.get("array")}setArray(e){return this.set("componentType",e?$p(e):me.ComponentType.FLOAT),this.set("array",e),this}getByteLength(){let e=this.get("array");return e?e.byteLength:0}};function $p(t){switch(t.constructor){case Float32Array:return G.ComponentType.FLOAT;case Uint32Array:return G.ComponentType.UNSIGNED_INT;case Uint16Array:return G.ComponentType.UNSIGNED_SHORT;case Uint8Array:return G.ComponentType.UNSIGNED_BYTE;case Int16Array:return G.ComponentType.SHORT;case Int8Array:return G.ComponentType.BYTE;case Float64Array:return G.ComponentType.FLOAT64}if(typeof Float16Array<"u"&&t.constructor===Float16Array)return G.ComponentType.FLOAT16;throw new Error("Unknown accessor componentType.")}var ol=class extends Ne{init(){this.propertyType="Animation"}getDefaults(){return Object.assign(super.getDefaults(),{channels:new ne,samplers:new ne})}addChannel(t){return this.addRef("channels",t)}removeChannel(t){return this.removeRef("channels",t)}listChannels(){return this.listRefs("channels")}addSampler(t){return this.addRef("samplers",t)}removeSampler(t){return this.removeRef("samplers",t)}listSamplers(){return this.listRefs("samplers")}},fi=class extends Ne{static TargetPath={TRANSLATION:"translation",ROTATION:"rotation",SCALE:"scale",WEIGHTS:"weights"};init(){this.propertyType="AnimationChannel"}getDefaults(){return Object.assign(super.getDefaults(),{targetPath:null,targetNode:null,sampler:null})}getTargetPath(){return this.get("targetPath")}setTargetPath(t){return this.set("targetPath",t)}getTargetNode(){return this.getRef("targetNode")}setTargetNode(t){return this.setRef("targetNode",t)}getSampler(){return this.getRef("sampler")}setSampler(t){return this.setRef("sampler",t)}},us=class cl extends Ne{static Interpolation={LINEAR:"LINEAR",STEP:"STEP",CUBICSPLINE:"CUBICSPLINE"};init(){this.propertyType="AnimationSampler"}getDefaultAttributes(){return Object.assign(super.getDefaults(),{interpolation:cl.Interpolation.LINEAR,input:null,output:null})}getInterpolation(){return this.get("interpolation")}setInterpolation(e){return this.set("interpolation",e)}getInput(){return this.getRef("input")}setInput(e){return this.setRef("input",e,{usage:"OTHER"})}getOutput(){return this.getRef("output")}setOutput(e){return this.setRef("output",e,{usage:"OTHER"})}},ll=class extends Ne{init(){this.propertyType="Buffer"}getDefaults(){return Object.assign(super.getDefaults(),{uri:""})}getURI(){return this.get("uri")}setURI(t){return this.set("uri",t)}},fs=class dl extends Ne{static Type={PERSPECTIVE:"perspective",ORTHOGRAPHIC:"orthographic"};init(){this.propertyType="Camera"}getDefaults(){return Object.assign(super.getDefaults(),{type:dl.Type.PERSPECTIVE,znear:.1,zfar:100,aspectRatio:null,yfov:Math.PI*2*50/360,xmag:1,ymag:1})}getType(){return this.get("type")}setType(e){return this.set("type",e)}getZNear(){return this.get("znear")}setZNear(e){return this.set("znear",e)}getZFar(){return this.get("zfar")}setZFar(e){return this.set("zfar",e)}getAspectRatio(){return this.get("aspectRatio")}setAspectRatio(e){return this.set("aspectRatio",e)}getYFov(){return this.get("yfov")}setYFov(e){return this.set("yfov",e)}getXMag(){return this.get("xmag")}setXMag(e){return this.set("xmag",e)}getYMag(){return this.get("ymag")}setYMag(e){return this.set("ymag",e)}},X=class extends ui{static EXTENSION_NAME;_validateParent(t){if(!this.parentTypes.includes(t.propertyType))throw new Error(`Parent "${t.propertyType}" invalid for child "${this.propertyType}".`)}},oe=class li extends Ne{static WrapMode={CLAMP_TO_EDGE:33071,MIRRORED_REPEAT:33648,REPEAT:10497};static MagFilter={NEAREST:9728,LINEAR:9729};static MinFilter={NEAREST:9728,LINEAR:9729,NEAREST_MIPMAP_NEAREST:9984,LINEAR_MIPMAP_NEAREST:9985,NEAREST_MIPMAP_LINEAR:9986,LINEAR_MIPMAP_LINEAR:9987};init(){this.propertyType="TextureInfo"}getDefaults(){return Object.assign(super.getDefaults(),{texCoord:0,magFilter:null,minFilter:null,wrapS:li.WrapMode.REPEAT,wrapT:li.WrapMode.REPEAT})}getTexCoord(){return this.get("texCoord")}setTexCoord(e){return this.set("texCoord",e)}getMagFilter(){return this.get("magFilter")}setMagFilter(e){return this.set("magFilter",e)}getMinFilter(){return this.get("minFilter")}setMinFilter(e){return this.set("minFilter",e)}getWrapS(){return this.get("wrapS")}setWrapS(e){return this.set("wrapS",e)}getWrapT(){return this.get("wrapT")}setWrapT(e){return this.set("wrapT",e)}},{R:rs,G:as,B:ss,A:Yp}=rt,cs=class ul extends Ne{static AlphaMode={OPAQUE:"OPAQUE",MASK:"MASK",BLEND:"BLEND"};init(){this.propertyType="Material"}getDefaults(){return Object.assign(super.getDefaults(),{alphaMode:ul.AlphaMode.OPAQUE,alphaCutoff:.5,doubleSided:!1,baseColorFactor:[1,1,1,1],baseColorTexture:null,baseColorTextureInfo:new oe(this.graph,"baseColorTextureInfo"),emissiveFactor:[0,0,0],emissiveTexture:null,emissiveTextureInfo:new oe(this.graph,"emissiveTextureInfo"),normalScale:1,normalTexture:null,normalTextureInfo:new oe(this.graph,"normalTextureInfo"),occlusionStrength:1,occlusionTexture:null,occlusionTextureInfo:new oe(this.graph,"occlusionTextureInfo"),roughnessFactor:1,metallicFactor:1,metallicRoughnessTexture:null,metallicRoughnessTextureInfo:new oe(this.graph,"metallicRoughnessTextureInfo")})}getDoubleSided(){return this.get("doubleSided")}setDoubleSided(e){return this.set("doubleSided",e)}getAlpha(){return this.get("baseColorFactor")[3]}setAlpha(e){let r=this.get("baseColorFactor").slice();return r[3]=e,this.set("baseColorFactor",r)}getAlphaMode(){return this.get("alphaMode")}setAlphaMode(e){return this.set("alphaMode",e)}getAlphaCutoff(){return this.get("alphaCutoff")}setAlphaCutoff(e){return this.set("alphaCutoff",e)}getBaseColorFactor(){return this.get("baseColorFactor")}setBaseColorFactor(e){return this.set("baseColorFactor",e)}getBaseColorTexture(){return this.getRef("baseColorTexture")}getBaseColorTextureInfo(){return this.getRef("baseColorTexture")?this.getRef("baseColorTextureInfo"):null}setBaseColorTexture(e){return this.setRef("baseColorTexture",e,{channels:rs|as|ss|Yp,isColor:!0})}getEmissiveFactor(){return this.get("emissiveFactor")}setEmissiveFactor(e){return this.set("emissiveFactor",e)}getEmissiveTexture(){return this.getRef("emissiveTexture")}getEmissiveTextureInfo(){return this.getRef("emissiveTexture")?this.getRef("emissiveTextureInfo"):null}setEmissiveTexture(e){return this.setRef("emissiveTexture",e,{channels:rs|as|ss,isColor:!0})}getNormalScale(){return this.get("normalScale")}setNormalScale(e){return this.set("normalScale",e)}getNormalTexture(){return this.getRef("normalTexture")}getNormalTextureInfo(){return this.getRef("normalTexture")?this.getRef("normalTextureInfo"):null}setNormalTexture(e){return this.setRef("normalTexture",e,{channels:rs|as|ss})}getOcclusionStrength(){return this.get("occlusionStrength")}setOcclusionStrength(e){return this.set("occlusionStrength",e)}getOcclusionTexture(){return this.getRef("occlusionTexture")}getOcclusionTextureInfo(){return this.getRef("occlusionTexture")?this.getRef("occlusionTextureInfo"):null}setOcclusionTexture(e){return this.setRef("occlusionTexture",e,{channels:rs})}getRoughnessFactor(){return this.get("roughnessFactor")}setRoughnessFactor(e){return this.set("roughnessFactor",e)}getMetallicFactor(){return this.get("metallicFactor")}setMetallicFactor(e){return this.set("metallicFactor",e)}getMetallicRoughnessTexture(){return this.getRef("metallicRoughnessTexture")}getMetallicRoughnessTextureInfo(){return this.getRef("metallicRoughnessTexture")?this.getRef("metallicRoughnessTextureInfo"):null}setMetallicRoughnessTexture(e){return this.setRef("metallicRoughnessTexture",e,{channels:as|ss})}},fl=class extends Ne{init(){this.propertyType="Mesh"}getDefaults(){return Object.assign(super.getDefaults(),{weights:[],primitives:new ne})}addPrimitive(t){return this.addRef("primitives",t)}removePrimitive(t){return this.removeRef("primitives",t)}listPrimitives(){return this.listRefs("primitives")}getWeights(){return this.get("weights")}setWeights(t){return this.set("weights",t)}},hl=class extends Ne{init(){this.propertyType="Node"}getDefaults(){return Object.assign(super.getDefaults(),{translation:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1],weights:[],camera:null,mesh:null,skin:null,children:new ne})}copy(t,e=Ft){if(e===Ft)throw new Error("Node cannot be copied.");return super.copy(t,e)}getTranslation(){return this.get("translation")}getRotation(){return this.get("rotation")}getScale(){return this.get("scale")}setTranslation(t){return this.set("translation",t)}setRotation(t){return this.set("rotation",t)}setScale(t){return this.set("scale",t)}getMatrix(){return le.compose(this.get("translation"),this.get("rotation"),this.get("scale"),[])}setMatrix(t){let e=this.get("translation").slice(),r=this.get("rotation").slice(),a=this.get("scale").slice();return le.decompose(t,e,r,a),this.set("translation",e).set("rotation",r).set("scale",a)}getWorldTranslation(){let t=[0,0,0];return le.decompose(this.getWorldMatrix(),t,[0,0,0,1],[1,1,1]),t}getWorldRotation(){let t=[0,0,0,1];return le.decompose(this.getWorldMatrix(),[0,0,0],t,[1,1,1]),t}getWorldScale(){let t=[1,1,1];return le.decompose(this.getWorldMatrix(),[0,0,0],[0,0,0,1],t),t}getWorldMatrix(){let t=[];for(let a=this;a!=null;a=a.getParentNode())t.push(a);let e,r=t.pop().getMatrix();for(;e=t.pop();)jp(r,r,e.getMatrix());return r}addChild(t){let e=t.getParentNode();e&&e.removeChild(t);for(let r of t.listParents())r.propertyType==="Scene"&&r.removeChild(t);return this.addRef("children",t)}removeChild(t){return this.removeRef("children",t)}listChildren(){return this.listRefs("children")}getParentNode(){for(let t of this.listParents())if(t.propertyType==="Node")return t;return null}getMesh(){return this.getRef("mesh")}setMesh(t){return this.setRef("mesh",t)}getCamera(){return this.getRef("camera")}setCamera(t){return this.setRef("camera",t)}getSkin(){return this.getRef("skin")}setSkin(t){return this.setRef("skin",t)}getWeights(){return this.get("weights")}setWeights(t){return this.set("weights",t)}traverse(t){t(this);for(let e of this.listChildren())e.traverse(t);return this}},Qr=class bl extends Ne{static Mode={POINTS:0,LINES:1,LINE_LOOP:2,LINE_STRIP:3,TRIANGLES:4,TRIANGLE_STRIP:5,TRIANGLE_FAN:6};init(){this.propertyType="Primitive"}getDefaults(){return Object.assign(super.getDefaults(),{mode:bl.Mode.TRIANGLES,material:null,indices:null,attributes:new ge,targets:new ne})}getIndices(){return this.getRef("indices")}setIndices(e){return this.setRef("indices",e,{usage:"ELEMENT_ARRAY_BUFFER"})}getAttribute(e){return this.getRefMap("attributes",e)}setAttribute(e,r){return this.setRefMap("attributes",e,r,{usage:"ARRAY_BUFFER"})}listAttributes(){return this.listRefMapValues("attributes")}listSemantics(){return this.listRefMapKeys("attributes")}getMaterial(){return this.getRef("material")}setMaterial(e){return this.setRef("material",e)}getMode(){return this.get("mode")}setMode(e){return this.set("mode",e)}listTargets(){return this.listRefs("targets")}addTarget(e){return this.addRef("targets",e)}removeTarget(e){return this.removeRef("targets",e)}},Jp=class extends ui{init(){this.propertyType="PrimitiveTarget"}getDefaults(){return Object.assign(super.getDefaults(),{attributes:new ge})}getAttribute(t){return this.getRefMap("attributes",t)}setAttribute(t,e){return this.setRefMap("attributes",t,e,{usage:"ARRAY_BUFFER"})}listAttributes(){return this.listRefMapValues("attributes")}listSemantics(){return this.listRefMapKeys("attributes")}},pl=class extends Ne{init(){this.propertyType="Scene"}getDefaults(){return Object.assign(super.getDefaults(),{children:new ne})}copy(t,e=Ft){if(e===Ft)throw new Error("Scene cannot be copied.");return super.copy(t,e)}addChild(t){let e=t.getParentNode();return e&&e.removeChild(t),this.addRef("children",t)}removeChild(t){return this.removeRef("children",t)}listChildren(){return this.listRefs("children")}traverse(t){for(let e of this.listChildren())e.traverse(t);return this}},gl=class extends Ne{init(){this.propertyType="Skin"}getDefaults(){return Object.assign(super.getDefaults(),{skeleton:null,inverseBindMatrices:null,joints:new ne})}getSkeleton(){return this.getRef("skeleton")}setSkeleton(t){return this.setRef("skeleton",t)}getInverseBindMatrices(){return this.getRef("inverseBindMatrices")}setInverseBindMatrices(t){return this.setRef("inverseBindMatrices",t,{usage:"INVERSE_BIND_MATRICES"})}addJoint(t){return this.addRef("joints",t)}removeJoint(t){return this.removeRef("joints",t)}listJoints(){return this.listRefs("joints")}},ml=class extends Ne{init(){this.propertyType="Texture"}getDefaults(){return Object.assign(super.getDefaults(),{image:null,mimeType:"",uri:""})}getMimeType(){return this.get("mimeType")||lt.extensionToMimeType(wr.extension(this.get("uri")))}setMimeType(t){return this.set("mimeType",t)}getURI(){return this.get("uri")}setURI(t){this.set("uri",t);let e=lt.extensionToMimeType(wr.extension(t));return e&&this.set("mimeType",e),this}getImage(){return this.get("image")}setImage(t){return this.set("image",q.assertView(t))}getSize(){let t=this.get("image");return t?lt.getSize(t,this.getMimeType()):null}},hi=class extends Ne{_extensions=new Set;init(){this.propertyType="Root"}getDefaults(){return Object.assign(super.getDefaults(),{asset:{generator:`glTF-Transform ${el}`,version:"2.0"},defaultScene:null,accessors:new ne,animations:new ne,buffers:new ne,cameras:new ne,materials:new ne,meshes:new ne,nodes:new ne,scenes:new ne,skins:new ne,textures:new ne})}constructor(t){super(t),t.addEventListener("node:create",e=>{this._addChildOfRoot(e.target)})}clone(){throw new Error("Root cannot be cloned.")}copy(t,e=Ft){if(e===Ft)throw new Error("Root cannot be copied.");this.set("asset",{...t.get("asset")}),this.setName(t.getName()),this.setExtras({...t.getExtras()}),this.setDefaultScene(t.getDefaultScene()?e(t.getDefaultScene()):null);for(let r of t.listRefMapKeys("extensions")){let a=t.getExtension(r);this.setExtension(r,e(a))}return this}_addChildOfRoot(t){return t instanceof pl?this.addRef("scenes",t):t instanceof hl?this.addRef("nodes",t):t instanceof fs?this.addRef("cameras",t):t instanceof gl?this.addRef("skins",t):t instanceof fl?this.addRef("meshes",t):t instanceof cs?this.addRef("materials",t):t instanceof ml?this.addRef("textures",t):t instanceof ol?this.addRef("animations",t):t instanceof G?this.addRef("accessors",t):t instanceof ll&&this.addRef("buffers",t),this}getAsset(){return this.get("asset")}listExtensionsUsed(){return Array.from(this._extensions)}listExtensionsRequired(){return this.listExtensionsUsed().filter(t=>t.isRequired())}_enableExtension(t){return this._extensions.add(t),this}_disableExtension(t){return this._extensions.delete(t),this}listScenes(){return this.listRefs("scenes")}setDefaultScene(t){return this.setRef("defaultScene",t)}getDefaultScene(){return this.getRef("defaultScene")}listNodes(){return this.listRefs("nodes")}listCameras(){return this.listRefs("cameras")}listSkins(){return this.listRefs("skins")}listMeshes(){return this.listRefs("meshes")}listMaterials(){return this.listRefs("materials")}listTextures(){return this.listRefs("textures")}listAnimations(){return this.listRefs("animations")}listAccessors(){return this.listRefs("accessors")}listBuffers(){return this.listRefs("buffers")}},Qp=class di{_graph=new si;_root=new hi(this._graph);_logger=ds.DEFAULT_INSTANCE;static _GRAPH_DOCUMENTS=new WeakMap;static fromGraph(e){return di._GRAPH_DOCUMENTS.get(e)||null}constructor(){di._GRAPH_DOCUMENTS.set(this._graph,this)}getRoot(){return this._root}getGraph(){return this._graph}getLogger(){return this._logger}setLogger(e){return this._logger=e,this}clone(){throw new Error("Use 'cloneDocument(source)' from '@gltf-transform/functions'.")}merge(e){throw new Error("Use 'mergeDocuments(target, source)' from '@gltf-transform/functions'.")}async transform(...e){let r=e.map(a=>a.name);for(let a of e)await a(this,{stack:r});return this}hasExtension(e){return this.getRoot().listExtensionsUsed().some(r=>r.extensionName===e)}createExtension(e){let r=e.EXTENSION_NAME;return this.getRoot().listExtensionsUsed().find(a=>a.extensionName===r)||new e(this)}disposeExtension(e){let r=this.getRoot().listExtensionsUsed().find(a=>a.extensionName===e);r&&r.dispose()}createScene(e=""){return new pl(this._graph,e)}createNode(e=""){return new hl(this._graph,e)}createCamera(e=""){return new fs(this._graph,e)}createSkin(e=""){return new gl(this._graph,e)}createMesh(e=""){return new fl(this._graph,e)}createPrimitive(){return new Qr(this._graph)}createPrimitiveTarget(e=""){return new Jp(this._graph,e)}createMaterial(e=""){return new cs(this._graph,e)}createTexture(e=""){return new ml(this._graph,e)}createAnimation(e=""){return new ol(this._graph,e)}createAnimationChannel(e=""){return new fi(this._graph,e)}createAnimationSampler(e=""){return new us(this._graph,e)}createAccessor(e="",r=null){return r||(r=this.getRoot().listBuffers()[0]),new G(this._graph,e).setBuffer(r)}createBuffer(e=""){return new ll(this._graph,e)}},re=class{static EXTENSION_NAME;extensionName="";prereadTypes=[];prewriteTypes=[];readDependencies=[];writeDependencies=[];document;required=!1;properties=new Set;_listener;constructor(t){this.document=t,t.getRoot()._enableExtension(this),this._listener=r=>{let a=r,s=a.target;s instanceof X&&s.extensionName===this.extensionName&&(a.type==="node:create"&&this._addExtensionProperty(s),a.type==="node:dispose"&&this._removeExtensionProperty(s))};let e=t.getGraph();e.addEventListener("node:create",this._listener),e.addEventListener("node:dispose",this._listener)}dispose(){this.document.getRoot()._disableExtension(this);let t=this.document.getGraph();t.removeEventListener("node:create",this._listener),t.removeEventListener("node:dispose",this._listener);for(let e of this.properties)e.dispose()}static register(){}isRequired(){return this.required}setRequired(t){return this.required=t,this}listProperties(){return Array.from(this.properties)}_addExtensionProperty(t){return this.properties.add(t),this}_removeExtensionProperty(t){return this.properties.delete(t),this}install(t,e){return this}preread(t,e){return this}prewrite(t,e){return this}},Zp=class{jsonDoc;buffers=[];bufferViews=[];bufferViewBuffers=[];accessors=[];textures=[];textureInfos=new Map;materials=[];meshes=[];cameras=[];nodes=[];skins=[];animations=[];scenes=[];constructor(t){this.jsonDoc=t}setTextureInfo(t,e){this.textureInfos.set(t,e),e.texCoord!==void 0&&t.setTexCoord(e.texCoord),e.extras!==void 0&&t.setExtras(e.extras);let r=this.jsonDoc.json.textures[e.index];if(r.sampler===void 0)return;let a=this.jsonDoc.json.samplers[r.sampler];a.magFilter!==void 0&&t.setMagFilter(a.magFilter),a.minFilter!==void 0&&t.setMinFilter(a.minFilter),a.wrapS!==void 0&&t.setWrapS(a.wrapS),a.wrapT!==void 0&&t.setWrapT(a.wrapT)}},Jc={logger:ds.DEFAULT_INSTANCE,extensions:[],dependencies:{}},eg=new Set(["Buffer","Texture","Material","Mesh","Primitive","Node","Scene"]),tg=class{static read(t,e=Jc){let r={...Jc,...e},{json:a}=t,s=new Qp().setLogger(r.logger);this.validate(t,r);let n=new Zp(t),i=a.asset,o=s.getRoot().getAsset();i.copyright&&(o.copyright=i.copyright),i.extras&&(o.extras=i.extras),a.extras!==void 0&&s.getRoot().setExtras({...a.extras});let c=a.extensionsUsed||[],l=a.extensionsRequired||[];r.extensions.sort((g,y)=>g.EXTENSION_NAME>y.EXTENSION_NAME?1:-1);for(let g of r.extensions)if(c.includes(g.EXTENSION_NAME)){let y=s.createExtension(g).setRequired(l.includes(g.EXTENSION_NAME)),m=y.prereadTypes.filter(w=>!eg.has(w));m.length&&r.logger.warn(`Preread hooks for some types (${m.join()}), requested by extension ${y.extensionName}, are unsupported. Please file an issue or a PR.`);for(let w of y.readDependencies)y.install(w,r.dependencies[w])}let f=a.buffers||[];s.getRoot().listExtensionsUsed().filter(g=>g.prereadTypes.includes("Buffer")).forEach(g=>g.preread(n,"Buffer")),n.buffers=f.map(g=>{let y=s.createBuffer(g.name);return g.extras&&y.setExtras(g.extras),g.uri&&g.uri.indexOf("__")!==0&&y.setURI(g.uri),y}),n.bufferViewBuffers=(a.bufferViews||[]).map((g,y)=>{if(!n.bufferViews[y]){let m=t.json.buffers[g.buffer],w=m.uri?t.resources[m.uri]:t.resources[Bt],E=g.byteOffset||0;n.bufferViews[y]=q.toView(w,E,g.byteLength)}return n.buffers[g.buffer]});let u=a.accessors||[];n.accessors=u.map(g=>{let y=n.bufferViewBuffers[g.bufferView],m=s.createAccessor(g.name,y).setType(g.type);return g.extras&&m.setExtras(g.extras),g.normalized!==void 0&&m.setNormalized(g.normalized),g.bufferView===void 0||m.setArray(is(g,n)),m});let p=a.images||[],b=a.textures||[];s.getRoot().listExtensionsUsed().filter(g=>g.prereadTypes.includes("Texture")).forEach(g=>g.preread(n,"Texture")),n.textures=p.map(g=>{let y=s.createTexture(g.name);if(g.extras&&y.setExtras(g.extras),g.bufferView!==void 0){let m=a.bufferViews[g.bufferView],w=t.json.buffers[m.buffer],E=w.uri?t.resources[w.uri]:t.resources[Bt],S=m.byteOffset||0,A=m.byteLength,T=E.slice(S,S+A);y.setImage(T)}else g.uri!==void 0&&(y.setImage(t.resources[g.uri]),g.uri.indexOf("__")!==0&&y.setURI(g.uri));if(g.mimeType!==void 0)y.setMimeType(g.mimeType);else if(g.uri){let m=wr.extension(g.uri);y.setMimeType(lt.extensionToMimeType(m))}return y}),s.getRoot().listExtensionsUsed().filter(g=>g.prereadTypes.includes("Material")).forEach(g=>g.preread(n,"Material")),n.materials=(a.materials||[]).map(g=>{let y=s.createMaterial(g.name);g.extras&&y.setExtras(g.extras),g.alphaMode!==void 0&&y.setAlphaMode(g.alphaMode),g.alphaCutoff!==void 0&&y.setAlphaCutoff(g.alphaCutoff),g.doubleSided!==void 0&&y.setDoubleSided(g.doubleSided);let m=g.pbrMetallicRoughness||{};if(m.baseColorFactor!==void 0&&y.setBaseColorFactor(m.baseColorFactor),g.emissiveFactor!==void 0&&y.setEmissiveFactor(g.emissiveFactor),m.metallicFactor!==void 0&&y.setMetallicFactor(m.metallicFactor),m.roughnessFactor!==void 0&&y.setRoughnessFactor(m.roughnessFactor),m.baseColorTexture!==void 0){let w=m.baseColorTexture,E=n.textures[b[w.index].source];y.setBaseColorTexture(E),n.setTextureInfo(y.getBaseColorTextureInfo(),w)}if(g.emissiveTexture!==void 0){let w=g.emissiveTexture,E=n.textures[b[w.index].source];y.setEmissiveTexture(E),n.setTextureInfo(y.getEmissiveTextureInfo(),w)}if(g.normalTexture!==void 0){let w=g.normalTexture,E=n.textures[b[w.index].source];y.setNormalTexture(E),n.setTextureInfo(y.getNormalTextureInfo(),w),g.normalTexture.scale!==void 0&&y.setNormalScale(g.normalTexture.scale)}if(g.occlusionTexture!==void 0){let w=g.occlusionTexture,E=n.textures[b[w.index].source];y.setOcclusionTexture(E),n.setTextureInfo(y.getOcclusionTextureInfo(),w),g.occlusionTexture.strength!==void 0&&y.setOcclusionStrength(g.occlusionTexture.strength)}if(m.metallicRoughnessTexture!==void 0){let w=m.metallicRoughnessTexture,E=n.textures[b[w.index].source];y.setMetallicRoughnessTexture(E),n.setTextureInfo(y.getMetallicRoughnessTextureInfo(),w)}return y}),s.getRoot().listExtensionsUsed().filter(g=>g.prereadTypes.includes("Mesh")).forEach(g=>g.preread(n,"Mesh"));let h=a.meshes||[];s.getRoot().listExtensionsUsed().filter(g=>g.prereadTypes.includes("Primitive")).forEach(g=>g.preread(n,"Primitive")),n.meshes=h.map(g=>{let y=s.createMesh(g.name);return g.extras&&y.setExtras(g.extras),g.weights!==void 0&&y.setWeights(g.weights),(g.primitives||[]).forEach(m=>{let w=s.createPrimitive();m.extras&&w.setExtras(m.extras),m.material!==void 0&&w.setMaterial(n.materials[m.material]),m.mode!==void 0&&w.setMode(m.mode);for(let[S,A]of Object.entries(m.attributes||{}))w.setAttribute(S,n.accessors[A]);m.indices!==void 0&&w.setIndices(n.accessors[m.indices]);let E=g.extras&&g.extras.targetNames||[];(m.targets||[]).forEach((S,A)=>{let T=E[A]||A.toString(),_=s.createPrimitiveTarget(T);for(let[R,N]of Object.entries(S))_.setAttribute(R,n.accessors[N]);w.addTarget(_)}),y.addPrimitive(w)}),y}),n.cameras=(a.cameras||[]).map(g=>{let y=s.createCamera(g.name).setType(g.type);if(g.extras&&y.setExtras(g.extras),g.type===fs.Type.PERSPECTIVE){let m=g.perspective;y.setYFov(m.yfov),y.setZNear(m.znear),m.zfar!==void 0&&y.setZFar(m.zfar),m.aspectRatio!==void 0&&y.setAspectRatio(m.aspectRatio)}else{let m=g.orthographic;y.setZNear(m.znear).setZFar(m.zfar).setXMag(m.xmag).setYMag(m.ymag)}return y});let d=a.nodes||[];s.getRoot().listExtensionsUsed().filter(g=>g.prereadTypes.includes("Node")).forEach(g=>g.preread(n,"Node")),n.nodes=d.map(g=>{let y=s.createNode(g.name);if(g.extras&&y.setExtras(g.extras),g.translation!==void 0&&y.setTranslation(g.translation),g.rotation!==void 0&&y.setRotation(g.rotation),g.scale!==void 0&&y.setScale(g.scale),g.matrix!==void 0){let m=[0,0,0],w=[0,0,0,1],E=[1,1,1];le.decompose(g.matrix,m,w,E),y.setTranslation(m),y.setRotation(w),y.setScale(E)}return g.weights!==void 0&&y.setWeights(g.weights),y}),n.skins=(a.skins||[]).map(g=>{let y=s.createSkin(g.name);g.extras&&y.setExtras(g.extras),g.inverseBindMatrices!==void 0&&y.setInverseBindMatrices(n.accessors[g.inverseBindMatrices]),g.skeleton!==void 0&&y.setSkeleton(n.nodes[g.skeleton]);for(let m of g.joints)y.addJoint(n.nodes[m]);return y}),d.map((g,y)=>{let m=n.nodes[y];(g.children||[]).forEach(w=>m.addChild(n.nodes[w])),g.mesh!==void 0&&m.setMesh(n.meshes[g.mesh]),g.camera!==void 0&&m.setCamera(n.cameras[g.camera]),g.skin!==void 0&&m.setSkin(n.skins[g.skin])}),n.animations=(a.animations||[]).map(g=>{let y=s.createAnimation(g.name);g.extras&&y.setExtras(g.extras);let m=(g.samplers||[]).map(w=>{let E=s.createAnimationSampler().setInput(n.accessors[w.input]).setOutput(n.accessors[w.output]).setInterpolation(w.interpolation||us.Interpolation.LINEAR);return w.extras&&E.setExtras(w.extras),y.addSampler(E),E});return(g.channels||[]).forEach(w=>{let E=s.createAnimationChannel().setSampler(m[w.sampler]).setTargetPath(w.target.path);w.target.node!==void 0&&E.setTargetNode(n.nodes[w.target.node]),w.extras&&E.setExtras(w.extras),y.addChannel(E)}),y});let x=a.scenes||[];return s.getRoot().listExtensionsUsed().filter(g=>g.prereadTypes.includes("Scene")).forEach(g=>g.preread(n,"Scene")),n.scenes=x.map(g=>{let y=s.createScene(g.name);return g.extras&&y.setExtras(g.extras),(g.nodes||[]).map(m=>n.nodes[m]).forEach(m=>y.addChild(m)),y}),a.scene!==void 0&&s.getRoot().setDefaultScene(n.scenes[a.scene]),s.getRoot().listExtensionsUsed().forEach(g=>g.read(n)),u.forEach((g,y)=>{let m=n.accessors[y],w=!!g.sparse,E=!g.bufferView&&!m.getArray();(w||E)&&m.setSparse(!0).setArray(ag(g,n))}),s}static validate(t,e){let r=t.json;if(r.asset.version!=="2.0")throw new Error(`Unsupported glTF version, "${r.asset.version}".`);if(r.extensionsRequired){for(let a of r.extensionsRequired)if(!e.extensions.find(s=>s.EXTENSION_NAME===a))throw new Error(`Missing required extension, "${a}".`)}if(r.extensionsUsed)for(let a of r.extensionsUsed)e.extensions.find(s=>s.EXTENSION_NAME===a)||e.logger.warn(`Missing optional extension, "${a}".`)}};function rg(t,e){let r=e.jsonDoc,a=e.bufferViews[t.bufferView],s=r.json.bufferViews[t.bufferView],n=ls[t.componentType],i=G.getElementSize(t.type),o=n.BYTES_PER_ELEMENT,c=t.byteOffset||0,l=new n(t.count*i),f=new DataView(a.buffer,a.byteOffset,a.byteLength),u=s.byteStride;for(let p=0;p<t.count;p++)for(let b=0;b<i;b++){let h=c+p*u+b*o,d;switch(t.componentType){case G.ComponentType.FLOAT:d=f.getFloat32(h,!0);break;case G.ComponentType.UNSIGNED_INT:d=f.getUint32(h,!0);break;case G.ComponentType.UNSIGNED_SHORT:d=f.getUint16(h,!0);break;case G.ComponentType.UNSIGNED_BYTE:d=f.getUint8(h);break;case G.ComponentType.SHORT:d=f.getInt16(h,!0);break;case G.ComponentType.BYTE:d=f.getInt8(h);break;case G.ComponentType.FLOAT16:d=f.getFloat16(h,!0);break;case G.ComponentType.FLOAT64:d=f.getFloat64(h,!0);break;default:throw new Error(`Unexpected componentType "${t.componentType}".`)}l[p*i+b]=d}return l}function is(t,e){let r=e.jsonDoc,a=e.bufferViews[t.bufferView],s=r.json.bufferViews[t.bufferView],n=ls[t.componentType],i=G.getElementSize(t.type),o=n.BYTES_PER_ELEMENT,c=i*o;if(s.byteStride!==void 0&&s.byteStride!==c)return rg(t,e);let l=a.byteOffset+(t.byteOffset||0),f=t.count*i*o;return new n(a.buffer.slice(l,l+f))}function ag(t,e){let r=ls[t.componentType],a=G.getElementSize(t.type),s;t.bufferView!==void 0?s=is(t,e):s=new r(t.count*a);let n=t.sparse;if(!n)return s;let i=n.count,o={...t,...n.indices,count:i,type:"SCALAR"},c={...t,...n.values,count:i},l=is(o,e),f=is(c,e);for(let u=0;u<o.count;u++)for(let p=0;p<a;p++)s[l[u]*a+p]=f[u*a+p];return s}var yl=(function(t){return t[t.ARRAY_BUFFER=34962]="ARRAY_BUFFER",t[t.ELEMENT_ARRAY_BUFFER=34963]="ELEMENT_ARRAY_BUFFER",t})(yl||{}),Ct=class{_doc;jsonDoc;options;static BufferViewTarget=yl;static BufferViewUsage=Ap;static USAGE_TO_TARGET={ARRAY_BUFFER:34962,ELEMENT_ARRAY_BUFFER:34963};accessorIndexMap=new Map;animationIndexMap=new Map;bufferIndexMap=new Map;cameraIndexMap=new Map;skinIndexMap=new Map;materialIndexMap=new Map;meshIndexMap=new Map;nodeIndexMap=new Map;imageIndexMap=new Map;textureDefIndexMap=new Map;textureInfoDefMap=new Map;samplerDefIndexMap=new Map;sceneIndexMap=new Map;imageBufferViews=[];otherBufferViews=new Map;otherBufferViewsIndexMap=new Map;extensionData={};bufferURIGenerator;imageURIGenerator;logger;_accessorUsageMap=new Map;accessorUsageGroupedByParent=new Set(["ARRAY_BUFFER"]);accessorParents=new Map;constructor(t,e,r){this._doc=t,this.jsonDoc=e,this.options=r;let a=t.getRoot(),s=a.listBuffers().length,n=a.listTextures().length;this.bufferURIGenerator=new Qc(s>1,()=>r.basename||"buffer"),this.imageURIGenerator=new Qc(n>1,i=>sg(t,i)||r.basename||"texture"),this.logger=t.getLogger()}createTextureInfoDef(t,e){let r={magFilter:e.getMagFilter()||void 0,minFilter:e.getMinFilter()||void 0,wrapS:e.getWrapS(),wrapT:e.getWrapT()},a=JSON.stringify(r);this.samplerDefIndexMap.has(a)||(this.samplerDefIndexMap.set(a,this.jsonDoc.json.samplers.length),this.jsonDoc.json.samplers.push(r));let s={source:this.imageIndexMap.get(t),sampler:this.samplerDefIndexMap.get(a)},n=JSON.stringify(s);this.textureDefIndexMap.has(n)||(this.textureDefIndexMap.set(n,this.jsonDoc.json.textures.length),this.jsonDoc.json.textures.push(s));let i={index:this.textureDefIndexMap.get(n)};return e.getTexCoord()!==0&&(i.texCoord=e.getTexCoord()),Object.keys(e.getExtras()).length>0&&(i.extras=e.getExtras()),this.textureInfoDefMap.set(e,i),i}createPropertyDef(t){let e={};return t.getName()&&(e.name=t.getName()),Object.keys(t.getExtras()).length>0&&(e.extras=t.getExtras()),e}createAccessorDef(t){let e=this.createPropertyDef(t);return e.type=t.getType(),e.componentType=t.getComponentType(),e.count=t.getCount(),this._doc.getGraph().listParentEdges(t).some(r=>r.getName()==="attributes"&&r.getAttributes().key==="POSITION"||r.getName()==="input")&&(e.max=t.getMax([]).map(Math.fround),e.min=t.getMin([]).map(Math.fround)),t.getNormalized()&&(e.normalized=t.getNormalized()),e}createImageData(t,e,r){if(this.options.format==="GLB")this.imageBufferViews.push(e),t.bufferView=this.jsonDoc.json.bufferViews.length,this.jsonDoc.json.bufferViews.push({buffer:0,byteOffset:-1,byteLength:e.byteLength});else{let a=lt.mimeTypeToExtension(r.getMimeType());t.uri=this.imageURIGenerator.createURI(r,a),this.assignResourceURI(t.uri,e,!1)}}assignResourceURI(t,e,r){let a=this.jsonDoc.resources;if(!(t in a)){a[t]=e;return}if(e===a[t]){this.logger.warn(`Duplicate resource URI, "${t}".`);return}let s=`Resource URI "${t}" already assigned to different data.`;if(!r){this.logger.warn(s);return}throw new Error(s)}getAccessorUsage(t){let e=this._accessorUsageMap.get(t);if(e)return e;if(t.getSparse())return"SPARSE";for(let r of this._doc.getGraph().listParentEdges(t)){let{usage:a}=r.getAttributes();if(a)return a;r.getParent().propertyType!=="Root"&&this.logger.warn(`Missing attribute ".usage" on edge, "${r.getName()}".`)}return"OTHER"}addAccessorToUsageGroup(t,e){let r=this._accessorUsageMap.get(t);if(r&&r!==e)throw new Error(`Accessor with usage "${r}" cannot be reused as "${e}".`);return this._accessorUsageMap.set(t,e),this}},Qc=class{multiple;basename;counter={};constructor(t,e){this.multiple=t,this.basename=e}createURI(t,e){if(t.getURI())return t.getURI();if(this.multiple){let r=this.basename(t);return this.counter[r]=this.counter[r]||1,`${r}_${this.counter[r]++}.${e}`}else return`${this.basename(t)}.${e}`}};function sg(t,e){let r=t.getGraph().listParentEdges(e).find(a=>a.getParent()!==t.getRoot());return r?r.getName().replace(/texture$/i,""):""}var{BufferViewUsage:ns}=Ct,{UNSIGNED_INT:ng,UNSIGNED_SHORT:ig,UNSIGNED_BYTE:og}=G.ComponentType,cg=new Set(["Accessor","Buffer","Material","Mesh"]),lg=class{static write(t,e){let r=t.getGraph(),a=t.getRoot(),s={asset:{generator:`glTF-Transform ${el}`,...a.getAsset()},extras:{...a.getExtras()}},n={json:s,resources:{}},i=new Ct(t,n,e),o=e.logger||ds.DEFAULT_INSTANCE,c=new Set(e.extensions.map(d=>d.EXTENSION_NAME)),l=t.getRoot().listExtensionsUsed().filter(d=>c.has(d.extensionName)).sort((d,x)=>d.extensionName>x.extensionName?1:-1),f=t.getRoot().listExtensionsRequired().filter(d=>c.has(d.extensionName)).sort((d,x)=>d.extensionName>x.extensionName?1:-1);l.length<t.getRoot().listExtensionsUsed().length&&o.warn("Some extensions were not registered for I/O, and will not be written.");for(let d of l){let x=d.prewriteTypes.filter(g=>!cg.has(g));x.length&&o.warn(`Prewrite hooks for some types (${x.join()}), requested by extension ${d.extensionName}, are unsupported. Please file an issue or a PR.`);for(let g of d.writeDependencies)d.install(g,e.dependencies[g])}function u(d,x,g,y){let m=[],w=0;for(let S of d){let A=i.createAccessorDef(S);A.bufferView=s.bufferViews.length;let T=S.getArray(),_=q.pad(q.toView(T));A.byteOffset=w,w+=_.byteLength,m.push(_),i.accessorIndexMap.set(S,s.accessors.length),s.accessors.push(A)}let E={buffer:x,byteOffset:g,byteLength:q.concat(m).byteLength};return y&&(E.target=y),s.bufferViews.push(E),{buffers:m,byteLength:w}}function p(d,x,g){let y=d[0].getCount(),m=0;for(let T of d){let _=i.createAccessorDef(T);_.bufferView=s.bufferViews.length,_.byteOffset=m;let R=T.getElementSize(),N=T.getComponentSize();m+=q.padNumber(R*N),i.accessorIndexMap.set(T,s.accessors.length),s.accessors.push(_)}let w=y*m,E=new ArrayBuffer(w),S=new DataView(E);for(let T=0;T<y;T++){let _=0;for(let R of d){let N=R.getElementSize(),B=R.getComponentSize(),F=R.getComponentType(),K=R.getArray();for(let $=0;$<N;$++){let se=T*m+_+$*B,de=K[T*N+$];switch(F){case G.ComponentType.FLOAT:S.setFloat32(se,de,!0);break;case G.ComponentType.BYTE:S.setInt8(se,de);break;case G.ComponentType.SHORT:S.setInt16(se,de,!0);break;case G.ComponentType.UNSIGNED_BYTE:S.setUint8(se,de);break;case G.ComponentType.UNSIGNED_SHORT:S.setUint16(se,de,!0);break;case G.ComponentType.UNSIGNED_INT:S.setUint32(se,de,!0);break;case G.ComponentType.FLOAT16:S.setFloat16(se,de,!0);break;case G.ComponentType.FLOAT64:S.setFloat64(se,de,!0);break;default:throw new Error("Unexpected component type: "+F)}}_+=q.padNumber(N*B)}}let A={buffer:x,byteOffset:g,byteLength:w,byteStride:m,target:Ct.BufferViewTarget.ARRAY_BUFFER};return s.bufferViews.push(A),{byteLength:w,buffers:[new Uint8Array(E)]}}function b(d,x,g){let y=[],m=0,w=new Map,E=-1/0,S=!1;for(let F of d){let K=i.createAccessorDef(F);s.accessors.push(K),i.accessorIndexMap.set(F,s.accessors.length-1);let $=[],se=[],de=[],Ke=new Array(F.getElementSize()).fill(0);for(let _e=0,ot=F.getCount();_e<ot;_e++)if(F.getElement(_e,de),!le.eq(de,Ke,0)){E=Math.max(_e,E),$.push(_e);for(let et=0;et<de.length;et++)se.push(de[et])}let be=$.length,Ve={accessorDef:K,count:be};if(w.set(F,Ve),be===0)continue;be>F.getCount()/2&&(S=!0);let Ze=ls[F.getComponentType()];Ve.indices=$,Ve.values=new Ze(se)}if(!Number.isFinite(E))return{buffers:y,byteLength:m};S&&o.warn("Some sparse accessors have >50% non-zero elements, which may increase file size.");let A=E<255?Uint8Array:E<65535?Uint16Array:Uint32Array,T=E<255?og:E<65535?ig:ng,_={buffer:x,byteOffset:g+m,byteLength:0};for(let F of d){let K=w.get(F);if(K.count===0)continue;K.indicesByteOffset=_.byteLength;let $=q.pad(q.toView(new A(K.indices)));y.push($),m+=$.byteLength,_.byteLength+=$.byteLength}s.bufferViews.push(_);let R=s.bufferViews.length-1,N={buffer:x,byteOffset:g+m,byteLength:0};for(let F of d){let K=w.get(F);if(K.count===0)continue;K.valuesByteOffset=N.byteLength;let $=q.pad(q.toView(K.values));y.push($),m+=$.byteLength,N.byteLength+=$.byteLength}s.bufferViews.push(N);let B=s.bufferViews.length-1;for(let F of d){let K=w.get(F);K.count!==0&&(K.accessorDef.sparse={count:K.count,indices:{bufferView:R,byteOffset:K.indicesByteOffset,componentType:T},values:{bufferView:B,byteOffset:K.valuesByteOffset}})}return{buffers:y,byteLength:m}}if(s.accessors=[],s.bufferViews=[],s.samplers=[],s.textures=[],s.images=a.listTextures().map((d,x)=>{let g=i.createPropertyDef(d);d.getMimeType()&&(g.mimeType=d.getMimeType());let y=d.getImage();return y&&i.createImageData(g,y,d),i.imageIndexMap.set(d,x),g}),l.filter(d=>d.prewriteTypes.includes("Accessor")).forEach(d=>d.prewrite(i,"Accessor")),a.listAccessors().forEach(d=>{let x=i.accessorUsageGroupedByParent,g=i.accessorParents;if(i.accessorIndexMap.has(d))return;let y=i.getAccessorUsage(d);if(i.addAccessorToUsageGroup(d,y),x.has(y)){let m=r.listParents(d).find(w=>w.propertyType!=="Root");g.set(d,m)}}),l.filter(d=>d.prewriteTypes.includes("Buffer")).forEach(d=>d.prewrite(i,"Buffer")),(a.listAccessors().length>0||i.otherBufferViews.size>0||a.listTextures().length>0&&e.format==="GLB")&&a.listBuffers().length===0)throw new Error("Buffer required for Document resources, but none was found.");s.buffers=[],a.listBuffers().forEach((d,x)=>{let g=i.createPropertyDef(d),y=i.accessorUsageGroupedByParent,m=d.listParents().filter(R=>R instanceof G),w=new Set(m.map(R=>i.accessorParents.get(R))),E=new Map(Array.from(w).map((R,N)=>[R,N])),S={};for(let R of m){if(i.accessorIndexMap.has(R))continue;let N=i.getAccessorUsage(R),B=N;if(y.has(N)){let F=i.accessorParents.get(R);B+=`:${E.get(F)}`}S[B]||={usage:N,accessors:[]},S[B].accessors.push(R)}let A=[],T=s.buffers.length,_=0;for(let{usage:R,accessors:N}of Object.values(S))if(R===ns.ARRAY_BUFFER&&e.vertexLayout==="interleaved"){let B=p(N,T,_);_+=B.byteLength;for(let F of B.buffers)A.push(F)}else if(R===ns.ARRAY_BUFFER)for(let B of N){let F=p([B],T,_);_+=F.byteLength;for(let K of F.buffers)A.push(K)}else if(R===ns.SPARSE){let B=b(N,T,_);_+=B.byteLength;for(let F of B.buffers)A.push(F)}else if(R===ns.ELEMENT_ARRAY_BUFFER){let B=Ct.BufferViewTarget.ELEMENT_ARRAY_BUFFER,F=u(N,T,_,B);_+=F.byteLength;for(let K of F.buffers)A.push(K)}else{let B=u(N,T,_);_+=B.byteLength;for(let F of B.buffers)A.push(F)}if(i.imageBufferViews.length&&x===0){for(let R=0;R<i.imageBufferViews.length;R++)if(s.bufferViews[s.images[R].bufferView].byteOffset=_,_+=i.imageBufferViews[R].byteLength,A.push(i.imageBufferViews[R]),_%8){let N=8-_%8;_+=N,A.push(new Uint8Array(N))}}if(i.otherBufferViews.has(d))for(let R of i.otherBufferViews.get(d))s.bufferViews.push({buffer:T,byteOffset:_,byteLength:R.byteLength}),i.otherBufferViewsIndexMap.set(R,s.bufferViews.length-1),_+=R.byteLength,A.push(R);if(_){let R;e.format==="GLB"?R=Bt:(R=i.bufferURIGenerator.createURI(d,"bin"),g.uri=R),g.byteLength=_,i.assignResourceURI(R,q.concat(A),!0)}s.buffers.push(g),i.bufferIndexMap.set(d,x)}),a.listAccessors().find(d=>!d.getBuffer())&&o.warn("Skipped writing one or more Accessors: no Buffer assigned."),l.filter(d=>d.prewriteTypes.includes("Material")).forEach(d=>d.prewrite(i,"Material")),s.materials=a.listMaterials().map((d,x)=>{let g=i.createPropertyDef(d);if(d.getAlphaMode()!==cs.AlphaMode.OPAQUE&&(g.alphaMode=d.getAlphaMode()),d.getAlphaMode()===cs.AlphaMode.MASK&&(g.alphaCutoff=d.getAlphaCutoff()),d.getDoubleSided()&&(g.doubleSided=!0),g.pbrMetallicRoughness={},le.eq(d.getBaseColorFactor(),[1,1,1,1])||(g.pbrMetallicRoughness.baseColorFactor=d.getBaseColorFactor()),le.eq(d.getEmissiveFactor(),[0,0,0])||(g.emissiveFactor=d.getEmissiveFactor()),d.getRoughnessFactor()!==1&&(g.pbrMetallicRoughness.roughnessFactor=d.getRoughnessFactor()),d.getMetallicFactor()!==1&&(g.pbrMetallicRoughness.metallicFactor=d.getMetallicFactor()),d.getBaseColorTexture()){let y=d.getBaseColorTexture(),m=d.getBaseColorTextureInfo();g.pbrMetallicRoughness.baseColorTexture=i.createTextureInfoDef(y,m)}if(d.getEmissiveTexture()){let y=d.getEmissiveTexture(),m=d.getEmissiveTextureInfo();g.emissiveTexture=i.createTextureInfoDef(y,m)}if(d.getNormalTexture()){let y=d.getNormalTexture(),m=d.getNormalTextureInfo(),w=i.createTextureInfoDef(y,m);d.getNormalScale()!==1&&(w.scale=d.getNormalScale()),g.normalTexture=w}if(d.getOcclusionTexture()){let y=d.getOcclusionTexture(),m=d.getOcclusionTextureInfo(),w=i.createTextureInfoDef(y,m);d.getOcclusionStrength()!==1&&(w.strength=d.getOcclusionStrength()),g.occlusionTexture=w}if(d.getMetallicRoughnessTexture()){let y=d.getMetallicRoughnessTexture(),m=d.getMetallicRoughnessTextureInfo();g.pbrMetallicRoughness.metallicRoughnessTexture=i.createTextureInfoDef(y,m)}return i.materialIndexMap.set(d,x),g}),l.filter(d=>d.prewriteTypes.includes("Mesh")).forEach(d=>d.prewrite(i,"Mesh")),s.meshes=a.listMeshes().map((d,x)=>{let g=i.createPropertyDef(d),y=null;return g.primitives=d.listPrimitives().map(m=>{let w={attributes:{}};w.mode=m.getMode();let E=m.getMaterial();E&&(w.material=i.materialIndexMap.get(E)),Object.keys(m.getExtras()).length&&(w.extras=m.getExtras());let S=m.getIndices();S&&(w.indices=i.accessorIndexMap.get(S));for(let A of m.listSemantics())w.attributes[A]=i.accessorIndexMap.get(m.getAttribute(A));for(let A of m.listTargets()){let T={};for(let _ of A.listSemantics())T[_]=i.accessorIndexMap.get(A.getAttribute(_));w.targets=w.targets||[],w.targets.push(T)}return m.listTargets().length&&!y&&(y=m.listTargets().map(A=>A.getName())),w}),d.getWeights().length&&(g.weights=d.getWeights()),y&&(g.extras=g.extras||{},g.extras.targetNames=y),i.meshIndexMap.set(d,x),g}),s.cameras=a.listCameras().map((d,x)=>{let g=i.createPropertyDef(d);if(g.type=d.getType(),g.type===fs.Type.PERSPECTIVE){g.perspective={znear:d.getZNear(),zfar:d.getZFar(),yfov:d.getYFov()};let y=d.getAspectRatio();y!==null&&(g.perspective.aspectRatio=y)}else g.orthographic={znear:d.getZNear(),zfar:d.getZFar(),xmag:d.getXMag(),ymag:d.getYMag()};return i.cameraIndexMap.set(d,x),g}),s.nodes=a.listNodes().map((d,x)=>{let g=i.createPropertyDef(d);return le.eq(d.getTranslation(),[0,0,0])||(g.translation=d.getTranslation()),le.eq(d.getRotation(),[0,0,0,1])||(g.rotation=d.getRotation()),le.eq(d.getScale(),[1,1,1])||(g.scale=d.getScale()),d.getWeights().length&&(g.weights=d.getWeights()),i.nodeIndexMap.set(d,x),g}),s.skins=a.listSkins().map((d,x)=>{let g=i.createPropertyDef(d),y=d.getInverseBindMatrices();y&&(g.inverseBindMatrices=i.accessorIndexMap.get(y));let m=d.getSkeleton();return m&&(g.skeleton=i.nodeIndexMap.get(m)),g.joints=d.listJoints().map(w=>i.nodeIndexMap.get(w)),i.skinIndexMap.set(d,x),g}),a.listNodes().forEach((d,x)=>{let g=s.nodes[x],y=d.getMesh();y&&(g.mesh=i.meshIndexMap.get(y));let m=d.getCamera();m&&(g.camera=i.cameraIndexMap.get(m));let w=d.getSkin();w&&(g.skin=i.skinIndexMap.get(w)),d.listChildren().length>0&&(g.children=d.listChildren().map(E=>i.nodeIndexMap.get(E)))}),s.animations=a.listAnimations().map((d,x)=>{let g=i.createPropertyDef(d),y=new Map;return g.samplers=d.listSamplers().map((m,w)=>{let E=i.createPropertyDef(m);return E.input=i.accessorIndexMap.get(m.getInput()),E.output=i.accessorIndexMap.get(m.getOutput()),E.interpolation=m.getInterpolation(),y.set(m,w),E}),g.channels=d.listChannels().map(m=>{let w=i.createPropertyDef(m);return w.sampler=y.get(m.getSampler()),w.target={node:i.nodeIndexMap.get(m.getTargetNode()),path:m.getTargetPath()},w}),i.animationIndexMap.set(d,x),g}),s.scenes=a.listScenes().map((d,x)=>{let g=i.createPropertyDef(d);return g.nodes=d.listChildren().map(y=>i.nodeIndexMap.get(y)),i.sceneIndexMap.set(d,x),g});let h=a.getDefaultScene();return h&&(s.scene=a.listScenes().indexOf(h)),s.extensionsUsed=l.map(d=>d.extensionName),s.extensionsRequired=f.map(d=>d.extensionName),l.forEach(d=>d.write(i)),dg(s),n}};function dg(t){let e=[];for(let r in t){let a=t[r];(Array.isArray(a)&&a.length===0||a===null||a===""||a&&typeof a=="object"&&Object.keys(a).length===0)&&e.push(r)}for(let r of e)delete t[r]}var ug=class{_logger=ds.DEFAULT_INSTANCE;_extensions=new Set;_dependencies={};_vertexLayout="interleaved";_strictResources=!0;lastReadBytes=0;lastWriteBytes=0;setLogger(t){return this._logger=t,this}registerExtensions(t){for(let e of t)this._extensions.add(e),e.register();return this}registerDependencies(t){return Object.assign(this._dependencies,t),this}setVertexLayout(t){return this._vertexLayout=t,this}setStrictResources(t){return this._strictResources=t,this}async read(t){return await this.readJSON(await this.readAsJSON(t))}async readAsJSON(t){let e=await this.readURI(t,"view");this.lastReadBytes=e.byteLength;let r=Zc(e)?this._binaryToJSON(e):{json:JSON.parse(q.decodeText(e)),resources:{}};return await this._readResourcesExternal(r,this.dirname(t)),this._readResourcesInternal(r),r}async readJSON(t){return t=this._copyJSON(t),this._readResourcesInternal(t),tg.read(t,{extensions:Array.from(this._extensions),dependencies:this._dependencies,logger:this._logger})}async binaryToJSON(t){let e=this._binaryToJSON(q.assertView(t));this._readResourcesInternal(e);let r=e.json;if(r.buffers&&r.buffers.some(a=>fg(e,a)))throw new Error("Cannot resolve external buffers with binaryToJSON().");if(r.images&&r.images.some(a=>hg(e,a)))throw new Error("Cannot resolve external images with binaryToJSON().");return e}async readBinary(t){return this.readJSON(await this.binaryToJSON(q.assertView(t)))}async writeJSON(t,e={}){if(e.format==="GLB"&&t.getRoot().listBuffers().length>1)throw new Error("GLB must have 0\u20131 buffers.");return lg.write(t,{format:e.format||"GLTF",basename:e.basename||"",logger:this._logger,vertexLayout:this._vertexLayout,dependencies:{...this._dependencies},extensions:Array.from(this._extensions)})}async writeBinary(t){let{json:e,resources:r}=await this.writeJSON(t,{format:"GLB"}),a=new Uint32Array([1179937895,2,12]),s=JSON.stringify(e),n=q.pad(q.encodeText(s),32),i=q.toView(new Uint32Array([n.byteLength,1313821514])),o=q.concat([i,n]);a[a.length-1]+=o.byteLength;let c=Object.values(r)[0];if(!c||!c.byteLength)return q.concat([q.toView(a),o]);let l=q.pad(c,0),f=q.toView(new Uint32Array([l.byteLength,5130562])),u=q.concat([f,l]);return a[a.length-1]+=u.byteLength,q.concat([q.toView(a),o,u])}async _readResourcesExternal(t,e){let r=t.json.images||[],a=t.json.buffers||[],s=[...r,...a].map(async n=>{let i=n.uri;if(!i||i.match(/data:/))return Promise.resolve();try{t.resources[i]=await this.readURI(this.resolve(e,i),"view"),this.lastReadBytes+=t.resources[i].byteLength}catch(o){if(!this._strictResources&&r.includes(n))this._logger.warn(`Failed to load image URI, "${i}". ${o}`),t.resources[i]=null;else throw o}});await Promise.all(s)}_readResourcesInternal(t){function e(r){if(r.uri){if(r.uri in t.resources){q.assertView(t.resources[r.uri]);return}if(r.uri.match(/data:/)){let a=`__${Wp()}.${wr.extension(r.uri)}`;t.resources[a]=q.createBufferFromDataURI(r.uri),r.uri=a}}}(t.json.images||[]).forEach(r=>{if(r.bufferView===void 0&&r.uri===void 0)throw new Error("Missing resource URI or buffer view.");e(r)}),(t.json.buffers||[]).forEach(e)}_copyJSON(t){let{images:e,buffers:r}=t.json;return t={json:{...t.json},resources:{...t.resources}},e&&(t.json.images=e.map(a=>({...a}))),r&&(t.json.buffers=r.map(a=>({...a}))),t}_binaryToJSON(t){if(!Zc(t))throw new Error("Invalid glTF 2.0 binary.");let e=new Uint32Array(t.buffer,t.byteOffset+12,2);if(e[1]!==1313821514)throw new Error("Missing required GLB JSON chunk.");let r=20,a=e[0],s=q.decodeText(q.toView(t,r,a)),n=JSON.parse(s),i=r+a;if(t.byteLength<=i)return{json:n,resources:{}};let o=new Uint32Array(t.buffer,t.byteOffset+i,2);if(o[1]!==5130562)return{json:n,resources:{}};let c=o[0],l=q.toView(t,i+8,c);return{json:n,resources:{[Bt]:l}}}};function fg(t,e){return e.uri!==void 0&&!(e.uri in t.resources)}function hg(t,e){return e.uri!==void 0&&!(e.uri in t.resources)&&e.bufferView===void 0}function Zc(t){if(t.byteLength<3*Uint32Array.BYTES_PER_ELEMENT)return!1;let e=new Uint32Array(t.buffer,t.byteOffset,3);return e[0]===1179937895&&e[1]===2}var xl=class extends ug{_fetchConfig;constructor(t=ii.DEFAULT_INIT){super(),this._fetchConfig=t}async readURI(t,e){let r=await fetch(t,this._fetchConfig);switch(e){case"view":return new Uint8Array(await r.arrayBuffer());case"text":return r.text()}}resolve(t,e){return ii.resolve(t,e)}dirname(t){return ii.dirname(t)}};function bg(){return{vkFormat:0,typeSize:1,pixelWidth:0,pixelHeight:0,pixelDepth:0,layerCount:0,faceCount:1,levelCount:0,supercompressionScheme:0,levels:[],dataFormatDescriptor:[{vendorId:0,descriptorType:0,versionNumber:2,colorModel:0,colorPrimaries:1,transferFunction:2,flags:0,texelBlockDimension:[0,0,0,0],bytesPlane:[0,0,0,0,0,0,0,0],samples:[]}],keyValue:{},globalData:null}}var ir=class{constructor(e,r,a,s){this._dataView=void 0,this._littleEndian=void 0,this._offset=void 0,this._dataView=new DataView(e.buffer,e.byteOffset+r,a),this._littleEndian=s,this._offset=0}_nextUint8(){let e=this._dataView.getUint8(this._offset);return this._offset+=1,e}_nextUint16(){let e=this._dataView.getUint16(this._offset,this._littleEndian);return this._offset+=2,e}_nextUint32(){let e=this._dataView.getUint32(this._offset,this._littleEndian);return this._offset+=4,e}_nextUint64(){let e=this._dataView.getUint32(this._offset,this._littleEndian),r=this._dataView.getUint32(this._offset+4,this._littleEndian),a=e+2**32*r;return this._offset+=8,a}_nextInt32(){let e=this._dataView.getInt32(this._offset,this._littleEndian);return this._offset+=4,e}_nextUint8Array(e){let r=new Uint8Array(this._dataView.buffer,this._dataView.byteOffset+this._offset,e);return this._offset+=e,r}_skip(e){return this._offset+=e,this}_scan(e,r=0){let a=this._offset,s=0;for(;this._dataView.getUint8(this._offset)!==r&&s<e;)s++,this._offset++;return s<e&&this._offset++,new Uint8Array(this._dataView.buffer,this._dataView.byteOffset+a,s)}};var eE=new Uint8Array([0]),Ce=[171,75,84,88,32,50,48,187,13,10,26,10];function vl(t){return new TextDecoder().decode(t)}function hs(t){let e=new Uint8Array(t.buffer,t.byteOffset,Ce.length);if(e[0]!==Ce[0]||e[1]!==Ce[1]||e[2]!==Ce[2]||e[3]!==Ce[3]||e[4]!==Ce[4]||e[5]!==Ce[5]||e[6]!==Ce[6]||e[7]!==Ce[7]||e[8]!==Ce[8]||e[9]!==Ce[9]||e[10]!==Ce[10]||e[11]!==Ce[11])throw new Error("Missing KTX 2.0 identifier.");let r=bg(),a=17*Uint32Array.BYTES_PER_ELEMENT,s=new ir(t,Ce.length,a,!0);r.vkFormat=s._nextUint32(),r.typeSize=s._nextUint32(),r.pixelWidth=s._nextUint32(),r.pixelHeight=s._nextUint32(),r.pixelDepth=s._nextUint32(),r.layerCount=s._nextUint32(),r.faceCount=s._nextUint32(),r.levelCount=s._nextUint32(),r.supercompressionScheme=s._nextUint32();let n=s._nextUint32(),i=s._nextUint32(),o=s._nextUint32(),c=s._nextUint32(),l=s._nextUint64(),f=s._nextUint64(),u=Math.max(r.levelCount,1)*3*8,p=new ir(t,Ce.length+a,u,!0);for(let P=0,L=Math.max(r.levelCount,1);P<L;P++)r.levels.push({levelData:new Uint8Array(t.buffer,t.byteOffset+p._nextUint64(),p._nextUint64()),uncompressedByteLength:p._nextUint64()});let b=new ir(t,n,i,!0);b._skip(4);let h=b._nextUint16(),d=b._nextUint16(),x=b._nextUint16(),g=b._nextUint16(),y=b._nextUint8(),m=b._nextUint8(),w=b._nextUint8(),E=b._nextUint8(),S=[b._nextUint8(),b._nextUint8(),b._nextUint8(),b._nextUint8()],A=[b._nextUint8(),b._nextUint8(),b._nextUint8(),b._nextUint8(),b._nextUint8(),b._nextUint8(),b._nextUint8(),b._nextUint8()],_={vendorId:h,descriptorType:d,versionNumber:x,colorModel:y,colorPrimaries:m,transferFunction:w,flags:E,texelBlockDimension:S,bytesPlane:A,samples:[]},B=(g/4-6)/4;for(let P=0;P<B;P++){let L={bitOffset:b._nextUint16(),bitLength:b._nextUint8(),channelType:b._nextUint8(),samplePosition:[b._nextUint8(),b._nextUint8(),b._nextUint8(),b._nextUint8()],sampleLower:Number.NEGATIVE_INFINITY,sampleUpper:Number.POSITIVE_INFINITY};L.channelType&64?(L.sampleLower=b._nextInt32(),L.sampleUpper=b._nextInt32()):(L.sampleLower=b._nextUint32(),L.sampleUpper=b._nextUint32()),_.samples[P]=L}r.dataFormatDescriptor.length=0,r.dataFormatDescriptor.push(_);let F=new ir(t,o,c,!0);for(;F._offset<c;){let P=F._nextUint32(),L=F._scan(P),Q=vl(L);if(r.keyValue[Q]=F._nextUint8Array(P-L.byteLength-1),Q.match(/^ktx/i)){let Re=vl(r.keyValue[Q]);r.keyValue[Q]=Re.substring(0,Re.lastIndexOf("\0"))}let ue=P%4?4-P%4:0;F._skip(ue)}if(f<=0)return r;let K=new ir(t,l,f,!0),$=K._nextUint16(),se=K._nextUint16(),de=K._nextUint32(),Ke=K._nextUint32(),be=K._nextUint32(),Ve=K._nextUint32(),Ze=[];for(let P=0,L=Math.max(r.levelCount,1);P<L;P++)Ze.push({imageFlags:K._nextUint32(),rgbSliceByteOffset:K._nextUint32(),rgbSliceByteLength:K._nextUint32(),alphaSliceByteOffset:K._nextUint32(),alphaSliceByteLength:K._nextUint32()});let _e=l+K._offset,ot=_e+de,et=ot+Ke,It=et+be,xr=new Uint8Array(t.buffer,t.byteOffset+_e,de),Xn=new Uint8Array(t.buffer,t.byteOffset+ot,Ke),Va=new Uint8Array(t.buffer,t.byteOffset+et,be),I=new Uint8Array(t.buffer,t.byteOffset+It,Ve);return r.globalData={endpointCount:$,selectorCount:se,imageDescs:Ze,endpointsData:xr,selectorsData:Xn,tablesData:Va,extendedData:I},r}var Ot="EXT_mesh_gpu_instancing",yt="EXT_mesh_features",je="EXT_meshopt_compression",H="EXT_structural_metadata",bs="EXT_texture_webp",ps="EXT_texture_avif",vg="KHR_accessor_float16",wg="KHR_accessor_float64",fe="KHR_draco_mesh_compression",mt="KHR_lights_punctual",Pt="KHR_materials_anisotropy",jt="KHR_materials_clearcoat",Lt="KHR_materials_diffuse_transmission",Dt="KHR_materials_dispersion",Ut="KHR_materials_emissive_strength",zt="KHR_materials_ior",Gt="KHR_materials_iridescence",Kt="KHR_materials_pbrSpecularGlossiness",Vt="KHR_materials_sheen",Ht="KHR_materials_specular",qt="KHR_materials_transmission",Mr="KHR_materials_unlit",Wt="KHR_materials_volume",Ue="KHR_materials_variants",wl="KHR_mesh_primitive_restart",Ml="KHR_mesh_quantization",Xt="KHR_node_visibility",gs="KHR_texture_basisu",$t="KHR_texture_transform",at="KHR_xmp_json_ld",Mg=class extends X{static EXTENSION_NAME=yt;init(){this.extensionName=yt,this.propertyType="FeatureID",this.parentTypes=["Features"]}getDefaults(){return Object.assign(super.getDefaults(),{nullFeatureId:null,label:"",attribute:null,texture:null,propertyTable:null})}getFeatureCount(){return this.get("featureCount")}setFeatureCount(t){return this.set("featureCount",t)}getNullFeatureID(){return this.get("nullFeatureId")}setNullFeatureID(t){return this.set("nullFeatureId",t)}getLabel(){return this.get("label")}setLabel(t){return this.set("label",t)}getAttribute(){return this.get("attribute")}setAttribute(t){return this.set("attribute",t)}getTexture(){return this.getRef("texture")}setTexture(t){return this.setRef("texture",t)}getPropertyTable(){return this.getRef("propertyTable")}setPropertyTable(t){return this.setRef("propertyTable",t)}},kg=class extends X{static EXTENSION_NAME=yt;init(){this.extensionName=yt,this.propertyType="FeatureIDTexture",this.parentTypes=["FeatureID"]}getDefaults(){let t=new oe(this.graph,"textureInfo");return t.setMinFilter(oe.MagFilter.NEAREST),t.setMagFilter(oe.MagFilter.NEAREST),Object.assign(super.getDefaults(),{channels:[0],texture:null,textureInfo:t})}getChannels(){return this.get("channels")}setChannels(t){return this.set("channels",t)}getTexture(){return this.getRef("texture")}setTexture(t){return this.setRef("texture",t)}getTextureInfo(){return this.getRef("texture")?this.getRef("textureInfo"):null}},Eg=class extends X{static EXTENSION_NAME=yt;init(){this.extensionName=yt,this.propertyType="Features",this.parentTypes=[O.PRIMITIVE]}getDefaults(){return Object.assign(super.getDefaults(),{featureIds:new ne([])})}listFeatureIDs(){return this.listRefs("featureIds")}addFeatureID(t){return this.addRef("featureIds",t)}removeFeatureID(t){return this.removeRef("featureIds",t)}},Zr=yt,xi=class extends re{extensionName=yt;static EXTENSION_NAME=yt;createFeatures(){return new Eg(this.document.getGraph())}createFeatureID(){return new Mg(this.document.getGraph())}createFeatureIDTexture(){return new kg(this.document.getGraph())}read(t){return(t.jsonDoc.json.meshes||[]).forEach((e,r)=>{(e.primitives||[]).forEach((a,s)=>{this._readPrimitive(t,r,a,s)})}),this}_readPrimitive(t,e,r,a){if(!r.extensions||!r.extensions[Zr])return;let s=this.createFeatures(),n=r.extensions[Zr];for(let i of n.featureIds){let o=Sg(this.document,this,t,i);s.addFeatureID(o)}t.meshes[e].listPrimitives()[a].setExtension(Zr,s)}write(t){let e=t.jsonDoc.json.meshes;if(!e)return this;for(let r of this.document.getRoot().listMeshes()){let a=e[t.meshIndexMap.get(r)];r.listPrimitives().forEach((s,n)=>{let i=a.primitives[n];this._writePrimitive(t,s,i)})}return this}_writePrimitive(t,e,r){let a=e.getExtension(Zr);if(!a)return;let s={featureIds:[]};a.listFeatureIDs().forEach(n=>{s.featureIds.push(Ag(this.document,t,n))}),r.extensions=r.extensions||{},r.extensions[Zr]=s}};function Sg(t,e,r,a){let s=e.createFeatureID().setFeatureCount(a.featureCount);a.nullFeatureId!==void 0&&s.setNullFeatureID(a.nullFeatureId),a.label!==void 0&&s.setLabel(a.label),a.attribute!==void 0&&s.setAttribute(a.attribute);let n=a.texture;if(n!==void 0){let i=Tg(e,r,n);s.setTexture(i)}if(a.propertyTable!==void 0){let i=t.getRoot().getExtension(H).listPropertyTables();s.setPropertyTable(i[a.propertyTable])}return s}function Tg(t,e,r){let a=t.createFeatureIDTexture(),{json:s}=e.jsonDoc;if(r.channels&&a.setChannels(r.channels),r.index!==void 0){let n=s.textures[r.index].source;a.setTexture(e.textures[n]),e.setTextureInfo(a.getTextureInfo(),r)}return a}function Ag(t,e,r){let a=t.getRoot(),s={featureCount:r.getFeatureCount()};if(r.getNullFeatureID()!=null&&(s.nullFeatureId=r.getNullFeatureID()),r.getLabel()&&(s.label=r.getLabel()),r.getAttribute()!=null&&(s.attribute=r.getAttribute()),r.getTexture()){let n=r.getTexture(),i=n.getTexture(),o=n.getTextureInfo();s.texture=e.createTextureInfoDef(i,o);let c=n.getChannels();le.eq(c,[0])||(s.texture.channels=c)}if(r.getPropertyTable()){let n=a.getExtension(H),i=r.getPropertyTable();s.propertyTable=n.listPropertyTables().indexOf(i)}return s}var gi="INSTANCE_ATTRIBUTE",Ig=class extends X{static EXTENSION_NAME=Ot;init(){this.extensionName=Ot,this.propertyType="InstancedMesh",this.parentTypes=[O.NODE]}getDefaults(){return Object.assign(super.getDefaults(),{attributes:new ge})}getAttribute(t){return this.getRefMap("attributes",t)}setAttribute(t,e){return this.setRefMap("attributes",t,e,{usage:gi})}listAttributes(){return this.listRefMapValues("attributes")}listSemantics(){return this.listRefMapKeys("attributes")}},_g=class extends re{static EXTENSION_NAME=Ot;extensionName=Ot;prewriteTypes=[O.ACCESSOR];createInstancedMesh(){return new Ig(this.document.getGraph())}read(t){return(t.jsonDoc.json.nodes||[]).forEach((e,r)=>{if(!e.extensions||!e.extensions.EXT_mesh_gpu_instancing)return;let a=e.extensions[Ot],s=this.createInstancedMesh();for(let n in a.attributes)s.setAttribute(n,t.accessors[a.attributes[n]]);t.nodes[r].setExtension(Ot,s)}),this}prewrite(t){t.accessorUsageGroupedByParent.add(gi);for(let e of this.properties)for(let r of e.listAttributes())t.addAccessorToUsageGroup(r,gi);return this}write(t){let e=t.jsonDoc;return this.document.getRoot().listNodes().forEach(r=>{let a=r.getExtension(Ot);if(a){let s=t.nodeIndexMap.get(r),n=e.json.nodes[s],i={attributes:{}};a.listSemantics().forEach(o=>{let c=a.getAttribute(o);i.attributes[o]=t.accessorIndexMap.get(c)}),n.extensions=n.extensions||{},n.extensions[Ot]=i}}),this}},Rg=(function(t){return t.QUANTIZE="quantize",t.FILTER="filter",t})({});function Ng(t){return!t.extensions||!t.extensions.EXT_meshopt_compression?!1:!!t.extensions[je].fallback}var{BYTE:Cg,SHORT:kl,FLOAT:Bg}=G.ComponentType,{encodeNormalizedInt:El,decodeNormalizedInt:mi}=le;function Fg(t,e,r,a){let{filter:s,bits:n}=a,i={array:t.getArray(),byteStride:t.getElementSize()*t.getComponentSize(),componentType:t.getComponentType(),normalized:t.getNormalized()};if(r!=="ATTRIBUTES")return i;if(s!=="NONE"){let o=t.getNormalized()?Og(t):new Float32Array(i.array);switch(s){case"EXPONENTIAL":i.byteStride=t.getElementSize()*4,i.componentType=Bg,i.normalized=!1,i.array=e.encodeFilterExp(o,t.getCount(),i.byteStride,n);break;case"OCTAHEDRAL":i.byteStride=n>8?8:4,i.componentType=n>8?kl:Cg,i.normalized=!0,o=t.getElementSize()===3?jg(o):o,i.array=e.encodeFilterOct(o,t.getCount(),i.byteStride,n);break;case"QUATERNION":i.byteStride=8,i.componentType=kl,i.normalized=!0,i.array=e.encodeFilterQuat(o,t.getCount(),i.byteStride,n);break;default:throw new Error("Invalid filter.")}i.min=t.getMin([]),i.max=t.getMax([]),t.getNormalized()&&(i.min=i.min.map(c=>mi(c,t.getComponentType())),i.max=i.max.map(c=>mi(c,t.getComponentType()))),i.normalized&&(i.min=i.min.map(c=>El(c,i.componentType)),i.max=i.max.map(c=>El(c,i.componentType)))}else i.byteStride%4&&(i.array=Pg(i.array,t.getElementSize()),i.byteStride=i.array.byteLength/t.getCount());return i}function Og(t){let e=t.getComponentType(),r=t.getArray(),a=new Float32Array(r.length);for(let s=0;s<r.length;s++)a[s]=mi(r[s],e);return a}function Pg(t,e){let r=q.padNumber(t.BYTES_PER_ELEMENT*e)/t.BYTES_PER_ELEMENT,a=t.length/e,s=new t.constructor(a*r);for(let n=0;n*e<t.length;n++)for(let i=0;i<e;i++)s[n*r+i]=t[n*e+i];return s}function jg(t){let e=new Float32Array(t.length*4/3);for(let r=0,a=t.length/3;r<a;r++)e[r*4]=t[r*3],e[r*4+1]=t[r*3+1],e[r*4+2]=t[r*3+2];return e}function Lg(t,e){return e===Ct.BufferViewUsage.ELEMENT_ARRAY_BUFFER?t.listParents().some(r=>r instanceof Qr&&r.getMode()===Qr.Mode.TRIANGLES)?"TRIANGLES":"INDICES":"ATTRIBUTES"}function Dg(t,e){let r=e.getGraph().listParentEdges(t).filter(a=>!(a.getParent()instanceof hi));for(let a of r){let s=a.getName(),n=a.getAttributes().key||"",i=a.getParent().propertyType===O.PRIMITIVE_TARGET;if(s==="indices")return{filter:"NONE"};if(s==="attributes"){if(n==="POSITION")return{filter:"NONE"};if(n==="TEXCOORD_0")return{filter:"NONE"};if(n.startsWith("JOINTS_"))return{filter:"NONE"};if(n.startsWith("WEIGHTS_"))return{filter:"NONE"};if(n==="NORMAL"||n==="TANGENT")return i?{filter:"NONE"}:{filter:"OCTAHEDRAL",bits:8}}if(s==="output"){let o=zl(t);return o==="rotation"?{filter:"QUATERNION",bits:16}:o==="translation"?{filter:"EXPONENTIAL",bits:12}:o==="scale"?{filter:"EXPONENTIAL",bits:12}:{filter:"NONE"}}if(s==="input")return{filter:"NONE"};if(s==="inverseBindMatrices")return{filter:"NONE"}}return{filter:"NONE"}}function zl(t){for(let e of t.listParents())if(e instanceof us){for(let r of e.listParents())if(r instanceof fi)return r.getTargetPath()}return null}var Sl={method:"quantize"},vi=class extends re{extensionName=je;prereadTypes=[O.BUFFER,O.PRIMITIVE];prewriteTypes=[O.BUFFER,O.ACCESSOR];readDependencies=["meshopt.decoder"];writeDependencies=["meshopt.encoder"];static EXTENSION_NAME=je;static EncoderMethod=Rg;_decoder=null;_decoderFallbackBufferMap=new Map;_encoder=null;_encoderOptions=Sl;_encoderFallbackBuffer=null;_encoderBufferViews={};_encoderBufferViewData={};_encoderBufferViewAccessors={};install(t,e){return t==="meshopt.decoder"&&(this._decoder=e),t==="meshopt.encoder"&&(this._encoder=e),this}setEncoderOptions(t){return this._encoderOptions={...Sl,...t},this}preread(t,e){if(!this._decoder){if(!this.isRequired())return this;throw new Error(`[${je}] Please install extension dependency, "meshopt.decoder".`)}if(!this._decoder.supported){if(!this.isRequired())return this;throw new Error(`[${je}]: Missing WASM support.`)}return e===O.BUFFER?this._prereadBuffers(t):e===O.PRIMITIVE&&this._prereadPrimitives(t),this}_prereadBuffers(t){let e=t.jsonDoc;(e.json.bufferViews||[]).forEach((r,a)=>{if(!r.extensions||!r.extensions.EXT_meshopt_compression)return;let s=r.extensions[je],n=s.byteOffset||0,i=s.byteLength||0,o=s.count,c=s.byteStride,l=new Uint8Array(o*c),f=e.json.buffers[s.buffer],u=f.uri?e.resources[f.uri]:e.resources[Bt],p=q.toView(u,n,i);this._decoder.decodeGltfBuffer(l,o,c,p,s.mode,s.filter),t.bufferViews[a]=l})}_prereadPrimitives(t){let e=t.jsonDoc;(e.json.bufferViews||[]).forEach(r=>{if(!r.extensions||!r.extensions.EXT_meshopt_compression)return;let a=r.extensions[je],s=t.buffers[a.buffer],n=t.buffers[r.buffer],i=e.json.buffers[r.buffer];Ng(i)&&this._decoderFallbackBufferMap.set(n,s)})}read(t){if(!this.isRequired())return this;for(let[e,r]of this._decoderFallbackBufferMap){for(let a of e.listParents())a instanceof G&&a.swap(e,r);e.dispose()}return this}prewrite(t,e){return e===O.ACCESSOR?this._prewriteAccessors(t):e===O.BUFFER&&this._prewriteBuffers(t),this}_prewriteAccessors(t){let e=t.jsonDoc.json,r=this._encoder,a=this._encoderOptions,s=this.document.getGraph(),n=this.document.createBuffer(),i=this.document.getRoot().listBuffers().indexOf(n),o=1,c=new Map,l=f=>{for(let u of s.listParents(f)){if(u.propertyType===O.ROOT)continue;let p=c.get(f);return p===void 0&&c.set(f,p=o++),p}return-1};this._encoderFallbackBuffer=n,this._encoderBufferViews={},this._encoderBufferViewData={},this._encoderBufferViewAccessors={};for(let f of this.document.getRoot().listAccessors()){if(zl(f)==="weights"||f.getSparse())continue;let u=t.getAccessorUsage(f),p=t.accessorUsageGroupedByParent.has(u)?l(f):null,b=Lg(f,u),h=a.method==="filter"?Dg(f,this.document):{filter:"NONE"},d=Fg(f,r,b,h),{array:x,byteStride:g}=d,y=f.getBuffer();if(!y)throw new Error(`${je}: Missing buffer for accessor.`);let m=this.document.getRoot().listBuffers().indexOf(y),w=[u,p,b,h.filter,g,m].join(":"),E=this._encoderBufferViews[w],S=this._encoderBufferViewData[w],A=this._encoderBufferViewAccessors[w];(!E||!S)&&(A=this._encoderBufferViewAccessors[w]=[],S=this._encoderBufferViewData[w]=[],E=this._encoderBufferViews[w]={buffer:i,target:Ct.USAGE_TO_TARGET[u],byteOffset:0,byteLength:0,byteStride:u===Ct.BufferViewUsage.ARRAY_BUFFER?g:void 0,extensions:{[je]:{buffer:m,byteOffset:0,byteLength:0,mode:b,filter:h.filter!=="NONE"?h.filter:void 0,byteStride:g,count:0}}});let T=t.createAccessorDef(f);T.componentType=d.componentType,T.normalized=d.normalized,T.byteOffset=E.byteLength,T.min&&d.min&&(T.min=d.min),T.max&&d.max&&(T.max=d.max),t.accessorIndexMap.set(f,e.accessors.length),e.accessors.push(T),A.push(T),S.push(new Uint8Array(x.buffer,x.byteOffset,x.byteLength)),E.byteLength+=x.byteLength,E.extensions.EXT_meshopt_compression.count+=f.getCount()}}_prewriteBuffers(t){let e=this._encoder;for(let r in this._encoderBufferViews){let a=this._encoderBufferViews[r],s=this._encoderBufferViewData[r],n=this.document.getRoot().listBuffers()[a.extensions[je].buffer],i=t.otherBufferViews.get(n)||[],{count:o,byteStride:c,mode:l}=a.extensions[je],f=q.concat(s),u=e.encodeGltfBuffer(f,o,c,l),p=q.pad(u);a.extensions[je].byteLength=u.byteLength,s.length=0,s.push(p),i.push(p),t.otherBufferViews.set(n,i)}}write(t){let e=0;for(let n in this._encoderBufferViews){let i=this._encoderBufferViews[n],o=this._encoderBufferViewData[n][0],c=t.otherBufferViewsIndexMap.get(o),l=this._encoderBufferViewAccessors[n];for(let b of l)b.bufferView=c;let f=t.jsonDoc.json.bufferViews[c],u=f.byteOffset||0;Object.assign(f,i),f.byteOffset=e;let p=f.extensions[je];p.byteOffset=u,e+=q.padNumber(i.byteLength)}let r=this._encoderFallbackBuffer,a=t.bufferIndexMap.get(r),s=t.jsonDoc.json.buffers[a];return s.byteLength=e,s.extensions={[je]:{fallback:!0}},r.dispose(),this}},Ug=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="StructuralMetadata",this.parentTypes=[O.ROOT]}getDefaults(){return Object.assign(super.getDefaults(),{schema:null,schemaUri:"",propertyTables:new Se,propertyTextures:new Se,propertyAttributes:new Se})}getSchema(){return this.getRef("schema")}setSchema(t){return this.setRef("schema",t)}getSchemaUri(){return this.get("schemaUri")}setSchemaUri(t){return this.set("schemaUri",t)}listPropertyTables(){return this.listRefs("propertyTables")}addPropertyTable(t){return this.addRef("propertyTables",t)}removePropertyTable(t){return this.removeRef("propertyTables",t)}listPropertyTextures(){return this.listRefs("propertyTextures")}addPropertyTexture(t){return this.addRef("propertyTextures",t)}removePropertyTexture(t){return this.removeRef("propertyTextures",t)}listPropertyAttributes(){return this.listRefs("propertyAttributes")}addPropertyAttribute(t){return this.addRef("propertyAttributes",t)}removePropertyAttribute(t){return this.removeRef("propertyAttributes",t)}},zg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="Schema",this.parentTypes=["StructuralMetadata"]}getDefaults(){return Object.assign(super.getDefaults(),{description:"",version:"",classes:new ge,enums:new ge})}getId(){return this.get("id")}setId(t){return this.set("id",t)}getDescription(){return this.get("description")}setDescription(t){return this.set("description",t)}getVersion(){return this.get("version")}setVersion(t){return this.set("version",t)}setClass(t,e){return this.setRefMap("classes",t,e)}getClass(t){return this.getRefMap("classes",t)}listClassKeys(){return this.listRefMapKeys("classes")}listClassValues(){return this.listRefMapValues("classes")}setEnum(t,e){return this.setRefMap("enums",t,e)}getEnum(t){return this.getRefMap("enums",t)}listEnumKeys(){return this.listRefMapKeys("enums")}listEnumValues(){return this.listRefMapValues("enums")}},Gg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="Class",this.parentTypes=["Schema"]}getDefaults(){return Object.assign(super.getDefaults(),{description:"",properties:new ge})}getDescription(){return this.get("description")}setDescription(t){return this.set("description",t)}setProperty(t,e){return this.setRefMap("properties",t,e)}getProperty(t){return this.getRefMap("properties",t)}listPropertyKeys(){return this.listRefMapKeys("properties")}listPropertyValues(){return this.listRefMapValues("properties")}},Kg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="ClassProperty",this.parentTypes=["Class"]}getDefaults(){return Object.assign(super.getDefaults(),{description:"",componentType:null,enumType:null,array:null,count:null,normalized:null,offset:null,scale:null,max:null,min:null,required:null,noData:null,default:null})}getDescription(){return this.get("description")}setDescription(t){return this.set("description",t)}getType(){return this.get("type")}setType(t){return this.set("type",t)}getComponentType(){return this.get("componentType")}setComponentType(t){return this.set("componentType",t)}getEnumType(){return this.get("enumType")}setEnumType(t){return this.set("enumType",t)}getArray(){return this.get("array")}setArray(t){return this.set("array",t)}getCount(){return this.get("count")}setCount(t){return this.set("count",t)}getNormalized(){return this.get("normalized")}setNormalized(t){return this.set("normalized",t)}getOffset(){return this.get("offset")}setOffset(t){return this.set("offset",t)}getScale(){return this.get("scale")}setScale(t){return this.set("scale",t)}getMax(){return this.get("max")}setMax(t){return this.set("max",t)}getMin(){return this.get("min")}setMin(t){return this.set("min",t)}getRequired(){return this.get("required")}setRequired(t){return this.set("required",t)}getNoData(){return this.get("noData")}setNoData(t){return this.set("noData",t)}getDefault(){return this.get("default")}setDefault(t){return this.set("default",t)}},Vg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="Enum",this.parentTypes=["Schema"]}getDefaults(){return Object.assign(super.getDefaults(),{description:"",valueType:"UINT16",values:new Se})}getDescription(){return this.get("description")}setDescription(t){return this.set("description",t)}getValueType(){return this.get("valueType")}setValueType(t){return this.set("valueType",t)}listValues(){return this.listRefs("values")}addEnumValue(t){return this.addRef("values",t)}removeEnumValue(t){return this.removeRef("values",t)}},Hg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="EnumValue",this.parentTypes=["Enum"]}getDefaults(){return Object.assign(super.getDefaults(),{description:null})}getDescription(){return this.get("description")}setDescription(t){return this.set("description",t)}getValue(){return this.get("value")}setValue(t){return this.set("value",t)}},qg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="PropertyTable",this.parentTypes=["StructuralMetadata"]}getDefaults(){return Object.assign(super.getDefaults(),{properties:new ge})}getClass(){return this.get("class")}setClass(t){return this.set("class",t)}getCount(){return this.get("count")}setCount(t){return this.set("count",t)}setProperty(t,e){return this.setRefMap("properties",t,e)}getProperty(t){return this.getRefMap("properties",t)}listPropertyKeys(){return this.listRefMapKeys("properties")}listPropertyValues(){return this.listRefMapValues("properties")}},Wg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="PropertyTableProperty",this.parentTypes=["PropertyTable"]}getDefaults(){return Object.assign(super.getDefaults(),{arrayOffsets:null,stringOffsets:null,arrayOffsetType:null,stringOffsetType:null,offset:null,scale:null,max:null,min:null})}getValues(){return this.get("values")}setValues(t){return this.set("values",t)}getArrayOffsets(){return this.get("arrayOffsets")}setArrayOffsets(t){return this.set("arrayOffsets",t)}getStringOffsets(){return this.get("stringOffsets")}setStringOffsets(t){return this.set("stringOffsets",t)}getArrayOffsetType(){return this.get("arrayOffsetType")}setArrayOffsetType(t){return this.set("arrayOffsetType",t)}getStringOffsetType(){return this.get("stringOffsetType")}setStringOffsetType(t){return this.set("stringOffsetType",t)}getOffset(){return this.get("offset")}setOffset(t){return this.set("offset",t)}getScale(){return this.get("scale")}setScale(t){return this.set("scale",t)}getMax(){return this.get("max")}setMax(t){return this.set("max",t)}getMin(){return this.get("min")}setMin(t){return this.set("min",t)}},Xg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="PropertyTexture",this.parentTypes=["StructuralMetadata"]}getDefaults(){return Object.assign(super.getDefaults(),{properties:new ge})}getClass(){return this.get("class")}setClass(t){return this.set("class",t)}setProperty(t,e){return this.setRefMap("properties",t,e)}getProperty(t){return this.getRefMap("properties",t)}listPropertyKeys(){return this.listRefMapKeys("properties")}listPropertyValues(){return this.listRefMapValues("properties")}},$g=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="PropertyTextureProperty",this.parentTypes=["PropertyTexture"]}getDefaults(){let t=new oe(this.graph,"textureInfo");return t.setMinFilter(oe.MagFilter.NEAREST),t.setMagFilter(oe.MagFilter.NEAREST),Object.assign(super.getDefaults(),{channels:[0],texture:null,textureInfo:t,offset:null,scale:null,max:null,min:null})}getChannels(){return this.get("channels")}setChannels(t){return this.set("channels",t)}getTexture(){return this.getRef("texture")}setTexture(t){return this.setRef("texture",t)}getTextureInfo(){return this.getRef("texture")?this.getRef("textureInfo"):null}getOffset(){return this.get("offset")}setOffset(t){return this.set("offset",t)}getScale(){return this.get("scale")}setScale(t){return this.set("scale",t)}getMax(){return this.get("max")}setMax(t){return this.set("max",t)}getMin(){return this.get("min")}setMin(t){return this.set("min",t)}},Yg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="PropertyAttribute",this.parentTypes=["StructuralMetadata"]}getDefaults(){return Object.assign(super.getDefaults(),{properties:new ge})}getClass(){return this.get("class")}setClass(t){return this.set("class",t)}setProperty(t,e){return this.setRefMap("properties",t,e)}getProperty(t){return this.getRefMap("properties",t)}listPropertyKeys(){return this.listRefMapKeys("properties")}listPropertyValues(){return this.listRefMapValues("properties")}},Jg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="PropertyAttributeProperty",this.parentTypes=["PropertyAttribute"]}getDefaults(){return Object.assign(super.getDefaults(),{offset:null,scale:null,max:null,min:null})}getAttribute(){return this.get("attribute")}setAttribute(t){return this.set("attribute",t)}getOffset(){return this.get("offset")}setOffset(t){return this.set("offset",t)}getScale(){return this.get("scale")}setScale(t){return this.set("scale",t)}getMax(){return this.get("max")}setMax(t){return this.set("max",t)}getMin(){return this.get("min")}setMin(t){return this.set("min",t)}},Qg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="NodeStructuralMetadata",this.parentTypes=[O.NODE]}getDefaults(){return Object.assign(super.getDefaults(),{class:"",properties:{}})}getClass(){return this.get("class")}setClass(t){return this.set("class",t)}getProperties(){return this.get("properties")}setProperties(t){return this.set("properties",t)}},Zg=class extends X{static EXTENSION_NAME=H;init(){this.extensionName=H,this.propertyType="MeshPrimitiveStructuralMetadata",this.parentTypes=[O.PRIMITIVE]}getDefaults(){return Object.assign(super.getDefaults(),{propertyTextures:new Se,propertyAttributes:new Se})}listPropertyTextures(){return this.listRefs("propertyTextures")}addPropertyTexture(t){return this.addRef("propertyTextures",t)}removePropertyTexture(t){return this.removeRef("propertyTextures",t)}listPropertyAttributes(){return this.listRefs("propertyAttributes")}addPropertyAttribute(t){return this.addRef("propertyAttributes",t)}removePropertyAttribute(t){return this.removeRef("propertyAttributes",t)}},em=class extends re{extensionName=H;static EXTENSION_NAME=H;prewriteTypes=[O.BUFFER];prereadTypes=[O.SCENE];createStructuralMetadata(){return new Ug(this.document.getGraph())}createSchema(){return new zg(this.document.getGraph())}createClass(){return new Gg(this.document.getGraph())}createClassProperty(){return new Kg(this.document.getGraph())}createEnum(){return new Vg(this.document.getGraph())}createEnumValue(){return new Hg(this.document.getGraph())}createPropertyTable(){return new qg(this.document.getGraph())}createPropertyTableProperty(){return new Wg(this.document.getGraph())}createPropertyTexture(){return new Xg(this.document.getGraph())}createPropertyTextureProperty(){return new $g(this.document.getGraph())}createPropertyAttribute(){return new Yg(this.document.getGraph())}createPropertyAttributeProperty(){return new Jg(this.document.getGraph())}createNodeStructuralMetadata(){return new Qg(this.document.getGraph())}createMeshPrimitiveStructuralMetadata(){return new Zg(this.document.getGraph())}read(t){return this}preread(t){let e=this.document.getRoot(),{json:r}=t.jsonDoc,a=r.extensions[H],s=tm(this,t,a);return e.setExtension(H,s),(r.meshes||[]).forEach((n,i)=>{let o=t.meshes[i].listPrimitives();(n.primitives||[]).forEach((c,l)=>{let f=o[l];this._readPrimitive(s,f,c)})}),(r.nodes||[]).forEach((n,i)=>{this._readNode(t.nodes[i],n)}),this}_readPrimitive(t,e,r){if(!r.extensions||!r.extensions.EXT_structural_metadata)return;let a=this.createMeshPrimitiveStructuralMetadata(),s=r.extensions[H],n=t.listPropertyTextures(),i=s.propertyTextures||[];for(let l of i){let f=n[l];a.addPropertyTexture(f)}let o=t.listPropertyAttributes(),c=s.propertyAttributes||[];for(let l of c){let f=o[l];a.addPropertyAttribute(f)}e.setExtension(H,a)}_readNode(t,e){if(!e.extensions||!e.extensions.EXT_structural_metadata)return;let r=e.extensions[H],a=this.createNodeStructuralMetadata().setClass(r.class).setProperties(r.properties);t.setExtension(H,a)}write(t){let e=this.document.getRoot(),r=e.getExtension(H);if(!r)return this;let a=t.jsonDoc.json,s=hm(t,r);a.extensions=a.extensions||{},a.extensions[H]=s;let n=e.listMeshes(),i=a.meshes;if(i)for(let l of n){let f=i[t.meshIndexMap.get(l)];l.listPrimitives().forEach((u,p)=>{let b=f.primitives[p];this._writePrimitive(r,u,b)})}let o=e.listNodes(),c=a.nodes;if(c)for(let l of o){let f=t.nodeIndexMap.get(l);this._writeNode(l,c[f])}return this}_writePrimitive(t,e,r){let a=e.getExtension(H);if(!a)return;let s=t.listPropertyTextures(),n=t.listPropertyAttributes(),i,o,c=a.listPropertyTextures();if(c.length>0){i=[];for(let u of c){let p=s.indexOf(u);if(p>=0)i.push(p);else throw new Error(`${H}: Invalid property texture in mesh primitive`)}}let l=a.listPropertyAttributes();if(l.length>0){o=[];for(let u of l){let p=n.indexOf(u);if(p>=0)o.push(p);else throw new Error(`${H}: Invalid property attribute in mesh primitive`)}}let f={propertyTextures:i,propertyAttributes:o};r.extensions=r.extensions||{},r.extensions[H]=f}_writeNode(t,e){let r=t.getExtension("EXT_structural_metadata");r&&(e.extensions=e.extensions||{},e.extensions[H]={class:r.getClass(),properties:r.getProperties()})}prewrite(t,e){return e===O.BUFFER&&this._prewriteBuffers(t),this}_prewriteBuffers(t){let e=this.document,r=e.getRoot().getExtension(H);t.jsonDoc.json.bufferViews||=[];for(let a of r.listPropertyTables())for(let s of a.listPropertyValues()){let n=Sm(e,t);n.push(s.getValues());let i=s.getArrayOffsets();i&&n.push(i);let o=s.getStringOffsets();o&&n.push(o)}}};function tm(t,e,r){let a=t.createStructuralMetadata();if(r.schema!==void 0){let o=rm(t,r.schema);a.setSchema(o)}else if(r.schemaUri){let o=r.schemaUri;a.setSchemaUri(o)}let s=r.propertyTextures||[];for(let o of s){let c=om(t,e,o);a.addPropertyTexture(c)}let n=r.propertyTables||[];for(let o of n){let c=lm(t,e,o);a.addPropertyTable(c)}let i=r.propertyAttributes||[];for(let o of i){let c=um(t,o);a.addPropertyAttribute(c)}return a}function rm(t,e){let r=t.createSchema().setId(e.id);e.name!==void 0&&r.setName(e.name),e.description!==void 0&&r.setDescription(e.description),e.version!==void 0&&r.setVersion(e.version);let a=e.classes||{};for(let n of Object.keys(a)){let i=a[n];r.setClass(n,am(t,i))}let s=e.enums||{};for(let n of Object.keys(s))r.setEnum(n,nm(t,s[n]));return r}function am(t,e){let r=t.createClass();e.name!==void 0&&r.setName(e.name),e.description!==void 0&&r.setDescription(e.description);let a=e.properties||{};for(let s of Object.keys(a)){let n=sm(t,a[s]);r.setProperty(s,n)}return r}function sm(t,e){let r=t.createClassProperty().setType(e.type);return e.name!==void 0&&r.setName(e.name),e.description!==void 0&&r.setDescription(e.description),e.componentType!==void 0&&r.setComponentType(e.componentType),e.enumType!==void 0&&r.setEnumType(e.enumType),e.array!==void 0&&r.setArray(e.array),e.count!==void 0&&r.setCount(e.count),e.normalized!==void 0&&r.setNormalized(e.normalized),e.offset!==void 0&&r.setOffset(e.offset),e.scale!==void 0&&r.setScale(e.scale),e.max!==void 0&&r.setMax(e.max),e.min!==void 0&&r.setMin(e.min),e.required!==void 0&&r.setRequired(e.required),e.noData!==void 0&&r.setNoData(e.noData),e.default!==void 0&&r.setDefault(e.default),r}function nm(t,e){let r=t.createEnum();e.name!==void 0&&r.setName(e.name),e.description!==void 0&&r.setDescription(e.description),e.valueType!==void 0&&r.setValueType(e.valueType);let a=e.values||{};for(let s of a)r.addEnumValue(im(t,s));return r}function im(t,e){let r=t.createEnumValue();return e.name!==void 0&&r.setName(e.name),e.description!==void 0&&r.setDescription(e.description),e.value!==void 0&&r.setValue(e.value),r}function om(t,e,r){let a=t.createPropertyTexture();a.setClass(r.class),r.name!==void 0&&a.setName(r.name);let s=r.properties||{};for(let n of Object.keys(s)){let i=cm(t,e,s[n]);a.setProperty(n,i)}return a}function cm(t,e,r){let a=t.createPropertyTextureProperty(),s=e.jsonDoc.json.textures||[];r.channels&&a.setChannels(r.channels);let n=s[r.index].source;if(n!==void 0){let i=e.textures[n];a.setTexture(i);let o=a.getTextureInfo();o&&e.setTextureInfo(o,r)}return r.offset!==void 0&&a.setOffset(r.offset),r.scale!==void 0&&a.setScale(r.scale),r.max!==void 0&&a.setMax(r.max),r.min!==void 0&&a.setMin(r.min),a}function lm(t,e,r){let a=t.createPropertyTable().setClass(r.class).setCount(r.count);r.name!==void 0&&a.setName(r.name);let s=r.properties||{};for(let n of Object.keys(s)){let i=dm(t,e,s[n]);a.setProperty(n,i)}return a}function dm(t,e,r){let a=t.createPropertyTableProperty(),s=bi(e,r.values);if(a.setValues(s),r.arrayOffsets!==void 0){let n=bi(e,r.arrayOffsets);a.setArrayOffsets(n)}if(r.stringOffsets!==void 0){let n=bi(e,r.stringOffsets);a.setStringOffsets(n)}return r.arrayOffsetType!==void 0&&a.setArrayOffsetType(r.arrayOffsetType),r.stringOffsetType!==void 0&&a.setStringOffsetType(r.stringOffsetType),r.offset!==void 0&&a.setOffset(r.offset),r.scale!==void 0&&a.setScale(r.scale),r.max!==void 0&&a.setMax(r.max),r.min!==void 0&&a.setMin(r.min),a}function um(t,e){let r=t.createPropertyAttribute();r.setClass(e.class),e.name!==void 0&&r.setName(e.name);let a=e.properties||{};for(let s of Object.keys(a)){let n=fm(t,a[s]);r.setProperty(s,n)}return r}function fm(t,e){let r=t.createPropertyAttributeProperty();return r.setAttribute(e.attribute),e.offset!==void 0&&r.setOffset(e.offset),e.scale!==void 0&&r.setScale(e.scale),e.max!==void 0&&r.setMax(e.max),e.min!==void 0&&r.setMin(e.min),r}function hm(t,e){let r={},a=e.getSchema();a&&(r.schema=bm(a));let s=e.getSchemaUri();s&&(r.schemaUri=s);let n=e.listPropertyTables();if(n.length>0){let c=[];for(let l of n){let f=xm(t,l);c.push(f)}r.propertyTables=c}let i=e.listPropertyTextures();if(i.length>0){let c=[];for(let l of i){let f=km(t,l);c.push(f)}r.propertyTextures=c}let o=e.listPropertyAttributes();if(o.length>0){let c=[];for(let l of o){let f=wm(l);c.push(f)}r.propertyAttributes=c}return r}function bm(t){let e={id:t.getId()},r=t.listClassKeys();if(r.length>0){e.classes={};for(let s of r){let n=pm(t.getClass(s));e.classes[s]=n}}let a=t.listEnumKeys();if(a.length>0){e.enums={};for(let s of a){let n=mm(t.getEnum(s));e.enums[s]=n}}return t.getName()&&(e.name=t.getName()),t.getDescription()&&(e.description=t.getDescription()),t.getVersion()&&(e.version=t.getVersion()),e}function pm(t){let e={},r=t.listPropertyKeys();if(r.length>0){e.properties={};for(let a of r){let s=t.getProperty(a);e.properties[a]=gm(s)}}return t.getName()&&(e.name=t.getName()),t.getDescription()&&(e.description=t.getDescription()),e}function gm(t){let e={type:t.getType()};return t.getArray()&&(e.array=t.getArray()),t.getNormalized()&&(e.normalized=t.getNormalized()),t.getRequired()&&(e.required=t.getRequired()),t.getName()&&(e.name=t.getName()),t.getDescription()&&(e.description=t.getDescription()),t.getComponentType()!=null&&(e.componentType=t.getComponentType()),t.getEnumType()!=null&&(e.enumType=t.getEnumType()),t.getCount()!=null&&(e.count=t.getCount()),t.getOffset()!=null&&(e.offset=t.getOffset()),t.getScale()!=null&&(e.scale=t.getScale()),t.getMax()!=null&&(e.max=t.getMax()),t.getMin()!=null&&(e.min=t.getMin()),t.getNoData()!=null&&(e.noData=t.getNoData()),t.getDefault()!=null&&(e.default=t.getDefault()),e}function mm(t){let e={values:t.listValues().map(ym)};return t.getName()&&(e.name=t.getName()),t.getDescription()&&(e.description=t.getDescription()),t.getValueType()!=="UINT16"&&(e.valueType=t.getValueType()),e}function ym(t){let e={name:t.getName(),value:t.getValue()};return t.getDescription()&&(e.description=t.getDescription()),e}function xm(t,e){let r={class:e.getClass(),count:e.getCount()};e.getName()&&(r.name=e.getName());let a=e.listPropertyKeys();if(a.length>0){r.properties={};for(let s of a){let n=vm(t,e.getProperty(s));r.properties[s]=n}}return r}function vm(t,e){let r=e.getValues(),a={values:t.otherBufferViewsIndexMap.get(r)};if(e.getArrayOffsets()){let s=e.getArrayOffsets();a.arrayOffsets=t.otherBufferViewsIndexMap.get(s)}if(e.getStringOffsets()){let s=e.getStringOffsets();a.stringOffsets=t.otherBufferViewsIndexMap.get(s)}return e.getArrayOffsetType()!=null&&(a.arrayOffsetType=e.getArrayOffsetType()),e.getStringOffsetType()!=null&&(a.stringOffsetType=e.getStringOffsetType()),e.getOffset()!=null&&(a.offset=e.getOffset()),e.getScale()!=null&&(a.scale=e.getScale()),e.getMax()!=null&&(a.max=e.getMax()),e.getMin()!=null&&(a.min=e.getMin()),a}function wm(t){let e={class:t.getClass()};t.getName()&&(e.name=t.getName());let r=t.listPropertyKeys();if(r.length>0){e.properties={};for(let a of r){let s=Mm(t.getProperty(a));e.properties[a]=s}}return e}function Mm(t){let e={attribute:t.getAttribute()};return t.getOffset()!=null&&(e.offset=t.getOffset()),t.getScale()!=null&&(e.scale=t.getScale()),t.getMax()!=null&&(e.max=t.getMax()),t.getMin()!=null&&(e.min=t.getMin()),e}function km(t,e){let r={class:e.getClass()};e.getName()&&(r.name=e.getName());let a=e.listPropertyKeys();if(a.length>0){r.properties={};for(let s of a){let n=Em(t,e.getProperty(s));r.properties[s]=n}}return r}function Em(t,e){let r=e.getTexture(),a=e.getTextureInfo(),s=e.getChannels(),n=t.createTextureInfoDef(r,a);return le.eq(s,[0])||(n.channels=s),e.getOffset()!=null&&(n.offset=e.getOffset()),e.getScale()!=null&&(n.scale=e.getScale()),e.getMax()!=null&&(n.max=e.getMax()),e.getMin()!=null&&(n.min=e.getMin()),n}function bi(t,e){let r=t.jsonDoc,a=r.json.buffers||[],s=(r.json.bufferViews||[])[e],n=a[s.buffer],i=n.uri?r.resources[n.uri]:r.resources[Bt],o=s.byteOffset||0,c=s.byteLength;return i.slice(o,o+c)}function Sm(t,e){let r=t.getRoot().listBuffers()[0],a=e.otherBufferViews.get(r);return a||(a=[],e.otherBufferViews.set(r,a)),a}var Tm=class{match(t){return t.length>=12&&q.decodeText(t.slice(4,12))==="ftypavif"}getSize(t){if(!this.match(t))return null;let e=new DataView(t.buffer,t.byteOffset,t.byteLength),r=Tl(e,0);if(!r)return null;let a=r.end;for(;r=Tl(e,a);)if(r.type==="meta")a=r.start+4;else if(r.type==="iprp"||r.type==="ipco")a=r.start;else{if(r.type==="ispe")return[e.getUint32(r.start+4),e.getUint32(r.start+8)];if(r.type==="mdat")break;a=r.end}return null}getChannels(t){return 4}},Am=class extends re{extensionName=ps;prereadTypes=[O.TEXTURE];static EXTENSION_NAME=ps;static register(){lt.registerFormat("image/avif",new Tm)}preread(t){return(t.jsonDoc.json.textures||[]).forEach(e=>{e.extensions&&e.extensions.EXT_texture_avif&&(e.source=e.extensions[ps].source)}),this}read(t){return this}write(t){let e=t.jsonDoc;return this.document.getRoot().listTextures().forEach(r=>{if(r.getMimeType()==="image/avif"){let a=t.imageIndexMap.get(r);(e.json.textures||[]).forEach(s=>{s.source===a&&(s.extensions=s.extensions||{},s.extensions[ps]={source:s.source},delete s.source)})}}),this}};function Tl(t,e){if(t.byteLength<4+e)return null;let r=t.getUint32(e);return t.byteLength<r+e||r<8?null:{type:q.decodeText(new Uint8Array(t.buffer,t.byteOffset+e+4,4)),start:e+8,end:e+r}}var Im=class{match(t){return t.length>=12&&t[8]===87&&t[9]===69&&t[10]===66&&t[11]===80}getSize(t){let e=q.decodeText(t.slice(0,4)),r=q.decodeText(t.slice(8,12));if(e!=="RIFF"||r!=="WEBP")return null;let a=new DataView(t.buffer,t.byteOffset),s=12;for(;s<a.byteLength;){let n=q.decodeText(new Uint8Array([a.getUint8(s),a.getUint8(s+1),a.getUint8(s+2),a.getUint8(s+3)])),i=a.getUint32(s+4,!0);if(n==="VP8 ")return[a.getInt16(s+14,!0)&16383,a.getInt16(s+16,!0)&16383];if(n==="VP8L"){let o=a.getUint8(s+9),c=a.getUint8(s+10),l=a.getUint8(s+11),f=a.getUint8(s+12);return[1+((c&63)<<8|o),1+((f&15)<<10|l<<2|(c&192)>>6)]}s+=8+i+i%2}return null}getChannels(t){return 4}},_m=class extends re{extensionName=bs;prereadTypes=[O.TEXTURE];static EXTENSION_NAME=bs;static register(){lt.registerFormat("image/webp",new Im)}preread(t){return(t.jsonDoc.json.textures||[]).forEach(e=>{e.extensions&&e.extensions.EXT_texture_webp&&(e.source=e.extensions[bs].source)}),this}read(t){return this}write(t){let e=t.jsonDoc;return this.document.getRoot().listTextures().forEach(r=>{if(r.getMimeType()==="image/webp"){let a=t.imageIndexMap.get(r);(e.json.textures||[]).forEach(s=>{s.source===a&&(s.extensions=s.extensions||{},s.extensions[bs]={source:s.source},delete s.source)})}}),this}},Al=vg,Rm=class extends re{extensionName=Al;static EXTENSION_NAME=Al;read(t){return this}write(t){return this}},Il=wg,Nm=class extends re{extensionName=Il;static EXTENSION_NAME=Il;read(t){return this}write(t){return this}},ye,Gl,Kl;function Cm(t,e){let r=new ye.DecoderBuffer;try{if(r.Init(e,e.length),t.GetEncodedGeometryType(r)!==ye.TRIANGULAR_MESH)throw new Error(`[${fe}] Unknown geometry type.`);let a=new ye.Mesh;if(!t.DecodeBufferToMesh(r,a).ok()||a.ptr===0)throw new Error(`[${fe}] Decoding failure.`);return a}finally{ye.destroy(r)}}function Bm(t,e){let r=e.num_faces()*3,a,s;if(e.num_points()<=65534){let n=r*Uint16Array.BYTES_PER_ELEMENT;a=ye._malloc(n),t.GetTrianglesUInt16Array(e,n,a),s=new Uint16Array(ye.HEAPU16.buffer,a,r).slice()}else{let n=r*Uint32Array.BYTES_PER_ELEMENT;a=ye._malloc(n),t.GetTrianglesUInt32Array(e,n,a),s=new Uint32Array(ye.HEAPU32.buffer,a,r).slice()}return ye._free(a),s}function Fm(t,e,r,a){let s=Kl[a.componentType],n=Gl[a.componentType],i=r.num_components(),o=e.num_points()*i,c=o*n.BYTES_PER_ELEMENT,l=ye._malloc(c);t.GetAttributeDataArrayForAllPoints(e,r,s,c,l);let f=new n(ye.HEAPF32.buffer,l,o).slice();return ye._free(l),f}function Om(t){ye=t,Gl={[G.ComponentType.FLOAT]:Float32Array,[G.ComponentType.UNSIGNED_INT]:Uint32Array,[G.ComponentType.UNSIGNED_SHORT]:Uint16Array,[G.ComponentType.UNSIGNED_BYTE]:Uint8Array,[G.ComponentType.SHORT]:Int16Array,[G.ComponentType.BYTE]:Int8Array},Kl={[G.ComponentType.FLOAT]:ye.DT_FLOAT32,[G.ComponentType.UNSIGNED_INT]:ye.DT_UINT32,[G.ComponentType.UNSIGNED_SHORT]:ye.DT_UINT16,[G.ComponentType.UNSIGNED_BYTE]:ye.DT_UINT8,[G.ComponentType.SHORT]:ye.DT_INT16,[G.ComponentType.BYTE]:ye.DT_INT8}}var Xe,Pm=(function(t){return t[t.EDGEBREAKER=1]="EDGEBREAKER",t[t.SEQUENTIAL=0]="SEQUENTIAL",t})({}),Vl={POSITION:14,NORMAL:10,COLOR:8,TEX_COORD:12,GENERIC:12},_l={decodeSpeed:5,encodeSpeed:5,method:1,quantizationBits:Vl,quantizationVolume:"mesh"};function jm(t){Xe=t}function Lm(t,e=_l){let r={..._l,...e};r.quantizationBits={...Vl,...e.quantizationBits};let a=new Xe.MeshBuilder,s=new Xe.Mesh,n=new Xe.ExpertEncoder(s),i={},o=new Xe.DracoInt8Array,c=t.listTargets().length>0,l=!1;for(let d of t.listSemantics()){let x=t.getAttribute(d);if(x.getSparse()){l=!0;continue}let g=Dm(d),y=Um(a,x.getComponentType(),s,Xe[g],x.getCount(),x.getElementSize(),x.getArray());if(y===-1)throw new Error(`Error compressing "${d}" attribute.`);if(i[d]=y,r.quantizationVolume==="mesh"||d!=="POSITION")n.SetAttributeQuantization(y,r.quantizationBits[g]);else if(typeof r.quantizationVolume=="object"){let{quantizationVolume:m}=r,w=Math.max(m.max[0]-m.min[0],m.max[1]-m.min[1],m.max[2]-m.min[2]);n.SetAttributeExplicitQuantization(y,r.quantizationBits[g],x.getElementSize(),m.min,w)}else throw new Error("Invalid quantization volume state.")}let f=t.getIndices();if(!f)throw new yi("Primitive must have indices.");a.AddFacesToMesh(s,f.getCount()/3,f.getArray()),n.SetSpeedOptions(r.encodeSpeed,r.decodeSpeed),n.SetTrackEncodedProperties(!0),r.method===0||c||l?n.SetEncodingMethod(Xe.MESH_SEQUENTIAL_ENCODING):n.SetEncodingMethod(Xe.MESH_EDGEBREAKER_ENCODING);let u=n.EncodeToDracoBuffer(!(c||l),o);if(u<=0)throw new yi("Error applying Draco compression.");let p=new Uint8Array(u);for(let d=0;d<u;++d)p[d]=o.GetValue(d);let b=n.GetNumberOfEncodedPoints(),h=n.GetNumberOfEncodedFaces()*3;return Xe.destroy(o),Xe.destroy(s),Xe.destroy(a),Xe.destroy(n),{numVertices:b,numIndices:h,data:p,attributeIDs:i}}function Dm(t){return t==="POSITION"?"POSITION":t==="NORMAL"?"NORMAL":t.startsWith("COLOR_")?"COLOR":t.startsWith("TEXCOORD_")?"TEX_COORD":"GENERIC"}function Um(t,e,r,a,s,n,i){switch(e){case G.ComponentType.UNSIGNED_BYTE:return t.AddUInt8Attribute(r,a,s,n,i);case G.ComponentType.BYTE:return t.AddInt8Attribute(r,a,s,n,i);case G.ComponentType.UNSIGNED_SHORT:return t.AddUInt16Attribute(r,a,s,n,i);case G.ComponentType.SHORT:return t.AddInt16Attribute(r,a,s,n,i);case G.ComponentType.UNSIGNED_INT:return t.AddUInt32Attribute(r,a,s,n,i);case G.ComponentType.FLOAT:return t.AddFloatAttribute(r,a,s,n,i);default:throw new Error(`Unexpected component type, "${e}".`)}}var yi=class extends Error{},zm=class extends re{extensionName=fe;prereadTypes=[O.PRIMITIVE];prewriteTypes=[O.ACCESSOR];readDependencies=["draco3d.decoder"];writeDependencies=["draco3d.encoder"];static EXTENSION_NAME=fe;static EncoderMethod=Pm;_decoderModule=null;_encoderModule=null;_encoderOptions={};install(t,e){return t==="draco3d.decoder"&&(this._decoderModule=e,Om(this._decoderModule)),t==="draco3d.encoder"&&(this._encoderModule=e,jm(this._encoderModule)),this}setEncoderOptions(t){return this._encoderOptions=t,this}preread(t){if(!this._decoderModule)throw new Error(`[${fe}] Please install extension dependency, "draco3d.decoder".`);let e=this.document.getLogger(),r=t.jsonDoc,a=new Map;try{let s=r.json.meshes||[];for(let n of s)for(let i of n.primitives){if(!i.extensions||!i.extensions.KHR_draco_mesh_compression)continue;let o=i.extensions[fe],[c,l]=a.get(o.bufferView)||[];if(!l||!c){let f=r.json.bufferViews[o.bufferView],u=r.json.buffers[f.buffer],p=u.uri?r.resources[u.uri]:r.resources[Bt],b=f.byteOffset||0,h=f.byteLength,d=q.toView(p,b,h);c=new this._decoderModule.Decoder,l=Cm(c,d),a.set(o.bufferView,[c,l]),e.debug(`[${fe}] Decompressed ${d.byteLength} bytes.`)}for(let f in o.attributes){let u=t.jsonDoc.json.accessors[i.attributes[f]],p=c.GetAttributeByUniqueId(l,o.attributes[f]),b=Fm(c,l,p,u);t.accessors[i.attributes[f]].setArray(b)}i.indices!==void 0&&t.accessors[i.indices].setArray(Bm(c,l))}}finally{for(let[s,n]of Array.from(a.values()))this._decoderModule.destroy(s),this._decoderModule.destroy(n)}return this}read(t){return this}prewrite(t,e){if(!this._encoderModule)throw new Error(`[${fe}] Please install extension dependency, "draco3d.encoder".`);let r=this.document.getLogger();r.debug(`[${fe}] Compression options: ${JSON.stringify(this._encoderOptions)}`);let a=Gm(this.document),s=new Map,n="mesh";this._encoderOptions.quantizationVolume==="scene"&&(this.document.getRoot().listScenes().length!==1?r.warn(`[${fe}]: quantizationVolume=scene requires exactly 1 scene.`):n=rl(this.document.getRoot().listScenes().pop()));for(let i of Array.from(a.keys())){let o=a.get(i);if(!o)throw new Error("Unexpected primitive.");if(s.has(o)){s.set(o,s.get(o));continue}let c=i.getIndices(),l=t.jsonDoc.json.accessors,f;try{f=Lm(i,{...this._encoderOptions,quantizationVolume:n})}catch(b){if(b instanceof yi){r.warn(`[${fe}]: ${b.message} Skipping primitive compression.`);continue}throw b}s.set(o,f);let u=t.createAccessorDef(c);u.count=f.numIndices,t.accessorIndexMap.set(c,l.length),l.push(u),f.numVertices>65534&&G.getComponentSize(u.componentType)<=2?u.componentType=G.ComponentType.UNSIGNED_INT:f.numVertices>254&&G.getComponentSize(u.componentType)<=1&&(u.componentType=G.ComponentType.UNSIGNED_SHORT);for(let b of i.listSemantics()){let h=i.getAttribute(b);if(f.attributeIDs[b]===void 0)continue;let d=t.createAccessorDef(h);d.count=f.numVertices,t.accessorIndexMap.set(h,l.length),l.push(d)}let p=i.getAttribute("POSITION").getBuffer()||this.document.getRoot().listBuffers()[0];t.otherBufferViews.has(p)||t.otherBufferViews.set(p,[]),t.otherBufferViews.get(p).push(f.data)}return r.debug(`[${fe}] Compressed ${a.size} primitives.`),t.extensionData[fe]={primitiveHashMap:a,primitiveEncodingMap:s},this}write(t){let e=t.extensionData[fe];for(let r of this.document.getRoot().listMeshes()){let a=t.jsonDoc.json.meshes[t.meshIndexMap.get(r)];for(let s=0;s<r.listPrimitives().length;s++){let n=r.listPrimitives()[s],i=a.primitives[s],o=e.primitiveHashMap.get(n);if(!o)continue;let c=e.primitiveEncodingMap.get(o);c&&(i.extensions=i.extensions||{},i.extensions[fe]={bufferView:t.otherBufferViewsIndexMap.get(c.data),attributes:c.attributeIDs})}}if(!e.primitiveHashMap.size){let r=t.jsonDoc.json;r.extensionsUsed=(r.extensionsUsed||[]).filter(a=>a!==fe),r.extensionsRequired=(r.extensionsRequired||[]).filter(a=>a!==fe)}return this}};function Gm(t){let e=t.getLogger(),r=new Set,a=new Set,s=0,n=0;for(let u of t.getRoot().listMeshes())for(let p of u.listPrimitives())p.getIndices()?p.getMode()!==Qr.Mode.TRIANGLES?(a.add(p),n++):r.add(p):(a.add(p),s++);s>0&&e.warn(`[${fe}] Skipping Draco compression of ${s} non-indexed primitives.`),n>0&&e.warn(`[${fe}] Skipping Draco compression of ${n} non-TRIANGLES primitives.`);let i=t.getRoot().listAccessors(),o=new Map;for(let u=0;u<i.length;u++)o.set(i[u],u);let c=new Map,l=new Set,f=new Map;for(let u of Array.from(r)){let p=Rl(u,o);if(l.has(p)){f.set(u,p);continue}if(c.has(u.getIndices())){let b=u.getIndices(),h=b.clone();o.set(h,t.getRoot().listAccessors().length-1),u.swap(b,h)}for(let b of u.listAttributes())if(c.has(b)){let h=b.clone();o.set(h,t.getRoot().listAccessors().length-1),u.swap(b,h)}p=Rl(u,o),l.add(p),f.set(u,p),c.set(u.getIndices(),p);for(let b of u.listAttributes())c.set(b,p)}for(let u of Array.from(c.keys())){let p=new Set(u.listParents().map(b=>b.propertyType));if(p.size!==2||!p.has(O.PRIMITIVE)||!p.has(O.ROOT))throw new Error(`[${fe}] Compressed accessors must only be used as indices or vertex attributes.`)}for(let u of Array.from(r)){let p=f.get(u),b=u.getIndices();if(c.get(b)!==p||u.listAttributes().some(h=>c.get(h)!==p))throw new Error(`[${fe}] Draco primitives must share all, or no, accessors.`)}for(let u of Array.from(a)){let p=u.getIndices();if(c.has(p)||u.listAttributes().some(b=>c.has(b)))throw new Error(`[${fe}] Accessor cannot be shared by compressed and uncompressed primitives.`)}return f}function Rl(t,e){let r=[],a=t.getIndices();r.push(e.get(a));for(let s of t.listAttributes())r.push(e.get(s));return r.sort().join("|")}var Nl=class Hl extends X{static EXTENSION_NAME=mt;static Type={POINT:"point",SPOT:"spot",DIRECTIONAL:"directional"};init(){this.extensionName=mt,this.propertyType="Light",this.parentTypes=[O.NODE]}getDefaults(){return Object.assign(super.getDefaults(),{color:[1,1,1],intensity:1,type:Hl.Type.POINT,range:null,innerConeAngle:0,outerConeAngle:Math.PI/4})}getColor(){return this.get("color")}setColor(e){return this.set("color",e)}getIntensity(){return this.get("intensity")}setIntensity(e){return this.set("intensity",e)}getType(){return this.get("type")}setType(e){return this.set("type",e)}getRange(){return this.get("range")}setRange(e){return this.set("range",e)}getInnerConeAngle(){return this.get("innerConeAngle")}setInnerConeAngle(e){return this.set("innerConeAngle",e)}getOuterConeAngle(){return this.get("outerConeAngle")}setOuterConeAngle(e){return this.set("outerConeAngle",e)}},Km=class extends re{extensionName=mt;static EXTENSION_NAME=mt;createLight(t=""){return new Nl(this.document.getGraph(),t)}read(t){let e=t.jsonDoc;if(!e.json.extensions||!e.json.extensions.KHR_lights_punctual)return this;let r=(e.json.extensions.KHR_lights_punctual.lights||[]).map(a=>{let s=this.createLight().setName(a.name||"").setType(a.type);return a.extras&&s.setExtras(a.extras),a.color!==void 0&&s.setColor(a.color),a.intensity!==void 0&&s.setIntensity(a.intensity),a.range!==void 0&&s.setRange(a.range),a.spot?.innerConeAngle!==void 0&&s.setInnerConeAngle(a.spot.innerConeAngle),a.spot?.outerConeAngle!==void 0&&s.setOuterConeAngle(a.spot.outerConeAngle),s});return e.json.nodes.forEach((a,s)=>{if(!a.extensions||!a.extensions.KHR_lights_punctual)return;let n=a.extensions[mt];t.nodes[s].setExtension(mt,r[n.light])}),this}write(t){let e=t.jsonDoc;if(this.properties.size===0)return this;let r=[],a=new Map;for(let s of this.properties){let n=s,i=t.createPropertyDef(s);i.type=n.getType(),le.eq(n.getColor(),[1,1,1])||(i.color=n.getColor()),n.getIntensity()!==1&&(i.intensity=n.getIntensity()),n.getRange()!=null&&(i.range=n.getRange()),n.getName()&&(i.name=n.getName()),n.getType()===Nl.Type.SPOT&&(i.spot={innerConeAngle:n.getInnerConeAngle(),outerConeAngle:n.getOuterConeAngle()}),r.push(i),a.set(n,r.length-1)}return this.document.getRoot().listNodes().forEach(s=>{let n=s.getExtension(mt);if(n){let i=t.nodeIndexMap.get(s),o=e.json.nodes[i];o.extensions=o.extensions||{},o.extensions[mt]={light:a.get(n)}}}),e.json.extensions=e.json.extensions||{},e.json.extensions[mt]={lights:r},this}},{R:Vm,G:Hm,B:qm}=rt,Wm=class extends X{static EXTENSION_NAME=Pt;init(){this.extensionName=Pt,this.propertyType="Anisotropy",this.parentTypes=[O.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{anisotropyStrength:0,anisotropyRotation:0,anisotropyTexture:null,anisotropyTextureInfo:new oe(this.graph,"anisotropyTextureInfo")})}getAnisotropyStrength(){return this.get("anisotropyStrength")}setAnisotropyStrength(t){return this.set("anisotropyStrength",t)}getAnisotropyRotation(){return this.get("anisotropyRotation")}setAnisotropyRotation(t){return this.set("anisotropyRotation",t)}getAnisotropyTexture(){return this.getRef("anisotropyTexture")}getAnisotropyTextureInfo(){return this.getRef("anisotropyTexture")?this.getRef("anisotropyTextureInfo"):null}setAnisotropyTexture(t){return this.setRef("anisotropyTexture",t,{channels:Vm|Hm|qm})}},Xm=class extends re{static EXTENSION_NAME=Pt;extensionName=Pt;prereadTypes=[O.MESH];prewriteTypes=[O.MESH];createAnisotropy(){return new Wm(this.document.getGraph())}read(t){return this}write(t){return this}preread(t){let e=t.jsonDoc,r=e.json.materials||[],a=e.json.textures||[];return r.forEach((s,n)=>{if(s.extensions&&s.extensions.KHR_materials_anisotropy){let i=this.createAnisotropy();t.materials[n].setExtension(Pt,i);let o=s.extensions[Pt];if(o.extras&&i.setExtras(o.extras),o.anisotropyStrength!==void 0&&i.setAnisotropyStrength(o.anisotropyStrength),o.anisotropyRotation!==void 0&&i.setAnisotropyRotation(o.anisotropyRotation),o.anisotropyTexture!==void 0){let c=o.anisotropyTexture,l=t.textures[a[c.index].source];i.setAnisotropyTexture(l),t.setTextureInfo(i.getAnisotropyTextureInfo(),c)}}}),this}prewrite(t){let e=t.jsonDoc;return this.document.getRoot().listMaterials().forEach(r=>{let a=r.getExtension(Pt);if(a){let s=t.materialIndexMap.get(r),n=e.json.materials[s],i=t.createPropertyDef(a);if(n.extensions=n.extensions||{},n.extensions[Pt]=i,a.getAnisotropyStrength()>0&&(i.anisotropyStrength=a.getAnisotropyStrength()),a.getAnisotropyRotation()!==0&&(i.anisotropyRotation=a.getAnisotropyRotation()),a.getAnisotropyTexture()){let o=a.getAnisotropyTexture(),c=a.getAnisotropyTextureInfo();i.anisotropyTexture=t.createTextureInfoDef(o,c)}}}),this}},{R:Cl,G:Bl,B:$m}=rt,Ym=class extends X{static EXTENSION_NAME=jt;init(){this.extensionName=jt,this.propertyType="Clearcoat",this.parentTypes=[O.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{clearcoatFactor:0,clearcoatTexture:null,clearcoatTextureInfo:new oe(this.graph,"clearcoatTextureInfo"),clearcoatRoughnessFactor:0,clearcoatRoughnessTexture:null,clearcoatRoughnessTextureInfo:new oe(this.graph,"clearcoatRoughnessTextureInfo"),clearcoatNormalScale:1,clearcoatNormalTexture:null,clearcoatNormalTextureInfo:new oe(this.graph,"clearcoatNormalTextureInfo")})}getClearcoatFactor(){return this.get("clearcoatFactor")}setClearcoatFactor(t){return this.set("clearcoatFactor",t)}getClearcoatTexture(){return this.getRef("clearcoatTexture")}getClearcoatTextureInfo(){return this.getRef("clearcoatTexture")?this.getRef("clearcoatTextureInfo"):null}setClearcoatTexture(t){return this.setRef("clearcoatTexture",t,{channels:Cl})}getClearcoatRoughnessFactor(){return this.get("clearcoatRoughnessFactor")}setClearcoatRoughnessFactor(t){return this.set("clearcoatRoughnessFactor",t)}getClearcoatRoughnessTexture(){return this.getRef("clearcoatRoughnessTexture")}getClearcoatRoughnessTextureInfo(){return this.getRef("clearcoatRoughnessTexture")?this.getRef("clearcoatRoughnessTextureInfo"):null}setClearcoatRoughnessTexture(t){return this.setRef("clearcoatRoughnessTexture",t,{channels:Bl})}getClearcoatNormalScale(){return this.get("clearcoatNormalScale")}setClearcoatNormalScale(t){return this.set("clearcoatNormalScale",t)}getClearcoatNormalTexture(){return this.getRef("clearcoatNormalTexture")}getClearcoatNormalTextureInfo(){return this.getRef("clearcoatNormalTexture")?this.getRef("clearcoatNormalTextureInfo"):null}setClearcoatNormalTexture(t){return this.setRef("clearcoatNormalTexture",t,{channels:Cl|Bl|$m})}},Jm=class extends re{static EXTENSION_NAME=jt;extensionName=jt;prereadTypes=[O.MESH];prewriteTypes=[O.MESH];createClearcoat(){return new Ym(this.document.getGraph())}read(t){return this}write(t){return this}preread(t){let e=t.jsonDoc,r=e.json.materials||[],a=e.json.textures||[];return r.forEach((s,n)=>{if(s.extensions&&s.extensions.KHR_materials_clearcoat){let i=this.createClearcoat();t.materials[n].setExtension(jt,i);let o=s.extensions[jt];if(o.extras&&i.setExtras(o.extras),o.clearcoatFactor!==void 0&&i.setClearcoatFactor(o.clearcoatFactor),o.clearcoatRoughnessFactor!==void 0&&i.setClearcoatRoughnessFactor(o.clearcoatRoughnessFactor),o.clearcoatTexture!==void 0){let c=o.clearcoatTexture,l=t.textures[a[c.index].source];i.setClearcoatTexture(l),t.setTextureInfo(i.getClearcoatTextureInfo(),c)}if(o.clearcoatRoughnessTexture!==void 0){let c=o.clearcoatRoughnessTexture,l=t.textures[a[c.index].source];i.setClearcoatRoughnessTexture(l),t.setTextureInfo(i.getClearcoatRoughnessTextureInfo(),c)}if(o.clearcoatNormalTexture!==void 0){let c=o.clearcoatNormalTexture,l=t.textures[a[c.index].source];i.setClearcoatNormalTexture(l),t.setTextureInfo(i.getClearcoatNormalTextureInfo(),c),c.scale!==void 0&&i.setClearcoatNormalScale(c.scale)}}}),this}prewrite(t){let e=t.jsonDoc;return this.document.getRoot().listMaterials().forEach(r=>{let a=r.getExtension(jt);if(a){let s=t.materialIndexMap.get(r),n=e.json.materials[s],i=t.createPropertyDef(a);if(n.extensions=n.extensions||{},n.extensions[jt]=i,i.clearcoatFactor=a.getClearcoatFactor(),i.clearcoatRoughnessFactor=a.getClearcoatRoughnessFactor(),a.getClearcoatTexture()){let o=a.getClearcoatTexture(),c=a.getClearcoatTextureInfo();i.clearcoatTexture=t.createTextureInfoDef(o,c)}if(a.getClearcoatRoughnessTexture()){let o=a.getClearcoatRoughnessTexture(),c=a.getClearcoatRoughnessTextureInfo();i.clearcoatRoughnessTexture=t.createTextureInfoDef(o,c)}if(a.getClearcoatNormalTexture()){let o=a.getClearcoatNormalTexture(),c=a.getClearcoatNormalTextureInfo();i.clearcoatNormalTexture=t.createTextureInfoDef(o,c),a.getClearcoatNormalScale()!==1&&(i.clearcoatNormalTexture.scale=a.getClearcoatNormalScale())}}}),this}},{R:Qm,G:Zm,B:e0,A:t0}=rt,r0=class extends X{static EXTENSION_NAME=Lt;init(){this.extensionName=Lt,this.propertyType="DiffuseTransmission",this.parentTypes=[O.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{diffuseTransmissionFactor:0,diffuseTransmissionTexture:null,diffuseTransmissionTextureInfo:new oe(this.graph,"diffuseTransmissionTextureInfo"),diffuseTransmissionColorFactor:[1,1,1],diffuseTransmissionColorTexture:null,diffuseTransmissionColorTextureInfo:new oe(this.graph,"diffuseTransmissionColorTextureInfo")})}getDiffuseTransmissionFactor(){return this.get("diffuseTransmissionFactor")}setDiffuseTransmissionFactor(t){return this.set("diffuseTransmissionFactor",t)}getDiffuseTransmissionTexture(){return this.getRef("diffuseTransmissionTexture")}getDiffuseTransmissionTextureInfo(){return this.getRef("diffuseTransmissionTexture")?this.getRef("diffuseTransmissionTextureInfo"):null}setDiffuseTransmissionTexture(t){return this.setRef("diffuseTransmissionTexture",t,{channels:t0})}getDiffuseTransmissionColorFactor(){return this.get("diffuseTransmissionColorFactor")}setDiffuseTransmissionColorFactor(t){return this.set("diffuseTransmissionColorFactor",t)}getDiffuseTransmissionColorTexture(){return this.getRef("diffuseTransmissionColorTexture")}getDiffuseTransmissionColorTextureInfo(){return this.getRef("diffuseTransmissionColorTexture")?this.getRef("diffuseTransmissionColorTextureInfo"):null}setDiffuseTransmissionColorTexture(t){return this.setRef("diffuseTransmissionColorTexture",t,{channels:Qm|Zm|e0})}},a0=class extends re{extensionName=Lt;static EXTENSION_NAME=Lt;createDiffuseTransmission(){return new r0(this.document.getGraph())}read(t){let e=t.jsonDoc,r=e.json.materials||[],a=e.json.textures||[];return r.forEach((s,n)=>{if(s.extensions&&s.extensions.KHR_materials_diffuse_transmission){let i=this.createDiffuseTransmission();t.materials[n].setExtension(Lt,i);let o=s.extensions[Lt];if(o.extras&&i.setExtras(o.extras),o.diffuseTransmissionFactor!==void 0&&i.setDiffuseTransmissionFactor(o.diffuseTransmissionFactor),o.diffuseTransmissionColorFactor!==void 0&&i.setDiffuseTransmissionColorFactor(o.diffuseTransmissionColorFactor),o.diffuseTransmissionTexture!==void 0){let c=o.diffuseTransmissionTexture,l=t.textures[a[c.index].source];i.setDiffuseTransmissionTexture(l),t.setTextureInfo(i.getDiffuseTransmissionTextureInfo(),c)}if(o.diffuseTransmissionColorTexture!==void 0){let c=o.diffuseTransmissionColorTexture,l=t.textures[a[c.index].source];i.setDiffuseTransmissionColorTexture(l),t.setTextureInfo(i.getDiffuseTransmissionColorTextureInfo(),c)}}}),this}write(t){let e=t.jsonDoc;for(let r of this.document.getRoot().listMaterials()){let a=r.getExtension(Lt);if(!a)continue;let s=t.materialIndexMap.get(r),n=e.json.materials[s],i=t.createPropertyDef(a);if(n.extensions=n.extensions||{},n.extensions[Lt]=i,i.diffuseTransmissionFactor=a.getDiffuseTransmissionFactor(),i.diffuseTransmissionColorFactor=a.getDiffuseTransmissionColorFactor(),a.getDiffuseTransmissionTexture()){let o=a.getDiffuseTransmissionTexture(),c=a.getDiffuseTransmissionTextureInfo();i.diffuseTransmissionTexture=t.createTextureInfoDef(o,c)}if(a.getDiffuseTransmissionColorTexture()){let o=a.getDiffuseTransmissionColorTexture(),c=a.getDiffuseTransmissionColorTextureInfo();i.diffuseTransmissionColorTexture=t.createTextureInfoDef(o,c)}}return this}},s0=class extends X{static EXTENSION_NAME=Dt;init(){this.extensionName=Dt,this.propertyType="Dispersion",this.parentTypes=[O.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{dispersion:0})}getDispersion(){return this.get("dispersion")}setDispersion(t){return this.set("dispersion",t)}},n0=class extends re{static EXTENSION_NAME=Dt;extensionName=Dt;prereadTypes=[O.MESH];prewriteTypes=[O.MESH];createDispersion(){return new s0(this.document.getGraph())}read(t){return this}write(t){return this}preread(t){return(t.jsonDoc.json.materials||[]).forEach((e,r)=>{if(e.extensions&&e.extensions.KHR_materials_dispersion){let a=this.createDispersion();t.materials[r].setExtension(Dt,a);let s=e.extensions[Dt];s.extras&&a.setExtras(s.extras),s.dispersion!==void 0&&a.setDispersion(s.dispersion)}}),this}prewrite(t){let e=t.jsonDoc;return this.document.getRoot().listMaterials().forEach(r=>{let a=r.getExtension(Dt);if(a){let s=t.materialIndexMap.get(r),n=e.json.materials[s],i=t.createPropertyDef(a);n.extensions=n.extensions||{},n.extensions[Dt]=i,i.dispersion=a.getDispersion()}}),this}},i0=class extends X{static EXTENSION_NAME=Ut;init(){this.extensionName=Ut,this.propertyType="EmissiveStrength",this.parentTypes=[O.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{emissiveStrength:1})}getEmissiveStrength(){return this.get("emissiveStrength")}setEmissiveStrength(t){return this.set("emissiveStrength",t)}},o0=class extends re{static EXTENSION_NAME=Ut;extensionName=Ut;prereadTypes=[O.MESH];prewriteTypes=[O.MESH];createEmissiveStrength(){return new i0(this.document.getGraph())}read(t){return this}write(t){return this}preread(t){return(t.jsonDoc.json.materials||[]).forEach((e,r)=>{if(e.extensions&&e.extensions.KHR_materials_emissive_strength){let a=this.createEmissiveStrength();t.materials[r].setExtension(Ut,a);let s=e.extensions[Ut];s.extras&&a.setExtras(s.extras),s.emissiveStrength!==void 0&&a.setEmissiveStrength(s.emissiveStrength)}}),this}prewrite(t){let e=t.jsonDoc;return this.document.getRoot().listMaterials().forEach(r=>{let a=r.getExtension(Ut);if(a){let s=t.materialIndexMap.get(r),n=e.json.materials[s],i=t.createPropertyDef(a);n.extensions=n.extensions||{},n.extensions[Ut]=i,i.emissiveStrength=a.getEmissiveStrength()}}),this}},c0=class extends X{static EXTENSION_NAME=zt;init(){this.extensionName=zt,this.propertyType="IOR",this.parentTypes=[O.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{ior:1.5})}getIOR(){return this.get("ior")}setIOR(t){return this.set("ior",t)}},l0=class extends re{static EXTENSION_NAME=zt;extensionName=zt;prereadTypes=[O.MESH];prewriteTypes=[O.MESH];createIOR(){return new c0(this.document.getGraph())}read(t){return this}write(t){return this}preread(t){return(t.jsonDoc.json.materials||[]).forEach((e,r)=>{if(e.extensions&&e.extensions.KHR_materials_ior){let a=this.createIOR();t.materials[r].setExtension(zt,a);let s=e.extensions[zt];s.extras&&a.setExtras(s.extras),s.ior!==void 0&&a.setIOR(s.ior)}}),this}prewrite(t){let e=t.jsonDoc;return this.document.getRoot().listMaterials().forEach(r=>{let a=r.getExtension(zt);if(a){let s=t.materialIndexMap.get(r),n=e.json.materials[s],i=t.createPropertyDef(a);n.extensions=n.extensions||{},n.extensions[zt]=i,i.ior=a.getIOR()}}),this}},{R:d0,G:u0}=rt,f0=class extends X{static EXTENSION_NAME=Gt;init(){this.extensionName=Gt,this.propertyType="Iridescence",this.parentTypes=[O.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{iridescenceFactor:0,iridescenceTexture:null,iridescenceTextureInfo:new oe(this.graph,"iridescenceTextureInfo"),iridescenceIOR:1.3,iridescenceThicknessMinimum:100,iridescenceThicknessMaximum:400,iridescenceThicknessTexture:null,iridescenceThicknessTextureInfo:new oe(this.graph,"iridescenceThicknessTextureInfo")})}getIridescenceFactor(){return this.get("iridescenceFactor")}setIridescenceFactor(t){return this.set("iridescenceFactor",t)}getIridescenceTexture(){return this.getRef("iridescenceTexture")}getIridescenceTextureInfo(){return this.getRef("iridescenceTexture")?this.getRef("iridescenceTextureInfo"):null}setIridescenceTexture(t){return this.setRef("iridescenceTexture",t,{channels:d0})}getIridescenceIOR(){return this.get("iridescenceIOR")}setIridescenceIOR(t){return this.set("iridescenceIOR",t)}getIridescenceThicknessMinimum(){return this.get("iridescenceThicknessMinimum")}setIridescenceThicknessMinimum(t){return this.set("iridescenceThicknessMinimum",t)}getIridescenceThicknessMaximum(){return this.get("iridescenceThicknessMaximum")}setIridescenceThicknessMaximum(t){return this.set("iridescenceThicknessMaximum",t)}getIridescenceThicknessTexture(){return this.getRef("iridescenceThicknessTexture")}getIridescenceThicknessTextureInfo(){return this.getRef("iridescenceThicknessTexture")?this.getRef("iridescenceThicknessTextureInfo"):null}setIridescenceThicknessTexture(t){return this.setRef("iridescenceThicknessTexture",t,{channels:u0})}},h0=class extends re{static EXTENSION_NAME=Gt;extensionName=Gt;prereadTypes=[O.MESH];prewriteTypes=[O.MESH];createIridescence(){return new f0(this.document.getGraph())}read(t){return this}write(t){return this}preread(t){let e=t.jsonDoc,r=e.json.materials||[],a=e.json.textures||[];return r.forEach((s,n)=>{if(s.extensions&&s.extensions.KHR_materials_iridescence){let i=this.createIridescence();t.materials[n].setExtension(Gt,i);let o=s.extensions[Gt];if(o.extras&&i.setExtras(o.extras),o.iridescenceFactor!==void 0&&i.setIridescenceFactor(o.iridescenceFactor),o.iridescenceIor!==void 0&&i.setIridescenceIOR(o.iridescenceIor),o.iridescenceThicknessMinimum!==void 0&&i.setIridescenceThicknessMinimum(o.iridescenceThicknessMinimum),o.iridescenceThicknessMaximum!==void 0&&i.setIridescenceThicknessMaximum(o.iridescenceThicknessMaximum),o.iridescenceTexture!==void 0){let c=o.iridescenceTexture,l=t.textures[a[c.index].source];i.setIridescenceTexture(l),t.setTextureInfo(i.getIridescenceTextureInfo(),c)}if(o.iridescenceThicknessTexture!==void 0){let c=o.iridescenceThicknessTexture,l=t.textures[a[c.index].source];i.setIridescenceThicknessTexture(l),t.setTextureInfo(i.getIridescenceThicknessTextureInfo(),c)}}}),this}prewrite(t){let e=t.jsonDoc;return this.document.getRoot().listMaterials().forEach(r=>{let a=r.getExtension(Gt);if(a){let s=t.materialIndexMap.get(r),n=e.json.materials[s],i=t.createPropertyDef(a);if(n.extensions=n.extensions||{},n.extensions[Gt]=i,a.getIridescenceFactor()>0&&(i.iridescenceFactor=a.getIridescenceFactor()),a.getIridescenceIOR()!==1.3&&(i.iridescenceIor=a.getIridescenceIOR()),a.getIridescenceThicknessMinimum()!==100&&(i.iridescenceThicknessMinimum=a.getIridescenceThicknessMinimum()),a.getIridescenceThicknessMaximum()!==400&&(i.iridescenceThicknessMaximum=a.getIridescenceThicknessMaximum()),a.getIridescenceTexture()){let o=a.getIridescenceTexture(),c=a.getIridescenceTextureInfo();i.iridescenceTexture=t.createTextureInfoDef(o,c)}if(a.getIridescenceThicknessTexture()){let o=a.getIridescenceThicknessTexture(),c=a.getIridescenceThicknessTextureInfo();i.iridescenceThicknessTexture=t.createTextureInfoDef(o,c)}}}),this}},{R:Fl,G:Ol,B:Pl,A:jl}=rt,b0=class extends X{static EXTENSION_NAME=Kt;init(){this.extensionName=Kt,this.propertyType="PBRSpecularGlossiness",this.parentTypes=[O.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{diffuseFactor:[1,1,1,1],diffuseTexture:null,diffuseTextureInfo:new oe(this.graph,"diffuseTextureInfo"),specularFactor:[1,1,1],glossinessFactor:1,specularGlossinessTexture:null,specularGlossinessTextureInfo:new oe(this.graph,"specularGlossinessTextureInfo")})}getDiffuseFactor(){return this.get("diffuseFactor")}setDiffuseFactor(t){return this.set("diffuseFactor",t)}getDiffuseTexture(){return this.getRef("diffuseTexture")}getDiffuseTextureInfo(){return this.getRef("diffuseTexture")?this.getRef("diffuseTextureInfo"):null}setDiffuseTexture(t){return this.setRef("diffuseTexture",t,{channels:Fl|Ol|Pl|jl,isColor:!0})}getSpecularFactor(){return this.get("specularFactor")}setSpecularFactor(t){return this.set("specularFactor",t)}getGlossinessFactor(){return this.get("glossinessFactor")}setGlossinessFactor(t){return this.set("glossinessFactor",t)}getSpecularGlossinessTexture(){return this.getRef("specularGlossinessTexture")}getSpecularGlossinessTextureInfo(){return this.getRef("specularGlossinessTexture")?this.getRef("specularGlossinessTextureInfo"):null}setSpecularGlossinessTexture(t){return this.setRef("specularGlossinessTexture",t,{channels:Fl|Ol|Pl|jl})}},p0=class extends re{static EXTENSION_NAME=Kt;extensionName=Kt;prereadTypes=[O.MESH];prewriteTypes=[O.MESH];createPBRSpecularGlossiness(){return new b0(this.document.getGraph())}read(t){return this}write(t){return this}preread(t){let e=t.jsonDoc,r=e.json.materials||[],a=e.json.textures||[];return r.forEach((s,n)=>{if(s.extensions&&s.extensions.KHR_materials_pbrSpecularGlossiness){let i=this.createPBRSpecularGlossiness();t.materials[n].setExtension(Kt,i);let o=s.extensions[Kt];if(o.extras&&i.setExtras(o.extras),o.diffuseFactor!==void 0&&i.setDiffuseFactor(o.diffuseFactor),o.specularFactor!==void 0&&i.setSpecularFactor(o.specularFactor),o.glossinessFactor!==void 0&&i.setGlossinessFactor(o.glossinessFactor),o.diffuseTexture!==void 0){let c=o.diffuseTexture,l=t.textures[a[c.index].source];i.setDiffuseTexture(l),t.setTextureInfo(i.getDiffuseTextureInfo(),c)}if(o.specularGlossinessTexture!==void 0){let c=o.specularGlossinessTexture,l=t.textures[a[c.index].source];i.setSpecularGlossinessTexture(l),t.setTextureInfo(i.getSpecularGlossinessTextureInfo(),c)}}}),this}prewrite(t){let e=t.jsonDoc;return this.document.getRoot().listMaterials().forEach(r=>{let a=r.getExtension(Kt);if(a){let s=t.materialIndexMap.get(r),n=e.json.materials[s],i=t.createPropertyDef(a);if(n.extensions=n.extensions||{},n.extensions[Kt]=i,i.diffuseFactor=a.getDiffuseFactor(),i.specularFactor=a.getSpecularFactor(),i.glossinessFactor=a.getGlossinessFactor(),a.getDiffuseTexture()){let o=a.getDiffuseTexture(),c=a.getDiffuseTextureInfo();i.diffuseTexture=t.createTextureInfoDef(o,c)}if(a.getSpecularGlossinessTexture()){let o=a.getSpecularGlossinessTexture(),c=a.getSpecularGlossinessTextureInfo();i.specularGlossinessTexture=t.createTextureInfoDef(o,c)}}}),this}},{R:g0,G:m0,B:y0,A:x0}=rt,v0=class extends X{static EXTENSION_NAME=Vt;init(){this.extensionName=Vt,this.propertyType="Sheen",this.parentTypes=[O.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{sheenColorFactor:[0,0,0],sheenColorTexture:null,sheenColorTextureInfo:new oe(this.graph,"sheenColorTextureInfo"),sheenRoughnessFactor:0,sheenRoughnessTexture:null,sheenRoughnessTextureInfo:new oe(this.graph,"sheenRoughnessTextureInfo")})}getSheenColorFactor(){return this.get("sheenColorFactor")}setSheenColorFactor(t){return this.set("sheenColorFactor",t)}getSheenColorTexture(){return this.getRef("sheenColorTexture")}getSheenColorTextureInfo(){return this.getRef("sheenColorTexture")?this.getRef("sheenColorTextureInfo"):null}setSheenColorTexture(t){return this.setRef("sheenColorTexture",t,{channels:g0|m0|y0,isColor:!0})}getSheenRoughnessFactor(){return this.get("sheenRoughnessFactor")}setSheenRoughnessFactor(t){return this.set("sheenRoughnessFactor",t)}getSheenRoughnessTexture(){return this.getRef("sheenRoughnessTexture")}getSheenRoughnessTextureInfo(){return this.getRef("sheenRoughnessTexture")?this.getRef("sheenRoughnessTextureInfo"):null}setSheenRoughnessTexture(t){return this.setRef("sheenRoughnessTexture",t,{channels:x0})}},w0=class extends re{static EXTENSION_NAME=Vt;extensionName=Vt;prereadTypes=[O.MESH];prewriteTypes=[O.MESH];createSheen(){return new v0(this.document.getGraph())}read(t){return this}write(t){return this}preread(t){let e=t.jsonDoc,r=e.json.materials||[],a=e.json.textures||[];return r.forEach((s,n)=>{if(s.extensions&&s.extensions.KHR_materials_sheen){let i=this.createSheen();t.materials[n].setExtension(Vt,i);let o=s.extensions[Vt];if(o.extras&&i.setExtras(o.extras),o.sheenColorFactor!==void 0&&i.setSheenColorFactor(o.sheenColorFactor),o.sheenRoughnessFactor!==void 0&&i.setSheenRoughnessFactor(o.sheenRoughnessFactor),o.sheenColorTexture!==void 0){let c=o.sheenColorTexture,l=t.textures[a[c.index].source];i.setSheenColorTexture(l),t.setTextureInfo(i.getSheenColorTextureInfo(),c)}if(o.sheenRoughnessTexture!==void 0){let c=o.sheenRoughnessTexture,l=t.textures[a[c.index].source];i.setSheenRoughnessTexture(l),t.setTextureInfo(i.getSheenRoughnessTextureInfo(),c)}}}),this}prewrite(t){let e=t.jsonDoc;return this.document.getRoot().listMaterials().forEach(r=>{let a=r.getExtension(Vt);if(a){let s=t.materialIndexMap.get(r),n=e.json.materials[s],i=t.createPropertyDef(a);if(n.extensions=n.extensions||{},n.extensions[Vt]=i,i.sheenColorFactor=a.getSheenColorFactor(),i.sheenRoughnessFactor=a.getSheenRoughnessFactor(),a.getSheenColorTexture()){let o=a.getSheenColorTexture(),c=a.getSheenColorTextureInfo();i.sheenColorTexture=t.createTextureInfoDef(o,c)}if(a.getSheenRoughnessTexture()){let o=a.getSheenRoughnessTexture(),c=a.getSheenRoughnessTextureInfo();i.sheenRoughnessTexture=t.createTextureInfoDef(o,c)}}}),this}},{R:M0,G:k0,B:E0,A:S0}=rt,T0=class extends X{static EXTENSION_NAME=Ht;init(){this.extensionName=Ht,this.propertyType="Specular",this.parentTypes=[O.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{specularFactor:1,specularTexture:null,specularTextureInfo:new oe(this.graph,"specularTextureInfo"),specularColorFactor:[1,1,1],specularColorTexture:null,specularColorTextureInfo:new oe(this.graph,"specularColorTextureInfo")})}getSpecularFactor(){return this.get("specularFactor")}setSpecularFactor(t){return this.set("specularFactor",t)}getSpecularColorFactor(){return this.get("specularColorFactor")}setSpecularColorFactor(t){return this.set("specularColorFactor",t)}getSpecularTexture(){return this.getRef("specularTexture")}getSpecularTextureInfo(){return this.getRef("specularTexture")?this.getRef("specularTextureInfo"):null}setSpecularTexture(t){return this.setRef("specularTexture",t,{channels:S0})}getSpecularColorTexture(){return this.getRef("specularColorTexture")}getSpecularColorTextureInfo(){return this.getRef("specularColorTexture")?this.getRef("specularColorTextureInfo"):null}setSpecularColorTexture(t){return this.setRef("specularColorTexture",t,{channels:M0|k0|E0,isColor:!0})}},A0=class extends re{static EXTENSION_NAME=Ht;extensionName=Ht;prereadTypes=[O.MESH];prewriteTypes=[O.MESH];createSpecular(){return new T0(this.document.getGraph())}read(t){return this}write(t){return this}preread(t){let e=t.jsonDoc,r=e.json.materials||[],a=e.json.textures||[];return r.forEach((s,n)=>{if(s.extensions&&s.extensions.KHR_materials_specular){let i=this.createSpecular();t.materials[n].setExtension(Ht,i);let o=s.extensions[Ht];if(o.extras&&i.setExtras(o.extras),o.specularFactor!==void 0&&i.setSpecularFactor(o.specularFactor),o.specularColorFactor!==void 0&&i.setSpecularColorFactor(o.specularColorFactor),o.specularTexture!==void 0){let c=o.specularTexture,l=t.textures[a[c.index].source];i.setSpecularTexture(l),t.setTextureInfo(i.getSpecularTextureInfo(),c)}if(o.specularColorTexture!==void 0){let c=o.specularColorTexture,l=t.textures[a[c.index].source];i.setSpecularColorTexture(l),t.setTextureInfo(i.getSpecularColorTextureInfo(),c)}}}),this}prewrite(t){let e=t.jsonDoc;return this.document.getRoot().listMaterials().forEach(r=>{let a=r.getExtension(Ht);if(a){let s=t.materialIndexMap.get(r),n=e.json.materials[s],i=t.createPropertyDef(a);if(n.extensions=n.extensions||{},n.extensions[Ht]=i,a.getSpecularFactor()!==1&&(i.specularFactor=a.getSpecularFactor()),le.eq(a.getSpecularColorFactor(),[1,1,1])||(i.specularColorFactor=a.getSpecularColorFactor()),a.getSpecularTexture()){let o=a.getSpecularTexture(),c=a.getSpecularTextureInfo();i.specularTexture=t.createTextureInfoDef(o,c)}if(a.getSpecularColorTexture()){let o=a.getSpecularColorTexture(),c=a.getSpecularColorTextureInfo();i.specularColorTexture=t.createTextureInfoDef(o,c)}}}),this}},{R:I0}=rt,_0=class extends X{static EXTENSION_NAME=qt;init(){this.extensionName=qt,this.propertyType="Transmission",this.parentTypes=[O.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{transmissionFactor:0,transmissionTexture:null,transmissionTextureInfo:new oe(this.graph,"transmissionTextureInfo")})}getTransmissionFactor(){return this.get("transmissionFactor")}setTransmissionFactor(t){return this.set("transmissionFactor",t)}getTransmissionTexture(){return this.getRef("transmissionTexture")}getTransmissionTextureInfo(){return this.getRef("transmissionTexture")?this.getRef("transmissionTextureInfo"):null}setTransmissionTexture(t){return this.setRef("transmissionTexture",t,{channels:I0})}},R0=class extends re{static EXTENSION_NAME=qt;extensionName=qt;prereadTypes=[O.MESH];prewriteTypes=[O.MESH];createTransmission(){return new _0(this.document.getGraph())}read(t){return this}write(t){return this}preread(t){let e=t.jsonDoc,r=e.json.materials||[],a=e.json.textures||[];return r.forEach((s,n)=>{if(s.extensions&&s.extensions.KHR_materials_transmission){let i=this.createTransmission();t.materials[n].setExtension(qt,i);let o=s.extensions[qt];if(o.extras&&i.setExtras(o.extras),o.transmissionFactor!==void 0&&i.setTransmissionFactor(o.transmissionFactor),o.transmissionTexture!==void 0){let c=o.transmissionTexture,l=t.textures[a[c.index].source];i.setTransmissionTexture(l),t.setTextureInfo(i.getTransmissionTextureInfo(),c)}}}),this}prewrite(t){let e=t.jsonDoc;return this.document.getRoot().listMaterials().forEach(r=>{let a=r.getExtension(qt);if(a){let s=t.materialIndexMap.get(r),n=e.json.materials[s],i=t.createPropertyDef(a);if(n.extensions=n.extensions||{},n.extensions[qt]=i,i.transmissionFactor=a.getTransmissionFactor(),a.getTransmissionTexture()){let o=a.getTransmissionTexture(),c=a.getTransmissionTextureInfo();i.transmissionTexture=t.createTextureInfoDef(o,c)}}}),this}},N0=class extends X{static EXTENSION_NAME=Mr;init(){this.extensionName=Mr,this.propertyType="Unlit",this.parentTypes=[O.MATERIAL]}},C0=class extends re{static EXTENSION_NAME=Mr;extensionName=Mr;prereadTypes=[O.MESH];prewriteTypes=[O.MESH];createUnlit(){return new N0(this.document.getGraph())}read(t){return this}write(t){return this}preread(t){return(t.jsonDoc.json.materials||[]).forEach((e,r)=>{e.extensions&&e.extensions.KHR_materials_unlit&&t.materials[r].setExtension(Mr,this.createUnlit())}),this}prewrite(t){let e=t.jsonDoc;return this.document.getRoot().listMaterials().forEach(r=>{if(r.getExtension("KHR_materials_unlit")){let a=t.materialIndexMap.get(r),s=e.json.materials[a];s.extensions=s.extensions||{},s.extensions[Mr]={}}}),this}},B0=class extends X{static EXTENSION_NAME=Ue;init(){this.extensionName=Ue,this.propertyType="Mapping",this.parentTypes=["MappingList"]}getDefaults(){return Object.assign(super.getDefaults(),{material:null,variants:new ne})}getMaterial(){return this.getRef("material")}setMaterial(t){return this.setRef("material",t)}addVariant(t){return this.addRef("variants",t)}removeVariant(t){return this.removeRef("variants",t)}listVariants(){return this.listRefs("variants")}},F0=class extends X{static EXTENSION_NAME=Ue;init(){this.extensionName=Ue,this.propertyType="MappingList",this.parentTypes=[O.PRIMITIVE]}getDefaults(){return Object.assign(super.getDefaults(),{mappings:new ne})}addMapping(t){return this.addRef("mappings",t)}removeMapping(t){return this.removeRef("mappings",t)}listMappings(){return this.listRefs("mappings")}},Ll=class extends X{static EXTENSION_NAME=Ue;init(){this.extensionName=Ue,this.propertyType="Variant",this.parentTypes=["MappingList"]}},O0=class extends re{extensionName=Ue;static EXTENSION_NAME=Ue;createMappingList(){return new F0(this.document.getGraph())}createVariant(t=""){return new Ll(this.document.getGraph(),t)}createMapping(){return new B0(this.document.getGraph())}listVariants(){return Array.from(this.properties).filter(t=>t instanceof Ll)}read(t){let e=t.jsonDoc;if(!e.json.extensions||!e.json.extensions.KHR_materials_variants)return this;let r=(e.json.extensions.KHR_materials_variants.variants||[]).map(a=>this.createVariant().setName(a.name||""));return(e.json.meshes||[]).forEach((a,s)=>{let n=t.meshes[s];(a.primitives||[]).forEach((i,o)=>{if(!i.extensions||!i.extensions.KHR_materials_variants)return;let c=this.createMappingList(),l=i.extensions[Ue];for(let f of l.mappings){let u=this.createMapping();f.material!==void 0&&u.setMaterial(t.materials[f.material]);for(let p of f.variants||[])u.addVariant(r[p]);c.addMapping(u)}n.listPrimitives()[o].setExtension(Ue,c)})}),this}write(t){let e=t.jsonDoc,r=this.listVariants();if(!r.length)return this;let a=[],s=new Map;for(let n of r)s.set(n,a.length),a.push(t.createPropertyDef(n));for(let n of this.document.getRoot().listMeshes()){let i=t.meshIndexMap.get(n);n.listPrimitives().forEach((o,c)=>{let l=o.getExtension(Ue);if(!l)return;let f=t.jsonDoc.json.meshes[i].primitives[c],u=l.listMappings().map(p=>{let b=t.createPropertyDef(p),h=p.getMaterial();return h&&(b.material=t.materialIndexMap.get(h)),b.variants=p.listVariants().map(d=>s.get(d)),b});f.extensions=f.extensions||{},f.extensions[Ue]={mappings:u}})}return e.json.extensions=e.json.extensions||{},e.json.extensions[Ue]={variants:a},this}},{G:P0}=rt,j0=class extends X{static EXTENSION_NAME=Wt;init(){this.extensionName=Wt,this.propertyType="Volume",this.parentTypes=[O.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{thicknessFactor:0,thicknessTexture:null,thicknessTextureInfo:new oe(this.graph,"thicknessTexture"),attenuationDistance:1/0,attenuationColor:[1,1,1]})}getThicknessFactor(){return this.get("thicknessFactor")}setThicknessFactor(t){return this.set("thicknessFactor",t)}getThicknessTexture(){return this.getRef("thicknessTexture")}getThicknessTextureInfo(){return this.getRef("thicknessTexture")?this.getRef("thicknessTextureInfo"):null}setThicknessTexture(t){return this.setRef("thicknessTexture",t,{channels:P0})}getAttenuationDistance(){return this.get("attenuationDistance")}setAttenuationDistance(t){return this.set("attenuationDistance",t)}getAttenuationColor(){return this.get("attenuationColor")}setAttenuationColor(t){return this.set("attenuationColor",t)}},L0=class extends re{static EXTENSION_NAME=Wt;extensionName=Wt;prereadTypes=[O.MESH];prewriteTypes=[O.MESH];createVolume(){return new j0(this.document.getGraph())}read(t){return this}write(t){return this}preread(t){let e=t.jsonDoc,r=e.json.materials||[],a=e.json.textures||[];return r.forEach((s,n)=>{if(s.extensions&&s.extensions.KHR_materials_volume){let i=this.createVolume();t.materials[n].setExtension(Wt,i);let o=s.extensions[Wt];if(o.extras&&i.setExtras(o.extras),o.thicknessFactor!==void 0&&i.setThicknessFactor(o.thicknessFactor),o.attenuationDistance!==void 0&&i.setAttenuationDistance(o.attenuationDistance),o.attenuationColor!==void 0&&i.setAttenuationColor(o.attenuationColor),o.thicknessTexture!==void 0){let c=o.thicknessTexture,l=t.textures[a[c.index].source];i.setThicknessTexture(l),t.setTextureInfo(i.getThicknessTextureInfo(),c)}}}),this}prewrite(t){let e=t.jsonDoc;return this.document.getRoot().listMaterials().forEach(r=>{let a=r.getExtension(Wt);if(a){let s=t.materialIndexMap.get(r),n=e.json.materials[s],i=t.createPropertyDef(a);if(n.extensions=n.extensions||{},n.extensions[Wt]=i,a.getThicknessFactor()>0&&(i.thicknessFactor=a.getThicknessFactor()),Number.isFinite(a.getAttenuationDistance())&&(i.attenuationDistance=a.getAttenuationDistance()),le.eq(a.getAttenuationColor(),[1,1,1])||(i.attenuationColor=a.getAttenuationColor()),a.getThicknessTexture()){let o=a.getThicknessTexture(),c=a.getThicknessTextureInfo();i.thicknessTexture=t.createTextureInfoDef(o,c)}}}),this}},D0=class extends re{extensionName=wl;static EXTENSION_NAME=wl;read(t){return this}write(t){return this}},wi=class extends re{extensionName=Ml;static EXTENSION_NAME=Ml;read(t){return this}write(t){return this}},U0=class extends X{static EXTENSION_NAME=Xt;init(){this.extensionName=Xt,this.propertyType="Visibility",this.parentTypes=[O.NODE]}getDefaults(){return Object.assign(super.getDefaults(),{visible:!0})}getVisible(){return this.get("visible")}setVisible(t){return this.set("visible",t)}},z0=class extends re{static EXTENSION_NAME=Xt;extensionName=Xt;createVisibility(){return new U0(this.document.getGraph())}read(t){return(t.jsonDoc.json.nodes||[]).forEach((e,r)=>{if(e.extensions&&e.extensions.KHR_node_visibility){let a=this.createVisibility();t.nodes[r].setExtension(Xt,a);let s=e.extensions[Xt];s.visible!==void 0&&a.setVisible(s.visible)}}),this}write(t){let e=t.jsonDoc;for(let r of this.document.getRoot().listNodes()){let a=r.getExtension(Xt);if(!a)continue;let s=t.nodeIndexMap.get(r),n=e.json.nodes[s];n.extensions=n.extensions||{},n.extensions[Xt]={visible:a.getVisible()}}return this}};function G0(t){return t.vkFormat>0&&t.vkFormat<=123}function Dl(t){let e=t.vkFormat===1000066e3&&t.dataFormatDescriptor[0].colorModel===167;return t.vkFormat===0||e}var K0=class{match(t){return t[0]===171&&t[1]===75&&t[2]===84&&t[3]===88&&t[4]===32&&t[5]===50&&t[6]===48&&t[7]===187&&t[8]===13&&t[9]===10&&t[10]===26&&t[11]===10}getSize(t){let e=hs(t);return[e.pixelWidth,e.pixelHeight]}getChannels(t){let e=hs(t),r=e.dataFormatDescriptor[0];if(G0(e))return r.samples.length;if(Dl(e))switch(r.colorModel){case 163:return r.samples.length===2&&(r.samples[1].channelType&15)===15?4:3;case 166:return(r.samples[0].channelType&15)===3?4:3;default:throw new Error(`Unexpected KTX2 colorModel, "${r.colorModel}".`)}throw new Error(`Unexpected KTX2 vkFormat, "${e.vkFormat}".`)}getVRAMByteLength(t){let e=hs(t),r=0;if(Dl(e)){let a=this.getChannels(t)>3;for(let s=0;s<e.levels.length;s++){let n=e.levels[s];if(n.uncompressedByteLength)r+=n.uncompressedByteLength;else{let i=Math.max(1,Math.floor(e.pixelWidth/Math.pow(2,s))),o=Math.max(1,Math.floor(e.pixelHeight/Math.pow(2,s))),c=a?16:8;r+=i/4*(o/4)*c}}}else for(let a of e.levels)e.supercompressionScheme===0?r+=a.levelData.byteLength:r+=a.uncompressedByteLength;return r}},V0=class extends re{static EXTENSION_NAME=gs;extensionName=gs;prereadTypes=[O.TEXTURE];static register(){lt.registerFormat("image/ktx2",new K0)}preread(t){return t.jsonDoc.json.textures&&t.jsonDoc.json.textures.forEach(e=>{e.extensions&&e.extensions.KHR_texture_basisu&&(e.source=e.extensions[gs].source)}),this}read(t){return this}write(t){let e=t.jsonDoc;return this.document.getRoot().listTextures().forEach(r=>{if(r.getMimeType()==="image/ktx2"){let a=t.imageIndexMap.get(r);e.json.textures.forEach(s=>{s.source===a&&(s.extensions=s.extensions||{},s.extensions[gs]={source:s.source},delete s.source)})}}),this}},H0=class extends X{static EXTENSION_NAME=$t;init(){this.extensionName=$t,this.propertyType="Transform",this.parentTypes=[O.TEXTURE_INFO]}getDefaults(){return Object.assign(super.getDefaults(),{offset:[0,0],rotation:0,scale:[1,1],texCoord:null})}getOffset(){return this.get("offset")}setOffset(t){return this.set("offset",t)}getRotation(){return this.get("rotation")}setRotation(t){return this.set("rotation",t)}getScale(){return this.get("scale")}setScale(t){return this.set("scale",t)}getTexCoord(){return this.get("texCoord")}setTexCoord(t){return this.set("texCoord",t)}},q0=class extends re{extensionName=$t;static EXTENSION_NAME=$t;createTransform(){return new H0(this.document.getGraph())}read(t){for(let[e,r]of Array.from(t.textureInfos.entries())){if(!r.extensions||!r.extensions.KHR_texture_transform)continue;let a=this.createTransform(),s=r.extensions[$t];s.offset!==void 0&&a.setOffset(s.offset),s.rotation!==void 0&&a.setRotation(s.rotation),s.scale!==void 0&&a.setScale(s.scale),s.texCoord!==void 0&&a.setTexCoord(s.texCoord),e.setExtension($t,a)}return this}write(t){let e=Array.from(t.textureInfoDefMap.entries());for(let[r,a]of e){let s=r.getExtension($t);if(!s)continue;a.extensions=a.extensions||{};let n={},i=le.eq;i(s.getOffset(),[0,0])||(n.offset=s.getOffset()),s.getRotation()!==0&&(n.rotation=s.getRotation()),i(s.getScale(),[1,1])||(n.scale=s.getScale()),s.getTexCoord()!=null&&(n.texCoord=s.getTexCoord()),a.extensions[$t]=n}return this}},W0=[O.ROOT,O.SCENE,O.NODE,O.MESH,O.MATERIAL,O.TEXTURE,O.ANIMATION],X0=class extends X{static EXTENSION_NAME=at;init(){this.extensionName=at,this.propertyType="Packet",this.parentTypes=W0}getDefaults(){return Object.assign(super.getDefaults(),{context:{},properties:{}})}getContext(){return this.get("context")}setContext(t){return this.set("context",{...t})}listProperties(){return Object.keys(this.get("properties"))}getProperty(t){let e=this.get("properties");return t in e?e[t]:null}setProperty(t,e){this._assertContext(t);let r={...this.get("properties")};return e?r[t]=e:delete r[t],this.set("properties",r)}toJSONLD(){return{"@context":pi(this.get("context")),...pi(this.get("properties"))}}fromJSONLD(t){t=pi(t);let e=t["@context"];return e&&this.set("context",e),delete t["@context"],this.set("properties",t)}_assertContext(t){if(!(t.split(":")[0]in this.get("context")))throw new Error(`${at}: Missing context for term, "${t}".`)}};function pi(t){return JSON.parse(JSON.stringify(t))}var $0=class extends re{extensionName=at;static EXTENSION_NAME=at;createPacket(){return new X0(this.document.getGraph())}listPackets(){return Array.from(this.properties)}read(t){let e=t.jsonDoc.json.extensions?.[at];if(!e||!e.packets)return this;let r=t.jsonDoc.json,a=this.document.getRoot(),s=e.packets.map(o=>this.createPacket().fromJSONLD(o)),n=[[r.asset],r.scenes,r.nodes,r.meshes,r.materials,r.images,r.animations],i=[[a],a.listScenes(),a.listNodes(),a.listMeshes(),a.listMaterials(),a.listTextures(),a.listAnimations()];for(let o=0;o<n.length;o++){let c=n[o]||[];for(let l=0;l<c.length;l++){let f=c[l];if(f.extensions&&f.extensions.KHR_xmp_json_ld){let u=f.extensions[at];i[o][l].setExtension(at,s[u.packet])}}}return this}write(t){let{json:e}=t.jsonDoc,r=[];for(let a of this.properties){r.push(a.toJSONLD());for(let s of a.listParents()){let n;switch(s.propertyType){case O.ROOT:n=e.asset;break;case O.SCENE:n=e.scenes[t.sceneIndexMap.get(s)];break;case O.NODE:n=e.nodes[t.nodeIndexMap.get(s)];break;case O.MESH:n=e.meshes[t.meshIndexMap.get(s)];break;case O.MATERIAL:n=e.materials[t.materialIndexMap.get(s)];break;case O.TEXTURE:n=e.images[t.imageIndexMap.get(s)];break;case O.ANIMATION:n=e.animations[t.animationIndexMap.get(s)];break;default:n=null,this.document.getLogger().warn(`[${at}]: Unsupported parent property, "${s.propertyType}"`);break}n&&(n.extensions=n.extensions||{},n.extensions[at]={packet:r.length-1})}}return r.length>0&&(e.extensions=e.extensions||{},e.extensions[at]={packets:r}),this}},Y0=[Rm,Nm,zm,Km,Xm,Jm,a0,n0,o0,l0,h0,p0,A0,w0,R0,C0,O0,L0,D0,wi,z0,V0,q0,$0],sE=[_g,xi,vi,em,Am,_m,...Y0];var kS=(function(){var t="b9H79Tebbbe9ok9Geueu9Geub9Gbb9Gruuuuuuueu9Gvuuuuueu9Gduueu9Gluuuueu9Gvuuuuub9Gouuuuuub9Gluuuub9Giuuueui8AYdilveoveovrrwrrDDoDrbqqbelve9Weiiviebeoweuec;G:Qdkr:nlAo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bb8F9TW79O9V9Wt9FW9U9J9V9KW9wWVtW949c919M9MWV9mW4W2be8A9TW79O9V9Wt9FW9U9J9V9KW9wWVtW949c919M9MWVbd8F9TW79O9V9Wt9FW9U9J9V9KW9wWVtW949c919M9MWV9c9V919U9KbiE9TW79O9V9Wt9FW9U9J9V9KW9wWVtW949wWV79P9V9UblY9TW79O9V9Wt9FW9U9J9V9KW69U9KW949c919M9MWVbv8E9TW79O9V9Wt9FW9U9J9V9KW69U9KW949c919M9MWV9c9V919U9Kbo8A9TW79O9V9Wt9FW9U9J9V9KW69U9KW949wWV79P9V9UbrE9TW79O9V9Wt9FW9U9J9V9KW69U9KW949tWG91W9U9JWbwa9TW79O9V9Wt9FW9U9J9V9KW69U9KW949tWG91W9U9JW9c9V919U9KbDL9TW79O9V9Wt9FW9U9J9V9KWS9P2tWV9p9JtbqK9TW79O9V9Wt9FW9U9J9V9KWS9P2tWV9r919HtbkL9TW79O9V9Wt9FW9U9J9V9KWS9P2tWVT949WbxE9TW79O9V9Wt9F9V9Wt9P9T9P96W9wWVtW94J9H9J9OWbsa9TW79O9V9Wt9F9V9Wt9P9T9P96W9wWVtW94J9H9J9OW9ttV9P9Wbza9TW79O9V9Wt9F9V9Wt9P9T9P96W9wWVtW94SWt9J9O9sW9T9H9WbHK9TW79O9V9Wt9F79W9Ht9P9H29t9VVt9sW9T9H9WbOl79IV9RbCDwebcekdKLqN9OYdbk:Bhdhud9:8Jjjjjbc;qw9Rgr8KjjjjbcbhwdnaeTmbabcbyd;C:kjjbaoaocb9iEgDc:GeV86bbarc;adfcbcjdz:wjjjb8AdnaiTmbarc;adfadalz:vjjjb8Akarc;abfalfcbcbcjdal9RalcFe0Ez:wjjjb8Aarc;abfarc;adfalz:vjjjb8AarcUf9cb83ibarc8Wf9cb83ibarcyf9cb83ibarcaf9cb83ibarcKf9cb83ibarczf9cb83ibar9cb83iwar9cb83ibcj;abal9Uc;WFbGcjdalca0Ehqdnaicd6mbavcd9imbaDTmbadcefhkaqci2gxal2hmarc;alfclfhParc;qlfceVhsarc;qofclVhzarc;qofcKfhHarc;qofczfhOcbhAincdhCcbhodnavci6mbaH9cb83ibaO9cb83ibar9cb83i;yoar9cb83i;qoadaAfgoybbhXcbhQincbhwcbhLdninaoalfhKaoybbgYaX7aLVhLawcP0meaKhoaYhXawcefgwaQfai6mbkkcbhXarc;qofhwincwh8AcwhEdnaLaX93gocFeGg3cs0mbclhEa3ci0mba3cb9hcethEkdnaocw4cFeGg3cs0mbclh8Aa3ci0mba3cb9hceth8Aka8AaEfh3awydbh5cwh8AcwhEdnaocz4cFeGg8Ecs0mbclhEa8Eci0mba8Ecb9hcethEka3a5fh3dnaocFFFFb0mbclh8AaocFFF8F0mbaocFFFr0ceth8Akawa3aEfa8AfBdbawclfhwaXcefgXcw9hmbkaKhoaYhXaQczfgQai6mbkcbhocehwazhLinawaoaLydbarc;qofaocdtfydb6EhoaLclfhLawcefgwcw9hmbkcihCkcbh3arc;qlfcbcjdz:wjjjb8Aarc;alfcwfcbBdbar9cb83i;alaoclth8Fadhaaqhhakh5inarc;qlfadcba3cufgoaoa30Eal2falz:vjjjb8Aaiahaiah6Ehgdnaqaia39Ra3aqfai6EgYcsfc9WGgoaY9nmbarc;qofaYfcbaoaY9Rz:wjjjb8Akada3al2fh8Jcbh8Kina8Ka8FVcl4hQarc;alfa8Kcdtfh8LaAh8Mcbh8Nina8NaAfhwdndndndndndna8KPldebidkasa8Mc98GgLfhoa5aLfh8Aarc;qlfawc98GgLfRbbhXcwhwinaoRbbawtaXVhXaocefhoawcwfgwca9hmbkaYTmla8Ncith8Ea8JaLfhEcbhKinaERbbhLcwhoa8AhwinawRbbaotaLVhLawcefhwaocwfgoca9hmbkarc;qofaKfaLaX7aQ93a8E486bba8Aalfh8AaEalfhEaLhXaKcefgKaY9hmbxlkkaYTmia8Mc9:Ghoa8NcitcwGhEarc;qlfawceVfRbbcwtarc;qlfawc9:GfRbbVhLarc;qofhwaghXinawa5aofRbbcwtaaaofRbbVg8AaL9RgLcetaLcztcz91cs47cFFiGaE486bbaoalfhoawcefhwa8AhLa3aXcufgX9hmbxikkaYTmda8Jawfhoarc;qlfawfRbbhLarc;qofhwaghXinawaoRbbg8AaL9RgLcetaLcKtcK91cr4786bbawcefhwaoalfhoa8AhLa3aXcufgX9hmbxdkkaYTmeka8LydbhEcbhKarc;qofhoincdhLcbhwinaLaoawfRbbcb9hfhLawcefgwcz9hmbkclhXcbhwinaXaoawfRbbcd0fhXawcefgwcz9hmbkcwh8Acbhwina8AaoawfRbbcP0fh8Aawcefgwcz9hmbkaLaXaLaX6Egwa8Aawa8A6Egwczawcz6EaEfhEaoczfhoaKczfgKaY6mbka8LaEBdbka8Mcefh8Ma8Ncefg8Ncl9hmbka8Kcefg8KaC9hmbkaaamfhaahaxfhha5amfh5a3axfg3ai6mbkcbhocehwaPhLinawaoaLydbarc;alfaocdtfydb6EhoaLclfhLawcefgXhwaCaX9hmbkaraAcd4fa8FcdVaoaocdSE86bbaAclfgAal6mbkkabaefh8Kabcefhoalcd4gecbaDEhkadcefhOarc;abfceVhHcbhmdndninaiam9nmearc;qofcbcjdz:wjjjb8Aa8Kao9Rak6mdadamal2gwfhxcbh8JaOawfhzaocbakz:wjjjbghakfh5aqaiam9Ramaqfai6Egscsfgocl4cifcd4hCaoc9WGg8LThPindndndndndndndndndndnaDTmbara8Jcd4fRbbgLciGPlbedlbkasTmdaxa8Jfhoarc;abfa8JfRbbhLarc;qofhwashXinawaoRbbg8AaL9RgLcetaLcKtcK91cr4786bbawcefhwaoalfhoa8AhLaXcufgXmbxikkasTmia8JcitcwGhEarc;abfa8JceVfRbbcwtarc;abfa8Jc9:GgofRbbVhLaxaofhoarc;qofhwashXinawao8Vbbg8AaL9RgLcetaLcztcz91cs47cFFiGaE486bbawcefhwaoalfhoa8AhLaXcufgXmbxdkkaHa8Jc98GgEfhoazaEfh8Aarc;abfaEfRbbhXcwhwinaoRbbawtaXVhXaocefhoawcwfgwca9hmbkasTmbaLcl4hYa8JcitcKGh3axaEfhEcbhKinaERbbhLcwhoa8AhwinawRbbaotaLVhLawcefhwaocwfgoca9hmbkarc;qofaKfaLaX7aY93a3486bba8Aalfh8AaEalfhEaLhXaKcefgKas9hmbkkaDmbcbhoxlka8LTmbcbhodninarc;qofaofgwcwf8Pibaw8Pib:e9qTmeaoczfgoa8L9pmdxbkkdnavmbcehoxikcbhEaChKaChYinarc;qofaEfgocwf8Pibhyao8Pibh8PcdhLcbhwinaLaoawfRbbcb9hfhLawcefgwcz9hmbkclhXcbhwinaXaoawfRbbcd0fhXawcefgwcz9hmbkcwh8Acbhwina8AaoawfRbbcP0fh8Aawcefgwcz9hmbkaLaXaLaX6Egoa8Aaoa8A6Egoczaocz6EaYfhYaocucbaya8P:e9cb9sEgwaoaw6EaKfhKaEczfgEa8L9pmdxbkkaha8Jcd4fgoaoRbbcda8JcetcoGtV86bbxikdnaKas6mbaYas6mbaha8Jcd4fgoaoRbbcia8JcetcoGtV86bba8Ka59Ras6mra5arc;qofasz:vjjjbasfh5xikaKaY9phokaha8Jcd4fgwawRbbaoa8JcetcoGtV86bbka8Ka59RaC6mla5cbaCz:wjjjbgAaCfhYdndna8LmbaPhoxekdna8KaY9RcK9pmbaPhoxekaocdtc:q1jjbfcj1jjbaDEg5ydxggcetc;:FFFeGh8Fcuh3cuagtcu7cFeGhacbh8Marc;qofhLinarc;qofa8MfhQczhEdndndnagPDbeeeeeeedekcucbaQcwf8PibaQ8Pib:e9cb9sEhExekcbhoa8FhEinaEaaaLaofRbb9nfhEaocefgocz9hmbkkcih8Ecbh8Ainczhwdndndna5a8AcdtfydbgKPDbeeeeeeedekcucbaQcwf8PibaQ8Pib:e9cb9sEhwxekaKcetc;:FFFeGhwcuaKtcu7cFeGhXcbhoinawaXaLaofRbb9nfhwaocefgocz9hmbkkdndnawaE6mbaKa39hmeawaE9hmea5a8EcdtfydbcwSmeka8Ah8EawhEka8Acefg8Aci9hmbkaAa8Mco4fgoaoRbba8Ea8Mci4coGtV86bbdndndna5a8Ecdtfydbg3PDdbbbbbbbebkdncwa39Tg8ETmbcua3tcu7hwdndna3ceSmbcbh8NaLhQinaQhoa8Eh8AcbhXinaoRbbgEawcFeGgKaEaK6EaXa3tVhXaocefhoa8Acufg8AmbkaYaX86bbaQa8EfhQaYcefhYa8Na8Efg8Ncz6mbxdkkcbh8NaLhQinaQhoa8Eh8AcbhXinaoRbbgEawcFeGgKaEaK6EaXcetVhXaocefhoa8Acufg8AmbkaYaX:T9cFe:d9c:c:qj:bw9:9c:q;c1:I1e:d9c:b:c:e1z9:9ca188bbaQa8EfhQaYcefhYa8Na8Efg8Ncz6mbkkcbhoinaYaLaofRbbgX86bbaYaXawcFeG9pfhYaocefgocz9hmbxikkdna3ceSmbinaYcb86bbaYcefhYxbkkinaYcb86bbaYcefhYxbkkaYaQ8Pbb83bbaYcwfaQcwf8Pbb83bbaYczfhYka8Mczfg8Ma8L9pgomeaLczfhLa8KaY9RcK9pmbkkaoTmlaYh5aYTmlka8Jcefg8Jal9hmbkarc;abfaxascufal2falz:vjjjb8Aasamfhma5hoa5mbkcbhwxdkdna8Kao9RakalfgwcKcaaDEgLawaL0EgX9pmbcbhwxdkdnawaL9pmbaocbaXaw9Rgwz:wjjjbawfhokaoarc;adfalz:vjjjbalfhodnaDTmbaoaraez:vjjjbaefhokaoab9Rhwxekcbhwkarc;qwf8Kjjjjbawk5babaeadaialcdcbyd;C:kjjbz:bjjjbk9reduaecd4gdaefgicaaica0Eabcj;abae9Uc;WFbGcjdaeca0Egifcufai9Uae2aiadfaicl4cifcd4f2fcefkmbcbabBd;C:kjjbk:Ese5u8Jjjjjbc;ae9Rgl8Kjjjjbcbhvdnaici9UgocHfae0mbabcbyd;m:kjjbgrc;GeV86bbalc;abfcFecjez:wjjjb8AalcUfgw9cu83ibalc8WfgD9cu83ibalcyfgq9cu83ibalcafgk9cu83ibalcKfgx9cu83ibalczfgm9cu83ibal9cu83iwal9cu83ibabaefc9WfhPabcefgsaofhednaiTmbcmcsarcb9kgzEhHcbhOcbhAcbhCcbhXcbhQindnaeaP9nmbcbhvxikaQcufhvadaCcdtfgLydbhKaLcwfydbhYaLclfydbh8AcbhEdndndninalc;abfavcsGcitfgoydlh3dndndnaoydbgoaK9hmba3a8ASmekdnaoa8A9hmba3aY9hmbaEcefhExekaoaY9hmea3aK9hmeaEcdfhEkaEc870mdaXcufhvaLaEciGcx2goc;i1jjbfydbcdtfydbh3aLaoc;e1jjbfydbcdtfydbh8AaLaoc;a1jjbfydbcdtfydbhKcbhodnindnalavcsGcdtfydba39hmbaohYxdkcuhYavcufhvaocefgocz9hmbkkaOa3aOSgvaYce9iaYaH9oVgoGfhOdndndncbcsavEaYaoEgvcs9hmbarce9imba3a3aAa3cefaASgvEgAcefSmecmcsavEhvkasavaEcdtc;WeGV86bbavcs9hmea3aA9Rgvcetavc8F917hvinaeavcFb0crtavcFbGV86bbaecefheavcje6hoavcr4hvaoTmbka3hAxvkcPhvasaEcdtcPV86bba3hAkavTmiavaH9omicdhocehEaQhYxlkavcufhvaEclfgEc;ab9hmbkkdnaLceaYaOSceta8AaOSEcx2gvc;a1jjbfydbcdtfydbgKTaLavc;e1jjbfydbcdtfydbg8AceSGaLavc;i1jjbfydbcdtfydbg3cdSGaOcb9hGazGg5ce9hmbaw9cu83ibaD9cu83ibaq9cu83ibak9cu83ibax9cu83ibam9cu83ibal9cu83iwal9cu83ibcbhOkcbhEaXcufgvhodnindnalaocsGcdtfydba8A9hmbaEhYxdkcuhYaocufhoaEcefgEcz9hmbkkcbhodnindnalavcsGcdtfydba39hmbaohExdkcuhEavcufhvaocefgocz9hmbkkaOaKaOSg8EfhLdndnaYcm0mbaYcefhYxekcbcsa8AaLSgvEhYaLavfhLkdndnaEcm0mbaEcefhExekcbcsa3aLSgvEhEaLavfhLkc9:cua8EEh8FcbhvaEaYcltVgacFeGhodndndninavc:W1jjbfRbbaoSmeavcefgvcz9hmbxdkka5aKaO9havcm0VVmbasavc;WeV86bbxekasa8F86bbaeaa86bbaecefhekdna8EmbaKaA9Rgvcetavc8F917hvinaeavcFb0gocrtavcFbGV86bbavcr4hvaecefheaombkaKhAkdnaYcs9hmba8AaA9Rgvcetavc8F917hvinaeavcFb0gocrtavcFbGV86bbavcr4hvaecefheaombka8AhAkdnaEcs9hmba3aA9Rgvcetavc8F917hvinaeavcFb0gocrtavcFbGV86bbavcr4hvaecefheaombka3hAkalaXcdtfaKBdbaXcefcsGhvdndnaYPzbeeeeeeeeeeeeeebekalavcdtfa8ABdbaXcdfcsGhvkdndnaEPzbeeeeeeeeeeeeeebekalavcdtfa3BdbavcefcsGhvkcihoalc;abfaQcitfgEaKBdlaEa8ABdbaQcefcsGhYcdhEavhXaLhOxekcdhoalaXcdtfa3BdbcehEaXcefcsGhXaQhYkalc;abfaYcitfgva8ABdlava3Bdbalc;abfaQaEfcsGcitfgva3BdlavaKBdbascefhsaQaofcsGhQaCcifgCai6mbkkdnaeaP9nmbcbhvxekcbhvinaeavfavc:W1jjbfRbb86bbavcefgvcz9hmbkaeab9Ravfhvkalc;aef8KjjjjbavkZeeucbhddninadcefgdc8F0meceadtae6mbkkadcrfcFeGcr9Uci2cdfabci9U2cHfkmbcbabBd;m:kjjbk:Adewu8Jjjjjbcz9Rhlcbhvdnaicvfae0mbcbhvabcbRb;m:kjjbc;qeV86bbal9cb83iwabcefhoabaefc98fhrdnaiTmbcbhwcbhDindnaoar6mbcbskadaDcdtfydbgqalcwfawaqav9Rgvavc8F91gv7av9Rc507gwcdtfgkydb9Rgvc8E91c9:Gavcdt7awVhvinaoavcFb0gecrtavcFbGV86bbavcr4hvaocefhoaembkakaqBdbaqhvaDcefgDai9hmbkkdnaoar9nmbcbskaocbBbbaoab9RclfhvkavkBeeucbhddninadcefgdc8F0meceadtae6mbkkadcwfcFeGcr9Uab2cvfk:bvli99dui99ludnaeTmbcuadcetcuftcu7:Zhvdndncuaicuftcu7:ZgoJbbbZMgr:lJbbb9p9DTmbar:Ohwxekcjjjj94hwkcbhicbhDinalclfIdbgrJbbbbJbbjZalIdbgq:lar:lMalcwfIdbgk:lMgr:varJbbbb9BEgrNhxaqarNhrdndnakJbbbb9GTmbaxhqxekJbbjZar:l:tgqaq:maxJbbbb9GEhqJbbjZax:l:tgxax:marJbbbb9GEhrkdndnalcxfIdbgxJbbj:;axJbbj:;9GEgkJbbjZakJbbjZ9FEavNJbbbZJbbb:;axJbbbb9GEMgx:lJbbb9p9DTmbax:Ohmxekcjjjj94hmkdndnaqJbbj:;aqJbbj:;9GEgxJbbjZaxJbbjZ9FEaoNJbbbZJbbb:;aqJbbbb9GEMgq:lJbbb9p9DTmbaq:OhPxekcjjjj94hPkdndnarJbbj:;arJbbj:;9GEgqJbbjZaqJbbjZ9FEaoNJbbbZJbbb:;arJbbbb9GEMgr:lJbbb9p9DTmbar:Ohsxekcjjjj94hskdndnadcl9hmbabaifgzas86bbazcifam86bbazcdfaw86bbazcefaP86bbxekabaDfgzas87ebazcofam87ebazclfaw87ebazcdfaP87ebkalczfhlaiclfhiaDcwfhDaecufgembkkk;hlld99eud99eudnaeTmbdndncuaicuftcu7:ZgvJbbbZMgo:lJbbb9p9DTmbao:Ohixekcjjjj94hikaic;8FiGhrinabcofcicdalclfIdb:lalIdb:l9EgialcwfIdb:lalaicdtfIdb:l9EEgialcxfIdb:lalaicdtfIdb:l9EEgiarV87ebdndnJbbj:;JbbjZalaicdtfIdbJbbbb9DEgoalaicd7cdtfIdbJ;Zl:1ZNNgwJbbj:;awJbbj:;9GEgDJbbjZaDJbbjZ9FEavNJbbbZJbbb:;awJbbbb9GEMgw:lJbbb9p9DTmbaw:Ohqxekcjjjj94hqkabcdfaq87ebdndnalaicefciGcdtfIdbJ;Zl:1ZNaoNgwJbbj:;awJbbj:;9GEgDJbbjZaDJbbjZ9FEavNJbbbZJbbb:;awJbbbb9GEMgw:lJbbb9p9DTmbaw:Ohqxekcjjjj94hqkabaq87ebdndnaoalaicufciGcdtfIdbJ;Zl:1ZNNgoJbbj:;aoJbbj:;9GEgwJbbjZawJbbjZ9FEavNJbbbZJbbb:;aoJbbbb9GEMgo:lJbbb9p9DTmbao:Ohixekcjjjj94hikabclfai87ebabcwfhbalczfhlaecufgembkkk;3viDue99eu8Jjjjjbcjd9Rgo8Kjjjjbadcd4hrdndndndnavcd9hmbadcl6meaohwarhDinawc:CuBdbawclfhwaDcufgDmbkaeTmiadcl6mdarcdthqalhkcbhxinaohwakhDarhminawawydbgPcbaDIdbgs:8cL4cFeGc:cufasJbbbb9BEgzaPaz9kEBdbaDclfhDawclfhwamcufgmmbkakaqfhkaxcefgxaeSmixbkkaeTmdxekaeTmekarcdthkavce9hhqadcl6hdcbhxindndndnaqmbadmdc:CuhDalhwarhminaDcbawIdbgs:8cL4cFeGc:cufasJbbbb9BEgPaDaP9kEhDawclfhwamcufgmmbxdkkc:CuhDdndnavPleddbdkadmdaohwalhmarhPinawcbamIdbgs:8cL4cFeGgzc;:bazc;:b0Ec:cufasJbbbb9BEBdbamclfhmawclfhwaPcufgPmbxdkkadmecbhwarhminaoawfcbalawfIdbgs:8cL4cFeGgPc8AaPc8A0Ec:cufasJbbbb9BEBdbawclfhwamcufgmmbkkadmbcbhwarhPinaDhmdnavceSmbaoawfydbhmkdndnalawfIdbgscjjj;8iamai9RcefgmcLt9R::NJbbbZJbbb:;asJbbbb9GEMgs:lJbbb9p9DTmbas:Ohzxekcjjjj94hzkabawfazcFFFrGamcKtVBdbawclfhwaPcufgPmbkkabakfhbalakfhlaxcefgxae9hmbkkaocjdf8Kjjjjbk;YqdXui998Jjjjjbc:qd9Rgv8Kjjjjbavc:Sefcbc;Kbz:wjjjb8AcbhodnadTmbcbhoaiTmbdndnabaeSmbaehrxekavcuadcdtgwadcFFFFi0Ecbyd;u:kjjbHjjjjbbgrBd:SeavceBd:mdaraeawz:vjjjb8Akavc:GefcwfcbBdbav9cb83i:Geavc:Gefaradaiavc:Sefz:ojjjbavyd:GehDadci9Ugqcbyd;u:kjjbHjjjjbbheavc:Sefavyd:mdgkcdtfaeBdbavakcefgwBd:mdaecbaqz:wjjjbhxavc:SefawcdtfcuaicdtaicFFFFi0Ecbyd;u:kjjbHjjjjbbgmBdbavakcdfgPBd:mdalc;ebfhsaDheamhwinawalIdbasaeydbgzcwazcw6EcdtfIdbMUdbaeclfheawclfhwaicufgimbkavc:SefaPcdtfcuaqcdtadcFFFF970Ecbyd;u:kjjbHjjjjbbgPBdbdnadci6mbarheaPhwaqhiinawamaeydbcdtfIdbamaeclfydbcdtfIdbMamaecwfydbcdtfIdbMUdbaecxfheawclfhwaicufgimbkkakcifhoalc;ebfhHavc;qbfhOavheavyd:KehAavyd:OehCcbhzcbhwcbhXcehQinaehLcihkarawci2gKcdtfgeydbhsaeclfydbhdabaXcx2fgicwfaecwfydbgYBdbaiclfadBdbaiasBdbaxawfce86bbaOaYBdwaOadBdlaOasBdbaPawcdtfcbBdbdnazTmbcihkaLhiinaOakcdtfaiydbgeBdbakaeaY9haeas9haead9hGGfhkaiclfhiazcufgzmbkkaXcefhXcbhzinaCaAarazaKfcdtfydbcdtgifydbcdtfgYheaDaifgdydbgshidnasTmbdninaeydbawSmeaeclfheaicufgiTmdxbkkaeaYascdtfc98fydbBdbadadydbcufBdbkazcefgzci9hmbkdndnakTmbcuhwJbbbbh8Acbhdavyd:KehYavyd:OehKindndnaDaOadcdtfydbcdtgzfydbgembadcefhdxekadcs0hiamazfgsIdbhEasalcbadcefgdaiEcdtfIdbaHaecwaecw6EcdtfIdbMg3Udba3aE:th3aecdthiaKaYazfydbcdtfheinaPaeydbgzcdtfgsa3asIdbMgEUdbaEa8Aa8AaE9DgsEh8AazawasEhwaeclfheaic98fgimbkkadak9hmbkawcu9hmekaQaq9pmdindnaxaQfRbbmbaQhwxdkaqaQcefgQ9hmbxikkakczakcz6EhzaOheaLhOawcu9hmbkkaocdtavc:Seffc98fhedninaoTmeaeydbcbyd;q:kjjbH:bjjjbbaec98fheaocufhoxbkkavc:qdf8Kjjjjbk;IlevucuaicdtgvaicFFFFi0Egocbyd;u:kjjbHjjjjbbhralalyd9GgwcdtfarBdbalawcefBd9GabarBdbaocbyd;u:kjjbHjjjjbbhralalyd9GgocdtfarBdbalaocefBd9GabarBdlcuadcdtadcFFFFi0Ecbyd;u:kjjbHjjjjbbhralalyd9GgocdtfarBdbalaocefBd9GabarBdwabydbcbavz:wjjjb8Aadci9UhDdnadTmbabydbhoaehladhrinaoalydbcdtfgvavydbcefBdbalclfhlarcufgrmbkkdnaiTmbabydbhlabydlhrcbhvaihoinaravBdbarclfhralydbavfhvalclfhlaocufgombkkdnadci6mbabydlhrabydwhvcbhlinaecwfydbhoaeclfydbhdaraeydbcdtfgwawydbgwcefBdbavawcdtfalBdbaradcdtfgdadydbgdcefBdbavadcdtfalBdbaraocdtfgoaoydbgocefBdbavaocdtfalBdbaecxfheaDalcefgl9hmbkkdnaiTmbabydlheabydbhlinaeaeydbalydb9RBdbalclfhlaeclfheaicufgimbkkkQbabaeadaic;K1jjbz:njjjbkQbabaeadaic;m:jjjbz:njjjbk9DeeuabcFeaicdtz:wjjjbhlcbhbdnadTmbindnalaeydbcdtfgiydbcu9hmbaiabBdbabcefhbkaeclfheadcufgdmbkkabk:Vvioud9:du8Jjjjjbc;Wa9Rgl8Kjjjjbcbhvalcxfcbc;Kbz:wjjjb8AalcuadcitgoadcFFFFe0Ecbyd;u:kjjbHjjjjbbgrBdxalceBd2araeadaicez:tjjjbalcuaoadcjjjjoGEcbyd;u:kjjbHjjjjbbgwBdzadcdthednadTmbabhiinaiavBdbaiclfhiadavcefgv9hmbkkawaefhDalabBdwalawBdl9cbhqindnadTmbaq9cq9:hkarhvaDhiadheinaiav8Pibak1:NcFrG87ebavcwfhvaicdfhiaecufgembkkalclfaq:NceGcdtfydbhxalclfaq9ce98gq:NceGcdtfydbhmalc;Wbfcbcjaz:wjjjb8AaDhvadhidnadTmbinalc;Wbfav8VebcdtfgeaeydbcefBdbavcdfhvaicufgimbkkcbhvcbhiinalc;WbfavfgeydbhoaeaiBdbaoaifhiavclfgvcja9hmbkadhvdndnadTmbinalc;WbfaDamydbgicetf8VebcdtfgeaeydbgecefBdbaxaecdtfaiBdbamclfhmavcufgvmbkaq9cv9smdcbhvinabawydbcdtfavBdbawclfhwadavcefgv9hmbxdkkaq9cv9smekkclhvdninavc98Smealcxfavfydbcbyd;q:kjjbH:bjjjbbavc98fhvxbkkalc;Waf8Kjjjjbk:Jwliuo99iud9:cbhv8Jjjjjbca9Rgoczfcwfcbyd:8:kjjbBdbaocb8Pd:0:kjjb83izaocwfcbyd;i:kjjbBdbaocb8Pd;a:kjjb83ibaicd4hrdndnadmbJFFuFhwJFFuuhDJFFuuhqJFFuFhkJFFuuhxJFFuFhmxekarcdthPaehsincbhiinaoczfaifgzasaifIdbgwazIdbgDaDaw9EEUdbaoaifgzawazIdbgDaDaw9DEUdbaiclfgicx9hmbkasaPfhsavcefgvad9hmbkaoIdKhDaoIdwhwaoIdChqaoIdlhkaoIdzhxaoIdbhmkdnadTmbJbbbbJbFu9hJbbbbamax:tgmamJbbbb9DEgmakaq:tgkakam9DEgkawaD:tgwawak9DEgw:vawJbbbb9BEhwdnalmbarcdthoindndnaeclfIdbaq:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikai:S9cC:ghHdndnaeIdbax:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikaHai:S:ehHdndnaecwfIdbaD:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikabaHai:T9cy:g:e83ibaeaofheabcwfhbadcufgdmbxdkkarcdthoindndnaeIdbax:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikai:SgH9ca:gaH9cz:g9cjjj;4s:d:eaH9cFe:d:e9cF:bj;4:pj;ar:d9c:bd9:9c:p;G:d;4j:E;ar:d9cH9:9c;d;H:W:y:m:g;d;Hb:d9cv9:9c;j:KM;j:KM;j:Kd:dhOdndnaeclfIdbaq:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikai:SgH9ca:gaH9cz:g9cjjj;4s:d:eaH9cFe:d:e9cF:bj;4:pj;ar:d9c:bd9:9c:p;G:d;4j:E;ar:d9cH9:9c;d;H:W:y:m:g;d;Hb:d9cq9:9cM;j:KM;j:KM;jl:daO:ehOdndnaecwfIdbaD:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikabaOai:SgH9ca:gaH9cz:g9cjjj;4s:d:eaH9cFe:d:e9cF:bj;4:pj;ar:d9c:bd9:9c:p;G:d;4j:E;ar:d9cH9:9c;d;H:W:y:m:g;d;Hb:d9cC9:9c:KM;j:KM;j:KMD:d:e83ibaeaofheabcwfhbadcufgdmbkkk9teiucbcbyd;y:kjjbgeabcifc98GfgbBd;y:kjjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik;teeeudndnaeabVciGTmbabhixekdndnadcz9pmbabhixekabhiinaiaeydbBdbaiaeydlBdlaiaeydwBdwaiaeydxBdxaeczfheaiczfhiadc9Wfgdcs0mbkkadcl6mbinaiaeydbBdbaeclfheaiclfhiadc98fgdci0mbkkdnadTmbinaiaeRbb86bbaicefhiaecefheadcufgdmbkkabk:3eedudndnabciGTmbabhixekaecFeGc:b:c:ew2hldndnadcz9pmbabhixekabhiinaialBdxaialBdwaialBdlaialBdbaiczfhiadc9Wfgdcs0mbkkadcl6mbinaialBdbaiclfhiadc98fgdci0mbkkdnadTmbinaiae86bbaicefhiadcufgdmbkkabk9teiucbcbyd;y:kjjbgeabcrfc94GfgbBd;y:kjjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik9:eiuZbhedndncbyd;y:kjjbgdaecztgi9nmbcuheadai9RcFFifcz4nbcuSmekadhekcbabae9Rcifc98Gcbyd;y:kjjbfgdBd;y:kjjbdnadZbcztge9nmbadae9RcFFifcz4nb8Akkk;Qddbcjwk;mdbbbbdbbblbbbwbbbbbbbebbbdbbblbbbwbbbbbbbbbbbbbbbb4:h9w9N94:P:gW:j9O:ye9Pbbbbbbebbbdbbbebbbdbbbbbbbdbbbbbbbebbbbbbb:l29hZ;69:9kZ;N;76Z;rg97Z;z;o9xZ8J;B85Z;:;u9yZ;b;k9HZ:2;Z9DZ9e:l9mZ59A8KZ:r;T3Z:A:zYZ79OHZ;j4::8::Y:D9V8:bbbb9s:49:Z8R:hBZ9M9M;M8:L;z;o8:;8:PG89q;x:J878R:hQ8::M:B;e87bbbbbbjZbbjZbbjZ:E;V;N8::Y:DsZ9i;H;68:xd;R8:;h0838:;W:NoZbbbb:WV9O8:uf888:9i;H;68:9c9G;L89;n;m9m89;D8Ko8:bbbbf:8tZ9m836ZS:2AZL;zPZZ818EZ9e:lxZ;U98F8:819E;68:FFuuFFuuFFuuFFuFFFuFFFuFbc;mqkzebbbebbbdbbb9G:vbb",e=new Uint8Array([32,0,65,2,1,106,34,33,3,128,11,4,13,64,6,253,10,7,15,116,127,5,8,12,40,16,19,54,20,9,27,255,113,17,42,67,24,23,146,148,18,14,22,45,70,69,56,114,101,21,25,63,75,136,108,28,118,29,73,115]);if(typeof WebAssembly!="object")return{supported:!1};var r,a=WebAssembly.instantiate(s(t),{}).then(function(b){r=b.instance,r.exports.__wasm_call_ctors(),r.exports.meshopt_encodeVertexVersion(0),r.exports.meshopt_encodeIndexVersion(1)});function s(b){for(var h=new Uint8Array(b.length),d=0;d<b.length;++d){var x=b.charCodeAt(d);h[d]=x>96?x-97:x>64?x-39:x+4}for(var g=0,d=0;d<b.length;++d)h[g++]=h[d]<60?e[h[d]]:(h[d]-60)*64+h[++d];return h.buffer.slice(0,g)}function n(b){if(!b)throw new Error("Assertion failed")}function i(b){return new Uint8Array(b.buffer,b.byteOffset,b.byteLength)}function o(b,h,d,x){var g=r.exports.sbrk,y=g(h.length*4),m=g(d*4),w=new Uint8Array(r.exports.memory.buffer),E=i(h);w.set(E,y),x&&x(y,y,h.length,d);var S=b(m,y,h.length,d);w=new Uint8Array(r.exports.memory.buffer);var A=new Uint32Array(d);new Uint8Array(A.buffer).set(w.subarray(m,m+d*4)),E.set(w.subarray(y,y+h.length*4)),g(y-g(0));for(var T=0;T<h.length;++T)h[T]=A[h[T]];return[A,S]}function c(b,h,d,x){var g=r.exports.sbrk,y=g(d*4),m=g(d*x),w=new Uint8Array(r.exports.memory.buffer);w.set(i(h),m),b(y,m,d,x),w=new Uint8Array(r.exports.memory.buffer);var E=new Uint32Array(d);return new Uint8Array(E.buffer).set(w.subarray(y,y+d*4)),g(y-g(0)),E}function l(b,h,d,x,g){var y=r.exports.sbrk,m=y(h),w=y(x*g),E=new Uint8Array(r.exports.memory.buffer);E.set(i(d),w);var S=b(m,h,w,x,g),A=new Uint8Array(S);return A.set(E.subarray(m,m+S)),y(m-y(0)),A}function f(b){for(var h=0,d=0;d<b.length;++d){var x=b[d];h=h<x?x:h}return h}function u(b,h){if(n(h==2||h==4),h==4)return new Uint32Array(b.buffer,b.byteOffset,b.byteLength/4);var d=new Uint16Array(b.buffer,b.byteOffset,b.byteLength/2);return new Uint32Array(d)}function p(b,h,d,x,g,y,m){var w=r.exports.sbrk,E=w(d*x),S=w(d*y),A=new Uint8Array(r.exports.memory.buffer);A.set(i(h),S),b(E,d,x,g,S,m);var T=new Uint8Array(d*x);return T.set(A.subarray(E,E+d*x)),w(E-w(0)),T}return{ready:a,supported:!0,reorderMesh:function(b,h,d){var x=h?d?r.exports.meshopt_optimizeVertexCacheStrip:r.exports.meshopt_optimizeVertexCache:void 0;return o(r.exports.meshopt_optimizeVertexFetchRemap,b,f(b)+1,x)},reorderPoints:function(b,h){return n(b instanceof Float32Array),n(b.length%h==0),n(h>=3),c(r.exports.meshopt_spatialSortRemap,b,b.length/h,h*4)},encodeVertexBuffer:function(b,h,d){n(d>0&&d<=256),n(d%4==0);var x=r.exports.meshopt_encodeVertexBufferBound(h,d);return l(r.exports.meshopt_encodeVertexBuffer,x,b,h,d)},encodeIndexBuffer:function(b,h,d){n(d==2||d==4),n(h%3==0);var x=u(b,d),g=r.exports.meshopt_encodeIndexBufferBound(h,f(x)+1);return l(r.exports.meshopt_encodeIndexBuffer,g,x,h,4)},encodeIndexSequence:function(b,h,d){n(d==2||d==4);var x=u(b,d),g=r.exports.meshopt_encodeIndexSequenceBound(h,f(x)+1);return l(r.exports.meshopt_encodeIndexSequence,g,x,h,4)},encodeGltfBuffer:function(b,h,d,x){var g={ATTRIBUTES:this.encodeVertexBuffer,TRIANGLES:this.encodeIndexBuffer,INDICES:this.encodeIndexSequence};return n(g[x]),g[x](b,h,d)},encodeFilterOct:function(b,h,d,x){return n(d==4||d==8),n(x>=1&&x<=16),p(r.exports.meshopt_encodeFilterOct,b,h,d,x,16)},encodeFilterQuat:function(b,h,d,x){return n(d==8),n(x>=4&&x<=16),p(r.exports.meshopt_encodeFilterQuat,b,h,d,x,16)},encodeFilterExp:function(b,h,d,x,g){n(d>0&&d%4==0),n(x>=1&&x<=24);var y={Separate:0,SharedVector:1,SharedComponent:2,Clamped:3};return p(r.exports.meshopt_encodeFilterExp,b,h,d,x,d,g?y[g]:1)}}})();var ms=(function(){var t="b9H79Tebbbe8Fv9Gbb9Gvuuuuueu9Giuuub9Geueu9Giuuueuikqbeeedddillviebeoweuec:W:Odkr;leDo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bb8A9TW79O9V9Wt9F9KW9J9V9KW9wWVtW949c919M9MWVbeY9TW79O9V9Wt9F9KW9J9V9KW69U9KW949c919M9MWVbdE9TW79O9V9Wt9F9KW9J9V9KW69U9KW949tWG91W9U9JWbiL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9p9JtblK9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9r919HtbvL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWVT949Wbol79IV9Rbrq:S86qdbk;jYi5ud9:du8Jjjjjbcj;kb9Rgv8Kjjjjbc9:hodnalTmbcuhoaiRbbgrc;WeGc:Ge9hmbarcsGgwce0mbc9:hoalcufadcd4cbawEgDadfgrcKcaawEgqaraq0Egk6mbaicefhxcj;abad9Uc;WFbGcjdadca0EhmaialfgPar9Rgoadfhsavaoadz1jjjbgzceVhHcbhOdndninaeaO9nmeaPax9RaD6mdamaeaO9RaOamfgoae6EgAcsfglc9WGhCabaOad2fhXaAcethQaxaDfhiaOaeaoaeao6E9RhLalcl4cifcd4hKazcj;cbfaAfhYcbh8AazcjdfhEaHh3incbhodnawTmbaxa8Acd4fRbbhokaocFeGh5cbh8Eazcj;cbfhqinaih8Fdndndndna5a8Ecet4ciGgoc9:fPdebdkaPa8F9RaA6mrazcj;cbfa8EaA2fa8FaAz1jjjb8Aa8FaAfhixdkazcj;cbfa8EaA2fcbaAz:jjjjb8Aa8FhixekaPa8F9RaK6mva8FaKfhidnaCTmbaPai9RcK6mbaocdtc:q1jjbfcj1jjbawEhaczhrcbhlinargoc9Wfghaqfhrdndndndndndnaaa8Fahco4fRbbalcoG4ciGcdtfydbPDbedvivvvlvkar9cb83bbarcwf9cb83bbxlkarcbaiRbdai8Xbb9c:c:qj:bw9:9c:q;c1:I1e:d9c:b:c:e1z9:gg9cjjjjjz:dg8J9qE86bbaqaofgrcGfag9c8F1:NghcKtc8F91aicdfa8J9c8N1:Nfg8KRbbG86bbarcVfcba8KahcjeGcr4fghRbbag9cjjjjjl:dg8J9qE86bbarc7fcbaha8J9c8L1:NfghRbbag9cjjjjjd:dg8J9qE86bbarctfcbaha8J9c8K1:NfghRbbag9cjjjjje:dg8J9qE86bbarc91fcbaha8J9c8J1:NfghRbbag9cjjjj;ab:dg8J9qE86bbarc4fcbaha8J9cg1:NfghRbbag9cjjjja:dg8J9qE86bbarc93fcbaha8J9ch1:NfghRbbag9cjjjjz:dgg9qE86bbarc94fcbahag9ca1:NfghRbbai8Xbe9c:c:qj:bw9:9c:q;c1:I1e:d9c:b:c:e1z9:gg9cjjjjjz:dg8J9qE86bbarc95fag9c8F1:NgicKtc8F91aha8J9c8N1:NfghRbbG86bbarc96fcbahaicjeGcr4fgiRbbag9cjjjjjl:dg8J9qE86bbarc97fcbaia8J9c8L1:NfgiRbbag9cjjjjjd:dg8J9qE86bbarc98fcbaia8J9c8K1:NfgiRbbag9cjjjjje:dg8J9qE86bbarc99fcbaia8J9c8J1:NfgiRbbag9cjjjj;ab:dg8J9qE86bbarc9:fcbaia8J9cg1:NfgiRbbag9cjjjja:dg8J9qE86bbarcufcbaia8J9ch1:NfgiRbbag9cjjjjz:dgg9qE86bbaiag9ca1:NfhixikaraiRblaiRbbghco4g8Ka8KciSg8KE86bbaqaofgrcGfaiclfa8Kfg8KRbbahcl4ciGg8La8LciSg8LE86bbarcVfa8Ka8Lfg8KRbbahcd4ciGg8La8LciSg8LE86bbarc7fa8Ka8Lfg8KRbbahciGghahciSghE86bbarctfa8Kahfg8KRbbaiRbeghco4g8La8LciSg8LE86bbarc91fa8Ka8Lfg8KRbbahcl4ciGg8La8LciSg8LE86bbarc4fa8Ka8Lfg8KRbbahcd4ciGg8La8LciSg8LE86bbarc93fa8Ka8Lfg8KRbbahciGghahciSghE86bbarc94fa8Kahfg8KRbbaiRbdghco4g8La8LciSg8LE86bbarc95fa8Ka8Lfg8KRbbahcl4ciGg8La8LciSg8LE86bbarc96fa8Ka8Lfg8KRbbahcd4ciGg8La8LciSg8LE86bbarc97fa8Ka8Lfg8KRbbahciGghahciSghE86bbarc98fa8KahfghRbbaiRbigico4g8Ka8KciSg8KE86bbarc99faha8KfghRbbaicl4ciGg8Ka8KciSg8KE86bbarc9:faha8KfghRbbaicd4ciGg8Ka8KciSg8KE86bbarcufaha8KfgrRbbaiciGgiaiciSgiE86bbaraifhixdkaraiRbwaiRbbghcl4g8Ka8KcsSg8KE86bbaqaofgrcGfaicwfa8Kfg8KRbbahcsGghahcsSghE86bbarcVfa8KahfghRbbaiRbeg8Kcl4g8La8LcsSg8LE86bbarc7faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarctfaha8KfghRbbaiRbdg8Kcl4g8La8LcsSg8LE86bbarc91faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc4faha8KfghRbbaiRbig8Kcl4g8La8LcsSg8LE86bbarc93faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc94faha8KfghRbbaiRblg8Kcl4g8La8LcsSg8LE86bbarc95faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc96faha8KfghRbbaiRbvg8Kcl4g8La8LcsSg8LE86bbarc97faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc98faha8KfghRbbaiRbog8Kcl4g8La8LcsSg8LE86bbarc99faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc9:faha8KfghRbbaiRbrgicl4g8Ka8KcsSg8KE86bbarcufaha8KfgrRbbaicsGgiaicsSgiE86bbaraifhixekarai8Pbb83bbarcwfaicwf8Pbb83bbaiczfhikdnaoaC9pmbalcdfhlaoczfhraPai9RcL0mekkaoaC6moaimexokaCmva8FTmvkaqaAfhqa8Ecefg8Ecl9hmbkdndndndnawTmbasa8Acd4fRbbgociGPlbedrbkaATmdaza8Afh8Fazcj;cbfhhcbh8EaEhaina8FRbbhraahocbhlinaoahalfRbbgqce4cbaqceG9R7arfgr86bbaoadfhoaAalcefgl9hmbkaacefhaa8Fcefh8FahaAfhha8Ecefg8Ecl9hmbxikkaATmeaza8Afhaazcj;cbfhhcbhoceh8EaYh8FinaEaofhlaa8Vbbhrcbhoinala8FaofRbbcwtahaofRbbgqVc;:FiGce4cbaqceG9R7arfgr87bbaladfhlaLaocefgofmbka8FaQfh8FcdhoaacdfhaahaQfhha8EceGhlcbh8EalmbxdkkaATmbcbaocl49Rh8Eaza8AfRbbhqcwhoa3hlinalRbbaotaqVhqalcefhlaocwfgoca9hmbkcbhhaEh8FaYhainazcj;cbfahfRbbhrcwhoaahlinalRbbaotarVhralaAfhlaocwfgoca9hmbkara8E93aq7hqcbhoa8Fhlinalaqao486bbalcefhlaocwfgoca9hmbka8Fadfh8FaacefhaahcefghaA9hmbkkaEclfhEa3clfh3a8Aclfg8Aad6mbkaXazcjdfaAad2z1jjjb8AazazcjdfaAcufad2fadz1jjjb8AaAaOfhOaihxaimbkc9:hoxdkcbc99aPax9RakSEhoxekc9:hokavcj;kbf8Kjjjjbaok:XseHu8Jjjjjbc;ae9Rgv8Kjjjjbc9:hodnaeci9UgrcHfal0mbcuhoaiRbbgwc;WeGc;Ge9hmbawcsGgDce0mbavc;abfcFecjez:jjjjb8AavcUf9cu83ibavc8Wf9cu83ibavcyf9cu83ibavcaf9cu83ibavcKf9cu83ibavczf9cu83ibav9cu83iwav9cu83ibaialfc9WfhqaicefgwarfhldnaeTmbcmcsaDceSEhkcbhxcbhmcbhrcbhicbhoindnalaq9nmbc9:hoxikdndnawRbbgDc;Ve0mbavc;abfaoaDcu7gPcl4fcsGcitfgsydlhzasydbhHdndnaDcsGgsak9pmbavaiaPfcsGcdtfydbaxasEhDaxasTgOfhxxekdndnascsSmbcehOasc987asamffcefhDxekalcefhDal8SbbgscFeGhPdndnascu9mmbaDhlxekalcvfhlaPcFbGhPcrhsdninaD8SbbgOcFbGastaPVhPaOcu9kmeaDcefhDascrfgsc8J9hmbxdkkaDcefhlkcehOaPce4cbaPceG9R7amfhDkaDhmkavc;abfaocitfgsaDBdbasazBdlavaicdtfaDBdbavc;abfaocefcsGcitfgsaHBdbasaDBdlaocdfhoaOaifhidnadcd9hmbabarcetfgsaH87ebasclfaD87ebascdfaz87ebxdkabarcdtfgsaHBdbascwfaDBdbasclfazBdbxekdnaDcpe0mbaxcefgOavaiaqaDcsGfRbbgscl49RcsGcdtfydbascz6gPEhDavaias9RcsGcdtfydbaOaPfgzascsGgOEhsaOThOdndnadcd9hmbabarcetfgHax87ebaHclfas87ebaHcdfaD87ebxekabarcdtfgHaxBdbaHcwfasBdbaHclfaDBdbkavaicdtfaxBdbavc;abfaocitfgHaDBdbaHaxBdlavaicefgicsGcdtfaDBdbavc;abfaocefcsGcitfgHasBdbaHaDBdlavaiaPfgicsGcdtfasBdbavc;abfaocdfcsGcitfgDaxBdbaDasBdlaocifhoaiaOfhiazaOfhxxekaxcbalRbbgHEgAaDc;:eSgDfhzaHcsGhCaHcl4hXdndnaHcs0mbazcefhOxekazhOavaiaX9RcsGcdtfydbhzkdndnaCmbaOcefhxxekaOhxavaiaH9RcsGcdtfydbhOkdndnaDTmbalcefhDxekalcdfhDal8SbegPcFeGhsdnaPcu9kmbalcofhAascFbGhscrhldninaD8SbbgPcFbGaltasVhsaPcu9kmeaDcefhDalcrfglc8J9hmbkaAhDxekaDcefhDkasce4cbasceG9R7amfgmhAkdndnaXcsSmbaDhsxekaDcefhsaD8SbbglcFeGhPdnalcu9kmbaDcvfhzaPcFbGhPcrhldninas8SbbgDcFbGaltaPVhPaDcu9kmeascefhsalcrfglc8J9hmbkazhsxekascefhskaPce4cbaPceG9R7amfgmhzkdndnaCcsSmbashlxekascefhlas8SbbgDcFeGhPdnaDcu9kmbascvfhOaPcFbGhPcrhDdninal8SbbgscFbGaDtaPVhPascu9kmealcefhlaDcrfgDc8J9hmbkaOhlxekalcefhlkaPce4cbaPceG9R7amfgmhOkdndnadcd9hmbabarcetfgDaA87ebaDclfaO87ebaDcdfaz87ebxekabarcdtfgDaABdbaDcwfaOBdbaDclfazBdbkavc;abfaocitfgDazBdbaDaABdlavaicdtfaABdbavc;abfaocefcsGcitfgDaOBdbaDazBdlavaicefgicsGcdtfazBdbavc;abfaocdfcsGcitfgDaABdbaDaOBdlavaiaHcz6aXcsSVfgicsGcdtfaOBdbaiaCTaCcsSVfhiaocifhokawcefhwaocsGhoaicsGhiarcifgrae6mbkkcbc99alaqSEhokavc;aef8Kjjjjbaok:clevu8Jjjjjbcz9Rhvdnaecvfal9nmbc9:skdnaiRbbc;:eGc;qeSmbcuskav9cb83iwaicefhoaialfc98fhrdnaeTmbdnadcdSmbcbhwindnaoar6mbc9:skaocefhlao8SbbgicFeGhddndnaicu9mmbalhoxekaocvfhoadcFbGhdcrhidninal8SbbgDcFbGaitadVhdaDcu9kmealcefhlaicrfgic8J9hmbxdkkalcefhokabawcdtfadc8Etc8F91adcd47avcwfadceGcdtVglydbfgiBdbalaiBdbawcefgwae9hmbxdkkcbhwindnaoar6mbc9:skaocefhlao8SbbgicFeGhddndnaicu9mmbalhoxekaocvfhoadcFbGhdcrhidninal8SbbgDcFbGaitadVhdaDcu9kmealcefhlaicrfgic8J9hmbxdkkalcefhokabawcetfadc8Etc8F91adcd47avcwfadceGcdtVglydbfgi87ebalaiBdbawcefgwae9hmbkkcbc99aoarSEk:Lvoeue99dud99eud99dndnadcl9hmbaeTmeindndnabcdfgd8Sbb:Yab8Sbbgi:Ygl:l:tabcefgv8Sbbgo:Ygr:l:tgwJbb;:9cawawNJbbbbawawJbbbb9GgDEgq:mgkaqaicb9iEalMgwawNakaqaocb9iEarMgqaqNMM:r:vglNJbbbZJbbb:;aDEMgr:lJbbb9p9DTmbar:Ohixekcjjjj94hikadai86bbdndnaqalNJbbbZJbbb:;aqJbbbb9GEMgq:lJbbb9p9DTmbaq:Ohdxekcjjjj94hdkavad86bbdndnawalNJbbbZJbbb:;awJbbbb9GEMgw:lJbbb9p9DTmbaw:Ohdxekcjjjj94hdkabad86bbabclfhbaecufgembxdkkaeTmbindndnabclfgd8Ueb:Yab8Uebgi:Ygl:l:tabcdfgv8Uebgo:Ygr:l:tgwJb;:FSawawNJbbbbawawJbbbb9GgDEgq:mgkaqaicb9iEalMgwawNakaqaocb9iEarMgqaqNMM:r:vglNJbbbZJbbb:;aDEMgr:lJbbb9p9DTmbar:Ohixekcjjjj94hikadai87ebdndnaqalNJbbbZJbbb:;aqJbbbb9GEMgq:lJbbb9p9DTmbaq:Ohdxekcjjjj94hdkavad87ebdndnawalNJbbbZJbbb:;awJbbbb9GEMgw:lJbbb9p9DTmbaw:Ohdxekcjjjj94hdkabad87ebabcwfhbaecufgembkkk;oiliui99iue99dnaeTmbcbhiabhlindndnJ;Zl81Zalcof8UebgvciV:Y:vgoal8Ueb:YNgrJb;:FSNJbbbZJbbb:;arJbbbb9GEMgw:lJbbb9p9DTmbaw:OhDxekcjjjj94hDkalclf8Uebhqalcdf8UebhkabaiavcefciGfcetfaD87ebdndnaoak:YNgwJb;:FSNJbbbZJbbb:;awJbbbb9GEMgx:lJbbb9p9DTmbax:OhDxekcjjjj94hDkabaiavciGfgkcd7cetfaD87ebdndnaoaq:YNgoJb;:FSNJbbbZJbbb:;aoJbbbb9GEMgx:lJbbb9p9DTmbax:OhDxekcjjjj94hDkabaiavcufciGfcetfaD87ebdndnJbbjZararN:tawawN:taoaoN:tgrJbbbbarJbbbb9GE:rJb;:FSNJbbbZMgr:lJbbb9p9DTmbar:Ohvxekcjjjj94hvkabakcetfav87ebalcwfhlaiclfhiaecufgembkkk9mbdnadcd4ae2gdTmbinababydbgecwtcw91:Yaece91cjjj98Gcjjj;8if::NUdbabclfhbadcufgdmbkkk9teiucbcbyd:K1jjbgeabcifc98GfgbBd:K1jjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik;teeeudndnaeabVciGTmbabhixekdndnadcz9pmbabhixekabhiinaiaeydbBdbaiaeydlBdlaiaeydwBdwaiaeydxBdxaeczfheaiczfhiadc9Wfgdcs0mbkkadcl6mbinaiaeydbBdbaeclfheaiclfhiadc98fgdci0mbkkdnadTmbinaiaeRbb86bbaicefhiaecefheadcufgdmbkkabk:3eedudndnabciGTmbabhixekaecFeGc:b:c:ew2hldndnadcz9pmbabhixekabhiinaialBdxaialBdwaialBdlaialBdbaiczfhiadc9Wfgdcs0mbkkadcl6mbinaialBdbaiclfhiadc98fgdci0mbkkdnadTmbinaiae86bbaicefhiadcufgdmbkkabkk81dbcjwk8Kbbbbdbbblbbbwbbbbbbbebbbdbbblbbbwbbbbc:Kwkl8WNbb",e="b9H79TebbbeKl9Gbb9Gvuuuuueu9Giuuub9Geueuikqbbebeedddilve9Weeeviebeoweuec:q:6dkr;leDo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bb8A9TW79O9V9Wt9F9KW9J9V9KW9wWVtW949c919M9MWVbdY9TW79O9V9Wt9F9KW9J9V9KW69U9KW949c919M9MWVblE9TW79O9V9Wt9F9KW9J9V9KW69U9KW949tWG91W9U9JWbvL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9p9JtboK9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9r919HtbrL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWVT949Wbwl79IV9RbDq;G9Mqlbzik9:evu8Jjjjjbcz9Rhbcbheincbhdcbhiinabcwfadfaicjuaead4ceGglE86bbaialfhiadcefgdcw9hmbkaec:q:yjjbfai86bbaecitc:q1jjbfab8Piw83ibaecefgecjd9hmbkk:183lYud97dur978Jjjjjbcj;kb9Rgv8Kjjjjbc9:hodnalTmbcuhoaiRbbgrc;WeGc:Ge9hmbarcsGgwce0mbc9:hoalcufadcd4cbawEgDadfgrcKcaawEgqaraq0Egk6mbaicefhxavaialfgmar9Rgoad;8qbbcj;abad9Uc;WFbGcjdadca0EhPdndndnadTmbaoadfhscbhzinaeaz9nmdamax9RaD6miabazad2fhHaxaDfhOaPaeaz9RazaPfae6EgAcsfgocl4cifcd4hCavcj;cbfaoc9WGgXcetfhQavcj;cbfaXci2fhLavcj;cbfaXfhKcbhYaoc;ab6h8AincbhodnawTmbaxaYcd4fRbbhokaocFeGhEcbh3avcj;cbfh5indndndndnaEa3cet4ciGgoc9:fPdebdkamaO9RaX6mwavcj;cbfa3aX2faOaX;8qbbaOaAfhOxdkavcj;cbfa3aX2fcbaX;8kbxekamaO9RaC6moaoclVcbawEhraOaCfhocbhidna8Ambamao9Rc;Gb6mbcbhlina5alfhidndndndndndnaOalco4fRbbgqciGarfPDbedibledibkaipxbbbbbbbbbbbbbbbbpklbxlkaiaopbblaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLg8Ecdp:mea8EpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9og8Fpxiiiiiiiiiiiiiiiip8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaoclffahc:q:yjjbfRbbfhoxikaiaopbbwaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9og8Fpxssssssssssssssssp8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaocwffahc:q:yjjbfRbbfhoxdkaiaopbbbpklbaoczfhoxekaiaopbbdaoRbbgacitc:q1jjbfpbibaac:q:yjjbfRbbgapsaoRbeghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPpklbaaaocdffahc:q:yjjbfRbbfhokdndndndndndnaqcd4ciGarfPDbedibledibkaiczfpxbbbbbbbbbbbbbbbbpklbxlkaiczfaopbblaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLg8Ecdp:mea8EpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9og8Fpxiiiiiiiiiiiiiiiip8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaoclffahc:q:yjjbfRbbfhoxikaiczfaopbbwaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9og8Fpxssssssssssssssssp8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaocwffahc:q:yjjbfRbbfhoxdkaiczfaopbbbpklbaoczfhoxekaiczfaopbbdaoRbbgacitc:q1jjbfpbibaac:q:yjjbfRbbgapsaoRbeghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPpklbaaaocdffahc:q:yjjbfRbbfhokdndndndndndnaqcl4ciGarfPDbedibledibkaicafpxbbbbbbbbbbbbbbbbpklbxlkaicafaopbblaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLg8Ecdp:mea8EpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9og8Fpxiiiiiiiiiiiiiiiip8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaoclffahc:q:yjjbfRbbfhoxikaicafaopbbwaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9og8Fpxssssssssssssssssp8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaocwffahc:q:yjjbfRbbfhoxdkaicafaopbbbpklbaoczfhoxekaicafaopbbdaoRbbgacitc:q1jjbfpbibaac:q:yjjbfRbbgapsaoRbeghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPpklbaaaocdffahc:q:yjjbfRbbfhokdndndndndndnaqco4arfPDbedibledibkaic8Wfpxbbbbbbbbbbbbbbbbpklbxlkaic8Wfaopbblaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLg8Ecdp:mea8EpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9og8Fpxiiiiiiiiiiiiiiiip8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngicitc:q1jjbfpbibaic:q:yjjbfRbbgipsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Ngqcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaiaoclffaqc:q:yjjbfRbbfhoxikaic8Wfaopbbwaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9og8Fpxssssssssssssssssp8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngicitc:q1jjbfpbibaic:q:yjjbfRbbgipsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Ngqcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaiaocwffaqc:q:yjjbfRbbfhoxdkaic8Wfaopbbbpklbaoczfhoxekaic8WfaopbbdaoRbbgicitc:q1jjbfpbibaic:q:yjjbfRbbgipsaoRbegqcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPpklbaiaocdffaqc:q:yjjbfRbbfhokalc;abfhialcjefaX0meaihlamao9Rc;Fb0mbkkdnaiaX9pmbaici4hlinamao9RcK6mwa5aifhqdndndndndndnaOaico4fRbbalcoG4ciGarfPDbedibledibkaqpxbbbbbbbbbbbbbbbbpkbbxlkaqaopbblaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLg8Ecdp:mea8EpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9og8Fpxiiiiiiiiiiiiiiiip8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spkbbaaaoclffahc:q:yjjbfRbbfhoxikaqaopbbwaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9og8Fpxssssssssssssssssp8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spkbbaaaocwffahc:q:yjjbfRbbfhoxdkaqaopbbbpkbbaoczfhoxekaqaopbbdaoRbbgacitc:q1jjbfpbibaac:q:yjjbfRbbgapsaoRbeghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPpkbbaaaocdffahc:q:yjjbfRbbfhokalcdfhlaiczfgiaX6mbkkaohOaoTmoka5aXfh5a3cefg3cl9hmbkdndndndnawTmbasaYcd4fRbbglciGPlbedwbkaXTmdavcjdfaYfhlavaYfpbdbhgcbhoinalavcj;cbfaofpblbg8JaKaofpblbg8KpmbzeHdOiAlCvXoQrLg8LaQaofpblbg8MaLaofpblbg8NpmbzeHdOiAlCvXoQrLgypmbezHdiOAlvCXorQLg8Ecep9Ta8Epxeeeeeeeeeeeeeeeeg8Fp9op9Hp9rg8Eagp9Uggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp9Uggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp9Uggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp9Uggp9Abbbaladfglaga8LaypmwDKYqk8AExm35Ps8E8Fg8Ecep9Ta8Ea8Fp9op9Hp9rg8Ep9Uggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp9Uggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp9Uggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp9Uggp9Abbbaladfglaga8Ja8KpmwKDYq8AkEx3m5P8Es8Fg8Ja8Ma8NpmwKDYq8AkEx3m5P8Es8Fg8KpmbezHdiOAlvCXorQLg8Ecep9Ta8Ea8Fp9op9Hp9rg8Ep9Uggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp9Uggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp9Uggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp9Uggp9Abbbaladfglaga8Ja8KpmwDKYqk8AExm35Ps8E8Fg8Ecep9Ta8Ea8Fp9op9Hp9rg8Ep9Ug8Fp9Abbbaladfgla8Fa8Ea8Epmlvorlvorlvorlvorp9Ug8Fp9Abbbaladfgla8Fa8Ea8EpmwDqkwDqkwDqkwDqkp9Ug8Fp9Abbbaladfgla8Fa8Ea8EpmxmPsxmPsxmPsxmPsp9Uggp9AbbbaladfhlaoczfgoaX6mbxikkaXTmeavcjdfaYfhlavaYfpbdbhgcbhoinalavcj;cbfaofpblbg8JaKaofpblbg8KpmbzeHdOiAlCvXoQrLg8LaQaofpblbg8MaLaofpblbg8NpmbzeHdOiAlCvXoQrLgypmbezHdiOAlvCXorQLg8Ecep:nea8Epxebebebebebebebebg8Fp9op:bep9rg8Eagp:oeggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp:oeggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp:oeggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp:oeggp9Abbbaladfglaga8LaypmwDKYqk8AExm35Ps8E8Fg8Ecep:nea8Ea8Fp9op:bep9rg8Ep:oeggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp:oeggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp:oeggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp:oeggp9Abbbaladfglaga8Ja8KpmwKDYq8AkEx3m5P8Es8Fg8Ja8Ma8NpmwKDYq8AkEx3m5P8Es8Fg8KpmbezHdiOAlvCXorQLg8Ecep:nea8Ea8Fp9op:bep9rg8Ep:oeggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp:oeggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp:oeggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp:oeggp9Abbbaladfglaga8Ja8KpmwDKYqk8AExm35Ps8E8Fg8Ecep:nea8Ea8Fp9op:bep9rg8Ep:oeg8Fp9Abbbaladfgla8Fa8Ea8Epmlvorlvorlvorlvorp:oeg8Fp9Abbbaladfgla8Fa8Ea8EpmwDqkwDqkwDqkwDqkp:oeg8Fp9Abbbaladfgla8Fa8Ea8EpmxmPsxmPsxmPsxmPsp:oeggp9AbbbaladfhlaoczfgoaX6mbxdkkaXTmbcbhocbalcl4gl9Rc8FGhiavcjdfaYfhravaYfpbdbh8Finaravcj;cbfaofpblbggaKaofpblbg8JpmbzeHdOiAlCvXoQrLg8KaQaofpblbg8LaLaofpblbg8MpmbzeHdOiAlCvXoQrLg8NpmbezHdiOAlvCXorQLg8Eaip:Rea8Ealp:Sep9qg8Ea8Fp9rg8Fp9Abbbaradfgra8Fa8Ea8Epmlvorlvorlvorlvorp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmwDqkwDqkwDqkwDqkp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmxmPsxmPsxmPsxmPsp9rg8Fp9Abbbaradfgra8Fa8Ka8NpmwDKYqk8AExm35Ps8E8Fg8Eaip:Rea8Ealp:Sep9qg8Ep9rg8Fp9Abbbaradfgra8Fa8Ea8Epmlvorlvorlvorlvorp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmwDqkwDqkwDqkwDqkp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmxmPsxmPsxmPsxmPsp9rg8Fp9Abbbaradfgra8Faga8JpmwKDYq8AkEx3m5P8Es8Fgga8La8MpmwKDYq8AkEx3m5P8Es8Fg8JpmbezHdiOAlvCXorQLg8Eaip:Rea8Ealp:Sep9qg8Ep9rg8Fp9Abbbaradfgra8Fa8Ea8Epmlvorlvorlvorlvorp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmwDqkwDqkwDqkwDqkp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmxmPsxmPsxmPsxmPsp9rg8Fp9Abbbaradfgra8Faga8JpmwDKYqk8AExm35Ps8E8Fg8Eaip:Rea8Ealp:Sep9qg8Ep9rg8Fp9Abbbaradfgra8Fa8Ea8Epmlvorlvorlvorlvorp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmwDqkwDqkwDqkwDqkp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmxmPsxmPsxmPsxmPsp9rg8Fp9AbbbaradfhraoczfgoaX6mbkkaYclfgYad6mbkaHavcjdfaAad2;8qbbavavcjdfaAcufad2fad;8qbbaAazfhzc9:hoaOhxaOmbxlkkaeTmbaDalfhrcbhocuhlinaralaD9RglfaD6mdaPaeao9RaoaPfae6Eaofgoae6mbkaial9Rhxkcbc99amax9RakSEhoxekc9:hokavcj;kbf8Kjjjjbaokwbz:bjjjbk:TseHu8Jjjjjbc;ae9Rgv8Kjjjjbc9:hodnaeci9UgrcHfal0mbcuhoaiRbbgwc;WeGc;Ge9hmbawcsGgDce0mbavc;abfcFecje;8kbavcUf9cu83ibavc8Wf9cu83ibavcyf9cu83ibavcaf9cu83ibavcKf9cu83ibavczf9cu83ibav9cu83iwav9cu83ibaialfc9WfhqaicefgwarfhldnaeTmbcmcsaDceSEhkcbhxcbhmcbhrcbhicbhoindnalaq9nmbc9:hoxikdndnawRbbgDc;Ve0mbavc;abfaoaDcu7gPcl4fcsGcitfgsydlhzasydbhHdndnaDcsGgsak9pmbavaiaPfcsGcdtfydbaxasEhDaxasTgOfhxxekdndnascsSmbcehOasc987asamffcefhDxekalcefhDal8SbbgscFeGhPdndnascu9mmbaDhlxekalcvfhlaPcFbGhPcrhsdninaD8SbbgOcFbGastaPVhPaOcu9kmeaDcefhDascrfgsc8J9hmbxdkkaDcefhlkcehOaPce4cbaPceG9R7amfhDkaDhmkavc;abfaocitfgsaDBdbasazBdlavaicdtfaDBdbavc;abfaocefcsGcitfgsaHBdbasaDBdlaocdfhoaOaifhidnadcd9hmbabarcetfgsaH87ebasclfaD87ebascdfaz87ebxdkabarcdtfgsaHBdbascwfaDBdbasclfazBdbxekdnaDcpe0mbaxcefgOavaiaqaDcsGfRbbgscl49RcsGcdtfydbascz6gPEhDavaias9RcsGcdtfydbaOaPfgzascsGgOEhsaOThOdndnadcd9hmbabarcetfgHax87ebaHclfas87ebaHcdfaD87ebxekabarcdtfgHaxBdbaHcwfasBdbaHclfaDBdbkavaicdtfaxBdbavc;abfaocitfgHaDBdbaHaxBdlavaicefgicsGcdtfaDBdbavc;abfaocefcsGcitfgHasBdbaHaDBdlavaiaPfgicsGcdtfasBdbavc;abfaocdfcsGcitfgDaxBdbaDasBdlaocifhoaiaOfhiazaOfhxxekaxcbalRbbgHEgAaDc;:eSgDfhzaHcsGhCaHcl4hXdndnaHcs0mbazcefhOxekazhOavaiaX9RcsGcdtfydbhzkdndnaCmbaOcefhxxekaOhxavaiaH9RcsGcdtfydbhOkdndnaDTmbalcefhDxekalcdfhDal8SbegPcFeGhsdnaPcu9kmbalcofhAascFbGhscrhldninaD8SbbgPcFbGaltasVhsaPcu9kmeaDcefhDalcrfglc8J9hmbkaAhDxekaDcefhDkasce4cbasceG9R7amfgmhAkdndnaXcsSmbaDhsxekaDcefhsaD8SbbglcFeGhPdnalcu9kmbaDcvfhzaPcFbGhPcrhldninas8SbbgDcFbGaltaPVhPaDcu9kmeascefhsalcrfglc8J9hmbkazhsxekascefhskaPce4cbaPceG9R7amfgmhzkdndnaCcsSmbashlxekascefhlas8SbbgDcFeGhPdnaDcu9kmbascvfhOaPcFbGhPcrhDdninal8SbbgscFbGaDtaPVhPascu9kmealcefhlaDcrfgDc8J9hmbkaOhlxekalcefhlkaPce4cbaPceG9R7amfgmhOkdndnadcd9hmbabarcetfgDaA87ebaDclfaO87ebaDcdfaz87ebxekabarcdtfgDaABdbaDcwfaOBdbaDclfazBdbkavc;abfaocitfgDazBdbaDaABdlavaicdtfaABdbavc;abfaocefcsGcitfgDaOBdbaDazBdlavaicefgicsGcdtfazBdbavc;abfaocdfcsGcitfgDaABdbaDaOBdlavaiaHcz6aXcsSVfgicsGcdtfaOBdbaiaCTaCcsSVfhiaocifhokawcefhwaocsGhoaicsGhiarcifgrae6mbkkcbc99alaqSEhokavc;aef8Kjjjjbaok:clevu8Jjjjjbcz9Rhvdnaecvfal9nmbc9:skdnaiRbbc;:eGc;qeSmbcuskav9cb83iwaicefhoaialfc98fhrdnaeTmbdnadcdSmbcbhwindnaoar6mbc9:skaocefhlao8SbbgicFeGhddndnaicu9mmbalhoxekaocvfhoadcFbGhdcrhidninal8SbbgDcFbGaitadVhdaDcu9kmealcefhlaicrfgic8J9hmbxdkkalcefhokabawcdtfadc8Etc8F91adcd47avcwfadceGcdtVglydbfgiBdbalaiBdbawcefgwae9hmbxdkkcbhwindnaoar6mbc9:skaocefhlao8SbbgicFeGhddndnaicu9mmbalhoxekaocvfhoadcFbGhdcrhidninal8SbbgDcFbGaitadVhdaDcu9kmealcefhlaicrfgic8J9hmbxdkkalcefhokabawcetfadc8Etc8F91adcd47avcwfadceGcdtVglydbfgi87ebalaiBdbawcefgwae9hmbkkcbc99aoarSEk:SPliuo97eue978Jjjjjbca9Rhiaec98Ghldndnadcl9hmbdnalTmbcbhvabhdinadadpbbbgocKp:RecKp:Sep;6egraocwp:RecKp:Sep;6earp;Geaoczp:RecKp:Sep;6egwp;Gep;Kep;LegDpxbbbbbbbbbbbbbbbbp:2egqarpxbbbjbbbjbbbjbbbjgkp9op9rp;Kegrpxbb;:9cbb;:9cbb;:9cbb;:9cararp;MeaDaDp;Meawaqawakp9op9rp;Kegrarp;Mep;Kep;Kep;Jep;Negwp;Mepxbbn0bbn0bbn0bbn0gqp;KepxFbbbFbbbFbbbFbbbp9oaopxbbbFbbbFbbbFbbbFp9op9qarawp;Meaqp;Kecwp:RepxbFbbbFbbbFbbbFbbp9op9qaDawp;Meaqp;Keczp:RepxbbFbbbFbbbFbbbFbp9op9qpkbbadczfhdavclfgval6mbkkalaeSmeaipxbbbbbbbbbbbbbbbbgqpklbaiabalcdtfgdaeciGglcdtgv;8qbbdnalTmbaiaipblbgocKp:RecKp:Sep;6egraocwp:RecKp:Sep;6earp;Geaoczp:RecKp:Sep;6egwp;Gep;Kep;LegDaqp:2egqarpxbbbjbbbjbbbjbbbjgkp9op9rp;Kegrpxbb;:9cbb;:9cbb;:9cbb;:9cararp;MeaDaDp;Meawaqawakp9op9rp;Kegrarp;Mep;Kep;Kep;Jep;Negwp;Mepxbbn0bbn0bbn0bbn0gqp;KepxFbbbFbbbFbbbFbbbp9oaopxbbbFbbbFbbbFbbbFp9op9qarawp;Meaqp;Kecwp:RepxbFbbbFbbbFbbbFbbp9op9qaDawp;Meaqp;Keczp:RepxbbFbbbFbbbFbbbFbp9op9qpklbkadaiav;8qbbskdnalTmbcbhvabhdinadczfgxaxpbbbgopxbbbbbbFFbbbbbbFFgkp9oadpbbbgDaopmbediwDqkzHOAKY8AEgwczp:Reczp:Sep;6egraDaopmlvorxmPsCXQL358E8FpxFubbFubbFubbFubbp9op;7eawczp:Sep;6egwp;Gearp;Gep;Kep;Legopxbbbbbbbbbbbbbbbbp:2egqarpxbbbjbbbjbbbjbbbjgmp9op9rp;Kegrpxb;:FSb;:FSb;:FSb;:FSararp;Meaoaop;Meawaqawamp9op9rp;Kegrarp;Mep;Kep;Kep;Jep;Negwp;Mepxbbn0bbn0bbn0bbn0gqp;KepxFFbbFFbbFFbbFFbbp9oaoawp;Meaqp;Keczp:Rep9qgoarawp;Meaqp;KepxFFbbFFbbFFbbFFbbp9ogrpmwDKYqk8AExm35Ps8E8Fp9qpkbbadaDakp9oaoarpmbezHdiOAlvCXorQLp9qpkbbadcafhdavclfgval6mbkkalaeSmbaiczfpxbbbbbbbbbbbbbbbbgopklbaiaopklbaiabalcitfgdaeciGglcitgv;8qbbdnalTmbaiaipblzgopxbbbbbbFFbbbbbbFFgkp9oaipblbgDaopmbediwDqkzHOAKY8AEgwczp:Reczp:Sep;6egraDaopmlvorxmPsCXQL358E8FpxFubbFubbFubbFubbp9op;7eawczp:Sep;6egwp;Gearp;Gep;Kep;Legopxbbbbbbbbbbbbbbbbp:2egqarpxbbbjbbbjbbbjbbbjgmp9op9rp;Kegrpxb;:FSb;:FSb;:FSb;:FSararp;Meaoaop;Meawaqawamp9op9rp;Kegrarp;Mep;Kep;Kep;Jep;Negwp;Mepxbbn0bbn0bbn0bbn0gqp;KepxFFbbFFbbFFbbFFbbp9oaoawp;Meaqp;Keczp:Rep9qgoarawp;Meaqp;KepxFFbbFFbbFFbbFFbbp9ogrpmwDKYqk8AExm35Ps8E8Fp9qpklzaiaDakp9oaoarpmbezHdiOAlvCXorQLp9qpklbkadaiav;8qbbkk:oDllue97euv978Jjjjjbc8W9Rhidnaec98GglTmbcbhvabhoinaiaopbbbgraoczfgwpbbbgDpmlvorxmPsCXQL358E8Fgqczp:Segkclp:RepklbaopxbbjZbbjZbbjZbbjZpx;Zl81Z;Zl81Z;Zl81Z;Zl81Zakpxibbbibbbibbbibbbp9qp;6ep;NegkaraDpmbediwDqkzHOAKY8AEgrczp:Reczp:Sep;6ep;MegDaDp;Meakarczp:Sep;6ep;Megxaxp;Meakaqczp:Reczp:Sep;6ep;Megqaqp;Mep;Kep;Kep;Lepxbbbbbbbbbbbbbbbbp:4ep;Jepxb;:FSb;:FSb;:FSb;:FSgkp;Mepxbbn0bbn0bbn0bbn0grp;KepxFFbbFFbbFFbbFFbbgmp9oaxakp;Mearp;Keczp:Rep9qgxaDakp;Mearp;Keamp9oaqakp;Mearp;Keczp:Rep9qgkpmbezHdiOAlvCXorQLgrp5baipblbpEb:T:j83ibaocwfarp5eaipblbpEe:T:j83ibawaxakpmwDKYqk8AExm35Ps8E8Fgkp5baipblbpEd:T:j83ibaocKfakp5eaipblbpEi:T:j83ibaocafhoavclfgval6mbkkdnalaeSmbaiczfpxbbbbbbbbbbbbbbbbgkpklbaiakpklbaiabalcitfgoaeciGgvcitgw;8qbbdnavTmbaiaipblbgraipblzgDpmlvorxmPsCXQL358E8Fgqczp:Segkclp:RepklaaipxbbjZbbjZbbjZbbjZpx;Zl81Z;Zl81Z;Zl81Z;Zl81Zakpxibbbibbbibbbibbbp9qp;6ep;NegkaraDpmbediwDqkzHOAKY8AEgrczp:Reczp:Sep;6ep;MegDaDp;Meakarczp:Sep;6ep;Megxaxp;Meakaqczp:Reczp:Sep;6ep;Megqaqp;Mep;Kep;Kep;Lepxbbbbbbbbbbbbbbbbp:4ep;Jepxb;:FSb;:FSb;:FSb;:FSgkp;Mepxbbn0bbn0bbn0bbn0grp;KepxFFbbFFbbFFbbFFbbgmp9oaxakp;Mearp;Keczp:Rep9qgxaDakp;Mearp;Keamp9oaqakp;Mearp;Keczp:Rep9qgkpmbezHdiOAlvCXorQLgrp5baipblapEb:T:j83ibaiarp5eaipblapEe:T:j83iwaiaxakpmwDKYqk8AExm35Ps8E8Fgkp5baipblapEd:T:j83izaiakp5eaipblapEi:T:j83iKkaoaiaw;8qbbkk;uddiue978Jjjjjbc;ab9Rhidnadcd4ae2glc98GgvTmbcbheabhdinadadpbbbgocwp:Recwp:Sep;6eaocep:SepxbbjFbbjFbbjFbbjFp9opxbbjZbbjZbbjZbbjZp:Uep;Mepkbbadczfhdaeclfgeav6mbkkdnavalSmbaic8WfpxbbbbbbbbbbbbbbbbgopklbaicafaopklbaiczfaopklbaiaopklbaiabavcdtfgdalciGgecdtgv;8qbbdnaeTmbaiaipblbgocwp:Recwp:Sep;6eaocep:SepxbbjFbbjFbbjFbbjFp9opxbbjZbbjZbbjZbbjZp:Uep;Mepklbkadaiav;8qbbkk9teiucbcbydj1jjbgeabcifc98GfgbBdj1jjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaikkkebcjwklz:Dbb",r=new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,3,2,0,0,5,3,1,0,1,12,1,0,10,22,2,12,0,65,0,65,0,65,0,252,10,0,0,11,7,0,65,0,253,15,26,11]),a=new Uint8Array([32,0,65,2,1,106,34,33,3,128,11,4,13,64,6,253,10,7,15,116,127,5,8,12,40,16,19,54,20,9,27,255,113,17,42,67,24,23,146,148,18,14,22,45,70,69,56,114,101,21,25,63,75,136,108,28,118,29,73,115]);if(typeof WebAssembly!="object")return{supported:!1};var s=WebAssembly.validate(r)?o(e):o(t),n,i=WebAssembly.instantiate(s,{}).then(function(g){n=g.instance,n.exports.__wasm_call_ctors()});function o(g){for(var y=new Uint8Array(g.length),m=0;m<g.length;++m){var w=g.charCodeAt(m);y[m]=w>96?w-97:w>64?w-39:w+4}for(var E=0,m=0;m<g.length;++m)y[E++]=y[m]<60?a[y[m]]:(y[m]-60)*64+y[++m];return y.buffer.slice(0,E)}function c(g,y,m,w,E,S,A){var T=g.exports.sbrk,_=w+3&-4,R=T(_*E),N=T(S.length),B=new Uint8Array(g.exports.memory.buffer);B.set(S,N);var F=y(R,w,E,N,S.length);if(F==0&&A&&A(R,_,E),m.set(B.subarray(R,R+w*E)),T(R-T(0)),F!=0)throw new Error("Malformed buffer data: "+F)}var l={NONE:"",OCTAHEDRAL:"meshopt_decodeFilterOct",QUATERNION:"meshopt_decodeFilterQuat",EXPONENTIAL:"meshopt_decodeFilterExp"},f={ATTRIBUTES:"meshopt_decodeVertexBuffer",TRIANGLES:"meshopt_decodeIndexBuffer",INDICES:"meshopt_decodeIndexSequence"},u=[],p=0;function b(g){var y={object:new Worker(g),pending:0,requests:{}};return y.object.onmessage=function(m){var w=m.data;y.pending-=w.count,y.requests[w.id][w.action](w.value),delete y.requests[w.id]},y}function h(g){for(var y="self.ready = WebAssembly.instantiate(new Uint8Array(["+new Uint8Array(s)+"]), {}).then(function(result) { result.instance.exports.__wasm_call_ctors(); return result.instance; });self.onmessage = "+x.name+";"+c.toString()+x.toString(),m=new Blob([y],{type:"text/javascript"}),w=URL.createObjectURL(m),E=u.length;E<g;++E)u[E]=b(w);for(var E=g;E<u.length;++E)u[E].object.postMessage({});u.length=g,URL.revokeObjectURL(w)}function d(g,y,m,w,E){for(var S=u[0],A=1;A<u.length;++A)u[A].pending<S.pending&&(S=u[A]);return new Promise(function(T,_){var R=new Uint8Array(m),N=++p;S.pending+=g,S.requests[N]={resolve:T,reject:_},S.object.postMessage({id:N,count:g,size:y,source:R,mode:w,filter:E},[R.buffer])})}function x(g){var y=g.data;if(!y.id)return self.close();self.ready.then(function(m){try{var w=new Uint8Array(y.count*y.size);c(m,m.exports[y.mode],w,y.count,y.size,y.source,m.exports[y.filter]),self.postMessage({id:y.id,count:y.count,action:"resolve",value:w},[w.buffer])}catch(E){self.postMessage({id:y.id,count:y.count,action:"reject",value:E})}})}return{ready:i,supported:!0,useWorkers:function(g){h(g)},decodeVertexBuffer:function(g,y,m,w,E){c(n,n.exports.meshopt_decodeVertexBuffer,g,y,m,w,n.exports[l[E]])},decodeIndexBuffer:function(g,y,m,w){c(n,n.exports.meshopt_decodeIndexBuffer,g,y,m,w)},decodeIndexSequence:function(g,y,m,w){c(n,n.exports.meshopt_decodeIndexSequence,g,y,m,w)},decodeGltfBuffer:function(g,y,m,w,E,S){c(n,n.exports[f[E]],g,y,m,w,n.exports[l[S]])},decodeGltfBufferAsync:function(g,y,m,w,E){return u.length>0?d(g,y,m,f[w],l[E]):i.then(function(){var S=new Uint8Array(g*y);return c(n,n.exports[f[w]],S,g,y,m,n.exports[l[E]]),S})}}})();var TS=(function(){var t="b9H79Tebbbetm9Geueu9Geub9Gbb9Gsuuuuuuuuuuuu99uueu9Gvuuuuub9Gruuuuuuub9Gvuuuuue999Gvuuuuueu9Gquuuuuuu99uueu9Gwuuuuuu99ueu9Giuuue999Gluuuueu9GiuuueuiOHdilvorlwiDqkbxxbelve9Weiiviebeoweuec:G:Pdkr:Tewo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bbz9TW79O9V9Wt9F79P9T9W29P9M95br8E9TW79O9V9Wt9F79P9T9W29P9M959x9Pt9OcttV9P9I91tW7bwQ9TW79O9V9Wt9F79P9T9W29P9M959q9V9P9Ut7bDX9TW79O9V9Wt9F79P9T9W29P9M959t9J9H2Wbqa9TW79O9V9Wt9F9V9Wt9P9T9P96W9wWVtW94SWt9J9O9sW9T9H9Wbkl79IV9RbxDwebcekdzsq;B:xeHdbkM9Hi8Au8A99Au8Jjjjjbc;W;qb9Rgs8Kjjjjbcbhzascxfcbc;Kbz:ojjjb8AdnabaeSmbabaeadcdtz:njjjb8AkdndnamcdGmbascxfhHcbhOxekasalcrfci4gecbyd:m:jjjbHjjjjbbgABdxasceBd2aAcbaez:ojjjbhCcbhlcbhednadTmbcbhlabheadhAinaCaeydbgXci4fgQaQRbbgQceaXcrGgXtV86bbaQcu7aX4ceGalfhlaeclfheaAcufgAmbkcualcdtalcFFFFi0EhekascCfhHasaecbyd:m:jjjbHjjjjbbgOBdzascdBd2alcd4alfhXcehAinaAgecethAaeaX6mbkcdhzcbhLascuaecdtgAaecFFFFi0Ecbyd:m:jjjbHjjjjbbgXBdCasciBd2aXcFeaAz:ojjjbhKdnadTmbaecufhYcbh8AindndnaKabaLcdtfgEydbgQc:v;t;h;Ev2aYGgXcdtfgCydbgAcuSmbceheinaOaAcdtfydbaQSmdaXaefhAaecefheaKaAaYGgXcdtfgCydbgAcu9hmbkkaOa8AcdtfaQBdbaCa8ABdba8AhAa8Acefh8AkaEaABdbaLcefgLad9hmbkkaKcbyd1:jjjbH:bjjjbbascdBd2kcbh3aHcualcefgecdtaecFFFFi0Ecbyd:m:jjjbHjjjjbbg5Bdbasa5BdlasazceVgeBd2ascxfaecdtfcuadcitadcFFFFe0Ecbyd:m:jjjbHjjjjbbg8EBdbasa8EBdwasazcdfgeBd2asclfabadalcbz:cjjjbascxfaecdtfcualcdtgealcFFFFi0Eg8Fcbyd:m:jjjbHjjjjbbgABdbasazcifgXBd2ascxfaXcdtfa8Fcbyd:m:jjjbHjjjjbbgaBdbasazclVBd2aAaaaialavaOascxfz:djjjbalcbyd:m:jjjbHjjjjbbhCascxfasyd2ghcdtfaCBdbasahcefgXBd2ascxfaXcdtfa8Fcbyd:m:jjjbHjjjjbbgXBdbasahcdfgQBd2ascxfaQcdtfa8Fcbyd:m:jjjbHjjjjbbgQBdbasahcifggBd2aXcFeaez:ojjjbh8JaQcFeaez:ojjjbh8KdnalTmba8Ecwfh8Lindna5a3gQcefg3cdtfydbgKa5aQcdtgefydbgXSmbaKaX9Rhza8EaXcitfhHa8Kaefh8Ma8JaefhEcbhYindndnaHaYcitfydbg8AaQ9hmbaEaQBdba8MaQBdbxekdna5a8Acdtg8NfgeclfydbgXaeydbgeSmba8EaecitgKfydbaQSmeaXae9Rhyaecu7aXfhLa8LaKfhXcbheinaLaeSmeaecefheaXydbhKaXcwfhXaKaQ9hmbkaeay6meka8Ka8NfgeaQa8AaeydbcuSEBdbaEa8AaQaEydbcuSEBdbkaYcefgYaz9hmbkka3al9hmbkaAhXaahQa8KhKa8JhYcbheindndnaeaXydbg8A9hmbdnaeaQydbg8A9hmbaYydbh8AdnaKydbgLcu9hmba8Acu9hmbaCaefcb86bbxikaCaefhEdnaeaLSmbaea8ASmbaEce86bbxikaEcl86bbxdkdnaeaaa8AcdtgLfydb9hmbdnaKydbgEcuSmbaeaESmbaYydbgzcuSmbaeazSmba8KaLfydbgHcuSmbaHa8ASmba8JaLfydbgLcuSmbaLa8ASmbdnaAaEcdtfydbg8AaAaLcdtfydb9hmba8AaAazcdtfydbgLSmbaLaAaHcdtfydb9hmbaCaefcd86bbxlkaCaefcl86bbxikaCaefcl86bbxdkaCaefcl86bbxekaCaefaCa8AfRbb86bbkaXclfhXaQclfhQaKclfhKaYclfhYalaecefge9hmbkdnaqTmbdndnaOTmbaOheaAhXalhQindnaqaeydbfRbbTmbaCaXydbfcl86bbkaeclfheaXclfhXaQcufgQmbxdkkaAhealhXindnaqRbbTmbaCaeydbfcl86bbkaqcefhqaeclfheaXcufgXmbkkaAhealhQaChXindnaCaeydbfRbbcl9hmbaXcl86bbkaeclfheaXcefhXaQcufgQmbkkamceGTmbaChealhXindnaeRbbce9hmbaecl86bbkaecefheaXcufgXmbkkascxfagcdtfcualcx2alc;v:Q;v:Qe0Ecbyd:m:jjjbHjjjjbbg3BdbasahclfgHBd2a3aialavaOz:ejjjbh8PdndnaDmbcbhgcbh8Lxekcbh8LawhecbhXindnaeIdbJbbbb9ETmbasc;Wbfa8LcdtfaXBdba8Lcefh8LkaeclfheaDaXcefgX9hmbkascxfaHcdtfcua8Lal2gecdtaecFFFFi0Ecbyd:m:jjjbHjjjjbbggBdbasahcvfgHBd2alTmba8LTmbarcd4hEdnaOTmba8Lcdthzcbh8AaghLinaoaOa8AcdtfydbaE2cdtfhYasc;WbfheaLhXa8LhQinaXaYaeydbcdtgKfIdbawaKfIdbNUdbaeclfheaXclfhXaQcufgQmbkaLazfhLa8Acefg8Aal9hmbxdkka8Lcdthzcbh8AaghLinaoa8AaE2cdtfhYasc;WbfheaLhXa8LhQinaXaYaeydbcdtgKfIdbawaKfIdbNUdbaeclfheaXclfhXaQcufgQmbkaLazfhLa8Acefg8Aal9hmbkkascxfaHcdtfcualc8S2gealc;D;O;f8U0EgQcbyd:m:jjjbHjjjjbbgXBdbasaHcefgKBd2aXcbaez:ojjjbhqdndndna8LTmbascxfaKcdtfaQcbyd:m:jjjbHjjjjbbgvBdbasaHcdfgXBd2avcbaez:ojjjb8AascxfaXcdtfcua8Lal2gecltgXaecFFFFb0Ecbyd:m:jjjbHjjjjbbgiBdbasaHcifBd2aicbaXz:ojjjb8AadmexdkcbhvcbhiadTmekcbhYabhXindna3aXclfydbg8Acx2fgeIdba3aXydbgLcx2fgQIdbgI:tg8Ra3aXcwfydbgEcx2fgKIdlaQIdlg8S:tgRNaKIdbaI:tg8UaeIdla8S:tg8VN:tg8Wa8WNa8VaKIdwaQIdwg8X:tg8YNaRaeIdwa8X:tg8VN:tgRaRNa8Va8UNa8Ya8RN:tg8Ra8RNMM:rg8UJbbbb9ETmba8Wa8U:vh8Wa8Ra8U:vh8RaRa8U:vhRkaqaAaLcdtfydbc8S2fgeaRa8U:rg8UaRNNg8VaeIdbMUdbaea8Ra8Ua8RNg8ZNg8YaeIdlMUdlaea8Wa8Ua8WNg80Ng81aeIdwMUdwaea8ZaRNg8ZaeIdxMUdxaea80aRNgBaeIdzMUdzaea80a8RNg80aeIdCMUdCaeaRa8Ua8Wa8XNaRaINa8Sa8RNMM:mg8SNgINgRaeIdKMUdKaea8RaINg8RaeId3MUd3aea8WaINg8WaeIdaMUdaaeaIa8SNgIaeId8KMUd8Kaea8UaeIdyMUdyaqaAa8Acdtfydbc8S2fgea8VaeIdbMUdbaea8YaeIdlMUdlaea81aeIdwMUdwaea8ZaeIdxMUdxaeaBaeIdzMUdzaea80aeIdCMUdCaeaRaeIdKMUdKaea8RaeId3MUd3aea8WaeIdaMUdaaeaIaeId8KMUd8Kaea8UaeIdyMUdyaqaAaEcdtfydbc8S2fgea8VaeIdbMUdbaea8YaeIdlMUdlaea81aeIdwMUdwaea8ZaeIdxMUdxaeaBaeIdzMUdzaea80aeIdCMUdCaeaRaeIdKMUdKaea8RaeId3MUd3aea8WaeIdaMUdaaeaIaeId8KMUd8Kaea8UaeIdyMUdyaXcxfhXaYcifgYad6mbkcbhzabhLinabazcdtfh8AcbhXinaCa8AaXc;a1jjbfydbcdtfydbgQfRbbhedndnaCaLaXfydbgKfRbbgYc99fcFeGcpe0mbaec99fcFeGc;:e6mekdnaYcufcFeGce0mba8JaKcdtfydbaQ9hmekdnaecufcFeGce0mba8KaQcdtfydbaK9hmekdnaYcv2aefc:G1jjbfRbbTmbaAaQcdtfydbaAaKcdtfydb0mekJbbacJbbacJbbjZaecFeGceSEaYceSEh80dna3a8AaXc;e1jjbfydbcdtfydbcx2fgeIdwa3aKcx2fgYIdwg8S:tg8Wa3aQcx2fgEIdwa8S:tgRaRNaEIdbaYIdbg8X:tg8Ra8RNaEIdlaYIdlg8V:tg8Ua8UNMMgINa8WaRNaeIdba8X:tg81a8RNa8UaeIdla8V:tg8ZNMMg8YaRN:tg8Wa8WNa81aINa8Ya8RN:tgRaRNa8ZaINa8Ya8UN:tg8Ra8RNMM:rg8UJbbbb9ETmba8Wa8U:vh8Wa8Ra8U:vh8RaRa8U:vhRkaqaAaKcdtfydbc8S2fgeaRa80aI:rNg8UaRNNg8YaeIdbMUdbaea8Ra8Ua8RNg80Ng81aeIdlMUdlaea8Wa8Ua8WNgINg8ZaeIdwMUdwaea80aRNg80aeIdxMUdxaeaIaRNgBaeIdzMUdzaeaIa8RNg83aeIdCMUdCaeaRa8Ua8Wa8SNaRa8XNa8Va8RNMM:mg8SNgINgRaeIdKMUdKaea8RaINg8RaeId3MUd3aea8WaINg8WaeIdaMUdaaeaIa8SNgIaeId8KMUd8Kaea8UaeIdyMUdyaqaAaQcdtfydbc8S2fgea8YaeIdbMUdbaea81aeIdlMUdlaea8ZaeIdwMUdwaea80aeIdxMUdxaeaBaeIdzMUdzaea83aeIdCMUdCaeaRaeIdKMUdKaea8RaeId3MUd3aea8WaeIdaMUdaaeaIaeId8KMUd8Kaea8UaeIdyMUdykaXclfgXcx9hmbkaLcxfhLazcifgzad6mbka8LTmbcbhLinJbbbbh8Xa3abaLcdtfgeclfydbgEcx2fgXIdwa3aeydbgzcx2fgQIdwg8Z:tg8Ra8RNaXIdbaQIdbgB:tg8Wa8WNaXIdlaQIdlg83:tg8Ua8UNMMg80a3aecwfydbgHcx2fgeIdwa8Z:tgINa8Ra8RaINa8WaeIdbaB:tg8SNa8UaeIdla83:tg8VNMMgRN:tJbbbbJbbjZa80aIaINa8Sa8SNa8Va8VNMMg81NaRaRN:tg8Y:va8YJbbbb9BEg8YNhUa81a8RNaIaRN:ta8YNh85a80a8VNa8UaRN:ta8YNh86a81a8UNa8VaRN:ta8YNh87a80a8SNa8WaRN:ta8YNh88a81a8WNa8SaRN:ta8YNh89a8Wa8VNa8Sa8UN:tgRaRNa8UaINa8Va8RN:tgRaRNa8Ra8SNaIa8WN:tgRaRNMM:rJbbbZNhRagaza8L2gwcdtfhXagaHa8L2g8NcdtfhQagaEa8L2g5cdtfhKa8Z:mh8:a83:mhZaB:mhncbhYa8Lh8AJbbbbh8VJbbbbh8YJbbbbh80Jbbbbh81Jbbbbh8ZJbbbbhBJbbbbh83JbbbbhcJbbbbh9cinasc;WbfaYfgecwfaRa85aKIdbaXIdbgI:tg8UNaUaQIdbaI:tg8SNMg8RNUdbaeclfaRa87a8UNa86a8SNMg8WNUdbaeaRa89a8UNa88a8SNMg8UNUdbaecxfaRa8:a8RNaZa8WNaIana8UNMMMgINUdbaRa8Ra8WNNa81Mh81aRa8Ra8UNNa8ZMh8ZaRa8Wa8UNNaBMhBaRaIaINNa8XMh8XaRa8RaINNa8VMh8VaRa8WaINNa8YMh8YaRa8UaINNa80Mh80aRa8Ra8RNNa83Mh83aRa8Wa8WNNacMhcaRa8Ua8UNNa9cMh9caXclfhXaKclfhKaQclfhQaYczfhYa8Acufg8Ambkavazc8S2fgea9caeIdbMUdbaeacaeIdlMUdlaea83aeIdwMUdwaeaBaeIdxMUdxaea8ZaeIdzMUdzaea81aeIdCMUdCaea80aeIdKMUdKaea8YaeId3MUd3aea8VaeIdaMUdaaea8XaeId8KMUd8KaeaRaeIdyMUdyavaEc8S2fgea9caeIdbMUdbaeacaeIdlMUdlaea83aeIdwMUdwaeaBaeIdxMUdxaea8ZaeIdzMUdzaea81aeIdCMUdCaea80aeIdKMUdKaea8YaeId3MUd3aea8VaeIdaMUdaaea8XaeId8KMUd8KaeaRaeIdyMUdyavaHc8S2fgea9caeIdbMUdbaeacaeIdlMUdlaea83aeIdwMUdwaeaBaeIdxMUdxaea8ZaeIdzMUdzaea81aeIdCMUdCaea80aeIdKMUdKaea8YaeId3MUd3aea8VaeIdaMUdaaea8XaeId8KMUd8KaeaRaeIdyMUdyaiawcltfh8AcbhXa8LhKina8AaXfgeasc;WbfaXfgQIdbaeIdbMUdbaeclfgYaQclfIdbaYIdbMUdbaecwfgYaQcwfIdbaYIdbMUdbaecxfgeaQcxfIdbaeIdbMUdbaXczfhXaKcufgKmbkaia5cltfh8AcbhXa8LhKina8AaXfgeasc;WbfaXfgQIdbaeIdbMUdbaeclfgYaQclfIdbaYIdbMUdbaecwfgYaQcwfIdbaYIdbMUdbaecxfgeaQcxfIdbaeIdbMUdbaXczfhXaKcufgKmbkaia8Ncltfh8AcbhXa8LhKina8AaXfgeasc;WbfaXfgQIdbaeIdbMUdbaeclfgYaQclfIdbaYIdbMUdbaecwfgYaQcwfIdbaYIdbMUdbaecxfgeaQcxfIdbaeIdbMUdbaXczfhXaKcufgKmbkaLcifgLad6mbkkcbhQdndnamcwGgJmbJbbbbh8Vcbh9ecbhocbhhxekcbh9ea8Fcbyd:m:jjjbHjjjjbbhhascxfasyd2gecdtfahBdbasaecefgXBd2ascxfaXcdtfcuahalabadaAz:fjjjbgKcltaKcjjjjiGEcbyd:m:jjjbHjjjjbbgoBdbasaecdfBd2aoaKaha3alz:gjjjbJFFuuh8VaKTmbaoheaKhXinaeIdbgRa8Va8VaR9EEh8VaeclfheaXcufgXmbkaKh9ekasydlhTdnalTmbaTclfheaTydbhKaChXalhYcbhQincbaeydbg8AaK9RaXRbbcpeGEaQfhQaXcefhXaeclfhea8AhKaYcufgYmbkaQce4hQkcuadaQ9RcifgScx2aSc;v:Q;v:Qe0Ecbyd:m:jjjbHjjjjbbhDascxfasyd2g9hcdtfaDBdbasa9hcefgeBd2ascxfaecdtfcuaScdtaScFFFFi0Ecbyd:m:jjjbHjjjjbbgrBdbasa9hcdfgeBd2ascxfaecdtfa8Fcbyd:m:jjjbHjjjjbbgyBdbasa9hcifgeBd2ascxfaecdtfalcbyd:m:jjjbHjjjjbbg9iBdbasa9hclfg6Bd2axaxNa8PJbbjZamclGEgUaUN:vh9cJbbbbhcdnadak9nmbdnaSci6mba8Lclth9kaDcwfh0Jbbbbh83JbbbbhcinasclfabadalaAz:cjjjbabhzcbh8Ecbh8Finaba8FcdtfhHcbheindnaAazaefydbgQcdtgEfydbgYaAaHaec;q1jjbfydbcdtfydbgXcdtgwfydbg8ASmbaCaXfRbbgLcv2aCaQfRbbgKfc;G1jjbfRbbg5aKcv2aLfg8Nc;G1jjbfRbbg8MVcFeGTmbdna8AaY9nmba8Nc:G1jjbfRbbcFeGmekaKcufhYdnaKaL9hmbaYcFeGce0mba8JaEfydbaX9hmekdndnaKclSmbaLcl9hmekdnaYcFeGce0mba8JaEfydbaX9hmdkaLcufcFeGce0mba8KawfydbaQ9hmekaDa8Ecx2fgKaXaQa8McFeGgYEBdlaKaQaXaYEBdbaKaYa5Gcb9hBdwa8Ecefh8Ekaeclfgecx9hmbkdna8Fcifg8Fad9pmbazcxfhza8EcifaS9nmekka8ETmdcbhLinaqaAaDaLcx2fgKydbgYcdtgzfydbc8S2fgeIdwa3aKydlg8Acx2fgXIdwg8WNaeIdzaXIdbg8UNaeIdaMgRaRMMa8WNaeIdlaXIdlgINaeIdCa8WNaeId3MgRaRMMaINaeIdba8UNaeIdxaINaeIdKMgRaRMMa8UNaeId8KMMM:lhRJbbbbJbbjZaeIdyg8R:va8RJbbbb9BEh8RdndnaKydwgEmbJFFuuh8YxekJbbbbJbbjZaqaAa8Acdtfydbc8S2fgeIdyg8S:va8SJbbbb9BEaeIdwa3aYcx2fgXIdwg8SNaeIdzaXIdbg8XNaeIdaMg8Ya8YMMa8SNaeIdlaXIdlg8YNaeIdCa8SNaeId3Mg8Sa8SMMa8YNaeIdba8XNaeIdxa8YNaeIdKMg8Sa8SMMa8XNaeId8KMMM:lNh8Yka8RaRNh80dna8LTmbavaYc8S2fgQIdwa8WNaQIdza8UNaQIdaMgRaRMMa8WNaQIdlaINaQIdCa8WNaQId3MgRaRMMaINaQIdba8UNaQIdxaINaQIdKMgRaRMMa8UNaQId8KMMMhRaga8Aa8L2gHcdtfhXaiaYa8L2gwcltfheaQIdyh8Sa8LhQinaXIdbg8Ra8Ra8SNaecxfIdba8WaecwfIdbNa8UaeIdbNaIaeclfIdbNMMMg8Ra8RM:tNaRMhRaXclfhXaeczfheaQcufgQmbkdndnaEmbJbbbbh8Rxekava8Ac8S2fgQIdwa3aYcx2fgeIdwg8UNaQIdzaeIdbgINaQIdaMg8Ra8RMMa8UNaQIdlaeIdlg8SNaQIdCa8UNaQId3Mg8Ra8RMMa8SNaQIdbaINaQIdxa8SNaQIdKMg8Ra8RMMaINaQId8KMMMh8RagawcdtfhXaiaHcltfheaQIdyh8Xa8LhQinaXIdbg8Wa8Wa8XNaecxfIdba8UaecwfIdbNaIaeIdbNa8SaeclfIdbNMMMg8Wa8WM:tNa8RMh8RaXclfhXaeczfheaQcufgQmbka8R:lh8Rka80aR:lMh80a8Ya8RMh8YaCaYfRbbcd9hmbdna8Ka8Ja8Jazfydba8ASEaaazfydbgHcdtfydbgzcu9hmbaaa8AcdtfydbhzkavaHc8S2fgQIdwa3azcx2fgeIdwg8WNaQIdzaeIdbg8UNaQIdaMgRaRMMa8WNaQIdlaeIdlgINaQIdCa8WNaQId3MgRaRMMaINaQIdba8UNaQIdxaINaQIdKMgRaRMMa8UNaQId8KMMMhRagaza8L2gwcdtfhXaiaHa8L2g8NcltfheaQIdyh8Sa8LhQinaXIdbg8Ra8Ra8SNaecxfIdba8WaecwfIdbNa8UaeIdbNaIaeclfIdbNMMMg8Ra8RM:tNaRMhRaXclfhXaeczfheaQcufgQmbkdndnaEmbJbbbbh8Rxekavazc8S2fgQIdwa3aHcx2fgeIdwg8UNaQIdzaeIdbgINaQIdaMg8Ra8RMMa8UNaQIdlaeIdlg8SNaQIdCa8UNaQId3Mg8Ra8RMMa8SNaQIdbaINaQIdxa8SNaQIdKMg8Ra8RMMaINaQId8KMMMh8Raga8NcdtfhXaiawcltfheaQIdyh8Xa8LhQinaXIdbg8Wa8Wa8XNaecxfIdba8UaecwfIdbNaIaeIdbNa8SaeclfIdbNMMMg8Wa8WM:tNa8RMh8RaXclfhXaeczfheaQcufgQmbka8R:lh8Rka80aR:lMh80a8Ya8RMh8YkaKa80a8Ya80a8Y9FgeEUdwaKa8AaYaeaETVgeEBdlaKaYa8AaeEBdbaLcefgLa8E9hmbkasc;Wbfcbcj;qbz:ojjjb8Aa0hea8EhXinasc;WbfaeydbcA4cF8FGgQcFAaQcFA6EcdtfgQaQydbcefBdbaecxfheaXcufgXmbkcbhecbhXinasc;WbfaefgQydbhKaQaXBdbaKaXfhXaeclfgecj;qb9hmbkcbhea0hXinasc;WbfaXydbcA4cF8FGgQcFAaQcFA6EcdtfgQaQydbgQcefBdbaraQcdtfaeBdbaXcxfhXa8Eaecefge9hmbkadak9RgQci9Uh9mdnalTmbcbheayhXinaXaeBdbaXclfhXalaecefge9hmbkkcbh9na9icbalz:ojjjbh8FaQcO9Uh9oa9mce4h9pasydwh9qcbh8Mcbh5dninaDara5cdtfydbcx2fg8NIdwgRa9c9Emea8Ma9m9pmeJFFuuh8Rdna9pa8E9pmbaDara9pcdtfydbcx2fIdwJbb;aZNh8RkdnaRa8R9ETmbaRac9ETmba8Ma9o0mdkdna8FaAa8NydlgHcdtg9rfydbgKfg9sRbba8FaAa8Nydbgzcdtg9tfydbgefg9uRbbVmbaCazfRbbh9vdnaTaecdtfgXclfydbgQaXydbgXSmbaQaX9RhYa3aKcx2fhLa3aecx2fhEa9qaXcitfhecbhXcehwdnindnayaeydbcdtfydbgQaKSmbayaeclfydbcdtfydbg8AaKSmbaQa8ASmba3a8Acx2fg8AIdba3aQcx2fgQIdbg8W:tgRaEIdlaQIdlg8U:tg8XNaEIdba8W:tg8Ya8AIdla8U:tg8RN:tgIaRaLIdla8U:tg80NaLIdba8W:tg81a8RN:tg8UNa8RaEIdwaQIdwg8S:tg8ZNa8Xa8AIdwa8S:tg8WN:tg8Xa8RaLIdwa8S:tgBNa80a8WN:tg8RNa8Wa8YNa8ZaRN:tg8Sa8Wa81NaBaRN:tgRNMMaIaINa8Xa8XNa8Sa8SNMMa8Ua8UNa8Ra8RNaRaRNMMN:rJbbj8:N9FmdkaecwfheaXcefgXaY6hwaYaX9hmbkkawceGTmba9pcefh9pxekdndndndna9vc9:fPdebdkazheinayaecdtgefaHBdbaaaefydbgeaz9hmbxikkdna8Ka8Ja8Ja9tfydbaHSEaaa9tfydbgzcdtfydbgecu9hmbaaa9rfydbhekaya9tfaHBdbaehHkayazcdtfaHBdbka9uce86bba9sce86bba8NIdwgRacacaR9DEhca9ncefh9ncecda9vceSEa8Mfh8Mka5cefg5a8E9hmbkka9nTmddnalTmbcbh8AcbhEindnayaEcdtgefydbgQaESmbaAaQcdtfydbhzdnaEaAaefydb9hgHmbaqazc8S2fgeaqaEc8S2fgXIdbaeIdbMUdbaeaXIdlaeIdlMUdlaeaXIdwaeIdwMUdwaeaXIdxaeIdxMUdxaeaXIdzaeIdzMUdzaeaXIdCaeIdCMUdCaeaXIdKaeIdKMUdKaeaXId3aeId3MUd3aeaXIdaaeIdaMUdaaeaXId8KaeId8KMUd8KaeaXIdyaeIdyMUdyka8LTmbavaQc8S2fgeavaEc8S2gwfgXIdbaeIdbMUdbaeaXIdlaeIdlMUdlaeaXIdwaeIdwMUdwaeaXIdxaeIdxMUdxaeaXIdzaeIdzMUdzaeaXIdCaeIdCMUdCaeaXIdKaeIdKMUdKaeaXId3aeId3MUd3aeaXIdaaeIdaMUdaaeaXId8KaeId8KMUd8KaeaXIdyaeIdyMUdya9kaQ2hLaihXa8LhKinaXaLfgeaXa8AfgQIdbaeIdbMUdbaeclfgYaQclfIdbaYIdbMUdbaecwfgYaQcwfIdbaYIdbMUdbaecxfgeaQcxfIdbaeIdbMUdbaXczfhXaKcufgKmbkaHmbJbbbbJbbjZaqawfgeIdygR:vaRJbbbb9BEaeIdwa3azcx2fgXIdwgRNaeIdzaXIdbg8RNaeIdaMg8Wa8WMMaRNaeIdlaXIdlg8WNaeIdCaRNaeId3MgRaRMMa8WNaeIdba8RNaeIdxa8WNaeIdKMgRaRMMa8RNaeId8KMMM:lNgRa83a83aR9DEh83ka8Aa9kfh8AaEcefgEal9hmbkcbhXa8JheindnaeydbgQcuSmbdnaXayaQcdtgKfydbgQ9hmbcuhQa8JaKfydbgKcuSmbayaKcdtfydbhQkaeaQBdbkaeclfhealaXcefgX9hmbkcbhXa8KheindnaeydbgQcuSmbdnaXayaQcdtgKfydbgQ9hmbcuhQa8KaKfydbgKcuSmbayaKcdtfydbhQkaeaQBdbkaeclfhealaXcefgX9hmbkka83aca8LEh83cbhKabhecbhYindnayaeydbcdtfydbgXayaeclfydbcdtfydbgQSmbaXayaecwfydbcdtfydbg8ASmbaQa8ASmbabaKcdtfgLaXBdbaLcwfa8ABdbaLclfaQBdbaKcifhKkaecxfheaYcifgYad6mbkdndnaJTmbaKak9nmba8Va839FTmbcbhdabhecbhXindnaoahaeydbgQcdtfydbcdtfIdba839ETmbabadcdtfgYaQBdbaYclfaeclfydbBdbaYcwfaecwfydbBdbadcifhdkaecxfheaXcifgXaK6mbkJFFuuh8Va9eTmeaohea9ehXJFFuuhRinaeIdbg8RaRaRa8R9EEg8WaRa8Ra839EgQEhRa8Wa8VaQEh8VaeclfheaXcufgXmbxdkkaKhdkadak0mbxdkkasclfabadalaAz:cjjjbkdndnadak0mbadhXxekdnaJmbadhXxekdna8Va9c9FmbadhXxekina8VJbb;aZNgRa9caRa9c9DEh8WJbbbbhRdna9eTmbaohea9ehAinaeIdbg8RaRa8Ra8W9FEaRa8RaR9EEhRaeclfheaAcufgAmbkkcbhXabhecbhAindnaoahaeydbgQcdtfydbcdtfIdba8W9ETmbabaXcdtfgKaQBdbaKclfaeclfydbBdbaKcwfaecwfydbBdbaXcifhXkaecxfheaAcifgAad6mbkJFFuuh8Vdna9eTmbaohea9ehAJFFuuh8RinaeIdbg8Ua8Ra8Ra8U9EEgIa8Ra8Ua8W9EgQEh8RaIa8VaQEh8VaeclfheaAcufgAmbkkdnaXad9hmbadhXxdkaRacacaR9DEhcaXak9nmeaXhda8Va9c9FmbkkdnamcjjjjlGTmbaOmbaXTmbcbh8AabheinaCaeydbgKfRbbc3thLaecwfgEydbhAdndna8JaKcdtgHfydbaeclfgzydbgQSmbcbhYa8KaQcdtfydbaK9hmekcjjjj94hYkaeaLaYVaKVBdbaCaQfRbbc3thLdndna8JaQcdtfydbaASmbcbhYa8KaAcdtfydbaQ9hmekcjjjj94hYkazaLaYVaQVBdbaCaAfRbbc3thYdndna8JaAcdtfydbaKSmbcbhQa8KaHfydbaA9hmekcjjjj94hQkaEaYaQVaAVBdbaecxfhea8Acifg8AaX6mbkkdnaOTmbaXTmbaXheinabaOabydbcdtfydbBdbabclfhbaecufgembkkdnaPTmbaPaUac:rNUdbka9hcdtascxffcxfhednina6Tmeaeydbcbyd1:jjjbH:bjjjbbaec98fhea6cufh6xbkkasc;W;qbf8KjjjjbaXk;Yieouabydlhvabydbclfcbaicdtz:ojjjbhoadci9UhrdnadTmbdnalTmbaehwadhDinaoalawydbcdtfydbcdtfgqaqydbcefBdbawclfhwaDcufgDmbxdkkaehwadhDinaoawydbcdtfgqaqydbcefBdbawclfhwaDcufgDmbkkdnaiTmbcbhDaohwinawydbhqawaDBdbawclfhwaqaDfhDaicufgimbkkdnadci6mbinaecwfydbhwaeclfydbhDaeydbhidnalTmbalawcdtfydbhwalaDcdtfydbhDalaicdtfydbhikavaoaicdtfgqydbcitfaDBdbavaqydbcitfawBdlaqaqydbcefBdbavaoaDcdtfgqydbcitfawBdbavaqydbcitfaiBdlaqaqydbcefBdbavaoawcdtfgwydbcitfaiBdbavawydbcitfaDBdlawawydbcefBdbaecxfhearcufgrmbkkabydbcbBdbk:todDue99aicd4aifhrcehwinawgDcethwaDar6mbkcuaDcdtgraDcFFFFi0Ecbyd:m:jjjbHjjjjbbhwaoaoyd9GgqcefBd9GaoaqcdtfawBdbawcFearz:ojjjbhkdnaiTmbalcd4hlaDcufhxcbhminamhDdnavTmbavamcdtfydbhDkcbadaDal2cdtfgDydlgwawcjjjj94SEgwcH4aw7c:F:b:DD2cbaDydbgwawcjjjj94SEgwcH4aw7c;D;O:B8J27cbaDydwgDaDcjjjj94SEgDcH4aD7c:3F;N8N27axGhwamcdthPdndndnavTmbakawcdtfgrydbgDcuSmeadavaPfydbal2cdtfgsIdbhzcehqinaqhrdnadavaDcdtfydbal2cdtfgqIdbaz9CmbaqIdlasIdl9CmbaqIdwasIdw9BmlkarcefhqakawarfaxGgwcdtfgrydbgDcu9hmbxdkkakawcdtfgrydbgDcuSmbadamal2cdtfgsIdbhzcehqinaqhrdnadaDal2cdtfgqIdbaz9CmbaqIdlasIdl9CmbaqIdwasIdw9BmikarcefhqakawarfaxGgwcdtfgrydbgDcu9hmbkkaramBdbamhDkabaPfaDBdbamcefgmai9hmbkkakcbyd1:jjjbH:bjjjbbaoaoyd9GcufBd9GdnaeTmbaiTmbcbhDaehwinawaDBdbawclfhwaiaDcefgD9hmbkcbhDaehwindnaDabydbgrSmbawaearcdtfgrydbBdbaraDBdbkawclfhwabclfhbaiaDcefgD9hmbkkk;Qodvuv998Jjjjjbca9Rgvczfcwfcbyd11jjbBdbavcb8Pdj1jjb83izavcwfcbydN1jjbBdbavcb8Pd:m1jjb83ibdnadTmbaicd4hodnabmbdnalTmbcbhrinaealarcdtfydbao2cdtfhwcbhiinavczfaifgDawaifIdbgqaDIdbgkakaq9EEUdbavaifgDaqaDIdbgkakaq9DEUdbaiclfgicx9hmbkarcefgrad9hmbxikkaocdthrcbhwincbhiinavczfaifgDaeaifIdbgqaDIdbgkakaq9EEUdbavaifgDaqaDIdbgkakaq9DEUdbaiclfgicx9hmbkaearfheawcefgwad9hmbxdkkdnalTmbcbhrinabarcx2fgiaealarcdtfydbao2cdtfgwIdbUdbaiawIdlUdlaiawIdwUdwcbhiinavczfaifgDawaifIdbgqaDIdbgkakaq9EEUdbavaifgDaqaDIdbgkakaq9DEUdbaiclfgicx9hmbkarcefgrad9hmbxdkkaocdthlcbhraehwinabarcx2fgiaearao2cdtfgDIdbUdbaiaDIdlUdlaiaDIdwUdwcbhiinavczfaifgDawaifIdbgqaDIdbgkakaq9EEUdbavaifgDaqaDIdbgkakaq9DEUdbaiclfgicx9hmbkawalfhwarcefgrad9hmbkkJbbbbavIdbavIdzgk:tgqaqJbbbb9DEgqavIdlavIdCgx:tgmamaq9DEgqavIdwavIdKgm:tgPaPaq9DEhPdnabTmbadTmbJbbbbJbbjZaP:vaPJbbbb9BEhqinabaqabIdbak:tNUdbabclfgvaqavIdbax:tNUdbabcwfgvaqavIdbam:tNUdbabcxfhbadcufgdmbkkaPk:ZlewudnaeTmbcbhvabhoinaoavBdbaoclfhoaeavcefgv9hmbkkdnaiTmbcbhrinadarcdtfhwcbhDinalawaDcdtgvc;a1jjbfydbcdtfydbcdtfydbhodnabalawavfydbcdtfydbgqcdtfgkydbgvaqSmbinakabavgqcdtfgxydbgvBdbaxhkaqav9hmbkkdnabaocdtfgkydbgvaoSmbinakabavgocdtfgxydbgvBdbaxhkaoav9hmbkkdnaqaoSmbabaqaoaqao0Ecdtfaqaoaqao6EBdbkaDcefgDci9hmbkarcifgrai6mbkkdnaembcbskcbhxindnalaxcdtgvfydbax9hmbaxhodnabavfgDydbgvaxSmbaDhqinaqabavgocdtfgkydbgvBdbakhqaoav9hmbkkaDaoBdbkaxcefgxae9hmbkcbhvabhocbhkindndnavalydbgq9hmbdnavaoydbgq9hmbaoakBdbakcefhkxdkaoabaqcdtfydbBdbxekaoabaqcdtfydbBdbkaoclfhoalclfhlaeavcefgv9hmbkakk;Jiilud99duabcbaecltz:ojjjbhvdnalTmbadhoaihralhwinarcwfIdbhDarclfIdbhqavaoydbcltfgkarIdbakIdbMUdbakclfgxaqaxIdbMUdbakcwfgxaDaxIdbMUdbakcxfgkakIdbJbbjZMUdbaoclfhoarcxfhrawcufgwmbkkdnaeTmbavhraehkinarcxfgoIdbhDaocbBdbararIdbJbbbbJbbjZaD:vaDJbbbb9BEgDNUdbarclfgoaDaoIdbNUdbarcwfgoaDaoIdbNUdbarczfhrakcufgkmbkkdnalTmbinavadydbcltfgrcxfgkaicwfIdbarcwfIdb:tgDaDNaiIdbarIdb:tgDaDNaiclfIdbarclfIdb:tgDaDNMMgDakIdbgqaqaD9DEUdbadclfhdaicxfhialcufglmbkkdnaeTmbavcxfhrinabarIdbUdbarczfhrabclfhbaecufgembkkk8MbabaeadaialavcbcbcbcbcbaoarawaDz:bjjjbk8MbabaeadaialavaoarawaDaqakaxamaPz:bjjjbk:DCoDud99rue99iul998Jjjjjbc;Wb9Rgw8KjjjjbdndnarmbcbhDxekawcxfcbc;Kbz:ojjjb8Aawcuadcx2adc;v:Q;v:Qe0Ecbyd:m:jjjbHjjjjbbgqBdxawceBd2aqaeadaicbz:ejjjb8AawcuadcdtadcFFFFi0Egkcbyd:m:jjjbHjjjjbbgxBdzawcdBd2adcd4adfhmceheinaegicetheaiam6mbkcbhPawcuaicdtgsaicFFFFi0Ecbyd:m:jjjbHjjjjbbgzBdCawciBd2dndnar:ZgH:rJbbbZMgO:lJbbb9p9DTmbaO:Ohexekcjjjj94hekaicufhAc:bwhmcbhCadhXcbhQinaChLaeamgKcufaeaK9iEaPgDcefaeaD9kEhYdndnadTmbaYcuf:YhOaqhiaxheadhmindndnaiIdbaONJbbbZMg8A:lJbbb9p9DTmba8A:OhCxekcjjjj94hCkaCcCthCdndnaiclfIdbaONJbbbZMg8A:lJbbb9p9DTmba8A:OhExekcjjjj94hEkaEcqtaCVhCdndnaicwfIdbaONJbbbZMg8A:lJbbb9p9DTmba8A:OhExekcjjjj94hEkaeaCaEVBdbaicxfhiaeclfheamcufgmmbkazcFeasz:ojjjbh3cbh5cbhPindna3axaPcdtfydbgCcm4aC7c:v;t;h;Ev2gics4ai7aAGgmcdtfgEydbgecuSmbaeaCSmbcehiina3amaifaAGgmcdtfgEydbgecuSmeaicefhiaeaC9hmbkkaEaCBdba5aecuSfh5aPcefgPad9hmbxdkkazcFeasz:ojjjb8Acbh5kaDaYa5ar0giEhPaLa5aiEhCdna5arSmbaYaKaiEgmaP9Rcd9imbdndnaQcl0mbdnaX:ZgOaL:Zg8A:taY:Yg8EaD:Y:tg8Fa8EaK:Y:tgaa5:ZghaH:tNNNaOaH:taaNa8Aah:tNa8AaH:ta8FNahaO:tNM:va8EMJbbbZMgO:lJbbb9p9DTmbaO:Ohexdkcjjjj94hexekaPamfcd9Theka5aXaiEhXaQcefgQcs9hmekkdndnaCmbcihicbhDxekcbhiawakcbyd:m:jjjbHjjjjbbg5BdKawclBd2aPcuf:Yh8AdndnadTmbaqhiaxheadhmindndnaiIdba8ANJbbbZMgO:lJbbb9p9DTmbaO:OhCxekcjjjj94hCkaCcCthCdndnaiclfIdba8ANJbbbZMgO:lJbbb9p9DTmbaO:OhExekcjjjj94hEkaEcqtaCVhCdndnaicwfIdba8ANJbbbZMgO:lJbbb9p9DTmbaO:OhExekcjjjj94hEkaeaCaEVBdbaicxfhiaeclfheamcufgmmbkazcFeasz:ojjjbh3cbhDcbhYindndndna3axaYcdtgKfydbgCcm4aC7c:v;t;h;Ev2gics4ai7aAGgmcdtfgEydbgecuSmbcehiinaxaecdtgefydbaCSmdamaifheaicefhia3aeaAGgmcdtfgEydbgecu9hmbkkaEaYBdbaDhiaDcefhDxeka5aefydbhika5aKfaiBdbaYcefgYad9hmbkcuaDc32giaDc;j:KM;jb0EhexekazcFeasz:ojjjb8AcbhDcbhekawaecbyd:m:jjjbHjjjjbbgeBd3awcvBd2aecbaiz:ojjjbhEavcd4hKdnadTmbdnalTmbaKcdth3a5hCaqhealhmadhAinaEaCydbc32fgiaeIdbaiIdbMUdbaiaeclfIdbaiIdlMUdlaiaecwfIdbaiIdwMUdwaiamIdbaiIdxMUdxaiamclfIdbaiIdzMUdzaiamcwfIdbaiIdCMUdCaiaiIdKJbbjZMUdKaCclfhCaecxfheama3fhmaAcufgAmbxdkka5hmaqheadhCinaEamydbc32fgiaeIdbaiIdbMUdbaiaeclfIdbaiIdlMUdlaiaecwfIdbaiIdwMUdwaiaiIdxJbbbbMUdxaiaiIdzJbbbbMUdzaiaiIdCJbbbbMUdCaiaiIdKJbbjZMUdKamclfhmaecxfheaCcufgCmbkkdnaDTmbaEhiaDheinaiaiIdbJbbbbJbbjZaicKfIdbgO:vaOJbbbb9BEgONUdbaiclfgmaOamIdbNUdbaicwfgmaOamIdbNUdbaicxfgmaOamIdbNUdbaiczfgmaOamIdbNUdbaicCfgmaOamIdbNUdbaic3fhiaecufgembkkcbhCawcuaDcdtgYaDcFFFFi0Egicbyd:m:jjjbHjjjjbbgeBdaawcoBd2awaicbyd:m:jjjbHjjjjbbg3Bd8KaecFeaYz:ojjjbhxdnadTmbJbbjZJbbjZa8A:vaPceSEaoNgOaONh8AaKcdthPalheina8Aaec;81jjbalEgmIdwaEa5ydbgAc32fgiIdC:tgOaONamIdbaiIdx:tgOaONamIdlaiIdz:tgOaONMMNaqcwfIdbaiIdw:tgOaONaqIdbaiIdb:tgOaONaqclfIdbaiIdl:tgOaONMMMhOdndnaxaAcdtgifgmydbcuSmba3aifIdbaO9ETmekamaCBdba3aifaOUdbka5clfh5aqcxfhqaeaPfheadaCcefgC9hmbkkabaxaYz:njjjb8AcrhikaicdthiinaiTmeaic98fgiawcxffydbcbyd1:jjjbH:bjjjbbxbkkawc;Wbf8KjjjjbaDk:Ydidui99ducbhi8Jjjjjbca9Rglczfcwfcbyd11jjbBdbalcb8Pdj1jjb83izalcwfcbydN1jjbBdbalcb8Pd:m1jjb83ibdndnaembJbbjFhvJbbjFhoJbbjFhrxekadcd4cdthwincbhdinalczfadfgDabadfIdbgvaDIdbgoaoav9EEUdbaladfgDavaDIdbgoaoav9DEUdbadclfgdcx9hmbkabawfhbaicefgiae9hmbkalIdwalIdK:thralIdlalIdC:thoalIdbalIdz:thvkJbbbbavavJbbbb9DEgvaoaoav9DEgvararav9DEk9DeeuabcFeaicdtz:ojjjbhlcbhbdnadTmbindnalaeydbcdtfgiydbcu9hmbaiabBdbabcefhbkaeclfheadcufgdmbkkabk9teiucbcbyd:q:jjjbgeabcifc98GfgbBd:q:jjjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik;teeeudndnaeabVciGTmbabhixekdndnadcz9pmbabhixekabhiinaiaeydbBdbaiaeydlBdlaiaeydwBdwaiaeydxBdxaeczfheaiczfhiadc9Wfgdcs0mbkkadcl6mbinaiaeydbBdbaeclfheaiclfhiadc98fgdci0mbkkdnadTmbinaiaeRbb86bbaicefhiaecefheadcufgdmbkkabk:3eedudndnabciGTmbabhixekaecFeGc:b:c:ew2hldndnadcz9pmbabhixekabhiinaialBdxaialBdwaialBdlaialBdbaiczfhiadc9Wfgdcs0mbkkadcl6mbinaialBdbaiclfhiadc98fgdci0mbkkdnadTmbinaiae86bbaicefhiadcufgdmbkkabk9teiucbcbyd:q:jjjbgeabcrfc94GfgbBd:q:jjjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik9:eiuZbhedndncbyd:q:jjjbgdaecztgi9nmbcuheadai9RcFFifcz4nbcuSmekadhekcbabae9Rcifc98Gcbyd:q:jjjbfgdBd:q:jjjbdnadZbcztge9nmbadae9RcFFifcz4nb8Akkk:Iedbcjwk1eFFuuFFuuFFuuFFuFFFuFFFuFbbbbbbbbeeebeebebbeeebebbbbbebebbbbbbbbbebbbdbbbbbbbebbbebbbdbbbbbbbbbbbeeeeebebbebbebebbbeebbbbbbbbbbbbbbbbbbbbbc1Dkxebbbdbbb:GNbb",e=new Uint8Array([32,0,65,2,1,106,34,33,3,128,11,4,13,64,6,253,10,7,15,116,127,5,8,12,40,16,19,54,20,9,27,255,113,17,42,67,24,23,146,148,18,14,22,45,70,69,56,114,101,21,25,63,75,136,108,28,118,29,73,115]);if(typeof WebAssembly!="object")return{supported:!1};var r,a=WebAssembly.instantiate(s(t),{}).then(function(h){r=h.instance,r.exports.__wasm_call_ctors()});function s(h){for(var d=new Uint8Array(h.length),x=0;x<h.length;++x){var g=h.charCodeAt(x);d[x]=g>96?g-97:g>64?g-39:g+4}for(var y=0,x=0;x<h.length;++x)d[y++]=d[x]<60?e[d[x]]:(d[x]-60)*64+d[++x];return d.buffer.slice(0,y)}function n(h){if(!h)throw new Error("Assertion failed")}function i(h){return new Uint8Array(h.buffer,h.byteOffset,h.byteLength)}function o(h,d,x){var g=r.exports.sbrk,y=g(d.length*4),m=g(x*4),w=new Uint8Array(r.exports.memory.buffer),E=i(d);w.set(E,y);var S=h(m,y,d.length,x);w=new Uint8Array(r.exports.memory.buffer);var A=new Uint32Array(x);new Uint8Array(A.buffer).set(w.subarray(m,m+x*4)),E.set(w.subarray(y,y+d.length*4)),g(y-g(0));for(var T=0;T<d.length;++T)d[T]=A[d[T]];return[A,S]}function c(h){for(var d=0,x=0;x<h.length;++x){var g=h[x];d=d<g?g:d}return d}function l(h,d,x,g,y,m,w,E,S){var A=r.exports.sbrk,T=A(4),_=A(x*4),R=A(y*m),N=A(x*4),B=new Uint8Array(r.exports.memory.buffer);B.set(i(g),R),B.set(i(d),N);var F=h(_,N,x,R,y,m,w,E,S,T);B=new Uint8Array(r.exports.memory.buffer);var K=new Uint32Array(F);i(K).set(B.subarray(_,_+F*4));var $=new Float32Array(1);return i($).set(B.subarray(T,T+4)),A(T-A(0)),[K,$[0]]}function f(h,d,x,g,y,m,w,E,S,A,T,_,R){var N=r.exports.sbrk,B=N(4),F=N(x*4),K=N(y*m),$=N(y*E),se=N(S.length*4),de=N(x*4),Ke=A?N(y):0,be=new Uint8Array(r.exports.memory.buffer);be.set(i(g),K),be.set(i(w),$),be.set(i(S),se),be.set(i(d),de),A&&be.set(i(A),Ke);var Ve=h(F,de,x,K,y,m,$,E,se,S.length,Ke,T,_,R,B);be=new Uint8Array(r.exports.memory.buffer);var Ze=new Uint32Array(Ve);i(Ze).set(be.subarray(F,F+Ve*4));var _e=new Float32Array(1);return i(_e).set(be.subarray(B,B+4)),N(B-N(0)),[Ze,_e[0]]}function u(h,d,x,g){var y=r.exports.sbrk,m=y(x*g),w=new Uint8Array(r.exports.memory.buffer);w.set(i(d),m);var E=h(m,x,g);return y(m-y(0)),E}function p(h,d,x,g,y,m,w,E){var S=r.exports.sbrk,A=S(E*4),T=S(x*g),_=S(x*m),R=new Uint8Array(r.exports.memory.buffer);R.set(i(d),T),y&&R.set(i(y),_);var N=h(A,T,x,g,_,m,w,E);R=new Uint8Array(r.exports.memory.buffer);var B=new Uint32Array(N);return i(B).set(R.subarray(A,A+N*4)),S(A-S(0)),B}var b={LockBorder:1,Sparse:2,ErrorAbsolute:4,Prune:8,_InternalDebug:1<<30};return{ready:a,supported:!0,compactMesh:function(h){n(h instanceof Uint32Array||h instanceof Int32Array||h instanceof Uint16Array||h instanceof Int16Array),n(h.length%3==0);var d=h.BYTES_PER_ELEMENT==4?h:new Uint32Array(h);return o(r.exports.meshopt_optimizeVertexFetchRemap,d,c(h)+1)},simplify:function(h,d,x,g,y,m){n(h instanceof Uint32Array||h instanceof Int32Array||h instanceof Uint16Array||h instanceof Int16Array),n(h.length%3==0),n(d instanceof Float32Array),n(d.length%x==0),n(x>=3),n(g>=0&&g<=h.length),n(g%3==0),n(y>=0);for(var w=0,E=0;E<(m?m.length:0);++E)n(m[E]in b),w|=b[m[E]];var S=h.BYTES_PER_ELEMENT==4?h:new Uint32Array(h),A=l(r.exports.meshopt_simplify,S,h.length,d,d.length/x,x*4,g,y,w);return A[0]=h instanceof Uint32Array?A[0]:new h.constructor(A[0]),A},simplifyWithAttributes:function(h,d,x,g,y,m,w,E,S,A){n(h instanceof Uint32Array||h instanceof Int32Array||h instanceof Uint16Array||h instanceof Int16Array),n(h.length%3==0),n(d instanceof Float32Array),n(d.length%x==0),n(x>=3),n(g instanceof Float32Array),n(g.length%y==0),n(y>=0),n(w==null||w instanceof Uint8Array),n(w==null||w.length==d.length/x),n(E>=0&&E<=h.length),n(E%3==0),n(S>=0),n(Array.isArray(m)),n(y>=m.length),n(m.length<=32);for(var T=0;T<m.length;++T)n(m[T]>=0);for(var _=0,T=0;T<(A?A.length:0);++T)n(A[T]in b),_|=b[A[T]];var R=h.BYTES_PER_ELEMENT==4?h:new Uint32Array(h),N=f(r.exports.meshopt_simplifyWithAttributes,R,h.length,d,d.length/x,x*4,g,y*4,new Float32Array(m),w?new Uint8Array(w):null,E,S,_);return N[0]=h instanceof Uint32Array?N[0]:new h.constructor(N[0]),N},getScale:function(h,d){return n(h instanceof Float32Array),n(h.length%d==0),n(d>=3),u(r.exports.meshopt_simplifyScale,h,h.length/d,d*4)},simplifyPoints:function(h,d,x,g,y,m){return n(h instanceof Float32Array),n(h.length%d==0),n(d>=3),n(x>=0&&x<=h.length/d),g?(n(g instanceof Float32Array),n(g.length%y==0),n(y>=3),n(h.length/d==g.length/y),p(r.exports.meshopt_simplifyPoints,h,h.length/d,d*4,g,y*4,m,x)):p(r.exports.meshopt_simplifyPoints,h,h.length/d,d*4,void 0,0,0,x)}}})();var IS=(function(){var t="b9H79TebbbeVx9Geueu9Geub9Gbb9Giuuueu9Gmuuuuuuuuuuu9999eu9Gvuuuuueu9Gwuuuuuuuub9Gxuuuuuuuuuuuueu9Gkuuuuuuuuuu99eu9Gouuuuuub9Gruuuuuuub9GluuuubiOHdilvorwDqqkbiibeilve9Weiiviebeoweuec;G:Odkr:Yewo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bb8A9TW79O9V9Wt9F9I919P29K9nW79O2Wt79c9V919U9KbeX9TW79O9V9Wt9F9I919P29K9nW79O2Wt7bo39TW79O9V9Wt9F9J9V9T9W91tWJ2917tWV9c9V919U9K7br39TW79O9V9Wt9F9J9V9T9W91tW9nW79O2Wt9c9V919U9K7bDL9TW79O9V9Wt9F9V9Wt9P9T9P96W9nW79O2Wtbql79IV9RbkDwebcekdsPq;Q9BHdbkIbabaec9:fgefcufae9Ugeabci9Uadfcufad9Ugbaeab0Ek:w8KDPue99eux99dui99euo99iu8Jjjjjbc:WD9Rgm8KjjjjbdndnalmbcbhPxekamc:Cwfcbc;Kbz:njjjb8Adndnalcb9imbaoal9nmbamcuaocdtaocFFFFi0Egscbyd;y1jjbHjjjjbbgzBd:CwamceBd;8wamascbyd;y1jjbHjjjjbbgHBd:GwamcdBd;8wamcualcdtalcFFFFi0Ecbyd;y1jjbHjjjjbbgOBd:KwamciBd;8waihsalhAinazasydbcdtfcbBdbasclfhsaAcufgAmbkaihsalhAinazasydbcdtfgCaCydbcefBdbasclfhsaAcufgAmbkaihsalhCcbhXindnazasydbcdtgQfgAydbcb9imbaHaQfaXBdbaAaAydbgQcjjjj94VBdbaQaXfhXkasclfhsaCcufgCmbkalci9UhLdnalci6mbcbhsaihAinaAcwfydbhCaAclfydbhXaHaAydbcdtfgQaQydbgQcefBdbaOaQcdtfasBdbaHaXcdtfgXaXydbgXcefBdbaOaXcdtfasBdbaHaCcdtfgCaCydbgCcefBdbaOaCcdtfasBdbaAcxfhAaLascefgs9hmbkkaihsalhAindnazasydbcdtgCfgXydbgQcu9kmbaXaQcFFFFrGgQBdbaHaCfgCaCydbaQ9RBdbkasclfhsaAcufgAmbxdkkamcuaocdtgsaocFFFFi0EgAcbyd;y1jjbHjjjjbbgzBd:CwamceBd;8wamaAcbyd;y1jjbHjjjjbbgHBd:GwamcdBd;8wamcualcdtalcFFFFi0Ecbyd;y1jjbHjjjjbbgOBd:KwamciBd;8wazcbasz:njjjbhXalci9UhLaihsalhAinaXasydbcdtfgCaCydbcefBdbasclfhsaAcufgAmbkdnaoTmbcbhsaHhAaXhCaohQinaAasBdbaAclfhAaCydbasfhsaCclfhCaQcufgQmbkkdnalci6mbcbhsaihAinaAcwfydbhCaAclfydbhQaHaAydbcdtfgKaKydbgKcefBdbaOaKcdtfasBdbaHaQcdtfgQaQydbgQcefBdbaOaQcdtfasBdbaHaCcdtfgCaCydbgCcefBdbaOaCcdtfasBdbaAcxfhAaLascefgs9hmbkkaoTmbcbhsaohAinaHasfgCaCydbaXasfydb9RBdbasclfhsaAcufgAmbkkamaLcbyd;y1jjbHjjjjbbgsBd:OwamclBd;8wascbaLz:njjjbhYamcuaLcK2alcjjjjd0Ecbyd;y1jjbHjjjjbbg8ABd:SwamcvBd;8wJbbbbhEdnalci6g3mbarcd4hKaihAa8AhsaLhrJbbbbh5inavaAclfydbaK2cdtfgCIdlh8EavaAydbaK2cdtfgXIdlhEavaAcwfydbaK2cdtfgQIdlh8FaCIdwhaaXIdwhhaQIdwhgasaCIdbg8JaXIdbg8KMaQIdbg8LMJbbnn:vUdbasclfaXIdlaCIdlMaQIdlMJbbnn:vUdbaQIdwh8MaCIdwh8NaXIdwhyascxfa8EaE:tg8Eagah:tggNa8FaE:tg8Faaah:tgaN:tgEJbbbbJbbjZa8Ja8K:tg8Ja8FNa8La8K:tg8Ka8EN:tghahNaEaENaaa8KNaga8JN:tgEaENMM:rg8K:va8KJbbbb9BEg8ENUdbasczfaEa8ENUdbascCfaha8ENUdbascwfa8Maya8NMMJbbnn:vUdba5a8KMh5aAcxfhAascKfhsarcufgrmbka5aL:Z:vJbbbZNhEkamcuaLcdtalcFFFF970Ecbyd;y1jjbHjjjjbbgCBd:WwamcoBd;8waEaq:ZNhEdna3mbcbhsaChAinaAasBdbaAclfhAaLascefgs9hmbkkaE:rhhcuh8PamcuaLcltalcFFFFd0Ecbyd;y1jjbHjjjjbbgIBd:0wamcrBd;8wcbaIa8AaCaLz:djjjb8AJFFuuhyJFFuuh8RJFFuuh8Sdnalci6gXmbJFFuuh8Sa8AhsaLhAJFFuuh8RJFFuuhyinascwfIdbgEayayaE9EEhyasclfIdbgEa8Ra8RaE9EEh8RasIdbgEa8Sa8SaE9EEh8SascKfhsaAcufgAmbkkahJbbbZNhgamaocetgscuaocu9kEcbyd;y1jjbHjjjjbbgABd:4waAcFeasz:njjjbhCdnaXmbcbhAJFFuuhEa8Ahscuh8PinascwfIdbay:tghahNasIdba8S:tghahNasclfIdba8R:tghahNMM:rghaEa8PcuSahaE9DVgXEhEaAa8PaXEh8PascKfhsaLaAcefgA9hmbkkamczfcbcjwz:njjjb8Aamcwf9cb83ibam9cb83ibagaxNhRJbbjZak:th8Ncbh8UJbbbbh8VJbbbbh8WJbbbbh8XJbbbbh8YJbbbbh8ZJbbbbh80cbh81cbhPinJbbbbhEdna8UTmbJbbjZa8U:Z:vhEkJbbbbhhdna80a80Na8Ya8YNa8Za8ZNMMg8KJbbbb9BmbJbbjZa8K:r:vhhka8XaENh5a8WaENh8Fa8VaENhaa8PhQdndndndndna8UaPVTmbamydwgBTmea80ahNh8Ja8ZahNh8La8YahNh8Maeamydbcdtfh83cbh3JFFuuhEcvhXcuhQindnaza83a3cdtfydbcdtgsfydbgvTmbaOaHasfydbcdtfhAindndnaCaiaAydbgKcx2fgsclfydbgrcetf8Vebcs4aCasydbgLcetf8Vebcs4faCascwfydbglcetf8Vebcs4fgombcbhsxekcehsazaLcdtfydbgLceSmbcehsazarcdtfydbgrceSmbcehsazalcdtfydbglceSmbdnarcdSaLcdSfalcdSfcd6mbaocefhsxekaocdfhskdnasaX9kmba8AaKcK2fgLIdwa5:thhaLIdla8F:th8KaLIdbaa:th8EdndnakJbbbb9DTmba8E:lg8Ea8K:lg8Ka8Ea8K9EEg8Kah:lgha8Kah9EEag:vJbbjZMhhxekahahNa8Ea8ENa8Ka8KNMM:rag:va8NNJbbjZMJ9VO:d86JbbjZaLIdCa8JNaLIdxa8MNa8LaLIdzNMMakN:tghahJ9VO:d869DENhhkaKaQasaX6ahaE9DVgLEhQasaXaLEhXahaEaLEhEkaAclfhAavcufgvmbkka3cefg3aB9hmbkkaQcu9hmekama5Ud:ODama8FUd:KDamaaUd:GDamcuBd:qDamcFFF;7rBdjDaIcba8AaYamc:GDfakJbbbb9Damc:qDfamcjDfz:ejjjbamyd:qDhQdndnaxJbbbb9ETmba8UaD6mbaQcuSmeceh3amIdjDaR9EmixdkaQcu9hmekdna8UTmbdnamydlgza8Uci2fgsciGTmbadasfcba8Uazcu7fciGcefz:njjjb8AkabaPcltfgzam8Pib83dbazcwfamcwf8Pib83dbaPcefhPkc3hzinazc98Smvamc:Cwfazfydbcbyd;u1jjbH:bjjjbbazc98fhzxbkkcbh3a8Uaq9pmbamydwaCaiaQcx2fgsydbcetf8Vebcs4aCascwfydbcetf8Vebcs4faCasclfydbcetf8Vebcs4ffaw9nmekcbhscbhAdna81TmbcbhAamczfhXinamczfaAcdtfaXydbgLBdbaXclfhXaAaYaLfRbbTfhAa81cufg81mbkkamydwhlamydbhXam9cu83i:GDam9cu83i:ODam9cu83i:qDam9cu83i:yDaAc;8eaAclfc:bd6Eh81inamcjDfasfcFFF;7rBdbasclfgscz9hmbka81cdthBdnalTmbaeaXcdtfhocbhrindnazaoarcdtfydbcdtgsfydbgvTmbaOaHasfydbcdtfhAcuhLcuhsinazaiaAydbgKcx2fgXclfydbcdtfydbazaXydbcdtfydbfazaXcwfydbcdtfydbfgXasaXas6gXEhsaKaLaXEhLaAclfhAavcufgvmbkaLcuSmba8AaLcK2fgAIdway:tgEaENaAIdba8S:tgEaENaAIdla8R:tgEaENMM:rhEcbhAindndnasamc:qDfaAfgvydbgX6mbasaX9hmeaEamcjDfaAfIdb9FTmekavasBdbamc:GDfaAfaLBdbamcjDfaAfaEUdbxdkaAclfgAcz9hmbkkarcefgral9hmbkkamczfaBfhLcbhscbhAindnamc:GDfasfydbgXcuSmbaLaAcdtfaXBdbaAcefhAkasclfgscz9hmbkaAa81fg81TmbJFFuuhhcuhKamczfhsa81hvcuhLina8AasydbgXcK2fgAIdway:tgEaENaAIdba8S:tgEaENaAIdla8R:tgEaENMM:rhEdndnazaiaXcx2fgAclfydbcdtfydbazaAydbcdtfydbfazaAcwfydbcdtfydbfgAaL6mbaAaL9hmeaEah9DTmekaEhhaAhLaXhKkasclfhsavcufgvmbkaKcuSmbaKhQkdnamaiaQcx2fgrydbarclfydbarcwfydbaCabaeadaPawaqa3z:fjjjbTmbaPcefhPJbbbbh8VJbbbbh8WJbbbbh8XJbbbbh8YJbbbbh8ZJbbbbh80kcbhXinaOaHaraXcdtfydbcdtgAfydbcdtfgKhsazaAfgvydbgLhAdnaLTmbdninasydbaQSmeasclfhsaAcufgATmdxbkkasaKaLcdtfc98fydbBdbavavydbcufBdbkaXcefgXci9hmbka8AaQcK2fgsIdbhEasIdlhhasIdwh8KasIdxh8EasIdzh5asIdCh8FaYaQfce86bba80a8FMh80a8Za5Mh8Za8Ya8EMh8Ya8Xa8KMh8Xa8WahMh8Wa8VaEMh8Vamydxh8Uxbkkamc:WDf8KjjjjbaPk;Vvivuv99lu8Jjjjjbca9Rgv8Kjjjjbdndnalcw0mbaiydbhoaeabcitfgralcdtcufBdlaraoBdbdnalcd6mbaiclfhoalcufhwarcxfhrinaoydbhDarcuBdbarc98faDBdbarcwfhraoclfhoawcufgwmbkkalabfhrxekcbhDavczfcwfcbBdbav9cb83izavcwfcbBdbav9cb83ibJbbjZhqJbbjZhkinadaiaDcdtfydbcK2fhwcbhrinavczfarfgoawarfIdbgxaoIdbgm:tgPakNamMgmUdbavarfgoaPaxam:tNaoIdbMUdbarclfgrcx9hmbkJbbjZaqJbbjZMgq:vhkaDcefgDal9hmbkcbhoadcbcecdavIdlgxavIdwgm9GEgravIdbgPam9GEaraPax9GEgscdtgrfhzavczfarfIdbhxaihralhwinaiaocdtfgDydbhHaDarydbgOBdbaraHBdbarclfhraoazaOcK2fIdbax9Dfhoawcufgwmbkaeabcitfhrdndnaocv6mbaoalc98f6mekaraiydbBdbaralcdtcufBdlaiclfhoalcufhwarcxfhrinaoydbhDarcuBdbarc98faDBdbarcwfhraoclfhoawcufgwmbkalabfhrxekaraxUdbararydlc98GasVBdlabcefaeadaiaoz:djjjbhwararydlciGawabcu7fcdtVBdlawaeadaiaocdtfalao9Rz:djjjbhrkavcaf8Kjjjjbark:;idiud99dndnabaecitfgwydlgDciGgqciSmbinabcbaDcd4gDalaqcdtfIdbawIdb:tgkJbbbb9FEgwaecefgefadaialavaoarz:ejjjbak:larIdb9FTmdabawaD7aefgecitfgwydlgDciGgqci9hmbkkabaecitfgeclfhbdnavmbcuhwindnaiaeydbgDfRbbmbadaDcK2fgqIdwalIdw:tgkakNaqIdbalIdb:tgkakNaqIdlalIdl:tgkakNMM:rgkarIdb9DTmbarakUdbaoaDBdbkaecwfheawcefgwabydbcd46mbxdkkcuhwindnaiaeydbgDfRbbmbadaDcK2fgqIdbalIdb:t:lgkaqIdlalIdl:t:lgxakax9EEgkaqIdwalIdw:t:lgxakax9EEgkarIdb9DTmbarakUdbaoaDBdbkaecwfheawcefgwabydbcd46mbkkk;llevudnabydwgxaladcetfgm8Vebcs4alaecetfgP8Vebgscs4falaicetfgz8Vebcs4ffaD0abydxaq9pVakVgDce9hmbavawcltfgxab8Pdb83dbaxcwfabcwfgx8Pdb83dbdnaxydbgqTmbaoabydbcdtfhxaqhsinalaxydbcetfcFFi87ebaxclfhxascufgsmbkkdnabydxglci2gsabydlgxfgkciGTmbarakfcbalaxcu7fciGcefz:njjjb8Aabydxci2hsabydlhxabydwhqkab9cb83dwababydbaqfBdbabascifc98GaxfBdlaP8Vebhscbhxkdnascztcz91cu9kmbabaxcefBdwaPax87ebaoabydbcdtfaxcdtfaeBdbkdnam8Uebcu9kmbababydwgxcefBdwamax87ebaoabydbcdtfaxcdtfadBdbkdnaz8Uebcu9kmbababydwgxcefBdwazax87ebaoabydbcdtfaxcdtfaiBdbkarabydlfabydxci2faPRbb86bbarabydlfabydxci2fcefamRbb86bbarabydlfabydxci2fcdfazRbb86bbababydxcefBdxaDk8LbabaeadaialavaoarawaDaDaqJbbbbz:cjjjbk;Nkovud99euv99eul998Jjjjjbc:W;ae9Rgo8KjjjjbdndnadTmbavcd4hrcbhwcbhDindnaiaeclfydbar2cdtfgvIdbaiaeydbar2cdtfgqIdbgk:tgxaiaecwfydbar2cdtfgmIdlaqIdlgP:tgsNamIdbak:tgzavIdlaP:tgPN:tgkakNaPamIdwaqIdwgH:tgONasavIdwaH:tgHN:tgPaPNaHazNaOaxN:tgxaxNMM:rgsJbbbb9Bmbaoc:W:qefawcx2fgAakas:vUdwaAaxas:vUdlaAaPas:vUdbaoc8Wfawc8K2fgAaq8Pdb83dbaAav8Pdb83dxaAam8Pdb83dKaAcwfaqcwfydbBdbaAcCfavcwfydbBdbaAcafamcwfydbBdbawcefhwkaecxfheaDcifgDad6mbkab9cb83dbabcyf9cb83dbabcaf9cb83dbabcKf9cb83dbabczf9cb83dbabcwf9cb83dbawTmeaocbBd8Sao9cb83iKao9cb83izaoczfaoc8Wfawci2cxaoc8Sfcbcrz1jjjbaoIdKhCaoIdChXaoIdzhQao9cb83iwao9cb83ibaoaoc:W:qefawcxaoc8Sfcbciz1jjjbJbbjZhkaoIdwgPJbbbbJbbjZaPaPNaoIdbgPaPNaoIdlgsasNMM:rgx:vaxJbbbb9BEgzNhxasazNhsaPazNhzaoc:W:qefheawhvinaecwfIdbaxNaeIdbazNasaeclfIdbNMMgPakaPak9DEhkaecxfheavcufgvmbkabaCUdwabaXUdlabaQUdbabaoId3UdxdndnakJ;n;m;m899FmbJbbbbhPaoc:W:qefheaoc8WfhvinaCavcwfIdb:taecwfIdbgHNaQavIdb:taeIdbgONaXavclfIdb:taeclfIdbgLNMMaxaHNazaONasaLNMM:vgHaPaHaP9EEhPavc8KfhvaecxfheawcufgwmbkabaxUd8KabasUdaabazUd3abaCaxaPN:tUdKabaXasaPN:tUdCabaQazaPN:tUdzabJbbjZakakN:t:rgkUdydndnaxJbbj:;axJbbj:;9GEgPJbbjZaPJbbjZ9FEJbb;:9cNJbbbZJbbb:;axJbbbb9GEMgP:lJbbb9p9DTmbaP:Ohexekcjjjj94hekabae86b8UdndnasJbbj:;asJbbj:;9GEgPJbbjZaPJbbjZ9FEJbb;:9cNJbbbZJbbb:;asJbbbb9GEMgP:lJbbb9p9DTmbaP:Ohvxekcjjjj94hvkabav86bRdndnazJbbj:;azJbbj:;9GEgPJbbjZaPJbbjZ9FEJbb;:9cNJbbbZJbbb:;azJbbbb9GEMgP:lJbbb9p9DTmbaP:Ohqxekcjjjj94hqkabaq86b8SdndnaecKtcK91:YJbb;:9c:vax:t:lavcKtcK91:YJbb;:9c:vas:t:laqcKtcK91:YJbb;:9c:vaz:t:lakMMMJbb;:9cNJbbjZMgk:lJbbb9p9DTmbak:Ohexekcjjjj94hekaecFbaecFb9iEhexekabcjjj;8iBdycFbhekabae86b8Vxekab9cb83dbabcyf9cb83dbabcaf9cb83dbabcKf9cb83dbabczf9cb83dbabcwf9cb83dbkaoc:W;aef8Kjjjjbk;Iwwvul99iud99eue99eul998Jjjjjbcje9Rgr8Kjjjjbavcd4hwaicd4hDdndnaoTmbarc;abfcbaocdtgvz:njjjb8Aarc;Gbfcbavz:njjjb8AarhvarcafhiaohqinavcFFF97BdbaicFFF;7rBdbaiclfhiavclfhvaqcufgqmbkdnadTmbcbhkinaeakaD2cdtfgvIdwhxavIdlhmavIdbhPalakaw2cdtfIdbhsarc;abfhzarhiarc;GbfhHarcafhqcj1jjbhvaohOinasavcwfIdbaxNavIdbaPNavclfIdbamNMMgAMhCakhXdnaAas:tgAaqIdbgQ9DgLmbaHydbhXkaHaXBdbakhXdnaCaiIdbgK9EmbazydbhXaKhCkazaXBdbaiaCUdbaqaAaQaLEUdbavcxfhvaqclfhqaHclfhHaiclfhiazclfhzaOcufgOmbkakcefgkad9hmbkkadThkJbbbbhCcbhXarc;abfhvarc;Gbfhicbhqinalavydbgzaw2cdtfIdbalaiydbgHaw2cdtfIdbaeazaD2cdtfgzIdwaeaHaD2cdtfgHIdw:tgsasNazIdbaHIdb:tgsasNazIdlaHIdl:tgsasNMM:rMMgsaCasaC9EgzEhCaqaXazEhXaiclfhiavclfhvaoaqcefgq9hmbkaCJbbbZNhKxekadThkcbhXJbbbbhKkJbbbbhCdnaearc;abfaXcdtgifydbgqaD2cdtfgvIdwaearc;GbfaifydbgzaD2cdtfgiIdwgm:tgsasNavIdbaiIdbgY:tgAaANavIdlaiIdlgP:tgQaQNMM:rgxJbbbb9ETmbaxalaqaw2cdtfIdbMalazaw2cdtfIdb:taxaxM:vhCkasaCNamMhmaQaCNaPMhPaAaCNaYMhYdnakmbaDcdthvawcdthiindnalIdbg8AaecwfIdbam:tgCaCNaeIdbaY:tgsasNaeclfIdbaP:tgAaANMM:rgQMgEaK9ETmbJbbbbhxdnaQJbbbb9ETmbaEaK:taQaQM:vhxkaxaCNamMhmaxaANaPMhPaxasNaYMhYa8AaKaQMMJbbbZNhKkaeavfhealaifhladcufgdmbkkabaKUdxabamUdwabaPUdlabaYUdbarcjef8Kjjjjbkjeeiu8Jjjjjbcj8W9Rgr8Kjjjjbaici2hwdnaiTmbawceawce0EhDarhiinaiaeadRbbcdtfydbBdbadcefhdaiclfhiaDcufgDmbkkabarawaladaoz:hjjjbarcj8Wf8Kjjjjbk:3lequ8JjjjjbcjP9Rgl8Kjjjjbcbhvalcjxfcbaiz:njjjb8AdndnadTmbcjehoaehrincuhwarhDcuhqavhkdninawakaoalcjxfaDcefRbbfRbb9RcFeGci6aoalcjxfaDRbbfRbb9RcFeGci6faoalcjxfaDcdfRbbfRbb9RcFeGci6fgxaq9mgmEhwdnammbaxce0mdkaxaqaxaq9kEhqaDcifhDadakcefgk9hmbkkaeawci2fgDcdfRbbhqaDcefRbbhxaDRbbhkaeavci2fgDcifaDawav9Rci2z:qjjjb8Aakalcjxffaocefgo86bbaxalcjxffao86bbaDcdfaq86bbaDcefax86bbaDak86bbaqalcjxffao86bbarcifhravcefgvad9hmbkalcFeaicetz:njjjbhoadci2gDceaDce0EhqcbhxindnaoaeRbbgkcetfgw8UebgDcu9kmbawax87ebaocjlfaxcdtfabakcdtfydbBdbaxhDaxcefhxkaeaD86bbaecefheaqcufgqmbkaxcdthDxekcbhDkabalcjlfaDz:mjjjb8AalcjPf8Kjjjjbk9teiucbcbyd;C1jjbgeabcifc98GfgbBd;C1jjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik;teeeudndnaeabVciGTmbabhixekdndnadcz9pmbabhixekabhiinaiaeydbBdbaiaeydlBdlaiaeydwBdwaiaeydxBdxaeczfheaiczfhiadc9Wfgdcs0mbkkadcl6mbinaiaeydbBdbaeclfheaiclfhiadc98fgdci0mbkkdnadTmbinaiaeRbb86bbaicefhiaecefheadcufgdmbkkabk:3eedudndnabciGTmbabhixekaecFeGc:b:c:ew2hldndnadcz9pmbabhixekabhiinaialBdxaialBdwaialBdlaialBdbaiczfhiadc9Wfgdcs0mbkkadcl6mbinaialBdbaiclfhiadc98fgdci0mbkkdnadTmbinaiae86bbaicefhiadcufgdmbkkabk9teiucbcbyd;C1jjbgeabcrfc94GfgbBd;C1jjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik9:eiuZbhedndncbyd;C1jjbgdaecztgi9nmbcuheadai9RcFFifcz4nbcuSmekadhekcbabae9Rcifc98Gcbyd;C1jjbfgdBd;C1jjbdnadZbcztge9nmbadae9RcFFifcz4nb8Akk:;Deludndndnadch9pmbabaeSmdaeabadfgi9Rcbadcet9R0mekabaead;8qbbxekaeab7ciGhldndndnabae9pmbdnalTmbadhvabhixikdnabciGmbadhvabhixdkadTmiabaeRbb86bbadcufhvdnabcefgiciGmbaecefhexdkavTmiabaeRbe86beadc9:fhvdnabcdfgiciGmbaecdfhexdkavTmiabaeRbd86bdadc99fhvdnabcifgiciGmbaecifhexdkavTmiabaeRbi86biabclfhiaeclfheadc98fhvxekdnalmbdnaiciGTmbadTmlabadcufgifglaeaifRbb86bbdnalciGmbaihdxekaiTmlabadc9:fgifglaeaifRbb86bbdnalciGmbaihdxekaiTmlabadc99fgifglaeaifRbb86bbdnalciGmbaihdxekaiTmlabadc98fgdfaeadfRbb86bbkadcl6mbdnadc98fgocd4cefciGgiTmbaec98fhlabc98fhvinavadfaladfydbBdbadc98fhdaicufgimbkkaocx6mbaec9Wfhvabc9WfhoinaoadfgicxfavadfglcxfydbBdbaicwfalcwfydbBdbaiclfalclfydbBdbaialydbBdbadc9Wfgdci0mbkkadTmdadhidnadciGglTmbaecufhvabcufhoadhiinaoaifavaifRbb86bbaicufhialcufglmbkkadcl6mdaec98fhlabc98fhvinavaifgecifalaifgdcifRbb86bbaecdfadcdfRbb86bbaecefadcefRbb86bbaeadRbb86bbaic98fgimbxikkavcl6mbdnavc98fglcd4cefcrGgdTmbavadcdt9RhvinaiaeydbBdbaeclfheaiclfhiadcufgdmbkkalc36mbinaiaeydbBdbaiaeydlBdlaiaeydwBdwaiaeydxBdxaiaeydzBdzaiaeydCBdCaiaeydKBdKaiaeyd3Bd3aecafheaicafhiavc9Gfgvci0mbkkavTmbdndnavcrGgdmbavhlxekavc94GhlinaiaeRbb86bbaicefhiaecefheadcufgdmbkkavcw6mbinaiaeRbb86bbaiaeRbe86beaiaeRbd86bdaiaeRbi86biaiaeRbl86blaiaeRbv86bvaiaeRbo86boaiaeRbr86braicwfhiaecwfhealc94fglmbkkabkk9Tdbcjwk9ubbjZbbbbbbbbbbbbbbjZbbbbbbbbbbbbbbjZ86;nAZ86;nAZ86;nAZ86;nA:;86;nAZ86;nAZ86;nAZ86;nA:;86;nAZ86;nAZ86;nAZ86;nA:;bc;uwkxebbbdbbb9GNbb",e=new Uint8Array([32,0,65,2,1,106,34,33,3,128,11,4,13,64,6,253,10,7,15,116,127,5,8,12,40,16,19,54,20,9,27,255,113,17,42,67,24,23,146,148,18,14,22,45,70,69,56,114,101,21,25,63,75,136,108,28,118,29,73,115]);if(typeof WebAssembly!="object")return{supported:!1};var r,a=WebAssembly.instantiate(s(t),{}).then(function(h){r=h.instance,r.exports.__wasm_call_ctors()});function s(h){for(var d=new Uint8Array(h.length),x=0;x<h.length;++x){var g=h.charCodeAt(x);d[x]=g>96?g-97:g>64?g-39:g+4}for(var y=0,x=0;x<h.length;++x)d[y++]=d[x]<60?e[d[x]]:(d[x]-60)*64+d[++x];return d.buffer.slice(0,y)}function n(h){if(!h)throw new Error("Assertion failed")}function i(h){return new Uint8Array(h.buffer,h.byteOffset,h.byteLength)}var o=48,c=16;function l(h,d){var x=h.meshlets[d*4+0],g=h.meshlets[d*4+1],y=h.meshlets[d*4+2],m=h.meshlets[d*4+3];return{vertices:h.vertices.subarray(x,x+y),triangles:h.triangles.subarray(g,g+m*3)}}function f(h,d,x,g,y,m,w){var E=r.exports.sbrk,S=r.exports.meshopt_buildMeshletsBound(h.length,y,m),A=E(S*c),T=E(S*y*4),_=E(S*m*3),R=E(h.byteLength),N=E(d.byteLength),B=new Uint8Array(r.exports.memory.buffer);B.set(i(h),R),B.set(i(d),N);var F=r.exports.meshopt_buildMeshlets(A,T,_,R,h.length,N,x,g,y,m,w);B=new Uint8Array(r.exports.memory.buffer);for(var K=B.subarray(A,A+F*c),$=new Uint32Array(K.buffer,K.byteOffset,K.byteLength/4).slice(),se=0;se<F;++se){var de=$[se*4+0],Ke=$[se*4+1],x=$[se*4+2],be=$[se*4+3];r.exports.meshopt_optimizeMeshlet(T+de*4,_+Ke,be,x)}var Ve=$[(F-1)*4+0],Ze=$[(F-1)*4+1],_e=$[(F-1)*4+2],ot=$[(F-1)*4+3],et=Ve+_e,It=Ze+(ot*3+3&-4),xr={meshlets:$,vertices:new Uint32Array(B.buffer,T,et).slice(),triangles:new Uint8Array(B.buffer,_,It*3).slice(),meshletCount:F};return E(A-E(0)),xr}function u(h){var d=new Float32Array(r.exports.memory.buffer,h,o/4);return{centerX:d[0],centerY:d[1],centerZ:d[2],radius:d[3],coneApexX:d[4],coneApexY:d[5],coneApexZ:d[6],coneAxisX:d[7],coneAxisY:d[8],coneAxisZ:d[9],coneCutoff:d[10]}}function p(h,d,x,g){var y=r.exports.sbrk,m=[],w=y(d.byteLength),E=y(h.vertices.byteLength),S=y(h.triangles.byteLength),A=y(o),T=new Uint8Array(r.exports.memory.buffer);T.set(i(d),w),T.set(i(h.vertices),E),T.set(i(h.triangles),S);for(var _=0;_<h.meshletCount;++_){var R=h.meshlets[_*4+0],N=h.meshlets[_*4+0+1],B=h.meshlets[_*4+0+3];r.exports.meshopt_computeMeshletBounds(A,E+R*4,S+N,B,w,x,g),m.push(u(A))}return y(w-y(0)),m}function b(h,d,x,g){var y=r.exports.sbrk,m=y(o),w=y(h.byteLength),E=y(d.byteLength),S=new Uint8Array(r.exports.memory.buffer);S.set(i(h),w),S.set(i(d),E),r.exports.meshopt_computeClusterBounds(m,w,h.length,E,x,g);var A=u(m);return y(m-y(0)),A}return{ready:a,supported:!0,buildMeshlets:function(h,d,x,g,y,m){n(h.length%3==0),n(d instanceof Float32Array),n(d.length%x==0),n(x>=3),n(g<=256||g>0),n(y<=512),n(y%4==0),m=m||0;var w=h.BYTES_PER_ELEMENT==4?h:new Uint32Array(h);return f(w,d,d.length/x,x*4,g,y,m)},computeClusterBounds:function(h,d,x){n(h.length%3==0),n(h.length/3<=512),n(d instanceof Float32Array),n(d.length%x==0),n(x>=3);var g=h.BYTES_PER_ELEMENT==4?h:new Uint32Array(h);return b(g,d,d.length/x,x*4)},computeMeshletBounds:function(h,d,x){return n(h.meshletCount!=0),n(d instanceof Float32Array),n(d.length%x==0),n(x>=3),p(h,d,d.length/x,x*4)},extractMeshlet:function(h,d){return n(d>=0&&d<h.meshletCount),l(h,d)}}})();var ql=new xl().registerExtensions([xi,vi,wi]).registerDependencies({"meshopt.decoder":ms});async function ta(t,e={}){await ms.ready;let r;if(e.fetchBytes)r=new Uint8Array(await e.fetchBytes(t));else{let c=await fetch(t,{cache:e.fetchCache||"no-store"});if(!c.ok)throw new Error(`Failed to load ${t}: ${c.status}`);r=new Uint8Array(await c.arrayBuffer())}let a=await ql.readBinary(r),s=[],n=e.componentFeatures||new Map,i=new Map;function o(c,l=""){let f=n.has(c.getName());f&&i.set(c.getName(),(i.get(c.getName())||0)+1);let u=f?c.getName():l,p=c.getMesh();if(p){let b=c.getWorldMatrix();for(let h of p.listPrimitives()){let d=h.getAttribute("POSITION"),x=h.getAttribute("NORMAL"),g=h.getAttribute("_FEATURE_ID_0"),y=h.getAttribute("_FEATURE_ID_1"),m=h.getIndices()?.getArray();if(!d||!m)continue;let w=d.getCount(),E=new Float32Array(w*3),S=new Float32Array(w*3),A=new Uint32Array(w),T=new Uint32Array(w),_=[1/0,1/0,1/0,-1/0,-1/0,-1/0],R=[],N=n.get(u)?.featureId||e.defaultFeatureId||0;for(let F=0;F<w;F+=1)d.getElement(F,R),J0(E,F*3,R,b),_[0]=Math.min(_[0],E[F*3]),_[1]=Math.min(_[1],E[F*3+1]),_[2]=Math.min(_[2],E[F*3+2]),_[3]=Math.max(_[3],E[F*3]),_[4]=Math.max(_[4],E[F*3+1]),_[5]=Math.max(_[5],E[F*3+2]),x?(x.getElement(F,R),Q0(S,F*3,R,b)):S.set([0,0,1],F*3),A[F]=Number(g?.getScalar(F)||0),T[F]=Number(y?y.getScalar(F)||0:N);let B=h.getMaterial();s.push({position:E,normal:S,netId:A,objectFeatureId:T,indices:m,designator:u,nodeName:c.getName(),meshName:p.getName(),bounds:_,material:B?{name:B.getName(),baseColor:B.getBaseColorFactor(),metallic:B.getMetallicFactor(),roughness:B.getRoughnessFactor(),emissive:B.getEmissiveFactor()}:{baseColor:e.baseColor||[.55,.58,.64,1],metallic:.05,roughness:.72,emissive:[0,0,0]}})}}for(let b of c.listChildren())o(b,u)}for(let c of a.getRoot().listScenes())for(let l of c.listChildren())o(l);return{byteLength:r.byteLength,primitives:s,componentNodeCounts:i}}function J0(t,e,r,a){let s=a[0]*r[0]+a[4]*r[1]+a[8]*r[2]+a[12],n=a[1]*r[0]+a[5]*r[1]+a[9]*r[2]+a[13],i=a[2]*r[0]+a[6]*r[1]+a[10]*r[2]+a[14];t[e]=s,t[e+1]=-i,t[e+2]=n}function Q0(t,e,r,a){let s=a[0]*r[0]+a[4]*r[1]+a[8]*r[2],n=a[1]*r[0]+a[5]*r[1]+a[9]*r[2],i=a[2]*r[0]+a[6]*r[1]+a[10]*r[2],o=Math.hypot(s,n,i)||1;t[e]=s/o,t[e+1]=-i/o,t[e+2]=n/o}async function Wl(t,e={}){await ms.ready;let r;if(e.fetchBytes)r=new Uint8Array(await e.fetchBytes(t));else{let u=await fetch(t,{cache:e.fetchCache||"no-store"});if(!u.ok)throw new Error(`Failed to load ${t}: ${u.status}`);r=new Uint8Array(await u.arrayBuffer())}let a=await ql.readBinary(r),s=e.componentFeatures||new Map,n=new Map,i=new Map,o=new Map,c=0;function l(u){if(o.has(u))return o.get(u);let p=u.getAttribute("POSITION"),b=u.getIndices()?.getArray();if(!p||!b)return o.set(u,null),null;let h=u.getAttribute("NORMAL"),d=u.getAttribute("_FEATURE_ID_0"),x=u.getAttribute("_FEATURE_ID_1"),g=p.getCount(),y=new Float32Array(g*3),m=new Float32Array(g*3),w=new Uint32Array(g),E=new Uint32Array(g),S=[];for(let N=0;N<g;N+=1)p.getElement(N,S),y.set(S.slice(0,3),N*3),h?(h.getElement(N,S),m.set(S.slice(0,3),N*3)):m.set([0,1,0],N*3),w[N]=Number(d?.getScalar(N)||0),E[N]=Number(x?.getScalar(N)||0);let A=ty(u.getMaterial(),e),T=[ea(y),ea(m),ea(w),ea(E),ea(b),g,b.length,JSON.stringify(A)].join(":"),_=i.get(T),R=_;return(!_||!ry(_.primitive,y,m,w,E,b))&&(R={primitive:{position:y,normal:m,netId:w,objectFeatureId:E,indices:Uint32Array.from(b),material:A,bounds:null},placements:[]},i.set(_?`${T}:${i.size}`:T,R)),o.set(u,R),R}function f(u,p=""){let b=s.has(u.getName());b&&n.set(u.getName(),(n.get(u.getName())||0)+1);let h=b?u.getName():p,d=u.getMesh();if(d){let x=Z0(u.getWorldMatrix()),g=Number(s.get(h)?.featureId||e.defaultFeatureId||0),y=c++;for(let m of d.listPrimitives()){let w=l(m);if(!w)continue;let E=ey(w.primitive.position,x);w.placements.push({rows:x,featureId:g,designator:h,bounds:E,node:y});let S=w.primitive.bounds;w.primitive.bounds=S?[Math.min(S[0],E[0]),Math.min(S[1],E[1]),Math.min(S[2],E[2]),Math.max(S[3],E[3]),Math.max(S[4],E[4]),Math.max(S[5],E[5])]:[...E]}}for(let x of u.listChildren())f(x,h)}for(let u of a.getRoot().listScenes())for(let p of u.listChildren())f(p);return{byteLength:r.byteLength,models:[...i.values()],componentNodeCounts:n}}function Z0(t){return[t[0],t[4],t[8],t[12],-t[2],-t[6],-t[10],-t[14],t[1],t[5],t[9],t[13]]}function ey(t,e){let r=[1/0,1/0,1/0,-1/0,-1/0,-1/0];for(let a=0;a<t.length;a+=3){let s=t[a],n=t[a+1],i=t[a+2];for(let o=0;o<3;o+=1){let c=o*4,l=e[c]*s+e[c+1]*n+e[c+2]*i+e[c+3];l<r[o]&&(r[o]=l),l>r[o+3]&&(r[o+3]=l)}}return r}function ty(t,e){return t?{name:t.getName(),baseColor:t.getBaseColorFactor(),metallic:t.getMetallicFactor(),roughness:t.getRoughnessFactor(),emissive:t.getEmissiveFactor()}:{baseColor:e.baseColor||[.55,.58,.64,1],metallic:.05,roughness:.72,emissive:[0,0,0]}}function ea(t){let e=t.BYTES_PER_ELEMENT===4?new Uint32Array(t.buffer,t.byteOffset,t.length):t,r=2166136261;for(let a=0;a<e.length;a+=1)r^=e[a],r=Math.imul(r,16777619)>>>0;return r.toString(36)}function ry(t,e,r,a,s,n){let i=(o,c)=>o.length===c.length&&o.every((l,f)=>l===c[f]);return i(t.position,e)&&i(t.normal,r)&&i(t.netId,a)&&i(t.objectFeatureId,s)&&i(t.indices,n)}var or=Object.freeze({mm:1,fineMm:.1,deg:15,fineDeg:1}),Mi=Object.freeze([[1,0,0],[0,1,0],[0,0,1]]);function Xl(t){return Math.round(t*1e9)/1e9+0}function Yt(t){let e=Math.hypot(...t.rotation)||1,r=t.rotation.map(s=>s/e),a=[r[3],r[0],r[1],r[2]].find(s=>Math.abs(s)>1e-12)??1;return{translationMm:t.translationMm.map(Xl),rotation:r.map(s=>Xl(a<0?-s:s))}}function ay(t){let[e,r,a,s]=t.rotation,[n,i,o]=t.translationMm;return[1-2*(r*r+a*a),2*(e*r+a*s),2*(e*a-r*s),0,2*(e*r-a*s),1-2*(e*e+a*a),2*(r*a+e*s),0,2*(e*a+r*s),2*(r*a-e*s),1-2*(e*e+r*r),0,n,i,o,1]}function $l(t,e){let r=new Array(16);for(let a=0;a<4;a+=1)for(let s=0;s<4;s+=1)r[a*4+s]=t[s]*e[a*4]+t[4+s]*e[a*4+1]+t[8+s]*e[a*4+2]+t[12+s]*e[a*4+3];return r}function sy(t){let e=[t[0],t[4],t[8],0,t[1],t[5],t[9],0,t[2],t[6],t[10],0,0,0,0,1];for(let r=0;r<3;r+=1)e[12+r]=-(e[r]*t[12]+e[4+r]*t[13]+e[8+r]*t[14]);return e}function ys(t,e){return e>0?Math.round(t/e)*e:t}function ki(t,e){let r=e[0]**2+e[1]**2;return r<1e-9?0:(t[0]*e[0]+t[1]*e[1])/r}function Yl(t,e,r){let a=Math.atan2(e[1]-t[1],e[0]-t[0]),n=Math.atan2(r[1]-t[1],r[0]-t[0])-a;for(;n>Math.PI;)n-=2*Math.PI;for(;n<-Math.PI;)n+=2*Math.PI;return n}function Jl(t,e,r){return tt(t,e)>=0?-r:r}function Ql(t){return Mi.map(e=>Zn(t.rotation,e))}function Zl(t,e,r){return{translationMm:t.translationMm.map((a,s)=>a+e[s]*r),rotation:[...t.rotation]}}function ed(t,e,r,a){let s=kc(e,r),n=t.translationMm.map((o,c)=>o-a[c]);return{translationMm:Zn(s,n).map((o,c)=>o+a[c]),rotation:Xa(s,t.rotation)}}function td(t,e){if(e==null)return null;let r=`/${String(e).split("/")[1]||""}`;return(t?.occurrences||[]).find(a=>a.path===r&&a.depth===1)??null}function rd(t,e,r){let a=t.occurrences.find(o=>o.path===e);if(!a||a.depth!==1)return t;let s=ay(r),n=$l(s,sy(a.worldMatrix)),i=`${e}/`;return{...t,occurrences:t.occurrences.map(o=>o.path===e?{...o,pose:{...Yt(r),source:"manual"},worldMatrix:s}:o.path.startsWith(i)?{...o,worldMatrix:$l(n,o.worldMatrix)}:o)}}function ad(t){let e=Math.abs(t[0])<.9?[1,0,0]:[0,1,0];return He(qe(t,e))}var ny=Object.freeze([0,1,1,0]),ra=`
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
`,$e=Object.freeze([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function iy(t){let e=t?.matrix??t;if(!e||typeof e.length!="number"||e.length!==16)throw new TypeError("An occurrence matrix must have 16 numbers (column-major)");let r=Array.from(e,Number);if(!r.every(Number.isFinite))throw new TypeError("An occurrence matrix must be finite");if(r[3]!==0||r[7]!==0||r[11]!==0||r[15]!==1)throw new TypeError("An occurrence matrix must be affine (last row 0 0 0 1)");return r}function oy(t){let[e,r,a,,s,n,i,,o,c,l]=t,f=n*l-c*i,u=c*a-r*l,p=r*i-n*a,b=o*i-s*l,h=e*l-o*a,d=s*a-e*i,x=s*c-o*n,g=o*r-e*c,y=e*n-s*r,m=e*f+s*u+o*p;if(m===0)throw new TypeError("An occurrence matrix must be invertible");let w=m<0?-1:1;return[w*f,w*b,w*x,0,w*u,w*h,w*g,0,w*p,w*d,w*y,0,0,0,0,1]}function cy(t){let e=new Uint32Array(4);for(let r of t||[]){let a=Number(r);!Number.isInteger(a)||a<0||a>=128||(e[a>>>5]|=1<<(a&31)>>>0)}return e}function xs(t,e=[],r=[]){let a=new Float32Array(Math.max(1,t.length)*40),s=new Uint32Array(a.buffer);return t.forEach((n,i)=>{let o=i*40;a.set(n,o),a.set(oy(n),o+16),e[i]&&s.set(cy(e[i]),o+32),a.set(r[i]||ny,o+36)}),a}function vs(t,e){let[r,a,s]=e;return[t[0]*r+t[4]*a+t[8]*s+t[12],t[1]*r+t[5]*a+t[9]*s+t[13],t[2]*r+t[6]*a+t[10]*s+t[14]]}function xt(t,e){if(!e)return null;let r=[1/0,1/0,1/0,-1/0,-1/0,-1/0];for(let a=0;a<8;a+=1){let s=vs(t,[e[a&1?3:0],e[a&2?4:1],e[a&4?5:2]]);for(let n=0;n<3;n+=1)r[n]=Math.min(r[n],s[n]),r[n+3]=Math.max(r[n+3],s[n])}return r}function ws(t){return t.every((e,r)=>e===$e[r])}var ly=0,dy=4294901759;function sd(t,e){let r=t>>>0,a=e>>>0;return r===ly?{kind:"none",occurrenceIndex:-1,featureId:0}:{kind:a?"feature":"board",occurrenceIndex:r-1,featureId:a}}function nd(t){let e=Array.from(t);if(e.length>dy)throw new RangeError("Too many occurrences for the pick target");let r=e.map(iy),a=o=>o&&!Array.isArray(o)&&!ArrayBuffer.isView(o),s=e.map((o,c)=>a(o)&&o.key!=null?String(o.key):String(c));if(new Set(s).size!==s.length)throw new TypeError("Occurrence keys must be unique");let n=e.map(o=>a(o)&&o.hiddenLayers?[...o.hiddenLayers].map(Number):[]),i=e.map(o=>a(o)&&o.explode?[...o.explode].map(Number):null);return{matrices:r,keys:s,hiddenLayers:n,explode:i}}function aa(t,e,r){let[a,s,n]=e,i=t[0]*a+t[4]*s+t[8]*n+t[12],o=t[1]*a+t[5]*s+t[9]*n+t[13],c=t[2]*a+t[6]*s+t[10]*n+t[14],l=t[3]*a+t[7]*s+t[11]*n+t[15];return!(l>0)||c<0||c>l?null:{x:r.x+(i/l*.5+.5)*r.width,y:r.y+(.5-o/l*.5)*r.height}}var Ms=0;var id=3,Ei=4,zS=Object.freeze(["full","board","body","box"]),st=Object.freeze({fullPx:140,boardPx:70,boxPx:18,keep:.8});function kr(t={}){let e=(i,o)=>Number.isFinite(Number(t[i]))?Math.max(0,Number(t[i])):o,r=e("boxPx",st.boxPx),a=Math.max(r,e("boardPx",st.boardPx)),s=Math.max(a,e("fullPx",st.fullPx)),n=Math.min(1,Math.max(.05,e("keep",st.keep)));return{fullPx:s,boardPx:a,boxPx:r,keep:n}}function od(t){let e=c=>[t[c],t[4+c],t[8+c],t[12+c]],[r,a,s,n]=[e(0),e(1),e(2),e(3)],i=(c,l)=>c.map((f,u)=>f+l[u]),o=(c,l)=>c.map((f,u)=>f-l[u]);return[i(n,r),o(n,r),i(n,a),o(n,a),s,o(n,s)]}var sa=class{constructor(e,r,a,s=16777216){this.device=e,this.usage=r|cd.COPY_SRC|cd.COPY_DST,this.label=a,this.chunkBytes=s,this.chunks=[],this.usedBytes=0,this.generation=0,this.repacks=0}alloc(e){let a={buffer:null,offset:0,size:Math.max(4,Math.ceil(e/4)*4),chunk:null};return this.place(a,null),a}place(e,r){let{size:a}=e,s=null;if(a<=this.chunkBytes/2)for(let o of this.chunks)o===r||o.dedicated||o.free.forEach((c,l)=>{c.size>=a&&(!s||c.size<s.range.size)&&(s={chunk:o,index:l,range:c})});let n,i;if(s)({chunk:n}=s),i=s.range.offset,s.range.size===a?n.free.splice(s.index,1):n.free[s.index]={offset:i+a,size:s.range.size-a};else{let o=a>this.chunkBytes/2,c=o?a:this.chunkBytes;n={buffer:this.device.createBuffer({label:`${this.label}-${this.chunks.length}`,size:c,usage:this.usage}),size:c,free:c>a?[{offset:a,size:c-a}]:[],used:0,live:new Set,dedicated:o},this.chunks.push(n),i=0}n.used+=a,n.live.add(e),this.usedBytes+=a,Object.assign(e,{buffer:n.buffer,offset:i,chunk:n})}write(e,r){this.device.queue.writeBuffer(e.buffer,e.offset,r)}free(e){let{chunk:r}=e;if(!(!r||!r.live.has(e))){if(this.release(r,e),e.chunk=null,!r.live.size){this.drop(r);return}!r.dedicated&&r.used<r.size*.5&&this.chunks.length>1&&this.repack(r)}}release(e,r){e.used-=r.size,e.live.delete(r),this.usedBytes-=r.size;let a=e.free,s=a.findIndex(n=>n.offset>r.offset);s<0&&(s=a.length),a.splice(s,0,{offset:r.offset,size:r.size}),s+1<a.length&&a[s].offset+a[s].size===a[s+1].offset&&(a[s].size+=a[s+1].size,a.splice(s+1,1)),s>0&&a[s-1].offset+a[s-1].size===a[s].offset&&(a[s-1].size+=a[s].size,a.splice(s,1))}drop(e){e.buffer.destroy?.(),this.chunks.splice(this.chunks.indexOf(e),1)}repack(e){let r=this.device.createCommandEncoder({label:`${this.label}-repack`});for(let a of[...e.live]){let s={buffer:a.buffer,offset:a.offset};this.release(e,a),this.place(a,e),r.copyBufferToBuffer(s.buffer,s.offset,a.buffer,a.offset,a.size)}this.device.queue.submit([r.finish()]),this.drop(e),this.generation+=1,this.repacks+=1}reservedBytes(){return this.chunks.reduce((e,r)=>e+r.size,0)}destroy(){for(let e of this.chunks)e.buffer.destroy?.();this.chunks=[],this.usedBytes=0}},cd=globalThis.GPUBufferUsage||{COPY_SRC:4,COPY_DST:8};var Si=Object.freeze(["decl","vs-out","vs-end","fs-begin","fs-return"]),uy={decl:"decl","vs-out":"vsOut","vs-end":"vsEnd","fs-begin":"fsBegin"},fy=/^[ \t]*\/\/ @feature:[a-z-]+\n/gm;function ie(t){if(!Si.includes(t))throw new Error(`Unknown shader hook ${t}`);return`// @feature:${t}
`}function Te(t){return t.replace(fy,"")}function Ti(t){return na(t).map(e=>e.name).join("+")}function na(t=[]){let e=new Set;for(let r of t){if(!r?.name||!/^[a-z][a-z0-9-]*$/.test(r.name))throw new Error(`Bad shader feature name ${r?.name}`);if(e.has(r.name))throw new Error(`Shader feature ${r.name} given twice`);e.add(r.name)}return[...t].sort((r,a)=>r.name<a.name?-1:r.name>a.name?1:0)}function hy(t,e="shader"){for(let r of Si){let a=Ai(t,r).length;if(a!==1)throw new Error(`${e}: hook ${r} appears ${a} times, expected once`)}dd(t,e)}function ld(t,e=[],r={}){let a=na(e);if(!a.length)return Te(t);let s=`${r.family||"shader"}${r.instanced?" (instanced)":""}`;hy(t,s);let n=t;for(let i of Si){if(i==="fs-return"){let{start:u,end:p,indent:b,expression:h}=dd(n,s),d=a.reduce((x,g)=>g.fsReturn?g.fsReturn(x,r):x,h);n=`${n.slice(0,u)}${b}return ${d};
${n.slice(p)}`;continue}let o=uy[i],c=a.map(u=>u[o]?.(r)).filter(Boolean),[l]=Ai(n,i),f=c.map(u=>u.endsWith(`
`)?u:`${u}
`).join("");n=`${n.slice(0,l.index)}${f}${n.slice(l.index+l[0].length)}`}return Te(n)}function Ai(t,e){return[...t.matchAll(new RegExp(`^[ \\t]*// @feature:${e}\\n`,"gm"))]}function dd(t,e){let[r]=Ai(t,"fs-return"),a=r.index+r[0].length,s=t.slice(a).match(/^([ \t]*)return (.+);\n/);if(!s)throw new Error(`${e}: hook fs-return is not followed by a return line`);return{start:r.index,end:a+s[0].length,indent:s[1],expression:s[2]}}var Ii=`
fn featureHidden(id: u32) -> bool {
  return id < arrayLength(&hiddenMask) && hiddenMask[id] == 0u;
}
`;function ks(t){let e=new Set;if(t==null)return e;for(let r of t){let a=Number(r);!Number.isInteger(a)||a<=0||a>4294967295||e.add(a)}return e}function ud(t,e=0){let r=0;for(let n of ks(t))r=Math.max(r,n);let a=64,s=r+1;for(;a<s;)a*=2;return Math.max(a,Math.floor(e)||0)}function fd(t,e){let r=Math.max(64,Math.floor(e)||0),a=new Uint32Array(r);a.fill(1);for(let s of ks(t))s<r&&(a[s]=0);return a}function by(t){let e=Number(t.drillWidthMm)||0,r=Number(t.drillHeightMm)||e,a=Math.min(e,r),s=Math.min(Number(t.outerWidthMm)||0,Number(t.outerHeightMm)||0),n=Number.isFinite(t.platingThicknessMm)?t.platingThicknessMm:Math.max(0,(s-a)/2),i=(Number(t.rotationDeg)||0)*Math.PI/180+(r>e?Math.PI/2:0);return{x:t.centerMm[0]/1e3,y:-t.centerMm[1]/1e3,drillRadius:a/2e3,outerRadius:(a/2+n)/1e3,halfLength:Math.abs(e-r)/2e3,angle:Math.abs(e-r)>0?-i:0,startZ:t.startZMm/1e3,endZ:t.endZMm/1e3,netId:t.netId||0,objectId:t.objectFeatureId||0,startLayerId:t.startLayerId||0,endLayerId:t.endLayerId||0}}function Ni(t,e){let r=new Map((e||[]).map(a=>[Number(a.id),Number(a.thickness_mm)||0]));return(t||[]).map(a=>{let s=i=>Math.max(0,(r.get(Number(i))||0)/2-.001),n=a.startZMm>=a.endZMm?1:-1;return{...a,startZMm:a.startZMm+n*s(a.startLayerId),endZMm:a.endZMm-n*s(a.endLayerId)}})}var ia=0,_i=16,Ri=24,oa=32,hd=48,bd=Object.freeze({arrayStride:hd,stepMode:"instance",attributes:Object.freeze([Object.freeze({shaderLocation:3,offset:ia,format:"float32x4"}),Object.freeze({shaderLocation:4,offset:_i,format:"float32x2"}),Object.freeze({shaderLocation:6,offset:Ri,format:"float32x2"}),Object.freeze({shaderLocation:5,offset:oa,format:"uint32x4"})])}),Ci=48,Es=`struct Input {
  @location(0) unit: vec3f,
  @location(1) normal: vec3f,
  @location(2) radiusMix: f32,
  @location(3) dimensions: vec4f,
  @location(4) span: vec2f,
  @location(5) ids: vec4u,
  @location(6) shape: vec2f,
};`,pd=`struct Barrel {
  dimensions: vec4f,
  span: vec2f,
  shape: vec2f,
  ids: vec4u,
};
@group(0) @binding(6) var<storage, read> barrels: array<Barrel>;`;function gd(t,e,r){let a=new ArrayBuffer(Math.max(r,t.length)*e),s=new DataView(a);return t.forEach((n,i)=>{let o=i*e,c=by(n);s.setFloat32(o+ia,c.x,!0),s.setFloat32(o+ia+4,c.y,!0),s.setFloat32(o+ia+8,c.drillRadius,!0),s.setFloat32(o+ia+12,c.outerRadius,!0),s.setFloat32(o+_i,c.startZ,!0),s.setFloat32(o+_i+4,c.endZ,!0),s.setFloat32(o+Ri,c.halfLength,!0),s.setFloat32(o+Ri+4,c.angle,!0),s.setUint32(o+oa,c.netId,!0),s.setUint32(o+oa+4,c.objectId,!0),s.setUint32(o+oa+8,c.startLayerId,!0),s.setUint32(o+oa+12,c.endLayerId,!0)}),a}function md(t){return gd(t,hd,0)}function yd(t){return gd(t,Ci,1)}var Bi=t=>`
struct Palette {
  ramps: array<vec4f, 512>,
  outline: vec4f,
};
@group(0) @binding(${t}) var<uniform> palette: Palette;
fn ramp(t: f32, which: u32) -> vec3f {
  let x = clamp(t, 0.0, 1.0) * 255.0;
  let i = u32(floor(x));
  let j = min(i + 1u, 255u);
  return mix(palette.ramps[which * 256u + i].rgb, palette.ramps[which * 256u + j].rgb, x - floor(x));
}
fn fieldColor(t: f32) -> vec3f {
  return ramp(t, 0u);
}
`,xd=`
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

${Bi(10)}
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
`,py={compare:"always",passOp:"keep"},Ss=Object.freeze({shapeMask:{face:{compare:"always",passOp:"replace"},read:255,write:128,reference:128,color:!1,depth:!1},fan:{face:{compare:"always",passOp:"invert"},read:255,write:64,reference:0,color:!1,depth:!1},coverSubtract:{face:{compare:"not-equal",passOp:"replace",failOp:"keep"},read:64,write:192,reference:128,color:!1,depth:!1},shapeAdd:{face:{compare:"greater",passOp:"replace"},read:160,write:33,reference:32,color:!0,depth:!0},coverMark:{face:{compare:"equal",passOp:"replace",failOp:"keep"},read:192,write:1,reference:65,color:!1,depth:!1,depthTest:!0},coverAdd:{face:{compare:"equal",passOp:"invert",failOp:"keep",depthFailOp:"keep"},read:224,write:96,reference:64,color:!0,depth:!0},coverClear:{face:{compare:"always",passOp:"zero"},read:255,write:64,reference:0,color:!1,depth:!1},shapeLay:{face:{compare:"greater",passOp:"replace"},read:160,write:32,reference:32,color:!1,depth:!1,depthTest:!0},coverLay:{face:{compare:"equal",passOp:"invert",failOp:"keep",depthFailOp:"keep"},read:224,write:96,reference:64,color:!1,depth:!1,depthTest:!0},shapeBlend:{face:{compare:"greater",passOp:"replace"},read:160,write:32,reference:32,color:!0,depth:!0},coverBlend:{face:{compare:"equal",passOp:"invert",failOp:"keep",depthFailOp:"keep"},read:224,write:96,reference:64,color:!0,depth:!0},tintCovered:{face:{compare:"equal",passOp:"keep"},read:33,write:0,reference:33,color:!0,depth:!0},tintPlain:{face:{compare:"equal",passOp:"keep"},read:33,write:0,reference:32,color:!0,depth:!0},footShape:{face:{compare:"always",passOp:"replace"},read:0,write:2,reference:2,color:!1,depth:!1},footCover:{face:{compare:"equal",passOp:"replace",failOp:"keep"},read:64,write:2,reference:66,color:!1,depth:!1},tintHigh:{face:{compare:"equal",passOp:"replace"},read:34,write:4,reference:38,color:!0,depth:!0},tintLow:{face:{compare:"equal",passOp:"replace"},read:34,write:4,reference:36,color:!0,depth:!0},clearLay:{face:{compare:"always",passOp:"zero"},read:0,write:224,reference:0,color:!1,depth:!1},shapeOnFoot:{face:{compare:"equal",passOp:"invert"},read:166,write:32,reference:6,color:!0,depth:!0},shapeOffFoot:{face:{compare:"equal",passOp:"invert"},read:166,write:32,reference:4,color:!0,depth:!0},coverOnFoot:{face:{compare:"equal",passOp:"invert",failOp:"keep",depthFailOp:"keep"},read:230,write:96,reference:70,color:!0,depth:!0},coverOffFoot:{face:{compare:"equal",passOp:"invert",failOp:"keep",depthFailOp:"keep"},read:230,write:96,reference:68,color:!0,depth:!0},clearFoot:{face:{compare:"always",passOp:"zero"},read:0,write:6,reference:0,color:!1,depth:!1},coat:{face:{compare:"equal",passOp:"keep",failOp:"keep",depthFailOp:"keep"},read:2,write:0,reference:0,color:!0,depth:!0},solid:{face:py,read:0,write:0,reference:0,color:!0,depth:!0},clear:{face:{compare:"always",passOp:"zero"},read:255,write:224,reference:0,color:!1,depth:!1}});var vd=64,Fi=112,wd=48,Md=`
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
${Bi(7)}
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
`,kd=`
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
`;var Ed=`
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
${Bi(3)}

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
`;var Li=20,dt=256,Sd=112,Jt="rg32uint",Er=dt/4,xy=256,Td={compare:"always",passOp:"zero"},vy={compare:"always",passOp:"replace"},wy={compare:"not-equal",passOp:"keep"},My={compare:"equal",passOp:"keep"},Rd="fn dequant(p: vec3f) -> vec3f { return draw.quantMin.xyz + p * draw.quantSize.xyz; }",Nd=32,Cd=`  let plating = input.dimensions.w - input.dimensions.z;
  let rim = select(1.0, ${(1/Math.cos(Math.PI/Nd)).toFixed(6)}, input.radiusMix > 1.5);
  let radius = mix(max(input.dimensions.z - plating, input.dimensions.z * 0.5), input.dimensions.z, min(input.radiusMix, 1.0)) * rim;
  let turn = vec2f(cos(input.shape.y), sin(input.shape.y));
  let local = vec2f(input.unit.x * radius + select(-input.shape.x, input.shape.x, input.unit.x >= 0.0), input.unit.y * radius);
  let planar = vec2f(local.x * turn.x - local.y * turn.y, local.x * turn.y + local.y * turn.x);
  let turnedNormal = vec3f(input.normal.x * turn.x - input.normal.y * turn.y, input.normal.x * turn.y + input.normal.y * turn.x, input.normal.z);
`,As=`
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
${Rd}
@group(0) @binding(3) var<storage, read> hiddenMask: array<u32>;
@group(0) @binding(4) var<storage, read> netMask: array<u32>;
${Ii}
${Yr}
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
`,ky=Te(As),Is=`
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
${Rd}
@group(0) @binding(3) var<storage, read> hiddenMask: array<u32>;
@group(0) @binding(4) var<storage, read> netMask: array<u32>;
${Ii}
${Yr}
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
`,Ey=Te(Is),Ui=`
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
${Yr}
${ie("decl")}${Es}
struct Output {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) @interpolate(flat) netId: u32,
  @location(2) @interpolate(flat) objectId: u32,
${ie("vs-out")}  @location(3) @interpolate(flat) visible: u32,
};
@vertex fn vs(input: Input) -> Output {
${Cd}  let z0 = input.span.x + layerOffsets[input.ids.z];
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
`,Sy=Te(Ui),zi=`
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
${Yr}
${ie("decl")}${Es}
struct Output {
  @builtin(position) position: vec4f,
  @location(3) @interpolate(flat) netId: u32,
  @location(0) @interpolate(flat) objectId: u32,
${ie("vs-out")}  @location(1) @interpolate(flat) visible: u32,
};
@vertex fn vs(input: Input) -> Output {
${Cd}  let world = vec3f(
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
`,Ty=Te(zi);function lr(t,e){return e.reduce((r,[a,s])=>{if(r.split(a).length!==2)throw new Error(`Shader variant anchor not found once: ${a.slice(0,60)}`);return r.replace(a,()=>s)},t)}var Gi=[`  padding0: u32,
  padding1: u32,`,`  selectedOccurrence: u32,
  occurrenceBase: u32,`],_s=[["  padding2: u32,","  emphasisStride: u32,"],["fn netEmphasized(id: u32) -> bool {",`${Dc}fn netEmphasized(id: u32) -> bool {`]],Bd="  let lit = netEmphasized(input.netId) || (globals.activeNet != 0u && input.netId == globals.activeNet);",Fd=`  let lit = emphasisOf(input.occurrence, input.netId) != 0u
    || (input.occurrence == globals.selectedOccurrence && globals.activeNet != 0u && input.netId == globals.activeNet);`,Ki=lr(As,[Gi,[`  @location(3) world: vec3f,
};`,`  @location(3) world: vec3f,
  @location(4) @interpolate(flat) occurrence: u32,
  // Mask and silkscreen opacity of this occurrence's own stackup separation (SB2-31f).
  @location(5) @interpolate(flat) fade: f32,
};`],[`@vertex fn vs(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.world = dequant(input.position) + draw.offset.xyz;
  output.position = globals.viewProjection * vec4f(output.world, 1.0);
  output.normal = normalize(input.normal);`,`${ra}
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
  let selectedComponent = here && component && globals.selectedFeature != 0u && input.objectId == globals.selectedFeature;`],..._s,["      base = vec3f(0.08, 1.0, 0.2) * pulse;","      base = emphasisColor(mark, vec3f(0.08, 1.0, 0.2)) * pulse;"],["  var alpha = draw.flags.y;","  var alpha = draw.flags.y * input.fade;"]]),Od=Te(Ki),Vi=lr(Is,[Gi,[`  @location(0) @interpolate(flat) objectId: u32,
};`,`  @location(0) @interpolate(flat) objectId: u32,
  @location(1) @interpolate(flat) occurrence: u32,
};`],[`@vertex fn vs(input: Input) -> Output {
  var output: Output;
  output.position = globals.viewProjection * vec4f(dequant(input.position) + draw.offset.xyz, 1.0);`,`${ra}
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
${ie("fs-return")}  return vec2u(input.occurrence, select(input.objectId, 0u, kind == 0u));`],..._s,[Bd,Fd]]),Pd=Te(Vi),Ay=`struct Placement { r0: vec4f, r1: vec4f, r2: vec4f, ids: vec4u };
@group(0) @binding(8) var<storage, read> placements: array<Placement>;
fn place(p: Placement, v: vec3f) -> vec3f {
  return vec3f(dot(p.r0.xyz, v) + p.r0.w, dot(p.r1.xyz, v) + p.r1.w, dot(p.r2.xyz, v) + p.r2.w);
}
fn turn(p: Placement, n: vec3f) -> vec3f {
  return vec3f(dot(p.r0.xyz, n), dot(p.r1.xyz, n), dot(p.r2.xyz, n));
}`,Ad="@group(0) @binding(1) var<uniform> draw: Draw;",Rs=[Ad,`${Ad}
${Ay}`],Ns=["  output.objectId = input.objectId;","  output.objectId = select(placement.ids.x, input.objectId, input.objectId != 0u);"],jd=["  let index = listedOccurrence(u32(draw.material.w + 0.5), instance);",`  let placement = placements[draw.placement.x + instance % draw.placement.y];
  let index = listedOccurrence(u32(draw.material.w + 0.5), instance / draw.placement.y);`],Ld=lr(As,[Rs,[`@vertex fn vs(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.world = dequant(input.position) + draw.offset.xyz;`,`@vertex fn vs(input: VertexInput, @builtin(instance_index) instance: u32) -> VertexOutput {
  let placement = placements[draw.placement.x + instance];
  var output: VertexOutput;
  output.world = place(placement, dequant(input.position)) + draw.offset.xyz;`],["  output.normal = normalize(input.normal);","  output.normal = normalize(turn(placement, input.normal));"],Ns]),Dd=lr(Ki,[Rs,jd,["occurrence.model * vec4f(dequant(input.position) + draw.offset.xyz + lift, 1.0)","occurrence.model * vec4f(place(placement, dequant(input.position)) + draw.offset.xyz + lift, 1.0)"],["(occurrence.normal * vec4f(input.normal, 0.0))","(occurrence.normal * vec4f(turn(placement, input.normal), 0.0))"],Ns]),Ud=lr(Is,[Rs,[`@vertex fn vs(input: Input) -> Output {
  var output: Output;
  output.position = globals.viewProjection * vec4f(dequant(input.position) + draw.offset.xyz, 1.0);`,`@vertex fn vs(input: Input, @builtin(instance_index) instance: u32) -> Output {
  let placement = placements[draw.placement.x + instance];
  var output: Output;
  output.position = globals.viewProjection * vec4f(place(placement, dequant(input.position)) + draw.offset.xyz, 1.0);`],Ns]),zd=lr(Vi,[Rs,jd,["occurrence.model * vec4f(dequant(input.position) + draw.offset.xyz + lift, 1.0)","occurrence.model * vec4f(place(placement, dequant(input.position)) + draw.offset.xyz + lift, 1.0)"],Ns]),Gd=Te(Ld),Kd=Te(Dd),Vd=Te(Ud),Hd=Te(zd),Oi=64,Iy=6,_y=`${pd}
${ra}
struct Input {
  @location(0) unit: vec3f,
  @location(1) normal: vec3f,
  @location(2) radiusMix: f32,
};`;function qd(t,e,r=[]){return lr(t,[Gi,[`@group(0) @binding(2) var<storage, read> layerOffsets: array<f32>;
`,""],[Es,_y],["@vertex fn vs(input: Input) -> Output {",`struct Record {
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
  let input = Record(vertex.unit, vertex.normal, vertex.radiusMix, barrel.dimensions, barrel.span, barrel.shape, barrel.ids);`],[e,e.replace("vec4f(world, 1.0)","vec4f((occurrence.model * vec4f(world, 1.0)).xyz, 1.0)")],["  output.objectId = input.ids.y;",`  output.objectId = input.ids.y;
  output.occurrence = index + 1u + globals.occurrenceBase;`],...r])}var Wd=qd(Ui,`  output.position = globals.viewProjection * vec4f(world, 1.0);
  output.normal = turnedNormal;`,[[`  let z0 = input.span.x + layerOffsets[input.ids.z];
  let z1 = input.span.y + layerOffsets[input.ids.w];`,`  let z0 = input.span.x + layerOffsets[input.ids.z] * spread;
  let z1 = input.span.y + layerOffsets[input.ids.w] * spread;`],[`  output.normal = turnedNormal;
  output.netId`,`  output.normal = (occurrence.normal * vec4f(turnedNormal, 0.0)).xyz;
  output.netId`],[`  @location(3) @interpolate(flat) visible: u32,
};`,`  @location(3) @interpolate(flat) visible: u32,
  @location(4) @interpolate(flat) occurrence: u32,
};`],["  let selected = netEmphasized(input.netId) || (globals.activeNet != 0u && input.netId == globals.activeNet);",`  let mark = emphasisOf(input.occurrence, input.netId);
  let selected = mark != 0u
    || (input.occurrence == globals.selectedOccurrence && globals.activeNet != 0u && input.netId == globals.activeNet);`],..._s,["      base = vec3f(0.1, 1.0, 0.22) * (","      base = emphasisColor(mark, vec3f(0.1, 1.0, 0.22)) * ("]]),Xd=qd(zi,`  output.position = globals.viewProjection * vec4f(world, 1.0);
  output.objectId`,[["mix(input.span.x + layerOffsets[input.ids.z], input.span.y + layerOffsets[input.ids.w], input.unit.z)","mix(input.span.x + layerOffsets[input.ids.z] * spread, input.span.y + layerOffsets[input.ids.w] * spread, input.unit.z)"],[`  @location(1) @interpolate(flat) visible: u32,
};`,`  @location(1) @interpolate(flat) visible: u32,
  @location(2) @interpolate(flat) occurrence: u32,
};`],["  return vec2u(1u, input.objectId);","  return vec2u(input.occurrence, input.objectId);"],..._s,[Bd,Fd]]),$d=Te(Wd),Yd=Te(Xd),Jd=`
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
${ra}
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
`,Qd=`${Jd}
@fragment fn fs(input: Output) -> @location(0) vec4f {
${ie("fs-begin")}  let light = normalize(globals.lightDirection.xyz);
${ie("fs-return")}  return vec4f(draw.color.rgb * (0.45 + max(dot(normalize(input.normal), light), 0.0) * 0.55), 1.0);
}
`,Zd=Te(Qd),eu=`${Jd}
@fragment fn fs(input: Output) -> @location(0) vec2u {
${ie("fs-begin")}${ie("fs-return")}  return vec2u(input.occurrence, 0u);
}
`,tu=Te(eu),Hi=`
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
`,Id=[{arrayStride:24,attributes:[{shaderLocation:0,offset:0,format:"float32x3"},{shaderLocation:1,offset:12,format:"float32x3"}]}],tT=Object.freeze({main:Od,pick:Pd,barrel:$d,barrelPick:Yd,box:Zd,boxPick:tu,cull:Hi,component:Gd,componentInstanced:Kd,componentPick:Vd,componentPickInstanced:Hd}),ru=Object.freeze({main:{output:"color",single:As,instanced:Ki,world:["output.world","output.world"]},pick:{output:"pick",single:Is,instanced:Vi,world:["(dequant(input.position) + draw.offset.xyz)","world"]},barrel:{output:"color",single:Ui,instanced:Wd,world:["world","(occurrence.model * vec4f(world, 1.0)).xyz"]},barrelPick:{output:"pick",single:zi,instanced:Xd,world:["world","(occurrence.model * vec4f(world, 1.0)).xyz"]},component:{output:"color",single:Ld,instanced:Dd,world:["output.world","output.world"]},componentPick:{output:"pick",single:Ud,instanced:zd,world:["(place(placement, dequant(input.position)) + draw.offset.xyz)","world"]},box:{output:"color",single:null,instanced:Qd,world:[null,"(occurrence.model * vec4f(local, 1.0)).xyz"]},boxPick:{output:"pick",single:null,instanced:eu,world:[null,"(occurrence.model * vec4f(local, 1.0)).xyz"]}}),rT=Object.freeze(Object.keys(ru));function Pi(t,e,r=[]){let a=ru[t],s=a?.[e?"instanced":"single"];if(!s)throw new Error(`No ${e?"instanced":"one-board"} ${t} shader`);return ld(s,r,{family:t,instanced:e,output:a.output,world:a.world[e?1:0]})}var aT=Object.freeze({main:ky,pick:Ey,barrel:Sy,barrelPick:Ty,mainInstanced:Od,pickInstanced:Pd,barrelInstanced:$d,barrelPickInstanced:Yd,component:Gd,componentInstanced:Kd,componentPick:Vd,componentPickInstanced:Hd,box:Zd,boxPick:tu,cull:Hi}),cr=class t{static async create(e,{sampleCount:r=4}={}){if(!navigator.gpu)throw new Error("WebGPU is unavailable in this browser");let a=await navigator.gpu.requestAdapter({powerPreference:"high-performance"});if(!a)throw new Error("No WebGPU adapter is available");let s=a.features.has("depth32float-stencil8"),n=await a.requestDevice(s?{requiredFeatures:["depth32float-stencil8"]}:void 0);return new t(e,n,{stencil:s,sampleCount:r})}constructor(e,r,{shareFrom:a=null,stencil:s=!1,sampleCount:n=1}={}){if(this.canvas=e,this.device=r,this.shareFrom=a,this.stencil=a?a.stencil:!!s,this.sampleCount=a?a.sampleCount:n===4?4:1,this.depthFormat=this.stencil?"depth32float-stencil8":"depth32float",this.version=0,this.barrelColor=[.55,.35,.16,.78],this.alwaysInstanced=!!a,this.occurrenceBase=0,a?(this.context=a.context,this.format=a.format):(r.addEventListener("uncapturederror",i=>{console.error(`Uncaptured WebGPU error: ${i.error?.message||i.error}`)}),r.lost.then(i=>{i.reason!=="destroyed"&&console.error(`WebGPU device lost: ${i.reason}`,i.message)}),this.context=e.getContext("webgpu"),this.format=navigator.gpu.getPreferredCanvasFormat(),this.context.configure({device:r,format:this.format,alphaMode:"opaque"})),this.entries=[],this.barrels=null,this.drawSlotCapacity=xy,this.drawSlotBuffer=this.createDrawSlotBuffer(this.drawSlotCapacity),this.drawStaging=new Float32Array(this.drawSlotCapacity*Er),this.freeDrawSlots=[],this.nextDrawSlot=0,this.globalBuffer=r.createBuffer({size:Sd,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.layerOffsetBuffer=r.createBuffer({size:1024,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.occurrenceMatrices=[[...$e]],this.occurrenceKeys=["0"],this.occurrenceHiddenLayers=[[]],this.occurrenceExplode=[null],this.identityOnly=!0,this.occurrenceCapacity=1,this.occurrenceBuffer=this.createOccurrenceBuffer(this.occurrenceCapacity),this.device.queue.writeBuffer(this.occurrenceBuffer,0,xs(this.occurrenceMatrices)),this.barrelRecordBuffer=r.createBuffer({label:"barrel-records",size:Ci,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.placementBuffer=r.createBuffer({label:"component-placements",size:Oi,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.componentPipelineSets=new Map,this.instancedPipelines=null,this.shaderFeatures=[],this.shaderFeatureKey="",this.featurePipelineSets=new Map,this.pipelineSetKinds=new WeakMap,this.listBuffer=this.createListBuffer(this.occurrenceCapacity),this.slotCapacity=0,this.slotArgs=new Uint32Array(0),this.slotClasses=new Uint32Array(0),this.freeSlots=[],this.nextSlot=2,this.argsBuffer=null,this.classesBuffer=null,this.growSlots(256),this.setSlot(0,0,4),this.setSlot(1,0,4),this.cull=null,this.box=null,this.boardBounds=null,this.selectedOccurrence=-1,this.lodOverride=null,this.lodThresholds={...st},this.innerCopperAtFull=!0,this.innerCopperMode="all",this.cullCounts={full:0,board:0,body:0,box:0,culled:0},this.frameStats={triangles:0,draws:0},this.boxColor=[.24,.36,.28,1],a)for(let i of["bindGroupLayout","pipelineLayout","vertexBuffers","pipeline","pickPipeline","barrelPipeline","barrelPickPipeline","singlePipelines"])this[i]=a[i];else this.createSinglePipelines();this.depth=null,this.colorTarget=null,this.pickDepth=null,this.pickTexture=null,this.insetColor=null,this.pickSerial=Promise.resolve(),this.bundleCache=new Map,this.globalScratch=new ArrayBuffer(Sd),this.globalScratchF32=new Float32Array(this.globalScratch),this.globalScratchView=new DataView(this.globalScratch),this.barrelDrawScratch=new Float32Array(dt/4),this.nextEntryId=1,this.hiddenFeatureIds=new Set,this.showPlaceholders=!0,this.hiddenBoardLayers=new Set,this.featureMaskCapacity=64,this.featureMaskBuffer=this.createFeatureMaskBuffer(this.featureMaskCapacity),this.uploadFeatureMask(),this.emphasizedNetIds=new Set,this.occurrenceEmphasis=null,this.emphasisStride=0,this.dimCopper=!1,this.netMaskCapacity=64,this.netMaskBuffer=this.createNetMaskBuffer(this.netMaskCapacity),this.uploadNetMask(),a&&this.setOccurrences([])}createSinglePipelines(){let e=this.device;this.bindGroupLayout=e.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:2,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:3,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:4,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:5,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:6,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:7,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:8,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}}]});let r=e.createPipelineLayout({bindGroupLayouts:[this.bindGroupLayout]});this.pipelineLayout=r;let a=this.vertexBuffers=[{arrayStride:Li,attributes:[{shaderLocation:0,offset:0,format:"unorm16x4"},{shaderLocation:1,offset:8,format:"snorm8x4"},{shaderLocation:2,offset:12,format:"uint32"},{shaderLocation:3,offset:16,format:"uint32"}]}];this.singlePipelines=this.makePipelineSet(!1,[]),this.pipeline=this.singlePipelines.main,this.pickPipeline=this.singlePipelines.pick,this.barrelPipeline=this.singlePipelines.barrel,this.barrelPickPipeline=this.singlePipelines.barrelPick}makeMainPipelines(e,r){let a=this.pipelineLayout,s=this.vertexBuffers,n=(c,l)=>this.makePipeline(a,e,this.format,s,`${c}${r}`,l),i=n("main",{stencil:Td}),o=n("main-blend");return{main:i,mark:this.stencil?n("main-mark",{stencil:vy}):i,blend:o,translucent:n("main-translucent",{depthWrite:!1,cullMode:"back"}),mask:this.stencil?n("mask",{stencil:wy}):o,maskCovered:this.stencil?n("mask-covered",{stencil:My,constants:{COVERED:1}}):null}}createOccurrenceBuffer(e){return this.device.createBuffer({label:"occurrences",size:e*160,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST})}createListBuffer(e){return this.device.createBuffer({label:"visible-occurrences",size:e*4*Uint32Array.BYTES_PER_ELEMENT,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST})}growSlots(e){let r=new Uint32Array(e*5);r.set(this.slotArgs);let a=new Uint32Array(e).fill(4);a.set(this.slotClasses),this.slotArgs=r,this.slotClasses=a,this.slotCapacity=e,this.argsBuffer?.destroy?.(),this.classesBuffer?.destroy?.(),this.argsBuffer=this.device.createBuffer({label:"indirect-args",size:r.byteLength,usage:GPUBufferUsage.INDIRECT|GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.classesBuffer=this.device.createBuffer({label:"draw-classes",size:a.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.device.queue.writeBuffer(this.argsBuffer,0,r),this.device.queue.writeBuffer(this.classesBuffer,0,a),this.cull&&(this.cull.bindGroup=this.makeCullBindGroup()),this.bundleCache?.clear()}setSlot(e,r,a){this.slotArgs.fill(0,e*5,e*5+5),this.slotArgs[e*5]=r,this.slotClasses[e]=a,this.device.queue.writeBuffer(this.argsBuffer,e*20,this.slotArgs,e*5,5),this.device.queue.writeBuffer(this.classesBuffer,e*4,this.slotClasses,e,1)}allocSlot(e,r){let a=this.freeSlots.length?this.freeSlots.pop():this.nextSlot++;return a>=this.slotCapacity&&this.growSlots(this.slotCapacity*2),this.setSlot(a,e,r),a}get occurrenceCount(){return this.occurrenceMatrices.length}setOccurrences(e){let{matrices:r,keys:a,hiddenLayers:s,explode:n}=nd(e??[$e]);this.occurrenceMatrices=r,this.occurrenceKeys=a,this.occurrenceHiddenLayers=s,this.occurrenceExplode=n,this.identityOnly=!this.alwaysInstanced&&r.length===1&&ws(r[0]),this.identityOnly||this.ensureInstancedPipelines(),r.length>this.occurrenceCapacity&&(this.occurrenceBuffer?.destroy?.(),this.listBuffer?.destroy?.(),this.occurrenceCapacity=Math.max(r.length,this.occurrenceCapacity*2),this.occurrenceBuffer=this.createOccurrenceBuffer(this.occurrenceCapacity),this.listBuffer=this.createListBuffer(this.occurrenceCapacity),this.cull&&(this.cull.lods.destroy(),this.cull.lods=this.createLodBuffer(this.occurrenceCapacity)),this.rebindAll()),r.length&&this.device.queue.writeBuffer(this.occurrenceBuffer,0,xs(r,s,n)),this.cull&&this.device.queue.writeBuffer(this.cull.lods,0,new Uint32Array(this.occurrenceCapacity).fill(Ei)),this.selectedOccurrence>=r.length&&(this.selectedOccurrence=-1),this.bundleCache.clear(),this.invalidate()}setOccurrenceHiddenLayers(e){this.occurrenceHiddenLayers=this.occurrenceMatrices.map((r,a)=>[...e?.[a]||[]].map(Number)),this.writeOccurrenceRecords()}setOccurrenceExplode(e){this.occurrenceExplode=this.occurrenceMatrices.map((r,a)=>e?.[a]?[...e[a]].map(Number):null),this.writeOccurrenceRecords()}writeOccurrenceRecords(){this.occurrenceMatrices.length&&this.device.queue.writeBuffer(this.occurrenceBuffer,0,xs(this.occurrenceMatrices,this.occurrenceHiddenLayers,this.occurrenceExplode)),this.invalidate()}setInnerCopperMode(e){this.setInnerCopperAtFull(!1),this.innerCopperMode!==e&&(this.innerCopperMode=e,this.invalidate())}setInnerCopperAtFull(e){if(this.innerCopperAtFull!==e){this.innerCopperAtFull=e;for(let r of this.entries)r.innerCopper&&(r.drawClass=_d(r,e),this.setSlot(r.slot,r.indexCount,r.drawClass));this.invalidate()}}setBoardBounds(e){this.boardBounds=e?[...e]:null,this.invalidate()}setLodThresholds(e){this.lodThresholds=kr({...this.lodThresholds,...e}),this.invalidate()}setAnalytic(e){this.analytic&&this.analytic!==e&&this.analytic.destroy(),this.analytic=e||null,this.bundleCache.clear(),this.invalidate()}setLodOverride(e){this.lodOverride=e==null?null:Number(e),this.invalidate()}createLodBuffer(e){return this.device.createBuffer({label:"occurrence-lods",size:e*Uint32Array.BYTES_PER_ELEMENT,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST})}createCull(){let e=this.device,r=this.shareFrom?.cull,a=i=>({visibility:GPUShaderStage.COMPUTE,buffer:{type:i}}),s=r?.layout||e.createBindGroupLayout({label:"cull",entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}},{binding:1,...a("read-only-storage")},{binding:2,...a("storage")},{binding:3,...a("storage")},{binding:4,...a("storage")},{binding:5,...a("storage")},{binding:6,...a("read-only-storage")}]}),n=r&&{layout:s,classify:r.classify,writeArgs:r.writeArgs};if(!n){let i=this.createShaderModule(Hi,"cull"),o=e.createPipelineLayout({bindGroupLayouts:[s]});n={layout:s,classify:e.createComputePipeline({layout:o,compute:{module:i,entryPoint:"classify"}}),writeArgs:e.createComputePipeline({layout:o,compute:{module:i,entryPoint:"writeArgs"}})}}this.cull={...n,uniform:e.createBuffer({label:"cull-params",size:192,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),lods:this.createLodBuffer(this.occurrenceCapacity),counters:e.createBuffer({label:"cull-counters",size:16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST}),readback:e.createBuffer({label:"cull-readback",size:16,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST}),scratch:new ArrayBuffer(192),reading:!1,readAt:0,bindGroup:null},e.queue.writeBuffer(this.cull.lods,0,new Uint32Array(this.occurrenceCapacity).fill(Ei)),this.cull.bindGroup=this.makeCullBindGroup()}makeCullBindGroup(){return this.device.createBindGroup({layout:this.cull.layout,entries:[{binding:0,resource:{buffer:this.cull.uniform}},{binding:1,resource:{buffer:this.occurrenceBuffer}},{binding:2,resource:{buffer:this.cull.lods}},{binding:3,resource:{buffer:this.listBuffer}},{binding:4,resource:{buffer:this.cull.counters}},{binding:5,resource:{buffer:this.argsBuffer}},{binding:6,resource:{buffer:this.classesBuffer}}]})}createBox(){let e=[[[1,0,0],[[1,0,0],[1,1,0],[1,1,1],[1,0,1]]],[[-1,0,0],[[0,0,0],[0,0,1],[0,1,1],[0,1,0]]],[[0,1,0],[[0,1,0],[0,1,1],[1,1,1],[1,1,0]]],[[0,-1,0],[[0,0,0],[1,0,0],[1,0,1],[0,0,1]]],[[0,0,1],[[0,0,1],[1,0,1],[1,1,1],[0,1,1]]],[[0,0,-1],[[0,0,0],[0,1,0],[1,1,0],[1,0,0]]]],r=[],a=[];e.forEach(([l,f],u)=>{for(let b of f)r.push(...b,...l);let p=u*4;a.push(p,p+1,p+2,p,p+2,p+3)});let s=new Float32Array(r),n=new Uint16Array(a),i=this.device.createBuffer({label:"box-vertices",size:s.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),o=this.device.createBuffer({label:"box-indices",size:n.byteLength,usage:GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST});this.device.queue.writeBuffer(i,0,s),this.device.queue.writeBuffer(o,0,n);let c=this.device.createBuffer({size:dt,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.box={vertexBuffer:i,indexBuffer:o,indexCount:n.length,drawBuffer:c,bindGroup:this.makeBindGroup(c),scratch:new Float32Array(dt/4)},this.setSlot(1,n.length,3)}writeBoxDraw(){let e=this.box.scratch,[r,a,s,n,i,o]=this.boardBounds;e.fill(0),e.set(this.boxColor,0),e.set([n-r,i-a,o-s,0],4),e.set([r,a,s,0],8),this.device.queue.writeBuffer(this.box.drawBuffer,0,e)}encodeCull(e,r){let a=this.cull,s=new Float32Array(a.scratch),n=new Uint32Array(a.scratch);s.fill(0),od(r.matrix).forEach((d,x)=>s.set(d,x*4));let i=r.lod;i&&s.set([...i.eye,i.orthographic?0:1],24);let o=this.boardBounds||[-1e6,-1e6,-1e6,1e6,1e6,1e6];s.set([o[0],o[1],o[2],0,o[3],o[4],o[5],0],28);let{fullPx:c,boardPx:l,boxPx:f,keep:u}=this.lodThresholds;s.set([i?.pixelScale||0,c,f,u],36);let p=this.lodOverride!=null?this.lodOverride+1:!i||!this.boardBounds?Ms+1:0;n.set([this.occurrenceMatrices.length,this.selectedOccurrence+1,p,this.nextSlot],40),n[44]=this.barrels?.instanceCount||0,s[45]=l,this.device.queue.writeBuffer(a.uniform,0,a.scratch),e.clearBuffer(a.counters);let b=e.beginComputePass({label:"cull"});b.setBindGroup(0,a.bindGroup),b.setPipeline(a.classify),b.dispatchWorkgroups(Math.ceil(this.occurrenceMatrices.length/64)),b.setPipeline(a.writeArgs),b.dispatchWorkgroups(Math.ceil(this.nextSlot/64)),b.end();let h=performance.now();return!a.reading&&h-a.readAt>250?(e.copyBufferToBuffer(a.counters,0,a.readback,0,16),a.readAt=h,!0):!1}readCullCounts(){let e=this.cull;e.reading=!0;let r=this.occurrenceMatrices.length;e.readback.mapAsync(GPUMapMode.READ).then(()=>{let[a,s,n,i]=new Uint32Array(e.readback.getMappedRange().slice(0));e.readback.unmap(),this.cullCounts={full:a,board:s-a,body:n-s,box:i,culled:Math.max(0,r-n-i)}}).catch(()=>{}).finally(()=>{e.reading=!1})}countFor(e){if(this.identityOnly)return e===2?this.barrels?.instanceCount||0:e===3?0:1;let{full:r,board:a,body:s,box:n}=this.cullCounts;return e===5?r+a+s:e===0?r+a:e===1?r:e===2?(r+a)*(this.barrels?.instanceCount||0):n}gpuMemoryBytes(){let e=0;for(let r of this.entries)e+=(r.vertexAllocation?.size||0)+(r.indexAllocation?.size||0);this.shareFrom||(e+=this.arenaSlackBytes());for(let r of[this.barrels?.vertexBuffer,this.barrels?.indexBuffer,this.barrels?.instanceBuffer,this.barrelRecordBuffer,this.occurrenceBuffer,this.listBuffer,this.argsBuffer,this.classesBuffer,this.featureMaskBuffer,this.netMaskBuffer,this.cull?.lods])e+=r?.size||0;return e+=this.analytic?.gpuMemoryBytes()||0,e+=this.canvas.width*this.canvas.height*12,e}gpuMemoryBreakdown(){let e={},r=0,a=0;for(let c of this.entries){let l=c.vertexAllocation?.size||0,f=c.indexAllocation?.size||0;r+=l,a+=f;let u=c.kind==="copper"?`copper:${c.layerId??"?"}`:c.boardRole?`${c.kind}:${c.boardRole}`:c.kind||"other";e[u]=(e[u]||0)+l+f}let s=[this.barrels?.vertexBuffer,this.barrels?.indexBuffer,this.barrels?.instanceBuffer,this.barrelRecordBuffer].reduce((c,l)=>c+(l?.size||0),0),n=[this.occurrenceBuffer,this.listBuffer,this.argsBuffer,this.classesBuffer,this.featureMaskBuffer,this.netMaskBuffer,this.cull?.lods].reduce((c,l)=>c+(l?.size||0),0),i=this.shareFrom?null:this.arenaStats(),o=this.analytic?.gpuMemoryBytes()||0;return{vertex:r,index:a,geometry:e,barrels:s,occurrences:n,analytic:o,targets:this.canvas.width*this.canvas.height*12,entries:this.entries.length,arena:i}}ensureInstancedPipelines(){if(!this.instancedPipelines){if(this.shareFrom){this.shareFrom.ensureInstancedPipelines(),this.instancedPipelines=this.shareFrom.instancedPipelines,this.createBox(),this.createCull();return}this.instancedPipelines=this.makePipelineSet(!0,[]),this.createBox(),this.createCull()}}makePipelineSet(e,r){let a=this.pipelineLayout,s=Ti(r),n=l=>Pi(l,e,r),i=s?`+${s}`:"",o=`${e?"-instanced":""}${i}`,c={...this.makeMainPipelines(n("main"),o),pick:this.makePipeline(a,n("pick"),Jt,this.vertexBuffers,`pick${o}`),barrel:this.makeBarrelPipeline(a,n("barrel"),this.format,`barrel${o}`,!e),barrelPick:this.makeBarrelPipeline(a,n("barrelPick"),Jt,`barrel-pick${o}`,!e)};return e&&(c.box=this.makePipeline(a,n("box"),this.format,Id,`box${i}`),c.boxPick=this.makePipeline(a,n("boxPick"),Jt,Id,`box-pick${i}`)),this.pipelineSetKinds.set(c,{instanced:e,features:na(r),key:s}),c}setShaderFeatures(e=[]){let r=na(e),a=Ti(r);a!==this.shaderFeatureKey&&(this.shaderFeatures=r,this.shaderFeatureKey=a,this.bundleCache.clear(),this.invalidate())}pipelinesFor(e){let r=this.shareFrom||this;if(e&&this.ensureInstancedPipelines(),!this.shaderFeatureKey)return e?r.instancedPipelines:r.singlePipelines;let a=`${e?"instanced":"single"}|${this.shaderFeatureKey}`,s=r.featurePipelineSets.get(a);return s||(s=r.makePipelineSet(e,this.shaderFeatures),r.featurePipelineSets.set(a,s)),s}drawSet(){return this.identityOnly?{pipelines:this.pipelinesFor(!1),indirect:!1,barrelInstances:this.barrels?.instanceCount||0}:{pipelines:this.pipelinesFor(!0),indirect:!0,barrelInstances:0}}drawEntry(e,r,a){e.setBindGroup(0,r.bindGroup);let s=r.vertexAllocation,n=r.indexAllocation;e.setVertexBuffer(0,s.buffer,s.offset,s.size),e.setIndexBuffer(n.buffer,r.indexFormat,n.offset,n.size),a?e.drawIndexedIndirect(this.argsBuffer,r.slot*20):e.drawIndexed(r.indexCount,r.placementCount||1)}drawBarrels(e,r,a,s){e.setPipeline(r),e.setBindGroup(0,this.barrels.bindGroup),e.setVertexBuffer(0,this.barrels.vertexBuffer),e.setVertexBuffer(1,this.barrels.instanceBuffer),e.setIndexBuffer(this.barrels.indexBuffer,"uint16"),a?e.drawIndexedIndirect(this.argsBuffer,0):e.drawIndexed(this.barrels.indexCount,s)}drawBox(e,r){!this.box||!this.boardBounds||(this.writeBoxDraw(),e.setPipeline(r),e.setBindGroup(0,this.box.bindGroup),e.setVertexBuffer(0,this.box.vertexBuffer),e.setIndexBuffer(this.box.indexBuffer,"uint16"),e.drawIndexedIndirect(this.argsBuffer,20))}createNetMaskBuffer(e){return this.device.createBuffer({label:"net-emphasis-mask",size:e*Uint32Array.BYTES_PER_ELEMENT,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST})}uploadNetMask(){let e;if(this.occurrenceEmphasis&&!this.identityOnly){let a=zc(this.occurrenceEmphasis);this.emphasisStride=a.stride,e=a.data}else this.emphasisStride=0,e=jc(this.emphasizedNetIds,this.netMaskCapacity);if(e.length>this.netMaskCapacity){this.netMaskBuffer?.destroy?.();let a=this.netMaskCapacity;for(;a<e.length;)a*=2;this.netMaskCapacity=a,this.netMaskBuffer=this.createNetMaskBuffer(a),this.rebindAll()}let r=new Uint32Array(this.netMaskCapacity);r.set(e),this.device.queue.writeBuffer(this.netMaskBuffer,0,r)}setOccurrenceEmphasis(e,{dimCopper:r=!1}={}){let a=Array.isArray(e)&&e.some(s=>s&&s.size);this.occurrenceEmphasis=a?e.map(s=>s&&s.size?new Map(s):null):null,this.dimCopper=!!r,this.uploadNetMask(),this.invalidate()}get netHighlightActive(){return!!(this.emphasizedNetIds.size||this.occurrenceEmphasis||this.dimCopper)}setEmphasizedNetIds(e){this.emphasizedNetIds=ts(e),this.occurrenceEmphasis=null;let r=Pc(this.emphasizedNetIds,this.netMaskCapacity);r!==this.netMaskCapacity&&(this.netMaskBuffer?.destroy?.(),this.netMaskCapacity=r,this.netMaskBuffer=this.createNetMaskBuffer(r),this.rebindAll()),this.uploadNetMask(),this.invalidate()}rebindAll(){for(let e of this.entries)e.bindGroup=this.makeBindGroup(this.drawSlotBuffer,e.drawSlot*dt);this.barrels&&(this.barrels.bindGroup=this.makeBindGroup(this.barrels.drawBuffer)),this.box&&(this.box.bindGroup=this.makeBindGroup(this.box.drawBuffer)),this.cull&&(this.cull.bindGroup=this.makeCullBindGroup()),this.bundleCache.clear()}createFeatureMaskBuffer(e){return this.device.createBuffer({label:"feature-visibility-mask",size:e*Uint32Array.BYTES_PER_ELEMENT,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST})}createDrawSlotBuffer(e){return this.device.createBuffer({label:"draw-uniforms",size:e*dt,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST})}allocateDrawSlot(){if(this.freeDrawSlots.length)return this.freeDrawSlots.pop();if(this.nextDrawSlot>=this.drawSlotCapacity){let e=this.drawSlotCapacity*2,r=new Float32Array(e*Er);r.set(this.drawStaging),this.drawSlotBuffer.destroy?.(),this.drawSlotCapacity=e,this.drawSlotBuffer=this.createDrawSlotBuffer(e),this.drawStaging=r,this.rebindAll()}return this.nextDrawSlot++}flushDraws(e){if(!e.length)return;let r=1/0,a=-1;for(let s of e)r=Math.min(r,s.drawSlot),a=Math.max(a,s.drawSlot);this.device.queue.writeBuffer(this.drawSlotBuffer,r*dt,this.drawStaging,r*Er,(a-r+1)*Er)}invalidate(){this.version+=1}setBarrelColor(e){this.barrelColor=[...e],this.invalidate()}makeBindGroup(e,r=0){return this.device.createBindGroup({layout:this.bindGroupLayout,entries:[{binding:0,resource:{buffer:this.globalBuffer}},{binding:1,resource:{buffer:e,offset:r,size:dt}},{binding:2,resource:{buffer:this.layerOffsetBuffer}},{binding:3,resource:{buffer:this.featureMaskBuffer}},{binding:4,resource:{buffer:this.netMaskBuffer}},{binding:5,resource:{buffer:this.occurrenceBuffer}},{binding:6,resource:{buffer:this.barrelRecordBuffer}},{binding:7,resource:{buffer:this.listBuffer}},{binding:8,resource:{buffer:this.placementBuffer}}]})}uploadFeatureMask(){let e=fd(this.hiddenFeatureIds,this.featureMaskCapacity);this.device.queue.writeBuffer(this.featureMaskBuffer,0,e)}setHiddenFeatureIds(e){this.hiddenFeatureIds=ks(e);let r=ud(this.hiddenFeatureIds,this.featureMaskCapacity);r!==this.featureMaskCapacity&&(this.featureMaskBuffer?.destroy?.(),this.featureMaskCapacity=r,this.featureMaskBuffer=this.createFeatureMaskBuffer(r),this.rebindAll()),this.uploadFeatureMask(),this.bundleCache.clear(),this.invalidate()}depthStencilState(e=null,r=!0){let a={format:this.depthFormat,depthWriteEnabled:r,depthCompare:"greater"};return this.stencil&&e&&(a.stencilFront=e,a.stencilBack=e),a}makePipeline(e,r,a,s,n,i={}){let o=this.createShaderModule(r,n);return this.device.createRenderPipeline({layout:e,vertex:{module:o,entryPoint:"vs",buffers:s},fragment:{module:o,entryPoint:"fs",...i.constants?{constants:i.constants}:{},targets:[{format:a,blend:a===Jt?void 0:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"triangle-list",cullMode:i.cullMode??"none"},depthStencil:this.depthStencilState(i.stencil,i.depthWrite??!0),multisample:{count:this.samplesFor(a)}})}makeBarrelPipeline(e,r,a,s,n=!0){let i=this.createShaderModule(r,s);return this.device.createRenderPipeline({layout:e,vertex:{module:i,entryPoint:"vs",buffers:[{arrayStride:28,attributes:[{shaderLocation:0,offset:0,format:"float32x3"},{shaderLocation:1,offset:12,format:"float32x3"},{shaderLocation:2,offset:24,format:"float32"}]},...n?[bd]:[]]},fragment:{module:i,entryPoint:"fs",targets:[{format:a,blend:a===Jt?void 0:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"triangle-list",cullMode:"none"},depthStencil:this.depthStencilState(),multisample:{count:this.samplesFor(a)}})}samplesFor(e){return e===Jt?1:this.sampleCount}createShaderModule(e,r){let a=this.device.createShaderModule({label:`pcb-${r}`,code:e});return typeof a.getCompilationInfo=="function"&&a.getCompilationInfo().then(s=>{let n=[...s.messages||[]];if(n.length){console.groupCollapsed(`WebGPU shader compilation info: pcb-${r}`);for(let i of n)console[i.type==="error"?"error":"warn"](`${i.type} ${i.lineNum}:${i.linePos} ${i.message}`);console.groupEnd()}}),a}resize(){let e=Math.min(devicePixelRatio||1,2),r=Math.max(1,Math.floor(this.canvas.clientWidth*e)),a=Math.max(1,Math.floor(this.canvas.clientHeight*e));if(this.canvas.width===r&&this.canvas.height===a)return;this.canvas.width=r,this.canvas.height=a,this.depth?.destroy(),this.colorTarget?.destroy(),this.pickDepth?.destroy(),this.pickTexture?.destroy();let s=this.sampleCount;this.depth=this.device.createTexture({label:"depth",size:[r,a],format:this.depthFormat,sampleCount:s,usage:GPUTextureUsage.RENDER_ATTACHMENT}),this.colorTarget=s>1?this.device.createTexture({label:"color-msaa",size:[r,a],format:this.format,sampleCount:s,usage:GPUTextureUsage.RENDER_ATTACHMENT}):null,this.pickDepth=s>1?this.device.createTexture({label:"pick-depth",size:[r,a],format:this.depthFormat,usage:GPUTextureUsage.RENDER_ATTACHMENT}):this.depth,this.pickTexture=this.device.createTexture({size:[r,a],format:Jt,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC})}addPrimitive(e,r){let a=e.position.length/3,s=new ArrayBuffer(a*Li),n=new Uint32Array(s),i=new Uint16Array(s),o=new Int8Array(s),c=Ny(e.position);for(let y=0;y<a;y+=1){let m=y*5,w=y*3;Cy(i,m*2,e.position,w,c),By(o,(m+2)*4,e.normal,w),n[m+3]=e.netId[y]||0,n[m+4]=e.objectFeatureId[y]||0}let l=this.arenas(),f=l.vertex.alloc(s.byteLength);l.vertex.write(f,s);let{indices:u,format:p}=Fy(e.indices,a),b=l.index.alloc(u.byteLength);l.index.write(b,u);let h=this.allocateDrawSlot(),d=this.makeBindGroup(this.drawSlotBuffer,h*dt),x=_d(r,this.innerCopperAtFull),g={...r,drawClass:x,slot:this.allocSlot(e.indices.length,r.placements?Iy|r.placements<<3:x),placementCount:r.placements||0,placementBase:0,bounds:e.bounds||r.bounds||null,id:this.nextEntryId++,vertexAllocation:f,indexAllocation:b,quantMin:c.min,quantSize:c.size,indexFormat:p,indexCount:e.indices.length,drawSlot:h,bindGroup:d};return this.entries.push(g),this.bundleCache.clear(),this.invalidate(),g}arenas(){let e=this.shareFrom||this;return e.geometryArenas??={vertex:new sa(e.device,GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST,"geometry-vertices"),index:new sa(e.device,GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST,"geometry-indices")},e.geometryArenas}arenaSlackBytes(){let e=this.geometryArenas;return e?e.vertex.reservedBytes()-e.vertex.usedBytes+e.index.reservedBytes()-e.index.usedBytes:0}arenaStats(){let e=this.geometryArenas;if(!e)return{chunks:0,reserved:0,used:0};let r=a=>a.chunks.reduce((s,n)=>s+n.free.filter(i=>i.offset+i.size<n.size).reduce((i,o)=>i+o.size,0),0);return{chunks:e.vertex.chunks.length+e.index.chunks.length,reserved:e.vertex.reservedBytes()+e.index.reservedBytes(),used:e.vertex.usedBytes+e.index.usedBytes,holes:r(e.vertex)+r(e.index)}}componentPipelines(e){let r=this.shareFrom||this,a=r.componentPipelineSets.get(e);if(!a){let{instanced:s,features:n,key:i}=r.pipelineSetKinds.get(e),o=r.pipelineLayout,c=r.vertexBuffers,l=Pi("component",s,n),f=Pi("componentPick",s,n),u=`${s?"-instanced":""}${i?`+${i}`:""}`;a={main:r.makePipeline(o,l,r.format,c,`component${u}`,{stencil:Td}),blend:r.makePipeline(o,l,r.format,c,`component-blend${u}`),pick:r.makePipeline(o,f,Jt,c,`component-pick${u}`)},r.componentPipelineSets.set(e,a)}return a}addInstancedPrimitives(e){let r=e.map(({primitive:a,placements:s,metadata:n})=>{let i=this.addPrimitive(a,{...n,placements:s.length});return i.placementRecords=s,i});return this.writePlacements(),r}writePlacements(){let e=this.entries.filter(o=>o.placementRecords),r=e.reduce((o,c)=>o+c.placementRecords.length,0),a=new ArrayBuffer(Math.max(1,r)*Oi),s=new Float32Array(a),n=new Uint32Array(a),i=0;for(let o of e){o.placementBase=i;for(let c of o.placementRecords){let l=i*(Oi/4);s.set(c.rows,l),n[l+12]=c.featureId||0,i+=1}}this.placementBuffer.size<a.byteLength&&(this.placementBuffer.destroy?.(),this.placementBuffer=this.device.createBuffer({label:"component-placements",size:a.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.rebindAll()),this.device.queue.writeBuffer(this.placementBuffer,0,a),this.invalidate()}removeEntries(e){if(!e?.length)return;let r=new Set(e.map(a=>a.id));for(let a of e){let s=this.arenas();a.vertexAllocation&&s.vertex.free(a.vertexAllocation),a.indexAllocation&&s.index.free(a.indexAllocation),this.freeDrawSlots.push(a.drawSlot),a.slot!=null&&(this.setSlot(a.slot,0,4),this.freeSlots.push(a.slot))}this.entries=this.entries.filter(a=>!r.has(a.id)),e.some(a=>a.placementRecords)&&this.writePlacements(),this.bundleCache.clear(),this.invalidate()}dispose(){this.removeEntries(this.entries),this.shareFrom||(this.geometryArenas?.vertex.destroy(),this.geometryArenas?.index.destroy(),this.geometryArenas=null),this.barrels&&(this.barrels.vertexBuffer?.destroy?.(),this.barrels.indexBuffer?.destroy?.(),this.barrels.instanceBuffer?.destroy?.(),this.barrels.drawBuffer?.destroy?.(),this.barrels=null),this.depth?.destroy(),this.colorTarget?.destroy(),this.pickDepth!==this.depth&&this.pickDepth?.destroy(),this.insetColor?.texture.destroy(),this.pickTexture?.destroy(),this.featureMaskBuffer?.destroy?.(),this.occurrenceBuffer?.destroy?.(),this.barrelRecordBuffer?.destroy?.(),this.listBuffer?.destroy?.(),this.argsBuffer?.destroy?.(),this.classesBuffer?.destroy?.();for(let e of[this.box?.vertexBuffer,this.box?.indexBuffer,this.box?.drawBuffer,this.cull?.uniform,this.cull?.lods,this.cull?.counters,this.cull?.readback])e?.destroy?.();this.box=null,this.cull=null,this.drawSlotBuffer?.destroy?.(),this.depth=null,this.colorTarget=null,this.pickDepth=null,this.insetColor=null,this.pickTexture=null,this.featureMaskBuffer=null,this.bundleCache.clear()}setBarrels(e){if(!e?.length)return;let r=Nd,a=[],s=[],n=(d,x,g)=>{let y=a.length/7;for(let m=0;m<r;m+=1){let w=Math.PI*2*(m+.5)/r,E=Math.cos(w),S=Math.sin(w),[A,T,_]=g(E,S);a.push(E,S,x,A,T,_,d)}return y},i=(d,x)=>{for(let g=0;g<r;g+=1){let y=(g+1)%r;s.push(d+g,d+y,x+y,d+g,x+y,x+g)}};for(let d of[0,1]){let x=d?(g,y)=>[-g,-y,0]:(g,y)=>[g,y,0];i(n(d,0,x),n(d,1,x))}for(let[d,x]of[[0,1],[1,-1]]){let g=()=>[0,0,x];i(n(0,d,g),n(2,d,g))}let o=new Float32Array(a),c=new Uint16Array(s),l=md(e),f=this.device.createBuffer({size:o.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),u=this.device.createBuffer({size:c.byteLength,usage:GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST}),p=this.device.createBuffer({size:l.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});this.device.queue.writeBuffer(f,0,o),this.device.queue.writeBuffer(u,0,c),this.device.queue.writeBuffer(p,0,l);let b=yd(e);this.barrelRecordBuffer?.destroy?.(),this.barrelRecordBuffer=this.device.createBuffer({label:"barrel-records",size:b.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.device.queue.writeBuffer(this.barrelRecordBuffer,0,b);let h=this.device.createBuffer({size:dt,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.barrels={records:e,vertexBuffer:f,indexBuffer:u,instanceBuffer:p,indexCount:c.length,instanceCount:e.length,drawBuffer:h,bindGroup:null},this.setSlot(0,c.length,2),this.rebindAll(),this.invalidate()}render(e){let{panels:r,layerOffsets:a}=e;this.resize(),this.device.queue.writeBuffer(this.layerOffsetBuffer,0,a);let s=this.context.getCurrentTexture().createView(),n=0,i=0;r.forEach((o,c)=>{let l=this.device.createCommandEncoder(),f=!this.identityOnly&&this.encodeCull(l,o),u=l.beginRenderPass({colorAttachments:[this.colorAttachment(s,c===0,c===r.length-1)],depthStencilAttachment:this.depthAttachment()}),p=ji(o.viewport,this.canvas.width,this.canvas.height);u.setViewport(p.x,p.y,p.width,p.height,0,1),u.setScissorRect(p.x,p.y,p.width,p.height);let b=this.encodeDraws(u,o,e);n+=b.triangles,i+=b.draws,u.end(),this.device.queue.submit([l.finish()]),f&&this.readCullCounts()}),this.frameStats={triangles:Math.round(n),draws:i}}renderInto(e,r,a){if(!this.identityOnly)throw new Error("renderInto: one-board renderer only");let s=this.device.createCommandEncoder({label:"inset"}),n={view:e.depthView,depthClearValue:0,depthLoadOp:"clear",depthStoreOp:"discard"};this.stencil&&Object.assign(n,{stencilClearValue:0,stencilLoadOp:"clear",stencilStoreOp:"discard"});let i=s.beginRenderPass({colorAttachments:[this.colorAttachment(e.colorView,!0,!0,this.insetColorView(e.width,e.height))],depthStencilAttachment:n}),o=ji(r.viewport,e.width,e.height);i.setViewport(o.x,o.y,o.width,o.height,0,1),i.setScissorRect(o.x,o.y,o.width,o.height);let c=this.encodeDraws(i,r,a);return i.end(),this.device.queue.submit([s.finish()]),c}encodeDraws(e,r,{activeNetId:a,selectedFeatureId:s,time:n,visibleLayers:i,showBoard:o,showComponents:c,showPaste:l=!0,componentOpacity:f,boardOpacity:u,isolateNet:p,compareMode:b=!1,compareOffsets:h=new Map,layerAlphas:d=null,visibleTileIds:x=null,layerOffsets:g=null}){let y=0,m=0,w=null;if(this.stencil&&e.setStencilReference(1),this.writeGlobals(r.matrix,a,r.layerId,n,s),this.relief?.ready&&!b)return{triangles:this.relief.vertexCount/3,draws:this.relief.encode(e,r.matrix)};let{pipelines:E,indirect:S,barrelInstances:A}=this.drawSet(),T=!l||!!(a||this.netHighlightActive),_=this.entries.filter(B=>this.visible(B,r.layerId,i,o,c,f,b,x)&&!(T&&B.boardRole==="paste")&&!(B.side&&this.hiddenBoardLayers?.has(`${B.boardRole}:${B.side}`))),R=_.filter(B=>!Ts(B)).sort((B,F)=>+!!B.stencilMark-+!!F.stencilMark),N=_.filter(B=>Ts(B)).sort((B,F)=>Ts(B)-Ts(F));for(let B of _)this.writeDraw(B,a,f,u,p,b,h.get(B.layerId),d?.get(B.layerId)??1);this.flushDraws(_),R.length>64?e.executeBundles([this.renderBundle(R,r.layerId)]):this.drawEntries(e,R,E,S);for(let B of _)y+=B.indexCount/3*this.countFor(B.drawClass)*(B.placementCount||1);return m+=_.length,this.analytic&&!b&&(w={matrix:r.matrix,showBoard:o,boardOpacity:u,hidePaste:T,isolateNet:p,panelLayer:r.layerId,assemblyOpacity:l?1:f,hiddenBoardLayers:this.hiddenBoardLayers},m+=this.analytic.encodeInto(e,g,r.layerId?new Set([r.layerId]):i,!1,w),m+=this.analytic.encodeBarrels(e,g,r.matrix),m+=this.analytic.encodeArrows(e)),!b&&this.barrels&&!this.analytic?.hasBarrels()&&(r.layerId===0||i.has(r.layerId))&&(this.writeBarrelDraw(p),this.drawBarrels(e,E.barrel,S,A),y+=this.barrels.indexCount/3*this.countFor(2),m+=1),S&&!b&&(this.drawBox(e,E.box),y+=12*this.countFor(3),m+=1),w&&(m+=this.analytic.encodeBlended(e,g,r.layerId?new Set([r.layerId]):i,w)),this.drawBlended(e,N,E,S),{triangles:y,draws:m}}colorAttachment(e,r=!0,a=!0,s=this.colorTarget?.createView()){let n={view:e,clearValue:{r:.91,g:.93,b:.94,a:1},loadOp:r?"clear":"load",storeOp:"store"};return this.sampleCount===1?n:{...n,view:s,resolveTarget:e,storeOp:a?"discard":"store"}}insetColorView(e,r){if(this.sampleCount!==1){if(this.insetColor?.width!==e||this.insetColor?.height!==r){this.insetColor?.texture.destroy();let a=this.device.createTexture({label:"inset-msaa",size:[e,r],format:this.format,sampleCount:this.sampleCount,usage:GPUTextureUsage.RENDER_ATTACHMENT});this.insetColor={texture:a,view:a.createView(),width:e,height:r}}return this.insetColor.view}}depthAttachment(e=!1){let r={view:(e?this.pickDepth:this.depth).createView(),depthClearValue:0,depthLoadOp:"clear",depthStoreOp:"discard"};return this.stencil&&Object.assign(r,{stencilClearValue:0,stencilLoadOp:"clear",stencilStoreOp:"discard"}),r}drawEntries(e,r,a,s){let n=null;for(let i of r){let o=i.placementCount?this.componentPipelines(a).main:i.stencilMark?a.mark:a.main;o!==n&&(e.setPipeline(o),n=o),this.drawEntry(e,i,s)}}drawBlended(e,r,a,s){for(let n of r)if(n.boardRole==="soldermask"&&n.kind==="board")e.setPipeline(a.mask),this.drawEntry(e,n,s),a.maskCovered&&(e.setPipeline(a.maskCovered),this.drawEntry(e,n,s));else{let i=n.translucent?a.translucent??a.blend:a.blend;e.setPipeline(n.placementCount?this.componentPipelines(a).blend:i),this.drawEntry(e,n,s)}}setPlaceholdersVisible(e){this.showPlaceholders=!!e,this.invalidate()}setHiddenBoardLayers(e){this.hiddenBoardLayers=new Set(e||[]),this.invalidate()}visible(e,r,a,s,n,i,o=!1,c=null){return e.placeholder&&!this.showPlaceholders||e.kind==="copper"&&this.analytic?.coversLayer(e.layerId)||e.kind==="board"&&this.analytic?.coversRole(e.boardRole)||e.kind==="board"&&e.boardRole==="pad"||!o&&e.kind==="copper"&&c&&!c.has(e.tileId)?!1:o?e.kind==="copper"&&a.has(e.layerId):e.innerCopper&&this.innerCopperMode==="none"?!1:e.boardRole==="paste"?r===0&&a.has(e.layerId):e.kind==="board"?r===0&&s:e.kind==="component"?r===0&&n&&i>.001:r?e.layerId===r:a.has(e.layerId)}writeGlobals(e,r,a,s,n=0){let i=this.globalScratch,o=this.globalScratchF32;o.fill(0),o.set(e,0);let c=this.globalScratchView;c.setUint32(64,r||0,!0),c.setUint32(68,a||0,!0),c.setFloat32(72,s,!0),c.setFloat32(76,r||this.netHighlightActive?1:0,!0),c.setUint32(80,n||0,!0),c.setUint32(84,this.selectedOccurrence>=0?this.selectedOccurrence+1+this.occurrenceBase:0,!0),c.setUint32(88,this.occurrenceBase,!0),c.setUint32(92,this.emphasisStride,!0),o.set([.35,-.5,.8,0],24),this.device.queue.writeBuffer(this.globalBuffer,0,i)}writeDraw(e,r,a,s=1,n=!1,i=!1,o=null,c=1){let l=this.drawStaging.subarray(e.drawSlot*Er,(e.drawSlot+1)*Er);l.fill(0);let f=e.color||e.material.baseColor;l.set(f,0),l.set([e.material.metallic||0,e.material.roughness??.72,e.opacityScale!=null?a:0,Ry[e.drawClass]??1],4);let u=Py(e);l.set([o?.[0]||0,o?.[1]||0,(i?-(e.baseZ||0):e.layerOffset||0)+u,e.kind==="copper"||e.boardRole==="paste"?Number(e.layerId||0)+1:0],8);let p=Number.isFinite(f?.[3])?f[3]:1,b=e.kind==="component"?a*(e.opacityScale??1):e.kind==="board"&&e.boardRole!=="paste"?s*Oy(e,p):c,h=e.kind==="copper"?1:e.kind==="component"?2:0,d=n?1:e.innerCopper&&this.innerCopperMode==="lit"?2:0;if(l.set([h,b,d,i?1:0],12),e.placementCount){let x=new Uint32Array(l.buffer,l.byteOffset+64,2);x[0]=e.placementBase,x[1]=e.placementCount}l.set(e.quantMin,20),l.set(e.quantSize,24)}writeBarrelDraw(e=!1){let r=this.barrelDrawScratch;r.fill(0),r.set(this.barrelColor,0),r.set([.75,.32,0,0],4),r.set([1,1,e?1:0,0],12),this.device.queue.writeBuffer(this.barrels.drawBuffer,0,r)}renderBundle(e,r){let{pipelines:a,indirect:s}=this.drawSet(),{vertex:n,index:i}=this.arenas(),o=`${r}:${s?"indirect":"single"}:${this.shaderFeatureKey}:${n.generation}.${i.generation}:${e.map(u=>u.id).join(",")}`,c=this.bundleCache.get(o);if(c)return c;let l=this.device.createRenderBundleEncoder({colorFormats:[this.format],depthStencilFormat:this.depthFormat,sampleCount:this.sampleCount});this.drawEntries(l,e,a,s);let f=l.finish();return this.bundleCache.set(o,f),this.bundleCache.size>32&&this.bundleCache.delete(this.bundleCache.keys().next().value),f}pick(e,r,a,s){let n=this.pickSerial.then(()=>this.performPick(e,r,a,s));return this.pickSerial=n.catch(()=>0),n}async performPick(e,r,a,s){this.resize();let n=Math.max(0,Math.min(this.canvas.width-1,Math.floor(r))),i=Math.max(0,Math.min(this.canvas.height-1,Math.floor(a)));this.device.queue.writeBuffer(this.layerOffsetBuffer,0,s.layerOffsets);let o=this.device.createCommandEncoder(),c=o.beginRenderPass({colorAttachments:[{view:this.pickTexture.createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}],depthStencilAttachment:this.depthAttachment(!0)}),l=ji(e.viewport,this.canvas.width,this.canvas.height);return c.setViewport(l.x,l.y,l.width,l.height,0,1),c.setScissorRect(l.x,l.y,l.width,l.height),this.encodePick(c,e,s),c.end(),this.readPick(o,n,i)}encodePick(e,r,a){if(this.relief?.ready&&!a.compareMode)return;this.writeGlobals(r.matrix,a.activeNetId,r.layerId,performance.now()/1e3,a.selectedFeatureId);let{pipelines:s,indirect:n,barrelInstances:i}=this.drawSet();e.setPipeline(s.pick);let o=[];for(let c of this.entries)this.visible(c,r.layerId,a.visibleLayers,a.showBoard,a.showComponents,a.componentOpacity,a.compareMode,a.visibleTileIds)&&(c.kind==="board"&&(this.identityOnly||c.boardRole!=="substrate")||(this.writeDraw(c,a.activeNetId,a.componentOpacity,a.boardOpacity,a.isolateNet,a.compareMode,a.compareOffsets?.get(c.layerId)),o.push(c)));this.flushDraws(o);for(let c of o)e.setPipeline(c.placementCount?this.componentPipelines(s).pick:s.pick),this.drawEntry(e,c,n);if(!a.compareMode&&this.barrels&&!this.analytic?.hasBarrels()&&(this.writeBarrelDraw(a.isolateNet),this.drawBarrels(e,s.barrelPick,n,i)),n&&!a.compareMode&&this.drawBox(e,s.boxPick),this.analytic&&!a.compareMode){let c=r.layerId?new Set([r.layerId]):a.visibleLayers;this.analytic.encodeInto(e,a.layerOffsets,c,!0,{matrix:r.matrix,panelLayer:r.layerId,isolateNet:a.isolateNet,showBoard:a.showBoard}),this.analytic.encodeBarrels(e,a.layerOffsets,r.matrix,!0)}}async readPick(e,r,a){let s=this.device.createBuffer({label:"pick-readback",size:256,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});e.copyTextureToBuffer({texture:this.pickTexture,origin:{x:r,y:a}},{buffer:s,bytesPerRow:256},{width:1,height:1}),this.device.queue.submit([e.finish()]);try{await s.mapAsync(GPUMapMode.READ);let n=new DataView(s.getMappedRange()),i=n.getUint32(0,!0),o=n.getUint32(4,!0);if(s.unmap(),this.analytic&&i&2147483648&&o)return{kind:"analytic",occurrenceIndex:-1,featureId:0,operationIndex:o-1,occurrenceKey:null};let c=sd(i,o);return{...c,occurrenceKey:c.occurrenceIndex>=0?this.occurrenceKeys[c.occurrenceIndex]??null:null}}finally{s.mapState==="mapped"&&s.unmap(),s.destroy()}}},Ry=Object.freeze({0:1,1:0,5:2});function Ny(t){let e=[1/0,1/0,1/0],r=[-1/0,-1/0,-1/0];for(let a=0;a<t.length;a+=3)for(let s=0;s<3;s+=1){let n=t[a+s];n<e[s]&&(e[s]=n),n>r[s]&&(r[s]=n)}return Number.isFinite(e[0])?{min:e,size:e.map((a,s)=>r[s]>a?r[s]-a:1)}:{min:[0,0,0],size:[1,1,1]}}function Cy(t,e,r,a,s){for(let n=0;n<3;n+=1){let i=(r[a+n]-s.min[n])/s.size[n];t[e+n]=Math.max(0,Math.min(65535,Math.round(i*65535)))}t[e+3]=0}function By(t,e,r,a){for(let s=0;s<3;s+=1){let n=Number(r[a+s])||0;t[e+s]=Math.max(-127,Math.min(127,Math.round(n*127)))}t[e+3]=0}function Fy(t,e){if(e<=65536){let r=new Uint16Array(t.length+(t.length&1));return r.set(t),{indices:r,format:"uint16"}}return{indices:t instanceof Uint32Array?t:new Uint32Array(t),format:"uint32"}}function au(t,e){return t*Li+(t<=65536?(e+(e&1))*2:e*4)}function _d(t,e){return t.kind==="component"||t.innerCopper&&e?1:t.kind==="board"&&(t.boardRole==="substrate"||t.boardRole==="soldermask")?5:0}function Ts(t){return t.translucent?3:t.kind!=="board"?0:t.boardRole==="soldermask"?1:t.boardRole==="silkscreen"?2:0}function Oy(t,e){return t.kind!=="board"||t.boardRole==="substrate"?1:t.boardRole==="soldermask"?Math.min(e,.72):t.boardRole==="silkscreen"?Math.min(e,.92):e}function Py(t){if(t.kind!=="board"||t.boardRole!=="soldermask"&&t.boardRole!=="silkscreen")return 0;let e=t.bounds,a=(e?(e[2]+e[5])*.5:0)<0?-1:1,s=t.boardRole==="silkscreen"?35e-6:18e-6;return a*s}function ji(t,e,r){let a=Math.max(0,Math.min(e-1,Math.floor(t.x))),s=Math.max(0,Math.min(r-1,Math.floor(t.y)));return{x:a,y:s,width:Math.max(1,Math.min(e-a,Math.floor(t.width))),height:Math.max(1,Math.min(r-s,Math.floor(t.height)))}}function su(t){return t*12+2}function nu(t){let e=[],r=0,a=0,s=0;for(let b=0;b<t.length;b+=1){let h=Math.floor(t[b].samplesMm.length/3);h<2||(e.push(b),r+=h,a+=su(h),s+=(h-1)*12*6+72)}let n=new Float32Array(Math.max(r,1)*4),i=new ArrayBuffer(Math.max(e.length,1)*32),o=new Uint32Array(i),c=new Float32Array(i),l=new Uint32Array(Math.max(s,3)),f=0,u=0,p=0;return e.forEach((b,h)=>{let d=t[b],x=Math.floor(d.samplesMm.length/3);for(let m=0;m<x;m+=1)n[(f+m)*4]=d.samplesMm[m*3]*.001,n[(f+m)*4+1]=d.samplesMm[m*3+1]*.001,n[(f+m)*4+2]=d.samplesMm[m*3+2]*.001;o[h*8]=f,o[h*8+1]=x,o[h*8+2]=u,o[h*8+3]=h,c[h*8+4]=d.radiusMm*.001;let g=(m,w)=>u+m*12+w%12;for(let m=0;m+1<x;m+=1)for(let w=0;w<12;w+=1)l.set([g(m,w),g(m+1,w),g(m+1,w+1),g(m,w),g(m+1,w+1),g(m,w+1)],p),p+=6;let y=u+x*12;for(let m=0;m<12;m+=1)l.set([y,g(0,m+1),g(0,m)],p),l.set([y+1,g(x-1,m),g(x-1,m+1)],p+3),p+=6;f+=x,u+=su(x)}),{samples:n,segments:o,indices:l,kept:e,sampleCount:r,vertexCount:a,indexCount:s}}var Ly=`
struct Segment { start: u32, count: u32, vertexStart: u32, color: u32, radius: f32, p0: u32, p1: u32, p2: u32 };
struct Vertex { position: vec4f, normal: vec4f };
`,Dy=`${Ly}
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
`,Uy=`
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
`,iu=96,Cs=class{constructor(e){this.host=e,this.device=e.device,this.counts={segments:0,samples:0,vertices:0,indices:0},this.dirty=!1,this.kept=[];let r=this.device,a=r.createShaderModule({label:"harness-tubes-compute",code:Dy});this.computeLayout=r.createBindGroupLayout({label:"harness-tubes-compute",entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},{binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},{binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},{binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},{binding:4,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}}]});let s=r.createPipelineLayout({bindGroupLayouts:[this.computeLayout]});this.framesPipeline=r.createComputePipeline({layout:s,compute:{module:a,entryPoint:"framesMain"}}),this.ringsPipeline=r.createComputePipeline({layout:s,compute:{module:a,entryPoint:"ringsMain"}});let n=r.createShaderModule({label:"harness-tubes-draw",code:Uy});this.drawLayout=r.createBindGroupLayout({label:"harness-tubes-draw",entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}}]}),this.drawPipeline=r.createRenderPipeline({label:"harness-tubes",layout:r.createPipelineLayout({bindGroupLayouts:[this.drawLayout]}),vertex:{module:n,entryPoint:"vs",buffers:[{arrayStride:32,attributes:[{shaderLocation:0,offset:0,format:"float32x4"},{shaderLocation:1,offset:16,format:"float32x4"}]}]},fragment:{module:n,entryPoint:"fs",targets:[{format:e.format}]},primitive:{topology:"triangle-list",cullMode:"none"},depthStencil:e.depthStencilState(),multisample:{count:e.sampleCount}}),this.globals=r.createBuffer({label:"harness-tubes-globals",size:iu,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.countBuffer=r.createBuffer({label:"harness-tubes-counts",size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.buffers={},this.capacity={samples:0,segments:0,vertices:0,indices:0},this.globalScratch=new Float32Array(iu/4)}ensure(e,r,a){let s=this.buffers[e];return s&&s.size>=r?!1:(s?.destroy(),this.buffers[e]=this.device.createBuffer({label:`harness-tubes-${e}`,size:Math.max(256,Math.ceil(r*1.5/4)*4),usage:a}),!0)}setTubes(e,r){let a=nu(e);if(this.kept=a.kept.map(o=>e[o]),this.counts={segments:a.kept.length,samples:a.sampleCount,vertices:a.vertexCount,indices:a.indexCount},!this.counts.segments){this.dirty=!1;return}let s=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,n=!1;n=this.ensure("samples",a.samples.byteLength,s)||n,n=this.ensure("segments",a.segments.byteLength,s)||n,n=this.ensure("frames",a.samples.byteLength,GPUBufferUsage.STORAGE)||n,n=this.ensure("vertices",this.counts.vertices*32,GPUBufferUsage.STORAGE|GPUBufferUsage.VERTEX)||n,this.ensure("indices",a.indices.byteLength,GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST);let i=this.device.queue;i.writeBuffer(this.buffers.samples,0,a.samples),i.writeBuffer(this.buffers.segments,0,a.segments),i.writeBuffer(this.buffers.indices,0,a.indices),i.writeBuffer(this.countBuffer,0,new Uint32Array([this.counts.segments,this.counts.samples,this.counts.vertices,0])),(n||!this.computeGroup)&&(this.computeGroup=this.device.createBindGroup({layout:this.computeLayout,entries:["samples","segments","frames","vertices"].map((o,c)=>({binding:c,resource:{buffer:this.buffers[o]}})).concat([{binding:4,resource:{buffer:this.countBuffer}}])})),this.setColors(r),this.dirty=!0}setColors(e){if(!this.counts.segments)return;let r=new Float32Array(this.counts.segments*4);this.kept.forEach((a,s)=>{let{rgb:n,mode:i}=e(a);r.set([n[0],n[1],n[2],i],s*4)}),(this.ensure("colors",r.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST)||!this.drawGroup||this.drawGroupColors!==this.buffers.colors)&&(this.drawGroup=this.device.createBindGroup({layout:this.drawLayout,entries:[{binding:0,resource:{buffer:this.globals}},{binding:1,resource:{buffer:this.buffers.colors}}]}),this.drawGroupColors=this.buffers.colors),this.device.queue.writeBuffer(this.buffers.colors,0,r)}encodeCompute(e){if(!this.dirty||!this.counts.segments)return;let r=e.beginComputePass({label:"harness-tubes"});r.setBindGroup(0,this.computeGroup),r.setPipeline(this.framesPipeline),r.dispatchWorkgroups(Math.ceil(this.counts.segments/64)),r.setPipeline(this.ringsPipeline),r.dispatchWorkgroups(Math.ceil(this.counts.vertices/64)),r.end(),this.dirty=!1}draw(e,r,a=0){if(!this.counts.segments)return 0;let s=this.globalScratch;return s.fill(0),s.set(r,0),s.set([.35,-.45,.82,0],16),s[20]=a,this.device.queue.writeBuffer(this.globals,0,s),e.setPipeline(this.drawPipeline),e.setBindGroup(0,this.drawGroup),e.setVertexBuffer(0,this.buffers.vertices),e.setIndexBuffer(this.buffers.indices,"uint32"),e.drawIndexed(this.counts.indices),this.counts.indices/3}gpuMemoryBytes(){return Object.values(this.buffers).reduce((e,r)=>e+r.size,0)}dispose(){for(let e of Object.values(this.buffers))e.destroy();this.globals.destroy(),this.countBuffer.destroy(),this.buffers={}}};var zy=[0,0,0,1,1,1],Bs=class t{static async create(e){return new t(await cr.create(e))}constructor(e){this.host=e,this.canvas=e.canvas,this.device=e.device,e.alwaysInstanced=!0,e.setOccurrences([]),this.assets=new Map,this.order=[],this.frameStats={triangles:0,draws:0},this.lodThresholds={...st},this.tubes=null,this.tubeVersion=0}setTubes(e,r){!e.length&&!this.tubes||(this.tubes??=new Cs(this.host),this.tubes.setTubes(e,r),this.tubeVersion+=1)}setTubeColors(e){this.tubes?.setColors(e),this.tubeVersion+=1}asset(e){let r=this.assets.get(e);return r||(r=new cr(this.canvas,this.device,{shareFrom:this.host}),r.setLodThresholds(this.lodThresholds),this.assets.set(e,r)),r}standIn(e,r){let a=this.asset(e);return a.standIn||(a.standIn=!0,a.setBoardBounds(zy),a.setLodOverride(id)),a.boxColor=[...r],a}removeAsset(e){let r=this.assets.get(e);r&&(r.dispose(),this.assets.delete(e))}get renderers(){return this.order.map(e=>this.assets.get(e)).filter(Boolean)}setOccurrences(e){this.order=[...e.keys()].filter(a=>this.assets.has(a));for(let[a,s]of this.assets)e.has(a)||s.setOccurrences([]);for(let a of this.order)this.assets.get(a).setOccurrences(e.get(a));let r=0;for(let a of this.renderers)a.occurrenceBase=r,r+=a.occurrenceCount;this.occurrenceCount=r}locate(e){for(let r of this.renderers){let a=e-r.occurrenceBase;if(a>=0&&a<r.occurrenceCount)return{renderer:r,local:a}}return null}keyOf(e){let r=this.locate(e);return r?r.renderer.occurrenceKeys[r.local]??null:null}setSelectedOccurrence(e){let r=e>=0?this.locate(e):null;for(let a of this.renderers)a.selectedOccurrence=!a.standIn&&r?.renderer===a?r.local:-1}resize(){this.host.resize()}render(e,r){let a=this.host;a.resize();let s=this.renderers.filter(u=>u.occurrenceCount>0),n=new Map(s.map(u=>[u,r(u)]));for(let[u,p]of n)ou(u,p);let i=this.device.createCommandEncoder(),o=s.filter(u=>u.encodeCull(i,e));this.tubes?.encodeCompute(i);let c=i.beginRenderPass({colorAttachments:[a.colorAttachment(a.context.getCurrentTexture().createView())],depthStencilAttachment:a.depthAttachment()});cu(c,e.viewport,this.canvas);let l=0,f=0;for(let u of s){let p=u.encodeDraws(c,e,n.get(u));l+=p.triangles,f+=p.draws}this.tubes?.counts.segments&&(l+=this.tubes.draw(c,e.matrix,performance.now()/1e3),f+=1),c.end(),this.device.queue.submit([i.finish()]);for(let u of o)u.readCullCounts();this.frameStats={triangles:Math.round(l),draws:f}}pick(e,r,a,s){let n=this.host.pickSerial.then(()=>this.performPick(e,r,a,s));return this.host.pickSerial=n.catch(()=>0),n}async performPick(e,r,a,s){let n=this.host;n.resize();let i=Math.max(0,Math.min(this.canvas.width-1,Math.floor(r))),o=Math.max(0,Math.min(this.canvas.height-1,Math.floor(a))),c=this.device.createCommandEncoder(),l=c.beginRenderPass({colorAttachments:[{view:n.pickTexture.createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}],depthStencilAttachment:n.depthAttachment(!0)});cu(l,e.viewport,this.canvas);for(let p of this.renderers){if(p.occurrenceCount===0)continue;let b=s(p);ou(p,b),p.encodePick(l,e,b)}l.end();let f=await n.readPick(c,i,o),u=f.occurrenceIndex>=0?this.locate(f.occurrenceIndex):null;return{...f,occurrenceKey:u?u.renderer.occurrenceKeys[u.local]??null:null,renderer:u?.renderer||null,standIn:!!u?.renderer?.standIn}}gpuMemoryBytes(){let e=0;for(let r of this.renderers)e+=r.gpuMemoryBytes();return e+=this.tubes?.gpuMemoryBytes()||0,e+=this.host.arenaSlackBytes(),e-Math.max(0,this.renderers.length-1)*this.canvas.width*this.canvas.height*12}gpuMemoryBreakdown(){let e={};for(let[r,a]of this.assets){let s=a.gpuMemoryBreakdown();delete s.targets,e[r]=s}return{assets:e,tubes:this.tubes?.gpuMemoryBytes()||0,targets:this.canvas.width*this.canvas.height*12,arena:this.host.arenaStats()}}setLodThresholds(e){this.lodThresholds=kr({...this.lodThresholds,...e});for(let r of this.assets.values())r.setLodThresholds(this.lodThresholds);return{...this.lodThresholds}}cullCounts(){let e={full:0,board:0,body:0,box:0,culled:0};for(let r of this.renderers)if(r.occurrenceCount)for(let a of Object.keys(e))e[a]+=r.cullCounts[a]||0;return e}dispose(){for(let e of[...this.assets.keys()])this.removeAsset(e);this.tubes?.dispose(),this.tubes=null,this.host.dispose(),this.host.context?.unconfigure?.(),this.device.destroy?.()}};function ou(t,e){e?.layerOffsets&&t.device.queue.writeBuffer(t.layerOffsetBuffer,0,e.layerOffsets)}function cu(t,e,r){let a=Math.max(0,Math.min(r.width-1,Math.floor(e.x))),s=Math.max(0,Math.min(r.height-1,Math.floor(e.y))),n=Math.max(1,Math.min(r.width-a,Math.floor(e.width))),i=Math.max(1,Math.min(r.height-s,Math.floor(e.height)));t.setViewport(a,s,n,i,0,1),t.setScissorRect(a,s,n,i)}var Gy=`
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
}`,Ky=`
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
}`,Vy=`
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
}`,Hy=`
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
}`,qy=`
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
}`,Wy=`
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
}`,Xy=`
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
}`,$y=6.2,Yy=4.6,Jy=3.8,Os=4*1024*1024,Qy=Math.floor(Os/6),lu=Qy*6,Fs=512*1024,du=512*1024,uu=96,Zy=96,ex=18,fu=96*1024*1024,tx=2,Ls=class t{static async create(e,r){if(!navigator.gpu)throw new Error("WebGPU is unavailable in this browser");let a=await navigator.gpu.requestAdapter({powerPreference:"high-performance"});if(!a)throw new Error("No WebGPU adapter is available");let s=await a.requestDevice(),n=await fetch(r,{cache:"default"});if(!n.ok)throw new Error(`Failed to load schematic manifest: ${n.status}`);let i=await n.json();if(!["prism.schematic_world_a0","prism.schematic_vector_a0"].includes(i.schema))throw new Error(`Unsupported schematic scene schema: ${i.schema}`);let o=i.featureTable||i.features,c=await fetch(new URL(o,r),{cache:"default"});if(!c.ok)throw new Error(`Failed to load schematic features: ${c.status}`);let l=ax(await c.json());return new t(e,s,r,i,l)}constructor(e,r,a,s,n){this.canvas=e,this.device=r,this.manifestUrl=a,this.manifest=s,this.isNativeScene=s.schema==="prism.schematic_vector_a0",this.pages=s.pages||[],this.featuresByPage=n,this.featuresById=new Map;for(let b of Object.values(n))for(let h of b)this.featuresById.set(Number(h.id),h);this.context=e.getContext("webgpu"),this.format=navigator.gpu.getPreferredCanvasFormat(),this.context.configure({device:r,format:this.format,alphaMode:"opaque"}),this.flowCanvas=null,this.flowContext=null,this.globalBuffer=r.createBuffer({size:48,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.bindGroupLayout=r.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:2,visibility:GPUShaderStage.FRAGMENT,sampler:{type:"filtering"}},{binding:3,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:"float"}}]});let i=r.createShaderModule({code:Gy});this.pagePipeline=r.createRenderPipeline({layout:r.createPipelineLayout({bindGroupLayouts:[this.bindGroupLayout]}),vertex:{module:i,entryPoint:"vs"},fragment:{module:i,entryPoint:"fs",targets:[{format:this.format}]},primitive:{topology:"triangle-list"}}),this.edgeLayout=r.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}}]});let o=r.createShaderModule({code:Ky});this.edgePipeline=r.createRenderPipeline({layout:r.createPipelineLayout({bindGroupLayouts:[this.edgeLayout]}),vertex:{module:o,entryPoint:"vs",buffers:[{arrayStride:8,attributes:[{shaderLocation:0,offset:0,format:"float32x2"}]}]},fragment:{module:o,entryPoint:"fs",targets:[{format:this.format,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"line-list"}}),this.edgeBindGroup=r.createBindGroup({layout:this.edgeLayout,entries:[{binding:0,resource:{buffer:this.globalBuffer}}]});let c=r.createShaderModule({code:Vy});this.highlightPipeline=r.createRenderPipeline({layout:r.createPipelineLayout({bindGroupLayouts:[this.edgeLayout]}),vertex:{module:c,entryPoint:"vs",buffers:[{arrayStride:8,attributes:[{shaderLocation:0,offset:0,format:"float32x2"}]}]},fragment:{module:c,entryPoint:"fs",targets:[{format:this.format,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"line-list"}}),this.highlightBufferSize=4*1024*1024,this.highlightBuffer=r.createBuffer({size:this.highlightBufferSize,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});let l=r.createShaderModule({code:Hy});this.netFlowPipeline=r.createRenderPipeline({layout:r.createPipelineLayout({bindGroupLayouts:[this.edgeLayout]}),vertex:{module:l,entryPoint:"vs",buffers:[{arrayStride:16,attributes:[{shaderLocation:0,offset:0,format:"float32x2"},{shaderLocation:1,offset:8,format:"float32x2"}]}]},fragment:{module:l,entryPoint:"fs",targets:[{format:this.format,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"triangle-list"}}),this.netFlowBuffer=r.createBuffer({size:du*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),this.globalUniformScratch=new Float32Array(12),this.pageUniformScratch=new Float32Array(8),this.imageUniformScratch=new Float32Array(8),this.vectorScratch=new Float32Array(Os),this.highlightScratch=new Float32Array(this.highlightBufferSize/4),this.netFlowScratch=new Float32Array(du),this.netTrackingCache=null,this.selectedIntrasheetLinkIndex=-1,this.truncatedHighlightCount=0,this.truncatedVectorCount=0,this.frameSerial=0,this.querySerial=0;let f=r.createShaderModule({code:qy});this.vectorPipeline=r.createRenderPipeline({layout:r.createPipelineLayout({bindGroupLayouts:[this.edgeLayout]}),vertex:{module:f,entryPoint:"vs",buffers:[{arrayStride:24,attributes:[{shaderLocation:0,offset:0,format:"float32x2"},{shaderLocation:1,offset:8,format:"float32x4"}]}]},fragment:{module:f,entryPoint:"fs",targets:[{format:this.format,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"triangle-list"}}),this.vectorBuffer=r.createBuffer({size:Os*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),this.vectorBuffers=[this.vectorBuffer];let u=r.createShaderModule({code:Wy});this.imagePipeline=r.createRenderPipeline({layout:r.createPipelineLayout({bindGroupLayouts:[this.bindGroupLayout]}),vertex:{module:u,entryPoint:"vs"},fragment:{module:u,entryPoint:"fs",targets:[{format:this.format,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"triangle-list"}});let p=r.createShaderModule({code:Xy});this.pickPipeline=r.createRenderPipeline({layout:r.createPipelineLayout({bindGroupLayouts:[this.edgeLayout]}),vertex:{module:p,entryPoint:"vs",buffers:[{arrayStride:12,attributes:[{shaderLocation:0,offset:0,format:"float32x2"},{shaderLocation:1,offset:8,format:"uint32"}]}]},fragment:{module:p,entryPoint:"fs",targets:[{format:"r32uint"}]},primitive:{topology:"triangle-list"}}),this.pickVertexBuffer=r.createBuffer({size:Fs*12,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),this.pickReadBuffer=r.createBuffer({size:256,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST}),this.pickTexture=null,this.pickTextureSize=[0,0],this.pickPending=!1,this.vectorChunks=new Map,this.failedVectorChunks=new Map,this.nativeDetailState=new Map,this.domDetailPageIds=new Set,this.nativeDetailThresholds=new Map,this.residentVectorBytes=0,this.sampler=r.createSampler({magFilter:"linear",minFilter:"linear",mipmapFilter:"linear"}),this.placeholder=this.createSolidTexture([245,247,249,255]),this.pageResources=new Map,this.imageResources=new Map,this.loading=new Map,this.selectedPageId="",this.selectedFeatureId=0,this.activeNetUid="",this.showHierarchy=!0,this.downloadedBytes=0,this.world=s.worldBoundsMm,this.center=[(this.world.minX+this.world.maxX)/2,(this.world.minY+this.world.maxY)/2],this.scale=Math.max((this.world.maxX-this.world.minX)/900,(this.world.maxY-this.world.minY)/650,.1)*1.16,this.edgeBuffer=this.createEdgeBuffer();for(let b of this.pages)this.createPageResource(b)}createSolidTexture(e){let r=this.device.createTexture({size:[1,1],format:"rgba8unorm-srgb",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});return this.device.queue.writeTexture({texture:r},new Uint8Array(e),{bytesPerRow:4},[1,1]),r}createPageResource(e){let r=this.device.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),a={page:e,uniform:r,texture:this.placeholder,textureWidth:0,svgBlob:null,bindGroup:null};this.pageResources.set(e.id,a),this.updateBindGroup(a)}createImageResource(e){let r=this.device.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),a={path:e,uniform:r,texture:this.placeholder,loaded:!1,bindGroup:null};return this.imageResources.set(e,a),this.updateBindGroup(a),a}updateBindGroup(e){e.bindGroup=this.device.createBindGroup({layout:this.bindGroupLayout,entries:[{binding:0,resource:{buffer:this.globalBuffer}},{binding:1,resource:{buffer:e.uniform}},{binding:2,resource:this.sampler},{binding:3,resource:e.texture.createView()}]})}async loadImageTexture(e){let r=this.imageResources.get(e)||this.createImageResource(e);if(r.loaded)return r;let a=`image:${e}`;if(this.loading.has(a))return this.loading.get(a);let s=(async()=>{try{let n=await fetch(new URL(e,this.manifestUrl),{cache:"default"});if(!n.ok)throw new Error(`Failed to load schematic image ${e}: ${n.status}`);let i=await n.blob(),o=await createImageBitmap(i),c=this.device.createTexture({size:[o.width,o.height],format:"rgba8unorm-srgb",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});this.device.queue.copyExternalImageToTexture({source:o},{texture:c},[o.width,o.height]),o.close(),r.texture!==this.placeholder&&r.texture.destroy(),r.texture=c,r.loaded=!0,this.updateBindGroup(r)}finally{this.loading.delete(a)}return r})();return this.loading.set(a,s),s}createEdgeBuffer(){let e=new Map(this.pages.map(n=>[n.id,n])),r=[];for(let n of this.manifest.edges||[]){let i=e.get(n.source),o=e.get(n.target);!i||!o||r.push(i.worldX+i.widthMm/2,i.worldY+i.heightMm,o.worldX+o.widthMm/2,o.worldY)}let a=new Float32Array(r);if(!a.length)return null;let s=this.device.createBuffer({size:a.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});return this.device.queue.writeBuffer(s,0,a),{buffer:s,count:a.length/2}}resize(){let e=Math.min(devicePixelRatio||1,2),r=Math.max(1,Math.floor(this.canvas.clientWidth*e)),a=Math.max(1,Math.floor(this.canvas.clientHeight*e));(this.canvas.width!==r||this.canvas.height!==a)&&(this.canvas.width=r,this.canvas.height=a),this.flowCanvas&&(this.flowCanvas.width!==r||this.flowCanvas.height!==a)&&(this.flowCanvas.width=r,this.flowCanvas.height=a)}setFlowOverlayCanvas(e){e&&(this.flowCanvas=e,this.flowContext=e.getContext("webgpu"),this.flowContext.configure({device:this.device,format:this.format,alphaMode:"premultiplied"}))}writeGlobals(){let e=this.globalUniformScratch;e[0]=this.center[0],e[1]=this.center[1],e[2]=this.scale,e[3]=performance.now()*.001,e[4]=this.canvas.width,e[5]=this.canvas.height,this.device.queue.writeBuffer(this.globalBuffer,0,e)}pagePixelWidth(e){return e.widthMm/this.scale}pageSourcePixelsPerMm(e){let r=this.pagePixelWidth(e)/Math.max(1,e.sourceWidthMm||e.widthMm),a=e.heightMm/this.scale/Math.max(1,e.sourceHeightMm||e.heightMm);return Math.min(r,a)}pageNativeDetailThresholds(e){let r=this.nativeDetailThresholds.get(e.id);if(r)return r;let a=Math.max(1,e.sourceWidthMm||e.widthMm),s=Math.max(1,e.sourceHeightMm||e.heightMm),n=a*s,i=Math.max(0,e.featureCount||e.featureIds?.length||0)/Math.max(1,n),o=ce(1-i*72,.84,1.08),c=ce(Math.sqrt(Math.max(a,s)/Math.max(1,Math.min(a,s)))/1.18,.92,1.14),l=ce($y*o*c,5,7.4),f={enter:l,exit:ce(Math.min(l-1.2,Yy*o),3.8,l-.7),prefetch:ce(Math.min(l-2,Jy*o),3,l-1)};return this.nativeDetailThresholds.set(e.id,f),f}pageWantsNativeDetail(e){if(!this.pageHasNativeDetail(e))return!1;let r=this.pageSourcePixelsPerMm(e),a=this.nativeDetailState.get(e.id)===!0,s=this.pageNativeDetailThresholds(e),n=a?s.exit:s.enter,i=r>=n;return i!==a&&this.nativeDetailState.set(e.id,i),i}pageNativeDetailReady(e){if(this.domDetailPageIds.has(e.id)||!this.pageWantsNativeDetail(e))return!1;let r=this.vectorChunks.get(e.id);return!r?.loaded||!r.segments?.length&&!r.fills?.length?!1:this.visibleNativeImagesReady(e,r)}visibleNativeImagesReady(e,r){if(!r?.images?.length)return!0;let a=this.sourceViewportBounds(e,4),s=!0;for(let n of r.images){if(!vt(n.bounds,a))continue;(this.imageResources.get(n.path)||this.createImageResource(n.path)).loaded||(s=!1,this.loadImageTexture(n.path).catch(()=>{}))}return s}visiblePages(){let e=this.canvas.width*this.scale/2,r=this.canvas.height*this.scale/2,a=this.center[0]-e,s=this.center[0]+e,n=this.center[1]-r,i=this.center[1]+r;return this.pages.filter(o=>o.worldX+o.widthMm>=a&&o.worldX<=s&&o.worldY+o.heightMm>=n&&o.worldY<=i)}worldViewportBounds(e=0){let r=this.canvas.width*this.scale/2,a=this.canvas.height*this.scale/2;return[this.center[0]-r-e,this.center[1]-a-e,this.center[0]+r+e,this.center[1]+a+e]}sourceViewportBounds(e,r=2.5){let a=this.worldViewportBounds(this.scale*8),s=(a[0]-e.worldX)/e.widthMm*e.sourceWidthMm-r,n=(a[1]-e.worldY)/e.heightMm*e.sourceHeightMm-r,i=(a[2]-e.worldX)/e.widthMm*e.sourceWidthMm+r,o=(a[3]-e.worldY)/e.heightMm*e.sourceHeightMm+r;return[Math.max(-r,Math.min(s,i)),Math.max(-r,Math.min(n,o)),Math.min(e.sourceWidthMm+r,Math.max(s,i)),Math.min(e.sourceHeightMm+r,Math.max(n,o))]}render(){this.frameSerial+=1,this.resize(),this.writeGlobals();let e=this.visiblePages(),r=this.device.createCommandEncoder(),a=r.beginRenderPass({colorAttachments:[{view:this.context.getCurrentTexture().createView(),clearValue:{r:.045,g:.055,b:.073,a:1},loadOp:"clear",storeOp:"store"}]});this.showHierarchy&&this.edgeBuffer&&(a.setPipeline(this.edgePipeline),a.setBindGroup(0,this.edgeBindGroup),a.setVertexBuffer(0,this.edgeBuffer.buffer),a.draw(this.edgeBuffer.count)),a.setPipeline(this.pagePipeline);for(let i of e){let o=this.pageResources.get(i.id),c=this.activeNetUid&&i.netUids.includes(this.activeNetUid),l=this.domDetailPageIds.has(i.id),f=!l&&this.pageNativeDetailReady(i),u=this.pageUniformScratch;u[0]=i.worldX,u[1]=i.worldY,u[2]=i.widthMm,u[3]=i.heightMm,u[4]=i.id===this.selectedPageId?1:0,u[5]=c?1:0,u[6]=this.activeNetUid?1:0,u[7]=f||l?1:0,this.device.queue.writeBuffer(o.uniform,0,u),a.setBindGroup(0,o.bindGroup),a.draw(6);let p=ce(Math.ceil(this.pagePixelWidth(i)*1.3/512)*512,512,6144);o.textureWidth<p*.82&&this.loadPageTexture(i,p).catch(()=>{})}this.scheduleVisibleVectorLoads(e),this.drawVisibleImages(a,e),this.drawVisibleVectors(a,e);let s=this.writeNetTrackingOverlay();s&&!this.flowContext&&(a.setPipeline(this.netFlowPipeline),a.setBindGroup(0,this.edgeBindGroup),a.setVertexBuffer(0,this.netFlowBuffer),a.draw(s));let n=this.writeNetHighlights(e);return n&&(a.setPipeline(this.highlightPipeline),a.setBindGroup(0,this.edgeBindGroup),a.setVertexBuffer(0,this.highlightBuffer),a.draw(n)),a.end(),this.device.queue.submit([r.finish()]),this.renderFlowOverlay(s),this.evictVectorChunks(e),e}renderFlowOverlay(e){if(!this.flowContext)return;let r=this.device.createCommandEncoder(),a=r.beginRenderPass({colorAttachments:[{view:this.flowContext.getCurrentTexture().createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}]});e&&(a.setPipeline(this.netFlowPipeline),a.setBindGroup(0,this.edgeBindGroup),a.setVertexBuffer(0,this.netFlowBuffer),a.draw(e)),a.end(),this.device.queue.submit([r.finish()])}drawVisibleImages(e,r){if(!this.isNativeScene)return;let a=!1;for(let s of r){if(this.domDetailPageIds.has(s.id)||!this.pageNativeDetailReady(s))continue;let n=this.vectorChunks.get(s.id);if(!n?.images?.length)continue;let i=this.sourceViewportBounds(s,4);for(let o of n.images){if(!vt(o.bounds,i))continue;let c=this.imageResources.get(o.path)||this.createImageResource(o.path);c.loaded||this.loadImageTexture(o.path).catch(()=>{});let l=o.worldOrigin||this.sourceToWorld(s,[o.xMm,o.yMm]),f=o.worldSize||this.sourceSizeToWorld(s,o.widthMm,o.heightMm),u=this.imageUniformScratch;u[0]=l[0],u[1]=l[1],u[2]=f[0],u[3]=f[1],u[4]=0,u[5]=0,u[6]=0,u[7]=0,this.device.queue.writeBuffer(c.uniform,0,u),a||(e.setPipeline(this.imagePipeline),a=!0),e.setBindGroup(0,c.bindGroup),e.draw(6)}}}drawVisibleVectors(e,r){if(!this.isNativeScene)return 0;let a=this.vectorScratch,s=0,n=0,i=0,o=0,c=!1,l=()=>{if(!s)return;let u=this.vectorBuffers[o];u||(u=this.device.createBuffer({size:Os*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),this.vectorBuffers.push(u)),this.device.queue.writeBuffer(u,0,a,0,s),c||(e.setPipeline(this.vectorPipeline),e.setBindGroup(0,this.edgeBindGroup),c=!0);let p=Math.floor(s/6);e.setVertexBuffer(0,u),e.draw(p),i+=p,o+=1,s=0},f=u=>u>lu||u>a.length?(n+=1,!1):((s+u>lu||s+u>a.length)&&l(),!0);for(let u of r){if(this.domDetailPageIds.has(u.id)||!this.pageHasNativeDetail(u))continue;let p=this.vectorChunks.get(u.id);if(!p?.segments?.length&&!p?.fills?.length||!this.pageNativeDetailReady(u))continue;p.lastUsedFrame=this.frameSerial;let b=this.sourceViewportBounds(u),h=bu(p.spatial,b);for(let d of h.fills){if(!vt(d.bounds,b)||!f(18))continue;let x=this.featuresById.get(d.featureId),g=this.activeNetUid&&x?.netUid===this.activeNetUid,m=this.selectedFeatureId===d.featureId?[.24,.58,1,1]:g?[.06,1,.24,1]:this.activeNetUid&&da(x)?yu(x,d.kind,d.color):$i(x,d.kind,d.color),w=d.worldPoints||d.points.map(E=>this.sourceToWorld(u,E));s=vx(a,s,w[0],w[1],w[2],m)}for(let d of h.segments){if(!vt(d.bounds,b))continue;let x=this.featuresById.get(d.featureId),g=this.activeNetUid&&x?.netUid===this.activeNetUid,y=this.selectedFeatureId===d.featureId,m=y?[.24,.58,1,1]:g?[.06,1,.24,1]:this.activeNetUid&&da(x)?yu(x,d.kind,d.color):$i(x,d.kind,d.color),w=this.segmentWorldWidth(u,d,x,g||y);for(let E of this.visibleSegmentParts(u,d,x)){if(!f(36))continue;let S=E.worldA||this.sourceToWorld(u,E.a),A=E.worldB||this.sourceToWorld(u,E.b);s=xx(a,s,S,A,w,m)}}}return l(),this.truncatedVectorCount=n,this.vectorTruncated=n>0,this.lastVectorVertices=i,this.lastVectorChunks=o,i}pageHasNativeDetail(e){return this.isNativeScene?e?.nativeDetail?.enabled!==!1:!1}scheduleVisibleVectorLoads(e){if(!this.isNativeScene)return;let r=[...this.vectorChunks.values()].filter(n=>n?.promise&&!n.loaded).length,a=Math.max(0,tx-r);if(!a)return;let s=e.filter(n=>!this.domDetailPageIds.has(n.id)).filter(n=>this.pageHasNativeDetail(n)&&this.pageSourcePixelsPerMm(n)>=this.pageNativeDetailThresholds(n).prefetch).filter(n=>!this.vectorChunks.get(n.id)?.loaded&&!this.vectorChunks.get(n.id)?.promise).sort((n,i)=>{let o=Math.hypot(n.worldX+n.widthMm/2-this.center[0],n.worldY+n.heightMm/2-this.center[1]),c=Math.hypot(i.worldX+i.widthMm/2-this.center[0],i.worldY+i.heightMm/2-this.center[1]);return o-c});for(let n of s)if(this.loadPageVectors(n).catch(()=>{}),a-=1,!a)break}featurePrimitiveBounds(e,r){let a=this.vectorChunks.get(e.id);if(!a?.segments?.length&&!a?.fills?.length)return null;let s=[],n=[];for(let i of a.segments||[])i.featureId===r&&(s.push(i.a[0],i.b[0]),n.push(i.a[1],i.b[1]));for(let i of a.fills||[])if(i.featureId===r)for(let o of i.points||[])s.push(o[0]),n.push(o[1]);return s.length?[Math.min(...s),Math.min(...n),Math.max(...s),Math.max(...n)]:null}symbolClipBounds(e){if(this._symbolClipBounds||(this._symbolClipBounds=new Map),this._symbolClipBounds.has(e.id))return this._symbolClipBounds.get(e.id);let r=(this.featuresByPage[e.id]||[]).filter(a=>a?.kind==="symbol_body"&&a.boundsMm&&!String(a.sourceId||"").includes(":overplot")).map(a=>{let s=this.featurePrimitiveBounds(e,a.id)||a.boundsMm;return[s[0]-.02,s[1]-.02,s[2]+.02,s[3]+.02]}).filter(a=>{let s=a[2]-a[0],n=a[3]-a[1];return Math.max(s,n)<=12&&s*n<=80});return this._symbolClipBounds.set(e.id,r),r}visibleSegmentParts(e,r,a){if(r._visibleParts)return r._visibleParts;let s=String(a?.kind||""),n=String(a?.semanticRole||"");if(s!=="wire"&&n!=="wire")return r._visibleParts=[r],r._visibleParts;let i=[r];for(let o of this.symbolClipBounds(e)){let c=[];for(let l of i)c.push(...kx(l,o));if(i=c,!i.length)break}for(let o of i)o.worldA=Tr(e,o.a),o.worldB=Tr(e,o.b);return r._visibleParts=i,r._visibleParts}netTrackingSegments(){if(!this.activeNetUid)return{netUid:"",anchorsByPage:new Map,segments:[],intrasheetSegments:[]};let e=Number(this.selectedFeatureId||0),r=String(this.selectedFeatureKey||""),a=String(this.selectedSourceId||"");if(this.netTrackingCache?.netUid===this.activeNetUid&&this.netTrackingCache?.selectedFeatureId===e&&this.netTrackingCache?.selectedFeatureKey===r&&this.netTrackingCache?.selectedSourceId===a)return this.netTrackingCache;this.selectedIntrasheetLinkIndex=-1;let s=new Map(this.pages.map(h=>[h.id,h])),n=this.manifest.netToPages?.[this.activeNetUid]||[],i=n.length?n.map(h=>s.get(h)).filter(Boolean):this.pages.filter(h=>h.netUids?.includes(this.activeNetUid)),o=new Map;for(let h of i.slice(0,Zy)){let d=this.netTrackingAnchorsForPage(h);d.length&&o.set(h.id,d)}let c=[],l=[];for(let[h,d]of o){let x=gu(px(d),"intrasheet",h);c.push(...x),l.push(...x)}let f=[...o.entries()].map(([h,d])=>gx(s.get(h),d,{featureId:e,stableKey:r,sourceId:a})).filter(Boolean);c.push(...gu(f,"intersheet",""));let u=l.map((h,d)=>({...h,intrasheetIndex:d})),p=0,b=c.map((h,d)=>{if(h.type!=="intrasheet")return{...h,id:d};let x=p;return p+=1,{...h,id:d,intrasheetIndex:x}});return this.netTrackingCache={netUid:this.activeNetUid,selectedFeatureId:e,selectedFeatureKey:r,selectedSourceId:a,anchorsByPage:o,segments:b,intrasheetSegments:u},this.selectedIntrasheetLinkIndex>=this.netTrackingCache.intrasheetSegments.length&&(this.selectedIntrasheetLinkIndex=-1),this.netTrackingCache}netTrackingAnchorsForPage(e){let r=this.featuresByPage[e.id]||[],a=[];for(let s of r){if(s.netUid!==this.activeNetUid||!s.boundsMm||!hx(s))continue;let n=s.boundsMm,i=[(n[0]+n[2])/2,(n[1]+n[3])/2],o=this.sourceToWorld(e,i);a.push({pageId:e.id,featureId:Number(s.id||0),stableKey:String(s.stableKey||""),sourceId:String(s.sourceId||s.sourceUid||s.objectId||""),kind:s.kind||s.semanticRole||"",source:i,world:o,bounds:n,priority:bx(s)})}return a.sort((s,n)=>n.priority-s.priority||s.source[1]-n.source[1]||s.source[0]-n.source[0]),a}writeNetTrackingOverlay(){let e=this.netTrackingSegments();if(this.lastNetFlowSegments=e.segments.length,this.lastNetFlowIntrasheetSegments=e.intrasheetSegments.length,!e.segments.length)return this.lastNetFlowVertices=0,0;let r=this.worldViewportBounds(this.scale*96),a=this.netFlowScratch,s=0,n=0;for(let i of e.segments){if(!vt(mu(i),r))continue;let o=i.type==="intrasheet"&&i.intrasheetIndex===this.selectedIntrasheetLinkIndex,c=o?9.5:i.type==="intersheet"?8:4.8,l=o?2:i.type==="intersheet"?1:0,f=wx(a,s,i.a,i.b,c*this.scale,l,n,this.scale);if(f!==s&&(s=f,n+=Math.hypot(i.b[0]-i.a[0],i.b[1]-i.a[1])/Math.max(this.scale,1e-6),s+24>a.length))break}return s?(this.device.queue.writeBuffer(this.netFlowBuffer,0,a,0,s),this.lastNetFlowVertices=s/4,s/4):(this.lastNetFlowVertices=0,0)}cycleNetIntrasheetLink(e=1){let r=this.netTrackingSegments();if(!r.intrasheetSegments.length)return null;let a=r.intrasheetSegments.length;this.selectedIntrasheetLinkIndex=(this.selectedIntrasheetLinkIndex+e+a)%a;let s=r.intrasheetSegments[this.selectedIntrasheetLinkIndex];if(!s)return null;let n=mu(s,14*this.scale);return this.center=[(n[0]+n[2])/2,(n[1]+n[3])/2],this.scale=Math.max((n[2]-n[0])/Math.max(1,this.canvas.width*.36),(n[3]-n[1])/Math.max(1,this.canvas.height*.3),this.scale*.35,.025),{pageId:s.pageId,segment:s}}writeNetHighlights(e){if(!this.activeNetUid)return 0;let r=this.highlightScratch,a=0,s=0;for(let n of e){let i=this.sourceViewportBounds(n,5);for(let o of this.featuresByPage[n.id]||[]){if(o.netUid!==this.activeNetUid||!o.boundsMm||!vt(o.boundsMm,i))continue;let c=this.featureWorldBounds(n,o.boundsMm);if(a+16>r.length){s+=1;continue}r[a++]=c[0],r[a++]=c[1],r[a++]=c[2],r[a++]=c[1],r[a++]=c[2],r[a++]=c[1],r[a++]=c[2],r[a++]=c[3],r[a++]=c[2],r[a++]=c[3],r[a++]=c[0],r[a++]=c[3],r[a++]=c[0],r[a++]=c[3],r[a++]=c[0],r[a++]=c[1]}}return this.truncatedHighlightCount=s,a?(this.device.queue.writeBuffer(this.highlightBuffer,0,r,0,a),a/2):0}featureWorldBounds(e,r){return[e.worldX+r[0]/e.sourceWidthMm*e.widthMm,e.worldY+r[1]/e.sourceHeightMm*e.heightMm,e.worldX+r[2]/e.sourceWidthMm*e.widthMm,e.worldY+r[3]/e.sourceHeightMm*e.heightMm]}sourceToWorld(e,r){return[e.worldX+r[0]/e.sourceWidthMm*e.widthMm,e.worldY+r[1]/e.sourceHeightMm*e.heightMm]}sourceSizeToWorld(e,r,a){return[r/e.sourceWidthMm*e.widthMm,a/e.sourceHeightMm*e.heightMm]}async loadPageVectors(e){if(!this.pageHasNativeDetail(e)||!e.chunks?.lod2)return null;let r=this.vectorChunks.get(e.id);if(r?.loaded)return r;if(r?.promise)return r.promise;let a=(async()=>{try{let s=await fetch(new URL(e.chunks.lod2,this.manifestUrl));if(!s.ok)throw new Error(`Failed to load schematic vector chunk ${e.id}: ${s.status}`);let n=await s.json(),i=sx(n.primitives||[]);nx(e,i);let c=JSON.stringify(n).length,l={loaded:!0,segments:i.segments,fills:i.fills,images:i.images,spatial:fx(i),unsupported:n.unsupported||[],bytes:c,lastUsedFrame:this.frameSerial};return this.vectorChunks.set(e.id,l),this.failedVectorChunks.delete(e.id),this.residentVectorBytes+=c,l}catch(s){let n=this.failedVectorChunks.get(e.id)||{count:0,message:""};throw this.failedVectorChunks.set(e.id,{count:n.count+1,message:s?.message||String(s)}),this.vectorChunks.delete(e.id),s}})();return this.vectorChunks.set(e.id,{loaded:!1,promise:a,segments:[]}),a}evictVectorChunks(e){if(this.residentVectorBytes<=fu)return;let r=new Set(e.map(s=>s.id)),a=[...this.vectorChunks.entries()].filter(([,s])=>s?.loaded).filter(([s])=>!r.has(s)&&s!==this.selectedPageId).sort((s,n)=>(s[1].lastUsedFrame||0)-(n[1].lastUsedFrame||0));for(let[s,n]of a)if(this.vectorChunks.delete(s),this.residentVectorBytes=Math.max(0,this.residentVectorBytes-(n.bytes||0)),this.residentVectorBytes<=fu*.82)break}stats(){let e=this.visiblePages(),r=e.map(s=>this.pageSourcePixelsPerMm(s)),a=e.map(s=>this.pageNativeDetailThresholds(s).enter);return{residentVectorBytes:this.residentVectorBytes,vectorChunks:[...this.vectorChunks.values()].filter(s=>s?.loaded).length,vectorLoads:[...this.vectorChunks.values()].filter(s=>s?.promise&&!s.loaded).length,failedVectorChunks:this.failedVectorChunks.size,vectorVertices:this.lastVectorVertices||0,vectorDrawChunks:this.lastVectorChunks||0,truncatedVectors:this.truncatedVectorCount||0,nativeDetailPages:[...this.nativeDetailState.values()].filter(Boolean).length,nativePxPerMm:Number((Math.max(0,...r)||0).toFixed(2)),nativeThresholdPxPerMm:Number((a.length?Math.min(...a):0).toFixed(2)),domDetailPages:this.domDetailPageIds.size,netFlowSegments:this.lastNetFlowSegments||0,netFlowIntrasheetSegments:this.lastNetFlowIntrasheetSegments||0,netFlowVertices:this.lastNetFlowVertices||0}}setDomDetailPageIds(e){this.domDetailPageIds=new Set(e||[])}async loadPageTexture(e,r){let a=`${e.id}:${r}`;if(this.loading.has(a))return this.loading.get(a);let s=this.pageResources.get(e.id);if(!s||s.textureWidth>=r)return;let n=(async()=>{if(!s.svgBlob){let c=await fetch(new URL(rx(e),this.manifestUrl));if(!c.ok)throw new Error(`Failed to load schematic page ${e.name}: ${c.status}`);s.svgBlob=await c.blob(),this.downloadedBytes+=s.svgBlob.size}let i=s.svgBlob,o=URL.createObjectURL(i);try{let c=new Image;if(c.decoding="async",c.src=o,await c.decode(),s.textureWidth>=r)return;let l=Math.max(64,Math.round(r*e.heightMm/e.widthMm)),f=new OffscreenCanvas(r,l),u=f.getContext("2d",{alpha:!1});u.fillStyle="#ffffff",u.fillRect(0,0,r,l),u.drawImage(c,0,0,r,l);let p=await createImageBitmap(f),b=this.device.createTexture({size:[r,l],format:"rgba8unorm-srgb",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});this.device.queue.copyExternalImageToTexture({source:p},{texture:b},[r,l]),p.close(),s.texture!==this.placeholder&&s.texture.destroy(),s.texture=b,s.textureWidth=r,this.updateBindGroup(s)}finally{URL.revokeObjectURL(o),this.loading.delete(a)}})();return this.loading.set(a,n),n}preloadOverview(){let e=[...this.pages],r=async()=>{for(;e.length;){let a=e.shift();await this.loadPageTexture(a,512).catch(()=>{})}};return Promise.all(Array.from({length:Math.min(4,e.length)},r))}screenToWorld(e,r){let a=this.canvas.getBoundingClientRect(),s=(e-a.left)*this.canvas.width/a.width,n=(r-a.top)*this.canvas.height/a.height;return[this.center[0]+(s-this.canvas.width/2)*this.scale,this.center[1]+(n-this.canvas.height/2)*this.scale]}worldToScreen(e,r){let a=this.canvas.clientWidth/this.canvas.width,s=this.canvas.clientHeight/this.canvas.height;return[((e-this.center[0])/this.scale+this.canvas.width/2)*a,((r-this.center[1])/this.scale+this.canvas.height/2)*s]}hitPage(e,r){let[a,s]=this.screenToWorld(e,r);return[...this.pages].reverse().find(n=>a>=n.worldX&&a<=n.worldX+n.widthMm&&s>=n.worldY&&s<=n.worldY+n.heightMm)||null}async pickFeature(e,r){if(!this.isNativeScene)return this.hitFeature(e,r);let a=this.hitPage(e,r);if(!a)return null;if(!this.pageHasNativeDetail(a))return this.hitFeature(e,r);await this.loadPageVectors(a);let s=await this.gpuPickFeature(a,e,r);return s&&!la(s)?{page:a,feature:s,source:this.clientToSource(a,e,r),native:!0,gpu:!0}:this.hitFeature(e,r)}hitFeature(e,r){let a=this.hitPage(e,r);if(!a)return null;let[s,n]=this.clientToSource(a,e,r),i=Math.max(.45,5*this.scale*this.canvas.width/Math.max(1,this.canvas.clientWidth)*a.sourceWidthMm/a.widthMm),o=this.hitResidentVectorFeature(a,s,n,i);if(o)return{page:a,feature:o,source:[s,n],native:!0};let c=this.hitSymbolInterior(a,s,n);if(c)return{page:a,feature:c,source:[s,n],native:!0,interior:!0};let l=(this.featuresByPage[a.id]||[]).filter(f=>{if(la(f))return!1;let u=f.boundsMm;return u&&s>=u[0]-i&&s<=u[2]+i&&n>=u[1]-i&&n<=u[3]+i}).map(f=>({feature:f,priority:ca(f),area:Math.max(1e-4,(f.boundsMm[2]-f.boundsMm[0])*(f.boundsMm[3]-f.boundsMm[1]))})).sort((f,u)=>u.priority-f.priority||f.area-u.area);return{page:a,feature:l[0]?.feature||null,source:[s,n]}}hitSymbolInterior(e,r,a){let s=null;for(let n of this.featuresByPage[e.id]||[]){let i=String(n?.kind||"");if(i!=="symbol_body"&&i!=="symbol_instance"||String(n?.sourceId||"").includes(":overplot"))continue;let o=n.boundsMm;if(!o||r<o[0]||r>o[2]||a<o[1]||a>o[3])continue;let c=Math.max(1e-4,(o[2]-o[0])*(o[3]-o[1])),l=(i==="symbol_body"?0:1e6)+c;(!s||l<s.score)&&(s={feature:n,score:l})}return s?.feature||null}clientToSource(e,r,a){let[s,n]=this.screenToWorld(r,a);return[(s-e.worldX)/e.widthMm*e.sourceWidthMm,(n-e.worldY)/e.heightMm*e.sourceHeightMm]}ensurePickTexture(){this.pickTexture&&this.pickTextureSize[0]===this.canvas.width&&this.pickTextureSize[1]===this.canvas.height||(this.pickTexture&&this.pickTexture.destroy(),this.pickTexture=this.device.createTexture({size:[this.canvas.width,this.canvas.height],format:"r32uint",usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC}),this.pickTextureSize=[this.canvas.width,this.canvas.height])}writePickVectors(e){let r=new ArrayBuffer(Fs*12),a=new DataView(r),s=0,n=[];for(let i of e){let o=this.vectorChunks.get(i.id);if(!o?.segments?.length&&!o?.fills?.length&&!o?.images?.length)continue;let c=this._pickSourcePointByPage?.get(i.id),l=c?[c[0]-2.5,c[1]-2.5,c[0]+2.5,c[1]+2.5]:[0,0,i.sourceWidthMm,i.sourceHeightMm],f=bu(o.spatial,l);for(let u of f.images){if(!vt(u.bounds,l))continue;let p=this.featuresById.get(u.featureId);!p||la(p)||n.push({page:i,image:u,feature:p,priority:ca(p)-5})}for(let u of f.fills){if(!vt(u.bounds,l))continue;let p=this.featuresById.get(u.featureId);!p||la(p)||n.push({page:i,fill:u,feature:p,priority:ca(p)-2})}for(let u of f.segments){if(!vt(u.bounds,l))continue;let p=this.featuresById.get(u.featureId);!p||la(p)||n.push({page:i,segment:u,feature:p,priority:ca(p)})}}n.sort((i,o)=>i.priority-o.priority);for(let{page:i,segment:o,fill:c,image:l,feature:f}of n){if(s+6>Fs)break;if(l){let u=this.sourceToWorld(i,[l.xMm,l.yMm]),p=this.sourceToWorld(i,[l.xMm+l.widthMm,l.yMm]),b=this.sourceToWorld(i,[l.xMm,l.yMm+l.heightMm]),h=this.sourceToWorld(i,[l.xMm+l.widthMm,l.yMm+l.heightMm]);s=Xi(a,s,u,p,b,l.featureId),s=Xi(a,s,b,p,h,l.featureId)}else if(c){let u=c.worldPoints||c.points.map(p=>this.sourceToWorld(i,p));s=Xi(a,s,u[0],u[1],u[2],c.featureId)}else{let u=Math.max(this.segmentWorldWidth(i,o,f,!1),this.scale*7);for(let p of this.visibleSegmentParts(i,o,f)){if(s+6>Fs)break;let b=p.worldA||this.sourceToWorld(i,p.a),h=p.worldB||this.sourceToWorld(i,p.b);s=Ex(a,s,b,h,u,o.featureId)}}}return s?(this.device.queue.writeBuffer(this.pickVertexBuffer,0,r,0,s*12),s):0}async gpuPickFeature(e,r,a){if(this.pickPending)return null;let s=this.clientToSource(e,r,a);this._pickSourcePointByPage=new Map([[e.id,s]]);let n=this.writePickVectors([e]);if(this._pickSourcePointByPage=null,!n)return null;this.resize(),this.writeGlobals(),this.ensurePickTexture();let i=this.canvas.getBoundingClientRect(),o=Math.max(0,Math.min(this.canvas.width-1,Math.floor((r-i.left)*this.canvas.width/i.width))),c=Math.max(0,Math.min(this.canvas.height-1,Math.floor((a-i.top)*this.canvas.height/i.height))),l=this.device.createCommandEncoder(),f=l.beginRenderPass({colorAttachments:[{view:this.pickTexture.createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}]});f.setPipeline(this.pickPipeline),f.setBindGroup(0,this.edgeBindGroup),f.setVertexBuffer(0,this.pickVertexBuffer),f.draw(n),f.end(),l.copyTextureToBuffer({texture:this.pickTexture,origin:{x:o,y:c}},{buffer:this.pickReadBuffer,bytesPerRow:256,rowsPerImage:1},{width:1,height:1,depthOrArrayLayers:1}),this.pickPending=!0,this.device.queue.submit([l.finish()]);try{await this.pickReadBuffer.mapAsync(GPUMapMode.READ);let u=new DataView(this.pickReadBuffer.getMappedRange()).getUint32(0,!0);return this.pickReadBuffer.unmap(),u&&this.featuresById.get(u)||null}finally{this.pickReadBuffer.mapState==="mapped"&&this.pickReadBuffer.unmap(),this.pickPending=!1}}hitResidentVectorFeature(e,r,a,s){if(!this.isNativeScene)return null;let n=this.vectorChunks.get(e.id);if(!n?.loaded)return null;let i=null;for(let o of n.segments){let c=this.featuresById.get(o.featureId),l=Math.max(s,(o.widthMm||0)*.5+s*.45);if(c)for(let f of this.visibleSegmentParts(e,o,c)){let u=Mx([r,a],f.a,f.b);if(u>l)continue;let p=u-ca(c)*.025+(da(c)?0:8);(!i||p<i.score)&&(i={feature:c,score:p})}}return i?.feature||null}segmentWorldWidth(e,r,a,s){let n=(r.widthMm||.15)/Math.max(1,e.sourceWidthMm)*e.widthMm;return Math.max(n,this.scale*yx(a,r.kind,s))}pan(e,r){let a=this.canvas.width/Math.max(1,this.canvas.clientWidth);this.center[0]-=e*this.scale*a,this.center[1]-=r*this.scale*a}zoom(e,r,a){let s=this.screenToWorld(r,a);this.scale=ce(this.scale*Math.exp(e*.0015),.015,16);let n=this.screenToWorld(r,a);this.center[0]+=s[0]-n[0],this.center[1]+=s[1]-n[1]}framePage(e){e&&(this.resize(),this.center=[e.worldX+e.widthMm/2,e.worldY+e.heightMm/2],this.scale=Math.max(e.widthMm/Math.max(1,this.canvas.width*.88),e.heightMm/Math.max(1,this.canvas.height*.84)))}frameWorld(){this.resize(),this.center=[(this.world.minX+this.world.maxX)/2,(this.world.minY+this.world.maxY)/2],this.scale=Math.max((this.world.maxX-this.world.minX)/Math.max(1,this.canvas.width*.9),(this.world.maxY-this.world.minY)/Math.max(1,this.canvas.height*.88),.05)}};function rx(t){return t.thumbnail?.path||t.svg}function ax(t){if(t.schema==="prism.schematic_vector_a0.features"){let e=new Map((t.features||[]).map(a=>[Number(a.id),a])),r={};for(let[a,s]of Object.entries(t.pages||{}))r[a]=s.map(n=>e.get(Number(n))).filter(Boolean);return r}return t.pages||{}}function sx(t){let e=[],r=[],a=[];for(let s of t){let n=Number(s.featureId||0);if(!n)continue;if(s.kind==="plotimage"&&s.image?.path){let y=s.xMm||0,m=s.yMm||0,w=s.widthMm||0,E=s.heightMm||0;a.push({featureId:n,kind:s.kind,xMm:y,yMm:m,widthMm:w,heightMm:E,bounds:[y,m,y+w,m+E],path:s.image.path});continue}let i=String(s.semanticRole||""),o=s.radiusMm||s.diameterMm/2||0,c=String(s.fill||"").toUpperCase()==="FILLED_SHAPE",l=s.widthMm||s.pen_widthMm||(i==="junction"?.08:.15),f=String(s.lineStyle||s.line_style||"DEFAULT").toUpperCase(),u=s.color||s.strokeColor||s.style?.color||"",p=s.fillColor||s.color||s.style?.color||"",b=(y,m)=>dx(e,{featureId:n,kind:s.kind,widthMm:l,lineStyle:f,color:u},y,m),h=s.x1Mm,d=s.y1Mm,x=s.x2Mm,g=s.y2Mm;if(s.trianglesMm?.length){for(let y of s.trianglesMm)Array.isArray(y)&&y.length===3&&r.push({featureId:n,kind:s.kind,color:p,points:y,bounds:xu(y)});if(s.pointsMm?.length>=2){for(let y=1;y<s.pointsMm.length;y+=1)b(s.pointsMm[y-1],s.pointsMm[y]);pu(s)&&b(s.pointsMm[s.pointsMm.length-1],s.pointsMm[0])}}else if(s.pointsMm?.length>=2){c&&s.pointsMm.length>=3&&lx(r,n,s.kind,s.pointsMm,p);for(let y=1;y<s.pointsMm.length;y+=1)b(s.pointsMm[y-1],s.pointsMm[y]);pu(s)&&b(s.pointsMm[s.pointsMm.length-1],s.pointsMm[0])}else if(s.polylinesMm?.length){for(let y of s.polylinesMm)if(!(!Array.isArray(y)||y.length<2))for(let m=1;m<y.length;m+=1)b(y[m-1],y[m])}else if(Number.isFinite(h)&&Number.isFinite(d)&&Number.isFinite(x)&&Number.isFinite(g))s.kind==="rect"?(c&&ox(r,n,s.kind,[h,d,x,g],p),b([h,d],[x,d]),b([x,d],[x,g]),b([x,g],[h,g]),b([h,g],[h,d])):b([h,d],[x,g]);else if(Number.isFinite(s.cxMm)&&Number.isFinite(s.cyMm)){let y=s.radiusMm||s.diameterMm/2||.4;c&&cx(r,n,s.kind,[s.cxMm,s.cyMm],y,p),ux(e,{featureId:n,kind:s.kind,widthMm:l,lineStyle:f,color:u},[s.cxMm,s.cyMm],y)}else if(s.contoursMm?.length){for(let y of s.contoursMm)if(!(!Array.isArray(y)||y.length<2)){for(let m=1;m<y.length;m+=1)b(y[m-1],y[m]);b(y[y.length-1],y[0])}}else if(Number.isFinite(s.start_xMm)&&Number.isFinite(s.start_yMm)&&Number.isFinite(s.end_xMm)&&Number.isFinite(s.end_yMm))Number.isFinite(s.mid_xMm)&&Number.isFinite(s.mid_yMm)?(b([s.start_xMm,s.start_yMm],[s.mid_xMm,s.mid_yMm]),b([s.mid_xMm,s.mid_yMm],[s.end_xMm,s.end_yMm])):b([s.start_xMm,s.start_yMm],[s.end_xMm,s.end_yMm]);else if(Number.isFinite(s.start_xMm)&&Number.isFinite(s.start_yMm)&&Number.isFinite(s.mid_xMm)&&Number.isFinite(s.mid_yMm)&&Number.isFinite(s.end_xMm)&&Number.isFinite(s.end_yMm))b([s.start_xMm,s.start_yMm],[s.mid_xMm,s.mid_yMm]),b([s.mid_xMm,s.mid_yMm],[s.end_xMm,s.end_yMm]);else if(s.boundsMm&&s.kind!=="text"){let[y,m,w,E]=s.boundsMm;b([y,m],[w,m]),b([w,m],[w,E]),b([w,E],[y,E]),b([y,E],[y,m])}}return{segments:e,fills:r,images:a}}function nx(t,e){for(let r of e.segments||[])r.worldA=Tr(t,r.a),r.worldB=Tr(t,r.b);for(let r of e.fills||[])r.worldPoints=r.points.map(a=>Tr(t,a));for(let r of e.images||[])r.worldOrigin=Tr(t,[r.xMm,r.yMm]),r.worldSize=ix(t,r.widthMm,r.heightMm)}function Tr(t,e){return[t.worldX+e[0]/t.sourceWidthMm*t.widthMm,t.worldY+e[1]/t.sourceHeightMm*t.heightMm]}function ix(t,e,r){return[e/t.sourceWidthMm*t.widthMm,r/t.sourceHeightMm*t.heightMm]}function ox(t,e,r,a,s){let[n,i,o,c]=a;t.push({featureId:e,kind:r,color:s,points:[[n,i],[o,i],[n,c]],bounds:[n,i,o,c]},{featureId:e,kind:r,color:s,points:[[n,c],[o,i],[o,c]],bounds:[n,i,o,c]})}function cx(t,e,r,a,s,n){for(let o=0;o<36;o+=1){let c=o/36*Math.PI*2,l=(o+1)/36*Math.PI*2;t.push({featureId:e,kind:r,color:n,points:[a,[a[0]+Math.cos(c)*s,a[1]+Math.sin(c)*s],[a[0]+Math.cos(l)*s,a[1]+Math.sin(l)*s]],bounds:[a[0]-s,a[1]-s,a[0]+s,a[1]+s]})}}function lx(t,e,r,a,s){let n=a[0],i=xu(a);for(let o=2;o<a.length;o+=1)t.push({featureId:e,kind:r,color:s,points:[n,a[o-1],a[o]],bounds:i})}function dx(t,e,r,a){let s=hu(r,a,e.widthMm||.15),n=e.lineStyle||"DEFAULT";if(!["DASH","DASHED","DOT","DOTTED","DASHDOT","DASH_DOT"].includes(n)){t.push({...e,a:r,b:a,bounds:s});return}let i=a[0]-r[0],o=a[1]-r[1],c=Math.hypot(i,o);if(c<1e-6)return;let l=i/c,f=o/c,u=Math.max(e.widthMm*4,.45),p=n.includes("DOT")?[u*.8,u*.75,u*3,u*.75]:[u*3,u*1.5],b=0,h=0;for(;b<c;){let d=Math.min(p[h%p.length],c-b);if(h%2===0){let x=[r[0]+l*b,r[1]+f*b],g=[r[0]+l*(b+d),r[1]+f*(b+d)];t.push({...e,a:x,b:g,bounds:hu(x,g,e.widthMm||.15)})}b+=d,h+=1}}function ux(t,e,r,a){for(let n=0;n<32;n+=1){let i=n/32*Math.PI*2,o=(n+1)/32*Math.PI*2;t.push({...e,a:[r[0]+Math.cos(i)*a,r[1]+Math.sin(i)*a],b:[r[0]+Math.cos(o)*a,r[1]+Math.sin(o)*a],bounds:[r[0]-a,r[1]-a,r[0]+a,r[1]+a]})}}function xu(t,e=0){let r=1/0,a=1/0,s=-1/0,n=-1/0;for(let i of t||[])r=Math.min(r,i[0]),a=Math.min(a,i[1]),s=Math.max(s,i[0]),n=Math.max(n,i[1]);return Number.isFinite(r)?[r-e,a-e,s+e,n+e]:[0,0,0,0]}function hu(t,e,r=0){let a=Math.max(.05,r*.5);return[Math.min(t[0],e[0])-a,Math.min(t[1],e[1])-a,Math.max(t[0],e[0])+a,Math.max(t[1],e[1])+a]}function vt(t,e){return!t||!e?!0:t[0]<=e[2]&&t[2]>=e[0]&&t[1]<=e[3]&&t[3]>=e[1]}function fx(t){let e={cellSize:ex,cells:new Map,segments:t.segments||[],fills:t.fills||[],images:t.images||[],queryId:0};for(let r of e.segments)qi(e,"segments",r);for(let r of e.fills)qi(e,"fills",r);for(let r of e.images)qi(e,"images",r);return e}function qi(t,e,r){let a=r.bounds;if(!a)return;let s=Math.floor(a[0]/t.cellSize),n=Math.floor(a[2]/t.cellSize),i=Math.floor(a[1]/t.cellSize),o=Math.floor(a[3]/t.cellSize);for(let c=i;c<=o;c+=1)for(let l=s;l<=n;l+=1){let f=`${l}:${c}`,u=t.cells.get(f);u||(u={segments:[],fills:[],images:[]},t.cells.set(f,u)),u[e].push(r)}}function bu(t,e){if(!t)return{segments:[],fills:[],images:[]};t.queryId=(t.queryId||0)+1;let r=t.queryId,a={segments:[],fills:[],images:[]},s=Math.floor(e[0]/t.cellSize),n=Math.floor(e[2]/t.cellSize),i=Math.floor(e[1]/t.cellSize),o=Math.floor(e[3]/t.cellSize);for(let c=i;c<=o;c+=1)for(let l=s;l<=n;l+=1){let f=t.cells.get(`${l}:${c}`);f&&(Wi(f.segments,a.segments,r,"segments"),Wi(f.fills,a.fills,r,"fills"),Wi(f.images,a.images,r,"images"))}return a}function Wi(t,e,r,a){let s=`_${a}QueryId`;for(let n of t)n[s]!==r&&(n[s]=r,e.push(n))}function pu(t){let e=String(t.kind||"");if(String(t.fill||"").toUpperCase()==="FILLED_SHAPE"||t.closed===!0||["polygon","fill"].includes(e))return!0;let a=t.pointsMm||[];if(a.length>=3){let s=a[0],n=a[a.length-1];return Math.hypot(s[0]-n[0],s[1]-n[1])<1e-6}return!1}function da(t){return!!t?.netUid}function hx(t){let e=String(t?.kind||""),r=String(t?.semanticRole||"");return e==="pin"||e==="pin_body"||e==="label"||e==="global_label"||e==="hierarchical_label"||e==="netclass_flag"||e==="power_symbol"||e==="power_port"||r==="label"||r==="global_label"||r==="hierarchical_label"}function bx(t){let e=String(t?.kind||""),r=String(t?.semanticRole||"");return e==="global_label"||r==="global_label"?130:e==="hierarchical_label"||r==="hierarchical_label"?125:e==="label"||r==="label"?118:e==="pin"||e==="pin_body"?106:e==="power_symbol"||e==="power_port"||e==="netclass_flag"?98:50}function px(t){if(t.length<=uu)return t;let e=t.slice(0,uu);return e.sort((r,a)=>r.source[1]-a.source[1]||r.source[0]-a.source[0]),e}function gx(t,e,r={}){if(!t||!e?.length)return null;let a=r.featureId||r.stableKey||r.sourceId?e.find(l=>r.featureId&&Number(l.featureId||0)===Number(r.featureId)||r.stableKey&&l.stableKey===r.stableKey||r.sourceId&&l.sourceId===r.sourceId):null;if(a)return{...a,kind:"selected-net-occurrence",priority:200};let s=e.filter(l=>l.priority>=118).slice(0,16),n=s.length?s:e.slice(0,16),i=0,o=0;for(let l of n)i+=l.world[0],o+=l.world[1];let c=[i/n.length,o/n.length];return{pageId:t.id,featureId:n[0]?.featureId||0,kind:"page-net-occurrence",source:[0,0],world:c,bounds:[c[0],c[1],c[0],c[1]],priority:1}}function gu(t,e,r){if(!t||t.length<2)return[];let a=t.map(i=>({...i})).sort((i,o)=>i.world[1]-o.world[1]||i.world[0]-o.world[0]),s=[],n=a.shift();for(;a.length;){let i=0,o=1/0;for(let l=0;l<a.length;l+=1){let f=a[l],u=Math.hypot(f.world[0]-n.world[0],f.world[1]-n.world[1]);u<o&&(o=u,i=l)}let c=a.splice(i,1)[0];s.push({type:e,pageId:r||n.pageId||c.pageId||"",a:n.world,b:c.world,sourceFeatureIds:[n.featureId,c.featureId].filter(Boolean)}),n=c}return s}function mu(t,e=0){return[Math.min(t.a[0],t.b[0])-e,Math.min(t.a[1],t.b[1])-e,Math.max(t.a[0],t.b[0])+e,Math.max(t.a[1],t.b[1])+e]}function ca(t){let e=String(t?.kind||""),a=String(t?.semanticRole||"")||e;return a==="pin_number"||a==="pin_name"?120:a==="pin_body"||e==="pin"?110:a==="symbol_reference"||a==="symbol_value"?92:e==="junction"||e==="no_connect"?88:e==="wire"||e==="bus"||e==="bus_entry"?78:a==="symbol_body"||e==="symbol_body"?45:e==="symbol_instance"||e==="symbol_overplot"?30:e==="text"||String(a).includes("text")?24:10}function la(t){let e=String(t?.kind||""),r=String(t?.semanticRole||"");if(e==="page"||e==="sheet_header")return!0;if(e==="graphic_rect"&&r==="graphic_rect"&&!t?.netUid&&!t?.componentUid){let a=t.boundsMm||[];return a[2]-a[0]>150&&a[3]-a[1]>120}return!1}function mx(t){if(!t||typeof t!="string")return null;let r=t.trim().match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);if(!r)return null;let a=r[1],s=r[2]??"ff";return[parseInt(a.slice(0,2),16)/255,parseInt(a.slice(2,4),16)/255,parseInt(a.slice(4,6),16)/255,parseInt(s,16)/255]}function $i(t,e,r=""){let a=mx(r||t?.color||"");return t?.kind==="dnp_marker"?a||[.86,.04,.05,.85]:t?.dnp&&["symbol_reference","symbol_value","symbol_text"].includes(String(t?.kind||""))?[.5,.52,.54,.56]:a||(t?.dnp?[.5,.52,.54,.56]:da(t)?[.12,.56,.2,.96]:t?.kind==="pin_name"?[0,.28,.31,.96]:t?.kind==="pin_number"?[.45,.17,.16,.96]:t?.kind==="pin_body"?[.28,.18,.18,.88]:t?.kind==="symbol_body"||t?.kind==="symbol_instance"?[.42,.18,.18,.72]:t?.kind==="symbol_reference"||t?.kind==="symbol_value"?[.05,.13,.16,.94]:t?.kind==="text"||String(e||"").startsWith("text")?[.05,.13,.16,.94]:[.16,.17,.19,.7])}function yu(t,e,r=""){let a=$i(t,e,r);return[a[0]*.72,a[1]*.72,a[2]*.72,Math.min(a[3],.38)]}function yx(t,e,r){return r?5.5:t?.kind==="dnp_marker"?3:["pin_name","pin_number"].includes(String(t?.kind||""))?1.5:t?.kind==="pin_body"?1.7:String(e||"").startsWith("text")?1.35:e==="bus"||t?.kind==="bus"?4.2:da(t)?2.6:t?.kind==="symbol_body"||t?.kind==="symbol_instance"||t?.kind==="sheet"?1.5:1.25}function Ps(t,e,r,a){return t[e++]=r[0],t[e++]=r[1],t[e++]=a[0],t[e++]=a[1],t[e++]=a[2],t[e++]=a[3],e}function xx(t,e,r,a,s,n){let i=vu(r,a,s);if(!i)return e;for(let o of i)e=Ps(t,e,o,n);return e}function vx(t,e,r,a,s,n){return e=Ps(t,e,r,n),e=Ps(t,e,a,n),e=Ps(t,e,s,n),e}function Sr(t,e,r,a,s){return t[e++]=r[0],t[e++]=r[1],t[e++]=a,t[e++]=s,e}function wx(t,e,r,a,s,n,i,o){let c=a[0]-r[0],l=a[1]-r[1],f=Math.hypot(c,l);if(f<1e-6||e+24>t.length)return e;let u=s*.5,p=c/f,h=-(l/f)*u,d=p*u,x=[r[0]+h,r[1]+d],g=[r[0]-h,r[1]-d],y=[a[0]+h,a[1]+d],m=[a[0]-h,a[1]-d],w=i+f/Math.max(o,1e-6);return e=Sr(t,e,x,i,n),e=Sr(t,e,g,i,n),e=Sr(t,e,y,w,n),e=Sr(t,e,y,w,n),e=Sr(t,e,g,i,n),e=Sr(t,e,m,w,n),e}function vu(t,e,r){let a=e[0]-t[0],s=e[1]-t[1],n=Math.hypot(a,s);if(n<1e-6)return null;let i=r*.5,o=a/n*i,c=s/n*i,l=-s/n*i,f=a/n*i,u=[t[0]-o,t[1]-c],p=[e[0]+o,e[1]+c],b=[u[0]+l,u[1]+f],h=[u[0]-l,u[1]-f],d=[p[0]+l,p[1]+f],x=[p[0]-l,p[1]-f];return[b,h,d,d,h,x]}function Mx(t,e,r){let a=r[0]-e[0],s=r[1]-e[1],n=a*a+s*s||1,i=ce(((t[0]-e[0])*a+(t[1]-e[1])*s)/n,0,1),o=e[0]+a*i,c=e[1]+s*i;return Math.hypot(t[0]-o,t[1]-c)}function kx(t,e){let[r,a,s,n]=e,[i,o]=t.a,[c,l]=t.b,f=1e-6,u=(p,b)=>({...t,a:p,b});if(Math.abs(o-l)<=f){let p=o;if(p<a-f||p>n+f)return[t];let b=Math.min(i,c),h=Math.max(i,c),d=Math.max(b,r),x=Math.min(h,s);if(x<=d+f)return[t];let g=[],y=i<=c;if(b<d-f){let m=y?[b,p]:[d,p],w=y?[d,p]:[b,p];g.push(u(m,w))}if(x<h-f){let m=y?[x,p]:[h,p],w=y?[h,p]:[x,p];g.push(u(m,w))}return g}if(Math.abs(i-c)<=f){let p=i;if(p<r-f||p>s+f)return[t];let b=Math.min(o,l),h=Math.max(o,l),d=Math.max(b,a),x=Math.min(h,n);if(x<=d+f)return[t];let g=[],y=o<=l;if(b<d-f){let m=y?[p,b]:[p,d],w=y?[p,d]:[p,b];g.push(u(m,w))}if(x<h-f){let m=y?[p,x]:[p,h],w=y?[p,h]:[p,x];g.push(u(m,w))}return g}return[t]}function js(t,e,r,a){let s=e*12;t.setFloat32(s,r[0],!0),t.setFloat32(s+4,r[1],!0),t.setUint32(s+8,a,!0)}function Ex(t,e,r,a,s,n){let i=vu(r,a,s);if(!i)return e;for(let o of i)js(t,e,o,n),e+=1;return e}function Xi(t,e,r,a,s,n){return js(t,e,r,n),js(t,e+1,a,n),js(t,e+2,s,n),e+3}function Sx(t,e){let r=Array.isArray(t?.layerIds)?t.layerIds:[];if(r.length<2&&t?.startLayerId!=null&&t?.endLayerId!=null&&(r=[t.startLayerId,t.endLayerId]),r.length<2&&t?.layerMask!=null)try{let a=BigInt(String(t.layerMask));r=e.filter((s,n)=>(a&1n<<BigInt(n))!==0n).map(s=>s.id)}catch{r=[]}return r}function Tx(t){let e=t?.objectFeatureId??t?.id;if(e!=null&&Number.isFinite(Number(e))&&Number(e)!==0)return`feature:${Number(e)}`;let r=String(t?.sourceUid||"");return r?`source:${r}`:""}function wu(t,e){let r=new Map(t.map((o,c)=>[Number(o.id),c])),a=new Map(t.map(o=>[Number(o.id),o])),s=new Map,n=new Set,i={thru:0,blind:0,buried:0};for(let o of e){let c=Tx(o);if(c){if(n.has(c))continue;n.add(c)}let l=[...new Set(Sx(o,t).map(Number))].filter(m=>r.has(m)).sort((m,w)=>r.get(m)-r.get(w));if(l.length<2)continue;let f=l[0],u=l[l.length-1],p=r.get(f),b=r.get(u),h=p===0,d=b===t.length-1,x=h&&d?"thru":h||d?"blind":"buried";i[x]+=1;let g=`${f}:${u}:${x}`,y=s.get(g);if(y){y.count+=1;continue}s.set(g,{startId:f,endId:u,startName:a.get(f)?.name||String(f),endName:a.get(u)?.name||String(u),startIndex:p,endIndex:b,type:x,count:1})}return{counts:i,spans:[...s.values()]}}var ua="http://www.w3.org/2000/svg";var Ax=new Set(["script","foreignobject","iframe","object","embed"]),Ix=new Set(["href","xlink:href"]),_x=1,Rx=18,Nx=8,zs=class t{static create(e,r,a,s,n={}){return new t(e,r,a,s,n)}constructor(e,r,a,s,n){this.host=e,this.manifestUrl=r,this.manifest=a,this.featuresByPage=s||{},this.callbacks=n,this.activePage=null,this.activeSvgUrl="",this.container=null,this.svg=null,this.overlay=null,this.mountedPages=new Map,this.loadingPages=new Map,this.svgCache=new Map,this.serial=0,this.maxMountedWorldPages=_x,this.maxCachedSvgPages=Rx,this.worldHandlersInstalled=!1,this.worldDrag=null,this.view={scale:1,tx:0,ty:0},this.drag=null,this.selected=null,this.highlightedNetUid="",this.index=Su(),this.lastStats={mountedPages:0,domNodes:0,indexedFeatures:0,indexedNets:0,mountMs:0,coldMounts:0,warmMounts:0,highlightMs:0,selectionMs:0,cachedSvgPages:0,cachedSvgBytes:0,heapMb:null,fallbackReason:""}}get active(){return!!(this.container&&this.activePage)}get worldActive(){return this.mountedPages.size>0}stats(){return{...this.lastStats,activePage:this.activePage?.name||[...this.mountedPages.values()][0]?.page?.name||"-",mountedPages:this.active?1:this.mountedPages.size}}dispose(){this.unmountPage(),this.unmountWorldPages()}unmountPage(){this.container?.remove(),this.container=null,this.svg=null,this.overlay=null,this.activePage=null,this.activeSvgUrl="",this.index=Su(),this.host.hidden=!0}unmountWorldPages(){for(let e of this.mountedPages.values())e.container.remove();this.mountedPages.clear(),this.loadingPages.clear(),this.active||(this.host.hidden=!0)}async preloadPages(e){let r=performance.now(),a=await Promise.allSettled((e||[]).slice(0,Nx).map(s=>this.loadSvgTemplate(s)));this.lastStats.preloadedPages=a.filter(s=>s.status==="fulfilled"&&s.value).length,this.lastStats.preloadMs=performance.now()-r,this.updateCacheStats()}syncWorldPages(e,r,a={}){if(!r)return;this.installWorldHandlers(r);let s=(e||[]).slice(0,a.maxMountedPages||this.maxMountedWorldPages),n=new Set(s.map(i=>i.id));for(let[i,o]of this.mountedPages)n.has(i)||(o.container.remove(),this.mountedPages.delete(i));for(let i of s){let o=this.mountedPages.get(i.id);if(o)o.lastUsed=++this.serial,this.positionWorldEntry(o,r);else if(!this.loadingPages.has(i.id)){let c=this.mountWorldPage(i).then(l=>{l&&n.has(i.id)?this.positionWorldEntry(l,r):l?.container.remove()}).finally(()=>this.loadingPages.delete(i.id));this.loadingPages.set(i.id,c)}}this.pruneMountedWorldPages(n),this.host.hidden=s.length===0&&!this.active,this.setSelection(this.selected),this.setHighlightedNet(a.activeNetUid??this.highlightedNetUid),this.lastStats.mountedPages=this.mountedPages.size,this.updateCacheStats()}async mountWorldPage(e){let r=performance.now(),a=this.hasCachedSvg(e),s=await this.loadImportedSvg(e);if(!s)return null;let n=document.createElement("div");n.className="svg-dom-page svg-dom-world-page",n.dataset.pageId=e.id,n.append(s),this.host.append(n);let i=ku(s),o=Eu(s),c=Mu(s,e,this.featuresByPage[e.id]||[]),l={page:e,container:n,svg:s,overlay:i,selectionOverlay:o,index:c,mountMs:performance.now()-r,lastUsed:++this.serial,warm:a};return this.mountedPages.set(e.id,l),this.lastStats={...this.lastStats,mountedPages:this.mountedPages.size,domNodes:[...this.mountedPages.values()].reduce((f,u)=>f+u.svg.querySelectorAll("*").length,0),indexedFeatures:[...this.mountedPages.values()].reduce((f,u)=>f+u.index.featureToElements.size,0),indexedNets:new Set([...this.mountedPages.values()].flatMap(f=>[...f.index.netToElements.keys()])).size,mountMs:l.mountMs,coldMounts:this.lastStats.coldMounts+(l.warm?0:1),warmMounts:this.lastStats.warmMounts+(l.warm?1:0),fallbackReason:""},this.updateCacheStats(),l}async loadImportedSvg(e){let r=await this.loadSvgTemplate(e);return r?r.cloneNode(!0):null}async loadSvgTemplate(e){let r=this.svgUrlForPage(e),a=this.svgCache.get(r);if(a?.template)return a.lastUsed=++this.serial,a.template;if(a?.promise)return a.promise;let s=performance.now(),n=(async()=>{let i=await fetch(r,{cache:"default"});if(!i.ok)return this.lastStats.fallbackReason=`Failed to load SVG page ${e.id}: ${i.status}`,this.callbacks.onFallback?.(this.lastStats.fallbackReason),null;let o=await i.text(),l=new DOMParser().parseFromString(o,"image/svg+xml"),f=l.documentElement;if(!f||f.localName.toLowerCase()!=="svg"||l.querySelector("parsererror"))return this.lastStats.fallbackReason=`Invalid SVG for page ${e.id}`,this.callbacks.onFallback?.(this.lastStats.fallbackReason),null;Cx(l,r,e.id);let u=document.importNode(f,!0);u.classList.add("svg-dom-page-svg"),Lx(u);let p=this.svgCache.get(r)||{};return Object.assign(p,{template:u,promise:null,pageId:e.id,byteLength:o.length*2,loadMs:performance.now()-s,lastUsed:++this.serial}),this.svgCache.set(r,p),this.pruneSvgCache(),this.updateCacheStats(),u})();return this.svgCache.set(r,{promise:n,pageId:e.id,byteLength:0,loadMs:0,lastUsed:++this.serial}),n}svgUrlForPage(e){return new URL(e.svg||e.thumbnail?.path,this.manifestUrl).toString()}positionWorldEntry(e,r){let{page:a,container:s}=e,[n,i]=r.worldToScreen(a.worldX,a.worldY),[o,c]=r.worldToScreen(a.worldX+a.widthMm,a.worldY+a.heightMm),l=Math.max(1,o-n),f=Math.max(1,c-i);s.style.transform=`translate3d(${n}px, ${i}px, 0)`,s.style.width=`${l}px`,s.style.height=`${f}px`}installWorldHandlers(e){if(this.worldHandlersInstalled)return;this.worldHandlersInstalled=!0;let r=this.host;r.oncontextmenu=a=>a.preventDefault(),r.onpointerdown=a=>{let s=a.button===0&&!a.shiftKey&&!!a.target.closest?.("text"),i=a.target.closest?.("[data-feature-key]")?null:this.featureAtEvent(a);this.worldDrag={pointerId:a.pointerId,startX:a.clientX,startY:a.clientY,lastX:a.clientX,lastY:a.clientY,button:a.button,moved:!1,pan:!s&&(a.button===0||a.button===1||a.shiftKey),allowTextSelection:s},s||r.setPointerCapture(a.pointerId)},r.onpointermove=a=>{if(!this.worldDrag||this.worldDrag.pointerId!==a.pointerId)return;let s=a.clientX-this.worldDrag.lastX,n=a.clientY-this.worldDrag.lastY;this.worldDrag.lastX=a.clientX,this.worldDrag.lastY=a.clientY,Math.hypot(a.clientX-this.worldDrag.startX,a.clientY-this.worldDrag.startY)>3&&(this.worldDrag.moved=!0),this.worldDrag.pan&&e.pan(s,n)},r.onpointerup=a=>{if(!this.worldDrag||this.worldDrag.pointerId!==a.pointerId)return;let s=this.worldDrag;if(this.worldDrag=null,s.allowTextSelection||r.releasePointerCapture(a.pointerId),s.button!==0||s.moved)return;let n=a.target.closest?.("[data-feature-key]");if(n)this.selectElement(n,a);else{let i=this.featureAtEvent(a);i?this.selectFeature(i.entry,i.feature,a):this.callbacks.onBlank?.()}},r.ondblclick=a=>{let s=a.target.closest?.("[data-feature-key]"),n=s?null:this.featureAtEvent(a),i=n?.entry||this.entryForPoint(a.clientX,a.clientY),o=s?this.selectionFromElement(s):n?this.selectionFromFeature(n.entry,n.feature):this.selected;Tu(o)?this.callbacks.onOpenPage?.(o):o?.netUid?this.callbacks.onHighlightNet?.(o.netUid,o):!n&&i?.page&&this.callbacks.onOpenPage?.({kind:"page",pageId:i.page.id,page:i.page})},r.onwheel=a=>{a.preventDefault(),Math.abs(a.deltaX)>Math.abs(a.deltaY)*.65?e.pan(-a.deltaX,-a.deltaY):e.zoom(a.deltaY,a.clientX,a.clientY)}}async focusPage(e,r={}){if(!e)return!1;if(this.activePage?.id===e.id&&this.active)return r.frame!==!1&&this.fitPage(),!0;let a=performance.now(),s=await this.loadImportedSvg(e);if(!s)return!1;let n=document.createElement("div");return n.className="svg-dom-page",n.append(s),this.host.replaceChildren(n),this.host.hidden=!1,this.container=n,this.svg=s,this.activePage=e,this.activeSvgUrl=new URL(e.svg||e.thumbnail?.path,this.manifestUrl).toString(),this.overlay=ku(s),this.selectionOverlay=Eu(s),this.index=Mu(s,e,this.featuresByPage[e.id]||[]),this.installPageHandlers(),this.fitPage(),this.setSelection(this.selected),this.setHighlightedNet(this.highlightedNetUid),this.lastStats={...this.lastStats,mountedPages:1,domNodes:s.querySelectorAll("*").length,indexedFeatures:this.index.featureToElements.size,indexedNets:this.index.netToElements.size,mountMs:performance.now()-a,fallbackReason:""},this.updateCacheStats(),!0}installPageHandlers(){let e=this.host;e.oncontextmenu=r=>r.preventDefault(),e.onpointerdown=r=>{if(!this.active)return;let a=r.button===0&&!r.shiftKey&&!!r.target.closest?.("text"),s=r.target.closest?.("[data-feature-key]"),n=s?null:this.featureAtEvent(r);this.drag={pointerId:r.pointerId,startX:r.clientX,startY:r.clientY,lastX:r.clientX,lastY:r.clientY,button:r.button,moved:!1,pan:!a&&(r.button===0||r.button===1||r.shiftKey),featureElement:s,allowTextSelection:a},a||e.setPointerCapture(r.pointerId)},e.onpointermove=r=>{if(!this.drag||this.drag.pointerId!==r.pointerId)return;let a=r.clientX-this.drag.lastX,s=r.clientY-this.drag.lastY;this.drag.lastX=r.clientX,this.drag.lastY=r.clientY,Math.hypot(r.clientX-this.drag.startX,r.clientY-this.drag.startY)>3&&(this.drag.moved=!0),this.drag.pan&&(this.view.tx+=a,this.view.ty+=s,this.applyTransform())},e.onpointerup=r=>{if(!this.drag||this.drag.pointerId!==r.pointerId)return;let a=this.drag;if(this.drag=null,a.allowTextSelection||e.releasePointerCapture(r.pointerId),a.button!==0||a.moved)return;let s=r.target.closest?.("[data-feature-key]");if(s)this.selectElement(s,r);else{let n=this.featureAtEvent(r);n?this.selectFeature(n.entry,n.feature,r):this.callbacks.onBlank?.()}},e.ondblclick=r=>{let a=r.target.closest?.("[data-feature-key]"),s=a?null:this.featureAtEvent(r),n=a?this.selectionFromElement(a):s?this.selectionFromFeature(s.entry,s.feature):this.selected;Tu(n)?this.callbacks.onOpenPage?.(n):n?.netUid?this.callbacks.onHighlightNet?.(n.netUid,n):!s&&this.activePage&&this.callbacks.onOpenPage?.({kind:"page",pageId:this.activePage.id,page:this.activePage})},e.onwheel=r=>{if(r.preventDefault(),!this.active)return;if(Math.abs(r.deltaX)>Math.abs(r.deltaY)*.65){this.view.tx-=r.deltaX,this.view.ty-=r.deltaY,this.applyTransform();return}let a=this.host.getBoundingClientRect(),s=r.clientX-a.left,n=r.clientY-a.top,i=this.screenToSvg(s,n),o=Math.exp(-r.deltaY*.0016);this.view.scale=Ds(this.view.scale*o,.02,80),this.view.tx=s-i[0]*this.view.scale,this.view.ty=n-i[1]*this.view.scale,this.applyTransform()}}selectElement(e,r){let a=performance.now(),s=this.selectionFromElement(e);if(this.setSelection(s),r){let n=this.host.getBoundingClientRect();s.anchor={x:r.clientX-n.left,y:r.clientY-n.top}}this.callbacks.onSelect?.(s),this.lastStats.selectionMs=performance.now()-a}selectFeature(e,r,a){let s=performance.now(),n=this.selectionFromFeature(e,r);if(this.setSelection(n),a){let i=this.host.getBoundingClientRect();n.anchor={x:a.clientX-i.left,y:a.clientY-i.top}}this.callbacks.onSelect?.(n),this.lastStats.selectionMs=performance.now()-s}selectionFromElement(e){let r=e.dataset.featureKey||"",a=this.entryForElement(e),s=a.index.featureByKey.get(r)||{};return this.selectionFromFeature(a,s,e)}selectionFromFeature(e,r,a=null){let s=r?.stableKey||a?.dataset?.featureKey||"",n=e?.page||this.activePage,i=r?.kind||a?.dataset?.role||a?.dataset?.primitive||"feature",o=r?.netUid||a?.dataset?.netUid||"",c=r?.netName||a?.dataset?.netName||"";return i==="sheet"?{kind:"sheet",featureKey:s,sheetInstancePath:r?.sheetInstancePath||n?.sheetInstancePath||"",sourceId:r?.sourceId||a?.dataset?.sourceId||a?.dataset?.objectId||a?.dataset?.uuid||"",sheetName:r?.sheet_name||r?.sheetName||a?.dataset?.sheetName||r?.objectId||"",sheetFile:r?.sheet_file||r?.sheetFile||a?.dataset?.sheetFile||"",feature:r}:i==="pin"||i==="pin_body"||i==="pin_name"||i==="pin_number"||a?.dataset?.pin?{kind:"pin",featureKey:s,sheetInstancePath:r?.sheetInstancePath||n?.sheetInstancePath||"",sourceId:r?.sourceId||a?.dataset?.sourceId||a?.dataset?.objectId||a?.dataset?.uuid||"",symbolUuid:r?.symbolUuid||a?.dataset?.symbolUuid||"",reference:r?.reference||a?.dataset?.designator||a?.dataset?.component||a?.dataset?.ref||"",pinNumber:r?.pinNumber||a?.dataset?.pin||"",pinName:r?.pinName||"",netUid:o,netName:c,feature:r}:i==="symbol_body"||i==="symbol_instance"||i==="component"||a?.dataset?.ref?{kind:"component",featureKey:s,sheetInstancePath:r?.sheetInstancePath||n?.sheetInstancePath||"",sourceId:r?.sourceId||a?.dataset?.sourceId||a?.dataset?.objectId||a?.dataset?.uuid||"",symbolUuid:r?.symbolUuid||a?.dataset?.symbolUuid||"",reference:r?.reference||a?.dataset?.designator||a?.dataset?.component||a?.dataset?.ref||"",netUid:o,netName:c,feature:r}:{kind:o?"feature":i,featureKey:s,sheetInstancePath:r?.sheetInstancePath||n?.sheetInstancePath||"",sourceId:r?.sourceId||a?.dataset?.sourceId||a?.dataset?.objectId||a?.dataset?.uuid||"",role:i,netUid:o,netName:c,feature:r}}setSelection(e){this.selected=e||null;for(let a of this.host.querySelectorAll(".prism-svg-selected"))a.classList.remove("prism-svg-selected");for(let a of this.host.querySelectorAll("[data-prism-overlay='selection']"))a.replaceChildren();let r=e?.featureKey||"";if(r){for(let a of this.entries()){for(let s of a.index.featureToElements.get(r)||[])s.classList.add("prism-svg-selected");this.drawSelectionOverlay(a,e)}for(let a of this.index.featureToElements.get(r)||[])a.classList.add("prism-svg-selected");this.drawSelectionOverlay({page:this.activePage,index:this.index,selectionOverlay:this.selectionOverlay},e)}}setHighlightedNet(e){this.highlightedNetUid=e||"";let r=performance.now();for(let a of this.entries())this.updateEntryHighlight(a);if(!this.svg||!this.overlay){this.lastStats.highlightMs=performance.now()-r;return}this.updateEntryHighlight({svg:this.svg,overlay:this.overlay,index:this.index,page:this.activePage}),this.lastStats.highlightMs=performance.now()-r}updateEntryHighlight(e){if(!e?.svg||!e?.overlay||(e.overlay.replaceChildren(),!this.highlightedNetUid))return;let r=Us(e.svg,e.page),a=document.createElementNS(ua,"rect");a.setAttribute("x",String(r[0])),a.setAttribute("y",String(r[1])),a.setAttribute("width",String(r[2])),a.setAttribute("height",String(r[3])),a.setAttribute("class","prism-svg-net-dimmer"),e.overlay.append(a);let n=(e.index.netToElements.get(this.highlightedNetUid)||[]).slice(0,2200);for(let i of n){let o=Dx(i);e.overlay.append(o)}}entries(){return[...this.mountedPages.values()]}entryForElement(e){let a=e.closest?.(".svg-dom-page")?.dataset.pageId||"";return this.mountedPages.get(a)||{page:this.activePage,index:this.index,svg:this.svg,overlay:this.overlay,selectionOverlay:this.selectionOverlay}}featureAtEvent(e){let r=this.entryForPoint(e.clientX,e.clientY);if(!r)return null;let a=this.clientToSvg(r,e.clientX,e.clientY);if(!a)return null;let s=Math.max(.18,5*zx(r)),i=r.index.features.filter(o=>(o?.domBoundsMm||o?.boundsMm)&&_u(o)).filter(o=>a[0]>=(o.domBoundsMm||o.boundsMm)[0]-s&&a[0]<=(o.domBoundsMm||o.boundsMm)[2]+s&&a[1]>=(o.domBoundsMm||o.boundsMm)[1]-s&&a[1]<=(o.domBoundsMm||o.boundsMm)[3]+s).map(o=>({feature:o,priority:Kx(o),area:Math.max(1e-4,((o.domBoundsMm||o.boundsMm)[2]-(o.domBoundsMm||o.boundsMm)[0])*((o.domBoundsMm||o.boundsMm)[3]-(o.domBoundsMm||o.boundsMm)[1]))})).sort((o,c)=>c.priority-o.priority||o.area-c.area)[0]?.feature;return i?{entry:r,feature:i,point:a}:null}entryForPoint(e,r){for(let a of[...this.entries()].reverse()){let s=a.container.getBoundingClientRect();if(e>=s.left&&e<=s.right&&r>=s.top&&r<=s.bottom)return a}if(this.container){let a=this.container.getBoundingClientRect();if(e>=a.left&&e<=a.right&&r>=a.top&&r<=a.bottom)return{page:this.activePage,container:this.container,svg:this.svg,index:this.index,selectionOverlay:this.selectionOverlay}}return null}clientToSvg(e,r,a){if(!e?.container||!e?.svg||!e?.page)return null;let s=e.container.getBoundingClientRect();if(!s.width||!s.height)return null;let n=Us(e.svg,e.page);return[n[0]+(r-s.left)/s.width*n[2],n[1]+(a-s.top)/s.height*n[3]]}drawSelectionOverlay(e,r){if(!e?.selectionOverlay||!r?.featureKey)return;let a=e.index.featureByKey.get(r.featureKey),s=a?.domBoundsMm||a?.boundsMm;if(!s)return;let[n,i,o,c]=s,l=document.createElementNS(ua,"rect");l.setAttribute("x",String(n)),l.setAttribute("y",String(i)),l.setAttribute("width",String(Math.max(.001,o-n))),l.setAttribute("height",String(Math.max(.001,c-i))),l.setAttribute("rx","0.65"),l.setAttribute("ry","0.65"),l.setAttribute("class","prism-svg-selection-box"),e.selectionOverlay.append(l)}fitPage(){if(!this.svg||!this.activePage)return;let e=Us(this.svg,this.activePage),r=e[2]||this.activePage.sourceWidthMm||this.activePage.widthMm||1,a=e[3]||this.activePage.sourceHeightMm||this.activePage.heightMm||1,s=this.host.getBoundingClientRect(),n=Math.min(s.width/r,s.height/a)*.92;this.view.scale=Ds(n,.02,80),this.view.tx=(s.width-r*this.view.scale)/2-e[0]*this.view.scale,this.view.ty=(s.height-a*this.view.scale)/2-e[1]*this.view.scale,this.applyTransform()}frameSelection(e=this.selected){if(!e?.featureKey||!this.active){this.fitPage();return}let r=this.index.featureToElements.get(e.featureKey)||[],a=Iu(r);if(!a)return;let s=this.host.getBoundingClientRect(),n=Math.max(1,a[2]-a[0]),i=Math.max(1,a[3]-a[1]),o=Math.min(s.width/n,s.height/i)*.36;this.view.scale=Ds(o,.04,80),this.view.tx=s.width/2-(a[0]+a[2])/2*this.view.scale,this.view.ty=s.height/2-(a[1]+a[3])/2*this.view.scale,this.applyTransform()}pan(e,r){this.active&&(this.view.tx+=e,this.view.ty+=r,this.applyTransform())}zoom(e,r,a){if(!this.active)return;let s=this.host.getBoundingClientRect(),n=(r??s.left+s.width/2)-s.left,i=(a??s.top+s.height/2)-s.top,o=this.screenToSvg(n,i),c=Math.exp(-e*.0016);this.view.scale=Ds(this.view.scale*c,.02,80),this.view.tx=n-o[0]*this.view.scale,this.view.ty=i-o[1]*this.view.scale,this.applyTransform()}screenToSvg(e,r){return[(e-this.view.tx)/Math.max(1e-6,this.view.scale),(r-this.view.ty)/Math.max(1e-6,this.view.scale)]}applyTransform(){this.container&&(this.container.style.transform=`translate3d(${this.view.tx}px, ${this.view.ty}px, 0) scale(${this.view.scale})`)}hasCachedSvg(e){return!!this.svgCache.get(this.svgUrlForPage(e))?.template}pruneMountedWorldPages(e=new Set){if(this.mountedPages.size<=this.maxMountedWorldPages)return;let r=[...this.mountedPages.entries()].filter(([a])=>!e.has(a)).sort((a,s)=>(a[1].lastUsed||0)-(s[1].lastUsed||0));for(let[a,s]of r){if(this.mountedPages.size<=this.maxMountedWorldPages)break;s.container.remove(),this.mountedPages.delete(a)}}pruneSvgCache(){let e=[...this.svgCache.entries()].filter(([,s])=>s?.template);if(e.length<=this.maxCachedSvgPages)return;let r=new Set([...this.mountedPages.values()].map(s=>this.svgUrlForPage(s.page)));this.activePage&&r.add(this.svgUrlForPage(this.activePage));let a=e.filter(([s])=>!r.has(s)).sort((s,n)=>(s[1].lastUsed||0)-(n[1].lastUsed||0));for(let[s]of a){if([...this.svgCache.values()].filter(n=>n?.template).length<=this.maxCachedSvgPages)break;this.svgCache.delete(s)}}updateCacheStats(){let e=[...this.svgCache.values()].filter(a=>a?.template);this.lastStats.cachedSvgPages=e.length,this.lastStats.cachedSvgBytes=e.reduce((a,s)=>a+(s.byteLength||0),0);let r=performance?.memory;this.lastStats.heapMb=r?.usedJSHeapSize?r.usedJSHeapSize/1048576:null}};function Cx(t,e,r){for(let n of[...t.querySelectorAll("*")]){if(Ax.has(n.localName.toLowerCase())){n.remove();continue}for(let i of[...n.attributes]){let o=i.name,c=o.toLowerCase(),l=i.value||"";if(c.startsWith("on")){n.removeAttribute(o);continue}if((c==="href"||c==="xlink:href"||c==="src")&&Ru(l)){if((c==="href"||c==="xlink:href")&&n.localName.toLowerCase()==="image"&&Hx(l))continue;n.removeAttribute(o);continue}c==="style"&&n.setAttribute(o,Wx(l))}}let a=`prism-${Yi(r)}-`,s=new Map;for(let n of t.querySelectorAll("[id]")){let i=n.getAttribute("id"),o=`${a}${Yi(i)}`;s.set(i,o),n.setAttribute("id",o)}for(let n of t.querySelectorAll("*"))for(let i of[...n.attributes]){let o=i.name.toLowerCase(),c=i.value||"";Ix.has(o)&&(c.startsWith("#")&&s.has(c.slice(1))?c=`#${s.get(c.slice(1))}`:qx(c)&&(c=new URL(c,e).toString())),c=Xx(c,s),n.setAttribute(i.name,c)}}function Mu(t,e,r){let a=new Map,s=new Map,n=new Map,i=[];for(let f of r){let u=Ox(f,e);i.push(u),s.set(u.stableKey,u),n.set(Number(u.id||0),u);for(let p of Px(u))a.has(p)||a.set(p,[]),a.get(p).push(u)}let o=new Map,c=new Map,l=new Map;for(let f of i)l.set(f.stableKey,f);for(let f of t.querySelectorAll("[data-uuid], [data-element-key], [data-primitive], [data-ref], [data-pin], [data-object-id], [data-designator], [data-component]")){let u=Bx(f,a,e);if(u&&!_u(u)||!u&&!Vx(f))continue;let p=jx(f,e),b=u?.stableKey||p,h=u?.netUid||"",d=u?.netName||"";f.classList.add("prism-feature"),f.dataset.featureKey=b,f.dataset.sourceId=u?.sourceId||f.dataset.uuid||f.dataset.elementKey||"",f.dataset.role=u?.kind||f.dataset.primitive||f.dataset.ref||"feature",u?.id&&(f.dataset.featureId=String(u.id)),h&&(f.dataset.netUid=h),d&&(f.dataset.netName=d),f.id||(f.id=`prism-feature-${Yi(b)}`),Au(o,b,f),l.set(b,u||{id:0,stableKey:b,kind:f.dataset.role,sourceId:f.dataset.sourceId,sheetInstancePath:e.sheetInstancePath||""}),h&&Au(c,h,f)}for(let[f,u]of o){let p=l.get(f),b=Iu(u);p&&b&&(p.domBoundsMm=Ux(p.boundsMm,b))}return{featureToElements:o,netToElements:c,featureByKey:l,byId:n,bySource:a,features:i}}function Bx(t,e,r){let s=[t.dataset.uuid,t.dataset.elementKey,t.dataset.sourceId,t.dataset.objectId,t.dataset.componentUid,t.dataset.componentUuid,t.dataset.ref&&`${t.dataset.ref}:${t.dataset.pin||""}`].filter(Boolean).flatMap(i=>e.get(i)||[]);if(!s.length)return null;let n=String(t.dataset.primitive||t.dataset.ref||t.dataset.pin||"").toLowerCase();return s.map(i=>({feature:i,score:Fx(i,n,r)})).sort((i,o)=>o.score-i.score)[0].feature}function Fx(t,e,r){let a=0,s=String(t.kind||"").toLowerCase();return t.sheetInstancePath===r.sheetInstancePath&&(a+=20),t.netUid&&(a+=4),e&&s.includes(e)&&(a+=8),e==="symbol"&&s==="symbol_body"&&(a+=12),(e==="label"||e==="port")&&(s.includes("label")||s.includes("port"))&&(a+=12),e==="sheet"&&s==="sheet"&&(a+=12),s!=="record"&&(a+=2),s.includes("pin")&&(a+=2),a}function Ox(t,e){let r=t.sourceId||t.sourceUid||t.uuid||t.objectId||t.stableKey||"";return{...t,id:Number(t.id||0),sourceId:r,stableKey:t.stableKey||`${e.sheetInstancePath||e.id}|${r}|0|${t.kind||"feature"}|0`,sheetInstancePath:t.sheetInstancePath||e.sheetInstancePath||""}}function Px(t){let e=new Set([t.sourceId,t.sourceUid,t.uuid,t.objectId,t.stableKey].filter(Boolean).map(String));return t.reference&&t.pinNumber&&e.add(`${t.reference}:${t.pinNumber}`),t.componentDesignator&&e.add(t.componentDesignator),t.reference&&e.add(t.reference),[...e]}function jx(t,e){let r=t.dataset.uuid||t.dataset.elementKey||t.dataset.objectId||t.dataset.ref||t.id||"svg",a=t.dataset.primitive||t.dataset.role||t.localName||"feature";return`${e.sheetInstancePath||e.id}|${r}|0|${a}|0`}function Lx(t){let e=document.createElementNS(ua,"style");e.textContent=`
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
  `,t.prepend(e)}function ku(t){let e=document.createElementNS(ua,"g");return e.setAttribute("class","prism-svg-net-overlay"),e.setAttribute("data-prism-overlay","net-highlight"),t.append(e),e}function Eu(t){let e=document.createElementNS(ua,"g");return e.setAttribute("class","prism-svg-selection-overlay"),e.setAttribute("data-prism-overlay","selection"),e.style.pointerEvents="none",t.append(e),e}function Dx(t){let e=t.cloneNode(!0);e.removeAttribute("id"),e.removeAttribute("data-feature-key"),e.removeAttribute("data-net-uid"),e.removeAttribute("data-net-name"),e.classList.add("prism-svg-net-overlay-clone");for(let r of[e,...Array.from(e.querySelectorAll?.("*")||[])])r instanceof SVGElement&&(r.removeAttribute("filter"),r.style.pointerEvents="none",r.style.stroke="#18ef52",r.style.fill="none",r.style.opacity="0.98",r.style.vectorEffect="non-scaling-stroke");return e}function Iu(t){let e=null;for(let r of t)if(r.getBBox)try{let a=r.getBBox(),s=[a.x,a.y,a.x+a.width,a.y+a.height];e=e?[Math.min(e[0],s[0]),Math.min(e[1],s[1]),Math.max(e[2],s[2]),Math.max(e[3],s[3])]:s}catch{}return e}function Ux(t,e){return t?e?[Math.min(t[0],e[0]),Math.min(t[1],e[1]),Math.max(t[2],e[2]),Math.max(t[3],e[3])]:t:e}function Us(t,e){let r=t.getAttribute("viewBox");if(r){let a=r.trim().split(/[\s,]+/).map(Number);if(a.length===4&&a.every(Number.isFinite))return a}return[0,0,e.sourceWidthMm||e.widthMm||1,e.sourceHeightMm||e.heightMm||1]}function Su(){return{featureToElements:new Map,netToElements:new Map,featureByKey:new Map,byId:new Map,bySource:new Map,features:[]}}function zx(t){let e=t?.container?.getBoundingClientRect?.();if(!t?.svg||!t?.page||!e?.width||!e?.height)return .1;let r=Us(t.svg,t.page);return Math.max(r[2]/e.width,r[3]/e.height)}function Gx(t){let e=String(t?.kind||"").toLowerCase(),r=String(t?.semanticRole||"").toLowerCase(),a=`${t?.sourceId||""} ${t?.objectId||""} ${t?.text||""}`.toLowerCase();return e.includes("page")||r.includes("page")||e.includes("background")||r.includes("background")||a.includes("background")||a.includes("sheet_header")||a.includes("sheet header")||a.includes("drawing-sheet")}function Kx(t){let e=String(t?.kind||t?.semanticRole||"").toLowerCase();return e.includes("pin")?90:e.includes("label")||e.includes("port")?78:e.includes("wire")||e.includes("bus")||e.includes("junction")?70:e.includes("symbol")||e.includes("component")?54:e.includes("image")?30:20}function _u(t){if(!t||Gx(t))return!1;let e=String(t.kind||t.semanticRole||"").toLowerCase();return["pin","label","port","wire","bus","junction","no_connect","symbol","component","sheet","image","text"].some(r=>e.includes(r))}function Vx(t){let e=`${t?.dataset?.primitive||""} ${t?.dataset?.ref||""} ${t?.dataset?.role||""} ${t?.dataset?.objectId||""} ${t?.dataset?.text||""}`.toLowerCase();return!e||e.includes("background")||e.includes("sheet_header")||e.includes("sheet header")||e.includes("drawing-sheet")?!1:["pin","label","port","wire","bus","junction","no_connect","symbol","component","sheet","image","text"].some(r=>e.includes(r))}function Tu(t){return String(t?.kind||t?.feature?.kind||"").toLowerCase()==="sheet"}function Au(t,e,r){t.has(e)||t.set(e,[]),t.get(e).push(r)}function Ru(t){let e=String(t||"").trim().toLowerCase();return!e||e.startsWith("#")?!1:e.startsWith("javascript:")||e.startsWith("data:")||e.startsWith("http://")||e.startsWith("https://")}function Hx(t){return/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(String(t||"").trim())}function qx(t){let e=String(t||"").trim();return e&&!e.startsWith("#")&&!/^[a-z][a-z0-9+.-]*:/i.test(e)}function Wx(t){return String(t||"").replace(/url\(([^)]+)\)/gi,(e,r)=>{let a=r.trim().replace(/^['"]|['"]$/g,"");return Ru(a)?"none":e})}function Xx(t,e){let r=String(t||"");return r=r.replace(/url\(#([^)]+)\)/g,(a,s)=>e.has(s)?`url(#${e.get(s)})`:a),r=r.replace(/^#(.+)$/,(a,s)=>e.has(s)?`#${e.get(s)}`:a),r}function Yi(t){return String(t||"").trim().replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,96)||"item"}function Ds(t,e,r){return Math.max(e,Math.min(r,t))}function wt(t){return`${t.level||""}/${t.id}`}function Nu(t){let e=t.ends||[],r=t.wires||[];return e.length<2?[]:e.length===2?[{key:`${e[0].id}~${e[1].id}`,a:e[0].id,b:e[1].id,wires:new Set(r.map(a=>a.id))}]:e.map(a=>({key:`hub~${a.id}`,a:"hub",b:a.id,wires:new Set(r.filter(s=>s.from===a.id||s.to===a.id).map(s=>s.id))}))}function $x(t,e){return!e||e.harness!==t.id?!1:!t.level||!e.occurrence||e.occurrence.startsWith(`${t.level}/`)}function Cu(t,e){let r=new Map;for(let a of t||[]){let s=new Map,n=new Set((a.wires||[]).map(i=>i.id));for(let i of e||[])for(let o of i.wires||[])n.has(o.wire)&&$x(a,o)&&!s.has(o.wire)&&s.set(o.wire,i.color);s.size&&r.set(wt(a),s)}return r}function Bu(t,e){if(!e)return null;for(let r of t.wires)if(e.has(r))return e.get(r);return null}function Fu(t,e){let r=new Map;if(!e)return r;for(let a of t.wires||[]){let s=e.get(a.id);s&&(r.has(a.from)||r.set(a.from,s),r.has(a.to)||r.set(a.to,s))}return r}function Ou(t){let e=t.filter(Boolean);return e.length<2?null:[0,1,2].map(r=>e.reduce((a,s)=>a+s[r],0)/e.length)}var Qt="auto",Yx=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];function Ar(t,e){return t.level?e(t.level):Yx}function Ji(t,e){return[0,1,2].map(r=>t[r]*e[0]+t[4+r]*e[1]+t[8+r]*e[2]+t[12+r])}function fa(t,e){let r=[e[0]-t[12],e[1]-t[13],e[2]-t[14]];return[0,1,2].map(a=>t[a*4]*r[0]+t[a*4+1]*r[1]+t[a*4+2]*r[2])}function Qi(t,e,r){return e?t.map(a=>{if(r(a)!==e.harness)return a;let s=a.nodes??[];if(e.insert)return{...a,nodes:[...s,e.insert]};let n=e.id===Qt?[{id:Qt,kind:"breakout",positionMm:e.positionMm,pinned:!1,order:-1,ends:[],between:null},...s]:s.map(i=>i.id===e.id?{...i,positionMm:e.positionMm,pinned:i.kind==="waypoint"?!0:i.pinned}:i);return{...a,nodes:n}}):t}var Pu="__bend__";function ju(t,{kind:e,segment:r,atMm:a,positionMm:s,toWorldMm:n}){if(e==="breakout"){let x=t.filter(g=>g.kind==="breakout").reduce((g,y)=>Math.max(g,y.order??0),-1);return{id:Pu,kind:"breakout",positionMm:s,pinned:!1,order:x+1,ends:[],between:null}}let i=r.samplesMm.flat(),o=x=>{let g=0,y=1/0;for(let m=0;m+2<i.length;m+=3){let w=Math.hypot(i[m]-x[0],i[m+1]-x[1],i[m+2]-x[2]);w<y&&([g,y]=[m/3,w])}return g},c=x=>[...x].sort().join("|"),l=t.filter(x=>x.kind==="waypoint"&&x.between&&c(x.between)===c([r.from,r.to])).sort((x,g)=>(x.order??0)-(g.order??0)),f=l[0]?.between??[r.from,r.to],u=f[0]===r.from?1:-1,p=x=>u*o(x),b=p(a),h=l.filter(x=>p(n(x.positionMm))<b).length,d=l.length?h===0?(l[0].order??0)-1:h===l.length?(l[l.length-1].order??0)+1:((l[h-1].order??0)+(l[h].order??0))/2:0;return{id:Pu,kind:"waypoint",positionMm:s,pinned:!0,order:d,ends:[],between:[...f]}}function Lu(t,e,r){let a=(t.nodes??[]).map(n=>({id:n.id,kind:n.kind,pinned:!!n.pinned,worldMm:Ji(r,n.positionMm)})),s=e.find(n=>n.to===Qt);return s&&a.push({id:Qt,kind:"breakout",pinned:!1,auto:!0,worldMm:s.samplesMm.slice(-3)}),a}function Jx(t,e,r){let a=e[0]-t[0],s=e[1]-t[1],n=a*a+s*s,i=n>0?Math.max(0,Math.min(1,((r[0]-t[0])*a+(r[1]-t[1])*s)/n)):0;return{t:i,distance:Math.hypot(t[0]+i*a-r[0],t[1]+i*s-r[1])}}function Du(t,e,r,a,s=5){let n=null;return t.forEach((i,o)=>{let c=i.samplesMm,l=Math.floor(c.length/3),f=l?r([c[0],c[1],c[2]]):null;for(let u=0;u+1<l;u+=1){let p=[c[u*3+3],c[u*3+4],c[u*3+5]],b=r(p);if(f&&b){let{t:h,distance:d}=Jx(f,b,e),x=[0,1,2].map(y=>c[u*3+y]+h*(p[y]-c[u*3+y])),g=s+i.radiusMm*a(x);d<=g&&(!n||d<n.distancePx)&&(n={index:o,sample:u,t:h,pointMm:x,distancePx:d})}f=b}}),n}function Uu(t,e,r,a,{right:s,up:n}){if(!(a>0))return[...t];let i=e/a,o=-r/a;return t.map((c,l)=>c+s[l]*i+n[l]*o)}function zu(t,e,r=3){return Math.hypot(e[0]-t[0],e[1]-t[1])>=r}function Vu(t,e,r,a){let{right:s,up:n,back:i}=t.basis(),o=Math.tan(t.fov/2),c=Ee(t.focus,pe(i,t.distance)),l=He(Ee(Ee(pe(i,-1),pe(s,e*o*a)),pe(n,r*o)));return{origin:c,direction:l}}function Zi(t){let e=new Array(16);e[0]=t[5]*t[10]*t[15]-t[5]*t[11]*t[14]-t[9]*t[6]*t[15]+t[9]*t[7]*t[14]+t[13]*t[6]*t[11]-t[13]*t[7]*t[10],e[4]=-t[4]*t[10]*t[15]+t[4]*t[11]*t[14]+t[8]*t[6]*t[15]-t[8]*t[7]*t[14]-t[12]*t[6]*t[11]+t[12]*t[7]*t[10],e[8]=t[4]*t[9]*t[15]-t[4]*t[11]*t[13]-t[8]*t[5]*t[15]+t[8]*t[7]*t[13]+t[12]*t[5]*t[11]-t[12]*t[7]*t[9],e[12]=-t[4]*t[9]*t[14]+t[4]*t[10]*t[13]+t[8]*t[5]*t[14]-t[8]*t[6]*t[13]-t[12]*t[5]*t[10]+t[12]*t[6]*t[9],e[1]=-t[1]*t[10]*t[15]+t[1]*t[11]*t[14]+t[9]*t[2]*t[15]-t[9]*t[3]*t[14]-t[13]*t[2]*t[11]+t[13]*t[3]*t[10],e[5]=t[0]*t[10]*t[15]-t[0]*t[11]*t[14]-t[8]*t[2]*t[15]+t[8]*t[3]*t[14]+t[12]*t[2]*t[11]-t[12]*t[3]*t[10],e[9]=-t[0]*t[9]*t[15]+t[0]*t[11]*t[13]+t[8]*t[1]*t[15]-t[8]*t[3]*t[13]-t[12]*t[1]*t[11]+t[12]*t[3]*t[9],e[13]=t[0]*t[9]*t[14]-t[0]*t[10]*t[13]-t[8]*t[1]*t[14]+t[8]*t[2]*t[13]+t[12]*t[1]*t[10]-t[12]*t[2]*t[9],e[2]=t[1]*t[6]*t[15]-t[1]*t[7]*t[14]-t[5]*t[2]*t[15]+t[5]*t[3]*t[14]+t[13]*t[2]*t[7]-t[13]*t[3]*t[6],e[6]=-t[0]*t[6]*t[15]+t[0]*t[7]*t[14]+t[4]*t[2]*t[15]-t[4]*t[3]*t[14]-t[12]*t[2]*t[7]+t[12]*t[3]*t[6],e[10]=t[0]*t[5]*t[15]-t[0]*t[7]*t[13]-t[4]*t[1]*t[15]+t[4]*t[3]*t[13]+t[12]*t[1]*t[7]-t[12]*t[3]*t[5],e[14]=-t[0]*t[5]*t[14]+t[0]*t[6]*t[13]+t[4]*t[1]*t[14]-t[4]*t[2]*t[13]-t[12]*t[1]*t[6]+t[12]*t[2]*t[5],e[3]=-t[1]*t[6]*t[11]+t[1]*t[7]*t[10]+t[5]*t[2]*t[11]-t[5]*t[3]*t[10]-t[9]*t[2]*t[7]+t[9]*t[3]*t[6],e[7]=t[0]*t[6]*t[11]-t[0]*t[7]*t[10]-t[4]*t[2]*t[11]+t[4]*t[3]*t[10]+t[8]*t[2]*t[7]-t[8]*t[3]*t[6],e[11]=-t[0]*t[5]*t[11]+t[0]*t[7]*t[9]+t[4]*t[1]*t[11]-t[4]*t[3]*t[9]-t[8]*t[1]*t[7]+t[8]*t[3]*t[5],e[15]=t[0]*t[5]*t[10]-t[0]*t[6]*t[9]-t[4]*t[1]*t[10]+t[4]*t[2]*t[9]+t[8]*t[1]*t[6]-t[8]*t[2]*t[5];let r=t[0]*e[0]+t[1]*e[4]+t[2]*e[8]+t[3]*e[12];return Math.abs(r)<1e-30?null:e.map(a=>a/r)}function Gu(t,e){return[0,1,2].map(r=>t[r]*e[0]+t[4+r]*e[1]+t[8+r]*e[2]+t[12+r])}function Ku(t,e){return[0,1,2].map(r=>t[r]*e[0]+t[4+r]*e[1]+t[8+r]*e[2])}function Qx(t,e,r){let a=-1/0,s=1/0;for(let n=0;n<3;n+=1){if(Math.abs(e[n])<1e-15){if(t[n]<r[n]||t[n]>r[n+3])return!1;continue}let i=(r[n]-t[n])/e[n],o=(r[n+3]-t[n])/e[n];a=Math.max(a,Math.min(i,o)),s=Math.min(s,Math.max(i,o))}return s>=Math.max(a,0)}function Zx(t,e,r){let a=null;for(let s of t){if(s.bounds&&!Qx(e,r,s.bounds))continue;let n=s.position,i=s.indices,o=i?i.length:n.length/3;for(let c=0;c+2<o;c+=3){let l=(i?i[c]:c)*3,f=(i?i[c+1]:c+1)*3,u=(i?i[c+2]:c+2)*3,p=[n[f]-n[l],n[f+1]-n[l+1],n[f+2]-n[l+2]],b=[n[u]-n[l],n[u+1]-n[l+1],n[u+2]-n[l+2]],h=qe(r,b),d=tt(p,h);if(Math.abs(d)<1e-18)continue;let x=[e[0]-n[l],e[1]-n[l+1],e[2]-n[l+2]],g=tt(x,h)/d;if(g<0||g>1)continue;let y=qe(x,p),m=tt(r,y)/d;if(m<0||g+m>1)continue;let w=tt(b,y)/d;w>1e-12&&(!a||w<a.t)&&(a={t:w,normal:qe(p,b)})}}return a}function Hu(t,e){let r=null;for(let a of t){let s=Zi(a.matrix);if(!s)continue;let n=Gu(s,e.origin),i=Ku(s,e.direction),o=Zx(a.primitives,n,i);if(!o)continue;let c=Gu(a.matrix,Ee(n,pe(i,o.t))),l=Math.hypot(...c.map((p,b)=>p-e.origin[b]));if(r&&l>=r.distance)continue;let f=[s[0],s[4],s[8],0,s[1],s[5],s[9],0,s[2],s[6],s[10],0,0,0,0,1],u=He(Ku(f,o.normal));tt(u,e.direction)>0&&(u=pe(u,-1)),r={key:a.key,point:c,normal:u,distance:l}}return r?{key:r.key,point:r.point,normal:r.normal}:null}var Ae={bootMm:10,housingDepthMm:8,breakoutLiftMm:10,chordErrorMm:.2,catmullRomAlpha:.5,minBendRadiusFactor:6,bendRelaxIterations:8,packingFactor:1.2,ringSegments:12,breakoutBlendMm:5,lengthAllowance:.1,lengthMismatchTolerance:.15,boardCollisionMarginMm:1,defaultGaugeAwg:"24"},eo={24:1.143,22:1.3208,20:1.524,18:1.8034,16:2.0066,14:2.3622,12:2.8956,10:3.5306,8:5.0546,6:6.35,4:7.9248,2:9.8552,1:10.9474,0:12.1666,"00":13.8684};function qu(t){let e=t==null?null:String(t).trim().toUpperCase().replace(/AWG$/,"").trim();return e!==null&&e in eo?{odMm:eo[e],assumed:!1}:{odMm:eo[Ae.defaultGaugeAwg],assumed:!0}}var Gs=(Math.sqrt(5)-1)/2,ev=60;function tv(t,e,r){let a=0;for(let s=0;s<3;s+=1){let n=t[s]<e[s]?e[s]-t[s]:t[s]>r[s]?t[s]-r[s]:0;a+=n*n}return a}function rv(t,e,r,a){let s=b=>tv([0,1,2].map(h=>t[h]+b*(e[h]-t[h])),r,a),n=0,i=1,o=i-Gs*(i-n),c=n+Gs*(i-n),l=s(o),f=s(c);for(let b=0;b<ev;b+=1)l<=f?([i,c,f]=[c,o,l],o=i-Gs*(i-n),l=s(o)):([n,o,l]=[o,c,f],c=n+Gs*(i-n),f=s(c));let[u,p]=l<=f?[o,l]:[c,f];for(let b of[0,1]){let h=s(b);h<p&&([u,p]=[b,h])}return[Math.sqrt(p),u]}function av(t,e){let r=[e[0]-t[12],e[1]-t[13],e[2]-t[14]];return[0,1,2].map(a=>t[a*4]*r[0]+t[a*4+1]*r[1]+t[a*4+2]*r[2])}function sv(t,e){let[r,a]=[t[e],t[e+1]],s=0;for(let n=0;n<3;n+=1)s+=(a[n]-r[n])*(a[n]-r[n]);return Math.sqrt(s)}function Wu(t,e){let r=t.length-1,a=0;for(let s=0;s<r;s+=1){let n=e?s:r-1-s;if(a>=Ae.bootMm)return s;a+=sv(t,n)}return r}function Xu(t,e){let r=Ae.boardCollisionMarginMm,a=e.map(n=>({board:n,lo:[0,1,2].map(i=>n.minMm[i]-r),hi:[0,1,2].map(i=>n.maxMm[i]+r)})),s=[];for(let n of t.curves){let i=n.diameterMm/2,o=n.samplesMm;if(i<=0||o.length<2)continue;let c=o.length-1,l=new Map,f=(b,h,d)=>{let x=l.get(b)??new Set;for(let g=h;g<d;g+=1)x.add(g);l.set(b,x)},u=t.ends[n.from];u&&f(u.occurrence,0,Wu(o,!0));let p=t.ends[n.to];p&&f(p.occurrence,c-Wu(o,!1),c);for(let{board:b,lo:h,hi:d}of a){let x=o.map(w=>av(b.matrix,w)),g=l.get(b.id),y=[],m=null;for(let w=0;w<c;w+=1){if(g?.has(w))continue;let[E,S]=rv(x[w],x[w+1],h,d);E<i&&(y.push(w),(!m||E<m[0])&&(m=[E,w,S]))}if(m){let[w,E,S]=m,[A,T]=[o[E],o[E+1]];s.push({segmentId:n.segmentId,board:b.id,distanceMm:w,radiusMm:i,atMm:[0,1,2].map(_=>A[_]+S*(T[_]-A[_])),spans:y})}}}return s}var nv=/_vertical(_|$)/i,iv=/_(horizontal|rightangle|right_angle|angled)(_|$)|_RA(_|$)/i,Yu=t=>t*Math.PI/180;function $u(t){let e=t.replace(/[0-9]+$/,""),r=t.slice(e.length);return[e,r?Number.parseInt(r,10):-1,t]}function ov(t,e){let[r,a,s]=$u(t),[n,i,o]=$u(e);return r!==n?r<n?-1:1:a!==i?a-i:s<o?-1:s>o?1:0}function ro(t,e){let r=Yu(t.rotationDeg),a=e[0]-t.positionMm[0],s=e[1]-t.positionMm[1];return[a*Math.cos(r)+s*Math.sin(r),-a*Math.sin(r)+s*Math.cos(r)]}function Ju(t,e){let r=Yu(t.rotationDeg);return[e[0]*Math.cos(r)-e[1]*Math.sin(r),e[0]*Math.sin(r)+e[1]*Math.cos(r),0]}function cv(t){return new Set(t.pads.map(e=>`${e.positionMm[0]},${e.positionMm[1]}`)).size}function Qu(t){let e=t.pads.filter(r=>r.pad);return e.length?e:t.pads}function Zu(t){let e=Qu(t),r=e.length;return[e.reduce((a,s)=>a+s.positionMm[0],0)/r,e.reduce((a,s)=>a+s.positionMm[1],0)/r]}function lv(t,e){let r=Math.atan2(e,t)*180/Math.PI,a=dv(r/90)*90;return Math.abs(r-a)>20?null:{0:"+x",90:"+y",180:"-x","-180":"-x","-90":"-y"}[String(a===0?0:a)]}function dv(t){let e=Math.floor(t),r=t-e;return r>.5?e+1:r<.5||e%2===0?e:e+1}function uv(t){let e=(d,x,...g)=>({axis:x==="low"?null:d,confidence:x,reasons:g});if(!t||cv(t)<2)return e(null,"low","too_few_pads");let r=t.side==="top"?"top":"bottom",a=t.footprintName??"",s=nv.test(a),n=iv.test(a),i=t.courtyard;if(!i)return s?e(r,"medium","name_vertical","no_courtyard"):e(null,"low","no_courtyard");let o=t.pads.map(d=>ro(t,d.positionMm)),c=o.map(([d])=>d),l=o.map(([,d])=>d),f=[c.reduce((d,x)=>d+x,0)/c.length,l.reduce((d,x)=>d+x,0)/l.length],u=[(i.minMm[0]+i.maxMm[0])/2,(i.minMm[1]+i.maxMm[1])/2],p=Math.min(...c)-1<=u[0]&&u[0]<=Math.max(...c)+1&&Math.min(...l)-1<=u[1]&&u[1]<=Math.max(...l)+1,b=[u[0]-f[0],u[1]-f[1]],h=!p&&Math.hypot(...b)>=.5?lv(...b):null;return s?p?e(r,"high","name_vertical","body_over_pads"):e(null,"low","name_vertical","name_conflicts_geometry"):n?h?e(h,"high","name_right_angle","body_off_pads"):e(null,"low","name_right_angle","name_conflicts_geometry"):p?e(r,"medium","body_over_pads"):h?e(h,"medium","body_off_pads"):e(null,"low","body_ambiguous")}function Ks(t){let e=Math.sqrt(t.reduce((r,a)=>r+a*a,0));return t.map(r=>r/e)}var fv=(t,e)=>[t[1]*e[2]-t[2]*e[1],t[2]*e[0]-t[0]*e[2],t[0]*e[1]-t[1]*e[0]],to=(t,e)=>t.reduce((r,a,s)=>r+a*e[s],0);function hv(t){let e=t.pads.filter(a=>a.pad),r=e.find(a=>a.pad==="1");return r||(e.length?[...e].sort((a,s)=>ov(a.pad,s.pad))[0]:t.pads[0])}function bv(t){let[e,r]=Zu(t),a=Qu(t),s=a.length,n=0,i=0,o=0;for(let b of a)n+=(b.positionMm[0]-e)**2,i+=(b.positionMm[1]-r)**2,o+=(b.positionMm[0]-e)*(b.positionMm[1]-r);n/=s,i/=s,o/=s;let c=(n+i)/2,l=n*i-o*o,f=Math.sqrt(Math.max(c*c-l,0)),u=c+f,p=c-f;return u<=1e-12||u-p<=.05*u?Ju(t,[1,0]):Math.abs(o)>1e-12?Ks([u-i,o,0]):n>=i?[1,0,0]:[0,1,0]}function pv(t,e){if(e==="top")return[0,0,1];if(e==="bottom")return[0,0,-1];let r=e[0]==="-"?-1:1;return Ks(Ju(t,e[1]==="x"?[r,0]:[0,r]))}function ao(t,e,r){let[a,s,n]=t,[i,o,c]=e,[l,f,u]=r,p=a+o+u,b;if(p>0){let d=Math.sqrt(p+1)*2;b=[(c-f)/d,(l-n)/d,(s-i)/d,.25*d]}else if(a>o&&a>u){let d=Math.sqrt(1+a-o-u)*2;b=[.25*d,(i+s)/d,(l+n)/d,(c-f)/d]}else if(o>u){let d=Math.sqrt(1+o-a-u)*2;b=[(i+s)/d,.25*d,(f+c)/d,(l-n)/d]}else{let d=Math.sqrt(1+u-a-o)*2;b=[(l+n)/d,(f+c)/d,.25*d,(s-i)/d]}return b=Ks(b),([b[3],b[0],b[1],b[2]].find(d=>Math.abs(d)>1e-12)??1)<0?b.map(d=>-d):b}function ha(t,e,r){if(!t||t.pads.length===0)return null;let a=r?r.axis:uv(t).axis;if(!a)return null;let s=r?((r.quarterTurns??0)%4+4)%4:0,[n,i]=Zu(t),o=(e??0)/2,c=[n,i,t.side==="top"?o:-o],l=pv(t,a),f=bv(t),u=to(f,l),p=[f[0]-u*l[0],f[1]-u*l[1],f[2]-u*l[2]];Math.sqrt(to(p,p))<1e-9&&(p=[-l[1],l[0],0]),p=Ks(p);let b=hv(t).positionMm;to([b[0]-n,b[1]-i,0],p)>1e-9&&(p=p.map(d=>-d));let h=fv(l,p);for(let d=0;d<s;d+=1)[p,h]=[h,p.map(x=>-x)];return{axis:a,quarterTurns:s,originMm:c,xAxis:p,yAxis:h,zAxis:l,rotation:ao(p,h,l)}}function xe(t){return Math.round(t*1e9)/1e9+0}function Vs(t){let e=Math.hypot(...t)||1,r=t.map(s=>s/e),a=[r[3],r[0],r[1],r[2]].find(s=>Math.abs(s)>1e-12)??1;return r.map(s=>xe(a<0?-s:s))}function ba(t,e){let[r,a,s,n]=t,i=a*e[2]-s*e[1],o=s*e[0]-r*e[2],c=r*e[1]-a*e[0];return[e[0]+2*(n*i+a*c-s*o),e[1]+2*(n*o+s*i-r*c),e[2]+2*(n*c+r*o-a*i)]}function gv(t,e){let[r,a,s,n]=t,[i,o,c,l]=e;return[n*i+r*l+a*c-s*o,n*o-r*c+a*l+s*i,n*c+r*o-a*i+s*l,n*l-r*i-a*o-s*c]}function ut(t,e){let r=ba(t.rotation,e.translationMm);return{translationMm:t.translationMm.map((a,s)=>xe(a+r[s])),rotation:Vs(gv(t.rotation,e.rotation))}}function so(t){let[e,r,a,s]=t.rotation,[n,i,o]=t.translationMm;return[1-2*(r*r+a*a),2*(e*r+a*s),2*(e*a-r*s),0,2*(e*r-a*s),1-2*(e*e+a*a),2*(r*a+e*s),0,2*(e*a+r*s),2*(r*a-e*s),1-2*(e*e+r*r),0,n,i,o,1].map(xe)}var ef=5;var Hs=Math.SQRT1_2,_T=[[0,0,0,1],[0,0,Hs,Hs],[0,0,1,0],[0,0,Hs,-Hs]];function mv(t,e){let r=[0,1,2].map(a=>e[a]-t.originMm[a]);return[t.xAxis,t.yAxis,t.zAxis].map(a=>r[0]*a[0]+r[1]*a[1]+r[2]*a[2])}function qs(t,e,r){let a,s;if(r)a=[...r.minMm],s=[...r.maxMm];else if(t.courtyard)a=[...t.courtyard.minMm,0],s=[...t.courtyard.maxMm,ef];else{let u=t.pads.map(p=>ro(t,p.positionMm));a=[Math.min(...u.map(p=>p[0])),Math.min(...u.map(p=>p[1])),0],s=[Math.max(...u.map(p=>p[0])),Math.max(...u.map(p=>p[1])),ef]}let n=t.rotationDeg*Math.PI/180,[i,o]=t.positionMm,c=(e??0)/2,l=t.side==="top",f=[];for(let u=0;u<8;u+=1){let[p,b,h]=[0,1,2].map(d=>(u>>d&1?s:a)[d]);f.push([i+p*Math.cos(n)-b*Math.sin(n),o+p*Math.sin(n)+b*Math.cos(n),l?c+h:-c-h])}return f}function Ws(t,e){let r=e.map(a=>mv(t,a));return[[0,1,2].map(a=>Math.min(...r.map(s=>s[a]))),[0,1,2].map(a=>Math.max(...r.map(s=>s[a])))]}var Xs=Math.SQRT1_2,yv=[[0,0,0,1],[0,0,Xs,Xs],[0,0,1,0],[0,0,Xs,-Xs]],xv=[1,0,0,0],$s=[0,0,0,1],vv=(t,e)=>{let r=e*Math.PI/360;return[t[0]*Math.sin(r),t[1]*Math.sin(r),t[2]*Math.sin(r),Math.cos(r)]};function no(t){if(!t)return{pose:{translationMm:[0,0,0],rotation:$s},scale:1};let[e,r,a]=(t.rotationDeg??[0,0,0]).map(Number),s=$s;for(let[i,o]of[[[0,0,1],a],[[0,1,0],r],[[1,0,0],e]])s=ut({translationMm:[0,0,0],rotation:s},{translationMm:[0,0,0],rotation:vv(i,o)}).rotation;return{pose:{translationMm:(t.offsetMm??[0,0,0]).map(Number),rotation:Vs(s)},scale:Number(t.scale??1)||1}}function wv(t){let e=t?.boundsMm;if(!e)return{exit:[0,0,-Ae.housingDepthMm],depth:Ae.housingDepthMm,modeled:!1};let{pose:r,scale:a}=no(t.alignment),s=[];for(let c=0;c<8;c+=1){let l=[0,1,2].map(u=>(c>>u&1?e.maxMm:e.minMm)[u]*a),f=ba(r.rotation,l);s.push([0,1,2].map(u=>f[u]+r.translationMm[u]))}let n=[0,1,2].map(c=>Math.min(...s.map(l=>l[c]))),i=[0,1,2].map(c=>Math.max(...s.map(l=>l[c]))),o=Math.min(n[2],0);return{exit:[(n[0]+i[0])/2,(n[1]+i[1])/2,o],depth:-o+0,modeled:!0}}function Mv(t,e=0,r){let a=yv[(e%4+4)%4],s=ut({translationMm:[0,0,0],rotation:xv},{translationMm:[0,0,0],rotation:a}),n=ut(t,s),{exit:i,depth:o,modeled:c}=wv(r),l=ut(n,{translationMm:i,rotation:$s}).translationMm,f=ba(n.rotation,[0,0,-1]),u=[0,1,2].map(p=>l[p]+Ae.bootMm*f[p]);return{pose:n,exitMm:l.map(xe),outward:f.map(xe),legMm:u.map(xe),depthMm:xe(o),modeled:c}}function tf(t,e,r,a,s=0,n,i){let o=ha(e,r,a);if(!o||!e)return null;let c=Math.max(Ws(o,qs(e,r,i))[1][2],0),l=ut(t,{translationMm:o.originMm,rotation:o.rotation});return l=ut(l,{translationMm:[0,0,c],rotation:$s}),{...Mv(l,s,n),matingPlaneMm:xe(c)}}function io(t,e){let r=new Array(16).fill(0);for(let a=0;a<4;a+=1)for(let s=0;s<4;s+=1){let n=0;for(let i=0;i<4;i+=1)n+=t[i*4+s]*e[a*4+i];r[a*4+s]=n}return r}var kv=(t,e)=>[e[0]-t[0],0,0,0,0,e[1]-t[1],0,0,0,0,e[2]-t[2],0,t[0],t[1],t[2],1];function Ev(t,e){let r=t.connector,a=r?ha(r.geometry,r.thicknessMm,r.stored):null;if(!r||!a)return null;let[s,n]=Ws(a,qs(r.geometry,r.thicknessMm));return[[s[0],-n[1],-e],[n[0],-s[1],0]]}function rf(t,e){let r=`${t.level||""}/${t.id}`,a=[];for(let s of[...t.ends].sort((n,i)=>n.ordinal-i.ordinal)){let n=e.ends[s.id];if(!n)continue;let i=so(n.pose),o={key:`${r}/${s.id}`,harness:r,end:s.id};if(s.housing?.boundsMm){let{pose:l,scale:f}=no(s.housing.alignment),u=io(so(l),[f,0,0,0,0,f,0,0,0,0,f,0,0,0,0,1]);a.push({...o,matrix:io(i,u),model:s.housing});continue}let c=Ev(s,n.depthMm);c&&a.push({...o,matrix:io(i,kv(...c)),model:null})}return a}var Sv=12,Tv=2,Av=1e-9,_r=(t,e)=>[t[0]-e[0],t[1]-e[1],t[2]-e[2]],Mt=(t,e)=>Math.sqrt((t[0]-e[0])**2+(t[1]-e[1])**2+(t[2]-e[2])**2);function Ir(t,e,r,a,s){if(a===r)return[t[0],t[1],t[2]];let n=(a-s)/(a-r),i=(s-r)/(a-r);return[n*t[0]+i*e[0],n*t[1]+i*e[1],n*t[2]+i*e[2]]}function Iv(t,e,r,a){let s=Ae.catmullRomAlpha,n=0,i=n+Mt(t,e)**s,o=i+Mt(e,r)**s,c=o+Mt(r,a)**s;return l=>{let f=i+l*(o-i),u=Ir(t,e,n,i,f),p=Ir(e,r,i,o,f),b=Ir(r,a,o,c,f),h=Ir(u,p,n,o,f),d=Ir(p,b,i,c,f);return Ir(h,d,i,o,f)}}function _v(t,e,r){let a=_r(r,e),s=_r(t,e),n=Math.sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2]);if(n<1e-12)return Mt(t,e);let i=[a[1]*s[2]-a[2]*s[1],a[2]*s[0]-a[0]*s[2],a[0]*s[1]-a[1]*s[0]];return Math.sqrt(i[0]*i[0]+i[1]*i[1]+i[2]*i[2])/n}function af(t){let e=o=>[o[0],o[1],o[2]];if(t.length<2)return{samples:t.map(e),spans:t.map(()=>0)};let r=t[0],a=t[t.length-1],s=[_r([2*r[0],2*r[1],2*r[2]],t[1]),...t,_r([2*a[0],2*a[1],2*a[2]],t[t.length-2])],n=[e(r)],i=[0];for(let o=0;o<t.length-1;o+=1){let c=Iv(s[o],s[o+1],s[o+2],s[o+3]),l=(f,u,p,b,h)=>{let d=(f+u)/2,x=c(d);h<Tv||h<Sv&&_v(x,p,b)>Ae.chordErrorMm?(l(f,d,p,x,h+1),l(d,u,x,b,h+1)):(n.push(b),i.push(o))};l(0,1,e(t[o]),e(t[o+1]),0)}return{samples:n,spans:i}}function Rv(t,e,r){let a=Mt(t,e),s=Mt(e,r),n=Mt(r,t),i=_r(e,t),o=_r(r,t),c=[i[1]*o[2]-i[2]*o[1],i[2]*o[0]-i[0]*o[2],i[0]*o[1]-i[1]*o[0]],l=Math.sqrt(c[0]*c[0]+c[1]*c[1]+c[2]*c[2]);return l<1e-12?Number.POSITIVE_INFINITY:a*s*n/(2*l)}function sf(t){let e=Number.POSITIVE_INFINITY,r=-1;for(let a=1;a<t.length-1;a+=1){let s=Rv(t[a-1],t[a],t[a+1]);s<e&&(e=s,r=a)}return{radius:e,at:r}}function Nv(t,e,r){let a=[],s=[];t.forEach((p,b)=>{if(a.length&&Mt(a[a.length-1],p)<Av){s[s.length-1]=s[s.length-1]&&e[b];return}a.push([p[0],p[1],p[2]]),s.push(!!e[b])});let n=Ae.minBendRadiusFactor*r,{samples:i,spans:o}=af(a),{radius:c,at:l}=sf(i);for(let p=0;p<Ae.bendRelaxIterations&&!(c>=n||l<0);p+=1){let b=o[l],h=[];for(let y=1;y<a.length-1;y+=1)s[y]&&h.push(y);if(!h.length)break;let d=y=>Math.min(Math.abs(y-b),Math.abs(y-(b+1))),x=h[0];for(let y of h)d(y)<d(x)&&(x=y);let g=[0,1,2].map(y=>(a[x-1][y]+a[x+1][y])/2);a[x]=[0,1,2].map(y=>(a[x][y]+g[y])/2),{samples:i,spans:o}=af(a),{radius:c,at:l}=sf(i)}let f=0;for(let p=0;p+1<i.length;p+=1)f+=Mt(i[p],i[p+1]);let u=p=>p.map(xe);return{controlMm:a.map(u),samplesMm:i.map(u),lengthMm:xe(f),minRadiusMm:Number.isFinite(c)?xe(c):null,minRadiusAllowedMm:xe(n),tightBend:l>=0&&c<n?{atMm:u(i[l]),radiusMm:xe(c)}:null}}function Cv(t){let e=Ae.bootMm/2,{exitMm:r,outward:a,legMm:s}=t;return[[r[0],r[1],r[2]],[r[0]+e*a[0],r[1]+e*a[1],r[2]+e*a[2]],[s[0],s[1],s[2]],[s[0]+e*a[0],s[1]+e*a[1],s[2]+e*a[2]]]}function nf(t,e,r={},a={}){let s=new Map(e.nodes.map(n=>[n.id,n.positionMm]));return e.segments.map(n=>{let i=b=>b in t?Cv(t[b]):[[...s.get(b)]],o=i(n.from),c=i(n.to),l=(r[n.id]??[]).map(b=>[b[0],b[1],b[2]]),f=[...o,...l,...c.reverse()],u=a[n.id]??[],p=[...o.map(()=>!1),...l.map((b,h)=>!u[h]),...c.map(()=>!1)];return{segmentId:n.id,...Nv(f,p,n.diameterMm)}})}var of=t=>[t[0],t[1],t[2]];function cf(t,e){return t.filter(r=>r.kind===e).sort((r,a)=>r.order-a.order||(r.id<a.id?-1:r.id>a.id?1:0))}function lf(t){return cf(t,"breakout").map(e=>({id:e.id,positionMm:of(e.positionMm),ends:[...e.ends??[]]}))}function df(t,e){let r=(i,o)=>i<o?`${i}
${o}`:`${o}
${i}`,a=new Map;for(let i of cf(e,"waypoint")){let[o,c]=i.between??[],l=r(o,c),f=a.get(l);f?f.push(i):a.set(l,[i])}let s={waypoints:{},pinned:{},unused:[]},n=new Set;for(let i of t.segments){let o=r(i.from,i.to),c=a.get(o);c&&(n.add(o),c[0].between?.[0]!==i.from&&(c=[...c].reverse()),s.waypoints[i.id]=c.map(l=>of(l.positionMm)),s.pinned[i.id]=c.map(l=>!!l.pinned))}for(let[i,o]of a)n.has(i)||s.unused.push(...o.map(c=>c.id));return s.unused.sort(),s}var uf=(t,e)=>Math.hypot(t[0]-e[0],t[1]-e[1],t[2]-e[2]);function Bv(t){if(!t.length)return{diameterMm:0,assumedGauge:!1};let e=0,r=!1;for(let a of t){let{odMm:s,assumed:n}=qu(a.gaugeAwg);e+=s*s,r=r||n}return{diameterMm:xe(Ae.packingFactor*Math.sqrt(e)),assumedGauge:r}}function Fv(t,e){let r=t.map(o=>Math.max(e.get(o.id)??0,0));r.every(o=>o===0)&&(r=t.map(()=>1));let a=r.reduce((o,c)=>o+c,0),s=[0,1,2].map(o=>t.reduce((c,l,f)=>c+r[f]*l.legMm[o],0)/a),n=[0,1,2].map(o=>t.reduce((c,l)=>c+l.outward[o],0)/t.length),i=Math.hypot(...n);return i<1e-9?s:[0,1,2].map(o=>s[o]+Ae.breakoutLiftMm*n[o]/i)}function ff(t,e,r=[]){let a=new Map(t.map(b=>[b.id,b])),s=[],n=[];for(let b of e)a.has(b.from.end)&&a.has(b.to.end)?s.push(b):n.push(b.id);let i=new Map;for(let b of s)for(let h of[b.from.end,b.to.end])i.set(h,(i.get(h)??0)+1);let o=b=>b.map(xe),c=t.map(b=>({id:b.id,kind:"end",positionMm:o(b.legMm)})),l=[];if(r.length){for(let h of r)c.push({id:h.id,kind:"breakout",positionMm:o(h.positionMm)});let b=new Map;for(let h of r)for(let d of h.ends??[])a.has(d)&&!b.has(d)&&b.set(d,h.id);for(let h of t){let d=b.get(h.id);if(d===void 0){let x=r[0];for(let g of r)uf(g.positionMm,h.legMm)<uf(x.positionMm,h.legMm)&&(x=g);d=x.id}l.push([h.id,d])}for(let h=0;h+1<r.length;h+=1)l.push([r[h].id,r[h+1].id])}else if(t.length===2)l.push([t[0].id,t[1].id]);else if(t.length>2){c.push({id:"auto",kind:"breakout",positionMm:o(Fv(t,i))});for(let b of t)l.push([b.id,"auto"])}let f=new Map(c.map(b=>[b.id,[]]));for(let[b,h]of l)f.get(b).push(h),f.get(h).push(b);let u=(b,h)=>{let d=new Set([b]),x=[b];for(;x.length;){let g=x.pop();for(let y of f.get(g))g===h[0]&&y===h[1]||g===h[1]&&y===h[0]||d.has(y)||(d.add(y),x.push(y))}return d},p=l.map(([b,h])=>{let d=u(b,[b,h]),x=s.filter(g=>d.has(g.from.end)!==d.has(g.to.end));return{id:`${b}~${h}`,from:b,to:h,wires:x.map(g=>g.id),...Bv(x)}});return{nodes:c,segments:p,unplaced:n}}var Ov=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];function oo(t){return{translationMm:[t[12],t[13],t[14]],rotation:ao([t[0],t[1],t[2]],[t[4],t[5],t[6]],[t[8],t[9],t[10]])}}function Pv(t,e){return[0,1,2].map(r=>t[r]*e[0]+t[4+r]*e[1]+t[8+r]*e[2]+t[12+r])}function hf(t,e){let r={};for(let u of[...t.ends].sort((p,b)=>p.ordinal-b.ordinal)){let p=u.occurrence?e(u.occurrence):null;if(!p||!u.connector||!u.occurrence)continue;let b=u.connector.inOccurrence?ut(oo(p),u.connector.inOccurrence):oo(p),h=tf(b,u.connector.geometry,u.connector.thicknessMm,u.connector.stored,0,u.housing);h&&(r[u.id]={...h,occurrence:u.occurrence})}if(Object.keys(r).length<2)return null;let a=Object.entries(r).map(([u,p])=>({id:u,legMm:p.legMm,outward:p.outward})),s=t.wires.map(u=>({id:u.id,from:{end:u.from},to:{end:u.to},gaugeAwg:u.gaugeAwg??null})),n=t.level?e(t.level):Ov,i=n?(t.nodes??[]).map(u=>({...u,positionMm:Pv(n,u.positionMm)})):[],o=ff(a,s,lf(i)),c=df(o,i),l=new Map(o.segments.map(u=>[u.id,u])),f=nf(r,o,c.waypoints,c.pinned).map(u=>{let p=l.get(u.segmentId);return{...u,from:p.from,to:p.to,wires:[...p.wires],diameterMm:p.diameterMm,assumedGauge:p.assumedGauge}});return{ends:r,tree:o,curves:f,unused:c.unused,unplaced:o.unplaced,wires:t.wires.map(u=>({id:u.id,from:u.from,to:u.to}))}}function bf(t,e,r=[]){let a=[],s=[];for(let n of t){let i=hf(n,e);if(!i)continue;s.push(...rf(n,i));let o=new Map;for(let c of r.length?Xu(i,r):[])o.set(c.segmentId,[...o.get(c.segmentId)??[],c.board]);for(let c of i.curves)c.diameterMm<=0||a.push({harness:`${n.level||""}/${n.id}`,segmentId:c.segmentId,from:c.from,to:c.to,samplesMm:c.samplesMm.flat(),radiusMm:c.diameterMm/2,wires:c.wires,tightBend:c.tightBend!==null,assumedGauge:c.assumedGauge,collides:o.get(c.segmentId)??[]})}return{tubes:a,housings:s}}var Ys=Object.freeze({restricted:{color:[.55,.57,.6,1],label:"Restricted"},loading:{color:[.7,.76,.82,1],label:"Loading\u2026"},building:{color:[.62,.72,.84,1],label:"Building 3D view\u2026"},missing:{color:[.78,.76,.7,1],label:"No 3D view"},failed:{color:[.86,.6,.56,1],label:"3D view failed"},unknown:{color:[.78,.76,.7,1],label:""}}),pf=Object.freeze([.001,0,0,0,0,.001,0,0,0,0,.001,0,0,0,0,1]);function pa(t,e){let r=new Array(16);for(let a=0;a<4;a+=1)for(let s=0;s<4;s+=1)r[a*4+s]=t[s]*e[a*4]+t[4+s]*e[a*4+1]+t[8+s]*e[a*4+2]+t[12+s]*e[a*4+3];return r}function jv([t,e,r]){return[1,0,0,0,0,1,0,0,0,0,1,0,t,e,r,1]}function Lv([t,e,r]){return[t,0,0,0,0,e,0,0,0,0,r,0,0,0,0,1]}function Js(t,e){return pa(pf,pa(t,e))}function ga(t,e){let r=e.minMm,a=e.maxMm.map((s,n)=>Math.max(s-r[n],.2));return pa(pf,pa(t,pa(jv(r),Lv(a))))}function gf(t,e,r){return t.restricted?"restricted":!t.assetId||!e?"missing":r==="loaded"?null:r==="failed"?"failed":e.status==="ready"?e.bundleUrl&&e.bundleToBoard?"loading":"building":Ys[e.status]?e.status:"unknown"}function co(t){return!!(t&&t.status==="ready"&&t.bundleUrl&&t.bundleToBoard)}function mf(t,e){return!t||t.bundleUrl!==e.bundleUrl||t.loadState==="failed"?"create":t.loadState==="waiting"&&co(e)?"load":"keep"}function yf(t){return(t?.occurrences||[]).filter(e=>e.kind==="board"||e.restricted||e.model||e.box)}function xf(t){return`box:${t.map(e=>Number(e).toFixed(3)).join(",")}`}function vf(t){if(!t.length)return!1;let e=0;for(let r of t)if(!r.standIn)e+=1;else if(r.standIn==="loading")return!1;return e>0}function Mf(t,e,r=0){return[t/1e3,-e/1e3,r]}function Dv({rotation:t=0,mirror:e=!1,tilt:r=0}){let a=e?[-1,0,0]:[1,0,0],s=[0,1,0],n=e?[0,0,-1]:[0,0,1],i=Math.cos(t),o=Math.sin(t),c=a.map((h,d)=>i*h+o*s[d]),l=s.map((h,d)=>-o*a[d]+i*h),f=Math.cos(r),u=Math.sin(r),p=n.map((h,d)=>f*h-u*l[d]),b=l.map((h,d)=>u*n[d]+f*h);return{right:c,up:b,back:p}}function uo(t,e,r,a,s=0){let{up:n,back:i}=Dv(t),o=Mf(t.center[0],t.center[1],s),c=a*3,l=o.map((p,b)=>p+i[b]*c),f=1/(t.zoom*1e3),u=Ja(e*f,r*f,-a*40,a*40);return ar(u,Ya(l,o,n))}function Uv(t,e,r,a){let[s,n,i]=a,o=t[0]*s+t[4]*n+t[8]*i+t[12],c=t[1]*s+t[5]*n+t[9]*i+t[13],l=t[3]*s+t[7]*n+t[11]*i+t[15];return l>0?[(o/l+1)/2*e,(1-c/l)/2*r]:null}function ma(t){let e=t[0]*1e3,r=t[3]*1e3,a=-t[4]*1e3,s=-t[1]*1e3;return{box:{x:e,y:a,w:r-e,h:s-a},bottom:t[2]+t[5]<0}}function fo(t,e){return t?e?t[2]:t[5]:0}function kf(t,e,r,a,s){let n=_t(t),i=uo(e,r,a,n,e.focusZ??0);return Uv(i,r,a,Mf(s[0],s[1],e.focusZ??0))}var zv=([t,e,r,a])=>({x:Math.min(t,r),y:Math.min(e,a),w:Math.abs(r-t),h:Math.abs(a-e)}),lo=t=>[t.x+t.w/2,t.y+t.h/2],wf=new WeakMap;function Gv(t,e){let r=wf.get(t);if(r)return r;let a=new Map,s=new Map;for(let c of t.features.values()){if(c.sourceUid&&a.set(String(c.sourceUid),c),c.kind!=="pad")continue;let l=/^(.*):pad:\d+:(.+)$/.exec(String(c.sourceUid||""));if(!l)continue;let f=`${l[1]}\0${l[2]}`;s.has(f)||s.set(f,[]),s.get(f).push(c)}let n=new Map;for(let c of e?.physical_objects||[])c.kind==="footprint_body"&&c.designator&&c.bbox_mm?.length===4&&n.set(c.designator,c);let i=new Map((e?.physical_objects||[]).map(c=>[c.uid,c])),o={bySource:a,padsByFootprintPin:s,bodies:n,objects:i};return wf.set(t,o),o}function Ef({scene:t,topology:e},r,a){let s=String(r),n=t.componentFeatures.get(s);if(!n)return null;let i=Gv(t,e),o=t.features.get(Number(n.featureId)),c=i.bodies.get(s),l=o?.bounds?ma(o.bounds).box:c?zv(c.bbox_mm.map(Number)):null,f=o?.bounds?ma(o.bounds).bottom:String(c?.layer||"").startsWith("B."),u=null;if(a!=null&&a!==""){let b=(e?.terminals||[]).find(d=>d.designator===s&&String(d.pin)===String(a)),h=b?.pcb_pad_id?i.objects.get(b.pcb_pad_id):null;if(u=h?.source_ids?.[0]&&i.bySource.get(String(h.source_ids[0]))||null,!u){let d=i.padsByFootprintPin.get(`${n.footprint}\0${a}`)||[],x=l?lo(l):null,g=1/0;for(let y of d){let m=lo(ma(y.bounds).box),w=x?Math.hypot(m[0]-x[0],m[1]-x[1]):0;w<g&&([g,u]=[w,y])}}}let p=u?.bounds?ma(u.bounds).box:null;return!l&&p&&(l=p,f=ma(u.bounds).bottom),l?{reference:s,pin:u?String(a):null,focus:l,anchor:lo(p||l),anchorBox:p,bottom:f,surfaceZ:fo(t.runtimeBounds,f)}:null}var Qs=class{#e=new Map;constructor(e=3e3){this.ttlMs=e}get size(){return this.#e.size}record(e,r,a){this.#e.set(e,{matrix:r,at:a})}release(e){this.#e.delete(e)}clear(){this.#e.clear()}active(e){let r=[];for(let[a,s]of this.#e)e-s.at>this.ttlMs?this.#e.delete(a):r.push(s.matrix);return r}};var rn=1.5*1024*1024*1024;function ho(t){let e=Number(t);return Number.isFinite(e)&&e>0?e:rn}function Sf(t,e){if(e.netName||e.netUid){let r=e.netUid&&t.find(a=>a.uid===e.netUid)||e.netName&&sr(t,e.netName);return r?{kind:"net",id:Number(r.id)}:{kind:"unresolved"}}return e.netId?{kind:"net",id:Number(e.netId)}:e.featureId?{kind:"feature",id:Number(e.featureId)}:e.reference?{kind:"component",reference:String(e.reference)}:{kind:"board"}}function Tf(t,e){if(e.kind==="net")t.selectNet(e.id,!0);else if(e.kind==="feature")t.selectFeature(e.id,!0);else if(e.kind==="component")t.selectComponent(e.reference,!0);else return!1;return!0}function Af(t,e){return e&&!t?"enter":!e&&t?"leave":null}function Kv(t){return(Array.isArray(t)?t:[]).map((e,r)=>{let a=Uc(e?.color??ai[r%ai.length]);return{key:String(e?.key??r),mark:a,color:`#${(a&16777215).toString(16).padStart(6,"0")}`,members:(Array.isArray(e?.members)?e.members:[]).filter(s=>s&&typeof s.occurrence=="string"&&typeof s.net=="string"),wires:(Array.isArray(e?.wires)?e.wires:[]).filter(s=>s&&typeof s.harness=="string"&&typeof s.wire=="string")}})}function bo(){return{selection:null,gpuBudget:null}}var Vv=Object.freeze(["setSelection","resize","getViewState","setLayerVisible","applyLayerPreset","setShowBoard","setShowComponents","setShowPlaceholders","setRealisticColors","setBoardLayerVisible","setSeparation","showNetLayers","setNetIsolation","setStatsOverlay","getStats","setLodOverride","setGpuBudget","pickAt","projectComponent","projectPoint"]),Zs=class{#e=null;constructor(e=bo()){this.shared=e}get port(){return this.#e}attach(e){if(!e)throw new TypeError("A mode controller attaches to a mounted scene port");this.detach(),this.#e=e,this.replay(e)}detach(){let e=this.#e;this.#e=null,this.release(),e?.dispose?.()}replay(){}release(){}setSelection(e){this.shared.selection=e||null;let r=this.#e;r&&r.quietly(()=>this.applySelection(r,this.shared.selection))}setGpuBudget(e){this.shared.gpuBudget=e,this.#e?.setGpuBudget(ho(e))}resize(){this.#e?.resize()}getViewState(){return this.#e?.getViewState()??null}setLayerVisible(e,r,a=null){this.#e?.setLayerVisible(e,r,a)}applyLayerPreset(e,r=null){this.#e?.applyLayerPreset(e,r)}setShowBoard(e){this.#e?.setShowBoard(e)}setShowComponents(e){this.#e?.setShowComponents(e)}setShowPlaceholders(e){this.#e?.setShowPlaceholders(e)}setRealisticColors(e){this.#e?.setRealisticColors(e)}setBoardLayerVisible(e,r,a){this.#e?.setBoardLayerVisible(e,r,a)}setSeparation(e,r=null){this.#e?.setSeparation(e,r)}showNetLayers(){this.#e?.showNetLayers()}setNetIsolation(e){this.#e?.setNetIsolation(e)}setStatsOverlay(e){this.#e?.setStatsOverlay(e)}getStats(){return this.#e?.stats()??null}setLodOverride(e){this.#e?.setLodOverride(e)}pickAt(e,r){return Promise.resolve(this.#e?.pickAt(e,r)??null)}projectComponent(e,r){return this.#e?.projectComponent(e,r)??null}projectPoint(e,r){return this.#e?.projectPoint(e,r)??null}},Hv=Object.freeze(["setHighlightedNets","setHiddenComponents","getComponentReferences","setViewMode","renderInset","insetReady","insetSurfaceZ","releaseInset","insetTarget","projectInset","onSceneChange","insetStats","insetSettings","gpuIdle","loadAnalyticPack","setAnalyticOverlay","setAnalyticVectors","setAnalyticStyle","analyticColormaps","setAnalyticRelief","setClickSelect","analyticProbe","analyticAt","analyticStats","unloadAnalyticPack"]),en=class extends Zs{#e=[];#r=null;#a="pcb";#s=new Set;#n=null;#t=null;#o=!0;#i=null;attach(e,{workspace:r="pcb"}={}){this.#a=r,super.attach(e)}replay(e){this.#n=e.onSceneChange?.(()=>this.#l())??null,this.#l(),e.setWorkspace(this.#a),this.#r&&e.setHiddenComponents(this.#r),this.shared.gpuBudget!=null&&e.setGpuBudget(ho(this.shared.gpuBudget)),this.shared.selection&&e.quietly(()=>this.applySelection(e,this.shared.selection)),this.#e.length&&this.#c(e,this.#e),this.#t&&this.#d(e,this.#t),this.#o||e.setClickSelect(!1)}async#d(e,r){await e.loadAnalyticPack(r.bytes,r.options),r.overlay&&e.setAnalyticOverlay(r.overlay),this.#i&&e.setAnalyticRelief(this.#i),r.style&&e.setAnalyticStyle(r.style),r.vectors&&e.setAnalyticVectors(r.vectors)}release(){this.#n?.(),this.#n=null}applySelection(e,r){r?.occurrence!=null&&e.selectOccurrence(r.occurrence),r?Tf(e,Sf(e.nets(),r)):e.clearSelection()}setWorkspace(e){this.#a=e,this.port?.setWorkspace(e)}setHighlightedNets(e){this.#e=Array.isArray(e)?[...e]:[];let r=this.port;r&&this.#c(r,this.#e)}#c(e,r){let a=Lc(e.nets(),r),s=e.anyEmphasis();e.setHighlightedNetIds(a);let n=e.anyEmphasis(),i=Af(s,n);i==="enter"?e.showNetProbe():i==="leave"&&e.restoreVisibility(),e.isolating()&&n&&e.isolateLitNets(),e.refreshResidency()}setHiddenComponents(e){this.#r=Array.isArray(e)?[...e]:[],this.port?.setHiddenComponents(this.#r)}getComponentReferences(){return this.port?.getComponentReferences()??[]}setViewMode(e){this.port?.setViewMode(e)}renderInset(e,r,a){return!!this.port?.renderInset(e,r,a)}insetReady(){return!!this.port?.insetReady()}insetSurfaceZ(e){let r=this.port;return r?fo(r.insetBoard().scene.runtimeBounds,!!e):0}releaseInset(e){this.port?.releaseInset(String(e))}insetTarget(e,r){let a=this.port;return a?Ef(a.insetBoard(),e,r):null}projectInset(e,r,a,s){let n=this.port;return n?kf(n.insetBoard().scene.runtimeBounds,e,r,a,s):null}onSceneChange(e){return this.#s.add(e),()=>this.#s.delete(e)}#l(){for(let e of this.#s)e()}insetStats(){return this.port?.insetStats()??null}insetSettings(e){return this.port?.insetSettings(e)??null}gpuIdle(){return this.port?.gpuIdle()??Promise.resolve()}async loadAnalyticPack(e,r={}){let a=e instanceof Uint8Array?e:new Uint8Array(e);return this.#t={bytes:a,options:r,overlay:null,vectors:null,style:this.#t?.style??null},this.port?this.port.loadAnalyticPack(a,r):null}setAnalyticOverlay(e){return this.#t&&(this.#t.overlay=e),this.port?.setAnalyticOverlay(e)??null}setAnalyticVectors(e){return this.#t&&(this.#t.vectors=e),this.port?.setAnalyticVectors(e)??null}setAnalyticStyle(e){return this.#t&&(this.#t.style={...this.#t.style||{},...e}),this.port?.setAnalyticStyle(e)??null}analyticColormaps(){return this.port?.analyticColormaps()??null}setAnalyticRelief(e){return this.#i=e||null,this.port?.setAnalyticRelief(this.#i)??null}setClickSelect(e){this.#o=e!==!1,this.port?.setClickSelect(this.#o)}analyticProbe(e,r){return this.port?.analyticProbe(e,r)??null}analyticAt(e,r){return this.port?.analyticAt(e,r)??Promise.resolve(null)}analyticStats(){return this.port?.analyticStats()??null}unloadAnalyticPack(){this.#t=null,this.port?.unloadAnalyticPack()}},qv=Object.freeze(["setSystemScene","setNetEmphasis","frameNetEmphasis","frameAll","frameBoard","frameParts","setMoveMode","setRouteMode","setMoveSpace","previewPose","cancelMove","getMoveState","targetHarnessNode","selectHarness","previewHarnessNode","cancelHarnessNode","getHarnessState","setLabelsVisible","setHarnessesVisible","setHelpVisible","isHelpVisible","setLodThresholds","pickSurfaceAt","focusMoveTarget","viewAxis"]),tn=class extends Zs{#e=null;#r=null;#a=null;#s=!1;attach(e,{moveAllowed:r=!1}={}){this.#s=!!r,super.attach(e)}replay(e){this.shared.gpuBudget!=null&&e.setGpuBudget(ho(this.shared.gpuBudget)),this.#e&&e.setSystemScene(this.#e),this.#r&&this.#n(e,this.#r),e.setMoveAllowed(this.#s),this.#a!=null&&e.setLabelsVisible(this.#a)}applySelection(e,r){if(!r){e.clearSelection();return}if(e.focusPlacement(r.occurrence)!=="board")return;let a=Sf(e.nets(),r);a.kind==="board"?e.selectBoardContext():Tf(e,a)}setSystemScene(e){this.#e=e||null,e&&this.port?.setSystemScene(e)}setNetEmphasis(e){this.#r=Array.isArray(e)?e:[];let r=this.port;return r?this.#n(r,this.#r):[]}#n(e,r){let a=e.anyEmphasis(),s=e.setEmphasisSets(Kv(r));if(!s)return[];let n=e.anyEmphasis(),i=Af(a,n);return i==="enter"?e.showNetProbe():i==="leave"&&(e.isolating()&&e.setNetIsolation(!1),e.restoreVisibility()),e.isolating()&&n&&e.isolateLitNets(),s}frameNetEmphasis(e=null,r=null){return this.port?.frameNetEmphasis(e,r)??!1}frameAll(){this.port?.frameAll()}frameBoard(e){return this.port?.frameBoard(e)??!1}frameParts(e){return this.port?.frameParts(e)??!1}setMoveAllowed(e){this.#s=!!e,this.port?.setMoveAllowed(this.#s)}setMoveMode(e,r){this.port?.setMoveMode(e,r)}setRouteMode(e){this.port?.setMoveMode(e,{route:!0})}setMoveSpace(e){this.port?.setMoveSpace(e)}previewPose(e){this.port?.previewPose(e)}cancelMove(){this.port?.cancelMove()}getMoveState(){return this.port?.getMoveState()??null}targetHarnessNode(e){this.port?.targetHarnessNode(e)}selectHarness(e){return this.port?.selectHarness(e)??!1}previewHarnessNode(e){this.port?.previewHarnessNode(e)}cancelHarnessNode(){this.port?.cancelHarnessNode()}getHarnessState(){return this.port?.getHarnessState()??null}setLabelsVisible(e){this.#a=!!e,this.port?.setLabelsVisible(this.#a)}setHarnessesVisible(e){this.port?.setHarnessesVisible(!!e)}setHelpVisible(e){this.port?.setHelpVisible(e)}isHelpVisible(){return!!this.port?.isHelpVisible()}setLodThresholds(e){return this.port?.setLodThresholds(e)??null}pickSurfaceAt(e,r){return this.port?.pickSurfaceAt(e,r)??null}focusMoveTarget(e){return!!this.port?.focusMoveTarget(e)}viewAxis(e,r=!1){this.port?.viewAxis(e,r)}};function If(t){let e=(r,a)=>{for(let s of r)Object.defineProperty(t,s,{configurable:!0,writable:!0,value(...n){return a(this)[s](...n)}})};e(Vv,r=>r.activeMode),e(Hv,r=>r.modes.board),e(qv,r=>r.modes.system)}var go=Object.freeze({viridis:["#440154","#482878","#3e4989","#31688e","#26828e","#1f9e89","#35b779","#6ece58","#b5de2b","#fde725"],inferno:["#000004","#1b0c41","#4a0c6b","#781c6d","#a52c60","#cf4446","#ed6925","#fb9b06","#f7d13d","#fcffa4"],magma:["#000004","#180f3d","#440f76","#721f81","#9e2f7f","#cd4071","#f1605d","#fd9668","#feca8d","#fcfdbf"],plasma:["#0d0887","#46039f","#7201a8","#9c179e","#bd3786","#d8576b","#ed7953","#fb9f3a","#fdca26","#f0f921"],cividis:["#00224e","#123570","#3b496c","#575d6d","#707173","#8a8678","#a59c74","#c3b369","#e1cc55","#fee838"],turbo:["#30123b","#4662d7","#36aaf9","#1ae4b6","#72fe5e","#c8ef34","#faba39","#f66b19","#ca2a04","#7a0403"],coolwarm:["#3b4cc0","#6788ee","#9abbff","#c9d7f0","#edd1c2","#f7a889","#e26952","#b40426"],ember:["#e0e3ed","#ff9e1f","#db141a"],ice:["#f4f7fb","#9ecae1","#2171b5","#08306b"],white:["#fafaf5","#fafaf5"],greys:["#f7f7f7","#bdbdbd","#737373","#252525"]}),Rr=256,ya=Object.freeze({fieldColormap:"viridis",arrowColormap:"ember",arrowDensity:70,arrowWidth:.07,arrowMinLength:.3,arrowOutline:[.05,.05,.07,.85]});function _f(t){let e=String(t).replace(/^#/,"");if(!/^[0-9a-fA-F]{6}$/.test(e))throw new TypeError(`colour ${t} is not #rrggbb`);return[0,2,4].map(r=>Number.parseInt(e.slice(r,r+2),16)/255)}function po(t){if(Array.isArray(t)){if(t.length<2)throw new TypeError("a colormap needs two or more stops");return t.forEach(_f),[...t]}let e=go[t];if(!e)throw new TypeError(`unknown colormap ${t}`);return[...e]}function mo(t,e=Rr){let r=po(t).map(_f),a=new Float32Array(e*4);for(let s=0;s<e;s++){let n=s/(e-1)*(r.length-1),i=Math.min(r.length-2,Math.floor(n)),o=n-i;for(let c=0;c<3;c++)a[s*4+c]=r[i][c]*(1-o)+r[i+1][c]*o;a[s*4+3]=1}return a}function yo(t={},e=ya){let r={...e,...t||{}};po(r.fieldColormap),po(r.arrowColormap);let a=(s,n)=>{if(!(Number(r[s])>0&&Number(r[s])<=n))throw new RangeError(`${s} must be in (0, ${n}]`);r[s]=Number(r[s])};if(a("arrowDensity",400),a("arrowWidth",.5),a("arrowMinLength",1),!Array.isArray(r.arrowOutline)||r.arrowOutline.length!==4)throw new TypeError("arrowOutline is [r, g, b, a]");return r}var Nr=class{__destroy_into_raw(){let e=this.__wbg_ptr;return this.__wbg_ptr=0,Rf.unregister(this),e}free(){let e=this.__destroy_into_raw();z.__wbg_analyticpack_free(e,0)}barrelRecords(){let e=z.analyticpack_barrelRecords(this.__wbg_ptr);return Ea.__wrap(e)}bindingJson(e){let r,a;try{let i=z.analyticpack_bindingJson(this.__wbg_ptr,e);var s=i[0],n=i[1];if(i[3])throw s=0,n=0,an(i[2]);return r=s,a=n,Ta(s,n)}finally{z.__wbindgen_free(r,a,1)}}headerJson(){let e,r;try{let n=z.analyticpack_headerJson(this.__wbg_ptr);var a=n[0],s=n[1];if(n[3])throw a=0,s=0,an(n[2]);return e=a,r=s,Ta(a,s)}finally{z.__wbindgen_free(e,r,1)}}lowerSlice(e,r){let a=Jv(e,z.__wbindgen_malloc,z.__wbindgen_realloc),s=Aa,n=z.analyticpack_lowerSlice(this.__wbg_ptr,a,s,r);if(n[2])throw an(n[1]);return Sa.__wrap(n[0])}constructor(e){let r=Yv(e,z.__wbindgen_malloc),a=Aa,s=z.analyticpack_new(r,a);if(s[2])throw an(s[1]);return this.__wbg_ptr=s[0],Rf.register(this,this.__wbg_ptr,this),this}};Symbol.dispose&&(Nr.prototype[Symbol.dispose]=Nr.prototype.free);var Ea=class t{static __wrap(e){let r=Object.create(t.prototype);return r.__wbg_ptr=e,Nf.register(r,r.__wbg_ptr,r),r}__destroy_into_raw(){let e=this.__wbg_ptr;return this.__wbg_ptr=0,Nf.unregister(this),e}free(){let e=this.__destroy_into_raw();z.__wbg_barrelrecords_free(e,0)}floats(){let e=z.barrelrecords_floats(this.__wbg_ptr);var r=sn(e[0],e[1]).slice();return z.__wbindgen_free(e[0],e[1]*4,4),r}skipped(){return z.barrelrecords_skipped(this.__wbg_ptr)>>>0}words(){let e=z.barrelrecords_words(this.__wbg_ptr);var r=kt(e[0],e[1]).slice();return z.__wbindgen_free(e[0],e[1]*4,4),r}};Symbol.dispose&&(Ea.prototype[Symbol.dispose]=Ea.prototype.free);var Sa=class t{static __wrap(e){let r=Object.create(t.prototype);return r.__wbg_ptr=e,Cf.register(r,r.__wbg_ptr,r),r}__destroy_into_raw(){let e=this.__wbg_ptr;return this.__wbg_ptr=0,Cf.unregister(this),e}free(){let e=this.__destroy_into_raw();z.__wbg_loweredslicerecords_free(e,0)}batches(){let e=z.loweredslicerecords_batches(this.__wbg_ptr);var r=kt(e[0],e[1]).slice();return z.__wbindgen_free(e[0],e[1]*4,4),r}contourEdgeOperations(){let e=z.loweredslicerecords_contourEdgeOperations(this.__wbg_ptr);var r=kt(e[0],e[1]).slice();return z.__wbindgen_free(e[0],e[1]*4,4),r}contourEdges(){let e=z.loweredslicerecords_contourEdges(this.__wbg_ptr);var r=sn(e[0],e[1]).slice();return z.__wbindgen_free(e[0],e[1]*4,4),r}covers(){let e=z.loweredslicerecords_covers(this.__wbg_ptr);var r=kt(e[0],e[1]).slice();return z.__wbindgen_free(e[0],e[1]*4,4),r}cutIndices(){let e=z.loweredslicerecords_cutIndices(this.__wbg_ptr);var r=kt(e[0],e[1]).slice();return z.__wbindgen_free(e[0],e[1]*4,4),r}edgeCuts(){let e=z.loweredslicerecords_edgeCuts(this.__wbg_ptr);var r=kt(e[0],e[1]).slice();return z.__wbindgen_free(e[0],e[1]*4,4),r}fanVertices(){let e=z.loweredslicerecords_fanVertices(this.__wbg_ptr);var r=sn(e[0],e[1]).slice();return z.__wbindgen_free(e[0],e[1]*4,4),r}outlineEdges(){let e=z.loweredslicerecords_outlineEdges(this.__wbg_ptr);var r=sn(e[0],e[1]).slice();return z.__wbindgen_free(e[0],e[1]*4,4),r}outlineShapes(){let e=z.loweredslicerecords_outlineShapes(this.__wbg_ptr);var r=kt(e[0],e[1]).slice();return z.__wbindgen_free(e[0],e[1]*4,4),r}shapeCuts(){let e=z.loweredslicerecords_shapeCuts(this.__wbg_ptr);var r=kt(e[0],e[1]).slice();return z.__wbindgen_free(e[0],e[1]*4,4),r}shapes(){let e=z.loweredslicerecords_shapes(this.__wbg_ptr);var r=kt(e[0],e[1]).slice();return z.__wbindgen_free(e[0],e[1]*4,4),r}statsJson(){let e,r;try{let a=z.loweredslicerecords_statsJson(this.__wbg_ptr);return e=a[0],r=a[1],Ta(a[0],a[1])}finally{z.__wbindgen_free(e,r,1)}}subtractShapes(){return z.loweredslicerecords_subtractShapes(this.__wbg_ptr)>>>0}};Symbol.dispose&&(Sa.prototype[Symbol.dispose]=Sa.prototype.free);function Wv(){return{__proto__:null,"./kicad_monkey_analytic_bg.js":{__proto__:null,__wbg___wbindgen_throw_bb96b2010945f0bc:function(e,r){throw new Error(Ta(e,r))},__wbindgen_cast_0000000000000001:function(e,r){return Ta(e,r)},__wbindgen_init_externref_table:function(){let e=z.__wbindgen_externrefs,r=e.grow(4);e.set(0,void 0),e.set(r+0,void 0),e.set(r+1,null),e.set(r+2,!0),e.set(r+3,!1)}}}}var Rf=typeof FinalizationRegistry>"u"?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(t=>z.__wbg_analyticpack_free(t,1)),Nf=typeof FinalizationRegistry>"u"?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(t=>z.__wbg_barrelrecords_free(t,1)),Cf=typeof FinalizationRegistry>"u"?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(t=>z.__wbg_loweredslicerecords_free(t,1));function sn(t,e){return t=t>>>0,Xv().subarray(t/4,t/4+e)}function kt(t,e){return t=t>>>0,$v().subarray(t/4,t/4+e)}var xa=null;function Xv(){return(xa===null||xa.byteLength===0)&&(xa=new Float32Array(z.memory.buffer)),xa}function Ta(t,e){return Zv(t>>>0,e)}var va=null;function $v(){return(va===null||va.byteLength===0)&&(va=new Uint32Array(z.memory.buffer)),va}var wa=null;function Ma(){return(wa===null||wa.byteLength===0)&&(wa=new Uint8Array(z.memory.buffer)),wa}function Yv(t,e){let r=e(t.length*1,1)>>>0;return Ma().set(t,r/1),Aa=t.length,r}function Jv(t,e,r){if(r===void 0){let o=ka.encode(t),c=e(o.length,1)>>>0;return Ma().subarray(c,c+o.length).set(o),Aa=o.length,c}let a=t.length,s=e(a,1)>>>0,n=Ma(),i=0;for(;i<a;i++){let o=t.charCodeAt(i);if(o>127)break;n[s+i]=o}if(i!==a){i!==0&&(t=t.slice(i)),s=r(s,a,a=i+t.length*3,1)>>>0;let o=Ma().subarray(s+i,s+a),c=ka.encodeInto(t,o);i+=c.written,s=r(s,a,i,1)>>>0}return Aa=i,s}function an(t){let e=z.__wbindgen_externrefs.get(t);return z.__externref_table_dealloc(t),e}var nn=new TextDecoder("utf-8",{ignoreBOM:!0,fatal:!0});nn.decode();var Qv=2146435072,xo=0;function Zv(t,e){return xo+=e,xo>=Qv&&(nn=new TextDecoder("utf-8",{ignoreBOM:!0,fatal:!0}),nn.decode(),xo=e),nn.decode(Ma().subarray(t,t+e))}var ka=new TextEncoder;"encodeInto"in ka||(ka.encodeInto=function(t,e){let r=ka.encode(t);return e.set(r),{read:t.length,written:r.length}});var Aa=0,ew,tw,z;function rw(t,e){return tw=t,z=t.exports,ew=e,xa=null,va=null,wa=null,z.__wbindgen_start(),z}async function aw(t,e){if(typeof Response=="function"&&t instanceof Response){if(typeof WebAssembly.instantiateStreaming=="function")try{return await WebAssembly.instantiateStreaming(t,e)}catch(s){if(t.ok&&r(t.type)&&t.headers.get("Content-Type")!=="application/wasm")console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n",s);else throw s}let a=await t.arrayBuffer();return await WebAssembly.instantiate(a,e)}else{let a=await WebAssembly.instantiate(t,e);return a instanceof WebAssembly.Instance?{instance:a,module:t}:a}function r(a){switch(a){case"basic":case"cors":case"default":return!0}return!1}}async function Bf(t){if(z!==void 0)return z;t!==void 0&&(Object.getPrototypeOf(t)===Object.prototype?{module_or_path:t}=t:console.warn("using deprecated parameters for the initialization function; pass a single object instead")),t===void 0&&(t=new URL("kicad_monkey_analytic_bg.wasm",import.meta.url));let e=Wv();(typeof t=="string"||typeof Request=="function"&&t instanceof Request||typeof URL=="function"&&t instanceof URL)&&(t=fetch(t));let{instance:r,module:a}=await aw(await t,e);return rw(r,a)}var Ff={schema:"prism.vendored_wasm.a0",purpose:"Reads kicad_monkey.materialization.a0 packs in the browser and lowers their slices for the analytic renderer.",source:{repository:"https://github.com/krishna-swaroop/kicad_monkey.git",revision:"b6316117901b344114385242b0ad13be45dfefae",crate:"kicad-monkey-wasm",license:"MIT"},build:{target:"wasm32-unknown-unknown",profile:"release",features:["materialization"],wasm_bindgen:"0.2.126",rustc:"rustc 1.98.0 (88d9e12ae 2026-08-18)",command:"node scripts/build-analytic-wasm.mjs --monkey <kicad_monkey checkout at revision>"},files:{"kicad_monkey_analytic.js":"f4093245af543a7a87cf6ce6aa3d7ce4feb82d17912a35c4171c59b8104dfb9d","kicad_monkey_analytic_bg.wasm":"c48e1f23b0522ed18342f374bdc59db070d4424a95adf0e803d717256d9cfd72"}};var Of="kicad-monkey-analytic.wasm",nw="kicad_monkey.materialization.a0",iw=1e3,vo=null;function ow(){let t=String(Ff.files?.["kicad_monkey_analytic_bg.wasm"]||"").slice(0,16);try{return new URL(`${Of}?v=${t}`,import.meta.url)}catch{return`/${Of}?v=${t}`}}function cw(t=ow()){return vo??=Bf({module_or_path:t}).catch(e=>{throw vo=null,e}),vo}async function Df(t,{wasm:e}={}){await cw(e);let r=new Nr(t instanceof Uint8Array?t:new Uint8Array(t)),a=JSON.parse(r.headerJson());if(a.schema!==nw)throw new Error(`unsupported materialization schema ${a.schema}`);return{header:a,lowerSlice(s,n=iw){let i=r.lowerSlice(s,n);try{return{shapes:new Uint32Array(i.shapes()),subtractShapes:i.subtractShapes(),fanVertices:new Float32Array(i.fanVertices()),covers:new Uint32Array(i.covers()),batches:new Uint32Array(i.batches()),contourEdges:new Float32Array(i.contourEdges()),contourEdgeOperations:new Uint32Array(i.contourEdgeOperations()),shapeCuts:new Uint32Array(i.shapeCuts()),edgeCuts:new Uint32Array(i.edgeCuts()),cutIndices:new Uint32Array(i.cutIndices()),outlineEdges:new Float32Array(i.outlineEdges()),outlineShapes:new Uint32Array(i.outlineShapes()),stats:JSON.parse(i.statsJson())}}finally{i.free()}},barrels(){let s=r.barrelRecords();try{return{floats:new Float32Array(s.floats()),words:new Uint32Array(s.words()),skipped:s.skipped()}}finally{s.free()}},binding(s){return JSON.parse(r.bindingJson(s))},free(){r.free()}}}function Eo(t){return(t.chunks||[]).reduce((e,r)=>e+Number(r.operation_count||0),0)}function lw(t,e){let r=null;for(let a of t.chunks||[]){if(a.slice_key!==e)continue;let s=a.bounds,n=[s.min_x_nm,s.min_y_nm,s.max_x_nm,s.max_y_nm].map(i=>i/1e6);r=r?[Math.min(r[0],n[0]),Math.min(r[1],n[1]),Math.max(r[2],n[2]),Math.max(r[3],n[3])]:n}return r}var dw={conductor:"copper",solder_mask:"mask",silkscreen:"silk",paste:"paste",dielectric:"dielectric"},Uf=1e-6,zf=2e-6,Pf=1e-7,jf={"fr4 natural":[109,116,75],"ptfe natural":[252,252,250],polyimide:[205,130,0],"phenolic natural":[92,17,6],aluminum:[213,213,213]};function uw(t){let e=String(t||"").trim(),r=/^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(e);return[...(r?[0,2,4].map(s=>parseInt(r[1].slice(s,s+2),16)):jf[e.toLowerCase()]||jf["fr4 natural"]).map(s=>s/255),1]}function Gf(t,e,r=0){let a=new Map((e||[]).map(d=>[String(d.name),d])),s=[...t.stack?.slices||[]].sort((d,x)=>d.order-x.order),n=s.filter(d=>d.role==="conductor"),i=d=>Number(a.get(String(d?.kicad_layer||""))?.id||0),o=i(n[0]),c=i(n[n.length-1]),l=[],f=[];for(let d of s){let x=dw[d.role],g=a.get(String(d.kicad_layer||"")),y=lw(t,d.key);if(!x||!g||!y){x&&f.push(d.key);continue}let m=Number(g.z_mm||0)/1e3+r,w=(Number(g.thickness_mm)||Number(d.thickness_nm||0)/1e6)/2e3,E=d.side==="back"||x!=="dielectric"&&x!=="copper"&&m<r,S={key:d.key,role:x,layerId:Number(g.id),side:d.side||null,bounds:y};if(x==="dielectric"){S.color=uw(g.color);let A=[...n].reverse().find(N=>N.order<d.order),T=n.find(N=>N.order>d.order),_=[i(A)||i(T),i(T)||i(A)],R={zTop:m+w,zBottom:m-w};l.push({...S,...R,face:"top",z:m+w-Pf,faceDown:!1,outer:!1,offsetLayers:_}),l.push({...S,...R,face:"bottom",z:m-w+Pf,faceDown:!0,outer:!1,offsetLayers:_})}else if(x==="copper"){let A=n.indexOf(d),T=A===n.length-1&&n.length>1,_=A===0||T,R={...S,bottom:T,outer:_,zTop:m+w,zBottom:m-w,offsetLayers:[Number(g.id),Number(g.id)]};l.push({...R,face:"top",z:m+w,faceDown:!1,mark:_&&!T,walls:!T}),l.push({...R,face:"bottom",z:m-w,faceDown:!0,mark:T,walls:T})}else{let A=x==="silk"?zf:x==="paste"?Uf:0,T=E?c:o;l.push({...S,z:E?m-w-A:m+w+A,faceDown:E,outer:!1,thickness:w*2,offsetLayers:[T,T]})}}fw(l);let u=l.filter(d=>d.role==="dielectric"),p=u.filter(d=>!d.faceDown).sort((d,x)=>x.z-d.z)[0],b=u.filter(d=>d.faceDown).sort((d,x)=>d.z-x.z)[0];for(let d of u)d.skin=d===p||d===b;let h={dielectric:0,copper:1,mask:2,paste:3,silk:4};return l.sort((d,x)=>h[d.role]-h[x.role]),{planned:l,unmatched:f}}function fw(t){for(let e of t){if(e.role!=="mask"&&e.role!=="silk"&&e.role!=="paste")continue;let r=t.find(c=>c.role==="copper"&&c.mark&&c.faceDown===e.faceDown);if(!r)continue;let a=e.faceDown?-1:1,s=e.faceDown?r.zTop:r.zBottom,n=e.faceDown?r.zBottom:r.zTop,o=t.find(c=>c.role==="mask"&&c.faceDown===e.faceDown)?.thickness||0;e.role==="mask"?(e.coat=o,e.zLow=s+a*o):e.role==="silk"?e.zLow=s+a*(o+zf):e.z=n+a*Uf}}function So(t,e){let r=new Float32Array(Math.max(1,e)).fill(Number.NaN);if(ArrayBuffer.isView(t)||Array.isArray(t))for(let a=0;a<Math.min(e,t.length);a+=1)r[a]=Number(t[a]);else for(let[a,s]of Object.entries(t||{})){let n=Number(a);Number.isInteger(n)&&n>=0&&n<e&&(r[n]=Number(s))}return r}function Cr(t){let e=1/0,r=-1/0;for(let a of t)Number.isFinite(a)&&(e=Math.min(e,a),r=Math.max(r,a));return Number.isFinite(e)?[e,r]:[0,1]}function cn(t){let e=new Map,r=1e3;for(let a of t.slices||[]){if(!(a.nx>0&&a.ny>0)||a.values.length!==a.nx*a.ny)throw new Error(`grid field slice ${a.slice_key} has ${a.values.length} values for ${a.nx} x ${a.ny} cells`);e.set(a.slice_key,{originMm:[(t.origin_x_m+a.ix0*t.dx_m)*r,(t.origin_y_m+a.iy0*t.dy_m)*r],pitchMm:[t.dx_m*r,t.dy_m*r],width:a.nx,height:a.ny,values:a.values})}return e}function Kf(t){let e=new Map;for(let a of t||[])e.has(a.slice_key)||e.set(a.slice_key,[]),e.get(a.slice_key).push(a);let r=new Map;for(let[a,s]of e){let n=Number(s[0].pitch_nm);if(!(n>0)||s.some(p=>Number(p.pitch_nm)!==n))throw new Error(`field tiles of ${a} must share one positive pitch`);let i=Math.min(...s.map(p=>p.origin_nm[0])),o=Math.min(...s.map(p=>p.origin_nm[1])),c=(p,b)=>{let h=(p-b)/n;if(!Number.isInteger(h))throw new Error(`field tile of ${a} is off its pitch grid`);return h},l=Math.max(...s.map(p=>c(p.origin_nm[0],i)+p.width)),f=Math.max(...s.map(p=>c(p.origin_nm[1],o)+p.height)),u=new Float32Array(l*f).fill(Number.NaN);for(let p of s){let b=c(p.origin_nm[0],i),h=c(p.origin_nm[1],o);for(let d=0;d<p.height;d+=1)u.set(p.values.subarray?p.values.subarray(d*p.width,(d+1)*p.width):p.values.slice(d*p.width,(d+1)*p.width),(h+d)*l+b)}r.set(a,{originMm:[i/1e6,o/1e6],pitchMm:n/1e6,width:l,height:f,values:u})}return r}var wo=8,on=8,Lf=4294967295,hw=Object.freeze({unplated:2,tentedFront:4,tentedBack:8,coveredFront:16,coveredBack:32,pluggedFront:64,pluggedBack:128,filled:256,capped:512,castellated:1024}),Mo=16;function bw(t,e,r){let a=null;for(let s=0;t&&s+3<t.length;s+=4){let n=[t[s],t[s+1]],i=[t[s+2],t[s+3]],o=[i[0]-n[0],i[1]-n[1]],c=o[0]*o[0]+o[1]*o[1];if(c<=0)continue;let l=Math.max(0,Math.min(1,((e[0]-n[0])*o[0]+(e[1]-n[1])*o[1])/c)),f=Math.hypot(e[0]-n[0]-l*o[0],e[1]-n[1]-l*o[1]);if(f>r||a&&f>=a.distance)continue;let u=Math.sqrt(c),p=[o[1]/u,o[0]/u];a={distance:f,normal:p,offset:(p[0]*n[0]-p[1]*n[1])/1e3}}return a&&{normal:a.normal,offset:a.offset}}function Vf(t,e,r,a=null){let s=(t.stack?.slices||[]).filter(b=>b.role==="conductor").sort((b,h)=>b.order-h.order),n=new Map((r||[]).filter(b=>b.role===void 0||b.role==="copper").map(b=>[b.key,b])),i=b=>{let h=n.get(b.key);if(!h)return null;if(h.zTop!==void 0)return{top:h.zTop,bottom:h.zBottom,layerId:h.layerId};let d=Number(b.thickness_nm||0)/1e9;return h.bottom?{top:h.z+d,bottom:h.z,layerId:h.layerId}:{top:h.z,bottom:h.z-d,layerId:h.layerId}},o=Math.floor(e.floats.length/wo),c=new ArrayBuffer(o*Mo*4),l=new Float32Array(c),f=new Uint32Array(c),u=0,p=e.skipped||0;for(let b=0;b<o;b+=1){let h=e.floats.subarray(b*wo,(b+1)*wo),d=e.words.subarray(b*on,(b+1)*on),[x,g]=[Math.min(d[1],d[2]),Math.max(d[1],d[2])],y=s.filter(A=>A.order>=x&&A.order<=g&&(d[3]===Lf||A.order>d[3])&&(d[4]===Lf||A.order<d[4])),m=y.length?i(y[0]):null,w=y.length?i(y[y.length-1]):null;if(!m||!w){p+=1;continue}let E=u*Mo;l.set([h[0]/1e3,-h[1]/1e3,h[2]/1e3,-h[3],h[4]/1e3,h[5]/1e3,m.top,w.bottom],E),f.set([d[0],m.layerId,w.layerId,d[5]],E+8);let S=d[5]&hw.castellated?bw(a,[h[0],h[1]],h[4]+h[2]):null;l.set(S?[S.normal[0],S.normal[1],S.offset,0]:[0,0,1,0],E+12),u+=1}return{data:c.slice(0,u*Mo*4),count:u,skipped:p}}var ko=12,pw=0,gw=1;function Hf(t,e,r,a=0){let s=(r||[]).filter(b=>b.role==="soldermask").map(b=>Number(b.z_mm)/1e3+a+Math.sign(Number(b.z_mm))*Number(b.thickness_mm||0)/2e3),n=s.length?Math.max(...s):null,i=s.length?Math.min(...s):null,o=t.filter(b=>b.role==="dielectric"&&b.face==="top"&&e.get(b.key)?.contourEdges?.length),c=[],l=(b,h,d,x,g,y)=>{let m=e.get(b.key).contourEdges;for(let w=0;w+3<m.length;w+=4)c.push([m[w],m[w+1],m[w+2],m[w+3],h,d,x,g,y])};for(let b of o)l(b,b.zTop,b.zBottom,b.offsetLayers[0],b.offsetLayers[1],pw);for(let b of t.filter(h=>h.role==="copper"&&h.face==="top")){let h=w=>Math.min(Math.abs(w.zBottom-b.zTop),Math.abs(w.zTop-b.zBottom)),d=[...o].sort((w,E)=>h(w)-h(E))[0];if(!d)continue;let x=b.outer&&!b.bottom,g=b.outer&&b.bottom,y=x&&n!=null?Math.max(n,b.zTop):b.zTop,m=g&&i!=null?Math.min(i,b.zBottom):b.zBottom;l(d,y,m,b.layerId,b.layerId,gw)}let f=new ArrayBuffer(c.length*ko*4),u=new Float32Array(f),p=new Uint32Array(f);return c.forEach(([b,h,d,x,g,y,m,w,E],S)=>{u.set([b/1e3,-h/1e3,d/1e3,-x/1e3,g,y,0,0],S*ko),p.set([m,w,E,0],S*ko+8)}),{data:f,count:c.length}}function qf(t,e){let r=new Map;for(let i of e||[])for(let o of i?.aliases||[])r.has(String(o))||r.set(String(o),Number(i.id));for(let i of e||[])i?.name&&r.set(String(i.name),Number(i.id));let a=new Map((t.header.nets||[]).map(i=>[i.key,i.name])),s=Eo(t.header),n=new Uint32Array(s);for(let i=0;i<s;i+=1){let o=t.binding(i)?.net_key;o&&(n[i]=r.get(a.get(o)??o)||0)}return n}var Io={color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}};function _o(t){let e=Float32Array.from(t);for(let r=0;r<e.length;r+=1)Number.isFinite(e[r])||(e[r]=3e38);return e}function Qf(t,e){let r=new Float32Array(t.buffer,t.byteOffset+e*20*4,20),[a,s,n,i,o,c]=[r[4],r[5],r[6],r[7],r[8],r[9]],l=[1/0,1/0,-1/0,-1/0];for(let[f,u]of[[r[10],r[11]],[r[12],r[11]],[r[10],r[13]],[r[12],r[13]]]){let p=a*f+s*u+o,b=n*f+i*u+c;l[0]=Math.min(l[0],p),l[1]=Math.min(l[1],b),l[2]=Math.max(l[2],p),l[3]=Math.max(l[3],b)}return l}var vw=5e-4,ww={mask:"soldermask",silk:"silkscreen",paste:"paste"};function Mw(t,e){let r=ww[e.role];return!!(t?.size&&r)&&t.has(kw(r,e.faceDown?"back":"front"))}function kw(t,e){return`${t}:${e}`}var Zf=.3,ln=class{constructor(e){this.renderer=e,this.device=e.device,this.stencil=e.stencil,this.samples=e.sampleCount||1,this.slices=[],this.skin=null,this.eye=null,this.viewMatrix=null,this.extent=null,this.overlay={mode:0,range:[0,1]},this.layout=this.device.createBindGroupLayout({label:"analytic",entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:2,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:3,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:4,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:5,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:"unfilterable-float"}},{binding:6,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:7,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:8,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:9,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:10,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}}]}),this.palette=this.device.createBuffer({label:"analytic-palette",size:8208,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.style=yo(ya),this.writePalette(),this.module=this.device.createShaderModule({label:"analytic",code:xd}),this.pipelines={color:this.makePipelines(e.format,!1),pick:this.makePipelines("rg32uint",!0)},this.emptyValues=this.buffer(new Float32Array([3e38]),GPUBufferUsage.STORAGE,"analytic-values-empty"),this.valuesBuffer=this.emptyValues,this.emptyField=this.fieldTexture(1,1,new Float32Array([3e38])),this.uniformScratch=new ArrayBuffer(256),this.netsBuffer=this.buffer(new Uint32Array(1),GPUBufferUsage.STORAGE,"analytic-nets"),this.makeBarrelPipelines(),this.makeArrowPipeline()}makeArrowPipeline(){this.arrowLayout=this.device.createBindGroupLayout({label:"analytic-arrows",entries:[{binding:0,visibility:GPUShaderStage.VERTEX,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:2,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:3,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:4,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}}]}),this.drawnLayers=new Uint32Array(256),this.drawnLayersBuffer=this.buffer(this.drawnLayers,GPUBufferUsage.STORAGE,"analytic-drawn-layers");let e=this.device.createShaderModule({label:"analytic-arrows",code:Ed});this.arrowPipeline=this.device.createRenderPipeline({label:"analytic-arrow",layout:this.device.createPipelineLayout({bindGroupLayouts:[this.arrowLayout]}),vertex:{module:e,entryPoint:"vs_arrow"},fragment:{module:e,entryPoint:"fs_arrow",targets:[{format:this.renderer.format,blend:Io}]},primitive:{topology:"triangle-list",cullMode:"none"},depthStencil:{format:this.renderer.depthFormat,depthWriteEnabled:!1,depthCompare:"greater-equal"},multisample:{count:this.samples}}),this.arrows=null}writePalette(){let e=new Float32Array(8208/4);e.set(mo(this.style.fieldColormap,Rr),0),e.set(mo(this.style.arrowColormap,Rr),Rr*4),e.set(this.style.arrowOutline,2*Rr*4),this.device.queue.writeBuffer(this.palette,0,e),this.renderer.invalidate?.()}setStyle(e){return this.style=yo(e,this.style),this.writePalette(),this.style}setArrows(e){this.arrows?.buffer.destroy(),this.arrows=e?.count?{buffer:this.buffer(new Uint8Array(e.data),GPUBufferUsage.STORAGE,"analytic-arrows"),count:e.count}:null,this.arrows&&(this.arrows.bindGroup=this.device.createBindGroup({layout:this.arrowLayout,entries:[{binding:0,resource:{buffer:this.renderer.globalBuffer}},{binding:1,resource:{buffer:this.arrows.buffer}},{binding:2,resource:{buffer:this.layerOffsets}},{binding:3,resource:{buffer:this.palette}},{binding:4,resource:{buffer:this.drawnLayersBuffer}}]})),this.renderer.invalidate?.()}encodeArrows(e){return this.arrows?(this.device.queue.writeBuffer(this.drawnLayersBuffer,0,this.drawnLayers),e.setPipeline(this.arrowPipeline),e.setBindGroup(0,this.arrows.bindGroup),e.draw(9,2*this.arrows.count),1):0}makeBarrelPipelines(){let e=GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT;this.barrelLayout=this.device.createBindGroupLayout({label:"analytic-barrels",entries:[{binding:0,visibility:e,buffer:{type:"uniform"}},{binding:1,visibility:e,buffer:{type:"uniform"}},{binding:2,visibility:e,buffer:{type:"read-only-storage"}},{binding:3,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:4,visibility:e,buffer:{type:"read-only-storage"}},{binding:5,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:6,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:7,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}}]});let r=this.device.createShaderModule({label:"analytic-barrels",code:Md}),a=this.device.createPipelineLayout({bindGroupLayouts:[this.barrelLayout]}),s=(o,c)=>this.device.createRenderPipeline({label:`analytic-barrel${c?"-pick":""}`,layout:a,vertex:{module:r,entryPoint:"vs_barrel"},fragment:{module:r,entryPoint:c?"fs_barrel_pick":"fs_barrel",targets:[{format:o}]},primitive:{topology:"triangle-list",cullMode:"back"},depthStencil:{format:this.renderer.depthFormat,depthWriteEnabled:!0,depthCompare:"greater"},multisample:{count:c?1:this.samples}});this.barrelPipelines={color:s(this.renderer.format,!1),pick:s("rg32uint",!0)},this.barrelView=this.device.createBuffer({label:"analytic-barrel-view",size:Fi,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.layerOffsets=this.device.createBuffer({label:"analytic-layer-offsets",size:256*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.viewScratch=new ArrayBuffer(Fi),this.barrels=null;let n=this.device.createShaderModule({label:"analytic-walls",code:kd}),i=o=>this.device.createRenderPipeline({label:`analytic-wall${o?"-blend":""}`,layout:a,vertex:{module:n,entryPoint:"vs_wall"},fragment:{module:n,entryPoint:"fs_wall",targets:[{format:this.renderer.format,...o?{blend:Io}:{}}]},primitive:{topology:"triangle-list",cullMode:"none"},depthStencil:{format:this.renderer.depthFormat,depthWriteEnabled:!0,depthCompare:"greater"},multisample:{count:this.samples}});this.wallPipelines={opaque:i(!1),blend:i(!0)},this.walls=null}setWalls({data:e,count:r}){this.walls?.buffer.destroy(),this.walls=r?{buffer:this.buffer(new Uint8Array(e),GPUBufferUsage.STORAGE,"analytic-walls"),count:r,bindGroup:null}:null,this.walls&&(this.walls.bindGroup=this.wallBindGroup()),this.renderer.invalidate?.()}wallBindGroup(){return this.device.createBindGroup({layout:this.barrelLayout,entries:[{binding:0,resource:{buffer:this.renderer.globalBuffer}},{binding:1,resource:{buffer:this.barrelView}},{binding:2,resource:{buffer:this.walls.buffer}},{binding:3,resource:{buffer:this.valuesBuffer}},{binding:4,resource:{buffer:this.layerOffsets}},{binding:5,resource:{buffer:this.netsBuffer}},{binding:6,resource:{buffer:this.renderer.netMaskBuffer}},{binding:7,resource:{buffer:this.palette}}]})}encodeWalls(e,r){return this.walls?(e.setPipeline(r?this.wallPipelines.blend:this.wallPipelines.opaque),e.setBindGroup(0,this.walls.bindGroup),e.draw(6,this.walls.count),1):0}writeView(e,r,a={}){let s=new Float32Array(256);r&&s.set(r.subarray?r.subarray(0,256):r.slice(0,256)),this.device.queue.writeBuffer(this.layerOffsets,0,s);let n=new Float32Array(this.viewScratch),i=new Uint32Array(this.viewScratch);n.fill(0),this.eye=Ew(e),this.viewMatrix=e,n.set(this.eye,0),n.set(this.renderer.barrelColor||[.55,.35,.16,1],4);let o=this.laminateColor()||this.boardLooks().substrate?.color||[.3,.32,.25,1],c=(a.boardOpacity??1)*(.15+.85*(a.assemblyOpacity??1));n.set([...o.slice(0,3),c],8);let l=this.overlay.mode===1||this.overlay.mode===2&&this.valuesBuffer!==this.emptyValues;i[12]=l?1:0,i[13]=a.isolateNet?1:0,i[14]=this.boardShown(a)?1:0,i[15]=this.boardShown(a)&&(a.boardOpacity??1)>=.999&&this.renderer.innerCopperMode!=="all"?1:0,n.set(this.overlay.range,16),n.set(this.edgePlated?[...(this.renderer.barrelColor||[.55,.35,.16]).slice(0,3),c]:[...o.slice(0,3),c],20),n.set([...(this.boardLooks().soldermask?.color||[.06,.16,.11]).slice(0,3),1],24),this.device.queue.writeBuffer(this.barrelView,0,this.viewScratch)}setBarrels({data:e,count:r,skipped:a=0}){this.barrels?.buffer.destroy(),this.barrels=r?{buffer:this.buffer(new Uint8Array(e),GPUBufferUsage.STORAGE,"analytic-barrels"),count:r,skipped:a,bindGroup:null}:null,this.barrels&&(this.barrels.bindGroup=this.barrelBindGroup()),this.renderer.invalidate?.()}hasBarrels(){return!!this.barrels}barrelBindGroup(){return this.device.createBindGroup({layout:this.barrelLayout,entries:[{binding:0,resource:{buffer:this.renderer.globalBuffer}},{binding:1,resource:{buffer:this.barrelView}},{binding:2,resource:{buffer:this.barrels.buffer}},{binding:3,resource:{buffer:this.valuesBuffer}},{binding:4,resource:{buffer:this.layerOffsets}},{binding:5,resource:{buffer:this.netsBuffer}},{binding:6,resource:{buffer:this.renderer.netMaskBuffer}},{binding:7,resource:{buffer:this.palette}}]})}encodeBarrels(e,r,a,s=!1){return this.barrels?(a&&this.writeView(a,r,this.context),e.setPipeline(s?this.barrelPipelines.pick:this.barrelPipelines.color),e.setBindGroup(0,this.barrels.bindGroup),e.draw(36,this.barrels.count),1):0}buffer(e,r,a){let s=Math.max(16,Math.ceil(e.byteLength/4)*4),n=this.device.createBuffer({label:a,size:s,usage:r|GPUBufferUsage.COPY_DST});return e.byteLength&&this.device.queue.writeBuffer(n,0,e),n}fieldTexture(e,r,a){let s=this.device.createTexture({label:"analytic-field",size:[e,r],format:"r32float",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});return this.device.queue.writeTexture({texture:s},a,{bytesPerRow:e*4},[e,r]),s}makePipelines(e,r){let a=this.device.createPipelineLayout({bindGroupLayouts:[this.layout]}),s=(i,o,c,l,f=[],u=!1,p="none")=>{let b=Ss[l],h={format:this.renderer.depthFormat,depthWriteEnabled:b.depth,depthCompare:b.depth||b.depthTest?"greater":"always"};return this.stencil&&Object.assign(h,{stencilFront:b.face,stencilBack:b.face,stencilReadMask:b.read,stencilWriteMask:b.write}),this.device.createRenderPipeline({label:`analytic-${i}${r?"-pick":""}`,layout:a,vertex:{module:this.module,entryPoint:o,buffers:f},fragment:{module:this.module,entryPoint:r?`${c}_pick`:c,...r?{}:{constants:{SAMPLES:this.samples}},targets:[{format:e,writeMask:b.color?GPUColorWrite.ALL:0,...u&&!r?{blend:Io}:{}}]},primitive:{topology:"triangle-list",cullMode:p},depthStencil:h,multisample:{count:r?1:this.samples}})},n=[{arrayStride:8,attributes:[{shaderLocation:0,offset:0,format:"float32x2"}]}];return{shapeMask:s("shape-mask","vs_shape","fs_shape_mask","shapeMask"),shapeAdd:s("shape","vs_shape","fs_shape","shapeAdd"),fan:s("fan","vs_fan","fs_plain_mask","fan",n),coverSubtract:s("cover-subtract","vs_cover","fs_plain_mask","coverSubtract"),coverMark:s("cover-mark","vs_cover","fs_plain_mask","coverMark"),coverAdd:s("cover","vs_cover","fs_cover","coverAdd"),coverClear:s("cover-clear","vs_cover","fs_plain_mask","coverClear"),clear:s("clear","vs_clear","fs_plain_mask","clear"),regionWall:s("region-wall","vs_region_wall","fs_region_wall","solid"),skirt:s("skirt","vs_skirt","fs_skirt","solid"),...r?{}:{shapeLay:s("shape-lay","vs_shape","fs_shape_mask","shapeLay"),coverLay:s("cover-lay","vs_cover","fs_plain_mask","coverLay"),shapeBlend:s("shape-blend","vs_shape","fs_shape","shapeBlend",[],!0),coverBlend:s("cover-blend","vs_cover","fs_cover","coverBlend",[],!0),tintCovered:s("tint-covered","vs_clear","fs_tint_covered","tintCovered",[],!0),tintPlain:s("tint-plain","vs_clear","fs_tint_plain","tintPlain",[],!0),footShape:s("foot-shape","vs_shape","fs_shape_mask","footShape"),footCover:s("foot-cover","vs_cover","fs_plain_mask","footCover"),tintHigh:s("tint-high","vs_clear","fs_tint_covered","tintHigh",[],!0),tintLow:s("tint-low","vs_clear","fs_tint_plain","tintLow",[],!0),regionStep:s("region-step","vs_region_step","fs_region_step","coat"),step:s("step","vs_step","fs_step","coat"),clearLay:s("clear-lay","vs_clear","fs_plain_mask","clearLay"),clearFoot:s("clear-foot","vs_clear","fs_plain_mask","clearFoot"),shapeOnFoot:s("shape-on-foot","vs_shape","fs_shape","shapeOnFoot",[],!0),shapeOffFoot:s("shape-off-foot","vs_shape","fs_shape","shapeOffFoot",[],!0),coverOnFoot:s("cover-on-foot","vs_cover","fs_cover","coverOnFoot",[],!0),coverOffFoot:s("cover-off-foot","vs_cover","fs_cover","coverOffFoot",[],!0)}}}setSlices(e){this.releaseSlices();let r=new Map;this.slices=e.map(o=>this.uploadSlice(o,r)),this.makeTwins();let a=e.map(o=>o.z),s=e.flatMap(o=>[o.bounds[0],o.bounds[2]]),n=e.flatMap(o=>[o.bounds[1],o.bounds[3]]);this.extent=e.length?[[Math.min(...s)/1e3,-Math.max(...n)/1e3,Math.min(...a)],[Math.max(...s)/1e3,-Math.min(...n)/1e3,Math.max(...a)]]:null;let i=e.filter(o=>o.skin);this.skin=i.length===2?{top:Math.max(...i.map(o=>o.z)),bottom:Math.min(...i.map(o=>o.z))}:null,this.renderer.invalidate?.()}makeTwins(){this.twinBuffers?.forEach(r=>r.destroy()),this.twinBuffers=[];let e=(r,a)=>{let s={...r,...a,uniform:this.device.createBuffer({label:`analytic-twin-${r.key}`,size:256,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),field:null};return s.bindGroup=this.bindGroup(s),s};this.twins=new Map;for(let r of this.slices){if(r.zLow===void 0||r.role!=="mask"&&r.role!=="silk")continue;let a={low:e(r,{z:r.zLow})},s=r.role==="mask"&&this.slices.find(n=>n.role==="copper"&&n.mark&&n.faceDown===r.faceDown);if(s){let n=this.uploadOpenings(s,r),i=r.faceDown?s.zTop:s.zBottom;a.foot=e(s,{role:"footprint",z:r.z,dilate:vw,mark:!1,walls:!1,zTop:Math.max(r.z,i),zBottom:Math.min(r.z,i),...n})}this.twins.set(r,a)}}uploadOpenings(e,r){let{lowered:a}=e,s=r.lowered.shapes.subarray(0,r.lowered.subtractShapes*20),n=a.shapes.length/20,i=new Uint32Array(a.shapes.length+s.length);i.set(a.shapes),i.set(s,a.shapes.length);let o=new Map,c=(m,w)=>`${Math.floor(m)},${Math.floor(w)}`,l=[];for(let m=0;m<s.length/20;m+=1){let w=Qf(s,m);l.push(w);for(let E=Math.floor(w[0]);E<=Math.floor(w[2]);E+=1)for(let S=Math.floor(w[1]);S<=Math.floor(w[3]);S+=1){let A=c(E,S);o.has(A)||o.set(A,[]),o.get(A).push(m)}}let f=[],u=[],p=m=>{let w=new Set;for(let E=Math.floor(m[0]);E<=Math.floor(m[2]);E+=1)for(let S=Math.floor(m[1]);S<=Math.floor(m[3]);S+=1)for(let A of o.get(c(E,S))||[]){let T=l[A];T[0]<=m[2]&&m[0]<=T[2]&&T[1]<=m[3]&&m[1]<=T[3]&&w.add(A)}u.push(f.length,w.size);for(let E of w)f.push(n+E)},b=m=>[m[0]-.05,m[1]-.05,m[2]+.05,m[3]+.05];for(let m=a.subtractShapes;m<n;m+=1)p(b(Qf(a.shapes,m)));let h=n-a.subtractShapes,d=a.contourEdges||new Float32Array(0);for(let m=0;m+3<d.length;m+=4)p(b([Math.min(d[m],d[m+2]),Math.min(d[m+1],d[m+3]),Math.max(d[m],d[m+2]),Math.max(d[m+1],d[m+3])]));let x={shapeCuts:new Uint32Array(u.slice(0,h*2)),edgeCuts:new Uint32Array(u.slice(h*2)),cutIndices:new Uint32Array(f)},g=this.uploadEdges({...a,...x},`${e.key}-step`),y=this.buffer(i,GPUBufferUsage.STORAGE,`analytic-step-shapes-${e.key}`);return this.twinBuffers.push(y,g.edges,g.cuts),{...g,shapes:y}}uploadSlice(e,r=new Map){let{lowered:a}=e,s=GPUBufferUsage.STORAGE;r.has(a)||r.set(a,{shapes:this.buffer(a.shapes,s,`analytic-shapes-${e.key}`),covers:this.buffer(a.covers,s,`analytic-covers-${e.key}`),fans:a.fanVertices.length?this.buffer(a.fanVertices,GPUBufferUsage.VERTEX,`analytic-fans-${e.key}`):null,...this.uploadEdges(a,e.key)});let n={...e,...r.get(a),uniform:this.device.createBuffer({label:`analytic-slice-${e.key}`,size:256,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),shapeCount:a.shapes.length/20,subtractShapes:a.subtractShapes,batches:[],field:null};for(let i=0;i<a.batches.length;i+=5){let[o,c,l,f,u]=a.batches.subarray(i,i+5);n.batches.push({subtract:o===1,firstVertex:c,vertexCount:l,firstCover:f,coverCount:u})}return n.bindGroup=this.bindGroup(n),n}uploadEdges(e,r){let a=e.contourEdges||new Float32Array(0),s=e.contourEdgeOperations||new Uint32Array(0),n=e.shapeCuts||new Uint32Array(0),i=e.edgeCuts||new Uint32Array(0),o=e.cutIndices||new Uint32Array(0),c=n.length,l=new Uint32Array(Math.max(1,c+o.length));for(let y=0;y<c;y+=2)l.set([n[y]+c,n[y+1]],y);l.set(o,c);let f=e.outlineEdges||new Float32Array(0),u=e.outlineShapes||new Uint32Array(0),p=Math.min(a.length/4,s.length),b=new Uint32Array(Math.max(1,p+u.length)*7),h=new Uint32Array(a.buffer,a.byteOffset,a.length),d=0;for(let y=0;y<p;y+=1){if(s[y]&2147483648)continue;let m=d*7;b.set(h.subarray(y*4,y*4+4),m),b[m+4]=s[y],b[m+5]=(i[y*2]??0)+c,b[m+6]=i[y*2+1]??0,d+=1}let x=d,g=new Uint32Array(f.buffer,f.byteOffset,f.length);for(let y=0;y<u.length;y+=1){let m=d*7;b.set(g.subarray(y*4,y*4+4),m),b[m+4]=(1073741824|u[y])>>>0,d+=1}return{edges:this.buffer(b,GPUBufferUsage.STORAGE,`analytic-edges-${r}`),regionEdges:x,skirtEdges:d-x,cuts:this.buffer(l,GPUBufferUsage.STORAGE,`analytic-cuts-${r}`)}}bindGroup(e){return this.device.createBindGroup({layout:this.layout,entries:[{binding:0,resource:{buffer:this.renderer.globalBuffer}},{binding:1,resource:{buffer:e.uniform}},{binding:2,resource:{buffer:e.shapes}},{binding:3,resource:{buffer:e.covers}},{binding:4,resource:{buffer:this.valuesBuffer}},{binding:5,resource:(e.field?.texture||this.emptyField).createView()},{binding:6,resource:{buffer:this.netsBuffer}},{binding:7,resource:{buffer:this.renderer.netMaskBuffer}},{binding:8,resource:{buffer:e.edges}},{binding:9,resource:{buffer:e.cuts}},{binding:10,resource:{buffer:this.palette}}]})}coversLayer(e){return this.slices.some(r=>r.role!==void 0?r.role==="copper"&&r.layerId===Number(e):r.layerId===Number(e))}coversRole(e){let r={substrate:"dielectric",soldermask:"mask",silkscreen:"silk",paste:"paste"}[e];return!!r&&this.slices.some(a=>a.role===r)}setOperationValues(e,r){this.clearOverlay(),this.valuesBuffer=this.buffer(_o(e),GPUBufferUsage.STORAGE,"analytic-values"),this.overlay={mode:1,range:r},this.rebind()}setFieldRasters(e,r,a=null){this.clearOverlay(),a&&(this.valuesBuffer=this.buffer(_o(a),GPUBufferUsage.STORAGE,"analytic-values"));for(let s of this.slices){let n=e.get(s.key);n&&(s.field={...n,texture:this.fieldTexture(n.width,n.height,_o(n.values))})}this.overlay={mode:2,range:r},this.rebind()}clearOverlay(){this.valuesBuffer!==this.emptyValues&&this.valuesBuffer.destroy(),this.valuesBuffer=this.emptyValues;for(let e of this.slices)e.field?.texture.destroy(),e.field=null;this.overlay={mode:0,range:[0,1]},this.rebind()}setOperationNets(e){this.netsBuffer.destroy(),this.netsBuffer=this.buffer(e.length?e:new Uint32Array(1),GPUBufferUsage.STORAGE,"analytic-nets"),this.rebind()}rebind(){this.boundNetMask=this.renderer.netMaskBuffer;for(let e of this.slices)e.bindGroup=this.bindGroup(e);for(let e of this.twins?.values()||[])for(let r of Object.values(e))r.bindGroup=this.bindGroup(r);this.barrels&&(this.barrels.bindGroup=this.barrelBindGroup()),this.walls&&(this.walls.bindGroup=this.wallBindGroup()),this.renderer.invalidate?.()}writeSlice(e,r,a=null){let s=new Float32Array(this.uniformScratch),n=new Uint32Array(this.uniformScratch);s.fill(0),s.set(a?.color||e.color,0);let[i,o]=e.offsetLayers||[e.layerId,e.layerId];s[4]=e.z+.5*((r?.[i]||0)+(r?.[o]||0));let c=e.role===void 0||e.role==="copper";n[5]=c?this.overlay.mode:0;let f=(this.context||{}).isolateNet||!e.outer&&this.renderer.innerCopperMode==="lit";n[7]=c?2|(f?1:0):0;let u=c?e.field:null;if(n[6]=u?1:0,u){s.set(u.originMm,8);let[p,b]=Array.isArray(u.pitchMm)?u.pitchMm:[u.pitchMm,u.pitchMm];s[10]=p,s[11]=b,n[12]=u.width,n[13]=u.height}if(s.set(this.overlay.range,16),s.set(e.bounds,20),s.set([a?.metallic??0,a?.roughness??.72,e.faceDown??e.bottom?-1:1,c?1:0],24),e.zTop!==void 0){let p=s[4]-e.z;s.set([e.zBottom+p,e.zTop+p],28)}n[30]=e.subtractShapes||0,s[31]=e.dilate||0,this.eye&&s.set(this.eye,32),this.device.queue.writeBuffer(e.uniform,0,this.uniformScratch)}copperLooks(){let e=new Map;for(let r of this.renderer.entries||[]){let a=Number(r.layerId);if(r.kind!=="copper"||e.has(a))continue;let s=r.color||r.material?.baseColor;e.set(a,{color:s&&s.length<4?[...s,1]:s,metallic:r.material?.metallic||0,roughness:r.material?.roughness??.72})}return e}boardLooks(){let e={};for(let r of this.renderer.entries||[]){if(r.kind!=="board"||e[r.boardRole])continue;let a=r.color||r.material?.baseColor;e[r.boardRole]={color:a&&a.length<4?[...a,1]:a,metallic:r.material?.metallic||0,roughness:r.material?.roughness??.72}}return e}laminateColor(){return this.slices.find(e=>e.role==="dielectric"&&e.color)?.color||null}lookFor(e,r,a,s){if(e.role===void 0||e.role==="copper")return r.get(e.layerId);let n=s.boardOpacity??1,i=(c,l)=>{let f=a[c];if(!f)return null;let u=f.color||[1,1,1,1];return{...f,color:[u[0],u[1],u[2],l(Number.isFinite(u[3])?u[3]:1)]}};if(e.role==="dielectric"){let c=n*(.15+.85*(s.assemblyOpacity??1));return e.color?{...a.substrate||{metallic:0,roughness:.72},color:[...e.color.slice(0,3),c]}:i("substrate",()=>c)}let o=s.assemblyOpacity??1;return e.role==="mask"?i("soldermask",c=>Math.min(c,.72)*n*o):e.role==="silk"?i("silkscreen",c=>Math.min(c,.92)*n*o):i("paste",c=>c)}encodeInto(e,r,a,s=!1,n={}){this.context=n,this.renderer.netMaskBuffer!==this.boundNetMask&&this.rebind(),n.matrix&&this.writeView(n.matrix,r,n);let i=s?this.pipelines.pick:this.pipelines.color,o=this.copperLooks(),c=this.boardLooks(),f=this.boardShown(n)&&(n.boardOpacity??1)>=.999,u=0;s||this.drawnLayers.fill(0);for(let p of this.slices){let b=p.role===void 0||p.role==="copper";(b?a&&!a.has(p.layerId):s||p.role!=="dielectric"||!f)||b&&!p.outer&&p.role!==void 0&&this.renderer.innerCopperMode==="none"||p.role==="dielectric"&&!p.skin&&this.renderer.innerCopperMode!=="all"||this.behindBoard(p,n)||(this.encodeSlice(e,i,p,"opaque",r,this.lookFor(p,o,c,n)),!s&&b&&p.face===(p.bottom?"bottom":"top")&&(this.drawnLayers[p.layerId]=1),u+=1)}return f&&!s&&(u+=this.encodeWalls(e,!1)),this.stencil&&e.setStencilReference(1),u}boardShown(e){return(e.showBoard??!0)&&!e.panelLayer}behindBoard(e,r){if(!this.skin||!this.eye||this.renderer.innerCopperMode==="all"||!this.boardShown(r)||(r.boardOpacity??1)<.999)return!1;let[,,a,s]=this.eye,n=s?a>this.skin.top:a<0,i=s?a<this.skin.bottom:a>0;return e.faceDown?n:i}encodeBlended(e,r,a,s={}){if(!this.stencil)return 0;this.context=s;let n=this.copperLooks(),i=this.boardLooks(),o=this.boardShown(s),c=o&&(s.boardOpacity??1)<.999,l=0,f=(h,d)=>{this.behindBoard(h,s)||(this.encodeSlice(e,this.pipelines.color,h,d,r,this.lookFor(h,n,i,s)),l+=1)};for(let h of this.slices)c&&h.role==="dielectric"&&f(h,"blend");c&&(l+=this.encodeWalls(e,!0));let u=o&&(s.assemblyOpacity??1)>.01,p=h=>!Mw(s.hiddenBoardLayers,h),b=new Set;for(let h of this.slices){if(h.role!=="mask"||!u||!p(h)||this.behindBoard(h,s))continue;let d=this.twins.get(h);if(!d?.foot){f(h,"mask");continue}let x=this.slices.filter(g=>g.role==="silk"&&g.faceDown===h.faceDown&&p(g)&&!this.behindBoard(g,s));for(let g of x)b.add(g);l+=this.encodeConformal(e,h,d,x,r,g=>this.lookFor(g,n,i,s))}for(let h of this.slices)h.role==="paste"&&p(h)&&!s.hidePaste&&!s.panelLayer&&(!a||a.has(h.offsetLayers?.[0]))&&f(h,"blend");for(let h of this.slices)h.role==="silk"&&u&&p(h)&&!b.has(h)&&f(h,"blend");return e.setStencilReference(1),l}encodeSlice(e,r,a,s,n,i){this.writeSlice(a,n,i),e.setBindGroup(0,a.bindGroup),this.stencil?this.encodeStencilled(e,r,a,s):this.encodeAddsOnly(e,r,a),s==="opaque"&&a.walls&&this.encodeSlabWalls(e,r,a)}wallPixels(e){let r=this.viewMatrix,a=this.renderer.canvas;if(!r||!this.extent||!a)return 1/0;let[s,n]=this.extent,i=[];for(let l of[s[0],n[0]])for(let f of[s[1],n[1]])for(let u of[s[2],n[2]])i.push([l,f,u]);this.eye?.[3]&&i.push(this.eye.slice(0,3).map((l,f)=>Math.min(n[f],Math.max(s[f],l/this.eye[3]))));let o=([l,f,u])=>{let p=[0,1,2,3].map(b=>r[b]*l+r[4+b]*f+r[8+b]*u+r[12+b]);return p[3]>1e-9?[p[0]/p[3],p[1]/p[3]]:null},c=0;for(let l of i){let f=o(l),u=o([l[0],l[1],l[2]+e]);if(!f||!u)return 1/0;c=Math.max(c,Math.hypot((u[0]-f[0])*a.width/2,(u[1]-f[1])*a.height/2))}return c}encodeSlabWalls(e,r,a){this.stencil&&e.setStencilReference(0),a.regionEdges&&(e.setPipeline(r.regionWall),e.draw(6,a.regionEdges,0,0)),a.skirtEdges&&this.wallPixels(a.zTop-a.zBottom)>=Zf&&(e.setPipeline(r.skirt),e.draw(12,a.skirtEdges,0,a.regionEdges))}encodeAddsOnly(e,r,a){let s=a.shapeCount-a.subtractShapes;s&&(e.setPipeline(r.shapeAdd),e.draw(6,s,0,a.subtractShapes))}encodeStencilled(e,r,a,s="opaque"){let n=(i,o=Ss[i].reference)=>{e.setPipeline(r[i]),e.setStencilReference(o)};this.encodeFill(e,a,n,s),s==="mask"&&(n("tintCovered"),e.draw(6),n("tintPlain"),e.draw(6)),n("clear"),e.draw(6)}encodeFill(e,r,a,s){let n=s==="footprint";r.subtractShapes&&!n&&(a("shapeMask"),e.draw(6,r.subtractShapes,0,0)),n||this.encodeBatches(e,r,!0,a,s);let i=r.shapeCount-r.subtractShapes;i&&(s==="opaque"?a("shapeAdd",r.mark?33:32):a({mask:"shapeLay",blend:"shapeBlend",footprint:"footShape",onFoot:"shapeOnFoot",offFoot:"shapeOffFoot"}[s]),e.draw(6,i,0,r.subtractShapes)),this.encodeBatches(e,r,!1,a,s)}encodeConformal(e,r,{low:a,foot:s},n,i,o){let c=this.pipelines.color,l=b=>Ss[b==="step"||b==="regionStep"?"coat":b],f=(b,h=l(b).reference)=>{e.setPipeline(c[b]),e.setStencilReference(h)},u=(b,h)=>{this.writeSlice(b,i,h),e.setBindGroup(0,b.bindGroup)},p=o(r);u(s,p),this.encodeFill(e,s,f,"footprint"),u(r,p),this.encodeFill(e,r,f,"mask"),f("tintHigh"),e.draw(6),e.setBindGroup(0,s.bindGroup),s.regionEdges&&(f("regionStep"),e.draw(6,s.regionEdges,0,0)),s.skirtEdges&&this.wallPixels(s.zTop-s.zBottom)>=Zf&&(f("step"),e.draw(12,s.skirtEdges,0,s.regionEdges)),e.setBindGroup(0,r.bindGroup),f("clearLay"),e.draw(6),u(a,p),this.encodeFill(e,a,f,"mask"),f("tintLow"),e.draw(6),f("clearLay"),e.draw(6);for(let b of n){let h=o(b);u(b,h),this.encodeFill(e,b,f,"onFoot"),f("clear"),e.draw(6);let d=this.twins.get(b)?.low;d&&(u(d,h),this.encodeFill(e,d,f,"offFoot"),f("clear"),e.draw(6))}return e.setBindGroup(0,r.bindGroup),f("clearFoot"),e.draw(6),e.setStencilReference(1),1+n.length}encodeBatches(e,r,a,s,n="opaque"){let i=r.batches.findLast(o=>!o.subtract);for(let o of r.batches){if(o.subtract!==a||!r.fans)continue;s("fan"),e.setVertexBuffer(0,r.fans),e.draw(o.vertexCount,1,o.firstVertex,0),!a&&n==="opaque"&&(r.mark||r.role==="dielectric")&&(s("coverMark",r.mark?65:64),e.draw(6,o.coverCount,0,o.firstCover));let c={opaque:"coverAdd",blend:"coverBlend",mask:"coverLay",footprint:"footCover",onFoot:"coverOnFoot",offFoot:"coverOffFoot"}[n];s(a?"coverSubtract":c),e.draw(6,o.coverCount,0,o.firstCover),!a&&(o!==i||n==="footprint")&&(s("coverClear"),e.draw(6,o.coverCount,0,o.firstCover))}}gpuMemoryBytes(){let e=this.valuesBuffer===this.emptyValues?0:this.valuesBuffer.size;this.barrels&&(e+=this.barrels.count*vd),this.walls&&(e+=this.walls.count*wd);let r=new Set;for(let a of this.slices){for(let s of[a.shapes,a.covers,a.fans,a.uniform,a.edges,a.cuts])s&&r.add(s);a.field&&(e+=a.field.width*a.field.height*4)}for(let a of r)e+=a.size;return e}stats(){return{slices:this.slices.map(e=>({key:e.key,role:e.role||"copper",face:e.face,layerId:e.layerId,z:e.z,shapes:e.shapeCount,subtractShapes:e.subtractShapes,regionBatches:e.batches.length,fanVertices:e.lowered.fanVertices.length/2,covers:e.lowered.covers.length/6,approximations:e.lowered.stats})),overlay:this.overlay.mode,barrels:this.barrels?{count:this.barrels.count,skipped:this.barrels.skipped}:null,walls:this.walls?.count||0,gpuMemoryBytes:this.gpuMemoryBytes(),degraded:!this.stencil}}releaseSlices(){for(let r of this.twins?.values()||[])for(let a of Object.values(r))a.uniform.destroy();this.twinBuffers?.forEach(r=>r.destroy()),this.twinBuffers=[],this.twins=new Map;let e=new Set;for(let r of this.slices){for(let a of[r.shapes,r.covers,r.fans,r.uniform,r.edges,r.cuts])a&&e.add(a);r.field?.texture.destroy()}for(let r of e)r.destroy();this.slices=[]}destroy(){this.releaseSlices(),this.barrels?.buffer.destroy(),this.walls?.buffer.destroy(),this.arrows?.buffer.destroy(),this.drawnLayersBuffer.destroy(),this.palette.destroy(),this.netsBuffer.destroy(),this.barrelView.destroy(),this.layerOffsets.destroy(),this.valuesBuffer!==this.emptyValues&&this.valuesBuffer.destroy(),this.emptyValues.destroy(),this.emptyField.destroy()}};function Ew(t){let e=Sw(Array.from(t,Number));if(!e)return[0,0,-1,0];let r=l=>[0,1,2,3].map(f=>e[f]*l[0]+e[4+f]*l[1]+e[8+f]*l[2]+e[12+f]*l[3]),a=r([0,0,1,0]),s=Math.hypot(a[0],a[1],a[2]);if(Math.abs(a[3])>1e-9*Math.max(s,1e-30))return[a[0]/a[3],a[1]/a[3],a[2]/a[3],1];let n=r([0,0,1,1]),i=r([0,0,0,1]),o=[0,1,2].map(l=>i[l]/i[3]-n[l]/n[3]),c=Math.hypot(...o)||1;return[...o.map(l=>l/c),0]}function Sw(t){let e=new Array(16);e[0]=t[5]*t[10]*t[15]-t[5]*t[11]*t[14]-t[9]*t[6]*t[15]+t[9]*t[7]*t[14]+t[13]*t[6]*t[11]-t[13]*t[7]*t[10],e[4]=-t[4]*t[10]*t[15]+t[4]*t[11]*t[14]+t[8]*t[6]*t[15]-t[8]*t[7]*t[14]-t[12]*t[6]*t[11]+t[12]*t[7]*t[10],e[8]=t[4]*t[9]*t[15]-t[4]*t[11]*t[13]-t[8]*t[5]*t[15]+t[8]*t[7]*t[13]+t[12]*t[5]*t[11]-t[12]*t[7]*t[9],e[12]=-t[4]*t[9]*t[14]+t[4]*t[10]*t[13]+t[8]*t[5]*t[14]-t[8]*t[6]*t[13]-t[12]*t[5]*t[10]+t[12]*t[6]*t[9],e[1]=-t[1]*t[10]*t[15]+t[1]*t[11]*t[14]+t[9]*t[2]*t[15]-t[9]*t[3]*t[14]-t[13]*t[2]*t[11]+t[13]*t[3]*t[10],e[5]=t[0]*t[10]*t[15]-t[0]*t[11]*t[14]-t[8]*t[2]*t[15]+t[8]*t[3]*t[14]+t[12]*t[2]*t[11]-t[12]*t[3]*t[10],e[9]=-t[0]*t[9]*t[15]+t[0]*t[11]*t[13]+t[8]*t[1]*t[15]-t[8]*t[3]*t[13]-t[12]*t[1]*t[11]+t[12]*t[3]*t[9],e[13]=t[0]*t[9]*t[14]-t[0]*t[10]*t[13]-t[8]*t[1]*t[14]+t[8]*t[2]*t[13]+t[12]*t[1]*t[10]-t[12]*t[2]*t[9],e[2]=t[1]*t[6]*t[15]-t[1]*t[7]*t[14]-t[5]*t[2]*t[15]+t[5]*t[3]*t[14]+t[13]*t[2]*t[7]-t[13]*t[3]*t[6],e[6]=-t[0]*t[6]*t[15]+t[0]*t[7]*t[14]+t[4]*t[2]*t[15]-t[4]*t[3]*t[14]-t[12]*t[2]*t[7]+t[12]*t[3]*t[6],e[10]=t[0]*t[5]*t[15]-t[0]*t[7]*t[13]-t[4]*t[1]*t[15]+t[4]*t[3]*t[13]+t[12]*t[1]*t[7]-t[12]*t[3]*t[5],e[14]=-t[0]*t[5]*t[14]+t[0]*t[6]*t[13]+t[4]*t[1]*t[14]-t[4]*t[2]*t[13]-t[12]*t[1]*t[6]+t[12]*t[2]*t[5],e[3]=-t[1]*t[6]*t[11]+t[1]*t[7]*t[10]+t[5]*t[2]*t[11]-t[5]*t[3]*t[10]-t[9]*t[2]*t[7]+t[9]*t[3]*t[6],e[7]=t[0]*t[6]*t[11]-t[0]*t[7]*t[10]-t[4]*t[2]*t[11]+t[4]*t[3]*t[10]+t[8]*t[2]*t[7]-t[8]*t[3]*t[6],e[11]=-t[0]*t[5]*t[11]+t[0]*t[7]*t[9]+t[4]*t[1]*t[11]-t[4]*t[3]*t[9]-t[8]*t[1]*t[7]+t[8]*t[3]*t[5],e[15]=t[0]*t[5]*t[10]-t[0]*t[6]*t[9]-t[4]*t[1]*t[10]+t[4]*t[2]*t[9]+t[8]*t[1]*t[6]-t[8]*t[2]*t[5];let r=t[0]*e[0]+t[1]*e[4]+t[2]*e[8]+t[3]*e[12];return r?e.map(a=>a/r):null}function Tw(t,e,r=0){let a=new Map((e||[]).map(s=>[Number(s.id),s]));for(let s of t||[]){let n=a.get(Number(s.layerId));if(s.kind!=="copper"||!n||!s.quantMin||!s.quantSize)continue;let i=s.quantSize[2]===1;return s.quantMin[2]+(i?0:s.quantSize[2]/2)-Number(n.z_mm||0)/1e3}return Number(r||0)/1e3}async function rh({renderer:t,layers:e,colorFor:r,bytes:a,wasm:s,toleranceNm:n,nets:i=[],features:o=[],boardZOffsetMm:c=0}){let l=await Df(a,{wasm:s}),f=Tw(t.entries,e,c),{planned:u,unmatched:p}=Gf(l.header,e,f),b=new Map(e.map(T=>[Number(T.id),T])),h=performance.now(),d=new Map;for(let T of u)d.has(T.key)||d.set(T.key,l.lowerSlice(T.key,n));let x=u.map(T=>({...T,color:T.role==="copper"?r(b.get(T.layerId)):T.color||[1,1,1,1],lowered:d.get(T.key)})),g=performance.now()-h,y=new ln(t);y.setSlices(x);let m=x.find(T=>T.role==="dielectric"&&T.lowered?.contourEdges?.length)?.lowered.contourEdges,w=l.barrels();y.setBarrels(Vf(l.header,w,x,m));let E=new Set;for(let T=0;T<w.words.length;T+=on)E.add(w.words[T]);y.edgePlated=!!l.header.stack?.edge_plating,y.setWalls(Hf(x,d,e,f));let S=qf(l,i);y.setOperationNets(S),t.setAnalytic(y);let A=new Map;for(let T of o||[])T?.sourceUid&&(A.has(T.sourceUid)||A.set(T.sourceUid,[]),A.get(T.sourceUid).push(T));return{pack:l,analytic:y,unmatched:p,lowerMs:g,zOffset:f,operations:Eo(l.header),overlay:null,netIds:S,featuresBySource:A,barrelOperations:E}}function No(t,e){let r=t.pack.binding(e)?.source_uid,a=r?t.featuresBySource?.get(r)||[]:[],s=t.netIds?.[e]||0,n=a.find(i=>Number(i.netId)===s)||a[0];return n?Number(n.id):0}function ah(t,e){if(!e)return t.analytic.clearOverlay(),t.overlay=null,null;if(e.kind==="operation_values"){let r=So(e.values,t.operations),a=e.range||Cr(r);t.analytic.setOperationValues(r,a),t.overlay={...e,values:r,range:a}}else if(e.kind==="field_tiles"){let r=Kf(e.tiles),a=e.range||Cr([...r.values()].flatMap(s=>[...Cr(s.values)]));t.analytic.setFieldRasters(r,a),t.overlay={...e,range:a,slices:[...r.keys()]}}else if(e.kind==="field_grid"){let r=cn(e.grid),a=e.range||Cr([...r.values()].flatMap(n=>[...Cr(n.values)])),s=e.values?So(e.values,t.operations):null;t.analytic.setFieldRasters(r,a,s),t.overlay={kind:e.kind,quantity:e.quantity,units:e.units,range:a,slices:[...r.keys()],barrels:s,net:e.grid?.net??null}}else throw new TypeError(`unknown analytic overlay kind ${e.kind}`);return{kind:e.kind,range:t.overlay.range}}function Ro(t,e,r=!1){let[a,s]=Array.isArray(t.pitchMm)?t.pitchMm:[t.pitchMm,t.pitchMm],n=(e[0]-t.originMm[0])/a-.5,i=(e[1]-t.originMm[1])/s-.5,o=(x,g)=>x<0||g<0||x>=t.width||g>=t.height?NaN:t.values[g*t.width+x],[c,l]=[Math.floor(n),Math.floor(i)],[f,u]=[n-c,i-l],p=o(c,l),b=o(c+1,l),h=o(c,l+1),d=o(c+1,l+1);return[p,b,h,d].every(Number.isFinite)?(p*(1-f)+b*f)*(1-u)+(h*(1-f)+d*f)*u:r?NaN:o(Math.floor(n+.5),Math.floor(i+.5))}function Aw(t,e,r){let[a,s]=Array.isArray(t.pitchMm)?t.pitchMm:[t.pitchMm,t.pitchMm],n=(e[0]-t.originMm[0])/a-.5,i=(e[1]-t.originMm[1])/s-.5,o=NaN,c=1/0;for(let l=Math.floor(i)-r+1;l<=Math.floor(i)+r;l+=1)for(let f=Math.floor(n)-r+1;f<=Math.floor(n)+r;f+=1){if(f<0||l<0||f>=t.width||l>=t.height)continue;let u=t.values[l*t.width+f],p=(f-n)**2+(l-i)**2;Number.isFinite(u)&&p<c&&([o,c]=[u,p])}return o}function sh(t){let e=new Map;for(let r of t.analytic.slices){if(!r.field||!(r.role===void 0||r.role==="copper"))continue;let a=e.get(r.layerId);(!a||r.z>a.z)&&e.set(r.layerId,r)}return[...e.values()].map(r=>({slice:r,key:r.key,layerId:r.layerId,cells:r.field.values.reduce((a,s)=>a+(Number.isFinite(s)?1:0),0)}))}function nh(t,e){if(!e)return 0;let r=(t||[]).find(a=>a?.name===e)||(t||[]).find(a=>(a?.aliases||[]).includes(e));return r&&Number(r.id)||0}var eh=48,Iw=70,th=2e-6,_w=.95;function Rw(t,e,r,{spacingMm:a=null,floor:s=.001,density:n=Iw,width:i=.07,minLength:o=.3}={}){let c=t.filter(m=>m.role==="copper"&&e.has(m.key)&&r.has(m.key)&&m.face===(m.bottom?"bottom":"top"));if(!c.length)return{data:new ArrayBuffer(0),count:0,spacingMm:0,max:0,reference:0};let l=c.reduce((m,w)=>[Math.min(m[0],w.bounds[0]),Math.min(m[1],w.bounds[1]),Math.max(m[2],w.bounds[2]),Math.max(m[3],w.bounds[3])],[1/0,1/0,-1/0,-1/0]),f=a||Math.max(l[2]-l[0],l[3]-l[1])/n,u=[];for(let m of c){let[w,E]=[e.get(m.key),r.get(m.key)],[S,A,T,_]=m.bounds;for(let R=l[0]+Math.ceil((S-l[0])/f)*f+f/2;R<=T;R+=f)for(let N=l[1]+Math.ceil((A-l[1])/f)*f+f/2;N<=_;N+=f){let B=Ro(w,[R,N],!0),F=Ro(E,[R,N],!0),K=Math.hypot(B,F);K>0&&u.push({face:m,x:R,y:N,jx:B,jy:F,size:K})}}let p=u.map(m=>m.size).sort((m,w)=>m-w),b=p.length?p[p.length-1]:0,h=p.length?p[Math.min(p.length-1,Math.floor(_w*p.length))]:0,d=u.filter(m=>m.size>=s*h),x=new ArrayBuffer(d.length*eh),g=new Float32Array(x),y=new Uint32Array(x);return d.forEach((m,w)=>{let E=w*(eh/4),[S,A]=m.face.offsetLayers||[m.face.layerId,m.face.layerId],T=m.face.bottom?-th:th,_=Math.min(1,m.size/h),R=.9*f*(o+(1-o)*Math.sqrt(_))/1e3;g.set([m.x/1e3,-m.y/1e3,m.face.z+T,i*f/1e3,m.jx/m.size,-m.jy/m.size,R,_],E),y.set([S,A,0,0],E+8)}),{data:x,count:d.length,spacingMm:f,max:b,reference:h}}function Co(t,e){if(!e)return t.analytic.setArrows(null),t.vectors=null,t.vectorInput=null,null;let r=t.analytic.style,a=Rw(t.analytic.slices,cn(e.x),cn(e.y),{density:r.arrowDensity,width:r.arrowWidth,minLength:r.arrowMinLength});return t.analytic.setArrows(a),t.vectorInput=e,t.vectors={quantity:e.quantity,units:e.units,max:a.max,reference:a.reference,spacingMm:a.spacingMm},{count:a.count,max:a.max,reference:a.reference,spacingMm:a.spacingMm}}function ih(t,e){let r=t.analytic.style,a=t.analytic.setStyle(e);return["arrowDensity","arrowWidth","arrowMinLength"].some(n=>r[n]!==a[n])&&t.vectorInput&&Co(t,t.vectorInput),a}function oh(t,e){for(let r of t?.chunks||[]){let a=Number(r.first_operation_index);if(e>=a&&e<a+Number(r.operation_count||0))return r.slice_key}return null}function dn(t,e,r,a=null,s=null,n=0){let i=null;for(let o of t.analytic.slices){if(!o.field||Math.abs(e.direction[2])<1e-12||a&&o.key!==a||s&&!s.has(Number(o.layerId)))continue;let[c,l]=o.offsetLayers||[o.layerId,o.layerId],f=o.z+.5*((r?.[c]||0)+(r?.[l]||0)),u=(f-e.origin[2])/e.direction[2];if(!a&&!(u>0)||i&&u>=i.t)continue;let p=[e.origin[0]+u*e.direction[0],e.origin[1]+u*e.direction[1],f],b=[p[0]*1e3,-p[1]*1e3],h=Ro(o.field,b);!Number.isFinite(h)&&n>0&&(h=Aw(o.field,b,n)),Number.isFinite(h)&&(i={t:u,value:h,sliceKey:o.key,boardMm:b,world:p})}return i&&{value:i.value,sliceKey:i.sliceKey,boardMm:i.boardMm,world:i.world}}function Bo(t,e,r=null){let a=t.overlay,s=a?.kind==="operation_values"?a.values[e]:a?.barrels?.[e],n=a?.kind!=="operation_values"&&Number.isFinite(s)&&(!t.barrelOperations||t.barrelOperations.has(e)),i=a?.kind==="operation_values"||n?s:r?.value;return n&&(r={...r,sliceKey:"via barrel"}),{operationIndex:e,featureId:No(t,e)||null,binding:t.pack.binding(e),...Number.isFinite(i)?{value:i,quantity:a.quantity,units:a.units}:{},...r?{sliceKey:r.sliceKey,boardMm:r.boardMm,world:r.world}:{}}}var Nw=2048,Cw=.22,ch=2,lh=1024,dh=160;function Bw(t,e,r){let a=Float32Array.from(t,o=>Number.isFinite(o)?o:NaN),s=new Int32Array(e*r),n=0,i=0;for(let o=0;o<a.length;o+=1)Number.isFinite(a[o])&&(s[i++]=o);for(;n<i;){let o=s[n++],c=o%e,l=(o-c)/e;for(let[f,u]of[[c-1,l],[c+1,l],[c,l-1],[c,l+1]]){if(f<0||u<0||f>=e||u>=r)continue;let p=u*e+f;Number.isFinite(a[p])||(a[p]=a[o],s[i++]=p)}}return a}function Fw(t,e,r){let[a,s,n,i]=t,o=(n-a)/1e3,c=(i-s)/1e3,l=(a+n)/2e3,f=-(s+i)/2e3,u=r-e||1;return new Float32Array([2/o,0,0,0,0,2/c,0,0,0,0,1/u,0,-2*l/o,-2*f/c,-e/u,1])}function Ow(t,e=Nw){let r=t[2]-t[0],a=t[3]-t[1],s=e/Math.max(r,a,1e-9);return[Math.max(1,Math.round(r*s)),Math.max(1,Math.round(a*s))]}var Pw=`
const PICK_TAG = ${2147483648}u;
struct Chosen { net: u32, pad0: u32, pad1: u32, pad2: u32 };
@group(0) @binding(0) var picked: texture_2d<u32>;
@group(0) @binding(1) var<storage, read> nets: array<u32>;
@group(0) @binding(2) var<uniform> chosen: Chosen;

@vertex fn vs_full(@builtin(vertex_index) vertex: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((vertex << 1u) & 2u), f32(vertex & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

@fragment fn fs_net(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let hit = textureLoad(picked, vec2u(position.xy), 0);
  if ((hit.x & PICK_TAG) == 0u || hit.y == 0u) { return vec4f(0.0); }
  let operation = hit.y - 1u;
  if (chosen.net != 0u) {
    let net = select(0u, nets[operation], operation < arrayLength(&nets));
    if (net != chosen.net) { return vec4f(0.0); }
  }
  return vec4f(1.0);
}
`,jw=`
struct Relief {
  viewProjection: mat4x4f,
  // Board millimetres the grid and the mask span: x0, y0, x1, y1.
  bounds: vec4f,
  // The raster: origin (mm), pitch (mm).
  fieldOrigin: vec2f,
  fieldPitch: vec2f,
  fieldSize: vec2u,
  grid: vec2u,
  // Value range, base height (m), full height (m).
  range: vec2f,
  base: f32,
  height: f32,
  light: vec4f,
};
@group(0) @binding(0) var<uniform> relief: Relief;
@group(0) @binding(1) var field: texture_2d<f32>;
@group(0) @binding(2) var mask: texture_2d<f32>;
@group(0) @binding(3) var maskSampler: sampler;

const ABSENT = 3e38;
fn present(value: f32) -> bool { return value < 1e38; }

PALETTE

fn cell(i: i32, j: i32) -> f32 {
  let size = vec2i(relief.fieldSize);
  if (i < 0 || j < 0 || i >= size.x || j >= size.y) { return ABSENT; }
  return textureLoad(field, vec2i(i, j), 0).r;
}

// The raster at a board point (mm): bilinear where all four cells hold a
// value, else the nearest that does, else absent.
fn sampleField(board: vec2f) -> f32 {
  let uv = (board - relief.fieldOrigin) / relief.fieldPitch - vec2f(0.5);
  let base = vec2i(floor(uv));
  let f = uv - floor(uv);
  let s00 = cell(base.x, base.y);
  let s10 = cell(base.x + 1, base.y);
  let s01 = cell(base.x, base.y + 1);
  let s11 = cell(base.x + 1, base.y + 1);
  if (present(s00) && present(s10) && present(s01) && present(s11)) {
    return mix(mix(s00, s10, f.x), mix(s01, s11, f.x), f.y);
  }
  let nearest = vec2i(floor(uv + vec2f(0.5)));
  return cell(nearest.x, nearest.y);
}

fn share(value: f32) -> f32 {
  return clamp((value - relief.range.x) / max(relief.range.y - relief.range.x, 1e-30), 0.0, 1.0);
}

fn lift(board: vec2f) -> f32 {
  let value = sampleField(board);
  return relief.base + select(0.0, share(value) * relief.height, present(value));
}

struct ReliefOut {
  @builtin(position) position: vec4f,
  @location(0) board: vec2f,
  @location(1) normal: vec3f,
};

@vertex fn vs_relief(@builtin(vertex_index) vertex: u32) -> ReliefOut {
  var corners = array<vec2u, 6>(vec2u(0u, 0u), vec2u(1u, 0u), vec2u(0u, 1u), vec2u(0u, 1u), vec2u(1u, 0u), vec2u(1u, 1u));
  let quad = vertex / 6u;
  let cells = relief.grid - vec2u(1u);
  let at = vec2u(quad % cells.x, quad / cells.x) + corners[vertex % 6u];
  let t = vec2f(at) / vec2f(cells);
  let board = mix(relief.bounds.xy, relief.bounds.zw, t);
  let z = lift(board);
  // The slope from neighbouring grid points (world metres; board y runs down).
  let step = (relief.bounds.zw - relief.bounds.xy) / vec2f(cells);
  let dx = (lift(board + vec2f(step.x, 0.0)) - lift(board - vec2f(step.x, 0.0))) / (0.002 * step.x);
  let dy = (lift(board + vec2f(0.0, step.y)) - lift(board - vec2f(0.0, step.y))) / (0.002 * step.y);
  var out: ReliefOut;
  out.position = relief.viewProjection * vec4f(board.x * 0.001, -board.y * 0.001, z, 1.0);
  out.board = board;
  out.normal = normalize(vec3f(-dx, dy, 1.0));
  return out;
}

@fragment fn fs_relief(input: ReliefOut) -> @location(0) vec4f {
  let uv = (input.board - relief.bounds.xy) / (relief.bounds.zw - relief.bounds.xy);
  if (textureSampleLevel(mask, maskSampler, uv, 0.0).r < 0.5) { discard; }
  let value = sampleField(input.board);
  if (!present(value)) { discard; }
  let normal = normalize(input.normal);
  let diffuse = max(dot(normal, normalize(relief.light.xyz)), 0.0);
  let color = fieldColor(share(value)) * (0.72 + 0.38 * diffuse);
  return vec4f(min(color, vec3f(1.0)), 1.0);
}
`,Lw=`
struct Palette {
  ramps: array<vec4f, 512>,
  outline: vec4f,
};
@group(0) @binding(4) var<uniform> palette: Palette;
fn ramp(t: f32, which: u32) -> vec3f {
  let x = clamp(t, 0.0, 1.0) * 255.0;
  let i = u32(floor(x));
  let j = min(i + 1u, 255u);
  return mix(palette.ramps[which * 256u + i].rgb, palette.ramps[which * 256u + j].rgb, x - floor(x));
}
fn fieldColor(t: f32) -> vec3f {
  return ramp(t, 0u);
}
`,un=class{constructor(e){this.analytic=e,this.renderer=e.renderer,this.device=e.device,this.uniform=this.device.createBuffer({label:"relief",size:dh,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.scratch=new ArrayBuffer(dh),this.sampler=this.device.createSampler({magFilter:"linear",minFilter:"linear"}),this.layer=null,this.vertexCount=0}get ready(){return this.vertexCount>0}pipeline(){if(this.reliefPipeline)return this.reliefPipeline;let e=this.device.createShaderModule({label:"relief",code:jw.replace("PALETTE",Lw)});return this.reliefPipeline=this.device.createRenderPipeline({label:"relief",layout:"auto",vertex:{module:e,entryPoint:"vs_relief"},fragment:{module:e,entryPoint:"fs_relief",targets:[{format:this.renderer.format}]},primitive:{topology:"triangle-list",cullMode:"none"},depthStencil:{format:this.renderer.depthFormat,depthWriteEnabled:!0,depthCompare:"greater"},multisample:{count:this.renderer.sampleCount||1}}),this.reliefPipeline}netPipeline(){if(this.netMaskPipeline)return this.netMaskPipeline;let e=this.device.createShaderModule({label:"relief-net-mask",code:Pw});return this.netMaskPipeline=this.device.createRenderPipeline({label:"relief-net-mask",layout:"auto",vertex:{module:e,entryPoint:"vs_full"},fragment:{module:e,entryPoint:"fs_net",targets:[{format:"r8unorm"}]},primitive:{topology:"triangle-list"}}),this.netMaskPipeline}build(e,{range:r,netId:a=0,heightShare:s=Cw}={}){this.release();let n=e?.field;if(!n)return!1;let i=this.boundsOf(e),[o,c]=Ow(i),l=this.renderMask(e.layerId,i,o,c);this.mask=this.filterMask(l,o,c,a),l.destroy();let f=Bw(n.values,n.width,n.height),u=Float32Array.from(f,x=>Number.isFinite(x)?x:3e38);this.field=this.device.createTexture({label:"relief-field",size:[n.width,n.height],format:"r32float",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST}),this.device.queue.writeTexture({texture:this.field},u,{bytesPerRow:n.width*4},[n.width,n.height]);let[p,b]=Array.isArray(n.pitchMm)?n.pitchMm:[n.pitchMm,n.pitchMm],h=Math.max(i[2]-i[0],i[3]-i[1])/1e3,d=[Math.min(lh,Math.max(2,Math.ceil((i[2]-i[0])/p*ch)+1)),Math.min(lh,Math.max(2,Math.ceil((i[3]-i[1])/b*ch)+1))];return this.layer=e.layerId,this.sliceKey=e.key,this.boundsMm=i,this.base=e.z,this.height=h*s,this.grid=d,this.vertexCount=(d[0]-1)*(d[1]-1)*6,this.params={field:n,pitch:[p,b],range:r||[0,1]},this.bindGroup=this.device.createBindGroup({layout:this.pipeline().getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniform}},{binding:1,resource:this.field.createView()},{binding:2,resource:this.mask.createView()},{binding:3,resource:this.sampler},{binding:4,resource:{buffer:this.analytic.palette}}]}),this.renderer.invalidate?.(),!0}boundsOf(e){let r=this.analytic.slices.filter(n=>n.layerId===e.layerId&&(n.role===void 0||n.role==="copper")),a=(r.length?r:[e]).map(n=>n.bounds),s=.05;return[Math.min(...a.map(n=>n[0]))-s,Math.min(...a.map(n=>n[1]))-s,Math.max(...a.map(n=>n[2]))+s,Math.max(...a.map(n=>n[3]))+s]}renderMask(e,r,a,s){let{analytic:n,renderer:i,device:o}=this,c=n.extent,l=(c?.[0][2]??-.01)-.001,f=(c?.[1][2]??.01)+.001,u=Fw(r,l,f),p=o.createTexture({label:"relief-pick",size:[a,s],format:"rg32uint",usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING}),b=o.createTexture({label:"relief-pick-depth",size:[a,s],format:i.depthFormat,usage:GPUTextureUsage.RENDER_ATTACHMENT}),h={view:b.createView(),depthClearValue:0,depthLoadOp:"clear",depthStoreOp:"discard"};i.stencil&&Object.assign(h,{stencilClearValue:0,stencilLoadOp:"clear",stencilStoreOp:"discard"});let d=o.createCommandEncoder(),x=d.beginRenderPass({colorAttachments:[{view:p.createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}],depthStencilAttachment:h}),g=i.innerCopperMode;i.innerCopperMode="all";try{i.writeGlobals(u,0,0,0,0),i.stencil&&x.setStencilReference(1),n.encodeInto(x,null,new Set([e]),!0,{matrix:u,showBoard:!1})}finally{i.innerCopperMode=g}return x.end(),o.queue.submit([d.finish()]),b.destroy(),p}filterMask(e,r,a,s){let{device:n}=this,i=n.createTexture({label:"relief-mask",size:[r,a],format:"r8unorm",usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING}),o=n.createBuffer({label:"relief-net",size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});n.queue.writeBuffer(o,0,new Uint32Array([s>>>0,0,0,0]));let c=this.netPipeline(),l=n.createBindGroup({layout:c.getBindGroupLayout(0),entries:[{binding:0,resource:e.createView()},{binding:1,resource:{buffer:this.analytic.netsBuffer}},{binding:2,resource:{buffer:o}}]}),f=n.createCommandEncoder(),u=f.beginRenderPass({colorAttachments:[{view:i.createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}]});return u.setPipeline(c),u.setBindGroup(0,l),u.draw(3),u.end(),n.queue.submit([f.finish()]),o.destroy(),i}encode(e,r){if(!this.ready)return 0;let a=new Float32Array(this.scratch),s=new Uint32Array(this.scratch);return a.set(r,0),a.set(this.boundsMm,16),a.set(this.params.field.originMm,20),a.set(this.params.pitch,22),s[24]=this.params.field.width,s[25]=this.params.field.height,s[26]=this.grid[0],s[27]=this.grid[1],a.set(this.params.range,28),a[30]=this.base,a[31]=this.height,a.set([.35,.45,.82,0],32),this.device.queue.writeBuffer(this.uniform,0,this.scratch),e.setPipeline(this.pipeline()),e.setBindGroup(0,this.bindGroup),e.draw(this.vertexCount),1}worldBounds(){if(!this.ready)return null;let[e,r,a,s]=this.boundsMm;return[e/1e3,-s/1e3,this.base,a/1e3,-r/1e3,this.base+this.height]}release(){this.mask?.destroy(),this.field?.destroy(),this.mask=null,this.field=null,this.bindGroup=null,this.vertexCount=0,this.layer=null}destroy(){this.release(),this.uniform.destroy()}};var uh=512*1024*1024,Dw=.65,Uw=1.5,zw=15e3,Gw=120,Kw=12,Vw=48,_h=230,Xo=document,St,j,Fe,xn,vn,wn,jr,Fn,pt,hn,Na,ht,nt,ve,De,bn,Mn,Ca,Be,te,On,Pn,Le,Fr,hr,Ye,Et,kn,Or,Y=t=>Xo.querySelector(t),fr=t=>Xo.querySelectorAll(t);function Rh(t=document){Xo=t,St=Y("#app"),j=Y("#viewport"),Fe=Y("#schematic-viewport"),xn=Y("#schematic-dom-layer"),vn=Y("#schematic-flow-overlay"),wn=Y("#bom-view"),jr=Y("#status")||{set textContent(e){}},Fn=Y("#viewer-kind")||{set textContent(e){}},pt=Y("#selection")||{set textContent(e){}},hn=Y("#diagnostics")||{set innerHTML(e){}},Na=Y("#scene-stats"),ht=Y("#lod-tuning"),nt=Y("#layers"),ve=Y("#search-controls"),De=Y("#view-controls"),Le=Y("#stackup-workspace-view"),bn=Y("#fallback"),Mn=Y("#panel-labels"),Ca=Y("#schematic-labels"),Be=Y("#axis-gizmo"),te=Y("#selection-card"),On=Y("#primary-heading"),Pn=Y("#primary-description"),Fr=Y("#mode-switch"),hr=Y("#system-labels"),Ye=Y("#move-gizmo"),Et=Y("#system-help"),kn=Y("#system-harnesses"),Or=Y("#harness-nodes"),Or?.addEventListener("pointermove",e=>kb(e)),Or?.addEventListener("pointerup",e=>Eb(e)),St.classList.add("workspace-pcb")}var Hw=["soldermask","silkscreen","paste"],qw=Object.freeze([{role:"soldermask",side:"front",name:"F.Mask"},{role:"soldermask",side:"back",name:"B.Mask"},{role:"silkscreen",side:"front",name:"F.SilkS"},{role:"silkscreen",side:"back",name:"B.SilkS"},{role:"paste",side:"front",name:"F.Paste"},{role:"paste",side:"back",name:"B.Paste"}]),Ww={soldermask:"#1f6b45",silkscreen:"#f2f2f2",paste:"#a0a3a8"};function Nh(){return{workspace:"pcb",clickSelect:!0,mode:"3d",activeNetId:0,selectedFeatureId:0,selectedOccurrence:0,selectionAnchor:null,showBoard:!0,showComponents:!0,showPlaceholders:!0,realisticColors:!0,hiddenBoardLayers:[],isolateNet:!1,savedShowBoard:!0,savedShowComponents:!0,preIsolationShowBoard:null,separation:0,dragging:!1,dragMode:"orbit",lastX:0,lastY:0,pointerStartX:0,pointerStartY:0,frameCpuMs:0,frameCpuP95Ms:0,frameIntervalMs:0,frameIntervalP95Ms:0,frameSamples:[],fps:0,frames:0,fpsAt:performance.now(),activeTab:"layers",selectedPageId:"",selectedSchematicFeature:null,schematicDragging:!1,schematicLastX:0,schematicLastY:0,schematicStartX:0,schematicStartY:0}}function ja(t={}){return{key:t.key??"board",topology:t.topology||window.__TOPOLOGY__||{},semanticGeometry:t.semanticGeometry||window.__SEMANTIC_GEOMETRY__||{},viewerReadiness:t.readiness||{stage:"semantic-ready",progress:100},assetCache:t.assetCache||null,deferComponents:!!t.deferComponents,scene:Xw(),renderer:null,compareLayers:new Set,desiredCompareLayers:new Set,visible3dLayers:new Set,preIsolation3dLayers:null,preIsolationCompareLayers:null,highlightedNetIds:new Set,hiddenComponents:new Set,hiddenComponentRequest:null,loadedBytes:0,triangles:0,residentTileBytes:0,residentTileGpuBytes:0,residentTileTriangles:0,tileLoads:0,tileEvictions:0,tileSchedulerMs:0,lastTileScheduleAt:0,visibleTileIds:new Set,gpuBytes:0}}function Xw(){return{manifest:null,manifestUrl:"",layers:[],copperLayers:[],nets:[],features:new Map,tiles:new Map,loaded:new Set,loading:new Map,failed:new Map,residentTiles:new Map,componentFeatures:new Map,componentModelCounts:new Map,componentTier:"idle",componentEntries:[],componentsWantedAt:0,componentEvictions:0,runtimeBounds:null,layerZOffsets:new Float32Array(256),layerZOffsetSignature:""}}function Ch(){return{key:"",started:0,from:new Map,current:new Map}}function Bh(){return{phase:"idle",previous:new Set,target:new Set,previousOffsets:new Map,started:0}}function Fh(){return{manifest:null,manifestUrl:"",pages:[],byId:new Map,activeNetUid:"",visiblePages:[],fitted:!1,rendererMode:new URLSearchParams(location.search).get("schematicRenderer")||"svg-dom",domFallbackReason:""}}var M=Nh(),k=ja(),v=null,Ie=Ch(),W=Bh(),D=Fh(),En=[],$w=5e3,Yw=5e3,C,Z,it,U,J,br=new Map,Zt=performance.now(),we=0,pn=0,La=null,Sn=null,Tn=null,Fo=!1,Ge=!1,jn=()=>!0,Ba=!0;!window.__PRISM_SEMANTIC_VIEWER_MANUAL_BOOT__&&document.getElementById("app")&&Yo().catch(t=>{console.error(t),jr&&(jr.textContent="Renderer failed"),bn&&(bn.hidden=!1,bn.textContent=t.stack||t.message||String(t))});function Oh(t){let e=new Map((t.components||[]).map(a=>[a.uid,a])),r={};for(let a of t.terminals||[]){let s=a.net_uid;if(!s)continue;let n=e.get(a.component_uid)||{},i={designator:a.designator||n.designator||"",pin:a.pin||"",value:n.value||"",pcb_pad_id:a.pcb_pad_id||"",pcb_pad_source_uid:a.pcb_pad_source_uid||""};r[s]||(r[s]={terminals:[]});let o=r[s].terminals;o.some(c=>c.designator===i.designator&&c.pin===i.pin)||o.push(i)}return r}function Jw(t,e=k){if(!t||!e.scene?.features)return 0;let r=t.pcb_pad_source_uid||"";if(!r&&t.pcb_pad_id&&(r=(e.topology?.physical_objects||[]).find(s=>s.uid===t.pcb_pad_id)?.source_ids?.[0]||""),!r)return 0;for(let[a,s]of e.scene.features.entries())if(s.sourceUid===r&&s.kind==="pad")return a;return 0}function $o(t,e=k){return!t||!e.topology||!e.topology.components?null:e.topology.components.find(r=>r.designator===t)}function fn(t,e){for(let r of Object.keys(t))delete t[r];Object.assign(t,e)}function Ph(){if(pn&&(cancelAnimationFrame(pn),pn=0),window.removeEventListener("keydown",ep),v){for(let t of v.boards.values())t.abort?.abort();v.scene.dispose(),v=null}else jo(),k.renderer?.dispose?.();k.renderer=null,C=null,Z?.dispose?.(),Z=null,it=null,La=null,jn=()=>!0,Ba=!0}function jh(){return we+=1,Ph(),fn(M,Nh()),k=ja(),fn(Ie,Ch()),fn(W,Bh()),fn(D,Fh()),En=[],U=null,J=null,br=new Map,Zt=performance.now(),we}function Lh(t){t===we&&(we+=1,Ph())}function Fa(t){t===we&&(pn=requestAnimationFrame(e=>pM(e,t)))}function he(t){return t===we}async function Yo(t={}){let e=jh(),r={};if(k.topology=t.topology||window.__TOPOLOGY__||{},k.topology&&!k.topology.net_details&&(k.topology.net_details=Oh(k.topology)),k.semanticGeometry=t.semanticGeometry||window.__SEMANTIC_GEOMETRY__||{},k.viewerReadiness=t.readiness||k.semanticGeometry.readiness||{stage:"semantic-ready",progress:100},La=typeof t.onSelectionChange=="function"?t.onSelectionChange:null,Tn=typeof t.onContextMenu=="function"?t.onContextMenu:null,Sn=typeof t.onViewStateChange=="function"?t.onViewStateChange:null,jn=typeof t.isActive=="function"?t.isActive:()=>!0,Ba=t.workspaceScope!=="3d",k.assetCache=t.assetCache||null,M.gpuBudgetBytes=rn,Rh(t.root||document),!St||!j)throw new Error("Semantic viewer shell is missing required DOM nodes");return await e1(e,r,t.onPerformanceEvent),{performance:r,...Dh(),selectOccurrence:Zw,setHighlightedNetIds(a){k.highlightedNetIds=a,k.renderer?.setEmphasizedNetIds(a)},refreshResidency(){Me(performance.now(),{force:!0})},resize(){k.renderer?.resize(),C?.resize(),M.workspace==="pcb"&&M.mode==="layer"&&fc()},setWorkspace(a){let s=a==="stackup"?"stackup":"pcb";M.workspace!==s&&$b(s)},setHiddenComponents:Wb,getComponentReferences(){return[...k.scene.componentFeatures.keys()]},async loadAnalyticPack(a,s={}){return k.renderer?(jo(),k.analytic=await rh({renderer:k.renderer,layers:k.scene.layers,colorFor:n=>{let i=uc(n,k);return i.length>=4?i.slice(0,4):[...i,1]},bytes:a,wasm:s.wasm,toleranceNm:s.toleranceNm,nets:k.scene.manifest?.nets,features:k.scene.manifest?.objectFeatures,boardZOffsetMm:k.scene.manifest?.boardZOffsetMm}),fh()):null},setAnalyticOverlay(a){if(!k.analytic)return null;let s=ah(k.analytic,a);return k.reliefOptions&&hh(!1),s},setAnalyticRelief(a){return k.reliefOptions=a||null,hh(!0)},setAnalyticVectors(a){return k.analytic?Co(k.analytic,a):null},setAnalyticStyle(a){return k.analytic?ih(k.analytic,a):null},analyticColormaps(){return{colormaps:go,defaults:ya}},setClickSelect(a){M.clickSelect=a!==!1},analyticProbe(a,s){if(!k.analytic?.overlay||k.analytic.overlay.kind==="operation_values")return null;let n=Sh(a,s);if(!n)return null;let i=M.mode==="3d"?k.visible3dLayers:null,o=dn(k.analytic,n,Nn(),null,i,1);if(!o)return null;let{quantity:c,units:l}=k.analytic.overlay;return{value:o.value,quantity:c,units:l,sliceKey:o.sliceKey,boardMm:o.boardMm,world:o.world,marker:Eh(o.world)}},async analyticAt(a,s){if(!k.analytic)return null;let n=await Qb(a,s);if(n?.kind!=="analytic")return null;let i=Sh(a,s);if(!i||k.analytic.overlay?.kind==="operation_values")return Bo(k.analytic,n.operationIndex);let o=Nn(),c=oh(k.analytic.pack.header,n.operationIndex),l=c&&dn(k.analytic,i,o,c)||dn(k.analytic,i,o),f=Bo(k.analytic,n.operationIndex,l);return l?{...f,marker:Eh(l.world)}:f},analyticStats:fh,unloadAnalyticPack(){jo()},setLodOverride(a){k.renderer?.setLodOverride(a)},projectComponent(a){return Zb(k,a,s=>ur(s,$e))},projectPoint(a){return ur(a,$e)},setViewMode:Db,renderInset:mM,insetReady:Bb,releaseInset(a){Pa.release(a)},insetBoard:()=>({scene:k.scene,topology:k.topology}),onSceneChange(a){return Rn.add(a),()=>Rn.delete(a)},insetStats(){return{...gn,views:Pa.size,targets:[ae.width,ae.height]}},insetSettings(a){return Object.assign(Ho,a||{}),{...Ho}},gpuIdle(){return k.renderer?.device.queue.onSubmittedWorkDone()??Promise.resolve()},dispose(){Qw(),Lh(e)}}}function fh(){let t=k.analytic;return t?{operations:t.operations,lowerMs:t.lowerMs,zOffset:t.zOffset,unmatched:t.unmatched,...t.analytic.stats()}:null}function hh(t){let e=k.renderer;if(!e)return null;let r=k.reliefOptions,a=k.analytic?.overlay;if(!r||!a||a.kind==="operation_values"){let i=e.relief?.ready;return e.relief?.release(),i&&t&&U.frame(tr()),e.invalidate?.(),null}let s=sh(k.analytic).sort((i,o)=>o.cells-i.cells),n=s.find(i=>i.key===r.sliceKey)||s[0];return n?(e.relief??=new un(k.analytic.analytic),e.relief.build(n.slice,{range:a.range,netId:nh(k.scene.manifest?.nets,a.net),heightShare:r.heightShare}),t&&U.frame(e.relief.worldBounds()),e.invalidate?.(),{sliceKey:n.key,slices:s.map(i=>({key:i.key,layerId:i.layerId,cells:i.cells}))}):(e.relief?.release(),e.invalidate?.(),{sliceKey:null,slices:[]})}function jo(){k.renderer?.relief?.destroy(),k.renderer&&(k.renderer.relief=null),k.renderer?.setAnalytic(null),k.analytic?.pack.free(),k.analytic=null}function Dh(){return{nets:()=>k.scene.nets,quietly(t){Ge=!0;try{t()}finally{Ge=!1}},selectNet:gc,selectFeature:yr,selectComponent:mc,clearSelection:Oe,anyEmphasis:Kr,showNetProbe:Qo,restoreVisibility:Vh,isolating:()=>M.isolateNet,isolateLitNets:zr,setNetIsolation:Hr,setGpuBudget(t){M.gpuBudgetBytes=t;for(let e of v?v.boards.values():[k])e.tiersCheckedAt=0},setStatsOverlay:ab,stats:rb,pickAt(t,e){return Qb(t,e)},getViewState:Uh,setLayerVisible:Ub,applyLayerPreset:zb,setShowBoard:Gb,setShowComponents:Kb,setShowPlaceholders:BM,setRealisticColors:PM,setBoardLayerVisible:OM,setSeparation:Vb,showNetLayers:pc}}function Qw(){ae.depth?.destroy(),Object.assign(ae,{canvas:null,context:null,depth:null,depthView:null,width:0,height:0}),Pa.clear(),Rn.clear(),Pr=null}function At(){!Sn||Fo||(Fo=!0,queueMicrotask(()=>{Fo=!1,Sn?.(Uh())}))}function Uh(){let t=M.mode==="3d"?k.visible3dLayers:k.desiredCompareLayers;return{mode:M.mode,layers:k.scene.copperLayers.map(e=>({id:Number(e.id),name:String(e.name),color:qn(Hn(e)),visible:t.has(Number(e.id))})),boardLayers:FM(),showBoard:M.showBoard,showComponents:M.showComponents,showPlaceholders:M.showPlaceholders,realisticColors:M.realisticColors,separation:v?v.separation.get(Oa())||0:M.separation,isolateNet:M.isolateNet,hasNet:!!M.activeNetId||Kr(),...v?{boards:P1(),selectedBoard:Oa()}:{}}}function Ln(t){if(v?.move.enabled&&Ua(),Ge)return;let e=k.renderer&&!k.renderer.identityOnly?k.renderer.occurrenceKeys[M.selectedOccurrence]:null;La?.(t&&e!=null?{...t,occurrence:e}:t)}function Zw(t){let e=k.renderer?.occurrenceKeys.indexOf(String(t))??-1;e>=0&&(M.selectedOccurrence=e)}function Jo(t){if(!t||!k.renderer||k.renderer.identityOnly)return t;let e=k.renderer.occurrenceMatrices[M.selectedOccurrence];return e?xt(e,t):t}function zh(t,e=null){return t?{kind:"net",sourceContext:"3D",netName:String(t.name||""),netUid:String(t.uid||"")||void 0,netCode:Number(t.id||0)||void 0,featureId:Number(e?.id||0)||void 0,uuid:String(e?.sourceUid||"")||void 0}:null}function Gh(t,e=k){if(!t)return null;let r=Gr(t),a=String(t.padNumber||t.pin||t.pinNumber||""),s=e.scene.nets.find(n=>Number(n.id)===Number(t.netId||0));if(r&&a)return{kind:"terminal",sourceContext:"3D",reference:r,pin:a,netUid:s?.uid,netName:s?.name,netCode:s?Number(s.id):void 0,uuid:String(t.sourceUid||"")||void 0,featureId:Number(t.id||0)||void 0};if(r){let n=$o(r,e);return{kind:"component",sourceContext:"3D",reference:r,componentUid:n?.uid,uuid:String(t.sourceUid||"")||void 0,featureId:Number(t.id||0)||void 0}}return zh(s,t)}function Kh(){M.showBoard=!0,M.showComponents=!0,mr(),typeof Pe=="function"&&Pe()}function Kr(){return Lr().size>0||!!v?.emphasisSets.length}function Lr(){let t=new Set(k.highlightedNetIds);return M.activeNetId&&t.add(Number(M.activeNetId)),t}function Qo(){(M.showBoard||M.showComponents)&&(M.savedShowBoard=M.showBoard,M.savedShowComponents=M.showComponents),M.showBoard=!1,M.showComponents=!1,mr(),typeof Pe=="function"&&Pe()}function Vh(){M.showBoard=M.savedShowBoard!==!1,M.showComponents=M.savedShowComponents!==!1,mr(),typeof Pe=="function"&&Pe()}async function Hh(t,e,r={}){let a=t.semanticGeometry.assets?.scene_manifest||t.semanticGeometry.semantic_gltf?.path,s=performance.now();if(a){if(t.scene.manifestUrl=new URL(a,location.href).toString(),t.scene.manifest=await a1(t.scene.manifestUrl,t),r.scene_manifest_fetch_parse_ms=performance.now()-s,!he(e))return!1;if(t.scene.manifest.schema!=="prism.semantic_gltf_a0")throw new Error(`Unsupported scene schema: ${t.scene.manifest.schema}`)}else t.scene.manifest={schema:"prism.semantic_gltf_partial.a0",bbox:null,layers:[],nets:[],objectFeatures:[],components:[],tiles:[],barrels:[]},r.scene_manifest_fetch_parse_ms=0;s=performance.now(),t.scene.layers=t.scene.manifest.layers||[],t.scene.copperLayers=t.scene.layers.filter(i=>i.role==="copper"||String(i.name).endsWith(".Cu")),t.scene.nets=t.scene.manifest.nets||[];for(let i of t.scene.manifest.objectFeatures||[])t.scene.features.set(Number(i.id),{...i,bounds:$r(i.boundsMm)});for(let i of t.scene.manifest.components||[])t.scene.componentFeatures.set(i.designator,i),t.scene.features.set(Number(i.featureId),{...i,kind:"component",sourceUid:i.uid,netId:0,bounds:null});for(let i of t.scene.manifest.tiles||[])t.scene.tiles.set(i.id,i);r.scene_manifest_index_ms=performance.now()-s;let n=$h(t);for(let i of n)t.compareLayers.add(i),t.desiredCompareLayers.add(i);for(let i of t.scene.copperLayers)t.visible3dLayers.add(Number(i.id));return!0}async function e1(t,e={},r=null){let a=performance.now();if(!await Hh(k,t,e))return;let s=performance.now();if(k.renderer=await cr.create(j),e.webgpu_renderer_create_ms=performance.now()-s,!he(t)){k.renderer?.dispose?.(),k.renderer=null;return}k.renderer.setBarrels(Ni(k.scene.manifest.barrels,k.scene.manifest.layers)),Ka(),s=performance.now();let n=await eb(t);if(e.board_fetch_parse_upload_ms=performance.now()-s,!he(t)||(k.scene.runtimeBounds=n||Za(k.scene.manifest.bbox),U=new qr(k.scene.runtimeBounds),Ba&&(await t1(t),!he(t)||(await r1(t),!he(t)))))return;s=performance.now(),hc(),Xb(),Ba&&(HM(),VM()),Hb(),rp(),e.controls_and_bindings_ms=performance.now()-s;let i={"board-ready":"Board ready \xB7 components and semantic layers are still generating","components-ready":"Board and components ready \xB7 semantic layers are still generating","semantic-ready":"WebGPU semantic glTF active"};if(jr.textContent=i[k.viewerReadiness.stage]||"Loading 3D assets",k.semanticGeometry.assets?.components_glb&&!k.deferComponents){let o=performance.now();Ab(t).then(()=>{he(t)&&(Vo(n),r?.({schema:"prism.semantic_viewer_performance.a0",milestone:"components-loaded",readiness_stage:k.viewerReadiness.stage,elapsed_ms:performance.now()-o,bytes_loaded:k.loadedBytes}))})}else Vo(n);Me(performance.now(),{force:!0}),Fa(t),s=performance.now(),await new Promise(o=>requestAnimationFrame(o)),e.first_frame_wait_ms=performance.now()-s,e.boot_total_ms=performance.now()-a}async function t1(t=we){let e=k.semanticGeometry.assets?.schematic_native_manifest||k.semanticGeometry.schematic_vector?.path||k.semanticGeometry.schematic_scene?.path,r=k.semanticGeometry.assets?.schematic_manifest||k.semanticGeometry.schematic_world?.path,a=Y("[data-workspace=schematic]");if(!e&&!r){a.disabled=!0,a.title="No schematic world assets are available";return}let s=[e,r].filter(Boolean),n=null;for(let o of s)try{D.manifestUrl=new URL(o,location.href).toString();let c=await Ls.create(Fe,D.manifestUrl);if(!he(t))return;C=c,C.setFlowOverlayCanvas(vn);break}catch(c){if(n=c,C=null,o===r)throw c}if(!C)throw n||new Error("Failed to load schematic viewer assets");D.manifest=C.manifest,D.pages=C.pages,D.byId=new Map(D.pages.map(o=>[o.id,o])),M.selectedPageId=D.pages[0]?.id||"",C.selectedPageId=M.selectedPageId,!["native","legacy","webgpu"].includes(String(D.rendererMode).toLowerCase())&&(Z=zs.create(xn,D.manifestUrl,D.manifest,C.featuresByPage,{onSelect:RM,onBlank:Ga,onHighlightNet:jb,onOpenPage:IM,onFallback:o=>{D.domFallbackReason=o,console.warn(o)}}),Z.preloadPages(D.pages)),C.preloadOverview()}async function r1(t=we){let e=k.semanticGeometry.assets?.bom||k.semanticGeometry.bom?.path,r=Y("[data-workspace=bom]");if(!e){r&&(r.disabled=!0,r.title="No BoM artifact is available");return}try{let a=await Qa.create(wn,new URL(e,location.href).toString(),{onSelectReference:s=>mc(s,!0)});if(!he(t))return;it=a}catch(a){if(!he(t))return;console.warn(a),r&&(r.disabled=!0,r.title=a?.message||"BoM artifact could not be loaded")}}async function a1(t,e=k){if(e.assetCache)return e.assetCache.fetchJson(String(t));let r=await fetch(t,{cache:"default"});if(!r.ok)throw new Error(`Failed to load ${t}: ${r.status}`);return r.json()}function s1(){return!v||v.timing.boardsDrawnAt!=null?!0:![...v.boards.values()].some(t=>t.loadState==="loading"||t.loadState==="waiting")}var n1=24*1024*1024,dr={bytes:0,waiting:null};async function qh(t){for(;;){if(dr.bytes===0||dr.bytes+t<=n1){dr.bytes+=t,dr.waiting??=new Promise(e=>requestAnimationFrame(()=>{dr.bytes=0,dr.waiting=null,e()}));return}await dr.waiting}}async function i1(t,e=we,r=k){if(!he(e))return;let a=r.scene.residentTiles.get(t.id);if(a){a.lastUsed=performance.now();return}if(r.scene.failed.get(t.id))return;if(r.scene.loading.has(t.id))return r.scene.loading.get(t.id);let n=(async()=>{try{let i=await ta(new URL(t.path,r.scene.manifestUrl).toString(),{fetchBytes:_n(r),fetchCache:"no-store"});if(!he(e)||!r.renderer||(await qh(i.primitives.reduce((p,b)=>p+Lo(b),0)),!he(e)||!r.renderer))return;r.loadedBytes+=i.byteLength;let o=r.scene.layers.find(p=>Number(p.id)===Number(t.layerId)),c=[],l=0,f=0;for(let p of i.primitives){let b=r.renderer.addPrimitive(p,{kind:"copper",tileId:t.id,layerId:Number(t.layerId),innerCopper:Dn(Number(t.layerId),r),color:uc(o,r),stencilMark:Rb(o,r),baseZ:Number(o?.z_mm||0)/1e3,material:{baseColor:[1,1,1,1],metallic:.78,roughness:.32}});c.push(b),l+=p.indices.length/3,f+=Lo(p)}let u={tile:t,entries:c,byteLength:i.byteLength,gpuBytes:f,triangles:l,lastUsed:performance.now(),pinned:!1};r.scene.residentTiles.set(t.id,u),r.scene.loaded.add(t.id),r.tileLoads+=1,r.residentTileBytes+=i.byteLength,r.residentTileGpuBytes+=f,r.residentTileTriangles+=l,r.triangles=r.residentTileTriangles,r.scene.failed.delete(t.id)}catch(i){if(!he(e))return;let o=r.scene.failed.get(t.id)||{count:0,message:""};r.scene.failed.set(t.id,{count:o.count+1,message:i?.message||String(i)}),o.count||console.warn(`Failed to load tile ${t.id}; suppressing retries until assets are regenerated`,i)}finally{he(e)&&r.scene.loading.delete(t.id)}})();return r.scene.loading.set(t.id,n),n}function Lo(t){return au(t.position.length/3,t.indices.length)}function Zo(t,e=k){let r=e.scene.residentTiles.get(t);r&&(e.renderer.removeEntries(r.entries),e.scene.residentTiles.delete(t),e.scene.loaded.delete(t),e.residentTileBytes=Math.max(0,e.residentTileBytes-r.byteLength),e.residentTileGpuBytes=Math.max(0,e.residentTileGpuBytes-r.gpuBytes),e.residentTileTriangles=Math.max(0,e.residentTileTriangles-r.triangles),e.triangles=e.residentTileTriangles,e.tileEvictions+=1)}function Me(t=performance.now(),e={},r=k){if(!r.renderer||!U||M.workspace!=="pcb")return;let a=M.mode==="layer"&&W.phase==="preload";if(!e.force&&!a&&t-r.lastTileScheduleAt<Gw)return;let s=performance.now();r.lastTileScheduleAt=t;let n=o1(r);r.visibleTileIds=n;let i=r.scene.loading.size,c=Math.max(0,(a?Vw:Kw)-i),l=[...n].map(u=>r.scene.tiles.get(u)).filter(u=>u&&!r.scene.residentTiles.has(u.id)&&!r.scene.loading.has(u.id)&&!r.scene.failed.has(u.id)).sort((u,p)=>ph(u,r)-ph(p,r)).slice(0,c),f=we;for(let u of l)i1(u,f,r);for(let u of n){let p=r.scene.residentTiles.get(u);p&&(p.lastUsed=t)}Jh(n,void 0,r),d1(n,t,r),l1(n,t,r),r.tileSchedulerMs=performance.now()-s}function o1(t=k){let e=new Set,r=M.mode==="3d"?t.visible3dLayers:u1();if(!r.size||!J)return e;if(M.mode==="layer"){for(let c of t.scene.tiles.values())r.has(Number(c.layerId))&&e.add(c.id);return e}let a=new Set,s=ac(t);if(s.size){for(let c of t.scene.tiles.values())if(r.has(Number(c.layerId))){for(let l of s)if(Zh(c,l)){a.add(c.id);break}}}let n=ec(t),i=[J.matrix,...c1(),...t===k?Pa.active(performance.now()):[]],o=0;for(let c of t.scene.tiles.values()){if(!r.has(Number(c.layerId))||n&&Dn(Number(c.layerId),t))continue;let l=M.mode==="layer"?br.get(Number(c.layerId)):null;i.some(f=>An(c,f,l,Dw,t))&&e.add(c.id),!t.scene.residentTiles.has(c.id)&&An(c,J.matrix,l,0,t)&&(o+=1)}for(let c of a)e.add(c);return t.visibleTileMisses=o,e}function c1(){if(!U?.moving?.()||M.mode==="layer")return[];let t=performance.now();return _a.at===t||(_a.at=t,_a.views=[0,1].map(e=>U.targetMatrix(j.width,j.height,!1,e))),_a.views}var _a={at:-1,views:[]};function l1(t,e,r){if(M.mode==="layer"||!J)return;let a=ec(r);for(let s of[...r.scene.residentTiles.values()]){if(t.has(s.tile.id)||r.scene.loading.has(s.tile.id))continue;let n=Number(s.tile.layerId);if(r.visible3dLayers.has(n)&&!(a&&Dn(n,r))&&An(s.tile,J.matrix,null,Uw,r)){s.lastUsed=e;continue}e-s.lastUsed>zw&&Zo(s.tile.id,r)}}function Wh(t,e){return t?"all":e?"lit":"none"}function ec(t){return!!t.renderer&&t.renderer.innerCopperMode!=="all"}function d1(t,e,r){if(ec(r))for(let a of[...r.scene.residentTiles.values()])t.has(a.tile.id)||r.scene.loading.has(a.tile.id)||Dn(Number(a.tile.layerId),r)&&e-a.lastUsed>Yw&&Zo(a.tile.id,r)}function u1(){return M.mode!=="layer"||W.phase==="idle"?k.compareLayers:Yh(W.previous,W.target)}function Xh(){return M.mode!=="layer"?k.visible3dLayers:W.phase==="reveal"?Yh(W.previous,W.target):k.compareLayers}function $h(t=k){let e=t.scene.copperLayers.map(r=>Number(r.id)).filter(Number.isFinite);return e.length?e.length===1?new Set([e[0]]):new Set([e[0],e[e.length-1]]):new Set}function f1(){let t=k.desiredCompareLayers.size?k.desiredCompareLayers:k.compareLayers;return t.size?new Set([...t].map(Number)):$h()}function Yh(...t){let e=new Set;for(let r of t)for(let a of r||[])e.add(Number(a));return e}function Jh(t,e=uh,r=k){if(M.mode==="layer")return;let a=Math.min(uh,e);if(r.residentTileGpuBytes<=a)return;let s=[...r.scene.residentTiles.values()].filter(n=>!t.has(n.tile.id)&&!r.scene.loading.has(n.tile.id)).sort((n,i)=>n.lastUsed-i.lastUsed);for(let n of s){if(r.residentTileGpuBytes<=a)break;Zo(n.tile.id,r)}}function An(t,e,r=null,a=0,s=k){let n=Qh(t,s);if(!n)return!0;let i=Math.max(n[3]-n[0],n[4]-n[1])*a,o=[n[0]-i+(r?.[0]||0),n[1]-i+(r?.[1]||0),n[2]-.002,n[3]+i+(r?.[0]||0),n[4]+i+(r?.[1]||0),n[5]+.002],c=s.renderer?.occurrenceMatrices;return!c||c.length===1&&ws(c[0])?bh(o,e):c.some(l=>bh(o,ar(e,l)))}function Qh(t,e=k){let r=t.boundsMm;if(!r||r.length!==4)return null;let a=e.scene.layers.find(n=>Number(n.id)===Number(t.layerId)),s=Number(a?.z_mm||0)/1e3;return[r[0]/1e3,-r[3]/1e3,s-4e-4,r[2]/1e3,-r[1]/1e3,s+4e-4]}function bh(t,e){let r=[[t[0],t[1],t[2]],[t[3],t[1],t[2]],[t[0],t[4],t[2]],[t[3],t[4],t[2]],[t[0],t[1],t[5]],[t[3],t[1],t[5]],[t[0],t[4],t[5]],[t[3],t[4],t[5]]].map(s=>h1(e,s));return![s=>s[0]<-s[3],s=>s[0]>s[3],s=>s[1]<-s[3],s=>s[1]>s[3],s=>s[2]<0,s=>s[2]>s[3]].some(s=>r.every(s))}function h1(t,e){let r=e[0],a=e[1],s=e[2];return[t[0]*r+t[4]*a+t[8]*s+t[12],t[1]*r+t[5]*a+t[9]*s+t[13],t[2]*r+t[6]*a+t[10]*s+t[14],t[3]*r+t[7]*a+t[11]*s+t[15]]}function Zh(t,e){return Array.isArray(t.netIds)&&t.netIds.some(r=>Number(r)===Number(e))}function ph(t,e=k){let r=Qh(t,e);if(!r||!U)return 0;let a=(r[0]+r[3])*.5-U.focus[0],s=(r[1]+r[4])*.5-U.focus[1];return a*a+s*s}async function eb(t=we,e=k){let r=e.semanticGeometry.assets?.base_board_glb;if(!r)return null;let a=e.semanticGeometry.assets?.soldermask_glb,[s,n]=await Promise.all([ta(new URL(r,location.href).toString(),{defaultFeatureId:0,fetchBytes:_n(e)}),a?ta(new URL(a,location.href).toString(),{defaultFeatureId:0,fetchBytes:_n(e)}).catch(o=>(console.warn("[prism-semantic-viewer] solder mask failed to load",o),null)):null]);if(!he(t)||!e.renderer)return null;e.loadedBytes+=s.byteLength,n&&(e.loadedBytes+=n.byteLength);let i=[...s.primitives.filter(o=>{let c=ri(o);return c!=="pad"&&!(n&&c==="soldermask")}),...n?.primitives||[]];for(let o of Xr(i,ri)){let c=Hw.includes(o.groupKey);e.renderer.addPrimitive(o,{kind:"board",boardRole:o.groupKey,...c?{side:Ic(o)}:{},layerId:o.groupKey==="paste"?lM(o,e):0,material:o.material,color:o.material.baseColor})}return e.renderer.setHiddenBoardLayers(M.hiddenBoardLayers),vr(i.map(o=>o.bounds))}function tr(t=k){return t.scene.runtimeBounds||Za(t.scene.manifest?.bbox)}function Dn(t,e=k){return Rc(t,e.scene.copperLayers)}function tb(t,e){let{back:r}=U.basis();return{eye:Ee(U.focus,pe(r,U.distance)),orthographic:e,pixelScale:e?t/Math.max(1e-9,U.orthoScale):t/2/Math.tan(U.fov/2)}}function rb(){if(v)return b1();let t=k.renderer?.cullCounts||{full:0,board:0,body:0,box:0,culled:0},e=!k.renderer||k.renderer.identityOnly;return{occurrences:k.renderer?.occurrenceMatrices.length||0,lod:e?{full:1,board:0,body:0,box:0,culled:0}:{...t},triangles:k.renderer?.frameStats.triangles||0,draws:k.renderer?.frameStats.draws||0,gpuMemoryBytes:k.renderer?.gpuMemoryBytes()||0,gpuBreakdown:k.renderer?.gpuMemoryBreakdown()||null,gpuBudgetBytes:M.gpuBudgetBytes,componentTier:k.scene.componentTier,componentEvictions:k.scene.componentEvictions,tileEvictions:k.tileEvictions,visibleTileMisses:k.visibleTileMisses||0,cache:k.assetCache?k.assetCache.summary():{enabled:!1},frameIntervalMs:M.frameIntervalMs,frameIntervalP95Ms:M.frameIntervalP95Ms,frameCpuMs:M.frameCpuMs,frameCpuP95Ms:M.frameCpuP95Ms,fps:M.fps}}function b1(){let t=Je(),e=t.map(r=>r.scene.componentTier);return{occurrences:v.scene.occurrenceCount||0,lod:v.scene.cullCounts(),triangles:v.scene.frameStats.triangles,draws:v.scene.frameStats.draws,gpuMemoryBytes:v.scene.gpuMemoryBytes(),gpuBreakdown:v.scene.gpuMemoryBreakdown(),gpuBudgetBytes:M.gpuBudgetBytes,componentTier:`${e.filter(r=>r==="loaded").length}/${t.length} loaded`,componentEvictions:t.reduce((r,a)=>r+a.scene.componentEvictions,0),tileEvictions:t.reduce((r,a)=>r+a.tileEvictions,0),visibleTileMisses:t.reduce((r,a)=>r+(a.visibleTileMisses||0),0),componentMisses:t.filter(r=>r.renderer.cullCounts.full>0&&r.scene.componentTier!=="loaded"&&r.semanticGeometry.assets?.components_glb).length,cache:t.find(r=>r.assetCache)?.assetCache.summary()||{enabled:!1},frameIntervalMs:M.frameIntervalMs,frameIntervalP95Ms:M.frameIntervalP95Ms,frameCpuMs:M.frameCpuMs,frameCpuP95Ms:M.frameCpuP95Ms,fps:M.fps,firstFrame:v.timing.boardsDrawnAt==null?null:{sinceSceneMs:v.timing.boardsDrawnAt-v.timing.descriptorAt,sinceNavigationMs:v.timing.boardsDrawnAt}}}function ab(t){M.showStats=!!t,Na&&(Na.hidden=!M.showStats),ht&&(ht.hidden=!(M.showStats&&v)),M.showStats&&v&&y1(),sb()}var Do="prism.systemScene.lodThresholds",p1=Object.freeze([{key:"fullPx",label:"Parts",max:600},{key:"boardPx",label:"Copper",max:400},{key:"boxPx",label:"Box below",max:120}]);function g1(){try{let t=JSON.parse(globalThis.localStorage?.getItem(Do)||"null");if(t&&typeof t=="object")return kr(t)}catch{}return{...st}}function m1(t){try{t?globalThis.localStorage?.setItem(Do,JSON.stringify(t)):globalThis.localStorage?.removeItem(Do)}catch{}}function Uo(t){if(!v)return null;let e=t==null?{...st}:{...v.scene.lodThresholds,...t},r=v.scene.setLodThresholds(e);return m1(t==null?null:r),zo(),r}function y1(){if(!ht||ht.childElementCount)return zo();let t=document.createElement("h2");t.textContent="Detail thresholds (CSS px)",ht.append(t);for(let r of p1){let a=document.createElement("label"),s=document.createElement("span");s.textContent=r.label;let n=document.createElement("input");Object.assign(n,{type:"range",min:"0",max:String(r.max),step:"1"}),n.dataset.key=r.key;let i=document.createElement("output");n.addEventListener("input",()=>Uo({[r.key]:Number(n.value)})),a.append(s,n,i),ht.append(a)}let e=document.createElement("button");e.type="button",e.textContent="Defaults",e.addEventListener("click",()=>Uo(null)),ht.append(e),zo()}function zo(){if(!ht||!v)return;let t=v.scene.lodThresholds;for(let e of ht.querySelectorAll("input[data-key]"))e.value=String(t[e.dataset.key]),e.nextElementSibling.value=String(Math.round(t[e.dataset.key]))}function sb(){if(!Na||!M.showStats)return;let t=rb(),{full:e,board:r,body:a,box:s,culled:n}=t.lod,i=[["Occurrences",`${t.occurrences} (${e+r+a+s} visible)`],["Detail",`${e} full \xB7 ${r} board \xB7 ${a} body \xB7 ${s} box \xB7 ${n} culled`],["Triangles",t.triangles.toLocaleString()],["Draws",t.draws.toLocaleString()],["GPU memory",`${(t.gpuMemoryBytes/1048576).toFixed(1)} / ${(t.gpuBudgetBytes/1048576).toFixed(0)} MB`],["Components",`${t.componentTier}${t.componentEvictions?` \xB7 ${t.componentEvictions} evicted`:""}`],["Cache",t.cache.enabled?`${t.cache.hits} hits \xB7 ${t.cache.misses} misses \xB7 ${(t.cache.bytes/1048576).toFixed(0)} MB`:"off"],["Frame",`${t.frameIntervalMs.toFixed(1)} ms \xB7 p95 ${t.frameIntervalP95Ms.toFixed(1)}`],["CPU",`${t.frameCpuMs.toFixed(2)} ms \xB7 p95 ${t.frameCpuP95Ms.toFixed(2)}`],["FPS",t.fps.toFixed(0)]];Na.innerHTML=i.map(([o,c])=>`<dt>${o}</dt><dd>${c}</dd>`).join("")}var x1="prism.system_scene.a0";function Je(){return v?[...v.boards.values()].filter(t=>t.renderer&&t.loadState==="loaded"):[]}async function nb(t={}){let e=jh();if(La=typeof t.onSelectionChange=="function"?t.onSelectionChange:null,Tn=typeof t.onContextMenu=="function"?t.onContextMenu:null,Sn=typeof t.onViewStateChange=="function"?t.onViewStateChange:null,jn=typeof t.isActive=="function"?t.isActive:()=>!0,Ba=!1,M.gpuBudgetBytes=rn,Rh(t.root||document),!St||!j)throw new Error("Semantic viewer shell is missing required DOM nodes");if(typeof t.loadBundle!="function")throw new Error("A system scene needs a bundle loader");let r=await Bs.create(j);return he(e)?(r.setLodThresholds(g1()),v={scene:r,loadBundle:t.loadBundle,onEmphasis:typeof t.onEmphasis=="function"?t.onEmphasis:null,onMove:typeof t.onMove=="function"?t.onMove:null,onHarness:typeof t.onHarness=="function"?t.onHarness:null,baseDescriptor:null,descriptor:null,move:z1(),gizmo:null,standInKey:null,showLabels:!0,harnesses:[],harnessLit:new Map,showHarnesses:!0,harnessDrawn:null,tubes:[],tubedHarnesses:new Set,harnessPick:null,worlds:new Map,nodePreview:null,housingModels:new Map,timing:{descriptorAt:null,boardsDrawnAt:null},boards:new Map,groups:new Map,placed:[],placements:new Map,hiddenLayers:new Map,separation:new Map,bounds:null,framed:!1,snapped:!1,boardSelected:!1,inputs:new Map,emphasisSets:[],emphasisBounds:new Map,emphasisReport:null},k=ja({key:""}),U=new qr([-.1,-.1,-.01,.1,.1,.01]),hc(),Xb(),Hb(),rp(),jr.textContent="System scene",Fa(e),{...Dh(),focusPlacement:R1,selectBoardContext:vc,setEmphasisSets:j1,setSystemScene:v1,frameNetEmphasis:L1,frameAll(){v?.bounds&&U.frame(v.bounds)},setMoveAllowed:G1,setMoveMode:In,setMoveSpace:vb,previewPose:K1,cancelMove:cc,getMoveState:()=>v?xb():null,targetHarnessNode:Vn,selectHarness:aM,previewHarnessNode:sM,cancelHarnessNode:Tb,getHarnessState:()=>v?Sb():null,setLabelsVisible(a){v&&(v.showLabels=!!a,hr&&(hr.hidden=!v.showLabels))},setHelpVisible:Mb,isHelpVisible:()=>!!(Et&&!Et.hidden),setHarnessesVisible(a){v&&(v.showHarnesses=!!a,v.harnessDrawn=null,Dr({relabel:!1}))},frameBoard(a){let s=v?.placements.get(String(a));return s&&U.frame(s.worldBounds),!!s},frameParts:D1,resize(){v?.scene.resize()},setLodOverride(a){for(let s of Je())s.renderer.setLodOverride(a)},setLodThresholds:Uo,pickSurfaceAt:WM,focusMoveTarget:XM,viewAxis(a,s=!1){!v||!["x","y","z"].includes(a)||(U.setAxis(a,!!s),v.bounds&&U.frame(v.bounds))},projectPoint(a,s){return yh(a,s)},projectComponent(a,s){let n=v?.placements.get(String(s));return n?.board?Zb(n.board,a,i=>yh(i,s)):null},dispose(){Lh(e)}}):(r.dispose(),null)}function v1(t){if(!v)return;if(t?.schema!==x1)throw new Error(`Unsupported system scene schema: ${t?.schema||"missing"}`);v.baseDescriptor=t,v.timing.descriptorAt??=performance.now();let e=v.move.target?t.occurrences.find(a=>a.path===v.move.target):null;e?!v.move.drag&&mb(v.move.preview,e.pose)&&(v.move.preview=null):(v.move.drag=null,v.move.preview=null,v.move.target=null),v.descriptor=yb(),v.harnesses=Array.isArray(t.harnesses)?t.harnesses:[],v.harnessDrawn=null;let r=new Set;for(let a of t.assets||[]){r.add(a.assetId);let s=v.boards.get(a.assetId),n=mf(s,a);if(n!=="create"){s.asset=a,n==="load"&&mh(s,we);continue}s&&gh(a.assetId);let i=ja({key:a.assetId,topology:{},semanticGeometry:{},deferComponents:!0});Object.assign(i,{asset:a,bundleUrl:a.bundleUrl,loadState:"waiting",abort:null}),v.boards.set(a.assetId,i),co(a)&&mh(i,we)}for(let a of[...v.boards.keys()])r.has(a)||gh(a);Dr(),nM(),v.move.enabled&&(Ua({quiet:!0}),gt("sync"))}function gh(t){let e=v.boards.get(t);e?.abort?.abort(),v.boards.delete(t),v.scene.removeAsset(t),e&&(e.renderer=null),k===e&&tc()}async function mh(t,e){t.loadState="loading",t.abort=new AbortController;let r=()=>he(e)&&v?.boards.get(t.key)===t&&!t.abort.signal.aborted;try{let a=await v.loadBundle(t.bundleUrl,t.abort.signal);if(!r()||(t.topology=a.topology||{},t.topology.net_details||(t.topology.net_details=Oh(t.topology)),t.semanticGeometry=a.semanticGeometry||{},t.viewerReadiness=a.readiness||t.semanticGeometry.readiness||{stage:"semantic-ready",progress:100},t.assetCache=a.assetCache||null,!await Hh(t,e)||!r()))return;t.renderer=v.scene.asset(t.key),t.renderer.setBarrels(Ni(t.scene.manifest.barrels,t.scene.manifest.layers)),Ka(t);let s=await eb(e,t);if(!r())return;t.scene.runtimeBounds=s||Za(t.scene.manifest.bbox),t.renderer.setBoardBounds(t.scene.runtimeBounds),t.loadState="loaded",Dr()}catch(a){if(!r())return;console.warn(`[prism-semantic-viewer] system board ${t.key} failed to load`,a),t.loadState="failed",t.error=a?.message||String(a),v.scene.removeAsset(t.key),t.renderer=null,k===t&&tc(),Dr()}}function Dr({relabel:t=!0}={}){let e=v?.descriptor;if(!e)return;v.harnessDrawn=null;let r=Oa(),a=new Map((e.assets||[]).map(c=>[c.assetId,c])),s=new Map,n=[];for(let c of yf(e)){let l=c.assetId?a.get(c.assetId):null,f=c.assetId?v.boards.get(c.assetId):null,u=c.kind!=="board"&&!c.restricted?E1(c):null;if(u){s.has(u.rendererId)||s.set(u.rendererId,[]),s.get(u.rendererId).push({matrix:u.matrix,key:c.path,hiddenLayers:[],explode:null}),n.push({occurrence:c,rendererId:u.rendererId,board:null,matrix:u.matrix,worldBounds:u.worldBounds,standIn:null,own:u.kind,primitives:u.primitives});continue}if(c.model||c.box)continue;let p=gf(c,l,f?.loadState),b,h,d;if(!p)b=f.key,h=Js(c.worldMatrix,l.bundleToBoard),d=xt(h,f.scene.runtimeBounds);else{if(!c.boundsMm)continue;b=`stand-in:${p}`,v.scene.standIn(b,Ys[p].color),h=ga(c.worldMatrix,c.boundsMm),d=xt(h,[0,0,0,1,1,1])}s.has(b)||s.set(b,[]),s.get(b).push({matrix:h,key:c.path,hiddenLayers:p?[]:[...v.hiddenLayers.get(c.path)||[]],explode:p?null:pb(f,v.separation.get(c.path)||0)}),n.push({occurrence:c,rendererId:b,board:p?null:f,matrix:h,worldBounds:d,standIn:p})}let i=ob();S1(s,i.housings);for(let c of v.scene.assets.keys())s.has(c)||s.set(c,[]);v.scene.setOccurrences(s),v.groups=s;let o=v.placements;if(v.placed=n,v.placements=new Map(n.map(c=>[c.occurrence.path,c])),t||!o)oM();else for(let c of n)c.label=o.get(c.occurrence.path)?.label;v.bounds=vr(n.map(c=>c.worldBounds)),v.bounds&&(U.sceneRadius=_t(v.bounds),v.framed||(U.frame(v.bounds),v.snapped||U.snap(),v.snapped=!0,n.some(c=>c.standIn==="loading")||(v.framed=!0)));for(let c of Je())Un(c);r!=null&&(v.placements.get(r)?.board===k?M.selectedOccurrence=k.renderer.occurrenceKeys.indexOf(r):tc()),bt(i),gb(),At()}var ib=[.17,.18,.2],w1=[.24,.39,.87],M1=[.9,.28,.3];function ob(){if(v.worlds=new Map(v.descriptor.occurrences.map(t=>[t.path,t.worldMatrix])),!v.showHarnesses||!v.harnesses.length)return{tubes:[],housings:[]};try{let t=v.descriptor.occurrences.filter(e=>e.kind==="board"&&e.boundsMm).map(e=>({id:e.path,matrix:e.worldMatrix,...e.boundsMm}));return bf(Qi(v.harnesses,v.nodePreview,wt),Vr,t)}catch(t){return console.warn("[prism-semantic-viewer] harness geometry failed",t),{tubes:[],housings:[]}}}function bt(t=null){if(!v?.descriptor)return;let e=(t??ob()).tubes;v.tubes=e,v.tubedHarnesses=new Set(e.map(r=>r.harness)),v.scene.setTubes(e,ub)}var Go=[.42,.45,.5,1],cb=Object.freeze([1e3,0,0,0,0,0,-1e3,0,0,1e3,0,0,0,0,0,1]);function k1(t){return{...bb(t),showBoard:!1,showComponents:!0}}function lb(t,e){return t.housing?k1(e):bb(e)}function E1(t){if(t.model?.glbKey){let e=ar(t.worldMatrix,t.model.matrixMm||$e),r=v.housingModels.get(t.model.glbKey);if(r||db(t.model.glbKey),r?.state==="ready"){let a=Js(e,cb);return{kind:"model",rendererId:`housing:${t.model.glbKey}`,matrix:a,worldBounds:xt(a,r.bounds),primitives:r.primitives}}if(t.model.boundsMm){v.scene.standIn("housing:proxy",Go);let a=ga(e,t.model.boundsMm);return{kind:"model",rendererId:"housing:proxy",matrix:a,worldBounds:xt(a,[0,0,0,1,1,1])}}}if(t.box?.boundsMm){let e=t.box.rgba||Go,r=xf(e);v.scene.standIn(r,e);let a=ga(t.worldMatrix,t.box.boundsMm);return{kind:"box",rendererId:r,matrix:a,worldBounds:xt(a,[0,0,0,1,1,1])}}return null}function S1(t,e){let r=(a,s)=>{t.has(a)||t.set(a,[]),t.get(a).push({...s,hiddenLayers:[],explode:null})};for(let a of e){let s=`housing:${a.key}`,n=a.model?v.housingModels.get(a.model.glbKey):null;if(a.model&&!n&&db(a.model.glbKey),n?.state==="ready"){r(`housing:${a.model.glbKey}`,{key:s,matrix:Js(a.matrix,cb)});continue}v.scene.standIn("housing:proxy",Go);let i=a.model?a.model.boundsMm:{minMm:[0,0,0],maxMm:[1,1,1]};r("housing:proxy",{key:s,matrix:ga(a.matrix,i)})}}async function db(t){v.housingModels.set(t,{state:"loading"});let e=we;try{let r=await ta(new URL(`/api/catalog/models/${encodeURIComponent(t)}.glb`,location.href).toString(),{fetchCache:"force-cache"});if(!he(e)||!v)return;let a=v.scene.asset(`housing:${t}`);a.housing=!0,a.setLodOverride(Ms);let s=[1/0,1/0,1/0,-1/0,-1/0,-1/0];for(let n of r.primitives){for(let i=0;i<3;i+=1)s[i]=Math.min(s[i],n.bounds[i]),s[i+3]=Math.max(s[i+3],n.bounds[i+3]);a.addPrimitive(n,{kind:"component",layerId:0,material:n.material,color:n.material.baseColor})}r.primitives.length&&a.setBoardBounds(s),v.housingModels.set(t,{state:"ready",bounds:s,primitives:r.primitives})}catch(r){console.warn("[prism-semantic-viewer] housing model failed",t,r),v&&v.housingModels.set(t,{state:"failed"})}v?.descriptor&&Dr({relabel:!1})}function Vr(t){return v.worlds.get(t)??null}function ub(t){let e=v.harnessLit.get(t.harness),r=e?t.wires.map(a=>e.get(a)).find(Boolean):null;return r?{rgb:T1(r),mode:1}:t.collides.length?{rgb:M1,mode:0}:v.harnessPick?.key===t.harness?{rgb:w1,mode:0}:{rgb:ib,mode:v.emphasisSets.length?2:0}}function T1(t){let e=/^#?([0-9a-f]{6})$/i.exec(String(t));if(!e)return ib;let r=Number.parseInt(e[1],16);return[(r>>16&255)/255,(r>>8&255)/255,(r&255)/255]}function Oa(){return!v||!k.renderer||!fb()?null:k.renderer.occurrenceKeys[M.selectedOccurrence]??null}function fb(){return!!(M.selectedFeatureId||M.activeNetId||v?.boardSelected)}function hb(t){if(k===t)return;let e=Ge;Ge=!0;try{Oe()}finally{Ge=e}k=t,Pe()}function tc(){Oe(),k=ja({key:""}),Pe()}function A1(t,e){let r=performance.now(),a=Math.max(0,t-Zt),s=Math.min(.05,(t-Zt)/1e3);Zt=t,U.update(s),v.scene.resize(),J={layerId:0,viewport:{x:0,y:0,width:j.width,height:j.height},matrix:U.matrix(j.width,j.height,!1),lod:tb(j.height/Math.min(devicePixelRatio||1,2),!1)};let n=Kr(),i=new Map;for(let o of Je()){let c=B1(o);o.scene.copperRealism!==Ur()&&Ka(o),o.renderer.setInnerCopperMode(Wh(!M.showBoard||F1(o),ac(o).size>0)),o.renderer.dimCopper=n,Me(t,{},o);let l=o===k;i.set(o.renderer,{activeNetId:l?M.activeNetId:0,selectedFeatureId:l?M.selectedFeatureId:0,time:t/1e3,layerOffsets:c,visibleLayers:o.visible3dLayers,showBoard:M.showBoard,showComponents:M.showComponents,showPaste:!0,componentOpacity:1,boardOpacity:n?.34:1,isolateNet:M.isolateNet,compareMode:!1,compareOffsets:new Map,layerAlphas:null,visibleTileIds:o.visibleTileIds})}v.inputs=i,v.scene.setSelectedOccurrence(k.renderer&&fb()?k.renderer.occurrenceBase+M.selectedOccurrence:-1),vM(t,i,n)&&(v.scene.render(J,o=>i.get(o)||lb(o,t)),tp(),cM()),Z1(),iM(),H1(),v.timing.boardsDrawnAt==null&&vf(v.placed)&&(v.timing.boardsDrawnAt=performance.now());for(let o of Je())Ib(t,o);qo(a,performance.now()-r),Wo(t),Fa(e)}function bb(t){return{activeNetId:0,selectedFeatureId:0,time:t/1e3,visibleLayers:new Set,showBoard:!0,showComponents:!1,componentOpacity:1,boardOpacity:1,isolateNet:!1}}function I1(t,e){let r=performance.now();return v.scene.pick(J,t,e,a=>v.inputs.get(a)||lb(a,r))}function _1(t){let e=typeof t.occurrenceKey=="string"&&t.occurrenceKey.startsWith("housing:")?t.occurrenceKey.slice(8):null;if(e){let s=e.lastIndexOf("/"),[n,i]=[e.slice(0,s),e.slice(s+1)],o=v.tubes.find(c=>c.harness===n&&(c.from===i||c.to===i));o?pr({key:n,segmentId:o.segmentId,pointMm:null}):Oe();return}let r=t.occurrenceKey!=null?v.placements.get(t.occurrenceKey):null;if(!r)return Oe();if(r.standIn||r.own)return rc(r);let a=r.board;if(M.isolateNet&&!N1(a,r.occurrence.path,t.featureId))return Oe();hb(a),M.selectedOccurrence=a.renderer.occurrenceKeys.indexOf(r.occurrence.path),t.featureId&&!v.move.enabled?yr(t.featureId,!0):vc()}function R1(t){let e=t!=null?v?.placements.get(String(t)):null;return e?e.standIn||e.own?(rc(e),"stand-in"):(hb(e.board),M.selectedOccurrence=k.renderer.occurrenceKeys.indexOf(e.occurrence.path),"board"):null}function rc(t){let e=Ge;Ge=!0;try{Oe()}finally{Ge=e}v.standInKey=t.occurrence.path,v.move.enabled&&Ua(),Ge||La?.({kind:"board",sourceContext:"3D",occurrence:t.occurrence.path,standIn:t.standIn})}function N1(t,e,r){let a=Number(t.scene.features.get(Number(r))?.netId)||0;if(!a)return!1;let s=t.renderer.occurrenceKeys.indexOf(e);return s<0?!1:t.renderer.occurrenceEmphasis?.[s]?.has(a)?!0:t===k&&s===M.selectedOccurrence&&a===Number(M.activeNetId)}function yh(t,e){let r=v?.placements.get(String(e));return r?ur(t,r.matrix):null}function ac(t=k){if(!v)return Lr();let e=new Set(t===k?Lr():[]);for(let r of t.renderer?.occurrenceEmphasis||[])if(r)for(let a of r.keys())e.add(Number(a));return e}function Un(t){let e=v.groups.get(t.key)||[],r=new Set;for(let a of t.scene.copperLayers){let s=Number(a.id);e.some(n=>!v.hiddenLayers.get(n.key)?.has(s))&&r.add(s)}if(M.isolateNet){let a=new Set;for(let s of ac(t))for(let n of bc(s,t))a.add(n);t.visible3dLayers=new Set([...r].filter(s=>a.has(s)))}else t.visible3dLayers=r;Me(performance.now(),{force:!0},t)}function sc(t,e){let r=t??(v.groups.get(k.key)||[]).map(a=>a.key);for(let a of r){let s=new Set(v.hiddenLayers.get(String(a))||[]);e(s,v.placements.get(String(a))?.board),v.hiddenLayers.set(String(a),s)}for(let a of Je()){let s=v.groups.get(a.key)||[];for(let n of s)n.hiddenLayers=[...v.hiddenLayers.get(n.key)||[]];a.renderer.setOccurrenceHiddenLayers(s.map(n=>n.hiddenLayers)),Un(a)}Pe(),At()}function C1(){let t=Oa();if(t==null||!M.activeNetId)return;let e=bc(M.activeNetId,k);e.size&&sc([t],r=>{r.clear();for(let a of k.scene.copperLayers)e.has(Number(a.id))||r.add(Number(a.id))})}function B1(t){if(t.scene.layerSteps)return t.scene.layerSteps;let e=new Float32Array(256),r=(t.scene.copperLayers.length-1)/2;return t.scene.copperLayers.forEach((a,s)=>{e[Number(a.id)]=r-s}),t.scene.layerSteps=e,e}function pb(t,e){let r=t?.scene.runtimeBounds,a=r?Math.hypot((r[3]-r[0])*1e3,(r[4]-r[1])*1e3):0;return[e*e*ce(a*.12,8,25)/1e3,e<.0999?1:0,1-e*.72,1]}function F1(t){return(v.groups.get(t.key)||[]).some(e=>(v.separation.get(e.key)||0)>.001)}function O1(t,e){let r=e!=null?[String(e)]:(v.groups.get(k.key)||[]).map(a=>a.key);for(let a of r)v.separation.set(a,t);for(let a of Je()){let s=v.groups.get(a.key)||[];a.renderer.setOccurrenceExplode(s.map(n=>pb(a,v.separation.get(n.key)||0)))}At()}function P1(){return v.placed.filter(t=>!t.own).map(t=>{let e=v.hiddenLayers.get(t.occurrence.path)||new Set,r=t.board;return{key:t.occurrence.path,name:t.occurrence.displayPath||t.occurrence.path,standIn:t.standIn||null,separation:v.separation.get(t.occurrence.path)||0,layers:r?r.scene.copperLayers.map(a=>({id:Number(a.id),name:String(a.name),color:qn(Hn(a,r)),visible:!e.has(Number(a.id))})):[]}})}function j1(t){return v?(v.emphasisSets=t,gb()):null}function gb(){if(!v)return[];let t=new Map;for(let[n,i]of v.groups)t.set(n,i.map(()=>null));let e=new Map;for(let n of v.groups.values())n.forEach((i,o)=>e.set(i.key,o));v.emphasisBounds=new Map;let r=v.emphasisSets.map(n=>{let i={key:n.key,color:n.color,lit:0,unresolved:[]},o=[];v.emphasisBounds.set(n.key,o);for(let c of n.members){let l=v.placements.get(c.occurrence),f=l?.board;if(!f&&l?.own){i.lit+=1,l.worldBounds&&o.push({occurrence:c.occurrence,box:l.worldBounds});continue}if(!f){let x=l?l.standIn==="loading"||l.standIn==="building"?"loading":l.standIn==="restricted"?"restricted":"not-drawn":"not-drawn";i.unresolved.push({occurrence:c.occurrence,net:c.net,reason:x});continue}let u=sr(f.scene.nets,c.net),p=Number(u?.id)||0;if(!p){i.unresolved.push({occurrence:c.occurrence,net:c.net,reason:"unknown-net"});continue}let b=t.get(f.key),h=e.get(c.occurrence);if(!b||h==null)continue;b[h]=b[h]||new Map,b[h].has(p)||b[h].set(p,n.mark),i.lit+=1;let d=$r(u.boundsMm);d&&o.push({occurrence:c.occurrence,box:xt(l.matrix,d)})}return i});v.harnessLit=Cu(v.harnesses,v.emphasisSets),v.harnessDrawn=null,v.scene.setTubeColors(ub);for(let n of r){n.wires=0;for(let i of v.harnessLit.values())for(let o of i.values())o===n.color&&(n.wires+=1)}let a=v.emphasisSets.length>0;for(let n of Je())n.renderer.setOccurrenceEmphasis(a&&t.get(n.key)||null,{dimCopper:a});if(M.isolateNet)for(let n of Je())Un(n);let s=JSON.stringify(r)!==JSON.stringify(v.emphasisReport);return v.emphasisReport=r,s&&v.onEmphasis?.(r),r}function L1(t=null,e=null){let r=[];for(let[s,n]of v?.emphasisBounds||[])if(!(t!=null&&s!==String(t)))for(let i of n)(e==null||i.occurrence===e)&&r.push(i.box);let a=vr(r);return a?(U.frame(a),!0):!1}function D1(t){let e=[];for(let a of Array.isArray(t)?t:[]){let s=v?.placements.get(String(a?.occurrence));if(s&&!a?.reference){s.worldBounds&&e.push(s.worldBounds);continue}let n=s?.board?.scene.componentFeatures.get(String(a?.reference)),i=n?s.board.scene.features.get(Number(n.featureId))?.bounds:null;i&&e.push(xt(s.matrix,i))}let r=vr(e);return r?(U.frame(r),!0):!1}var nc=.001,U1=90,xh=["#e5484d","#30a46c","#3e63dd"],Oo=["X","Y","Z"];function mb(t,e){if(!t||!e)return!1;let r=Yt(t),a=Yt(e),s=[...r.translationMm,...r.rotation],n=[...a.translationMm,...a.rotation];return s.every((i,o)=>Math.abs(i-n[o])<1e-6)}function z1(){return{allowed:!1,enabled:!1,route:!1,space:"world",target:null,preview:null,drag:null,node:null}}function yb(){let t=v.baseDescriptor;return!t||!v.move.target||!v.move.preview?t:rd(t,v.move.target,v.move.preview)}function Da(){v.baseDescriptor&&(v.descriptor=yb(),Dr({relabel:!1}))}function ic(){let t=v.move.target;return t?v.baseDescriptor?.occurrences.find(e=>e.path===t)??null:null}function xb(){let t=v.move,e=ic();return{allowed:t.allowed,enabled:t.enabled,route:t.route,space:t.space,dragging:!!t.drag,target:e?{occurrence:e.path,instanceId:e.instanceId,displayPath:e.displayPath,kind:e.kind,restricted:!!e.restricted,pose:Yt(t.preview??e.pose),source:t.preview?"manual":e.pose?.source??"default",unsaved:!!t.preview}:null}}function gt(t){v.onMove?.({phase:t,...xb()})}function G1(t){v.move.allowed=!!t,!v.move.allowed&&v.move.enabled&&In(!1)}function In(t,{route:e=!1}={}){let r=!!t&&v.move.allowed,a=r&&!!e;r===v.move.enabled&&a===v.move.route||(v.move.route=a,a&&Ko(),r||(Ko(),v.move.node&&(v.move.node=null,v.nodePreview&&(v.nodePreview=null,bt()),ke("target"))),v.move.enabled=r,r&&Ua({quiet:!0}),gt("mode"))}function vb(t){v.move.space=t==="local"?"local":"world",gt("mode")}function oc(){return v.standInKey??Oa()}function Ua({quiet:t=!1}={}){if(!v)return;let e=oc(),r=v.move.enabled&&!v.move.route&&e!=null?td(v.baseDescriptor,e):null,a=r&&r.move!==!1?r.path:null;a!==v.move.target&&(Ko(),v.move.target=a,t||gt("target"))}function Ko(){let t=!!v.move.preview;v.move.drag=null,v.move.preview=null,v.move.target=null,t&&Da()}function K1(t){v?.move.target&&(v.move.preview=t?Yt(t):null,Da(),gt("preview"))}function cc(){!v||!v.move.preview&&!v.move.drag||(v.move.drag=null,v.move.preview=null,Da(),gt("cancel"))}function V1(){let t=`${v.move.target}/`,e=vr(v.placed.filter(r=>r.occurrence.path===v.move.target||r.occurrence.path.startsWith(t)).map(r=>r.worldBounds));return e?[0,1,2].map(r=>(e[r]+e[r+3])/2/nc):null}function er(t){let e=aa(J.matrix,pe(t,nc),J.viewport);if(!e)return null;let r=j.getBoundingClientRect();return[e.x*r.width/j.width,e.y*r.height/j.height]}function H1(){let t=Ye;if(!t)return;let e=v.move.enabled&&J?Kn():null,r=e?null:ic(),a=r&&typeof r.move=="object"?r.move:null,s=a?v.move.preview??r.pose:null,n=e?e.worldMm:v.move.enabled&&r&&J?a?.pivot==="origin"?[...s.translationMm]:V1():null,i=n?er(n):null;if(!i){t.toggleAttribute("hidden",!0),v.gizmo=null;return}t.toggleAttribute("hidden",!1),t.firstChild||q1(t);let{right:o,back:c}=U.basis(),l=er(Ee(n,o)),f=l?Math.hypot(l[0]-i[0],l[1]-i[1]):0;if(!(f>1e-6)){t.toggleAttribute("hidden",!0);return}let u=U1/f,p=r?v.move.preview??r.pose:null,b=p&&(a||v.move.space==="local")?Ql(p):Mi,h=[];b.forEach((x,g)=>{let y=er(Ee(n,pe(x,u))),m=t.querySelector(`[data-part="t${g}"]`),w=y&&Math.hypot(y[0]-i[0],y[1]-i[1])>12&&(!a||(a.translate||[]).includes(g));if(m.style.display=w?"":"none",w){let _=m.querySelector("line");_.setAttribute("x1",i[0]),_.setAttribute("y1",i[1]),_.setAttribute("x2",y[0]),_.setAttribute("y2",y[1]),m.querySelector("circle").setAttribute("cx",y[0]),m.querySelector("circle").setAttribute("cy",y[1]),m.querySelector("text").setAttribute("x",y[0]+9),m.querySelector("text").setAttribute("y",y[1]-7)}let E=ad(x),S=qe(x,E),A=[];for(let _=0;_<=64;_+=1){let R=_/64*Math.PI*2,N=er(Ee(n,pe(Ee(pe(E,Math.cos(R)),pe(S,Math.sin(R))),u*.7)));N&&A.push(`${N[0].toFixed(1)},${N[1].toFixed(1)}`)}let T=t.querySelector(`[data-part="r${g}"]`);T.setAttribute("points",A.join(" ")),T.style.display=e||a&&!(a.rotate||[]).includes(g)?"none":"",h.push({axis:x,pxPerMm:y?[(y[0]-i[0])/u,(y[1]-i[1])/u]:[0,0]})});let d=t.querySelector('[data-part="pivot"]');d.setAttribute("cx",i[0]),d.setAttribute("cy",i[1]),v.gizmo={center:i,pivot:n,handles:h,back:c,limits:a}}function q1(t){let e="http://www.w3.org/2000/svg",r=(a,s)=>{let n=document.createElementNS(e,a);for(let[i,o]of Object.entries(s))n.setAttribute(i,o);return n};xh.forEach((a,s)=>{let n=r("polyline",{"data-part":`r${s}`,class:"ring",stroke:a,fill:"none"}),i=r("title",{});i.textContent=`Rotate about ${Oo[s]}`,n.append(i),t.append(n)}),xh.forEach((a,s)=>{let n=r("g",{"data-part":`t${s}`,class:"arrow",stroke:a,fill:a}),i=r("title",{});i.textContent=`Move along ${Oo[s]}`;let o=r("text",{stroke:"none"});o.textContent=Oo[s],n.append(i,r("line",{}),r("circle",{r:6}),o),t.append(n)}),t.append(r("circle",{"data-part":"pivot",r:4,class:"pivot"})),t.append(r("text",{"data-part":"readout",class:"readout"})),t.addEventListener("pointerdown",W1),t.addEventListener("pointermove",X1),t.addEventListener("pointerup",$1),t.addEventListener("dblclick",a=>{!v?.move.node||v.move.node===Qt||(a.preventDefault(),a.stopPropagation(),ke("delete"))}),t.addEventListener("pointercancel",()=>wb())}function W1(t){let e=t.target.closest?.("[data-part]")?.dataset.part;if(!v||!e||!v.gizmo||!/^[tr][012]$/.test(e))return;t.preventDefault(),t.stopPropagation();let r=Ye.getBoundingClientRect(),a=Kn();if(a){if(e[0]!=="t")return;v.move.drag={kind:"node",handle:v.gizmo.handles[Number(e[1])],start:[t.clientX-r.left,t.clientY-r.top],startMm:a.worldMm,startPreview:v.nodePreview,matrix:Ar(gr(),Vr),changed:!1};try{Ye.setPointerCapture(t.pointerId)}catch{}return}let s=ic(),n=v.gizmo.limits;if(!(n&&!((e[0]==="t"?n.translate:n.rotate)||[]).includes(Number(e[1])))){v.move.drag={kind:e[0]==="t"?"translate":"rotate",snapDeg:n?.rotateSnapDeg??null,handle:v.gizmo.handles[Number(e[1])],start:[t.clientX-r.left,t.clientY-r.top],startPose:Yt(v.move.preview??s.pose),hadPreview:!!v.move.preview,center:v.gizmo.center,pivot:v.gizmo.pivot,back:v.gizmo.back,changed:!1};try{Ye.setPointerCapture(t.pointerId)}catch{}}}function X1(t){let e=v?.move.drag;if(!e)return;let r=Ye.getBoundingClientRect(),a=[t.clientX-r.left,t.clientY-r.top],s=t.shiftKey;if(e.kind==="node"){let o=ys(ki([a[0]-e.start[0],a[1]-e.start[1]],e.handle.pxPerMm),s?or.fineMm:or.mm),c=Ee(e.startMm,pe(e.handle.axis,o));e.changed=e.changed||o!==0,v.nodePreview={harness:v.harnessPick.key,id:v.move.node,positionMm:e.matrix?fa(e.matrix,c):c},vh(`${o>=0?"+":""}${o.toFixed(s?1:0)} mm`,a),bt(),ke("preview");return}let n,i;if(e.kind==="translate"){let o=ys(ki([a[0]-e.start[0],a[1]-e.start[1]],e.handle.pxPerMm),s?or.fineMm:or.mm);n=Zl(e.startPose,e.handle.axis,o),i=`${o>=0?"+":""}${o.toFixed(s?1:0)} mm`}else{let o=Jl(e.handle.axis,e.back,Yl(e.center,e.start,a))*180/Math.PI,c=ys(o,e.snapDeg??(s?or.fineDeg:or.deg));n=ed(e.startPose,e.handle.axis,c*Math.PI/180,e.pivot),i=`${c>=0?"+":""}${c.toFixed(0)}\xB0`}e.changed=e.changed||!mb(n,e.startPose),v.move.preview=Yt(n),vh(i,a),Da(),gt("preview")}function vh(t,e){let r=Ye.querySelector('[data-part="readout"]');r.textContent=t,r.setAttribute("x",e[0]+14),r.setAttribute("y",e[1]-10)}function $1(t){let e=v?.move.drag;if(e){if(Ye.hasPointerCapture?.(t.pointerId)&&Ye.releasePointerCapture(t.pointerId),v.move.drag=null,Ye.querySelector('[data-part="readout"]').textContent="",e.kind==="node"){e.changed&&ke("commit");return}e.changed?gt("commit"):e.hadPreview||cc()}}function wb(){let t=v?.move.drag;return t?t.kind==="route"||t.kind==="handle"?(v.move.drag=null,t.changed&&(v.nodePreview=t.kind==="handle"?t.startPreview:null,bt(),ke("cancel")),!0):(v.move.drag=null,t.kind==="node"?(Ye.querySelector('[data-part="readout"]').textContent="",v.nodePreview=t.startPreview,bt(),ke("cancel"),!0):(v.move.preview=t.hadPreview?t.startPose:null,Ye.querySelector('[data-part="readout"]').textContent="",Da(),gt("cancel"),!0)):!1}function Y1(t,e){let r=v.move;if(e==="escape"){if(Et&&!Et.hidden)Et.hidden=!0;else if(!wb()){if(!Tb())if(r.node)Vn(null);else if(r.preview)cc();else if(v.harnessPick)pr(null);else if(r.enabled)In(!1);else return!1}return!0}if(e==="m"&&r.allowed)In(!r.enabled);else if(e==="l"&&r.enabled)vb(r.space==="world"?"local":"world");else if(e==="enter"&&r.node&&v.nodePreview&&!r.drag)ke("commit");else if(e==="enter"&&r.preview&&!r.drag)gt("commit");else if((e==="delete"||e==="backspace")&&r.node&&r.node!==Qt&&!r.drag)ke("delete");else if(t.key==="?")Mb(!!Et?.hidden);else if(e==="a")U.frame(v.bounds||tr());else return!1;return!0}function Mb(t){Et&&(Et.hidden=!t)}var Ra="http://www.w3.org/2000/svg";function J1(t){let e=t.occurrence?v.placements.get(t.occurrence):null;if(!e)return null;let r=t.reference&&e.board?e.board.scene.componentFeatures.get(t.reference):null,a=r?e.board.scene.features.get(Number(r.featureId))?.bounds:null;if(a)return vs(e.matrix,[0,1,2].map(n=>(a[n]+a[n+3])/2));let s=e.worldBounds;return s?[0,1,2].map(n=>(s[n]+s[n+3])/2):null}function Q1(){let t=v.emphasisSets.length>0,e=[],r=[];for(let a of v.showHarnesses?v.harnesses:[]){let s=v.harnessLit.get(wt(a)),n=Fu(a,s),i=new Map(a.ends.map(c=>[c.id,J1(c)]));i.set("hub",a.ends.length>2?Ou([...i.values()]):null);let o=a.name||"Harness";for(let c of v.tubedHarnesses.has(wt(a))?[]:Nu(a)){let l=Bu(c,s),f=document.createElementNS(Ra,"line");f.setAttribute("class",`segment${l?" lit":t?" dim":""}`),l&&Object.assign(f.style,{stroke:l,color:l});let u=document.createElementNS(Ra,"title");u.textContent=`${o}: ${c.wires.size} wire${c.wires.size===1?"":"s"}`,f.append(u),r.push(f),e.push({node:f,kind:"line",a:i.get(c.a),b:i.get(c.b)})}for(let c of a.ends){let l=n.get(c.id),f=document.createElementNS(Ra,"circle");f.setAttribute("class",`end${l?" lit":t?" dim":""}`),f.setAttribute("r",l?"6":"4"),l&&(f.style.fill=l),r.push(f),e.push({node:f,kind:"dot",a:i.get(c.id)})}}kn.replaceChildren(...r),v.harnessDrawn={items:e,matrix:null}}function Z1(){if(!kn||!J)return;v.harnessDrawn||Q1();let t=v.harnessDrawn;kn.toggleAttribute("hidden",!t.items.length);let e=J.matrix.join(",");if(t.matrix===e)return;t.matrix=e;let r=j.getBoundingClientRect(),a=r.width/Math.max(1,j.width),s=r.height/Math.max(1,j.height),n=i=>{let o=i?aa(J.matrix,i,J.viewport):null;return o?[o.x*a,o.y*s]:null};for(let i of t.items){let o=n(i.a),c=i.kind==="line"?n(i.b):null,l=i.kind==="line"?!!(o&&c):!!o;i.node.style.display=l?"":"none",l&&(i.kind==="line"?(i.node.setAttribute("x1",o[0].toFixed(1)),i.node.setAttribute("y1",o[1].toFixed(1)),i.node.setAttribute("x2",c[0].toFixed(1)),i.node.setAttribute("y2",c[1].toFixed(1))):(i.node.setAttribute("cx",o[0].toFixed(1)),i.node.setAttribute("cy",o[1].toFixed(1))))}}function lc(t){let{right:e}=U.basis(),r=er(t),a=er(Ee(t,e));return r&&a?Math.hypot(a[0]-r[0],a[1]-r[1]):0}function dc(t){if(!v?.tubes.length||!J)return null;let e=j.getBoundingClientRect(),r=Du(v.tubes,[t.clientX-e.left,t.clientY-e.top],er,lc,v.move.route?10:5);return r?{tube:v.tubes[r.index],pointMm:r.pointMm}:null}function eM(t){let e=dc(t);return e?(pr({key:e.tube.harness,segmentId:e.tube.segmentId,pointMm:e.pointMm}),!0):(pr(null),!1)}function tM(t){if(!v?.move.enabled||!v.move.route||t.button!==0||t.shiftKey)return!1;let e=dc(t),r=e?v.harnesses.find(a=>wt(a)===e.tube.harness):null;return!e||!zn(r)?!1:(pr({key:e.tube.harness,segmentId:e.tube.segmentId,pointMm:e.pointMm}),v.move.drag={kind:"route",start:[t.clientX,t.clientY],startMm:e.pointMm,nowMm:e.pointMm,pxPerMm:lc(e.pointMm),basis:U.basis(),breakout:t.altKey,changed:!1,matrix:Ar(r,Vr),capture:j,harness:r,segment:{from:e.tube.from,to:e.tube.to,samplesMm:e.tube.samplesMm}},j.setPointerCapture(t.pointerId),!0)}function rM(t,e){Vn(e);let r=Kn();if(r){v.move.drag={kind:"handle",start:[t.clientX,t.clientY],startMm:r.worldMm,nowMm:r.worldMm,pxPerMm:lc(r.worldMm),basis:U.basis(),changed:!1,startPreview:v.nodePreview,matrix:Ar(gr(),Vr),capture:Or};try{Or.setPointerCapture(t.pointerId)}catch{}}}function kb(t){let e=v?.move.drag;if(!e||e.kind!=="route"&&e.kind!=="handle")return!1;let r=[t.clientX,t.clientY];if(!e.changed&&!zu(e.start,r))return!0;e.changed=!0,e.nowMm=Uu(e.startMm,r[0]-e.start[0],r[1]-e.start[1],e.pxPerMm,e.basis);let a=e.matrix?fa(e.matrix,e.nowMm):[...e.nowMm];return e.kind==="handle"?v.nodePreview={harness:v.harnessPick.key,id:v.move.node,positionMm:a}:v.nodePreview={harness:v.harnessPick.key,insert:ju(e.harness.nodes??[],{kind:e.breakout?"breakout":"waypoint",segment:e.segment,atMm:e.startMm,positionMm:a,toWorldMm:s=>e.matrix?Ji(e.matrix,s):s})},bt(),ke("preview"),!0}function Eb(t){let e=v?.move.drag;if(!e||e.kind!=="route"&&e.kind!=="handle")return!1;if(e.capture?.hasPointerCapture?.(t.pointerId)&&e.capture.releasePointerCapture(t.pointerId),v.move.drag=null,!e.changed)return!0;if(e.kind==="handle")return ke("commit"),!0;let r=a=>e.matrix?fa(e.matrix,a):[...a];return ke("route-drag",{atMm:r(e.startMm),positionMm:r(e.nowMm),breakout:e.breakout}),!0}function aM(t){if(!v)return!1;if(t==null)return pr(null),!0;let e=wt({level:"",id:String(t)});if(v.harnessPick?.key===e)return!0;let r=v.tubes.find(s=>s.harness===e);if(!r)return!1;let a=Math.floor(r.samplesMm.length/6)*3;return pr({key:e,segmentId:r.segmentId,pointMm:r.samplesMm.slice(a,a+3)}),!0}function pr(t){if(!t&&!v.harnessPick)return;t&&(Oe(),Ua({quiet:!0}));let e=t&&v.harnessPick?.key===t.key;v.harnessPick=t,e||(v.move.node=null,v.nodePreview=null),bt(),ke("select")}function gr(){let t=v?.harnessPick;return t?v.harnesses.find(e=>wt(e)===t.key)??null:null}function zn(t){return!!t&&!t.level&&v.move.allowed}function Gn(){let t=gr();if(!t)return[];let e=Qi([t],v.nodePreview,wt)[0],r=v.tubes.filter(a=>a.harness===v.harnessPick.key);return Lu(e,r,Ar(t,Vr)??[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])}function Kn(){return v.move.node?Gn().find(t=>t.id===v.move.node)??null:null}function Sb(){let t=gr();if(!t)return{harness:null,segment:null,pointMm:null,autoMm:null,node:null,editable:!1};let e=Ar(t,Vr),r=f=>e?fa(e,f):[...f],a=v.harnessPick,s=v.tubes.find(f=>f.harness===a.key&&f.segmentId===a.segmentId),n=[];for(let f=0;s&&f+2<s.samplesMm.length;f+=3)n.push(r(s.samplesMm.slice(f,f+3)));let o=Gn().find(f=>f.auto),c=Kn(),l=!!(c&&v.nodePreview?.id===c.id);return{harness:{id:t.id,level:t.level??null,name:t.name||""},segment:s?{id:s.segmentId,from:s.from,to:s.to,samplesMm:n}:null,pointMm:a.pointMm?r(a.pointMm):null,autoMm:o?r(o.worldMm):null,node:c?{id:c.id,kind:c.kind,auto:!!c.auto,pinned:c.pinned,positionMm:l?[...v.nodePreview.positionMm]:r(c.worldMm),unsaved:l}:null,editable:zn(t)}}function ke(t,e={}){v.onHarness?.({phase:t,...Sb(),...e})}function Vn(t){if(!v)return;let e=t&&zn(gr())&&v.move.enabled?String(t):null;e!==v.move.node&&(v.move.node=e,v.move.drag=null,v.nodePreview&&v.nodePreview.id!==e&&(v.nodePreview=null,bt()),ke("target"))}function sM(t){!v?.move.node||!v.harnessPick||(v.nodePreview=t?{harness:v.harnessPick.key,id:v.move.node,positionMm:[...t]}:null,bt(),ke("preview"))}function Tb(){return v?.nodePreview?(v.nodePreview=null,v.move.drag=null,bt(),ke("cancel"),!0):!1}function nM(){if(!gr()){v.harnessPick&&(v.harnessPick=null,v.move.node=null,v.nodePreview=null,ke("select"));return}v.move.drag||(v.nodePreview=null),v.move.node&&!Gn().some(a=>a.id===v.move.node)&&(v.move.node=null);let e=v.harnessPick,r=v.tubes.filter(a=>a.harness===e.key);if(e.pointMm&&r.length&&!r.some(a=>a.segmentId===e.segmentId)){let a=s=>{let n=1/0;for(let i=0;i+2<s.samplesMm.length;i+=3)n=Math.min(n,Math.hypot(s.samplesMm[i]-e.pointMm[0],s.samplesMm[i+1]-e.pointMm[1],s.samplesMm[i+2]-e.pointMm[2]));return n};e.segmentId=r.reduce((s,n)=>a(n)<a(s)?n:s).segmentId}ke("sync")}function iM(){let t=Or;if(!t)return;let e=v.move.enabled&&J?gr():null,r=zn(e)?Gn():[];if(t.toggleAttribute("hidden",!r.length),!r.length){t.firstChild&&t.replaceChildren();return}let a=new Map([...t.children].map(n=>[n.dataset.node,n])),s=new Set;for(let n of r){let i=er(n.worldMm),o=a.get(n.id);if(!o){o=document.createElementNS(Ra,"circle"),o.dataset.node=n.id;let c=document.createElementNS(Ra,"title");o.append(c),o.addEventListener("pointerdown",l=>{l.preventDefault(),l.stopPropagation(),rM(l,o.dataset.node)}),o.addEventListener("dblclick",l=>{l.preventDefault(),l.stopPropagation(),Vn(o.dataset.node),v.move.node&&v.move.node!==Qt&&ke("delete")}),t.append(o)}s.add(n.id),o.setAttribute("class",`node ${n.kind}${n.auto?" auto":""}${n.pinned?" pinned":""}${n.id===v.move.node?" target":""}`),o.setAttribute("r",n.kind==="breakout"?"7":"5.5"),o.querySelector("title").textContent=n.auto?"Automatic breakout: drag to place it":n.kind==="breakout"?"Breakout":n.pinned?"Pinned waypoint":"Waypoint",o.style.display=i?"":"none",i&&(o.setAttribute("cx",i[0].toFixed(1)),o.setAttribute("cy",i[1].toFixed(1)))}for(let[n,i]of a)s.has(n)||i.remove()}function oM(){hr&&(v.labelsDrawn=null,hr.replaceChildren(...v.placed.map(t=>{let e=document.createElement("div");e.className=`scene-label${t.standIn?` stand-in ${t.standIn}`:""}`;let r=document.createElement("strong");r.textContent=t.occurrence.displayPath||t.occurrence.labels?.join(" / ")||t.occurrence.path,e.append(r);let a=t.standIn?Ys[t.standIn]?.label:"";if(a){let s=document.createElement("span");s.textContent=a,e.append(s)}return t.label=e,e})))}function cM(){if(!hr||!J)return;if(hr.hidden=!v.showLabels,!v.showLabels){v.labelsDrawn=null;return}let t=j.getBoundingClientRect(),e=oc(),r=`${e}|${t.width}x${t.height}|${Array.prototype.join.call(J.matrix,",")}`;if(v.labelsDrawn?.placed===v.placed&&v.labelsDrawn.key===r)return;v.labelsDrawn={placed:v.placed,key:r};let a=t.width/Math.max(1,j.width),s=t.height/Math.max(1,j.height);for(let n of v.placed){if(!n.label)continue;let[i,o,,c,l,f]=n.worldBounds,u=aa(J.matrix,[(i+c)/2,(o+l)/2,f],J.viewport),p=u&&u.x>=0&&u.y>=0&&u.x<=j.width&&u.y<=j.height;n.label.hidden=!p,p&&(n.label.style.transform=`translate(${(u.x*a).toFixed(1)}px, ${(u.y*s).toFixed(1)}px) translate(-50%, -100%)`),n.label.classList.toggle("selected",e===n.occurrence.path)}}function lM(t,e=k){return Bc(t,e.scene.copperLayers)}async function Ab(t=we,e=k){let r=e.semanticGeometry.assets?.components_glb;if(!r||e.scene.componentTier!=="idle")return;e.scene.componentTier="loading";let a;try{a=await Wl(new URL(r,location.href).toString(),{componentFeatures:e.scene.componentFeatures,fetchBytes:_n(e)})}catch(i){throw he(t)&&(e.scene.componentTier="idle"),i}if(!he(t)||!e.renderer)return;let s=Vc(a.models);if(await qh([...s.instanced.map(i=>i.primitive),...s.baked].reduce((i,o)=>i+Lo(o),0)),!he(t)||!e.renderer)return;e.scene.componentTier="loaded",e.loadedBytes+=a.byteLength;for(let i of a.models)for(let o of i.placements){let c=e.scene.componentFeatures.get(o.designator);c&&fM(c.featureId,o.bounds,e)}v&&(v.harnessDrawn=null,v.labelsDrawn=null);for(let[i,o]of a.componentNodeCounts||[])e.scene.componentModelCounts.set(i,o);e.hiddenComponentRequest&&Wb(e.hiddenComponentRequest);let n=i=>({kind:"component",layerId:0,material:i.material,color:i.material.baseColor});e.scene.componentEntries=[...e.renderer.addInstancedPrimitives(s.instanced.map(i=>({primitive:i.primitive,placements:i.placements,metadata:n(i.primitive)}))),...s.baked.map(i=>e.renderer.addPrimitive(i,n(i)))]}function _n(t=k){return t.assetCache?e=>t.assetCache.fetchBytes(e):void 0}function Ib(t,e=k){if(!e.renderer||t-(e.tiersCheckedAt||0)<250)return;e.tiersCheckedAt=t;let r=e.renderer.cullCounts,a=s1()&&r.board+r.body>0,s=e.renderer.identityOnly&&!e.deferComponents||!e.renderer.identityOnly&&(r.full>0||a);s&&(e.scene.componentsWantedAt=t),s&&e.scene.componentTier==="idle"&&e.semanticGeometry.assets?.components_glb&&Ab(we,e).then(()=>{v&&e.renderer&&e.scene.componentTier==="loaded"&&Vo(e.scene.runtimeBounds,e)}).catch(i=>console.warn("Failed to load components",i));let n=()=>v?v.scene.gpuMemoryBytes():e.renderer.gpuMemoryBytes();e.gpuBytes=n(),!(e.gpuBytes<=M.gpuBudgetBytes)&&(e.scene.componentTier==="loaded"&&t-e.scene.componentsWantedAt>$w&&(e.renderer.removeEntries(e.scene.componentEntries),e.scene.componentEntries=[],e.scene.componentTier="idle",e.scene.componentEvictions+=1,e.gpuBytes=n()),e.gpuBytes>M.gpuBudgetBytes&&Jh(e.visibleTileIds||new Set,Math.max(0,e.residentTileGpuBytes-(e.gpuBytes-M.gpuBudgetBytes)),e))}var wh=4e-4,Mh=5e-5,dM={baseColor:[.62,.7,.8,1],metallic:0,roughness:.8,emissive:[0,0,0]};function Vo(t,e=k){if(!e.renderer)return;let r=new Map;for(let i of e.topology.physical_objects||[])i.kind==="footprint_body"&&i.designator&&i.bbox_mm?.length===4&&r.set(i.designator,i);let a=(t?.[5]??8e-4)+Mh,s=(t?.[2]??-8e-4)-Mh,n=[];for(let i of e.scene.componentFeatures.values()){let o=Number(i.featureId),c=e.scene.features.get(o),l=r.get(i.designator);if(!c||c.bounds||!l)continue;let[f,u,p,b]=l.bbox_mm.map(Number),h=String(l.layer||"").startsWith("B."),d=[f/1e3,-b/1e3,h?s-wh:a,p/1e3,-u/1e3,h?s:a+wh];c.bounds=d,c.placeholder=!0,n.push(uM(d,o))}if(n.length)for(let i of Xr(n))e.renderer.addPrimitive(i,{kind:"component",layerId:0,material:i.material,color:i.material.baseColor,opacityScale:.3,translucent:!0,placeholder:!0})}function uM([t,e,r,a,s,n],i){let o=[[[0,0,1],[[t,e,n],[a,e,n],[a,s,n],[t,s,n]]],[[0,0,-1],[[t,s,r],[a,s,r],[a,e,r],[t,e,r]]],[[1,0,0],[[a,e,r],[a,s,r],[a,s,n],[a,e,n]]],[[-1,0,0],[[t,s,r],[t,e,r],[t,e,n],[t,s,n]]],[[0,1,0],[[a,s,r],[t,s,r],[t,s,n],[a,s,n]]],[[0,-1,0],[[t,e,r],[a,e,r],[a,e,n],[t,e,n]]]],c=new Float32Array(72),l=new Float32Array(72),f=new Uint32Array(36);return o.forEach(([u,p],b)=>{p.forEach((d,x)=>{c.set(d,(b*4+x)*3),l.set(u,(b*4+x)*3)});let h=b*4;f.set([h,h+1,h+2,h,h+2,h+3],b*6)}),{position:c,normal:l,netId:new Uint32Array(24),objectFeatureId:new Uint32Array(24).fill(i),indices:f,material:dM,bounds:[t,e,r,a,s,n]}}function fM(t,e,r=k){let a=r.scene.features.get(Number(t));if(!a||!e.length)return;let s=[1/0,1/0,1/0,-1/0,-1/0,-1/0];for(let n=0;n<e.length;n+=3)s[0]=Math.min(s[0],e[n]),s[1]=Math.min(s[1],e[n+1]),s[2]=Math.min(s[2],e[n+2]),s[3]=Math.max(s[3],e[n]),s[4]=Math.max(s[4],e[n+1]),s[5]=Math.max(s[5],e[n+2]);a.bounds=a.bounds?[Math.min(a.bounds[0],s[0]),Math.min(a.bounds[1],s[1]),Math.min(a.bounds[2],s[2]),Math.max(a.bounds[3],s[3]),Math.max(a.bounds[4],s[4]),Math.max(a.bounds[5],s[5])]:s}function Hn(t,e=k){return _c(t,e.scene.copperLayers)}var hM=[.55,.35,.16,.78];function _b(t=k){return Nc(t.topology?.board?.stackup?.copper_finish)}function Rb(t,e=k){return Cc(t,e.scene.copperLayers)}var bM=.25;function Ur(){return!M.realisticColors||M.mode==="layer"?0:1-ce(M.separation/bM,0,1)}function uc(t,e=k){let r=Rb(t,e)?_b(e):Wr.copper;return Nb(Hn(t,e),r,Ur())}function Nb(t,e,r){return t.map((a,s)=>a+(e[s]-a)*r)}function pM(t,e=we){if(e===we&&v&&U){A1(t,e);return}if(e!==we||!k.renderer||!U)return;let r=performance.now(),a=Math.max(0,t-Zt);if(M.workspace==="schematic"&&C){Zt=t;let l=C.visiblePages(),f=Z?MM(l):[];C.setDomDetailPageIds(f.map(u=>u.id)),D.visiblePages=C.render(),Z?.syncWorldPages(f,C,{activeNetUid:D.activeNetUid}),ap(),qo(a,performance.now()-r),Wo(t),Fa(e);return}let s=Math.min(.05,(t-Zt)/1e3);Zt=t,U.update(s),k.renderer.resize();let n=Nn();k.scene.copperRealism!==Ur()&&Ka();for(let l of k.renderer.entries)l.layerOffset=n[l.layerId]||0;kM(t),br=Ob(t);let i=SM(t);J={layerId:0,viewport:{x:0,y:0,width:j.width,height:j.height},matrix:U.matrix(j.width,j.height,M.mode==="layer"),lod:tb(j.height,M.mode==="layer")},k.renderer.selectedOccurrence=M.selectedFeatureId||M.activeNetId?M.selectedOccurrence:-1,k.renderer.setInnerCopperMode(Wh(!M.showBoard||M.separation>.001,Lr().size>0)),Me(t);let o=M.mode==="3d"?k.visible3dLayers:Xh(),c={panels:[J],activeNetId:M.activeNetId,selectedFeatureId:M.selectedFeatureId,time:t/1e3,layerOffsets:n,visibleLayers:o,showBoard:M.showBoard,showComponents:M.showComponents,showPaste:M.separation===0,componentOpacity:ce(1-M.separation/.1,0,1),boardOpacity:Lr().size?.34:1-M.separation*.72,isolateNet:M.isolateNet,compareMode:M.mode==="layer",compareOffsets:br,layerAlphas:i,visibleTileIds:M.mode==="3d"?k.visibleTileIds:null};if(Pr=c,yM(t,c)){k.renderer.render(c),tp(),YM();for(let l of Rn)l()}Ib(t),qo(a,performance.now()-r),Wo(t),Fa(e)}var Cb=1e3,ft={key:"",matrix:new Float32Array(16),tiles:null,at:0},Pr=null,ae={canvas:null,context:null,depth:null,depthView:null,width:0,height:0},Pa=new Qs(3e3),Rn=new Set,gn={frames:0,cpuMs:0,gpuMs:0,lastTriangles:0},Ho={cullTiles:!0};function gM(t,e){let r=k.renderer;ae.canvas||(ae.canvas=document.createElement("canvas"),ae.context=ae.canvas.getContext("webgpu")),!(ae.width>=t&&ae.height>=e&&ae.depth)&&(ae.width=Math.max(ae.width,t),ae.height=Math.max(ae.height,e),ae.canvas.width=ae.width,ae.canvas.height=ae.height,ae.context.configure({device:r.device,format:r.format,alphaMode:"opaque"}),ae.depth?.destroy(),ae.depth=r.device.createTexture({label:"inset-depth",size:[ae.width,ae.height],format:r.depthFormat,sampleCount:r.sampleCount,usage:GPUTextureUsage.RENDER_ATTACHMENT}),ae.depthView=ae.depth.createView())}function Bb(){return!!(!v&&k.renderer&&Pr&&M.workspace==="pcb")}function mM(t,e,r="inset"){if(!Bb())return!1;let a=t.clientWidth,s=t.clientHeight;if(!a||!s)return!1;let n=performance.now(),i=Math.min(devicePixelRatio||1,2),o=Math.round(a*i),c=Math.round(s*i);gM(o,c);let l=_t(k.scene.runtimeBounds),f=uo(e,a,s,l,e.focusZ??0);Pa.record(r,f,n);let u={layerId:0,viewport:{x:0,y:0,width:o,height:c},matrix:f,lod:Pr.panels[0].lod},p=Pr.visibleTileIds;if(p&&Ho.cullTiles){let d=new Set;for(let x of p){let g=k.scene.tiles.get(x);g&&An(g,f,null,0,k)&&d.add(x)}p=d}let b=k.renderer.renderInto({colorView:ae.context.getCurrentTexture().createView(),depthView:ae.depthView,width:ae.width,height:ae.height},u,{...Pr,panels:[u],visibleTileIds:p});return t.width!==o&&(t.width=o),t.height!==c&&(t.height=c),t.getContext("2d").drawImage(ae.canvas,0,0,o,c,0,0,o,c),gn.frames+=1,gn.cpuMs+=performance.now()-n,gn.lastTriangles=b.triangles,!0}function yM(t,e){let r=e.panels[0].matrix,a=!1;for(let o=0;o<16;o+=1)if(r[o]!==ft.matrix[o]){a=!0;break}if(a)return ft.matrix.set(r),ft.key="",ft.at=t,!0;let s=[j.width,j.height,k.renderer.version,k.renderer.selectedOccurrence,M.workspace,M.mode,e.activeNetId,e.selectedFeatureId,e.showBoard,e.showComponents,e.showPaste,e.componentOpacity,e.boardOpacity,e.isolateNet,k.scene.layerZOffsetSignature,[...e.visibleLayers].join(","),[...e.compareOffsets].map(([o,c])=>`${o}:${c}`).join(";"),e.layerAlphas?[...e.layerAlphas].join(";"):""].join("|");return!!(e.activeNetId||e.selectedFeatureId||k.renderer.emphasizedNetIds.size)||s!==ft.key||!Fb(e.visibleTileIds,ft.tiles)||t-ft.at>Cb?(ft.key=s,ft.tiles=e.visibleTileIds,ft.at=t,!0):!1}var xM=1e3/30-2,ze={scene:null,key:"",matrix:new Float32Array(16),tiles:new Map,at:0};function vM(t,e,r){let a=J.matrix,s=!1;for(let p=0;p<16;p+=1)if(a[p]!==ze.matrix[p]){s=!0;break}if(ze.scene!==v.scene&&(ze.scene=v.scene,s=!0),s)return ze.matrix.set(a),ze.key="",ze.at=t,!0;let n=[j.width,j.height,M.showBoard,M.showComponents,M.isolateNet,M.activeNetId,M.selectedFeatureId,M.selectedOccurrence,v.showLabels,r,Ur(),oc(),v.scene.tubeVersion];for(let p of v.scene.renderers){let b=e.get(p);n.push(p.version,p.occurrenceCount,p.selectedOccurrence,p.dimCopper,p.standIn?p.boxColor.join(","):"",b?[...b.visibleLayers].join(","):"",b?.layerOffsets?Array.prototype.join.call(b.layerOffsets,","):"")}let i=n.join("|"),o=!1;for(let[p,b]of e)Fb(b.visibleTileIds,ze.tiles.get(p))||(o=!0);let c=!!(r||M.activeNetId||M.selectedFeatureId),l=o||i!==ze.key,f=c&&t-ze.at>=xM;return l||f||t-ze.at>Cb?(ze.key=i,ze.tiles=new Map([...e].map(([p,b])=>[p,b.visibleTileIds])),ze.at=t,!0):!1}function Fb(t,e){if(!t||!e)return t===e;if(t.size!==e.size)return!1;for(let r of t)if(!e.has(r))return!1;return!0}function wM(t){if(!C||!t)return{widthPx:0,heightPx:0,sourcePxPerMm:0,area:0};let e=C.pagePixelWidth(t),r=t.heightMm/Math.max(1e-6,C.scale),a=C.pageSourcePixelsPerMm(t);return{widthPx:e,heightPx:r,sourcePxPerMm:a,area:e*r}}function MM(t){if(!Z||!C)return[];let e=t||[],r=Math.max(1,Fe.clientWidth*Fe.clientHeight);return e.map(n=>({page:n,...wM(n)})).filter(n=>n.widthPx>=760&&n.heightPx>=520&&n.area>=r*.36&&n.sourcePxPerMm>=1.25).sort((n,i)=>i.area-n.area).slice(0,1).map(n=>n.page)}function Nn(t=k){let e=tr(t),r=Math.hypot((e[3]-e[0])*1e3,(e[4]-e[1])*1e3),a=M.separation*M.separation*ce(r*.12,8,25)/1e3,s=`${M.separation}:${a}:${t.scene.copperLayers.length}`;if(t.scene.layerZOffsetSignature===s)return t.scene.layerZOffsets;let n=t.scene.layerZOffsets;n.fill(0);let i=(t.scene.copperLayers.length-1)/2;return t.scene.copperLayers.forEach((o,c)=>{n[Number(o.id)]=(i-c)*a}),t.scene.layerZOffsetSignature=s,n}function Ob(t){if(M.mode!=="layer")return Ie.key="3d",Ie.current.clear(),new Map;let e=k.scene.copperLayers.filter(x=>k.compareLayers.has(Number(x.id))),r=Math.max(1,e.length),a=j.width/Math.max(1,j.height),s=1;r===2?s=a>=1?2:1:r===3||r===4?s=2:r>4&&(s=Math.ceil(Math.sqrt(r*a)));let n=Math.ceil(r/s),i=tr(),o=i[3]-i[0],c=i[4]-i[1],l=o*1.18,f=c*1.22,u=e.map((x,g)=>{let y=g%s,m=Math.floor(g/s);return{layer:x,layerId:Number(x.id),column:y,row:m,offset:[(y-(s-1)/2)*l,((n-1)/2-m)*f,0]}}),p=`${s}x${n}:${u.map(x=>x.layerId).join(",")}`;if(p!==Ie.key){Ie.key=p,Ie.started=t,Ie.from=new Map(Ie.current);let x=s*o+(s-1)*(l-o),g=n*c+(n-1)*(f-c);U.targetFocus=[(i[0]+i[3])/2,(i[1]+i[4])/2,(i[2]+i[5])/2],U.targetOrthoScale=Math.max(g,x/a)*1.08}let b=ce((t-Ie.started)/420,0,1),h=1-Math.pow(1-b,3),d=new Map;for(let x of u){let g=Ie.from.get(x.layerId)||[0,0,0],y=x.offset.map((m,w)=>g[w]+(m-g[w])*h);d.set(x.layerId,y),Ie.current.set(x.layerId,y)}if(W.phase==="reveal")for(let x of W.previous)d.has(Number(x))||d.set(Number(x),W.previousOffsets.get(Number(x))||[0,0,0]);for(let x of[...Ie.current.keys()])u.some(g=>g.layerId===x)||Ie.current.delete(x);return d}function za(t){let e=new Set([...t].map(Number));if(!(kh(e,k.desiredCompareLayers)&&W.phase!=="idle")){if(k.desiredCompareLayers=e,kh(e,k.compareLayers)){W.phase="idle",W.previous.clear(),W.target.clear();return}W.phase="preload",W.previous=new Set(k.compareLayers),W.target=new Set(e),W.previousOffsets=new Map(Ie.current),W.started=performance.now(),Me(W.started,{force:!0})}}function fc({snap:t=!0}={}){M.mode="layer";let e=f1();k.desiredCompareLayers=new Set(e),!k.compareLayers.size&&e.size&&(k.compareLayers=new Set(e)),W.phase="idle",W.previous.clear(),W.target.clear(),Ie.key="",U.setAxis("z",!1),k.renderer?.resize(),br=Ob(performance.now()),t&&U.snap(),Me(performance.now(),{force:!0})}function kM(t){if(!(M.mode!=="layer"||W.phase==="idle")){if(W.phase==="preload"){if(!EM(W.target)){Me(t,{force:!0});return}W.phase="reveal",W.started=t,W.previousOffsets=new Map(Ie.current),k.compareLayers=new Set(W.target),Ie.key="";return}W.phase==="reveal"&&t-W.started>=_h&&(k.compareLayers=new Set(W.target),W.phase="idle",W.previous.clear(),W.target.clear(),W.previousOffsets.clear(),Me(t,{force:!0}))}}function EM(t,e=k){for(let r of e.scene.tiles.values())if(t.has(Number(r.layerId))&&!e.scene.residentTiles.has(r.id)&&!e.scene.failed.has(r.id))return!1;return!0}function SM(t){if(M.mode!=="layer"||W.phase!=="reveal")return null;let e=ce((t-W.started)/_h,0,1),r=e*e*(3-2*e),a=new Map;for(let s of W.previous)a.set(Number(s),W.target.has(Number(s))?1:1-r);for(let s of W.target)a.set(Number(s),W.previous.has(Number(s))?1:r);return a}function kh(t,e){if(t.size!==e.size)return!1;for(let r of t)if(!e.has(r))return!1;return!0}function hc(){if(M.workspace==="schematic"){AM();return}if(M.workspace==="bom"){TM();return}if(M.workspace==="stackup")return;Fn.textContent=k.viewerReadiness.stage==="semantic-ready"?"Semantic GLTF A0":"Prism staged 3D",On.textContent="Layers",Pn.textContent="Visibility and compare",Y('[data-panel="search"] .section-heading span').textContent="Nets, components and pins",Y('[data-panel="view"] .section-heading span').textContent="Camera and stackup";let t=`
    <div class="mode-toolbar">
      <button data-mode="layer">PCB</button>
      <button data-mode="3d">3D</button>
    </div>`;Fr&&(Fr.innerHTML=t),nt.innerHTML=`
    ${Fr?"":t}
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
    </label>`,Pe(),jM()}function TM(){Fn.textContent="BoM A0",On.textContent="Bill of Materials",Pn.textContent="Grouped procurement view",Y('[data-panel="search"] .section-heading span').textContent="Search inside the BoM table",Y('[data-panel="view"] .section-heading span').textContent="BoM actions";let t=it?.payload?.counts||{};nt.innerHTML=`
    <div class="selection-properties">
      <div class="selection-property"><small>Rows</small><strong>${t.rows||0}</strong></div>
      <div class="selection-property"><small>Components</small><strong>${t.components||0}</strong></div>
      <div class="selection-property"><small>DNP</small><strong>${t.dnpComponents||0}</strong></div>
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
    </div>`,ve.querySelector("#clear-selection")?.addEventListener("click",Oe)}function AM(){Fn.textContent=Z?"Schematic SVG DOM":D.manifest?.schema==="prism.schematic_vector_a0"?"Schematic Vector A0":"Schematic World A0",On.textContent="Pages",Pn.textContent=`${D.pages.length} hierarchy instances`,Y('[data-panel="search"] .section-heading span').textContent="Pages, nets and components",Y('[data-panel="view"] .section-heading span').textContent="World navigation",nt.innerHTML=`
    <div class="layer-presets">
      <button data-page-action="world">Fit world</button>
      <button data-page-action="parent">Parent</button>
      <button data-page-action="previous">Previous</button>
      <button data-page-action="next">Next</button>
    </div>
    <div class="page-list">${D.pages.map(t=>`
      <button class="page-row ${t.id===M.selectedPageId?"active":""}" data-page="${t.id}">
        <span>${t.sheetNumber}</span>
        <strong>${V(t.name)}</strong>
        <small>L${t.depth}</small>
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
    </div>`,nt.querySelectorAll("[data-page]").forEach(t=>{t.addEventListener("click",()=>Tt(t.dataset.page,!0))}),nt.querySelectorAll("[data-page-action]").forEach(t=>{t.addEventListener("click",()=>mn(t.dataset.pageAction))}),ve.querySelector("#entity-search").addEventListener("input",t=>{_M(t.target.value)}),ve.querySelector("#frame-selection").addEventListener("click",Lb),ve.querySelector("#clear-selection").addEventListener("click",Ga),De.querySelector("#show-hierarchy").checked=C?.showHierarchy??!0,De.querySelector("#show-hierarchy").addEventListener("change",t=>{C.showHierarchy=t.target.checked})}function Tt(t,e){let r=D.byId.get(t);!r||!C||(M.selectedPageId=r.id,M.selectedSchematicFeature=null,C.selectedPageId=r.id,C.selectedFeatureId=0,pt.textContent=JSON.stringify(r,null,2),e&&C.framePage(r),nt.querySelectorAll("[data-page]").forEach(a=>{a.classList.toggle("active",a.dataset.page===r.id)}))}function mn(t){if(!C)return;if(t==="world"){C.frameWorld();return}let e=Math.max(0,D.pages.findIndex(a=>a.id===M.selectedPageId)),r=null;t==="previous"?r=D.pages[(e-1+D.pages.length)%D.pages.length]:t==="next"?r=D.pages[(e+1)%D.pages.length]:t==="parent"&&(r=D.byId.get(D.pages[e]?.parentId)),r&&Tt(r.id,!0)}function IM(t){if(!t||!C)return;if(Ga(),t.kind==="page"&&t.pageId){Tt(t.pageId,!0);return}if(t.kind!=="sheet")return;let e=D.pages.find(n=>n.sheetInstancePath===t.sheetInstancePath)||D.byId.get(M.selectedPageId),r=String(t.sheetFile||t.feature?.sheet_file||"").replace(/\\/g,"/"),a=String(t.sheetName||t.feature?.sheet_name||t.feature?.objectId||""),s=D.pages.find(n=>{if(e&&n.parentId&&n.parentId!==e.id)return!1;let i=String(n.sourcePath||"").replace(/\\/g,"/");return r&&i.endsWith(r)||a&&n.name===a})||D.pages.find(n=>{let i=String(n.sourcePath||"").replace(/\\/g,"/");return r&&i.endsWith(r)||a&&n.name===a});s&&Tt(s.id,!0)}function _M(t){let e=ve.querySelector("#search-results"),r=t.trim().toLowerCase();if(!r){e.innerHTML="";return}let a=D.pages.filter(n=>`${n.name} ${n.sheetPath}`.toLowerCase().includes(r)).slice(0,8),s=k.scene.nets.filter(n=>String(n.name).toLowerCase().includes(r)).slice(0,8);e.innerHTML=[...a.map(n=>`<button data-page="${n.id}"><b>${V(n.name)}</b><span>Page ${n.sheetNumber}</span></button>`),...s.map(n=>`<button data-schematic-net="${n.id}"><b>${V(n.name)}</b><span>${(D.manifest.netToPages?.[n.uid]||[]).length} pages</span></button>`)].join(""),e.querySelectorAll("[data-page]").forEach(n=>{n.addEventListener("click",()=>Tt(n.dataset.page,!0))}),e.querySelectorAll("[data-schematic-net]").forEach(n=>{n.addEventListener("click",()=>Pb(Number(n.dataset.schematicNet),!0))})}function Pb(t,e){let r=k.scene.nets.find(s=>Number(s.id)===t);if(!r||!C)return;M.activeNetId=t,M.selectedFeatureId=0,M.selectedSchematicFeature=null,C.selectedFeatureId=0,C.selectedFeatureKey="",C.selectedSourceId="",D.activeNetUid=r.uid,C.activeNetUid=r.uid,Z?.setHighlightedNet(r.uid),pt.textContent=JSON.stringify(r,null,2),Qe();let a=D.manifest.netToPages?.[r.uid]||[];e&&a.length&&Tt(a[0],!0)}function jb(t,e=null){let r=k.scene.nets.find(a=>a.uid===t);r&&(M.activeNetId=Number(r.id),D.activeNetUid=r.uid,C&&(C.activeNetUid=r.uid,C.selectedFeatureId=Number(e?.feature?.id||e?.featureId||0),C.selectedFeatureKey=e?.feature?.stableKey||e?.featureKey||"",C.selectedSourceId=e?.feature?.sourceId||e?.sourceId||""),Z?.setHighlightedNet(r.uid),e&&(M.selectedSchematicFeature={...e,pageId:M.selectedPageId}),pt.textContent=JSON.stringify(e?{...e,net:r}:r,null,2),Qe())}function Ga(){M.activeNetId=0,M.selectedFeatureId=0,M.selectedSchematicFeature=null,D.activeNetUid="",C&&(C.activeNetUid="",C.selectedFeatureId=0,C.selectedFeatureKey="",C.selectedSourceId=""),Z?.setSelection(null),Z?.setHighlightedNet(""),pt.textContent="No object selected",Qe()}function Lb(){let t=D.byId.get(M.selectedPageId);t?C.framePage(t):C.frameWorld()}function RM(t){M.selectedPageId=t.sheetInstancePath&&D.pages.find(a=>a.sheetInstancePath===t.sheetInstancePath)?.id||M.selectedPageId,M.selectedFeatureId=0,M.selectedSchematicFeature={...t,pageId:M.selectedPageId},t.anchor&&(M.selectionAnchor=t.anchor),C&&(C.selectedPageId=M.selectedPageId,C.selectedFeatureId=Number(t.feature?.id||0));let e=t.netUid?k.scene.nets.find(a=>a.uid===t.netUid):null,r=t.reference?k.scene.componentFeatures.get(t.reference):null;r&&(M.selectedFeatureId=Number(r.featureId||0),it?.setSelectionByReference(t.reference,{scroll:M.workspace==="bom"})),pt.textContent=JSON.stringify({...t,net:e,component:r},null,2),Qe()}function NM(t){let{page:e,feature:r}=t;if(!r){M.selectedSchematicFeature=null,C.selectedFeatureId=0,Tt(e.id,!1),Qe();return}let a=Number(r.id||0);if(M.selectedPageId=e.id,C.selectedPageId=e.id,C.selectedFeatureId=a,M.selectedSchematicFeature={...r,pageId:e.id},M.selectionAnchor=null,r.netUid){let s=k.scene.nets.find(n=>n.uid===r.netUid);if(s){Pb(Number(s.id),!1),M.selectedSchematicFeature={...r,pageId:e.id},C.selectedFeatureId=a;return}}if(r.reference){let s=k.scene.componentFeatures.get(r.reference);if(s){yr(Number(s.featureId),!1),M.selectedSchematicFeature={...r,pageId:e.id},C.selectedFeatureId=a;return}}M.activeNetId=0,M.selectedFeatureId=0,C.activeNetUid="",pt.textContent=JSON.stringify({page:e.name,...r},null,2),Qe()}function mr(){let t=M.isolateNet,e=ve?.querySelector?.("#isolate-net");e?.classList.toggle("active",t),e?.setAttribute("aria-pressed",String(t));let r=te?.querySelector?.("[data-action=isolate]");r?.classList.toggle("active",t),r?.setAttribute("aria-pressed",String(t));let a=De?.querySelector?.("#show-board");a&&(a.checked=M.showBoard);let s=De?.querySelector?.("#show-components");s&&(s.checked=M.showComponents),At()}function CM(){let t=new Set;for(let e of Lr())for(let r of bc(e))t.add(r);return t}function bc(t,e=k){let r=new Set,a=e.scene.nets.find(n=>Number(n.id)===Number(t)),s=new Set(e.scene.copperLayers.map(n=>Number(n.id)));for(let n of Object.keys(a?.layerBoundsMm||{})){let i=Number(n);s.has(i)&&r.add(i)}if(!r.size){let n=new Map(e.scene.copperLayers.map(i=>[i.name,Number(i.id)]));for(let i of a?.metrics?.layers||[]){let o=n.get(i);o!=null&&r.add(o)}}if(r.size)return r;for(let n of e.scene.tiles.values())Zh(n,t)&&r.add(Number(n.layerId));return r}function zr(){if(v){for(let e of Je())Un(e);return}let t=CM();t.size&&(k.visible3dLayers=new Set(t),M.mode==="layer"?za(t):(k.compareLayers=new Set(t),k.desiredCompareLayers=new Set(t)),Me(performance.now(),{force:!0}))}function Hr(t){let e=!!(t&&Kr()),r=M.isolateNet;if(e&&!M.isolateNet&&!v&&(k.preIsolation3dLayers=new Set(k.visible3dLayers),k.preIsolationCompareLayers=new Set(k.desiredCompareLayers.size?k.desiredCompareLayers:k.compareLayers)),M.isolateNet=e,v)zr();else if(M.isolateNet)zr();else if(k.preIsolation3dLayers||k.preIsolationCompareLayers){if(k.preIsolation3dLayers&&(k.visible3dLayers=new Set(k.preIsolation3dLayers)),k.preIsolationCompareLayers){let a=new Set(k.preIsolationCompareLayers);M.mode==="layer"?za(a):(k.compareLayers=a,k.desiredCompareLayers=new Set(a))}k.preIsolation3dLayers=null,k.preIsolationCompareLayers=null,Me(performance.now(),{force:!0})}e&&!r?(M.preIsolationShowBoard=M.showBoard,M.showBoard=!1):!e&&r&&(typeof M.preIsolationShowBoard=="boolean"&&(M.showBoard=M.preIsolationShowBoard),M.preIsolationShowBoard=null),mr(),Pe()}function Pe(){(Fr||nt).querySelectorAll("[data-mode]").forEach(r=>{let a=r.dataset.mode===M.mode;r.classList.toggle("active",a),r.setAttribute("aria-pressed",String(a))}),De.querySelector("#show-board").checked=M.showBoard,De.querySelector("#show-components").checked=M.showComponents,De.querySelector("#separation").value=M.separation;let t=nt.querySelector(".layer-list"),e=M.mode==="3d"?k.visible3dLayers:k.desiredCompareLayers;t.innerHTML=k.scene.copperLayers.map((r,a)=>`
    <label class="layer-row">
      <input type="checkbox" data-layer="${r.id}" ${e.has(Number(r.id))?"checked":""}>
      <span class="swatch" style="background:${qn(Hn(r))}"></span>
      <span>${V(r.name)}</span><small>${a+1}</small>
    </label>`).join(""),t.querySelectorAll("[data-layer]").forEach(r=>r.addEventListener("change",()=>{Ub(Number(r.dataset.layer),r.checked)})),mr()}function Db(t){t==="layer"?fc():(M.mode="3d",U.frame(tr()),U.snap(),k.visibleTileIds=new Set,Me(performance.now(),{force:!0})),Pe()}function Ub(t,e,r=null){if(v){let a=Number(t);sc(r==null?null:[r],s=>e?s.delete(a):s.add(a));return}if(M.mode==="3d")e?k.visible3dLayers.add(t):k.visible3dLayers.delete(t),Me(performance.now(),{force:!0});else{let a=new Set(k.desiredCompareLayers);e?a.add(t):a.delete(t),za(a)}Pe()}function zb(t,e=null){if(v){sc(e==null?null:[e],(a,s)=>{let n=s?.scene.copperLayers||[];a.clear(),n.forEach((i,o)=>{t==="all"||t==="outer"&&(o===0||o===n.length-1)||t==="inner"&&o>0&&o<n.length-1||a.add(Number(i.id))})});return}let r=M.mode==="3d"?k.visible3dLayers:new Set;r.clear();for(let[a,s]of k.scene.copperLayers.entries())(t==="all"||t==="outer"&&(a===0||a===k.scene.copperLayers.length-1)||t==="inner"&&a>0&&a<k.scene.copperLayers.length-1)&&r.add(Number(s.id));M.mode==="3d"?Me(performance.now(),{force:!0}):za(r),Pe()}function Gb(t){M.showBoard=!!t,M.savedShowBoard=M.showBoard,M.showBoard&&M.isolateNet?Hr(!1):mr()}function Kb(t){M.showComponents=!!t,M.savedShowComponents=M.showComponents,mr()}function BM(t){M.showPlaceholders=!!t;for(let e of v?Je():[k])e.renderer?.setPlaceholdersVisible(M.showPlaceholders);At()}function FM(){let t=new Set((k.scene?.layers||[]).map(a=>String(a.name))),e=new Set(M.hiddenBoardLayers),r=a=>{let s=(k.renderer?.entries||[]).find(i=>i.kind==="board"&&i.boardRole===a),n=s?.color||s?.material?.baseColor;return n?qn(n):Ww[a]};return qw.filter(a=>!t.size||t.has(a.name)).map(a=>({...a,color:r(a.role),visible:!e.has(`${a.role}:${a.side}`)}))}function OM(t,e,r){let a=`${t}:${e}`,s=new Set(M.hiddenBoardLayers);r?s.delete(a):s.add(a),M.hiddenBoardLayers=[...s];for(let n of v?Je():[k])n.renderer?.setHiddenBoardLayers(M.hiddenBoardLayers);At()}function PM(t){M.realisticColors=!!t,Ka(),At()}function Ka(t=k){if(!t.renderer)return;let e=new Map(t.scene.layers.map(r=>[Number(r.id),r]));for(let r of t.renderer.entries)r.kind==="copper"&&(r.color=uc(e.get(Number(r.layerId)),t));t.renderer.setBarrelColor(Nb(hM,[..._b(t).slice(0,3),.78],Ur())),t.scene.copperRealism=Ur()}function Vb(t,e=null){if(v){O1(ce(Number(t)||0,0,1),e);return}M.separation=ce(Number(t)||0,0,1),At()}function jM(){(Fr||nt).querySelectorAll("[data-mode]").forEach(e=>e.addEventListener("click",()=>{Db(e.dataset.mode)})),nt.querySelectorAll("[data-preset]").forEach(e=>e.addEventListener("click",()=>{zb(e.dataset.preset)})),De.querySelector("#show-board").addEventListener("change",e=>{Gb(e.target.checked)}),De.querySelector("#show-components").addEventListener("change",e=>{Kb(e.target.checked)}),De.querySelector("#separation").addEventListener("input",e=>{Vb(e.target.value)}),ve.querySelector("#clear-selection").addEventListener("click",Oe),ve.querySelector("#isolate-net").addEventListener("click",()=>{Hr(!M.isolateNet)}),ve.querySelector("#frame-selection").addEventListener("click",xc),ve.querySelector("#show-net-layers").addEventListener("click",pc);let t=ve.querySelector("#entity-search");t.addEventListener("input",()=>qb(t.value))}function Hb(){fr(".rail-tab").forEach(t=>t.addEventListener("click",()=>{let e=t.dataset.tab,r=M.activeTab===e&&!St.classList.contains("panel-collapsed");M.activeTab=e,St.classList.toggle("panel-collapsed",r),fr(".rail-tab").forEach(a=>{a.classList.toggle("active",!r&&a.dataset.tab===e)}),fr(".tab-panel").forEach(a=>{a.classList.toggle("active",!r&&a.dataset.panel===e)})}))}function pc(){if(v){C1();return}let t=k.scene.nets.find(a=>Number(a.id)===M.activeNetId);if(!t)return;let e=new Set(t.metrics?.layers||[]),r=M.mode==="3d"?k.visible3dLayers:new Set;r.clear();for(let a of k.scene.copperLayers)e.has(a.name)&&r.add(Number(a.id));M.mode==="3d"?Me(performance.now(),{force:!0}):za(r),Pe()}function qb(t){let e=ve.querySelector("#search-results"),r=t.trim().toLowerCase();if(!r){e.innerHTML="";return}let a=k.scene.nets.filter(n=>String(n.name).toLowerCase().includes(r)).slice(0,8),s=[...k.scene.componentFeatures.values()].filter(n=>!k.hiddenComponents.has(String(n.designator||""))&&`${n.designator} ${n.value} ${n.footprint}`.toLowerCase().includes(r)).slice(0,6);e.innerHTML=[...a.map(n=>`<button data-net="${n.id}"><b>${V(n.name)}</b><span>${V(n.netClass||"")}</span></button>`),...s.map(n=>`<button data-feature="${n.featureId}"><b>${V(n.designator)}</b><span>${V(n.value)}</span></button>`)].join(""),e.querySelectorAll("[data-net]").forEach(n=>{n.addEventListener("click",()=>gc(Number(n.dataset.net),!0))}),e.querySelectorAll("[data-feature]").forEach(n=>{n.addEventListener("click",()=>yr(Number(n.dataset.feature),!0))})}function gc(t,e){e&&(M.selectionAnchor=null),M.activeNetId=t,M.selectedFeatureId=0;let r=k.scene.nets.find(a=>Number(a.id)===t);M.workspace==="schematic"&&r&&C&&(D.activeNetUid=r.uid,C.activeNetUid=r.uid),Qo(),pt.textContent=JSON.stringify(r||{},null,2),Qe(),M.isolateNet&&zr(),e&&r?.boundsMm&&U.frame(Jo($r(r.boundsMm))),Me(performance.now(),{force:!0}),Ln(zh(r))}function yr(t,e=!1){let r=k.scene.features.get(t);if(r?.kind==="component"&&es(Gr(r),k.hiddenComponents))return;e&&(M.selectionAnchor=null),M.selectedFeatureId=t,M.activeNetId=Number(r?.netId||0);let a=Gr(r);a&&it?.setSelectionByReference(a,{scroll:M.workspace==="bom"});let s=Gh(r);s?.kind==="net"?Qo():Kh(),pt.textContent=r?JSON.stringify(r,null,2):"No object selected",Qe(),M.isolateNet&&M.activeNetId&&zr(),e&&r?.bounds&&yc(r),Me(performance.now(),{force:!0}),Ln(s)}function mc(t,e=!1){if(es(t,k.hiddenComponents))return;let r=k.scene.componentFeatures.get(t);if(it?.setSelectionByReference(t,{scroll:M.workspace==="bom"}),!r?.featureId)return;Kh(),yr(Number(r.featureId),!1);let a=DM(t);if(a){let{page:s,feature:n}=a;M.selectedPageId=s.id,M.selectedSchematicFeature={...n,pageId:s.id},C&&(C.selectedPageId=s.id,C.selectedFeatureId=Number(n.id||0)),Z?.setSelection?.({kind:"component",featureKey:n.stableKey||"",sheetInstancePath:n.sheetInstancePath||s.sheetInstancePath||"",sourceId:n.sourceId||n.uuid||"",reference:t,feature:n,pageId:s.id}),e&&M.workspace==="schematic"&&(Tt(s.id,!0),Z?.frameSelection?.())}if(e&&M.workspace==="pcb"){let s=k.scene.features.get(Number(r.featureId));s?.bounds&&yc(s,!0)}Qe()}function Gr(t){return t?.designator||t?.reference||t?.componentDesignator||""}function LM(t=k){return Fc(t.scene.manifest?.components||[],t.scene.componentModelCounts)}function Wb(t){k.hiddenComponentRequest=t;let e=Oc(t,LM());k.hiddenComponents=e.hiddenReferences,k.renderer?.setHiddenFeatureIds(e.hiddenFeatureIds),e.ambiguous.length&&console.warn(`[prism-semantic-viewer] keeping ambiguous components visible: ${e.ambiguous.join(", ")}`),e.unknown.length&&console.warn(`[prism-semantic-viewer] ignoring unknown components: ${e.unknown.join(", ")}`);let r=Gr(k.scene.features.get(M.selectedFeatureId));es(r,k.hiddenComponents)&&Oe();let a=ve.querySelector("input");return a?.value&&qb(a.value),e}function yc(t,e=!1){if(!t?.bounds)return;let r=Jo(t.bounds);if(e||t.kind==="component"||!!Gr(t)){let n=(r[2]+r[5])*.5<0,i=U.isBelow();n!==i&&U.setAxis("z",n)}U.frame(r)}function DM(t){if(!t||!C?.featuresByPage)return null;let e=D.byId.get(M.selectedPageId),r=[...e?[e]:[],...(D.pages||[]).filter(s=>s.id!==e?.id)],a=s=>{let n=String(s.kind||"").toLowerCase();return n==="component"||n==="symbol_body"||n==="symbol_instance"?0:n==="symbol_reference"?1:n.startsWith("pin")?2:3};for(let s of r){let n=(C.featuresByPage[s.id]||[]).filter(i=>String(i.reference||i.designator||i.componentDesignator||"")===t).sort((i,o)=>a(i)-a(o));if(n.length)return{page:s,feature:n[0]}}return null}function Oe(){M.activeNetId=0,M.selectedFeatureId=0,v&&(v.boardSelected=!1,v.standInKey=null),M.selectedSchematicFeature=null,M.selectionAnchor=null;let t=Kr(),e=M.isolateNet;e&&!t?Hr(!1):t?e&&zr():M.isolateNet=!1,t||Vh(),D.activeNetUid="",C&&(C.activeNetUid=""),Z?.setSelection(null),Z?.setHighlightedNet(""),pt.textContent="No object selected",it?.clearSelection?.(),Qe(),Ln(null)}function yn(t){return`<div class="selection-properties">${t.map(([e,r])=>`
    <div class="selection-property">
      <small>${V(e)}</small>
      <strong title="${V(String(r))}">${V(String(r))}</strong>
    </div>`).join("")}</div>`}function Cn(t,e,r){return`
    <div class="selection-card-head">
      <span class="selection-card-accent" style="background:${r}"></span>
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
      <div class="selection-card-title"><small>${V(t)}</small><strong>${V(e)}</strong></div>
      <button class="selection-card-close" type="button" aria-label="Clear selection">&times;</button>
    </div>`}function UM(t){let r=(k.topology.net_details?.[t.uid]||{}).terminals||[],a=t.metrics||{},s=Number(a.traceLengthMm||0).toFixed(2),n=a.objectCounts?.via||0,i=r.length,c=/^(VCC|VDD|GND|3V3|5V|12V|VIN|POWER)/i.test(t.name)?"#10b981":"#8b5cf6",l=t.netClass||"Default",f=r.length?r.map(u=>`
      <div class="selection-row pin-row-interactive" data-ref="${V(u.designator)}" data-pin="${V(u.pin)}">
        <span class="refdes-col"><strong>${V(u.designator)}</strong></span>
        <span class="pin-col">Pin ${V(u.pin)}</span>
        <span class="val-col" title="${V(u.value||"")}">${V(u.value||"-")}</span>
      </div>`).join(""):'<div class="selection-empty">No connected pin metadata is available.</div>';return`
    ${Cn("Net",t.name,c)}
    <div class="selection-net-dashboard">
      <div class="net-metric-grid">
        <div class="metric-card">
          <small>Length</small>
          <strong>${s} <span class="unit">mm</span></strong>
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
          ${(a.layers||[]).length?a.layers.map(u=>`<span class="layer-badge">${V(u)}</span>`).join(""):'<span class="layer-badge unknown">None</span>'}
        </div>
      </div>

      <div class="selection-section">
        <span class="selection-section-title">Connected Pins</span>
        <div class="selection-table compact-scroll" style="max-height: 120px;">
          ${f}
        </div>
      </div>
    </div>`}function zM(t,e=null){let r=$o(t.designator),a=r?r.value:t.value||"Not specified",s=r?r.footprint:t.footprint||"Not specified",n=r?.parameters||{},i=n.Manufacturer||n.Mfr||"",o=n["Manufacturer Part Number"]||n.MPN||n["Part Number"]||"",c=n.kicad_dnp==="true"||n.DNP==="true"||n.kicad_in_bom==="false",l="";(i||o)&&(l=`
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
      </div>`);let f="";return e&&(f=`
      <div class="selection-section">
        <span class="selection-section-title">Selected Pin</span>
        <div class="selection-table">
          <div class="selection-row">
            <span><strong>Pin</strong></span>
            <span>Pin ${V(e.pinNumber||e.pin||"")}</span>
            <span title="${V(e.pinName||"")}">${V(e.pinName||"No name")}</span>
          </div>
          <div class="selection-row">
            <span><strong>Net</strong></span>
            <span class="net-ref-interactive" data-net-name="${V(e.netName||"")}">${V(e.netName||"Not connected")}</span>
          </div>
        </div>
      </div>`),`
    ${Cn("Component",t.designator||"Unknown","#3b82f6")}
    <div class="selection-component-dashboard">
      ${c?'<div class="dnp-banner" style="background:#b45309;color:#fff;font-size:9px;font-weight:750;text-align:center;padding:3px;margin-bottom:8px;border-radius:2px;text-transform:uppercase;letter-spacing:0.05em;">DNP (Do Not Populate)</div>':""}
      ${yn([["Value",a],["Footprint",s.split(":").pop()||s]])}
      ${l}
      ${f}
    </div>`}function GM(t,e){let r=String(t.kind||"").toLowerCase(),a=r.startsWith("pin");if(r==="component"||r.includes("symbol"))return`
      ${Cn("Component",t.reference||t.componentDesignator||"Unknown","#3b82f6")}
      ${yn([["Value",t.value||t.componentValue||"Not specified"],["Footprint",t.componentFootprint||t.footprint||"Not specified"],["Library",t.libraryRef||"Not specified"],["UID",t.componentUid||t.uuid||t.sourceId||"Not resolved"]])}
      <div class="selection-section">
        <span class="selection-section-title">Schematic placement</span>
        ${yn([["Page",e?.name||"Unknown"],["Sheet",t.sheetInstancePath||"/"]])}
      </div>`;let n=a?[["Symbol",t.reference||t.designator||"Unknown"],["Value",t.value||t.componentValue||"Not specified"],["Pin",`${t.pinNumber||"-"}${t.pinName?` ${t.pinName}`:""}`],["Net",t.netName||"Not connected"],["PCB Pad",t.pcbPadId||"Not resolved"],["Component UID",t.componentUid||"Not resolved"]]:[["Page",e?.name||"Unknown"],["Kind",t.kind.replaceAll("_"," ")],["Net",t.netName||"Not connected"]];return`
    ${Cn(t.kind.replaceAll("_"," "),t.pinName||t.reference||t.designator||t.text||t.netName||"Schematic object","#3b82f6")}
    ${yn(n)}
    <div class="selection-section">
      <span class="selection-section-title">Source identity</span>
      <div class="selection-table">
        <div class="selection-row">
          <span><strong>${a?"Pin UUID":"UUID"}</strong></span>
          <span title="${V(t.uuid||t.sourceId||"")}">${V(t.uuid||t.sourceId||"-")}</span>
          <span title="${V(t.objectId||"")}">${V(t.objectId||"No object ID")}</span>
        </div>
        <div class="selection-row">
          <span><strong>Sheet</strong></span>
          <span>${V(e?.name||"Unknown")}</span>
          <span title="${V(t.sheetInstancePath||"")}">${V(t.sheetInstancePath||"/")}</span>
        </div>
      </div>
    </div>`}function Qe(){if(At(),M.workspace==="bom"){te.hidden=!0,te.innerHTML="";return}let t=k.scene.features.get(M.selectedFeatureId),e=t?.kind==="component"?t:null,r=M.workspace==="schematic"?M.selectedSchematicFeature:null,a=r?D.byId.get(r.pageId):null,s=M.activeNetId?k.scene.nets.find(u=>Number(u.id)===M.activeNetId):null;if(!s&&r&&(r.netUid?s=k.scene.nets.find(u=>u.uid===r.netUid):r.netName&&(s=sr(k.scene.nets,r.netName))),!e&&r){let u=r.reference||r.componentDesignator||r.designator;u&&(e=k.scene.componentFeatures.get(u)||{designator:u})}if(!e&&!s&&!r){te.hidden=!0,te.innerHTML="";return}let n="";if(s)n=UM(s);else if(e){let u=r?.kind?.startsWith("pin")?r:null;n=zM(e,u)}else r&&(n=GM(r,a));te.innerHTML=`
    ${n}
    <div class="selection-card-actions">
      ${s?`
        <button type="button" data-action="isolate" aria-keyshortcuts="I" title="Toggle isolated net view (I)" class="${M.isolateNet?"active":""}">Isolate</button>
        <button type="button" data-action="net-layers">Layers</button>
      `:""}
      <button type="button" data-action="frame">Frame selection</button>
    </div>`,te.hidden=!1;let i=M.workspace==="schematic"?Fe:j,o=M.selectionAnchor,c=te.offsetWidth||360,l=te.offsetHeight||330;if(o){let u=Math.max(16,i.clientWidth-c-24),p=Math.max(16,i.clientHeight-l-24);te.style.left=`${ce(o.x+18,16,u)}px`,te.style.top=`${ce(o.y+18,16,p)}px`}else te.style.left="20px",te.style.top="20px";if(te.querySelector(".selection-card-close").addEventListener("click",Oe),te.querySelector("[data-action=frame]").addEventListener("click",xc),s){let u=te.querySelector("[data-action=isolate]");u&&u.addEventListener("click",()=>{Hr(!M.isolateNet)});let p=te.querySelector("[data-action=net-layers]");p&&p.addEventListener("click",pc),te.querySelectorAll(".pin-row-interactive").forEach(b=>{b.addEventListener("click",()=>{let h=b.dataset.ref,d=b.dataset.pin;if(!h)return;let y=((k.topology.net_details?.[s.uid]||{}).terminals||[]).find(w=>w.designator===h&&w.pin===d),m=Jw(y);m?yr(m,!0):mc(h,!0)})})}let f=te.querySelector(".net-ref-interactive");f&&f.addEventListener("click",()=>{let u=f.dataset.netName;if(!u)return;let p=sr(k.scene.nets,u);p&&gc(Number(p.id),!0)})}function xc(){if(M.workspace==="schematic"){Lb();return}let t=k.scene.features.get(M.selectedFeatureId);if(t?.bounds)yc(t);else{let e=k.scene.nets.find(r=>Number(r.id)===M.activeNetId);e?.boundsMm&&U.frame(Jo($r(e.boundsMm)))}}function Xb(){j.addEventListener("contextmenu",t=>t.preventDefault()),j.addEventListener("pointerdown",t=>{v&&(v.framed=!0),!(v&&tM(t))&&(M.dragging=!0,M.lastX=t.clientX,M.lastY=t.clientY,M.pointerStartX=t.clientX,M.pointerStartY=t.clientY,M.dragMode=M.mode==="layer"||t.shiftKey||t.button!==0?"pan":"orbit",j.setPointerCapture(t.pointerId))}),j.addEventListener("pointermove",t=>{if(v&&kb(t)||(v?.move.route&&!M.dragging&&(j.style.cursor=dc(t)?"crosshair":""),!M.dragging))return;let e=t.clientX-M.lastX,r=t.clientY-M.lastY;M.lastX=t.clientX,M.lastY=t.clientY,M.dragMode==="pan"?U.pan(e,r,j.clientHeight,M.mode==="layer"):U.orbit(e,r)}),j.addEventListener("pointerup",async t=>{v&&Eb(t)||(M.dragging=!1,j.releasePointerCapture(t.pointerId),!(Math.hypot(t.clientX-M.pointerStartX,t.clientY-M.pointerStartY)>=3)&&M.clickSelect&&(t.button===0?await Ah(t):t.button===2&&await qM(t)))}),j.addEventListener("dblclick",async t=>{M.clickSelect&&(await Ah(t),xc())}),j.addEventListener("wheel",t=>{v&&(v.framed=!0),t.preventDefault(),Math.abs(t.deltaX)>Math.abs(t.deltaY)*.4?U.pan(-t.deltaX,0,j.clientHeight,M.mode==="layer"):U.dolly(t.deltaY,M.mode==="layer")},{passive:!1}),window.addEventListener("keydown",ep),KM()}function KM(){let t=!1,e,r,a=0,s=0;te.addEventListener("pointerdown",n=>{if(!n.target.closest(".selection-card-head")||n.target.closest(".selection-card-close"))return;t=!0,te.classList.add("dragging");let o=te.getBoundingClientRect();a=o.left,s=o.top,e=n.clientX,r=n.clientY,te.setPointerCapture(n.pointerId),n.stopPropagation()}),te.addEventListener("pointermove",n=>{if(!t)return;let i=n.clientX-e,o=n.clientY-r,c=M.workspace==="schematic"?Fe:j,l=te.offsetWidth||360,f=te.offsetHeight||330,u=Math.max(16,c.clientWidth-l-24),p=Math.max(16,c.clientHeight-f-24),b=ce(a+i,16,u),h=ce(s+o,16,p);te.style.left=`${b}px`,te.style.top=`${h}px`,M.selectionAnchor={x:b-18,y:h-18},n.stopPropagation()}),te.addEventListener("pointerup",n=>{t&&(t=!1,te.classList.remove("dragging"),te.releasePointerCapture(n.pointerId),n.stopPropagation())})}function VM(){fr("[data-workspace]").forEach(t=>{t.addEventListener("click",()=>$b(t.dataset.workspace))})}function $b(t){if(t==="schematic"&&!C||t==="bom"&&!it)return;M.workspace=t,St.classList.remove("workspace-pcb","workspace-schematic","workspace-bom","workspace-stackup"),St.classList.add(`workspace-${t}`),(t==="schematic"&&(M.activeTab==="view"||M.activeTab==="inspect"||M.activeTab==="stats")||t==="bom"||t==="stackup")&&Bn("layers");let e=Y('.rail-tab[data-tab="layers"]');e&&(t==="schematic"?(e.textContent="Pages",e.title="Schematic pages"):t==="bom"?(e.textContent="Summary",e.title="BoM summary"):(e.textContent="Layers",e.title="Layers and compare"));let r=t==="schematic",a=t==="bom",s=t==="stackup";if(j.hidden=r||a||s,Fe&&(Fe.hidden=!r),xn&&(xn.hidden=!r||!Z),vn&&(vn.hidden=!r),wn&&(wn.hidden=!a),Le&&(Le.hidden=!s),Be.hidden=r||a||s,Mn.hidden=r||a||s,Ca&&(Ca.hidden=!r),fr("[data-workspace]").forEach(n=>{n.classList.toggle("active",n.dataset.workspace===t)}),jr.textContent=a?"Semantic BoM active":r?Z?"SVG DOM + WebGPU schematic world active":"WebGPU schematic world active":s?"Layer Stackup active":"WebGPU semantic glTF active",r&&!D.fitted&&(C.resize(),C.frameWorld(),D.fitted=!0),!r&&!a&&!s&&(k.renderer?.resize(),M.mode==="layer"?fc():Me(performance.now(),{force:!0})),s)try{ZM()}catch(n){console.error("Failed to render stackup workspace",n),Le&&(Le.innerHTML=`
          <div class="selection-empty" style="padding:40px;text-align:center;">
            Stackup view failed to render. ${V(n?.message||String(n))}
          </div>
        `)}hc(),Qe()}function HM(){Fe.addEventListener("pointerdown",t=>{Z?.worldActive||Z?.active||(M.schematicDragging=!0,M.schematicLastX=t.clientX,M.schematicLastY=t.clientY,M.schematicStartX=t.clientX,M.schematicStartY=t.clientY,Fe.setPointerCapture(t.pointerId))}),Fe.addEventListener("pointermove",t=>{if(Z?.worldActive||Z?.active||!M.schematicDragging||!C)return;let e=t.clientX-M.schematicLastX,r=t.clientY-M.schematicLastY;M.schematicLastX=t.clientX,M.schematicLastY=t.clientY,C.pan(e,r)}),Fe.addEventListener("pointerup",async t=>{if(!(Z?.worldActive||Z?.active)&&(M.schematicDragging=!1,Fe.releasePointerCapture(t.pointerId),Math.hypot(t.clientX-M.schematicStartX,t.clientY-M.schematicStartY)<3)){let e=await C.pickFeature(t.clientX,t.clientY);e?NM(e):Ga()}}),Fe.addEventListener("dblclick",t=>{if(Z?.worldActive||Z?.active)return;let e=C.hitPage(t.clientX,t.clientY);e&&Tt(e.id,!0)}),Fe.addEventListener("wheel",t=>{Z?.worldActive||Z?.active||(t.preventDefault(),C.zoom(t.deltaY,t.clientX,t.clientY))},{passive:!1})}function Eh(t,e=11,r=32){let a=ur(t,$e),s=ur([t[0]+1e-4,t[1],t[2]],$e),n=ur([t[0],t[1]+1e-4,t[2]],$e);if(!a||!s||!n)return null;let i=Math.max(Math.hypot(s.x-a.x,s.y-a.y),Math.hypot(n.x-a.x,n.y-a.y))/1e-4;if(!(i>0))return null;let o=e/i,c=[];for(let l=0;l<r;l++){let f=2*Math.PI*l/r,u=ur([t[0]+o*Math.cos(f),t[1]+o*Math.sin(f),t[2]],$e);if(!u)return null;c.push(u)}return{centre:a,ring:c}}function Sh(t,e){if(!J||!j)return null;let r=Zi(J.matrix);if(!r)return null;let a=j.getBoundingClientRect(),s=(t-a.left)/a.width*2-1,n=1-(e-a.top)/a.height*2,i=u=>{let p=[s,n,u,1],b=[0,1,2,3].map(h=>r[h]*p[0]+r[4+h]*p[1]+r[8+h]*p[2]+r[12+h]*p[3]);return b.slice(0,3).map(h=>h/b[3])},o=i(0),l=i(1).map((u,p)=>u-o[p]),f=Math.hypot(...l);return f>0?{origin:o,direction:l.map(u=>u/f)}:null}var Th=0;async function Ah(t){if(!J)return;let e=++Th,r=j.getBoundingClientRect();if(M.selectionAnchor={x:t.clientX-r.left,y:t.clientY-r.top},v&&eM(t))return;let a=await Yb(t);if(e===Th){if(v){_1(a);return}(a.kind==="feature"||a.kind==="board")&&(M.selectedOccurrence=a.occurrenceIndex),a.featureId?yr(a.featureId,!0):a.kind==="board"&&!k.renderer.identityOnly?vc():Oe()}}async function qM(t){if(!J||!Tn)return;let e=await Yb(t),r=v?v.placements.get(e.occurrenceKey)?.board:k;if(!r)return;let a=r.scene.features.get(e.featureId),s=Gr(a),n=s?$o(s,r):null;Tn({clientX:t.clientX,clientY:t.clientY,reference:s||void 0,value:String(n?.value||a?.value||"")||void 0})}function WM(t,e){if(!v||!j)return null;let r=j.getBoundingClientRect(),a=(t-r.left)/r.width*2-1,s=1-(e-r.top)/r.height*2,n=Vu(U,a,s,r.width/Math.max(r.height,1)),i=v.placed.filter(c=>c.primitives&&c.occurrence.pickSurface).map(c=>({key:c.occurrence.path,matrix:c.matrix,primitives:c.primitives})),o=Hu(i,n);return o?{occurrence:o.key,pointMm:o.point.map(c=>c/nc),normal:o.normal,toCamera:n.direction.map(c=>-c)}:null}function XM(t){let e=t!=null?v?.placements.get(String(t)):null;return e?(rc(e),!0):!1}function Yb(t){let e=j.getBoundingClientRect();return Jb((t.clientX-e.left)*j.width/e.width,(t.clientY-e.top)*j.height/e.height)}async function Jb(t,e){if(v)return I1(t,e);let r=await $M(t,e);return r?.kind==="analytic"&&k.analytic?{...r,featureId:No(k.analytic,r.operationIndex)||null}:r}function $M(t,e){return k.renderer.pick(J,t,e,{activeNetId:M.activeNetId,selectedFeatureId:M.selectedFeatureId,layerOffsets:Nn(),visibleLayers:M.mode==="3d"?k.visible3dLayers:k.compareLayers,showBoard:M.showBoard,showComponents:M.showComponents,componentOpacity:ce(1-M.separation/.1,0,1),boardOpacity:1-M.separation*.72,isolateNet:M.isolateNet,compareMode:M.mode==="layer",compareOffsets:br,visibleTileIds:M.mode==="3d"?k.visibleTileIds:null})}async function Qb(t,e){if(!J||!(v||k.renderer))return null;let r=j.getBoundingClientRect(),a=await Jb((t-r.left)*j.width/r.width,(e-r.top)*j.height/r.height),s=v?v.placements.get(a.occurrenceKey)?.board:k,n=a.featureId&&s?Gh(s.scene.features.get(a.featureId),s):null;return{...a,renderer:void 0,selection:n}}function vc(){let t=M.selectedOccurrence,e=Ge;Ge=!0;try{Oe()}finally{Ge=e}M.selectedOccurrence=t,v&&(v.boardSelected=!0),Ln({kind:"board",sourceContext:"3D"})}function Zb(t,e,r){let a=t.scene.componentFeatures.get(String(e)),s=a?t.scene.features.get(Number(a.featureId))?.bounds:null;if(!s)return null;let n=s[2]+s[5]>=0;return r([(s[0]+s[3])/2,(s[1]+s[4])/2,n?s[5]:s[2]])}function ur(t,e){if(!J)return null;let r=aa(J.matrix,vs(e,t),J.viewport);if(!r)return null;let a=j.getBoundingClientRect();return{x:a.left+r.x*a.width/j.width,y:a.top+r.y*a.height/j.height}}function ep(t){if(!jn())return;if(Gc(t)){t.key==="Escape"&&t.target instanceof HTMLInputElement&&t.target.blur();return}if(Kc(t))return;let e=t.key.toLowerCase();if(M.workspace==="schematic"){if(e==="/")t.preventDefault(),Bn("search"),ve.querySelector("#entity-search")?.focus();else if(e==="escape")D.activeNetUid?(D.activeNetUid="",M.activeNetId=0,C.activeNetUid="",Z?.setHighlightedNet(""),Qe()):Ga();else if(e==="~"||t.key==="~"){t.preventDefault();let r=M.selectedSchematicFeature?.netUid;r&&(D.activeNetUid===r?(D.activeNetUid="",M.activeNetId=0,C.activeNetUid="",Z?.setHighlightedNet("")):jb(r,M.selectedSchematicFeature))}else if(e==="home")C?.frameWorld();else if(e==="[")mn("previous");else if(e==="]")mn("next");else if(e==="n"){t.preventDefault();let r=C?.cycleNetIntrasheetLink(t.shiftKey?-1:1);r?.pageId&&(M.selectedPageId=r.pageId,C.selectedPageId=r.pageId,ap())}else if(t.altKey&&e==="arrowup")mn("parent");else if(t.key.startsWith("Arrow")){t.preventDefault();let r=t.key==="ArrowRight"?32:t.key==="ArrowLeft"?-32:0,a=t.key==="ArrowDown"?32:t.key==="ArrowUp"?-32:0;C?.pan(r,a)}return}if(v&&Y1(t,e)){t.preventDefault();return}if(e==="/")t.preventDefault(),Bn("search"),ve.querySelector("#entity-search").focus();else if(e==="escape")Oe();else if(e==="i"&&M.workspace==="pcb"&&Kr())t.preventDefault(),Hr(!M.isolateNet);else if(e==="home")U.frame(v&&v.bounds||tr());else if(e==="`")ab(!M.showStats);else if(["x","y","z"].includes(e))U.setAxis(e,t.shiftKey);else if(e==="f")U.flip();else if(e==="r")U.rotateZ(t.shiftKey?-1:1);else if(e===" "){t.preventDefault();let r=k.scene.features.get(M.selectedFeatureId);r?.bounds&&U.setFocus([(r.bounds[0]+r.bounds[3])/2,(r.bounds[1]+r.bounds[4])/2,(r.bounds[2]+r.bounds[5])/2])}else if(t.key.startsWith("Arrow")){t.preventDefault();let r=t.key==="ArrowRight"?32:t.key==="ArrowLeft"?-32:0,a=t.key==="ArrowDown"?32:t.key==="ArrowUp"?-32:0;U.pan(r,a,j.clientHeight,M.mode==="layer")}}function Bn(t){M.activeTab=t,St.classList.remove("panel-collapsed"),fr(".rail-tab").forEach(e=>{e.classList.toggle("active",e.dataset.tab===t)}),fr(".tab-panel").forEach(e=>{e.classList.toggle("active",e.dataset.panel===t)})}function tp(){let t=Be.getContext("2d");t.clearRect(0,0,Be.width,Be.height);let e=[Be.width/2,Be.height/2],r=U.basis(),a=[{axis:"x",label:"X",color:"#e23838",vector:[1,0,0]},{axis:"y",label:"Y",color:"#2dbd50",vector:[0,1,0]},{axis:"z",label:"Z",color:"#3157d5",vector:[0,0,1]}],s=[];for(let n of a)for(let i of[-1,1]){let o=n.vector.map(l=>l*i),c=[Po(o,r.right),-Po(o,r.up),Po(o,r.back)];s.push({...n,sign:i,depth:c[2],point:[e[0]+c[0]*34,e[1]+c[1]*34]})}for(let n of a){let i=s.find(o=>o.axis===n.axis&&o.sign===1);t.strokeStyle=n.color,t.lineWidth=2.4,t.beginPath(),t.moveTo(...e),t.lineTo(...i.point),t.stroke()}En=[];for(let n of s.sort((i,o)=>o.depth-i.depth)){let i=n.sign===1,o=i?13:9;t.beginPath(),t.arc(n.point[0],n.point[1],o,0,Math.PI*2),t.fillStyle=i?n.color:`${n.color}66`,t.fill(),t.lineWidth=2,t.strokeStyle=QM(n.color,i?.45:.58),t.stroke(),i&&(t.fillStyle="#07101c",t.font="700 13px system-ui",t.textAlign="center",t.textBaseline="middle",t.fillText(n.label,n.point[0],n.point[1]+.5)),En.push({...n,radius:o+5})}}function rp(){!Be||Be.dataset.bound==="true"||(Be.dataset.bound="true",Be.addEventListener("click",t=>{let e=Be.width/Be.clientWidth,r=Be.height/Be.clientHeight,a=[t.offsetX*e,t.offsetY*r],s=En.map(n=>({item:n,distance:Math.hypot(a[0]-n.point[0],a[1]-n.point[1])})).filter(({item:n,distance:i})=>i<=n.radius).sort((n,i)=>n.distance-i.distance)[0]?.item;s&&U.setAxis(s.axis,s.sign<0)}))}function YM(){if(M.mode!=="layer"||!J){Mn.innerHTML="";return}let t=tr(),e=Xh();Mn.innerHTML=k.scene.copperLayers.filter(r=>e.has(Number(r.id))).map(r=>{let a=br.get(Number(r.id))||[0,0,0],s=JM([t[0]+a[0],t[4]+a[1],0],J.matrix,j.clientWidth,j.clientHeight);return!s||s[0]<-100||s[0]>j.clientWidth+100||s[1]<-100||s[1]>j.clientHeight+100?"":`<span style="left:${s[0]}px;top:${s[1]}px">${V(r.name)}</span>`}).join("")}function ap(){if(M.workspace!=="schematic"||!C){Ca.innerHTML="";return}Ca.innerHTML=D.visiblePages.filter(t=>C.pagePixelWidth(t)>120).map(t=>{let[e,r]=C.worldToScreen(t.worldX+8*C.scale,t.worldY-6*C.scale),a=t.id===M.selectedPageId,n=D.activeNetUid&&t.netUids.includes(D.activeNetUid)?"#18ef52":a?"#3b82f6":"#4b8de8";return`<div class="schematic-page-label" style="left:${e}px;top:${r}px;border-left-color:${n}">
        <strong>${V(t.name)}</strong>
        <small>Page ${t.sheetNumber} &middot; ${t.featureCount.toLocaleString()} features</small>
      </div>`}).join("")}function JM(t,e,r,a){let s=t[0],n=t[1],i=t[2],o=e[0]*s+e[4]*n+e[8]*i+e[12],c=e[1]*s+e[5]*n+e[9]*i+e[13],l=e[3]*s+e[7]*n+e[11]*i+e[15];return Math.abs(l)<1e-8?null:[(o/l*.5+.5)*r,(.5-c/l*.5)*a]}function Po(t,e){return t[0]*e[0]+t[1]*e[1]+t[2]*e[2]}function QM(t,e){let r=t.replace("#","");return`#${[0,2,4].map(a=>Math.round(parseInt(r.slice(a,a+2),16)*e).toString(16).padStart(2,"0")).join("")}`}function qo(t,e){M.frameSamples.push({intervalMs:t,cpuMs:e}),M.frameSamples.length>180&&M.frameSamples.shift()}function Ih(t,e){if(!t.length)return 0;let r=[...t].sort((a,s)=>a-s);return r[Math.min(r.length-1,Math.floor((r.length-1)*e))]}function Wo(t){if(!hn||(M.frames+=1,t-M.fpsAt<=500))return;M.fps=M.frames*1e3/(t-M.fpsAt);let e=M.frameSamples;if(M.frameIntervalMs=e.length?e.reduce((n,i)=>n+i.intervalMs,0)/e.length:0,M.frameCpuMs=e.length?e.reduce((n,i)=>n+i.cpuMs,0)/e.length:0,M.frameIntervalP95Ms=Ih(e.map(n=>n.intervalMs),.95),M.frameCpuP95Ms=Ih(e.map(n=>n.cpuMs),.95),M.frames=0,M.fpsAt=t,sb(),M.workspace==="bom"){let n=it?.payload?.counts||{},i=[["Renderer","BoM DOM table"],["Schema",it?.payload?.schema||"-"],["Grouped rows",n.rows||0],["Components",n.components||0],["DNP components",n.dnpComponents||0],["Extra columns",it?.payload?.extraColumns?.length||0],["Frame interval",`${M.frameIntervalMs.toFixed(2)} ms avg / ${M.frameIntervalP95Ms.toFixed(2)} p95`],["CPU frame",`${M.frameCpuMs.toFixed(2)} ms avg / ${M.frameCpuP95Ms.toFixed(2)} p95`],["FPS",M.fps.toFixed(1)]];hn.innerHTML=i.map(([o,c])=>`<dt>${o}</dt><dd>${c}</dd>`).join("");return}let r=M.workspace==="schematic"&&C?C.stats():null,a=M.workspace==="schematic"&&Z?Z.stats():null,s=M.workspace==="schematic"&&C?Z?.active?[["Renderer","SVG DOM schematic detail"],["Pages",D.pages.length],["Mounted pages",a.mountedPages],["Active page",a.activePage],["DOM nodes",a.domNodes.toLocaleString()],["Indexed features",a.indexedFeatures.toLocaleString()],["Indexed nets",a.indexedNets.toLocaleString()],["SVG cache",`${a.cachedSvgPages} pages / ${(a.cachedSvgBytes/1048576).toFixed(1)} MB`],["Selection",`${a.selectionMs.toFixed(1)} ms`],["Active net",k.scene.nets.find(n=>n.uid===D.activeNetUid)?.name||"-"],["Tracking links",`${r.netFlowSegments} total / ${r.netFlowIntrasheetSegments} local`],["Tracking verts",r.netFlowVertices.toLocaleString()],["Mount",`${a.mountMs.toFixed(1)} ms`],["Highlight",`${a.highlightMs.toFixed(1)} ms`],["Fallback",a.fallbackReason||"-"],["Frame interval",`${M.frameIntervalMs.toFixed(2)} ms avg / ${M.frameIntervalP95Ms.toFixed(2)} p95`],["CPU frame",`${M.frameCpuMs.toFixed(2)} ms avg / ${M.frameCpuP95Ms.toFixed(2)} p95`],["FPS",M.fps.toFixed(1)]]:[["Renderer",Z?"SVG DOM + WebGPU world":"WebGPU schematic world"],["Pages",D.pages.length],["Visible pages",D.visiblePages.length],["DOM pages",a?a.mountedPages:0],["DOM nodes",a?a.domNodes.toLocaleString():"0"],["Indexed SVG features",a?a.indexedFeatures.toLocaleString():"0"],["SVG cache",a?`${a.cachedSvgPages} pages / ${(a.cachedSvgBytes/1048576).toFixed(1)} MB`:"0 pages"],["JS heap",a?.heapMb?`${a.heapMb.toFixed(1)} MB`:"-"],["Hierarchy links",D.manifest.edges?.length||0],["Selected page",D.byId.get(M.selectedPageId)?.name||"-"],["Active net",k.scene.nets.find(n=>n.uid===D.activeNetUid)?.name||"-"],["Tracking links",`${r.netFlowSegments} total / ${r.netFlowIntrasheetSegments} local`],["Downloaded",`${(C.downloadedBytes/1048576).toFixed(1)} MB`],["Resident vectors",`${(r.residentVectorBytes/1048576).toFixed(1)} MB`],["Vector pages",`${r.vectorChunks} loaded / ${r.vectorLoads} loading`],["Vector draw",`${r.vectorVertices.toLocaleString()} verts / ${r.vectorDrawChunks} chunks`],["Native detail",`${r.nativeDetailPages} pages @ ${r.nativePxPerMm} / ${r.nativeThresholdPxPerMm} px/mm`],["Vector failures",r.failedVectorChunks],["Truncated",r.truncatedVectors],["Frame interval",`${M.frameIntervalMs.toFixed(2)} ms avg / ${M.frameIntervalP95Ms.toFixed(2)} p95`],["CPU frame",`${M.frameCpuMs.toFixed(2)} ms avg / ${M.frameCpuP95Ms.toFixed(2)} p95`],["FPS",M.fps.toFixed(1)]]:[["Renderer","WebGPU semantic glTF"],["Mode",M.mode==="3d"?"3D":"Layer Compare"],["Visible layers",M.mode==="3d"?k.visible3dLayers.size:k.compareLayers.size],["Resident tiles",k.scene.loaded.size],["Loading tiles",k.scene.loading.size],["Failed tiles",k.scene.failed.size],["Triangles",Math.round(k.triangles).toLocaleString()],["Downloaded",`${(k.loadedBytes/1048576).toFixed(1)} MB`],["Resident GLB",`${(k.residentTileBytes/1048576).toFixed(1)} MB`],["Resident GPU",`${(k.residentTileGpuBytes/1048576).toFixed(1)} MB`],["Tile loads",k.tileLoads.toLocaleString()],["Tile evictions",k.tileEvictions.toLocaleString()],["Tile scheduler",`${k.tileSchedulerMs.toFixed(2)} ms`],["Active net",k.scene.nets.find(n=>Number(n.id)===M.activeNetId)?.name||"-"],["Frame interval",`${M.frameIntervalMs.toFixed(2)} ms avg / ${M.frameIntervalP95Ms.toFixed(2)} p95`],["CPU frame",`${M.frameCpuMs.toFixed(2)} ms avg / ${M.frameCpuP95Ms.toFixed(2)} p95`],["FPS",M.fps.toFixed(1)]];hn.innerHTML=s.map(([n,i])=>`<dt>${n}</dt><dd>${i}</dd>`).join("")}function qn(t){return`rgb(${t.slice(0,3).map(e=>Math.round(e*255)).join(" ")})`}function ZM(){if(!Le)return;let t=k.scene.layers||[];if(!t.length){Le.innerHTML='<div class="selection-empty" style="padding:40px;text-align:center;">No stackup information available for this board.</div>';return}let e=t.filter(I=>["copper","dielectric","paste","silkscreen","soldermask"].includes(I.role)),r=k.topology.board?.stackup||{},a=I=>{if(I==null||I==="")return"None";let P=String(I);return V(P.includes(".")?P.split(".").pop():P)},s=(I,P=4)=>{let L=Number(I);return Number.isFinite(L)&&L>0?L.toFixed(P):"-"},n=(I,P=3)=>{let L=Number(I);return Number.isFinite(L)?L.toFixed(P):"-"},i=I=>{if(I==null||I==="")return"No";if(typeof I=="boolean")return I?"Yes":"No";let P=String(I).trim().toLowerCase(),L=P.includes(".")?P.split(".").pop():P;return["0","false","no","n","off","none"].includes(L)?"No":(["1","true","yes","y","on"].includes(L),"Yes")},o=I=>({copper:"Copper",dielectric:"Dielectric",paste:"Paste",silkscreen:"Silkscreen",soldermask:"Solder mask"})[I]||String(I||"Layer"),c=I=>I.role!=="dielectric"?"":I.type==="core"?"Core":I.type==="prepreg"||(I.material||"").toLowerCase().includes("prepreg")?"Prepreg":"Core",l=(I,P=4)=>{let L=Number(I.thickness_mm);return Number.isFinite(L)&&L>0?`${L.toFixed(P)} mm`:"Not specified"},f=I=>{let P=o(I.role),L=String(I.material||"").trim(),Q=L&&L.toLowerCase()!==String(I.role||"").toLowerCase();if(I.role==="dielectric"){let ue=[Q?L:"",s(I.epsilon_r,3)!=="-"?`\u03B5r ${s(I.epsilon_r,3)}`:"",s(I.loss_tangent,4)!=="-"?`tan \u03B4 ${s(I.loss_tangent,4)}`:""].filter(Boolean).join(" \xB7 ");return{primary:`${I.name} \xB7 ${c(I)}`,secondary:ue}}return{primary:[I.name,P,Q?L:""].filter(Boolean).join(" \xB7 "),secondary:""}},u=0,p=0,b=0,h=0;e.forEach(I=>{h+=I.thickness_mm||0,I.role==="copper"?I.name.toLowerCase().includes("gnd")||I.name.toLowerCase().includes("pwr")||I.name.toLowerCase().includes("plane")?p++:u++:I.role==="dielectric"&&b++});let d=k.scene.copperLayers||[],x=0,g=0,y=0,m=[...(k.scene.manifest?.barrels||[]).filter(I=>I.kind==="via"),...[...k.scene.features.values()].filter(I=>I.kind==="via")],w=wu(d,m);x=w.counts.thru,g=w.counts.blind,y=w.counts.buried;let E=w.spans,S=30,A=S,T=[],_=new Map(e.map((I,P)=>[I,P])),R=ek(e),N=(I,P)=>{let L=R.get(I.name);if(L!==void 0)return L;let Q=Number(I.stack_index);return Number.isFinite(Q)?Q:P+1e5},B=[...e].sort((I,P)=>{let L=N(I,_.get(I)||0),Q=N(P,_.get(P)||0);return L!==Q?L-Q:(P.z_mm||0)-(I.z_mm||0)});B.forEach(I=>{let P=12;I.role==="dielectric"?P=Math.max(160,Math.min(360,(I.thickness_mm||.1)*140)):I.role==="copper"?P=22:I.role==="soldermask"&&(P=14),T.push({...I,svgY:A,svgHeight:P}),A+=P});let F=800,K=130,$=240,se=K+$+16,de=se+84,Ke="";T.forEach(I=>{let P=I.color||"#7f7f7f";I.role==="copper"?P=I.color||"#f97316":I.role==="dielectric"?P="#a98d5c":I.role==="paste"?P="#cbd5e1":I.role==="soldermask"?P="#1b4332":I.role==="silkscreen"&&(P="#e2e8f0");let L=d.findIndex(up=>up.name===I.name),Q=f(I),ue=I.svgY+I.svgHeight/2,Re=!!Q.secondary&&I.svgHeight>=38,rr=Re?ue-5:ue+3,$n=V(I.id),Ha=V(I.name),ct=Number.isFinite(Number(I.thickness_mm))&&Number(I.thickness_mm)>0,lp=V(ct?l(I):"\u2014"),dp=V([Q.primary,Q.secondary,`Thickness ${l(I)}`].filter(Boolean).join("; "));Ke+=`
      <g class="stackup-svg-layer" data-layer-id="${$n}" data-layer-name="${Ha}">
        <title>${dp}</title>
        <rect x="${K}" y="${I.svgY}" width="${$}" height="${I.svgHeight}" fill="${P}" opacity="0.85" rx="1"/>
        <text x="${K-8}" y="${I.svgY+I.svgHeight/2+3}" fill="var(--muted)" font-size="9px" text-anchor="end" font-weight="700">
          ${I.role==="copper"?L+1:""}
        </text>
        <path class="stackup-layer-dimension" d="M ${se+6} ${I.svgY+1} H ${se} V ${I.svgY+I.svgHeight-1} H ${se+6}" />
        <text class="stackup-layer-thickness" x="${se+10}" y="${ue+3}" fill="var(--muted)" font-size="8.5px" font-weight="650">
          ${lp}
        </text>
        <text class="stackup-layer-name" x="${de}" y="${rr}" fill="var(--foreground)" font-size="9px" font-weight="650">
          ${V(Q.primary)}
        </text>
        ${Re?`<text class="stackup-layer-metadata" x="${de}" y="${ue+10}" fill="var(--muted)" font-size="8px">${V(Q.secondary)}</text>`:""}
      </g>
    `});let be="",Ve=T.filter(I=>I.role==="copper");E.forEach((I,P)=>{let L=T.find(ct=>ct.name===I.startName),Q=T.find(ct=>ct.name===I.endName);if(!L||!Q)return;let ue=L.svgY,Re=Q.svgY+Q.svgHeight,rr=K+(P+1)*$/(E.length+1),$n=I.type==="thru"?"Thru":I.type==="blind"?"Blind":"Buried",Ha=`var(--stackup-via-${I.type})`;be+=`
      <g class="stackup-svg-via" data-via-type="${I.type}">
        <title>${$n}: ${I.startName} \u2192 ${I.endName}</title>
        ${Ve.map(ct=>ct.svgY>=L.svgY&&ct.svgY<=Q.svgY?`<rect x="${rr-5}" y="${ct.svgY}" width="10" height="${ct.svgHeight}" fill="${Ha}" rx="0.5" />`:"").join("")}
        <rect x="${rr-2}" y="${ue}" width="4" height="${Re-ue}" fill="${Ha}" opacity="0.95" />
        <rect x="${rr-.75}" y="${ue-1}" width="1.5" height="${Re-ue+2}" fill="var(--panel)" opacity="0.9" />
      </g>
    `});let Ze=`
    <svg class="stackup-visual-svg" viewBox="0 0 ${F} ${A+10}" width="${F}" height="${A+10}">
      <g class="stackup-svg-column-headings" aria-hidden="true">
        <text x="${se+10}" y="15">Thickness</text>
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
        <td>${I.role==="dielectric"?s(I.epsilon_r,3):"-"}</td>
        <td>${I.role==="dielectric"?s(I.loss_tangent,4):"-"}</td>
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
          <span>${a(r.copper_finish)}</span>
        </div>
        <div class="stackup-summary-card">
          <label>Edge Connector</label>
          <span>${i(r.edge_connector)}</span>
        </div>
        <div class="stackup-summary-card">
          <label>Castellated Holes</label>
          <span>${i(r.castellated_pads)}</span>
        </div>
        <div class="stackup-summary-card">
          <label>Edge Plating</label>
          <span>${i(r.edge_plating)}</span>
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
  `;let xr=(I,P)=>{Le.querySelectorAll(".stackup-svg-layer").forEach(L=>{let Q=L.dataset.layerId===I;L.classList.toggle("active",Q&&P)}),Le.querySelectorAll(".stackup-table tbody tr[data-layer-id]").forEach(L=>{let Q=L.dataset.layerId===I;L.classList.toggle("active",Q&&P)})},Xn=I=>{let P=Le.querySelector(".stackup-diagram-card"),L=Le.querySelector(`.stackup-svg-layer[data-layer-id="${CSS.escape(I)}"]`);if(!P||!L||P.scrollHeight<=P.clientHeight)return;let Q=P.getBoundingClientRect(),ue=L.getBoundingClientRect(),Re=P.scrollTop+ue.top-Q.top-(P.clientHeight-ue.height)/2,rr=window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;P.scrollTo({top:Math.max(0,Re),behavior:rr?"auto":"smooth"})},Va=(I,{revealDiagram:P=!1}={})=>{I.forEach(L=>{let Q=()=>{let Re=L.dataset.layerId;xr(Re,!0),P&&Xn(Re)},ue=()=>xr(null,!1);L.addEventListener("mouseenter",Q),L.addEventListener("mouseleave",ue),P&&(L.addEventListener("focus",Q),L.addEventListener("blur",ue))})};Va(Le.querySelectorAll(".stackup-svg-layer")),Va(Le.querySelectorAll(".stackup-table tbody tr[data-layer-id]"),{revealDiagram:!0})}function ek(t){let e=t.filter(s=>s.role==="dielectric");if(!(e.length===1&&e[0]?.name==="Board"))return new Map;let a=new Map;return["F.SilkS","F.Paste","F.Mask","F.Cu","Board","B.Cu","B.Mask","B.Paste","B.SilkS"].forEach((s,n)=>a.set(s,n)),a}function sp(){let t=null;return{begin(){return t?.abort(),t=new AbortController,t},owns(e){return e!==null&&e===t&&!e.signal.aborted},cancel(){t?.abort(),t=null}}}async function np(t,e,{owner:r,bundleUrl:a,loadBundle:s,now:n=()=>performance.now()}){let i=n(),o={},{signal:c}=e,l=()=>r.owns(e)&&t.isConnected;try{t.renderLoading();let f=n(),{bundle:u,topology:p,semanticGeometry:b,assetCache:h}=await s(a,o,c);if(o.bundle_group_total_ms=n()-f,!l())return;t.renderShell();let d=n(),x=await t.mountViewer({topology:p,semanticGeometry:b,readiness:u.readiness,assetCache:h,signal:c});if(!l()){x?.dispose?.();return}t.publishController(x),o.mount_and_first_frame_ms=n()-d,Object.assign(o,x?.performance||{}),o.reload_to_visible_ms=n()-i,t.emitReady({schema:"prism.semantic_viewer_performance.a0",milestone:"board-visible",readiness_stage:u.readiness?.stage||"semantic-ready",readiness_progress:u.readiness?.progress??100,timings:o})}catch(f){if(!l())return;t.renderError(f),t.emitError(f)}}var tk="prism.visualizer_bundle.a0";function rk(){return`
    <style>
      ${wc}
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
  `}function ak(t){return String(t).replace(/[&<>"']/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[e])}async function ip(t,e=null,r="fetch",a=void 0){let s=performance.now(),n=await fetch(t,{cache:"no-store",signal:a});if(!n.ok)throw new Error(`Failed to load ${t}: ${n.status}`);let i=await n.json();return e&&(e[`${r}_fetch_parse_ms`]=performance.now()-s,e[`${r}_content_length`]=Number(n.headers.get("content-length")||0)),i}async function op(t,e,r){let a=new URL(t,document.baseURI).toString(),s=new URL(a).searchParams.get("viewer")||"",n=Wa.open(),i=await n.peekJson(a).catch(()=>null),o=!!i;i||(i=await ip(a,e,"bundle",r),Qn(i)&&n.store(a,new TextEncoder().encode(JSON.stringify(i)))),e&&(e.bundle_from_cache=o);let c=Qn(i)&&n.enabled?n:null;if(i.schema!==tk)throw new Error(`Unsupported visualizer bundle schema: ${i.schema||"missing"}`);let l=new URL(i.topology||"topology.json",a),f=new URL(i.semantic_geometry||"semantic_geometry.json",a),u=(h,d)=>c?c.fetchJson(h.toString(),{signal:r}):ip(h,e,d,r),[p,b]=await Promise.all([u(l,"topology"),u(f,"semantic_geometry")]);return{bundle:i,topology:p,semanticGeometry:Mc(b,a,i,s),assetCache:c}}var Wn=class extends HTMLElement{static get observedAttributes(){return["bundle-url","workspace","mode","move-allowed"]}constructor(){super(),this.attachShadow({mode:"open"}),this.reloadOwner=sp(),this.reloadQueued=!1,this.reloadSource=null;let e=bo();this.modes=Object.freeze({board:new en(e),system:new tn(e)}),this.mounted=null}get activeMode(){return this.mounted??(this.systemMode?this.modes.system:this.modes.board)}detachModes(){this.modes.board.detach(),this.modes.system.detach(),this.mounted=null}connectedCallback(){this.queueReload()}disconnectedCallback(){this.reloadOwner.cancel(),this.detachModes(),this.reloadSource=null}attributeChangedCallback(e,r,a){if(!(!this.isConnected||r===a)){if(e==="workspace"){this.modes.board.setWorkspace(this.workspace);return}if(e==="move-allowed"){this.modes.system.setMoveAllowed(a==="true");return}this.queueReload()}}get workspace(){return this.getAttribute("workspace")==="stackup"?"stackup":"pcb"}get systemMode(){return this.getAttribute("mode")==="system"}queueReload(){let e=this.systemMode?"system":this.getAttribute("bundle-url");!e||e===this.reloadSource||(this.reloadSource=e,!this.reloadQueued&&(this.reloadQueued=!0,queueMicrotask(()=>{this.reloadQueued=!1,this.isConnected&&this.reload()})))}async reload(){let e=this.getAttribute("bundle-url"),r=this.reloadOwner.begin();if(this.detachModes(),this.systemMode){await this.reloadSystem(r);return}if(!e){this.shadowRoot.innerHTML="<style>:host{display:block;height:100%;font:14px system-ui;color:#94a3b8}</style><div>Semantic bundle URL is missing.</div>";return}await np(this,r,{owner:this.reloadOwner,bundleUrl:e,loadBundle:op})}async reloadSystem(e){let{signal:r}=e,a=()=>this.reloadOwner.owns(e)&&this.isConnected;try{this.renderShell();let s=await nb({root:this.shadowRoot,loadBundle:(i,o)=>op(i,null,o),isActive:()=>this.getAttribute("active")==="true",onSelectionChange:i=>{r.aborted||this.emit("selectionchange",{selection:i})},onContextMenu:i=>{r.aborted||this.emit("contextmenu",i)},onViewStateChange:i=>{r.aborted||this.emitViewState(i)},onEmphasis:i=>{r.aborted||this.emit("emphasis",{results:i})},onMove:i=>{r.aborted||this.emit("move",i)},onHarness:i=>{r.aborted||this.emit("harness",i)}});if(!a()){s?.dispose?.();return}this.mounted=this.modes.system,this.mounted.attach(s,{moveAllowed:this.getAttribute("move-allowed")==="true"});let n=this.getViewState();n&&this.emitViewState(n),this.emitReady({schema:"prism.semantic_viewer_performance.a0",milestone:"system-mounted"})}catch(s){if(!a())return;this.renderError(s),this.emitError(s)}}emit(e,r){this.dispatchEvent(new CustomEvent(`prism-semantic-viewer:${e}`,{bubbles:!0,composed:!0,detail:r}))}renderLoading(){this.shadowRoot.innerHTML='<style>:host{display:block;height:100%;background:#020817;color:#e5e7eb;font:14px system-ui}</style><div style="display:grid;place-items:center;height:100%">Loading semantic visualizer...</div>'}renderShell(){this.shadowRoot.innerHTML=rk()}renderError(e){console.error(e),this.shadowRoot.innerHTML=`
      <style>
        :host{display:block;height:100%;background:#020817;color:#e5e7eb;font:14px system-ui}
        .error{height:100%;display:grid;place-items:center;padding:24px}
        pre{max-width:100%;white-space:pre-wrap;color:#fecaca;background:#111827;border:1px solid #374151;padding:16px}
      </style>
      <div class="error"><pre>${ak(e?.stack||e?.message||String(e))}</pre></div>
    `}mountViewer({topology:e,semanticGeometry:r,readiness:a,assetCache:s=null,signal:n}){return Yo({root:this.shadowRoot,topology:e,semanticGeometry:r,readiness:a,workspaceScope:"3d",assetCache:s,isActive:()=>this.getAttribute("active")==="true",onSelectionChange:i=>{n.aborted||this.dispatchEvent(new CustomEvent("prism-semantic-viewer:selectionchange",{bubbles:!0,composed:!0,detail:{selection:i}}))},onContextMenu:i=>{n.aborted||this.dispatchEvent(new CustomEvent("prism-semantic-viewer:contextmenu",{bubbles:!0,composed:!0,detail:i}))},onViewStateChange:i=>{n.aborted||this.emitViewState(i)},onPerformanceEvent:i=>{n.aborted||(console.info("[prism-3d-perf]",i),this.dispatchEvent(new CustomEvent("prism-semantic-viewer:performance",{bubbles:!0,composed:!0,detail:i})))}})}publishController(e){this.mounted=this.modes.board,this.mounted.attach(e,{workspace:this.workspace});let r=this.getViewState();r&&this.emitViewState(r)}emitViewState(e){this.dispatchEvent(new CustomEvent("prism-semantic-viewer:viewstatechange",{bubbles:!0,composed:!0,detail:e}))}emitReady(e){console.info("[prism-3d-perf]",e),this.dispatchEvent(new CustomEvent("prism-semantic-viewer:ready",{bubbles:!0,composed:!0,detail:e}))}emitError(e){this.dispatchEvent(new CustomEvent("prism-semantic-viewer:error",{bubbles:!0,detail:{error:e}}))}};If(Wn.prototype);function cp(){customElements.get("prism-semantic-viewer")||customElements.define("prism-semantic-viewer",Wn)}window.__PRISM_SEMANTIC_VIEWER_MANUAL_BOOT__=!0;cp();
