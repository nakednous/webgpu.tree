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
 * const ctx = await init(document.querySelector('canvas'), { width: 400, height: 300 })
 * const scene = renderTarget(ctx, { width: 400, height: 300, depth: false })
 * state(ctx, { width: 256, height: 192 }).pass(program(ctx, wgsl))
 * endFrame(ctx)
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
 * function frame() {
 *   state.pass(accum)
 *   image(ctx, state.read.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
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
 * dispose(ctx)
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
