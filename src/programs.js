/**
 * @file The WGSL the composite verbs cannot do without: the pass-through vertex
 * stage and the flat texture program.
 * @module webgpu.tree/programs
 * @license AGPL-3.0-only
 *
 * Nothing here is exported by the package: a hero authors its own WGSL. These
 * are the twin's two supplied programs, the pair `idiom`'s `program` and
 * `image` reach through the backend.
 *
 * WGSL has no include: a shader module carries every entry point that runs in
 * it, and its varyings are matched by location and type, not by a shared
 * header. So a caller's fragment source is *appended* to `PASS_VERT` — one
 * module, two entry points — unless the source already brings a `@vertex` stage
 * of its own, which is then used as it is. That is how `createProgram(ctx, frag)`
 * carries the twin's vertex stage beside the caller's fragment: by module
 * concatenation, not by a shared module, so the backend interface needs no
 * change for it.
 *
 * `QUAD` is the covering geometry `idiom` creates through `createBuffer`, and
 * `QUAD_LAYOUT` the vertex layout its arrays imply — derived from the same
 * arrays shape, so the pass pipelines and the geometry cannot disagree.
 *
 * The gizmos' two line programs are here too, and the quads one the handles'
 * dots draw through: `LINE` and `WIDE` (each with and without a colour
 * attribute, because a pipeline bakes its vertex layout), and `TRIS`. Their
 * layouts are the generator arrays' shapes, non-interleaved — one buffer per
 * attribute, so a gizmo's per-frame update is a write, not a rebuild.
 */

'use strict';

import { createBufferLayoutsFromArrays } from 'webgpu-utils';

/**
 * The fullscreen pass's vertex stage: `aPosition` through in NDC, `aTexCoord`
 * as `vTexCoord`, with v = 0 at the **top** of the target — WebGPU's texture
 * space is top-down, so a pass that samples its input at `vTexCoord` reads the
 * target upright with no flip.
 */
export const PASS_VERT = `
struct PassOut {
  @builtin(position) position: vec4f,
  @location(0) vTexCoord: vec2f,
};

@vertex
fn vs(@location(0) aPosition: vec2f, @location(1) aTexCoord: vec2f) -> PassOut {
  var v: PassOut;
  v.position = vec4f(aPosition, 0.0, 1.0);
  v.vTexCoord = vec2f(aTexCoord.x, 1.0 - aTexCoord.y);
  return v;
}
`;

/**
 * The flat texture / colour program behind `image`: `uModelViewProjectionMatrix`
 * rects the covering quad in NDC, `uColor` tints it, `uUseTexture` selects the
 * texture — the three names `idiom`'s `image` uploads.
 */
export const FLAT = `
struct Flat {
  uModelViewProjectionMatrix: mat4x4f,
  uColor: vec4f,
  uUseTexture: f32,
};

@group(0) @binding(0) var<uniform> u: Flat;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

struct FlatOut {
  @builtin(position) position: vec4f,
  @location(0) vTexCoord: vec2f,
};

@vertex
fn vs(@location(0) aPosition: vec2f, @location(1) aTexCoord: vec2f) -> FlatOut {
  var v: FlatOut;
  v.position = u.uModelViewProjectionMatrix * vec4f(aPosition, 0.0, 1.0);
  v.vTexCoord = vec2f(aTexCoord.x, 1.0 - aTexCoord.y);
  return v;
}

@fragment
fn fs(@location(0) vTexCoord: vec2f) -> @location(0) vec4f {
  let texel = textureSample(uTexture, uSampler, vTexCoord);
  return select(u.uColor, texel * u.uColor, u.uUseTexture > 0.5);
}
`;

/** The covering quad `idiom` hands `createBuffer`: two triangles in NDC, aTexCoord with v = 0 at the bottom. */
export const QUAD = {
  aPosition: { numComponents: 2, data: [-1, -1, 1, -1, -1, 1, 1, 1] },
  aTexCoord: { numComponents: 2, data: [0, 0, 1, 0, 0, 1, 1, 1] },
  indices: [0, 1, 2, 2, 1, 3],
};

/** The vertex buffers a pass pipeline declares — the layout `QUAD`'s arrays imply. */
export const QUAD_LAYOUT = createBufferLayoutsFromArrays(QUAD).bufferLayouts;

/** The plain line pipe: `uPV` · `uModel` · `uColor`, a line list of `aPosition`. */
export const LINE = `
struct LineU {
  uPV: mat4x4f,
  uModel: mat4x4f,
  uColor: vec4f,
  uUseColor: f32,
};
@group(0) @binding(0) var<uniform> u: LineU;

struct LineOut {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
};

@vertex
fn vs(@location(0) aPosition: vec3f) -> LineOut {
  var v: LineOut;
  v.position = u.uPV * u.uModel * vec4f(aPosition, 1.0);
  v.color = u.uColor;
  return v;
}

@fragment
fn fs(@location(0) color: vec4f) -> @location(0) vec4f { return color; }
`;

/** The line pipe where the generator writes a palette: `aColor` wins when `uUseColor`. */
export const LINE_COLOR = `
struct LineU {
  uPV: mat4x4f,
  uModel: mat4x4f,
  uColor: vec4f,
  uUseColor: f32,
};
@group(0) @binding(0) var<uniform> u: LineU;

struct LineOut {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
};

@vertex
fn vs(@location(0) aPosition: vec3f, @location(1) aColor: vec4f) -> LineOut {
  var v: LineOut;
  v.position = u.uPV * u.uModel * vec4f(aPosition, 1.0);
  v.color = select(u.uColor, aColor, u.uUseColor > 0.5);
  return v;
}

@fragment
fn fs(@location(0) color: vec4f) -> @location(0) vec4f { return color; }
`;

/** The wide line pipe: each segment a window-space quad of `uWidth` device pixels. */
export const WIDE = `
struct WideU {
  uPV: mat4x4f,
  uModel: mat4x4f,
  uViewport: vec2f,
  uWidth: f32,
  uColor: vec4f,
  uUseColor: f32,
};
@group(0) @binding(0) var<uniform> u: WideU;

struct WideOut {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
};

@vertex
fn vs(@location(0) aA: vec3f, @location(1) aB: vec3f, @location(2) aT: f32, @location(3) aSide: f32) -> WideOut {
  var v: WideOut;
  let cA = u.uPV * u.uModel * vec4f(aA, 1.0);
  let cB = u.uPV * u.uModel * vec4f(aB, 1.0);
  let halfVp = u.uViewport * 0.5;
  let sA = cA.xy / cA.w * halfVp;
  let sB = cB.xy / cB.w * halfVp;
  let l = length(sB - sA);
  let d = select(vec2f(1.0, 0.0), (sB - sA) / l, l > 0.0);
  let n = vec2f(-d.y, d.x) * (u.uWidth * 0.5 * aSide);
  let c = select(cB, cA, aT < 0.5);
  v.position = c + vec4f(n / halfVp * c.w, 0.0, 0.0);
  v.color = u.uColor;
  return v;
}

@fragment
fn fs(@location(0) color: vec4f) -> @location(0) vec4f { return color; }
`;

/** The wide line pipe where the palette rides the segments: `aColor` per endpoint. */
export const WIDE_COLOR = `
struct WideU {
  uPV: mat4x4f,
  uModel: mat4x4f,
  uViewport: vec2f,
  uWidth: f32,
  uColor: vec4f,
  uUseColor: f32,
};
@group(0) @binding(0) var<uniform> u: WideU;

struct WideOut {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
};

@vertex
fn vs(@location(0) aA: vec3f, @location(1) aB: vec3f, @location(2) aT: f32, @location(3) aSide: f32, @location(4) aColor: vec4f) -> WideOut {
  var v: WideOut;
  let cA = u.uPV * u.uModel * vec4f(aA, 1.0);
  let cB = u.uPV * u.uModel * vec4f(aB, 1.0);
  let halfVp = u.uViewport * 0.5;
  let sA = cA.xy / cA.w * halfVp;
  let sB = cB.xy / cB.w * halfVp;
  let l = length(sB - sA);
  let d = select(vec2f(1.0, 0.0), (sB - sA) / l, l > 0.0);
  let n = vec2f(-d.y, d.x) * (u.uWidth * 0.5 * aSide);
  let c = select(cB, cA, aT < 0.5);
  v.position = c + vec4f(n / halfVp * c.w, 0.0, 0.0);
  v.color = select(u.uColor, aColor, u.uUseColor > 0.5);
  return v;
}

@fragment
fn fs(@location(0) color: vec4f) -> @location(0) vec4f { return color; }
`;

/** The pane's program: a world-space quad, textured or flat, under the six declared transforms' MVP. */
export const PANE = `
struct PaneU {
  uModelViewProjectionMatrix: mat4x4f,
  uColor: vec4f,
  uUseTexture: f32,
};
@group(0) @binding(0) var<uniform> u: PaneU;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

struct PaneOut {
  @builtin(position) position: vec4f,
  @location(0) vTexCoord: vec2f,
};

@vertex
fn vs(@location(0) aPosition: vec3f, @location(1) aTexCoord: vec2f) -> PaneOut {
  var v: PaneOut;
  v.position = u.uModelViewProjectionMatrix * vec4f(aPosition, 1.0);
  v.vTexCoord = aTexCoord;
  return v;
}

@fragment
fn fs(@location(0) vTexCoord: vec2f) -> @location(0) vec4f {
  let texel = textureSample(uTexture, uSampler, vTexCoord);
  return select(u.uColor, texel * u.uColor, u.uUseTexture > 0.5);
}
`;

/** The quads' program behind a handle's dot: the six declared transforms' MVP and a colour. */
export const TRIS = `
struct TrisU {
  uModelViewProjectionMatrix: mat4x4f,
  uColor: vec4f,
};
@group(0) @binding(0) var<uniform> u: TrisU;

@vertex
fn vs(@location(0) aPosition: vec3f) -> @builtin(position) vec4f {
  return u.uModelViewProjectionMatrix * vec4f(aPosition, 1.0);
}

@fragment
fn fs() -> @location(0) vec4f { return u.uColor; }
`;

/** A shape of `numComponents` floats per attribute, for a layout's derivation. @ignore */
const floats = (components) => {
  const shape = {};
  for (const name of Object.keys(components)) shape[name] = { numComponents: components[name], data: new Float32Array(0) };
  return shape;
};

/** The plain line pipe's vertex layout: `aPosition`, one buffer. */
export const LINE_LAYOUT = createBufferLayoutsFromArrays(floats({ aPosition: 3 }), { interleave: false }).bufferLayouts;

/** The coloured line pipe's: `aPosition` then `aColor`, one buffer each. */
export const LINE_COLOR_LAYOUT = createBufferLayoutsFromArrays(floats({ aPosition: 3, aColor: 4 }), { interleave: false }).bufferLayouts;

/** The wide line pipe's layouts: both endpoints, the end and the side, one buffer each. */
export const WIDE_LAYOUT = createBufferLayoutsFromArrays(floats({ aA: 3, aB: 3, aT: 1, aSide: 1 }), { interleave: false }).bufferLayouts;

/** The coloured wide pipe's: the same, and `aColor`. */
export const WIDE_COLOR_LAYOUT = createBufferLayoutsFromArrays(floats({ aA: 3, aB: 3, aT: 1, aSide: 1, aColor: 4 }), { interleave: false }).bufferLayouts;

/** The quads' layout: `aPosition` alone. */
export const TRIS_LAYOUT = LINE_LAYOUT;

/** The pane's layout: a world position and its texture coordinate. */
export const PANE_LAYOUT = createBufferLayoutsFromArrays(floats({ aPosition: 3, aTexCoord: 2 }), { interleave: false }).bufferLayouts;

const VERTEX_ENTRY = /@vertex\s+fn\s+([A-Za-z_][A-Za-z0-9_]*)/;
const FRAGMENT_ENTRY = /@fragment\s+fn\s+([A-Za-z_][A-Za-z0-9_]*)/;

/**
 * The `@vertex` and `@fragment` entry names a WGSL source declares, each the
 * first of its stage; null where there is none.
 * @param {string} code  WGSL source.
 * @returns {{ vertex: string|null, fragment: string|null }}
 * @ignore
 * @example
 * entriesOf(PASS_VERT)   // { vertex: 'vs', fragment: null }
 */
export function entriesOf(code) {
  const v = VERTEX_ENTRY.exec(String(code));
  const f = FRAGMENT_ENTRY.exec(String(code));
  return { vertex: v ? v[1] : null, fragment: f ? f[1] : null };
}

/**
 * The module a pass program compiles: the twin's vertex stage followed by the
 * caller's source, or the caller's source alone where it declares a `@vertex`
 * entry. An explicit `vertex` entry in `opts` means the source carries its own
 * vertex stage, whatever the source's first entry is.
 * @param {string} frag  The caller's WGSL.
 * @param {{ vertex?: string }} [opts]  `vertex`: the source's own vertex entry name.
 * @returns {string} One shader module's source.
 * @ignore
 * @example
 * sourceOf('@fragment fn fs() -> @location(0) vec4f { return vec4f(1); }')   // PASS_VERT + the fragment
 */
export function sourceOf(frag, opts) {
  const o = opts || {};
  const code = String(frag == null ? '' : frag);
  if (o.vertex || entriesOf(code).vertex) return code;
  return PASS_VERT + code;
}
