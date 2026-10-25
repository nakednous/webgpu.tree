/**
 * @file Visibility — test points, spheres and boxes against a view frustum.
 * @module tree.visibility
 * @license AGPL-3.0-only
 *
 * `tree.cameraPlanes` fills storage made once with `tree.planes()` with a
 * camera state's six frustum planes, each the coefficients (a, b, c, d) of
 * a·x + b·y + c·z = d; each test reads them and answers `tree.VISIBLE`,
 * `tree.SEMIVISIBLE` or `tree.INVISIBLE`.
 */

'use strict';

/**
 * New storage for six frustum planes, a `Float64Array(24)`: made at setup, filled by `tree.cameraPlanes`.
 * @function planes
 * @memberof tree
 * @returns {Float64Array}
 * @example
 * <caption>Planes made once and refilled every frame as the white frustum turns: the small axes, fixed at (60, 0, 0), are drawn in their colors while inside it and yellow while outside.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, viewFrustum, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 300, 250] })
 * const lens = tree.createCamera({ eye: [0, 0, 0], center: [0, 0, -1], fov: Math.PI / 4, near: 10, far: 150 })
 * const pl = tree.planes(), M = tree.mat4FromTranslation(tree.mat4(), 60, 0, 0)
 *
 * function frame(ms) {
 *   const a = ms / 1500
 *   lens.center[0] = Math.sin(a); lens.center[2] = -Math.cos(a)
 *   tree.cameraPlanes(pl, lens, 4 / 3)
 *   const inside = tree.pointVisibility(pl, 60, 0, 0) === tree.VISIBLE
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   viewFrustum(ctx, { camera: lens, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   axes(ctx, inside ? { M, size: 20 } : { M, size: 20, semantic: false, color: [1, 0.82, 0.4, 1] })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Index of the left plane in the planes storage.
 * @constant {number} PLANE_LEFT
 * @memberof tree
 */

/**
 * Index of the right plane.
 * @constant {number} PLANE_RIGHT
 * @memberof tree
 */

/**
 * Index of the near plane.
 * @constant {number} PLANE_NEAR
 * @memberof tree
 */

/**
 * Index of the far plane.
 * @constant {number} PLANE_FAR
 * @memberof tree
 */

/**
 * Index of the top plane.
 * @constant {number} PLANE_TOP
 * @memberof tree
 */

/**
 * Index of the bottom plane.
 * @constant {number} PLANE_BOTTOM
 * @memberof tree
 */

/**
 * Wholly outside the frustum.
 * @constant {number} INVISIBLE
 * @memberof tree
 */

/**
 * Wholly inside the frustum.
 * @constant {number} VISIBLE
 * @memberof tree
 */

/**
 * Crossing the frustum's boundary.
 * @constant {number} SEMIVISIBLE
 * @memberof tree
 */

