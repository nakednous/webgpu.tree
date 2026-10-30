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
 * The transforms are the layer's: `idiom` owns the six names and the arithmetic
 * that fills `ctx.MV`, `ctx.MVP` and `ctx.N` (sized by `init`), and uploads each
 * **only if the program declares it**, read off `uniformsOf` once per program; a
 * fullscreen pass declares none and gets none, and neither package sets a name
 * outside that table. The values travel through the backend's `setUniforms` — a
 * mat3 as nine floats, the backend padding its columns — and apply to the draw
 * that follows. `bind`'s bag is uploaded first, so a draw's transforms win where
 * both name one.
 *
 * `drawInstanced` is the layer's `install` plus the backend's instanced member,
 * which is what one geometry repeated is for: one install, one draw call.
 *
 * `opts` is `{ count, offset }`: a partial draw, `count` vertices (or indices)
 * from `offset` — WebGPU's own units, a first vertex or a first index, where
 * twgl's indexed draw counted bytes.
 */

'use strict';

import { TRANSFORMS, declaredTransforms, draw as drawOf, install } from '@nakednous/idiom';

export { TRANSFORMS, declaredTransforms };

const _isMat4 = (m) => m != null && typeof m === 'object' && typeof m.length === 'number' && m.length >= 16;

/**
 * Upload the transforms the bound program declares, for a model matrix M (null
 * for identity), from the context's installed V and P — the layer's `install`,
 * which owns the six names, their arithmetic and the bag it writes.
 * @param {object} ctx  The context record.
 * @param {object} prog  A program record.
 * @param {ArrayLike<number>|null} M  A model mat4, or null for identity.
 * @ignore
 */
export function uploadTransforms(ctx, prog, M) {
  return install(ctx, prog, M);
}

