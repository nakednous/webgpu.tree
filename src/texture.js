/**
 * @file Textures — create, refresh, the shapes; one orientation.
 * @module webgpu.tree/texture
 * @license AGPL-3.0-only
 *
 * Textures from images, canvases, videos, bitmaps or raw pixels, stored the way
 * WebGPU samples them, so nothing that draws one takes a flip option.
 *
 * ```
 * texture(ctx, source, opts)   // an ImageBitmap, an element, or { data, width, height }
 *                              //   + depth  → a 3d texture
 *                              //   + layers → a 2d array
 *                              //   + mips: true → the chain
 * upload(ctx, tex, source)     // refresh from a video or a canvas, slice by slice
 * cubemap(ctx, faces, opts)    // six sources → a cube map
 * ```
 *
 * @details
 * One orientation rule: every texture the twin holds is in WebGPU's space,
 * **top-down**. A decoded image's rows already run that way, so an element or a
 * bitmap is copied as it is (`copyExternalImageToTexture`, no flip); a
 * `{ data, width, height }` pixel source is taken as given — row 0 at the top of
 * the texture — so a caller holding rows the other way turns them itself. A
 * render target's texture is top-down already and never passes through `upload`.
 * Image, pane, filter, the pick pass and the HUD carry no flip switch, and the
 * fullscreen pass's `vTexCoord` has v = 0 at the top.
 *
 * A pixel source's rows are padded to 256 bytes, the copy alignment a readback's
 * rows take too (`paddedRows`), and a **volume or an array is uploaded a slice at
 * a time** — `depth` makes a `3d` texture, `layers` a `2d` array, the slices
 * running slice 0 first. **`mips: true`** creates the whole chain and generates
 * it after the level-0 upload — WebGPU has no `generateMipmap` call, so the chain
 * is the peer's render pass, a layer at a time (an array's and a cube's faces are
 * each the platform's `textureBindingViewDimension`). A 3d texture takes no chain
 * (the peer's generator is 2D and cube), and says so.
 *
 * **The formats.** The targets' own three — `rgba8unorm` (the default),
 * `rgba16float`, `rgba32float` — and the channel names a volume or a mask needs:
 * `r8unorm`, `rg8unorm`, `r16float`, `r32float` and their kin. A `Float32Array`
 * source is unclamped radiance and defaults to the 32F one. **Sampling note:**
 * `rgba32float` is not filterable without the adapter's `float32-filterable`
 * feature; the twin's default sampler is linear, so a stage sampling an
 * rgba32float texture needs that feature on the device (`init(canvas, {
 * deviceOptions: { requiredFeatures: ['float32-filterable'] } })`) or a nearest
 * sampler in the bag.
 *
 * Sampling state is a sampler's, not a texture's: the twin keeps one default
 * (linear, clamp to edge), and a stage that declares a sampler gets it unless the
 * bag names another. A cube map's six sources are in the cube's face order
 * (+X −X +Y −Y +Z −Z), each unflipped at its layer.
 */

'use strict';

import { generateMipmap, numMipLevels } from 'webgpu-utils';
import { bytesPerPixel, formatOf } from './backend.js';

const FORMAT = /^(r|rg|rgba|bgra)(8|16|32)(unorm|snorm|float|uint|sint)$/;

const _isPixels = (s) => !!(s && s.data && typeof s.width === 'number' && typeof s.height === 'number' && !s.getContext);
const _isFloat = (s) => !!(s && s.data instanceof Float32Array);
const _sizeOf = (s) => {
  if (!s) return null;
  const w = s.videoWidth || s.naturalWidth || s.width || 0;
  const h = s.videoHeight || s.naturalHeight || s.height || 0;
  return w && h ? [w, h] : null;
};

/** The bytes of a pixel source, whatever its array's type. @ignore */
function _bytes(data) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

/** The format a source and the options ask for. @ignore */
function _formatOf(source, opts) {
  const float = !!opts.float;
  const token = opts.format !== undefined ? opts.format : (_isFloat(source) && !float ? 'rgba32float' : undefined);
  return formatOf({ format: token, float });
}

/** Whether a format is one the twin's textures take. @ignore */
const _formatOk = (format) => FORMAT.test(format);

/** The slices a pixel source holds: `depth` a volume, `layers` an array. @ignore */
const _layersOf = (pixels) => {
  if (typeof pixels.depth === 'number') return pixels.depth;
  if (typeof pixels.layers === 'number') return pixels.layers;
  return 1;
};

/** Write a pixel source's slices into a texture, one layer at a time. @ignore */
function _writeSlices(ctx, tex, pixels) {
  const step = tex.width * tex.height * bytesPerPixel(tex.format);
  const all = _bytes(pixels.data);
  const layers = Math.max(1, Math.min(tex.layers || 1, _layersOf(pixels)));
  for (let z = 0; z < layers; z++) {
    ctx.backend.uploadTexture(ctx, tex, all.subarray(z * step, (z + 1) * step), { z });
  }
}

/**
 * A texture from an image, a canvas, a video, a bitmap or raw pixels — a 2d
 * texture, a `3d` one from a source with `depth`, or a `2d` array from one with
 * `layers`.
 * @param {object} ctx  The context record.
 * @param {object} source  An `ImageBitmap`, an image / canvas / video element, or
 *        `{ data, width, height }` (+ `depth` or `layers`) — its rows top-down,
 *        no flip, slice 0 first.
 * @param {{ format?:*, float?:boolean, mips?:boolean, usage?:number, label?:string }} [opts]
 *        format: a token (`rgba8unorm`, `rgba16float`, `rgba32float`, `r8unorm`,
 *        `rg8unorm`, …); float: resolve to the 16F format where the source does
 *        not say; mips: generate the chain; usage: `GPUTextureUsage` bits.
 * @returns {object|null} The texture record `upload`, `image`, `pane` and a pass
 *          take — `{ gpu, view, width, height, layers, dimension, format }`.
 * @example
 * <caption>A 2 × 2 pixel source, row 0 at the texture’s top, stretched by the twin’s linear sampler: the edges are clamped, the inside blends.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, pane, texture, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 *
 * const magenta = [255, 79, 216, 255]
 * const yellow = [255, 209, 102, 255]
 * const data = new Uint8Array([...magenta, ...yellow, ...yellow, ...magenta])
 * const tex = texture(ctx, { data, width: 2, height: 2 })
 *
 * ctx.backend.bindTarget(ctx, scene)
 * ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 * setCamera(ctx, tree.createCamera({ eye: [0, 0, 205] }))
 * pane(ctx, [-100, 100, 0], [100, 100, 0], [100, -100, 0], [-100, -100, 0], { texture: tex })
 * ctx.backend.bindTarget(ctx, SCREEN)
 * image(ctx, scene.color)
 * endFrame(ctx)
 *
 *
 */
export function texture(ctx, source, opts) {
  if (!ctx || !ctx.backend) return null;
  const o = opts || {};
  const pixels = _isPixels(source) ? source : null;
  const size = pixels ? [pixels.width, pixels.height] : _sizeOf(source);
  if (!size) {
    console.error('[webgpu.tree] texture: a source is required — an element, a bitmap, or { data, width, height }.');
    return null;
  }
  const format = _formatOf(source, o);
  if (!_formatOk(format)) {
    console.error('[webgpu.tree] texture: `' + format + '` is not a texture format the twin takes.');
    return null;
  }
  const volume = !!pixels && typeof pixels.depth === 'number';
  const layers = volume ? Math.max(1, pixels.depth | 0) : (pixels && typeof pixels.layers === 'number' ? Math.max(1, pixels.layers | 0) : 1);
  const mips = o.mips === true;
  if (mips && volume) console.error('[webgpu.tree] texture: a 3d texture takes no mip chain — the chain is 2D and cube.');
  const levels = mips && !volume ? numMipLevels([size[0], size[1]], '2d') : 1;
  const tex = ctx.backend.createTexture(ctx, {
    width: size[0],
    height: size[1],
    depthOrArrayLayers: layers,
    dimension: volume ? '3d' : '2d',
    viewDimension: volume ? '3d' : (layers > 1 ? '2d-array' : undefined),
    mips: levels,
    format,
    usage: o.usage,
    label: o.label,
  });
  ctx.sizes.set(tex, [tex.width, tex.height]);   // idiom's uTexelSize reads it
  upload(ctx, tex, source);
  if (mips && !volume) generateMipmap(ctx.device, tex.gpu);
  return tex;
}

/**
 * Refresh a texture from a source of the same shape — a video or a canvas each
 * frame, or new pixels, slice by slice for a volume or an array.
 * @param {object} ctx  The context record.
 * @param {object} tex  A texture record from `texture`.
 * @param {object} source  An element, a bitmap, or `{ data, width, height }`.
 * @returns {object|null} tex.
 * @example
 * <caption>A 2D canvas redrawn every frame: the magenta bar sweeps left to right under a yellow strip along the top.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, texture, upload, pane, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const board = document.createElement('canvas')
 * board.width = 256
 * board.height = 256
 * const g = board.getContext('2d')
 * const tex = texture(ctx, board)
 * const cam = tree.createCamera({ eye: [0, 0, 205] })
 *
 * function frame(ms) {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   g.fillStyle = '#222'
 *   g.fillRect(0, 0, 256, 256)
 *   g.fillStyle = '#ff4fd8'
 *   g.fillRect((ms / 10) % 256, 0, 32, 256)
 *   g.fillStyle = '#ffd166'
 *   g.fillRect(0, 0, 256, 32)
 *   upload(ctx, tex, board)
 *   setCamera(ctx, cam)
 *   pane(ctx, [-100, 100, 0], [100, 100, 0], [100, -100, 0], [-100, -100, 0], { texture: tex })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 *
 *
 */
export function upload(ctx, tex, source) {
  if (!ctx || !ctx.backend) return null;
  if (!tex || !tex.gpu) {
    console.error('[webgpu.tree] upload: a texture from texture(ctx, source) is required.');
    return null;
  }
  if (_isPixels(source)) _writeSlices(ctx, tex, source);
  else ctx.backend.uploadTexture(ctx, tex, source);
  return tex;
}

/**
 * A cube map from six sources, in the cube's face order (+X −X +Y −Y +Z −Z),
 * each at its own layer, unflipped.
 * @param {object} ctx  The context record.
 * @param {object[]} faces  Six sources — elements, bitmaps, or
 *        `{ data, width, height }` — all the same square size.
 * @param {{ format?:*, float?:boolean, mips?:boolean, usage?:number, label?:string }} [opts]
 *        The options `texture` takes; `mips` chains face by face.
 * @returns {object|null} The texture record, its view a cube.
 * @example
 * <caption>A cube sampling a cube map by direction: +X magenta on the right, +Y white on top, +Z blue in front.</caption>
 * import { init, endFrame, renderTarget, SCREEN, setCamera, bind, buffer, cubemap, draw, image, program, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 *
 * const solid = (color) => {
 *   const c = document.createElement('canvas')
 *   c.width = c.height = 16
 *   const g = c.getContext('2d')
 *   g.fillStyle = color
 *   g.fillRect(0, 0, 16, 16)
 *   return c
 * }
 * // +X, −X, +Y, −Y, +Z, −Z
 * const cube = cubemap(ctx, ['#ff4fd8', '#ffd166', '#ffffff', '#222222', '#4f9dff', '#222222'].map(solid))
 *
 * const hexa = tree.platonic(tree.HEXAHEDRON, { radius: 100 })
 * const box = buffer(ctx, { position: hexa.position, indices: hexa.indices })
 * const WGSL = `
 * ```wgsl
 * @group(0) @binding(0) var<uniform> uModelViewProjectionMatrix: mat4x4f;
 * @group(0) @binding(1) var uCube: texture_cube<f32>;
 * @group(0) @binding(2) var uSampler: sampler;
 *
 * struct VOut {
 *   @builtin(position) position: vec4f,
 *   @location(0) dir: vec3f,
 * };
 *
 * @vertex
 * fn vs(@location(0) aPosition: vec3f) -> VOut {
 *   var out: VOut;
 *   out.position = uModelViewProjectionMatrix * vec4f(aPosition, 1.0);
 *   out.dir = aPosition;
 *   return out;
 * }
 *
 * @fragment
 * fn fs(@location(0) dir: vec3f) -> @location(0) vec4f {
 *   return textureSample(uCube, uSampler, normalize(dir));
 * }
 * ```
 * `
 * const prog = program(ctx, WGSL, { buffers: box.bufferLayouts })
 * setCamera(ctx, tree.createCamera({ eye: [0, 0, 300] }))
 *
 * ctx.backend.bindTarget(ctx, scene)
 * ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 * bind(ctx, prog, { uModelViewProjectionMatrix: ctx.PV, uCube: cube })
 * draw(ctx, box)
 * ctx.backend.bindTarget(ctx, SCREEN)
 * image(ctx, scene.color)
 * endFrame(ctx)
 *
 *
 */
export function cubemap(ctx, faces, opts) {
  if (!ctx || !ctx.backend) return null;
  const o = opts || {};
  if (!Array.isArray(faces) || faces.length !== 6) {
    console.error('[webgpu.tree] cubemap: six faces are required, in the cube\'s order (+X −X +Y −Y +Z −Z).');
    return null;
  }
  const first = faces[0];
  const size = _isPixels(first) ? [first.width, first.height] : _sizeOf(first);
  if (!size) {
    console.error('[webgpu.tree] cubemap: a face must be an element, a bitmap, or { data, width, height }.');
    return null;
  }
  const format = _formatOf(_isPixels(first) ? first : null, o);
  if (!_formatOk(format)) {
    console.error('[webgpu.tree] cubemap: `' + format + '` is not a texture format the twin takes.');
    return null;
  }
  const mips = o.mips === true;
  const levels = mips ? numMipLevels(size, '2d') : 1;
  const tex = ctx.backend.createTexture(ctx, {
    width: size[0],
    height: size[1],
    depthOrArrayLayers: 6,
    dimension: '2d',
    viewDimension: 'cube',
    mips: levels,
    format,
    usage: o.usage,
    label: o.label,
  });
  ctx.sizes.set(tex, [tex.width, tex.height]);
  for (let i = 0; i < 6; i++) {
    const face = faces[i];
    ctx.backend.uploadTexture(ctx, tex, _isPixels(face) ? _bytes(face.data) : face, { z: i });
  }
  if (mips) generateMipmap(ctx.device, tex.gpu);
  return tex;
}
