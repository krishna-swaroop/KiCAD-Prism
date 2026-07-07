export function svgToImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const encoded = 'data:image/svg+xml,' + encodeURIComponent(svg)
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load SVG as image'))
    img.src = encoded
  })
}
