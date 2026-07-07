declare module './gerber-to-svg-shim.js' {
  const gerberToSvg: (
    source: string,
    options: Record<string, unknown>,
    done: (err: Error | null, svg: string) => void,
  ) => { viewBox: number[] }
  export default gerberToSvg
}
