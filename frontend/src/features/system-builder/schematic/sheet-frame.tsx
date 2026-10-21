/**
 * The sheet's screen-space chrome in the documents' look: the drawing frame,
 * the title block at the bottom right and the heading at the top left. It is
 * an overlay, not part of the zoomable SVG, so panning and zooming leave it
 * where the mockup puts it.
 */
import { COLOURS } from "./sheet-style";

const DISPLAY = "PrismDisplay, PrismBody, ui-monospace, monospace";
const BODY = "PrismBody, ui-monospace, SFMono-Regular, Menlo, monospace";

export interface SheetChromeProps {
  /** The system's name. */
  system: string;
  /** Its document version, when loaded. */
  version?: number;
  /** `Root`, or the board sheet's name. */
  sheet: string;
  /** The design bundle's key; the title block shows its first 16 characters. */
  bundleKey?: string;
  /** The counts line under the heading. */
  counts: string;
}

function TitleRow({ label, value, first = false }: { label: string; value: string; first?: boolean }) {
  return (
    <div
      className="flex items-baseline justify-between gap-3 px-[9px] py-[5px]"
      style={{ borderTop: first ? undefined : `0.6px solid ${COLOURS.rule}` }}
    >
      <span style={{ fontSize: 9, color: COLOURS.muted }}>{label}</span>
      <span className="truncate" style={{ fontSize: 11 }} title={value}>{value}</span>
    </div>
  );
}

export function SheetChrome({ system, version, sheet, bundleKey, counts }: SheetChromeProps) {
  const systemValue = version === undefined ? system : `${system} v${version}`;
  const bundle = bundleKey ? bundleKey.slice(0, 16) : "—";
  return (
    <div className="pointer-events-none absolute inset-0 z-10" style={{ fontFamily: BODY, color: COLOURS.ink }} data-testid="sheet-chrome">
      <div className="absolute" style={{ inset: 24, border: `1.6px solid ${COLOURS.ink}` }} />
      <div className="absolute" style={{ left: 48, top: 34, maxWidth: "calc(100% - 120px)" }}>
        <div className="truncate" style={{ fontFamily: DISPLAY, fontSize: 22, lineHeight: 1.1 }}>{system}</div>
        <div className="truncate" style={{ fontSize: 11, color: COLOURS.muted, marginTop: 6 }}>{counts}</div>
      </div>
      <div
        className="absolute overflow-hidden"
        style={{
          right: 24,
          bottom: 24,
          width: "min(340px, calc(100% - 48px))",
          background: COLOURS.white,
          border: `1.6px solid ${COLOURS.ink}`,
        }}
        data-testid="sheet-title-block"
      >
        <div className="truncate" style={{ fontFamily: DISPLAY, fontSize: 13, padding: "8px 9px 7px", borderBottom: `1.1px solid ${COLOURS.ink}` }}>
          {`${system} · System schematic`}
        </div>
        <TitleRow label="System" value={systemValue} first />
        <TitleRow label="Sheet" value={sheet} />
        <TitleRow label="Bundle" value={bundle} />
      </div>
    </div>
  );
}
