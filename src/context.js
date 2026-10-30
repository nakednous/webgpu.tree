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
 * `endFrame` is the twin's own, not the layer's: the frame-scoped
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
 * <caption>With a host attached, drag the magenta dot around a sphere of radius 100.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, handleLocus, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 *
 * const cam = tree.createCamera({ eye: [129, 107, 172] })
 * const h = canvasHost.handle({ constraint: tree.SPHERE, anchor: [0, 0, 0], radius: 100 })
 *
 * function frame() {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   h.update()
 *   axes(ctx, { size: 100 })
 *   handleLocus(ctx, h, { dotColor: [1, 0.31, 0.85, 1] })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 *
 */
export async function init(canvas, opts) {
  const o = opts || {};
  if (!canvas) throw new Error('[webgpu.tree] init: a canvas is required.');
  const gpu = o.gpu || (typeof navigator !== 'undefined' ? navigator.gpu : undefined);
  if (!gpu && !o.device) throw new Error('[webgpu.tree] init: WebGPU is unavailable (navigator.gpu is undefined).');
  const adapter = o.adapter || (gpu && gpu.requestAdapter ? await gpu.requestAdapter(o.adapterOptions) : null);
  if (!adapter && !o.device) throw new Error('[webgpu.tree] init: no WebGPU adapter is available on this machine.');
  // The features the twin's sampling wants where the adapter has them. A 32-bit
  // float texture is *unfilterable* by default, and the twin's bind group asks
  // for a filtering `texture_2d<f32>`: without this, a texture the `hdr` module
  // hands over — or a target made with `float: true` — binds an invalid group and
  // draws nothing. `float32-filterable` is optional in WebGPU, so it is requested
  // only from an adapter that reports it (Dawn on the Arc does, SwiftShader does
  // not need it); `texture` says so when it is missing.
  const wanted = ['float32-filterable'].filter((f) => adapter && adapter.features && adapter.features.has(f));
  const deviceOptions = Object.assign({}, o.deviceOptions);
  if (wanted.length) {
    const asked = deviceOptions.requiredFeatures || [];
    deviceOptions.requiredFeatures = [...new Set([...asked, ...wanted])];
  }
  const device = o.device || await adapter.requestDevice(deviceOptions);
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
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, cross, viewOf, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 *
 * const cam = tree.createCamera({ eye: [0, 107, 215] })
 * const tip = tree.vec3()
 * const W = tree.mat4Viewport(tree.mat4(), [0, 300, 400, -300])   // y down, as cross takes it
 * const WPV = tree.mat4()
 *
 * function frame(ms) {
 *   cam.eye[0] = 215 * Math.sin(ms / 1000)
 *   cam.eye[2] = 215 * Math.cos(ms / 1000)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   axes(ctx, { size: 100 })
 *   // the bag viewOf answers: W · P · V, world to logical pixels
 *   tree.mat4Mul(WPV, W, viewOf(ctx).mat4PV)
 *   tree.mat4MulPoint(tip, WPV, 100, 0, 0)
 *   cross(ctx, { x: tip[0], y: tip[1], size: 30, color: [1, 0.31, 0.85, 1] })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 *
 *
 */
export function viewOf(ctx) {
  return ctx && ctx.host && ctx.host.view ? ctx.host.view : ctx.view;
}

/**
 * Submit the frame: end the open passes — the render pass and a dispatch's
 * compute pass alike — submit the frame's command encoder, and start the next
 * frame's uniform slots. A `readBuffer`'s copy rides the same encoder, so its
 * promise resolves after this call. What the host's `afterFrame` calls, and
 * what an application without a host calls itself.
 * @param {object} ctx  The context record.
 * @returns {boolean} Whether a command buffer was submitted.
 * @example
 * <caption>One frame, one submit: endFrame ends the pass and hands the frame to the queue.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, cross, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 *
 * const cam = tree.createCamera({ eye: [129, 107, 172] })
 *
 * function frame(ms) {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   axes(ctx, { size: 100 })
 *   cross(ctx, { x: 40 + 320 * Math.abs(Math.sin(ms / 1200)), y: 150, size: 40, color: [1, 0.31, 0.85, 1] })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)                 // the frame’s command buffer, submitted
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 *
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
 * <caption>Click to tear down: the loop stops, dispose frees the target and the device and the canvas goes; click again for a fresh context.</caption>
 * import { init, dispose, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree } from 'webgpu.tree'
 *
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:#d8dee9;font:13px ui-monospace,monospace'
 * out.textContent = 'a context is running — click to dispose, click again to build one'
 *
 * let ctx = null
 * let frameId = 0
 *
 * async function start() {
 *   const canvas = document.body.insertBefore(document.createElement('canvas'), out)
 *   canvas.style.width = '400px'
 *   canvas.style.height = '300px'
 *   ctx = await init(canvas, { width: 400, height: 300 })
 *   out.textContent = 'a context is running — click the canvas to dispose, the body to build one'
 *   const scene = renderTarget(ctx)
 *   const cam = tree.createCamera({ eye: [0, 107, 215] })
 *   const frame = (ms) => {
 *     cam.eye[0] = 215 * Math.sin(ms / 1000)
 *     cam.eye[2] = 215 * Math.cos(ms / 1000)
 *     ctx.backend.bindTarget(ctx, scene)
 *     ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *     setCamera(ctx, cam)
 *     axes(ctx, { size: 100 })
 *     ctx.backend.bindTarget(ctx, SCREEN)
 *     image(ctx, scene.color)
 *     endFrame(ctx)
 *     frameId = requestAnimationFrame(frame)
 *   }
 *   frameId = requestAnimationFrame(frame)
 *   canvas.addEventListener('click', (e) => {
 *     e.stopPropagation()           // the click tears down; it does not rebuild
 *     cancelAnimationFrame(frameId)
 *     ctx.backend.bindTarget(ctx, SCREEN)
 *     dispose(ctx)                 // the layer’s targets, then the device
 *     canvas.remove()
 *     ctx = null
 *     out.textContent = 'click to build a fresh context'
 *   })
 * }
 *
 * document.addEventListener('click', async () => {
 *   if (ctx) return                 // one context at a time
 *   await start()
 * })
 * await start()
 *
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
