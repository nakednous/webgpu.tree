/**
 * @file The twin's frame: one command encoder, one render pass at a time, a
 * submit at the frame's end.
 * @module webgpu.tree/frame
 * @license AGPL-3.0-only
 *
 * WebGPU has no "bind a framebuffer" call: a render pass encoder is begun on a
 * command encoder with its attachments, draws on it, and ends. The twin keeps
 * that model *inside* — the flat call the bridge's surface offers survives, the
 * block does not leak.
 *
 * ```
 * bindTarget(ctx, target | null)   // the target is recorded, the pass is begun on the first draw
 * clearTarget(ctx, color)          // the pass's loadOp, and its clear value
 * ensurePass(ctx)                  // begun lazily, here, before a draw or a viewport
 * endPass(ctx) · endFrame(ctx)     // ended, then the frame's encoder is submitted
 * ```
 *
 * Two orderings shape the file. A **draw** begins its pass lazily, with
 * `loadOp: 'load'` — a bind does not clear, as a WebGL bind does not. A
 * **clear** cannot wait: `state`'s pair is cleared as it is made and sampled by
 * the very next pass, and `pipe` clears each working target before its stage,
 * so `clear` ends whatever pass is open and begins one on the bound target with
 * `loadOp: 'clear'` and this colour. What is open after a clear is a pass that
 * has cleared the attachment and drawn nothing, which the next bind or the
 * frame's end closes. That is what a GL clear of a bound framebuffer does: the
 * attachment starts over, at once.
 *
 * `endFrame` submits the frame's encoder and resets the uniform arena. The host
 * calls it from `afterFrame`, after `pointer.flush()`, so a pointer
 * handler's draws are in the frame; without a host the application calls it
 * itself.
 */

'use strict';

const ZERO = [0, 0, 0, 0];

/**
 * The frame state of a context record, created on first use.
 * @param {object} ctx  The context record.
 * @returns {{ encoder:object|null, pass:object|null, target:object|null,
 *             viewport:number[]|null, loadOp:string|null, clear:number[]|null,
 *             submissions:number }}
 * @ignore
 * @example
 * frameOf(ctx).target   // the target the frame is drawing into, null for the canvas
 */
export function frameOf(ctx) {
  if (ctx.frame) return ctx.frame;
  ctx.frame = {
    encoder: null,
    pass: null,
    target: null,
    viewport: null,
    loadOp: null,
    clear: null,
    submissions: 0,
  };
  return ctx.frame;
}

/** The pixel size a target draws at — the canvas's own when the target is SCREEN. */
export function targetSize(ctx, target) {
  return target ? [target.width, target.height] : [ctx.width, ctx.height];
}

/** The viewport in effect: the one asked for, or the target's whole surface. */
export function viewportOf(ctx) {
  const f = frameOf(ctx);
  const vp = f.viewport || [0, 0, ...targetSize(ctx, f.target)];
  return vp.slice(0, 4);
}

/** Clear values are arrays in the interface and objects in WebGPU. */
export function clearValueOf(color) {
  const c = color || ZERO;
  return { r: c[0], g: c[1], b: c[2], a: c[3] };
}

/**
 * Record the target the frame draws into. The pass itself is begun on the next
 * draw, so a clear issued in between still chooses its `loadOp`. A target
 * already current is left alone: re-binding it does not restart it.
 * @param {object} ctx  The context record.
 * @param {object|null} target  A target record, or null for the canvas.
 */
export function bindTarget(ctx, target) {
  const f = frameOf(ctx);
  const next = target || null;
  if (f.pass && f.target === next) return;
  if (f.pass) endPass(ctx);
  f.target = next;
  f.viewport = null;
}

/**
 * Clear the bound target, now: a pass is begun on it with `loadOp: 'clear'` and
 * this colour, after any open pass is ended — a clear of a bound framebuffer
 * restarts the whole attachment, and a GL clear does it at once.
 * @param {object} ctx  The context record.
 * @param {number[]} [color]  RGBA in 0…1, default transparent black.
 */
export function clearTarget(ctx, color) {
  const f = frameOf(ctx);
  f.clear = color ? [color[0], color[1], color[2], color[3]] : ZERO;
  endPass(ctx);
  f.loadOp = 'clear';
  ensurePass(ctx);
}

/** The descriptor a pass is begun with: the bound target's attachments, the load and clear the frame carries. */
export function passDescriptor(ctx, f) {
  const clear = f.loadOp === 'clear';
  const loadOp = clear ? 'clear' : 'load';
  const clearValue = clearValueOf(f.clear);
  const colorAttachments = [];
  if (!f.target) {
    colorAttachments.push({
      view: ctx.context.getCurrentTexture().createView(),
      loadOp,
      clearValue,
      storeOp: 'store',
    });
  } else {
    const target = f.target;
    for (let i = 0; i < target.attachments.length; i++) {
      const attachment = { view: target.attachments[i], loadOp, clearValue, storeOp: 'store' };
      if (target.resolveTargets && target.resolveTargets[i]) attachment.resolveTarget = target.resolveTargets[i];
      colorAttachments.push(attachment);
    }
  }
  const descriptor = { colorAttachments, label: 'webgpu.tree pass' };
  if (f.target && f.target.depthView) {
    descriptor.depthStencilAttachment = {
      view: f.target.depthView,
      depthLoadOp: loadOp,
      depthClearValue: ctx.depthClearValue === undefined ? 1 : ctx.depthClearValue,
      depthStoreOp: 'store',
    };
  }
  return descriptor;
}

/**
 * The frame's open pass, begun here if it is not yet — with the target bound,
 * the `loadOp` the frame carries and the viewport in effect.
 * @param {object} ctx  The context record.
 * @returns {GPURenderPassEncoder}
 */
export function ensurePass(ctx) {
  const f = frameOf(ctx);
  if (f.pass) return f.pass;
  if (!f.encoder) f.encoder = ctx.device.createCommandEncoder({ label: 'webgpu.tree frame' });
  f.pass = f.encoder.beginRenderPass(passDescriptor(ctx, f));
  const vp = f.viewport || [0, 0, ...targetSize(ctx, f.target)];
  f.pass.setViewport(vp[0], vp[1], vp[2], vp[3], 0, 1);
  f.loadOp = null;
  return f.pass;
}

/** End the open pass, if any. A no-op otherwise. */
export function endPass(ctx) {
  const f = frameOf(ctx);
  if (!f.pass) return;
  f.pass.end();
  f.pass = null;
}

/**
 * Submit the frame's encoder and start the next frame's arena — the implementation
 * of the public `endFrame(ctx)`, which is `context.js`'s wrapper. The host's
 * `afterFrame` calls that one, or the application does.
 * @param {object} ctx  The context record.
 * @returns {boolean} Whether a command buffer was submitted.
 * @ignore
 * @example
 * const canvasHost = host.createHost(canvas, { afterFrame: () => endFrame(ctx) })
 */
export function endFrame(ctx) {
  const f = frameOf(ctx);
  endPass(ctx);
  if (!f.encoder) return false;
  ctx.device.queue.submit([f.encoder.finish()]);
  f.encoder = null;
  f.submissions += 1;
  if (ctx.arena) ctx.arena.reset();
  return true;
}

/**
 * Set the viewport the pass draws in, or ask only. The rect is in the target's
 * pixels, origin top-left — WebGPU's own framebuffer space, which is why
 * `image`'s default rect is the viewport itself.
 * @param {object} ctx  The context record.
 * @param {number[]} [rect]  `[x, y, width, height]`; absent, ask only.
 * @returns {number[]} The viewport in effect before the call.
 */
export function setViewport(ctx, rect) {
  const f = frameOf(ctx);
  const prior = viewportOf(ctx);
  if (rect !== undefined) {
    f.viewport = [rect[0], rect[1], rect[2], rect[3]];
    if (f.pass) f.pass.setViewport(rect[0], rect[1], rect[2], rect[3], 0, 1);
  }
  return prior;
}