/**
 * Bind a program and set its uniforms — the program the next `draw` or
 * `dispatch` uses. A storage buffer rides the same bag, by the name its WGSL
 * declaration gives it: `bind(ctx, kernel, { values })` where the source says
 * `var<storage, read_write> values`. A render program's vertex or fragment
 * stage reads one the same way, with no texture between them.
 * @param {object} ctx  The context record.
 * @param {object} prog  A program record from `program(ctx, wgsl)`.
 * @param {object} [uniforms]  Values by name: the program's uniform members, its
 *        textures and samplers, and its storage buffers.
 * @returns {object|null} prog, or null where there is none.
 * @example
 * <caption>One program bound twice: a magenta cube on the left, a yellow one on the right.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, bind, buffer, draw, program, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 *
 * // twgl's cube(80) — the twin's `radius` is the circumradius, so a cube of side 80
 * const solid = buffer(ctx, tree.platonic(tree.HEXAHEDRON, { radius: 80 * Math.sqrt(3) / 2 }))
 * const WGSL = `
 * ```wgsl
 * struct U {
 *   uModelViewProjectionMatrix: mat4x4f,
 *   uNormalMatrix: mat3x3f,
 *   uSpread: f32,
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
 * setCamera(ctx, tree.createCamera({ eye: [76, 102, 204] }))
 *
 * ctx.backend.bindTarget(ctx, scene)
 * ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 * bind(ctx, prog, { uColor: [1, 0.31, 0.85] })
 * draw(ctx, solid, tree.mat4FromTRS(tree.mat4(), -80, 0, 0, 0, 0, 0, 1, 1, 1, 1))
 * bind(ctx, prog, { uColor: [1, 0.82, 0.4] })
 * draw(ctx, solid, tree.mat4FromTRS(tree.mat4(), 80, 0, 0, 0, 0, 0, 1, 1, 1, 1))
 * ctx.backend.bindTarget(ctx, SCREEN)
 * image(ctx, scene.color)
 * endFrame(ctx)
 *
 *
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
 * <caption>A model file: host.loadMesh reads models/torus.obj into a mesh, and the yellow torus tumbles about X, lit by the file’s normals.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, bind, buffer, draw, host, program, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 *
 * // a mesh is { position, normal, texcoord, indices } with its bounds; buffer names aPosition, aNormal, aTexCoord
 * const mesh = await host.loadMesh('models/torus.obj')
 * const torus = buffer(ctx, mesh)
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
 * const prog = program(ctx, WGSL, { buffers: torus.bufferLayouts })
 * const cam = tree.createCamera({ eye: [0, 160, 192] })
 * const M = tree.mat4()
 * const q = tree.quat()
 *
 * function frame(ms) {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   tree.qFromAxisAngle(q, 1, 0, 0, ms / 1400)
 *   tree.mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   bind(ctx, prog, { uColor: [1, 0.82, 0.4] })
 *   draw(ctx, torus, M)
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 *
 *
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
 * <caption>Vertices edited each frame, re-sent in place: the same shape, a count that may change.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, bind, buffer, draw, program, tree, updateBuffer } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 *
 * // a 12 × 12 grid of vertices, indexed into quads
 * const N = 12
 * const position = new Float32Array(N * N * 3)
 * const indices = new Uint16Array((N - 1) * (N - 1) * 6)
 * let k = 0
 * for (let i = 0; i < N; i++) {
 *   for (let j = 0; j < N; j++) {
 *     const v = i * N + j
 *     position.set([(j / (N - 1) - 0.5) * 180, 0, (i / (N - 1) - 0.5) * 180], v * 3)
 *     if (i < N - 1 && j < N - 1) {
 *       indices.set([v, v + 1, v + N, v + 1, v + N + 1, v + N], k)
 *       k += 6
 *     }
 *   }
 * }
 * const mesh = buffer(ctx, { position: { numComponents: 3, data: position }, indices: { numComponents: 3, data: indices } })
 * const WGSL = `
 * ```wgsl
 * struct U {
 *   uModelViewProjectionMatrix: mat4x4f,
 *   uColor: vec4f,
 * };
 * @group(0) @binding(0) var<uniform> u: U;
 *
 * @vertex
 * fn vs(@location(0) aPosition: vec3f) -> @builtin(position) vec4f {
 *   return u.uModelViewProjectionMatrix * vec4f(aPosition, 1.0);
 * }
 *
 * @fragment
 * fn fs() -> @location(0) vec4f {
 *   return u.uColor;
 * }
 * ```
 * `
 * const prog = program(ctx, WGSL, { buffers: mesh.bufferLayouts })
 * setCamera(ctx, tree.createCamera({ eye: [0, 220, 260] }))
 * const wave = new Float32Array(position)
 *
 * function frame(ms) {
 *   for (let i = 0; i < N * N; i++) {
 *     const x = wave[i * 3], z = wave[i * 3 + 2]
 *     position[i * 3 + 1] = 18 * Math.sin(x / 24 + ms / 700) * Math.cos(z / 24)
 *   }
 *   updateBuffer(ctx, mesh, { position: { numComponents: 3, data: position }, indices: { numComponents: 3, data: indices } })
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   bind(ctx, prog, { uColor: [1, 0.82, 0.4, 1] })
 *   draw(ctx, mesh)
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 *
 *
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
 * <caption>A magenta cube turning about the vertical axis through its model matrix.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, bind, buffer, draw, program, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 *
 * const solid = buffer(ctx, tree.platonic(tree.HEXAHEDRON, { radius: 120 * Math.sqrt(3) / 2 }))   // a side of 120
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
 * const cam = tree.createCamera({ eye: [76, 102, 204] })
 * const M = tree.mat4()
 * const q = tree.quat()
 *
 * function frame(ms) {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   tree.qFromAxisAngle(q, 0, 1, 0, ms / 1000)
 *   tree.mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   bind(ctx, prog, { uColor: [1, 0.31, 0.85] })
 *   draw(ctx, solid, M)
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 *
 *
 */
export function draw(ctx, obj, M, opts) {
  if (M != null && !_isMat4(M)) { opts = M; M = null; }   // draw(ctx, obj, opts)
  if (!ctx || !ctx.backend) return null;
  if (!ctx.prog) {
    console.error('[webgpu.tree] draw: no program bound — call bind(ctx, prog) first.');
    return null;
  }
  if (ctx.prog.kind === 'compute') {
    console.error('[webgpu.tree] draw: the bound program is a compute program — bind a render program to draw.');
    return null;
  }
  return drawOf(ctx, obj, M || null, opts);        // the layer installs the declared transforms
}

/**
 * Draw n instances of the geometry; the vertex stage reads
 * `@builtin(instance_index)`. The repeated-geometry path: one geometry, one
 * install, one draw call — a field of one mesh beside the objects a scene draws
 * one at a time.
 * @param {object} ctx  The context record.
 * @param {object} obj  A geometry from `buffer(ctx, arrays)`.
 * @param {number} n  Instance count.
 * @param {ArrayLike<number>|object} [M]  A model mat4, or an `opts` object.
 * @param {{ count?:number, offset?:number }} [opts]
 * @example
 * <caption>A field of ten yellow cubes from one call, spaced by @builtin(instance_index), and a magenta cube drawn beside it under the same camera — the camera is installed once for both.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, bind, buffer, draw, drawInstanced, program, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 *
 * const solid = buffer(ctx, tree.platonic(tree.HEXAHEDRON, { radius: 50 * Math.sqrt(3) / 2 }))    // a side of 50
 * const WGSL = `
 * ```wgsl
 * struct U {
 *   uModelViewProjectionMatrix: mat4x4f,
 *   uNormalMatrix: mat3x3f,
 *   uColor: vec3f,
 *   uSpread: f32,          // 1 for the field, 0 for a single draw
 * };
 * @group(0) @binding(0) var<uniform> u: U;
 *
 * struct VOut {
 *   @builtin(position) position: vec4f,
 *   @location(0) normal: vec3f,
 * };
 *
 * @vertex
 * fn vs(@location(0) aPosition: vec3f, @location(1) aNormal: vec3f,
 *       @builtin(instance_index) i: u32) -> VOut {
 *   var out: VOut;
 *   let col = f32(i % 5u) - 2.0;
 *   let row = f32(i / 5u) - 0.5;
 *   let offset = u.uSpread * vec4f(col * 70.0, row * 70.0, 0.0, 0.0);
 *   out.position = u.uModelViewProjectionMatrix * (vec4f(aPosition, 1.0) + offset);
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
 * const M = tree.mat4()
 *
 * ctx.backend.bindTarget(ctx, scene)
 * ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 * setCamera(ctx, tree.createCamera({ eye: [99, 131, 263] }))
 * bind(ctx, prog, { uColor: [1, 0.82, 0.4], uSpread: 1 })
 * drawInstanced(ctx, solid, 10)                                  // the field: one install, one call
 * bind(ctx, prog, { uColor: [1, 0.31, 0.85], uSpread: 0 })
 * draw(ctx, solid, tree.mat4FromTRS(M, 0, -110, 0, 0, 0, 0, 1, 1, 1, 1))   // one object, the usual path
 * ctx.backend.bindTarget(ctx, SCREEN)
 * image(ctx, scene.color)
 * endFrame(ctx)
 *
 *
 */
export function drawInstanced(ctx, obj, n, M, opts) {
  if (M != null && !_isMat4(M)) { opts = M; M = null; }
  const count = n || 1;
  if (count === 1) return draw(ctx, obj, M || null, opts);
  if (!ctx || !ctx.backend) return null;
  const prog = ctx.prog;
  if (!prog) {
    console.error('[webgpu.tree] draw: no program bound — call bind(ctx, prog) first.');
    return null;
  }
  if (prog.kind === 'compute') {
    console.error('[webgpu.tree] draw: the bound program is a compute program — bind a render program to draw.');
    return null;
  }
  if (!obj) {
    console.error('[webgpu.tree] draw: `obj` must be a geometry from buffer(ctx, arrays).');
    return null;
  }
  uploadTransforms(ctx, prog, M || null);
  return ctx.backend.drawInstanced(ctx, prog, obj, count, opts);
}

