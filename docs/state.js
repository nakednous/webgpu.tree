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
 * <caption>A value across frames: one pass a frame, each folding a jittered sample into the mean its read side carries — the image converges as the count grows.</caption>
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
 *   uJitter: vec2f,
 *   uPixel: vec2f,
 *   uWeight: f32,
 * };
 * @group(0) @binding(0) var<uniform> u: U;
 * @group(0) @binding(1) var uScene: texture_2d<f32>;
 * @group(0) @binding(2) var uSampler: sampler;
 *
 * @fragment
 * fn fs(@location(0) vTexCoord: vec2f, @builtin(position) at: vec4f) -> @location(0) vec4f {
 *   let grid = (floor(at.xy) + u.uJitter) * u.uPixel;
 *   let q = vec2f(grid.x * 1.5, grid.y) - vec2f(0.75, 0.5);   // a disc, aspect-corrected
 *   let r = length(q);
 *   let figure = step(r, 0.3) * step(0.5, fract(r * r * 900.0));   // a zone plate
 *   let estimate = mix(vec3f(0.10, 0.12, 0.17), vec3f(0.93, 0.76, 0.31), figure);
 *   return vec4f(mix(textureSample(uScene, uSampler, vTexCoord).rgb, estimate, u.uWeight), 1.0);
 * }
 * ```
 * `)
 *
 * // 16F, not 8-bit: the increment shrinks with the count, and an 8-bit target
 * // would quantize it away
 * const mean = state(ctx, { width: 400, height: 300, format: 'rgba16float' })
 *
 * const R2 = [0.7548776662466927, 0.5698402909980532]   // one offset a frame
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:#d8dee9;font:13px ui-monospace,monospace'
 * const reset = document.body.appendChild(document.createElement('button'))
 * reset.textContent = 'reset'
 * reset.style.cssText = 'position:absolute;right:8px;top:8px'
 * reset.onclick = () => mean.reset()
 *
 * function frame() {
 *   const n = mean.count
 *   mean.pass(accum, {
 *     uJitter: [(n * R2[0]) % 1, (n * R2[1]) % 1],
 *     uWeight: 1 / (n + 1),
 *     uPixel: [1 / mean.read.width, 1 / mean.read.height],
 *   })
 *   image(ctx, mean.read.color)
 *   out.textContent = 'n = ' + n
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */
