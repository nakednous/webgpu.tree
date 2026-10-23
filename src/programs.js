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

const VERTEX_ENTRY = /@vertex\s+fn\s+([A-Za-z_][A-Za-z0-9_]*)/;
const FRAGMENT_ENTRY = /@fragment\s+fn\s+([A-Za-z_][A-Za-z0-9_]*)/;

/**
 * The `@vertex` and `@fragment` entry names a WGSL source declares, each the
 * first of its stage; null where there is none.
 * @param {string} code  WGSL source.
 * @returns {{ vertex: string|null, fragment: string|null }}
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
 * @example
 * sourceOf('@fragment fn fs() -> @location(0) vec4f { return vec4f(1); }')   // PASS_VERT + the fragment
 */
export function sourceOf(frag, opts) {
  const o = opts || {};
  const code = String(frag == null ? '' : frag);
  if (o.vertex || entriesOf(code).vertex) return code;
  return PASS_VERT + code;
}
