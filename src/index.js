/**
 * @file webgpu.tree — @nakednous/tree and @nakednous/host on raw WebGPU, the
 * composites over @nakednous/idiom.
 * @module webgpu.tree
 * @license AGPL-3.0-only
 *
 * The twin exports the same composite list as `webgl.tree`, where `gl` is the
 * record `init` answers — `{ device, context, format }` and the layer's own —
 * and where a shader is WGSL. `@nakednous/tree` and `@nakednous/host` come along
 * as the `tree` and `host` namespaces, so an application imports the stack from
 * one name; `tree` has WebGPU's NDC depth convention (0) bound, so no call names
 * it.
 *
 * ```
 * const ctx = await init(canvas, { width, height })
 * const target = renderTarget(ctx, { width: 256, height: 192 })
 * filter(ctx, program(ctx, wgsl), null, target)
 * image(ctx, target.color)
 * endFrame(ctx)        // from the host's afterFrame, or here
 * ```
 *
 * A figure with geometry draws it the way a webgl.tree hero does — `buffer` a
 * mesh, `bind` a program, `draw` it under a model matrix — with two WebGPU
 * readings: a program's vertex layout is what its pipeline bakes, so it is
 * stated at `program` (`{ buffers: geometry.bufferLayouts }`), and the shading
 * language is WGSL.
 *
 * ```
 * const geo = buffer(ctx, mesh)
 * const prog = program(ctx, wgsl, { buffers: geo.bufferLayouts })
 * setCamera(ctx, cam)
 * bind(ctx, prog, { uColor: [1, 0.5, 0.2, 1] })
 * draw(ctx, geo, M)
 * ```
 *
 * What the twin names in a shader, and nothing else: its geometry's
 * `aPosition` `aTexCoord`; the six declared transforms (`uModelMatrix` …
 * `uNormalMatrix`) where a program declares them; a pass's input, bound to every
 * texture the stage declares and the bag leaves unset; `uResolution` and
 * `uTexelSize`, only where declared. `image`'s flat program names
 * `uModelViewProjectionMatrix`, `uColor`, `uUseTexture` and `uTexture`.
 *
 * Not yet on this surface — each its own stage: `cubemap`, mips and the 3D /
 * array texture shapes. The backend implements their members; the twin
 * publishes a verb when the figure corpus asks for it, as §7 #110's ruling
 * does for `beginPass`.
 */

'use strict';

export { init, dispose, endFrame, viewOf } from './context.js';
export { setCamera } from './camera.js';
export { bind, buffer, updateBuffer, draw, drawInstanced } from './draw.js';
export { texture, upload } from './texture.js';
export { readPixel, pick } from './pick.js';
export { mapLocation, mapDirection, unproject, fragCoord, pixelRatio, mat4Viewport } from './space.js';
export {
  axes, grid, hermite, pane, viewFrustum, trackPath, helmRig, handleLocus,
  beginHUD, endHUD, cross, bullsEye,
} from './gizmo.js';
export { renderTarget, SCREEN } from '@nakednous/idiom';
export {
  fullscreen, filter, image, pipe, releasePipe, state,
  RED, GREEN, BLUE, ALPHA, RGB, NORMAL, ADD, MULTIPLY,
} from '@nakednous/idiom';
export * as tree from './tree.js';
export * as host from '@nakednous/host';

/**
 * A pass program from a fragment source — the twin's `program(ctx, wgsl, opts)`.
 * @details `idiom`'s verb compiles a source into a pass program; the twin's
 * fragment source is WGSL, and the twin's own vertex stage is prepended to it
 * (one module, two entry points) unless the source declares a `@vertex` stage.
 * `opts` is the backend's: `vertex` / `fragment` entry names, `buffers` (the
 * vertex layout, default the fullscreen quad's), a `label`.
 * @param {object} ctx  The context record.
 * @param {string} wgsl  The fragment source, `vTexCoord` at `@location(0)`; the
 *        input by declaration, as every pass's is.
 * @param {{ vertex?:string, fragment?:string, buffers?:object[], label?:string }} [opts]
 * @returns {object|null} The backend's program record, or null where it failed.
 * @example
 * const invert = program(ctx, `
 * @group(0) @binding(0) var uSource: texture_2d<f32>;
 * @group(0) @binding(1) var uSampler: sampler;
 *
 * @fragment
 * fn fs(@location(0) vTexCoord: vec2f) -> @location(0) vec4f {
 *   return vec4f(1.0 - textureSample(uSource, uSampler, vTexCoord).rgb, 1.0);
 * }`)
 * filter(ctx, invert, null, target)
 */
export function program(ctx, wgsl, opts) {
  if (!ctx || !ctx.backend) return null;
  return ctx.backend.createProgram(ctx, wgsl, opts);
}
