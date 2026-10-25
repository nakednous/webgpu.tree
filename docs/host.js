/**
 * @file The canvas host — pointer, clock, handles, tracks, helms, orbit, labels, media.
 * @module host
 * @license AGPL-3.0-only
 *
 * `host.createHost(canvas)` gives a canvas what is neither math nor drawing:
 * its pointer, a frame clock and size, and the constructs that tick with it.
 * Attach it with `init(gl, { host })`, then each frame: `setCamera`, update
 * handles, let the orbit take the pointer nobody grabbed, draw, and — when the
 * application owns the loop — `tick(dt)` and `pointer.flush()`.
 */

'use strict';

/**
 * The host of a canvas. With `onFrame` it runs its own animation loop; without it, call `tick(dt)` and `pointer.flush()` every frame.
 * @function createHost
 * @memberof host
 * @param {HTMLCanvasElement} canvas
 * @param {object} [opts]
 * @param {function(number, object):void} [opts.onFrame]  Called every frame with dt (seconds) and the host.
 * @param {function(number, number, number):void} [opts.onSize]  Called with width, height and device pixel ratio when the canvas resizes.
 * @returns {object} The host.
 * @example
 * <caption>The host runs the loop: onFrame draws every frame and flushes the pointer after it, so the magenta dot drags around its sphere with no requestAnimationFrame in the sketch.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, handleLocus, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const cam = tree.createCamera({ eye: [0, 150, 300] })
 * let ctx = null, scene = null, h = null
 * const canvasHost = host.createHost(canvas, {
 *   onFrame: () => {
 *     if (!h) return                        // the first frames run before init's promise settles
 *     ctx.backend.bindTarget(ctx, scene)
 *     ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *     setCamera(ctx, cam)
 *     h.update()
 *     axes(ctx, { size: 50 })
 *     handleLocus(ctx, h, { dotColor: [1, 0.31, 0.85, 1] })
 *     ctx.backend.bindTarget(ctx, SCREEN)
 *     image(ctx, scene.color)
 *   },
 *   afterFrame: () => { if (ctx) endFrame(ctx) },   // after the host's pointer.flush(): the frame submitted
 * })
 * ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * scene = renderTarget(ctx)
 * h = canvasHost.handle({ constraint: tree.SPHERE, anchor: [0, 0, 0], radius: 80 })
 */

/**
 * The frame named by a helm's own orientation.
 * @constant {string} SELF
 * @memberof tree
 */

/**
 * Seconds since the host was created.
 * @function clock
 * @memberof Host
 * @returns {number}
 * @example
 * <caption>The axes turn by the host's clock: one radian for every second since the host was made.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const M = tree.mat4(), q = tree.quat()
 *
 * function frame() {
 *   tree.mat4FromTRS(M, 0, 0, 0, ...tree.qFromAxisAngle(q, 0, 1, 0, canvasHost.clock()), 1, 1, 1)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   axes(ctx, { M, size: 80 })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Advance everything the host ticks — playing tracks, helms, devices — by dt; for a loop the application owns.
 * @function tick
 * @memberof Host
 * @param {number} dt  Seconds.
 * @example
 * <caption>The track plays only while the host is ticked, and here it is ticked every other second: the frame rides the path for a second, rests for a second, and rides on.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, trackPath, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 200, 330] })
 * const track = canvasHost.poseTrack()
 * track.add([{ pos: [-100, 0, 0] }, { pos: [0, 60, -60] }, { pos: [100, 0, 0] }])
 * track.play({ duration: 60, loop: true, bounce: true })
 * const M = tree.mat4()
 *
 * function frame() {
 *   if (Math.floor(canvasHost.clock()) % 2 === 0) canvasHost.tick(1 / 60)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   trackPath(ctx, track, { bits: tree.PATH, color: [1, 0.82, 0.4, 1] })
 *   axes(ctx, { M: track.mat4Model(M), size: 40 })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * A draggable handle on the canvas.
 * @function handle
 * @memberof Host
 * @param {object} opts
 * @param {number|object} opts.constraint  `tree.SPHERE`, `tree.PLANE`, `tree.AXIS`, `tree.DIAL` or `host.VIEW`.
 * @param {number[]} [opts.anchor]  The sphere's, plane's, axis's or dial's reference point.
 * @param {number} [opts.radius]  SPHERE, DIAL: the radius.
 * @param {number[]} [opts.normal=[0, 1, 0]]  PLANE: the normal.
 * @param {number[]} [opts.axis]  AXIS: the rail's direction (default x); DIAL: the normal of the dial's plane (default y).
 * @param {number[]} [opts.extent]  AXIS: the range along the rail, world units (default [−1, 1]); DIAL: the range of the angle, radians (default unbounded).
 * @param {number} [opts.snap]  A snap step: radians for SPHERE and DIAL, world units otherwise.
 * @param {number} [opts.grabPx=12]  The grab radius in pixels.
 * @param {boolean} [opts.hover]  Track hovering, for `hovered()`.
 * @param {number[]|object} [opts.bind]  The target dragged: a vec3 mutated in place, or `{ get, set }`.
 * @param {function} [opts.onGrab]
 * @param {function} [opts.onChange]
 * @param {function} [opts.onRelease]
 * @returns {Handle|null} The handle, or null for an invalid constraint.
 * @example
 * <caption>A PLANE handle snapping to a 20-unit grid: drag the magenta dot and it jumps from grid crossing to grid crossing.</caption>
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
 * const h = canvasHost.handle({ constraint: tree.PLANE, anchor: [0, 0, 0], normal: [0, 1, 0], snap: 20 })
 *
 * function frame() {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   h.update()
 *   grid(ctx, { M: ground, size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
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
 * A keyframe track of poses that plays by itself while the host ticks.
 * @function poseTrack
 * @memberof Host
 * @param {object} [opts]
 * @param {boolean|object} [opts.handles]  Draggable keyframe handles.
 * @returns {PoseTrack}
 * @example
 * <caption>A pose track with handles: drag a keyframe's dot and the yellow path reshapes through it while the frame keeps riding it.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, trackPath, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 200, 330] })
 * const track = canvasHost.poseTrack({ handles: true })
 * track.add([{ pos: [-100, 0, 0] }, { pos: [0, 60, -60] }, { pos: [100, 0, 0] }])
 * track.play({ duration: 60, loop: true, bounce: true })
 * const M = tree.mat4()
 *
 * function frame() {
 *   canvasHost.tick(1 / 60)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   track.handles.update()
 *   trackPath(ctx, track, { bits: tree.PATH | tree.HANDLES, color: [1, 0.82, 0.4, 1] })
 *   axes(ctx, { M: track.mat4Model(M), size: 30 })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * A keyframe track of camera states that writes into `cam` while it plays.
 * @function cameraTrack
 * @memberof Host
 * @param {object} cam  The camera state driven.
 * @param {object} [opts]
 * @param {boolean|object} [opts.handles]  Draggable keyframe handles.
 * @returns {CameraTrack}
 * @example
 * <caption>The canvas looks through the camera state the track writes into as it plays: the view swings between three keyframes around the axes and back.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, grid, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const cam = tree.createCamera()
 * const track = canvasHost.cameraTrack(cam)
 * const key = (eye) => ({ eye, center: [0, 0, 0], fov: Math.PI / 3, near: 20, far: 1000 })
 * track.add([key([-250, 120, 150]), key([0, 250, 250]), key([250, 120, 150])])
 * track.play({ duration: 120, loop: true, bounce: true })
 *
 * function frame() {
 *   canvasHost.tick(1 / 60)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   grid(ctx, { M: ground, size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
 *   axes(ctx, { size: 60 })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * A helm: integrates a 6-DOF device's rates into a pose and drives the target bound with `bind(target)` — a camera state, a `{ pos, rot }` or a `{ get, set }`.
 * @function poseHelm
 * @memberof Host
 * @param {object} [opts]
 * @param {string|ArrayLike<number>} [opts.from=tree.WORLD]  The frame rates act in: `tree.WORLD`, `tree.EYE`, `tree.SELF` or a matrix.
 * @param {number} [opts.deadzone]  Rates below it read as zero.
 * @param {object} [opts.bind]  The target, bound at creation.
 * @returns {PoseHelm} The helm, with `bind(target)` and `dispose()`.
 * @example
 * <caption>A helm fed a synthetic push — sideways back and forth, and a steady turn — integrates it into the pose it is bound to: the frame drawn from that pose sways and spins, and the corner rig lights the channels being fed.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, helmRig, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 150, 300] })
 * const pose = { pos: tree.vec3(), rot: tree.quat() }
 * const helm = canvasHost.poseHelm({ bind: pose })
 * const lin = tree.vec3(), ang = tree.vec3(), M = tree.mat4()
 *
 * function frame() {
 *   const t = canvasHost.clock()
 *   lin[0] = 200 * Math.cos(t); ang[1] = 150
 *   helm.feed(lin, ang)
 *   canvasHost.tick(1 / 60)
 *   tree.mat4FromTRS(M, ...pose.pos, ...pose.rot, 1, 1, 1)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   axes(ctx, { M, size: 50 })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   helmRig(ctx, helm, { x: 330, y: 10, size: 60 })
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * A helm that flies a camera state body-relative.
 * @function cameraHelm
 * @memberof Host
 * @param {object} cam  The camera state flown.
 * @param {object} [opts]
 * @param {number} [opts.deadzone]  Rates below it read as zero.
 * @returns {PoseHelm} The helm, with `dispose()`.
 * @example
 * <caption>A camera helm fed a synthetic yaw, alternating left and right, turns the camera state it flies in place: the view pans across the axes and back.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, grid, helmRig, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const cam = tree.createCamera({ eye: [0, 100, 300] })
 * const helm = canvasHost.cameraHelm(cam)
 * const lin = tree.vec3(), ang = tree.vec3()
 *
 * function frame() {
 *   ang[1] = 300 * Math.sin(canvasHost.clock())
 *   helm.feed(lin, ang)
 *   canvasHost.tick(1 / 60)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   grid(ctx, { M: ground, size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
 *   axes(ctx, { size: 60 })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   helmRig(ctx, helm, { x: 330, y: 10, size: 60 })
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * A WebHID 6-DOF device — a SpaceMouse by default — feeding a helm.
 * @function hid
 * @memberof Host
 * @param {object} [opts]
 * @param {object} [opts.bind]  The helm fed.
 * @returns {object} The stream.
 * @example
 * <caption>In a Chromium-based browser (WebHID) with a 3Dconnexion SpaceMouse: click connect, pick the device, and push or twist the cap — the camera helm the stream feeds flies the view and the corner rig lights each channel; home puts the camera back where it started.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, grid, helmRig, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const cam = tree.createCamera({ eye: [0, 100, 300] })
 * const helm = canvasHost.cameraHelm(cam)
 * const stream = canvasHost.hid({ bind: helm })
 * const start = tree.cameraCopy(tree.createCamera(), cam), pose = { pos: tree.vec3(), rot: tree.quat() }
 * const button = (text, left, onclick) => {
 *   const b = document.body.appendChild(document.createElement('button'))
 *   b.textContent = text; b.style.cssText = 'position:absolute;top:8px;left:' + left + 'px'; b.onclick = onclick
 *   return b
 * }
 * const connect = button('connect', 8, () => stream.connect())
 * if (!stream.available) { connect.textContent = 'WebHID unavailable'; connect.disabled = true }
 * button('home', 170, () => { tree.cameraCopy(cam, start); helm.home(tree.cameraToPose(pose, cam)) })
 *
 * function frame() {
 *   canvasHost.tick(1 / 60)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   grid(ctx, { M: ground, size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
 *   axes(ctx, { size: 60 })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   helmRig(ctx, helm, { x: 330, y: 10, size: 60 })
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * A gamepad feeding a helm, polled every tick.
 * @function gamepad
 * @memberof Host
 * @param {object} [opts]
 * @param {number} [opts.index=0]  Which gamepad.
 * @param {object} [opts.bind]  The helm fed.
 * @returns {object} The stream.
 * @example
 * <caption>With a gamepad connected — press a button once so the browser exposes it — the sticks and triggers feed the camera helm: the view flies, and the corner rig lights each channel.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, grid, helmRig, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const cam = tree.createCamera({ eye: [0, 100, 300] })
 * const helm = canvasHost.cameraHelm(cam)
 * canvasHost.gamepad({ bind: helm })
 *
 * function frame() {
 *   canvasHost.tick(1 / 60)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   grid(ctx, { M: ground, size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
 *   axes(ctx, { size: 60 })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   helmRig(ctx, helm, { x: 330, y: 10, size: 60 })
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Fetch an image as an ImageBitmap, ready for `texture`.
 * @function image
 * @memberof Host
 * @param {string} url
 * @param {object} [opts]
 * @returns {Promise<ImageBitmap>}
 * @example
 * <caption>An image fetched from a URL — here a data URL drawn a moment before, a magenta disc on yellow — becomes the texture on the turning pane once it arrives.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, texture, pane, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 0, 300] })
 * const drawing = document.createElement('canvas')
 * drawing.width = drawing.height = 128
 * const g = drawing.getContext('2d')
 * g.fillStyle = '#ffd166'; g.fillRect(0, 0, 128, 128)
 * g.fillStyle = '#ff4fd8'; g.beginPath(); g.arc(64, 64, 44, 0, 2 * Math.PI); g.fill()
 * let tex = null
 * canvasHost.image(drawing.toDataURL()).then((bitmap) => { tex = texture(ctx, bitmap) })
 * const M = tree.mat4(), q = tree.quat()
 *
 * function frame() {
 *   tree.mat4FromTRS(M, 0, 0, 0, ...tree.qFromAxisAngle(q, 0, 1, 0, 0.6 * Math.sin(canvasHost.clock())), 1, 1, 1)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   if (tex) pane(ctx, [-100, 100, 0], [100, 100, 0], [100, -100, 0], [-100, -100, 0], { M, texture: tex })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * A hidden, muted video from a file or the user's camera, a texture source that `upload` refreshes.
 * @function video
 * @memberof Host
 * @param {object} opts
 * @param {string} [opts.src]  A video file.
 * @param {boolean|object} [opts.camera]  The user's camera instead: true, or getUserMedia video constraints.
 * @param {boolean} [opts.loop]
 * @returns {Video}
 * @example
 * <caption>Allow the camera: once its video is ready, a texture uploaded from it every frame shows you, live, on the pane.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, texture, upload, pane, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 0, 300] })
 * const video = canvasHost.video({ camera: true })
 * let tex = null
 * video.ready.then(() => { tex = texture(ctx, video.el) })
 *
 * function frame() {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   if (tex) {
 *     upload(ctx, tex, video.el)
 *     pane(ctx, [-160, 120, 0], [160, 120, 0], [160, -120, 0], [-160, -120, 0], { texture: tex })
 *   }
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Draw with the 2D canvas API into a texture source.
 * @function raster
 * @memberof Host
 * @param {function(CanvasRenderingContext2D, number, number):void} draw  Called with the context, w and h.
 * @param {number} w
 * @param {number} h
 * @param {object} [opts]
 * @returns {ImageBitmap|HTMLCanvasElement}
 * @example
 * <caption>Text drawn with the 2D canvas API — “webgl.tree” in magenta on white — rasterized once and textured onto the pane, upright.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, texture, pane, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 0, 300] })
 * const source = canvasHost.raster((g, w, h) => {
 *   g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h)
 *   g.fillStyle = '#ff4fd8'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
 *   g.fillText('webgl.tree', w / 2, h / 2)
 * }, 320, 96)
 * const tex = texture(ctx, source)
 *
 * ctx.backend.bindTarget(ctx, scene)
 * ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 * setCamera(ctx, cam)
 * pane(ctx, [-160, 48, 0], [160, 48, 0], [160, -48, 0], [-160, -48, 0], { texture: tex })
 * ctx.backend.bindTarget(ctx, SCREEN)
 * image(ctx, scene.color)
 * endFrame(ctx)
 */

/**
 * Fetch one mesh — the arrays shape `{ position, indices, normal?, texcoord?, … }` with its `bounds` beside them — from an OBJ file, a one-part glTF file, or any format through `opts.parse`; `buffer` uploads it as it is. A file of several parts rejects, naming `model`.
 * @function mesh
 * @memberof Host
 * @param {string} url
 * @param {{ format?:string, parse?:function, normals?:'smooth'|'flat'|false, fetch?:object }} [opts]  normals: left out, the file's are kept and a mesh without any gets smooth ones; 'smooth' and 'flat' always recompute; false computes nothing.
 * @returns {Promise<object>} The mesh.
 * @example
 * <caption>models/torus.obj, fetched into a mesh and uploaded once it arrives: the yellow torus turns, lit by the file's own normals.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, bind, buffer, draw, program, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 160, 192] })
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
 * let torus = null, prog = null
 * canvasHost.mesh('models/torus.obj').then((mesh) => {
 *   torus = buffer(ctx, mesh)
 *   prog = program(ctx, WGSL, { buffers: torus.bufferLayouts })   // the pipeline bakes the mesh's vertex layout
 * })
 * const M = tree.mat4(), q = tree.quat()
 *
 * function frame() {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   if (torus) {
 *     bind(ctx, prog, { uColor: [1, 0.82, 0.4] })
 *     draw(ctx, torus, tree.mat4FromTRS(M, 0, 0, 0, ...tree.qFromAxisAngle(q, 1, 0, 0, canvasHost.clock()), 1, 1, 1))
 *   }
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Fetch a model with its structure — `{ parts: [{ name, node, skin, mesh, targets, color }], nodes, skins, clips }` — what a rig, morph targets or animation need: each part's `mesh` is as `mesh` returns it, `targets` are morph deltas, and `nodes`, `skins` and `clips` feed `tree.clipSample`, `tree.poseBlend`, `tree.poseWorld` and `tree.jointPalette` as they are. A single mesh is `mesh`'s.
 * @function model
 * @memberof Host
 * @param {string} url
 * @param {{ format?:string, parse?:function, normals?:'smooth'|'flat'|false, fetch?:object }} [opts]
 * @returns {Promise<object>} The model.
 * @example
 * <caption>The same file read with its structure: every part uploaded, then drawn under its node's world matrix from the rest pose — one part and one node for an OBJ file, as many as a glTF file holds.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, bind, buffer, draw, program, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 160, 192] })
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
 * let parts = [], world = null
 * canvasHost.model('models/torus.obj', { normals: 'flat' }).then((model) => {
 *   parts = model.parts.map((part) => {
 *     const buf = buffer(ctx, part.mesh)
 *     return { ...part, buf, prog: program(ctx, WGSL, { buffers: buf.bufferLayouts }) }   // a pipeline per part's layout
 *   })
 *   world = tree.poseWorld(new Float32Array(16 * model.nodes.parents.length), model.nodes.rest, model.nodes.parents)
 * })
 *
 * function frame() {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   tree.cameraOrbit(cam, 0.01, 0)
 *   setCamera(ctx, cam)
 *   for (const part of parts) {
 *     bind(ctx, part.prog, { uColor: part.color.slice(0, 3) })
 *     draw(ctx, part.buf, world.subarray(16 * part.node, 16 * part.node + 16))
 *   }
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The label layer: HTML text pinned to world points or screen pixels over the canvas, made on first use.
 * @constant {Labels} labels
 * @memberof Host
 */

/**
 * An orbit: dragging rotates `cam` about its center, two fingers pan, the wheel and a pinch dolly — only the pointer no handle grabbed.
 * @function orbit
 * @memberof Host
 * @param {object} cam  The camera state moved.
 * @param {object} [opts]
 * @param {number} [opts.rotate=0.005]  Radians per pixel.
 * @param {number} [opts.damping=0.2]  The lag's time constant in seconds: the camera trails the gesture by about that much and, after a release, completes what the finger did, a flick easing out; 0 makes the orbit exact.
 * @param {number} [opts.minDistance]
 * @param {number} [opts.maxDistance]
 * @returns {Orbit}
 * @example
 * <caption>Drag to orbit: with the default damping of 0.2 s the axes trail the pointer and complete the drag after the release, a flick easing out; a fresh touch stops them where they are, and a scroll's dolly eases the same way. damping: 0 would make them exact.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, grid, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const cam = tree.createCamera({ eye: [0, 150, 300] })
 * const orbit = canvasHost.orbit(cam, { minDistance: 150, maxDistance: 600 })
 *
 * function frame() {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   orbit.update()
 *   grid(ctx, { M: ground, size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
 *   axes(ctx, { size: 50 })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 * @example
 * <caption>Drag to orbit the camera state around the axes, scroll to dolly — but grabbing the magenta dot drags the handle instead, the orbit leaving that pointer alone.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, grid, handleLocus, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const cam = tree.createCamera({ eye: [0, 150, 300] })
 * const orbit = canvasHost.orbit(cam, { minDistance: 150, maxDistance: 600 })
 * const h = canvasHost.handle({ constraint: tree.SPHERE, anchor: [0, 0, 0], radius: 70 })
 *
 * function frame() {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   if (!h.update()) orbit.update()
 *   grid(ctx, { M: ground, size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
 *   axes(ctx, { size: 50 })
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
 * Stop the loop, remove every listener and dispose everything the host made.
 * @function dispose
 * @memberof Host
 * @example
 * <caption>Drag to orbit, then click the button: the host is disposed with its orbit, and dragging moves nothing any more.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, grid, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const cam = tree.createCamera({ eye: [0, 150, 300] })
 * const orbit = canvasHost.orbit(cam)
 * let alive = true
 * const button = document.body.appendChild(document.createElement('button'))
 * button.textContent = 'dispose'
 * button.style.cssText = 'position:absolute;left:8px;top:8px'
 * button.onclick = () => { if (alive) { canvasHost.dispose(); alive = false } }
 *
 * function frame() {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   if (alive) orbit.update()
 *   grid(ctx, { M: ground, size: 100, subdivisions: 10, color: alive ? [1, 1, 1, 1] : [1, 0.31, 0.85, 1] })
 *   axes(ctx, { size: 50 })
 *   if (alive) canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Apply this frame's unclaimed drags and wheel to the camera state; call after the handles' updates.
 * @function update
 * @memberof Orbit
 * @returns {boolean} Whether the camera moved.
 * @example
 * <caption>Drag to orbit: the grid is drawn yellow on every frame update() reports that it moved the camera, white when it did not.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, grid, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const cam = tree.createCamera({ eye: [0, 150, 300] })
 * const orbit = canvasHost.orbit(cam)
 *
 * function frame() {
 *   const moved = orbit.update()
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   grid(ctx, { M: ground, size: 100, subdivisions: 10, color: moved ? [1, 0.82, 0.4, 1] : [1, 1, 1, 1] })
 *   axes(ctx, { size: 50 })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Restore the camera state the orbit started from.
 * @function home
 * @memberof Orbit
 * @example
 * <caption>Drag to orbit anywhere you like, then double-click: home() puts the camera back where it started.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, grid, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const cam = tree.createCamera({ eye: [0, 150, 300] })
 * const orbit = canvasHost.orbit(cam)
 * canvas.addEventListener('dblclick', () => orbit.home())
 *
 * function frame() {
 *   orbit.update()
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   grid(ctx, { M: ground, size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
 *   axes(ctx, { size: 50 })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Remove the orbit's listeners.
 * @function dispose
 * @memberof Orbit
 * @example
 * <caption>Drag to orbit, then click the button: the orbit is disposed, dragging stops turning the view, and the rest of the host keeps running — the axes keep spinning.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, grid, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const cam = tree.createCamera({ eye: [0, 150, 300] })
 * let orbit = canvasHost.orbit(cam)
 * const button = document.body.appendChild(document.createElement('button'))
 * button.textContent = 'dispose orbit'
 * button.style.cssText = 'position:absolute;left:8px;top:8px'
 * button.onclick = () => { if (orbit) { orbit.dispose(); orbit = null } }
 * const M = tree.mat4(), q = tree.quat()
 *
 * function frame() {
 *   if (orbit) orbit.update()
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   grid(ctx, { M: ground, size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
 *   axes(ctx, { M: tree.mat4FromTRS(M, 0, 0, 0, ...tree.qFromAxisAngle(q, 0, 1, 0, canvasHost.clock()), 1, 1, 1), size: 50 })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Pin a label to a world point; it follows the point every `tick()`.
 * @function set
 * @memberof Labels
 * @param {string} id
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {object} [opts]
 * @param {number} [opts.dx]  Pixel offset x.
 * @param {number} [opts.dy]  Pixel offset y.
 * @returns {object}
 * @example
 * <caption>Three labels pinned each frame to the tips of the turning axes — x, y and z — follow them around.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * document.head.appendChild(document.createElement('style')).textContent = '.host-label { color: white; font: 14px monospace }'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const M = tree.mat4(), q = tree.quat(), tip = tree.vec3()
 *
 * function frame() {
 *   tree.mat4FromTRS(M, 0, 0, 0, ...tree.qFromAxisAngle(q, 0, 1, 0, canvasHost.clock()), 1, 1, 1)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   axes(ctx, { M, size: 80, bits: tree.X | tree.Y | tree.Z })
 *   ;[[110, 0, 0, 'x'], [0, 110, 0, 'y'], [0, 0, 110, 'z']].forEach(([x, y, z, name]) => {
 *     tree.mat4MulPoint(tip, M, x, y, z)
 *     canvasHost.labels.set(name, name, tip[0], tip[1], tip[2])
 *   })
 *   canvasHost.labels.tick()
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Place a label at logical pixels, y down.
 * @function setScreen
 * @memberof Labels
 * @param {string} id
 * @param {string} text
 * @param {number} sx
 * @param {number} sy
 * @param {object} [opts]
 * @returns {object}
 * @example
 * <caption>Move the pointer over the canvas: a label set at the pointer's logical pixels, 18 above it, names its position and follows it.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, grid, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * document.head.appendChild(document.createElement('style')).textContent = '.host-label { color: white; font: 14px monospace }'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 0, 300] })
 * canvas.addEventListener('pointermove', (e) => {
 *   const x = Math.round(e.offsetX), y = Math.round(e.offsetY)
 *   canvasHost.labels.setScreen('at', x + ', ' + y, x, y, { dy: -18 })
 * })
 *
 * function frame() {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   grid(ctx, { size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
 *   canvasHost.labels.tick()
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Remove a label.
 * @function remove
 * @memberof Labels
 * @param {string} id
 * @example
 * <caption>Click the canvas: each click removes one of the labels on the turning axes' tips — z, then y, then x.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * document.head.appendChild(document.createElement('style')).textContent = '.host-label { color: white; font: 14px monospace }'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const M = tree.mat4(), q = tree.quat(), tip = tree.vec3()
 * const shown = [[110, 0, 0, 'x'], [0, 110, 0, 'y'], [0, 0, 110, 'z']]
 * canvas.addEventListener('click', () => { const gone = shown.pop(); if (gone) canvasHost.labels.remove(gone[3]) })
 *
 * function frame() {
 *   tree.mat4FromTRS(M, 0, 0, 0, ...tree.qFromAxisAngle(q, 0, 1, 0, canvasHost.clock()), 1, 1, 1)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   axes(ctx, { M, size: 80, bits: tree.X | tree.Y | tree.Z })
 *   shown.forEach(([x, y, z, name]) => {
 *     tree.mat4MulPoint(tip, M, x, y, z)
 *     canvasHost.labels.set(name, name, tip[0], tip[1], tip[2])
 *   })
 *   canvasHost.labels.tick()
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Remove every label.
 * @function clear
 * @memberof Labels
 * @example
 * <caption>Click the canvas: clear() removes all three labels at once; a second click sets them again.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * document.head.appendChild(document.createElement('style')).textContent = '.host-label { color: white; font: 14px monospace }'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const M = tree.mat4(), q = tree.quat(), tip = tree.vec3()
 * let labelled = true
 * canvas.addEventListener('click', () => { labelled = !labelled; if (!labelled) canvasHost.labels.clear() })
 *
 * function frame() {
 *   tree.mat4FromTRS(M, 0, 0, 0, ...tree.qFromAxisAngle(q, 0, 1, 0, canvasHost.clock()), 1, 1, 1)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   axes(ctx, { M, size: 80, bits: tree.X | tree.Y | tree.Z })
 *   if (labelled) [[110, 0, 0, 'x'], [0, 110, 0, 'y'], [0, 0, 110, 'z']].forEach(([x, y, z, name]) => {
 *     tree.mat4MulPoint(tip, M, x, y, z)
 *     canvasHost.labels.set(name, name, tip[0], tip[1], tip[2])
 *   })
 *   canvasHost.labels.tick()
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Reposition the world labels through the installed camera; once per frame, after `setCamera`.
 * @function tick
 * @memberof Labels
 * @returns {object}
 * @example
 * <caption>A label pinned once, at setup, to (0, 100, 0): while tick() runs it stays on the top of the green axis as the camera orbits; click to stop ticking and the label freezes on screen while the view keeps moving.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * document.head.appendChild(document.createElement('style')).textContent = '.host-label { color: white; font: 14px monospace }'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * canvasHost.labels.set('top', 'top of y', 0, 100, 0, { dy: -12 })
 * let ticking = true
 * canvas.addEventListener('click', () => { ticking = !ticking })
 *
 * function frame() {
 *   tree.cameraOrbit(cam, 0.01, 0)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   axes(ctx, { size: 100, bits: tree.X | tree.Y | tree.Z })
 *   if (ticking) canvasHost.labels.tick()
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Start playback.
 * @function start
 * @memberof Video
 * @returns {Promise<void>}
 * @example
 * <caption>Allow the camera, then click the canvas to pause and click again to start(): the pane's live image freezes and resumes.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, texture, upload, pane, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 0, 300] })
 * const video = canvasHost.video({ camera: true })
 * let tex = null
 * video.ready.then(() => { tex = texture(ctx, video.el) })
 * canvas.addEventListener('click', () => (video.el.paused ? video.start() : video.stop()))
 *
 * function frame() {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   if (tex) {
 *     upload(ctx, tex, video.el)
 *     pane(ctx, [-160, 120, 0], [160, 120, 0], [160, -120, 0], [-160, -120, 0], { texture: tex })
 *   }
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Pause.
 * @function stop
 * @memberof Video
 * @example
 * <caption>Allow the camera: from the moment its video is ready, stop() and start() alternate every two seconds, and the pane's live image moves for two seconds, then holds still for two.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, texture, upload, pane, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 0, 300] })
 * const video = canvasHost.video({ camera: true })
 * let tex = null, readyAt = 0, still = false, shown = false
 * video.ready.then(() => { tex = texture(ctx, video.el); readyAt = canvasHost.clock() })
 *
 * function frame() {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   if (tex) {
 *     const wanted = Math.floor((canvasHost.clock() - readyAt) / 2) % 2 === 1
 *     if (wanted !== still) { still = wanted; still ? video.stop() : video.start() }
 *     if (!still && video.el.readyState >= 2) { upload(ctx, tex, video.el); shown = true }   // a decoded frame, fresh while playing
 *     if (shown) pane(ctx, [-160, 120, 0], [160, 120, 0], [160, -120, 0], [-160, -120, 0], { texture: tex })
 *   }
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Stop, release the camera and detach the element.
 * @function dispose
 * @memberof Video
 * @example
 * <caption>Allow the camera, then click the canvas: dispose() releases it — the browser's camera indicator turns off and the pane keeps the last frame it received.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, texture, upload, pane, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 0, 300] })
 * const video = canvasHost.video({ camera: true })
 * let tex = null, live = true
 * video.ready.then(() => { tex = texture(ctx, video.el) })
 * canvas.addEventListener('click', () => { if (live) { video.dispose(); live = false } })
 *
 * function frame() {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   if (tex) {
 *     if (live) upload(ctx, tex, video.el)
 *     pane(ctx, [-160, 120, 0], [160, 120, 0], [160, -120, 0], [-160, -120, 0], { texture: tex })
 *   }
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Reset the helm's pose: to the one given, or to the identity.
 * @function home
 * @memberof PoseHelm
 * @param {{ pos?: ArrayLike<number>, rot?: ArrayLike<number> }} [pose]  Identity when omitted.
 * @returns {PoseHelm}
 * @example
 * <caption>A helm fed a steady synthetic push drifts its frame away along x, turning; click the canvas and home() brings the frame back to the origin, unturned, to drift again.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 150, 330] })
 * const pose = { pos: tree.vec3(), rot: tree.quat() }
 * const helm = canvasHost.poseHelm({ bind: pose })
 * const lin = [60, 0, 0], ang = [0, 60, 0], M = tree.mat4()
 * canvas.addEventListener('click', () => helm.home())
 *
 * function frame() {
 *   helm.feed(lin, ang)
 *   canvasHost.tick(1 / 60)
 *   tree.mat4FromTRS(M, ...pose.pos, ...pose.rot, 1, 1, 1)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   axes(ctx, { size: 30, semantic: false, color: [1, 1, 1, 1] })
 *   axes(ctx, { M, size: 40 })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The helm's current pose.
 * @function eval
 * @memberof PoseHelm
 * @param {{ pos: number[], rot: number[] }} [out]
 * @returns {{ pos: number[], rot: number[] }} out
 * @example
 * <caption>A helm fed a synthetic sway drives a bound pose; eval() reads the same pose back out, and the yellow copy of the frame drawn from it, 60 above, moves in step with the original.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 150, 330] })
 * const pose = { pos: tree.vec3(), rot: tree.quat() }, read = { pos: tree.vec3(), rot: tree.quat() }
 * const helm = canvasHost.poseHelm({ bind: pose })
 * const lin = tree.vec3(), ang = tree.vec3(), M = tree.mat4(), R = tree.mat4()
 *
 * function frame() {
 *   const t = canvasHost.clock()
 *   lin[0] = 200 * Math.cos(t); ang[1] = 100
 *   helm.feed(lin, ang)
 *   canvasHost.tick(1 / 60)
 *   helm.eval(read)
 *   tree.mat4FromTRS(M, ...pose.pos, ...pose.rot, 1, 1, 1)
 *   tree.mat4FromTRS(R, read.pos[0], read.pos[1] + 60, read.pos[2], ...read.rot, 1, 1, 1)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   axes(ctx, { M, size: 40 })
 *   axes(ctx, { M: R, size: 40, semantic: false, color: [1, 0.82, 0.4, 1] })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The six live channel rates `[Tx, Ty, Tz, Rp, Ry, Rr]`, after deadzone and sensitivity.
 * @function activity
 * @memberof PoseHelm
 * @param {number[]} out6  6-element destination.
 * @returns {number[]} out6
 * @example
 * <caption>A helm fed a synthetic signal that cycles through its six channels: six white crosses along the bottom rise with the rates activity() reports, one channel at a time.</caption>
 * import { init, endFrame, setCamera, beginHUD, endHUD, cross, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const cam = tree.createCamera({ eye: [0, 0, 300] })
 * const helm = canvasHost.poseHelm({ bind: { pos: tree.vec3(), rot: tree.quat() } })
 * const lin = tree.vec3(), ang = tree.vec3(), rates = [0, 0, 0, 0, 0, 0]
 *
 * function frame() {
 *   const t = canvasHost.clock(), channel = Math.floor(t) % 6, push = 200 * Math.sin(Math.PI * (t % 1))
 *   lin.fill(0); ang.fill(0)
 *   if (channel < 3) lin[channel] = push; else ang[channel - 3] = push
 *   helm.feed(lin, ang)
 *   canvasHost.tick(1 / 60)
 *   helm.activity(rates)
 *   const peak = Math.max(1, ...rates.map(Math.abs))
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   beginHUD(ctx)
 *   rates.forEach((r, i) => cross(ctx, { x: 75 + 50 * i, y: 250 - 150 * Math.abs(r) / peak, size: 16, color: [1, 1, 1, 1] }))
 *   endHUD(ctx)
 *   canvasHost.pointer.flush()
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */
