/**
 * @file Handles — points dragged on a sphere, a plane, an axis or a dial.
 * @module host.handles
 * @license AGPL-3.0-only
 *
 * `canvasHost.handle(opts)` makes one on a host attached with
 * `init(gl, { host })`. Each frame, after `setCamera`: `update()` it — before
 * the orbit — read it with `value(out)` or let it drive a bound vec3, draw it
 * with `handleLocus`, and end the frame with `canvasHost.pointer.flush()`.
 */

'use strict';

/**
 * Constraint: the point moves on a sphere about the anchor.
 * @constant {number} SPHERE
 * @memberof tree
 */

/**
 * Constraint: the point moves on a plane through the anchor.
 * @constant {number} PLANE
 * @memberof tree
 */

/**
 * Constraint: the point moves along an axis through the anchor.
 * @constant {number} AXIS
 * @memberof tree
 */

/**
 * Constraint: an angle turned about an axis — a dial.
 * @constant {number} DIAL
 * @memberof tree
 */

/**
 * Constraint: the point moves on the plane through it facing the camera.
 * @constant {number} VIEW
 * @memberof host
 */

/**
 * handleLocus bit: the dot at the handle's point.
 * @constant {number} HANDLE
 * @memberof tree
 */

/**
 * handleLocus bit: the line from the anchor to the point.
 * @constant {number} AIM
 * @memberof tree
 */

/**
 * handleLocus bit: the constraint's locus — the sphere, plane, rail or dial.
 * @constant {number} LOCUS
 * @memberof tree
 */

/**
 * handleLocus bit: the ring around the point.
 * @constant {number} RING
 * @memberof tree
 */

