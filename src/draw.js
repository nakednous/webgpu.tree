/**
 * @file The draw — bind a program, draw geometry under the declared transforms.
 * @module webgpu.tree/draw
 * @license AGPL-3.0-only
 *
 * `bind` a program, then `draw` the geometry `buffer` uploaded: each of these
 * transform uniforms the program declares is uploaded from the model matrix and
 * the camera `setCamera` installed.
 *
 * ```
 * uModelMatrix                 M
 * uViewMatrix                  V
 * uModelViewMatrix             V · M
 * uProjectionMatrix            P
 * uModelViewProjectionMatrix   P · V · M
 * uNormalMatrix                (V · M)⁻ᵀ, 3×3
 * ```
 *
 * @details
 * ```
 * bind(ctx, prog, uniforms)            // the program the next draw uses, and a bag by name
 * buffer(ctx, arrays)                  // a mesh → the geometry a draw takes
 * updateBuffer(ctx, geometry, arrays)  // the same shape, refreshed
 * draw(ctx, obj, M, opts)              // obj: a geometry; M: a mat4, or omitted for identity
 * drawInstanced(ctx, obj, n, M, opts)  // the same with an instance count
 * ```
 *
 * **The vertex layout is the pipeline's, and there is nothing to settle.** In
 * GL an attribute array is context state that outlives a draw, so the bridge
 * disables what a program declares and a mesh lacks, at every draw. WebGPU bakes
 * the vertex state into the pipeline: `program(ctx, wgsl, { buffers })` states
 * the layout its vertex stage reads, and `buffer(ctx, arrays)` answers the
 * layout the geometry's arrays shape implies (`geometry.bufferLayouts`) — the
 * two are one statement when a program is made from the geometry's own record,
 * and a mismatch is a validation error at the first draw, not a stale attribute.
 * So this module has no `bindGeometry`: the backend's `setVertexAndIndexBuffers`
 * sets the geometry's buffers on the open pass and the pipeline decides what
 * they mean.
 *
 * The transforms are computed into the context's scratch (`ctx.MV`, `ctx.MVP`,
 * `ctx.N`, sized by `init`) and each is uploaded **only if the program declares
 * it**, read off `uniformsOf` once per program; a fullscreen pass declares none
 * and gets none, and the bridge never sets a name outside this table. They go
 * through the backend's `setUniforms` — the member `idiom` calls — so a mat3
 * travels as nine floats and the backend pads its columns, and the values apply
 * to the draw that follows. `bind`'s bag is uploaded first, so a draw's
 * transforms win where both name one.
 *
 * The arithmetic is the bridge's until `idiom`'s draw policy lands (§7 #109's
 * R2 gives the six names to `idiom`; S2 deferred the policy). It is one deletion
 * when it does: the policy calls the same `setUniforms`, and nothing here
 * reaches the interface.
 *
 * `opts` is `{ count, offset }`: a partial draw, `count` vertices (or indices)
 * from `offset` — WebGPU's own units, a first vertex or a first index, where
 * twgl's indexed draw counted bytes.
 */

'use strict';

import { mat3NormalFromMat4, mat4Mul } from '@nakednous/tree';

/** The transform names a program may declare, in the order the bridge fills them. */
export const TRANSFORMS = ['uModelMatrix', 'uViewMatrix', 'uModelViewMatrix', 'uProjectionMatrix', 'uModelViewProjectionMatrix', 'uNormalMatrix'];

/** The key each transform's flag takes. @ignore */
const KEYS = ['model', 'view', 'mv', 'proj', 'mvp', 'normal'];

/**
 * Which of the six transforms a program declares.
 * @param {string[]} names  The uniform names a program declares, `uniformsOf`'s answer.
 * @returns {{ model:boolean, view:boolean, mv:boolean, proj:boolean, mvp:boolean, normal:boolean, any:boolean }}
 * @ignore
 */
export function declaredTransforms(names) {
  const d = {};
  let any = false;
  for (let i = 0; i < TRANSFORMS.length; i++) {
    const declared = Array.isArray(names) && names.indexOf(TRANSFORMS[i]) >= 0;
    d[KEYS[i]] = declared;
    if (declared) any = true;
  }
  d.any = any;
  return d;
}

const _declaredBy = new WeakMap();
const _declared = (ctx, prog) => {
  let d = _declaredBy.get(prog);
  if (!d) {
    d = declaredTransforms(ctx.backend.uniformsOf(prog));
    _declaredBy.set(prog, d);
  }
  return d;
};

const _now = new WeakMap();
const _valuesOf = (prog) => {
  let values = _now.get(prog);
  if (!values) {
    values = {};
    _now.set(prog, values);
  }
  return values;
};

const _isMat4 = (m) => m != null && typeof m === 'object' && typeof m.length === 'number' && m.length >= 16;
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/**
 * Upload the transforms the bound program declares, for a model matrix M (null
 * for identity), from the context's installed V and P.
 * @param {object} ctx  The context record.
 * @param {object} prog  A program record.
 * @param {ArrayLike<number>|null} M  A model mat4, or null for identity.
 * @ignore
 */
export function uploadTransforms(ctx, prog, M) {
  const d = _declared(ctx, prog);
  if (!d.any) return;
  const V = ctx.V;
  const P = ctx.P;
  const MV = M ? mat4Mul(ctx.MV, V, M) : V;
  const values = _valuesOf(prog);
  const all = {
    model: M || IDENTITY,
    view: V,
    mv: MV,
    proj: P,
    mvp: M ? mat4Mul(ctx.MVP, P, MV) : ctx.PV,
    normal: mat3NormalFromMat4(ctx.N, MV),
  };
  // the bag carries the declared names only, and no name a former draw left behind
  for (let i = 0; i < TRANSFORMS.length; i++) {
    const key = KEYS[i];
    if (d[key]) values[TRANSFORMS[i]] = all[key];
    else delete values[TRANSFORMS[i]];
  }
  ctx.backend.setUniforms(ctx, prog, values);
}

/**
 * Bind a program and set its uniforms — the program the next `draw` uses.
 * @param {object} ctx  The context record.
 * @param {object} prog  A program record from `program(ctx, wgsl)`.
 * @param {object} [uniforms]  Values by name, as the program's uniform members.
 * @returns {object|null} prog, or null where there is none.
 * @example
 * const prog = program(ctx, wgsl)
 * bind(ctx, prog, { uColor: [0.9, 0.4, 0.1, 1] })
 * draw(ctx, box, M)
 */
export function bind(ctx, prog, uniforms) {
  if (!ctx || !ctx.backend) return null;
  if (!prog) {
    console.error('[webgpu.tree] bind: `prog` must be a program from program(ctx, wgsl).');
    return null;
  }
  ctx.prog = prog;
  if (uniforms) ctx.backend.setUniforms(ctx, prog, uniforms);
  return prog;
}

// The arrays shape's keys as the attribute names the bridge's geometry uses. On
// WebGPU the name is a reading aid — a shader's inputs are matched by location —
// but the rename keeps a figure's WGSL and a webgl.tree port reading the same,
// and the key order is what fixes the locations.
const ATTRIBUTES = {
  position: 'aPosition', normal: 'aNormal', tangent: 'aTangent', texcoord: 'aTexCoord', color: 'aColor',
  joints: 'aJoints', weights: 'aWeights',
};

// Numbers to upload: a typed array, a list of numbers, or either under `data`.
const _isNumbers = (a) => ArrayBuffer.isView(a) || (Array.isArray(a) && typeof a[0] === 'number');
const _isAttribute = (a) => a != null && (_isNumbers(a) || _isNumbers(a.data));

/**
 * A geometry from a mesh — the arrays shape `host.loadMesh` returns, a
 * `loadModel` part carries, `tree.platonic` returns, and a twgl primitive is —
 * under the attribute names the shaders use.
 *
 * Names. The keys the arrays shape fixes are renamed: position → aPosition,
 * normal → aNormal, tangent → aTangent, texcoord → aTexCoord, color → aColor,
 * joints → aJoints (uploaded unnormalised), weights → aWeights. A key of its own
 * keeps its name — a custom attribute meets the shader's `@location` by the
 * layout, and a key renamed for a shader written to other names is blanked the
 * way webgl.tree's is: `buffer(ctx, { ...mesh, aUV: mesh.texcoord, texcoord:
 * undefined })`.
 *
 * Locations. The geometry's layout is its arrays shape's: attributes in key
 * order, `@location(0)` first, and—interleaved—one vertex buffer. That layout is
 * what `geometry.bufferLayouts` answers, and what `program(ctx, wgsl, {
 * buffers })` states to the pipeline; the two are the same statement when a
 * program is made from the geometry's own record.
 *
 * Skipped: a key that holds no numbers — a mesh's `bounds`, a generator's
 * `count` and `labels` — so any mesh goes in whole. An attribute edited after
 * the upload is re-sent with `updateBuffer(ctx, geometry, arrays)`.
 * @param {object} ctx  The context record.
 * @param {object} arrays  The arrays shape: `{ position, indices?, normal?, … }`,
 *        each a `{ numComponents, data }` or a typed array webgpu-utils sizes.
 * @returns {object|null} The geometry `draw` takes: `buffers`, `bufferLayouts`,
 *          `numElements`, and the `indexBuffer` / `indexFormat` where indexed.
 * @example
 * const solid = buffer(ctx, tree.platonic(tree.HEXAHEDRON, { radius: 50 }))
 * const prog = program(ctx, wgsl, { buffers: solid.bufferLayouts })
 */
export function buffer(ctx, arrays) {
  if (!ctx || !ctx.backend) return null;
  return ctx.backend.createBuffer(ctx, _named(arrays));
}

/**
 * Refresh a geometry from the arrays shape it was made with — the same keys, a
 * count that changed or values edited. The record keeps its id and is drawn as
 * before; the program's pipeline still expects the layout it baked, so the
 * shape's attributes and their order stay the same.
 * @param {object} ctx  The context record.
 * @param {object} geometry  A record `buffer` answered.
 * @param {object} arrays  The arrays shape, as `buffer` takes it.
 * @returns {object|null} geometry.
 * @example
 * updateBuffer(ctx, grid, { ...gridMatrices, position: { numComponents: 3, data } })
 */
export function updateBuffer(ctx, geometry, arrays) {
  if (!ctx || !ctx.backend) return null;
  if (!geometry) {
    console.error('[webgpu.tree] updateBuffer: a geometry from buffer(ctx, arrays) is required.');
    return null;
  }
  return ctx.backend.updateBuffer(ctx, geometry, _named(arrays));
}

/** The arrays shape under the shaders' attribute names, numbers only. @ignore */
function _named(arrays) {
  const named = {};
  if (!arrays) return named;
  for (const key in arrays) {
    let a = arrays[key];
    if (!_isAttribute(a)) continue;                        // a mesh's bounds, a generator's count and labels
    if (key === 'joints') a = a.data ? { ...a, normalize: false } : { numComponents: 4, data: a, normalize: false };
    named[ATTRIBUTES[key] || key] = a;
  }
  return named;
}

/**
 * Draw geometry with the program bound last, uploading the transforms it
 * declares.
 * @param {object} ctx  The context record.
 * @param {object} obj  A geometry from `buffer(ctx, arrays)`.
 * @param {ArrayLike<number>|object} [M]  A model mat4, omitted for identity; an
 *        `opts` object here is read as the third argument's, `draw(ctx, obj, opts)`.
 * @param {{ count?:number, offset?:number }} [opts]  A partial draw: `count`
 *        vertices (or indices) from `offset`, WebGPU's units.
 * @example
 * const cam = tree.createCamera({ eye: [76, 102, 204] })
 * setCamera(ctx, cam)
 * bind(ctx, prog, { uColor: [1, 0.31, 0.85] })
 * draw(ctx, box, tree.mat4FromTRS(M, -80, 0, 0, 0, 0, 0, 1, 1, 1, 1))
 */
export function draw(ctx, obj, M, opts) {
  if (M != null && !_isMat4(M)) { opts = M; M = null; }   // draw(ctx, obj, opts)
  return _draw(ctx, obj, M || null, opts, 1);
}

/**
 * Draw n instances of the geometry; the vertex stage reads `@builtin(instance_index)`.
 * @param {object} ctx  The context record.
 * @param {object} obj  A geometry from `buffer(ctx, arrays)`.
 * @param {number} n  Instance count.
 * @param {ArrayLike<number>|object} [M]  A model mat4, or an `opts` object.
 * @param {{ count?:number, offset?:number }} [opts]
 */
export function drawInstanced(ctx, obj, n, M, opts) {
  if (M != null && !_isMat4(M)) { opts = M; M = null; }
  return _draw(ctx, obj, M || null, opts, n || 1);
}

/** @ignore */
function _draw(ctx, obj, M, opts, instances) {
  if (!ctx || !ctx.backend) return null;
  const prog = ctx.prog;
  if (!prog) {
    console.error('[webgpu.tree] draw: no program bound — call bind(ctx, prog) first.');
    return null;
  }
  if (!obj) {
    console.error('[webgpu.tree] draw: `obj` must be a geometry from buffer(ctx, arrays).');
    return null;
  }
  uploadTransforms(ctx, prog, M);
  return instances > 1
    ? ctx.backend.drawInstanced(ctx, prog, obj, instances, opts)
    : ctx.backend.draw(ctx, prog, obj, opts);
}
