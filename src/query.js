/**
 * @file Occlusion queries — the delayed verdict the notation spells `query`.
 * @module webgpu.tree/query
 * @license AGPL-3.0-only
 *
 * The twin asks the question WebGPU asks: a `GPUQuerySet` of type `occlusion`
 * holds one count per question, `beginOcclusionQuery`/`endOcclusionQuery` wrap
 * the bound's own draw inside the frame's render pass, and the count arrives by
 * `resolveQuerySet` into a mappable buffer — eight bytes a query, the offset a
 * 256-byte multiple — mapped after the submission that resolved it. Nothing comes
 * back synchronously, which is the notation's own shape rather than a difference
 * from it: the answer lands a frame or more later, and until it does the slot
 * reads the verdict before it.
 *
 * ```
 * query(ctx, { pool }) → { ask(draw), value, latency, pending, dispose }
 * ```
 *
 * @details
 * One question is recorded per `ask`, and the slot keeps the ring a frame's worth
 * of questions needs: a resolution is mapped by the queue after the frame's
 * submit, so a question's answer cannot be read in the frame that asked. `value`
 * is the last count that arrived, `true` until one does — the conservative default
 * the technique leans on — and `latency` is how many asks the last one took.
 *
 * WebGPU has no conservative target: ES 3.0's ANY_SAMPLES_PASSED_CONSERVATIVE
 * lets a driver over-report in the safe direction, and the twin's count is exact.
 * The difference is the platform's, and it changes nothing a caller writes: the
 * verdict still says whether any sample of the bound survived.
 *
 * The slot paints nothing. The caller wraps a bound, and the frame's own pass and
 * writes are the technique's business — but a question must not cross a pass
 * boundary: a clear, a target bind or a `readPixel` ends the pass it was asked in.
 */

'use strict';

import { BUFFER_USAGE } from './flags.js';
import { endPass, ensurePass, frameOf } from './frame.js';

/** The bytes a resolved occlusion count occupies, and the offset's own alignment. */
const RESULT_BYTES = 8;
const RESULT_OFFSET_ALIGNMENT = 256;

/**
 * One bound's verdict slot, asked once a frame and read a frame or more later.
 * @param {object} ctx  The context record.
 * @param {{ pool?:number }} [opts]
 *        pool: how many questions may be in flight at once, default 8 — one per
 *        frame of latency the ring is expected to cover.
 * @returns {{ ask:function(function():void):boolean, value:boolean, latency:number,
 *             pending:number, dispose:function():void }}
 *          ask(draw): record this frame's question around `draw`, which must draw
 *          only the bound, and report whether it was recorded; a full pool skips
 *          the frame's question. value: the last count that arrived (`true` until
 *          one does, the conservative default). latency: how many asks the last
 *          verdict took. pending: how many questions are in flight.
 * @example
 * <caption>A cube slides behind a wall; the verdict is asked against the wall's depth, and the cube draws on the frame before's answer.</caption>
 * import { init, endFrame, bind, buffer, draw, image, program, query, renderTarget, setCamera, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)                             // the canvas pass carries no depth; a target does
 *
 * const unit = buffer(ctx, tree.platonic(tree.HEXAHEDRON, { radius: 1 }))
 * const WGSL = `
 * ```wgsl
 * struct U {
 *   uModelViewProjectionMatrix: mat4x4f,
 *   uColor: vec3f,
 * };
 * @group(0) @binding(0) var<uniform> u: U;
 *
 * @vertex
 * fn vs(@location(0) aPosition: vec3f) -> @builtin(position) vec4f {
 *   return u.uModelViewProjectionMatrix * vec4f(aPosition, 1.0);
 * }
 *
 * @fragment
 * fn fs() -> @location(0) vec4f {
 *   return vec4f(u.uColor, 1.0);
 * }
 * ```
 * `
 * const prog = program(ctx, WGSL, { buffers: unit.bufferLayouts })
 * setCamera(ctx, tree.createCamera({ eye: [0, 120, 420] }))
 * const wall = tree.mat4FromTRS(tree.mat4(), 0, 0, -260, 0, 0, 0, 1, 260, 200, 4)
 * const M = tree.mat4()
 * const verdict = query(ctx, { pool: 4 })
 *
 * function frame(ms) {
 *   tree.mat4FromTRS(M, 0, 0, -260 + 180 * Math.cos(ms / 1400), 0, 0, 0, 1, 70, 70, 70)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   bind(ctx, prog, { uColor: [0.5, 0.55, 0.6] })
 *   draw(ctx, unit, wall)                                     // the occluder, before the question
 *   bind(ctx, prog, { uColor: [1, 0.82, 0.4] })
 *   if (verdict.value) draw(ctx, unit, M)                     // the answer an earlier frame left
 *   verdict.ask(() => draw(ctx, unit, M))                     // this frame's question
 *   ctx.backend.bindTarget(ctx, null)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */
export function query(ctx, opts) {
  const o = opts || {};
  const device = ctx && ctx.device;
  const pool = Math.max(1, Math.floor(typeof o.pool === 'number' ? o.pool : 8));
  const live = [];
  const free = [];
  let dead = false;

  const make = () => {
    const set = device.createQuerySet({ type: 'occlusion', count: 1, label: 'query' });
    const buffer = device.createBuffer({
      size: RESULT_OFFSET_ALIGNMENT,                          // the resolve offset's alignment, one count's worth
      usage: BUFFER_USAGE.QUERY_RESOLVE | BUFFER_USAGE.MAP_READ,
      label: 'query result',
    });
    return { set, buffer };
  };

  const slot = {
    ask(draw) {
      if (dead) return false;
      slot.asks += 1;
      if (live.length >= pool) return false;                  // the ring is full: no question this frame
      const s = free.pop() || make();
      const f = frameOf(ctx);
      endPass(ctx);                                           // a pass declares the set it will be asked in
      f.querySet = s.set;
      ensurePass(ctx);                                        // the question's own pass, same attachments
      f.pass.beginOcclusionQuery(0);
      draw();
      f.pass.endOcclusionQuery();
      f.querySet = null;
      const issued = slot.asks;
      live.push(s);
      f.resolves.push({
        set: s.set,
        buffer: s.buffer,
        done: (count) => {
          slot._value = count > 0;
          slot._latency = issued === slot.asks ? 1 : Math.max(1, slot.asks - issued + 1);
          const i = live.indexOf(s);
          if (i >= 0) live.splice(i, 1);
          free.push(s);
        },
      });
      return true;
    },

    asks: 0,
    _value: true,
    _latency: 0,

    get value() { return slot._value; },
    get latency() { return slot._latency; },
    get pending() { return live.length; },

    dispose() {
      if (dead) return;
      dead = true;
      for (const s of live) { s.set.destroy(); s.buffer.destroy(); }
      for (const s of free) { s.set.destroy(); s.buffer.destroy(); }
      live.length = 0;
      free.length = 0;
      if (ctx.queries) ctx.queries.delete(slot);
    },
  };
  if (!ctx.queries) ctx.queries = new Set();
  ctx.queries.add(slot);
  return slot;
}

/** The bytes a resolved count occupies, for the frame's own bookkeeping. @ignore */
export { RESULT_BYTES };