/**
 * Take this frame's pointer: grab, drag or release. Call before the orbit's `update()`.
 * @function update
 * @memberof Handle
 * @returns {boolean} Whether the handle is grabbed.
 * @example
 * <caption>Drag the magenta dot around the sphere: while update() reports the handle grabbed, the ground grid is drawn yellow.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, grid, handleLocus, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 200, 300] })
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const h = canvasHost.handle({ constraint: tree.SPHERE, anchor: [0, 0, 0], radius: 80 })
 *
 * function frame() {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   const grabbed = h.update()
 *   grid(ctx, { M: ground, size: 120, subdivisions: 12, color: grabbed ? [1, 0.82, 0.4, 1] : [1, 1, 1, 1] })
 *   handleLocus(ctx, h, { dotColor: [1, 0.31, 0.85, 1] })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Undo the drag in progress: back to the value at grab.
 * @function cancel
 * @memberof Handle
 * @returns {Handle}
 * @example
 * <caption>Drag the magenta dot across the ground: once it goes past the yellow grid's edge, 100 from the center, cancel() snaps it back to where the drag began.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, grid, handleLocus, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 250, 250] })
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const h = canvasHost.handle({ constraint: tree.PLANE, anchor: [0, 0, 0], normal: [0, 1, 0] })
 * const v = tree.vec3()
 *
 * function frame() {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   if (h.update() && Math.hypot(...h.value(v)) > 100) h.cancel()
 *   grid(ctx, { M: ground, size: 100, subdivisions: 10, color: [1, 0.82, 0.4, 1] })
 *   handleLocus(ctx, h, { bits: tree.HANDLE, dotColor: [1, 0.31, 0.85, 1] })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The handle's current point.
 * @function value
 * @memberof Handle
 * @param {number[]} out  3-element destination.
 * @param {object} [opts]
 * @param {string|ArrayLike<number>} [opts.to]  The space to report in: `tree.WORLD` (default), `tree.EYE`, `tree.SCREEN`, `tree.NDC`, or a frame matrix.
 * @returns {number[]} out
 * @example
 * <caption>Drag the magenta dot on the ground: the small axes are placed at value(out), in world space, and the white cross at value(out, { to: tree.SCREEN }), in screen pixels — both follow it.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, grid, handleLocus, beginHUD, endHUD, cross, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 250, 250] })
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const h = canvasHost.handle({ constraint: tree.PLANE, anchor: [40, 0, 0], normal: [0, 1, 0] })
 * const world = tree.vec3(), screen = tree.vec3(), M = tree.mat4()
 *
 * function frame() {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   h.update()
 *   h.value(world)
 *   h.value(screen, { to: tree.SCREEN })
 *   grid(ctx, { M: ground, size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
 *   axes(ctx, { M: tree.mat4FromTranslation(M, world[0], world[1], world[2]), size: 40 })
 *   handleLocus(ctx, h, { bits: tree.HANDLE, dotColor: [1, 0.31, 0.85, 1] })
 *   beginHUD(ctx)
 *   cross(ctx, { x: screen[0], y: screen[1] - 40, size: 16, color: [1, 1, 1, 1] })
 *   endHUD(ctx)
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Bind the target a drag writes into: a vec3 mutated in place — a camera state's eye or center — or `{ get, set }`.
 * @function bind
 * @memberof Handle
 * @param {number[]|object} target
 * @returns {Handle}
 * @example
 * <caption>The handle is bound to a vec3 starting at (50, 0, 30): dragging the magenta dot writes into it, and the yellow axes placed from that vec3 follow the dot.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, grid, handleLocus, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 250, 250] })
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const spot = [50, 0, 30], M = tree.mat4()
 * const h = canvasHost.handle({ constraint: tree.PLANE, anchor: [0, 0, 0], normal: [0, 1, 0] }).bind(spot)
 *
 * function frame() {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   h.update()
 *   grid(ctx, { M: ground, size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
 *   axes(ctx, { M: tree.mat4FromTranslation(M, spot[0], spot[1], spot[2]), size: 30, semantic: false, color: [1, 0.82, 0.4, 1] })
 *   handleLocus(ctx, h, { bits: tree.HANDLE, dotColor: [1, 0.31, 0.85, 1] })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Re-read the bound target after it changed elsewhere.
 * @function sync
 * @memberof Handle
 * @returns {Handle}
 * @example
 * <caption>The bound point circles the ground by itself and sync() re-seeds the handle from it every frame, so the magenta dot follows — until you grab it and drag it somewhere else, where the circle resumes.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, grid, handleLocus, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 250, 250] })
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const target = [60, 0, 0]
 * const h = canvasHost.handle({ constraint: tree.PLANE, anchor: [0, 0, 0], normal: [0, 1, 0], bind: target })
 * let center = [0, 0, 0], a = 0
 *
 * function frame() {
 *   if (!h.grabbed()) {
 *     a += 0.02
 *     target[0] = center[0] + 60 * Math.cos(a); target[2] = center[2] + 60 * Math.sin(a)
 *     h.sync()
 *   } else {
 *     center = [target[0] - 60 * Math.cos(a), 0, target[2] - 60 * Math.sin(a)]
 *   }
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   h.update()
 *   grid(ctx, { M: ground, size: 120, subdivisions: 12, color: [1, 1, 1, 1] })
 *   handleLocus(ctx, h, { bits: tree.HANDLE, dotColor: [1, 0.31, 0.85, 1] })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * AXIS: the signed distance along the rail; DIAL: the angle turned; NaN otherwise.
 * @function scalar
 * @memberof Handle
 * @returns {number}
 * @example
 * <caption>Turn the dial: drag the magenta dot around its ring, and the axes above turn about y by the angle scalar() accumulates — past a full turn too.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, handleLocus, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 250, 250] })
 * const h = canvasHost.handle({ constraint: tree.DIAL, anchor: [0, 0, 0], axis: [0, 1, 0], radius: 90 })
 * const M = tree.mat4(), q = tree.quat()
 *
 * function frame() {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   h.update()
 *   tree.mat4FromTRS(M, 0, 40, 0, ...tree.qFromAxisAngle(q, 0, 1, 0, h.scalar()), 1, 1, 1)
 *   axes(ctx, { M, size: 60 })
 *   handleLocus(ctx, h, { dotColor: [1, 0.31, 0.85, 1] })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * SPHERE: the azimuth and elevation of the point about the anchor.
 * @function azEl
 * @memberof Handle
 * @param {number[]} out2  2-element destination.
 * @returns {number[]} out2
 * @example
 * <caption>Drag the magenta dot around the sphere: the yellow line runs out from the center along the azimuth azEl() reports, flat on the equator's plane, and the white line rises from its end by the elevation — together they always reach the dot.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, handleLocus, hermite, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 150, 300] })
 * const h = canvasHost.handle({ constraint: tree.SPHERE, anchor: [0, 0, 0], radius: 80 })
 * const ae = [0, 0], foot = tree.vec3(), rise = tree.vec3()
 *
 * function frame() {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   h.update()
 *   h.azEl(ae)
 *   // azimuth turns about y from +x; elevation lifts out of the equator's plane
 *   const reach = 80 * Math.cos(ae[1])
 *   foot[0] = reach * Math.cos(ae[0]); foot[2] = reach * Math.sin(ae[0])
 *   rise[1] = 80 * Math.sin(ae[1])
 *   handleLocus(ctx, h, { dotColor: [1, 0.31, 0.85, 1] })
 *   hermite(ctx, [0, 0, 0], foot, foot, foot, { color: [1, 0.82, 0.4, 1], depth: false })
 *   hermite(ctx, foot, rise, [foot[0], rise[1], foot[2]], rise, { color: [1, 1, 1, 1], depth: false })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Whether the handle is being dragged.
 * @function grabbed
 * @memberof Handle
 * @returns {boolean}
 * @example
 * <caption>Drag the dot along the x axis, up to 100 either way of the origin: it is drawn yellow while grabbed() is true, magenta otherwise.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, handleLocus, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 150, 300] })
 * const h = canvasHost.handle({ constraint: tree.AXIS, anchor: [0, 0, 0], axis: [1, 0, 0], extent: [-100, 100] })
 *
 * function frame() {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   h.update()
 *   axes(ctx, { size: 60 })
 *   handleLocus(ctx, h, { dotColor: h.grabbed() ? [1, 0.82, 0.4, 1] : [1, 0.31, 0.85, 1] })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Whether the pointer rests on the handle, or drags it; a lone handle reports it with `hover: true`.
 * @function hovered
 * @memberof Handle
 * @returns {boolean}
 * @example
 * <caption>Move the pointer onto the magenta dot: it grows while hovered() is true.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, grid, handleLocus, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 250, 250] })
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const h = canvasHost.handle({ constraint: tree.PLANE, anchor: [0, 0, 0], normal: [0, 1, 0], hover: true })
 *
 * function frame() {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   h.update()
 *   grid(ctx, { M: ground, size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
 *   handleLocus(ctx, h, { bits: tree.HANDLE, size: h.hovered() ? 20 : 10, dotColor: [1, 0.31, 0.85, 1] })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Move the anchor; the point moves with it.
 * @function anchor
 * @memberof Handle
 * @param {number[]} v
 * @returns {Handle}
 * @example
 * <caption>The sphere's anchor, set every frame from the circling small axes, carries the sphere and the magenta dot around with it — drag the dot and it keeps its place on the moving sphere.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, handleLocus, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 200, 330] })
 * const h = canvasHost.handle({ constraint: tree.SPHERE, anchor: [0, 0, 0], radius: 50 })
 * const c = tree.vec3(), M = tree.mat4()
 *
 * function frame(ms) {
 *   const t = ms / 2000
 *   c[0] = 70 * Math.cos(t); c[2] = 70 * Math.sin(t)
 *   h.anchor(c)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   h.update()
 *   axes(ctx, { M: tree.mat4FromTranslation(M, c[0], c[1], c[2]), size: 20 })
 *   handleLocus(ctx, h, { dotColor: [1, 0.31, 0.85, 1] })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Release the pointer and leave the host.
 * @function dispose
 * @memberof Handle
 * @example
 * <caption>Click the button to dispose of the handle: from then on the magenta dot is neither drawn nor draggable.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, grid, handleLocus, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 250, 250] })
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * let h = canvasHost.handle({ constraint: tree.PLANE, anchor: [0, 0, 0], normal: [0, 1, 0] })
 * const button = document.body.appendChild(document.createElement('button'))
 * button.textContent = 'dispose'
 * button.style.cssText = 'position:absolute;left:8px;top:8px'
 * button.onclick = () => { if (h) { h.dispose(); h = null } }
 *
 * function frame() {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   if (h) h.update()
 *   grid(ctx, { M: ground, size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
 *   if (h) handleLocus(ctx, h, { bits: tree.HANDLE, dotColor: [1, 0.31, 0.85, 1] })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */
