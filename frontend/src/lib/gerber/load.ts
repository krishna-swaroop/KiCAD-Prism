import whatsThatGerber from 'whats-that-gerber'
import gerberToSvg from './gerber-to-svg-shim.js'
import type { GerberLayer, GerberSide, GerberType } from './types'

const TYPE_COLORS: Record<NonNullable<GerberType>, string> = {
  copper: '#f59e0b',
  soldermask: '#22c55e',
  silkscreen: '#ffffff',
  solderpaste: '#94a3b8',
  drill: '#ef4444',
  outline: '#64748b',
  drawing: '#a78bfa',
}

const SIDE_ORDER: Record<NonNullable<GerberSide>, number> = {
  all: 0,
  top: 1,
  inner: 2,
  bottom: 3,
}

const TYPE_Z: Record<NonNullable<GerberType>, number> = {
  outline: 0,
  copper: 1,
  soldermask: 2,
  silkscreen: 3,
  solderpaste: 4,
  drill: 5,
  drawing: 6,
}

function makeLabel(type: GerberType, side: GerberSide, basename: string): string {
  const sideStr =
    side === 'top' ? 'Top' : side === 'bottom' ? 'Bottom' : side === 'inner' ? 'Inner' : ''
  const typeStr =
    type === 'copper'
      ? 'Copper'
      : type === 'soldermask'
        ? 'Solder Mask'
        : type === 'silkscreen'
          ? 'Silkscreen'
          : type === 'solderpaste'
            ? 'Paste'
            : type === 'drill'
              ? 'Drills'
              : type === 'outline'
                ? 'Outline'
                : type === 'drawing'
                  ? 'Drawing'
                  : 'Unknown'

  // For drill/drawing/outline types without a clear side, use the filename
  // stem directly so "NPTH", "drl_map" etc. show as meaningful names.
  if (!sideStr && (type === 'drill' || type === 'drawing')) {
    const stem = basename.replace(/\.[^.]+$/, '') // strip extension
    // Strip common board-name prefix: everything up to and including the last '-'
    const parts = stem.split('-')
    const meaningful = parts.length > 1 ? parts.slice(1).join('-') : stem
    return meaningful
  }

  return sideStr ? `${sideStr} ${typeStr}` : typeStr
}

function convertOne(
  text: string,
  id: string,
  color: string,
): Promise<{ svg: string; viewBox: [number, number, number, number] }> {
  return new Promise((resolve, reject) => {
    const converter = gerberToSvg(
      text,
      // Pass color as SVG attribute so drawImage on canvas renders it correctly
      // (canvas doesn't inherit CSS `color: currentColor`)
      { id, attributes: { color, fill: color, stroke: color } },
      (err: Error | null, svgString: string) => {
        if (err) { reject(err); return }

        const vb = converter.viewBox as number[]
        if (!vb || vb.length < 4 || vb[2] === 0 || vb[3] === 0) {
          reject(new Error('empty'))
          return
        }
        resolve({
          svg: svgString,
          viewBox: [vb[0], vb[1], vb[2], vb[3]],
        })
      },
    )
  })
}

export function unionViewBox(
  layers: Pick<GerberLayer, 'viewBox'>[],
): [number, number, number, number] {
  if (layers.length === 0) return [0, 0, 0, 0]
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const { viewBox: [x, y, w, h] } of layers) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + w)
    maxY = Math.max(maxY, y + h)
  }
  return [minX, minY, maxX - minX, maxY - minY]
}

export async function loadGerberLayers(
  files: Record<string, string>,
): Promise<GerberLayer[]> {
  // Normalise Windows backslashes so whatsThatGerber can extract the basename
  const normalised: Record<string, string> = {}
  for (const [k, v] of Object.entries(files)) {
    normalised[k.replace(/\\/g, '/')] = v
  }

  const filenames = Object.keys(normalised)
  const identified = whatsThatGerber(filenames)
  const results: GerberLayer[] = []

  await Promise.all(
    filenames.map(async (filename, idx) => {
      const props = identified[filename] ?? { type: null, side: null }
      let { type, side } = props

      // Drill-map files (e.g. *-drl_map.gbr, *-NPTH-drl_map.gbr) are gerber
      // drawings of the drill pattern, not Excellon drill files. Reclassify.
      const basename = filename.split('/').pop() ?? filename
      const basenameLower = basename.toLowerCase()

      // Drill-map files are gerber drawings of the drill pattern, not Excellon.
      if (type === 'drill' && basenameLower.includes('drl_map')) {
        type = 'drawing'
        side = 'all'
      }

      if (type === null) return

      const id = `layer-${idx}`
      const color = TYPE_COLORS[type] ?? '#ffffff'

      try {
        const { svg, viewBox } = await convertOne(normalised[filename], id, color)
        results.push({
          id,
          filename,
          type,
          side,
          label: makeLabel(type, side, basename),
          color,
          svg,
          viewBox,
        })
      } catch (e) {
        if (e instanceof Error && e.message === 'empty') return
      }
    }),
  )

  // Sort: by side order then z-order within side
  results.sort((a, b) => {
    const sideA = SIDE_ORDER[a.side ?? 'all'] ?? 0
    const sideB = SIDE_ORDER[b.side ?? 'all'] ?? 0
    if (sideA !== sideB) return sideA - sideB
    return (TYPE_Z[a.type ?? 'drawing'] ?? 0) - (TYPE_Z[b.type ?? 'drawing'] ?? 0)
  })

  return results
}
