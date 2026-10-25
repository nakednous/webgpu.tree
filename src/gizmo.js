/**
 * @file Gizmos — the line pipe over the core generators, HUD mode.
 * @module webgpu.tree/gizmo
 * @license AGPL-3.0-only
 *
 * Gizmos drawn by name under the installed camera — frames, grids, curves,
 * frustums, track paths, helm rigs, handles — and screen-space marks between
 * `beginHUD` and `endHUD`. Each takes `ctx`, its subject, and options such as
 * `M`, `color`, `bits`, `size` and `depth`.
 *
 * ```
 * axes(ctx, opts) · grid(ctx, opts) · hermite(ctx, p0, t0, p1, t1, opts)
 * viewFrustum(ctx, opts) · trackPath(ctx, track, opts) · helmRig(ctx, helm, opts) · handleLocus(ctx, h, opts)
 * beginHUD(ctx) · cross(ctx, opts) · bullsEye(ctx, opts) · endHUD(ctx)   // { x, y } in logical pixels, y down
 * ```
 *
 * @details
 * The pipe: the twin's two line programs (`programs.js`'s `LINE` and `WIDE`)
 * and, for a handle's dot, `TRIS`. Each gizmo owns one cached arrays record per
 * context (`tree.createArrays`), grown when the generator needs more and filled
 * in place every call.
 *
 * **A slot per draw, per frame.** A geometry's vertex data is uploaded with
 * `queue.writeBuffer`, which is ordered with *submissions*, not inside a command
 * buffer — the rule the uniform arena exists for. Two gizmos of one name drawn
 * in a frame would therefore both read the second write were they to share a
 * buffer, so each draw takes a slot of the frame's pool; the cursor restarts
 * when the frame's submission count changes. A slot's geometry is
 * **non-interleaved**, so a frame's update is one write per attribute and
 * nothing is allocated once warm; it is rebuilt only when a draw needs more
 * room than the slot has.
 *
 * **The width.** `width` counts logical pixels, default 1, times the device
 * ratio. WebGPU rasterizes a `line-list` one device pixel wide, so at or below
 * one the line list draws (`LINE`) and above it each segment becomes a
 * window-space quad of that width (`WIDE`), the generators untouched. Both paths
 * are real: the twin has no other way to a wider line than the quads.
 *
 * Depth is on by default, `{ depth: false }` for overlays; the state and the
 * program the pipe found are restored after every draw. Colour is semantic
 * where the generator writes a palette (axes, the helm rig) and `opts.color`
 * elsewhere (white by default). The cache, the slot and the width policy are
 * `idiom`'s per its §2, so the twin carries them until the layer's gizmo stage,
 * as S4 carried the draw policy.
 *
 * **The HUD** is an orthographic projection over the canvas's *logical* screen
 * viewport — left 0, right w, bottom h, top 0, so y runs down like a pointer's —
 * with an identity view and the depth test off; the camera and the state come
 * back at `endHUD`. `cross` and `bullsEye` wrap themselves in one when called
 * outside it.
 *
 * Not on this surface yet — the pane's textured quad, the frustum's
 * `nearTexture` / `farTexture` faces, the helm rig's HUD form and its `identify`
 * labels — each with the texture or label seam it needs.
 */

'use strict';

import * as T from './tree.js';
import { helmBasis } from '@nakednous/host';
import {
  LINE, LINE_COLOR, LINE_COLOR_LAYOUT, LINE_LAYOUT, PANE, PANE_LAYOUT,
  TRIS, TRIS_LAYOUT, WIDE, WIDE_COLOR, WIDE_COLOR_LAYOUT, WIDE_LAYOUT,
} from './programs.js';
import { NORMAL, image, renderTarget } from '@nakednous/idiom';
import { bind, draw } from './draw.js';
import { setCamera } from './camera.js';
import { viewOf } from './context.js';
import { frameOf, viewportOf } from './frame.js';
import { canvasScale, canvasViewport } from './space.js';
import { BUFFER_USAGE } from './flags.js';

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const WHITE = [1, 1, 1, 1];
const _M = new Float32Array(16);      // a composed model matrix
const _R = new Float32Array(16);      // a basis' rotation block
const _P = new Float32Array(16);      // the HUD projection
const _E = new Float32Array(16);      // an eye matrix
const _Mk = new Float32Array(16);     // a keyframe's frame
const _p = [0, 0, 0];                 // a handle's point
const _du = [0, 0, 0], _dv = [0, 0, 0];   // the camera's right and up
const _cam = T.createCamera();        // a track's evaluated state
const _matCam = { mat4Eye: null, mat4Proj: null, ndcZMin: T.WEBGPU };
const _rigCam = T.createCamera({ fov: null, halfHeight: 90, near: 0.1, far: 960 });
const _c24 = new Float64Array(24);    // a frustum's corners
const _q0 = [0, 0, 0], _q1 = [0, 0, 0], _q2 = [0, 0, 0], _q3 = [0, 0, 0];
const _AZ_ISO = Math.PI / 4, _EL_ISO = Math.atan(1 / Math.SQRT2), _RIG_D = 240;
let _rigSeq = 0;
const _corner = (out, i) => { out[0] = _c24[3 * i]; out[1] = _c24[3 * i + 1]; out[2] = _c24[3 * i + 2]; return out; };

/** The creation options of a stream geometry: non-interleaved, writable in place. @ignore */
const STREAM = Object.freeze({ interleave: false, usage: BUFFER_USAGE.COPY_DST });

const _cache = (ctx) => ctx.gizmos || (ctx.gizmos = Object.create(null));
const _programs = (ctx) => ctx.gizmoPrograms || (ctx.gizmoPrograms = { line: Object.create(null), wide: Object.create(null), tris: null, pane: null });

/** The gizmo names the pipe caches, one arrays record each. @ignore */
function _keyed(ctx, name, opts) {
  const cache = _cache(ctx);
  let g = cache[name];
  if (!g) g = cache[name] = { arrays: T.createArrays(64, opts), wide: null };
  // a cache first made without a label array may be asked for one later (the
  // helm rig's identify), and the generator fills whatever array exists
  if (opts && opts.labels && !g.arrays.labels) g.arrays.labels = [];
  return g;
}

const _poolOf = (ctx) => ctx.gizmoPool || (ctx.gizmoPool = { slots: Object.create(null) });

/** Four vertices and six indices a segment, for `cap` segments. @ignore */
function _patternOf(cap) {
  const t = new Float32Array(4 * cap), s = new Float32Array(4 * cap), indices = new Uint32Array(6 * cap);
  for (let i = 0; i < cap; i++) {
    const v = 4 * i;
    t[v] = 0; t[v + 1] = 0; t[v + 2] = 1; t[v + 3] = 1;
    s[v] = -1; s[v + 1] = 1; s[v + 2] = -1; s[v + 3] = 1;
    const k = 6 * i;
    indices[k] = v; indices[k + 1] = v + 1; indices[k + 2] = v + 2;
    indices[k + 3] = v + 1; indices[k + 4] = v + 3; indices[k + 5] = v + 2;
  }
  return { t, s, indices };
}

/** The arrays a pooled geometry is created with, sized to `cap` vertices (or segments, for the wide kinds). @ignore */
function _arraysFor(kind, cap) {
  const n = Math.max(1, cap | 0);
  if (kind === 'line' || kind === 'tris') {
    return { aPosition: { numComponents: 3, data: new Float32Array(3 * n) } };
  }
  if (kind === 'lineColor') {
    return {
      aPosition: { numComponents: 3, data: new Float32Array(3 * n) },
      aColor: { numComponents: 4, data: new Float32Array(4 * n) },
    };
  }
  if (kind === 'pane') {
    return {
      aPosition: { numComponents: 3, data: new Float32Array(3 * n) },
      aTexCoord: { numComponents: 2, data: new Float32Array(2 * n) },
    };
  }
  const pattern = _patternOf(n);
  const a = {
    aA: { numComponents: 3, data: new Float32Array(12 * n) },
    aB: { numComponents: 3, data: new Float32Array(12 * n) },
    aT: { numComponents: 1, data: pattern.t },
    aSide: { numComponents: 1, data: pattern.s },
  };
  if (kind === 'wideColor') a.aColor = { numComponents: 4, data: new Float32Array(16 * n) };
  a.indices = { numComponents: 3, data: pattern.indices };
  return a;
}

/** The slot `kind` that this draw takes, big enough for `capacity`. @ignore */
function _slot(ctx, kind, capacity) {
  const pool = _poolOf(ctx);
  let list = pool.slots[kind];
  if (!list) list = pool.slots[kind] = { slots: [], cursor: 0, frame: -1 };
  const frame = frameOf(ctx).submissions;   // the submission count is the frame's boundary
  if (list.frame !== frame) {
    list.frame = frame;
    list.cursor = 0;
  }
  const i = list.cursor;                    // the frame's i-th draw of this kind
  list.cursor = i + 1;
  let slot = list.slots[i];
  if (!slot) slot = list.slots[i] = { geometry: null, capacity: 0, arrays: null };
  if (!slot.geometry || slot.capacity < capacity) {
    slot.capacity = Math.max(capacity, slot.capacity * 2, 16);
    slot.arrays = _arraysFor(kind, slot.capacity);
    if (slot.geometry) ctx.backend.updateBuffer(ctx, slot.geometry, slot.arrays, STREAM);
    else slot.geometry = ctx.backend.createBuffer(ctx, slot.arrays, STREAM);
  }
  return slot;
}

/** Run a generator into a gizmo's cached arrays, growing them when the count exceeds the capacity. @ignore */
function _generate(ctx, g, gen) {
  let n = gen(g.arrays);
  if (n > T.capacityOf(g.arrays)) {
    T.growArrays(g.arrays, n);
    gen(g.arrays);
  }
  return g.arrays.count;
}

/** The line program, per a colour attribute's presence. @ignore */
function _lineProgram(ctx, colored) {
  const p = _programs(ctx);
  const key = colored ? 'color' : 'plain';
  if (!p.line[key]) {
    p.line[key] = ctx.backend.createProgram(ctx, colored ? LINE_COLOR : LINE, {
      buffers: colored ? LINE_COLOR_LAYOUT : LINE_LAYOUT,
      label: 'webgpu.tree line' + (colored ? ' (colour)' : ''),
    });
  }
  return p.line[key];
}

/** The wide line program, per a colour attribute's presence. @ignore */
function _wideProgram(ctx, colored) {
  const p = _programs(ctx);
  const key = colored ? 'color' : 'plain';
  if (!p.wide[key]) {
    p.wide[key] = ctx.backend.createProgram(ctx, colored ? WIDE_COLOR : WIDE, {
      buffers: colored ? WIDE_COLOR_LAYOUT : WIDE_LAYOUT,
      label: 'webgpu.tree wide line' + (colored ? ' (colour)' : ''),
    });
  }
  return p.wide[key];
}

/** The pane's program: a world-space quad, textured or flat. @ignore */
function _paneProgram(ctx) {
  const p = _programs(ctx);
  if (!p.pane) p.pane = ctx.backend.createProgram(ctx, PANE, { buffers: PANE_LAYOUT, label: 'webgpu.tree pane' });
  return p.pane;
}

/** The quads program a handle's dot draws through. @ignore */
function _trisProgram(ctx) {
  const p = _programs(ctx);
  if (!p.tris) p.tris = ctx.backend.createProgram(ctx, TRIS, { buffers: TRIS_LAYOUT, label: 'webgpu.tree gizmo quads' });
  return p.tris;
}

/**
 * Expand a gizmo's line list into the wide-line quads' source arrays: four
 * vertices per segment carrying both endpoints, which end they sit at and their
 * side, plus the endpoint's colour when the arrays carry one.
 * @param {object} g  A cached gizmo entry.
 * @returns {object} `{ A, B, color?, capacity, segments }`, grown in place.
 * @ignore
 */
function _expand(g) {
  const segs = (g.arrays.count / 2) | 0;
  const colored = !!g.arrays.color;
  let w = g.wide;
  if (!w || w.capacity < segs) {
    const cap = Math.max(segs, w ? w.capacity * 2 : 16);
    g.wide = {
      A: new Float32Array(12 * cap), B: new Float32Array(12 * cap),
      color: colored ? new Float32Array(16 * cap) : null,
      capacity: cap, segments: 0,
    };
    w = g.wide;
  }
  const p = g.arrays.position.data, c = g.arrays.color ? g.arrays.color.data : null;
  for (let i = 0; i < segs; i++) {
    const a = 6 * i, b = a + 3;
    for (let v = 0; v < 4; v++) {
      const o = 12 * i + 3 * v;
      w.A[o] = p[a]; w.A[o + 1] = p[a + 1]; w.A[o + 2] = p[a + 2];
      w.B[o] = p[b]; w.B[o + 1] = p[b + 1]; w.B[o + 2] = p[b + 2];
      if (c && w.color) {
        const src = v < 2 ? 4 * (2 * i) : 4 * (2 * i + 1), dst = 16 * i + 4 * v;
        w.color[dst] = c[src]; w.color[dst + 1] = c[src + 1];
        w.color[dst + 2] = c[src + 2]; w.color[dst + 3] = c[src + 3];
      }
    }
  }
  w.segments = segs;
  return w;
}

/** Draw a filled gizmo's lines under M: the line list, or the quads past a device pixel. @ignore */
function _drawLines(ctx, g, M, color, depth, width) {
  const count = g.arrays.count;
  if (!count) return;
  const px = (typeof width === 'number' ? width : 1) * canvasScale(ctx);   // logical pixels → device pixels
  const wide = px > 1;
  const colored = !!g.arrays.color;
  const kind = wide ? (colored ? 'wideColor' : 'wide') : (colored ? 'lineColor' : 'line');
  const prog = wide ? _wideProgram(ctx, colored) : _lineProgram(ctx, colored);
  if (!prog) return;
  const priorState = ctx.backend.setState(ctx, {
    depth: depth !== false,
    topology: wide ? 'triangle-list' : 'line-list',   // the pipeline bakes the topology
  });
  const priorProg = ctx.prog;
  bind(ctx, prog, { uPV: ctx.PV, uModel: M || IDENTITY, uColor: color || WHITE, uUseColor: colored ? 1 : 0 });
  if (wide) {
    const w = _expand(g);
    const slot = _slot(ctx, kind, w.segments);
    const vp = viewportOf(ctx);
    bind(ctx, prog, { uViewport: [vp[2], vp[3]], uWidth: px });
    ctx.device.queue.writeBuffer(slot.geometry.buffers[0], 0, w.A, 0, 12 * w.segments);
    ctx.device.queue.writeBuffer(slot.geometry.buffers[1], 0, w.B, 0, 12 * w.segments);
    if (w.color) ctx.device.queue.writeBuffer(slot.geometry.buffers[4], 0, w.color, 0, 16 * w.segments);
    draw(ctx, slot.geometry, null, { count: 6 * w.segments });
  } else {
    const slot = _slot(ctx, kind, count);
    ctx.device.queue.writeBuffer(slot.geometry.buffers[0], 0, g.arrays.position.data, 0, 3 * count);
    if (colored) ctx.device.queue.writeBuffer(slot.geometry.buffers[1], 0, g.arrays.color.data, 0, 4 * count);
    draw(ctx, slot.geometry, null, { count });
  }
  ctx.prog = priorProg;
  ctx.backend.setState(ctx, priorState);
}

/** Draw a filled gizmo's triangles under M through the quads program. @ignore */
function _drawTris(ctx, g, M, color, depth) {
  const count = g.arrays.count;
  if (!count) return;
  const prog = _trisProgram(ctx);
  if (!prog) return;
  const priorState = ctx.backend.setState(ctx, { depth: depth !== false, topology: 'triangle-list' });
  const priorProg = ctx.prog;
  const slot = _slot(ctx, 'tris', count);
  ctx.device.queue.writeBuffer(slot.geometry.buffers[0], 0, g.arrays.position.data, 0, 3 * count);
  bind(ctx, prog, { uColor: color || WHITE });
  draw(ctx, slot.geometry, M || null, { count });   // the draw installs uModelViewProjectionMatrix
  ctx.prog = priorProg;
  ctx.backend.setState(ctx, priorState);
}

/** The aspect a frustum is judged at: `opts.aspect`, or the canvas's. @ignore */
const _aspect = (ctx, o) => (o && typeof o.aspect === 'number') ? o.aspect : (ctx.height ? ctx.width / ctx.height : 1);

const _DOT_N = 16;

/** A disc of `_DOT_N` triangles at a point, in the camera's right/up plane. @ignore */
function _disc(a, cx, cy, cz, r, u, v) {
  const need = 3 * _DOT_N;
  const cap = T.capacityOf(a);
  const p = a.position.data;
  let n = 0;
  for (let i = 0; i < _DOT_N && n + 3 <= cap; i++) {
    const t0 = (i / _DOT_N) * Math.PI * 2, t1 = ((i + 1) / _DOT_N) * Math.PI * 2;
    const c0 = Math.cos(t0) * r, s0 = Math.sin(t0) * r, c1 = Math.cos(t1) * r, s1 = Math.sin(t1) * r;
    const k = 3 * n;
    p[k] = cx; p[k + 1] = cy; p[k + 2] = cz;
    p[k + 3] = cx + c0 * u[0] + s0 * v[0]; p[k + 4] = cy + c0 * u[1] + s0 * v[1]; p[k + 5] = cz + c0 * u[2] + s0 * v[2];
    p[k + 6] = cx + c1 * u[0] + s1 * v[0]; p[k + 7] = cy + c1 * u[1] + s1 * v[1]; p[k + 8] = cz + c1 * u[2] + s1 * v[2];
    n += 3;
  }
  a.count = n;
  return need;
}

// ── Scene gizmos ─────────────────────────────────────────────────────────

/**
 * A coordinate frame: six half-axes by bit and the X · Y · Z line glyphs with
 * LABELS; semantic colour per axis unless `{ semantic: false, color }`.
 * @param {object} ctx  The context record.
 * @param {{ M?:ArrayLike<number>, size?:number, bits?:number, semantic?:boolean, color?:number[],
 *           depth?:boolean, width?:number }} [opts]
 * @example
 * <caption>A frame at the origin, and a second one moved by M to (−150, 0, 0) and turned 45° about Y.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const q = tree.qFromAxisAngle(tree.quat(), 0, 1, 0, Math.PI / 4)
 * const M = tree.mat4FromTRS(tree.mat4(), -150, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *
 * setCamera(ctx, tree.createCamera({ eye: [97, 143, 229], center: [-75, 0, 0] }))
 *
 * ctx.backend.bindTarget(ctx, scene)
 * ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 * axes(ctx, { size: 100 })
 * axes(ctx, { M, size: 60 })
 * ctx.backend.bindTarget(ctx, SCREEN)
 * image(ctx, scene.color)
 * endFrame(ctx)
 *
 *
 */
export function axes(ctx, opts) {
  const o = opts || {};
  const g = _keyed(ctx, 'axes', { color: true });
  _generate(ctx, g, (a) => T.axesLines(a, o));
  _drawLines(ctx, g, o.M, null, o.depth, o.width);
}

/**
 * A grid in the XY plane; `M` orients it (a ground plane is a rotation about X).
 * @param {object} ctx  The context record.
 * @param {{ M?:ArrayLike<number>, size?:number, subdivisions?:number, color?:number[], depth?:boolean, width?:number }} [opts]
 * @example
 * <caption>A ground grid: the XY grid laid flat by a rotation about X, under the axes.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, grid, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const q = tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2)
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *
 * setCamera(ctx, tree.createCamera({ eye: [164, 136, 218] }))
 *
 * ctx.backend.bindTarget(ctx, scene)
 * ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 * grid(ctx, { M: ground, size: 120, subdivisions: 10 })
 * axes(ctx, { size: 100 })
 * ctx.backend.bindTarget(ctx, SCREEN)
 * image(ctx, scene.color)
 * endFrame(ctx)
 *
 *
 */
export function grid(ctx, opts) {
  const o = opts || {};
  const g = _keyed(ctx, 'grid');
  _generate(ctx, g, (a) => T.gridLines(a, o));
  _drawLines(ctx, g, o.M, o.color, o.depth, o.width);
}

/**
 * One cubic Hermite segment as a polyline.
 * @param {object} ctx  The context record.
 * @param {number[]} p0  Start point.
 * @param {number[]} t0  Outgoing tangent.
 * @param {number[]} p1  End point.
 * @param {number[]} t1  Incoming tangent.
 * @param {{ M?:ArrayLike<number>, samples?:number, color?:number[], depth?:boolean, width?:number }} [opts]
 * @example
 * <caption>A magenta arch from (−150, 0, 0) to (150, 0, 0): it leaves upward and arrives downward.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, hermite, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * setCamera(ctx, tree.createCamera({ eye: [0, 89, 220], center: [0, 40, 0] }))
 *
 * ctx.backend.bindTarget(ctx, scene)
 * ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 * axes(ctx, { size: 100 })
 * hermite(ctx, [-150, 0, 0], [0, 400, 0], [150, 0, 0], [0, -400, 0], { color: [1, 0.31, 0.85, 1] })
 * ctx.backend.bindTarget(ctx, SCREEN)
 * image(ctx, scene.color)
 * endFrame(ctx)
 *
 *
 */
export function hermite(ctx, p0, t0, p1, t1, opts) {
  const o = opts || {};
  const g = _keyed(ctx, 'hermite');
  _generate(ctx, g, (a) => T.hermiteLines(a, p0, t0, p1, t1, o));
  _drawLines(ctx, g, o.M, o.color, o.depth, o.width);
}

/**
 * A camera's frustum: NEAR and FAR rectangles, BODY edges, APEX lines
 * (perspective only); a small axes at the eye unless `{ viewer: null }`.
 * @param {object} ctx  The context record.
 * @param {{ camera?:object, mat4Eye?:ArrayLike<number>, mat4Proj?:ArrayLike<number>, aspect?:number,
 *           bits?:number, color?:number[], viewer?:function|null, depth?:boolean, width?:number }} [opts]
 *        camera: a camera state or a camera track at its cursor; mat4Eye / mat4Proj:
 *        a measured pose instead.
 * @example
 * <caption>The frustum of a second camera looking at the origin, with small axes at its eye.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, viewFrustum, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const other = tree.createCamera({ eye: [-150, 80, 150], fov: Math.PI / 4, near: 30, far: 200 })
 *
 * setCamera(ctx, tree.createCamera({ eye: [255, 212, 340] }))
 *
 * ctx.backend.bindTarget(ctx, scene)
 * ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 * axes(ctx, { size: 60 })
 * viewFrustum(ctx, { camera: other })
 * ctx.backend.bindTarget(ctx, SCREEN)
 * image(ctx, scene.color)
 * endFrame(ctx)
 *
 *
 */
export function viewFrustum(ctx, opts) {
  const o = opts || {};
  let cam;
  if (o.mat4Eye && o.mat4Proj) {
    _matCam.mat4Eye = o.mat4Eye;
    _matCam.mat4Proj = o.mat4Proj;
    _matCam.ndcZMin = T.WEBGPU;
    cam = _matCam;
  } else if (o.camera && typeof o.camera.eval === 'function' && typeof o.camera.sampleEye === 'function') cam = o.camera.eval(_cam);
  else if (o.camera && o.camera.eye && o.camera.center && o.camera.up) cam = o.camera;
  else {
    console.error('[webgpu.tree] viewFrustum: needs `camera` (a camera state or a camera track) or `mat4Eye` and `mat4Proj`.');
    return;
  }
  const aspect = _aspect(ctx, o);
  const bits = o.bits ?? (T.NEAR | T.FAR | T.BODY);
  // a textured face is drawn first and keeps its outline, as the reference draws it
  if (((bits & T.FAR) && o.farTexture) || ((bits & T.NEAR) && o.nearTexture)) {
    if (T.frustumCorners(_c24, cam, aspect)) {
      if ((bits & T.FAR) && o.farTexture) pane(ctx, _corner(_q0, 7), _corner(_q1, 6), _corner(_q2, 5), _corner(_q3, 4), { texture: o.farTexture, depth: o.depth });
      if ((bits & T.NEAR) && o.nearTexture) pane(ctx, _corner(_q0, 3), _corner(_q1, 2), _corner(_q2, 1), _corner(_q3, 0), { texture: o.nearTexture, depth: o.depth });
    }
  }
  const g = _keyed(ctx, 'frustum');
  _generate(ctx, g, (a) => T.frustumLines(a, cam, { aspect, ndcZMin: T.WEBGPU, bits, color: o.color }));
  _drawLines(ctx, g, null, o.color, o.depth, o.width);
  if (o.viewer === null) return;
  const E = cam === _matCam ? cam.mat4Eye : T.cameraEye(_E, cam);
  if (typeof o.viewer === 'function') o.viewer(ctx, E);
  else axes(ctx, { M: E, size: 50, bits: T.X | T.Y | T._Z, depth: o.depth });
}

/** The default marker of a pose track: a six-axis frame at the keyframe's pose. @ignore */
function _poseMarker(ctx, kf, i, track, o) {
  const q = kf.rot;
  axes(ctx, {
    M: T.mat4FromTRS(_Mk, kf.pos[0], kf.pos[1], kf.pos[2], q[0], q[1], q[2], q[3], 1, 1, 1),
    size: 30, bits: T.X | T._X | T.Y | T._Y | T.Z | T._Z, depth: o.depth,
  });
}

/** The default marker of a camera track: a triad the size of near, the apex lines and the near rectangle. @ignore */
function _cameraMarker(ctx, kf, i, track, o) {
  const g = _keyed(ctx, 'marker');
  _generate(ctx, g, (a) => T.frustumLines(a, kf, { aspect: _aspect(ctx, o), ndcZMin: T.WEBGPU, bits: T.NEAR | T.APEX, color: o.color }));
  _drawLines(ctx, g, null, o.color, o.depth, o.width);
  axes(ctx, { M: track.mat4Eye(_E, i, 0), size: typeof kf.near === 'number' ? kf.near : 0.1, bits: T.X | T.Y | T._Z, depth: o.depth });
}

/**
 * A track's path by bit: PATH the sampled polyline, CONTROLS, TANGENTS_IN /
 * TANGENTS_OUT, CENTER (camera tracks); a marker per keyframe (default a small
 * frame, or a camera at its lens; `marker: null` omits, a function draws its
 * own); HANDLES draws each member of `track.handles` through `handleLocus`.
 * @param {object} ctx  The context record.
 * @param {object} track  A PoseTrack or a CameraTrack.
 * @param {{ bits?:number, samples?:number, target?:string, tangentScale?:number, centerSize?:number,
 *           marker?:function|null, aspect?:number, color?:number[], depth?:boolean, width?:number }} [opts]
 * @example
 * <caption>A three-keyframe pose track: its path, its control points, and a small frame at each keyframe.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, trackPath, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const track = new tree.PoseTrack()
 * track.add([
 *   { pos: [-150, 0, 0], rot: [0, 0, 0, 1] },
 *   { pos: [0, 100, 50], rot: [0, 0, 0, 1] },
 *   { pos: [150, 0, 0], rot: [0, 0, 0, 1] },
 * ])
 *
 * setCamera(ctx, tree.createCamera({ eye: [164, 186, 243], center: [0, 50, 25] }))
 *
 * ctx.backend.bindTarget(ctx, scene)
 * ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 * trackPath(ctx, track, { bits: tree.PATH | tree.CONTROLS, color: [1, 0.82, 0.4, 1] })
 * ctx.backend.bindTarget(ctx, SCREEN)
 * image(ctx, scene.color)
 * endFrame(ctx)
 *
 *
 */
export function trackPath(ctx, track, opts) {
  const o = opts || {};
  if (!track || !Array.isArray(track.keyframes)) return;
  const bits = o.bits ?? T.PATH;
  const g = _keyed(ctx, 'path');
  _generate(ctx, g, (a) => T.pathLines(a, track, {
    bits: bits & ~T.HANDLES, samples: o.samples, target: o.target,
    tangentScale: o.tangentScale, centerSize: o.centerSize, color: o.color,
  }));
  _drawLines(ctx, g, null, o.color, o.depth, o.width);
  const isCamera = typeof track.sampleEye === 'function';
  const marker = 'marker' in o ? o.marker : (isCamera ? (o.target === 'center' ? null : _cameraMarker) : _poseMarker);
  if (typeof marker === 'function') {
    const kfs = track.keyframes;
    for (let i = 0; i < kfs.length; i++) marker(ctx, kfs[i], i, track, o);
  }
  if ((bits & T.HANDLES) && track.handles && track.handles.members) {
    // the dot for every member, the ring for a rot dial; a VIEW member's drag plane is not drawn
    for (const m of track.handles.members) {
      handleLocus(ctx, m.h, { bits: m.field === 'rot' ? T.HANDLE | T.LOCUS : T.HANDLE, size: track.handles.grabPx, color: o.color, depth: o.depth });
    }
  }
}

/**
 * A helm's control rig in the scene at `M`, oriented to the helm's resolved
 * `from`: three translation arrows and three rotation rings, the driven channel
 * bright. With `{ x, y }` it renders into a small cached target through its own
 * orthographic camera and composites it at (x, y) in HUD pixels (y down) with
 * `tint` — the corner readout of a camera fly; `identify` sends each channel's
 * lane to the host's labels.
 * @param {object} ctx  The context record.
 * @param {object} helm  A PoseHelm.
 * @param {{ M?:ArrayLike<number>, size?:number, bits?:number, identify?:boolean, depth?:boolean,
 *           width?:number, x?:number, y?:number, tilt?:number|number[], tint?:number[] }} [opts]
 * @example
 * <caption>A helm fed a translation rate, then a rotation rate, in turn: first an arrow brightens, then a ring.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, helmRig, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [123, 103, 165] })
 * const helm = new tree.PoseHelm()
 * const pose = { pos: tree.vec3(), rot: tree.quat() }
 * const lin = tree.vec3()
 * const ang = tree.vec3()
 * let last = 0
 *
 * function frame(ms) {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   const s = Math.sin(ms / 1000)
 *   lin[0] = 250 * Math.max(0, s)
 *   ang[1] = 250 * Math.max(0, -s)
 *   helm.feed(lin, ang)
 *   helm.step(pose, Math.min((ms - last) / 1000, 0.05))
 *   last = ms
 *   setCamera(ctx, cam)
 *   helmRig(ctx, helm, { size: 100 })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 *
 *
 */
export function helmRig(ctx, helm, opts) {
  const o = opts || {};
  if (!helm) return;
  if (o.x != null && o.y != null) { _rigHud(ctx, helm, o); return; }
  const basis = helmBasis(helm, viewOf(ctx), _R);
  let M = o.M || null;
  if (basis) {
    for (let i = 0; i < 12; i++) _R[i] = basis[i];
    _R[12] = _R[13] = _R[14] = 0;
    _R[15] = 1;
    M = M ? T.mat4Mul(_M, M, _R) : _R;
  }
  const g = _keyed(ctx, 'helmRig', { color: true, labels: true });
  _generate(ctx, g, (a) => T.helmRigLines(a, helm, { size: o.size, bits: o.bits, identify: o.identify === true }));
  _drawLines(ctx, g, M, null, o.depth, o.width);
  const host = ctx.host;
  if (o.identify === true && host && host.labels && g.arrays.labels.length) {
    const id = helm._rigId || (helm._rigId = ++_rigSeq);
    g.arrays.labels.forEach((l, i) => {
      if (M) T.mat4MulPoint(_p, M, l.x, l.y, l.z);
      else { _p[0] = l.x; _p[1] = l.y; _p[2] = l.z; }
      host.labels.set('helmRig' + id + ':' + i, l.text, _p[0], _p[1], _p[2], { frame: true, class: 'helm-rig' });
    });
  }
}

/**
 * The rig's HUD form: rendered into a per-helm cached square target through its
 * own iso camera, then composited at (x, y) in HUD pixels with `tint`.
 * @ignore
 */
function _rigHud(ctx, helm, o) {
  // the HUD's coordinates are logical pixels: the rig's own target is that size
  // times the canvas's scale, and the rect it is displayed in is the same
  const s = canvasScale(ctx);
  const size = o.size ?? 120;
  const px = Math.max(1, Math.round(size * s));
  if (!ctx.rigs) ctx.rigs = new Map();
  let entry = ctx.rigs.get(helm);
  if (!entry || entry.size !== px) {
    entry = { target: renderTarget(ctx, { width: px, height: px }), size: px };
    ctx.rigs.set(helm, entry);
  }
  let az = _AZ_ISO, el = _EL_ISO;
  if (Array.isArray(o.tilt)) { az = o.tilt[0]; el = o.tilt[1]; } else if (typeof o.tilt === 'number') el = o.tilt;
  const ce = Math.cos(el), se = Math.sin(el);
  _rigCam.eye[0] = _RIG_D * ce * Math.sin(az);
  _rigCam.eye[1] = _RIG_D * se;
  _rigCam.eye[2] = _RIG_D * ce * Math.cos(az);

  const priorTarget = ctx.backend.bindTarget(ctx);
  const priorViewport = ctx.backend.setViewport(ctx);
  const priorState = ctx.backend.setState(ctx, { depth: true });
  const V = Float32Array.from(ctx.V), P = Float32Array.from(ctx.P);
  ctx.backend.bindTarget(ctx, entry.target);
  ctx.backend.clear(ctx, [0, 0, 0, 0]);
  setCamera(ctx, T.cameraView(_E, _rigCam), T.cameraProj(_P, _rigCam, 1));
  const g = _keyed(ctx, 'helmRig', { color: true });
  _generate(ctx, g, (a) => T.helmRigLines(a, helm, { size: 100, bits: o.bits }));
  _drawLines(ctx, g, null, null, true, o.width);
  setCamera(ctx, V, P);
  ctx.backend.bindTarget(ctx, priorTarget);
  ctx.backend.setViewport(ctx, priorViewport);
  ctx.backend.setState(ctx, priorState);
  // the rect is the target's own pixels, origin bottom-left, as image takes it
  const H = viewportOf(ctx)[3];
  image(ctx, entry.target.color, {
    x: (o.x ?? 0) * s,
    y: H - ((o.y ?? 0) + size) * s,
    width: px,
    height: px,
    tint: o.tint,
    blend: NORMAL,
  });
}

