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
 * (`program(ctx, wgsl, { buffers: geometry.bufferLayouts })`), which is §7
 * #112's shape again. The id program declares `uColor: vec4f`; the flat one also
 * declares `uUseTexture`, which `pick` sets to 0. There is no `sync` form: a
 * WebGPU read is asynchronous by construction.
 */

'use strict';

import { idToRgba, mat4Pick, rgbaToId } from '@nakednous/tree';
import { renderTarget } from '@nakednous/idiom';
import { canvasViewport } from './space.js';

const _rgba = [0, 0, 0, 1];
const _V = new Float32Array(16);
const _P = new Float32Array(16);
const _Ppick = new Float32Array(16);

const _declared = new WeakMap();

/** The pick-relevant uniform names a program declares, read once per program. @ignore */
function _declares(ctx, prog) {
  let d = _declared.get(prog);
  if (!d) {
    const names = ctx.backend.uniformsOf(prog) || [];
    d = { color: names.indexOf('uColor') >= 0, texture: names.indexOf('uUseTexture') >= 0 };
    _declared.set(prog, d);
  }
  return d;
}

const _warned = new WeakSet();

/** The 1 × 1 target a pick draws into, made once per context. @ignore */
function pickTargetOf(ctx) {
  if (!ctx.pickTarget) ctx.pickTarget = renderTarget(ctx, { width: 1, height: 1 });
  return ctx.pickTarget;
}

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
 * <caption>The state’s read side shown, and a pixel of it read back once a second.</caption>
 * import { init, endFrame, image, program, readPixel, state } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300, density: 1 })
 *
 * const field = state(ctx, { width: 200, height: 150 })
 * const bands = program(ctx, `
 * ```wgsl
 * @fragment
 * fn fs(@location(0) vTexCoord: vec2f) -> @location(0) vec4f {
 *   return mix(vec4f(0.9, 0.1, 0.1, 1.0), vec4f(0.1, 0.1, 0.9, 1.0), step(0.5, vTexCoord.x));
 * }
 * ```
 * `)
 *
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:#d8dee9;font:12px ui-monospace,monospace'
 * let count = 0
 *
 * function frame() {
 *   field.pass(bands)
 *   // read before the canvas is presented: a read ends the frame it finds
 *   if (count++ === 0) {
 *     readPixel(ctx, field.read, 100, 75).then((px) => {   // the target’s own pixels, row 0 at the top
 *       out.textContent = 'the centre pixel: ' + px[0] + ' ' + px[1] + ' ' + px[2]
 *     })
 *   }
 *   image(ctx, field.read.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 *
 */
export function readPixel(ctx, target, x, y) {
  if (!ctx || !ctx.backend) return Promise.resolve(new Uint8Array(4));
  if (!target) {
    console.error('[webgpu.tree] readPixel: a target is required — a WebGPU canvas is a presentation ' +
      'surface, so its pixels are the compositor\'s (and this Chromium cannot map a buffer once a canvas ' +
      'frame was presented). Draw the frame into a target and read that.');
    return Promise.resolve(new Uint8Array(4));
  }
  return ctx.backend.readPixels(ctx, target, x | 0, y | 0, 1, 1);
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
 * <caption>Click a triangle: pick draws the ids into a 1 × 1 target and answers the one under the pointer.</caption>
 * import { init, endFrame, bind, buffer, cross, draw, image, pick, program, setCamera, texture, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300, density: 1 })
 * const sky = texture(ctx, { data: new Uint8Array([19, 141, 117, 255]), width: 1, height: 1 })
 * const mesh = buffer(ctx, { position: { numComponents: 3, data: [-80, -60, 0, 80, -60, 0, 0, 80, 0] } })
 *
 * const WGSL = `
 * ```wgsl
 * struct U {
 *   uModelViewProjectionMatrix: mat4x4f,
 * };
 * @group(0) @binding(0) var<uniform> u: U;
 *
 * struct VOut {
 *   @builtin(position) position: vec4f,
 * };
 *
 * @vertex
 * fn vs(@location(0) aPosition: vec3f) -> VOut {
 *   var out: VOut;
 *   out.position = u.uModelViewProjectionMatrix * vec4f(aPosition, 1.0);
 *   return out;
 * }
 *
 * @fragment
 * fn fs() -> @location(0) vec4f {
 *   return vec4f(1.0, 0.31, 0.85, 1.0);
 * }
 * ```
 * `
 * const ID = `
 * ```wgsl
 * struct U {
 *   uModelViewProjectionMatrix: mat4x4f,
 *   uColor: vec4f,
 * };
 * @group(0) @binding(0) var<uniform> u: U;
 *
 * struct VOut {
 *   @builtin(position) position: vec4f,
 * };
 *
 * @vertex
 * fn vs(@location(0) aPosition: vec3f) -> VOut {
 *   var out: VOut;
 *   out.position = u.uModelViewProjectionMatrix * vec4f(aPosition, 1.0);
 *   return out;
 * }
 *
 * @fragment
 * fn fs() -> @location(0) vec4f {
 *   return u.uColor;
 * }
 * ```
 * `
 * const prog = program(ctx, WGSL, { buffers: mesh.bufferLayouts })
 * const idProg = program(ctx, ID, { buffers: mesh.bufferLayouts })
 * setCamera(ctx, tree.createCamera({ eye: [0, 0, 340] }))
 * const left = tree.mat4FromTRS(tree.mat4(), -100, 0, 0, 0, 0, 0, 1, 1, 1, 1)
 * const right = tree.mat4FromTRS(tree.mat4(), 100, 0, 0, 0, 0, 0, 1, 1, 1, 1)
 *
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:#d8dee9;font:12px ui-monospace,monospace'
 * let px = 95, py = 160, hit = 0, first = true
 * const drawIds = (paint) => {         // paint(id) before each object’s draw
 *   paint(1)
 *   draw(ctx, mesh, left)
 *   paint(2)
 *   draw(ctx, mesh, right)
 * }
 * canvas.addEventListener('pointermove', (e) => { px = e.offsetX; py = e.offsetY })
 * canvas.addEventListener('pointerdown', () => {
 *   pick(ctx, px, py, drawIds, { program: idProg }).then((id) => { hit = id })
 * })
 *
 * function frame() {
 *   // the first pick runs before the canvas is presented: a read ends the frame it finds
 *   if (first) {
 *     first = false
 *     pick(ctx, px, py, drawIds, { program: idProg }).then((id) => { hit = id })
 *   }
 *   image(ctx, sky)
 *   bind(ctx, prog)
 *   draw(ctx, mesh, left)
 *   draw(ctx, mesh, right)
 *   cross(ctx, { x: px, y: py, size: 14, color: [1, 0.82, 0.4, 1] })
 *   out.textContent = 'pick: ' + (hit || 'click a triangle')
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 *
 */
export function pick(ctx, x, y, drawFn, opts) {
  if (!ctx || !ctx.backend) return Promise.resolve(0);
  const o = opts || {};
  if (typeof drawFn !== 'function') {
    console.error('[webgpu.tree] pick: `drawFn` draws the scene, calling paint(id) before each object.');
    return Promise.resolve(0);
  }
  const backend = ctx.backend;
  const target = o.target || pickTargetOf(ctx);
  const viewport = o.vp || canvasViewport(ctx);
  _V.set(ctx.V);
  _P.set(ctx.P);
  _Ppick.set(ctx.P);
  mat4Pick(_Ppick, x, y, viewport);

  const prevTarget = backend.bindTarget(ctx);
  const prevViewport = backend.setViewport(ctx);
  const prevState = backend.setState(ctx, { depth: true });
  const prevProg = ctx.prog;
  const prog = o.program || backend.imageProgram(ctx);
  const declares = _declares(ctx, prog);
  if (!declares.color && !_warned.has(prog)) {
    _warned.add(prog);
    console.error('[webgpu.tree] pick: the id program declares no `uColor`, so paint(id) sets no id.');
  }

  backend.bindTarget(ctx, target);
  backend.clear(ctx, [0, 0, 0, 1]);
  backend.setCamera(ctx, _V, _Ppick);
  ctx.prog = prog;
  if (declares.texture) backend.setUniforms(ctx, prog, { uUseTexture: 0 });
  // each paint is consumed by the draw that follows it: its own arena slot
  const paint = (id) => {
    if (declares.color) backend.setUniforms(ctx, prog, { uColor: idToRgba(_rgba, id) });
  };
  try {
    drawFn(paint);
  } finally {
    backend.setCamera(ctx, _V, _P);
    backend.bindTarget(ctx, prevTarget);
    backend.setViewport(ctx, prevViewport);
    backend.setState(ctx, prevState);
    ctx.prog = prevProg;
  }
  return readPixel(ctx, target, 0, 0).then((px) => rgbaToId(px[0], px[1], px[2]));
}
