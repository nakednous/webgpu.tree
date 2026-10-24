/**
 * @file Space — the mappings through the installed camera, and the twin's two
 * spaces.
 * @module webgpu.tree/space
 * @license AGPL-3.0-only
 *
 * ```
 * mapLocation(ctx, out, x, y, z, from, to)   // a point, through the installed camera
 * mapDirection(ctx, out, dx, dy, dz, from, to)
 * unproject(ctx, outO, outD, sx, sy)         // a screen pixel → a world ray
 * fragCoord(ctx, out, x, y)                  // screen space → window space
 * pixelRatio(ctx, eyeZ)                      // world units per logical pixel
 * mat4Viewport(ctx, out)                     // W: NDC → screen pixels, depth → [0, 1]
 * ```
 *
 * @details
 * **Two spaces.** *Screen* space is the surface's logical pixels, top-left, y
 * down — what the pointer, labels and a HUD count. *Window* space is the
 * drawing buffer's device pixels; on WebGPU its origin is the **top-left too**,
 * because `@builtin(position)` is the framebuffer's own row — so `fragCoord`
 * scales and does not flip, and its answer is the space `readPixel` takes and a
 * shader's `@builtin(position).xy` reads. (On `webgl.tree` window space is
 * bottom-left and `fragCoord` flips y.) The device-pixel scale is the drawing
 * buffer's width over the canvas's client width, or over the host viewport's
 * width when a host attached one.
 *
 * **The viewport these verbs describe is the canvas's**, `[0, h, w, −h]` in
 * logical pixels — the signed rectangle the screen mapping and `mat4Pick` take,
 * so a sub-viewport composes. A target's own viewport is the frame's, WebGPU's
 * own `[x, y, w, h]` from the top; that is the pass's, not the pointer's, and
 * `image`'s default rect.
 *
 * **A frame is a space.** `from` / `to` name a space — `tree.WORLD`,
 * `tree.EYE`, `tree.NDC`, `tree.SCREEN` — or take a 16-element column-major
 * matrix, dispatched as `tree.MATRIX`: the point is given in, or read into, that
 * frame's coordinates, its inverse taken per call, and a singular `to` answers
 * `null`. The NDC depth convention is `WEBGPU` in the `tree` namespace, so no
 * call here names it.
 */

'use strict';

import {
  MATRIX, mat4Invert,
  mapDirection as _mapDirection,
  mapLocation as _mapLocation,
  mat4Viewport as _mat4Viewport,
  pixelRatio as _pixelRatio,
  unproject as _unproject,
} from './tree.js';
import { viewOf } from './context.js';

const _vp = [0, 0, 0, 0];
const _inverse = new Float32Array(16);
const _bag = {                       // the frames' bag — the view's matrices, aliased
  mat4Proj: null, mat4View: null, mat4PV: null, mat4PVInv: null, mat4Eye: null,
  fromFrame: null, toFrameInv: null,
};
const _r = { m: null, from: null, to: null };   // the dispatch, refilled per call

/**
 * Device pixels per logical pixel, from the host's viewport width or the
 * canvas's own client width.
 * @param {object} ctx  The context record.
 * @returns {number}
 * @ignore
 */
export function canvasScale(ctx) {
  const view = ctx.host && ctx.host.view;
  const logical = view && view.vp && view.vp[2] > 0 ? view.vp[2] : (ctx.canvas && ctx.canvas.clientWidth) || 0;
  const buffer = (ctx.canvas && ctx.canvas.width) || ctx.width || 0;
  return logical > 0 && buffer > 0 ? buffer / logical : 1;
}

/**
 * The canvas in screen space, `[0, h, w, −h]`, in module scratch — the signed
 * viewport the mappings and `mat4Pick` take.
 * @param {object} ctx  The context record.
 * @returns {number[]}
 * @ignore
 */
export function canvasViewport(ctx) {
  const view = ctx.host && ctx.host.view;
  const s = canvasScale(ctx);
  const w = view && view.vp[2] > 0 ? view.vp[2] : (ctx.canvas && ctx.canvas.clientWidth) || ctx.width / s;
  const h = view && -view.vp[3] > 0 ? -view.vp[3] : (ctx.canvas && ctx.canvas.clientHeight) || ctx.height / s;
  _vp[0] = 0;
  _vp[1] = h;
  _vp[2] = w;
  _vp[3] = -h;
  return _vp;
}

/**
 * The bag and space names a mapping reads: names pass the view through; a
 * non-string `from` / `to` — a frame matrix — dispatches as `tree.MATRIX`, the
 * out frame's inverse into module scratch, valid until the call returns.
 * @param {object} view  The view bag — `viewOf(ctx)`.
 * @param {string|Float32Array|number[]} from
 * @param {string|Float32Array|number[]} to
 * @returns {object|null} `{ m, from, to }` in module scratch, or null for a singular `to`.
 * @ignore
 */
function _dispatch(view, from, to) {
  const inFrame = from != null && typeof from !== 'string';
  const outFrame = to != null && typeof to !== 'string';
  if (!inFrame && !outFrame) {
    _r.m = view;
    _r.from = from;
    _r.to = to;
    return _r;
  }
  if (outFrame && mat4Invert(_inverse, to) === null) return null;
  _bag.mat4Proj = view.mat4Proj;
  _bag.mat4View = view.mat4View;
  _bag.mat4PV = view.mat4PV;
  _bag.mat4PVInv = view.mat4PVInv;
  _bag.mat4Eye = view.mat4Eye;
  _bag.fromFrame = inFrame ? from : null;
  _bag.toFrameInv = outFrame ? _inverse : null;
  _r.m = _bag;
  _r.from = inFrame ? MATRIX : from;
  _r.to = outFrame ? MATRIX : to;
  return _r;
}

/**
 * Map a point from one space to another through the installed camera.
 * @param {object} ctx  The context record.
 * @param {number[]} out  3-element destination.
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {string|Float32Array|number[]} from  A space name, or the frame the point is given in.
 * @param {string|Float32Array|number[]} to  A space name, or the frame to read it into.
 * @returns {number[]|null} out, or null when `to` is a singular frame.
 * @example
 * const screen = mapLocation(ctx, tree.vec3(), 100, 0, 0, tree.WORLD, tree.SCREEN)
 * // the pixel under a HUD cross
 */
export function mapLocation(ctx, out, x, y, z, from, to) {
  const r = _dispatch(viewOf(ctx), from, to);
  if (!r) return null;
  return _mapLocation(out, x, y, z, r.from, r.to, r.m, canvasViewport(ctx));
}

/**
 * Map a direction — translation ignored.
 * @param {object} ctx  The context record.
 * @param {number[]} out  3-element destination.
 * @param {number} dx
 * @param {number} dy
 * @param {number} dz
 * @param {string|Float32Array|number[]} from
 * @param {string|Float32Array|number[]} to
 * @returns {number[]|null} out, or null when `to` is a singular frame.
 * @example
 * const dir = mapDirection(ctx, tree.vec3(), 0, 0, -1, tree.EYE, tree.WORLD)
 */
export function mapDirection(ctx, out, dx, dy, dz, from, to) {
  const r = _dispatch(viewOf(ctx), from, to);
  if (!r) return null;
  return _mapDirection(out, dx, dy, dz, r.from, r.to, r.m, canvasViewport(ctx));
}

/**
 * The world ray through a screen-space pixel.
 * @param {object} ctx  The context record.
 * @param {number[]} outO  3-element origin destination.
 * @param {number[]} outD  3-element direction destination.
 * @param {number} sx  Screen-space x, logical pixels.
 * @param {number} sy  Screen-space y, logical pixels, down.
 * @returns {number[]|null} outD, or null when the camera is degenerate.
 * @example
 * const o = [0, 0, 0], d = [0, 0, 0]
 * unproject(ctx, o, d, pointerX, pointerY).then === null ? 'stale camera' : 'a ray'
 */
export function unproject(ctx, outO, outD, sx, sy) {
  return _unproject(outO, outD, sx, sy, viewOf(ctx), canvasViewport(ctx));
}

/**
 * The `@builtin(position)` of a screen-space pixel: screen space to window
 * space, the drawing buffer's device pixels, **top-left, y down** — no flip, so
 * the value is the one `readPixel` takes.
 * @param {object} ctx  The context record.
 * @param {number[]} out  2-element destination.
 * @param {number} x  Screen-space x, logical pixels.
 * @param {number} y  Screen-space y, logical pixels, down.
 * @returns {number[]} out
 * @example
 * fragCoord(ctx, uMouse, e.offsetX, e.offsetY)   // the pointer as a shader's @builtin(position)
 */
export function fragCoord(ctx, out, x, y) {
  const s = canvasScale(ctx);
  out[0] = x * s;
  out[1] = y * s;
  return out;
}

/**
 * World units per logical pixel at an eye-space depth, for the installed camera.
 * @param {object} ctx  The context record.
 * @param {number} eyeZ  The eye-space z of the depth measured.
 * @returns {number} World units per logical pixel.
 * @example
 * const size = 20 / pixelRatio(ctx, -eyeDistance)   // a HUD cross spanning 20 world units
 */
export function pixelRatio(ctx, eyeZ) {
  const vp = canvasViewport(ctx);
  return _pixelRatio(viewOf(ctx).mat4Proj, -vp[3], eyeZ);
}

/**
 * The viewport matrix W: NDC to screen pixels (y down), depth to [0, 1].
 * @param {object} ctx  The context record.
 * @param {Float32Array|number[]} out
 * @returns {Float32Array|number[]} out
 * @example
 * tree.mat4Mul(WPV, mat4Viewport(ctx, W), viewOf(ctx).mat4PV)   // a point straight to pixels
 */
export function mat4Viewport(ctx, out) {
  return _mat4Viewport(out, canvasViewport(ctx));
}
