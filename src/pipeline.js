/**
 * @file Render state, and the pipeline a draw selects from it.
 * @module webgpu.tree/pipeline
 * @license AGPL-3.0-only
 *
 * WebGPU bakes render state into the pipeline: the depth test, the blend, the
 * colour mask, the cull, the topology, the attachment's format and its sample
 * count are all fields of a `GPURenderPipelineDescriptor`, fixed when the
 * pipeline is made. A state flip is therefore a second pipeline, cached on the
 * program under a key — the twin's `setState` records the state and the next
 * draw picks the variant, exactly the "second pipeline, cached by state key"
 * the design table names.
 *
 * ```
 * setState(ctx, { depth: false })        // the prior state comes back
 * key = pipelineKey(program.id, state, pass)
 * ```
 *
 * `pipelineKey` is a pure function of its arguments: the same program, state and
 * attachment give the same pipeline, and one field differing gives another.
 * The depth *state* is the test and the write; the depth *attachment* is the
 * pass's, and it is part of the key on its own — a pipeline set on a pass that
 * has a depth attachment must declare the field, so a depth-off state draws
 * there with `compare: 'always'` and no write, a different pipeline from the
 * one the same state draws with on the canvas, which has no attachment at all.
 */

'use strict';

import { COLOR_WRITE } from './flags.js';

/**
 * The state a context starts in and the token `setState` hands back: the
 * platform's depth compare (`'less'`, stated rather than inherited, §7 #93),
 * no blend, every channel written, no cull, triangles.
 */
export const BASE_STATE = Object.freeze({
  depth: true,
  blend: null,
  mask: null,
  cull: 'none',
  topology: 'triangle-list',
  depthCompare: 'less',
});

/** `idiom`'s three blend names, as WebGPU blend state. */
export const BLENDS = Object.freeze({
  NORMAL: {
    color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  },
  ADD: {
    color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
  },
  MULTIPLY: {
    color: { srcFactor: 'dst', dstFactor: 'zero', operation: 'add' },
    alpha: { srcFactor: 'dst', dstFactor: 'zero', operation: 'add' },
  },
});

/**
 * The state a call asks for, merged over the one in effect. A field the call
 * leaves out keeps its value; nothing is reset by a partial state.
 * @param {object} prior  The state in effect.
 * @param {object} next  The fields asked for.
 * @returns {object} The new state.
 * @ignore
 * @example
 * resolveState(BASE_STATE, { depth: false }).depth   // false
 */
export function resolveState(prior, next) {
  if (!next) return prior;
  return { ...prior, ...next };
}

/** `image`'s colour mask (`[r, g, b, a]` booleans) as `GPUColorWrite` bits. */
export function writeMaskOf(mask) {
  return (mask[0] ? COLOR_WRITE.R : 0) | (mask[1] ? COLOR_WRITE.G : 0) |
    (mask[2] ? COLOR_WRITE.B : 0) | (mask[3] ? COLOR_WRITE.A : 0);
}

/**
 * The key a pipeline variant is cached under: every field a render pipeline
 * bakes and the attachment it draws into. The depth field names the pass's
 * depth, because the attachment is what the pipeline must declare: the
 * compare where the state asks for the test (`z:less`), the pass's format
 * where it does not (`z:off:depth24plus`), and `z:-` for a pass with no depth
 * attachment, where the field is absent altogether. A state that asks for
 * depth in a depth-less pass therefore keys as a pass with none — WebGPU
 * refuses the other way round — and two passes that differ only in their
 * depth attachment never share a pipeline.
 * @param {string|number} id  The program's id.
 * @param {object} state  The state in effect.
 * @param {{ depth:boolean, depthFormat:string|null, formats:string[], samples:number }} pass
 *        What the pass draws into: a depth attachment at all, the colour
 *        attachments' formats, the sample count.
 * @returns {string} The key.
 * @ignore
 * @example
 * pipelineKey(1, BASE_STATE, { depth: false, depthFormat: null, formats: ['rgba8unorm'], samples: 1 })
 * // '1|z:-|b:-|m:-|c:none|t:triangle-list|f:rgba8unorm|s:1'
 */
export function pipelineKey(id, state, pass) {
  const depth = state.depth && pass.depth;
  // the pass's own depth presence is part of the key, not only the test: a
  // pipeline set on a pass that HAS a depth attachment must declare it, so a
  // state that asks for no test still needs a different pipeline there than on
  // a pass without one (the canvas)
  const z = pass.depth ? (depth ? 'z:' + state.depthCompare : 'z:off:' + pass.depthFormat) : 'z:-';
  return [
    id,
    z,
    'b:' + (state.blend || '-'),
    'm:' + (state.mask ? state.mask.map((bit) => (bit ? 1 : 0)).join('') : '-'),
    'c:' + state.cull,
    't:' + state.topology,
    'f:' + pass.formats.join(','),
    's:' + pass.samples,
  ].join('|');
}

/**
 * Build the pipeline a state selects for a program and an attachment.
 * @param {object} ctx  The context record.
 * @param {object} prog  A program record with its module, entry names, layout.
 * @param {object} state  The state in effect.
 * @param {{ depth:boolean, depthFormat:string|null, formats:string[], samples:number }} pass
 * @returns {GPURenderPipeline} The pipeline.
 */
export function createPipeline(ctx, prog, state, pass) {
  const depth = state.depth && pass.depth;
  const targets = pass.formats.map((format) => {
    const target = { format };
    if (state.blend && BLENDS[state.blend]) target.blend = BLENDS[state.blend];
    if (state.mask) target.writeMask = writeMaskOf(state.mask);
    return target;
  });
  const descriptor = {
    layout: prog.pipelineLayout,
    vertex: { module: prog.module, entryPoint: prog.vs, buffers: prog.vertexLayouts },
    fragment: { module: prog.module, entryPoint: prog.fs, targets },
    primitive: { topology: state.topology, cullMode: state.cull, frontFace: 'ccw' },
    multisample: { count: pass.samples || 1 },
  };
  if (pass.depth) {
    // the attachment is the pass's: a pipeline set on it must state the depth
    // field even where the state asks for no test, so "off" is always + no write
    descriptor.depthStencil = {
      format: pass.depthFormat,
      depthWriteEnabled: depth,
      depthCompare: depth ? (state.depthCompare === 'less-equal' ? 'less-equal' : 'less') : 'always',
    };
  }
  return ctx.device.createRenderPipeline(descriptor);
}
