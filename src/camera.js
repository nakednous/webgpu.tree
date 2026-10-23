/**
 * @file The camera install — the transforms every draw reads.
 * @module webgpu.tree/camera
 * @license AGPL-3.0-only
 *
 * `setCamera` installs the view and projection every later draw uses, from two
 * matrices or from a camera state. The state form computes the projection with
 * `tree`'s NDC depth convention bound to `WEBGPU` (0) — the twin's one
 * difference here from `webgl.tree`, and the reason the `tree` namespace below
 * has it bound too.
 *
 * ```
 * setCamera(ctx, V, P, opts)   // from matrices
 * setCamera(ctx, cam, opts)    // from a camera state { eye, center, up, fov, near, far }
 * ```
 */

'use strict';

import { WEBGPU, cameraProj, cameraView } from '@nakednous/tree';
import { viewOf } from './context.js';

const _V = new Float32Array(16);
const _P = new Float32Array(16);

const _isCameraState = (c) => !!(c && c.eye && c.center && c.up);
const _isMat4 = (m) => m != null && typeof m === 'object' && typeof m.length === 'number' && m.length >= 16;

/**
 * Install the view and projection a draw uses, from V and P matrices or a
 * camera state.
 * @details Both copy V and P into the context, recompute P · V and, with a
 * host, write the same matrices into its view bag, so handles, labels and the
 * orbit see the camera the draws use. The state form is the seam a track, a
 * helm, an orbit or a measured pose fills: they write cam, the frame calls
 * `setCamera(ctx, cam)`.
 * @param {object} ctx  The context record.
 * @param {ArrayLike<number>|object} V  A view mat4, or a camera state.
 * @param {ArrayLike<number>|object} [P]  A projection mat4 (the matrix form), or opts (the state form).
 * @param {{ host?:object, aspect?:number }} [opts]  host: a host to write the
 *        view bag into, beside the one attached at init. aspect: the state
 *        form's projection aspect (default the canvas's).
 * @returns {object} The view bag.
 * @example
 * const cam = tree.createCamera({ eye: [0, 107, 215] })
 * setCamera(ctx, cam)
 */
export function setCamera(ctx, V, P, opts) {
  let o = opts;
  let view;
  let proj;
  if (_isCameraState(V)) {
    o = P;
    const cam = V;
    const aspect = (o && typeof o.aspect === 'number') ? o.aspect : (ctx.height ? ctx.width / ctx.height : 1);
    view = cameraView(_V, cam);
    proj = cameraProj(_P, cam, aspect, WEBGPU) || ctx.P;   // a state with no lens keeps the projection installed
  } else if (_isMat4(V) && _isMat4(P)) {
    view = V;
    proj = P;
  } else {
    console.error('[webgpu.tree] setCamera: pass (ctx, V, P) matrices or (ctx, cam) a camera state.');
    return viewOf(ctx);
  }
  ctx.backend.setCamera(ctx, view, proj);
  const host = (o && o.host) || ctx.host;
  if (host && host.view) host.view.set(ctx.P, ctx.V);
  return host && host.view ? host.view : ctx.view;
}
