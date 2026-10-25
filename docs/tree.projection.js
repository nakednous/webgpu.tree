/**
 * @file Projection — read a lens back out of a projection matrix.
 * @module tree.projection
 * @license AGPL-3.0-only
 *
 * Queries read near, far, the near plane's extents and the fields of view
 * out of a projection matrix P — the one `viewOf(gl).mat4Proj` holds, or one
 * built with `tree.cameraProj`. The space names below are what `mapLocation`,
 * `mapDirection` and `unproject` take.
 */

'use strict';

/**
 * World space.
 * @constant {string} WORLD
 * @memberof tree
 */

/**
 * Eye space: the camera at the origin looking down −z.
 * @constant {string} EYE
 * @memberof tree
 */

/**
 * Normalized device coordinates.
 * @constant {string} NDC
 * @memberof tree
 */

/**
 * Screen space: pixels of the viewport, y down.
 * @constant {string} SCREEN
 * @memberof tree
 */

/**
 * Whether a projection is orthographic.
 * @function projIsOrtho
 * @memberof tree
 * @param {ArrayLike<number>} p  A projection matrix.
 * @returns {boolean}
 * @example
 * <caption>Every two seconds the lens switches between perspective and orthographic; the grid is drawn yellow whenever the installed projection reads orthographic.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, grid, viewOf, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const persp = tree.createCamera({ eye: [0, 200, 300] })
 * const ortho = tree.createCamera({ eye: [0, 200, 300], halfHeight: 150 })
 *
 * function frame(ms) {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, Math.floor(ms / 2000) % 2 ? ortho : persp)
 *   const flat = tree.projIsOrtho(viewOf(ctx).mat4Proj)
 *   grid(ctx, { M: ground, size: 100, subdivisions: 10, color: flat ? [1, 0.82, 0.4, 1] : [1, 1, 1, 1] })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The near-plane distance of a projection.
 * @function projNear
 * @memberof tree
 * @param {ArrayLike<number>} p
 * @returns {number}
 * @example
 * <caption>The white frustum's near plane slides between 20 and 100: small yellow axes placed that far down the lens's line of sight, a distance read from its projection matrix, sit at the center of the near face and follow it.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, viewFrustum, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [300, 200, 250], center: [0, 0, -60] })
 * const lens = tree.createCamera({ eye: [0, 0, 100], fov: Math.PI / 3, far: 200 })
 * const P = tree.mat4(), E = tree.mat4(), T = tree.mat4(), M = tree.mat4()
 *
 * function frame(ms) {
 *   lens.near = 60 + 40 * Math.sin(ms / 1000)
 *   tree.cameraProj(P, lens, 4 / 3)
 *   tree.mat4Mul(M, tree.cameraEye(E, lens), tree.mat4FromTranslation(T, 0, 0, -tree.projNear(P)))
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   viewFrustum(ctx, { camera: lens, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   axes(ctx, { M, size: 20, semantic: false, color: [1, 0.82, 0.4, 1] })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The far-plane distance of a projection.
 * @function projFar
 * @memberof tree
 * @param {ArrayLike<number>} p
 * @returns {number}
 * @example
 * <caption>The white frustum's far plane slides between 120 and 220: small yellow axes placed that far down the lens's line of sight, a distance read from its projection matrix, sit at the center of the far face and follow it.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, viewFrustum, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [300, 200, 250], center: [0, 0, -60] })
 * const lens = tree.createCamera({ eye: [0, 0, 100], fov: Math.PI / 3, near: 40 })
 * const P = tree.mat4(), E = tree.mat4(), T = tree.mat4(), M = tree.mat4()
 *
 * function frame(ms) {
 *   lens.far = 170 + 50 * Math.sin(ms / 1000)
 *   tree.cameraProj(P, lens, 4 / 3)
 *   tree.mat4Mul(M, tree.cameraEye(E, lens), tree.mat4FromTranslation(T, 0, 0, -tree.projFar(P)))
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   viewFrustum(ctx, { camera: lens, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   axes(ctx, { M, size: 30, semantic: false, color: [1, 0.82, 0.4, 1] })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The near plane's left extent, eye space.
 * @function projLeft
 * @memberof tree
 * @param {ArrayLike<number>} p
 * @returns {number}
 * @example
 * <caption>The white frustum widens and narrows: small yellow axes placed at the left extent read from its projection, on the near plane, ride the middle of the near face's left edge.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, viewFrustum, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [300, 200, 250], center: [0, 0, -60] })
 * const lens = tree.createCamera({ eye: [0, 0, 100], near: 50, far: 200 })
 * const P = tree.mat4(), E = tree.mat4(), T = tree.mat4(), M = tree.mat4()
 *
 * function frame(ms) {
 *   lens.fov = (50 + 20 * Math.sin(ms / 1000)) * Math.PI / 180
 *   tree.cameraProj(P, lens, 4 / 3)
 *   tree.mat4Mul(M, tree.cameraEye(E, lens), tree.mat4FromTranslation(T, tree.projLeft(P), 0, -50))
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   viewFrustum(ctx, { camera: lens, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   axes(ctx, { M, size: 12, semantic: false, color: [1, 0.82, 0.4, 1] })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The near plane's right extent, eye space.
 * @function projRight
 * @memberof tree
 * @param {ArrayLike<number>} p
 * @returns {number}
 * @example
 * <caption>The white frustum widens and narrows: small yellow axes placed at the right extent read from its projection, on the near plane, ride the middle of the near face's right edge.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, viewFrustum, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [300, 200, 250], center: [0, 0, -60] })
 * const lens = tree.createCamera({ eye: [0, 0, 100], near: 50, far: 200 })
 * const P = tree.mat4(), E = tree.mat4(), T = tree.mat4(), M = tree.mat4()
 *
 * function frame(ms) {
 *   lens.fov = (50 + 20 * Math.sin(ms / 1000)) * Math.PI / 180
 *   tree.cameraProj(P, lens, 4 / 3)
 *   tree.mat4Mul(M, tree.cameraEye(E, lens), tree.mat4FromTranslation(T, tree.projRight(P), 0, -50))
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   viewFrustum(ctx, { camera: lens, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   axes(ctx, { M, size: 12, semantic: false, color: [1, 0.82, 0.4, 1] })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The near plane's top extent, eye space.
 * @function projTop
 * @memberof tree
 * @param {ArrayLike<number>} p
 * @returns {number}
 * @example
 * <caption>The white frustum widens and narrows: small yellow axes placed at the top extent read from its projection, on the near plane, ride the middle of the near face's top edge.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, viewFrustum, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [300, 200, 250], center: [0, 0, -60] })
 * const lens = tree.createCamera({ eye: [0, 0, 100], near: 50, far: 200 })
 * const P = tree.mat4(), E = tree.mat4(), T = tree.mat4(), M = tree.mat4()
 *
 * function frame(ms) {
 *   lens.fov = (50 + 20 * Math.sin(ms / 1000)) * Math.PI / 180
 *   tree.cameraProj(P, lens, 4 / 3)
 *   tree.mat4Mul(M, tree.cameraEye(E, lens), tree.mat4FromTranslation(T, 0, tree.projTop(P), -50))
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   viewFrustum(ctx, { camera: lens, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   axes(ctx, { M, size: 12, semantic: false, color: [1, 0.82, 0.4, 1] })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The near plane's bottom extent, eye space.
 * @function projBottom
 * @memberof tree
 * @param {ArrayLike<number>} p
 * @returns {number}
 * @example
 * <caption>The white frustum widens and narrows: small yellow axes placed at the bottom extent read from its projection, on the near plane, ride the middle of the near face's bottom edge.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, viewFrustum, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [300, 200, 250], center: [0, 0, -60] })
 * const lens = tree.createCamera({ eye: [0, 0, 100], near: 50, far: 200 })
 * const P = tree.mat4(), E = tree.mat4(), T = tree.mat4(), M = tree.mat4()
 *
 * function frame(ms) {
 *   lens.fov = (50 + 20 * Math.sin(ms / 1000)) * Math.PI / 180
 *   tree.cameraProj(P, lens, 4 / 3)
 *   tree.mat4Mul(M, tree.cameraEye(E, lens), tree.mat4FromTranslation(T, 0, tree.projBottom(P), -50))
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   viewFrustum(ctx, { camera: lens, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   axes(ctx, { M, size: 12, semantic: false, color: [1, 0.82, 0.4, 1] })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The vertical field of view of a perspective projection, in radians.
 * @function projFov
 * @memberof tree
 * @param {ArrayLike<number>} p
 * @returns {number}
 * @example
 * <caption>The white frustum widens and narrows: two yellow lines leaving its apex at ± half the vertical field of view read from its projection run down the middle of its top and bottom faces.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, hermite, viewFrustum, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [300, 200, 250], center: [0, 0, -60] })
 * const lens = tree.createCamera({ eye: [0, 0, 100], near: 50, far: 200 })
 * const P = tree.mat4(), E = tree.mat4(), up = tree.vec3(), down = tree.vec3()
 *
 * function frame(ms) {
 *   lens.fov = (50 + 20 * Math.sin(ms / 1000)) * Math.PI / 180
 *   tree.cameraProj(P, lens, 4 / 3)
 *   tree.cameraEye(E, lens)
 *   const k = 200 * Math.tan(tree.projFov(P) / 2)
 *   tree.mat4MulDir(up, E, 0, k, -200)
 *   tree.mat4MulDir(down, E, 0, -k, -200)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   viewFrustum(ctx, { camera: lens, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   hermite(ctx, lens.eye, up, up.map((v, i) => v + lens.eye[i]), up, { color: [1, 0.82, 0.4, 1] })
 *   hermite(ctx, lens.eye, down, down.map((v, i) => v + lens.eye[i]), down, { color: [1, 0.82, 0.4, 1] })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The horizontal field of view of a perspective projection, in radians.
 * @function projHfov
 * @memberof tree
 * @param {ArrayLike<number>} p
 * @returns {number}
 * @example
 * <caption>The white 4:3 frustum widens and narrows: two yellow lines leaving its apex at ± half the horizontal field of view read from its projection run down the middle of its left and right faces.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, hermite, viewFrustum, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [300, 200, 250], center: [0, 0, -60] })
 * const lens = tree.createCamera({ eye: [0, 0, 100], near: 50, far: 200 })
 * const P = tree.mat4(), E = tree.mat4(), left = tree.vec3(), right = tree.vec3()
 *
 * function frame(ms) {
 *   lens.fov = (50 + 20 * Math.sin(ms / 1000)) * Math.PI / 180
 *   tree.cameraProj(P, lens, 4 / 3)
 *   tree.cameraEye(E, lens)
 *   const k = 200 * Math.tan(tree.projHfov(P) / 2)
 *   tree.mat4MulDir(left, E, -k, 0, -200)
 *   tree.mat4MulDir(right, E, k, 0, -200)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   viewFrustum(ctx, { camera: lens, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   hermite(ctx, lens.eye, left, left.map((v, i) => v + lens.eye[i]), left, { color: [1, 0.82, 0.4, 1] })
 *   hermite(ctx, lens.eye, right, right.map((v, i) => v + lens.eye[i]), right, { color: [1, 0.82, 0.4, 1] })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */
