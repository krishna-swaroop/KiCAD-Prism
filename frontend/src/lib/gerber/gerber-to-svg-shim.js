// Load the pre-bundled browser build and re-export the function it defines.
// The bundle ends with `//# sourceMappingURL=...` on the last code line, which
// would comment-out a trailing `return` — strip it first.
import src from 'gerber-to-svg/dist/gerber-to-svg.min.js?raw'

const gerberToSvg = new Function(
  src.replace(/\/\/# sourceMappingURL=.*$/, '') + '\nreturn gerberToSvg;'
)()
export default gerberToSvg
