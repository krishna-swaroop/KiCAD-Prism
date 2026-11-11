function qr(t,e=()=>""){let s=new Map;for(let r of t){let n=`${e(r)}:${JSON.stringify(r.material)}`;s.has(n)||s.set(n,[]),s.get(n).push(r)}return[...s.values()].map(r=>{let a=r.reduce((p,d)=>p+d.position.length/3,0),n=r.reduce((p,d)=>p+d.indices.length,0),i=new Float32Array(a*3),o=new Float32Array(a*3),c=new Uint32Array(a),l=new Uint32Array(a),u=new Uint32Array(n),f=0,b=0,g=[1/0,1/0,1/0,-1/0,-1/0,-1/0];for(let p of r){let d=p.position.length/3;i.set(p.position,f*3),o.set(p.normal,f*3),c.set(p.netId,f),l.set(p.objectFeatureId,f);for(let m=0;m<p.indices.length;m+=1)u[b+m]=Number(p.indices[m])+f;p.bounds&&(g[0]=Math.min(g[0],p.bounds[0]),g[1]=Math.min(g[1],p.bounds[1]),g[2]=Math.min(g[2],p.bounds[2]),g[3]=Math.max(g[3],p.bounds[3]),g[4]=Math.max(g[4],p.bounds[4]),g[5]=Math.max(g[5],p.bounds[5])),f+=d,b+=p.indices.length}return{position:i,normal:o,netId:c,objectFeatureId:l,indices:u,material:r[0].material,groupKey:e(r[0]),bounds:Number.isFinite(g[0])?g:null}})}function ws(t){return!t||t.length!==6?null:[t[0]/1e3,-t[4]/1e3,t[2]/1e3,t[3]/1e3,-t[1]/1e3,t[5]/1e3]}function $s(t){let e=t?.min||[0,0,0],s=t?.max||[.08,.0016,.05];return[e[0],-s[2],e[1],s[0],-e[2],s[1]]}function vs(t){let e=t.filter(s=>Array.isArray(s)&&s.length===6);return e.length?e.reduce((s,r)=>[Math.min(s[0],r[0]),Math.min(s[1],r[1]),Math.min(s[2],r[2]),Math.max(s[3],r[3]),Math.max(s[4],r[4]),Math.max(s[5],r[5])],[...e[0]]):null}function gc(t){let e=t.replace("#","");return[0,2,4].map(s=>parseInt(e.slice(s,s+2),16)/255)}var zb="#c83434",Gb="#4d7fc4",Hr=["#7fc87f","#ce7d2c","#4fcbcb","#db628b","#a7a5c6","#28ccd9","#e8b2a7","#f2eda1","#8dcb81","#ed7c33","#5bc3eb","#f76f8e","#a7a5c6","#28ccd9","#e8b2a7","#f2eda1","#ed7c33","#5bc3eb","#f76f8e","#a7a5c6","#28ccd9","#e8b2a7","#f2eda1","#ed7c33","#5bc3eb","#f76f8e","#a7a5c6","#28ccd9","#e8b2a7","#f2eda1"];function Xn(t,e=0){if(t==="F.Cu")return zb;if(t==="B.Cu")return Gb;let s=/^In(\d+)\.Cu$/.exec(String(t||""))?.[1],r=s?Number(s)-1:e;return Hr[(r%Hr.length+Hr.length)%Hr.length]}function mc(t,e){if(typeof t?.color=="string"&&/^#[0-9a-fA-F]{6}$/.test(t.color))return[...gc(t.color),1];let s=String(t?.name||""),r=Math.max(0,e.findIndex(a=>a.name===s)-1);return[...gc(Xn(s,r)),1]}var Xs=Object.freeze({gold:[.83,.69,.37,1],silver:[.74,.75,.77,1],copper:[.76,.47,.28,1]});function yc(t){let e=String(t||"").toLowerCase();return/hasl|hal\b|tin|silver|lead/.test(e)?Xs.silver:/osp|bare|none/.test(e)?Xs.copper:Xs.gold}function wc(t,e){let s=String(t?.name||"");return!!s&&(s===e[0]?.name||s===e[e.length-1]?.name)}var xc="prism.viewer_3d.analytic.a0",Yn={"F.SilkS":"#f2f2f2","B.SilkS":"#dddddd","F.Mask":"#316d4f","B.Mask":"#275840","F.Paste":"#c5cbd3","B.Paste":"#aeb7c2"},Kb="#2f6b4f",Vb={green:"#316d4f",red:"#a5272a",blue:"#1f4f8a",yellow:"#c9a227",white:"#e6e6e6",black:"#1a1a1a",purple:"#5b2d7a"},Hb={conductor:"copper",dielectric:"dielectric",solder_mask:"soldermask",silkscreen:"silkscreen",paste:"paste"},qb={copper:"copper",dielectric:"FR4",soldermask:"soldermask",silkscreen:"ink",paste:"paste"};function Wb(t,e){let s=String(t?.maskColors?.[e]||"").trim();return/^#[0-9a-f]{6}$/i.test(s)?s:Vb[s.toLowerCase()]||(e==="back"?Yn["B.Mask"]:Yn["F.Mask"])}function Xb(t,e=null){let s=[...t?.stack?.slices||[]].sort((c,l)=>c.order-l.order),r=c=>Number(c.thickness_nm||0)/1e6,n=s.reduce((c,l)=>c+r(l),0)/2,i=0,o=[];for(let c of s){let l=Hb[c.role],u=r(c),f=n-u/2;if(n-=u,!l)continue;let b=String(c.kicad_layer||c.key),g=Yn[b];l==="copper"&&(g=Xn(b,b==="F.Cu"||b==="B.Cu"?0:i++)),l==="soldermask"&&(g=Wb(e,c.side==="back"?"back":"front")),l==="dielectric"&&(g=c.color||Kb),o.push({id:o.length+1,uid:`layer_${c.key}`,name:b,role:l,z_mm:+f.toFixed(6)||0,thickness_mm:+u.toFixed(6),material:c.material_name||qb[l],color:g||"#8a8a8a",visibility_group:l==="dielectric"?"board":l,stack_index:c.order,side:c.side||null,sliceKey:c.key})}return o}function $b(t){let e=t?.chunks||[],s=e.filter(a=>String(a.slice_key||"").startsWith("dielectric")),r=null;for(let a of s.length?s:e){let n=a.bounds;if(!n)continue;let i=[n.min_x_nm,n.min_y_nm,n.max_x_nm,n.max_y_nm].map(o=>Number(o)/1e6);r=r?[Math.min(r[0],i[0]),Math.min(r[1],i[1]),Math.max(r[2],i[2]),Math.max(r[3],i[3])]:i}return r}var Yb=1,kc=1073741824;function Jb(t,e){let s=t?.body_bounds,r=t?.affine;if(!s||!r)return null;let[a,n,i,o]=[1/0,1/0,-1/0,-1/0];for(let[b,g]of[[s.min_x_nm,s.min_y_nm],[s.max_x_nm,s.min_y_nm],[s.min_x_nm,s.max_y_nm],[s.max_x_nm,s.max_y_nm]]){let p=(r.m11*b+r.m12*g+Number(r.tx_nm))/1e6,d=(r.m21*b+r.m22*g+Number(r.ty_nm))/1e6;[a,n,i,o]=[Math.min(a,p),Math.min(n,d),Math.max(i,p),Math.max(o,d)]}let c=t.body_height_nm?Number(t.body_height_nm)/1e6:1,l=e/2,[u,f]=t.side==="back"?[-l-c,-l]:[l,l+c];return[a,n,u,i,o,f]}function Ec(t,e=null){let s=Xb(t,e),r=[{id:0,uid:"",name:"",netClass:""}];for(let c of t?.nets||[])c?.name&&r.push({id:r.length,uid:String(c.key||c.name),name:String(c.name),netClass:String(c.net_class||""),aliases:[]});let a=Number(t?.stack?.board_thickness_nm||0)/1e6,n=(t?.components||[]).map((c,l)=>({id:l+1,featureId:Yb+l,uid:String(c.source_uid||""),designator:String(c.refdes||""),footprint:String(c.footprint||""),side:c.side||null,nodeIndex:null,meshNames:[],boundsMm:Jb(c,a)})),i=$b(t);return{schema:"prism.analytic_scene.a0",bbox:i?{min:[i[0]/1e3,-a/2e3,i[1]/1e3],max:[i[2]/1e3,a/2e3,i[3]/1e3]}:null,componentsZOffsetMm:-a/2,layers:s,copperLayerIds:s.filter(c=>c.role==="copper").map(c=>c.id),nets:r,objectFeatures:[],components:n,tiles:[],barrels:[]}}var $n={green:[.06,.16,.11,.83],red:[.52,.05,.05,.83],blue:[.05,.12,.42,.83],black:[.05,.05,.05,.85],white:[.9,.9,.9,.83],purple:[.3,.1,.4,.83],yellow:[.7,.62,.1,.83]},Qb=[.62,.63,.65,1],Zb=[.9,.9,.88,1],eg=t=>{let e=t/255;return e<=.04045?e/12.92:((e+.055)/1.055)**2.4};function vc(t){let e=String(t||"").trim().toLowerCase(),s=/^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(e);if(s){let r=[0,2,4].map(n=>parseInt(s[1].slice(n,n+2),16)),a=s[2]?parseInt(s[2],16)/255:$n.green[3];return[...r.map(n=>+eg(n).toFixed(4)),+a.toFixed(4)]}return[...$n[e]||$n.green]}function Mc(t){let e=t?.maskColors?.front||"";return{soldermask:{front:vc(e),back:vc(t?.maskColors?.back||e)},paste:[...Qb],silkscreen:[...Zb]}}var Sc=`:host,
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
`;var sg={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};function z(t){return String(t??"").replace(/[&<>"']/g,e=>sg[e])}var rg=/\/api\/projects\/([^/]+)\/webgpu-3d\/assets\/([^/]+)\/([^/]+)\/(.+)$/,ag="prism-bundle-cache-a0";var Ys="manifest.json",ng="prism.bundle_cache_manifest.a0",ig="prism-asset-cache",og=600*1e3,Ic=720*60*60*1e3,Rc=2*1024*1024*1024;function Jn(t){let e;try{e=new URL(t,"http://cache.invalid/")}catch{return null}let s=rg.exec(e.pathname);if(!s)return null;let[,r,a,n,i]=s.map(decodeURIComponent);if(i.split("/").some(c=>!c||c==="."||c===".."))return null;let o=e.searchParams.get("viewer")||"";return`${r}/${a}/${n}/${i}${o?`?viewer=${o}`:""}`}function Wr(t){return`a_${encodeURIComponent(t)}`}function Tc(t){if(!t.startsWith("a_"))return null;try{return decodeURIComponent(t.slice(2))}catch{return null}}function cg(t,e,{maxAgeMs:s=Ic,maxBytes:r=Rc}={}){let a=new Set,n=[];for(let[o,c]of Object.entries(t))e-Number(c.lastUsed||0)<=s?n.push([o,c]):a.add(o);n.sort((o,c)=>Number(c[1].lastUsed)-Number(o[1].lastUsed));let i=0;for(let[o,c]of n)i+=Number(c.bytes||0),i>r&&a.add(o);return[...a]}function Ac(t,e,s){let r=Number(t?.[e]||0);return r>0&&Number(s?.lastUsed||0)<=r}function _c(t={},e={},s={}){let r={};for(let[a,n]of Object.entries(e))Ac(s,a,n)||(r[a]=n);for(let[a,n]of Object.entries(t))Ac(s,a,n)||Number(n?.lastUsed||0)>=Number(r[a]?.lastUsed||0)&&(r[a]=n);return r}function lg(t,e,s,r=og){return t.filter(a=>!e.has(a.name)&&!(s-Number(a.lastModified||0)<=r)).map(a=>a.name)}var Xr=class t{static open(e={}){return t.shared||(t.shared=new t(e)),t.shared}constructor({maxAgeMs:e=Ic,maxBytes:s=Rc}={}){this.maxAgeMs=e,this.maxBytes=s,this.stats={hits:0,misses:0,bypassed:0,cachedBytes:0,networkBytes:0,writeErrors:0},this.removed={},this.ready=this.init(),this.flushTimer=null}async init(){try{let e=globalThis.navigator?.storage;if(!e?.getDirectory)return null;let r=await(await e.getDirectory()).getDirectoryHandle(ag,{create:!0});return typeof(await r.getFileHandle(Ys,{create:!0})).createWritable!="function"?null:(this.directory=r,this.entries=await this.#r(),await this.prune(),globalThis.addEventListener?.("pagehide",()=>void this.flush()),r)}catch{return null}}get enabled(){return!!this.directory}async fetchBytes(e,{store:s=!0,signal:r}={}){let a=Jn(e);if(await this.ready,a&&this.directory){let c=await this.read(a);if(c)return this.stats.hits+=1,this.stats.cachedBytes+=c.byteLength,c;this.stats.misses+=1}else this.stats.bypassed+=1;let n=await fetch(e,{cache:"no-store",signal:r});if(!n.ok)throw new Error(`Failed to load ${e}: ${n.status}`);let i=await n.arrayBuffer(),o=Number(n.headers.get("content-length")||0);return this.stats.networkBytes+=i.byteLength,s&&a&&this.directory&&(!o||o===i.byteLength)&&this.write(a,i),i}async fetchJson(e,s={}){let r=await this.fetchBytes(e,s);return JSON.parse(new TextDecoder().decode(r))}async peekJson(e){let s=Jn(e);if(await this.ready,!s||!this.directory)return null;let r=await this.read(s);return r?(this.stats.hits+=1,this.stats.cachedBytes+=r.byteLength,JSON.parse(new TextDecoder().decode(r))):null}async store(e,s){let r=Jn(e);await this.ready,r&&this.directory&&await this.write(r,s)}async read(e){let s=this.entries[e];if(!s)return null;try{let r=await(await this.directory.getFileHandle(Wr(e))).getFile();return r.size!==s.bytes?null:(s.lastUsed=Date.now(),this.scheduleFlush(),await r.arrayBuffer())}catch{return delete this.entries[e],null}}async write(e,s){try{let a=await(await this.directory.getFileHandle(Wr(e),{create:!0})).createWritable();await a.write(s),await a.close(),this.entries[e]={bytes:s.byteLength,lastUsed:Date.now()},this.scheduleFlush()}catch{this.stats.writeErrors+=1}}adopt(e,s){this.directory&&(this.entries[e]={bytes:s,lastUsed:Date.now()},this.scheduleFlush())}async prune(e=Date.now()){if(!this.directory)return[];let s=[];try{await this.#e(async()=>{this.entries=_c(this.entries,await this.#r(),this.removed),s=cg(this.entries,e,{maxAgeMs:this.maxAgeMs,maxBytes:this.maxBytes});for(let i of s)delete this.entries[i],this.removed[i]=e,await this.directory.removeEntry(Wr(i)).catch(()=>{});let r=new Set(Object.keys(this.entries).map(Wr)),a=[];for await(let i of this.directory.keys()){if(i===Ys||r.has(i))continue;let o=await this.directory.getFileHandle(i).then(c=>c.getFile()).catch(()=>null);a.push({name:i,lastModified:o?.lastModified||0})}let n=lg(a,r,e);for(let i of n){let o=Tc(i);o&&(this.removed[o]=e),await this.directory.removeEntry(i).catch(()=>{})}(s.length||n.length)&&await this.#a(this.entries)})}catch{this.stats.writeErrors+=1}return s}async clear(){if(await this.ready,!this.directory)return;let e=Date.now(),s=Object.keys(this.entries||{});this.entries={};try{await this.#e(async()=>{for(let r of[...s,...Object.keys(await this.#r())])this.removed[r]=e;for await(let r of this.directory.keys()){if(r===Ys)continue;let a=Tc(r);a&&(this.removed[a]=e),await this.directory.removeEntry(r).catch(()=>{})}await this.#a({})})}catch{this.stats.writeErrors+=1}}summary(){let e=Object.values(this.entries||{});return{enabled:this.enabled,files:e.length,bytes:e.reduce((s,r)=>s+Number(r.bytes||0),0),...this.stats}}scheduleFlush(){this.flushTimer||(this.flushTimer=setTimeout(()=>{this.flushTimer=null,this.flush()},1e3))}#e(e){let s=globalThis.navigator?.locks;return typeof s?.request!="function"?e():s.request(ig,e)}async#r(){try{let s=await(await(await this.directory.getFileHandle(Ys,{create:!0})).getFile()).text();return s?JSON.parse(s).entries||{}:{}}catch{return{}}}async#a(e){let r=await(await this.directory.getFileHandle(Ys,{create:!0})).createWritable();await r.write(JSON.stringify({schema:ng,entries:e})),await r.close()}async flush(){if(this.directory)try{await this.#e(async()=>{this.entries=_c(this.entries,await this.#r(),this.removed),await this.#a(this.entries)})}catch{this.stats.writeErrors+=1}}};function dg(t,e){if(!e)return t;let s=new URL(t);return s.searchParams.set("viewer",e),s.toString()}function Nc(t,e,s,r){let a=new URL(s.asset_base||"./",e),n=structuredClone(t||{}),i=o=>!o||typeof o!="string"?o:dg(new URL(o,a).toString(),r);for(let o of["assets","semantic_gltf","schematic_world","schematic_vector","schematic_scene","bom"]){let c=n[o];if(!(!c||typeof c!="object"))for(let[l,u]of Object.entries(c))c[l]=i(u)}return n}function Qn(t){return(t?.readiness?.stage||"semantic-ready")==="semantic-ready"&&(t?.readiness?.progress??100)>=100}var de=(t,e,s)=>Math.max(e,Math.min(s,t)),Yr=(t,e,s)=>t+(e-t)*s;function Ce(t,e){return[t[0]+e[0],t[1]+e[1],t[2]+e[2]]}function ug(t,e){return[t[0]-e[0],t[1]-e[1],t[2]-e[2]]}function Me(t,e){return[t[0]*e,t[1]*e,t[2]*e]}function fg(t){return Math.hypot(t[0],t[1],t[2])}function $e(t){let e=fg(t)||1;return Me(t,1/e)}function Ye(t,e){return[t[1]*e[2]-t[2]*e[1],t[2]*e[0]-t[0]*e[2],t[0]*e[1]-t[1]*e[0]]}function st(t,e){return t[0]*e[0]+t[1]*e[1]+t[2]*e[2]}function Bc(t,e){let s=e/2,r=Math.sin(s),a=$e(t);return[a[0]*r,a[1]*r,a[2]*r,Math.cos(s)]}function $r(t,e){return[t[3]*e[0]+t[0]*e[3]+t[1]*e[2]-t[2]*e[1],t[3]*e[1]-t[0]*e[2]+t[1]*e[3]+t[2]*e[0],t[3]*e[2]+t[0]*e[1]-t[1]*e[0]+t[2]*e[3],t[3]*e[3]-t[0]*e[0]-t[1]*e[1]-t[2]*e[2]]}function Zn(t,e){let s=[e[0],e[1],e[2],0],r=[-t[0],-t[1],-t[2],t[3]];return $r($r(t,s),r).slice(0,3)}function Tt(t,e){let s=new Float32Array(16);for(let r=0;r<4;r+=1)for(let a=0;a<4;a+=1)s[r*4+a]=t[a]*e[r*4]+t[4+a]*e[r*4+1]+t[8+a]*e[r*4+2]+t[12+a]*e[r*4+3];return s}function Jr(t,e,s){let r=$e(ug(t,e)),a=$e(Ye(s,r)),n=Ye(r,a);return new Float32Array([a[0],n[0],r[0],0,a[1],n[1],r[1],0,a[2],n[2],r[2],0,-st(a,t),-st(n,t),-st(r,t),1])}function Cc(t,e,s,r){let a=1/Math.tan(t/2);return new Float32Array([a/e,0,0,0,0,a,0,0,0,0,s/(r-s),-1,0,0,s*r/(r-s),0])}function Qr(t,e,s,r){return new Float32Array([2/t,0,0,0,0,2/e,0,0,0,0,1/(r-s),0,0,0,1,1])}function ei(t){return[(t[0]+t[3])/2,(t[1]+t[4])/2,(t[2]+t[5])/2]}function At(t){return Math.max(.001,Math.hypot(t[3]-t[0],t[4]-t[1],t[5]-t[2])/2)}var Js=class{constructor(e){let s=ei(e),r=At(e);this.focus=[...s],this.targetFocus=[...s],this.azimuth=-.62,this.targetAzimuth=this.azimuth,this.polar=.72,this.targetPolar=this.polar,this.distance=r*2.8,this.targetDistance=this.distance,this.orthoScale=r*2.15,this.targetOrthoScale=this.orthoScale,this.sceneRadius=r,this.fov=Math.PI/4}update(e){let s=1-Math.exp(-e*14);this.focus=this.focus.map((r,a)=>Yr(r,this.targetFocus[a],s)),this.azimuth=Fc(this.azimuth,this.targetAzimuth,s),this.polar=Fc(this.polar,this.targetPolar,s),this.distance=Yr(this.distance,this.targetDistance,s),this.orthoScale=Yr(this.orthoScale,this.targetOrthoScale,s),this.settled()&&this.snap()}settled(){let e=Math.max(this.distance,1e-9),s=(r,a,n)=>Math.abs(r-a)<=n;return this.focus.every((r,a)=>s(r,this.targetFocus[a],1e-5*e))&&Math.abs(Math.atan2(Math.sin(this.targetAzimuth-this.azimuth),Math.cos(this.targetAzimuth-this.azimuth)))<=1e-5&&Math.abs(Math.atan2(Math.sin(this.targetPolar-this.polar),Math.cos(this.targetPolar-this.polar)))<=1e-5&&s(this.distance,this.targetDistance,1e-5*e)&&s(this.orthoScale,this.targetOrthoScale,1e-5*Math.max(this.orthoScale,1e-9))}snap(){this.focus=[...this.targetFocus],this.azimuth=this.targetAzimuth,this.polar=this.targetPolar,this.distance=this.targetDistance,this.orthoScale=this.targetOrthoScale}basis(){let e=Math.sin(this.polar),s=Math.cos(this.polar),r=$e([e*Math.sin(this.azimuth),-e*Math.cos(this.azimuth),s]),a=$e([Math.cos(this.azimuth),Math.sin(this.azimuth),0]),n=$e(Ye(r,a));return{right:a,up:n,back:r}}matrix(e,s,r=!1,a=1){let n=Math.max(.01,e/Math.max(1,s)),{up:i,back:o}=this.basis(),c=Ce(this.focus,Me(o,this.distance)),l=Jr(c,this.focus,i),u=r?Qr(this.orthoScale*a*n,this.orthoScale*a,-this.sceneRadius*40,this.sceneRadius*40):Cc(this.fov,n,Math.max(this.sceneRadius*5e-4,this.distance-this.sceneRadius*3.5),this.distance+this.sceneRadius*4.5);return Tt(u,l)}targetMatrix(e,s,r=!1,a=0){let n=(l,u)=>u+(u-l)*a,i=[this.focus,this.azimuth,this.polar,this.distance,this.orthoScale];this.focus=this.focus.map((l,u)=>n(l,this.targetFocus[u]));let o=(l,u)=>u+Math.atan2(Math.sin(u-l),Math.cos(u-l))*a;this.azimuth=o(this.azimuth,this.targetAzimuth),this.polar=o(this.polar,this.targetPolar),this.distance=Math.max(this.sceneRadius*.001,n(this.distance,this.targetDistance)),this.orthoScale=Math.max(this.sceneRadius*.001,n(this.orthoScale,this.targetOrthoScale));let c=this.matrix(e,s,r);return[this.focus,this.azimuth,this.polar,this.distance,this.orthoScale]=i,c}moving(){let e=(s,r)=>Math.abs(s-r)<=Math.max(1e-9,Math.abs(r)*1e-4);return!(this.focus.every((s,r)=>e(s,this.targetFocus[r]))&&e(this.azimuth,this.targetAzimuth)&&e(this.polar,this.targetPolar)&&e(this.distance,this.targetDistance)&&e(this.orthoScale,this.targetOrthoScale))}orbit(e,s){let r=Math.sin(this.targetPolar)<0?-1:1;this.targetAzimuth-=r*e*.006,this.targetPolar=Oc(this.targetPolar-s*.006)}isBelow(){return Math.cos(this.targetPolar)<0}pan(e,s,r,a=!1){let{right:n,up:i}=this.basis(),o=a?this.targetOrthoScale/Math.max(1,r):2*this.targetDistance*Math.tan(this.fov/2)/Math.max(1,r),c=Ce(Me(n,-e*o),Me(i,s*o));this.targetFocus=Ce(this.targetFocus,c)}dolly(e,s=!1){let r=Math.exp(e*.0032);s?this.targetOrthoScale=de(this.targetOrthoScale*r,this.sceneRadius*.008,this.sceneRadius*24):this.targetDistance=de(this.targetDistance*r,this.sceneRadius*.01,this.sceneRadius*48)}frame(e){if(!e)return;let s=At(e);this.targetFocus=ei(e),this.targetDistance=Math.max(s*2.8,this.sceneRadius*.02),this.targetOrthoScale=Math.max(s*2.15,this.sceneRadius*.02)}setFocus(e){this.targetFocus=[...e]}setAxis(e,s=!1){e==="z"?(this.targetAzimuth=0,this.targetPolar=s?Math.PI-.015:.015):e==="x"?(this.targetAzimuth=s?-Math.PI/2:Math.PI/2,this.targetPolar=Math.PI/2):(this.targetAzimuth=s?0:Math.PI,this.targetPolar=Math.PI/2)}rotateZ(e=1){this.targetAzimuth+=e*Math.PI/2}flip(){this.targetPolar=Oc(Math.PI-this.targetPolar)}};function Oc(t){return Math.atan2(Math.sin(t),Math.cos(t))}function Fc(t,e,s){let r=Math.atan2(Math.sin(e-t),Math.cos(e-t));return t+r*s}var Zr=class t{static async create(e,s,r={}){let a=await fetch(s,{cache:"default"});if(!a.ok)throw new Error(`Failed to load BoM ${s}: ${a.status}`);let n=await a.json();if(n.schema!=="prism.bom_a0")throw new Error(`Unsupported BoM schema: ${n.schema||"missing"}`);let i=new t(e,n,r);return i.render(),i}constructor(e,s,r){this.container=e,this.payload=s,this.callbacks=r,this.query="",this.selectedRowId="",this.selectedReference="",this.rowsById=new Map((s.rows||[]).map(a=>[a.id,a])),this.componentIndex=new Map(Object.entries(s.componentIndex||{}))}setSelectionByReference(e,s={}){let r=this.componentIndex.get(e);r&&(this.selectedReference=e,this.selectedRowId=r.rowId,this.renderContent(),s.scroll&&this.container.querySelector(`[data-row-id="${bg(r.rowId)}"]`)?.scrollIntoView({block:"center",behavior:"smooth"}))}clearSelection(){this.selectedReference="",this.selectedRowId="",this.renderContent()}render(){let e=this.filteredRows();this.container.innerHTML=`
      <section class="bom-workspace">
        <header class="bom-toolbar">
          <div>
            <p class="eyebrow">Prism BoM A0</p>
            <h2>Bill of Materials</h2>
            <span data-bom-count>${e.length} of ${(this.payload.rows||[]).length} grouped rows \xB7 ${(this.payload.components||[]).length} components</span>
          </div>
          <label class="bom-search">
            <span>Search</span>
            <input id="bom-search" type="search" value="${z(this.query)}" placeholder="Reference, value, footprint, manufacturer..." />
          </label>
        </header>
        <div class="bom-content" data-bom-content>
          ${this.contentHtml(e,this.payload.displayColumns||[])}
        </div>
      </section>
    `,this.bind()}renderContent(){let e=this.container.querySelector("[data-bom-content]");if(!e){this.render();return}let s=this.filteredRows();e.innerHTML=this.contentHtml(s,this.payload.displayColumns||[]);let r=this.container.querySelector("[data-bom-count]");r&&(r.textContent=`${s.length} of ${(this.payload.rows||[]).length} grouped rows \xB7 ${(this.payload.components||[]).length} components`),this.bindContent(e)}contentHtml(e,s){let r=this.rowsById.get(this.selectedRowId);return`
      <div class="bom-table-wrap">
        <table class="bom-table">
          <thead>
            <tr>${s.map(a=>`<th>${z(a)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${e.map(a=>this.rowHtml(a,s)).join("")}
          </tbody>
        </table>
      </div>
      ${r?`<aside class="bom-detail">${this.detailHtml(r)}</aside>`:""}
    `}filteredRows(){let e=this.query.trim().toLowerCase(),s=this.payload.rows||[];return e?s.filter(r=>JSON.stringify(r).toLowerCase().includes(e)):s}rowHtml(e,s){return`
      <tr class="${e.id===this.selectedRowId?"selected":""}" data-row-id="${z(e.id)}">
        ${s.map(a=>{let n=e.fields?.[a]||"";return a==="Reference"?`<td class="bom-reference-cell">${(e.references||[]).map(i=>`
              <button class="bom-ref-chip ${i===this.selectedReference?"active":""}" data-reference="${z(i)}">${z(i)}</button>
            `).join("")}</td>`:!n&&pg(a)?'<td><span class="bom-missing">Missing</span></td>':`<td title="${z(n)}">${z(n)}</td>`}).join("")}
      </tr>
    `}detailHtml(e){let s=hg(e,this.payload.displayColumns||[],this.payload.extraColumns||[]);return`
      <div class="bom-detail-head">
        <p class="eyebrow">Line item</p>
        <h3>${z((e.references||[]).join(", "))}</h3>
        <span>${e.qty} component${e.qty===1?"":"s"}${e.dnp?" \xB7 DNP":""}</span>
      </div>
      <div class="bom-ref-list">
        ${(e.references||[]).map(r=>`
          <button class="bom-ref-chip detail ${r===this.selectedReference?"active":""}" data-reference="${z(r)}">${z(r)}</button>
        `).join("")}
      </div>
      <dl class="bom-field-list">
        ${s.map(([r,a])=>`
          <div>
            <dt>${z(r)}</dt>
            <dd>${z(a)}</dd>
          </div>
        `).join("")}
      </dl>
    `}bind(){let e=this.container.querySelector("#bom-search");e?.addEventListener("input",()=>{this.query=e.value,this.renderContent()}),this.bindContent(this.container)}bindContent(e){e.querySelectorAll("[data-row-id]").forEach(s=>{s.addEventListener("click",r=>{r.target.closest("[data-reference]")||(this.selectedRowId=s.dataset.rowId,this.selectedReference="",this.renderContent())})}),e.querySelectorAll("[data-reference]").forEach(s=>{s.addEventListener("click",r=>{r.stopPropagation();let a=s.dataset.reference;this.setSelectionByReference(a),this.callbacks.onSelectReference?.(a)})})}};function hg(t,e,s){let r=[],a=new Set(["Reference","Qty"].map(ti));for(let i of e){if(i==="Reference"||i==="Qty")continue;let o=t.fields?.[i]||"";o&&(r.push([i,o]),a.add(ti(i)))}let n=t.canonicalFields||{};for(let i of s){let o=n[i]||"";if(!o)continue;let c=ti(i);a.has(c)||(a.add(c),r.push([i,o]))}return r}function ti(t){return String(t||"").toLowerCase().replace(/[\s_\-()[\]/]+/g,"")}function pg(t){return["Manufacturer Part Number","Vendor Part Number","Datasheet","Footprint","Value"].includes(t)}function bg(t){return String(t).replace(/["\\]/g,"\\$&")}function Pc(t,e=new Map){let s=new Map;for(let a of t||[]){let n=String(a?.designator||"");if(!n)continue;let i=s.get(n)||{reference:n,featureIds:new Set,modelCount:0},o=Number(a?.featureId)||0;o>0&&i.featureIds.add(o),s.set(n,i)}for(let[a,n]of e||[]){let i=s.get(String(a));i&&(i.modelCount=Math.max(i.modelCount,Number(n)||0))}let r=new Map;for(let[a,n]of s)r.set(a,{reference:a,featureIds:[...n.featureIds].sort((i,o)=>i-o),ambiguous:n.featureIds.size>1||n.modelCount>1});return r}function jc(t,e){let s=[...new Set((Array.isArray(t)?t:[]).map(c=>String(c||"")).filter(Boolean))],r=[],a=[],n=[],i=new Set,o=new Set;for(let c of s){let l=e.get(c);if(!l){n.push(c);continue}if(l.ambiguous){a.push(c);continue}r.push(c),o.add(c);for(let u of l.featureIds)i.add(u)}return{requested:s,applied:r,ambiguous:a,unknown:n,hiddenFeatureIds:i,hiddenReferences:o}}function ea(t,e){return!!t&&e.has(String(t))}function gg(t){return 2e3*4**(Math.max(1,Math.floor(Number(t)||0))-1)}function Lc(t,e){let s=Math.max(0,Math.floor(Number(t)||0))+1;return{failures:s,retryAt:Number(e)+gg(s)}}function Dc(t,e,s){return Math.max(0,Math.floor(Number(e)||0))<3&&Number(t)>=Number(s)}function Uc(t){(t.showBoard||t.showComponents)&&(t.savedShowBoard=t.showBoard,t.savedShowComponents=t.showComponents),t.showBoard=!1,t.showComponents=!1}function zc(t){t.showBoard=t.savedShowBoard!==!1,t.showComponents=t.savedShowComponents!==!1}function Gc(t,e,s){s&&!e?(t.preIsolationShowBoard=t.showBoard,t.showBoard=!1):!s&&e&&(typeof t.preIsolationShowBoard=="boolean"&&(t.showBoard=t.preIsolationShowBoard),t.preIsolationShowBoard=null)}function Kc(t,e,s){let r=!!e,a=r&&!!t.isolateNet;return a&&s(),t.showBoard=r,t.savedShowBoard=r,a&&(t.preIsolationShowBoard=null),a}function ta(t){let e=new Set;if(t==null)return e;for(let s of t){let r=Number(s);!Number.isInteger(r)||r<=0||r>4294967295||e.add(r)}return e}var Qs=64,Vc=1,mg=0,Zs=`
fn netEmphasized(id: u32) -> bool {
  return id != 0u && id < arrayLength(&netMask) && netMask[id] != 0u;
}
`,sa=ta;function Hc(t,e=0){let s=0;for(let a of sa(t))s=Math.max(s,a);let r=Qs;for(;r<s+1;)r*=2;return Math.max(r,Math.floor(e)||0)}function qc(t,e){let s=Math.max(Qs,Math.floor(e)||0),r=new Uint32Array(s);r.fill(mg);for(let a of sa(t))a<s&&(r[a]=Vc);return r}function ns(t,e){return!Array.isArray(t)||!e?null:t.find(s=>s.name===e||Array.isArray(s.aliases)&&s.aliases.includes(e))||null}function Wc(t,e){let s=new Set;if(!Array.isArray(t)||!Array.isArray(e))return s;for(let r of e){if(!r)continue;let a=r.netUid&&t.find(i=>i.uid===r.netUid)||r.netName&&ns(t,r.netName),n=Number(a?.id);Number.isInteger(n)&&n>0&&s.add(n)}return s}var xs=Object.freeze([[.08,1,.2],[1,.72,.1],[.2,.75,1],[1,.3,.75],[.65,.45,1],[1,.45,.2],[.3,1,.85],[.95,.95,.3]]),Xc=`
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
`;function $c(t){let e=null;return Array.isArray(t)&&t.length>=3&&t.slice(0,3).every(s=>Number.isFinite(Number(s)))?e=t.slice(0,3).map(s=>Math.round(Math.min(1,Math.max(0,Number(s)))*255)):typeof t=="string"&&/^#[0-9a-f]{6}$/i.test(t)&&(e=[1,3,5].map(s=>parseInt(t.slice(s,s+2),16))),e?(1<<24|e[0]<<16|e[1]<<8|e[2])>>>0:Vc}function Yc(t){let e=1;for(let r of t)for(let a of r?.keys()||[])e=Math.max(e,a+1);let s=new Uint32Array(Math.max(Qs,t.length*e));return t.forEach((r,a)=>{for(let[n,i]of r||[])Number.isInteger(n)&&n>0&&(s[a*e+n]=i>>>0)}),{stride:e,data:s}}function yg(t){return(typeof t.composedPath=="function"?t.composedPath():[])[0]??t.target??null}function Jc(t){let e=yg(t);if(!e||typeof e!="object")return!1;let s=typeof e.tagName=="string"?e.tagName.toUpperCase():"";return s==="INPUT"||s==="TEXTAREA"||s==="SELECT"||e.isContentEditable===!0}function Qc(t){return!!(t.metaKey||t.ctrlKey)}var wg=4;function Zc(t,e=wg){let s=new Map,r=[];for(let n of t){if(n.placements.length<e){for(let o of n.placements)r.push(vg(n.primitive,o));continue}let i=`${n.placements.map(o=>o.node).join(",")}|${JSON.stringify(n.primitive.material)}`;s.has(i)||s.set(i,[]),s.get(i).push(n)}return{instanced:[...s.values()].map(n=>({primitive:xg(n.map(i=>i.primitive)),placements:n[0].placements})),baked:qr(r)}}function vg(t,e){let{rows:s,featureId:r,bounds:a}=e,n=t.position.length/3,i=new Float32Array(n*3),o=new Float32Array(n*3),c=new Uint32Array(n);for(let l=0;l<n;l+=1){let u=l*3,[f,b,g]=[t.position[u],t.position[u+1],t.position[u+2]],[p,d,m]=[t.normal[u],t.normal[u+1],t.normal[u+2]],h=0;for(let y=0;y<3;y+=1){let w=y*4;i[u+y]=s[w]*f+s[w+1]*b+s[w+2]*g+s[w+3],o[u+y]=s[w]*p+s[w+1]*d+s[w+2]*m,h+=o[u+y]**2}h=Math.sqrt(h)||1;for(let y=0;y<3;y+=1)o[u+y]/=h;c[l]=t.objectFeatureId[l]||r||0}return{position:i,normal:o,netId:t.netId,objectFeatureId:c,indices:t.indices,material:t.material,bounds:[...a]}}function xg(t){if(t.length===1)return t[0];let e=t.reduce((f,b)=>f+b.position.length/3,0),s=t.reduce((f,b)=>f+b.indices.length,0),r=new Float32Array(e*3),a=new Float32Array(e*3),n=new Uint32Array(e),i=new Uint32Array(e),o=new Uint32Array(s),c=[1/0,1/0,1/0,-1/0,-1/0,-1/0],l=0,u=0;for(let f of t){r.set(f.position,l*3),a.set(f.normal,l*3),n.set(f.netId,l),i.set(f.objectFeatureId,l);for(let b=0;b<f.indices.length;b+=1)o[u+b]=f.indices[b]+l;for(let b=0;b<3;b+=1)c[b]=Math.min(c[b],f.bounds[b]),c[b+3]=Math.max(c[b+3],f.bounds[b+3]);l+=f.position.length/3,u+=f.indices.length}return{position:r,normal:a,netId:n,objectFeatureId:i,indices:o,material:t[0].material,bounds:c}}var el=class{_listeners={};addEventListener(t,e){let s=this._listeners;return s[t]===void 0&&(s[t]=[]),s[t].indexOf(e)===-1&&s[t].push(e),this}removeEventListener(t,e){let s=this._listeners[t];if(s!==void 0){let r=s.indexOf(e);r!==-1&&s.splice(r,1)}return this}dispatchEvent(t){let e=this._listeners[t.type];if(e!==void 0){let s=e.slice(0);for(let r=0,a=s.length;r<a;r++)s[r].call(this,t)}return this}dispose(){for(let t in this._listeners)delete this._listeners[t]}},It=class{_disposed=!1;_name;_parent;_child;_attributes;constructor(t,e,s,r={}){if(this._name=t,this._parent=e,this._child=s,this._attributes=r,!e.isOnGraph(s))throw new Error("Cannot connect disconnected graphs.")}getName(){return this._name}getParent(){return this._parent}getChild(){return this._child}setChild(t){return this._child=t,this}getAttributes(){return this._attributes}dispose(){this._disposed||(this._parent._destroyRef(this),this._disposed=!0)}isDisposed(){return this._disposed}},si=class extends el{_emptySet=new Set;_edges=new Set;_parentEdges=new Map;_childEdges=new Map;listEdges(){return Array.from(this._edges)}listParentEdges(t){return Array.from(this._childEdges.get(t)||this._emptySet)}listParents(t){let e=new Set;for(let s of this.listParentEdges(t))e.add(s.getParent());return Array.from(e)}listChildEdges(t){return Array.from(this._parentEdges.get(t)||this._emptySet)}listChildren(t){let e=new Set;for(let s of this.listChildEdges(t))e.add(s.getChild());return Array.from(e)}disconnectParents(t,e){for(let s of this.listParentEdges(t))(!e||e(s.getParent()))&&s.dispose();return this}_createEdge(t,e,s,r){let a=new It(t,e,s,r);this._edges.add(a);let n=a.getParent();this._parentEdges.has(n)||this._parentEdges.set(n,new Set),this._parentEdges.get(n).add(a);let i=a.getChild();return this._childEdges.has(i)||this._childEdges.set(i,new Set),this._childEdges.get(i).add(a),a}_destroyEdge(t){return this._edges.delete(t),this._parentEdges.get(t.getParent()).delete(t),this._childEdges.get(t.getChild()).delete(t),this}},Re=class{list=[];constructor(t){if(t)for(let e of t)this.list.push(e)}add(t){this.list.push(t)}remove(t){let e=this.list.indexOf(t);e>=0&&this.list.splice(e,1)}removeChild(t){let e=[];for(let s of this.list)s.getChild()===t&&e.push(s);for(let s of e)this.remove(s);return e}listRefsByChild(t){let e=[];for(let s of this.list)s.getChild()===t&&e.push(s);return e}values(){return this.list}},ce=class{set=new Set;map=new Map;constructor(t){if(t)for(let e of t)this.add(e)}add(t){let e=t.getChild();this.removeChild(e),this.set.add(t),this.map.set(e,t)}remove(t){this.set.delete(t),this.map.delete(t.getChild())}removeChild(t){let e=this.map.get(t)||null;return e&&this.remove(e),e}getRefByChild(t){return this.map.get(t)||null}values(){return Array.from(this.set)}},xe=class{map={};constructor(t){t&&Object.assign(this.map,t)}set(t,e){this.map[t]=e}delete(t){delete this.map[t]}get(t){return this.map[t]||null}keys(){return Object.keys(this.map)}values(){return Object.values(this.map)}},se=Symbol("attributes"),_t=Symbol("immutableKeys"),tl=class sl extends el{_disposed=!1;graph;[se];[_t];constructor(e){super(),this.graph=e,this[_t]=new Set,this[se]=this._createAttributes()}getDefaults(){return{}}_createAttributes(){let e=this.getDefaults(),s={};for(let r in e){let a=e[r];if(a instanceof sl){let n=this.graph._createEdge(r,this,a);this[_t].add(r),s[r]=n}else s[r]=a}return s}isOnGraph(e){return this.graph===e.graph}isDisposed(){return this._disposed}dispose(){this._disposed||(this.graph.listChildEdges(this).forEach(e=>e.dispose()),this.graph.disconnectParents(this),this._disposed=!0,this.dispatchEvent({type:"dispose"}))}detach(){return this.graph.disconnectParents(this),this}swap(e,s){for(let r in this[se]){let a=this[se][r];if(a instanceof It){let n=a;n.getChild()===e&&this.setRef(r,s,n.getAttributes())}else if(a instanceof Re)for(let n of a.listRefsByChild(e)){let i=n.getAttributes();this.removeRef(r,e),this.addRef(r,s,i)}else if(a instanceof ce){let n=a.getRefByChild(e);if(n){let i=n.getAttributes();this.removeRef(r,e),this.addRef(r,s,i)}}else if(a instanceof xe)for(let n of a.keys()){let i=a.get(n);i.getChild()===e&&this.setRefMap(r,n,s,i.getAttributes())}}return this}get(e){return this[se][e]}set(e,s){return this[se][e]=s,this.dispatchEvent({type:"change",attribute:e})}getRef(e){let s=this[se][e];return s?s.getChild():null}setRef(e,s,r){if(this[_t].has(e))throw new Error(`Cannot overwrite immutable attribute, "${e}".`);let a=this[se][e];if(a&&a.dispose(),!s)return this;let n=this.graph._createEdge(e,this,s,r);return this[se][e]=n,this.dispatchEvent({type:"change",attribute:e})}listRefs(e){return this.assertRefList(e).values().map(s=>s.getChild())}addRef(e,s,r){let a=this.graph._createEdge(e,this,s,r);return this.assertRefList(e).add(a),this.dispatchEvent({type:"change",attribute:e})}removeRef(e,s){let r=this.assertRefList(e);if(r instanceof Re)for(let a of r.listRefsByChild(s))a.dispose();else{let a=r.getRefByChild(s);a&&a.dispose()}return this}assertRefList(e){let s=this[se][e];if(s instanceof Re||s instanceof ce)return s;throw new Error(`Expected RefList or RefSet for attribute "${e}"`)}listRefMapKeys(e){return this.assertRefMap(e).keys()}listRefMapValues(e){return this.assertRefMap(e).values().map(s=>s.getChild())}getRefMap(e,s){let r=this.assertRefMap(e).get(s);return r?r.getChild():null}setRefMap(e,s,r,a){let n=this.assertRefMap(e),i=n.get(s);if(i&&i.dispose(),!r)return this;a=Object.assign(a||{},{key:s});let o=this.graph._createEdge(e,this,r,{...a,key:s});return n.set(s,o),this.dispatchEvent({type:"change",attribute:e,key:s})}assertRefMap(e){let s=this[se][e];if(s instanceof xe)return s;throw new Error(`Expected RefMap for attribute "${e}"`)}dispatchEvent(e){return super.dispatchEvent({...e,target:this}),this.graph.dispatchEvent({...e,target:this,type:`node:${e.type}`}),this}_destroyRef(e){let s=e.getName();if(this[se][s]===e)this[se][s]=null,this[_t].has(s)&&e.getChild().dispose();else if(this[se][s]instanceof Re)this[se][s].remove(e);else if(this[se][s]instanceof ce)this[se][s].remove(e);else if(this[se][s]instanceof xe){let r=this[se][s];for(let a of r.keys())r.get(a)===e&&r.delete(a)}else return;this.graph._destroyEdge(e),this.dispatchEvent({type:"change",attribute:s})}};var ll="v4.4.2",Nt="@glb.bin",j=(function(t){return t.ACCESSOR="Accessor",t.ANIMATION="Animation",t.ANIMATION_CHANNEL="AnimationChannel",t.ANIMATION_SAMPLER="AnimationSampler",t.BUFFER="Buffer",t.CAMERA="Camera",t.MATERIAL="Material",t.MESH="Mesh",t.PRIMITIVE="Primitive",t.PRIMITIVE_TARGET="PrimitiveTarget",t.NODE="Node",t.ROOT="Root",t.SCENE="Scene",t.SKIN="Skin",t.TEXTURE="Texture",t.TEXTURE_INFO="TextureInfo",t})({});var kg=(function(t){return t.ARRAY_BUFFER="ARRAY_BUFFER",t.ELEMENT_ARRAY_BUFFER="ELEMENT_ARRAY_BUFFER",t.INVERSE_BIND_MATRICES="INVERSE_BIND_MATRICES",t.OTHER="OTHER",t.SPARSE="SPARSE",t})({}),rt=(function(t){return t[t.R=4096]="R",t[t.G=256]="G",t[t.B=16]="B",t[t.A=1]="A",t})({});var Eg=class extends Float32Array{constructor(){throw super(),new Error("Unsupported typed array instantiation.")}},da={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5131:typeof Float16Array<"u"?Float16Array:Eg,5126:Float32Array,5130:Float64Array},$=class{static createBufferFromDataURI(t){if(typeof Buffer>"u"){let e=atob(t.split(",")[1]),s=new Uint8Array(e.length);for(let r=0;r<e.length;r++)s[r]=e.charCodeAt(r);return s}else{let e=t.split(",")[1],s=t.indexOf("base64")>=0;return Buffer.from(e,s?"base64":"utf8")}}static encodeText(t){return new TextEncoder().encode(t)}static decodeText(t){return new TextDecoder().decode(t)}static concat(t){let e=0;for(let a of t)e+=a.byteLength;let s=new Uint8Array(e),r=0;for(let a of t)s.set(a,r),r+=a.byteLength;return s}static pad(t,e=0){let s=this.padNumber(t.byteLength);if(s===t.byteLength)return t;let r=new Uint8Array(s);if(r.set(t),e!==0)for(let a=t.byteLength;a<s;a++)r[a]=e;return r}static padNumber(t){return Math.ceil(t/4)*4}static equals(t,e){if(t===e)return!0;if(t.byteLength!==e.byteLength)return!1;let s=t.byteLength;for(;s--;)if(t[s]!==e[s])return!1;return!0}static toView(t,e=0,s=1/0){return new Uint8Array(t.buffer,t.byteOffset+e,Math.min(t.byteLength,s))}static assertView(t){if(t&&!ArrayBuffer.isView(t))throw new Error(`Method requires Uint8Array parameter; received "${typeof t}".`);return t}};var Mg=class{match(t){return t.length>=3&&t[0]===255&&t[1]===216&&t[2]===255}getSize(t){let e=new DataView(t.buffer,t.byteOffset+4),s,r;for(;e.byteLength;){if(s=e.getUint16(0,!1),Tg(e,s),r=e.getUint8(s+1),r===192||r===193||r===194)return[e.getUint16(s+7,!1),e.getUint16(s+5,!1)];e=new DataView(t.buffer,e.byteOffset+s+2)}throw new TypeError("Invalid JPG, no size found")}getChannels(t){return 3}},Sg=class dl{static PNG_FRIED_CHUNK_NAME="CgBI";match(e){return e.length>=8&&e[0]===137&&e[1]===80&&e[2]===78&&e[3]===71&&e[4]===13&&e[5]===10&&e[6]===26&&e[7]===10}getSize(e){let s=new DataView(e.buffer,e.byteOffset);return $.decodeText(e.slice(12,16))===dl.PNG_FRIED_CHUNK_NAME?[s.getUint32(32,!1),s.getUint32(36,!1)]:[s.getUint32(16,!1),s.getUint32(20,!1)]}getChannels(e){return 4}},dt=class{static impls={"image/jpeg":new Mg,"image/png":new Sg};static registerFormat(t,e){this.impls[t]=e}static getMimeType(t){for(let e in this.impls)if(this.impls[e].match(t))return e;return null}static getSize(t,e){return this.impls[e]?this.impls[e].getSize(t):null}static getChannels(t,e){return this.impls[e]?this.impls[e].getChannels(t):null}static getVRAMByteLength(t,e){if(!this.impls[e])return null;if(this.impls[e].getVRAMByteLength)return this.impls[e].getVRAMByteLength(t);let s=0,r=4,a=this.getSize(t,e);if(!a)return null;for(;a[0]>1||a[1]>1;)s+=a[0]*a[1]*r,a[0]=Math.max(Math.floor(a[0]/2),1),a[1]=Math.max(Math.floor(a[1]/2),1);return s+=1*r,s}static mimeTypeToExtension(t){return t==="image/jpeg"?"jpg":t.split("/").pop()}static extensionToMimeType(t){return t==="jpg"?"image/jpeg":t?`image/${t}`:""}};function Tg(t,e){if(e>t.byteLength)throw new TypeError("Corrupt JPG, exceeded buffer limits");if(t.getUint8(e)!==255)throw new TypeError("Invalid JPG, marker table corrupted");return t}var ks=class{static basename(t){let e=t.split(/[\\/]/).pop();return e.substring(0,e.lastIndexOf("."))}static extension(t){if(t.startsWith("data:image/")){let e=t.match(/data:(image\/\w+)/)[1];return dt.mimeTypeToExtension(e)}else{if(t.startsWith("data:model/gltf+json"))return"gltf";if(t.startsWith("data:model/gltf-binary"))return"glb";if(t.startsWith("data:application/"))return"bin"}return t.split(/[\\/]/).pop().split(/[.]/).pop()}},ni=typeof Float32Array<"u"?Float32Array:Array;Math.PI/180;180/Math.PI;function Ag(){var t=new ni(3);return ni!=Float32Array&&(t[0]=0,t[1]=0,t[2]=0),t}function ri(t){var e=t[0],s=t[1],r=t[2];return Math.sqrt(e*e+s*s+r*r)}function _g(t,e,s){var r=e[0],a=e[1],n=e[2],i=s[3]*r+s[7]*a+s[11]*n+s[15];return i=i||1,t[0]=(s[0]*r+s[4]*a+s[8]*n+s[12])/i,t[1]=(s[1]*r+s[5]*a+s[9]*n+s[13])/i,t[2]=(s[2]*r+s[6]*a+s[10]*n+s[14])/i,t}(function(){var t=Ag();return function(e,s,r,a,n,i){var o,c;for(s||(s=3),r||(r=0),a?c=Math.min(a*s+r,e.length):c=e.length,o=r;o<c;o+=s)t[0]=e[o],t[1]=e[o+1],t[2]=e[o+2],n(t,t,i),e[o]=t[0],e[o+1]=t[1],e[o+2]=t[2];return e}})();function ul(t){let e=fl(),s=t.propertyType==="Node"?[t]:t.listChildren();for(let r of s)r.traverse(a=>{let n=a.getMesh();if(!n)return;let i=Ig(n,a.getWorldMatrix());i.min.every(isFinite)&&i.max.every(isFinite)&&(ii(i.min,e),ii(i.max,e))});return e}function Ig(t,e){let s=fl();for(let r of t.listPrimitives()){let a=r.getAttribute("POSITION"),n=r.getIndices();if(!a)continue;let i=[0,0,0],o=[0,0,0];for(let c=0,l=n?n.getCount():a.getCount();c<l;c++){let u=n?n.getScalar(c):c;i=a.getElement(u,i),o=_g(o,i,e),ii(o,s)}}return s}function ii(t,e){for(let s=0;s<3;s++)e.min[s]=Math.min(t[s],e.min[s]),e.max[s]=Math.max(t[s],e.max[s])}function fl(){return{min:[1/0,1/0,1/0],max:[-1/0,-1/0,-1/0]}}var rl="https://null.example",ai=class{static DEFAULT_INIT={};static PROTOCOL_REGEXP=/^[a-zA-Z]+:\/\//;static dirname(t){let e=t.lastIndexOf("/");return e===-1?"./":t.substring(0,e+1)}static basename(t){return ks.basename(new URL(t,rl).pathname)}static extension(t){return ks.extension(new URL(t,rl).pathname)}static resolve(t,e){if(!this.isRelativePath(e))return e;let s=t.split("/"),r=e.split("/");s.pop();for(let a=0;a<r.length;a++)r[a]!=="."&&(r[a]===".."?s.pop():s.push(r[a]));return s.join("/")}static isAbsoluteURL(t){return this.PROTOCOL_REGEXP.test(t)}static isRelativePath(t){return!/^(?:[a-zA-Z]+:)?\//.test(t)}};function al(t){return Object.prototype.toString.call(t)==="[object Object]"}function is(t){if(al(t)===!1)return!1;let e=t.constructor;if(e===void 0)return!0;let s=e.prototype;return!(al(s)===!1||Object.hasOwn(s,"isPrototypeOf")===!1)}var Rg=(function(t){return t[t.SILENT=4]="SILENT",t[t.ERROR=3]="ERROR",t[t.WARN=2]="WARN",t[t.INFO=1]="INFO",t[t.DEBUG=0]="DEBUG",t})({}),ua=class hl{verbosity;static Verbosity=Rg;static DEFAULT_INSTANCE=new hl(1);constructor(e){this.verbosity=e}debug(e){this.verbosity<=0&&console.debug(e)}info(e){this.verbosity<=1&&console.info(e)}warn(e){this.verbosity<=2&&console.warn(e)}error(e){this.verbosity<=3&&console.error(e)}};function Ng(t){var e=t[0],s=t[1],r=t[2],a=t[3],n=t[4],i=t[5],o=t[6],c=t[7],l=t[8],u=t[9],f=t[10],b=t[11],g=t[12],p=t[13],d=t[14],m=t[15],h=e*i-s*n,y=e*o-r*n,w=s*o-r*i,v=l*p-u*g,x=l*d-f*g,S=u*d-f*p,T=e*S-s*x+r*v,A=n*S-i*x+o*v,_=l*w-u*y+f*h,N=g*w-p*y+d*h;return c*T-a*A+m*_-b*N}function Bg(t,e,s){var r=e[0],a=e[1],n=e[2],i=e[3],o=e[4],c=e[5],l=e[6],u=e[7],f=e[8],b=e[9],g=e[10],p=e[11],d=e[12],m=e[13],h=e[14],y=e[15],w=s[0],v=s[1],x=s[2],S=s[3];return t[0]=w*r+v*o+x*f+S*d,t[1]=w*a+v*c+x*b+S*m,t[2]=w*n+v*l+x*g+S*h,t[3]=w*i+v*u+x*p+S*y,w=s[4],v=s[5],x=s[6],S=s[7],t[4]=w*r+v*o+x*f+S*d,t[5]=w*a+v*c+x*b+S*m,t[6]=w*n+v*l+x*g+S*h,t[7]=w*i+v*u+x*p+S*y,w=s[8],v=s[9],x=s[10],S=s[11],t[8]=w*r+v*o+x*f+S*d,t[9]=w*a+v*c+x*b+S*m,t[10]=w*n+v*l+x*g+S*h,t[11]=w*i+v*u+x*p+S*y,w=s[12],v=s[13],x=s[14],S=s[15],t[12]=w*r+v*o+x*f+S*d,t[13]=w*a+v*c+x*b+S*m,t[14]=w*n+v*l+x*g+S*h,t[15]=w*i+v*u+x*p+S*y,t}function Cg(t,e){var s=e[0],r=e[1],a=e[2],n=e[4],i=e[5],o=e[6],c=e[8],l=e[9],u=e[10];return t[0]=Math.sqrt(s*s+r*r+a*a),t[1]=Math.sqrt(n*n+i*i+o*o),t[2]=Math.sqrt(c*c+l*l+u*u),t}function Og(t,e){var s=new ni(3);Cg(s,e);var r=1/s[0],a=1/s[1],n=1/s[2],i=e[0]*r,o=e[1]*a,c=e[2]*n,l=e[4]*r,u=e[5]*a,f=e[6]*n,b=e[8]*r,g=e[9]*a,p=e[10]*n,d=i+u+p,m=0;return d>0?(m=Math.sqrt(d+1)*2,t[3]=.25*m,t[0]=(f-g)/m,t[1]=(b-c)/m,t[2]=(o-l)/m):i>u&&i>p?(m=Math.sqrt(1+i-u-p)*2,t[3]=(f-g)/m,t[0]=.25*m,t[1]=(o+l)/m,t[2]=(b+c)/m):u>p?(m=Math.sqrt(1+u-i-p)*2,t[3]=(b-c)/m,t[0]=(o+l)/m,t[1]=.25*m,t[2]=(f+g)/m):(m=Math.sqrt(1+p-i-u)*2,t[3]=(o-l)/m,t[0]=(b+c)/m,t[1]=(f+g)/m,t[2]=.25*m),t}var he=class er{static identity(e){return e}static eq(e,s,r=1e-5){if(e.length!==s.length)return!1;for(let a=0;a<e.length;a++)if(Math.abs(e[a]-s[a])>r)return!1;return!0}static clamp(e,s,r){return e<s?s:e>r?r:e}static decodeNormalizedInt(e,s){switch(s){case 5126:return e;case 5123:return e/65535;case 5121:return e/255;case 5122:return Math.max(e/32767,-1);case 5120:return Math.max(e/127,-1);default:throw new Error("Invalid component type.")}}static encodeNormalizedInt(e,s){switch(s){case 5126:return e;case 5123:return Math.round(er.clamp(e,0,1)*65535);case 5121:return Math.round(er.clamp(e,0,1)*255);case 5122:return Math.round(er.clamp(e,-1,1)*32767);case 5120:return Math.round(er.clamp(e,-1,1)*127);default:throw new Error("Invalid component type.")}}static decompose(e,s,r,a){let n=ri([e[0],e[1],e[2]]),i=ri([e[4],e[5],e[6]]),o=ri([e[8],e[9],e[10]]);Ng(e)<0&&(n=-n),s[0]=e[12],s[1]=e[13],s[2]=e[14];let c=e.slice(),l=1/n,u=1/i,f=1/o;c[0]*=l,c[1]*=l,c[2]*=l,c[4]*=u,c[5]*=u,c[6]*=u,c[8]*=f,c[9]*=f,c[10]*=f,Og(r,c),a[0]=n,a[1]=i,a[2]=o}static compose(e,s,r,a){let n=a,i=s[0],o=s[1],c=s[2],l=s[3],u=i+i,f=o+o,b=c+c,g=i*u,p=i*f,d=i*b,m=o*f,h=o*b,y=c*b,w=l*u,v=l*f,x=l*b,S=r[0],T=r[1],A=r[2];return n[0]=(1-(m+y))*S,n[1]=(p+x)*S,n[2]=(d-v)*S,n[3]=0,n[4]=(p-x)*T,n[5]=(1-(g+y))*T,n[6]=(h+w)*T,n[7]=0,n[8]=(d+v)*A,n[9]=(h-w)*A,n[10]=(1-(g+m))*A,n[11]=0,n[12]=e[0],n[13]=e[1],n[14]=e[2],n[15]=1,n}};function Fg(t,e){if(!!t!=!!e)return!1;let s=t.getChild(),r=e.getChild();return s===r||s.equals(r)}function Pg(t,e){if(!!t!=!!e)return!1;let s=t.values(),r=e.values();if(s.length!==r.length)return!1;for(let a=0;a<s.length;a++){let n=s[a],i=r[a];if(n.getChild()!==i.getChild()&&!n.getChild().equals(i.getChild()))return!1}return!0}function jg(t,e){if(!!t!=!!e)return!1;let s=t.keys(),r=e.keys();if(s.length!==r.length)return!1;for(let a of s){let n=t.get(a),i=e.get(a);if(!!n!=!!i)return!1;let o=n.getChild(),c=i.getChild();if(o!==c&&!o.equals(c))return!1}return!0}function pl(t,e){if(t===e)return!0;if(!!t!=!!e||!t||!e||t.length!==e.length)return!1;for(let s=0;s<t.length;s++)if(t[s]!==e[s])return!1;return!0}function bl(t,e){if(t===e)return!0;if(!!t!=!!e)return!1;if(!is(t)||!is(e))return t===e;let s=t,r=e,a=0,n=0,i;for(i in s)a++;for(i in r)n++;if(a!==n)return!1;for(i in s){let o=s[i],c=r[i];if(ca(o)&&ca(c)){if(!pl(o,c))return!1}else if(is(o)&&is(c)){if(!bl(o,c))return!1}else if(o!==c)return!1}return!0}function ca(t){return Array.isArray(t)||ArrayBuffer.isView(t)}var Lg="23456789abdegjkmnpqrvwxyzABDEGJKMNPQRVWXYZ",Dg=999,Ug=6,nl=new Set,zg=function(){let t="";for(let e=0;e<Ug;e++)t+=Lg.charAt(Math.floor(Math.random()*42));return t},Gg=function(){for(let t=0;t<Dg;t++){let e=zg();if(!nl.has(e))return nl.add(e),e}return""},Bt=t=>t,Kg=new Set,li=class extends tl{constructor(t,e=""){super(t),this[se].name=e,this.init(),this.dispatchEvent({type:"create"})}getGraph(){return this.graph}getDefaults(){return Object.assign(super.getDefaults(),{name:"",extras:{}})}set(t,e){return Array.isArray(e)&&(e=e.slice()),super.set(t,e)}getName(){return this.get("name")}setName(t){return this.set("name",t)}getExtras(){return this.get("extras")}setExtras(t){return this.set("extras",t)}clone(){let t=this.constructor;return new t(this.graph).copy(this,Bt)}copy(t,e=Bt){for(let s in this[se]){let r=this[se][s];if(r instanceof It)this[_t].has(s)||r.dispose();else if(r instanceof Re||r instanceof ce)for(let a of r.values())a.dispose();else if(r instanceof xe)for(let a of r.values())a.dispose()}for(let s in t[se]){let r=this[se][s],a=t[se][s];if(a instanceof It)this[_t].has(s)?r.getChild().copy(e(a.getChild()),e):this.setRef(s,e(a.getChild()),a.getAttributes());else if(a instanceof ce||a instanceof Re)for(let n of a.values())this.addRef(s,e(n.getChild()),n.getAttributes());else if(a instanceof xe)for(let n of a.keys()){let i=a.get(n);this.setRefMap(s,n,e(i.getChild()),i.getAttributes())}else is(a)?this[se][s]=JSON.parse(JSON.stringify(a)):Array.isArray(a)||a instanceof ArrayBuffer||ArrayBuffer.isView(a)?this[se][s]=a.slice():this[se][s]=a}return this}equals(t,e=Kg){if(this===t)return!0;if(this.propertyType!==t.propertyType)return!1;for(let s in this[se]){if(e.has(s))continue;let r=this[se][s],a=t[se][s];if(r instanceof It||a instanceof It){if(!Fg(r,a))return!1}else if(r instanceof ce||a instanceof ce||r instanceof Re||a instanceof Re){if(!Pg(r,a))return!1}else if(r instanceof xe||a instanceof xe){if(!jg(r,a))return!1}else if(is(r)||is(a)){if(!bl(r,a))return!1}else if(ca(r)||ca(a)){if(!pl(r,a))return!1}else if(r!==a)return!1}return!0}detach(){return this.graph.disconnectParents(this,t=>t.propertyType!=="Root"),this}listParents(){return this.graph.listParents(this)}},De=class extends li{getDefaults(){return Object.assign(super.getDefaults(),{extensions:new xe})}getExtension(t){return this.getRefMap("extensions",t)}setExtension(t,e){return e&&e._validateParent(this),this.setRefMap("extensions",t,e)}listExtensions(){return this.listRefMapValues("extensions")}},W=class ke extends De{static Type={SCALAR:"SCALAR",VEC2:"VEC2",VEC3:"VEC3",VEC4:"VEC4",MAT2:"MAT2",MAT3:"MAT3",MAT4:"MAT4"};static ComponentType={BYTE:5120,UNSIGNED_BYTE:5121,SHORT:5122,UNSIGNED_SHORT:5123,UNSIGNED_INT:5125,FLOAT:5126,FLOAT16:5131,FLOAT64:5130};init(){this.propertyType="Accessor"}getDefaults(){return Object.assign(super.getDefaults(),{array:null,type:ke.Type.SCALAR,componentType:ke.ComponentType.FLOAT,normalized:!1,sparse:!1,buffer:null})}static getElementSize(e){switch(e){case ke.Type.SCALAR:return 1;case ke.Type.VEC2:return 2;case ke.Type.VEC3:return 3;case ke.Type.VEC4:return 4;case ke.Type.MAT2:return 4;case ke.Type.MAT3:return 9;case ke.Type.MAT4:return 16;default:throw new Error("Unexpected type: "+e)}}static getComponentSize(e){switch(e){case ke.ComponentType.BYTE:case ke.ComponentType.UNSIGNED_BYTE:return 1;case ke.ComponentType.SHORT:case ke.ComponentType.UNSIGNED_SHORT:return 2;case ke.ComponentType.UNSIGNED_INT:case ke.ComponentType.FLOAT:return 4;case ke.ComponentType.FLOAT16:return 2;case ke.ComponentType.FLOAT64:return 8;default:throw new Error("Unexpected component type: "+e)}}getMinNormalized(e){let s=this.getNormalized(),r=this.getElementSize(),a=this.getComponentType();if(this.getMin(e),s)for(let n=0;n<r;n++)e[n]=he.decodeNormalizedInt(e[n],a);return e}getMin(e){let s=this.getArray(),r=this.getCount(),a=this.getElementSize();for(let n=0;n<a;n++)e[n]=1/0;for(let n=0;n<r*a;n+=a)for(let i=0;i<a;i++){let o=s[n+i];Number.isFinite(o)&&(e[i]=Math.min(e[i],o))}return e}getMaxNormalized(e){let s=this.getNormalized(),r=this.getElementSize(),a=this.getComponentType();if(this.getMax(e),s)for(let n=0;n<r;n++)e[n]=he.decodeNormalizedInt(e[n],a);return e}getMax(e){let s=this.get("array"),r=this.getCount(),a=this.getElementSize();for(let n=0;n<a;n++)e[n]=-1/0;for(let n=0;n<r*a;n+=a)for(let i=0;i<a;i++){let o=s[n+i];Number.isFinite(o)&&(e[i]=Math.max(e[i],o))}return e}getCount(){let e=this.get("array");return e?e.length/this.getElementSize():0}getType(){return this.get("type")}setType(e){return this.set("type",e)}getElementSize(){return ke.getElementSize(this.get("type"))}getComponentSize(){return this.get("array").BYTES_PER_ELEMENT}getComponentType(){return this.get("componentType")}getNormalized(){return this.get("normalized")}setNormalized(e){return this.set("normalized",e)}getScalar(e){let s=this.getElementSize(),r=this.getComponentType(),a=this.getArray();return this.getNormalized()?he.decodeNormalizedInt(a[e*s],r):a[e*s]}setScalar(e,s){let r=this.getElementSize(),a=this.getComponentType(),n=this.getArray();return this.getNormalized()?n[e*r]=he.encodeNormalizedInt(s,a):n[e*r]=s,this}getElement(e,s){let r=this.getNormalized(),a=this.getElementSize(),n=this.getComponentType(),i=this.getArray();for(let o=0;o<a;o++)r?s[o]=he.decodeNormalizedInt(i[e*a+o],n):s[o]=i[e*a+o];return s}setElement(e,s){let r=this.getNormalized(),a=this.getElementSize(),n=this.getComponentType(),i=this.getArray();for(let o=0;o<a;o++)r?i[e*a+o]=he.encodeNormalizedInt(s[o],n):i[e*a+o]=s[o];return this}getSparse(){return this.get("sparse")}setSparse(e){return this.set("sparse",e)}getBuffer(){return this.getRef("buffer")}setBuffer(e){return this.setRef("buffer",e)}getArray(){return this.get("array")}setArray(e){return this.set("componentType",e?Vg(e):ke.ComponentType.FLOAT),this.set("array",e),this}getByteLength(){let e=this.get("array");return e?e.byteLength:0}};function Vg(t){switch(t.constructor){case Float32Array:return W.ComponentType.FLOAT;case Uint32Array:return W.ComponentType.UNSIGNED_INT;case Uint16Array:return W.ComponentType.UNSIGNED_SHORT;case Uint8Array:return W.ComponentType.UNSIGNED_BYTE;case Int16Array:return W.ComponentType.SHORT;case Int8Array:return W.ComponentType.BYTE;case Float64Array:return W.ComponentType.FLOAT64}if(typeof Float16Array<"u"&&t.constructor===Float16Array)return W.ComponentType.FLOAT16;throw new Error("Unknown accessor componentType.")}var gl=class extends De{init(){this.propertyType="Animation"}getDefaults(){return Object.assign(super.getDefaults(),{channels:new ce,samplers:new ce})}addChannel(t){return this.addRef("channels",t)}removeChannel(t){return this.removeRef("channels",t)}listChannels(){return this.listRefs("channels")}addSampler(t){return this.addRef("samplers",t)}removeSampler(t){return this.removeRef("samplers",t)}listSamplers(){return this.listRefs("samplers")}},di=class extends De{static TargetPath={TRANSLATION:"translation",ROTATION:"rotation",SCALE:"scale",WEIGHTS:"weights"};init(){this.propertyType="AnimationChannel"}getDefaults(){return Object.assign(super.getDefaults(),{targetPath:null,targetNode:null,sampler:null})}getTargetPath(){return this.get("targetPath")}setTargetPath(t){return this.set("targetPath",t)}getTargetNode(){return this.getRef("targetNode")}setTargetNode(t){return this.setRef("targetNode",t)}getSampler(){return this.getRef("sampler")}setSampler(t){return this.setRef("sampler",t)}},fa=class ml extends De{static Interpolation={LINEAR:"LINEAR",STEP:"STEP",CUBICSPLINE:"CUBICSPLINE"};init(){this.propertyType="AnimationSampler"}getDefaultAttributes(){return Object.assign(super.getDefaults(),{interpolation:ml.Interpolation.LINEAR,input:null,output:null})}getInterpolation(){return this.get("interpolation")}setInterpolation(e){return this.set("interpolation",e)}getInput(){return this.getRef("input")}setInput(e){return this.setRef("input",e,{usage:"OTHER"})}getOutput(){return this.getRef("output")}setOutput(e){return this.setRef("output",e,{usage:"OTHER"})}},yl=class extends De{init(){this.propertyType="Buffer"}getDefaults(){return Object.assign(super.getDefaults(),{uri:""})}getURI(){return this.get("uri")}setURI(t){return this.set("uri",t)}},ha=class wl extends De{static Type={PERSPECTIVE:"perspective",ORTHOGRAPHIC:"orthographic"};init(){this.propertyType="Camera"}getDefaults(){return Object.assign(super.getDefaults(),{type:wl.Type.PERSPECTIVE,znear:.1,zfar:100,aspectRatio:null,yfov:Math.PI*2*50/360,xmag:1,ymag:1})}getType(){return this.get("type")}setType(e){return this.set("type",e)}getZNear(){return this.get("znear")}setZNear(e){return this.set("znear",e)}getZFar(){return this.get("zfar")}setZFar(e){return this.set("zfar",e)}getAspectRatio(){return this.get("aspectRatio")}setAspectRatio(e){return this.set("aspectRatio",e)}getYFov(){return this.get("yfov")}setYFov(e){return this.set("yfov",e)}getXMag(){return this.get("xmag")}setXMag(e){return this.set("xmag",e)}getYMag(){return this.get("ymag")}setYMag(e){return this.set("ymag",e)}},J=class extends li{static EXTENSION_NAME;_validateParent(t){if(!this.parentTypes.includes(t.propertyType))throw new Error(`Parent "${t.propertyType}" invalid for child "${this.propertyType}".`)}},ue=class oi extends De{static WrapMode={CLAMP_TO_EDGE:33071,MIRRORED_REPEAT:33648,REPEAT:10497};static MagFilter={NEAREST:9728,LINEAR:9729};static MinFilter={NEAREST:9728,LINEAR:9729,NEAREST_MIPMAP_NEAREST:9984,LINEAR_MIPMAP_NEAREST:9985,NEAREST_MIPMAP_LINEAR:9986,LINEAR_MIPMAP_LINEAR:9987};init(){this.propertyType="TextureInfo"}getDefaults(){return Object.assign(super.getDefaults(),{texCoord:0,magFilter:null,minFilter:null,wrapS:oi.WrapMode.REPEAT,wrapT:oi.WrapMode.REPEAT})}getTexCoord(){return this.get("texCoord")}setTexCoord(e){return this.set("texCoord",e)}getMagFilter(){return this.get("magFilter")}setMagFilter(e){return this.set("magFilter",e)}getMinFilter(){return this.get("minFilter")}setMinFilter(e){return this.set("minFilter",e)}getWrapS(){return this.get("wrapS")}setWrapS(e){return this.set("wrapS",e)}getWrapT(){return this.get("wrapT")}setWrapT(e){return this.set("wrapT",e)}},{R:ra,G:aa,B:na,A:Hg}=rt,la=class vl extends De{static AlphaMode={OPAQUE:"OPAQUE",MASK:"MASK",BLEND:"BLEND"};init(){this.propertyType="Material"}getDefaults(){return Object.assign(super.getDefaults(),{alphaMode:vl.AlphaMode.OPAQUE,alphaCutoff:.5,doubleSided:!1,baseColorFactor:[1,1,1,1],baseColorTexture:null,baseColorTextureInfo:new ue(this.graph,"baseColorTextureInfo"),emissiveFactor:[0,0,0],emissiveTexture:null,emissiveTextureInfo:new ue(this.graph,"emissiveTextureInfo"),normalScale:1,normalTexture:null,normalTextureInfo:new ue(this.graph,"normalTextureInfo"),occlusionStrength:1,occlusionTexture:null,occlusionTextureInfo:new ue(this.graph,"occlusionTextureInfo"),roughnessFactor:1,metallicFactor:1,metallicRoughnessTexture:null,metallicRoughnessTextureInfo:new ue(this.graph,"metallicRoughnessTextureInfo")})}getDoubleSided(){return this.get("doubleSided")}setDoubleSided(e){return this.set("doubleSided",e)}getAlpha(){return this.get("baseColorFactor")[3]}setAlpha(e){let s=this.get("baseColorFactor").slice();return s[3]=e,this.set("baseColorFactor",s)}getAlphaMode(){return this.get("alphaMode")}setAlphaMode(e){return this.set("alphaMode",e)}getAlphaCutoff(){return this.get("alphaCutoff")}setAlphaCutoff(e){return this.set("alphaCutoff",e)}getBaseColorFactor(){return this.get("baseColorFactor")}setBaseColorFactor(e){return this.set("baseColorFactor",e)}getBaseColorTexture(){return this.getRef("baseColorTexture")}getBaseColorTextureInfo(){return this.getRef("baseColorTexture")?this.getRef("baseColorTextureInfo"):null}setBaseColorTexture(e){return this.setRef("baseColorTexture",e,{channels:ra|aa|na|Hg,isColor:!0})}getEmissiveFactor(){return this.get("emissiveFactor")}setEmissiveFactor(e){return this.set("emissiveFactor",e)}getEmissiveTexture(){return this.getRef("emissiveTexture")}getEmissiveTextureInfo(){return this.getRef("emissiveTexture")?this.getRef("emissiveTextureInfo"):null}setEmissiveTexture(e){return this.setRef("emissiveTexture",e,{channels:ra|aa|na,isColor:!0})}getNormalScale(){return this.get("normalScale")}setNormalScale(e){return this.set("normalScale",e)}getNormalTexture(){return this.getRef("normalTexture")}getNormalTextureInfo(){return this.getRef("normalTexture")?this.getRef("normalTextureInfo"):null}setNormalTexture(e){return this.setRef("normalTexture",e,{channels:ra|aa|na})}getOcclusionStrength(){return this.get("occlusionStrength")}setOcclusionStrength(e){return this.set("occlusionStrength",e)}getOcclusionTexture(){return this.getRef("occlusionTexture")}getOcclusionTextureInfo(){return this.getRef("occlusionTexture")?this.getRef("occlusionTextureInfo"):null}setOcclusionTexture(e){return this.setRef("occlusionTexture",e,{channels:ra})}getRoughnessFactor(){return this.get("roughnessFactor")}setRoughnessFactor(e){return this.set("roughnessFactor",e)}getMetallicFactor(){return this.get("metallicFactor")}setMetallicFactor(e){return this.set("metallicFactor",e)}getMetallicRoughnessTexture(){return this.getRef("metallicRoughnessTexture")}getMetallicRoughnessTextureInfo(){return this.getRef("metallicRoughnessTexture")?this.getRef("metallicRoughnessTextureInfo"):null}setMetallicRoughnessTexture(e){return this.setRef("metallicRoughnessTexture",e,{channels:aa|na})}},xl=class extends De{init(){this.propertyType="Mesh"}getDefaults(){return Object.assign(super.getDefaults(),{weights:[],primitives:new ce})}addPrimitive(t){return this.addRef("primitives",t)}removePrimitive(t){return this.removeRef("primitives",t)}listPrimitives(){return this.listRefs("primitives")}getWeights(){return this.get("weights")}setWeights(t){return this.set("weights",t)}},kl=class extends De{init(){this.propertyType="Node"}getDefaults(){return Object.assign(super.getDefaults(),{translation:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1],weights:[],camera:null,mesh:null,skin:null,children:new ce})}copy(t,e=Bt){if(e===Bt)throw new Error("Node cannot be copied.");return super.copy(t,e)}getTranslation(){return this.get("translation")}getRotation(){return this.get("rotation")}getScale(){return this.get("scale")}setTranslation(t){return this.set("translation",t)}setRotation(t){return this.set("rotation",t)}setScale(t){return this.set("scale",t)}getMatrix(){return he.compose(this.get("translation"),this.get("rotation"),this.get("scale"),[])}setMatrix(t){let e=this.get("translation").slice(),s=this.get("rotation").slice(),r=this.get("scale").slice();return he.decompose(t,e,s,r),this.set("translation",e).set("rotation",s).set("scale",r)}getWorldTranslation(){let t=[0,0,0];return he.decompose(this.getWorldMatrix(),t,[0,0,0,1],[1,1,1]),t}getWorldRotation(){let t=[0,0,0,1];return he.decompose(this.getWorldMatrix(),[0,0,0],t,[1,1,1]),t}getWorldScale(){let t=[1,1,1];return he.decompose(this.getWorldMatrix(),[0,0,0],[0,0,0,1],t),t}getWorldMatrix(){let t=[];for(let r=this;r!=null;r=r.getParentNode())t.push(r);let e,s=t.pop().getMatrix();for(;e=t.pop();)Bg(s,s,e.getMatrix());return s}addChild(t){let e=t.getParentNode();e&&e.removeChild(t);for(let s of t.listParents())s.propertyType==="Scene"&&s.removeChild(t);return this.addRef("children",t)}removeChild(t){return this.removeRef("children",t)}listChildren(){return this.listRefs("children")}getParentNode(){for(let t of this.listParents())if(t.propertyType==="Node")return t;return null}getMesh(){return this.getRef("mesh")}setMesh(t){return this.setRef("mesh",t)}getCamera(){return this.getRef("camera")}setCamera(t){return this.setRef("camera",t)}getSkin(){return this.getRef("skin")}setSkin(t){return this.setRef("skin",t)}getWeights(){return this.get("weights")}setWeights(t){return this.set("weights",t)}traverse(t){t(this);for(let e of this.listChildren())e.traverse(t);return this}},tr=class El extends De{static Mode={POINTS:0,LINES:1,LINE_LOOP:2,LINE_STRIP:3,TRIANGLES:4,TRIANGLE_STRIP:5,TRIANGLE_FAN:6};init(){this.propertyType="Primitive"}getDefaults(){return Object.assign(super.getDefaults(),{mode:El.Mode.TRIANGLES,material:null,indices:null,attributes:new xe,targets:new ce})}getIndices(){return this.getRef("indices")}setIndices(e){return this.setRef("indices",e,{usage:"ELEMENT_ARRAY_BUFFER"})}getAttribute(e){return this.getRefMap("attributes",e)}setAttribute(e,s){return this.setRefMap("attributes",e,s,{usage:"ARRAY_BUFFER"})}listAttributes(){return this.listRefMapValues("attributes")}listSemantics(){return this.listRefMapKeys("attributes")}getMaterial(){return this.getRef("material")}setMaterial(e){return this.setRef("material",e)}getMode(){return this.get("mode")}setMode(e){return this.set("mode",e)}listTargets(){return this.listRefs("targets")}addTarget(e){return this.addRef("targets",e)}removeTarget(e){return this.removeRef("targets",e)}},qg=class extends li{init(){this.propertyType="PrimitiveTarget"}getDefaults(){return Object.assign(super.getDefaults(),{attributes:new xe})}getAttribute(t){return this.getRefMap("attributes",t)}setAttribute(t,e){return this.setRefMap("attributes",t,e,{usage:"ARRAY_BUFFER"})}listAttributes(){return this.listRefMapValues("attributes")}listSemantics(){return this.listRefMapKeys("attributes")}},Ml=class extends De{init(){this.propertyType="Scene"}getDefaults(){return Object.assign(super.getDefaults(),{children:new ce})}copy(t,e=Bt){if(e===Bt)throw new Error("Scene cannot be copied.");return super.copy(t,e)}addChild(t){let e=t.getParentNode();return e&&e.removeChild(t),this.addRef("children",t)}removeChild(t){return this.removeRef("children",t)}listChildren(){return this.listRefs("children")}traverse(t){for(let e of this.listChildren())e.traverse(t);return this}},Sl=class extends De{init(){this.propertyType="Skin"}getDefaults(){return Object.assign(super.getDefaults(),{skeleton:null,inverseBindMatrices:null,joints:new ce})}getSkeleton(){return this.getRef("skeleton")}setSkeleton(t){return this.setRef("skeleton",t)}getInverseBindMatrices(){return this.getRef("inverseBindMatrices")}setInverseBindMatrices(t){return this.setRef("inverseBindMatrices",t,{usage:"INVERSE_BIND_MATRICES"})}addJoint(t){return this.addRef("joints",t)}removeJoint(t){return this.removeRef("joints",t)}listJoints(){return this.listRefs("joints")}},Tl=class extends De{init(){this.propertyType="Texture"}getDefaults(){return Object.assign(super.getDefaults(),{image:null,mimeType:"",uri:""})}getMimeType(){return this.get("mimeType")||dt.extensionToMimeType(ks.extension(this.get("uri")))}setMimeType(t){return this.set("mimeType",t)}getURI(){return this.get("uri")}setURI(t){this.set("uri",t);let e=dt.extensionToMimeType(ks.extension(t));return e&&this.set("mimeType",e),this}getImage(){return this.get("image")}setImage(t){return this.set("image",$.assertView(t))}getSize(){let t=this.get("image");return t?dt.getSize(t,this.getMimeType()):null}},ui=class extends De{_extensions=new Set;init(){this.propertyType="Root"}getDefaults(){return Object.assign(super.getDefaults(),{asset:{generator:`glTF-Transform ${ll}`,version:"2.0"},defaultScene:null,accessors:new ce,animations:new ce,buffers:new ce,cameras:new ce,materials:new ce,meshes:new ce,nodes:new ce,scenes:new ce,skins:new ce,textures:new ce})}constructor(t){super(t),t.addEventListener("node:create",e=>{this._addChildOfRoot(e.target)})}clone(){throw new Error("Root cannot be cloned.")}copy(t,e=Bt){if(e===Bt)throw new Error("Root cannot be copied.");this.set("asset",{...t.get("asset")}),this.setName(t.getName()),this.setExtras({...t.getExtras()}),this.setDefaultScene(t.getDefaultScene()?e(t.getDefaultScene()):null);for(let s of t.listRefMapKeys("extensions")){let r=t.getExtension(s);this.setExtension(s,e(r))}return this}_addChildOfRoot(t){return t instanceof Ml?this.addRef("scenes",t):t instanceof kl?this.addRef("nodes",t):t instanceof ha?this.addRef("cameras",t):t instanceof Sl?this.addRef("skins",t):t instanceof xl?this.addRef("meshes",t):t instanceof la?this.addRef("materials",t):t instanceof Tl?this.addRef("textures",t):t instanceof gl?this.addRef("animations",t):t instanceof W?this.addRef("accessors",t):t instanceof yl&&this.addRef("buffers",t),this}getAsset(){return this.get("asset")}listExtensionsUsed(){return Array.from(this._extensions)}listExtensionsRequired(){return this.listExtensionsUsed().filter(t=>t.isRequired())}_enableExtension(t){return this._extensions.add(t),this}_disableExtension(t){return this._extensions.delete(t),this}listScenes(){return this.listRefs("scenes")}setDefaultScene(t){return this.setRef("defaultScene",t)}getDefaultScene(){return this.getRef("defaultScene")}listNodes(){return this.listRefs("nodes")}listCameras(){return this.listRefs("cameras")}listSkins(){return this.listRefs("skins")}listMeshes(){return this.listRefs("meshes")}listMaterials(){return this.listRefs("materials")}listTextures(){return this.listRefs("textures")}listAnimations(){return this.listRefs("animations")}listAccessors(){return this.listRefs("accessors")}listBuffers(){return this.listRefs("buffers")}},Wg=class ci{_graph=new si;_root=new ui(this._graph);_logger=ua.DEFAULT_INSTANCE;static _GRAPH_DOCUMENTS=new WeakMap;static fromGraph(e){return ci._GRAPH_DOCUMENTS.get(e)||null}constructor(){ci._GRAPH_DOCUMENTS.set(this._graph,this)}getRoot(){return this._root}getGraph(){return this._graph}getLogger(){return this._logger}setLogger(e){return this._logger=e,this}clone(){throw new Error("Use 'cloneDocument(source)' from '@gltf-transform/functions'.")}merge(e){throw new Error("Use 'mergeDocuments(target, source)' from '@gltf-transform/functions'.")}async transform(...e){let s=e.map(r=>r.name);for(let r of e)await r(this,{stack:s});return this}hasExtension(e){return this.getRoot().listExtensionsUsed().some(s=>s.extensionName===e)}createExtension(e){let s=e.EXTENSION_NAME;return this.getRoot().listExtensionsUsed().find(r=>r.extensionName===s)||new e(this)}disposeExtension(e){let s=this.getRoot().listExtensionsUsed().find(r=>r.extensionName===e);s&&s.dispose()}createScene(e=""){return new Ml(this._graph,e)}createNode(e=""){return new kl(this._graph,e)}createCamera(e=""){return new ha(this._graph,e)}createSkin(e=""){return new Sl(this._graph,e)}createMesh(e=""){return new xl(this._graph,e)}createPrimitive(){return new tr(this._graph)}createPrimitiveTarget(e=""){return new qg(this._graph,e)}createMaterial(e=""){return new la(this._graph,e)}createTexture(e=""){return new Tl(this._graph,e)}createAnimation(e=""){return new gl(this._graph,e)}createAnimationChannel(e=""){return new di(this._graph,e)}createAnimationSampler(e=""){return new fa(this._graph,e)}createAccessor(e="",s=null){return s||(s=this.getRoot().listBuffers()[0]),new W(this._graph,e).setBuffer(s)}createBuffer(e=""){return new yl(this._graph,e)}},ie=class{static EXTENSION_NAME;extensionName="";prereadTypes=[];prewriteTypes=[];readDependencies=[];writeDependencies=[];document;required=!1;properties=new Set;_listener;constructor(t){this.document=t,t.getRoot()._enableExtension(this),this._listener=s=>{let r=s,a=r.target;a instanceof J&&a.extensionName===this.extensionName&&(r.type==="node:create"&&this._addExtensionProperty(a),r.type==="node:dispose"&&this._removeExtensionProperty(a))};let e=t.getGraph();e.addEventListener("node:create",this._listener),e.addEventListener("node:dispose",this._listener)}dispose(){this.document.getRoot()._disableExtension(this);let t=this.document.getGraph();t.removeEventListener("node:create",this._listener),t.removeEventListener("node:dispose",this._listener);for(let e of this.properties)e.dispose()}static register(){}isRequired(){return this.required}setRequired(t){return this.required=t,this}listProperties(){return Array.from(this.properties)}_addExtensionProperty(t){return this.properties.add(t),this}_removeExtensionProperty(t){return this.properties.delete(t),this}install(t,e){return this}preread(t,e){return this}prewrite(t,e){return this}},Xg=class{jsonDoc;buffers=[];bufferViews=[];bufferViewBuffers=[];accessors=[];textures=[];textureInfos=new Map;materials=[];meshes=[];cameras=[];nodes=[];skins=[];animations=[];scenes=[];constructor(t){this.jsonDoc=t}setTextureInfo(t,e){this.textureInfos.set(t,e),e.texCoord!==void 0&&t.setTexCoord(e.texCoord),e.extras!==void 0&&t.setExtras(e.extras);let s=this.jsonDoc.json.textures[e.index];if(s.sampler===void 0)return;let r=this.jsonDoc.json.samplers[s.sampler];r.magFilter!==void 0&&t.setMagFilter(r.magFilter),r.minFilter!==void 0&&t.setMinFilter(r.minFilter),r.wrapS!==void 0&&t.setWrapS(r.wrapS),r.wrapT!==void 0&&t.setWrapT(r.wrapT)}},il={logger:ua.DEFAULT_INSTANCE,extensions:[],dependencies:{}},$g=new Set(["Buffer","Texture","Material","Mesh","Primitive","Node","Scene"]),Yg=class{static read(t,e=il){let s={...il,...e},{json:r}=t,a=new Wg().setLogger(s.logger);this.validate(t,s);let n=new Xg(t),i=r.asset,o=a.getRoot().getAsset();i.copyright&&(o.copyright=i.copyright),i.extras&&(o.extras=i.extras),r.extras!==void 0&&a.getRoot().setExtras({...r.extras});let c=r.extensionsUsed||[],l=r.extensionsRequired||[];s.extensions.sort((h,y)=>h.EXTENSION_NAME>y.EXTENSION_NAME?1:-1);for(let h of s.extensions)if(c.includes(h.EXTENSION_NAME)){let y=a.createExtension(h).setRequired(l.includes(h.EXTENSION_NAME)),w=y.prereadTypes.filter(v=>!$g.has(v));w.length&&s.logger.warn(`Preread hooks for some types (${w.join()}), requested by extension ${y.extensionName}, are unsupported. Please file an issue or a PR.`);for(let v of y.readDependencies)y.install(v,s.dependencies[v])}let u=r.buffers||[];a.getRoot().listExtensionsUsed().filter(h=>h.prereadTypes.includes("Buffer")).forEach(h=>h.preread(n,"Buffer")),n.buffers=u.map(h=>{let y=a.createBuffer(h.name);return h.extras&&y.setExtras(h.extras),h.uri&&h.uri.indexOf("__")!==0&&y.setURI(h.uri),y}),n.bufferViewBuffers=(r.bufferViews||[]).map((h,y)=>{if(!n.bufferViews[y]){let w=t.json.buffers[h.buffer],v=w.uri?t.resources[w.uri]:t.resources[Nt],x=h.byteOffset||0;n.bufferViews[y]=$.toView(v,x,h.byteLength)}return n.buffers[h.buffer]});let f=r.accessors||[];n.accessors=f.map(h=>{let y=n.bufferViewBuffers[h.bufferView],w=a.createAccessor(h.name,y).setType(h.type);return h.extras&&w.setExtras(h.extras),h.normalized!==void 0&&w.setNormalized(h.normalized),h.bufferView===void 0||w.setArray(oa(h,n)),w});let b=r.images||[],g=r.textures||[];a.getRoot().listExtensionsUsed().filter(h=>h.prereadTypes.includes("Texture")).forEach(h=>h.preread(n,"Texture")),n.textures=b.map(h=>{let y=a.createTexture(h.name);if(h.extras&&y.setExtras(h.extras),h.bufferView!==void 0){let w=r.bufferViews[h.bufferView],v=t.json.buffers[w.buffer],x=v.uri?t.resources[v.uri]:t.resources[Nt],S=w.byteOffset||0,T=w.byteLength,A=x.slice(S,S+T);y.setImage(A)}else h.uri!==void 0&&(y.setImage(t.resources[h.uri]),h.uri.indexOf("__")!==0&&y.setURI(h.uri));if(h.mimeType!==void 0)y.setMimeType(h.mimeType);else if(h.uri){let w=ks.extension(h.uri);y.setMimeType(dt.extensionToMimeType(w))}return y}),a.getRoot().listExtensionsUsed().filter(h=>h.prereadTypes.includes("Material")).forEach(h=>h.preread(n,"Material")),n.materials=(r.materials||[]).map(h=>{let y=a.createMaterial(h.name);h.extras&&y.setExtras(h.extras),h.alphaMode!==void 0&&y.setAlphaMode(h.alphaMode),h.alphaCutoff!==void 0&&y.setAlphaCutoff(h.alphaCutoff),h.doubleSided!==void 0&&y.setDoubleSided(h.doubleSided);let w=h.pbrMetallicRoughness||{};if(w.baseColorFactor!==void 0&&y.setBaseColorFactor(w.baseColorFactor),h.emissiveFactor!==void 0&&y.setEmissiveFactor(h.emissiveFactor),w.metallicFactor!==void 0&&y.setMetallicFactor(w.metallicFactor),w.roughnessFactor!==void 0&&y.setRoughnessFactor(w.roughnessFactor),w.baseColorTexture!==void 0){let v=w.baseColorTexture,x=n.textures[g[v.index].source];y.setBaseColorTexture(x),n.setTextureInfo(y.getBaseColorTextureInfo(),v)}if(h.emissiveTexture!==void 0){let v=h.emissiveTexture,x=n.textures[g[v.index].source];y.setEmissiveTexture(x),n.setTextureInfo(y.getEmissiveTextureInfo(),v)}if(h.normalTexture!==void 0){let v=h.normalTexture,x=n.textures[g[v.index].source];y.setNormalTexture(x),n.setTextureInfo(y.getNormalTextureInfo(),v),h.normalTexture.scale!==void 0&&y.setNormalScale(h.normalTexture.scale)}if(h.occlusionTexture!==void 0){let v=h.occlusionTexture,x=n.textures[g[v.index].source];y.setOcclusionTexture(x),n.setTextureInfo(y.getOcclusionTextureInfo(),v),h.occlusionTexture.strength!==void 0&&y.setOcclusionStrength(h.occlusionTexture.strength)}if(w.metallicRoughnessTexture!==void 0){let v=w.metallicRoughnessTexture,x=n.textures[g[v.index].source];y.setMetallicRoughnessTexture(x),n.setTextureInfo(y.getMetallicRoughnessTextureInfo(),v)}return y}),a.getRoot().listExtensionsUsed().filter(h=>h.prereadTypes.includes("Mesh")).forEach(h=>h.preread(n,"Mesh"));let p=r.meshes||[];a.getRoot().listExtensionsUsed().filter(h=>h.prereadTypes.includes("Primitive")).forEach(h=>h.preread(n,"Primitive")),n.meshes=p.map(h=>{let y=a.createMesh(h.name);return h.extras&&y.setExtras(h.extras),h.weights!==void 0&&y.setWeights(h.weights),(h.primitives||[]).forEach(w=>{let v=a.createPrimitive();w.extras&&v.setExtras(w.extras),w.material!==void 0&&v.setMaterial(n.materials[w.material]),w.mode!==void 0&&v.setMode(w.mode);for(let[S,T]of Object.entries(w.attributes||{}))v.setAttribute(S,n.accessors[T]);w.indices!==void 0&&v.setIndices(n.accessors[w.indices]);let x=h.extras&&h.extras.targetNames||[];(w.targets||[]).forEach((S,T)=>{let A=x[T]||T.toString(),_=a.createPrimitiveTarget(A);for(let[N,B]of Object.entries(S))_.setAttribute(N,n.accessors[B]);v.addTarget(_)}),y.addPrimitive(v)}),y}),n.cameras=(r.cameras||[]).map(h=>{let y=a.createCamera(h.name).setType(h.type);if(h.extras&&y.setExtras(h.extras),h.type===ha.Type.PERSPECTIVE){let w=h.perspective;y.setYFov(w.yfov),y.setZNear(w.znear),w.zfar!==void 0&&y.setZFar(w.zfar),w.aspectRatio!==void 0&&y.setAspectRatio(w.aspectRatio)}else{let w=h.orthographic;y.setZNear(w.znear).setZFar(w.zfar).setXMag(w.xmag).setYMag(w.ymag)}return y});let d=r.nodes||[];a.getRoot().listExtensionsUsed().filter(h=>h.prereadTypes.includes("Node")).forEach(h=>h.preread(n,"Node")),n.nodes=d.map(h=>{let y=a.createNode(h.name);if(h.extras&&y.setExtras(h.extras),h.translation!==void 0&&y.setTranslation(h.translation),h.rotation!==void 0&&y.setRotation(h.rotation),h.scale!==void 0&&y.setScale(h.scale),h.matrix!==void 0){let w=[0,0,0],v=[0,0,0,1],x=[1,1,1];he.decompose(h.matrix,w,v,x),y.setTranslation(w),y.setRotation(v),y.setScale(x)}return h.weights!==void 0&&y.setWeights(h.weights),y}),n.skins=(r.skins||[]).map(h=>{let y=a.createSkin(h.name);h.extras&&y.setExtras(h.extras),h.inverseBindMatrices!==void 0&&y.setInverseBindMatrices(n.accessors[h.inverseBindMatrices]),h.skeleton!==void 0&&y.setSkeleton(n.nodes[h.skeleton]);for(let w of h.joints)y.addJoint(n.nodes[w]);return y}),d.map((h,y)=>{let w=n.nodes[y];(h.children||[]).forEach(v=>w.addChild(n.nodes[v])),h.mesh!==void 0&&w.setMesh(n.meshes[h.mesh]),h.camera!==void 0&&w.setCamera(n.cameras[h.camera]),h.skin!==void 0&&w.setSkin(n.skins[h.skin])}),n.animations=(r.animations||[]).map(h=>{let y=a.createAnimation(h.name);h.extras&&y.setExtras(h.extras);let w=(h.samplers||[]).map(v=>{let x=a.createAnimationSampler().setInput(n.accessors[v.input]).setOutput(n.accessors[v.output]).setInterpolation(v.interpolation||fa.Interpolation.LINEAR);return v.extras&&x.setExtras(v.extras),y.addSampler(x),x});return(h.channels||[]).forEach(v=>{let x=a.createAnimationChannel().setSampler(w[v.sampler]).setTargetPath(v.target.path);v.target.node!==void 0&&x.setTargetNode(n.nodes[v.target.node]),v.extras&&x.setExtras(v.extras),y.addChannel(x)}),y});let m=r.scenes||[];return a.getRoot().listExtensionsUsed().filter(h=>h.prereadTypes.includes("Scene")).forEach(h=>h.preread(n,"Scene")),n.scenes=m.map(h=>{let y=a.createScene(h.name);return h.extras&&y.setExtras(h.extras),(h.nodes||[]).map(w=>n.nodes[w]).forEach(w=>y.addChild(w)),y}),r.scene!==void 0&&a.getRoot().setDefaultScene(n.scenes[r.scene]),a.getRoot().listExtensionsUsed().forEach(h=>h.read(n)),f.forEach((h,y)=>{let w=n.accessors[y],v=!!h.sparse,x=!h.bufferView&&!w.getArray();(v||x)&&w.setSparse(!0).setArray(Qg(h,n))}),a}static validate(t,e){let s=t.json;if(s.asset.version!=="2.0")throw new Error(`Unsupported glTF version, "${s.asset.version}".`);if(s.extensionsRequired){for(let r of s.extensionsRequired)if(!e.extensions.find(a=>a.EXTENSION_NAME===r))throw new Error(`Missing required extension, "${r}".`)}if(s.extensionsUsed)for(let r of s.extensionsUsed)e.extensions.find(a=>a.EXTENSION_NAME===r)||e.logger.warn(`Missing optional extension, "${r}".`)}};function Jg(t,e){let s=e.jsonDoc,r=e.bufferViews[t.bufferView],a=s.json.bufferViews[t.bufferView],n=da[t.componentType],i=W.getElementSize(t.type),o=n.BYTES_PER_ELEMENT,c=t.byteOffset||0,l=new n(t.count*i),u=new DataView(r.buffer,r.byteOffset,r.byteLength),f=a.byteStride;for(let b=0;b<t.count;b++)for(let g=0;g<i;g++){let p=c+b*f+g*o,d;switch(t.componentType){case W.ComponentType.FLOAT:d=u.getFloat32(p,!0);break;case W.ComponentType.UNSIGNED_INT:d=u.getUint32(p,!0);break;case W.ComponentType.UNSIGNED_SHORT:d=u.getUint16(p,!0);break;case W.ComponentType.UNSIGNED_BYTE:d=u.getUint8(p);break;case W.ComponentType.SHORT:d=u.getInt16(p,!0);break;case W.ComponentType.BYTE:d=u.getInt8(p);break;case W.ComponentType.FLOAT16:d=u.getFloat16(p,!0);break;case W.ComponentType.FLOAT64:d=u.getFloat64(p,!0);break;default:throw new Error(`Unexpected componentType "${t.componentType}".`)}l[b*i+g]=d}return l}function oa(t,e){let s=e.jsonDoc,r=e.bufferViews[t.bufferView],a=s.json.bufferViews[t.bufferView],n=da[t.componentType],i=W.getElementSize(t.type),o=n.BYTES_PER_ELEMENT,c=i*o;if(a.byteStride!==void 0&&a.byteStride!==c)return Jg(t,e);let l=r.byteOffset+(t.byteOffset||0),u=t.count*i*o;return new n(r.buffer.slice(l,l+u))}function Qg(t,e){let s=da[t.componentType],r=W.getElementSize(t.type),a;t.bufferView!==void 0?a=oa(t,e):a=new s(t.count*r);let n=t.sparse;if(!n)return a;let i=n.count,o={...t,...n.indices,count:i,type:"SCALAR"},c={...t,...n.values,count:i},l=oa(o,e),u=oa(c,e);for(let f=0;f<o.count;f++)for(let b=0;b<r;b++)a[l[f]*r+b]=u[f*r+b];return a}var Al=(function(t){return t[t.ARRAY_BUFFER=34962]="ARRAY_BUFFER",t[t.ELEMENT_ARRAY_BUFFER=34963]="ELEMENT_ARRAY_BUFFER",t})(Al||{}),Rt=class{_doc;jsonDoc;options;static BufferViewTarget=Al;static BufferViewUsage=kg;static USAGE_TO_TARGET={ARRAY_BUFFER:34962,ELEMENT_ARRAY_BUFFER:34963};accessorIndexMap=new Map;animationIndexMap=new Map;bufferIndexMap=new Map;cameraIndexMap=new Map;skinIndexMap=new Map;materialIndexMap=new Map;meshIndexMap=new Map;nodeIndexMap=new Map;imageIndexMap=new Map;textureDefIndexMap=new Map;textureInfoDefMap=new Map;samplerDefIndexMap=new Map;sceneIndexMap=new Map;imageBufferViews=[];otherBufferViews=new Map;otherBufferViewsIndexMap=new Map;extensionData={};bufferURIGenerator;imageURIGenerator;logger;_accessorUsageMap=new Map;accessorUsageGroupedByParent=new Set(["ARRAY_BUFFER"]);accessorParents=new Map;constructor(t,e,s){this._doc=t,this.jsonDoc=e,this.options=s;let r=t.getRoot(),a=r.listBuffers().length,n=r.listTextures().length;this.bufferURIGenerator=new ol(a>1,()=>s.basename||"buffer"),this.imageURIGenerator=new ol(n>1,i=>Zg(t,i)||s.basename||"texture"),this.logger=t.getLogger()}createTextureInfoDef(t,e){let s={magFilter:e.getMagFilter()||void 0,minFilter:e.getMinFilter()||void 0,wrapS:e.getWrapS(),wrapT:e.getWrapT()},r=JSON.stringify(s);this.samplerDefIndexMap.has(r)||(this.samplerDefIndexMap.set(r,this.jsonDoc.json.samplers.length),this.jsonDoc.json.samplers.push(s));let a={source:this.imageIndexMap.get(t),sampler:this.samplerDefIndexMap.get(r)},n=JSON.stringify(a);this.textureDefIndexMap.has(n)||(this.textureDefIndexMap.set(n,this.jsonDoc.json.textures.length),this.jsonDoc.json.textures.push(a));let i={index:this.textureDefIndexMap.get(n)};return e.getTexCoord()!==0&&(i.texCoord=e.getTexCoord()),Object.keys(e.getExtras()).length>0&&(i.extras=e.getExtras()),this.textureInfoDefMap.set(e,i),i}createPropertyDef(t){let e={};return t.getName()&&(e.name=t.getName()),Object.keys(t.getExtras()).length>0&&(e.extras=t.getExtras()),e}createAccessorDef(t){let e=this.createPropertyDef(t);return e.type=t.getType(),e.componentType=t.getComponentType(),e.count=t.getCount(),this._doc.getGraph().listParentEdges(t).some(s=>s.getName()==="attributes"&&s.getAttributes().key==="POSITION"||s.getName()==="input")&&(e.max=t.getMax([]).map(Math.fround),e.min=t.getMin([]).map(Math.fround)),t.getNormalized()&&(e.normalized=t.getNormalized()),e}createImageData(t,e,s){if(this.options.format==="GLB")this.imageBufferViews.push(e),t.bufferView=this.jsonDoc.json.bufferViews.length,this.jsonDoc.json.bufferViews.push({buffer:0,byteOffset:-1,byteLength:e.byteLength});else{let r=dt.mimeTypeToExtension(s.getMimeType());t.uri=this.imageURIGenerator.createURI(s,r),this.assignResourceURI(t.uri,e,!1)}}assignResourceURI(t,e,s){let r=this.jsonDoc.resources;if(!(t in r)){r[t]=e;return}if(e===r[t]){this.logger.warn(`Duplicate resource URI, "${t}".`);return}let a=`Resource URI "${t}" already assigned to different data.`;if(!s){this.logger.warn(a);return}throw new Error(a)}getAccessorUsage(t){let e=this._accessorUsageMap.get(t);if(e)return e;if(t.getSparse())return"SPARSE";for(let s of this._doc.getGraph().listParentEdges(t)){let{usage:r}=s.getAttributes();if(r)return r;s.getParent().propertyType!=="Root"&&this.logger.warn(`Missing attribute ".usage" on edge, "${s.getName()}".`)}return"OTHER"}addAccessorToUsageGroup(t,e){let s=this._accessorUsageMap.get(t);if(s&&s!==e)throw new Error(`Accessor with usage "${s}" cannot be reused as "${e}".`);return this._accessorUsageMap.set(t,e),this}},ol=class{multiple;basename;counter={};constructor(t,e){this.multiple=t,this.basename=e}createURI(t,e){if(t.getURI())return t.getURI();if(this.multiple){let s=this.basename(t);return this.counter[s]=this.counter[s]||1,`${s}_${this.counter[s]++}.${e}`}else return`${this.basename(t)}.${e}`}};function Zg(t,e){let s=t.getGraph().listParentEdges(e).find(r=>r.getParent()!==t.getRoot());return s?s.getName().replace(/texture$/i,""):""}var{BufferViewUsage:ia}=Rt,{UNSIGNED_INT:em,UNSIGNED_SHORT:tm,UNSIGNED_BYTE:sm}=W.ComponentType,rm=new Set(["Accessor","Buffer","Material","Mesh"]),am=class{static write(t,e){let s=t.getGraph(),r=t.getRoot(),a={asset:{generator:`glTF-Transform ${ll}`,...r.getAsset()},extras:{...r.getExtras()}},n={json:a,resources:{}},i=new Rt(t,n,e),o=e.logger||ua.DEFAULT_INSTANCE,c=new Set(e.extensions.map(d=>d.EXTENSION_NAME)),l=t.getRoot().listExtensionsUsed().filter(d=>c.has(d.extensionName)).sort((d,m)=>d.extensionName>m.extensionName?1:-1),u=t.getRoot().listExtensionsRequired().filter(d=>c.has(d.extensionName)).sort((d,m)=>d.extensionName>m.extensionName?1:-1);l.length<t.getRoot().listExtensionsUsed().length&&o.warn("Some extensions were not registered for I/O, and will not be written.");for(let d of l){let m=d.prewriteTypes.filter(h=>!rm.has(h));m.length&&o.warn(`Prewrite hooks for some types (${m.join()}), requested by extension ${d.extensionName}, are unsupported. Please file an issue or a PR.`);for(let h of d.writeDependencies)d.install(h,e.dependencies[h])}function f(d,m,h,y){let w=[],v=0;for(let S of d){let T=i.createAccessorDef(S);T.bufferView=a.bufferViews.length;let A=S.getArray(),_=$.pad($.toView(A));T.byteOffset=v,v+=_.byteLength,w.push(_),i.accessorIndexMap.set(S,a.accessors.length),a.accessors.push(T)}let x={buffer:m,byteOffset:h,byteLength:$.concat(w).byteLength};return y&&(x.target=y),a.bufferViews.push(x),{buffers:w,byteLength:v}}function b(d,m,h){let y=d[0].getCount(),w=0;for(let A of d){let _=i.createAccessorDef(A);_.bufferView=a.bufferViews.length,_.byteOffset=w;let N=A.getElementSize(),B=A.getComponentSize();w+=$.padNumber(N*B),i.accessorIndexMap.set(A,a.accessors.length),a.accessors.push(_)}let v=y*w,x=new ArrayBuffer(v),S=new DataView(x);for(let A=0;A<y;A++){let _=0;for(let N of d){let B=N.getElementSize(),C=N.getComponentSize(),R=N.getComponentType(),O=N.getArray();for(let P=0;P<B;P++){let H=A*w+_+P*C,Q=O[A*B+P];switch(R){case W.ComponentType.FLOAT:S.setFloat32(H,Q,!0);break;case W.ComponentType.BYTE:S.setInt8(H,Q);break;case W.ComponentType.SHORT:S.setInt16(H,Q,!0);break;case W.ComponentType.UNSIGNED_BYTE:S.setUint8(H,Q);break;case W.ComponentType.UNSIGNED_SHORT:S.setUint16(H,Q,!0);break;case W.ComponentType.UNSIGNED_INT:S.setUint32(H,Q,!0);break;case W.ComponentType.FLOAT16:S.setFloat16(H,Q,!0);break;case W.ComponentType.FLOAT64:S.setFloat64(H,Q,!0);break;default:throw new Error("Unexpected component type: "+R)}}_+=$.padNumber(B*C)}}let T={buffer:m,byteOffset:h,byteLength:v,byteStride:w,target:Rt.BufferViewTarget.ARRAY_BUFFER};return a.bufferViews.push(T),{byteLength:v,buffers:[new Uint8Array(x)]}}function g(d,m,h){let y=[],w=0,v=new Map,x=-1/0,S=!1;for(let R of d){let O=i.createAccessorDef(R);a.accessors.push(O),i.accessorIndexMap.set(R,a.accessors.length-1);let P=[],H=[],Q=[],pe=new Array(R.getElementSize()).fill(0);for(let be=0,_e=R.getCount();be<_e;be++)if(R.getElement(be,Q),!he.eq(Q,pe,0)){x=Math.max(be,x),P.push(be);for(let ye=0;ye<Q.length;ye++)H.push(Q[ye])}let ae=P.length,me={accessorDef:O,count:ae};if(v.set(R,me),ae===0)continue;ae>R.getCount()/2&&(S=!0);let Ae=da[R.getComponentType()];me.indices=P,me.values=new Ae(H)}if(!Number.isFinite(x))return{buffers:y,byteLength:w};S&&o.warn("Some sparse accessors have >50% non-zero elements, which may increase file size.");let T=x<255?Uint8Array:x<65535?Uint16Array:Uint32Array,A=x<255?sm:x<65535?tm:em,_={buffer:m,byteOffset:h+w,byteLength:0};for(let R of d){let O=v.get(R);if(O.count===0)continue;O.indicesByteOffset=_.byteLength;let P=$.pad($.toView(new T(O.indices)));y.push(P),w+=P.byteLength,_.byteLength+=P.byteLength}a.bufferViews.push(_);let N=a.bufferViews.length-1,B={buffer:m,byteOffset:h+w,byteLength:0};for(let R of d){let O=v.get(R);if(O.count===0)continue;O.valuesByteOffset=B.byteLength;let P=$.pad($.toView(O.values));y.push(P),w+=P.byteLength,B.byteLength+=P.byteLength}a.bufferViews.push(B);let C=a.bufferViews.length-1;for(let R of d){let O=v.get(R);O.count!==0&&(O.accessorDef.sparse={count:O.count,indices:{bufferView:N,byteOffset:O.indicesByteOffset,componentType:A},values:{bufferView:C,byteOffset:O.valuesByteOffset}})}return{buffers:y,byteLength:w}}if(a.accessors=[],a.bufferViews=[],a.samplers=[],a.textures=[],a.images=r.listTextures().map((d,m)=>{let h=i.createPropertyDef(d);d.getMimeType()&&(h.mimeType=d.getMimeType());let y=d.getImage();return y&&i.createImageData(h,y,d),i.imageIndexMap.set(d,m),h}),l.filter(d=>d.prewriteTypes.includes("Accessor")).forEach(d=>d.prewrite(i,"Accessor")),r.listAccessors().forEach(d=>{let m=i.accessorUsageGroupedByParent,h=i.accessorParents;if(i.accessorIndexMap.has(d))return;let y=i.getAccessorUsage(d);if(i.addAccessorToUsageGroup(d,y),m.has(y)){let w=s.listParents(d).find(v=>v.propertyType!=="Root");h.set(d,w)}}),l.filter(d=>d.prewriteTypes.includes("Buffer")).forEach(d=>d.prewrite(i,"Buffer")),(r.listAccessors().length>0||i.otherBufferViews.size>0||r.listTextures().length>0&&e.format==="GLB")&&r.listBuffers().length===0)throw new Error("Buffer required for Document resources, but none was found.");a.buffers=[],r.listBuffers().forEach((d,m)=>{let h=i.createPropertyDef(d),y=i.accessorUsageGroupedByParent,w=d.listParents().filter(N=>N instanceof W),v=new Set(w.map(N=>i.accessorParents.get(N))),x=new Map(Array.from(v).map((N,B)=>[N,B])),S={};for(let N of w){if(i.accessorIndexMap.has(N))continue;let B=i.getAccessorUsage(N),C=B;if(y.has(B)){let R=i.accessorParents.get(N);C+=`:${x.get(R)}`}S[C]||={usage:B,accessors:[]},S[C].accessors.push(N)}let T=[],A=a.buffers.length,_=0;for(let{usage:N,accessors:B}of Object.values(S))if(N===ia.ARRAY_BUFFER&&e.vertexLayout==="interleaved"){let C=b(B,A,_);_+=C.byteLength;for(let R of C.buffers)T.push(R)}else if(N===ia.ARRAY_BUFFER)for(let C of B){let R=b([C],A,_);_+=R.byteLength;for(let O of R.buffers)T.push(O)}else if(N===ia.SPARSE){let C=g(B,A,_);_+=C.byteLength;for(let R of C.buffers)T.push(R)}else if(N===ia.ELEMENT_ARRAY_BUFFER){let C=Rt.BufferViewTarget.ELEMENT_ARRAY_BUFFER,R=f(B,A,_,C);_+=R.byteLength;for(let O of R.buffers)T.push(O)}else{let C=f(B,A,_);_+=C.byteLength;for(let R of C.buffers)T.push(R)}if(i.imageBufferViews.length&&m===0){for(let N=0;N<i.imageBufferViews.length;N++)if(a.bufferViews[a.images[N].bufferView].byteOffset=_,_+=i.imageBufferViews[N].byteLength,T.push(i.imageBufferViews[N]),_%8){let B=8-_%8;_+=B,T.push(new Uint8Array(B))}}if(i.otherBufferViews.has(d))for(let N of i.otherBufferViews.get(d))a.bufferViews.push({buffer:A,byteOffset:_,byteLength:N.byteLength}),i.otherBufferViewsIndexMap.set(N,a.bufferViews.length-1),_+=N.byteLength,T.push(N);if(_){let N;e.format==="GLB"?N=Nt:(N=i.bufferURIGenerator.createURI(d,"bin"),h.uri=N),h.byteLength=_,i.assignResourceURI(N,$.concat(T),!0)}a.buffers.push(h),i.bufferIndexMap.set(d,m)}),r.listAccessors().find(d=>!d.getBuffer())&&o.warn("Skipped writing one or more Accessors: no Buffer assigned."),l.filter(d=>d.prewriteTypes.includes("Material")).forEach(d=>d.prewrite(i,"Material")),a.materials=r.listMaterials().map((d,m)=>{let h=i.createPropertyDef(d);if(d.getAlphaMode()!==la.AlphaMode.OPAQUE&&(h.alphaMode=d.getAlphaMode()),d.getAlphaMode()===la.AlphaMode.MASK&&(h.alphaCutoff=d.getAlphaCutoff()),d.getDoubleSided()&&(h.doubleSided=!0),h.pbrMetallicRoughness={},he.eq(d.getBaseColorFactor(),[1,1,1,1])||(h.pbrMetallicRoughness.baseColorFactor=d.getBaseColorFactor()),he.eq(d.getEmissiveFactor(),[0,0,0])||(h.emissiveFactor=d.getEmissiveFactor()),d.getRoughnessFactor()!==1&&(h.pbrMetallicRoughness.roughnessFactor=d.getRoughnessFactor()),d.getMetallicFactor()!==1&&(h.pbrMetallicRoughness.metallicFactor=d.getMetallicFactor()),d.getBaseColorTexture()){let y=d.getBaseColorTexture(),w=d.getBaseColorTextureInfo();h.pbrMetallicRoughness.baseColorTexture=i.createTextureInfoDef(y,w)}if(d.getEmissiveTexture()){let y=d.getEmissiveTexture(),w=d.getEmissiveTextureInfo();h.emissiveTexture=i.createTextureInfoDef(y,w)}if(d.getNormalTexture()){let y=d.getNormalTexture(),w=d.getNormalTextureInfo(),v=i.createTextureInfoDef(y,w);d.getNormalScale()!==1&&(v.scale=d.getNormalScale()),h.normalTexture=v}if(d.getOcclusionTexture()){let y=d.getOcclusionTexture(),w=d.getOcclusionTextureInfo(),v=i.createTextureInfoDef(y,w);d.getOcclusionStrength()!==1&&(v.strength=d.getOcclusionStrength()),h.occlusionTexture=v}if(d.getMetallicRoughnessTexture()){let y=d.getMetallicRoughnessTexture(),w=d.getMetallicRoughnessTextureInfo();h.pbrMetallicRoughness.metallicRoughnessTexture=i.createTextureInfoDef(y,w)}return i.materialIndexMap.set(d,m),h}),l.filter(d=>d.prewriteTypes.includes("Mesh")).forEach(d=>d.prewrite(i,"Mesh")),a.meshes=r.listMeshes().map((d,m)=>{let h=i.createPropertyDef(d),y=null;return h.primitives=d.listPrimitives().map(w=>{let v={attributes:{}};v.mode=w.getMode();let x=w.getMaterial();x&&(v.material=i.materialIndexMap.get(x)),Object.keys(w.getExtras()).length&&(v.extras=w.getExtras());let S=w.getIndices();S&&(v.indices=i.accessorIndexMap.get(S));for(let T of w.listSemantics())v.attributes[T]=i.accessorIndexMap.get(w.getAttribute(T));for(let T of w.listTargets()){let A={};for(let _ of T.listSemantics())A[_]=i.accessorIndexMap.get(T.getAttribute(_));v.targets=v.targets||[],v.targets.push(A)}return w.listTargets().length&&!y&&(y=w.listTargets().map(T=>T.getName())),v}),d.getWeights().length&&(h.weights=d.getWeights()),y&&(h.extras=h.extras||{},h.extras.targetNames=y),i.meshIndexMap.set(d,m),h}),a.cameras=r.listCameras().map((d,m)=>{let h=i.createPropertyDef(d);if(h.type=d.getType(),h.type===ha.Type.PERSPECTIVE){h.perspective={znear:d.getZNear(),zfar:d.getZFar(),yfov:d.getYFov()};let y=d.getAspectRatio();y!==null&&(h.perspective.aspectRatio=y)}else h.orthographic={znear:d.getZNear(),zfar:d.getZFar(),xmag:d.getXMag(),ymag:d.getYMag()};return i.cameraIndexMap.set(d,m),h}),a.nodes=r.listNodes().map((d,m)=>{let h=i.createPropertyDef(d);return he.eq(d.getTranslation(),[0,0,0])||(h.translation=d.getTranslation()),he.eq(d.getRotation(),[0,0,0,1])||(h.rotation=d.getRotation()),he.eq(d.getScale(),[1,1,1])||(h.scale=d.getScale()),d.getWeights().length&&(h.weights=d.getWeights()),i.nodeIndexMap.set(d,m),h}),a.skins=r.listSkins().map((d,m)=>{let h=i.createPropertyDef(d),y=d.getInverseBindMatrices();y&&(h.inverseBindMatrices=i.accessorIndexMap.get(y));let w=d.getSkeleton();return w&&(h.skeleton=i.nodeIndexMap.get(w)),h.joints=d.listJoints().map(v=>i.nodeIndexMap.get(v)),i.skinIndexMap.set(d,m),h}),r.listNodes().forEach((d,m)=>{let h=a.nodes[m],y=d.getMesh();y&&(h.mesh=i.meshIndexMap.get(y));let w=d.getCamera();w&&(h.camera=i.cameraIndexMap.get(w));let v=d.getSkin();v&&(h.skin=i.skinIndexMap.get(v)),d.listChildren().length>0&&(h.children=d.listChildren().map(x=>i.nodeIndexMap.get(x)))}),a.animations=r.listAnimations().map((d,m)=>{let h=i.createPropertyDef(d),y=new Map;return h.samplers=d.listSamplers().map((w,v)=>{let x=i.createPropertyDef(w);return x.input=i.accessorIndexMap.get(w.getInput()),x.output=i.accessorIndexMap.get(w.getOutput()),x.interpolation=w.getInterpolation(),y.set(w,v),x}),h.channels=d.listChannels().map(w=>{let v=i.createPropertyDef(w);return v.sampler=y.get(w.getSampler()),v.target={node:i.nodeIndexMap.get(w.getTargetNode()),path:w.getTargetPath()},v}),i.animationIndexMap.set(d,m),h}),a.scenes=r.listScenes().map((d,m)=>{let h=i.createPropertyDef(d);return h.nodes=d.listChildren().map(y=>i.nodeIndexMap.get(y)),i.sceneIndexMap.set(d,m),h});let p=r.getDefaultScene();return p&&(a.scene=r.listScenes().indexOf(p)),a.extensionsUsed=l.map(d=>d.extensionName),a.extensionsRequired=u.map(d=>d.extensionName),l.forEach(d=>d.write(i)),nm(a),n}};function nm(t){let e=[];for(let s in t){let r=t[s];(Array.isArray(r)&&r.length===0||r===null||r===""||r&&typeof r=="object"&&Object.keys(r).length===0)&&e.push(s)}for(let s of e)delete t[s]}var im=class{_logger=ua.DEFAULT_INSTANCE;_extensions=new Set;_dependencies={};_vertexLayout="interleaved";_strictResources=!0;lastReadBytes=0;lastWriteBytes=0;setLogger(t){return this._logger=t,this}registerExtensions(t){for(let e of t)this._extensions.add(e),e.register();return this}registerDependencies(t){return Object.assign(this._dependencies,t),this}setVertexLayout(t){return this._vertexLayout=t,this}setStrictResources(t){return this._strictResources=t,this}async read(t){return await this.readJSON(await this.readAsJSON(t))}async readAsJSON(t){let e=await this.readURI(t,"view");this.lastReadBytes=e.byteLength;let s=cl(e)?this._binaryToJSON(e):{json:JSON.parse($.decodeText(e)),resources:{}};return await this._readResourcesExternal(s,this.dirname(t)),this._readResourcesInternal(s),s}async readJSON(t){return t=this._copyJSON(t),this._readResourcesInternal(t),Yg.read(t,{extensions:Array.from(this._extensions),dependencies:this._dependencies,logger:this._logger})}async binaryToJSON(t){let e=this._binaryToJSON($.assertView(t));this._readResourcesInternal(e);let s=e.json;if(s.buffers&&s.buffers.some(r=>om(e,r)))throw new Error("Cannot resolve external buffers with binaryToJSON().");if(s.images&&s.images.some(r=>cm(e,r)))throw new Error("Cannot resolve external images with binaryToJSON().");return e}async readBinary(t){return this.readJSON(await this.binaryToJSON($.assertView(t)))}async writeJSON(t,e={}){if(e.format==="GLB"&&t.getRoot().listBuffers().length>1)throw new Error("GLB must have 0\u20131 buffers.");return am.write(t,{format:e.format||"GLTF",basename:e.basename||"",logger:this._logger,vertexLayout:this._vertexLayout,dependencies:{...this._dependencies},extensions:Array.from(this._extensions)})}async writeBinary(t){let{json:e,resources:s}=await this.writeJSON(t,{format:"GLB"}),r=new Uint32Array([1179937895,2,12]),a=JSON.stringify(e),n=$.pad($.encodeText(a),32),i=$.toView(new Uint32Array([n.byteLength,1313821514])),o=$.concat([i,n]);r[r.length-1]+=o.byteLength;let c=Object.values(s)[0];if(!c||!c.byteLength)return $.concat([$.toView(r),o]);let l=$.pad(c,0),u=$.toView(new Uint32Array([l.byteLength,5130562])),f=$.concat([u,l]);return r[r.length-1]+=f.byteLength,$.concat([$.toView(r),o,f])}async _readResourcesExternal(t,e){let s=t.json.images||[],r=t.json.buffers||[],a=[...s,...r].map(async n=>{let i=n.uri;if(!i||i.match(/data:/))return Promise.resolve();try{t.resources[i]=await this.readURI(this.resolve(e,i),"view"),this.lastReadBytes+=t.resources[i].byteLength}catch(o){if(!this._strictResources&&s.includes(n))this._logger.warn(`Failed to load image URI, "${i}". ${o}`),t.resources[i]=null;else throw o}});await Promise.all(a)}_readResourcesInternal(t){function e(s){if(s.uri){if(s.uri in t.resources){$.assertView(t.resources[s.uri]);return}if(s.uri.match(/data:/)){let r=`__${Gg()}.${ks.extension(s.uri)}`;t.resources[r]=$.createBufferFromDataURI(s.uri),s.uri=r}}}(t.json.images||[]).forEach(s=>{if(s.bufferView===void 0&&s.uri===void 0)throw new Error("Missing resource URI or buffer view.");e(s)}),(t.json.buffers||[]).forEach(e)}_copyJSON(t){let{images:e,buffers:s}=t.json;return t={json:{...t.json},resources:{...t.resources}},e&&(t.json.images=e.map(r=>({...r}))),s&&(t.json.buffers=s.map(r=>({...r}))),t}_binaryToJSON(t){if(!cl(t))throw new Error("Invalid glTF 2.0 binary.");let e=new Uint32Array(t.buffer,t.byteOffset+12,2);if(e[1]!==1313821514)throw new Error("Missing required GLB JSON chunk.");let s=20,r=e[0],a=$.decodeText($.toView(t,s,r)),n=JSON.parse(a),i=s+r;if(t.byteLength<=i)return{json:n,resources:{}};let o=new Uint32Array(t.buffer,t.byteOffset+i,2);if(o[1]!==5130562)return{json:n,resources:{}};let c=o[0],l=$.toView(t,i+8,c);return{json:n,resources:{[Nt]:l}}}};function om(t,e){return e.uri!==void 0&&!(e.uri in t.resources)}function cm(t,e){return e.uri!==void 0&&!(e.uri in t.resources)&&e.bufferView===void 0}function cl(t){if(t.byteLength<3*Uint32Array.BYTES_PER_ELEMENT)return!1;let e=new Uint32Array(t.buffer,t.byteOffset,3);return e[0]===1179937895&&e[1]===2}var _l=class extends im{_fetchConfig;constructor(t=ai.DEFAULT_INIT){super(),this._fetchConfig=t}async readURI(t,e){let s=await fetch(t,this._fetchConfig);switch(e){case"view":return new Uint8Array(await s.arrayBuffer());case"text":return s.text()}}resolve(t,e){return ai.resolve(t,e)}dirname(t){return ai.dirname(t)}};function lm(){return{vkFormat:0,typeSize:1,pixelWidth:0,pixelHeight:0,pixelDepth:0,layerCount:0,faceCount:1,levelCount:0,supercompressionScheme:0,levels:[],dataFormatDescriptor:[{vendorId:0,descriptorType:0,versionNumber:2,colorModel:0,colorPrimaries:1,transferFunction:2,flags:0,texelBlockDimension:[0,0,0,0],bytesPlane:[0,0,0,0,0,0,0,0],samples:[]}],keyValue:{},globalData:null}}var os=class{constructor(e,s,r,a){this._dataView=void 0,this._littleEndian=void 0,this._offset=void 0,this._dataView=new DataView(e.buffer,e.byteOffset+s,r),this._littleEndian=a,this._offset=0}_nextUint8(){let e=this._dataView.getUint8(this._offset);return this._offset+=1,e}_nextUint16(){let e=this._dataView.getUint16(this._offset,this._littleEndian);return this._offset+=2,e}_nextUint32(){let e=this._dataView.getUint32(this._offset,this._littleEndian);return this._offset+=4,e}_nextUint64(){let e=this._dataView.getUint32(this._offset,this._littleEndian),s=this._dataView.getUint32(this._offset+4,this._littleEndian),r=e+2**32*s;return this._offset+=8,r}_nextInt32(){let e=this._dataView.getInt32(this._offset,this._littleEndian);return this._offset+=4,e}_nextUint8Array(e){let s=new Uint8Array(this._dataView.buffer,this._dataView.byteOffset+this._offset,e);return this._offset+=e,s}_skip(e){return this._offset+=e,this}_scan(e,s=0){let r=this._offset,a=0;for(;this._dataView.getUint8(this._offset)!==s&&a<e;)a++,this._offset++;return a<e&&this._offset++,new Uint8Array(this._dataView.buffer,this._dataView.byteOffset+r,a)}};var DM=new Uint8Array([0]),Ue=[171,75,84,88,32,50,48,187,13,10,26,10];function Il(t){return new TextDecoder().decode(t)}function pa(t){let e=new Uint8Array(t.buffer,t.byteOffset,Ue.length);if(e[0]!==Ue[0]||e[1]!==Ue[1]||e[2]!==Ue[2]||e[3]!==Ue[3]||e[4]!==Ue[4]||e[5]!==Ue[5]||e[6]!==Ue[6]||e[7]!==Ue[7]||e[8]!==Ue[8]||e[9]!==Ue[9]||e[10]!==Ue[10]||e[11]!==Ue[11])throw new Error("Missing KTX 2.0 identifier.");let s=lm(),r=17*Uint32Array.BYTES_PER_ELEMENT,a=new os(t,Ue.length,r,!0);s.vkFormat=a._nextUint32(),s.typeSize=a._nextUint32(),s.pixelWidth=a._nextUint32(),s.pixelHeight=a._nextUint32(),s.pixelDepth=a._nextUint32(),s.layerCount=a._nextUint32(),s.faceCount=a._nextUint32(),s.levelCount=a._nextUint32(),s.supercompressionScheme=a._nextUint32();let n=a._nextUint32(),i=a._nextUint32(),o=a._nextUint32(),c=a._nextUint32(),l=a._nextUint64(),u=a._nextUint64(),f=Math.max(s.levelCount,1)*3*8,b=new os(t,Ue.length+r,f,!0);for(let L=0,K=Math.max(s.levelCount,1);L<K;L++)s.levels.push({levelData:new Uint8Array(t.buffer,t.byteOffset+b._nextUint64(),b._nextUint64()),uncompressedByteLength:b._nextUint64()});let g=new os(t,n,i,!0);g._skip(4);let p=g._nextUint16(),d=g._nextUint16(),m=g._nextUint16(),h=g._nextUint16(),y=g._nextUint8(),w=g._nextUint8(),v=g._nextUint8(),x=g._nextUint8(),S=[g._nextUint8(),g._nextUint8(),g._nextUint8(),g._nextUint8()],T=[g._nextUint8(),g._nextUint8(),g._nextUint8(),g._nextUint8(),g._nextUint8(),g._nextUint8(),g._nextUint8(),g._nextUint8()],_={vendorId:p,descriptorType:d,versionNumber:m,colorModel:y,colorPrimaries:w,transferFunction:v,flags:x,texelBlockDimension:S,bytesPlane:T,samples:[]},C=(h/4-6)/4;for(let L=0;L<C;L++){let K={bitOffset:g._nextUint16(),bitLength:g._nextUint8(),channelType:g._nextUint8(),samplePosition:[g._nextUint8(),g._nextUint8(),g._nextUint8(),g._nextUint8()],sampleLower:Number.NEGATIVE_INFINITY,sampleUpper:Number.POSITIVE_INFINITY};K.channelType&64?(K.sampleLower=g._nextInt32(),K.sampleUpper=g._nextInt32()):(K.sampleLower=g._nextUint32(),K.sampleUpper=g._nextUint32()),_.samples[L]=K}s.dataFormatDescriptor.length=0,s.dataFormatDescriptor.push(_);let R=new os(t,o,c,!0);for(;R._offset<c;){let L=R._nextUint32(),K=R._scan(L),Y=Il(K);if(s.keyValue[Y]=R._nextUint8Array(L-K.byteLength-1),Y.match(/^ktx/i)){let ve=Il(s.keyValue[Y]);s.keyValue[Y]=ve.substring(0,ve.lastIndexOf("\0"))}let ge=L%4?4-L%4:0;R._skip(ge)}if(u<=0)return s;let O=new os(t,l,u,!0),P=O._nextUint16(),H=O._nextUint16(),Q=O._nextUint32(),pe=O._nextUint32(),ae=O._nextUint32(),me=O._nextUint32(),Ae=[];for(let L=0,K=Math.max(s.levelCount,1);L<K;L++)Ae.push({imageFlags:O._nextUint32(),rgbSliceByteOffset:O._nextUint32(),rgbSliceByteLength:O._nextUint32(),alphaSliceByteOffset:O._nextUint32(),alphaSliceByteLength:O._nextUint32()});let be=l+O._offset,_e=be+Q,ye=_e+pe,Le=ye+ae,Ie=new Uint8Array(t.buffer,t.byteOffset+be,Q),Ws=new Uint8Array(t.buffer,t.byteOffset+_e,pe),ms=new Uint8Array(t.buffer,t.byteOffset+ye,ae),I=new Uint8Array(t.buffer,t.byteOffset+Le,me);return s.globalData={endpointCount:P,selectorCount:H,imageDescs:Ae,endpointsData:Ie,selectorsData:Ws,tablesData:ms,extendedData:I},s}var Ct="EXT_mesh_gpu_instancing",wt="EXT_mesh_features",Ke="EXT_meshopt_compression",X="EXT_structural_metadata",ba="EXT_texture_webp",ga="EXT_texture_avif",bm="KHR_accessor_float16",gm="KHR_accessor_float64",we="KHR_draco_mesh_compression",yt="KHR_lights_punctual",Ot="KHR_materials_anisotropy",Ft="KHR_materials_clearcoat",Pt="KHR_materials_diffuse_transmission",jt="KHR_materials_dispersion",Lt="KHR_materials_emissive_strength",Dt="KHR_materials_ior",Ut="KHR_materials_iridescence",zt="KHR_materials_pbrSpecularGlossiness",Gt="KHR_materials_sheen",Kt="KHR_materials_specular",Vt="KHR_materials_transmission",Es="KHR_materials_unlit",Ht="KHR_materials_volume",We="KHR_materials_variants",Rl="KHR_mesh_primitive_restart",Nl="KHR_mesh_quantization",qt="KHR_node_visibility",ma="KHR_texture_basisu",Wt="KHR_texture_transform",at="KHR_xmp_json_ld",mm=class extends J{static EXTENSION_NAME=wt;init(){this.extensionName=wt,this.propertyType="FeatureID",this.parentTypes=["Features"]}getDefaults(){return Object.assign(super.getDefaults(),{nullFeatureId:null,label:"",attribute:null,texture:null,propertyTable:null})}getFeatureCount(){return this.get("featureCount")}setFeatureCount(t){return this.set("featureCount",t)}getNullFeatureID(){return this.get("nullFeatureId")}setNullFeatureID(t){return this.set("nullFeatureId",t)}getLabel(){return this.get("label")}setLabel(t){return this.set("label",t)}getAttribute(){return this.get("attribute")}setAttribute(t){return this.set("attribute",t)}getTexture(){return this.getRef("texture")}setTexture(t){return this.setRef("texture",t)}getPropertyTable(){return this.getRef("propertyTable")}setPropertyTable(t){return this.setRef("propertyTable",t)}},ym=class extends J{static EXTENSION_NAME=wt;init(){this.extensionName=wt,this.propertyType="FeatureIDTexture",this.parentTypes=["FeatureID"]}getDefaults(){let t=new ue(this.graph,"textureInfo");return t.setMinFilter(ue.MagFilter.NEAREST),t.setMagFilter(ue.MagFilter.NEAREST),Object.assign(super.getDefaults(),{channels:[0],texture:null,textureInfo:t})}getChannels(){return this.get("channels")}setChannels(t){return this.set("channels",t)}getTexture(){return this.getRef("texture")}setTexture(t){return this.setRef("texture",t)}getTextureInfo(){return this.getRef("texture")?this.getRef("textureInfo"):null}},wm=class extends J{static EXTENSION_NAME=wt;init(){this.extensionName=wt,this.propertyType="Features",this.parentTypes=[j.PRIMITIVE]}getDefaults(){return Object.assign(super.getDefaults(),{featureIds:new ce([])})}listFeatureIDs(){return this.listRefs("featureIds")}addFeatureID(t){return this.addRef("featureIds",t)}removeFeatureID(t){return this.removeRef("featureIds",t)}},sr=wt,mi=class extends ie{extensionName=wt;static EXTENSION_NAME=wt;createFeatures(){return new wm(this.document.getGraph())}createFeatureID(){return new mm(this.document.getGraph())}createFeatureIDTexture(){return new ym(this.document.getGraph())}read(t){return(t.jsonDoc.json.meshes||[]).forEach((e,s)=>{(e.primitives||[]).forEach((r,a)=>{this._readPrimitive(t,s,r,a)})}),this}_readPrimitive(t,e,s,r){if(!s.extensions||!s.extensions[sr])return;let a=this.createFeatures(),n=s.extensions[sr];for(let i of n.featureIds){let o=vm(this.document,this,t,i);a.addFeatureID(o)}t.meshes[e].listPrimitives()[r].setExtension(sr,a)}write(t){let e=t.jsonDoc.json.meshes;if(!e)return this;for(let s of this.document.getRoot().listMeshes()){let r=e[t.meshIndexMap.get(s)];s.listPrimitives().forEach((a,n)=>{let i=r.primitives[n];this._writePrimitive(t,a,i)})}return this}_writePrimitive(t,e,s){let r=e.getExtension(sr);if(!r)return;let a={featureIds:[]};r.listFeatureIDs().forEach(n=>{a.featureIds.push(km(this.document,t,n))}),s.extensions=s.extensions||{},s.extensions[sr]=a}};function vm(t,e,s,r){let a=e.createFeatureID().setFeatureCount(r.featureCount);r.nullFeatureId!==void 0&&a.setNullFeatureID(r.nullFeatureId),r.label!==void 0&&a.setLabel(r.label),r.attribute!==void 0&&a.setAttribute(r.attribute);let n=r.texture;if(n!==void 0){let i=xm(e,s,n);a.setTexture(i)}if(r.propertyTable!==void 0){let i=t.getRoot().getExtension(X).listPropertyTables();a.setPropertyTable(i[r.propertyTable])}return a}function xm(t,e,s){let r=t.createFeatureIDTexture(),{json:a}=e.jsonDoc;if(s.channels&&r.setChannels(s.channels),s.index!==void 0){let n=a.textures[s.index].source;r.setTexture(e.textures[n]),e.setTextureInfo(r.getTextureInfo(),s)}return r}function km(t,e,s){let r=t.getRoot(),a={featureCount:s.getFeatureCount()};if(s.getNullFeatureID()!=null&&(a.nullFeatureId=s.getNullFeatureID()),s.getLabel()&&(a.label=s.getLabel()),s.getAttribute()!=null&&(a.attribute=s.getAttribute()),s.getTexture()){let n=s.getTexture(),i=n.getTexture(),o=n.getTextureInfo();a.texture=e.createTextureInfoDef(i,o);let c=n.getChannels();he.eq(c,[0])||(a.texture.channels=c)}if(s.getPropertyTable()){let n=r.getExtension(X),i=s.getPropertyTable();a.propertyTable=n.listPropertyTables().indexOf(i)}return a}var pi="INSTANCE_ATTRIBUTE",Em=class extends J{static EXTENSION_NAME=Ct;init(){this.extensionName=Ct,this.propertyType="InstancedMesh",this.parentTypes=[j.NODE]}getDefaults(){return Object.assign(super.getDefaults(),{attributes:new xe})}getAttribute(t){return this.getRefMap("attributes",t)}setAttribute(t,e){return this.setRefMap("attributes",t,e,{usage:pi})}listAttributes(){return this.listRefMapValues("attributes")}listSemantics(){return this.listRefMapKeys("attributes")}},Mm=class extends ie{static EXTENSION_NAME=Ct;extensionName=Ct;prewriteTypes=[j.ACCESSOR];createInstancedMesh(){return new Em(this.document.getGraph())}read(t){return(t.jsonDoc.json.nodes||[]).forEach((e,s)=>{if(!e.extensions||!e.extensions.EXT_mesh_gpu_instancing)return;let r=e.extensions[Ct],a=this.createInstancedMesh();for(let n in r.attributes)a.setAttribute(n,t.accessors[r.attributes[n]]);t.nodes[s].setExtension(Ct,a)}),this}prewrite(t){t.accessorUsageGroupedByParent.add(pi);for(let e of this.properties)for(let s of e.listAttributes())t.addAccessorToUsageGroup(s,pi);return this}write(t){let e=t.jsonDoc;return this.document.getRoot().listNodes().forEach(s=>{let r=s.getExtension(Ct);if(r){let a=t.nodeIndexMap.get(s),n=e.json.nodes[a],i={attributes:{}};r.listSemantics().forEach(o=>{let c=r.getAttribute(o);i.attributes[o]=t.accessorIndexMap.get(c)}),n.extensions=n.extensions||{},n.extensions[Ct]=i}}),this}},Sm=(function(t){return t.QUANTIZE="quantize",t.FILTER="filter",t})({});function Tm(t){return!t.extensions||!t.extensions.EXT_meshopt_compression?!1:!!t.extensions[Ke].fallback}var{BYTE:Am,SHORT:Bl,FLOAT:_m}=W.ComponentType,{encodeNormalizedInt:Cl,decodeNormalizedInt:bi}=he;function Im(t,e,s,r){let{filter:a,bits:n}=r,i={array:t.getArray(),byteStride:t.getElementSize()*t.getComponentSize(),componentType:t.getComponentType(),normalized:t.getNormalized()};if(s!=="ATTRIBUTES")return i;if(a!=="NONE"){let o=t.getNormalized()?Rm(t):new Float32Array(i.array);switch(a){case"EXPONENTIAL":i.byteStride=t.getElementSize()*4,i.componentType=_m,i.normalized=!1,i.array=e.encodeFilterExp(o,t.getCount(),i.byteStride,n);break;case"OCTAHEDRAL":i.byteStride=n>8?8:4,i.componentType=n>8?Bl:Am,i.normalized=!0,o=t.getElementSize()===3?Bm(o):o,i.array=e.encodeFilterOct(o,t.getCount(),i.byteStride,n);break;case"QUATERNION":i.byteStride=8,i.componentType=Bl,i.normalized=!0,i.array=e.encodeFilterQuat(o,t.getCount(),i.byteStride,n);break;default:throw new Error("Invalid filter.")}i.min=t.getMin([]),i.max=t.getMax([]),t.getNormalized()&&(i.min=i.min.map(c=>bi(c,t.getComponentType())),i.max=i.max.map(c=>bi(c,t.getComponentType()))),i.normalized&&(i.min=i.min.map(c=>Cl(c,i.componentType)),i.max=i.max.map(c=>Cl(c,i.componentType)))}else i.byteStride%4&&(i.array=Nm(i.array,t.getElementSize()),i.byteStride=i.array.byteLength/t.getCount());return i}function Rm(t){let e=t.getComponentType(),s=t.getArray(),r=new Float32Array(s.length);for(let a=0;a<s.length;a++)r[a]=bi(s[a],e);return r}function Nm(t,e){let s=$.padNumber(t.BYTES_PER_ELEMENT*e)/t.BYTES_PER_ELEMENT,r=t.length/e,a=new t.constructor(r*s);for(let n=0;n*e<t.length;n++)for(let i=0;i<e;i++)a[n*s+i]=t[n*e+i];return a}function Bm(t){let e=new Float32Array(t.length*4/3);for(let s=0,r=t.length/3;s<r;s++)e[s*4]=t[s*3],e[s*4+1]=t[s*3+1],e[s*4+2]=t[s*3+2];return e}function Cm(t,e){return e===Rt.BufferViewUsage.ELEMENT_ARRAY_BUFFER?t.listParents().some(s=>s instanceof tr&&s.getMode()===tr.Mode.TRIANGLES)?"TRIANGLES":"INDICES":"ATTRIBUTES"}function Om(t,e){let s=e.getGraph().listParentEdges(t).filter(r=>!(r.getParent()instanceof ui));for(let r of s){let a=r.getName(),n=r.getAttributes().key||"",i=r.getParent().propertyType===j.PRIMITIVE_TARGET;if(a==="indices")return{filter:"NONE"};if(a==="attributes"){if(n==="POSITION")return{filter:"NONE"};if(n==="TEXCOORD_0")return{filter:"NONE"};if(n.startsWith("JOINTS_"))return{filter:"NONE"};if(n.startsWith("WEIGHTS_"))return{filter:"NONE"};if(n==="NORMAL"||n==="TANGENT")return i?{filter:"NONE"}:{filter:"OCTAHEDRAL",bits:8}}if(a==="output"){let o=Yl(t);return o==="rotation"?{filter:"QUATERNION",bits:16}:o==="translation"?{filter:"EXPONENTIAL",bits:12}:o==="scale"?{filter:"EXPONENTIAL",bits:12}:{filter:"NONE"}}if(a==="input")return{filter:"NONE"};if(a==="inverseBindMatrices")return{filter:"NONE"}}return{filter:"NONE"}}function Yl(t){for(let e of t.listParents())if(e instanceof fa){for(let s of e.listParents())if(s instanceof di)return s.getTargetPath()}return null}var Ol={method:"quantize"},yi=class extends ie{extensionName=Ke;prereadTypes=[j.BUFFER,j.PRIMITIVE];prewriteTypes=[j.BUFFER,j.ACCESSOR];readDependencies=["meshopt.decoder"];writeDependencies=["meshopt.encoder"];static EXTENSION_NAME=Ke;static EncoderMethod=Sm;_decoder=null;_decoderFallbackBufferMap=new Map;_encoder=null;_encoderOptions=Ol;_encoderFallbackBuffer=null;_encoderBufferViews={};_encoderBufferViewData={};_encoderBufferViewAccessors={};install(t,e){return t==="meshopt.decoder"&&(this._decoder=e),t==="meshopt.encoder"&&(this._encoder=e),this}setEncoderOptions(t){return this._encoderOptions={...Ol,...t},this}preread(t,e){if(!this._decoder){if(!this.isRequired())return this;throw new Error(`[${Ke}] Please install extension dependency, "meshopt.decoder".`)}if(!this._decoder.supported){if(!this.isRequired())return this;throw new Error(`[${Ke}]: Missing WASM support.`)}return e===j.BUFFER?this._prereadBuffers(t):e===j.PRIMITIVE&&this._prereadPrimitives(t),this}_prereadBuffers(t){let e=t.jsonDoc;(e.json.bufferViews||[]).forEach((s,r)=>{if(!s.extensions||!s.extensions.EXT_meshopt_compression)return;let a=s.extensions[Ke],n=a.byteOffset||0,i=a.byteLength||0,o=a.count,c=a.byteStride,l=new Uint8Array(o*c),u=e.json.buffers[a.buffer],f=u.uri?e.resources[u.uri]:e.resources[Nt],b=$.toView(f,n,i);this._decoder.decodeGltfBuffer(l,o,c,b,a.mode,a.filter),t.bufferViews[r]=l})}_prereadPrimitives(t){let e=t.jsonDoc;(e.json.bufferViews||[]).forEach(s=>{if(!s.extensions||!s.extensions.EXT_meshopt_compression)return;let r=s.extensions[Ke],a=t.buffers[r.buffer],n=t.buffers[s.buffer],i=e.json.buffers[s.buffer];Tm(i)&&this._decoderFallbackBufferMap.set(n,a)})}read(t){if(!this.isRequired())return this;for(let[e,s]of this._decoderFallbackBufferMap){for(let r of e.listParents())r instanceof W&&r.swap(e,s);e.dispose()}return this}prewrite(t,e){return e===j.ACCESSOR?this._prewriteAccessors(t):e===j.BUFFER&&this._prewriteBuffers(t),this}_prewriteAccessors(t){let e=t.jsonDoc.json,s=this._encoder,r=this._encoderOptions,a=this.document.getGraph(),n=this.document.createBuffer(),i=this.document.getRoot().listBuffers().indexOf(n),o=1,c=new Map,l=u=>{for(let f of a.listParents(u)){if(f.propertyType===j.ROOT)continue;let b=c.get(u);return b===void 0&&c.set(u,b=o++),b}return-1};this._encoderFallbackBuffer=n,this._encoderBufferViews={},this._encoderBufferViewData={},this._encoderBufferViewAccessors={};for(let u of this.document.getRoot().listAccessors()){if(Yl(u)==="weights"||u.getSparse())continue;let f=t.getAccessorUsage(u),b=t.accessorUsageGroupedByParent.has(f)?l(u):null,g=Cm(u,f),p=r.method==="filter"?Om(u,this.document):{filter:"NONE"},d=Im(u,s,g,p),{array:m,byteStride:h}=d,y=u.getBuffer();if(!y)throw new Error(`${Ke}: Missing buffer for accessor.`);let w=this.document.getRoot().listBuffers().indexOf(y),v=[f,b,g,p.filter,h,w].join(":"),x=this._encoderBufferViews[v],S=this._encoderBufferViewData[v],T=this._encoderBufferViewAccessors[v];(!x||!S)&&(T=this._encoderBufferViewAccessors[v]=[],S=this._encoderBufferViewData[v]=[],x=this._encoderBufferViews[v]={buffer:i,target:Rt.USAGE_TO_TARGET[f],byteOffset:0,byteLength:0,byteStride:f===Rt.BufferViewUsage.ARRAY_BUFFER?h:void 0,extensions:{[Ke]:{buffer:w,byteOffset:0,byteLength:0,mode:g,filter:p.filter!=="NONE"?p.filter:void 0,byteStride:h,count:0}}});let A=t.createAccessorDef(u);A.componentType=d.componentType,A.normalized=d.normalized,A.byteOffset=x.byteLength,A.min&&d.min&&(A.min=d.min),A.max&&d.max&&(A.max=d.max),t.accessorIndexMap.set(u,e.accessors.length),e.accessors.push(A),T.push(A),S.push(new Uint8Array(m.buffer,m.byteOffset,m.byteLength)),x.byteLength+=m.byteLength,x.extensions.EXT_meshopt_compression.count+=u.getCount()}}_prewriteBuffers(t){let e=this._encoder;for(let s in this._encoderBufferViews){let r=this._encoderBufferViews[s],a=this._encoderBufferViewData[s],n=this.document.getRoot().listBuffers()[r.extensions[Ke].buffer],i=t.otherBufferViews.get(n)||[],{count:o,byteStride:c,mode:l}=r.extensions[Ke],u=$.concat(a),f=e.encodeGltfBuffer(u,o,c,l),b=$.pad(f);r.extensions[Ke].byteLength=f.byteLength,a.length=0,a.push(b),i.push(b),t.otherBufferViews.set(n,i)}}write(t){let e=0;for(let n in this._encoderBufferViews){let i=this._encoderBufferViews[n],o=this._encoderBufferViewData[n][0],c=t.otherBufferViewsIndexMap.get(o),l=this._encoderBufferViewAccessors[n];for(let g of l)g.bufferView=c;let u=t.jsonDoc.json.bufferViews[c],f=u.byteOffset||0;Object.assign(u,i),u.byteOffset=e;let b=u.extensions[Ke];b.byteOffset=f,e+=$.padNumber(i.byteLength)}let s=this._encoderFallbackBuffer,r=t.bufferIndexMap.get(s),a=t.jsonDoc.json.buffers[r];return a.byteLength=e,a.extensions={[Ke]:{fallback:!0}},s.dispose(),this}},Fm=class extends J{static EXTENSION_NAME=X;init(){this.extensionName=X,this.propertyType="StructuralMetadata",this.parentTypes=[j.ROOT]}getDefaults(){return Object.assign(super.getDefaults(),{schema:null,schemaUri:"",propertyTables:new Re,propertyTextures:new Re,propertyAttributes:new Re})}getSchema(){return this.getRef("schema")}setSchema(t){return this.setRef("schema",t)}getSchemaUri(){return this.get("schemaUri")}setSchemaUri(t){return this.set("schemaUri",t)}listPropertyTables(){return this.listRefs("propertyTables")}addPropertyTable(t){return this.addRef("propertyTables",t)}removePropertyTable(t){return this.removeRef("propertyTables",t)}listPropertyTextures(){return this.listRefs("propertyTextures")}addPropertyTexture(t){return this.addRef("propertyTextures",t)}removePropertyTexture(t){return this.removeRef("propertyTextures",t)}listPropertyAttributes(){return this.listRefs("propertyAttributes")}addPropertyAttribute(t){return this.addRef("propertyAttributes",t)}removePropertyAttribute(t){return this.removeRef("propertyAttributes",t)}},Pm=class extends J{static EXTENSION_NAME=X;init(){this.extensionName=X,this.propertyType="Schema",this.parentTypes=["StructuralMetadata"]}getDefaults(){return Object.assign(super.getDefaults(),{description:"",version:"",classes:new xe,enums:new xe})}getId(){return this.get("id")}setId(t){return this.set("id",t)}getDescription(){return this.get("description")}setDescription(t){return this.set("description",t)}getVersion(){return this.get("version")}setVersion(t){return this.set("version",t)}setClass(t,e){return this.setRefMap("classes",t,e)}getClass(t){return this.getRefMap("classes",t)}listClassKeys(){return this.listRefMapKeys("classes")}listClassValues(){return this.listRefMapValues("classes")}setEnum(t,e){return this.setRefMap("enums",t,e)}getEnum(t){return this.getRefMap("enums",t)}listEnumKeys(){return this.listRefMapKeys("enums")}listEnumValues(){return this.listRefMapValues("enums")}},jm=class extends J{static EXTENSION_NAME=X;init(){this.extensionName=X,this.propertyType="Class",this.parentTypes=["Schema"]}getDefaults(){return Object.assign(super.getDefaults(),{description:"",properties:new xe})}getDescription(){return this.get("description")}setDescription(t){return this.set("description",t)}setProperty(t,e){return this.setRefMap("properties",t,e)}getProperty(t){return this.getRefMap("properties",t)}listPropertyKeys(){return this.listRefMapKeys("properties")}listPropertyValues(){return this.listRefMapValues("properties")}},Lm=class extends J{static EXTENSION_NAME=X;init(){this.extensionName=X,this.propertyType="ClassProperty",this.parentTypes=["Class"]}getDefaults(){return Object.assign(super.getDefaults(),{description:"",componentType:null,enumType:null,array:null,count:null,normalized:null,offset:null,scale:null,max:null,min:null,required:null,noData:null,default:null})}getDescription(){return this.get("description")}setDescription(t){return this.set("description",t)}getType(){return this.get("type")}setType(t){return this.set("type",t)}getComponentType(){return this.get("componentType")}setComponentType(t){return this.set("componentType",t)}getEnumType(){return this.get("enumType")}setEnumType(t){return this.set("enumType",t)}getArray(){return this.get("array")}setArray(t){return this.set("array",t)}getCount(){return this.get("count")}setCount(t){return this.set("count",t)}getNormalized(){return this.get("normalized")}setNormalized(t){return this.set("normalized",t)}getOffset(){return this.get("offset")}setOffset(t){return this.set("offset",t)}getScale(){return this.get("scale")}setScale(t){return this.set("scale",t)}getMax(){return this.get("max")}setMax(t){return this.set("max",t)}getMin(){return this.get("min")}setMin(t){return this.set("min",t)}getRequired(){return this.get("required")}setRequired(t){return this.set("required",t)}getNoData(){return this.get("noData")}setNoData(t){return this.set("noData",t)}getDefault(){return this.get("default")}setDefault(t){return this.set("default",t)}},Dm=class extends J{static EXTENSION_NAME=X;init(){this.extensionName=X,this.propertyType="Enum",this.parentTypes=["Schema"]}getDefaults(){return Object.assign(super.getDefaults(),{description:"",valueType:"UINT16",values:new Re})}getDescription(){return this.get("description")}setDescription(t){return this.set("description",t)}getValueType(){return this.get("valueType")}setValueType(t){return this.set("valueType",t)}listValues(){return this.listRefs("values")}addEnumValue(t){return this.addRef("values",t)}removeEnumValue(t){return this.removeRef("values",t)}},Um=class extends J{static EXTENSION_NAME=X;init(){this.extensionName=X,this.propertyType="EnumValue",this.parentTypes=["Enum"]}getDefaults(){return Object.assign(super.getDefaults(),{description:null})}getDescription(){return this.get("description")}setDescription(t){return this.set("description",t)}getValue(){return this.get("value")}setValue(t){return this.set("value",t)}},zm=class extends J{static EXTENSION_NAME=X;init(){this.extensionName=X,this.propertyType="PropertyTable",this.parentTypes=["StructuralMetadata"]}getDefaults(){return Object.assign(super.getDefaults(),{properties:new xe})}getClass(){return this.get("class")}setClass(t){return this.set("class",t)}getCount(){return this.get("count")}setCount(t){return this.set("count",t)}setProperty(t,e){return this.setRefMap("properties",t,e)}getProperty(t){return this.getRefMap("properties",t)}listPropertyKeys(){return this.listRefMapKeys("properties")}listPropertyValues(){return this.listRefMapValues("properties")}},Gm=class extends J{static EXTENSION_NAME=X;init(){this.extensionName=X,this.propertyType="PropertyTableProperty",this.parentTypes=["PropertyTable"]}getDefaults(){return Object.assign(super.getDefaults(),{arrayOffsets:null,stringOffsets:null,arrayOffsetType:null,stringOffsetType:null,offset:null,scale:null,max:null,min:null})}getValues(){return this.get("values")}setValues(t){return this.set("values",t)}getArrayOffsets(){return this.get("arrayOffsets")}setArrayOffsets(t){return this.set("arrayOffsets",t)}getStringOffsets(){return this.get("stringOffsets")}setStringOffsets(t){return this.set("stringOffsets",t)}getArrayOffsetType(){return this.get("arrayOffsetType")}setArrayOffsetType(t){return this.set("arrayOffsetType",t)}getStringOffsetType(){return this.get("stringOffsetType")}setStringOffsetType(t){return this.set("stringOffsetType",t)}getOffset(){return this.get("offset")}setOffset(t){return this.set("offset",t)}getScale(){return this.get("scale")}setScale(t){return this.set("scale",t)}getMax(){return this.get("max")}setMax(t){return this.set("max",t)}getMin(){return this.get("min")}setMin(t){return this.set("min",t)}},Km=class extends J{static EXTENSION_NAME=X;init(){this.extensionName=X,this.propertyType="PropertyTexture",this.parentTypes=["StructuralMetadata"]}getDefaults(){return Object.assign(super.getDefaults(),{properties:new xe})}getClass(){return this.get("class")}setClass(t){return this.set("class",t)}setProperty(t,e){return this.setRefMap("properties",t,e)}getProperty(t){return this.getRefMap("properties",t)}listPropertyKeys(){return this.listRefMapKeys("properties")}listPropertyValues(){return this.listRefMapValues("properties")}},Vm=class extends J{static EXTENSION_NAME=X;init(){this.extensionName=X,this.propertyType="PropertyTextureProperty",this.parentTypes=["PropertyTexture"]}getDefaults(){let t=new ue(this.graph,"textureInfo");return t.setMinFilter(ue.MagFilter.NEAREST),t.setMagFilter(ue.MagFilter.NEAREST),Object.assign(super.getDefaults(),{channels:[0],texture:null,textureInfo:t,offset:null,scale:null,max:null,min:null})}getChannels(){return this.get("channels")}setChannels(t){return this.set("channels",t)}getTexture(){return this.getRef("texture")}setTexture(t){return this.setRef("texture",t)}getTextureInfo(){return this.getRef("texture")?this.getRef("textureInfo"):null}getOffset(){return this.get("offset")}setOffset(t){return this.set("offset",t)}getScale(){return this.get("scale")}setScale(t){return this.set("scale",t)}getMax(){return this.get("max")}setMax(t){return this.set("max",t)}getMin(){return this.get("min")}setMin(t){return this.set("min",t)}},Hm=class extends J{static EXTENSION_NAME=X;init(){this.extensionName=X,this.propertyType="PropertyAttribute",this.parentTypes=["StructuralMetadata"]}getDefaults(){return Object.assign(super.getDefaults(),{properties:new xe})}getClass(){return this.get("class")}setClass(t){return this.set("class",t)}setProperty(t,e){return this.setRefMap("properties",t,e)}getProperty(t){return this.getRefMap("properties",t)}listPropertyKeys(){return this.listRefMapKeys("properties")}listPropertyValues(){return this.listRefMapValues("properties")}},qm=class extends J{static EXTENSION_NAME=X;init(){this.extensionName=X,this.propertyType="PropertyAttributeProperty",this.parentTypes=["PropertyAttribute"]}getDefaults(){return Object.assign(super.getDefaults(),{offset:null,scale:null,max:null,min:null})}getAttribute(){return this.get("attribute")}setAttribute(t){return this.set("attribute",t)}getOffset(){return this.get("offset")}setOffset(t){return this.set("offset",t)}getScale(){return this.get("scale")}setScale(t){return this.set("scale",t)}getMax(){return this.get("max")}setMax(t){return this.set("max",t)}getMin(){return this.get("min")}setMin(t){return this.set("min",t)}},Wm=class extends J{static EXTENSION_NAME=X;init(){this.extensionName=X,this.propertyType="NodeStructuralMetadata",this.parentTypes=[j.NODE]}getDefaults(){return Object.assign(super.getDefaults(),{class:"",properties:{}})}getClass(){return this.get("class")}setClass(t){return this.set("class",t)}getProperties(){return this.get("properties")}setProperties(t){return this.set("properties",t)}},Xm=class extends J{static EXTENSION_NAME=X;init(){this.extensionName=X,this.propertyType="MeshPrimitiveStructuralMetadata",this.parentTypes=[j.PRIMITIVE]}getDefaults(){return Object.assign(super.getDefaults(),{propertyTextures:new Re,propertyAttributes:new Re})}listPropertyTextures(){return this.listRefs("propertyTextures")}addPropertyTexture(t){return this.addRef("propertyTextures",t)}removePropertyTexture(t){return this.removeRef("propertyTextures",t)}listPropertyAttributes(){return this.listRefs("propertyAttributes")}addPropertyAttribute(t){return this.addRef("propertyAttributes",t)}removePropertyAttribute(t){return this.removeRef("propertyAttributes",t)}},$m=class extends ie{extensionName=X;static EXTENSION_NAME=X;prewriteTypes=[j.BUFFER];prereadTypes=[j.SCENE];createStructuralMetadata(){return new Fm(this.document.getGraph())}createSchema(){return new Pm(this.document.getGraph())}createClass(){return new jm(this.document.getGraph())}createClassProperty(){return new Lm(this.document.getGraph())}createEnum(){return new Dm(this.document.getGraph())}createEnumValue(){return new Um(this.document.getGraph())}createPropertyTable(){return new zm(this.document.getGraph())}createPropertyTableProperty(){return new Gm(this.document.getGraph())}createPropertyTexture(){return new Km(this.document.getGraph())}createPropertyTextureProperty(){return new Vm(this.document.getGraph())}createPropertyAttribute(){return new Hm(this.document.getGraph())}createPropertyAttributeProperty(){return new qm(this.document.getGraph())}createNodeStructuralMetadata(){return new Wm(this.document.getGraph())}createMeshPrimitiveStructuralMetadata(){return new Xm(this.document.getGraph())}read(t){return this}preread(t){let e=this.document.getRoot(),{json:s}=t.jsonDoc,r=s.extensions[X],a=Ym(this,t,r);return e.setExtension(X,a),(s.meshes||[]).forEach((n,i)=>{let o=t.meshes[i].listPrimitives();(n.primitives||[]).forEach((c,l)=>{let u=o[l];this._readPrimitive(a,u,c)})}),(s.nodes||[]).forEach((n,i)=>{this._readNode(t.nodes[i],n)}),this}_readPrimitive(t,e,s){if(!s.extensions||!s.extensions.EXT_structural_metadata)return;let r=this.createMeshPrimitiveStructuralMetadata(),a=s.extensions[X],n=t.listPropertyTextures(),i=a.propertyTextures||[];for(let l of i){let u=n[l];r.addPropertyTexture(u)}let o=t.listPropertyAttributes(),c=a.propertyAttributes||[];for(let l of c){let u=o[l];r.addPropertyAttribute(u)}e.setExtension(X,r)}_readNode(t,e){if(!e.extensions||!e.extensions.EXT_structural_metadata)return;let s=e.extensions[X],r=this.createNodeStructuralMetadata().setClass(s.class).setProperties(s.properties);t.setExtension(X,r)}write(t){let e=this.document.getRoot(),s=e.getExtension(X);if(!s)return this;let r=t.jsonDoc.json,a=cy(t,s);r.extensions=r.extensions||{},r.extensions[X]=a;let n=e.listMeshes(),i=r.meshes;if(i)for(let l of n){let u=i[t.meshIndexMap.get(l)];l.listPrimitives().forEach((f,b)=>{let g=u.primitives[b];this._writePrimitive(s,f,g)})}let o=e.listNodes(),c=r.nodes;if(c)for(let l of o){let u=t.nodeIndexMap.get(l);this._writeNode(l,c[u])}return this}_writePrimitive(t,e,s){let r=e.getExtension(X);if(!r)return;let a=t.listPropertyTextures(),n=t.listPropertyAttributes(),i,o,c=r.listPropertyTextures();if(c.length>0){i=[];for(let f of c){let b=a.indexOf(f);if(b>=0)i.push(b);else throw new Error(`${X}: Invalid property texture in mesh primitive`)}}let l=r.listPropertyAttributes();if(l.length>0){o=[];for(let f of l){let b=n.indexOf(f);if(b>=0)o.push(b);else throw new Error(`${X}: Invalid property attribute in mesh primitive`)}}let u={propertyTextures:i,propertyAttributes:o};s.extensions=s.extensions||{},s.extensions[X]=u}_writeNode(t,e){let s=t.getExtension("EXT_structural_metadata");s&&(e.extensions=e.extensions||{},e.extensions[X]={class:s.getClass(),properties:s.getProperties()})}prewrite(t,e){return e===j.BUFFER&&this._prewriteBuffers(t),this}_prewriteBuffers(t){let e=this.document,s=e.getRoot().getExtension(X);t.jsonDoc.json.bufferViews||=[];for(let r of s.listPropertyTables())for(let a of r.listPropertyValues()){let n=vy(e,t);n.push(a.getValues());let i=a.getArrayOffsets();i&&n.push(i);let o=a.getStringOffsets();o&&n.push(o)}}};function Ym(t,e,s){let r=t.createStructuralMetadata();if(s.schema!==void 0){let o=Jm(t,s.schema);r.setSchema(o)}else if(s.schemaUri){let o=s.schemaUri;r.setSchemaUri(o)}let a=s.propertyTextures||[];for(let o of a){let c=sy(t,e,o);r.addPropertyTexture(c)}let n=s.propertyTables||[];for(let o of n){let c=ay(t,e,o);r.addPropertyTable(c)}let i=s.propertyAttributes||[];for(let o of i){let c=iy(t,o);r.addPropertyAttribute(c)}return r}function Jm(t,e){let s=t.createSchema().setId(e.id);e.name!==void 0&&s.setName(e.name),e.description!==void 0&&s.setDescription(e.description),e.version!==void 0&&s.setVersion(e.version);let r=e.classes||{};for(let n of Object.keys(r)){let i=r[n];s.setClass(n,Qm(t,i))}let a=e.enums||{};for(let n of Object.keys(a))s.setEnum(n,ey(t,a[n]));return s}function Qm(t,e){let s=t.createClass();e.name!==void 0&&s.setName(e.name),e.description!==void 0&&s.setDescription(e.description);let r=e.properties||{};for(let a of Object.keys(r)){let n=Zm(t,r[a]);s.setProperty(a,n)}return s}function Zm(t,e){let s=t.createClassProperty().setType(e.type);return e.name!==void 0&&s.setName(e.name),e.description!==void 0&&s.setDescription(e.description),e.componentType!==void 0&&s.setComponentType(e.componentType),e.enumType!==void 0&&s.setEnumType(e.enumType),e.array!==void 0&&s.setArray(e.array),e.count!==void 0&&s.setCount(e.count),e.normalized!==void 0&&s.setNormalized(e.normalized),e.offset!==void 0&&s.setOffset(e.offset),e.scale!==void 0&&s.setScale(e.scale),e.max!==void 0&&s.setMax(e.max),e.min!==void 0&&s.setMin(e.min),e.required!==void 0&&s.setRequired(e.required),e.noData!==void 0&&s.setNoData(e.noData),e.default!==void 0&&s.setDefault(e.default),s}function ey(t,e){let s=t.createEnum();e.name!==void 0&&s.setName(e.name),e.description!==void 0&&s.setDescription(e.description),e.valueType!==void 0&&s.setValueType(e.valueType);let r=e.values||{};for(let a of r)s.addEnumValue(ty(t,a));return s}function ty(t,e){let s=t.createEnumValue();return e.name!==void 0&&s.setName(e.name),e.description!==void 0&&s.setDescription(e.description),e.value!==void 0&&s.setValue(e.value),s}function sy(t,e,s){let r=t.createPropertyTexture();r.setClass(s.class),s.name!==void 0&&r.setName(s.name);let a=s.properties||{};for(let n of Object.keys(a)){let i=ry(t,e,a[n]);r.setProperty(n,i)}return r}function ry(t,e,s){let r=t.createPropertyTextureProperty(),a=e.jsonDoc.json.textures||[];s.channels&&r.setChannels(s.channels);let n=a[s.index].source;if(n!==void 0){let i=e.textures[n];r.setTexture(i);let o=r.getTextureInfo();o&&e.setTextureInfo(o,s)}return s.offset!==void 0&&r.setOffset(s.offset),s.scale!==void 0&&r.setScale(s.scale),s.max!==void 0&&r.setMax(s.max),s.min!==void 0&&r.setMin(s.min),r}function ay(t,e,s){let r=t.createPropertyTable().setClass(s.class).setCount(s.count);s.name!==void 0&&r.setName(s.name);let a=s.properties||{};for(let n of Object.keys(a)){let i=ny(t,e,a[n]);r.setProperty(n,i)}return r}function ny(t,e,s){let r=t.createPropertyTableProperty(),a=fi(e,s.values);if(r.setValues(a),s.arrayOffsets!==void 0){let n=fi(e,s.arrayOffsets);r.setArrayOffsets(n)}if(s.stringOffsets!==void 0){let n=fi(e,s.stringOffsets);r.setStringOffsets(n)}return s.arrayOffsetType!==void 0&&r.setArrayOffsetType(s.arrayOffsetType),s.stringOffsetType!==void 0&&r.setStringOffsetType(s.stringOffsetType),s.offset!==void 0&&r.setOffset(s.offset),s.scale!==void 0&&r.setScale(s.scale),s.max!==void 0&&r.setMax(s.max),s.min!==void 0&&r.setMin(s.min),r}function iy(t,e){let s=t.createPropertyAttribute();s.setClass(e.class),e.name!==void 0&&s.setName(e.name);let r=e.properties||{};for(let a of Object.keys(r)){let n=oy(t,r[a]);s.setProperty(a,n)}return s}function oy(t,e){let s=t.createPropertyAttributeProperty();return s.setAttribute(e.attribute),e.offset!==void 0&&s.setOffset(e.offset),e.scale!==void 0&&s.setScale(e.scale),e.max!==void 0&&s.setMax(e.max),e.min!==void 0&&s.setMin(e.min),s}function cy(t,e){let s={},r=e.getSchema();r&&(s.schema=ly(r));let a=e.getSchemaUri();a&&(s.schemaUri=a);let n=e.listPropertyTables();if(n.length>0){let c=[];for(let l of n){let u=py(t,l);c.push(u)}s.propertyTables=c}let i=e.listPropertyTextures();if(i.length>0){let c=[];for(let l of i){let u=yy(t,l);c.push(u)}s.propertyTextures=c}let o=e.listPropertyAttributes();if(o.length>0){let c=[];for(let l of o){let u=gy(l);c.push(u)}s.propertyAttributes=c}return s}function ly(t){let e={id:t.getId()},s=t.listClassKeys();if(s.length>0){e.classes={};for(let a of s){let n=dy(t.getClass(a));e.classes[a]=n}}let r=t.listEnumKeys();if(r.length>0){e.enums={};for(let a of r){let n=fy(t.getEnum(a));e.enums[a]=n}}return t.getName()&&(e.name=t.getName()),t.getDescription()&&(e.description=t.getDescription()),t.getVersion()&&(e.version=t.getVersion()),e}function dy(t){let e={},s=t.listPropertyKeys();if(s.length>0){e.properties={};for(let r of s){let a=t.getProperty(r);e.properties[r]=uy(a)}}return t.getName()&&(e.name=t.getName()),t.getDescription()&&(e.description=t.getDescription()),e}function uy(t){let e={type:t.getType()};return t.getArray()&&(e.array=t.getArray()),t.getNormalized()&&(e.normalized=t.getNormalized()),t.getRequired()&&(e.required=t.getRequired()),t.getName()&&(e.name=t.getName()),t.getDescription()&&(e.description=t.getDescription()),t.getComponentType()!=null&&(e.componentType=t.getComponentType()),t.getEnumType()!=null&&(e.enumType=t.getEnumType()),t.getCount()!=null&&(e.count=t.getCount()),t.getOffset()!=null&&(e.offset=t.getOffset()),t.getScale()!=null&&(e.scale=t.getScale()),t.getMax()!=null&&(e.max=t.getMax()),t.getMin()!=null&&(e.min=t.getMin()),t.getNoData()!=null&&(e.noData=t.getNoData()),t.getDefault()!=null&&(e.default=t.getDefault()),e}function fy(t){let e={values:t.listValues().map(hy)};return t.getName()&&(e.name=t.getName()),t.getDescription()&&(e.description=t.getDescription()),t.getValueType()!=="UINT16"&&(e.valueType=t.getValueType()),e}function hy(t){let e={name:t.getName(),value:t.getValue()};return t.getDescription()&&(e.description=t.getDescription()),e}function py(t,e){let s={class:e.getClass(),count:e.getCount()};e.getName()&&(s.name=e.getName());let r=e.listPropertyKeys();if(r.length>0){s.properties={};for(let a of r){let n=by(t,e.getProperty(a));s.properties[a]=n}}return s}function by(t,e){let s=e.getValues(),r={values:t.otherBufferViewsIndexMap.get(s)};if(e.getArrayOffsets()){let a=e.getArrayOffsets();r.arrayOffsets=t.otherBufferViewsIndexMap.get(a)}if(e.getStringOffsets()){let a=e.getStringOffsets();r.stringOffsets=t.otherBufferViewsIndexMap.get(a)}return e.getArrayOffsetType()!=null&&(r.arrayOffsetType=e.getArrayOffsetType()),e.getStringOffsetType()!=null&&(r.stringOffsetType=e.getStringOffsetType()),e.getOffset()!=null&&(r.offset=e.getOffset()),e.getScale()!=null&&(r.scale=e.getScale()),e.getMax()!=null&&(r.max=e.getMax()),e.getMin()!=null&&(r.min=e.getMin()),r}function gy(t){let e={class:t.getClass()};t.getName()&&(e.name=t.getName());let s=t.listPropertyKeys();if(s.length>0){e.properties={};for(let r of s){let a=my(t.getProperty(r));e.properties[r]=a}}return e}function my(t){let e={attribute:t.getAttribute()};return t.getOffset()!=null&&(e.offset=t.getOffset()),t.getScale()!=null&&(e.scale=t.getScale()),t.getMax()!=null&&(e.max=t.getMax()),t.getMin()!=null&&(e.min=t.getMin()),e}function yy(t,e){let s={class:e.getClass()};e.getName()&&(s.name=e.getName());let r=e.listPropertyKeys();if(r.length>0){s.properties={};for(let a of r){let n=wy(t,e.getProperty(a));s.properties[a]=n}}return s}function wy(t,e){let s=e.getTexture(),r=e.getTextureInfo(),a=e.getChannels(),n=t.createTextureInfoDef(s,r);return he.eq(a,[0])||(n.channels=a),e.getOffset()!=null&&(n.offset=e.getOffset()),e.getScale()!=null&&(n.scale=e.getScale()),e.getMax()!=null&&(n.max=e.getMax()),e.getMin()!=null&&(n.min=e.getMin()),n}function fi(t,e){let s=t.jsonDoc,r=s.json.buffers||[],a=(s.json.bufferViews||[])[e],n=r[a.buffer],i=n.uri?s.resources[n.uri]:s.resources[Nt],o=a.byteOffset||0,c=a.byteLength;return i.slice(o,o+c)}function vy(t,e){let s=t.getRoot().listBuffers()[0],r=e.otherBufferViews.get(s);return r||(r=[],e.otherBufferViews.set(s,r)),r}var xy=class{match(t){return t.length>=12&&$.decodeText(t.slice(4,12))==="ftypavif"}getSize(t){if(!this.match(t))return null;let e=new DataView(t.buffer,t.byteOffset,t.byteLength),s=Fl(e,0);if(!s)return null;let r=s.end;for(;s=Fl(e,r);)if(s.type==="meta")r=s.start+4;else if(s.type==="iprp"||s.type==="ipco")r=s.start;else{if(s.type==="ispe")return[e.getUint32(s.start+4),e.getUint32(s.start+8)];if(s.type==="mdat")break;r=s.end}return null}getChannels(t){return 4}},ky=class extends ie{extensionName=ga;prereadTypes=[j.TEXTURE];static EXTENSION_NAME=ga;static register(){dt.registerFormat("image/avif",new xy)}preread(t){return(t.jsonDoc.json.textures||[]).forEach(e=>{e.extensions&&e.extensions.EXT_texture_avif&&(e.source=e.extensions[ga].source)}),this}read(t){return this}write(t){let e=t.jsonDoc;return this.document.getRoot().listTextures().forEach(s=>{if(s.getMimeType()==="image/avif"){let r=t.imageIndexMap.get(s);(e.json.textures||[]).forEach(a=>{a.source===r&&(a.extensions=a.extensions||{},a.extensions[ga]={source:a.source},delete a.source)})}}),this}};function Fl(t,e){if(t.byteLength<4+e)return null;let s=t.getUint32(e);return t.byteLength<s+e||s<8?null:{type:$.decodeText(new Uint8Array(t.buffer,t.byteOffset+e+4,4)),start:e+8,end:e+s}}var Ey=class{match(t){return t.length>=12&&t[8]===87&&t[9]===69&&t[10]===66&&t[11]===80}getSize(t){let e=$.decodeText(t.slice(0,4)),s=$.decodeText(t.slice(8,12));if(e!=="RIFF"||s!=="WEBP")return null;let r=new DataView(t.buffer,t.byteOffset),a=12;for(;a<r.byteLength;){let n=$.decodeText(new Uint8Array([r.getUint8(a),r.getUint8(a+1),r.getUint8(a+2),r.getUint8(a+3)])),i=r.getUint32(a+4,!0);if(n==="VP8 ")return[r.getInt16(a+14,!0)&16383,r.getInt16(a+16,!0)&16383];if(n==="VP8L"){let o=r.getUint8(a+9),c=r.getUint8(a+10),l=r.getUint8(a+11),u=r.getUint8(a+12);return[1+((c&63)<<8|o),1+((u&15)<<10|l<<2|(c&192)>>6)]}a+=8+i+i%2}return null}getChannels(t){return 4}},My=class extends ie{extensionName=ba;prereadTypes=[j.TEXTURE];static EXTENSION_NAME=ba;static register(){dt.registerFormat("image/webp",new Ey)}preread(t){return(t.jsonDoc.json.textures||[]).forEach(e=>{e.extensions&&e.extensions.EXT_texture_webp&&(e.source=e.extensions[ba].source)}),this}read(t){return this}write(t){let e=t.jsonDoc;return this.document.getRoot().listTextures().forEach(s=>{if(s.getMimeType()==="image/webp"){let r=t.imageIndexMap.get(s);(e.json.textures||[]).forEach(a=>{a.source===r&&(a.extensions=a.extensions||{},a.extensions[ba]={source:a.source},delete a.source)})}}),this}},Pl=bm,Sy=class extends ie{extensionName=Pl;static EXTENSION_NAME=Pl;read(t){return this}write(t){return this}},jl=gm,Ty=class extends ie{extensionName=jl;static EXTENSION_NAME=jl;read(t){return this}write(t){return this}},Se,Jl,Ql;function Ay(t,e){let s=new Se.DecoderBuffer;try{if(s.Init(e,e.length),t.GetEncodedGeometryType(s)!==Se.TRIANGULAR_MESH)throw new Error(`[${we}] Unknown geometry type.`);let r=new Se.Mesh;if(!t.DecodeBufferToMesh(s,r).ok()||r.ptr===0)throw new Error(`[${we}] Decoding failure.`);return r}finally{Se.destroy(s)}}function _y(t,e){let s=e.num_faces()*3,r,a;if(e.num_points()<=65534){let n=s*Uint16Array.BYTES_PER_ELEMENT;r=Se._malloc(n),t.GetTrianglesUInt16Array(e,n,r),a=new Uint16Array(Se.HEAPU16.buffer,r,s).slice()}else{let n=s*Uint32Array.BYTES_PER_ELEMENT;r=Se._malloc(n),t.GetTrianglesUInt32Array(e,n,r),a=new Uint32Array(Se.HEAPU32.buffer,r,s).slice()}return Se._free(r),a}function Iy(t,e,s,r){let a=Ql[r.componentType],n=Jl[r.componentType],i=s.num_components(),o=e.num_points()*i,c=o*n.BYTES_PER_ELEMENT,l=Se._malloc(c);t.GetAttributeDataArrayForAllPoints(e,s,a,c,l);let u=new n(Se.HEAPF32.buffer,l,o).slice();return Se._free(l),u}function Ry(t){Se=t,Jl={[W.ComponentType.FLOAT]:Float32Array,[W.ComponentType.UNSIGNED_INT]:Uint32Array,[W.ComponentType.UNSIGNED_SHORT]:Uint16Array,[W.ComponentType.UNSIGNED_BYTE]:Uint8Array,[W.ComponentType.SHORT]:Int16Array,[W.ComponentType.BYTE]:Int8Array},Ql={[W.ComponentType.FLOAT]:Se.DT_FLOAT32,[W.ComponentType.UNSIGNED_INT]:Se.DT_UINT32,[W.ComponentType.UNSIGNED_SHORT]:Se.DT_UINT16,[W.ComponentType.UNSIGNED_BYTE]:Se.DT_UINT8,[W.ComponentType.SHORT]:Se.DT_INT16,[W.ComponentType.BYTE]:Se.DT_INT8}}var Je,Ny=(function(t){return t[t.EDGEBREAKER=1]="EDGEBREAKER",t[t.SEQUENTIAL=0]="SEQUENTIAL",t})({}),Zl={POSITION:14,NORMAL:10,COLOR:8,TEX_COORD:12,GENERIC:12},Ll={decodeSpeed:5,encodeSpeed:5,method:1,quantizationBits:Zl,quantizationVolume:"mesh"};function By(t){Je=t}function Cy(t,e=Ll){let s={...Ll,...e};s.quantizationBits={...Zl,...e.quantizationBits};let r=new Je.MeshBuilder,a=new Je.Mesh,n=new Je.ExpertEncoder(a),i={},o=new Je.DracoInt8Array,c=t.listTargets().length>0,l=!1;for(let d of t.listSemantics()){let m=t.getAttribute(d);if(m.getSparse()){l=!0;continue}let h=Oy(d),y=Fy(r,m.getComponentType(),a,Je[h],m.getCount(),m.getElementSize(),m.getArray());if(y===-1)throw new Error(`Error compressing "${d}" attribute.`);if(i[d]=y,s.quantizationVolume==="mesh"||d!=="POSITION")n.SetAttributeQuantization(y,s.quantizationBits[h]);else if(typeof s.quantizationVolume=="object"){let{quantizationVolume:w}=s,v=Math.max(w.max[0]-w.min[0],w.max[1]-w.min[1],w.max[2]-w.min[2]);n.SetAttributeExplicitQuantization(y,s.quantizationBits[h],m.getElementSize(),w.min,v)}else throw new Error("Invalid quantization volume state.")}let u=t.getIndices();if(!u)throw new gi("Primitive must have indices.");r.AddFacesToMesh(a,u.getCount()/3,u.getArray()),n.SetSpeedOptions(s.encodeSpeed,s.decodeSpeed),n.SetTrackEncodedProperties(!0),s.method===0||c||l?n.SetEncodingMethod(Je.MESH_SEQUENTIAL_ENCODING):n.SetEncodingMethod(Je.MESH_EDGEBREAKER_ENCODING);let f=n.EncodeToDracoBuffer(!(c||l),o);if(f<=0)throw new gi("Error applying Draco compression.");let b=new Uint8Array(f);for(let d=0;d<f;++d)b[d]=o.GetValue(d);let g=n.GetNumberOfEncodedPoints(),p=n.GetNumberOfEncodedFaces()*3;return Je.destroy(o),Je.destroy(a),Je.destroy(r),Je.destroy(n),{numVertices:g,numIndices:p,data:b,attributeIDs:i}}function Oy(t){return t==="POSITION"?"POSITION":t==="NORMAL"?"NORMAL":t.startsWith("COLOR_")?"COLOR":t.startsWith("TEXCOORD_")?"TEX_COORD":"GENERIC"}function Fy(t,e,s,r,a,n,i){switch(e){case W.ComponentType.UNSIGNED_BYTE:return t.AddUInt8Attribute(s,r,a,n,i);case W.ComponentType.BYTE:return t.AddInt8Attribute(s,r,a,n,i);case W.ComponentType.UNSIGNED_SHORT:return t.AddUInt16Attribute(s,r,a,n,i);case W.ComponentType.SHORT:return t.AddInt16Attribute(s,r,a,n,i);case W.ComponentType.UNSIGNED_INT:return t.AddUInt32Attribute(s,r,a,n,i);case W.ComponentType.FLOAT:return t.AddFloatAttribute(s,r,a,n,i);default:throw new Error(`Unexpected component type, "${e}".`)}}var gi=class extends Error{},Py=class extends ie{extensionName=we;prereadTypes=[j.PRIMITIVE];prewriteTypes=[j.ACCESSOR];readDependencies=["draco3d.decoder"];writeDependencies=["draco3d.encoder"];static EXTENSION_NAME=we;static EncoderMethod=Ny;_decoderModule=null;_encoderModule=null;_encoderOptions={};install(t,e){return t==="draco3d.decoder"&&(this._decoderModule=e,Ry(this._decoderModule)),t==="draco3d.encoder"&&(this._encoderModule=e,By(this._encoderModule)),this}setEncoderOptions(t){return this._encoderOptions=t,this}preread(t){if(!this._decoderModule)throw new Error(`[${we}] Please install extension dependency, "draco3d.decoder".`);let e=this.document.getLogger(),s=t.jsonDoc,r=new Map;try{let a=s.json.meshes||[];for(let n of a)for(let i of n.primitives){if(!i.extensions||!i.extensions.KHR_draco_mesh_compression)continue;let o=i.extensions[we],[c,l]=r.get(o.bufferView)||[];if(!l||!c){let u=s.json.bufferViews[o.bufferView],f=s.json.buffers[u.buffer],b=f.uri?s.resources[f.uri]:s.resources[Nt],g=u.byteOffset||0,p=u.byteLength,d=$.toView(b,g,p);c=new this._decoderModule.Decoder,l=Ay(c,d),r.set(o.bufferView,[c,l]),e.debug(`[${we}] Decompressed ${d.byteLength} bytes.`)}for(let u in o.attributes){let f=t.jsonDoc.json.accessors[i.attributes[u]],b=c.GetAttributeByUniqueId(l,o.attributes[u]),g=Iy(c,l,b,f);t.accessors[i.attributes[u]].setArray(g)}i.indices!==void 0&&t.accessors[i.indices].setArray(_y(c,l))}}finally{for(let[a,n]of Array.from(r.values()))this._decoderModule.destroy(a),this._decoderModule.destroy(n)}return this}read(t){return this}prewrite(t,e){if(!this._encoderModule)throw new Error(`[${we}] Please install extension dependency, "draco3d.encoder".`);let s=this.document.getLogger();s.debug(`[${we}] Compression options: ${JSON.stringify(this._encoderOptions)}`);let r=jy(this.document),a=new Map,n="mesh";this._encoderOptions.quantizationVolume==="scene"&&(this.document.getRoot().listScenes().length!==1?s.warn(`[${we}]: quantizationVolume=scene requires exactly 1 scene.`):n=ul(this.document.getRoot().listScenes().pop()));for(let i of Array.from(r.keys())){let o=r.get(i);if(!o)throw new Error("Unexpected primitive.");if(a.has(o)){a.set(o,a.get(o));continue}let c=i.getIndices(),l=t.jsonDoc.json.accessors,u;try{u=Cy(i,{...this._encoderOptions,quantizationVolume:n})}catch(g){if(g instanceof gi){s.warn(`[${we}]: ${g.message} Skipping primitive compression.`);continue}throw g}a.set(o,u);let f=t.createAccessorDef(c);f.count=u.numIndices,t.accessorIndexMap.set(c,l.length),l.push(f),u.numVertices>65534&&W.getComponentSize(f.componentType)<=2?f.componentType=W.ComponentType.UNSIGNED_INT:u.numVertices>254&&W.getComponentSize(f.componentType)<=1&&(f.componentType=W.ComponentType.UNSIGNED_SHORT);for(let g of i.listSemantics()){let p=i.getAttribute(g);if(u.attributeIDs[g]===void 0)continue;let d=t.createAccessorDef(p);d.count=u.numVertices,t.accessorIndexMap.set(p,l.length),l.push(d)}let b=i.getAttribute("POSITION").getBuffer()||this.document.getRoot().listBuffers()[0];t.otherBufferViews.has(b)||t.otherBufferViews.set(b,[]),t.otherBufferViews.get(b).push(u.data)}return s.debug(`[${we}] Compressed ${r.size} primitives.`),t.extensionData[we]={primitiveHashMap:r,primitiveEncodingMap:a},this}write(t){let e=t.extensionData[we];for(let s of this.document.getRoot().listMeshes()){let r=t.jsonDoc.json.meshes[t.meshIndexMap.get(s)];for(let a=0;a<s.listPrimitives().length;a++){let n=s.listPrimitives()[a],i=r.primitives[a],o=e.primitiveHashMap.get(n);if(!o)continue;let c=e.primitiveEncodingMap.get(o);c&&(i.extensions=i.extensions||{},i.extensions[we]={bufferView:t.otherBufferViewsIndexMap.get(c.data),attributes:c.attributeIDs})}}if(!e.primitiveHashMap.size){let s=t.jsonDoc.json;s.extensionsUsed=(s.extensionsUsed||[]).filter(r=>r!==we),s.extensionsRequired=(s.extensionsRequired||[]).filter(r=>r!==we)}return this}};function jy(t){let e=t.getLogger(),s=new Set,r=new Set,a=0,n=0;for(let f of t.getRoot().listMeshes())for(let b of f.listPrimitives())b.getIndices()?b.getMode()!==tr.Mode.TRIANGLES?(r.add(b),n++):s.add(b):(r.add(b),a++);a>0&&e.warn(`[${we}] Skipping Draco compression of ${a} non-indexed primitives.`),n>0&&e.warn(`[${we}] Skipping Draco compression of ${n} non-TRIANGLES primitives.`);let i=t.getRoot().listAccessors(),o=new Map;for(let f=0;f<i.length;f++)o.set(i[f],f);let c=new Map,l=new Set,u=new Map;for(let f of Array.from(s)){let b=Dl(f,o);if(l.has(b)){u.set(f,b);continue}if(c.has(f.getIndices())){let g=f.getIndices(),p=g.clone();o.set(p,t.getRoot().listAccessors().length-1),f.swap(g,p)}for(let g of f.listAttributes())if(c.has(g)){let p=g.clone();o.set(p,t.getRoot().listAccessors().length-1),f.swap(g,p)}b=Dl(f,o),l.add(b),u.set(f,b),c.set(f.getIndices(),b);for(let g of f.listAttributes())c.set(g,b)}for(let f of Array.from(c.keys())){let b=new Set(f.listParents().map(g=>g.propertyType));if(b.size!==2||!b.has(j.PRIMITIVE)||!b.has(j.ROOT))throw new Error(`[${we}] Compressed accessors must only be used as indices or vertex attributes.`)}for(let f of Array.from(s)){let b=u.get(f),g=f.getIndices();if(c.get(g)!==b||f.listAttributes().some(p=>c.get(p)!==b))throw new Error(`[${we}] Draco primitives must share all, or no, accessors.`)}for(let f of Array.from(r)){let b=f.getIndices();if(c.has(b)||f.listAttributes().some(g=>c.has(g)))throw new Error(`[${we}] Accessor cannot be shared by compressed and uncompressed primitives.`)}return u}function Dl(t,e){let s=[],r=t.getIndices();s.push(e.get(r));for(let a of t.listAttributes())s.push(e.get(a));return s.sort().join("|")}var Ul=class ed extends J{static EXTENSION_NAME=yt;static Type={POINT:"point",SPOT:"spot",DIRECTIONAL:"directional"};init(){this.extensionName=yt,this.propertyType="Light",this.parentTypes=[j.NODE]}getDefaults(){return Object.assign(super.getDefaults(),{color:[1,1,1],intensity:1,type:ed.Type.POINT,range:null,innerConeAngle:0,outerConeAngle:Math.PI/4})}getColor(){return this.get("color")}setColor(e){return this.set("color",e)}getIntensity(){return this.get("intensity")}setIntensity(e){return this.set("intensity",e)}getType(){return this.get("type")}setType(e){return this.set("type",e)}getRange(){return this.get("range")}setRange(e){return this.set("range",e)}getInnerConeAngle(){return this.get("innerConeAngle")}setInnerConeAngle(e){return this.set("innerConeAngle",e)}getOuterConeAngle(){return this.get("outerConeAngle")}setOuterConeAngle(e){return this.set("outerConeAngle",e)}},Ly=class extends ie{extensionName=yt;static EXTENSION_NAME=yt;createLight(t=""){return new Ul(this.document.getGraph(),t)}read(t){let e=t.jsonDoc;if(!e.json.extensions||!e.json.extensions.KHR_lights_punctual)return this;let s=(e.json.extensions.KHR_lights_punctual.lights||[]).map(r=>{let a=this.createLight().setName(r.name||"").setType(r.type);return r.extras&&a.setExtras(r.extras),r.color!==void 0&&a.setColor(r.color),r.intensity!==void 0&&a.setIntensity(r.intensity),r.range!==void 0&&a.setRange(r.range),r.spot?.innerConeAngle!==void 0&&a.setInnerConeAngle(r.spot.innerConeAngle),r.spot?.outerConeAngle!==void 0&&a.setOuterConeAngle(r.spot.outerConeAngle),a});return e.json.nodes.forEach((r,a)=>{if(!r.extensions||!r.extensions.KHR_lights_punctual)return;let n=r.extensions[yt];t.nodes[a].setExtension(yt,s[n.light])}),this}write(t){let e=t.jsonDoc;if(this.properties.size===0)return this;let s=[],r=new Map;for(let a of this.properties){let n=a,i=t.createPropertyDef(a);i.type=n.getType(),he.eq(n.getColor(),[1,1,1])||(i.color=n.getColor()),n.getIntensity()!==1&&(i.intensity=n.getIntensity()),n.getRange()!=null&&(i.range=n.getRange()),n.getName()&&(i.name=n.getName()),n.getType()===Ul.Type.SPOT&&(i.spot={innerConeAngle:n.getInnerConeAngle(),outerConeAngle:n.getOuterConeAngle()}),s.push(i),r.set(n,s.length-1)}return this.document.getRoot().listNodes().forEach(a=>{let n=a.getExtension(yt);if(n){let i=t.nodeIndexMap.get(a),o=e.json.nodes[i];o.extensions=o.extensions||{},o.extensions[yt]={light:r.get(n)}}}),e.json.extensions=e.json.extensions||{},e.json.extensions[yt]={lights:s},this}},{R:Dy,G:Uy,B:zy}=rt,Gy=class extends J{static EXTENSION_NAME=Ot;init(){this.extensionName=Ot,this.propertyType="Anisotropy",this.parentTypes=[j.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{anisotropyStrength:0,anisotropyRotation:0,anisotropyTexture:null,anisotropyTextureInfo:new ue(this.graph,"anisotropyTextureInfo")})}getAnisotropyStrength(){return this.get("anisotropyStrength")}setAnisotropyStrength(t){return this.set("anisotropyStrength",t)}getAnisotropyRotation(){return this.get("anisotropyRotation")}setAnisotropyRotation(t){return this.set("anisotropyRotation",t)}getAnisotropyTexture(){return this.getRef("anisotropyTexture")}getAnisotropyTextureInfo(){return this.getRef("anisotropyTexture")?this.getRef("anisotropyTextureInfo"):null}setAnisotropyTexture(t){return this.setRef("anisotropyTexture",t,{channels:Dy|Uy|zy})}},Ky=class extends ie{static EXTENSION_NAME=Ot;extensionName=Ot;prereadTypes=[j.MESH];prewriteTypes=[j.MESH];createAnisotropy(){return new Gy(this.document.getGraph())}read(t){return this}write(t){return this}preread(t){let e=t.jsonDoc,s=e.json.materials||[],r=e.json.textures||[];return s.forEach((a,n)=>{if(a.extensions&&a.extensions.KHR_materials_anisotropy){let i=this.createAnisotropy();t.materials[n].setExtension(Ot,i);let o=a.extensions[Ot];if(o.extras&&i.setExtras(o.extras),o.anisotropyStrength!==void 0&&i.setAnisotropyStrength(o.anisotropyStrength),o.anisotropyRotation!==void 0&&i.setAnisotropyRotation(o.anisotropyRotation),o.anisotropyTexture!==void 0){let c=o.anisotropyTexture,l=t.textures[r[c.index].source];i.setAnisotropyTexture(l),t.setTextureInfo(i.getAnisotropyTextureInfo(),c)}}}),this}prewrite(t){let e=t.jsonDoc;return this.document.getRoot().listMaterials().forEach(s=>{let r=s.getExtension(Ot);if(r){let a=t.materialIndexMap.get(s),n=e.json.materials[a],i=t.createPropertyDef(r);if(n.extensions=n.extensions||{},n.extensions[Ot]=i,r.getAnisotropyStrength()>0&&(i.anisotropyStrength=r.getAnisotropyStrength()),r.getAnisotropyRotation()!==0&&(i.anisotropyRotation=r.getAnisotropyRotation()),r.getAnisotropyTexture()){let o=r.getAnisotropyTexture(),c=r.getAnisotropyTextureInfo();i.anisotropyTexture=t.createTextureInfoDef(o,c)}}}),this}},{R:zl,G:Gl,B:Vy}=rt,Hy=class extends J{static EXTENSION_NAME=Ft;init(){this.extensionName=Ft,this.propertyType="Clearcoat",this.parentTypes=[j.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{clearcoatFactor:0,clearcoatTexture:null,clearcoatTextureInfo:new ue(this.graph,"clearcoatTextureInfo"),clearcoatRoughnessFactor:0,clearcoatRoughnessTexture:null,clearcoatRoughnessTextureInfo:new ue(this.graph,"clearcoatRoughnessTextureInfo"),clearcoatNormalScale:1,clearcoatNormalTexture:null,clearcoatNormalTextureInfo:new ue(this.graph,"clearcoatNormalTextureInfo")})}getClearcoatFactor(){return this.get("clearcoatFactor")}setClearcoatFactor(t){return this.set("clearcoatFactor",t)}getClearcoatTexture(){return this.getRef("clearcoatTexture")}getClearcoatTextureInfo(){return this.getRef("clearcoatTexture")?this.getRef("clearcoatTextureInfo"):null}setClearcoatTexture(t){return this.setRef("clearcoatTexture",t,{channels:zl})}getClearcoatRoughnessFactor(){return this.get("clearcoatRoughnessFactor")}setClearcoatRoughnessFactor(t){return this.set("clearcoatRoughnessFactor",t)}getClearcoatRoughnessTexture(){return this.getRef("clearcoatRoughnessTexture")}getClearcoatRoughnessTextureInfo(){return this.getRef("clearcoatRoughnessTexture")?this.getRef("clearcoatRoughnessTextureInfo"):null}setClearcoatRoughnessTexture(t){return this.setRef("clearcoatRoughnessTexture",t,{channels:Gl})}getClearcoatNormalScale(){return this.get("clearcoatNormalScale")}setClearcoatNormalScale(t){return this.set("clearcoatNormalScale",t)}getClearcoatNormalTexture(){return this.getRef("clearcoatNormalTexture")}getClearcoatNormalTextureInfo(){return this.getRef("clearcoatNormalTexture")?this.getRef("clearcoatNormalTextureInfo"):null}setClearcoatNormalTexture(t){return this.setRef("clearcoatNormalTexture",t,{channels:zl|Gl|Vy})}},qy=class extends ie{static EXTENSION_NAME=Ft;extensionName=Ft;prereadTypes=[j.MESH];prewriteTypes=[j.MESH];createClearcoat(){return new Hy(this.document.getGraph())}read(t){return this}write(t){return this}preread(t){let e=t.jsonDoc,s=e.json.materials||[],r=e.json.textures||[];return s.forEach((a,n)=>{if(a.extensions&&a.extensions.KHR_materials_clearcoat){let i=this.createClearcoat();t.materials[n].setExtension(Ft,i);let o=a.extensions[Ft];if(o.extras&&i.setExtras(o.extras),o.clearcoatFactor!==void 0&&i.setClearcoatFactor(o.clearcoatFactor),o.clearcoatRoughnessFactor!==void 0&&i.setClearcoatRoughnessFactor(o.clearcoatRoughnessFactor),o.clearcoatTexture!==void 0){let c=o.clearcoatTexture,l=t.textures[r[c.index].source];i.setClearcoatTexture(l),t.setTextureInfo(i.getClearcoatTextureInfo(),c)}if(o.clearcoatRoughnessTexture!==void 0){let c=o.clearcoatRoughnessTexture,l=t.textures[r[c.index].source];i.setClearcoatRoughnessTexture(l),t.setTextureInfo(i.getClearcoatRoughnessTextureInfo(),c)}if(o.clearcoatNormalTexture!==void 0){let c=o.clearcoatNormalTexture,l=t.textures[r[c.index].source];i.setClearcoatNormalTexture(l),t.setTextureInfo(i.getClearcoatNormalTextureInfo(),c),c.scale!==void 0&&i.setClearcoatNormalScale(c.scale)}}}),this}prewrite(t){let e=t.jsonDoc;return this.document.getRoot().listMaterials().forEach(s=>{let r=s.getExtension(Ft);if(r){let a=t.materialIndexMap.get(s),n=e.json.materials[a],i=t.createPropertyDef(r);if(n.extensions=n.extensions||{},n.extensions[Ft]=i,i.clearcoatFactor=r.getClearcoatFactor(),i.clearcoatRoughnessFactor=r.getClearcoatRoughnessFactor(),r.getClearcoatTexture()){let o=r.getClearcoatTexture(),c=r.getClearcoatTextureInfo();i.clearcoatTexture=t.createTextureInfoDef(o,c)}if(r.getClearcoatRoughnessTexture()){let o=r.getClearcoatRoughnessTexture(),c=r.getClearcoatRoughnessTextureInfo();i.clearcoatRoughnessTexture=t.createTextureInfoDef(o,c)}if(r.getClearcoatNormalTexture()){let o=r.getClearcoatNormalTexture(),c=r.getClearcoatNormalTextureInfo();i.clearcoatNormalTexture=t.createTextureInfoDef(o,c),r.getClearcoatNormalScale()!==1&&(i.clearcoatNormalTexture.scale=r.getClearcoatNormalScale())}}}),this}},{R:Wy,G:Xy,B:$y,A:Yy}=rt,Jy=class extends J{static EXTENSION_NAME=Pt;init(){this.extensionName=Pt,this.propertyType="DiffuseTransmission",this.parentTypes=[j.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{diffuseTransmissionFactor:0,diffuseTransmissionTexture:null,diffuseTransmissionTextureInfo:new ue(this.graph,"diffuseTransmissionTextureInfo"),diffuseTransmissionColorFactor:[1,1,1],diffuseTransmissionColorTexture:null,diffuseTransmissionColorTextureInfo:new ue(this.graph,"diffuseTransmissionColorTextureInfo")})}getDiffuseTransmissionFactor(){return this.get("diffuseTransmissionFactor")}setDiffuseTransmissionFactor(t){return this.set("diffuseTransmissionFactor",t)}getDiffuseTransmissionTexture(){return this.getRef("diffuseTransmissionTexture")}getDiffuseTransmissionTextureInfo(){return this.getRef("diffuseTransmissionTexture")?this.getRef("diffuseTransmissionTextureInfo"):null}setDiffuseTransmissionTexture(t){return this.setRef("diffuseTransmissionTexture",t,{channels:Yy})}getDiffuseTransmissionColorFactor(){return this.get("diffuseTransmissionColorFactor")}setDiffuseTransmissionColorFactor(t){return this.set("diffuseTransmissionColorFactor",t)}getDiffuseTransmissionColorTexture(){return this.getRef("diffuseTransmissionColorTexture")}getDiffuseTransmissionColorTextureInfo(){return this.getRef("diffuseTransmissionColorTexture")?this.getRef("diffuseTransmissionColorTextureInfo"):null}setDiffuseTransmissionColorTexture(t){return this.setRef("diffuseTransmissionColorTexture",t,{channels:Wy|Xy|$y})}},Qy=class extends ie{extensionName=Pt;static EXTENSION_NAME=Pt;createDiffuseTransmission(){return new Jy(this.document.getGraph())}read(t){let e=t.jsonDoc,s=e.json.materials||[],r=e.json.textures||[];return s.forEach((a,n)=>{if(a.extensions&&a.extensions.KHR_materials_diffuse_transmission){let i=this.createDiffuseTransmission();t.materials[n].setExtension(Pt,i);let o=a.extensions[Pt];if(o.extras&&i.setExtras(o.extras),o.diffuseTransmissionFactor!==void 0&&i.setDiffuseTransmissionFactor(o.diffuseTransmissionFactor),o.diffuseTransmissionColorFactor!==void 0&&i.setDiffuseTransmissionColorFactor(o.diffuseTransmissionColorFactor),o.diffuseTransmissionTexture!==void 0){let c=o.diffuseTransmissionTexture,l=t.textures[r[c.index].source];i.setDiffuseTransmissionTexture(l),t.setTextureInfo(i.getDiffuseTransmissionTextureInfo(),c)}if(o.diffuseTransmissionColorTexture!==void 0){let c=o.diffuseTransmissionColorTexture,l=t.textures[r[c.index].source];i.setDiffuseTransmissionColorTexture(l),t.setTextureInfo(i.getDiffuseTransmissionColorTextureInfo(),c)}}}),this}write(t){let e=t.jsonDoc;for(let s of this.document.getRoot().listMaterials()){let r=s.getExtension(Pt);if(!r)continue;let a=t.materialIndexMap.get(s),n=e.json.materials[a],i=t.createPropertyDef(r);if(n.extensions=n.extensions||{},n.extensions[Pt]=i,i.diffuseTransmissionFactor=r.getDiffuseTransmissionFactor(),i.diffuseTransmissionColorFactor=r.getDiffuseTransmissionColorFactor(),r.getDiffuseTransmissionTexture()){let o=r.getDiffuseTransmissionTexture(),c=r.getDiffuseTransmissionTextureInfo();i.diffuseTransmissionTexture=t.createTextureInfoDef(o,c)}if(r.getDiffuseTransmissionColorTexture()){let o=r.getDiffuseTransmissionColorTexture(),c=r.getDiffuseTransmissionColorTextureInfo();i.diffuseTransmissionColorTexture=t.createTextureInfoDef(o,c)}}return this}},Zy=class extends J{static EXTENSION_NAME=jt;init(){this.extensionName=jt,this.propertyType="Dispersion",this.parentTypes=[j.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{dispersion:0})}getDispersion(){return this.get("dispersion")}setDispersion(t){return this.set("dispersion",t)}},e0=class extends ie{static EXTENSION_NAME=jt;extensionName=jt;prereadTypes=[j.MESH];prewriteTypes=[j.MESH];createDispersion(){return new Zy(this.document.getGraph())}read(t){return this}write(t){return this}preread(t){return(t.jsonDoc.json.materials||[]).forEach((e,s)=>{if(e.extensions&&e.extensions.KHR_materials_dispersion){let r=this.createDispersion();t.materials[s].setExtension(jt,r);let a=e.extensions[jt];a.extras&&r.setExtras(a.extras),a.dispersion!==void 0&&r.setDispersion(a.dispersion)}}),this}prewrite(t){let e=t.jsonDoc;return this.document.getRoot().listMaterials().forEach(s=>{let r=s.getExtension(jt);if(r){let a=t.materialIndexMap.get(s),n=e.json.materials[a],i=t.createPropertyDef(r);n.extensions=n.extensions||{},n.extensions[jt]=i,i.dispersion=r.getDispersion()}}),this}},t0=class extends J{static EXTENSION_NAME=Lt;init(){this.extensionName=Lt,this.propertyType="EmissiveStrength",this.parentTypes=[j.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{emissiveStrength:1})}getEmissiveStrength(){return this.get("emissiveStrength")}setEmissiveStrength(t){return this.set("emissiveStrength",t)}},s0=class extends ie{static EXTENSION_NAME=Lt;extensionName=Lt;prereadTypes=[j.MESH];prewriteTypes=[j.MESH];createEmissiveStrength(){return new t0(this.document.getGraph())}read(t){return this}write(t){return this}preread(t){return(t.jsonDoc.json.materials||[]).forEach((e,s)=>{if(e.extensions&&e.extensions.KHR_materials_emissive_strength){let r=this.createEmissiveStrength();t.materials[s].setExtension(Lt,r);let a=e.extensions[Lt];a.extras&&r.setExtras(a.extras),a.emissiveStrength!==void 0&&r.setEmissiveStrength(a.emissiveStrength)}}),this}prewrite(t){let e=t.jsonDoc;return this.document.getRoot().listMaterials().forEach(s=>{let r=s.getExtension(Lt);if(r){let a=t.materialIndexMap.get(s),n=e.json.materials[a],i=t.createPropertyDef(r);n.extensions=n.extensions||{},n.extensions[Lt]=i,i.emissiveStrength=r.getEmissiveStrength()}}),this}},r0=class extends J{static EXTENSION_NAME=Dt;init(){this.extensionName=Dt,this.propertyType="IOR",this.parentTypes=[j.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{ior:1.5})}getIOR(){return this.get("ior")}setIOR(t){return this.set("ior",t)}},a0=class extends ie{static EXTENSION_NAME=Dt;extensionName=Dt;prereadTypes=[j.MESH];prewriteTypes=[j.MESH];createIOR(){return new r0(this.document.getGraph())}read(t){return this}write(t){return this}preread(t){return(t.jsonDoc.json.materials||[]).forEach((e,s)=>{if(e.extensions&&e.extensions.KHR_materials_ior){let r=this.createIOR();t.materials[s].setExtension(Dt,r);let a=e.extensions[Dt];a.extras&&r.setExtras(a.extras),a.ior!==void 0&&r.setIOR(a.ior)}}),this}prewrite(t){let e=t.jsonDoc;return this.document.getRoot().listMaterials().forEach(s=>{let r=s.getExtension(Dt);if(r){let a=t.materialIndexMap.get(s),n=e.json.materials[a],i=t.createPropertyDef(r);n.extensions=n.extensions||{},n.extensions[Dt]=i,i.ior=r.getIOR()}}),this}},{R:n0,G:i0}=rt,o0=class extends J{static EXTENSION_NAME=Ut;init(){this.extensionName=Ut,this.propertyType="Iridescence",this.parentTypes=[j.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{iridescenceFactor:0,iridescenceTexture:null,iridescenceTextureInfo:new ue(this.graph,"iridescenceTextureInfo"),iridescenceIOR:1.3,iridescenceThicknessMinimum:100,iridescenceThicknessMaximum:400,iridescenceThicknessTexture:null,iridescenceThicknessTextureInfo:new ue(this.graph,"iridescenceThicknessTextureInfo")})}getIridescenceFactor(){return this.get("iridescenceFactor")}setIridescenceFactor(t){return this.set("iridescenceFactor",t)}getIridescenceTexture(){return this.getRef("iridescenceTexture")}getIridescenceTextureInfo(){return this.getRef("iridescenceTexture")?this.getRef("iridescenceTextureInfo"):null}setIridescenceTexture(t){return this.setRef("iridescenceTexture",t,{channels:n0})}getIridescenceIOR(){return this.get("iridescenceIOR")}setIridescenceIOR(t){return this.set("iridescenceIOR",t)}getIridescenceThicknessMinimum(){return this.get("iridescenceThicknessMinimum")}setIridescenceThicknessMinimum(t){return this.set("iridescenceThicknessMinimum",t)}getIridescenceThicknessMaximum(){return this.get("iridescenceThicknessMaximum")}setIridescenceThicknessMaximum(t){return this.set("iridescenceThicknessMaximum",t)}getIridescenceThicknessTexture(){return this.getRef("iridescenceThicknessTexture")}getIridescenceThicknessTextureInfo(){return this.getRef("iridescenceThicknessTexture")?this.getRef("iridescenceThicknessTextureInfo"):null}setIridescenceThicknessTexture(t){return this.setRef("iridescenceThicknessTexture",t,{channels:i0})}},c0=class extends ie{static EXTENSION_NAME=Ut;extensionName=Ut;prereadTypes=[j.MESH];prewriteTypes=[j.MESH];createIridescence(){return new o0(this.document.getGraph())}read(t){return this}write(t){return this}preread(t){let e=t.jsonDoc,s=e.json.materials||[],r=e.json.textures||[];return s.forEach((a,n)=>{if(a.extensions&&a.extensions.KHR_materials_iridescence){let i=this.createIridescence();t.materials[n].setExtension(Ut,i);let o=a.extensions[Ut];if(o.extras&&i.setExtras(o.extras),o.iridescenceFactor!==void 0&&i.setIridescenceFactor(o.iridescenceFactor),o.iridescenceIor!==void 0&&i.setIridescenceIOR(o.iridescenceIor),o.iridescenceThicknessMinimum!==void 0&&i.setIridescenceThicknessMinimum(o.iridescenceThicknessMinimum),o.iridescenceThicknessMaximum!==void 0&&i.setIridescenceThicknessMaximum(o.iridescenceThicknessMaximum),o.iridescenceTexture!==void 0){let c=o.iridescenceTexture,l=t.textures[r[c.index].source];i.setIridescenceTexture(l),t.setTextureInfo(i.getIridescenceTextureInfo(),c)}if(o.iridescenceThicknessTexture!==void 0){let c=o.iridescenceThicknessTexture,l=t.textures[r[c.index].source];i.setIridescenceThicknessTexture(l),t.setTextureInfo(i.getIridescenceThicknessTextureInfo(),c)}}}),this}prewrite(t){let e=t.jsonDoc;return this.document.getRoot().listMaterials().forEach(s=>{let r=s.getExtension(Ut);if(r){let a=t.materialIndexMap.get(s),n=e.json.materials[a],i=t.createPropertyDef(r);if(n.extensions=n.extensions||{},n.extensions[Ut]=i,r.getIridescenceFactor()>0&&(i.iridescenceFactor=r.getIridescenceFactor()),r.getIridescenceIOR()!==1.3&&(i.iridescenceIor=r.getIridescenceIOR()),r.getIridescenceThicknessMinimum()!==100&&(i.iridescenceThicknessMinimum=r.getIridescenceThicknessMinimum()),r.getIridescenceThicknessMaximum()!==400&&(i.iridescenceThicknessMaximum=r.getIridescenceThicknessMaximum()),r.getIridescenceTexture()){let o=r.getIridescenceTexture(),c=r.getIridescenceTextureInfo();i.iridescenceTexture=t.createTextureInfoDef(o,c)}if(r.getIridescenceThicknessTexture()){let o=r.getIridescenceThicknessTexture(),c=r.getIridescenceThicknessTextureInfo();i.iridescenceThicknessTexture=t.createTextureInfoDef(o,c)}}}),this}},{R:Kl,G:Vl,B:Hl,A:ql}=rt,l0=class extends J{static EXTENSION_NAME=zt;init(){this.extensionName=zt,this.propertyType="PBRSpecularGlossiness",this.parentTypes=[j.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{diffuseFactor:[1,1,1,1],diffuseTexture:null,diffuseTextureInfo:new ue(this.graph,"diffuseTextureInfo"),specularFactor:[1,1,1],glossinessFactor:1,specularGlossinessTexture:null,specularGlossinessTextureInfo:new ue(this.graph,"specularGlossinessTextureInfo")})}getDiffuseFactor(){return this.get("diffuseFactor")}setDiffuseFactor(t){return this.set("diffuseFactor",t)}getDiffuseTexture(){return this.getRef("diffuseTexture")}getDiffuseTextureInfo(){return this.getRef("diffuseTexture")?this.getRef("diffuseTextureInfo"):null}setDiffuseTexture(t){return this.setRef("diffuseTexture",t,{channels:Kl|Vl|Hl|ql,isColor:!0})}getSpecularFactor(){return this.get("specularFactor")}setSpecularFactor(t){return this.set("specularFactor",t)}getGlossinessFactor(){return this.get("glossinessFactor")}setGlossinessFactor(t){return this.set("glossinessFactor",t)}getSpecularGlossinessTexture(){return this.getRef("specularGlossinessTexture")}getSpecularGlossinessTextureInfo(){return this.getRef("specularGlossinessTexture")?this.getRef("specularGlossinessTextureInfo"):null}setSpecularGlossinessTexture(t){return this.setRef("specularGlossinessTexture",t,{channels:Kl|Vl|Hl|ql})}},d0=class extends ie{static EXTENSION_NAME=zt;extensionName=zt;prereadTypes=[j.MESH];prewriteTypes=[j.MESH];createPBRSpecularGlossiness(){return new l0(this.document.getGraph())}read(t){return this}write(t){return this}preread(t){let e=t.jsonDoc,s=e.json.materials||[],r=e.json.textures||[];return s.forEach((a,n)=>{if(a.extensions&&a.extensions.KHR_materials_pbrSpecularGlossiness){let i=this.createPBRSpecularGlossiness();t.materials[n].setExtension(zt,i);let o=a.extensions[zt];if(o.extras&&i.setExtras(o.extras),o.diffuseFactor!==void 0&&i.setDiffuseFactor(o.diffuseFactor),o.specularFactor!==void 0&&i.setSpecularFactor(o.specularFactor),o.glossinessFactor!==void 0&&i.setGlossinessFactor(o.glossinessFactor),o.diffuseTexture!==void 0){let c=o.diffuseTexture,l=t.textures[r[c.index].source];i.setDiffuseTexture(l),t.setTextureInfo(i.getDiffuseTextureInfo(),c)}if(o.specularGlossinessTexture!==void 0){let c=o.specularGlossinessTexture,l=t.textures[r[c.index].source];i.setSpecularGlossinessTexture(l),t.setTextureInfo(i.getSpecularGlossinessTextureInfo(),c)}}}),this}prewrite(t){let e=t.jsonDoc;return this.document.getRoot().listMaterials().forEach(s=>{let r=s.getExtension(zt);if(r){let a=t.materialIndexMap.get(s),n=e.json.materials[a],i=t.createPropertyDef(r);if(n.extensions=n.extensions||{},n.extensions[zt]=i,i.diffuseFactor=r.getDiffuseFactor(),i.specularFactor=r.getSpecularFactor(),i.glossinessFactor=r.getGlossinessFactor(),r.getDiffuseTexture()){let o=r.getDiffuseTexture(),c=r.getDiffuseTextureInfo();i.diffuseTexture=t.createTextureInfoDef(o,c)}if(r.getSpecularGlossinessTexture()){let o=r.getSpecularGlossinessTexture(),c=r.getSpecularGlossinessTextureInfo();i.specularGlossinessTexture=t.createTextureInfoDef(o,c)}}}),this}},{R:u0,G:f0,B:h0,A:p0}=rt,b0=class extends J{static EXTENSION_NAME=Gt;init(){this.extensionName=Gt,this.propertyType="Sheen",this.parentTypes=[j.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{sheenColorFactor:[0,0,0],sheenColorTexture:null,sheenColorTextureInfo:new ue(this.graph,"sheenColorTextureInfo"),sheenRoughnessFactor:0,sheenRoughnessTexture:null,sheenRoughnessTextureInfo:new ue(this.graph,"sheenRoughnessTextureInfo")})}getSheenColorFactor(){return this.get("sheenColorFactor")}setSheenColorFactor(t){return this.set("sheenColorFactor",t)}getSheenColorTexture(){return this.getRef("sheenColorTexture")}getSheenColorTextureInfo(){return this.getRef("sheenColorTexture")?this.getRef("sheenColorTextureInfo"):null}setSheenColorTexture(t){return this.setRef("sheenColorTexture",t,{channels:u0|f0|h0,isColor:!0})}getSheenRoughnessFactor(){return this.get("sheenRoughnessFactor")}setSheenRoughnessFactor(t){return this.set("sheenRoughnessFactor",t)}getSheenRoughnessTexture(){return this.getRef("sheenRoughnessTexture")}getSheenRoughnessTextureInfo(){return this.getRef("sheenRoughnessTexture")?this.getRef("sheenRoughnessTextureInfo"):null}setSheenRoughnessTexture(t){return this.setRef("sheenRoughnessTexture",t,{channels:p0})}},g0=class extends ie{static EXTENSION_NAME=Gt;extensionName=Gt;prereadTypes=[j.MESH];prewriteTypes=[j.MESH];createSheen(){return new b0(this.document.getGraph())}read(t){return this}write(t){return this}preread(t){let e=t.jsonDoc,s=e.json.materials||[],r=e.json.textures||[];return s.forEach((a,n)=>{if(a.extensions&&a.extensions.KHR_materials_sheen){let i=this.createSheen();t.materials[n].setExtension(Gt,i);let o=a.extensions[Gt];if(o.extras&&i.setExtras(o.extras),o.sheenColorFactor!==void 0&&i.setSheenColorFactor(o.sheenColorFactor),o.sheenRoughnessFactor!==void 0&&i.setSheenRoughnessFactor(o.sheenRoughnessFactor),o.sheenColorTexture!==void 0){let c=o.sheenColorTexture,l=t.textures[r[c.index].source];i.setSheenColorTexture(l),t.setTextureInfo(i.getSheenColorTextureInfo(),c)}if(o.sheenRoughnessTexture!==void 0){let c=o.sheenRoughnessTexture,l=t.textures[r[c.index].source];i.setSheenRoughnessTexture(l),t.setTextureInfo(i.getSheenRoughnessTextureInfo(),c)}}}),this}prewrite(t){let e=t.jsonDoc;return this.document.getRoot().listMaterials().forEach(s=>{let r=s.getExtension(Gt);if(r){let a=t.materialIndexMap.get(s),n=e.json.materials[a],i=t.createPropertyDef(r);if(n.extensions=n.extensions||{},n.extensions[Gt]=i,i.sheenColorFactor=r.getSheenColorFactor(),i.sheenRoughnessFactor=r.getSheenRoughnessFactor(),r.getSheenColorTexture()){let o=r.getSheenColorTexture(),c=r.getSheenColorTextureInfo();i.sheenColorTexture=t.createTextureInfoDef(o,c)}if(r.getSheenRoughnessTexture()){let o=r.getSheenRoughnessTexture(),c=r.getSheenRoughnessTextureInfo();i.sheenRoughnessTexture=t.createTextureInfoDef(o,c)}}}),this}},{R:m0,G:y0,B:w0,A:v0}=rt,x0=class extends J{static EXTENSION_NAME=Kt;init(){this.extensionName=Kt,this.propertyType="Specular",this.parentTypes=[j.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{specularFactor:1,specularTexture:null,specularTextureInfo:new ue(this.graph,"specularTextureInfo"),specularColorFactor:[1,1,1],specularColorTexture:null,specularColorTextureInfo:new ue(this.graph,"specularColorTextureInfo")})}getSpecularFactor(){return this.get("specularFactor")}setSpecularFactor(t){return this.set("specularFactor",t)}getSpecularColorFactor(){return this.get("specularColorFactor")}setSpecularColorFactor(t){return this.set("specularColorFactor",t)}getSpecularTexture(){return this.getRef("specularTexture")}getSpecularTextureInfo(){return this.getRef("specularTexture")?this.getRef("specularTextureInfo"):null}setSpecularTexture(t){return this.setRef("specularTexture",t,{channels:v0})}getSpecularColorTexture(){return this.getRef("specularColorTexture")}getSpecularColorTextureInfo(){return this.getRef("specularColorTexture")?this.getRef("specularColorTextureInfo"):null}setSpecularColorTexture(t){return this.setRef("specularColorTexture",t,{channels:m0|y0|w0,isColor:!0})}},k0=class extends ie{static EXTENSION_NAME=Kt;extensionName=Kt;prereadTypes=[j.MESH];prewriteTypes=[j.MESH];createSpecular(){return new x0(this.document.getGraph())}read(t){return this}write(t){return this}preread(t){let e=t.jsonDoc,s=e.json.materials||[],r=e.json.textures||[];return s.forEach((a,n)=>{if(a.extensions&&a.extensions.KHR_materials_specular){let i=this.createSpecular();t.materials[n].setExtension(Kt,i);let o=a.extensions[Kt];if(o.extras&&i.setExtras(o.extras),o.specularFactor!==void 0&&i.setSpecularFactor(o.specularFactor),o.specularColorFactor!==void 0&&i.setSpecularColorFactor(o.specularColorFactor),o.specularTexture!==void 0){let c=o.specularTexture,l=t.textures[r[c.index].source];i.setSpecularTexture(l),t.setTextureInfo(i.getSpecularTextureInfo(),c)}if(o.specularColorTexture!==void 0){let c=o.specularColorTexture,l=t.textures[r[c.index].source];i.setSpecularColorTexture(l),t.setTextureInfo(i.getSpecularColorTextureInfo(),c)}}}),this}prewrite(t){let e=t.jsonDoc;return this.document.getRoot().listMaterials().forEach(s=>{let r=s.getExtension(Kt);if(r){let a=t.materialIndexMap.get(s),n=e.json.materials[a],i=t.createPropertyDef(r);if(n.extensions=n.extensions||{},n.extensions[Kt]=i,r.getSpecularFactor()!==1&&(i.specularFactor=r.getSpecularFactor()),he.eq(r.getSpecularColorFactor(),[1,1,1])||(i.specularColorFactor=r.getSpecularColorFactor()),r.getSpecularTexture()){let o=r.getSpecularTexture(),c=r.getSpecularTextureInfo();i.specularTexture=t.createTextureInfoDef(o,c)}if(r.getSpecularColorTexture()){let o=r.getSpecularColorTexture(),c=r.getSpecularColorTextureInfo();i.specularColorTexture=t.createTextureInfoDef(o,c)}}}),this}},{R:E0}=rt,M0=class extends J{static EXTENSION_NAME=Vt;init(){this.extensionName=Vt,this.propertyType="Transmission",this.parentTypes=[j.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{transmissionFactor:0,transmissionTexture:null,transmissionTextureInfo:new ue(this.graph,"transmissionTextureInfo")})}getTransmissionFactor(){return this.get("transmissionFactor")}setTransmissionFactor(t){return this.set("transmissionFactor",t)}getTransmissionTexture(){return this.getRef("transmissionTexture")}getTransmissionTextureInfo(){return this.getRef("transmissionTexture")?this.getRef("transmissionTextureInfo"):null}setTransmissionTexture(t){return this.setRef("transmissionTexture",t,{channels:E0})}},S0=class extends ie{static EXTENSION_NAME=Vt;extensionName=Vt;prereadTypes=[j.MESH];prewriteTypes=[j.MESH];createTransmission(){return new M0(this.document.getGraph())}read(t){return this}write(t){return this}preread(t){let e=t.jsonDoc,s=e.json.materials||[],r=e.json.textures||[];return s.forEach((a,n)=>{if(a.extensions&&a.extensions.KHR_materials_transmission){let i=this.createTransmission();t.materials[n].setExtension(Vt,i);let o=a.extensions[Vt];if(o.extras&&i.setExtras(o.extras),o.transmissionFactor!==void 0&&i.setTransmissionFactor(o.transmissionFactor),o.transmissionTexture!==void 0){let c=o.transmissionTexture,l=t.textures[r[c.index].source];i.setTransmissionTexture(l),t.setTextureInfo(i.getTransmissionTextureInfo(),c)}}}),this}prewrite(t){let e=t.jsonDoc;return this.document.getRoot().listMaterials().forEach(s=>{let r=s.getExtension(Vt);if(r){let a=t.materialIndexMap.get(s),n=e.json.materials[a],i=t.createPropertyDef(r);if(n.extensions=n.extensions||{},n.extensions[Vt]=i,i.transmissionFactor=r.getTransmissionFactor(),r.getTransmissionTexture()){let o=r.getTransmissionTexture(),c=r.getTransmissionTextureInfo();i.transmissionTexture=t.createTextureInfoDef(o,c)}}}),this}},T0=class extends J{static EXTENSION_NAME=Es;init(){this.extensionName=Es,this.propertyType="Unlit",this.parentTypes=[j.MATERIAL]}},A0=class extends ie{static EXTENSION_NAME=Es;extensionName=Es;prereadTypes=[j.MESH];prewriteTypes=[j.MESH];createUnlit(){return new T0(this.document.getGraph())}read(t){return this}write(t){return this}preread(t){return(t.jsonDoc.json.materials||[]).forEach((e,s)=>{e.extensions&&e.extensions.KHR_materials_unlit&&t.materials[s].setExtension(Es,this.createUnlit())}),this}prewrite(t){let e=t.jsonDoc;return this.document.getRoot().listMaterials().forEach(s=>{if(s.getExtension("KHR_materials_unlit")){let r=t.materialIndexMap.get(s),a=e.json.materials[r];a.extensions=a.extensions||{},a.extensions[Es]={}}}),this}},_0=class extends J{static EXTENSION_NAME=We;init(){this.extensionName=We,this.propertyType="Mapping",this.parentTypes=["MappingList"]}getDefaults(){return Object.assign(super.getDefaults(),{material:null,variants:new ce})}getMaterial(){return this.getRef("material")}setMaterial(t){return this.setRef("material",t)}addVariant(t){return this.addRef("variants",t)}removeVariant(t){return this.removeRef("variants",t)}listVariants(){return this.listRefs("variants")}},I0=class extends J{static EXTENSION_NAME=We;init(){this.extensionName=We,this.propertyType="MappingList",this.parentTypes=[j.PRIMITIVE]}getDefaults(){return Object.assign(super.getDefaults(),{mappings:new ce})}addMapping(t){return this.addRef("mappings",t)}removeMapping(t){return this.removeRef("mappings",t)}listMappings(){return this.listRefs("mappings")}},Wl=class extends J{static EXTENSION_NAME=We;init(){this.extensionName=We,this.propertyType="Variant",this.parentTypes=["MappingList"]}},R0=class extends ie{extensionName=We;static EXTENSION_NAME=We;createMappingList(){return new I0(this.document.getGraph())}createVariant(t=""){return new Wl(this.document.getGraph(),t)}createMapping(){return new _0(this.document.getGraph())}listVariants(){return Array.from(this.properties).filter(t=>t instanceof Wl)}read(t){let e=t.jsonDoc;if(!e.json.extensions||!e.json.extensions.KHR_materials_variants)return this;let s=(e.json.extensions.KHR_materials_variants.variants||[]).map(r=>this.createVariant().setName(r.name||""));return(e.json.meshes||[]).forEach((r,a)=>{let n=t.meshes[a];(r.primitives||[]).forEach((i,o)=>{if(!i.extensions||!i.extensions.KHR_materials_variants)return;let c=this.createMappingList(),l=i.extensions[We];for(let u of l.mappings){let f=this.createMapping();u.material!==void 0&&f.setMaterial(t.materials[u.material]);for(let b of u.variants||[])f.addVariant(s[b]);c.addMapping(f)}n.listPrimitives()[o].setExtension(We,c)})}),this}write(t){let e=t.jsonDoc,s=this.listVariants();if(!s.length)return this;let r=[],a=new Map;for(let n of s)a.set(n,r.length),r.push(t.createPropertyDef(n));for(let n of this.document.getRoot().listMeshes()){let i=t.meshIndexMap.get(n);n.listPrimitives().forEach((o,c)=>{let l=o.getExtension(We);if(!l)return;let u=t.jsonDoc.json.meshes[i].primitives[c],f=l.listMappings().map(b=>{let g=t.createPropertyDef(b),p=b.getMaterial();return p&&(g.material=t.materialIndexMap.get(p)),g.variants=b.listVariants().map(d=>a.get(d)),g});u.extensions=u.extensions||{},u.extensions[We]={mappings:f}})}return e.json.extensions=e.json.extensions||{},e.json.extensions[We]={variants:r},this}},{G:N0}=rt,B0=class extends J{static EXTENSION_NAME=Ht;init(){this.extensionName=Ht,this.propertyType="Volume",this.parentTypes=[j.MATERIAL]}getDefaults(){return Object.assign(super.getDefaults(),{thicknessFactor:0,thicknessTexture:null,thicknessTextureInfo:new ue(this.graph,"thicknessTexture"),attenuationDistance:1/0,attenuationColor:[1,1,1]})}getThicknessFactor(){return this.get("thicknessFactor")}setThicknessFactor(t){return this.set("thicknessFactor",t)}getThicknessTexture(){return this.getRef("thicknessTexture")}getThicknessTextureInfo(){return this.getRef("thicknessTexture")?this.getRef("thicknessTextureInfo"):null}setThicknessTexture(t){return this.setRef("thicknessTexture",t,{channels:N0})}getAttenuationDistance(){return this.get("attenuationDistance")}setAttenuationDistance(t){return this.set("attenuationDistance",t)}getAttenuationColor(){return this.get("attenuationColor")}setAttenuationColor(t){return this.set("attenuationColor",t)}},C0=class extends ie{static EXTENSION_NAME=Ht;extensionName=Ht;prereadTypes=[j.MESH];prewriteTypes=[j.MESH];createVolume(){return new B0(this.document.getGraph())}read(t){return this}write(t){return this}preread(t){let e=t.jsonDoc,s=e.json.materials||[],r=e.json.textures||[];return s.forEach((a,n)=>{if(a.extensions&&a.extensions.KHR_materials_volume){let i=this.createVolume();t.materials[n].setExtension(Ht,i);let o=a.extensions[Ht];if(o.extras&&i.setExtras(o.extras),o.thicknessFactor!==void 0&&i.setThicknessFactor(o.thicknessFactor),o.attenuationDistance!==void 0&&i.setAttenuationDistance(o.attenuationDistance),o.attenuationColor!==void 0&&i.setAttenuationColor(o.attenuationColor),o.thicknessTexture!==void 0){let c=o.thicknessTexture,l=t.textures[r[c.index].source];i.setThicknessTexture(l),t.setTextureInfo(i.getThicknessTextureInfo(),c)}}}),this}prewrite(t){let e=t.jsonDoc;return this.document.getRoot().listMaterials().forEach(s=>{let r=s.getExtension(Ht);if(r){let a=t.materialIndexMap.get(s),n=e.json.materials[a],i=t.createPropertyDef(r);if(n.extensions=n.extensions||{},n.extensions[Ht]=i,r.getThicknessFactor()>0&&(i.thicknessFactor=r.getThicknessFactor()),Number.isFinite(r.getAttenuationDistance())&&(i.attenuationDistance=r.getAttenuationDistance()),he.eq(r.getAttenuationColor(),[1,1,1])||(i.attenuationColor=r.getAttenuationColor()),r.getThicknessTexture()){let o=r.getThicknessTexture(),c=r.getThicknessTextureInfo();i.thicknessTexture=t.createTextureInfoDef(o,c)}}}),this}},O0=class extends ie{extensionName=Rl;static EXTENSION_NAME=Rl;read(t){return this}write(t){return this}},wi=class extends ie{extensionName=Nl;static EXTENSION_NAME=Nl;read(t){return this}write(t){return this}},F0=class extends J{static EXTENSION_NAME=qt;init(){this.extensionName=qt,this.propertyType="Visibility",this.parentTypes=[j.NODE]}getDefaults(){return Object.assign(super.getDefaults(),{visible:!0})}getVisible(){return this.get("visible")}setVisible(t){return this.set("visible",t)}},P0=class extends ie{static EXTENSION_NAME=qt;extensionName=qt;createVisibility(){return new F0(this.document.getGraph())}read(t){return(t.jsonDoc.json.nodes||[]).forEach((e,s)=>{if(e.extensions&&e.extensions.KHR_node_visibility){let r=this.createVisibility();t.nodes[s].setExtension(qt,r);let a=e.extensions[qt];a.visible!==void 0&&r.setVisible(a.visible)}}),this}write(t){let e=t.jsonDoc;for(let s of this.document.getRoot().listNodes()){let r=s.getExtension(qt);if(!r)continue;let a=t.nodeIndexMap.get(s),n=e.json.nodes[a];n.extensions=n.extensions||{},n.extensions[qt]={visible:r.getVisible()}}return this}};function j0(t){return t.vkFormat>0&&t.vkFormat<=123}function Xl(t){let e=t.vkFormat===1000066e3&&t.dataFormatDescriptor[0].colorModel===167;return t.vkFormat===0||e}var L0=class{match(t){return t[0]===171&&t[1]===75&&t[2]===84&&t[3]===88&&t[4]===32&&t[5]===50&&t[6]===48&&t[7]===187&&t[8]===13&&t[9]===10&&t[10]===26&&t[11]===10}getSize(t){let e=pa(t);return[e.pixelWidth,e.pixelHeight]}getChannels(t){let e=pa(t),s=e.dataFormatDescriptor[0];if(j0(e))return s.samples.length;if(Xl(e))switch(s.colorModel){case 163:return s.samples.length===2&&(s.samples[1].channelType&15)===15?4:3;case 166:return(s.samples[0].channelType&15)===3?4:3;default:throw new Error(`Unexpected KTX2 colorModel, "${s.colorModel}".`)}throw new Error(`Unexpected KTX2 vkFormat, "${e.vkFormat}".`)}getVRAMByteLength(t){let e=pa(t),s=0;if(Xl(e)){let r=this.getChannels(t)>3;for(let a=0;a<e.levels.length;a++){let n=e.levels[a];if(n.uncompressedByteLength)s+=n.uncompressedByteLength;else{let i=Math.max(1,Math.floor(e.pixelWidth/Math.pow(2,a))),o=Math.max(1,Math.floor(e.pixelHeight/Math.pow(2,a))),c=r?16:8;s+=i/4*(o/4)*c}}}else for(let r of e.levels)e.supercompressionScheme===0?s+=r.levelData.byteLength:s+=r.uncompressedByteLength;return s}},D0=class extends ie{static EXTENSION_NAME=ma;extensionName=ma;prereadTypes=[j.TEXTURE];static register(){dt.registerFormat("image/ktx2",new L0)}preread(t){return t.jsonDoc.json.textures&&t.jsonDoc.json.textures.forEach(e=>{e.extensions&&e.extensions.KHR_texture_basisu&&(e.source=e.extensions[ma].source)}),this}read(t){return this}write(t){let e=t.jsonDoc;return this.document.getRoot().listTextures().forEach(s=>{if(s.getMimeType()==="image/ktx2"){let r=t.imageIndexMap.get(s);e.json.textures.forEach(a=>{a.source===r&&(a.extensions=a.extensions||{},a.extensions[ma]={source:a.source},delete a.source)})}}),this}},U0=class extends J{static EXTENSION_NAME=Wt;init(){this.extensionName=Wt,this.propertyType="Transform",this.parentTypes=[j.TEXTURE_INFO]}getDefaults(){return Object.assign(super.getDefaults(),{offset:[0,0],rotation:0,scale:[1,1],texCoord:null})}getOffset(){return this.get("offset")}setOffset(t){return this.set("offset",t)}getRotation(){return this.get("rotation")}setRotation(t){return this.set("rotation",t)}getScale(){return this.get("scale")}setScale(t){return this.set("scale",t)}getTexCoord(){return this.get("texCoord")}setTexCoord(t){return this.set("texCoord",t)}},z0=class extends ie{extensionName=Wt;static EXTENSION_NAME=Wt;createTransform(){return new U0(this.document.getGraph())}read(t){for(let[e,s]of Array.from(t.textureInfos.entries())){if(!s.extensions||!s.extensions.KHR_texture_transform)continue;let r=this.createTransform(),a=s.extensions[Wt];a.offset!==void 0&&r.setOffset(a.offset),a.rotation!==void 0&&r.setRotation(a.rotation),a.scale!==void 0&&r.setScale(a.scale),a.texCoord!==void 0&&r.setTexCoord(a.texCoord),e.setExtension(Wt,r)}return this}write(t){let e=Array.from(t.textureInfoDefMap.entries());for(let[s,r]of e){let a=s.getExtension(Wt);if(!a)continue;r.extensions=r.extensions||{};let n={},i=he.eq;i(a.getOffset(),[0,0])||(n.offset=a.getOffset()),a.getRotation()!==0&&(n.rotation=a.getRotation()),i(a.getScale(),[1,1])||(n.scale=a.getScale()),a.getTexCoord()!=null&&(n.texCoord=a.getTexCoord()),r.extensions[Wt]=n}return this}},G0=[j.ROOT,j.SCENE,j.NODE,j.MESH,j.MATERIAL,j.TEXTURE,j.ANIMATION],K0=class extends J{static EXTENSION_NAME=at;init(){this.extensionName=at,this.propertyType="Packet",this.parentTypes=G0}getDefaults(){return Object.assign(super.getDefaults(),{context:{},properties:{}})}getContext(){return this.get("context")}setContext(t){return this.set("context",{...t})}listProperties(){return Object.keys(this.get("properties"))}getProperty(t){let e=this.get("properties");return t in e?e[t]:null}setProperty(t,e){this._assertContext(t);let s={...this.get("properties")};return e?s[t]=e:delete s[t],this.set("properties",s)}toJSONLD(){return{"@context":hi(this.get("context")),...hi(this.get("properties"))}}fromJSONLD(t){t=hi(t);let e=t["@context"];return e&&this.set("context",e),delete t["@context"],this.set("properties",t)}_assertContext(t){if(!(t.split(":")[0]in this.get("context")))throw new Error(`${at}: Missing context for term, "${t}".`)}};function hi(t){return JSON.parse(JSON.stringify(t))}var V0=class extends ie{extensionName=at;static EXTENSION_NAME=at;createPacket(){return new K0(this.document.getGraph())}listPackets(){return Array.from(this.properties)}read(t){let e=t.jsonDoc.json.extensions?.[at];if(!e||!e.packets)return this;let s=t.jsonDoc.json,r=this.document.getRoot(),a=e.packets.map(o=>this.createPacket().fromJSONLD(o)),n=[[s.asset],s.scenes,s.nodes,s.meshes,s.materials,s.images,s.animations],i=[[r],r.listScenes(),r.listNodes(),r.listMeshes(),r.listMaterials(),r.listTextures(),r.listAnimations()];for(let o=0;o<n.length;o++){let c=n[o]||[];for(let l=0;l<c.length;l++){let u=c[l];if(u.extensions&&u.extensions.KHR_xmp_json_ld){let f=u.extensions[at];i[o][l].setExtension(at,a[f.packet])}}}return this}write(t){let{json:e}=t.jsonDoc,s=[];for(let r of this.properties){s.push(r.toJSONLD());for(let a of r.listParents()){let n;switch(a.propertyType){case j.ROOT:n=e.asset;break;case j.SCENE:n=e.scenes[t.sceneIndexMap.get(a)];break;case j.NODE:n=e.nodes[t.nodeIndexMap.get(a)];break;case j.MESH:n=e.meshes[t.meshIndexMap.get(a)];break;case j.MATERIAL:n=e.materials[t.materialIndexMap.get(a)];break;case j.TEXTURE:n=e.images[t.imageIndexMap.get(a)];break;case j.ANIMATION:n=e.animations[t.animationIndexMap.get(a)];break;default:n=null,this.document.getLogger().warn(`[${at}]: Unsupported parent property, "${a.propertyType}"`);break}n&&(n.extensions=n.extensions||{},n.extensions[at]={packet:s.length-1})}}return s.length>0&&(e.extensions=e.extensions||{},e.extensions[at]={packets:s}),this}},H0=[Sy,Ty,Py,Ly,Ky,qy,Qy,e0,s0,a0,c0,d0,k0,g0,S0,A0,R0,C0,O0,wi,P0,D0,z0,V0],KM=[Mm,mi,yi,$m,ky,My,...H0];var cT=(function(){var t="b9H79Tebbbe9ok9Geueu9Geub9Gbb9Gruuuuuuueu9Gvuuuuueu9Gduueu9Gluuuueu9Gvuuuuub9Gouuuuuub9Gluuuub9Giuuueui8AYdilveoveovrrwrrDDoDrbqqbelve9Weiiviebeoweuec;G:Qdkr:nlAo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bb8F9TW79O9V9Wt9FW9U9J9V9KW9wWVtW949c919M9MWV9mW4W2be8A9TW79O9V9Wt9FW9U9J9V9KW9wWVtW949c919M9MWVbd8F9TW79O9V9Wt9FW9U9J9V9KW9wWVtW949c919M9MWV9c9V919U9KbiE9TW79O9V9Wt9FW9U9J9V9KW9wWVtW949wWV79P9V9UblY9TW79O9V9Wt9FW9U9J9V9KW69U9KW949c919M9MWVbv8E9TW79O9V9Wt9FW9U9J9V9KW69U9KW949c919M9MWV9c9V919U9Kbo8A9TW79O9V9Wt9FW9U9J9V9KW69U9KW949wWV79P9V9UbrE9TW79O9V9Wt9FW9U9J9V9KW69U9KW949tWG91W9U9JWbwa9TW79O9V9Wt9FW9U9J9V9KW69U9KW949tWG91W9U9JW9c9V919U9KbDL9TW79O9V9Wt9FW9U9J9V9KWS9P2tWV9p9JtbqK9TW79O9V9Wt9FW9U9J9V9KWS9P2tWV9r919HtbkL9TW79O9V9Wt9FW9U9J9V9KWS9P2tWVT949WbxE9TW79O9V9Wt9F9V9Wt9P9T9P96W9wWVtW94J9H9J9OWbsa9TW79O9V9Wt9F9V9Wt9P9T9P96W9wWVtW94J9H9J9OW9ttV9P9Wbza9TW79O9V9Wt9F9V9Wt9P9T9P96W9wWVtW94SWt9J9O9sW9T9H9WbHK9TW79O9V9Wt9F79W9Ht9P9H29t9VVt9sW9T9H9WbOl79IV9RbCDwebcekdKLqN9OYdbk:Bhdhud9:8Jjjjjbc;qw9Rgr8KjjjjbcbhwdnaeTmbabcbyd;C:kjjbaoaocb9iEgDc:GeV86bbarc;adfcbcjdz:wjjjb8AdnaiTmbarc;adfadalz:vjjjb8Akarc;abfalfcbcbcjdal9RalcFe0Ez:wjjjb8Aarc;abfarc;adfalz:vjjjb8AarcUf9cb83ibarc8Wf9cb83ibarcyf9cb83ibarcaf9cb83ibarcKf9cb83ibarczf9cb83ibar9cb83iwar9cb83ibcj;abal9Uc;WFbGcjdalca0Ehqdnaicd6mbavcd9imbaDTmbadcefhkaqci2gxal2hmarc;alfclfhParc;qlfceVhsarc;qofclVhzarc;qofcKfhHarc;qofczfhOcbhAincdhCcbhodnavci6mbaH9cb83ibaO9cb83ibar9cb83i;yoar9cb83i;qoadaAfgoybbhXcbhQincbhwcbhLdninaoalfhKaoybbgYaX7aLVhLawcP0meaKhoaYhXawcefgwaQfai6mbkkcbhXarc;qofhwincwh8AcwhEdnaLaX93gocFeGg3cs0mbclhEa3ci0mba3cb9hcethEkdnaocw4cFeGg3cs0mbclh8Aa3ci0mba3cb9hceth8Aka8AaEfh3awydbh5cwh8AcwhEdnaocz4cFeGg8Ecs0mbclhEa8Eci0mba8Ecb9hcethEka3a5fh3dnaocFFFFb0mbclh8AaocFFF8F0mbaocFFFr0ceth8Akawa3aEfa8AfBdbawclfhwaXcefgXcw9hmbkaKhoaYhXaQczfgQai6mbkcbhocehwazhLinawaoaLydbarc;qofaocdtfydb6EhoaLclfhLawcefgwcw9hmbkcihCkcbh3arc;qlfcbcjdz:wjjjb8Aarc;alfcwfcbBdbar9cb83i;alaoclth8Fadhaaqhhakh5inarc;qlfadcba3cufgoaoa30Eal2falz:vjjjb8Aaiahaiah6Ehgdnaqaia39Ra3aqfai6EgYcsfc9WGgoaY9nmbarc;qofaYfcbaoaY9Rz:wjjjb8Akada3al2fh8Jcbh8Kina8Ka8FVcl4hQarc;alfa8Kcdtfh8LaAh8Mcbh8Nina8NaAfhwdndndndndndna8KPldebidkasa8Mc98GgLfhoa5aLfh8Aarc;qlfawc98GgLfRbbhXcwhwinaoRbbawtaXVhXaocefhoawcwfgwca9hmbkaYTmla8Ncith8Ea8JaLfhEcbhKinaERbbhLcwhoa8AhwinawRbbaotaLVhLawcefhwaocwfgoca9hmbkarc;qofaKfaLaX7aQ93a8E486bba8Aalfh8AaEalfhEaLhXaKcefgKaY9hmbxlkkaYTmia8Mc9:Ghoa8NcitcwGhEarc;qlfawceVfRbbcwtarc;qlfawc9:GfRbbVhLarc;qofhwaghXinawa5aofRbbcwtaaaofRbbVg8AaL9RgLcetaLcztcz91cs47cFFiGaE486bbaoalfhoawcefhwa8AhLa3aXcufgX9hmbxikkaYTmda8Jawfhoarc;qlfawfRbbhLarc;qofhwaghXinawaoRbbg8AaL9RgLcetaLcKtcK91cr4786bbawcefhwaoalfhoa8AhLa3aXcufgX9hmbxdkkaYTmeka8LydbhEcbhKarc;qofhoincdhLcbhwinaLaoawfRbbcb9hfhLawcefgwcz9hmbkclhXcbhwinaXaoawfRbbcd0fhXawcefgwcz9hmbkcwh8Acbhwina8AaoawfRbbcP0fh8Aawcefgwcz9hmbkaLaXaLaX6Egwa8Aawa8A6Egwczawcz6EaEfhEaoczfhoaKczfgKaY6mbka8LaEBdbka8Mcefh8Ma8Ncefg8Ncl9hmbka8Kcefg8KaC9hmbkaaamfhaahaxfhha5amfh5a3axfg3ai6mbkcbhocehwaPhLinawaoaLydbarc;alfaocdtfydb6EhoaLclfhLawcefgXhwaCaX9hmbkaraAcd4fa8FcdVaoaocdSE86bbaAclfgAal6mbkkabaefh8Kabcefhoalcd4gecbaDEhkadcefhOarc;abfceVhHcbhmdndninaiam9nmearc;qofcbcjdz:wjjjb8Aa8Kao9Rak6mdadamal2gwfhxcbh8JaOawfhzaocbakz:wjjjbghakfh5aqaiam9Ramaqfai6Egscsfgocl4cifcd4hCaoc9WGg8LThPindndndndndndndndndndnaDTmbara8Jcd4fRbbgLciGPlbedlbkasTmdaxa8Jfhoarc;abfa8JfRbbhLarc;qofhwashXinawaoRbbg8AaL9RgLcetaLcKtcK91cr4786bbawcefhwaoalfhoa8AhLaXcufgXmbxikkasTmia8JcitcwGhEarc;abfa8JceVfRbbcwtarc;abfa8Jc9:GgofRbbVhLaxaofhoarc;qofhwashXinawao8Vbbg8AaL9RgLcetaLcztcz91cs47cFFiGaE486bbawcefhwaoalfhoa8AhLaXcufgXmbxdkkaHa8Jc98GgEfhoazaEfh8Aarc;abfaEfRbbhXcwhwinaoRbbawtaXVhXaocefhoawcwfgwca9hmbkasTmbaLcl4hYa8JcitcKGh3axaEfhEcbhKinaERbbhLcwhoa8AhwinawRbbaotaLVhLawcefhwaocwfgoca9hmbkarc;qofaKfaLaX7aY93a3486bba8Aalfh8AaEalfhEaLhXaKcefgKas9hmbkkaDmbcbhoxlka8LTmbcbhodninarc;qofaofgwcwf8Pibaw8Pib:e9qTmeaoczfgoa8L9pmdxbkkdnavmbcehoxikcbhEaChKaChYinarc;qofaEfgocwf8Pibhyao8Pibh8PcdhLcbhwinaLaoawfRbbcb9hfhLawcefgwcz9hmbkclhXcbhwinaXaoawfRbbcd0fhXawcefgwcz9hmbkcwh8Acbhwina8AaoawfRbbcP0fh8Aawcefgwcz9hmbkaLaXaLaX6Egoa8Aaoa8A6Egoczaocz6EaYfhYaocucbaya8P:e9cb9sEgwaoaw6EaKfhKaEczfgEa8L9pmdxbkkaha8Jcd4fgoaoRbbcda8JcetcoGtV86bbxikdnaKas6mbaYas6mbaha8Jcd4fgoaoRbbcia8JcetcoGtV86bba8Ka59Ras6mra5arc;qofasz:vjjjbasfh5xikaKaY9phokaha8Jcd4fgwawRbbaoa8JcetcoGtV86bbka8Ka59RaC6mla5cbaCz:wjjjbgAaCfhYdndna8LmbaPhoxekdna8KaY9RcK9pmbaPhoxekaocdtc:q1jjbfcj1jjbaDEg5ydxggcetc;:FFFeGh8Fcuh3cuagtcu7cFeGhacbh8Marc;qofhLinarc;qofa8MfhQczhEdndndnagPDbeeeeeeedekcucbaQcwf8PibaQ8Pib:e9cb9sEhExekcbhoa8FhEinaEaaaLaofRbb9nfhEaocefgocz9hmbkkcih8Ecbh8Ainczhwdndndna5a8AcdtfydbgKPDbeeeeeeedekcucbaQcwf8PibaQ8Pib:e9cb9sEhwxekaKcetc;:FFFeGhwcuaKtcu7cFeGhXcbhoinawaXaLaofRbb9nfhwaocefgocz9hmbkkdndnawaE6mbaKa39hmeawaE9hmea5a8EcdtfydbcwSmeka8Ah8EawhEka8Acefg8Aci9hmbkaAa8Mco4fgoaoRbba8Ea8Mci4coGtV86bbdndndna5a8Ecdtfydbg3PDdbbbbbbbebkdncwa39Tg8ETmbcua3tcu7hwdndna3ceSmbcbh8NaLhQinaQhoa8Eh8AcbhXinaoRbbgEawcFeGgKaEaK6EaXa3tVhXaocefhoa8Acufg8AmbkaYaX86bbaQa8EfhQaYcefhYa8Na8Efg8Ncz6mbxdkkcbh8NaLhQinaQhoa8Eh8AcbhXinaoRbbgEawcFeGgKaEaK6EaXcetVhXaocefhoa8Acufg8AmbkaYaX:T9cFe:d9c:c:qj:bw9:9c:q;c1:I1e:d9c:b:c:e1z9:9ca188bbaQa8EfhQaYcefhYa8Na8Efg8Ncz6mbkkcbhoinaYaLaofRbbgX86bbaYaXawcFeG9pfhYaocefgocz9hmbxikkdna3ceSmbinaYcb86bbaYcefhYxbkkinaYcb86bbaYcefhYxbkkaYaQ8Pbb83bbaYcwfaQcwf8Pbb83bbaYczfhYka8Mczfg8Ma8L9pgomeaLczfhLa8KaY9RcK9pmbkkaoTmlaYh5aYTmlka8Jcefg8Jal9hmbkarc;abfaxascufal2falz:vjjjb8Aasamfhma5hoa5mbkcbhwxdkdna8Kao9RakalfgwcKcaaDEgLawaL0EgX9pmbcbhwxdkdnawaL9pmbaocbaXaw9Rgwz:wjjjbawfhokaoarc;adfalz:vjjjbalfhodnaDTmbaoaraez:vjjjbaefhokaoab9Rhwxekcbhwkarc;qwf8Kjjjjbawk5babaeadaialcdcbyd;C:kjjbz:bjjjbk9reduaecd4gdaefgicaaica0Eabcj;abae9Uc;WFbGcjdaeca0Egifcufai9Uae2aiadfaicl4cifcd4f2fcefkmbcbabBd;C:kjjbk:Ese5u8Jjjjjbc;ae9Rgl8Kjjjjbcbhvdnaici9UgocHfae0mbabcbyd;m:kjjbgrc;GeV86bbalc;abfcFecjez:wjjjb8AalcUfgw9cu83ibalc8WfgD9cu83ibalcyfgq9cu83ibalcafgk9cu83ibalcKfgx9cu83ibalczfgm9cu83ibal9cu83iwal9cu83ibabaefc9WfhPabcefgsaofhednaiTmbcmcsarcb9kgzEhHcbhOcbhAcbhCcbhXcbhQindnaeaP9nmbcbhvxikaQcufhvadaCcdtfgLydbhKaLcwfydbhYaLclfydbh8AcbhEdndndninalc;abfavcsGcitfgoydlh3dndndnaoydbgoaK9hmba3a8ASmekdnaoa8A9hmba3aY9hmbaEcefhExekaoaY9hmea3aK9hmeaEcdfhEkaEc870mdaXcufhvaLaEciGcx2goc;i1jjbfydbcdtfydbh3aLaoc;e1jjbfydbcdtfydbh8AaLaoc;a1jjbfydbcdtfydbhKcbhodnindnalavcsGcdtfydba39hmbaohYxdkcuhYavcufhvaocefgocz9hmbkkaOa3aOSgvaYce9iaYaH9oVgoGfhOdndndncbcsavEaYaoEgvcs9hmbarce9imba3a3aAa3cefaASgvEgAcefSmecmcsavEhvkasavaEcdtc;WeGV86bbavcs9hmea3aA9Rgvcetavc8F917hvinaeavcFb0crtavcFbGV86bbaecefheavcje6hoavcr4hvaoTmbka3hAxvkcPhvasaEcdtcPV86bba3hAkavTmiavaH9omicdhocehEaQhYxlkavcufhvaEclfgEc;ab9hmbkkdnaLceaYaOSceta8AaOSEcx2gvc;a1jjbfydbcdtfydbgKTaLavc;e1jjbfydbcdtfydbg8AceSGaLavc;i1jjbfydbcdtfydbg3cdSGaOcb9hGazGg5ce9hmbaw9cu83ibaD9cu83ibaq9cu83ibak9cu83ibax9cu83ibam9cu83ibal9cu83iwal9cu83ibcbhOkcbhEaXcufgvhodnindnalaocsGcdtfydba8A9hmbaEhYxdkcuhYaocufhoaEcefgEcz9hmbkkcbhodnindnalavcsGcdtfydba39hmbaohExdkcuhEavcufhvaocefgocz9hmbkkaOaKaOSg8EfhLdndnaYcm0mbaYcefhYxekcbcsa8AaLSgvEhYaLavfhLkdndnaEcm0mbaEcefhExekcbcsa3aLSgvEhEaLavfhLkc9:cua8EEh8FcbhvaEaYcltVgacFeGhodndndninavc:W1jjbfRbbaoSmeavcefgvcz9hmbxdkka5aKaO9havcm0VVmbasavc;WeV86bbxekasa8F86bbaeaa86bbaecefhekdna8EmbaKaA9Rgvcetavc8F917hvinaeavcFb0gocrtavcFbGV86bbavcr4hvaecefheaombkaKhAkdnaYcs9hmba8AaA9Rgvcetavc8F917hvinaeavcFb0gocrtavcFbGV86bbavcr4hvaecefheaombka8AhAkdnaEcs9hmba3aA9Rgvcetavc8F917hvinaeavcFb0gocrtavcFbGV86bbavcr4hvaecefheaombka3hAkalaXcdtfaKBdbaXcefcsGhvdndnaYPzbeeeeeeeeeeeeeebekalavcdtfa8ABdbaXcdfcsGhvkdndnaEPzbeeeeeeeeeeeeeebekalavcdtfa3BdbavcefcsGhvkcihoalc;abfaQcitfgEaKBdlaEa8ABdbaQcefcsGhYcdhEavhXaLhOxekcdhoalaXcdtfa3BdbcehEaXcefcsGhXaQhYkalc;abfaYcitfgva8ABdlava3Bdbalc;abfaQaEfcsGcitfgva3BdlavaKBdbascefhsaQaofcsGhQaCcifgCai6mbkkdnaeaP9nmbcbhvxekcbhvinaeavfavc:W1jjbfRbb86bbavcefgvcz9hmbkaeab9Ravfhvkalc;aef8KjjjjbavkZeeucbhddninadcefgdc8F0meceadtae6mbkkadcrfcFeGcr9Uci2cdfabci9U2cHfkmbcbabBd;m:kjjbk:Adewu8Jjjjjbcz9Rhlcbhvdnaicvfae0mbcbhvabcbRb;m:kjjbc;qeV86bbal9cb83iwabcefhoabaefc98fhrdnaiTmbcbhwcbhDindnaoar6mbcbskadaDcdtfydbgqalcwfawaqav9Rgvavc8F91gv7av9Rc507gwcdtfgkydb9Rgvc8E91c9:Gavcdt7awVhvinaoavcFb0gecrtavcFbGV86bbavcr4hvaocefhoaembkakaqBdbaqhvaDcefgDai9hmbkkdnaoar9nmbcbskaocbBbbaoab9RclfhvkavkBeeucbhddninadcefgdc8F0meceadtae6mbkkadcwfcFeGcr9Uab2cvfk:bvli99dui99ludnaeTmbcuadcetcuftcu7:Zhvdndncuaicuftcu7:ZgoJbbbZMgr:lJbbb9p9DTmbar:Ohwxekcjjjj94hwkcbhicbhDinalclfIdbgrJbbbbJbbjZalIdbgq:lar:lMalcwfIdbgk:lMgr:varJbbbb9BEgrNhxaqarNhrdndnakJbbbb9GTmbaxhqxekJbbjZar:l:tgqaq:maxJbbbb9GEhqJbbjZax:l:tgxax:marJbbbb9GEhrkdndnalcxfIdbgxJbbj:;axJbbj:;9GEgkJbbjZakJbbjZ9FEavNJbbbZJbbb:;axJbbbb9GEMgx:lJbbb9p9DTmbax:Ohmxekcjjjj94hmkdndnaqJbbj:;aqJbbj:;9GEgxJbbjZaxJbbjZ9FEaoNJbbbZJbbb:;aqJbbbb9GEMgq:lJbbb9p9DTmbaq:OhPxekcjjjj94hPkdndnarJbbj:;arJbbj:;9GEgqJbbjZaqJbbjZ9FEaoNJbbbZJbbb:;arJbbbb9GEMgr:lJbbb9p9DTmbar:Ohsxekcjjjj94hskdndnadcl9hmbabaifgzas86bbazcifam86bbazcdfaw86bbazcefaP86bbxekabaDfgzas87ebazcofam87ebazclfaw87ebazcdfaP87ebkalczfhlaiclfhiaDcwfhDaecufgembkkk;hlld99eud99eudnaeTmbdndncuaicuftcu7:ZgvJbbbZMgo:lJbbb9p9DTmbao:Ohixekcjjjj94hikaic;8FiGhrinabcofcicdalclfIdb:lalIdb:l9EgialcwfIdb:lalaicdtfIdb:l9EEgialcxfIdb:lalaicdtfIdb:l9EEgiarV87ebdndnJbbj:;JbbjZalaicdtfIdbJbbbb9DEgoalaicd7cdtfIdbJ;Zl:1ZNNgwJbbj:;awJbbj:;9GEgDJbbjZaDJbbjZ9FEavNJbbbZJbbb:;awJbbbb9GEMgw:lJbbb9p9DTmbaw:Ohqxekcjjjj94hqkabcdfaq87ebdndnalaicefciGcdtfIdbJ;Zl:1ZNaoNgwJbbj:;awJbbj:;9GEgDJbbjZaDJbbjZ9FEavNJbbbZJbbb:;awJbbbb9GEMgw:lJbbb9p9DTmbaw:Ohqxekcjjjj94hqkabaq87ebdndnaoalaicufciGcdtfIdbJ;Zl:1ZNNgoJbbj:;aoJbbj:;9GEgwJbbjZawJbbjZ9FEavNJbbbZJbbb:;aoJbbbb9GEMgo:lJbbb9p9DTmbao:Ohixekcjjjj94hikabclfai87ebabcwfhbalczfhlaecufgembkkk;3viDue99eu8Jjjjjbcjd9Rgo8Kjjjjbadcd4hrdndndndnavcd9hmbadcl6meaohwarhDinawc:CuBdbawclfhwaDcufgDmbkaeTmiadcl6mdarcdthqalhkcbhxinaohwakhDarhminawawydbgPcbaDIdbgs:8cL4cFeGc:cufasJbbbb9BEgzaPaz9kEBdbaDclfhDawclfhwamcufgmmbkakaqfhkaxcefgxaeSmixbkkaeTmdxekaeTmekarcdthkavce9hhqadcl6hdcbhxindndndnaqmbadmdc:CuhDalhwarhminaDcbawIdbgs:8cL4cFeGc:cufasJbbbb9BEgPaDaP9kEhDawclfhwamcufgmmbxdkkc:CuhDdndnavPleddbdkadmdaohwalhmarhPinawcbamIdbgs:8cL4cFeGgzc;:bazc;:b0Ec:cufasJbbbb9BEBdbamclfhmawclfhwaPcufgPmbxdkkadmecbhwarhminaoawfcbalawfIdbgs:8cL4cFeGgPc8AaPc8A0Ec:cufasJbbbb9BEBdbawclfhwamcufgmmbkkadmbcbhwarhPinaDhmdnavceSmbaoawfydbhmkdndnalawfIdbgscjjj;8iamai9RcefgmcLt9R::NJbbbZJbbb:;asJbbbb9GEMgs:lJbbb9p9DTmbas:Ohzxekcjjjj94hzkabawfazcFFFrGamcKtVBdbawclfhwaPcufgPmbkkabakfhbalakfhlaxcefgxae9hmbkkaocjdf8Kjjjjbk;YqdXui998Jjjjjbc:qd9Rgv8Kjjjjbavc:Sefcbc;Kbz:wjjjb8AcbhodnadTmbcbhoaiTmbdndnabaeSmbaehrxekavcuadcdtgwadcFFFFi0Ecbyd;u:kjjbHjjjjbbgrBd:SeavceBd:mdaraeawz:vjjjb8Akavc:GefcwfcbBdbav9cb83i:Geavc:Gefaradaiavc:Sefz:ojjjbavyd:GehDadci9Ugqcbyd;u:kjjbHjjjjbbheavc:Sefavyd:mdgkcdtfaeBdbavakcefgwBd:mdaecbaqz:wjjjbhxavc:SefawcdtfcuaicdtaicFFFFi0Ecbyd;u:kjjbHjjjjbbgmBdbavakcdfgPBd:mdalc;ebfhsaDheamhwinawalIdbasaeydbgzcwazcw6EcdtfIdbMUdbaeclfheawclfhwaicufgimbkavc:SefaPcdtfcuaqcdtadcFFFF970Ecbyd;u:kjjbHjjjjbbgPBdbdnadci6mbarheaPhwaqhiinawamaeydbcdtfIdbamaeclfydbcdtfIdbMamaecwfydbcdtfIdbMUdbaecxfheawclfhwaicufgimbkkakcifhoalc;ebfhHavc;qbfhOavheavyd:KehAavyd:OehCcbhzcbhwcbhXcehQinaehLcihkarawci2gKcdtfgeydbhsaeclfydbhdabaXcx2fgicwfaecwfydbgYBdbaiclfadBdbaiasBdbaxawfce86bbaOaYBdwaOadBdlaOasBdbaPawcdtfcbBdbdnazTmbcihkaLhiinaOakcdtfaiydbgeBdbakaeaY9haeas9haead9hGGfhkaiclfhiazcufgzmbkkaXcefhXcbhzinaCaAarazaKfcdtfydbcdtgifydbcdtfgYheaDaifgdydbgshidnasTmbdninaeydbawSmeaeclfheaicufgiTmdxbkkaeaYascdtfc98fydbBdbadadydbcufBdbkazcefgzci9hmbkdndnakTmbcuhwJbbbbh8Acbhdavyd:KehYavyd:OehKindndnaDaOadcdtfydbcdtgzfydbgembadcefhdxekadcs0hiamazfgsIdbhEasalcbadcefgdaiEcdtfIdbaHaecwaecw6EcdtfIdbMg3Udba3aE:th3aecdthiaKaYazfydbcdtfheinaPaeydbgzcdtfgsa3asIdbMgEUdbaEa8Aa8AaE9DgsEh8AazawasEhwaeclfheaic98fgimbkkadak9hmbkawcu9hmekaQaq9pmdindnaxaQfRbbmbaQhwxdkaqaQcefgQ9hmbxikkakczakcz6EhzaOheaLhOawcu9hmbkkaocdtavc:Seffc98fhedninaoTmeaeydbcbyd;q:kjjbH:bjjjbbaec98fheaocufhoxbkkavc:qdf8Kjjjjbk;IlevucuaicdtgvaicFFFFi0Egocbyd;u:kjjbHjjjjbbhralalyd9GgwcdtfarBdbalawcefBd9GabarBdbaocbyd;u:kjjbHjjjjbbhralalyd9GgocdtfarBdbalaocefBd9GabarBdlcuadcdtadcFFFFi0Ecbyd;u:kjjbHjjjjbbhralalyd9GgocdtfarBdbalaocefBd9GabarBdwabydbcbavz:wjjjb8Aadci9UhDdnadTmbabydbhoaehladhrinaoalydbcdtfgvavydbcefBdbalclfhlarcufgrmbkkdnaiTmbabydbhlabydlhrcbhvaihoinaravBdbarclfhralydbavfhvalclfhlaocufgombkkdnadci6mbabydlhrabydwhvcbhlinaecwfydbhoaeclfydbhdaraeydbcdtfgwawydbgwcefBdbavawcdtfalBdbaradcdtfgdadydbgdcefBdbavadcdtfalBdbaraocdtfgoaoydbgocefBdbavaocdtfalBdbaecxfheaDalcefgl9hmbkkdnaiTmbabydlheabydbhlinaeaeydbalydb9RBdbalclfhlaeclfheaicufgimbkkkQbabaeadaic;K1jjbz:njjjbkQbabaeadaic;m:jjjbz:njjjbk9DeeuabcFeaicdtz:wjjjbhlcbhbdnadTmbindnalaeydbcdtfgiydbcu9hmbaiabBdbabcefhbkaeclfheadcufgdmbkkabk:Vvioud9:du8Jjjjjbc;Wa9Rgl8Kjjjjbcbhvalcxfcbc;Kbz:wjjjb8AalcuadcitgoadcFFFFe0Ecbyd;u:kjjbHjjjjbbgrBdxalceBd2araeadaicez:tjjjbalcuaoadcjjjjoGEcbyd;u:kjjbHjjjjbbgwBdzadcdthednadTmbabhiinaiavBdbaiclfhiadavcefgv9hmbkkawaefhDalabBdwalawBdl9cbhqindnadTmbaq9cq9:hkarhvaDhiadheinaiav8Pibak1:NcFrG87ebavcwfhvaicdfhiaecufgembkkalclfaq:NceGcdtfydbhxalclfaq9ce98gq:NceGcdtfydbhmalc;Wbfcbcjaz:wjjjb8AaDhvadhidnadTmbinalc;Wbfav8VebcdtfgeaeydbcefBdbavcdfhvaicufgimbkkcbhvcbhiinalc;WbfavfgeydbhoaeaiBdbaoaifhiavclfgvcja9hmbkadhvdndnadTmbinalc;WbfaDamydbgicetf8VebcdtfgeaeydbgecefBdbaxaecdtfaiBdbamclfhmavcufgvmbkaq9cv9smdcbhvinabawydbcdtfavBdbawclfhwadavcefgv9hmbxdkkaq9cv9smekkclhvdninavc98Smealcxfavfydbcbyd;q:kjjbH:bjjjbbavc98fhvxbkkalc;Waf8Kjjjjbk:Jwliuo99iud9:cbhv8Jjjjjbca9Rgoczfcwfcbyd:8:kjjbBdbaocb8Pd:0:kjjb83izaocwfcbyd;i:kjjbBdbaocb8Pd;a:kjjb83ibaicd4hrdndnadmbJFFuFhwJFFuuhDJFFuuhqJFFuFhkJFFuuhxJFFuFhmxekarcdthPaehsincbhiinaoczfaifgzasaifIdbgwazIdbgDaDaw9EEUdbaoaifgzawazIdbgDaDaw9DEUdbaiclfgicx9hmbkasaPfhsavcefgvad9hmbkaoIdKhDaoIdwhwaoIdChqaoIdlhkaoIdzhxaoIdbhmkdnadTmbJbbbbJbFu9hJbbbbamax:tgmamJbbbb9DEgmakaq:tgkakam9DEgkawaD:tgwawak9DEgw:vawJbbbb9BEhwdnalmbarcdthoindndnaeclfIdbaq:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikai:S9cC:ghHdndnaeIdbax:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikaHai:S:ehHdndnaecwfIdbaD:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikabaHai:T9cy:g:e83ibaeaofheabcwfhbadcufgdmbxdkkarcdthoindndnaeIdbax:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikai:SgH9ca:gaH9cz:g9cjjj;4s:d:eaH9cFe:d:e9cF:bj;4:pj;ar:d9c:bd9:9c:p;G:d;4j:E;ar:d9cH9:9c;d;H:W:y:m:g;d;Hb:d9cv9:9c;j:KM;j:KM;j:Kd:dhOdndnaeclfIdbaq:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikai:SgH9ca:gaH9cz:g9cjjj;4s:d:eaH9cFe:d:e9cF:bj;4:pj;ar:d9c:bd9:9c:p;G:d;4j:E;ar:d9cH9:9c;d;H:W:y:m:g;d;Hb:d9cq9:9cM;j:KM;j:KM;jl:daO:ehOdndnaecwfIdbaD:tawNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikabaOai:SgH9ca:gaH9cz:g9cjjj;4s:d:eaH9cFe:d:e9cF:bj;4:pj;ar:d9c:bd9:9c:p;G:d;4j:E;ar:d9cH9:9c;d;H:W:y:m:g;d;Hb:d9cC9:9c:KM;j:KM;j:KMD:d:e83ibaeaofheabcwfhbadcufgdmbkkk9teiucbcbyd;y:kjjbgeabcifc98GfgbBd;y:kjjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik;teeeudndnaeabVciGTmbabhixekdndnadcz9pmbabhixekabhiinaiaeydbBdbaiaeydlBdlaiaeydwBdwaiaeydxBdxaeczfheaiczfhiadc9Wfgdcs0mbkkadcl6mbinaiaeydbBdbaeclfheaiclfhiadc98fgdci0mbkkdnadTmbinaiaeRbb86bbaicefhiaecefheadcufgdmbkkabk:3eedudndnabciGTmbabhixekaecFeGc:b:c:ew2hldndnadcz9pmbabhixekabhiinaialBdxaialBdwaialBdlaialBdbaiczfhiadc9Wfgdcs0mbkkadcl6mbinaialBdbaiclfhiadc98fgdci0mbkkdnadTmbinaiae86bbaicefhiadcufgdmbkkabk9teiucbcbyd;y:kjjbgeabcrfc94GfgbBd;y:kjjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik9:eiuZbhedndncbyd;y:kjjbgdaecztgi9nmbcuheadai9RcFFifcz4nbcuSmekadhekcbabae9Rcifc98Gcbyd;y:kjjbfgdBd;y:kjjbdnadZbcztge9nmbadae9RcFFifcz4nb8Akkk;Qddbcjwk;mdbbbbdbbblbbbwbbbbbbbebbbdbbblbbbwbbbbbbbbbbbbbbbb4:h9w9N94:P:gW:j9O:ye9Pbbbbbbebbbdbbbebbbdbbbbbbbdbbbbbbbebbbbbbb:l29hZ;69:9kZ;N;76Z;rg97Z;z;o9xZ8J;B85Z;:;u9yZ;b;k9HZ:2;Z9DZ9e:l9mZ59A8KZ:r;T3Z:A:zYZ79OHZ;j4::8::Y:D9V8:bbbb9s:49:Z8R:hBZ9M9M;M8:L;z;o8:;8:PG89q;x:J878R:hQ8::M:B;e87bbbbbbjZbbjZbbjZ:E;V;N8::Y:DsZ9i;H;68:xd;R8:;h0838:;W:NoZbbbb:WV9O8:uf888:9i;H;68:9c9G;L89;n;m9m89;D8Ko8:bbbbf:8tZ9m836ZS:2AZL;zPZZ818EZ9e:lxZ;U98F8:819E;68:FFuuFFuuFFuuFFuFFFuFFFuFbc;mqkzebbbebbbdbbb9G:vbb",e=new Uint8Array([32,0,65,2,1,106,34,33,3,128,11,4,13,64,6,253,10,7,15,116,127,5,8,12,40,16,19,54,20,9,27,255,113,17,42,67,24,23,146,148,18,14,22,45,70,69,56,114,101,21,25,63,75,136,108,28,118,29,73,115]);if(typeof WebAssembly!="object")return{supported:!1};var s,r=WebAssembly.instantiate(a(t),{}).then(function(g){s=g.instance,s.exports.__wasm_call_ctors(),s.exports.meshopt_encodeVertexVersion(0),s.exports.meshopt_encodeIndexVersion(1)});function a(g){for(var p=new Uint8Array(g.length),d=0;d<g.length;++d){var m=g.charCodeAt(d);p[d]=m>96?m-97:m>64?m-39:m+4}for(var h=0,d=0;d<g.length;++d)p[h++]=p[d]<60?e[p[d]]:(p[d]-60)*64+p[++d];return p.buffer.slice(0,h)}function n(g){if(!g)throw new Error("Assertion failed")}function i(g){return new Uint8Array(g.buffer,g.byteOffset,g.byteLength)}function o(g,p,d,m){var h=s.exports.sbrk,y=h(p.length*4),w=h(d*4),v=new Uint8Array(s.exports.memory.buffer),x=i(p);v.set(x,y),m&&m(y,y,p.length,d);var S=g(w,y,p.length,d);v=new Uint8Array(s.exports.memory.buffer);var T=new Uint32Array(d);new Uint8Array(T.buffer).set(v.subarray(w,w+d*4)),x.set(v.subarray(y,y+p.length*4)),h(y-h(0));for(var A=0;A<p.length;++A)p[A]=T[p[A]];return[T,S]}function c(g,p,d,m){var h=s.exports.sbrk,y=h(d*4),w=h(d*m),v=new Uint8Array(s.exports.memory.buffer);v.set(i(p),w),g(y,w,d,m),v=new Uint8Array(s.exports.memory.buffer);var x=new Uint32Array(d);return new Uint8Array(x.buffer).set(v.subarray(y,y+d*4)),h(y-h(0)),x}function l(g,p,d,m,h){var y=s.exports.sbrk,w=y(p),v=y(m*h),x=new Uint8Array(s.exports.memory.buffer);x.set(i(d),v);var S=g(w,p,v,m,h),T=new Uint8Array(S);return T.set(x.subarray(w,w+S)),y(w-y(0)),T}function u(g){for(var p=0,d=0;d<g.length;++d){var m=g[d];p=p<m?m:p}return p}function f(g,p){if(n(p==2||p==4),p==4)return new Uint32Array(g.buffer,g.byteOffset,g.byteLength/4);var d=new Uint16Array(g.buffer,g.byteOffset,g.byteLength/2);return new Uint32Array(d)}function b(g,p,d,m,h,y,w){var v=s.exports.sbrk,x=v(d*m),S=v(d*y),T=new Uint8Array(s.exports.memory.buffer);T.set(i(p),S),g(x,d,m,h,S,w);var A=new Uint8Array(d*m);return A.set(T.subarray(x,x+d*m)),v(x-v(0)),A}return{ready:r,supported:!0,reorderMesh:function(g,p,d){var m=p?d?s.exports.meshopt_optimizeVertexCacheStrip:s.exports.meshopt_optimizeVertexCache:void 0;return o(s.exports.meshopt_optimizeVertexFetchRemap,g,u(g)+1,m)},reorderPoints:function(g,p){return n(g instanceof Float32Array),n(g.length%p==0),n(p>=3),c(s.exports.meshopt_spatialSortRemap,g,g.length/p,p*4)},encodeVertexBuffer:function(g,p,d){n(d>0&&d<=256),n(d%4==0);var m=s.exports.meshopt_encodeVertexBufferBound(p,d);return l(s.exports.meshopt_encodeVertexBuffer,m,g,p,d)},encodeIndexBuffer:function(g,p,d){n(d==2||d==4),n(p%3==0);var m=f(g,d),h=s.exports.meshopt_encodeIndexBufferBound(p,u(m)+1);return l(s.exports.meshopt_encodeIndexBuffer,h,m,p,4)},encodeIndexSequence:function(g,p,d){n(d==2||d==4);var m=f(g,d),h=s.exports.meshopt_encodeIndexSequenceBound(p,u(m)+1);return l(s.exports.meshopt_encodeIndexSequence,h,m,p,4)},encodeGltfBuffer:function(g,p,d,m){var h={ATTRIBUTES:this.encodeVertexBuffer,TRIANGLES:this.encodeIndexBuffer,INDICES:this.encodeIndexSequence};return n(h[m]),h[m](g,p,d)},encodeFilterOct:function(g,p,d,m){return n(d==4||d==8),n(m>=1&&m<=16),b(s.exports.meshopt_encodeFilterOct,g,p,d,m,16)},encodeFilterQuat:function(g,p,d,m){return n(d==8),n(m>=4&&m<=16),b(s.exports.meshopt_encodeFilterQuat,g,p,d,m,16)},encodeFilterExp:function(g,p,d,m,h){n(d>0&&d%4==0),n(m>=1&&m<=24);var y={Separate:0,SharedVector:1,SharedComponent:2,Clamped:3};return b(s.exports.meshopt_encodeFilterExp,g,p,d,m,d,h?y[h]:1)}}})();var ya=(function(){var t="b9H79Tebbbe8Fv9Gbb9Gvuuuuueu9Giuuub9Geueu9Giuuueuikqbeeedddillviebeoweuec:W:Odkr;leDo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bb8A9TW79O9V9Wt9F9KW9J9V9KW9wWVtW949c919M9MWVbeY9TW79O9V9Wt9F9KW9J9V9KW69U9KW949c919M9MWVbdE9TW79O9V9Wt9F9KW9J9V9KW69U9KW949tWG91W9U9JWbiL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9p9JtblK9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9r919HtbvL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWVT949Wbol79IV9Rbrq:S86qdbk;jYi5ud9:du8Jjjjjbcj;kb9Rgv8Kjjjjbc9:hodnalTmbcuhoaiRbbgrc;WeGc:Ge9hmbarcsGgwce0mbc9:hoalcufadcd4cbawEgDadfgrcKcaawEgqaraq0Egk6mbaicefhxcj;abad9Uc;WFbGcjdadca0EhmaialfgPar9Rgoadfhsavaoadz1jjjbgzceVhHcbhOdndninaeaO9nmeaPax9RaD6mdamaeaO9RaOamfgoae6EgAcsfglc9WGhCabaOad2fhXaAcethQaxaDfhiaOaeaoaeao6E9RhLalcl4cifcd4hKazcj;cbfaAfhYcbh8AazcjdfhEaHh3incbhodnawTmbaxa8Acd4fRbbhokaocFeGh5cbh8Eazcj;cbfhqinaih8Fdndndndna5a8Ecet4ciGgoc9:fPdebdkaPa8F9RaA6mrazcj;cbfa8EaA2fa8FaAz1jjjb8Aa8FaAfhixdkazcj;cbfa8EaA2fcbaAz:jjjjb8Aa8FhixekaPa8F9RaK6mva8FaKfhidnaCTmbaPai9RcK6mbaocdtc:q1jjbfcj1jjbawEhaczhrcbhlinargoc9Wfghaqfhrdndndndndndnaaa8Fahco4fRbbalcoG4ciGcdtfydbPDbedvivvvlvkar9cb83bbarcwf9cb83bbxlkarcbaiRbdai8Xbb9c:c:qj:bw9:9c:q;c1:I1e:d9c:b:c:e1z9:gg9cjjjjjz:dg8J9qE86bbaqaofgrcGfag9c8F1:NghcKtc8F91aicdfa8J9c8N1:Nfg8KRbbG86bbarcVfcba8KahcjeGcr4fghRbbag9cjjjjjl:dg8J9qE86bbarc7fcbaha8J9c8L1:NfghRbbag9cjjjjjd:dg8J9qE86bbarctfcbaha8J9c8K1:NfghRbbag9cjjjjje:dg8J9qE86bbarc91fcbaha8J9c8J1:NfghRbbag9cjjjj;ab:dg8J9qE86bbarc4fcbaha8J9cg1:NfghRbbag9cjjjja:dg8J9qE86bbarc93fcbaha8J9ch1:NfghRbbag9cjjjjz:dgg9qE86bbarc94fcbahag9ca1:NfghRbbai8Xbe9c:c:qj:bw9:9c:q;c1:I1e:d9c:b:c:e1z9:gg9cjjjjjz:dg8J9qE86bbarc95fag9c8F1:NgicKtc8F91aha8J9c8N1:NfghRbbG86bbarc96fcbahaicjeGcr4fgiRbbag9cjjjjjl:dg8J9qE86bbarc97fcbaia8J9c8L1:NfgiRbbag9cjjjjjd:dg8J9qE86bbarc98fcbaia8J9c8K1:NfgiRbbag9cjjjjje:dg8J9qE86bbarc99fcbaia8J9c8J1:NfgiRbbag9cjjjj;ab:dg8J9qE86bbarc9:fcbaia8J9cg1:NfgiRbbag9cjjjja:dg8J9qE86bbarcufcbaia8J9ch1:NfgiRbbag9cjjjjz:dgg9qE86bbaiag9ca1:NfhixikaraiRblaiRbbghco4g8Ka8KciSg8KE86bbaqaofgrcGfaiclfa8Kfg8KRbbahcl4ciGg8La8LciSg8LE86bbarcVfa8Ka8Lfg8KRbbahcd4ciGg8La8LciSg8LE86bbarc7fa8Ka8Lfg8KRbbahciGghahciSghE86bbarctfa8Kahfg8KRbbaiRbeghco4g8La8LciSg8LE86bbarc91fa8Ka8Lfg8KRbbahcl4ciGg8La8LciSg8LE86bbarc4fa8Ka8Lfg8KRbbahcd4ciGg8La8LciSg8LE86bbarc93fa8Ka8Lfg8KRbbahciGghahciSghE86bbarc94fa8Kahfg8KRbbaiRbdghco4g8La8LciSg8LE86bbarc95fa8Ka8Lfg8KRbbahcl4ciGg8La8LciSg8LE86bbarc96fa8Ka8Lfg8KRbbahcd4ciGg8La8LciSg8LE86bbarc97fa8Ka8Lfg8KRbbahciGghahciSghE86bbarc98fa8KahfghRbbaiRbigico4g8Ka8KciSg8KE86bbarc99faha8KfghRbbaicl4ciGg8Ka8KciSg8KE86bbarc9:faha8KfghRbbaicd4ciGg8Ka8KciSg8KE86bbarcufaha8KfgrRbbaiciGgiaiciSgiE86bbaraifhixdkaraiRbwaiRbbghcl4g8Ka8KcsSg8KE86bbaqaofgrcGfaicwfa8Kfg8KRbbahcsGghahcsSghE86bbarcVfa8KahfghRbbaiRbeg8Kcl4g8La8LcsSg8LE86bbarc7faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarctfaha8KfghRbbaiRbdg8Kcl4g8La8LcsSg8LE86bbarc91faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc4faha8KfghRbbaiRbig8Kcl4g8La8LcsSg8LE86bbarc93faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc94faha8KfghRbbaiRblg8Kcl4g8La8LcsSg8LE86bbarc95faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc96faha8KfghRbbaiRbvg8Kcl4g8La8LcsSg8LE86bbarc97faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc98faha8KfghRbbaiRbog8Kcl4g8La8LcsSg8LE86bbarc99faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc9:faha8KfghRbbaiRbrgicl4g8Ka8KcsSg8KE86bbarcufaha8KfgrRbbaicsGgiaicsSgiE86bbaraifhixekarai8Pbb83bbarcwfaicwf8Pbb83bbaiczfhikdnaoaC9pmbalcdfhlaoczfhraPai9RcL0mekkaoaC6moaimexokaCmva8FTmvkaqaAfhqa8Ecefg8Ecl9hmbkdndndndnawTmbasa8Acd4fRbbgociGPlbedrbkaATmdaza8Afh8Fazcj;cbfhhcbh8EaEhaina8FRbbhraahocbhlinaoahalfRbbgqce4cbaqceG9R7arfgr86bbaoadfhoaAalcefgl9hmbkaacefhaa8Fcefh8FahaAfhha8Ecefg8Ecl9hmbxikkaATmeaza8Afhaazcj;cbfhhcbhoceh8EaYh8FinaEaofhlaa8Vbbhrcbhoinala8FaofRbbcwtahaofRbbgqVc;:FiGce4cbaqceG9R7arfgr87bbaladfhlaLaocefgofmbka8FaQfh8FcdhoaacdfhaahaQfhha8EceGhlcbh8EalmbxdkkaATmbcbaocl49Rh8Eaza8AfRbbhqcwhoa3hlinalRbbaotaqVhqalcefhlaocwfgoca9hmbkcbhhaEh8FaYhainazcj;cbfahfRbbhrcwhoaahlinalRbbaotarVhralaAfhlaocwfgoca9hmbkara8E93aq7hqcbhoa8Fhlinalaqao486bbalcefhlaocwfgoca9hmbka8Fadfh8FaacefhaahcefghaA9hmbkkaEclfhEa3clfh3a8Aclfg8Aad6mbkaXazcjdfaAad2z1jjjb8AazazcjdfaAcufad2fadz1jjjb8AaAaOfhOaihxaimbkc9:hoxdkcbc99aPax9RakSEhoxekc9:hokavcj;kbf8Kjjjjbaok:XseHu8Jjjjjbc;ae9Rgv8Kjjjjbc9:hodnaeci9UgrcHfal0mbcuhoaiRbbgwc;WeGc;Ge9hmbawcsGgDce0mbavc;abfcFecjez:jjjjb8AavcUf9cu83ibavc8Wf9cu83ibavcyf9cu83ibavcaf9cu83ibavcKf9cu83ibavczf9cu83ibav9cu83iwav9cu83ibaialfc9WfhqaicefgwarfhldnaeTmbcmcsaDceSEhkcbhxcbhmcbhrcbhicbhoindnalaq9nmbc9:hoxikdndnawRbbgDc;Ve0mbavc;abfaoaDcu7gPcl4fcsGcitfgsydlhzasydbhHdndnaDcsGgsak9pmbavaiaPfcsGcdtfydbaxasEhDaxasTgOfhxxekdndnascsSmbcehOasc987asamffcefhDxekalcefhDal8SbbgscFeGhPdndnascu9mmbaDhlxekalcvfhlaPcFbGhPcrhsdninaD8SbbgOcFbGastaPVhPaOcu9kmeaDcefhDascrfgsc8J9hmbxdkkaDcefhlkcehOaPce4cbaPceG9R7amfhDkaDhmkavc;abfaocitfgsaDBdbasazBdlavaicdtfaDBdbavc;abfaocefcsGcitfgsaHBdbasaDBdlaocdfhoaOaifhidnadcd9hmbabarcetfgsaH87ebasclfaD87ebascdfaz87ebxdkabarcdtfgsaHBdbascwfaDBdbasclfazBdbxekdnaDcpe0mbaxcefgOavaiaqaDcsGfRbbgscl49RcsGcdtfydbascz6gPEhDavaias9RcsGcdtfydbaOaPfgzascsGgOEhsaOThOdndnadcd9hmbabarcetfgHax87ebaHclfas87ebaHcdfaD87ebxekabarcdtfgHaxBdbaHcwfasBdbaHclfaDBdbkavaicdtfaxBdbavc;abfaocitfgHaDBdbaHaxBdlavaicefgicsGcdtfaDBdbavc;abfaocefcsGcitfgHasBdbaHaDBdlavaiaPfgicsGcdtfasBdbavc;abfaocdfcsGcitfgDaxBdbaDasBdlaocifhoaiaOfhiazaOfhxxekaxcbalRbbgHEgAaDc;:eSgDfhzaHcsGhCaHcl4hXdndnaHcs0mbazcefhOxekazhOavaiaX9RcsGcdtfydbhzkdndnaCmbaOcefhxxekaOhxavaiaH9RcsGcdtfydbhOkdndnaDTmbalcefhDxekalcdfhDal8SbegPcFeGhsdnaPcu9kmbalcofhAascFbGhscrhldninaD8SbbgPcFbGaltasVhsaPcu9kmeaDcefhDalcrfglc8J9hmbkaAhDxekaDcefhDkasce4cbasceG9R7amfgmhAkdndnaXcsSmbaDhsxekaDcefhsaD8SbbglcFeGhPdnalcu9kmbaDcvfhzaPcFbGhPcrhldninas8SbbgDcFbGaltaPVhPaDcu9kmeascefhsalcrfglc8J9hmbkazhsxekascefhskaPce4cbaPceG9R7amfgmhzkdndnaCcsSmbashlxekascefhlas8SbbgDcFeGhPdnaDcu9kmbascvfhOaPcFbGhPcrhDdninal8SbbgscFbGaDtaPVhPascu9kmealcefhlaDcrfgDc8J9hmbkaOhlxekalcefhlkaPce4cbaPceG9R7amfgmhOkdndnadcd9hmbabarcetfgDaA87ebaDclfaO87ebaDcdfaz87ebxekabarcdtfgDaABdbaDcwfaOBdbaDclfazBdbkavc;abfaocitfgDazBdbaDaABdlavaicdtfaABdbavc;abfaocefcsGcitfgDaOBdbaDazBdlavaicefgicsGcdtfazBdbavc;abfaocdfcsGcitfgDaABdbaDaOBdlavaiaHcz6aXcsSVfgicsGcdtfaOBdbaiaCTaCcsSVfhiaocifhokawcefhwaocsGhoaicsGhiarcifgrae6mbkkcbc99alaqSEhokavc;aef8Kjjjjbaok:clevu8Jjjjjbcz9Rhvdnaecvfal9nmbc9:skdnaiRbbc;:eGc;qeSmbcuskav9cb83iwaicefhoaialfc98fhrdnaeTmbdnadcdSmbcbhwindnaoar6mbc9:skaocefhlao8SbbgicFeGhddndnaicu9mmbalhoxekaocvfhoadcFbGhdcrhidninal8SbbgDcFbGaitadVhdaDcu9kmealcefhlaicrfgic8J9hmbxdkkalcefhokabawcdtfadc8Etc8F91adcd47avcwfadceGcdtVglydbfgiBdbalaiBdbawcefgwae9hmbxdkkcbhwindnaoar6mbc9:skaocefhlao8SbbgicFeGhddndnaicu9mmbalhoxekaocvfhoadcFbGhdcrhidninal8SbbgDcFbGaitadVhdaDcu9kmealcefhlaicrfgic8J9hmbxdkkalcefhokabawcetfadc8Etc8F91adcd47avcwfadceGcdtVglydbfgi87ebalaiBdbawcefgwae9hmbkkcbc99aoarSEk:Lvoeue99dud99eud99dndnadcl9hmbaeTmeindndnabcdfgd8Sbb:Yab8Sbbgi:Ygl:l:tabcefgv8Sbbgo:Ygr:l:tgwJbb;:9cawawNJbbbbawawJbbbb9GgDEgq:mgkaqaicb9iEalMgwawNakaqaocb9iEarMgqaqNMM:r:vglNJbbbZJbbb:;aDEMgr:lJbbb9p9DTmbar:Ohixekcjjjj94hikadai86bbdndnaqalNJbbbZJbbb:;aqJbbbb9GEMgq:lJbbb9p9DTmbaq:Ohdxekcjjjj94hdkavad86bbdndnawalNJbbbZJbbb:;awJbbbb9GEMgw:lJbbb9p9DTmbaw:Ohdxekcjjjj94hdkabad86bbabclfhbaecufgembxdkkaeTmbindndnabclfgd8Ueb:Yab8Uebgi:Ygl:l:tabcdfgv8Uebgo:Ygr:l:tgwJb;:FSawawNJbbbbawawJbbbb9GgDEgq:mgkaqaicb9iEalMgwawNakaqaocb9iEarMgqaqNMM:r:vglNJbbbZJbbb:;aDEMgr:lJbbb9p9DTmbar:Ohixekcjjjj94hikadai87ebdndnaqalNJbbbZJbbb:;aqJbbbb9GEMgq:lJbbb9p9DTmbaq:Ohdxekcjjjj94hdkavad87ebdndnawalNJbbbZJbbb:;awJbbbb9GEMgw:lJbbb9p9DTmbaw:Ohdxekcjjjj94hdkabad87ebabcwfhbaecufgembkkk;oiliui99iue99dnaeTmbcbhiabhlindndnJ;Zl81Zalcof8UebgvciV:Y:vgoal8Ueb:YNgrJb;:FSNJbbbZJbbb:;arJbbbb9GEMgw:lJbbb9p9DTmbaw:OhDxekcjjjj94hDkalclf8Uebhqalcdf8UebhkabaiavcefciGfcetfaD87ebdndnaoak:YNgwJb;:FSNJbbbZJbbb:;awJbbbb9GEMgx:lJbbb9p9DTmbax:OhDxekcjjjj94hDkabaiavciGfgkcd7cetfaD87ebdndnaoaq:YNgoJb;:FSNJbbbZJbbb:;aoJbbbb9GEMgx:lJbbb9p9DTmbax:OhDxekcjjjj94hDkabaiavcufciGfcetfaD87ebdndnJbbjZararN:tawawN:taoaoN:tgrJbbbbarJbbbb9GE:rJb;:FSNJbbbZMgr:lJbbb9p9DTmbar:Ohvxekcjjjj94hvkabakcetfav87ebalcwfhlaiclfhiaecufgembkkk9mbdnadcd4ae2gdTmbinababydbgecwtcw91:Yaece91cjjj98Gcjjj;8if::NUdbabclfhbadcufgdmbkkk9teiucbcbyd:K1jjbgeabcifc98GfgbBd:K1jjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik;teeeudndnaeabVciGTmbabhixekdndnadcz9pmbabhixekabhiinaiaeydbBdbaiaeydlBdlaiaeydwBdwaiaeydxBdxaeczfheaiczfhiadc9Wfgdcs0mbkkadcl6mbinaiaeydbBdbaeclfheaiclfhiadc98fgdci0mbkkdnadTmbinaiaeRbb86bbaicefhiaecefheadcufgdmbkkabk:3eedudndnabciGTmbabhixekaecFeGc:b:c:ew2hldndnadcz9pmbabhixekabhiinaialBdxaialBdwaialBdlaialBdbaiczfhiadc9Wfgdcs0mbkkadcl6mbinaialBdbaiclfhiadc98fgdci0mbkkdnadTmbinaiae86bbaicefhiadcufgdmbkkabkk81dbcjwk8Kbbbbdbbblbbbwbbbbbbbebbbdbbblbbbwbbbbc:Kwkl8WNbb",e="b9H79TebbbeKl9Gbb9Gvuuuuueu9Giuuub9Geueuikqbbebeedddilve9Weeeviebeoweuec:q:6dkr;leDo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bb8A9TW79O9V9Wt9F9KW9J9V9KW9wWVtW949c919M9MWVbdY9TW79O9V9Wt9F9KW9J9V9KW69U9KW949c919M9MWVblE9TW79O9V9Wt9F9KW9J9V9KW69U9KW949tWG91W9U9JWbvL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9p9JtboK9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9r919HtbrL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWVT949Wbwl79IV9RbDq;G9Mqlbzik9:evu8Jjjjjbcz9Rhbcbheincbhdcbhiinabcwfadfaicjuaead4ceGglE86bbaialfhiadcefgdcw9hmbkaec:q:yjjbfai86bbaecitc:q1jjbfab8Piw83ibaecefgecjd9hmbkk:183lYud97dur978Jjjjjbcj;kb9Rgv8Kjjjjbc9:hodnalTmbcuhoaiRbbgrc;WeGc:Ge9hmbarcsGgwce0mbc9:hoalcufadcd4cbawEgDadfgrcKcaawEgqaraq0Egk6mbaicefhxavaialfgmar9Rgoad;8qbbcj;abad9Uc;WFbGcjdadca0EhPdndndnadTmbaoadfhscbhzinaeaz9nmdamax9RaD6miabazad2fhHaxaDfhOaPaeaz9RazaPfae6EgAcsfgocl4cifcd4hCavcj;cbfaoc9WGgXcetfhQavcj;cbfaXci2fhLavcj;cbfaXfhKcbhYaoc;ab6h8AincbhodnawTmbaxaYcd4fRbbhokaocFeGhEcbh3avcj;cbfh5indndndndnaEa3cet4ciGgoc9:fPdebdkamaO9RaX6mwavcj;cbfa3aX2faOaX;8qbbaOaAfhOxdkavcj;cbfa3aX2fcbaX;8kbxekamaO9RaC6moaoclVcbawEhraOaCfhocbhidna8Ambamao9Rc;Gb6mbcbhlina5alfhidndndndndndnaOalco4fRbbgqciGarfPDbedibledibkaipxbbbbbbbbbbbbbbbbpklbxlkaiaopbblaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLg8Ecdp:mea8EpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9og8Fpxiiiiiiiiiiiiiiiip8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaoclffahc:q:yjjbfRbbfhoxikaiaopbbwaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9og8Fpxssssssssssssssssp8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaocwffahc:q:yjjbfRbbfhoxdkaiaopbbbpklbaoczfhoxekaiaopbbdaoRbbgacitc:q1jjbfpbibaac:q:yjjbfRbbgapsaoRbeghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPpklbaaaocdffahc:q:yjjbfRbbfhokdndndndndndnaqcd4ciGarfPDbedibledibkaiczfpxbbbbbbbbbbbbbbbbpklbxlkaiczfaopbblaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLg8Ecdp:mea8EpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9og8Fpxiiiiiiiiiiiiiiiip8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaoclffahc:q:yjjbfRbbfhoxikaiczfaopbbwaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9og8Fpxssssssssssssssssp8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaocwffahc:q:yjjbfRbbfhoxdkaiczfaopbbbpklbaoczfhoxekaiczfaopbbdaoRbbgacitc:q1jjbfpbibaac:q:yjjbfRbbgapsaoRbeghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPpklbaaaocdffahc:q:yjjbfRbbfhokdndndndndndnaqcl4ciGarfPDbedibledibkaicafpxbbbbbbbbbbbbbbbbpklbxlkaicafaopbblaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLg8Ecdp:mea8EpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9og8Fpxiiiiiiiiiiiiiiiip8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaoclffahc:q:yjjbfRbbfhoxikaicafaopbbwaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9og8Fpxssssssssssssssssp8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaaaocwffahc:q:yjjbfRbbfhoxdkaicafaopbbbpklbaoczfhoxekaicafaopbbdaoRbbgacitc:q1jjbfpbibaac:q:yjjbfRbbgapsaoRbeghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPpklbaaaocdffahc:q:yjjbfRbbfhokdndndndndndnaqco4arfPDbedibledibkaic8Wfpxbbbbbbbbbbbbbbbbpklbxlkaic8Wfaopbblaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLg8Ecdp:mea8EpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9og8Fpxiiiiiiiiiiiiiiiip8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngicitc:q1jjbfpbibaic:q:yjjbfRbbgipsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Ngqcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaiaoclffaqc:q:yjjbfRbbfhoxikaic8Wfaopbbwaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9og8Fpxssssssssssssssssp8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngicitc:q1jjbfpbibaic:q:yjjbfRbbgipsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Ngqcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spklbaiaocwffaqc:q:yjjbfRbbfhoxdkaic8Wfaopbbbpklbaoczfhoxekaic8WfaopbbdaoRbbgicitc:q1jjbfpbibaic:q:yjjbfRbbgipsaoRbegqcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPpklbaiaocdffaqc:q:yjjbfRbbfhokalc;abfhialcjefaX0meaihlamao9Rc;Fb0mbkkdnaiaX9pmbaici4hlinamao9RcK6mwa5aifhqdndndndndndnaOaico4fRbbalcoG4ciGarfPDbedibledibkaqpxbbbbbbbbbbbbbbbbpkbbxlkaqaopbblaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLg8Ecdp:mea8EpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9og8Fpxiiiiiiiiiiiiiiiip8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spkbbaaaoclffahc:q:yjjbfRbbfhoxikaqaopbbwaopbbbg8Eclp:mea8EpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9og8Fpxssssssssssssssssp8Jg8Ep5b9cjF;8;4;W;G;ab9:9cU1:Ngacitc:q1jjbfpbibaac:q:yjjbfRbbgapsa8Ep5e9cjF;8;4;W;G;ab9:9cU1:Nghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPa8Fa8Ep9spkbbaaaocwffahc:q:yjjbfRbbfhoxdkaqaopbbbpkbbaoczfhoxekaqaopbbdaoRbbgacitc:q1jjbfpbibaac:q:yjjbfRbbgapsaoRbeghcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPpkbbaaaocdffahc:q:yjjbfRbbfhokalcdfhlaiczfgiaX6mbkkaohOaoTmoka5aXfh5a3cefg3cl9hmbkdndndndnawTmbasaYcd4fRbbglciGPlbedwbkaXTmdavcjdfaYfhlavaYfpbdbhgcbhoinalavcj;cbfaofpblbg8JaKaofpblbg8KpmbzeHdOiAlCvXoQrLg8LaQaofpblbg8MaLaofpblbg8NpmbzeHdOiAlCvXoQrLgypmbezHdiOAlvCXorQLg8Ecep9Ta8Epxeeeeeeeeeeeeeeeeg8Fp9op9Hp9rg8Eagp9Uggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp9Uggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp9Uggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp9Uggp9Abbbaladfglaga8LaypmwDKYqk8AExm35Ps8E8Fg8Ecep9Ta8Ea8Fp9op9Hp9rg8Ep9Uggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp9Uggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp9Uggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp9Uggp9Abbbaladfglaga8Ja8KpmwKDYq8AkEx3m5P8Es8Fg8Ja8Ma8NpmwKDYq8AkEx3m5P8Es8Fg8KpmbezHdiOAlvCXorQLg8Ecep9Ta8Ea8Fp9op9Hp9rg8Ep9Uggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp9Uggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp9Uggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp9Uggp9Abbbaladfglaga8Ja8KpmwDKYqk8AExm35Ps8E8Fg8Ecep9Ta8Ea8Fp9op9Hp9rg8Ep9Ug8Fp9Abbbaladfgla8Fa8Ea8Epmlvorlvorlvorlvorp9Ug8Fp9Abbbaladfgla8Fa8Ea8EpmwDqkwDqkwDqkwDqkp9Ug8Fp9Abbbaladfgla8Fa8Ea8EpmxmPsxmPsxmPsxmPsp9Uggp9AbbbaladfhlaoczfgoaX6mbxikkaXTmeavcjdfaYfhlavaYfpbdbhgcbhoinalavcj;cbfaofpblbg8JaKaofpblbg8KpmbzeHdOiAlCvXoQrLg8LaQaofpblbg8MaLaofpblbg8NpmbzeHdOiAlCvXoQrLgypmbezHdiOAlvCXorQLg8Ecep:nea8Epxebebebebebebebebg8Fp9op:bep9rg8Eagp:oeggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp:oeggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp:oeggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp:oeggp9Abbbaladfglaga8LaypmwDKYqk8AExm35Ps8E8Fg8Ecep:nea8Ea8Fp9op:bep9rg8Ep:oeggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp:oeggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp:oeggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp:oeggp9Abbbaladfglaga8Ja8KpmwKDYq8AkEx3m5P8Es8Fg8Ja8Ma8NpmwKDYq8AkEx3m5P8Es8Fg8KpmbezHdiOAlvCXorQLg8Ecep:nea8Ea8Fp9op:bep9rg8Ep:oeggp9Abbbaladfglaga8Ea8Epmlvorlvorlvorlvorp:oeggp9Abbbaladfglaga8Ea8EpmwDqkwDqkwDqkwDqkp:oeggp9Abbbaladfglaga8Ea8EpmxmPsxmPsxmPsxmPsp:oeggp9Abbbaladfglaga8Ja8KpmwDKYqk8AExm35Ps8E8Fg8Ecep:nea8Ea8Fp9op:bep9rg8Ep:oeg8Fp9Abbbaladfgla8Fa8Ea8Epmlvorlvorlvorlvorp:oeg8Fp9Abbbaladfgla8Fa8Ea8EpmwDqkwDqkwDqkwDqkp:oeg8Fp9Abbbaladfgla8Fa8Ea8EpmxmPsxmPsxmPsxmPsp:oeggp9AbbbaladfhlaoczfgoaX6mbxdkkaXTmbcbhocbalcl4gl9Rc8FGhiavcjdfaYfhravaYfpbdbh8Finaravcj;cbfaofpblbggaKaofpblbg8JpmbzeHdOiAlCvXoQrLg8KaQaofpblbg8LaLaofpblbg8MpmbzeHdOiAlCvXoQrLg8NpmbezHdiOAlvCXorQLg8Eaip:Rea8Ealp:Sep9qg8Ea8Fp9rg8Fp9Abbbaradfgra8Fa8Ea8Epmlvorlvorlvorlvorp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmwDqkwDqkwDqkwDqkp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmxmPsxmPsxmPsxmPsp9rg8Fp9Abbbaradfgra8Fa8Ka8NpmwDKYqk8AExm35Ps8E8Fg8Eaip:Rea8Ealp:Sep9qg8Ep9rg8Fp9Abbbaradfgra8Fa8Ea8Epmlvorlvorlvorlvorp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmwDqkwDqkwDqkwDqkp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmxmPsxmPsxmPsxmPsp9rg8Fp9Abbbaradfgra8Faga8JpmwKDYq8AkEx3m5P8Es8Fgga8La8MpmwKDYq8AkEx3m5P8Es8Fg8JpmbezHdiOAlvCXorQLg8Eaip:Rea8Ealp:Sep9qg8Ep9rg8Fp9Abbbaradfgra8Fa8Ea8Epmlvorlvorlvorlvorp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmwDqkwDqkwDqkwDqkp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmxmPsxmPsxmPsxmPsp9rg8Fp9Abbbaradfgra8Faga8JpmwDKYqk8AExm35Ps8E8Fg8Eaip:Rea8Ealp:Sep9qg8Ep9rg8Fp9Abbbaradfgra8Fa8Ea8Epmlvorlvorlvorlvorp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmwDqkwDqkwDqkwDqkp9rg8Fp9Abbbaradfgra8Fa8Ea8EpmxmPsxmPsxmPsxmPsp9rg8Fp9AbbbaradfhraoczfgoaX6mbkkaYclfgYad6mbkaHavcjdfaAad2;8qbbavavcjdfaAcufad2fad;8qbbaAazfhzc9:hoaOhxaOmbxlkkaeTmbaDalfhrcbhocuhlinaralaD9RglfaD6mdaPaeao9RaoaPfae6Eaofgoae6mbkaial9Rhxkcbc99amax9RakSEhoxekc9:hokavcj;kbf8Kjjjjbaokwbz:bjjjbk:TseHu8Jjjjjbc;ae9Rgv8Kjjjjbc9:hodnaeci9UgrcHfal0mbcuhoaiRbbgwc;WeGc;Ge9hmbawcsGgDce0mbavc;abfcFecje;8kbavcUf9cu83ibavc8Wf9cu83ibavcyf9cu83ibavcaf9cu83ibavcKf9cu83ibavczf9cu83ibav9cu83iwav9cu83ibaialfc9WfhqaicefgwarfhldnaeTmbcmcsaDceSEhkcbhxcbhmcbhrcbhicbhoindnalaq9nmbc9:hoxikdndnawRbbgDc;Ve0mbavc;abfaoaDcu7gPcl4fcsGcitfgsydlhzasydbhHdndnaDcsGgsak9pmbavaiaPfcsGcdtfydbaxasEhDaxasTgOfhxxekdndnascsSmbcehOasc987asamffcefhDxekalcefhDal8SbbgscFeGhPdndnascu9mmbaDhlxekalcvfhlaPcFbGhPcrhsdninaD8SbbgOcFbGastaPVhPaOcu9kmeaDcefhDascrfgsc8J9hmbxdkkaDcefhlkcehOaPce4cbaPceG9R7amfhDkaDhmkavc;abfaocitfgsaDBdbasazBdlavaicdtfaDBdbavc;abfaocefcsGcitfgsaHBdbasaDBdlaocdfhoaOaifhidnadcd9hmbabarcetfgsaH87ebasclfaD87ebascdfaz87ebxdkabarcdtfgsaHBdbascwfaDBdbasclfazBdbxekdnaDcpe0mbaxcefgOavaiaqaDcsGfRbbgscl49RcsGcdtfydbascz6gPEhDavaias9RcsGcdtfydbaOaPfgzascsGgOEhsaOThOdndnadcd9hmbabarcetfgHax87ebaHclfas87ebaHcdfaD87ebxekabarcdtfgHaxBdbaHcwfasBdbaHclfaDBdbkavaicdtfaxBdbavc;abfaocitfgHaDBdbaHaxBdlavaicefgicsGcdtfaDBdbavc;abfaocefcsGcitfgHasBdbaHaDBdlavaiaPfgicsGcdtfasBdbavc;abfaocdfcsGcitfgDaxBdbaDasBdlaocifhoaiaOfhiazaOfhxxekaxcbalRbbgHEgAaDc;:eSgDfhzaHcsGhCaHcl4hXdndnaHcs0mbazcefhOxekazhOavaiaX9RcsGcdtfydbhzkdndnaCmbaOcefhxxekaOhxavaiaH9RcsGcdtfydbhOkdndnaDTmbalcefhDxekalcdfhDal8SbegPcFeGhsdnaPcu9kmbalcofhAascFbGhscrhldninaD8SbbgPcFbGaltasVhsaPcu9kmeaDcefhDalcrfglc8J9hmbkaAhDxekaDcefhDkasce4cbasceG9R7amfgmhAkdndnaXcsSmbaDhsxekaDcefhsaD8SbbglcFeGhPdnalcu9kmbaDcvfhzaPcFbGhPcrhldninas8SbbgDcFbGaltaPVhPaDcu9kmeascefhsalcrfglc8J9hmbkazhsxekascefhskaPce4cbaPceG9R7amfgmhzkdndnaCcsSmbashlxekascefhlas8SbbgDcFeGhPdnaDcu9kmbascvfhOaPcFbGhPcrhDdninal8SbbgscFbGaDtaPVhPascu9kmealcefhlaDcrfgDc8J9hmbkaOhlxekalcefhlkaPce4cbaPceG9R7amfgmhOkdndnadcd9hmbabarcetfgDaA87ebaDclfaO87ebaDcdfaz87ebxekabarcdtfgDaABdbaDcwfaOBdbaDclfazBdbkavc;abfaocitfgDazBdbaDaABdlavaicdtfaABdbavc;abfaocefcsGcitfgDaOBdbaDazBdlavaicefgicsGcdtfazBdbavc;abfaocdfcsGcitfgDaABdbaDaOBdlavaiaHcz6aXcsSVfgicsGcdtfaOBdbaiaCTaCcsSVfhiaocifhokawcefhwaocsGhoaicsGhiarcifgrae6mbkkcbc99alaqSEhokavc;aef8Kjjjjbaok:clevu8Jjjjjbcz9Rhvdnaecvfal9nmbc9:skdnaiRbbc;:eGc;qeSmbcuskav9cb83iwaicefhoaialfc98fhrdnaeTmbdnadcdSmbcbhwindnaoar6mbc9:skaocefhlao8SbbgicFeGhddndnaicu9mmbalhoxekaocvfhoadcFbGhdcrhidninal8SbbgDcFbGaitadVhdaDcu9kmealcefhlaicrfgic8J9hmbxdkkalcefhokabawcdtfadc8Etc8F91adcd47avcwfadceGcdtVglydbfgiBdbalaiBdbawcefgwae9hmbxdkkcbhwindnaoar6mbc9:skaocefhlao8SbbgicFeGhddndnaicu9mmbalhoxekaocvfhoadcFbGhdcrhidninal8SbbgDcFbGaitadVhdaDcu9kmealcefhlaicrfgic8J9hmbxdkkalcefhokabawcetfadc8Etc8F91adcd47avcwfadceGcdtVglydbfgi87ebalaiBdbawcefgwae9hmbkkcbc99aoarSEk:SPliuo97eue978Jjjjjbca9Rhiaec98Ghldndnadcl9hmbdnalTmbcbhvabhdinadadpbbbgocKp:RecKp:Sep;6egraocwp:RecKp:Sep;6earp;Geaoczp:RecKp:Sep;6egwp;Gep;Kep;LegDpxbbbbbbbbbbbbbbbbp:2egqarpxbbbjbbbjbbbjbbbjgkp9op9rp;Kegrpxbb;:9cbb;:9cbb;:9cbb;:9cararp;MeaDaDp;Meawaqawakp9op9rp;Kegrarp;Mep;Kep;Kep;Jep;Negwp;Mepxbbn0bbn0bbn0bbn0gqp;KepxFbbbFbbbFbbbFbbbp9oaopxbbbFbbbFbbbFbbbFp9op9qarawp;Meaqp;Kecwp:RepxbFbbbFbbbFbbbFbbp9op9qaDawp;Meaqp;Keczp:RepxbbFbbbFbbbFbbbFbp9op9qpkbbadczfhdavclfgval6mbkkalaeSmeaipxbbbbbbbbbbbbbbbbgqpklbaiabalcdtfgdaeciGglcdtgv;8qbbdnalTmbaiaipblbgocKp:RecKp:Sep;6egraocwp:RecKp:Sep;6earp;Geaoczp:RecKp:Sep;6egwp;Gep;Kep;LegDaqp:2egqarpxbbbjbbbjbbbjbbbjgkp9op9rp;Kegrpxbb;:9cbb;:9cbb;:9cbb;:9cararp;MeaDaDp;Meawaqawakp9op9rp;Kegrarp;Mep;Kep;Kep;Jep;Negwp;Mepxbbn0bbn0bbn0bbn0gqp;KepxFbbbFbbbFbbbFbbbp9oaopxbbbFbbbFbbbFbbbFp9op9qarawp;Meaqp;Kecwp:RepxbFbbbFbbbFbbbFbbp9op9qaDawp;Meaqp;Keczp:RepxbbFbbbFbbbFbbbFbp9op9qpklbkadaiav;8qbbskdnalTmbcbhvabhdinadczfgxaxpbbbgopxbbbbbbFFbbbbbbFFgkp9oadpbbbgDaopmbediwDqkzHOAKY8AEgwczp:Reczp:Sep;6egraDaopmlvorxmPsCXQL358E8FpxFubbFubbFubbFubbp9op;7eawczp:Sep;6egwp;Gearp;Gep;Kep;Legopxbbbbbbbbbbbbbbbbp:2egqarpxbbbjbbbjbbbjbbbjgmp9op9rp;Kegrpxb;:FSb;:FSb;:FSb;:FSararp;Meaoaop;Meawaqawamp9op9rp;Kegrarp;Mep;Kep;Kep;Jep;Negwp;Mepxbbn0bbn0bbn0bbn0gqp;KepxFFbbFFbbFFbbFFbbp9oaoawp;Meaqp;Keczp:Rep9qgoarawp;Meaqp;KepxFFbbFFbbFFbbFFbbp9ogrpmwDKYqk8AExm35Ps8E8Fp9qpkbbadaDakp9oaoarpmbezHdiOAlvCXorQLp9qpkbbadcafhdavclfgval6mbkkalaeSmbaiczfpxbbbbbbbbbbbbbbbbgopklbaiaopklbaiabalcitfgdaeciGglcitgv;8qbbdnalTmbaiaipblzgopxbbbbbbFFbbbbbbFFgkp9oaipblbgDaopmbediwDqkzHOAKY8AEgwczp:Reczp:Sep;6egraDaopmlvorxmPsCXQL358E8FpxFubbFubbFubbFubbp9op;7eawczp:Sep;6egwp;Gearp;Gep;Kep;Legopxbbbbbbbbbbbbbbbbp:2egqarpxbbbjbbbjbbbjbbbjgmp9op9rp;Kegrpxb;:FSb;:FSb;:FSb;:FSararp;Meaoaop;Meawaqawamp9op9rp;Kegrarp;Mep;Kep;Kep;Jep;Negwp;Mepxbbn0bbn0bbn0bbn0gqp;KepxFFbbFFbbFFbbFFbbp9oaoawp;Meaqp;Keczp:Rep9qgoarawp;Meaqp;KepxFFbbFFbbFFbbFFbbp9ogrpmwDKYqk8AExm35Ps8E8Fp9qpklzaiaDakp9oaoarpmbezHdiOAlvCXorQLp9qpklbkadaiav;8qbbkk:oDllue97euv978Jjjjjbc8W9Rhidnaec98GglTmbcbhvabhoinaiaopbbbgraoczfgwpbbbgDpmlvorxmPsCXQL358E8Fgqczp:Segkclp:RepklbaopxbbjZbbjZbbjZbbjZpx;Zl81Z;Zl81Z;Zl81Z;Zl81Zakpxibbbibbbibbbibbbp9qp;6ep;NegkaraDpmbediwDqkzHOAKY8AEgrczp:Reczp:Sep;6ep;MegDaDp;Meakarczp:Sep;6ep;Megxaxp;Meakaqczp:Reczp:Sep;6ep;Megqaqp;Mep;Kep;Kep;Lepxbbbbbbbbbbbbbbbbp:4ep;Jepxb;:FSb;:FSb;:FSb;:FSgkp;Mepxbbn0bbn0bbn0bbn0grp;KepxFFbbFFbbFFbbFFbbgmp9oaxakp;Mearp;Keczp:Rep9qgxaDakp;Mearp;Keamp9oaqakp;Mearp;Keczp:Rep9qgkpmbezHdiOAlvCXorQLgrp5baipblbpEb:T:j83ibaocwfarp5eaipblbpEe:T:j83ibawaxakpmwDKYqk8AExm35Ps8E8Fgkp5baipblbpEd:T:j83ibaocKfakp5eaipblbpEi:T:j83ibaocafhoavclfgval6mbkkdnalaeSmbaiczfpxbbbbbbbbbbbbbbbbgkpklbaiakpklbaiabalcitfgoaeciGgvcitgw;8qbbdnavTmbaiaipblbgraipblzgDpmlvorxmPsCXQL358E8Fgqczp:Segkclp:RepklaaipxbbjZbbjZbbjZbbjZpx;Zl81Z;Zl81Z;Zl81Z;Zl81Zakpxibbbibbbibbbibbbp9qp;6ep;NegkaraDpmbediwDqkzHOAKY8AEgrczp:Reczp:Sep;6ep;MegDaDp;Meakarczp:Sep;6ep;Megxaxp;Meakaqczp:Reczp:Sep;6ep;Megqaqp;Mep;Kep;Kep;Lepxbbbbbbbbbbbbbbbbp:4ep;Jepxb;:FSb;:FSb;:FSb;:FSgkp;Mepxbbn0bbn0bbn0bbn0grp;KepxFFbbFFbbFFbbFFbbgmp9oaxakp;Mearp;Keczp:Rep9qgxaDakp;Mearp;Keamp9oaqakp;Mearp;Keczp:Rep9qgkpmbezHdiOAlvCXorQLgrp5baipblapEb:T:j83ibaiarp5eaipblapEe:T:j83iwaiaxakpmwDKYqk8AExm35Ps8E8Fgkp5baipblapEd:T:j83izaiakp5eaipblapEi:T:j83iKkaoaiaw;8qbbkk;uddiue978Jjjjjbc;ab9Rhidnadcd4ae2glc98GgvTmbcbheabhdinadadpbbbgocwp:Recwp:Sep;6eaocep:SepxbbjFbbjFbbjFbbjFp9opxbbjZbbjZbbjZbbjZp:Uep;Mepkbbadczfhdaeclfgeav6mbkkdnavalSmbaic8WfpxbbbbbbbbbbbbbbbbgopklbaicafaopklbaiczfaopklbaiaopklbaiabavcdtfgdalciGgecdtgv;8qbbdnaeTmbaiaipblbgocwp:Recwp:Sep;6eaocep:SepxbbjFbbjFbbjFbbjFp9opxbbjZbbjZbbjZbbjZp:Uep;Mepklbkadaiav;8qbbkk9teiucbcbydj1jjbgeabcifc98GfgbBdj1jjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaikkkebcjwklz:Dbb",s=new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,3,2,0,0,5,3,1,0,1,12,1,0,10,22,2,12,0,65,0,65,0,65,0,252,10,0,0,11,7,0,65,0,253,15,26,11]),r=new Uint8Array([32,0,65,2,1,106,34,33,3,128,11,4,13,64,6,253,10,7,15,116,127,5,8,12,40,16,19,54,20,9,27,255,113,17,42,67,24,23,146,148,18,14,22,45,70,69,56,114,101,21,25,63,75,136,108,28,118,29,73,115]);if(typeof WebAssembly!="object")return{supported:!1};var a=WebAssembly.validate(s)?o(e):o(t),n,i=WebAssembly.instantiate(a,{}).then(function(h){n=h.instance,n.exports.__wasm_call_ctors()});function o(h){for(var y=new Uint8Array(h.length),w=0;w<h.length;++w){var v=h.charCodeAt(w);y[w]=v>96?v-97:v>64?v-39:v+4}for(var x=0,w=0;w<h.length;++w)y[x++]=y[w]<60?r[y[w]]:(y[w]-60)*64+y[++w];return y.buffer.slice(0,x)}function c(h,y,w,v,x,S,T){var A=h.exports.sbrk,_=v+3&-4,N=A(_*x),B=A(S.length),C=new Uint8Array(h.exports.memory.buffer);C.set(S,B);var R=y(N,v,x,B,S.length);if(R==0&&T&&T(N,_,x),w.set(C.subarray(N,N+v*x)),A(N-A(0)),R!=0)throw new Error("Malformed buffer data: "+R)}var l={NONE:"",OCTAHEDRAL:"meshopt_decodeFilterOct",QUATERNION:"meshopt_decodeFilterQuat",EXPONENTIAL:"meshopt_decodeFilterExp"},u={ATTRIBUTES:"meshopt_decodeVertexBuffer",TRIANGLES:"meshopt_decodeIndexBuffer",INDICES:"meshopt_decodeIndexSequence"},f=[],b=0;function g(h){var y={object:new Worker(h),pending:0,requests:{}};return y.object.onmessage=function(w){var v=w.data;y.pending-=v.count,y.requests[v.id][v.action](v.value),delete y.requests[v.id]},y}function p(h){for(var y="self.ready = WebAssembly.instantiate(new Uint8Array(["+new Uint8Array(a)+"]), {}).then(function(result) { result.instance.exports.__wasm_call_ctors(); return result.instance; });self.onmessage = "+m.name+";"+c.toString()+m.toString(),w=new Blob([y],{type:"text/javascript"}),v=URL.createObjectURL(w),x=f.length;x<h;++x)f[x]=g(v);for(var x=h;x<f.length;++x)f[x].object.postMessage({});f.length=h,URL.revokeObjectURL(v)}function d(h,y,w,v,x){for(var S=f[0],T=1;T<f.length;++T)f[T].pending<S.pending&&(S=f[T]);return new Promise(function(A,_){var N=new Uint8Array(w),B=++b;S.pending+=h,S.requests[B]={resolve:A,reject:_},S.object.postMessage({id:B,count:h,size:y,source:N,mode:v,filter:x},[N.buffer])})}function m(h){var y=h.data;if(!y.id)return self.close();self.ready.then(function(w){try{var v=new Uint8Array(y.count*y.size);c(w,w.exports[y.mode],v,y.count,y.size,y.source,w.exports[y.filter]),self.postMessage({id:y.id,count:y.count,action:"resolve",value:v},[v.buffer])}catch(x){self.postMessage({id:y.id,count:y.count,action:"reject",value:x})}})}return{ready:i,supported:!0,useWorkers:function(h){p(h)},decodeVertexBuffer:function(h,y,w,v,x){c(n,n.exports.meshopt_decodeVertexBuffer,h,y,w,v,n.exports[l[x]])},decodeIndexBuffer:function(h,y,w,v){c(n,n.exports.meshopt_decodeIndexBuffer,h,y,w,v)},decodeIndexSequence:function(h,y,w,v){c(n,n.exports.meshopt_decodeIndexSequence,h,y,w,v)},decodeGltfBuffer:function(h,y,w,v,x,S){c(n,n.exports[u[x]],h,y,w,v,n.exports[l[S]])},decodeGltfBufferAsync:function(h,y,w,v,x){return f.length>0?d(h,y,w,u[v],l[x]):i.then(function(){var S=new Uint8Array(h*y);return c(n,n.exports[u[v]],S,h,y,w,n.exports[l[x]]),S})}}})();var uT=(function(){var t="b9H79Tebbbetm9Geueu9Geub9Gbb9Gsuuuuuuuuuuuu99uueu9Gvuuuuub9Gruuuuuuub9Gvuuuuue999Gvuuuuueu9Gquuuuuuu99uueu9Gwuuuuuu99ueu9Giuuue999Gluuuueu9GiuuueuiOHdilvorlwiDqkbxxbelve9Weiiviebeoweuec:G:Pdkr:Tewo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bbz9TW79O9V9Wt9F79P9T9W29P9M95br8E9TW79O9V9Wt9F79P9T9W29P9M959x9Pt9OcttV9P9I91tW7bwQ9TW79O9V9Wt9F79P9T9W29P9M959q9V9P9Ut7bDX9TW79O9V9Wt9F79P9T9W29P9M959t9J9H2Wbqa9TW79O9V9Wt9F9V9Wt9P9T9P96W9wWVtW94SWt9J9O9sW9T9H9Wbkl79IV9RbxDwebcekdzsq;B:xeHdbkM9Hi8Au8A99Au8Jjjjjbc;W;qb9Rgs8Kjjjjbcbhzascxfcbc;Kbz:ojjjb8AdnabaeSmbabaeadcdtz:njjjb8AkdndnamcdGmbascxfhHcbhOxekasalcrfci4gecbyd:m:jjjbHjjjjbbgABdxasceBd2aAcbaez:ojjjbhCcbhlcbhednadTmbcbhlabheadhAinaCaeydbgXci4fgQaQRbbgQceaXcrGgXtV86bbaQcu7aX4ceGalfhlaeclfheaAcufgAmbkcualcdtalcFFFFi0EhekascCfhHasaecbyd:m:jjjbHjjjjbbgOBdzascdBd2alcd4alfhXcehAinaAgecethAaeaX6mbkcdhzcbhLascuaecdtgAaecFFFFi0Ecbyd:m:jjjbHjjjjbbgXBdCasciBd2aXcFeaAz:ojjjbhKdnadTmbaecufhYcbh8AindndnaKabaLcdtfgEydbgQc:v;t;h;Ev2aYGgXcdtfgCydbgAcuSmbceheinaOaAcdtfydbaQSmdaXaefhAaecefheaKaAaYGgXcdtfgCydbgAcu9hmbkkaOa8AcdtfaQBdbaCa8ABdba8AhAa8Acefh8AkaEaABdbaLcefgLad9hmbkkaKcbyd1:jjjbH:bjjjbbascdBd2kcbh3aHcualcefgecdtaecFFFFi0Ecbyd:m:jjjbHjjjjbbg5Bdbasa5BdlasazceVgeBd2ascxfaecdtfcuadcitadcFFFFe0Ecbyd:m:jjjbHjjjjbbg8EBdbasa8EBdwasazcdfgeBd2asclfabadalcbz:cjjjbascxfaecdtfcualcdtgealcFFFFi0Eg8Fcbyd:m:jjjbHjjjjbbgABdbasazcifgXBd2ascxfaXcdtfa8Fcbyd:m:jjjbHjjjjbbgaBdbasazclVBd2aAaaaialavaOascxfz:djjjbalcbyd:m:jjjbHjjjjbbhCascxfasyd2ghcdtfaCBdbasahcefgXBd2ascxfaXcdtfa8Fcbyd:m:jjjbHjjjjbbgXBdbasahcdfgQBd2ascxfaQcdtfa8Fcbyd:m:jjjbHjjjjbbgQBdbasahcifggBd2aXcFeaez:ojjjbh8JaQcFeaez:ojjjbh8KdnalTmba8Ecwfh8Lindna5a3gQcefg3cdtfydbgKa5aQcdtgefydbgXSmbaKaX9Rhza8EaXcitfhHa8Kaefh8Ma8JaefhEcbhYindndnaHaYcitfydbg8AaQ9hmbaEaQBdba8MaQBdbxekdna5a8Acdtg8NfgeclfydbgXaeydbgeSmba8EaecitgKfydbaQSmeaXae9Rhyaecu7aXfhLa8LaKfhXcbheinaLaeSmeaecefheaXydbhKaXcwfhXaKaQ9hmbkaeay6meka8Ka8NfgeaQa8AaeydbcuSEBdbaEa8AaQaEydbcuSEBdbkaYcefgYaz9hmbkka3al9hmbkaAhXaahQa8KhKa8JhYcbheindndnaeaXydbg8A9hmbdnaeaQydbg8A9hmbaYydbh8AdnaKydbgLcu9hmba8Acu9hmbaCaefcb86bbxikaCaefhEdnaeaLSmbaea8ASmbaEce86bbxikaEcl86bbxdkdnaeaaa8AcdtgLfydb9hmbdnaKydbgEcuSmbaeaESmbaYydbgzcuSmbaeazSmba8KaLfydbgHcuSmbaHa8ASmba8JaLfydbgLcuSmbaLa8ASmbdnaAaEcdtfydbg8AaAaLcdtfydb9hmba8AaAazcdtfydbgLSmbaLaAaHcdtfydb9hmbaCaefcd86bbxlkaCaefcl86bbxikaCaefcl86bbxdkaCaefcl86bbxekaCaefaCa8AfRbb86bbkaXclfhXaQclfhQaKclfhKaYclfhYalaecefge9hmbkdnaqTmbdndnaOTmbaOheaAhXalhQindnaqaeydbfRbbTmbaCaXydbfcl86bbkaeclfheaXclfhXaQcufgQmbxdkkaAhealhXindnaqRbbTmbaCaeydbfcl86bbkaqcefhqaeclfheaXcufgXmbkkaAhealhQaChXindnaCaeydbfRbbcl9hmbaXcl86bbkaeclfheaXcefhXaQcufgQmbkkamceGTmbaChealhXindnaeRbbce9hmbaecl86bbkaecefheaXcufgXmbkkascxfagcdtfcualcx2alc;v:Q;v:Qe0Ecbyd:m:jjjbHjjjjbbg3BdbasahclfgHBd2a3aialavaOz:ejjjbh8PdndnaDmbcbhgcbh8Lxekcbh8LawhecbhXindnaeIdbJbbbb9ETmbasc;Wbfa8LcdtfaXBdba8Lcefh8LkaeclfheaDaXcefgX9hmbkascxfaHcdtfcua8Lal2gecdtaecFFFFi0Ecbyd:m:jjjbHjjjjbbggBdbasahcvfgHBd2alTmba8LTmbarcd4hEdnaOTmba8Lcdthzcbh8AaghLinaoaOa8AcdtfydbaE2cdtfhYasc;WbfheaLhXa8LhQinaXaYaeydbcdtgKfIdbawaKfIdbNUdbaeclfheaXclfhXaQcufgQmbkaLazfhLa8Acefg8Aal9hmbxdkka8Lcdthzcbh8AaghLinaoa8AaE2cdtfhYasc;WbfheaLhXa8LhQinaXaYaeydbcdtgKfIdbawaKfIdbNUdbaeclfheaXclfhXaQcufgQmbkaLazfhLa8Acefg8Aal9hmbkkascxfaHcdtfcualc8S2gealc;D;O;f8U0EgQcbyd:m:jjjbHjjjjbbgXBdbasaHcefgKBd2aXcbaez:ojjjbhqdndndna8LTmbascxfaKcdtfaQcbyd:m:jjjbHjjjjbbgvBdbasaHcdfgXBd2avcbaez:ojjjb8AascxfaXcdtfcua8Lal2gecltgXaecFFFFb0Ecbyd:m:jjjbHjjjjbbgiBdbasaHcifBd2aicbaXz:ojjjb8AadmexdkcbhvcbhiadTmekcbhYabhXindna3aXclfydbg8Acx2fgeIdba3aXydbgLcx2fgQIdbgI:tg8Ra3aXcwfydbgEcx2fgKIdlaQIdlg8S:tgRNaKIdbaI:tg8UaeIdla8S:tg8VN:tg8Wa8WNa8VaKIdwaQIdwg8X:tg8YNaRaeIdwa8X:tg8VN:tgRaRNa8Va8UNa8Ya8RN:tg8Ra8RNMM:rg8UJbbbb9ETmba8Wa8U:vh8Wa8Ra8U:vh8RaRa8U:vhRkaqaAaLcdtfydbc8S2fgeaRa8U:rg8UaRNNg8VaeIdbMUdbaea8Ra8Ua8RNg8ZNg8YaeIdlMUdlaea8Wa8Ua8WNg80Ng81aeIdwMUdwaea8ZaRNg8ZaeIdxMUdxaea80aRNgBaeIdzMUdzaea80a8RNg80aeIdCMUdCaeaRa8Ua8Wa8XNaRaINa8Sa8RNMM:mg8SNgINgRaeIdKMUdKaea8RaINg8RaeId3MUd3aea8WaINg8WaeIdaMUdaaeaIa8SNgIaeId8KMUd8Kaea8UaeIdyMUdyaqaAa8Acdtfydbc8S2fgea8VaeIdbMUdbaea8YaeIdlMUdlaea81aeIdwMUdwaea8ZaeIdxMUdxaeaBaeIdzMUdzaea80aeIdCMUdCaeaRaeIdKMUdKaea8RaeId3MUd3aea8WaeIdaMUdaaeaIaeId8KMUd8Kaea8UaeIdyMUdyaqaAaEcdtfydbc8S2fgea8VaeIdbMUdbaea8YaeIdlMUdlaea81aeIdwMUdwaea8ZaeIdxMUdxaeaBaeIdzMUdzaea80aeIdCMUdCaeaRaeIdKMUdKaea8RaeId3MUd3aea8WaeIdaMUdaaeaIaeId8KMUd8Kaea8UaeIdyMUdyaXcxfhXaYcifgYad6mbkcbhzabhLinabazcdtfh8AcbhXinaCa8AaXc;a1jjbfydbcdtfydbgQfRbbhedndnaCaLaXfydbgKfRbbgYc99fcFeGcpe0mbaec99fcFeGc;:e6mekdnaYcufcFeGce0mba8JaKcdtfydbaQ9hmekdnaecufcFeGce0mba8KaQcdtfydbaK9hmekdnaYcv2aefc:G1jjbfRbbTmbaAaQcdtfydbaAaKcdtfydb0mekJbbacJbbacJbbjZaecFeGceSEaYceSEh80dna3a8AaXc;e1jjbfydbcdtfydbcx2fgeIdwa3aKcx2fgYIdwg8S:tg8Wa3aQcx2fgEIdwa8S:tgRaRNaEIdbaYIdbg8X:tg8Ra8RNaEIdlaYIdlg8V:tg8Ua8UNMMgINa8WaRNaeIdba8X:tg81a8RNa8UaeIdla8V:tg8ZNMMg8YaRN:tg8Wa8WNa81aINa8Ya8RN:tgRaRNa8ZaINa8Ya8UN:tg8Ra8RNMM:rg8UJbbbb9ETmba8Wa8U:vh8Wa8Ra8U:vh8RaRa8U:vhRkaqaAaKcdtfydbc8S2fgeaRa80aI:rNg8UaRNNg8YaeIdbMUdbaea8Ra8Ua8RNg80Ng81aeIdlMUdlaea8Wa8Ua8WNgINg8ZaeIdwMUdwaea80aRNg80aeIdxMUdxaeaIaRNgBaeIdzMUdzaeaIa8RNg83aeIdCMUdCaeaRa8Ua8Wa8SNaRa8XNa8Va8RNMM:mg8SNgINgRaeIdKMUdKaea8RaINg8RaeId3MUd3aea8WaINg8WaeIdaMUdaaeaIa8SNgIaeId8KMUd8Kaea8UaeIdyMUdyaqaAaQcdtfydbc8S2fgea8YaeIdbMUdbaea81aeIdlMUdlaea8ZaeIdwMUdwaea80aeIdxMUdxaeaBaeIdzMUdzaea83aeIdCMUdCaeaRaeIdKMUdKaea8RaeId3MUd3aea8WaeIdaMUdaaeaIaeId8KMUd8Kaea8UaeIdyMUdykaXclfgXcx9hmbkaLcxfhLazcifgzad6mbka8LTmbcbhLinJbbbbh8Xa3abaLcdtfgeclfydbgEcx2fgXIdwa3aeydbgzcx2fgQIdwg8Z:tg8Ra8RNaXIdbaQIdbgB:tg8Wa8WNaXIdlaQIdlg83:tg8Ua8UNMMg80a3aecwfydbgHcx2fgeIdwa8Z:tgINa8Ra8RaINa8WaeIdbaB:tg8SNa8UaeIdla83:tg8VNMMgRN:tJbbbbJbbjZa80aIaINa8Sa8SNa8Va8VNMMg81NaRaRN:tg8Y:va8YJbbbb9BEg8YNhUa81a8RNaIaRN:ta8YNh85a80a8VNa8UaRN:ta8YNh86a81a8UNa8VaRN:ta8YNh87a80a8SNa8WaRN:ta8YNh88a81a8WNa8SaRN:ta8YNh89a8Wa8VNa8Sa8UN:tgRaRNa8UaINa8Va8RN:tgRaRNa8Ra8SNaIa8WN:tgRaRNMM:rJbbbZNhRagaza8L2gwcdtfhXagaHa8L2g8NcdtfhQagaEa8L2g5cdtfhKa8Z:mh8:a83:mhZaB:mhncbhYa8Lh8AJbbbbh8VJbbbbh8YJbbbbh80Jbbbbh81Jbbbbh8ZJbbbbhBJbbbbh83JbbbbhcJbbbbh9cinasc;WbfaYfgecwfaRa85aKIdbaXIdbgI:tg8UNaUaQIdbaI:tg8SNMg8RNUdbaeclfaRa87a8UNa86a8SNMg8WNUdbaeaRa89a8UNa88a8SNMg8UNUdbaecxfaRa8:a8RNaZa8WNaIana8UNMMMgINUdbaRa8Ra8WNNa81Mh81aRa8Ra8UNNa8ZMh8ZaRa8Wa8UNNaBMhBaRaIaINNa8XMh8XaRa8RaINNa8VMh8VaRa8WaINNa8YMh8YaRa8UaINNa80Mh80aRa8Ra8RNNa83Mh83aRa8Wa8WNNacMhcaRa8Ua8UNNa9cMh9caXclfhXaKclfhKaQclfhQaYczfhYa8Acufg8Ambkavazc8S2fgea9caeIdbMUdbaeacaeIdlMUdlaea83aeIdwMUdwaeaBaeIdxMUdxaea8ZaeIdzMUdzaea81aeIdCMUdCaea80aeIdKMUdKaea8YaeId3MUd3aea8VaeIdaMUdaaea8XaeId8KMUd8KaeaRaeIdyMUdyavaEc8S2fgea9caeIdbMUdbaeacaeIdlMUdlaea83aeIdwMUdwaeaBaeIdxMUdxaea8ZaeIdzMUdzaea81aeIdCMUdCaea80aeIdKMUdKaea8YaeId3MUd3aea8VaeIdaMUdaaea8XaeId8KMUd8KaeaRaeIdyMUdyavaHc8S2fgea9caeIdbMUdbaeacaeIdlMUdlaea83aeIdwMUdwaeaBaeIdxMUdxaea8ZaeIdzMUdzaea81aeIdCMUdCaea80aeIdKMUdKaea8YaeId3MUd3aea8VaeIdaMUdaaea8XaeId8KMUd8KaeaRaeIdyMUdyaiawcltfh8AcbhXa8LhKina8AaXfgeasc;WbfaXfgQIdbaeIdbMUdbaeclfgYaQclfIdbaYIdbMUdbaecwfgYaQcwfIdbaYIdbMUdbaecxfgeaQcxfIdbaeIdbMUdbaXczfhXaKcufgKmbkaia5cltfh8AcbhXa8LhKina8AaXfgeasc;WbfaXfgQIdbaeIdbMUdbaeclfgYaQclfIdbaYIdbMUdbaecwfgYaQcwfIdbaYIdbMUdbaecxfgeaQcxfIdbaeIdbMUdbaXczfhXaKcufgKmbkaia8Ncltfh8AcbhXa8LhKina8AaXfgeasc;WbfaXfgQIdbaeIdbMUdbaeclfgYaQclfIdbaYIdbMUdbaecwfgYaQcwfIdbaYIdbMUdbaecxfgeaQcxfIdbaeIdbMUdbaXczfhXaKcufgKmbkaLcifgLad6mbkkcbhQdndnamcwGgJmbJbbbbh8Vcbh9ecbhocbhhxekcbh9ea8Fcbyd:m:jjjbHjjjjbbhhascxfasyd2gecdtfahBdbasaecefgXBd2ascxfaXcdtfcuahalabadaAz:fjjjbgKcltaKcjjjjiGEcbyd:m:jjjbHjjjjbbgoBdbasaecdfBd2aoaKaha3alz:gjjjbJFFuuh8VaKTmbaoheaKhXinaeIdbgRa8Va8VaR9EEh8VaeclfheaXcufgXmbkaKh9ekasydlhTdnalTmbaTclfheaTydbhKaChXalhYcbhQincbaeydbg8AaK9RaXRbbcpeGEaQfhQaXcefhXaeclfhea8AhKaYcufgYmbkaQce4hQkcuadaQ9RcifgScx2aSc;v:Q;v:Qe0Ecbyd:m:jjjbHjjjjbbhDascxfasyd2g9hcdtfaDBdbasa9hcefgeBd2ascxfaecdtfcuaScdtaScFFFFi0Ecbyd:m:jjjbHjjjjbbgrBdbasa9hcdfgeBd2ascxfaecdtfa8Fcbyd:m:jjjbHjjjjbbgyBdbasa9hcifgeBd2ascxfaecdtfalcbyd:m:jjjbHjjjjbbg9iBdbasa9hclfg6Bd2axaxNa8PJbbjZamclGEgUaUN:vh9cJbbbbhcdnadak9nmbdnaSci6mba8Lclth9kaDcwfh0Jbbbbh83JbbbbhcinasclfabadalaAz:cjjjbabhzcbh8Ecbh8Finaba8FcdtfhHcbheindnaAazaefydbgQcdtgEfydbgYaAaHaec;q1jjbfydbcdtfydbgXcdtgwfydbg8ASmbaCaXfRbbgLcv2aCaQfRbbgKfc;G1jjbfRbbg5aKcv2aLfg8Nc;G1jjbfRbbg8MVcFeGTmbdna8AaY9nmba8Nc:G1jjbfRbbcFeGmekaKcufhYdnaKaL9hmbaYcFeGce0mba8JaEfydbaX9hmekdndnaKclSmbaLcl9hmekdnaYcFeGce0mba8JaEfydbaX9hmdkaLcufcFeGce0mba8KawfydbaQ9hmekaDa8Ecx2fgKaXaQa8McFeGgYEBdlaKaQaXaYEBdbaKaYa5Gcb9hBdwa8Ecefh8Ekaeclfgecx9hmbkdna8Fcifg8Fad9pmbazcxfhza8EcifaS9nmekka8ETmdcbhLinaqaAaDaLcx2fgKydbgYcdtgzfydbc8S2fgeIdwa3aKydlg8Acx2fgXIdwg8WNaeIdzaXIdbg8UNaeIdaMgRaRMMa8WNaeIdlaXIdlgINaeIdCa8WNaeId3MgRaRMMaINaeIdba8UNaeIdxaINaeIdKMgRaRMMa8UNaeId8KMMM:lhRJbbbbJbbjZaeIdyg8R:va8RJbbbb9BEh8RdndnaKydwgEmbJFFuuh8YxekJbbbbJbbjZaqaAa8Acdtfydbc8S2fgeIdyg8S:va8SJbbbb9BEaeIdwa3aYcx2fgXIdwg8SNaeIdzaXIdbg8XNaeIdaMg8Ya8YMMa8SNaeIdlaXIdlg8YNaeIdCa8SNaeId3Mg8Sa8SMMa8YNaeIdba8XNaeIdxa8YNaeIdKMg8Sa8SMMa8XNaeId8KMMM:lNh8Yka8RaRNh80dna8LTmbavaYc8S2fgQIdwa8WNaQIdza8UNaQIdaMgRaRMMa8WNaQIdlaINaQIdCa8WNaQId3MgRaRMMaINaQIdba8UNaQIdxaINaQIdKMgRaRMMa8UNaQId8KMMMhRaga8Aa8L2gHcdtfhXaiaYa8L2gwcltfheaQIdyh8Sa8LhQinaXIdbg8Ra8Ra8SNaecxfIdba8WaecwfIdbNa8UaeIdbNaIaeclfIdbNMMMg8Ra8RM:tNaRMhRaXclfhXaeczfheaQcufgQmbkdndnaEmbJbbbbh8Rxekava8Ac8S2fgQIdwa3aYcx2fgeIdwg8UNaQIdzaeIdbgINaQIdaMg8Ra8RMMa8UNaQIdlaeIdlg8SNaQIdCa8UNaQId3Mg8Ra8RMMa8SNaQIdbaINaQIdxa8SNaQIdKMg8Ra8RMMaINaQId8KMMMh8RagawcdtfhXaiaHcltfheaQIdyh8Xa8LhQinaXIdbg8Wa8Wa8XNaecxfIdba8UaecwfIdbNaIaeIdbNa8SaeclfIdbNMMMg8Wa8WM:tNa8RMh8RaXclfhXaeczfheaQcufgQmbka8R:lh8Rka80aR:lMh80a8Ya8RMh8YaCaYfRbbcd9hmbdna8Ka8Ja8Jazfydba8ASEaaazfydbgHcdtfydbgzcu9hmbaaa8AcdtfydbhzkavaHc8S2fgQIdwa3azcx2fgeIdwg8WNaQIdzaeIdbg8UNaQIdaMgRaRMMa8WNaQIdlaeIdlgINaQIdCa8WNaQId3MgRaRMMaINaQIdba8UNaQIdxaINaQIdKMgRaRMMa8UNaQId8KMMMhRagaza8L2gwcdtfhXaiaHa8L2g8NcltfheaQIdyh8Sa8LhQinaXIdbg8Ra8Ra8SNaecxfIdba8WaecwfIdbNa8UaeIdbNaIaeclfIdbNMMMg8Ra8RM:tNaRMhRaXclfhXaeczfheaQcufgQmbkdndnaEmbJbbbbh8Rxekavazc8S2fgQIdwa3aHcx2fgeIdwg8UNaQIdzaeIdbgINaQIdaMg8Ra8RMMa8UNaQIdlaeIdlg8SNaQIdCa8UNaQId3Mg8Ra8RMMa8SNaQIdbaINaQIdxa8SNaQIdKMg8Ra8RMMaINaQId8KMMMh8Raga8NcdtfhXaiawcltfheaQIdyh8Xa8LhQinaXIdbg8Wa8Wa8XNaecxfIdba8UaecwfIdbNaIaeIdbNa8SaeclfIdbNMMMg8Wa8WM:tNa8RMh8RaXclfhXaeczfheaQcufgQmbka8R:lh8Rka80aR:lMh80a8Ya8RMh8YkaKa80a8Ya80a8Y9FgeEUdwaKa8AaYaeaETVgeEBdlaKaYa8AaeEBdbaLcefgLa8E9hmbkasc;Wbfcbcj;qbz:ojjjb8Aa0hea8EhXinasc;WbfaeydbcA4cF8FGgQcFAaQcFA6EcdtfgQaQydbcefBdbaecxfheaXcufgXmbkcbhecbhXinasc;WbfaefgQydbhKaQaXBdbaKaXfhXaeclfgecj;qb9hmbkcbhea0hXinasc;WbfaXydbcA4cF8FGgQcFAaQcFA6EcdtfgQaQydbgQcefBdbaraQcdtfaeBdbaXcxfhXa8Eaecefge9hmbkadak9RgQci9Uh9mdnalTmbcbheayhXinaXaeBdbaXclfhXalaecefge9hmbkkcbh9na9icbalz:ojjjbh8FaQcO9Uh9oa9mce4h9pasydwh9qcbh8Mcbh5dninaDara5cdtfydbcx2fg8NIdwgRa9c9Emea8Ma9m9pmeJFFuuh8Rdna9pa8E9pmbaDara9pcdtfydbcx2fIdwJbb;aZNh8RkdnaRa8R9ETmbaRac9ETmba8Ma9o0mdkdna8FaAa8NydlgHcdtg9rfydbgKfg9sRbba8FaAa8Nydbgzcdtg9tfydbgefg9uRbbVmbaCazfRbbh9vdnaTaecdtfgXclfydbgQaXydbgXSmbaQaX9RhYa3aKcx2fhLa3aecx2fhEa9qaXcitfhecbhXcehwdnindnayaeydbcdtfydbgQaKSmbayaeclfydbcdtfydbg8AaKSmbaQa8ASmba3a8Acx2fg8AIdba3aQcx2fgQIdbg8W:tgRaEIdlaQIdlg8U:tg8XNaEIdba8W:tg8Ya8AIdla8U:tg8RN:tgIaRaLIdla8U:tg80NaLIdba8W:tg81a8RN:tg8UNa8RaEIdwaQIdwg8S:tg8ZNa8Xa8AIdwa8S:tg8WN:tg8Xa8RaLIdwa8S:tgBNa80a8WN:tg8RNa8Wa8YNa8ZaRN:tg8Sa8Wa81NaBaRN:tgRNMMaIaINa8Xa8XNa8Sa8SNMMa8Ua8UNa8Ra8RNaRaRNMMN:rJbbj8:N9FmdkaecwfheaXcefgXaY6hwaYaX9hmbkkawceGTmba9pcefh9pxekdndndndna9vc9:fPdebdkazheinayaecdtgefaHBdbaaaefydbgeaz9hmbxikkdna8Ka8Ja8Ja9tfydbaHSEaaa9tfydbgzcdtfydbgecu9hmbaaa9rfydbhekaya9tfaHBdbaehHkayazcdtfaHBdbka9uce86bba9sce86bba8NIdwgRacacaR9DEhca9ncefh9ncecda9vceSEa8Mfh8Mka5cefg5a8E9hmbkka9nTmddnalTmbcbh8AcbhEindnayaEcdtgefydbgQaESmbaAaQcdtfydbhzdnaEaAaefydb9hgHmbaqazc8S2fgeaqaEc8S2fgXIdbaeIdbMUdbaeaXIdlaeIdlMUdlaeaXIdwaeIdwMUdwaeaXIdxaeIdxMUdxaeaXIdzaeIdzMUdzaeaXIdCaeIdCMUdCaeaXIdKaeIdKMUdKaeaXId3aeId3MUd3aeaXIdaaeIdaMUdaaeaXId8KaeId8KMUd8KaeaXIdyaeIdyMUdyka8LTmbavaQc8S2fgeavaEc8S2gwfgXIdbaeIdbMUdbaeaXIdlaeIdlMUdlaeaXIdwaeIdwMUdwaeaXIdxaeIdxMUdxaeaXIdzaeIdzMUdzaeaXIdCaeIdCMUdCaeaXIdKaeIdKMUdKaeaXId3aeId3MUd3aeaXIdaaeIdaMUdaaeaXId8KaeId8KMUd8KaeaXIdyaeIdyMUdya9kaQ2hLaihXa8LhKinaXaLfgeaXa8AfgQIdbaeIdbMUdbaeclfgYaQclfIdbaYIdbMUdbaecwfgYaQcwfIdbaYIdbMUdbaecxfgeaQcxfIdbaeIdbMUdbaXczfhXaKcufgKmbkaHmbJbbbbJbbjZaqawfgeIdygR:vaRJbbbb9BEaeIdwa3azcx2fgXIdwgRNaeIdzaXIdbg8RNaeIdaMg8Wa8WMMaRNaeIdlaXIdlg8WNaeIdCaRNaeId3MgRaRMMa8WNaeIdba8RNaeIdxa8WNaeIdKMgRaRMMa8RNaeId8KMMM:lNgRa83a83aR9DEh83ka8Aa9kfh8AaEcefgEal9hmbkcbhXa8JheindnaeydbgQcuSmbdnaXayaQcdtgKfydbgQ9hmbcuhQa8JaKfydbgKcuSmbayaKcdtfydbhQkaeaQBdbkaeclfhealaXcefgX9hmbkcbhXa8KheindnaeydbgQcuSmbdnaXayaQcdtgKfydbgQ9hmbcuhQa8KaKfydbgKcuSmbayaKcdtfydbhQkaeaQBdbkaeclfhealaXcefgX9hmbkka83aca8LEh83cbhKabhecbhYindnayaeydbcdtfydbgXayaeclfydbcdtfydbgQSmbaXayaecwfydbcdtfydbg8ASmbaQa8ASmbabaKcdtfgLaXBdbaLcwfa8ABdbaLclfaQBdbaKcifhKkaecxfheaYcifgYad6mbkdndnaJTmbaKak9nmba8Va839FTmbcbhdabhecbhXindnaoahaeydbgQcdtfydbcdtfIdba839ETmbabadcdtfgYaQBdbaYclfaeclfydbBdbaYcwfaecwfydbBdbadcifhdkaecxfheaXcifgXaK6mbkJFFuuh8Va9eTmeaohea9ehXJFFuuhRinaeIdbg8RaRaRa8R9EEg8WaRa8Ra839EgQEhRa8Wa8VaQEh8VaeclfheaXcufgXmbxdkkaKhdkadak0mbxdkkasclfabadalaAz:cjjjbkdndnadak0mbadhXxekdnaJmbadhXxekdna8Va9c9FmbadhXxekina8VJbb;aZNgRa9caRa9c9DEh8WJbbbbhRdna9eTmbaohea9ehAinaeIdbg8RaRa8Ra8W9FEaRa8RaR9EEhRaeclfheaAcufgAmbkkcbhXabhecbhAindnaoahaeydbgQcdtfydbcdtfIdba8W9ETmbabaXcdtfgKaQBdbaKclfaeclfydbBdbaKcwfaecwfydbBdbaXcifhXkaecxfheaAcifgAad6mbkJFFuuh8Vdna9eTmbaohea9ehAJFFuuh8RinaeIdbg8Ua8Ra8Ra8U9EEgIa8Ra8Ua8W9EgQEh8RaIa8VaQEh8VaeclfheaAcufgAmbkkdnaXad9hmbadhXxdkaRacacaR9DEhcaXak9nmeaXhda8Va9c9FmbkkdnamcjjjjlGTmbaOmbaXTmbcbh8AabheinaCaeydbgKfRbbc3thLaecwfgEydbhAdndna8JaKcdtgHfydbaeclfgzydbgQSmbcbhYa8KaQcdtfydbaK9hmekcjjjj94hYkaeaLaYVaKVBdbaCaQfRbbc3thLdndna8JaQcdtfydbaASmbcbhYa8KaAcdtfydbaQ9hmekcjjjj94hYkazaLaYVaQVBdbaCaAfRbbc3thYdndna8JaAcdtfydbaKSmbcbhQa8KaHfydbaA9hmekcjjjj94hQkaEaYaQVaAVBdbaecxfhea8Acifg8AaX6mbkkdnaOTmbaXTmbaXheinabaOabydbcdtfydbBdbabclfhbaecufgembkkdnaPTmbaPaUac:rNUdbka9hcdtascxffcxfhednina6Tmeaeydbcbyd1:jjjbH:bjjjbbaec98fhea6cufh6xbkkasc;W;qbf8KjjjjbaXk;Yieouabydlhvabydbclfcbaicdtz:ojjjbhoadci9UhrdnadTmbdnalTmbaehwadhDinaoalawydbcdtfydbcdtfgqaqydbcefBdbawclfhwaDcufgDmbxdkkaehwadhDinaoawydbcdtfgqaqydbcefBdbawclfhwaDcufgDmbkkdnaiTmbcbhDaohwinawydbhqawaDBdbawclfhwaqaDfhDaicufgimbkkdnadci6mbinaecwfydbhwaeclfydbhDaeydbhidnalTmbalawcdtfydbhwalaDcdtfydbhDalaicdtfydbhikavaoaicdtfgqydbcitfaDBdbavaqydbcitfawBdlaqaqydbcefBdbavaoaDcdtfgqydbcitfawBdbavaqydbcitfaiBdlaqaqydbcefBdbavaoawcdtfgwydbcitfaiBdbavawydbcitfaDBdlawawydbcefBdbaecxfhearcufgrmbkkabydbcbBdbk:todDue99aicd4aifhrcehwinawgDcethwaDar6mbkcuaDcdtgraDcFFFFi0Ecbyd:m:jjjbHjjjjbbhwaoaoyd9GgqcefBd9GaoaqcdtfawBdbawcFearz:ojjjbhkdnaiTmbalcd4hlaDcufhxcbhminamhDdnavTmbavamcdtfydbhDkcbadaDal2cdtfgDydlgwawcjjjj94SEgwcH4aw7c:F:b:DD2cbaDydbgwawcjjjj94SEgwcH4aw7c;D;O:B8J27cbaDydwgDaDcjjjj94SEgDcH4aD7c:3F;N8N27axGhwamcdthPdndndnavTmbakawcdtfgrydbgDcuSmeadavaPfydbal2cdtfgsIdbhzcehqinaqhrdnadavaDcdtfydbal2cdtfgqIdbaz9CmbaqIdlasIdl9CmbaqIdwasIdw9BmlkarcefhqakawarfaxGgwcdtfgrydbgDcu9hmbxdkkakawcdtfgrydbgDcuSmbadamal2cdtfgsIdbhzcehqinaqhrdnadaDal2cdtfgqIdbaz9CmbaqIdlasIdl9CmbaqIdwasIdw9BmikarcefhqakawarfaxGgwcdtfgrydbgDcu9hmbkkaramBdbamhDkabaPfaDBdbamcefgmai9hmbkkakcbyd1:jjjbH:bjjjbbaoaoyd9GcufBd9GdnaeTmbaiTmbcbhDaehwinawaDBdbawclfhwaiaDcefgD9hmbkcbhDaehwindnaDabydbgrSmbawaearcdtfgrydbBdbaraDBdbkawclfhwabclfhbaiaDcefgD9hmbkkk;Qodvuv998Jjjjjbca9Rgvczfcwfcbyd11jjbBdbavcb8Pdj1jjb83izavcwfcbydN1jjbBdbavcb8Pd:m1jjb83ibdnadTmbaicd4hodnabmbdnalTmbcbhrinaealarcdtfydbao2cdtfhwcbhiinavczfaifgDawaifIdbgqaDIdbgkakaq9EEUdbavaifgDaqaDIdbgkakaq9DEUdbaiclfgicx9hmbkarcefgrad9hmbxikkaocdthrcbhwincbhiinavczfaifgDaeaifIdbgqaDIdbgkakaq9EEUdbavaifgDaqaDIdbgkakaq9DEUdbaiclfgicx9hmbkaearfheawcefgwad9hmbxdkkdnalTmbcbhrinabarcx2fgiaealarcdtfydbao2cdtfgwIdbUdbaiawIdlUdlaiawIdwUdwcbhiinavczfaifgDawaifIdbgqaDIdbgkakaq9EEUdbavaifgDaqaDIdbgkakaq9DEUdbaiclfgicx9hmbkarcefgrad9hmbxdkkaocdthlcbhraehwinabarcx2fgiaearao2cdtfgDIdbUdbaiaDIdlUdlaiaDIdwUdwcbhiinavczfaifgDawaifIdbgqaDIdbgkakaq9EEUdbavaifgDaqaDIdbgkakaq9DEUdbaiclfgicx9hmbkawalfhwarcefgrad9hmbkkJbbbbavIdbavIdzgk:tgqaqJbbbb9DEgqavIdlavIdCgx:tgmamaq9DEgqavIdwavIdKgm:tgPaPaq9DEhPdnabTmbadTmbJbbbbJbbjZaP:vaPJbbbb9BEhqinabaqabIdbak:tNUdbabclfgvaqavIdbax:tNUdbabcwfgvaqavIdbam:tNUdbabcxfhbadcufgdmbkkaPk:ZlewudnaeTmbcbhvabhoinaoavBdbaoclfhoaeavcefgv9hmbkkdnaiTmbcbhrinadarcdtfhwcbhDinalawaDcdtgvc;a1jjbfydbcdtfydbcdtfydbhodnabalawavfydbcdtfydbgqcdtfgkydbgvaqSmbinakabavgqcdtfgxydbgvBdbaxhkaqav9hmbkkdnabaocdtfgkydbgvaoSmbinakabavgocdtfgxydbgvBdbaxhkaoav9hmbkkdnaqaoSmbabaqaoaqao0Ecdtfaqaoaqao6EBdbkaDcefgDci9hmbkarcifgrai6mbkkdnaembcbskcbhxindnalaxcdtgvfydbax9hmbaxhodnabavfgDydbgvaxSmbaDhqinaqabavgocdtfgkydbgvBdbakhqaoav9hmbkkaDaoBdbkaxcefgxae9hmbkcbhvabhocbhkindndnavalydbgq9hmbdnavaoydbgq9hmbaoakBdbakcefhkxdkaoabaqcdtfydbBdbxekaoabaqcdtfydbBdbkaoclfhoalclfhlaeavcefgv9hmbkakk;Jiilud99duabcbaecltz:ojjjbhvdnalTmbadhoaihralhwinarcwfIdbhDarclfIdbhqavaoydbcltfgkarIdbakIdbMUdbakclfgxaqaxIdbMUdbakcwfgxaDaxIdbMUdbakcxfgkakIdbJbbjZMUdbaoclfhoarcxfhrawcufgwmbkkdnaeTmbavhraehkinarcxfgoIdbhDaocbBdbararIdbJbbbbJbbjZaD:vaDJbbbb9BEgDNUdbarclfgoaDaoIdbNUdbarcwfgoaDaoIdbNUdbarczfhrakcufgkmbkkdnalTmbinavadydbcltfgrcxfgkaicwfIdbarcwfIdb:tgDaDNaiIdbarIdb:tgDaDNaiclfIdbarclfIdb:tgDaDNMMgDakIdbgqaqaD9DEUdbadclfhdaicxfhialcufglmbkkdnaeTmbavcxfhrinabarIdbUdbarczfhrabclfhbaecufgembkkk8MbabaeadaialavcbcbcbcbcbaoarawaDz:bjjjbk8MbabaeadaialavaoarawaDaqakaxamaPz:bjjjbk:DCoDud99rue99iul998Jjjjjbc;Wb9Rgw8KjjjjbdndnarmbcbhDxekawcxfcbc;Kbz:ojjjb8Aawcuadcx2adc;v:Q;v:Qe0Ecbyd:m:jjjbHjjjjbbgqBdxawceBd2aqaeadaicbz:ejjjb8AawcuadcdtadcFFFFi0Egkcbyd:m:jjjbHjjjjbbgxBdzawcdBd2adcd4adfhmceheinaegicetheaiam6mbkcbhPawcuaicdtgsaicFFFFi0Ecbyd:m:jjjbHjjjjbbgzBdCawciBd2dndnar:ZgH:rJbbbZMgO:lJbbb9p9DTmbaO:Ohexekcjjjj94hekaicufhAc:bwhmcbhCadhXcbhQinaChLaeamgKcufaeaK9iEaPgDcefaeaD9kEhYdndnadTmbaYcuf:YhOaqhiaxheadhmindndnaiIdbaONJbbbZMg8A:lJbbb9p9DTmba8A:OhCxekcjjjj94hCkaCcCthCdndnaiclfIdbaONJbbbZMg8A:lJbbb9p9DTmba8A:OhExekcjjjj94hEkaEcqtaCVhCdndnaicwfIdbaONJbbbZMg8A:lJbbb9p9DTmba8A:OhExekcjjjj94hEkaeaCaEVBdbaicxfhiaeclfheamcufgmmbkazcFeasz:ojjjbh3cbh5cbhPindna3axaPcdtfydbgCcm4aC7c:v;t;h;Ev2gics4ai7aAGgmcdtfgEydbgecuSmbaeaCSmbcehiina3amaifaAGgmcdtfgEydbgecuSmeaicefhiaeaC9hmbkkaEaCBdba5aecuSfh5aPcefgPad9hmbxdkkazcFeasz:ojjjb8Acbh5kaDaYa5ar0giEhPaLa5aiEhCdna5arSmbaYaKaiEgmaP9Rcd9imbdndnaQcl0mbdnaX:ZgOaL:Zg8A:taY:Yg8EaD:Y:tg8Fa8EaK:Y:tgaa5:ZghaH:tNNNaOaH:taaNa8Aah:tNa8AaH:ta8FNahaO:tNM:va8EMJbbbZMgO:lJbbb9p9DTmbaO:Ohexdkcjjjj94hexekaPamfcd9Theka5aXaiEhXaQcefgQcs9hmekkdndnaCmbcihicbhDxekcbhiawakcbyd:m:jjjbHjjjjbbg5BdKawclBd2aPcuf:Yh8AdndnadTmbaqhiaxheadhmindndnaiIdba8ANJbbbZMgO:lJbbb9p9DTmbaO:OhCxekcjjjj94hCkaCcCthCdndnaiclfIdba8ANJbbbZMgO:lJbbb9p9DTmbaO:OhExekcjjjj94hEkaEcqtaCVhCdndnaicwfIdba8ANJbbbZMgO:lJbbb9p9DTmbaO:OhExekcjjjj94hEkaeaCaEVBdbaicxfhiaeclfheamcufgmmbkazcFeasz:ojjjbh3cbhDcbhYindndndna3axaYcdtgKfydbgCcm4aC7c:v;t;h;Ev2gics4ai7aAGgmcdtfgEydbgecuSmbcehiinaxaecdtgefydbaCSmdamaifheaicefhia3aeaAGgmcdtfgEydbgecu9hmbkkaEaYBdbaDhiaDcefhDxeka5aefydbhika5aKfaiBdbaYcefgYad9hmbkcuaDc32giaDc;j:KM;jb0EhexekazcFeasz:ojjjb8AcbhDcbhekawaecbyd:m:jjjbHjjjjbbgeBd3awcvBd2aecbaiz:ojjjbhEavcd4hKdnadTmbdnalTmbaKcdth3a5hCaqhealhmadhAinaEaCydbc32fgiaeIdbaiIdbMUdbaiaeclfIdbaiIdlMUdlaiaecwfIdbaiIdwMUdwaiamIdbaiIdxMUdxaiamclfIdbaiIdzMUdzaiamcwfIdbaiIdCMUdCaiaiIdKJbbjZMUdKaCclfhCaecxfheama3fhmaAcufgAmbxdkka5hmaqheadhCinaEamydbc32fgiaeIdbaiIdbMUdbaiaeclfIdbaiIdlMUdlaiaecwfIdbaiIdwMUdwaiaiIdxJbbbbMUdxaiaiIdzJbbbbMUdzaiaiIdCJbbbbMUdCaiaiIdKJbbjZMUdKamclfhmaecxfheaCcufgCmbkkdnaDTmbaEhiaDheinaiaiIdbJbbbbJbbjZaicKfIdbgO:vaOJbbbb9BEgONUdbaiclfgmaOamIdbNUdbaicwfgmaOamIdbNUdbaicxfgmaOamIdbNUdbaiczfgmaOamIdbNUdbaicCfgmaOamIdbNUdbaic3fhiaecufgembkkcbhCawcuaDcdtgYaDcFFFFi0Egicbyd:m:jjjbHjjjjbbgeBdaawcoBd2awaicbyd:m:jjjbHjjjjbbg3Bd8KaecFeaYz:ojjjbhxdnadTmbJbbjZJbbjZa8A:vaPceSEaoNgOaONh8AaKcdthPalheina8Aaec;81jjbalEgmIdwaEa5ydbgAc32fgiIdC:tgOaONamIdbaiIdx:tgOaONamIdlaiIdz:tgOaONMMNaqcwfIdbaiIdw:tgOaONaqIdbaiIdb:tgOaONaqclfIdbaiIdl:tgOaONMMMhOdndnaxaAcdtgifgmydbcuSmba3aifIdbaO9ETmekamaCBdba3aifaOUdbka5clfh5aqcxfhqaeaPfheadaCcefgC9hmbkkabaxaYz:njjjb8AcrhikaicdthiinaiTmeaic98fgiawcxffydbcbyd1:jjjbH:bjjjbbxbkkawc;Wbf8KjjjjbaDk:Ydidui99ducbhi8Jjjjjbca9Rglczfcwfcbyd11jjbBdbalcb8Pdj1jjb83izalcwfcbydN1jjbBdbalcb8Pd:m1jjb83ibdndnaembJbbjFhvJbbjFhoJbbjFhrxekadcd4cdthwincbhdinalczfadfgDabadfIdbgvaDIdbgoaoav9EEUdbaladfgDavaDIdbgoaoav9DEUdbadclfgdcx9hmbkabawfhbaicefgiae9hmbkalIdwalIdK:thralIdlalIdC:thoalIdbalIdz:thvkJbbbbavavJbbbb9DEgvaoaoav9DEgvararav9DEk9DeeuabcFeaicdtz:ojjjbhlcbhbdnadTmbindnalaeydbcdtfgiydbcu9hmbaiabBdbabcefhbkaeclfheadcufgdmbkkabk9teiucbcbyd:q:jjjbgeabcifc98GfgbBd:q:jjjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik;teeeudndnaeabVciGTmbabhixekdndnadcz9pmbabhixekabhiinaiaeydbBdbaiaeydlBdlaiaeydwBdwaiaeydxBdxaeczfheaiczfhiadc9Wfgdcs0mbkkadcl6mbinaiaeydbBdbaeclfheaiclfhiadc98fgdci0mbkkdnadTmbinaiaeRbb86bbaicefhiaecefheadcufgdmbkkabk:3eedudndnabciGTmbabhixekaecFeGc:b:c:ew2hldndnadcz9pmbabhixekabhiinaialBdxaialBdwaialBdlaialBdbaiczfhiadc9Wfgdcs0mbkkadcl6mbinaialBdbaiclfhiadc98fgdci0mbkkdnadTmbinaiae86bbaicefhiadcufgdmbkkabk9teiucbcbyd:q:jjjbgeabcrfc94GfgbBd:q:jjjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik9:eiuZbhedndncbyd:q:jjjbgdaecztgi9nmbcuheadai9RcFFifcz4nbcuSmekadhekcbabae9Rcifc98Gcbyd:q:jjjbfgdBd:q:jjjbdnadZbcztge9nmbadae9RcFFifcz4nb8Akkk:Iedbcjwk1eFFuuFFuuFFuuFFuFFFuFFFuFbbbbbbbbeeebeebebbeeebebbbbbebebbbbbbbbbebbbdbbbbbbbebbbebbbdbbbbbbbbbbbeeeeebebbebbebebbbeebbbbbbbbbbbbbbbbbbbbbc1Dkxebbbdbbb:GNbb",e=new Uint8Array([32,0,65,2,1,106,34,33,3,128,11,4,13,64,6,253,10,7,15,116,127,5,8,12,40,16,19,54,20,9,27,255,113,17,42,67,24,23,146,148,18,14,22,45,70,69,56,114,101,21,25,63,75,136,108,28,118,29,73,115]);if(typeof WebAssembly!="object")return{supported:!1};var s,r=WebAssembly.instantiate(a(t),{}).then(function(p){s=p.instance,s.exports.__wasm_call_ctors()});function a(p){for(var d=new Uint8Array(p.length),m=0;m<p.length;++m){var h=p.charCodeAt(m);d[m]=h>96?h-97:h>64?h-39:h+4}for(var y=0,m=0;m<p.length;++m)d[y++]=d[m]<60?e[d[m]]:(d[m]-60)*64+d[++m];return d.buffer.slice(0,y)}function n(p){if(!p)throw new Error("Assertion failed")}function i(p){return new Uint8Array(p.buffer,p.byteOffset,p.byteLength)}function o(p,d,m){var h=s.exports.sbrk,y=h(d.length*4),w=h(m*4),v=new Uint8Array(s.exports.memory.buffer),x=i(d);v.set(x,y);var S=p(w,y,d.length,m);v=new Uint8Array(s.exports.memory.buffer);var T=new Uint32Array(m);new Uint8Array(T.buffer).set(v.subarray(w,w+m*4)),x.set(v.subarray(y,y+d.length*4)),h(y-h(0));for(var A=0;A<d.length;++A)d[A]=T[d[A]];return[T,S]}function c(p){for(var d=0,m=0;m<p.length;++m){var h=p[m];d=d<h?h:d}return d}function l(p,d,m,h,y,w,v,x,S){var T=s.exports.sbrk,A=T(4),_=T(m*4),N=T(y*w),B=T(m*4),C=new Uint8Array(s.exports.memory.buffer);C.set(i(h),N),C.set(i(d),B);var R=p(_,B,m,N,y,w,v,x,S,A);C=new Uint8Array(s.exports.memory.buffer);var O=new Uint32Array(R);i(O).set(C.subarray(_,_+R*4));var P=new Float32Array(1);return i(P).set(C.subarray(A,A+4)),T(A-T(0)),[O,P[0]]}function u(p,d,m,h,y,w,v,x,S,T,A,_,N){var B=s.exports.sbrk,C=B(4),R=B(m*4),O=B(y*w),P=B(y*x),H=B(S.length*4),Q=B(m*4),pe=T?B(y):0,ae=new Uint8Array(s.exports.memory.buffer);ae.set(i(h),O),ae.set(i(v),P),ae.set(i(S),H),ae.set(i(d),Q),T&&ae.set(i(T),pe);var me=p(R,Q,m,O,y,w,P,x,H,S.length,pe,A,_,N,C);ae=new Uint8Array(s.exports.memory.buffer);var Ae=new Uint32Array(me);i(Ae).set(ae.subarray(R,R+me*4));var be=new Float32Array(1);return i(be).set(ae.subarray(C,C+4)),B(C-B(0)),[Ae,be[0]]}function f(p,d,m,h){var y=s.exports.sbrk,w=y(m*h),v=new Uint8Array(s.exports.memory.buffer);v.set(i(d),w);var x=p(w,m,h);return y(w-y(0)),x}function b(p,d,m,h,y,w,v,x){var S=s.exports.sbrk,T=S(x*4),A=S(m*h),_=S(m*w),N=new Uint8Array(s.exports.memory.buffer);N.set(i(d),A),y&&N.set(i(y),_);var B=p(T,A,m,h,_,w,v,x);N=new Uint8Array(s.exports.memory.buffer);var C=new Uint32Array(B);return i(C).set(N.subarray(T,T+B*4)),S(T-S(0)),C}var g={LockBorder:1,Sparse:2,ErrorAbsolute:4,Prune:8,_InternalDebug:1<<30};return{ready:r,supported:!0,compactMesh:function(p){n(p instanceof Uint32Array||p instanceof Int32Array||p instanceof Uint16Array||p instanceof Int16Array),n(p.length%3==0);var d=p.BYTES_PER_ELEMENT==4?p:new Uint32Array(p);return o(s.exports.meshopt_optimizeVertexFetchRemap,d,c(p)+1)},simplify:function(p,d,m,h,y,w){n(p instanceof Uint32Array||p instanceof Int32Array||p instanceof Uint16Array||p instanceof Int16Array),n(p.length%3==0),n(d instanceof Float32Array),n(d.length%m==0),n(m>=3),n(h>=0&&h<=p.length),n(h%3==0),n(y>=0);for(var v=0,x=0;x<(w?w.length:0);++x)n(w[x]in g),v|=g[w[x]];var S=p.BYTES_PER_ELEMENT==4?p:new Uint32Array(p),T=l(s.exports.meshopt_simplify,S,p.length,d,d.length/m,m*4,h,y,v);return T[0]=p instanceof Uint32Array?T[0]:new p.constructor(T[0]),T},simplifyWithAttributes:function(p,d,m,h,y,w,v,x,S,T){n(p instanceof Uint32Array||p instanceof Int32Array||p instanceof Uint16Array||p instanceof Int16Array),n(p.length%3==0),n(d instanceof Float32Array),n(d.length%m==0),n(m>=3),n(h instanceof Float32Array),n(h.length%y==0),n(y>=0),n(v==null||v instanceof Uint8Array),n(v==null||v.length==d.length/m),n(x>=0&&x<=p.length),n(x%3==0),n(S>=0),n(Array.isArray(w)),n(y>=w.length),n(w.length<=32);for(var A=0;A<w.length;++A)n(w[A]>=0);for(var _=0,A=0;A<(T?T.length:0);++A)n(T[A]in g),_|=g[T[A]];var N=p.BYTES_PER_ELEMENT==4?p:new Uint32Array(p),B=u(s.exports.meshopt_simplifyWithAttributes,N,p.length,d,d.length/m,m*4,h,y*4,new Float32Array(w),v?new Uint8Array(v):null,x,S,_);return B[0]=p instanceof Uint32Array?B[0]:new p.constructor(B[0]),B},getScale:function(p,d){return n(p instanceof Float32Array),n(p.length%d==0),n(d>=3),f(s.exports.meshopt_simplifyScale,p,p.length/d,d*4)},simplifyPoints:function(p,d,m,h,y,w){return n(p instanceof Float32Array),n(p.length%d==0),n(d>=3),n(m>=0&&m<=p.length/d),h?(n(h instanceof Float32Array),n(h.length%y==0),n(y>=3),n(p.length/d==h.length/y),b(s.exports.meshopt_simplifyPoints,p,p.length/d,d*4,h,y*4,w,m)):b(s.exports.meshopt_simplifyPoints,p,p.length/d,d*4,void 0,0,0,m)}}})();var hT=(function(){var t="b9H79TebbbeVx9Geueu9Geub9Gbb9Giuuueu9Gmuuuuuuuuuuu9999eu9Gvuuuuueu9Gwuuuuuuuub9Gxuuuuuuuuuuuueu9Gkuuuuuuuuuu99eu9Gouuuuuub9Gruuuuuuub9GluuuubiOHdilvorwDqqkbiibeilve9Weiiviebeoweuec;G:Odkr:Yewo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bb8A9TW79O9V9Wt9F9I919P29K9nW79O2Wt79c9V919U9KbeX9TW79O9V9Wt9F9I919P29K9nW79O2Wt7bo39TW79O9V9Wt9F9J9V9T9W91tWJ2917tWV9c9V919U9K7br39TW79O9V9Wt9F9J9V9T9W91tW9nW79O2Wt9c9V919U9K7bDL9TW79O9V9Wt9F9V9Wt9P9T9P96W9nW79O2Wtbql79IV9RbkDwebcekdsPq;Q9BHdbkIbabaec9:fgefcufae9Ugeabci9Uadfcufad9Ugbaeab0Ek:w8KDPue99eux99dui99euo99iu8Jjjjjbc:WD9Rgm8KjjjjbdndnalmbcbhPxekamc:Cwfcbc;Kbz:njjjb8Adndnalcb9imbaoal9nmbamcuaocdtaocFFFFi0Egscbyd;y1jjbHjjjjbbgzBd:CwamceBd;8wamascbyd;y1jjbHjjjjbbgHBd:GwamcdBd;8wamcualcdtalcFFFFi0Ecbyd;y1jjbHjjjjbbgOBd:KwamciBd;8waihsalhAinazasydbcdtfcbBdbasclfhsaAcufgAmbkaihsalhAinazasydbcdtfgCaCydbcefBdbasclfhsaAcufgAmbkaihsalhCcbhXindnazasydbcdtgQfgAydbcb9imbaHaQfaXBdbaAaAydbgQcjjjj94VBdbaQaXfhXkasclfhsaCcufgCmbkalci9UhLdnalci6mbcbhsaihAinaAcwfydbhCaAclfydbhXaHaAydbcdtfgQaQydbgQcefBdbaOaQcdtfasBdbaHaXcdtfgXaXydbgXcefBdbaOaXcdtfasBdbaHaCcdtfgCaCydbgCcefBdbaOaCcdtfasBdbaAcxfhAaLascefgs9hmbkkaihsalhAindnazasydbcdtgCfgXydbgQcu9kmbaXaQcFFFFrGgQBdbaHaCfgCaCydbaQ9RBdbkasclfhsaAcufgAmbxdkkamcuaocdtgsaocFFFFi0EgAcbyd;y1jjbHjjjjbbgzBd:CwamceBd;8wamaAcbyd;y1jjbHjjjjbbgHBd:GwamcdBd;8wamcualcdtalcFFFFi0Ecbyd;y1jjbHjjjjbbgOBd:KwamciBd;8wazcbasz:njjjbhXalci9UhLaihsalhAinaXasydbcdtfgCaCydbcefBdbasclfhsaAcufgAmbkdnaoTmbcbhsaHhAaXhCaohQinaAasBdbaAclfhAaCydbasfhsaCclfhCaQcufgQmbkkdnalci6mbcbhsaihAinaAcwfydbhCaAclfydbhQaHaAydbcdtfgKaKydbgKcefBdbaOaKcdtfasBdbaHaQcdtfgQaQydbgQcefBdbaOaQcdtfasBdbaHaCcdtfgCaCydbgCcefBdbaOaCcdtfasBdbaAcxfhAaLascefgs9hmbkkaoTmbcbhsaohAinaHasfgCaCydbaXasfydb9RBdbasclfhsaAcufgAmbkkamaLcbyd;y1jjbHjjjjbbgsBd:OwamclBd;8wascbaLz:njjjbhYamcuaLcK2alcjjjjd0Ecbyd;y1jjbHjjjjbbg8ABd:SwamcvBd;8wJbbbbhEdnalci6g3mbarcd4hKaihAa8AhsaLhrJbbbbh5inavaAclfydbaK2cdtfgCIdlh8EavaAydbaK2cdtfgXIdlhEavaAcwfydbaK2cdtfgQIdlh8FaCIdwhaaXIdwhhaQIdwhgasaCIdbg8JaXIdbg8KMaQIdbg8LMJbbnn:vUdbasclfaXIdlaCIdlMaQIdlMJbbnn:vUdbaQIdwh8MaCIdwh8NaXIdwhyascxfa8EaE:tg8Eagah:tggNa8FaE:tg8Faaah:tgaN:tgEJbbbbJbbjZa8Ja8K:tg8Ja8FNa8La8K:tg8Ka8EN:tghahNaEaENaaa8KNaga8JN:tgEaENMM:rg8K:va8KJbbbb9BEg8ENUdbasczfaEa8ENUdbascCfaha8ENUdbascwfa8Maya8NMMJbbnn:vUdba5a8KMh5aAcxfhAascKfhsarcufgrmbka5aL:Z:vJbbbZNhEkamcuaLcdtalcFFFF970Ecbyd;y1jjbHjjjjbbgCBd:WwamcoBd;8waEaq:ZNhEdna3mbcbhsaChAinaAasBdbaAclfhAaLascefgs9hmbkkaE:rhhcuh8PamcuaLcltalcFFFFd0Ecbyd;y1jjbHjjjjbbgIBd:0wamcrBd;8wcbaIa8AaCaLz:djjjb8AJFFuuhyJFFuuh8RJFFuuh8Sdnalci6gXmbJFFuuh8Sa8AhsaLhAJFFuuh8RJFFuuhyinascwfIdbgEayayaE9EEhyasclfIdbgEa8Ra8RaE9EEh8RasIdbgEa8Sa8SaE9EEh8SascKfhsaAcufgAmbkkahJbbbZNhgamaocetgscuaocu9kEcbyd;y1jjbHjjjjbbgABd:4waAcFeasz:njjjbhCdnaXmbcbhAJFFuuhEa8Ahscuh8PinascwfIdbay:tghahNasIdba8S:tghahNasclfIdba8R:tghahNMM:rghaEa8PcuSahaE9DVgXEhEaAa8PaXEh8PascKfhsaLaAcefgA9hmbkkamczfcbcjwz:njjjb8Aamcwf9cb83ibam9cb83ibagaxNhRJbbjZak:th8Ncbh8UJbbbbh8VJbbbbh8WJbbbbh8XJbbbbh8YJbbbbh8ZJbbbbh80cbh81cbhPinJbbbbhEdna8UTmbJbbjZa8U:Z:vhEkJbbbbhhdna80a80Na8Ya8YNa8Za8ZNMMg8KJbbbb9BmbJbbjZa8K:r:vhhka8XaENh5a8WaENh8Fa8VaENhaa8PhQdndndndndna8UaPVTmbamydwgBTmea80ahNh8Ja8ZahNh8La8YahNh8Maeamydbcdtfh83cbh3JFFuuhEcvhXcuhQindnaza83a3cdtfydbcdtgsfydbgvTmbaOaHasfydbcdtfhAindndnaCaiaAydbgKcx2fgsclfydbgrcetf8Vebcs4aCasydbgLcetf8Vebcs4faCascwfydbglcetf8Vebcs4fgombcbhsxekcehsazaLcdtfydbgLceSmbcehsazarcdtfydbgrceSmbcehsazalcdtfydbglceSmbdnarcdSaLcdSfalcdSfcd6mbaocefhsxekaocdfhskdnasaX9kmba8AaKcK2fgLIdwa5:thhaLIdla8F:th8KaLIdbaa:th8EdndnakJbbbb9DTmba8E:lg8Ea8K:lg8Ka8Ea8K9EEg8Kah:lgha8Kah9EEag:vJbbjZMhhxekahahNa8Ea8ENa8Ka8KNMM:rag:va8NNJbbjZMJ9VO:d86JbbjZaLIdCa8JNaLIdxa8MNa8LaLIdzNMMakN:tghahJ9VO:d869DENhhkaKaQasaX6ahaE9DVgLEhQasaXaLEhXahaEaLEhEkaAclfhAavcufgvmbkka3cefg3aB9hmbkkaQcu9hmekama5Ud:ODama8FUd:KDamaaUd:GDamcuBd:qDamcFFF;7rBdjDaIcba8AaYamc:GDfakJbbbb9Damc:qDfamcjDfz:ejjjbamyd:qDhQdndnaxJbbbb9ETmba8UaD6mbaQcuSmeceh3amIdjDaR9EmixdkaQcu9hmekdna8UTmbdnamydlgza8Uci2fgsciGTmbadasfcba8Uazcu7fciGcefz:njjjb8AkabaPcltfgzam8Pib83dbazcwfamcwf8Pib83dbaPcefhPkc3hzinazc98Smvamc:Cwfazfydbcbyd;u1jjbH:bjjjbbazc98fhzxbkkcbh3a8Uaq9pmbamydwaCaiaQcx2fgsydbcetf8Vebcs4aCascwfydbcetf8Vebcs4faCasclfydbcetf8Vebcs4ffaw9nmekcbhscbhAdna81TmbcbhAamczfhXinamczfaAcdtfaXydbgLBdbaXclfhXaAaYaLfRbbTfhAa81cufg81mbkkamydwhlamydbhXam9cu83i:GDam9cu83i:ODam9cu83i:qDam9cu83i:yDaAc;8eaAclfc:bd6Eh81inamcjDfasfcFFF;7rBdbasclfgscz9hmbka81cdthBdnalTmbaeaXcdtfhocbhrindnazaoarcdtfydbcdtgsfydbgvTmbaOaHasfydbcdtfhAcuhLcuhsinazaiaAydbgKcx2fgXclfydbcdtfydbazaXydbcdtfydbfazaXcwfydbcdtfydbfgXasaXas6gXEhsaKaLaXEhLaAclfhAavcufgvmbkaLcuSmba8AaLcK2fgAIdway:tgEaENaAIdba8S:tgEaENaAIdla8R:tgEaENMM:rhEcbhAindndnasamc:qDfaAfgvydbgX6mbasaX9hmeaEamcjDfaAfIdb9FTmekavasBdbamc:GDfaAfaLBdbamcjDfaAfaEUdbxdkaAclfgAcz9hmbkkarcefgral9hmbkkamczfaBfhLcbhscbhAindnamc:GDfasfydbgXcuSmbaLaAcdtfaXBdbaAcefhAkasclfgscz9hmbkaAa81fg81TmbJFFuuhhcuhKamczfhsa81hvcuhLina8AasydbgXcK2fgAIdway:tgEaENaAIdba8S:tgEaENaAIdla8R:tgEaENMM:rhEdndnazaiaXcx2fgAclfydbcdtfydbazaAydbcdtfydbfazaAcwfydbcdtfydbfgAaL6mbaAaL9hmeaEah9DTmekaEhhaAhLaXhKkasclfhsavcufgvmbkaKcuSmbaKhQkdnamaiaQcx2fgrydbarclfydbarcwfydbaCabaeadaPawaqa3z:fjjjbTmbaPcefhPJbbbbh8VJbbbbh8WJbbbbh8XJbbbbh8YJbbbbh8ZJbbbbh80kcbhXinaOaHaraXcdtfydbcdtgAfydbcdtfgKhsazaAfgvydbgLhAdnaLTmbdninasydbaQSmeasclfhsaAcufgATmdxbkkasaKaLcdtfc98fydbBdbavavydbcufBdbkaXcefgXci9hmbka8AaQcK2fgsIdbhEasIdlhhasIdwh8KasIdxh8EasIdzh5asIdCh8FaYaQfce86bba80a8FMh80a8Za5Mh8Za8Ya8EMh8Ya8Xa8KMh8Xa8WahMh8Wa8VaEMh8Vamydxh8Uxbkkamc:WDf8KjjjjbaPk;Vvivuv99lu8Jjjjjbca9Rgv8Kjjjjbdndnalcw0mbaiydbhoaeabcitfgralcdtcufBdlaraoBdbdnalcd6mbaiclfhoalcufhwarcxfhrinaoydbhDarcuBdbarc98faDBdbarcwfhraoclfhoawcufgwmbkkalabfhrxekcbhDavczfcwfcbBdbav9cb83izavcwfcbBdbav9cb83ibJbbjZhqJbbjZhkinadaiaDcdtfydbcK2fhwcbhrinavczfarfgoawarfIdbgxaoIdbgm:tgPakNamMgmUdbavarfgoaPaxam:tNaoIdbMUdbarclfgrcx9hmbkJbbjZaqJbbjZMgq:vhkaDcefgDal9hmbkcbhoadcbcecdavIdlgxavIdwgm9GEgravIdbgPam9GEaraPax9GEgscdtgrfhzavczfarfIdbhxaihralhwinaiaocdtfgDydbhHaDarydbgOBdbaraHBdbarclfhraoazaOcK2fIdbax9Dfhoawcufgwmbkaeabcitfhrdndnaocv6mbaoalc98f6mekaraiydbBdbaralcdtcufBdlaiclfhoalcufhwarcxfhrinaoydbhDarcuBdbarc98faDBdbarcwfhraoclfhoawcufgwmbkalabfhrxekaraxUdbararydlc98GasVBdlabcefaeadaiaoz:djjjbhwararydlciGawabcu7fcdtVBdlawaeadaiaocdtfalao9Rz:djjjbhrkavcaf8Kjjjjbark:;idiud99dndnabaecitfgwydlgDciGgqciSmbinabcbaDcd4gDalaqcdtfIdbawIdb:tgkJbbbb9FEgwaecefgefadaialavaoarz:ejjjbak:larIdb9FTmdabawaD7aefgecitfgwydlgDciGgqci9hmbkkabaecitfgeclfhbdnavmbcuhwindnaiaeydbgDfRbbmbadaDcK2fgqIdwalIdw:tgkakNaqIdbalIdb:tgkakNaqIdlalIdl:tgkakNMM:rgkarIdb9DTmbarakUdbaoaDBdbkaecwfheawcefgwabydbcd46mbxdkkcuhwindnaiaeydbgDfRbbmbadaDcK2fgqIdbalIdb:t:lgkaqIdlalIdl:t:lgxakax9EEgkaqIdwalIdw:t:lgxakax9EEgkarIdb9DTmbarakUdbaoaDBdbkaecwfheawcefgwabydbcd46mbkkk;llevudnabydwgxaladcetfgm8Vebcs4alaecetfgP8Vebgscs4falaicetfgz8Vebcs4ffaD0abydxaq9pVakVgDce9hmbavawcltfgxab8Pdb83dbaxcwfabcwfgx8Pdb83dbdnaxydbgqTmbaoabydbcdtfhxaqhsinalaxydbcetfcFFi87ebaxclfhxascufgsmbkkdnabydxglci2gsabydlgxfgkciGTmbarakfcbalaxcu7fciGcefz:njjjb8Aabydxci2hsabydlhxabydwhqkab9cb83dwababydbaqfBdbabascifc98GaxfBdlaP8Vebhscbhxkdnascztcz91cu9kmbabaxcefBdwaPax87ebaoabydbcdtfaxcdtfaeBdbkdnam8Uebcu9kmbababydwgxcefBdwamax87ebaoabydbcdtfaxcdtfadBdbkdnaz8Uebcu9kmbababydwgxcefBdwazax87ebaoabydbcdtfaxcdtfaiBdbkarabydlfabydxci2faPRbb86bbarabydlfabydxci2fcefamRbb86bbarabydlfabydxci2fcdfazRbb86bbababydxcefBdxaDk8LbabaeadaialavaoarawaDaDaqJbbbbz:cjjjbk;Nkovud99euv99eul998Jjjjjbc:W;ae9Rgo8KjjjjbdndnadTmbavcd4hrcbhwcbhDindnaiaeclfydbar2cdtfgvIdbaiaeydbar2cdtfgqIdbgk:tgxaiaecwfydbar2cdtfgmIdlaqIdlgP:tgsNamIdbak:tgzavIdlaP:tgPN:tgkakNaPamIdwaqIdwgH:tgONasavIdwaH:tgHN:tgPaPNaHazNaOaxN:tgxaxNMM:rgsJbbbb9Bmbaoc:W:qefawcx2fgAakas:vUdwaAaxas:vUdlaAaPas:vUdbaoc8Wfawc8K2fgAaq8Pdb83dbaAav8Pdb83dxaAam8Pdb83dKaAcwfaqcwfydbBdbaAcCfavcwfydbBdbaAcafamcwfydbBdbawcefhwkaecxfheaDcifgDad6mbkab9cb83dbabcyf9cb83dbabcaf9cb83dbabcKf9cb83dbabczf9cb83dbabcwf9cb83dbawTmeaocbBd8Sao9cb83iKao9cb83izaoczfaoc8Wfawci2cxaoc8Sfcbcrz1jjjbaoIdKhCaoIdChXaoIdzhQao9cb83iwao9cb83ibaoaoc:W:qefawcxaoc8Sfcbciz1jjjbJbbjZhkaoIdwgPJbbbbJbbjZaPaPNaoIdbgPaPNaoIdlgsasNMM:rgx:vaxJbbbb9BEgzNhxasazNhsaPazNhzaoc:W:qefheawhvinaecwfIdbaxNaeIdbazNasaeclfIdbNMMgPakaPak9DEhkaecxfheavcufgvmbkabaCUdwabaXUdlabaQUdbabaoId3UdxdndnakJ;n;m;m899FmbJbbbbhPaoc:W:qefheaoc8WfhvinaCavcwfIdb:taecwfIdbgHNaQavIdb:taeIdbgONaXavclfIdb:taeclfIdbgLNMMaxaHNazaONasaLNMM:vgHaPaHaP9EEhPavc8KfhvaecxfheawcufgwmbkabaxUd8KabasUdaabazUd3abaCaxaPN:tUdKabaXasaPN:tUdCabaQazaPN:tUdzabJbbjZakakN:t:rgkUdydndnaxJbbj:;axJbbj:;9GEgPJbbjZaPJbbjZ9FEJbb;:9cNJbbbZJbbb:;axJbbbb9GEMgP:lJbbb9p9DTmbaP:Ohexekcjjjj94hekabae86b8UdndnasJbbj:;asJbbj:;9GEgPJbbjZaPJbbjZ9FEJbb;:9cNJbbbZJbbb:;asJbbbb9GEMgP:lJbbb9p9DTmbaP:Ohvxekcjjjj94hvkabav86bRdndnazJbbj:;azJbbj:;9GEgPJbbjZaPJbbjZ9FEJbb;:9cNJbbbZJbbb:;azJbbbb9GEMgP:lJbbb9p9DTmbaP:Ohqxekcjjjj94hqkabaq86b8SdndnaecKtcK91:YJbb;:9c:vax:t:lavcKtcK91:YJbb;:9c:vas:t:laqcKtcK91:YJbb;:9c:vaz:t:lakMMMJbb;:9cNJbbjZMgk:lJbbb9p9DTmbak:Ohexekcjjjj94hekaecFbaecFb9iEhexekabcjjj;8iBdycFbhekabae86b8Vxekab9cb83dbabcyf9cb83dbabcaf9cb83dbabcKf9cb83dbabczf9cb83dbabcwf9cb83dbkaoc:W;aef8Kjjjjbk;Iwwvul99iud99eue99eul998Jjjjjbcje9Rgr8Kjjjjbavcd4hwaicd4hDdndnaoTmbarc;abfcbaocdtgvz:njjjb8Aarc;Gbfcbavz:njjjb8AarhvarcafhiaohqinavcFFF97BdbaicFFF;7rBdbaiclfhiavclfhvaqcufgqmbkdnadTmbcbhkinaeakaD2cdtfgvIdwhxavIdlhmavIdbhPalakaw2cdtfIdbhsarc;abfhzarhiarc;GbfhHarcafhqcj1jjbhvaohOinasavcwfIdbaxNavIdbaPNavclfIdbamNMMgAMhCakhXdnaAas:tgAaqIdbgQ9DgLmbaHydbhXkaHaXBdbakhXdnaCaiIdbgK9EmbazydbhXaKhCkazaXBdbaiaCUdbaqaAaQaLEUdbavcxfhvaqclfhqaHclfhHaiclfhiazclfhzaOcufgOmbkakcefgkad9hmbkkadThkJbbbbhCcbhXarc;abfhvarc;Gbfhicbhqinalavydbgzaw2cdtfIdbalaiydbgHaw2cdtfIdbaeazaD2cdtfgzIdwaeaHaD2cdtfgHIdw:tgsasNazIdbaHIdb:tgsasNazIdlaHIdl:tgsasNMM:rMMgsaCasaC9EgzEhCaqaXazEhXaiclfhiavclfhvaoaqcefgq9hmbkaCJbbbZNhKxekadThkcbhXJbbbbhKkJbbbbhCdnaearc;abfaXcdtgifydbgqaD2cdtfgvIdwaearc;GbfaifydbgzaD2cdtfgiIdwgm:tgsasNavIdbaiIdbgY:tgAaANavIdlaiIdlgP:tgQaQNMM:rgxJbbbb9ETmbaxalaqaw2cdtfIdbMalazaw2cdtfIdb:taxaxM:vhCkasaCNamMhmaQaCNaPMhPaAaCNaYMhYdnakmbaDcdthvawcdthiindnalIdbg8AaecwfIdbam:tgCaCNaeIdbaY:tgsasNaeclfIdbaP:tgAaANMM:rgQMgEaK9ETmbJbbbbhxdnaQJbbbb9ETmbaEaK:taQaQM:vhxkaxaCNamMhmaxaANaPMhPaxasNaYMhYa8AaKaQMMJbbbZNhKkaeavfhealaifhladcufgdmbkkabaKUdxabamUdwabaPUdlabaYUdbarcjef8Kjjjjbkjeeiu8Jjjjjbcj8W9Rgr8Kjjjjbaici2hwdnaiTmbawceawce0EhDarhiinaiaeadRbbcdtfydbBdbadcefhdaiclfhiaDcufgDmbkkabarawaladaoz:hjjjbarcj8Wf8Kjjjjbk:3lequ8JjjjjbcjP9Rgl8Kjjjjbcbhvalcjxfcbaiz:njjjb8AdndnadTmbcjehoaehrincuhwarhDcuhqavhkdninawakaoalcjxfaDcefRbbfRbb9RcFeGci6aoalcjxfaDRbbfRbb9RcFeGci6faoalcjxfaDcdfRbbfRbb9RcFeGci6fgxaq9mgmEhwdnammbaxce0mdkaxaqaxaq9kEhqaDcifhDadakcefgk9hmbkkaeawci2fgDcdfRbbhqaDcefRbbhxaDRbbhkaeavci2fgDcifaDawav9Rci2z:qjjjb8Aakalcjxffaocefgo86bbaxalcjxffao86bbaDcdfaq86bbaDcefax86bbaDak86bbaqalcjxffao86bbarcifhravcefgvad9hmbkalcFeaicetz:njjjbhoadci2gDceaDce0EhqcbhxindnaoaeRbbgkcetfgw8UebgDcu9kmbawax87ebaocjlfaxcdtfabakcdtfydbBdbaxhDaxcefhxkaeaD86bbaecefheaqcufgqmbkaxcdthDxekcbhDkabalcjlfaDz:mjjjb8AalcjPf8Kjjjjbk9teiucbcbyd;C1jjbgeabcifc98GfgbBd;C1jjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik;teeeudndnaeabVciGTmbabhixekdndnadcz9pmbabhixekabhiinaiaeydbBdbaiaeydlBdlaiaeydwBdwaiaeydxBdxaeczfheaiczfhiadc9Wfgdcs0mbkkadcl6mbinaiaeydbBdbaeclfheaiclfhiadc98fgdci0mbkkdnadTmbinaiaeRbb86bbaicefhiaecefheadcufgdmbkkabk:3eedudndnabciGTmbabhixekaecFeGc:b:c:ew2hldndnadcz9pmbabhixekabhiinaialBdxaialBdwaialBdlaialBdbaiczfhiadc9Wfgdcs0mbkkadcl6mbinaialBdbaiclfhiadc98fgdci0mbkkdnadTmbinaiae86bbaicefhiadcufgdmbkkabk9teiucbcbyd;C1jjbgeabcrfc94GfgbBd;C1jjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik9:eiuZbhedndncbyd;C1jjbgdaecztgi9nmbcuheadai9RcFFifcz4nbcuSmekadhekcbabae9Rcifc98Gcbyd;C1jjbfgdBd;C1jjbdnadZbcztge9nmbadae9RcFFifcz4nb8Akk:;Deludndndnadch9pmbabaeSmdaeabadfgi9Rcbadcet9R0mekabaead;8qbbxekaeab7ciGhldndndnabae9pmbdnalTmbadhvabhixikdnabciGmbadhvabhixdkadTmiabaeRbb86bbadcufhvdnabcefgiciGmbaecefhexdkavTmiabaeRbe86beadc9:fhvdnabcdfgiciGmbaecdfhexdkavTmiabaeRbd86bdadc99fhvdnabcifgiciGmbaecifhexdkavTmiabaeRbi86biabclfhiaeclfheadc98fhvxekdnalmbdnaiciGTmbadTmlabadcufgifglaeaifRbb86bbdnalciGmbaihdxekaiTmlabadc9:fgifglaeaifRbb86bbdnalciGmbaihdxekaiTmlabadc99fgifglaeaifRbb86bbdnalciGmbaihdxekaiTmlabadc98fgdfaeadfRbb86bbkadcl6mbdnadc98fgocd4cefciGgiTmbaec98fhlabc98fhvinavadfaladfydbBdbadc98fhdaicufgimbkkaocx6mbaec9Wfhvabc9WfhoinaoadfgicxfavadfglcxfydbBdbaicwfalcwfydbBdbaiclfalclfydbBdbaialydbBdbadc9Wfgdci0mbkkadTmdadhidnadciGglTmbaecufhvabcufhoadhiinaoaifavaifRbb86bbaicufhialcufglmbkkadcl6mdaec98fhlabc98fhvinavaifgecifalaifgdcifRbb86bbaecdfadcdfRbb86bbaecefadcefRbb86bbaeadRbb86bbaic98fgimbxikkavcl6mbdnavc98fglcd4cefcrGgdTmbavadcdt9RhvinaiaeydbBdbaeclfheaiclfhiadcufgdmbkkalc36mbinaiaeydbBdbaiaeydlBdlaiaeydwBdwaiaeydxBdxaiaeydzBdzaiaeydCBdCaiaeydKBdKaiaeyd3Bd3aecafheaicafhiavc9Gfgvci0mbkkavTmbdndnavcrGgdmbavhlxekavc94GhlinaiaeRbb86bbaicefhiaecefheadcufgdmbkkavcw6mbinaiaeRbb86bbaiaeRbe86beaiaeRbd86bdaiaeRbi86biaiaeRbl86blaiaeRbv86bvaiaeRbo86boaiaeRbr86braicwfhiaecwfhealc94fglmbkkabkk9Tdbcjwk9ubbjZbbbbbbbbbbbbbbjZbbbbbbbbbbbbbbjZ86;nAZ86;nAZ86;nAZ86;nA:;86;nAZ86;nAZ86;nAZ86;nA:;86;nAZ86;nAZ86;nAZ86;nA:;bc;uwkxebbbdbbb9GNbb",e=new Uint8Array([32,0,65,2,1,106,34,33,3,128,11,4,13,64,6,253,10,7,15,116,127,5,8,12,40,16,19,54,20,9,27,255,113,17,42,67,24,23,146,148,18,14,22,45,70,69,56,114,101,21,25,63,75,136,108,28,118,29,73,115]);if(typeof WebAssembly!="object")return{supported:!1};var s,r=WebAssembly.instantiate(a(t),{}).then(function(p){s=p.instance,s.exports.__wasm_call_ctors()});function a(p){for(var d=new Uint8Array(p.length),m=0;m<p.length;++m){var h=p.charCodeAt(m);d[m]=h>96?h-97:h>64?h-39:h+4}for(var y=0,m=0;m<p.length;++m)d[y++]=d[m]<60?e[d[m]]:(d[m]-60)*64+d[++m];return d.buffer.slice(0,y)}function n(p){if(!p)throw new Error("Assertion failed")}function i(p){return new Uint8Array(p.buffer,p.byteOffset,p.byteLength)}var o=48,c=16;function l(p,d){var m=p.meshlets[d*4+0],h=p.meshlets[d*4+1],y=p.meshlets[d*4+2],w=p.meshlets[d*4+3];return{vertices:p.vertices.subarray(m,m+y),triangles:p.triangles.subarray(h,h+w*3)}}function u(p,d,m,h,y,w,v){var x=s.exports.sbrk,S=s.exports.meshopt_buildMeshletsBound(p.length,y,w),T=x(S*c),A=x(S*y*4),_=x(S*w*3),N=x(p.byteLength),B=x(d.byteLength),C=new Uint8Array(s.exports.memory.buffer);C.set(i(p),N),C.set(i(d),B);var R=s.exports.meshopt_buildMeshlets(T,A,_,N,p.length,B,m,h,y,w,v);C=new Uint8Array(s.exports.memory.buffer);for(var O=C.subarray(T,T+R*c),P=new Uint32Array(O.buffer,O.byteOffset,O.byteLength/4).slice(),H=0;H<R;++H){var Q=P[H*4+0],pe=P[H*4+1],m=P[H*4+2],ae=P[H*4+3];s.exports.meshopt_optimizeMeshlet(A+Q*4,_+pe,ae,m)}var me=P[(R-1)*4+0],Ae=P[(R-1)*4+1],be=P[(R-1)*4+2],_e=P[(R-1)*4+3],ye=me+be,Le=Ae+(_e*3+3&-4),Ie={meshlets:P,vertices:new Uint32Array(C.buffer,A,ye).slice(),triangles:new Uint8Array(C.buffer,_,Le*3).slice(),meshletCount:R};return x(T-x(0)),Ie}function f(p){var d=new Float32Array(s.exports.memory.buffer,p,o/4);return{centerX:d[0],centerY:d[1],centerZ:d[2],radius:d[3],coneApexX:d[4],coneApexY:d[5],coneApexZ:d[6],coneAxisX:d[7],coneAxisY:d[8],coneAxisZ:d[9],coneCutoff:d[10]}}function b(p,d,m,h){var y=s.exports.sbrk,w=[],v=y(d.byteLength),x=y(p.vertices.byteLength),S=y(p.triangles.byteLength),T=y(o),A=new Uint8Array(s.exports.memory.buffer);A.set(i(d),v),A.set(i(p.vertices),x),A.set(i(p.triangles),S);for(var _=0;_<p.meshletCount;++_){var N=p.meshlets[_*4+0],B=p.meshlets[_*4+0+1],C=p.meshlets[_*4+0+3];s.exports.meshopt_computeMeshletBounds(T,x+N*4,S+B,C,v,m,h),w.push(f(T))}return y(v-y(0)),w}function g(p,d,m,h){var y=s.exports.sbrk,w=y(o),v=y(p.byteLength),x=y(d.byteLength),S=new Uint8Array(s.exports.memory.buffer);S.set(i(p),v),S.set(i(d),x),s.exports.meshopt_computeClusterBounds(w,v,p.length,x,m,h);var T=f(w);return y(w-y(0)),T}return{ready:r,supported:!0,buildMeshlets:function(p,d,m,h,y,w){n(p.length%3==0),n(d instanceof Float32Array),n(d.length%m==0),n(m>=3),n(h<=256||h>0),n(y<=512),n(y%4==0),w=w||0;var v=p.BYTES_PER_ELEMENT==4?p:new Uint32Array(p);return u(v,d,d.length/m,m*4,h,y,w)},computeClusterBounds:function(p,d,m){n(p.length%3==0),n(p.length/3<=512),n(d instanceof Float32Array),n(d.length%m==0),n(m>=3);var h=p.BYTES_PER_ELEMENT==4?p:new Uint32Array(p);return g(h,d,d.length/m,m*4)},computeMeshletBounds:function(p,d,m){return n(p.meshletCount!=0),n(d instanceof Float32Array),n(d.length%m==0),n(m>=3),b(p,d,d.length/m,m*4)},extractMeshlet:function(p,d){return n(d>=0&&d<p.meshletCount),l(p,d)}}})();var td=new _l().registerExtensions([mi,yi,wi]).registerDependencies({"meshopt.decoder":ya});async function sd(t,e={}){await ya.ready;let s;if(e.fetchBytes)s=new Uint8Array(await e.fetchBytes(t));else{let c=await fetch(t,{cache:e.fetchCache||"no-store"});if(!c.ok)throw new Error(`Failed to load ${t}: ${c.status}`);s=new Uint8Array(await c.arrayBuffer())}let r=await td.readBinary(s),a=[],n=e.componentFeatures||new Map,i=new Map;function o(c,l=""){let u=n.has(c.getName());u&&i.set(c.getName(),(i.get(c.getName())||0)+1);let f=u?c.getName():l,b=c.getMesh();if(b){let g=c.getWorldMatrix();for(let p of b.listPrimitives()){let d=p.getAttribute("POSITION"),m=p.getAttribute("NORMAL"),h=p.getAttribute("_FEATURE_ID_0"),y=p.getAttribute("_FEATURE_ID_1"),w=p.getIndices()?.getArray();if(!d||!w)continue;let v=d.getCount(),x=new Float32Array(v*3),S=new Float32Array(v*3),T=new Uint32Array(v),A=new Uint32Array(v),_=[1/0,1/0,1/0,-1/0,-1/0,-1/0],N=[],B=n.get(f)?.featureId||e.defaultFeatureId||0;for(let R=0;R<v;R+=1)d.getElement(R,N),q0(x,R*3,N,g),_[0]=Math.min(_[0],x[R*3]),_[1]=Math.min(_[1],x[R*3+1]),_[2]=Math.min(_[2],x[R*3+2]),_[3]=Math.max(_[3],x[R*3]),_[4]=Math.max(_[4],x[R*3+1]),_[5]=Math.max(_[5],x[R*3+2]),m?(m.getElement(R,N),W0(S,R*3,N,g)):S.set([0,0,1],R*3),T[R]=Number(h?.getScalar(R)||0),A[R]=Number(y?y.getScalar(R)||0:B);let C=p.getMaterial();a.push({position:x,normal:S,netId:T,objectFeatureId:A,indices:w,designator:f,nodeName:c.getName(),meshName:b.getName(),bounds:_,material:C?{name:C.getName(),baseColor:C.getBaseColorFactor(),metallic:C.getMetallicFactor(),roughness:C.getRoughnessFactor(),emissive:C.getEmissiveFactor()}:{baseColor:e.baseColor||[.55,.58,.64,1],metallic:.05,roughness:.72,emissive:[0,0,0]}})}}for(let g of c.listChildren())o(g,f)}for(let c of r.getRoot().listScenes())for(let l of c.listChildren())o(l);return{byteLength:s.byteLength,primitives:a,componentNodeCounts:i}}function q0(t,e,s,r){let a=r[0]*s[0]+r[4]*s[1]+r[8]*s[2]+r[12],n=r[1]*s[0]+r[5]*s[1]+r[9]*s[2]+r[13],i=r[2]*s[0]+r[6]*s[1]+r[10]*s[2]+r[14];t[e]=a,t[e+1]=-i,t[e+2]=n}function W0(t,e,s,r){let a=r[0]*s[0]+r[4]*s[1]+r[8]*s[2],n=r[1]*s[0]+r[5]*s[1]+r[9]*s[2],i=r[2]*s[0]+r[6]*s[1]+r[10]*s[2],o=Math.hypot(a,n,i)||1;t[e]=a/o,t[e+1]=-i/o,t[e+2]=n/o}async function rd(t,e={}){await ya.ready;let s;if(e.fetchBytes)s=new Uint8Array(await e.fetchBytes(t));else{let f=await fetch(t,{cache:e.fetchCache||"no-store"});if(!f.ok)throw new Error(`Failed to load ${t}: ${f.status}`);s=new Uint8Array(await f.arrayBuffer())}let r=await td.readBinary(s),a=e.componentFeatures||new Map,n=new Map,i=new Map,o=new Map,c=0;function l(f){if(o.has(f))return o.get(f);let b=f.getAttribute("POSITION"),g=f.getIndices()?.getArray();if(!b||!g)return o.set(f,null),null;let p=f.getAttribute("NORMAL"),d=f.getAttribute("_FEATURE_ID_0"),m=f.getAttribute("_FEATURE_ID_1"),h=b.getCount(),y=new Float32Array(h*3),w=new Float32Array(h*3),v=new Uint32Array(h),x=new Uint32Array(h),S=[];for(let B=0;B<h;B+=1)b.getElement(B,S),y.set(S.slice(0,3),B*3),p?(p.getElement(B,S),w.set(S.slice(0,3),B*3)):w.set([0,1,0],B*3),v[B]=Number(d?.getScalar(B)||0),x[B]=Number(m?.getScalar(B)||0);let T=Y0(f.getMaterial(),e),A=[rr(y),rr(w),rr(v),rr(x),rr(g),h,g.length,JSON.stringify(T)].join(":"),_=i.get(A),N=_;return(!_||!J0(_.primitive,y,w,v,x,g))&&(N={primitive:{position:y,normal:w,netId:v,objectFeatureId:x,indices:Uint32Array.from(g),material:T,bounds:null},placements:[]},i.set(_?`${A}:${i.size}`:A,N)),o.set(f,N),N}function u(f,b=""){let g=a.has(f.getName());g&&n.set(f.getName(),(n.get(f.getName())||0)+1);let p=g?f.getName():b,d=f.getMesh();if(d){let m=X0(f.getWorldMatrix());m[11]+=Number(e.zOffset||0);let h=Number(a.get(p)?.featureId||e.defaultFeatureId||0),y=c++;for(let w of d.listPrimitives()){let v=l(w);if(!v)continue;let x=$0(v.primitive.position,m);v.placements.push({rows:m,featureId:h,designator:p,bounds:x,node:y});let S=v.primitive.bounds;v.primitive.bounds=S?[Math.min(S[0],x[0]),Math.min(S[1],x[1]),Math.min(S[2],x[2]),Math.max(S[3],x[3]),Math.max(S[4],x[4]),Math.max(S[5],x[5])]:[...x]}}for(let m of f.listChildren())u(m,p)}for(let f of r.getRoot().listScenes())for(let b of f.listChildren())u(b);return{byteLength:s.byteLength,models:[...i.values()],componentNodeCounts:n}}function X0(t){return[t[0],t[4],t[8],t[12],-t[2],-t[6],-t[10],-t[14],t[1],t[5],t[9],t[13]]}function $0(t,e){let s=[1/0,1/0,1/0,-1/0,-1/0,-1/0];for(let r=0;r<t.length;r+=3){let a=t[r],n=t[r+1],i=t[r+2];for(let o=0;o<3;o+=1){let c=o*4,l=e[c]*a+e[c+1]*n+e[c+2]*i+e[c+3];l<s[o]&&(s[o]=l),l>s[o+3]&&(s[o+3]=l)}}return s}function Y0(t,e){return t?{name:t.getName(),baseColor:t.getBaseColorFactor(),metallic:t.getMetallicFactor(),roughness:t.getRoughnessFactor(),emissive:t.getEmissiveFactor()}:{baseColor:e.baseColor||[.55,.58,.64,1],metallic:.05,roughness:.72,emissive:[0,0,0]}}function rr(t){let e=t.BYTES_PER_ELEMENT===4?new Uint32Array(t.buffer,t.byteOffset,t.length):t,s=2166136261;for(let r=0;r<e.length;r+=1)s^=e[r],s=Math.imul(s,16777619)>>>0;return s.toString(36)}function J0(t,e,s,r,a,n){let i=(o,c)=>o.length===c.length&&o.every((l,u)=>l===c[u]);return i(t.position,e)&&i(t.normal,s)&&i(t.netId,r)&&i(t.objectFeatureId,a)&&i(t.indices,n)}var Xt=Object.freeze({mm:.5,deg:15}),vi=Object.freeze([[1,0,0],[0,1,0],[0,0,1]]);function xi(t=Xt){let e=Number(t?.mm)>0?Number(t.mm):Xt.mm,s=Number(t?.deg)>0?Number(t.deg):Xt.deg;return{mm:e,deg:s,fineMm:e/10,fineDeg:1}}function wa(t,e=Xt){let s=xi(e);return{mm:Number(t?.mm)>0?Number(t.mm):s.mm,deg:Number(t?.deg)>0?Number(t.deg):s.deg}}function ad(t){return Math.round(t*1e9)/1e9+0}function $t(t){let e=Math.hypot(...t.rotation)||1,s=t.rotation.map(a=>a/e),r=[s[3],s[0],s[1],s[2]].find(a=>Math.abs(a)>1e-12)??1;return{translationMm:t.translationMm.map(ad),rotation:s.map(a=>ad(r<0?-a:a))}}function Q0(t){let[e,s,r,a]=t.rotation,[n,i,o]=t.translationMm;return[1-2*(s*s+r*r),2*(e*s+r*a),2*(e*r-s*a),0,2*(e*s-r*a),1-2*(e*e+r*r),2*(s*r+e*a),0,2*(e*r+s*a),2*(s*r-e*a),1-2*(e*e+s*s),0,n,i,o,1]}function nd(t,e){let s=new Array(16);for(let r=0;r<4;r+=1)for(let a=0;a<4;a+=1)s[r*4+a]=t[a]*e[r*4]+t[4+a]*e[r*4+1]+t[8+a]*e[r*4+2]+t[12+a]*e[r*4+3];return s}function Z0(t){let e=[t[0],t[4],t[8],0,t[1],t[5],t[9],0,t[2],t[6],t[10],0,0,0,0,1];for(let s=0;s<3;s+=1)e[12+s]=-(e[s]*t[12]+e[4+s]*t[13]+e[8+s]*t[14]);return e}function ki(t,e){return e>0?Math.round(t/e)*e:t}function id(t,e){let s=e[0]**2+e[1]**2;return s<1e-9?0:(t[0]*e[0]+t[1]*e[1])/s}function od(t,e,s){let r=Math.atan2(e[1]-t[1],e[0]-t[0]),n=Math.atan2(s[1]-t[1],s[0]-t[0])-r;for(;n>Math.PI;)n-=2*Math.PI;for(;n<-Math.PI;)n+=2*Math.PI;return n}function cd(t,e,s){return st(t,e)>=0?-s:s}function ld(t){return vi.map(e=>Zn(t.rotation,e))}function dd(t,e,s){return{translationMm:t.translationMm.map((r,a)=>r+e[a]*s),rotation:[...t.rotation]}}function ud(t,e,s,r){let a=Bc(e,s),n=t.translationMm.map((o,c)=>o-r[c]);return{translationMm:Zn(a,n).map((o,c)=>o+r[c]),rotation:$r(a,t.rotation)}}function fd(t,e){if(e==null)return null;let s=t?.occurrences||[];if(!s.some(a=>a.depth!=null))return s.find(a=>a.path===String(e))??null;let r=`/${String(e).split("/")[1]||""}`;return s.find(a=>a.path===r&&a.depth===1)??null}function hd(t,e,s){let r=t.occurrences.find(o=>o.path===e);if(!r||r.depth!=null&&r.depth!==1)return t;let a=Q0(s),n=nd(a,Z0(r.worldMatrix)),i=`${e}/`;return{...t,occurrences:t.occurrences.map(o=>o.path===e?{...o,pose:{...$t(s),source:"manual"},worldMatrix:a}:o.path.startsWith(i)?{...o,worldMatrix:nd(n,o.worldMatrix)}:o)}}function pd(t){let e=Math.abs(t[0])<.9?[1,0,0]:[0,1,0];return $e(Ye(t,e))}var ew=Object.freeze([0,1,1,0]),ar=`
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
`,Xe=Object.freeze([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function tw(t){let e=t?.matrix??t;if(!e||typeof e.length!="number"||e.length!==16)throw new TypeError("An occurrence matrix must have 16 numbers (column-major)");let s=Array.from(e,Number);if(!s.every(Number.isFinite))throw new TypeError("An occurrence matrix must be finite");if(s[3]!==0||s[7]!==0||s[11]!==0||s[15]!==1)throw new TypeError("An occurrence matrix must be affine (last row 0 0 0 1)");return s}function sw(t){let[e,s,r,,a,n,i,,o,c,l]=t,u=n*l-c*i,f=c*r-s*l,b=s*i-n*r,g=o*i-a*l,p=e*l-o*r,d=a*r-e*i,m=a*c-o*n,h=o*s-e*c,y=e*n-a*s,w=e*u+a*f+o*b;if(w===0)throw new TypeError("An occurrence matrix must be invertible");let v=w<0?-1:1;return[v*u,v*g,v*m,0,v*f,v*p,v*h,0,v*b,v*d,v*y,0,0,0,0,1]}function rw(t){let e=new Uint32Array(4);for(let s of t||[]){let r=Number(s);!Number.isInteger(r)||r<0||r>=128||(e[r>>>5]|=1<<(r&31)>>>0)}return e}function va(t,e=[],s=[]){let r=new Float32Array(Math.max(1,t.length)*40),a=new Uint32Array(r.buffer);return t.forEach((n,i)=>{let o=i*40;r.set(n,o),r.set(sw(n),o+16),e[i]&&a.set(rw(e[i]),o+32),r.set(s[i]||ew,o+36)}),r}function Ei(t,e){let[s,r,a]=e;return[t[0]*s+t[4]*r+t[8]*a+t[12],t[1]*s+t[5]*r+t[9]*a+t[13],t[2]*s+t[6]*r+t[10]*a+t[14]]}function vt(t,e){if(!e)return null;let s=[1/0,1/0,1/0,-1/0,-1/0,-1/0];for(let r=0;r<8;r+=1){let a=Ei(t,[e[r&1?3:0],e[r&2?4:1],e[r&4?5:2]]);for(let n=0;n<3;n+=1)s[n]=Math.min(s[n],a[n]),s[n+3]=Math.max(s[n+3],a[n])}return s}function Mi(t){return t.every((e,s)=>e===Xe[s])}var aw=0,nw=4294901759;function bd(t,e){let s=t>>>0,r=e>>>0;return s===aw?{kind:"none",occurrenceIndex:-1,featureId:0}:{kind:r?"feature":"board",occurrenceIndex:s-1,featureId:r}}function gd(t){let e=Array.from(t);if(e.length>nw)throw new RangeError("Too many occurrences for the pick target");let s=e.map(tw),r=o=>o&&!Array.isArray(o)&&!ArrayBuffer.isView(o),a=e.map((o,c)=>r(o)&&o.key!=null?String(o.key):String(c));if(new Set(a).size!==a.length)throw new TypeError("Occurrence keys must be unique");let n=e.map(o=>r(o)&&o.hiddenLayers?[...o.hiddenLayers].map(Number):[]),i=e.map(o=>r(o)&&o.explode?[...o.explode].map(Number):null);return{matrices:s,keys:a,hiddenLayers:n,explode:i}}function xa(t,e,s){let[r,a,n]=e,i=t[0]*r+t[4]*a+t[8]*n+t[12],o=t[1]*r+t[5]*a+t[9]*n+t[13],c=t[2]*r+t[6]*a+t[10]*n+t[14],l=t[3]*r+t[7]*a+t[11]*n+t[15];return!(l>0)||c<0||c>l?null:{x:s.x+(i/l*.5+.5)*s.width,y:s.y+(.5-o/l*.5)*s.height}}var ka=0;var md=3,Si=4,TT=Object.freeze(["full","board","body","box"]),Yt=Object.freeze({fullPx:140,boardPx:70,boxPx:18,keep:.8});function Ea(t={}){let e=(i,o)=>Number.isFinite(Number(t[i]))?Math.max(0,Number(t[i])):o,s=e("boxPx",Yt.boxPx),r=Math.max(s,e("boardPx",Yt.boardPx)),a=Math.max(r,e("fullPx",Yt.fullPx)),n=Math.min(1,Math.max(.05,e("keep",Yt.keep)));return{fullPx:a,boardPx:r,boxPx:s,keep:n}}function yd(t){let e=c=>[t[c],t[4+c],t[8+c],t[12+c]],[s,r,a,n]=[e(0),e(1),e(2),e(3)],i=(c,l)=>c.map((u,f)=>u+l[f]),o=(c,l)=>c.map((u,f)=>u-l[f]);return[i(n,s),o(n,s),i(n,r),o(n,r),a,o(n,a)]}var nr=class{constructor(e,s,r,a=16777216){this.device=e,this.usage=s|wd.COPY_SRC|wd.COPY_DST,this.label=r,this.chunkBytes=a,this.chunks=[],this.usedBytes=0,this.generation=0,this.repacks=0}alloc(e){let r={buffer:null,offset:0,size:Math.max(4,Math.ceil(e/4)*4),chunk:null};return this.place(r,null),r}place(e,s){let{size:r}=e,a=null;if(r<=this.chunkBytes/2)for(let o of this.chunks)o===s||o.dedicated||o.free.forEach((c,l)=>{c.size>=r&&(!a||c.size<a.range.size)&&(a={chunk:o,index:l,range:c})});let n,i;if(a)({chunk:n}=a),i=a.range.offset,a.range.size===r?n.free.splice(a.index,1):n.free[a.index]={offset:i+r,size:a.range.size-r};else{let o=r>this.chunkBytes/2,c=o?r:this.chunkBytes;n={buffer:this.device.createBuffer({label:`${this.label}-${this.chunks.length}`,size:c,usage:this.usage}),size:c,free:c>r?[{offset:r,size:c-r}]:[],used:0,live:new Set,dedicated:o},this.chunks.push(n),i=0}n.used+=r,n.live.add(e),this.usedBytes+=r,Object.assign(e,{buffer:n.buffer,offset:i,chunk:n})}write(e,s){this.device.queue.writeBuffer(e.buffer,e.offset,s)}free(e){let{chunk:s}=e;if(!(!s||!s.live.has(e))){if(this.release(s,e),e.chunk=null,!s.live.size){this.drop(s);return}!s.dedicated&&s.used<s.size*.5&&this.chunks.length>1&&this.repack(s)}}release(e,s){e.used-=s.size,e.live.delete(s),this.usedBytes-=s.size;let r=e.free,a=r.findIndex(n=>n.offset>s.offset);a<0&&(a=r.length),r.splice(a,0,{offset:s.offset,size:s.size}),a+1<r.length&&r[a].offset+r[a].size===r[a+1].offset&&(r[a].size+=r[a+1].size,r.splice(a+1,1)),a>0&&r[a-1].offset+r[a-1].size===r[a].offset&&(r[a-1].size+=r[a].size,r.splice(a,1))}drop(e){e.buffer.destroy?.(),this.chunks.splice(this.chunks.indexOf(e),1)}repack(e){let s=this.device.createCommandEncoder({label:`${this.label}-repack`});for(let r of[...e.live]){let a={buffer:r.buffer,offset:r.offset};this.release(e,r),this.place(r,e),s.copyBufferToBuffer(a.buffer,a.offset,r.buffer,r.offset,r.size)}this.device.queue.submit([s.finish()]),this.drop(e),this.generation+=1,this.repacks+=1}reservedBytes(){return this.chunks.reduce((e,s)=>e+s.size,0)}destroy(){for(let e of this.chunks)e.buffer.destroy?.();this.chunks=[],this.usedBytes=0}},wd=globalThis.GPUBufferUsage||{COPY_SRC:4,COPY_DST:8};var Ti=Object.freeze(["decl","vs-out","vs-end","fs-begin","fs-return"]),iw={decl:"decl","vs-out":"vsOut","vs-end":"vsEnd","fs-begin":"fsBegin"},ow=/^[ \t]*\/\/ @feature:[a-z-]+\n/gm;function le(t){if(!Ti.includes(t))throw new Error(`Unknown shader hook ${t}`);return`// @feature:${t}
`}function Ne(t){return t.replace(ow,"")}function Ai(t){return ir(t).map(e=>e.name).join("+")}function ir(t=[]){let e=new Set;for(let s of t){if(!s?.name||!/^[a-z][a-z0-9-]*$/.test(s.name))throw new Error(`Bad shader feature name ${s?.name}`);if(e.has(s.name))throw new Error(`Shader feature ${s.name} given twice`);e.add(s.name)}return[...t].sort((s,r)=>s.name<r.name?-1:s.name>r.name?1:0)}function cw(t,e="shader"){for(let s of Ti){let r=_i(t,s).length;if(r!==1)throw new Error(`${e}: hook ${s} appears ${r} times, expected once`)}xd(t,e)}function vd(t,e=[],s={}){let r=ir(e);if(!r.length)return Ne(t);let a=`${s.family||"shader"}${s.instanced?" (instanced)":""}`;cw(t,a);let n=t;for(let i of Ti){if(i==="fs-return"){let{start:f,end:b,indent:g,expression:p}=xd(n,a),d=r.reduce((m,h)=>h.fsReturn?h.fsReturn(m,s):m,p);n=`${n.slice(0,f)}${g}return ${d};
${n.slice(b)}`;continue}let o=iw[i],c=r.map(f=>f[o]?.(s)).filter(Boolean),[l]=_i(n,i),u=c.map(f=>f.endsWith(`
`)?f:`${f}
`).join("");n=`${n.slice(0,l.index)}${u}${n.slice(l.index+l[0].length)}`}return Ne(n)}function _i(t,e){return[...t.matchAll(new RegExp(`^[ \\t]*// @feature:${e}\\n`,"gm"))]}function xd(t,e){let[s]=_i(t,"fs-return"),r=s.index+s[0].length,a=t.slice(r).match(/^([ \t]*)return (.+);\n/);if(!a)throw new Error(`${e}: hook fs-return is not followed by a return line`);return{start:s.index,end:r+a[0].length,indent:a[1],expression:a[2]}}var Ma=64,lw=1,dw=0,Ii=`
fn featureHidden(id: u32) -> bool {
  return id < arrayLength(&hiddenMask) && hiddenMask[id] == 0u;
}
`,Sa=ta;function kd(t,e=0){let s=0;for(let n of Sa(t))s=Math.max(s,n);let r=Ma,a=s+1;for(;r<a;)r*=2;return Math.max(r,Math.floor(e)||0)}function Ed(t,e){let s=Math.max(Ma,Math.floor(e)||0),r=new Uint32Array(s);r.fill(lw);for(let a of Sa(t))a<s&&(r[a]=dw);return r}function uw(t){let e=Number(t.drillWidthMm)||0,s=Number(t.drillHeightMm)||e,r=Math.min(e,s),a=Math.min(Number(t.outerWidthMm)||0,Number(t.outerHeightMm)||0),n=Number.isFinite(t.platingThicknessMm)?t.platingThicknessMm:Math.max(0,(a-r)/2),i=(Number(t.rotationDeg)||0)*Math.PI/180+(s>e?Math.PI/2:0);return{x:t.centerMm[0]/1e3,y:-t.centerMm[1]/1e3,drillRadius:r/2e3,outerRadius:(r/2+n)/1e3,halfLength:Math.abs(e-s)/2e3,angle:Math.abs(e-s)>0?-i:0,startZ:t.startZMm/1e3,endZ:t.endZMm/1e3,netId:t.netId||0,objectId:t.objectFeatureId||0,startLayerId:t.startLayerId||0,endLayerId:t.endLayerId||0}}function Bi(t,e){let s=new Map((e||[]).map(r=>[Number(r.id),Number(r.thickness_mm)||0]));return(t||[]).map(r=>{let a=i=>Math.max(0,(s.get(Number(i))||0)/2-.001),n=r.startZMm>=r.endZMm?1:-1;return{...r,startZMm:r.startZMm+n*a(r.startLayerId),endZMm:r.endZMm-n*a(r.endLayerId)}})}var or=0,Ri=16,Ni=24,cr=32,Md=48,Sd=Object.freeze({arrayStride:Md,stepMode:"instance",attributes:Object.freeze([Object.freeze({shaderLocation:3,offset:or,format:"float32x4"}),Object.freeze({shaderLocation:4,offset:Ri,format:"float32x2"}),Object.freeze({shaderLocation:6,offset:Ni,format:"float32x2"}),Object.freeze({shaderLocation:5,offset:cr,format:"uint32x4"})])}),Ci=48,Ta=`struct Input {
  @location(0) unit: vec3f,
  @location(1) normal: vec3f,
  @location(2) radiusMix: f32,
  @location(3) dimensions: vec4f,
  @location(4) span: vec2f,
  @location(5) ids: vec4u,
  @location(6) shape: vec2f,
};`,Td=`struct Barrel {
  dimensions: vec4f,
  span: vec2f,
  shape: vec2f,
  ids: vec4u,
};
@group(0) @binding(6) var<storage, read> barrels: array<Barrel>;`;function Ad(t,e,s){let r=new ArrayBuffer(Math.max(s,t.length)*e),a=new DataView(r);return t.forEach((n,i)=>{let o=i*e,c=uw(n);a.setFloat32(o+or,c.x,!0),a.setFloat32(o+or+4,c.y,!0),a.setFloat32(o+or+8,c.drillRadius,!0),a.setFloat32(o+or+12,c.outerRadius,!0),a.setFloat32(o+Ri,c.startZ,!0),a.setFloat32(o+Ri+4,c.endZ,!0),a.setFloat32(o+Ni,c.halfLength,!0),a.setFloat32(o+Ni+4,c.angle,!0),a.setUint32(o+cr,c.netId,!0),a.setUint32(o+cr+4,c.objectId,!0),a.setUint32(o+cr+8,c.startLayerId,!0),a.setUint32(o+cr+12,c.endLayerId,!0)}),r}function _d(t){return Ad(t,Md,0)}function Id(t){return Ad(t,Ci,1)}var Oi=t=>`
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
`,Rd=`
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
  // The board clip (V2a): the board body's top face, top-down, in board
  // millimetres. clipOn is 0 for the board body itself and when there is none.
  clipOrigin: vec2f,
  clipPitch: vec2f,
  clipSize: vec2u,
  clipOn: u32,
  clipPad: u32,
  // The 2D view: where the slice's layer lies in the layer grid (world
  // metres, added to x and y); zero in 3D.
  flatShift: vec2f,
  flatPad: vec2f,
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
@group(0) @binding(11) var boardClip: texture_2d<u32>;

// KiCad's 3D view draws nothing beyond the board's outline: copper, mask,
// paste or silkscreen there (text off the edge, a fab table) is discarded. A
// texel next to the board counts as board, so edge and drill features stay.
fn outsideBoard(board: vec2f) -> bool {
  if (slice.clipOn == 0u) { return false; }
  let cell = vec2i(floor((board - slice.clipOrigin) / slice.clipPitch));
  let size = vec2i(slice.clipSize);
  // The mask comes dilated by that texel (dilateClip): one lookup.
  return !(all(cell >= vec2i(0)) && all(cell < size) && textureLoad(boardClip, cell, 0).x != 0u);
}
fn worldOutsideBoard(world: vec3f) -> bool { return outsideBoard(vec2f(world.x * 1000.0, -world.y * 1000.0)); }

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
  return globals.viewProjection * vec4f(board.x * 0.001 + slice.flatShift.x, -board.y * 0.001 + slice.flatShift.y, slice.z, 1.0);
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

${Oi(10)}
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
  if (mask == 0u || netHidden(word(input.record, 1u)) || outsideBoard(input.board)) { discard; }
  return Covered(shade(word(input.record, 1u), input.board), mask);
}

@fragment fn fs_shape_pick(input: ShapeOut) -> @location(0) vec4u {
  if (shapeDistance(input.record, input.local) > 0.0 || netHidden(word(input.record, 1u)) || outsideBoard(input.board)) { discard; }
  return vec4u(PICK_TAG, word(input.record, 1u) + 1u, 0u, 0u);
}

@fragment fn fs_shape_mask(input: ShapeOut) -> Covered {
  let mask = coverage(input.record, input.local);
  if (mask == 0u || outsideBoard(input.board)) { discard; }
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
  if (netHidden(input.operation) || outsideBoard(input.board)) { discard; }
  return shade(input.operation, input.board);
}

// A cover's stencil-only pass for the board layers (mask, paste, silkscreen),
// clipped to the board as their colour passes are; the stencil clears use fs_plain_mask.
@fragment fn fs_cover_mask(input: CoverOut) -> @location(0) vec4f {
  if (outsideBoard(input.board)) { discard; }
  return vec4f(0.0);
}

@fragment fn fs_cover_pick(input: CoverOut) -> @location(0) vec4u {
  if (netHidden(input.operation) || outsideBoard(input.board)) { discard; }
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
  if (netHidden(operation) || edgeCut(input.edge, input.world) || worldOutsideBoard(input.world)) { discard; }
  let board = vec2f(input.world.x * 1000.0, -input.world.y * 1000.0);
  return shadeNormal(operation, board, edgeOutward(input.edge));
}

@fragment fn fs_region_wall_pick(input: EdgeOut) -> @location(0) vec4u {
  let operation = edges[input.edge * EDGE_WORDS + 4u];
  if (netHidden(operation) || edgeCut(input.edge, input.world) || worldOutsideBoard(input.world)) { discard; }
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
  if (netHidden(operation) || worldOutsideBoard(input.world)) { discard; }
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
  if (worldOutsideBoard(input.world)) { discard; }
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
  if (edgeCut(input.edge, input.world) || worldOutsideBoard(input.world)) { discard; }
  return coatColor(edgeOutward(input.edge));
}

@fragment fn fs_skirt_pick(input: SkirtOut) -> WallPick {
  let operation = word(input.record, 1u);
  if (netHidden(operation) || worldOutsideBoard(input.world)) { discard; }
  let hit = marchWall(input.record, wallRay(input.record, input.world));
  if (!hit.hit) { discard; }
  var out: WallPick;
  out.pick = vec4u(PICK_TAG, operation + 1u, 0u, 0u);
  out.depth = worldDepth(boardToWorld(hit.board, hit.z));
  return out;
}
`,fw={compare:"always",passOp:"keep"},Aa=Object.freeze({shapeMask:{face:{compare:"always",passOp:"replace"},read:255,write:128,reference:128,color:!1,depth:!1},fan:{face:{compare:"always",passOp:"invert"},read:255,write:64,reference:0,color:!1,depth:!1},coverSubtract:{face:{compare:"not-equal",passOp:"replace",failOp:"keep"},read:64,write:192,reference:128,color:!1,depth:!1},shapeAdd:{face:{compare:"greater",passOp:"replace"},read:160,write:33,reference:32,color:!0,depth:!0},coverMark:{face:{compare:"equal",passOp:"replace",failOp:"keep"},read:192,write:1,reference:65,color:!1,depth:!1,depthTest:!0},coverAdd:{face:{compare:"equal",passOp:"invert",failOp:"keep",depthFailOp:"keep"},read:224,write:96,reference:64,color:!0,depth:!0},coverClear:{face:{compare:"always",passOp:"zero"},read:255,write:64,reference:0,color:!1,depth:!1},shapeLay:{face:{compare:"greater",passOp:"replace"},read:160,write:32,reference:32,color:!1,depth:!1,depthTest:!0},coverLay:{face:{compare:"equal",passOp:"invert",failOp:"keep",depthFailOp:"keep"},read:224,write:96,reference:64,color:!1,depth:!1,depthTest:!0},shapeBlend:{face:{compare:"greater",passOp:"replace"},read:160,write:32,reference:32,color:!0,depth:!0},coverBlend:{face:{compare:"equal",passOp:"invert",failOp:"keep",depthFailOp:"keep"},read:224,write:96,reference:64,color:!0,depth:!0},tintCovered:{face:{compare:"equal",passOp:"keep"},read:33,write:0,reference:33,color:!0,depth:!0},tintPlain:{face:{compare:"equal",passOp:"keep"},read:33,write:0,reference:32,color:!0,depth:!0},footShape:{face:{compare:"always",passOp:"replace"},read:0,write:2,reference:2,color:!1,depth:!1},footCover:{face:{compare:"equal",passOp:"replace",failOp:"keep"},read:64,write:2,reference:66,color:!1,depth:!1},tintHigh:{face:{compare:"equal",passOp:"replace"},read:34,write:4,reference:38,color:!0,depth:!0},tintLow:{face:{compare:"equal",passOp:"replace"},read:34,write:4,reference:36,color:!0,depth:!0},clearLay:{face:{compare:"always",passOp:"zero"},read:0,write:224,reference:0,color:!1,depth:!1},shapeOnFoot:{face:{compare:"equal",passOp:"invert"},read:166,write:32,reference:6,color:!0,depth:!0},shapeOffFoot:{face:{compare:"equal",passOp:"invert"},read:166,write:32,reference:4,color:!0,depth:!0},coverOnFoot:{face:{compare:"equal",passOp:"invert",failOp:"keep",depthFailOp:"keep"},read:230,write:96,reference:70,color:!0,depth:!0},coverOffFoot:{face:{compare:"equal",passOp:"invert",failOp:"keep",depthFailOp:"keep"},read:230,write:96,reference:68,color:!0,depth:!0},clearFoot:{face:{compare:"always",passOp:"zero"},read:0,write:6,reference:0,color:!1,depth:!1},coat:{face:{compare:"equal",passOp:"keep",failOp:"keep",depthFailOp:"keep"},read:2,write:0,reference:0,color:!0,depth:!0},solid:{face:fw,read:0,write:0,reference:0,color:!0,depth:!0},clear:{face:{compare:"always",passOp:"zero"},read:255,write:224,reference:0,color:!1,depth:!1}});var Nd=64,Fi=112,Bd=48,hw=.51,Cd=6,Od=`
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
  // 1 while any layer is lifted off its place (the stack separated): only the
  // lit nets' barrels draw exact; the rest are ghosts (vs_ghost).
  separated: u32,
  padding3: u32,
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
// 1 in the pick pipeline: every barrel stays pickable, ghost or not.
override PICK_PASS: u32 = 0u;
const FAR = 1e30;
fn netLit(operation: u32) -> bool {
  let net = select(0u, nets[operation], operation < arrayLength(&nets));
  let emphasised = net != 0u && net < arrayLength(&netMask) && netMask[net] != 0u;
  return emphasised || (globals.activeNet != 0u && net == globals.activeNet);
}
fn present(value: f32) -> bool { return value < 1e38; }
${Oi(7)}
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
  // A separated stack draws only the lit nets' barrels exact: the rest are
  // ghosts (vs_ghost), and their boxes collapse here, before any fragment.
  // Net isolation hides the unlit ones in every pass.
  let unlit = !netLit(b.ids.x);
  if ((PICK_PASS == 0u && ghosted(b)) || (view.isolate == 1u && unlit)) { out.position = vec4f(0.0); }
  return out;
}

fn ghosted(b: Barrel) -> bool {
  return view.separated == 1u && !netLit(b.ids.x);
}

struct GhostOut {
  @builtin(position) position: vec4f,
  // Across the strip, -1 to 1, and the strip's side and toward-eye directions.
  @location(0) across: f32,
  @location(1) side: vec3f,
  @location(2) facing: vec3f,
};

// A barrel off the lit nets in a separated stack: a strip facing the eye,
// as wide as the hole, between its layers' lifted faces, shaded across its
// width as the tube it stands for. Barrels drawn exact collapse here instead.
@vertex fn vs_ghost(@builtin(vertex_index) vertex: u32, @builtin(instance_index) index: u32) -> GhostOut {
  let b = barrels[index];
  var out: GhostOut;
  if (!ghosted(b) || ((b.ids.w & UNPLATED) != 0u && view.board == 0u)) {
    out.position = vec4f(0.0);
    return out;
  }
  let z = span(b);
  let centre = vec3f(b.shape.xy, 0.5 * (z.x + z.y));
  // Toward the eye, in the board's plane (the strip stands upright).
  var toward = select(-view.eye.xyz, view.eye.xyz / view.eye.w - centre, abs(view.eye.w) > 1e-12);
  toward = vec3f(toward.xy, 0.0);
  let flat = length(toward) < 1e-12;
  let facing = select(normalize(toward), vec3f(0.0, -1.0, 0.0), flat);
  let side = vec3f(-facing.y, facing.x, 0.0);
  // A slot's long half (shape.z) along its angle, seen across: its widest extent.
  let reach = b.size.x + b.shape.z * abs(dot(vec2f(cos(b.shape.w), sin(b.shape.w)), side.xy));
  var corners = array<vec2f, 6>(vec2f(-1.0, 0.0), vec2f(1.0, 0.0), vec2f(-1.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let corner = corners[vertex];
  let world = vec3f(centre.xy + side.xy * corner.x * reach, select(z.y, z.x, corner.y > 0.5));
  out.position = globals.viewProjection * vec4f(world, 1.0);
  out.across = corner.x;
  out.side = side;
  out.facing = facing;
  return out;
}

@fragment fn fs_ghost(input: GhostOut) -> @location(0) vec4f {
  // The tube's normal under this point of the strip.
  let u = clamp(input.across, -1.0, 1.0);
  let normal = normalize(input.side * u + input.facing * sqrt(1.0 - u * u));
  let light = normalize(globals.lightDirection.xyz);
  let shade = 0.55 + 0.45 * abs(dot(normal, light));
  return vec4f(view.color.rgb * shade, ${hw});
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
`,Fd=`
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
`;var Pd=`
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
${Oi(3)}

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
`;var Ui=Object.freeze([.35,-.5,.8,0]);function bw(t){let[e,s,r]=Ui,a=[0,1,2].map(i=>t[i*4]*e+t[i*4+1]*s+t[i*4+2]*r),n=Math.hypot(...a)||1;return[...a.map(i=>i/n),0]}var zi=20,ut=256,Pi=112,Jt="rg32uint",Ms=ut/4,gw=256,jd={compare:"always",passOp:"zero"},mw={compare:"always",passOp:"replace"},yw={compare:"not-equal",passOp:"keep"},ww={compare:"equal",passOp:"keep"},zd="fn dequant(p: vec3f) -> vec3f { return draw.quantMin.xyz + p * draw.quantSize.xyz; }",Gd=32,Kd=`  let plating = input.dimensions.w - input.dimensions.z;
  let rim = select(1.0, ${(1/Math.cos(Math.PI/Gd)).toFixed(6)}, input.radiusMix > 1.5);
  let radius = mix(max(input.dimensions.z - plating, input.dimensions.z * 0.5), input.dimensions.z, min(input.radiusMix, 1.0)) * rim;
  let turn = vec2f(cos(input.shape.y), sin(input.shape.y));
  let local = vec2f(input.unit.x * radius + select(-input.shape.x, input.shape.x, input.unit.x >= 0.0), input.unit.y * radius);
  let planar = vec2f(local.x * turn.x - local.y * turn.y, local.x * turn.y + local.y * turn.x);
  let turnedNormal = vec3f(input.normal.x * turn.x - input.normal.y * turn.y, input.normal.x * turn.y + input.normal.y * turn.x, input.normal.z);
`,Ia=`
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
${zd}
@group(0) @binding(3) var<storage, read> hiddenMask: array<u32>;
@group(0) @binding(4) var<storage, read> netMask: array<u32>;
${Ii}
${Zs}
// Set on the pipeline that draws the solder mask over copper.
override COVERED: bool = false;

${le("decl")}struct VertexInput {
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
${le("vs-out")}  @location(3) world: vec3f,
};
@vertex fn vs(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.world = dequant(input.position) + draw.offset.xyz;
  output.position = globals.viewProjection * vec4f(output.world, 1.0);
  output.normal = normalize(input.normal);
  output.netId = input.netId;
  output.objectId = input.objectId;
${le("vs-end")}  return output;
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
${le("fs-begin")}  let kind = u32(draw.flags.x);
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
${le("fs-return")}  return vec4f(aces(lit), alpha);
}
`,vw=Ne(Ia),Ra=`
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
${zd}
@group(0) @binding(3) var<storage, read> hiddenMask: array<u32>;
@group(0) @binding(4) var<storage, read> netMask: array<u32>;
${Ii}
${Zs}
${le("decl")}struct Input {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) netId: u32,
  @location(3) objectId: u32,
};
struct Output {
  @builtin(position) position: vec4f,
  @location(2) @interpolate(flat) netId: u32,
${le("vs-out")}  @location(0) @interpolate(flat) objectId: u32,
};
@vertex fn vs(input: Input) -> Output {
  var output: Output;
  output.position = globals.viewProjection * vec4f(dequant(input.position) + draw.offset.xyz, 1.0);
  output.objectId = input.objectId;
  output.netId = input.netId;
${le("vs-end")}  return output;
}
@fragment fn fs(input: Output) -> @location(0) vec2u {
${le("fs-begin")}  if (u32(draw.flags.x) == 2u && featureHidden(input.objectId)) { discard; }
  // Isolated (flags.z), unlit copper is not drawn, so it is not there to pick (SB2-31e).
  let lit = netEmphasized(input.netId) || (globals.activeNet != 0u && input.netId == globals.activeNet);
  if (u32(draw.flags.x) == 1u && draw.flags.z > 0.5 && !lit) { discard; }
${le("fs-return")}  return vec2u(1u, input.objectId);
}
`,xw=Ne(Ra),Ki=`
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
${Zs}
${le("decl")}${Ta}
struct Output {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) @interpolate(flat) netId: u32,
  @location(2) @interpolate(flat) objectId: u32,
${le("vs-out")}  @location(3) @interpolate(flat) visible: u32,
};
@vertex fn vs(input: Input) -> Output {
${Kd}  let z0 = input.span.x + layerOffsets[input.ids.z];
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
${le("vs-end")}  return output;
}
@fragment fn fs(input: Output) -> @location(0) vec4f {
${le("fs-begin")}  if (input.visible == 0u) { discard; }
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
${le("fs-return")}  return vec4f(lit, 1.0);
}
`,kw=Ne(Ki),Vi=`
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
${Zs}
${le("decl")}${Ta}
struct Output {
  @builtin(position) position: vec4f,
  @location(3) @interpolate(flat) netId: u32,
  @location(0) @interpolate(flat) objectId: u32,
${le("vs-out")}  @location(1) @interpolate(flat) visible: u32,
};
@vertex fn vs(input: Input) -> Output {
${Kd}  let world = vec3f(
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
${le("vs-end")}  return output;
}
@fragment fn fs(input: Output) -> @location(0) vec2u {
${le("fs-begin")}  if (input.visible == 0u) { discard; }
  let lit = netEmphasized(input.netId) || (globals.activeNet != 0u && input.netId == globals.activeNet);
  if (draw.flags.z > 0.5 && !lit) { discard; }
${le("fs-return")}  return vec2u(1u, input.objectId);
}
`,Ew=Ne(Vi);function cs(t,e){return e.reduce((s,[r,a])=>{if(s.split(r).length!==2)throw new Error(`Shader variant anchor not found once: ${r.slice(0,60)}`);return s.replace(r,()=>a)},t)}var Hi=[`  padding0: u32,
  padding1: u32,`,`  selectedOccurrence: u32,
  occurrenceBase: u32,`],Na=[["  padding2: u32,","  emphasisStride: u32,"],["fn netEmphasized(id: u32) -> bool {",`${Xc}fn netEmphasized(id: u32) -> bool {`]],Vd="  let lit = netEmphasized(input.netId) || (globals.activeNet != 0u && input.netId == globals.activeNet);",Hd=`  let lit = emphasisOf(input.occurrence, input.netId) != 0u
    || (input.occurrence == globals.selectedOccurrence && globals.activeNet != 0u && input.netId == globals.activeNet);`,qi=cs(Ia,[Hi,[`  @location(3) world: vec3f,
};`,`  @location(3) world: vec3f,
  @location(4) @interpolate(flat) occurrence: u32,
  // Mask and silkscreen opacity of this occurrence's own stackup separation (SB2-31f).
  @location(5) @interpolate(flat) fade: f32,
};`],[`@vertex fn vs(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.world = dequant(input.position) + draw.offset.xyz;
  output.position = globals.viewProjection * vec4f(output.world, 1.0);
  output.normal = normalize(input.normal);`,`${ar}
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
  let selectedComponent = here && component && globals.selectedFeature != 0u && input.objectId == globals.selectedFeature;`],...Na,["      base = vec3f(0.08, 1.0, 0.2) * pulse;","      base = emphasisColor(mark, vec3f(0.08, 1.0, 0.2)) * pulse;"],["  var alpha = draw.flags.y;","  var alpha = draw.flags.y * input.fade;"]]),qd=Ne(qi),Wi=cs(Ra,[Hi,[`  @location(0) @interpolate(flat) objectId: u32,
};`,`  @location(0) @interpolate(flat) objectId: u32,
  @location(1) @interpolate(flat) occurrence: u32,
};`],[`@vertex fn vs(input: Input) -> Output {
  var output: Output;
  output.position = globals.viewProjection * vec4f(dequant(input.position) + draw.offset.xyz, 1.0);`,`${ar}
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
  }`],[`${le("fs-return")}  return vec2u(1u, input.objectId);`,`  let kind = u32(draw.flags.x);
${le("fs-return")}  return vec2u(input.occurrence, select(input.objectId, 0u, kind == 0u));`],...Na,[Vd,Hd]]),Wd=Ne(Wi),Mw=`struct Placement { r0: vec4f, r1: vec4f, r2: vec4f, ids: vec4u };
@group(0) @binding(8) var<storage, read> placements: array<Placement>;
fn place(p: Placement, v: vec3f) -> vec3f {
  return vec3f(dot(p.r0.xyz, v) + p.r0.w, dot(p.r1.xyz, v) + p.r1.w, dot(p.r2.xyz, v) + p.r2.w);
}
fn turn(p: Placement, n: vec3f) -> vec3f {
  return vec3f(dot(p.r0.xyz, n), dot(p.r1.xyz, n), dot(p.r2.xyz, n));
}`,Ld="@group(0) @binding(1) var<uniform> draw: Draw;",Ba=[Ld,`${Ld}
${Mw}`],Ca=["  output.objectId = input.objectId;","  output.objectId = select(placement.ids.x, input.objectId, input.objectId != 0u);"],Xd=["  let index = listedOccurrence(u32(draw.material.w + 0.5), instance);",`  let placement = placements[draw.placement.x + instance % draw.placement.y];
  let index = listedOccurrence(u32(draw.material.w + 0.5), instance / draw.placement.y);`],$d=cs(Ia,[Ba,[`@vertex fn vs(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.world = dequant(input.position) + draw.offset.xyz;`,`@vertex fn vs(input: VertexInput, @builtin(instance_index) instance: u32) -> VertexOutput {
  let placement = placements[draw.placement.x + instance];
  var output: VertexOutput;
  output.world = place(placement, dequant(input.position)) + draw.offset.xyz;`],["  output.normal = normalize(input.normal);","  output.normal = normalize(turn(placement, input.normal));"],Ca]),Yd=cs(qi,[Ba,Xd,["occurrence.model * vec4f(dequant(input.position) + draw.offset.xyz + lift, 1.0)","occurrence.model * vec4f(place(placement, dequant(input.position)) + draw.offset.xyz + lift, 1.0)"],["(occurrence.normal * vec4f(input.normal, 0.0))","(occurrence.normal * vec4f(turn(placement, input.normal), 0.0))"],Ca]),Jd=cs(Ra,[Ba,[`@vertex fn vs(input: Input) -> Output {
  var output: Output;
  output.position = globals.viewProjection * vec4f(dequant(input.position) + draw.offset.xyz, 1.0);`,`@vertex fn vs(input: Input, @builtin(instance_index) instance: u32) -> Output {
  let placement = placements[draw.placement.x + instance];
  var output: Output;
  output.position = globals.viewProjection * vec4f(place(placement, dequant(input.position)) + draw.offset.xyz, 1.0);`],Ca]),Qd=cs(Wi,[Ba,Xd,["occurrence.model * vec4f(dequant(input.position) + draw.offset.xyz + lift, 1.0)","occurrence.model * vec4f(place(placement, dequant(input.position)) + draw.offset.xyz + lift, 1.0)"],Ca]),Zd=Ne($d),eu=Ne(Yd),tu=Ne(Jd),su=Ne(Qd),ji=64,Sw=6,Tw=`${Td}
${ar}
struct Input {
  @location(0) unit: vec3f,
  @location(1) normal: vec3f,
  @location(2) radiusMix: f32,
};`;function ru(t,e,s=[]){return cs(t,[Hi,[`@group(0) @binding(2) var<storage, read> layerOffsets: array<f32>;
`,""],[Ta,Tw],["@vertex fn vs(input: Input) -> Output {",`struct Record {
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
  output.occurrence = index + 1u + globals.occurrenceBase;`],...s])}var au=ru(Ki,`  output.position = globals.viewProjection * vec4f(world, 1.0);
  output.normal = turnedNormal;`,[[`  let z0 = input.span.x + layerOffsets[input.ids.z];
  let z1 = input.span.y + layerOffsets[input.ids.w];`,`  let z0 = input.span.x + layerOffsets[input.ids.z] * spread;
  let z1 = input.span.y + layerOffsets[input.ids.w] * spread;`],[`  output.normal = turnedNormal;
  output.netId`,`  output.normal = (occurrence.normal * vec4f(turnedNormal, 0.0)).xyz;
  output.netId`],[`  @location(3) @interpolate(flat) visible: u32,
};`,`  @location(3) @interpolate(flat) visible: u32,
  @location(4) @interpolate(flat) occurrence: u32,
};`],["  let selected = netEmphasized(input.netId) || (globals.activeNet != 0u && input.netId == globals.activeNet);",`  let mark = emphasisOf(input.occurrence, input.netId);
  let selected = mark != 0u
    || (input.occurrence == globals.selectedOccurrence && globals.activeNet != 0u && input.netId == globals.activeNet);`],...Na,["      base = vec3f(0.1, 1.0, 0.22) * (","      base = emphasisColor(mark, vec3f(0.1, 1.0, 0.22)) * ("]]),nu=ru(Vi,`  output.position = globals.viewProjection * vec4f(world, 1.0);
  output.objectId`,[["mix(input.span.x + layerOffsets[input.ids.z], input.span.y + layerOffsets[input.ids.w], input.unit.z)","mix(input.span.x + layerOffsets[input.ids.z] * spread, input.span.y + layerOffsets[input.ids.w] * spread, input.unit.z)"],[`  @location(1) @interpolate(flat) visible: u32,
};`,`  @location(1) @interpolate(flat) visible: u32,
  @location(2) @interpolate(flat) occurrence: u32,
};`],["  return vec2u(1u, input.objectId);","  return vec2u(input.occurrence, input.objectId);"],...Na,[Vd,Hd]]),iu=Ne(au),ou=Ne(nu),cu=`
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
${ar}
${le("decl")}struct Input {
  @location(0) corner: vec3f,
  @location(1) normal: vec3f,
};
struct Output {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
${le("vs-out")}  @location(1) @interpolate(flat) occurrence: u32,
};
@vertex fn vs(input: Input, @builtin(instance_index) instance: u32) -> Output {
  let index = listedOccurrence(LIST_BOX, instance);
  let occurrence = occurrences[index];
  let local = draw.offset.xyz + input.corner * draw.material.xyz;
  var output: Output;
  output.position = globals.viewProjection * vec4f((occurrence.model * vec4f(local, 1.0)).xyz, 1.0);
  output.normal = (occurrence.normal * vec4f(input.normal, 0.0)).xyz;
  output.occurrence = index + 1u + globals.occurrenceBase;
${le("vs-end")}  return output;
}
`,lu=`${cu}
@fragment fn fs(input: Output) -> @location(0) vec4f {
${le("fs-begin")}  let light = normalize(globals.lightDirection.xyz);
${le("fs-return")}  return vec4f(draw.color.rgb * (0.45 + max(dot(normalize(input.normal), light), 0.0) * 0.55), 1.0);
}
`,du=Ne(lu),uu=`${cu}
@fragment fn fs(input: Output) -> @location(0) vec2u {
${le("fs-begin")}${le("fs-return")}  return vec2u(input.occurrence, 0u);
}
`,fu=Ne(uu),Xi=`
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
`,Dd=[{arrayStride:24,attributes:[{shaderLocation:0,offset:0,format:"float32x3"},{shaderLocation:1,offset:12,format:"float32x3"}]}],GT=Object.freeze({main:qd,pick:Wd,barrel:iu,barrelPick:ou,box:du,boxPick:fu,cull:Xi,component:Zd,componentInstanced:eu,componentPick:tu,componentPickInstanced:su}),hu=Object.freeze({main:{output:"color",single:Ia,instanced:qi,world:["output.world","output.world"]},pick:{output:"pick",single:Ra,instanced:Wi,world:["(dequant(input.position) + draw.offset.xyz)","world"]},barrel:{output:"color",single:Ki,instanced:au,world:["world","(occurrence.model * vec4f(world, 1.0)).xyz"]},barrelPick:{output:"pick",single:Vi,instanced:nu,world:["world","(occurrence.model * vec4f(world, 1.0)).xyz"]},component:{output:"color",single:$d,instanced:Yd,world:["output.world","output.world"]},componentPick:{output:"pick",single:Jd,instanced:Qd,world:["(place(placement, dequant(input.position)) + draw.offset.xyz)","world"]},box:{output:"color",single:null,instanced:lu,world:[null,"(occurrence.model * vec4f(local, 1.0)).xyz"]},boxPick:{output:"pick",single:null,instanced:uu,world:[null,"(occurrence.model * vec4f(local, 1.0)).xyz"]}}),KT=Object.freeze(Object.keys(hu));function Li(t,e,s=[]){let r=hu[t],a=r?.[e?"instanced":"single"];if(!a)throw new Error(`No ${e?"instanced":"one-board"} ${t} shader`);return vd(a,s,{family:t,instanced:e,output:r.output,world:r.world[e?1:0]})}var VT=Object.freeze({main:vw,pick:xw,barrel:kw,barrelPick:Ew,mainInstanced:qd,pickInstanced:Wd,barrelInstanced:iu,barrelPickInstanced:ou,component:Zd,componentInstanced:eu,componentPick:tu,componentPickInstanced:su,box:du,boxPick:fu,cull:Xi}),Aw=new Float32Array(256),Qt=class t{static async create(e,{sampleCount:s=4}={}){if(!navigator.gpu)throw new Error("WebGPU is unavailable in this browser");let r=await navigator.gpu.requestAdapter({powerPreference:"high-performance"});if(!r)throw new Error("No WebGPU adapter is available");let a=r.features.has("depth32float-stencil8"),n=await r.requestDevice(a?{requiredFeatures:["depth32float-stencil8"]}:void 0);return new t(e,n,{stencil:a,sampleCount:s})}constructor(e,s,{shareFrom:r=null,stencil:a=!1,sampleCount:n=1}={}){if(this.canvas=e,this.device=s,this.shareFrom=r,this.stencil=r?r.stencil:!!a,this.sampleCount=r?r.sampleCount:n===4?4:1,this.depthFormat=this.stencil?"depth32float-stencil8":"depth32float",this.version=0,this.barrelColor=[.55,.35,.16,.78],this.alwaysInstanced=!!r,this.occurrenceBase=0,r?(this.context=r.context,this.format=r.format):(s.addEventListener("uncapturederror",i=>{console.error(`Uncaptured WebGPU error: ${i.error?.message||i.error}`)}),s.lost.then(i=>{i.reason!=="destroyed"&&console.error(`WebGPU device lost: ${i.reason}`,i.message)}),this.context=e.getContext("webgpu"),this.format=navigator.gpu.getPreferredCanvasFormat(),this.context.configure({device:s,format:this.format,alphaMode:"opaque"})),this.entries=[],this.barrels=null,this.drawSlotCapacity=gw,this.drawSlotBuffer=this.createDrawSlotBuffer(this.drawSlotCapacity),this.drawStaging=new Float32Array(this.drawSlotCapacity*Ms),this.freeDrawSlots=[],this.nextDrawSlot=0,this.globalBuffer=s.createBuffer({size:Pi,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.analyticGlobalBuffer=r?s.createBuffer({label:"analytic-globals",size:Pi,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}):null,this.layerOffsetBuffer=s.createBuffer({size:1024,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.occurrenceMatrices=[[...Xe]],this.occurrenceKeys=["0"],this.occurrenceHiddenLayers=[[]],this.occurrenceExplode=[null],this.identityOnly=!0,this.occurrenceCapacity=1,this.occurrenceBuffer=this.createOccurrenceBuffer(this.occurrenceCapacity),this.device.queue.writeBuffer(this.occurrenceBuffer,0,va(this.occurrenceMatrices)),this.barrelRecordBuffer=s.createBuffer({label:"barrel-records",size:Ci,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.placementBuffer=s.createBuffer({label:"component-placements",size:ji,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.componentPipelineSets=new Map,this.instancedPipelines=null,this.shaderFeatures=[],this.shaderFeatureKey="",this.featurePipelineSets=new Map,this.pipelineSetKinds=new WeakMap,this.listBuffer=this.createListBuffer(this.occurrenceCapacity),this.slotCapacity=0,this.slotArgs=new Uint32Array(0),this.slotClasses=new Uint32Array(0),this.freeSlots=[],this.nextSlot=2,this.argsBuffer=null,this.classesBuffer=null,this.growSlots(256),this.setSlot(0,0,4),this.setSlot(1,0,4),this.cull=null,this.box=null,this.boardBounds=null,this.selectedOccurrence=-1,this.lodOverride=null,this.lodThresholds={...Yt},this.innerCopperAtFull=!0,this.innerCopperMode="all",this.cullCounts={full:0,board:0,body:0,box:0,culled:0},this.frameStats={triangles:0,draws:0},this.boxColor=[.24,.36,.28,1],r)for(let i of["bindGroupLayout","pipelineLayout","vertexBuffers","pipeline","pickPipeline","barrelPipeline","barrelPickPipeline","singlePipelines"])this[i]=r[i];else this.createSinglePipelines();this.depth=null,this.colorTarget=null,this.pickDepth=null,this.pickTexture=null,this.insetColor=null,this.pickSerial=Promise.resolve(),this.bundleCache=new Map,this.globalScratch=new ArrayBuffer(Pi),this.globalScratchF32=new Float32Array(this.globalScratch),this.globalScratchView=new DataView(this.globalScratch),this.barrelDrawScratch=new Float32Array(ut/4),this.nextEntryId=1,this.hiddenFeatureIds=new Set,this.showPlaceholders=!0,this.hiddenBoardLayers=new Set,this.featureMaskCapacity=Ma,this.featureMaskBuffer=this.createFeatureMaskBuffer(this.featureMaskCapacity),this.uploadFeatureMask(),this.emphasizedNetIds=new Set,this.occurrenceEmphasis=null,this.emphasisStride=0,this.dimCopper=!1,this.netMaskCapacity=Qs,this.netMaskBuffer=this.createNetMaskBuffer(this.netMaskCapacity),this.uploadNetMask(),r&&this.setOccurrences([])}createSinglePipelines(){let e=this.device;this.bindGroupLayout=e.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:2,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:3,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:4,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:5,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:6,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:7,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:8,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}}]});let s=e.createPipelineLayout({bindGroupLayouts:[this.bindGroupLayout]});this.pipelineLayout=s;let r=this.vertexBuffers=[{arrayStride:zi,attributes:[{shaderLocation:0,offset:0,format:"unorm16x4"},{shaderLocation:1,offset:8,format:"snorm8x4"},{shaderLocation:2,offset:12,format:"uint32"},{shaderLocation:3,offset:16,format:"uint32"}]}];this.singlePipelines=this.makePipelineSet(!1,[]),this.pipeline=this.singlePipelines.main,this.pickPipeline=this.singlePipelines.pick,this.barrelPipeline=this.singlePipelines.barrel,this.barrelPickPipeline=this.singlePipelines.barrelPick}makeMainPipelines(e,s){let r=this.pipelineLayout,a=this.vertexBuffers,n=(c,l)=>this.makePipeline(r,e,this.format,a,`${c}${s}`,l),i=n("main",{stencil:jd}),o=n("main-blend");return{main:i,mark:this.stencil?n("main-mark",{stencil:mw}):i,blend:o,translucent:n("main-translucent",{depthWrite:!1,cullMode:"back"}),mask:this.stencil?n("mask",{stencil:yw}):o,maskCovered:this.stencil?n("mask-covered",{stencil:ww,constants:{COVERED:1}}):null}}createOccurrenceBuffer(e){return this.device.createBuffer({label:"occurrences",size:e*160,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST})}createListBuffer(e){return this.device.createBuffer({label:"visible-occurrences",size:e*4*Uint32Array.BYTES_PER_ELEMENT,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST})}growSlots(e){let s=new Uint32Array(e*5);s.set(this.slotArgs);let r=new Uint32Array(e).fill(4);r.set(this.slotClasses),this.slotArgs=s,this.slotClasses=r,this.slotCapacity=e,this.argsBuffer?.destroy?.(),this.classesBuffer?.destroy?.(),this.argsBuffer=this.device.createBuffer({label:"indirect-args",size:s.byteLength,usage:GPUBufferUsage.INDIRECT|GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.classesBuffer=this.device.createBuffer({label:"draw-classes",size:r.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.device.queue.writeBuffer(this.argsBuffer,0,s),this.device.queue.writeBuffer(this.classesBuffer,0,r),this.cull&&(this.cull.bindGroup=this.makeCullBindGroup()),this.bundleCache?.clear()}setSlot(e,s,r){this.slotArgs.fill(0,e*5,e*5+5),this.slotArgs[e*5]=s,this.slotClasses[e]=r,this.device.queue.writeBuffer(this.argsBuffer,e*20,this.slotArgs,e*5,5),this.device.queue.writeBuffer(this.classesBuffer,e*4,this.slotClasses,e,1)}allocSlot(e,s){let r=this.freeSlots.length?this.freeSlots.pop():this.nextSlot++;return r>=this.slotCapacity&&this.growSlots(this.slotCapacity*2),this.setSlot(r,e,s),r}get occurrenceCount(){return this.occurrenceMatrices.length}setOccurrences(e){let{matrices:s,keys:r,hiddenLayers:a,explode:n}=gd(e??[Xe]);this.occurrenceMatrices=s,this.occurrenceKeys=r,this.occurrenceHiddenLayers=a,this.occurrenceExplode=n,this.identityOnly=!this.alwaysInstanced&&s.length===1&&Mi(s[0]),this.identityOnly||this.ensureInstancedPipelines(),s.length>this.occurrenceCapacity&&(this.occurrenceBuffer?.destroy?.(),this.listBuffer?.destroy?.(),this.occurrenceCapacity=Math.max(s.length,this.occurrenceCapacity*2),this.occurrenceBuffer=this.createOccurrenceBuffer(this.occurrenceCapacity),this.listBuffer=this.createListBuffer(this.occurrenceCapacity),this.cull&&(this.cull.lods.destroy(),this.cull.lods=this.createLodBuffer(this.occurrenceCapacity)),this.rebindAll()),s.length&&this.device.queue.writeBuffer(this.occurrenceBuffer,0,va(s,a,n)),this.cull&&this.device.queue.writeBuffer(this.cull.lods,0,new Uint32Array(this.occurrenceCapacity).fill(Si)),this.selectedOccurrence>=s.length&&(this.selectedOccurrence=-1),this.bundleCache.clear(),this.invalidate()}setOccurrenceHiddenLayers(e){this.occurrenceHiddenLayers=this.occurrenceMatrices.map((s,r)=>[...e?.[r]||[]].map(Number)),this.writeOccurrenceRecords()}setOccurrenceExplode(e){this.occurrenceExplode=this.occurrenceMatrices.map((s,r)=>e?.[r]?[...e[r]].map(Number):null),this.writeOccurrenceRecords()}writeOccurrenceRecords(){this.occurrenceMatrices.length&&this.device.queue.writeBuffer(this.occurrenceBuffer,0,va(this.occurrenceMatrices,this.occurrenceHiddenLayers,this.occurrenceExplode)),this.invalidate()}setInnerCopperMode(e){this.setInnerCopperAtFull(!1),this.innerCopperMode!==e&&(this.innerCopperMode=e,this.invalidate())}setInnerCopperAtFull(e){if(this.innerCopperAtFull!==e){this.innerCopperAtFull=e;for(let s of this.entries)s.innerCopper&&(s.drawClass=Ud(s,e),this.setSlot(s.slot,s.indexCount,s.drawClass));this.invalidate()}}setBoardBounds(e){this.boardBounds=e?[...e]:null,this.invalidate()}setLodThresholds(e){this.lodThresholds=Ea({...this.lodThresholds,...e}),this.invalidate()}setAnalytic(e){this.analytic&&this.analytic!==e&&this.analytic.destroy(),this.analytic=e||null,this.bundleCache.clear(),this.invalidate()}analyticView(e){if(!this.alwaysInstanced||this.occurrenceMatrices.length!==1)return e;let s=this.occurrenceMatrices[0];return Mi(s)?e:Tt(e,s)}setLodOverride(e){this.lodOverride=e==null?null:Number(e),this.invalidate()}createLodBuffer(e){return this.device.createBuffer({label:"occurrence-lods",size:e*Uint32Array.BYTES_PER_ELEMENT,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST})}createCull(){let e=this.device,s=this.shareFrom?.cull,r=i=>({visibility:GPUShaderStage.COMPUTE,buffer:{type:i}}),a=s?.layout||e.createBindGroupLayout({label:"cull",entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}},{binding:1,...r("read-only-storage")},{binding:2,...r("storage")},{binding:3,...r("storage")},{binding:4,...r("storage")},{binding:5,...r("storage")},{binding:6,...r("read-only-storage")}]}),n=s&&{layout:a,classify:s.classify,writeArgs:s.writeArgs};if(!n){let i=this.createShaderModule(Xi,"cull"),o=e.createPipelineLayout({bindGroupLayouts:[a]});n={layout:a,classify:e.createComputePipeline({layout:o,compute:{module:i,entryPoint:"classify"}}),writeArgs:e.createComputePipeline({layout:o,compute:{module:i,entryPoint:"writeArgs"}})}}this.cull={...n,uniform:e.createBuffer({label:"cull-params",size:192,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),lods:this.createLodBuffer(this.occurrenceCapacity),counters:e.createBuffer({label:"cull-counters",size:16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST}),readback:e.createBuffer({label:"cull-readback",size:16,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST}),scratch:new ArrayBuffer(192),reading:!1,readAt:0,bindGroup:null},e.queue.writeBuffer(this.cull.lods,0,new Uint32Array(this.occurrenceCapacity).fill(Si)),this.cull.bindGroup=this.makeCullBindGroup()}makeCullBindGroup(){return this.device.createBindGroup({layout:this.cull.layout,entries:[{binding:0,resource:{buffer:this.cull.uniform}},{binding:1,resource:{buffer:this.occurrenceBuffer}},{binding:2,resource:{buffer:this.cull.lods}},{binding:3,resource:{buffer:this.listBuffer}},{binding:4,resource:{buffer:this.cull.counters}},{binding:5,resource:{buffer:this.argsBuffer}},{binding:6,resource:{buffer:this.classesBuffer}}]})}createBox(){let e=[[[1,0,0],[[1,0,0],[1,1,0],[1,1,1],[1,0,1]]],[[-1,0,0],[[0,0,0],[0,0,1],[0,1,1],[0,1,0]]],[[0,1,0],[[0,1,0],[0,1,1],[1,1,1],[1,1,0]]],[[0,-1,0],[[0,0,0],[1,0,0],[1,0,1],[0,0,1]]],[[0,0,1],[[0,0,1],[1,0,1],[1,1,1],[0,1,1]]],[[0,0,-1],[[0,0,0],[0,1,0],[1,1,0],[1,0,0]]]],s=[],r=[];e.forEach(([l,u],f)=>{for(let g of u)s.push(...g,...l);let b=f*4;r.push(b,b+1,b+2,b,b+2,b+3)});let a=new Float32Array(s),n=new Uint16Array(r),i=this.device.createBuffer({label:"box-vertices",size:a.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),o=this.device.createBuffer({label:"box-indices",size:n.byteLength,usage:GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST});this.device.queue.writeBuffer(i,0,a),this.device.queue.writeBuffer(o,0,n);let c=this.device.createBuffer({size:ut,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.box={vertexBuffer:i,indexBuffer:o,indexCount:n.length,drawBuffer:c,bindGroup:this.makeBindGroup(c),scratch:new Float32Array(ut/4)},this.setSlot(1,n.length,3)}writeBoxDraw(){let e=this.box.scratch,[s,r,a,n,i,o]=this.boardBounds;e.fill(0),e.set(this.boxColor,0),e.set([n-s,i-r,o-a,0],4),e.set([s,r,a,0],8),this.device.queue.writeBuffer(this.box.drawBuffer,0,e)}encodeCull(e,s){let r=this.cull,a=new Float32Array(r.scratch),n=new Uint32Array(r.scratch);a.fill(0),yd(s.matrix).forEach((d,m)=>a.set(d,m*4));let i=s.lod;i&&a.set([...i.eye,i.orthographic?0:1],24);let o=this.boardBounds||[-1e6,-1e6,-1e6,1e6,1e6,1e6];a.set([o[0],o[1],o[2],0,o[3],o[4],o[5],0],28);let{fullPx:c,boardPx:l,boxPx:u,keep:f}=this.lodThresholds;a.set([i?.pixelScale||0,c,u,f],36);let b=this.lodOverride!=null?this.lodOverride+1:!i||!this.boardBounds?ka+1:0;n.set([this.occurrenceMatrices.length,this.selectedOccurrence+1,b,this.nextSlot],40),n[44]=this.barrels?.instanceCount||0,a[45]=l,this.device.queue.writeBuffer(r.uniform,0,r.scratch),e.clearBuffer(r.counters);let g=e.beginComputePass({label:"cull"});g.setBindGroup(0,r.bindGroup),g.setPipeline(r.classify),g.dispatchWorkgroups(Math.ceil(this.occurrenceMatrices.length/64)),g.setPipeline(r.writeArgs),g.dispatchWorkgroups(Math.ceil(this.nextSlot/64)),g.end();let p=performance.now();return!r.reading&&p-r.readAt>250?(e.copyBufferToBuffer(r.counters,0,r.readback,0,16),r.readAt=p,!0):!1}readCullCounts(){let e=this.cull;e.reading=!0;let s=this.occurrenceMatrices.length;e.readback.mapAsync(GPUMapMode.READ).then(()=>{let[r,a,n,i]=new Uint32Array(e.readback.getMappedRange().slice(0));e.readback.unmap(),this.cullCounts={full:r,board:a-r,body:n-a,box:i,culled:Math.max(0,s-n-i)}}).catch(()=>{}).finally(()=>{e.reading=!1})}countFor(e){if(this.identityOnly)return e===2?this.barrels?.instanceCount||0:e===3?0:1;let{full:s,board:r,body:a,box:n}=this.cullCounts;return e===5?s+r+a:e===0?s+r:e===1?s:e===2?(s+r)*(this.barrels?.instanceCount||0):n}gpuMemoryBytes(){let e=0;for(let s of this.entries)e+=(s.vertexAllocation?.size||0)+(s.indexAllocation?.size||0);this.shareFrom||(e+=this.arenaSlackBytes());for(let s of[this.barrels?.vertexBuffer,this.barrels?.indexBuffer,this.barrels?.instanceBuffer,this.barrelRecordBuffer,this.occurrenceBuffer,this.listBuffer,this.argsBuffer,this.classesBuffer,this.featureMaskBuffer,this.netMaskBuffer,this.cull?.lods])e+=s?.size||0;return e+=this.analytic?.gpuMemoryBytes()||0,e+=this.meshOverlay?.gpuMemoryBytes()||0,e+=this.canvas.width*this.canvas.height*12,e}gpuMemoryBreakdown(){let e={},s=0,r=0;for(let l of this.entries){let u=l.vertexAllocation?.size||0,f=l.indexAllocation?.size||0;s+=u,r+=f;let b=l.kind==="copper"?`copper:${l.layerId??"?"}`:l.boardRole?`${l.kind}:${l.boardRole}`:l.kind||"other";e[b]=(e[b]||0)+u+f}let a=[this.barrels?.vertexBuffer,this.barrels?.indexBuffer,this.barrels?.instanceBuffer,this.barrelRecordBuffer].reduce((l,u)=>l+(u?.size||0),0),n=[this.occurrenceBuffer,this.listBuffer,this.argsBuffer,this.classesBuffer,this.featureMaskBuffer,this.netMaskBuffer,this.cull?.lods].reduce((l,u)=>l+(u?.size||0),0),i=this.shareFrom?null:this.arenaStats(),o=this.analytic?.gpuMemoryBytes()||0,c=this.meshOverlay?.gpuMemoryBytes()||0;return{vertex:s,index:r,geometry:e,barrels:a,occurrences:n,analytic:o,mesh:c,targets:this.canvas.width*this.canvas.height*12,entries:this.entries.length,arena:i}}ensureInstancedPipelines(){if(!this.instancedPipelines){if(this.shareFrom){this.shareFrom.ensureInstancedPipelines(),this.instancedPipelines=this.shareFrom.instancedPipelines,this.createBox(),this.createCull();return}this.instancedPipelines=this.makePipelineSet(!0,[]),this.createBox(),this.createCull()}}makePipelineSet(e,s){let r=this.pipelineLayout,a=Ai(s),n=l=>Li(l,e,s),i=a?`+${a}`:"",o=`${e?"-instanced":""}${i}`,c={...this.makeMainPipelines(n("main"),o),pick:this.makePipeline(r,n("pick"),Jt,this.vertexBuffers,`pick${o}`),barrel:this.makeBarrelPipeline(r,n("barrel"),this.format,`barrel${o}`,!e),barrelPick:this.makeBarrelPipeline(r,n("barrelPick"),Jt,`barrel-pick${o}`,!e)};return e&&(c.box=this.makePipeline(r,n("box"),this.format,Dd,`box${i}`),c.boxPick=this.makePipeline(r,n("boxPick"),Jt,Dd,`box-pick${i}`)),this.pipelineSetKinds.set(c,{instanced:e,features:ir(s),key:a}),c}setShaderFeatures(e=[]){let s=ir(e),r=Ai(s);r!==this.shaderFeatureKey&&(this.shaderFeatures=s,this.shaderFeatureKey=r,this.bundleCache.clear(),this.invalidate())}pipelinesFor(e){let s=this.shareFrom||this;if(e&&this.ensureInstancedPipelines(),!this.shaderFeatureKey)return e?s.instancedPipelines:s.singlePipelines;let r=`${e?"instanced":"single"}|${this.shaderFeatureKey}`,a=s.featurePipelineSets.get(r);return a||(a=s.makePipelineSet(e,this.shaderFeatures),s.featurePipelineSets.set(r,a)),a}drawSet(){return this.identityOnly?{pipelines:this.pipelinesFor(!1),indirect:!1,barrelInstances:this.barrels?.instanceCount||0}:{pipelines:this.pipelinesFor(!0),indirect:!0,barrelInstances:0}}drawEntry(e,s,r){e.setBindGroup(0,s.bindGroup);let a=s.vertexAllocation,n=s.indexAllocation;e.setVertexBuffer(0,a.buffer,a.offset,a.size),e.setIndexBuffer(n.buffer,s.indexFormat,n.offset,n.size),r?e.drawIndexedIndirect(this.argsBuffer,s.slot*20):e.drawIndexed(s.indexCount,s.placementCount||1)}drawBarrels(e,s,r,a){e.setPipeline(s),e.setBindGroup(0,this.barrels.bindGroup),e.setVertexBuffer(0,this.barrels.vertexBuffer),e.setVertexBuffer(1,this.barrels.instanceBuffer),e.setIndexBuffer(this.barrels.indexBuffer,"uint16"),r?e.drawIndexedIndirect(this.argsBuffer,0):e.drawIndexed(this.barrels.indexCount,a)}drawBox(e,s){!this.box||!this.boardBounds||(this.writeBoxDraw(),e.setPipeline(s),e.setBindGroup(0,this.box.bindGroup),e.setVertexBuffer(0,this.box.vertexBuffer),e.setIndexBuffer(this.box.indexBuffer,"uint16"),e.drawIndexedIndirect(this.argsBuffer,20))}createNetMaskBuffer(e){return this.device.createBuffer({label:"net-emphasis-mask",size:e*Uint32Array.BYTES_PER_ELEMENT,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST})}uploadNetMask(){let e;if(this.occurrenceEmphasis&&!this.identityOnly){let r=Yc(this.occurrenceEmphasis);this.emphasisStride=r.stride,e=r.data}else this.emphasisStride=0,e=qc(this.emphasizedNetIds,this.netMaskCapacity);if(e.length>this.netMaskCapacity){this.netMaskBuffer?.destroy?.();let r=this.netMaskCapacity;for(;r<e.length;)r*=2;this.netMaskCapacity=r,this.netMaskBuffer=this.createNetMaskBuffer(r),this.rebindAll()}let s=new Uint32Array(this.netMaskCapacity);s.set(e),this.device.queue.writeBuffer(this.netMaskBuffer,0,s)}setOccurrenceEmphasis(e,{dimCopper:s=!1}={}){let r=Array.isArray(e)&&e.some(a=>a&&a.size);this.occurrenceEmphasis=r?e.map(a=>a&&a.size?new Map(a):null):null,this.dimCopper=!!s,this.uploadNetMask(),this.invalidate()}get netHighlightActive(){return!!(this.emphasizedNetIds.size||this.occurrenceEmphasis||this.dimCopper)}setEmphasizedNetIds(e){this.emphasizedNetIds=sa(e),this.occurrenceEmphasis=null;let s=Hc(this.emphasizedNetIds,this.netMaskCapacity);s!==this.netMaskCapacity&&(this.netMaskBuffer?.destroy?.(),this.netMaskCapacity=s,this.netMaskBuffer=this.createNetMaskBuffer(s),this.rebindAll()),this.uploadNetMask(),this.invalidate()}rebindAll(){for(let e of this.entries)e.bindGroup=this.makeBindGroup(this.drawSlotBuffer,e.drawSlot*ut);this.barrels&&(this.barrels.bindGroup=this.makeBindGroup(this.barrels.drawBuffer)),this.box&&(this.box.bindGroup=this.makeBindGroup(this.box.drawBuffer)),this.cull&&(this.cull.bindGroup=this.makeCullBindGroup()),this.bundleCache.clear()}createFeatureMaskBuffer(e){return this.device.createBuffer({label:"feature-visibility-mask",size:e*Uint32Array.BYTES_PER_ELEMENT,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST})}createDrawSlotBuffer(e){return this.device.createBuffer({label:"draw-uniforms",size:e*ut,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST})}allocateDrawSlot(){if(this.freeDrawSlots.length)return this.freeDrawSlots.pop();if(this.nextDrawSlot>=this.drawSlotCapacity){let e=this.drawSlotCapacity*2,s=new Float32Array(e*Ms);s.set(this.drawStaging),this.drawSlotBuffer.destroy?.(),this.drawSlotCapacity=e,this.drawSlotBuffer=this.createDrawSlotBuffer(e),this.drawStaging=s,this.rebindAll()}return this.nextDrawSlot++}flushDraws(e){if(!e.length)return;let s=1/0,r=-1;for(let a of e)s=Math.min(s,a.drawSlot),r=Math.max(r,a.drawSlot);this.device.queue.writeBuffer(this.drawSlotBuffer,s*ut,this.drawStaging,s*Ms,(r-s+1)*Ms)}invalidate(){this.version+=1}setBarrelColor(e){this.barrelColor=[...e],this.invalidate()}makeBindGroup(e,s=0){return this.device.createBindGroup({layout:this.bindGroupLayout,entries:[{binding:0,resource:{buffer:this.globalBuffer}},{binding:1,resource:{buffer:e,offset:s,size:ut}},{binding:2,resource:{buffer:this.layerOffsetBuffer}},{binding:3,resource:{buffer:this.featureMaskBuffer}},{binding:4,resource:{buffer:this.netMaskBuffer}},{binding:5,resource:{buffer:this.occurrenceBuffer}},{binding:6,resource:{buffer:this.barrelRecordBuffer}},{binding:7,resource:{buffer:this.listBuffer}},{binding:8,resource:{buffer:this.placementBuffer}}]})}uploadFeatureMask(){let e=Ed(this.hiddenFeatureIds,this.featureMaskCapacity);this.device.queue.writeBuffer(this.featureMaskBuffer,0,e)}setHiddenFeatureIds(e){this.hiddenFeatureIds=Sa(e);let s=kd(this.hiddenFeatureIds,this.featureMaskCapacity);s!==this.featureMaskCapacity&&(this.featureMaskBuffer?.destroy?.(),this.featureMaskCapacity=s,this.featureMaskBuffer=this.createFeatureMaskBuffer(s),this.rebindAll()),this.uploadFeatureMask(),this.bundleCache.clear(),this.invalidate()}depthStencilState(e=null,s=!0){let r={format:this.depthFormat,depthWriteEnabled:s,depthCompare:"greater"};return this.stencil&&e&&(r.stencilFront=e,r.stencilBack=e),r}makePipeline(e,s,r,a,n,i={}){let o=this.createShaderModule(s,n);return this.device.createRenderPipeline({layout:e,vertex:{module:o,entryPoint:"vs",buffers:a},fragment:{module:o,entryPoint:"fs",...i.constants?{constants:i.constants}:{},targets:[{format:r,blend:r===Jt?void 0:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"triangle-list",cullMode:i.cullMode??"none"},depthStencil:this.depthStencilState(i.stencil,i.depthWrite??!0),multisample:{count:this.samplesFor(r)}})}makeBarrelPipeline(e,s,r,a,n=!0){let i=this.createShaderModule(s,a);return this.device.createRenderPipeline({layout:e,vertex:{module:i,entryPoint:"vs",buffers:[{arrayStride:28,attributes:[{shaderLocation:0,offset:0,format:"float32x3"},{shaderLocation:1,offset:12,format:"float32x3"},{shaderLocation:2,offset:24,format:"float32"}]},...n?[Sd]:[]]},fragment:{module:i,entryPoint:"fs",targets:[{format:r,blend:r===Jt?void 0:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"triangle-list",cullMode:"none"},depthStencil:this.depthStencilState(),multisample:{count:this.samplesFor(r)}})}samplesFor(e){return e===Jt?1:this.sampleCount}createShaderModule(e,s){let r=this.device.createShaderModule({label:`pcb-${s}`,code:e});return typeof r.getCompilationInfo=="function"&&r.getCompilationInfo().then(a=>{let n=[...a.messages||[]];if(n.length){console.groupCollapsed(`WebGPU shader compilation info: pcb-${s}`);for(let i of n)console[i.type==="error"?"error":"warn"](`${i.type} ${i.lineNum}:${i.linePos} ${i.message}`);console.groupEnd()}}),r}resize(){let e=Math.min(devicePixelRatio||1,2),s=Math.max(1,Math.floor(this.canvas.clientWidth*e)),r=Math.max(1,Math.floor(this.canvas.clientHeight*e));if(this.canvas.width===s&&this.canvas.height===r)return;this.canvas.width=s,this.canvas.height=r,this.depth?.destroy(),this.colorTarget?.destroy(),this.pickDepth?.destroy(),this.pickTexture?.destroy();let a=this.sampleCount;this.depth=this.device.createTexture({label:"depth",size:[s,r],format:this.depthFormat,sampleCount:a,usage:GPUTextureUsage.RENDER_ATTACHMENT}),this.colorTarget=a>1?this.device.createTexture({label:"color-msaa",size:[s,r],format:this.format,sampleCount:a,usage:GPUTextureUsage.RENDER_ATTACHMENT}):null,this.pickDepth=a>1?this.device.createTexture({label:"pick-depth",size:[s,r],format:this.depthFormat,usage:GPUTextureUsage.RENDER_ATTACHMENT}):this.depth,this.pickTexture=this.device.createTexture({size:[s,r],format:Jt,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC})}addPrimitive(e,s){let r=e.position.length/3,a=new ArrayBuffer(r*zi),n=new Uint32Array(a),i=new Uint16Array(a),o=new Int8Array(a),c=Iw(e.position);for(let y=0;y<r;y+=1){let w=y*5,v=y*3;Rw(i,w*2,e.position,v,c),Nw(o,(w+2)*4,e.normal,v),n[w+3]=e.netId[y]||0,n[w+4]=e.objectFeatureId[y]||0}let l=this.arenas(),u=l.vertex.alloc(a.byteLength);l.vertex.write(u,a);let{indices:f,format:b}=Bw(e.indices,r),g=l.index.alloc(f.byteLength);l.index.write(g,f);let p=this.allocateDrawSlot(),d=this.makeBindGroup(this.drawSlotBuffer,p*ut),m=Ud(s,this.innerCopperAtFull),h={...s,drawClass:m,slot:this.allocSlot(e.indices.length,s.placements?Sw|s.placements<<3:m),placementCount:s.placements||0,placementBase:0,bounds:e.bounds||s.bounds||null,id:this.nextEntryId++,vertexAllocation:u,indexAllocation:g,quantMin:c.min,quantSize:c.size,indexFormat:b,indexCount:e.indices.length,drawSlot:p,bindGroup:d};return this.entries.push(h),this.bundleCache.clear(),this.invalidate(),h}arenas(){let e=this.shareFrom||this;return e.geometryArenas??={vertex:new nr(e.device,GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST,"geometry-vertices"),index:new nr(e.device,GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST,"geometry-indices")},e.geometryArenas}arenaSlackBytes(){let e=this.geometryArenas;return e?e.vertex.reservedBytes()-e.vertex.usedBytes+e.index.reservedBytes()-e.index.usedBytes:0}arenaStats(){let e=this.geometryArenas;if(!e)return{chunks:0,reserved:0,used:0};let s=r=>r.chunks.reduce((a,n)=>a+n.free.filter(i=>i.offset+i.size<n.size).reduce((i,o)=>i+o.size,0),0);return{chunks:e.vertex.chunks.length+e.index.chunks.length,reserved:e.vertex.reservedBytes()+e.index.reservedBytes(),used:e.vertex.usedBytes+e.index.usedBytes,holes:s(e.vertex)+s(e.index)}}componentPipelines(e){let s=this.shareFrom||this,r=s.componentPipelineSets.get(e);if(!r){let{instanced:a,features:n,key:i}=s.pipelineSetKinds.get(e),o=s.pipelineLayout,c=s.vertexBuffers,l=Li("component",a,n),u=Li("componentPick",a,n),f=`${a?"-instanced":""}${i?`+${i}`:""}`;r={main:s.makePipeline(o,l,s.format,c,`component${f}`,{stencil:jd}),blend:s.makePipeline(o,l,s.format,c,`component-blend${f}`),pick:s.makePipeline(o,u,Jt,c,`component-pick${f}`)},s.componentPipelineSets.set(e,r)}return r}addInstancedPrimitives(e){let s=e.map(({primitive:r,placements:a,metadata:n})=>{let i=this.addPrimitive(r,{...n,placements:a.length});return i.placementRecords=a,i});return this.writePlacements(),s}writePlacements(){let e=this.entries.filter(o=>o.placementRecords),s=e.reduce((o,c)=>o+c.placementRecords.length,0),r=new ArrayBuffer(Math.max(1,s)*ji),a=new Float32Array(r),n=new Uint32Array(r),i=0;for(let o of e){o.placementBase=i;for(let c of o.placementRecords){let l=i*(ji/4);a.set(c.rows,l),n[l+12]=c.featureId||0,i+=1}}this.placementBuffer.size<r.byteLength&&(this.placementBuffer.destroy?.(),this.placementBuffer=this.device.createBuffer({label:"component-placements",size:r.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.rebindAll()),this.device.queue.writeBuffer(this.placementBuffer,0,r),this.invalidate()}removeEntries(e){if(!e?.length)return;let s=new Set(e.map(r=>r.id));for(let r of e){let a=this.arenas();r.vertexAllocation&&a.vertex.free(r.vertexAllocation),r.indexAllocation&&a.index.free(r.indexAllocation),this.freeDrawSlots.push(r.drawSlot),r.slot!=null&&(this.setSlot(r.slot,0,4),this.freeSlots.push(r.slot))}this.entries=this.entries.filter(r=>!s.has(r.id)),e.some(r=>r.placementRecords)&&this.writePlacements(),this.bundleCache.clear(),this.invalidate()}dispose(){this.meshOverlay?.destroy(),this.meshOverlay=null,this.removeEntries(this.entries),this.shareFrom||(this.geometryArenas?.vertex.destroy(),this.geometryArenas?.index.destroy(),this.geometryArenas=null),this.barrels&&(this.barrels.vertexBuffer?.destroy?.(),this.barrels.indexBuffer?.destroy?.(),this.barrels.instanceBuffer?.destroy?.(),this.barrels.drawBuffer?.destroy?.(),this.barrels=null),this.depth?.destroy(),this.colorTarget?.destroy(),this.pickDepth!==this.depth&&this.pickDepth?.destroy(),this.insetColor?.texture.destroy(),this.pickTexture?.destroy(),this.featureMaskBuffer?.destroy?.(),this.occurrenceBuffer?.destroy?.(),this.barrelRecordBuffer?.destroy?.(),this.listBuffer?.destroy?.(),this.argsBuffer?.destroy?.(),this.classesBuffer?.destroy?.();for(let e of[this.box?.vertexBuffer,this.box?.indexBuffer,this.box?.drawBuffer,this.cull?.uniform,this.cull?.lods,this.cull?.counters,this.cull?.readback])e?.destroy?.();this.box=null,this.cull=null,this.drawSlotBuffer?.destroy?.(),this.depth=null,this.colorTarget=null,this.pickDepth=null,this.insetColor=null,this.pickTexture=null,this.featureMaskBuffer=null,this.bundleCache.clear()}setBarrels(e){if(!e?.length)return;let s=Gd,r=[],a=[],n=(d,m,h)=>{let y=r.length/7;for(let w=0;w<s;w+=1){let v=Math.PI*2*(w+.5)/s,x=Math.cos(v),S=Math.sin(v),[T,A,_]=h(x,S);r.push(x,S,m,T,A,_,d)}return y},i=(d,m)=>{for(let h=0;h<s;h+=1){let y=(h+1)%s;a.push(d+h,d+y,m+y,d+h,m+y,m+h)}};for(let d of[0,1]){let m=d?(h,y)=>[-h,-y,0]:(h,y)=>[h,y,0];i(n(d,0,m),n(d,1,m))}for(let[d,m]of[[0,1],[1,-1]]){let h=()=>[0,0,m];i(n(0,d,h),n(2,d,h))}let o=new Float32Array(r),c=new Uint16Array(a),l=_d(e),u=this.device.createBuffer({size:o.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),f=this.device.createBuffer({size:c.byteLength,usage:GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST}),b=this.device.createBuffer({size:l.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});this.device.queue.writeBuffer(u,0,o),this.device.queue.writeBuffer(f,0,c),this.device.queue.writeBuffer(b,0,l);let g=Id(e);this.barrelRecordBuffer?.destroy?.(),this.barrelRecordBuffer=this.device.createBuffer({label:"barrel-records",size:g.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.device.queue.writeBuffer(this.barrelRecordBuffer,0,g);let p=this.device.createBuffer({size:ut,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.barrels={records:e,vertexBuffer:u,indexBuffer:f,instanceBuffer:b,indexCount:c.length,instanceCount:e.length,drawBuffer:p,bindGroup:null},this.setSlot(0,c.length,2),this.rebindAll(),this.invalidate()}render(e){let{panels:s,layerOffsets:r}=e;this.resize(),this.device.queue.writeBuffer(this.layerOffsetBuffer,0,r);let a=this.context.getCurrentTexture().createView(),n=0,i=0;s.forEach((o,c)=>{let l=this.device.createCommandEncoder(),u=!this.identityOnly&&this.encodeCull(l,o),f=l.beginRenderPass({colorAttachments:[this.colorAttachment(a,c===0,c===s.length-1)],depthStencilAttachment:this.depthAttachment()}),b=Di(o.viewport,this.canvas.width,this.canvas.height);f.setViewport(b.x,b.y,b.width,b.height,0,1),f.setScissorRect(b.x,b.y,b.width,b.height),this.analytic&&(this.analytic.viewport=b);let g=this.encodeDraws(f,o,e);n+=g.triangles,i+=g.draws,f.end(),this.device.queue.submit([l.finish()]),u&&this.readCullCounts()}),this.frameStats={triangles:Math.round(n),draws:i}}analyticFlatLayers(e){if(!this.analytic||!e.compareMode)return[];let s=[];for(let r of e.visibleLayers||[]){let a=this.analytic.layerZ(Number(r));a!==null&&s.push({layerId:Number(r),offset:e.compareOffsets?.get(r)||e.compareOffsets?.get(Number(r))||[0,0,0],z:a})}return s}encodeFlatLayers(e,s,r,a,n){let i=new Map(r.map(l=>[l.layerId,l])),o={matrix:s,flat:i,isolateNet:a,showBoard:!1},c=this.innerCopperMode;this.innerCopperMode="all";try{return this.analytic.encodeInto(e,Aw,new Set(i.keys()),n,o)}finally{this.innerCopperMode=c}}renderInto(e,s,r){if(!this.identityOnly)throw new Error("renderInto: one-board renderer only");let a=this.device.createCommandEncoder({label:"inset"}),n={view:e.depthView,depthClearValue:0,depthLoadOp:"clear",depthStoreOp:"discard"};this.stencil&&Object.assign(n,{stencilClearValue:0,stencilLoadOp:"clear",stencilStoreOp:"discard"});let i=a.beginRenderPass({colorAttachments:[this.colorAttachment(e.colorView,!0,!0,this.insetColorView(e.width,e.height))],depthStencilAttachment:n}),o=Di(s.viewport,e.width,e.height);i.setViewport(o.x,o.y,o.width,o.height,0,1),i.setScissorRect(o.x,o.y,o.width,o.height),this.analytic&&(this.analytic.viewport=o);let c=this.encodeDraws(i,s,r);return i.end(),this.device.queue.submit([a.finish()]),c}encodeDraws(e,s,{activeNetId:r,selectedFeatureId:a,time:n,visibleLayers:i,showBoard:o,showComponents:c,showPaste:l=!0,componentOpacity:u,boardOpacity:f,isolateNet:b,compareMode:g=!1,compareOffsets:p=new Map,layerAlphas:d=null,visibleTileIds:m=null,layerOffsets:h=null}){let y=0,w=0,v=null;if(this.stencil&&e.setStencilReference(1),this.writeGlobals(s.matrix,r,s.layerId,n,a),this.relief?.ready&&!g)return{triangles:this.relief.vertexCount/3,draws:this.relief.encode(e,s.matrix)};let{pipelines:x,indirect:S,barrelInstances:T}=this.drawSet(),A=!l||!!(r||this.netHighlightActive),_=this.entries.filter(C=>this.visible(C,s.layerId,i,o,c,u,g,m)&&!(A&&C.boardRole==="paste")&&!(C.side&&this.hiddenBoardLayers?.has(`${C.boardRole}:${C.side}`))),N=_.filter(C=>!_a(C)).sort((C,R)=>+!!C.stencilMark-+!!R.stencilMark),B=_.filter(C=>_a(C)).sort((C,R)=>_a(C)-_a(R));for(let C of _)this.writeDraw(C,r,u,f,b,g,p.get(C.layerId),d?.get(C.layerId)??1);this.flushDraws(_),N.length>64?e.executeBundles([this.renderBundle(N,s.layerId)]):this.drawEntries(e,N,x,S);for(let C of _)y+=C.indexCount/3*this.countFor(C.drawClass)*(C.placementCount||1);if(w+=_.length,this.analytic&&!g&&(v={matrix:this.analyticView(s.matrix),showBoard:o,boardOpacity:f,hidePaste:A,isolateNet:b,panelLayer:s.layerId,assemblyOpacity:l?1:u,hiddenBoardLayers:this.hiddenBoardLayers},w+=this.analytic.encodeInto(e,h,s.layerId?new Set([s.layerId]):i,!1,v),w+=this.analytic.encodeBarrels(e,h,v.matrix),w+=this.analytic.encodeArrows(e)),this.analytic&&g){let C=this.analyticFlatLayers({compareMode:g,visibleLayers:i,compareOffsets:p});C.length&&(w+=this.encodeFlatLayers(e,s.matrix,C,b,!1))}if(!g&&this.barrels&&!this.analytic?.hasBarrels()&&(s.layerId===0||i.has(s.layerId))&&(this.writeBarrelDraw(b),this.drawBarrels(e,x.barrel,S,T),y+=this.barrels.indexCount/3*this.countFor(2),w+=1),S&&!g&&(this.drawBox(e,x.box),y+=12*this.countFor(3),w+=1),v&&(w+=this.analytic.encodeGhostBarrels(e),w+=this.analytic.encodeBlended(e,h,s.layerId?new Set([s.layerId]):i,v)),this.drawBlended(e,B,x,S),this.meshOverlay?.shown&&!g){let C=this.meshOverlay.encode(e,this.analyticView(s.matrix),h,s.layerId?new Set([s.layerId]):i);y+=C.triangles,w+=C.draws}return{triangles:y,draws:w}}colorAttachment(e,s=!0,r=!0,a=this.colorTarget?.createView()){let n={view:e,clearValue:{r:.91,g:.93,b:.94,a:1},loadOp:s?"clear":"load",storeOp:"store"};return this.sampleCount===1?n:{...n,view:a,resolveTarget:e,storeOp:r?"discard":"store"}}insetColorView(e,s){if(this.sampleCount!==1){if(this.insetColor?.width!==e||this.insetColor?.height!==s){this.insetColor?.texture.destroy();let r=this.device.createTexture({label:"inset-msaa",size:[e,s],format:this.format,sampleCount:this.sampleCount,usage:GPUTextureUsage.RENDER_ATTACHMENT});this.insetColor={texture:r,view:r.createView(),width:e,height:s}}return this.insetColor.view}}depthAttachment(e=!1){let s={view:(e?this.pickDepth:this.depth).createView(),depthClearValue:0,depthLoadOp:"clear",depthStoreOp:"discard"};return this.stencil&&Object.assign(s,{stencilClearValue:0,stencilLoadOp:"clear",stencilStoreOp:"discard"}),s}drawEntries(e,s,r,a){let n=null;for(let i of s){let o=i.placementCount?this.componentPipelines(r).main:i.stencilMark?r.mark:r.main;o!==n&&(e.setPipeline(o),n=o),this.drawEntry(e,i,a)}}drawBlended(e,s,r,a){for(let n of s)if(n.boardRole==="soldermask"&&n.kind==="board")e.setPipeline(r.mask),this.drawEntry(e,n,a),r.maskCovered&&(e.setPipeline(r.maskCovered),this.drawEntry(e,n,a));else{let i=n.translucent?r.translucent??r.blend:r.blend;e.setPipeline(n.placementCount?this.componentPipelines(r).blend:i),this.drawEntry(e,n,a)}}setPlaceholdersVisible(e){this.showPlaceholders=!!e,this.invalidate()}setHiddenBoardLayers(e){this.hiddenBoardLayers=new Set(e||[]),this.invalidate()}visible(e,s,r,a,n,i,o=!1,c=null){return e.placeholder&&!this.showPlaceholders?!1:o?e.kind==="copper"&&r.has(e.layerId):e.kind==="copper"&&this.analytic?.coversLayer(e.layerId)||e.kind==="board"&&this.analytic?.coversRole(e.boardRole)||e.kind==="board"&&e.boardRole==="pad"||e.kind==="copper"&&c&&!c.has(e.tileId)||e.innerCopper&&this.innerCopperMode==="none"?!1:e.boardRole==="paste"?s===0&&r.has(e.layerId):e.kind==="board"?s===0&&a:e.kind==="component"?s===0&&n&&i>.001:s?e.layerId===s:r.has(e.layerId)}writeGlobals(e,s,r,a,n=0){let i=this.globalScratch,o=this.globalScratchF32;o.fill(0),o.set(e,0);let c=this.globalScratchView;if(c.setUint32(64,s||0,!0),c.setUint32(68,r||0,!0),c.setFloat32(72,a,!0),c.setFloat32(76,s||this.netHighlightActive?1:0,!0),c.setUint32(80,n||0,!0),c.setUint32(84,this.selectedOccurrence>=0?this.selectedOccurrence+1+this.occurrenceBase:0,!0),c.setUint32(88,this.occurrenceBase,!0),c.setUint32(92,this.emphasisStride,!0),o.set(Ui,24),this.device.queue.writeBuffer(this.globalBuffer,0,i),this.analyticGlobalBuffer&&this.analytic){let l=this.occurrenceMatrices.length===1?this.occurrenceMatrices[0]:null;o.set(this.analyticView(e),0),o.set(l?bw(l):Ui,24),this.device.queue.writeBuffer(this.analyticGlobalBuffer,0,i)}}writeDraw(e,s,r,a=1,n=!1,i=!1,o=null,c=1){let l=this.drawStaging.subarray(e.drawSlot*Ms,(e.drawSlot+1)*Ms);l.fill(0);let u=e.color||e.material.baseColor;l.set(u,0),l.set([e.material.metallic||0,e.material.roughness??.72,e.opacityScale!=null?r:0,_w[e.drawClass]??1],4);let f=Ow(e);l.set([o?.[0]||0,o?.[1]||0,(i?-(e.baseZ||0):e.layerOffset||0)+f,e.kind==="copper"||e.boardRole==="paste"?Number(e.layerId||0)+1:0],8);let b=Number.isFinite(u?.[3])?u[3]:1,g=e.kind==="component"?r*(e.opacityScale??1):e.kind==="board"&&e.boardRole!=="paste"?a*Cw(e,b):c,p=e.kind==="copper"?1:e.kind==="component"?2:0,d=n?1:e.innerCopper&&this.innerCopperMode==="lit"?2:0;if(l.set([p,g,d,i?1:0],12),e.placementCount){let m=new Uint32Array(l.buffer,l.byteOffset+64,2);m[0]=e.placementBase,m[1]=e.placementCount}l.set(e.quantMin,20),l.set(e.quantSize,24)}writeBarrelDraw(e=!1){let s=this.barrelDrawScratch;s.fill(0),s.set(this.barrelColor,0),s.set([.75,.32,0,0],4),s.set([1,1,e?1:0,0],12),this.device.queue.writeBuffer(this.barrels.drawBuffer,0,s)}renderBundle(e,s){let{pipelines:r,indirect:a}=this.drawSet(),{vertex:n,index:i}=this.arenas(),o=`${s}:${a?"indirect":"single"}:${this.shaderFeatureKey}:${n.generation}.${i.generation}:${e.map(f=>f.id).join(",")}`,c=this.bundleCache.get(o);if(c)return c;let l=this.device.createRenderBundleEncoder({colorFormats:[this.format],depthStencilFormat:this.depthFormat,sampleCount:this.sampleCount});this.drawEntries(l,e,r,a);let u=l.finish();return this.bundleCache.set(o,u),this.bundleCache.size>32&&this.bundleCache.delete(this.bundleCache.keys().next().value),u}pick(e,s,r,a){let n=this.pickSerial.then(()=>this.performPick(e,s,r,a));return this.pickSerial=n.catch(()=>0),n}async performPick(e,s,r,a){this.resize();let n=Math.max(0,Math.min(this.canvas.width-1,Math.floor(s))),i=Math.max(0,Math.min(this.canvas.height-1,Math.floor(r)));this.device.queue.writeBuffer(this.layerOffsetBuffer,0,a.layerOffsets);let o=this.device.createCommandEncoder(),c=o.beginRenderPass({colorAttachments:[{view:this.pickTexture.createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}],depthStencilAttachment:this.depthAttachment(!0)}),l=Di(e.viewport,this.canvas.width,this.canvas.height);return c.setViewport(l.x,l.y,l.width,l.height,0,1),c.setScissorRect(n,i,1,1),this.analytic&&(this.analytic.viewport=l),this.encodePick(c,e,a),c.end(),this.readPick(o,n,i)}encodePick(e,s,r){if(this.relief?.ready&&!r.compareMode)return;this.writeGlobals(s.matrix,r.activeNetId,s.layerId,performance.now()/1e3,r.selectedFeatureId);let{pipelines:a,indirect:n,barrelInstances:i}=this.drawSet();e.setPipeline(a.pick);let o=[];for(let c of this.entries)this.visible(c,s.layerId,r.visibleLayers,r.showBoard,r.showComponents,r.componentOpacity,r.compareMode,r.visibleTileIds)&&(c.kind==="board"&&(this.identityOnly||c.boardRole!=="substrate")||(this.writeDraw(c,r.activeNetId,r.componentOpacity,r.boardOpacity,r.isolateNet,r.compareMode,r.compareOffsets?.get(c.layerId)),o.push(c)));this.flushDraws(o);for(let c of o)e.setPipeline(c.placementCount?this.componentPipelines(a).pick:a.pick),this.drawEntry(e,c,n);if(!r.compareMode&&this.barrels&&!this.analytic?.hasBarrels()&&(this.writeBarrelDraw(r.isolateNet),this.drawBarrels(e,a.barrelPick,n,i)),n&&!r.compareMode&&this.drawBox(e,a.boxPick),this.analytic&&!r.compareMode){let c=s.layerId?new Set([s.layerId]):r.visibleLayers;this.analytic.encodeInto(e,r.layerOffsets,c,!0,{matrix:this.analyticView(s.matrix),panelLayer:s.layerId,isolateNet:r.isolateNet,showBoard:r.showBoard}),this.analytic.encodeBarrels(e,r.layerOffsets,this.analyticView(s.matrix),!0)}if(this.analytic&&r.compareMode){let c=this.analyticFlatLayers(r);c.length&&this.encodeFlatLayers(e,s.matrix,c,r.isolateNet,!0)}}async readPick(e,s,r,a=this){let n=this.device.createBuffer({label:"pick-readback",size:256,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});e.copyTextureToBuffer({texture:this.pickTexture,origin:{x:s,y:r}},{buffer:n,bytesPerRow:256},{width:1,height:1}),this.device.queue.submit([e.finish()]);try{await n.mapAsync(GPUMapMode.READ);let i=new DataView(n.getMappedRange()),o=i.getUint32(0,!0),c=i.getUint32(4,!0);if(n.unmap(),a.analytic&&o&2147483648&&c)return{kind:"analytic",occurrenceIndex:-1,featureId:0,operationIndex:c-1,occurrenceKey:null};let l=bd(o,c);return{...l,occurrenceKey:l.occurrenceIndex>=0?a.occurrenceKeys[l.occurrenceIndex]??null:null}}finally{n.mapState==="mapped"&&n.unmap(),n.destroy()}}},_w=Object.freeze({0:1,1:0,5:2});function Iw(t){let e=[1/0,1/0,1/0],s=[-1/0,-1/0,-1/0];for(let r=0;r<t.length;r+=3)for(let a=0;a<3;a+=1){let n=t[r+a];n<e[a]&&(e[a]=n),n>s[a]&&(s[a]=n)}return Number.isFinite(e[0])?{min:e,size:e.map((r,a)=>s[a]>r?s[a]-r:1)}:{min:[0,0,0],size:[1,1,1]}}function Rw(t,e,s,r,a){for(let n=0;n<3;n+=1){let i=(s[r+n]-a.min[n])/a.size[n];t[e+n]=Math.max(0,Math.min(65535,Math.round(i*65535)))}t[e+3]=0}function Nw(t,e,s,r){for(let a=0;a<3;a+=1){let n=Number(s[r+a])||0;t[e+a]=Math.max(-127,Math.min(127,Math.round(n*127)))}t[e+3]=0}function Bw(t,e){if(e<=65536){let s=new Uint16Array(t.length+(t.length&1));return s.set(t),{indices:s,format:"uint16"}}return{indices:t instanceof Uint32Array?t:new Uint32Array(t),format:"uint32"}}function pu(t,e){return t*zi+(t<=65536?(e+(e&1))*2:e*4)}function Ud(t,e){return t.kind==="component"||t.innerCopper&&e?1:t.kind==="board"&&(t.boardRole==="substrate"||t.boardRole==="soldermask")?5:0}function _a(t){return t.translucent?3:t.kind!=="board"?0:t.boardRole==="soldermask"?1:t.boardRole==="silkscreen"?2:0}function Cw(t,e){return t.kind!=="board"||t.boardRole==="substrate"?1:t.boardRole==="soldermask"?Math.min(e,.72):t.boardRole==="silkscreen"?Math.min(e,.92):e}function Ow(t){if(t.kind!=="board"||t.boardRole!=="soldermask"&&t.boardRole!=="silkscreen")return 0;let e=t.bounds,r=(e?(e[2]+e[5])*.5:0)<0?-1:1,a=t.boardRole==="silkscreen"?35e-6:18e-6;return r*a}function Di(t,e,s){let r=Math.max(0,Math.min(e-1,Math.floor(t.x))),a=Math.max(0,Math.min(s-1,Math.floor(t.y)));return{x:r,y:a,width:Math.max(1,Math.min(e-r,Math.floor(t.width))),height:Math.max(1,Math.min(s-a,Math.floor(t.height)))}}function bu(t){return t*12+2}function gu(t){let e=[],s=0,r=0,a=0;for(let g=0;g<t.length;g+=1){let p=Math.floor(t[g].samplesMm.length/3);p<2||(e.push(g),s+=p,r+=bu(p),a+=(p-1)*12*6+72)}let n=new Float32Array(Math.max(s,1)*4),i=new ArrayBuffer(Math.max(e.length,1)*32),o=new Uint32Array(i),c=new Float32Array(i),l=new Uint32Array(Math.max(a,3)),u=0,f=0,b=0;return e.forEach((g,p)=>{let d=t[g],m=Math.floor(d.samplesMm.length/3);for(let w=0;w<m;w+=1)n[(u+w)*4]=d.samplesMm[w*3]*.001,n[(u+w)*4+1]=d.samplesMm[w*3+1]*.001,n[(u+w)*4+2]=d.samplesMm[w*3+2]*.001;o[p*8]=u,o[p*8+1]=m,o[p*8+2]=f,o[p*8+3]=p,c[p*8+4]=d.radiusMm*.001;let h=(w,v)=>f+w*12+v%12;for(let w=0;w+1<m;w+=1)for(let v=0;v<12;v+=1)l.set([h(w,v),h(w+1,v),h(w+1,v+1),h(w,v),h(w+1,v+1),h(w,v+1)],b),b+=6;let y=f+m*12;for(let w=0;w<12;w+=1)l.set([y,h(0,w+1),h(0,w)],b),l.set([y+1,h(m-1,w),h(m-1,w+1)],b+3),b+=6;u+=m,f+=bu(m)}),{samples:n,segments:o,indices:l,kept:e,sampleCount:s,vertexCount:r,indexCount:a}}var Pw=`
struct Segment { start: u32, count: u32, vertexStart: u32, color: u32, radius: f32, p0: u32, p1: u32, p2: u32 };
struct Vertex { position: vec4f, normal: vec4f };
`,jw=`${Pw}
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
`,Lw=`
struct Globals { viewProjection: mat4x4f, light: vec4f, time: vec4f };
@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<storage, read> colors: array<vec4f>; // rgb, alpha

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
  let n = normalize(input.normal);
  let diffuse = max(dot(n, normalize(globals.light.xyz)), 0.0);
  let hemi = mix(0.35, 0.7, n.z * 0.5 + 0.5);
  let lit = entry.rgb * (hemi + 0.6 * diffuse);
  return vec4f(lit, entry.a);
}
`,mu=96,Oa=class{constructor(e){this.host=e,this.device=e.device,this.counts={segments:0,samples:0,vertices:0,indices:0},this.dirty=!1,this.kept=[];let s=this.device,r=s.createShaderModule({label:"harness-tubes-compute",code:jw});this.computeLayout=s.createBindGroupLayout({label:"harness-tubes-compute",entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},{binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},{binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},{binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},{binding:4,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}}]});let a=s.createPipelineLayout({bindGroupLayouts:[this.computeLayout]});this.framesPipeline=s.createComputePipeline({layout:a,compute:{module:r,entryPoint:"framesMain"}}),this.ringsPipeline=s.createComputePipeline({layout:a,compute:{module:r,entryPoint:"ringsMain"}});let n=s.createShaderModule({label:"harness-tubes-draw",code:Lw});this.drawLayout=s.createBindGroupLayout({label:"harness-tubes-draw",entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}}]}),this.drawPipeline=s.createRenderPipeline({label:"harness-tubes",layout:s.createPipelineLayout({bindGroupLayouts:[this.drawLayout]}),vertex:{module:n,entryPoint:"vs",buffers:[{arrayStride:32,attributes:[{shaderLocation:0,offset:0,format:"float32x4"},{shaderLocation:1,offset:16,format:"float32x4"}]}]},fragment:{module:n,entryPoint:"fs",targets:[{format:e.format,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha",operation:"add"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha",operation:"add"}}}]},primitive:{topology:"triangle-list",cullMode:"none"},depthStencil:e.depthStencilState(),multisample:{count:e.sampleCount}}),this.globals=s.createBuffer({label:"harness-tubes-globals",size:mu,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.countBuffer=s.createBuffer({label:"harness-tubes-counts",size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.buffers={},this.capacity={samples:0,segments:0,vertices:0,indices:0},this.globalScratch=new Float32Array(mu/4)}ensure(e,s,r){let a=this.buffers[e];return a&&a.size>=s?!1:(a?.destroy(),this.buffers[e]=this.device.createBuffer({label:`harness-tubes-${e}`,size:Math.max(256,Math.ceil(s*1.5/4)*4),usage:r}),!0)}setTubes(e,s){let r=gu(e);if(this.kept=r.kept.map(o=>e[o]),this.counts={segments:r.kept.length,samples:r.sampleCount,vertices:r.vertexCount,indices:r.indexCount},!this.counts.segments){this.dirty=!1;return}let a=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,n=!1;n=this.ensure("samples",r.samples.byteLength,a)||n,n=this.ensure("segments",r.segments.byteLength,a)||n,n=this.ensure("frames",r.samples.byteLength,GPUBufferUsage.STORAGE)||n,n=this.ensure("vertices",this.counts.vertices*32,GPUBufferUsage.STORAGE|GPUBufferUsage.VERTEX)||n,this.ensure("indices",r.indices.byteLength,GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST);let i=this.device.queue;i.writeBuffer(this.buffers.samples,0,r.samples),i.writeBuffer(this.buffers.segments,0,r.segments),i.writeBuffer(this.buffers.indices,0,r.indices),i.writeBuffer(this.countBuffer,0,new Uint32Array([this.counts.segments,this.counts.samples,this.counts.vertices,0])),(n||!this.computeGroup)&&(this.computeGroup=this.device.createBindGroup({layout:this.computeLayout,entries:["samples","segments","frames","vertices"].map((o,c)=>({binding:c,resource:{buffer:this.buffers[o]}})).concat([{binding:4,resource:{buffer:this.countBuffer}}])})),this.setColors(s),this.dirty=!0}setColors(e){if(!this.counts.segments)return;let s=new Float32Array(this.counts.segments*4);this.kept.forEach((r,a)=>s.set(e(r),a*4)),(this.ensure("colors",s.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST)||!this.drawGroup||this.drawGroupColors!==this.buffers.colors)&&(this.drawGroup=this.device.createBindGroup({layout:this.drawLayout,entries:[{binding:0,resource:{buffer:this.globals}},{binding:1,resource:{buffer:this.buffers.colors}}]}),this.drawGroupColors=this.buffers.colors),this.device.queue.writeBuffer(this.buffers.colors,0,s)}encodeCompute(e){if(!this.dirty||!this.counts.segments)return;let s=e.beginComputePass({label:"harness-tubes"});s.setBindGroup(0,this.computeGroup),s.setPipeline(this.framesPipeline),s.dispatchWorkgroups(Math.ceil(this.counts.segments/64)),s.setPipeline(this.ringsPipeline),s.dispatchWorkgroups(Math.ceil(this.counts.vertices/64)),s.end(),this.dirty=!1}draw(e,s,r=0){if(!this.counts.segments)return 0;let a=this.globalScratch;return a.fill(0),a.set(s,0),a.set([.35,-.45,.82,0],16),a[20]=r,this.device.queue.writeBuffer(this.globals,0,a),e.setPipeline(this.drawPipeline),e.setBindGroup(0,this.drawGroup),e.setVertexBuffer(0,this.buffers.vertices),e.setIndexBuffer(this.buffers.indices,"uint32"),e.drawIndexed(this.counts.indices),this.counts.indices/3}gpuMemoryBytes(){return Object.values(this.buffers).reduce((e,s)=>e+s.size,0)}dispose(){for(let e of Object.values(this.buffers))e.destroy();this.globals.destroy(),this.countBuffer.destroy(),this.buffers={}}};var Dw=[0,0,0,1,1,1],Fa=class t{static async create(e){return new t(await Qt.create(e))}constructor(e){this.host=e,this.canvas=e.canvas,this.device=e.device,e.alwaysInstanced=!0,e.setOccurrences([]),this.assets=new Map,this.order=[],this.frameStats={triangles:0,draws:0},this.lodThresholds={...Yt},this.tubes=null,this.tubeVersion=0}setTubes(e,s){!e.length&&!this.tubes||(this.tubes??=new Oa(this.host),this.tubes.setTubes(e,s),this.tubeVersion+=1)}setTubeColors(e){this.tubes?.setColors(e),this.tubeVersion+=1}asset(e){let s=this.assets.get(e);return s||(s=new Qt(this.canvas,this.device,{shareFrom:this.host}),s.setLodThresholds(this.lodThresholds),this.assets.set(e,s)),s}standIn(e,s){let r=this.asset(e);return r.standIn||(r.standIn=!0,r.setBoardBounds(Dw),r.setLodOverride(md)),r.boxColor=[...s],r}removeAsset(e){let s=this.assets.get(e);s&&(s.dispose(),this.assets.delete(e))}get renderers(){return this.order.map(e=>this.assets.get(e)).filter(Boolean)}setOccurrences(e){this.order=[...e.keys()].filter(r=>this.assets.has(r));for(let[r,a]of this.assets)e.has(r)||a.setOccurrences([]);for(let r of this.order)this.assets.get(r).setOccurrences(e.get(r));let s=0;for(let r of this.renderers)r.occurrenceBase=s,s+=r.occurrenceCount;this.occurrenceCount=s}locate(e){for(let s of this.renderers){let r=e-s.occurrenceBase;if(r>=0&&r<s.occurrenceCount)return{renderer:s,local:r}}return null}keyOf(e){let s=this.locate(e);return s?s.renderer.occurrenceKeys[s.local]??null:null}setSelectedOccurrence(e){let s=e>=0?this.locate(e):null;for(let r of this.renderers)r.selectedOccurrence=!r.standIn&&s?.renderer===r?s.local:-1}resize(){this.host.resize()}render(e,s){let r=this.host;r.resize();let a=this.renderers.filter(b=>b.occurrenceCount>0),n=new Map(a.map(b=>[b,s(b)])),i=$i(e.viewport,this.canvas);for(let[b,g]of n)yu(b,g),b.analytic&&(b.analytic.viewport=i);let o=this.device.createCommandEncoder(),c=a.filter(b=>b.encodeCull(o,e));this.tubes?.encodeCompute(o);let l=o.beginRenderPass({colorAttachments:[r.colorAttachment(r.context.getCurrentTexture().createView())],depthStencilAttachment:r.depthAttachment()});wu(l,e.viewport,this.canvas);let u=0,f=0;for(let b of a){let g=b.encodeDraws(l,e,n.get(b));u+=g.triangles,f+=g.draws}this.tubes?.counts.segments&&(u+=this.tubes.draw(l,e.matrix,performance.now()/1e3),f+=1),l.end(),this.device.queue.submit([o.finish()]);for(let b of c)b.readCullCounts();this.frameStats={triangles:Math.round(u),draws:f}}pick(e,s,r,a){let n=this.host.pickSerial.then(()=>this.performPick(e,s,r,a));return this.host.pickSerial=n.catch(()=>0),n}async performPick(e,s,r,a){let n=this.host;n.resize();let i=Math.max(0,Math.min(this.canvas.width-1,Math.floor(s))),o=Math.max(0,Math.min(this.canvas.height-1,Math.floor(r)));for(let c of this.renderers){if(c.occurrenceCount===0)continue;let l=a(c);yu(c,l),c.analytic&&(c.analytic.viewport=$i(e.viewport,this.canvas));let u=this.device.createCommandEncoder(),f=u.beginRenderPass({colorAttachments:[{view:n.pickTexture.createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}],depthStencilAttachment:n.depthAttachment(!0)});wu(f,e.viewport,this.canvas),c.encodePick(f,e,l),f.end();let b=await n.readPick(u,i,o,c);if(b.kind==="analytic"||b.occurrenceIndex>=0){let g=b.occurrenceIndex-c.occurrenceBase;return{...b,occurrenceKey:g>=0?c.occurrenceKeys[g]??null:c.occurrenceKeys[0]??null,renderer:c,standIn:!!c.standIn}}}return{occurrenceIndex:-1,occurrenceKey:null,featureId:0,kind:"empty",renderer:null,standIn:!1}}gpuMemoryBytes(){let e=0;for(let s of this.renderers)e+=s.gpuMemoryBytes();return e+=this.tubes?.gpuMemoryBytes()||0,e+=this.host.arenaSlackBytes(),e-Math.max(0,this.renderers.length-1)*this.canvas.width*this.canvas.height*12}gpuMemoryBreakdown(){let e={};for(let[s,r]of this.assets){let a=r.gpuMemoryBreakdown();delete a.targets,e[s]=a}return{assets:e,targets:this.canvas.width*this.canvas.height*12,arena:this.host.arenaStats()}}setLodThresholds(e){this.lodThresholds=Ea({...this.lodThresholds,...e});for(let s of this.assets.values())s.setLodThresholds(this.lodThresholds);return{...this.lodThresholds}}cullCounts(){let e={full:0,board:0,body:0,box:0,culled:0};for(let s of this.renderers)if(s.occurrenceCount)for(let r of Object.keys(e))e[r]+=s.cullCounts[r]||0;return e}dispose(){this.tubes?.dispose(),this.tubes=null;for(let e of[...this.assets.keys()])this.removeAsset(e);this.host.dispose(),this.host.context?.unconfigure?.(),this.device.destroy?.()}};function yu(t,e){e?.layerOffsets&&t.device.queue.writeBuffer(t.layerOffsetBuffer,0,e.layerOffsets)}function $i(t,e){let s=Math.max(0,Math.min(e.width-1,Math.floor(t.x))),r=Math.max(0,Math.min(e.height-1,Math.floor(t.y))),a=Math.max(1,Math.min(e.width-s,Math.floor(t.width))),n=Math.max(1,Math.min(e.height-r,Math.floor(t.height)));return{x:s,y:r,width:a,height:n}}function wu(t,e,s){let r=$i(e,s);t.setViewport(r.x,r.y,r.width,r.height,0,1),t.setScissorRect(r.x,r.y,r.width,r.height)}var Uw=`
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
}`,zw=`
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
}`,Gw=`
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
}`,Kw=`
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
}`,Vw=`
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
}`,Hw=`
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
}`,qw=`
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
}`,Ww=6.2,Xw=4.6,$w=3.8,ja=4*1024*1024,Yw=Math.floor(ja/6),vu=Yw*6,Pa=512*1024,xu=512*1024,ku=96,Jw=96,Qw=18,Eu=96*1024*1024,Zw=2,Ua=class t{static async create(e,s){if(!navigator.gpu)throw new Error("WebGPU is unavailable in this browser");let r=await navigator.gpu.requestAdapter({powerPreference:"high-performance"});if(!r)throw new Error("No WebGPU adapter is available");let a=await r.requestDevice(),n=await fetch(s,{cache:"default"});if(!n.ok)throw new Error(`Failed to load schematic manifest: ${n.status}`);let i=await n.json();if(!["prism.schematic_world_a0","prism.schematic_vector_a0"].includes(i.schema))throw new Error(`Unsupported schematic scene schema: ${i.schema}`);let o=i.featureTable||i.features,c=await fetch(new URL(o,s),{cache:"default"});if(!c.ok)throw new Error(`Failed to load schematic features: ${c.status}`);let l=tv(await c.json());return new t(e,a,s,i,l)}constructor(e,s,r,a,n){this.canvas=e,this.device=s,this.manifestUrl=r,this.manifest=a,this.isNativeScene=a.schema==="prism.schematic_vector_a0",this.pages=a.pages||[],this.featuresByPage=n,this.featuresById=new Map;for(let g of Object.values(n))for(let p of g)this.featuresById.set(Number(p.id),p);this.context=e.getContext("webgpu"),this.format=navigator.gpu.getPreferredCanvasFormat(),this.context.configure({device:s,format:this.format,alphaMode:"opaque"}),this.flowCanvas=null,this.flowContext=null,this.globalBuffer=s.createBuffer({size:48,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.bindGroupLayout=s.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:2,visibility:GPUShaderStage.FRAGMENT,sampler:{type:"filtering"}},{binding:3,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:"float"}}]});let i=s.createShaderModule({code:Uw});this.pagePipeline=s.createRenderPipeline({layout:s.createPipelineLayout({bindGroupLayouts:[this.bindGroupLayout]}),vertex:{module:i,entryPoint:"vs"},fragment:{module:i,entryPoint:"fs",targets:[{format:this.format}]},primitive:{topology:"triangle-list"}}),this.edgeLayout=s.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}}]});let o=s.createShaderModule({code:zw});this.edgePipeline=s.createRenderPipeline({layout:s.createPipelineLayout({bindGroupLayouts:[this.edgeLayout]}),vertex:{module:o,entryPoint:"vs",buffers:[{arrayStride:8,attributes:[{shaderLocation:0,offset:0,format:"float32x2"}]}]},fragment:{module:o,entryPoint:"fs",targets:[{format:this.format,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"line-list"}}),this.edgeBindGroup=s.createBindGroup({layout:this.edgeLayout,entries:[{binding:0,resource:{buffer:this.globalBuffer}}]});let c=s.createShaderModule({code:Gw});this.highlightPipeline=s.createRenderPipeline({layout:s.createPipelineLayout({bindGroupLayouts:[this.edgeLayout]}),vertex:{module:c,entryPoint:"vs",buffers:[{arrayStride:8,attributes:[{shaderLocation:0,offset:0,format:"float32x2"}]}]},fragment:{module:c,entryPoint:"fs",targets:[{format:this.format,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"line-list"}}),this.highlightBufferSize=4*1024*1024,this.highlightBuffer=s.createBuffer({size:this.highlightBufferSize,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});let l=s.createShaderModule({code:Kw});this.netFlowPipeline=s.createRenderPipeline({layout:s.createPipelineLayout({bindGroupLayouts:[this.edgeLayout]}),vertex:{module:l,entryPoint:"vs",buffers:[{arrayStride:16,attributes:[{shaderLocation:0,offset:0,format:"float32x2"},{shaderLocation:1,offset:8,format:"float32x2"}]}]},fragment:{module:l,entryPoint:"fs",targets:[{format:this.format,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"triangle-list"}}),this.netFlowBuffer=s.createBuffer({size:xu*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),this.globalUniformScratch=new Float32Array(12),this.pageUniformScratch=new Float32Array(8),this.imageUniformScratch=new Float32Array(8),this.vectorScratch=new Float32Array(ja),this.highlightScratch=new Float32Array(this.highlightBufferSize/4),this.netFlowScratch=new Float32Array(xu),this.netTrackingCache=null,this.selectedIntrasheetLinkIndex=-1,this.truncatedHighlightCount=0,this.truncatedVectorCount=0,this.frameSerial=0,this.querySerial=0;let u=s.createShaderModule({code:Vw});this.vectorPipeline=s.createRenderPipeline({layout:s.createPipelineLayout({bindGroupLayouts:[this.edgeLayout]}),vertex:{module:u,entryPoint:"vs",buffers:[{arrayStride:24,attributes:[{shaderLocation:0,offset:0,format:"float32x2"},{shaderLocation:1,offset:8,format:"float32x4"}]}]},fragment:{module:u,entryPoint:"fs",targets:[{format:this.format,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"triangle-list"}}),this.vectorBuffer=s.createBuffer({size:ja*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),this.vectorBuffers=[this.vectorBuffer];let f=s.createShaderModule({code:Hw});this.imagePipeline=s.createRenderPipeline({layout:s.createPipelineLayout({bindGroupLayouts:[this.bindGroupLayout]}),vertex:{module:f,entryPoint:"vs"},fragment:{module:f,entryPoint:"fs",targets:[{format:this.format,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"triangle-list"}});let b=s.createShaderModule({code:qw});this.pickPipeline=s.createRenderPipeline({layout:s.createPipelineLayout({bindGroupLayouts:[this.edgeLayout]}),vertex:{module:b,entryPoint:"vs",buffers:[{arrayStride:12,attributes:[{shaderLocation:0,offset:0,format:"float32x2"},{shaderLocation:1,offset:8,format:"uint32"}]}]},fragment:{module:b,entryPoint:"fs",targets:[{format:"r32uint"}]},primitive:{topology:"triangle-list"}}),this.pickVertexBuffer=s.createBuffer({size:Pa*12,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),this.pickReadBuffer=s.createBuffer({size:256,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST}),this.pickTexture=null,this.pickTextureSize=[0,0],this.pickPending=!1,this.vectorChunks=new Map,this.failedVectorChunks=new Map,this.nativeDetailState=new Map,this.domDetailPageIds=new Set,this.nativeDetailThresholds=new Map,this.residentVectorBytes=0,this.sampler=s.createSampler({magFilter:"linear",minFilter:"linear",mipmapFilter:"linear"}),this.placeholder=this.createSolidTexture([245,247,249,255]),this.pageResources=new Map,this.imageResources=new Map,this.loading=new Map,this.selectedPageId="",this.selectedFeatureId=0,this.activeNetUid="",this.showHierarchy=!0,this.downloadedBytes=0,this.world=a.worldBoundsMm,this.center=[(this.world.minX+this.world.maxX)/2,(this.world.minY+this.world.maxY)/2],this.scale=Math.max((this.world.maxX-this.world.minX)/900,(this.world.maxY-this.world.minY)/650,.1)*1.16,this.edgeBuffer=this.createEdgeBuffer();for(let g of this.pages)this.createPageResource(g)}createSolidTexture(e){let s=this.device.createTexture({size:[1,1],format:"rgba8unorm-srgb",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});return this.device.queue.writeTexture({texture:s},new Uint8Array(e),{bytesPerRow:4},[1,1]),s}createPageResource(e){let s=this.device.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),r={page:e,uniform:s,texture:this.placeholder,textureWidth:0,svgBlob:null,bindGroup:null};this.pageResources.set(e.id,r),this.updateBindGroup(r)}createImageResource(e){let s=this.device.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),r={path:e,uniform:s,texture:this.placeholder,loaded:!1,bindGroup:null};return this.imageResources.set(e,r),this.updateBindGroup(r),r}updateBindGroup(e){e.bindGroup=this.device.createBindGroup({layout:this.bindGroupLayout,entries:[{binding:0,resource:{buffer:this.globalBuffer}},{binding:1,resource:{buffer:e.uniform}},{binding:2,resource:this.sampler},{binding:3,resource:e.texture.createView()}]})}async loadImageTexture(e){let s=this.imageResources.get(e)||this.createImageResource(e);if(s.loaded)return s;let r=`image:${e}`;if(this.loading.has(r))return this.loading.get(r);let a=(async()=>{try{let n=await fetch(new URL(e,this.manifestUrl),{cache:"default"});if(!n.ok)throw new Error(`Failed to load schematic image ${e}: ${n.status}`);let i=await n.blob(),o=await createImageBitmap(i),c=this.device.createTexture({size:[o.width,o.height],format:"rgba8unorm-srgb",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});this.device.queue.copyExternalImageToTexture({source:o},{texture:c},[o.width,o.height]),o.close(),s.texture!==this.placeholder&&s.texture.destroy(),s.texture=c,s.loaded=!0,this.updateBindGroup(s)}finally{this.loading.delete(r)}return s})();return this.loading.set(r,a),a}createEdgeBuffer(){let e=new Map(this.pages.map(n=>[n.id,n])),s=[];for(let n of this.manifest.edges||[]){let i=e.get(n.source),o=e.get(n.target);!i||!o||s.push(i.worldX+i.widthMm/2,i.worldY+i.heightMm,o.worldX+o.widthMm/2,o.worldY)}let r=new Float32Array(s);if(!r.length)return null;let a=this.device.createBuffer({size:r.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});return this.device.queue.writeBuffer(a,0,r),{buffer:a,count:r.length/2}}resize(){let e=Math.min(devicePixelRatio||1,2),s=Math.max(1,Math.floor(this.canvas.clientWidth*e)),r=Math.max(1,Math.floor(this.canvas.clientHeight*e));(this.canvas.width!==s||this.canvas.height!==r)&&(this.canvas.width=s,this.canvas.height=r),this.flowCanvas&&(this.flowCanvas.width!==s||this.flowCanvas.height!==r)&&(this.flowCanvas.width=s,this.flowCanvas.height=r)}setFlowOverlayCanvas(e){e&&(this.flowCanvas=e,this.flowContext=e.getContext("webgpu"),this.flowContext.configure({device:this.device,format:this.format,alphaMode:"premultiplied"}))}writeGlobals(){let e=this.globalUniformScratch;e[0]=this.center[0],e[1]=this.center[1],e[2]=this.scale,e[3]=performance.now()*.001,e[4]=this.canvas.width,e[5]=this.canvas.height,this.device.queue.writeBuffer(this.globalBuffer,0,e)}pagePixelWidth(e){return e.widthMm/this.scale}pageSourcePixelsPerMm(e){let s=this.pagePixelWidth(e)/Math.max(1,e.sourceWidthMm||e.widthMm),r=e.heightMm/this.scale/Math.max(1,e.sourceHeightMm||e.heightMm);return Math.min(s,r)}pageNativeDetailThresholds(e){let s=this.nativeDetailThresholds.get(e.id);if(s)return s;let r=Math.max(1,e.sourceWidthMm||e.widthMm),a=Math.max(1,e.sourceHeightMm||e.heightMm),n=r*a,i=Math.max(0,e.featureCount||e.featureIds?.length||0)/Math.max(1,n),o=de(1-i*72,.84,1.08),c=de(Math.sqrt(Math.max(r,a)/Math.max(1,Math.min(r,a)))/1.18,.92,1.14),l=de(Ww*o*c,5,7.4),u={enter:l,exit:de(Math.min(l-1.2,Xw*o),3.8,l-.7),prefetch:de(Math.min(l-2,$w*o),3,l-1)};return this.nativeDetailThresholds.set(e.id,u),u}pageWantsNativeDetail(e){if(!this.pageHasNativeDetail(e))return!1;let s=this.pageSourcePixelsPerMm(e),r=this.nativeDetailState.get(e.id)===!0,a=this.pageNativeDetailThresholds(e),n=r?a.exit:a.enter,i=s>=n;return i!==r&&this.nativeDetailState.set(e.id,i),i}pageNativeDetailReady(e){if(this.domDetailPageIds.has(e.id)||!this.pageWantsNativeDetail(e))return!1;let s=this.vectorChunks.get(e.id);return!s?.loaded||!s.segments?.length&&!s.fills?.length?!1:this.visibleNativeImagesReady(e,s)}visibleNativeImagesReady(e,s){if(!s?.images?.length)return!0;let r=this.sourceViewportBounds(e,4),a=!0;for(let n of s.images){if(!xt(n.bounds,r))continue;(this.imageResources.get(n.path)||this.createImageResource(n.path)).loaded||(a=!1,this.loadImageTexture(n.path).catch(()=>{}))}return a}visiblePages(){let e=this.canvas.width*this.scale/2,s=this.canvas.height*this.scale/2,r=this.center[0]-e,a=this.center[0]+e,n=this.center[1]-s,i=this.center[1]+s;return this.pages.filter(o=>o.worldX+o.widthMm>=r&&o.worldX<=a&&o.worldY+o.heightMm>=n&&o.worldY<=i)}worldViewportBounds(e=0){let s=this.canvas.width*this.scale/2,r=this.canvas.height*this.scale/2;return[this.center[0]-s-e,this.center[1]-r-e,this.center[0]+s+e,this.center[1]+r+e]}sourceViewportBounds(e,s=2.5){let r=this.worldViewportBounds(this.scale*8),a=(r[0]-e.worldX)/e.widthMm*e.sourceWidthMm-s,n=(r[1]-e.worldY)/e.heightMm*e.sourceHeightMm-s,i=(r[2]-e.worldX)/e.widthMm*e.sourceWidthMm+s,o=(r[3]-e.worldY)/e.heightMm*e.sourceHeightMm+s;return[Math.max(-s,Math.min(a,i)),Math.max(-s,Math.min(n,o)),Math.min(e.sourceWidthMm+s,Math.max(a,i)),Math.min(e.sourceHeightMm+s,Math.max(n,o))]}render(){this.frameSerial+=1,this.resize(),this.writeGlobals();let e=this.visiblePages(),s=this.device.createCommandEncoder(),r=s.beginRenderPass({colorAttachments:[{view:this.context.getCurrentTexture().createView(),clearValue:{r:.045,g:.055,b:.073,a:1},loadOp:"clear",storeOp:"store"}]});this.showHierarchy&&this.edgeBuffer&&(r.setPipeline(this.edgePipeline),r.setBindGroup(0,this.edgeBindGroup),r.setVertexBuffer(0,this.edgeBuffer.buffer),r.draw(this.edgeBuffer.count)),r.setPipeline(this.pagePipeline);for(let i of e){let o=this.pageResources.get(i.id),c=this.activeNetUid&&i.netUids.includes(this.activeNetUid),l=this.domDetailPageIds.has(i.id),u=!l&&this.pageNativeDetailReady(i),f=this.pageUniformScratch;f[0]=i.worldX,f[1]=i.worldY,f[2]=i.widthMm,f[3]=i.heightMm,f[4]=i.id===this.selectedPageId?1:0,f[5]=c?1:0,f[6]=this.activeNetUid?1:0,f[7]=u||l?1:0,this.device.queue.writeBuffer(o.uniform,0,f),r.setBindGroup(0,o.bindGroup),r.draw(6);let b=de(Math.ceil(this.pagePixelWidth(i)*1.3/512)*512,512,6144);o.textureWidth<b*.82&&this.loadPageTexture(i,b).catch(()=>{})}this.scheduleVisibleVectorLoads(e),this.drawVisibleImages(r,e),this.drawVisibleVectors(r,e);let a=this.writeNetTrackingOverlay();a&&!this.flowContext&&(r.setPipeline(this.netFlowPipeline),r.setBindGroup(0,this.edgeBindGroup),r.setVertexBuffer(0,this.netFlowBuffer),r.draw(a));let n=this.writeNetHighlights(e);return n&&(r.setPipeline(this.highlightPipeline),r.setBindGroup(0,this.edgeBindGroup),r.setVertexBuffer(0,this.highlightBuffer),r.draw(n)),r.end(),this.device.queue.submit([s.finish()]),this.renderFlowOverlay(a),this.evictVectorChunks(e),e}renderFlowOverlay(e){if(!this.flowContext)return;let s=this.device.createCommandEncoder(),r=s.beginRenderPass({colorAttachments:[{view:this.flowContext.getCurrentTexture().createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}]});e&&(r.setPipeline(this.netFlowPipeline),r.setBindGroup(0,this.edgeBindGroup),r.setVertexBuffer(0,this.netFlowBuffer),r.draw(e)),r.end(),this.device.queue.submit([s.finish()])}drawVisibleImages(e,s){if(!this.isNativeScene)return;let r=!1;for(let a of s){if(this.domDetailPageIds.has(a.id)||!this.pageNativeDetailReady(a))continue;let n=this.vectorChunks.get(a.id);if(!n?.images?.length)continue;let i=this.sourceViewportBounds(a,4);for(let o of n.images){if(!xt(o.bounds,i))continue;let c=this.imageResources.get(o.path)||this.createImageResource(o.path);c.loaded||this.loadImageTexture(o.path).catch(()=>{});let l=o.worldOrigin||this.sourceToWorld(a,[o.xMm,o.yMm]),u=o.worldSize||this.sourceSizeToWorld(a,o.widthMm,o.heightMm),f=this.imageUniformScratch;f[0]=l[0],f[1]=l[1],f[2]=u[0],f[3]=u[1],f[4]=0,f[5]=0,f[6]=0,f[7]=0,this.device.queue.writeBuffer(c.uniform,0,f),r||(e.setPipeline(this.imagePipeline),r=!0),e.setBindGroup(0,c.bindGroup),e.draw(6)}}}drawVisibleVectors(e,s){if(!this.isNativeScene)return 0;let r=this.vectorScratch,a=0,n=0,i=0,o=0,c=!1,l=()=>{if(!a)return;let f=this.vectorBuffers[o];f||(f=this.device.createBuffer({size:ja*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),this.vectorBuffers.push(f)),this.device.queue.writeBuffer(f,0,r,0,a),c||(e.setPipeline(this.vectorPipeline),e.setBindGroup(0,this.edgeBindGroup),c=!0);let b=Math.floor(a/6);e.setVertexBuffer(0,f),e.draw(b),i+=b,o+=1,a=0},u=f=>f>vu||f>r.length?(n+=1,!1):((a+f>vu||a+f>r.length)&&l(),!0);for(let f of s){if(this.domDetailPageIds.has(f.id)||!this.pageHasNativeDetail(f))continue;let b=this.vectorChunks.get(f.id);if(!b?.segments?.length&&!b?.fills?.length||!this.pageNativeDetailReady(f))continue;b.lastUsedFrame=this.frameSerial;let g=this.sourceViewportBounds(f),p=Su(b.spatial,g);for(let d of p.fills){if(!xt(d.bounds,g)||!u(18))continue;let m=this.featuresById.get(d.featureId),h=this.activeNetUid&&m?.netUid===this.activeNetUid,w=this.selectedFeatureId===d.featureId?[.24,.58,1,1]:h?[.06,1,.24,1]:this.activeNetUid&&ur(m)?Iu(m,d.kind,d.color):Zi(m,d.kind,d.color),v=d.worldPoints||d.points.map(x=>this.sourceToWorld(f,x));a=yv(r,a,v[0],v[1],v[2],w)}for(let d of p.segments){if(!xt(d.bounds,g))continue;let m=this.featuresById.get(d.featureId),h=this.activeNetUid&&m?.netUid===this.activeNetUid,y=this.selectedFeatureId===d.featureId,w=y?[.24,.58,1,1]:h?[.06,1,.24,1]:this.activeNetUid&&ur(m)?Iu(m,d.kind,d.color):Zi(m,d.kind,d.color),v=this.segmentWorldWidth(f,d,m,h||y);for(let x of this.visibleSegmentParts(f,d,m)){if(!u(36))continue;let S=x.worldA||this.sourceToWorld(f,x.a),T=x.worldB||this.sourceToWorld(f,x.b);a=mv(r,a,S,T,v,w)}}}return l(),this.truncatedVectorCount=n,this.vectorTruncated=n>0,this.lastVectorVertices=i,this.lastVectorChunks=o,i}pageHasNativeDetail(e){return this.isNativeScene?e?.nativeDetail?.enabled!==!1:!1}scheduleVisibleVectorLoads(e){if(!this.isNativeScene)return;let s=[...this.vectorChunks.values()].filter(n=>n?.promise&&!n.loaded).length,r=Math.max(0,Zw-s);if(!r)return;let a=e.filter(n=>!this.domDetailPageIds.has(n.id)).filter(n=>this.pageHasNativeDetail(n)&&this.pageSourcePixelsPerMm(n)>=this.pageNativeDetailThresholds(n).prefetch).filter(n=>!this.vectorChunks.get(n.id)?.loaded&&!this.vectorChunks.get(n.id)?.promise).sort((n,i)=>{let o=Math.hypot(n.worldX+n.widthMm/2-this.center[0],n.worldY+n.heightMm/2-this.center[1]),c=Math.hypot(i.worldX+i.widthMm/2-this.center[0],i.worldY+i.heightMm/2-this.center[1]);return o-c});for(let n of a)if(this.loadPageVectors(n).catch(()=>{}),r-=1,!r)break}featurePrimitiveBounds(e,s){let r=this.vectorChunks.get(e.id);if(!r?.segments?.length&&!r?.fills?.length)return null;let a=[],n=[];for(let i of r.segments||[])i.featureId===s&&(a.push(i.a[0],i.b[0]),n.push(i.a[1],i.b[1]));for(let i of r.fills||[])if(i.featureId===s)for(let o of i.points||[])a.push(o[0]),n.push(o[1]);return a.length?[Math.min(...a),Math.min(...n),Math.max(...a),Math.max(...n)]:null}symbolClipBounds(e){if(this._symbolClipBounds||(this._symbolClipBounds=new Map),this._symbolClipBounds.has(e.id))return this._symbolClipBounds.get(e.id);let s=(this.featuresByPage[e.id]||[]).filter(r=>r?.kind==="symbol_body"&&r.boundsMm&&!String(r.sourceId||"").includes(":overplot")).map(r=>{let a=this.featurePrimitiveBounds(e,r.id)||r.boundsMm;return[a[0]-.02,a[1]-.02,a[2]+.02,a[3]+.02]}).filter(r=>{let a=r[2]-r[0],n=r[3]-r[1];return Math.max(a,n)<=12&&a*n<=80});return this._symbolClipBounds.set(e.id,s),s}visibleSegmentParts(e,s,r){if(s._visibleParts)return s._visibleParts;let a=String(r?.kind||""),n=String(r?.semanticRole||"");if(a!=="wire"&&n!=="wire")return s._visibleParts=[s],s._visibleParts;let i=[s];for(let o of this.symbolClipBounds(e)){let c=[];for(let l of i)c.push(...xv(l,o));if(i=c,!i.length)break}for(let o of i)o.worldA=Ts(e,o.a),o.worldB=Ts(e,o.b);return s._visibleParts=i,s._visibleParts}netTrackingSegments(){if(!this.activeNetUid)return{netUid:"",anchorsByPage:new Map,segments:[],intrasheetSegments:[]};let e=Number(this.selectedFeatureId||0),s=String(this.selectedFeatureKey||""),r=String(this.selectedSourceId||"");if(this.netTrackingCache?.netUid===this.activeNetUid&&this.netTrackingCache?.selectedFeatureId===e&&this.netTrackingCache?.selectedFeatureKey===s&&this.netTrackingCache?.selectedSourceId===r)return this.netTrackingCache;this.selectedIntrasheetLinkIndex=-1;let a=new Map(this.pages.map(p=>[p.id,p])),n=this.manifest.netToPages?.[this.activeNetUid]||[],i=n.length?n.map(p=>a.get(p)).filter(Boolean):this.pages.filter(p=>p.netUids?.includes(this.activeNetUid)),o=new Map;for(let p of i.slice(0,Jw)){let d=this.netTrackingAnchorsForPage(p);d.length&&o.set(p.id,d)}let c=[],l=[];for(let[p,d]of o){let m=Au(hv(d),"intrasheet",p);c.push(...m),l.push(...m)}let u=[...o.entries()].map(([p,d])=>pv(a.get(p),d,{featureId:e,stableKey:s,sourceId:r})).filter(Boolean);c.push(...Au(u,"intersheet",""));let f=l.map((p,d)=>({...p,intrasheetIndex:d})),b=0,g=c.map((p,d)=>{if(p.type!=="intrasheet")return{...p,id:d};let m=b;return b+=1,{...p,id:d,intrasheetIndex:m}});return this.netTrackingCache={netUid:this.activeNetUid,selectedFeatureId:e,selectedFeatureKey:s,selectedSourceId:r,anchorsByPage:o,segments:g,intrasheetSegments:f},this.selectedIntrasheetLinkIndex>=this.netTrackingCache.intrasheetSegments.length&&(this.selectedIntrasheetLinkIndex=-1),this.netTrackingCache}netTrackingAnchorsForPage(e){let s=this.featuresByPage[e.id]||[],r=[];for(let a of s){if(a.netUid!==this.activeNetUid||!a.boundsMm||!uv(a))continue;let n=a.boundsMm,i=[(n[0]+n[2])/2,(n[1]+n[3])/2],o=this.sourceToWorld(e,i);r.push({pageId:e.id,featureId:Number(a.id||0),stableKey:String(a.stableKey||""),sourceId:String(a.sourceId||a.sourceUid||a.objectId||""),kind:a.kind||a.semanticRole||"",source:i,world:o,bounds:n,priority:fv(a)})}return r.sort((a,n)=>n.priority-a.priority||a.source[1]-n.source[1]||a.source[0]-n.source[0]),r}writeNetTrackingOverlay(){let e=this.netTrackingSegments();if(this.lastNetFlowSegments=e.segments.length,this.lastNetFlowIntrasheetSegments=e.intrasheetSegments.length,!e.segments.length)return this.lastNetFlowVertices=0,0;let s=this.worldViewportBounds(this.scale*96),r=this.netFlowScratch,a=0,n=0;for(let i of e.segments){if(!xt(_u(i),s))continue;let o=i.type==="intrasheet"&&i.intrasheetIndex===this.selectedIntrasheetLinkIndex,c=o?9.5:i.type==="intersheet"?8:4.8,l=o?2:i.type==="intersheet"?1:0,u=wv(r,a,i.a,i.b,c*this.scale,l,n,this.scale);if(u!==a&&(a=u,n+=Math.hypot(i.b[0]-i.a[0],i.b[1]-i.a[1])/Math.max(this.scale,1e-6),a+24>r.length))break}return a?(this.device.queue.writeBuffer(this.netFlowBuffer,0,r,0,a),this.lastNetFlowVertices=a/4,a/4):(this.lastNetFlowVertices=0,0)}cycleNetIntrasheetLink(e=1){let s=this.netTrackingSegments();if(!s.intrasheetSegments.length)return null;let r=s.intrasheetSegments.length;this.selectedIntrasheetLinkIndex=(this.selectedIntrasheetLinkIndex+e+r)%r;let a=s.intrasheetSegments[this.selectedIntrasheetLinkIndex];if(!a)return null;let n=_u(a,14*this.scale);return this.center=[(n[0]+n[2])/2,(n[1]+n[3])/2],this.scale=Math.max((n[2]-n[0])/Math.max(1,this.canvas.width*.36),(n[3]-n[1])/Math.max(1,this.canvas.height*.3),this.scale*.35,.025),{pageId:a.pageId,segment:a}}writeNetHighlights(e){if(!this.activeNetUid)return 0;let s=this.highlightScratch,r=0,a=0;for(let n of e){let i=this.sourceViewportBounds(n,5);for(let o of this.featuresByPage[n.id]||[]){if(o.netUid!==this.activeNetUid||!o.boundsMm||!xt(o.boundsMm,i))continue;let c=this.featureWorldBounds(n,o.boundsMm);if(r+16>s.length){a+=1;continue}s[r++]=c[0],s[r++]=c[1],s[r++]=c[2],s[r++]=c[1],s[r++]=c[2],s[r++]=c[1],s[r++]=c[2],s[r++]=c[3],s[r++]=c[2],s[r++]=c[3],s[r++]=c[0],s[r++]=c[3],s[r++]=c[0],s[r++]=c[3],s[r++]=c[0],s[r++]=c[1]}}return this.truncatedHighlightCount=a,r?(this.device.queue.writeBuffer(this.highlightBuffer,0,s,0,r),r/2):0}featureWorldBounds(e,s){return[e.worldX+s[0]/e.sourceWidthMm*e.widthMm,e.worldY+s[1]/e.sourceHeightMm*e.heightMm,e.worldX+s[2]/e.sourceWidthMm*e.widthMm,e.worldY+s[3]/e.sourceHeightMm*e.heightMm]}sourceToWorld(e,s){return[e.worldX+s[0]/e.sourceWidthMm*e.widthMm,e.worldY+s[1]/e.sourceHeightMm*e.heightMm]}sourceSizeToWorld(e,s,r){return[s/e.sourceWidthMm*e.widthMm,r/e.sourceHeightMm*e.heightMm]}async loadPageVectors(e){if(!this.pageHasNativeDetail(e)||!e.chunks?.lod2)return null;let s=this.vectorChunks.get(e.id);if(s?.loaded)return s;if(s?.promise)return s.promise;let r=(async()=>{try{let a=await fetch(new URL(e.chunks.lod2,this.manifestUrl));if(!a.ok)throw new Error(`Failed to load schematic vector chunk ${e.id}: ${a.status}`);let n=await a.json(),i=sv(n.primitives||[]);rv(e,i);let c=JSON.stringify(n).length,l={loaded:!0,segments:i.segments,fills:i.fills,images:i.images,spatial:dv(i),unsupported:n.unsupported||[],bytes:c,lastUsedFrame:this.frameSerial};return this.vectorChunks.set(e.id,l),this.failedVectorChunks.delete(e.id),this.residentVectorBytes+=c,l}catch(a){let n=this.failedVectorChunks.get(e.id)||{count:0,message:""};throw this.failedVectorChunks.set(e.id,{count:n.count+1,message:a?.message||String(a)}),this.vectorChunks.delete(e.id),a}})();return this.vectorChunks.set(e.id,{loaded:!1,promise:r,segments:[]}),r}evictVectorChunks(e){if(this.residentVectorBytes<=Eu)return;let s=new Set(e.map(a=>a.id)),r=[...this.vectorChunks.entries()].filter(([,a])=>a?.loaded).filter(([a])=>!s.has(a)&&a!==this.selectedPageId).sort((a,n)=>(a[1].lastUsedFrame||0)-(n[1].lastUsedFrame||0));for(let[a,n]of r)if(this.vectorChunks.delete(a),this.residentVectorBytes=Math.max(0,this.residentVectorBytes-(n.bytes||0)),this.residentVectorBytes<=Eu*.82)break}stats(){let e=this.visiblePages(),s=e.map(a=>this.pageSourcePixelsPerMm(a)),r=e.map(a=>this.pageNativeDetailThresholds(a).enter);return{residentVectorBytes:this.residentVectorBytes,vectorChunks:[...this.vectorChunks.values()].filter(a=>a?.loaded).length,vectorLoads:[...this.vectorChunks.values()].filter(a=>a?.promise&&!a.loaded).length,failedVectorChunks:this.failedVectorChunks.size,vectorVertices:this.lastVectorVertices||0,vectorDrawChunks:this.lastVectorChunks||0,truncatedVectors:this.truncatedVectorCount||0,nativeDetailPages:[...this.nativeDetailState.values()].filter(Boolean).length,nativePxPerMm:Number((Math.max(0,...s)||0).toFixed(2)),nativeThresholdPxPerMm:Number((r.length?Math.min(...r):0).toFixed(2)),domDetailPages:this.domDetailPageIds.size,netFlowSegments:this.lastNetFlowSegments||0,netFlowIntrasheetSegments:this.lastNetFlowIntrasheetSegments||0,netFlowVertices:this.lastNetFlowVertices||0}}setDomDetailPageIds(e){this.domDetailPageIds=new Set(e||[])}async loadPageTexture(e,s){let r=`${e.id}:${s}`;if(this.loading.has(r))return this.loading.get(r);let a=this.pageResources.get(e.id);if(!a||a.textureWidth>=s)return;let n=(async()=>{if(!a.svgBlob){let c=await fetch(new URL(ev(e),this.manifestUrl));if(!c.ok)throw new Error(`Failed to load schematic page ${e.name}: ${c.status}`);a.svgBlob=await c.blob(),this.downloadedBytes+=a.svgBlob.size}let i=a.svgBlob,o=URL.createObjectURL(i);try{let c=new Image;if(c.decoding="async",c.src=o,await c.decode(),a.textureWidth>=s)return;let l=Math.max(64,Math.round(s*e.heightMm/e.widthMm)),u=new OffscreenCanvas(s,l),f=u.getContext("2d",{alpha:!1});f.fillStyle="#ffffff",f.fillRect(0,0,s,l),f.drawImage(c,0,0,s,l);let b=await createImageBitmap(u),g=this.device.createTexture({size:[s,l],format:"rgba8unorm-srgb",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});this.device.queue.copyExternalImageToTexture({source:b},{texture:g},[s,l]),b.close(),a.texture!==this.placeholder&&a.texture.destroy(),a.texture=g,a.textureWidth=s,this.updateBindGroup(a)}finally{URL.revokeObjectURL(o),this.loading.delete(r)}})();return this.loading.set(r,n),n}preloadOverview(){let e=[...this.pages],s=async()=>{for(;e.length;){let r=e.shift();await this.loadPageTexture(r,512).catch(()=>{})}};return Promise.all(Array.from({length:Math.min(4,e.length)},s))}screenToWorld(e,s){let r=this.canvas.getBoundingClientRect(),a=(e-r.left)*this.canvas.width/r.width,n=(s-r.top)*this.canvas.height/r.height;return[this.center[0]+(a-this.canvas.width/2)*this.scale,this.center[1]+(n-this.canvas.height/2)*this.scale]}worldToScreen(e,s){let r=this.canvas.clientWidth/this.canvas.width,a=this.canvas.clientHeight/this.canvas.height;return[((e-this.center[0])/this.scale+this.canvas.width/2)*r,((s-this.center[1])/this.scale+this.canvas.height/2)*a]}hitPage(e,s){let[r,a]=this.screenToWorld(e,s);return[...this.pages].reverse().find(n=>r>=n.worldX&&r<=n.worldX+n.widthMm&&a>=n.worldY&&a<=n.worldY+n.heightMm)||null}async pickFeature(e,s){if(!this.isNativeScene)return this.hitFeature(e,s);let r=this.hitPage(e,s);if(!r)return null;if(!this.pageHasNativeDetail(r))return this.hitFeature(e,s);await this.loadPageVectors(r);let a=await this.gpuPickFeature(r,e,s);return a&&!dr(a)?{page:r,feature:a,source:this.clientToSource(r,e,s),native:!0,gpu:!0}:this.hitFeature(e,s)}hitFeature(e,s){let r=this.hitPage(e,s);if(!r)return null;let[a,n]=this.clientToSource(r,e,s),i=Math.max(.45,5*this.scale*this.canvas.width/Math.max(1,this.canvas.clientWidth)*r.sourceWidthMm/r.widthMm),o=this.hitResidentVectorFeature(r,a,n,i);if(o)return{page:r,feature:o,source:[a,n],native:!0};let c=this.hitSymbolInterior(r,a,n);if(c)return{page:r,feature:c,source:[a,n],native:!0,interior:!0};let l=(this.featuresByPage[r.id]||[]).filter(u=>{if(dr(u))return!1;let f=u.boundsMm;return f&&a>=f[0]-i&&a<=f[2]+i&&n>=f[1]-i&&n<=f[3]+i}).map(u=>({feature:u,priority:lr(u),area:Math.max(1e-4,(u.boundsMm[2]-u.boundsMm[0])*(u.boundsMm[3]-u.boundsMm[1]))})).sort((u,f)=>f.priority-u.priority||u.area-f.area);return{page:r,feature:l[0]?.feature||null,source:[a,n]}}hitSymbolInterior(e,s,r){let a=null;for(let n of this.featuresByPage[e.id]||[]){let i=String(n?.kind||"");if(i!=="symbol_body"&&i!=="symbol_instance"||String(n?.sourceId||"").includes(":overplot"))continue;let o=n.boundsMm;if(!o||s<o[0]||s>o[2]||r<o[1]||r>o[3])continue;let c=Math.max(1e-4,(o[2]-o[0])*(o[3]-o[1])),l=(i==="symbol_body"?0:1e6)+c;(!a||l<a.score)&&(a={feature:n,score:l})}return a?.feature||null}clientToSource(e,s,r){let[a,n]=this.screenToWorld(s,r);return[(a-e.worldX)/e.widthMm*e.sourceWidthMm,(n-e.worldY)/e.heightMm*e.sourceHeightMm]}ensurePickTexture(){this.pickTexture&&this.pickTextureSize[0]===this.canvas.width&&this.pickTextureSize[1]===this.canvas.height||(this.pickTexture&&this.pickTexture.destroy(),this.pickTexture=this.device.createTexture({size:[this.canvas.width,this.canvas.height],format:"r32uint",usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC}),this.pickTextureSize=[this.canvas.width,this.canvas.height])}writePickVectors(e){let s=new ArrayBuffer(Pa*12),r=new DataView(s),a=0,n=[];for(let i of e){let o=this.vectorChunks.get(i.id);if(!o?.segments?.length&&!o?.fills?.length&&!o?.images?.length)continue;let c=this._pickSourcePointByPage?.get(i.id),l=c?[c[0]-2.5,c[1]-2.5,c[0]+2.5,c[1]+2.5]:[0,0,i.sourceWidthMm,i.sourceHeightMm],u=Su(o.spatial,l);for(let f of u.images){if(!xt(f.bounds,l))continue;let b=this.featuresById.get(f.featureId);!b||dr(b)||n.push({page:i,image:f,feature:b,priority:lr(b)-5})}for(let f of u.fills){if(!xt(f.bounds,l))continue;let b=this.featuresById.get(f.featureId);!b||dr(b)||n.push({page:i,fill:f,feature:b,priority:lr(b)-2})}for(let f of u.segments){if(!xt(f.bounds,l))continue;let b=this.featuresById.get(f.featureId);!b||dr(b)||n.push({page:i,segment:f,feature:b,priority:lr(b)})}}n.sort((i,o)=>i.priority-o.priority);for(let{page:i,segment:o,fill:c,image:l,feature:u}of n){if(a+6>Pa)break;if(l){let f=this.sourceToWorld(i,[l.xMm,l.yMm]),b=this.sourceToWorld(i,[l.xMm+l.widthMm,l.yMm]),g=this.sourceToWorld(i,[l.xMm,l.yMm+l.heightMm]),p=this.sourceToWorld(i,[l.xMm+l.widthMm,l.yMm+l.heightMm]);a=Qi(r,a,f,b,g,l.featureId),a=Qi(r,a,g,b,p,l.featureId)}else if(c){let f=c.worldPoints||c.points.map(b=>this.sourceToWorld(i,b));a=Qi(r,a,f[0],f[1],f[2],c.featureId)}else{let f=Math.max(this.segmentWorldWidth(i,o,u,!1),this.scale*7);for(let b of this.visibleSegmentParts(i,o,u)){if(a+6>Pa)break;let g=b.worldA||this.sourceToWorld(i,b.a),p=b.worldB||this.sourceToWorld(i,b.b);a=kv(r,a,g,p,f,o.featureId)}}}return a?(this.device.queue.writeBuffer(this.pickVertexBuffer,0,s,0,a*12),a):0}async gpuPickFeature(e,s,r){if(this.pickPending)return null;let a=this.clientToSource(e,s,r);this._pickSourcePointByPage=new Map([[e.id,a]]);let n=this.writePickVectors([e]);if(this._pickSourcePointByPage=null,!n)return null;this.resize(),this.writeGlobals(),this.ensurePickTexture();let i=this.canvas.getBoundingClientRect(),o=Math.max(0,Math.min(this.canvas.width-1,Math.floor((s-i.left)*this.canvas.width/i.width))),c=Math.max(0,Math.min(this.canvas.height-1,Math.floor((r-i.top)*this.canvas.height/i.height))),l=this.device.createCommandEncoder(),u=l.beginRenderPass({colorAttachments:[{view:this.pickTexture.createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}]});u.setPipeline(this.pickPipeline),u.setBindGroup(0,this.edgeBindGroup),u.setVertexBuffer(0,this.pickVertexBuffer),u.draw(n),u.end(),l.copyTextureToBuffer({texture:this.pickTexture,origin:{x:o,y:c}},{buffer:this.pickReadBuffer,bytesPerRow:256,rowsPerImage:1},{width:1,height:1,depthOrArrayLayers:1}),this.pickPending=!0,this.device.queue.submit([l.finish()]);try{await this.pickReadBuffer.mapAsync(GPUMapMode.READ);let f=new DataView(this.pickReadBuffer.getMappedRange()).getUint32(0,!0);return this.pickReadBuffer.unmap(),f&&this.featuresById.get(f)||null}finally{this.pickReadBuffer.mapState==="mapped"&&this.pickReadBuffer.unmap(),this.pickPending=!1}}hitResidentVectorFeature(e,s,r,a){if(!this.isNativeScene)return null;let n=this.vectorChunks.get(e.id);if(!n?.loaded)return null;let i=null;for(let o of n.segments){let c=this.featuresById.get(o.featureId),l=Math.max(a,(o.widthMm||0)*.5+a*.45);if(c)for(let u of this.visibleSegmentParts(e,o,c)){let f=vv([s,r],u.a,u.b);if(f>l)continue;let b=f-lr(c)*.025+(ur(c)?0:8);(!i||b<i.score)&&(i={feature:c,score:b})}}return i?.feature||null}segmentWorldWidth(e,s,r,a){let n=(s.widthMm||.15)/Math.max(1,e.sourceWidthMm)*e.widthMm;return Math.max(n,this.scale*gv(r,s.kind,a))}pan(e,s){let r=this.canvas.width/Math.max(1,this.canvas.clientWidth);this.center[0]-=e*this.scale*r,this.center[1]-=s*this.scale*r}zoom(e,s,r){let a=this.screenToWorld(s,r);this.scale=de(this.scale*Math.exp(e*.0015),.015,16);let n=this.screenToWorld(s,r);this.center[0]+=a[0]-n[0],this.center[1]+=a[1]-n[1]}framePage(e){e&&(this.resize(),this.center=[e.worldX+e.widthMm/2,e.worldY+e.heightMm/2],this.scale=Math.max(e.widthMm/Math.max(1,this.canvas.width*.88),e.heightMm/Math.max(1,this.canvas.height*.84)))}frameWorld(){this.resize(),this.center=[(this.world.minX+this.world.maxX)/2,(this.world.minY+this.world.maxY)/2],this.scale=Math.max((this.world.maxX-this.world.minX)/Math.max(1,this.canvas.width*.9),(this.world.maxY-this.world.minY)/Math.max(1,this.canvas.height*.88),.05)}};function ev(t){return t.thumbnail?.path||t.svg}function tv(t){if(t.schema==="prism.schematic_vector_a0.features"){let e=new Map((t.features||[]).map(r=>[Number(r.id),r])),s={};for(let[r,a]of Object.entries(t.pages||{}))s[r]=a.map(n=>e.get(Number(n))).filter(Boolean);return s}return t.pages||{}}function sv(t){let e=[],s=[],r=[];for(let a of t){let n=Number(a.featureId||0);if(!n)continue;if(a.kind==="plotimage"&&a.image?.path){let y=a.xMm||0,w=a.yMm||0,v=a.widthMm||0,x=a.heightMm||0;r.push({featureId:n,kind:a.kind,xMm:y,yMm:w,widthMm:v,heightMm:x,bounds:[y,w,y+v,w+x],path:a.image.path});continue}let i=String(a.semanticRole||""),o=a.radiusMm||a.diameterMm/2||0,c=String(a.fill||"").toUpperCase()==="FILLED_SHAPE",l=a.widthMm||a.pen_widthMm||(i==="junction"?.08:.15),u=String(a.lineStyle||a.line_style||"DEFAULT").toUpperCase(),f=a.color||a.strokeColor||a.style?.color||"",b=a.fillColor||a.color||a.style?.color||"",g=(y,w)=>cv(e,{featureId:n,kind:a.kind,widthMm:l,lineStyle:u,color:f},y,w),p=a.x1Mm,d=a.y1Mm,m=a.x2Mm,h=a.y2Mm;if(a.trianglesMm?.length){for(let y of a.trianglesMm)Array.isArray(y)&&y.length===3&&s.push({featureId:n,kind:a.kind,color:b,points:y,bounds:Ru(y)});if(a.pointsMm?.length>=2){for(let y=1;y<a.pointsMm.length;y+=1)g(a.pointsMm[y-1],a.pointsMm[y]);Tu(a)&&g(a.pointsMm[a.pointsMm.length-1],a.pointsMm[0])}}else if(a.pointsMm?.length>=2){c&&a.pointsMm.length>=3&&ov(s,n,a.kind,a.pointsMm,b);for(let y=1;y<a.pointsMm.length;y+=1)g(a.pointsMm[y-1],a.pointsMm[y]);Tu(a)&&g(a.pointsMm[a.pointsMm.length-1],a.pointsMm[0])}else if(a.polylinesMm?.length){for(let y of a.polylinesMm)if(!(!Array.isArray(y)||y.length<2))for(let w=1;w<y.length;w+=1)g(y[w-1],y[w])}else if(Number.isFinite(p)&&Number.isFinite(d)&&Number.isFinite(m)&&Number.isFinite(h))a.kind==="rect"?(c&&nv(s,n,a.kind,[p,d,m,h],b),g([p,d],[m,d]),g([m,d],[m,h]),g([m,h],[p,h]),g([p,h],[p,d])):g([p,d],[m,h]);else if(Number.isFinite(a.cxMm)&&Number.isFinite(a.cyMm)){let y=a.radiusMm||a.diameterMm/2||.4;c&&iv(s,n,a.kind,[a.cxMm,a.cyMm],y,b),lv(e,{featureId:n,kind:a.kind,widthMm:l,lineStyle:u,color:f},[a.cxMm,a.cyMm],y)}else if(a.contoursMm?.length){for(let y of a.contoursMm)if(!(!Array.isArray(y)||y.length<2)){for(let w=1;w<y.length;w+=1)g(y[w-1],y[w]);g(y[y.length-1],y[0])}}else if(Number.isFinite(a.start_xMm)&&Number.isFinite(a.start_yMm)&&Number.isFinite(a.end_xMm)&&Number.isFinite(a.end_yMm))Number.isFinite(a.mid_xMm)&&Number.isFinite(a.mid_yMm)?(g([a.start_xMm,a.start_yMm],[a.mid_xMm,a.mid_yMm]),g([a.mid_xMm,a.mid_yMm],[a.end_xMm,a.end_yMm])):g([a.start_xMm,a.start_yMm],[a.end_xMm,a.end_yMm]);else if(Number.isFinite(a.start_xMm)&&Number.isFinite(a.start_yMm)&&Number.isFinite(a.mid_xMm)&&Number.isFinite(a.mid_yMm)&&Number.isFinite(a.end_xMm)&&Number.isFinite(a.end_yMm))g([a.start_xMm,a.start_yMm],[a.mid_xMm,a.mid_yMm]),g([a.mid_xMm,a.mid_yMm],[a.end_xMm,a.end_yMm]);else if(a.boundsMm&&a.kind!=="text"){let[y,w,v,x]=a.boundsMm;g([y,w],[v,w]),g([v,w],[v,x]),g([v,x],[y,x]),g([y,x],[y,w])}}return{segments:e,fills:s,images:r}}function rv(t,e){for(let s of e.segments||[])s.worldA=Ts(t,s.a),s.worldB=Ts(t,s.b);for(let s of e.fills||[])s.worldPoints=s.points.map(r=>Ts(t,r));for(let s of e.images||[])s.worldOrigin=Ts(t,[s.xMm,s.yMm]),s.worldSize=av(t,s.widthMm,s.heightMm)}function Ts(t,e){return[t.worldX+e[0]/t.sourceWidthMm*t.widthMm,t.worldY+e[1]/t.sourceHeightMm*t.heightMm]}function av(t,e,s){return[e/t.sourceWidthMm*t.widthMm,s/t.sourceHeightMm*t.heightMm]}function nv(t,e,s,r,a){let[n,i,o,c]=r;t.push({featureId:e,kind:s,color:a,points:[[n,i],[o,i],[n,c]],bounds:[n,i,o,c]},{featureId:e,kind:s,color:a,points:[[n,c],[o,i],[o,c]],bounds:[n,i,o,c]})}function iv(t,e,s,r,a,n){for(let o=0;o<36;o+=1){let c=o/36*Math.PI*2,l=(o+1)/36*Math.PI*2;t.push({featureId:e,kind:s,color:n,points:[r,[r[0]+Math.cos(c)*a,r[1]+Math.sin(c)*a],[r[0]+Math.cos(l)*a,r[1]+Math.sin(l)*a]],bounds:[r[0]-a,r[1]-a,r[0]+a,r[1]+a]})}}function ov(t,e,s,r,a){let n=r[0],i=Ru(r);for(let o=2;o<r.length;o+=1)t.push({featureId:e,kind:s,color:a,points:[n,r[o-1],r[o]],bounds:i})}function cv(t,e,s,r){let a=Mu(s,r,e.widthMm||.15),n=e.lineStyle||"DEFAULT";if(!["DASH","DASHED","DOT","DOTTED","DASHDOT","DASH_DOT"].includes(n)){t.push({...e,a:s,b:r,bounds:a});return}let i=r[0]-s[0],o=r[1]-s[1],c=Math.hypot(i,o);if(c<1e-6)return;let l=i/c,u=o/c,f=Math.max(e.widthMm*4,.45),b=n.includes("DOT")?[f*.8,f*.75,f*3,f*.75]:[f*3,f*1.5],g=0,p=0;for(;g<c;){let d=Math.min(b[p%b.length],c-g);if(p%2===0){let m=[s[0]+l*g,s[1]+u*g],h=[s[0]+l*(g+d),s[1]+u*(g+d)];t.push({...e,a:m,b:h,bounds:Mu(m,h,e.widthMm||.15)})}g+=d,p+=1}}function lv(t,e,s,r){for(let n=0;n<32;n+=1){let i=n/32*Math.PI*2,o=(n+1)/32*Math.PI*2;t.push({...e,a:[s[0]+Math.cos(i)*r,s[1]+Math.sin(i)*r],b:[s[0]+Math.cos(o)*r,s[1]+Math.sin(o)*r],bounds:[s[0]-r,s[1]-r,s[0]+r,s[1]+r]})}}function Ru(t,e=0){let s=1/0,r=1/0,a=-1/0,n=-1/0;for(let i of t||[])s=Math.min(s,i[0]),r=Math.min(r,i[1]),a=Math.max(a,i[0]),n=Math.max(n,i[1]);return Number.isFinite(s)?[s-e,r-e,a+e,n+e]:[0,0,0,0]}function Mu(t,e,s=0){let r=Math.max(.05,s*.5);return[Math.min(t[0],e[0])-r,Math.min(t[1],e[1])-r,Math.max(t[0],e[0])+r,Math.max(t[1],e[1])+r]}function xt(t,e){return!t||!e?!0:t[0]<=e[2]&&t[2]>=e[0]&&t[1]<=e[3]&&t[3]>=e[1]}function dv(t){let e={cellSize:Qw,cells:new Map,segments:t.segments||[],fills:t.fills||[],images:t.images||[],queryId:0};for(let s of e.segments)Yi(e,"segments",s);for(let s of e.fills)Yi(e,"fills",s);for(let s of e.images)Yi(e,"images",s);return e}function Yi(t,e,s){let r=s.bounds;if(!r)return;let a=Math.floor(r[0]/t.cellSize),n=Math.floor(r[2]/t.cellSize),i=Math.floor(r[1]/t.cellSize),o=Math.floor(r[3]/t.cellSize);for(let c=i;c<=o;c+=1)for(let l=a;l<=n;l+=1){let u=`${l}:${c}`,f=t.cells.get(u);f||(f={segments:[],fills:[],images:[]},t.cells.set(u,f)),f[e].push(s)}}function Su(t,e){if(!t)return{segments:[],fills:[],images:[]};t.queryId=(t.queryId||0)+1;let s=t.queryId,r={segments:[],fills:[],images:[]},a=Math.floor(e[0]/t.cellSize),n=Math.floor(e[2]/t.cellSize),i=Math.floor(e[1]/t.cellSize),o=Math.floor(e[3]/t.cellSize);for(let c=i;c<=o;c+=1)for(let l=a;l<=n;l+=1){let u=t.cells.get(`${l}:${c}`);u&&(Ji(u.segments,r.segments,s,"segments"),Ji(u.fills,r.fills,s,"fills"),Ji(u.images,r.images,s,"images"))}return r}function Ji(t,e,s,r){let a=`_${r}QueryId`;for(let n of t)n[a]!==s&&(n[a]=s,e.push(n))}function Tu(t){let e=String(t.kind||"");if(String(t.fill||"").toUpperCase()==="FILLED_SHAPE"||t.closed===!0||["polygon","fill"].includes(e))return!0;let r=t.pointsMm||[];if(r.length>=3){let a=r[0],n=r[r.length-1];return Math.hypot(a[0]-n[0],a[1]-n[1])<1e-6}return!1}function ur(t){return!!t?.netUid}function uv(t){let e=String(t?.kind||""),s=String(t?.semanticRole||"");return e==="pin"||e==="pin_body"||e==="label"||e==="global_label"||e==="hierarchical_label"||e==="netclass_flag"||e==="power_symbol"||e==="power_port"||s==="label"||s==="global_label"||s==="hierarchical_label"}function fv(t){let e=String(t?.kind||""),s=String(t?.semanticRole||"");return e==="global_label"||s==="global_label"?130:e==="hierarchical_label"||s==="hierarchical_label"?125:e==="label"||s==="label"?118:e==="pin"||e==="pin_body"?106:e==="power_symbol"||e==="power_port"||e==="netclass_flag"?98:50}function hv(t){if(t.length<=ku)return t;let e=t.slice(0,ku);return e.sort((s,r)=>s.source[1]-r.source[1]||s.source[0]-r.source[0]),e}function pv(t,e,s={}){if(!t||!e?.length)return null;let r=s.featureId||s.stableKey||s.sourceId?e.find(l=>s.featureId&&Number(l.featureId||0)===Number(s.featureId)||s.stableKey&&l.stableKey===s.stableKey||s.sourceId&&l.sourceId===s.sourceId):null;if(r)return{...r,kind:"selected-net-occurrence",priority:200};let a=e.filter(l=>l.priority>=118).slice(0,16),n=a.length?a:e.slice(0,16),i=0,o=0;for(let l of n)i+=l.world[0],o+=l.world[1];let c=[i/n.length,o/n.length];return{pageId:t.id,featureId:n[0]?.featureId||0,kind:"page-net-occurrence",source:[0,0],world:c,bounds:[c[0],c[1],c[0],c[1]],priority:1}}function Au(t,e,s){if(!t||t.length<2)return[];let r=t.map(i=>({...i})).sort((i,o)=>i.world[1]-o.world[1]||i.world[0]-o.world[0]),a=[],n=r.shift();for(;r.length;){let i=0,o=1/0;for(let l=0;l<r.length;l+=1){let u=r[l],f=Math.hypot(u.world[0]-n.world[0],u.world[1]-n.world[1]);f<o&&(o=f,i=l)}let c=r.splice(i,1)[0];a.push({type:e,pageId:s||n.pageId||c.pageId||"",a:n.world,b:c.world,sourceFeatureIds:[n.featureId,c.featureId].filter(Boolean)}),n=c}return a}function _u(t,e=0){return[Math.min(t.a[0],t.b[0])-e,Math.min(t.a[1],t.b[1])-e,Math.max(t.a[0],t.b[0])+e,Math.max(t.a[1],t.b[1])+e]}function lr(t){let e=String(t?.kind||""),r=String(t?.semanticRole||"")||e;return r==="pin_number"||r==="pin_name"?120:r==="pin_body"||e==="pin"?110:r==="symbol_reference"||r==="symbol_value"?92:e==="junction"||e==="no_connect"?88:e==="wire"||e==="bus"||e==="bus_entry"?78:r==="symbol_body"||e==="symbol_body"?45:e==="symbol_instance"||e==="symbol_overplot"?30:e==="text"||String(r).includes("text")?24:10}function dr(t){let e=String(t?.kind||""),s=String(t?.semanticRole||"");if(e==="page"||e==="sheet_header")return!0;if(e==="graphic_rect"&&s==="graphic_rect"&&!t?.netUid&&!t?.componentUid){let r=t.boundsMm||[];return r[2]-r[0]>150&&r[3]-r[1]>120}return!1}function bv(t){if(!t||typeof t!="string")return null;let s=t.trim().match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);if(!s)return null;let r=s[1],a=s[2]??"ff";return[parseInt(r.slice(0,2),16)/255,parseInt(r.slice(2,4),16)/255,parseInt(r.slice(4,6),16)/255,parseInt(a,16)/255]}function Zi(t,e,s=""){let r=bv(s||t?.color||"");return t?.kind==="dnp_marker"?r||[.86,.04,.05,.85]:t?.dnp&&["symbol_reference","symbol_value","symbol_text"].includes(String(t?.kind||""))?[.5,.52,.54,.56]:r||(t?.dnp?[.5,.52,.54,.56]:ur(t)?[.12,.56,.2,.96]:t?.kind==="pin_name"?[0,.28,.31,.96]:t?.kind==="pin_number"?[.45,.17,.16,.96]:t?.kind==="pin_body"?[.28,.18,.18,.88]:t?.kind==="symbol_body"||t?.kind==="symbol_instance"?[.42,.18,.18,.72]:t?.kind==="symbol_reference"||t?.kind==="symbol_value"?[.05,.13,.16,.94]:t?.kind==="text"||String(e||"").startsWith("text")?[.05,.13,.16,.94]:[.16,.17,.19,.7])}function Iu(t,e,s=""){let r=Zi(t,e,s);return[r[0]*.72,r[1]*.72,r[2]*.72,Math.min(r[3],.38)]}function gv(t,e,s){return s?5.5:t?.kind==="dnp_marker"?3:["pin_name","pin_number"].includes(String(t?.kind||""))?1.5:t?.kind==="pin_body"?1.7:String(e||"").startsWith("text")?1.35:e==="bus"||t?.kind==="bus"?4.2:ur(t)?2.6:t?.kind==="symbol_body"||t?.kind==="symbol_instance"||t?.kind==="sheet"?1.5:1.25}function La(t,e,s,r){return t[e++]=s[0],t[e++]=s[1],t[e++]=r[0],t[e++]=r[1],t[e++]=r[2],t[e++]=r[3],e}function mv(t,e,s,r,a,n){let i=Nu(s,r,a);if(!i)return e;for(let o of i)e=La(t,e,o,n);return e}function yv(t,e,s,r,a,n){return e=La(t,e,s,n),e=La(t,e,r,n),e=La(t,e,a,n),e}function Ss(t,e,s,r,a){return t[e++]=s[0],t[e++]=s[1],t[e++]=r,t[e++]=a,e}function wv(t,e,s,r,a,n,i,o){let c=r[0]-s[0],l=r[1]-s[1],u=Math.hypot(c,l);if(u<1e-6||e+24>t.length)return e;let f=a*.5,b=c/u,p=-(l/u)*f,d=b*f,m=[s[0]+p,s[1]+d],h=[s[0]-p,s[1]-d],y=[r[0]+p,r[1]+d],w=[r[0]-p,r[1]-d],v=i+u/Math.max(o,1e-6);return e=Ss(t,e,m,i,n),e=Ss(t,e,h,i,n),e=Ss(t,e,y,v,n),e=Ss(t,e,y,v,n),e=Ss(t,e,h,i,n),e=Ss(t,e,w,v,n),e}function Nu(t,e,s){let r=e[0]-t[0],a=e[1]-t[1],n=Math.hypot(r,a);if(n<1e-6)return null;let i=s*.5,o=r/n*i,c=a/n*i,l=-a/n*i,u=r/n*i,f=[t[0]-o,t[1]-c],b=[e[0]+o,e[1]+c],g=[f[0]+l,f[1]+u],p=[f[0]-l,f[1]-u],d=[b[0]+l,b[1]+u],m=[b[0]-l,b[1]-u];return[g,p,d,d,p,m]}function vv(t,e,s){let r=s[0]-e[0],a=s[1]-e[1],n=r*r+a*a||1,i=de(((t[0]-e[0])*r+(t[1]-e[1])*a)/n,0,1),o=e[0]+r*i,c=e[1]+a*i;return Math.hypot(t[0]-o,t[1]-c)}function xv(t,e){let[s,r,a,n]=e,[i,o]=t.a,[c,l]=t.b,u=1e-6,f=(b,g)=>({...t,a:b,b:g});if(Math.abs(o-l)<=u){let b=o;if(b<r-u||b>n+u)return[t];let g=Math.min(i,c),p=Math.max(i,c),d=Math.max(g,s),m=Math.min(p,a);if(m<=d+u)return[t];let h=[],y=i<=c;if(g<d-u){let w=y?[g,b]:[d,b],v=y?[d,b]:[g,b];h.push(f(w,v))}if(m<p-u){let w=y?[m,b]:[p,b],v=y?[p,b]:[m,b];h.push(f(w,v))}return h}if(Math.abs(i-c)<=u){let b=i;if(b<s-u||b>a+u)return[t];let g=Math.min(o,l),p=Math.max(o,l),d=Math.max(g,r),m=Math.min(p,n);if(m<=d+u)return[t];let h=[],y=o<=l;if(g<d-u){let w=y?[b,g]:[b,d],v=y?[b,d]:[b,g];h.push(f(w,v))}if(m<p-u){let w=y?[b,m]:[b,p],v=y?[b,p]:[b,m];h.push(f(w,v))}return h}return[t]}function Da(t,e,s,r){let a=e*12;t.setFloat32(a,s[0],!0),t.setFloat32(a+4,s[1],!0),t.setUint32(a+8,r,!0)}function kv(t,e,s,r,a,n){let i=Nu(s,r,a);if(!i)return e;for(let o of i)Da(t,e,o,n),e+=1;return e}function Qi(t,e,s,r,a,n){return Da(t,e,s,n),Da(t,e+1,r,n),Da(t,e+2,a,n),e+3}function Ev(t,e){let s=Array.isArray(t?.layerIds)?t.layerIds:[];if(s.length<2&&t?.startLayerId!=null&&t?.endLayerId!=null&&(s=[t.startLayerId,t.endLayerId]),s.length<2&&t?.layerMask!=null)try{let r=BigInt(String(t.layerMask));s=e.filter((a,n)=>(r&1n<<BigInt(n))!==0n).map(a=>a.id)}catch{s=[]}return s}function Mv(t){let e=t?.objectFeatureId??t?.id;if(e!=null&&Number.isFinite(Number(e))&&Number(e)!==0)return`feature:${Number(e)}`;let s=String(t?.sourceUid||"");return s?`source:${s}`:""}function Bu(t,e){let s=new Map(t.map((o,c)=>[Number(o.id),c])),r=new Map(t.map(o=>[Number(o.id),o])),a=new Map,n=new Set,i={thru:0,blind:0,buried:0};for(let o of e){let c=Mv(o);if(c){if(n.has(c))continue;n.add(c)}let l=[...new Set(Ev(o,t).map(Number))].filter(w=>s.has(w)).sort((w,v)=>s.get(w)-s.get(v));if(l.length<2)continue;let u=l[0],f=l[l.length-1],b=s.get(u),g=s.get(f),p=b===0,d=g===t.length-1,m=p&&d?"thru":p||d?"blind":"buried";i[m]+=1;let h=`${u}:${f}:${m}`,y=a.get(h);if(y){y.count+=1;continue}a.set(h,{startId:u,endId:f,startName:r.get(u)?.name||String(u),endName:r.get(f)?.name||String(f),startIndex:b,endIndex:g,type:m,count:1})}return{counts:i,spans:[...a.values()]}}var fr="http://www.w3.org/2000/svg";var Sv=new Set(["script","foreignobject","iframe","object","embed"]),Tv=new Set(["href","xlink:href"]),Av=1,_v=18,Iv=8,Ka=class t{static create(e,s,r,a,n={}){return new t(e,s,r,a,n)}constructor(e,s,r,a,n){this.host=e,this.manifestUrl=s,this.manifest=r,this.featuresByPage=a||{},this.callbacks=n,this.activePage=null,this.activeSvgUrl="",this.container=null,this.svg=null,this.overlay=null,this.mountedPages=new Map,this.loadingPages=new Map,this.svgCache=new Map,this.serial=0,this.maxMountedWorldPages=Av,this.maxCachedSvgPages=_v,this.worldHandlersInstalled=!1,this.worldDrag=null,this.view={scale:1,tx:0,ty:0},this.drag=null,this.selected=null,this.highlightedNetUid="",this.index=Pu(),this.lastStats={mountedPages:0,domNodes:0,indexedFeatures:0,indexedNets:0,mountMs:0,coldMounts:0,warmMounts:0,highlightMs:0,selectionMs:0,cachedSvgPages:0,cachedSvgBytes:0,heapMb:null,fallbackReason:""}}get active(){return!!(this.container&&this.activePage)}get worldActive(){return this.mountedPages.size>0}stats(){return{...this.lastStats,activePage:this.activePage?.name||[...this.mountedPages.values()][0]?.page?.name||"-",mountedPages:this.active?1:this.mountedPages.size}}dispose(){this.unmountPage(),this.unmountWorldPages()}unmountPage(){this.container?.remove(),this.container=null,this.svg=null,this.overlay=null,this.activePage=null,this.activeSvgUrl="",this.index=Pu(),this.host.hidden=!0}unmountWorldPages(){for(let e of this.mountedPages.values())e.container.remove();this.mountedPages.clear(),this.loadingPages.clear(),this.active||(this.host.hidden=!0)}async preloadPages(e){let s=performance.now(),r=await Promise.allSettled((e||[]).slice(0,Iv).map(a=>this.loadSvgTemplate(a)));this.lastStats.preloadedPages=r.filter(a=>a.status==="fulfilled"&&a.value).length,this.lastStats.preloadMs=performance.now()-s,this.updateCacheStats()}syncWorldPages(e,s,r={}){if(!s)return;this.installWorldHandlers(s);let a=(e||[]).slice(0,r.maxMountedPages||this.maxMountedWorldPages),n=new Set(a.map(i=>i.id));for(let[i,o]of this.mountedPages)n.has(i)||(o.container.remove(),this.mountedPages.delete(i));for(let i of a){let o=this.mountedPages.get(i.id);if(o)o.lastUsed=++this.serial,this.positionWorldEntry(o,s);else if(!this.loadingPages.has(i.id)){let c=this.mountWorldPage(i).then(l=>{l&&n.has(i.id)?this.positionWorldEntry(l,s):l?.container.remove()}).finally(()=>this.loadingPages.delete(i.id));this.loadingPages.set(i.id,c)}}this.pruneMountedWorldPages(n),this.host.hidden=a.length===0&&!this.active,this.setSelection(this.selected),this.setHighlightedNet(r.activeNetUid??this.highlightedNetUid),this.lastStats.mountedPages=this.mountedPages.size,this.updateCacheStats()}async mountWorldPage(e){let s=performance.now(),r=this.hasCachedSvg(e),a=await this.loadImportedSvg(e);if(!a)return null;let n=document.createElement("div");n.className="svg-dom-page svg-dom-world-page",n.dataset.pageId=e.id,n.append(a),this.host.append(n);let i=Ou(a),o=Fu(a),c=Cu(a,e,this.featuresByPage[e.id]||[]),l={page:e,container:n,svg:a,overlay:i,selectionOverlay:o,index:c,mountMs:performance.now()-s,lastUsed:++this.serial,warm:r};return this.mountedPages.set(e.id,l),this.lastStats={...this.lastStats,mountedPages:this.mountedPages.size,domNodes:[...this.mountedPages.values()].reduce((u,f)=>u+f.svg.querySelectorAll("*").length,0),indexedFeatures:[...this.mountedPages.values()].reduce((u,f)=>u+f.index.featureToElements.size,0),indexedNets:new Set([...this.mountedPages.values()].flatMap(u=>[...u.index.netToElements.keys()])).size,mountMs:l.mountMs,coldMounts:this.lastStats.coldMounts+(l.warm?0:1),warmMounts:this.lastStats.warmMounts+(l.warm?1:0),fallbackReason:""},this.updateCacheStats(),l}async loadImportedSvg(e){let s=await this.loadSvgTemplate(e);return s?s.cloneNode(!0):null}async loadSvgTemplate(e){let s=this.svgUrlForPage(e),r=this.svgCache.get(s);if(r?.template)return r.lastUsed=++this.serial,r.template;if(r?.promise)return r.promise;let a=performance.now(),n=(async()=>{let i=await fetch(s,{cache:"default"});if(!i.ok)return this.lastStats.fallbackReason=`Failed to load SVG page ${e.id}: ${i.status}`,this.callbacks.onFallback?.(this.lastStats.fallbackReason),null;let o=await i.text(),l=new DOMParser().parseFromString(o,"image/svg+xml"),u=l.documentElement;if(!u||u.localName.toLowerCase()!=="svg"||l.querySelector("parsererror"))return this.lastStats.fallbackReason=`Invalid SVG for page ${e.id}`,this.callbacks.onFallback?.(this.lastStats.fallbackReason),null;Rv(l,s,e.id);let f=document.importNode(u,!0);f.classList.add("svg-dom-page-svg"),Pv(f);let b=this.svgCache.get(s)||{};return Object.assign(b,{template:f,promise:null,pageId:e.id,byteLength:o.length*2,loadMs:performance.now()-a,lastUsed:++this.serial}),this.svgCache.set(s,b),this.pruneSvgCache(),this.updateCacheStats(),f})();return this.svgCache.set(s,{promise:n,pageId:e.id,byteLength:0,loadMs:0,lastUsed:++this.serial}),n}svgUrlForPage(e){return new URL(e.svg||e.thumbnail?.path,this.manifestUrl).toString()}positionWorldEntry(e,s){let{page:r,container:a}=e,[n,i]=s.worldToScreen(r.worldX,r.worldY),[o,c]=s.worldToScreen(r.worldX+r.widthMm,r.worldY+r.heightMm),l=Math.max(1,o-n),u=Math.max(1,c-i);a.style.transform=`translate3d(${n}px, ${i}px, 0)`,a.style.width=`${l}px`,a.style.height=`${u}px`}installWorldHandlers(e){if(this.worldHandlersInstalled)return;this.worldHandlersInstalled=!0;let s=this.host;s.oncontextmenu=r=>r.preventDefault(),s.onpointerdown=r=>{let a=r.button===0&&!r.shiftKey&&!!r.target.closest?.("text"),i=r.target.closest?.("[data-feature-key]")?null:this.featureAtEvent(r);this.worldDrag={pointerId:r.pointerId,startX:r.clientX,startY:r.clientY,lastX:r.clientX,lastY:r.clientY,button:r.button,moved:!1,pan:!a&&(r.button===0||r.button===1||r.shiftKey),allowTextSelection:a},a||s.setPointerCapture(r.pointerId)},s.onpointermove=r=>{if(!this.worldDrag||this.worldDrag.pointerId!==r.pointerId)return;let a=r.clientX-this.worldDrag.lastX,n=r.clientY-this.worldDrag.lastY;this.worldDrag.lastX=r.clientX,this.worldDrag.lastY=r.clientY,Math.hypot(r.clientX-this.worldDrag.startX,r.clientY-this.worldDrag.startY)>3&&(this.worldDrag.moved=!0),this.worldDrag.pan&&e.pan(a,n)},s.onpointerup=r=>{if(!this.worldDrag||this.worldDrag.pointerId!==r.pointerId)return;let a=this.worldDrag;if(this.worldDrag=null,a.allowTextSelection||s.releasePointerCapture(r.pointerId),a.button!==0||a.moved)return;let n=r.target.closest?.("[data-feature-key]");if(n)this.selectElement(n,r);else{let i=this.featureAtEvent(r);i?this.selectFeature(i.entry,i.feature,r):this.callbacks.onBlank?.()}},s.ondblclick=r=>{let a=r.target.closest?.("[data-feature-key]"),n=a?null:this.featureAtEvent(r),i=n?.entry||this.entryForPoint(r.clientX,r.clientY),o=a?this.selectionFromElement(a):n?this.selectionFromFeature(n.entry,n.feature):this.selected;ju(o)?this.callbacks.onOpenPage?.(o):o?.netUid?this.callbacks.onHighlightNet?.(o.netUid,o):!n&&i?.page&&this.callbacks.onOpenPage?.({kind:"page",pageId:i.page.id,page:i.page})},s.onwheel=r=>{r.preventDefault(),Math.abs(r.deltaX)>Math.abs(r.deltaY)*.65?e.pan(-r.deltaX,-r.deltaY):e.zoom(r.deltaY,r.clientX,r.clientY)}}async focusPage(e,s={}){if(!e)return!1;if(this.activePage?.id===e.id&&this.active)return s.frame!==!1&&this.fitPage(),!0;let r=performance.now(),a=await this.loadImportedSvg(e);if(!a)return!1;let n=document.createElement("div");return n.className="svg-dom-page",n.append(a),this.host.replaceChildren(n),this.host.hidden=!1,this.container=n,this.svg=a,this.activePage=e,this.activeSvgUrl=new URL(e.svg||e.thumbnail?.path,this.manifestUrl).toString(),this.overlay=Ou(a),this.selectionOverlay=Fu(a),this.index=Cu(a,e,this.featuresByPage[e.id]||[]),this.installPageHandlers(),this.fitPage(),this.setSelection(this.selected),this.setHighlightedNet(this.highlightedNetUid),this.lastStats={...this.lastStats,mountedPages:1,domNodes:a.querySelectorAll("*").length,indexedFeatures:this.index.featureToElements.size,indexedNets:this.index.netToElements.size,mountMs:performance.now()-r,fallbackReason:""},this.updateCacheStats(),!0}installPageHandlers(){let e=this.host;e.oncontextmenu=s=>s.preventDefault(),e.onpointerdown=s=>{if(!this.active)return;let r=s.button===0&&!s.shiftKey&&!!s.target.closest?.("text"),a=s.target.closest?.("[data-feature-key]"),n=a?null:this.featureAtEvent(s);this.drag={pointerId:s.pointerId,startX:s.clientX,startY:s.clientY,lastX:s.clientX,lastY:s.clientY,button:s.button,moved:!1,pan:!r&&(s.button===0||s.button===1||s.shiftKey),featureElement:a,allowTextSelection:r},r||e.setPointerCapture(s.pointerId)},e.onpointermove=s=>{if(!this.drag||this.drag.pointerId!==s.pointerId)return;let r=s.clientX-this.drag.lastX,a=s.clientY-this.drag.lastY;this.drag.lastX=s.clientX,this.drag.lastY=s.clientY,Math.hypot(s.clientX-this.drag.startX,s.clientY-this.drag.startY)>3&&(this.drag.moved=!0),this.drag.pan&&(this.view.tx+=r,this.view.ty+=a,this.applyTransform())},e.onpointerup=s=>{if(!this.drag||this.drag.pointerId!==s.pointerId)return;let r=this.drag;if(this.drag=null,r.allowTextSelection||e.releasePointerCapture(s.pointerId),r.button!==0||r.moved)return;let a=s.target.closest?.("[data-feature-key]");if(a)this.selectElement(a,s);else{let n=this.featureAtEvent(s);n?this.selectFeature(n.entry,n.feature,s):this.callbacks.onBlank?.()}},e.ondblclick=s=>{let r=s.target.closest?.("[data-feature-key]"),a=r?null:this.featureAtEvent(s),n=r?this.selectionFromElement(r):a?this.selectionFromFeature(a.entry,a.feature):this.selected;ju(n)?this.callbacks.onOpenPage?.(n):n?.netUid?this.callbacks.onHighlightNet?.(n.netUid,n):!a&&this.activePage&&this.callbacks.onOpenPage?.({kind:"page",pageId:this.activePage.id,page:this.activePage})},e.onwheel=s=>{if(s.preventDefault(),!this.active)return;if(Math.abs(s.deltaX)>Math.abs(s.deltaY)*.65){this.view.tx-=s.deltaX,this.view.ty-=s.deltaY,this.applyTransform();return}let r=this.host.getBoundingClientRect(),a=s.clientX-r.left,n=s.clientY-r.top,i=this.screenToSvg(a,n),o=Math.exp(-s.deltaY*.0016);this.view.scale=za(this.view.scale*o,.02,80),this.view.tx=a-i[0]*this.view.scale,this.view.ty=n-i[1]*this.view.scale,this.applyTransform()}}selectElement(e,s){let r=performance.now(),a=this.selectionFromElement(e);if(this.setSelection(a),s){let n=this.host.getBoundingClientRect();a.anchor={x:s.clientX-n.left,y:s.clientY-n.top}}this.callbacks.onSelect?.(a),this.lastStats.selectionMs=performance.now()-r}selectFeature(e,s,r){let a=performance.now(),n=this.selectionFromFeature(e,s);if(this.setSelection(n),r){let i=this.host.getBoundingClientRect();n.anchor={x:r.clientX-i.left,y:r.clientY-i.top}}this.callbacks.onSelect?.(n),this.lastStats.selectionMs=performance.now()-a}selectionFromElement(e){let s=e.dataset.featureKey||"",r=this.entryForElement(e),a=r.index.featureByKey.get(s)||{};return this.selectionFromFeature(r,a,e)}selectionFromFeature(e,s,r=null){let a=s?.stableKey||r?.dataset?.featureKey||"",n=e?.page||this.activePage,i=s?.kind||r?.dataset?.role||r?.dataset?.primitive||"feature",o=s?.netUid||r?.dataset?.netUid||"",c=s?.netName||r?.dataset?.netName||"";return i==="sheet"?{kind:"sheet",featureKey:a,sheetInstancePath:s?.sheetInstancePath||n?.sheetInstancePath||"",sourceId:s?.sourceId||r?.dataset?.sourceId||r?.dataset?.objectId||r?.dataset?.uuid||"",sheetName:s?.sheet_name||s?.sheetName||r?.dataset?.sheetName||s?.objectId||"",sheetFile:s?.sheet_file||s?.sheetFile||r?.dataset?.sheetFile||"",feature:s}:i==="pin"||i==="pin_body"||i==="pin_name"||i==="pin_number"||r?.dataset?.pin?{kind:"pin",featureKey:a,sheetInstancePath:s?.sheetInstancePath||n?.sheetInstancePath||"",sourceId:s?.sourceId||r?.dataset?.sourceId||r?.dataset?.objectId||r?.dataset?.uuid||"",symbolUuid:s?.symbolUuid||r?.dataset?.symbolUuid||"",reference:s?.reference||r?.dataset?.designator||r?.dataset?.component||r?.dataset?.ref||"",pinNumber:s?.pinNumber||r?.dataset?.pin||"",pinName:s?.pinName||"",netUid:o,netName:c,feature:s}:i==="symbol_body"||i==="symbol_instance"||i==="component"||r?.dataset?.ref?{kind:"component",featureKey:a,sheetInstancePath:s?.sheetInstancePath||n?.sheetInstancePath||"",sourceId:s?.sourceId||r?.dataset?.sourceId||r?.dataset?.objectId||r?.dataset?.uuid||"",symbolUuid:s?.symbolUuid||r?.dataset?.symbolUuid||"",reference:s?.reference||r?.dataset?.designator||r?.dataset?.component||r?.dataset?.ref||"",netUid:o,netName:c,feature:s}:{kind:o?"feature":i,featureKey:a,sheetInstancePath:s?.sheetInstancePath||n?.sheetInstancePath||"",sourceId:s?.sourceId||r?.dataset?.sourceId||r?.dataset?.objectId||r?.dataset?.uuid||"",role:i,netUid:o,netName:c,feature:s}}setSelection(e){this.selected=e||null;for(let r of this.host.querySelectorAll(".prism-svg-selected"))r.classList.remove("prism-svg-selected");for(let r of this.host.querySelectorAll("[data-prism-overlay='selection']"))r.replaceChildren();let s=e?.featureKey||"";if(s){for(let r of this.entries()){for(let a of r.index.featureToElements.get(s)||[])a.classList.add("prism-svg-selected");this.drawSelectionOverlay(r,e)}for(let r of this.index.featureToElements.get(s)||[])r.classList.add("prism-svg-selected");this.drawSelectionOverlay({page:this.activePage,index:this.index,selectionOverlay:this.selectionOverlay},e)}}setHighlightedNet(e){this.highlightedNetUid=e||"";let s=performance.now();for(let r of this.entries())this.updateEntryHighlight(r);if(!this.svg||!this.overlay){this.lastStats.highlightMs=performance.now()-s;return}this.updateEntryHighlight({svg:this.svg,overlay:this.overlay,index:this.index,page:this.activePage}),this.lastStats.highlightMs=performance.now()-s}updateEntryHighlight(e){if(!e?.svg||!e?.overlay||(e.overlay.replaceChildren(),!this.highlightedNetUid))return;let s=Ga(e.svg,e.page),r=document.createElementNS(fr,"rect");r.setAttribute("x",String(s[0])),r.setAttribute("y",String(s[1])),r.setAttribute("width",String(s[2])),r.setAttribute("height",String(s[3])),r.setAttribute("class","prism-svg-net-dimmer"),e.overlay.append(r);let n=(e.index.netToElements.get(this.highlightedNetUid)||[]).slice(0,2200);for(let i of n){let o=jv(i);e.overlay.append(o)}}entries(){return[...this.mountedPages.values()]}entryForElement(e){let r=e.closest?.(".svg-dom-page")?.dataset.pageId||"";return this.mountedPages.get(r)||{page:this.activePage,index:this.index,svg:this.svg,overlay:this.overlay,selectionOverlay:this.selectionOverlay}}featureAtEvent(e){let s=this.entryForPoint(e.clientX,e.clientY);if(!s)return null;let r=this.clientToSvg(s,e.clientX,e.clientY);if(!r)return null;let a=Math.max(.18,5*Dv(s)),i=s.index.features.filter(o=>(o?.domBoundsMm||o?.boundsMm)&&Uu(o)).filter(o=>r[0]>=(o.domBoundsMm||o.boundsMm)[0]-a&&r[0]<=(o.domBoundsMm||o.boundsMm)[2]+a&&r[1]>=(o.domBoundsMm||o.boundsMm)[1]-a&&r[1]<=(o.domBoundsMm||o.boundsMm)[3]+a).map(o=>({feature:o,priority:zv(o),area:Math.max(1e-4,((o.domBoundsMm||o.boundsMm)[2]-(o.domBoundsMm||o.boundsMm)[0])*((o.domBoundsMm||o.boundsMm)[3]-(o.domBoundsMm||o.boundsMm)[1]))})).sort((o,c)=>c.priority-o.priority||o.area-c.area)[0]?.feature;return i?{entry:s,feature:i,point:r}:null}entryForPoint(e,s){for(let r of[...this.entries()].reverse()){let a=r.container.getBoundingClientRect();if(e>=a.left&&e<=a.right&&s>=a.top&&s<=a.bottom)return r}if(this.container){let r=this.container.getBoundingClientRect();if(e>=r.left&&e<=r.right&&s>=r.top&&s<=r.bottom)return{page:this.activePage,container:this.container,svg:this.svg,index:this.index,selectionOverlay:this.selectionOverlay}}return null}clientToSvg(e,s,r){if(!e?.container||!e?.svg||!e?.page)return null;let a=e.container.getBoundingClientRect();if(!a.width||!a.height)return null;let n=Ga(e.svg,e.page);return[n[0]+(s-a.left)/a.width*n[2],n[1]+(r-a.top)/a.height*n[3]]}drawSelectionOverlay(e,s){if(!e?.selectionOverlay||!s?.featureKey)return;let r=e.index.featureByKey.get(s.featureKey),a=r?.domBoundsMm||r?.boundsMm;if(!a)return;let[n,i,o,c]=a,l=document.createElementNS(fr,"rect");l.setAttribute("x",String(n)),l.setAttribute("y",String(i)),l.setAttribute("width",String(Math.max(.001,o-n))),l.setAttribute("height",String(Math.max(.001,c-i))),l.setAttribute("rx","0.65"),l.setAttribute("ry","0.65"),l.setAttribute("class","prism-svg-selection-box"),e.selectionOverlay.append(l)}fitPage(){if(!this.svg||!this.activePage)return;let e=Ga(this.svg,this.activePage),s=e[2]||this.activePage.sourceWidthMm||this.activePage.widthMm||1,r=e[3]||this.activePage.sourceHeightMm||this.activePage.heightMm||1,a=this.host.getBoundingClientRect(),n=Math.min(a.width/s,a.height/r)*.92;this.view.scale=za(n,.02,80),this.view.tx=(a.width-s*this.view.scale)/2-e[0]*this.view.scale,this.view.ty=(a.height-r*this.view.scale)/2-e[1]*this.view.scale,this.applyTransform()}frameSelection(e=this.selected){if(!e?.featureKey||!this.active){this.fitPage();return}let s=this.index.featureToElements.get(e.featureKey)||[],r=Du(s);if(!r)return;let a=this.host.getBoundingClientRect(),n=Math.max(1,r[2]-r[0]),i=Math.max(1,r[3]-r[1]),o=Math.min(a.width/n,a.height/i)*.36;this.view.scale=za(o,.04,80),this.view.tx=a.width/2-(r[0]+r[2])/2*this.view.scale,this.view.ty=a.height/2-(r[1]+r[3])/2*this.view.scale,this.applyTransform()}pan(e,s){this.active&&(this.view.tx+=e,this.view.ty+=s,this.applyTransform())}zoom(e,s,r){if(!this.active)return;let a=this.host.getBoundingClientRect(),n=(s??a.left+a.width/2)-a.left,i=(r??a.top+a.height/2)-a.top,o=this.screenToSvg(n,i),c=Math.exp(-e*.0016);this.view.scale=za(this.view.scale*c,.02,80),this.view.tx=n-o[0]*this.view.scale,this.view.ty=i-o[1]*this.view.scale,this.applyTransform()}screenToSvg(e,s){return[(e-this.view.tx)/Math.max(1e-6,this.view.scale),(s-this.view.ty)/Math.max(1e-6,this.view.scale)]}applyTransform(){this.container&&(this.container.style.transform=`translate3d(${this.view.tx}px, ${this.view.ty}px, 0) scale(${this.view.scale})`)}hasCachedSvg(e){return!!this.svgCache.get(this.svgUrlForPage(e))?.template}pruneMountedWorldPages(e=new Set){if(this.mountedPages.size<=this.maxMountedWorldPages)return;let s=[...this.mountedPages.entries()].filter(([r])=>!e.has(r)).sort((r,a)=>(r[1].lastUsed||0)-(a[1].lastUsed||0));for(let[r,a]of s){if(this.mountedPages.size<=this.maxMountedWorldPages)break;a.container.remove(),this.mountedPages.delete(r)}}pruneSvgCache(){let e=[...this.svgCache.entries()].filter(([,a])=>a?.template);if(e.length<=this.maxCachedSvgPages)return;let s=new Set([...this.mountedPages.values()].map(a=>this.svgUrlForPage(a.page)));this.activePage&&s.add(this.svgUrlForPage(this.activePage));let r=e.filter(([a])=>!s.has(a)).sort((a,n)=>(a[1].lastUsed||0)-(n[1].lastUsed||0));for(let[a]of r){if([...this.svgCache.values()].filter(n=>n?.template).length<=this.maxCachedSvgPages)break;this.svgCache.delete(a)}}updateCacheStats(){let e=[...this.svgCache.values()].filter(r=>r?.template);this.lastStats.cachedSvgPages=e.length,this.lastStats.cachedSvgBytes=e.reduce((r,a)=>r+(a.byteLength||0),0);let s=performance?.memory;this.lastStats.heapMb=s?.usedJSHeapSize?s.usedJSHeapSize/1048576:null}};function Rv(t,e,s){for(let n of[...t.querySelectorAll("*")]){if(Sv.has(n.localName.toLowerCase())){n.remove();continue}for(let i of[...n.attributes]){let o=i.name,c=o.toLowerCase(),l=i.value||"";if(c.startsWith("on")){n.removeAttribute(o);continue}if((c==="href"||c==="xlink:href"||c==="src")&&zu(l)){if((c==="href"||c==="xlink:href")&&n.localName.toLowerCase()==="image"&&Kv(l))continue;n.removeAttribute(o);continue}c==="style"&&n.setAttribute(o,Hv(l))}}let r=`prism-${eo(s)}-`,a=new Map;for(let n of t.querySelectorAll("[id]")){let i=n.getAttribute("id"),o=`${r}${eo(i)}`;a.set(i,o),n.setAttribute("id",o)}for(let n of t.querySelectorAll("*"))for(let i of[...n.attributes]){let o=i.name.toLowerCase(),c=i.value||"";Tv.has(o)&&(c.startsWith("#")&&a.has(c.slice(1))?c=`#${a.get(c.slice(1))}`:Vv(c)&&(c=new URL(c,e).toString())),c=qv(c,a),n.setAttribute(i.name,c)}}function Cu(t,e,s){let r=new Map,a=new Map,n=new Map,i=[];for(let u of s){let f=Cv(u,e);i.push(f),a.set(f.stableKey,f),n.set(Number(f.id||0),f);for(let b of Ov(f))r.has(b)||r.set(b,[]),r.get(b).push(f)}let o=new Map,c=new Map,l=new Map;for(let u of i)l.set(u.stableKey,u);for(let u of t.querySelectorAll("[data-uuid], [data-element-key], [data-primitive], [data-ref], [data-pin], [data-object-id], [data-designator], [data-component]")){let f=Nv(u,r,e);if(f&&!Uu(f)||!f&&!Gv(u))continue;let b=Fv(u,e),g=f?.stableKey||b,p=f?.netUid||"",d=f?.netName||"";u.classList.add("prism-feature"),u.dataset.featureKey=g,u.dataset.sourceId=f?.sourceId||u.dataset.uuid||u.dataset.elementKey||"",u.dataset.role=f?.kind||u.dataset.primitive||u.dataset.ref||"feature",f?.id&&(u.dataset.featureId=String(f.id)),p&&(u.dataset.netUid=p),d&&(u.dataset.netName=d),u.id||(u.id=`prism-feature-${eo(g)}`),Lu(o,g,u),l.set(g,f||{id:0,stableKey:g,kind:u.dataset.role,sourceId:u.dataset.sourceId,sheetInstancePath:e.sheetInstancePath||""}),p&&Lu(c,p,u)}for(let[u,f]of o){let b=l.get(u),g=Du(f);b&&g&&(b.domBoundsMm=Lv(b.boundsMm,g))}return{featureToElements:o,netToElements:c,featureByKey:l,byId:n,bySource:r,features:i}}function Nv(t,e,s){let a=[t.dataset.uuid,t.dataset.elementKey,t.dataset.sourceId,t.dataset.objectId,t.dataset.componentUid,t.dataset.componentUuid,t.dataset.ref&&`${t.dataset.ref}:${t.dataset.pin||""}`].filter(Boolean).flatMap(i=>e.get(i)||[]);if(!a.length)return null;let n=String(t.dataset.primitive||t.dataset.ref||t.dataset.pin||"").toLowerCase();return a.map(i=>({feature:i,score:Bv(i,n,s)})).sort((i,o)=>o.score-i.score)[0].feature}function Bv(t,e,s){let r=0,a=String(t.kind||"").toLowerCase();return t.sheetInstancePath===s.sheetInstancePath&&(r+=20),t.netUid&&(r+=4),e&&a.includes(e)&&(r+=8),e==="symbol"&&a==="symbol_body"&&(r+=12),(e==="label"||e==="port")&&(a.includes("label")||a.includes("port"))&&(r+=12),e==="sheet"&&a==="sheet"&&(r+=12),a!=="record"&&(r+=2),a.includes("pin")&&(r+=2),r}function Cv(t,e){let s=t.sourceId||t.sourceUid||t.uuid||t.objectId||t.stableKey||"";return{...t,id:Number(t.id||0),sourceId:s,stableKey:t.stableKey||`${e.sheetInstancePath||e.id}|${s}|0|${t.kind||"feature"}|0`,sheetInstancePath:t.sheetInstancePath||e.sheetInstancePath||""}}function Ov(t){let e=new Set([t.sourceId,t.sourceUid,t.uuid,t.objectId,t.stableKey].filter(Boolean).map(String));return t.reference&&t.pinNumber&&e.add(`${t.reference}:${t.pinNumber}`),t.componentDesignator&&e.add(t.componentDesignator),t.reference&&e.add(t.reference),[...e]}function Fv(t,e){let s=t.dataset.uuid||t.dataset.elementKey||t.dataset.objectId||t.dataset.ref||t.id||"svg",r=t.dataset.primitive||t.dataset.role||t.localName||"feature";return`${e.sheetInstancePath||e.id}|${s}|0|${r}|0`}function Pv(t){let e=document.createElementNS(fr,"style");e.textContent=`
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
  `,t.prepend(e)}function Ou(t){let e=document.createElementNS(fr,"g");return e.setAttribute("class","prism-svg-net-overlay"),e.setAttribute("data-prism-overlay","net-highlight"),t.append(e),e}function Fu(t){let e=document.createElementNS(fr,"g");return e.setAttribute("class","prism-svg-selection-overlay"),e.setAttribute("data-prism-overlay","selection"),e.style.pointerEvents="none",t.append(e),e}function jv(t){let e=t.cloneNode(!0);e.removeAttribute("id"),e.removeAttribute("data-feature-key"),e.removeAttribute("data-net-uid"),e.removeAttribute("data-net-name"),e.classList.add("prism-svg-net-overlay-clone");for(let s of[e,...Array.from(e.querySelectorAll?.("*")||[])])s instanceof SVGElement&&(s.removeAttribute("filter"),s.style.pointerEvents="none",s.style.stroke="#18ef52",s.style.fill="none",s.style.opacity="0.98",s.style.vectorEffect="non-scaling-stroke");return e}function Du(t){let e=null;for(let s of t)if(s.getBBox)try{let r=s.getBBox(),a=[r.x,r.y,r.x+r.width,r.y+r.height];e=e?[Math.min(e[0],a[0]),Math.min(e[1],a[1]),Math.max(e[2],a[2]),Math.max(e[3],a[3])]:a}catch{}return e}function Lv(t,e){return t?e?[Math.min(t[0],e[0]),Math.min(t[1],e[1]),Math.max(t[2],e[2]),Math.max(t[3],e[3])]:t:e}function Ga(t,e){let s=t.getAttribute("viewBox");if(s){let r=s.trim().split(/[\s,]+/).map(Number);if(r.length===4&&r.every(Number.isFinite))return r}return[0,0,e.sourceWidthMm||e.widthMm||1,e.sourceHeightMm||e.heightMm||1]}function Pu(){return{featureToElements:new Map,netToElements:new Map,featureByKey:new Map,byId:new Map,bySource:new Map,features:[]}}function Dv(t){let e=t?.container?.getBoundingClientRect?.();if(!t?.svg||!t?.page||!e?.width||!e?.height)return .1;let s=Ga(t.svg,t.page);return Math.max(s[2]/e.width,s[3]/e.height)}function Uv(t){let e=String(t?.kind||"").toLowerCase(),s=String(t?.semanticRole||"").toLowerCase(),r=`${t?.sourceId||""} ${t?.objectId||""} ${t?.text||""}`.toLowerCase();return e.includes("page")||s.includes("page")||e.includes("background")||s.includes("background")||r.includes("background")||r.includes("sheet_header")||r.includes("sheet header")||r.includes("drawing-sheet")}function zv(t){let e=String(t?.kind||t?.semanticRole||"").toLowerCase();return e.includes("pin")?90:e.includes("label")||e.includes("port")?78:e.includes("wire")||e.includes("bus")||e.includes("junction")?70:e.includes("symbol")||e.includes("component")?54:e.includes("image")?30:20}function Uu(t){if(!t||Uv(t))return!1;let e=String(t.kind||t.semanticRole||"").toLowerCase();return["pin","label","port","wire","bus","junction","no_connect","symbol","component","sheet","image","text"].some(s=>e.includes(s))}function Gv(t){let e=`${t?.dataset?.primitive||""} ${t?.dataset?.ref||""} ${t?.dataset?.role||""} ${t?.dataset?.objectId||""} ${t?.dataset?.text||""}`.toLowerCase();return!e||e.includes("background")||e.includes("sheet_header")||e.includes("sheet header")||e.includes("drawing-sheet")?!1:["pin","label","port","wire","bus","junction","no_connect","symbol","component","sheet","image","text"].some(s=>e.includes(s))}function ju(t){return String(t?.kind||t?.feature?.kind||"").toLowerCase()==="sheet"}function Lu(t,e,s){t.has(e)||t.set(e,[]),t.get(e).push(s)}function zu(t){let e=String(t||"").trim().toLowerCase();return!e||e.startsWith("#")?!1:e.startsWith("javascript:")||e.startsWith("data:")||e.startsWith("http://")||e.startsWith("https://")}function Kv(t){return/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(String(t||"").trim())}function Vv(t){let e=String(t||"").trim();return e&&!e.startsWith("#")&&!/^[a-z][a-z0-9+.-]*:/i.test(e)}function Hv(t){return String(t||"").replace(/url\(([^)]+)\)/gi,(e,s)=>{let r=s.trim().replace(/^['"]|['"]$/g,"");return zu(r)?"none":e})}function qv(t,e){let s=String(t||"");return s=s.replace(/url\(#([^)]+)\)/g,(r,a)=>e.has(a)?`url(#${e.get(a)})`:r),s=s.replace(/^#(.+)$/,(r,a)=>e.has(a)?`#${e.get(a)}`:r),s}function eo(t){return String(t||"").trim().replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,96)||"item"}function za(t,e,s){return Math.max(e,Math.min(s,t))}function Vu(t,e,s,r){let{right:a,up:n,back:i}=t.basis(),o=Math.tan(t.fov/2),c=Ce(t.focus,Me(i,t.distance)),l=$e(Ce(Ce(Me(i,-1),Me(a,e*o*r)),Me(n,s*o)));return{origin:c,direction:l}}function Hu(t,e,s){let r=qu(Array.from(t,Number));if(!r)return null;let a=l=>{let u=[0,1,2,3].map(f=>r[f]*e+r[4+f]*s+r[8+f]*l+r[12+f]);return u.slice(0,3).map(f=>f/u[3])},n=a(1),o=a(0).map((l,u)=>l-n[u]),c=Math.hypot(...o);return c>0?{origin:n,direction:o.map(l=>l/c)}:null}function qu(t){let e=new Array(16);e[0]=t[5]*t[10]*t[15]-t[5]*t[11]*t[14]-t[9]*t[6]*t[15]+t[9]*t[7]*t[14]+t[13]*t[6]*t[11]-t[13]*t[7]*t[10],e[4]=-t[4]*t[10]*t[15]+t[4]*t[11]*t[14]+t[8]*t[6]*t[15]-t[8]*t[7]*t[14]-t[12]*t[6]*t[11]+t[12]*t[7]*t[10],e[8]=t[4]*t[9]*t[15]-t[4]*t[11]*t[13]-t[8]*t[5]*t[15]+t[8]*t[7]*t[13]+t[12]*t[5]*t[11]-t[12]*t[7]*t[9],e[12]=-t[4]*t[9]*t[14]+t[4]*t[10]*t[13]+t[8]*t[5]*t[14]-t[8]*t[6]*t[13]-t[12]*t[5]*t[10]+t[12]*t[6]*t[9],e[1]=-t[1]*t[10]*t[15]+t[1]*t[11]*t[14]+t[9]*t[2]*t[15]-t[9]*t[3]*t[14]-t[13]*t[2]*t[11]+t[13]*t[3]*t[10],e[5]=t[0]*t[10]*t[15]-t[0]*t[11]*t[14]-t[8]*t[2]*t[15]+t[8]*t[3]*t[14]+t[12]*t[2]*t[11]-t[12]*t[3]*t[10],e[9]=-t[0]*t[9]*t[15]+t[0]*t[11]*t[13]+t[8]*t[1]*t[15]-t[8]*t[3]*t[13]-t[12]*t[1]*t[11]+t[12]*t[3]*t[9],e[13]=t[0]*t[9]*t[14]-t[0]*t[10]*t[13]-t[8]*t[1]*t[14]+t[8]*t[2]*t[13]+t[12]*t[1]*t[10]-t[12]*t[2]*t[9],e[2]=t[1]*t[6]*t[15]-t[1]*t[7]*t[14]-t[5]*t[2]*t[15]+t[5]*t[3]*t[14]+t[13]*t[2]*t[7]-t[13]*t[3]*t[6],e[6]=-t[0]*t[6]*t[15]+t[0]*t[7]*t[14]+t[4]*t[2]*t[15]-t[4]*t[3]*t[14]-t[12]*t[2]*t[7]+t[12]*t[3]*t[6],e[10]=t[0]*t[5]*t[15]-t[0]*t[7]*t[13]-t[4]*t[1]*t[15]+t[4]*t[3]*t[13]+t[12]*t[1]*t[7]-t[12]*t[3]*t[5],e[14]=-t[0]*t[5]*t[14]+t[0]*t[6]*t[13]+t[4]*t[1]*t[14]-t[4]*t[2]*t[13]-t[12]*t[1]*t[6]+t[12]*t[2]*t[5],e[3]=-t[1]*t[6]*t[11]+t[1]*t[7]*t[10]+t[5]*t[2]*t[11]-t[5]*t[3]*t[10]-t[9]*t[2]*t[7]+t[9]*t[3]*t[6],e[7]=t[0]*t[6]*t[11]-t[0]*t[7]*t[10]-t[4]*t[2]*t[11]+t[4]*t[3]*t[10]+t[8]*t[2]*t[7]-t[8]*t[3]*t[6],e[11]=-t[0]*t[5]*t[11]+t[0]*t[7]*t[9]+t[4]*t[1]*t[11]-t[4]*t[3]*t[9]-t[8]*t[1]*t[7]+t[8]*t[3]*t[5],e[15]=t[0]*t[5]*t[10]-t[0]*t[6]*t[9]-t[4]*t[1]*t[10]+t[4]*t[2]*t[9]+t[8]*t[1]*t[6]-t[8]*t[2]*t[5];let s=t[0]*e[0]+t[1]*e[4]+t[2]*e[8]+t[3]*e[12];return Math.abs(s)<1e-30?null:e.map(r=>r/s)}function Gu(t,e){return[0,1,2].map(s=>t[s]*e[0]+t[4+s]*e[1]+t[8+s]*e[2]+t[12+s])}function Ku(t,e){return[0,1,2].map(s=>t[s]*e[0]+t[4+s]*e[1]+t[8+s]*e[2])}function Wv(t,e,s){let r=-1/0,a=1/0;for(let n=0;n<3;n+=1){if(Math.abs(e[n])<1e-15){if(t[n]<s[n]||t[n]>s[n+3])return!1;continue}let i=(s[n]-t[n])/e[n],o=(s[n+3]-t[n])/e[n];r=Math.max(r,Math.min(i,o)),a=Math.min(a,Math.max(i,o))}return a>=Math.max(r,0)}function Xv(t,e,s){let r=null;for(let a of t){if(a.bounds&&!Wv(e,s,a.bounds))continue;let n=a.position,i=a.indices,o=i?i.length:n.length/3;for(let c=0;c+2<o;c+=3){let l=(i?i[c]:c)*3,u=(i?i[c+1]:c+1)*3,f=(i?i[c+2]:c+2)*3,b=[n[u]-n[l],n[u+1]-n[l+1],n[u+2]-n[l+2]],g=[n[f]-n[l],n[f+1]-n[l+1],n[f+2]-n[l+2]],p=Ye(s,g),d=st(b,p);if(Math.abs(d)<1e-18)continue;let m=[e[0]-n[l],e[1]-n[l+1],e[2]-n[l+2]],h=st(m,p)/d;if(h<0||h>1)continue;let y=Ye(m,b),w=st(s,y)/d;if(w<0||h+w>1)continue;let v=st(g,y)/d;v>1e-12&&(!r||v<r.t)&&(r={t:v,normal:Ye(b,g)})}}return r}function Wu(t,e){let s=null;for(let r of t){let a=qu(r.matrix);if(!a)continue;let n=Gu(a,e.origin),i=Ku(a,e.direction),o=Xv(r.primitives,n,i);if(!o)continue;let c=Gu(r.matrix,Ce(n,Me(i,o.t))),l=Math.hypot(...c.map((b,g)=>b-e.origin[g]));if(s&&l>=s.distance)continue;let u=[a[0],a[4],a[8],0,a[1],a[5],a[9],0,a[2],a[6],a[10],0,0,0,0,1],f=$e(Ku(u,o.normal));st(f,e.direction)>0&&(f=Me(f,-1)),s={key:r.key,point:c,normal:f,distance:l}}return s?{key:s.key,point:s.point,normal:s.normal}:null}function $u(t,e,s=0){return[t/1e3,-e/1e3,s]}function $v({rotation:t=0,mirror:e=!1,tilt:s=0}){let r=e?[-1,0,0]:[1,0,0],a=[0,1,0],n=e?[0,0,-1]:[0,0,1],i=Math.cos(t),o=Math.sin(t),c=r.map((p,d)=>i*p+o*a[d]),l=a.map((p,d)=>-o*r[d]+i*p),u=Math.cos(s),f=Math.sin(s),b=n.map((p,d)=>u*p-f*l[d]),g=l.map((p,d)=>f*n[d]+u*p);return{right:c,up:g,back:b}}function so(t,e,s,r,a=0){let{up:n,back:i}=$v(t),o=$u(t.center[0],t.center[1],a),c=r*3,l=o.map((b,g)=>b+i[g]*c),u=1/(t.zoom*1e3),f=Qr(e*u,s*u,-r*40,r*40);return Tt(f,Jr(l,o,n))}function Yv(t,e,s,r){let[a,n,i]=r,o=t[0]*a+t[4]*n+t[8]*i+t[12],c=t[1]*a+t[5]*n+t[9]*i+t[13],l=t[3]*a+t[7]*n+t[11]*i+t[15];return l>0?[(o/l+1)/2*e,(1-c/l)/2*s]:null}function hr(t){let e=t[0]*1e3,s=t[3]*1e3,r=-t[4]*1e3,a=-t[1]*1e3;return{box:{x:e,y:r,w:s-e,h:a-r},bottom:t[2]+t[5]<0}}function ro(t,e){return t?e?t[2]:t[5]:0}function Yu(t,e,s,r,a){let n=At(t),i=so(e,s,r,n,e.focusZ??0);return Yv(i,s,r,$u(a[0],a[1],e.focusZ??0))}var Jv=([t,e,s,r])=>({x:Math.min(t,s),y:Math.min(e,r),w:Math.abs(s-t),h:Math.abs(r-e)}),to=t=>[t.x+t.w/2,t.y+t.h/2],Xu=new WeakMap;function Qv(t,e){let s=Xu.get(t);if(s)return s;let r=new Map,a=new Map;for(let c of t.features.values()){if(c.sourceUid&&r.set(String(c.sourceUid),c),c.kind!=="pad")continue;let l=/^(.*):pad:\d+:(.+)$/.exec(String(c.sourceUid||""));if(!l)continue;let u=`${l[1]}\0${l[2]}`;a.has(u)||a.set(u,[]),a.get(u).push(c)}let n=new Map;for(let c of e?.physical_objects||[])c.kind==="footprint_body"&&c.designator&&c.bbox_mm?.length===4&&n.set(c.designator,c);let i=new Map((e?.physical_objects||[]).map(c=>[c.uid,c])),o={bySource:r,padsByFootprintPin:a,bodies:n,objects:i};return Xu.set(t,o),o}function Ju({scene:t,topology:e},s,r){let a=String(s),n=t.componentFeatures.get(a);if(!n)return null;let i=Qv(t,e),o=t.features.get(Number(n.featureId)),c=i.bodies.get(a),l=o?.bounds?hr(o.bounds).box:c?Jv(c.bbox_mm.map(Number)):null,u=o?.bounds?hr(o.bounds).bottom:String(c?.layer||"").startsWith("B."),f=null;if(r!=null&&r!==""){let g=(e?.terminals||[]).find(d=>d.designator===a&&String(d.pin)===String(r)),p=g?.pcb_pad_id?i.objects.get(g.pcb_pad_id):null;if(f=p?.source_ids?.[0]&&i.bySource.get(String(p.source_ids[0]))||null,!f){let d=i.padsByFootprintPin.get(`${n.footprint}\0${r}`)||[],m=l?to(l):null,h=1/0;for(let y of d){let w=to(hr(y.bounds).box),v=m?Math.hypot(w[0]-m[0],w[1]-m[1]):0;v<h&&([h,f]=[v,y])}}}let b=f?.bounds?hr(f.bounds).box:null;return!l&&b&&(l=b,u=hr(f.bounds).bottom),l?{reference:a,pin:f?String(r):null,focus:l,anchor:to(b||l),anchorBox:b,bottom:u,surfaceZ:ro(t.runtimeBounds,u)}:null}var Va=class{#e=new Map;constructor(e=3e3){this.ttlMs=e}get size(){return this.#e.size}record(e,s,r){this.#e.set(e,{matrix:s,at:r})}release(e){this.#e.delete(e)}clear(){this.#e.clear()}active(e){let s=[];for(let[r,a]of this.#e)e-a.at>this.ttlMs?this.#e.delete(r):s.push(a.matrix);return s}};var Xa=1.5*1024*1024*1024;function ao(t){let e=Number(t);return Number.isFinite(e)&&e>0?e:Xa}function Qu(t,e){if(e.netName||e.netUid){let s=e.netUid&&t.find(r=>r.uid===e.netUid)||e.netName&&ns(t,e.netName);return s?{kind:"net",id:Number(s.id)}:{kind:"unresolved"}}return e.netId?{kind:"net",id:Number(e.netId)}:e.featureId?{kind:"feature",id:Number(e.featureId)}:e.reference?{kind:"component",reference:String(e.reference)}:{kind:"board"}}function Zu(t,e){if(!t||!e||t.occurrence!=null)return!1;let s=r=>String(r??"");return t.reference||e.reference?s(t.reference)===s(e.reference)&&s(t.pin)===s(e.pin):t.featureId&&e.featureId?Number(t.featureId)===Number(e.featureId):t.netName&&e.netName?s(t.netName)===s(e.netName):t.netCode&&e.netCode?Number(t.netCode)===Number(e.netCode):!1}function ef(t,e){if(e.kind==="net")t.selectNet(e.id,!0);else if(e.kind==="feature")t.selectFeature(e.id,!0);else if(e.kind==="component")t.selectComponent(e.reference,!0);else return!1;return!0}function tf(t,e){return e&&!t?"enter":!e&&t?"leave":null}function Zv(t){return(Array.isArray(t)?t:[]).map((e,s)=>{let r=$c(e?.color??xs[s%xs.length]);return{key:String(e?.key??s),mark:r,color:`#${(r&16777215).toString(16).padStart(6,"0")}`,members:(Array.isArray(e?.members)?e.members:[]).filter(a=>a&&typeof a.occurrence=="string"&&typeof a.net=="string")}})}function no(){return{selection:null,gpuBudget:null}}var ex=Object.freeze(["setSelection","resize","getViewState","setLayerVisible","applyLayerPreset","setShowBoard","setShowComponents","setShowPlaceholders","setRealisticColors","setBoardLayerVisible","setSeparation","showNetLayers","setNetIsolation","setStatsOverlay","getStats","setLodOverride","setGpuBudget","pickAt","projectComponent","projectPoint"]),Ha=class{#e=null;constructor(e=no()){this.shared=e}get attachedPort(){return this.#e}get port(){let e=this.#e;return e?.isCurrent?.()===!1?null:e}attach(e){if(!e)throw new TypeError("A mode controller attaches to a mounted scene port");this.detach(),this.#e=e,this.replay(e)}detach(){let e=this.#e;this.#e=null,this.release(),e?.dispose?.()}replay(){}release(){}setSelection(e){this.shared.selection=e||null;let s=this.port;s?.takeEcho?.(this.shared.selection)||s&&s.quietly(()=>this.applySelection(s,this.shared.selection))}setGpuBudget(e){this.shared.gpuBudget=e,this.port?.setGpuBudget(ao(e))}resize(){this.port?.resize()}getViewState(){return this.port?.getViewState()??null}setLayerVisible(e,s,r=null){this.port?.setLayerVisible(e,s,r)}applyLayerPreset(e,s=null){this.port?.applyLayerPreset(e,s)}setShowBoard(e){this.port?.setShowBoard(e)}setShowComponents(e){this.port?.setShowComponents(e)}setShowPlaceholders(e){this.port?.setShowPlaceholders(e)}setRealisticColors(e){this.port?.setRealisticColors(e)}setBoardLayerVisible(e,s,r){this.port?.setBoardLayerVisible(e,s,r)}setSeparation(e,s=null){this.port?.setSeparation(e,s)}showNetLayers(){this.port?.showNetLayers()}setNetIsolation(e){this.port?.setNetIsolation(e)}setStatsOverlay(e){this.port?.setStatsOverlay(e)}getStats(){return this.port?.stats()??null}setLodOverride(e){this.port?.setLodOverride(e)}pickAt(e,s){return Promise.resolve(this.port?.pickAt(e,s)??null)}projectComponent(e,s){return this.port?.projectComponent(e,s)??null}projectPoint(e,s){return this.port?.projectPoint(e,s)??null}},tx=Object.freeze(["setHighlightedNets","setHiddenComponents","getComponentReferences","setViewMode","renderInset","insetReady","insetSurfaceZ","releaseInset","insetTarget","projectInset","onSceneChange","insetStats","insetSettings","gpuIdle","loadAnalyticPack","setAnalyticOverlay","setAnalyticVectors","setAnalyticStyle","analyticColormaps","setAnalyticRelief","setClickSelect","analyticProbe","analyticAt","analyticStats","unloadAnalyticPack","loadMeshPack","meshPacks","setMeshPack","setMeshStyle","setMeshSelection","meshElement","meshElementAt","meshWorst","frameMeshElement","meshMarkers","meshStats","unloadMeshPack","cameraState","setCameraState"]),qa=class extends Ha{#e=[];#r=null;#a="pcb";#n=new Set;#o=null;#t=null;#i=!0;#c=null;#l=new Map;#s={shown:null,style:null,selection:null};attach(e,{workspace:s="pcb"}={}){this.#a=s,super.attach(e)}replay(e){this.#o=e.onSceneChange?.(()=>this.#u())??null,this.#u(),e.setWorkspace(this.#a),this.#r&&e.setHiddenComponents(this.#r),this.shared.gpuBudget!=null&&e.setGpuBudget(ao(this.shared.gpuBudget)),this.shared.selection&&e.quietly(()=>this.applySelection(e,this.shared.selection)),this.#e.length&&this.#d(e,this.#e),this.#t&&this.#f(e,this.#t),this.#l.size&&this.#h(e),this.#i||e.setClickSelect(!1)}async#f(e,s){await e.loadAnalyticPack(s.bytes,s.options),s.overlay&&e.setAnalyticOverlay(s.overlay),this.#c&&e.setAnalyticRelief(this.#c),s.style&&e.setAnalyticStyle(s.style),s.vectors&&e.setAnalyticVectors(s.vectors)}async#h(e){for(let[s,r]of this.#l)await e.loadMeshPack(r,{key:s});this.port===e&&(this.#s.style&&e.setMeshStyle(this.#s.style),this.#s.shown!=null&&e.setMeshPack(this.#s.shown),this.#s.selection!=null&&e.setMeshSelection(this.#s.selection))}release(){this.#o?.(),this.#o=null}applySelection(e,s){s?.occurrence!=null&&e.selectOccurrence(s.occurrence),s?ef(e,Qu(e.nets(),s)):e.clearSelection()}setWorkspace(e){this.#a=e,this.port?.setWorkspace(e)}setHighlightedNets(e){this.#e=Array.isArray(e)?[...e]:[];let s=this.port;s&&this.#d(s,this.#e)}#d(e,s){let r=Wc(e.nets(),s),a=e.anyEmphasis();e.setHighlightedNetIds(r);let n=e.anyEmphasis(),i=tf(a,n);i==="enter"?e.showNetProbe():i==="leave"&&e.restoreVisibility(),e.isolating()&&n&&e.isolateLitNets()}setHiddenComponents(e){this.#r=Array.isArray(e)?[...e]:[],this.port?.setHiddenComponents(this.#r)}getComponentReferences(){return this.port?.getComponentReferences()??[]}setViewMode(e){this.port?.setViewMode(e)}renderInset(e,s,r){return!!this.port?.renderInset(e,s,r)}insetReady(){return!!this.port?.insetReady()}insetSurfaceZ(e){let s=this.port;return s?ro(s.insetBoard().scene.runtimeBounds,!!e):0}releaseInset(e){this.port?.releaseInset(String(e))}insetTarget(e,s){let r=this.port;return r?Ju(r.insetBoard(),e,s):null}projectInset(e,s,r,a){let n=this.port;return n?Yu(n.insetBoard().scene.runtimeBounds,e,s,r,a):null}onSceneChange(e){return this.#n.add(e),()=>this.#n.delete(e)}#u(){for(let e of this.#n)e()}insetStats(){return this.port?.insetStats()??null}insetSettings(e){return this.port?.insetSettings(e)??null}gpuIdle(){return this.port?.gpuIdle()??Promise.resolve()}async loadAnalyticPack(e,s={}){let r=e instanceof Uint8Array?e:new Uint8Array(e);return this.#t={bytes:r,options:s,overlay:null,vectors:null,style:this.#t?.style??null},this.port?this.port.loadAnalyticPack(r,s):null}setAnalyticOverlay(e){return this.#t&&(this.#t.overlay=e),this.port?.setAnalyticOverlay(e)??null}setAnalyticVectors(e){return this.#t&&(this.#t.vectors=e),this.port?.setAnalyticVectors(e)??null}setAnalyticStyle(e){return this.#t&&(this.#t.style={...this.#t.style||{},...e}),this.port?.setAnalyticStyle(e)??null}analyticColormaps(){return this.port?.analyticColormaps()??null}setAnalyticRelief(e){return this.#c=e||null,this.port?.setAnalyticRelief(this.#c)??null}setClickSelect(e){this.#i=e!==!1,this.port?.setClickSelect(this.#i)}analyticProbe(e,s){return this.port?.analyticProbe(e,s)??null}analyticAt(e,s){return this.port?.analyticAt(e,s)??Promise.resolve(null)}analyticStats(){return this.port?.analyticStats()??null}unloadAnalyticPack(){this.#t=null,this.port?.unloadAnalyticPack()}cameraState(){return this.port?.cameraState()??null}setCameraState(e){return!!this.port?.setCameraState(e)}async loadMeshPack(e,s={}){let r=e instanceof Uint8Array?e.slice():new Uint8Array(e),a=this.port;if(!a){let i=String(s.key??`mesh ${this.#l.size+1}`);return this.#l.set(i,r),null}let n=await a.loadMeshPack(r,s);return n&&this.#l.set(n.key,r),n}meshPacks(){return this.port?.meshPacks()??[]}setMeshPack(e){return this.#s.shown=e??null,this.#s.selection=null,this.port?.setMeshPack(this.#s.shown)??null}setMeshStyle(e){return this.#s.style={...this.#s.style||{},...e||{}},this.port?.setMeshStyle(e)??null}setMeshSelection(e){this.#s.selection=Number.isInteger(e)?e:null,this.port?.setMeshSelection(this.#s.selection)}meshElement(e){return this.port?.meshElement(e)??null}meshElementAt(e,s){return this.port?.meshElementAt(e,s)??null}meshWorst(e){return this.port?.meshWorst(e)??[]}frameMeshElement(e,s){let r=!!this.port?.frameMeshElement(e,s);return r&&(this.#s.selection=Number(e)),r}meshMarkers(){return this.port?.meshMarkers()??[]}meshStats(){return this.port?.meshStats()??null}unloadMeshPack(e){this.#l.delete(String(e)),this.#s.shown===String(e)&&(this.#s.shown=null),this.port?.unloadMeshPack(e)}},sx=Object.freeze(["setSystemScene","setNetEmphasis","frameNetEmphasis","frameAll","frameBoard","frameParts","setMoveMode","setMoveSpace","previewPose","cancelMove","getMoveState","setAssemblyExplode","setMoveSnap","pickSurfaceAt","setRouteMode","setLabelsVisible","setHelpVisible","isHelpVisible","viewAxis"]),Wa=class extends Ha{#e=null;#r=null;#a=null;#n=!1;#o=!1;#t=0;#i={...Xt};attach(e,{moveAllowed:s=!1}={}){this.#n=!!s,super.attach(e)}replay(e){this.shared.gpuBudget!=null&&e.setGpuBudget(ao(this.shared.gpuBudget)),this.#e&&e.setSystemScene(this.#e),this.#r&&this.#c(e,this.#r),e.setMoveAllowed(this.#n),e.setRouteMode(this.#o),e.setAssemblyExplode(this.#t),e.setMoveSnap({...this.#i}),this.#a!=null&&e.setLabelsVisible(this.#a)}applySelection(e,s){if(!s){e.clearSelection();return}if(e.focusPlacement(s.occurrence)!=="board")return;let r=Qu(e.nets(),s);r.kind==="board"?e.selectBoardContext():ef(e,r)}setSystemScene(e){this.#e=e||null,e&&this.port?.setSystemScene(e)}setNetEmphasis(e){this.#r=Array.isArray(e)?e:[];let s=this.port;return s?this.#c(s,this.#r):[]}#c(e,s){let r=e.anyEmphasis(),a=e.setEmphasisSets(Zv(s));if(!a)return[];let n=e.anyEmphasis(),i=tf(r,n);return i==="enter"?e.showNetProbe():i==="leave"&&(e.isolating()&&e.setNetIsolation(!1),e.restoreVisibility()),e.isolating()&&n&&e.isolateLitNets(),a}frameNetEmphasis(e=null,s=null){return this.port?.frameNetEmphasis(e,s)??!1}frameAll(){this.port?.frameAll()}frameBoard(e){return this.port?.frameBoard(e)??!1}frameParts(e){return this.port?.frameParts(e)??!1}setMoveAllowed(e){this.#n=!!e,this.port?.setMoveAllowed(this.#n)}setMoveMode(e,s){this.port?.setMoveMode(e,s)}setMoveSpace(e){this.port?.setMoveSpace(e)}setRouteMode(e){this.#o=!!e,this.port?.setRouteMode(this.#o)}previewPose(e){this.port?.previewPose(e)}cancelMove(){this.port?.cancelMove()}getMoveState(){return this.port?.getMoveState()??null}setAssemblyExplode(e){this.#t=Math.max(0,Math.min(1,Number(e)||0)),this.port?.setAssemblyExplode(this.#t)}setMoveSnap(e){this.#i=wa(e,this.#i),this.port?.setMoveSnap({...this.#i})}pickSurfaceAt(e,s){return this.port?.pickSurfaceAt(e,s)??null}setLabelsVisible(e){this.#a=!!e,this.port?.setLabelsVisible(this.#a)}setHelpVisible(e){this.port?.setHelpVisible(e)}isHelpVisible(){return!!this.port?.isHelpVisible()}viewAxis(e,s=!1){this.port?.viewAxis(e,s)}};function sf(t){let e=(s,r)=>{for(let a of s)Object.defineProperty(t,a,{configurable:!0,writable:!0,value(...n){return r(this)[a](...n)}})};e(ex,s=>s.activeMode),e(tx,s=>s.modes.board),e(sx,s=>s.modes.system)}var io=Object.freeze({viridis:["#440154","#482878","#3e4989","#31688e","#26828e","#1f9e89","#35b779","#6ece58","#b5de2b","#fde725"],inferno:["#000004","#1b0c41","#4a0c6b","#781c6d","#a52c60","#cf4446","#ed6925","#fb9b06","#f7d13d","#fcffa4"],magma:["#000004","#180f3d","#440f76","#721f81","#9e2f7f","#cd4071","#f1605d","#fd9668","#feca8d","#fcfdbf"],plasma:["#0d0887","#46039f","#7201a8","#9c179e","#bd3786","#d8576b","#ed7953","#fb9f3a","#fdca26","#f0f921"],cividis:["#00224e","#123570","#3b496c","#575d6d","#707173","#8a8678","#a59c74","#c3b369","#e1cc55","#fee838"],turbo:["#30123b","#4662d7","#36aaf9","#1ae4b6","#72fe5e","#c8ef34","#faba39","#f66b19","#ca2a04","#7a0403"],coolwarm:["#3b4cc0","#6788ee","#9abbff","#c9d7f0","#edd1c2","#f7a889","#e26952","#b40426"],ember:["#e0e3ed","#ff9e1f","#db141a"],ice:["#f4f7fb","#9ecae1","#2171b5","#08306b"],white:["#fafaf5","#fafaf5"],greys:["#f7f7f7","#bdbdbd","#737373","#252525"]}),Qe=256,ls=Object.freeze({fieldColormap:"viridis",arrowColormap:"ember",arrowDensity:70,arrowWidth:.07,arrowMinLength:.3,arrowOutline:[.05,.05,.07,.85]});function rf(t){let e=String(t).replace(/^#/,"");if(!/^[0-9a-fA-F]{6}$/.test(e))throw new TypeError(`colour ${t} is not #rrggbb`);return[0,2,4].map(s=>Number.parseInt(e.slice(s,s+2),16)/255)}function pr(t){if(Array.isArray(t)){if(t.length<2)throw new TypeError("a colormap needs two or more stops");return t.forEach(rf),[...t]}let e=io[t];if(!e)throw new TypeError(`unknown colormap ${t}`);return[...e]}function As(t,e=Qe){let s=pr(t).map(rf),r=new Float32Array(e*4);for(let a=0;a<e;a++){let n=a/(e-1)*(s.length-1),i=Math.min(s.length-2,Math.floor(n)),o=n-i;for(let c=0;c<3;c++)r[a*4+c]=s[i][c]*(1-o)+s[i+1][c]*o;r[a*4+3]=1}return r}function oo(t={},e=ls){let s={...e,...t||{}};pr(s.fieldColormap),pr(s.arrowColormap);let r=(a,n)=>{if(!(Number(s[a])>0&&Number(s[a])<=n))throw new RangeError(`${a} must be in (0, ${n}]`);s[a]=Number(s[a])};if(r("arrowDensity",400),r("arrowWidth",.5),r("arrowMinLength",1),!Array.isArray(s.arrowOutline)||s.arrowOutline.length!==4)throw new TypeError("arrowOutline is [r, g, b, a]");return s}var _s=class{__destroy_into_raw(){let e=this.__wbg_ptr;return this.__wbg_ptr=0,af.unregister(this),e}free(){let e=this.__destroy_into_raw();q.__wbg_analyticpack_free(e,0)}barrelRecords(){let e=q.analyticpack_barrelRecords(this.__wbg_ptr);return vr.__wrap(e)}bindingJson(e){let s,r;try{let i=q.analyticpack_bindingJson(this.__wbg_ptr,e);var a=i[0],n=i[1];if(i[3])throw a=0,n=0,$a(i[2]);return s=a,r=n,kr(a,n)}finally{q.__wbindgen_free(s,r,1)}}headerJson(){let e,s;try{let n=q.analyticpack_headerJson(this.__wbg_ptr);var r=n[0],a=n[1];if(n[3])throw r=0,a=0,$a(n[2]);return e=r,s=a,kr(r,a)}finally{q.__wbindgen_free(e,s,1)}}lowerSlice(e,s){let r=ox(e,q.__wbindgen_malloc,q.__wbindgen_realloc),a=Er,n=q.analyticpack_lowerSlice(this.__wbg_ptr,r,a,s);if(n[2])throw $a(n[1]);return xr.__wrap(n[0])}constructor(e){let s=ix(e,q.__wbindgen_malloc),r=Er,a=q.analyticpack_new(s,r);if(a[2])throw $a(a[1]);return this.__wbg_ptr=a[0],af.register(this,this.__wbg_ptr,this),this}operationNetIndices(e){let s=q.analyticpack_operationNetIndices(this.__wbg_ptr,e);var r=ft(s[0],s[1]).slice();return q.__wbindgen_free(s[0],s[1]*4,4),r}};Symbol.dispose&&(_s.prototype[Symbol.dispose]=_s.prototype.free);var vr=class t{static __wrap(e){let s=Object.create(t.prototype);return s.__wbg_ptr=e,nf.register(s,s.__wbg_ptr,s),s}__destroy_into_raw(){let e=this.__wbg_ptr;return this.__wbg_ptr=0,nf.unregister(this),e}free(){let e=this.__destroy_into_raw();q.__wbg_barrelrecords_free(e,0)}floats(){let e=q.barrelrecords_floats(this.__wbg_ptr);var s=Ya(e[0],e[1]).slice();return q.__wbindgen_free(e[0],e[1]*4,4),s}skipped(){return q.barrelrecords_skipped(this.__wbg_ptr)>>>0}words(){let e=q.barrelrecords_words(this.__wbg_ptr);var s=ft(e[0],e[1]).slice();return q.__wbindgen_free(e[0],e[1]*4,4),s}};Symbol.dispose&&(vr.prototype[Symbol.dispose]=vr.prototype.free);var xr=class t{static __wrap(e){let s=Object.create(t.prototype);return s.__wbg_ptr=e,of.register(s,s.__wbg_ptr,s),s}__destroy_into_raw(){let e=this.__wbg_ptr;return this.__wbg_ptr=0,of.unregister(this),e}free(){let e=this.__destroy_into_raw();q.__wbg_loweredslicerecords_free(e,0)}batches(){let e=q.loweredslicerecords_batches(this.__wbg_ptr);var s=ft(e[0],e[1]).slice();return q.__wbindgen_free(e[0],e[1]*4,4),s}contourEdgeOperations(){let e=q.loweredslicerecords_contourEdgeOperations(this.__wbg_ptr);var s=ft(e[0],e[1]).slice();return q.__wbindgen_free(e[0],e[1]*4,4),s}contourEdges(){let e=q.loweredslicerecords_contourEdges(this.__wbg_ptr);var s=Ya(e[0],e[1]).slice();return q.__wbindgen_free(e[0],e[1]*4,4),s}covers(){let e=q.loweredslicerecords_covers(this.__wbg_ptr);var s=ft(e[0],e[1]).slice();return q.__wbindgen_free(e[0],e[1]*4,4),s}cutIndices(){let e=q.loweredslicerecords_cutIndices(this.__wbg_ptr);var s=ft(e[0],e[1]).slice();return q.__wbindgen_free(e[0],e[1]*4,4),s}edgeCuts(){let e=q.loweredslicerecords_edgeCuts(this.__wbg_ptr);var s=ft(e[0],e[1]).slice();return q.__wbindgen_free(e[0],e[1]*4,4),s}fanVertices(){let e=q.loweredslicerecords_fanVertices(this.__wbg_ptr);var s=Ya(e[0],e[1]).slice();return q.__wbindgen_free(e[0],e[1]*4,4),s}outlineEdges(){let e=q.loweredslicerecords_outlineEdges(this.__wbg_ptr);var s=Ya(e[0],e[1]).slice();return q.__wbindgen_free(e[0],e[1]*4,4),s}outlineShapes(){let e=q.loweredslicerecords_outlineShapes(this.__wbg_ptr);var s=ft(e[0],e[1]).slice();return q.__wbindgen_free(e[0],e[1]*4,4),s}shapeCuts(){let e=q.loweredslicerecords_shapeCuts(this.__wbg_ptr);var s=ft(e[0],e[1]).slice();return q.__wbindgen_free(e[0],e[1]*4,4),s}shapes(){let e=q.loweredslicerecords_shapes(this.__wbg_ptr);var s=ft(e[0],e[1]).slice();return q.__wbindgen_free(e[0],e[1]*4,4),s}statsJson(){let e,s;try{let r=q.loweredslicerecords_statsJson(this.__wbg_ptr);return e=r[0],s=r[1],kr(r[0],r[1])}finally{q.__wbindgen_free(e,s,1)}}subtractShapes(){return q.loweredslicerecords_subtractShapes(this.__wbg_ptr)>>>0}};Symbol.dispose&&(xr.prototype[Symbol.dispose]=xr.prototype.free);function rx(){return{__proto__:null,"./prism_kicad_analytic_bg.js":{__proto__:null,__wbg___wbindgen_throw_bb96b2010945f0bc:function(e,s){throw new Error(kr(e,s))},__wbindgen_cast_0000000000000001:function(e,s){return kr(e,s)},__wbindgen_init_externref_table:function(){let e=q.__wbindgen_externrefs,s=e.grow(4);e.set(0,void 0),e.set(s+0,void 0),e.set(s+1,null),e.set(s+2,!0),e.set(s+3,!1)}}}}var af=typeof FinalizationRegistry>"u"?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(t=>q.__wbg_analyticpack_free(t,1)),nf=typeof FinalizationRegistry>"u"?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(t=>q.__wbg_barrelrecords_free(t,1)),of=typeof FinalizationRegistry>"u"?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(t=>q.__wbg_loweredslicerecords_free(t,1));function Ya(t,e){return t=t>>>0,ax().subarray(t/4,t/4+e)}function ft(t,e){return t=t>>>0,nx().subarray(t/4,t/4+e)}var br=null;function ax(){return(br===null||br.byteLength===0)&&(br=new Float32Array(q.memory.buffer)),br}function kr(t,e){return lx(t>>>0,e)}var gr=null;function nx(){return(gr===null||gr.byteLength===0)&&(gr=new Uint32Array(q.memory.buffer)),gr}var mr=null;function yr(){return(mr===null||mr.byteLength===0)&&(mr=new Uint8Array(q.memory.buffer)),mr}function ix(t,e){let s=e(t.length*1,1)>>>0;return yr().set(t,s/1),Er=t.length,s}function ox(t,e,s){if(s===void 0){let o=wr.encode(t),c=e(o.length,1)>>>0;return yr().subarray(c,c+o.length).set(o),Er=o.length,c}let r=t.length,a=e(r,1)>>>0,n=yr(),i=0;for(;i<r;i++){let o=t.charCodeAt(i);if(o>127)break;n[a+i]=o}if(i!==r){i!==0&&(t=t.slice(i)),a=s(a,r,r=i+t.length*3,1)>>>0;let o=yr().subarray(a+i,a+r),c=wr.encodeInto(t,o);i+=c.written,a=s(a,r,i,1)>>>0}return Er=i,a}function $a(t){let e=q.__wbindgen_externrefs.get(t);return q.__externref_table_dealloc(t),e}var Ja=new TextDecoder("utf-8",{ignoreBOM:!0,fatal:!0});Ja.decode();var cx=2146435072,co=0;function lx(t,e){return co+=e,co>=cx&&(Ja=new TextDecoder("utf-8",{ignoreBOM:!0,fatal:!0}),Ja.decode(),co=e),Ja.decode(yr().subarray(t,t+e))}var wr=new TextEncoder;"encodeInto"in wr||(wr.encodeInto=function(t,e){let s=wr.encode(t);return e.set(s),{read:t.length,written:s.length}});var Er=0,dx,ux,q;function fx(t,e){return ux=t,q=t.exports,dx=e,br=null,gr=null,mr=null,q.__wbindgen_start(),q}async function hx(t,e){if(typeof Response=="function"&&t instanceof Response){if(!t.ok)throw new Error(`failed to fetch Wasm: ${t.status} ${t.statusText} fetching '${t.url}'`);if(typeof WebAssembly.instantiateStreaming=="function")try{return await WebAssembly.instantiateStreaming(t,e)}catch(a){if(s(t.type)&&t.headers.get("Content-Type")!=="application/wasm")console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n",a);else throw a}let r=await t.arrayBuffer();return await WebAssembly.instantiate(r,e)}else{let r=await WebAssembly.instantiate(t,e);return r instanceof WebAssembly.Instance?{instance:r,module:t}:r}function s(r){switch(r){case"basic":case"cors":case"default":return!0}return!1}}async function cf(t){if(q!==void 0)return q;t!==void 0&&(Object.getPrototypeOf(t)===Object.prototype?{module_or_path:t}=t:console.warn("using deprecated parameters for the initialization function; pass a single object instead")),t===void 0&&(t=new URL("prism_kicad_analytic_bg.wasm",import.meta.url));let e=rx();(typeof t=="string"||typeof Request=="function"&&t instanceof Request||typeof URL=="function"&&t instanceof URL)&&(t=fetch(t));let{instance:s,module:r}=await hx(await t,e);return fx(s,r)}var lf={schema:"prism.vendored_wasm.a0",purpose:"Reads materialization packs (kicad_monkey.materialization.a0) in the browser and lowers their slices for the analytic renderer.",source:{repository:"this repository",crate:"prism-kicad-wasm",native_src_rs_tree:"5b03b10ee0e1b0c9d2449fbb47596a4065a1785d",license:"MIT"},build:{target:"wasm32-unknown-unknown",profile:"release",features:["materialization"],wasm_bindgen:"0.2.127",rustc:"rustc 1.98.0 (88d9e12ae 2026-08-18)",command:"node scripts/build-analytic-wasm.mjs"},files:{"prism_kicad_analytic.js":"c93b31ad6ad5e7bc4ef2b0e658e1f514c81a9124dfc6a42db5ea1c5fa96d5fd9","prism_kicad_analytic_bg.wasm":"8fcc4ad15c6f41bc1358b9d739faf9264a06758edf7e587afc11db6b38a3b85d"}};var df="prism-kicad-analytic.wasm",bx="kicad_monkey.materialization.a0",ds=1e3,lo=null;function Is(){return String(lf.files?.["prism_kicad_analytic_bg.wasm"]||"").slice(0,16)}function pf(){let t=Is();try{return new URL(`${df}?v=${t}`,import.meta.url)}catch{return`/${df}?v=${t}`}}function gx(t=pf()){return lo??=cf({module_or_path:t}).catch(e=>{throw lo=null,e}),lo}function mx(t,e,s=ds){let r=t.lowerSlice(e,s);try{return{shapes:new Uint32Array(r.shapes()),subtractShapes:r.subtractShapes(),fanVertices:new Float32Array(r.fanVertices()),covers:new Uint32Array(r.covers()),batches:new Uint32Array(r.batches()),contourEdges:new Float32Array(r.contourEdges()),contourEdgeOperations:new Uint32Array(r.contourEdgeOperations()),shapeCuts:new Uint32Array(r.shapeCuts()),edgeCuts:new Uint32Array(r.edgeCuts()),cutIndices:new Uint32Array(r.cutIndices()),outlineEdges:new Float32Array(r.outlineEdges()),outlineShapes:new Uint32Array(r.outlineShapes()),stats:JSON.parse(r.statsJson())}}finally{r.free()}}function Za(){return String(pf())}async function Mr(t,{wasm:e}={}){await gx(e);let s=new _s(t instanceof Uint8Array?t:new Uint8Array(t)),r=JSON.parse(s.headerJson());if(r.schema!==bx)throw new Error(`unsupported materialization schema ${r.schema}`);return{header:r,lowerSlice(a,n=ds){return mx(s,a,n)},barrels(){let a=s.barrelRecords();try{return{floats:new Float32Array(a.floats()),words:new Uint32Array(a.words()),skipped:a.skipped()}}finally{a.free()}},binding(a){return JSON.parse(s.bindingJson(a))},netIndices(){return new Uint32Array(s.operationNetIndices(Rs(r)))},free(){s.free()}}}function Rs(t){return(t.chunks||[]).reduce((e,s)=>e+Number(s.operation_count||0),0)}function yx(t,e){let s=null;for(let r of t.chunks||[]){if(r.slice_key!==e)continue;let a=r.bounds,n=[a.min_x_nm,a.min_y_nm,a.max_x_nm,a.max_y_nm].map(i=>i/1e6);s=s?[Math.min(s[0],n[0]),Math.min(s[1],n[1]),Math.max(s[2],n[2]),Math.max(s[3],n[3])]:n}return s}var wx={conductor:"copper",solder_mask:"mask",silkscreen:"silk",paste:"paste",dielectric:"dielectric"},bf=1e-6,gf=2e-6,uf=1e-7,ff={"fr4 natural":[109,116,75],"ptfe natural":[252,252,250],polyimide:[205,130,0],"phenolic natural":[92,17,6],aluminum:[213,213,213]};function vx(t){let e=String(t||"").trim(),s=/^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(e);return[...(s?[0,2,4].map(a=>parseInt(s[1].slice(a,a+2),16)):ff[e.toLowerCase()]||ff["fr4 natural"]).map(a=>a/255),1]}function mf(t,e,s=0){let r=new Map((e||[]).map(d=>[String(d.name),d])),a=[...t.stack?.slices||[]].sort((d,m)=>d.order-m.order),n=a.filter(d=>d.role==="conductor"),i=d=>Number(r.get(String(d?.kicad_layer||""))?.id||0),o=i(n[0]),c=i(n[n.length-1]),l=[],u=[];for(let d of a){let m=wx[d.role],h=r.get(String(d.kicad_layer||"")),y=yx(t,d.key);if(!m||!h||!y){m&&u.push(d.key);continue}let w=Number(h.z_mm||0)/1e3+s,v=(Number(h.thickness_mm)||Number(d.thickness_nm||0)/1e6)/2e3,x=d.side==="back"||m!=="dielectric"&&m!=="copper"&&w<s,S={key:d.key,role:m,layerId:Number(h.id),side:d.side||null,bounds:y};if(m==="dielectric"){S.color=vx(h.color);let T=[...n].reverse().find(B=>B.order<d.order),A=n.find(B=>B.order>d.order),_=[i(T)||i(A),i(A)||i(T)],N={zTop:w+v,zBottom:w-v};l.push({...S,...N,face:"top",z:w+v-uf,faceDown:!1,outer:!1,offsetLayers:_}),l.push({...S,...N,face:"bottom",z:w-v+uf,faceDown:!0,outer:!1,offsetLayers:_})}else if(m==="copper"){let T=n.indexOf(d),A=T===n.length-1&&n.length>1,_=T===0||A,N={...S,bottom:A,outer:_,zTop:w+v,zBottom:w-v,offsetLayers:[Number(h.id),Number(h.id)]};l.push({...N,face:"top",z:w+v,faceDown:!1,mark:_&&!A,walls:!A}),l.push({...N,face:"bottom",z:w-v,faceDown:!0,mark:A,walls:A})}else{let T=m==="silk"?gf:m==="paste"?bf:0,A=x?c:o;l.push({...S,z:x?w-v-T:w+v+T,faceDown:x,outer:!1,thickness:v*2,offsetLayers:[A,A]})}}xx(l);let f=l.filter(d=>d.role==="dielectric"),b=f.filter(d=>!d.faceDown).sort((d,m)=>m.z-d.z)[0],g=f.filter(d=>d.faceDown).sort((d,m)=>d.z-m.z)[0];for(let d of f)d.skin=d===b||d===g;let p={dielectric:0,copper:1,mask:2,paste:3,silk:4};return l.sort((d,m)=>p[d.role]-p[m.role]),{planned:l,unmatched:u}}function xx(t){for(let e of t){if(e.role!=="mask"&&e.role!=="silk"&&e.role!=="paste")continue;let s=t.find(c=>c.role==="copper"&&c.mark&&c.faceDown===e.faceDown);if(!s)continue;let r=e.faceDown?-1:1,a=e.faceDown?s.zTop:s.zBottom,n=e.faceDown?s.zBottom:s.zTop,o=t.find(c=>c.role==="mask"&&c.faceDown===e.faceDown)?.thickness||0;e.role==="mask"?(e.coat=o,e.zLow=a+r*o):e.role==="silk"?e.zLow=a+r*(o+gf):e.z=n+r*bf}}function po(t,e){let s=new Float32Array(Math.max(1,e)).fill(Number.NaN);if(ArrayBuffer.isView(t)||Array.isArray(t))for(let r=0;r<Math.min(e,t.length);r+=1)s[r]=Number(t[r]);else for(let[r,a]of Object.entries(t||{})){let n=Number(r);Number.isInteger(n)&&n>=0&&n<e&&(s[n]=Number(a))}return s}function Ns(t){let e=1/0,s=-1/0;for(let r of t)Number.isFinite(r)&&(e=Math.min(e,r),s=Math.max(s,r));return Number.isFinite(e)?[e,s]:[0,1]}function en(t){let e=new Map,s=1e3;for(let r of t.slices||[]){if(!(r.nx>0&&r.ny>0)||r.values.length!==r.nx*r.ny)throw new Error(`grid field slice ${r.slice_key} has ${r.values.length} values for ${r.nx} x ${r.ny} cells`);e.set(r.slice_key,{originMm:[(t.origin_x_m+r.ix0*t.dx_m)*s,(t.origin_y_m+r.iy0*t.dy_m)*s],pitchMm:[t.dx_m*s,t.dy_m*s],width:r.nx,height:r.ny,values:r.values})}return e}function yf(t){let e=new Map;for(let r of t||[])e.has(r.slice_key)||e.set(r.slice_key,[]),e.get(r.slice_key).push(r);let s=new Map;for(let[r,a]of e){let n=Number(a[0].pitch_nm);if(!(n>0)||a.some(b=>Number(b.pitch_nm)!==n))throw new Error(`field tiles of ${r} must share one positive pitch`);let i=Math.min(...a.map(b=>b.origin_nm[0])),o=Math.min(...a.map(b=>b.origin_nm[1])),c=(b,g)=>{let p=(b-g)/n;if(!Number.isInteger(p))throw new Error(`field tile of ${r} is off its pitch grid`);return p},l=Math.max(...a.map(b=>c(b.origin_nm[0],i)+b.width)),u=Math.max(...a.map(b=>c(b.origin_nm[1],o)+b.height)),f=new Float32Array(l*u).fill(Number.NaN);for(let b of a){let g=c(b.origin_nm[0],i),p=c(b.origin_nm[1],o);for(let d=0;d<b.height;d+=1)f.set(b.values.subarray?b.values.subarray(d*b.width,(d+1)*b.width):b.values.slice(d*b.width,(d+1)*b.width),(p+d)*l+g)}s.set(r,{originMm:[i/1e6,o/1e6],pitchMm:n/1e6,width:l,height:u,values:f})}return s}var uo=8,Qa=8,hf=4294967295,kx=Object.freeze({unplated:2,tentedFront:4,tentedBack:8,coveredFront:16,coveredBack:32,pluggedFront:64,pluggedBack:128,filled:256,capped:512,castellated:1024}),fo=16;function Ex(t,e,s){let r=null;for(let a=0;t&&a+3<t.length;a+=4){let n=[t[a],t[a+1]],i=[t[a+2],t[a+3]],o=[i[0]-n[0],i[1]-n[1]],c=o[0]*o[0]+o[1]*o[1];if(c<=0)continue;let l=Math.max(0,Math.min(1,((e[0]-n[0])*o[0]+(e[1]-n[1])*o[1])/c)),u=Math.hypot(e[0]-n[0]-l*o[0],e[1]-n[1]-l*o[1]);if(u>s||r&&u>=r.distance)continue;let f=Math.sqrt(c),b=[o[1]/f,o[0]/f];r={distance:u,normal:b,offset:(b[0]*n[0]-b[1]*n[1])/1e3}}return r&&{normal:r.normal,offset:r.offset}}function wf(t,e,s,r=null){let a=(t.stack?.slices||[]).filter(g=>g.role==="conductor").sort((g,p)=>g.order-p.order),n=new Map((s||[]).filter(g=>g.role===void 0||g.role==="copper").map(g=>[g.key,g])),i=g=>{let p=n.get(g.key);if(!p)return null;if(p.zTop!==void 0)return{top:p.zTop,bottom:p.zBottom,layerId:p.layerId};let d=Number(g.thickness_nm||0)/1e9;return p.bottom?{top:p.z+d,bottom:p.z,layerId:p.layerId}:{top:p.z,bottom:p.z-d,layerId:p.layerId}},o=Math.floor(e.floats.length/uo),c=new ArrayBuffer(o*fo*4),l=new Float32Array(c),u=new Uint32Array(c),f=0,b=e.skipped||0;for(let g=0;g<o;g+=1){let p=e.floats.subarray(g*uo,(g+1)*uo),d=e.words.subarray(g*Qa,(g+1)*Qa),[m,h]=[Math.min(d[1],d[2]),Math.max(d[1],d[2])],y=a.filter(T=>T.order>=m&&T.order<=h&&(d[3]===hf||T.order>d[3])&&(d[4]===hf||T.order<d[4])),w=y.length?i(y[0]):null,v=y.length?i(y[y.length-1]):null;if(!w||!v){b+=1;continue}let x=f*fo;l.set([p[0]/1e3,-p[1]/1e3,p[2]/1e3,-p[3],p[4]/1e3,p[5]/1e3,w.top,v.bottom],x),u.set([d[0],w.layerId,v.layerId,d[5]],x+8);let S=d[5]&kx.castellated?Ex(r,[p[0],p[1]],p[4]+p[2]):null;l.set(S?[S.normal[0],S.normal[1],S.offset,0]:[0,0,1,0],x+12),f+=1}return{data:c.slice(0,f*fo*4),count:f,skipped:b}}var ho=12,Mx=0,Sx=1;function vf(t,e,s,r=0){let a=(s||[]).filter(g=>g.role==="soldermask").map(g=>Number(g.z_mm)/1e3+r+Math.sign(Number(g.z_mm))*Number(g.thickness_mm||0)/2e3),n=a.length?Math.max(...a):null,i=a.length?Math.min(...a):null,o=t.filter(g=>g.role==="dielectric"&&g.face==="top"&&e.get(g.key)?.contourEdges?.length),c=[],l=(g,p,d,m,h,y)=>{let w=e.get(g.key).contourEdges;for(let v=0;v+3<w.length;v+=4)c.push([w[v],w[v+1],w[v+2],w[v+3],p,d,m,h,y])};for(let g of o)l(g,g.zTop,g.zBottom,g.offsetLayers[0],g.offsetLayers[1],Mx);for(let g of t.filter(p=>p.role==="copper"&&p.face==="top")){let p=v=>Math.min(Math.abs(v.zBottom-g.zTop),Math.abs(v.zTop-g.zBottom)),d=[...o].sort((v,x)=>p(v)-p(x))[0];if(!d)continue;let m=g.outer&&!g.bottom,h=g.outer&&g.bottom,y=m&&n!=null?Math.max(n,g.zTop):g.zTop,w=h&&i!=null?Math.min(i,g.zBottom):g.zBottom;l(d,y,w,g.layerId,g.layerId,Sx)}let u=new ArrayBuffer(c.length*ho*4),f=new Float32Array(u),b=new Uint32Array(u);return c.forEach(([g,p,d,m,h,y,w,v,x],S)=>{f.set([g/1e3,-p/1e3,d/1e3,-m/1e3,h,y,0,0],S*ho),b.set([w,v,x,0],S*ho+8)}),{data:u,count:c.length}}function xf(t,e){let s=new Map;for(let o of e||[])for(let c of o?.aliases||[])s.has(String(c))||s.set(String(c),Number(o.id));for(let o of e||[])o?.name&&s.set(String(o.name),Number(o.id));let r=t.header.nets||[];if(typeof t.netIndices=="function"){let o=new Uint32Array(r.length+1);r.forEach((u,f)=>{o[f+1]=s.get(u.name??u.key)||s.get(u.key)||0});let c=t.netIndices(),l=new Uint32Array(c.length);for(let u=0;u<c.length;u+=1)l[u]=o[c[u]];return l}let a=new Map(r.map(o=>[o.key,o.name])),n=Rs(t.header),i=new Uint32Array(n);for(let o=0;o<n;o+=1){let c=t.binding(o)?.net_key;c&&(i[o]=s.get(a.get(c)??c)||0)}return i}var kf={Uint32Array,Float32Array},Sr=".board";function Ef(t,e,s){return{header:t,barrelFloats:e.floats,barrelWords:e.words,barrelSkipped:e.skipped,netIndices:s}}function tn(t,e,s,r){return`analytic-lowered-a1/${t}/${e}/${s}/${r}`}function Tx(t){let e=[],s=[];for(let[u,f]of Object.entries(t)){if(!ArrayBuffer.isView(f))continue;let b=f.constructor.name;if(!kf[b])throw new TypeError(`cannot cache a ${b} (${u})`);e.push({name:u,kind:b,length:f.length}),s.push(new Uint8Array(f.buffer,f.byteOffset,f.byteLength))}let r=Object.fromEntries(Object.entries(t).filter(([,u])=>!ArrayBuffer.isView(u))),a=new TextEncoder().encode(JSON.stringify({fields:e,rest:r})),n=Math.ceil(a.length/4)*4,i=8+n+s.reduce((u,f)=>u+Math.ceil(f.length/4)*4,0),o=new Uint8Array(i),c=new DataView(o.buffer);c.setUint32(0,1280527440,!0),c.setUint32(4,a.length,!0),o.set(a,8);let l=8+n;for(let u of s)o.set(u,l),l+=Math.ceil(u.length/4)*4;return o}function sn(t){let e=t instanceof Uint8Array?t:new Uint8Array(t);if(e.length<8)return null;let s=new DataView(e.buffer,e.byteOffset,e.byteLength);if(s.getUint32(0,!0)!==1280527440)return null;let r=s.getUint32(4,!0),a;try{a=JSON.parse(new TextDecoder().decode(e.subarray(8,8+r)))}catch{return null}let n={...a.rest},i=8+Math.ceil(r/4)*4;for(let{name:o,kind:c,length:l}of a.fields){let u=kf[c];if(!u)return null;let f=l*u.BYTES_PER_ELEMENT;if(i+f>e.length||(e.byteOffset+i)%u.BYTES_PER_ELEMENT)return null;n[o]=new u(e.buffer,e.byteOffset+i,l),i+=Math.ceil(f/4)*4}return n}async function Tr(t,{cacheKey:e,wasmKey:s,toleranceNm:r},a){let n=new Map;return!t?.read||!e||await Promise.all(a.map(async i=>{try{let o=await t.read(tn(e,s,r,i)),c=o?sn(o):null;c&&n.set(i,c)}catch{}})),n}function bo(t,{cacheKey:e,wasmKey:s,toleranceNm:r},a){return!t?.write||!e?Promise.resolve():Promise.all([...a].map(([n,i])=>t.write(tn(e,s,r,n),i instanceof Uint8Array?i:Tx(i)).catch(()=>{}))).then(()=>{})}function Mf(t,e,s){return`analytic-lowered-a1/${t}/${e}/${s}/.complete`}async function Sf(t,{cacheKey:e,wasmKey:s,toleranceNm:r}){if(!t?.read||!e)return!1;try{return!!await t.read(Mf(e,s,r))}catch{return!1}}async function Tf(t,{cacheKey:e,wasmKey:s,toleranceNm:r},a=Promise.resolve()){!t?.write||!e||(await a,await t.write(Mf(e,s,r),new Uint8Array([1])).catch(()=>{}))}var Ax="prism-semantic-viewer-lower.js",rn=3;function _x(){if(typeof Worker>"u")return null;try{let t=new URL(import.meta.url),e=t.searchParams.get("v");return new URL(`${Ax}${e?`?v=${e}`:""}`,t)}catch{return null}}function an(t,e=globalThis.navigator?.hardwareConcurrency||4){return Math.max(1,Math.min(rn,Math.max(1,e-1),t))}function Ix(t,e,s){let r=Array.from({length:Math.max(1,s)},()=>({keys:[],load:0})),a=new Map(t.map((i,o)=>[i,o])),n=[...t].sort((i,o)=>(e.get(o)||1)-(e.get(i)||1)||a.get(i)-a.get(o));for(let i of n){let o=r.reduce((c,l)=>l.load<c.load?l:c,r[0]);o.keys.push(i),o.load+=e.get(i)||1}return r.filter(i=>i.keys.length).map(i=>i.keys.sort((o,c)=>a.get(o)-a.get(c)))}function Af(t){let e=new Map;for(let s of t?.chunks||[])e.set(s.slice_key,(e.get(s.slice_key)||0)+Number(s.operation_count||0));return e}var go=new Map;function Rx(t){if(!go.has(t)){let e=typeof WebAssembly?.compileStreaming=="function"&&typeof fetch=="function"?WebAssembly.compileStreaming(fetch(t)).catch(()=>null):Promise.resolve(null);go.set(t,e)}return go.get(t)}var Ar=class t{static start(e,s,r=an(rn)){let a=_x();if(!a||typeof s!="string")return null;let n=[],i=Rx(s);for(let o=0;o<r;o+=1){let c;try{c=new Worker(a,{type:"module",name:`analytic-lower-${o}`})}catch{break}let l={worker:c,pending:new Map,alive:!0};c.onmessage=({data:f})=>{let b=l.pending.get(f.id);l.pending.delete(f.id),b?.(f)},c.onerror=f=>{f.preventDefault?.(),mo(l,"worker failed")},l.opened=new Promise(f=>l.pending.set(0,b=>f(b.error?null:b.header)));let u=(e instanceof Uint8Array?e:new Uint8Array(e)).slice();i.then(f=>c.postMessage({type:"open",bytes:u.buffer,wasmUrl:s,wasmModule:f},[u.buffer])),n.push(l)}return n.length?new t(n):null}constructor(e){this.members=e,this.nextId=1}async header(){for(let e of this.members){let s=await e.opened;if(s&&e.alive)return s}return null}async host(){for(let e of this.members)if(await e.opened&&e.alive)return e;return null}async ask(e,s={},r=[],a=null){let n=a||await this.host();if(!n)throw new Error("no lowering worker has the pack open");return new Promise((i,o)=>{let c=this.nextId++;n.pending.set(c,l=>l.error?o(new Error(l.error)):i(l)),n.worker.postMessage({type:e,id:c,...s},r)})}async steps(e,s=null,r=[]){let a=[];for(let o of this.members)await o.opened&&o.alive&&a.push(o);let n=(o,c)=>Object.fromEntries(c.map(l=>[l,ArrayBuffer.isView(o[l])?o[l].slice():o[l]])),i=["shapes","subtractShapes","contourEdges","contourEdgeOperations","outlineEdges","outlineShapes"];return Promise.all(e.map(([o,c],l)=>{if(!a.length)return null;let u={key:r[l],store:s?.identity??null,copper:n(o,i),mask:n(c,["shapes","subtractShapes"])},f=a[l%a.length];return s&&s.writes.push(this.stored(f,this.nextId,s)),this.ask("step",u,[],f).then(b=>b.step,()=>null)}))}stored(e,s,r){return new Promise(a=>e.pending.set(-s,n=>{for(let[i,o]of n.stored||[])r.adopt(i,o);a()}))}async release(){let e=await this.host();for(let s of this.members)s!==e&&mo(s,"worker released");this.members=e?[e]:[]}async lower(e,s,r=new Map,a=null){if(!e.length)return new Map;let n=await Promise.all(this.members.map(u=>u.opened)),i=this.members.filter((u,f)=>n[f]&&u.alive);if(!i.length)return null;let o=Ix(e,r,i.length),c=await Promise.all(o.map((u,f)=>new Promise(b=>{let g=i[f],p=this.nextId++;a&&a.writes.push(this.stored(g,p,a)),g.pending.set(p,d=>b(d.error?null:new Map(Object.entries(d.lowered)))),g.worker.postMessage({type:"lower",id:p,keys:u,toleranceNm:s,store:a?.identity??null})})));if(c.every(u=>u===null))return null;let l=new Map;for(let u of c)for(let[f,b]of u||[])l.set(f,b);return l}close(){for(let e of this.members)mo(e,"worker closed");this.members=[]}};function mo(t,e){t.alive=!1,t.worker.terminate();let s=[...t.pending.values()];t.pending.clear();for(let r of s)r({error:e})}async function _f(t){let e=await t.header();if(!e)return null;let s=Rs(e);return{header:e,hosted:!0,async barrels(){return(await t.ask("barrels")).barrels},async netIndices(){return(await t.ask("netIndices",{count:s})).indices},async binding(r){return(await t.ask("binding",{index:r})).binding},free(){t.close()}}}function If(t,e){return{header:t.header,hosted:!0,async barrels(){return{floats:t.barrelFloats,words:t.barrelWords,skipped:t.barrelSkipped}},async netIndices(){return t.netIndices},async binding(s){if(!e)throw new Error("no worker holds the pack");return(await e.ask("binding",{index:s})).binding},free(){e?.close()}}}async function Rf(t,e,s,r,{weights:a=new Map,workers:n}={}){if(!e.length)return new Map;let i=Ar.start(t,r,n??an(e.length));if(!i)return null;try{return await i.lower(e,s,a)}finally{i.close()}}function Nf(t,e){let s=new Float32Array(t.buffer,t.byteOffset+e*20*4,20),[r,a,n,i,o,c]=[s[4],s[5],s[6],s[7],s[8],s[9]],l=[1/0,1/0,-1/0,-1/0];for(let[u,f]of[[s[10],s[11]],[s[12],s[11]],[s[10],s[13]],[s[12],s[13]]]){let b=r*u+a*f+o,g=n*u+i*f+c;l[0]=Math.min(l[0],b),l[1]=Math.min(l[1],g),l[2]=Math.max(l[2],b),l[3]=Math.max(l[3],g)}return l}function Cf(t){let e=t.contourEdges||new Float32Array(0),s=t.contourEdgeOperations||new Uint32Array(0),r=t.shapeCuts||new Uint32Array(0),a=t.edgeCuts||new Uint32Array(0),n=t.cutIndices||new Uint32Array(0),i=r.length,o=new Uint32Array(Math.max(1,i+n.length));for(let m=0;m<i;m+=2)o[m]=r[m]+i,o[m+1]=r[m+1];o.set(n,i);let c=t.outlineEdges||new Float32Array(0),l=t.outlineShapes||new Uint32Array(0),u=Math.min(e.length/4,s.length),f=new Uint32Array(Math.max(1,u+l.length)*7),b=new Uint32Array(e.buffer,e.byteOffset,e.length),g=0;for(let m=0;m<u;m+=1){if(s[m]&2147483648)continue;let h=g*7;f[h]=b[m*4],f[h+1]=b[m*4+1],f[h+2]=b[m*4+2],f[h+3]=b[m*4+3],f[h+4]=s[m],f[h+5]=(a[m*2]??0)+i,f[h+6]=a[m*2+1]??0,g+=1}let p=g,d=new Uint32Array(c.buffer,c.byteOffset,c.length);for(let m=0;m<l.length;m+=1){let h=g*7;f[h]=d[m*4],f[h+1]=d[m*4+1],f[h+2]=d[m*4+2],f[h+3]=d[m*4+3],f[h+4]=(1073741824|l[m])>>>0,g+=1}return{edgeWords:f,cutWords:o,regionEdges:p,skirtEdges:g-p}}function vo(t){return t.edgeWords?t:Object.assign(t,Cf(t))}function Of(t,e,s=.05){let r=e.shapes.subarray(0,e.subtractShapes*20),a=t.shapes.length/20,n=new Uint32Array(t.shapes.length+r.length);n.set(t.shapes),n.set(r,t.shapes.length);let i=r.length/20,o=new Float64Array(i*4),[c,l,u,f]=[1/0,1/0,-1/0,-1/0];for(let R=0;R<i;R+=1){let O=Nf(r,R);o.set(O,R*4),c=Math.min(c,O[0]),l=Math.min(l,O[1]),u=Math.max(u,O[2]),f=Math.max(f,O[3])}let[b,g]=[Math.floor(c),Math.floor(l)],p=i?Math.floor(u)-b+1:0,d=i?Math.floor(f)-g+1:0,m=(R,O,P)=>Math.min(P-1,Math.max(0,Math.floor(R)-O)),h=new Uint32Array(p*d+1),y=(R,O)=>{let[P,H]=[m(o[R*4],b,p),m(o[R*4+2],b,p)],[Q,pe]=[m(o[R*4+1],g,d),m(o[R*4+3],g,d)];for(let ae=P;ae<=H;ae+=1)for(let me=Q;me<=pe;me+=1)O(ae*d+me)};for(let R=0;R<i;R+=1)y(R,O=>{h[O+1]+=1});for(let R=0;R<p*d;R+=1)h[R+1]+=h[R];let w=new Uint32Array(h[p*d]),v=h.slice(0,p*d);for(let R=0;R<i;R+=1)y(R,O=>{w[v[O]++]=R});let x=[],S=[],T=new Uint32Array(i),A=0,_=(R,O,P,H)=>{let Q=x.length;if(A+=1,i&&Math.floor(P)>=b&&Math.floor(R)<=b+p-1&&Math.floor(H)>=g&&Math.floor(O)<=g+d-1){let[pe,ae]=[m(R,b,p),m(P,b,p)],[me,Ae]=[m(O,g,d),m(H,g,d)];for(let be=pe;be<=ae;be+=1)for(let _e=me;_e<=Ae;_e+=1){let ye=be*d+_e;for(let Le=h[ye];Le<h[ye+1];Le+=1){let Ie=w[Le];T[Ie]!==A&&(T[Ie]=A,o[Ie*4]<=P&&R<=o[Ie*4+2]&&o[Ie*4+1]<=H&&O<=o[Ie*4+3]&&x.push(a+Ie))}}}S.push(Q,x.length-Q)};for(let R=t.subtractShapes;R<a;R+=1){let O=Nf(t.shapes,R);_(O[0]-s,O[1]-s,O[2]+s,O[3]+s)}let N=a-t.subtractShapes,B=t.contourEdges||new Float32Array(0);for(let R=0;R+3<B.length;R+=4)_(Math.min(B[R],B[R+2])-s,Math.min(B[R+1],B[R+3])-s,Math.max(B[R],B[R+2])+s,Math.max(B[R+1],B[R+3])+s);let C=Cf({...t,shapeCuts:new Uint32Array(S.slice(0,N*2)),edgeCuts:new Uint32Array(S.slice(N*2)),cutIndices:new Uint32Array(x)});return{shapes:n,...C}}function Ff(t){let e=[];for(let s of t){if(s.role!=="mask"||s.zLow===void 0)continue;let r=t.find(a=>a.role==="copper"&&a.mark&&a.faceDown===s.faceDown);r&&e.push([s,r])}return e}function nn(t,e){return`step:${t.key}:${e.key}`}function Pf(t){let e=t.contourEdges||new Float32Array(0),s=t.contourEdgeOperations||new Uint32Array(0),r=[];for(let f=0;f<s.length&&f*4+3<e.length;f+=1)s[f]&2147483648||r.push(f);if(!r.length)return null;let[a,n]=[e[r[0]*4],e[r[0]*4+1]],i=new Float32Array(r.length*6),o=[1/0,1/0,-1/0,-1/0],c=new Float32Array(r.length*4),l=new Uint32Array(r.length);r.forEach((f,b)=>{let[g,p,d,m]=e.subarray(f*4,f*4+4);i.set([a,n,g,p,d,m],b*6),c.set([g,p,d,m],b*4),l[b]=s[f],o[0]=Math.min(o[0],g,d),o[1]=Math.min(o[1],p,m),o[2]=Math.max(o[2],g,d),o[3]=Math.max(o[3],p,m)});let u=new Uint32Array(6);return u[0]=s[r[0]],u.set(new Uint32Array(Float32Array.from(o).buffer),2),vo({shapes:new Uint32Array(0),subtractShapes:0,fanVertices:i,covers:u,batches:new Uint32Array([0,0,r.length*3,0,1]),contourEdges:c,contourEdgeOperations:l})}var cn={color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}};function ko(t){let e=Float32Array.from(t);for(let s=0;s<e.length;s+=1)Number.isFinite(e[s])||(e[s]=3e38);return e}var on=2,Bx=5e-4,Cx={mask:"soldermask",silk:"silkscreen",paste:"paste"};function Ox(t,e){let s=Cx[e.role];return!!(t?.size&&s)&&t.has(Px(s,e.faceDown?"back":"front"))}function Fx(t,e){let s=e?.soldermask?.front;return!t.soldermask&&s?.length>=3&&(t.soldermask={color:s,metallic:0,roughness:.6}),!t.paste&&e?.paste?.length>=3&&(t.paste={color:e.paste,metallic:0,roughness:.45}),!t.silkscreen&&e?.silkscreen?.length>=3&&(t.silkscreen={color:e.silkscreen,metallic:0,roughness:.8}),t}function Px(t,e){return`${t}:${e}`}var jx=128*1048576,Mo=class{constructor(e){this.budget=e,this.entries=new Map,this.generation=0}texture(e,s){let r=e.values,a=this.entries.get(r);return a?this.entries.delete(r):a={texture:s(),bytes:e.width*e.height*4},a.used=this.generation,this.entries.set(r,a),a.texture}bytes(){let e=0;for(let s of this.entries.values())e+=s.bytes;return e}trim(){let e=this.bytes();for(let[s,r]of this.entries){if(e<=this.budget)break;r.used!==this.generation&&(r.texture.destroy(),e-=r.bytes,this.entries.delete(s))}this.generation+=1}clear(){for(let e of this.entries.values())e.texture.destroy();this.entries.clear()}},Gf=.3,Kf=new WeakMap,Vf=new WeakMap;function qf(t){let e=Kf.get(t);return e||(e={layout:t.createBindGroupLayout({label:"analytic",entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:2,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:3,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:4,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:5,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:"unfilterable-float"}},{binding:6,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:7,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:8,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:9,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:10,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:11,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:"uint"}}]}),module:t.createShaderModule({label:"analytic",code:Rd})},Kf.set(t,e)),e}function Hf(t){let e=qf(t.device);return{device:t.device,depthFormat:t.depthFormat,stencil:t.stencil,samples:t.sampleCount||1,layout:e.layout,module:e.module}}function So(t){return`${t.format}|${t.sampleCount||1}|${t.depthFormat}|${t.stencil?1:0}`}function To(t){let e=Vf.get(t);return e||(e=new Map,Vf.set(t,e)),e}function Lx(t){return To(t.device).get(So(t))?.ready||null}function Dx(t,e){let s=To(t.device),r=So(t);return s.get(r)?.ready||s.set(r,{ready:e,promise:Promise.resolve(e)}),e}function Eo(t,e,s,r){let a=t.device.createPipelineLayout({bindGroupLayouts:[t.layout]}),n=(o,c,l,u,f=[],b=!1,g="none")=>{let p=Aa[u],d={format:t.depthFormat,depthWriteEnabled:p.depth,depthCompare:p.depth||p.depthTest?"greater":"always"};return t.stencil&&Object.assign(d,{stencilFront:p.face,stencilBack:p.face,stencilReadMask:p.read,stencilWriteMask:p.write}),r({label:`analytic-${o}${s?"-pick":""}`,layout:a,vertex:{module:t.module,entryPoint:c,buffers:f},fragment:{module:t.module,entryPoint:s?`${l}_pick`:l,...s?{}:{constants:{SAMPLES:t.samples}},targets:[{format:e,writeMask:p.color?GPUColorWrite.ALL:0,...b&&!s?{blend:cn}:{}}]},primitive:{topology:"triangle-list",cullMode:g},depthStencil:d,multisample:{count:s?1:t.samples}})},i=[{arrayStride:8,attributes:[{shaderLocation:0,offset:0,format:"float32x2"}]}];return{shapeMask:n("shape-mask","vs_shape","fs_shape_mask","shapeMask"),shapeAdd:n("shape","vs_shape","fs_shape","shapeAdd"),fan:n("fan","vs_fan","fs_plain_mask","fan",i),coverSubtract:n("cover-subtract","vs_cover","fs_plain_mask","coverSubtract"),coverMark:n("cover-mark","vs_cover","fs_plain_mask","coverMark"),coverAdd:n("cover","vs_cover","fs_cover","coverAdd"),coverClear:n("cover-clear","vs_cover","fs_plain_mask","coverClear"),clear:n("clear","vs_clear","fs_plain_mask","clear"),regionWall:n("region-wall","vs_region_wall","fs_region_wall","solid"),skirt:n("skirt","vs_skirt","fs_skirt","solid"),...s?{}:{shapeLay:n("shape-lay","vs_shape","fs_shape_mask","shapeLay"),coverLay:n("cover-lay","vs_cover","fs_cover_mask","coverLay"),shapeBlend:n("shape-blend","vs_shape","fs_shape","shapeBlend",[],!0),coverBlend:n("cover-blend","vs_cover","fs_cover","coverBlend",[],!0),tintCovered:n("tint-covered","vs_clear","fs_tint_covered","tintCovered",[],!0),tintPlain:n("tint-plain","vs_clear","fs_tint_plain","tintPlain",[],!0),footShape:n("foot-shape","vs_shape","fs_shape_mask","footShape"),footCover:n("foot-cover","vs_cover","fs_cover_mask","footCover"),tintHigh:n("tint-high","vs_clear","fs_tint_covered","tintHigh",[],!0),tintLow:n("tint-low","vs_clear","fs_tint_plain","tintLow",[],!0),regionStep:n("region-step","vs_region_step","fs_region_step","coat"),step:n("step","vs_step","fs_step","coat"),clearLay:n("clear-lay","vs_clear","fs_plain_mask","clearLay"),clearFoot:n("clear-foot","vs_clear","fs_plain_mask","clearFoot"),shapeOnFoot:n("shape-on-foot","vs_shape","fs_shape","shapeOnFoot",[],!0),shapeOffFoot:n("shape-off-foot","vs_shape","fs_shape","shapeOffFoot",[],!0),coverOnFoot:n("cover-on-foot","vs_cover","fs_cover","coverOnFoot",[],!0),coverOffFoot:n("cover-off-foot","vs_cover","fs_cover","coverOffFoot",[],!0)}}}var Zt=class{constructor(e){this.renderer=e,this.device=e.device,this.stencil=e.stencil,this.samples=e.sampleCount||1,this.slices=[],this.skin=null,this.eye=null,this.viewMatrix=null,this.extent=null,this.overlay={mode:0,range:[0,1]};let s=qf(this.device);this.layout=s.layout,this.module=s.module,this.boardClip=null,this.emptyClip=this.device.createTexture({label:"analytic-clip-none",size:[1,1],format:"r8uint",usage:GPUTextureUsage.TEXTURE_BINDING}),this.palette=this.device.createBuffer({label:"analytic-palette",size:8208,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.style=oo(ls),this.writePalette(),this.pipelines=Lx(e)||Dx(e,{color:this.makePipelines(e.format,!1),pick:this.makePipelines("rg32uint",!0)}),this.emptyValues=this.buffer(new Float32Array([3e38]),GPUBufferUsage.STORAGE,"analytic-values-empty"),this.valuesBuffer=this.emptyValues,this.emptyField=this.fieldTexture(1,1,new Float32Array([3e38])),this.uniformScratch=new ArrayBuffer(256),this.netsBuffer=this.buffer(new Uint32Array(1),GPUBufferUsage.STORAGE,"analytic-nets"),this.fieldCache=new Mo(jx),this.makeBarrelPipelines(),this.makeArrowPipeline()}globals(){return this.renderer.analyticGlobalBuffer||this.renderer.globalBuffer}makeArrowPipeline(){this.arrowLayout=this.device.createBindGroupLayout({label:"analytic-arrows",entries:[{binding:0,visibility:GPUShaderStage.VERTEX,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:2,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:3,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:4,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}}]}),this.drawnLayers=new Uint32Array(256),this.drawnLayersBuffer=this.buffer(this.drawnLayers,GPUBufferUsage.STORAGE,"analytic-drawn-layers");let e=this.device.createShaderModule({label:"analytic-arrows",code:Pd});this.arrowPipeline=this.device.createRenderPipeline({label:"analytic-arrow",layout:this.device.createPipelineLayout({bindGroupLayouts:[this.arrowLayout]}),vertex:{module:e,entryPoint:"vs_arrow"},fragment:{module:e,entryPoint:"fs_arrow",targets:[{format:this.renderer.format,blend:cn}]},primitive:{topology:"triangle-list",cullMode:"none"},depthStencil:{format:this.renderer.depthFormat,depthWriteEnabled:!1,depthCompare:"greater-equal"},multisample:{count:this.samples}}),this.arrows=null}writePalette(){let e=new Float32Array(8208/4);e.set(As(this.style.fieldColormap,Qe),0),e.set(As(this.style.arrowColormap,Qe),Qe*4),e.set(this.style.arrowOutline,2*Qe*4),this.device.queue.writeBuffer(this.palette,0,e),this.renderer.invalidate?.()}setStyle(e){return this.style=oo(e,this.style),this.writePalette(),this.style}setArrows(e){this.arrows?.buffer.destroy(),this.arrows=e?.count?{buffer:this.buffer(new Uint8Array(e.data),GPUBufferUsage.STORAGE,"analytic-arrows"),count:e.count}:null,this.arrows&&(this.arrows.bindGroup=this.device.createBindGroup({layout:this.arrowLayout,entries:[{binding:0,resource:{buffer:this.globals()}},{binding:1,resource:{buffer:this.arrows.buffer}},{binding:2,resource:{buffer:this.layerOffsets}},{binding:3,resource:{buffer:this.palette}},{binding:4,resource:{buffer:this.drawnLayersBuffer}}]})),this.renderer.invalidate?.()}encodeArrows(e){return this.arrows?(this.device.queue.writeBuffer(this.drawnLayersBuffer,0,this.drawnLayers),e.setPipeline(this.arrowPipeline),e.setBindGroup(0,this.arrows.bindGroup),e.draw(9,2*this.arrows.count),1):0}makeBarrelPipelines(){let e=GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT;this.barrelLayout=this.device.createBindGroupLayout({label:"analytic-barrels",entries:[{binding:0,visibility:e,buffer:{type:"uniform"}},{binding:1,visibility:e,buffer:{type:"uniform"}},{binding:2,visibility:e,buffer:{type:"read-only-storage"}},{binding:3,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:4,visibility:e,buffer:{type:"read-only-storage"}},{binding:5,visibility:e,buffer:{type:"read-only-storage"}},{binding:6,visibility:e,buffer:{type:"read-only-storage"}},{binding:7,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}}]});let s=this.device.createShaderModule({label:"analytic-barrels",code:Od}),r=this.device.createPipelineLayout({bindGroupLayouts:[this.barrelLayout]}),a=(o,c)=>this.device.createRenderPipeline({label:`analytic-barrel${c?"-pick":""}`,layout:r,vertex:{module:s,entryPoint:"vs_barrel",constants:{PICK_PASS:c?1:0}},fragment:{module:s,entryPoint:c?"fs_barrel_pick":"fs_barrel",targets:[{format:o}],constants:{PICK_PASS:c?1:0}},primitive:{topology:"triangle-list",cullMode:"back"},depthStencil:{format:this.renderer.depthFormat,depthWriteEnabled:!0,depthCompare:"greater"},multisample:{count:c?1:this.samples}});this.barrelPipelines={color:a(this.renderer.format,!1),pick:a("rg32uint",!0)},this.ghostPipeline=this.device.createRenderPipeline({label:"analytic-ghost-barrel",layout:r,vertex:{module:s,entryPoint:"vs_ghost"},fragment:{module:s,entryPoint:"fs_ghost",targets:[{format:this.renderer.format,blend:cn}]},primitive:{topology:"triangle-list",cullMode:"none"},depthStencil:{format:this.renderer.depthFormat,depthWriteEnabled:!1,depthCompare:"greater"},multisample:{count:this.samples}}),this.barrelView=this.device.createBuffer({label:"analytic-barrel-view",size:Fi,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.layerOffsets=this.device.createBuffer({label:"analytic-layer-offsets",size:256*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.viewScratch=new ArrayBuffer(Fi),this.barrels=null;let n=this.device.createShaderModule({label:"analytic-walls",code:Fd}),i=o=>this.device.createRenderPipeline({label:`analytic-wall${o?"-blend":""}`,layout:r,vertex:{module:n,entryPoint:"vs_wall"},fragment:{module:n,entryPoint:"fs_wall",targets:[{format:this.renderer.format,...o?{blend:cn}:{}}]},primitive:{topology:"triangle-list",cullMode:"none"},depthStencil:{format:this.renderer.depthFormat,depthWriteEnabled:!0,depthCompare:"greater"},multisample:{count:this.samples}});this.wallPipelines={opaque:i(!1),blend:i(!0)},this.walls=null}setWalls({data:e,count:s}){this.walls?.buffer.destroy(),this.walls=s?{buffer:this.buffer(new Uint8Array(e),GPUBufferUsage.STORAGE,"analytic-walls"),count:s,bindGroup:null}:null,this.walls&&(this.walls.bindGroup=this.wallBindGroup()),this.renderer.invalidate?.()}wallBindGroup(){return this.device.createBindGroup({layout:this.barrelLayout,entries:[{binding:0,resource:{buffer:this.globals()}},{binding:1,resource:{buffer:this.barrelView}},{binding:2,resource:{buffer:this.walls.buffer}},{binding:3,resource:{buffer:this.valuesBuffer}},{binding:4,resource:{buffer:this.layerOffsets}},{binding:5,resource:{buffer:this.netsBuffer}},{binding:6,resource:{buffer:this.renderer.netMaskBuffer}},{binding:7,resource:{buffer:this.palette}}]})}encodeWalls(e,s){return this.walls?(e.setPipeline(s?this.wallPipelines.blend:this.wallPipelines.opaque),e.setBindGroup(0,this.walls.bindGroup),e.draw(6,this.walls.count),1):0}writeView(e,s,r={}){let a=new Float32Array(256);s&&a.set(s.subarray?s.subarray(0,256):s.slice(0,256)),this.device.queue.writeBuffer(this.layerOffsets,0,a);let n=new Float32Array(this.viewScratch),i=new Uint32Array(this.viewScratch);n.fill(0),this.eye=Gx(e),this.viewMatrix=e,n.set(this.eye,0),n.set(this.renderer.barrelColor||[.55,.35,.16,1],4);let o=this.laminateColor()||this.boardLooks().substrate?.color||[.3,.32,.25,1],c=(r.boardOpacity??1)*(.15+.85*(r.assemblyOpacity??1));n.set([...o.slice(0,3),c],8);let l=this.overlay.mode===1||this.overlay.mode===2&&this.valuesBuffer!==this.emptyValues;i[12]=l?1:0,i[13]=r.isolateNet?1:0,i[14]=this.boardShown(r)?1:0,i[15]=this.boardShown(r)&&(r.boardOpacity??1)>=.999&&this.renderer.innerCopperMode!=="all"?1:0,n.set(this.overlay.range,16),this.separated=!!s&&Array.prototype.some.call(s,u=>Math.abs(u)>1e-12),i[18]=this.separated?1:0,n.set(this.edgePlated?[...(this.renderer.barrelColor||[.55,.35,.16]).slice(0,3),c]:[...o.slice(0,3),c],20),n.set([...(this.boardLooks().soldermask?.color||[.06,.16,.11]).slice(0,3),1],24),this.device.queue.writeBuffer(this.barrelView,0,this.viewScratch)}setBarrels({data:e,count:s,skipped:r=0}){this.barrels?.buffer.destroy(),this.barrels=s?{buffer:this.buffer(new Uint8Array(e),GPUBufferUsage.STORAGE,"analytic-barrels"),count:s,skipped:r,bindGroup:null}:null,this.barrels&&(this.barrels.bindGroup=this.barrelBindGroup()),this.renderer.invalidate?.()}hasBarrels(){return!!this.barrels}barrelBindGroup(){return this.device.createBindGroup({layout:this.barrelLayout,entries:[{binding:0,resource:{buffer:this.globals()}},{binding:1,resource:{buffer:this.barrelView}},{binding:2,resource:{buffer:this.barrels.buffer}},{binding:3,resource:{buffer:this.valuesBuffer}},{binding:4,resource:{buffer:this.layerOffsets}},{binding:5,resource:{buffer:this.netsBuffer}},{binding:6,resource:{buffer:this.renderer.netMaskBuffer}},{binding:7,resource:{buffer:this.palette}}]})}encodeBarrels(e,s,r,a=!1){return this.barrels?(r&&this.writeView(r,s,this.context),e.setPipeline(a?this.barrelPipelines.pick:this.barrelPipelines.color),e.setBindGroup(0,this.barrels.bindGroup),e.draw(36,this.barrels.count),1):0}encodeGhostBarrels(e){return!this.barrels||!this.separated?0:(e.setPipeline(this.ghostPipeline),e.setBindGroup(0,this.barrels.bindGroup),e.draw(Cd,this.barrels.count),1)}buffer(e,s,r){let a=Math.max(16,Math.ceil(e.byteLength/4)*4),n=this.device.createBuffer({label:r,size:a,usage:s|GPUBufferUsage.COPY_DST});return e.byteLength&&this.device.queue.writeBuffer(n,0,e),n}fieldTexture(e,s,r){let a=this.device.createTexture({label:"analytic-field",size:[e,s],format:"r32float",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});return this.device.queue.writeTexture({texture:a},r,{bytesPerRow:e*4},[e,s]),a}makePipelines(e,s){return Eo(Hf(this.renderer),e,s,r=>this.device.createRenderPipeline(r))}static prewarm(e){let s=So(e),r=To(e.device),a=r.get(s);if(a)return a.promise;let n=Hf(e),i=l=>e.device.createRenderPipelineAsync(l),o=async l=>Object.fromEntries(await Promise.all(Object.entries(l).map(async([u,f])=>[u,await f]))),c={ready:null,promise:null};return c.promise=Promise.all([o(Eo(n,e.format,!1,i)),o(Eo(n,"rg32uint",!0,i))]).then(([l,u])=>(c.ready={color:l,pick:u},c.ready)).catch(()=>(r.delete(s),null)),r.set(s,c),c.promise}setSlices(e){this.releaseSlices();let s=new Map;this.slices=e.map(o=>this.uploadSlice(o,s)),this.makePlainSlabs(s),this.makeTwins();let r=e.map(o=>o.z),a=e.flatMap(o=>[o.bounds[0],o.bounds[2]]),n=e.flatMap(o=>[o.bounds[1],o.bounds[3]]);this.extent=e.length?[[Math.min(...a)/1e3,-Math.max(...n)/1e3,Math.min(...r)],[Math.max(...a)/1e3,-Math.min(...n)/1e3,Math.max(...r)]]:null;let i=e.filter(o=>o.skin);this.skin=i.length===2?{top:Math.max(...i.map(o=>o.z)),bottom:Math.min(...i.map(o=>o.z))}:null,this.renderer.invalidate?.()}makeTwins(){this.twinBuffers?.forEach(s=>s.destroy()),this.twinBuffers=[];let e=(s,r)=>{let a={...s,...r,uniform:this.device.createBuffer({label:`analytic-twin-${s.key}`,size:256,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),field:null};return a.bindGroup=this.bindGroup(a),a};this.twins=new Map;for(let s of this.slices){if(s.zLow===void 0||s.role!=="mask"&&s.role!=="silk")continue;let r={low:e(s,{z:s.zLow})},a=s.role==="mask"&&this.slices.find(n=>n.role==="copper"&&n.mark&&n.faceDown===s.faceDown);if(a){let n=this.uploadOpenings(a,s,s.step),i=s.faceDown?a.zTop:a.zBottom;r.foot=e(a,{role:"footprint",z:s.z,dilate:Bx,mark:!1,walls:!1,zTop:Math.max(s.z,i),zBottom:Math.min(s.z,i),...n})}this.twins.set(s,r)}}uploadOpenings(e,s,r=null){let a=r||Of(e.lowered,s.lowered),n=this.uploadEdges(a,`${e.key}-step`),i=this.buffer(a.shapes,GPUBufferUsage.STORAGE,`analytic-step-shapes-${e.key}`);return this.twinBuffers.push(i,n.edges,n.cuts),{...n,shapes:i}}uploadSlice(e,s=new Map){let{lowered:r}=e,a=GPUBufferUsage.STORAGE;s.has(r)||s.set(r,{shapes:this.buffer(r.shapes,a,`analytic-shapes-${e.key}`),covers:this.buffer(r.covers,a,`analytic-covers-${e.key}`),fans:r.fanVertices.length?this.buffer(r.fanVertices,GPUBufferUsage.VERTEX,`analytic-fans-${e.key}`):null,...this.uploadEdges(r,e.key)});let n={...e,...s.get(r),uniform:this.device.createBuffer({label:`analytic-slice-${e.key}`,size:256,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),shapeCount:r.shapes.length/20,subtractShapes:r.subtractShapes,batches:[],field:null};for(let i=0;i<r.batches.length;i+=5){let[o,c,l,u,f]=r.batches.subarray(i,i+5);n.batches.push({subtract:o===1,firstVertex:c,vertexCount:l,firstCover:u,coverCount:f})}return n.bindGroup=this.bindGroup(n),n}uploadEdges(e,s){let{edgeWords:r,cutWords:a,regionEdges:n,skirtEdges:i}=vo(e);return{edges:this.buffer(r,GPUBufferUsage.STORAGE,`analytic-edges-${s}`),regionEdges:n,skirtEdges:i,cuts:this.buffer(a,GPUBufferUsage.STORAGE,`analytic-cuts-${s}`)}}bindGroup(e){return this.device.createBindGroup({layout:this.layout,entries:[{binding:0,resource:{buffer:this.globals()}},{binding:1,resource:{buffer:e.uniform}},{binding:2,resource:{buffer:e.shapes}},{binding:3,resource:{buffer:e.covers}},{binding:4,resource:{buffer:this.valuesBuffer}},{binding:5,resource:(e.field?.texture||this.emptyField).createView()},{binding:6,resource:{buffer:this.netsBuffer}},{binding:7,resource:{buffer:this.renderer.netMaskBuffer}},{binding:8,resource:{buffer:e.edges}},{binding:9,resource:{buffer:e.cuts}},{binding:10,resource:{buffer:this.palette}},{binding:11,resource:(this.boardClip?.texture||this.emptyClip).createView()}]})}setBoardClipMask(e){if(!e)return this.setBoardClip(null),null;let{data:s,width:r,height:a}=Ux(e),n=[e.originMm[0]-e.pitchMm,e.originMm[1]-e.pitchMm],i=Math.ceil(r/256)*256,o=i===r?s:new Uint8Array(i*a);if(o!==s)for(let l=0;l<a;l+=1)o.set(s.subarray(l*r,(l+1)*r),l*i);let c=this.device.createTexture({label:"analytic-clip",size:[r,a],format:"r8uint",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});return this.device.queue.writeTexture({texture:c},o,{bytesPerRow:i},[r,a]),this.setBoardClip({texture:c,originMm:n,pitchMm:e.pitchMm,width:r,height:a}),this.boardClip}setBoardClip(e){this.boardClip&&this.boardClip!==e&&this.boardClip.texture.destroy(),this.boardClip=e;for(let s of this.slices)s.bindGroup=this.bindGroup(s),s.plain&&(s.plain.bindGroup=this.bindGroup(s.plain));this.renderer.invalidate?.()}coversLayer(e){return this.slices.some(s=>s.role!==void 0?s.role==="copper"&&s.layerId===Number(e):s.layerId===Number(e))}coversRole(e){let s={substrate:"dielectric",soldermask:"mask",silkscreen:"silk",paste:"paste"}[e];return!!s&&this.slices.some(r=>r.role===s)}setOperationValues(e,s){this.clearOverlay(),this.valuesBuffer=this.buffer(ko(e),GPUBufferUsage.STORAGE,"analytic-values"),this.overlay={mode:1,range:s},this.rebind()}setFieldRasters(e,s,r=null){this.clearOverlay(!1),r&&(this.valuesBuffer=this.buffer(ko(r),GPUBufferUsage.STORAGE,"analytic-values"));for(let a of this.slices){let n=e.get(a.key);if(!n)continue;let i=this.fieldCache.texture(n,()=>this.fieldTexture(n.width,n.height,ko(n.values)));a.field={...n,texture:i}}this.fieldCache.trim(),this.overlay={mode:2,range:s},this.rebind()}clearOverlay(e=!0){this.valuesBuffer!==this.emptyValues&&this.valuesBuffer.destroy(),this.valuesBuffer=this.emptyValues;for(let s of this.slices)s.field=null;this.overlay={mode:0,range:[0,1]},e&&this.rebind()}setOperationNets(e){this.netsBuffer.destroy(),this.netsBuffer=this.buffer(e.length?e:new Uint32Array(1),GPUBufferUsage.STORAGE,"analytic-nets"),this.rebind()}rebind(){this.boundNetMask=this.renderer.netMaskBuffer;for(let e of this.slices)e.bindGroup=this.bindGroup(e),e.plain&&(e.plain.bindGroup=this.bindGroup(e.plain));for(let e of this.twins?.values()||[])for(let s of Object.values(e))s.bindGroup=this.bindGroup(s);this.barrels&&(this.barrels.bindGroup=this.barrelBindGroup()),this.walls&&(this.walls.bindGroup=this.wallBindGroup()),this.renderer.invalidate?.()}writeSlice(e,s,r=null){let a=new Float32Array(this.uniformScratch),n=new Uint32Array(this.uniformScratch);a.fill(0),a.set(r?.color||e.color,0);let[i,o]=e.offsetLayers||[e.layerId,e.layerId];a[4]=e.z+.5*((s?.[i]||0)+(s?.[o]||0));let c=this.context?.flat?.get(e.layerId);c&&(a[4]=e.z-c.z,a[44]=c.offset[0]||0,a[45]=c.offset[1]||0);let l=e.role===void 0||e.role==="copper";n[5]=l?this.overlay.mode:0;let f=(this.context||{}).isolateNet||!e.outer&&this.renderer.innerCopperMode==="lit";n[7]=l?2|(f?1:0):0;let b=l?e.field:null;if(n[6]=b?1:0,b){a.set(b.originMm,8);let[p,d]=Array.isArray(b.pitchMm)?b.pitchMm:[b.pitchMm,b.pitchMm];a[10]=p,a[11]=d,n[12]=b.width,n[13]=b.height}if(a.set(this.overlay.range,16),a.set(e.bounds,20),a.set([r?.metallic??0,r?.roughness??.72,e.faceDown??e.bottom?-1:1,l?1:0],24),e.zTop!==void 0){let p=a[4]-e.z;a.set([e.zBottom+p,e.zTop+p],28)}n[30]=e.subtractShapes||0,a[31]=e.dilate||0,this.eye&&a.set(this.eye,32);let g=e.role!=="dielectric"?this.boardClip:null;g&&(a.set(g.originMm,36),a[38]=g.pitchMm,a[39]=g.pitchMm,n[40]=g.width,n[41]=g.height,n[42]=1),this.device.queue.writeBuffer(e.uniform,0,this.uniformScratch)}copperLooks(){let e=new Map;for(let s of this.renderer.entries||[]){let r=Number(s.layerId);if(s.kind!=="copper"||e.has(r))continue;let a=s.color||s.material?.baseColor;e.set(r,{color:a&&a.length<4?[...a,1]:a,metallic:s.material?.metallic||0,roughness:s.material?.roughness??.72})}for(let[s,r]of this.renderer.copperColors||[])e.has(s)||e.set(s,{color:r.length<4?[...r,1]:r,metallic:0,roughness:.72});return e}boardLooks(){let e={};for(let s of this.renderer.entries||[]){if(s.kind!=="board"||e[s.boardRole])continue;let r=s.color||s.material?.baseColor;e[s.boardRole]={color:r&&r.length<4?[...r,1]:r,metallic:s.material?.metallic||0,roughness:s.material?.roughness??.72}}return Fx(e,this.renderer.stackupLooks)}laminateColor(){return this.slices.find(e=>e.role==="dielectric"&&e.color)?.color||null}lookFor(e,s,r,a){if(e.role===void 0||e.role==="copper")return s.get(e.layerId);let n=a.boardOpacity??1,i=(c,l)=>{let u=r[c];if(!u)return null;let f=u.color||[1,1,1,1];return{...u,color:[f[0],f[1],f[2],l(Number.isFinite(f[3])?f[3]:1)]}};if(e.role==="dielectric"){let c=n*(.15+.85*(a.assemblyOpacity??1));return e.color?{...r.substrate||{metallic:0,roughness:.72},color:[...e.color.slice(0,3),c]}:i("substrate",()=>c)}let o=a.assemblyOpacity??1;return e.role==="mask"?i("soldermask",c=>Math.min(c,.72)*n*o):e.role==="silk"?i("silkscreen",c=>Math.min(c,.92)*n*o):i("paste",c=>c)}encodeInto(e,s,r,a=!1,n={}){this.context=n,this.renderer.netMaskBuffer!==this.boundNetMask&&this.rebind(),n.matrix&&this.writeView(n.matrix,s,n);let i=a?this.pipelines.pick:this.pipelines.color,o=this.copperLooks(),c=this.boardLooks(),u=this.boardShown(n)&&(n.boardOpacity??1)>=.999,f=0;a||this.drawnLayers.fill(0);for(let b of this.slices){let g=b.role===void 0||b.role==="copper";(g?r&&!r.has(b.layerId):a||b.role!=="dielectric"||!u)||g&&!b.outer&&b.role!==void 0&&this.renderer.innerCopperMode==="none"||b.role==="dielectric"&&!b.skin&&this.renderer.innerCopperMode!=="all"||this.behindBoard(b,n)||(this.encodeSlice(e,i,b,"opaque",s,this.lookFor(b,o,c,n)),!a&&g&&b.face===(b.bottom?"bottom":"top")&&(this.drawnLayers[b.layerId]=1),f+=1)}return u&&!a&&(f+=this.encodeWalls(e,!1)),this.stencil&&e.setStencilReference(1),f}layerZ(e){let s=this.slices.filter(r=>(r.role===void 0||r.role==="copper")&&r.layerId===e).map(r=>r.z);return s.length?(Math.min(...s)+Math.max(...s))/2:null}boardShown(e){return(e.showBoard??!0)&&!e.panelLayer}behindBoard(e,s){if(!this.skin||!this.eye||this.renderer.innerCopperMode==="all"||!this.boardShown(s)||(s.boardOpacity??1)<.999)return!1;let[,,r,a]=this.eye,n=a?r>this.skin.top:r<0,i=a?r<this.skin.bottom:r>0;return e.faceDown?n:i}encodeBlended(e,s,r,a={}){if(!this.stencil)return 0;this.context=a;let n=this.copperLooks(),i=this.boardLooks(),o=this.boardShown(a),c=o&&(a.boardOpacity??1)<.999,l=0,u=(p,d)=>{this.behindBoard(p,a)||(this.encodeSlice(e,this.pipelines.color,p,d,s,this.lookFor(p,n,i,a)),l+=1)};for(let p of this.slices)c&&p.role==="dielectric"&&u(p,"blend");c&&(l+=this.encodeWalls(e,!0));let f=o&&(a.assemblyOpacity??1)>.01,b=p=>!Ox(a.hiddenBoardLayers,p),g=new Set;for(let p of this.slices){if(p.role!=="mask"||!f||!b(p)||this.behindBoard(p,a))continue;let d=this.twins.get(p);if(!d?.foot){u(p,"mask");continue}let m=this.slices.filter(h=>h.role==="silk"&&h.faceDown===p.faceDown&&b(h)&&!this.behindBoard(h,a));for(let h of m)g.add(h);l+=this.encodeConformal(e,p,d,m,s,h=>this.lookFor(h,n,i,a))}for(let p of this.slices)p.role==="paste"&&b(p)&&!a.hidePaste&&!a.panelLayer&&(!r||r.has(p.offsetLayers?.[0]))&&u(p,"blend");for(let p of this.slices)p.role==="silk"&&f&&b(p)&&!g.has(p)&&u(p,"blend");return e.setStencilReference(1),l}encodeSlice(e,s,r,a,n,i){let o=this.drawnSlice(r),c=s===this.pipelines.pick?void 0:this.sliceRect(o,n);c!==null&&(c&&e.setScissorRect(c.x,c.y,c.width,c.height),this.encodeSliceIn(e,s,o,a,n,i),c&&e.setScissorRect(this.viewport.x,this.viewport.y,this.viewport.width,this.viewport.height))}sliceRect(e,s){let r=this.viewport,a=this.viewMatrix;if(!r||!a||!e.bounds||this.context?.flat)return;let[n,i]=e.offsetLayers||[e.layerId,e.layerId],o=.5*((s?.[n]||0)+(s?.[i]||0)),c=[e.z,e.zBottom??e.z,e.zTop??e.z,e.zLow??e.z].map(x=>x+o),[l,u,f,b]=e.bounds,[g,p,d,m]=[1/0,1/0,-1/0,-1/0];for(let x of[l/1e3,f/1e3])for(let S of[-u/1e3,-b/1e3])for(let T of[Math.min(...c),Math.max(...c)]){let A=a[3]*x+a[7]*S+a[11]*T+a[15];if(!(A>1e-9))return;let _=r.x+((a[0]*x+a[4]*S+a[8]*T+a[12])/A+1)*.5*r.width,N=r.y+(1-(a[1]*x+a[5]*S+a[9]*T+a[13])/A)*.5*r.height;g=Math.min(g,_),d=Math.max(d,_),p=Math.min(p,N),m=Math.max(m,N)}let h=Math.max(r.x,Math.floor(g-on)),y=Math.max(r.y,Math.floor(p-on)),w=Math.min(r.x+r.width,Math.ceil(d+on)),v=Math.min(r.y+r.height,Math.ceil(m+on));return w<=h||v<=y?null:{x:h,y,width:w-h,height:v-y}}encodeSliceIn(e,s,r,a,n,i){this.writeSlice(r,n,i),e.setBindGroup(0,r.bindGroup),this.stencil?this.encodeStencilled(e,s,r,a):this.encodeAddsOnly(e,s,r),a==="opaque"&&r.walls&&this.encodeSlabWalls(e,s,r)}wallPixels(e){let s=this.viewMatrix,r=this.renderer.canvas;if(!s||!this.extent||!r)return 1/0;let[a,n]=this.extent,i=[];for(let l of[a[0],n[0]])for(let u of[a[1],n[1]])for(let f of[a[2],n[2]])i.push([l,u,f]);this.eye?.[3]&&i.push(this.eye.slice(0,3).map((l,u)=>Math.min(n[u],Math.max(a[u],l/this.eye[3]))));let o=([l,u,f])=>{let b=[0,1,2,3].map(g=>s[g]*l+s[4+g]*u+s[8+g]*f+s[12+g]);return b[3]>1e-9?[b[0]/b[3],b[1]/b[3]]:null},c=0;for(let l of i){let u=o(l),f=o([l[0],l[1],l[2]+e]);if(!u||!f)return 1/0;c=Math.max(c,Math.hypot((f[0]-u[0])*r.width/2,(f[1]-u[1])*r.height/2))}return c}encodeSlabWalls(e,s,r){this.stencil&&e.setStencilReference(0),r.regionEdges&&(e.setPipeline(s.regionWall),e.draw(6,r.regionEdges,0,0)),r.skirtEdges&&this.wallPixels(r.zTop-r.zBottom)>=Gf&&(e.setPipeline(s.skirt),e.draw(12,r.skirtEdges,0,r.regionEdges))}encodeAddsOnly(e,s,r){let a=r.shapeCount-r.subtractShapes;a&&(e.setPipeline(s.shapeAdd),e.draw(6,a,0,r.subtractShapes))}encodeStencilled(e,s,r,a="opaque"){let n=(i,o=Aa[i].reference)=>{e.setPipeline(s[i]),e.setStencilReference(o)};this.encodeFill(e,r,n,a),a==="mask"&&(n("tintCovered"),e.draw(6),n("tintPlain"),e.draw(6)),n("clear"),e.draw(6)}encodeFill(e,s,r,a){let n=a==="footprint";s.subtractShapes&&!n&&(r("shapeMask"),e.draw(6,s.subtractShapes,0,0)),n||this.encodeBatches(e,s,!0,r,a);let i=s.shapeCount-s.subtractShapes;i&&(a==="opaque"?r("shapeAdd",s.mark?33:32):r({mask:"shapeLay",blend:"shapeBlend",footprint:"footShape",onFoot:"shapeOnFoot",offFoot:"shapeOffFoot"}[a]),e.draw(6,i,0,s.subtractShapes)),this.encodeBatches(e,s,!1,r,a)}encodeConformal(e,s,{low:r,foot:a},n,i,o){let c=[s,r,a,...n,...n.map(f=>this.twins.get(f)?.low).filter(Boolean)],l=zx(c.map(f=>this.sliceRect(f,i)));if(l===null)return 0;l&&e.setScissorRect(l.x,l.y,l.width,l.height);let u=this.encodeConformalIn(e,s,{low:r,foot:a},n,i,o);return l&&e.setScissorRect(this.viewport.x,this.viewport.y,this.viewport.width,this.viewport.height),u}encodeConformalIn(e,s,{low:r,foot:a},n,i,o){let c=this.pipelines.color,l=g=>Aa[g==="step"||g==="regionStep"?"coat":g],u=(g,p=l(g).reference)=>{e.setPipeline(c[g]),e.setStencilReference(p)},f=(g,p)=>{this.writeSlice(g,i,p),e.setBindGroup(0,g.bindGroup)},b=o(s);f(a,b),this.encodeFill(e,a,u,"footprint"),f(s,b),this.encodeFill(e,s,u,"mask"),u("tintHigh"),e.draw(6),e.setBindGroup(0,a.bindGroup),a.regionEdges&&(u("regionStep"),e.draw(6,a.regionEdges,0,0)),a.skirtEdges&&this.wallPixels(a.zTop-a.zBottom)>=Gf&&(u("step"),e.draw(12,a.skirtEdges,0,a.regionEdges)),e.setBindGroup(0,s.bindGroup),u("clearLay"),e.draw(6),f(r,b),this.encodeFill(e,r,u,"mask"),u("tintLow"),e.draw(6),u("clearLay"),e.draw(6);for(let g of n){let p=o(g);f(g,p),this.encodeFill(e,g,u,"onFoot"),u("clear"),e.draw(6);let d=this.twins.get(g)?.low;d&&(f(d,p),this.encodeFill(e,d,u,"offFoot"),u("clear"),e.draw(6))}return e.setBindGroup(0,s.bindGroup),u("clearFoot"),e.draw(6),e.setStencilReference(1),1+n.length}encodeBatches(e,s,r,a,n="opaque"){let i=s.batches.findLast(o=>!o.subtract);for(let o of s.batches){if(o.subtract!==r||!s.fans)continue;a("fan"),e.setVertexBuffer(0,s.fans),e.draw(o.vertexCount,1,o.firstVertex,0),!r&&n==="opaque"&&(s.mark||s.role==="dielectric")&&(a("coverMark",s.mark?65:64),e.draw(6,o.coverCount,0,o.firstCover));let c={opaque:"coverAdd",blend:"coverBlend",mask:"coverLay",footprint:"footCover",onFoot:"coverOnFoot",offFoot:"coverOffFoot"}[n];a(r?"coverSubtract":c),e.draw(6,o.coverCount,0,o.firstCover),!r&&(o!==i||n==="footprint")&&(a("coverClear"),e.draw(6,o.coverCount,0,o.firstCover))}}gpuMemoryBytes(){let e=this.valuesBuffer===this.emptyValues?0:this.valuesBuffer.size;this.barrels&&(e+=this.barrels.count*Nd),this.walls&&(e+=this.walls.count*Bd);let s=new Set;for(let r of this.slices.flatMap(a=>a.plain?[a,a.plain]:[a]))for(let a of[r.shapes,r.covers,r.fans,r.uniform,r.edges,r.cuts])a&&s.add(a);for(let r of s)e+=r.size;return e+this.fieldCache.bytes()}stats(){return{slices:this.slices.map(e=>({key:e.key,role:e.role||"copper",face:e.face,layerId:e.layerId,z:e.z,shapes:e.shapeCount,subtractShapes:e.subtractShapes,regionBatches:e.batches.length,fanVertices:e.lowered.fanVertices.length/2,covers:e.lowered.covers.length/6,approximations:e.lowered.stats})),overlay:this.overlay.mode,barrels:this.barrels?{count:this.barrels.count,skipped:this.barrels.skipped}:null,walls:this.walls?.count||0,gpuMemoryBytes:this.gpuMemoryBytes(),degraded:!this.stencil}}makePlainSlabs(e){let s=new Map;for(let r of this.slices){if(r.role!=="dielectric"||!r.lowered)continue;s.has(r.lowered)||s.set(r.lowered,Pf(r.lowered));let a=s.get(r.lowered);a&&(r.plain=this.uploadSlice({...r,lowered:a,plain:null},e))}}drawnSlice(e){return this.separated&&e.plain?e.plain:e}releaseSlices(){for(let s of this.twins?.values()||[])for(let r of Object.values(s))r.uniform.destroy();this.twinBuffers?.forEach(s=>s.destroy()),this.twinBuffers=[],this.twins=new Map;let e=new Set;for(let s of this.slices.flatMap(r=>r.plain?[r,r.plain]:[r]))for(let r of[s.shapes,s.covers,s.fans,s.uniform,s.edges,s.cuts])r&&e.add(r);for(let s of e)s.destroy();this.fieldCache?.clear(),this.slices=[]}destroy(){this.releaseSlices(),this.barrels?.buffer.destroy(),this.walls?.buffer.destroy(),this.arrows?.buffer.destroy(),this.drawnLayersBuffer.destroy(),this.palette.destroy(),this.netsBuffer.destroy(),this.barrelView.destroy(),this.layerOffsets.destroy(),this.valuesBuffer!==this.emptyValues&&this.valuesBuffer.destroy(),this.emptyValues.destroy(),this.emptyField.destroy(),this.boardClip?.texture.destroy(),this.emptyClip.destroy()}};function Ux({data:t,width:e,height:s}){let r=e+2,a=s+2,n=new Uint8Array(r*a);for(let i=0;i<s;i+=1)for(let o=0;o<e;o+=1)if(t[i*e+o])for(let c=0;c<3;c+=1)n.fill(1,(i+c)*r+o,(i+c)*r+o+3);return{data:n,width:r,height:a}}function zx(t){let e=null;for(let s of t){if(s===void 0)return;if(!s)continue;if(!e){e={...s};continue}let r=Math.min(e.x,s.x),a=Math.min(e.y,s.y);e={x:r,y:a,width:Math.max(e.x+e.width,s.x+s.width)-r,height:Math.max(e.y+e.height,s.y+s.height)-a}}return e}function Gx(t){let e=Kx(Array.from(t,Number));if(!e)return[0,0,-1,0];let s=l=>[0,1,2,3].map(u=>e[u]*l[0]+e[4+u]*l[1]+e[8+u]*l[2]+e[12+u]*l[3]),r=s([0,0,1,0]),a=Math.hypot(r[0],r[1],r[2]);if(Math.abs(r[3])>1e-9*Math.max(a,1e-30))return[r[0]/r[3],r[1]/r[3],r[2]/r[3],1];let n=s([0,0,1,1]),i=s([0,0,0,1]),o=[0,1,2].map(l=>i[l]/i[3]-n[l]/n[3]),c=Math.hypot(...o)||1;return[...o.map(l=>l/c),0]}function Kx(t){let e=new Array(16);e[0]=t[5]*t[10]*t[15]-t[5]*t[11]*t[14]-t[9]*t[6]*t[15]+t[9]*t[7]*t[14]+t[13]*t[6]*t[11]-t[13]*t[7]*t[10],e[4]=-t[4]*t[10]*t[15]+t[4]*t[11]*t[14]+t[8]*t[6]*t[15]-t[8]*t[7]*t[14]-t[12]*t[6]*t[11]+t[12]*t[7]*t[10],e[8]=t[4]*t[9]*t[15]-t[4]*t[11]*t[13]-t[8]*t[5]*t[15]+t[8]*t[7]*t[13]+t[12]*t[5]*t[11]-t[12]*t[7]*t[9],e[12]=-t[4]*t[9]*t[14]+t[4]*t[10]*t[13]+t[8]*t[5]*t[14]-t[8]*t[6]*t[13]-t[12]*t[5]*t[10]+t[12]*t[6]*t[9],e[1]=-t[1]*t[10]*t[15]+t[1]*t[11]*t[14]+t[9]*t[2]*t[15]-t[9]*t[3]*t[14]-t[13]*t[2]*t[11]+t[13]*t[3]*t[10],e[5]=t[0]*t[10]*t[15]-t[0]*t[11]*t[14]-t[8]*t[2]*t[15]+t[8]*t[3]*t[14]+t[12]*t[2]*t[11]-t[12]*t[3]*t[10],e[9]=-t[0]*t[9]*t[15]+t[0]*t[11]*t[13]+t[8]*t[1]*t[15]-t[8]*t[3]*t[13]-t[12]*t[1]*t[11]+t[12]*t[3]*t[9],e[13]=t[0]*t[9]*t[14]-t[0]*t[10]*t[13]-t[8]*t[1]*t[14]+t[8]*t[2]*t[13]+t[12]*t[1]*t[10]-t[12]*t[2]*t[9],e[2]=t[1]*t[6]*t[15]-t[1]*t[7]*t[14]-t[5]*t[2]*t[15]+t[5]*t[3]*t[14]+t[13]*t[2]*t[7]-t[13]*t[3]*t[6],e[6]=-t[0]*t[6]*t[15]+t[0]*t[7]*t[14]+t[4]*t[2]*t[15]-t[4]*t[3]*t[14]-t[12]*t[2]*t[7]+t[12]*t[3]*t[6],e[10]=t[0]*t[5]*t[15]-t[0]*t[7]*t[13]-t[4]*t[1]*t[15]+t[4]*t[3]*t[13]+t[12]*t[1]*t[7]-t[12]*t[3]*t[5],e[14]=-t[0]*t[5]*t[14]+t[0]*t[6]*t[13]+t[4]*t[1]*t[14]-t[4]*t[2]*t[13]-t[12]*t[1]*t[6]+t[12]*t[2]*t[5],e[3]=-t[1]*t[6]*t[11]+t[1]*t[7]*t[10]+t[5]*t[2]*t[11]-t[5]*t[3]*t[10]-t[9]*t[2]*t[7]+t[9]*t[3]*t[6],e[7]=t[0]*t[6]*t[11]-t[0]*t[7]*t[10]-t[4]*t[2]*t[11]+t[4]*t[3]*t[10]+t[8]*t[2]*t[7]-t[8]*t[3]*t[6],e[11]=-t[0]*t[5]*t[11]+t[0]*t[7]*t[9]+t[4]*t[1]*t[11]-t[4]*t[3]*t[9]-t[8]*t[1]*t[7]+t[8]*t[3]*t[5],e[15]=t[0]*t[5]*t[10]-t[0]*t[6]*t[9]-t[4]*t[1]*t[10]+t[4]*t[2]*t[9]+t[8]*t[1]*t[6]-t[8]*t[2]*t[5];let s=t[0]*e[0]+t[1]*e[4]+t[2]*e[8]+t[3]*e[12];return s?e.map(r=>r/s):null}function Wf(t,e=1536){if(!t||t.length<12)return null;let[s,r,a,n]=[1/0,1/0,-1/0,-1/0];for(let g=0;g+3<t.length;g+=4)s=Math.min(s,t[g],t[g+2]),a=Math.max(a,t[g],t[g+2]),r=Math.min(r,t[g+1],t[g+3]),n=Math.max(n,t[g+1],t[g+3]);let i=1;[s,r,a,n]=[s-i,r-i,a+i,n+i];let o=Math.max(Math.max(a-s,n-r)/e,.02),c=Math.max(1,Math.ceil((a-s)/o)),l=Math.max(1,Math.ceil((n-r)/o)),u=new Uint8Array(c*l),f=Array.from({length:l},()=>[]);for(let g=0;g+3<t.length;g+=4){let[p,d,m,h]=[t[g],t[g+1],t[g+2],t[g+3]];if(d===h)continue;let y=Math.max(0,Math.ceil((Math.min(d,h)-r)/o-.5)),w=Math.min(l-1,Math.floor((Math.max(d,h)-r)/o-.5));for(let v=y;v<=w;v+=1)f[v].push(g)}let b=[];for(let g=0;g<l;g+=1){let p=r+(g+.5)*o;b.length=0;for(let d of f[g]){let[m,h,y,w]=[t[d],t[d+1],t[d+2],t[d+3]];h<=p!=w<=p&&b.push(m+(p-h)/(w-h)*(y-m))}b.sort((d,m)=>d-m);for(let d=0;d+1<b.length;d+=2){let m=Math.max(0,Math.ceil((b[d]-s)/o-.5)),h=Math.min(c-1,Math.floor((b[d+1]-s)/o-.5));h>=m&&u.fill(1,g*c+m,g*c+h+1)}}return{data:u,width:c,height:l,originMm:[s,r],pitchMm:o}}function Vx(t,e,s=0){let r=new Map((e||[]).map(a=>[Number(a.id),a]));for(let a of t||[]){let n=r.get(Number(a.layerId));if(a.kind!=="copper"||!n||!a.quantMin||!a.quantSize)continue;let i=a.quantSize[2]===1;return a.quantMin[2]+(i?0:a.quantSize[2]/2)-Number(n.z_mm||0)/1e3}return Number(s||0)/1e3}async function _o({renderer:t,layers:e,colorFor:s,bytes:r,wasm:a,toleranceNm:n,nets:i=[],features:o=[],boardZOffsetMm:c=0,pack:l=null,cache:u=null,pool:f=null,netIds:b=null}){let g={},p=performance.now(),d=G=>{let ne=performance.now();g[G]=Math.round(ne-p),p=ne},m=l||await Mr(r,{wasm:a}),h=m.lowerSlice?m:null,y=async()=>h??=await Mr(r,{wasm:a});d("open");let w=Vx(t.entries,e,c),{planned:v,unmatched:x}=mf(m.header,e,w),S=new Map(e.map(G=>[Number(G.id),G])),T=performance.now(),A=[...new Set(v.map(G=>G.key))],_=n??ds,N=new Map,B=u?{cacheKey:u.cacheKey,wasmKey:Is(),toleranceNm:_}:null;if(B){let G=A.filter(ne=>!N.has(ne));for(let[ne,tt]of await Tr(u.store,B,G))N.set(ne,tt);g.cached=A.filter(ne=>N.has(ne)).length}let C=A.filter(G=>!N.has(G)),R=Af(m.header),O=new Set,P=B&&typeof u.store.adopt=="function"&&u.store.enabled!==!1?{identity:B,writes:[],adopt(G,ne){u.store.adopt(tn(B.cacheKey,B.wasmKey,B.toleranceNm,G),ne),O.add(G)}}:null,H=C.length?f?await f.lower(C,_,R,P):await Rf(r,C,_,a??Za(),{weights:R}):new Map;g.lowerIn=C.length?H?"workers":"main":"none";let Q=new Map;for(let G of C){let ne=H?.get(G);Q.set(G,ne||(await y()).lowerSlice(G,n)),N.set(G,ne?sn(ne):Q.get(G))}let pe=v.map(G=>({...G,color:G.role==="copper"?s(S.get(G.layerId)):G.color||[1,1,1,1],lowered:N.get(G.key)})),ae=Ff(pe),me=ae.map(([G,ne])=>nn(G,ne)),Ae=B?await Tr(u.store,B,me):new Map,be=ae.filter((G,ne)=>!Ae.has(me[ne])),_e=be.length&&f?await f.steps(be.map(([G,ne])=>[ne.lowered,G.lowered]),P,be.map(([G,ne])=>nn(G,ne))):[],ye=new Map;be.forEach(([G,ne],tt)=>{_e[tt]&&ye.set(nn(G,ne),_e[tt])}),ae.forEach(([G],ne)=>{let tt=ye.get(me[ne]);G.step=Ae.get(me[ne])||tt&&sn(tt)||null}),g.steps=`${Ae.size} cached, ${ye.size} in workers, ${ae.length-Ae.size-ye.size} here`;let Le=G=>!!H?.get(G)||ye.has(G),Ie=new Map([...Q,...ye].filter(([G])=>!(P&&Le(G)))),Ws=B&&Ie.size?bo(u.store,B,Ie):Promise.resolve(),ms=performance.now()-T;d("lower"),await Zt.prewarm(t);let I=new Zt(t);I.setSlices(pe),d("slices");let L=pe.find(G=>G.role==="dielectric"&&G.lowered?.contourEdges?.length)?.lowered.contourEdges,K=Wf(L),Y=await m.barrels();I.setBarrels(wf(m.header,Y,pe,L)),I.setBoardClipMask(K),d("barrels");let ge=new Set;for(let G=0;G<Y.words.length;G+=Qa)ge.add(Y.words[G]);I.edgePlated=!!m.header.stack?.edge_plating,I.setWalls(vf(pe,N,e,w)),d("walls");let ve=b?null:await m.netIndices?.(),lt=b||xf(ve?{header:m.header,netIndices:()=>ve}:m,i);I.setOperationNets(lt),d("nets");let ys=Promise.resolve();if(B){let G=ve?bo(u.store,B,new Map([[Sr,Ef(m.header,Y,ve)]])):Promise.resolve(),ne=P?[...Q.keys(),...ye.keys()].filter(Le):[];ys=Promise.all([Ws,G,...P?.writes||[]]).then(()=>{if(ne.every(tt=>O.has(tt)))return Tf(u.store,B)})}let mt=new Map;for(let G of o||[])G?.sourceUid&&(mt.has(G.sourceUid)||mt.set(G.sourceUid,[]),mt.get(G.sourceUid).push(G));return d("features"),h&&h!==m&&h.free(),{cacheWrites:ys,pack:m,analytic:I,unmatched:x,lowerMs:ms,timings:g,zOffset:w,operations:Rs(m.header),overlay:null,netIds:lt,featuresBySource:mt,barrelOperations:ge,lowered:N}}async function ln(t,e){let s=(await t.pack.binding(e))?.source_uid,r=s?t.featuresBySource?.get(s)||[]:[],a=t.netIds?.[e]||0,n=r.find(i=>Number(i.netId)===a)||r[0];return n?Number(n.id):0}async function Io(t,e,s){let r=kc+e;if(s.features.has(r))return r;let a=await t.pack.binding(e);if(!a)return 0;let n=String(a.refdes||""),i=String(a.pad_number||"");if(n&&!i)return Number(s.componentFeatures.get(n)?.featureId||0);let o=Number(t.netIds?.[e]||0);return!i&&!o?0:(s.features.set(r,{id:r,kind:String(a.source_kind||"copper"),...n?{designator:n}:{},...i?{padNumber:i}:{},netId:o,sourceUid:String(a.source_uid||""),bounds:null}),r)}function Yf(t,e){if(!e)return t.analytic.clearOverlay(),t.overlay=null,null;if(e.kind==="operation_values"){let s=po(e.values,t.operations),r=e.range||Ns(s);t.analytic.setOperationValues(s,r),t.overlay={...e,values:s,range:r}}else if(e.kind==="field_tiles"){let s=yf(e.tiles),r=e.range||Ns([...s.values()].flatMap(a=>[...Ns(a.values)]));t.analytic.setFieldRasters(s,r),t.overlay={...e,range:r,slices:[...s.keys()]}}else if(e.kind==="field_grid"){let s=en(e.grid),r=e.range||Ns([...s.values()].flatMap(n=>[...Ns(n.values)])),a=e.values?po(e.values,t.operations):null;t.analytic.setFieldRasters(s,r,a),t.overlay={kind:e.kind,quantity:e.quantity,units:e.units,range:r,slices:[...s.keys()],barrels:a,net:e.grid?.net??null}}else throw new TypeError(`unknown analytic overlay kind ${e.kind}`);return{kind:e.kind,range:t.overlay.range}}function Ao(t,e,s=!1){let[r,a]=Array.isArray(t.pitchMm)?t.pitchMm:[t.pitchMm,t.pitchMm],n=(e[0]-t.originMm[0])/r-.5,i=(e[1]-t.originMm[1])/a-.5,o=(m,h)=>m<0||h<0||m>=t.width||h>=t.height?NaN:t.values[h*t.width+m],[c,l]=[Math.floor(n),Math.floor(i)],[u,f]=[n-c,i-l],b=o(c,l),g=o(c+1,l),p=o(c,l+1),d=o(c+1,l+1);return[b,g,p,d].every(Number.isFinite)?(b*(1-u)+g*u)*(1-f)+(p*(1-u)+d*u)*f:s?NaN:o(Math.floor(n+.5),Math.floor(i+.5))}function Hx(t,e,s){let[r,a]=Array.isArray(t.pitchMm)?t.pitchMm:[t.pitchMm,t.pitchMm],n=(e[0]-t.originMm[0])/r-.5,i=(e[1]-t.originMm[1])/a-.5,o=NaN,c=1/0;for(let l=Math.floor(i)-s+1;l<=Math.floor(i)+s;l+=1)for(let u=Math.floor(n)-s+1;u<=Math.floor(n)+s;u+=1){if(u<0||l<0||u>=t.width||l>=t.height)continue;let f=t.values[l*t.width+u],b=(u-n)**2+(l-i)**2;Number.isFinite(f)&&b<c&&([o,c]=[f,b])}return o}function Jf(t){let e=new Map;for(let s of t.analytic.slices){if(!s.field||!(s.role===void 0||s.role==="copper"))continue;let r=e.get(s.layerId);(!r||s.z>r.z)&&e.set(s.layerId,s)}return[...e.values()].map(s=>({slice:s,key:s.key,layerId:s.layerId,cells:s.field.values.reduce((r,a)=>r+(Number.isFinite(a)?1:0),0)}))}function Qf(t,e){if(!e)return 0;let s=(t||[]).find(r=>r?.name===e)||(t||[]).find(r=>(r?.aliases||[]).includes(e));return s&&Number(s.id)||0}var Xf=48,qx=70,$f=2e-6,Wx=.95;function Xx(t,e,s,{spacingMm:r=null,floor:a=.001,density:n=qx,width:i=.07,minLength:o=.3}={}){let c=t.filter(w=>w.role==="copper"&&e.has(w.key)&&s.has(w.key)&&w.face===(w.bottom?"bottom":"top"));if(!c.length)return{data:new ArrayBuffer(0),count:0,spacingMm:0,max:0,reference:0};let l=c.reduce((w,v)=>[Math.min(w[0],v.bounds[0]),Math.min(w[1],v.bounds[1]),Math.max(w[2],v.bounds[2]),Math.max(w[3],v.bounds[3])],[1/0,1/0,-1/0,-1/0]),u=r||Math.max(l[2]-l[0],l[3]-l[1])/n,f=[];for(let w of c){let[v,x]=[e.get(w.key),s.get(w.key)],[S,T,A,_]=w.bounds;for(let N=l[0]+Math.ceil((S-l[0])/u)*u+u/2;N<=A;N+=u)for(let B=l[1]+Math.ceil((T-l[1])/u)*u+u/2;B<=_;B+=u){let C=Ao(v,[N,B],!0),R=Ao(x,[N,B],!0),O=Math.hypot(C,R);O>0&&f.push({face:w,x:N,y:B,jx:C,jy:R,size:O})}}let b=f.map(w=>w.size).sort((w,v)=>w-v),g=b.length?b[b.length-1]:0,p=b.length?b[Math.min(b.length-1,Math.floor(Wx*b.length))]:0,d=f.filter(w=>w.size>=a*p),m=new ArrayBuffer(d.length*Xf),h=new Float32Array(m),y=new Uint32Array(m);return d.forEach((w,v)=>{let x=v*(Xf/4),[S,T]=w.face.offsetLayers||[w.face.layerId,w.face.layerId],A=w.face.bottom?-$f:$f,_=Math.min(1,w.size/p),N=.9*u*(o+(1-o)*Math.sqrt(_))/1e3;h.set([w.x/1e3,-w.y/1e3,w.face.z+A,i*u/1e3,w.jx/w.size,-w.jy/w.size,N,_],x),y.set([S,T,0,0],x+8)}),{data:m,count:d.length,spacingMm:u,max:g,reference:p}}function Ro(t,e){if(!e)return t.analytic.setArrows(null),t.vectors=null,t.vectorInput=null,null;let s=t.analytic.style,r=Xx(t.analytic.slices,en(e.x),en(e.y),{density:s.arrowDensity,width:s.arrowWidth,minLength:s.arrowMinLength});return t.analytic.setArrows(r),t.vectorInput=e,t.vectors={quantity:e.quantity,units:e.units,max:r.max,reference:r.reference,spacingMm:r.spacingMm},{count:r.count,max:r.max,reference:r.reference,spacingMm:r.spacingMm}}function Zf(t,e){let s=t.analytic.style,r=t.analytic.setStyle(e);return["arrowDensity","arrowWidth","arrowMinLength"].some(n=>s[n]!==r[n])&&t.vectorInput&&Ro(t,t.vectorInput),r}function eh(t,e){for(let s of t?.chunks||[]){let r=Number(s.first_operation_index);if(e>=r&&e<r+Number(s.operation_count||0))return s.slice_key}return null}function dn(t,e,s,r=null,a=null,n=0){let i=null;for(let o of t.analytic.slices){if(!o.field||Math.abs(e.direction[2])<1e-12||r&&o.key!==r||a&&!a.has(Number(o.layerId)))continue;let[c,l]=o.offsetLayers||[o.layerId,o.layerId],u=o.z+.5*((s?.[c]||0)+(s?.[l]||0)),f=(u-e.origin[2])/e.direction[2];if(!r&&!(f>0)||i&&f>=i.t)continue;let b=[e.origin[0]+f*e.direction[0],e.origin[1]+f*e.direction[1],u],g=[b[0]*1e3,-b[1]*1e3],p=Ao(o.field,g);!Number.isFinite(p)&&n>0&&(p=Hx(o.field,g,n)),Number.isFinite(p)&&(i={t:f,value:p,sliceKey:o.key,boardMm:g,world:b})}return i&&{value:i.value,sliceKey:i.sliceKey,boardMm:i.boardMm,world:i.world}}async function No(t,e,s=null){let r=t.overlay,a=r?.kind==="operation_values"?r.values[e]:r?.barrels?.[e],n=r?.kind!=="operation_values"&&Number.isFinite(a)&&(!t.barrelOperations||t.barrelOperations.has(e)),i=r?.kind==="operation_values"||n?a:s?.value;return n&&(s={...s,sliceKey:"via barrel"}),{operationIndex:e,featureId:await ln(t,e)||null,binding:await t.pack.binding(e),...Number.isFinite(i)?{value:i,quantity:r.quantity,units:r.units}:{},...s?{sliceKey:s.sliceKey,boardMm:s.boardMm,world:s.world}:{}}}var $x=2048,Yx=.22,th=2,sh=1024,rh=160;function Jx(t,e,s){let r=Float32Array.from(t,o=>Number.isFinite(o)?o:NaN),a=new Int32Array(e*s),n=0,i=0;for(let o=0;o<r.length;o+=1)Number.isFinite(r[o])&&(a[i++]=o);for(;n<i;){let o=a[n++],c=o%e,l=(o-c)/e;for(let[u,f]of[[c-1,l],[c+1,l],[c,l-1],[c,l+1]]){if(u<0||f<0||u>=e||f>=s)continue;let b=f*e+u;Number.isFinite(r[b])||(r[b]=r[o],a[i++]=b)}}return r}function Qx(t,e,s){let[r,a,n,i]=t,o=(n-r)/1e3,c=(i-a)/1e3,l=(r+n)/2e3,u=-(a+i)/2e3,f=s-e||1;return new Float32Array([2/o,0,0,0,0,2/c,0,0,0,0,1/f,0,-2*l/o,-2*u/c,-e/f,1])}function Zx(t,e=$x){let s=t[2]-t[0],r=t[3]-t[1],a=e/Math.max(s,r,1e-9);return[Math.max(1,Math.round(s*a)),Math.max(1,Math.round(r*a))]}var e1=`
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
`,un=`
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

// The grid is drawn in patches of PATCH x PATCH quads, instanced, from one
// shared index buffer. Each point's height and normal were computed once per
// field (cs_grid in GRID_SHADER, as (z, normal)): a vertex reads one entry.
@group(0) @binding(5) var<storage, read> patchGrid: array<vec4f>;
const PATCH = PATCH_SIZEu;

@vertex fn vs_relief_patch(@builtin(vertex_index) vertex: u32, @builtin(instance_index) patchIndex: u32) -> ReliefOut {
  let cells = relief.grid - vec2u(1u);
  let patches = (cells + vec2u(PATCH - 1u)) / PATCH;
  let local = vec2u(vertex % (PATCH + 1u), vertex / (PATCH + 1u));
  // Past the grid's last point a patch folds onto it: zero-area triangles.
  let at = min(vec2u(patchIndex % patches.x, patchIndex / patches.x) * PATCH + local, cells);
  let t = vec2f(at) / vec2f(cells);
  let board = mix(relief.bounds.xy, relief.bounds.zw, t);
  let point = patchGrid[at.y * relief.grid.x + at.x];
  var out: ReliefOut;
  out.position = relief.viewProjection * vec4f(board.x * 0.001, -board.y * 0.001, point.x, 1.0);
  out.board = board;
  out.normal = point.yzw;
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
`,ht=64,t1=`
struct Relief {
  viewProjection: mat4x4f,
  bounds: vec4f,
  fieldOrigin: vec2f,
  fieldPitch: vec2f,
  fieldSize: vec2u,
  grid: vec2u,
  range: vec2f,
  base: f32,
  height: f32,
  light: vec4f,
};
@group(0) @binding(0) var<uniform> relief: Relief;
@group(0) @binding(1) var field: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> outGrid: array<vec4f>;
const ABSENT = 3e38;
fn present(value: f32) -> bool { return value < 1e38; }
${un.slice(un.indexOf("fn cell("),un.indexOf("struct ReliefOut"))}
@compute @workgroup_size(8, 8) fn cs_grid(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= relief.grid.x || id.y >= relief.grid.y) { return; }
  let cells = relief.grid - vec2u(1u);
  let t = vec2f(id.xy) / vec2f(cells);
  let board = mix(relief.bounds.xy, relief.bounds.zw, t);
  let z = lift(board);
  let step = (relief.bounds.zw - relief.bounds.xy) / vec2f(cells);
  let dx = (lift(board + vec2f(step.x, 0.0)) - lift(board - vec2f(step.x, 0.0))) / (0.002 * step.x);
  let dy = (lift(board + vec2f(0.0, step.y)) - lift(board - vec2f(0.0, step.y))) / (0.002 * step.y);
  outGrid[id.y * relief.grid.x + id.x] = vec4f(z, normalize(vec3f(-dx, dy, 1.0)));
}
`,s1=`
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
`,fn=class{constructor(e){this.analytic=e,this.renderer=e.renderer,this.device=e.device,this.uniform=this.device.createBuffer({label:"relief",size:rh,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.scratch=new ArrayBuffer(rh),this.sampler=this.device.createSampler({magFilter:"linear",minFilter:"linear"}),this.layer=null,this.vertexCount=0}get ready(){return this.vertexCount>0}pipeline(){if(this.reliefPipeline)return this.reliefPipeline;let e=this.device.createShaderModule({label:"relief",code:un.replace("PALETTE",s1).replace("PATCH_SIZE",String(ht))});return this.reliefPipeline=this.device.createRenderPipeline({label:"relief",layout:"auto",vertex:{module:e,entryPoint:"vs_relief_patch"},fragment:{module:e,entryPoint:"fs_relief",targets:[{format:this.renderer.format}]},primitive:{topology:"triangle-list",cullMode:"none"},depthStencil:{format:this.renderer.depthFormat,depthWriteEnabled:!0,depthCompare:"greater"},multisample:{count:this.renderer.sampleCount||1}}),this.reliefPipeline}gridPipeline(){if(this.gridComputePipeline)return this.gridComputePipeline;let e=this.device.createShaderModule({label:"relief-grid",code:t1});return this.gridComputePipeline=this.device.createComputePipeline({label:"relief-grid",layout:"auto",compute:{module:e,entryPoint:"cs_grid"}}),this.gridComputePipeline}patchIndices(){if(this.patchIndexBuffer)return this.patchIndexBuffer;let e=ht+1,s=new Uint16Array(ht*ht*6),r=0;for(let a=0;a<ht;a+=1)for(let n=0;n<ht;n+=1){let i=a*e+n;s.set([i,i+1,i+e,i+e,i+1,i+e+1],r),r+=6}return this.patchIndexBuffer=this.device.createBuffer({label:"relief-patch-indices",size:s.byteLength,usage:GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST}),this.device.queue.writeBuffer(this.patchIndexBuffer,0,s),this.patchIndexBuffer}computeGrid(){let[e,s]=this.grid;this.points=this.device.createBuffer({label:"relief-points",size:e*s*16,usage:GPUBufferUsage.STORAGE}),this.writeUniform(new Float32Array(16));let r=this.gridPipeline(),a=this.device.createBindGroup({layout:r.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniform}},{binding:1,resource:this.field.createView()},{binding:2,resource:{buffer:this.points}}]}),n=this.device.createCommandEncoder(),i=n.beginComputePass({label:"relief-grid"});i.setPipeline(r),i.setBindGroup(0,a),i.dispatchWorkgroups(Math.ceil(e/8),Math.ceil(s/8)),i.end(),this.device.queue.submit([n.finish()])}netPipeline(){if(this.netMaskPipeline)return this.netMaskPipeline;let e=this.device.createShaderModule({label:"relief-net-mask",code:e1});return this.netMaskPipeline=this.device.createRenderPipeline({label:"relief-net-mask",layout:"auto",vertex:{module:e,entryPoint:"vs_full"},fragment:{module:e,entryPoint:"fs_net",targets:[{format:"r8unorm"}]},primitive:{topology:"triangle-list"}}),this.netMaskPipeline}build(e,{range:s,netId:r=0,heightShare:a=Yx}={}){let n=this.maskKey,i=this.mask&&n?.slices===this.analytic.slices&&n.nets===this.analytic.netsBuffer&&n.layer===e?.layerId&&n.net===r,o=i?this.mask:null;i&&(this.mask=null),this.release();let c=e?.field;if(!c)return o?.destroy(),!1;let l=this.boundsOf(e),[u,f]=Zx(l);if(o)this.mask=o;else{let y=this.renderMask(e.layerId,l,u,f);this.mask=this.filterMask(y,u,f,r),y.destroy(),this.maskKey={slices:this.analytic.slices,nets:this.analytic.netsBuffer,layer:e.layerId,net:r}}let b=Jx(c.values,c.width,c.height),g=Float32Array.from(b,y=>Number.isFinite(y)?y:3e38);this.field=this.device.createTexture({label:"relief-field",size:[c.width,c.height],format:"r32float",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST}),this.device.queue.writeTexture({texture:this.field},g,{bytesPerRow:c.width*4},[c.width,c.height]);let[p,d]=Array.isArray(c.pitchMm)?c.pitchMm:[c.pitchMm,c.pitchMm],m=Math.max(l[2]-l[0],l[3]-l[1])/1e3,h=[Math.min(sh,Math.max(2,Math.ceil((l[2]-l[0])/p*th)+1)),Math.min(sh,Math.max(2,Math.ceil((l[3]-l[1])/d*th)+1))];return this.layer=e.layerId,this.sliceKey=e.key,this.boundsMm=l,this.base=e.z,this.height=m*a,this.grid=h,this.vertexCount=(h[0]-1)*(h[1]-1)*6,this.params={field:c,pitch:[p,d],range:s||[0,1]},this.computeGrid(),this.patches=Math.ceil((h[0]-1)/ht)*Math.ceil((h[1]-1)/ht),this.bindGroup=this.device.createBindGroup({layout:this.pipeline().getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniform}},{binding:1,resource:this.field.createView()},{binding:2,resource:this.mask.createView()},{binding:3,resource:this.sampler},{binding:4,resource:{buffer:this.analytic.palette}},{binding:5,resource:{buffer:this.points}}]}),this.renderer.invalidate?.(),!0}boundsOf(e){let s=this.analytic.slices.filter(n=>n.layerId===e.layerId&&(n.role===void 0||n.role==="copper")),r=(s.length?s:[e]).map(n=>n.bounds),a=.05;return[Math.min(...r.map(n=>n[0]))-a,Math.min(...r.map(n=>n[1]))-a,Math.max(...r.map(n=>n[2]))+a,Math.max(...r.map(n=>n[3]))+a]}renderMask(e,s,r,a){let{analytic:n,renderer:i,device:o}=this,c=n.extent,l=(c?.[0][2]??-.01)-.001,u=(c?.[1][2]??.01)+.001,f=Qx(s,l,u),b=o.createTexture({label:"relief-pick",size:[r,a],format:"rg32uint",usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING}),g=o.createTexture({label:"relief-pick-depth",size:[r,a],format:i.depthFormat,usage:GPUTextureUsage.RENDER_ATTACHMENT}),p={view:g.createView(),depthClearValue:0,depthLoadOp:"clear",depthStoreOp:"discard"};i.stencil&&Object.assign(p,{stencilClearValue:0,stencilLoadOp:"clear",stencilStoreOp:"discard"});let d=o.createCommandEncoder(),m=d.beginRenderPass({colorAttachments:[{view:b.createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}],depthStencilAttachment:p}),h=i.innerCopperMode;i.innerCopperMode="all";try{i.writeGlobals(f,0,0,0,0),i.stencil&&m.setStencilReference(1),n.encodeInto(m,null,new Set([e]),!0,{matrix:f,showBoard:!1})}finally{i.innerCopperMode=h}return m.end(),o.queue.submit([d.finish()]),g.destroy(),b}filterMask(e,s,r,a){let{device:n}=this,i=n.createTexture({label:"relief-mask",size:[s,r],format:"r8unorm",usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING}),o=n.createBuffer({label:"relief-net",size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});n.queue.writeBuffer(o,0,new Uint32Array([a>>>0,0,0,0]));let c=this.netPipeline(),l=n.createBindGroup({layout:c.getBindGroupLayout(0),entries:[{binding:0,resource:e.createView()},{binding:1,resource:{buffer:this.analytic.netsBuffer}},{binding:2,resource:{buffer:o}}]}),u=n.createCommandEncoder(),f=u.beginRenderPass({colorAttachments:[{view:i.createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}]});return f.setPipeline(c),f.setBindGroup(0,l),f.draw(3),f.end(),n.queue.submit([u.finish()]),o.destroy(),i}encode(e,s){return this.ready?(this.writeUniform(s),e.setPipeline(this.pipeline()),e.setBindGroup(0,this.bindGroup),e.setIndexBuffer(this.patchIndices(),"uint16"),e.drawIndexed(ht*ht*6,this.patches),1):0}writeUniform(e){let s=new Float32Array(this.scratch),r=new Uint32Array(this.scratch);s.set(e,0),s.set(this.boundsMm,16),s.set(this.params.field.originMm,20),s.set(this.params.pitch,22),r[24]=this.params.field.width,r[25]=this.params.field.height,r[26]=this.grid[0],r[27]=this.grid[1],s.set(this.params.range,28),s[30]=this.base,s[31]=this.height,s.set([.35,.45,.82,0],32),this.device.queue.writeBuffer(this.uniform,0,this.scratch)}worldBounds(){if(!this.ready)return null;let[e,s,r,a]=this.boundsMm;return[e/1e3,-a/1e3,this.base,r/1e3,-s/1e3,this.base+this.height]}release(){this.mask?.destroy(),this.field?.destroy(),this.points?.destroy(),this.points=null,this.mask=null,this.field=null,this.bindGroup=null,this.vertexCount=0,this.layer=null}destroy(){this.release(),this.uniform.destroy(),this.patchIndexBuffer?.destroy()}};var r1="PRSMSH01",a1="prism.sim.mesh-pack",n1=Object.freeze({size:"descending",min_angle:"ascending",cut_fraction:"ascending",slaved:"descending",pieces:"descending",indicator:"descending"});function nh(t){let e=t instanceof Uint8Array?t:new Uint8Array(t);if(e.length<8)return!1;for(let s=0;s<8;s+=1)if(e[s]!==r1.charCodeAt(s))return!1;return!0}async function i1(t){let e=t instanceof Uint8Array?t:new Uint8Array(t);if(nh(e))return e.buffer.slice(e.byteOffset,e.byteOffset+e.byteLength);let s=new Blob([e]).stream().pipeThrough(new DecompressionStream("deflate"));return new Response(s).arrayBuffer()}function o1(t){let e=new Uint8Array(t);if(!nh(e))throw new Error(`not a mesh pack (${JSON.stringify(new TextDecoder().decode(e.subarray(0,8)))})`);let s=new DataView(t).getUint32(8,!0),r=JSON.parse(new TextDecoder().decode(e.subarray(12,12+s)));if(r.schema!==a1)throw new Error(`unexpected schema ${r.schema}`);if(r.version!=="a0")throw new Error(`unsupported mesh pack version ${r.version}`);let a=Math.ceil((12+s)/8)*8,n=(x,S,T,A)=>{let _=Number(S?.offset);if(!Number.isInteger(_)||_<0||_%8)throw new Error(`${A}: offset ${S?.offset} is not 8-aligned`);let N=a+_+T*x.BYTES_PER_ELEMENT;if(N>t.byteLength)throw new Error(`${A}: runs past the data (${N} > ${t.byteLength})`);return new x(t,a+_,T)},i=Ir(r.nodes,"nodes"),o=r.triangles||!r.quads?Ir(r.triangles,"triangles"):0,c=r.quads?Ir(r.quads,"quads"):0,l=o+c,u=n(Int32Array,r.nodes,i*2,"nodes"),f=r.triangles?n(Uint32Array,r.triangles,o*3,"triangles"):new Uint32Array(0);hn(f,i,"triangles");let b=c?n(Uint32Array,r.quads,c*4,"quads"):new Uint32Array(0);hn(b,i,"quads");let g=(x,S)=>{if((x.dtype||"f32")!=="f32")throw new Error(`${S} ${x.name}: dtype ${x.dtype} is not f32`);return{name:String(x.name),unit:x.unit??"",values:n(Float32Array,x,l,`${S} ${x.name}`)}},p=(x,S)=>{let T=Ir(x.piece_vertices,`${S} piece_vertices`),A=Ir(x.piece_triangles,`${S} piece_triangles`),_={sliceKey:String(x.slice_key),netKey:x.net_key==null?"":String(x.net_key),vertices:n(Int32Array,x.piece_vertices,T*2,`${S} piece_vertices`),triangles:n(Uint32Array,x.piece_triangles,A*3,`${S} piece_triangles`),element:n(Uint32Array,x.piece_element,A,`${S} piece_element`),piece:x.piece_id?n(Uint32Array,x.piece_id,A,`${S} piece_id`):null,pieceCount:A,vertexCount:T};return hn(_.triangles,T,`${S} piece_triangles`),hn(_.element,l,`${S} piece_element`),Number.isFinite(Number(x.exact_area_nm2))&&(_.exactAreaNm2=Number(x.exact_area_nm2)),_.fields=(x.element_fields||[]).map(N=>g(N,`${S} element field`)),_.elementBase=0,_},d=(r.layers||[]).map((x,S)=>p(x,`layers[${S}] (${x.slice_key}, ${x.net_key})`)),m=r.domain?p({slice_key:"",net_key:"",...r.domain},"domain"):null,h=(r.element_fields||[]).map(x=>g(x,"element field")),y=new Uint32Array(l+1);for(let x=0;x<l;x+=1)y[x+1]=y[x]+(x<o?3:4);let w=new Uint32Array(f.length+b.length);w.set(f,0),w.set(b,f.length);let v=[...new Set(d.map(x=>x.sliceKey))];return{header:r,buffer:t,dataStart:a,nodes:u,triangles:f,quads:b,corners:w,cornerStart:y,nodeCount:i,triangleCount:o,quadCount:c,elementCount:l,group:r.group==null?null:String(r.group),edgeRanges:v.map(x=>({sliceKey:x,first:0,count:l})),layers:d,domain:m,fields:h,markers:(r.markers||[]).map(x=>({kind:String(x.kind??"marker"),id:x.id,x:Number(x.x)||0,y:Number(x.y)||0,radius:Number(x.radius)||0,sliceKeys:(x.slice_keys||[]).map(String),netKey:x.net_key==null?"":String(x.net_key)}))}}function Ir(t,e){let s=Number(t?.count);if(!Number.isInteger(s)||s<0)throw new Error(`${e}: count ${t?.count} is not a whole number`);return s}function hn(t,e,s){for(let r=0;r<t.length;r+=1)if(t[r]>=e)throw new Error(`${s}: index ${t[r]} at ${r} is out of range (${e})`)}async function ih(t){return o1(await i1(t))}function ah(t){let e=1/0,s=-1/0;for(let r=0;r<t.length;r+=1){let a=t[r];a<e&&(e=a),a>s&&(s=a)}return e<=s?[e,s]:null}function oh(t,e){let{header:s}=t;return{key:e,label:s.label??"",run:s.run??null,pass:s.pass??null,kind:s.kind??null,bundleSha256:s.bundle_sha256??null,producer:s.producer??null,nodes:t.nodeCount,elements:t.elementCount,pieceTriangles:t.layers.reduce((r,a)=>r+a.pieceCount,0),layers:t.layers.map(r=>({sliceKey:r.sliceKey,netKey:r.netKey,pieceTriangles:r.pieceCount,fields:(r.fields||[]).map(a=>a.name)})),group:t.group??null,quads:t.quadCount||0,domain:!!t.domain,fields:Rr(t),markers:t.markers.length,summary:s.summary??null}}function Bs(t,e){return t.fields.find(s=>s.name===e)||null}function ch(t,e,{count:s=20,order:r=null}={}){let a=Bs(t,e),n=(r||n1[e]||"descending")==="ascending",i=a?[{values:a.values,base:0,layer:null}]:u1(t,e).map(({layer:c,field:l})=>({values:l.values,base:c.elementBase||0,layer:t.layers.indexOf(c)}));if(!i.length)throw new Error(`the mesh pack has no element field ${e}`);let o=[];for(let c of i)for(let l=0;l<c.values.length;l+=1)Number.isFinite(c.values[l])&&o.push({index:c.base+l,value:c.values[l],...c.layer==null?{}:{layer:c.layer}});return o.sort(n?(c,l)=>c.value-l.value||c.index-l.index:(c,l)=>l.value-c.value||c.index-l.index),o.slice(0,Math.max(0,s))}function lh(t,e){return t?Number.isFinite(e)?t.hide==="above"?e<=t.value:e>=t.value:!1:!0}function dh(t,e){return Array.from(t.corners.subarray(t.cornerStart[e],t.cornerStart[e+1]))}function c1(t,e){return dh(t,e).map(s=>[t.nodes[s*2],t.nodes[s*2+1]])}function Co(t,e){if(!(e>=0&&e<t.elementCount))return null;let s=c1(t,e),r={};for(let l of t.fields){let u=l.values[e];r[l.name]=Number.isFinite(u)?u:null}let a=[];for(let l of t.layers){let u=e-(l.elementBase||0);if(!l.fields?.length||u<0||u>=l.fields[0].values.length)continue;let f=Object.fromEntries(l.fields.map(b=>[b.name,Number.isFinite(b.values[u])?b.values[u]:null]));Object.values(f).some(b=>b!==null)&&a.push({sliceKey:l.sliceKey,netKey:l.netKey,fields:f})}let n=s.map(l=>l[0]),i=s.map(l=>l[1]),o=l=>l.reduce((u,f)=>u+f,0)/l.length/1e6,c=t.sources?.find(l=>e>=l.elementBase&&e<l.elementBase+l.elementCount);return{index:e,...c?{source:c.key,sourceIndex:e-c.elementBase}:{},nodes:dh(t,e),cornersMm:s.map(([l,u])=>[l/1e6,u/1e6]),centroidMm:[o(n),o(i)],boundsMm:[Math.min(...n)/1e6,Math.min(...i)/1e6,Math.max(...n)/1e6,Math.max(...i)/1e6],fields:r,...a.length?{layers:a}:{},units:Object.fromEntries(Rr(t).map(l=>[l.name,l.unit]))}}function Bo(t,e,s,r,a,n){return(s-t)*(n-e)-(r-e)*(a-t)}function uh(t,e,s,r,a,n,i,o){let c=Bo(t,e,s,r,i,o),l=Bo(s,r,a,n,i,o),u=Bo(a,n,t,e,i,o),f=c<0||l<0||u<0,b=c>0||l>0||u>0;return!(f&&b)}function l1(t,e,s,r){let a=1/0,n=1/0,i=-1/0,o=-1/0;for(let x=0;x<t.length;x+=2)t[x]<a&&(a=t[x]),t[x]>i&&(i=t[x]),t[x+1]<n&&(n=t[x+1]),t[x+1]>o&&(o=t[x+1]);if(!(a<=i)||!r)return{x0:0,y0:0,size:1,nx:0,ny:0,start:new Uint32Array(1),cells:new Uint32Array(0)};let c=Math.max(1,i-a),l=Math.max(1,o-n),u=Math.max(1,Math.sqrt(c*l*2/r)),f=Math.min(4096,Math.max(1,Math.ceil(c/u))),b=Math.min(4096,Math.max(1,Math.ceil(l/u))),g=c/f,p=l/b,d=new Int32Array(r*4),m=new Uint32Array(f*b+1),h=(x,S,T,A)=>Math.min(A-1,Math.max(0,Math.floor((x-S)/T)));for(let x=0;x<r;x+=1){let S=1/0,T=1/0,A=-1/0,_=-1/0;for(let O=s[x];O<s[x+1];O+=1){let P=t[e[O]*2],H=t[e[O]*2+1];P<S&&(S=P),P>A&&(A=P),H<T&&(T=H),H>_&&(_=H)}let N=h(S,a,g,f),B=h(A,a,g,f),C=h(T,n,p,b),R=h(_,n,p,b);d.set([N,B,C,R],x*4);for(let O=C;O<=R;O+=1)for(let P=N;P<=B;P+=1)m[O*f+P+1]+=1}for(let x=1;x<m.length;x+=1)m[x]+=m[x-1];let y=m.slice(),w=m.slice(0,f*b),v=new Uint32Array(y[f*b]);for(let x=0;x<r;x+=1){let[S,T,A,_]=d.subarray(x*4,x*4+4);for(let N=A;N<=_;N+=1)for(let B=S;B<=T;B+=1)v[w[N*f+B]++]=x}return{x0:a,y0:n,sx:g,sy:p,nx:f,ny:b,start:y,cells:v}}function fh(t,e,s,r=null){t.grid??=l1(t.nodes,t.corners,t.cornerStart,t.elementCount);let{grid:a,nodes:n,corners:i,cornerStart:o}=t;if(!a.nx)return-1;let c=(e-a.x0)/a.sx,l=(s-a.y0)/a.sy;if(!(c>=0&&l>=0&&c<=a.nx&&l<=a.ny))return-1;let u=Math.min(a.ny-1,Math.floor(l))*a.nx+Math.min(a.nx-1,Math.floor(c));for(let f=a.start[u];f<a.start[u+1];f+=1){let b=a.cells[f],g=o[b],p=i[g]*2;for(let d=g+1;d+1<o[b+1];d+=1){let m=i[d]*2,h=i[d+1]*2;if(uh(n[p],n[p+1],n[m],n[m+1],n[h],n[h+1],e,s)&&(!r||r(b)))return b}}return-1}function d1(t,e){if(t.byElement)return t.byElement;let s=new Uint32Array(e+1);for(let n=0;n<t.pieceCount;n+=1)s[t.element[n]+1]+=1;for(let n=1;n<s.length;n+=1)s[n]+=s[n-1];let r=s.slice(0,e),a=new Uint32Array(t.pieceCount);for(let n=0;n<t.pieceCount;n+=1)a[r[t.element[n]]++]=n;return t.byElement={start:s,items:a},t.byElement}function hh(t,e,s,r,a){let{start:n,items:i}=d1(e,t.elementCount),o=e.vertices;for(let c=n[s];c<n[s+1];c+=1){let l=i[c],u=e.triangles[l*3]*2,f=e.triangles[l*3+1]*2,b=e.triangles[l*3+2]*2;if(uh(o[u],o[u+1],o[f],o[f+1],o[b],o[b+1],r,a))return{triangle:l,piece:e.piece?e.piece[l]:0}}return null}function ph(t){let e=[];for(let s of[...t.layers.map(r=>r.sliceKey),...t.markers.flatMap(r=>r.sliceKeys)])e.includes(s)||e.push(s);return e}function bh(t){return[...new Set(t.layers.map(e=>e.netKey))]}function gh(t){if(t.length===1)return t[0].pack;let e=t.reduce((h,{pack:y})=>h+y.nodeCount,0),s=t.reduce((h,{pack:y})=>h+y.elementCount,0),r=t.reduce((h,{pack:y})=>h+y.corners.length,0),a=new Int32Array(e*2),n=new Uint32Array(r),i=new Uint32Array(s+1),o=[];for(let{pack:h}of t)for(let y of h.fields)o.some(w=>w.name===y.name)||o.push({name:y.name,unit:y.unit});let c=o.map(({name:h,unit:y})=>({name:h,unit:y,values:new Float32Array(s).fill(NaN)})),l=[],u=[],f=[],b=[],g=0,p=0,d=0;for(let{key:h,pack:y}of t){a.set(y.nodes,g*2);for(let w=0;w<y.corners.length;w+=1)n[d+w]=y.corners[w]+g;for(let w=0;w<y.elementCount;w+=1)i[p+w+1]=d+y.cornerStart[w+1];for(let w of y.fields)c.find(v=>v.name===w.name).values.set(w.values,p);for(let w of y.layers){let v=new Uint32Array(w.element.length);for(let x=0;x<v.length;x+=1)v[x]=w.element[x]+p;l.push({...w,element:v,elementBase:p+w.elementBase,byElement:void 0,source:h})}u.push(...y.markers);for(let w of y.edgeRanges)f.push({...w,first:w.first+p});b.push({key:h,elementBase:p,elementCount:y.elementCount}),g+=y.nodeCount,p+=y.elementCount,d+=y.corners.length}let m=t[0].pack;return{header:{...m.header,label:m.header.group?`group ${m.header.group}`:m.header.label},nodes:a,corners:n,cornerStart:i,nodeCount:e,elementCount:s,group:m.group,edgeRanges:f,layers:l,domain:null,fields:c,markers:u,sources:b}}function u1(t,e){return t.layers.map(s=>({layer:s,field:s.fields?.find(r=>r.name===e)||null})).filter(s=>s.field)}function Rr(t){let e=t.fields.map(s=>({name:s.name,unit:s.unit,scope:"element",range:ah(s.values)}));for(let s of t.layers)for(let r of s.fields||[]){let a=e.find(i=>i.name===r.name),n=ah(r.values);a?a.scope==="layer"&&n&&(a.range=a.range?[Math.min(a.range[0],n[0]),Math.max(a.range[1],n[1])]:n):e.push({name:r.name,unit:r.unit,scope:"layer",range:n})}return e}var f1=2e-6,h1=3e-6,mh=3e38,pn=4294967295,yh=192,Fo=Qe,Oo=48,p1=Object.freeze({edges:"copper",pieces:"layers",markers:!0,edgeWidth:1.25,edgeFadePx:3,edgeColor:"#14181d",edgeOpacity:.85,copperEdgeColor:"#7a3e0c",highlight:"#ff3b30",colorBy:null,colormap:ls.fieldColormap,range:null,threshold:null});function Cs(t){let e=String(t).replace(/^#/,"");if(!/^[0-9a-fA-F]{6}$/.test(e))throw new TypeError(`colour ${t} is not #rrggbb`);return[0,2,4].map(s=>Number.parseInt(e.slice(s,s+2),16)/255)}function wh(t={},e=p1,s=null){let r={...e,...t||{}};if(pr(r.colormap),Cs(r.edgeColor),Cs(r.highlight),Cs(r.copperEdgeColor),r.edges===!0&&(r.edges="copper"),r.edges===!1&&(r.edges="off"),!["off","copper","all"].includes(r.edges))throw new TypeError(`edges must be off, copper or all, not ${r.edges}`);if(!["layers","domain","none"].includes(r.pieces))throw new TypeError(`pieces must be layers, domain or none, not ${r.pieces}`);for(let a of["edgeWidth","edgeFadePx"]){if(!(Number(r[a])>=0&&Number(r[a])<=32))throw new RangeError(`${a} must be in [0, 32]`);r[a]=Number(r[a])}if(r.edgeOpacity=Math.min(1,Math.max(0,Number(r.edgeOpacity))),r.range!=null&&!(Array.isArray(r.range)&&r.range.length===2&&r.range.every(Number.isFinite)))throw new TypeError("range is [min, max] or null");if(r.threshold!=null){let{value:a,hide:n="below",field:i=null}=r.threshold;if(!Number.isFinite(Number(a)))throw new TypeError("threshold.value must be a number");if(n!=="below"&&n!=="above")throw new TypeError("threshold.hide is below or above");r.threshold={value:Number(a),hide:n,field:i??null}}if(s){for(let a of[r.colorBy,r.threshold&&(r.threshold.field??r.colorBy)])if(a&&!Rr(s).some(n=>n.name===a))throw new Error(`the mesh pack has no element field ${a}`);if(r.threshold&&!(r.threshold.field??r.colorBy))throw new Error("a threshold needs a field (threshold.field or colorBy)")}return r}function b1(t){let e=xs[t%xs.length],s=[.86,.87,.88];return e.map((r,a)=>r*.3+s[a]*.7)}function g1(t,e){let s=new Map;for(let r of t){let a=(e||[]).filter(u=>u.key===r&&(u.role===void 0||u.role==="copper"));if(!a.length)continue;let n=a[0],i=!!n.bottom,o=i?-1:1,c=i?n.zBottom??Math.min(...a.map(u=>u.z)):n.zTop??Math.max(...a.map(u=>u.z)),l=0;if(n.outer)for(let u of e)(u.role==="mask"||u.role==="paste"||u.role==="silk")&&!!u.faceDown===i&&(l=Math.max(l,o*(u.z-c)));s.set(r,{layerId:Number(n.layerId),face:c,sign:o,coat:l})}return s}var m1=`
struct View {
  matrix: mat4x4f,
  viewport: vec2f,
  edgeWidth: f32,
  fadePx: f32,
  edgeColor: vec4f,
  highlight: vec4f,
  range: vec2f,
  threshold: f32,
  selected: u32,
  colorMode: u32,
  thresholdMode: u32,
  // Where each mesh value list starts in \`values\`: the colour field, the threshold's, the piece vertices'.
  colorBase: u32,
  limitBase: u32,
  vertexBase: u32,
  // 1 when the threshold reads a per-layer field (each place's limitBase), not a mesh one.
  limitLayer: u32,
  // 0 no edges, 1 on copper (drawn in the piece pass, inside the pieces), 2 the whole mesh.
  edgeMode: u32,
  // Where the elements' corners and the nodes start in \`elementData\` (corner rows first).
  cornersBase: u32,
  copperEdge: vec4f,
  nodesBase: u32,
  pad1: u32,
  pad2: u32,
  pad3: u32,
};
// Per slice (edges, markers) and per layer (pieces): heights with the
// stackup offset in, whether it is shown, the pieces' tint, and for a layer
// where its own per-element values start (NONE: none) and the first element
// they index from (a merged group's layer covers its pack's elements only).
struct Place { zPiece: f32, zEdge: f32, shown: f32, tint: vec4f, colorBase: u32, limitBase: u32, elementBase: u32, fill: u32 };

@group(0) @binding(0) var<uniform> view: View;
// The colour ramp (PALETTE entries), then two entries a place.
@group(0) @binding(1) var<storage, read> table: array<vec4f>;
// Value lists end to end (see the bases in View): one float an element for
// colouring and for the threshold, and one a piece vertex (colorMode 2), the
// slot solved fields will fill (spec 11 \xA74, \`layers[].piece_fields\`).
@group(0) @binding(2) var<storage, read> values: array<f32>;
@group(0) @binding(3) var<storage, read> points: array<vec2i>;
@group(0) @binding(4) var<storage, read> corners: array<u32>;
@group(0) @binding(5) var<storage, read> owners: array<u32>;
@group(0) @binding(6) var<storage, read> markers: array<vec4f>;
// Each element's corner rows (E + 1 starts), its corner nodes, then the nodes (x, y as i32 bits).
@group(0) @binding(7) var<storage, read> elementData: array<u32>;

const PALETTE = ${Fo}u;

const NONE = 0xffffffffu;

fn placeAt(index: u32) -> Place {
  let low = table[PALETTE + index * 3u];
  let bases = bitcast<vec4u>(table[PALETTE + index * 3u + 2u]);
  return Place(low.x, low.y, low.z, table[PALETTE + index * 3u + 1u], bases.x, bases.y, bases.z, bases.w);
}

/** A layer's own value for an element (\xA75 \`layers[].element_fields\`), or absent. */
fn layerValue(base: u32, at: Place, element: u32) -> f32 {
  if (base == NONE) { return ABSENT; }
  return values[base + element - at.elementBase];
}

fn colorValue(element: u32) -> f32 { return values[view.colorBase + element]; }
fn limitValue(element: u32) -> f32 { return values[view.limitBase + element]; }
fn vertexValue(vertex: u32) -> f32 { return values[view.vertexBase + vertex]; }

const ABSENT = 3e38;
const OFF = vec4f(2.0, 2.0, 2.0, 1.0);

fn present(value: f32) -> bool { return value < 1e38; }

fn passes(value: f32) -> bool {
  if (!present(value)) { return false; }
  if (view.thresholdMode == 1u) { return value >= view.threshold; }
  return value <= view.threshold;
}

/** Whether an element shows: a threshold on a mesh field hides it everywhere. */
fn kept(element: u32) -> bool {
  if (view.thresholdMode == 0u || view.limitLayer == 1u) { return true; }
  return passes(limitValue(element));
}

/** Whether a piece shows: its element is kept, and a threshold on a per-layer field keeps it on its layer. */
fn keptOn(element: u32, at: Place) -> bool {
  if (view.thresholdMode == 0u) { return true; }
  if (view.limitLayer == 1u) { return passes(layerValue(at.limitBase, at, element)); }
  return kept(element);
}

fn ramp(value: f32) -> vec3f {
  let t = clamp((value - view.range.x) / max(view.range.y - view.range.x, 1e-30), 0.0, 1.0) * ${Qe-1}.0;
  let i = u32(floor(t));
  let j = min(i + 1u, ${Qe-1}u);
  return mix(table[i].rgb, table[j].rgb, t - floor(t));
}

fn place(point: vec2i, z: f32) -> vec4f {
  // Board nanometres (Y down) to world metres (Y up), as the analytic copper.
  return view.matrix * vec4f(f32(point.x) * 1e-9, -f32(point.y) * 1e-9, z, 1.0);
}

struct EdgeOut {
  @builtin(position) position: vec4f,
  @location(0) bary: vec3f,
  @location(1) @interpolate(flat) element: u32,
  @location(2) @interpolate(flat) outline: u32,
};

// Elements are drawn as outline triangles: a triangle as itself, a quad as
// two halves. Each carries its element (low 29 bits) and which of its sides
// are the element's outline (bit k: the side opposite corner k), so a quad's
// diagonal is never drawn.
@vertex fn vs_element(@builtin(vertex_index) vertex: u32, @builtin(instance_index) slot: u32) -> EdgeOut {
  let owner = owners[vertex / 3u];
  let element = owner & 0x1fffffffu;
  let corner = vertex % 3u;
  var out: EdgeOut;
  out.element = element;
  out.outline = owner >> 29u;
  out.bary = vec3f(f32(corner == 0u), f32(corner == 1u), f32(corner == 2u));
  let at = placeAt(slot);
  if (at.shown < 0.5 || !kept(element)) {
    out.position = OFF;
    return out;
  }
  out.position = place(points[corners[vertex]], at.zEdge);
  return out;
}

@fragment fn fs_element(input: EdgeOut) -> @location(0) vec4f {
  let width = fwidth(input.bary);
  let inner = vec3f(f32((input.outline & 1u) == 0u), f32((input.outline & 2u) == 0u), f32((input.outline & 4u) == 0u));
  let distance = input.bary / max(width, vec3f(1e-7)) + inner * 1e9;
  let nearest = min(distance.x, min(distance.y, distance.z));
  // About the element's smallest height, in pixels.
  let across = 1.0 / max(width.x, max(width.y, width.z));
  let selected = input.element == view.selected;
  let half = select(0.5 * view.edgeWidth, 1.25 * view.edgeWidth + 0.75, selected);
  let line = 1.0 - smoothstep(half - 0.5, half + 0.5, nearest);
  let fade = select(smoothstep(view.fadePx, 2.5 * view.fadePx, across), 1.0, selected);
  let edge = select(view.edgeColor, view.highlight, selected);
  let edgeAlpha = line * fade * edge.a;
  var fill = vec4f(0.0);
  if (view.colorMode == 1u) {
    let value = colorValue(input.element);
    if (present(value)) { fill = vec4f(ramp(value), 0.35); }
  }
  if (selected) { fill = vec4f(view.highlight.rgb, max(fill.a, 0.3)); }
  let alpha = edgeAlpha + fill.a * (1.0 - edgeAlpha);
  if (alpha < 0.004) { discard; }
  return vec4f((edge.rgb * edgeAlpha + fill.rgb * fill.a * (1.0 - edgeAlpha)) / alpha, alpha);
}

struct PieceOut {
  @builtin(position) position: vec4f,
  @location(0) @interpolate(flat) element: u32,
  @location(1) @interpolate(flat) layer: u32,
  @location(2) value: f32,
  // The piece triangle's barycentrics, for its copper-boundary sides.
  @location(3) bary: vec3f,
  // Signed distances (nm) to the owning element's sides (a triangle's fourth repeats its first):
  // affine across the piece, so interpolation keeps them exact.
  @location(4) sides: vec4f,
  @location(5) @interpolate(flat) outline: u32,
  @location(6) @interpolate(flat) heightNm: f32,
};

fn nodeAt(node: u32) -> vec2i {
  let at = view.nodesBase + node * 2u;
  return vec2i(bitcast<i32>(elementData[at]), bitcast<i32>(elementData[at + 1u]));
}

// Distance (nm) from p to the line through a and b, from differences, so it
// stays exact to a nanometre for points near the element.
fn sideDistance(p: vec2i, a: vec2i, b: vec2i) -> f32 {
  let d = vec2f(p - a);
  let e = vec2f(b - a);
  return (d.x * e.y - d.y * e.x) / max(length(e), 1.0);
}

@vertex fn vs_piece(@builtin(vertex_index) vertex: u32, @builtin(instance_index) layer: u32) -> PieceOut {
  let owner = owners[vertex / 3u];
  let element = owner & 0x1fffffffu;
  let corner = vertex % 3u;
  var out: PieceOut;
  out.element = element;
  out.layer = layer;
  out.outline = owner >> 29u;
  out.bary = vec3f(f32(corner == 0u), f32(corner == 1u), f32(corner == 2u));
  let at = placeAt(layer);
  if (at.shown < 0.5 || !keptOn(element, at)) {
    out.position = OFF;
    return out;
  }
  let point = corners[vertex];
  let p = points[point];
  out.position = place(p, at.zPiece);
  // Interpolated across the piece triangle: one value an element (the mesh's,
  // or this layer's own), or one a piece vertex.
  var value = colorValue(element);
  if (view.colorMode == 2u) { value = vertexValue(point); }
  if (view.colorMode == 3u) { value = layerValue(at.colorBase, at, element); }
  out.value = value;
  // The element's sides, for its edges drawn on this copper only.
  let first = elementData[element];
  let count = elementData[element + 1u] - first;
  let c0 = nodeAt(elementData[view.cornersBase + first]);
  let c1 = nodeAt(elementData[view.cornersBase + first + 1u]);
  let c2 = nodeAt(elementData[view.cornersBase + first + 2u]);
  var c3 = c0;
  if (count > 3u) { c3 = nodeAt(elementData[view.cornersBase + first + 3u]); }
  let last = select(c2, c3, count > 3u);
  out.sides = vec4f(sideDistance(p, c0, c1), sideDistance(p, c1, c2), sideDistance(p, c2, select(c0, c3, count > 3u)), sideDistance(p, last, c0));
  // About the element's smallest height: twice its area over its longest side.
  let span = max(max(length(vec2f(c1 - c0)), length(vec2f(c2 - c1))), max(length(vec2f(last - c2)), length(vec2f(c0 - last))));
  let area = abs(sideDistance(c2, c0, c1)) * length(vec2f(c1 - c0)) * select(0.5, 1.0, count > 3u);
  out.heightNm = 2.0 * area / max(span, 1.0);
  return out;
}

@fragment fn fs_piece(input: PieceOut) -> @location(0) vec4f {
  // Derivatives first, in uniform control flow.
  let sideWidth = fwidth(input.sides);
  let baryWidth = fwidth(input.bary);
  let at = placeAt(input.layer);
  let selected = input.element == view.selected;
  var color = at.tint.rgb;
  if (view.colorMode != 0u && present(input.value)) { color = ramp(input.value); }
  if (selected) { color = mix(color, view.highlight.rgb, 0.45); }
  var alpha = select(0.0, 1.0, at.fill == 1u);
  if (view.edgeMode != 0u) {
    // The copper's own boundary, where it cuts the element: heavier, in its own tone.
    let open = vec3f(f32((input.outline & 1u) == 0u), f32((input.outline & 2u) == 0u), f32((input.outline & 4u) == 0u));
    let toCopper = min(min(input.bary.x / max(baryWidth.x, 1e-7) + open.x * 1e9, input.bary.y / max(baryWidth.y, 1e-7) + open.y * 1e9), input.bary.z / max(baryWidth.z, 1e-7) + open.z * 1e9);
    let copperLine = (1.0 - smoothstep(0.75 * view.edgeWidth - 0.5, 0.75 * view.edgeWidth + 0.5, toCopper)) * view.copperEdge.a;
    color = mix(color, view.copperEdge.rgb, copperLine);
    alpha = max(alpha, copperLine);
  }
  if (view.edgeMode == 1u) {
    // The element's sides, only where this layer has copper (this fragment is in a piece).
    let px = abs(input.sides) / max(sideWidth, vec4f(1e-6));
    let nearest = min(min(px.x, px.y), min(px.z, px.w));
    let across = input.heightNm / max(max(sideWidth.x, sideWidth.y), 1e-6);
    let half = select(0.5 * view.edgeWidth, 1.25 * view.edgeWidth + 0.75, selected);
    let fade = select(smoothstep(view.fadePx, 2.5 * view.fadePx, across), 1.0, selected);
    let edge = select(view.edgeColor, view.highlight, selected);
    let line = (1.0 - smoothstep(half - 0.5, half + 0.5, nearest)) * fade * edge.a;
    color = mix(color, edge.rgb, line);
    alpha = max(alpha, line);
  }
  if (alpha < 0.004) { discard; }
  return vec4f(color, alpha);
}

struct RingOut {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) @interpolate(flat) radius: f32,
};

// One ring a marker and slice: x, y (world metres), radius (metres), slot.
@vertex fn vs_marker(@builtin(vertex_index) vertex: u32, @builtin(instance_index) index: u32) -> RingOut {
  let marker = markers[index];
  let at = placeAt(u32(marker.w));
  var out: RingOut;
  if (at.shown < 0.5) {
    out.position = OFF;
    return out;
  }
  var quad = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let corner = quad[vertex];
  // Pixels a metre on the board's plane here, so the ring is at least a few
  // pixels across; drawn in the plane, so it meets the copper's depth as it does.
  let centre = view.matrix * vec4f(marker.x, marker.y, at.zEdge, 1.0);
  let side = view.matrix * vec4f(marker.x + 1e-4, marker.y, at.zEdge, 1.0);
  let perMetre = max(length((side.xy / side.w - centre.xy / centre.w) * 0.5 * view.viewport) / 1e-4, 1e-3);
  let radius = max(marker.z * perMetre, 6.0);
  let reach = radius + 2.0;
  out.position = view.matrix * vec4f(marker.x + corner.x * reach / perMetre, marker.y + corner.y * reach / perMetre, at.zEdge, 1.0);
  out.local = corner * reach;
  out.radius = radius;
  return out;
}

@fragment fn fs_marker(input: RingOut) -> @location(0) vec4f {
  let off = abs(length(input.local) - input.radius);
  let alpha = 1.0 - smoothstep(0.75, 1.75, off);
  if (alpha < 0.01) { discard; }
  return vec4f(1.0, 0.55, 0.08, alpha);
}
`,y1={color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}},bn=class{constructor(e){this.renderer=e,this.device=e.device,this.pack=null,this.style=wh(),this.selected=-1,this.viewScratch=new ArrayBuffer(yh),this.view=this.device.createBuffer({label:"mesh-view",size:yh,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.empty=this.storage(new Float32Array([mh,0,0,0]),"mesh-empty"),this.buffers=[],this.values=null,this.paletteData=As(this.style.colormap,Qe)}get shown(){return!!this.pack}storage(e,s){let r=this.device.createBuffer({label:s,size:Math.max(16,Math.ceil(e.byteLength/4)*4),usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});return e.byteLength&&this.device.queue.writeBuffer(r,0,e.buffer,e.byteOffset,e.byteLength),r}pipelines(){if(this.compiled)return this.compiled;let{device:e,renderer:s}=this,r=Array.from({length:8},(o,c)=>({binding:c,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:c===0?"uniform":"read-only-storage"}}));this.layout=e.createBindGroupLayout({label:"mesh",entries:r});let a=e.createPipelineLayout({bindGroupLayouts:[this.layout]}),n=e.createShaderModule({label:"mesh",code:m1}),i=(o,c,l,{blend:u=!1,depthWrite:f=!1}={})=>e.createRenderPipeline({label:`mesh-${o}`,layout:a,vertex:{module:n,entryPoint:c},fragment:{module:n,entryPoint:l,targets:[{format:s.format,...u?{blend:y1}:{}}]},primitive:{topology:"triangle-list",cullMode:"none"},depthStencil:{format:s.depthFormat,depthWriteEnabled:f,depthCompare:"greater-equal"},multisample:{count:s.sampleCount||1}});return this.compiled={pieces:i("pieces","vs_piece","fs_piece",{blend:!0,depthWrite:!0}),elements:i("elements","vs_element","fs_element",{blend:!0}),markers:i("markers","vs_marker","fs_marker",{blend:!0})},this.compiled}setPack(e){if(e===this.pack)return;if(this.release(),this.pack=e||null,this.selected=-1,!e){this.renderer.invalidate?.();return}this.slices=ph(e);let s=bh(e),r=d=>(this.buffers.push(d),d);this.nodes=r(this.storage(e.nodes,"mesh-nodes"));let a=new Uint32Array(e.cornerStart.length+e.corners.length+e.nodes.length);a.set(e.cornerStart,0),a.set(e.corners,e.cornerStart.length),a.set(new Uint32Array(e.nodes.buffer,e.nodes.byteOffset,e.nodes.length),e.cornerStart.length+e.corners.length),this.elementBases={corners:e.cornerStart.length,nodes:e.cornerStart.length+e.corners.length},this.elementData=r(this.storage(a,"mesh-element-data"));let n=w1(e);this.outlineStart=n.start,this.outlineCorners=r(this.storage(n.corners,"mesh-outline-corners")),this.outlineOwners=r(this.storage(n.owners,"mesh-outline-owners")),this.edgeRanges=e.edgeRanges.map(d=>({slot:this.slices.indexOf(d.sliceKey),first:n.start[d.first]*3,count:(n.start[d.first+d.count]-n.start[d.first])*3}));let i=e.layers.map(d=>({...d,tint:b1(s.indexOf(d.netKey))}));if(e.domain)for(let d of this.slices)i.push({...e.domain,sliceKey:d,tint:[.78,.79,.8],domain:!0});let o=i.reduce((d,m)=>d+m.vertices.length,0),c=i.reduce((d,m)=>d+m.triangles.length,0),l=new Int32Array(o),u=new Uint32Array(c),f=new Uint32Array(c/3);this.layers=[];let b=0,g=0;for(let d of i){l.set(d.vertices,b);let m=b/2;for(let y=0;y<d.triangles.length;y+=1)u[g+y]=d.triangles[y]+m;let h=v1(d,e);for(let y=0;y<d.element.length;y+=1)f[g/3+y]=(d.element[y]|h[y]<<29)>>>0;this.layers.push({sliceKey:d.sliceKey,tint:d.tint,domain:!!d.domain,fields:d.domain?[]:d.fields||[],elementBase:d.elementBase||0,first:g,count:d.triangles.length}),b+=d.vertices.length,g+=d.triangles.length}this.pieceVertices=r(this.storage(l,"mesh-piece-vertices")),this.pieceTriangles=r(this.storage(u,"mesh-piece-triangles")),this.pieceOwners=r(this.storage(f,"mesh-piece-owners"));let p=[];for(let d of e.markers)for(let m of d.sliceKeys)p.push(d.x*1e-9,-d.y*1e-9,d.radius*1e-9,this.slices.indexOf(m));this.ringCount=p.length/4,this.rings=r(this.storage(Float32Array.from(p),"mesh-markers")),this.placeCount=this.slices.length+this.layers.length,this.placeData=new Float32Array(this.placeCount*(Oo/4)),this.placeWords=new Uint32Array(this.placeData.buffer),this.table=r(this.device.createBuffer({label:"mesh-table",size:Fo*16+Math.max(Oo,this.placeData.byteLength),usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST})),this.writePalette(),this.placements=null,this.placementsFor=null,this.bindGroups=null,this.applyStyle()}setStyle(e){let s=wh(e,this.style,this.pack),r=s.colormap!==this.style.colormap;return this.style=s,r&&this.writePalette(),this.applyStyle(),this.style}setSelection(e){this.selected=Number.isInteger(e)&&e>=0?e:-1,this.renderer.invalidate?.()}writePalette(){this.paletteData=As(this.style.colormap,Qe),this.table&&this.device.queue.writeBuffer(this.table,0,this.paletteData),this.renderer.invalidate?.()}valuesBuffer(){let{pack:e}=this;if(!this.style.colorBy&&!this.style.threshold)return this.values?.buffer||this.empty;if(this.values)return this.values.buffer;let s=[...e.fields.map(o=>({field:o,layer:null})),...this.layers.flatMap(o=>o.fields.map(c=>({field:c,layer:o})))],r=s.reduce((o,{field:c})=>o+c.values.length,0),a=new Float32Array(r+4).fill(mh),n=new Map,i=0;for(let{field:o,layer:c}of s){for(let l=0;l<o.values.length;l+=1)Number.isFinite(o.values[l])&&(a[i+l]=o.values[l]);n.set(c?`${this.layers.indexOf(c)}:${o.name}`:o.name,i),i+=o.values.length}return this.values={buffer:this.storage(a,"mesh-values"),bases:n,vertexBase:r},this.values.buffer}fieldBase(e){return(e&&this.values?.bases.get(e))??this.values?.vertexBase??0}layerBase(e,s){return(s?this.values?.bases.get(`${e}:${s}`):void 0)??pn}scopeOf(e){return!e||!this.pack?null:Bs(this.pack,e)?"element":"layer"}colorRange(){let{colorBy:e,range:s}=this.style;return!e||!this.pack?[0,1]:s||Rr(this.pack).find(r=>r.name===e)?.range||[0,1]}thresholdField(){let{threshold:e,colorBy:s}=this.style;return e?e.field??s:null}applyStyle(){if(!this.pack)return;this.pipelines();let e=this.valuesBuffer();if(this.bindGroups?.values===e){this.renderer.invalidate?.();return}let s=(r,a,n)=>this.device.createBindGroup({layout:this.layout,entries:[this.view,this.table,e,r,a,n,this.rings,this.elementData].map((i,o)=>({binding:o,resource:{buffer:i}}))});this.bindGroups={elements:s(this.nodes,this.outlineCorners,this.outlineOwners),pieces:s(this.pieceVertices,this.pieceTriangles,this.pieceOwners),values:e},this.renderer.invalidate?.()}slicePlacements(){let e=this.renderer.analytic?.slices||null;return this.placementsFor!==e&&(this.placements=g1(this.slices,e),this.placementsFor=e),this.placements}unmatchedSlices(){if(!this.pack)return[];let e=this.slicePlacements();return this.slices.filter(s=>!e.has(s))}sliceZ(e,s,r=!0){let a=this.slicePlacements().get(e);if(!a)return null;let n=s?.[a.layerId]||0;return a.face+n+a.sign*(a.coat+(r?h1:f1))}sliceShown(e,s){let r=this.slicePlacements().get(e);return!!r&&(!s||s.has(r.layerId))}encode(e,s,r,a){if(!this.pack||!this.bindGroups)return{draws:0,triangles:0};let n=this.pipelines(),{style:i}=this,o=this.placeData,c=this.placeWords,l=Oo/4,u=new Set,f=(S,T,A,_,N,B)=>{let C=S*l;o.set([T??0,A??0,_?1:0,0],C),o.set(N,C+4),c.set(B,C+8)};this.slices.forEach((S,T)=>{let A=this.sliceShown(S,a);f(T,this.sliceZ(S,r,!1),this.sliceZ(S,r,!0),A,[0,0,0,0],[pn,pn,0,0]),A&&u.add(T)});let b=this.scopeOf(i.colorBy)==="layer"?i.colorBy:null,g=this.scopeOf(this.thresholdField())==="layer"?this.thresholdField():null,p=[],d=i.pieces==="none"?"layers":i.pieces,m=i.pieces!=="none",h=m||i.edges!=="off";this.layers.forEach((S,T)=>{let A=this.slices.length+T,_=h&&d===(S.domain?"domain":"layers")&&this.sliceShown(S.sliceKey,a);f(A,this.sliceZ(S.sliceKey,r,!1),0,_,[...S.tint,1],[this.layerBase(T,b),this.layerBase(T,g),S.elementBase,m?1:0]),_&&S.count&&p.push({slot:A,layer:S})}),this.device.queue.writeBuffer(this.table,Fo*16,o),this.writeView(s,{colorLayer:b,limitLayer:g});let y=0,w=0;if(p.length){e.setPipeline(n.pieces),e.setBindGroup(0,this.bindGroups.pieces);for(let{slot:S,layer:T}of p)e.draw(T.count,1,T.first,S),y+=1,w+=T.count/3}let v=i.edges==="all"?this.edgeRanges.filter(S=>u.has(S.slot)&&S.count):[],x=this.selected;if(i.edges!=="all"&&x>=0&&x<this.pack.elementCount){let S=this.outlineStart[x]*3,T=(this.outlineStart[x+1]-this.outlineStart[x])*3;v=this.pack.edgeRanges.filter(_=>x>=_.first&&x<_.first+_.count).map(_=>({slot:this.slices.indexOf(_.sliceKey),first:S,count:T})).filter(_=>u.has(_.slot))}if(v.length){e.setPipeline(n.elements),e.setBindGroup(0,this.bindGroups.elements);for(let S of v)e.draw(S.count,1,S.first,S.slot),y+=1,w+=S.count/3}return i.markers&&this.ringCount&&u.size&&(e.setPipeline(n.markers),e.setBindGroup(0,this.bindGroups.elements),e.draw(6,this.ringCount),y+=1,w+=this.ringCount*2),{draws:y,triangles:w}}writeView(e,{colorLayer:s=null,limitLayer:r=null}={}){let a=new Float32Array(this.viewScratch),n=new Uint32Array(this.viewScratch),{style:i}=this;a.fill(0),a.set(e,0),a.set([this.renderer.canvas?.width||1,this.renderer.canvas?.height||1],16),a[18]=i.edgeWidth,a[19]=i.edgeFadePx,a.set([...Cs(i.edgeColor),i.edgeOpacity],20),a.set([...Cs(i.highlight),1],24),a.set(this.colorRange(),28),a[30]=i.threshold?.value??0,n[31]=this.selected>=0?this.selected:pn,n[32]=i.colorBy?s?3:1:0,n[33]=i.threshold?i.threshold.hide==="above"?2:1:0,n[34]=this.fieldBase(s?null:i.colorBy),n[35]=this.fieldBase(r?null:this.thresholdField()),n[36]=this.values?.vertexBase??0,n[37]=r?1:0,n[38]={off:0,copper:1,all:2}[i.edges],n[39]=this.elementBases?.corners??0,a.set([...Cs(i.copperEdgeColor),.95],40),n[44]=this.elementBases?.nodes??0,this.device.queue.writeBuffer(this.view,0,this.viewScratch)}gpuMemoryBytes(){if(!this.pack)return 0;let e=this.view.size+(this.values?.buffer.size||0);for(let s of this.buffers)e+=s.size;return e}release(){for(let e of this.buffers)e.destroy();this.values?.buffer.destroy(),this.values=null,this.buffers=[],this.table=null,this.bindGroups=null,this.pack=null}destroy(){this.release(),this.view.destroy(),this.empty.destroy()}};function w1(t){let{corners:e,cornerStart:s,elementCount:r}=t,a=new Uint32Array(r+1);for(let c=0;c<r;c+=1)a[c+1]=a[c]+(s[c+1]-s[c]-2);let n=a[r],i=new Uint32Array(n*3),o=new Uint32Array(n);for(let c=0;c<r;c+=1){let l=s[c],u=s[c+1]-l,f=a[c];if(u===3){i.set(e.subarray(l,l+3),f*3),o[f]=(c|7<<29)>>>0;continue}let[b,g,p,d]=e.subarray(l,l+4);i.set([b,g,p],f*3),o[f]=(c|5<<29)>>>0,f+=1,i.set([b,p,d],f*3),o[f]=(c|3<<29)>>>0}return{start:a,corners:i,owners:o}}function v1(t,e){let{vertices:s,triangles:r,element:a}=t,n=r.length/3,i=new Int32Array(s.length/2),o=new Map;for(let b=0;b<i.length;b+=1){let g=`${s[b*2]},${s[b*2+1]}`,p=o.get(g);p===void 0&&o.set(g,p=o.size),i[b]=p}let c=o.size+1,l=(b,g)=>i[b]<i[g]?i[b]*c+i[g]:i[g]*c+i[b],u=new Map;for(let b=0;b<n;b+=1)for(let g=0;g<3;g+=1){let p=l(r[b*3+(g+1)%3],r[b*3+(g+2)%3]);u.set(p,(u.get(p)||0)+1)}let f=new Uint8Array(n);for(let b=0;b<n;b+=1){let g=a[b];for(let p=0;p<3;p+=1){let d=r[b*3+(p+1)%3],m=r[b*3+(p+2)%3];u.get(l(d,m))===1&&(x1(e,g,s[d*2],s[d*2+1],s[m*2],s[m*2+1])||(f[b]|=1<<p))}}return f}function x1(t,e,s,r,a,n){let i=t.cornerStart[e],o=t.cornerStart[e+1]-i;for(let c=0;c<o;c+=1){let l=t.corners[i+c]*2,u=t.corners[i+(c+1)%o]*2,[f,b,g,p]=[t.nodes[l],t.nodes[l+1],t.nodes[u],t.nodes[u+1]],d=Math.hypot(g-f,p-b)||1,m=(h,y)=>Math.abs((g-f)*(y-b)-(p-b)*(h-f))/d;if(m(s,r)<=2&&m(a,n)<=2)return!0}return!1}function vh(t){let e=new Map,s=null,r={},a=-1,n=null,i=d=>{let m=e.get(d);return m?.group?[...e].filter(([,h])=>h.group===m.group).map(([h,y])=>({key:h,pack:y})):[{key:d,pack:m}]},o=()=>{let d=t.renderer();return d?(d.meshOverlay??=new bn(d),d.meshOverlay):null},c=()=>s?n:null,l=d=>{let m=e.get(d);if(!m)return null;let h=oh(m,d),y=o(),w=m.group?i(d).map(S=>S.key):null,v=d===s||!!(s&&w?.includes(s)),x=v&&y?.pack?Object.fromEntries([...y.slicePlacements()].map(([S,T])=>[S,T.layerId])):null;return{...h,groupMembers:w,shown:v,sliceLayers:x,unmatchedSlices:d===s&&y?y.unmatchedSlices():null}},u=()=>{let d=o(),m=c();if(!d||!m)return[];let h=t.visibleLayers();return d.slices.filter(y=>d.sliceShown(y,h))},f=d=>{let m=o(),h=m?.style.threshold,y=m?.thresholdField();if(!h||!y||!Bs(d,y))return null;let w=Bs(d,y).values;return v=>lh(h,w[v])},b=(d,m,h=null)=>{let y=Co(d,m);return y?{pack:s,...y,...h?{sliceKey:h}:{}}:null},g=d=>{a=Number.isInteger(d)?d:-1,o()?.setSelection(a)},p=d=>{let m=o();if(s=d!=null&&e.has(String(d))?String(d):null,a=-1,n=s?gh(i(s)):null,!m)return s?l(s):null;if(m.setPack(c()),s)try{m.setStyle(r)}catch{r={},m.setStyle({colorBy:null,threshold:null,range:null})}return s?l(s):null};return{async loadMeshPack(d,{key:m=null}={}){let h=await ih(d instanceof Uint8Array?d:new Uint8Array(d)),y=String(m??(h.header.label||`mesh ${e.size+1}`));e.set(y,h);let w=s&&h.group&&e.get(s)?.group===h.group;return(y===s||w)&&p(s),l(y)},meshPacks(){return[...e.keys()].map(l)},setMeshPack:p,setMeshStyle(d){r={...r,...d||{}};let m=o();return!m||!c()?{...r}:m.setStyle(d||{})},setMeshSelection:g,meshElement(d){let m=c();return m?b(m,Number(d)):null},meshElementAt(d,m){let h=c(),y=o(),w=h&&y?t.worldRay(d,m):null;if(!w||Math.abs(w.direction[2])<1e-12)return null;let v=t.layerOffsets(),x=u().map(T=>({key:T,t:(y.sliceZ(T,v)-w.origin[2])/w.direction[2]})).filter(T=>T.t>0).sort((T,A)=>T.t-A.t),S=f(h);for(let{key:T,t:A}of x){let _=(w.origin[0]+A*w.direction[0])*1e9,N=-(w.origin[1]+A*w.direction[1])*1e9,B=h.edgeRanges.filter(P=>P.sliceKey===T),R=fh(h,_,N,P=>B.some(H=>P>=H.first&&P<H.first+H.count)&&(!S||S(P)));if(R<0)continue;let O=h.layers.filter(P=>P.sliceKey===T).map(P=>({layer:P,hit:hh(h,P,R,_,N)})).filter(P=>P.hit).map(({layer:P,hit:H})=>({netKey:P.netKey,piece:H.piece,...P.fields?.length?{fields:Object.fromEntries(P.fields.map(Q=>{let pe=Q.values[R-(P.elementBase||0)];return[Q.name,Number.isFinite(pe)?pe:null]}))}:{}}));return{...b(h,R,T),pointMm:[_/1e6,N/1e6],copper:O}}return null},meshWorst({field:d,count:m=20,order:h=null}={}){let y=c();return y?ch(y,d,{count:m,order:h}):[]},frameMeshElement(d,{context:m=8,spanMm:h=null}={}){let y=c(),w=o(),v=y?Co(y,Number(d)):null,x=y?y.edgeRanges.filter(H=>Number(d)>=H.first&&Number(d)<H.first+H.count).map(H=>H.sliceKey):[],S=u(),T=x.find(H=>S.includes(H))||x[0]||S[0],A=T?w.sliceZ(T,t.layerOffsets()):null;if(!v||A==null)return!1;let[_,N,B,C]=v.boundsMm,R=(h??Math.max(B-_,C-N)*m)/2,[O,P]=v.centroidMm;return t.frame([(O-R)/1e3,-(P+R)/1e3,A,(O+R)/1e3,-(P-R)/1e3,A]),g(v.index),!0},meshMarkers(){let d=c(),m=o();if(!d||!m)return[];let h=t.layerOffsets(),y=new Set(u());return d.markers.map(w=>{let v=w.sliceKeys.find(S=>y.has(S)),x=v?m.sliceZ(v,h):null;return{...w,client:x==null?null:t.project([w.x*1e-9,-w.y*1e-9,x])}})},meshStats(){let d=t.renderer()?.meshOverlay;return{packs:e.size,shown:s,selection:a,gpuMemoryBytes:d?.gpuMemoryBytes()||0,unmatchedSlices:d?.unmatchedSlices()||[],style:d?.pack?d.style:{...r}}},unloadMeshPack(d){let m=String(d);e.delete(m),m===s&&p(null)}}}var k1=Object.freeze([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),E1=30,Nr=Object.freeze({restricted:{color:[.55,.57,.6,1],label:"Restricted"},loading:{color:[.7,.76,.82,1],label:"Loading\u2026"},building:{color:[.62,.72,.84,1],label:"Building 3D view\u2026"},missing:{color:[.78,.76,.7,1],label:"No 3D view"},failed:{color:[.86,.6,.56,1],label:"3D view failed"},unknown:{color:[.78,.76,.7,1],label:""}}),xh=Object.freeze([.001,0,0,0,0,.001,0,0,0,0,.001,0,0,0,0,1]);function Os(t,e){let s=new Array(16);for(let r=0;r<4;r+=1)for(let a=0;a<4;a+=1)s[r*4+a]=t[a]*e[r*4]+t[4+a]*e[r*4+1]+t[8+a]*e[r*4+2]+t[12+a]*e[r*4+3];return s}function M1([t,e,s]){return[1,0,0,0,0,1,0,0,0,0,1,0,t,e,s,1]}function S1([t,e,s]){return[t,0,0,0,0,e,0,0,0,0,s,0,0,0,0,1]}function Po(t,e){return Os(xh,Os(t,e))}function kh(t,e){return Os(t,e||k1)}function gn(t,e){let s=e.minMm,r=e.maxMm.map((a,n)=>Math.max(a-s[n],.2));return Os(xh,Os(t,Os(M1(s),S1(r))))}function Eh(t){let e=Number(t?.[2])||0,s=Number(t?.[5])||0;return[1e3,0,0,0,0,1e3,0,0,0,0,1e3,0,0,0,-1e3*(e+s)/2+0,1]}function Mh(t,e,s){return t.restricted?"restricted":!t.assetId||!e?"missing":s==="loaded"?null:s==="failed"?"failed":e.status==="ready"?e.bundleUrl?"loading":"building":Nr[e.status]?e.status:"unknown"}function jo(t){return!!(t&&t.status==="ready"&&t.bundleUrl)}function Sh(t,e){return!t||t.bundleUrl!==e.bundleUrl||t.loadState==="failed"?"create":t.loadState==="waiting"&&jo(e)?"load":"keep"}function Th(t){return(t?.occurrences||[]).filter(e=>e.kind==="board"||e.kind==="entry"||e.restricted||(e.kind==="body"||e.kind==="part")&&e.model!=null)}function T1(t,e){if(!t)return[0,0,0];let s=Number(t.depth)||0,r=t.axis||[0,0,0],a=s*Math.max(0,Math.min(1,Number(e)||0))*E1;return[0,1,2].map(n=>(Number(r[n])||0)*a)}function Ah(t,e,s){let r=T1(e,s);if(!r[0]&&!r[1]&&!r[2])return t;let a=[...t];return a[12]+=r[0],a[13]+=r[1],a[14]+=r[2],a}var Lo=[.96,.62,.04,1],Ih=[.22,.74,.97,1],Rh=.45,A1=new Set(["waypoint","branch-point","auto"]),_1=new Set(["bend","clearance"]),Fs=t=>Array.isArray(t)?t:[],mn=t=>Number.isFinite(t),_h=t=>!!(t&&t.length>=3&&mn(t[0])&&mn(t[1])&&mn(t[2])),I1=t=>Array.isArray(t)&&t.length>=3?[Number(t[0])||0,Number(t[1])||0,Number(t[2])||0,t.length>3?Math.max(0,Math.min(1,Number(t[3]))):1]:[...Lo];function Nh(t){let e=[];for(let s of Fs(t)){let r=s?.harness;if(typeof r=="string")for(let a of Fs(s.segments)){let n=a?.samplesMm;if(!Array.isArray(n)||n.length<6||n.length%3!==0||!n.every(mn))continue;let i=Number(a.radiusMm);i>0&&e.push({harness:r,id:String(a.id??e.length),samplesMm:[...n],radiusMm:i,color:I1(a.color),selected:!!a.selected,preview:!!a.preview})}}return e}function Bh(t){let e=[],s=[];for(let r of Fs(t)){let a=r?.harness;if(typeof a=="string"){for(let n of Fs(r.handles))_h(n?.positionMm)&&e.push({harness:a,id:String(n.id??`${a}:handle:${e.length}`),kind:A1.has(n.kind)?n.kind:"waypoint",positionMm:n.positionMm.slice(0,3).map(Number),selected:!!n.selected});for(let n of Fs(r.flags))!_h(n?.atMm)||!_1.has(n.kind)||s.push({harness:a,id:String(n.id??`${a}:flag:${s.length}`),kind:n.kind,atMm:n.atMm.slice(0,3).map(Number),label:String(n.label??"")})}}return{handles:e,flags:s}}function Ch(t,e){return JSON.stringify([!!t,Fs(e)])}function Oh(t,e,s,r,{right:a,up:n}){if(!(r>0))return[...t];let i=e/r,o=-s/r;return t.map((c,l)=>c+a[l]*i+n[l]*o)}function Fh(t,e,s=3){return Math.hypot(e[0]-t[0],e[1]-t[1])>=s}function Ph({harness:t,target:e,fromMm:s,startPx:r,basis:a,pxPerMm:n}){return{harness:t,target:{kind:e.kind,id:e.id},fromMm:[...s],pointMm:[...s],startPx:[...r],basis:{right:[...a.right],up:[...a.up]},pxPerMm:n,moved:!1}}function jh(t,e,s=3){if(!t||!t.moved&&!Fh(t.startPx,e,s))return null;let r=Oh(t.fromMm,e[0]-t.startPx[0],e[1]-t.startPx[1],t.pxPerMm,t.basis);return{drag:{...t,moved:!0,pointMm:r},phase:t.moved?"move":"start"}}function Lh(t){return{harness:t.harness,target:t.target,fromMm:[...t.fromMm],pointMm:[...t.pointMm]}}function R1(t,e,s){let r=e[0]-t[0],a=e[1]-t[1],n=r*r+a*a,i=n>0?Math.max(0,Math.min(1,((s[0]-t[0])*r+(s[1]-t[1])*a)/n)):0;return{t:i,distance:Math.hypot(t[0]+i*r-s[0],t[1]+i*a-s[1])}}function Dh(t,e,s,r,a=5){let n=null;return t.forEach((i,o)=>{let c=i.samplesMm,l=Math.floor(c.length/3),u=l?s([c[0],c[1],c[2]]):null;for(let f=0;f+1<l;f+=1){let b=[c[f*3+3],c[f*3+4],c[f*3+5]],g=s(b);if(u&&g){let{t:p,distance:d}=R1(u,g,e),m=[0,1,2].map(y=>c[f*3+y]+p*(b[y]-c[f*3+y])),h=a+i.radiusMm*r(m);d<=h&&(!n||d<n.distancePx)&&(n={index:o,sample:f,t:p,pointMm:m,distancePx:d})}u=g}}),n}var L2=512*1024*1024;var rp=230,Xo=document,Et,D,Ge,Mn,Sn,Tn,jn,Ln,bt,wn,Cr,ot,Te,He,N1,An,Or,ze,re,Dn,Un,Ve,Ps,ps,pt,Lr,kt,ee=t=>Xo.querySelector(t),hs=t=>Xo.querySelectorAll(t);function ap(t=document){Xo=t,Et=ee("#app"),D=ee("#viewport"),Ge=ee("#schematic-viewport"),Mn=ee("#schematic-dom-layer"),Sn=ee("#schematic-flow-overlay"),Tn=ee("#bom-view"),jn=ee("#status")||{set textContent(e){}},Ln=ee("#viewer-kind")||{set textContent(e){}},bt=ee("#selection")||{set textContent(e){}},wn=ee("#diagnostics")||{set innerHTML(e){}},Cr=ee("#scene-stats"),ot=ee("#layers"),Te=ee("#search-controls"),He=ee("#view-controls"),Ve=ee("#stackup-workspace-view"),N1=ee("#fallback"),An=ee("#panel-labels"),Or=ee("#schematic-labels"),ze=ee("#axis-gizmo"),re=ee("#selection-card"),Dn=ee("#primary-heading"),Un=ee("#primary-description"),Ps=ee("#mode-switch"),ps=ee("#system-labels"),pt=ee("#move-gizmo"),Lr=ee("#harness-overlay"),kt=ee("#system-help"),Et.classList.add("workspace-pcb")}var B1=Object.freeze([{role:"soldermask",side:"front",name:"F.Mask"},{role:"soldermask",side:"back",name:"B.Mask"},{role:"silkscreen",side:"front",name:"F.SilkS"},{role:"silkscreen",side:"back",name:"B.SilkS"},{role:"paste",side:"front",name:"F.Paste"},{role:"paste",side:"back",name:"B.Paste"}]),C1={soldermask:"#1f6b45",silkscreen:"#f2f2f2",paste:"#a0a3a8"};function np(){return{workspace:"pcb",clickSelect:!0,mode:"3d",activeNetId:0,selectedFeatureId:0,selectedOccurrence:0,selectionAnchor:null,showBoard:!0,showComponents:!0,showPlaceholders:!0,realisticColors:!0,hiddenBoardLayers:[],isolateNet:!1,savedShowBoard:!0,savedShowComponents:!0,preIsolationShowBoard:null,separation:0,dragging:!1,dragMode:"orbit",lastX:0,lastY:0,pointerStartX:0,pointerStartY:0,frameCpuMs:0,frameCpuP95Ms:0,frameIntervalMs:0,frameIntervalP95Ms:0,frameSamples:[],fps:0,frames:0,fpsAt:performance.now(),activeTab:"layers",selectedPageId:"",selectedSchematicFeature:null,schematicDragging:!1,schematicLastX:0,schematicLastY:0,schematicStartX:0,schematicStartY:0}}function Ks(t={}){return{key:t.key??"board",topology:t.topology||window.__TOPOLOGY__||{},semanticGeometry:t.semanticGeometry||window.__SEMANTIC_GEOMETRY__||{},viewerReadiness:t.readiness||{stage:"semantic-ready",progress:100},assetCache:t.assetCache||null,deferComponents:!!t.deferComponents,scene:O1(),renderer:null,compareLayers:new Set,desiredCompareLayers:new Set,visible3dLayers:new Set,preIsolation3dLayers:null,preIsolationCompareLayers:null,highlightedNetIds:new Set,hiddenComponents:new Set,hiddenComponentRequest:null,loadedBytes:0,triangles:0,residentTileBytes:0,residentTileGpuBytes:0,residentTileTriangles:0,tileLoads:0,tileEvictions:0,tileSchedulerMs:0,lastTileScheduleAt:0,visibleTileIds:new Set,gpuBytes:0,analytic:null,analyticSource:null,analyticGeneration:0,asset:null,bundleUrl:"",loadState:"",abort:null}}function O1(){return{manifest:null,manifestUrl:"",layers:[],copperLayers:[],nets:[],features:new Map,tiles:new Map,loaded:new Set,loading:new Map,failed:new Map,residentTiles:new Map,componentFeatures:new Map,componentModelCounts:new Map,componentTier:"idle",componentFailures:0,componentRetryAt:0,componentEntries:[],componentsWantedAt:0,componentEvictions:0,runtimeBounds:null,layerZOffsets:new Float32Array(256),layerZOffsetSignature:""}}function ip(){return{key:"",started:0,from:new Map,current:new Map}}function op(){return{phase:"idle",previous:new Set,target:new Set,previousOffsets:new Map,started:0}}function cp(){return{manifest:null,manifestUrl:"",pages:[],byId:new Map,activeNetUid:"",visiblePages:[],fitted:!1,rendererMode:new URLSearchParams(location.search).get("schematicRenderer")||"svg-dom",domFallbackReason:""}}var E=np(),M=Ks(),k=null,Be=ip(),Z=op(),V=cp(),_n=[],F1=5e3;var F,te,ct,U,fe,rs=new Map,es=performance.now(),Fe=0,vn=0,Dr=null,In=null,Rn=null,Do=!1,Oe=!1,Ko=null,zn=()=>!0,Fr=!0;function lp(t){let e=new Map((t.components||[]).map(r=>[r.uid,r])),s={};for(let r of t.terminals||[]){let a=r.net_uid;if(!a)continue;let n=e.get(r.component_uid)||{},i={designator:r.designator||n.designator||"",pin:r.pin||"",value:n.value||"",pcb_pad_id:r.pcb_pad_id||"",pcb_pad_source_uid:r.pcb_pad_source_uid||""};s[a]||(s[a]={terminals:[]});let o=s[a].terminals;o.some(c=>c.designator===i.designator&&c.pin===i.pin)||o.push(i)}return s}function P1(t,e=M){if(!t||!e.scene?.features)return 0;let s=t.pcb_pad_source_uid||"";if(!s&&t.pcb_pad_id&&(s=(e.topology?.physical_objects||[]).find(a=>a.uid===t.pcb_pad_id)?.source_ids?.[0]||""),!s)return 0;for(let[r,a]of e.scene.features.entries())if(a.sourceUid===s&&a.kind==="pad")return r;return 0}function $o(t,e=M){return!t||!e.topology||!e.topology.components?null:e.topology.components.find(s=>s.designator===t)}function yn(t,e){for(let s of Object.keys(t))delete t[s];Object.assign(t,e)}function dp(){if(vn&&(cancelAnimationFrame(vn),vn=0),window.removeEventListener("keydown",Rb),k){for(let t of k.boards.values())t.abort?.abort(),jr(t);k.scene.dispose(),k=null,M.renderer=null}jr(),M.renderer?.dispose?.(),M.renderer=null,F=null,te?.dispose?.(),te=null,ct=null,Dr=null,zn=()=>!0,Fr=!0}function up(){return Fe+=1,dp(),yn(E,np()),M=Ks(),yn(Be,ip()),yn(Z,op()),yn(V,cp()),_n=[],U=null,fe=null,rs=new Map,es=performance.now(),Fe}function fp(t){t===Fe&&(Fe+=1,dp())}function Pr(t){t===Fe&&(vn=requestAnimationFrame(e=>Jk(e,t)))}function Ee(t){return t===Fe}async function hp(t={}){let e=up(),s={};if(M.topology=t.topology||window.__TOPOLOGY__||{},M.topology&&!M.topology.net_details&&(M.topology.net_details=lp(M.topology)),M.semanticGeometry=t.semanticGeometry||window.__SEMANTIC_GEOMETRY__||{},M.viewerReadiness=t.readiness||M.semanticGeometry.readiness||{stage:"semantic-ready",progress:100},Dr=typeof t.onSelectionChange=="function"?t.onSelectionChange:null,Rn=typeof t.onContextMenu=="function"?t.onContextMenu:null,In=typeof t.onViewStateChange=="function"?t.onViewStateChange:null,zn=typeof t.isActive=="function"?t.isActive:()=>!0,Fr=t.workspaceScope!=="3d",M.assetCache=t.assetCache||null,E.gpuBudgetBytes=Xa,ap(t.root||document),!Et||!D)throw new Error("Semantic viewer shell is missing required DOM nodes");return await Pk(e,s,t.onPerformanceEvent),{performance:s,...Kp(e),cameraState(){return U?{focus:[...U.targetFocus],azimuth:U.targetAzimuth,polar:U.targetPolar,distance:U.targetDistance,orthoScale:U.targetOrthoScale}:null},setCameraState(r){if(!U||!r||!Array.isArray(r.focus)||r.focus.length!==3)return!1;let a=[...r.focus,r.azimuth,r.polar,r.distance,r.orthoScale].map(Number);return a.every(Number.isFinite)?([U.targetFocus,U.targetAzimuth,U.targetPolar,U.targetDistance,U.targetOrthoScale]=[a.slice(0,3),...a.slice(3)],U.snap(),M.renderer?.invalidate?.(),!0):!1},...vh({renderer:()=>Ee(e)?M.renderer:null,visibleLayers:()=>E.mode==="3d"?M.visible3dLayers:null,layerOffsets:()=>Br(),worldRay:zo,frame:r=>U?.frame(r),project:r=>ss(r,Xe)}),selectOccurrence:Fk,setHighlightedNetIds(r){M.highlightedNetIds=r,M.renderer?.setEmphasizedNetIds(r)},resize(){M.renderer?.resize(),F?.resize(),E.workspace==="pcb"&&E.mode==="layer"&&oc()},setWorkspace(r){let a=r==="stackup"?"stackup":"pcb";E.workspace!==a&&Sb(a)},setHiddenComponents:Eb,getComponentReferences(){return[...M.scene.componentFeatures.keys()]},async loadAnalyticPack(r,a={}){if(!M.renderer)return null;let n=performance.now();jr();let i=Math.round(performance.now()-n),o=++M.analyticGeneration,c=await _o({renderer:M.renderer,layers:M.scene.layers,colorFor:u=>{let f=Bn(u,M);return f.length>=4?f.slice(0,4):[...f,1]},bytes:r,wasm:a.wasm,toleranceNm:a.toleranceNm,nets:M.scene.manifest?.nets,features:M.scene.manifest?.objectFeatures,boardZOffsetMm:M.scene.manifest?.boardZOffsetMm});if(o!==M.analyticGeneration||!M.renderer)return c.analytic.destroy(),c.pack.free(),null;let l=performance.now();return M.renderer.setAnalytic(c.analytic),c.timings.attach=Math.round(performance.now()-l),M.analytic=c,M.analytic.timings={release:i,...M.analytic.timings},Uh()},setAnalyticOverlay(r){if(!M.analytic)return null;let a=Yf(M.analytic,r);return M.reliefOptions&&zh(!1),a},setAnalyticRelief(r){return M.reliefOptions=r||null,zh(!0)},setAnalyticVectors(r){return M.analytic?Ro(M.analytic,r):null},setAnalyticStyle(r){return M.analytic?Zf(M.analytic,r):null},analyticColormaps(){return{colormaps:io,defaults:ls}},setClickSelect(r){E.clickSelect=r!==!1},analyticProbe(r,a){if(!M.analytic?.overlay||M.analytic.overlay.kind==="operation_values")return null;let n=zo(r,a);if(!n)return null;let i=E.mode==="3d"?M.visible3dLayers:null,o=dn(M.analytic,n,Br(),null,i,1);if(!o)return null;let{quantity:c,units:l}=M.analytic.overlay;return{value:o.value,quantity:c,units:l,sliceKey:o.sliceKey,boardMm:o.boardMm,world:o.world,marker:Zh(o.world)}},async analyticAt(r,a){if(!M.analytic)return null;let n=await _b(r,a);if(n?.kind!=="analytic")return null;let i=zo(r,a);if(!i||M.analytic.overlay?.kind==="operation_values")return No(M.analytic,n.operationIndex);let o=Br(),c=eh(M.analytic.pack.header,n.operationIndex),l=c&&dn(M.analytic,i,o,c)||dn(M.analytic,i,o),u=await No(M.analytic,n.operationIndex,l);return l?{...u,marker:Zh(l.world)}:u},analyticStats:Uh,unloadAnalyticPack(){M.analyticGeneration+=1,jr()},setLodOverride(r){M.renderer?.setLodOverride(r)},projectComponent(r){return Ib(M,r,a=>ss(a,Xe))},projectPoint(r){return ss(r,Xe)},setViewMode:bb,renderInset:Zk,insetReady:db,releaseInset(r){Cn.release(r)},insetBoard:()=>({scene:M.scene,topology:M.topology}),onSceneChange(r){return On.add(r),()=>On.delete(r)},insetStats(){return{...xn,views:Cn.size,targets:[oe.width,oe.height]}},insetSettings(r){return Object.assign(Jh,r||{}),{...Jh}},gpuIdle(){return M.renderer?.device.queue.onSubmittedWorkDone()??Promise.resolve()},dispose(){Ok(),fp(e)}}}function Uh(){let t=M.analytic;return t?{operations:t.operations,lowerMs:t.lowerMs,timings:t.timings,zOffset:t.zOffset,unmatched:t.unmatched,...t.analytic.stats()}:null}function zh(t){let e=M.renderer;if(!e)return null;let s=M.reliefOptions,r=M.analytic?.overlay;if(!s||!r||r.kind==="operation_values"){let i=e.relief?.ready;return e.relief?.release(),i&&t&&U.frame(as()),e.invalidate?.(),null}let a=Jf(M.analytic).sort((i,o)=>o.cells-i.cells),n=a.find(i=>i.key===s.sliceKey)||a[0];return n?(e.relief??=new fn(M.analytic.analytic),e.relief.build(n.slice,{range:r.range,netId:Qf(M.scene.manifest?.nets,r.net),heightShare:s.heightShare}),t&&U.frame(e.relief.worldBounds()),e.invalidate?.(),{sliceKey:n.key,slices:a.map(i=>({key:i.key,layerId:i.layerId,cells:i.cells}))}):(e.relief?.release(),e.invalidate?.(),{sliceKey:null,slices:[]})}async function j1(t,e=M){return k?.boards.get(e.key)===e?(await L1(t,e)).slice():pp(t,e)}function L1(t,e){let s=k.downloads.get(t);return s||(s=pp(t,e),k.downloads.set(t,s),s.then(()=>k?.downloads.delete(t),()=>k?.downloads.delete(t))),s}async function pp(t,e){let s=ab(e);if(s)return new Uint8Array(await s(t));let r=await fetch(t,{cache:"default"});if(!r.ok)throw new Error(`Failed to load ${t}: ${r.status}`);return new Uint8Array(await r.arrayBuffer())}async function D1(t,e,s){let r=t.semanticGeometry.assets||{};if(!r.analytic_pack)throw new Error("The analytic bundle names no pack");let a=performance.now(),[n,i]=await Promise.all([j1(r.analytic_pack,t),r.stackup?Yp(r.stackup,t).catch(()=>null):null]);if(s.analytic_pack_fetch_ms=performance.now()-a,s.analytic_pack_bytes=n.byteLength,t.loadedBytes+=n.byteLength,!Ee(e))return!1;let o=t.semanticGeometry.cache_key||"",c=t.assetCache&&o?await Sf(t.assetCache,{cacheKey:o,wasmKey:Is(),toleranceNm:ds}):!1;s.analytic_lowering_cached=c;let l=Ar.start(n,Za(),c?1:an(rn));a=performance.now();let u=c?(await Tr(t.assetCache,{cacheKey:o,wasmKey:Is(),toleranceNm:ds},[Sr])).get(Sr):null,f=u&&If(u,l)||l&&await _f(l)||await Mr(n);if(s.analytic_pack_from_cache=!!u,s.analytic_pack_open_ms=performance.now()-a,s.analytic_pack_hosted=!!f.hosted,!Ee(e))return f.free(),l?.close(),!1;let b=f.free.bind(f),g=!1;return f.free=()=>{g||(g=!0,b())},t.analyticSource={bytes:n,pack:f,stackup:i,pool:l,attaching:!1},t.scene.manifest=Ec(f.header,i),!0}async function bp(t,e,s){let r=e.analyticSource,a=++e.analyticGeneration;e.renderer.stackupLooks=Mc(r.stackup);let n=e.semanticGeometry.cache_key||"",i={renderer:e.renderer,layers:e.scene.layers,colorFor:u=>{let f=Bn(u,e);return f.length>=4?f.slice(0,4):[...f,1]},bytes:r.bytes,pack:r.pack,nets:e.scene.nets,cache:e.assetCache&&n?{store:e.assetCache,cacheKey:n}:null,pool:r.pool},o=performance.now(),c;r.attaching=!0;try{c=await _o(i)}catch(u){throw r.attaching=!1,gp(e,r),u}r.attaching=!1;let l=r.pool;if(l&&c.pack.hosted){let u=()=>l.release();c.cacheWrites.then(u,u)}else l?.close();return r.pool=null,e.analyticSource===r&&(e.analyticSource=null),a!==e.analyticGeneration||!Ee(t)||!e.renderer?(c.analytic.destroy(),c.pack.free(),null):(e.renderer.setAnalytic(c.analytic),e.analytic=c,s.analytic_board_ms=performance.now()-o,s.analytic_board=c.timings,$s(e.scene.manifest.bbox))}function gp(t=M,e=t.analyticSource){e&&(t.analyticSource===e&&(t.analyticSource=null),!e.attaching&&(e.pool?.close(),e.pool=null,e.pack?.free()))}function jr(t=M){gp(t),t.renderer?.relief?.destroy(),t.renderer&&(t.renderer.relief=null),t.renderer?.setAnalytic(null),t.analytic?.pack.free(),t.analytic=null}var U1="prism.system_scene.a0",Gh="model-proxy",z1=[.42,.45,.5,1],G1=Object.freeze([1e3,0,0,0,0,0,-1e3,0,0,1e3,0,0,0,0,0,1]);function qe(){return k?[...k.boards.values()].filter(t=>t.renderer&&t.loadState==="loaded"):[]}async function mp(t={}){let e=up();if(Dr=typeof t.onSelectionChange=="function"?t.onSelectionChange:null,Rn=typeof t.onContextMenu=="function"?t.onContextMenu:null,In=typeof t.onViewStateChange=="function"?t.onViewStateChange:null,zn=typeof t.isActive=="function"?t.isActive:()=>!0,Fr=!1,E.gpuBudgetBytes=Xa,ap(t.root||document),!Et||!D)throw new Error("Semantic viewer shell is missing required DOM nodes");if(typeof t.loadBundle!="function")throw new Error("A system scene needs a bundle loader");let s=await Fa.create(D);return Ee(e)?(Zt.prewarm(s.host),k={scene:s,loadBundle:t.loadBundle,onEmphasis:typeof t.onEmphasis=="function"?t.onEmphasis:null,onMove:typeof t.onMove=="function"?t.onMove:null,onHarness:typeof t.onHarness=="function"?t.onHarness:null,baseDescriptor:null,descriptor:null,move:fk(),gizmo:null,routeMode:!1,showHarnesses:!0,harnesses:[],harnessTubes:[],harnessSignature:"",harnessDrag:null,harnessClick:null,harnessOverlay:{signature:"",items:[]},standInKey:null,bodyKey:null,showLabels:!0,explode:0,boards:new Map,models:new Map,downloads:new Map,groups:new Map,placed:[],placements:new Map,hiddenLayers:new Map,separation:new Map,bounds:null,framed:!1,snapped:!1,boardSelected:!1,inputs:new Map,emphasisSets:[],emphasisBounds:new Map,emphasisReport:null},M=Ks({key:""}),U=new Js([-.1,-.1,-.01,.1,.1,.01]),cc(),Mb(),xb(),Bb(),Rk(),jn.textContent="System scene",Pr(e),{...Kp(e),focusPlacement:Y1,selectBoardContext:Vo,setEmphasisSets:nk,setSystemScene:K1,frameNetEmphasis:ik,frameAll:ok,setMoveAllowed:hk,setMoveMode:Nn,setMoveSpace:Bp,setRouteMode:Tk,previewPose:pk,cancelMove:sc,getMoveState:()=>k?Np():null,setAssemblyExplode:sk,setMoveSnap:rk,pickSurfaceAt:_E,setLabelsVisible:Ek,setHelpVisible:Fp,isHelpVisible:()=>!!(kt&&!kt.hidden),frameBoard:ck,frameParts:lk,resize(){k?.scene.resize()},setLodOverride(r){for(let a of qe())a.renderer.setLodOverride(r)},viewAxis(r,a=!1){!k||!["x","y","z"].includes(r)||(U.setAxis(r,!!a),k.bounds&&U.frame(k.bounds))},projectPoint(r,a){return qh(r,a)},projectComponent(r,a){let n=k?.placements.get(String(a));return n?.board?Ib(n.board,r,i=>qh(i,a)):null},dispose(){fp(e)}}):(s.dispose(),null)}function K1(t){if(!k)return;if(t?.schema!==U1)throw new Error(`Unsupported system scene schema: ${t?.schema||"missing"}`);k.baseDescriptor=t,k.harnesses=Array.isArray(t.harnesses)?t.harnesses:[],k.showHarnesses=t.showHarnesses!==!1;let e=k.move.target?(t.occurrences||[]).find(r=>r.path===k.move.target):null;e?!k.move.drag&&Ip(k.move.preview,e.pose)&&(k.move.preview=null):(k.move.drag=null,k.move.preview=null,k.move.target=null),k.descriptor=Rp();let s=new Set;for(let r of t.assets||[]){s.add(r.assetId);let a=k.boards.get(r.assetId),n=Sh(a,r);if(n!=="create"){a.asset=r,n==="load"&&Vh(a,Fe);continue}a&&Kh(r.assetId);let i=Ks({key:r.assetId,topology:{},semanticGeometry:{},deferComponents:!0});Object.assign(i,{asset:r,bundleUrl:r.bundleUrl,loadState:"waiting",abort:null}),k.boards.set(r.assetId,i),jo(r)&&Vh(i,Fe)}for(let r of[...k.boards.keys()])s.has(r)||Kh(r);Ls(),Mk(),k.move.enabled&&(zr({quiet:!0}),gt("sync"))}function Kh(t){let e=k.boards.get(t);e?.abort?.abort(),k.boards.delete(t),k.scene.removeAsset(t),e&&(jr(e),e.renderer=null),M===e&&Yo()}async function Vh(t,e){t.loadState="loading",t.abort=new AbortController;let s=()=>Ee(e)&&k?.boards.get(t.key)===t&&!t.abort.signal.aborted;try{let r=await k.loadBundle(t.bundleUrl,t.abort.signal);if(!s())return;t.topology=r.topology||{},t.topology.net_details||(t.topology.net_details=lp(t.topology)),t.semanticGeometry=r.semanticGeometry||{},t.viewerReadiness=r.readiness||t.semanticGeometry.readiness||{stage:"semantic-ready",progress:100},t.assetCache=r.assetCache||null;let a={};if(!await $p(t,e,a)||!s())return;t.renderer=k.scene.asset(t.key),t.renderer.setBarrels(Bi(t.scene.manifest.barrels,t.scene.manifest.layers)),t.renderer.setHiddenBoardLayers(E.hiddenBoardLayers),t.renderer.setPlaceholdersVisible(E.showPlaceholders),Vr(t);let n=await bp(e,t,a);if(!s())return;t.scene.runtimeBounds=n||$s(t.scene.manifest.bbox),t.renderer.setBoardBounds(t.scene.runtimeBounds),t.bundleToBoard=Eh(t.scene.runtimeBounds),t.loadState="loaded",t.performance=a,Ls(),ic(e,t).catch(i=>console.warn("Failed to load components",i))}catch(r){if(!s())return;console.warn(`[prism-semantic-viewer] system board ${t.key} failed to load`,r),t.loadState="failed",t.error=r?.message||String(r),k.scene.removeAsset(t.key),t.renderer=null,M===t&&Yo(),Ls()}}function Ls({relabel:t=!0}={}){let e=k?.descriptor;if(!e)return;let s=Gn(),r=new Map((e.assets||[]).map(u=>[u.assetId,u])),a=new Map,n=[],i=new Map((e.occurrences||[]).map(u=>[u.path,u])),o=new Map,c=(u,f=new Set)=>{let b=o.get(u.path);if(b)return b;let g,p=u.parent!=null?i.get(u.parent):null;return p&&p!==u&&!f.has(p.path)?g=kh(c(p,new Set(f).add(u.path)),u.localMatrix):g=Ah(u.worldMatrix,u.explode,k.explode),o.set(u.path,g),g};for(let u of Th(e)){let f=c(u);if(u.kind==="entry"&&!u.restricted){if(!u.boundsMm)continue;let x=gn(f,u.boundsMm),S=u.group?null:"loading",T=S?`stand-in:${S}`:null;T&&(k.scene.standIn(T,Nr[S].color),a.has(T)||a.set(T,[]),a.get(T).push({matrix:x,key:u.path,hiddenLayers:[],explode:null})),n.push({occurrence:u,world:f,rendererId:T,board:null,matrix:x,worldBounds:vt(x,[0,0,0,1,1,1]),standIn:S,child:!1,parent:null,group:!!u.group});continue}let b=u.kind!=="board"&&!u.restricted?V1(u,f):null;if(b){a.has(b.rendererId)||a.set(b.rendererId,[]),a.get(b.rendererId).push({matrix:b.matrix,key:u.path,hiddenLayers:[],explode:null}),n.push({occurrence:u,world:f,rendererId:b.rendererId,board:null,matrix:b.matrix,worldBounds:b.worldBounds,standIn:null,model:!0,child:u.parent!=null,parent:u.parent??null,primitives:b.primitives});continue}if(u.kind==="body"||u.kind==="part")continue;let g=u.assetId?r.get(u.assetId):null,p=u.assetId?k.boards.get(u.assetId):null,d=Mh(u,g,p?.loadState),m,h,y,w=g?.bundleToBoard??p?.bundleToBoard;if(!d&&p?.renderer&&w)m=p.key,h=Po(f,w),y=vt(h,p.scene.runtimeBounds);else{if(!u.boundsMm)continue;let x=d||"loading";m=`stand-in:${x}`,k.scene.standIn(m,Nr[x].color),h=gn(f,u.boundsMm),y=vt(h,[0,0,0,1,1,1])}a.has(m)||a.set(m,[]);let v=d?[]:[...k.hiddenLayers.get(u.path)||[]];a.get(m).push({matrix:h,key:u.path,hiddenLayers:v,explode:d?null:Qo(p,k.separation.get(u.path)||0)}),n.push({occurrence:u,world:f,rendererId:m,board:d?null:p,matrix:h,worldBounds:y,standIn:d,child:u.parent!=null,parent:u.parent??null})}for(let u of k.scene.assets.keys())a.has(u)||a.set(u,[]);k.scene.setOccurrences(a),k.groups=a;let l=k.placements;if(k.placed=n,k.placements=new Map(n.map(u=>[u.occurrence.path,u])),k.standInKey&&!k.placements.has(k.standInKey)&&(k.standInKey=null),k.bodyKey&&!k.placements.has(k.bodyKey)&&(k.bodyKey=null),t||!l)Nk();else for(let u of n)u.label=l.get(u.occurrence.path)?.label;k.bounds=vs(n.map(u=>u.worldBounds)),k.bounds&&(U.sceneRadius=At(k.bounds),k.framed||(U.frame(k.bounds),k.snapped||U.snap(),k.snapped=!0,n.some(u=>u.standIn==="loading")||(k.framed=!0)));for(let u of qe())Kn(u);s!=null&&(k.placements.get(s)?.board===M?E.selectedOccurrence=M.renderer.occurrenceKeys.indexOf(s):Yo()),_p(),St()}function V1(t,e){let s=t.model;if(!s?.glbKey)return null;let r=Tt(e,s.matrixMm||Xe),a=k.models.get(s.glbKey);if(a||H1(s.glbKey),a?.state==="ready"){let n=Po(r,G1);return{rendererId:`model:${s.glbKey}`,matrix:n,primitives:a.primitives,worldBounds:vt(n,a.bounds)}}if(s.boundsMm){k.scene.standIn(Gh,z1);let n=gn(r,s.boundsMm);return{rendererId:Gh,matrix:n,primitives:null,worldBounds:vt(n,[0,0,0,1,1,1])}}return null}async function H1(t){k.models.set(t,{state:"loading"});let e=Fe;try{let s=await sd(new URL(`/api/catalog/models/${encodeURIComponent(t)}.glb`,location.href).toString(),{fetchCache:"force-cache"});if(!Ee(e)||!k)return;if(!s.primitives.length)throw new Error("no primitives");let r=k.scene.asset(`model:${t}`);r.model=!0,r.setLodOverride(ka);let a=[1/0,1/0,1/0,-1/0,-1/0,-1/0];for(let n of s.primitives){for(let i=0;i<3;i+=1)a[i]=Math.min(a[i],n.bounds[i]),a[i+3]=Math.max(a[i+3],n.bounds[i+3]);r.addPrimitive(n,{kind:"component",layerId:0,material:n.material,color:n.material.baseColor})}r.setBoardBounds(a),k.models.set(t,{state:"ready",bounds:a,primitives:s.primitives})}catch(s){console.warn("[prism-semantic-viewer] catalog model failed",t,s),k&&k.models.set(t,{state:"failed"})}k?.descriptor&&Ls()}function Gn(){return!k||!M.renderer||!yp()?null:M.renderer.occurrenceKeys[E.selectedOccurrence]??null}function Hh(){return k?k.bodyKey??k.standInKey??Gn():null}function yp(){return!!(E.selectedFeatureId||E.activeNetId||k?.boardSelected)}function wp(t){if(M===t){k.standInKey=null,k.bodyKey=null;return}let e=Oe;Oe=!0;try{Pe()}finally{Oe=e}k.standInKey=null,k.bodyKey=null,M=t,je()}function Yo(){Pe(),M=Ks({key:""}),je()}function q1(t,e){let s=performance.now(),r=Math.max(0,t-es),a=Math.min(.05,(t-es)/1e3);if(es=t,!U)return;U.update(a),k.scene.resize(),fe={layerId:0,viewport:{x:0,y:0,width:D.width,height:D.height},matrix:U.matrix(D.width,D.height,!1),lod:eb(D.height/Math.min(devicePixelRatio||1,2),!1)};let n=Hs(),i=new Map;for(let o of qe()){let c=o.analytic?Ap(o):0,l=o.analytic?Z1(o,c):Tp(o);o.scene.copperRealism!==Us(o)&&Vr(o),o.renderer.setInnerCopperMode(Jp(!E.showBoard||ek(o),Sp(o).size>0)),o.renderer.dimCopper=n;let u=o===M;i.set(o.renderer,{activeNetId:u?E.activeNetId:0,selectedFeatureId:u?E.selectedFeatureId:0,time:t/1e3,layerOffsets:l,visibleLayers:o.visible3dLayers,showBoard:E.showBoard,showComponents:E.showComponents,showPaste:c===0,componentOpacity:de(1-c/.1,0,1),boardOpacity:n?.34:1-c*.72,isolateNet:E.isolateNet,compareMode:!1,compareOffsets:new Map,layerAlphas:null,visibleTileIds:o.visibleTileIds})}k.inputs=i,k.scene.setSelectedOccurrence(M.renderer&&yp()?M.renderer.occurrenceBase+E.selectedOccurrence:-1),Ck(t,i,n)&&(k.scene.render(fe,o=>i.get(o)||xp(o,t)),Nb(),Bk()),Ik(),gk();for(let o of qe())nb(t,o);qo(r,performance.now()-s),Wo(t),Pr(e)}function vp(t){return{activeNetId:0,selectedFeatureId:0,time:t/1e3,visibleLayers:new Set,showBoard:!0,showComponents:!1,componentOpacity:1,boardOpacity:1,isolateNet:!1}}function W1(t){return{...vp(t),showBoard:!1,showComponents:!0}}function xp(t,e){return t.model?W1(e):vp(e)}function X1(t,e){let s=performance.now();return k.scene.pick(fe,t,e,r=>k.inputs.get(r)||xp(r,s))}function $1(t){let e=t.occurrenceKey!=null?k.placements.get(t.occurrenceKey):null;if(!e)return Pe();let s=e.parent!=null?e.occurrence.path:null,r=kp(t.occurrenceKey);if(!r)return Pe();if(r.standIn)return Ep(r);if(!r.board){Mp(r),Vo(s);return}let a=r.board;if(E.isolateNet&&!J1(a,r.occurrence.path,t.featureId))return Pe();wp(a),E.selectedOccurrence=a.renderer.occurrenceKeys.indexOf(r.occurrence.path),t.featureId&&!k.move.enabled?gs(t.featureId,!0):Vo(s)}function kp(t){let e=t!=null?k?.placements.get(String(t))??null:null,s=new Set;for(;e?.parent&&!s.has(e.parent);)s.add(e.parent),e=k.placements.get(e.parent)??null;return e??null}function Y1(t){let e=kp(t);return e?e.standIn?(Ep(e),"stand-in"):e.board?(wp(e.board),E.selectedOccurrence=M.renderer.occurrenceKeys.indexOf(e.occurrence.path),"board"):(Mp(e),"board"):null}function Ep(t){let e=Oe;Oe=!0;try{Pe()}finally{Oe=e}k.standInKey=t.occurrence.path,k.bodyKey=null,k.move.enabled&&zr(),Oe||Dr?.({kind:"board",sourceContext:"3D",occurrence:t.occurrence.path,standIn:t.standIn})}function Mp(t){if(!k)return;let e=Oe;Oe=!0;try{Pe()}finally{Oe=e}M=Ks({key:""}),je(),k.standInKey=null,k.bodyKey=t.occurrence.path,k.move.enabled&&zr()}function Vo(t=null){let e=k?.bodyKey!=null?k.placements.get(k.bodyKey)??null:null,s=E.selectedOccurrence,r=Oe;Oe=!0;try{Pe()}finally{Oe=r}E.selectedOccurrence=s,k&&(k.bodyKey=e&&!e.standIn?e.occurrence.path:null,k.boardSelected=!e),Vn({kind:"board",sourceContext:"3D"},t)}function J1(t,e,s){let r=Number(t.scene.features.get(Number(s))?.netId)||0;if(!r)return!1;let a=t.renderer.occurrenceKeys.indexOf(e);return a<0?!1:t.renderer.occurrenceEmphasis?.[a]?.has(r)?!0:t===M&&a===E.selectedOccurrence&&r===Number(E.activeNetId)}function qh(t,e){let s=k?.placements.get(String(e));return s?ss(t,s.matrix):null}function Sp(t=M){if(!k)return Ds();let e=new Set(t===M?Ds():[]);for(let s of t.renderer?.occurrenceEmphasis||[])if(s)for(let r of s.keys())e.add(Number(r));return e}function Kn(t){let e=k.groups.get(t.key)||[],s=new Set;for(let r of t.scene.copperLayers){let a=Number(r.id);e.some(n=>!k.hiddenLayers.get(n.key)?.has(a))&&s.add(a)}if(E.isolateNet){let r=new Set;for(let a of Sp(t))for(let n of lc(a,t))r.add(n);t.visible3dLayers=r.size?new Set([...s].filter(a=>r.has(a))):s}else t.visible3dLayers=s}function Jo(t,e){let s=t??(k.groups.get(M.key)||[]).map(r=>r.key);for(let r of s){let a=new Set(k.hiddenLayers.get(String(r))||[]);e(a,k.placements.get(String(r))?.board),k.hiddenLayers.set(String(r),a)}for(let r of qe()){let a=k.groups.get(r.key)||[];for(let n of a)n.hiddenLayers=[...k.hiddenLayers.get(n.key)||[]];r.renderer.setOccurrenceHiddenLayers(a.map(n=>n.hiddenLayers)),Kn(r)}je(),St()}function Q1(){let t=Gn();if(t==null||!E.activeNetId)return;let e=lc(E.activeNetId,M);e.size&&Jo([t],s=>{s.clear();for(let r of M.scene.copperLayers)e.has(Number(r.id))||s.add(Number(r.id))})}function Tp(t){if(t.scene.layerSteps)return t.scene.layerSteps;let e=new Float32Array(256),s=(t.scene.copperLayers.length-1)/2;return t.scene.copperLayers.forEach((r,a)=>{e[Number(r.id)]=s-a}),t.scene.layerSteps=e,e}function Ap(t){let e=(k.groups.get(t.key)||[])[0]?.key;return e==null?0:k.separation.get(e)||0}function Z1(t,e){let s=Qo(t,e)[0],r=`${s}:${t.scene.copperLayers.length}`;if(t.scene.analyticOffsets??=new Float32Array(256),t.scene.analyticOffsetSignature===r)return t.scene.analyticOffsets;let a=Tp(t);for(let n=0;n<a.length;n+=1)t.scene.analyticOffsets[n]=a[n]*s;return t.scene.analyticOffsetSignature=r,t.scene.analyticOffsets}function Qo(t,e){let s=t?.scene.runtimeBounds,r=s?Math.hypot((s[3]-s[0])*1e3,(s[4]-s[1])*1e3):0;return[e*e*de(r*.12,8,25)/1e3,e<.0999?1:0,1-e*.72,1]}function ek(t){return(k.groups.get(t.key)||[]).some(e=>(k.separation.get(e.key)||0)>.001)}function tk(t,e){let s=e!=null?[String(e)]:(k.groups.get(M.key)||[]).map(r=>r.key);for(let r of s)k.separation.set(r,t);for(let r of qe()){let a=k.groups.get(r.key)||[];r.renderer.setOccurrenceExplode(a.map(n=>Qo(r,k.separation.get(n.key)||0)))}St()}function sk(t){if(!k)return;let e=de(Number(t)||0,0,1);e!==k.explode&&(k.explode=e,Ls({relabel:!1}))}function rk(t){k&&(k.move.snap=wa(t,k.move.snap))}function ak(){return k.placed.map(t=>{let e=k.hiddenLayers.get(t.occurrence.path)||new Set,s=t.board;return{key:t.occurrence.path,name:t.occurrence.label||t.occurrence.displayPath||t.occurrence.path,standIn:t.standIn||null,separation:k.separation.get(t.occurrence.path)||0,layers:s?s.scene.copperLayers.map(r=>({id:Number(r.id),name:String(r.name),color:qn(Hn(r,s)),visible:!e.has(Number(r.id))})):[]}})}function nk(t){return k?(k.emphasisSets=t,_p()):null}function _p(){if(!k)return[];let t=new Map;for(let[n,i]of k.groups)t.set(n,i.map(()=>null));let e=new Map;for(let n of k.groups.values())n.forEach((i,o)=>e.set(i.key,o));k.emphasisBounds=new Map;let s=k.emphasisSets.map(n=>{let i={key:n.key,color:n.color,lit:0,unresolved:[]},o=[];k.emphasisBounds.set(n.key,o);for(let c of n.members){let l=k.placements.get(c.occurrence),u=l?.board;if(!u){let m=l?l.standIn==="loading"||l.standIn==="building"?"loading":l.standIn==="restricted"?"restricted":"not-drawn":"not-drawn";i.unresolved.push({occurrence:c.occurrence,net:c.net,reason:m});continue}let f=ns(u.scene.nets,c.net),b=Number(f?.id)||0;if(!b){i.unresolved.push({occurrence:c.occurrence,net:c.net,reason:"unknown-net"});continue}let g=t.get(u.key),p=e.get(c.occurrence);if(!g||p==null)continue;g[p]=g[p]||new Map,g[p].has(b)||g[p].set(b,n.mark),i.lit+=1;let d=ws(f.boundsMm);d&&o.push({occurrence:c.occurrence,box:vt(l.matrix,d)})}return i}),r=k.emphasisSets.length>0;for(let n of qe())n.renderer.setOccurrenceEmphasis(r&&t.get(n.key)||null,{dimCopper:r});if(E.isolateNet)for(let n of qe())Kn(n);let a=JSON.stringify(s)!==JSON.stringify(k.emphasisReport);return k.emphasisReport=s,a&&k.onEmphasis?.(s),s}function ik(t=null,e=null){let s=[];for(let[a,n]of k?.emphasisBounds||[])if(!(t!=null&&a!==String(t)))for(let i of n)(e==null||i.occurrence===e)&&s.push(i.box);let r=vs(s);return r?(U.frame(r),!0):!1}function ok(){k?.bounds&&U.frame(k.bounds)}function ck(t){let e=k?.placements.get(String(t));return e&&U.frame(e.worldBounds),!!e}function lk(t){let e=[];for(let r of Array.isArray(t)?t:[]){let a=k?.placements.get(String(r?.occurrence));if(a&&!r?.reference){a.worldBounds&&e.push(a.worldBounds);continue}let n=a?.board?.scene.componentFeatures.get(String(r?.reference)),i=n?a.board.scene.features.get(Number(n.featureId))?.bounds:null;i&&e.push(vt(a.matrix,i))}let s=vs(e);return s?(U.frame(s),!0):!1}var Zo=.001,dk=90,Wh=["#e5484d","#30a46c","#3e63dd"],Uo=["X","Y","Z"],uk="http://www.w3.org/2000/svg";function Ip(t,e){if(!t||!e)return!1;let s=$t(t),r=$t(e),a=[...s.translationMm,...s.rotation],n=[...r.translationMm,...r.rotation];return a.every((i,o)=>Math.abs(i-n[o])<1e-6)}function fk(){return{allowed:!1,enabled:!1,space:"world",target:null,preview:null,drag:null,snap:{...Xt}}}function Rp(){let t=k.baseDescriptor;return!t||!k.move.target||!k.move.preview?t:hd(t,k.move.target,k.move.preview)}function Ur(){k.baseDescriptor&&(k.descriptor=Rp(),Ls({relabel:!1}))}function ec(){let t=k.move.target;return t?k.baseDescriptor?.occurrences.find(e=>e.path===t)??null:null}function Np(){let t=k.move,e=ec();return{allowed:t.allowed,enabled:t.enabled,space:t.space,snap:{...t.snap},dragging:!!t.drag,target:e?{occurrence:e.path,instanceId:e.instanceId,displayPath:e.displayPath,label:e.label,kind:e.kind,restricted:!!e.restricted,pose:$t(t.preview??e.pose),source:t.preview?"manual":e.pose?.source??"default",unsaved:!!t.preview}:null}}function gt(t){k.onMove?.({phase:t,...Np()})}function hk(t){k.move.allowed=!!t,k.move.allowed||Vs(),!k.move.allowed&&k.move.enabled&&Nn(!1)}function Nn(t,{space:e}={}){let s=!!t&&k.move.allowed;s!==k.move.enabled&&(s||Cp(),k.move.enabled=s,e&&(k.move.space=e==="local"?"local":"world"),s&&(k.boardSelected=!0,zr({quiet:!0})),gt("mode"))}function Bp(t){k.move.space=t==="local"?"local":"world",gt("mode")}function tc(){return k.bodyKey??k.standInKey??Gn()}function zr({quiet:t=!1}={}){if(!k)return;let e=tc(),s=k.move.enabled&&e!=null?fd(k.baseDescriptor,e):null,r=s?.movable===!0&&s.parent==null?s.path:null;r!==k.move.target&&(Cp(),k.move.target=r,t||gt("target"))}function Cp(){let t=!!k.move.preview;k.move.drag=null,k.move.preview=null,k.move.target=null,t&&Ur()}function pk(t){k?.move.target&&(k.move.preview=t?$t(t):null,Ur(),gt("preview"))}function sc(){!k||!k.move.preview&&!k.move.drag||(k.move.drag=null,k.move.preview=null,Ur(),gt("cancel"))}function bk(){let t=`${k.move.target}/`,e=vs(k.placed.filter(s=>s.occurrence.path===k.move.target||s.occurrence.path.startsWith(t)).map(s=>s.worldBounds));return e?[0,1,2].map(s=>(e[s]+e[s+3])/2/Zo):null}function ts(t){if(!fe)return null;let e=xa(fe.matrix,Me(t,Zo),fe.viewport);if(!e)return null;let s=D.getBoundingClientRect();return[e.x*s.width/D.width,e.y*s.height/D.height]}function gk(){let t=pt;if(!t)return;let e=k?.move.enabled?ec():null,s=e&&typeof e.move=="object"?e.move:null,r=s?k.move.preview??e.pose:null,a=k?.move.enabled&&e&&fe?s?.pivot==="origin"?[...r.translationMm]:bk():null,n=a?ts(a):null;if(!n){t.toggleAttribute("hidden",!0),k&&(k.gizmo=null);return}t.toggleAttribute("hidden",!1),t.firstChild||mk(t);let{right:i,back:o}=U.basis(),c=ts(Ce(a,i)),l=c?Math.hypot(c[0]-n[0],c[1]-n[1]):0;if(!(l>1e-6)){t.toggleAttribute("hidden",!0);return}let u=dk/l,f=e?k.move.preview??e.pose:null,b=f&&(s||k.move.space==="local")?ld(f):vi,g=[];b.forEach((d,m)=>{let h=ts(Ce(a,Me(d,u))),y=t.querySelector(`[data-part="t${m}"]`),w=h&&Math.hypot(h[0]-n[0],h[1]-n[1])>12&&(!s||(s.translate||[]).includes(m));if(y.style.display=w?"":"none",w){let A=y.querySelector("line");A.setAttribute("x1",n[0]),A.setAttribute("y1",n[1]),A.setAttribute("x2",h[0]),A.setAttribute("y2",h[1]),y.querySelector("circle").setAttribute("cx",h[0]),y.querySelector("circle").setAttribute("cy",h[1]),y.querySelector("text").setAttribute("x",h[0]+9),y.querySelector("text").setAttribute("y",h[1]-7)}let v=pd(d),x=Ye(d,v),S=[];for(let A=0;A<=64;A+=1){let _=A/64*Math.PI*2,N=ts(Ce(a,Me(Ce(Me(v,Math.cos(_)),Me(x,Math.sin(_))),u*.7)));N&&S.push(`${N[0].toFixed(1)},${N[1].toFixed(1)}`)}let T=t.querySelector(`[data-part="r${m}"]`);T.setAttribute("points",S.join(" ")),T.style.display=s&&!(s.rotate||[]).includes(m)?"none":"",g.push({axis:d,pxPerMm:h?[(h[0]-n[0])/u,(h[1]-n[1])/u]:[0,0]})});let p=t.querySelector('[data-part="pivot"]');p.setAttribute("cx",n[0]),p.setAttribute("cy",n[1]),k.gizmo={center:n,pivot:a,handles:g,back:o,limits:s}}function mk(t){let e=(s,r)=>{let a=document.createElementNS(uk,s);for(let[n,i]of Object.entries(r))a.setAttribute(n,i);return a};Wh.forEach((s,r)=>{let a=e("polyline",{"data-part":`r${r}`,class:"ring",stroke:s,fill:"none"}),n=e("title",{});n.textContent=`Rotate about ${Uo[r]}`,a.append(n),t.append(a)}),Wh.forEach((s,r)=>{let a=e("g",{"data-part":`t${r}`,class:"arrow",stroke:s,fill:s}),n=e("title",{});n.textContent=`Move along ${Uo[r]}`;let i=e("text",{stroke:"none"});i.textContent=Uo[r],a.append(n,e("line",{}),e("circle",{r:6}),i),t.append(a)}),t.append(e("circle",{"data-part":"pivot",r:4,class:"pivot"})),t.append(e("text",{"data-part":"readout",class:"readout"})),t.addEventListener("pointerdown",yk),t.addEventListener("pointermove",wk),t.addEventListener("pointerup",xk),t.addEventListener("pointercancel",()=>Op())}function yk(t){let e=t.target.closest?.("[data-part]")?.dataset.part;if(!k||!e||!k.gizmo||!/^[tr][012]$/.test(e))return;let s=ec();if(!s)return;t.preventDefault(),t.stopPropagation();let r=k.gizmo.limits;if(r&&!((e[0]==="t"?r.translate:r.rotate)||[]).includes(Number(e[1])))return;let a=pt.getBoundingClientRect();k.move.drag={kind:e[0]==="t"?"translate":"rotate",snapDeg:r?.rotateSnapDeg??null,handle:k.gizmo.handles[Number(e[1])],start:[t.clientX-a.left,t.clientY-a.top],startPose:$t(k.move.preview??s.pose),hadPreview:!!k.move.preview,center:k.gizmo.center,pivot:k.gizmo.pivot,back:k.gizmo.back,changed:!1};try{pt.setPointerCapture(t.pointerId)}catch{}}function wk(t){let e=k?.move.drag;if(!e)return;let s=pt.getBoundingClientRect(),r=[t.clientX-s.left,t.clientY-s.top],a=t.shiftKey,n=xi(k.move.snap),i,o;if(e.kind==="translate"){let c=a?n.fineMm:n.mm,l=ki(id([r[0]-e.start[0],r[1]-e.start[1]],e.handle.pxPerMm),c);i=dd(e.startPose,e.handle.axis,l),o=`${l>=0?"+":""}${l.toFixed(a||c<1?1:0)} mm`}else{let c=cd(e.handle.axis,e.back,od(e.center,e.start,r))*180/Math.PI,l=e.snapDeg??(a?n.fineDeg:n.deg),u=ki(c,l);i=ud(e.startPose,e.handle.axis,u*Math.PI/180,e.pivot),o=`${u>=0?"+":""}${u.toFixed(0)}\xB0`}e.changed=e.changed||!Ip(i,e.startPose),k.move.preview=$t(i),vk(o,r),Ur(),gt("preview")}function vk(t,e){let s=pt.querySelector('[data-part="readout"]');s.textContent=t,s.setAttribute("x",e[0]+14),s.setAttribute("y",e[1]-10)}function xk(t){let e=k?.move.drag;e&&(pt.hasPointerCapture?.(t.pointerId)&&pt.releasePointerCapture(t.pointerId),k.move.drag=null,pt.querySelector('[data-part="readout"]').textContent="",e.changed?gt("commit"):e.hadPreview||sc())}function Op(){let t=k?.move.drag;return t?(k.move.drag=null,k.move.preview=t.hadPreview?t.startPose:null,pt.querySelector('[data-part="readout"]').textContent="",Ur(),gt("cancel"),!0):!1}function kk(t,e){let s=k.move;if(e==="escape"){if(kt&&!kt.hidden)kt.hidden=!0;else if(!Vs()){if(!Op())if(s.preview)sc();else if(s.enabled)Nn(!1);else return!1}return!0}if(e==="m"&&s.allowed)Nn(!s.enabled);else if(e==="l"&&s.enabled)Bp(s.space==="world"?"local":"world");else if(e==="enter"&&s.preview&&!s.drag)gt("commit");else if(t.key==="?")Fp(!!kt?.hidden);else if(e==="a")U.frame(k.bounds||as());else return!1;return!0}function Fp(t){kt&&(kt.hidden=!t)}function Ek(t){k&&(k.showLabels=!!t,ps&&(ps.hidden=!k.showLabels))}function Mk(){if(!k)return;let t=Ch(k.showHarnesses,k.harnesses);t!==k.harnessSignature&&(k.harnessSignature=t,k.showHarnesses||Vs(),k.harnessTubes=Nh(k.showHarnesses?k.harnesses:[]),k.scene.setTubes(k.harnessTubes,Sk),k.harnessOverlay.signature="",Gp(),Ze.key="")}function Sk(t){let e=t.selected?Ih:t.color||Lo,s=t.preview?Rh:Number.isFinite(e[3])?e[3]:1;return[e[0],e[1],e[2],s]}function Tk(t){k&&(k.routeMode=!!t,k.routeMode||(Vs(),D?.style.cursor==="grab"&&(D.style.cursor="")))}function Pp(t){let{right:e}=U.basis(),s=ts(t),r=ts(Ce(t,e));return s&&r?Math.hypot(r[0]-s[0],r[1]-s[1]):0}function Ho(t){if(!k?.harnessTubes.length||!fe)return null;let e=D.getBoundingClientRect(),s=k.routeMode?10:5,r=Dh(k.harnessTubes,[t.clientX-e.left,t.clientY-e.top],ts,Pp,s);return r?{tube:k.harnessTubes[r.index],pointMm:r.pointMm}:null}function jp(t,e=!1){k&&(Pe(),k.onHarness?.({type:"select",harness:t.harness,kind:t.kind,id:String(t.id),...t.pointMm?{pointMm:[...t.pointMm]}:{},shiftKey:!!e}))}function rc(t,e){k?.onHarness?.({type:"drag",phase:t,...Lh(e)})}function Lp(t,e){let s=Ph({harness:e.harness,target:e,fromMm:e.fromMm,startPx:[t.clientX,t.clientY],basis:U.basis(),pxPerMm:Pp(e.fromMm)});return s.pointerId=t.pointerId,s.capture=e.capture||"canvas",k.harnessDrag=s,s}function Dp(t){let e=k?.harnessDrag;if(!e)return!1;let s=jh(e,[t.clientX,t.clientY]);return s&&(k.harnessDrag={...s.drag,pointerId:e.pointerId,capture:e.capture}),s&&k.routeMode&&k.move.allowed&&rc(s.phase,k.harnessDrag),!0}function Up(t){let e=t?.capture==="overlay"?Lr:D;try{t?.pointerId!=null&&e?.hasPointerCapture?.(t.pointerId)&&e.releasePointerCapture(t.pointerId)}catch{}}function zp(t){let e=k?.harnessDrag;if(!e)return!1;if(Up(e),k.harnessDrag=null,k.routeMode&&k.move.allowed&&e.moved)return rc("end",e),!0;let s=e.target.kind==="segment"?{...e.target,harness:e.harness,pointMm:e.fromMm}:{...e.target,harness:e.harness};return jp(s,t.shiftKey),!0}function Vs(){let t=k?.harnessDrag;return t?(Up(t),k.harnessDrag=null,t.moved&&k.routeMode&&k.move.allowed&&rc("cancel",t),!0):!1}function Ak(t){!k?.routeMode||!D||(D.style.cursor=Ho(t)?"grab":"")}var _k="http://www.w3.org/2000/svg";function nt(t,e={}){let s=document.createElementNS(_k,t);for(let[r,a]of Object.entries(e))s.setAttribute(r,a);return s}function Gp(){let t=Lr;if(!k||!t)return;if(!k.showHarnesses){t.replaceChildren(),t.toggleAttribute("hidden",!0),k.harnessOverlay={signature:"",items:[]};return}let e=JSON.stringify(k.harnesses.map(i=>[i.harness,i.handles??null,i.flags??null]));if(e===k.harnessOverlay.signature)return;let{handles:s,flags:r}=Bh(k.harnesses),a=[],n=[];for(let i of r){let o=nt("g",{class:`harness-flag ${i.kind}`});o.append(nt("circle",{r:15,class:"flag-ring"}));let c=Math.max(26,i.label.length*5.6+10);o.append(nt("rect",{x:20,y:-9,width:c.toFixed(1),height:18,rx:9,class:"flag-pill"}));let l=nt("text",{x:25,y:4,class:"flag-label"});l.textContent=i.label,o.append(l),a.push(o),n.push({key:`flag:${i.harness}:${i.kind}:${i.id}`,atMm:i.atMm,node:o})}for(let i of s){let o=`handle:${i.harness}:${i.kind}:${i.id}`,c=nt("g",{class:`harness-handle ${i.kind}${i.selected?" selected":""}`,"data-harness-handle":o,role:"button"});i.selected&&c.append(nt("circle",{r:11,class:"handle-halo"})),i.kind==="branch-point"?c.append(nt("polygon",{points:"0,-6.5 6.5,0 0,6.5 -6.5,0",class:"handle-body"})):i.kind==="auto"?c.append(nt("circle",{r:6,class:"handle-body auto"})):c.append(nt("circle",{r:6,class:"handle-body"}),nt("circle",{r:2,class:"handle-dot"}));let l=nt("title");l.textContent=i.kind==="waypoint"?"Waypoint":i.kind==="branch-point"?"Branch point":"Automatic breakout",c.append(l),a.push(c),n.push({key:o,harness:i.harness,kind:i.kind,id:i.id,positionMm:i.positionMm,atMm:i.positionMm,node:c})}t.replaceChildren(...a),t.toggleAttribute("hidden",!n.length),k.harnessOverlay={signature:e,items:n}}function Ik(){let t=Lr;if(!t||!k)return;if(!k.showHarnesses){t.toggleAttribute("hidden",!0);return}Gp();let e=k.harnessOverlay.items;if(t.toggleAttribute("hidden",!e.length),!(!e.length||!fe))for(let s of e){let r=ts(s.atMm);s.node.style.display=r?"":"none",r&&s.node.setAttribute("transform",`translate(${r[0].toFixed(1)} ${r[1].toFixed(1)})`)}}function Rk(){let t=Lr;t&&(t.addEventListener("pointerdown",e=>{let s=e.target.closest?.("[data-harness-handle]");if(!k||!s)return;let r=k.harnessOverlay.items.find(a=>a.key===s.dataset.harnessHandle);if(!(!r||r.positionMm==null)){e.preventDefault(),e.stopPropagation(),Lp(e,{harness:r.harness,kind:r.kind,id:r.id,fromMm:r.positionMm,capture:"overlay"});try{t.setPointerCapture(e.pointerId)}catch{}}}),t.addEventListener("pointermove",e=>{Dp(e)&&e.preventDefault()}),t.addEventListener("pointerup",e=>{zp(e)&&e.preventDefault()}),t.addEventListener("pointercancel",()=>Vs()))}function Nk(){ps&&(k.labelsDrawn=null,ps.replaceChildren(...k.placed.filter(t=>!t.child).map(t=>{let e=document.createElement("div");e.className=`scene-label${t.standIn?` stand-in ${t.standIn}`:""}`;let s=document.createElement("strong");s.textContent=t.occurrence.label||t.occurrence.displayPath||t.occurrence.path,e.append(s);let r=t.standIn?Nr[t.standIn]?.label:"";if(r){let a=document.createElement("span");a.textContent=r,e.append(a)}return t.label=e,e})))}function Bk(){if(!ps||!fe)return;if(ps.hidden=!k.showLabels,!k.showLabels){k.labelsDrawn=null;return}let t=D.getBoundingClientRect(),e=tc(),s=`${e}|${t.width}x${t.height}|${Array.prototype.join.call(fe.matrix,",")}`;if(k.labelsDrawn?.placed===k.placed&&k.labelsDrawn.key===s)return;k.labelsDrawn={placed:k.placed,key:s};let r=t.width/Math.max(1,D.width),a=t.height/Math.max(1,D.height);for(let n of k.placed){if(!n.label)continue;let[i,o,,c,l,u]=n.worldBounds,f=xa(fe.matrix,[(i+c)/2,(o+l)/2,u],fe.viewport),b=f&&f.x>=0&&f.y>=0&&f.x<=D.width&&f.y<=D.height;n.label.hidden=!b,b&&(n.label.style.transform=`translate(${(f.x*r).toFixed(1)}px, ${(f.y*a).toFixed(1)}px) translate(-50%, -100%)`),n.label.classList.toggle("selected",e===n.occurrence.path)}}var Ze={scene:null,key:"",matrix:new Float32Array(16),at:0};function Ck(t,e,s){let r=fe.matrix,a=!1;for(let f=0;f<16;f+=1)if(r[f]!==Ze.matrix[f]){a=!0;break}if(Ze.scene!==k.scene&&(Ze.scene=k.scene,a=!0),a)return Ze.matrix.set(r),Ze.key="",Ze.at=t,!0;let n=[D.width,D.height,E.showBoard,E.showComponents,E.isolateNet,E.activeNetId,E.selectedFeatureId,E.selectedOccurrence,k.showLabels,k.explode,s,Us(),tc(),k.scene.tubeVersion];for(let f of k.scene.renderers){let b=e.get(f);n.push(f.version,f.occurrenceCount,f.selectedOccurrence,f.dimCopper,f.standIn?f.boxColor.join(","):"",b?[...b.visibleLayers].join(","):"",b?.layerOffsets?Array.prototype.join.call(b.layerOffsets,","):"")}let i=n.join("|"),o=!!(s||E.activeNetId||E.selectedFeatureId),c=i!==Ze.key,l=o&&t-Ze.at>=lb;return c||l||t-Ze.at>cb?(Ze.key=i,Ze.at=t,!0):!1}function Kp(t){return{isCurrent(){return Ee(t)},nets:()=>M.scene.nets,quietly(e){Oe=!0;try{e()}finally{Oe=!1}},takeEcho(e){let s=Zu(e,Ko);return Ko=null,s},selectNet:uc,selectFeature:gs,selectComponent:fc,clearSelection:Pe,anyEmphasis:Hs,showNetProbe:nc,restoreVisibility:Xp,isolating:()=>E.isolateNet,isolateLitNets:zs,setNetIsolation:qs,setGpuBudget(e){E.gpuBudgetBytes=e;for(let s of k?k.boards.values():[M])s.tiersCheckedAt=0},setStatsOverlay:sb,stats:tb,pickAt(e,s){return _b(e,s)},getViewState:Vp,setLayerVisible:gb,applyLayerPreset:mb,setShowBoard:yb,setShowComponents:wb,setShowPlaceholders:hE,setRealisticColors:gE,setBoardLayerVisible:bE,setSeparation:vb,showNetLayers:dc}}function Ok(){oe.depth?.destroy(),Object.assign(oe,{canvas:null,context:null,depth:null,depthView:null,width:0,height:0}),Cn.clear(),On.clear(),js=null}function St(){!In||Do||(Do=!0,queueMicrotask(()=>{Do=!1,In?.(Vp())}))}function Vp(){let t=E.mode==="3d"?M.visible3dLayers:M.desiredCompareLayers;return{mode:E.mode,layers:M.scene.copperLayers.map(e=>({id:Number(e.id),name:String(e.name),color:qn(Hn(e)),visible:t.has(Number(e.id))})),boardLayers:pE(),showBoard:E.showBoard,showComponents:E.showComponents,showPlaceholders:E.showPlaceholders,realisticColors:E.realisticColors,separation:k?k.separation.get(Hh())||0:E.separation,isolateNet:E.isolateNet,hasNet:!!E.activeNetId||Hs(),...k?{boards:ak(),selectedBoard:Hh()}:{}}}function Vn(t,e=null){if(k?.move.enabled&&zr(),Oe)return;Ko=t;let s=k?.bodyKey??(M.renderer&&!M.renderer.identityOnly?M.renderer.occurrenceKeys[E.selectedOccurrence]:null),r=t&&s!=null?{...t,occurrence:s}:t;Dr?.(r&&e?{...r,part:e}:r)}function Fk(t){let e=M.renderer?.occurrenceKeys.indexOf(String(t))??-1;e>=0&&(E.selectedOccurrence=e)}function ac(t){if(!t||!M.renderer||M.renderer.identityOnly)return t;let e=M.renderer.occurrenceMatrices[E.selectedOccurrence];return e?vt(e,t):t}function Hp(t,e=null){return t?{kind:"net",sourceContext:"3D",netName:String(t.name||""),netUid:String(t.uid||"")||void 0,netCode:Number(t.id||0)||void 0,featureId:Number(e?.id||0)||void 0,uuid:String(e?.sourceUid||"")||void 0}:null}function qp(t,e=M){if(!t)return null;let s=Gs(t),r=String(t.padNumber||t.pin||t.pinNumber||""),a=e.scene.nets.find(n=>Number(n.id)===Number(t.netId||0));if(s&&r)return{kind:"terminal",sourceContext:"3D",reference:s,pin:r,netUid:a?.uid,netName:a?.name,netCode:a?Number(a.id):void 0,uuid:String(t.sourceUid||"")||void 0,featureId:Number(t.id||0)||void 0};if(s){let n=$o(s,e);return{kind:"component",sourceContext:"3D",reference:s,componentUid:n?.uid,uuid:String(t.sourceUid||"")||void 0,featureId:Number(t.id||0)||void 0}}return Hp(a,t)}function Wp(){E.showBoard=!0,E.showComponents=!0,bs(),typeof je=="function"&&je()}function Hs(){return Ds().size>0||!!k?.emphasisSets.length}function Ds(){let t=new Set(M.highlightedNetIds);return E.activeNetId&&t.add(Number(E.activeNetId)),t}function nc(){Uc(E),bs(),typeof je=="function"&&je()}function Xp(){zc(E),bs(),typeof je=="function"&&je()}async function $p(t,e,s={}){let r=t.semanticGeometry.assets?.scene_manifest||t.semanticGeometry.semantic_gltf?.path,a=performance.now();if(t.semanticGeometry.analytic){if(!await D1(t,e,s))return!1}else if(r){if(t.scene.manifestUrl=new URL(r,location.href).toString(),t.scene.manifest=await Yp(t.scene.manifestUrl,t),s.scene_manifest_fetch_parse_ms=performance.now()-a,!Ee(e))return!1;if(t.scene.manifest.schema!=="prism.semantic_gltf_a0")throw new Error(`Unsupported scene schema: ${t.scene.manifest.schema}`)}else t.scene.manifest={schema:"prism.semantic_gltf_partial.a0",bbox:null,layers:[],nets:[],objectFeatures:[],components:[],tiles:[],barrels:[]},s.scene_manifest_fetch_parse_ms=0;a=performance.now(),t.scene.layers=t.scene.manifest.layers||[],t.scene.copperLayers=t.scene.layers.filter(i=>i.role==="copper"||String(i.name).endsWith(".Cu")),t.scene.nets=t.scene.manifest.nets||[];for(let i of t.scene.manifest.objectFeatures||[])t.scene.features.set(Number(i.id),{...i,bounds:ws(i.boundsMm)});for(let i of t.scene.manifest.components||[])t.scene.componentFeatures.set(i.designator,i),t.scene.features.set(Number(i.featureId),{...i,kind:"component",sourceUid:i.uid,netId:0,bounds:ws(i.boundsMm)});for(let i of t.scene.manifest.tiles||[])t.scene.tiles.set(i.id,i);s.scene_manifest_index_ms=performance.now()-a;let n=Zp(t);for(let i of n)t.compareLayers.add(i),t.desiredCompareLayers.add(i);for(let i of t.scene.copperLayers)t.visible3dLayers.add(Number(i.id));return!0}async function Pk(t,e={},s=null){let r=performance.now(),a=M.semanticGeometry.analytic?Qt.create(D).then(c=>(Zt.prewarm(c),c)):null;if(!await $p(M,t,e)){a&&a.then(c=>c?.dispose?.()).catch(()=>{});return}let n=performance.now();if(M.renderer=a?await a:await Qt.create(D),e.webgpu_renderer_create_ms=performance.now()-n,!Ee(t)){M.renderer?.dispose?.(),M.renderer=null;return}M.renderer.setBarrels(Bi(M.scene.manifest.barrels,M.scene.manifest.layers)),Vr(),n=performance.now();let i=await bp(t,M,e);if(e.board_fetch_parse_upload_ms=performance.now()-n,!Ee(t)||(M.scene.runtimeBounds=i||$s(M.scene.manifest.bbox),U=new Js(M.scene.runtimeBounds),Fr&&(await jk(t),!Ee(t)||(await Lk(t),!Ee(t)))))return;n=performance.now(),cc(),Mb(),Fr&&(SE(),ME()),xb(),Bb(),e.controls_and_bindings_ms=performance.now()-n;let o={"board-ready":"Board ready \xB7 components and semantic layers are still generating","components-ready":"Board and components ready \xB7 semantic layers are still generating","semantic-ready":"WebGPU semantic glTF active"};if(jn.textContent=o[M.viewerReadiness.stage]||"Loading 3D assets",M.semanticGeometry.assets?.components_glb&&!M.deferComponents){let c=performance.now(),l=ic(t);M.analytic&&await l.catch(()=>{}),l.then(()=>{Ee(t)&&(Yh(i),s?.({schema:"prism.semantic_viewer_performance.a0",milestone:"components-loaded",readiness_stage:M.viewerReadiness.stage,elapsed_ms:performance.now()-c,bytes_loaded:M.loadedBytes}))})}else Yh(i);Pr(t),n=performance.now(),await new Promise(c=>requestAnimationFrame(c)),e.first_frame_wait_ms=performance.now()-n,e.boot_total_ms=performance.now()-r}async function jk(t=Fe){let e=M.semanticGeometry.assets?.schematic_native_manifest||M.semanticGeometry.schematic_vector?.path||M.semanticGeometry.schematic_scene?.path,s=M.semanticGeometry.assets?.schematic_manifest||M.semanticGeometry.schematic_world?.path,r=ee("[data-workspace=schematic]");if(!e&&!s){r.disabled=!0,r.title="No schematic world assets are available";return}let a=[e,s].filter(Boolean),n=null;for(let o of a)try{V.manifestUrl=new URL(o,location.href).toString();let c=await Ua.create(Ge,V.manifestUrl);if(!Ee(t))return;F=c,F.setFlowOverlayCanvas(Sn);break}catch(c){if(n=c,F=null,o===s)throw c}if(!F)throw n||new Error("Failed to load schematic viewer assets");V.manifest=F.manifest,V.pages=F.pages,V.byId=new Map(V.pages.map(o=>[o.id,o])),E.selectedPageId=V.pages[0]?.id||"",F.selectedPageId=E.selectedPageId,!["native","legacy","webgpu"].includes(String(V.rendererMode).toLowerCase())&&(te=Ka.create(Mn,V.manifestUrl,V.manifest,F.featuresByPage,{onSelect:dE,onBlank:Kr,onHighlightNet:hb,onOpenPage:cE,onFallback:o=>{V.domFallbackReason=o,console.warn(o)}}),te.preloadPages(V.pages)),F.preloadOverview()}async function Lk(t=Fe){let e=M.semanticGeometry.assets?.bom||M.semanticGeometry.bom?.path,s=ee("[data-workspace=bom]");if(!e){s&&(s.disabled=!0,s.title="No BoM artifact is available");return}try{let r=await Zr.create(Tn,new URL(e,location.href).toString(),{onSelectReference:a=>fc(a,!0)});if(!Ee(t))return;ct=r}catch(r){if(!Ee(t))return;console.warn(r),s&&(s.disabled=!0,s.title=r?.message||"BoM artifact could not be loaded")}}async function Yp(t,e=M){if(e.assetCache)return e.assetCache.fetchJson(String(t));let s=await fetch(t,{cache:"default"});if(!s.ok)throw new Error(`Failed to load ${t}: ${s.status}`);return s.json()}var Dk=24*1024*1024,fs={bytes:0,waiting:null};async function Uk(t){for(;;){if(fs.bytes===0||fs.bytes+t<=Dk){fs.bytes+=t,fs.waiting??=new Promise(e=>requestAnimationFrame(()=>{fs.bytes=0,fs.waiting=null,e()}));return}await fs.waiting}}function zk(t){return pu(t.position.length/3,t.indices.length)}function Jp(t,e){return t?"all":e?"lit":"none"}function Qp(){return E.mode!=="layer"?M.visible3dLayers:Z.phase==="reveal"?Kk(Z.previous,Z.target):M.compareLayers}function Zp(t=M){let e=t.scene.copperLayers.map(s=>Number(s.id)).filter(Number.isFinite);return e.length?e.length===1?new Set([e[0]]):new Set([e[0],e[e.length-1]]):new Set}function Gk(){let t=M.desiredCompareLayers.size?M.desiredCompareLayers:M.compareLayers;return t.size?new Set([...t].map(Number)):Zp()}function Kk(...t){let e=new Set;for(let s of t)for(let r of s||[])e.add(Number(r));return e}function as(t=M){return t.scene.runtimeBounds||$s(t.scene.manifest?.bbox)}function eb(t,e){let{back:s}=U.basis();return{eye:Ce(U.focus,Me(s,U.distance)),orthographic:e,pixelScale:e?t/Math.max(1e-9,U.orthoScale):t/2/Math.tan(U.fov/2)}}function tb(){if(k)return Vk();let t=M.renderer?.cullCounts||{full:0,board:0,body:0,box:0,culled:0},e=!M.renderer||M.renderer.identityOnly;return{occurrences:M.renderer?.occurrenceMatrices.length||0,lod:e?{full:1,board:0,body:0,box:0,culled:0}:{...t},triangles:M.renderer?.frameStats.triangles||0,draws:M.renderer?.frameStats.draws||0,gpuMemoryBytes:M.renderer?.gpuMemoryBytes()||0,gpuBreakdown:M.renderer?.gpuMemoryBreakdown()||null,gpuBudgetBytes:E.gpuBudgetBytes,componentTier:M.scene.componentTier,componentEvictions:M.scene.componentEvictions,tileEvictions:M.tileEvictions,visibleTileMisses:M.visibleTileMisses||0,cache:M.assetCache?M.assetCache.summary():{enabled:!1},frameIntervalMs:E.frameIntervalMs,frameIntervalP95Ms:E.frameIntervalP95Ms,frameCpuMs:E.frameCpuMs,frameCpuP95Ms:E.frameCpuP95Ms,fps:E.fps}}function Vk(){let t=qe(),e=t.map(s=>s.scene.componentTier);return{occurrences:k.scene.occurrenceCount||0,lod:k.scene.cullCounts(),triangles:k.scene.frameStats.triangles,draws:k.scene.frameStats.draws,gpuMemoryBytes:k.scene.gpuMemoryBytes(),gpuBreakdown:k.scene.gpuMemoryBreakdown(),gpuBudgetBytes:E.gpuBudgetBytes,componentTier:`${e.filter(s=>s==="loaded").length}/${t.length} loaded`,componentEvictions:t.reduce((s,r)=>s+r.scene.componentEvictions,0),tileEvictions:t.reduce((s,r)=>s+r.tileEvictions,0),visibleTileMisses:t.reduce((s,r)=>s+(r.visibleTileMisses||0),0),cache:t.find(s=>s.assetCache)?.assetCache.summary()||{enabled:!1},frameIntervalMs:E.frameIntervalMs,frameIntervalP95Ms:E.frameIntervalP95Ms,frameCpuMs:E.frameCpuMs,frameCpuP95Ms:E.frameCpuP95Ms,fps:E.fps}}function sb(t){E.showStats=!!t,Cr&&(Cr.hidden=!E.showStats),rb()}function rb(){if(!Cr||!E.showStats)return;let t=tb(),{full:e,board:s,body:r,box:a,culled:n}=t.lod,i=[["Occurrences",`${t.occurrences} (${e+s+r+a} visible)`],["Detail",`${e} full \xB7 ${s} board \xB7 ${r} body \xB7 ${a} box \xB7 ${n} culled`],["Triangles",t.triangles.toLocaleString()],["Draws",t.draws.toLocaleString()],["GPU memory",`${(t.gpuMemoryBytes/1048576).toFixed(1)} / ${(t.gpuBudgetBytes/1048576).toFixed(0)} MB`],["Components",`${t.componentTier}${t.componentEvictions?` \xB7 ${t.componentEvictions} evicted`:""}`],["Cache",t.cache.enabled?`${t.cache.hits} hits \xB7 ${t.cache.misses} misses \xB7 ${(t.cache.bytes/1048576).toFixed(0)} MB`:"off"],["Frame",`${t.frameIntervalMs.toFixed(1)} ms \xB7 p95 ${t.frameIntervalP95Ms.toFixed(1)}`],["CPU",`${t.frameCpuMs.toFixed(2)} ms \xB7 p95 ${t.frameCpuP95Ms.toFixed(2)}`],["FPS",t.fps.toFixed(0)]];Cr.innerHTML=i.map(([o,c])=>`<dt>${o}</dt><dd>${c}</dd>`).join("")}async function ic(t=Fe,e=M){let s=e.semanticGeometry.assets?.components_glb;if(!s||e.scene.componentTier!=="idle")return;e.scene.componentTier="loading";let r;try{r=await rd(new URL(s,location.href).toString(),{componentFeatures:e.scene.componentFeatures,fetchBytes:ab(e),zOffset:Number(e.scene.manifest?.componentsZOffsetMm||0)/1e3})}catch(i){if(Ee(t)){let o=Lc(e.scene.componentFailures,performance.now());e.scene.componentFailures=o.failures,e.scene.componentRetryAt=o.retryAt,e.scene.componentTier="failed"}throw i}if(!Ee(t))return;if(!e.renderer){e.scene.componentTier="idle";return}let a=Zc(r.models);if(await Uk([...a.instanced.map(i=>i.primitive),...a.baked].reduce((i,o)=>i+zk(o),0)),!Ee(t))return;if(!e.renderer){e.scene.componentTier="idle";return}e.scene.componentTier="loaded",e.scene.componentFailures=0,e.scene.componentRetryAt=0,e.loadedBytes+=r.byteLength;for(let i of r.models)for(let o of i.placements){let c=e.scene.componentFeatures.get(o.designator);c&&Wk(c.featureId,o.bounds,e)}for(let[i,o]of r.componentNodeCounts||[])e.scene.componentModelCounts.set(i,o);e.hiddenComponentRequest&&Eb(e.hiddenComponentRequest);let n=i=>({kind:"component",layerId:0,material:i.material,color:i.material.baseColor});e.scene.componentEntries=[...e.renderer.addInstancedPrimitives(a.instanced.map(i=>({primitive:i.primitive,placements:i.placements,metadata:n(i.primitive)}))),...a.baked.map(i=>e.renderer.addPrimitive(i,n(i)))]}function ab(t=M){return t.assetCache?e=>t.assetCache.fetchBytes(e):void 0}function nb(t,e=M){if(!e.renderer||t-(e.tiersCheckedAt||0)<250)return;e.tiersCheckedAt=t;let s=e.renderer.cullCounts,r=s.board+s.body>0,a=e.renderer.identityOnly&&!e.deferComponents||!e.renderer.identityOnly&&(s.full>0||r);a&&(e.scene.componentsWantedAt=t),e.scene.componentTier==="failed"&&Dc(t,e.scene.componentFailures,e.scene.componentRetryAt)&&(e.scene.componentTier="idle"),a&&e.scene.componentTier==="idle"&&e.semanticGeometry.assets?.components_glb&&ic(Fe,e).catch(i=>console.warn("Failed to load components",i));let n=()=>e.renderer.gpuMemoryBytes();e.gpuBytes=n(),!(e.gpuBytes<=E.gpuBudgetBytes)&&e.scene.componentTier==="loaded"&&t-e.scene.componentsWantedAt>F1&&(e.renderer.removeEntries(e.scene.componentEntries),e.scene.componentEntries=[],e.scene.componentTier="idle",e.scene.componentEvictions+=1,e.gpuBytes=n())}var Xh=4e-4,$h=5e-5,Hk={baseColor:[.62,.7,.8,1],metallic:0,roughness:.8,emissive:[0,0,0]};function Yh(t,e=M){if(!e.renderer)return;let s=new Map;for(let i of e.topology.physical_objects||[])i.kind==="footprint_body"&&i.designator&&i.bbox_mm?.length===4&&s.set(i.designator,i);let r=(t?.[5]??8e-4)+$h,a=(t?.[2]??-8e-4)-$h,n=[];for(let i of e.scene.componentFeatures.values()){let o=Number(i.featureId),c=e.scene.features.get(o),l=s.get(i.designator);if(!c||c.bounds||!l)continue;let[u,f,b,g]=l.bbox_mm.map(Number),p=String(l.layer||"").startsWith("B."),d=[u/1e3,-g/1e3,p?a-Xh:r,b/1e3,-f/1e3,p?a:r+Xh];c.bounds=d,c.placeholder=!0,n.push(qk(d,o))}if(n.length)for(let i of qr(n))e.renderer.addPrimitive(i,{kind:"component",layerId:0,material:i.material,color:i.material.baseColor,opacityScale:.3,translucent:!0,placeholder:!0})}function qk([t,e,s,r,a,n],i){let o=[[[0,0,1],[[t,e,n],[r,e,n],[r,a,n],[t,a,n]]],[[0,0,-1],[[t,a,s],[r,a,s],[r,e,s],[t,e,s]]],[[1,0,0],[[r,e,s],[r,a,s],[r,a,n],[r,e,n]]],[[-1,0,0],[[t,a,s],[t,e,s],[t,e,n],[t,a,n]]],[[0,1,0],[[r,a,s],[t,a,s],[t,a,n],[r,a,n]]],[[0,-1,0],[[t,e,s],[r,e,s],[r,e,n],[t,e,n]]]],c=new Float32Array(72),l=new Float32Array(72),u=new Uint32Array(36);return o.forEach(([f,b],g)=>{b.forEach((d,m)=>{c.set(d,(g*4+m)*3),l.set(f,(g*4+m)*3)});let p=g*4;u.set([p,p+1,p+2,p,p+2,p+3],g*6)}),{position:c,normal:l,netId:new Uint32Array(24),objectFeatureId:new Uint32Array(24).fill(i),indices:u,material:Hk,bounds:[t,e,s,r,a,n]}}function Wk(t,e,s=M){let r=s.scene.features.get(Number(t));if(!r||!e.length)return;let a=[1/0,1/0,1/0,-1/0,-1/0,-1/0];for(let n=0;n<e.length;n+=3)a[0]=Math.min(a[0],e[n]),a[1]=Math.min(a[1],e[n+1]),a[2]=Math.min(a[2],e[n+2]),a[3]=Math.max(a[3],e[n]),a[4]=Math.max(a[4],e[n+1]),a[5]=Math.max(a[5],e[n+2]);r.bounds=r.bounds?[Math.min(r.bounds[0],a[0]),Math.min(r.bounds[1],a[1]),Math.min(r.bounds[2],a[2]),Math.max(r.bounds[3],a[3]),Math.max(r.bounds[4],a[4]),Math.max(r.bounds[5],a[5])]:a}function Hn(t,e=M){return mc(t,e.scene.copperLayers)}var Xk=[.55,.35,.16,.78];function ib(t=M){return yc(t.topology?.board?.stackup?.copper_finish)}function $k(t,e=M){return wc(t,e.scene.copperLayers)}var Yk=.25;function Us(t=M){if(!E.realisticColors||E.mode==="layer"||!E.showBoard)return 0;let e=k&&k.boards.get(t.key)===t?Ap(t):E.separation;return 1-de(e/Yk,0,1)}function Bn(t,e=M){let s=$k(t,e)?ib(e):Xs.copper;return ob(Hn(t,e),s,Us(e))}function ob(t,e,s){return t.map((r,a)=>r+(e[a]-r)*s)}function Jk(t,e=Fe){if(e===Fe&&k&&U){q1(t,e);return}if(e!==Fe||!M.renderer||!U)return;let s=performance.now(),r=Math.max(0,t-es);if(E.workspace==="schematic"&&F){es=t;let l=F.visiblePages(),u=te?rE(l):[];F.setDomDetailPageIds(u.map(f=>f.id)),V.visiblePages=F.render(),te?.syncWorldPages(u,F,{activeNetUid:V.activeNetUid}),Cb(),qo(r,performance.now()-s),Wo(t),Pr(e);return}let a=Math.min(.05,(t-es)/1e3);es=t,U.update(a),M.renderer.resize();let n=Br();M.scene.copperRealism!==Us()&&Vr();for(let l of M.renderer.entries)l.layerOffset=n[l.layerId]||0;aE(t),rs=ub(t);let i=nE(t);fe={layerId:0,viewport:{x:0,y:0,width:D.width,height:D.height},matrix:U.matrix(D.width,D.height,E.mode==="layer"),lod:eb(D.height,E.mode==="layer")},M.renderer.selectedOccurrence=E.selectedFeatureId||E.activeNetId?E.selectedOccurrence:-1,M.renderer.setInnerCopperMode(Jp(!E.showBoard||E.separation>.001,Ds().size>0));let o=E.mode==="3d"?M.visible3dLayers:Qp(),c={panels:[fe],activeNetId:E.activeNetId,selectedFeatureId:E.selectedFeatureId,time:t/1e3,layerOffsets:n,visibleLayers:o,showBoard:E.showBoard,showComponents:E.showComponents,showPaste:E.separation===0,componentOpacity:de(1-E.separation/.1,0,1),boardOpacity:Ds().size?.34:1-E.separation*.72,isolateNet:E.isolateNet,compareMode:E.mode==="layer",compareOffsets:rs,layerAlphas:i,visibleTileIds:E.mode==="3d"?M.visibleTileIds:null};if(js=c,eE(t,c)){M.renderer.render(c),Nb(),IE();for(let l of On)l()}nb(t),qo(r,performance.now()-s),Wo(t),Pr(e)}var cb=1e3,lb=1e3/30,it={key:"",matrix:new Float32Array(16),tiles:null,at:0},js=null,oe={canvas:null,context:null,depth:null,depthView:null,width:0,height:0},Cn=new Va(3e3),On=new Set,xn={frames:0,cpuMs:0,gpuMs:0,lastTriangles:0},Jh={cullTiles:!0};function Qk(t,e){let s=M.renderer;oe.canvas||(oe.canvas=document.createElement("canvas"),oe.context=oe.canvas.getContext("webgpu")),!(oe.width>=t&&oe.height>=e&&oe.depth)&&(oe.width=Math.max(oe.width,t),oe.height=Math.max(oe.height,e),oe.canvas.width=oe.width,oe.canvas.height=oe.height,oe.context.configure({device:s.device,format:s.format,alphaMode:"opaque"}),oe.depth?.destroy(),oe.depth=s.device.createTexture({label:"inset-depth",size:[oe.width,oe.height],format:s.depthFormat,sampleCount:s.sampleCount,usage:GPUTextureUsage.RENDER_ATTACHMENT}),oe.depthView=oe.depth.createView())}function db(){return!!(M.renderer&&js&&E.workspace==="pcb")}function Zk(t,e,s="inset"){if(!db())return!1;let r=t.clientWidth,a=t.clientHeight;if(!r||!a)return!1;let n=performance.now(),i=Math.min(devicePixelRatio||1,2),o=Math.round(r*i),c=Math.round(a*i);Qk(o,c);let l=At(M.scene.runtimeBounds),u=so(e,r,a,l,e.focusZ??0);Cn.record(s,u,n);let f={layerId:0,viewport:{x:0,y:0,width:o,height:c},matrix:u,lod:js.panels[0].lod},b=js.visibleTileIds,g=M.renderer.renderInto({colorView:oe.context.getCurrentTexture().createView(),depthView:oe.depthView,width:oe.width,height:oe.height},f,{...js,panels:[f],visibleTileIds:b});return t.width!==o&&(t.width=o),t.height!==c&&(t.height=c),t.getContext("2d").drawImage(oe.canvas,0,0,o,c,0,0,o,c),xn.frames+=1,xn.cpuMs+=performance.now()-n,xn.lastTriangles=g.triangles,!0}function eE(t,e){let s=e.panels[0].matrix,r=!1;for(let c=0;c<16;c+=1)if(s[c]!==it.matrix[c]){r=!0;break}if(r)return it.matrix.set(s),it.key="",it.at=t,!0;let a=[D.width,D.height,M.renderer.version,M.renderer.selectedOccurrence,E.workspace,E.mode,e.activeNetId,e.selectedFeatureId,e.showBoard,e.showComponents,e.showPaste,e.componentOpacity,e.boardOpacity,e.isolateNet,M.scene.layerZOffsetSignature,[...e.visibleLayers].join(","),[...e.compareOffsets].map(([c,l])=>`${c}:${l}`).join(";"),e.layerAlphas?[...e.layerAlphas].join(";"):""].join("|");return!!(e.activeNetId||e.selectedFeatureId||M.renderer.emphasizedNetIds.size)&&t-it.at>=lb||a!==it.key||!tE(e.visibleTileIds,it.tiles)||t-it.at>cb?(it.key=a,it.tiles=e.visibleTileIds,it.at=t,!0):!1}function tE(t,e){if(!t||!e)return t===e;if(t.size!==e.size)return!1;for(let s of t)if(!e.has(s))return!1;return!0}function sE(t){if(!F||!t)return{widthPx:0,heightPx:0,sourcePxPerMm:0,area:0};let e=F.pagePixelWidth(t),s=t.heightMm/Math.max(1e-6,F.scale),r=F.pageSourcePixelsPerMm(t);return{widthPx:e,heightPx:s,sourcePxPerMm:r,area:e*s}}function rE(t){if(!te||!F)return[];let e=t||[],s=Math.max(1,Ge.clientWidth*Ge.clientHeight);return e.map(n=>({page:n,...sE(n)})).filter(n=>n.widthPx>=760&&n.heightPx>=520&&n.area>=s*.36&&n.sourcePxPerMm>=1.25).sort((n,i)=>i.area-n.area).slice(0,1).map(n=>n.page)}function Br(t=M){let e=as(t),s=Math.hypot((e[3]-e[0])*1e3,(e[4]-e[1])*1e3),r=E.separation*E.separation*de(s*.12,8,25)/1e3,a=`${E.separation}:${r}:${t.scene.copperLayers.length}`;if(t.scene.layerZOffsetSignature===a)return t.scene.layerZOffsets;let n=t.scene.layerZOffsets;n.fill(0);let i=(t.scene.copperLayers.length-1)/2;return t.scene.copperLayers.forEach((o,c)=>{n[Number(o.id)]=(i-c)*r}),t.scene.layerZOffsetSignature=a,n}function ub(t){if(E.mode!=="layer")return Be.key="3d",Be.current.clear(),new Map;let e=M.scene.copperLayers.filter(m=>M.compareLayers.has(Number(m.id))),s=Math.max(1,e.length),r=D.width/Math.max(1,D.height),a=1;s===2?a=r>=1?2:1:s===3||s===4?a=2:s>4&&(a=Math.ceil(Math.sqrt(s*r)));let n=Math.ceil(s/a),i=as(),o=i[3]-i[0],c=i[4]-i[1],l=o*1.18,u=c*1.22,f=e.map((m,h)=>{let y=h%a,w=Math.floor(h/a);return{layer:m,layerId:Number(m.id),column:y,row:w,offset:[(y-(a-1)/2)*l,((n-1)/2-w)*u,0]}}),b=`${a}x${n}:${f.map(m=>m.layerId).join(",")}`;if(b!==Be.key){Be.key=b,Be.started=t,Be.from=new Map(Be.current);let m=a*o+(a-1)*(l-o),h=n*c+(n-1)*(u-c);U.targetFocus=[(i[0]+i[3])/2,(i[1]+i[4])/2,(i[2]+i[5])/2],U.targetOrthoScale=Math.max(h,m/r)*1.08}let g=de((t-Be.started)/420,0,1),p=1-Math.pow(1-g,3),d=new Map;for(let m of f){let h=Be.from.get(m.layerId)||[0,0,0],y=m.offset.map((w,v)=>h[v]+(w-h[v])*p);d.set(m.layerId,y),Be.current.set(m.layerId,y)}if(Z.phase==="reveal")for(let m of Z.previous)d.has(Number(m))||d.set(Number(m),Z.previousOffsets.get(Number(m))||[0,0,0]);for(let m of[...Be.current.keys()])f.some(h=>h.layerId===m)||Be.current.delete(m);return d}function Gr(t){let e=new Set([...t].map(Number));if(!(Qh(e,M.desiredCompareLayers)&&Z.phase!=="idle")){if(M.desiredCompareLayers=e,Qh(e,M.compareLayers)){Z.phase="idle",Z.previous.clear(),Z.target.clear();return}Z.phase="preload",Z.previous=new Set(M.compareLayers),Z.target=new Set(e),Z.previousOffsets=new Map(Be.current),Z.started=performance.now()}}function oc({snap:t=!0}={}){E.mode="layer";let e=Gk();M.desiredCompareLayers=new Set(e),!M.compareLayers.size&&e.size&&(M.compareLayers=new Set(e)),Z.phase="idle",Z.previous.clear(),Z.target.clear(),Be.key="",U.setAxis("z",!1),M.renderer?.resize(),rs=ub(performance.now()),t&&U.snap()}function aE(t){if(!(E.mode!=="layer"||Z.phase==="idle")){if(Z.phase==="preload"){Z.phase="reveal",Z.started=t,Z.previousOffsets=new Map(Be.current),M.compareLayers=new Set(Z.target),Be.key="";return}Z.phase==="reveal"&&t-Z.started>=rp&&(M.compareLayers=new Set(Z.target),Z.phase="idle",Z.previous.clear(),Z.target.clear(),Z.previousOffsets.clear())}}function nE(t){if(E.mode!=="layer"||Z.phase!=="reveal")return null;let e=de((t-Z.started)/rp,0,1),s=e*e*(3-2*e),r=new Map;for(let a of Z.previous)r.set(Number(a),Z.target.has(Number(a))?1:1-s);for(let a of Z.target)r.set(Number(a),Z.previous.has(Number(a))?1:s);return r}function Qh(t,e){if(t.size!==e.size)return!1;for(let s of t)if(!e.has(s))return!1;return!0}function cc(){if(E.workspace==="schematic"){oE();return}if(E.workspace==="bom"){iE();return}if(E.workspace==="stackup")return;Ln.textContent=M.viewerReadiness.stage==="semantic-ready"?"Semantic GLTF A0":"Prism staged 3D",Dn.textContent="Layers",Un.textContent="Visibility and compare",ee('[data-panel="search"] .section-heading span').textContent="Nets, components and pins",ee('[data-panel="view"] .section-heading span').textContent="Camera and stackup";let t=`
    <div class="mode-toolbar">
      <button data-mode="layer">PCB</button>
      <button data-mode="3d">3D</button>
    </div>`;Ps&&(Ps.innerHTML=t),ot.innerHTML=`
    ${Ps?"":t}
    <div class="layer-presets">
      <button data-preset="all">All</button><button data-preset="none">None</button>
      <button data-preset="outer">Outer</button><button data-preset="inner">Inner</button>
    </div>
    <div class="layer-list"></div>`,Te.innerHTML=`
    <label class="control-field"><span>Search</span>
      <input id="entity-search" class="layer-select" type="search" placeholder="Net, component or pin">
      <div id="search-results" class="search-results"></div>
    </label>
    <div class="quick-actions">
      <button id="frame-selection">Frame</button>
      <button id="show-net-layers">Net layers</button>
      <button id="isolate-net" aria-keyshortcuts="I" title="Toggle isolated net view (I)">Isolate</button>
      <button id="clear-selection">Clear</button>
    </div>`,He.innerHTML=`
    <div class="toggle-list">
      <label class="toggle-row"><input id="show-board" type="checkbox"><span>Board substrate</span></label>
      <label class="toggle-row"><input id="show-components" type="checkbox"><span>Components</span></label>
    </div>
    <label class="control-field range-field"><span>Stackup separation</span>
      <input id="separation" type="range" min="0" max="1" step="0.002">
    </label>`,je(),mE()}function iE(){Ln.textContent="BoM A0",Dn.textContent="Bill of Materials",Un.textContent="Grouped procurement view",ee('[data-panel="search"] .section-heading span').textContent="Search inside the BoM table",ee('[data-panel="view"] .section-heading span').textContent="BoM actions";let t=ct?.payload?.counts||{};ot.innerHTML=`
    <div class="selection-properties">
      <div class="selection-property"><small>Rows</small><strong>${t.rows||0}</strong></div>
      <div class="selection-property"><small>Components</small><strong>${t.components||0}</strong></div>
      <div class="selection-property"><small>DNP</small><strong>${t.dnpComponents||0}</strong></div>
    </div>
    <div class="selection-section">
      <span class="selection-section-title">Columns</span>
      <div class="selection-empty">Primary procurement and thermal columns are shown first. Additional symbol and footprint metadata is available in the row detail panel.</div>
    </div>`,Te.innerHTML=`
    <div class="selection-empty">Use the BoM search box in the main view. Reference chips update the shared PCB and schematic selection without changing workspaces.</div>
    <div class="quick-actions">
      <button id="clear-selection">Clear</button>
    </div>`,He.innerHTML=`
    <div class="selection-section">
      <span class="selection-section-title">Cross-probing</span>
      <div class="selection-table">
        <div class="selection-row"><span><strong>PCB/Schematic</strong></span><span>Select component</span><span>Highlights matching BoM row</span></div>
        <div class="selection-row"><span><strong>BoM reference</strong></span><span>Click chip</span><span>Holds component selection for PCB and schematic</span></div>
      </div>
    </div>`,Te.querySelector("#clear-selection")?.addEventListener("click",Pe)}function oE(){Ln.textContent=te?"Schematic SVG DOM":V.manifest?.schema==="prism.schematic_vector_a0"?"Schematic Vector A0":"Schematic World A0",Dn.textContent="Pages",Un.textContent=`${V.pages.length} hierarchy instances`,ee('[data-panel="search"] .section-heading span').textContent="Pages, nets and components",ee('[data-panel="view"] .section-heading span').textContent="World navigation",ot.innerHTML=`
    <div class="layer-presets">
      <button data-page-action="world">Fit world</button>
      <button data-page-action="parent">Parent</button>
      <button data-page-action="previous">Previous</button>
      <button data-page-action="next">Next</button>
    </div>
    <div class="page-list">${V.pages.map(t=>`
      <button class="page-row ${t.id===E.selectedPageId?"active":""}" data-page="${t.id}">
        <span>${t.sheetNumber}</span>
        <strong>${z(t.name)}</strong>
        <small>L${t.depth}</small>
      </button>`).join("")}</div>`,Te.innerHTML=`
    <label class="control-field"><span>Search</span>
      <input id="entity-search" class="layer-select" type="search" placeholder="Page, net or component">
      <div id="search-results" class="search-results"></div>
    </label>
    <div class="quick-actions">
      <button id="frame-selection">Frame</button>
      <button id="clear-selection">Clear</button>
    </div>`,He.innerHTML=`
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
    </div>`,ot.querySelectorAll("[data-page]").forEach(t=>{t.addEventListener("click",()=>Mt(t.dataset.page,!0))}),ot.querySelectorAll("[data-page-action]").forEach(t=>{t.addEventListener("click",()=>kn(t.dataset.pageAction))}),Te.querySelector("#entity-search").addEventListener("input",t=>{lE(t.target.value)}),Te.querySelector("#frame-selection").addEventListener("click",pb),Te.querySelector("#clear-selection").addEventListener("click",Kr),He.querySelector("#show-hierarchy").checked=F?.showHierarchy??!0,He.querySelector("#show-hierarchy").addEventListener("change",t=>{F.showHierarchy=t.target.checked})}function Mt(t,e){let s=V.byId.get(t);!s||!F||(E.selectedPageId=s.id,E.selectedSchematicFeature=null,F.selectedPageId=s.id,F.selectedFeatureId=0,bt.textContent=JSON.stringify(s,null,2),e&&F.framePage(s),ot.querySelectorAll("[data-page]").forEach(r=>{r.classList.toggle("active",r.dataset.page===s.id)}))}function kn(t){if(!F)return;if(t==="world"){F.frameWorld();return}let e=Math.max(0,V.pages.findIndex(r=>r.id===E.selectedPageId)),s=null;t==="previous"?s=V.pages[(e-1+V.pages.length)%V.pages.length]:t==="next"?s=V.pages[(e+1)%V.pages.length]:t==="parent"&&(s=V.byId.get(V.pages[e]?.parentId)),s&&Mt(s.id,!0)}function cE(t){if(!t||!F)return;if(Kr(),t.kind==="page"&&t.pageId){Mt(t.pageId,!0);return}if(t.kind!=="sheet")return;let e=V.pages.find(n=>n.sheetInstancePath===t.sheetInstancePath)||V.byId.get(E.selectedPageId),s=String(t.sheetFile||t.feature?.sheet_file||"").replace(/\\/g,"/"),r=String(t.sheetName||t.feature?.sheet_name||t.feature?.objectId||""),a=V.pages.find(n=>{if(e&&n.parentId&&n.parentId!==e.id)return!1;let i=String(n.sourcePath||"").replace(/\\/g,"/");return s&&i.endsWith(s)||r&&n.name===r})||V.pages.find(n=>{let i=String(n.sourcePath||"").replace(/\\/g,"/");return s&&i.endsWith(s)||r&&n.name===r});a&&Mt(a.id,!0)}function lE(t){let e=Te.querySelector("#search-results"),s=t.trim().toLowerCase();if(!s){e.innerHTML="";return}let r=V.pages.filter(n=>`${n.name} ${n.sheetPath}`.toLowerCase().includes(s)).slice(0,8),a=M.scene.nets.filter(n=>String(n.name).toLowerCase().includes(s)).slice(0,8);e.innerHTML=[...r.map(n=>`<button data-page="${n.id}"><b>${z(n.name)}</b><span>Page ${n.sheetNumber}</span></button>`),...a.map(n=>`<button data-schematic-net="${n.id}"><b>${z(n.name)}</b><span>${(V.manifest.netToPages?.[n.uid]||[]).length} pages</span></button>`)].join(""),e.querySelectorAll("[data-page]").forEach(n=>{n.addEventListener("click",()=>Mt(n.dataset.page,!0))}),e.querySelectorAll("[data-schematic-net]").forEach(n=>{n.addEventListener("click",()=>fb(Number(n.dataset.schematicNet),!0))})}function fb(t,e){let s=M.scene.nets.find(a=>Number(a.id)===t);if(!s||!F)return;E.activeNetId=t,E.selectedFeatureId=0,E.selectedSchematicFeature=null,F.selectedFeatureId=0,F.selectedFeatureKey="",F.selectedSourceId="",V.activeNetUid=s.uid,F.activeNetUid=s.uid,te?.setHighlightedNet(s.uid),bt.textContent=JSON.stringify(s,null,2),et();let r=V.manifest.netToPages?.[s.uid]||[];e&&r.length&&Mt(r[0],!0)}function hb(t,e=null){let s=M.scene.nets.find(r=>r.uid===t);s&&(E.activeNetId=Number(s.id),V.activeNetUid=s.uid,F&&(F.activeNetUid=s.uid,F.selectedFeatureId=Number(e?.feature?.id||e?.featureId||0),F.selectedFeatureKey=e?.feature?.stableKey||e?.featureKey||"",F.selectedSourceId=e?.feature?.sourceId||e?.sourceId||""),te?.setHighlightedNet(s.uid),e&&(E.selectedSchematicFeature={...e,pageId:E.selectedPageId}),bt.textContent=JSON.stringify(e?{...e,net:s}:s,null,2),et())}function Kr(){E.activeNetId=0,E.selectedFeatureId=0,E.selectedSchematicFeature=null,V.activeNetUid="",F&&(F.activeNetUid="",F.selectedFeatureId=0,F.selectedFeatureKey="",F.selectedSourceId=""),te?.setSelection(null),te?.setHighlightedNet(""),bt.textContent="No object selected",et()}function pb(){let t=V.byId.get(E.selectedPageId);t?F.framePage(t):F.frameWorld()}function dE(t){E.selectedPageId=t.sheetInstancePath&&V.pages.find(r=>r.sheetInstancePath===t.sheetInstancePath)?.id||E.selectedPageId,E.selectedFeatureId=0,E.selectedSchematicFeature={...t,pageId:E.selectedPageId},t.anchor&&(E.selectionAnchor=t.anchor),F&&(F.selectedPageId=E.selectedPageId,F.selectedFeatureId=Number(t.feature?.id||0));let e=t.netUid?M.scene.nets.find(r=>r.uid===t.netUid):null,s=t.reference?M.scene.componentFeatures.get(t.reference):null;s&&(E.selectedFeatureId=Number(s.featureId||0),ct?.setSelectionByReference(t.reference,{scroll:E.workspace==="bom"})),bt.textContent=JSON.stringify({...t,net:e,component:s},null,2),et()}function uE(t){let{page:e,feature:s}=t;if(!s){E.selectedSchematicFeature=null,F.selectedFeatureId=0,Mt(e.id,!1),et();return}let r=Number(s.id||0);if(E.selectedPageId=e.id,F.selectedPageId=e.id,F.selectedFeatureId=r,E.selectedSchematicFeature={...s,pageId:e.id},E.selectionAnchor=null,s.netUid){let a=M.scene.nets.find(n=>n.uid===s.netUid);if(a){fb(Number(a.id),!1),E.selectedSchematicFeature={...s,pageId:e.id},F.selectedFeatureId=r;return}}if(s.reference){let a=M.scene.componentFeatures.get(s.reference);if(a){gs(Number(a.featureId),!1),E.selectedSchematicFeature={...s,pageId:e.id},F.selectedFeatureId=r;return}}E.activeNetId=0,E.selectedFeatureId=0,F.activeNetUid="",bt.textContent=JSON.stringify({page:e.name,...s},null,2),et()}function bs(){let t=E.isolateNet,e=Te?.querySelector?.("#isolate-net");e?.classList.toggle("active",t),e?.setAttribute("aria-pressed",String(t));let s=re?.querySelector?.("[data-action=isolate]");s?.classList.toggle("active",t),s?.setAttribute("aria-pressed",String(t));let r=He?.querySelector?.("#show-board");r&&(r.checked=E.showBoard);let a=He?.querySelector?.("#show-components");a&&(a.checked=E.showComponents),St()}function fE(){let t=new Set;for(let e of Ds())for(let s of lc(e))t.add(s);return t}function lc(t,e=M){let s=new Set,r=e.scene.nets.find(n=>Number(n.id)===Number(t)),a=new Set(e.scene.copperLayers.map(n=>Number(n.id)));for(let n of Object.keys(r?.layerBoundsMm||{})){let i=Number(n);a.has(i)&&s.add(i)}if(!s.size){let n=new Map(e.scene.copperLayers.map(i=>[i.name,Number(i.id)]));for(let i of r?.metrics?.layers||[]){let o=n.get(i);o!=null&&s.add(o)}}return s}function zs(){if(k){for(let e of qe())Kn(e);return}let t=fE();t.size&&(M.visible3dLayers=new Set(t),E.mode==="layer"?Gr(t):(M.compareLayers=new Set(t),M.desiredCompareLayers=new Set(t)))}function qs(t){let e=!!(t&&Hs()),s=E.isolateNet;if(e&&!E.isolateNet&&!k&&(M.preIsolation3dLayers=new Set(M.visible3dLayers),M.preIsolationCompareLayers=new Set(M.desiredCompareLayers.size?M.desiredCompareLayers:M.compareLayers)),E.isolateNet=e,k)zs();else if(E.isolateNet)zs();else if(M.preIsolation3dLayers||M.preIsolationCompareLayers){if(M.preIsolation3dLayers&&(M.visible3dLayers=new Set(M.preIsolation3dLayers)),M.preIsolationCompareLayers){let r=new Set(M.preIsolationCompareLayers);E.mode==="layer"?Gr(r):(M.compareLayers=r,M.desiredCompareLayers=new Set(r))}M.preIsolation3dLayers=null,M.preIsolationCompareLayers=null}Gc(E,s,e),bs(),je()}function je(){(Ps||ot).querySelectorAll("[data-mode]").forEach(s=>{let r=s.dataset.mode===E.mode;s.classList.toggle("active",r),s.setAttribute("aria-pressed",String(r))}),He.querySelector("#show-board").checked=E.showBoard,He.querySelector("#show-components").checked=E.showComponents,He.querySelector("#separation").value=E.separation;let t=ot.querySelector(".layer-list"),e=E.mode==="3d"?M.visible3dLayers:M.desiredCompareLayers;t.innerHTML=M.scene.copperLayers.map((s,r)=>`
    <label class="layer-row">
      <input type="checkbox" data-layer="${s.id}" ${e.has(Number(s.id))?"checked":""}>
      <span class="swatch" style="background:${qn(Hn(s))}"></span>
      <span>${z(s.name)}</span><small>${r+1}</small>
    </label>`).join(""),t.querySelectorAll("[data-layer]").forEach(s=>s.addEventListener("change",()=>{gb(Number(s.dataset.layer),s.checked)})),bs()}function bb(t){t==="layer"?oc():(E.mode="3d",U.frame(as()),U.snap(),M.visibleTileIds=new Set),je()}function gb(t,e,s=null){if(k){let r=Number(t);Jo(s==null?null:[s],a=>e?a.delete(r):a.add(r));return}if(E.mode==="3d")e?M.visible3dLayers.add(t):M.visible3dLayers.delete(t);else{let r=new Set(M.desiredCompareLayers);e?r.add(t):r.delete(t),Gr(r)}je()}function mb(t,e=null){if(k){Jo(e==null?null:[e],(r,a)=>{let n=a?.scene.copperLayers||[];r.clear(),n.forEach((i,o)=>{t==="all"||t==="outer"&&(o===0||o===n.length-1)||t==="inner"&&o>0&&o<n.length-1||r.add(Number(i.id))})});return}let s=E.mode==="3d"?M.visible3dLayers:new Set;s.clear();for(let[r,a]of M.scene.copperLayers.entries())(t==="all"||t==="outer"&&(r===0||r===M.scene.copperLayers.length-1)||t==="inner"&&r>0&&r<M.scene.copperLayers.length-1)&&s.add(Number(a.id));E.mode!=="3d"&&Gr(s),je()}function yb(t){Kc(E,t,()=>qs(!1)),bs()}function wb(t){E.showComponents=!!t,E.savedShowComponents=E.showComponents,bs()}function hE(t){E.showPlaceholders=!!t;for(let e of k?qe():[M])e.renderer?.setPlaceholdersVisible(E.showPlaceholders);St()}function pE(){let t=new Set((M.scene?.layers||[]).map(r=>String(r.name))),e=new Set(E.hiddenBoardLayers),s=r=>{let a=(M.renderer?.entries||[]).find(i=>i.kind==="board"&&i.boardRole===r),n=a?.color||a?.material?.baseColor;return n?qn(n):C1[r]};return B1.filter(r=>!t.size||t.has(r.name)).map(r=>({...r,color:s(r.role),visible:!e.has(`${r.role}:${r.side}`)}))}function bE(t,e,s){let r=`${t}:${e}`,a=new Set(E.hiddenBoardLayers);s?a.delete(r):a.add(r),E.hiddenBoardLayers=[...a];for(let n of k?qe():[M])n.renderer?.setHiddenBoardLayers(E.hiddenBoardLayers);St()}function gE(t){E.realisticColors=!!t;for(let e of k?qe():[M])Vr(e);St()}function Vr(t=M){if(!t.renderer)return;let e=new Map(t.scene.layers.map(s=>[Number(s.id),s]));for(let s of t.renderer.entries)s.kind==="copper"&&(s.color=Bn(e.get(Number(s.layerId)),t));t.renderer.copperColors=new Map([...e].map(([s,r])=>[s,Bn(r,t)])),t.renderer.invalidate?.(),t.renderer.setBarrelColor(ob(Xk,[...ib(t).slice(0,3),.78],Us(t))),t.scene.copperRealism=Us(t)}function vb(t,e=null){if(k){tk(de(Number(t)||0,0,1),e);return}E.separation=de(Number(t)||0,0,1),St()}function mE(){(Ps||ot).querySelectorAll("[data-mode]").forEach(e=>e.addEventListener("click",()=>{bb(e.dataset.mode)})),ot.querySelectorAll("[data-preset]").forEach(e=>e.addEventListener("click",()=>{mb(e.dataset.preset)})),He.querySelector("#show-board").addEventListener("change",e=>{yb(e.target.checked)}),He.querySelector("#show-components").addEventListener("change",e=>{wb(e.target.checked)}),He.querySelector("#separation").addEventListener("input",e=>{vb(e.target.value)}),Te.querySelector("#clear-selection").addEventListener("click",Pe),Te.querySelector("#isolate-net").addEventListener("click",()=>{qs(!E.isolateNet)}),Te.querySelector("#frame-selection").addEventListener("click",bc),Te.querySelector("#show-net-layers").addEventListener("click",dc);let t=Te.querySelector("#entity-search");t.addEventListener("input",()=>kb(t.value))}function xb(){hs(".rail-tab").forEach(t=>t.addEventListener("click",()=>{let e=t.dataset.tab,s=E.activeTab===e&&!Et.classList.contains("panel-collapsed");E.activeTab=e,Et.classList.toggle("panel-collapsed",s),hs(".rail-tab").forEach(r=>{r.classList.toggle("active",!s&&r.dataset.tab===e)}),hs(".tab-panel").forEach(r=>{r.classList.toggle("active",!s&&r.dataset.panel===e)})}))}function dc(){if(k){Q1();return}let t=M.scene.nets.find(r=>Number(r.id)===E.activeNetId);if(!t)return;let e=new Set(t.metrics?.layers||[]),s=E.mode==="3d"?M.visible3dLayers:new Set;s.clear();for(let r of M.scene.copperLayers)e.has(r.name)&&s.add(Number(r.id));E.mode!=="3d"&&Gr(s),je()}function kb(t){let e=Te.querySelector("#search-results"),s=t.trim().toLowerCase();if(!s){e.innerHTML="";return}let r=M.scene.nets.filter(n=>String(n.name).toLowerCase().includes(s)).slice(0,8),a=[...M.scene.componentFeatures.values()].filter(n=>!M.hiddenComponents.has(String(n.designator||""))&&`${n.designator} ${n.value} ${n.footprint}`.toLowerCase().includes(s)).slice(0,6);e.innerHTML=[...r.map(n=>`<button data-net="${n.id}"><b>${z(n.name)}</b><span>${z(n.netClass||"")}</span></button>`),...a.map(n=>`<button data-feature="${n.featureId}"><b>${z(n.designator)}</b><span>${z(n.value)}</span></button>`)].join(""),e.querySelectorAll("[data-net]").forEach(n=>{n.addEventListener("click",()=>uc(Number(n.dataset.net),!0))}),e.querySelectorAll("[data-feature]").forEach(n=>{n.addEventListener("click",()=>gs(Number(n.dataset.feature),!0))})}function uc(t,e){e&&(E.selectionAnchor=null),E.activeNetId=t,E.selectedFeatureId=0;let s=M.scene.nets.find(r=>Number(r.id)===t);E.workspace==="schematic"&&s&&F&&(V.activeNetUid=s.uid,F.activeNetUid=s.uid),nc(),bt.textContent=JSON.stringify(s||{},null,2),et(),E.isolateNet&&zs(),e&&s?.boundsMm&&U.frame(hc(ac(ws(s.boundsMm)))),Vn(Hp(s))}function gs(t,e=!1){let s=M.scene.features.get(t);if(s?.kind==="component"&&ea(Gs(s),M.hiddenComponents))return;e&&(E.selectionAnchor=null),E.selectedFeatureId=t,E.activeNetId=Number(s?.netId||0);let r=Gs(s);r&&ct?.setSelectionByReference(r,{scroll:E.workspace==="bom"});let a=qp(s);a?.kind==="net"||a?.kind==="terminal"&&E.activeNetId?nc():Wp(),bt.textContent=s?JSON.stringify(s,null,2):"No object selected",et(),E.isolateNet&&E.activeNetId&&zs(),e&&s?.bounds&&pc(s),Vn(a)}function fc(t,e=!1){if(ea(t,M.hiddenComponents))return;let s=M.scene.componentFeatures.get(t);if(ct?.setSelectionByReference(t,{scroll:E.workspace==="bom"}),!s?.featureId)return;Wp(),gs(Number(s.featureId),!1);let r=wE(t);if(r){let{page:a,feature:n}=r;E.selectedPageId=a.id,E.selectedSchematicFeature={...n,pageId:a.id},F&&(F.selectedPageId=a.id,F.selectedFeatureId=Number(n.id||0)),te?.setSelection?.({kind:"component",featureKey:n.stableKey||"",sheetInstancePath:n.sheetInstancePath||a.sheetInstancePath||"",sourceId:n.sourceId||n.uuid||"",reference:t,feature:n,pageId:a.id}),e&&E.workspace==="schematic"&&(Mt(a.id,!0),te?.frameSelection?.())}if(e&&E.workspace==="pcb"){let a=M.scene.features.get(Number(s.featureId));a?.bounds&&pc(a,!0)}et()}function Gs(t){return t?.designator||t?.reference||t?.componentDesignator||""}function yE(t=M){return Pc(t.scene.manifest?.components||[],t.scene.componentModelCounts)}function Eb(t){M.hiddenComponentRequest=t;let e=jc(t,yE());M.hiddenComponents=e.hiddenReferences,M.renderer?.setHiddenFeatureIds(e.hiddenFeatureIds),e.ambiguous.length&&console.warn(`[prism-semantic-viewer] keeping ambiguous components visible: ${e.ambiguous.join(", ")}`),e.unknown.length&&console.warn(`[prism-semantic-viewer] ignoring unknown components: ${e.unknown.join(", ")}`);let s=Gs(M.scene.features.get(E.selectedFeatureId));ea(s,M.hiddenComponents)&&Pe();let r=Te.querySelector("input");return r?.value&&kb(r.value),e}function hc(t,e=[...rs.keys()]){if(E.mode!=="layer"||!t)return t;let s=[];for(let r of e){let a=rs.get(Number(r));a&&s.push([t[0]+a[0],t[1]+a[1],0,t[3]+a[0],t[4]+a[1],0])}return s.length?vs(s):t}function pc(t,e=!1){if(!t?.bounds)return;let s=ac(t.bounds),r=e||t.kind==="component"||!!Gs(t);if(E.mode==="layer"){let a=M.scene.copperLayers,n=(s[2]+s[5])*.5<0?a[a.length-1]:a[0];U.frame(hc(s,r&&n?[Number(n.id)]:void 0));return}if(r){let n=(s[2]+s[5])*.5<0,i=U.isBelow();n!==i&&U.setAxis("z",n)}U.frame(s)}function wE(t){if(!t||!F?.featuresByPage)return null;let e=V.byId.get(E.selectedPageId),s=[...e?[e]:[],...(V.pages||[]).filter(a=>a.id!==e?.id)],r=a=>{let n=String(a.kind||"").toLowerCase();return n==="component"||n==="symbol_body"||n==="symbol_instance"?0:n==="symbol_reference"?1:n.startsWith("pin")?2:3};for(let a of s){let n=(F.featuresByPage[a.id]||[]).filter(i=>String(i.reference||i.designator||i.componentDesignator||"")===t).sort((i,o)=>r(i)-r(o));if(n.length)return{page:a,feature:n[0]}}return null}function Pe(){E.activeNetId=0,E.selectedFeatureId=0,E.selectedSchematicFeature=null,E.selectionAnchor=null;let t=Hs(),e=E.isolateNet;t?e&&zs():(e&&qs(!1),Xp()),V.activeNetUid="",F&&(F.activeNetUid=""),te?.setSelection(null),te?.setHighlightedNet(""),bt.textContent="No object selected",ct?.clearSelection?.(),et(),Vn(null)}function En(t){return`<div class="selection-properties">${t.map(([e,s])=>`
    <div class="selection-property">
      <small>${z(e)}</small>
      <strong title="${z(String(s))}">${z(String(s))}</strong>
    </div>`).join("")}</div>`}function Fn(t,e,s){return`
    <div class="selection-card-head">
      <span class="selection-card-accent" style="background:${s}"></span>
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
      <div class="selection-card-title"><small>${z(t)}</small><strong>${z(e)}</strong></div>
      <button class="selection-card-close" type="button" aria-label="Clear selection">&times;</button>
    </div>`}function vE(t){let s=(M.topology.net_details?.[t.uid]||{}).terminals||[],r=t.metrics||{},a=Number(r.traceLengthMm||0).toFixed(2),n=r.objectCounts?.via||0,i=s.length,c=/^(VCC|VDD|GND|3V3|5V|12V|VIN|POWER)/i.test(t.name)?"#10b981":"#8b5cf6",l=t.netClass||"Default",u=s.length?s.map(f=>`
      <div class="selection-row pin-row-interactive" data-ref="${z(f.designator)}" data-pin="${z(f.pin)}">
        <span class="refdes-col"><strong>${z(f.designator)}</strong></span>
        <span class="pin-col">Pin ${z(f.pin)}</span>
        <span class="val-col" title="${z(f.value||"")}">${z(f.value||"-")}</span>
      </div>`).join(""):'<div class="selection-empty">No connected pin metadata is available.</div>';return`
    ${Fn("Net",t.name,c)}
    <div class="selection-net-dashboard">
      <div class="net-metric-grid">
        <div class="metric-card">
          <small>Length</small>
          <strong>${a} <span class="unit">mm</span></strong>
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
          <strong title="${z(l)}">${z(l)}</strong>
        </div>
      </div>
      
      <div class="selection-section">
        <span class="selection-section-title">Layers</span>
        <div class="net-layers-badges">
          ${(r.layers||[]).length?r.layers.map(f=>`<span class="layer-badge">${z(f)}</span>`).join(""):'<span class="layer-badge unknown">None</span>'}
        </div>
      </div>

      <div class="selection-section">
        <span class="selection-section-title">Connected Pins</span>
        <div class="selection-table compact-scroll" style="max-height: 120px;">
          ${u}
        </div>
      </div>
    </div>`}function xE(t,e=null){let s=$o(t.designator),r=s?s.value:t.value||"Not specified",a=s?s.footprint:t.footprint||"Not specified",n=s?.parameters||{},i=n.Manufacturer||n.Mfr||"",o=n["Manufacturer Part Number"]||n.MPN||n["Part Number"]||"",c=n.kicad_dnp==="true"||n.DNP==="true"||n.kicad_in_bom==="false",l="";(i||o)&&(l=`
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
      </div>`);let u="";return e&&(u=`
      <div class="selection-section">
        <span class="selection-section-title">Selected Pin</span>
        <div class="selection-table">
          <div class="selection-row">
            <span><strong>Pin</strong></span>
            <span>Pin ${z(e.pinNumber||e.pin||"")}</span>
            <span title="${z(e.pinName||"")}">${z(e.pinName||"No name")}</span>
          </div>
          <div class="selection-row">
            <span><strong>Net</strong></span>
            <span class="net-ref-interactive" data-net-name="${z(e.netName||"")}">${z(e.netName||"Not connected")}</span>
          </div>
        </div>
      </div>`),`
    ${Fn("Component",t.designator||"Unknown","#3b82f6")}
    <div class="selection-component-dashboard">
      ${c?'<div class="dnp-banner" style="background:#b45309;color:#fff;font-size:9px;font-weight:750;text-align:center;padding:3px;margin-bottom:8px;border-radius:2px;text-transform:uppercase;letter-spacing:0.05em;">DNP (Do Not Populate)</div>':""}
      ${En([["Value",r],["Footprint",a.split(":").pop()||a]])}
      ${l}
      ${u}
    </div>`}function kE(t,e){let s=String(t.kind||"").toLowerCase(),r=s.startsWith("pin");if(s==="component"||s.includes("symbol"))return`
      ${Fn("Component",t.reference||t.componentDesignator||"Unknown","#3b82f6")}
      ${En([["Value",t.value||t.componentValue||"Not specified"],["Footprint",t.componentFootprint||t.footprint||"Not specified"],["Library",t.libraryRef||"Not specified"],["UID",t.componentUid||t.uuid||t.sourceId||"Not resolved"]])}
      <div class="selection-section">
        <span class="selection-section-title">Schematic placement</span>
        ${En([["Page",e?.name||"Unknown"],["Sheet",t.sheetInstancePath||"/"]])}
      </div>`;let n=r?[["Symbol",t.reference||t.designator||"Unknown"],["Value",t.value||t.componentValue||"Not specified"],["Pin",`${t.pinNumber||"-"}${t.pinName?` ${t.pinName}`:""}`],["Net",t.netName||"Not connected"],["PCB Pad",t.pcbPadId||"Not resolved"],["Component UID",t.componentUid||"Not resolved"]]:[["Page",e?.name||"Unknown"],["Kind",t.kind.replaceAll("_"," ")],["Net",t.netName||"Not connected"]];return`
    ${Fn(t.kind.replaceAll("_"," "),t.pinName||t.reference||t.designator||t.text||t.netName||"Schematic object","#3b82f6")}
    ${En(n)}
    <div class="selection-section">
      <span class="selection-section-title">Source identity</span>
      <div class="selection-table">
        <div class="selection-row">
          <span><strong>${r?"Pin UUID":"UUID"}</strong></span>
          <span title="${z(t.uuid||t.sourceId||"")}">${z(t.uuid||t.sourceId||"-")}</span>
          <span title="${z(t.objectId||"")}">${z(t.objectId||"No object ID")}</span>
        </div>
        <div class="selection-row">
          <span><strong>Sheet</strong></span>
          <span>${z(e?.name||"Unknown")}</span>
          <span title="${z(t.sheetInstancePath||"")}">${z(t.sheetInstancePath||"/")}</span>
        </div>
      </div>
    </div>`}function et(){if(St(),E.workspace==="bom"){re.hidden=!0,re.innerHTML="";return}let t=M.scene.features.get(E.selectedFeatureId),e=t?.kind==="component"?t:null,s=E.workspace==="schematic"?E.selectedSchematicFeature:null,r=s?V.byId.get(s.pageId):null,a=E.activeNetId?M.scene.nets.find(f=>Number(f.id)===E.activeNetId):null;if(!a&&s&&(s.netUid?a=M.scene.nets.find(f=>f.uid===s.netUid):s.netName&&(a=ns(M.scene.nets,s.netName))),!e&&s){let f=s.reference||s.componentDesignator||s.designator;f&&(e=M.scene.componentFeatures.get(f)||{designator:f})}if(!e&&!a&&!s){re.hidden=!0,re.innerHTML="";return}let n="";if(a)n=vE(a);else if(e){let f=s?.kind?.startsWith("pin")?s:null;n=xE(e,f)}else s&&(n=kE(s,r));re.innerHTML=`
    ${n}
    <div class="selection-card-actions">
      ${a?`
        <button type="button" data-action="isolate" aria-keyshortcuts="I" title="Toggle isolated net view (I)" class="${E.isolateNet?"active":""}">Isolate</button>
        <button type="button" data-action="net-layers">Layers</button>
      `:""}
      <button type="button" data-action="frame">Frame selection</button>
    </div>`,re.hidden=!1;let i=E.workspace==="schematic"?Ge:D,o=E.selectionAnchor,c=re.offsetWidth||360,l=re.offsetHeight||330;if(o){let f=Math.max(16,i.clientWidth-c-24),b=Math.max(16,i.clientHeight-l-24);re.style.left=`${de(o.x+18,16,f)}px`,re.style.top=`${de(o.y+18,16,b)}px`}else re.style.left="20px",re.style.top="20px";if(re.querySelector(".selection-card-close").addEventListener("click",Pe),re.querySelector("[data-action=frame]").addEventListener("click",bc),a){let f=re.querySelector("[data-action=isolate]");f&&f.addEventListener("click",()=>{qs(!E.isolateNet)});let b=re.querySelector("[data-action=net-layers]");b&&b.addEventListener("click",dc),re.querySelectorAll(".pin-row-interactive").forEach(g=>{g.addEventListener("click",()=>{let p=g.dataset.ref,d=g.dataset.pin;if(!p)return;let y=((M.topology.net_details?.[a.uid]||{}).terminals||[]).find(v=>v.designator===p&&v.pin===d),w=P1(y);w?gs(w,!0):fc(p,!0)})})}let u=re.querySelector(".net-ref-interactive");u&&u.addEventListener("click",()=>{let f=u.dataset.netName;if(!f)return;let b=ns(M.scene.nets,f);b&&uc(Number(b.id),!0)})}function bc(){if(E.workspace==="schematic"){pb();return}let t=M.scene.features.get(E.selectedFeatureId);if(t?.bounds)pc(t);else{let e=M.scene.nets.find(s=>Number(s.id)===E.activeNetId);e?.boundsMm&&U.frame(hc(ac(ws(e.boundsMm))))}}function Mb(){D.addEventListener("contextmenu",t=>t.preventDefault()),D.addEventListener("pointerdown",t=>{if(k){k.framed=!0;let e=t.button===0?Ho(t):null;if(e&&k.routeMode&&k.move.allowed&&!t.shiftKey){Lp(t,{harness:e.tube.harness,kind:"segment",id:e.tube.id,fromMm:e.pointMm}),D.setPointerCapture(t.pointerId);return}k.harnessClick=e}E.dragging=!0,E.lastX=t.clientX,E.lastY=t.clientY,E.pointerStartX=t.clientX,E.pointerStartY=t.clientY,E.dragMode=E.mode==="layer"||t.shiftKey||t.button!==0?"pan":"orbit",D.setPointerCapture(t.pointerId)}),D.addEventListener("pointermove",t=>{if(k?.harnessDrag&&Dp(t))return;if(!E.dragging){Ak(t);return}let e=t.clientX-E.lastX,s=t.clientY-E.lastY;E.lastX=t.clientX,E.lastY=t.clientY,E.dragMode==="pan"?U.pan(e,s,D.clientHeight,E.mode==="layer"):U.orbit(e,s)}),D.addEventListener("pointerup",async t=>{if(k?.harnessDrag){zp(t),D.hasPointerCapture?.(t.pointerId)&&D.releasePointerCapture(t.pointerId);return}if(E.dragging=!1,D.releasePointerCapture(t.pointerId),Math.hypot(t.clientX-E.pointerStartX,t.clientY-E.pointerStartY)>=3){k&&(k.harnessClick=null);return}let e=k?.harnessClick||null;if(k&&(k.harnessClick=null),e){jp({harness:e.tube.harness,kind:"segment",id:e.tube.id,pointMm:e.pointMm},t.shiftKey);return}E.clickSelect&&(t.button===0?await tp(t):t.button===2&&await TE(t))}),D.addEventListener("pointercancel",()=>{Vs(),E.dragging=!1,k&&(k.harnessClick=null)}),D.addEventListener("dblclick",async t=>{E.clickSelect&&(k&&Ho(t)||(await tp(t),bc()))}),D.addEventListener("wheel",t=>{k&&(k.framed=!0),t.preventDefault(),Math.abs(t.deltaX)>Math.abs(t.deltaY)*.4?U.pan(-t.deltaX,0,D.clientHeight,E.mode==="layer"):U.dolly(t.deltaY,E.mode==="layer")},{passive:!1}),window.addEventListener("keydown",Rb),EE()}function EE(){let t=!1,e,s,r=0,a=0;re.addEventListener("pointerdown",n=>{if(!n.target.closest(".selection-card-head")||n.target.closest(".selection-card-close"))return;t=!0,re.classList.add("dragging");let o=re.getBoundingClientRect();r=o.left,a=o.top,e=n.clientX,s=n.clientY,re.setPointerCapture(n.pointerId),n.stopPropagation()}),re.addEventListener("pointermove",n=>{if(!t)return;let i=n.clientX-e,o=n.clientY-s,c=E.workspace==="schematic"?Ge:D,l=re.offsetWidth||360,u=re.offsetHeight||330,f=Math.max(16,c.clientWidth-l-24),b=Math.max(16,c.clientHeight-u-24),g=de(r+i,16,f),p=de(a+o,16,b);re.style.left=`${g}px`,re.style.top=`${p}px`,E.selectionAnchor={x:g-18,y:p-18},n.stopPropagation()}),re.addEventListener("pointerup",n=>{t&&(t=!1,re.classList.remove("dragging"),re.releasePointerCapture(n.pointerId),n.stopPropagation())})}function ME(){hs("[data-workspace]").forEach(t=>{t.addEventListener("click",()=>Sb(t.dataset.workspace))})}function Sb(t){if(t==="schematic"&&!F||t==="bom"&&!ct)return;E.workspace=t,Et.classList.remove("workspace-pcb","workspace-schematic","workspace-bom","workspace-stackup"),Et.classList.add(`workspace-${t}`),(t==="schematic"&&(E.activeTab==="view"||E.activeTab==="inspect"||E.activeTab==="stats")||t==="bom"||t==="stackup")&&Pn("layers");let e=ee('.rail-tab[data-tab="layers"]');e&&(t==="schematic"?(e.textContent="Pages",e.title="Schematic pages"):t==="bom"?(e.textContent="Summary",e.title="BoM summary"):(e.textContent="Layers",e.title="Layers and compare"));let s=t==="schematic",r=t==="bom",a=t==="stackup";if(D.hidden=s||r||a,Ge&&(Ge.hidden=!s),Mn&&(Mn.hidden=!s||!te),Sn&&(Sn.hidden=!s),Tn&&(Tn.hidden=!r),Ve&&(Ve.hidden=!a),ze.hidden=s||r||a,An.hidden=s||r||a,Or&&(Or.hidden=!s),hs("[data-workspace]").forEach(n=>{n.classList.toggle("active",n.dataset.workspace===t)}),jn.textContent=r?"Semantic BoM active":s?te?"SVG DOM + WebGPU schematic world active":"WebGPU schematic world active":a?"Layer Stackup active":"WebGPU semantic glTF active",s&&!V.fitted&&(F.resize(),F.frameWorld(),V.fitted=!0),!s&&!r&&!a&&(M.renderer?.resize(),E.mode==="layer"&&oc()),a)try{BE()}catch(n){console.error("Failed to render stackup workspace",n),Ve&&(Ve.innerHTML=`
          <div class="selection-empty" style="padding:40px;text-align:center;">
            Stackup view failed to render. ${z(n?.message||String(n))}
          </div>
        `)}cc(),et()}function SE(){Ge.addEventListener("pointerdown",t=>{te?.worldActive||te?.active||(E.schematicDragging=!0,E.schematicLastX=t.clientX,E.schematicLastY=t.clientY,E.schematicStartX=t.clientX,E.schematicStartY=t.clientY,Ge.setPointerCapture(t.pointerId))}),Ge.addEventListener("pointermove",t=>{if(te?.worldActive||te?.active||!E.schematicDragging||!F)return;let e=t.clientX-E.schematicLastX,s=t.clientY-E.schematicLastY;E.schematicLastX=t.clientX,E.schematicLastY=t.clientY,F.pan(e,s)}),Ge.addEventListener("pointerup",async t=>{if(!(te?.worldActive||te?.active)&&(E.schematicDragging=!1,Ge.releasePointerCapture(t.pointerId),Math.hypot(t.clientX-E.schematicStartX,t.clientY-E.schematicStartY)<3)){let e=await F.pickFeature(t.clientX,t.clientY);e?uE(e):Kr()}}),Ge.addEventListener("dblclick",t=>{if(te?.worldActive||te?.active)return;let e=F.hitPage(t.clientX,t.clientY);e&&Mt(e.id,!0)}),Ge.addEventListener("wheel",t=>{te?.worldActive||te?.active||(t.preventDefault(),F.zoom(t.deltaY,t.clientX,t.clientY))},{passive:!1})}function Zh(t,e=11,s=32){let r=ss(t,Xe),a=ss([t[0]+1e-4,t[1],t[2]],Xe),n=ss([t[0],t[1]+1e-4,t[2]],Xe);if(!r||!a||!n)return null;let i=Math.max(Math.hypot(a.x-r.x,a.y-r.y),Math.hypot(n.x-r.x,n.y-r.y))/1e-4;if(!(i>0))return null;let o=e/i,c=[];for(let l=0;l<s;l++){let u=2*Math.PI*l/s,f=ss([t[0]+o*Math.cos(u),t[1]+o*Math.sin(u),t[2]],Xe);if(!f)return null;c.push(f)}return{centre:r,ring:c}}function zo(t,e){if(!fe||!D)return null;let s=D.getBoundingClientRect(),r=(t-s.left)/s.width*2-1,a=1-(e-s.top)/s.height*2;return Hu(fe.matrix,r,a)}var ep=0;async function tp(t){if(!fe)return;let e=++ep,s=D.getBoundingClientRect();E.selectionAnchor={x:t.clientX-s.left,y:t.clientY-s.top};let r=await Tb(t);if(e===ep){if(k){$1(r);return}(r.kind==="feature"||r.kind==="board")&&(E.selectedOccurrence=r.occurrenceIndex),r.featureId?gs(r.featureId,!0):Pe()}}async function TE(t){if(!fe||!Rn)return;let e=await Tb(t),s=k?k.placements.get(e.occurrenceKey)?.board:M;if(!s)return;let r=s.scene.features.get(e.featureId),a=Gs(r),n=a?$o(a,s):null;Rn({clientX:t.clientX,clientY:t.clientY,reference:a||void 0,value:String(n?.value||r?.value||"")||void 0})}function Tb(t){let e=D.getBoundingClientRect();return Ab((t.clientX-e.left)*D.width/e.width,(t.clientY-e.top)*D.height/e.height)}async function Ab(t,e){if(k){let r=await X1(t,e);if(r?.kind!=="analytic"||!r.renderer)return r;let a=qe().find(i=>i.renderer===r.renderer);if(!a?.analytic)return r;let n=await ln(a.analytic,r.operationIndex)||await Io(a.analytic,r.operationIndex,a.scene);return{...r,featureId:n||null}}let s=await AE(t,e);if(s?.kind==="analytic"&&M.analytic){let r=await ln(M.analytic,s.operationIndex)||await Io(M.analytic,s.operationIndex,M.scene);return{...s,featureId:r||null}}return s}function AE(t,e){return M.renderer.pick(fe,t,e,{activeNetId:E.activeNetId,selectedFeatureId:E.selectedFeatureId,layerOffsets:Br(),visibleLayers:E.mode==="3d"?M.visible3dLayers:M.compareLayers,showBoard:E.showBoard,showComponents:E.showComponents,componentOpacity:de(1-E.separation/.1,0,1),boardOpacity:1-E.separation*.72,isolateNet:E.isolateNet,compareMode:E.mode==="layer",compareOffsets:rs,visibleTileIds:E.mode==="3d"?M.visibleTileIds:null})}async function _b(t,e){if(!fe||!(k||M.renderer))return null;let s=D.getBoundingClientRect(),r=await Ab((t-s.left)*D.width/s.width,(e-s.top)*D.height/s.height),a=k?k.placements.get(r.occurrenceKey)?.board:M,n=r.featureId&&a?qp(a.scene.features.get(r.featureId),a):null;return{...r,renderer:void 0,selection:n}}function Ib(t,e,s){let r=t.scene.componentFeatures.get(String(e)),a=r?t.scene.features.get(Number(r.featureId))?.bounds:null;if(!a)return null;let n=a[2]+a[5]>=0;return s([(a[0]+a[3])/2,(a[1]+a[4])/2,n?a[5]:a[2]])}function ss(t,e){if(!fe)return null;let s=xa(fe.matrix,Ei(e,t),fe.viewport);if(!s)return null;let r=D.getBoundingClientRect();return{x:r.left+s.x*r.width/D.width,y:r.top+s.y*r.height/D.height}}function _E(t,e){if(!k||!D)return null;let s=D.getBoundingClientRect(),r=(t-s.left)/s.width*2-1,a=1-(e-s.top)/s.height*2,n=Vu(U,r,a,s.width/Math.max(s.height,1)),i=k.placed.filter(c=>c.primitives&&c.occurrence.pickSurface).map(c=>({key:c.occurrence.path,matrix:c.matrix,primitives:c.primitives})),o=Wu(i,n);return o?{occurrence:o.key,pointMm:o.point.map(c=>c/Zo),normal:o.normal,toCamera:n.direction.map(c=>-c)}:null}function Rb(t){if(!zn())return;if(Jc(t)){t.key==="Escape"&&t.target instanceof HTMLInputElement&&t.target.blur();return}if(Qc(t))return;let e=t.key.toLowerCase();if(E.workspace==="schematic"){if(e==="/")t.preventDefault(),Pn("search"),Te.querySelector("#entity-search")?.focus();else if(e==="escape")V.activeNetUid?(V.activeNetUid="",E.activeNetId=0,F.activeNetUid="",te?.setHighlightedNet(""),et()):Kr();else if(e==="~"||t.key==="~"){t.preventDefault();let s=E.selectedSchematicFeature?.netUid;s&&(V.activeNetUid===s?(V.activeNetUid="",E.activeNetId=0,F.activeNetUid="",te?.setHighlightedNet("")):hb(s,E.selectedSchematicFeature))}else if(e==="home")F?.frameWorld();else if(e==="[")kn("previous");else if(e==="]")kn("next");else if(e==="n"){t.preventDefault();let s=F?.cycleNetIntrasheetLink(t.shiftKey?-1:1);s?.pageId&&(E.selectedPageId=s.pageId,F.selectedPageId=s.pageId,Cb())}else if(t.altKey&&e==="arrowup")kn("parent");else if(t.key.startsWith("Arrow")){t.preventDefault();let s=t.key==="ArrowRight"?32:t.key==="ArrowLeft"?-32:0,r=t.key==="ArrowDown"?32:t.key==="ArrowUp"?-32:0;F?.pan(s,r)}return}if(k&&kk(t,e)){t.preventDefault();return}if(e==="/")t.preventDefault(),Pn("search"),Te.querySelector("#entity-search").focus();else if(e==="escape")Pe();else if(e==="i"&&E.workspace==="pcb"&&Hs())t.preventDefault(),qs(!E.isolateNet);else if(e==="home")U.frame(k&&k.bounds||as());else if(e==="`")sb(!E.showStats);else if(["x","y","z"].includes(e))U.setAxis(e,t.shiftKey);else if(e==="f")U.flip();else if(e==="r")U.rotateZ(t.shiftKey?-1:1);else if(e===" "){t.preventDefault();let s=M.scene.features.get(E.selectedFeatureId);s?.bounds&&U.setFocus([(s.bounds[0]+s.bounds[3])/2,(s.bounds[1]+s.bounds[4])/2,(s.bounds[2]+s.bounds[5])/2])}else if(t.key.startsWith("Arrow")){t.preventDefault();let s=t.key==="ArrowRight"?32:t.key==="ArrowLeft"?-32:0,r=t.key==="ArrowDown"?32:t.key==="ArrowUp"?-32:0;U.pan(s,r,D.clientHeight,E.mode==="layer")}}function Pn(t){E.activeTab=t,Et.classList.remove("panel-collapsed"),hs(".rail-tab").forEach(e=>{e.classList.toggle("active",e.dataset.tab===t)}),hs(".tab-panel").forEach(e=>{e.classList.toggle("active",e.dataset.panel===t)})}function Nb(){let t=ze.getContext("2d");t.clearRect(0,0,ze.width,ze.height);let e=[ze.width/2,ze.height/2],s=U.basis(),r=[{axis:"x",label:"X",color:"#e23838",vector:[1,0,0]},{axis:"y",label:"Y",color:"#2dbd50",vector:[0,1,0]},{axis:"z",label:"Z",color:"#3157d5",vector:[0,0,1]}],a=[];for(let n of r)for(let i of[-1,1]){let o=n.vector.map(l=>l*i),c=[Go(o,s.right),-Go(o,s.up),Go(o,s.back)];a.push({...n,sign:i,depth:c[2],point:[e[0]+c[0]*34,e[1]+c[1]*34]})}for(let n of r){let i=a.find(o=>o.axis===n.axis&&o.sign===1);t.strokeStyle=n.color,t.lineWidth=2.4,t.beginPath(),t.moveTo(...e),t.lineTo(...i.point),t.stroke()}_n=[];for(let n of a.sort((i,o)=>o.depth-i.depth)){let i=n.sign===1,o=i?13:9;t.beginPath(),t.arc(n.point[0],n.point[1],o,0,Math.PI*2),t.fillStyle=i?n.color:`${n.color}66`,t.fill(),t.lineWidth=2,t.strokeStyle=NE(n.color,i?.45:.58),t.stroke(),i&&(t.fillStyle="#07101c",t.font="700 13px system-ui",t.textAlign="center",t.textBaseline="middle",t.fillText(n.label,n.point[0],n.point[1]+.5)),_n.push({...n,radius:o+5})}}function Bb(){!ze||ze.dataset.bound==="true"||(ze.dataset.bound="true",ze.addEventListener("click",t=>{let e=ze.width/ze.clientWidth,s=ze.height/ze.clientHeight,r=[t.offsetX*e,t.offsetY*s],a=_n.map(n=>({item:n,distance:Math.hypot(r[0]-n.point[0],r[1]-n.point[1])})).filter(({item:n,distance:i})=>i<=n.radius).sort((n,i)=>n.distance-i.distance)[0]?.item;a&&U.setAxis(a.axis,a.sign<0)}))}function IE(){if(E.mode!=="layer"||!fe){An.innerHTML="";return}let t=as(),e=Qp();An.innerHTML=M.scene.copperLayers.filter(s=>e.has(Number(s.id))).map(s=>{let r=rs.get(Number(s.id))||[0,0,0],a=RE([t[0]+r[0],t[4]+r[1],0],fe.matrix,D.clientWidth,D.clientHeight);return!a||a[0]<-100||a[0]>D.clientWidth+100||a[1]<-100||a[1]>D.clientHeight+100?"":`<span style="left:${a[0]}px;top:${a[1]}px">${z(s.name)}</span>`}).join("")}function Cb(){if(E.workspace!=="schematic"||!F){Or.innerHTML="";return}Or.innerHTML=V.visiblePages.filter(t=>F.pagePixelWidth(t)>120).map(t=>{let[e,s]=F.worldToScreen(t.worldX+8*F.scale,t.worldY-6*F.scale),r=t.id===E.selectedPageId,n=V.activeNetUid&&t.netUids.includes(V.activeNetUid)?"#18ef52":r?"#3b82f6":"#4b8de8";return`<div class="schematic-page-label" style="left:${e}px;top:${s}px;border-left-color:${n}">
        <strong>${z(t.name)}</strong>
        <small>Page ${t.sheetNumber} &middot; ${t.featureCount.toLocaleString()} features</small>
      </div>`}).join("")}function RE(t,e,s,r){let a=t[0],n=t[1],i=t[2],o=e[0]*a+e[4]*n+e[8]*i+e[12],c=e[1]*a+e[5]*n+e[9]*i+e[13],l=e[3]*a+e[7]*n+e[11]*i+e[15];return Math.abs(l)<1e-8?null:[(o/l*.5+.5)*s,(.5-c/l*.5)*r]}function Go(t,e){return t[0]*e[0]+t[1]*e[1]+t[2]*e[2]}function NE(t,e){let s=t.replace("#","");return`#${[0,2,4].map(r=>Math.round(parseInt(s.slice(r,r+2),16)*e).toString(16).padStart(2,"0")).join("")}`}function qo(t,e){E.frameSamples.push({intervalMs:t,cpuMs:e}),E.frameSamples.length>180&&E.frameSamples.shift()}function sp(t,e){if(!t.length)return 0;let s=[...t].sort((r,a)=>r-a);return s[Math.min(s.length-1,Math.floor((s.length-1)*e))]}function Wo(t){if(!wn||(E.frames+=1,t-E.fpsAt<=500))return;E.fps=E.frames*1e3/(t-E.fpsAt);let e=E.frameSamples;if(E.frameIntervalMs=e.length?e.reduce((n,i)=>n+i.intervalMs,0)/e.length:0,E.frameCpuMs=e.length?e.reduce((n,i)=>n+i.cpuMs,0)/e.length:0,E.frameIntervalP95Ms=sp(e.map(n=>n.intervalMs),.95),E.frameCpuP95Ms=sp(e.map(n=>n.cpuMs),.95),E.frames=0,E.fpsAt=t,rb(),E.workspace==="bom"){let n=ct?.payload?.counts||{},i=[["Renderer","BoM DOM table"],["Schema",ct?.payload?.schema||"-"],["Grouped rows",n.rows||0],["Components",n.components||0],["DNP components",n.dnpComponents||0],["Extra columns",ct?.payload?.extraColumns?.length||0],["Frame interval",`${E.frameIntervalMs.toFixed(2)} ms avg / ${E.frameIntervalP95Ms.toFixed(2)} p95`],["CPU frame",`${E.frameCpuMs.toFixed(2)} ms avg / ${E.frameCpuP95Ms.toFixed(2)} p95`],["FPS",E.fps.toFixed(1)]];wn.innerHTML=i.map(([o,c])=>`<dt>${o}</dt><dd>${c}</dd>`).join("");return}let s=E.workspace==="schematic"&&F?F.stats():null,r=E.workspace==="schematic"&&te?te.stats():null,a=E.workspace==="schematic"&&F?te?.active?[["Renderer","SVG DOM schematic detail"],["Pages",V.pages.length],["Mounted pages",r.mountedPages],["Active page",r.activePage],["DOM nodes",r.domNodes.toLocaleString()],["Indexed features",r.indexedFeatures.toLocaleString()],["Indexed nets",r.indexedNets.toLocaleString()],["SVG cache",`${r.cachedSvgPages} pages / ${(r.cachedSvgBytes/1048576).toFixed(1)} MB`],["Selection",`${r.selectionMs.toFixed(1)} ms`],["Active net",M.scene.nets.find(n=>n.uid===V.activeNetUid)?.name||"-"],["Tracking links",`${s.netFlowSegments} total / ${s.netFlowIntrasheetSegments} local`],["Tracking verts",s.netFlowVertices.toLocaleString()],["Mount",`${r.mountMs.toFixed(1)} ms`],["Highlight",`${r.highlightMs.toFixed(1)} ms`],["Fallback",r.fallbackReason||"-"],["Frame interval",`${E.frameIntervalMs.toFixed(2)} ms avg / ${E.frameIntervalP95Ms.toFixed(2)} p95`],["CPU frame",`${E.frameCpuMs.toFixed(2)} ms avg / ${E.frameCpuP95Ms.toFixed(2)} p95`],["FPS",E.fps.toFixed(1)]]:[["Renderer",te?"SVG DOM + WebGPU world":"WebGPU schematic world"],["Pages",V.pages.length],["Visible pages",V.visiblePages.length],["DOM pages",r?r.mountedPages:0],["DOM nodes",r?r.domNodes.toLocaleString():"0"],["Indexed SVG features",r?r.indexedFeatures.toLocaleString():"0"],["SVG cache",r?`${r.cachedSvgPages} pages / ${(r.cachedSvgBytes/1048576).toFixed(1)} MB`:"0 pages"],["JS heap",r?.heapMb?`${r.heapMb.toFixed(1)} MB`:"-"],["Hierarchy links",V.manifest.edges?.length||0],["Selected page",V.byId.get(E.selectedPageId)?.name||"-"],["Active net",M.scene.nets.find(n=>n.uid===V.activeNetUid)?.name||"-"],["Tracking links",`${s.netFlowSegments} total / ${s.netFlowIntrasheetSegments} local`],["Downloaded",`${(F.downloadedBytes/1048576).toFixed(1)} MB`],["Resident vectors",`${(s.residentVectorBytes/1048576).toFixed(1)} MB`],["Vector pages",`${s.vectorChunks} loaded / ${s.vectorLoads} loading`],["Vector draw",`${s.vectorVertices.toLocaleString()} verts / ${s.vectorDrawChunks} chunks`],["Native detail",`${s.nativeDetailPages} pages @ ${s.nativePxPerMm} / ${s.nativeThresholdPxPerMm} px/mm`],["Vector failures",s.failedVectorChunks],["Truncated",s.truncatedVectors],["Frame interval",`${E.frameIntervalMs.toFixed(2)} ms avg / ${E.frameIntervalP95Ms.toFixed(2)} p95`],["CPU frame",`${E.frameCpuMs.toFixed(2)} ms avg / ${E.frameCpuP95Ms.toFixed(2)} p95`],["FPS",E.fps.toFixed(1)]]:[["Renderer","WebGPU semantic glTF"],["Mode",E.mode==="3d"?"3D":"Layer Compare"],["Visible layers",E.mode==="3d"?M.visible3dLayers.size:M.compareLayers.size],["Resident tiles",M.scene.loaded.size],["Loading tiles",M.scene.loading.size],["Failed tiles",M.scene.failed.size],["Triangles",Math.round(M.triangles).toLocaleString()],["Downloaded",`${(M.loadedBytes/1048576).toFixed(1)} MB`],["Resident GLB",`${(M.residentTileBytes/1048576).toFixed(1)} MB`],["Resident GPU",`${(M.residentTileGpuBytes/1048576).toFixed(1)} MB`],["Tile loads",M.tileLoads.toLocaleString()],["Tile evictions",M.tileEvictions.toLocaleString()],["Tile scheduler",`${M.tileSchedulerMs.toFixed(2)} ms`],["Active net",M.scene.nets.find(n=>Number(n.id)===E.activeNetId)?.name||"-"],["Frame interval",`${E.frameIntervalMs.toFixed(2)} ms avg / ${E.frameIntervalP95Ms.toFixed(2)} p95`],["CPU frame",`${E.frameCpuMs.toFixed(2)} ms avg / ${E.frameCpuP95Ms.toFixed(2)} p95`],["FPS",E.fps.toFixed(1)]];wn.innerHTML=a.map(([n,i])=>`<dt>${n}</dt><dd>${i}</dd>`).join("")}function qn(t){return`rgb(${t.slice(0,3).map(e=>Math.round(e*255)).join(" ")})`}function BE(){if(!Ve)return;let t=M.scene.layers||[];if(!t.length){Ve.innerHTML='<div class="selection-empty" style="padding:40px;text-align:center;">No stackup information available for this board.</div>';return}let e=t.filter(I=>["copper","dielectric","paste","silkscreen","soldermask"].includes(I.role)),s=M.topology.board?.stackup||{},r=I=>{if(I==null||I==="")return"None";let L=String(I);return z(L.includes(".")?L.split(".").pop():L)},a=(I,L=4)=>{let K=Number(I);return Number.isFinite(K)&&K>0?K.toFixed(L):"-"},n=(I,L=3)=>{let K=Number(I);return Number.isFinite(K)?K.toFixed(L):"-"},i=I=>{if(I==null||I==="")return"No";if(typeof I=="boolean")return I?"Yes":"No";let L=String(I).trim().toLowerCase(),K=L.includes(".")?L.split(".").pop():L;return["0","false","no","n","off","none"].includes(K)?"No":(["1","true","yes","y","on"].includes(K),"Yes")},o=I=>({copper:"Copper",dielectric:"Dielectric",paste:"Paste",silkscreen:"Silkscreen",soldermask:"Solder mask"})[I]||String(I||"Layer"),c=I=>I.role!=="dielectric"?"":I.type==="core"?"Core":I.type==="prepreg"||(I.material||"").toLowerCase().includes("prepreg")?"Prepreg":"Core",l=(I,L=4)=>{let K=Number(I.thickness_mm);return Number.isFinite(K)&&K>0?`${K.toFixed(L)} mm`:"Not specified"},u=I=>{let L=o(I.role),K=String(I.material||"").trim(),Y=K&&K.toLowerCase()!==String(I.role||"").toLowerCase();if(I.role==="dielectric"){let ge=[Y?K:"",a(I.epsilon_r,3)!=="-"?`\u03B5r ${a(I.epsilon_r,3)}`:"",a(I.loss_tangent,4)!=="-"?`tan \u03B4 ${a(I.loss_tangent,4)}`:""].filter(Boolean).join(" \xB7 ");return{primary:`${I.name} \xB7 ${c(I)}`,secondary:ge}}return{primary:[I.name,L,Y?K:""].filter(Boolean).join(" \xB7 "),secondary:""}},f=0,b=0,g=0,p=0;e.forEach(I=>{p+=I.thickness_mm||0,I.role==="copper"?I.name.toLowerCase().includes("gnd")||I.name.toLowerCase().includes("pwr")||I.name.toLowerCase().includes("plane")?b++:f++:I.role==="dielectric"&&g++});let d=M.scene.copperLayers||[],m=0,h=0,y=0,w=[...(M.scene.manifest?.barrels||[]).filter(I=>I.kind==="via"),...[...M.scene.features.values()].filter(I=>I.kind==="via")],v=Bu(d,w);m=v.counts.thru,h=v.counts.blind,y=v.counts.buried;let x=v.spans,S=30,T=S,A=[],_=new Map(e.map((I,L)=>[I,L])),N=CE(e),B=(I,L)=>{let K=N.get(I.name);if(K!==void 0)return K;let Y=Number(I.stack_index);return Number.isFinite(Y)?Y:L+1e5},C=[...e].sort((I,L)=>{let K=B(I,_.get(I)||0),Y=B(L,_.get(L)||0);return K!==Y?K-Y:(L.z_mm||0)-(I.z_mm||0)});C.forEach(I=>{let L=12;I.role==="dielectric"?L=Math.max(160,Math.min(360,(I.thickness_mm||.1)*140)):I.role==="copper"?L=22:I.role==="soldermask"&&(L=14),A.push({...I,svgY:T,svgHeight:L}),T+=L});let R=800,O=130,P=240,H=O+P+16,Q=H+84,pe="";A.forEach(I=>{let L=I.color||"#7f7f7f";I.role==="copper"?L=I.color||"#f97316":I.role==="dielectric"?L="#a98d5c":I.role==="paste"?L="#cbd5e1":I.role==="soldermask"?L="#1b4332":I.role==="silkscreen"&&(L="#e2e8f0");let K=d.findIndex(Ub=>Ub.name===I.name),Y=u(I),ge=I.svgY+I.svgHeight/2,ve=!!Y.secondary&&I.svgHeight>=38,lt=ve?ge-5:ge+3,ys=z(I.id),mt=z(I.name),G=Number.isFinite(Number(I.thickness_mm))&&Number(I.thickness_mm)>0,ne=z(G?l(I):"\u2014"),tt=z([Y.primary,Y.secondary,`Thickness ${l(I)}`].filter(Boolean).join("; "));pe+=`
      <g class="stackup-svg-layer" data-layer-id="${ys}" data-layer-name="${mt}">
        <title>${tt}</title>
        <rect x="${O}" y="${I.svgY}" width="${P}" height="${I.svgHeight}" fill="${L}" opacity="0.85" rx="1"/>
        <text x="${O-8}" y="${I.svgY+I.svgHeight/2+3}" fill="var(--muted)" font-size="9px" text-anchor="end" font-weight="700">
          ${I.role==="copper"?K+1:""}
        </text>
        <path class="stackup-layer-dimension" d="M ${H+6} ${I.svgY+1} H ${H} V ${I.svgY+I.svgHeight-1} H ${H+6}" />
        <text class="stackup-layer-thickness" x="${H+10}" y="${ge+3}" fill="var(--muted)" font-size="8.5px" font-weight="650">
          ${ne}
        </text>
        <text class="stackup-layer-name" x="${Q}" y="${lt}" fill="var(--foreground)" font-size="9px" font-weight="650">
          ${z(Y.primary)}
        </text>
        ${ve?`<text class="stackup-layer-metadata" x="${Q}" y="${ge+10}" fill="var(--muted)" font-size="8px">${z(Y.secondary)}</text>`:""}
      </g>
    `});let ae="",me=A.filter(I=>I.role==="copper");x.forEach((I,L)=>{let K=A.find(G=>G.name===I.startName),Y=A.find(G=>G.name===I.endName);if(!K||!Y)return;let ge=K.svgY,ve=Y.svgY+Y.svgHeight,lt=O+(L+1)*P/(x.length+1),ys=I.type==="thru"?"Thru":I.type==="blind"?"Blind":"Buried",mt=`var(--stackup-via-${I.type})`;ae+=`
      <g class="stackup-svg-via" data-via-type="${I.type}">
        <title>${ys}: ${I.startName} \u2192 ${I.endName}</title>
        ${me.map(G=>G.svgY>=K.svgY&&G.svgY<=Y.svgY?`<rect x="${lt-5}" y="${G.svgY}" width="10" height="${G.svgHeight}" fill="${mt}" rx="0.5" />`:"").join("")}
        <rect x="${lt-2}" y="${ge}" width="4" height="${ve-ge}" fill="${mt}" opacity="0.95" />
        <rect x="${lt-.75}" y="${ge-1}" width="1.5" height="${ve-ge+2}" fill="var(--panel)" opacity="0.9" />
      </g>
    `});let Ae=`
    <svg class="stackup-visual-svg" viewBox="0 0 ${R} ${T+10}" width="${R}" height="${T+10}">
      <g class="stackup-svg-column-headings" aria-hidden="true">
        <text x="${H+10}" y="15">Thickness</text>
        <text x="${Q}" y="15">Layer / material properties</text>
      </g>
      <g class="stackup-total-dimension" aria-label="Total board thickness ${p.toFixed(4)} millimetres">
        <path d="M 76 ${S} H 68 V ${T} H 76" />
        <text x="68" y="15">Total ${p.toFixed(4)} mm</text>
      </g>
      ${pe}
      ${ae}
    </svg>
    <div class="stackup-via-legend" aria-label="Via span legend">
      <span><i data-via-type="thru"></i>Thru</span>
      <span><i data-via-type="blind"></i>Blind</span>
      <span><i data-via-type="buried"></i>Buried</span>
    </div>
  `,be="";C.forEach(I=>{let L="silk";I.role==="copper"?L="copper":I.role==="dielectric"?L="dielectric":I.role==="paste"?L="paste":I.role==="soldermask"&&(L="mask");let K=c(I),Y=z(I.id),ge=z(I.name),ve=u(I);be+=`
      <tr data-layer-id="${Y}" data-layer-name="${ge}" tabindex="0" aria-label="${z(`${ve.primary}; thickness ${l(I)}`)}">
        <td><strong>${ge}</strong></td>
        <td><span class="stackup-badge ${L}">${I.role}</span></td>
        <td>${K||"-"}</td>
        <td>${z(I.material||"-")}</td>
        <td>${I.role==="dielectric"?a(I.epsilon_r,3):"-"}</td>
        <td>${I.role==="dielectric"?a(I.loss_tangent,4):"-"}</td>
        <td>${I.thickness_mm?I.thickness_mm.toFixed(4)+" mm":"-"}</td>
      </tr>
    `});let _e="",ye=M.topology.board?.net_classes||[],Le=I=>{let L=n(I);return L==="-"?L:`${L} mm`};ye.length?ye.forEach(I=>{_e+=`
        <tr>
          <td><strong>${I.name}</strong></td>
          <td>${Le(I.track_width)}</td>
          <td>${Le(I.clearance)}</td>
          <td>${Le(I.diff_pair_width)}</td>
          <td>${Le(I.diff_pair_gap)}</td>
          <td>${Number.isFinite(Number(I.via_diameter))?`${n(I.via_drill)}/${n(I.via_diameter)} mm`:"-"}</td>
        </tr>
      `}):_e=`
      <tr>
        <td colspan="6" class="selection-empty" style="text-align: center;">No design rules or impedance classes defined.</td>
      </tr>
    `,Ve.innerHTML=`
    <div class="stackup-header">
      <div class="stackup-header-title">
        <h1>Layer Stackup</h1>
        <p>Board cross-section profile, layer properties & design rules</p>
      </div>
    </div>

    <div class="stackup-workspace-body">
      <div class="stackup-diagram-card">
        <span class="stackup-section-title">Cross-Section Profile</span>
        ${Ae}
      </div>
      <aside class="stackup-side-panel">
      <div class="stackup-summary-grid">
        <div class="stackup-summary-card">
          <label>Total Thickness</label>
          <span>${p.toFixed(4)} mm</span>
        </div>
        <div class="stackup-summary-card">
          <label>Copper Layers</label>
          <span>${d.length} (${f} Sig / ${b} Plane)</span>
        </div>
        <div class="stackup-summary-card">
          <label>Dielectrics</label>
          <span>${g} Layers</span>
        </div>
        <div class="stackup-summary-card">
          <label>Thru Vias</label>
          <span>${m}</span>
        </div>
        <div class="stackup-summary-card">
          <label>Blind Vias</label>
          <span>${h}</span>
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
          <span>${r(s.copper_finish)}</span>
        </div>
        <div class="stackup-summary-card">
          <label>Edge Connector</label>
          <span>${i(s.edge_connector)}</span>
        </div>
        <div class="stackup-summary-card">
          <label>Castellated Holes</label>
          <span>${i(s.castellated_pads)}</span>
        </div>
        <div class="stackup-summary-card">
          <label>Edge Plating</label>
          <span>${i(s.edge_plating)}</span>
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
                ${be}
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
                ${_e}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      </aside>
    </div>
  `;let Ie=(I,L)=>{Ve.querySelectorAll(".stackup-svg-layer").forEach(K=>{let Y=K.dataset.layerId===I;K.classList.toggle("active",Y&&L)}),Ve.querySelectorAll(".stackup-table tbody tr[data-layer-id]").forEach(K=>{let Y=K.dataset.layerId===I;K.classList.toggle("active",Y&&L)})},Ws=I=>{let L=Ve.querySelector(".stackup-diagram-card"),K=Ve.querySelector(`.stackup-svg-layer[data-layer-id="${CSS.escape(I)}"]`);if(!L||!K||L.scrollHeight<=L.clientHeight)return;let Y=L.getBoundingClientRect(),ge=K.getBoundingClientRect(),ve=L.scrollTop+ge.top-Y.top-(L.clientHeight-ge.height)/2,lt=window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;L.scrollTo({top:Math.max(0,ve),behavior:lt?"auto":"smooth"})},ms=(I,{revealDiagram:L=!1}={})=>{I.forEach(K=>{let Y=()=>{let ve=K.dataset.layerId;Ie(ve,!0),L&&Ws(ve)},ge=()=>Ie(null,!1);K.addEventListener("mouseenter",Y),K.addEventListener("mouseleave",ge),L&&(K.addEventListener("focus",Y),K.addEventListener("blur",ge))})};ms(Ve.querySelectorAll(".stackup-svg-layer")),ms(Ve.querySelectorAll(".stackup-table tbody tr[data-layer-id]"),{revealDiagram:!0})}function CE(t){let e=t.filter(a=>a.role==="dielectric");if(!(e.length===1&&e[0]?.name==="Board"))return new Map;let r=new Map;return["F.SilkS","F.Paste","F.Mask","F.Cu","Board","B.Cu","B.Mask","B.Paste","B.SilkS"].forEach((a,n)=>r.set(a,n)),r}function Ob({observed:t,intersecting:e,active:s}){return t?!!e:!!s}function Fb({shown:t,mounted:e,isCurrent:s}){return!!t&&!!e&&typeof s=="function"&&!s()}function Pb(){let t=null;return{begin(){return t?.abort(),t=new AbortController,t},owns(e){return e!==null&&e===t&&!e.signal.aborted},cancel(){t?.abort(),t=null}}}async function jb(t,e,{owner:s,bundleUrl:r,loadBundle:a,now:n=()=>performance.now()}){let i=n(),o={},{signal:c}=e,l=()=>s.owns(e)&&t.isConnected;try{t.renderLoading();let u=n(),{bundle:f,topology:b,semanticGeometry:g,assetCache:p}=await a(r,o,c);if(o.bundle_group_total_ms=n()-u,!l())return;t.renderShell();let d=n(),m=await t.mountViewer({topology:b,semanticGeometry:g,readiness:f.readiness,assetCache:p,signal:c});if(!l()){m?.dispose?.();return}t.publishController(m),o.mount_and_first_frame_ms=n()-d,Object.assign(o,m?.performance||{}),o.reload_to_visible_ms=n()-i,t.emitReady({schema:"prism.semantic_viewer_performance.a0",milestone:"board-visible",readiness_stage:f.readiness?.stage||"semantic-ready",readiness_progress:f.readiness?.progress??100,timings:o})}catch(u){if(!l())return;t.renderError(u),t.emitError(u)}}function OE(){return`
    <style>
      ${Sc}
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
      /* System mode (SB2-31f): board labels, the move gizmo and the key list. */
      #system-labels { position: absolute; inset: 0; z-index: 2; pointer-events: none; overflow: hidden; }
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
      /* Harness handles and flags (4c): an overlay projected every frame. */
      #harness-overlay { position: absolute; inset: 0; z-index: 3; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
      #harness-overlay[hidden] { display: none; }
      #harness-overlay .harness-handle { pointer-events: all; cursor: pointer; }
      #harness-overlay .handle-body { fill: #fff; stroke: #0f172a; stroke-width: 1.5; }
      #harness-overlay .handle-dot { fill: #0f172a; pointer-events: none; }
      #harness-overlay .harness-handle.auto .handle-body { fill: rgb(255 255 255 / 0.8); stroke-dasharray: 3 2; }
      #harness-overlay .handle-halo { fill: none; stroke: #38bdf8; stroke-width: 3; opacity: 0.9; }
      #harness-overlay .harness-flag { pointer-events: none; }
      #harness-overlay .flag-ring { fill: rgb(220 38 38 / 0.12); stroke: #dc2626; stroke-width: 2; stroke-dasharray: 4 3; }
      #harness-overlay .flag-pill { fill: #dc2626; }
      #harness-overlay .flag-label { fill: #fff; font: 600 10px system-ui, -apple-system, "Segoe UI", sans-serif; }
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
        <div id="system-labels" hidden></div>
        <svg id="move-gizmo" hidden aria-hidden="true"></svg>
        <svg id="harness-overlay" hidden aria-hidden="true"></svg>
        <dl id="system-help" hidden aria-label="Keyboard shortcuts">
          <h2>Keyboard</h2>
          <dt><kbd>Home</kbd> <kbd>A</kbd></dt><dd>Frame every board</dd>
          <dt><kbd>Double-click</kbd></dt><dd>Select and frame</dd>
          <dt><kbd>X</kbd> <kbd>Y</kbd> <kbd>Z</kbd></dt><dd>Look along an axis (Shift: from the other side)</dd>
          <dt><kbd>F</kbd> <kbd>R</kbd></dt><dd>Flip the view, turn it a quarter</dd>
          <dt><kbd>I</kbd></dt><dd>Isolate the lit nets' copper, or back</dd>
          <dt><kbd>M</kbd></dt><dd>Move mode on or off (editors)</dd>
          <dt><kbd>L</kbd></dt><dd>Gizmo axes: world or the board's own</dd>
          <dt><kbd>Shift</kbd></dt><dd>While dragging: the fine steps</dd>
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
  `}async function FE(t,e=null,s="fetch",r=void 0){let a=performance.now(),n=await fetch(t,{cache:"no-store",signal:r});if(!n.ok)throw new Error(`Failed to load ${t}: ${n.status}`);let i=await n.json();return e&&(e[`${s}_fetch_parse_ms`]=performance.now()-a,e[`${s}_content_length`]=Number(n.headers.get("content-length")||0)),i}async function Lb(t,e,s){let r=new URL(t,document.baseURI).toString(),a=new URL(r).searchParams.get("viewer")||"",n=Xr.open(),i=await n.peekJson(r).catch(()=>null),o=!!i;i||(i=await FE(r,e,"bundle",s),Qn(i)&&n.store(r,new TextEncoder().encode(JSON.stringify(i)))),e&&(e.bundle_from_cache=o);let c=Qn(i)&&n.enabled?n:null;if(i.schema!==xc)throw new Error(`Unsupported visualizer bundle schema: ${i.schema||"missing"}`);let l={analytic:!0,cache_key:i.cache_key||"",readiness:i.readiness,assets:i.assets||{}};return{bundle:i,topology:{},semanticGeometry:Nc(l,r,i,a),assetCache:c}}var Wn=class extends HTMLElement{static get observedAttributes(){return["bundle-url","workspace","mode","move-allowed","active"]}constructor(){super(),this.attachShadow({mode:"open"}),this.reloadOwner=Pb(),this.reloadQueued=!1,this.reloadSource=null;let e=no();this.modes=Object.freeze({board:new qa(e),system:new Wa(e)}),this.mounted=null,this.intersecting=!1,this.visibilityObserver=null}get activeMode(){return this.mounted??(this.systemMode?this.modes.system:this.modes.board)}detachModes(){this.modes.board.detach(),this.modes.system.detach(),this.mounted=null}connectedCallback(){this.#e(),this.queueReload()}disconnectedCallback(){this.visibilityObserver?.disconnect(),this.visibilityObserver=null,this.intersecting=!1,this.reloadOwner.cancel(),this.detachModes(),this.reloadSource=null}#e(){this.visibilityObserver||typeof IntersectionObserver!="function"||(this.visibilityObserver=new IntersectionObserver(e=>{let s=e[e.length-1];s&&(this.intersecting=s.isIntersecting,s.isIntersecting&&this.queueReload())}),this.visibilityObserver.observe(this))}get shown(){return Ob({observed:!!this.visibilityObserver,intersecting:this.intersecting,active:this.getAttribute("active")==="true"})}attributeChangedCallback(e,s,r){if(!(!this.isConnected||s===r)){if(e==="workspace"){this.modes.board.setWorkspace(this.workspace);return}if(e==="move-allowed"){this.modes.system.setMoveAllowed(r==="true");return}if(e==="active"){r==="true"&&this.queueReload();return}this.queueReload()}}get workspace(){return this.getAttribute("workspace")==="stackup"?"stackup":"pcb"}get systemMode(){return this.getAttribute("mode")==="system"}queueReload(){let e=this.systemMode?"system":this.getAttribute("bundle-url");if(!e)return;let s=Fb({shown:this.shown,mounted:this.mounted,isCurrent:()=>this.mounted?.attachedPort?.isCurrent?.()??!0});e===this.reloadSource&&!s||(this.reloadSource=e,!this.reloadQueued&&(this.reloadQueued=!0,queueMicrotask(()=>{this.reloadQueued=!1,this.isConnected&&this.reload()})))}async reload(){let e=this.getAttribute("bundle-url"),s=this.reloadOwner.begin();if(this.detachModes(),this.systemMode){await this.reloadSystem(s);return}if(!e){this.shadowRoot.innerHTML="<style>:host{display:block;height:100%;font:14px system-ui;color:#94a3b8}</style><div>Semantic bundle URL is missing.</div>";return}await jb(this,s,{owner:this.reloadOwner,bundleUrl:e,loadBundle:Lb})}async reloadSystem(e){let{signal:s}=e,r=()=>this.reloadOwner.owns(e)&&this.isConnected;try{this.renderShell();let a=await mp({root:this.shadowRoot,loadBundle:(i,o)=>Lb(i,null,o),isActive:()=>this.getAttribute("active")==="true",onSelectionChange:i=>{s.aborted||this.emit("selectionchange",{selection:i})},onContextMenu:i=>{s.aborted||this.emit("contextmenu",i)},onViewStateChange:i=>{s.aborted||this.emitViewState(i)},onEmphasis:i=>{s.aborted||this.emit("emphasis",{results:i})},onMove:i=>{s.aborted||this.emit("move",i)},onHarness:i=>{if(s.aborted||!i)return;let{type:o,...c}=i;o==="select"?this.emit("harness-select",c):o==="drag"&&this.emit("harness-drag",c)}});if(!r()){a?.dispose?.();return}this.mounted=this.modes.system,this.mounted.attach(a,{moveAllowed:this.getAttribute("move-allowed")==="true"});let n=this.getViewState();n&&this.emitViewState(n),this.emitReady({schema:"prism.semantic_viewer_performance.a0",milestone:"system-mounted"})}catch(a){if(!r())return;this.renderError(a),this.emitError(a)}}emit(e,s){this.dispatchEvent(new CustomEvent(`prism-semantic-viewer:${e}`,{bubbles:!0,composed:!0,detail:s}))}renderLoading(){this.shadowRoot.innerHTML='<style>:host{display:block;height:100%;background:#020817;color:#e5e7eb;font:14px system-ui}</style><div style="display:grid;place-items:center;height:100%">Loading semantic visualizer...</div>'}renderShell(){this.shadowRoot.innerHTML=OE()}renderError(e){console.error(e),this.shadowRoot.innerHTML=`
      <style>
        :host{display:block;height:100%;background:#020817;color:#e5e7eb;font:14px system-ui}
        .error{height:100%;display:grid;place-items:center;padding:24px}
        pre{max-width:100%;white-space:pre-wrap;color:#fecaca;background:#111827;border:1px solid #374151;padding:16px}
      </style>
      <div class="error"><pre>${z(e?.stack||e?.message||String(e))}</pre></div>
    `}mountViewer({topology:e,semanticGeometry:s,readiness:r,assetCache:a=null,signal:n}){return hp({root:this.shadowRoot,topology:e,semanticGeometry:s,readiness:r,workspaceScope:"3d",assetCache:a,isActive:()=>this.getAttribute("active")==="true",onSelectionChange:i=>{n.aborted||this.dispatchEvent(new CustomEvent("prism-semantic-viewer:selectionchange",{bubbles:!0,composed:!0,detail:{selection:i}}))},onContextMenu:i=>{n.aborted||this.dispatchEvent(new CustomEvent("prism-semantic-viewer:contextmenu",{bubbles:!0,composed:!0,detail:i}))},onViewStateChange:i=>{n.aborted||this.emitViewState(i)},onPerformanceEvent:i=>{n.aborted||(console.info("[prism-3d-perf]",i),this.dispatchEvent(new CustomEvent("prism-semantic-viewer:performance",{bubbles:!0,composed:!0,detail:i})))}})}publishController(e){this.mounted=this.modes.board,this.mounted.attach(e,{workspace:this.workspace});let s=this.getViewState();s&&this.emitViewState(s)}emitViewState(e){this.dispatchEvent(new CustomEvent("prism-semantic-viewer:viewstatechange",{bubbles:!0,composed:!0,detail:e}))}emitReady(e){console.info("[prism-3d-perf]",e),this.dispatchEvent(new CustomEvent("prism-semantic-viewer:ready",{bubbles:!0,composed:!0,detail:e}))}emitError(e){this.dispatchEvent(new CustomEvent("prism-semantic-viewer:error",{bubbles:!0,detail:{error:e}}))}};sf(Wn.prototype);function Db(){customElements.get("prism-semantic-viewer")||customElements.define("prism-semantic-viewer",Wn)}window.__PRISM_SEMANTIC_VIEWER_MANUAL_BOOT__=!0;Db();
