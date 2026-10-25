/**
 * @file Quaternions — rotations as `[x, y, z, w]`.
 * @module tree.quaternions
 * @license AGPL-3.0-only
 *
 * A rotation is a unit quaternion in a plain 4-element array, `[x, y, z, w]`.
 * Every function writes into its first argument, `out`, and returns it:
 * storage is made once at setup with `tree.quat()` and reused every frame.
 * `tree.mat4FromTRS` turns a quaternion into a model matrix.
 */

'use strict';

/**
 * A new identity quaternion, `[0, 0, 0, 1]`: storage for the functions below, made at setup.
 * @function quat
 * @memberof tree
 * @returns {number[]}
 * @example
 * <caption>One quaternion made at setup, rewritten every frame: the axes spin about y without allocating.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const q = tree.quat(), M = tree.mat4()
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, 0, 1, 0, ms / 1000)
 *   tree.mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
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
 * Set a quaternion's four components.
 * @function qSet
 * @memberof tree
 * @param {number[]} out
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} w
 * @returns {number[]} out
 * @example
 * <caption>qSet writes (0, sin θ/2, 0, cos θ/2) every frame: the axes drawn with it spin about y.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const q = tree.quat(), M = tree.mat4()
 *
 * function frame(ms) {
 *   const half = ms / 2000
 *   tree.qSet(q, 0, Math.sin(half), 0, Math.cos(half))
 *   tree.mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
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
 * Copy a quaternion.
 * @function qCopy
 * @memberof tree
 * @param {number[]} out
 * @param {number[]} a
 * @returns {number[]} out
 * @example
 * <caption>The left frame spins; the right one is drawn with a copy of its rotation taken once a second, so it jumps to catch up.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 150, 320] })
 * const A = tree.mat4(), B = tree.mat4(), q = tree.quat(), copy = tree.quat()
 * let last = -1
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, 0, 1, 0, ms / 1000)
 *   if (Math.floor(ms / 1000) !== last) { last = Math.floor(ms / 1000); tree.qCopy(copy, q) }
 *   tree.mat4FromTRS(A, -80, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   tree.mat4FromTRS(B, 80, 0, 0, copy[0], copy[1], copy[2], copy[3], 1, 1, 1)
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
 * The dot product of two quaternions.
 * @function qDot
 * @memberof tree
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 * @example
 * <caption>A spin's dot with the identity is cos(θ / 2), and its sign tells the hemisphere: the axes turn yellow while it is negative — from half a turn to one and a half turns — though every orientation repeats, from the other side.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const q = tree.quat(), identity = tree.quat(), M = tree.mat4()
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, 0, 1, 0, (ms / 2000) % (4 * Math.PI))
 *   tree.mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   axes(ctx, tree.qDot(q, identity) >= 0 ? { M, size: 80 } : { M, size: 80, semantic: false, color: [1, 0.82, 0.4, 1] })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * `out = a · b`: b rotates first, then a.
 * @function qMul
 * @memberof tree
 * @param {number[]} out  Destination; may alias a or b.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]} out
 * @example
 * <caption>a · b, with a a fixed 45° tilt about x and b a spin about y: the frame's green axis stays on the yellow tilted line while the frame spins around it.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, hermite, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [250, 100, 250] })
 * const tilt = tree.qFromAxisAngle(tree.quat(), 1, 0, 0, Math.PI / 4)
 * const spin = tree.quat(), q = tree.quat(), M = tree.mat4()
 * const axis = tree.qRotateVec3(tree.vec3(), tilt, [0, 120, 0])
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(spin, 0, 1, 0, ms / 1000)
 *   tree.qMul(q, tilt, spin)
 *   tree.mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   hermite(ctx, [0, 0, 0], axis, axis, axis, { color: [1, 0.82, 0.4, 1] })
 *   axes(ctx, { M, size: 80 })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The conjugate — the inverse rotation of a unit quaternion.
 * @function qConjugate
 * @memberof tree
 * @param {number[]} out
 * @param {number[]} a
 * @returns {number[]} out
 * @example
 * <caption>The left frame turns by q, the right by its conjugate: the same speed, the opposite way.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 150, 320] })
 * const A = tree.mat4(), B = tree.mat4(), q = tree.quat(), c = tree.quat()
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, 0, 1, 0, ms / 1000)
 *   tree.qConjugate(c, q)
 *   tree.mat4FromTRS(A, -80, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   tree.mat4FromTRS(B, 80, 0, 0, c[0], c[1], c[2], c[3], 1, 1, 1)
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
 * Normalize a quaternion in place.
 * @function qNormalize
 * @memberof tree
 * @param {number[]} out
 * @returns {number[]} out
 * @example
 * <caption>(0, 2, 0, 2) normalized is a quarter turn about y: against the white axes, the frame drawn with it has its red x along −z.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const q = tree.qNormalize(tree.qSet(tree.quat(), 0, 2, 0, 2))
 * const M = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *
 * ctx.backend.bindTarget(ctx, scene)
 * ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 * setCamera(ctx, cam)
 * axes(ctx, { size: 100, semantic: false, color: [1, 1, 1, 1] })
 * axes(ctx, { M, size: 80 })
 * ctx.backend.bindTarget(ctx, SCREEN)
 * image(ctx, scene.color)
 * endFrame(ctx)
 */

/**
 * The negated quaternion: the same rotation from the other hemisphere.
 * @function qNegate
 * @memberof tree
 * @param {number[]} out
 * @param {number[]} a
 * @returns {number[]} out
 * @example
 * <caption>−q is the same rotation as q: the left frame turns by q, the right by its negation, in step.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 150, 320] })
 * const A = tree.mat4(), B = tree.mat4(), q = tree.quat(), n = tree.quat()
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, Math.SQRT1_2, Math.SQRT1_2, 0, ms / 1000)
 *   tree.qNegate(n, q)
 *   tree.mat4FromTRS(A, -80, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   tree.mat4FromTRS(B, 80, 0, 0, n[0], n[1], n[2], n[3], 1, 1, 1)
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
 * Rotate a vector.
 * @function qRotateVec3
 * @memberof tree
 * @param {number[]} out  3-element destination; may alias v.
 * @param {number[]} q  A unit quaternion.
 * @param {number[]} v  The vector.
 * @returns {number[]} out
 * @example
 * <caption>(100, 0, 0) rotated by a quaternion turning about the white (1, 1, 0) axis: the yellow line drawn to the result sweeps a cone around it.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, hermite, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [-150, 150, 300] })
 * const q = tree.quat(), v = tree.vec3()
 * const axis = [100, 100, 0]
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, Math.SQRT1_2, Math.SQRT1_2, 0, ms / 1000)
 *   tree.qRotateVec3(v, q, [100, 0, 0])
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   axes(ctx, { size: 60 })
 *   hermite(ctx, [0, 0, 0], axis, axis, axis, { color: [1, 1, 1, 1] })
 *   hermite(ctx, [0, 0, 0], v, v, v, { color: [1, 0.82, 0.4, 1] })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Spherical interpolation: constant angular speed from a to b.
 * @function qSlerp
 * @memberof tree
 * @param {number[]} out
 * @param {number[]} a
 * @param {number[]} b
 * @param {number} t  0 at a, 1 at b.
 * @returns {number[]} out
 * @example
 * <caption>The middle frame slerps from the left frame's orientation to the right one's and back, turning at a steady speed.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 150, 360] })
 * const a = tree.quat()
 * const b = tree.qFromAxisAngle(tree.quat(), 0, 0, 1, Math.PI * 0.9)
 * const A = tree.mat4FromTRS(tree.mat4(), -120, 0, 0, a[0], a[1], a[2], a[3], 1, 1, 1)
 * const B = tree.mat4FromTRS(tree.mat4(), 120, 0, 0, b[0], b[1], b[2], b[3], 1, 1, 1)
 * const M = tree.mat4(), q = tree.quat()
 *
 * function frame(ms) {
 *   tree.qSlerp(q, a, b, 0.5 - 0.5 * Math.cos(ms / 1000))
 *   tree.mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   axes(ctx, { M: A, size: 45 })
 *   axes(ctx, { M: B, size: 45 })
 *   axes(ctx, { M, size: 45 })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Normalized linear interpolation: cheaper than `tree.qSlerp`, the same path, uneven speed.
 * @function qNlerp
 * @memberof tree
 * @param {number[]} out
 * @param {number[]} a
 * @param {number[]} b
 * @param {number} t  0 at a, 1 at b.
 * @returns {number[]} out
 * @example
 * <caption>Between the same two orientations, 170° apart: the yellow nlerp frame lags the white slerp frame in the first half, leads it in the second, and meets it at both ends and halfway.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 200, 250] })
 * const a = tree.quat()
 * const b = tree.qFromAxisAngle(tree.quat(), 0, 1, 0, 170 * Math.PI / 180)
 * const S = tree.mat4(), N = tree.mat4(), s = tree.quat(), n = tree.quat()
 *
 * function frame(ms) {
 *   const t = (ms / 4000) % 1
 *   tree.qSlerp(s, a, b, t)
 *   tree.qNlerp(n, a, b, t)
 *   tree.mat4FromTRS(S, 0, 0, 0, s[0], s[1], s[2], s[3], 1, 1, 1)
 *   tree.mat4FromTRS(N, 0, 0, 0, n[0], n[1], n[2], n[3], 1, 1, 1)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   axes(ctx, { M: S, size: 100, semantic: false, color: [1, 1, 1, 1] })
 *   axes(ctx, { M: N, size: 100, semantic: false, color: [1, 0.82, 0.4, 1] })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * A rotation of an angle about an axis.
 * @function qFromAxisAngle
 * @memberof tree
 * @param {number[]} out
 * @param {number} ax  Unit axis x.
 * @param {number} ay  Unit axis y.
 * @param {number} az  Unit axis z.
 * @param {number} angle  Radians, right-handed.
 * @returns {number[]} out
 * @example
 * <caption>A quarter turn per second about the white (1, 1, 1) axis: the frame spins around the line.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, hermite, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [-150, 150, 300] })
 * const M = tree.mat4(), q = tree.quat()
 * const k = 1 / Math.sqrt(3), axis = [100 * k, 100 * k, 100 * k]
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, k, k, k, (ms / 1000) * Math.PI / 2)
 *   tree.mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   hermite(ctx, [0, 0, 0], axis, axis, axis, { color: [1, 1, 1, 1] })
 *   axes(ctx, { M, size: 70 })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The rotation that points −z along a direction, with y toward an up hint.
 * @function qFromLookDir
 * @memberof tree
 * @param {number[]} out
 * @param {number[]} dir  The look direction.
 * @param {number[]} [up=[0, 1, 0]]  The up hint.
 * @returns {number[]} out
 * @example
 * <caption>Built from the direction to the circling yellow point: the frame's −z aims at it, so its blue axis points directly away.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, hermite, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [180, 200, 300] })
 * const M = tree.mat4(), T = tree.mat4(), q = tree.quat(), target = tree.vec3()
 *
 * function frame(ms) {
 *   const t = ms / 1000
 *   target[0] = 110 * Math.cos(t); target[1] = 40; target[2] = 110 * Math.sin(t)
 *   tree.qFromLookDir(q, target)
 *   tree.mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   tree.mat4FromTranslation(T, target[0], target[1], target[2])
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   hermite(ctx, [0, 0, 0], target, target, target, { color: [1, 0.82, 0.4, 1] })
 *   axes(ctx, { M: T, size: 12, semantic: false, color: [1, 0.82, 0.4, 1] })
 *   axes(ctx, { M, size: 60 })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The shortest rotation taking one unit vector onto another.
 * @function qFromUnitVectors
 * @memberof tree
 * @param {number[]} out
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]} out
 * @example
 * <caption>The shortest rotation from +y onto the circling yellow direction: the frame's green axis follows the yellow line.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, hermite, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const M = tree.mat4(), q = tree.quat(), d = tree.vec3(), line = tree.vec3()
 *
 * function frame(ms) {
 *   const t = ms / 1000
 *   d[0] = 0.8 * Math.cos(t); d[1] = 0.6; d[2] = 0.8 * Math.sin(t)
 *   tree.qFromUnitVectors(q, [0, 1, 0], d)
 *   tree.mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   line[0] = 120 * d[0]; line[1] = 120 * d[1]; line[2] = 120 * d[2]
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   hermite(ctx, [0, 0, 0], line, line, line, { color: [1, 0.82, 0.4, 1] })
 *   axes(ctx, { M, size: 70 })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The rotation of a matrix's 3×3 block.
 * @function qFromMat4
 * @memberof tree
 * @param {number[]} out
 * @param {ArrayLike<number>} m
 * @returns {number[]} out
 * @example
 * <caption>The rotation of an eye matrix at (100, 60, 80), re-applied at the origin: the small frame there matches the eye's frame, blue pointing away from the origin.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [-200, 150, 250] })
 * const E = tree.mat4Eye(tree.mat4(), 100, 60, 80, 0, 0, 0, 0, 1, 0)
 * const q = tree.qFromMat4(tree.quat(), E)
 * const M = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *
 * ctx.backend.bindTarget(ctx, scene)
 * ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 * setCamera(ctx, cam)
 * axes(ctx, { M: E, size: 40 })
 * axes(ctx, { M, size: 40 })
 * ctx.backend.bindTarget(ctx, SCREEN)
 * image(ctx, scene.color)
 * endFrame(ctx)
 */

/**
 * A rotation matrix from a quaternion; the translation is zero.
 * @function qToMat4
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {number[]} q
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>qToMat4 writes a whole rotation matrix: the axes drawn with it tumble about the origin.</caption>
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
 *   tree.qFromAxisAngle(q, Math.SQRT1_2, 0, Math.SQRT1_2, ms / 1000)
 *   tree.qToMat4(M, q)
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
 * A unit quaternion as an axis and an angle.
 * @function qToAxisAngle
 * @memberof tree
 * @param {number[]} q
 * @param {object} [out]  Destination `{ axis, angle }`.
 * @returns {{ axis: number[], angle: number }} out
 * @example
 * <caption>The axis and angle read out of the tumbling left frame's quaternion rebuild the right frame and draw its axis in yellow: the right frame tumbles in step, turning about that line.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, hermite, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 150, 320] })
 * const A = tree.mat4(), B = tree.mat4(), q = tree.quat(), r = tree.quat()
 * const aa = { axis: tree.vec3(), angle: 0 }, a0 = tree.vec3(), a1 = tree.vec3(), d = tree.vec3()
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, 0.36, 0.48, 0.8, ms / 1000)
 *   tree.qToAxisAngle(q, aa)
 *   tree.qFromAxisAngle(r, aa.axis[0], aa.axis[1], aa.axis[2], aa.angle)
 *   tree.mat4FromTRS(A, -80, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   tree.mat4FromTRS(B, 80, 0, 0, r[0], r[1], r[2], r[3], 1, 1, 1)
 *   for (let i = 0; i < 3; i++) { d[i] = 120 * aa.axis[i]; a0[i] = (i === 0 ? 80 : 0) - 60 * aa.axis[i]; a1[i] = a0[i] + d[i] }
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   axes(ctx, { M: A, size: 50 })
 *   axes(ctx, { M: B, size: 50 })
 *   hermite(ctx, a0, d, a1, d, { color: [1, 0.82, 0.4, 1] })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */
