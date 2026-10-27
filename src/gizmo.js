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
 * The pipe is the layer's: a cache a gizmo name a context, its generators run into
 * the cache's arrays, the geometry rebuilt when the cache grows and written in
 * place otherwise, the wide line's expansion four vertices and six indices a
 * segment, and the HUD an ortho over the viewport in logical pixels. What the
 * twin states is its own: the two line programs and the pane program (a shader
 * source is per API), the slot-per-draw rule (a queue write is ordered with
 * submissions, so a frame's i-th write of a geometry reaches its own buffer —
 * the backend's, §7 #127), and the density and viewport the pipe's width needs.
 *
 * **A slot per draw, per frame.** Each cache's creation options name the program
 * its geometry is built to — the pipeline bakes the vertex layout, so the
 * geometry is the program's (§7 #127) — and `{ stream: true }`, which makes the
 * record a pool the frame's writes take in turn. Two gizmos of one name drawn in
 * a frame therefore each read their own write.
 *
 * **The width.** `width` counts logical pixels, default 1, times the device
 * ratio. WebGPU rasterizes a `line-list` one device pixel wide, so at or below
 * one the line list draws (`LINE`) and above it each segment becomes a
 * window-space quad of that width (`WIDE`), the generators untouched. Both paths
 * are real: the twin has no other way to a wider line than the quads. The
 * expansion is in device pixels, so the viewport it divides by is the pass's —
 * the backend's own — and not the HUD's logical one.
 *
 * Depth is on by default, `{ depth: false }` for overlays; the state and the
 * program the pipe found are restored after every draw. Colour is semantic
 * where the generator writes a palette (axes, the helm rig) and `opts.color`
 * elsewhere (white by default).
 *
 * **The HUD** is `beginHUD` / `endHUD` over the canvas's *logical* screen
 * viewport — left 0, right w, bottom h, top 0, so y runs down like a pointer's —
 * with an identity view and the depth test off; the camera and the state come
 * back at `endHUD`. `cross` and `bullsEye` wrap themselves in one when called
 * outside it.
 *
 * A handle's dot draws through the pane's program as a flat quad of triangles,
 * with no texture; the frustum's `nearTexture` / `farTexture` faces are panes.
 *
 * **The label seam.** `helmRig`'s `identify` is the pipe's, not this bridge's:
 * the layer resolves each anchor in world space and its id, and hands it to a
 * sink, and what this bridge supplies is the sink itself — the host's label
 * layer. A rig's cache carries the helm's id, so a helm's lanes keep the ids
 * they had.
 *
 * **A caller's own lines.** `lines` is the same pipe for geometry the caller
 * writes: ten numbers a segment into a cache of its own, one draw, the same
 * width policy, and alpha blending over what is drawn already.
 */

'use strict';

import * as T from './tree.js';
import { helmBasis } from '@nakednous/host';
import {
  LINE, LINE_COLOR, LINE_COLOR_LAYOUT, LINE_LAYOUT, PANE, PANE_LAYOUT,
  WIDE, WIDE_COLOR, WIDE_COLOR_LAYOUT, WIDE_LAYOUT,
} from './programs.js';
import {
  NORMAL, beginHUD as beginHUDOf, drawLines as drawLinesOf, drawPane as drawPaneOf,
  endHUD as endHUDOf, fill as fillOf, gizmo as gizmoOf, image, inHUD as inHUDOf, renderTarget,
} from '@nakednous/idiom';
import { setCamera } from './camera.js';
import { viewOf } from './context.js';
import { viewportOf } from './frame.js';
import { canvasScale, canvasViewport } from './space.js';
import { BUFFER_USAGE } from './flags.js';

const _M = new Float32Array(16);      // a composed model matrix
const _R = new Float32Array(16);      // a basis' rotation block
const _P = new Float32Array(16);      // the rig's own projection
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

const _programs = (ctx) => ctx.gizmoPrograms || (ctx.gizmoPrograms = { line: Object.create(null), wide: Object.create(null), pane: null });

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

/**
 * A cache's creation options: the program its geometry is built to — a pipeline
 * bakes the vertex layout, so the geometry is the program's (§7 #127) — and a
 * stream, whose slots the frame's writes take in turn (§7 #113). A texcoord
 * cache is the pane program's; a colour cache the line pipe's colour variants.
 * @ignore
 */
function _creation(ctx, pane, colored) {
  const nonInterleaved = { interleave: false, stream: true, usage: BUFFER_USAGE.COPY_DST };
  if (pane) return { program: _paneProgram(ctx), ...nonInterleaved };
  return {
    program: _lineProgram(ctx, colored),
    ...nonInterleaved,
    wide: { program: _wideProgram(ctx, colored), ...nonInterleaved },   // the quads' program, for a width past one
  };
}

/**
 * Run a generator into a cache and (re)upload its geometry — the layer's `fill`
 * with this bridge's creation options, which stay the cache's own after the
 * first call, so a verb allocates nothing once warm.
 * @ignore
 */
function _fill(ctx, g, gen) {
  return fillOf(ctx, g, gen, g.opts || _creation(ctx, !!g.arrays.texcoord, !!g.arrays.color));
}

/** Draw a filled cache's lines under M — the layer's policy, this bridge's density. @ignore */
function _drawLines(ctx, g, M, color, depth, width, identify) {
  return drawLinesOf(ctx, g, { M, color, depth, width, dpr: canvasScale(ctx), identify });
}

/**
 * The sink the pipe hands a labelled item to: the host's label layer, a frame
 * label a re-set, the class this bridge's own. One sink a context, so a rig
 * drawn every frame allocates nothing.
 * @ignore
 */
function _sinkOf(ctx) {
  const host = ctx.host;
  if (!host || !host.labels) return null;
  return ctx.labelSink || (ctx.labelSink = (id, text, x, y, z) => {
    host.labels.set(id, text, x, y, z, { frame: true, class: 'helm-rig' });
  });
}

/** Draw a filled cache's triangles through the pane program. @ignore */
function _drawTris(ctx, g, M, color, texture, depth) {
  return drawPaneOf(ctx, g, { M, color, texture, depth });
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
  const g = gizmoOf(ctx, 'axes', { color: true });
  _fill(ctx, g, (a) => T.axesLines(a, o));
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
  const g = gizmoOf(ctx, 'grid');
  _fill(ctx, g, (a) => T.gridLines(a, o));
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
  const g = gizmoOf(ctx, 'hermite');
  _fill(ctx, g, (a) => T.hermiteLines(a, p0, t0, p1, t1, o));
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
  const g = gizmoOf(ctx, 'frustum');
  _fill(ctx, g, (a) => T.frustumLines(a, cam, { aspect, ndcZMin: T.WEBGPU, bits, color: o.color }));
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
  const g = gizmoOf(ctx, 'marker');
  _fill(ctx, g, (a) => T.frustumLines(a, kf, { aspect: _aspect(ctx, o), ndcZMin: T.WEBGPU, bits: T.NEAR | T.APEX, color: o.color }));
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
  const g = gizmoOf(ctx, 'path');
  _fill(ctx, g, (a) => T.pathLines(a, track, {
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
  const g = _rigCache(ctx, helm);
  _fill(ctx, g, (a) => T.helmRigLines(a, helm, { size: o.size, bits: o.bits, identify: o.identify === true }));
  _drawLines(ctx, g, M, null, o.depth, o.width, o.identify === true ? _sinkOf(ctx) : null);
}

/**
 * The rig's cache: one a helm, so the lanes' label ids — the cache's name and
 * the label's index — belong to the helm that drew them.
 * @ignore
 */
function _rigCache(ctx, helm) {
  const id = helm._rigId || (helm._rigId = ++_rigSeq);
  return gizmoOf(ctx, 'helmRig' + id, { color: true, labels: true });
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
  const g = _rigCache(ctx, helm);
  _fill(ctx, g, (a) => T.helmRigLines(a, helm, { size: 100, bits: o.bits }));
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
  const g = gizmoOf(ctx, 'locus');
  _fill(ctx, g, (a) => T.locusLines(a, h._constraint, {
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
    const d = gizmoOf(ctx, 'dot', { texcoord: true });
    _fill(ctx, d, (a) => _disc(a, _p[0], _p[1], _p[2], r, _du, _dv));
    _drawTris(ctx, d, null, o.dotColor || o.color, null, o.depth);
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
  const g = gizmoOf(ctx, 'pane', { texcoord: true });
  _fill(ctx, g, (a) => T.paneTris(a, p0, p1, p2, p3, { uvs: o.uvs || PANE_UVS, color: o.color }));
  _drawTris(ctx, g, o.M, o.color, o.texture || null, o.depth);
}

// ── The caller's own lines ──────────────────────────────────────────────

/**
 * Write `n` segments of ten numbers into a cache's arrays, and answer the
 * vertices the batch needs — the generator contract `fill` takes.
 * @ignore
 */
function _writeSegments(a, segments, n) {
  const pos = a.position.data, col = a.color.data;
  const m = Math.min(n, (pos.length / 6) | 0);          // a segment is two vertices
  for (let i = 0; i < m; i++) {
    const s = 10 * i, p = 6 * i, c = 8 * i;
    pos[p] = segments[s]; pos[p + 1] = segments[s + 1]; pos[p + 2] = segments[s + 2];
    pos[p + 3] = segments[s + 3]; pos[p + 4] = segments[s + 4]; pos[p + 5] = segments[s + 5];
    col[c] = col[c + 4] = segments[s + 6];
    col[c + 1] = col[c + 5] = segments[s + 7];
    col[c + 2] = col[c + 6] = segments[s + 8];
    col[c + 3] = col[c + 7] = segments[s + 9];
  }
  a.count = 2 * m;
  return 2 * n;
}

/**
 * A batch of coloured segments — the caller's own geometry, rebuilt a frame —
 * drawn in one call under `opts.M`: ten numbers a segment, its two endpoints
 * and its colour.
 * @details The batch goes into a cache of the pipe's, one a context, built to
 * this bridge's colour program and written a draw into the slot the frame's
 * submission takes, so a figure that rewrites one array a frame allocates
 * nothing and two batches of a frame read their own writes. `width` counts
 * logical pixels as every gizmo's does — the bridge's density carries it to
 * device pixels, and above one each segment expands into a quad, so a batch
 * states its width in page pixels and never in device ones. The colour's alpha
 * blends over what is drawn already, and the blend state and the depth test the
 * call found are restored after it.
 * @param {object} ctx  The context record.
 * @param {ArrayLike<number>} segments  The batch: `x0 y0 z0 x1 y1 z1 r g b a` a segment.
 * @param {{ count?:number, M?:ArrayLike<number>, width?:number, depth?:boolean }} [opts]
 *        `count` segments are drawn; the array's own length is the default.
 * @example
 * <caption>A ring rebuilt every frame into the same array, drawn in one call a frame — at a width of three logical pixels, so each segment is a quad.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, lines, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [164, 186, 243] })
 * const N = 64
 * const batch = new Float32Array(10 * N)
 *
 * function frame() {
 *   for (let i = 0; i < N; i++) {
 *     const a = 2 * Math.PI * i / N, b = 2 * Math.PI * (i + 1) / N, o = 10 * i
 *     batch[o] = 100 * Math.cos(a); batch[o + 1] = 100 * Math.sin(a); batch[o + 2] = 0
 *     batch[o + 3] = 100 * Math.cos(b); batch[o + 4] = 100 * Math.sin(b); batch[o + 5] = 0
 *     batch[o + 6] = 1; batch[o + 7] = 0.82; batch[o + 8] = 0.4; batch[o + 9] = 1
 *   }
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   lines(ctx, batch, { width: 3 })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 *
 *
 */
export function lines(ctx, segments, opts) {
  const o = opts || {};
  if (!segments) return;
  const n = o.count === undefined ? ((segments.length / 10) | 0) : Math.max(0, o.count | 0);
  const g = gizmoOf(ctx, 'lines', { color: true });
  _fill(ctx, g, (a) => _writeSegments(a, segments, n));
  const prior = ctx.backend.setState(ctx, { blend: NORMAL });
  try {
    _drawLines(ctx, g, o.M, null, o.depth, o.width);
  } finally {
    ctx.backend.setState(ctx, prior);
  }
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
  return beginHUDOf(ctx, { vp: canvasViewport(ctx) });
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
  return endHUDOf(ctx);
}

/** Run a HUD gizmo inside beginHUD / endHUD unless HUD mode is already on. @ignore */
function _inHud(ctx, drawFn) {
  return inHUDOf(ctx, { vp: canvasViewport(ctx) }, drawFn);
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
  const g = gizmoOf(ctx, 'cross');
  _fill(ctx, g, (a) => T.crossLines(a, o));
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
  const g = gizmoOf(ctx, 'bullsEye');
  _fill(ctx, g, (a) => T.bullsEyeLines(a, o));
  _inHud(ctx, () => _drawLines(ctx, g, null, o.color, false, o.width));
}
