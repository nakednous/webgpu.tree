/**
 * @file Compute — a storage buffer, a dispatch, a readback.
 * @module webgpu.tree/compute
 * @license AGPL-3.0-only
 *
 * The render surface is the reference's; compute is the twin's own. WebGL 2 has
 * no storage buffers and no compute shaders, so there is nothing in `webgl.tree`
 * to mirror: a WebGL 2 figure computes through a float render target and a
 * fullscreen pass, and the pass is the kernel. WebGPU makes the kernel a stage
 * of its own, and the state a buffer both stages can read.
 *
 * ```
 * const values = storage(ctx, new Float32Array(64 * 4))   // the state
 * const kernel = program(ctx, wgsl, { compute: true })    // one @compute entry
 * bind(ctx, kernel, { values })                           // the storage seam
 * dispatch(ctx, [Math.ceil(64 / kernel.workgroup[0])])    // the kernel's pass
 * const bytes = readBuffer(ctx, values)                   // a copy on the frame's encoder
 * endFrame(ctx)                                           // one submit: the kernel, the copy, the draws
 * const first = await bytes                                // the promise, after the submit
 * ```
 *
 * The frame carries the compute pass beside the render pass: a `dispatch` opens
 * the one, the next render call ends it, and `endFrame` submits both in one
 * command buffer. A `readBuffer` records its copy on that encoder, so the read
 * answers the frame it was taken in — the promise resolves once `endFrame` has
 * submitted, never inside the frame.
 *
 * A storage buffer is also a *render* program's binding: a vertex or fragment
 * stage may declare `var<storage, read>` and read the state the kernel wrote,
 * with no texture in between. `bind` takes the record by the shader's name, the
 * same bag the uniforms travel in.
 */

'use strict';

/**
 * A storage buffer — the state a kernel reads and writes, and a render stage may
 * read. `data` seeds it: a typed array, an `ArrayBuffer`, or a byte size for a
 * buffer the GPU alone fills.
 * @details The record `{ id, gpu, size }` is what `bind` takes by the shader's
 * name, what `readBuffer` reads, and what `dispose` frees. The usage is the
 * API's; the default is storage, a seed and a readback's source.
 * @param {object} ctx  The context record.
 * @param {ArrayBuffer|ArrayBufferView|number} data  The seed, or its byte size.
 * @param {{ usage?:number, label?:string }} [opts]  `GPUBufferUsage` bits override
 *        the default; a label.
 * @returns {object|null} The record — `{ id, gpu, size }` — or null where the
 *          data is neither.
 * @example
 * <caption>A kernel writes a gradient into a storage buffer; a pass reads it straight back, with no texture between them.</caption>
 * import { init, endFrame, filter, program, bind, dispatch, storage } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 *
 * const values = storage(ctx, new Float32Array(64 * 4))
 * const kernel = program(ctx, `
 * ```wgsl
 * @group(0) @binding(0) var<storage, read_write> values: array<vec4f>;
 *
 * @compute @workgroup_size(64)
 * fn main(@builtin(global_invocation_id) gid: vec3u) {
 *   let i = gid.x;
 *   let t = f32(i) / 63.0;
 *   values[i] = vec4f(t, 1.0 - t, 0.5, 1.0);
 * }
 * ```
 * `, { compute: true })
 *
 * const show = program(ctx, `
 * ```wgsl
 * @group(0) @binding(0) var<storage, read> values: array<vec4f>;
 *
 * @fragment
 * fn fs(@location(0) vTexCoord: vec2f) -> @location(0) vec4f {
 *   return values[u32(clamp(floor(vTexCoord.x * 64.0), 0.0, 63.0))];
 * }
 * ```
 * `)
 *
 * function frame() {
 *   bind(ctx, kernel, { values })
 *   dispatch(ctx, [64 / kernel.workgroup[0]])
 *   filter(ctx, show, { values })
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

export function storage(ctx, data, opts) {
  if (!ctx || !ctx.backend) return null;
  return ctx.backend.createStorage(ctx, data, opts);
}

/**
 * Dispatch the bound compute program — workgroup counts, in the API's units.
 * @details One compute pass on the frame's encoder; the program's pipeline and
 * its group 0; the draws after it end the pass and begin the render pass on the
 * recorded target, and `endFrame` submits both together. The counts are the
 * API's: the invocations are `counts[0] · workgroup[0]`, and a kernel that may
 * run past its data guards with `if (i >= u.count) { return; }`.
 * @param {object} ctx  The context record.
 * @param {number[]} [counts]  `[x, y, z]` workgroups; `[1, 1, 1]` where absent.
 * @returns {object|null} The program dispatched, or null where the bound program
 *          is not a compute program.
 * @example
 * <caption>A dispatch of 64 invocations writes a ring of hues; the draws after it read the buffer.</caption>
 * import { init, endFrame, filter, program, bind, dispatch, storage } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 *
 * const values = storage(ctx, new Float32Array(64 * 4))
 * const kernel = program(ctx, `
 * ```wgsl
 * @group(0) @binding(0) var<storage, read_write> values: array<vec4f>;
 *
 * @compute @workgroup_size(64)
 * fn main(@builtin(global_invocation_id) gid: vec3u) {
 *   let i = gid.x;
 *   let a = f32(i) / 64.0 * 6.28318530718;
 *   values[i] = vec4f(0.5 + 0.5 * cos(a), 0.5 + 0.5 * cos(a + 2.094), 0.5 + 0.5 * cos(a + 4.188), 1.0);
 * }
 * ```
 * `, { compute: true })
 *
 * const show = program(ctx, `
 * ```wgsl
 * @group(0) @binding(0) var<storage, read> values: array<vec4f>;
 * @fragment
 * fn fs(@location(0) vTexCoord: vec2f) -> @location(0) vec4f {
 *   return values[u32(clamp(floor(vTexCoord.x * 64.0), 0.0, 63.0))];
 * }
 * ```
 * `)
 *
 * function frame() {
 *   bind(ctx, kernel, { values })
 *   dispatch(ctx, [Math.ceil(64 / kernel.workgroup[0])])
 *   filter(ctx, show, { values })
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

export function dispatch(ctx, counts) {
  if (!ctx || !ctx.backend) return null;
  return ctx.backend.dispatch(ctx, counts);
}

/**
 * Read a storage buffer back — the state the kernel wrote, on the CPU.
 * @details The copy is recorded on the frame's encoder, after the writes it must
 * see; the staging buffer is mapped once `endFrame` has submitted, so the
 * promise resolves a submission later. Call it in the frame, before `endFrame`:
 * a copy is not a pass's command, so the open pass ends first. The bytes are a
 * `Uint8Array`; the caller views them (`new Float32Array(bytes.buffer)`).
 * @param {object} ctx  The context record.
 * @param {object} storage  A record from `storage(ctx, data)`.
 * @param {{ offset?:number, size?:number }} [opts]  The block, in bytes; the
 *        whole buffer where absent. The size must be a positive multiple of 4.
 * @returns {Promise<Uint8Array>} The bytes, after the frame's submit.
 * @example
 * <caption>The kernel's first value comes back to the CPU before the first picture: a readback is a copy on the frame's encoder, mapped after the submit.</caption>
 * import { init, endFrame, filter, program, bind, dispatch, storage, readBuffer } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 *
 * const values = storage(ctx, new Float32Array(8 * 4))
 * const kernel = program(ctx, `
 * ```wgsl
 * @group(0) @binding(0) var<storage, read_write> values: array<vec4f>;
 *
 * @compute @workgroup_size(8)
 * fn main(@builtin(global_invocation_id) gid: vec3u) {
 *   values[gid.x] = vec4f(f32(gid.x) / 8.0, 0.7, 0.3, 1.0);
 * }
 * ```
 * `, { compute: true })
 *
 * const show = program(ctx, `
 * ```wgsl
 * @group(0) @binding(0) var<storage, read> values: array<vec4f>;
 * @fragment
 * fn fs(@location(0) vTexCoord: vec2f) -> @location(0) vec4f {
 *   return values[u32(clamp(floor(vTexCoord.x * 8.0), 0.0, 7.0))];
 * }
 * ```
 * `)
 *
 * bind(ctx, kernel, { values })
 * dispatch(ctx, [Math.ceil(8 / kernel.workgroup[0])])
 * const pending = readBuffer(ctx, values)
 * endFrame(ctx)                        // no canvas pass yet: the submit the copy rides
 * const bytes = await pending
 * const first = new Float32Array(bytes.buffer, 0, 4)   // [0, 0.7, 0.3, 1]
 * document.body.append('first value: ' + first[0].toFixed(2))
 *
 * function frame() {
 *   filter(ctx, show, { values })      // the buffer, drawn straight
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

export function readBuffer(ctx, storage, opts) {
  if (!ctx || !ctx.backend) {
    return Promise.reject(new Error('[webgpu.tree] readBuffer: a context is required.'));
  }
  return ctx.backend.readBuffer(ctx, storage, opts);
}
