/**
 * @file The pass composites — the covering quad, a fullscreen pass, the image
 * and the pipe chain.
 * @module webgpu.tree/pass
 * @license AGPL-3.0-only
 *
 * A WebGPU figure draws a picture with these: `fullscreen` answers the covering
 * geometry, `filter` runs a fullscreen pass over the bound target, `image` draws
 * a texture to a rect of it, `pipe` chains passes through two cached working
 * targets, and `releasePipe` frees a chain's pair. The pass program's own verb,
 * `program`, is the twin's and lives on the root page. These are
 * `@nakednous/idiom`'s, re-exported: the reference's pages document the same
 * verbs, and the twin's pass samples `vTexCoord` with v = 0 at the top where the
 * reference's is bottom-up.
 *
 * ```wgsl
 * @fragment
 * fn fs(@location(0) vTexCoord: vec2f) -> @location(0) vec4f {
 *   return vec4f(vTexCoord, 0.5, 1.0);
 * }
 * ```
 */

'use strict';

/**
 * `image`'s `mask` for the red channel alone.
 * @constant {boolean[]} RED
 */

/**
 * `image`'s `mask` for the green channel alone.
 * @constant {boolean[]} GREEN
 */

/**
 * `image`'s `mask` for the blue channel alone.
 * @constant {boolean[]} BLUE
 */

/**
 * `image`'s `mask` for the alpha channel alone.
 * @constant {boolean[]} ALPHA
 */

/**
 * `image`'s `mask` for colour without alpha.
 * @constant {boolean[]} RGB
 */

/**
 * `image`'s `blend`: src alpha over one-minus-src alpha.
 * @constant {string} NORMAL
 */

/**
 * `image`'s `blend`: one over one, additive.
 * @constant {string} ADD
 */

/**
 * `image`'s `blend`: dst colour over zero, multiplicative.
 * @constant {string} MULTIPLY
 */

/**
 * The covering geometry: two triangles in NDC, `aTexCoord` with v = 0 at the
 * top, created once per context and cached on the record.
 * @function fullscreen
 * @memberof webgpu.tree/pass
 * @param {object} ctx  The context record.
 * @returns {object} The backend's buffer record — `aPosition`, `aTexCoord`, its
 *          indices.
 * @example
 * <caption>The covering quad drawn with bind and draw: an 8 × 6 checker of 50 px squares.</caption>
 * import { init, endFrame, bind, draw, fullscreen, program } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 *
 * const checker = program(ctx, `
 * ```wgsl
 * @fragment
 * fn fs(@location(0) vTexCoord: vec2f) -> @location(0) vec4f {
 *   let cell = (floor(vTexCoord.x * 8.0) + floor(vTexCoord.y * 6.0)) % 2.0;
 *   return vec4f(mix(vec3f(0.075, 0.553, 0.459), vec3f(1.0, 0.82, 0.4), cell), 1.0);
 * }
 * ```
 * `)
 *
 * function frame() {
 *   bind(ctx, checker)
 *   draw(ctx, fullscreen(ctx))
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Run a fullscreen pass over the bound target: the program's uniforms from the
 * bag, `input` bound to every sampler it declares and the bag leaves unset, and
 * `uResolution` / `uTexelSize` filled where it declares them.
 * @function filter
 * @memberof webgpu.tree/pass
 * @param {object} ctx  The context record.
 * @param {object} prog  A pass program from `program(ctx, wgsl)`.
 * @param {object} [uniforms]  The pass's bag, by name; `null` when it has none.
 * @param {object} [input]  The image filtered: a texture, or a target (its
 *        `.color`).
 * @returns {object|null} The program bound, or null where nothing was drawn.
 * @example
 * <caption>A stage that names its own input: uScene, bound by the argument, shown colour-inverted — the ground turns pink.</caption>
 * import { init, endFrame, bind, draw, filter, image, program, renderTarget, SCREEN, setCamera, axes, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 *
 * const invert = program(ctx, `
 * ```wgsl
 * @group(0) @binding(0) var uScene: texture_2d<f32>;
 * @group(0) @binding(1) var uSampler: sampler;
 *
 * @fragment
 * fn fs(@location(0) vTexCoord: vec2f) -> @location(0) vec4f {
 *   return vec4f(1.0 - textureSample(uScene, uSampler, vTexCoord).rgb, 1.0);
 * }
 * ```
 * `)
 *
 * ctx.backend.bindTarget(ctx, scene)
 * ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 * setCamera(ctx, tree.createCamera({ eye: [129, 107, 172] }))
 * axes(ctx, { size: 100 })
 *
 * ctx.backend.bindTarget(ctx, SCREEN)
 * filter(ctx, invert, null, scene)   // uScene takes the target’s colour texture
 * endFrame(ctx)
 */

