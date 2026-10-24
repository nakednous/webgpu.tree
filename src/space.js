/**
 * @file Space — the mappings through the installed camera, and the twin's two
 * spaces.
 * @module webgpu.tree/space
 * @license AGPL-3.0-only
 *
 * A point or a direction between spaces through the installed camera, the ray
 * under a screen pixel, the two spaces' crossing, and the viewport matrix — the
 * mappings a pointer, a HUD mark and a pick share.
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
 * <caption>The tip of the spinning x axis, mapped from world space to logical pixels: the white cross drawn there stays on it.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, beginHUD, endHUD, cross, mapLocation, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const M = tree.mat4(), q = tree.quat(), screen = tree.vec3()
 * const tip = tree.vec3()
 *
 * function frame(ms) {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   tree.qFromAxisAngle(q, 0, 1, 0, ms / 1000)
 *   tree.mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   tree.mat4MulPoint(tip, M, 100, 0, 0)
 *   setCamera(ctx, cam)
 *   axes(ctx, { M, size: 100 })
 *   mapLocation(ctx, screen, tip[0], tip[1], tip[2], tree.WORLD, tree.SCREEN)
 *   beginHUD(ctx)
 *   cross(ctx, { x: screen[0], y: screen[1], size: 24, color: [1, 1, 1, 1] })
 *   endHUD(ctx)
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 *
 * @example
 * <caption>The same tip given in the object’s own frame — the frame matrix as from maps it straight to logical pixels, camera and all.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, beginHUD, endHUD, cross, mapLocation, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const M = tree.mat4(), q = tree.quat(), screen = tree.vec3()
 *
 * function frame(ms) {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   tree.qFromAxisAngle(q, 0, 1, 0, ms / 1000)
 *   tree.mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   setCamera(ctx, cam)
 *   axes(ctx, { M, size: 100 })
 *   mapLocation(ctx, screen, 100, 0, 0, M, tree.SCREEN)
 *   beginHUD(ctx)
 *   cross(ctx, { x: screen[0], y: screen[1], size: 24, color: [1, 1, 1, 1] })
 *   endHUD(ctx)
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 *
 *
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
 * <caption>The spinning x axis’s direction, mapped from world space to the screen: the white cross, placed 80 pixels from the center along it, rides over the red axis.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, beginHUD, endHUD, cross, mapDirection, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 150, 300] })
 * const M = tree.mat4(), q = tree.quat(), d = tree.vec3(), onScreen = tree.vec3()
 *
 * function frame(ms) {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   tree.qFromAxisAngle(q, 0, 1, 0, ms / 1000)
 *   tree.mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   tree.mat4MulDir(d, M, 1, 0, 0)
 *   setCamera(ctx, cam)
 *   axes(ctx, { M, size: 120 })
 *   mapDirection(ctx, onScreen, d[0], d[1], d[2], tree.WORLD, tree.SCREEN)
 *   const len = Math.hypot(onScreen[0], onScreen[1]) || 1
 *   beginHUD(ctx)
 *   cross(ctx, { x: 200 + (80 * onScreen[0]) / len, y: 150 + (80 * onScreen[1]) / len, size: 24, color: [1, 1, 1, 1] })
 *   endHUD(ctx)
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 *
 *
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
 * <caption>Move the pointer: the ray under its offset, cut where it meets the ground (y = 0), puts the small axes on the grid right under the pointer.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, grid, unproject, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const cam = tree.createCamera({ eye: [0, 150, 300] })
 * const origin = tree.vec3(), dir = tree.vec3(), M = tree.mat4()
 * let px = 200, py = 150
 * canvas.addEventListener('pointermove', (e) => { px = e.offsetX; py = e.offsetY })
 *
 * function frame(ms) {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   grid(ctx, { M: ground, size: 150, subdivisions: 15, color: [1, 1, 1, 1] })
 *   if (unproject(ctx, origin, dir, px, py) && dir[1] < 0) {
 *     const s = -origin[1] / dir[1]
 *     axes(ctx, { M: tree.mat4FromTRS(M, origin[0] + s * dir[0], 0, origin[2] + s * dir[2],
 *       0, 0, 0, 1, 1, 1, 1), size: 20 })
 *   }
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 *
 *
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
 * <caption>Move the pointer: an amber disc 40 device pixels in radius follows it — the fragment shader compares its own @builtin(position) with uMouse, the pointer’s.</caption>
 * import { init, endFrame, filter, fragCoord, program, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 *
 * const spot = program(ctx, `
 * ```wgsl
 * struct U {
 *   uMouse: vec2f,
 * };
 * @group(0) @binding(0) var<uniform> u: U;
 *
 * @fragment
 * fn fs(@builtin(position) p: vec4f) -> @location(0) vec4f {
 *   let d = distance(p.xy, u.uMouse);
 *   return vec4f(mix(vec3f(1.0, 0.82, 0.4), vec3f(0.075, 0.553, 0.459), smoothstep(38.0, 42.0, d)), 1.0);
 * }
 * ```
 * `)
 * const uniforms = { uMouse: tree.vec2() }
 * fragCoord(ctx, uniforms.uMouse, 200, 150)
 * canvas.addEventListener('pointermove', (e) => fragCoord(ctx, uniforms.uMouse, e.offsetX, e.offsetY))
 *
 * function frame() {
 *   filter(ctx, spot, uniforms)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 *
 *
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
 * <caption>The eye dollies between 200 and 600 from the grid, whose cells are 20 units: a white cross sized 20 ÷ pixelRatio pixels spans exactly one cell at every distance.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, grid, beginHUD, endHUD, cross, pixelRatio, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 0, 400] })
 *
 * function frame(ms) {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   const d = 400 + 200 * Math.sin(ms / 1000)
 *   cam.eye[2] = d
 *   setCamera(ctx, cam)
 *   grid(ctx, { size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
 *   beginHUD(ctx)
 *   cross(ctx, { x: 200, y: 150, size: 20 / pixelRatio(ctx, -d), color: [1, 0.82, 0.4, 1] })
 *   endHUD(ctx)
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 *
 *
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
 * <caption>W · P · V takes the spinning x axis’s tip straight to logical pixels, where the white cross is drawn over it.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, beginHUD, endHUD, cross, mat4Viewport, viewOf, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const M = tree.mat4(), W = tree.mat4(), WPV = tree.mat4(), q = tree.quat(), tip = tree.vec3()
 *
 * function frame(ms) {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   tree.qFromAxisAngle(q, 0, 1, 0, ms / 1000)
 *   tree.mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   setCamera(ctx, cam)
 *   axes(ctx, { M, size: 100 })
 *   tree.mat4Mul(WPV, mat4Viewport(ctx, W), viewOf(ctx).mat4PV)
 *   tree.mat4MulPoint(tip, tree.mat4Mul(WPV, WPV, M), 100, 0, 0)
 *   beginHUD(ctx)
 *   cross(ctx, { x: tip[0], y: tip[1], size: 24, color: [1, 1, 1, 1] })
 *   endHUD(ctx)
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 *
 *
 */
export function mat4Viewport(ctx, out) {
  return _mat4Viewport(out, canvasViewport(ctx));
}
