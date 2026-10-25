/**
 * @file Camera state — a lookat and a lens as plain data.
 * @module tree.camera
 * @license AGPL-3.0-only
 *
 * A camera state is `{ eye, center, up, fov, halfHeight, near, far }`:
 * `setCamera(ctx, cam)` installs it, the functions here move it and derive
 * its matrices. A state with `fov` is perspective; one with `halfHeight` and
 * no `fov` is orthographic.
 */

'use strict';

/**
 * A camera state; the one call that allocates.
 * @function createCamera
 * @memberof tree
 * @param {object} [opts]
 * @param {number[]} [opts.eye=[0, 0, 500]]
 * @param {number[]} [opts.center=[0, 0, 0]]
 * @param {number[]} [opts.up=[0, 1, 0]]
 * @param {number|null} [opts.fov=π/3]  Vertical field of view, radians.
 * @param {number|null} [opts.halfHeight=null]  Half the view's height, world units; without fov, orthographic.
 * @param {number} [opts.near=0.1]
 * @param {number} [opts.far=1000]
 * @returns {object} The camera state.
 * @example
 * <caption>An orthographic camera state, halfHeight 150, above and in front of the grid: the grid's far and near edges are the same length.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, grid, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const cam = tree.createCamera({ eye: [0, 200, 300], halfHeight: 150 })
 *
 * ctx.backend.bindTarget(ctx, scene)
 * ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 * setCamera(ctx, cam)
 * grid(ctx, { M: ground, size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
 * axes(ctx, { size: 60 })
 * ctx.backend.bindTarget(ctx, SCREEN)
 * image(ctx, scene.color)
 * endFrame(ctx)
 */

/**
 * Copy one camera state into another.
 * @function cameraCopy
 * @memberof tree
 * @param {object} out
 * @param {object} cam
 * @returns {object} out
 * @example
 * <caption>The eye orbits; every three seconds cameraCopy restores the state saved at the start, snapping the view back.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, grid, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const cam = tree.createCamera({ eye: [0, 150, 300] })
 * const home = tree.cameraCopy(tree.createCamera(), cam)
 * let last = 0
 *
 * function frame(ms) {
 *   if (ms - last > 3000) { last = ms; tree.cameraCopy(cam, home) }
 *   tree.cameraOrbit(cam, 0.02, 0)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
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
 * The view matrix (world → eye) of a camera state.
 * @function cameraView
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {object} cam
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>cameraView and cameraProj make the matrices setCamera(ctx, cam) would install: installed as V and P, the view circles the axes.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, grid, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const cam = tree.createCamera({ eye: [0, 150, 300] })
 * const V = tree.mat4()
 * const P = tree.cameraProj(tree.mat4(), cam, 400 / 300)
 *
 * function frame() {
 *   tree.cameraOrbit(cam, 0.01, 0)
 *   tree.cameraView(V, cam)
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
 * The eye matrix (eye → world) of a camera state.
 * @function cameraEye
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {object} cam
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>The frame of a second camera circling the origin sits at the apex of its white frustum, blue pointing back, away from what it sees.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, viewFrustum, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 250, 330] })
 * const other = tree.createCamera({ eye: [120, 30, 0], fov: Math.PI / 4, near: 20, far: 80 })
 * const E = tree.mat4()
 *
 * function frame() {
 *   tree.cameraOrbit(other, 0.01, 0)
 *   tree.cameraEye(E, other)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   axes(ctx, { size: 30, semantic: false, color: [1, 1, 1, 1] })
 *   viewFrustum(ctx, { camera: other, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   axes(ctx, { M: E, size: 40 })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The projection matrix of a camera state's lens.
 * @function cameraProj
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {object} cam
 * @param {number} aspect  Width over height.
 * @param {number} [ndcYSign=1]  −1 flips y. The depth range is WebGPU's, bound by this
 *        namespace: the fourth argument is the y sign, not the depth constant.
 * @returns {Float32Array|number[]|null} out, or null when the lens is degenerate.
 * @example
 * <caption>The lens zooms between 20° and 80° while the eye stays put: the axes swell and shrink on screen.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const V = tree.cameraView(tree.mat4(), cam)
 * const P = tree.mat4()
 *
 * function frame(ms) {
 *   cam.fov = (50 + 30 * Math.sin(ms / 1000)) * Math.PI / 180
 *   tree.cameraProj(P, cam, 400 / 300)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, V, P)
 *   axes(ctx, { size: 60 })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Orbit the eye about the center: an azimuth about the up hint and an elevation, clamped short of the poles.
 * @function cameraOrbit
 * @memberof tree
 * @param {object} cam
 * @param {number} dAz  Azimuth step, radians.
 * @param {number} dEl  Elevation step, radians.
 * @param {object} [opts]
 * @param {number} [opts.maxEl]  The elevation limit, radians.
 * @returns {object} cam
 * @example
 * <caption>Each frame the eye steps around the origin and rises; at the 60° elevation limit it stops climbing and keeps circling above the grid.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, grid, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const cam = tree.createCamera({ eye: [0, 0, 330] })
 *
 * function frame() {
 *   tree.cameraOrbit(cam, 0.01, 0.004, { maxEl: Math.PI / 3 })
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
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
 * Pan: move eye and center together along the view's right and up.
 * @function cameraPan
 * @memberof tree
 * @param {object} cam
 * @param {number} dx  World units along right.
 * @param {number} dy  World units along up.
 * @returns {object} cam
 * @example
 * <caption>The camera pans right and left, 100 each way: the grid and axes slide across the view without turning.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, grid, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const cam = tree.createCamera({ eye: [0, 150, 300] })
 * let x = 0
 *
 * function frame(ms) {
 *   const next = 100 * Math.sin(ms / 1000)
 *   tree.cameraPan(cam, next - x, 0)
 *   x = next
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
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
 * Dolly: scale the eye's distance to the center — or, orthographic, the half height.
 * @function cameraDolly
 * @memberof tree
 * @param {object} cam
 * @param {number} factor  Below 1 moves in.
 * @param {object} [opts]
 * @param {number} [opts.min]  The closest distance.
 * @param {number} [opts.max]  The farthest distance.
 * @returns {object} cam
 * @example
 * <caption>The eye dollies in and out along its line of sight, held between 150 and 500 from the center: the readout's distance stops at both limits.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, grid, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:white;font:13px monospace'
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const cam = tree.createCamera({ eye: [0, 150, 300] })
 *
 * function frame(ms) {
 *   tree.cameraDolly(cam, Math.sin(ms / 1000) > 0 ? 0.99 : 1.01, { min: 150, max: 500 })
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   grid(ctx, { M: ground, size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
 *   axes(ctx, { size: 60 })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   out.textContent = 'distance: ' + Math.hypot(cam.eye[0], cam.eye[1], cam.eye[2]).toFixed(0)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Point a camera state from a pose: the eye at its position, looking down its −z.
 * @function cameraFromPose
 * @memberof tree
 * @param {object} cam
 * @param {{ pos: number[], rot: number[] }} pose
 * @returns {object} cam
 * @example
 * <caption>A pose circling at radius 300, 150 up, its −z aimed at the origin, drives the camera state: the view circles the axes.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, grid, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const cam = tree.createCamera()
 * const pose = { pos: tree.vec3(), rot: tree.quat() }
 *
 * function frame(ms) {
 *   const t = ms / 2000
 *   pose.pos[0] = 300 * Math.sin(t); pose.pos[1] = 150; pose.pos[2] = 300 * Math.cos(t)
 *   tree.qFromLookDir(pose.rot, [-pose.pos[0], -pose.pos[1], -pose.pos[2]])
 *   tree.cameraFromPose(cam, pose)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
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
 * A camera state's lookat as a pose.
 * @function cameraToPose
 * @memberof tree
 * @param {{ pos: number[], rot: number[] }} pose  Destination.
 * @param {object} cam
 * @returns {{ pos: number[], rot: number[] }} pose
 * @example
 * <caption>The pose of a second, circling camera, drawn as a frame: at the apex of its white frustum, blue pointing back.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, viewFrustum, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 250, 330] })
 * const other = tree.createCamera({ eye: [120, 30, 0], fov: Math.PI / 4, near: 20, far: 80 })
 * const pose = { pos: tree.vec3(), rot: tree.quat() }
 * const M = tree.mat4()
 *
 * function frame() {
 *   tree.cameraOrbit(other, 0.01, 0)
 *   tree.cameraToPose(pose, other)
 *   tree.mat4FromTRS(M, pose.pos[0], pose.pos[1], pose.pos[2], pose.rot[0], pose.rot[1], pose.rot[2], pose.rot[3], 1, 1, 1)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   viewFrustum(ctx, { camera: other, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   axes(ctx, { M, size: 40 })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Read a camera state back from an eye matrix and a projection.
 * @function cameraFromMat4
 * @memberof tree
 * @param {object} cam  Destination.
 * @param {ArrayLike<number>} E  The eye matrix (eye → world).
 * @param {ArrayLike<number>} P  The projection.
 * @returns {object} cam
 * @example
 * <caption>Read back from an eye matrix at (100, 60, 80) and a 60° projection: the readout recovers that eye and fov, and installing the state shows the origin at the canvas center.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:white;font:13px monospace'
 * const E = tree.mat4Eye(tree.mat4(), 100, 60, 80, 0, 0, 0, 0, 1, 0)
 * const P = tree.cameraProj(tree.mat4(), tree.createCamera({ fov: Math.PI / 3, near: 1, far: 1000 }), 400 / 300)
 * const cam = tree.cameraFromMat4(tree.createCamera(), E, P)
 *
 * ctx.backend.bindTarget(ctx, scene)
 * ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 * setCamera(ctx, cam)
 * axes(ctx, { size: 30 })
 * ctx.backend.bindTarget(ctx, SCREEN)
 * image(ctx, scene.color)
 * endFrame(ctx)
 * out.textContent = 'eye ' + cam.eye.map((v) => v.toFixed(0)).join(', ') + '   fov ' + (cam.fov * 180 / Math.PI).toFixed(0) + '°'
 */

/**
 * The six frustum planes of a camera state, for the visibility tests.
 * @function cameraPlanes
 * @memberof tree
 * @param {Float64Array} planes  A `Float64Array(24)`.
 * @param {object} cam
 * @param {number} aspect  Width over height.
 * @returns {Float64Array|null} planes, or null when the lens is degenerate.
 * @example
 * <caption>The small axes sweep through the white frustum: drawn in their colors while tree.pointVisibility against its planes says visible, yellow while it says not.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, viewFrustum, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 300, 250] })
 * const lens = tree.createCamera({ eye: [0, 0, 120], center: [0, 0, 0], fov: Math.PI / 4, near: 20, far: 200 })
 * const planes = tree.cameraPlanes(tree.planes(), lens, 4 / 3)
 * const M = tree.mat4()
 *
 * function frame(ms) {
 *   const x = 120 * Math.sin(ms / 1000)
 *   tree.mat4FromTranslation(M, x, 0, 0)
 *   const seen = tree.pointVisibility(planes, x, 0, 0) === tree.VISIBLE
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   viewFrustum(ctx, { camera: lens, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   axes(ctx, seen ? { M, size: 20 } : { M, size: 20, semantic: false, color: [1, 0.82, 0.4, 1] })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The eight world corners of a camera state's frustum: near face 0–3, far face 4–7, each from bottom-left counter-clockwise.
 * @function frustumCorners
 * @memberof tree
 * @param {Float64Array|number[]} out24  24-element destination.
 * @param {object} cam
 * @param {number} [aspect]  Width over height.
 * @returns {Float64Array|number[]|null} out24, or null when the lens is degenerate.
 * @example
 * <caption>The magenta pane fills the circling camera's far face, from corners 7, 6, 5 and 4 — top-left, top-right, bottom-right, bottom-left — inside its white frustum.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, pane, viewFrustum, tree } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 250, 330] })
 * const other = tree.createCamera({ eye: [120, 30, 0], fov: Math.PI / 4, near: 20, far: 100 })
 * const c = []   // the 24 corner coordinates, written in place every frame
 * const corner = (i) => [c[3 * i], c[3 * i + 1], c[3 * i + 2]]
 *
 * function frame() {
 *   tree.cameraOrbit(other, 0.01, 0)
 *   tree.frustumCorners(c, other, 4 / 3)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   viewFrustum(ctx, { camera: other, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   pane(ctx, corner(7), corner(6), corner(5), corner(4), { color: [1, 0.31, 0.85, 1] })
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */
