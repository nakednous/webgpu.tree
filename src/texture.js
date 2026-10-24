/**
 * @file Textures — create, refresh, one orientation.
 * @module webgpu.tree/texture
 * @license AGPL-3.0-only
 *
 * Textures from images, canvases, videos, bitmaps or raw pixels, stored the way
 * WebGPU samples them, so nothing that draws one takes a flip option.
 *
 * ```
 * texture(ctx, source, opts)   // an ImageBitmap, an element, or { data, width, height }
 * upload(ctx, tex, source)     // refresh from a video or a canvas each frame
 * ```
 *
 * @details
 * One orientation rule: every texture the twin holds is in WebGPU's space,
 * **top-down**. A decoded image's rows already run that way, so an element or a
 * bitmap is copied as it is (`copyExternalImageToTexture`, no flip); a
 * `{ data, width, height }` pixel source is taken as given — row 0 at the top of
 * the texture — so a caller holding rows the other way turns them itself. A
 * render target's texture is top-down already and never passes through `upload`.
 * Image, pane, filter and the pick pass therefore carry no flip switch, and the
 * fullscreen pass's `vTexCoord` has v = 0 at the top.
 *
 * A pixel source's rows are padded to 256 bytes, the copy alignment a readback's
 * rows take too (`paddedRows`), and `writeTexture` sees a padded copy where the
 * row is not already a multiple. The width and height are the texture's: a
 * refresh is the same shape, new rows.
 *
 * The format follows the source and `opts.format` resolves the tokens a
 * `renderTarget` takes: `rgba8unorm` (the default, and any other byte array),
 * `rgba16float` and `rgba32float` — a `Float32Array` is unclamped radiance and
 * defaults to the 32F one. **Sampling note:** `rgba32float` is not filterable
 * without the adapter's `float32-filterable` feature; the twin's default sampler
 * is linear, so a stage sampling an rgba32float texture needs that feature on the
 * device (`init(canvas, { deviceOptions: { requiredFeatures: ['float32-filterable'] } })`)
 * or a nearest sampler in the bag.
 *
 * Sampling state is a sampler's, not a texture's: the twin keeps one default
 * (linear, clamp to edge), and a stage that declares a sampler gets it unless the
 * bag names another. Per-texture samplers, mips, the 3D and 2D-array shapes (the
 * bridge's `depth` / `layers`) and `cubemap` are later stages.
 */

'use strict';

import { formatOf } from './backend.js';

/** Bytes per pixel of the formats a texture may take — the targets' own set. */
const BYTES_PER_PIXEL = Object.freeze({ rgba8unorm: 4, bgra8unorm: 4, rgba16float: 8, rgba32float: 16 });

const _isPixels = (s) => !!(s && s.data && typeof s.width === 'number' && typeof s.height === 'number' && !s.getContext);
const _isFloat = (s) => !!(s && s.data instanceof Float32Array);
const _sizeOf = (s) => {
  if (!s) return null;
  const w = s.videoWidth || s.naturalWidth || s.width || 0;
  const h = s.videoHeight || s.naturalHeight || s.height || 0;
  return w && h ? [w, h] : null;
};

/**
 * A texture from an image, a canvas, a video, a bitmap or raw pixels.
 * @param {object} ctx  The context record.
 * @param {object} source  An `ImageBitmap`, an image / canvas / video element, or
 *        `{ data, width, height }` — its rows top-down, no flip.
 * @param {{ format?:*, float?:boolean, usage?:number, label?:string }} [opts]
 *        format: a `renderTarget` token (`rgba8unorm`, `rgba16float`,
 *        `rgba32float`, or a WebGPU name); float: resolve to the 16F format where
 *        the source does not say. usage: `GPUTextureUsage` bits, by default
 *        sampling, copying and rendering. label: the texture's label.
 * @returns {object|null} The texture record `upload`, `image` and a pass take —
 *          `{ gpu, view, width, height, format }`.
 * @example
 * const tex = texture(ctx, document.querySelector('img'))
 * const checker = texture(ctx, { data: new Uint8Array([255,0,0,255, 0,255,0,255]), width: 2, height: 1 })
 * image(ctx, tex)
 */
export function texture(ctx, source, opts) {
  if (!ctx || !ctx.backend) return null;
  const o = opts || {};
  const size = _isPixels(source) ? [source.width, source.height] : _sizeOf(source);
  if (!size) {
    console.error('[webgpu.tree] texture: a source is required — an element, a bitmap, or { data, width, height }.');
    return null;
  }
  const float = !!o.float;
  // unclamped radiance: a Float32Array is the 32F format unless the caller asks
  // for the 16F one; `opts.format` names any of the targets' tokens
  const token = o.format !== undefined ? o.format : (_isFloat(source) && !float ? 'rgba32float' : undefined);
  const format = formatOf({ format: token, float });
  if (!BYTES_PER_PIXEL[format]) {
    console.error('[webgpu.tree] texture: `' + format + '` is not one of the formats a texture takes (rgba8unorm, rgba16float, rgba32float).');
    return null;
  }
  const tex = ctx.backend.createTexture(ctx, {
    width: size[0],
    height: size[1],
    format,
    usage: o.usage,
    label: o.label,
  });
  ctx.sizes.set(tex, [tex.width, tex.height]);   // idiom's uTexelSize reads it
  upload(ctx, tex, source);
  return tex;
}

/**
 * Refresh a texture from a source of the same size — a video or a canvas each
 * frame, or new pixels.
 * @param {object} ctx  The context record.
 * @param {object} tex  A texture record from `texture`.
 * @param {object} source  An element, a bitmap, or `{ data, width, height }`.
 * @returns {object|null} tex.
 * @example
 * upload(ctx, videoTex, video)   // per frame; the rows stay top-down
 */
export function upload(ctx, tex, source) {
  if (!ctx || !ctx.backend) return null;
  if (!tex || !tex.gpu) {
    console.error('[webgpu.tree] upload: a texture from texture(ctx, source) is required.');
    return null;
  }
  ctx.backend.uploadTexture(ctx, tex, _isPixels(source) ? source.data : source);
  return tex;
}
