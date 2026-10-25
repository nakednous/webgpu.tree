/**
 * @file Render targets — the offscreen surfaces a figure draws into and shows.
 * @module webgpu.tree/target
 * @license AGPL-3.0-only
 *
 * `renderTarget` makes a colour texture (and, by default, a depth one) the
 * figure draws into and shows with `image`; `SCREEN` is the canvas as a target
 * to bind. The record's shape is `@nakednous/idiom`'s; the textures are the
 * `webgpu-utils` backend's. A WebGPU canvas has no depth attachment, so a scene
 * with depth states a target of its own.
 */

'use strict';

/**
 * The canvas as the target to bind: `ctx.backend.bindTarget(ctx, SCREEN)`.
 * @constant {*} SCREEN
 */

/**
 * A render target: a colour texture, a depth attachment by default, an optional
 * multisampled pair resolved when the pass ends.
 * @function renderTarget
 * @memberof webgpu.tree/target
 * @param {object} ctx  The context record.
 * @param {{ width?:number, height?:number, depth?:*, depthTexture?:boolean,
 *           color?:*, format?:*, float?:boolean, samples?:number,
 *           minMag?:*, wrap?:* }} [opts]  The size (default the canvas’s own
 *        pixels), the depth attachment, one format for the colour or a name per
 *        attachment, a float format, a sample count, sampling state.
 * @returns {object} The target: `.color`, `.depth` where sampleable, one
 *          property per named attachment, `.width`, `.height`, `.formats`,
 *          `.resize(w, h)`, `.resolve()`, `.dispose()`.
 * @example
 * <caption>Axes rendered into a 100 × 75 target and stretched to the canvas: the low resolution shows as blocky lines.</caption>
 * import { init, endFrame, bind, draw, image, renderTarget, SCREEN, setCamera, axes, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 *
 * const small = renderTarget(ctx, { width: 100, height: 75 })
 * ctx.backend.bindTarget(ctx, small)
 * ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 * setCamera(ctx, tree.createCamera({ eye: [129, 107, 172] }))
 * axes(ctx, { size: 100 })
 *
 * ctx.backend.bindTarget(ctx, SCREEN)
 * image(ctx, small.color)
 * endFrame(ctx)
 * @example
 * <caption>The same axes in two 100 × 150 targets shown at twice their size: single-sampled on the left with hard stair-steps, `samples: 4` and resolved on the right.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 *
 * const cam = tree.createCamera({ eye: [169, 141, 225] })
 * const plain = renderTarget(ctx, { width: 100, height: 150 })
 * const smooth = renderTarget(ctx, { width: 100, height: 150, samples: 4 })
 * for (const target of [plain, smooth]) {
 *   ctx.backend.bindTarget(ctx, target)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam, { aspect: 100 / 150 })
 *   axes(ctx, { size: 100, width: 2 })
 * }
 * smooth.resolve()
 *
 * ctx.backend.bindTarget(ctx, SCREEN)
 * const half = Math.round(ctx.width / 2)
 * image(ctx, plain.color, { x: 0, y: 0, width: half, height: ctx.height })
 * image(ctx, smooth.color, { x: half, y: 0, width: half, height: ctx.height })
 * endFrame(ctx)
 */
