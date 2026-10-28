/**
 * @file Picking — a pixel readback and colour-id scene picking.
 * @module webgpu.tree/pick
 * @license AGPL-3.0-only
 *
 * `pick` finds the object under a screen-space pixel: draw the scene calling
 * `paint(id)` before each object, and the promise resolves to that id.
 * `readPixel` reads one pixel of a target.
 *
 * ```
 * readPixel(ctx, target, x, y) → Promise<Uint8Array>   // a frame or more late
 * pick(ctx, x, y, drawFn, opts) → Promise<number>      // 0 a miss
 * ```
 *
 * @details
 * **Coordinates.** `readPixel` takes the target's own pixels — **device pixels,
 * row 0 at the top**, WebGPU's framebuffer space, where `webgl.tree`'s read is
 * bottom-left in window space. `pick` takes **logical screen pixels** (a pointer
 * offset as it comes), crossed by the canvas's own viewport, as the reference's
 * does; `opts.vp` overrides it with a signed `[x, y, w, h]` in the same space.
 *
 * **The canvas is not readable.** A WebGPU canvas texture is a presentation
 * surface: its pixels are the compositor's, a copy of it after the frame's
 * submit is invalid, and this machine's Chromium cannot map a buffer at all once
 * a canvas frame was presented. So `readPixel` wants a target — a figure draws
 * its frame into one and shows it (`image`), which is what the twin's figures
 * do. `pick` reads a target of its own, so it is unaffected.
 *
 * **A read ends the frame.** The copy must be ordered after the frame's draws,
 * so the backend submits the frame first and copies in a submission of its own
 * (`readPixels`); the figure's next draw opens a new one. A `pick` inside a
 * frame therefore submits what is drawn so far, and the frame continues — one
 * extra submit per pick, the twin's cost for an asynchronous read. A
 * multisampled target needs no explicit resolve: resolving is the pass's end,
 * which the submit performs.
 *
 * The protocol — the cached 1 × 1 target, the narrowed projection, the id codec
 * and the restore — is the layer's; what stays this bridge's is the refusal of
 * the canvas below and `canvasViewport`, the mapping a pointer's coordinates
 * belong to.
 *
 * **The id program.** `pick` renders into a cached 1 × 1 `rgba8unorm` +
 * `depth24plus` target, cleared black, under the installed projection narrowed
 * by `tree.mat4Pick` onto the query pixel; `paint(id)` writes the program's
 * `uColor` through `setUniforms`, so each object's id is its own arena slot and
 * two objects in one pick read differently. Ids run 1 … 2²⁴ − 1 and 0 is a
 * miss (`tree.idToRgba` · `rgbaToId`). The target, the viewport, the camera, the
 * state and the bound program are all restored afterwards.
 *
 * On WebGPU a pipeline's vertex state is baked, so **the default id program —
 * the twin's flat one — serves the covering quad only**: a scene of meshes
 * passes `opts.program`, an id WGSL of its own built with the geometry's layout
 * (`program(ctx, wgsl, { buffers: geometry.bufferLayouts })`) — the layout a
 * scene program is built from is its own statement, as everywhere. The id
 * program declares `uColor: vec4f`; the flat one also
 * declares `uUseTexture`, which `pick` sets to 0. There is no `sync` form: a
 * WebGPU read is asynchronous by construction.
 */

'use strict';

import { pick as pickOf, readPixel as readPixelOf } from '@nakednous/idiom';
import { canvasViewport } from './space.js';

/**
 * Read one pixel of a target back — its own device pixels, row 0 at the top.
 * @param {object} ctx  The context record.
 * @param {object} target  A target record (its `.color`) or a texture record. The
 *        canvas is not a target here: it is a presentation surface, so a figure
 *        draws into a target and reads that.
 * @param {number} x  Pixel column in the target, from the left.
 * @param {number} y  Pixel row in the target, from the top.
 * @returns {Promise<Uint8Array>} The four bytes, RGBA, a frame or more late.
 * @example
 * <caption>The centre pixel read back: 255 79 216 while the magenta square passes over it, 19 141 117 otherwise.</caption>
 * import { init, endFrame, image, pane, readPixel, renderTarget, SCREEN, setCamera, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 *
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:#d8dee9;font:13px ui-monospace,monospace'
 * const centre = [Math.round(scene.width / 2), Math.round(scene.height / 2)]   // the target’s centre, its own pixels
 * const cam = tree.createCamera({ eye: [0, 0, 280] })
 * let pending = false
 *
 * function frame(ms) {
 *   const x = 150 * Math.sin(ms / 1000)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   pane(ctx, [x - 30, 30, 0], [x + 30, 30, 0], [x + 30, -30, 0], [x - 30, -30, 0], { color: [1, 79 / 255, 216 / 255, 1] })
 *   if (!pending) {
 *     pending = true
 *     readPixel(ctx, scene, centre[0], centre[1]).then((px) => {
 *       out.textContent = 'centre ' + px.slice(0, 3).join(' ')
 *       pending = false
 *     })
 *   }
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 *
 *
 */