/**
 * Whether a point lies inside the frustum.
 * @function pointVisibility
 * @memberof tree
 * @param {Float64Array} planes  From `tree.cameraPlanes`.
 * @param {number} px
 * @param {number} py
 * @param {number} pz
 * @returns {number} `tree.VISIBLE` or `tree.INVISIBLE`.
 * @example
 * <caption>A point sweeps across the white frustum through its axis, 120 from its eye: the small axes on it are drawn in their colors while it tests visible — while |x| stays under 66.3, the frustum's half width there — and yellow otherwise.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, viewFrustum, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:white;font:13px monospace'
 * const cam = tree.createCamera({ eye: [0, 300, 250] })
 * const lens = tree.createCamera({ eye: [0, 0, 120], center: [0, 0, 0], fov: Math.PI / 4, near: 20, far: 200 })
 * const planes = tree.cameraPlanes(tree.planes(), lens, 4 / 3)
 * const M = tree.mat4()
 *
 * function frame(ms) {
 *   const x = 120 * Math.sin(ms / 1000)
 *   tree.mat4FromTranslation(M, x, 0, 0)
 *   const v = tree.pointVisibility(planes, x, 0, 0)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   viewFrustum(ctx, { camera: lens, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   axes(ctx, v === tree.VISIBLE ? { M, size: 20 } : { M, size: 20, semantic: false, color: [1, 0.82, 0.4, 1] })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   out.textContent = 'x ' + x.toFixed(1)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * How a sphere meets the frustum.
 * @function sphereVisibility
 * @memberof tree
 * @param {Float64Array} planes  From `tree.cameraPlanes`.
 * @param {number} cx  Center x.
 * @param {number} cy  Center y.
 * @param {number} cz  Center z.
 * @param {number} radius
 * @returns {number} `tree.VISIBLE`, `tree.SEMIVISIBLE` or `tree.INVISIBLE`.
 * @example
 * <caption>A sphere of radius 30 sweeps across the frustum: white while wholly inside, yellow while it crosses a side plane, magenta once wholly outside — the readout names the state.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, hermite, viewFrustum, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:white;font:13px monospace'
 * const cam = tree.createCamera({ eye: [0, 300, 250] })
 * const lens = tree.createCamera({ eye: [0, 0, 120], center: [0, 0, 0], fov: Math.PI / 4, near: 20, far: 200 })
 * const planes = tree.cameraPlanes(tree.planes(), lens, 4 / 3)
 * const names = { [tree.VISIBLE]: 'VISIBLE', [tree.SEMIVISIBLE]: 'SEMIVISIBLE', [tree.INVISIBLE]: 'INVISIBLE' }
 * const colors = { [tree.VISIBLE]: [1, 1, 1, 1], [tree.SEMIVISIBLE]: [1, 0.82, 0.4, 1], [tree.INVISIBLE]: [1, 0.31, 0.85, 1] }
 *
 * // a circle of radius r about c in the plane of unit vectors u and v, as four Hermite quarter arcs
 * function ring(c, r, u, v, color) {
 *   const point = (a) => [0, 1, 2].map((i) => c[i] + r * (Math.cos(a) * u[i] + Math.sin(a) * v[i]))
 *   const tangent = (a) => [0, 1, 2].map((i) => r * Math.PI / 2 * (-Math.sin(a) * u[i] + Math.cos(a) * v[i]))
 *   for (let k = 0; k < 4; k++) {
 *     const a0 = k * Math.PI / 2, a1 = a0 + Math.PI / 2
 *     hermite(ctx, point(a0), tangent(a0), point(a1), tangent(a1), { color })
 *   }
 * }
 *
 * function frame(ms) {
 *   const c = [150 * Math.sin(ms / 1500), 0, 0]
 *   const v = tree.sphereVisibility(planes, c[0], c[1], c[2], 30)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   viewFrustum(ctx, { camera: lens, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   ring(c, 30, [1, 0, 0], [0, 1, 0], colors[v])
 *   ring(c, 30, [1, 0, 0], [0, 0, 1], colors[v])
 *   ring(c, 30, [0, 1, 0], [0, 0, 1], colors[v])
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   out.textContent = names[v]
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * How an axis-aligned box meets the frustum.
 * @function boxVisibility
 * @memberof tree
 * @param {Float64Array} planes  From `tree.cameraPlanes`.
 * @param {number} x0  Minimum corner x.
 * @param {number} y0  Minimum corner y.
 * @param {number} z0  Minimum corner z.
 * @param {number} x1  Maximum corner x.
 * @param {number} y1  Maximum corner y.
 * @param {number} z1  Maximum corner z.
 * @returns {number} `tree.VISIBLE`, `tree.SEMIVISIBLE` or `tree.INVISIBLE`.
 * @example
 * <caption>A 50-unit box sweeps across the frustum: white while wholly inside, yellow while it crosses a side plane, magenta once wholly outside — the readout names the state.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, hermite, viewFrustum, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:white;font:13px monospace'
 * const cam = tree.createCamera({ eye: [0, 300, 250] })
 * const lens = tree.createCamera({ eye: [0, 0, 120], center: [0, 0, 0], fov: Math.PI / 4, near: 20, far: 200 })
 * const planes = tree.cameraPlanes(tree.planes(), lens, 4 / 3)
 * const names = { [tree.VISIBLE]: 'VISIBLE', [tree.SEMIVISIBLE]: 'SEMIVISIBLE', [tree.INVISIBLE]: 'INVISIBLE' }
 * const colors = { [tree.VISIBLE]: [1, 1, 1, 1], [tree.SEMIVISIBLE]: [1, 0.82, 0.4, 1], [tree.INVISIBLE]: [1, 0.31, 0.85, 1] }
 *
 * // the 12 edges of the box [x0, x1] × [y0, y1] × [z0, z1], each a straight Hermite segment
 * function box(x0, y0, z0, x1, y1, z1, color) {
 *   const p = (i) => [i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0]
 *   for (let i = 0; i < 8; i++) for (const bit of [1, 2, 4]) {
 *     if (i & bit) continue
 *     const a = p(i), b = p(i | bit), d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
 *     hermite(ctx, a, d, b, d, { color })
 *   }
 * }
 *
 * function frame(ms) {
 *   const x = 150 * Math.sin(ms / 1500)
 *   const v = tree.boxVisibility(planes, x - 25, -25, -25, x + 25, 25, 25)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   viewFrustum(ctx, { camera: lens, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   box(x - 25, -25, -25, x + 25, 25, 25, colors[v])
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   out.textContent = names[v]
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The signed distance from a point to one frustum plane: negative inside, positive outside.
 * @function distanceToPlane
 * @memberof tree
 * @param {Float64Array} planes  From `tree.cameraPlanes`.
 * @param {number} planeIdx  `tree.PLANE_LEFT`, `tree.PLANE_RIGHT`, `tree.PLANE_NEAR`, `tree.PLANE_FAR`, `tree.PLANE_TOP` or `tree.PLANE_BOTTOM`.
 * @param {number} px
 * @param {number} py
 * @param {number} pz
 * @returns {number}
 * @example
 * <caption>A point slides along the white frustum's axis between z = 120 and z = −100: the small axes on it are drawn magenta while its distance to the near plane is positive — past z = 100 — yellow while its distance to the far plane is — past z = −80 — and in their colors in between.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, viewFrustum, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:white;font:13px monospace'
 * const cam = tree.createCamera({ eye: [300, 200, 150], center: [0, 0, 10] })
 * const lens = tree.createCamera({ eye: [0, 0, 120], center: [0, 0, 0], fov: Math.PI / 4, near: 20, far: 200 })
 * const planes = tree.cameraPlanes(tree.planes(), lens, 4 / 3)
 * const M = tree.mat4()
 *
 * function frame(ms) {
 *   const z = 10 + 110 * Math.sin(ms / 1500)
 *   tree.mat4FromTranslation(M, 0, 0, z)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   viewFrustum(ctx, { camera: lens, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   const nearOut = tree.distanceToPlane(planes, tree.PLANE_NEAR, 0, 0, z) > 0
 *   const farOut = tree.distanceToPlane(planes, tree.PLANE_FAR, 0, 0, z) > 0
 *   const color = nearOut ? [1, 0.31, 0.85, 1] : farOut ? [1, 0.82, 0.4, 1] : null
 *   axes(ctx, color ? { M, size: 20, semantic: false, color } : { M, size: 20 })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   out.textContent = 'z ' + z.toFixed(0)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */
