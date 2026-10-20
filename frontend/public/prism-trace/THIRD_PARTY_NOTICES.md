# Third-party notices

MuTracer is released under the MIT License (see [`LICENSE`](./LICENSE)). It
includes or adapts the following third-party work. License texts are in
[`LICENSES/`](./LICENSES) unless noted otherwise.

## TinyBVH

The WebAssembly BVH builder (`src/tinybvh/`) wraps
[jbikker/tinybvh](https://github.com/jbikker/tinybvh) at commit
`0e4584287823252cf83f0e9cd072848bec5f79c5`. The JavaScript binned SAH builder
(`src/renderer/binnedSahBvh.ts`) is ported from TinyBVH's reference builder
(`BVH::Build`) at the same commit.

Copyright (c) 2024-2026 Jacco Bikker / Breda University of Applied Sciences.
MIT License. The license text is at
[`src/tinybvh/LICENSE`](./src/tinybvh/LICENSE) and is copied next to
`tinybvh.wasm` in published builds.

## Adobe OpenPBR BSDF

The opaque-dielectric energy lookup tables (`src/renderer/openPbrEnergyLut.ts`)
and parts of the energy-conserving rough diffuse, GGX spherical-cap VNDF
sampling, thin-film Airy interference and thin-wall implementations in the
OpenPBR shader chunks are adapted from
[adobe/openpbr-bsdf](https://github.com/adobe/openpbr-bsdf) at commit
`9edf806740d2140846d9bef76e4342fc458e2ef5`.

The F82 saturation, coat passage absorption, directional-energy partition,
base albedo, internal-reflection darkening, independent coat-frame layering
and coat/thin-film IOR resolution
helpers additionally adapt
`impl/openpbr_lobe_utils.h`, `impl/openpbr_coating_lobe.h`, and
`impl/openpbr_bsdf.h` at commit `c91aad1d1ce1693e803f039d7c92c2965c4eb013`.

The ideal-metal direction/average energy tables and multiple-scattering lobe
additionally adapt `impl/openpbr_microfacet_multiple_scattering_lobes.h`,
`impl/openpbr_microfacet_multiple_scattering_data.h`, and
`impl/data/openpbr_ideal_metal_{,avg_}energy_complement_data.h` at the same
`c91aad1d1ce1693e803f039d7c92c2965c4eb013` commit. Directional tables use
row-normalized encoding; metal and ideal-dielectric averages retain exact u16
values in compact rows. The uniform-hemisphere proposal is mixed within the
existing metal sampling lobe.

The ideal-dielectric reflection/transmission multiple-scattering lobe and
three additional tables adapt the same commit's
`impl/openpbr_microfacet_multiple_scattering_lobes.h`,
`impl/openpbr_microfacet_multiple_scattering_data.h`, and
`impl/data/openpbr_ideal_dielectric_{energy_complement,avg_energy_complement,reflection_ratio}_data.h`.
They are translated to WGSL/GLSL and appended to the shared row-normalized
texture; each average uses a repeated degenerate row to retain small u16
values. The reference hemisphere-ratio proposal shares the existing
transmission-lobe interval and direction random dimensions; the combined
response and PDF are evaluated together. This addition is restricted to
solid transmissive materials, preserves the renderer's exact null boundary,
and retains the reference's isotropic alpha and scale factors.

Copyright 2026 Adobe. Apache License 2.0
([`LICENSES/Apache-2.0.txt`](./LICENSES/Apache-2.0.txt)). Modified for WGSL and
GLSL; this repository re-quantized the Adobe energy lookup data to 8-bit
row-normalized values with 16-bit row minimum/maximum headers. Encoded rows
are stored as reversible differences from the preceding row, then Base64. The upstream
project has no NOTICE file.

## GLSL-PathTracer

The PCG random number generator in the `rand` shader chunks, and parts of the
original GLSL path tracing structure, are adapted from
[knightcrawler25/GLSL-PathTracer](https://github.com/knightcrawler25/GLSL-PathTracer).
The generator in that project credits Moroz Mykhailo
([Shadertoy wltcRS](https://www.shadertoy.com/view/wltcRS)).

Copyright (c) 2019 Asif Ali. MIT License
([`LICENSES/GLSL-PathTracer-MIT.txt`](./LICENSES/GLSL-PathTracer-MIT.txt)).

## ZetaRay

The histogram auto exposure pass (`src/renderer/WGPUAutoExposure.ts`) is
adapted from [alipbcs/ZetaRay](https://github.com/alipbcs/ZetaRay).

Copyright (c) 2023-2024 Ali Behnoudfar. MIT License
([`LICENSES/ZetaRay-MIT.txt`](./LICENSES/ZetaRay-MIT.txt)).


## KinoBloom

The bloom prefilter's median filter follows
[keijiro/KinoBloom](https://github.com/keijiro/KinoBloom).

Copyright (c) 2015-2017 Keijiro Takahashi. MIT License
([`LICENSES/KinoBloom-MIT.txt`](./LICENSES/KinoBloom-MIT.txt)).

## Intel Open Image Denoise weights

The `.tza` files in [`oidn/weights/`](./oidn/weights) are also distributed in the separate `oidn-weights@2.3.0-1` package,
with standard/small included in mutracer. They are trained weights from
[Intel Open Image Denoise](https://github.com/OpenImageDenoise/oidn).

Copyright Intel Corporation. Apache License 2.0
([`oidn/weights/LICENSE.txt`](./oidn/weights/LICENSE.txt)). Denoising runs
through the [`oidn-web`](https://www.npmjs.com/package/oidn-web) package, which
carries its own license.

## pbrt-v4 ZSobol

The ZSobol digit permutation walk in `src/renderer/{wgsl,glsl}/chunks/sobol.*`,
its permutation table in `src/renderer/sampling.ts`, and the test reference
adapt `ZSobolSampler::GetSampleIndex` from
[pbrt-v4](https://github.com/mmp/pbrt-v4/blob/master/src/pbrt/samplers.h).
Copyright (c) 1998-2020 Matt Pharr, Wenzel Jakob, and Greg Humphreys.
Apache License 2.0 ([`LICENSES/Apache-2.0.txt`](./LICENSES/Apache-2.0.txt)).
Modified for 32-bit tiled WGSL and GLSL ES 3.00. The upstream project has no
NOTICE file. Owen scrambling follows Burley's 2020 paper.

## GitHub Octicons

The GitHub icon in `viewer/src/components/Toolbar.tsx` is adapted from
[`mark-github-16.svg`](https://github.com/primer/octicons/blob/main/icons/mark-github-16.svg)
in [GitHub Octicons](https://github.com/primer/octicons).

Copyright (c) 2026 GitHub Inc. MIT License
([`LICENSES/Octicons-MIT.txt`](./LICENSES/Octicons-MIT.txt)).

## ray-tracing-renderer

Parts of the original renderer are adapted from
[hoverinc/ray-tracing-renderer](https://github.com/hoverinc/ray-tracing-renderer),
npm version 0.10.15. Copyright (c) 2019 HOVER. MIT License
([`LICENSES/RayTracingRenderer-MIT.txt`](./LICENSES/RayTracingRenderer-MIT.txt)).

The adapted files under `src/renderer/` include:

- `TileRender.ts`, `envMapDistribution.ts`,
  `mergeMeshesToGeometry.ts`, `envMapCreation.ts`, `MaterialTable.ts`,
  `texturesFromMaterials.ts`, `util.ts`, and parts of
  `WGPURenderingPipeline.ts` / `WebGLRenderingPipeline.ts`.
- `glsl/chunks/{intersect,envMap,rayTraceCore,materialBuffer,textureLinear,common,sampleShadowCatcher}.glsl.ts`,
  `glsl/rayTrace.frag.ts`, and `glsl/shadowCatcher.frag.ts`.
- WGSL ports: `wgsl/chunks/{intersect,envMap,materialBuffer,sampleShadowCatcher}.wgsl.ts`
  and `wgsl/rayTrace.compute.ts`.

## Bundled dependencies (dist/ only)

The standalone `dist/mutracer.{es,umd}.js` builds and their chunks bundle these
MIT-licensed dependencies. The `lib/` ESM modules keep npm dependency imports.

- [gl-matrix](https://github.com/toji/gl-matrix): Copyright (c) 2015-2025,
  Brandon Jones, Colin MacKenzie IV.
  [`LICENSES/GlMatrix-MIT.txt`](./LICENSES/GlMatrix-MIT.txt).
- [webgpu-utils](https://github.com/greggman/webgpu-utils): Copyright (c) 2022
  Gregg Tavares.
  [`LICENSES/WebGPUUtils-MIT.txt`](./LICENSES/WebGPUUtils-MIT.txt).
- [oidn-web](https://github.com/pissang/oidn-web): Copyright (c) 2024 pissang.
  [`LICENSES/OIDNWeb-MIT.txt`](./LICENSES/OIDNWeb-MIT.txt).

The optional TinyBVH wasm is inlined in the standalone build. Its copyright
and MIT license are described in the TinyBVH section above; the full text is
also included in [`LICENSES/TinyBVH-MIT.txt`](./LICENSES/TinyBVH-MIT.txt).
These license files are copied without modification from the installed
packages and the checked-in TinyBVH license.
