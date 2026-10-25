/**
 * @file Matrices — build, combine, decompose and apply 4×4 transforms.
 * @module tree.matrices
 * @license AGPL-3.0-only
 *
 * Column-major 4×4 matrices as flat 16-element arrays, the layout WebGPU
 * uploads. Every function writes into its first argument, `out`, and returns
 * it: storage is made once at setup with `tree.mat4()` (or `tree.mat3()`,
 * `tree.vec3()`, `tree.vec2()`) and reused every frame, so drawing allocates nothing.
 */

'use strict';

/**
 * A new identity mat4, a `Float32Array(16)`: storage for the functions below, made at setup.
 * @function mat4
 * @memberof tree
 * @returns {Float32Array}
 * @example
 * <caption>One matrix made at setup and rewritten every frame: the axes drawn with it turn without allocating.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const M = tree.mat4(), q = tree.quat()
 *
 * function frame(ms) {
 *   tree.mat4FromTRS(M, 0, 0, 0, ...tree.qFromAxisAngle(q, 0, 1, 0, ms / 1000), 1, 1, 1)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   axes(ctx, { M, size: 80 })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * A new identity mat3, a `Float32Array(9)`: storage for the 3×3 functions, made at setup.
 * @function mat3
 * @memberof tree
 * @returns {Float32Array}
 * @example
 * <caption>A mat3 made at setup holds the normal matrix of a pane stretching along x: the yellow normal drawn from it stays square to the magenta pane.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, pane, hermite, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [60, 260, 260] })
 * const R = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 0, 1, 0, Math.PI / 4), 1, 1, 1)
 * const S = tree.mat4(), M = tree.mat4(), N = tree.mat3(), n = tree.vec3()
 *
 * function frame(ms) {
 *   tree.mat4Mul(M, tree.mat4FromScale(S, 1.25 + 0.75 * Math.sin(ms / 1000), 1, 1), R)
 *   tree.mat3NormalFromMat4(N, M)
 *   const k = 100 / Math.hypot(N[6], N[7], N[8])
 *   n[0] = N[6] * k; n[1] = N[7] * k; n[2] = N[8] * k
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   pane(ctx, [-40, 40, 0], [40, 40, 0], [40, -40, 0], [-40, -40, 0], { M, color: [1, 0.31, 0.85, 1] })
 *   hermite(ctx, [0, 0, 0], n, n, n, { color: [1, 0.82, 0.4, 1] })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * A new zero vec3, `[0, 0, 0]`: storage for the functions writing points and directions, made at setup.
 * @function vec3
 * @memberof tree
 * @returns {number[]}
 * @example
 * <caption>A vec3 made at setup receives the tip of the turning x axis every frame; the small axes placed there ride on it.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const M = tree.mat4(), T = tree.mat4(), q = tree.quat(), tip = tree.vec3()
 *
 * function frame(ms) {
 *   tree.mat4FromTRS(M, 0, 0, 0, ...tree.qFromAxisAngle(q, 0, 1, 0, ms / 1000), 1, 1, 1)
 *   tree.mat4MulPoint(tip, M, 80, 0, 0)
 *   tree.mat4FromTranslation(T, tip[0], tip[1], tip[2])
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   axes(ctx, { M, size: 80 })
 *   axes(ctx, { M: T, size: 20 })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * A new zero vec2, `[0, 0]`: storage for the functions writing pixel pairs, made at setup — a pointer uniform's value.
 * @function vec2
 * @memberof tree
 * @returns {number[]}
 * @example
 * <caption>A vec2 made at setup holds the pointer's gl_FragCoord, refreshed on every move; the pass reads it as uMouse and paints an amber disc there.</caption>
 * import { init, endFrame, program, filter, fragCoord, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 *
 * const spot = program(ctx, `
 * ```wgsl
 * struct U {
 *   uMouse: vec2f,
 * };
 * @group(0) @binding(0) var<uniform> u: U;
 *
 * // @builtin(position) is the twin's gl_FragCoord: window pixels, y down
 * @fragment
 * fn fs(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
 *   let d = distance(fragCoord.xy, u.uMouse);
 *   return vec4f(mix(vec3f(1.0, 0.82, 0.4), vec3f(0.075, 0.553, 0.459), smoothstep(38.0, 42.0, d)), 1.0);
 * }
 * ```
 * `)
 * const uniforms = { uMouse: tree.vec2() }
 * fragCoord(ctx, uniforms.uMouse, 200, 150)
 * canvas.addEventListener('pointermove', (e) => fragCoord(ctx, uniforms.uMouse, e.offsetX, e.offsetY))
 *
 * function frame() {
 *   filter(ctx, spot, uniforms)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * `out = A · B`: B applies first, then A.
 * @function mat4Mul
 * @memberof tree
 * @param {Float32Array|number[]} out  Destination; may alias A or B.
 * @param {ArrayLike<number>} A
 * @param {ArrayLike<number>} B
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>T · R (colored) spins in place 80 units along x; R · T (yellow) is carried around the origin.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const T = tree.mat4FromTranslation(tree.mat4(), 80, 0, 0)
 * const R = tree.mat4(), TR = tree.mat4(), RT = tree.mat4(), q = tree.quat()
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, 0, 1, 0, ms / 1000)
 *   tree.mat4FromTRS(R, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   tree.mat4Mul(TR, T, R)
 *   tree.mat4Mul(RT, R, T)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   axes(ctx, { M: TR, size: 40 })
 *   axes(ctx, { M: RT, size: 40, semantic: false, color: [1, 0.82, 0.4, 1] })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The inverse of a matrix.
 * @function mat4Invert
 * @memberof tree
 * @param {Float32Array|number[]} out  Destination; may alias src.
 * @param {ArrayLike<number>} src
 * @returns {Float32Array|number[]|null} out, or null when src is singular.
 * @example
 * <caption>Inverting a camera's view matrix gives its frame: drawn with it, the axes sit at the white frustum's apex, blue pointing back, away from what it sees.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, viewFrustum, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [-260, 160, 60], center: [30, 20, 40] })
 * const other = tree.createCamera({ eye: [60, 40, 80], fov: Math.PI / 4, near: 20, far: 90 })
 * const V = tree.cameraView(tree.mat4(), other)
 * const E = tree.mat4Invert(tree.mat4(), V)
 *
 * ctx.backend.bindTarget(ctx, scene)
 * ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 * setCamera(ctx, cam)
 * viewFrustum(ctx, { camera: other, aspect: 4 / 3, color: [1, 1, 1, 1] })
 * axes(ctx, { M: E, size: 40 })
 * ctx.backend.bindTarget(ctx, SCREEN)
 * image(ctx, scene.color)
 * endFrame(ctx)
 */

/**
 * A model matrix from a translation, a rotation quaternion and a scale.
 * @function mat4FromTRS
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {number} tx  Translation x.
 * @param {number} ty  Translation y.
 * @param {number} tz  Translation z.
 * @param {number} qx  Rotation quaternion x.
 * @param {number} qy  Rotation quaternion y.
 * @param {number} qz  Rotation quaternion z.
 * @param {number} qw  Rotation quaternion w.
 * @param {number} sx  Scale x.
 * @param {number} sy  Scale y.
 * @param {number} sz  Scale z.
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>Raised 60 above the ground grid, spinning about y, its x axis stretched to twice the others.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, grid, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const M = tree.mat4(), q = tree.quat()
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, 0, 1, 0, ms / 1000)
 *   tree.mat4FromTRS(M, 0, 60, 0, q[0], q[1], q[2], q[3], 2, 1, 1)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   grid(ctx, { M: ground, size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
 *   axes(ctx, { M, size: 50 })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * A translation matrix.
 * @function mat4FromTranslation
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {number} tx
 * @param {number} ty
 * @param {number} tz
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>The small axes moved 80 along x and 40 along y from the white ones at the origin.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const M = tree.mat4FromTranslation(tree.mat4(), 80, 40, 0)
 *
 * ctx.backend.bindTarget(ctx, scene)
 * ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 * setCamera(ctx, cam)
 * axes(ctx, { size: 100, semantic: false, color: [1, 1, 1, 1] })
 * axes(ctx, { M, size: 40 })
 * ctx.backend.bindTarget(ctx, SCREEN)
 * image(ctx, scene.color)
 * endFrame(ctx)
 */

/**
 * A scale matrix.
 * @function mat4FromScale
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {number} sx
 * @param {number} sy
 * @param {number} sz
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>Scaled by (2, 1, 0.5): against the white unscaled axes, x doubles, y matches and z halves.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const M = tree.mat4FromScale(tree.mat4(), 2, 1, 0.5)
 *
 * ctx.backend.bindTarget(ctx, scene)
 * ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 * setCamera(ctx, cam)
 * axes(ctx, { size: 60, semantic: false, color: [1, 1, 1, 1] })
 * axes(ctx, { M, size: 60, depth: false })
 * ctx.backend.bindTarget(ctx, SCREEN)
 * image(ctx, scene.color)
 * endFrame(ctx)
 */

/**
 * A rigid frame from three orthonormal axes and an origin.
 * @function mat4FromBasis
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {number} rx  Right axis x.
 * @param {number} ry  Right axis y.
 * @param {number} rz  Right axis z.
 * @param {number} ux  Up axis x.
 * @param {number} uy  Up axis y.
 * @param {number} uz  Up axis z.
 * @param {number} fx  Forward axis x.
 * @param {number} fy  Forward axis y.
 * @param {number} fz  Forward axis z.
 * @param {number} tx  Origin x.
 * @param {number} ty  Origin y.
 * @param {number} tz  Origin z.
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>A frame from three axes, 80 along x from the white origin axes: its red axis points up, its green axis points to −x.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const M = tree.mat4FromBasis(tree.mat4(), 0, 1, 0, -1, 0, 0, 0, 0, 1, 80, 0, 0)
 *
 * ctx.backend.bindTarget(ctx, scene)
 * ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 * setCamera(ctx, cam)
 * axes(ctx, { size: 60, semantic: false, color: [1, 1, 1, 1] })
 * axes(ctx, { M, size: 50 })
 * ctx.backend.bindTarget(ctx, SCREEN)
 * image(ctx, scene.color)
 * endFrame(ctx)
 */

/**
 * The view matrix (world → eye) of an eye looking at a center.
 * @function mat4View
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {number} ex  Eye x.
 * @param {number} ey  Eye y.
 * @param {number} ez  Eye z.
 * @param {number} cx  Center x.
 * @param {number} cy  Center y.
 * @param {number} cz  Center z.
 * @param {number} ux  Up x.
 * @param {number} uy  Up y.
 * @param {number} uz  Up z.
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>A view matrix rebuilt every frame for an eye circling at radius 300, 150 up, always looking at the origin.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, grid, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const lens = tree.createCamera({ fov: Math.PI / 3, near: 50, far: 1000 })
 * const P = tree.cameraProj(tree.mat4(), lens, 400 / 300)
 * const V = tree.mat4()
 *
 * function frame(ms) {
 *   const t = ms / 1000
 *   tree.mat4View(V, 300 * Math.sin(t), 150, 300 * Math.cos(t), 0, 0, 0, 0, 1, 0)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, V, P)
 *   grid(ctx, { M: ground, size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
 *   axes(ctx, { size: 60 })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The eye matrix (eye → world), the inverse of `tree.mat4View` for the same lookat.
 * @function mat4Eye
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {number} ex  Eye x.
 * @param {number} ey  Eye y.
 * @param {number} ez  Eye z.
 * @param {number} cx  Center x.
 * @param {number} cy  Center y.
 * @param {number} cz  Center z.
 * @param {number} ux  Up x.
 * @param {number} uy  Up y.
 * @param {number} uz  Up z.
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>The frame of an eye at (100, 60, 80) looking at the origin: its blue axis points away from the origin, back along the yellow line of sight.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, hermite, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [-200, 150, 250] })
 * const E = tree.mat4Eye(tree.mat4(), 100, 60, 80, 0, 0, 0, 0, 1, 0)
 * const sight = [-100, -60, -80]
 *
 * ctx.backend.bindTarget(ctx, scene)
 * ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 * setCamera(ctx, cam)
 * axes(ctx, { size: 40, semantic: false, color: [1, 1, 1, 1] })
 * hermite(ctx, [100, 60, 80], sight, [0, 0, 0], sight, { color: [1, 0.82, 0.4, 1] })
 * axes(ctx, { M: E, size: 40 })
 * ctx.backend.bindTarget(ctx, SCREEN)
 * image(ctx, scene.color)
 * endFrame(ctx)
 */

/**
 * A perspective projection from the near plane's extents — symmetric or off-center.
 * @function mat4Persp
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {number} left  Near-plane left extent.
 * @param {number} right  Near-plane right extent.
 * @param {number} bottom  Near-plane bottom extent.
 * @param {number} top  Near-plane top extent.
 * @param {number} near  Near distance, positive.
 * @param {number} far  Far distance.
 * @param {number} [ndcYSign=1]  −1 flips y.
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>An off-center frustum, its near plane reaching further right than left: the axes at the origin sit left of the white bulls-eye marking the canvas center.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, beginHUD, endHUD, bullsEye, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const V = tree.mat4View(tree.mat4(), 0, 0, 300, 0, 0, 0, 0, 1, 0)
 * const P = tree.mat4Persp(tree.mat4(), -30, 50, -30, 30, 100, 1000)
 *
 * ctx.backend.bindTarget(ctx, scene)
 * ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 * setCamera(ctx, V, P)
 * axes(ctx, { size: 60 })
 * beginHUD(ctx)
 * bullsEye(ctx, { x: 200, y: 150, size: 30, color: [1, 1, 1, 1] })
 * endHUD(ctx)
 * ctx.backend.bindTarget(ctx, SCREEN)
 * image(ctx, scene.color)
 * endFrame(ctx)
 */

/**
 * An orthographic projection from the view box's extents.
 * @function mat4Ortho
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {number} left
 * @param {number} right
 * @param {number} bottom
 * @param {number} top
 * @param {number} near
 * @param {number} far
 * @param {number} [ndcYSign=1]  −1 flips y.
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>Orthographic: the ground grid's far edge is as long as its near edge — no vanishing point.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, grid, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const V = tree.mat4View(tree.mat4(), 0, 200, 300, 0, 0, 0, 0, 1, 0)
 * const P = tree.mat4Ortho(tree.mat4(), -200, 200, -150, 150, 1, 1000)
 *
 * ctx.backend.bindTarget(ctx, scene)
 * ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 * setCamera(ctx, V, P)
 * grid(ctx, { M: ground, size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
 * ctx.backend.bindTarget(ctx, SCREEN)
 * image(ctx, scene.color)
 * endFrame(ctx)
 */

/**
 * `out = P · V`: world → clip.
 * @function mat4PV
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {ArrayLike<number>} proj  P.
 * @param {ArrayLike<number>} view  V.
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>P · V takes the tip of the x axis to NDC and the viewport matrix W finishes the trip to pixels: the white cross drawn there stays on the tip as the eye circles.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, beginHUD, endHUD, cross, mat4Viewport, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 150, 300], near: 50, far: 1000 })
 * const V = tree.mat4(), P = tree.cameraProj(tree.mat4(), cam, 400 / 300)
 * const PV = tree.mat4(), W = tree.mat4(), tip = tree.vec3()
 *
 * function frame() {
 *   tree.cameraOrbit(cam, 0.01, 0)
 *   tree.mat4PV(PV, P, tree.cameraView(V, cam))
 *   tree.mat4MulPoint(tip, tree.mat4Mul(PV, mat4Viewport(ctx, W), PV), 100, 0, 0)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, V, P)
 *   axes(ctx, { size: 100 })
 *   beginHUD(ctx)
 *   cross(ctx, { x: tip[0], y: tip[1], size: 24, color: [1, 1, 1, 1] })
 *   endHUD(ctx)
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * `out = V · M`: model → eye.
 * @function mat4MV
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {ArrayLike<number>} model  M.
 * @param {ArrayLike<number>} view  V.
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>An identity view is installed and every model matrix is folded into V · M instead: the circling view of the grid and the spinning axes looks exactly as setCamera(gl, cam) would show it.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, grid, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 150, 300], near: 50, far: 1000 })
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const I = tree.mat4(), P = tree.cameraProj(tree.mat4(), cam, 400 / 300)
 * const V = tree.mat4(), M = tree.mat4(), MV = tree.mat4(), GV = tree.mat4(), q = tree.quat()
 *
 * function frame(ms) {
 *   tree.cameraOrbit(cam, 0.01, 0)
 *   tree.cameraView(V, cam)
 *   tree.qFromAxisAngle(q, 0, 1, 0, ms / 1000)
 *   tree.mat4MV(MV, tree.mat4FromTRS(M, 0, 30, 0, q[0], q[1], q[2], q[3], 1, 1, 1), V)
 *   tree.mat4MV(GV, ground, V)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, I, P)
 *   grid(ctx, { M: GV, size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
 *   axes(ctx, { M: MV, size: 60 })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The normal matrix of a transform: the inverse transpose of its 3×3 block.
 * @function mat3NormalFromMat4
 * @memberof tree
 * @param {Float32Array|number[]} out  9-element destination.
 * @param {ArrayLike<number>} src  Usually V · M.
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>A magenta pane turned 45° about y, then stretched along x between 0.5 and 2 times: the yellow normal, through the normal matrix, stays square to the pane; the white one, through the model matrix itself, leans whenever the stretch is not 1.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, grid, pane, hermite, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [60, 260, 260] })
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const R = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 0, 1, 0, Math.PI / 4), 1, 1, 1)
 * const S = tree.mat4(), M = tree.mat4(), N = tree.mat3()
 * const along = (out, x, y, z) => { const k = 100 / Math.hypot(x, y, z); out[0] = x * k; out[1] = y * k; out[2] = z * k; return out }
 * const good = tree.vec3(), bad = tree.vec3()
 *
 * function frame(ms) {
 *   tree.mat4Mul(M, tree.mat4FromScale(S, 1.25 + 0.75 * Math.sin(ms / 1000), 1, 1), R)
 *   tree.mat3NormalFromMat4(N, M)
 *   along(good, N[6], N[7], N[8])     // N · (0, 0, 1)
 *   along(bad, M[8], M[9], M[10])     // M's own 3×3 · (0, 0, 1)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   grid(ctx, { M: ground, size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
 *   pane(ctx, [-40, 40, 0], [40, 40, 0], [40, -40, 0], [-40, -40, 0], { M, color: [1, 0.31, 0.85, 1] })
 *   hermite(ctx, [0, 0, 0], good, good, good, { color: [1, 0.82, 0.4, 1] })
 *   hermite(ctx, [0, 0, 0], bad, bad, bad, { color: [1, 1, 1, 1] })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Transform a point, divided by w.
 * @function mat4MulPoint
 * @memberof tree
 * @param {number[]} out  3-element destination.
 * @param {ArrayLike<number>} m
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {number[]} out
 * @example
 * <caption>mat4MulPoint carries (80, 0, 0) through the turning frame: the small axes placed at the result ride on the tip of its x axis.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const M = tree.mat4(), T = tree.mat4(), q = tree.quat(), p = tree.vec3()
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, 0, 1, 0, ms / 1000)
 *   tree.mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   tree.mat4MulPoint(p, M, 80, 0, 0)
 *   tree.mat4FromTranslation(T, p[0], p[1], p[2])
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   axes(ctx, { M, size: 80 })
 *   axes(ctx, { M: T, size: 25 })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Transform a direction: the 3×3 block only, no translation, no divide.
 * @function mat4MulDir
 * @memberof tree
 * @param {number[]} out  3-element destination.
 * @param {ArrayLike<number>} m
 * @param {number} dx
 * @param {number} dy
 * @param {number} dz
 * @returns {number[]} out
 * @example
 * <caption>A direction ignores translation: the yellow line drawn along the result turns with the moved frame's x axis but stays rooted at the origin.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, hermite, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const M = tree.mat4(), q = tree.quat(), d = tree.vec3()
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, 0, 1, 0, ms / 1000)
 *   tree.mat4FromTRS(M, 60, 40, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   tree.mat4MulDir(d, M, 80, 0, 0)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   axes(ctx, { M, size: 80 })
 *   hermite(ctx, [0, 0, 0], d, d, d, { color: [1, 0.82, 0.4, 1] })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The matrix taking a point's coordinates in one frame to its coordinates in another: `inv(to) · from`.
 * @function mat4Location
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {ArrayLike<number>} from  The source frame's matrix (frame → world).
 * @param {ArrayLike<number>} to  The destination frame's matrix (frame → world).
 * @returns {Float32Array|number[]|null} out, or null when `to` is singular.
 * @example
 * <caption>The point 50 along the spinning left frame's x, carried into the turned right frame's coordinates and drawn back out through the right frame: the small yellow axes stay on the tip of the left frame's red axis.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 200, 300] })
 * const B = tree.mat4FromTRS(tree.mat4(), 80, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 0, 1, 0, Math.PI / 2), 1, 1, 1)
 * const A = tree.mat4(), L = tree.mat4(), T = tree.mat4(), q = tree.quat()
 * const inB = tree.vec3(), world = tree.vec3()
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, 0, 1, 0, ms / 1000)
 *   tree.mat4FromTRS(A, -80, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   tree.mat4Location(L, A, B)
 *   tree.mat4MulPoint(inB, L, 50, 0, 0)                     // the point, in B's coordinates
 *   tree.mat4MulPoint(world, B, inB[0], inB[1], inB[2])      // drawn through B
 *   tree.mat4FromTranslation(T, world[0], world[1], world[2])
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   axes(ctx, { M: A, size: 50 })
 *   axes(ctx, { M: B, size: 50 })
 *   axes(ctx, { M: T, size: 15, semantic: false, color: [1, 0.82, 0.4, 1] })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The 3×3 matrix taking a direction's coordinates in one frame to its coordinates in another.
 * @function mat3Direction
 * @memberof tree
 * @param {Float32Array|number[]} out  9-element destination.
 * @param {ArrayLike<number>} from  The source frame's matrix (frame → world).
 * @param {ArrayLike<number>} to  The destination frame's matrix (frame → world).
 * @returns {Float32Array|number[]|null} out, or null when `to` is singular.
 * @example
 * <caption>The spinning left frame's x direction, re-expressed in the turned right frame and drawn from there as the yellow line: it stays parallel to the left frame's red axis.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, hermite, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 200, 300] })
 * const B = tree.mat4FromTRS(tree.mat4(), 80, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 0, 1, 0, Math.PI / 2), 1, 1, 1)
 * const A = tree.mat4(), D = tree.mat3(), q = tree.quat(), line = tree.vec3()
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, 0, 1, 0, ms / 1000)
 *   tree.mat4FromTRS(A, -80, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   tree.mat3Direction(D, A, B)
 *   tree.mat4MulDir(line, B, 70 * D[0], 70 * D[1], 70 * D[2])   // D · (1, 0, 0), drawn through B
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   axes(ctx, { M: A, size: 50 })
 *   axes(ctx, { M: B, size: 50 })
 *   hermite(ctx, [80, 0, 0], line, [80 + line[0], line[1], line[2]], line, { color: [1, 0.82, 0.4, 1] })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The translation of a matrix.
 * @function mat4ToTranslation
 * @memberof tree
 * @param {Float32Array|number[]} out3  3-element destination.
 * @param {ArrayLike<number>} m
 * @returns {Float32Array|number[]} out3
 * @example
 * <caption>The translation read out of a circling, spinning, stretched frame places the white axes: they ride along with it, never turning or stretching.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const M = tree.mat4(), T = tree.mat4(), q = tree.quat(), t3 = tree.vec3()
 *
 * function frame(ms) {
 *   const t = ms / 1000
 *   tree.qFromAxisAngle(q, 0, 1, 0, 3 * t)
 *   tree.mat4FromTRS(M, 80 * Math.cos(t), 20, 80 * Math.sin(t), q[0], q[1], q[2], q[3], 1.5, 1, 1)
 *   tree.mat4ToTranslation(t3, M)
 *   tree.mat4FromTranslation(T, t3[0], t3[1], t3[2])
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   axes(ctx, { M, size: 40 })
 *   axes(ctx, { M: T, size: 25, semantic: false, color: [1, 1, 1, 1] })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The scale of a matrix: the lengths of its three axes.
 * @function mat4ToScale
 * @memberof tree
 * @param {Float32Array|number[]} out3  3-element destination.
 * @param {ArrayLike<number>} m
 * @returns {Float32Array|number[]} out3
 * @example
 * <caption>The scale read out of the tumbling left frame's matrix sizes the unrotated white axes on the right: their arms stretch and shrink exactly as the left frame's do.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 150, 320] })
 * const M = tree.mat4(), S = tree.mat4(), q = tree.quat(), s3 = tree.vec3()
 *
 * function frame(ms) {
 *   const t = ms / 1000, s = 1 + 0.5 * Math.sin(2 * t)
 *   tree.qFromAxisAngle(q, Math.SQRT1_2, Math.SQRT1_2, 0, t)
 *   tree.mat4FromTRS(M, -80, 0, 0, q[0], q[1], q[2], q[3], s, 1, 2 - s)
 *   tree.mat4ToScale(s3, M)
 *   tree.mat4FromTRS(S, 80, 0, 0, 0, 0, 0, 1, s3[0], s3[1], s3[2])
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   axes(ctx, { M, size: 50 })
 *   axes(ctx, { M: S, size: 50, semantic: false, color: [1, 1, 1, 1] })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The rotation of a matrix as a unit quaternion.
 * @function mat4ToRotation
 * @memberof tree
 * @param {number[]} out4  4-element destination, `[x, y, z, w]`.
 * @param {ArrayLike<number>} m
 * @returns {number[]} out4
 * @example
 * <caption>The rotation read out of the left frame's matrix drives the right frame: both tumble in step.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 150, 320] })
 * const A = tree.mat4(), B = tree.mat4(), q = tree.quat(), r = tree.quat()
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, Math.SQRT1_2, Math.SQRT1_2, 0, ms / 1000)
 *   tree.mat4FromTRS(A, -80, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   tree.mat4ToRotation(r, A)
 *   tree.mat4FromTRS(B, 80, 0, 0, r[0], r[1], r[2], r[3], 1, 1, 1)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   axes(ctx, { M: A, size: 50 })
 *   axes(ctx, { M: B, size: 50 })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The reflection across the plane `nx·x + ny·y + nz·z = d`: a unit normal and the plane's offset along it.
 * @function mat4Reflect
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {number} nx  Unit plane normal x.
 * @param {number} ny  Unit plane normal y.
 * @param {number} nz  Unit plane normal z.
 * @param {number} d  The plane's offset along the normal.
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>(1, 0, 0) and d = 0 name the plane 1·x + 0·y + 0·z = 0, that is x = 0 — the white grid: reflected across it, the frame spinning on the left spins the opposite way on the right.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, grid, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 150, 320] })
 * const mirror = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 0, 1, 0, Math.PI / 2), 1, 1, 1)
 * const R = tree.mat4Reflect(tree.mat4(), 1, 0, 0, 0)
 * const A = tree.mat4(), RA = tree.mat4(), q = tree.quat()
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, 0, 1, 0, ms / 1000)
 *   tree.mat4FromTRS(A, -80, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   tree.mat4Mul(RA, R, A)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   grid(ctx, { M: mirror, size: 70, subdivisions: 7, color: [1, 1, 1, 1] })
 *   axes(ctx, { M: A, size: 50 })
 *   axes(ctx, { M: RA, size: 50 })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The bias matrix: NDC's [−1, 1] to texture space's [0, 1], so `Bias · P · V · p` is the uv at which a camera's image shows the world point p.
 * @function mat4Bias
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>A camera straight above renders the spinning axes and the grid into a texture; laid back on the ground with each corner's uv = Bias · P · V · corner, the image lands exactly on the real grid lines and under the real axes.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, grid, pane, viewFrustum, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)                                // the world under the camera, with a depth attachment
 * const picture = renderTarget(ctx, { width: 256, height: 256 })  // what the camera above sees
 * const cam = tree.createCamera({ eye: [200, 230, 300] })
 * const above = tree.createCamera({ eye: [0, 200, 0], up: [0, 0, -1], fov: Math.PI / 3, near: 50, far: 400 })
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const BPV = tree.mat4Mul(tree.mat4(), tree.mat4Bias(tree.mat4()),
 *   tree.mat4PV(tree.mat4(), tree.cameraProj(tree.mat4(), above, 1), tree.cameraView(tree.mat4(), above)))
 * const corners = [[-100, 1, -100], [100, 1, -100], [100, 1, 100], [-100, 1, 100]]
 * // the twin's texture space is top-down, so a corner's projected v is read from the top row: 1 − v
 * const uvs = corners.flatMap((c) => {
 *   const uv = tree.mat4MulPoint(tree.vec3(), BPV, c[0], 0, c[2])
 *   return [uv[0], 1 - uv[1]]
 * })
 * const M = tree.mat4(), q = tree.quat()
 *
 * function contents() {
 *   grid(ctx, { M: ground, size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
 *   axes(ctx, { M, size: 80 })
 * }
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, 0, 1, 0, ms / 1000)
 *   tree.mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   ctx.backend.bindTarget(ctx, picture)
 *   ctx.backend.clear(ctx, [0.2, 0.2, 0.3, 1])
 *   setCamera(ctx, above, { aspect: 1 })
 *   contents()
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   pane(ctx, ...corners, { texture: picture.color, uvs })
 *   contents()
 *   viewFrustum(ctx, { camera: above, aspect: 1, color: [1, 0.82, 0.4, 1] })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */
