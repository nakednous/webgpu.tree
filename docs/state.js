/**
 * @file `state` — a value carried across frames in a pair of render targets.
 * @module webgpu.tree/state
 * @license AGPL-3.0-only
 *
 * A target that is a value mutated over time rather than a picture passed
 * through stages: `.read` is the side the last pass wrote, `.write` the side the
 * next one writes, and `pass` runs a fullscreen pass from the first into the
 * second and swaps them. The caller owns the object; the pair and the counter
 * are read-only, so they cannot drift apart.
 */

'use strict';

/**
 * A pair of render targets holding one value across frames.
 * @function state
 * @memberof webgpu.tree/state
 * @param {object} ctx  The context record.
 * @param {{ width?:number, height?:number, format?:*, float?:boolean,
 *           minMag?:*, wrap?:*, clear?:number[] }} [opts]  `renderTarget`’s
 *        sampling and format options, and only those: one colour texture a side,
 *        no depth, no multisampling. `clear` is the colour `reset()` clears both
 *        sides to.
 * @returns {object} The state: `read` · `write` · `count`, and `pass(prog,
 *          uniforms)` · `swap()` · `reset()` · `resize(w, h)` · `dispose()`.
 * @example
 * <caption>A value across frames: each pass folds a jittered sample into the mean its read side carries, so the frames converge as the count grows.</caption>
 * import { init, endFrame, image, program, state } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 *
 * const accum = program(ctx, `
 * ```wgsl
 * struct U {
 *   uWeight: f32,
 * };
 * @group(0) @binding(0) var<uniform> u: U;
 * @group(0) @binding(1) var uScene: texture_2d<f32>;
 * @group(0) @binding(2) var uSampler: sampler;
 *
 * @fragment
 * fn fs(@location(0) vTexCoord: vec2f) -> @location(0) vec4f {
 *   let estimate = mix(vec3f(0.09, 0.11, 0.16), vec3f(0.94, 0.76, 0.31),
 *     step(0.5, fract(vTexCoord.x * 40.0)));
 *   return vec4f(mix(textureSample(uScene, uSampler, vTexCoord).rgb, estimate, u.uWeight), 1.0);
 * }
 * ```
 * `)
 *
 * // 16F, not 8-bit: the increment shrinks with the count, and an 8-bit target
 * // would quantize it away
 * const mean = state(ctx, { width: 256, height: 192, format: 'rgba16float' })
 * for (let n = 0; n < 8; n++) mean.pass(accum, { uWeight: 1 / (mean.count + 1) })
 * image(ctx, mean.read.color)
 * endFrame(ctx)
 */
