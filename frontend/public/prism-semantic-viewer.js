var cr=`:host,
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





.stackup-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 4px;
}

.stackup-summary-grid-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.stackup-summary-card {
  background: color-mix(in srgb, var(--panel-raised) 54%, var(--panel));
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 5px 10px;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.stackup-summary-card label {
  flex: none;
  font-size: 9px;
  color: var(--muted);
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.stackup-summary-card span {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  font-weight: 650;
  color: var(--foreground);
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  overflow: hidden;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.stackup-visual-svg {
  display: block;
  width: 100%;
  flex: 1 1 0;
  min-height: 0;
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
  font-size: 11px;
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
  font-size: 12px;
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

.stackup-layer-index,
.stackup-layer-name,
.stackup-layer-thickness,
.stackup-layer-metadata {
  dominant-baseline: central;
}

.stackup-layer-name {
  fill: var(--foreground);
  font-size: 13px;
  font-weight: 650;
}

.stackup-layer-index,
.stackup-layer-thickness {
  fill: var(--muted);
  font-size: 12px;
  font-weight: 650;
}

.stackup-layer-index {
  font-weight: 700;
}

.stackup-layer-metadata {
  fill: var(--muted);
  font-size: 11px;
}

.stackup-layer-leader {
  fill: none;
  stroke: var(--muted);
  stroke-width: 1;
  opacity: 0.55;
}

.stackup-svg-layer.active .stackup-layer-leader {
  stroke: var(--primary);
  opacity: 1;
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

  .stackup-visual-svg {
    flex: none;
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
`;var ne=(e,t,a)=>Math.max(t,Math.min(a,e)),sa=(e,t,a)=>e+(t-e)*a;function ra(e,t){return[e[0]+t[0],e[1]+t[1],e[2]+t[2]]}function io(e,t){return[e[0]-t[0],e[1]-t[1],e[2]-t[2]]}function Bt(e,t){return[e[0]*t,e[1]*t,e[2]*t]}function oo(e){return Math.hypot(e[0],e[1],e[2])}function kt(e){let t=oo(e)||1;return Bt(e,1/t)}function aa(e,t){return[e[1]*t[2]-e[2]*t[1],e[2]*t[0]-e[0]*t[2],e[0]*t[1]-e[1]*t[0]]}function rs(e,t){return e[0]*t[0]+e[1]*t[1]+e[2]*t[2]}function dr(e,t){let a=new Float32Array(16);for(let s=0;s<4;s+=1)for(let r=0;r<4;r+=1)a[s*4+r]=e[r]*t[s*4]+e[4+r]*t[s*4+1]+e[8+r]*t[s*4+2]+e[12+r]*t[s*4+3];return a}function lr(e,t,a){let s=kt(io(e,t)),r=kt(aa(a,s)),n=aa(s,r);return new Float32Array([r[0],n[0],s[0],0,r[1],n[1],s[1],0,r[2],n[2],s[2],0,-rs(r,e),-rs(n,e),-rs(s,e),1])}function fr(e,t,a,s){let r=1/Math.tan(e/2);return new Float32Array([r/t,0,0,0,0,r,0,0,0,0,a/(s-a),-1,0,0,a*s/(s-a),0])}function ur(e,t,a,s){return new Float32Array([2/e,0,0,0,0,2/t,0,0,0,0,1/(s-a),0,0,0,1,1])}function ns(e){return[(e[0]+e[3])/2,(e[1]+e[4])/2,(e[2]+e[5])/2]}function is(e){return Math.max(.001,Math.hypot(e[3]-e[0],e[4]-e[1],e[5]-e[2])/2)}var na=class{constructor(t){let a=ns(t),s=is(t);this.focus=[...a],this.targetFocus=[...a],this.azimuth=-.62,this.targetAzimuth=this.azimuth,this.polar=.72,this.targetPolar=this.polar,this.distance=s*2.8,this.targetDistance=this.distance,this.orthoScale=s*2.15,this.targetOrthoScale=this.orthoScale,this.sceneRadius=s,this.fov=Math.PI/4}update(t){let a=1-Math.exp(-t*14);this.focus=this.focus.map((s,r)=>sa(s,this.targetFocus[r],a)),this.azimuth=br(this.azimuth,this.targetAzimuth,a),this.polar=br(this.polar,this.targetPolar,a),this.distance=sa(this.distance,this.targetDistance,a),this.orthoScale=sa(this.orthoScale,this.targetOrthoScale,a)}snap(){this.focus=[...this.targetFocus],this.azimuth=this.targetAzimuth,this.polar=this.targetPolar,this.distance=this.targetDistance,this.orthoScale=this.targetOrthoScale}basis(){let t=Math.sin(this.polar),a=Math.cos(this.polar),s=kt([t*Math.sin(this.azimuth),-t*Math.cos(this.azimuth),a]),r=kt([Math.cos(this.azimuth),Math.sin(this.azimuth),0]),n=kt(aa(s,r));return{right:r,up:n,back:s}}matrix(t,a,s=!1,r=1){let n=Math.max(.01,t/Math.max(1,a)),{up:i,back:o}=this.basis(),c=ra(this.focus,Bt(o,this.distance)),l=lr(c,this.focus,i),p=s?ur(this.orthoScale*r*n,this.orthoScale*r,-this.sceneRadius*40,this.sceneRadius*40):fr(this.fov,n,Math.max(this.sceneRadius*5e-4,this.distance-this.sceneRadius*3.5),this.distance+this.sceneRadius*4.5);return dr(p,l)}orbit(t,a){let s=Math.sin(this.targetPolar)<0?-1:1;this.targetAzimuth-=s*t*.006,this.targetPolar=hr(this.targetPolar-a*.006)}isBelow(){return Math.cos(this.targetPolar)<0}pan(t,a,s,r=!1){let{right:n,up:i}=this.basis(),o=r?this.targetOrthoScale/Math.max(1,s):2*this.targetDistance*Math.tan(this.fov/2)/Math.max(1,s),c=ra(Bt(n,-t*o),Bt(i,a*o));this.targetFocus=ra(this.targetFocus,c)}dolly(t,a=!1){let s=Math.exp(t*.0032);a?this.targetOrthoScale=ne(this.targetOrthoScale*s,this.sceneRadius*.008,this.sceneRadius*24):this.targetDistance=ne(this.targetDistance*s,this.sceneRadius*.01,this.sceneRadius*48)}frame(t){if(!t)return;let a=is(t);this.targetFocus=ns(t),this.targetDistance=Math.max(a*2.8,this.sceneRadius*.02),this.targetOrthoScale=Math.max(a*2.15,this.sceneRadius*.02)}setFocus(t){this.targetFocus=[...t]}setAxis(t,a=!1){t==="z"?(this.targetAzimuth=0,this.targetPolar=a?Math.PI-.015:.015):t==="x"?(this.targetAzimuth=a?-Math.PI/2:Math.PI/2,this.targetPolar=Math.PI/2):(this.targetAzimuth=a?0:Math.PI,this.targetPolar=Math.PI/2)}rotateZ(t=1){this.targetAzimuth+=t*Math.PI/2}flip(){this.targetPolar=hr(Math.PI-this.targetPolar)}};function hr(e){return Math.atan2(Math.sin(e),Math.cos(e))}function br(e,t,a){let s=Math.atan2(Math.sin(t-e),Math.cos(t-e));return e+s*a}var ia=class e{static async create(t,a,s={}){let r=await fetch(a,{cache:"default"});if(!r.ok)throw new Error(`Failed to load BoM ${a}: ${r.status}`);let n=await r.json();if(n.schema!=="prism.bom_a0")throw new Error(`Unsupported BoM schema: ${n.schema||"missing"}`);let i=new e(t,n,s);return i.render(),i}constructor(t,a,s){this.container=t,this.payload=a,this.callbacks=s,this.query="",this.selectedRowId="",this.selectedReference="",this.rowsById=new Map((a.rows||[]).map(r=>[r.id,r])),this.componentIndex=new Map(Object.entries(a.componentIndex||{}))}setSelectionByReference(t,a={}){let s=this.componentIndex.get(t);s&&(this.selectedReference=t,this.selectedRowId=s.rowId,this.renderContent(),a.scroll&&this.container.querySelector(`[data-row-id="${fo(s.rowId)}"]`)?.scrollIntoView({block:"center",behavior:"smooth"}))}clearSelection(){this.selectedReference="",this.selectedRowId="",this.renderContent()}render(){let t=this.filteredRows();this.container.innerHTML=`
      <section class="bom-workspace">
        <header class="bom-toolbar">
          <div>
            <p class="eyebrow">Prism BoM A0</p>
            <h2>Bill of Materials</h2>
            <span data-bom-count>${t.length} of ${(this.payload.rows||[]).length} grouped rows \xB7 ${(this.payload.components||[]).length} components</span>
          </div>
          <label class="bom-search">
            <span>Search</span>
            <input id="bom-search" type="search" value="${Ne(this.query)}" placeholder="Reference, value, footprint, manufacturer..." />
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
            <tr>${a.map(r=>`<th>${Ne(r)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${t.map(r=>this.rowHtml(r,a)).join("")}
          </tbody>
        </table>
      </div>
      ${s?`<aside class="bom-detail">${this.detailHtml(s)}</aside>`:""}
    `}filteredRows(){let t=this.query.trim().toLowerCase(),a=this.payload.rows||[];return t?a.filter(s=>JSON.stringify(s).toLowerCase().includes(t)):a}rowHtml(t,a){return`
      <tr class="${t.id===this.selectedRowId?"selected":""}" data-row-id="${Ne(t.id)}">
        ${a.map(r=>{let n=t.fields?.[r]||"";return r==="Reference"?`<td class="bom-reference-cell">${(t.references||[]).map(i=>`
              <button class="bom-ref-chip ${i===this.selectedReference?"active":""}" data-reference="${Ne(i)}">${Ne(i)}</button>
            `).join("")}</td>`:!n&&lo(r)?'<td><span class="bom-missing">Missing</span></td>':`<td title="${Ne(n)}">${Ne(n)}</td>`}).join("")}
      </tr>
    `}detailHtml(t){let a=co(t,this.payload.displayColumns||[],this.payload.extraColumns||[]);return`
      <div class="bom-detail-head">
        <p class="eyebrow">Line item</p>
        <h3>${Ne((t.references||[]).join(", "))}</h3>
        <span>${t.qty} component${t.qty===1?"":"s"}${t.dnp?" \xB7 DNP":""}</span>
      </div>
      <div class="bom-ref-list">
        ${(t.references||[]).map(s=>`
          <button class="bom-ref-chip detail ${s===this.selectedReference?"active":""}" data-reference="${Ne(s)}">${Ne(s)}</button>
        `).join("")}
      </div>
      <dl class="bom-field-list">
        ${a.map(([s,r])=>`
          <div>
            <dt>${Ne(s)}</dt>
            <dd>${Ne(r)}</dd>
          </div>
        `).join("")}
      </dl>
    `}bind(){let t=this.container.querySelector("#bom-search");t?.addEventListener("input",()=>{this.query=t.value,this.renderContent()}),this.bindContent(this.container)}bindContent(t){t.querySelectorAll("[data-row-id]").forEach(a=>{a.addEventListener("click",s=>{s.target.closest("[data-reference]")||(this.selectedRowId=a.dataset.rowId,this.selectedReference="",this.renderContent())})}),t.querySelectorAll("[data-reference]").forEach(a=>{a.addEventListener("click",s=>{s.stopPropagation();let r=a.dataset.reference;this.setSelectionByReference(r),this.callbacks.onSelectReference?.(r)})})}};function co(e,t,a){let s=[],r=new Set(["Reference","Qty"].map(os));for(let i of t){if(i==="Reference"||i==="Qty")continue;let o=e.fields?.[i]||"";o&&(s.push([i,o]),r.add(os(i)))}let n=e.canonicalFields||{};for(let i of a){let o=n[i]||"";if(!o)continue;let c=os(i);r.has(c)||(r.add(c),s.push([i,o]))}return s}function os(e){return String(e||"").toLowerCase().replace(/[\s_\-()[\]/]+/g,"")}function lo(e){return["Manufacturer Part Number","Vendor Part Number","Datasheet","Footprint","Value"].includes(e)}function Ne(e){return String(e??"").replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t])}function fo(e){return String(e).replace(/["\\]/g,"\\$&")}function gr(e,t=new Map){let a=new Map;for(let r of e||[]){let n=String(r?.designator||"");if(!n)continue;let i=a.get(n)||{reference:n,featureIds:new Set,modelCount:0},o=Number(r?.featureId)||0;o>0&&i.featureIds.add(o),a.set(n,i)}for(let[r,n]of t||[]){let i=a.get(String(r));i&&(i.modelCount=Math.max(i.modelCount,Number(n)||0))}let s=new Map;for(let[r,n]of a)s.set(r,{reference:r,featureIds:[...n.featureIds].sort((i,o)=>i-o),ambiguous:n.featureIds.size>1||n.modelCount>1});return s}function pr(e,t){let a=[...new Set((Array.isArray(e)?e:[]).map(c=>String(c||"")).filter(Boolean))],s=[],r=[],n=[],i=new Set,o=new Set;for(let c of a){let l=t.get(c);if(!l){n.push(c);continue}if(l.ambiguous){r.push(c);continue}s.push(c),o.add(c);for(let p of l.featureIds)i.add(p)}return{requested:a,applied:s,ambiguous:r,unknown:n,hiddenFeatureIds:i,hiddenReferences:o}}function oa(e,t){return!!e&&t.has(String(e))}var uo={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};function D(e){return String(e??"").replace(/[&<>"']/g,t=>uo[t])}var cs=`
fn netEmphasized(id: u32) -> bool {
  return id != 0u && id < arrayLength(&netMask) && netMask[id] != 0u;
}
`;function ca(e){let t=new Set;if(e==null)return t;for(let a of e){let s=Number(a);!Number.isInteger(s)||s<=0||s>4294967295||t.add(s)}return t}function mr(e,t=0){let a=0;for(let r of ca(e))a=Math.max(a,r);let s=64;for(;s<a+1;)s*=2;return Math.max(s,Math.floor(t)||0)}function yr(e,t){let a=Math.max(64,Math.floor(t)||0),s=new Uint32Array(a);s.fill(0);for(let r of ca(e))r<a&&(s[r]=1);return s}function Ot(e,t){return!Array.isArray(e)||!t?null:e.find(a=>a.name===t||Array.isArray(a.aliases)&&a.aliases.includes(t))||null}function xr(e,t){let a=new Set;if(!Array.isArray(e)||!Array.isArray(t))return a;for(let s of t){if(!s)continue;let r=s.netUid&&e.find(i=>i.uid===s.netUid)||s.netName&&Ot(e,s.netName),n=Number(r?.id);Number.isInteger(n)&&n>0&&a.add(n)}return a}var wr=class{_listeners={};addEventListener(e,t){let a=this._listeners;return a[e]===void 0&&(a[e]=[]),a[e].indexOf(t)===-1&&a[e].push(t),this}removeEventListener(e,t){let a=this._listeners[e];if(a!==void 0){let s=a.indexOf(t);s!==-1&&a.splice(s,1)}return this}dispatchEvent(e){let t=this._listeners[e.type];if(t!==void 0){let a=t.slice(0);for(let s=0,r=a.length;s<r;s++)a[s].call(this,e)}return this}dispose(){for(let e in this._listeners)delete this._listeners[e]}},Ye=class{_disposed=!1;_name;_parent;_child;_attributes;constructor(e,t,a,s={}){if(this._name=e,this._parent=t,this._child=a,this._attributes=s,!t.isOnGraph(a))throw new Error("Cannot connect disconnected graphs.")}getName(){return this._name}getParent(){return this._parent}getChild(){return this._child}setChild(e){return this._child=e,this}getAttributes(){return this._attributes}dispose(){this._disposed||(this._parent._destroyRef(this),this._disposed=!0)}isDisposed(){return this._disposed}},ds=class extends wr{_emptySet=new Set;_edges=new Set;_parentEdges=new Map;_childEdges=new Map;listEdges(){return Array.from(this._edges)}listParentEdges(e){return Array.from(this._childEdges.get(e)||this._emptySet)}listParents(e){let t=new Set;for(let a of this.listParentEdges(e))t.add(a.getParent());return Array.from(t)}listChildEdges(e){return Array.from(this._parentEdges.get(e)||this._emptySet)}listChildren(e){let t=new Set;for(let a of this.listChildEdges(e))t.add(a.getChild());return Array.from(t)}disconnectParents(e,t){for(let a of this.listParentEdges(e))(!t||t(a.getParent()))&&a.dispose();return this}_createEdge(e,t,a,s){let r=new Ye(e,t,a,s);this._edges.add(r);let n=r.getParent();this._parentEdges.has(n)||this._parentEdges.set(n,new Set),this._parentEdges.get(n).add(r);let i=r.getChild();return this._childEdges.has(i)||this._childEdges.set(i,new Set),this._childEdges.get(i).add(r),r}_destroyEdge(e){return this._edges.delete(e),this._parentEdges.get(e.getParent()).delete(e),this._childEdges.get(e.getChild()).delete(e),this}},he=class{list=[];constructor(e){if(e)for(let t of e)this.list.push(t)}add(e){this.list.push(e)}remove(e){let t=this.list.indexOf(e);t>=0&&this.list.splice(t,1)}removeChild(e){let t=[];for(let a of this.list)a.getChild()===e&&t.push(a);for(let a of t)this.remove(a);return t}listRefsByChild(e){let t=[];for(let a of this.list)a.getChild()===e&&t.push(a);return t}values(){return this.list}},te=class{set=new Set;map=new Map;constructor(e){if(e)for(let t of e)this.add(t)}add(e){let t=e.getChild();this.removeChild(t),this.set.add(e),this.map.set(t,e)}remove(e){this.set.delete(e),this.map.delete(e.getChild())}removeChild(e){let t=this.map.get(e)||null;return t&&this.remove(t),t}getRefByChild(e){return this.map.get(e)||null}values(){return Array.from(this.set)}},ce=class{map={};constructor(e){e&&Object.assign(this.map,e)}set(e,t){this.map[e]=t}delete(e){delete this.map[e]}get(e){return this.map[e]||null}keys(){return Object.keys(this.map)}values(){return Object.values(this.map)}},J=Symbol("attributes"),Je=Symbol("immutableKeys"),vr=class Tr extends wr{_disposed=!1;graph;[J];[Je];constructor(t){super(),this.graph=t,this[Je]=new Set,this[J]=this._createAttributes()}getDefaults(){return{}}_createAttributes(){let t=this.getDefaults(),a={};for(let s in t){let r=t[s];if(r instanceof Tr){let n=this.graph._createEdge(s,this,r);this[Je].add(s),a[s]=n}else a[s]=r}return a}isOnGraph(t){return this.graph===t.graph}isDisposed(){return this._disposed}dispose(){this._disposed||(this.graph.listChildEdges(this).forEach(t=>t.dispose()),this.graph.disconnectParents(this),this._disposed=!0,this.dispatchEvent({type:"dispose"}))}detach(){return this.graph.disconnectParents(this),this}swap(t,a){for(let s in this[J]){let r=this[J][s];if(r instanceof Ye){let n=r;n.getChild()===t&&this.setRef(s,a,n.getAttributes())}else if(r instanceof he)for(let n of r.listRefsByChild(t)){let i=n.getAttributes();this.removeRef(s,t),this.addRef(s,a,i)}else if(r instanceof te){let n=r.getRefByChild(t);if(n){let i=n.getAttributes();this.removeRef(s,t),this.addRef(s,a,i)}}else if(r instanceof ce)for(let n of r.keys()){let i=r.get(n);i.getChild()===t&&this.setRefMap(s,n,a,i.getAttributes())}}return this}get(t){return this[J][t]}set(t,a){return this[J][t]=a,this.dispatchEvent({type:"change",attribute:t})}getRef(t){let a=this[J][t];return a?a.getChild():null}setRef(t,a,s){if(this[Je].has(t))throw new Error(`Cannot overwrite immutable attribute, "${t}".`);let r=this[J][t];if(r&&r.dispose(),!a)return this;let n=this.graph._createEdge(t,this,a,s);return this[J][t]=n,this.dispatchEvent({type:"change",attribute:t})}listRefs(t){return this.assertRefList(t).values().map(a=>a.getChild())}addRef(t,a,s){let r=this.graph._createEdge(t,this,a,s);return this.assertRefList(t).add(r),this.dispatchEvent({type:"change",attribute:t})}removeRef(t,a){let s=this.assertRefList(t);if(s instanceof he)for(let r of s.listRefsByChild(a))r.dispose();else{let r=s.getRefByChild(a);r&&r.dispose()}return this}assertRefList(t){let a=this[J][t];if(a instanceof he||a instanceof te)return a;throw new Error(`Expected RefList or RefSet for attribute "${t}"`)}listRefMapKeys(t){return this.assertRefMap(t).keys()}listRefMapValues(t){return this.assertRefMap(t).values().map(a=>a.getChild())}getRefMap(t,a){let s=this.assertRefMap(t).get(a);return s?s.getChild():null}setRefMap(t,a,s,r){let n=this.assertRefMap(t),i=n.get(a);if(i&&i.dispose(),!s)return this;r=Object.assign(r||{},{key:a});let o=this.graph._createEdge(t,this,s,{...r,key:a});return n.set(a,o),this.dispatchEvent({type:"change",attribute:t,key:a})}assertRefMap(t){let a=this[J][t];if(a instanceof ce)return a;throw new Error(`Expected RefMap for attribute "${t}"`)}dispatchEvent(t){return super.dispatchEvent({...t,target:this}),this.graph.dispatchEvent({...t,target:this,type:`node:${t.type}`}),this}_destroyRef(t){let a=t.getName();if(this[J][a]===t)this[J][a]=null,this[Je].has(a)&&t.getChild().dispose();else if(this[J][a]instanceof he)this[J][a].remove(t);else if(this[J][a]instanceof te)this[J][a].remove(t);else if(this[J][a]instanceof ce){let s=this[J][a];for(let r of s.keys())s.get(r)===t&&s.delete(r)}else return;this.graph._destroyEdge(t),this.dispatchEvent({type:"change",attribute:a})}};var Sr="v4.4.2",Qe="@glb.bin",N=(function(e){return e.ACCESSOR="Accessor",e.ANIMATION="Animation",e.ANIMATION_CHANNEL="AnimationChannel",e.ANIMATION_SAMPLER="AnimationSampler",e.BUFFER="Buffer",e.CAMERA="Camera",e.MATERIAL="Material",e.MESH="Mesh",e.PRIMITIVE="Primitive",e.PRIMITIVE_TARGET="PrimitiveTarget",e.NODE="Node",e.ROOT="Root",e.SCENE="Scene",e.SKIN="Skin",e.TEXTURE="Texture",e.TEXTURE_INFO="TextureInfo",e})({});var ho=(function(e){return e.ARRAY_BUFFER="ARRAY_BUFFER",e.ELEMENT_ARRAY_BUFFER="ELEMENT_ARRAY_BUFFER",e.INVERSE_BIND_MATRICES="INVERSE_BIND_MATRICES",e.OTHER="OTHER",e.SPARSE="SPARSE",e})({}),Be=(function(e){return e[e.R=4096]="R",e[e.G=256]="G",e[e.B=16]="B",e[e.A=1]="A",e})({});var bo=class extends Float32Array{constructor(){throw super(),new Error("Unsupported typed array instantiation.")}},pa={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5131:typeof Float16Array<"u"?Float16Array:bo,5126:Float32Array,5130:Float64Array},G=class{static createBufferFromDataURI(e){if(typeof Buffer>"u"){let t=atob(e.split(",")[1]),a=new Uint8Array(t.length);for(let s=0;s<t.length;s++)a[s]=t.charCodeAt(s);return a}else{let t=e.split(",")[1],a=e.indexOf("base64")>=0;return Buffer.from(t,a?"base64":"utf8")}}static encodeText(e){return new TextEncoder().encode(e)}static decodeText(e){return new TextDecoder().decode(e)}static concat(e){let t=0;for(let r of e)t+=r.byteLength;let a=new Uint8Array(t),s=0;for(let r of e)a.set(r,s),s+=r.byteLength;return a}static pad(e,t=0){let a=this.padNumber(e.byteLength);if(a===e.byteLength)return e;let s=new Uint8Array(a);if(s.set(e),t!==0)for(let r=e.byteLength;r<a;r++)s[r]=t;return s}static padNumber(e){return Math.ceil(e/4)*4}static equals(e,t){if(e===t)return!0;if(e.byteLength!==t.byteLength)return!1;let a=e.byteLength;for(;a--;)if(e[a]!==t[a])return!1;return!0}static toView(e,t=0,a=1/0){return new Uint8Array(e.buffer,e.byteOffset+t,Math.min(e.byteLength,a))}static assertView(e){if(e&&!ArrayBuffer.isView(e))throw new Error(`Method requires Uint8Array parameter; received "${typeof e}".`);return e}};var go=class{match(e){return e.length>=3&&e[0]===255&&e[1]===216&&e[2]===255}getSize(e){let t=new DataView(e.buffer,e.byteOffset+4),a,s;for(;t.byteLength;){if(a=t.getUint16(0,!1),mo(t,a),s=t.getUint8(a+1),s===192||s===193||s===194)return[t.getUint16(a+7,!1),t.getUint16(a+5,!1)];t=new DataView(e.buffer,t.byteOffset+a+2)}throw new TypeError("Invalid JPG, no size found")}getChannels(e){return 3}},po=class _r{static PNG_FRIED_CHUNK_NAME="CgBI";match(t){return t.length>=8&&t[0]===137&&t[1]===80&&t[2]===78&&t[3]===71&&t[4]===13&&t[5]===10&&t[6]===26&&t[7]===10}getSize(t){let a=new DataView(t.buffer,t.byteOffset);return G.decodeText(t.slice(12,16))===_r.PNG_FRIED_CHUNK_NAME?[a.getUint32(32,!1),a.getUint32(36,!1)]:[a.getUint32(16,!1),a.getUint32(20,!1)]}getChannels(t){return 4}},Le=class{static impls={"image/jpeg":new go,"image/png":new po};static registerFormat(e,t){this.impls[e]=t}static getMimeType(e){for(let t in this.impls)if(this.impls[t].match(e))return t;return null}static getSize(e,t){return this.impls[t]?this.impls[t].getSize(e):null}static getChannels(e,t){return this.impls[t]?this.impls[t].getChannels(e):null}static getVRAMByteLength(e,t){if(!this.impls[t])return null;if(this.impls[t].getVRAMByteLength)return this.impls[t].getVRAMByteLength(e);let a=0,s=4,r=this.getSize(e,t);if(!r)return null;for(;r[0]>1||r[1]>1;)a+=r[0]*r[1]*s,r[0]=Math.max(Math.floor(r[0]/2),1),r[1]=Math.max(Math.floor(r[1]/2),1);return a+=1*s,a}static mimeTypeToExtension(e){return e==="image/jpeg"?"jpg":e.split("/").pop()}static extensionToMimeType(e){return e==="jpg"?"image/jpeg":e?`image/${e}`:""}};function mo(e,t){if(t>e.byteLength)throw new TypeError("Corrupt JPG, exceeded buffer limits");if(e.getUint8(t)!==255)throw new TypeError("Invalid JPG, marker table corrupted");return e}var Mt=class{static basename(e){let t=e.split(/[\\/]/).pop();return t.substring(0,t.lastIndexOf("."))}static extension(e){if(e.startsWith("data:image/")){let t=e.match(/data:(image\/\w+)/)[1];return Le.mimeTypeToExtension(t)}else{if(e.startsWith("data:model/gltf+json"))return"gltf";if(e.startsWith("data:model/gltf-binary"))return"glb";if(e.startsWith("data:application/"))return"bin"}return e.split(/[\\/]/).pop().split(/[.]/).pop()}},us=typeof Float32Array<"u"?Float32Array:Array;Math.PI/180;180/Math.PI;function yo(){var e=new us(3);return us!=Float32Array&&(e[0]=0,e[1]=0,e[2]=0),e}function ls(e){var t=e[0],a=e[1],s=e[2];return Math.sqrt(t*t+a*a+s*s)}function xo(e,t,a){var s=t[0],r=t[1],n=t[2],i=a[3]*s+a[7]*r+a[11]*n+a[15];return i=i||1,e[0]=(a[0]*s+a[4]*r+a[8]*n+a[12])/i,e[1]=(a[1]*s+a[5]*r+a[9]*n+a[13])/i,e[2]=(a[2]*s+a[6]*r+a[10]*n+a[14])/i,e}(function(){var e=yo();return function(t,a,s,r,n,i){var o,c;for(a||(a=3),s||(s=0),r?c=Math.min(r*a+s,t.length):c=t.length,o=s;o<c;o+=a)e[0]=t[o],e[1]=t[o+1],e[2]=t[o+2],n(e,e,i),t[o]=e[0],t[o+1]=e[1],t[o+2]=e[2];return t}})();function Nr(e){let t=jr(),a=e.propertyType==="Node"?[e]:e.listChildren();for(let s of a)s.traverse(r=>{let n=r.getMesh();if(!n)return;let i=wo(n,r.getWorldMatrix());i.min.every(isFinite)&&i.max.every(isFinite)&&(hs(i.min,t),hs(i.max,t))});return t}function wo(e,t){let a=jr();for(let s of e.listPrimitives()){let r=s.getAttribute("POSITION"),n=s.getIndices();if(!r)continue;let i=[0,0,0],o=[0,0,0];for(let c=0,l=n?n.getCount():r.getCount();c<l;c++){let p=n?n.getScalar(c):c;i=r.getElement(p,i),o=xo(o,i,t),hs(o,a)}}return a}function hs(e,t){for(let a=0;a<3;a++)t.min[a]=Math.min(e[a],t.min[a]),t.max[a]=Math.max(e[a],t.max[a])}function jr(){return{min:[1/0,1/0,1/0],max:[-1/0,-1/0,-1/0]}}var Er="https://null.example",fs=class{static DEFAULT_INIT={};static PROTOCOL_REGEXP=/^[a-zA-Z]+:\/\//;static dirname(e){let t=e.lastIndexOf("/");return t===-1?"./":e.substring(0,t+1)}static basename(e){return Mt.basename(new URL(e,Er).pathname)}static extension(e){return Mt.extension(new URL(e,Er).pathname)}static resolve(e,t){if(!this.isRelativePath(t))return t;let a=e.split("/"),s=t.split("/");a.pop();for(let r=0;r<s.length;r++)s[r]!=="."&&(s[r]===".."?a.pop():a.push(s[r]));return a.join("/")}static isAbsoluteURL(e){return this.PROTOCOL_REGEXP.test(e)}static isRelativePath(e){return!/^(?:[a-zA-Z]+:)?\//.test(e)}};function kr(e){return Object.prototype.toString.call(e)==="[object Object]"}function mt(e){if(kr(e)===!1)return!1;let t=e.constructor;if(t===void 0)return!0;let a=t.prototype;return!(kr(a)===!1||Object.hasOwn(a,"isPrototypeOf")===!1)}var vo=(function(e){return e[e.SILENT=4]="SILENT",e[e.ERROR=3]="ERROR",e[e.WARN=2]="WARN",e[e.INFO=1]="INFO",e[e.DEBUG=0]="DEBUG",e})({}),ma=class Fr{verbosity;static Verbosity=vo;static DEFAULT_INSTANCE=new Fr(1);constructor(t){this.verbosity=t}debug(t){this.verbosity<=0&&console.debug(t)}info(t){this.verbosity<=1&&console.info(t)}warn(t){this.verbosity<=2&&console.warn(t)}error(t){this.verbosity<=3&&console.error(t)}};function To(e){var t=e[0],a=e[1],s=e[2],r=e[3],n=e[4],i=e[5],o=e[6],c=e[7],l=e[8],p=e[9],g=e[10],v=e[11],x=e[12],u=e[13],d=e[14],m=e[15],f=t*i-a*n,h=t*o-s*n,y=a*o-s*i,w=l*u-p*x,T=l*d-g*x,E=p*d-g*u,R=t*E-a*T+s*w,I=n*E-i*T+o*w,_=l*y-p*h+g*f,A=x*y-u*h+d*f;return c*R-r*I+m*_-v*A}function Eo(e,t,a){var s=t[0],r=t[1],n=t[2],i=t[3],o=t[4],c=t[5],l=t[6],p=t[7],g=t[8],v=t[9],x=t[10],u=t[11],d=t[12],m=t[13],f=t[14],h=t[15],y=a[0],w=a[1],T=a[2],E=a[3];return e[0]=y*s+w*o+T*g+E*d,e[1]=y*r+w*c+T*v+E*m,e[2]=y*n+w*l+T*x+E*f,e[3]=y*i+w*p+T*u+E*h,y=a[4],w=a[5],T=a[6],E=a[7],e[4]=y*s+w*o+T*g+E*d,e[5]=y*r+w*c+T*v+E*m,e[6]=y*n+w*l+T*x+E*f,e[7]=y*i+w*p+T*u+E*h,y=a[8],w=a[9],T=a[10],E=a[11],e[8]=y*s+w*o+T*g+E*d,e[9]=y*r+w*c+T*v+E*m,e[10]=y*n+w*l+T*x+E*f,e[11]=y*i+w*p+T*u+E*h,y=a[12],w=a[13],T=a[14],E=a[15],e[12]=y*s+w*o+T*g+E*d,e[13]=y*r+w*c+T*v+E*m,e[14]=y*n+w*l+T*x+E*f,e[15]=y*i+w*p+T*u+E*h,e}function ko(e,t){var a=t[0],s=t[1],r=t[2],n=t[4],i=t[5],o=t[6],c=t[8],l=t[9],p=t[10];return e[0]=Math.sqrt(a*a+s*s+r*r),e[1]=Math.sqrt(n*n+i*i+o*o),e[2]=Math.sqrt(c*c+l*l+p*p),e}function Mo(e,t){var a=new us(3);ko(a,t);var s=1/a[0],r=1/a[1],n=1/a[2],i=t[0]*s,o=t[1]*r,c=t[2]*n,l=t[4]*s,p=t[5]*r,g=t[6]*n,v=t[8]*s,x=t[9]*r,u=t[10]*n,d=i+p+u,m=0;return d>0?(m=Math.sqrt(d+1)*2,e[3]=.25*m,e[0]=(g-x)/m,e[1]=(v-c)/m,e[2]=(o-l)/m):i>p&&i>u?(m=Math.sqrt(1+i-p-u)*2,e[3]=(g-x)/m,e[0]=.25*m,e[1]=(o+l)/m,e[2]=(v+c)/m):p>u?(m=Math.sqrt(1+p-i-u)*2,e[3]=(v-c)/m,e[0]=(o+l)/m,e[1]=.25*m,e[2]=(g+x)/m):(m=Math.sqrt(1+u-i-p)*2,e[3]=(o-l)/m,e[0]=(v+c)/m,e[1]=(g+x)/m,e[2]=.25*m),e}var re=class Pt{static identity(t){return t}static eq(t,a,s=1e-5){if(t.length!==a.length)return!1;for(let r=0;r<t.length;r++)if(Math.abs(t[r]-a[r])>s)return!1;return!0}static clamp(t,a,s){return t<a?a:t>s?s:t}static decodeNormalizedInt(t,a){switch(a){case 5126:return t;case 5123:return t/65535;case 5121:return t/255;case 5122:return Math.max(t/32767,-1);case 5120:return Math.max(t/127,-1);default:throw new Error("Invalid component type.")}}static encodeNormalizedInt(t,a){switch(a){case 5126:return t;case 5123:return Math.round(Pt.clamp(t,0,1)*65535);case 5121:return Math.round(Pt.clamp(t,0,1)*255);case 5122:return Math.round(Pt.clamp(t,-1,1)*32767);case 5120:return Math.round(Pt.clamp(t,-1,1)*127);default:throw new Error("Invalid component type.")}}static decompose(t,a,s,r){let n=ls([t[0],t[1],t[2]]),i=ls([t[4],t[5],t[6]]),o=ls([t[8],t[9],t[10]]);To(t)<0&&(n=-n),a[0]=t[12],a[1]=t[13],a[2]=t[14];let c=t.slice(),l=1/n,p=1/i,g=1/o;c[0]*=l,c[1]*=l,c[2]*=l,c[4]*=p,c[5]*=p,c[6]*=p,c[8]*=g,c[9]*=g,c[10]*=g,Mo(s,c),r[0]=n,r[1]=i,r[2]=o}static compose(t,a,s,r){let n=r,i=a[0],o=a[1],c=a[2],l=a[3],p=i+i,g=o+o,v=c+c,x=i*p,u=i*g,d=i*v,m=o*g,f=o*v,h=c*v,y=l*p,w=l*g,T=l*v,E=s[0],R=s[1],I=s[2];return n[0]=(1-(m+h))*E,n[1]=(u+T)*E,n[2]=(d-w)*E,n[3]=0,n[4]=(u-T)*R,n[5]=(1-(x+h))*R,n[6]=(f+y)*R,n[7]=0,n[8]=(d+w)*I,n[9]=(f-y)*I,n[10]=(1-(x+m))*I,n[11]=0,n[12]=t[0],n[13]=t[1],n[14]=t[2],n[15]=1,n}};function Ro(e,t){if(!!e!=!!t)return!1;let a=e.getChild(),s=t.getChild();return a===s||a.equals(s)}function Io(e,t){if(!!e!=!!t)return!1;let a=e.values(),s=t.values();if(a.length!==s.length)return!1;for(let r=0;r<a.length;r++){let n=a[r],i=s[r];if(n.getChild()!==i.getChild()&&!n.getChild().equals(i.getChild()))return!1}return!0}function Ao(e,t){if(!!e!=!!t)return!1;let a=e.keys(),s=t.keys();if(a.length!==s.length)return!1;for(let r of a){let n=e.get(r),i=t.get(r);if(!!n!=!!i)return!1;let o=n.getChild(),c=i.getChild();if(o!==c&&!o.equals(c))return!1}return!0}function Cr(e,t){if(e===t)return!0;if(!!e!=!!t||!e||!t||e.length!==t.length)return!1;for(let a=0;a<e.length;a++)if(e[a]!==t[a])return!1;return!0}function Br(e,t){if(e===t)return!0;if(!!e!=!!t)return!1;if(!mt(e)||!mt(t))return e===t;let a=e,s=t,r=0,n=0,i;for(i in a)r++;for(i in s)n++;if(r!==n)return!1;for(i in a){let o=a[i],c=s[i];if(ba(o)&&ba(c)){if(!Cr(o,c))return!1}else if(mt(o)&&mt(c)){if(!Br(o,c))return!1}else if(o!==c)return!1}return!0}function ba(e){return Array.isArray(e)||ArrayBuffer.isView(e)}var So="23456789abdegjkmnpqrvwxyzABDEGJKMNPQRVWXYZ",_o=999,No=6,Mr=new Set,jo=function(){let e="";for(let t=0;t<No;t++)e+=So.charAt(Math.floor(Math.random()*42));return e},Fo=function(){for(let e=0;e<_o;e++){let t=jo();if(!Mr.has(t))return Mr.add(t),t}return""},Ze=e=>e,Co=new Set,ps=class extends vr{constructor(e,t=""){super(e),this[J].name=t,this.init(),this.dispatchEvent({type:"create"})}getGraph(){return this.graph}getDefaults(){return Object.assign(super.getDefaults(),{name:"",extras:{}})}set(e,t){return Array.isArray(t)&&(t=t.slice()),super.set(e,t)}getName(){return this.get("name")}setName(e){return this.set("name",e)}getExtras(){return this.get("extras")}setExtras(e){return this.set("extras",e)}clone(){let e=this.constructor;return new e(this.graph).copy(this,Ze)}copy(e,t=Ze){for(let a in this[J]){let s=this[J][a];if(s instanceof Ye)this[Je].has(a)||s.dispose();else if(s instanceof he||s instanceof te)for(let r of s.values())r.dispose();else if(s instanceof ce)for(let r of s.values())r.dispose()}for(let a in e[J]){let s=this[J][a],r=e[J][a];if(r instanceof Ye)this[Je].has(a)?s.getChild().copy(t(r.getChild()),t):this.setRef(a,t(r.getChild()),r.getAttributes());else if(r instanceof te||r instanceof he)for(let n of r.values())this.addRef(a,t(n.getChild()),n.getAttributes());else if(r instanceof ce)for(let n of r.keys()){let i=r.get(n);this.setRefMap(a,n,t(i.getChild()),i.getAttributes())}else mt(r)?this[J][a]=JSON.parse(JSON.stringify(r)):Array.isArray(r)||r instanceof ArrayBuffer||ArrayBuffer.isView(r)?this[J][a]=r.slice():this[J][a]=r}return this}equals(e,t=Co){if(this===e)return!0;if(this.propertyType!==e.propertyType)return!1;for(let a in this[J]){if(t.has(a))continue;let s=this[J][a],r=e[J][a];if(s instanceof Ye||r instanceof Ye){if(!Ro(s,r))return!1}else if(s instanceof te||r instanceof te||s instanceof he||r instanceof he){if(!Io(s,r))return!1}else if(s instanceof ce||r instanceof ce){if(!Ao(s,r))return!1}else if(mt(s)||mt(r)){if(!Br(s,r))return!1}else if(ba(s)||ba(r)){if(!Cr(s,r))return!1}else if(s!==r)return!1}return!0}detach(){return this.graph.disconnectParents(this,e=>e.propertyType!=="Root"),this}listParents(){return this.graph.listParents(this)}},ye=class extends ps{getDefaults(){return Object.assign(super.getDefaults(),{extensions:new ce})}getExtension(e){return this.getRefMap("extensions",e)}setExtension(e,t){return t&&t._validateParent(this),this.setRefMap("extensions",e,t)}listExtensions(){return this.listRefMapValues("extensions")}},L=class de extends ye{static Type={SCALAR:"SCALAR",VEC2:"VEC2",VEC3:"VEC3",VEC4:"VEC4",MAT2:"MAT2",MAT3:"MAT3",MAT4:"MAT4"};static ComponentType={BYTE:5120,UNSIGNED_BYTE:5121,SHORT:5122,UNSIGNED_SHORT:5123,UNSIGNED_INT:5125,FLOAT:5126,FLOAT16:5131,FLOAT64:5130};init(){this.propertyType="Accessor"}getDefaults(){return Object.assign(super.getDefaults(),{array:null,type:de.Type.SCALAR,componentType:de.ComponentType.FLOAT,normalized:!1,sparse:!1,buffer:null})}static getElementSize(t){switch(t){case de.Type.SCALAR:return 1;case de.Type.VEC2:return 2;case de.Type.VEC3:return 3;case de.Type.VEC4:return 4;case de.Type.MAT2:return 4;case de.Type.MAT3:return 9;case de.Type.MAT4:return 16;default:throw new Error("Unexpected type: "+t)}}static getComponentSize(t){switch(t){case de.ComponentType.BYTE:case de.ComponentType.UNSIGNED_BYTE:return 1;case de.ComponentType.SHORT:case de.ComponentType.UNSIGNED_SHORT:return 2;case de.ComponentType.UNSIGNED_INT:case de.ComponentType.FLOAT:return 4;case de.ComponentType.FLOAT16:return 2;case de.ComponentType.FLOAT64:return 8;default:throw new Error("Unexpected component type: "+t)}}getMinNormalized(t){let a=this.getNormalized(),s=this.getElementSize(),r=this.getComponentType();if(this.getMin(t),a)for(let n=0;n<s;n++)t[n]=re.decodeNormalizedInt(t[n],r);return t}getMin(t){let a=this.getArray(),s=this.getCount(),r=this.getElementSize();for(let n=0;n<r;n++)t[n]=1/0;for(let n=0;n<s*r;n+=r)for(let i=0;i<r;i++){let o=a[n+i];Number.isFinite(o)&&(t[i]=Math.min(t[i],o))}return t}getMaxNormalized(t){let a=this.getNormalized(),s=this.getElementSize(),r=this.getComponentType();if(this.getMax(t),a)for(let n=0;n<s;n++)t[n]=re.decodeNormalizedInt(t[n],r);return t}getMax(t){let a=this.get("array"),s=this.getCount(),r=this.getElementSize();for(let n=0;n<r;n++)t[n]=-1/0;for(let n=0;n<s*r;n+=r)for(let i=0;i<r;i++){let o=a[n+i];Number.isFinite(o)&&(t[i]=Math.max(t[i],o))}return t}getCount(){let t=this.get("array");return t?t.length/this.getElementSize():0}getType(){return this.get("type")}setType(t){return this.set("type",t)}getElementSize(){return de.getElementSize(this.get("type"))}getComponentSize(){return this.get("array").BYTES_PER_ELEMENT}getComponentType(){return this.get("componentType")}getNormalized(){return this.get("normalized")}setNormalized(t){return this.set("normalized",t)}getScalar(t){let a=this.getElementSize(),s=this.getComponentType(),r=this.getArray();return this.getNormalized()?re.decodeNormalizedInt(r[t*a],s):r[t*a]}setScalar(t,a){let s=this.getElementSize(),r=this.getComponentType(),n=this.getArray();return this.getNormalized()?n[t*s]=re.encodeNormalizedInt(a,r):n[t*s]=a,this}getElement(t,a){let s=this.getNormalized(),r=this.getElementSize(),n=this.getComponentType(),i=this.getArray();for(let o=0;o<r;o++)s?a[o]=re.decodeNormalizedInt(i[t*r+o],n):a[o]=i[t*r+o];return a}setElement(t,a){let s=this.getNormalized(),r=this.getElementSize(),n=this.getComponentType(),i=this.getArray();for(let o=0;o<r;o++)s?i[t*r+o]=re.encodeNormalizedInt(a[o],n):i[t*r+o]=a[o];return this}getSparse(){return this.get("sparse")}setSparse(t){return this.set("sparse",t)}getBuffer(){return this.getRef("buffer")}setBuffer(t){return this.setRef("buffer",t)}getArray(){return this.get("array")}setArray(t){return this.set("componentType",t?Bo(t):de.ComponentType.FLOAT),this.set("array",t),this}getByteLength(){let t=this.get("array");return t?t.byteLength:0}};function Bo(e){switch(e.constructor){case Float32Array:return L.ComponentType.FLOAT;case Uint32Array:return L.ComponentType.UNSIGNED_INT;case Uint16Array:return L.ComponentType.UNSIGNED_SHORT;case Uint8Array:return L.ComponentType.UNSIGNED_BYTE;case Int16Array:return L.ComponentType.SHORT;case Int8Array:return L.ComponentType.BYTE;case Float64Array:return L.ComponentType.FLOAT64}if(typeof Float16Array<"u"&&e.constructor===Float16Array)return L.ComponentType.FLOAT16;throw new Error("Unknown accessor componentType.")}var Or=class extends ye{init(){this.propertyType="Animation"}getDefaults(){return Object.assign(super.getDefaults(),{channels:new te,samplers:new te})}addChannel(e){return this.addRef("channels",e)}removeChannel(e){return this.removeRef("channels",e)}listChannels(){return this.listRefs("channels")}addSampler(e){return this.addRef("samplers",e)}removeSampler(e){return this.removeRef("samplers",e)}listSamplers(){return this.listRefs("samplers")}},ms=class extends ye{static TargetPath={TRANSLATION:"translation",ROTATION:"rotation",SCALE:"scale",WEIGHTS:"weights"};init(){this.propertyType="AnimationChannel"}getDefaults(){return Object.assign(super.getDefaults(),{targetPath:null,targetNode:null,sampler:null})}getTargetPath(){return this.get("targetPath")}setTargetPath(e){return this.set("targetPath",e)}getTargetNode(){return this.getRef("targetNode")}setTargetNode(e){return this.setRef("targetNode",e)}getSampler(){return this.getRef("sampler")}setSampler(e){return this.setRef("sampler",e)}},ya=class Pr extends ye{static Interpolation={LINEAR:"LINEAR",STEP:"STEP",CUBICSPLINE:"CUBICSPLINE"};init(){this.propertyType="AnimationSampler"}getDefaultAttributes(){return Object.assign(super.getDefaults(),{interpolation:Pr.Interpolation.LINEAR,input:null,output:null})}getInterpolation(){return this.get("interpolation")}setInterpolation(t){return this.set("interpolation",t)}getInput(){return this.getRef("input")}setInput(t){return this.setRef("input",t,{usage:"OTHER"})}getOutput(){return this.getRef("output")}setOutput(t){return this.setRef("output",t,{usage:"OTHER"})}},Dr=class extends ye{init(){this.propertyType="Buffer"}getDefaults(){return Object.assign(super.getDefaults(),{uri:""})}getURI(){return this.get("uri")}setURI(e){return this.set("uri",e)}},xa=class Ur extends ye{static Type={PERSPECTIVE:"perspective",ORTHOGRAPHIC:"orthographic"};init(){this.propertyType="Camera"}getDefaults(){return Object.assign(super.getDefaults(),{type:Ur.Type.PERSPECTIVE,znear:.1,zfar:100,aspectRatio:null,yfov:Math.PI*2*50/360,xmag:1,ymag:1})}getType(){return this.get("type")}setType(t){return this.set("type",t)}getZNear(){return this.get("znear")}setZNear(t){return this.set("znear",t)}getZFar(){return this.get("zfar")}setZFar(t){return this.set("zfar",t)}getAspectRatio(){return this.get("aspectRatio")}setAspectRatio(t){return this.set("aspectRatio",t)}getYFov(){return this.get("yfov")}setYFov(t){return this.set("yfov",t)}getXMag(){return this.get("xmag")}setXMag(t){return this.set("xmag",t)}getYMag(){return this.get("ymag")}setYMag(t){return this.set("ymag",t)}},z=class extends ps{static EXTENSION_NAME;_validateParent(e){if(!this.parentTypes.includes(e.propertyType))throw new Error(`Parent "${e.propertyType}" invalid for child "${this.propertyType}".`)}},ae=class bs extends ye{static WrapMode={CLAMP_TO_EDGE:33071,MIRRORED_REPEAT:33648,REPEAT:10497};static MagFilter={NEAREST:9728,LINEAR:9729};static MinFilter={NEAREST:9728,LINEAR:9729,NEAREST_MIPMAP_NEAREST:9984,LINEAR_MIPMAP_NEAREST:9985,NEAREST_MIPMAP_LINEAR:9986,LINEAR_MIPMAP_LINEAR:9987};init(){this.propertyType="TextureInfo"}getDefaults(){return Object.assign(super.getDefaults(),{texCoord:0,magFilter:null,minFilter:null,wrapS:bs.WrapMode.REPEAT,wrapT:bs.WrapMode.REPEAT})}getTexCoord(){return this.get("texCoord")}setTexCoord(t){return this.set("texCoord",t)}getMagFilter(){return this.get("magFilter")}setMagFilter(t){return this.set("magFilter",t)}getMinFilter(){return this.get("minFilter")}setMinFilter(t){return this.set("minFilter",t)}getWrapS(){return this.get("wrapS")}setWrapS(t){return this.set("wrapS",t)}getWrapT(){return this.get("wrapT")}setWrapT(t){return this.set("wrapT",t)}},{R:da,G:la,B:fa,A:Oo}=Be,ga=class Lr extends ye{static AlphaMode={OPAQUE:"OPAQUE",MASK:"MASK",BLEND:"BLEND"};init(){this.propertyType="Material"}getDefaults(){return Object.assign(super.getDefaults(),{alphaMode:Lr.AlphaMode.OPAQUE,alphaCutoff:.5,doubleSided:!1,baseColorFactor:[1,1,1,1],baseColorTexture:null,baseColorTextureInfo:new ae(this.graph,"baseColorTextureInfo"),emissiveFactor:[0,0,0],emissiveTexture:null,emissiveTextureInfo:new ae(this.graph,"emissiveTextureInfo"),normalScale:1,normalTexture:null,normalTextureInfo:new ae(this.graph,"normalTextureInfo"),occlusionStrength:1,occlusionTexture:null,occlusionTextureInfo:new ae(this.graph,"occlusionTextureInfo"),roughnessFactor:1,metallicFactor:1,metallicRoughnessTexture:null,metallicRoughnessTextureInfo:new ae(this.graph,"metallicRoughnessTextureInfo")})}getDoubleSided(){return this.get("doubleSided")}setDoubleSided(t){return this.set("doubleSided",t)}getAlpha(){return this.get("baseColorFactor")[3]}setAlpha(t){let a=this.get("baseColorFactor").slice();return a[3]=t,this.set("baseColorFactor",a)}getAlphaMode(){return this.get("alphaMode")}setAlphaMode(t){return this.set("alphaMode",t)}getAlphaCutoff(){return this.get("alphaCutoff")}setAlphaCutoff(t){return this.set("alphaCutoff",t)}getBaseColorFactor(){return this.get("baseColorFactor")}setBaseColorFactor(t){return this.set("baseColorFactor",t)}getBaseColorTexture(){return this.getRef("baseColorTexture")}getBaseColorTextureInfo(){return this.getRef("baseColorTexture")?this.getRef("baseColorTextureInfo"):null}setBaseColorTexture(t){return this.setRef("baseColorTexture",t,{channels:da|la|fa|Oo,isColor:!0})}getEmissiveFactor(){return this.get("emissiveFactor")}setEmissiveFactor(t){return this.set("emissiveFactor",t)}getEmissiveTexture(){return this.getRef("emissiveTexture")}getEmissiveTextureInfo(){return this.getRef("emissiveTexture")?this.getRef("emissiveTextureInfo"):null}setEmissiveTexture(t){return this.setRef("emissiveTexture",t,{channels:da|la|fa,isColor:!0})}getNormalScale(){return this.get("normalScale")}setNormalScale(t){return this.set("normalScale",t)}getNormalTexture(){return this.getRef("normalTexture")}getNormalTextureInfo(){return this.getRef("normalTexture")?this.getRef("normalTextureInfo"):null}setNormalTexture(t){return this.setRef("normalTexture",t,{channels:da|la|fa})}getOcclusionStrength(){return this.get("occlusionStrength")}setOcclusionStrength(t){return this.set("occlusionStrength",t)}getOcclusionTexture(){return this.getRef("occlusionTexture")}getOcclusionTextureInfo(){return this.getRef("occlusionTexture")?this.getRef("occlusionTextureInfo"):null}setOcclusionTexture(t){return this.setRef("occlusionTexture",t,{channels:da})}getRoughnessFactor(){return this.get("roughnessFactor")}setRoughnessFactor(t){return this.set("roughnessFactor",t)}getMetallicFactor(){return this.get("metallicFactor")}setMetallicFactor(t){return this.set("metallicFactor",t)}getMetallicRoughnessTexture(){return this.getRef("metallicRoughnessTexture")}getMetallicRoughnessTextureInfo(){return this.getRef("metallicRoughnessTexture")?this.getRef("metallicRoughnessTextureInfo"):null}setMetallicRoughnessTexture(t){return this.setRef("metallicRoughnessTexture",t,{channels:la|fa})}},Kr=class extends ye{init(){this.propertyType="Mesh"}getDefaults(){return Object.assign(super.getDefaults(),{weights:[],primitives:new te})}addPrimitive(e){return this.addRef("primitives",e)}removePrimitive(e){return this.removeRef("primitives",e)}listPrimitives(){return this.listRefs("primitives")}getWeights(){return this.get("weights")}setWeights(e){return this.set("weights",e)}},Gr=class extends ye{init(){this.propertyType="Node"}getDefaults(){return Object.assign(super.getDefaults(),{translation:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1],weights:[],camera:null,mesh:null,skin:null,children:new te})}copy(e,t=Ze){if(t===Ze)throw new Error("Node cannot be copied.");return super.copy(e,t)}getTranslation(){return this.get("translation")}getRotation(){return this.get("rotation")}getScale(){return this.get("scale")}setTranslation(e){return this.set("translation",e)}setRotation(e){return this.set("rotation",e)}setScale(e){return this.set("scale",e)}getMatrix(){return re.compose(this.get("translation"),this.get("rotation"),this.get("scale"),[])}setMatrix(e){let t=this.get("translation").slice(),a=this.get("rotation").slice(),s=this.get("scale").slice();return re.decompose(e,t,a,s),this.set("translation",t).set("rotation",a).set("scale",s)}getWorldTranslation(){let e=[0,0,0];return re.decompose(this.getWorldMatrix(),e,[0,0,0,1],[1,1,1]),e}getWorldRotation(){let e=[0,0,0,1];return re.decompose(this.getWorldMatrix(),[0,0,0],e,[1,1,1]),e}getWorldScale(){let e=[1,1,1];return re.decompose(this.getWorldMatrix(),[0,0,0],[0,0,0,1],e),e}getWorldMatrix(){let e=[];for(let s=this;s!=null;s=s.getParentNode())e.push(s);let t,a=e.pop().getMatrix();for(;t=e.pop();)Eo(a,a,t.getMatrix());return a}addChild(e){let t=e.getParentNode();t&&t.removeChild(e);for(let a of e.listParents())a.propertyType==="Scene"&&a.removeChild(e);return this.addRef("children",e)}removeChild(e){return this.removeRef("children",e)}listChildren(){return this.listRefs("children")}getParentNode(){for(let e of this.listParents())if(e.propertyType==="Node")return e;return null}getMesh(){return this.getRef("mesh")}setMesh(e){return this.setRef("mesh",e)}getCamera(){return this.getRef("camera")}setCamera(e){return this.setRef("camera",e)}getSkin(){return this.getRef("skin")}setSkin(e){return this.setRef("skin",e)}getWeights(){return this.get("weights")}setWeights(e){return this.set("weights",e)}traverse(e){e(this);for(let t of this.listChildren())t.traverse(e);return this}},Dt=class Vr extends ye{static Mode={POINTS:0,LINES:1,LINE_LOOP:2,LINE_STRIP:3,TRIANGLES:4,TRIANGLE_STRIP:5,TRIANGLE_FAN:6};init(){this.propertyType="Primitive"}getDefaults(){return Object.assign(super.getDefaults(),{mode:Vr.Mode.TRIANGLES,material:null,indices:null,attributes:new ce,targets:new te})}getIndices(){return this.getRef("indices")}setIndices(t){return this.setRef("indices",t,{usage:"ELEMENT_ARRAY_BUFFER"})}getAttribute(t){return this.getRefMap("attributes",t)}setAttribute(t,a){return this.setRefMap("attributes",t,a,{usage:"ARRAY_BUFFER"})}listAttributes(){return this.listRefMapValues("attributes")}listSemantics(){return this.listRefMapKeys("attributes")}getMaterial(){return this.getRef("material")}setMaterial(t){return this.setRef("material",t)}getMode(){return this.get("mode")}setMode(t){return this.set("mode",t)}listTargets(){return this.listRefs("targets")}addTarget(t){return this.addRef("targets",t)}removeTarget(t){return this.removeRef("targets",t)}},Po=class extends ps{init(){this.propertyType="PrimitiveTarget"}getDefaults(){return Object.assign(super.getDefaults(),{attributes:new ce})}getAttribute(e){return this.getRefMap("attributes",e)}setAttribute(e,t){return this.setRefMap("attributes",e,t,{usage:"ARRAY_BUFFER"})}listAttributes(){return this.listRefMapValues("attributes")}listSemantics(){return this.listRefMapKeys("attributes")}},zr=class extends ye{init(){this.propertyType="Scene"}getDefaults(){return Object.assign(super.getDefaults(),{children:new te})}copy(e,t=Ze){if(t===Ze)throw new Error("Scene cannot be copied.");return super.copy(e,t)}addChild(e){let t=e.getParentNode();return t&&t.removeChild(e),this.addRef("children",e)}removeChild(e){return this.removeRef("children",e)}listChildren(){return this.listRefs("children")}traverse(e){for(let t of this.listChildren())t.traverse(e);return this}},Hr=class extends ye{init(){this.propertyType="Skin"}getDefaults(){return Object.assign(super.getDefaults(),{skeleton:null,inverseBindMatrices:null,joints:new te})}getSkeleton(){return this.getRef("skeleton")}setSkeleton(e){return this.setRef("skeleton",e)}getInverseBindMatrices(){return this.getRef("inverseBindMatrices")}setInverseBindMatrices(e){return this.setRef("inverseBindMatrices",e,{usage:"INVERSE_BIND_MATRICES"})}addJoint(e){return this.addRef("joints",e)}removeJoint(e){return this.removeRef("joints",e)}listJoints(){return this.listRefs("joints")}},qr=class extends ye{init(){this.propertyType="Texture"}getDefaults(){return Object.assign(super.getDefaults(),{image:null,mimeType:"",uri:""})}getMimeType(){return this.get("mimeType")||Le.extensionToMimeType(Mt.extension(this.get("uri")))}setMimeType(e){return this.set("mimeType",e)}getURI(){return this.get("uri")}setURI(e){this.set("uri",e);let t=Le.extensionToMimeType(Mt.extension(e));return t&&this.set("mimeType",t),this}getImage(){return this.get("image")}setImage(e){return this.set("image",G.assertView(e))}getSize(){let e=this.get("image");return e?Le.getSize(e,this.getMimeType()):null}},ys=class extends ye{_extensions=new Set;init(){this.propertyType="Root"}getDefaults(){return Object.assign(super.getDefaults(),{asset:{generator:`glTF-Transform ${Sr}`,version:"2.0"},defaultScene:null,accessors:new te,animations:new te,buffers:new te,cameras:new te,materials:new te,meshes:new te,nodes:new te,scenes:new te,skins:new te,textures:new te})}constructor(e){super(e),e.addEventListener("node:create",t=>{this._addChildOfRoot(t.target)})}clone(){throw new Error("Root cannot be cloned.")}copy(e,t=Ze){if(t===Ze)throw new Error("Root cannot be copied.");this.set("asset",{...e.get("asset")}),this.setName(e.getName()),this.setExtras({...e.getExtras()}),this.setDefaultScene(e.getDefaultScene()?t(e.getDefaultScene()):null);for(let a of e.listRefMapKeys("extensions")){let s=e.getExtension(a);this.setExtension(a,t(s))}return this}_addChildOfRoot(e){return e instanceof zr?this.addRef("scenes",e):e instanceof Gr?this.addRef("nodes",e):e instanceof xa?this.addRef("cameras",e):e instanceof Hr?this.addRef("skins",e):e instanceof Kr?this.addRef("meshes",e):e instanceof ga?this.addRef("materials",e):e instanceof qr?this.addRef("textures",e):e instanceof Or?this.addRef("animations",e):e instanceof L?this.addRef("accessors",e):e instanceof Dr&&this.addRef("buffers",e),this}getAsset(){return this.get("asset")}listExtensionsUsed(){return Array.from(this._extensions)}listExtensionsRequired(){return this.listExtensionsUsed().filter(e=>e.isRequired())}_enableExtension(e){return this._extensions.add(e),this}_disableExtension(e){return this._extensions.delete(e),this}listScenes(){return this.listRefs("scenes")}setDefaultScene(e){return this.setRef("defaultScene",e)}getDefaultScene(){return this.getRef("defaultScene")}listNodes(){return this.listRefs("nodes")}listCameras(){return this.listRefs("cameras")}listSkins(){return this.listRefs("skins")}listMeshes(){return this.listRefs("meshes")}listMaterials(){return this.listRefs("materials")}listTextures(){return this.listRefs("textures")}listAnimations(){return this.listRefs("animations")}listAccessors(){return this.listRefs("accessors")}listBuffers(){return this.listRefs("buffers")}},Do=class gs{_graph=new ds;_root=new ys(this._graph);_logger=ma.DEFAULT_INSTANCE;static _GRAPH_DOCUMENTS=new WeakMap;static fromGraph(t){return gs._GRAPH_DOCUMENTS.get(t)||null}constructor(){gs._GRAPH_DOCUMENTS.set(this._graph,this)}getRoot(){return this._root}getGraph(){return this._graph}getLogger(){return this._logger}setLogger(t){return this._logger=t,this}clone(){throw new Error("Use 'cloneDocument(source)' from '@gltf-transform/functions'.")}merge(t){throw new Error("Use 'mergeDocuments(target, source)' from '@gltf-transform/functions'.")}async transform(...t){let a=t.map(s=>s.name);for(let s of t)await s(this,{stack:a});return this}hasExtension(t){return this.getRoot().listExtensionsUsed().some(a=>a.extensionName===t)}createExtension(t){let a=t.EXTENSION_NAME;return this.getRoot().listExtensionsUsed().find(s=>s.extensionName===a)||new t(this)}disposeExtension(t){let a=this.getRoot().listExtensionsUsed().find(s=>s.extensionName===t);a&&a.dispose()}createScene(t=""){return new zr(this._graph,t)}createNode(t=""){return new Gr(this._graph,t)}createCamera(t=""){return new xa(this._graph,t)}createSkin(t=""){return new Hr(this._graph,t)}createMesh(t=""){return new Kr(this._graph,t)}createPrimitive(){return new Dt(this._graph)}createPrimitiveTarget(t=""){return new Po(this._graph,t)}createMaterial(t=""){return new ga(this._graph,t)}createTexture(t=""){return new qr(this._graph,t)}createAnimation(t=""){return new Or(this._graph,t)}createAnimationChannel(t=""){return new ms(this._graph,t)}createAnimationSampler(t=""){return new ya(this._graph,t)}createAccessor(t="",a=null){return a||(a=this.getRoot().listBuffers()[0]),new L(this._graph,t).setBuffer(a)}createBuffer(t=""){return new Dr(this._graph,t)}},Z=class{static EXTENSION_NAME;extensionName="";prereadTypes=[];prewriteTypes=[];readDependencies=[];writeDependencies=[];document;required=!1;properties=new Set;_listener;constructor(e){this.document=e,e.getRoot()._enableExtension(this),this._listener=a=>{let s=a,r=s.target;r instanceof z&&r.extensionName===this.extensionName&&(s.type==="node:create"&&this._addExtensionProperty(r),s.type==="node:dispose"&&this._removeExtensionProperty(r))};let t=e.getGraph();t.addEventListener("node:create",this._listener),t.addEventListener("node:dispose",this._listener)}dispose(){this.document.getRoot()._disableExtension(this);let e=this.document.getGraph();e.removeEventListener("node:create",this._listener),e.removeEventListener("node:dispose",this._listener);for(let t of this.properties)t.dispose()}static register(){}isRequired(){return this.required}setRequired(e){return this.required=e,this}listProperties(){return Array.from(this.properties)}_addExtensionProperty(e){return this.properties.add(e),this}_removeExtensionProperty(e){return this.properties.delete(e),this}install(e,t){return this}preread(e,t){return this}prewrite(e,t){return this}},Uo=class{jsonDoc;buffers=[];bufferViews=[];bufferViewBuffers=[];accessors=[];textures=[];textureInfos=new Map;materials=[];meshes=[];cameras=[];nodes=[];skins=[];animations=[];scenes=[];constructor(e){this.jsonDoc=e}setTextureInfo(e,t){this.textureInfos.set(e,t),t.texCoord!==void 0&&e.setTexCoord(t.texCoord),t.extras!==void 0&&e.setExtras(t.extras);let a=this.jsonDoc.json.textures[t.index];if(a.sampler===void 0)return;let s=this.jsonDoc.json.samplers[a.sampler];s.magFilter!==void 0&&e.setMagFilter(s.magFilter),s.minFilter!==void 0&&e.setMinFilter(s.minFilter),s.wrapS!==void 0&&e.setWrapS(s.wrapS),s.wrapT!==void 0&&e.setWrapT(s.wrapT)}},Rr={logger:ma.DEFAULT_INSTANCE,extensions:[],dependencies:{}},Lo=new Set(["Buffer","Texture","Material","Mesh","Primitive","Node","Scene"]),Ko=class{static read(e,t=Rr){let a={...Rr,...t},{json:s}=e,r=new Do().setLogger(a.logger);this.validate(e,a);let n=new Uo(e),i=s.asset,o=r.getRoot().getAsset();i.copyright&&(o.copyright=i.copyright),i.extras&&(o.extras=i.extras),s.extras!==void 0&&r.getRoot().setExtras({...s.extras});let c=s.extensionsUsed||[],l=s.extensionsRequired||[];a.extensions.sort((f,h)=>f.EXTENSION_NAME>h.EXTENSION_NAME?1:-1);for(let f of a.extensions)if(c.includes(f.EXTENSION_NAME)){let h=r.createExtension(f).setRequired(l.includes(f.EXTENSION_NAME)),y=h.prereadTypes.filter(w=>!Lo.has(w));y.length&&a.logger.warn(`Preread hooks for some types (${y.join()}), requested by extension ${h.extensionName}, are unsupported. Please file an issue or a PR.`);for(let w of h.readDependencies)h.install(w,a.dependencies[w])}let p=s.buffers||[];r.getRoot().listExtensionsUsed().filter(f=>f.prereadTypes.includes("Buffer")).forEach(f=>f.preread(n,"Buffer")),n.buffers=p.map(f=>{let h=r.createBuffer(f.name);return f.extras&&h.setExtras(f.extras),f.uri&&f.uri.indexOf("__")!==0&&h.setURI(f.uri),h}),n.bufferViewBuffers=(s.bufferViews||[]).map((f,h)=>{if(!n.bufferViews[h]){let y=e.json.buffers[f.buffer],w=y.uri?e.resources[y.uri]:e.resources[Qe],T=f.byteOffset||0;n.bufferViews[h]=G.toView(w,T,f.byteLength)}return n.buffers[f.buffer]});let g=s.accessors||[];n.accessors=g.map(f=>{let h=n.bufferViewBuffers[f.bufferView],y=r.createAccessor(f.name,h).setType(f.type);return f.extras&&y.setExtras(f.extras),f.normalized!==void 0&&y.setNormalized(f.normalized),f.bufferView===void 0||y.setArray(ha(f,n)),y});let v=s.images||[],x=s.textures||[];r.getRoot().listExtensionsUsed().filter(f=>f.prereadTypes.includes("Texture")).forEach(f=>f.preread(n,"Texture")),n.textures=v.map(f=>{let h=r.createTexture(f.name);if(f.extras&&h.setExtras(f.extras),f.bufferView!==void 0){let y=s.bufferViews[f.bufferView],w=e.json.buffers[y.buffer],T=w.uri?e.resources[w.uri]:e.resources[Qe],E=y.byteOffset||0,R=y.byteLength,I=T.slice(E,E+R);h.setImage(I)}else f.uri!==void 0&&(h.setImage(e.resources[f.uri]),f.uri.indexOf("__")!==0&&h.setURI(f.uri));if(f.mimeType!==void 0)h.setMimeType(f.mimeType);else if(f.uri){let y=Mt.extension(f.uri);h.setMimeType(Le.extensionToMimeType(y))}return h}),r.getRoot().listExtensionsUsed().filter(f=>f.prereadTypes.includes("Material")).forEach(f=>f.preread(n,"Material")),n.materials=(s.materials||[]).map(f=>{let h=r.createMaterial(f.name);f.extras&&h.setExtras(f.extras),f.alphaMode!==void 0&&h.setAlphaMode(f.alphaMode),f.alphaCutoff!==void 0&&h.setAlphaCutoff(f.alphaCutoff),f.doubleSided!==void 0&&h.setDoubleSided(f.doubleSided);let y=f.pbrMetallicRoughness||{};if(y.baseColorFactor!==void 0&&h.setBaseColorFactor(y.baseColorFactor),f.emissiveFactor!==void 0&&h.setEmissiveFactor(f.emissiveFactor),y.metallicFactor!==void 0&&h.setMetallicFactor(y.metallicFactor),y.roughnessFactor!==void 0&&h.setRoughnessFactor(y.roughnessFactor),y.baseColorTexture!==void 0){let w=y.baseColorTexture,T=n.textures[x[w.index].source];h.setBaseColorTexture(T),n.setTextureInfo(h.getBaseColorTextureInfo(),w)}if(f.emissiveTexture!==void 0){let w=f.emissiveTexture,T=n.textures[x[w.index].source];h.setEmissiveTexture(T),n.setTextureInfo(h.getEmissiveTextureInfo(),w)}if(f.normalTexture!==void 0){let w=f.normalTexture,T=n.textures[x[w.index].source];h.setNormalTexture(T),n.setTextureInfo(h.getNormalTextureInfo(),w),f.normalTexture.scale!==void 0&&h.setNormalScale(f.normalTexture.scale)}if(f.occlusionTexture!==void 0){let w=f.occlusionTexture,T=n.textures[x[w.index].source];h.setOcclusionTexture(T),n.setTextureInfo(h.getOcclusionTextureInfo(),w),f.occlusionTexture.strength!==void 0&&h.setOcclusionStrength(f.occlusionTexture.strength)}if(y.metallicRoughnessTexture!==void 0){let w=y.metallicRoughnessTexture,T=n.textures[x[w.index].source];h.setMetallicRoughnessTexture(T),n.setTextureInfo(h.getMetallicRoughnessTextureInfo(),w)}return h}),r.getRoot().listExtensionsUsed().filter(f=>f.prereadTypes.includes("Mesh")).forEach(f=>f.preread(n,"Mesh"));let u=s.meshes||[];r.getRoot().listExtensionsUsed().filter(f=>f.prereadTypes.includes("Primitive")).forEach(f=>f.preread(n,"Primitive")),n.meshes=u.map(f=>{let h=r.createMesh(f.name);return f.extras&&h.setExtras(f.extras),f.weights!==void 0&&h.setWeights(f.weights),(f.primitives||[]).forEach(y=>{let w=r.createPrimitive();y.extras&&w.setExtras(y.extras),y.material!==void 0&&w.setMaterial(n.materials[y.material]),y.mode!==void 0&&w.setMode(y.mode);for(let[E,R]of Object.entries(y.attributes||{}))w.setAttribute(E,n.accessors[R]);y.indices!==void 0&&w.setIndices(n.accessors[y.indices]);let T=f.extras&&f.extras.targetNames||[];(y.targets||[]).forEach((E,R)=>{let I=T[R]||R.toString(),_=r.createPrimitiveTarget(I);for(let[A,j]of Object.entries(E))_.setAttribute(A,n.accessors[j]);w.addTarget(_)}),h.addPrimitive(w)}),h}),n.cameras=(s.cameras||[]).map(f=>{let h=r.createCamera(f.name).setType(f.type);if(f.extras&&h.setExtras(f.extras),f.type===xa.Type.PERSPECTIVE){let y=f.perspective;h.setYFov(y.yfov),h.setZNear(y.znear),y.zfar!==void 0&&h.setZFar(y.zfar),y.aspectRatio!==void 0&&h.setAspectRatio(y.aspectRatio)}else{let y=f.orthographic;h.setZNear(y.znear).setZFar(y.zfar).setXMag(y.xmag).setYMag(y.ymag)}return h});let d=s.nodes||[];r.getRoot().listExtensionsUsed().filter(f=>f.prereadTypes.includes("Node")).forEach(f=>f.preread(n,"Node")),n.nodes=d.map(f=>{let h=r.createNode(f.name);if(f.extras&&h.setExtras(f.extras),f.translation!==void 0&&h.setTranslation(f.translation),f.rotation!==void 0&&h.setRotation(f.rotation),f.scale!==void 0&&h.setScale(f.scale),f.matrix!==void 0){let y=[0,0,0],w=[0,0,0,1],T=[1,1,1];re.decompose(f.matrix,y,w,T),h.setTranslation(y),h.setRotation(w),h.setScale(T)}return f.weights!==void 0&&h.setWeights(f.weights),h}),n.skins=(s.skins||[]).map(f=>{let h=r.createSkin(f.name);f.extras&&h.setExtras(f.extras),f.inverseBindMatrices!==void 0&&h.setInverseBindMatrices(n.accessors[f.inverseBindMatrices]),f.skeleton!==void 0&&h.setSkeleton(n.nodes[f.skeleton]);for(let y of f.joints)h.addJoint(n.nodes[y]);return h}),d.map((f,h)=>{let y=n.nodes[h];(f.children||[]).forEach(w=>y.addChild(n.nodes[w])),f.mesh!==void 0&&y.setMesh(n.meshes[f.mesh]),f.camera!==void 0&&y.setCamera(n.cameras[f.camera]),f.skin!==void 0&&y.setSkin(n.skins[f.skin])}),n.animations=(s.animations||[]).map(f=>{let h=r.createAnimation(f.name);f.extras&&h.setExtras(f.extras);let y=(f.samplers||[]).map(w=>{let T=r.createAnimationSampler().setInput(n.accessors[w.input]).setOutput(n.accessors[w.output]).setInterpolation(w.interpolation||ya.Interpolation.LINEAR);return w.extras&&T.setExtras(w.extras),h.addSampler(T),T});return(f.channels||[]).forEach(w=>{let T=r.createAnimationChannel().setSampler(y[w.sampler]).setTargetPath(w.target.path);w.target.node!==void 0&&T.setTargetNode(n.nodes[w.target.node]),w.extras&&T.setExtras(w.extras),h.addChannel(T)}),h});let m=s.scenes||[];return r.getRoot().listExtensionsUsed().filter(f=>f.prereadTypes.includes("Scene")).forEach(f=>f.preread(n,"Scene")),n.scenes=m.map(f=>{let h=r.createScene(f.name);return f.extras&&h.setExtras(f.extras),(f.nodes||[]).map(y=>n.nodes[y]).forEach(y=>h.addChild(y)),h}),s.scene!==void 0&&r.getRoot().setDefaultScene(n.scenes[s.scene]),r.getRoot().listExtensionsUsed().forEach(f=>f.read(n)),g.forEach((f,h)=>{let y=n.accessors[h],w=!!f.sparse,T=!f.bufferView&&!y.getArray();(w||T)&&y.setSparse(!0).setArray(Vo(f,n))}),r}static validate(e,t){let a=e.json;if(a.asset.version!=="2.0")throw new Error(`Unsupported glTF version, "${a.asset.version}".`);if(a.extensionsRequired){for(let s of a.extensionsRequired)if(!t.extensions.find(r=>r.EXTENSION_NAME===s))throw new Error(`Missing required extension, "${s}".`)}if(a.extensionsUsed)for(let s of a.extensionsUsed)t.extensions.find(r=>r.EXTENSION_NAME===s)||t.logger.warn(`Missing optional extension, "${s}".`)}};function Go(e,t){let a=t.jsonDoc,s=t.bufferViews[e.bufferView],r=a.json.bufferViews[e.bufferView],n=pa[e.componentType],i=L.getElementSize(e.type),o=n.BYTES_PER_ELEMENT,c=e.byteOffset||0,l=new n(e.count*i),p=new DataView(s.buffer,s.byteOffset,s.byteLength),g=r.byteStride;for(let v=0;v<e.count;v++)for(let x=0;x<i;x++){let u=c+v*g+x*o,d;switch(e.componentType){case L.ComponentType.FLOAT:d=p.getFloat32(u,!0);break;case L.ComponentType.UNSIGNED_INT:d=p.getUint32(u,!0);break;case L.ComponentType.UNSIGNED_SHORT:d=p.getUint16(u,!0);break;case L.ComponentType.UNSIGNED_BYTE:d=p.getUint8(u);break;case L.ComponentType.SHORT:d=p.getInt16(u,!0);break;case L.ComponentType.BYTE:d=p.getInt8(u);break;case L.ComponentType.FLOAT16:d=p.getFloat16(u,!0);break;case L.ComponentType.FLOAT64:d=p.getFloat64(u,!0);break;default:throw new Error(`Unexpected componentType "${e.componentType}".`)}l[v*i+x]=d}return l}function ha(e,t){let a=t.jsonDoc,s=t.bufferViews[e.bufferView],r=a.json.bufferViews[e.bufferView],n=pa[e.componentType],i=L.getElementSize(e.type),o=n.BYTES_PER_ELEMENT,c=i*o;if(r.byteStride!==void 0&&r.byteStride!==c)return Go(e,t);let l=s.byteOffset+(e.byteOffset||0),p=e.count*i*o;return new n(s.buffer.slice(l,l+p))}function Vo(e,t){let a=pa[e.componentType],s=L.getElementSize(e.type),r;e.bufferView!==void 0?r=ha(e,t):r=new a(e.count*s);let n=e.sparse;if(!n)return r;let i=n.count,o={...e,...n.indices,count:i,type:"SCALAR"},c={...e,...n.values,count:i},l=ha(o,t),p=ha(c,t);for(let g=0;g<o.count;g++)for(let v=0;v<s;v++)r[l[g]*s+v]=p[g*s+v];return r}var Xr=(function(e){return e[e.ARRAY_BUFFER=34962]="ARRAY_BUFFER",e[e.ELEMENT_ARRAY_BUFFER=34963]="ELEMENT_ARRAY_BUFFER",e})(Xr||{}),$e=class{_doc;jsonDoc;options;static BufferViewTarget=Xr;static BufferViewUsage=ho;static USAGE_TO_TARGET={ARRAY_BUFFER:34962,ELEMENT_ARRAY_BUFFER:34963};accessorIndexMap=new Map;animationIndexMap=new Map;bufferIndexMap=new Map;cameraIndexMap=new Map;skinIndexMap=new Map;materialIndexMap=new Map;meshIndexMap=new Map;nodeIndexMap=new Map;imageIndexMap=new Map;textureDefIndexMap=new Map;textureInfoDefMap=new Map;samplerDefIndexMap=new Map;sceneIndexMap=new Map;imageBufferViews=[];otherBufferViews=new Map;otherBufferViewsIndexMap=new Map;extensionData={};bufferURIGenerator;imageURIGenerator;logger;_accessorUsageMap=new Map;accessorUsageGroupedByParent=new Set(["ARRAY_BUFFER"]);accessorParents=new Map;constructor(e,t,a){this._doc=e,this.jsonDoc=t,this.options=a;let s=e.getRoot(),r=s.listBuffers().length,n=s.listTextures().length;this.bufferURIGenerator=new Ir(r>1,()=>a.basename||"buffer"),this.imageURIGenerator=new Ir(n>1,i=>zo(e,i)||a.basename||"texture"),this.logger=e.getLogger()}createTextureInfoDef(e,t){let a={magFilter:t.getMagFilter()||void 0,minFilter:t.getMinFilter()||void 0,wrapS:t.getWrapS(),wrapT:t.getWrapT()},s=JSON.stringify(a);this.samplerDefIndexMap.has(s)||(this.samplerDefIndexMap.set(s,this.jsonDoc.json.samplers.length),this.jsonDoc.json.samplers.push(a));let r={source:this.imageIndexMap.get(e),sampler:this.samplerDefIndexMap.get(s)},n=JSON.stringify(r);this.textureDefIndexMap.has(n)||(this.textureDefIndexMap.set(n,this.jsonDoc.json.textures.length),this.jsonDoc.json.textures.push(r));let i={index:this.textureDefIndexMap.get(n)};return t.getTexCoord()!==0&&(i.texCoord=t.getTexCoord()),Object.keys(t.getExtras()).length>0&&(i.extras=t.getExtras()),this.textureInfoDefMap.set(t,i),i}createPropertyDef(e){let t={};return e.getName()&&(t.name=e.getName()),Object.keys(e.getExtras()).length>0&&(t.extras=e.getExtras()),t}createAccessorDef(e){let t=this.createPropertyDef(e);return t.type=e.getType(),t.componentType=e.getComponentType(),t.count=e.getCount(),this._doc.getGraph().listParentEdges(e).some(a=>a.getName()==="attributes"&&a.getAttributes().key==="POSITION"||a.getName()==="input")&&(t.max=e.getMax([]).map(Math.fround),t.min=e.getMin([]).map(Math.fround)),e.getNormalized()&&(t.normalized=e.getNormalized()),t}createImageData(e,t,a){if(this.options.format==="GLB")this.imageBufferViews.push(t),e.bufferView=this.jsonDoc.json.bufferViews.length,this.jsonDoc.json.bufferViews.push({buffer:0,byteOffset:-1,byteLength:t.byteLength});else{let s=Le.mimeTypeToExtension(a.getMimeType());e.uri=this.imageURIGenerator.createURI(a,s),this.assignResourceURI(e.uri,t,!1)}}assignResourceURI(e,t,a){let s=this.jsonDoc.resources;if(!(e in s)){s[e]=t;return}if(t===s[e]){this.logger.warn(`Duplicate resource URI, "${e}".`);return}let r=`Resource URI "${e}" already assigned to different data.`;if(!a){this.logger.warn(r);return}throw new Error(r)}getAccessorUsage(e){let t=this._accessorUsageMap.get(e);if(t)return t;if(e.getSparse())return"SPARSE";for(let a of this._doc.getGraph().listParentEdges(e)){let{usage:s}=a.getAttributes();if(s)return s;a.getParent().propertyType!=="Root"&&this.logger.warn(`Missing attribute ".usage" on edge, "${a.getName()}".`)}return"OTHER"}addAccessorToUsageGroup(e,t){let a=this._accessorUsageMap.get(e);if(a&&a!==t)throw new Error(`Accessor with usage "${a}" cannot be reused as "${t}".`);return this._accessorUsageMap.set(e,t),this}},Ir=class{multiple;basename;counter={};constructor(e,t){this.multiple=e,this.basename=t}createURI(e,t){if(e.getURI())return e.getURI();if(this.multiple){let a=this.basename(e);return this.counter[a]=this.counter[a]||1,`${a}_${this.counter[a]++}.${t}`}else return`${this.basename(e)}.${t}`}};function zo(e,t){let a=e.getGraph().listParentEdges(t).find(s=>s.getParent()!==e.getRoot());return a?a.getName().replace(/texture$/i,""):""}var{BufferViewUsage:ua}=$e,{UNSIGNED_INT:Ho,UNSIGNED_SHORT:qo,UNSIGNED_BYTE:Xo}=L.ComponentType,Wo=new Set(["Accessor","Buffer","Material","Mesh"]),Jo=class{static write(e,t){let a=e.getGraph(),s=e.getRoot(),r={asset:{generator:`glTF-Transform ${Sr}`,...s.getAsset()},extras:{...s.getExtras()}},n={json:r,resources:{}},i=new $e(e,n,t),o=t.logger||ma.DEFAULT_INSTANCE,c=new Set(t.extensions.map(d=>d.EXTENSION_NAME)),l=e.getRoot().listExtensionsUsed().filter(d=>c.has(d.extensionName)).sort((d,m)=>d.extensionName>m.extensionName?1:-1),p=e.getRoot().listExtensionsRequired().filter(d=>c.has(d.extensionName)).sort((d,m)=>d.extensionName>m.extensionName?1:-1);l.length<e.getRoot().listExtensionsUsed().length&&o.warn("Some extensions were not registered for I/O, and will not be written.");for(let d of l){let m=d.prewriteTypes.filter(f=>!Wo.has(f));m.length&&o.warn(`Prewrite hooks for some types (${m.join()}), requested by extension ${d.extensionName}, are unsupported. Please file an issue or a PR.`);for(let f of d.writeDependencies)d.install(f,t.dependencies[f])}function g(d,m,f,h){let y=[],w=0;for(let E of d){let R=i.createAccessorDef(E);R.bufferView=r.bufferViews.length;let I=E.getArray(),_=G.pad(G.toView(I));R.byteOffset=w,w+=_.byteLength,y.push(_),i.accessorIndexMap.set(E,r.accessors.length),r.accessors.push(R)}let T={buffer:m,byteOffset:f,byteLength:G.concat(y).byteLength};return h&&(T.target=h),r.bufferViews.push(T),{buffers:y,byteLength:w}}function v(d,m,f){let h=d[0].getCount(),y=0;for(let I of d){let _=i.createAccessorDef(I);_.bufferView=r.bufferViews.length,_.byteOffset=y;let A=I.getElementSize(),j=I.getComponentSize();y+=G.padNumber(A*j),i.accessorIndexMap.set(I,r.accessors.length),r.accessors.push(_)}let w=h*y,T=new ArrayBuffer(w),E=new DataView(T);for(let I=0;I<h;I++){let _=0;for(let A of d){let j=A.getElementSize(),P=A.getComponentSize(),F=A.getComponentType(),C=A.getArray();for(let H=0;H<j;H++){let se=I*y+_+H*P,ie=C[I*j+H];switch(F){case L.ComponentType.FLOAT:E.setFloat32(se,ie,!0);break;case L.ComponentType.BYTE:E.setInt8(se,ie);break;case L.ComponentType.SHORT:E.setInt16(se,ie,!0);break;case L.ComponentType.UNSIGNED_BYTE:E.setUint8(se,ie);break;case L.ComponentType.UNSIGNED_SHORT:E.setUint16(se,ie,!0);break;case L.ComponentType.UNSIGNED_INT:E.setUint32(se,ie,!0);break;case L.ComponentType.FLOAT16:E.setFloat16(se,ie,!0);break;case L.ComponentType.FLOAT64:E.setFloat64(se,ie,!0);break;default:throw new Error("Unexpected component type: "+F)}}_+=G.padNumber(j*P)}}let R={buffer:m,byteOffset:f,byteLength:w,byteStride:y,target:$e.BufferViewTarget.ARRAY_BUFFER};return r.bufferViews.push(R),{byteLength:w,buffers:[new Uint8Array(T)]}}function x(d,m,f){let h=[],y=0,w=new Map,T=-1/0,E=!1;for(let F of d){let C=i.createAccessorDef(F);r.accessors.push(C),i.accessorIndexMap.set(F,r.accessors.length-1);let H=[],se=[],ie=[],Ue=new Array(F.getElementSize()).fill(0);for(let q=0,le=F.getCount();q<le;q++)if(F.getElement(q,ie),!re.eq(ie,Ue,0)){T=Math.max(q,T),H.push(q);for(let me=0;me<ie.length;me++)se.push(ie[me])}let k=H.length,B={accessorDef:C,count:k};if(w.set(F,B),k===0)continue;k>F.getCount()/2&&(E=!0);let U=pa[F.getComponentType()];B.indices=H,B.values=new U(se)}if(!Number.isFinite(T))return{buffers:h,byteLength:y};E&&o.warn("Some sparse accessors have >50% non-zero elements, which may increase file size.");let R=T<255?Uint8Array:T<65535?Uint16Array:Uint32Array,I=T<255?Xo:T<65535?qo:Ho,_={buffer:m,byteOffset:f+y,byteLength:0};for(let F of d){let C=w.get(F);if(C.count===0)continue;C.indicesByteOffset=_.byteLength;let H=G.pad(G.toView(new R(C.indices)));h.push(H),y+=H.byteLength,_.byteLength+=H.byteLength}r.bufferViews.push(_);let A=r.bufferViews.length-1,j={buffer:m,byteOffset:f+y,byteLength:0};for(let F of d){let C=w.get(F);if(C.count===0)continue;C.valuesByteOffset=j.byteLength;let H=G.pad(G.toView(C.values));h.push(H),y+=H.byteLength,j.byteLength+=H.byteLength}r.bufferViews.push(j);let P=r.bufferViews.length-1;for(let F of d){let C=w.get(F);C.count!==0&&(C.accessorDef.sparse={count:C.count,indices:{bufferView:A,byteOffset:C.indicesByteOffset,componentType:I},values:{bufferView:P,byteOffset:C.valuesByteOffset}})}return{buffers:h,byteLength:y}}if(r.accessors=[],r.bufferViews=[],r.samplers=[],r.textures=[],r.images=s.listTextures().map((d,m)=>{let f=i.createPropertyDef(d);d.getMimeType()&&(f.mimeType=d.getMimeType());let h=d.getImage();return h&&i.createImageData(f,h,d),i.imageIndexMap.set(d,m),f}),l.filter(d=>d.prewriteTypes.includes("Accessor")).forEach(d=>d.prewrite(i,"Accessor")),s.listAccessors().forEach(d=>{let m=i.accessorUsageGroupedByParent,f=i.accessorParents;if(i.accessorIndexMap.has(d))return;let h=i.getAccessorUsage(d);if(i.addAccessorToUsageGroup(d,h),m.has(h)){let y=a.listParents(d).find(w=>w.propertyType!=="Root");f.set(d,y)}}),l.filter(d=>d.prewriteTypes.includes("Buffer")).forEach(d=>d.prewrite(i,"Buffer")),(s.listAccessors().length>0||i.otherBufferViews.size>0||s.listTextures().length>0&&t.format==="GLB")&&s.listBuffers().length===0)throw new Error("Buffer required for Document resources, but none was found.");r.buffers=[],s.listBuffers().forEach((d,m)=>{let f=i.createPropertyDef(d),h=i.accessorUsageGroupedByParent,y=d.listParents().filter(A=>A instanceof L),w=new Set(y.map(A=>i.accessorParents.get(A))),T=new Map(Array.from(w).map((A,j)=>[A,j])),E={};for(let A of y){if(i.accessorIndexMap.has(A))continue;let j=i.getAccessorUsage(A),P=j;if(h.has(j)){let F=i.accessorParents.get(A);P+=`:${T.get(F)}`}E[P]||={usage:j,accessors:[]},E[P].accessors.push(A)}let R=[],I=r.buffers.length,_=0;for(let{usage:A,accessors:j}of Object.values(E))if(A===ua.ARRAY_BUFFER&&t.vertexLayout==="interleaved"){let P=v(j,I,_);_+=P.byteLength;for(let F of P.buffers)R.push(F)}else if(A===ua.ARRAY_BUFFER)for(let P of j){let F=v([P],I,_);_+=F.byteLength;for(let C of F.buffers)R.push(C)}else if(A===ua.SPARSE){let P=x(j,I,_);_+=P.byteLength;for(let F of P.buffers)R.push(F)}else if(A===ua.ELEMENT_ARRAY_BUFFER){let P=$e.BufferViewTarget.ELEMENT_ARRAY_BUFFER,F=g(j,I,_,P);_+=F.byteLength;for(let C of F.buffers)R.push(C)}else{let P=g(j,I,_);_+=P.byteLength;for(let F of P.buffers)R.push(F)}if(i.imageBufferViews.length&&m===0){for(let A=0;A<i.imageBufferViews.length;A++)if(r.bufferViews[r.images[A].bufferView].byteOffset=_,_+=i.imageBufferViews[A].byteLength,R.push(i.imageBufferViews[A]),_%8){let j=8-_%8;_+=j,R.push(new Uint8Array(j))}}if(i.otherBufferViews.has(d))for(let A of i.otherBufferViews.get(d))r.bufferViews.push({buffer:I,byteOffset:_,byteLength:A.byteLength}),i.otherBufferViewsIndexMap.set(A,r.bufferViews.length-1),_+=A.byteLength,R.push(A);if(_){let A;t.format==="GLB"?A=Qe:(A=i.bufferURIGenerator.createURI(d,"bin"),f.uri=A),f.byteLength=_,i.assignResourceURI(A,G.concat(R),!0)}r.buffers.push(f),i.bufferIndexMap.set(d,m)}),s.listAccessors().find(d=>!d.getBuffer())&&o.warn("Skipped writing one or more Accessors: no Buffer assigned."),l.filter(d=>d.prewriteTypes.includes("Material")).forEach(d=>d.prewrite(i,"Material")),r.materials=s.listMaterials().map((d,m)=>{let f=i.createPropertyDef(d);if(d.getAlphaMode()!==ga.AlphaMode.OPAQUE&&(f.alphaMode=d.getAlphaMode()),d.getAlphaMode()===ga.AlphaMode.MASK&&(f.alphaCutoff=d.getAlphaCutoff()),d.getDoubleSided()&&(f.doubleSided=!0),f.pbrMetallicRoughness={},re.eq(d.getBaseColorFactor(),[1,1,1,1])||(f.pbrMetallicRoughness.baseColorFactor=d.getBaseColorFactor()),re.eq(d.getEmissiveFactor(),[0,0,0])||(f.emissiveFactor=d.getEmissiveFactor()),d.getRoughnessFactor()!==1&&(f.pbrMetallicRoughness.roughnessFactor=d.getRoughnessFactor()),d.getMetallicFactor()!==1&&(f.pbrMetallicRoughness.metallicFactor=d.getMetallicFactor()),d.getBaseColorTexture()){let h=d.getBaseColorTexture(),y=d.getBaseColorTextureInfo();f.pbrMetallicRoughness.baseColorTexture=i.createTextureInfoDef(h,y)}if(d.getEmissiveTexture()){let h=d.getEmissiveTexture(),y=d.getEmissiveTextureInfo();f.emissiveTexture=i.createTextureInfoDef(h,y)}if(d.getNormalTexture()){let h=d.getNormalTexture(),y=d.getNormalTextureInfo(),w=i.createTextureInfoDef(h,y);d.getNormalScale()!==1&&(w.scale=d.getNormalScale()),f.normalTexture=w}if(d.getOcclusionTexture()){let h=d.getOcclusionTexture(),y=d.getOcclusionTextureInfo(),w=i.createTextureInfoDef(h,y);d.getOcclusionStrength()!==1&&(w.strength=d.getOcclusionStrength()),f.occlusionTexture=w}if(d.getMetallicRoughnessTexture()){let h=d.getMetallicRoughnessTexture(),y=d.getMetallicRoughnessTextureInfo();f.pbrMetallicRoughness.metallicRoughnessTexture=i.createTextureInfoDef(h,y)}return i.materialIndexMap.set(d,m),f}),l.filter(d=>d.prewriteTypes.includes("Mesh")).forEach(d=>d.prewrite(i,"Mesh")),r.meshes=s.listMeshes().map((d,m)=>{let f=i.createPropertyDef(d),h=null;return f.primitives=d.listPrimitives().map(y=>{let w={attributes:{}};w.mode=y.getMode();let T=y.getMaterial();T&&(w.material=i.materialIndexMap.get(T)),Object.keys(y.getExtras()).length&&(w.extras=y.getExtras());let E=y.getIndices();E&&(w.indices=i.accessorIndexMap.get(E));for(let R of y.listSemantics())w.attributes[R]=i.accessorIndexMap.get(y.getAttribute(R));for(let R of y.listTargets()){let I={};for(let _ of R.listSemantics())I[_]=i.accessorIndexMap.get(R.getAttribute(_));w.targets=w.targets||[],w.targets.push(I)}return y.listTargets().length&&!h&&(h=y.listTargets().map(R=>R.getName())),w}),d.getWeights().length&&(f.weights=d.getWeights()),h&&(f.extras=f.extras||{},f.extras.targetNames=h),i.meshIndexMap.set(d,m),f}),r.cameras=s.listCameras().map((d,m)=>{let f=i.createPropertyDef(d);if(f.type=d.getType(),f.type===xa.Type.PERSPECTIVE){f.perspective={znear:d.getZNear(),zfar:d.getZFar(),yfov:d.getYFov()};let h=d.getAspectRatio();h!==null&&(f.perspective.aspectRatio=h)}else f.orthographic={znear:d.getZNear(),zfar:d.getZFar(),xmag:d.getXMag(),ymag:d.getYMag()};return i.cameraIndexMap.set(d,m),f}),r.nodes=s.listNodes().map((d,m)=>{let f=i.createPropertyDef(d);return re.eq(d.getTranslation(),[0,0,0])||(f.translation=d.getTranslation()),re.eq(d.getRotation(),[0,0,0,1])||(f.rotation=d.getRotation()),re.eq(d.getScale(),[1,1,1])||(f.scale=d.getScale()),d.getWeights().length&&(f.weights=d.getWeights()),i.nodeIndexMap.set(d,m),f}),r.skins=s.listSkins().map((d,m)=>{let f=i.createPropertyDef(d),h=d.getInverseBindMatrices();h&&(f.inverseBindMatrices=i.accessorIndexMap.get(h));let y=d.getSkeleton();return y&&(f.skeleton=i.nodeIndexMap.get(y)),f.joints=d.listJoints().map(w=>i.nodeIndexMap.get(w)),i.skinIndexMap.set(d,m),f}),s.listNodes().forEach((d,m)=>{let f=r.nodes[m],h=d.getMesh();h&&(f.mesh=i.meshIndexMap.get(h));let y=d.getCamera();y&&(f.camera=i.cameraIndexMap.get(y));let w=d.getSkin();w&&(f.skin=i.skinIndexMap.get(w)),d.listChildren().length>0&&(f.children=d.listChildren().map(T=>i.nodeIndexMap.get(T)))}),r.animations=s.listAnimations().map((d,m)=>{let f=i.createPropertyDef(d),h=new Map;return f.samplers=d.listSamplers().map((y,w)=>{let T=i.createPropertyDef(y);return T.input=i.accessorIndexMap.get(y.getInput()),T.output=i.accessorIndexMap.get(y.getOutput()),T.interpolation=y.getInterpolation(),h.set(y,w),T}),f.channels=d.listChannels().map(y=>{let w=i.createPropertyDef(y);return w.sampler=h.get(y.getSampler()),w.target={node:i.nodeIndexMap.get(y.getTargetNode()),path:y.getTargetPath()},w}),i.animationIndexMap.set(d,m),f}),r.scenes=s.listScenes().map((d,m)=>{let f=i.createPropertyDef(d);return f.nodes=d.listChildren().map(h=>i.nodeIndexMap.get(h)),i.sceneIndexMap.set(d,m),f});let u=s.getDefaultScene();return u&&(r.scene=s.listScenes().indexOf(u)),r.extensionsUsed=l.map(d=>d.extensionName),r.extensionsRequired=p.map(d=>d.extensionName),l.forEach(d=>d.write(i)),Yo(r),n}};function Yo(e){let t=[];for(let a in e){let s=e[a];(Array.isArray(s)&&s.length===0||s===null||s===""||s&&typeof s=="object"&&Object.keys(s).length===0)&&t.push(a)}for(let a of t)delete e[a]}var $o=class{_logger=ma.DEFAULT_INSTANCE;_extensions=new Set;_dependencies={};_vertexLayout="interleaved";_strictResources=!0;lastReadBytes=0;lastWriteBytes=0;setLogger(e){return this._logger=e,this}registerExtensions(e){for(let t of e)this._extensions.add(t),t.register();return this}registerDependencies(e){return Object.assign(this._dependencies,e),this}setVertexLayout(e){return this._vertexLayout=e,this}setStrictResources(e){return this._strictResources=e,this}async read(e){return await this.readJSON(await this.readAsJSON(e))}async readAsJSON(e){let t=await this.readURI(e,"view");this.lastReadBytes=t.byteLength;let a=Ar(t)?this._binaryToJSON(t):{json:JSON.parse(G.decodeText(t)),resources:{}};return await this._readResourcesExternal(a,this.dirname(e)),this._readResourcesInternal(a),a}async readJSON(e){return e=this._copyJSON(e),this._readResourcesInternal(e),Ko.read(e,{extensions:Array.from(this._extensions),dependencies:this._dependencies,logger:this._logger})}async binaryToJSON(e){let t=this._binaryToJSON(G.assertView(e));this._readResourcesInternal(t);let a=t.json;if(a.buffers&&a.buffers.some(s=>Qo(t,s)))throw new Error("Cannot resolve external buffers with binaryToJSON().");if(a.images&&a.images.some(s=>Zo(t,s)))throw new Error("Cannot resolve external images with binaryToJSON().");return t}async readBinary(e){return this.readJSON(await this.binaryToJSON(G.assertView(e)))}async writeJSON(e,t={}){if(t.format==="GLB"&&e.getRoot().listBuffers().length>1)throw new Error("GLB must have 0\u20131 buffers.");return Jo.write(e,{format:t.format||"GLTF",basename:t.basename||"",logger:this._logger,vertexLayout:this._vertexLayout,dependencies:{...this._dependencies},extensions:Array.from(this._extensions)})}async writeBinary(e){let{json:t,resources:a}=await this.writeJSON(e,{format:"GLB"}),s=new Uint32Array([1179937895,2,12]),r=JSON.stringify(t),n=G.pad(G.encodeText(r),32),i=G.toView(new Uint32Array([n.byteLength,1313821514])),o=G.concat([i,n]);s[s.length-1]+=o.byteLength;let c=Object.values(a)[0];if(!c||!c.byteLength)return G.concat([G.toView(s),o]);let l=G.pad(c,0),p=G.toView(new Uint32Array([l.byteLength,5130562])),g=G.concat([p,l]);return s[s.length-1]+=g.byteLength,G.concat([G.toView(s),o,g])}async _readResourcesExternal(e,t){let a=e.json.images||[],s=e.json.buffers||[],r=[...a,...s].map(async n=>{let i=n.uri;if(!i||i.match(/data:/))return Promise.resolve();try{e.resources[i]=await this.readURI(this.resolve(t,i),"view"),this.lastReadBytes+=e.resources[i].byteLength}catch(o){if(!this._strictResources&&a.includes(n))this._logger.warn(`Failed to load image URI, "${i}". ${o}`),e.resources[i]=null;else throw o}});await Promise.all(r)}_readResourcesInternal(e){function t(a){if(a.uri){if(a.uri in e.resources){G.assertView(e.resources[a.uri]);return}if(a.uri.match(/data:/)){let s=`__${Fo()}.${Mt.extension(a.uri)}`;e.resources[s]=G.createBufferFromDataURI(a.uri),a.uri=s}}}(e.json.images||[]).forEach(a=>{if(a.bufferView===void 0&&a.uri===void 0)throw new Error("Missing resource URI or buffer view.");t(a)}),(e.json.buffers||[]).forEach(t)}_copyJSON(e){let{images:t,buffers:a}=e.json;return e={json:{...e.json},resources:{...e.resources}},t&&(e.json.images=t.map(s=>({...s}))),a&&(e.json.buffers=a.map(s=>({...s}))),e}_binaryToJSON(e){if(!Ar(e))throw new Error("Invalid glTF 2.0 binary.");let t=new Uint32Array(e.buffer,e.byteOffset+12,2);if(t[1]!==1313821514)throw new Error("Missing required GLB JSON chunk.");let a=20,s=t[0],r=G.decodeText(G.toView(e,a,s)),n=JSON.parse(r),i=a+s;if(e.byteLength<=i)return{json:n,resources:{}};let o=new Uint32Array(e.buffer,e.byteOffset+i,2);if(o[1]!==5130562)return{json:n,resources:{}};let c=o[0],l=G.toView(e,i+8,c);return{json:n,resources:{[Qe]:l}}}};function Qo(e,t){return t.uri!==void 0&&!(t.uri in e.resources)}function Zo(e,t){return t.uri!==void 0&&!(t.uri in e.resources)&&t.bufferView===void 0}function Ar(e){if(e.byteLength<3*Uint32Array.BYTES_PER_ELEMENT)return!1;let t=new Uint32Array(e.buffer,e.byteOffset,3);return t[0]===1179937895&&t[1]===2}var Wr=class extends $o{_fetchConfig;constructor(e=fs.DEFAULT_INIT){super(),this._fetchConfig=e}async readURI(e,t){let a=await fetch(e,this._fetchConfig);switch(t){case"view":return new Uint8Array(await a.arrayBuffer());case"text":return a.text()}}resolve(e,t){return fs.resolve(e,t)}dirname(e){return fs.dirname(e)}};function ec(){return{vkFormat:0,typeSize:1,pixelWidth:0,pixelHeight:0,pixelDepth:0,layerCount:0,faceCount:1,levelCount:0,supercompressionScheme:0,levels:[],dataFormatDescriptor:[{vendorId:0,descriptorType:0,versionNumber:2,colorModel:0,colorPrimaries:1,transferFunction:2,flags:0,texelBlockDimension:[0,0,0,0],bytesPlane:[0,0,0,0,0,0,0,0],samples:[]}],keyValue:{},globalData:null}}var yt=class{constructor(t,a,s,r){this._dataView=void 0,this._littleEndian=void 0,this._offset=void 0,this._dataView=new DataView(t.buffer,t.byteOffset+a,s),this._littleEndian=r,this._offset=0}_nextUint8(){let t=this._dataView.getUint8(this._offset);return this._offset+=1,t}_nextUint16(){let t=this._dataView.getUint16(this._offset,this._littleEndian);return this._offset+=2,t}_nextUint32(){let t=this._dataView.getUint32(this._offset,this._littleEndian);return this._offset+=4,t}_nextUint64(){let t=this._dataView.getUint32(this._offset,this._littleEndian),a=this._dataView.getUint32(this._offset+4,this._littleEndian),s=t+2**32*a;return this._offset+=8,s}_nextInt32(){let t=this._dataView.getInt32(this._offset,this._littleEndian);return this._offset+=4,t}_nextUint8Array(t){let a=new Uint8Array(this._dataView.buffer,this._dataView.byteOffset+this._offset,t);return this._offset+=t,a}_skip(t){return this._offset+=t,this}_scan(t,a=0){let s=this._offset,r=0;for(;this._dataView.getUint8(this._offset)!==a&&r<t;)r++,this._offset++;return r<t&&this._offset++,new Uint8Array(this._dataView.buffer,this._dataView.byteOffset+s,r)}};var Fb=new Uint8Array([0]),xe=[171,75,84,88,32,50,48,187,13,10,26,10];function Jr(e){return new TextDecoder().decode(e)}function wa(e){let t=new Uint8Array(e.buffer,e.byteOffset,xe.length);if(t[0]!==xe[0]||t[1]!==xe[1]||t[2]!==xe[2]||t[3]!==xe[3]||t[4]!==xe[4]||t[5]!==xe[5]||t[6]!==xe[6]||t[7]!==xe[7]||t[8]!==xe[8]||t[9]!==xe[9]||t[10]!==xe[10]||t[11]!==xe[11])throw new Error("Missing KTX 2.0 identifier.");let a=ec(),s=17*Uint32Array.BYTES_PER_ELEMENT,r=new yt(e,xe.length,s,!0);a.vkFormat=r._nextUint32(),a.typeSize=r._nextUint32(),a.pixelWidth=r._nextUint32(),a.pixelHeight=r._nextUint32(),a.pixelDepth=r._nextUint32(),a.layerCount=r._nextUint32(),a.faceCount=r._nextUint32(),a.levelCount=r._nextUint32(),a.supercompressionScheme=r._nextUint32();let n=r._nextUint32(),i=r._nextUint32(),o=r._nextUint32(),c=r._nextUint32(),l=r._nextUint64(),p=r._nextUint64(),g=Math.max(a.levelCount,1)*3*8,v=new yt(e,xe.length+s,g,!0);for(let ke=0,Se=Math.max(a.levelCount,1);ke<Se;ke++)a.levels.push({levelData:new Uint8Array(e.buffer,e.byteOffset+v._nextUint64(),v._nextUint64()),uncompressedByteLength:v._nextUint64()});let x=new yt(e,n,i,!0);x._skip(4);let u=x._nextUint16(),d=x._nextUint16(),m=x._nextUint16(),f=x._nextUint16(),h=x._nextUint8(),y=x._nextUint8(),w=x._nextUint8(),T=x._nextUint8(),E=[x._nextUint8(),x._nextUint8(),x._nextUint8(),x._nextUint8()],R=[x._nextUint8(),x._nextUint8(),x._nextUint8(),x._nextUint8(),x._nextUint8(),x._nextUint8(),x._nextUint8(),x._nextUint8()],_={vendorId:u,descriptorType:d,versionNumber:m,colorModel:h,colorPrimaries:y,transferFunction:w,flags:T,texelBlockDimension:E,bytesPlane:R,samples:[]},P=(f/4-6)/4;for(let ke=0;ke<P;ke++){let Se={bitOffset:x._nextUint16(),bitLength:x._nextUint8(),channelType:x._nextUint8(),samplePosition:[x._nextUint8(),x._nextUint8(),x._nextUint8(),x._nextUint8()],sampleLower:Number.NEGATIVE_INFINITY,sampleUpper:Number.POSITIVE_INFINITY};Se.channelType&64?(Se.sampleLower=x._nextInt32(),Se.sampleUpper=x._nextInt32()):(Se.sampleLower=x._nextUint32(),Se.sampleUpper=x._nextUint32()),_.samples[ke]=Se}a.dataFormatDescriptor.length=0,a.dataFormatDescriptor.push(_);let F=new yt(e,o,c,!0);for(;F._offset<c;){let ke=F._nextUint32(),Se=F._scan(ke),ta=Jr(Se);if(a.keyValue[ta]=F._nextUint8Array(ke-Se.byteLength-1),ta.match(/^ktx/i)){let or=Jr(a.keyValue[ta]);a.keyValue[ta]=or.substring(0,or.lastIndexOf("\0"))}let ro=ke%4?4-ke%4:0;F._skip(ro)}if(p<=0)return a;let C=new yt(e,l,p,!0),H=C._nextUint16(),se=C._nextUint16(),ie=C._nextUint32(),Ue=C._nextUint32(),k=C._nextUint32(),B=C._nextUint32(),U=[];for(let ke=0,Se=Math.max(a.levelCount,1);ke<Se;ke++)U.push({imageFlags:C._nextUint32(),rgbSliceByteOffset:C._nextUint32(),rgbSliceByteLength:C._nextUint32(),alphaSliceByteOffset:C._nextUint32(),alphaSliceByteLength:C._nextUint32()});let q=l+C._offset,le=q+ie,me=le+Ue,Ct=me+k,ss=new Uint8Array(e.buffer,e.byteOffset+q,ie),to=new Uint8Array(e.buffer,e.byteOffset+le,Ue),ao=new Uint8Array(e.buffer,e.byteOffset+me,k),so=new Uint8Array(e.buffer,e.byteOffset+Ct,B);return a.globalData={endpointCount:H,selectorCount:se,imageDescs:U,endpointsData:ss,selectorsData:to,tablesData:ao,extendedData:so},a}var et="EXT_mesh_gpu_instancing",He="EXT_mesh_features",Me="EXT_meshopt_compression",K="EXT_structural_metadata",va="EXT_texture_webp",Ta="EXT_texture_avif",ic="KHR_accessor_float16",oc="KHR_accessor_float64",oe="KHR_draco_mesh_compression",ze="KHR_lights_punctual",tt="KHR_materials_anisotropy",at="KHR_materials_clearcoat",st="KHR_materials_diffuse_transmission",rt="KHR_materials_dispersion",nt="KHR_materials_emissive_strength",it="KHR_materials_ior",ot="KHR_materials_iridescence",ct="KHR_materials_pbrSpecularGlossiness",dt="KHR_materials_sheen",lt="KHR_materials_specular",ft="KHR_materials_transmission",Rt="KHR_materials_unlit",ut="KHR_materials_volume",_e="KHR_materials_variants",Yr="KHR_mesh_primitive_restart",$r="KHR_mesh_quantization",ht="KHR_node_visibility",Ea="KHR_texture_basisu",bt="KHR_texture_transform",Oe="KHR_xmp_json_ld",cc=class extends z{static EXTENSION_NAME=He;init(){this.extensionName=He,this.propertyType="FeatureID",this.parentTypes=["Features"]}getDefaults(){return Object.assign(super.getDefaults(),{nullFeatureId:null,label:"",attribute:null,texture:null,propertyTable:null})}getFeatureCount(){return this.get("featureCount")}setFeatureCount(e){return this.set("featureCount",e)}getNullFeatureID(){return this.get("nullFeatureId")}setNullFeatureID(e){return this.set("nullFeatureId",e)}getLabel(){return this.get("label")}setLabel(e){return this.set("label",e)}getAttribute(){return this.get("attribute")}setAttribute(e){return this.set("attribute",e)}getTexture(){return this.getRef("texture")}setTexture(e){return this.setRef("texture",e)}getPropertyTable(){return this.getRef("propertyTable")}setPropertyTable(e){return this.setRef("propertyTable",e)}},dc=class extends z{static EXTENSION_NAME=He;init(){this.extensionName=He,this.propertyType="FeatureIDTexture",this.parentTypes=["FeatureID"]}getDefaults(){let e=new ae(this.graph,"textureInfo");return e.setMinFilter(ae.MagFilter.NEAREST),e.setMagFilter(ae.MagFilter.NEAREST),Object.assign(super.getDefaults(),{channels:[0],texture:null,textureInfo:e})}getChannels(){return this.get("channels")}setChannels(e){return this.set("channels",e)}getTexture(){return this.getRef("texture")}setTexture(e){return this.setRef("texture",e)}getTextureInfo(){return this.getRef("texture")?this.getRef("textureInfo"):null}},lc=class extends z{static EXTENSION_NAME=He;init(){this.extensionName=He,this.propertyType="Features",this.parentTypes=[N.PRIMITIVE]}getDefaults(){return Object.assign(super.getDefaults(),{featureIds:new te([])})}listFeatureIDs(){return this.listRefs("featureIds")}addFeatureID(e){return this.addRef("featureIds",e)}removeFeatureID(e){return this.removeRef("featureIds",e)}},Ut=He,ks=class extends Z{extensionName=He;static EXTENSION_NAME=He;createFeatures(){return new lc(this.document.getGraph())}createFeatureID(){return new cc(this.document.getGraph())}createFeatureIDTexture(){return new dc(this.document.getGraph())}read(e){return(e.jsonDoc.json.meshes||[]).forEach((t,a)=>{(t.primitives||[]).forEach((s,r)=>{this._readPrimitive(e,a,s,r)})}),this}_readPrimitive(e,t,a,s){if(!a.extensions||!a.extensions[Ut])return;let r=this.createFeatures(),n=a.extensions[Ut];for(let i of n.featureIds){let o=fc(this.document,this,e,i);r.addFeatureID(o)}e.meshes[t].listPrimitives()[s].setExtension(Ut,r)}write(e){let t=e.jsonDoc.json.meshes;if(!t)return this;for(let a of this.document.getRoot().listMeshes()){let s=t[e.meshIndexMap.get(a)];a.listPrimitives().forEach((r,n)=>{let i=s.primitives[n];this._writePrimitive(e,r,i)})}return this}_writePrimitive(e,t,a){let s=t.getExtension(Ut);if(!s)return;let r={featureIds:[]};s.listFeatureIDs().forEach(n=>{r.featureIds.push(hc(this.document,e,n))}),a.extensions=a.extensions||{},a.extensions[Ut]=r}};function fc(e,t,a,s){let r=t.createFeatureID().setFeatureCount(s.featureCount);s.nullFeatureId!==void 0&&r.setNullFeatureID(s.nullFeatureId),s.label!==void 0&&r.setLabel(s.label),s.attribute!==void 0&&r.setAttribute(s.attribute);let n=s.texture;if(n!==void 0){let i=uc(t,a,n);r.setTexture(i)}if(s.propertyTable!==void 0){let i=e.getRoot().getExtension(K).listPropertyTables();r.setPropertyTable(i[s.propertyTable])}return r}function uc(e,t,a){let s=e.createFeatureIDTexture(),{json:r}=t.jsonDoc;if(a.channels&&s.setChannels(a.channels),a.index!==void 0){let n=r.textures[a.index].source;s.setTexture(t.textures[n]),t.setTextureInfo(s.getTextureInfo(),a)}return s}function hc(e,t,a){let s=e.getRoot(),r={featureCount:a.getFeatureCount()};if(a.getNullFeatureID()!=null&&(r.nullFeatureId=a.getNullFeatureID()),a.getLabel()&&(r.label=a.getLabel()),a.getAttribute()!=null&&(r.attribute=a.getAttribute()),a.getTexture()){let n=a.getTexture(),i=n.getTexture(),o=n.getTextureInfo();r.texture=t.createTextureInfoDef(i,o);let c=n.getChannels();re.eq(c,[0])||(r.texture.channels=c)}if(a.getPropertyTable()){let n=s.getExtension(K),i=a.getPropertyTable();r.propertyTable=n.listPropertyTables().indexOf(i)}return r}var vs="INSTANCE_ATTRIBUTE",bc=class extends z{static EXTENSION_NAME=et;init(){this.extensionName=et,this.propertyType="InstancedMesh",this.parentTypes=[N.NODE]}getDefaults(){return Object.assign(super.getDefaults(),{attributes:new ce})}getAttribute(e){return this.getRefMap("attributes",e)}setAttribute(e,t){return this.setRefMap("attributes",e,t,{usage:vs})}listAttributes(){return this.listRefMapValues("attributes")}listSemantics(){return this.listRefMapKeys("attributes")}},gc=class extends Z{static EXTENSION_NAME=et;extensionName=et;prewriteTypes=[N.ACCESSOR];createInstancedMesh(){return new bc(this.document.getGraph())}read(e){return(e.jsonDoc.json.nodes||[]).forEach((t,a)=>{if(!t.extensions||!t.extensions.EXT_mesh_gpu_instancing)return;let s=t.extensions[et],r=this.createInstancedMesh();for(let n in s.attributes)r.setAttribute(n,e.accessors[s.attributes[n]]);e.nodes[a].setExtension(et,r)}),this}prewrite(e){e.accessorUsageGroupedByParent.add(vs);for(let t of this.properties)for(let a of t.listAttributes())e.addAccessorToUsageGroup(a,vs);return this}write(e){let t=e.jsonDoc;return this.document.getRoot().listNodes().forEach(a=>{let s=a.getExtension(et);if(s){let r=e.nodeIndexMap.get(a),n=t.json.nodes[r],i={attributes:{}};s.listSemantics().forEach(o=>{let c=s.getAttribute(o);i.attributes[o]=e.accessorIndexMap.get(c)}),n.extensions=n.extensions||{},n.extensions[et]=i}}),this}},pc=(function(e){return e.QUANTIZE="quantize",e.FILTER="filter",e})({});function mc(e){return!e.extensions||!e.extensions.EXT_meshopt_compression?!1:!!e.extensions[Me].fallback}var{BYTE:yc,SHORT:Qr,FLOAT:xc}=L.ComponentType,{encodeNormalizedInt:Zr,decodeNormalizedInt:Ts}=re;function wc(e,t,a,s){let{filter:r,bits:n}=s,i={array:e.getArray(),byteStride:e.getElementSize()*e.getComponentSize(),componentType:e.getComponentType(),normalized:e.getNormalized()};if(a!=="ATTRIBUTES")return i;if(r!=="NONE"){let o=e.getNormalized()?vc(e):new Float32Array(i.array);switch(r){case"EXPONENTIAL":i.byteStride=e.getElementSize()*4,i.componentType=xc,i.normalized=!1,i.array=t.encodeFilterExp(o,e.getCount(),i.byteStride,n);break;case"OCTAHEDRAL":i.byteStride=n>8?8:4,i.componentType=n>8?Qr:yc,i.normalized=!0,o=e.getElementSize()===3?Ec(o):o,i.array=t.encodeFilterOct(o,e.getCount(),i.byteStride,n);break;case"QUATERNION":i.byteStride=8,i.componentType=Qr,i.normalized=!0,i.array=t.encodeFilterQuat(o,e.getCount(),i.byteStride,n);break;default:throw new Error("Invalid filter.")}i.min=e.getMin([]),i.max=e.getMax([]),e.getNormalized()&&(i.min=i.min.map(c=>Ts(c,e.getComponentType())),i.max=i.max.map(c=>Ts(c,e.getComponentType()))),i.normalized&&(i.min=i.min.map(c=>Zr(c,i.componentType)),i.max=i.max.map(c=>Zr(c,i.componentType)))}else i.byteStride%4&&(i.array=Tc(i.array,e.getElementSize()),i.byteStride=i.array.byteLength/e.getCount());return i}function vc(e){let t=e.getComponentType(),a=e.getArray(),s=new Float32Array(a.length);for(let r=0;r<a.length;r++)s[r]=Ts(a[r],t);return s}function Tc(e,t){let a=G.padNumber(e.BYTES_PER_ELEMENT*t)/e.BYTES_PER_ELEMENT,s=e.length/t,r=new e.constructor(s*a);for(let n=0;n*t<e.length;n++)for(let i=0;i<t;i++)r[n*a+i]=e[n*t+i];return r}function Ec(e){let t=new Float32Array(e.length*4/3);for(let a=0,s=e.length/3;a<s;a++)t[a*4]=e[a*3],t[a*4+1]=e[a*3+1],t[a*4+2]=e[a*3+2];return t}function kc(e,t){return t===$e.BufferViewUsage.ELEMENT_ARRAY_BUFFER?e.listParents().some(a=>a instanceof Dt&&a.getMode()===Dt.Mode.TRIANGLES)?"TRIANGLES":"INDICES":"ATTRIBUTES"}function Mc(e,t){let a=t.getGraph().listParentEdges(e).filter(s=>!(s.getParent()instanceof ys));for(let s of a){let r=s.getName(),n=s.getAttributes().key||"",i=s.getParent().propertyType===N.PRIMITIVE_TARGET;if(r==="indices")return{filter:"NONE"};if(r==="attributes"){if(n==="POSITION")return{filter:"NONE"};if(n==="TEXCOORD_0")return{filter:"NONE"};if(n.startsWith("JOINTS_"))return{filter:"NONE"};if(n.startsWith("WEIGHTS_"))return{filter:"NONE"};if(n==="NORMAL"||n==="TANGENT")return i?{filter:"NONE"}:{filter:"OCTAHEDRAL",bits:8}}if(r==="output"){let o=mn(e);return o==="rotation"?{filter:"QUATERNION",bits:16}:o==="translation"?{filter:"EXPONENTIAL",bits:12}:o==="scale"?{filter:"EXPONENTIAL",bits:12}:{filter:"NONE"}}if(r==="input")return{filter:"NONE"};if(r==="inverseBindMatrices")return{filter:"NONE"}}return{filter:"NONE"}}function mn(e){for(let t of e.listParents())if(t instanceof ya){for(let a of t.listParents())if(a instanceof ms)return a.getTargetPath()}return null}var en={method:"quantize"},Ms=class extends Z{extensionName=Me;prereadTypes=[N.BUFFER,N.PRIMITIVE];prewriteTypes=[N.BUFFER,N.ACCESSOR];readDependencies=["meshopt.decoder"];writeDependencies=["meshopt.encoder"];static EXTENSION_NAME=Me;static EncoderMethod=pc;_decoder=null;_decoderFallbackBufferMap=new Map;_encoder=null;_encoderOptions=en;_encoderFallbackBuffer=null;_encoderBufferViews={};_encoderBufferViewData={};_encoderBufferViewAccessors={};install(e,t){return e==="meshopt.decoder"&&(this._decoder=t),e==="meshopt.encoder"&&(this._encoder=t),this}setEncoderOptions(e){return this._encoderOptions={...en,...e},this}preread(e,t){if(!this._decoder){if(!this.isRequired())return this;throw new Error(`[${Me}] Please install extension dependency, "meshopt.decoder".`)}if(!this._decoder.supported){if(!this.isRequired())return this;throw new Error(`[${Me}]: Missing WASM support.`)}return t===N.BUFFER?this._prereadBuffers(e):t===N.PRIMITIVE&&this._prereadPrimitives(e),this}_prereadBuffers(e){let t=e.jsonDoc;(t.json.bufferViews||[]).forEach((a,s)=>{if(!a.extensions||!a.extensions.EXT_meshopt_compression)return;let r=a.extensions[Me],n=r.byteOffset||0,i=r.byteLength||0,o=r.count,c=r.byteStride,l=new Uint8Array(o*c),p=t.json.buffers[r.buffer],g=p.uri?t.resources[p.uri]:t.resources[Qe],v=G.toView(g,n,i);this._decoder.decodeGltfBuffer(l,o,c,v,r.mode,r.filter),e.bufferViews[s]=l})}_prereadPrimitives(e){let t=e.jsonDoc;(t.json.bufferViews||[]).forEach(a=>{if(!a.extensions||!a.extensions.EXT_meshopt_compression)return;let s=a.extensions[Me],r=e.buffers[s.buffer],n=e.buffers[a.buffer],i=t.json.buffers[a.buffer];mc(i)&&this._decoderFallbackBufferMap.set(n,r)})}read(e){if(!this.isRequired())return this;for(let[t,a]of this._decoderFallbackBufferMap){for(let s of t.listParents())s instanceof L&&s.swap(t,a);t.dispose()}return this}prewrite(e,t){return t===N.ACCESSOR?this._prewriteAccessors(e):t===N.BUFFER&&this._prewriteBuffers(e),this}_prewriteAccessors(e){let t=e.jsonDoc.json,a=this._encoder,s=this._encoderOptions,r=this.document.getGraph(),n=this.document.createBuffer(),i=this.document.getRoot().listBuffers().indexOf(n),o=1,c=new Map,l=p=>{for(let g of r.listParents(p)){if(g.propertyType===N.ROOT)continue;let v=c.get(p);return v===void 0&&c.set(p,v=o++),v}return-1};this._encoderFallbackBuffer=n,this._encoderBufferViews={},this._encoderBufferViewData={},this._encoderBufferViewAccessors={};for(let p of this.document.getRoot().listAccessors()){if(mn(p)==="weights"||p.getSparse())continue;let g=e.getAccessorUsage(p),v=e.accessorUsageGroupedByParent.has(g)?l(p):null,x=kc(p,g),u=s.method==="filter"?Mc(p,this.document):{filter:"NONE"},d=wc(p,a,x,u),{array:m,byteStride:f}=d,h=p.getBuffer();if(!h)throw new Error(`${Me}: Missing buffer for accessor.`);let y=this.document.getRoot().listBuffers().indexOf(h),w=[g,v,x,u.filter,f,y].join(":"),T=this._encoderBufferViews[w],E=this._encoderBufferViewData[w],R=this._encoderBufferViewAccessors[w];(!T||!E)&&(R=this._encoderBufferViewAccessors[w]=[],E=this._encoderBufferViewData[w]=[],T=this._encoderBufferViews[w]={buffer:i,target:$e.USAGE_TO_TARGET[g],byteOffset:0,byteLength:0,byteStride:g===$e.BufferViewUsage.ARRAY_BUFFER?f:void 0,extensions:{[Me]:{buffer:y,byteOffset:0,byteLength:0,mode:x,filter:u.filter!=="NONE"?u.filter:void 0,byteStride:f,count:0}}});let I=e.createAccessorDef(p);I.componentType=d.componentType,I.normalized=d.normalized,I.byteOffset=T.byteLength,I.min&&d.min&&(I.min=d.min),I.max&&d.max&&(I.max=d.max),e.accessorIndexMap.set(p,t.accessors.length),t.accessors.push(I),R.push(I),E.push(new Uint8Array(m.buffer,m.byteOffset,m.byteLength)),T.byteLength+=m.byteLength,T.extensions.EXT_meshopt_compression.count+=p.getCount()}}_prewriteBuffers(e){let t=this._encoder;for(let a in this._encoderBufferViews){let s=this._encoderBufferViews[a],r=this._encoderBufferViewData[a],n=this.document.getRoot().listBuffers()[s.extensions[Me].buffer],i=e.otherBufferViews.get(n)||[],{count:o,byteStride:c,mode:l}=s.extensions[Me],p=G.concat(r),g=t.encodeGltfBuffer(p,o,c,l),v=G.pad(g);s.extensions[Me].byteLength=g.byteLength,r.length=0,r.push(v),i.push(v),e.otherBufferViews.set(n,i)}}write(e){let t=0;for(let n in this._encoderBufferViews){let i=this._encoderBufferViews[n],o=this._encoderBufferViewData[n][0],c=e.otherBufferViewsIndexMap.get(o),l=this._encoderBufferViewAccessors[n];for(let x of l)x.bufferView=c;let p=e.jsonDoc.json.bufferViews[c],g=p.byteOffset||0;Object.assign(p,i),p.byteOffset=t;let v=p.extensions[Me];v.byteOffset=g,t+=G.padNumber(i.byteLength)}let a=this._encoderFallbackBuffer,s=e.bufferIndexMap.get(a),r=e.jsonDoc.json.buffers[s];return r.byteLength=t,r.extensions={[Me]:{fallback:!0}},a.dispose(),this}},Rc=class extends z{static EXTENSION_NAME=K;init(){this.extensionName=K,this.propertyType="StructuralMetadata",this.parentTypes=[N.ROOT]}getDefaults(){return Object.assign(super.getDefaults(),{schema:null,schemaUri:"",propertyTables:new he,propertyTextures:new he,propertyAttributes:new he})}getSchema(){return this.getRef("schema")}setSchema(e){return this.setRef("schema",e)}getSchemaUri(){return this.get("schemaUri")}setSchemaUri(e){return this.set("schemaUri",e)}listPropertyTables(){return this.listRefs("propertyTables")}addPropertyTable(e){return this.addRef("propertyTables",e)}removePropertyTable(e){return this.removeRef("propertyTables",e)}listPropertyTextures(){return this.listRefs("propertyTextures")}addPropertyTexture(e){return this.addRef("propertyTextures",e)}removePropertyTexture(e){return this.removeRef("propertyTextures",e)}listPropertyAttributes(){return this.listRefs("propertyAttributes")}addPropertyAttribute(e){return this.addRef("propertyAttributes",e)}removePropertyAttribute(e){return this.removeRef("propertyAttributes",e)}},Ic=class extends z{static EXTENSION_NAME=K;init(){this.extensionName=K,this.propertyType="Schema",this.parentTypes=["StructuralMetadata"]}getDefaults(){return Object.assign(super.getDefaults(),{description:"",version:"",classes:new ce,enums:new ce})}getId(){return this.get("id")}setId(e){return this.set("id",e)}getDescription(){return this.get("description")}setDescription(e){return this.set("description",e)}getVersion(){return this.get("version")}setVersion(e){return this.set("version",e)}setClass(e,t){return this.setRefMap("classes",e,t)}getClass(e){return this.getRefMap("classes",e)}listClassKeys(){return this.listRefMapKeys("classes")}listClassValues(){return this.listRefMapValues("classes")}setEnum(e,t){return this.setRefMap("enums",e,t)}getEnum(e){return this.getRefMap("enums",e)}listEnumKeys(){return this.listRefMapKeys("enums")}listEnumValues(){return this.listRefMapValues("enums")}},Ac=class extends z{static EXTENSION_NAME=K;init(){this.extensionName=K,this.propertyType="Class",this.parentTypes=["Schema"]}getDefaults(){return Object.assign(super.getDefaults(),{description:"",properties:new ce})}getDescription(){return this.get("description")}setDescription(e){return this.set("description",e)}setProperty(e,t){return this.setRefMap("properties",e,t)}getProperty(e){return this.getRefMap("properties",e)}listPropertyKeys(){return this.listRefMapKeys("properties")}listPropertyValues(){return this.listRefMapValues("properties")}},Sc=class extends z{static EXTENSION_NAME=K;init(){this.extensionName=K,this.propertyType="ClassProperty",this.parentTypes=["Class"]}getDefaults(){return Object.assign(super.getDefaults(),{description:"",componentType:null,enumType:null,array:null,count:null,normalized:null,offset:null,scale:null,max:null,min:null,required:null,noData:null,default:null})}getDescription(){return this.get("description")}setDescription(e){return this.set("description",e)}getType(){return this.get("type")}setType(e){return this.set("type",e)}getComponentType(){return this.get("componentType")}setComponentType(e){return this.set("componentType",e)}getEnumType(){return this.get("enumType")}setEnumType(e){return this.set("enumType",e)}getArray(){return this.get("array")}setArray(e){return this.set("array",e)}getCount(){return this.get("count")}setCount(e){return this.set("count",e)}getNormalized(){return this.get("normalized")}setNormalized(e){return this.set("normalized",e)}getOffset(){return this.get("offset")}setOffset(e){return this.set("offset",e)}getScale(){return this.get("scale")}setScale(e){return this.set("scale",e)}getMax(){return this.get("max")}setMax(e){return this.set("max",e)}getMin(){return this.get("min")}setMin(e){return this.set("min",e)}getRequired(){return this.get("required")}setRequired(e){return this.set("required",e)}getNoData(){return this.get("noData")}setNoData(e){return this.set("noData",e)}getDefault(){return this.get("default")}setDefault(e){return this.set("default",e)}},_c=class extends z{static EXTENSION_NAME=K;init(){this.extensionName=K,this.propertyType="Enum",this.parentTypes=["Schema"]}getDefaults(){return Object.assign(super.getDefaults(),{description:"",valueType:"UINT16",values:new he})}getDescription(){return this.get("description")}setDescription(e){return this.set("description",e)}getValueType(){return this.get("valueType")}setValueType(e){return this.set("valueType",e)}listValues(){return this.listRefs("values")}addEnumValue(e){return this.addRef("values",e)}removeEnumValue(e){return this.removeRef("values",e)}},Nc=class extends z{static EXTENSION_NAME=K;init(){this.extensionName=K,this.propertyType="EnumValue",this.parentTypes=["Enum"]}getDefaults(){return Object.assign(super.getDefaults(),{description:null})}getDescription(){return this.get("description")}setDescription(e){return this.set("description",e)}getValue(){return this.get("value")}setValue(e){return this.set("value",e)}},jc=class extends z{static EXTENSION_NAME=K;init(){this.extensionName=K,this.propertyType="PropertyTable",this.parentTypes=["StructuralMetadata"]}getDefaults(){return Object.assign(super.getDefaults(),{properties:new ce})}getClass(){return this.get("class")}setClass(e){return this.set("class",e)}getCount(){return this.get("count")}setCount(e){return this.set("count",e)}setProperty(e,t){return this.setRefMap("properties",e,t)}getProperty(e){return this.getRefMap("properties",e)}listPropertyKeys(){return this.listRefMapKeys("properties")}listPropertyValues(){return this.listRefMapValues("properties")}},Fc=class extends z{static EXTENSION_NAME=K;init(){this.extensionName=K,this.propertyType="PropertyTableProperty",this.parentTypes=["PropertyTable"]}getDefaults(){return Object.assign(super.getDefaults(),{arrayOffsets:null,stringOffsets:null,arrayOffsetType:null,stringOffsetType:null,offset:null,scale:null,max:null,min:null})}getValues(){return this.get("values")}setValues(e){return this.set("values",e)}getArrayOffsets(){return this.get("arrayOffsets")}setArrayOffsets(e){return this.set("arrayOffsets",e)}getStringOffsets(){return this.get("stringOffsets")}setStringOffsets(e){return this.set("stringOffsets",e)}getArrayOffsetType(){return this.get("arrayOffsetType")}setArrayOffsetType(e){return this.set("arrayOffsetType",e)}getStringOffsetType(){return this.get("stringOffsetType")}setStringOffsetType(e){return this.set("stringOffsetType",e)}getOffset(){return this.get("offset")}setOffset(e){return this.set("offset",e)}getScale(){return this.get("scale")}setScale(e){return this.set("scale",e)}getMax(){return this.get("max")}setMax(e){return this.set("max",e)}getMin(){return this.get("min")}setMin(e){return this.set("min",e)}},Cc=class extends z{static EXTENSION_NAME=K;init(){this.extensionName=K,this.propertyType="PropertyTexture",this.parentTypes=["StructuralMetadata"]}getDefaults(){return Object.assign(super.getDefaults(),{properties:new ce})}getClass(){return this.get("class")}setClass(e){return this.set("class",e)}setProperty(e,t){return this.setRefMap("properties",e,t)}getProperty(e){return this.getRefMap("properties",e)}listPropertyKeys(){return this.listRefMapKeys("properties")}listPropertyValues(){return this.listRefMapValues("properties")}},Bc=class extends z{static EXTENSION_NAME=K;init(){this.extensionName=K,this.propertyType="PropertyTextureProperty",this.parentTypes=["PropertyTexture"]}getDefaults(){let e=new ae(this.graph,"textureInfo");return e.setMinFilter(ae.MagFilter.NEAREST),e.setMagFilter(ae.MagFilter.NEAREST),Object.assign(super.getDefaults(),{channels:[0],texture:null,textureInfo:e,offset:null,scale:null,max:null,min:null})}getChannels(){return this.get("channels")}setChannels(e){return this.set("channels",e)}getTexture(){return this.getRef("texture")}setTexture(e){return this.setRef("texture",e)}getTextureInfo(){return this.getRef("texture")?this.getRef("textureInfo"):null}getOffset(){return this.get("offset")}setOffset(e){return this.set("offset",e)}getScale(){return this.get("scale")}setScale(e){return this.set("scale",e)}getMax(){return this.get("max")}setMax(e){return this.set("max",e)}getMin(){return this.get("min")}setMin(e){return this.set("min",e)}},Oc=class extends z{static EXTENSION_NAME=K;init(){this.extensionName=K,this.propertyType="PropertyAttribute",this.parentTypes=["StructuralMetadata"]}getDefaults(){return Object.assign(super.getDefaults(),{properties:new ce})}getClass(){return this.get("class")}setClass(e){return this.set("class",e)}setProperty(e,t){return this.setRefMap("properties",e,t)}getProperty(e){return this.getRefMap("properties",e)}listPropertyKeys(){return this.listRefMapKeys("properties")}listPropertyValues(){return this.listRefMapValues("properties")}},Pc=class extends z{static EXTENSION_NAME=K;init(){this.extensionName=K,this.propertyType="PropertyAttributeProperty",this.parentTypes=["PropertyAttribute"]}getDefaults(){return Object.assign(super.getDefaults(),{offset:null,scale:null,max:null,min:null})}getAttribute(){return this.get("attribute")}setAttribute(e){return this.set("attribute",e)}getOffset(){return this.get("offset")}setOffset(e){return this.set("offset",e)}getScale(){return this.get("scale")}setScale(e){return this.set("scale",e)}getMax(){return this.get("max")}setMax(e){return this.set("max",e)}getMin(){return this.get("min")}setMin(e){return this.set("min",e)}},Dc=class extends z{static EXTENSION_NAME=K;init(){this.extensionName=K,this.propertyType="NodeStructuralMetadata",this.parentTypes=[N.NODE]}getDefaults(){return Object.assign(super.getDefaults(),{class:"",properties:{}})}getClass(){return this.get("class")}setClass(e){return this.set("class",e)}getProperties(){return this.get("properties")}setProperties(e){return this.set("properties",e)}},Uc=class extends z{static EXTENSION_NAME=K;init(){this.extensionName=K,this.propertyType="MeshPrimitiveStructuralMetadata",this.parentTypes=[N.PRIMITIVE]}getDefaults(){return Object.assign(super.getDefaults(),{propertyTextures:new he,propertyAttributes:new he})}listPropertyTextures(){return this.listRefs("propertyTextures")}addPropertyTexture(e){return this.addRef("propertyTextures",e)}removePropertyTexture(e){return this.removeRef("propertyTextures",e)}listPropertyAttributes(){return this.listRefs("propertyAttributes")}addPropertyAttribute(e){return this.addRef("propertyAttributes",e)}removePropertyAttribute(e){return this.removeRef("propertyAttributes",e)}},Lc=class extends Z{extensionName=K;static EXTENSION_NAME=K;prewriteTypes=[N.BUFFER];prereadTypes=[N.SCENE];createStructuralMetadata(){return new Rc(this.document.getGraph())}createSchema(){return new Ic(this.document.getGraph())}createClass(){return new Ac(this.document.getGraph())}createClassProperty(){return new Sc(this.document.getGraph())}createEnum(){return new _c(this.document.getGraph())}createEnumValue(){return new Nc(this.document.getGraph())}createPropertyTable(){return new jc(this.document.getGraph())}createPropertyTableProperty(){return new Fc(this.document.getGraph())}createPropertyTexture(){return new Cc(this.document.getGraph())}createPropertyTextureProperty(){return new Bc(this.document.getGraph())}createPropertyAttribute(){return new Oc(this.document.getGraph())}createPropertyAttributeProperty(){return new Pc(this.document.getGraph())}createNodeStructuralMetadata(){return new Dc(this.document.getGraph())}createMeshPrimitiveStructuralMetadata(){return new Uc(this.document.getGraph())}read(e){return this}preread(e){let t=this.document.getRoot(),{json:a}=e.jsonDoc,s=a.extensions[K],r=Kc(this,e,s);return t.setExtension(K,r),(a.meshes||[]).forEach((n,i)=>{let o=e.meshes[i].listPrimitives();(n.primitives||[]).forEach((c,l)=>{let p=o[l];this._readPrimitive(r,p,c)})}),(a.nodes||[]).forEach((n,i)=>{this._readNode(e.nodes[i],n)}),this}_readPrimitive(e,t,a){if(!a.extensions||!a.extensions.EXT_structural_metadata)return;let s=this.createMeshPrimitiveStructuralMetadata(),r=a.extensions[K],n=e.listPropertyTextures(),i=r.propertyTextures||[];for(let l of i){let p=n[l];s.addPropertyTexture(p)}let o=e.listPropertyAttributes(),c=r.propertyAttributes||[];for(let l of c){let p=o[l];s.addPropertyAttribute(p)}t.setExtension(K,s)}_readNode(e,t){if(!t.extensions||!t.extensions.EXT_structural_metadata)return;let a=t.extensions[K],s=this.createNodeStructuralMetadata().setClass(a.class).setProperties(a.properties);e.setExtension(K,s)}write(e){let t=this.document.getRoot(),a=t.getExtension(K);if(!a)return this;let s=e.jsonDoc.json,r=Zc(e,a);s.extensions=s.extensions||{},s.extensions[K]=r;let n=t.listMeshes(),i=s.meshes;if(i)for(let l of n){let p=i[e.meshIndexMap.get(l)];l.listPrimitives().forEach((g,v)=>{let x=p.primitives[v];this._writePrimitive(a,g,x)})}let o=t.listNodes(),c=s.nodes;if(c)for(let l of o){let p=e.nodeIndexMap.get(l);this._writeNode(l,c[p])}return this}_writePrimitive(e,t,a){let s=t.getExtension(K);if(!s)return;let r=e.listPropertyTextures(),n=e.listPropertyAttributes(),i,o,c=s.listPropertyTextures();if(c.length>0){i=[];for(let g of c){let v=r.indexOf(g);if(v>=0)i.push(v);else throw new Error(`${K}: Invalid property texture in mesh primitive`)}}let l=s.listPropertyAttributes();if(l.length>0){o=[];for(let g of l){let v=n.indexOf(g);if(v>=0)o.push(v);else throw new Error(`${K}: Invalid property attribute in mesh primitive`)}}let p={propertyTextures:i,propertyAttributes:o};a.extensions=a.extensions||{},a.extensions[K]=p}_writeNode(e,t){let a=e.getExtension("EXT_structural_metadata");a&&(t.extensions=t.extensions||{},t.extensions[K]={class:a.getClass(),properties:a.getProperties()})}prewrite(e,t){return t===N.BUFFER&&this._prewriteBuffers(e),this}_prewriteBuffers(e){let t=this.document,a=t.getRoot().getExtension(K);e.jsonDoc.json.bufferViews||=[];for(let s of a.listPropertyTables())for(let r of s.listPropertyValues()){let n=fd(t,e);n.push(r.getValues());let i=r.getArrayOffsets();i&&n.push(i);let o=r.getStringOffsets();o&&n.push(o)}}};function Kc(e,t,a){let s=e.createStructuralMetadata();if(a.schema!==void 0){let o=Gc(e,a.schema);s.setSchema(o)}else if(a.schemaUri){let o=a.schemaUri;s.setSchemaUri(o)}let r=a.propertyTextures||[];for(let o of r){let c=Xc(e,t,o);s.addPropertyTexture(c)}let n=a.propertyTables||[];for(let o of n){let c=Jc(e,t,o);s.addPropertyTable(c)}let i=a.propertyAttributes||[];for(let o of i){let c=$c(e,o);s.addPropertyAttribute(c)}return s}function Gc(e,t){let a=e.createSchema().setId(t.id);t.name!==void 0&&a.setName(t.name),t.description!==void 0&&a.setDescription(t.description),t.version!==void 0&&a.setVersion(t.version);let s=t.classes||{};for(let n of Object.keys(s)){let i=s[n];a.setClass(n,Vc(e,i))}let r=t.enums||{};for(let n of Object.keys(r))a.setEnum(n,Hc(e,r[n]));return a}function Vc(e,t){let a=e.createClass();t.name!==void 0&&a.setName(t.name),t.description!==void 0&&a.setDescription(t.description);let s=t.properties||{};for(let r of Object.keys(s)){let n=zc(e,s[r]);a.setProperty(r,n)}return a}function zc(e,t){let a=e.createClassProperty().setType(t.type);return t.name!==void 0&&a.setName(t.name),t.description!==void 0&&a.setDescription(t.description),t.componentType!==void 0&&a.setComponentType(t.componentType),t.enumType!==void 0&&a.setEnumType(t.enumType),t.array!==void 0&&a.setArray(t.array),t.count!==void 0&&a.setCount(t.count),t.normalized!==void 0&&a.setNormalized(t.normalized),t.offset!==void 0&&a.setOffset(t.offset),t.scale!==void 0&&a.setScale(t.scale),t.max!==void 0&&a.setMax(t.max),t.min!==void 0&&a.setMin(t.min),t.required!==void 0&&a.setRequired(t.required),t.noData!==void 0&&a.setNoData(t.noData),t.default!==void 0&&a.setDefault(t.default),a}function Hc(e,t){let a=e.createEnum();t.name!==void 0&&a.setName(t.name),t.description!==void 0&&a.setDescription(t.description),t.valueType!==void 0&&a.setValueType(t.valueType);let s=t.values||{};for(let r of s)a.addEnumValue(qc(e,r));return a}function qc(e,t){let a=e.createEnumValue();return t.name!==void 0&&a.setName(t.name),t.description!==void 0&&a.setDescription(t.description),t.value!==void 0&&a.setValue(t.value),a}function Xc(e,t,a){let s=e.createPropertyTexture();s.setClass(a.class),a.name!==void 0&&s.setName(a.name);let r=a.properties||{};for(let n of Object.keys(r)){let i=Wc(e,t,r[n]);s.setProperty(n,i)}return s}function Wc(e,t,a){let s=e.createPropertyTextureProperty(),r=t.jsonDoc.json.textures||[];a.channels&&s.setChannels(a.channels);let n=r[a.index].source;if(n!==void 0){let i=t.textures[n];s.setTexture(i);let o=s.getTextureInfo();o&&t.setTextureInfo(o,a)}return a.offset!==void 0&&s.setOffset(a.offset),a.scale!==void 0&&s.setScale(a.scale),a.max!==void 0&&s.setMax(a.max),a.min!==void 0&&s.setMin(a.min),s}function Jc(e,t,a){let s=e.createPropertyTable().setClass(a.class).setCount(a.count);a.name!==void 0&&s.setName(a.name);let r=a.properties||{};for(let n of Object.keys(r)){let i=Yc(e,t,r[n]);s.setProperty(n,i)}return s}function Yc(e,t,a){let s=e.createPropertyTableProperty(),r=xs(t,a.values);if(s.setValues(r),a.arrayOffsets!==void 0){let n=xs(t,a.arrayOffsets);s.setArrayOffsets(n)}if(a.stringOffsets!==void 0){let n=xs(t,a.stringOffsets);s.setStringOffsets(n)}return a.arrayOffsetType!==void 0&&s.setArrayOffsetType(a.arrayOffsetType),a.stringOffsetType!==void 0&&s.setStringOffsetType(a.stringOffsetType),a.offset!==void 0&&s.setOffset(a.offset),a.scale!==void 0&&s.setScale(a.scale),a.max!==void 0&&s.setMax(a.max),a.min!==void 0&&s.setMin(a.min),s}function $c(e,t){let a=e.createPropertyAttribute();a.setClass(t.class),t.name!==void 0&&a.setName(t.name);let s=t.properties||{};for(let r of Object.keys(s)){let n=Qc(e,s[r]);a.setProperty(r,n)}return a}function Qc(e,t){let a=e.createPropertyAttributeProperty();return a.setAttribute(t.attribute),t.offset!==void 0&&a.setOffset(t.offset),t.scale!==void 0&&a.setScale(t.scale),t.max!==void 0&&a.setMax(t.max),t.min!==void 0&&a.setMin(t.min),a}function Zc(e,t){let a={},s=t.getSchema();s&&(a.schema=ed(s));let r=t.getSchemaUri();r&&(a.schemaUri=r);let n=t.listPropertyTables();if(n.length>0){let c=[];for(let l of n){let p=nd(e,l);c.push(p)}a.propertyTables=c}let i=t.listPropertyTextures();if(i.length>0){let c=[];for(let l of i){let p=dd(e,l);c.push(p)}a.propertyTextures=c}let o=t.listPropertyAttributes();if(o.length>0){let c=[];for(let l of o){let p=od(l);c.push(p)}a.propertyAttributes=c}return a}function ed(e){let t={id:e.getId()},a=e.listClassKeys();if(a.length>0){t.classes={};for(let r of a){let n=td(e.getClass(r));t.classes[r]=n}}let s=e.listEnumKeys();if(s.length>0){t.enums={};for(let r of s){let n=sd(e.getEnum(r));t.enums[r]=n}}return e.getName()&&(t.name=e.getName()),e.getDescription()&&(t.description=e.getDescription()),e.getVersion()&&(t.version=e.getVersion()),t}function td(e){let t={},a=e.listPropertyKeys();if(a.length>0){t.properties={};for(let s of a){let r=e.getProperty(s);t.properties[s]=ad(r)}}return e.getName()&&(t.name=e.getName()),e.getDescription()&&(t.description=e.getDescription()),t}function ad(e){let t={type:e.getType()};return e.getArray()&&(t.array=e.getArray()),e.getNormalized()&&(t.normalized=e.getNormalized()),e.getRequired()&&(t.required=e.getRequired()),e.getName()&&(t.name=e.getName()),e.getDescription()&&(t.description=e.getDescription()),e.getComponentType()!=null&&(t.componentType=e.getComponentType()),e.getEnumType()!=null&&(t.enumType=e.getEnumType()),e.getCount()!=null&&(t.count=e.getCount()),e.getOffset()!=null&&(t.offset=e.getOffset()),e.getScale()!=null&&(t.scale=e.getScale()),e.getMax()!=null&&(t.max=e.getMax()),e.getMin()!=null&&(t.min=e.getMin()),e.getNoData()!=null&&(t.noData=e.getNoData()),e.getDefault()!=null&&(t.default=e.getDefault()),t}function sd(e){let t={values:e.listValues().map(rd)};return e.getName()&&(t.name=e.getName()),e.getDescription()&&(t.description=e.getDescription()),e.getValueType()!=="UINT16"&&(t.valueType=e.getValueType()),t}function rd(e){let t={name:e.getName(),value:e.getValue()};return e.getDescription()&&(t.description=e.getDescription()),t}function nd(e,t){let a={class:t.getClass(),count:t.getCount()};t.getName()&&(a.name=t.getName());let s=t.listPropertyKeys();if(s.length>0){a.properties={};for(let r of s){let n=id(e,t.getProperty(r));a.properties[r]=n}}return a}function id(e,t){let a=t.getValues(),s={values:e.otherBufferViewsIndexMap.get(a)};if(t.getArrayOffsets()){let r=t.getArrayOffsets();s.arrayOffsets=e.otherBufferViewsIndexMap.get(r)}if(t.getStringOffsets()){let r=t.getStringOffsets();s.stringOffsets=e.otherBufferViewsIndexMap.get(r)}return t.getArrayOffsetType()!=null&&(s.arrayOffsetType=t.getArrayOffsetType()),t.getStringOffsetType()!=null&&(s.stringOffsetType=t.getStringOffsetType()),t.getOffset()!=null&&(s.offset=t.getOffset()),t.getScale()!=null&&(s.scale=t.getScale()),t.getMax()!=null&&(s.max=t.getMax()),t.getMin()!=null&&(s.min=t.getMin()),s}function od(e){let t={class:e.getClass()};e.getName()&&(t.name=e.getName());let a=e.listPropertyKeys();if(a.length>0){t.properties={};for(let s of a){let r=cd(e.getProperty(s));t.properties[s]=r}}return t}function cd(e){let t={attribute:e.getAttribute()};return e.getOffset()!=null&&(t.offset=e.getOffset()),e.getScale()!=null&&(t.scale=e.getScale()),e.getMax()!=null&&(t.max=e.getMax()),e.getMin()!=null&&(t.min=e.getMin()),t}function dd(e,t){let a={class:t.getClass()};t.getName()&&(a.name=t.getName());let s=t.listPropertyKeys();if(s.length>0){a.properties={};for(let r of s){let n=ld(e,t.getProperty(r));a.properties[r]=n}}return a}function ld(e,t){let a=t.getTexture(),s=t.getTextureInfo(),r=t.getChannels(),n=e.createTextureInfoDef(a,s);return re.eq(r,[0])||(n.channels=r),t.getOffset()!=null&&(n.offset=t.getOffset()),t.getScale()!=null&&(n.scale=t.getScale()),t.getMax()!=null&&(n.max=t.getMax()),t.getMin()!=null&&(n.min=t.getMin()),n}function xs(e,t){let a=e.jsonDoc,s=a.json.buffers||[],r=(a.json.bufferViews||[])[t],n=s[r.buffer],i=n.uri?a.resources[n.uri]:a.resources[Qe],o=r.byteOffset||0,c=r.byteLength;return i.slice(o,o+c)}function fd(e,t){let a=e.getRoot().listBuffers()[0],s=t.otherBufferViews.get(a);return s||(s=[],t.otherBufferViews.set(a,s)),s}var ud=class{match(e){return e.length>=12&&G.decodeText(e.slice(4,12))==="ftypavif"}getSize(e){if(!this.match(e))return null;let t=new DataView(e.buffer,e.byteOffset,e.byteLength),a=tn(t,0);if(!a)return null;let s=a.end;for(;a=tn(t,s);)if(a.type==="meta")s=a.start+4;else if(a.type==="iprp"||a.type==="ipco")s=a.start;else{if(a.type==="ispe")return[t.getUint32(a.start+4),t.getUint32(a.start+8)];if(a.type==="mdat")break;s=a.end}return null}getChannels(e){return 4}},hd=class extends Z{extensionName=Ta;prereadTypes=[N.TEXTURE];static EXTENSION_NAME=Ta;static register(){Le.registerFormat("image/avif",new ud)}preread(e){return(e.jsonDoc.json.textures||[]).forEach(t=>{t.extensions&&t.extensions.EXT_texture_avif&&(t.source=t.extensions[Ta].source)}),this}read(e){return this}write(e){let t=e.jsonDoc;return this.document.getRoot().listTextures().forEach(a=>{if(a.getMimeType()==="image/avif"){let s=e.imageIndexMap.get(a);(t.json.textures||[]).forEach(r=>{r.source===s&&(r.extensions=r.extensions||{},r.extensions[Ta]={source:r.source},delete r.source)})}}),this}};function tn(e,t){if(e.byteLength<4+t)return null;let a=e.getUint32(t);return e.byteLength<a+t||a<8?null:{type:G.decodeText(new Uint8Array(e.buffer,e.byteOffset+t+4,4)),start:t+8,end:t+a}}var bd=class{match(e){return e.length>=12&&e[8]===87&&e[9]===69&&e[10]===66&&e[11]===80}getSize(e){let t=G.decodeText(e.slice(0,4)),a=G.decodeText(e.slice(8,12));if(t!=="RIFF"||a!=="WEBP")return null;let s=new DataView(e.buffer,e.byteOffset),r=12;for(;r<s.byteLength;){let n=G.decodeText(new Uint8Array([s.getUint8(r),s.getUint8(r+1),s.getUint8(r+2),s.getUint8(r+3)])),i=s.getUint32(r+4,!0);if(n==="VP8 ")return[s.getInt16(r+14,!0)&16383,s.getInt16(r+16,!0)&16383];if(n==="VP8L"){let o=s.getUint8(r+9),c=s.getUint8(r+10),l=s.getUint8(r+11),p=s.getUint8(r+12);return[1+((c&63)<<8|o),1+((p&15)<<10|l<<2|(c&192)>>6)]}r+=8+i+i%2}return null}getChannels(e){return 4}},gd=class extends Z{extensionName=va;prereadTypes=[N.TEXTURE];static EXTENSION_NAME=va;static register(){Le.registerFormat("image/webp",new bd)}preread(e){return(e.jsonDoc.json.textures||[]).forEach(t=>{t.extensions&&t.extensions.EXT_texture_webp&&(t.source=t.extensions[va].source)}),this}read(e){return this}write(e){let t=e.jsonDoc;return this.document.getRoot().listTextures().forEach(a=>{if(a.getMimeType()==="image/webp"){let s=e.imageIndexMap.get(a);(t.json.textures||[]).forEach(r=>{r.source===s&&(r.extensions=r.extensions||{},r.extensions[va]={source:r.source},delete r.source)})}}),this}},an=ic,pd=class extends Z{extensionName=an;static EXTENSION_NAME=an;read(e){return this}write(e){return this}},sn=oc,md=class extends Z{extensionName=sn;static EXTENSION_NAME=sn;read(e){return this}write(e){return this}},fe,yn,xn;function yd(e,t){let a=new fe.DecoderBuffer;try{if(a.Init(t,t.length),e.GetEncodedGeometryType(a)!==fe.TRIANGULAR_MESH)throw new Error(`[${oe}] Unknown geometry type.`);let s=new fe.Mesh;if(!e.DecodeBufferToMesh(a,s).ok()||s.ptr===0)throw new Error(`[${oe}] Decoding failure.`);return s}finally{fe.destroy(a)}}function xd(e,t){let a=t.num_faces()*3,s,r;if(t.num_points()<=65534){let n=a*Uint16Array.BYTES_PER_ELEMENT;s=fe._malloc(n),e.GetTrianglesUInt16Array(t,n,s),r=new Uint16Array(fe.HEAPU16.buffer,s,a).slice()}else{let n=a*Uint32Array.BYTES_PER_ELEMENT;s=fe._malloc(n),e.GetTrianglesUInt32Array(t,n,s),r=new Uint32Array(fe.HEAPU32.buffer,s,a).slice()}return fe._free(s),r}function wd(e,t,a,s){let r=xn[s.componentType],n=yn[s.componentType],i=a.num_components(),o=t.num_points()*i,c=o*n.BYTES_PER_ELEMENT,l=fe._malloc(c);e.GetAttributeDataArrayForAllPoints(t,a,r,c,l);let p=new n(fe.HEAPF32.buffer,l,o).slice();return fe._free(l),p}function vd(e){fe=e,yn={[L.ComponentType.FLOAT]:Float32Array,[L.ComponentType.UNSIGNED_INT]:Uint32Array,[L.ComponentType.UNSIGNED_SHORT]:Uint16Array,[L.ComponentType.UNSIGNED_BYTE]:Uint8Array,[L.ComponentType.SHORT]:Int16Array,[L.ComponentType.BYTE]:Int8Array},xn={[L.ComponentType.FLOAT]:fe.DT_FLOAT32,[L.ComponentType.UNSIGNED_INT]:fe.DT_UINT32,[L.ComponentType.UNSIGNED_SHORT]:fe.DT_UINT16,[L.ComponentType.UNSIGNED_BYTE]:fe.DT_UINT8,[L.ComponentType.SHORT]:fe.DT_INT16,[L.ComponentType.BYTE]:fe.DT_INT8}}var je,Td=(function(e){return e[e.EDGEBREAKER=1]="EDGEBREAKER",e[e.SEQUENTIAL=0]="SEQUENTIAL",e})({}),wn={POSITION:14,NORMAL:10,COLOR:8,TEX_COORD:12,GENERIC:12},rn={decodeSpeed:5,encodeSpeed:5,method:1,quantizationBits:wn,quantizationVolume:"mesh"};function Ed(e){je=e}function kd(e,t=rn){let a={...rn,...t};a.quantizationBits={...wn,...t.quantizationBits};let s=new je.MeshBuilder,r=new je.Mesh,n=new je.ExpertEncoder(r),i={},o=new je.DracoInt8Array,c=e.listTargets().length>0,l=!1;for(let d of e.listSemantics()){let m=e.getAttribute(d);if(m.getSparse()){l=!0;continue}let f=Md(d),h=Rd(s,m.getComponentType(),r,je[f],m.getCount(),m.getElementSize(),m.getArray());if(h===-1)throw new Error(`Error compressing "${d}" attribute.`);if(i[d]=h,a.quantizationVolume==="mesh"||d!=="POSITION")n.SetAttributeQuantization(h,a.quantizationBits[f]);else if(typeof a.quantizationVolume=="object"){let{quantizationVolume:y}=a,w=Math.max(y.max[0]-y.min[0],y.max[1]-y.min[1],y.max[2]-y.min[2]);n.SetAttributeExplicitQuantization(h,a.quantizationBits[f],m.getElementSize(),y.min,w)}else throw new Error("Invalid quantization volume state.")}let p=e.getIndices();if(!p)throw new Es("Primitive must have indices.");s.AddFacesToMesh(r,p.getCount()/3,p.getArray()),n.SetSpeedOptions(a.encodeSpeed,a.decodeSpeed),n.SetTrackEncodedProperties(!0),a.method===0||c||l?n.SetEncodingMethod(je.MESH_SEQUENTIAL_ENCODING):n.SetEncodingMethod(je.MESH_EDGEBREAKER_ENCODING);let g=n.EncodeToDracoBuffer(!(c||l),o);if(g<=0)throw new Es("Error applying Draco compression.");let v=new Uint8Array(g);for(let d=0;d<g;++d)v[d]=o.GetValue(d);let x=n.GetNumberOfEncodedPoints(),u=n.GetNumberOfEncodedFaces()*3;return je.destroy(o),je.destroy(r),je.destroy(s),je.destroy(n),{numVertices:x,numIndices:u,data:v,attributeIDs:i}}function Md(e){return e==="POSITION"?"POSITION":e==="NORMAL"?"NORMAL":e.startsWith("COLOR_")?"COLOR":e.startsWith("TEXCOORD_")?"TEX_COORD":"GENERIC"}function Rd(e,t,a,s,r,n,i){switch(t){case L.ComponentType.UNSIGNED_BYTE:return e.AddUInt8Attribute(a,s,r,n,i);case L.ComponentType.BYTE:return e.AddInt8Attribute(a,s,r,n,i);case L.ComponentType.UNSIGNED_SHORT:return e.AddUInt16Attribute(a,s,r,n,i);case L.ComponentType.SHORT:return e.AddInt16Attribute(a,s,r,n,i);case L.ComponentType.UNSIGNED_INT:return e.AddUInt32Attribute(a,s,r,n,i);case L.ComponentType.FLOAT:return e.AddFloatAttribute(a,s,r,n,i);default:throw new Error(`Unexpected component type, "${t}".`)}}var Es=class extends Error{},Id=class extends Z{extensionName=oe;prereadTypes=[N.PRIMITIVE];prewriteTypes=[N.ACCESSOR];readDependencies=["draco3d.decoder"];writeDependencies=["draco3d.encoder"];static EXTENSION_NAME=oe;static EncoderMethod=Td;_decoderModule=null;_encoderModule=null;_encoderOptions={};install(e,t){return e==="draco3d.decoder"&&(this._decoderModule=t,vd(this._decoderModule)),e==="draco3d.encoder"&&(this._encoderModule=t,Ed(this._encoderModule)),this}setEncoderOptions(e){return this._encoderOptions=e,this}preread(e){if(!this._decoderModule)throw new Error(`[${oe}] Please install extension dependency, "draco3d.decoder".`);let t=this.document.getLogger(),a=e.jsonDoc,s=new Map;try{let r=a.json.meshes||[];for(let n of r)for(let i of n.primitives){if(!i.extensions||!i.extensions.KHR_draco_mesh_compression)continue;let o=i.extensions[oe],[c,l]=s.get(o.bufferView)||[];if(!l||!c){let p=a.json.bufferViews[o.bufferView],g=a.json.buffers[p.buffer],v=g.uri?a.resources[g.uri]:a.resources[Qe],x=p.byteOffset||0,u=p.byteLength,d=G.toView(v,x,u);c=new this._decoderModule.Decoder,l=yd(c,d),s.set(o.bufferView,[c,l]),t.debug(`[${oe}] Decompressed ${d.byteLength} bytes.`)}for(let p in o.attributes){let g=e.jsonDoc.json.accessors[i.attributes[p]],v=c.GetAttributeByUniqueId(l,o.attributes[p]),x=wd(c,l,v,g);e.accessors[i.attributes[p]].setArray(x)}i.indices!==void 0&&e.accessors[i.indices].setArray(xd(c,l))}}finally{for(let[r,n]of Array.from(s.values()))this._decoderModule.destroy(r),this._decoderModule.destroy(n)}return this}read(e){return this}prewrite(e,t){if(!this._encoderModule)throw new Error(`[${oe}] Please install extension dependency, "draco3d.encoder".`);let a=this.document.getLogger();a.debug(`[${oe}] Compression options: ${JSON.stringify(this._encoderOptions)}`);let s=Ad(this.document),r=new Map,n="mesh";this._encoderOptions.quantizationVolume==="scene"&&(this.document.getRoot().listScenes().length!==1?a.warn(`[${oe}]: quantizationVolume=scene requires exactly 1 scene.`):n=Nr(this.document.getRoot().listScenes().pop()));for(let i of Array.from(s.keys())){let o=s.get(i);if(!o)throw new Error("Unexpected primitive.");if(r.has(o)){r.set(o,r.get(o));continue}let c=i.getIndices(),l=e.jsonDoc.json.accessors,p;try{p=kd(i,{...this._encoderOptions,quantizationVolume:n})}catch(x){if(x instanceof Es){a.warn(`[${oe}]: ${x.message} Skipping primitive compression.`);continue}throw x}r.set(o,p);let g=e.createAccessorDef(c);g.count=p.numIndices,e.accessorIndexMap.set(c,l.length),l.push(g),p.numVertices>65534&&L.getComponentSize(g.componentType)<=2?g.componentType=L.ComponentType.UNSIGNED_INT:p.numVertices>254&&L.getComponentSize(g.componentType)<=1&&(g.componentType=L.ComponentType.UNSIGNED_SHORT);for(let x of i.listSemantics()){let u=i.getAttribute(x);if(p.attributeIDs[x]===void 0)continue;let d=e.createAccessorDef(u);d.count=p.numVertices,e.accessorIndexMap.set(u,l.length),l.push(d)}let v=i.getAttribute("POSITION").getBuffer()||this.document.getRoot().listBuffers()[0];e.otherBufferViews.has(v)||e.otherBufferViews.set(v,[]),e.otherBufferViews.get(v).push(p.data)}return a.debug(`[${oe}] Compressed ${s.size} primitives.`),e.extensionData[oe]={primitiveHashMap:s,primitiveEncodingMap:r},this}write(e){let t=e.extensionData[oe];for(let a of this.document.getRoot().listMeshes()){let s=e.jsonDoc.json.meshes[e.meshIndexMap.get(a)];for(let r=0;r<a.listPrimitives().length;r++){let n=a.listPrimitives()[r],i=s.primitives[r],o=t.primitiveHashMap.get(n);if(!o)continue;let c=t.primitiveEncodingMap.get(o);c&&(i.extensions=i.extensions||{},i.extensions[oe]={bufferView:e.otherBufferViewsIndexMap.get(c.data),attributes:c.attributeIDs})}}if(!t.primitiveHashMap.size){let a=e.jsonDoc.json;a.extensionsUsed=(a.extensionsUsed||[]).filter(s=>s!==oe),a.extensionsRequired=(a.extensionsRequired||[]).filter(s=>s!==oe)}return this}};function Ad(e){let t=e.getLogger(),a=new Set,s=new Set,r=0,n=0;for(let g of e.getRoot().listMeshes())for(let v of g.listPrimitives())v.getIndices()?v.getMode()!==Dt.Mode.TRIANGLES?(s.add(v),n++):a.add(v):(s.add(v),r++);r>0&&t.warn(`[${oe}] Skipping Draco compression of ${r} non-indexed primitives.`),n>0&&t.warn(`[${oe}] Skipping Draco compression of ${n} non-TRIANGLES primitives.`);let i=e.getRoot().listAccessors(),o=new Map;for(let g=0;g<i.length;g++)o.set(i[g],g);let c=new Map,l=new Set,p=new Map;for(let g of Array.from(a)){let v=nn(g,o);if(l.has(v)){p.set(g,v);continue}if(c.has(g.getIndices())){let x=g.getIndices(),u=x.clone();o.set(u,e.getRoot().listAccessors().length-1),g.swap(x,u)}for(let x of g.listAttributes())if(c.has(x)){let u=x.clone();o.set(u,e.getRoot().listAccessors().length-1),g.swap(x,u)}v=nn(g,o),l.add(v),p.set(g,v),c.set(g.getIndices(),v);for(let x of g.listAttributes())c.set(x,v)}for(let g of Array.from(c.keys())){let v=new Set(g.listParents().map(x=>x.propertyType));if(v.size!==2||!v.has(N.PRIMITIVE)||!v.has(N.ROOT))throw new Error(`[${oe}] Compressed accessors must only be used as indices or vertex attributes.`)}for(let g of Array.from(a)){let v=p.get(g),x=g.getIndices();if(c.get(x)!==v||g.listAttributes().some(u=>c.get(u)!==v))throw new Error(`[${oe}] Draco primitives must share all, or no, accessors.`)}for(let g of Array.from(s)){let v=g.getIndices();if(c.has(v)||g.listAttributes().some(x=>c.has(x)))throw new Error(`[${oe}] Accessor cannot be shared by compressed and uncompressed primitives.`)}return p}function nn(e,t){let a=[],s=e.getIndices();a.push(t.get(s));for(let r of e.listAttributes())a.push(t.get(r));return a.sort().join("|")}var on=class vn extends z{static EXTENSION_NAME=ze;static Type={POINT:"point",SPOT:"spot",DIRECTIONAL:"directional"};init(){this.extensionName=ze,this.propertyType="Light",this.parentTypes=[N.NODE]}getDefaults(){return Object.assign(super.getDefaults(),{color:[1,1,1],intensity:1,type:vn.Type.POINT,range:null,innerConeAngle:0,outerConeAngle:Math.PI/4})}getColor(){return this.get("color")}setColor(t){return this.set("color",t)}getIntensity(){return this.get("intensity")}setIntensity(t){return this.set("intensity",t)}getType(){return this.get("type")}setType(t){return this.set("type",t)}getRange(){return this.get("range")}setRange(t){return this.set("range",t)}getInnerConeAngle(){return this.get("innerConeAngle")}setInnerConeAngle(t){return this.set("innerConeAngle",t)}getOuterConeAngle(){return this.get("outerConeAngle")}setOuterConeAngle(t){return this.set("outerConeAngle",t)}},Sd=class extends Z{extensionName=ze;static EXTENSION_NAME=ze;createLight(e=""){return new on(this.document.getGraph(),e)}read(e){let t=e.jsonDoc;if(!t.json.extensions||!t.json.extensions.KHR_lights_punctual)return this;let a=(t.json.extensions.KHR_lights_punctual.lights||[]).map(s=>{let r=this.createLight().setName(s.name||"").setType(s.type);return s.extras&&r.setExtras(s.extras),s.color!==void 0&&r.setColor(s.color),s.intensity!==void 0&&r.setIntensity(s.intensity),s.range!==void 0&&r.setRange(s.range),s.spot?.innerConeAngle!==void 0&&r.setInnerConeAngle(s.spot.innerConeAngle),s.spot?.outerConeAngle!==void 0&&r.setOuterConeAngle(s.spot.outerConeAngle),r});return t.json.nodes.forEach((s,r)=>{if(!s.extensions||!s.extensions.KHR_lights_punctual)return;let n=s.extensions[ze];e.nodes[r].setExtension(ze,a[n.light])}),this}write(e){let t=e.jsonDoc;if(this.properties.size===0)return this;let a=[],s=new Map;for(let r of this.properties){let n=r,i=e.createPropertyDef(r);i.type=n.getType(),re.eq(n.getColor(),[1,1,1])||(i.color=n.getColor()),n.getIntensity()!==1&&(i.intensity=n.getIntensity()),n.getRange()!=null&&(i.range=n.getRange()),n.getName()&&(i.name=n.getName()),n.getType()===on.Type.SPOT&&(i.spot={innerConeAngle:n.getInnerConeAngle(),outerConeAngle:n.getOuterConeAngle()}),a.push(i),s.set(n,a.length-1)}return this.document.getRoot().listNodes().forEach(r=>{let n=r.getExtension(ze);if(n){let i=e.nodeIndexMap.get(r),o=t.json.nodes[i];o.extensions=o.extensions||{},o.extensions[ze]={light:s.get(n)}}}),t.json.extensions=t.json.extensions||{},t.json.extensions[ze]={lights:a},this}},{R:_d,G:Nd,B:jd}=Be,Fd=class extends z{static EXTENSION_NAME=tt;init(){this.extensionName=tt,this.propertyType="Anisotropy",this.parentTypes=[N.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{anisotropyStrength:0,anisotropyRotation:0,anisotropyTexture:null,anisotropyTextureInfo:new ae(this.graph,"anisotropyTextureInfo")})}getAnisotropyStrength(){return this.get("anisotropyStrength")}setAnisotropyStrength(e){return this.set("anisotropyStrength",e)}getAnisotropyRotation(){return this.get("anisotropyRotation")}setAnisotropyRotation(e){return this.set("anisotropyRotation",e)}getAnisotropyTexture(){return this.getRef("anisotropyTexture")}getAnisotropyTextureInfo(){return this.getRef("anisotropyTexture")?this.getRef("anisotropyTextureInfo"):null}setAnisotropyTexture(e){return this.setRef("anisotropyTexture",e,{channels:_d|Nd|jd})}},Cd=class extends Z{static EXTENSION_NAME=tt;extensionName=tt;prereadTypes=[N.MESH];prewriteTypes=[N.MESH];createAnisotropy(){return new Fd(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((r,n)=>{if(r.extensions&&r.extensions.KHR_materials_anisotropy){let i=this.createAnisotropy();e.materials[n].setExtension(tt,i);let o=r.extensions[tt];if(o.extras&&i.setExtras(o.extras),o.anisotropyStrength!==void 0&&i.setAnisotropyStrength(o.anisotropyStrength),o.anisotropyRotation!==void 0&&i.setAnisotropyRotation(o.anisotropyRotation),o.anisotropyTexture!==void 0){let c=o.anisotropyTexture,l=e.textures[s[c.index].source];i.setAnisotropyTexture(l),e.setTextureInfo(i.getAnisotropyTextureInfo(),c)}}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(tt);if(s){let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);if(n.extensions=n.extensions||{},n.extensions[tt]=i,s.getAnisotropyStrength()>0&&(i.anisotropyStrength=s.getAnisotropyStrength()),s.getAnisotropyRotation()!==0&&(i.anisotropyRotation=s.getAnisotropyRotation()),s.getAnisotropyTexture()){let o=s.getAnisotropyTexture(),c=s.getAnisotropyTextureInfo();i.anisotropyTexture=e.createTextureInfoDef(o,c)}}}),this}},{R:cn,G:dn,B:Bd}=Be,Od=class extends z{static EXTENSION_NAME=at;init(){this.extensionName=at,this.propertyType="Clearcoat",this.parentTypes=[N.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{clearcoatFactor:0,clearcoatTexture:null,clearcoatTextureInfo:new ae(this.graph,"clearcoatTextureInfo"),clearcoatRoughnessFactor:0,clearcoatRoughnessTexture:null,clearcoatRoughnessTextureInfo:new ae(this.graph,"clearcoatRoughnessTextureInfo"),clearcoatNormalScale:1,clearcoatNormalTexture:null,clearcoatNormalTextureInfo:new ae(this.graph,"clearcoatNormalTextureInfo")})}getClearcoatFactor(){return this.get("clearcoatFactor")}setClearcoatFactor(e){return this.set("clearcoatFactor",e)}getClearcoatTexture(){return this.getRef("clearcoatTexture")}getClearcoatTextureInfo(){return this.getRef("clearcoatTexture")?this.getRef("clearcoatTextureInfo"):null}setClearcoatTexture(e){return this.setRef("clearcoatTexture",e,{channels:cn})}getClearcoatRoughnessFactor(){return this.get("clearcoatRoughnessFactor")}setClearcoatRoughnessFactor(e){return this.set("clearcoatRoughnessFactor",e)}getClearcoatRoughnessTexture(){return this.getRef("clearcoatRoughnessTexture")}getClearcoatRoughnessTextureInfo(){return this.getRef("clearcoatRoughnessTexture")?this.getRef("clearcoatRoughnessTextureInfo"):null}setClearcoatRoughnessTexture(e){return this.setRef("clearcoatRoughnessTexture",e,{channels:dn})}getClearcoatNormalScale(){return this.get("clearcoatNormalScale")}setClearcoatNormalScale(e){return this.set("clearcoatNormalScale",e)}getClearcoatNormalTexture(){return this.getRef("clearcoatNormalTexture")}getClearcoatNormalTextureInfo(){return this.getRef("clearcoatNormalTexture")?this.getRef("clearcoatNormalTextureInfo"):null}setClearcoatNormalTexture(e){return this.setRef("clearcoatNormalTexture",e,{channels:cn|dn|Bd})}},Pd=class extends Z{static EXTENSION_NAME=at;extensionName=at;prereadTypes=[N.MESH];prewriteTypes=[N.MESH];createClearcoat(){return new Od(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((r,n)=>{if(r.extensions&&r.extensions.KHR_materials_clearcoat){let i=this.createClearcoat();e.materials[n].setExtension(at,i);let o=r.extensions[at];if(o.extras&&i.setExtras(o.extras),o.clearcoatFactor!==void 0&&i.setClearcoatFactor(o.clearcoatFactor),o.clearcoatRoughnessFactor!==void 0&&i.setClearcoatRoughnessFactor(o.clearcoatRoughnessFactor),o.clearcoatTexture!==void 0){let c=o.clearcoatTexture,l=e.textures[s[c.index].source];i.setClearcoatTexture(l),e.setTextureInfo(i.getClearcoatTextureInfo(),c)}if(o.clearcoatRoughnessTexture!==void 0){let c=o.clearcoatRoughnessTexture,l=e.textures[s[c.index].source];i.setClearcoatRoughnessTexture(l),e.setTextureInfo(i.getClearcoatRoughnessTextureInfo(),c)}if(o.clearcoatNormalTexture!==void 0){let c=o.clearcoatNormalTexture,l=e.textures[s[c.index].source];i.setClearcoatNormalTexture(l),e.setTextureInfo(i.getClearcoatNormalTextureInfo(),c),c.scale!==void 0&&i.setClearcoatNormalScale(c.scale)}}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(at);if(s){let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);if(n.extensions=n.extensions||{},n.extensions[at]=i,i.clearcoatFactor=s.getClearcoatFactor(),i.clearcoatRoughnessFactor=s.getClearcoatRoughnessFactor(),s.getClearcoatTexture()){let o=s.getClearcoatTexture(),c=s.getClearcoatTextureInfo();i.clearcoatTexture=e.createTextureInfoDef(o,c)}if(s.getClearcoatRoughnessTexture()){let o=s.getClearcoatRoughnessTexture(),c=s.getClearcoatRoughnessTextureInfo();i.clearcoatRoughnessTexture=e.createTextureInfoDef(o,c)}if(s.getClearcoatNormalTexture()){let o=s.getClearcoatNormalTexture(),c=s.getClearcoatNormalTextureInfo();i.clearcoatNormalTexture=e.createTextureInfoDef(o,c),s.getClearcoatNormalScale()!==1&&(i.clearcoatNormalTexture.scale=s.getClearcoatNormalScale())}}}),this}},{R:Dd,G:Ud,B:Ld,A:Kd}=Be,Gd=class extends z{static EXTENSION_NAME=st;init(){this.extensionName=st,this.propertyType="DiffuseTransmission",this.parentTypes=[N.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{diffuseTransmissionFactor:0,diffuseTransmissionTexture:null,diffuseTransmissionTextureInfo:new ae(this.graph,"diffuseTransmissionTextureInfo"),diffuseTransmissionColorFactor:[1,1,1],diffuseTransmissionColorTexture:null,diffuseTransmissionColorTextureInfo:new ae(this.graph,"diffuseTransmissionColorTextureInfo")})}getDiffuseTransmissionFactor(){return this.get("diffuseTransmissionFactor")}setDiffuseTransmissionFactor(e){return this.set("diffuseTransmissionFactor",e)}getDiffuseTransmissionTexture(){return this.getRef("diffuseTransmissionTexture")}getDiffuseTransmissionTextureInfo(){return this.getRef("diffuseTransmissionTexture")?this.getRef("diffuseTransmissionTextureInfo"):null}setDiffuseTransmissionTexture(e){return this.setRef("diffuseTransmissionTexture",e,{channels:Kd})}getDiffuseTransmissionColorFactor(){return this.get("diffuseTransmissionColorFactor")}setDiffuseTransmissionColorFactor(e){return this.set("diffuseTransmissionColorFactor",e)}getDiffuseTransmissionColorTexture(){return this.getRef("diffuseTransmissionColorTexture")}getDiffuseTransmissionColorTextureInfo(){return this.getRef("diffuseTransmissionColorTexture")?this.getRef("diffuseTransmissionColorTextureInfo"):null}setDiffuseTransmissionColorTexture(e){return this.setRef("diffuseTransmissionColorTexture",e,{channels:Dd|Ud|Ld})}},Vd=class extends Z{extensionName=st;static EXTENSION_NAME=st;createDiffuseTransmission(){return new Gd(this.document.getGraph())}read(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((r,n)=>{if(r.extensions&&r.extensions.KHR_materials_diffuse_transmission){let i=this.createDiffuseTransmission();e.materials[n].setExtension(st,i);let o=r.extensions[st];if(o.extras&&i.setExtras(o.extras),o.diffuseTransmissionFactor!==void 0&&i.setDiffuseTransmissionFactor(o.diffuseTransmissionFactor),o.diffuseTransmissionColorFactor!==void 0&&i.setDiffuseTransmissionColorFactor(o.diffuseTransmissionColorFactor),o.diffuseTransmissionTexture!==void 0){let c=o.diffuseTransmissionTexture,l=e.textures[s[c.index].source];i.setDiffuseTransmissionTexture(l),e.setTextureInfo(i.getDiffuseTransmissionTextureInfo(),c)}if(o.diffuseTransmissionColorTexture!==void 0){let c=o.diffuseTransmissionColorTexture,l=e.textures[s[c.index].source];i.setDiffuseTransmissionColorTexture(l),e.setTextureInfo(i.getDiffuseTransmissionColorTextureInfo(),c)}}}),this}write(e){let t=e.jsonDoc;for(let a of this.document.getRoot().listMaterials()){let s=a.getExtension(st);if(!s)continue;let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);if(n.extensions=n.extensions||{},n.extensions[st]=i,i.diffuseTransmissionFactor=s.getDiffuseTransmissionFactor(),i.diffuseTransmissionColorFactor=s.getDiffuseTransmissionColorFactor(),s.getDiffuseTransmissionTexture()){let o=s.getDiffuseTransmissionTexture(),c=s.getDiffuseTransmissionTextureInfo();i.diffuseTransmissionTexture=e.createTextureInfoDef(o,c)}if(s.getDiffuseTransmissionColorTexture()){let o=s.getDiffuseTransmissionColorTexture(),c=s.getDiffuseTransmissionColorTextureInfo();i.diffuseTransmissionColorTexture=e.createTextureInfoDef(o,c)}}return this}},zd=class extends z{static EXTENSION_NAME=rt;init(){this.extensionName=rt,this.propertyType="Dispersion",this.parentTypes=[N.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{dispersion:0})}getDispersion(){return this.get("dispersion")}setDispersion(e){return this.set("dispersion",e)}},Hd=class extends Z{static EXTENSION_NAME=rt;extensionName=rt;prereadTypes=[N.MESH];prewriteTypes=[N.MESH];createDispersion(){return new zd(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){return(e.jsonDoc.json.materials||[]).forEach((t,a)=>{if(t.extensions&&t.extensions.KHR_materials_dispersion){let s=this.createDispersion();e.materials[a].setExtension(rt,s);let r=t.extensions[rt];r.extras&&s.setExtras(r.extras),r.dispersion!==void 0&&s.setDispersion(r.dispersion)}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(rt);if(s){let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);n.extensions=n.extensions||{},n.extensions[rt]=i,i.dispersion=s.getDispersion()}}),this}},qd=class extends z{static EXTENSION_NAME=nt;init(){this.extensionName=nt,this.propertyType="EmissiveStrength",this.parentTypes=[N.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{emissiveStrength:1})}getEmissiveStrength(){return this.get("emissiveStrength")}setEmissiveStrength(e){return this.set("emissiveStrength",e)}},Xd=class extends Z{static EXTENSION_NAME=nt;extensionName=nt;prereadTypes=[N.MESH];prewriteTypes=[N.MESH];createEmissiveStrength(){return new qd(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){return(e.jsonDoc.json.materials||[]).forEach((t,a)=>{if(t.extensions&&t.extensions.KHR_materials_emissive_strength){let s=this.createEmissiveStrength();e.materials[a].setExtension(nt,s);let r=t.extensions[nt];r.extras&&s.setExtras(r.extras),r.emissiveStrength!==void 0&&s.setEmissiveStrength(r.emissiveStrength)}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(nt);if(s){let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);n.extensions=n.extensions||{},n.extensions[nt]=i,i.emissiveStrength=s.getEmissiveStrength()}}),this}},Wd=class extends z{static EXTENSION_NAME=it;init(){this.extensionName=it,this.propertyType="IOR",this.parentTypes=[N.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{ior:1.5})}getIOR(){return this.get("ior")}setIOR(e){return this.set("ior",e)}},Jd=class extends Z{static EXTENSION_NAME=it;extensionName=it;prereadTypes=[N.MESH];prewriteTypes=[N.MESH];createIOR(){return new Wd(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){return(e.jsonDoc.json.materials||[]).forEach((t,a)=>{if(t.extensions&&t.extensions.KHR_materials_ior){let s=this.createIOR();e.materials[a].setExtension(it,s);let r=t.extensions[it];r.extras&&s.setExtras(r.extras),r.ior!==void 0&&s.setIOR(r.ior)}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(it);if(s){let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);n.extensions=n.extensions||{},n.extensions[it]=i,i.ior=s.getIOR()}}),this}},{R:Yd,G:$d}=Be,Qd=class extends z{static EXTENSION_NAME=ot;init(){this.extensionName=ot,this.propertyType="Iridescence",this.parentTypes=[N.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{iridescenceFactor:0,iridescenceTexture:null,iridescenceTextureInfo:new ae(this.graph,"iridescenceTextureInfo"),iridescenceIOR:1.3,iridescenceThicknessMinimum:100,iridescenceThicknessMaximum:400,iridescenceThicknessTexture:null,iridescenceThicknessTextureInfo:new ae(this.graph,"iridescenceThicknessTextureInfo")})}getIridescenceFactor(){return this.get("iridescenceFactor")}setIridescenceFactor(e){return this.set("iridescenceFactor",e)}getIridescenceTexture(){return this.getRef("iridescenceTexture")}getIridescenceTextureInfo(){return this.getRef("iridescenceTexture")?this.getRef("iridescenceTextureInfo"):null}setIridescenceTexture(e){return this.setRef("iridescenceTexture",e,{channels:Yd})}getIridescenceIOR(){return this.get("iridescenceIOR")}setIridescenceIOR(e){return this.set("iridescenceIOR",e)}getIridescenceThicknessMinimum(){return this.get("iridescenceThicknessMinimum")}setIridescenceThicknessMinimum(e){return this.set("iridescenceThicknessMinimum",e)}getIridescenceThicknessMaximum(){return this.get("iridescenceThicknessMaximum")}setIridescenceThicknessMaximum(e){return this.set("iridescenceThicknessMaximum",e)}getIridescenceThicknessTexture(){return this.getRef("iridescenceThicknessTexture")}getIridescenceThicknessTextureInfo(){return this.getRef("iridescenceThicknessTexture")?this.getRef("iridescenceThicknessTextureInfo"):null}setIridescenceThicknessTexture(e){return this.setRef("iridescenceThicknessTexture",e,{channels:$d})}},Zd=class extends Z{static EXTENSION_NAME=ot;extensionName=ot;prereadTypes=[N.MESH];prewriteTypes=[N.MESH];createIridescence(){return new Qd(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((r,n)=>{if(r.extensions&&r.extensions.KHR_materials_iridescence){let i=this.createIridescence();e.materials[n].setExtension(ot,i);let o=r.extensions[ot];if(o.extras&&i.setExtras(o.extras),o.iridescenceFactor!==void 0&&i.setIridescenceFactor(o.iridescenceFactor),o.iridescenceIor!==void 0&&i.setIridescenceIOR(o.iridescenceIor),o.iridescenceThicknessMinimum!==void 0&&i.setIridescenceThicknessMinimum(o.iridescenceThicknessMinimum),o.iridescenceThicknessMaximum!==void 0&&i.setIridescenceThicknessMaximum(o.iridescenceThicknessMaximum),o.iridescenceTexture!==void 0){let c=o.iridescenceTexture,l=e.textures[s[c.index].source];i.setIridescenceTexture(l),e.setTextureInfo(i.getIridescenceTextureInfo(),c)}if(o.iridescenceThicknessTexture!==void 0){let c=o.iridescenceThicknessTexture,l=e.textures[s[c.index].source];i.setIridescenceThicknessTexture(l),e.setTextureInfo(i.getIridescenceThicknessTextureInfo(),c)}}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(ot);if(s){let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);if(n.extensions=n.extensions||{},n.extensions[ot]=i,s.getIridescenceFactor()>0&&(i.iridescenceFactor=s.getIridescenceFactor()),s.getIridescenceIOR()!==1.3&&(i.iridescenceIor=s.getIridescenceIOR()),s.getIridescenceThicknessMinimum()!==100&&(i.iridescenceThicknessMinimum=s.getIridescenceThicknessMinimum()),s.getIridescenceThicknessMaximum()!==400&&(i.iridescenceThicknessMaximum=s.getIridescenceThicknessMaximum()),s.getIridescenceTexture()){let o=s.getIridescenceTexture(),c=s.getIridescenceTextureInfo();i.iridescenceTexture=e.createTextureInfoDef(o,c)}if(s.getIridescenceThicknessTexture()){let o=s.getIridescenceThicknessTexture(),c=s.getIridescenceThicknessTextureInfo();i.iridescenceThicknessTexture=e.createTextureInfoDef(o,c)}}}),this}},{R:ln,G:fn,B:un,A:hn}=Be,el=class extends z{static EXTENSION_NAME=ct;init(){this.extensionName=ct,this.propertyType="PBRSpecularGlossiness",this.parentTypes=[N.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{diffuseFactor:[1,1,1,1],diffuseTexture:null,diffuseTextureInfo:new ae(this.graph,"diffuseTextureInfo"),specularFactor:[1,1,1],glossinessFactor:1,specularGlossinessTexture:null,specularGlossinessTextureInfo:new ae(this.graph,"specularGlossinessTextureInfo")})}getDiffuseFactor(){return this.get("diffuseFactor")}setDiffuseFactor(e){return this.set("diffuseFactor",e)}getDiffuseTexture(){return this.getRef("diffuseTexture")}getDiffuseTextureInfo(){return this.getRef("diffuseTexture")?this.getRef("diffuseTextureInfo"):null}setDiffuseTexture(e){return this.setRef("diffuseTexture",e,{channels:ln|fn|un|hn,isColor:!0})}getSpecularFactor(){return this.get("specularFactor")}setSpecularFactor(e){return this.set("specularFactor",e)}getGlossinessFactor(){return this.get("glossinessFactor")}setGlossinessFactor(e){return this.set("glossinessFactor",e)}getSpecularGlossinessTexture(){return this.getRef("specularGlossinessTexture")}getSpecularGlossinessTextureInfo(){return this.getRef("specularGlossinessTexture")?this.getRef("specularGlossinessTextureInfo"):null}setSpecularGlossinessTexture(e){return this.setRef("specularGlossinessTexture",e,{channels:ln|fn|un|hn})}},tl=class extends Z{static EXTENSION_NAME=ct;extensionName=ct;prereadTypes=[N.MESH];prewriteTypes=[N.MESH];createPBRSpecularGlossiness(){return new el(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((r,n)=>{if(r.extensions&&r.extensions.KHR_materials_pbrSpecularGlossiness){let i=this.createPBRSpecularGlossiness();e.materials[n].setExtension(ct,i);let o=r.extensions[ct];if(o.extras&&i.setExtras(o.extras),o.diffuseFactor!==void 0&&i.setDiffuseFactor(o.diffuseFactor),o.specularFactor!==void 0&&i.setSpecularFactor(o.specularFactor),o.glossinessFactor!==void 0&&i.setGlossinessFactor(o.glossinessFactor),o.diffuseTexture!==void 0){let c=o.diffuseTexture,l=e.textures[s[c.index].source];i.setDiffuseTexture(l),e.setTextureInfo(i.getDiffuseTextureInfo(),c)}if(o.specularGlossinessTexture!==void 0){let c=o.specularGlossinessTexture,l=e.textures[s[c.index].source];i.setSpecularGlossinessTexture(l),e.setTextureInfo(i.getSpecularGlossinessTextureInfo(),c)}}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(ct);if(s){let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);if(n.extensions=n.extensions||{},n.extensions[ct]=i,i.diffuseFactor=s.getDiffuseFactor(),i.specularFactor=s.getSpecularFactor(),i.glossinessFactor=s.getGlossinessFactor(),s.getDiffuseTexture()){let o=s.getDiffuseTexture(),c=s.getDiffuseTextureInfo();i.diffuseTexture=e.createTextureInfoDef(o,c)}if(s.getSpecularGlossinessTexture()){let o=s.getSpecularGlossinessTexture(),c=s.getSpecularGlossinessTextureInfo();i.specularGlossinessTexture=e.createTextureInfoDef(o,c)}}}),this}},{R:al,G:sl,B:rl,A:nl}=Be,il=class extends z{static EXTENSION_NAME=dt;init(){this.extensionName=dt,this.propertyType="Sheen",this.parentTypes=[N.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{sheenColorFactor:[0,0,0],sheenColorTexture:null,sheenColorTextureInfo:new ae(this.graph,"sheenColorTextureInfo"),sheenRoughnessFactor:0,sheenRoughnessTexture:null,sheenRoughnessTextureInfo:new ae(this.graph,"sheenRoughnessTextureInfo")})}getSheenColorFactor(){return this.get("sheenColorFactor")}setSheenColorFactor(e){return this.set("sheenColorFactor",e)}getSheenColorTexture(){return this.getRef("sheenColorTexture")}getSheenColorTextureInfo(){return this.getRef("sheenColorTexture")?this.getRef("sheenColorTextureInfo"):null}setSheenColorTexture(e){return this.setRef("sheenColorTexture",e,{channels:al|sl|rl,isColor:!0})}getSheenRoughnessFactor(){return this.get("sheenRoughnessFactor")}setSheenRoughnessFactor(e){return this.set("sheenRoughnessFactor",e)}getSheenRoughnessTexture(){return this.getRef("sheenRoughnessTexture")}getSheenRoughnessTextureInfo(){return this.getRef("sheenRoughnessTexture")?this.getRef("sheenRoughnessTextureInfo"):null}setSheenRoughnessTexture(e){return this.setRef("sheenRoughnessTexture",e,{channels:nl})}},ol=class extends Z{static EXTENSION_NAME=dt;extensionName=dt;prereadTypes=[N.MESH];prewriteTypes=[N.MESH];createSheen(){return new il(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((r,n)=>{if(r.extensions&&r.extensions.KHR_materials_sheen){let i=this.createSheen();e.materials[n].setExtension(dt,i);let o=r.extensions[dt];if(o.extras&&i.setExtras(o.extras),o.sheenColorFactor!==void 0&&i.setSheenColorFactor(o.sheenColorFactor),o.sheenRoughnessFactor!==void 0&&i.setSheenRoughnessFactor(o.sheenRoughnessFactor),o.sheenColorTexture!==void 0){let c=o.sheenColorTexture,l=e.textures[s[c.index].source];i.setSheenColorTexture(l),e.setTextureInfo(i.getSheenColorTextureInfo(),c)}if(o.sheenRoughnessTexture!==void 0){let c=o.sheenRoughnessTexture,l=e.textures[s[c.index].source];i.setSheenRoughnessTexture(l),e.setTextureInfo(i.getSheenRoughnessTextureInfo(),c)}}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(dt);if(s){let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);if(n.extensions=n.extensions||{},n.extensions[dt]=i,i.sheenColorFactor=s.getSheenColorFactor(),i.sheenRoughnessFactor=s.getSheenRoughnessFactor(),s.getSheenColorTexture()){let o=s.getSheenColorTexture(),c=s.getSheenColorTextureInfo();i.sheenColorTexture=e.createTextureInfoDef(o,c)}if(s.getSheenRoughnessTexture()){let o=s.getSheenRoughnessTexture(),c=s.getSheenRoughnessTextureInfo();i.sheenRoughnessTexture=e.createTextureInfoDef(o,c)}}}),this}},{R:cl,G:dl,B:ll,A:fl}=Be,ul=class extends z{static EXTENSION_NAME=lt;init(){this.extensionName=lt,this.propertyType="Specular",this.parentTypes=[N.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{specularFactor:1,specularTexture:null,specularTextureInfo:new ae(this.graph,"specularTextureInfo"),specularColorFactor:[1,1,1],specularColorTexture:null,specularColorTextureInfo:new ae(this.graph,"specularColorTextureInfo")})}getSpecularFactor(){return this.get("specularFactor")}setSpecularFactor(e){return this.set("specularFactor",e)}getSpecularColorFactor(){return this.get("specularColorFactor")}setSpecularColorFactor(e){return this.set("specularColorFactor",e)}getSpecularTexture(){return this.getRef("specularTexture")}getSpecularTextureInfo(){return this.getRef("specularTexture")?this.getRef("specularTextureInfo"):null}setSpecularTexture(e){return this.setRef("specularTexture",e,{channels:fl})}getSpecularColorTexture(){return this.getRef("specularColorTexture")}getSpecularColorTextureInfo(){return this.getRef("specularColorTexture")?this.getRef("specularColorTextureInfo"):null}setSpecularColorTexture(e){return this.setRef("specularColorTexture",e,{channels:cl|dl|ll,isColor:!0})}},hl=class extends Z{static EXTENSION_NAME=lt;extensionName=lt;prereadTypes=[N.MESH];prewriteTypes=[N.MESH];createSpecular(){return new ul(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((r,n)=>{if(r.extensions&&r.extensions.KHR_materials_specular){let i=this.createSpecular();e.materials[n].setExtension(lt,i);let o=r.extensions[lt];if(o.extras&&i.setExtras(o.extras),o.specularFactor!==void 0&&i.setSpecularFactor(o.specularFactor),o.specularColorFactor!==void 0&&i.setSpecularColorFactor(o.specularColorFactor),o.specularTexture!==void 0){let c=o.specularTexture,l=e.textures[s[c.index].source];i.setSpecularTexture(l),e.setTextureInfo(i.getSpecularTextureInfo(),c)}if(o.specularColorTexture!==void 0){let c=o.specularColorTexture,l=e.textures[s[c.index].source];i.setSpecularColorTexture(l),e.setTextureInfo(i.getSpecularColorTextureInfo(),c)}}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(lt);if(s){let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);if(n.extensions=n.extensions||{},n.extensions[lt]=i,s.getSpecularFactor()!==1&&(i.specularFactor=s.getSpecularFactor()),re.eq(s.getSpecularColorFactor(),[1,1,1])||(i.specularColorFactor=s.getSpecularColorFactor()),s.getSpecularTexture()){let o=s.getSpecularTexture(),c=s.getSpecularTextureInfo();i.specularTexture=e.createTextureInfoDef(o,c)}if(s.getSpecularColorTexture()){let o=s.getSpecularColorTexture(),c=s.getSpecularColorTextureInfo();i.specularColorTexture=e.createTextureInfoDef(o,c)}}}),this}},{R:bl}=Be,gl=class extends z{static EXTENSION_NAME=ft;init(){this.extensionName=ft,this.propertyType="Transmission",this.parentTypes=[N.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{transmissionFactor:0,transmissionTexture:null,transmissionTextureInfo:new ae(this.graph,"transmissionTextureInfo")})}getTransmissionFactor(){return this.get("transmissionFactor")}setTransmissionFactor(e){return this.set("transmissionFactor",e)}getTransmissionTexture(){return this.getRef("transmissionTexture")}getTransmissionTextureInfo(){return this.getRef("transmissionTexture")?this.getRef("transmissionTextureInfo"):null}setTransmissionTexture(e){return this.setRef("transmissionTexture",e,{channels:bl})}},pl=class extends Z{static EXTENSION_NAME=ft;extensionName=ft;prereadTypes=[N.MESH];prewriteTypes=[N.MESH];createTransmission(){return new gl(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((r,n)=>{if(r.extensions&&r.extensions.KHR_materials_transmission){let i=this.createTransmission();e.materials[n].setExtension(ft,i);let o=r.extensions[ft];if(o.extras&&i.setExtras(o.extras),o.transmissionFactor!==void 0&&i.setTransmissionFactor(o.transmissionFactor),o.transmissionTexture!==void 0){let c=o.transmissionTexture,l=e.textures[s[c.index].source];i.setTransmissionTexture(l),e.setTextureInfo(i.getTransmissionTextureInfo(),c)}}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(ft);if(s){let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);if(n.extensions=n.extensions||{},n.extensions[ft]=i,i.transmissionFactor=s.getTransmissionFactor(),s.getTransmissionTexture()){let o=s.getTransmissionTexture(),c=s.getTransmissionTextureInfo();i.transmissionTexture=e.createTextureInfoDef(o,c)}}}),this}},ml=class extends z{static EXTENSION_NAME=Rt;init(){this.extensionName=Rt,this.propertyType="Unlit",this.parentTypes=[N.MATERIAL]}},yl=class extends Z{static EXTENSION_NAME=Rt;extensionName=Rt;prereadTypes=[N.MESH];prewriteTypes=[N.MESH];createUnlit(){return new ml(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){return(e.jsonDoc.json.materials||[]).forEach((t,a)=>{t.extensions&&t.extensions.KHR_materials_unlit&&e.materials[a].setExtension(Rt,this.createUnlit())}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{if(a.getExtension("KHR_materials_unlit")){let s=e.materialIndexMap.get(a),r=t.json.materials[s];r.extensions=r.extensions||{},r.extensions[Rt]={}}}),this}},xl=class extends z{static EXTENSION_NAME=_e;init(){this.extensionName=_e,this.propertyType="Mapping",this.parentTypes=["MappingList"]}getDefaults(){return Object.assign(super.getDefaults(),{material:null,variants:new te})}getMaterial(){return this.getRef("material")}setMaterial(e){return this.setRef("material",e)}addVariant(e){return this.addRef("variants",e)}removeVariant(e){return this.removeRef("variants",e)}listVariants(){return this.listRefs("variants")}},wl=class extends z{static EXTENSION_NAME=_e;init(){this.extensionName=_e,this.propertyType="MappingList",this.parentTypes=[N.PRIMITIVE]}getDefaults(){return Object.assign(super.getDefaults(),{mappings:new te})}addMapping(e){return this.addRef("mappings",e)}removeMapping(e){return this.removeRef("mappings",e)}listMappings(){return this.listRefs("mappings")}},bn=class extends z{static EXTENSION_NAME=_e;init(){this.extensionName=_e,this.propertyType="Variant",this.parentTypes=["MappingList"]}},vl=class extends Z{extensionName=_e;static EXTENSION_NAME=_e;createMappingList(){return new wl(this.document.getGraph())}createVariant(e=""){return new bn(this.document.getGraph(),e)}createMapping(){return new xl(this.document.getGraph())}listVariants(){return Array.from(this.properties).filter(e=>e instanceof bn)}read(e){let t=e.jsonDoc;if(!t.json.extensions||!t.json.extensions.KHR_materials_variants)return this;let a=(t.json.extensions.KHR_materials_variants.variants||[]).map(s=>this.createVariant().setName(s.name||""));return(t.json.meshes||[]).forEach((s,r)=>{let n=e.meshes[r];(s.primitives||[]).forEach((i,o)=>{if(!i.extensions||!i.extensions.KHR_materials_variants)return;let c=this.createMappingList(),l=i.extensions[_e];for(let p of l.mappings){let g=this.createMapping();p.material!==void 0&&g.setMaterial(e.materials[p.material]);for(let v of p.variants||[])g.addVariant(a[v]);c.addMapping(g)}n.listPrimitives()[o].setExtension(_e,c)})}),this}write(e){let t=e.jsonDoc,a=this.listVariants();if(!a.length)return this;let s=[],r=new Map;for(let n of a)r.set(n,s.length),s.push(e.createPropertyDef(n));for(let n of this.document.getRoot().listMeshes()){let i=e.meshIndexMap.get(n);n.listPrimitives().forEach((o,c)=>{let l=o.getExtension(_e);if(!l)return;let p=e.jsonDoc.json.meshes[i].primitives[c],g=l.listMappings().map(v=>{let x=e.createPropertyDef(v),u=v.getMaterial();return u&&(x.material=e.materialIndexMap.get(u)),x.variants=v.listVariants().map(d=>r.get(d)),x});p.extensions=p.extensions||{},p.extensions[_e]={mappings:g}})}return t.json.extensions=t.json.extensions||{},t.json.extensions[_e]={variants:s},this}},{G:Tl}=Be,El=class extends z{static EXTENSION_NAME=ut;init(){this.extensionName=ut,this.propertyType="Volume",this.parentTypes=[N.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{thicknessFactor:0,thicknessTexture:null,thicknessTextureInfo:new ae(this.graph,"thicknessTexture"),attenuationDistance:1/0,attenuationColor:[1,1,1]})}getThicknessFactor(){return this.get("thicknessFactor")}setThicknessFactor(e){return this.set("thicknessFactor",e)}getThicknessTexture(){return this.getRef("thicknessTexture")}getThicknessTextureInfo(){return this.getRef("thicknessTexture")?this.getRef("thicknessTextureInfo"):null}setThicknessTexture(e){return this.setRef("thicknessTexture",e,{channels:Tl})}getAttenuationDistance(){return this.get("attenuationDistance")}setAttenuationDistance(e){return this.set("attenuationDistance",e)}getAttenuationColor(){return this.get("attenuationColor")}setAttenuationColor(e){return this.set("attenuationColor",e)}},kl=class extends Z{static EXTENSION_NAME=ut;extensionName=ut;prereadTypes=[N.MESH];prewriteTypes=[N.MESH];createVolume(){return new El(this.document.getGraph())}read(e){return this}write(e){return this}preread(e){let t=e.jsonDoc,a=t.json.materials||[],s=t.json.textures||[];return a.forEach((r,n)=>{if(r.extensions&&r.extensions.KHR_materials_volume){let i=this.createVolume();e.materials[n].setExtension(ut,i);let o=r.extensions[ut];if(o.extras&&i.setExtras(o.extras),o.thicknessFactor!==void 0&&i.setThicknessFactor(o.thicknessFactor),o.attenuationDistance!==void 0&&i.setAttenuationDistance(o.attenuationDistance),o.attenuationColor!==void 0&&i.setAttenuationColor(o.attenuationColor),o.thicknessTexture!==void 0){let c=o.thicknessTexture,l=e.textures[s[c.index].source];i.setThicknessTexture(l),e.setTextureInfo(i.getThicknessTextureInfo(),c)}}}),this}prewrite(e){let t=e.jsonDoc;return this.document.getRoot().listMaterials().forEach(a=>{let s=a.getExtension(ut);if(s){let r=e.materialIndexMap.get(a),n=t.json.materials[r],i=e.createPropertyDef(s);if(n.extensions=n.extensions||{},n.extensions[ut]=i,s.getThicknessFactor()>0&&(i.thicknessFactor=s.getThicknessFactor()),Number.isFinite(s.getAttenuationDistance())&&(i.attenuationDistance=s.getAttenuationDistance()),re.eq(s.getAttenuationColor(),[1,1,1])||(i.attenuationColor=s.getAttenuationColor()),s.getThicknessTexture()){let o=s.getThicknessTexture(),c=s.getThicknessTextureInfo();i.thicknessTexture=e.createTextureInfoDef(o,c)}}}),this}},Ml=class extends Z{extensionName=Yr;static EXTENSION_NAME=Yr;read(e){return this}write(e){return this}},Rs=class extends Z{extensionName=$r;static EXTENSION_NAME=$r;read(e){return this}write(e){return this}},Rl=class extends z{static EXTENSION_NAME=ht;init(){this.extensionName=ht,this.propertyType="Visibility",this.parentTypes=[N.NODE]}getDefaults(){return Object.assign(super.getDefaults(),{visible:!0})}getVisible(){return this.get("visible")}setVisible(e){return this.set("visible",e)}},Il=class extends Z{static EXTENSION_NAME=ht;extensionName=ht;createVisibility(){return new Rl(this.document.getGraph())}read(e){return(e.jsonDoc.json.nodes||[]).forEach((t,a)=>{if(t.extensions&&t.extensions.KHR_node_visibility){let s=this.createVisibility();e.nodes[a].setExtension(ht,s);let r=t.extensions[ht];r.visible!==void 0&&s.setVisible(r.visible)}}),this}write(e){let t=e.jsonDoc;for(let a of this.document.getRoot().listNodes()){let s=a.getExtension(ht);if(!s)continue;let r=e.nodeIndexMap.get(a),n=t.json.nodes[r];n.extensions=n.extensions||{},n.extensions[ht]={visible:s.getVisible()}}return this}};function Al(e){return e.vkFormat>0&&e.vkFormat<=123}function gn(e){let t=e.vkFormat===1000066e3&&e.dataFormatDescriptor[0].colorModel===167;return e.vkFormat===0||t}var Sl=class{match(e){return e[0]===171&&e[1]===75&&e[2]===84&&e[3]===88&&e[4]===32&&e[5]===50&&e[6]===48&&e[7]===187&&e[8]===13&&e[9]===10&&e[10]===26&&e[11]===10}getSize(e){let t=wa(e);return[t.pixelWidth,t.pixelHeight]}getChannels(e){let t=wa(e),a=t.dataFormatDescriptor[0];if(Al(t))return a.samples.length;if(gn(t))switch(a.colorModel){case 163:return a.samples.length===2&&(a.samples[1].channelType&15)===15?4:3;case 166:return(a.samples[0].channelType&15)===3?4:3;default:throw new Error(`Unexpected KTX2 colorModel, "${a.colorModel}".`)}throw new Error(`Unexpected KTX2 vkFormat, "${t.vkFormat}".`)}getVRAMByteLength(e){let t=wa(e),a=0;if(gn(t)){let s=this.getChannels(e)>3;for(let r=0;r<t.levels.length;r++){let n=t.levels[r];if(n.uncompressedByteLength)a+=n.uncompressedByteLength;else{let i=Math.max(1,Math.floor(t.pixelWidth/Math.pow(2,r))),o=Math.max(1,Math.floor(t.pixelHeight/Math.pow(2,r))),c=s?16:8;a+=i/4*(o/4)*c}}}else for(let s of t.levels)t.supercompressionScheme===0?a+=s.levelData.byteLength:a+=s.uncompressedByteLength;return a}},_l=class extends Z{static EXTENSION_NAME=Ea;extensionName=Ea;prereadTypes=[N.TEXTURE];static register(){Le.registerFormat("image/ktx2",new Sl)}preread(e){return e.jsonDoc.json.textures&&e.jsonDoc.json.textures.forEach(t=>{t.extensions&&t.extensions.KHR_texture_basisu&&(t.source=t.extensions[Ea].source)}),this}read(e){return this}write(e){let t=e.jsonDoc;return this.document.getRoot().listTextures().forEach(a=>{if(a.getMimeType()==="image/ktx2"){let s=e.imageIndexMap.get(a);t.json.textures.forEach(r=>{r.source===s&&(r.extensions=r.extensions||{},r.extensions[Ea]={source:r.source},delete r.source)})}}),this}},Nl=class extends z{static EXTENSION_NAME=bt;init(){this.extensionName=bt,this.propertyType="Transform",this.parentTypes=[N.TEXTURE_INFO]}getDefaults(){return Object.assign(super.getDefaults(),{offset:[0,0],rotation:0,scale:[1,1],texCoord:null})}getOffset(){return this.get("offset")}setOffset(e){return this.set("offset",e)}getRotation(){return this.get("rotation")}setRotation(e){return this.set("rotation",e)}getScale(){return this.get("scale")}setScale(e){return this.set("scale",e)}getTexCoord(){return this.get("texCoord")}setTexCoord(e){return this.set("texCoord",e)}},jl=class extends Z{extensionName=bt;static EXTENSION_NAME=bt;createTransform(){return new Nl(this.document.getGraph())}read(e){for(let[t,a]of Array.from(e.textureInfos.entries())){if(!a.extensions||!a.extensions.KHR_texture_transform)continue;let s=this.createTransform(),r=a.extensions[bt];r.offset!==void 0&&s.setOffset(r.offset),r.rotation!==void 0&&s.setRotation(r.rotation),r.scale!==void 0&&s.setScale(r.scale),r.texCoord!==void 0&&s.setTexCoord(r.texCoord),t.setExtension(bt,s)}return this}write(e){let t=Array.from(e.textureInfoDefMap.entries());for(let[a,s]of t){let r=a.getExtension(bt);if(!r)continue;s.extensions=s.extensions||{};let n={},i=re.eq;i(r.getOffset(),[0,0])||(n.offset=r.getOffset()),r.getRotation()!==0&&(n.rotation=r.getRotation()),i(r.getScale(),[1,1])||(n.scale=r.getScale()),r.getTexCoord()!=null&&(n.texCoord=r.getTexCoord()),s.extensions[bt]=n}return this}},Fl=[N.ROOT,N.SCENE,N.NODE,N.MESH,N.MATERIAL,N.TEXTURE,N.ANIMATION],Cl=class extends z{static EXTENSION_NAME=Oe;init(){this.extensionName=Oe,this.propertyType="Packet",this.parentTypes=Fl}getDefaults(){return Object.assign(super.getDefaults(),{context:{},properties:{}})}getContext(){return this.get("context")}setContext(e){return this.set("context",{...e})}listProperties(){return Object.keys(this.get("properties"))}getProperty(e){let t=this.get("properties");return e in t?t[e]:null}setProperty(e,t){this._assertContext(e);let a={...this.get("properties")};return t?a[e]=t:delete a[e],this.set("properties",a)}toJSONLD(){return{"@context":ws(this.get("context")),...ws(this.get("properties"))}}fromJSONLD(e){e=ws(e);let t=e["@context"];return t&&this.set("context",t),delete e["@context"],this.set("properties",e)}_assertContext(e){if(!(e.split(":")[0]in this.get("context")))throw new Error(`${Oe}: Missing context for term, "${e}".`)}};function ws(e){return JSON.parse(JSON.stringify(e))}var Bl=class extends Z{extensionName=Oe;static EXTENSION_NAME=Oe;createPacket(){return new Cl(this.document.getGraph())}listPackets(){return Array.from(this.properties)}read(e){let t=e.jsonDoc.json.extensions?.[Oe];if(!t||!t.packets)return this;let a=e.jsonDoc.json,s=this.document.getRoot(),r=t.packets.map(o=>this.createPacket().fromJSONLD(o)),n=[[a.asset],a.scenes,a.nodes,a.meshes,a.materials,a.images,a.animations],i=[[s],s.listScenes(),s.listNodes(),s.listMeshes(),s.listMaterials(),s.listTextures(),s.listAnimations()];for(let o=0;o<n.length;o++){let c=n[o]||[];for(let l=0;l<c.length;l++){let p=c[l];if(p.extensions&&p.extensions.KHR_xmp_json_ld){let g=p.extensions[Oe];i[o][l].setExtension(Oe,r[g.packet])}}}return this}write(e){let{json:t}=e.jsonDoc,a=[];for(let s of this.properties){a.push(s.toJSONLD());for(let r of s.listParents()){let n;switch(r.propertyType){case N.ROOT:n=t.asset;break;case N.SCENE:n=t.scenes[e.sceneIndexMap.get(r)];break;case N.NODE:n=t.nodes[e.nodeIndexMap.get(r)];break;case N.MESH:n=t.meshes[e.meshIndexMap.get(r)];break;case N.MATERIAL:n=t.materials[e.materialIndexMap.get(r)];break;case N.TEXTURE:n=t.images[e.imageIndexMap.get(r)];break;case N.ANIMATION:n=t.animations[e.animationIndexMap.get(r)];break;default:n=null,this.document.getLogger().warn(`[${Oe}]: Unsupported parent property, "${r.propertyType}"`);break}n&&(n.extensions=n.extensions||{},n.extensions[Oe]={packet:a.length-1})}}return a.length>0&&(t.extensions=t.extensions||{},t.extensions[Oe]={packets:a}),this}},Ol=[pd,md,Id,Sd,Cd,Pd,Vd,Hd,Xd,Jd,Zd,tl,hl,ol,pl,yl,vl,kl,Ml,Rs,Il,_l,jl,Bl],Pb=[gc,ks,Ms,Lc,hd,gd,...Ol];var ap=(function(){var e="b9H79Tebbbe9ok9Geueu9Geub9Gbb9Gruuuuuuueu9Gvuuuuueu9Gduueu9Gluuuueu9Gvuuuuub9Gouuuuuub9Gluuuub9Giuuueui8AYdilveoveovrrwrrDDoDrbqqbelve9Weiiviebeoweuec;G:Qdkr:nlAo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bb8F9TW79O9V9Wt9FW9U9J9V9KW9wWVtW949c919M9MWV9mW4W2be8A9TW79O9V9Wt9FW9U9J9V9KW9wWVtW949c919M9MWVbd8F9TW79O9V9Wt9FW9U9J9V9KW9wWVtW949c919M9MWV9c9V919U9KbiE9TW79O9V9Wt9FW9U9J9V9KW9wWVtW949wWV79P9V9UblY9TW79O9V9Wt9FW9U9J9V9KW69U9KW949c919M9MWVbv8E9TW79O9V9Wt9FW9U9J9V9KW69U9KW949c919M9MWV9c9V919U9Kbo8A9TW79O9V9Wt9FW9U9J9V9KW69U9KW949wWV79P9V9UbrE9TW79O9V9Wt9FW9U9J9V9KW69U9KW949tWG91W9U9JWbwa9TW79O9V9Wt9FW9U9J9V9KW69U9KW949tWG91W9U9JW9c9V919U9KbDL9TW79O9V9Wt9FW9U9J9V9KWS9P2tWV9p9JtbqK9TW79O9V9Wt9FW9U9J9V9KWS9P2tWV9r919HtbkL9TW79O9V9Wt9FW9U9J9V9KWS9P2tWVT949WbxE9TW79O9V9Wt9F9V9Wt9P9T9P96W9wWVtW94J9H9J9OWbsa9TW79O9V9Wt9F9V9Wt9P9T9P96W9wWVtW94J9H9J9OW9ttV9P9Wbza9TW79O9V9Wt9F9V9Wt9P9T9P96W9wWVtW94SWt9J9O9sW9T9H9WbHK9TW79O9V9Wt9F79W9Ht9P9H29t9VVt9sW9T9H9WbOl79IV9RbCDwebcekdKLqN9OYdbk:Bhdhud9:8Jjjjjbc;qw9Rgr8KjjjjbcbhwdnaeTmbabcbyd;C:kjjbaoaocb9iEgDc:GeV86bbarc;adfcbcjdz:wjjjb8AdnaiTmbarc;adfadalz:vjjjb8Akarc;abfalfcbcbcjdal9RalcFe0Ez:wjjjb8Aarc;abfarc;adfalz:vjjjb8AarcUf9cb83ibarc8Wf9cb83ibarcyf9cb83ibarcaf9cb83ibarcKf9cb83ibarczf9cb83ibar9cb83iwar9cb83ibcj;abal9Uc;WFbGcjdalca0Ehqdnaicd6mbavcd9imbaDTmbadcefhkaqci2gxal2hmarc;alfclfhParc;qlfceVhsarc;qofclVhzarc;qofcKfhHarc;qofczfhOcbhAincdhCcbhodnavci6mbaH9cb83ibaO9cb83ibar9cb83i;yoar9cb83i;qoadaAfgoybbhXcbhQincbhwcbhLdninaoalfhKaoybbgYaX7aLVhLawcP0meaKhoaYhXawcefgwaQfai6mbkkcbhXarc;qofhwincwh8AcwhEdnaLaX93gocFeGg3cs0mbclhEa3ci0mba3cb9hcethEkdnaocw4cFeGg3cs0mbclh8Aa3ci0mba3cb9hceth8Aka8AaEfh3awydbh5cwh8AcwhEdnaocz4cFeGg8Ecs0mbclhEa8Eci0mba8Ecb9hcethEka3a5fh3dnaocFFFFb0mbclh8AaocFFF8F0mbaocFFFr0ceth8Akawa3aEfa8AfBdbawclfhwaXcefgXcw9hmbkaKhoaYhXaQczfgQai6mbkcbhocehwazhLinawaoaLydbarc;qofaocdtfydb6EhoaLclfhLawcefgwcw9hmbkcihCkcbh3arc;qlfcbcjdz:wjjjb8Aarc;alfcwfcbBdbar9cb83i;alaoclth8Fadhaaqhhakh5inarc;qlfadcba3cufgoaoa30Eal2falz:vjjjb8Aaiahaiah6Ehgdnaqaia39Ra3aqfai6EgYcsfc9WGgoaY9nmbarc;qofaYfcbaoaY9Rz:wjjjb8Akada3al2fh8Jcbh8Kina8Ka8FVcl4hQarc;alfa8Kcdtfh8LaAh8Mcbh8Nina8NaAfhwdndndndndndna8KPldebidkasa8Mc98GgLfhoa5aLfh8Aarc;qlfawc98GgLfRbbhXcwhwinaoRbbawtaXVhXaocefhoawcwfgwca9hmbkaYTmla8Ncith8Ea8JaLfhEcbhKinaERbbhLcwhoa8AhwinawRbbaotaLVhLawcefhwaocwfgoca9hmbkarc;qofaKfaLaX7aQ93a8E486bba8Aalfh8AaEalfhEaLhXaKcefgKaY9hmbxlkkaYTmia8Mc9:Ghoa8NcitcwGhEarc;qlfawceVfRbbcwtarc;qlfawc9:GfRbbVhLarc;qofhwaghXinawa5aofRbbcwtaaaofRbbVg8AaL9RgLcetaLcztcz91cs47cFFiGaE486bbaoalfhoawcefhwa8AhLa3aXcufgX9hmbxikkaYTmda8Jawfhoarc;qlfawfRbbhLarc;qofhwaghXinawaoRbbg8AaL9RgLcetaLcKtcK91cr4786bbawcefhwaoalfhoa8AhLa3aXcufgX9hmbxdkkaYTmeka8LydbhEcbhKarc;qofhoincdhLcbhwinaLaoawfRbbcb9hfhLawcefgwcz9hmbkclhXcbhwinaXaoawfRbbcd0fhXawcefgwcz9hmbkcwh8Acbhwina8AaoawfRbbcP0fh8Aawcefgwcz9hmbkaLaXaLaX6Egwa8Aawa8A6Egwczawcz6EaEfhEaoczfhoaKczfgKaY6mbka8LaEBdbka8Mcefh8Ma8Ncefg8Ncl9hmbka8Kcefg8KaC9hmbkaaamfhaahaxfhha5amfh5a3axfg3ai6mbkcbhocehwaPhLinawaoaLydbarc;alfaocdtfydb6EhoaLclfhLawcefgXhwaCaX9hmbkaraAcd4fa8FcdVaoaocdSE86bbaAclfgAal6mbkkabaefh8Kabcefhoalcd4gecbaDEhkadcefhOarc;abfceVhHcbhmdndninaiam9nmearc;qofcbcjdz:wjjjb8Aa8Kao9Rak6mdadamal2gwfhxcbh8JaOawfhzaocbakz:wjjjbghakfh5aqaiam9Ramaqfai6Egscsfgocl4cifcd4hCaoc9WGg8LThPindndndndndndndndndndnaDTmbara8Jcd4fRbbgLciGPlbedlbkasTmdaxa8Jfhoarc;abfa8JfRbbhLarc;qofhwashXinawaoRbbg8AaL9RgLcetaLcKtcK91cr4786bbawcefhwaoalfhoa8AhLaXcufgXmbxikkasTmia8JcitcwGhEarc;abfa8JceVfRbbcwtarc;abfa8Jc9:GgofRbbVhLaxaofhoarc;qofhwashXinawao8Vbbg8AaL9RgLcetaLcztcz91cs47cFFiGaE486bbawcefhwaoalfhoa8AhLaXcufgXmbxdkkaHa8Jc98GgEfhoazaEfh8Aarc;abfaEfRbbhXcwhwinaoRbbawtaXVhXaocefhoawcwfgwca9hmbkasTmbaLcl4hYa8JcitcKGh3axaEfhEcbhKinaERbbhLcwhoa8AhwinawRbbaotaLVhLawcefhwaocwfgoca9hmbkarc;qofaKfaLaX7aY93a3486bba8Aalfh8AaEalfhEaLhXaKcefgKas9hmbkkaDmbcbhoxlka8LTmbcbhodninarc;qofaofgwcwf8Pibaw8Pib:e9qTmeaoczfgoa8L9pmdxbkkdnavmbcehoxikcbhEaChKaChYinarc;qofaEfgocwf8Pibhyao8Pibh8PcdhLcbhwinaLaoawfRbbcb9hfhLawcefgwcz9hmbkclhXcbhwinaXaoawfRbbcd0fhXawcefgwcz9hmbkcwh8Acbhwina8AaoawfRbbcP0fh8Aawcefgwcz9hmbkaLaXaLaX6Egoa8Aaoa8A6Egoczaocz6EaYfhYaocucbaya8P:e9cb9sEgwaoaw6EaKfhKaEczfgEa8L9pmdxbkkaha8Jcd4fgoaoRbbcda8JcetcoGtV86bbxikdnaKas6mbaYas6mbaha8Jcd4fgoaoRbbcia8JcetcoGtV86bba8Ka59Ras6mra5arc;qofasz:vjjjbasfh5xikaKaY9phokaha8Jcd4fgwawRbbaoa8JcetcoGtV86bbka8Ka59RaC6mla5cbaCz:wjjjbgAaCfhYdndna8LmbaPhoxekdna8KaY9RcK9pmbaPhoxekaocdtc:q1jjbfcj1jjbaDEg5ydxggcetc;:FFFeGh8Fcuh3cuagtcu7cFeGhacbh8Marc;qofhLinarc;qofa8MfhQczhEdndndnagPDbeeeeeeedekcucbaQcwf8PibaQ8Pib:e9cb9sEhExekcbhoa8FhEinaEaaaLaofRbb9nfhEaocefgocz9hmbkkcih8Ecbh8Ainczhwdndndna5a8AcdtfydbgKPDbeeeeeeedekcucbaQcwf8PibaQ8Pib:e9cb9sEhwxekaKcetc;:FFFeGhwcuaKtcu7cFeGhXcbhoinawaXaLaofRbb9nfhwaocefgocz9hmbkkdndnawaE6mbaKa39hmeawaE9hmea5a8EcdtfydbcwSmeka8Ah8EawhEka8Acefg8Aci9hmbkaAa8Mco4fgoaoRbba8Ea8Mci4coGtV86bbdndndna5a8Ecdtfydbg3PDdbbbbbbbebkdncwa39Tg8ETmbcua3tcu7hwdndna3ceSmbcbh8NaLhQinaQhoa8Eh8AcbhXinaoRbbgEawcFeGgKaEaK6EaXa3tVhXaocefhoa8Acufg8AmbkaYaX86bbaQa8EfhQaYcefhYa8Na8Efg8Ncz6mbxdkkcbh8NaLhQinaQhoa8Eh8AcbhXinaoRbbgEawcFeGgKaEaK6EaXcetVhXaocefhoa8Acufg8AmbkaYaX:T9cFe:d9c:c:qj:bw9:9c:q;c1:I1e:d9c:b:c:e1z9:9ca188bbaQa8EfhQaYcefhYa8Na8Efg8Ncz6mbkkcbhoinaYaLaofRbbgX86bbaYaXawcFeG9pfhYaocefgocz9hmbxikkdna3ceSmbinaYcb86bbaYcefhYxbkkinaYcb86bbaYcefhYxbkkaYaQ8Pbb83bbaYcwfaQcwf8Pbb83bbaYczfhYka8Mczfg8Ma8L9pgomeaLczfhLa8KaY9RcK9pmbkkaoTmlaYh5aYTmlka8Jcefg8Jal9hmbkarc;abfaxascufal2falz:vjjjb8Aasamfhma5hoa5mbkcbhwxdkdna8Kao9RakalfgwcKcaaDEgLawaL0EgX9pmbcbhwxdkdnawaL9pmbaocbaXaw9Rgwz:wjjjbawfhokaoarc;adfalz:vjjjbalfhodnaDTmbaoaraez:vjjjbaefhokaoab9Rhwxekcbhwkarc;qwf8Kjjjjbawk5babaeadaialcdcbyd;C:kjjbz:bjjjbk9reduaecd4gdaefgicaaica0Eabcj;abae9Uc;WFbGcjdaeca0Egifcufai9Uae2aiadfaicl4cifcd4f2fcefkmbcbabBd;C:kjjbk:Ese5u8Jjjjjbc;ae9Rgl8Kjjjjbcbhvdnaici9UgocHfae0mbabcbyd;m:kjjbgrc;GeV86bbalc;abfcFecjez:wjjjb8AalcUfgw9cu83ibalc8WfgD9cu83ibalcyfgq9cu83ibalcafgk9cu83ibalcKfgx9cu83ibalczfgm9cu83ibal9cu83iwal9cu83ibabaefc9WfhPabcefgsaofhednaiTmbcmcsarcb9kgzEhHcbhOcbhAcbhCcbhXcbhQindnaeaP9nmbcbhvxikaQcufhvadaCcdtfgLydbhKaLcwfydbhYaLclfydbh8AcbhEdndndninalc;abfavcsGcitfgoydlh3dndndnaoydbgoaK9hmba3a8ASmekdnaoa8A9hmba3aY9hmbaEcefhExekaoaY9hmea3aK9hmeaEcdfhEkaEc870mdaXcufhvaLaEciGcx2goc;i1jjbfydbcdtfydbh3aLaoc;e1jjbfydbcdtfydbh8AaLaoc;a1jjbfydbcdtfydbhKcbhodnindnalavcsGcdtfydba39hmbaohYxdkcuhYavcufhvaocefgocz9hmbkkaOa3aOSgvaYce9iaYaH9oVgoGfhOdndndncbcsavEaYaoEgvcs9hmbarce9imba3a3aAa3cefaASgvEgAcefSmecmcsavEhvkasavaEcdtc;WeGV86bbavcs9hmea3aA9Rgvcetavc8F917hvinaeavcFb0crtavcFbGV86bbaecefheavcje6hoavcr4hvaoTmbka3hAxvkcPhvasaEcdtcPV86bba3hAkavTmiavaH9omicdhocehEaQhYxlkavcufhvaEclfgEc;ab9hmbkkdnaLceaYaOSceta8AaOSEcx2gvc;a1jjbfydbcdtfydbgKTaLavc;e1jjbfydbcdtfydbg8AceSGaLavc;i1jjbfydbcdtfydbg3cdSGaOcb9hGazGg5ce9hmbaw9cu83ibaD9cu83ibaq9cu83ibak9cu83ibax9cu83ibam9cu83ibal9cu83iwal9cu83ibcbhOkcbhEaXcufgvhodnindnalaocsGcdtfydba8A9hmbaEhYxdkcuhYaocufhoaEcefgEcz9hmbkkcbhodnindnalavcsGcdtfydba39hmbaohExdkcuhEavcufhvaocefgocz9hmbkkaOaKaOSg8EfhLdndnaYcm0mbaYcefhYxekcbcsa8AaLSgvEhYaLavfhLkdndnaEcm0mbaEcefhExekcbcsa3aLSgvEhEaLavfhLkc9:cua8EEh8FcbhvaEaYcltVgacFeGhodndndninavc:W1jjbfRbbaoSmeavcefgvcz9hmbxdkka5aKaO9havcm0VVmbasavc;WeV86bbxekasa8F86bbaeaa86bbaecefhekdna8EmbaKaA9Rgvcetavc8F917hvinaeavcFb0gocrtavcFbGV86bbavcr4hvaecefheaombkaKhAkdnaYcs9hmba8AaA9Rgvcetavc8F917hvinaeavcFb0gocrtavcFbGV86bbavcr4hvaecefheaombka8AhAkdnaEcs9hmba3aA9Rgvcetavc8F917hvinaeavcFb0gocrtavcFbGV86bbavcr4hvaecefheaombka3hAkalaXcdtfaKBdbaXcefcsGhvdndnaYPzbeeeeeeeeeeeeeebekalavcdtfa8ABdbaXcdfcsGhvkdndnaEPzbeeeeeeeeeeeeeebekalavcdtfa3BdbavcefcsGhvkcihoalc;abfaQcitfgEaKBdlaEa8ABdbaQcefcsGhYcdhEavhXaLhOxekcdhoalaXcdtfa3BdbcehEaXcefcsGhXaQhYkalc;abfaYcitfgva8ABdlava3Bdbalc;abfaQaEfcsGcitfgva3BdlavaKBdbascefhsaQaofcsGhQaCcifgCai6mbkkdnaeaP9nmbcbhvxekcbhvinaeavfavc:W1jjbfRbb86bbavcefgvcz9hmbkaeab9Ravfhvkalc;aef8KjjjjbavkZeeucbhddninadcefgdc8F0meceadtae6mbkkadcrfcFeGcr9Uci2cdfabci9U2cHfkmbcbabBd;m:kjjbk:Adewu8Jjjjjbcz9Rhlcbhvdnaicvfae0mbcbhvabcbRb;m:kjjbc;qeV86bbal9cb83iwabcefhoabaefc98fhrdnaiTmbcbhwcbhDindnaoar6mbcbskadaDcdtfydbgqalcwfawaqav9Rgvavc8F91gv7av9Rc507gwcdtfgkydb9Rgvc8E91c9:Gavcdt7awVhvinaoavcFb0gecrtavcFbGV86bbavcr4hvaocefhoaembkakaqBdbaqhvaDcefgDai9hmbkkdnaoar9nmbcbskaocbBbbaoab9RclfhvkavkBeeucbhddninadcefgdc8F0meceadtae6mbkkadcwfcFeGcr9Uab2cvfk:bvli99dui99ludnaeTmbcuadcetcuftcu7:Zhvdndncuaicuftcu7:ZgoJbbbZMgr:lJbbb9p9DTmbar:Ohwxekcjjjj94hwkcbhicbhDinalclfIdbgrJbbbbJbbjZalIdbgq:lar:lMalcwfIdbgk:lMgr:varJbbbb9BEgrNhxaqarNhrdndnakJbbbb9GTmbaxhqxekJbbjZar:l:tgqaq:maxJbbbb9GEhqJbbjZax:l:tgxax:marJbbbb9GEhrkdndnalcxfIdbgxJbbj:;axJbbj:;9GEgkJbbjZakJbbjZ9FEavNJbbbZJbbb:;axJbbbb9GEMgx:lJbbb9p9DTmbax:Ohmxekcjjjj94hmkdndnaqJbbj:;aqJbbj:;9GEgxJbbjZaxJbbjZ9FEaoNJbbbZJbbb:;aqJbbbb9GEMgq:lJbbb9p9DTmbaq:OhPxekcjjjj94hPkdndnarJbbj:;arJbbj:;9GEgqJbbjZaqJbbjZ9FEaoNJbbbZJbbb:;arJbbbb9GEMgr:lJbbb9p9DTmbar:Ohsxekcjjjj94hskdndnadcl9hmbabaifgzas86bbazcifam86bbazcdfaw86bbazcefaP86bbxekabaDfgzas87ebazcofam87ebazclfaw87ebazcdfaP87ebkalczfhlaiclfhiaDcwfhDaecufgembkkk;hlld99eud99eudnaeTmbdndncuaicuftcu7:ZgvJbbbZMgo:lJbbb9p9DTmbao:Ohixekcjjjj94hikaic;8FiGhrinabcofcicdalclfIdb:lalIdb:l9EgialcwfIdb:lalaicdtfIdb:l9EEgialcxfIdb:lalaicdtfIdb:l9EEgiarV87ebdndnJbbj:;JbbjZalaicdtfIdbJbbbb9DEgoalaicd7cdtfIdbJ;Zl:1ZNNgwJbbj:;awJbbj:;9GEgDJbbjZaDJbbjZ9FEavNJbbbZJbbb:;awJbbbb9GEMgw:lJbbb9p9DTmbaw:Ohqxekcjjjj94hqkabcdfaq87ebdndnalaicefciGcdtfIdbJ;Zl:1ZNaoNgwJbbj:;awJbbj:;9GEgDJbbjZaDJbbjZ9FEavNJbbbZJbbb:;awJbbbb9GEMgw:lJbbb9p9DTmbaw:Ohqxekcjjjj94hqkabaq87ebdndnaoalaicufciGcdtfIdbJ;Zl:1ZNNgoJbbj:;aoJbbj:;9GEgwJbbjZawJbbjZ9FEavNJbbbZJbbb:;aoJbbbb9GEMgo:lJbbb9p9DTmbao:Ohixekcjjjj94hikabclfai87ebabcwfhbalczfhlaecufgembkkk;3viDue99eu8Jjjjjbcjd9Rgo8Kjjjjbadcd4hrdndndndnavcd9hmbadcl6meaohwarhDinawc:CuBdbawclfhwaDcufgDmbkaeTmiadcl6mdarcdthqalhkcbhxinaohwakhDarhminawawydbgPcbaDIdbgs:8cL4cFeGc:cufasJbbbb9BEgzaPaz9kEBdbaDclfhDawclfhwamcufgmmbkakaqfhkaxcefgxaeSmixbkkaeTmdxekaeTmekarcdthkavce9hhqadcl6hdcbhxindndndnaqmbadmdc:CuhDalhwarhminaDcbawIdbgs:8cL4cFeGc:cufasJbbbb9BEgPaDaP9kEhDawclfhwamcufgmmbxdkkc:CuhDdndnavPleddbdkadmdaohwalhmarhPinawcbamIdbgs:8cL4cFeGgzc;:bazc;:b0Ec:cufasJbbbb9BEBdbamclfhmawclfhwaPcufgPmbxdkkadmecbhwarhminaoawfcbalawfIdbgs:8cL4cFeGgPc8AaPc8A0Ec:cufasJbbbb9BEBdbawclfhwamcufgmmbkkadmbcbhwarhPinaDhmdnavceSmbaoawfydbhmkdndnalawfIdbgscjjj;8iamai9RcefgmcLt9R::NJbbbZJbbb:;asJbbbb9GEMgs:lJbbb9p9DTmbas:Ohzxekcjjjj94hzkabawfazcFFFrGamcKtVBdbawclfhwaPcufgPmbkkabakfhbalakfhlaxcefgxae9hmbkkaocjdf8Kjjjjbk;YqdXui998Jjjjjbc:qd9Rgv8Kjjjjbavc:Sefcbc;Kbz:wjjjb8AcbhodnadTmbcbhoaiTmbdndnabaeSmbaehrxekavcuadcdtgwadcFFFFi0Ecbyd;u:kjjbHjjjjbbgrBd:SeavceBd:mdaraeawz:vjjjb8Akavc:GefcwfcbBdbav9cb83i:Geavc:Gefaradaiavc:Sefz:ojjjbavyd:GehDadci9Ugqcbyd;u:kjjbHjjjjbbheavc:Sefavyd:mdgkcdtfaeBdbavakcefgwBd:mdaecbaqz:wjjjbhxavc:SefawcdtfcuaicdtaicFFFFi0Ecbyd;u:kjjbHjjjjbbgmBdbavakcdfgPBd:mdalc;ebfhsaDheamhwinawalIdbasaeydbgzcwazcw6EcdtfIdbMUdbaeclfheawclfhwaicufgimbkavc:SefaPcdtfcuaqcdtadcFFFF970Ecbyd;u:kjjbHjjjjbbgPBdbdnadci6mbarheaPhwaqhiinawamaeydbcdtfIdbamaeclfydbcdtfIdbMamaecwfydbcdtfIdbMUdbaecxfheawclfhwaicufgimbkkakcifhoalc;ebfhHavc;qbfhOavheavyd:KehAavyd:OehCcbhzcbhwcbhXcehQinaehLcihkarawci2gKcdtfgeydbhsaeclfydbhdabaXcx2fgicwfaecwfydbgYBdbaiclfadBdbaiasBdbaxawfce86bbaOaYBdwaOadBdlaOasBdbaPawcdtfcbBdbdnazTmbcihkaLhiinaOakcdtfaiydbgeBdbakaeaY9haeas9haead9hGGfhkaiclfhiazcufgzmbkkaXcefhXcbhzinaCaAarazaKfcdtfydbcdtgifydbcdtfgYheaDaifgdydbgshidnasTmbdninaeydbawSmeaeclfheaicufgiTmdxbkkaeaYascdtfc98fydbBdbadadydbcufBdbkazcefgzci9hmbkdndnakTmbcuhwJbbbbh8Acbhdavyd:KehYavyd:OehKindndnaDaOadcdtfydbcdtgzfydbgembadcefhdxekadcs0hiamazfgsIdbhEasalcbadcefgdaiEcdtfIdbaHaecwaecw6EcdtfIdbMg3Udba3aE:th3aecdthiaKaYazfydbcdtfheinaPaeydbgzcdtfgsa3asIdbMgEUdbaEa8Aa8AaE9DgsEh8AazawasEhwaeclfheaic98fgimbkkadak9hmbkawcu9hmekaQaq9pmdindnaxaQfRbbmbaQhwxdkaqaQcefgQ9hmbxikkakczakcz6EhzaOheaLhOawcu9hmbkkaocdtavc:Seffc98fhedninaoTmeaeydbcbyd;q:kjjbH:bjjjbbaec98fheaocufhoxbkkavc:qdf8Kjjjjbk;IlevucuaicdtgvaicFFFFi0Egocbyd;u:kjjbHjjjjbbhralalyd9GgwcdtfarBdbalawcefBd9GabarBdbaocbyd;u:kjjbHjjjjbbhralalyd9GgocdtfarBdbalaocefBd9GabarBdlcuadcdtadcFFFFi0Ecbyd;u:kjjbHjjjjbbhralalyd9GgocdtfarBdbalaocefBd9GabarBdwabydbcbavz:wjjjb8Aadci9UhDdnadTmbabydbhoaehladhrinaoalydbcdtfgvavydbcefBdbalclfhlarcufgrmbkkdnaiTmbabydbhlabydlhrcbhvaihoinaravBdbarclfhralydbavfhvalclfhlaocufgombkkdnadci6mbabydlhrabydwhvcbhlinaecwfydbhoaeclfydbhdaraeydbcdtfgwawydbgwcefBdbavawcdtfalBdbaradcdtfgdadydbgdcefBdbavadcdtfalBdbaraocdtfgoaoydbgocefBdbavaocdtfalBdbaecxfheaDalcefgl9hmbkkdnaiTmbabydlheabydbhlinaeaeydbalydb9RBdbalclfhlaeclfheaicufgimbkkkQbabaeadaic;K1jjbz:njjjbkQbabaeadaic;m:jjjbz:njjjbk9DeeuabcFeaicdtz:wjjjbhlcbhbdnadTmbindnalaeydbcdtfgiydbcu9hmbaiabBdbabcefhbkaeclfheadcufgdmbkkabk:Vvioud9:du8Jjjjjbc;Wa9Rgl8Kjjjjbcbhvalcxfcbc;Kbz:wjjjb8AalcuadcitgoadcFFFFe0Ecbyd;u:kjjbHjjjjbbgrBdxalceBd2araeadaicez:tjjjbalcuaoadcjjjjoGEcbyd;u:kjjbHjjjjbbgwBdzadcdthednadTmbabhiinaiavBdbaiclfhiadavcefgv9hmbkkawaefhDalabBdwalawBdl9cbhqindnadTmbaq9cq9:hkarhvaDhiadheinaiav8Pibak1:NcFrG87ebavcwfhvaicdfhiaecufgembkkalclfaq:NceGcdtfydbhxalclfaq9ce98gq:NceGcdtfydbhmalc;Wbfcbcjaz:wjjjb8AaDhvadhidnadTmbinalc;Wbfav8VebcdtfgeaeydbcefBdbavcdfhvaicufgimbkkcbhvcbhiinalc;WbfavfgeydbhoaeaiBdbaoaifhiavclfgvcja9hmbkadhvdndnadTmbinalc;WbfaDamydbgicetf8VebcdtfgeaeydbgecefBdbaxaecdtfaiBdbamclfhmavcufgvmbkaq9cv9smdcbhvinabawydbcdtfavBdbawclfhwadavcefgv9hmbxdkkaq9cv9smekkclhvdninavc98Smealcxfavfydbcbyd;q:kjjbH:bjjjbbavc98fhvxbkkalc;Waf8Kjjjjbk:Jwliuo99iud9:cbhv8Jjjjjbca9Rgoczfcwfcbyd:8:kjjbBdbaocb8Pd:0:kjjb83izaocwfcbyd;i:kjjbBdbaocb8Pd;a:kjjb83ibaicd4hrdndnadmbJFFuFhwJFFuuhDJFFuuhqJFFuFhkJFFuuhxJFFuFhmxekarcdthPaehsincbhiinaoczfaifgzasaifIdbgwazIdbgDaDaw9EEUdbaoaifgzawazIdbgDaDaw9DEUdbaiclfgicx9hmbkasaPfhsavcefgvad9hmbkaoIdKhDaoIdwhwaoIdChqaoIdlhkaoIdzhxaoIdbhmkdnadTmbJbbbbJbFu9hJbbbbamax:tgmamJbbbb9DEgmakaq:tgkakam9DEgkawaD:tgwawak9DEgw:vawJbbbb9BEhwdnalmbarcdthoindndnaeclfIdbaq:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikai:S9cC:ghHdndnaeIdbax:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikaHai:S:ehHdndnaecwfIdbaD:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikabaHai:T9cy:g:e83ibaeaofheabcwfhbadcufgdmbxdkkarcdthoindndnaeIdbax:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikai:SgH9ca:gaH9cz:g9cjjj;4s:d:eaH9cFe:d:e9cF:bj;4:pj;ar:d9c:bd9:9c:p;G:d;4j:E;ar:d9cH9:9c;d;H:W:y:m:g;d;Hb:d9cv9:9c;j:KM;j:KM;j:Kd:dhOdndnaeclfIdbaq:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikai:SgH9ca:gaH9cz:g9cjjj;4s:d:eaH9cFe:d:e9cF:bj;4:pj;ar:d9c:bd9:9c:p;G:d;4j:E;ar:d9cH9:9c;d;H:W:y:m:g;d;Hb:d9cq9:9cM;j:KM;j:KM;jl:daO:ehOdndnaecwfIdbaD:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikabaOai:SgH9ca:gaH9cz:g9cjjj;4s:d:eaH9cFe:d:e9cF:bj;4:pj;ar:d9c:bd9:9c:p;G:d;4j:E;ar:d9cH9:9c;d;H:W:y:m:g;d;Hb:d9cC9:9c:KM;j:KM;j:KMD:d:e83ibaeaofheabcwfhbadcufgdmbkkk9teiucbcbyd;y:kjjbgeabcifc98GfgbBd;y:kjjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik;teeeudndnaeabVciGTmbabhixekdndnadcz9pmbabhixekabhiinaiaeydbBdbaiaeydlBdlaiaeydwBdwaiaeydxBdxaeczfheaiczfhiadc9Wfgdcs0mbkkadcl6mbinaiaeydbBdbaeclfheaiclfhiadc98fgdci0mbkkdnadTmbinaiaeRbb86bbaicefhiaecefheadcufgdmbkkabk:3eedudndnabciGTmbabhixekaecFeGc:b:c:ew2hldndnadcz9pmbabhixekabhiinaialBdxaialBdwaialBdlaialBdbaiczfhiadc9Wfgdcs0mbkkadcl6mbinaialBdbaiclfhiadc98fgdci0mbkkdnadTmbinaiae86bbaicefhiadcufgdmbkkabk9teiucbcbyd;y:kjjbgeabcrfc94GfgbBd;y:kjjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik9:eiuZbhedndncbyd;y:kjjbgdaecztgi9nmbcuheadai9RcFFifcz4nbcuSmekadhekcbabae9Rcifc98Gcbyd;y:kjjbfgdBd;y:kjjbdnadZbcztge9nmbadae9RcFFifcz4nb8Akkk;Qddbcjwk;mdbbbbdbbblbbbwbbbbbbbebbbdbbblbbbwbbbbbbbbbbbbbbbb4:h9w9N94:P:gW:j9O:ye9Pbbbbbbebbbdbbbebbbdbbbbbbbdbbbbbbbebbbbbbb:l29hZ;69:9kZ;N;76Z;rg97Z;z;o9xZ8J;B85Z;:;u9yZ;b;k9HZ:2;Z9DZ9e:l9mZ59A8KZ:r;T3Z:A:zYZ79OHZ;j4::8::Y:D9V8:bbbb9s:49:Z8R:hBZ9M9M;M8:L;z;o8:;8:PG89q;x:J878R:hQ8::M:B;e87bbbbbbjZbbjZbbjZ:E;V;N8::Y:DsZ9i;H;68:xd;R8:;h0838:;W:NoZbbbb:WV9O8:uf888:9i;H;68:9c9G;L89;n;m9m89;D8Ko8:bbbbf:8tZ9m836ZS:2AZL;zPZZ818EZ9e:lxZ;U98F8:819E;68:FFuuFFuuFFuuFFuFFFuFFFuFbc;mqkzebbbebbbdbbb9G:vbb",t=new Uint8Array([32,0,65,2,1,106,34,33,3,128,11,4,13,64,6,253,10,7,15,116,127,5,8,12,40,16,19,54,20,9,27,255,113,17,42,67,24,23,146,148,18,14,22,45,70,69,56,114,101,21,25,63,75,136,108,28,118,29,73,115]);if(typeof WebAssembly!="object")return{supported:!1};var a,s=WebAssembly.instantiate(r(e),{}).then(function(x){a=x.instance,a.exports.__wasm_call_ctors(),a.exports.meshopt_encodeVertexVersion(0),a.exports.meshopt_encodeIndexVersion(1)});function r(x){for(var u=new Uint8Array(x.length),d=0;d<x.length;++d){var m=x.charCodeAt(d);u[d]=m>96?m-97:m>64?m-39:m+4}for(var f=0,d=0;d<x.length;++d)u[f++]=u[d]<60?t[u[d]]:(u[d]-60)*64+u[++d];return u.buffer.slice(0,f)}function n(x){if(!x)throw new Error("Assertion failed")}function i(x){return new Uint8Array(x.buffer,x.byteOffset,x.byteLength)}function o(x,u,d,m){var f=a.exports.sbrk,h=f(u.length*4),y=f(d*4),w=new Uint8Array(a.exports.memory.buffer),T=i(u);w.set(T,h),m&&m(h,h,u.length,d);var E=x(y,h,u.length,d);w=new Uint8Array(a.exports.memory.buffer);var R=new Uint32Array(d);new Uint8Array(R.buffer).set(w.subarray(y,y+d*4)),T.set(w.subarray(h,h+u.length*4)),f(h-f(0));for(var I=0;I<u.length;++I)u[I]=R[u[I]];return[R,E]}function c(x,u,d,m){var f=a.exports.sbrk,h=f(d*4),y=f(d*m),w=new Uint8Array(a.exports.memory.buffer);w.set(i(u),y),x(h,y,d,m),w=new Uint8Array(a.exports.memory.buffer);var T=new Uint32Array(d);return new Uint8Array(T.buffer).set(w.subarray(h,h+d*4)),f(h-f(0)),T}function l(x,u,d,m,f){var h=a.exports.sbrk,y=h(u),w=h(m*f),T=new Uint8Array(a.exports.memory.buffer);T.set(i(d),w);var E=x(y,u,w,m,f),R=new Uint8Array(E);return R.set(T.subarray(y,y+E)),h(y-h(0)),R}function p(x){for(var u=0,d=0;d<x.length;++d){var m=x[d];u=u<m?m:u}return u}function g(x,u){if(n(u==2||u==4),u==4)return new Uint32Array(x.buffer,x.byteOffset,x.byteLength/4);var d=new Uint16Array(x.buffer,x.byteOffset,x.byteLength/2);return new Uint32Array(d)}function v(x,u,d,m,f,h,y){var w=a.exports.sbrk,T=w(d*m),E=w(d*h),R=new Uint8Array(a.exports.memory.buffer);R.set(i(u),E),x(T,d,m,f,E,y);var I=new Uint8Array(d*m);return I.set(R.subarray(T,T+d*m)),w(T-w(0)),I}return{ready:s,supported:!0,reorderMesh:function(x,u,d){var m=u?d?a.exports.meshopt_optimizeVertexCacheStrip:a.exports.meshopt_optimizeVertexCache:void 0;return o(a.exports.meshopt_optimizeVertexFetchRemap,x,p(x)+1,m)},reorderPoints:function(x,u){return n(x instanceof Float32Array),n(x.length%u==0),n(u>=3),c(a.exports.meshopt_spatialSortRemap,x,x.length/u,u*4)},encodeVertexBuffer:function(x,u,d){n(d>0&&d<=256),n(d%4==0);var m=a.exports.meshopt_encodeVertexBufferBound(u,d);return l(a.exports.meshopt_encodeVertexBuffer,m,x,u,d)},encodeIndexBuffer:function(x,u,d){n(d==2||d==4),n(u%3==0);var m=g(x,d),f=a.exports.meshopt_encodeIndexBufferBound(u,p(m)+1);return l(a.exports.meshopt_encodeIndexBuffer,f,m,u,4)},encodeIndexSequence:function(x,u,d){n(d==2||d==4);var m=g(x,d),f=a.exports.meshopt_encodeIndexSequenceBound(u,p(m)+1);return l(a.exports.meshopt_encodeIndexSequence,f,m,u,4)},encodeGltfBuffer:function(x,u,d,m){var f={ATTRIBUTES:this.encodeVertexBuffer,TRIANGLES:this.encodeIndexBuffer,INDICES:this.encodeIndexSequence};return n(f[m]),f[m](x,u,d)},encodeFilterOct:function(x,u,d,m){return n(d==4||d==8),n(m>=1&&m<=16),v(a.exports.meshopt_encodeFilterOct,x,u,d,m,16)},encodeFilterQuat:function(x,u,d,m){return n(d==8),n(m>=4&&m<=16),v(a.exports.meshopt_encodeFilterQuat,x,u,d,m,16)},encodeFilterExp:function(x,u,d,m,f){n(d>0&&d%4==0),n(m>=1&&m<=24);var h={Separate:0,SharedVector:1,SharedComponent:2,Clamped:3};return v(a.exports.meshopt_encodeFilterExp,x,u,d,m,d,f?h[f]:1)}}})();var Is=(function(){var e="b9H79Tebbbe8Fv9Gbb9Gvuuuuueu9Giuuub9Geueu9Giuuueuikqbeeedddillviebeoweuec:W:Odkr;leDo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bb8A9TW79O9V9Wt9F9KW9J9V9KW9wWVtW949c919M9MWVbeY9TW79O9V9Wt9F9KW9J9V9KW69U9KW949c919M9MWVbdE9TW79O9V9Wt9F9KW9J9V9KW69U9KW949tWG91W9U9JWbiL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9p9JtblK9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9r919HtbvL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWVT949Wbol79IV9Rbrq:S86qdbk;jYi5ud9:du8Jjjjjbcj;kb9Rgv8Kjjjjbc9:hodnalTmbcuhoaiRbbgrc;WeGc:Ge9hmbarcsGgwce0mbc9:hoalcufadcd4cbawEgDadfgrcKcaawEgqaraq0Egk6mbaicefhxcj;abad9Uc;WFbGcjdadca0EhmaialfgPar9Rgoadfhsavaoadz1jjjbgzceVhHcbhOdndninaeaO9nmeaPax9RaD6mdamaeaO9RaOamfgoae6EgAcsfglc9WGhCabaOad2fhXaAcethQaxaDfhiaOaeaoaeao6E9RhLalcl4cifcd4hKazcj;cbfaAfhYcbh8AazcjdfhEaHh3incbhodnawTmbaxa8Acd4fRbbhokaocFeGh5cbh8Eazcj;cbfhqinaih8Fdndndndna5a8Ecet4ciGgoc9:fPdebdkaPa8F9RaA6mrazcj;cbfa8EaA2fa8FaAz1jjjb8Aa8FaAfhixdkazcj;cbfa8EaA2fcbaAz:jjjjb8Aa8FhixekaPa8F9RaK6mva8FaKfhidnaCTmbaPai9RcK6mbaocdtc:q1jjbfcj1jjbawEhaczhrcbhlinargoc9Wfghaqfhrdndndndndndnaaa8Fahco4fRbbalcoG4ciGcdtfydbPDbedvivvvlvkar9cb83bbarcwf9cb83bbxlkarcbaiRbdai8Xbb9c:c:qj:bw9:9c:q;c1:I1e:d9c:b:c:e1z9:gg9cjjjjjz:dg8J9qE86bbaqaofgrcGfag9c8F1:NghcKtc8F91aicdfa8J9c8N1:Nfg8KRbbG86bbarcVfcba8KahcjeGcr4fghRbbag9cjjjjjl:dg8J9qE86bbarc7fcbaha8J9c8L1:NfghRbbag9cjjjjjd:dg8J9qE86bbarctfcbaha8J9c8K1:NfghRbbag9cjjjjje:dg8J9qE86bbarc91fcbaha8J9c8J1:NfghRbbag9cjjjj;ab:dg8J9qE86bbarc4fcbaha8J9cg1:NfghRbbag9cjjjja:dg8J9qE86bbarc93fcbaha8J9ch1:NfghRbbag9cjjjjz:dgg9qE86bbarc94fcbahag9ca1:NfghRbbai8Xbe9c:c:qj:bw9:9c:q;c1:I1e:d9c:b:c:e1z9:gg9cjjjjjz:dg8J9qE86bbarc95fag9c8F1:NgicKtc8F91aha8J9c8N1:NfghRbbG86bbarc96fcbahaicjeGcr4fgiRbbag9cjjjjjl:dg8J9qE86bbarc97fcbaia8J9c8L1:NfgiRbbag9cjjjjjd:dg8J9qE86bbarc98fcbaia8J9c8K1:NfgiRbbag9cjjjjje:dg8J9qE86bbarc99fcbaia8J9c8J1:NfgiRbbag9cjjjj;ab:dg8J9qE86bbarc9:fcbaia8J9cg1:NfgiRbbag9cjjjja:dg8J9qE86bbarcufcbaia8J9ch1:NfgiRbbag9cjjjjz:dgg9qE86bbaiag9ca1:NfhixikaraiRblaiRbbghco4g8Ka8KciSg8KE86bbaqaofgrcGfaiclfa8Kfg8KRbbahcl4ciGg8La8LciSg8LE86bbarcVfa8Ka8Lfg8KRbbahcd4ciGg8La8LciSg8LE86bbarc7fa8Ka8Lfg8KRbbahciGghahciSghE86bbarctfa8Kahfg8KRbbaiRbeghco4g8La8LciSg8LE86bbarc91fa8Ka8Lfg8KRbbahcl4ciGg8La8LciSg8LE86bbarc4fa8Ka8Lfg8KRbbahcd4ciGg8La8LciSg8LE86bbarc93fa8Ka8Lfg8KRbbahciGghahciSghE86bbarc94fa8Kahfg8KRbbaiRbdghco4g8La8LciSg8LE86bbarc95fa8Ka8Lfg8KRbbahcl4ciGg8La8LciSg8LE86bbarc96fa8Ka8Lfg8KRbbahcd4ciGg8La8LciSg8LE86bbarc97fa8Ka8Lfg8KRbbahciGghahciSghE86bbarc98fa8KahfghRbbaiRbigico4g8Ka8KciSg8KE86bbarc99faha8KfghRbbaicl4ciGg8Ka8KciSg8KE86bbarc9:faha8KfghRbbaicd4ciGg8Ka8KciSg8KE86bbarcufaha8KfgrRbbaiciGgiaiciSgiE86bbaraifhixdkaraiRbwaiRbbghcl4g8Ka8KcsSg8KE86bbaqaofgrcGfaicwfa8Kfg8KRbbahcsGghahcsSghE86bbarcVfa8KahfghRbbaiRbeg8Kcl4g8La8LcsSg8LE86bbarc7faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarctfaha8KfghRbbaiRbdg8Kcl4g8La8LcsSg8LE86bbarc91faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc4faha8KfghRbbaiRbig8Kcl4g8La8LcsSg8LE86bbarc93faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc94faha8KfghRbbaiRblg8Kcl4g8La8LcsSg8LE86bbarc95faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc96faha8KfghRbbaiRbvg8Kcl4g8La8LcsSg8LE86bbarc97faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc98faha8KfghRbbaiRbog8Kcl4g8La8LcsSg8LE86bbarc99faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc9:faha8KfghRbbaiRbrgicl4g8Ka8KcsSg8KE86bbarcufaha8KfgrRbbaicsGgiaicsSgiE86bbaraifhixekarai8Pbb83bbarcwfaicwf8Pbb83bbaiczfhikdnaoaC9pmbalcdfhlaoczfhraPai9RcL0mekkaoaC6moaimexokaCmva8FTmvkaqaAfhqa8Ecefg8Ecl9hmbkdndndndnawTmbasa8Acd4fRbbgociGPlbedrbkaATmdaza8Afh8Fazcj;cbfhhcbh8EaEhaina8FRbbhraahocbhlinaoahalfRbbgqce4cbaqceG9R7arfgr86bbaoadfhoaAalcefgl9hmbkaacefhaa8Fcefh8FahaAfhha8Ecefg8Ecl9hmbxikkaATmeaza8Afhaazcj;cbfhhcbhoceh8EaYh8FinaEaofhlaa8Vbbhrcbhoinala8FaofRbbcwtahaofRbbgqVc;:FiGce4cbaqceG9R7arfgr87bbaladfhlaLaocefgofmbka8FaQfh8FcdhoaacdfhaahaQfhha8EceGhlcbh8EalmbxdkkaATmbcbaocl49Rh8Eaza8AfRbbhqcwhoa3hlinalRbbaotaqVhqalcefhlaocwfgoca9hmbkcbhhaEh8FaYhainazcj;cbfahfRbbhrcwhoaahlinalRbbaotarVhralaAfhlaocwfgoca9hmbkara8E93aq7hqcbhoa8Fhlinalaqao486bbalcefhlaocwfgoca9hmbka8Fadfh8FaacefhaahcefghaA9hmbkkaEclfhEa3clfh3a8Aclfg8Aad6mbkaXazcjdfaAad2z1jjjb8AazazcjdfaAcufad2fadz1jjjb8AaAaOfhOaihxaimbkc9:hoxdkcbc99aPax9RakSEhoxekc9:hokavcj;kbf8Kjjjjbaok:XseHu8Jjjjjbc;ae9Rgv8Kjjjjbc9:hodnaeci9UgrcHfal0mbcuhoaiRbbgwc;WeGc;Ge9hmbawcsGgDce0mbavc;abfcFecjez:jjjjb8AavcUf9cu83ibavc8Wf9cu83ibavcyf9cu83ibavcaf9cu83ibavcKf9cu83ibavczf9cu83ibav9cu83iwav9cu83ibaialfc9WfhqaicefgwarfhldnaeTmbcmcsaDceSEhkcbhxcbhmcbhrcbhicbhoindnalaq9nmbc9:hoxikdndnawRbbgDc;Ve0mbavc;abfaoaDcu7gPcl4fcsGcitfgsydlhzasydbhHdndnaDcsGgsak9pmbavaiaPfcsGcdtfydbaxasEhDaxasTgOfhxxekdndnascsSmbcehOasc987asamffcefhDxekalcefhDal8SbbgscFeGhPdndnascu9mmbaDhlxekalcvfhlaPcFbGhPcrhsdninaD8SbbgOcFbGastaPVhPaOcu9kmeaDcefhDascrfgsc8J9hmbxdkkaDcefhlkcehOaPce4cbaPceG9R7amfhDkaDhmkavc;abfaocitfgsaDBdbasazBdlavaicdtfaDBdbavc;abfaocefcsGcitfgsaHBdbasaDBdlaocdfhoaOaifhidnadcd9hmbabarcetfgsaH87ebasclfaD87ebascdfaz87ebxdkabarcdtfgsaHBdbascwfaDBdbasclfazBdbxekdnaDcpe0mbaxcefgOavaiaqaDcsGfRbbgscl49RcsGcdtfydbascz6gPEhDavaias9RcsGcdtfydbaOaPfgzascsGgOEhsaOThOdndnadcd9hmbabarcetfgHax87ebaHclfas87ebaHcdfaD87ebxekabarcdtfgHaxBdbaHcwfasBdbaHclfaDBdbkavaicdtfaxBdbavc;abfaocitfgHaDBdbaHaxBdlavaicefgicsGcdtfaDBdbavc;abfaocefcsGcitfgHasBdbaHaDBdlavaiaPfgicsGcdtfasBdbavc;abfaocdfcsGcitfgDaxBdbaDasBdlaocifhoaiaOfhiazaOfhxxekaxcbalRbbgHEgAaDc;:eSgDfhzaHcsGhCaHcl4hXdndnaHcs0mbazcefhOxekazhOavaiaX9RcsGcdtfydbhzkdndnaCmbaOcefhxxekaOhxavaiaH9RcsGcdtfydbhOkdndnaDTmbalcefhDxekalcdfhDal8SbegPcFeGhsdnaPcu9kmbalcofhAascFbGhscrhldninaD8SbbgPcFbGaltasVhsaPcu9kmeaDcefhDalcrfglc8J9hmbkaAhDxekaDcefhDkasce4cbasceG9R7amfgmhAkdndnaXcsSmbaDhsxekaDcefhsaD8SbbglcFeGhPdnalcu9kmbaDcvfhzaPcFbGhPcrhldninas8SbbgDcFbGaltaPVhPaDcu9kmeascefhsalcrfglc8J9hmbkazhsxekascefhskaPce4cbaPceG9R7amfgmhzkdndnaCcsSmbashlxekascefhlas8SbbgDcFeGhPdnaDcu9kmbascvfhOaPcFbGhPcrhDdninal8SbbgscFbGaDtaPVhPascu9kmealcefhlaDcrfgDc8J9hmbkaOhlxekalcefhlkaPce4cbaPceG9R7amfgmhOkdndnadcd9hmbabarcetfgDaA87ebaDclfaO87ebaDcdfaz87ebxekabarcdtfgDaABdbaDcwfaOBdbaDclfazBdbkavc;abfaocitfgDazBdbaDaABdlavaicdtfaABdbavc;abfaocefcsGcitfgDaOBdbaDazBdlavaicefgicsGcdtfazBdbavc;abfaocdfcsGcitfgDaABdbaDaOBdlavaiaHcz6aXcsSVfgicsGcdtfaOBdbaiaCTaCcsSVfhiaocifhokawcefhwaocsGhoaicsGhiarcifgrae6mbkkcbc99alaqSEhokavc;aef8Kjjjjbaok:clevu8Jjjjjbcz9Rhvdnaecvfal9nmbc9:skdnaiRbbc;:eGc;qeSmbcuskav9cb83iwaicefhoaialfc98fhrdnaeTmbdnadcdSmbcbhwindnaoar6mbc9:skaocefhlao8SbbgicFeGhddndnaicu9mmbalhoxekaocvfhoadcFbGhdcrhidninal8SbbgDcFbGaitadVhdaDcu9kmealcefhlaicrfgic8J9hmbxdkkalcefhokabawcdtfadc8Etc8F91adcd47avcwfadceGcdtVglydbfgiBdbalaiBdbawcefgwae9hmbxdkkcbhwindnaoar6mbc9:skaocefhlao8SbbgicFeGhddndnaicu9mmbalhoxekaocvfhoadcFbGhdcrhidninal8SbbgDcFbGaitadVhdaDcu9kmealcefhlaicrfgic8J9hmbxdkkalcefhokabawcetfadc8Etc8F91adcd47avcwfadceGcdtVglydbfgi87ebalaiBdbawcefgwae9hmbkkcbc99aoarSEk:Lvoeue99dud99eud99dndnadcl9hmbaeTmeindndnabcdfgd8Sbb:Yab8Sbbgi:Ygl:l:tabcefgv8Sbbgo:Ygr:l:tgwJbb;:9cawawNJbbbbawawJbbbb9GgDEgq:mgkaqaicb9iEalMgwawNakaqaocb9iEarMgqaqNMM:r:vglNJbbbZJbbb:;aDEMgr:lJbbb9p9DTmbar:Ohixekcjjjj94hikadai86bbdndnaqalNJbbbZJbbb:;aqJbbbb9GEMgq:lJbbb9p9DTmbaq:Ohdxekcjjjj94hdkavad86bbdndnawalNJbbbZJbbb:;awJbbbb9GEMgw:lJbbb9p9DTmbaw:Ohdxekcjjjj94hdkabad86bbabclfhbaecufgembxdkkaeTmbindndnabclfgd8Ueb:Yab8Uebgi:Ygl:l:tabcdfgv8Uebgo:Ygr:l:tgwJb;:FSawawNJbbbbawawJbbbb9GgDEgq:mgkaqaicb9iEalMgwawNakaqaocb9iEarMgqaqNMM:r:vglNJbbbZJbbb:;aDEMgr:lJbbb9p9DTmbar:Ohixekcjjjj94hikadai87ebdndnaqalNJbbbZJbbb:;aqJbbbb9GEMgq:lJbbb9p9DTmbaq:Ohdxekcjjjj94hdkavad87ebdndnawalNJbbbZJbbb:;awJbbbb9GEMgw:lJbbb9p9DTmbaw:Ohdxekcjjjj94hdkabad87ebabcwfhbaecufgembkkk;oiliui99iue99dnaeTmbcbhiabhlindndnJ;Zl81Zalcof8UebgvciV:Y:vgoal8Ueb:YNgrJb;:FSNJbbbZJbbb:;arJbbbb9GEMgw:lJbbb9p9DTmbaw:OhDxekcjjjj94hDkalclf8Uebhqalcdf8UebhkabaiavcefciGfcetfaD87ebdndnaoak:YNgwJb;:FSNJbbbZJbbb:;awJbbbb9GEMgx:lJbbb9p9DTmbax:OhDxekcjjjj94hDkabaiavciGfgkcd7cetfaD87ebdndnaoaq:YNgoJb;:FSNJbbbZJbbb:;aoJbbbb9GEMgx:lJbbb9p9DTmbax:OhDxekcjjjj94hDkabaiavcufciGfcetfaD87ebdndnJbbjZararN:tawawN:taoaoN:tgrJbbbbarJbbbb9GE:rJb;:FSNJbbbZMgr:lJbbb9p9DTmbar:Ohvxekcjjjj94hvkabakcetfav87ebalcwfhlaiclfhiaecufgembkkk9mbdnadcd4ae2gdTmbinababydbgecwtcw91:Yaece91cjjj98Gcjjj;8if::NUdbabclfhbadcufgdmbkkk9teiucbcbyd:K1jjbgeabcifc98GfgbBd:K1jjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik;teeeudndnaeabVciGTmbabhixekdndnadcz9pmbabhixekabhiinaiaeydbBdbaiaeydlBdlaiaeydwBdwaiaeydxBdxaeczfheaiczfhiadc9Wfgdcs0mbkkadcl6mbinaiaeydbBdbaeclfheaiclfhiadc98fgdci0mbkkdnadTmbinaiaeRbb86bbaicefhiaecefheadcufgdmbkkabk:3eedudndnabciGTmbabhixekaecFeGc:b:c:ew2hldndnadcz9pmbabhixekabhiinaialBdxaialBdwaialBdlaialBdbaiczfhiadc9Wfgdcs0mbkkadcl6mbinaialBdbaiclfhiadc98fgdci0mbkkdnadTmbinaiae86bbaicefhiadcufgdmbkkabkk81dbcjwk8Kbbbbdbbblbbbwbbbbbbbebbbdbbblbbbwbbbbc:Kwkl8WNbb",t="b9H79TebbbeKl9Gbb9Gvuuuuueu9Giuuub9Geueuikqbbebeedddilve9Weeeviebeoweuec:q:6dkr;leDo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bb8A9TW79O9V9Wt9F9KW9J9V9KW9wWVtW949c919M9MWVbdY9TW79O9V9Wt9F9KW9J9V9KW69U9KW949c919M9MWVblE9TW79O9V9Wt9F9KW9J9V9KW69U9KW949tWG91W9U9JWbvL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9p9JtboK9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9r919HtbrL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWVT949Wbwl79IV9RbDq;G9Mqlbzik9:evu8Jjjjjbcz9Rhbcbheincbhdcbhiinabcwfadfaicjuaead4ceGglE86bbaialfhiadcefgdcw9hmbkaec:q:yjjbfai86bbaecitc:q1jjbfab8Piw83ibaecefgecjd9hmbkk:183lYud97dur978Jjjjjbcj;kb9Rgv8Kjjjjbc9:hodnalTmbcuhoaiRbbgrc;WeGc:Ge9hmbarcsGgwce0mbc9:hoalcufadcd4cbawEgDadfgrcKcaawEgqaraq0Egk6mbaicefhxavaialfgmar9Rgoad;8qbbcj;abad9Uc;WFbGcjdadca0EhPdndndnadTmbaoadfhscbhzinaeaz9nmdamax9RaD6miabazad2fhHaxaDfhOaPaeaz9RazaPfae6EgAcsfgocl4cifcd4hCavcj;cbfaoc9WGgXcetfhQavcj;cbfaXci2fhLavcj;cbfaXfhKcbhYaoc;ab6h8AincbhodnawTmbaxaYcd4fRbbhokaocFeGhEcbh3avcj;cbfh5indndndndnaEa3cet4ciGgoc9:fPdebdkamaO9RaX6mwavcj;cbfa3aX2faOaX;8qbbaOaAfhOxdkavcj;cbfa3aX2fcbaX;8kbxekamaO9RaC6moaoclVcbawEhraOaCfhocbhidna8Ambamao9Rc;Gb6mbcbhlina5alfhidndndndndndnaOalco4fRbbgqciGarfPDbedibledibkaipxbbbbbbbbbbbbbbbbpklbxlkaiaopbblaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLg8Ecdp:mea8EpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9og8Fpxiiiiiiiiiiiiiiiip8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaoclffahc:q:yjjbfRbbfhoxikaiaopbbwaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9og8Fpxssssssssssssssssp8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaocwffahc:q:yjjbfRbbfhoxdkaiaopbbbpklbaoczfhoxekaiaopbbdaoRbbgacitc:q1jjbfpbibaac:q:yjjbfRbbgapsaoRbeghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPpklbaaaocdffahc:q:yjjbfRbbfhokdndndndndndnaqcd4ciGarfPDbedibledibkaiczfpxbbbbbbbbbbbbbbbbpklbxlkaiczfaopbblaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLg8Ecdp:mea8EpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9og8Fpxiiiiiiiiiiiiiiiip8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaoclffahc:q:yjjbfRbbfhoxikaiczfaopbbwaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9og8Fpxssssssssssssssssp8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaocwffahc:q:yjjbfRbbfhoxdkaiczfaopbbbpklbaoczfhoxekaiczfaopbbdaoRbbgacitc:q1jjbfpbibaac:q:yjjbfRbbgapsaoRbeghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPpklbaaaocdffahc:q:yjjbfRbbfhokdndndndndndnaqcl4ciGarfPDbedibledibkaicafpxbbbbbbbbbbbbbbbbpklbxlkaicafaopbblaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLg8Ecdp:mea8EpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9og8Fpxiiiiiiiiiiiiiiiip8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaoclffahc:q:yjjbfRbbfhoxikaicafaopbbwaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9og8Fpxssssssssssssssssp8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaocwffahc:q:yjjbfRbbfhoxdkaicafaopbbbpklbaoczfhoxekaicafaopbbdaoRbbgacitc:q1jjbfpbibaac:q:yjjbfRbbgapsaoRbeghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPpklbaaaocdffahc:q:yjjbfRbbfhokdndndndndndnaqco4arfPDbedibledibkaic8Wfpxbbbbbbbbbbbbbbbbpklbxlkaic8Wfaopbblaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLg8Ecdp:mea8EpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9og8Fpxiiiiiiiiiiiiiiiip8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngicitc:q1jjbfpbibaic:q:yjjbfRbbgipsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Ngqcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaiaoclffaqc:q:yjjbfRbbfhoxikaic8Wfaopbbwaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9og8Fpxssssssssssssssssp8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngicitc:q1jjbfpbibaic:q:yjjbfRbbgipsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Ngqcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaiaocwffaqc:q:yjjbfRbbfhoxdkaic8Wfaopbbbpklbaoczfhoxekaic8WfaopbbdaoRbbgicitc:q1jjbfpbibaic:q:yjjbfRbbgipsaoRbegqcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPpklbaiaocdffaqc:q:yjjbfRbbfhokalc;abfhialcjefaX0meaihlamao9Rc;Fb0mbkkdnaiaX9pmbaici4hlinamao9RcK6mwa5aifhqdndndndndndnaOaico4fRbbalcoG4ciGarfPDbedibledibkaqpxbbbbbbbbbbbbbbbbpkbbxlkaqaopbblaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLg8Ecdp:mea8EpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9og8Fpxiiiiiiiiiiiiiiiip8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spkbbaaaoclffahc:q:yjjbfRbbfhoxikaqaopbbwaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9og8Fpxssssssssssssssssp8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spkbbaaaocwffahc:q:yjjbfRbbfhoxdkaqaopbbbpkbbaoczfhoxekaqaopbbdaoRbbgacitc:q1jjbfpbibaac:q:yjjbfRbbgapsaoRbeghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPpkbbaaaocdffahc:q:yjjbfRbbfhokalcdfhlaiczfgiaX6mbkkaohOaoTmoka5aXfh5a3cefg3cl9hmbkdndndndnawTmbasaYcd4fRbbglciGPlbedwbkaXTmdavcjdfaYfhlavaYfpbdbhgcbhoinalavcj;cbfaofpblbg8JaKaofpblbg8KpmbzeHdOiAlCvXoQrLg8LaQaofpblbg8MaLaofpblbg8NpmbzeHdOiAlCvXoQrLgypmbezHdiOAlvCXorQLg8Ecep9Ta8Epxeeeeeeeeeeeeeeeeg8Fp9op9Hp9rg8Eagp9Uggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp9Uggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp9Uggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp9Uggp9Abbbaladfglaga8LaypmwDKYqk8AExm35Ps8E8Fg8Ecep9Ta8Ea8Fp9op9Hp9rg8Ep9Uggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp9Uggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp9Uggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp9Uggp9Abbbaladfglaga8Ja8KpmwKDYq8AkEx3m5P8Es8Fg8Ja8Ma8NpmwKDYq8AkEx3m5P8Es8Fg8KpmbezHdiOAlvCXorQLg8Ecep9Ta8Ea8Fp9op9Hp9rg8Ep9Uggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp9Uggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp9Uggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp9Uggp9Abbbaladfglaga8Ja8KpmwDKYqk8AExm35Ps8E8Fg8Ecep9Ta8Ea8Fp9op9Hp9rg8Ep9Ug8Fp9Abbbaladfgla8Fa8Ea8Epmlvorlvorlvorlvorp9Ug8Fp9Abbbaladfgla8Fa8Ea8EpmwDqkwDqkwDqkwDqkp9Ug8Fp9Abbbaladfgla8Fa8Ea8EpmxmPsxmPsxmPsxmPsp9Uggp9AbbbaladfhlaoczfgoaX6mbxikkaXTmeavcjdfaYfhlavaYfpbdbhgcbhoinalavcj;cbfaofpblbg8JaKaofpblbg8KpmbzeHdOiAlCvXoQrLg8LaQaofpblbg8MaLaofpblbg8NpmbzeHdOiAlCvXoQrLgypmbezHdiOAlvCXorQLg8Ecep:nea8Epxebebebebebebebebg8Fp9op:bep9rg8Eagp:oeggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp:oeggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp:oeggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp:oeggp9Abbbaladfglaga8LaypmwDKYqk8AExm35Ps8E8Fg8Ecep:nea8Ea8Fp9op:bep9rg8Ep:oeggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp:oeggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp:oeggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp:oeggp9Abbbaladfglaga8Ja8KpmwKDYq8AkEx3m5P8Es8Fg8Ja8Ma8NpmwKDYq8AkEx3m5P8Es8Fg8KpmbezHdiOAlvCXorQLg8Ecep:nea8Ea8Fp9op:bep9rg8Ep:oeggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp:oeggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp:oeggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp:oeggp9Abbbaladfglaga8Ja8KpmwDKYqk8AExm35Ps8E8Fg8Ecep:nea8Ea8Fp9op:bep9rg8Ep:oeg8Fp9Abbbaladfgla8Fa8Ea8Epmlvorlvorlvorlvorp:oeg8Fp9Abbbaladfgla8Fa8Ea8EpmwDqkwDqkwDqkwDqkp:oeg8Fp9Abbbaladfgla8Fa8Ea8EpmxmPsxmPsxmPsxmPsp:oeggp9AbbbaladfhlaoczfgoaX6mbxdkkaXTmbcbhocbalcl4gl9Rc8FGhiavcjdfaYfhravaYfpbdbh8Finaravcj;cbfaofpblbggaKaofpblbg8JpmbzeHdOiAlCvXoQrLg8KaQaofpblbg8LaLaofpblbg8MpmbzeHdOiAlCvXoQrLg8NpmbezHdiOAlvCXorQLg8Eaip:Rea8Ealp:Sep9qg8Ea8Fp9rg8Fp9Abbbaradfgra8Fa8Ea8Epmlvorlvorlvorlvorp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmwDqkwDqkwDqkwDqkp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmxmPsxmPsxmPsxmPsp9rg8Fp9Abbbaradfgra8Fa8Ka8NpmwDKYqk8AExm35Ps8E8Fg8Eaip:Rea8Ealp:Sep9qg8Ep9rg8Fp9Abbbaradfgra8Fa8Ea8Epmlvorlvorlvorlvorp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmwDqkwDqkwDqkwDqkp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmxmPsxmPsxmPsxmPsp9rg8Fp9Abbbaradfgra8Faga8JpmwKDYq8AkEx3m5P8Es8Fgga8La8MpmwKDYq8AkEx3m5P8Es8Fg8JpmbezHdiOAlvCXorQLg8Eaip:Rea8Ealp:Sep9qg8Ep9rg8Fp9Abbbaradfgra8Fa8Ea8Epmlvorlvorlvorlvorp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmwDqkwDqkwDqkwDqkp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmxmPsxmPsxmPsxmPsp9rg8Fp9Abbbaradfgra8Faga8JpmwDKYqk8AExm35Ps8E8Fg8Eaip:Rea8Ealp:Sep9qg8Ep9rg8Fp9Abbbaradfgra8Fa8Ea8Epmlvorlvorlvorlvorp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmwDqkwDqkwDqkwDqkp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmxmPsxmPsxmPsxmPsp9rg8Fp9AbbbaradfhraoczfgoaX6mbkkaYclfgYad6mbkaHavcjdfaAad2;8qbbavavcjdfaAcufad2fad;8qbbaAazfhzc9:hoaOhxaOmbxlkkaeTmbaDalfhrcbhocuhlinaralaD9RglfaD6mdaPaeao9RaoaPfae6Eaofgoae6mbkaial9Rhxkcbc99amax9RakSEhoxekc9:hokavcj;kbf8Kjjjjbaokwbz:bjjjbk:TseHu8Jjjjjbc;ae9Rgv8Kjjjjbc9:hodnaeci9UgrcHfal0mbcuhoaiRbbgwc;WeGc;Ge9hmbawcsGgDce0mbavc;abfcFecje;8kbavcUf9cu83ibavc8Wf9cu83ibavcyf9cu83ibavcaf9cu83ibavcKf9cu83ibavczf9cu83ibav9cu83iwav9cu83ibaialfc9WfhqaicefgwarfhldnaeTmbcmcsaDceSEhkcbhxcbhmcbhrcbhicbhoindnalaq9nmbc9:hoxikdndnawRbbgDc;Ve0mbavc;abfaoaDcu7gPcl4fcsGcitfgsydlhzasydbhHdndnaDcsGgsak9pmbavaiaPfcsGcdtfydbaxasEhDaxasTgOfhxxekdndnascsSmbcehOasc987asamffcefhDxekalcefhDal8SbbgscFeGhPdndnascu9mmbaDhlxekalcvfhlaPcFbGhPcrhsdninaD8SbbgOcFbGastaPVhPaOcu9kmeaDcefhDascrfgsc8J9hmbxdkkaDcefhlkcehOaPce4cbaPceG9R7amfhDkaDhmkavc;abfaocitfgsaDBdbasazBdlavaicdtfaDBdbavc;abfaocefcsGcitfgsaHBdbasaDBdlaocdfhoaOaifhidnadcd9hmbabarcetfgsaH87ebasclfaD87ebascdfaz87ebxdkabarcdtfgsaHBdbascwfaDBdbasclfazBdbxekdnaDcpe0mbaxcefgOavaiaqaDcsGfRbbgscl49RcsGcdtfydbascz6gPEhDavaias9RcsGcdtfydbaOaPfgzascsGgOEhsaOThOdndnadcd9hmbabarcetfgHax87ebaHclfas87ebaHcdfaD87ebxekabarcdtfgHaxBdbaHcwfasBdbaHclfaDBdbkavaicdtfaxBdbavc;abfaocitfgHaDBdbaHaxBdlavaicefgicsGcdtfaDBdbavc;abfaocefcsGcitfgHasBdbaHaDBdlavaiaPfgicsGcdtfasBdbavc;abfaocdfcsGcitfgDaxBdbaDasBdlaocifhoaiaOfhiazaOfhxxekaxcbalRbbgHEgAaDc;:eSgDfhzaHcsGhCaHcl4hXdndnaHcs0mbazcefhOxekazhOavaiaX9RcsGcdtfydbhzkdndnaCmbaOcefhxxekaOhxavaiaH9RcsGcdtfydbhOkdndnaDTmbalcefhDxekalcdfhDal8SbegPcFeGhsdnaPcu9kmbalcofhAascFbGhscrhldninaD8SbbgPcFbGaltasVhsaPcu9kmeaDcefhDalcrfglc8J9hmbkaAhDxekaDcefhDkasce4cbasceG9R7amfgmhAkdndnaXcsSmbaDhsxekaDcefhsaD8SbbglcFeGhPdnalcu9kmbaDcvfhzaPcFbGhPcrhldninas8SbbgDcFbGaltaPVhPaDcu9kmeascefhsalcrfglc8J9hmbkazhsxekascefhskaPce4cbaPceG9R7amfgmhzkdndnaCcsSmbashlxekascefhlas8SbbgDcFeGhPdnaDcu9kmbascvfhOaPcFbGhPcrhDdninal8SbbgscFbGaDtaPVhPascu9kmealcefhlaDcrfgDc8J9hmbkaOhlxekalcefhlkaPce4cbaPceG9R7amfgmhOkdndnadcd9hmbabarcetfgDaA87ebaDclfaO87ebaDcdfaz87ebxekabarcdtfgDaABdbaDcwfaOBdbaDclfazBdbkavc;abfaocitfgDazBdbaDaABdlavaicdtfaABdbavc;abfaocefcsGcitfgDaOBdbaDazBdlavaicefgicsGcdtfazBdbavc;abfaocdfcsGcitfgDaABdbaDaOBdlavaiaHcz6aXcsSVfgicsGcdtfaOBdbaiaCTaCcsSVfhiaocifhokawcefhwaocsGhoaicsGhiarcifgrae6mbkkcbc99alaqSEhokavc;aef8Kjjjjbaok:clevu8Jjjjjbcz9Rhvdnaecvfal9nmbc9:skdnaiRbbc;:eGc;qeSmbcuskav9cb83iwaicefhoaialfc98fhrdnaeTmbdnadcdSmbcbhwindnaoar6mbc9:skaocefhlao8SbbgicFeGhddndnaicu9mmbalhoxekaocvfhoadcFbGhdcrhidninal8SbbgDcFbGaitadVhdaDcu9kmealcefhlaicrfgic8J9hmbxdkkalcefhokabawcdtfadc8Etc8F91adcd47avcwfadceGcdtVglydbfgiBdbalaiBdbawcefgwae9hmbxdkkcbhwindnaoar6mbc9:skaocefhlao8SbbgicFeGhddndnaicu9mmbalhoxekaocvfhoadcFbGhdcrhidninal8SbbgDcFbGaitadVhdaDcu9kmealcefhlaicrfgic8J9hmbxdkkalcefhokabawcetfadc8Etc8F91adcd47avcwfadceGcdtVglydbfgi87ebalaiBdbawcefgwae9hmbkkcbc99aoarSEk:SPliuo97eue978Jjjjjbca9Rhiaec98Ghldndnadcl9hmbdnalTmbcbhvabhdinadadpbbbgocKp:RecKp:Sep;6egraocwp:RecKp:Sep;6earp;Geaoczp:RecKp:Sep;6egwp;Gep;Kep;LegDpxbbbbbbbbbbbbbbbbp:2egqarpxbbbjbbbjbbbjbbbjgkp9op9rp;Kegrpxbb;:9cbb;:9cbb;:9cbb;:9cararp;MeaDaDp;Meawaqawakp9op9rp;Kegrarp;Mep;Kep;Kep;Jep;Negwp;Mepxbbn0bbn0bbn0bbn0gqp;KepxFbbbFbbbFbbbFbbbp9oaopxbbbFbbbFbbbFbbbFp9op9qarawp;Meaqp;Kecwp:RepxbFbbbFbbbFbbbFbbp9op9qaDawp;Meaqp;Keczp:RepxbbFbbbFbbbFbbbFbp9op9qpkbbadczfhdavclfgval6mbkkalaeSmeaipxbbbbbbbbbbbbbbbbgqpklbaiabalcdtfgdaeciGglcdtgv;8qbbdnalTmbaiaipblbgocKp:RecKp:Sep;6egraocwp:RecKp:Sep;6earp;Geaoczp:RecKp:Sep;6egwp;Gep;Kep;LegDaqp:2egqarpxbbbjbbbjbbbjbbbjgkp9op9rp;Kegrpxbb;:9cbb;:9cbb;:9cbb;:9cararp;MeaDaDp;Meawaqawakp9op9rp;Kegrarp;Mep;Kep;Kep;Jep;Negwp;Mepxbbn0bbn0bbn0bbn0gqp;KepxFbbbFbbbFbbbFbbbp9oaopxbbbFbbbFbbbFbbbFp9op9qarawp;Meaqp;Kecwp:RepxbFbbbFbbbFbbbFbbp9op9qaDawp;Meaqp;Keczp:RepxbbFbbbFbbbFbbbFbp9op9qpklbkadaiav;8qbbskdnalTmbcbhvabhdinadczfgxaxpbbbgopxbbbbbbFFbbbbbbFFgkp9oadpbbbgDaopmbediwDqkzHOAKY8AEgwczp:Reczp:Sep;6egraDaopmlvorxmPsCXQL358E8FpxFubbFubbFubbFubbp9op;7eawczp:Sep;6egwp;Gearp;Gep;Kep;Legopxbbbbbbbbbbbbbbbbp:2egqarpxbbbjbbbjbbbjbbbjgmp9op9rp;Kegrpxb;:FSb;:FSb;:FSb;:FSararp;Meaoaop;Meawaqawamp9op9rp;Kegrarp;Mep;Kep;Kep;Jep;Negwp;Mepxbbn0bbn0bbn0bbn0gqp;KepxFFbbFFbbFFbbFFbbp9oaoawp;Meaqp;Keczp:Rep9qgoarawp;Meaqp;KepxFFbbFFbbFFbbFFbbp9ogrpmwDKYqk8AExm35Ps8E8Fp9qpkbbadaDakp9oaoarpmbezHdiOAlvCXorQLp9qpkbbadcafhdavclfgval6mbkkalaeSmbaiczfpxbbbbbbbbbbbbbbbbgopklbaiaopklbaiabalcitfgdaeciGglcitgv;8qbbdnalTmbaiaipblzgopxbbbbbbFFbbbbbbFFgkp9oaipblbgDaopmbediwDqkzHOAKY8AEgwczp:Reczp:Sep;6egraDaopmlvorxmPsCXQL358E8FpxFubbFubbFubbFubbp9op;7eawczp:Sep;6egwp;Gearp;Gep;Kep;Legopxbbbbbbbbbbbbbbbbp:2egqarpxbbbjbbbjbbbjbbbjgmp9op9rp;Kegrpxb;:FSb;:FSb;:FSb;:FSararp;Meaoaop;Meawaqawamp9op9rp;Kegrarp;Mep;Kep;Kep;Jep;Negwp;Mepxbbn0bbn0bbn0bbn0gqp;KepxFFbbFFbbFFbbFFbbp9oaoawp;Meaqp;Keczp:Rep9qgoarawp;Meaqp;KepxFFbbFFbbFFbbFFbbp9ogrpmwDKYqk8AExm35Ps8E8Fp9qpklzaiaDakp9oaoarpmbezHdiOAlvCXorQLp9qpklbkadaiav;8qbbkk:oDllue97euv978Jjjjjbc8W9Rhidnaec98GglTmbcbhvabhoinaiaopbbbgraoczfgwpbbbgDpmlvorxmPsCXQL358E8Fgqczp:Segkclp:RepklbaopxbbjZbbjZbbjZbbjZpx;Zl81Z;Zl81Z;Zl81Z;Zl81Zakpxibbbibbbibbbibbbp9qp;6ep;NegkaraDpmbediwDqkzHOAKY8AEgrczp:Reczp:Sep;6ep;MegDaDp;Meakarczp:Sep;6ep;Megxaxp;Meakaqczp:Reczp:Sep;6ep;Megqaqp;Mep;Kep;Kep;Lepxbbbbbbbbbbbbbbbbp:4ep;Jepxb;:FSb;:FSb;:FSb;:FSgkp;Mepxbbn0bbn0bbn0bbn0grp;KepxFFbbFFbbFFbbFFbbgmp9oaxakp;Mearp;Keczp:Rep9qgxaDakp;Mearp;Keamp9oaqakp;Mearp;Keczp:Rep9qgkpmbezHdiOAlvCXorQLgrp5baipblbpEb:T:j83ibaocwfarp5eaipblbpEe:T:j83ibawaxakpmwDKYqk8AExm35Ps8E8Fgkp5baipblbpEd:T:j83ibaocKfakp5eaipblbpEi:T:j83ibaocafhoavclfgval6mbkkdnalaeSmbaiczfpxbbbbbbbbbbbbbbbbgkpklbaiakpklbaiabalcitfgoaeciGgvcitgw;8qbbdnavTmbaiaipblbgraipblzgDpmlvorxmPsCXQL358E8Fgqczp:Segkclp:RepklaaipxbbjZbbjZbbjZbbjZpx;Zl81Z;Zl81Z;Zl81Z;Zl81Zakpxibbbibbbibbbibbbp9qp;6ep;NegkaraDpmbediwDqkzHOAKY8AEgrczp:Reczp:Sep;6ep;MegDaDp;Meakarczp:Sep;6ep;Megxaxp;Meakaqczp:Reczp:Sep;6ep;Megqaqp;Mep;Kep;Kep;Lepxbbbbbbbbbbbbbbbbp:4ep;Jepxb;:FSb;:FSb;:FSb;:FSgkp;Mepxbbn0bbn0bbn0bbn0grp;KepxFFbbFFbbFFbbFFbbgmp9oaxakp;Mearp;Keczp:Rep9qgxaDakp;Mearp;Keamp9oaqakp;Mearp;Keczp:Rep9qgkpmbezHdiOAlvCXorQLgrp5baipblapEb:T:j83ibaiarp5eaipblapEe:T:j83iwaiaxakpmwDKYqk8AExm35Ps8E8Fgkp5baipblapEd:T:j83izaiakp5eaipblapEi:T:j83iKkaoaiaw;8qbbkk;uddiue978Jjjjjbc;ab9Rhidnadcd4ae2glc98GgvTmbcbheabhdinadadpbbbgocwp:Recwp:Sep;6eaocep:SepxbbjFbbjFbbjFbbjFp9opxbbjZbbjZbbjZbbjZp:Uep;Mepkbbadczfhdaeclfgeav6mbkkdnavalSmbaic8WfpxbbbbbbbbbbbbbbbbgopklbaicafaopklbaiczfaopklbaiaopklbaiabavcdtfgdalciGgecdtgv;8qbbdnaeTmbaiaipblbgocwp:Recwp:Sep;6eaocep:SepxbbjFbbjFbbjFbbjFp9opxbbjZbbjZbbjZbbjZp:Uep;Mepklbkadaiav;8qbbkk9teiucbcbydj1jjbgeabcifc98GfgbBdj1jjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaikkkebcjwklz:Dbb",a=new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,3,2,0,0,5,3,1,0,1,12,1,0,10,22,2,12,0,65,0,65,0,65,0,252,10,0,0,11,7,0,65,0,253,15,26,11]),s=new Uint8Array([32,0,65,2,1,106,34,33,3,128,11,4,13,64,6,253,10,7,15,116,127,5,8,12,40,16,19,54,20,9,27,255,113,17,42,67,24,23,146,148,18,14,22,45,70,69,56,114,101,21,25,63,75,136,108,28,118,29,73,115]);if(typeof WebAssembly!="object")return{supported:!1};var r=WebAssembly.validate(a)?o(t):o(e),n,i=WebAssembly.instantiate(r,{}).then(function(f){n=f.instance,n.exports.__wasm_call_ctors()});function o(f){for(var h=new Uint8Array(f.length),y=0;y<f.length;++y){var w=f.charCodeAt(y);h[y]=w>96?w-97:w>64?w-39:w+4}for(var T=0,y=0;y<f.length;++y)h[T++]=h[y]<60?s[h[y]]:(h[y]-60)*64+h[++y];return h.buffer.slice(0,T)}function c(f,h,y,w,T,E,R){var I=f.exports.sbrk,_=w+3&-4,A=I(_*T),j=I(E.length),P=new Uint8Array(f.exports.memory.buffer);P.set(E,j);var F=h(A,w,T,j,E.length);if(F==0&&R&&R(A,_,T),y.set(P.subarray(A,A+w*T)),I(A-I(0)),F!=0)throw new Error("Malformed buffer data: "+F)}var l={NONE:"",OCTAHEDRAL:"meshopt_decodeFilterOct",QUATERNION:"meshopt_decodeFilterQuat",EXPONENTIAL:"meshopt_decodeFilterExp"},p={ATTRIBUTES:"meshopt_decodeVertexBuffer",TRIANGLES:"meshopt_decodeIndexBuffer",INDICES:"meshopt_decodeIndexSequence"},g=[],v=0;function x(f){var h={object:new Worker(f),pending:0,requests:{}};return h.object.onmessage=function(y){var w=y.data;h.pending-=w.count,h.requests[w.id][w.action](w.value),delete h.requests[w.id]},h}function u(f){for(var h="self.ready = WebAssembly.instantiate(new Uint8Array(["+new Uint8Array(r)+"]), {}).then(function(result) { result.instance.exports.__wasm_call_ctors(); return result.instance; });self.onmessage = "+m.name+";"+c.toString()+m.toString(),y=new Blob([h],{type:"text/javascript"}),w=URL.createObjectURL(y),T=g.length;T<f;++T)g[T]=x(w);for(var T=f;T<g.length;++T)g[T].object.postMessage({});g.length=f,URL.revokeObjectURL(w)}function d(f,h,y,w,T){for(var E=g[0],R=1;R<g.length;++R)g[R].pending<E.pending&&(E=g[R]);return new Promise(function(I,_){var A=new Uint8Array(y),j=++v;E.pending+=f,E.requests[j]={resolve:I,reject:_},E.object.postMessage({id:j,count:f,size:h,source:A,mode:w,filter:T},[A.buffer])})}function m(f){var h=f.data;if(!h.id)return self.close();self.ready.then(function(y){try{var w=new Uint8Array(h.count*h.size);c(y,y.exports[h.mode],w,h.count,h.size,h.source,y.exports[h.filter]),self.postMessage({id:h.id,count:h.count,action:"resolve",value:w},[w.buffer])}catch(T){self.postMessage({id:h.id,count:h.count,action:"reject",value:T})}})}return{ready:i,supported:!0,useWorkers:function(f){u(f)},decodeVertexBuffer:function(f,h,y,w,T){c(n,n.exports.meshopt_decodeVertexBuffer,f,h,y,w,n.exports[l[T]])},decodeIndexBuffer:function(f,h,y,w){c(n,n.exports.meshopt_decodeIndexBuffer,f,h,y,w)},decodeIndexSequence:function(f,h,y,w){c(n,n.exports.meshopt_decodeIndexSequence,f,h,y,w)},decodeGltfBuffer:function(f,h,y,w,T,E){c(n,n.exports[p[T]],f,h,y,w,n.exports[l[E]])},decodeGltfBufferAsync:function(f,h,y,w,T){return g.length>0?d(f,h,y,p[w],l[T]):i.then(function(){var E=new Uint8Array(f*h);return c(n,n.exports[p[w]],E,f,h,y,n.exports[l[T]]),E})}}})();var np=(function(){var e="b9H79Tebbbetm9Geueu9Geub9Gbb9Gsuuuuuuuuuuuu99uueu9Gvuuuuub9Gruuuuuuub9Gvuuuuue999Gvuuuuueu9Gquuuuuuu99uueu9Gwuuuuuu99ueu9Giuuue999Gluuuueu9GiuuueuiOHdilvorlwiDqkbxxbelve9Weiiviebeoweuec:G:Pdkr:Tewo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bbz9TW79O9V9Wt9F79P9T9W29P9M95br8E9TW79O9V9Wt9F79P9T9W29P9M959x9Pt9OcttV9P9I91tW7bwQ9TW79O9V9Wt9F79P9T9W29P9M959q9V9P9Ut7bDX9TW79O9V9Wt9F79P9T9W29P9M959t9J9H2Wbqa9TW79O9V9Wt9F9V9Wt9P9T9P96W9wWVtW94SWt9J9O9sW9T9H9Wbkl79IV9RbxDwebcekdzsq;B:xeHdbkM9Hi8Au8A99Au8Jjjjjbc;W;qb9Rgs8Kjjjjbcbhzascxfcbc;Kbz:ojjjb8AdnabaeSmbabaeadcdtz:njjjb8AkdndnamcdGmbascxfhHcbhOxekasalcrfci4gecbyd:m:jjjbHjjjjbbgABdxasceBd2aAcbaez:ojjjbhCcbhlcbhednadTmbcbhlabheadhAinaCaeydbgXci4fgQaQRbbgQceaXcrGgXtV86bbaQcu7aX4ceGalfhlaeclfheaAcufgAmbkcualcdtalcFFFFi0EhekascCfhHasaecbyd:m:jjjbHjjjjbbgOBdzascdBd2alcd4alfhXcehAinaAgecethAaeaX6mbkcdhzcbhLascuaecdtgAaecFFFFi0Ecbyd:m:jjjbHjjjjbbgXBdCasciBd2aXcFeaAz:ojjjbhKdnadTmbaecufhYcbh8AindndnaKabaLcdtfgEydbgQc:v;t;h;Ev2aYGgXcdtfgCydbgAcuSmbceheinaOaAcdtfydbaQSmdaXaefhAaecefheaKaAaYGgXcdtfgCydbgAcu9hmbkkaOa8AcdtfaQBdbaCa8ABdba8AhAa8Acefh8AkaEaABdbaLcefgLad9hmbkkaKcbyd1:jjjbH:bjjjbbascdBd2kcbh3aHcualcefgecdtaecFFFFi0Ecbyd:m:jjjbHjjjjbbg5Bdbasa5BdlasazceVgeBd2ascxfaecdtfcuadcitadcFFFFe0Ecbyd:m:jjjbHjjjjbbg8EBdbasa8EBdwasazcdfgeBd2asclfabadalcbz:cjjjbascxfaecdtfcualcdtgealcFFFFi0Eg8Fcbyd:m:jjjbHjjjjbbgABdbasazcifgXBd2ascxfaXcdtfa8Fcbyd:m:jjjbHjjjjbbgaBdbasazclVBd2aAaaaialavaOascxfz:djjjbalcbyd:m:jjjbHjjjjbbhCascxfasyd2ghcdtfaCBdbasahcefgXBd2ascxfaXcdtfa8Fcbyd:m:jjjbHjjjjbbgXBdbasahcdfgQBd2ascxfaQcdtfa8Fcbyd:m:jjjbHjjjjbbgQBdbasahcifggBd2aXcFeaez:ojjjbh8JaQcFeaez:ojjjbh8KdnalTmba8Ecwfh8Lindna5a3gQcefg3cdtfydbgKa5aQcdtgefydbgXSmbaKaX9Rhza8EaXcitfhHa8Kaefh8Ma8JaefhEcbhYindndnaHaYcitfydbg8AaQ9hmbaEaQBdba8MaQBdbxekdna5a8Acdtg8NfgeclfydbgXaeydbgeSmba8EaecitgKfydbaQSmeaXae9Rhyaecu7aXfhLa8LaKfhXcbheinaLaeSmeaecefheaXydbhKaXcwfhXaKaQ9hmbkaeay6meka8Ka8NfgeaQa8AaeydbcuSEBdbaEa8AaQaEydbcuSEBdbkaYcefgYaz9hmbkka3al9hmbkaAhXaahQa8KhKa8JhYcbheindndnaeaXydbg8A9hmbdnaeaQydbg8A9hmbaYydbh8AdnaKydbgLcu9hmba8Acu9hmbaCaefcb86bbxikaCaefhEdnaeaLSmbaea8ASmbaEce86bbxikaEcl86bbxdkdnaeaaa8AcdtgLfydb9hmbdnaKydbgEcuSmbaeaESmbaYydbgzcuSmbaeazSmba8KaLfydbgHcuSmbaHa8ASmba8JaLfydbgLcuSmbaLa8ASmbdnaAaEcdtfydbg8AaAaLcdtfydb9hmba8AaAazcdtfydbgLSmbaLaAaHcdtfydb9hmbaCaefcd86bbxlkaCaefcl86bbxikaCaefcl86bbxdkaCaefcl86bbxekaCaefaCa8AfRbb86bbkaXclfhXaQclfhQaKclfhKaYclfhYalaecefge9hmbkdnaqTmbdndnaOTmbaOheaAhXalhQindnaqaeydbfRbbTmbaCaXydbfcl86bbkaeclfheaXclfhXaQcufgQmbxdkkaAhealhXindnaqRbbTmbaCaeydbfcl86bbkaqcefhqaeclfheaXcufgXmbkkaAhealhQaChXindnaCaeydbfRbbcl9hmbaXcl86bbkaeclfheaXcefhXaQcufgQmbkkamceGTmbaChealhXindnaeRbbce9hmbaecl86bbkaecefheaXcufgXmbkkascxfagcdtfcualcx2alc;v:Q;v:Qe0Ecbyd:m:jjjbHjjjjbbg3BdbasahclfgHBd2a3aialavaOz:ejjjbh8PdndnaDmbcbhgcbh8Lxekcbh8LawhecbhXindnaeIdbJbbbb9ETmbasc;Wbfa8LcdtfaXBdba8Lcefh8LkaeclfheaDaXcefgX9hmbkascxfaHcdtfcua8Lal2gecdtaecFFFFi0Ecbyd:m:jjjbHjjjjbbggBdbasahcvfgHBd2alTmba8LTmbarcd4hEdnaOTmba8Lcdthzcbh8AaghLinaoaOa8AcdtfydbaE2cdtfhYasc;WbfheaLhXa8LhQinaXaYaeydbcdtgKfIdbawaKfIdbNUdbaeclfheaXclfhXaQcufgQmbkaLazfhLa8Acefg8Aal9hmbxdkka8Lcdthzcbh8AaghLinaoa8AaE2cdtfhYasc;WbfheaLhXa8LhQinaXaYaeydbcdtgKfIdbawaKfIdbNUdbaeclfheaXclfhXaQcufgQmbkaLazfhLa8Acefg8Aal9hmbkkascxfaHcdtfcualc8S2gealc;D;O;f8U0EgQcbyd:m:jjjbHjjjjbbgXBdbasaHcefgKBd2aXcbaez:ojjjbhqdndndna8LTmbascxfaKcdtfaQcbyd:m:jjjbHjjjjbbgvBdbasaHcdfgXBd2avcbaez:ojjjb8AascxfaXcdtfcua8Lal2gecltgXaecFFFFb0Ecbyd:m:jjjbHjjjjbbgiBdbasaHcifBd2aicbaXz:ojjjb8AadmexdkcbhvcbhiadTmekcbhYabhXindna3aXclfydbg8Acx2fgeIdba3aXydbgLcx2fgQIdbgI:tg8Ra3aXcwfydbgEcx2fgKIdlaQIdlg8S:tgRNaKIdbaI:tg8UaeIdla8S:tg8VN:tg8Wa8WNa8VaKIdwaQIdwg8X:tg8YNaRaeIdwa8X:tg8VN:tgRaRNa8Va8UNa8Ya8RN:tg8Ra8RNMM:rg8UJbbbb9ETmba8Wa8U:vh8Wa8Ra8U:vh8RaRa8U:vhRkaqaAaLcdtfydbc8S2fgeaRa8U:rg8UaRNNg8VaeIdbMUdbaea8Ra8Ua8RNg8ZNg8YaeIdlMUdlaea8Wa8Ua8WNg80Ng81aeIdwMUdwaea8ZaRNg8ZaeIdxMUdxaea80aRNgBaeIdzMUdzaea80a8RNg80aeIdCMUdCaeaRa8Ua8Wa8XNaRaINa8Sa8RNMM:mg8SNgINgRaeIdKMUdKaea8RaINg8RaeId3MUd3aea8WaINg8WaeIdaMUdaaeaIa8SNgIaeId8KMUd8Kaea8UaeIdyMUdyaqaAa8Acdtfydbc8S2fgea8VaeIdbMUdbaea8YaeIdlMUdlaea81aeIdwMUdwaea8ZaeIdxMUdxaeaBaeIdzMUdzaea80aeIdCMUdCaeaRaeIdKMUdKaea8RaeId3MUd3aea8WaeIdaMUdaaeaIaeId8KMUd8Kaea8UaeIdyMUdyaqaAaEcdtfydbc8S2fgea8VaeIdbMUdbaea8YaeIdlMUdlaea81aeIdwMUdwaea8ZaeIdxMUdxaeaBaeIdzMUdzaea80aeIdCMUdCaeaRaeIdKMUdKaea8RaeId3MUd3aea8WaeIdaMUdaaeaIaeId8KMUd8Kaea8UaeIdyMUdyaXcxfhXaYcifgYad6mbkcbhzabhLinabazcdtfh8AcbhXinaCa8AaXc;a1jjbfydbcdtfydbgQfRbbhedndnaCaLaXfydbgKfRbbgYc99fcFeGcpe0mbaec99fcFeGc;:e6mekdnaYcufcFeGce0mba8JaKcdtfydbaQ9hmekdnaecufcFeGce0mba8KaQcdtfydbaK9hmekdnaYcv2aefc:G1jjbfRbbTmbaAaQcdtfydbaAaKcdtfydb0mekJbbacJbbacJbbjZaecFeGceSEaYceSEh80dna3a8AaXc;e1jjbfydbcdtfydbcx2fgeIdwa3aKcx2fgYIdwg8S:tg8Wa3aQcx2fgEIdwa8S:tgRaRNaEIdbaYIdbg8X:tg8Ra8RNaEIdlaYIdlg8V:tg8Ua8UNMMgINa8WaRNaeIdba8X:tg81a8RNa8UaeIdla8V:tg8ZNMMg8YaRN:tg8Wa8WNa81aINa8Ya8RN:tgRaRNa8ZaINa8Ya8UN:tg8Ra8RNMM:rg8UJbbbb9ETmba8Wa8U:vh8Wa8Ra8U:vh8RaRa8U:vhRkaqaAaKcdtfydbc8S2fgeaRa80aI:rNg8UaRNNg8YaeIdbMUdbaea8Ra8Ua8RNg80Ng81aeIdlMUdlaea8Wa8Ua8WNgINg8ZaeIdwMUdwaea80aRNg80aeIdxMUdxaeaIaRNgBaeIdzMUdzaeaIa8RNg83aeIdCMUdCaeaRa8Ua8Wa8SNaRa8XNa8Va8RNMM:mg8SNgINgRaeIdKMUdKaea8RaINg8RaeId3MUd3aea8WaINg8WaeIdaMUdaaeaIa8SNgIaeId8KMUd8Kaea8UaeIdyMUdyaqaAaQcdtfydbc8S2fgea8YaeIdbMUdbaea81aeIdlMUdlaea8ZaeIdwMUdwaea80aeIdxMUdxaeaBaeIdzMUdzaea83aeIdCMUdCaeaRaeIdKMUdKaea8RaeId3MUd3aea8WaeIdaMUdaaeaIaeId8KMUd8Kaea8UaeIdyMUdykaXclfgXcx9hmbkaLcxfhLazcifgzad6mbka8LTmbcbhLinJbbbbh8Xa3abaLcdtfgeclfydbgEcx2fgXIdwa3aeydbgzcx2fgQIdwg8Z:tg8Ra8RNaXIdbaQIdbgB:tg8Wa8WNaXIdlaQIdlg83:tg8Ua8UNMMg80a3aecwfydbgHcx2fgeIdwa8Z:tgINa8Ra8RaINa8WaeIdbaB:tg8SNa8UaeIdla83:tg8VNMMgRN:tJbbbbJbbjZa80aIaINa8Sa8SNa8Va8VNMMg81NaRaRN:tg8Y:va8YJbbbb9BEg8YNhUa81a8RNaIaRN:ta8YNh85a80a8VNa8UaRN:ta8YNh86a81a8UNa8VaRN:ta8YNh87a80a8SNa8WaRN:ta8YNh88a81a8WNa8SaRN:ta8YNh89a8Wa8VNa8Sa8UN:tgRaRNa8UaINa8Va8RN:tgRaRNa8Ra8SNaIa8WN:tgRaRNMM:rJbbbZNhRagaza8L2gwcdtfhXagaHa8L2g8NcdtfhQagaEa8L2g5cdtfhKa8Z:mh8:a83:mhZaB:mhncbhYa8Lh8AJbbbbh8VJbbbbh8YJbbbbh80Jbbbbh81Jbbbbh8ZJbbbbhBJbbbbh83JbbbbhcJbbbbh9cinasc;WbfaYfgecwfaRa85aKIdbaXIdbgI:tg8UNaUaQIdbaI:tg8SNMg8RNUdbaeclfaRa87a8UNa86a8SNMg8WNUdbaeaRa89a8UNa88a8SNMg8UNUdbaecxfaRa8:a8RNaZa8WNaIana8UNMMMgINUdbaRa8Ra8WNNa81Mh81aRa8Ra8UNNa8ZMh8ZaRa8Wa8UNNaBMhBaRaIaINNa8XMh8XaRa8RaINNa8VMh8VaRa8WaINNa8YMh8YaRa8UaINNa80Mh80aRa8Ra8RNNa83Mh83aRa8Wa8WNNacMhcaRa8Ua8UNNa9cMh9caXclfhXaKclfhKaQclfhQaYczfhYa8Acufg8Ambkavazc8S2fgea9caeIdbMUdbaeacaeIdlMUdlaea83aeIdwMUdwaeaBaeIdxMUdxaea8ZaeIdzMUdzaea81aeIdCMUdCaea80aeIdKMUdKaea8YaeId3MUd3aea8VaeIdaMUdaaea8XaeId8KMUd8KaeaRaeIdyMUdyavaEc8S2fgea9caeIdbMUdbaeacaeIdlMUdlaea83aeIdwMUdwaeaBaeIdxMUdxaea8ZaeIdzMUdzaea81aeIdCMUdCaea80aeIdKMUdKaea8YaeId3MUd3aea8VaeIdaMUdaaea8XaeId8KMUd8KaeaRaeIdyMUdyavaHc8S2fgea9caeIdbMUdbaeacaeIdlMUdlaea83aeIdwMUdwaeaBaeIdxMUdxaea8ZaeIdzMUdzaea81aeIdCMUdCaea80aeIdKMUdKaea8YaeId3MUd3aea8VaeIdaMUdaaea8XaeId8KMUd8KaeaRaeIdyMUdyaiawcltfh8AcbhXa8LhKina8AaXfgeasc;WbfaXfgQIdbaeIdbMUdbaeclfgYaQclfIdbaYIdbMUdbaecwfgYaQcwfIdbaYIdbMUdbaecxfgeaQcxfIdbaeIdbMUdbaXczfhXaKcufgKmbkaia5cltfh8AcbhXa8LhKina8AaXfgeasc;WbfaXfgQIdbaeIdbMUdbaeclfgYaQclfIdbaYIdbMUdbaecwfgYaQcwfIdbaYIdbMUdbaecxfgeaQcxfIdbaeIdbMUdbaXczfhXaKcufgKmbkaia8Ncltfh8AcbhXa8LhKina8AaXfgeasc;WbfaXfgQIdbaeIdbMUdbaeclfgYaQclfIdbaYIdbMUdbaecwfgYaQcwfIdbaYIdbMUdbaecxfgeaQcxfIdbaeIdbMUdbaXczfhXaKcufgKmbkaLcifgLad6mbkkcbhQdndnamcwGgJmbJbbbbh8Vcbh9ecbhocbhhxekcbh9ea8Fcbyd:m:jjjbHjjjjbbhhascxfasyd2gecdtfahBdbasaecefgXBd2ascxfaXcdtfcuahalabadaAz:fjjjbgKcltaKcjjjjiGEcbyd:m:jjjbHjjjjbbgoBdbasaecdfBd2aoaKaha3alz:gjjjbJFFuuh8VaKTmbaoheaKhXinaeIdbgRa8Va8VaR9EEh8VaeclfheaXcufgXmbkaKh9ekasydlhTdnalTmbaTclfheaTydbhKaChXalhYcbhQincbaeydbg8AaK9RaXRbbcpeGEaQfhQaXcefhXaeclfhea8AhKaYcufgYmbkaQce4hQkcuadaQ9RcifgScx2aSc;v:Q;v:Qe0Ecbyd:m:jjjbHjjjjbbhDascxfasyd2g9hcdtfaDBdbasa9hcefgeBd2ascxfaecdtfcuaScdtaScFFFFi0Ecbyd:m:jjjbHjjjjbbgrBdbasa9hcdfgeBd2ascxfaecdtfa8Fcbyd:m:jjjbHjjjjbbgyBdbasa9hcifgeBd2ascxfaecdtfalcbyd:m:jjjbHjjjjbbg9iBdbasa9hclfg6Bd2axaxNa8PJbbjZamclGEgUaUN:vh9cJbbbbhcdnadak9nmbdnaSci6mba8Lclth9kaDcwfh0Jbbbbh83JbbbbhcinasclfabadalaAz:cjjjbabhzcbh8Ecbh8Finaba8FcdtfhHcbheindnaAazaefydbgQcdtgEfydbgYaAaHaec;q1jjbfydbcdtfydbgXcdtgwfydbg8ASmbaCaXfRbbgLcv2aCaQfRbbgKfc;G1jjbfRbbg5aKcv2aLfg8Nc;G1jjbfRbbg8MVcFeGTmbdna8AaY9nmba8Nc:G1jjbfRbbcFeGmekaKcufhYdnaKaL9hmbaYcFeGce0mba8JaEfydbaX9hmekdndnaKclSmbaLcl9hmekdnaYcFeGce0mba8JaEfydbaX9hmdkaLcufcFeGce0mba8KawfydbaQ9hmekaDa8Ecx2fgKaXaQa8McFeGgYEBdlaKaQaXaYEBdbaKaYa5Gcb9hBdwa8Ecefh8Ekaeclfgecx9hmbkdna8Fcifg8Fad9pmbazcxfhza8EcifaS9nmekka8ETmdcbhLinaqaAaDaLcx2fgKydbgYcdtgzfydbc8S2fgeIdwa3aKydlg8Acx2fgXIdwg8WNaeIdzaXIdbg8UNaeIdaMgRaRMMa8WNaeIdlaXIdlgINaeIdCa8WNaeId3MgRaRMMaINaeIdba8UNaeIdxaINaeIdKMgRaRMMa8UNaeId8KMMM:lhRJbbbbJbbjZaeIdyg8R:va8RJbbbb9BEh8RdndnaKydwgEmbJFFuuh8YxekJbbbbJbbjZaqaAa8Acdtfydbc8S2fgeIdyg8S:va8SJbbbb9BEaeIdwa3aYcx2fgXIdwg8SNaeIdzaXIdbg8XNaeIdaMg8Ya8YMMa8SNaeIdlaXIdlg8YNaeIdCa8SNaeId3Mg8Sa8SMMa8YNaeIdba8XNaeIdxa8YNaeIdKMg8Sa8SMMa8XNaeId8KMMM:lNh8Yka8RaRNh80dna8LTmbavaYc8S2fgQIdwa8WNaQIdza8UNaQIdaMgRaRMMa8WNaQIdlaINaQIdCa8WNaQId3MgRaRMMaINaQIdba8UNaQIdxaINaQIdKMgRaRMMa8UNaQId8KMMMhRaga8Aa8L2gHcdtfhXaiaYa8L2gwcltfheaQIdyh8Sa8LhQinaXIdbg8Ra8Ra8SNaecxfIdba8WaecwfIdbNa8UaeIdbNaIaeclfIdbNMMMg8Ra8RM:tNaRMhRaXclfhXaeczfheaQcufgQmbkdndnaEmbJbbbbh8Rxekava8Ac8S2fgQIdwa3aYcx2fgeIdwg8UNaQIdzaeIdbgINaQIdaMg8Ra8RMMa8UNaQIdlaeIdlg8SNaQIdCa8UNaQId3Mg8Ra8RMMa8SNaQIdbaINaQIdxa8SNaQIdKMg8Ra8RMMaINaQId8KMMMh8RagawcdtfhXaiaHcltfheaQIdyh8Xa8LhQinaXIdbg8Wa8Wa8XNaecxfIdba8UaecwfIdbNaIaeIdbNa8SaeclfIdbNMMMg8Wa8WM:tNa8RMh8RaXclfhXaeczfheaQcufgQmbka8R:lh8Rka80aR:lMh80a8Ya8RMh8YaCaYfRbbcd9hmbdna8Ka8Ja8Jazfydba8ASEaaazfydbgHcdtfydbgzcu9hmbaaa8AcdtfydbhzkavaHc8S2fgQIdwa3azcx2fgeIdwg8WNaQIdzaeIdbg8UNaQIdaMgRaRMMa8WNaQIdlaeIdlgINaQIdCa8WNaQId3MgRaRMMaINaQIdba8UNaQIdxaINaQIdKMgRaRMMa8UNaQId8KMMMhRagaza8L2gwcdtfhXaiaHa8L2g8NcltfheaQIdyh8Sa8LhQinaXIdbg8Ra8Ra8SNaecxfIdba8WaecwfIdbNa8UaeIdbNaIaeclfIdbNMMMg8Ra8RM:tNaRMhRaXclfhXaeczfheaQcufgQmbkdndnaEmbJbbbbh8Rxekavazc8S2fgQIdwa3aHcx2fgeIdwg8UNaQIdzaeIdbgINaQIdaMg8Ra8RMMa8UNaQIdlaeIdlg8SNaQIdCa8UNaQId3Mg8Ra8RMMa8SNaQIdbaINaQIdxa8SNaQIdKMg8Ra8RMMaINaQId8KMMMh8Raga8NcdtfhXaiawcltfheaQIdyh8Xa8LhQinaXIdbg8Wa8Wa8XNaecxfIdba8UaecwfIdbNaIaeIdbNa8SaeclfIdbNMMMg8Wa8WM:tNa8RMh8RaXclfhXaeczfheaQcufgQmbka8R:lh8Rka80aR:lMh80a8Ya8RMh8YkaKa80a8Ya80a8Y9FgeEUdwaKa8AaYaeaETVgeEBdlaKaYa8AaeEBdbaLcefgLa8E9hmbkasc;Wbfcbcj;qbz:ojjjb8Aa0hea8EhXinasc;WbfaeydbcA4cF8FGgQcFAaQcFA6EcdtfgQaQydbcefBdbaecxfheaXcufgXmbkcbhecbhXinasc;WbfaefgQydbhKaQaXBdbaKaXfhXaeclfgecj;qb9hmbkcbhea0hXinasc;WbfaXydbcA4cF8FGgQcFAaQcFA6EcdtfgQaQydbgQcefBdbaraQcdtfaeBdbaXcxfhXa8Eaecefge9hmbkadak9RgQci9Uh9mdnalTmbcbheayhXinaXaeBdbaXclfhXalaecefge9hmbkkcbh9na9icbalz:ojjjbh8FaQcO9Uh9oa9mce4h9pasydwh9qcbh8Mcbh5dninaDara5cdtfydbcx2fg8NIdwgRa9c9Emea8Ma9m9pmeJFFuuh8Rdna9pa8E9pmbaDara9pcdtfydbcx2fIdwJbb;aZNh8RkdnaRa8R9ETmbaRac9ETmba8Ma9o0mdkdna8FaAa8NydlgHcdtg9rfydbgKfg9sRbba8FaAa8Nydbgzcdtg9tfydbgefg9uRbbVmbaCazfRbbh9vdnaTaecdtfgXclfydbgQaXydbgXSmbaQaX9RhYa3aKcx2fhLa3aecx2fhEa9qaXcitfhecbhXcehwdnindnayaeydbcdtfydbgQaKSmbayaeclfydbcdtfydbg8AaKSmbaQa8ASmba3a8Acx2fg8AIdba3aQcx2fgQIdbg8W:tgRaEIdlaQIdlg8U:tg8XNaEIdba8W:tg8Ya8AIdla8U:tg8RN:tgIaRaLIdla8U:tg80NaLIdba8W:tg81a8RN:tg8UNa8RaEIdwaQIdwg8S:tg8ZNa8Xa8AIdwa8S:tg8WN:tg8Xa8RaLIdwa8S:tgBNa80a8WN:tg8RNa8Wa8YNa8ZaRN:tg8Sa8Wa81NaBaRN:tgRNMMaIaINa8Xa8XNa8Sa8SNMMa8Ua8UNa8Ra8RNaRaRNMMN:rJbbj8:N9FmdkaecwfheaXcefgXaY6hwaYaX9hmbkkawceGTmba9pcefh9pxekdndndndna9vc9:fPdebdkazheinayaecdtgefaHBdbaaaefydbgeaz9hmbxikkdna8Ka8Ja8Ja9tfydbaHSEaaa9tfydbgzcdtfydbgecu9hmbaaa9rfydbhekaya9tfaHBdbaehHkayazcdtfaHBdbka9uce86bba9sce86bba8NIdwgRacacaR9DEhca9ncefh9ncecda9vceSEa8Mfh8Mka5cefg5a8E9hmbkka9nTmddnalTmbcbh8AcbhEindnayaEcdtgefydbgQaESmbaAaQcdtfydbhzdnaEaAaefydb9hgHmbaqazc8S2fgeaqaEc8S2fgXIdbaeIdbMUdbaeaXIdlaeIdlMUdlaeaXIdwaeIdwMUdwaeaXIdxaeIdxMUdxaeaXIdzaeIdzMUdzaeaXIdCaeIdCMUdCaeaXIdKaeIdKMUdKaeaXId3aeId3MUd3aeaXIdaaeIdaMUdaaeaXId8KaeId8KMUd8KaeaXIdyaeIdyMUdyka8LTmbavaQc8S2fgeavaEc8S2gwfgXIdbaeIdbMUdbaeaXIdlaeIdlMUdlaeaXIdwaeIdwMUdwaeaXIdxaeIdxMUdxaeaXIdzaeIdzMUdzaeaXIdCaeIdCMUdCaeaXIdKaeIdKMUdKaeaXId3aeId3MUd3aeaXIdaaeIdaMUdaaeaXId8KaeId8KMUd8KaeaXIdyaeIdyMUdya9kaQ2hLaihXa8LhKinaXaLfgeaXa8AfgQIdbaeIdbMUdbaeclfgYaQclfIdbaYIdbMUdbaecwfgYaQcwfIdbaYIdbMUdbaecxfgeaQcxfIdbaeIdbMUdbaXczfhXaKcufgKmbkaHmbJbbbbJbbjZaqawfgeIdygR:vaRJbbbb9BEaeIdwa3azcx2fgXIdwgRNaeIdzaXIdbg8RNaeIdaMg8Wa8WMMaRNaeIdlaXIdlg8WNaeIdCaRNaeId3MgRaRMMa8WNaeIdba8RNaeIdxa8WNaeIdKMgRaRMMa8RNaeId8KMMM:lNgRa83a83aR9DEh83ka8Aa9kfh8AaEcefgEal9hmbkcbhXa8JheindnaeydbgQcuSmbdnaXayaQcdtgKfydbgQ9hmbcuhQa8JaKfydbgKcuSmbayaKcdtfydbhQkaeaQBdbkaeclfhealaXcefgX9hmbkcbhXa8KheindnaeydbgQcuSmbdnaXayaQcdtgKfydbgQ9hmbcuhQa8KaKfydbgKcuSmbayaKcdtfydbhQkaeaQBdbkaeclfhealaXcefgX9hmbkka83aca8LEh83cbhKabhecbhYindnayaeydbcdtfydbgXayaeclfydbcdtfydbgQSmbaXayaecwfydbcdtfydbg8ASmbaQa8ASmbabaKcdtfgLaXBdbaLcwfa8ABdbaLclfaQBdbaKcifhKkaecxfheaYcifgYad6mbkdndnaJTmbaKak9nmba8Va839FTmbcbhdabhecbhXindnaoahaeydbgQcdtfydbcdtfIdba839ETmbabadcdtfgYaQBdbaYclfaeclfydbBdbaYcwfaecwfydbBdbadcifhdkaecxfheaXcifgXaK6mbkJFFuuh8Va9eTmeaohea9ehXJFFuuhRinaeIdbg8RaRaRa8R9EEg8WaRa8Ra839EgQEhRa8Wa8VaQEh8VaeclfheaXcufgXmbxdkkaKhdkadak0mbxdkkasclfabadalaAz:cjjjbkdndnadak0mbadhXxekdnaJmbadhXxekdna8Va9c9FmbadhXxekina8VJbb;aZNgRa9caRa9c9DEh8WJbbbbhRdna9eTmbaohea9ehAinaeIdbg8RaRa8Ra8W9FEaRa8RaR9EEhRaeclfheaAcufgAmbkkcbhXabhecbhAindnaoahaeydbgQcdtfydbcdtfIdba8W9ETmbabaXcdtfgKaQBdbaKclfaeclfydbBdbaKcwfaecwfydbBdbaXcifhXkaecxfheaAcifgAad6mbkJFFuuh8Vdna9eTmbaohea9ehAJFFuuh8RinaeIdbg8Ua8Ra8Ra8U9EEgIa8Ra8Ua8W9EgQEh8RaIa8VaQEh8VaeclfheaAcufgAmbkkdnaXad9hmbadhXxdkaRacacaR9DEhcaXak9nmeaXhda8Va9c9FmbkkdnamcjjjjlGTmbaOmbaXTmbcbh8AabheinaCaeydbgKfRbbc3thLaecwfgEydbhAdndna8JaKcdtgHfydbaeclfgzydbgQSmbcbhYa8KaQcdtfydbaK9hmekcjjjj94hYkaeaLaYVaKVBdbaCaQfRbbc3thLdndna8JaQcdtfydbaASmbcbhYa8KaAcdtfydbaQ9hmekcjjjj94hYkazaLaYVaQVBdbaCaAfRbbc3thYdndna8JaAcdtfydbaKSmbcbhQa8KaHfydbaA9hmekcjjjj94hQkaEaYaQVaAVBdbaecxfhea8Acifg8AaX6mbkkdnaOTmbaXTmbaXheinabaOabydbcdtfydbBdbabclfhbaecufgembkkdnaPTmbaPaUac:rNUdbka9hcdtascxffcxfhednina6Tmeaeydbcbyd1:jjjbH:bjjjbbaec98fhea6cufh6xbkkasc;W;qbf8KjjjjbaXk;Yieouabydlhvabydbclfcbaicdtz:ojjjbhoadci9UhrdnadTmbdnalTmbaehwadhDinaoalawydbcdtfydbcdtfgqaqydbcefBdbawclfhwaDcufgDmbxdkkaehwadhDinaoawydbcdtfgqaqydbcefBdbawclfhwaDcufgDmbkkdnaiTmbcbhDaohwinawydbhqawaDBdbawclfhwaqaDfhDaicufgimbkkdnadci6mbinaecwfydbhwaeclfydbhDaeydbhidnalTmbalawcdtfydbhwalaDcdtfydbhDalaicdtfydbhikavaoaicdtfgqydbcitfaDBdbavaqydbcitfawBdlaqaqydbcefBdbavaoaDcdtfgqydbcitfawBdbavaqydbcitfaiBdlaqaqydbcefBdbavaoawcdtfgwydbcitfaiBdbavawydbcitfaDBdlawawydbcefBdbaecxfhearcufgrmbkkabydbcbBdbk:todDue99aicd4aifhrcehwinawgDcethwaDar6mbkcuaDcdtgraDcFFFFi0Ecbyd:m:jjjbHjjjjbbhwaoaoyd9GgqcefBd9GaoaqcdtfawBdbawcFearz:ojjjbhkdnaiTmbalcd4hlaDcufhxcbhminamhDdnavTmbavamcdtfydbhDkcbadaDal2cdtfgDydlgwawcjjjj94SEgwcH4aw7c:F:b:DD2cbaDydbgwawcjjjj94SEgwcH4aw7c;D;O:B8J27cbaDydwgDaDcjjjj94SEgDcH4aD7c:3F;N8N27axGhwamcdthPdndndnavTmbakawcdtfgrydbgDcuSmeadavaPfydbal2cdtfgsIdbhzcehqinaqhrdnadavaDcdtfydbal2cdtfgqIdbaz9CmbaqIdlasIdl9CmbaqIdwasIdw9BmlkarcefhqakawarfaxGgwcdtfgrydbgDcu9hmbxdkkakawcdtfgrydbgDcuSmbadamal2cdtfgsIdbhzcehqinaqhrdnadaDal2cdtfgqIdbaz9CmbaqIdlasIdl9CmbaqIdwasIdw9BmikarcefhqakawarfaxGgwcdtfgrydbgDcu9hmbkkaramBdbamhDkabaPfaDBdbamcefgmai9hmbkkakcbyd1:jjjbH:bjjjbbaoaoyd9GcufBd9GdnaeTmbaiTmbcbhDaehwinawaDBdbawclfhwaiaDcefgD9hmbkcbhDaehwindnaDabydbgrSmbawaearcdtfgrydbBdbaraDBdbkawclfhwabclfhbaiaDcefgD9hmbkkk;Qodvuv998Jjjjjbca9Rgvczfcwfcbyd11jjbBdbavcb8Pdj1jjb83izavcwfcbydN1jjbBdbavcb8Pd:m1jjb83ibdnadTmbaicd4hodnabmbdnalTmbcbhrinaealarcdtfydbao2cdtfhwcbhiinavczfaifgDawaifIdbgqaDIdbgkakaq9EEUdbavaifgDaqaDIdbgkakaq9DEUdbaiclfgicx9hmbkarcefgrad9hmbxikkaocdthrcbhwincbhiinavczfaifgDaeaifIdbgqaDIdbgkakaq9EEUdbavaifgDaqaDIdbgkakaq9DEUdbaiclfgicx9hmbkaearfheawcefgwad9hmbxdkkdnalTmbcbhrinabarcx2fgiaealarcdtfydbao2cdtfgwIdbUdbaiawIdlUdlaiawIdwUdwcbhiinavczfaifgDawaifIdbgqaDIdbgkakaq9EEUdbavaifgDaqaDIdbgkakaq9DEUdbaiclfgicx9hmbkarcefgrad9hmbxdkkaocdthlcbhraehwinabarcx2fgiaearao2cdtfgDIdbUdbaiaDIdlUdlaiaDIdwUdwcbhiinavczfaifgDawaifIdbgqaDIdbgkakaq9EEUdbavaifgDaqaDIdbgkakaq9DEUdbaiclfgicx9hmbkawalfhwarcefgrad9hmbkkJbbbbavIdbavIdzgk:tgqaqJbbbb9DEgqavIdlavIdCgx:tgmamaq9DEgqavIdwavIdKgm:tgPaPaq9DEhPdnabTmbadTmbJbbbbJbbjZaP:vaPJbbbb9BEhqinabaqabIdbak:tNUdbabclfgvaqavIdbax:tNUdbabcwfgvaqavIdbam:tNUdbabcxfhbadcufgdmbkkaPk:ZlewudnaeTmbcbhvabhoinaoavBdbaoclfhoaeavcefgv9hmbkkdnaiTmbcbhrinadarcdtfhwcbhDinalawaDcdtgvc;a1jjbfydbcdtfydbcdtfydbhodnabalawavfydbcdtfydbgqcdtfgkydbgvaqSmbinakabavgqcdtfgxydbgvBdbaxhkaqav9hmbkkdnabaocdtfgkydbgvaoSmbinakabavgocdtfgxydbgvBdbaxhkaoav9hmbkkdnaqaoSmbabaqaoaqao0Ecdtfaqaoaqao6EBdbkaDcefgDci9hmbkarcifgrai6mbkkdnaembcbskcbhxindnalaxcdtgvfydbax9hmbaxhodnabavfgDydbgvaxSmbaDhqinaqabavgocdtfgkydbgvBdbakhqaoav9hmbkkaDaoBdbkaxcefgxae9hmbkcbhvabhocbhkindndnavalydbgq9hmbdnavaoydbgq9hmbaoakBdbakcefhkxdkaoabaqcdtfydbBdbxekaoabaqcdtfydbBdbkaoclfhoalclfhlaeavcefgv9hmbkakk;Jiilud99duabcbaecltz:ojjjbhvdnalTmbadhoaihralhwinarcwfIdbhDarclfIdbhqavaoydbcltfgkarIdbakIdbMUdbakclfgxaqaxIdbMUdbakcwfgxaDaxIdbMUdbakcxfgkakIdbJbbjZMUdbaoclfhoarcxfhrawcufgwmbkkdnaeTmbavhraehkinarcxfgoIdbhDaocbBdbararIdbJbbbbJbbjZaD:vaDJbbbb9BEgDNUdbarclfgoaDaoIdbNUdbarcwfgoaDaoIdbNUdbarczfhrakcufgkmbkkdnalTmbinavadydbcltfgrcxfgkaicwfIdbarcwfIdb:tgDaDNaiIdbarIdb:tgDaDNaiclfIdbarclfIdb:tgDaDNMMgDakIdbgqaqaD9DEUdbadclfhdaicxfhialcufglmbkkdnaeTmbavcxfhrinabarIdbUdbarczfhrabclfhbaecufgembkkk8MbabaeadaialavcbcbcbcbcbaoarawaDz:bjjjbk8MbabaeadaialavaoarawaDaqakaxamaPz:bjjjbk:DCoDud99rue99iul998Jjjjjbc;Wb9Rgw8KjjjjbdndnarmbcbhDxekawcxfcbc;Kbz:ojjjb8Aawcuadcx2adc;v:Q;v:Qe0Ecbyd:m:jjjbHjjjjbbgqBdxawceBd2aqaeadaicbz:ejjjb8AawcuadcdtadcFFFFi0Egkcbyd:m:jjjbHjjjjbbgxBdzawcdBd2adcd4adfhmceheinaegicetheaiam6mbkcbhPawcuaicdtgsaicFFFFi0Ecbyd:m:jjjbHjjjjbbgzBdCawciBd2dndnar:ZgH:rJbbbZMgO:lJbbb9p9DTmbaO:Ohexekcjjjj94hekaicufhAc:bwhmcbhCadhXcbhQinaChLaeamgKcufaeaK9iEaPgDcefaeaD9kEhYdndnadTmbaYcuf:YhOaqhiaxheadhmindndnaiIdbaONJbbbZMg8A:lJbbb9p9DTmba8A:OhCxekcjjjj94hCkaCcCthCdndnaiclfIdbaONJbbbZMg8A:lJbbb9p9DTmba8A:OhExekcjjjj94hEkaEcqtaCVhCdndnaicwfIdbaONJbbbZMg8A:lJbbb9p9DTmba8A:OhExekcjjjj94hEkaeaCaEVBdbaicxfhiaeclfheamcufgmmbkazcFeasz:ojjjbh3cbh5cbhPindna3axaPcdtfydbgCcm4aC7c:v;t;h;Ev2gics4ai7aAGgmcdtfgEydbgecuSmbaeaCSmbcehiina3amaifaAGgmcdtfgEydbgecuSmeaicefhiaeaC9hmbkkaEaCBdba5aecuSfh5aPcefgPad9hmbxdkkazcFeasz:ojjjb8Acbh5kaDaYa5ar0giEhPaLa5aiEhCdna5arSmbaYaKaiEgmaP9Rcd9imbdndnaQcl0mbdnaX:ZgOaL:Zg8A:taY:Yg8EaD:Y:tg8Fa8EaK:Y:tgaa5:ZghaH:tNNNaOaH:taaNa8Aah:tNa8AaH:ta8FNahaO:tNM:va8EMJbbbZMgO:lJbbb9p9DTmbaO:Ohexdkcjjjj94hexekaPamfcd9Theka5aXaiEhXaQcefgQcs9hmekkdndnaCmbcihicbhDxekcbhiawakcbyd:m:jjjbHjjjjbbg5BdKawclBd2aPcuf:Yh8AdndnadTmbaqhiaxheadhmindndnaiIdba8ANJbbbZMgO:lJbbb9p9DTmbaO:OhCxekcjjjj94hCkaCcCthCdndnaiclfIdba8ANJbbbZMgO:lJbbb9p9DTmbaO:OhExekcjjjj94hEkaEcqtaCVhCdndnaicwfIdba8ANJbbbZMgO:lJbbb9p9DTmbaO:OhExekcjjjj94hEkaeaCaEVBdbaicxfhiaeclfheamcufgmmbkazcFeasz:ojjjbh3cbhDcbhYindndndna3axaYcdtgKfydbgCcm4aC7c:v;t;h;Ev2gics4ai7aAGgmcdtfgEydbgecuSmbcehiinaxaecdtgefydbaCSmdamaifheaicefhia3aeaAGgmcdtfgEydbgecu9hmbkkaEaYBdbaDhiaDcefhDxeka5aefydbhika5aKfaiBdbaYcefgYad9hmbkcuaDc32giaDc;j:KM;jb0EhexekazcFeasz:ojjjb8AcbhDcbhekawaecbyd:m:jjjbHjjjjbbgeBd3awcvBd2aecbaiz:ojjjbhEavcd4hKdnadTmbdnalTmbaKcdth3a5hCaqhealhmadhAinaEaCydbc32fgiaeIdbaiIdbMUdbaiaeclfIdbaiIdlMUdlaiaecwfIdbaiIdwMUdwaiamIdbaiIdxMUdxaiamclfIdbaiIdzMUdzaiamcwfIdbaiIdCMUdCaiaiIdKJbbjZMUdKaCclfhCaecxfheama3fhmaAcufgAmbxdkka5hmaqheadhCinaEamydbc32fgiaeIdbaiIdbMUdbaiaeclfIdbaiIdlMUdlaiaecwfIdbaiIdwMUdwaiaiIdxJbbbbMUdxaiaiIdzJbbbbMUdzaiaiIdCJbbbbMUdCaiaiIdKJbbjZMUdKamclfhmaecxfheaCcufgCmbkkdnaDTmbaEhiaDheinaiaiIdbJbbbbJbbjZaicKfIdbgO:vaOJbbbb9BEgONUdbaiclfgmaOamIdbNUdbaicwfgmaOamIdbNUdbaicxfgmaOamIdbNUdbaiczfgmaOamIdbNUdbaicCfgmaOamIdbNUdbaic3fhiaecufgembkkcbhCawcuaDcdtgYaDcFFFFi0Egicbyd:m:jjjbHjjjjbbgeBdaawcoBd2awaicbyd:m:jjjbHjjjjbbg3Bd8KaecFeaYz:ojjjbhxdnadTmbJbbjZJbbjZa8A:vaPceSEaoNgOaONh8AaKcdthPalheina8Aaec;81jjbalEgmIdwaEa5ydbgAc32fgiIdC:tgOaONamIdbaiIdx:tgOaONamIdlaiIdz:tgOaONMMNaqcwfIdbaiIdw:tgOaONaqIdbaiIdb:tgOaONaqclfIdbaiIdl:tgOaONMMMhOdndnaxaAcdtgifgmydbcuSmba3aifIdbaO9ETmekamaCBdba3aifaOUdbka5clfh5aqcxfhqaeaPfheadaCcefgC9hmbkkabaxaYz:njjjb8AcrhikaicdthiinaiTmeaic98fgiawcxffydbcbyd1:jjjbH:bjjjbbxbkkawc;Wbf8KjjjjbaDk:Ydidui99ducbhi8Jjjjjbca9Rglczfcwfcbyd11jjbBdbalcb8Pdj1jjb83izalcwfcbydN1jjbBdbalcb8Pd:m1jjb83ibdndnaembJbbjFhvJbbjFhoJbbjFhrxekadcd4cdthwincbhdinalczfadfgDabadfIdbgvaDIdbgoaoav9EEUdbaladfgDavaDIdbgoaoav9DEUdbadclfgdcx9hmbkabawfhbaicefgiae9hmbkalIdwalIdK:thralIdlalIdC:thoalIdbalIdz:thvkJbbbbavavJbbbb9DEgvaoaoav9DEgvararav9DEk9DeeuabcFeaicdtz:ojjjbhlcbhbdnadTmbindnalaeydbcdtfgiydbcu9hmbaiabBdbabcefhbkaeclfheadcufgdmbkkabk9teiucbcbyd:q:jjjbgeabcifc98GfgbBd:q:jjjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik;teeeudndnaeabVciGTmbabhixekdndnadcz9pmbabhixekabhiinaiaeydbBdbaiaeydlBdlaiaeydwBdwaiaeydxBdxaeczfheaiczfhiadc9Wfgdcs0mbkkadcl6mbinaiaeydbBdbaeclfheaiclfhiadc98fgdci0mbkkdnadTmbinaiaeRbb86bbaicefhiaecefheadcufgdmbkkabk:3eedudndnabciGTmbabhixekaecFeGc:b:c:ew2hldndnadcz9pmbabhixekabhiinaialBdxaialBdwaialBdlaialBdbaiczfhiadc9Wfgdcs0mbkkadcl6mbinaialBdbaiclfhiadc98fgdci0mbkkdnadTmbinaiae86bbaicefhiadcufgdmbkkabk9teiucbcbyd:q:jjjbgeabcrfc94GfgbBd:q:jjjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik9:eiuZbhedndncbyd:q:jjjbgdaecztgi9nmbcuheadai9RcFFifcz4nbcuSmekadhekcbabae9Rcifc98Gcbyd:q:jjjbfgdBd:q:jjjbdnadZbcztge9nmbadae9RcFFifcz4nb8Akkk:Iedbcjwk1eFFuuFFuuFFuuFFuFFFuFFFuFbbbbbbbbeeebeebebbeeebebbbbbebebbbbbbbbbebbbdbbbbbbbebbbebbbdbbbbbbbbbbbeeeeebebbebbebebbbeebbbbbbbbbbbbbbbbbbbbbc1Dkxebbbdbbb:GNbb",t=new Uint8Array([32,0,65,2,1,106,34,33,3,128,11,4,13,64,6,253,10,7,15,116,127,5,8,12,40,16,19,54,20,9,27,255,113,17,42,67,24,23,146,148,18,14,22,45,70,69,56,114,101,21,25,63,75,136,108,28,118,29,73,115]);if(typeof WebAssembly!="object")return{supported:!1};var a,s=WebAssembly.instantiate(r(e),{}).then(function(u){a=u.instance,a.exports.__wasm_call_ctors()});function r(u){for(var d=new Uint8Array(u.length),m=0;m<u.length;++m){var f=u.charCodeAt(m);d[m]=f>96?f-97:f>64?f-39:f+4}for(var h=0,m=0;m<u.length;++m)d[h++]=d[m]<60?t[d[m]]:(d[m]-60)*64+d[++m];return d.buffer.slice(0,h)}function n(u){if(!u)throw new Error("Assertion failed")}function i(u){return new Uint8Array(u.buffer,u.byteOffset,u.byteLength)}function o(u,d,m){var f=a.exports.sbrk,h=f(d.length*4),y=f(m*4),w=new Uint8Array(a.exports.memory.buffer),T=i(d);w.set(T,h);var E=u(y,h,d.length,m);w=new Uint8Array(a.exports.memory.buffer);var R=new Uint32Array(m);new Uint8Array(R.buffer).set(w.subarray(y,y+m*4)),T.set(w.subarray(h,h+d.length*4)),f(h-f(0));for(var I=0;I<d.length;++I)d[I]=R[d[I]];return[R,E]}function c(u){for(var d=0,m=0;m<u.length;++m){var f=u[m];d=d<f?f:d}return d}function l(u,d,m,f,h,y,w,T,E){var R=a.exports.sbrk,I=R(4),_=R(m*4),A=R(h*y),j=R(m*4),P=new Uint8Array(a.exports.memory.buffer);P.set(i(f),A),P.set(i(d),j);var F=u(_,j,m,A,h,y,w,T,E,I);P=new Uint8Array(a.exports.memory.buffer);var C=new Uint32Array(F);i(C).set(P.subarray(_,_+F*4));var H=new Float32Array(1);return i(H).set(P.subarray(I,I+4)),R(I-R(0)),[C,H[0]]}function p(u,d,m,f,h,y,w,T,E,R,I,_,A){var j=a.exports.sbrk,P=j(4),F=j(m*4),C=j(h*y),H=j(h*T),se=j(E.length*4),ie=j(m*4),Ue=R?j(h):0,k=new Uint8Array(a.exports.memory.buffer);k.set(i(f),C),k.set(i(w),H),k.set(i(E),se),k.set(i(d),ie),R&&k.set(i(R),Ue);var B=u(F,ie,m,C,h,y,H,T,se,E.length,Ue,I,_,A,P);k=new Uint8Array(a.exports.memory.buffer);var U=new Uint32Array(B);i(U).set(k.subarray(F,F+B*4));var q=new Float32Array(1);return i(q).set(k.subarray(P,P+4)),j(P-j(0)),[U,q[0]]}function g(u,d,m,f){var h=a.exports.sbrk,y=h(m*f),w=new Uint8Array(a.exports.memory.buffer);w.set(i(d),y);var T=u(y,m,f);return h(y-h(0)),T}function v(u,d,m,f,h,y,w,T){var E=a.exports.sbrk,R=E(T*4),I=E(m*f),_=E(m*y),A=new Uint8Array(a.exports.memory.buffer);A.set(i(d),I),h&&A.set(i(h),_);var j=u(R,I,m,f,_,y,w,T);A=new Uint8Array(a.exports.memory.buffer);var P=new Uint32Array(j);return i(P).set(A.subarray(R,R+j*4)),E(R-E(0)),P}var x={LockBorder:1,Sparse:2,ErrorAbsolute:4,Prune:8,_InternalDebug:1<<30};return{ready:s,supported:!0,compactMesh:function(u){n(u instanceof Uint32Array||u instanceof Int32Array||u instanceof Uint16Array||u instanceof Int16Array),n(u.length%3==0);var d=u.BYTES_PER_ELEMENT==4?u:new Uint32Array(u);return o(a.exports.meshopt_optimizeVertexFetchRemap,d,c(u)+1)},simplify:function(u,d,m,f,h,y){n(u instanceof Uint32Array||u instanceof Int32Array||u instanceof Uint16Array||u instanceof Int16Array),n(u.length%3==0),n(d instanceof Float32Array),n(d.length%m==0),n(m>=3),n(f>=0&&f<=u.length),n(f%3==0),n(h>=0);for(var w=0,T=0;T<(y?y.length:0);++T)n(y[T]in x),w|=x[y[T]];var E=u.BYTES_PER_ELEMENT==4?u:new Uint32Array(u),R=l(a.exports.meshopt_simplify,E,u.length,d,d.length/m,m*4,f,h,w);return R[0]=u instanceof Uint32Array?R[0]:new u.constructor(R[0]),R},simplifyWithAttributes:function(u,d,m,f,h,y,w,T,E,R){n(u instanceof Uint32Array||u instanceof Int32Array||u instanceof Uint16Array||u instanceof Int16Array),n(u.length%3==0),n(d instanceof Float32Array),n(d.length%m==0),n(m>=3),n(f instanceof Float32Array),n(f.length%h==0),n(h>=0),n(w==null||w instanceof Uint8Array),n(w==null||w.length==d.length/m),n(T>=0&&T<=u.length),n(T%3==0),n(E>=0),n(Array.isArray(y)),n(h>=y.length),n(y.length<=32);for(var I=0;I<y.length;++I)n(y[I]>=0);for(var _=0,I=0;I<(R?R.length:0);++I)n(R[I]in x),_|=x[R[I]];var A=u.BYTES_PER_ELEMENT==4?u:new Uint32Array(u),j=p(a.exports.meshopt_simplifyWithAttributes,A,u.length,d,d.length/m,m*4,f,h*4,new Float32Array(y),w?new Uint8Array(w):null,T,E,_);return j[0]=u instanceof Uint32Array?j[0]:new u.constructor(j[0]),j},getScale:function(u,d){return n(u instanceof Float32Array),n(u.length%d==0),n(d>=3),g(a.exports.meshopt_simplifyScale,u,u.length/d,d*4)},simplifyPoints:function(u,d,m,f,h,y){return n(u instanceof Float32Array),n(u.length%d==0),n(d>=3),n(m>=0&&m<=u.length/d),f?(n(f instanceof Float32Array),n(f.length%h==0),n(h>=3),n(u.length/d==f.length/h),v(a.exports.meshopt_simplifyPoints,u,u.length/d,d*4,f,h*4,y,m)):v(a.exports.meshopt_simplifyPoints,u,u.length/d,d*4,void 0,0,0,m)}}})();var op=(function(){var e="b9H79TebbbeVx9Geueu9Geub9Gbb9Giuuueu9Gmuuuuuuuuuuu9999eu9Gvuuuuueu9Gwuuuuuuuub9Gxuuuuuuuuuuuueu9Gkuuuuuuuuuu99eu9Gouuuuuub9Gruuuuuuub9GluuuubiOHdilvorwDqqkbiibeilve9Weiiviebeoweuec;G:Odkr:Yewo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bb8A9TW79O9V9Wt9F9I919P29K9nW79O2Wt79c9V919U9KbeX9TW79O9V9Wt9F9I919P29K9nW79O2Wt7bo39TW79O9V9Wt9F9J9V9T9W91tWJ2917tWV9c9V919U9K7br39TW79O9V9Wt9F9J9V9T9W91tW9nW79O2Wt9c9V919U9K7bDL9TW79O9V9Wt9F9V9Wt9P9T9P96W9nW79O2Wtbql79IV9RbkDwebcekdsPq;Q9BHdbkIbabaec9:fgefcufae9Ugeabci9Uadfcufad9Ugbaeab0Ek:w8KDPue99eux99dui99euo99iu8Jjjjjbc:WD9Rgm8KjjjjbdndnalmbcbhPxekamc:Cwfcbc;Kbz:njjjb8Adndnalcb9imbaoal9nmbamcuaocdtaocFFFFi0Egscbyd;y1jjbHjjjjbbgzBd:CwamceBd;8wamascbyd;y1jjbHjjjjbbgHBd:GwamcdBd;8wamcualcdtalcFFFFi0Ecbyd;y1jjbHjjjjbbgOBd:KwamciBd;8waihsalhAinazasydbcdtfcbBdbasclfhsaAcufgAmbkaihsalhAinazasydbcdtfgCaCydbcefBdbasclfhsaAcufgAmbkaihsalhCcbhXindnazasydbcdtgQfgAydbcb9imbaHaQfaXBdbaAaAydbgQcjjjj94VBdbaQaXfhXkasclfhsaCcufgCmbkalci9UhLdnalci6mbcbhsaihAinaAcwfydbhCaAclfydbhXaHaAydbcdtfgQaQydbgQcefBdbaOaQcdtfasBdbaHaXcdtfgXaXydbgXcefBdbaOaXcdtfasBdbaHaCcdtfgCaCydbgCcefBdbaOaCcdtfasBdbaAcxfhAaLascefgs9hmbkkaihsalhAindnazasydbcdtgCfgXydbgQcu9kmbaXaQcFFFFrGgQBdbaHaCfgCaCydbaQ9RBdbkasclfhsaAcufgAmbxdkkamcuaocdtgsaocFFFFi0EgAcbyd;y1jjbHjjjjbbgzBd:CwamceBd;8wamaAcbyd;y1jjbHjjjjbbgHBd:GwamcdBd;8wamcualcdtalcFFFFi0Ecbyd;y1jjbHjjjjbbgOBd:KwamciBd;8wazcbasz:njjjbhXalci9UhLaihsalhAinaXasydbcdtfgCaCydbcefBdbasclfhsaAcufgAmbkdnaoTmbcbhsaHhAaXhCaohQinaAasBdbaAclfhAaCydbasfhsaCclfhCaQcufgQmbkkdnalci6mbcbhsaihAinaAcwfydbhCaAclfydbhQaHaAydbcdtfgKaKydbgKcefBdbaOaKcdtfasBdbaHaQcdtfgQaQydbgQcefBdbaOaQcdtfasBdbaHaCcdtfgCaCydbgCcefBdbaOaCcdtfasBdbaAcxfhAaLascefgs9hmbkkaoTmbcbhsaohAinaHasfgCaCydbaXasfydb9RBdbasclfhsaAcufgAmbkkamaLcbyd;y1jjbHjjjjbbgsBd:OwamclBd;8wascbaLz:njjjbhYamcuaLcK2alcjjjjd0Ecbyd;y1jjbHjjjjbbg8ABd:SwamcvBd;8wJbbbbhEdnalci6g3mbarcd4hKaihAa8AhsaLhrJbbbbh5inavaAclfydbaK2cdtfgCIdlh8EavaAydbaK2cdtfgXIdlhEavaAcwfydbaK2cdtfgQIdlh8FaCIdwhaaXIdwhhaQIdwhgasaCIdbg8JaXIdbg8KMaQIdbg8LMJbbnn:vUdbasclfaXIdlaCIdlMaQIdlMJbbnn:vUdbaQIdwh8MaCIdwh8NaXIdwhyascxfa8EaE:tg8Eagah:tggNa8FaE:tg8Faaah:tgaN:tgEJbbbbJbbjZa8Ja8K:tg8Ja8FNa8La8K:tg8Ka8EN:tghahNaEaENaaa8KNaga8JN:tgEaENMM:rg8K:va8KJbbbb9BEg8ENUdbasczfaEa8ENUdbascCfaha8ENUdbascwfa8Maya8NMMJbbnn:vUdba5a8KMh5aAcxfhAascKfhsarcufgrmbka5aL:Z:vJbbbZNhEkamcuaLcdtalcFFFF970Ecbyd;y1jjbHjjjjbbgCBd:WwamcoBd;8waEaq:ZNhEdna3mbcbhsaChAinaAasBdbaAclfhAaLascefgs9hmbkkaE:rhhcuh8PamcuaLcltalcFFFFd0Ecbyd;y1jjbHjjjjbbgIBd:0wamcrBd;8wcbaIa8AaCaLz:djjjb8AJFFuuhyJFFuuh8RJFFuuh8Sdnalci6gXmbJFFuuh8Sa8AhsaLhAJFFuuh8RJFFuuhyinascwfIdbgEayayaE9EEhyasclfIdbgEa8Ra8RaE9EEh8RasIdbgEa8Sa8SaE9EEh8SascKfhsaAcufgAmbkkahJbbbZNhgamaocetgscuaocu9kEcbyd;y1jjbHjjjjbbgABd:4waAcFeasz:njjjbhCdnaXmbcbhAJFFuuhEa8Ahscuh8PinascwfIdbay:tghahNasIdba8S:tghahNasclfIdba8R:tghahNMM:rghaEa8PcuSahaE9DVgXEhEaAa8PaXEh8PascKfhsaLaAcefgA9hmbkkamczfcbcjwz:njjjb8Aamcwf9cb83ibam9cb83ibagaxNhRJbbjZak:th8Ncbh8UJbbbbh8VJbbbbh8WJbbbbh8XJbbbbh8YJbbbbh8ZJbbbbh80cbh81cbhPinJbbbbhEdna8UTmbJbbjZa8U:Z:vhEkJbbbbhhdna80a80Na8Ya8YNa8Za8ZNMMg8KJbbbb9BmbJbbjZa8K:r:vhhka8XaENh5a8WaENh8Fa8VaENhaa8PhQdndndndndna8UaPVTmbamydwgBTmea80ahNh8Ja8ZahNh8La8YahNh8Maeamydbcdtfh83cbh3JFFuuhEcvhXcuhQindnaza83a3cdtfydbcdtgsfydbgvTmbaOaHasfydbcdtfhAindndnaCaiaAydbgKcx2fgsclfydbgrcetf8Vebcs4aCasydbgLcetf8Vebcs4faCascwfydbglcetf8Vebcs4fgombcbhsxekcehsazaLcdtfydbgLceSmbcehsazarcdtfydbgrceSmbcehsazalcdtfydbglceSmbdnarcdSaLcdSfalcdSfcd6mbaocefhsxekaocdfhskdnasaX9kmba8AaKcK2fgLIdwa5:thhaLIdla8F:th8KaLIdbaa:th8EdndnakJbbbb9DTmba8E:lg8Ea8K:lg8Ka8Ea8K9EEg8Kah:lgha8Kah9EEag:vJbbjZMhhxekahahNa8Ea8ENa8Ka8KNMM:rag:va8NNJbbjZMJ9VO:d86JbbjZaLIdCa8JNaLIdxa8MNa8LaLIdzNMMakN:tghahJ9VO:d869DENhhkaKaQasaX6ahaE9DVgLEhQasaXaLEhXahaEaLEhEkaAclfhAavcufgvmbkka3cefg3aB9hmbkkaQcu9hmekama5Ud:ODama8FUd:KDamaaUd:GDamcuBd:qDamcFFF;7rBdjDaIcba8AaYamc:GDfakJbbbb9Damc:qDfamcjDfz:ejjjbamyd:qDhQdndnaxJbbbb9ETmba8UaD6mbaQcuSmeceh3amIdjDaR9EmixdkaQcu9hmekdna8UTmbdnamydlgza8Uci2fgsciGTmbadasfcba8Uazcu7fciGcefz:njjjb8AkabaPcltfgzam8Pib83dbazcwfamcwf8Pib83dbaPcefhPkc3hzinazc98Smvamc:Cwfazfydbcbyd;u1jjbH:bjjjbbazc98fhzxbkkcbh3a8Uaq9pmbamydwaCaiaQcx2fgsydbcetf8Vebcs4aCascwfydbcetf8Vebcs4faCasclfydbcetf8Vebcs4ffaw9nmekcbhscbhAdna81TmbcbhAamczfhXinamczfaAcdtfaXydbgLBdbaXclfhXaAaYaLfRbbTfhAa81cufg81mbkkamydwhlamydbhXam9cu83i:GDam9cu83i:ODam9cu83i:qDam9cu83i:yDaAc;8eaAclfc:bd6Eh81inamcjDfasfcFFF;7rBdbasclfgscz9hmbka81cdthBdnalTmbaeaXcdtfhocbhrindnazaoarcdtfydbcdtgsfydbgvTmbaOaHasfydbcdtfhAcuhLcuhsinazaiaAydbgKcx2fgXclfydbcdtfydbazaXydbcdtfydbfazaXcwfydbcdtfydbfgXasaXas6gXEhsaKaLaXEhLaAclfhAavcufgvmbkaLcuSmba8AaLcK2fgAIdway:tgEaENaAIdba8S:tgEaENaAIdla8R:tgEaENMM:rhEcbhAindndnasamc:qDfaAfgvydbgX6mbasaX9hmeaEamcjDfaAfIdb9FTmekavasBdbamc:GDfaAfaLBdbamcjDfaAfaEUdbxdkaAclfgAcz9hmbkkarcefgral9hmbkkamczfaBfhLcbhscbhAindnamc:GDfasfydbgXcuSmbaLaAcdtfaXBdbaAcefhAkasclfgscz9hmbkaAa81fg81TmbJFFuuhhcuhKamczfhsa81hvcuhLina8AasydbgXcK2fgAIdway:tgEaENaAIdba8S:tgEaENaAIdla8R:tgEaENMM:rhEdndnazaiaXcx2fgAclfydbcdtfydbazaAydbcdtfydbfazaAcwfydbcdtfydbfgAaL6mbaAaL9hmeaEah9DTmekaEhhaAhLaXhKkasclfhsavcufgvmbkaKcuSmbaKhQkdnamaiaQcx2fgrydbarclfydbarcwfydbaCabaeadaPawaqa3z:fjjjbTmbaPcefhPJbbbbh8VJbbbbh8WJbbbbh8XJbbbbh8YJbbbbh8ZJbbbbh80kcbhXinaOaHaraXcdtfydbcdtgAfydbcdtfgKhsazaAfgvydbgLhAdnaLTmbdninasydbaQSmeasclfhsaAcufgATmdxbkkasaKaLcdtfc98fydbBdbavavydbcufBdbkaXcefgXci9hmbka8AaQcK2fgsIdbhEasIdlhhasIdwh8KasIdxh8EasIdzh5asIdCh8FaYaQfce86bba80a8FMh80a8Za5Mh8Za8Ya8EMh8Ya8Xa8KMh8Xa8WahMh8Wa8VaEMh8Vamydxh8Uxbkkamc:WDf8KjjjjbaPk;Vvivuv99lu8Jjjjjbca9Rgv8Kjjjjbdndnalcw0mbaiydbhoaeabcitfgralcdtcufBdlaraoBdbdnalcd6mbaiclfhoalcufhwarcxfhrinaoydbhDarcuBdbarc98faDBdbarcwfhraoclfhoawcufgwmbkkalabfhrxekcbhDavczfcwfcbBdbav9cb83izavcwfcbBdbav9cb83ibJbbjZhqJbbjZhkinadaiaDcdtfydbcK2fhwcbhrinavczfarfgoawarfIdbgxaoIdbgm:tgPakNamMgmUdbavarfgoaPaxam:tNaoIdbMUdbarclfgrcx9hmbkJbbjZaqJbbjZMgq:vhkaDcefgDal9hmbkcbhoadcbcecdavIdlgxavIdwgm9GEgravIdbgPam9GEaraPax9GEgscdtgrfhzavczfarfIdbhxaihralhwinaiaocdtfgDydbhHaDarydbgOBdbaraHBdbarclfhraoazaOcK2fIdbax9Dfhoawcufgwmbkaeabcitfhrdndnaocv6mbaoalc98f6mekaraiydbBdbaralcdtcufBdlaiclfhoalcufhwarcxfhrinaoydbhDarcuBdbarc98faDBdbarcwfhraoclfhoawcufgwmbkalabfhrxekaraxUdbararydlc98GasVBdlabcefaeadaiaoz:djjjbhwararydlciGawabcu7fcdtVBdlawaeadaiaocdtfalao9Rz:djjjbhrkavcaf8Kjjjjbark:;idiud99dndnabaecitfgwydlgDciGgqciSmbinabcbaDcd4gDalaqcdtfIdbawIdb:tgkJbbbb9FEgwaecefgefadaialavaoarz:ejjjbak:larIdb9FTmdabawaD7aefgecitfgwydlgDciGgqci9hmbkkabaecitfgeclfhbdnavmbcuhwindnaiaeydbgDfRbbmbadaDcK2fgqIdwalIdw:tgkakNaqIdbalIdb:tgkakNaqIdlalIdl:tgkakNMM:rgkarIdb9DTmbarakUdbaoaDBdbkaecwfheawcefgwabydbcd46mbxdkkcuhwindnaiaeydbgDfRbbmbadaDcK2fgqIdbalIdb:t:lgkaqIdlalIdl:t:lgxakax9EEgkaqIdwalIdw:t:lgxakax9EEgkarIdb9DTmbarakUdbaoaDBdbkaecwfheawcefgwabydbcd46mbkkk;llevudnabydwgxaladcetfgm8Vebcs4alaecetfgP8Vebgscs4falaicetfgz8Vebcs4ffaD0abydxaq9pVakVgDce9hmbavawcltfgxab8Pdb83dbaxcwfabcwfgx8Pdb83dbdnaxydbgqTmbaoabydbcdtfhxaqhsinalaxydbcetfcFFi87ebaxclfhxascufgsmbkkdnabydxglci2gsabydlgxfgkciGTmbarakfcbalaxcu7fciGcefz:njjjb8Aabydxci2hsabydlhxabydwhqkab9cb83dwababydbaqfBdbabascifc98GaxfBdlaP8Vebhscbhxkdnascztcz91cu9kmbabaxcefBdwaPax87ebaoabydbcdtfaxcdtfaeBdbkdnam8Uebcu9kmbababydwgxcefBdwamax87ebaoabydbcdtfaxcdtfadBdbkdnaz8Uebcu9kmbababydwgxcefBdwazax87ebaoabydbcdtfaxcdtfaiBdbkarabydlfabydxci2faPRbb86bbarabydlfabydxci2fcefamRbb86bbarabydlfabydxci2fcdfazRbb86bbababydxcefBdxaDk8LbabaeadaialavaoarawaDaDaqJbbbbz:cjjjbk;Nkovud99euv99eul998Jjjjjbc:W;ae9Rgo8KjjjjbdndnadTmbavcd4hrcbhwcbhDindnaiaeclfydbar2cdtfgvIdbaiaeydbar2cdtfgqIdbgk:tgxaiaecwfydbar2cdtfgmIdlaqIdlgP:tgsNamIdbak:tgzavIdlaP:tgPN:tgkakNaPamIdwaqIdwgH:tgONasavIdwaH:tgHN:tgPaPNaHazNaOaxN:tgxaxNMM:rgsJbbbb9Bmbaoc:W:qefawcx2fgAakas:vUdwaAaxas:vUdlaAaPas:vUdbaoc8Wfawc8K2fgAaq8Pdb83dbaAav8Pdb83dxaAam8Pdb83dKaAcwfaqcwfydbBdbaAcCfavcwfydbBdbaAcafamcwfydbBdbawcefhwkaecxfheaDcifgDad6mbkab9cb83dbabcyf9cb83dbabcaf9cb83dbabcKf9cb83dbabczf9cb83dbabcwf9cb83dbawTmeaocbBd8Sao9cb83iKao9cb83izaoczfaoc8Wfawci2cxaoc8Sfcbcrz1jjjbaoIdKhCaoIdChXaoIdzhQao9cb83iwao9cb83ibaoaoc:W:qefawcxaoc8Sfcbciz1jjjbJbbjZhkaoIdwgPJbbbbJbbjZaPaPNaoIdbgPaPNaoIdlgsasNMM:rgx:vaxJbbbb9BEgzNhxasazNhsaPazNhzaoc:W:qefheawhvinaecwfIdbaxNaeIdbazNasaeclfIdbNMMgPakaPak9DEhkaecxfheavcufgvmbkabaCUdwabaXUdlabaQUdbabaoId3UdxdndnakJ;n;m;m899FmbJbbbbhPaoc:W:qefheaoc8WfhvinaCavcwfIdb:taecwfIdbgHNaQavIdb:taeIdbgONaXavclfIdb:taeclfIdbgLNMMaxaHNazaONasaLNMM:vgHaPaHaP9EEhPavc8KfhvaecxfheawcufgwmbkabaxUd8KabasUdaabazUd3abaCaxaPN:tUdKabaXasaPN:tUdCabaQazaPN:tUdzabJbbjZakakN:t:rgkUdydndnaxJbbj:;axJbbj:;9GEgPJbbjZaPJbbjZ9FEJbb;:9cNJbbbZJbbb:;axJbbbb9GEMgP:lJbbb9p9DTmbaP:Ohexekcjjjj94hekabae86b8UdndnasJbbj:;asJbbj:;9GEgPJbbjZaPJbbjZ9FEJbb;:9cNJbbbZJbbb:;asJbbbb9GEMgP:lJbbb9p9DTmbaP:Ohvxekcjjjj94hvkabav86bRdndnazJbbj:;azJbbj:;9GEgPJbbjZaPJbbjZ9FEJbb;:9cNJbbbZJbbb:;azJbbbb9GEMgP:lJbbb9p9DTmbaP:Ohqxekcjjjj94hqkabaq86b8SdndnaecKtcK91:YJbb;:9c:vax:t:lavcKtcK91:YJbb;:9c:vas:t:laqcKtcK91:YJbb;:9c:vaz:t:lakMMMJbb;:9cNJbbjZMgk:lJbbb9p9DTmbak:Ohexekcjjjj94hekaecFbaecFb9iEhexekabcjjj;8iBdycFbhekabae86b8Vxekab9cb83dbabcyf9cb83dbabcaf9cb83dbabcKf9cb83dbabczf9cb83dbabcwf9cb83dbkaoc:W;aef8Kjjjjbk;Iwwvul99iud99eue99eul998Jjjjjbcje9Rgr8Kjjjjbavcd4hwaicd4hDdndnaoTmbarc;abfcbaocdtgvz:njjjb8Aarc;Gbfcbavz:njjjb8AarhvarcafhiaohqinavcFFF97BdbaicFFF;7rBdbaiclfhiavclfhvaqcufgqmbkdnadTmbcbhkinaeakaD2cdtfgvIdwhxavIdlhmavIdbhPalakaw2cdtfIdbhsarc;abfhzarhiarc;GbfhHarcafhqcj1jjbhvaohOinasavcwfIdbaxNavIdbaPNavclfIdbamNMMgAMhCakhXdnaAas:tgAaqIdbgQ9DgLmbaHydbhXkaHaXBdbakhXdnaCaiIdbgK9EmbazydbhXaKhCkazaXBdbaiaCUdbaqaAaQaLEUdbavcxfhvaqclfhqaHclfhHaiclfhiazclfhzaOcufgOmbkakcefgkad9hmbkkadThkJbbbbhCcbhXarc;abfhvarc;Gbfhicbhqinalavydbgzaw2cdtfIdbalaiydbgHaw2cdtfIdbaeazaD2cdtfgzIdwaeaHaD2cdtfgHIdw:tgsasNazIdbaHIdb:tgsasNazIdlaHIdl:tgsasNMM:rMMgsaCasaC9EgzEhCaqaXazEhXaiclfhiavclfhvaoaqcefgq9hmbkaCJbbbZNhKxekadThkcbhXJbbbbhKkJbbbbhCdnaearc;abfaXcdtgifydbgqaD2cdtfgvIdwaearc;GbfaifydbgzaD2cdtfgiIdwgm:tgsasNavIdbaiIdbgY:tgAaANavIdlaiIdlgP:tgQaQNMM:rgxJbbbb9ETmbaxalaqaw2cdtfIdbMalazaw2cdtfIdb:taxaxM:vhCkasaCNamMhmaQaCNaPMhPaAaCNaYMhYdnakmbaDcdthvawcdthiindnalIdbg8AaecwfIdbam:tgCaCNaeIdbaY:tgsasNaeclfIdbaP:tgAaANMM:rgQMgEaK9ETmbJbbbbhxdnaQJbbbb9ETmbaEaK:taQaQM:vhxkaxaCNamMhmaxaANaPMhPaxasNaYMhYa8AaKaQMMJbbbZNhKkaeavfhealaifhladcufgdmbkkabaKUdxabamUdwabaPUdlabaYUdbarcjef8Kjjjjbkjeeiu8Jjjjjbcj8W9Rgr8Kjjjjbaici2hwdnaiTmbawceawce0EhDarhiinaiaeadRbbcdtfydbBdbadcefhdaiclfhiaDcufgDmbkkabarawaladaoz:hjjjbarcj8Wf8Kjjjjbk:3lequ8JjjjjbcjP9Rgl8Kjjjjbcbhvalcjxfcbaiz:njjjb8AdndnadTmbcjehoaehrincuhwarhDcuhqavhkdninawakaoalcjxfaDcefRbbfRbb9RcFeGci6aoalcjxfaDRbbfRbb9RcFeGci6faoalcjxfaDcdfRbbfRbb9RcFeGci6fgxaq9mgmEhwdnammbaxce0mdkaxaqaxaq9kEhqaDcifhDadakcefgk9hmbkkaeawci2fgDcdfRbbhqaDcefRbbhxaDRbbhkaeavci2fgDcifaDawav9Rci2z:qjjjb8Aakalcjxffaocefgo86bbaxalcjxffao86bbaDcdfaq86bbaDcefax86bbaDak86bbaqalcjxffao86bbarcifhravcefgvad9hmbkalcFeaicetz:njjjbhoadci2gDceaDce0EhqcbhxindnaoaeRbbgkcetfgw8UebgDcu9kmbawax87ebaocjlfaxcdtfabakcdtfydbBdbaxhDaxcefhxkaeaD86bbaecefheaqcufgqmbkaxcdthDxekcbhDkabalcjlfaDz:mjjjb8AalcjPf8Kjjjjbk9teiucbcbyd;C1jjbgeabcifc98GfgbBd;C1jjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik;teeeudndnaeabVciGTmbabhixekdndnadcz9pmbabhixekabhiinaiaeydbBdbaiaeydlBdlaiaeydwBdwaiaeydxBdxaeczfheaiczfhiadc9Wfgdcs0mbkkadcl6mbinaiaeydbBdbaeclfheaiclfhiadc98fgdci0mbkkdnadTmbinaiaeRbb86bbaicefhiaecefheadcufgdmbkkabk:3eedudndnabciGTmbabhixekaecFeGc:b:c:ew2hldndnadcz9pmbabhixekabhiinaialBdxaialBdwaialBdlaialBdbaiczfhiadc9Wfgdcs0mbkkadcl6mbinaialBdbaiclfhiadc98fgdci0mbkkdnadTmbinaiae86bbaicefhiadcufgdmbkkabk9teiucbcbyd;C1jjbgeabcrfc94GfgbBd;C1jjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik9:eiuZbhedndncbyd;C1jjbgdaecztgi9nmbcuheadai9RcFFifcz4nbcuSmekadhekcbabae9Rcifc98Gcbyd;C1jjbfgdBd;C1jjbdnadZbcztge9nmbadae9RcFFifcz4nb8Akk:;Deludndndnadch9pmbabaeSmdaeabadfgi9Rcbadcet9R0mekabaead;8qbbxekaeab7ciGhldndndnabae9pmbdnalTmbadhvabhixikdnabciGmbadhvabhixdkadTmiabaeRbb86bbadcufhvdnabcefgiciGmbaecefhexdkavTmiabaeRbe86beadc9:fhvdnabcdfgiciGmbaecdfhexdkavTmiabaeRbd86bdadc99fhvdnabcifgiciGmbaecifhexdkavTmiabaeRbi86biabclfhiaeclfheadc98fhvxekdnalmbdnaiciGTmbadTmlabadcufgifglaeaifRbb86bbdnalciGmbaihdxekaiTmlabadc9:fgifglaeaifRbb86bbdnalciGmbaihdxekaiTmlabadc99fgifglaeaifRbb86bbdnalciGmbaihdxekaiTmlabadc98fgdfaeadfRbb86bbkadcl6mbdnadc98fgocd4cefciGgiTmbaec98fhlabc98fhvinavadfaladfydbBdbadc98fhdaicufgimbkkaocx6mbaec9Wfhvabc9WfhoinaoadfgicxfavadfglcxfydbBdbaicwfalcwfydbBdbaiclfalclfydbBdbaialydbBdbadc9Wfgdci0mbkkadTmdadhidnadciGglTmbaecufhvabcufhoadhiinaoaifavaifRbb86bbaicufhialcufglmbkkadcl6mdaec98fhlabc98fhvinavaifgecifalaifgdcifRbb86bbaecdfadcdfRbb86bbaecefadcefRbb86bbaeadRbb86bbaic98fgimbxikkavcl6mbdnavc98fglcd4cefcrGgdTmbavadcdt9RhvinaiaeydbBdbaeclfheaiclfhiadcufgdmbkkalc36mbinaiaeydbBdbaiaeydlBdlaiaeydwBdwaiaeydxBdxaiaeydzBdzaiaeydCBdCaiaeydKBdKaiaeyd3Bd3aecafheaicafhiavc9Gfgvci0mbkkavTmbdndnavcrGgdmbavhlxekavc94GhlinaiaeRbb86bbaicefhiaecefheadcufgdmbkkavcw6mbinaiaeRbb86bbaiaeRbe86beaiaeRbd86bdaiaeRbi86biaiaeRbl86blaiaeRbv86bvaiaeRbo86boaiaeRbr86braicwfhiaecwfhealc94fglmbkkabkk9Tdbcjwk9ubbjZbbbbbbbbbbbbbbjZbbbbbbbbbbbbbbjZ86;nAZ86;nAZ86;nAZ86;nA:;86;nAZ86;nAZ86;nAZ86;nA:;86;nAZ86;nAZ86;nAZ86;nA:;bc;uwkxebbbdbbb9GNbb",t=new Uint8Array([32,0,65,2,1,106,34,33,3,128,11,4,13,64,6,253,10,7,15,116,127,5,8,12,40,16,19,54,20,9,27,255,113,17,42,67,24,23,146,148,18,14,22,45,70,69,56,114,101,21,25,63,75,136,108,28,118,29,73,115]);if(typeof WebAssembly!="object")return{supported:!1};var a,s=WebAssembly.instantiate(r(e),{}).then(function(u){a=u.instance,a.exports.__wasm_call_ctors()});function r(u){for(var d=new Uint8Array(u.length),m=0;m<u.length;++m){var f=u.charCodeAt(m);d[m]=f>96?f-97:f>64?f-39:f+4}for(var h=0,m=0;m<u.length;++m)d[h++]=d[m]<60?t[d[m]]:(d[m]-60)*64+d[++m];return d.buffer.slice(0,h)}function n(u){if(!u)throw new Error("Assertion failed")}function i(u){return new Uint8Array(u.buffer,u.byteOffset,u.byteLength)}var o=48,c=16;function l(u,d){var m=u.meshlets[d*4+0],f=u.meshlets[d*4+1],h=u.meshlets[d*4+2],y=u.meshlets[d*4+3];return{vertices:u.vertices.subarray(m,m+h),triangles:u.triangles.subarray(f,f+y*3)}}function p(u,d,m,f,h,y,w){var T=a.exports.sbrk,E=a.exports.meshopt_buildMeshletsBound(u.length,h,y),R=T(E*c),I=T(E*h*4),_=T(E*y*3),A=T(u.byteLength),j=T(d.byteLength),P=new Uint8Array(a.exports.memory.buffer);P.set(i(u),A),P.set(i(d),j);var F=a.exports.meshopt_buildMeshlets(R,I,_,A,u.length,j,m,f,h,y,w);P=new Uint8Array(a.exports.memory.buffer);for(var C=P.subarray(R,R+F*c),H=new Uint32Array(C.buffer,C.byteOffset,C.byteLength/4).slice(),se=0;se<F;++se){var ie=H[se*4+0],Ue=H[se*4+1],m=H[se*4+2],k=H[se*4+3];a.exports.meshopt_optimizeMeshlet(I+ie*4,_+Ue,k,m)}var B=H[(F-1)*4+0],U=H[(F-1)*4+1],q=H[(F-1)*4+2],le=H[(F-1)*4+3],me=B+q,Ct=U+(le*3+3&-4),ss={meshlets:H,vertices:new Uint32Array(P.buffer,I,me).slice(),triangles:new Uint8Array(P.buffer,_,Ct*3).slice(),meshletCount:F};return T(R-T(0)),ss}function g(u){var d=new Float32Array(a.exports.memory.buffer,u,o/4);return{centerX:d[0],centerY:d[1],centerZ:d[2],radius:d[3],coneApexX:d[4],coneApexY:d[5],coneApexZ:d[6],coneAxisX:d[7],coneAxisY:d[8],coneAxisZ:d[9],coneCutoff:d[10]}}function v(u,d,m,f){var h=a.exports.sbrk,y=[],w=h(d.byteLength),T=h(u.vertices.byteLength),E=h(u.triangles.byteLength),R=h(o),I=new Uint8Array(a.exports.memory.buffer);I.set(i(d),w),I.set(i(u.vertices),T),I.set(i(u.triangles),E);for(var _=0;_<u.meshletCount;++_){var A=u.meshlets[_*4+0],j=u.meshlets[_*4+0+1],P=u.meshlets[_*4+0+3];a.exports.meshopt_computeMeshletBounds(R,T+A*4,E+j,P,w,m,f),y.push(g(R))}return h(w-h(0)),y}function x(u,d,m,f){var h=a.exports.sbrk,y=h(o),w=h(u.byteLength),T=h(d.byteLength),E=new Uint8Array(a.exports.memory.buffer);E.set(i(u),w),E.set(i(d),T),a.exports.meshopt_computeClusterBounds(y,w,u.length,T,m,f);var R=g(y);return h(y-h(0)),R}return{ready:s,supported:!0,buildMeshlets:function(u,d,m,f,h,y){n(u.length%3==0),n(d instanceof Float32Array),n(d.length%m==0),n(m>=3),n(f<=256||f>0),n(h<=512),n(h%4==0),y=y||0;var w=u.BYTES_PER_ELEMENT==4?u:new Uint32Array(u);return p(w,d,d.length/m,m*4,f,h,y)},computeClusterBounds:function(u,d,m){n(u.length%3==0),n(u.length/3<=512),n(d instanceof Float32Array),n(d.length%m==0),n(m>=3);var f=u.BYTES_PER_ELEMENT==4?u:new Uint32Array(u);return x(f,d,d.length/m,m*4)},computeMeshletBounds:function(u,d,m){return n(u.meshletCount!=0),n(d instanceof Float32Array),n(d.length%m==0),n(m>=3),v(u,d,d.length/m,m*4)},extractMeshlet:function(u,d){return n(d>=0&&d<u.meshletCount),l(u,d)}}})();var Pl=new Wr().registerExtensions([ks,Ms,Rs]).registerDependencies({"meshopt.decoder":Is});async function Lt(e,t={}){await Is.ready;let a=await fetch(e,{cache:t.fetchCache||"no-store"});if(!a.ok)throw new Error(`Failed to load ${e}: ${a.status}`);let s=new Uint8Array(await a.arrayBuffer()),r=await Pl.readBinary(s),n=[],i=t.componentFeatures||new Map,o=new Map;function c(l,p=""){let g=i.has(l.getName());g&&o.set(l.getName(),(o.get(l.getName())||0)+1);let v=g?l.getName():p,x=l.getMesh();if(x){let u=l.getWorldMatrix();for(let d of x.listPrimitives()){let m=d.getAttribute("POSITION"),f=d.getAttribute("NORMAL"),h=d.getAttribute("_FEATURE_ID_0"),y=d.getAttribute("_FEATURE_ID_1"),w=d.getIndices()?.getArray();if(!m||!w)continue;let T=m.getCount(),E=new Float32Array(T*3),R=new Float32Array(T*3),I=new Uint32Array(T),_=new Uint32Array(T),A=[1/0,1/0,1/0,-1/0,-1/0,-1/0],j=[],P=i.get(v)?.featureId||t.defaultFeatureId||0;for(let C=0;C<T;C+=1)m.getElement(C,j),Dl(E,C*3,j,u),A[0]=Math.min(A[0],E[C*3]),A[1]=Math.min(A[1],E[C*3+1]),A[2]=Math.min(A[2],E[C*3+2]),A[3]=Math.max(A[3],E[C*3]),A[4]=Math.max(A[4],E[C*3+1]),A[5]=Math.max(A[5],E[C*3+2]),f?(f.getElement(C,j),Ul(R,C*3,j,u)):R.set([0,0,1],C*3),I[C]=Number(h?.getScalar(C)||0),_[C]=Number(y?y.getScalar(C)||0:P);let F=d.getMaterial();n.push({position:E,normal:R,netId:I,objectFeatureId:_,indices:w,designator:v,nodeName:l.getName(),meshName:x.getName(),bounds:A,material:F?{name:F.getName(),baseColor:F.getBaseColorFactor(),metallic:F.getMetallicFactor(),roughness:F.getRoughnessFactor(),emissive:F.getEmissiveFactor()}:{baseColor:t.baseColor||[.55,.58,.64,1],metallic:.05,roughness:.72,emissive:[0,0,0]}})}}for(let u of l.listChildren())c(u,v)}for(let l of r.getRoot().listScenes())for(let p of l.listChildren())c(p);return{byteLength:s.byteLength,primitives:n,componentNodeCounts:o}}function Dl(e,t,a,s){let r=s[0]*a[0]+s[4]*a[1]+s[8]*a[2]+s[12],n=s[1]*a[0]+s[5]*a[1]+s[9]*a[2]+s[13],i=s[2]*a[0]+s[6]*a[1]+s[10]*a[2]+s[14];e[t]=r,e[t+1]=-i,e[t+2]=n}function Ul(e,t,a,s){let r=s[0]*a[0]+s[4]*a[1]+s[8]*a[2],n=s[1]*a[0]+s[5]*a[1]+s[9]*a[2],i=s[2]*a[0]+s[6]*a[1]+s[10]*a[2],o=Math.hypot(r,n,i)||1;e[t]=r/o,e[t+1]=-i/o,e[t+2]=n/o}var As=`
fn featureHidden(id: u32) -> bool {
  return id < arrayLength(&hiddenMask) && hiddenMask[id] == 0u;
}
`;function ka(e){let t=new Set;if(e==null)return t;for(let a of e){let s=Number(a);!Number.isInteger(s)||s<=0||s>4294967295||t.add(s)}return t}function Tn(e,t=0){let a=0;for(let n of ka(e))a=Math.max(a,n);let s=64,r=a+1;for(;s<r;)s*=2;return Math.max(s,Math.floor(t)||0)}function En(e,t){let a=Math.max(64,Math.floor(t)||0),s=new Uint32Array(a);s.fill(1);for(let r of ka(e))r<a&&(s[r]=0);return s}var kn=40,gt=256,Mn=112,It=gt/4,Gl=256,Vl={compare:"always",passOp:"zero"},zl={compare:"always",passOp:"replace"},Hl={compare:"not-equal",passOp:"keep"},ql={compare:"equal",passOp:"keep"},Kt=`
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
};
@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<uniform> draw: Draw;
@group(0) @binding(3) var<storage, read> hiddenMask: array<u32>;
@group(0) @binding(4) var<storage, read> netMask: array<u32>;
${As}
${cs}
// Set on the pipeline that draws the solder mask over copper.
override COVERED: bool = false;

struct VertexInput {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) netId: u32,
  @location(3) objectId: u32,
  @location(4) layerId: u32,
  @location(5) materialId: u32,
};
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) @interpolate(flat) netId: u32,
  @location(2) @interpolate(flat) objectId: u32,
  @location(3) world: vec3f,
};
@vertex fn vs(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.world = input.position + draw.offset.xyz;
  output.position = globals.viewProjection * vec4f(output.world, 1.0);
  output.normal = normalize(input.normal);
  output.netId = input.netId;
  output.objectId = input.objectId;
  return output;
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
  let kind = u32(draw.flags.x);
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
    if (draw.flags.z < 0.5) {
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
  return vec4f(aces(lit), alpha);
}
`,Xl=`
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
@group(0) @binding(3) var<storage, read> hiddenMask: array<u32>;
${As}
struct Input {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) netId: u32,
  @location(3) objectId: u32,
  @location(4) layerId: u32,
  @location(5) materialId: u32,
};
struct Output {
  @builtin(position) position: vec4f,
  @location(0) @interpolate(flat) objectId: u32,
};
@vertex fn vs(input: Input) -> Output {
  var output: Output;
  output.position = globals.viewProjection * vec4f(input.position + draw.offset.xyz, 1.0);
  output.objectId = input.objectId;
  return output;
}
@fragment fn fs(input: Output) -> @location(0) u32 {
  if (u32(draw.flags.x) == 2u && featureHidden(input.objectId)) { discard; }
  return input.objectId;
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
struct Draw { color: vec4f, material: vec4f, offset: vec4f, flags: vec4f };
@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<uniform> draw: Draw;
@group(0) @binding(2) var<storage, read> layerOffsets: array<f32>;
@group(0) @binding(4) var<storage, read> netMask: array<u32>;
${cs}
struct Input {
  @location(0) unit: vec3f,
  @location(1) normal: vec3f,
  @location(2) radiusMix: f32,
  @location(3) dimensions: vec4f,
  @location(4) span: vec2f,
  @location(5) ids: vec4u,
};
struct Output {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) @interpolate(flat) netId: u32,
  @location(2) @interpolate(flat) objectId: u32,
  @location(3) @interpolate(flat) visible: u32,
};
@vertex fn vs(input: Input) -> Output {
  let radius = mix(input.dimensions.z, input.dimensions.w, input.radiusMix);
  let z0 = input.span.x + layerOffsets[input.ids.z];
  let z1 = input.span.y + layerOffsets[input.ids.w];
  let world = vec3f(
    input.dimensions.x + input.unit.x * radius,
    input.dimensions.y + input.unit.y * radius,
    mix(z0, z1, input.unit.z)
  );
  var output: Output;
  output.position = globals.viewProjection * vec4f(world, 1.0);
  output.normal = input.normal;
  output.netId = input.ids.x;
  output.objectId = input.ids.y;
  output.visible = 0u;
  if (globals.selectedLayer == 0u || (globals.selectedLayer >= input.ids.z && globals.selectedLayer <= input.ids.w)) {
    output.visible = 1u;
  }
  return output;
}
@fragment fn fs(input: Output) -> @location(0) vec4f {
  if (input.visible == 0u) { discard; }
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
  return vec4f(lit, 1.0);
}
`,Jl=`
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
struct Input {
  @location(0) unit: vec3f,
  @location(1) normal: vec3f,
  @location(2) radiusMix: f32,
  @location(3) dimensions: vec4f,
  @location(4) span: vec2f,
  @location(5) ids: vec4u,
};
struct Output {
  @builtin(position) position: vec4f,
  @location(0) @interpolate(flat) objectId: u32,
  @location(1) @interpolate(flat) visible: u32,
};
@vertex fn vs(input: Input) -> Output {
  let radius = mix(input.dimensions.z, input.dimensions.w, input.radiusMix);
  let world = vec3f(
    input.dimensions.x + input.unit.x * radius,
    input.dimensions.y + input.unit.y * radius,
    mix(input.span.x + layerOffsets[input.ids.z], input.span.y + layerOffsets[input.ids.w], input.unit.z)
  );
  var output: Output;
  output.position = globals.viewProjection * vec4f(world, 1.0);
  output.objectId = input.ids.y;
  output.visible = 0u;
  if (globals.selectedLayer == 0u || (globals.selectedLayer >= input.ids.z && globals.selectedLayer <= input.ids.w)) {
    output.visible = 1u;
  }
  return output;
}
@fragment fn fs(input: Output) -> @location(0) u32 {
  if (input.visible == 0u) { discard; }
  return input.objectId;
}
`,Ra=class e{static async create(t){if(!navigator.gpu)throw new Error("WebGPU is unavailable in this browser");let a=await navigator.gpu.requestAdapter({powerPreference:"high-performance"});if(!a)throw new Error("No WebGPU adapter is available");let s=a.features.has("depth32float-stencil8"),r=await a.requestDevice(s?{requiredFeatures:["depth32float-stencil8"]}:void 0);return new e(t,r,{stencil:s})}constructor(t,a,s={}){this.canvas=t,this.device=a,this.stencil=!!s.stencil,this.depthFormat=this.stencil?"depth32float-stencil8":"depth32float",this.version=0,this.barrelColor=[.55,.35,.16,.78],a.addEventListener("uncapturederror",i=>{console.error(`Uncaptured WebGPU error: ${i.error?.message||i.error}`)}),a.lost.then(i=>{console.error(`WebGPU device lost: ${i.reason}`,i.message)}),this.context=t.getContext("webgpu"),this.format=navigator.gpu.getPreferredCanvasFormat(),this.context.configure({device:a,format:this.format,alphaMode:"opaque"}),this.entries=[],this.barrels=null,this.drawSlotCapacity=Gl,this.drawSlotBuffer=this.createDrawSlotBuffer(this.drawSlotCapacity),this.drawStaging=new Float32Array(this.drawSlotCapacity*It),this.freeDrawSlots=[],this.nextDrawSlot=0,this.globalBuffer=a.createBuffer({size:Mn,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.layerOffsetBuffer=a.createBuffer({size:1024,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.bindGroupLayout=a.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:2,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:3,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:4,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}}]});let r=a.createPipelineLayout({bindGroupLayouts:[this.bindGroupLayout]}),n=[{arrayStride:kn,attributes:[{shaderLocation:0,offset:0,format:"float32x3"},{shaderLocation:1,offset:12,format:"float32x3"},{shaderLocation:2,offset:24,format:"uint32"},{shaderLocation:3,offset:28,format:"uint32"},{shaderLocation:4,offset:32,format:"uint32"},{shaderLocation:5,offset:36,format:"uint32"}]}];this.pipeline=this.makePipeline(r,Kt,this.format,n,"main",{stencil:Vl}),this.markPipeline=this.stencil?this.makePipeline(r,Kt,this.format,n,"main-mark",{stencil:zl}):this.pipeline,this.blendPipeline=this.makePipeline(r,Kt,this.format,n,"main-blend"),this.maskPipeline=this.stencil?this.makePipeline(r,Kt,this.format,n,"mask",{stencil:Hl}):this.blendPipeline,this.coveredMaskPipeline=this.stencil?this.makePipeline(r,Kt,this.format,n,"mask-covered",{stencil:ql,constants:{COVERED:1}}):null,this.pickPipeline=this.makePipeline(r,Xl,"r32uint",n,"pick"),this.barrelPipeline=this.makeBarrelPipeline(r,Wl,this.format,"barrel"),this.barrelPickPipeline=this.makeBarrelPipeline(r,Jl,"r32uint","barrel-pick"),this.depth=null,this.pickTexture=null,this.pickSerial=Promise.resolve(),this.bundleCache=new Map,this.globalScratch=new ArrayBuffer(Mn),this.globalScratchF32=new Float32Array(this.globalScratch),this.globalScratchView=new DataView(this.globalScratch),this.barrelDrawScratch=new Float32Array(gt/4),this.nextEntryId=1,this.hiddenFeatureIds=new Set,this.showPlaceholders=!0,this.featureMaskCapacity=64,this.featureMaskBuffer=this.createFeatureMaskBuffer(this.featureMaskCapacity),this.uploadFeatureMask(),this.emphasizedNetIds=new Set,this.netMaskCapacity=64,this.netMaskBuffer=this.createNetMaskBuffer(this.netMaskCapacity),this.uploadNetMask()}createNetMaskBuffer(t){return this.device.createBuffer({label:"net-emphasis-mask",size:t*Uint32Array.BYTES_PER_ELEMENT,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST})}uploadNetMask(){let t=yr(this.emphasizedNetIds,this.netMaskCapacity);this.device.queue.writeBuffer(this.netMaskBuffer,0,t)}setEmphasizedNetIds(t){this.emphasizedNetIds=ca(t);let a=mr(this.emphasizedNetIds,this.netMaskCapacity);a!==this.netMaskCapacity&&(this.netMaskBuffer?.destroy?.(),this.netMaskCapacity=a,this.netMaskBuffer=this.createNetMaskBuffer(a),this.rebindAll()),this.uploadNetMask(),this.invalidate()}rebindAll(){for(let t of this.entries)t.bindGroup=this.makeBindGroup(this.drawSlotBuffer,t.drawSlot*gt);this.barrels&&(this.barrels.bindGroup=this.makeBindGroup(this.barrels.drawBuffer)),this.bundleCache.clear()}createFeatureMaskBuffer(t){return this.device.createBuffer({label:"feature-visibility-mask",size:t*Uint32Array.BYTES_PER_ELEMENT,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST})}createDrawSlotBuffer(t){return this.device.createBuffer({label:"draw-uniforms",size:t*gt,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST})}allocateDrawSlot(){if(this.freeDrawSlots.length)return this.freeDrawSlots.pop();if(this.nextDrawSlot>=this.drawSlotCapacity){let t=this.drawSlotCapacity*2,a=new Float32Array(t*It);a.set(this.drawStaging),this.drawSlotBuffer.destroy?.(),this.drawSlotCapacity=t,this.drawSlotBuffer=this.createDrawSlotBuffer(t),this.drawStaging=a,this.rebindAll()}return this.nextDrawSlot++}flushDraws(t){if(!t.length)return;let a=1/0,s=-1;for(let r of t)a=Math.min(a,r.drawSlot),s=Math.max(s,r.drawSlot);this.device.queue.writeBuffer(this.drawSlotBuffer,a*gt,this.drawStaging,a*It,(s-a+1)*It)}invalidate(){this.version+=1}setBarrelColor(t){this.barrelColor=[...t],this.invalidate()}makeBindGroup(t,a=0){return this.device.createBindGroup({layout:this.bindGroupLayout,entries:[{binding:0,resource:{buffer:this.globalBuffer}},{binding:1,resource:{buffer:t,offset:a,size:gt}},{binding:2,resource:{buffer:this.layerOffsetBuffer}},{binding:3,resource:{buffer:this.featureMaskBuffer}},{binding:4,resource:{buffer:this.netMaskBuffer}}]})}uploadFeatureMask(){let t=En(this.hiddenFeatureIds,this.featureMaskCapacity);this.device.queue.writeBuffer(this.featureMaskBuffer,0,t)}setHiddenFeatureIds(t){this.hiddenFeatureIds=ka(t);let a=Tn(this.hiddenFeatureIds,this.featureMaskCapacity);a!==this.featureMaskCapacity&&(this.featureMaskBuffer?.destroy?.(),this.featureMaskCapacity=a,this.featureMaskBuffer=this.createFeatureMaskBuffer(a),this.rebindAll()),this.uploadFeatureMask(),this.bundleCache.clear(),this.invalidate()}depthStencilState(t=null){let a={format:this.depthFormat,depthWriteEnabled:!0,depthCompare:"greater"};return this.stencil&&t&&(a.stencilFront=t,a.stencilBack=t),a}makePipeline(t,a,s,r,n,i={}){let o=this.createShaderModule(a,n);return this.device.createRenderPipeline({layout:t,vertex:{module:o,entryPoint:"vs",buffers:r},fragment:{module:o,entryPoint:"fs",...i.constants?{constants:i.constants}:{},targets:[{format:s,blend:s==="r32uint"?void 0:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"triangle-list",cullMode:"none"},depthStencil:this.depthStencilState(i.stencil),multisample:{count:1}})}makeBarrelPipeline(t,a,s,r){let n=this.createShaderModule(a,r);return this.device.createRenderPipeline({layout:t,vertex:{module:n,entryPoint:"vs",buffers:[{arrayStride:28,attributes:[{shaderLocation:0,offset:0,format:"float32x3"},{shaderLocation:1,offset:12,format:"float32x3"},{shaderLocation:2,offset:24,format:"float32"}]},{arrayStride:40,stepMode:"instance",attributes:[{shaderLocation:3,offset:0,format:"float32x4"},{shaderLocation:4,offset:16,format:"float32x2"},{shaderLocation:5,offset:24,format:"uint32x4"}]}]},fragment:{module:n,entryPoint:"fs",targets:[{format:s,blend:s==="r32uint"?void 0:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"triangle-list",cullMode:"none"},depthStencil:this.depthStencilState()})}createShaderModule(t,a){let s=this.device.createShaderModule({label:`pcb-${a}`,code:t});return typeof s.getCompilationInfo=="function"&&s.getCompilationInfo().then(r=>{let n=[...r.messages||[]];if(n.length){console.groupCollapsed(`WebGPU shader compilation info: pcb-${a}`);for(let i of n)console[i.type==="error"?"error":"warn"](`${i.type} ${i.lineNum}:${i.linePos} ${i.message}`);console.groupEnd()}}),s}resize(){let t=Math.min(devicePixelRatio||1,2),a=Math.max(1,Math.floor(this.canvas.clientWidth*t)),s=Math.max(1,Math.floor(this.canvas.clientHeight*t));this.canvas.width===a&&this.canvas.height===s||(this.canvas.width=a,this.canvas.height=s,this.depth?.destroy(),this.pickTexture?.destroy(),this.depth=this.device.createTexture({size:[a,s],format:this.depthFormat,usage:GPUTextureUsage.RENDER_ATTACHMENT}),this.pickTexture=this.device.createTexture({size:[a,s],format:"r32uint",usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC}))}addPrimitive(t,a){let s=t.position.length/3,r=new ArrayBuffer(s*kn),n=new Float32Array(r),i=new Uint32Array(r);for(let x=0;x<s;x+=1){let u=x*10,d=x*3;n[u]=t.position[d],n[u+1]=t.position[d+1],n[u+2]=t.position[d+2],n[u+3]=t.normal[d],n[u+4]=t.normal[d+1],n[u+5]=t.normal[d+2],i[u+6]=t.netId[x]||0,i[u+7]=t.objectFeatureId[x]||0,i[u+8]=a.layerId||0,i[u+9]=a.materialId||0}let o=this.device.createBuffer({size:r.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});this.device.queue.writeBuffer(o,0,r);let c=t.indices instanceof Uint32Array?t.indices:new Uint32Array(t.indices),l=this.device.createBuffer({size:c.byteLength,usage:GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST});this.device.queue.writeBuffer(l,0,c);let p=this.allocateDrawSlot(),g=this.makeBindGroup(this.drawSlotBuffer,p*gt),v={...a,bounds:t.bounds||a.bounds||null,id:this.nextEntryId++,vertexBuffer:o,indexBuffer:l,indexCount:c.length,drawSlot:p,bindGroup:g};return this.entries.push(v),this.bundleCache.clear(),this.invalidate(),v}removeEntries(t){if(!t?.length)return;let a=new Set(t.map(s=>s.id));for(let s of t)s.vertexBuffer?.destroy?.(),s.indexBuffer?.destroy?.(),this.freeDrawSlots.push(s.drawSlot);this.entries=this.entries.filter(s=>!a.has(s.id)),this.bundleCache.clear(),this.invalidate()}dispose(){this.removeEntries(this.entries),this.barrels&&(this.barrels.vertexBuffer?.destroy?.(),this.barrels.indexBuffer?.destroy?.(),this.barrels.instanceBuffer?.destroy?.(),this.barrels.drawBuffer?.destroy?.(),this.barrels=null),this.depth?.destroy(),this.pickTexture?.destroy(),this.featureMaskBuffer?.destroy?.(),this.drawSlotBuffer?.destroy?.(),this.depth=null,this.pickTexture=null,this.featureMaskBuffer=null,this.bundleCache.clear()}setBarrels(t){if(!t?.length)return;let a=20,s=[],r=[];for(let u of[0,1]){let d=s.length/7;for(let m=0;m<a;m+=1){let f=Math.PI*2*m/a,h=Math.cos(f),y=Math.sin(f);for(let w of[0,1])s.push(h,y,w,u?-h:h,u?-y:y,0,u)}for(let m=0;m<a;m+=1){let f=(m+1)%a,h=d+m*2,y=d+f*2;r.push(h,y,y+1,h,y+1,h+1)}}let n=new Float32Array(s),i=new Uint16Array(r),o=new ArrayBuffer(t.length*40),c=new DataView(o);t.forEach((u,d)=>{let m=d*40;c.setFloat32(m,u.centerMm[0]/1e3,!0),c.setFloat32(m+4,-u.centerMm[1]/1e3,!0),c.setFloat32(m+8,Math.min(u.drillWidthMm,u.drillHeightMm)/2e3,!0),c.setFloat32(m+12,Math.max(u.outerWidthMm,u.outerHeightMm)/2e3,!0),c.setFloat32(m+16,u.startZMm/1e3,!0),c.setFloat32(m+20,u.endZMm/1e3,!0),c.setUint32(m+24,u.netId||0,!0),c.setUint32(m+28,u.objectFeatureId||0,!0),c.setUint32(m+32,u.startLayerId||0,!0),c.setUint32(m+36,u.endLayerId||0,!0)});let l=this.device.createBuffer({size:n.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),p=this.device.createBuffer({size:i.byteLength,usage:GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST}),g=this.device.createBuffer({size:o.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});this.device.queue.writeBuffer(l,0,n),this.device.queue.writeBuffer(p,0,i),this.device.queue.writeBuffer(g,0,o);let v=this.device.createBuffer({size:gt,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),x=this.makeBindGroup(v);this.barrels={records:t,vertexBuffer:l,indexBuffer:p,instanceBuffer:g,indexCount:i.length,instanceCount:t.length,drawBuffer:v,bindGroup:x},this.invalidate()}render({panels:t,activeNetId:a,selectedFeatureId:s,time:r,layerOffsets:n,visibleLayers:i,showBoard:o,showComponents:c,showPaste:l=!0,componentOpacity:p,boardOpacity:g,isolateNet:v,compareMode:x=!1,compareOffsets:u=new Map,layerAlphas:d=null,visibleTileIds:m=null}){this.resize(),this.device.queue.writeBuffer(this.layerOffsetBuffer,0,n);let f=this.context.getCurrentTexture().createView();t.forEach((h,y)=>{let w=this.device.createCommandEncoder(),T=w.beginRenderPass({colorAttachments:[{view:f,clearValue:{r:.91,g:.93,b:.94,a:1},loadOp:y===0?"clear":"load",storeOp:"store"}],depthStencilAttachment:this.depthAttachment()}),E=Rn(h.viewport,this.canvas.width,this.canvas.height);T.setViewport(E.x,E.y,E.width,E.height,0,1),T.setScissorRect(E.x,E.y,E.width,E.height),this.stencil&&T.setStencilReference(1),this.writeGlobals(h.matrix,a,h.layerId,r,s);let R=!l||!!(a||this.emphasizedNetIds.size),I=this.entries.filter(j=>this.visible(j,h.layerId,i,o,c,p,x,m)&&!(R&&j.boardRole==="paste")),_=I.filter(j=>!Ma(j)).sort((j,P)=>+!!j.stencilMark-+!!P.stencilMark),A=I.filter(j=>Ma(j)).sort((j,P)=>Ma(j)-Ma(P));for(let j of I)this.writeDraw(j,a,p,g,v,x,u.get(j.layerId),d?.get(j.layerId)??1);this.flushDraws(I),_.length>64?T.executeBundles([this.renderBundle(_,h.layerId)]):this.drawEntries(T,_),!x&&this.barrels&&(h.layerId===0||i.has(h.layerId))&&(this.writeBarrelDraw(v),T.setPipeline(this.barrelPipeline),T.setBindGroup(0,this.barrels.bindGroup),T.setVertexBuffer(0,this.barrels.vertexBuffer),T.setVertexBuffer(1,this.barrels.instanceBuffer),T.setIndexBuffer(this.barrels.indexBuffer,"uint16"),T.drawIndexed(this.barrels.indexCount,this.barrels.instanceCount)),this.drawBlended(T,A),T.end(),this.device.queue.submit([w.finish()])})}depthAttachment(){let t={view:this.depth.createView(),depthClearValue:0,depthLoadOp:"clear",depthStoreOp:"store"};return this.stencil&&Object.assign(t,{stencilClearValue:0,stencilLoadOp:"clear",stencilStoreOp:"discard"}),t}drawEntries(t,a){let s=null;for(let r of a){let n=r.stencilMark?this.markPipeline:this.pipeline;n!==s&&(t.setPipeline(n),s=n),this.drawEntry(t,r)}}drawEntry(t,a){t.setBindGroup(0,a.bindGroup),t.setVertexBuffer(0,a.vertexBuffer),t.setIndexBuffer(a.indexBuffer,"uint32"),t.drawIndexed(a.indexCount)}drawBlended(t,a){for(let s of a)s.boardRole==="soldermask"&&s.kind==="board"?(t.setPipeline(this.maskPipeline),this.drawEntry(t,s),this.coveredMaskPipeline&&(t.setPipeline(this.coveredMaskPipeline),this.drawEntry(t,s))):(t.setPipeline(this.blendPipeline),this.drawEntry(t,s))}setPlaceholdersVisible(t){this.showPlaceholders=!!t,this.invalidate()}visible(t,a,s,r,n,i,o=!1,c=null){return t.placeholder&&!this.showPlaceholders||t.kind==="board"&&t.boardRole==="pad"||!o&&t.kind==="copper"&&c&&!c.has(t.tileId)?!1:o?t.kind==="copper"&&s.has(t.layerId):t.boardRole==="paste"?a===0&&s.has(t.layerId):t.kind==="board"?a===0&&r:t.kind==="component"?a===0&&n&&i>.001:a?t.layerId===a:s.has(t.layerId)}writeGlobals(t,a,s,r,n=0){let i=this.globalScratch,o=this.globalScratchF32;o.fill(0),o.set(t,0);let c=this.globalScratchView;c.setUint32(64,a||0,!0),c.setUint32(68,s||0,!0),c.setFloat32(72,r,!0),c.setFloat32(76,a||this.emphasizedNetIds.size?1:0,!0),c.setUint32(80,n||0,!0),o.set([.35,-.5,.8,0],24),this.device.queue.writeBuffer(this.globalBuffer,0,i)}writeDraw(t,a,s,r=1,n=!1,i=!1,o=null,c=1){let l=this.drawStaging.subarray(t.drawSlot*It,(t.drawSlot+1)*It);l.fill(0);let p=t.color||t.material.baseColor;l.set(p,0),l.set([t.material.metallic||0,t.material.roughness??.72,t.opacityScale!=null?s:0,0],4);let g=$l(t);l.set([o?.[0]||0,o?.[1]||0,(i?-(t.baseZ||0):t.layerOffset||0)+g,0],8);let v=Number.isFinite(p?.[3])?p[3]:1,x=t.kind==="component"?s*(t.opacityScale??1):t.kind==="board"&&t.boardRole!=="paste"?r*Yl(t,v):c,u=t.kind==="copper"?1:t.kind==="component"?2:0;l.set([u,x,n?1:0,i?1:0],12)}writeBarrelDraw(t=!1){let a=this.barrelDrawScratch;a.fill(0),a.set(this.barrelColor,0),a.set([.75,.32,0,0],4),a.set([1,1,t?1:0,0],12),this.device.queue.writeBuffer(this.barrels.drawBuffer,0,a)}renderBundle(t,a){let s=`${a}:${t.map(o=>o.id).join(",")}`,r=this.bundleCache.get(s);if(r)return r;let n=this.device.createRenderBundleEncoder({colorFormats:[this.format],depthStencilFormat:this.depthFormat});this.drawEntries(n,t);let i=n.finish();return this.bundleCache.set(s,i),this.bundleCache.size>32&&this.bundleCache.delete(this.bundleCache.keys().next().value),i}pick(t,a,s,r){let n=this.pickSerial.then(()=>this.performPick(t,a,s,r));return this.pickSerial=n.catch(()=>0),n}async performPick(t,a,s,r){this.resize();let n=Math.max(0,Math.min(this.canvas.width-1,Math.floor(a))),i=Math.max(0,Math.min(this.canvas.height-1,Math.floor(s)));this.writeGlobals(t.matrix,r.activeNetId,t.layerId,performance.now()/1e3,r.selectedFeatureId),this.device.queue.writeBuffer(this.layerOffsetBuffer,0,r.layerOffsets);let o=this.device.createCommandEncoder(),c=o.beginRenderPass({colorAttachments:[{view:this.pickTexture.createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}],depthStencilAttachment:this.depthAttachment()}),l=Rn(t.viewport,this.canvas.width,this.canvas.height);c.setViewport(l.x,l.y,l.width,l.height,0,1),c.setScissorRect(l.x,l.y,l.width,l.height),c.setPipeline(this.pickPipeline);let p=[];for(let v of this.entries)this.visible(v,t.layerId,r.visibleLayers,r.showBoard,r.showComponents,r.componentOpacity,r.compareMode,r.visibleTileIds)&&v.kind!=="board"&&(this.writeDraw(v,r.activeNetId,r.componentOpacity,r.boardOpacity,r.isolateNet,r.compareMode,r.compareOffsets?.get(v.layerId)),p.push(v));this.flushDraws(p);for(let v of p)this.drawEntry(c,v);!r.compareMode&&this.barrels&&(this.writeBarrelDraw(r.isolateNet),c.setPipeline(this.barrelPickPipeline),c.setBindGroup(0,this.barrels.bindGroup),c.setVertexBuffer(0,this.barrels.vertexBuffer),c.setVertexBuffer(1,this.barrels.instanceBuffer),c.setIndexBuffer(this.barrels.indexBuffer,"uint16"),c.drawIndexed(this.barrels.indexCount,this.barrels.instanceCount)),c.end();let g=this.device.createBuffer({label:"pick-readback",size:256,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});o.copyTextureToBuffer({texture:this.pickTexture,origin:{x:n,y:i}},{buffer:g,bytesPerRow:256},{width:1,height:1}),this.device.queue.submit([o.finish()]);try{await g.mapAsync(GPUMapMode.READ);let v=new DataView(g.getMappedRange()).getUint32(0,!0);return g.unmap(),v}finally{g.mapState==="mapped"&&g.unmap(),g.destroy()}}};function Ma(e){return e.translucent?3:e.kind!=="board"?0:e.boardRole==="soldermask"?1:e.boardRole==="silkscreen"?2:0}function Yl(e,t){return e.kind!=="board"||e.boardRole==="substrate"?1:e.boardRole==="soldermask"?Math.min(t,.72):e.boardRole==="silkscreen"?Math.min(t,.92):t}function $l(e){if(e.kind!=="board"||e.boardRole!=="soldermask"&&e.boardRole!=="silkscreen")return 0;let t=e.bounds,s=(t?(t[2]+t[5])*.5:0)<0?-1:1,r=e.boardRole==="silkscreen"?35e-6:18e-6;return s*r}function Rn(e,t,a){let s=Math.max(0,Math.min(t-1,Math.floor(e.x))),r=Math.max(0,Math.min(a-1,Math.floor(e.y)));return{x:s,y:r,width:Math.max(1,Math.min(t-s,Math.floor(e.width))),height:Math.max(1,Math.min(a-r,Math.floor(e.height)))}}var Ql=`
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
}`,Zl=`
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
}`,ef=`
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
}`,tf=`
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
}`,af=`
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
}`,sf=`
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
}`,rf=`
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
}`,nf=6.2,of=4.6,cf=3.8,Aa=4*1024*1024,df=Math.floor(Aa/6),In=df*6,Ia=512*1024,An=512*1024,Sn=96,lf=96,ff=18,_n=96*1024*1024,uf=2,Na=class e{static async create(t,a){if(!navigator.gpu)throw new Error("WebGPU is unavailable in this browser");let s=await navigator.gpu.requestAdapter({powerPreference:"high-performance"});if(!s)throw new Error("No WebGPU adapter is available");let r=await s.requestDevice(),n=await fetch(a,{cache:"default"});if(!n.ok)throw new Error(`Failed to load schematic manifest: ${n.status}`);let i=await n.json();if(!["prism.schematic_world_a0","prism.schematic_vector_a0"].includes(i.schema))throw new Error(`Unsupported schematic scene schema: ${i.schema}`);let o=i.featureTable||i.features,c=await fetch(new URL(o,a),{cache:"default"});if(!c.ok)throw new Error(`Failed to load schematic features: ${c.status}`);let l=bf(await c.json());return new e(t,r,a,i,l)}constructor(t,a,s,r,n){this.canvas=t,this.device=a,this.manifestUrl=s,this.manifest=r,this.isNativeScene=r.schema==="prism.schematic_vector_a0",this.pages=r.pages||[],this.featuresByPage=n,this.featuresById=new Map;for(let x of Object.values(n))for(let u of x)this.featuresById.set(Number(u.id),u);this.context=t.getContext("webgpu"),this.format=navigator.gpu.getPreferredCanvasFormat(),this.context.configure({device:a,format:this.format,alphaMode:"opaque"}),this.flowCanvas=null,this.flowContext=null,this.globalBuffer=a.createBuffer({size:48,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.bindGroupLayout=a.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:2,visibility:GPUShaderStage.FRAGMENT,sampler:{type:"filtering"}},{binding:3,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:"float"}}]});let i=a.createShaderModule({code:Ql});this.pagePipeline=a.createRenderPipeline({layout:a.createPipelineLayout({bindGroupLayouts:[this.bindGroupLayout]}),vertex:{module:i,entryPoint:"vs"},fragment:{module:i,entryPoint:"fs",targets:[{format:this.format}]},primitive:{topology:"triangle-list"}}),this.edgeLayout=a.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}}]});let o=a.createShaderModule({code:Zl});this.edgePipeline=a.createRenderPipeline({layout:a.createPipelineLayout({bindGroupLayouts:[this.edgeLayout]}),vertex:{module:o,entryPoint:"vs",buffers:[{arrayStride:8,attributes:[{shaderLocation:0,offset:0,format:"float32x2"}]}]},fragment:{module:o,entryPoint:"fs",targets:[{format:this.format,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"line-list"}}),this.edgeBindGroup=a.createBindGroup({layout:this.edgeLayout,entries:[{binding:0,resource:{buffer:this.globalBuffer}}]});let c=a.createShaderModule({code:ef});this.highlightPipeline=a.createRenderPipeline({layout:a.createPipelineLayout({bindGroupLayouts:[this.edgeLayout]}),vertex:{module:c,entryPoint:"vs",buffers:[{arrayStride:8,attributes:[{shaderLocation:0,offset:0,format:"float32x2"}]}]},fragment:{module:c,entryPoint:"fs",targets:[{format:this.format,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"line-list"}}),this.highlightBufferSize=4*1024*1024,this.highlightBuffer=a.createBuffer({size:this.highlightBufferSize,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});let l=a.createShaderModule({code:tf});this.netFlowPipeline=a.createRenderPipeline({layout:a.createPipelineLayout({bindGroupLayouts:[this.edgeLayout]}),vertex:{module:l,entryPoint:"vs",buffers:[{arrayStride:16,attributes:[{shaderLocation:0,offset:0,format:"float32x2"},{shaderLocation:1,offset:8,format:"float32x2"}]}]},fragment:{module:l,entryPoint:"fs",targets:[{format:this.format,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"triangle-list"}}),this.netFlowBuffer=a.createBuffer({size:An*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),this.globalUniformScratch=new Float32Array(12),this.pageUniformScratch=new Float32Array(8),this.imageUniformScratch=new Float32Array(8),this.vectorScratch=new Float32Array(Aa),this.highlightScratch=new Float32Array(this.highlightBufferSize/4),this.netFlowScratch=new Float32Array(An),this.netTrackingCache=null,this.selectedIntrasheetLinkIndex=-1,this.truncatedHighlightCount=0,this.truncatedVectorCount=0,this.frameSerial=0,this.querySerial=0;let p=a.createShaderModule({code:af});this.vectorPipeline=a.createRenderPipeline({layout:a.createPipelineLayout({bindGroupLayouts:[this.edgeLayout]}),vertex:{module:p,entryPoint:"vs",buffers:[{arrayStride:24,attributes:[{shaderLocation:0,offset:0,format:"float32x2"},{shaderLocation:1,offset:8,format:"float32x4"}]}]},fragment:{module:p,entryPoint:"fs",targets:[{format:this.format,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"triangle-list"}}),this.vectorBuffer=a.createBuffer({size:Aa*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),this.vectorBuffers=[this.vectorBuffer];let g=a.createShaderModule({code:sf});this.imagePipeline=a.createRenderPipeline({layout:a.createPipelineLayout({bindGroupLayouts:[this.bindGroupLayout]}),vertex:{module:g,entryPoint:"vs"},fragment:{module:g,entryPoint:"fs",targets:[{format:this.format,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"triangle-list"}});let v=a.createShaderModule({code:rf});this.pickPipeline=a.createRenderPipeline({layout:a.createPipelineLayout({bindGroupLayouts:[this.edgeLayout]}),vertex:{module:v,entryPoint:"vs",buffers:[{arrayStride:12,attributes:[{shaderLocation:0,offset:0,format:"float32x2"},{shaderLocation:1,offset:8,format:"uint32"}]}]},fragment:{module:v,entryPoint:"fs",targets:[{format:"r32uint"}]},primitive:{topology:"triangle-list"}}),this.pickVertexBuffer=a.createBuffer({size:Ia*12,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),this.pickReadBuffer=a.createBuffer({size:256,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST}),this.pickTexture=null,this.pickTextureSize=[0,0],this.pickPending=!1,this.vectorChunks=new Map,this.failedVectorChunks=new Map,this.nativeDetailState=new Map,this.domDetailPageIds=new Set,this.nativeDetailThresholds=new Map,this.residentVectorBytes=0,this.sampler=a.createSampler({magFilter:"linear",minFilter:"linear",mipmapFilter:"linear"}),this.placeholder=this.createSolidTexture([245,247,249,255]),this.pageResources=new Map,this.imageResources=new Map,this.loading=new Map,this.selectedPageId="",this.selectedFeatureId=0,this.activeNetUid="",this.showHierarchy=!0,this.downloadedBytes=0,this.world=r.worldBoundsMm,this.center=[(this.world.minX+this.world.maxX)/2,(this.world.minY+this.world.maxY)/2],this.scale=Math.max((this.world.maxX-this.world.minX)/900,(this.world.maxY-this.world.minY)/650,.1)*1.16,this.edgeBuffer=this.createEdgeBuffer();for(let x of this.pages)this.createPageResource(x)}createSolidTexture(t){let a=this.device.createTexture({size:[1,1],format:"rgba8unorm-srgb",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});return this.device.queue.writeTexture({texture:a},new Uint8Array(t),{bytesPerRow:4},[1,1]),a}createPageResource(t){let a=this.device.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),s={page:t,uniform:a,texture:this.placeholder,textureWidth:0,svgBlob:null,bindGroup:null};this.pageResources.set(t.id,s),this.updateBindGroup(s)}createImageResource(t){let a=this.device.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),s={path:t,uniform:a,texture:this.placeholder,loaded:!1,bindGroup:null};return this.imageResources.set(t,s),this.updateBindGroup(s),s}updateBindGroup(t){t.bindGroup=this.device.createBindGroup({layout:this.bindGroupLayout,entries:[{binding:0,resource:{buffer:this.globalBuffer}},{binding:1,resource:{buffer:t.uniform}},{binding:2,resource:this.sampler},{binding:3,resource:t.texture.createView()}]})}async loadImageTexture(t){let a=this.imageResources.get(t)||this.createImageResource(t);if(a.loaded)return a;let s=`image:${t}`;if(this.loading.has(s))return this.loading.get(s);let r=(async()=>{try{let n=await fetch(new URL(t,this.manifestUrl),{cache:"default"});if(!n.ok)throw new Error(`Failed to load schematic image ${t}: ${n.status}`);let i=await n.blob(),o=await createImageBitmap(i),c=this.device.createTexture({size:[o.width,o.height],format:"rgba8unorm-srgb",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});this.device.queue.copyExternalImageToTexture({source:o},{texture:c},[o.width,o.height]),o.close(),a.texture!==this.placeholder&&a.texture.destroy(),a.texture=c,a.loaded=!0,this.updateBindGroup(a)}finally{this.loading.delete(s)}return a})();return this.loading.set(s,r),r}createEdgeBuffer(){let t=new Map(this.pages.map(n=>[n.id,n])),a=[];for(let n of this.manifest.edges||[]){let i=t.get(n.source),o=t.get(n.target);!i||!o||a.push(i.worldX+i.widthMm/2,i.worldY+i.heightMm,o.worldX+o.widthMm/2,o.worldY)}let s=new Float32Array(a);if(!s.length)return null;let r=this.device.createBuffer({size:s.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});return this.device.queue.writeBuffer(r,0,s),{buffer:r,count:s.length/2}}resize(){let t=Math.min(devicePixelRatio||1,2),a=Math.max(1,Math.floor(this.canvas.clientWidth*t)),s=Math.max(1,Math.floor(this.canvas.clientHeight*t));(this.canvas.width!==a||this.canvas.height!==s)&&(this.canvas.width=a,this.canvas.height=s),this.flowCanvas&&(this.flowCanvas.width!==a||this.flowCanvas.height!==s)&&(this.flowCanvas.width=a,this.flowCanvas.height=s)}setFlowOverlayCanvas(t){t&&(this.flowCanvas=t,this.flowContext=t.getContext("webgpu"),this.flowContext.configure({device:this.device,format:this.format,alphaMode:"premultiplied"}))}writeGlobals(){let t=this.globalUniformScratch;t[0]=this.center[0],t[1]=this.center[1],t[2]=this.scale,t[3]=performance.now()*.001,t[4]=this.canvas.width,t[5]=this.canvas.height,this.device.queue.writeBuffer(this.globalBuffer,0,t)}pagePixelWidth(t){return t.widthMm/this.scale}pageSourcePixelsPerMm(t){let a=this.pagePixelWidth(t)/Math.max(1,t.sourceWidthMm||t.widthMm),s=t.heightMm/this.scale/Math.max(1,t.sourceHeightMm||t.heightMm);return Math.min(a,s)}pageNativeDetailThresholds(t){let a=this.nativeDetailThresholds.get(t.id);if(a)return a;let s=Math.max(1,t.sourceWidthMm||t.widthMm),r=Math.max(1,t.sourceHeightMm||t.heightMm),n=s*r,i=Math.max(0,t.featureCount||t.featureIds?.length||0)/Math.max(1,n),o=ne(1-i*72,.84,1.08),c=ne(Math.sqrt(Math.max(s,r)/Math.max(1,Math.min(s,r)))/1.18,.92,1.14),l=ne(nf*o*c,5,7.4),p={enter:l,exit:ne(Math.min(l-1.2,of*o),3.8,l-.7),prefetch:ne(Math.min(l-2,cf*o),3,l-1)};return this.nativeDetailThresholds.set(t.id,p),p}pageWantsNativeDetail(t){if(!this.pageHasNativeDetail(t))return!1;let a=this.pageSourcePixelsPerMm(t),s=this.nativeDetailState.get(t.id)===!0,r=this.pageNativeDetailThresholds(t),n=s?r.exit:r.enter,i=a>=n;return i!==s&&this.nativeDetailState.set(t.id,i),i}pageNativeDetailReady(t){if(this.domDetailPageIds.has(t.id)||!this.pageWantsNativeDetail(t))return!1;let a=this.vectorChunks.get(t.id);return!a?.loaded||!a.segments?.length&&!a.fills?.length?!1:this.visibleNativeImagesReady(t,a)}visibleNativeImagesReady(t,a){if(!a?.images?.length)return!0;let s=this.sourceViewportBounds(t,4),r=!0;for(let n of a.images){if(!qe(n.bounds,s))continue;(this.imageResources.get(n.path)||this.createImageResource(n.path)).loaded||(r=!1,this.loadImageTexture(n.path).catch(()=>{}))}return r}visiblePages(){let t=this.canvas.width*this.scale/2,a=this.canvas.height*this.scale/2,s=this.center[0]-t,r=this.center[0]+t,n=this.center[1]-a,i=this.center[1]+a;return this.pages.filter(o=>o.worldX+o.widthMm>=s&&o.worldX<=r&&o.worldY+o.heightMm>=n&&o.worldY<=i)}worldViewportBounds(t=0){let a=this.canvas.width*this.scale/2,s=this.canvas.height*this.scale/2;return[this.center[0]-a-t,this.center[1]-s-t,this.center[0]+a+t,this.center[1]+s+t]}sourceViewportBounds(t,a=2.5){let s=this.worldViewportBounds(this.scale*8),r=(s[0]-t.worldX)/t.widthMm*t.sourceWidthMm-a,n=(s[1]-t.worldY)/t.heightMm*t.sourceHeightMm-a,i=(s[2]-t.worldX)/t.widthMm*t.sourceWidthMm+a,o=(s[3]-t.worldY)/t.heightMm*t.sourceHeightMm+a;return[Math.max(-a,Math.min(r,i)),Math.max(-a,Math.min(n,o)),Math.min(t.sourceWidthMm+a,Math.max(r,i)),Math.min(t.sourceHeightMm+a,Math.max(n,o))]}render(){this.frameSerial+=1,this.resize(),this.writeGlobals();let t=this.visiblePages(),a=this.device.createCommandEncoder(),s=a.beginRenderPass({colorAttachments:[{view:this.context.getCurrentTexture().createView(),clearValue:{r:.045,g:.055,b:.073,a:1},loadOp:"clear",storeOp:"store"}]});this.showHierarchy&&this.edgeBuffer&&(s.setPipeline(this.edgePipeline),s.setBindGroup(0,this.edgeBindGroup),s.setVertexBuffer(0,this.edgeBuffer.buffer),s.draw(this.edgeBuffer.count)),s.setPipeline(this.pagePipeline);for(let i of t){let o=this.pageResources.get(i.id),c=this.activeNetUid&&i.netUids.includes(this.activeNetUid),l=this.domDetailPageIds.has(i.id),p=!l&&this.pageNativeDetailReady(i),g=this.pageUniformScratch;g[0]=i.worldX,g[1]=i.worldY,g[2]=i.widthMm,g[3]=i.heightMm,g[4]=i.id===this.selectedPageId?1:0,g[5]=c?1:0,g[6]=this.activeNetUid?1:0,g[7]=p||l?1:0,this.device.queue.writeBuffer(o.uniform,0,g),s.setBindGroup(0,o.bindGroup),s.draw(6);let v=ne(Math.ceil(this.pagePixelWidth(i)*1.3/512)*512,512,6144);o.textureWidth<v*.82&&this.loadPageTexture(i,v).catch(()=>{})}this.scheduleVisibleVectorLoads(t),this.drawVisibleImages(s,t),this.drawVisibleVectors(s,t);let r=this.writeNetTrackingOverlay();r&&!this.flowContext&&(s.setPipeline(this.netFlowPipeline),s.setBindGroup(0,this.edgeBindGroup),s.setVertexBuffer(0,this.netFlowBuffer),s.draw(r));let n=this.writeNetHighlights(t);return n&&(s.setPipeline(this.highlightPipeline),s.setBindGroup(0,this.edgeBindGroup),s.setVertexBuffer(0,this.highlightBuffer),s.draw(n)),s.end(),this.device.queue.submit([a.finish()]),this.renderFlowOverlay(r),this.evictVectorChunks(t),t}renderFlowOverlay(t){if(!this.flowContext)return;let a=this.device.createCommandEncoder(),s=a.beginRenderPass({colorAttachments:[{view:this.flowContext.getCurrentTexture().createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}]});t&&(s.setPipeline(this.netFlowPipeline),s.setBindGroup(0,this.edgeBindGroup),s.setVertexBuffer(0,this.netFlowBuffer),s.draw(t)),s.end(),this.device.queue.submit([a.finish()])}drawVisibleImages(t,a){if(!this.isNativeScene)return;let s=!1;for(let r of a){if(this.domDetailPageIds.has(r.id)||!this.pageNativeDetailReady(r))continue;let n=this.vectorChunks.get(r.id);if(!n?.images?.length)continue;let i=this.sourceViewportBounds(r,4);for(let o of n.images){if(!qe(o.bounds,i))continue;let c=this.imageResources.get(o.path)||this.createImageResource(o.path);c.loaded||this.loadImageTexture(o.path).catch(()=>{});let l=o.worldOrigin||this.sourceToWorld(r,[o.xMm,o.yMm]),p=o.worldSize||this.sourceSizeToWorld(r,o.widthMm,o.heightMm),g=this.imageUniformScratch;g[0]=l[0],g[1]=l[1],g[2]=p[0],g[3]=p[1],g[4]=0,g[5]=0,g[6]=0,g[7]=0,this.device.queue.writeBuffer(c.uniform,0,g),s||(t.setPipeline(this.imagePipeline),s=!0),t.setBindGroup(0,c.bindGroup),t.draw(6)}}}drawVisibleVectors(t,a){if(!this.isNativeScene)return 0;let s=this.vectorScratch,r=0,n=0,i=0,o=0,c=!1,l=()=>{if(!r)return;let g=this.vectorBuffers[o];g||(g=this.device.createBuffer({size:Aa*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),this.vectorBuffers.push(g)),this.device.queue.writeBuffer(g,0,s,0,r),c||(t.setPipeline(this.vectorPipeline),t.setBindGroup(0,this.edgeBindGroup),c=!0);let v=Math.floor(r/6);t.setVertexBuffer(0,g),t.draw(v),i+=v,o+=1,r=0},p=g=>g>In||g>s.length?(n+=1,!1):((r+g>In||r+g>s.length)&&l(),!0);for(let g of a){if(this.domDetailPageIds.has(g.id)||!this.pageHasNativeDetail(g))continue;let v=this.vectorChunks.get(g.id);if(!v?.segments?.length&&!v?.fills?.length||!this.pageNativeDetailReady(g))continue;v.lastUsedFrame=this.frameSerial;let x=this.sourceViewportBounds(g),u=jn(v.spatial,x);for(let d of u.fills){if(!qe(d.bounds,x)||!p(18))continue;let m=this.featuresById.get(d.featureId),f=this.activeNetUid&&m?.netUid===this.activeNetUid,y=this.selectedFeatureId===d.featureId?[.24,.58,1,1]:f?[.06,1,.24,1]:this.activeNetUid&&zt(m)?On(m,d.kind,d.color):js(m,d.kind,d.color),w=d.worldPoints||d.points.map(T=>this.sourceToWorld(g,T));r=Nf(s,r,w[0],w[1],w[2],y)}for(let d of u.segments){if(!qe(d.bounds,x))continue;let m=this.featuresById.get(d.featureId),f=this.activeNetUid&&m?.netUid===this.activeNetUid,h=this.selectedFeatureId===d.featureId,y=h?[.24,.58,1,1]:f?[.06,1,.24,1]:this.activeNetUid&&zt(m)?On(m,d.kind,d.color):js(m,d.kind,d.color),w=this.segmentWorldWidth(g,d,m,f||h);for(let T of this.visibleSegmentParts(g,d,m)){if(!p(36))continue;let E=T.worldA||this.sourceToWorld(g,T.a),R=T.worldB||this.sourceToWorld(g,T.b);r=_f(s,r,E,R,w,y)}}}return l(),this.truncatedVectorCount=n,this.vectorTruncated=n>0,this.lastVectorVertices=i,this.lastVectorChunks=o,i}pageHasNativeDetail(t){return this.isNativeScene?t?.nativeDetail?.enabled!==!1:!1}scheduleVisibleVectorLoads(t){if(!this.isNativeScene)return;let a=[...this.vectorChunks.values()].filter(n=>n?.promise&&!n.loaded).length,s=Math.max(0,uf-a);if(!s)return;let r=t.filter(n=>!this.domDetailPageIds.has(n.id)).filter(n=>this.pageHasNativeDetail(n)&&this.pageSourcePixelsPerMm(n)>=this.pageNativeDetailThresholds(n).prefetch).filter(n=>!this.vectorChunks.get(n.id)?.loaded&&!this.vectorChunks.get(n.id)?.promise).sort((n,i)=>{let o=Math.hypot(n.worldX+n.widthMm/2-this.center[0],n.worldY+n.heightMm/2-this.center[1]),c=Math.hypot(i.worldX+i.widthMm/2-this.center[0],i.worldY+i.heightMm/2-this.center[1]);return o-c});for(let n of r)if(this.loadPageVectors(n).catch(()=>{}),s-=1,!s)break}featurePrimitiveBounds(t,a){let s=this.vectorChunks.get(t.id);if(!s?.segments?.length&&!s?.fills?.length)return null;let r=[],n=[];for(let i of s.segments||[])i.featureId===a&&(r.push(i.a[0],i.b[0]),n.push(i.a[1],i.b[1]));for(let i of s.fills||[])if(i.featureId===a)for(let o of i.points||[])r.push(o[0]),n.push(o[1]);return r.length?[Math.min(...r),Math.min(...n),Math.max(...r),Math.max(...n)]:null}symbolClipBounds(t){if(this._symbolClipBounds||(this._symbolClipBounds=new Map),this._symbolClipBounds.has(t.id))return this._symbolClipBounds.get(t.id);let a=(this.featuresByPage[t.id]||[]).filter(s=>s?.kind==="symbol_body"&&s.boundsMm&&!String(s.sourceId||"").includes(":overplot")).map(s=>{let r=this.featurePrimitiveBounds(t,s.id)||s.boundsMm;return[r[0]-.02,r[1]-.02,r[2]+.02,r[3]+.02]}).filter(s=>{let r=s[2]-s[0],n=s[3]-s[1];return Math.max(r,n)<=12&&r*n<=80});return this._symbolClipBounds.set(t.id,a),a}visibleSegmentParts(t,a,s){if(a._visibleParts)return a._visibleParts;let r=String(s?.kind||""),n=String(s?.semanticRole||"");if(r!=="wire"&&n!=="wire")return a._visibleParts=[a],a._visibleParts;let i=[a];for(let o of this.symbolClipBounds(t)){let c=[];for(let l of i)c.push(...Cf(l,o));if(i=c,!i.length)break}for(let o of i)o.worldA=St(t,o.a),o.worldB=St(t,o.b);return a._visibleParts=i,a._visibleParts}netTrackingSegments(){if(!this.activeNetUid)return{netUid:"",anchorsByPage:new Map,segments:[],intrasheetSegments:[]};let t=Number(this.selectedFeatureId||0),a=String(this.selectedFeatureKey||""),s=String(this.selectedSourceId||"");if(this.netTrackingCache?.netUid===this.activeNetUid&&this.netTrackingCache?.selectedFeatureId===t&&this.netTrackingCache?.selectedFeatureKey===a&&this.netTrackingCache?.selectedSourceId===s)return this.netTrackingCache;this.selectedIntrasheetLinkIndex=-1;let r=new Map(this.pages.map(u=>[u.id,u])),n=this.manifest.netToPages?.[this.activeNetUid]||[],i=n.length?n.map(u=>r.get(u)).filter(Boolean):this.pages.filter(u=>u.netUids?.includes(this.activeNetUid)),o=new Map;for(let u of i.slice(0,lf)){let d=this.netTrackingAnchorsForPage(u);d.length&&o.set(u.id,d)}let c=[],l=[];for(let[u,d]of o){let m=Cn(Rf(d),"intrasheet",u);c.push(...m),l.push(...m)}let p=[...o.entries()].map(([u,d])=>If(r.get(u),d,{featureId:t,stableKey:a,sourceId:s})).filter(Boolean);c.push(...Cn(p,"intersheet",""));let g=l.map((u,d)=>({...u,intrasheetIndex:d})),v=0,x=c.map((u,d)=>{if(u.type!=="intrasheet")return{...u,id:d};let m=v;return v+=1,{...u,id:d,intrasheetIndex:m}});return this.netTrackingCache={netUid:this.activeNetUid,selectedFeatureId:t,selectedFeatureKey:a,selectedSourceId:s,anchorsByPage:o,segments:x,intrasheetSegments:g},this.selectedIntrasheetLinkIndex>=this.netTrackingCache.intrasheetSegments.length&&(this.selectedIntrasheetLinkIndex=-1),this.netTrackingCache}netTrackingAnchorsForPage(t){let a=this.featuresByPage[t.id]||[],s=[];for(let r of a){if(r.netUid!==this.activeNetUid||!r.boundsMm||!kf(r))continue;let n=r.boundsMm,i=[(n[0]+n[2])/2,(n[1]+n[3])/2],o=this.sourceToWorld(t,i);s.push({pageId:t.id,featureId:Number(r.id||0),stableKey:String(r.stableKey||""),sourceId:String(r.sourceId||r.sourceUid||r.objectId||""),kind:r.kind||r.semanticRole||"",source:i,world:o,bounds:n,priority:Mf(r)})}return s.sort((r,n)=>n.priority-r.priority||r.source[1]-n.source[1]||r.source[0]-n.source[0]),s}writeNetTrackingOverlay(){let t=this.netTrackingSegments();if(this.lastNetFlowSegments=t.segments.length,this.lastNetFlowIntrasheetSegments=t.intrasheetSegments.length,!t.segments.length)return this.lastNetFlowVertices=0,0;let a=this.worldViewportBounds(this.scale*96),s=this.netFlowScratch,r=0,n=0;for(let i of t.segments){if(!qe(Bn(i),a))continue;let o=i.type==="intrasheet"&&i.intrasheetIndex===this.selectedIntrasheetLinkIndex,c=o?9.5:i.type==="intersheet"?8:4.8,l=o?2:i.type==="intersheet"?1:0,p=jf(s,r,i.a,i.b,c*this.scale,l,n,this.scale);if(p!==r&&(r=p,n+=Math.hypot(i.b[0]-i.a[0],i.b[1]-i.a[1])/Math.max(this.scale,1e-6),r+24>s.length))break}return r?(this.device.queue.writeBuffer(this.netFlowBuffer,0,s,0,r),this.lastNetFlowVertices=r/4,r/4):(this.lastNetFlowVertices=0,0)}cycleNetIntrasheetLink(t=1){let a=this.netTrackingSegments();if(!a.intrasheetSegments.length)return null;let s=a.intrasheetSegments.length;this.selectedIntrasheetLinkIndex=(this.selectedIntrasheetLinkIndex+t+s)%s;let r=a.intrasheetSegments[this.selectedIntrasheetLinkIndex];if(!r)return null;let n=Bn(r,14*this.scale);return this.center=[(n[0]+n[2])/2,(n[1]+n[3])/2],this.scale=Math.max((n[2]-n[0])/Math.max(1,this.canvas.width*.36),(n[3]-n[1])/Math.max(1,this.canvas.height*.3),this.scale*.35,.025),{pageId:r.pageId,segment:r}}writeNetHighlights(t){if(!this.activeNetUid)return 0;let a=this.highlightScratch,s=0,r=0;for(let n of t){let i=this.sourceViewportBounds(n,5);for(let o of this.featuresByPage[n.id]||[]){if(o.netUid!==this.activeNetUid||!o.boundsMm||!qe(o.boundsMm,i))continue;let c=this.featureWorldBounds(n,o.boundsMm);if(s+16>a.length){r+=1;continue}a[s++]=c[0],a[s++]=c[1],a[s++]=c[2],a[s++]=c[1],a[s++]=c[2],a[s++]=c[1],a[s++]=c[2],a[s++]=c[3],a[s++]=c[2],a[s++]=c[3],a[s++]=c[0],a[s++]=c[3],a[s++]=c[0],a[s++]=c[3],a[s++]=c[0],a[s++]=c[1]}}return this.truncatedHighlightCount=r,s?(this.device.queue.writeBuffer(this.highlightBuffer,0,a,0,s),s/2):0}featureWorldBounds(t,a){return[t.worldX+a[0]/t.sourceWidthMm*t.widthMm,t.worldY+a[1]/t.sourceHeightMm*t.heightMm,t.worldX+a[2]/t.sourceWidthMm*t.widthMm,t.worldY+a[3]/t.sourceHeightMm*t.heightMm]}sourceToWorld(t,a){return[t.worldX+a[0]/t.sourceWidthMm*t.widthMm,t.worldY+a[1]/t.sourceHeightMm*t.heightMm]}sourceSizeToWorld(t,a,s){return[a/t.sourceWidthMm*t.widthMm,s/t.sourceHeightMm*t.heightMm]}async loadPageVectors(t){if(!this.pageHasNativeDetail(t)||!t.chunks?.lod2)return null;let a=this.vectorChunks.get(t.id);if(a?.loaded)return a;if(a?.promise)return a.promise;let s=(async()=>{try{let r=await fetch(new URL(t.chunks.lod2,this.manifestUrl));if(!r.ok)throw new Error(`Failed to load schematic vector chunk ${t.id}: ${r.status}`);let n=await r.json(),i=gf(n.primitives||[]);pf(t,i);let c=JSON.stringify(n).length,l={loaded:!0,segments:i.segments,fills:i.fills,images:i.images,spatial:Ef(i),unsupported:n.unsupported||[],bytes:c,lastUsedFrame:this.frameSerial};return this.vectorChunks.set(t.id,l),this.failedVectorChunks.delete(t.id),this.residentVectorBytes+=c,l}catch(r){let n=this.failedVectorChunks.get(t.id)||{count:0,message:""};throw this.failedVectorChunks.set(t.id,{count:n.count+1,message:r?.message||String(r)}),this.vectorChunks.delete(t.id),r}})();return this.vectorChunks.set(t.id,{loaded:!1,promise:s,segments:[]}),s}evictVectorChunks(t){if(this.residentVectorBytes<=_n)return;let a=new Set(t.map(r=>r.id)),s=[...this.vectorChunks.entries()].filter(([,r])=>r?.loaded).filter(([r])=>!a.has(r)&&r!==this.selectedPageId).sort((r,n)=>(r[1].lastUsedFrame||0)-(n[1].lastUsedFrame||0));for(let[r,n]of s)if(this.vectorChunks.delete(r),this.residentVectorBytes=Math.max(0,this.residentVectorBytes-(n.bytes||0)),this.residentVectorBytes<=_n*.82)break}stats(){let t=this.visiblePages(),a=t.map(r=>this.pageSourcePixelsPerMm(r)),s=t.map(r=>this.pageNativeDetailThresholds(r).enter);return{residentVectorBytes:this.residentVectorBytes,vectorChunks:[...this.vectorChunks.values()].filter(r=>r?.loaded).length,vectorLoads:[...this.vectorChunks.values()].filter(r=>r?.promise&&!r.loaded).length,failedVectorChunks:this.failedVectorChunks.size,vectorVertices:this.lastVectorVertices||0,vectorDrawChunks:this.lastVectorChunks||0,truncatedVectors:this.truncatedVectorCount||0,nativeDetailPages:[...this.nativeDetailState.values()].filter(Boolean).length,nativePxPerMm:Number((Math.max(0,...a)||0).toFixed(2)),nativeThresholdPxPerMm:Number((s.length?Math.min(...s):0).toFixed(2)),domDetailPages:this.domDetailPageIds.size,netFlowSegments:this.lastNetFlowSegments||0,netFlowIntrasheetSegments:this.lastNetFlowIntrasheetSegments||0,netFlowVertices:this.lastNetFlowVertices||0}}setDomDetailPageIds(t){this.domDetailPageIds=new Set(t||[])}async loadPageTexture(t,a){let s=`${t.id}:${a}`;if(this.loading.has(s))return this.loading.get(s);let r=this.pageResources.get(t.id);if(!r||r.textureWidth>=a)return;let n=(async()=>{if(!r.svgBlob){let c=await fetch(new URL(hf(t),this.manifestUrl));if(!c.ok)throw new Error(`Failed to load schematic page ${t.name}: ${c.status}`);r.svgBlob=await c.blob(),this.downloadedBytes+=r.svgBlob.size}let i=r.svgBlob,o=URL.createObjectURL(i);try{let c=new Image;if(c.decoding="async",c.src=o,await c.decode(),r.textureWidth>=a)return;let l=Math.max(64,Math.round(a*t.heightMm/t.widthMm)),p=new OffscreenCanvas(a,l),g=p.getContext("2d",{alpha:!1});g.fillStyle="#ffffff",g.fillRect(0,0,a,l),g.drawImage(c,0,0,a,l);let v=await createImageBitmap(p),x=this.device.createTexture({size:[a,l],format:"rgba8unorm-srgb",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});this.device.queue.copyExternalImageToTexture({source:v},{texture:x},[a,l]),v.close(),r.texture!==this.placeholder&&r.texture.destroy(),r.texture=x,r.textureWidth=a,this.updateBindGroup(r)}finally{URL.revokeObjectURL(o),this.loading.delete(s)}})();return this.loading.set(s,n),n}preloadOverview(){let t=[...this.pages],a=async()=>{for(;t.length;){let s=t.shift();await this.loadPageTexture(s,512).catch(()=>{})}};return Promise.all(Array.from({length:Math.min(4,t.length)},a))}screenToWorld(t,a){let s=this.canvas.getBoundingClientRect(),r=(t-s.left)*this.canvas.width/s.width,n=(a-s.top)*this.canvas.height/s.height;return[this.center[0]+(r-this.canvas.width/2)*this.scale,this.center[1]+(n-this.canvas.height/2)*this.scale]}worldToScreen(t,a){let s=this.canvas.clientWidth/this.canvas.width,r=this.canvas.clientHeight/this.canvas.height;return[((t-this.center[0])/this.scale+this.canvas.width/2)*s,((a-this.center[1])/this.scale+this.canvas.height/2)*r]}hitPage(t,a){let[s,r]=this.screenToWorld(t,a);return[...this.pages].reverse().find(n=>s>=n.worldX&&s<=n.worldX+n.widthMm&&r>=n.worldY&&r<=n.worldY+n.heightMm)||null}async pickFeature(t,a){if(!this.isNativeScene)return this.hitFeature(t,a);let s=this.hitPage(t,a);if(!s)return null;if(!this.pageHasNativeDetail(s))return this.hitFeature(t,a);await this.loadPageVectors(s);let r=await this.gpuPickFeature(s,t,a);return r&&!Vt(r)?{page:s,feature:r,source:this.clientToSource(s,t,a),native:!0,gpu:!0}:this.hitFeature(t,a)}hitFeature(t,a){let s=this.hitPage(t,a);if(!s)return null;let[r,n]=this.clientToSource(s,t,a),i=Math.max(.45,5*this.scale*this.canvas.width/Math.max(1,this.canvas.clientWidth)*s.sourceWidthMm/s.widthMm),o=this.hitResidentVectorFeature(s,r,n,i);if(o)return{page:s,feature:o,source:[r,n],native:!0};let c=this.hitSymbolInterior(s,r,n);if(c)return{page:s,feature:c,source:[r,n],native:!0,interior:!0};let l=(this.featuresByPage[s.id]||[]).filter(p=>{if(Vt(p))return!1;let g=p.boundsMm;return g&&r>=g[0]-i&&r<=g[2]+i&&n>=g[1]-i&&n<=g[3]+i}).map(p=>({feature:p,priority:Gt(p),area:Math.max(1e-4,(p.boundsMm[2]-p.boundsMm[0])*(p.boundsMm[3]-p.boundsMm[1]))})).sort((p,g)=>g.priority-p.priority||p.area-g.area);return{page:s,feature:l[0]?.feature||null,source:[r,n]}}hitSymbolInterior(t,a,s){let r=null;for(let n of this.featuresByPage[t.id]||[]){let i=String(n?.kind||"");if(i!=="symbol_body"&&i!=="symbol_instance"||String(n?.sourceId||"").includes(":overplot"))continue;let o=n.boundsMm;if(!o||a<o[0]||a>o[2]||s<o[1]||s>o[3])continue;let c=Math.max(1e-4,(o[2]-o[0])*(o[3]-o[1])),l=(i==="symbol_body"?0:1e6)+c;(!r||l<r.score)&&(r={feature:n,score:l})}return r?.feature||null}clientToSource(t,a,s){let[r,n]=this.screenToWorld(a,s);return[(r-t.worldX)/t.widthMm*t.sourceWidthMm,(n-t.worldY)/t.heightMm*t.sourceHeightMm]}ensurePickTexture(){this.pickTexture&&this.pickTextureSize[0]===this.canvas.width&&this.pickTextureSize[1]===this.canvas.height||(this.pickTexture&&this.pickTexture.destroy(),this.pickTexture=this.device.createTexture({size:[this.canvas.width,this.canvas.height],format:"r32uint",usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC}),this.pickTextureSize=[this.canvas.width,this.canvas.height])}writePickVectors(t){let a=new ArrayBuffer(Ia*12),s=new DataView(a),r=0,n=[];for(let i of t){let o=this.vectorChunks.get(i.id);if(!o?.segments?.length&&!o?.fills?.length&&!o?.images?.length)continue;let c=this._pickSourcePointByPage?.get(i.id),l=c?[c[0]-2.5,c[1]-2.5,c[0]+2.5,c[1]+2.5]:[0,0,i.sourceWidthMm,i.sourceHeightMm],p=jn(o.spatial,l);for(let g of p.images){if(!qe(g.bounds,l))continue;let v=this.featuresById.get(g.featureId);!v||Vt(v)||n.push({page:i,image:g,feature:v,priority:Gt(v)-5})}for(let g of p.fills){if(!qe(g.bounds,l))continue;let v=this.featuresById.get(g.featureId);!v||Vt(v)||n.push({page:i,fill:g,feature:v,priority:Gt(v)-2})}for(let g of p.segments){if(!qe(g.bounds,l))continue;let v=this.featuresById.get(g.featureId);!v||Vt(v)||n.push({page:i,segment:g,feature:v,priority:Gt(v)})}}n.sort((i,o)=>i.priority-o.priority);for(let{page:i,segment:o,fill:c,image:l,feature:p}of n){if(r+6>Ia)break;if(l){let g=this.sourceToWorld(i,[l.xMm,l.yMm]),v=this.sourceToWorld(i,[l.xMm+l.widthMm,l.yMm]),x=this.sourceToWorld(i,[l.xMm,l.yMm+l.heightMm]),u=this.sourceToWorld(i,[l.xMm+l.widthMm,l.yMm+l.heightMm]);r=Ns(s,r,g,v,x,l.featureId),r=Ns(s,r,x,v,u,l.featureId)}else if(c){let g=c.worldPoints||c.points.map(v=>this.sourceToWorld(i,v));r=Ns(s,r,g[0],g[1],g[2],c.featureId)}else{let g=Math.max(this.segmentWorldWidth(i,o,p,!1),this.scale*7);for(let v of this.visibleSegmentParts(i,o,p)){if(r+6>Ia)break;let x=v.worldA||this.sourceToWorld(i,v.a),u=v.worldB||this.sourceToWorld(i,v.b);r=Bf(s,r,x,u,g,o.featureId)}}}return r?(this.device.queue.writeBuffer(this.pickVertexBuffer,0,a,0,r*12),r):0}async gpuPickFeature(t,a,s){if(this.pickPending)return null;let r=this.clientToSource(t,a,s);this._pickSourcePointByPage=new Map([[t.id,r]]);let n=this.writePickVectors([t]);if(this._pickSourcePointByPage=null,!n)return null;this.resize(),this.writeGlobals(),this.ensurePickTexture();let i=this.canvas.getBoundingClientRect(),o=Math.max(0,Math.min(this.canvas.width-1,Math.floor((a-i.left)*this.canvas.width/i.width))),c=Math.max(0,Math.min(this.canvas.height-1,Math.floor((s-i.top)*this.canvas.height/i.height))),l=this.device.createCommandEncoder(),p=l.beginRenderPass({colorAttachments:[{view:this.pickTexture.createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}]});p.setPipeline(this.pickPipeline),p.setBindGroup(0,this.edgeBindGroup),p.setVertexBuffer(0,this.pickVertexBuffer),p.draw(n),p.end(),l.copyTextureToBuffer({texture:this.pickTexture,origin:{x:o,y:c}},{buffer:this.pickReadBuffer,bytesPerRow:256,rowsPerImage:1},{width:1,height:1,depthOrArrayLayers:1}),this.pickPending=!0,this.device.queue.submit([l.finish()]);try{await this.pickReadBuffer.mapAsync(GPUMapMode.READ);let g=new DataView(this.pickReadBuffer.getMappedRange()).getUint32(0,!0);return this.pickReadBuffer.unmap(),g&&this.featuresById.get(g)||null}finally{this.pickReadBuffer.mapState==="mapped"&&this.pickReadBuffer.unmap(),this.pickPending=!1}}hitResidentVectorFeature(t,a,s,r){if(!this.isNativeScene)return null;let n=this.vectorChunks.get(t.id);if(!n?.loaded)return null;let i=null;for(let o of n.segments){let c=this.featuresById.get(o.featureId),l=Math.max(r,(o.widthMm||0)*.5+r*.45);if(c)for(let p of this.visibleSegmentParts(t,o,c)){let g=Ff([a,s],p.a,p.b);if(g>l)continue;let v=g-Gt(c)*.025+(zt(c)?0:8);(!i||v<i.score)&&(i={feature:c,score:v})}}return i?.feature||null}segmentWorldWidth(t,a,s,r){let n=(a.widthMm||.15)/Math.max(1,t.sourceWidthMm)*t.widthMm;return Math.max(n,this.scale*Sf(s,a.kind,r))}pan(t,a){let s=this.canvas.width/Math.max(1,this.canvas.clientWidth);this.center[0]-=t*this.scale*s,this.center[1]-=a*this.scale*s}zoom(t,a,s){let r=this.screenToWorld(a,s);this.scale=ne(this.scale*Math.exp(t*.0015),.015,16);let n=this.screenToWorld(a,s);this.center[0]+=r[0]-n[0],this.center[1]+=r[1]-n[1]}framePage(t){t&&(this.resize(),this.center=[t.worldX+t.widthMm/2,t.worldY+t.heightMm/2],this.scale=Math.max(t.widthMm/Math.max(1,this.canvas.width*.88),t.heightMm/Math.max(1,this.canvas.height*.84)))}frameWorld(){this.resize(),this.center=[(this.world.minX+this.world.maxX)/2,(this.world.minY+this.world.maxY)/2],this.scale=Math.max((this.world.maxX-this.world.minX)/Math.max(1,this.canvas.width*.9),(this.world.maxY-this.world.minY)/Math.max(1,this.canvas.height*.88),.05)}};function hf(e){return e.thumbnail?.path||e.svg}function bf(e){if(e.schema==="prism.schematic_vector_a0.features"){let t=new Map((e.features||[]).map(s=>[Number(s.id),s])),a={};for(let[s,r]of Object.entries(e.pages||{}))a[s]=r.map(n=>t.get(Number(n))).filter(Boolean);return a}return e.pages||{}}function gf(e){let t=[],a=[],s=[];for(let r of e){let n=Number(r.featureId||0);if(!n)continue;if(r.kind==="plotimage"&&r.image?.path){let h=r.xMm||0,y=r.yMm||0,w=r.widthMm||0,T=r.heightMm||0;s.push({featureId:n,kind:r.kind,xMm:h,yMm:y,widthMm:w,heightMm:T,bounds:[h,y,h+w,y+T],path:r.image.path});continue}let i=String(r.semanticRole||""),o=r.radiusMm||r.diameterMm/2||0,c=String(r.fill||"").toUpperCase()==="FILLED_SHAPE",l=r.widthMm||r.pen_widthMm||(i==="junction"?.08:.15),p=String(r.lineStyle||r.line_style||"DEFAULT").toUpperCase(),g=r.color||r.strokeColor||r.style?.color||"",v=r.fillColor||r.color||r.style?.color||"",x=(h,y)=>vf(t,{featureId:n,kind:r.kind,widthMm:l,lineStyle:p,color:g},h,y),u=r.x1Mm,d=r.y1Mm,m=r.x2Mm,f=r.y2Mm;if(r.trianglesMm?.length){for(let h of r.trianglesMm)Array.isArray(h)&&h.length===3&&a.push({featureId:n,kind:r.kind,color:v,points:h,bounds:Pn(h)});if(r.pointsMm?.length>=2){for(let h=1;h<r.pointsMm.length;h+=1)x(r.pointsMm[h-1],r.pointsMm[h]);Fn(r)&&x(r.pointsMm[r.pointsMm.length-1],r.pointsMm[0])}}else if(r.pointsMm?.length>=2){c&&r.pointsMm.length>=3&&wf(a,n,r.kind,r.pointsMm,v);for(let h=1;h<r.pointsMm.length;h+=1)x(r.pointsMm[h-1],r.pointsMm[h]);Fn(r)&&x(r.pointsMm[r.pointsMm.length-1],r.pointsMm[0])}else if(r.polylinesMm?.length){for(let h of r.polylinesMm)if(!(!Array.isArray(h)||h.length<2))for(let y=1;y<h.length;y+=1)x(h[y-1],h[y])}else if(Number.isFinite(u)&&Number.isFinite(d)&&Number.isFinite(m)&&Number.isFinite(f))r.kind==="rect"?(c&&yf(a,n,r.kind,[u,d,m,f],v),x([u,d],[m,d]),x([m,d],[m,f]),x([m,f],[u,f]),x([u,f],[u,d])):x([u,d],[m,f]);else if(Number.isFinite(r.cxMm)&&Number.isFinite(r.cyMm)){let h=r.radiusMm||r.diameterMm/2||.4;c&&xf(a,n,r.kind,[r.cxMm,r.cyMm],h,v),Tf(t,{featureId:n,kind:r.kind,widthMm:l,lineStyle:p,color:g},[r.cxMm,r.cyMm],h)}else if(r.contoursMm?.length){for(let h of r.contoursMm)if(!(!Array.isArray(h)||h.length<2)){for(let y=1;y<h.length;y+=1)x(h[y-1],h[y]);x(h[h.length-1],h[0])}}else if(Number.isFinite(r.start_xMm)&&Number.isFinite(r.start_yMm)&&Number.isFinite(r.end_xMm)&&Number.isFinite(r.end_yMm))Number.isFinite(r.mid_xMm)&&Number.isFinite(r.mid_yMm)?(x([r.start_xMm,r.start_yMm],[r.mid_xMm,r.mid_yMm]),x([r.mid_xMm,r.mid_yMm],[r.end_xMm,r.end_yMm])):x([r.start_xMm,r.start_yMm],[r.end_xMm,r.end_yMm]);else if(Number.isFinite(r.start_xMm)&&Number.isFinite(r.start_yMm)&&Number.isFinite(r.mid_xMm)&&Number.isFinite(r.mid_yMm)&&Number.isFinite(r.end_xMm)&&Number.isFinite(r.end_yMm))x([r.start_xMm,r.start_yMm],[r.mid_xMm,r.mid_yMm]),x([r.mid_xMm,r.mid_yMm],[r.end_xMm,r.end_yMm]);else if(r.boundsMm&&r.kind!=="text"){let[h,y,w,T]=r.boundsMm;x([h,y],[w,y]),x([w,y],[w,T]),x([w,T],[h,T]),x([h,T],[h,y])}}return{segments:t,fills:a,images:s}}function pf(e,t){for(let a of t.segments||[])a.worldA=St(e,a.a),a.worldB=St(e,a.b);for(let a of t.fills||[])a.worldPoints=a.points.map(s=>St(e,s));for(let a of t.images||[])a.worldOrigin=St(e,[a.xMm,a.yMm]),a.worldSize=mf(e,a.widthMm,a.heightMm)}function St(e,t){return[e.worldX+t[0]/e.sourceWidthMm*e.widthMm,e.worldY+t[1]/e.sourceHeightMm*e.heightMm]}function mf(e,t,a){return[t/e.sourceWidthMm*e.widthMm,a/e.sourceHeightMm*e.heightMm]}function yf(e,t,a,s,r){let[n,i,o,c]=s;e.push({featureId:t,kind:a,color:r,points:[[n,i],[o,i],[n,c]],bounds:[n,i,o,c]},{featureId:t,kind:a,color:r,points:[[n,c],[o,i],[o,c]],bounds:[n,i,o,c]})}function xf(e,t,a,s,r,n){for(let o=0;o<36;o+=1){let c=o/36*Math.PI*2,l=(o+1)/36*Math.PI*2;e.push({featureId:t,kind:a,color:n,points:[s,[s[0]+Math.cos(c)*r,s[1]+Math.sin(c)*r],[s[0]+Math.cos(l)*r,s[1]+Math.sin(l)*r]],bounds:[s[0]-r,s[1]-r,s[0]+r,s[1]+r]})}}function wf(e,t,a,s,r){let n=s[0],i=Pn(s);for(let o=2;o<s.length;o+=1)e.push({featureId:t,kind:a,color:r,points:[n,s[o-1],s[o]],bounds:i})}function vf(e,t,a,s){let r=Nn(a,s,t.widthMm||.15),n=t.lineStyle||"DEFAULT";if(!["DASH","DASHED","DOT","DOTTED","DASHDOT","DASH_DOT"].includes(n)){e.push({...t,a,b:s,bounds:r});return}let i=s[0]-a[0],o=s[1]-a[1],c=Math.hypot(i,o);if(c<1e-6)return;let l=i/c,p=o/c,g=Math.max(t.widthMm*4,.45),v=n.includes("DOT")?[g*.8,g*.75,g*3,g*.75]:[g*3,g*1.5],x=0,u=0;for(;x<c;){let d=Math.min(v[u%v.length],c-x);if(u%2===0){let m=[a[0]+l*x,a[1]+p*x],f=[a[0]+l*(x+d),a[1]+p*(x+d)];e.push({...t,a:m,b:f,bounds:Nn(m,f,t.widthMm||.15)})}x+=d,u+=1}}function Tf(e,t,a,s){for(let n=0;n<32;n+=1){let i=n/32*Math.PI*2,o=(n+1)/32*Math.PI*2;e.push({...t,a:[a[0]+Math.cos(i)*s,a[1]+Math.sin(i)*s],b:[a[0]+Math.cos(o)*s,a[1]+Math.sin(o)*s],bounds:[a[0]-s,a[1]-s,a[0]+s,a[1]+s]})}}function Pn(e,t=0){let a=1/0,s=1/0,r=-1/0,n=-1/0;for(let i of e||[])a=Math.min(a,i[0]),s=Math.min(s,i[1]),r=Math.max(r,i[0]),n=Math.max(n,i[1]);return Number.isFinite(a)?[a-t,s-t,r+t,n+t]:[0,0,0,0]}function Nn(e,t,a=0){let s=Math.max(.05,a*.5);return[Math.min(e[0],t[0])-s,Math.min(e[1],t[1])-s,Math.max(e[0],t[0])+s,Math.max(e[1],t[1])+s]}function qe(e,t){return!e||!t?!0:e[0]<=t[2]&&e[2]>=t[0]&&e[1]<=t[3]&&e[3]>=t[1]}function Ef(e){let t={cellSize:ff,cells:new Map,segments:e.segments||[],fills:e.fills||[],images:e.images||[],queryId:0};for(let a of t.segments)Ss(t,"segments",a);for(let a of t.fills)Ss(t,"fills",a);for(let a of t.images)Ss(t,"images",a);return t}function Ss(e,t,a){let s=a.bounds;if(!s)return;let r=Math.floor(s[0]/e.cellSize),n=Math.floor(s[2]/e.cellSize),i=Math.floor(s[1]/e.cellSize),o=Math.floor(s[3]/e.cellSize);for(let c=i;c<=o;c+=1)for(let l=r;l<=n;l+=1){let p=`${l}:${c}`,g=e.cells.get(p);g||(g={segments:[],fills:[],images:[]},e.cells.set(p,g)),g[t].push(a)}}function jn(e,t){if(!e)return{segments:[],fills:[],images:[]};e.queryId=(e.queryId||0)+1;let a=e.queryId,s={segments:[],fills:[],images:[]},r=Math.floor(t[0]/e.cellSize),n=Math.floor(t[2]/e.cellSize),i=Math.floor(t[1]/e.cellSize),o=Math.floor(t[3]/e.cellSize);for(let c=i;c<=o;c+=1)for(let l=r;l<=n;l+=1){let p=e.cells.get(`${l}:${c}`);p&&(_s(p.segments,s.segments,a,"segments"),_s(p.fills,s.fills,a,"fills"),_s(p.images,s.images,a,"images"))}return s}function _s(e,t,a,s){let r=`_${s}QueryId`;for(let n of e)n[r]!==a&&(n[r]=a,t.push(n))}function Fn(e){let t=String(e.kind||"");if(String(e.fill||"").toUpperCase()==="FILLED_SHAPE"||e.closed===!0||["polygon","fill"].includes(t))return!0;let s=e.pointsMm||[];if(s.length>=3){let r=s[0],n=s[s.length-1];return Math.hypot(r[0]-n[0],r[1]-n[1])<1e-6}return!1}function zt(e){return!!e?.netUid}function kf(e){let t=String(e?.kind||""),a=String(e?.semanticRole||"");return t==="pin"||t==="pin_body"||t==="label"||t==="global_label"||t==="hierarchical_label"||t==="netclass_flag"||t==="power_symbol"||t==="power_port"||a==="label"||a==="global_label"||a==="hierarchical_label"}function Mf(e){let t=String(e?.kind||""),a=String(e?.semanticRole||"");return t==="global_label"||a==="global_label"?130:t==="hierarchical_label"||a==="hierarchical_label"?125:t==="label"||a==="label"?118:t==="pin"||t==="pin_body"?106:t==="power_symbol"||t==="power_port"||t==="netclass_flag"?98:50}function Rf(e){if(e.length<=Sn)return e;let t=e.slice(0,Sn);return t.sort((a,s)=>a.source[1]-s.source[1]||a.source[0]-s.source[0]),t}function If(e,t,a={}){if(!e||!t?.length)return null;let s=a.featureId||a.stableKey||a.sourceId?t.find(l=>a.featureId&&Number(l.featureId||0)===Number(a.featureId)||a.stableKey&&l.stableKey===a.stableKey||a.sourceId&&l.sourceId===a.sourceId):null;if(s)return{...s,kind:"selected-net-occurrence",priority:200};let r=t.filter(l=>l.priority>=118).slice(0,16),n=r.length?r:t.slice(0,16),i=0,o=0;for(let l of n)i+=l.world[0],o+=l.world[1];let c=[i/n.length,o/n.length];return{pageId:e.id,featureId:n[0]?.featureId||0,kind:"page-net-occurrence",source:[0,0],world:c,bounds:[c[0],c[1],c[0],c[1]],priority:1}}function Cn(e,t,a){if(!e||e.length<2)return[];let s=e.map(i=>({...i})).sort((i,o)=>i.world[1]-o.world[1]||i.world[0]-o.world[0]),r=[],n=s.shift();for(;s.length;){let i=0,o=1/0;for(let l=0;l<s.length;l+=1){let p=s[l],g=Math.hypot(p.world[0]-n.world[0],p.world[1]-n.world[1]);g<o&&(o=g,i=l)}let c=s.splice(i,1)[0];r.push({type:t,pageId:a||n.pageId||c.pageId||"",a:n.world,b:c.world,sourceFeatureIds:[n.featureId,c.featureId].filter(Boolean)}),n=c}return r}function Bn(e,t=0){return[Math.min(e.a[0],e.b[0])-t,Math.min(e.a[1],e.b[1])-t,Math.max(e.a[0],e.b[0])+t,Math.max(e.a[1],e.b[1])+t]}function Gt(e){let t=String(e?.kind||""),s=String(e?.semanticRole||"")||t;return s==="pin_number"||s==="pin_name"?120:s==="pin_body"||t==="pin"?110:s==="symbol_reference"||s==="symbol_value"?92:t==="junction"||t==="no_connect"?88:t==="wire"||t==="bus"||t==="bus_entry"?78:s==="symbol_body"||t==="symbol_body"?45:t==="symbol_instance"||t==="symbol_overplot"?30:t==="text"||String(s).includes("text")?24:10}function Vt(e){let t=String(e?.kind||""),a=String(e?.semanticRole||"");if(t==="page"||t==="sheet_header")return!0;if(t==="graphic_rect"&&a==="graphic_rect"&&!e?.netUid&&!e?.componentUid){let s=e.boundsMm||[];return s[2]-s[0]>150&&s[3]-s[1]>120}return!1}function Af(e){if(!e||typeof e!="string")return null;let a=e.trim().match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);if(!a)return null;let s=a[1],r=a[2]??"ff";return[parseInt(s.slice(0,2),16)/255,parseInt(s.slice(2,4),16)/255,parseInt(s.slice(4,6),16)/255,parseInt(r,16)/255]}function js(e,t,a=""){let s=Af(a||e?.color||"");return e?.kind==="dnp_marker"?s||[.86,.04,.05,.85]:e?.dnp&&["symbol_reference","symbol_value","symbol_text"].includes(String(e?.kind||""))?[.5,.52,.54,.56]:s||(e?.dnp?[.5,.52,.54,.56]:zt(e)?[.12,.56,.2,.96]:e?.kind==="pin_name"?[0,.28,.31,.96]:e?.kind==="pin_number"?[.45,.17,.16,.96]:e?.kind==="pin_body"?[.28,.18,.18,.88]:e?.kind==="symbol_body"||e?.kind==="symbol_instance"?[.42,.18,.18,.72]:e?.kind==="symbol_reference"||e?.kind==="symbol_value"?[.05,.13,.16,.94]:e?.kind==="text"||String(t||"").startsWith("text")?[.05,.13,.16,.94]:[.16,.17,.19,.7])}function On(e,t,a=""){let s=js(e,t,a);return[s[0]*.72,s[1]*.72,s[2]*.72,Math.min(s[3],.38)]}function Sf(e,t,a){return a?5.5:e?.kind==="dnp_marker"?3:["pin_name","pin_number"].includes(String(e?.kind||""))?1.5:e?.kind==="pin_body"?1.7:String(t||"").startsWith("text")?1.35:t==="bus"||e?.kind==="bus"?4.2:zt(e)?2.6:e?.kind==="symbol_body"||e?.kind==="symbol_instance"||e?.kind==="sheet"?1.5:1.25}function Sa(e,t,a,s){return e[t++]=a[0],e[t++]=a[1],e[t++]=s[0],e[t++]=s[1],e[t++]=s[2],e[t++]=s[3],t}function _f(e,t,a,s,r,n){let i=Dn(a,s,r);if(!i)return t;for(let o of i)t=Sa(e,t,o,n);return t}function Nf(e,t,a,s,r,n){return t=Sa(e,t,a,n),t=Sa(e,t,s,n),t=Sa(e,t,r,n),t}function At(e,t,a,s,r){return e[t++]=a[0],e[t++]=a[1],e[t++]=s,e[t++]=r,t}function jf(e,t,a,s,r,n,i,o){let c=s[0]-a[0],l=s[1]-a[1],p=Math.hypot(c,l);if(p<1e-6||t+24>e.length)return t;let g=r*.5,v=c/p,u=-(l/p)*g,d=v*g,m=[a[0]+u,a[1]+d],f=[a[0]-u,a[1]-d],h=[s[0]+u,s[1]+d],y=[s[0]-u,s[1]-d],w=i+p/Math.max(o,1e-6);return t=At(e,t,m,i,n),t=At(e,t,f,i,n),t=At(e,t,h,w,n),t=At(e,t,h,w,n),t=At(e,t,f,i,n),t=At(e,t,y,w,n),t}function Dn(e,t,a){let s=t[0]-e[0],r=t[1]-e[1],n=Math.hypot(s,r);if(n<1e-6)return null;let i=a*.5,o=s/n*i,c=r/n*i,l=-r/n*i,p=s/n*i,g=[e[0]-o,e[1]-c],v=[t[0]+o,t[1]+c],x=[g[0]+l,g[1]+p],u=[g[0]-l,g[1]-p],d=[v[0]+l,v[1]+p],m=[v[0]-l,v[1]-p];return[x,u,d,d,u,m]}function Ff(e,t,a){let s=a[0]-t[0],r=a[1]-t[1],n=s*s+r*r||1,i=ne(((e[0]-t[0])*s+(e[1]-t[1])*r)/n,0,1),o=t[0]+s*i,c=t[1]+r*i;return Math.hypot(e[0]-o,e[1]-c)}function Cf(e,t){let[a,s,r,n]=t,[i,o]=e.a,[c,l]=e.b,p=1e-6,g=(v,x)=>({...e,a:v,b:x});if(Math.abs(o-l)<=p){let v=o;if(v<s-p||v>n+p)return[e];let x=Math.min(i,c),u=Math.max(i,c),d=Math.max(x,a),m=Math.min(u,r);if(m<=d+p)return[e];let f=[],h=i<=c;if(x<d-p){let y=h?[x,v]:[d,v],w=h?[d,v]:[x,v];f.push(g(y,w))}if(m<u-p){let y=h?[m,v]:[u,v],w=h?[u,v]:[m,v];f.push(g(y,w))}return f}if(Math.abs(i-c)<=p){let v=i;if(v<a-p||v>r+p)return[e];let x=Math.min(o,l),u=Math.max(o,l),d=Math.max(x,s),m=Math.min(u,n);if(m<=d+p)return[e];let f=[],h=o<=l;if(x<d-p){let y=h?[v,x]:[v,d],w=h?[v,d]:[v,x];f.push(g(y,w))}if(m<u-p){let y=h?[v,m]:[v,u],w=h?[v,u]:[v,m];f.push(g(y,w))}return f}return[e]}function _a(e,t,a,s){let r=t*12;e.setFloat32(r,a[0],!0),e.setFloat32(r+4,a[1],!0),e.setUint32(r+8,s,!0)}function Bf(e,t,a,s,r,n){let i=Dn(a,s,r);if(!i)return t;for(let o of i)_a(e,t,o,n),t+=1;return t}function Ns(e,t,a,s,r,n){return _a(e,t,a,n),_a(e,t+1,s,n),_a(e,t+2,r,n),t+3}var xt=30,Fs=8,ja=3,Cs=16,Kn=14,Of=.56,Pf=13,Df=11,Uf={copper:16,soldermask:10,paste:8,silkscreen:8},Lf={copper:8,soldermask:5,paste:4,silkscreen:4,dielectric:12},Kf=["paste","silkscreen","soldermask","copper","dielectric"];function Gn(e){if(e.role==="dielectric"){let t=Number(e.thicknessMm)||.1;return Math.max(36,Math.min(200,t*300))}return Uf[e.role]??8}function Un(e){return Lf[e.role]??4}function Gf(e,t){let a=e.map(Gn),s=a.reduce((l,p)=>l+p,0);if(s<=t){let l=a.reduce((g,v,x)=>g+(e[x].role==="dielectric"?v:0),0);if(!l)return a;let p=Math.min(2.5,1+(t-s)/l);return a.map((g,v)=>e[v].role==="dielectric"?g*p:g)}let r=s-t,n=a.reduce((l,p,g)=>l+(e[g].role==="dielectric"?p-Un(e[g]):0),0),i=n>0?Math.min(1,r/n):0,o=a.map((l,p)=>e[p].role==="dielectric"?l-i*(l-Un(e[p])):l),c=o.reduce((l,p)=>l+p,0);return c<=t?o:o.map(l=>l*t/c)}function Bs(e){return Cs+(e?Kn:0)}function Vf(e,t,a,s=ja){let r=[],n=t;for(let o of e){let c=Math.max(o.center-o.height/2,n);r.push(c),n=c+o.height+s}let i=a;for(let o=e.length-1;o>=0;o-=1)r[o]=Math.min(r[o],i-e[o].height),i=r[o]-s;n=t;for(let o=0;o<e.length;o+=1)r[o]=Math.max(r[o],n),n=r[o]+e[o].height+s;return r}function Ln(e,t,a){let s=String(e||""),r=Math.max(4,Math.floor(t/(a*Of)));return s.length>r?`${s.slice(0,r-1)}\u2026`:s}function Vn(e){let t=e.reduce((s,r)=>s+Gn(r),0),a=e.reduce((s,r)=>s+Bs(!!r.secondary)+ja,0);return xt+Math.max(t,a)+Fs}function zn(e,{width:t,height:a}){let s=Math.max(40,a-xt-Fs),r=Gf(e,s),n=xt,i=e.map((T,E)=>{let R={...T,y:n,h:r[E]};return n+=r[E],R}),o=n,c=100,l=Math.max(110,Math.min(240,Math.round(t*.26))),p=c+l+12,g=p+34,x=g+80,u=Math.max(60,t-x-8),d=i.map(T=>!!T.secondary),m=()=>d.reduce((T,E)=>T+Bs(E)+ja,-ja),f=a-xt-Fs;for(let T of Kf){if(m()<=f)break;i.forEach((E,R)=>{E.role===T&&(d[R]=!1)})}let h=i.map((T,E)=>({center:T.y+T.h/2,height:Bs(d[E])})),y=Vf(h,xt,xt+f),w=i.map((T,E)=>({top:y[E],height:h[E].height,primary:Ln(T.primary,u,Pf),secondary:d[E]?Ln(T.secondary,u,Df):""}));return{width:t,height:a,bands:i,labels:w,bottom:o,columns:{boardX:c,boardWidth:l,dimensionX:p,labelX:g,nameX:x}}}function Hn(e,{spans:t=[],totalLabel:a=""}={}){let{bands:s,labels:r,bottom:n,columns:i}=e,{boardX:o,boardWidth:c,dimensionX:l,labelX:p,nameX:g}=i,v=s.map((m,f)=>{let h=r[f],y=m.y+m.h/2,w=h.top+Cs/2,T=m.h>=4?`M ${l+6} ${m.y+1} H ${l} V ${m.y+m.h-1} H ${l+6}`:`M ${l} ${y} H ${l+6}`,E=`M ${l+2} ${y} H ${l+12} L ${p-6} ${w}`;return`
      <g class="stackup-svg-layer" data-layer-id="${D(m.id)}" data-layer-name="${D(m.name)}">
        <title>${D(m.description)}</title>
        <rect x="${o}" y="${m.y}" width="${c}" height="${Math.max(.5,m.h)}" fill="${m.color}" opacity="0.85" rx="1"/>
        ${m.copperIndex?`<text class="stackup-layer-index" x="${o-8}" y="${y}" text-anchor="end">${m.copperIndex}</text>`:""}
        <path class="stackup-layer-dimension" d="${T}" />
        <path class="stackup-layer-leader" d="${E}" />
        <text class="stackup-layer-thickness" x="${p}" y="${w}">${D(m.thicknessLabel)}</text>
        <text class="stackup-layer-name" x="${g}" y="${w}">${D(h.primary)}</text>
        ${h.secondary?`<text class="stackup-layer-metadata" x="${g}" y="${w+(Cs+Kn)/2}">${D(h.secondary)}</text>`:""}
      </g>`}).join(""),x=s.filter(m=>m.role==="copper"),u=t.map((m,f)=>{let h=s.find(A=>A.name===m.startName),y=s.find(A=>A.name===m.endName);if(!h||!y)return"";let w=h.y,T=y.y+y.h,E=o+(f+1)*c/(t.length+1),R=m.type==="thru"?"Thru":m.type==="blind"?"Blind":"Buried",I=`var(--stackup-via-${m.type})`,_=x.filter(A=>A.y>=h.y&&A.y<=y.y).map(A=>`<rect x="${E-5}" y="${A.y}" width="10" height="${A.h}" fill="${I}" rx="0.5" />`).join("");return`
      <g class="stackup-svg-via" data-via-type="${m.type}">
        <title>${R}: ${D(m.startName)} \u2192 ${D(m.endName)}</title>
        ${_}
        <rect x="${E-2}" y="${w}" width="4" height="${T-w}" fill="${I}" opacity="0.95" />
        <rect x="${E-.75}" y="${w-1}" width="1.5" height="${T-w+2}" fill="var(--panel)" opacity="0.9" />
      </g>`}).join(""),d=o-32;return`
    <g class="stackup-svg-column-headings" aria-hidden="true">
      <text x="${p}" y="14">Thickness</text>
      <text x="${g}" y="14">Layer / material properties</text>
    </g>
    <g class="stackup-total-dimension">
      <path d="M ${d+8} ${xt} H ${d} V ${n} H ${d+8}" />
      <text x="${d}" y="14">${D(a)}</text>
    </g>
    ${v}
    ${u}`}function zf(e,t){let a=Array.isArray(e?.layerIds)?e.layerIds:[];if(a.length<2&&e?.startLayerId!=null&&e?.endLayerId!=null&&(a=[e.startLayerId,e.endLayerId]),a.length<2&&e?.layerMask!=null)try{let s=BigInt(String(e.layerMask));a=t.filter((r,n)=>(s&1n<<BigInt(n))!==0n).map(r=>r.id)}catch{a=[]}return a}function Hf(e){let t=e?.objectFeatureId??e?.id;if(t!=null&&Number.isFinite(Number(t))&&Number(t)!==0)return`feature:${Number(t)}`;let a=String(e?.sourceUid||"");return a?`source:${a}`:""}function qn(e,t){let a=new Map(e.map((o,c)=>[Number(o.id),c])),s=new Map(e.map(o=>[Number(o.id),o])),r=new Map,n=new Set,i={thru:0,blind:0,buried:0};for(let o of t){let c=Hf(o);if(c){if(n.has(c))continue;n.add(c)}let l=[...new Set(zf(o,e).map(Number))].filter(y=>a.has(y)).sort((y,w)=>a.get(y)-a.get(w));if(l.length<2)continue;let p=l[0],g=l[l.length-1],v=a.get(p),x=a.get(g),u=v===0,d=x===e.length-1,m=u&&d?"thru":u||d?"blind":"buried";i[m]+=1;let f=`${p}:${g}:${m}`,h=r.get(f);if(h){h.count+=1;continue}r.set(f,{startId:p,endId:g,startName:s.get(p)?.name||String(p),endName:s.get(g)?.name||String(g),startIndex:v,endIndex:x,type:m,count:1})}return{counts:i,spans:[...r.values()]}}var Ht="http://www.w3.org/2000/svg";var qf=new Set(["script","foreignobject","iframe","object","embed"]),Xf=new Set(["href","xlink:href"]),Wf=1,Jf=18,Yf=8,Ba=class e{static create(t,a,s,r,n={}){return new e(t,a,s,r,n)}constructor(t,a,s,r,n){this.host=t,this.manifestUrl=a,this.manifest=s,this.featuresByPage=r||{},this.callbacks=n,this.activePage=null,this.activeSvgUrl="",this.container=null,this.svg=null,this.overlay=null,this.mountedPages=new Map,this.loadingPages=new Map,this.svgCache=new Map,this.serial=0,this.maxMountedWorldPages=Wf,this.maxCachedSvgPages=Jf,this.worldHandlersInstalled=!1,this.worldDrag=null,this.view={scale:1,tx:0,ty:0},this.drag=null,this.selected=null,this.highlightedNetUid="",this.index=Yn(),this.lastStats={mountedPages:0,domNodes:0,indexedFeatures:0,indexedNets:0,mountMs:0,coldMounts:0,warmMounts:0,highlightMs:0,selectionMs:0,cachedSvgPages:0,cachedSvgBytes:0,heapMb:null,fallbackReason:""}}get active(){return!!(this.container&&this.activePage)}get worldActive(){return this.mountedPages.size>0}stats(){return{...this.lastStats,activePage:this.activePage?.name||[...this.mountedPages.values()][0]?.page?.name||"-",mountedPages:this.active?1:this.mountedPages.size}}dispose(){this.unmountPage(),this.unmountWorldPages()}unmountPage(){this.container?.remove(),this.container=null,this.svg=null,this.overlay=null,this.activePage=null,this.activeSvgUrl="",this.index=Yn(),this.host.hidden=!0}unmountWorldPages(){for(let t of this.mountedPages.values())t.container.remove();this.mountedPages.clear(),this.loadingPages.clear(),this.active||(this.host.hidden=!0)}async preloadPages(t){let a=performance.now(),s=await Promise.allSettled((t||[]).slice(0,Yf).map(r=>this.loadSvgTemplate(r)));this.lastStats.preloadedPages=s.filter(r=>r.status==="fulfilled"&&r.value).length,this.lastStats.preloadMs=performance.now()-a,this.updateCacheStats()}syncWorldPages(t,a,s={}){if(!a)return;this.installWorldHandlers(a);let r=(t||[]).slice(0,s.maxMountedPages||this.maxMountedWorldPages),n=new Set(r.map(i=>i.id));for(let[i,o]of this.mountedPages)n.has(i)||(o.container.remove(),this.mountedPages.delete(i));for(let i of r){let o=this.mountedPages.get(i.id);if(o)o.lastUsed=++this.serial,this.positionWorldEntry(o,a);else if(!this.loadingPages.has(i.id)){let c=this.mountWorldPage(i).then(l=>{l&&n.has(i.id)?this.positionWorldEntry(l,a):l?.container.remove()}).finally(()=>this.loadingPages.delete(i.id));this.loadingPages.set(i.id,c)}}this.pruneMountedWorldPages(n),this.host.hidden=r.length===0&&!this.active,this.setSelection(this.selected),this.setHighlightedNet(s.activeNetUid??this.highlightedNetUid),this.lastStats.mountedPages=this.mountedPages.size,this.updateCacheStats()}async mountWorldPage(t){let a=performance.now(),s=this.hasCachedSvg(t),r=await this.loadImportedSvg(t);if(!r)return null;let n=document.createElement("div");n.className="svg-dom-page svg-dom-world-page",n.dataset.pageId=t.id,n.append(r),this.host.append(n);let i=Wn(r),o=Jn(r),c=Xn(r,t,this.featuresByPage[t.id]||[]),l={page:t,container:n,svg:r,overlay:i,selectionOverlay:o,index:c,mountMs:performance.now()-a,lastUsed:++this.serial,warm:s};return this.mountedPages.set(t.id,l),this.lastStats={...this.lastStats,mountedPages:this.mountedPages.size,domNodes:[...this.mountedPages.values()].reduce((p,g)=>p+g.svg.querySelectorAll("*").length,0),indexedFeatures:[...this.mountedPages.values()].reduce((p,g)=>p+g.index.featureToElements.size,0),indexedNets:new Set([...this.mountedPages.values()].flatMap(p=>[...p.index.netToElements.keys()])).size,mountMs:l.mountMs,coldMounts:this.lastStats.coldMounts+(l.warm?0:1),warmMounts:this.lastStats.warmMounts+(l.warm?1:0),fallbackReason:""},this.updateCacheStats(),l}async loadImportedSvg(t){let a=await this.loadSvgTemplate(t);return a?a.cloneNode(!0):null}async loadSvgTemplate(t){let a=this.svgUrlForPage(t),s=this.svgCache.get(a);if(s?.template)return s.lastUsed=++this.serial,s.template;if(s?.promise)return s.promise;let r=performance.now(),n=(async()=>{let i=await fetch(a,{cache:"default"});if(!i.ok)return this.lastStats.fallbackReason=`Failed to load SVG page ${t.id}: ${i.status}`,this.callbacks.onFallback?.(this.lastStats.fallbackReason),null;let o=await i.text(),l=new DOMParser().parseFromString(o,"image/svg+xml"),p=l.documentElement;if(!p||p.localName.toLowerCase()!=="svg"||l.querySelector("parsererror"))return this.lastStats.fallbackReason=`Invalid SVG for page ${t.id}`,this.callbacks.onFallback?.(this.lastStats.fallbackReason),null;$f(l,a,t.id);let g=document.importNode(p,!0);g.classList.add("svg-dom-page-svg"),su(g);let v=this.svgCache.get(a)||{};return Object.assign(v,{template:g,promise:null,pageId:t.id,byteLength:o.length*2,loadMs:performance.now()-r,lastUsed:++this.serial}),this.svgCache.set(a,v),this.pruneSvgCache(),this.updateCacheStats(),g})();return this.svgCache.set(a,{promise:n,pageId:t.id,byteLength:0,loadMs:0,lastUsed:++this.serial}),n}svgUrlForPage(t){return new URL(t.svg||t.thumbnail?.path,this.manifestUrl).toString()}positionWorldEntry(t,a){let{page:s,container:r}=t,[n,i]=a.worldToScreen(s.worldX,s.worldY),[o,c]=a.worldToScreen(s.worldX+s.widthMm,s.worldY+s.heightMm),l=Math.max(1,o-n),p=Math.max(1,c-i);r.style.transform=`translate3d(${n}px, ${i}px, 0)`,r.style.width=`${l}px`,r.style.height=`${p}px`}installWorldHandlers(t){if(this.worldHandlersInstalled)return;this.worldHandlersInstalled=!0;let a=this.host;a.oncontextmenu=s=>s.preventDefault(),a.onpointerdown=s=>{let r=s.button===0&&!s.shiftKey&&!!s.target.closest?.("text"),i=s.target.closest?.("[data-feature-key]")?null:this.featureAtEvent(s);this.worldDrag={pointerId:s.pointerId,startX:s.clientX,startY:s.clientY,lastX:s.clientX,lastY:s.clientY,button:s.button,moved:!1,pan:!r&&(s.button===0||s.button===1||s.shiftKey),allowTextSelection:r},r||a.setPointerCapture(s.pointerId)},a.onpointermove=s=>{if(!this.worldDrag||this.worldDrag.pointerId!==s.pointerId)return;let r=s.clientX-this.worldDrag.lastX,n=s.clientY-this.worldDrag.lastY;this.worldDrag.lastX=s.clientX,this.worldDrag.lastY=s.clientY,Math.hypot(s.clientX-this.worldDrag.startX,s.clientY-this.worldDrag.startY)>3&&(this.worldDrag.moved=!0),this.worldDrag.pan&&t.pan(r,n)},a.onpointerup=s=>{if(!this.worldDrag||this.worldDrag.pointerId!==s.pointerId)return;let r=this.worldDrag;if(this.worldDrag=null,r.allowTextSelection||a.releasePointerCapture(s.pointerId),r.button!==0||r.moved)return;let n=s.target.closest?.("[data-feature-key]");if(n)this.selectElement(n,s);else{let i=this.featureAtEvent(s);i?this.selectFeature(i.entry,i.feature,s):this.callbacks.onBlank?.()}},a.ondblclick=s=>{let r=s.target.closest?.("[data-feature-key]"),n=r?null:this.featureAtEvent(s),i=n?.entry||this.entryForPoint(s.clientX,s.clientY),o=r?this.selectionFromElement(r):n?this.selectionFromFeature(n.entry,n.feature):this.selected;$n(o)?this.callbacks.onOpenPage?.(o):o?.netUid?this.callbacks.onHighlightNet?.(o.netUid,o):!n&&i?.page&&this.callbacks.onOpenPage?.({kind:"page",pageId:i.page.id,page:i.page})},a.onwheel=s=>{s.preventDefault(),Math.abs(s.deltaX)>Math.abs(s.deltaY)*.65?t.pan(-s.deltaX,-s.deltaY):t.zoom(s.deltaY,s.clientX,s.clientY)}}async focusPage(t,a={}){if(!t)return!1;if(this.activePage?.id===t.id&&this.active)return a.frame!==!1&&this.fitPage(),!0;let s=performance.now(),r=await this.loadImportedSvg(t);if(!r)return!1;let n=document.createElement("div");return n.className="svg-dom-page",n.append(r),this.host.replaceChildren(n),this.host.hidden=!1,this.container=n,this.svg=r,this.activePage=t,this.activeSvgUrl=new URL(t.svg||t.thumbnail?.path,this.manifestUrl).toString(),this.overlay=Wn(r),this.selectionOverlay=Jn(r),this.index=Xn(r,t,this.featuresByPage[t.id]||[]),this.installPageHandlers(),this.fitPage(),this.setSelection(this.selected),this.setHighlightedNet(this.highlightedNetUid),this.lastStats={...this.lastStats,mountedPages:1,domNodes:r.querySelectorAll("*").length,indexedFeatures:this.index.featureToElements.size,indexedNets:this.index.netToElements.size,mountMs:performance.now()-s,fallbackReason:""},this.updateCacheStats(),!0}installPageHandlers(){let t=this.host;t.oncontextmenu=a=>a.preventDefault(),t.onpointerdown=a=>{if(!this.active)return;let s=a.button===0&&!a.shiftKey&&!!a.target.closest?.("text"),r=a.target.closest?.("[data-feature-key]"),n=r?null:this.featureAtEvent(a);this.drag={pointerId:a.pointerId,startX:a.clientX,startY:a.clientY,lastX:a.clientX,lastY:a.clientY,button:a.button,moved:!1,pan:!s&&(a.button===0||a.button===1||a.shiftKey),featureElement:r,allowTextSelection:s},s||t.setPointerCapture(a.pointerId)},t.onpointermove=a=>{if(!this.drag||this.drag.pointerId!==a.pointerId)return;let s=a.clientX-this.drag.lastX,r=a.clientY-this.drag.lastY;this.drag.lastX=a.clientX,this.drag.lastY=a.clientY,Math.hypot(a.clientX-this.drag.startX,a.clientY-this.drag.startY)>3&&(this.drag.moved=!0),this.drag.pan&&(this.view.tx+=s,this.view.ty+=r,this.applyTransform())},t.onpointerup=a=>{if(!this.drag||this.drag.pointerId!==a.pointerId)return;let s=this.drag;if(this.drag=null,s.allowTextSelection||t.releasePointerCapture(a.pointerId),s.button!==0||s.moved)return;let r=a.target.closest?.("[data-feature-key]");if(r)this.selectElement(r,a);else{let n=this.featureAtEvent(a);n?this.selectFeature(n.entry,n.feature,a):this.callbacks.onBlank?.()}},t.ondblclick=a=>{let s=a.target.closest?.("[data-feature-key]"),r=s?null:this.featureAtEvent(a),n=s?this.selectionFromElement(s):r?this.selectionFromFeature(r.entry,r.feature):this.selected;$n(n)?this.callbacks.onOpenPage?.(n):n?.netUid?this.callbacks.onHighlightNet?.(n.netUid,n):!r&&this.activePage&&this.callbacks.onOpenPage?.({kind:"page",pageId:this.activePage.id,page:this.activePage})},t.onwheel=a=>{if(a.preventDefault(),!this.active)return;if(Math.abs(a.deltaX)>Math.abs(a.deltaY)*.65){this.view.tx-=a.deltaX,this.view.ty-=a.deltaY,this.applyTransform();return}let s=this.host.getBoundingClientRect(),r=a.clientX-s.left,n=a.clientY-s.top,i=this.screenToSvg(r,n),o=Math.exp(-a.deltaY*.0016);this.view.scale=Fa(this.view.scale*o,.02,80),this.view.tx=r-i[0]*this.view.scale,this.view.ty=n-i[1]*this.view.scale,this.applyTransform()}}selectElement(t,a){let s=performance.now(),r=this.selectionFromElement(t);if(this.setSelection(r),a){let n=this.host.getBoundingClientRect();r.anchor={x:a.clientX-n.left,y:a.clientY-n.top}}this.callbacks.onSelect?.(r),this.lastStats.selectionMs=performance.now()-s}selectFeature(t,a,s){let r=performance.now(),n=this.selectionFromFeature(t,a);if(this.setSelection(n),s){let i=this.host.getBoundingClientRect();n.anchor={x:s.clientX-i.left,y:s.clientY-i.top}}this.callbacks.onSelect?.(n),this.lastStats.selectionMs=performance.now()-r}selectionFromElement(t){let a=t.dataset.featureKey||"",s=this.entryForElement(t),r=s.index.featureByKey.get(a)||{};return this.selectionFromFeature(s,r,t)}selectionFromFeature(t,a,s=null){let r=a?.stableKey||s?.dataset?.featureKey||"",n=t?.page||this.activePage,i=a?.kind||s?.dataset?.role||s?.dataset?.primitive||"feature",o=a?.netUid||s?.dataset?.netUid||"",c=a?.netName||s?.dataset?.netName||"";return i==="sheet"?{kind:"sheet",featureKey:r,sheetInstancePath:a?.sheetInstancePath||n?.sheetInstancePath||"",sourceId:a?.sourceId||s?.dataset?.sourceId||s?.dataset?.objectId||s?.dataset?.uuid||"",sheetName:a?.sheet_name||a?.sheetName||s?.dataset?.sheetName||a?.objectId||"",sheetFile:a?.sheet_file||a?.sheetFile||s?.dataset?.sheetFile||"",feature:a}:i==="pin"||i==="pin_body"||i==="pin_name"||i==="pin_number"||s?.dataset?.pin?{kind:"pin",featureKey:r,sheetInstancePath:a?.sheetInstancePath||n?.sheetInstancePath||"",sourceId:a?.sourceId||s?.dataset?.sourceId||s?.dataset?.objectId||s?.dataset?.uuid||"",symbolUuid:a?.symbolUuid||s?.dataset?.symbolUuid||"",reference:a?.reference||s?.dataset?.designator||s?.dataset?.component||s?.dataset?.ref||"",pinNumber:a?.pinNumber||s?.dataset?.pin||"",pinName:a?.pinName||"",netUid:o,netName:c,feature:a}:i==="symbol_body"||i==="symbol_instance"||i==="component"||s?.dataset?.ref?{kind:"component",featureKey:r,sheetInstancePath:a?.sheetInstancePath||n?.sheetInstancePath||"",sourceId:a?.sourceId||s?.dataset?.sourceId||s?.dataset?.objectId||s?.dataset?.uuid||"",symbolUuid:a?.symbolUuid||s?.dataset?.symbolUuid||"",reference:a?.reference||s?.dataset?.designator||s?.dataset?.component||s?.dataset?.ref||"",netUid:o,netName:c,feature:a}:{kind:o?"feature":i,featureKey:r,sheetInstancePath:a?.sheetInstancePath||n?.sheetInstancePath||"",sourceId:a?.sourceId||s?.dataset?.sourceId||s?.dataset?.objectId||s?.dataset?.uuid||"",role:i,netUid:o,netName:c,feature:a}}setSelection(t){this.selected=t||null;for(let s of this.host.querySelectorAll(".prism-svg-selected"))s.classList.remove("prism-svg-selected");for(let s of this.host.querySelectorAll("[data-prism-overlay='selection']"))s.replaceChildren();let a=t?.featureKey||"";if(a){for(let s of this.entries()){for(let r of s.index.featureToElements.get(a)||[])r.classList.add("prism-svg-selected");this.drawSelectionOverlay(s,t)}for(let s of this.index.featureToElements.get(a)||[])s.classList.add("prism-svg-selected");this.drawSelectionOverlay({page:this.activePage,index:this.index,selectionOverlay:this.selectionOverlay},t)}}setHighlightedNet(t){this.highlightedNetUid=t||"";let a=performance.now();for(let s of this.entries())this.updateEntryHighlight(s);if(!this.svg||!this.overlay){this.lastStats.highlightMs=performance.now()-a;return}this.updateEntryHighlight({svg:this.svg,overlay:this.overlay,index:this.index,page:this.activePage}),this.lastStats.highlightMs=performance.now()-a}updateEntryHighlight(t){if(!t?.svg||!t?.overlay||(t.overlay.replaceChildren(),!this.highlightedNetUid))return;let a=Ca(t.svg,t.page),s=document.createElementNS(Ht,"rect");s.setAttribute("x",String(a[0])),s.setAttribute("y",String(a[1])),s.setAttribute("width",String(a[2])),s.setAttribute("height",String(a[3])),s.setAttribute("class","prism-svg-net-dimmer"),t.overlay.append(s);let n=(t.index.netToElements.get(this.highlightedNetUid)||[]).slice(0,2200);for(let i of n){let o=ru(i);t.overlay.append(o)}}entries(){return[...this.mountedPages.values()]}entryForElement(t){let s=t.closest?.(".svg-dom-page")?.dataset.pageId||"";return this.mountedPages.get(s)||{page:this.activePage,index:this.index,svg:this.svg,overlay:this.overlay,selectionOverlay:this.selectionOverlay}}featureAtEvent(t){let a=this.entryForPoint(t.clientX,t.clientY);if(!a)return null;let s=this.clientToSvg(a,t.clientX,t.clientY);if(!s)return null;let r=Math.max(.18,5*iu(a)),i=a.index.features.filter(o=>(o?.domBoundsMm||o?.boundsMm)&&ei(o)).filter(o=>s[0]>=(o.domBoundsMm||o.boundsMm)[0]-r&&s[0]<=(o.domBoundsMm||o.boundsMm)[2]+r&&s[1]>=(o.domBoundsMm||o.boundsMm)[1]-r&&s[1]<=(o.domBoundsMm||o.boundsMm)[3]+r).map(o=>({feature:o,priority:cu(o),area:Math.max(1e-4,((o.domBoundsMm||o.boundsMm)[2]-(o.domBoundsMm||o.boundsMm)[0])*((o.domBoundsMm||o.boundsMm)[3]-(o.domBoundsMm||o.boundsMm)[1]))})).sort((o,c)=>c.priority-o.priority||o.area-c.area)[0]?.feature;return i?{entry:a,feature:i,point:s}:null}entryForPoint(t,a){for(let s of[...this.entries()].reverse()){let r=s.container.getBoundingClientRect();if(t>=r.left&&t<=r.right&&a>=r.top&&a<=r.bottom)return s}if(this.container){let s=this.container.getBoundingClientRect();if(t>=s.left&&t<=s.right&&a>=s.top&&a<=s.bottom)return{page:this.activePage,container:this.container,svg:this.svg,index:this.index,selectionOverlay:this.selectionOverlay}}return null}clientToSvg(t,a,s){if(!t?.container||!t?.svg||!t?.page)return null;let r=t.container.getBoundingClientRect();if(!r.width||!r.height)return null;let n=Ca(t.svg,t.page);return[n[0]+(a-r.left)/r.width*n[2],n[1]+(s-r.top)/r.height*n[3]]}drawSelectionOverlay(t,a){if(!t?.selectionOverlay||!a?.featureKey)return;let s=t.index.featureByKey.get(a.featureKey),r=s?.domBoundsMm||s?.boundsMm;if(!r)return;let[n,i,o,c]=r,l=document.createElementNS(Ht,"rect");l.setAttribute("x",String(n)),l.setAttribute("y",String(i)),l.setAttribute("width",String(Math.max(.001,o-n))),l.setAttribute("height",String(Math.max(.001,c-i))),l.setAttribute("rx","0.65"),l.setAttribute("ry","0.65"),l.setAttribute("class","prism-svg-selection-box"),t.selectionOverlay.append(l)}fitPage(){if(!this.svg||!this.activePage)return;let t=Ca(this.svg,this.activePage),a=t[2]||this.activePage.sourceWidthMm||this.activePage.widthMm||1,s=t[3]||this.activePage.sourceHeightMm||this.activePage.heightMm||1,r=this.host.getBoundingClientRect(),n=Math.min(r.width/a,r.height/s)*.92;this.view.scale=Fa(n,.02,80),this.view.tx=(r.width-a*this.view.scale)/2-t[0]*this.view.scale,this.view.ty=(r.height-s*this.view.scale)/2-t[1]*this.view.scale,this.applyTransform()}frameSelection(t=this.selected){if(!t?.featureKey||!this.active){this.fitPage();return}let a=this.index.featureToElements.get(t.featureKey)||[],s=Zn(a);if(!s)return;let r=this.host.getBoundingClientRect(),n=Math.max(1,s[2]-s[0]),i=Math.max(1,s[3]-s[1]),o=Math.min(r.width/n,r.height/i)*.36;this.view.scale=Fa(o,.04,80),this.view.tx=r.width/2-(s[0]+s[2])/2*this.view.scale,this.view.ty=r.height/2-(s[1]+s[3])/2*this.view.scale,this.applyTransform()}pan(t,a){this.active&&(this.view.tx+=t,this.view.ty+=a,this.applyTransform())}zoom(t,a,s){if(!this.active)return;let r=this.host.getBoundingClientRect(),n=(a??r.left+r.width/2)-r.left,i=(s??r.top+r.height/2)-r.top,o=this.screenToSvg(n,i),c=Math.exp(-t*.0016);this.view.scale=Fa(this.view.scale*c,.02,80),this.view.tx=n-o[0]*this.view.scale,this.view.ty=i-o[1]*this.view.scale,this.applyTransform()}screenToSvg(t,a){return[(t-this.view.tx)/Math.max(1e-6,this.view.scale),(a-this.view.ty)/Math.max(1e-6,this.view.scale)]}applyTransform(){this.container&&(this.container.style.transform=`translate3d(${this.view.tx}px, ${this.view.ty}px, 0) scale(${this.view.scale})`)}hasCachedSvg(t){return!!this.svgCache.get(this.svgUrlForPage(t))?.template}pruneMountedWorldPages(t=new Set){if(this.mountedPages.size<=this.maxMountedWorldPages)return;let a=[...this.mountedPages.entries()].filter(([s])=>!t.has(s)).sort((s,r)=>(s[1].lastUsed||0)-(r[1].lastUsed||0));for(let[s,r]of a){if(this.mountedPages.size<=this.maxMountedWorldPages)break;r.container.remove(),this.mountedPages.delete(s)}}pruneSvgCache(){let t=[...this.svgCache.entries()].filter(([,r])=>r?.template);if(t.length<=this.maxCachedSvgPages)return;let a=new Set([...this.mountedPages.values()].map(r=>this.svgUrlForPage(r.page)));this.activePage&&a.add(this.svgUrlForPage(this.activePage));let s=t.filter(([r])=>!a.has(r)).sort((r,n)=>(r[1].lastUsed||0)-(n[1].lastUsed||0));for(let[r]of s){if([...this.svgCache.values()].filter(n=>n?.template).length<=this.maxCachedSvgPages)break;this.svgCache.delete(r)}}updateCacheStats(){let t=[...this.svgCache.values()].filter(s=>s?.template);this.lastStats.cachedSvgPages=t.length,this.lastStats.cachedSvgBytes=t.reduce((s,r)=>s+(r.byteLength||0),0);let a=performance?.memory;this.lastStats.heapMb=a?.usedJSHeapSize?a.usedJSHeapSize/1048576:null}};function $f(e,t,a){for(let n of[...e.querySelectorAll("*")]){if(qf.has(n.localName.toLowerCase())){n.remove();continue}for(let i of[...n.attributes]){let o=i.name,c=o.toLowerCase(),l=i.value||"";if(c.startsWith("on")){n.removeAttribute(o);continue}if((c==="href"||c==="xlink:href"||c==="src")&&ti(l)){if((c==="href"||c==="xlink:href")&&n.localName.toLowerCase()==="image"&&lu(l))continue;n.removeAttribute(o);continue}c==="style"&&n.setAttribute(o,uu(l))}}let s=`prism-${Os(a)}-`,r=new Map;for(let n of e.querySelectorAll("[id]")){let i=n.getAttribute("id"),o=`${s}${Os(i)}`;r.set(i,o),n.setAttribute("id",o)}for(let n of e.querySelectorAll("*"))for(let i of[...n.attributes]){let o=i.name.toLowerCase(),c=i.value||"";Xf.has(o)&&(c.startsWith("#")&&r.has(c.slice(1))?c=`#${r.get(c.slice(1))}`:fu(c)&&(c=new URL(c,t).toString())),c=hu(c,r),n.setAttribute(i.name,c)}}function Xn(e,t,a){let s=new Map,r=new Map,n=new Map,i=[];for(let p of a){let g=eu(p,t);i.push(g),r.set(g.stableKey,g),n.set(Number(g.id||0),g);for(let v of tu(g))s.has(v)||s.set(v,[]),s.get(v).push(g)}let o=new Map,c=new Map,l=new Map;for(let p of i)l.set(p.stableKey,p);for(let p of e.querySelectorAll("[data-uuid], [data-element-key], [data-primitive], [data-ref], [data-pin], [data-object-id], [data-designator], [data-component]")){let g=Qf(p,s,t);if(g&&!ei(g)||!g&&!du(p))continue;let v=au(p,t),x=g?.stableKey||v,u=g?.netUid||"",d=g?.netName||"";p.classList.add("prism-feature"),p.dataset.featureKey=x,p.dataset.sourceId=g?.sourceId||p.dataset.uuid||p.dataset.elementKey||"",p.dataset.role=g?.kind||p.dataset.primitive||p.dataset.ref||"feature",g?.id&&(p.dataset.featureId=String(g.id)),u&&(p.dataset.netUid=u),d&&(p.dataset.netName=d),p.id||(p.id=`prism-feature-${Os(x)}`),Qn(o,x,p),l.set(x,g||{id:0,stableKey:x,kind:p.dataset.role,sourceId:p.dataset.sourceId,sheetInstancePath:t.sheetInstancePath||""}),u&&Qn(c,u,p)}for(let[p,g]of o){let v=l.get(p),x=Zn(g);v&&x&&(v.domBoundsMm=nu(v.boundsMm,x))}return{featureToElements:o,netToElements:c,featureByKey:l,byId:n,bySource:s,features:i}}function Qf(e,t,a){let r=[e.dataset.uuid,e.dataset.elementKey,e.dataset.sourceId,e.dataset.objectId,e.dataset.componentUid,e.dataset.componentUuid,e.dataset.ref&&`${e.dataset.ref}:${e.dataset.pin||""}`].filter(Boolean).flatMap(i=>t.get(i)||[]);if(!r.length)return null;let n=String(e.dataset.primitive||e.dataset.ref||e.dataset.pin||"").toLowerCase();return r.map(i=>({feature:i,score:Zf(i,n,a)})).sort((i,o)=>o.score-i.score)[0].feature}function Zf(e,t,a){let s=0,r=String(e.kind||"").toLowerCase();return e.sheetInstancePath===a.sheetInstancePath&&(s+=20),e.netUid&&(s+=4),t&&r.includes(t)&&(s+=8),t==="symbol"&&r==="symbol_body"&&(s+=12),(t==="label"||t==="port")&&(r.includes("label")||r.includes("port"))&&(s+=12),t==="sheet"&&r==="sheet"&&(s+=12),r!=="record"&&(s+=2),r.includes("pin")&&(s+=2),s}function eu(e,t){let a=e.sourceId||e.sourceUid||e.uuid||e.objectId||e.stableKey||"";return{...e,id:Number(e.id||0),sourceId:a,stableKey:e.stableKey||`${t.sheetInstancePath||t.id}|${a}|0|${e.kind||"feature"}|0`,sheetInstancePath:e.sheetInstancePath||t.sheetInstancePath||""}}function tu(e){let t=new Set([e.sourceId,e.sourceUid,e.uuid,e.objectId,e.stableKey].filter(Boolean).map(String));return e.reference&&e.pinNumber&&t.add(`${e.reference}:${e.pinNumber}`),e.componentDesignator&&t.add(e.componentDesignator),e.reference&&t.add(e.reference),[...t]}function au(e,t){let a=e.dataset.uuid||e.dataset.elementKey||e.dataset.objectId||e.dataset.ref||e.id||"svg",s=e.dataset.primitive||e.dataset.role||e.localName||"feature";return`${t.sheetInstancePath||t.id}|${a}|0|${s}|0`}function su(e){let t=document.createElementNS(Ht,"style");t.textContent=`
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
  `,e.prepend(t)}function Wn(e){let t=document.createElementNS(Ht,"g");return t.setAttribute("class","prism-svg-net-overlay"),t.setAttribute("data-prism-overlay","net-highlight"),e.append(t),t}function Jn(e){let t=document.createElementNS(Ht,"g");return t.setAttribute("class","prism-svg-selection-overlay"),t.setAttribute("data-prism-overlay","selection"),t.style.pointerEvents="none",e.append(t),t}function ru(e){let t=e.cloneNode(!0);t.removeAttribute("id"),t.removeAttribute("data-feature-key"),t.removeAttribute("data-net-uid"),t.removeAttribute("data-net-name"),t.classList.add("prism-svg-net-overlay-clone");for(let a of[t,...Array.from(t.querySelectorAll?.("*")||[])])a instanceof SVGElement&&(a.removeAttribute("filter"),a.style.pointerEvents="none",a.style.stroke="#18ef52",a.style.fill="none",a.style.opacity="0.98",a.style.vectorEffect="non-scaling-stroke");return t}function Zn(e){let t=null;for(let a of e)if(a.getBBox)try{let s=a.getBBox(),r=[s.x,s.y,s.x+s.width,s.y+s.height];t=t?[Math.min(t[0],r[0]),Math.min(t[1],r[1]),Math.max(t[2],r[2]),Math.max(t[3],r[3])]:r}catch{}return t}function nu(e,t){return e?t?[Math.min(e[0],t[0]),Math.min(e[1],t[1]),Math.max(e[2],t[2]),Math.max(e[3],t[3])]:e:t}function Ca(e,t){let a=e.getAttribute("viewBox");if(a){let s=a.trim().split(/[\s,]+/).map(Number);if(s.length===4&&s.every(Number.isFinite))return s}return[0,0,t.sourceWidthMm||t.widthMm||1,t.sourceHeightMm||t.heightMm||1]}function Yn(){return{featureToElements:new Map,netToElements:new Map,featureByKey:new Map,byId:new Map,bySource:new Map,features:[]}}function iu(e){let t=e?.container?.getBoundingClientRect?.();if(!e?.svg||!e?.page||!t?.width||!t?.height)return .1;let a=Ca(e.svg,e.page);return Math.max(a[2]/t.width,a[3]/t.height)}function ou(e){let t=String(e?.kind||"").toLowerCase(),a=String(e?.semanticRole||"").toLowerCase(),s=`${e?.sourceId||""} ${e?.objectId||""} ${e?.text||""}`.toLowerCase();return t.includes("page")||a.includes("page")||t.includes("background")||a.includes("background")||s.includes("background")||s.includes("sheet_header")||s.includes("sheet header")||s.includes("drawing-sheet")}function cu(e){let t=String(e?.kind||e?.semanticRole||"").toLowerCase();return t.includes("pin")?90:t.includes("label")||t.includes("port")?78:t.includes("wire")||t.includes("bus")||t.includes("junction")?70:t.includes("symbol")||t.includes("component")?54:t.includes("image")?30:20}function ei(e){if(!e||ou(e))return!1;let t=String(e.kind||e.semanticRole||"").toLowerCase();return["pin","label","port","wire","bus","junction","no_connect","symbol","component","sheet","image","text"].some(a=>t.includes(a))}function du(e){let t=`${e?.dataset?.primitive||""} ${e?.dataset?.ref||""} ${e?.dataset?.role||""} ${e?.dataset?.objectId||""} ${e?.dataset?.text||""}`.toLowerCase();return!t||t.includes("background")||t.includes("sheet_header")||t.includes("sheet header")||t.includes("drawing-sheet")?!1:["pin","label","port","wire","bus","junction","no_connect","symbol","component","sheet","image","text"].some(a=>t.includes(a))}function $n(e){return String(e?.kind||e?.feature?.kind||"").toLowerCase()==="sheet"}function Qn(e,t,a){e.has(t)||e.set(t,[]),e.get(t).push(a)}function ti(e){let t=String(e||"").trim().toLowerCase();return!t||t.startsWith("#")?!1:t.startsWith("javascript:")||t.startsWith("data:")||t.startsWith("http://")||t.startsWith("https://")}function lu(e){return/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(String(e||"").trim())}function fu(e){let t=String(e||"").trim();return t&&!t.startsWith("#")&&!/^[a-z][a-z0-9+.-]*:/i.test(t)}function uu(e){return String(e||"").replace(/url\(([^)]+)\)/gi,(t,a)=>{let s=a.trim().replace(/^['"]|['"]$/g,"");return ti(s)?"none":t})}function hu(e,t){let a=String(e||"");return a=a.replace(/url\(#([^)]+)\)/g,(s,r)=>t.has(r)?`url(#${t.get(r)})`:s),a=a.replace(/^#(.+)$/,(s,r)=>t.has(r)?`#${t.get(r)}`:s),a}function Os(e){return String(e||"").trim().replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,96)||"item"}function Fa(e,t,a){return Math.max(t,Math.min(a,e))}var bu=512*1024*1024,gu=.65,pu=120,mu=12,yu=48,hi=230,xu=40,wu=4,ge=window.__TOPOLOGY__||{},Ee=window.__SEMANTIC_GEOMETRY__||{},Va={stage:"semantic-ready",progress:100},Vs=document,pt,W,ve,za,Ha,qa,Wt,es,Ve,Pa,Pe,ue,Ie,Da,Xa,Jt,we,Y,ts,as,Re,_t,ee=e=>Vs.querySelector(e),wt=e=>Vs.querySelectorAll(e);function vu(e=document){Vs=e,pt=ee("#app"),W=ee("#viewport"),ve=ee("#schematic-viewport"),za=ee("#schematic-dom-layer"),Ha=ee("#schematic-flow-overlay"),qa=ee("#bom-view"),Wt=ee("#status")||{set textContent(t){}},es=ee("#viewer-kind")||{set textContent(t){}},Ve=ee("#selection")||{set textContent(t){}},Pa=ee("#diagnostics")||{set innerHTML(t){}},Pe=ee("#layers"),ue=ee("#search-controls"),Ie=ee("#view-controls"),Re=ee("#stackup-workspace-view"),Da=ee("#fallback"),Xa=ee("#panel-labels"),Jt=ee("#schematic-labels"),we=ee("#axis-gizmo"),Y=ee("#selection-card"),ts=ee("#primary-heading"),as=ee("#primary-description"),_t=ee("#mode-switch"),pt.classList.add("workspace-pcb")}function bi(){return{workspace:"pcb",mode:"3d",compareLayers:new Set,desiredCompareLayers:new Set,visible3dLayers:new Set,activeNetId:0,highlightedNetIds:new Set,selectedFeatureId:0,selectionAnchor:null,showBoard:!0,showComponents:!0,showPlaceholders:!0,realisticColors:!0,isolateNet:!1,hiddenComponents:new Set,savedShowBoard:!0,savedShowComponents:!0,preIsolation3dLayers:null,preIsolationCompareLayers:null,preIsolationShowBoard:null,separation:0,dragging:!1,dragMode:"orbit",lastX:0,lastY:0,pointerStartX:0,pointerStartY:0,loadedBytes:0,triangles:0,residentTileBytes:0,residentTileGpuBytes:0,residentTileTriangles:0,tileLoads:0,tileEvictions:0,tileSchedulerMs:0,lastTileScheduleAt:0,visibleTileIds:new Set,frameCpuMs:0,frameCpuP95Ms:0,frameIntervalMs:0,frameIntervalP95Ms:0,frameSamples:[],fps:0,frames:0,fpsAt:performance.now(),activeTab:"layers",selectedPageId:"",selectedSchematicFeature:null,schematicDragging:!1,schematicLastX:0,schematicLastY:0,schematicStartX:0,schematicStartY:0}}function gi(){return{manifest:null,manifestUrl:"",layers:[],copperLayers:[],nets:[],features:new Map,tiles:new Map,loaded:new Set,loading:new Map,failed:new Map,residentTiles:new Map,componentFeatures:new Map,componentModelCounts:new Map,runtimeBounds:null,layerZOffsets:new Float32Array(256),layerZOffsetSignature:""}}function pi(){return{key:"",started:0,from:new Map,current:new Map}}function mi(){return{phase:"idle",previous:new Set,target:new Set,previousOffsets:new Map,started:0}}function yi(){return{manifest:null,manifestUrl:"",pages:[],byId:new Map,activeNetUid:"",visiblePages:[],fitted:!1,rendererMode:new URLSearchParams(location.search).get("schematicRenderer")||"svg-dom",domFallbackReason:""}}var b=bi(),M=gi(),be=pi(),V=mi(),O=yi(),Wa=[],Q,S,X,De,$,Ge,vt=new Map,Xt=performance.now(),Ae=0,Ua=0,zs=null,Us=null,Ls=null,Ps=!1,Oa=null,Ks=!1,Hs=()=>!0,Ja=!0;!window.__PRISM_SEMANTIC_VIEWER_MANUAL_BOOT__&&document.getElementById("app")&&Xs().catch(e=>{console.error(e),Wt&&(Wt.textContent="Renderer failed"),Da&&(Da.hidden=!1,Da.textContent=e.stack||e.message||String(e))});function Tu(e){let t=new Map((e.components||[]).map(s=>[s.uid,s])),a={};for(let s of e.terminals||[]){let r=s.net_uid;if(!r)continue;let n=t.get(s.component_uid)||{},i={designator:s.designator||n.designator||"",pin:s.pin||"",value:n.value||"",pcb_pad_id:s.pcb_pad_id||""};a[r]||(a[r]={terminals:[]});let o=a[r].terminals;o.some(c=>c.designator===i.designator&&c.pin===i.pin)||o.push(i)}return a}function Eu(e){if(!e||!ge||!ge.physical_objects)return 0;let t=ge.physical_objects.find(s=>s.uid===e);if(!t||!t.source_ids||!t.source_ids.length)return 0;let a=t.source_ids[0];for(let[s,r]of M.features.entries())if(r.sourceUid===a)return s;return 0}function qs(e){return!e||!ge||!ge.components?null:ge.components.find(t=>t.designator===e)}function qt(e,t){for(let a of Object.keys(e))delete e[a];Object.assign(e,t)}function xi(){Ua&&(cancelAnimationFrame(Ua),Ua=0),window.removeEventListener("keydown",Ji),Q?.dispose?.(),Q=null,S=null,X?.dispose?.(),X=null,De=null,zs=null,Hs=()=>!0,Ja=!0}function ku(){return Ae+=1,xi(),qt(b,bi()),qt(M,gi()),qt(be,pi()),qt(V,mi()),qt(O,yi()),Wa=[],$=null,Ge=null,vt=new Map,Xt=performance.now(),Ae}function Mu(e){e===Ae&&(Ae+=1,xi())}function Gs(e){e===Ae&&(Ua=requestAnimationFrame(t=>$u(t,e)))}function Te(e){return e===Ae}async function Xs(e={}){let t=ku(),a={};if(ge=e.topology||window.__TOPOLOGY__||{},ge&&!ge.net_details&&(ge.net_details=Tu(ge)),Ee=e.semanticGeometry||window.__SEMANTIC_GEOMETRY__||{},Va=e.readiness||Ee.readiness||{stage:"semantic-ready",progress:100},zs=typeof e.onSelectionChange=="function"?e.onSelectionChange:null,Ls=typeof e.onContextMenu=="function"?e.onContextMenu:null,Us=typeof e.onViewStateChange=="function"?e.onViewStateChange:null,Hs=typeof e.isActive=="function"?e.isActive:()=>!0,Ja=e.workspaceScope!=="3d",vu(e.root||document),!pt||!W)throw new Error("Semantic viewer shell is missing required DOM nodes");return await Au(t,a,e.onPerformanceEvent),{performance:a,setSelection(s){Ks=!0;try{if(!s)Et();else if(s?.netName||s?.netUid){let r=s.netUid&&M.nets.find(n=>n.uid===s.netUid)||s.netName&&Ot(M.nets,s.netName);r&&$a(Number(r.id),!0)}else s?.netId?$a(Number(s.netId),!0):s?.featureId?Ft(Number(s.featureId),!0):s?.reference&&ar(String(s.reference),!0)}finally{Ks=!1}},resize(){Q?.resize(),S?.resize(),b.workspace==="pcb"&&b.mode==="layer"&&Zs()},setWorkspace(s){let r=s==="stackup"?"stackup":"pcb";b.workspace!==r&&Xi(r)},setHiddenComponents(s){return xh(s)},getComponentReferences(){return[...M.componentFeatures.keys()]},setHighlightedNets(s){return Iu(s)},getViewState:wi,setViewMode:Li,setLayerVisible:Ki,applyLayerPreset:Gi,setShowBoard:Vi,setShowComponents:zi,setShowPlaceholders:bh,setRealisticColors:gh,setSeparation:Hi,showNetLayers:tr,setNetIsolation:jt,dispose(){Mu(t)}}}function Yt(){!Us||Ps||(Ps=!0,queueMicrotask(()=>{Ps=!1,Us?.(wi())}))}function wi(){let e=b.mode==="3d"?b.visible3dLayers:b.desiredCompareLayers;return{mode:b.mode,layers:M.copperLayers.map(t=>({id:Number(t.id),name:String(t.name),color:$i(Qs(t)),visible:e.has(Number(t.id))})),showBoard:b.showBoard,showComponents:b.showComponents,showPlaceholders:b.showPlaceholders,realisticColors:b.realisticColors,separation:b.separation,isolateNet:b.isolateNet,hasNet:!!b.activeNetId||Xe().size>0}}function Ws(e){Ks||zs?.(e)}function vi(e,t=null){return e?{kind:"net",sourceContext:"3D",netName:String(e.name||""),netUid:String(e.uid||"")||void 0,netCode:Number(e.id||0)||void 0,featureId:Number(t?.id||0)||void 0,uuid:String(t?.sourceUid||"")||void 0}:null}function Ru(e){if(!e)return null;let t=Nt(e),a=String(e.padNumber||e.pin||e.pinNumber||""),s=M.nets.find(r=>Number(r.id)===Number(e.netId||0));if(t&&a)return{kind:"terminal",sourceContext:"3D",reference:t,pin:a,netUid:s?.uid,netName:s?.name,netCode:s?Number(s.id):void 0,uuid:String(e.sourceUid||"")||void 0,featureId:Number(e.id||0)||void 0};if(t){let r=qs(t);return{kind:"component",sourceContext:"3D",reference:t,componentUid:r?.uid,uuid:String(e.sourceUid||"")||void 0,featureId:Number(e.id||0)||void 0}}return vi(s,e)}function Ti(){b.showBoard=!0,b.showComponents=!0,Tt(),typeof Fe=="function"&&Fe()}function Xe(){let e=new Set(b.highlightedNetIds);return b.activeNetId&&e.add(Number(b.activeNetId)),e}function Iu(e){let t=Array.isArray(e)?e:[],a=xr(M.nets,t),s=Xe().size>0;b.highlightedNetIds=a,Q?.setEmphasizedNetIds(a);let r=Xe().size>0;return r&&!s?Js():!r&&s&&Ei(),b.isolateNet&&r&&ea(),pe(performance.now(),{force:!0}),{applied:a.size,requested:t.length}}function Js(){(b.showBoard||b.showComponents)&&(b.savedShowBoard=b.showBoard,b.savedShowComponents=b.showComponents),b.showBoard=!1,b.showComponents=!1,Tt(),typeof Fe=="function"&&Fe()}function Ei(){b.showBoard=b.savedShowBoard!==!1,b.showComponents=b.savedShowComponents!==!1,Tt(),typeof Fe=="function"&&Fe()}async function Au(e,t={},a=null){let s=performance.now(),r=Ee.assets?.scene_manifest||Ee.semantic_gltf?.path,n=performance.now();if(r){if(M.manifestUrl=new URL(r,location.href).toString(),M.manifest=await Nu(M.manifestUrl),t.scene_manifest_fetch_parse_ms=performance.now()-n,!Te(e))return;if(M.manifest.schema!=="prism.semantic_gltf_a0")throw new Error(`Unsupported scene schema: ${M.manifest.schema}`)}else M.manifest={schema:"prism.semantic_gltf_partial.a0",bbox:null,layers:[],nets:[],objectFeatures:[],components:[],tiles:[],barrels:[]},t.scene_manifest_fetch_parse_ms=0;n=performance.now(),M.layers=M.manifest.layers||[],M.copperLayers=M.layers.filter(l=>l.role==="copper"||String(l.name).endsWith(".Cu")),M.nets=M.manifest.nets||[];for(let l of M.manifest.objectFeatures||[])M.features.set(Number(l.id),{...l,bounds:$s(l.boundsMm)});for(let l of M.manifest.components||[])M.componentFeatures.set(l.designator,l),M.features.set(Number(l.featureId),{...l,kind:"component",sourceUid:l.uid,netId:0,bounds:null});for(let l of M.manifest.tiles||[])M.tiles.set(l.id,l);t.scene_manifest_index_ms=performance.now()-n;let i=Mi();for(let l of i)b.compareLayers.add(l),b.desiredCompareLayers.add(l);for(let l of M.copperLayers)b.visible3dLayers.add(Number(l.id));if(n=performance.now(),Q=await Ra.create(W),t.webgpu_renderer_create_ms=performance.now()-n,!Te(e)){Q?.dispose?.(),Q=null;return}Q.setBarrels(M.manifest.barrels||[]),er(),n=performance.now();let o=await Gu(e);if(t.board_fetch_parse_upload_ms=performance.now()-n,!Te(e)||(M.runtimeBounds=o||Si(M.manifest.bbox),$=new na(M.runtimeBounds),Ja&&(await Su(e),!Te(e)||(await _u(e),!Te(e)))))return;n=performance.now(),Oi(),kh(),Ja&&(Ih(),Rh()),mh(),_h(),t.controls_and_bindings_ms=performance.now()-n;let c={"board-ready":"Board ready \xB7 components and semantic layers are still generating","components-ready":"Board and components ready \xB7 semantic layers are still generating","semantic-ready":"WebGPU semantic glTF active"};if(Wt.textContent=c[Va.stage]||"Loading 3D assets",Ee.assets?.components_glb){let l=performance.now();Hu(e).then(()=>{Te(e)&&(ii(o),a?.({schema:"prism.semantic_viewer_performance.a0",milestone:"components-loaded",readiness_stage:Va.stage,elapsed_ms:performance.now()-l,bytes_loaded:b.loadedBytes}))})}else ii(o);pe(performance.now(),{force:!0}),Gs(e),n=performance.now(),await new Promise(l=>requestAnimationFrame(l)),t.first_frame_wait_ms=performance.now()-n,t.boot_total_ms=performance.now()-s}async function Su(e=Ae){let t=Ee.assets?.schematic_native_manifest||Ee.schematic_vector?.path||Ee.schematic_scene?.path,a=Ee.assets?.schematic_manifest||Ee.schematic_world?.path,s=ee("[data-workspace=schematic]");if(!t&&!a){s.disabled=!0,s.title="No schematic world assets are available";return}let r=[t,a].filter(Boolean),n=null;for(let o of r)try{O.manifestUrl=new URL(o,location.href).toString();let c=await Na.create(ve,O.manifestUrl);if(!Te(e))return;S=c,S.setFlowOverlayCanvas(Ha);break}catch(c){if(n=c,S=null,o===a)throw c}if(!S)throw n||new Error("Failed to load schematic viewer assets");O.manifest=S.manifest,O.pages=S.pages,O.byId=new Map(O.pages.map(o=>[o.id,o])),b.selectedPageId=O.pages[0]?.id||"",S.selectedPageId=b.selectedPageId,!["native","legacy","webgpu"].includes(String(O.rendererMode).toLowerCase())&&(X=Ba.create(za,O.manifestUrl,O.manifest,S.featuresByPage,{onSelect:lh,onBlank:Zt,onHighlightNet:Di,onOpenPage:ch,onFallback:o=>{O.domFallbackReason=o,console.warn(o)}}),X.preloadPages(O.pages)),S.preloadOverview()}async function _u(e=Ae){let t=Ee.assets?.bom||Ee.bom?.path,a=ee("[data-workspace=bom]");if(!t){a&&(a.disabled=!0,a.title="No BoM artifact is available");return}try{let s=await ia.create(qa,new URL(t,location.href).toString(),{onSelectReference:r=>ar(r,!0)});if(!Te(e))return;De=s}catch(s){if(!Te(e))return;console.warn(s),a&&(a.disabled=!0,a.title=s?.message||"BoM artifact could not be loaded")}}async function Nu(e){let t=await fetch(e,{cache:"default"});if(!t.ok)throw new Error(`Failed to load ${e}: ${t.status}`);return t.json()}async function ju(e,t=Ae){if(!Te(t))return;let a=M.residentTiles.get(e.id);if(a){a.lastUsed=performance.now();return}if(M.failed.get(e.id))return;if(M.loading.has(e.id))return M.loading.get(e.id);let r=(async()=>{try{let n=await Lt(new URL(e.path,M.manifestUrl).toString(),{fetchCache:"no-store"});if(!Te(t)||!Q)return;b.loadedBytes+=n.byteLength;let i=M.layers.find(g=>Number(g.id)===Number(e.layerId)),o=[],c=0,l=0;for(let g of n.primitives){let v=Q.addPrimitive(g,{kind:"copper",tileId:e.id,layerId:Number(e.layerId),color:ji(i),stencilMark:Ni(i),baseZ:Number(i?.z_mm||0)/1e3,material:{baseColor:[1,1,1,1],metallic:.78,roughness:.32}});o.push(v),c+=g.indices.length/3,l+=Fu(g)}let p={tile:e,entries:o,byteLength:n.byteLength,gpuBytes:l,triangles:c,lastUsed:performance.now(),pinned:!1};M.residentTiles.set(e.id,p),M.loaded.add(e.id),b.tileLoads+=1,b.residentTileBytes+=n.byteLength,b.residentTileGpuBytes+=l,b.residentTileTriangles+=c,b.triangles=b.residentTileTriangles,M.failed.delete(e.id)}catch(n){if(!Te(t))return;let i=M.failed.get(e.id)||{count:0,message:""};M.failed.set(e.id,{count:i.count+1,message:n?.message||String(n)}),i.count||console.warn(`Failed to load tile ${e.id}; suppressing retries until assets are regenerated`,n)}finally{Te(t)&&M.loading.delete(e.id)}})();return M.loading.set(e.id,r),r}function Fu(e){return e.position.length/3*xu+e.indices.length*wu}function Cu(e){let t=M.residentTiles.get(e);t&&(Q.removeEntries(t.entries),M.residentTiles.delete(e),M.loaded.delete(e),b.residentTileBytes=Math.max(0,b.residentTileBytes-t.byteLength),b.residentTileGpuBytes=Math.max(0,b.residentTileGpuBytes-t.gpuBytes),b.residentTileTriangles=Math.max(0,b.residentTileTriangles-t.triangles),b.triangles=b.residentTileTriangles,b.tileEvictions+=1)}function pe(e=performance.now(),t={}){if(!Q||!$||b.workspace!=="pcb")return;let a=b.mode==="layer"&&V.phase==="preload";if(!t.force&&!a&&e-b.lastTileScheduleAt<pu)return;let s=performance.now();b.lastTileScheduleAt=e;let r=Bu();b.visibleTileIds=r;let n=M.loading.size,o=Math.max(0,(a?yu:mu)-n),c=[...r].map(p=>M.tiles.get(p)).filter(p=>p&&!M.residentTiles.has(p.id)&&!M.loading.has(p.id)&&!M.failed.has(p.id)).sort((p,g)=>ai(p)-ai(g)).slice(0,o),l=Ae;for(let p of c)ju(p,l);for(let p of r){let g=M.residentTiles.get(p);g&&(g.lastUsed=e)}Du(r),b.tileSchedulerMs=performance.now()-s}function Bu(){let e=new Set,t=b.mode==="3d"?b.visible3dLayers:Ou();if(!t.size||!Ge)return e;if(b.mode==="layer"){for(let r of M.tiles.values())t.has(Number(r.layerId))&&e.add(r.id);return e}let a=new Set,s=Xe();if(s.size){for(let r of M.tiles.values())if(t.has(Number(r.layerId))){for(let n of s)if(Ai(r,n)){a.add(r.id);break}}}for(let r of M.tiles.values()){if(!t.has(Number(r.layerId)))continue;let n=b.mode==="layer"?vt.get(Number(r.layerId)):null;Uu(r,Ge.matrix,n,gu)&&e.add(r.id)}for(let r of a)e.add(r);return e}function Ou(){return b.mode!=="layer"||V.phase==="idle"?b.compareLayers:Ri(V.previous,V.target)}function ki(){return b.mode!=="layer"?b.visible3dLayers:V.phase==="reveal"?Ri(V.previous,V.target):b.compareLayers}function Mi(){let e=M.copperLayers.map(t=>Number(t.id)).filter(Number.isFinite);return e.length?e.length===1?new Set([e[0]]):new Set([e[0],e[e.length-1]]):new Set}function Pu(){let e=b.desiredCompareLayers.size?b.desiredCompareLayers:b.compareLayers;return e.size?new Set([...e].map(Number)):Mi()}function Ri(...e){let t=new Set;for(let a of e)for(let s of a||[])t.add(Number(s));return t}function Du(e){if(b.mode==="layer")return;let t=bu;if(b.residentTileGpuBytes<=t)return;let a=[...M.residentTiles.values()].filter(s=>!e.has(s.tile.id)&&!M.loading.has(s.tile.id)).sort((s,r)=>s.lastUsed-r.lastUsed);for(let s of a){if(b.residentTileGpuBytes<=t)break;Cu(s.tile.id)}}function Uu(e,t,a=null,s=0){let r=Ii(e);if(!r)return!0;let n=Math.max(r[3]-r[0],r[4]-r[1])*s,i=[r[0]-n+(a?.[0]||0),r[1]-n+(a?.[1]||0),r[2]-.002,r[3]+n+(a?.[0]||0),r[4]+n+(a?.[1]||0),r[5]+.002];return Lu(i,t)}function Ii(e){let t=e.boundsMm;if(!t||t.length!==4)return null;let a=M.layers.find(r=>Number(r.id)===Number(e.layerId)),s=Number(a?.z_mm||0)/1e3;return[t[0]/1e3,-t[3]/1e3,s-4e-4,t[2]/1e3,-t[1]/1e3,s+4e-4]}function Lu(e,t){let a=[[e[0],e[1],e[2]],[e[3],e[1],e[2]],[e[0],e[4],e[2]],[e[3],e[4],e[2]],[e[0],e[1],e[5]],[e[3],e[1],e[5]],[e[0],e[4],e[5]],[e[3],e[4],e[5]]].map(r=>Ku(t,r));return![r=>r[0]<-r[3],r=>r[0]>r[3],r=>r[1]<-r[3],r=>r[1]>r[3],r=>r[2]<0,r=>r[2]>r[3]].some(r=>a.every(r))}function Ku(e,t){let a=t[0],s=t[1],r=t[2];return[e[0]*a+e[4]*s+e[8]*r+e[12],e[1]*a+e[5]*s+e[9]*r+e[13],e[2]*a+e[6]*s+e[10]*r+e[14],e[3]*a+e[7]*s+e[11]*r+e[15]]}function Ai(e,t){return Array.isArray(e.netIds)&&e.netIds.some(a=>Number(a)===Number(t))}function ai(e){let t=Ii(e);if(!t||!$)return 0;let a=(t[0]+t[3])*.5-$.focus[0],s=(t[1]+t[4])*.5-$.focus[1];return a*a+s*s}async function Gu(e=Ae){let t=Ee.assets?.base_board_glb;if(!t)return null;let a=Ee.assets?.soldermask_glb,[s,r]=await Promise.all([Lt(new URL(t,location.href).toString(),{defaultFeatureId:0}),a?Lt(new URL(a,location.href).toString(),{defaultFeatureId:0}).catch(i=>(console.warn("[prism-semantic-viewer] solder mask failed to load",i),null)):null]);if(!Te(e)||!Q)return null;b.loadedBytes+=s.byteLength,r&&(b.loadedBytes+=r.byteLength);let n=[...s.primitives.filter(i=>{let o=si(i);return o!=="pad"&&!(r&&o==="soldermask")}),...r?.primitives||[]];for(let i of Ys(n,si))Q.addPrimitive(i,{kind:"board",boardRole:i.groupKey,layerId:i.groupKey==="paste"?zu(i):0,material:i.material,color:i.material.baseColor});return Vu(n.map(i=>i.bounds))}function Vu(e){let t=e.filter(a=>Array.isArray(a)&&a.length===6);return t.length?t.reduce((a,s)=>[Math.min(a[0],s[0]),Math.min(a[1],s[1]),Math.min(a[2],s[2]),Math.max(a[3],s[3]),Math.max(a[4],s[4]),Math.max(a[5],s[5])],[...t[0]]):null}function $t(){return M.runtimeBounds||Si(M.manifest?.bbox)}function si(e){let t=`${e.nodeName||""} ${e.meshName||""} ${e.material?.name||""}`.toLowerCase();return t.includes("_pad")||t.includes(".pad")||t.endsWith("pad")?"pad":t.includes("silkscreen")?"silkscreen":t.includes("soldermask")?"soldermask":t.includes("paste")?"paste":"substrate"}function zu(e){let t=String(e.material?.name||"").endsWith("_bottom"),a=M.copperLayers,s=a.find(r=>r.name===(t?"B.Cu":"F.Cu"))||(t?a[a.length-1]:a[0]);return Number(s?.id||0)}async function Hu(e=Ae){let t=Ee.assets?.components_glb;if(!t)return;let a=await Lt(new URL(t,location.href).toString(),{componentFeatures:M.componentFeatures});if(!(!Te(e)||!Q)){b.loadedBytes+=a.byteLength;for(let s of a.primitives){let r=M.componentFeatures.get(s.designator);r&&Wu(r.featureId,s.position)}for(let[s,r]of a.componentNodeCounts||[])M.componentModelCounts.set(s,r);for(let s of Ys(a.primitives))Q.addPrimitive(s,{kind:"component",layerId:0,material:s.material,color:s.material.baseColor})}}var ri=4e-4,ni=5e-5,qu={baseColor:[.62,.7,.8,1],metallic:0,roughness:.8,emissive:[0,0,0]};function ii(e){if(!Q)return;let t=new Map;for(let n of ge.physical_objects||[])n.kind==="footprint_body"&&n.designator&&n.bbox_mm?.length===4&&t.set(n.designator,n);let a=(e?.[5]??8e-4)+ni,s=(e?.[2]??-8e-4)-ni,r=[];for(let n of M.componentFeatures.values()){let i=Number(n.featureId),o=M.features.get(i),c=t.get(n.designator);if(!o||o.bounds||!c)continue;let[l,p,g,v]=c.bbox_mm.map(Number),x=String(c.layer||"").startsWith("B."),u=[l/1e3,-v/1e3,x?s-ri:a,g/1e3,-p/1e3,x?s:a+ri];o.bounds=u,o.placeholder=!0,r.push(Xu(u,i))}if(r.length)for(let n of Ys(r))Q.addPrimitive(n,{kind:"component",layerId:0,material:n.material,color:n.material.baseColor,opacityScale:.3,translucent:!0,placeholder:!0})}function Xu([e,t,a,s,r,n],i){let o=[[[0,0,1],[[e,t,n],[s,t,n],[s,r,n],[e,r,n]]],[[0,0,-1],[[e,r,a],[s,r,a],[s,t,a],[e,t,a]]],[[1,0,0],[[s,t,a],[s,r,a],[s,r,n],[s,t,n]]],[[-1,0,0],[[e,r,a],[e,t,a],[e,t,n],[e,r,n]]],[[0,1,0],[[s,r,a],[e,r,a],[e,r,n],[s,r,n]]],[[0,-1,0],[[e,t,a],[s,t,a],[s,t,n],[e,t,n]]]],c=new Float32Array(72),l=new Float32Array(72),p=new Uint32Array(36);return o.forEach(([g,v],x)=>{v.forEach((d,m)=>{c.set(d,(x*4+m)*3),l.set(g,(x*4+m)*3)});let u=x*4;p.set([u,u+1,u+2,u,u+2,u+3],x*6)}),{position:c,normal:l,netId:new Uint32Array(24),objectFeatureId:new Uint32Array(24).fill(i),indices:p,material:qu,bounds:[e,t,a,s,r,n]}}function Ys(e,t=()=>""){let a=new Map;for(let s of e){let n=`${t(s)}:${JSON.stringify(s.material)}`;a.has(n)||a.set(n,[]),a.get(n).push(s)}return[...a.values()].map(s=>{let r=s.reduce((u,d)=>u+d.position.length/3,0),n=s.reduce((u,d)=>u+d.indices.length,0),i=new Float32Array(r*3),o=new Float32Array(r*3),c=new Uint32Array(r),l=new Uint32Array(r),p=new Uint32Array(n),g=0,v=0,x=[1/0,1/0,1/0,-1/0,-1/0,-1/0];for(let u of s){let d=u.position.length/3;i.set(u.position,g*3),o.set(u.normal,g*3),c.set(u.netId,g),l.set(u.objectFeatureId,g);for(let m=0;m<u.indices.length;m+=1)p[v+m]=Number(u.indices[m])+g;u.bounds&&(x[0]=Math.min(x[0],u.bounds[0]),x[1]=Math.min(x[1],u.bounds[1]),x[2]=Math.min(x[2],u.bounds[2]),x[3]=Math.max(x[3],u.bounds[3]),x[4]=Math.max(x[4],u.bounds[4]),x[5]=Math.max(x[5],u.bounds[5])),g+=d,v+=u.indices.length}return{position:i,normal:o,netId:c,objectFeatureId:l,indices:p,material:s[0].material,groupKey:t(s[0]),bounds:Number.isFinite(x[0])?x:null}})}function $s(e){return!e||e.length!==6?null:[e[0]/1e3,-e[4]/1e3,e[2]/1e3,e[3]/1e3,-e[1]/1e3,e[5]/1e3]}function Si(e){let t=e?.min||[0,0,0],a=e?.max||[.08,.0016,.05];return[t[0],-a[2],t[1],a[0],-t[2],a[1]]}function Wu(e,t){let a=M.features.get(Number(e));if(!a||!t.length)return;let s=[1/0,1/0,1/0,-1/0,-1/0,-1/0];for(let r=0;r<t.length;r+=3)s[0]=Math.min(s[0],t[r]),s[1]=Math.min(s[1],t[r+1]),s[2]=Math.min(s[2],t[r+2]),s[3]=Math.max(s[3],t[r]),s[4]=Math.max(s[4],t[r+1]),s[5]=Math.max(s[5],t[r+2]);a.bounds=a.bounds?[Math.min(a.bounds[0],s[0]),Math.min(a.bounds[1],s[1]),Math.min(a.bounds[2],s[2]),Math.max(a.bounds[3],s[3]),Math.max(a.bounds[4],s[4]),Math.max(a.bounds[5],s[5])]:s}function Qs(e){if(typeof e?.color=="string"&&/^#[0-9a-fA-F]{6}$/.test(e.color))return[...oi(e.color),1];let t={"F.Cu":"#a9423c","B.Cu":"#315b9a","In1.Cu":"#477a55","In2.Cu":"#806244","In3.Cu":"#347c86","In4.Cu":"#685889","In5.Cu":"#92793e"},a=["#477a55","#806244","#347c86","#685889","#92793e","#82556e"],s=String(e?.name||""),r=Math.max(0,M.copperLayers.findIndex(n=>n.name===s)-1);return[...oi(t[s]||a[r%a.length]),1]}var Ju=[.55,.35,.16,.78],La={gold:[.83,.69,.37,1],silver:[.74,.75,.77,1],copper:[.76,.47,.28,1]};function _i(){let e=String(ge?.board?.stackup?.copper_finish||"").toLowerCase();return/hasl|hal\b|tin|silver|lead/.test(e)?La.silver:/osp|bare|none/.test(e)?La.copper:La.gold}function Ni(e){let t=String(e?.name||""),a=M.copperLayers;return!!t&&(t===a[0]?.name||t===a[a.length-1]?.name)}var Yu=.25;function Ya(){return!b.realisticColors||b.mode==="layer"?0:1-ne(b.separation/Yu,0,1)}function ji(e){let t=Ni(e)?_i():La.copper;return Fi(Qs(e),t,Ya())}function Fi(e,t,a){return e.map((s,r)=>s+(t[r]-s)*a)}function oi(e){let t=e.replace("#","");return[0,2,4].map(a=>parseInt(t.slice(a,a+2),16)/255)}function $u(e,t=Ae){if(t!==Ae||!Q||!$)return;let a=performance.now(),s=Math.max(0,e-Xt);if(b.workspace==="schematic"&&S){Xt=e;let l=S.visiblePages(),p=X?ah(l):[];S.setDomDetailPageIds(p.map(g=>g.id)),O.visiblePages=S.render(),X?.syncWorldPages(p,S,{activeNetUid:O.activeNetUid}),Yi(),li(s,performance.now()-a),ui(e),Gs(t);return}let r=Math.min(.05,(e-Xt)/1e3);Xt=e,$.update(r),Q.resize();let n=Ci();M.copperRealism!==Ya()&&er();for(let l of Q.entries)l.layerOffset=n[l.layerId]||0;sh(e),vt=Bi(e);let i=nh(e);Ge={layerId:0,viewport:{x:0,y:0,width:W.width,height:W.height},matrix:$.matrix(W.width,W.height,b.mode==="layer")},pe(e);let o=b.mode==="3d"?b.visible3dLayers:ki(),c={panels:[Ge],activeNetId:b.activeNetId,selectedFeatureId:b.selectedFeatureId,time:e/1e3,layerOffsets:n,visibleLayers:o,showBoard:b.showBoard,showComponents:b.showComponents,showPaste:b.separation===0,componentOpacity:ne(1-b.separation/.1,0,1),boardOpacity:Xe().size?.34:1-b.separation*.72,isolateNet:b.isolateNet,compareMode:b.mode==="layer",compareOffsets:vt,layerAlphas:i,visibleTileIds:b.mode==="3d"?b.visibleTileIds:null};Zu(e,c)&&(Q.render(c),Sh(),Nh()),li(s,performance.now()-a),ui(e),Gs(t)}var Qu=1e3,Ke={key:"",matrix:new Float32Array(16),tiles:null,at:0};function Zu(e,t){let a=t.panels[0].matrix,s=!1;for(let o=0;o<16;o+=1)if(a[o]!==Ke.matrix[o]){s=!0;break}if(s)return Ke.matrix.set(a),Ke.key="",Ke.at=e,!0;let r=[W.width,W.height,Q.version,b.workspace,b.mode,t.activeNetId,t.selectedFeatureId,t.showBoard,t.showComponents,t.showPaste,t.componentOpacity,t.boardOpacity,t.isolateNet,M.layerZOffsetSignature,[...t.visibleLayers].join(","),[...t.compareOffsets].map(([o,c])=>`${o}:${c}`).join(";"),t.layerAlphas?[...t.layerAlphas].join(";"):""].join("|");return!!(t.activeNetId||t.selectedFeatureId||Q.emphasizedNetIds.size)||r!==Ke.key||!eh(t.visibleTileIds,Ke.tiles)||e-Ke.at>Qu?(Ke.key=r,Ke.tiles=t.visibleTileIds,Ke.at=e,!0):!1}function eh(e,t){if(!e||!t)return e===t;if(e.size!==t.size)return!1;for(let a of e)if(!t.has(a))return!1;return!0}function th(e){if(!S||!e)return{widthPx:0,heightPx:0,sourcePxPerMm:0,area:0};let t=S.pagePixelWidth(e),a=e.heightMm/Math.max(1e-6,S.scale),s=S.pageSourcePixelsPerMm(e);return{widthPx:t,heightPx:a,sourcePxPerMm:s,area:t*a}}function ah(e){if(!X||!S)return[];let t=e||[],a=Math.max(1,ve.clientWidth*ve.clientHeight);return t.map(n=>({page:n,...th(n)})).filter(n=>n.widthPx>=760&&n.heightPx>=520&&n.area>=a*.36&&n.sourcePxPerMm>=1.25).sort((n,i)=>i.area-n.area).slice(0,1).map(n=>n.page)}function Ci(){let e=$t(),t=Math.hypot((e[3]-e[0])*1e3,(e[4]-e[1])*1e3),a=b.separation*b.separation*ne(t*.12,8,25)/1e3,s=`${b.separation}:${a}:${M.copperLayers.length}`;if(M.layerZOffsetSignature===s)return M.layerZOffsets;let r=M.layerZOffsets;r.fill(0);let n=(M.copperLayers.length-1)/2;return M.copperLayers.forEach((i,o)=>{r[Number(i.id)]=(n-o)*a}),M.layerZOffsetSignature=s,r}function Bi(e){if(b.mode!=="layer")return be.key="3d",be.current.clear(),new Map;let t=M.copperLayers.filter(m=>b.compareLayers.has(Number(m.id))),a=Math.max(1,t.length),s=W.width/Math.max(1,W.height),r=1;a===2?r=s>=1?2:1:a===3||a===4?r=2:a>4&&(r=Math.ceil(Math.sqrt(a*s)));let n=Math.ceil(a/r),i=$t(),o=i[3]-i[0],c=i[4]-i[1],l=o*1.18,p=c*1.22,g=t.map((m,f)=>{let h=f%r,y=Math.floor(f/r);return{layer:m,layerId:Number(m.id),column:h,row:y,offset:[(h-(r-1)/2)*l,((n-1)/2-y)*p,0]}}),v=`${r}x${n}:${g.map(m=>m.layerId).join(",")}`;if(v!==be.key){be.key=v,be.started=e,be.from=new Map(be.current);let m=r*o+(r-1)*(l-o),f=n*c+(n-1)*(p-c);$.targetFocus=[(i[0]+i[3])/2,(i[1]+i[4])/2,(i[2]+i[5])/2],$.targetOrthoScale=Math.max(f,m/s)*1.08}let x=ne((e-be.started)/420,0,1),u=1-Math.pow(1-x,3),d=new Map;for(let m of g){let f=be.from.get(m.layerId)||[0,0,0],h=m.offset.map((y,w)=>f[w]+(y-f[w])*u);d.set(m.layerId,h),be.current.set(m.layerId,h)}if(V.phase==="reveal")for(let m of V.previous)d.has(Number(m))||d.set(Number(m),V.previousOffsets.get(Number(m))||[0,0,0]);for(let m of[...be.current.keys()])g.some(f=>f.layerId===m)||be.current.delete(m);return d}function Qt(e){let t=new Set([...e].map(Number));if(!(ci(t,b.desiredCompareLayers)&&V.phase!=="idle")){if(b.desiredCompareLayers=t,ci(t,b.compareLayers)){V.phase="idle",V.previous.clear(),V.target.clear();return}V.phase="preload",V.previous=new Set(b.compareLayers),V.target=new Set(t),V.previousOffsets=new Map(be.current),V.started=performance.now(),pe(V.started,{force:!0})}}function Zs({snap:e=!0}={}){b.mode="layer";let t=Pu();b.desiredCompareLayers=new Set(t),!b.compareLayers.size&&t.size&&(b.compareLayers=new Set(t)),V.phase="idle",V.previous.clear(),V.target.clear(),be.key="",$.setAxis("z",!1),Q?.resize(),vt=Bi(performance.now()),e&&$.snap(),pe(performance.now(),{force:!0})}function sh(e){if(!(b.mode!=="layer"||V.phase==="idle")){if(V.phase==="preload"){if(!rh(V.target)){pe(e,{force:!0});return}V.phase="reveal",V.started=e,V.previousOffsets=new Map(be.current),b.compareLayers=new Set(V.target),be.key="";return}V.phase==="reveal"&&e-V.started>=hi&&(b.compareLayers=new Set(V.target),V.phase="idle",V.previous.clear(),V.target.clear(),V.previousOffsets.clear(),pe(e,{force:!0}))}}function rh(e){for(let t of M.tiles.values())if(e.has(Number(t.layerId))&&!M.residentTiles.has(t.id)&&!M.failed.has(t.id))return!1;return!0}function nh(e){if(b.mode!=="layer"||V.phase!=="reveal")return null;let t=ne((e-V.started)/hi,0,1),a=t*t*(3-2*t),s=new Map;for(let r of V.previous)s.set(Number(r),V.target.has(Number(r))?1:1-a);for(let r of V.target)s.set(Number(r),V.previous.has(Number(r))?1:a);return s}function ci(e,t){if(e.size!==t.size)return!1;for(let a of e)if(!t.has(a))return!1;return!0}function Oi(){if(b.workspace==="schematic"){oh();return}if(b.workspace==="bom"){ih();return}if(b.workspace==="stackup")return;es.textContent=Va.stage==="semantic-ready"?"Semantic GLTF A0":"Prism staged 3D",ts.textContent="Layers",as.textContent="Visibility and compare",ee('[data-panel="search"] .section-heading span').textContent="Nets, components and pins",ee('[data-panel="view"] .section-heading span').textContent="Camera and stackup";let e=`
    <div class="mode-toolbar">
      <button data-mode="layer">PCB</button>
      <button data-mode="3d">3D</button>
    </div>`;_t&&(_t.innerHTML=e),Pe.innerHTML=`
    ${_t?"":e}
    <div class="layer-presets">
      <button data-preset="all">All</button><button data-preset="none">None</button>
      <button data-preset="outer">Outer</button><button data-preset="inner">Inner</button>
    </div>
    <div class="layer-list"></div>`,ue.innerHTML=`
    <label class="control-field"><span>Search</span>
      <input id="entity-search" class="layer-select" type="search" placeholder="Net, component or pin">
      <div id="search-results" class="search-results"></div>
    </label>
    <div class="quick-actions">
      <button id="frame-selection">Frame</button>
      <button id="show-net-layers">Net layers</button>
      <button id="isolate-net" aria-keyshortcuts="I" title="Toggle isolated net view (I)">Isolate</button>
      <button id="clear-selection">Clear</button>
    </div>`,Ie.innerHTML=`
    <div class="toggle-list">
      <label class="toggle-row"><input id="show-board" type="checkbox"><span>Board substrate</span></label>
      <label class="toggle-row"><input id="show-components" type="checkbox"><span>Components</span></label>
    </div>
    <label class="control-field range-field"><span>Stackup separation</span>
      <input id="separation" type="range" min="0" max="1" step="0.002">
    </label>`,Fe(),ph()}function ih(){es.textContent="BoM A0",ts.textContent="Bill of Materials",as.textContent="Grouped procurement view",ee('[data-panel="search"] .section-heading span').textContent="Search inside the BoM table",ee('[data-panel="view"] .section-heading span').textContent="BoM actions";let e=De?.payload?.counts||{};Pe.innerHTML=`
    <div class="selection-properties">
      <div class="selection-property"><small>Rows</small><strong>${e.rows||0}</strong></div>
      <div class="selection-property"><small>Components</small><strong>${e.components||0}</strong></div>
      <div class="selection-property"><small>DNP</small><strong>${e.dnpComponents||0}</strong></div>
    </div>
    <div class="selection-section">
      <span class="selection-section-title">Columns</span>
      <div class="selection-empty">Primary procurement and thermal columns are shown first. Additional symbol and footprint metadata is available in the row detail panel.</div>
    </div>`,ue.innerHTML=`
    <div class="selection-empty">Use the BoM search box in the main view. Reference chips update the shared PCB and schematic selection without changing workspaces.</div>
    <div class="quick-actions">
      <button id="clear-selection">Clear</button>
    </div>`,Ie.innerHTML=`
    <div class="selection-section">
      <span class="selection-section-title">Cross-probing</span>
      <div class="selection-table">
        <div class="selection-row"><span><strong>PCB/Schematic</strong></span><span>Select component</span><span>Highlights matching BoM row</span></div>
        <div class="selection-row"><span><strong>BoM reference</strong></span><span>Click chip</span><span>Holds component selection for PCB and schematic</span></div>
      </div>
    </div>`,ue.querySelector("#clear-selection")?.addEventListener("click",Et)}function oh(){es.textContent=X?"Schematic SVG DOM":O.manifest?.schema==="prism.schematic_vector_a0"?"Schematic Vector A0":"Schematic World A0",ts.textContent="Pages",as.textContent=`${O.pages.length} hierarchy instances`,ee('[data-panel="search"] .section-heading span').textContent="Pages, nets and components",ee('[data-panel="view"] .section-heading span').textContent="World navigation",Pe.innerHTML=`
    <div class="layer-presets">
      <button data-page-action="world">Fit world</button>
      <button data-page-action="parent">Parent</button>
      <button data-page-action="previous">Previous</button>
      <button data-page-action="next">Next</button>
    </div>
    <div class="page-list">${O.pages.map(e=>`
      <button class="page-row ${e.id===b.selectedPageId?"active":""}" data-page="${e.id}">
        <span>${e.sheetNumber}</span>
        <strong>${D(e.name)}</strong>
        <small>L${e.depth}</small>
      </button>`).join("")}</div>`,ue.innerHTML=`
    <label class="control-field"><span>Search</span>
      <input id="entity-search" class="layer-select" type="search" placeholder="Page, net or component">
      <div id="search-results" class="search-results"></div>
    </label>
    <div class="quick-actions">
      <button id="frame-selection">Frame</button>
      <button id="clear-selection">Clear</button>
    </div>`,Ie.innerHTML=`
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
    </div>`,Pe.querySelectorAll("[data-page]").forEach(e=>{e.addEventListener("click",()=>We(e.dataset.page,!0))}),Pe.querySelectorAll("[data-page-action]").forEach(e=>{e.addEventListener("click",()=>Ka(e.dataset.pageAction))}),ue.querySelector("#entity-search").addEventListener("input",e=>{dh(e.target.value)}),ue.querySelector("#frame-selection").addEventListener("click",Ui),ue.querySelector("#clear-selection").addEventListener("click",Zt),Ie.querySelector("#show-hierarchy").checked=S?.showHierarchy??!0,Ie.querySelector("#show-hierarchy").addEventListener("change",e=>{S.showHierarchy=e.target.checked})}function We(e,t){let a=O.byId.get(e);!a||!S||(b.selectedPageId=a.id,b.selectedSchematicFeature=null,S.selectedPageId=a.id,S.selectedFeatureId=0,Ve.textContent=JSON.stringify(a,null,2),t&&S.framePage(a),Pe.querySelectorAll("[data-page]").forEach(s=>{s.classList.toggle("active",s.dataset.page===a.id)}))}function Ka(e){if(!S)return;if(e==="world"){S.frameWorld();return}let t=Math.max(0,O.pages.findIndex(s=>s.id===b.selectedPageId)),a=null;e==="previous"?a=O.pages[(t-1+O.pages.length)%O.pages.length]:e==="next"?a=O.pages[(t+1)%O.pages.length]:e==="parent"&&(a=O.byId.get(O.pages[t]?.parentId)),a&&We(a.id,!0)}function ch(e){if(!e||!S)return;if(Zt(),e.kind==="page"&&e.pageId){We(e.pageId,!0);return}if(e.kind!=="sheet")return;let t=O.pages.find(n=>n.sheetInstancePath===e.sheetInstancePath)||O.byId.get(b.selectedPageId),a=String(e.sheetFile||e.feature?.sheet_file||"").replace(/\\/g,"/"),s=String(e.sheetName||e.feature?.sheet_name||e.feature?.objectId||""),r=O.pages.find(n=>{if(t&&n.parentId&&n.parentId!==t.id)return!1;let i=String(n.sourcePath||"").replace(/\\/g,"/");return a&&i.endsWith(a)||s&&n.name===s})||O.pages.find(n=>{let i=String(n.sourcePath||"").replace(/\\/g,"/");return a&&i.endsWith(a)||s&&n.name===s});r&&We(r.id,!0)}function dh(e){let t=ue.querySelector("#search-results"),a=e.trim().toLowerCase();if(!a){t.innerHTML="";return}let s=O.pages.filter(n=>`${n.name} ${n.sheetPath}`.toLowerCase().includes(a)).slice(0,8),r=M.nets.filter(n=>String(n.name).toLowerCase().includes(a)).slice(0,8);t.innerHTML=[...s.map(n=>`<button data-page="${n.id}"><b>${D(n.name)}</b><span>Page ${n.sheetNumber}</span></button>`),...r.map(n=>`<button data-schematic-net="${n.id}"><b>${D(n.name)}</b><span>${(O.manifest.netToPages?.[n.uid]||[]).length} pages</span></button>`)].join(""),t.querySelectorAll("[data-page]").forEach(n=>{n.addEventListener("click",()=>We(n.dataset.page,!0))}),t.querySelectorAll("[data-schematic-net]").forEach(n=>{n.addEventListener("click",()=>Pi(Number(n.dataset.schematicNet),!0))})}function Pi(e,t){let a=M.nets.find(r=>Number(r.id)===e);if(!a||!S)return;b.activeNetId=e,b.selectedFeatureId=0,b.selectedSchematicFeature=null,S.selectedFeatureId=0,S.selectedFeatureKey="",S.selectedSourceId="",O.activeNetUid=a.uid,S.activeNetUid=a.uid,X?.setHighlightedNet(a.uid),Ve.textContent=JSON.stringify(a,null,2),Ce();let s=O.manifest.netToPages?.[a.uid]||[];t&&s.length&&We(s[0],!0)}function Di(e,t=null){let a=M.nets.find(s=>s.uid===e);a&&(b.activeNetId=Number(a.id),O.activeNetUid=a.uid,S&&(S.activeNetUid=a.uid,S.selectedFeatureId=Number(t?.feature?.id||t?.featureId||0),S.selectedFeatureKey=t?.feature?.stableKey||t?.featureKey||"",S.selectedSourceId=t?.feature?.sourceId||t?.sourceId||""),X?.setHighlightedNet(a.uid),t&&(b.selectedSchematicFeature={...t,pageId:b.selectedPageId}),Ve.textContent=JSON.stringify(t?{...t,net:a}:a,null,2),Ce())}function Zt(){b.activeNetId=0,b.selectedFeatureId=0,b.selectedSchematicFeature=null,O.activeNetUid="",S&&(S.activeNetUid="",S.selectedFeatureId=0,S.selectedFeatureKey="",S.selectedSourceId=""),X?.setSelection(null),X?.setHighlightedNet(""),Ve.textContent="No object selected",Ce()}function Ui(){let e=O.byId.get(b.selectedPageId);e?S.framePage(e):S.frameWorld()}function lh(e){b.selectedPageId=e.sheetInstancePath&&O.pages.find(s=>s.sheetInstancePath===e.sheetInstancePath)?.id||b.selectedPageId,b.selectedFeatureId=0,b.selectedSchematicFeature={...e,pageId:b.selectedPageId},e.anchor&&(b.selectionAnchor=e.anchor),S&&(S.selectedPageId=b.selectedPageId,S.selectedFeatureId=Number(e.feature?.id||0));let t=e.netUid?M.nets.find(s=>s.uid===e.netUid):null,a=e.reference?M.componentFeatures.get(e.reference):null;a&&(b.selectedFeatureId=Number(a.featureId||0),De?.setSelectionByReference(e.reference,{scroll:b.workspace==="bom"})),Ve.textContent=JSON.stringify({...e,net:t,component:a},null,2),Ce()}function fh(e){let{page:t,feature:a}=e;if(!a){b.selectedSchematicFeature=null,S.selectedFeatureId=0,We(t.id,!1),Ce();return}let s=Number(a.id||0);if(b.selectedPageId=t.id,S.selectedPageId=t.id,S.selectedFeatureId=s,b.selectedSchematicFeature={...a,pageId:t.id},b.selectionAnchor=null,a.netUid){let r=M.nets.find(n=>n.uid===a.netUid);if(r){Pi(Number(r.id),!1),b.selectedSchematicFeature={...a,pageId:t.id},S.selectedFeatureId=s;return}}if(a.reference){let r=M.componentFeatures.get(a.reference);if(r){Ft(Number(r.featureId),!1),b.selectedSchematicFeature={...a,pageId:t.id},S.selectedFeatureId=s;return}}b.activeNetId=0,b.selectedFeatureId=0,S.activeNetUid="",Ve.textContent=JSON.stringify({page:t.name,...a},null,2),Ce()}function Tt(){let e=b.isolateNet,t=ue?.querySelector?.("#isolate-net");t?.classList.toggle("active",e),t?.setAttribute("aria-pressed",String(e));let a=Y?.querySelector?.("[data-action=isolate]");a?.classList.toggle("active",e),a?.setAttribute("aria-pressed",String(e));let s=Ie?.querySelector?.("#show-board");s&&(s.checked=b.showBoard);let r=Ie?.querySelector?.("#show-components");r&&(r.checked=b.showComponents),Yt()}function uh(){let e=new Set;for(let t of Xe())for(let a of hh(t))e.add(a);return e}function hh(e){let t=new Set,a=M.nets.find(r=>Number(r.id)===Number(e)),s=new Set(M.copperLayers.map(r=>Number(r.id)));for(let r of Object.keys(a?.layerBoundsMm||{})){let n=Number(r);s.has(n)&&t.add(n)}if(!t.size){let r=new Map(M.copperLayers.map(n=>[n.name,Number(n.id)]));for(let n of a?.metrics?.layers||[]){let i=r.get(n);i!=null&&t.add(i)}}if(t.size)return t;for(let r of M.tiles.values())Ai(r,e)&&t.add(Number(r.layerId));return t}function ea(){let e=uh();e.size&&(b.visible3dLayers=new Set(e),b.mode==="layer"?Qt(e):(b.compareLayers=new Set(e),b.desiredCompareLayers=new Set(e)),pe(performance.now(),{force:!0}))}function jt(e){let t=!!(e&&Xe().size),a=b.isolateNet;if(t&&!b.isolateNet&&(b.preIsolation3dLayers=new Set(b.visible3dLayers),b.preIsolationCompareLayers=new Set(b.desiredCompareLayers.size?b.desiredCompareLayers:b.compareLayers)),b.isolateNet=t,b.isolateNet)ea();else if(b.preIsolation3dLayers||b.preIsolationCompareLayers){if(b.preIsolation3dLayers&&(b.visible3dLayers=new Set(b.preIsolation3dLayers)),b.preIsolationCompareLayers){let s=new Set(b.preIsolationCompareLayers);b.mode==="layer"?Qt(s):(b.compareLayers=s,b.desiredCompareLayers=new Set(s))}b.preIsolation3dLayers=null,b.preIsolationCompareLayers=null,pe(performance.now(),{force:!0})}t&&!a?(b.preIsolationShowBoard=b.showBoard,b.showBoard=!1):!t&&a&&(typeof b.preIsolationShowBoard=="boolean"&&(b.showBoard=b.preIsolationShowBoard),b.preIsolationShowBoard=null),Tt(),Fe()}function Fe(){(_t||Pe).querySelectorAll("[data-mode]").forEach(a=>{let s=a.dataset.mode===b.mode;a.classList.toggle("active",s),a.setAttribute("aria-pressed",String(s))}),Ie.querySelector("#show-board").checked=b.showBoard,Ie.querySelector("#show-components").checked=b.showComponents,Ie.querySelector("#separation").value=b.separation;let e=Pe.querySelector(".layer-list"),t=b.mode==="3d"?b.visible3dLayers:b.desiredCompareLayers;e.innerHTML=M.copperLayers.map((a,s)=>`
    <label class="layer-row">
      <input type="checkbox" data-layer="${a.id}" ${t.has(Number(a.id))?"checked":""}>
      <span class="swatch" style="background:${$i(Qs(a))}"></span>
      <span>${D(a.name)}</span><small>${s+1}</small>
    </label>`).join(""),e.querySelectorAll("[data-layer]").forEach(a=>a.addEventListener("change",()=>{Ki(Number(a.dataset.layer),a.checked)})),Tt()}function Li(e){e==="layer"?Zs():(b.mode="3d",$.frame($t()),$.snap(),b.visibleTileIds=new Set,pe(performance.now(),{force:!0})),Fe()}function Ki(e,t){if(b.mode==="3d")t?b.visible3dLayers.add(e):b.visible3dLayers.delete(e),pe(performance.now(),{force:!0});else{let a=new Set(b.desiredCompareLayers);t?a.add(e):a.delete(e),Qt(a)}Fe()}function Gi(e){let t=b.mode==="3d"?b.visible3dLayers:new Set;t.clear();for(let[a,s]of M.copperLayers.entries())(e==="all"||e==="outer"&&(a===0||a===M.copperLayers.length-1)||e==="inner"&&a>0&&a<M.copperLayers.length-1)&&t.add(Number(s.id));b.mode==="3d"?pe(performance.now(),{force:!0}):Qt(t),Fe()}function Vi(e){b.showBoard=!!e,b.savedShowBoard=b.showBoard,b.showBoard&&b.isolateNet?jt(!1):Tt()}function zi(e){b.showComponents=!!e,b.savedShowComponents=b.showComponents,Tt()}function bh(e){b.showPlaceholders=!!e,Q?.setPlaceholdersVisible(b.showPlaceholders),Yt()}function gh(e){b.realisticColors=!!e,er(),Yt()}function er(){if(!Q)return;let e=new Map(M.layers.map(t=>[Number(t.id),t]));for(let t of Q.entries)t.kind==="copper"&&(t.color=ji(e.get(Number(t.layerId))));Q.setBarrelColor(Fi(Ju,[..._i().slice(0,3),.78],Ya())),M.copperRealism=Ya()}function Hi(e){b.separation=ne(Number(e)||0,0,1),Yt()}function ph(){(_t||Pe).querySelectorAll("[data-mode]").forEach(t=>t.addEventListener("click",()=>{Li(t.dataset.mode)})),Pe.querySelectorAll("[data-preset]").forEach(t=>t.addEventListener("click",()=>{Gi(t.dataset.preset)})),Ie.querySelector("#show-board").addEventListener("change",t=>{Vi(t.target.checked)}),Ie.querySelector("#show-components").addEventListener("change",t=>{zi(t.target.checked)}),Ie.querySelector("#separation").addEventListener("input",t=>{Hi(t.target.value)}),ue.querySelector("#clear-selection").addEventListener("click",Et),ue.querySelector("#isolate-net").addEventListener("click",()=>{jt(!b.isolateNet)}),ue.querySelector("#frame-selection").addEventListener("click",rr),ue.querySelector("#show-net-layers").addEventListener("click",tr);let e=ue.querySelector("#entity-search");e.addEventListener("input",()=>qi(e.value))}function mh(){wt(".rail-tab").forEach(e=>e.addEventListener("click",()=>{let t=e.dataset.tab,a=b.activeTab===t&&!pt.classList.contains("panel-collapsed");b.activeTab=t,pt.classList.toggle("panel-collapsed",a),wt(".rail-tab").forEach(s=>{s.classList.toggle("active",!a&&s.dataset.tab===t)}),wt(".tab-panel").forEach(s=>{s.classList.toggle("active",!a&&s.dataset.panel===t)})}))}function tr(){let e=M.nets.find(s=>Number(s.id)===b.activeNetId);if(!e)return;let t=new Set(e.metrics?.layers||[]),a=b.mode==="3d"?b.visible3dLayers:new Set;a.clear();for(let s of M.copperLayers)t.has(s.name)&&a.add(Number(s.id));b.mode==="3d"?pe(performance.now(),{force:!0}):Qt(a),Fe()}function qi(e){let t=ue.querySelector("#search-results"),a=e.trim().toLowerCase();if(!a){t.innerHTML="";return}let s=M.nets.filter(n=>String(n.name).toLowerCase().includes(a)).slice(0,8),r=[...M.componentFeatures.values()].filter(n=>!b.hiddenComponents.has(String(n.designator||""))&&`${n.designator} ${n.value} ${n.footprint}`.toLowerCase().includes(a)).slice(0,6);t.innerHTML=[...s.map(n=>`<button data-net="${n.id}"><b>${D(n.name)}</b><span>${D(n.netClass||"")}</span></button>`),...r.map(n=>`<button data-feature="${n.featureId}"><b>${D(n.designator)}</b><span>${D(n.value)}</span></button>`)].join(""),t.querySelectorAll("[data-net]").forEach(n=>{n.addEventListener("click",()=>$a(Number(n.dataset.net),!0))}),t.querySelectorAll("[data-feature]").forEach(n=>{n.addEventListener("click",()=>Ft(Number(n.dataset.feature),!0))})}function $a(e,t){t&&(b.selectionAnchor=null),b.activeNetId=e,b.selectedFeatureId=0;let a=M.nets.find(s=>Number(s.id)===e);b.workspace==="schematic"&&a&&S&&(O.activeNetUid=a.uid,S.activeNetUid=a.uid),Js(),Ve.textContent=JSON.stringify(a||{},null,2),Ce(),b.isolateNet&&ea(),t&&a?.boundsMm&&$.frame($s(a.boundsMm)),pe(performance.now(),{force:!0}),Ws(vi(a))}function Ft(e,t=!1){let a=M.features.get(e);if(a?.kind==="component"&&oa(Nt(a),b.hiddenComponents))return;t&&(b.selectionAnchor=null),b.selectedFeatureId=e,b.activeNetId=Number(a?.netId||0);let s=Nt(a);s&&De?.setSelectionByReference(s,{scroll:b.workspace==="bom"});let r=Ru(a);r?.kind==="net"?Js():Ti(),Ve.textContent=a?JSON.stringify(a,null,2):"No object selected",Ce(),b.isolateNet&&b.activeNetId&&ea(),t&&a?.bounds&&sr(a),pe(performance.now(),{force:!0}),Ws(r)}function ar(e,t=!1){if(oa(e,b.hiddenComponents))return;let a=M.componentFeatures.get(e);if(De?.setSelectionByReference(e,{scroll:b.workspace==="bom"}),!a?.featureId)return;Ti(),Ft(Number(a.featureId),!1);let s=wh(e);if(s){let{page:r,feature:n}=s;b.selectedPageId=r.id,b.selectedSchematicFeature={...n,pageId:r.id},S&&(S.selectedPageId=r.id,S.selectedFeatureId=Number(n.id||0)),X?.setSelection?.({kind:"component",featureKey:n.stableKey||"",sheetInstancePath:n.sheetInstancePath||r.sheetInstancePath||"",sourceId:n.sourceId||n.uuid||"",reference:e,feature:n,pageId:r.id}),t&&b.workspace==="schematic"&&(We(r.id,!0),X?.frameSelection?.())}if(t&&b.workspace==="pcb"){let r=M.features.get(Number(a.featureId));r?.bounds&&sr(r,!0)}Ce()}function Nt(e){return e?.designator||e?.reference||e?.componentDesignator||""}function yh(){return gr(M.manifest?.components||[],M.componentModelCounts)}function xh(e){let t=pr(e,yh());b.hiddenComponents=t.hiddenReferences,Q?.setHiddenFeatureIds(t.hiddenFeatureIds),t.ambiguous.length&&console.warn(`[prism-semantic-viewer] keeping ambiguous components visible: ${t.ambiguous.join(", ")}`),t.unknown.length&&console.warn(`[prism-semantic-viewer] ignoring unknown components: ${t.unknown.join(", ")}`);let a=Nt(M.features.get(b.selectedFeatureId));oa(a,b.hiddenComponents)&&Et();let s=ue.querySelector("input");return s?.value&&qi(s.value),t}function sr(e,t=!1){if(!e?.bounds)return;if(t||e.kind==="component"||!!Nt(e)){let r=(e.bounds[2]+e.bounds[5])*.5<0,n=$.isBelow();r!==n&&$.setAxis("z",r)}$.frame(e.bounds)}function wh(e){if(!e||!S?.featuresByPage)return null;let t=O.byId.get(b.selectedPageId),a=[...t?[t]:[],...(O.pages||[]).filter(r=>r.id!==t?.id)],s=r=>{let n=String(r.kind||"").toLowerCase();return n==="component"||n==="symbol_body"||n==="symbol_instance"?0:n==="symbol_reference"?1:n.startsWith("pin")?2:3};for(let r of a){let n=(S.featuresByPage[r.id]||[]).filter(i=>String(i.reference||i.designator||i.componentDesignator||"")===e).sort((i,o)=>s(i)-s(o));if(n.length)return{page:r,feature:n[0]}}return null}function Et(){b.activeNetId=0,b.selectedFeatureId=0,b.selectedSchematicFeature=null,b.selectionAnchor=null;let e=Xe().size>0,t=b.isolateNet;t&&!e?jt(!1):e?t&&ea():b.isolateNet=!1,e||Ei(),O.activeNetUid="",S&&(S.activeNetUid=""),X?.setSelection(null),X?.setHighlightedNet(""),Ve.textContent="No object selected",De?.clearSelection?.(),Ce(),Ws(null)}function Ga(e){return`<div class="selection-properties">${e.map(([t,a])=>`
    <div class="selection-property">
      <small>${D(t)}</small>
      <strong title="${D(String(a))}">${D(String(a))}</strong>
    </div>`).join("")}</div>`}function Qa(e,t,a){return`
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
      <div class="selection-card-title"><small>${D(e)}</small><strong>${D(t)}</strong></div>
      <button class="selection-card-close" type="button" aria-label="Clear selection">&times;</button>
    </div>`}function vh(e){let a=(ge.net_details?.[e.uid]||{}).terminals||[],s=e.metrics||{},r=Number(s.traceLengthMm||0).toFixed(2),n=s.objectCounts?.via||0,i=a.length,c=/^(VCC|VDD|GND|3V3|5V|12V|VIN|POWER)/i.test(e.name)?"#10b981":"#8b5cf6",l=e.netClass||"Default",p=a.length?a.map(g=>`
      <div class="selection-row pin-row-interactive" data-ref="${D(g.designator)}" data-pin="${D(g.pin)}">
        <span class="refdes-col"><strong>${D(g.designator)}</strong></span>
        <span class="pin-col">Pin ${D(g.pin)}</span>
        <span class="val-col" title="${D(g.value||"")}">${D(g.value||"-")}</span>
      </div>`).join(""):'<div class="selection-empty">No connected pin metadata is available.</div>';return`
    ${Qa("Net",e.name,c)}
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
          <strong title="${D(l)}">${D(l)}</strong>
        </div>
      </div>
      
      <div class="selection-section">
        <span class="selection-section-title">Layers</span>
        <div class="net-layers-badges">
          ${(s.layers||[]).length?s.layers.map(g=>`<span class="layer-badge">${D(g)}</span>`).join(""):'<span class="layer-badge unknown">None</span>'}
        </div>
      </div>

      <div class="selection-section">
        <span class="selection-section-title">Connected Pins</span>
        <div class="selection-table compact-scroll" style="max-height: 120px;">
          ${p}
        </div>
      </div>
    </div>`}function Th(e,t=null){let a=qs(e.designator),s=a?a.value:e.value||"Not specified",r=a?a.footprint:e.footprint||"Not specified",n=a?.parameters||{},i=n.Manufacturer||n.Mfr||"",o=n["Manufacturer Part Number"]||n.MPN||n["Part Number"]||"",c=n.kicad_dnp==="true"||n.DNP==="true"||n.kicad_in_bom==="false",l="";(i||o)&&(l=`
      <div class="selection-section">
        <span class="selection-section-title">Component details</span>
        <div class="selection-table">
          <div class="selection-row">
            <span><strong>Manufacturer</strong></span>
            <span title="${D(i)}">${D(i||"-")}</span>
          </div>
          <div class="selection-row">
            <span><strong>Part Number</strong></span>
            <span title="${D(o)}">${D(o||"-")}</span>
          </div>
        </div>
      </div>`);let p="";return t&&(p=`
      <div class="selection-section">
        <span class="selection-section-title">Selected Pin</span>
        <div class="selection-table">
          <div class="selection-row">
            <span><strong>Pin</strong></span>
            <span>Pin ${D(t.pinNumber||t.pin||"")}</span>
            <span title="${D(t.pinName||"")}">${D(t.pinName||"No name")}</span>
          </div>
          <div class="selection-row">
            <span><strong>Net</strong></span>
            <span class="net-ref-interactive" data-net-name="${D(t.netName||"")}">${D(t.netName||"Not connected")}</span>
          </div>
        </div>
      </div>`),`
    ${Qa("Component",e.designator||"Unknown","#3b82f6")}
    <div class="selection-component-dashboard">
      ${c?'<div class="dnp-banner" style="background:#b45309;color:#fff;font-size:9px;font-weight:750;text-align:center;padding:3px;margin-bottom:8px;border-radius:2px;text-transform:uppercase;letter-spacing:0.05em;">DNP (Do Not Populate)</div>':""}
      ${Ga([["Value",s],["Footprint",r.split(":").pop()||r]])}
      ${l}
      ${p}
    </div>`}function Eh(e,t){let a=String(e.kind||"").toLowerCase(),s=a.startsWith("pin");if(a==="component"||a.includes("symbol"))return`
      ${Qa("Component",e.reference||e.componentDesignator||"Unknown","#3b82f6")}
      ${Ga([["Value",e.value||e.componentValue||"Not specified"],["Footprint",e.componentFootprint||e.footprint||"Not specified"],["Library",e.libraryRef||"Not specified"],["UID",e.componentUid||e.uuid||e.sourceId||"Not resolved"]])}
      <div class="selection-section">
        <span class="selection-section-title">Schematic placement</span>
        ${Ga([["Page",t?.name||"Unknown"],["Sheet",e.sheetInstancePath||"/"]])}
      </div>`;let n=s?[["Symbol",e.reference||e.designator||"Unknown"],["Value",e.value||e.componentValue||"Not specified"],["Pin",`${e.pinNumber||"-"}${e.pinName?` ${e.pinName}`:""}`],["Net",e.netName||"Not connected"],["PCB Pad",e.pcbPadId||"Not resolved"],["Component UID",e.componentUid||"Not resolved"]]:[["Page",t?.name||"Unknown"],["Kind",e.kind.replaceAll("_"," ")],["Net",e.netName||"Not connected"]];return`
    ${Qa(e.kind.replaceAll("_"," "),e.pinName||e.reference||e.designator||e.text||e.netName||"Schematic object","#3b82f6")}
    ${Ga(n)}
    <div class="selection-section">
      <span class="selection-section-title">Source identity</span>
      <div class="selection-table">
        <div class="selection-row">
          <span><strong>${s?"Pin UUID":"UUID"}</strong></span>
          <span title="${D(e.uuid||e.sourceId||"")}">${D(e.uuid||e.sourceId||"-")}</span>
          <span title="${D(e.objectId||"")}">${D(e.objectId||"No object ID")}</span>
        </div>
        <div class="selection-row">
          <span><strong>Sheet</strong></span>
          <span>${D(t?.name||"Unknown")}</span>
          <span title="${D(e.sheetInstancePath||"")}">${D(e.sheetInstancePath||"/")}</span>
        </div>
      </div>
    </div>`}function Ce(){if(Yt(),b.workspace==="bom"){Y.hidden=!0,Y.innerHTML="";return}let e=M.features.get(b.selectedFeatureId),t=e?.kind==="component"?e:null,a=b.workspace==="schematic"?b.selectedSchematicFeature:null,s=a?O.byId.get(a.pageId):null,r=b.activeNetId?M.nets.find(g=>Number(g.id)===b.activeNetId):null;if(!r&&a&&(a.netUid?r=M.nets.find(g=>g.uid===a.netUid):a.netName&&(r=Ot(M.nets,a.netName))),!t&&a){let g=a.reference||a.componentDesignator||a.designator;g&&(t=M.componentFeatures.get(g)||{designator:g})}if(!t&&!r&&!a){Y.hidden=!0,Y.innerHTML="";return}let n="";if(r)n=vh(r);else if(t){let g=a?.kind?.startsWith("pin")?a:null;n=Th(t,g)}else a&&(n=Eh(a,s));Y.innerHTML=`
    ${n}
    <div class="selection-card-actions">
      ${r?`
        <button type="button" data-action="isolate" aria-keyshortcuts="I" title="Toggle isolated net view (I)" class="${b.isolateNet?"active":""}">Isolate</button>
        <button type="button" data-action="net-layers">Layers</button>
      `:""}
      <button type="button" data-action="frame">Frame selection</button>
    </div>`,Y.hidden=!1;let i=b.workspace==="schematic"?ve:W,o=b.selectionAnchor,c=Y.offsetWidth||360,l=Y.offsetHeight||330;if(o){let g=Math.max(16,i.clientWidth-c-24),v=Math.max(16,i.clientHeight-l-24);Y.style.left=`${ne(o.x+18,16,g)}px`,Y.style.top=`${ne(o.y+18,16,v)}px`}else Y.style.left="20px",Y.style.top="20px";if(Y.querySelector(".selection-card-close").addEventListener("click",Et),Y.querySelector("[data-action=frame]").addEventListener("click",rr),r){let g=Y.querySelector("[data-action=isolate]");g&&g.addEventListener("click",()=>{jt(!b.isolateNet)});let v=Y.querySelector("[data-action=net-layers]");v&&v.addEventListener("click",tr),Y.querySelectorAll(".pin-row-interactive").forEach(x=>{x.addEventListener("click",()=>{let u=x.dataset.ref,d=x.dataset.pin;if(!u)return;let h=((ge.net_details?.[r.uid]||{}).terminals||[]).find(w=>w.designator===u&&w.pin===d),y=h?Eu(h.pcb_pad_id):0;y?Ft(y,!0):ar(u,!0)})})}let p=Y.querySelector(".net-ref-interactive");p&&p.addEventListener("click",()=>{let g=p.dataset.netName;if(!g)return;let v=Ot(M.nets,g);v&&$a(Number(v.id),!0)})}function rr(){if(b.workspace==="schematic"){Ui();return}let e=M.features.get(b.selectedFeatureId);if(e?.bounds)sr(e);else{let t=M.nets.find(a=>Number(a.id)===b.activeNetId);t?.boundsMm&&$.frame($s(t.boundsMm))}}function kh(){W.addEventListener("contextmenu",e=>e.preventDefault()),W.addEventListener("pointerdown",e=>{b.dragging=!0,b.lastX=e.clientX,b.lastY=e.clientY,b.pointerStartX=e.clientX,b.pointerStartY=e.clientY,b.dragMode=b.mode==="layer"||e.shiftKey||e.button!==0?"pan":"orbit",W.setPointerCapture(e.pointerId)}),W.addEventListener("pointermove",e=>{if(!b.dragging)return;let t=e.clientX-b.lastX,a=e.clientY-b.lastY;b.lastX=e.clientX,b.lastY=e.clientY,b.dragMode==="pan"?$.pan(t,a,W.clientHeight,b.mode==="layer"):$.orbit(t,a)}),W.addEventListener("pointerup",async e=>{b.dragging=!1,W.releasePointerCapture(e.pointerId),!(Math.hypot(e.clientX-b.pointerStartX,e.clientY-b.pointerStartY)>=3)&&(e.button===0?await di(e):e.button===2&&await Ah(e))}),W.addEventListener("dblclick",async e=>{await di(e),rr()}),W.addEventListener("wheel",e=>{e.preventDefault(),Math.abs(e.deltaX)>Math.abs(e.deltaY)*.4?$.pan(-e.deltaX,0,W.clientHeight,b.mode==="layer"):$.dolly(e.deltaY,b.mode==="layer")},{passive:!1}),window.addEventListener("keydown",Ji),Mh()}function Mh(){let e=!1,t,a,s=0,r=0;Y.addEventListener("pointerdown",n=>{if(!n.target.closest(".selection-card-head")||n.target.closest(".selection-card-close"))return;e=!0,Y.classList.add("dragging");let o=Y.getBoundingClientRect();s=o.left,r=o.top,t=n.clientX,a=n.clientY,Y.setPointerCapture(n.pointerId),n.stopPropagation()}),Y.addEventListener("pointermove",n=>{if(!e)return;let i=n.clientX-t,o=n.clientY-a,c=b.workspace==="schematic"?ve:W,l=Y.offsetWidth||360,p=Y.offsetHeight||330,g=Math.max(16,c.clientWidth-l-24),v=Math.max(16,c.clientHeight-p-24),x=ne(s+i,16,g),u=ne(r+o,16,v);Y.style.left=`${x}px`,Y.style.top=`${u}px`,b.selectionAnchor={x:x-18,y:u-18},n.stopPropagation()}),Y.addEventListener("pointerup",n=>{e&&(e=!1,Y.classList.remove("dragging"),Y.releasePointerCapture(n.pointerId),n.stopPropagation())})}function Rh(){wt("[data-workspace]").forEach(e=>{e.addEventListener("click",()=>Xi(e.dataset.workspace))})}function Xi(e){if(e==="schematic"&&!S||e==="bom"&&!De)return;b.workspace=e,pt.classList.remove("workspace-pcb","workspace-schematic","workspace-bom","workspace-stackup"),pt.classList.add(`workspace-${e}`),(e==="schematic"&&(b.activeTab==="view"||b.activeTab==="inspect"||b.activeTab==="stats")||e==="bom"||e==="stackup")&&Za("layers");let t=ee('.rail-tab[data-tab="layers"]');t&&(e==="schematic"?(t.textContent="Pages",t.title="Schematic pages"):e==="bom"?(t.textContent="Summary",t.title="BoM summary"):(t.textContent="Layers",t.title="Layers and compare"));let a=e==="schematic",s=e==="bom",r=e==="stackup";if(W.hidden=a||s||r,ve&&(ve.hidden=!a),za&&(za.hidden=!a||!X),Ha&&(Ha.hidden=!a),qa&&(qa.hidden=!s),Re&&(Re.hidden=!r),we.hidden=a||s||r,Xa.hidden=a||s||r,Jt&&(Jt.hidden=!a),wt("[data-workspace]").forEach(n=>{n.classList.toggle("active",n.dataset.workspace===e)}),Wt.textContent=s?"Semantic BoM active":a?X?"SVG DOM + WebGPU schematic world active":"WebGPU schematic world active":r?"Layer Stackup active":"WebGPU semantic glTF active",a&&!O.fitted&&(S.resize(),S.frameWorld(),O.fitted=!0),!a&&!s&&!r&&(Q?.resize(),b.mode==="layer"?Zs():pe(performance.now(),{force:!0})),r)try{Ch()}catch(n){console.error("Failed to render stackup workspace",n),Re&&(Re.innerHTML=`
          <div class="selection-empty" style="padding:40px;text-align:center;">
            Stackup view failed to render. ${D(n?.message||String(n))}
          </div>
        `)}Oi(),Ce()}function Ih(){ve.addEventListener("pointerdown",e=>{X?.worldActive||X?.active||(b.schematicDragging=!0,b.schematicLastX=e.clientX,b.schematicLastY=e.clientY,b.schematicStartX=e.clientX,b.schematicStartY=e.clientY,ve.setPointerCapture(e.pointerId))}),ve.addEventListener("pointermove",e=>{if(X?.worldActive||X?.active||!b.schematicDragging||!S)return;let t=e.clientX-b.schematicLastX,a=e.clientY-b.schematicLastY;b.schematicLastX=e.clientX,b.schematicLastY=e.clientY,S.pan(t,a)}),ve.addEventListener("pointerup",async e=>{if(!(X?.worldActive||X?.active)&&(b.schematicDragging=!1,ve.releasePointerCapture(e.pointerId),Math.hypot(e.clientX-b.schematicStartX,e.clientY-b.schematicStartY)<3)){let t=await S.pickFeature(e.clientX,e.clientY);t?fh(t):Zt()}}),ve.addEventListener("dblclick",e=>{if(X?.worldActive||X?.active)return;let t=S.hitPage(e.clientX,e.clientY);t&&We(t.id,!0)}),ve.addEventListener("wheel",e=>{X?.worldActive||X?.active||(e.preventDefault(),S.zoom(e.deltaY,e.clientX,e.clientY))},{passive:!1})}async function di(e){if(!Ge)return;let t=W.getBoundingClientRect();b.selectionAnchor={x:e.clientX-t.left,y:e.clientY-t.top};let a=await Wi(e);a?Ft(a,!0):Et()}async function Ah(e){if(!Ge||!Ls)return;let t=M.features.get(await Wi(e)),a=Nt(t),s=a?qs(a):null;Ls({clientX:e.clientX,clientY:e.clientY,reference:a||void 0,value:String(s?.value||t?.value||"")||void 0})}async function Wi(e){let t=W.getBoundingClientRect(),a=(e.clientX-t.left)*W.width/t.width,s=(e.clientY-t.top)*W.height/t.height;return Q.pick(Ge,a,s,{activeNetId:b.activeNetId,selectedFeatureId:b.selectedFeatureId,layerOffsets:Ci(),visibleLayers:b.mode==="3d"?b.visible3dLayers:b.compareLayers,showBoard:b.showBoard,showComponents:b.showComponents,componentOpacity:ne(1-b.separation/.1,0,1),boardOpacity:1-b.separation*.72,isolateNet:b.isolateNet,compareMode:b.mode==="layer",compareOffsets:vt,visibleTileIds:b.mode==="3d"?b.visibleTileIds:null})}function Ji(e){if(!Hs())return;if(e.target instanceof HTMLInputElement){e.key==="Escape"&&e.target.blur();return}let t=e.key.toLowerCase();if(b.workspace==="schematic"){if(t==="/")e.preventDefault(),Za("search"),ue.querySelector("#entity-search")?.focus();else if(t==="escape")O.activeNetUid?(O.activeNetUid="",b.activeNetId=0,S.activeNetUid="",X?.setHighlightedNet(""),Ce()):Zt();else if(t==="~"||e.key==="~"){e.preventDefault();let a=b.selectedSchematicFeature?.netUid;a&&(O.activeNetUid===a?(O.activeNetUid="",b.activeNetId=0,S.activeNetUid="",X?.setHighlightedNet("")):Di(a,b.selectedSchematicFeature))}else if(t==="home")S?.frameWorld();else if(t==="[")Ka("previous");else if(t==="]")Ka("next");else if(t==="n"){e.preventDefault();let a=S?.cycleNetIntrasheetLink(e.shiftKey?-1:1);a?.pageId&&(b.selectedPageId=a.pageId,S.selectedPageId=a.pageId,Yi())}else if(e.altKey&&t==="arrowup")Ka("parent");else if(e.key.startsWith("Arrow")){e.preventDefault();let a=e.key==="ArrowRight"?32:e.key==="ArrowLeft"?-32:0,s=e.key==="ArrowDown"?32:e.key==="ArrowUp"?-32:0;S?.pan(a,s)}return}if(t==="/")e.preventDefault(),Za("search"),ue.querySelector("#entity-search").focus();else if(t==="escape")Et();else if(t==="i"&&b.workspace==="pcb"&&Xe().size)e.preventDefault(),jt(!b.isolateNet);else if(t==="home")$.frame($t());else if(["x","y","z"].includes(t))$.setAxis(t,e.shiftKey);else if(t==="f")$.flip();else if(t==="r")$.rotateZ(e.shiftKey?-1:1);else if(t===" "){e.preventDefault();let a=M.features.get(b.selectedFeatureId);a?.bounds&&$.setFocus([(a.bounds[0]+a.bounds[3])/2,(a.bounds[1]+a.bounds[4])/2,(a.bounds[2]+a.bounds[5])/2])}else if(e.key.startsWith("Arrow")){e.preventDefault();let a=e.key==="ArrowRight"?32:e.key==="ArrowLeft"?-32:0,s=e.key==="ArrowDown"?32:e.key==="ArrowUp"?-32:0;$.pan(a,s,W.clientHeight,b.mode==="layer")}}function Za(e){b.activeTab=e,pt.classList.remove("panel-collapsed"),wt(".rail-tab").forEach(t=>{t.classList.toggle("active",t.dataset.tab===e)}),wt(".tab-panel").forEach(t=>{t.classList.toggle("active",t.dataset.panel===e)})}function Sh(){let e=we.getContext("2d");e.clearRect(0,0,we.width,we.height);let t=[we.width/2,we.height/2],a=$.basis(),s=[{axis:"x",label:"X",color:"#e23838",vector:[1,0,0]},{axis:"y",label:"Y",color:"#2dbd50",vector:[0,1,0]},{axis:"z",label:"Z",color:"#3157d5",vector:[0,0,1]}],r=[];for(let n of s)for(let i of[-1,1]){let o=n.vector.map(l=>l*i),c=[Ds(o,a.right),-Ds(o,a.up),Ds(o,a.back)];r.push({...n,sign:i,depth:c[2],point:[t[0]+c[0]*34,t[1]+c[1]*34]})}for(let n of s){let i=r.find(o=>o.axis===n.axis&&o.sign===1);e.strokeStyle=n.color,e.lineWidth=2.4,e.beginPath(),e.moveTo(...t),e.lineTo(...i.point),e.stroke()}Wa=[];for(let n of r.sort((i,o)=>o.depth-i.depth)){let i=n.sign===1,o=i?13:9;e.beginPath(),e.arc(n.point[0],n.point[1],o,0,Math.PI*2),e.fillStyle=i?n.color:`${n.color}66`,e.fill(),e.lineWidth=2,e.strokeStyle=Fh(n.color,i?.45:.58),e.stroke(),i&&(e.fillStyle="#07101c",e.font="700 13px system-ui",e.textAlign="center",e.textBaseline="middle",e.fillText(n.label,n.point[0],n.point[1]+.5)),Wa.push({...n,radius:o+5})}}function _h(){!we||we.dataset.bound==="true"||(we.dataset.bound="true",we.addEventListener("click",e=>{let t=we.width/we.clientWidth,a=we.height/we.clientHeight,s=[e.offsetX*t,e.offsetY*a],r=Wa.map(n=>({item:n,distance:Math.hypot(s[0]-n.point[0],s[1]-n.point[1])})).filter(({item:n,distance:i})=>i<=n.radius).sort((n,i)=>n.distance-i.distance)[0]?.item;r&&$.setAxis(r.axis,r.sign<0)}))}function Nh(){if(b.mode!=="layer"||!Ge){Xa.innerHTML="";return}let e=$t(),t=ki();Xa.innerHTML=M.copperLayers.filter(a=>t.has(Number(a.id))).map(a=>{let s=vt.get(Number(a.id))||[0,0,0],r=jh([e[0]+s[0],e[4]+s[1],0],Ge.matrix,W.clientWidth,W.clientHeight);return!r||r[0]<-100||r[0]>W.clientWidth+100||r[1]<-100||r[1]>W.clientHeight+100?"":`<span style="left:${r[0]}px;top:${r[1]}px">${D(a.name)}</span>`}).join("")}function Yi(){if(b.workspace!=="schematic"||!S){Jt.innerHTML="";return}Jt.innerHTML=O.visiblePages.filter(e=>S.pagePixelWidth(e)>120).map(e=>{let[t,a]=S.worldToScreen(e.worldX+8*S.scale,e.worldY-6*S.scale),s=e.id===b.selectedPageId,n=O.activeNetUid&&e.netUids.includes(O.activeNetUid)?"#18ef52":s?"#3b82f6":"#4b8de8";return`<div class="schematic-page-label" style="left:${t}px;top:${a}px;border-left-color:${n}">
        <strong>${D(e.name)}</strong>
        <small>Page ${e.sheetNumber} &middot; ${e.featureCount.toLocaleString()} features</small>
      </div>`}).join("")}function jh(e,t,a,s){let r=e[0],n=e[1],i=e[2],o=t[0]*r+t[4]*n+t[8]*i+t[12],c=t[1]*r+t[5]*n+t[9]*i+t[13],l=t[3]*r+t[7]*n+t[11]*i+t[15];return Math.abs(l)<1e-8?null:[(o/l*.5+.5)*a,(.5-c/l*.5)*s]}function Ds(e,t){return e[0]*t[0]+e[1]*t[1]+e[2]*t[2]}function Fh(e,t){let a=e.replace("#","");return`#${[0,2,4].map(s=>Math.round(parseInt(a.slice(s,s+2),16)*t).toString(16).padStart(2,"0")).join("")}`}function li(e,t){b.frameSamples.push({intervalMs:e,cpuMs:t}),b.frameSamples.length>180&&b.frameSamples.shift()}function fi(e,t){if(!e.length)return 0;let a=[...e].sort((s,r)=>s-r);return a[Math.min(a.length-1,Math.floor((a.length-1)*t))]}function ui(e){if(!Pa||(b.frames+=1,e-b.fpsAt<=500))return;b.fps=b.frames*1e3/(e-b.fpsAt);let t=b.frameSamples;if(b.frameIntervalMs=t.length?t.reduce((n,i)=>n+i.intervalMs,0)/t.length:0,b.frameCpuMs=t.length?t.reduce((n,i)=>n+i.cpuMs,0)/t.length:0,b.frameIntervalP95Ms=fi(t.map(n=>n.intervalMs),.95),b.frameCpuP95Ms=fi(t.map(n=>n.cpuMs),.95),b.frames=0,b.fpsAt=e,b.workspace==="bom"){let n=De?.payload?.counts||{},i=[["Renderer","BoM DOM table"],["Schema",De?.payload?.schema||"-"],["Grouped rows",n.rows||0],["Components",n.components||0],["DNP components",n.dnpComponents||0],["Extra columns",De?.payload?.extraColumns?.length||0],["Frame interval",`${b.frameIntervalMs.toFixed(2)} ms avg / ${b.frameIntervalP95Ms.toFixed(2)} p95`],["CPU frame",`${b.frameCpuMs.toFixed(2)} ms avg / ${b.frameCpuP95Ms.toFixed(2)} p95`],["FPS",b.fps.toFixed(1)]];Pa.innerHTML=i.map(([o,c])=>`<dt>${o}</dt><dd>${c}</dd>`).join("");return}let a=b.workspace==="schematic"&&S?S.stats():null,s=b.workspace==="schematic"&&X?X.stats():null,r=b.workspace==="schematic"&&S?X?.active?[["Renderer","SVG DOM schematic detail"],["Pages",O.pages.length],["Mounted pages",s.mountedPages],["Active page",s.activePage],["DOM nodes",s.domNodes.toLocaleString()],["Indexed features",s.indexedFeatures.toLocaleString()],["Indexed nets",s.indexedNets.toLocaleString()],["SVG cache",`${s.cachedSvgPages} pages / ${(s.cachedSvgBytes/1048576).toFixed(1)} MB`],["Selection",`${s.selectionMs.toFixed(1)} ms`],["Active net",M.nets.find(n=>n.uid===O.activeNetUid)?.name||"-"],["Tracking links",`${a.netFlowSegments} total / ${a.netFlowIntrasheetSegments} local`],["Tracking verts",a.netFlowVertices.toLocaleString()],["Mount",`${s.mountMs.toFixed(1)} ms`],["Highlight",`${s.highlightMs.toFixed(1)} ms`],["Fallback",s.fallbackReason||"-"],["Frame interval",`${b.frameIntervalMs.toFixed(2)} ms avg / ${b.frameIntervalP95Ms.toFixed(2)} p95`],["CPU frame",`${b.frameCpuMs.toFixed(2)} ms avg / ${b.frameCpuP95Ms.toFixed(2)} p95`],["FPS",b.fps.toFixed(1)]]:[["Renderer",X?"SVG DOM + WebGPU world":"WebGPU schematic world"],["Pages",O.pages.length],["Visible pages",O.visiblePages.length],["DOM pages",s?s.mountedPages:0],["DOM nodes",s?s.domNodes.toLocaleString():"0"],["Indexed SVG features",s?s.indexedFeatures.toLocaleString():"0"],["SVG cache",s?`${s.cachedSvgPages} pages / ${(s.cachedSvgBytes/1048576).toFixed(1)} MB`:"0 pages"],["JS heap",s?.heapMb?`${s.heapMb.toFixed(1)} MB`:"-"],["Hierarchy links",O.manifest.edges?.length||0],["Selected page",O.byId.get(b.selectedPageId)?.name||"-"],["Active net",M.nets.find(n=>n.uid===O.activeNetUid)?.name||"-"],["Tracking links",`${a.netFlowSegments} total / ${a.netFlowIntrasheetSegments} local`],["Downloaded",`${(S.downloadedBytes/1048576).toFixed(1)} MB`],["Resident vectors",`${(a.residentVectorBytes/1048576).toFixed(1)} MB`],["Vector pages",`${a.vectorChunks} loaded / ${a.vectorLoads} loading`],["Vector draw",`${a.vectorVertices.toLocaleString()} verts / ${a.vectorDrawChunks} chunks`],["Native detail",`${a.nativeDetailPages} pages @ ${a.nativePxPerMm} / ${a.nativeThresholdPxPerMm} px/mm`],["Vector failures",a.failedVectorChunks],["Truncated",a.truncatedVectors],["Frame interval",`${b.frameIntervalMs.toFixed(2)} ms avg / ${b.frameIntervalP95Ms.toFixed(2)} p95`],["CPU frame",`${b.frameCpuMs.toFixed(2)} ms avg / ${b.frameCpuP95Ms.toFixed(2)} p95`],["FPS",b.fps.toFixed(1)]]:[["Renderer","WebGPU semantic glTF"],["Mode",b.mode==="3d"?"3D":"Layer Compare"],["Visible layers",b.mode==="3d"?b.visible3dLayers.size:b.compareLayers.size],["Resident tiles",M.loaded.size],["Loading tiles",M.loading.size],["Failed tiles",M.failed.size],["Triangles",Math.round(b.triangles).toLocaleString()],["Downloaded",`${(b.loadedBytes/1048576).toFixed(1)} MB`],["Resident GLB",`${(b.residentTileBytes/1048576).toFixed(1)} MB`],["Resident GPU",`${(b.residentTileGpuBytes/1048576).toFixed(1)} MB`],["Tile loads",b.tileLoads.toLocaleString()],["Tile evictions",b.tileEvictions.toLocaleString()],["Tile scheduler",`${b.tileSchedulerMs.toFixed(2)} ms`],["Active net",M.nets.find(n=>Number(n.id)===b.activeNetId)?.name||"-"],["Frame interval",`${b.frameIntervalMs.toFixed(2)} ms avg / ${b.frameIntervalP95Ms.toFixed(2)} p95`],["CPU frame",`${b.frameCpuMs.toFixed(2)} ms avg / ${b.frameCpuP95Ms.toFixed(2)} p95`],["FPS",b.fps.toFixed(1)]];Pa.innerHTML=r.map(([n,i])=>`<dt>${n}</dt><dd>${i}</dd>`).join("")}function $i(e){return`rgb(${e.slice(0,3).map(t=>Math.round(t*255)).join(" ")})`}function Ch(){if(!Re)return;let e=M.layers||[];if(!e.length){Re.innerHTML='<div class="selection-empty" style="padding:40px;text-align:center;">No stackup information available for this board.</div>';return}let t=e.filter(k=>["copper","dielectric","paste","silkscreen","soldermask"].includes(k.role)),a=ge.board?.stackup||{},s=k=>{if(k==null||k==="")return"None";let B=String(k);return D(B.includes(".")?B.split(".").pop():B)},r=(k,B=4)=>{let U=Number(k);return Number.isFinite(U)&&U>0?U.toFixed(B):"-"},n=(k,B=3)=>{let U=Number(k);return Number.isFinite(U)?U.toFixed(B):"-"},i=k=>{if(k==null||k==="")return"No";if(typeof k=="boolean")return k?"Yes":"No";let B=String(k).trim().toLowerCase(),U=B.includes(".")?B.split(".").pop():B;return["0","false","no","n","off","none"].includes(U)?"No":(["1","true","yes","y","on"].includes(U),"Yes")},o=k=>({copper:"Copper",dielectric:"Dielectric",paste:"Paste",silkscreen:"Silkscreen",soldermask:"Solder mask"})[k]||String(k||"Layer"),c=k=>k.role!=="dielectric"?"":k.type==="core"?"Core":k.type==="prepreg"||(k.material||"").toLowerCase().includes("prepreg")?"Prepreg":"Core",l=(k,B=4)=>{let U=Number(k.thickness_mm);return Number.isFinite(U)&&U>0?`${U.toFixed(B)} mm`:"Not specified"},p=k=>{let B=o(k.role),U=String(k.material||"").trim(),q=U&&U.toLowerCase()!==String(k.role||"").toLowerCase();if(k.role==="dielectric"){let le=[q?U:"",r(k.epsilon_r,3)!=="-"?`\u03B5r ${r(k.epsilon_r,3)}`:"",r(k.loss_tangent,4)!=="-"?`tan \u03B4 ${r(k.loss_tangent,4)}`:""].filter(Boolean).join(" \xB7 ");return{primary:`${k.name} \xB7 ${c(k)}`,secondary:le}}return{primary:[k.name,B,q?U:""].filter(Boolean).join(" \xB7 "),secondary:""}},g=0,v=0,x=0,u=0;t.forEach(k=>{u+=k.thickness_mm||0,k.role==="copper"?k.name.toLowerCase().includes("gnd")||k.name.toLowerCase().includes("pwr")||k.name.toLowerCase().includes("plane")?v++:g++:k.role==="dielectric"&&x++});let d=M.copperLayers||[],m=0,f=0,h=0,y=[...(M.manifest?.barrels||[]).filter(k=>k.kind==="via"),...[...M.features.values()].filter(k=>k.kind==="via")],w=qn(d,y);m=w.counts.thru,f=w.counts.blind,h=w.counts.buried;let T=w.spans,E=new Map(t.map((k,B)=>[k,B])),R=Oh(t),I=(k,B)=>{let U=R.get(k.name);if(U!==void 0)return U;let q=Number(k.stack_index);return Number.isFinite(q)?q:B+1e5},_=[...t].sort((k,B)=>{let U=I(k,E.get(k)||0),q=I(B,E.get(B)||0);return U!==q?U-q:(B.z_mm||0)-(k.z_mm||0)}),A=_.map(k=>{let B=k.color||"#7f7f7f";k.role==="copper"?B=k.color||"#f97316":k.role==="dielectric"?B="#a98d5c":k.role==="paste"?B="#cbd5e1":k.role==="soldermask"?B="#1b4332":k.role==="silkscreen"&&(B="#e2e8f0");let U=p(k),q=Number.isFinite(Number(k.thickness_mm))&&Number(k.thickness_mm)>0;return{id:String(k.id),name:String(k.name),role:k.role,color:B,thicknessMm:Number(k.thickness_mm)||0,thicknessLabel:q?l(k):"-",primary:U.primary,secondary:U.secondary,copperIndex:d.findIndex(le=>le.name===k.name)+1,description:[U.primary,U.secondary,`Thickness ${l(k)}`].filter(Boolean).join("; ")}}),j=`
    <svg class="stackup-visual-svg" aria-label="Board cross-section, total thickness ${u.toFixed(4)} mm"></svg>
    <div class="stackup-via-legend" aria-label="Via span legend">
      <span><i data-via-type="thru"></i>Thru</span>
      <span><i data-via-type="blind"></i>Blind</span>
      <span><i data-via-type="buried"></i>Buried</span>
    </div>
  `,P="";_.forEach(k=>{let B="silk";k.role==="copper"?B="copper":k.role==="dielectric"?B="dielectric":k.role==="paste"?B="paste":k.role==="soldermask"&&(B="mask");let U=c(k),q=D(k.id),le=D(k.name),me=p(k);P+=`
      <tr data-layer-id="${q}" data-layer-name="${le}" tabindex="0" aria-label="${D(`${me.primary}; thickness ${l(k)}`)}">
        <td><strong>${le}</strong></td>
        <td><span class="stackup-badge ${B}">${k.role}</span></td>
        <td>${U||"-"}</td>
        <td>${D(k.material||"-")}</td>
        <td>${k.role==="dielectric"?r(k.epsilon_r,3):"-"}</td>
        <td>${k.role==="dielectric"?r(k.loss_tangent,4):"-"}</td>
        <td>${k.thickness_mm?k.thickness_mm.toFixed(4)+" mm":"-"}</td>
      </tr>
    `});let F="",C=ge.board?.net_classes||[],H=k=>{let B=n(k);return B==="-"?B:`${B} mm`};C.length?C.forEach(k=>{F+=`
        <tr>
          <td><strong>${k.name}</strong></td>
          <td>${H(k.track_width)}</td>
          <td>${H(k.clearance)}</td>
          <td>${H(k.diff_pair_width)}</td>
          <td>${H(k.diff_pair_gap)}</td>
          <td>${Number.isFinite(Number(k.via_diameter))?`${n(k.via_drill)}/${n(k.via_diameter)} mm`:"-"}</td>
        </tr>
      `}):F=`
      <tr>
        <td colspan="6" class="selection-empty" style="text-align: center;">No design rules or impedance classes defined.</td>
      </tr>
    `,Re.innerHTML=`
    <div class="stackup-workspace-body">
      <div class="stackup-diagram-card">
        <span class="stackup-section-title">Cross-Section Profile</span>
        ${j}
      </div>
      <aside class="stackup-side-panel">
      <div class="stackup-summary-grid stackup-summary-grid-3">
        <div class="stackup-summary-card">
          <label>Total Thickness</label>
          <span>${u.toFixed(4)} mm</span>
        </div>
        <div class="stackup-summary-card">
          <label>Copper Layers</label>
          <span>${d.length} (${g} Sig / ${v} Plane)</span>
        </div>
        <div class="stackup-summary-card">
          <label>Dielectrics</label>
          <span>${x} Layers</span>
        </div>
        <div class="stackup-summary-card">
          <label>Thru Vias</label>
          <span>${m}</span>
        </div>
        <div class="stackup-summary-card">
          <label>Blind Vias</label>
          <span>${f}</span>
        </div>
        <div class="stackup-summary-card">
          <label>Buried Vias</label>
          <span>${h}</span>
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
                ${P}
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
                ${F}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      </aside>
    </div>
  `;let se=(k,B)=>{Re.querySelectorAll(".stackup-svg-layer").forEach(U=>{let q=U.dataset.layerId===k;U.classList.toggle("active",q&&B)}),Re.querySelectorAll(".stackup-table tbody tr[data-layer-id]").forEach(U=>{let q=U.dataset.layerId===k;U.classList.toggle("active",q&&B)})},ie=k=>{let B=Re.querySelector(".stackup-diagram-card"),U=Re.querySelector(`.stackup-svg-layer[data-layer-id="${CSS.escape(k)}"]`);if(!B||!U||B.scrollHeight<=B.clientHeight)return;let q=B.getBoundingClientRect(),le=U.getBoundingClientRect(),me=B.scrollTop+le.top-q.top-(B.clientHeight-le.height)/2,Ct=window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;B.scrollTo({top:Math.max(0,me),behavior:Ct?"auto":"smooth"})};((k,{revealDiagram:B=!1}={})=>{k.forEach(U=>{let q=()=>{let me=U.dataset.layerId;se(me,!0),B&&ie(me)},le=()=>se(null,!1);U.addEventListener("mouseenter",q),U.addEventListener("mouseleave",le),B&&(U.addEventListener("focus",q),U.addEventListener("blur",le))})})(Re.querySelectorAll(".stackup-table tbody tr[data-layer-id]"),{revealDiagram:!0}),Bh(Re.querySelector(".stackup-visual-svg"),{layers:A,spans:T,totalLabel:`Total ${u.toFixed(4)} mm`,onLayerHover:k=>se(k,!!k)})}function Bh(e,{layers:t,spans:a,totalLabel:s,onLayerHover:r}){if(Oa?.disconnect(),Oa=null,!e)return;let n=()=>window.matchMedia?.("(max-width: 1180px)")?.matches,i="",o=()=>{let c=e.clientWidth,l=n()?Vn(t):e.clientHeight;if(!c||!l)return;let p=`${c}x${l}`;p!==i&&(i=p,n()?e.style.height=`${l}px`:e.style.removeProperty("height"),e.setAttribute("viewBox",`0 0 ${c} ${l}`),e.innerHTML=Hn(zn(t,{width:c,height:l}),{spans:a,totalLabel:s}))};e.addEventListener("mouseover",c=>{let l=c.target.closest?.(".stackup-svg-layer");r(l?l.dataset.layerId:null)}),e.addEventListener("mouseleave",()=>r(null)),typeof ResizeObserver<"u"&&(Oa=new ResizeObserver(o),Oa.observe(e)),o()}function Oh(e){let t=e.filter(r=>r.role==="dielectric");if(!(t.length===1&&t[0]?.name==="Board"))return new Map;let s=new Map;return["F.SilkS","F.Paste","F.Mask","F.Cu","Board","B.Cu","B.Mask","B.Paste","B.SilkS"].forEach((r,n)=>s.set(r,n)),s}function Qi(){let e=null;return{begin(){return e?.abort(),e=new AbortController,e},owns(t){return t!==null&&t===e&&!t.signal.aborted},cancel(){e?.abort(),e=null}}}async function Zi(e,t,{owner:a,bundleUrl:s,loadBundle:r,now:n=()=>performance.now()}){let i=n(),o={},{signal:c}=t,l=()=>a.owns(t)&&e.isConnected;try{e.renderLoading();let p=n(),{bundle:g,topology:v,semanticGeometry:x}=await r(s,o,c);if(o.bundle_group_total_ms=n()-p,!l())return;e.renderShell();let u=n(),d=await e.mountViewer({topology:v,semanticGeometry:x,readiness:g.readiness,signal:c});if(!l()){d?.dispose?.();return}e.publishController(d),o.mount_and_first_frame_ms=n()-u,Object.assign(o,d?.performance||{}),o.reload_to_visible_ms=n()-i,e.emitReady({schema:"prism.semantic_viewer_performance.a0",milestone:"board-visible",readiness_stage:g.readiness?.stage||"semantic-ready",readiness_progress:g.readiness?.progress??100,timings:o})}catch(p){if(!l())return;e.renderError(p),e.emitError(p)}}var Ph="prism.visualizer_bundle.a0";function Dh(){return`
    <style>
      ${cr}
      #app { grid-template-columns: minmax(0, 1fr) 376px; }
      #app.panel-collapsed { grid-template-columns: minmax(0, 1fr) 46px; }
      #app.workspace-stackup { grid-template-columns: minmax(0, 1fr); }
      #selection-card { display: none !important; }
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
  `}function Uh(e){return String(e).replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t])}async function nr(e,t=null,a="fetch",s=void 0){let r=performance.now(),n=await fetch(e,{cache:"no-store",signal:s});if(!n.ok)throw new Error(`Failed to load ${e}: ${n.status}`);let i=await n.json();return t&&(t[`${a}_fetch_parse_ms`]=performance.now()-r,t[`${a}_content_length`]=Number(n.headers.get("content-length")||0)),i}function Lh(e,t){if(!t)return e;let a=new URL(e);return a.searchParams.set("viewer",t),a.toString()}function Kh(e,t,a,s){let r=new URL(a.asset_base||"./",t),n=structuredClone(e||{}),i=o=>!o||typeof o!="string"?o:Lh(new URL(o,r).toString(),s);for(let o of["assets","semantic_gltf","schematic_world","schematic_vector","schematic_scene","bom"]){let c=n[o];if(!(!c||typeof c!="object"))for(let[l,p]of Object.entries(c))c[l]=i(p)}return n}async function Gh(e,t,a){let s=new URL(e,document.baseURI).toString(),r=new URL(s).searchParams.get("viewer")||"",n=await nr(s,t,"bundle",a);if(n.schema!==Ph)throw new Error(`Unsupported visualizer bundle schema: ${n.schema||"missing"}`);let i=new URL(n.topology||"topology.json",s),o=new URL(n.semantic_geometry||"semantic_geometry.json",s),[c,l]=await Promise.all([nr(i,t,"topology",a),nr(o,t,"semantic_geometry",a)]);return{bundle:n,topology:c,semanticGeometry:Kh(l,s,n,r)}}var ir=class extends HTMLElement{static get observedAttributes(){return["bundle-url","workspace"]}constructor(){super(),this.attachShadow({mode:"open"}),this.controller=null,this.reloadOwner=Qi(),this.pendingSelection=null,this.pendingHiddenComponents=null,this.reloadQueued=!1,this.reloadSource=null}connectedCallback(){this.queueReload()}disconnectedCallback(){this.reloadOwner.cancel(),this.controller?.dispose?.(),this.controller=null,this.reloadSource=null}attributeChangedCallback(t,a,s){if(!(!this.isConnected||a===s)){if(t==="workspace"){this.controller?.setWorkspace?.(this.workspace);return}this.queueReload()}}get workspace(){return this.getAttribute("workspace")==="stackup"?"stackup":"pcb"}queueReload(){let t=this.getAttribute("bundle-url");!t||t===this.reloadSource||(this.reloadSource=t,!this.reloadQueued&&(this.reloadQueued=!0,queueMicrotask(()=>{this.reloadQueued=!1,this.isConnected&&this.reload()})))}async reload(){let t=this.getAttribute("bundle-url"),a=this.reloadOwner.begin();if(this.controller?.dispose?.(),this.controller=null,!t){this.shadowRoot.innerHTML="<style>:host{display:block;height:100%;font:14px system-ui;color:#94a3b8}</style><div>Semantic bundle URL is missing.</div>";return}await Zi(this,a,{owner:this.reloadOwner,bundleUrl:t,loadBundle:Gh})}renderLoading(){this.shadowRoot.innerHTML='<style>:host{display:block;height:100%;background:#020817;color:#e5e7eb;font:14px system-ui}</style><div style="display:grid;place-items:center;height:100%">Loading semantic visualizer...</div>'}renderShell(){this.shadowRoot.innerHTML=Dh()}renderError(t){console.error(t),this.shadowRoot.innerHTML=`
      <style>
        :host{display:block;height:100%;background:#020817;color:#e5e7eb;font:14px system-ui}
        .error{height:100%;display:grid;place-items:center;padding:24px}
        pre{max-width:100%;white-space:pre-wrap;color:#fecaca;background:#111827;border:1px solid #374151;padding:16px}
      </style>
      <div class="error"><pre>${Uh(t?.stack||t?.message||String(t))}</pre></div>
    `}mountViewer({topology:t,semanticGeometry:a,readiness:s,signal:r}){return Xs({root:this.shadowRoot,topology:t,semanticGeometry:a,readiness:s,workspaceScope:"3d",isActive:()=>this.getAttribute("active")==="true",onSelectionChange:n=>{r.aborted||this.dispatchEvent(new CustomEvent("prism-semantic-viewer:selectionchange",{bubbles:!0,composed:!0,detail:{selection:n}}))},onContextMenu:n=>{r.aborted||this.dispatchEvent(new CustomEvent("prism-semantic-viewer:contextmenu",{bubbles:!0,composed:!0,detail:n}))},onViewStateChange:n=>{r.aborted||this.emitViewState(n)},onPerformanceEvent:n=>{r.aborted||(console.info("[prism-3d-perf]",n),this.dispatchEvent(new CustomEvent("prism-semantic-viewer:performance",{bubbles:!0,composed:!0,detail:n})))}})}publishController(t){this.controller=t,this.controller?.setWorkspace?.(this.workspace),this.pendingHiddenComponents&&this.controller?.setHiddenComponents?.(this.pendingHiddenComponents),this.pendingSelection&&this.controller?.setSelection?.(this.pendingSelection),this.pendingHighlightedNets?.length&&this.controller?.setHighlightedNets?.(this.pendingHighlightedNets);let a=this.getViewState();a&&this.emitViewState(a)}emitViewState(t){this.dispatchEvent(new CustomEvent("prism-semantic-viewer:viewstatechange",{bubbles:!0,composed:!0,detail:t}))}emitReady(t){console.info("[prism-3d-perf]",t),this.dispatchEvent(new CustomEvent("prism-semantic-viewer:ready",{bubbles:!0,composed:!0,detail:t}))}emitError(t){this.dispatchEvent(new CustomEvent("prism-semantic-viewer:error",{bubbles:!0,detail:{error:t}}))}setSelection(t){this.pendingSelection=t||null,this.controller?.setSelection?.(this.pendingSelection)}setHighlightedNets(t){this.pendingHighlightedNets=Array.isArray(t)?[...t]:[],this.controller?.setHighlightedNets?.(this.pendingHighlightedNets)}setHiddenComponents(t){this.pendingHiddenComponents=Array.isArray(t)?[...t]:[],this.controller?.setHiddenComponents?.(this.pendingHiddenComponents)}getComponentReferences(){return this.controller?.getComponentReferences?.()??[]}resize(){this.controller?.resize?.()}getViewState(){return this.controller?.getViewState?.()??null}setViewMode(t){this.controller?.setViewMode?.(t)}setLayerVisible(t,a){this.controller?.setLayerVisible?.(t,a)}applyLayerPreset(t){this.controller?.applyLayerPreset?.(t)}setShowBoard(t){this.controller?.setShowBoard?.(t)}setShowComponents(t){this.controller?.setShowComponents?.(t)}setShowPlaceholders(t){this.controller?.setShowPlaceholders?.(t)}setRealisticColors(t){this.controller?.setRealisticColors?.(t)}setSeparation(t){this.controller?.setSeparation?.(t)}showNetLayers(){this.controller?.showNetLayers?.()}setNetIsolation(t){this.controller?.setNetIsolation?.(t)}};function eo(){customElements.get("prism-semantic-viewer")||customElements.define("prism-semantic-viewer",ir)}window.__PRISM_SEMANTIC_VIEWER_MANUAL_BOOT__=!0;eo();