export function readPixel(ctx, target, x, y) {
  if (!ctx || !ctx.backend) return Promise.resolve(new Uint8Array(4));
  if (!target) {
    // a WebGPU canvas is a presentation surface: its pixels are the compositor's, and this
    // machine's Chromium cannot map a buffer once a canvas frame was presented
    console.error('[webgpu.tree] readPixel: a target is required — a WebGPU canvas is a presentation ' +
      'surface, so its pixels are the compositor\'s. Draw the frame into a target and read that.');
    return Promise.resolve(new Uint8Array(4));
  }
  return readPixelOf(ctx, target, x, y);
}

/**
 * The id of the object under a screen-space pixel, 0 for a miss.
 * @details Colour-id picking into a cached 1 × 1 target; ids run 1 … 2²⁴ − 1.
 * @param {object} ctx  The context record.
 * @param {number} x  The query pixel's column, logical pixels — a pointer offset as is.
 * @param {number} y  Its row, from the top.
 * @param {function(function(number):void):void} drawFn  Draws the scene; call
 *        `paint(id)` before each object's draw. `draw` uses the program `pick`
 *        bound, so the function draws rather than binds.
 * @param {{ program?:object, vp?:number[], target?:object }} [opts]  program: an
 *        id program with a `uColor` uniform, whose pipeline layout is the
 *        scene's (the flat one serves the covering quad); vp: the signed viewport
 *        the coordinates are in; target: a target to draw the ids into, default a
 *        cached 1 × 1.
 * @returns {Promise<number>} The id under the pixel, 0 for a miss.
 * @example
 * <caption>Hover a cube: the one under the pointer turns magenta.</caption>
 * import { init, endFrame, bind, buffer, draw, image, pick, program, renderTarget, SCREEN, setCamera, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 *
 * const solid = buffer(ctx, tree.platonic(tree.HEXAHEDRON, { radius: 80 * Math.sqrt(3) / 2 }))   // twgl's cube(80)
 * const WGSL = `
 * ```wgsl
 * struct U {
 *   uModelViewProjectionMatrix: mat4x4f,
 *   uNormalMatrix: mat3x3f,
 *   uColor: vec3f,
 * };
 * @group(0) @binding(0) var<uniform> u: U;
 *
 * struct VOut {
 *   @builtin(position) position: vec4f,
 *   @location(0) normal: vec3f,
 * };
 *
 * @vertex
 * fn vs(@location(0) aPosition: vec3f, @location(1) aNormal: vec3f) -> VOut {
 *   var out: VOut;
 *   out.position = u.uModelViewProjectionMatrix * vec4f(aPosition, 1.0);
 *   out.normal = u.uNormalMatrix * aNormal;
 *   return out;
 * }
 *
 * @fragment
 * fn fs(@location(0) normal: vec3f) -> @location(0) vec4f {
 *   let d = max(dot(normalize(normal), normalize(vec3f(0.4, 0.6, 1.0))), 0.0);
 *   return vec4f(u.uColor * (0.3 + 0.7 * d), 1.0);
 * }
 * ```
 * `
 * const prog = program(ctx, WGSL, { buffers: solid.bufferLayouts })
 * const ID = `
 * ```wgsl
 * struct U {
 *   uModelViewProjectionMatrix: mat4x4f,
 *   uColor: vec4f,
 * };
 * @group(0) @binding(0) var<uniform> u: U;
 *
 * @vertex
 * fn vs(@location(0) aPosition: vec3f, @location(1) aNormal: vec3f) -> @builtin(position) vec4f {
 *   return u.uModelViewProjectionMatrix * vec4f(aPosition, 1.0);
 * }
 *
 * @fragment
 * fn fs() -> @location(0) vec4f {
 *   return u.uColor;
 * }
 * ```
 * `
 * const idProg = program(ctx, ID, { buffers: solid.bufferLayouts })
 * const cubes = [-120, 0, 120].map((x, i) => ({ id: i + 1, M: tree.mat4FromTRS(tree.mat4(), x, 0, 0, 0, 0, 0, 1, 1, 1, 1) }))
 * const cam = tree.createCamera({ eye: [99, 131, 263] })
 *
 * let mx = -1, my = -1, picked = 0, pending = false
 * canvas.addEventListener('pointermove', (e) => { mx = e.offsetX; my = e.offsetY })
 * canvas.addEventListener('pointerleave', () => { mx = -1; my = -1; picked = 0 })
 *
 * function ask() {
 *   if (pending) return
 *   pending = true
 *   pick(ctx, mx, my, (paint) => {
 *     for (const c of cubes) { paint(c.id); draw(ctx, solid, c.M) }
 *   }, { program: idProg }).then((id) => { picked = id; pending = false })
 * }
 *
 * function frame() {
 *   if (mx >= 0) ask()
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   for (const c of cubes) {
 *     bind(ctx, prog, { uColor: c.id === picked ? [1, 0.31, 0.85] : [1, 0.82, 0.4] })
 *     draw(ctx, solid, c.M)
 *   }
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 *
 *
 */
export function pick(ctx, x, y, drawFn, opts) {
  if (!ctx || !ctx.backend) return Promise.resolve(0);
  const o = opts || {};
  return pickOf(ctx, x, y, drawFn, { ...o, vp: o.vp || canvasViewport(ctx) });
}
