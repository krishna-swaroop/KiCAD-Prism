export type GerberType =
  | 'copper'
  | 'soldermask'
  | 'silkscreen'
  | 'solderpaste'
  | 'drill'
  | 'outline'
  | 'drawing'
  | null

export type GerberSide = 'top' | 'bottom' | 'inner' | 'all' | null

export interface GerberLayer {
  id: string
  filename: string
  type: GerberType
  side: GerberSide
  label: string
  color: string
  svg: string
  viewBox: [number, number, number, number]
  image?: HTMLImageElement
}