/**
 * A handle's visuals: the dot at its point (a constant pixel size), the AIM
 * line, the LOCUS and the RING by bit.
 * @param {object} ctx  The context record.
 * @param {object} h  A host handle.
 * @param {{ bits?:number, size?:number, color?:number[], dotColor?:number[], depth?:boolean, width?:number }} [opts]
 * @example
 * <caption>Drag the magenta dot: it slides on the ground plane y = 0.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, grid, handleLocus, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 *
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [164, 136, 218] })
 * const h = canvasHost.handle({ constraint: tree.PLANE, anchor: [0, 0, 0], normal: [0, 1, 0] })
 * const q = tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2)
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *
 * function frame(ms) {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   h.update()
 *   grid(ctx, { M: ground, size: 120, subdivisions: 10 })
 *   handleLocus(ctx, h, { dotColor: [1, 0.31, 0.85, 1] })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 *
 *
 */
export function handleLocus(ctx, h, opts) {
  const o = opts || {};
  if (!h || !h._constraint) return;
  const bits = o.bits ?? (T.HANDLE | T.AIM | T.LOCUS);
  h.value(_p, { report: T.POINT });
  const g = _keyed(ctx, 'locus');
  _generate(ctx, g, (a) => T.locusLines(a, h._constraint, {
    bits: bits & (T.AIM | T.LOCUS | T.RING), mat4View: ctx.V, point: _p, color: o.color,
  }));
  _drawLines(ctx, g, null, o.color, o.depth, o.width);
  if (bits & T.HANDLE) {
    const V = ctx.V;
    const height = -canvasViewport(ctx)[3] || 1;   // the grab radius counts logical pixels
    const eyeZ = V[2] * _p[0] + V[6] * _p[1] + V[10] * _p[2] + V[14];
    const r = (o.size ?? h._grabPx ?? 12) * T.pixelRatio(ctx.P, height, eyeZ);
    _du[0] = V[0]; _du[1] = V[4]; _du[2] = V[8];   // the camera's right
    _dv[0] = V[1]; _dv[1] = V[5]; _dv[2] = V[9];   // the camera's up
    const d = _keyed(ctx, 'dot');
    _generate(ctx, d, (a) => _disc(a, _p[0], _p[1], _p[2], r, _du, _dv));
    _drawTris(ctx, d, null, o.dotColor || o.color, o.depth);
  }
}

/** The pane's default uvs: `p0` reads (0, 0) — the twin's top-down texture space. @ignore */
const PANE_UVS = [0, 0, 1, 0, 1, 1, 0, 1];

/**
 * A textured or flat quad through the pane program — p0 … p3 in order, the
 * default uvs reading `p0` at (0, 0): the twin's texture space is top-down, so
 * an image sits upright on the pane where the reference's flipped upload does.
 * @param {object} ctx  The context record.
 * @param {number[]} p0  A corner.
 * @param {number[]} p1  The next corner, in order.
 * @param {number[]} p2
 * @param {number[]} p3
 * @param {{ M?:ArrayLike<number>, color?:number[], texture?:object, uvs?:number[], depth?:boolean }} [opts]
 * @example
 * <caption>A 2D-canvas texture on a quad reads upright: “webgpu” on a yellow band at the top.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, texture, pane, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const label = document.createElement('canvas')
 * label.width = 256
 * label.height = 256
 * const g = label.getContext('2d')
 * g.fillStyle = '#ff4fd8'
 * g.fillRect(0, 0, 256, 256)
 * g.fillStyle = '#ffd166'
 * g.fillRect(0, 0, 256, 96)
 * g.fillStyle = '#222'
 * g.font = 'bold 52px sans-serif'
 * g.fillText('webgpu', 24, 68)
 * const tex = texture(ctx, label)
 *
 * setCamera(ctx, tree.createCamera({ eye: [0, 0, 205] }))
 *
 * ctx.backend.bindTarget(ctx, scene)
 * ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 * pane(ctx, [-100, 100, 0], [100, 100, 0], [100, -100, 0], [-100, -100, 0], { texture: tex })
 * ctx.backend.bindTarget(ctx, SCREEN)
 * image(ctx, scene.color)
 * endFrame(ctx)
 *
 *
 */
export function pane(ctx, p0, p1, p2, p3, opts) {
  const o = opts || {};
  const g = _keyed(ctx, 'pane', { texcoord: true });
  _generate(ctx, g, (a) => T.paneTris(a, p0, p1, p2, p3, { uvs: o.uvs || PANE_UVS, color: o.color }));
  const count = g.arrays.count;
  if (!count) return;
  const prog = _paneProgram(ctx);
  if (!prog) return;
  const priorState = ctx.backend.setState(ctx, { depth: o.depth !== false, topology: 'triangle-list' });
  const priorProg = ctx.prog;
  const slot = _slot(ctx, 'pane', count);
  ctx.device.queue.writeBuffer(slot.geometry.buffers[0], 0, g.arrays.position.data, 0, 3 * count);
  ctx.device.queue.writeBuffer(slot.geometry.buffers[1], 0, g.arrays.texcoord.data, 0, 2 * count);
  const uniforms = { uColor: o.color || WHITE, uUseTexture: o.texture ? 1 : 0 };
  if (o.texture) uniforms.uTexture = o.texture;
  bind(ctx, prog, uniforms);
  draw(ctx, slot.geometry, o.M || null, { count });   // the draw installs uModelViewProjectionMatrix
  ctx.prog = priorProg;
  ctx.backend.setState(ctx, priorState);
}

// ── HUD ──────────────────────────────────────────────────────────────────

/**
 * Start drawing in screen space: the installed camera is saved, an
 * orthographic projection over the canvas's logical viewport in pixels, y down,
 * with an identity view goes in, and the depth test goes off. Pair with
 * `endHUD`. The screen-space gizmos and `image` are the usual contents.
 * @param {object} ctx  The context record.
 * @example
 * <caption>Between beginHUD and endHUD, coordinates are logical pixels: a crosshair near the top-left corner, a bulls-eye near the bottom-right.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, beginHUD, endHUD, cross, bullsEye, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * setCamera(ctx, tree.createCamera({ eye: [129, 107, 172] }))
 *
 * ctx.backend.bindTarget(ctx, scene)
 * ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 * axes(ctx, { size: 100 })
 * beginHUD(ctx)
 * cross(ctx, { x: 40, y: 40, size: 30, color: [1, 0.31, 0.85, 1] })
 * bullsEye(ctx, { x: 350, y: 250, size: 50, color: [1, 0.82, 0.4, 1] })
 * endHUD(ctx)
 * ctx.backend.bindTarget(ctx, SCREEN)
 * image(ctx, scene.color)
 * endFrame(ctx)
 *
 *
 */
export function beginHUD(ctx) {
  if (!ctx || ctx.hud) return;
  const vp = canvasViewport(ctx);
  ctx.hud = { V: Float32Array.from(ctx.V), P: Float32Array.from(ctx.P), state: ctx.state };
  ctx.backend.setState(ctx, { depth: false });
  setCamera(ctx, IDENTITY, T.mat4Ortho(_P, vp[0], vp[0] + vp[2], vp[1], vp[1] + vp[3], -1, 1));
}

/**
 * End HUD mode: the camera and the depth test come back.
 * @param {object} ctx  The context record.
 * @example
 * <caption>After endHUD the camera is back: axes drawn after it sit in the scene, over a yellow HUD bulls-eye at the centre.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, beginHUD, endHUD, bullsEye, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * setCamera(ctx, tree.createCamera({ eye: [129, 107, 172] }))
 *
 * ctx.backend.bindTarget(ctx, scene)
 * ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 * beginHUD(ctx)
 * bullsEye(ctx, { x: 200, y: 150, size: 120, color: [1, 0.82, 0.4, 1] })
 * endHUD(ctx)
 * axes(ctx, { size: 100 })
 * ctx.backend.bindTarget(ctx, SCREEN)
 * image(ctx, scene.color)
 * endFrame(ctx)
 *
 *
 */
export function endHUD(ctx) {
  if (!ctx || !ctx.hud) return;
  setCamera(ctx, ctx.hud.V, ctx.hud.P);
  ctx.backend.setState(ctx, ctx.hud.state);
  ctx.hud = null;
}

/** Run a HUD gizmo inside beginHUD / endHUD unless HUD mode is already on. @ignore */
function _inHud(ctx, drawFn) {
  const wrap = !ctx.hud;
  if (wrap) beginHUD(ctx);
  drawFn();
  if (wrap) endHUD(ctx);
}

/**
 * A crosshair at (x, y) in logical pixels, y down.
 * @param {object} ctx  The context record.
 * @param {{ x?:number, y?:number, size?:number, color?:number[], width?:number }} [opts]
 * @example
 * <caption>A magenta crosshair at the canvas centre, over the origin the camera looks at.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, cross, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * setCamera(ctx, tree.createCamera({ eye: [129, 107, 172] }))
 *
 * ctx.backend.bindTarget(ctx, scene)
 * ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 * axes(ctx, { size: 100 })
 * cross(ctx, { x: 200, y: 150, size: 40, color: [1, 0.31, 0.85, 1] })
 * ctx.backend.bindTarget(ctx, SCREEN)
 * image(ctx, scene.color)
 * endFrame(ctx)
 *
 *
 */
export function cross(ctx, opts) {
  const o = opts || {};
  const g = _keyed(ctx, 'cross');
  _generate(ctx, g, (a) => T.crossLines(a, o));
  _inHud(ctx, () => _drawLines(ctx, g, null, o.color, false, o.width));
}

/**
 * A bulls-eye at (x, y) in logical pixels, y down: a circle (CIRCLE) or the
 * cornered square (SQUARE) of `size`, with the central cross.
 * @param {object} ctx  The context record.
 * @param {{ x?:number, y?:number, size?:number, shape?:number, detail?:number, color?:number[], width?:number }} [opts]
 * @example
 * <caption>A round bulls-eye on the left, a cornered square one on the right.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, bullsEye, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 *
 * ctx.backend.bindTarget(ctx, scene)
 * ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 * bullsEye(ctx, { x: 120, y: 150, size: 100, shape: tree.CIRCLE, color: [1, 0.31, 0.85, 1] })
 * bullsEye(ctx, { x: 280, y: 150, size: 100, shape: tree.SQUARE, color: [1, 0.82, 0.4, 1] })
 * ctx.backend.bindTarget(ctx, SCREEN)
 * image(ctx, scene.color)
 * endFrame(ctx)
 *
 *
 */
export function bullsEye(ctx, opts) {
  const o = opts || {};
  const g = _keyed(ctx, 'bullsEye');
  _generate(ctx, g, (a) => T.bullsEyeLines(a, o));
  _inHud(ctx, () => _drawLines(ctx, g, null, o.color, false, o.width));
}