/**
 * Draw a texture to the bound target, its rect in target pixels with the origin
 * bottom-left, cover by default; `tint`, `mask` and `blend` are the options.
 * @function image
 * @memberof webgpu.tree/pass
 * @param {object} ctx  The context record.
 * @param {object} tex  A texture record — `texture`, `upload`, a target’s
 *        `.color`.
 * @param {{ x?:number, y?:number, width?:number, height?:number, tint?:number[],
 *           mask?:boolean[], blend?:string }} [opts]  The rect, a tint
 *        multiplier, a colour mask (`RED`, …), a blend (`NORMAL`, `ADD`,
 *        `MULTIPLY`).
 * @returns {object|null} The flat program’s record.
 * @example
 * <caption>A target as a 160 × 120 inset, 20 px in from the bottom-left corner of a yellow canvas.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, texture, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const yellow = texture(ctx, { data: new Uint8Array([255, 209, 102, 255]), width: 1, height: 1 })
 *
 * ctx.backend.bindTarget(ctx, scene)
 * ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 * setCamera(ctx, tree.createCamera({ eye: [129, 107, 172] }))
 * axes(ctx, { size: 100 })
 *
 * ctx.backend.bindTarget(ctx, SCREEN)
 * image(ctx, yellow)                 // the canvas, every pixel
 * const s = canvas.width / canvas.clientWidth   // the inset is given in logical pixels
 * image(ctx, scene.color, { x: 20 * s, y: 20 * s, width: 160 * s, height: 120 * s })
 * endFrame(ctx)
 */

/**
 * Run a source through a chain of fullscreen passes and show the result on the
 * bound target: each pass reads the last one’s side, two working targets are
 * cached under `key`, and `display` draws the end with `image`.
 * @function pipe
 * @memberof webgpu.tree/pass
 * @param {object} ctx  The context record.
 * @param {object} source  A texture, or a target (its `.color`).
 * @param {object|object[]} passes  One pass or an array of them — a program, or
 *        `{ program, uniforms }`; a falsy entry is skipped.
 * @param {{ display?:boolean, allocate?:boolean, key?:string, ping?:object,
 *           pong?:object, clear?:boolean, clearFn?:function,
 *           clearDisplay?:boolean, clearDisplayFn?:function,
 *           draw?:function }} [opts]  The chain’s own settings: `display` shows
 *        the last side on the bound target, `key` names the cached pair.
 * @returns {object} The chain’s last target.
 * @example
 * <caption>Pixelate into 20 × 20 cells, then invert: magenta turns green, yellow blue, the ground pink.</caption>
 * import { init, endFrame, image, pane, pipe, program, renderTarget, SCREEN, setCamera, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 *
 * const pixelate = program(ctx, `
 * ```wgsl
 * @group(0) @binding(0) var uSource: texture_2d<f32>;
 * @group(0) @binding(1) var uSampler: sampler;
 * @group(0) @binding(2) var<uniform> uCells: f32;
 *
 * @fragment
 * fn fs(@location(0) vTexCoord: vec2f) -> @location(0) vec4f {
 *   let cell = (floor(vTexCoord * uCells) + 0.5) / uCells;
 *   return textureSample(uSource, uSampler, cell);
 * }
 * ```
 * `)
 * const invert = program(ctx, `
 * ```wgsl
 * @group(0) @binding(0) var uSource: texture_2d<f32>;
 * @group(0) @binding(1) var uSampler: sampler;
 *
 * @fragment
 * fn fs(@location(0) vTexCoord: vec2f) -> @location(0) vec4f {
 *   return vec4f(1.0 - textureSample(uSource, uSampler, vTexCoord).rgb, 1.0);
 * }
 * ```
 * `)
 *
 * ctx.backend.bindTarget(ctx, scene)
 * ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 * setCamera(ctx, tree.createCamera({ eye: [0, 0, 170] }))
 * pane(ctx, [-110, 70, 0], [30, 70, 0], [30, -70, 0], [-110, -70, 0], { color: [1, 0.31, 0.85, 1] })
 * pane(ctx, [-30, 70, 1], [110, 70, 1], [110, -70, 1], [-30, -70, 1], { color: [1, 0.82, 0.4, 1] })
 *
 * ctx.backend.bindTarget(ctx, SCREEN)
 * pipe(ctx, scene, [{ program: pixelate, uniforms: { uCells: 20 } }, invert])   // the chain’s end on the canvas
 * endFrame(ctx)
 */

/**
 * Free the working targets a chain cached under `key`, or every one of them.
 * @function releasePipe
 * @memberof webgpu.tree/pass
 * @param {object} ctx  The context record.
 * @param {string} [key]  The chain’s key; absent (or `true`), every cached pair.
 * @returns {void}
 * @example
 * <caption>Two turning squares: click to switch the pixelation off and on — switching it off releases the cached pair, so coming back allocates a fresh one.</caption>
 * import { init, endFrame, image, pane, pipe, program, releasePipe, renderTarget, SCREEN, setCamera, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 0, 170] })
 *
 * const pixelate = program(ctx, `
 * ```wgsl
 * @group(0) @binding(0) var uSource: texture_2d<f32>;
 * @group(0) @binding(1) var uSampler: sampler;
 * @group(0) @binding(2) var<uniform> uCells: f32;
 *
 * @fragment
 * fn fs(@location(0) vTexCoord: vec2f) -> @location(0) vec4f {
 *   let cell = (floor(vTexCoord * uCells) + 0.5) / uCells;
 *   return textureSample(uSource, uSampler, cell);
 * }
 * ```
 * `)
 *
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:#d8dee9;font:13px ui-monospace,monospace'
 * let effect = true
 * let last = null, pairs = 0
 *
 * canvas.addEventListener('click', () => {
 *   effect = !effect
 *   if (!effect) releasePipe(ctx, 'fx')   // the cached pair goes; on again, pipe allocates another
 * })
 *
 * // a square of half-diagonal 70 centred at (cx, 0), turned by a
 * const square = (cx, a, z) => [0, 1, 2, 3].map((k) => [cx + 70 * Math.cos(a - k * Math.PI / 2), 70 * Math.sin(a - k * Math.PI / 2), z])
 *
 * function frame(ms) {
 *   const a = ms / 2000
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   pane(ctx, ...square(-40, a, 0), { color: [1, 0.31, 0.85, 1] })
 *   pane(ctx, ...square(40, -a, 1), { color: [1, 0.82, 0.4, 1] })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   if (effect) {
 *     const target = pipe(ctx, scene, { program: pixelate, uniforms: { uCells: 16 } }, { key: 'fx' })
 *     if (target !== last) { last = target; pairs += 1 }   // every time it comes back, a fresh pair
 *   } else {
 *     image(ctx, scene.color)
 *   }
 *   out.textContent = (effect ? 'pixelated' : 'released') + ' · pairs allocated: ' + pairs
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */
