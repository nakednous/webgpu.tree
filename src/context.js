/**
 * @file The per-device registry — one entry per GPUDevice, created by `init`.
 * @module webgpu.tree/context
 * @license AGPL-3.0-only
 *
 * The bridge's handle is the device: `init(canvas)` makes one, configures the
 * canvas's context, and answers the record every verb takes first — the object
 * the design calls `{ device, context, format }`. The record *is* `idiom`'s
 * context record, extended: the layer's bookkeeping (targets, pipe pairs,
 * declared names, texture sizes) and the twin's own (the frame, the uniform
 * arena, the camera, the view bag) live on one object, so a verb takes one
 * argument and a dispose frees both halves.
 *
 * ```
 * const ctx = await init(canvas, { width, height })   // the canvas's size in device pixels
 * renderTarget(ctx, { width: 256 })                   // every composite verb takes ctx
 * const canvasHost = host.createHost(canvas, { afterFrame: () => endFrame(ctx) })
 * dispose(ctx)                                        // the layer's targets, then the device's
 * ```
 *
 * `endFrame` is the twin's own, not `idiom`'s (§7 #107): the frame-scoped
 * command encoder is submitted there, from the host's `afterFrame` — after
 * `pointer.flush()`, so a pointer handler's draw is in the frame — or by the
 * application itself where no host runs.
 *
 * WebGPU's device is asked for asynchronously (`requestAdapter` →
 * `requestDevice`), which is why `init` is a promise here and a plain call in
 * `webgl.tree`: nothing else in the surface changed with it.
 */

'use strict';

import { WEBGPU } from '@nakednous/tree';
import { createView } from '@nakednous/host';
import { createContext, disposeContext } from '@nakednous/idiom';
import { createArena } from './arena.js';
import { createBackend } from './backend.js';
import { endFrame as submitFrame } from './frame.js';
import { BASE_STATE } from './pipeline.js';

const _registry = new WeakMap();

const _identity = (m) => {
  m.fill(0);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
};

/**
 * Make the twin's context for a canvas: adapter, device, the canvas context
 * configured to the preferred format, the layer's record over the twin's
 * backend.
 * @param {HTMLCanvasElement} canvas  The canvas the device draws into.
 * @param {{ gpu?:object, adapter?:object, device?:object, context?:object, format?:string,
 *           alphaMode?:string, width?:number, height?:number, density?:number,
 *           host?:object, adapterOptions?:object, deviceOptions?:object }} [opts]
 *        gpu / adapter / device / context: supplied objects, for a caller that
 *        owns one already (a device is not asked for twice). format: a
 *        `GPUTextureFormat`, default the canvas's preferred one. alphaMode:
 *        `'premultiplied'` (default), `'opaque'` or `'unpremultiplied'`.
 *        width / height / density: the canvas's logical size and the device
 *        pixel ratio to size its buffer by (default `devicePixelRatio`); the
 *        application writes the canvas's CSS. host: a host whose view bag
 *        `setCamera` writes.
 * @returns {Promise<object>} The context record — `{ device, context, format }`
 *          and the layer's, every verb's first argument.
 * @example
 * <caption>A frame on the host's loop, the submit at its end</caption>
 * import { init, endFrame, host, image, program, state } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 *
 * const bands = program(ctx, `
 * ```wgsl
 * @fragment
 * fn fs(@location(0) vTexCoord: vec2f) -> @location(0) vec4f {
 *   let cell = floor(vTexCoord * vec2f(6.0, 4.0));
 *   let on = (cell.x + cell.y) % 2.0;
 *   return mix(vec4f(0.05, 0.07, 0.10, 1.0), vec4f(0.10, 0.55, 0.46, 1.0), on);
 * }
 * ```
 * `)
 *
 * const field = state(ctx, { width: 200, height: 150 })
 * host.createHost(canvas, {
 *   onFrame() {
 *     field.pass(bands)             // a pass into the state's write side
 *     image(ctx, field.read.color)  // and the read side on the canvas
 *   },
 *   afterFrame: () => endFrame(ctx) // after pointer.flush(), the frame's submit
 * })
 */
export async function init(canvas, opts) {
  const o = opts || {};
  if (!canvas) throw new Error('[webgpu.tree] init: a canvas is required.');
  const gpu = o.gpu || (typeof navigator !== 'undefined' ? navigator.gpu : undefined);
  if (!gpu && !o.device) throw new Error('[webgpu.tree] init: WebGPU is unavailable (navigator.gpu is undefined).');
  const adapter = o.adapter || (gpu && gpu.requestAdapter ? await gpu.requestAdapter(o.adapterOptions) : null);
  if (!adapter && !o.device) throw new Error('[webgpu.tree] init: no WebGPU adapter is available on this machine.');
  const device = o.device || await adapter.requestDevice(o.deviceOptions);
  const known = _registry.get(device);
  if (known) return known;

  const context = o.context || canvas.getContext('webgpu');
  if (!context) throw new Error('[webgpu.tree] init: the canvas has no WebGPU context.');
  const format = o.format || gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: o.alphaMode || 'premultiplied' });

  const density = o.density || (typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1);
  if (o.width) {
    canvas.width = Math.round(o.width * density);
    canvas.height = Math.round((o.height || o.width) * density);
  }
  const width = canvas.width || 300;
  const height = canvas.height || 150;

  const arena = createArena(device);
  const backend = createBackend({ device, context, format, width, height, arena });
  const record = createContext(backend);

  record.device = device;
  record.adapter = adapter;
  record.context = context;
  record.canvas = canvas;
  record.format = format;
  record.width = width;
  record.height = height;
  record.arena = arena;
  record.state = BASE_STATE;
  record.depthClearValue = 1;
  record.host = o.host || null;
  record.messages = new Set();
  record.deviceOwned = !o.device;
  record.V = _identity(new Float32Array(16));
  record.P = _identity(new Float32Array(16));
  record.PV = _identity(new Float32Array(16));
  record.MV = new Float32Array(16);
  record.MVP = new Float32Array(16);
  record.N = new Float32Array(9);
  record.view = createView({ ndcZMin: WEBGPU });

  _registry.set(device, record);
  return record;
}

/**
 * The view bag of a context — the host's when one is attached, the bridge's own
 * otherwise.
 * @param {object} ctx  The context record.
 * @returns {object} The bag `setCamera` fills.
 * @example
 * <caption>A magenta crosshair pinned to the tip of the x axis as the camera circles.</caption>
 * import { init, endFrame, image, setCamera, texture, tree, axes, cross, viewOf, mat4Viewport } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300, density: 1 })
 * const sky = texture(ctx, { data: new Uint8Array([19, 141, 117, 255]), width: 1, height: 1 })
 * const cam = tree.createCamera({ eye: [0, 107, 215] })
 * const WPV = tree.mat4()
 * const tip = tree.vec3()
 *
 * function frame(ms) {
 *   cam.eye[0] = 215 * Math.sin(ms / 1000)
 *   cam.eye[2] = 215 * Math.cos(ms / 1000)
 *   image(ctx, sky)
 *   setCamera(ctx, cam)
 *   axes(ctx, { size: 100 })
 *   // the bag viewOf answers, and the viewport matrix over it
 *   tree.mat4Mul(WPV, mat4Viewport(ctx, tree.mat4()), viewOf(ctx).mat4PV)
 *   tree.mat4MulPoint(tip, WPV, 100, 0, 0)
 *   cross(ctx, { x: tip[0], y: tip[1], size: 22, color: [1, 0.31, 0.85, 1] })
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 *
 */
export function viewOf(ctx) {
  return ctx && ctx.host && ctx.host.view ? ctx.host.view : ctx.view;
}

/**
 * Submit the frame: end the open pass, submit the frame's command encoder, and
 * start the next frame's uniform slots. What the host's `afterFrame` calls, and
 * what an application without a host calls itself.
 * @param {object} ctx  The context record.
 * @returns {boolean} Whether a command buffer was submitted.
 * @example
 * <caption>The frame’s submit, once a frame: without it nothing reaches the canvas.</caption>
 * import { init, endFrame, image, texture, cross } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300, density: 1 })
 * const sky = texture(ctx, { data: new Uint8Array([19, 141, 117, 255]), width: 1, height: 1 })
 *
 * function frame(ms) {
 *   image(ctx, sky)
 *   cross(ctx, { x: 40 + 300 * Math.abs(Math.sin(ms / 1500)), y: 150, size: 30, color: [1, 0.82, 0.4, 1] })
 *   endFrame(ctx)              // the frame’s command buffer, submitted
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 *
 */
export function endFrame(ctx) {
  return submitFrame(ctx);
}

/**
 * Free everything the twin and the layer made for a context: the targets and
 * pipe pairs first (`idiom`'s), then the backend's own objects, then the device
 * where `init` made it.
 * @param {object} ctx  The context record.
 * @example
 * <caption>Click the canvas: dispose frees the targets and the device, and a fresh context is built at once.</caption>
 * import { init, dispose, endFrame, image, texture, setCamera, tree, axes } from 'webgpu.tree'
 *
 * const out = document.body.appendChild(document.createElement('pre'))
 * out.style.cssText = 'margin:0;padding:8px;color:#d8dee9;font:12px ui-monospace,monospace'
 * out.textContent = 'click the canvas'
 *
 * let ctx = null, sky = null, canvas = null, wave = 0
 *
 * async function start() {
 *   canvas = document.body.insertBefore(document.createElement('canvas'), out)
 *   canvas.style.width = '400px'
 *   canvas.style.height = '300px'
 *   ctx = await init(canvas, { width: 400, height: 300, density: 1 })
 *   sky = texture(ctx, { data: new Uint8Array([19, 141, 117, 255]), width: 1, height: 1 })
 *   const cam = tree.createCamera({ eye: [0, 107, 215] })
 *   const id = ++wave
 *   canvas.addEventListener('click', async () => {
 *     if (id !== wave) return
 *     wave += 1
 *     dispose(ctx)               // the layer’s targets, then the device
 *     canvas.remove()
 *     await start()
 *   })
 *   function frame(ms) {
 *     if (id !== wave) return    // the old loop stops with its context
 *     image(ctx, sky)
 *     setCamera(ctx, cam)
 *     axes(ctx, { size: 100 })
 *     endFrame(ctx)
 *     requestAnimationFrame(frame)
 *   }
 *   requestAnimationFrame(frame)
 * }
 *
 * await start()
 *
 */
export function dispose(ctx) {
  if (!ctx || ctx.disposed) return;
  const device = ctx.device;
  const owned = ctx.deviceOwned;
  disposeContext(ctx);   // targets, pipes, then backend.dispose
  _registry.delete(device);
  ctx.frame = null;
  ctx.pickTarget = null;
  if (owned) device.destroy();
}
