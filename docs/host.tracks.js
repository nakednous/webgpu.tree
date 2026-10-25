/**
 * @file Tracks — keyframed poses and camera states, interpolated and played.
 * @module host.tracks
 * @license AGPL-3.0-only
 *
 * `canvasHost.poseTrack()` and `canvasHost.cameraTrack(cam)` make tracks the
 * host plays: add keyframes, `play()`, and each frame `canvasHost.tick(dt)`
 * advances every playing track — a camera track writes straight into its
 * camera state. Positions follow a smooth curve through the keyframes,
 * rotations interpolate spherically. Both tracks share the transport —
 * `play`, `stop`, `seek`, `time`, `info`, `remove`, `reset` — listed under
 * PoseTrack. `trackPath` draws either.
 */

'use strict';

/**
 * trackPath bit: the interpolated path.
 * @constant {number} PATH
 * @memberof tree
 */

/**
 * trackPath bit: the keyframes' control points.
 * @constant {number} CONTROLS
 * @memberof tree
 */

/**
 * trackPath bit: the tangents at each keyframe.
 * @constant {number} TANGENTS
 * @memberof tree
 */

/**
 * trackPath bit, camera tracks: the path of the centers.
 * @constant {number} CENTER
 * @memberof tree
 */

/**
 * trackPath bit: the track's draggable keyframe handles.
 * @constant {number} HANDLES
 * @memberof tree
 */

/**
 * Append keyframes: one `{ pos, rot, scl }` or an array of them.
 * @function add
 * @memberof PoseTrack
 * @param {object|object[]} spec  `pos: [x, y, z]`, `rot: [x, y, z, w]`, `scl: [x, y, z]`; missing fields take the identity.
 * @param {object} [opts]
 * @param {boolean} [opts.deduplicate]  Skip a keyframe equal to the last.
 * @example
 * <caption>Click the canvas: each click adds a keyframe at a random spot, and the yellow path, with a small frame at every keyframe, grows through it.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, grid, trackPath, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 200, 330] })
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const track = canvasHost.poseTrack()
 * const random = () => 200 * Math.random() - 100
 * track.add([{ pos: [-100, 0, 0] }, { pos: [100, 0, 0] }])
 * canvas.addEventListener('click', () => track.add({ pos: [random(), 60 * Math.random(), random()] }))
 *
 * function frame() {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   grid(ctx, { M: ground, size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
 *   trackPath(ctx, track, { bits: tree.PATH, color: [1, 0.82, 0.4, 1] })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Replace the keyframe at an index, or append at the end.
 * @function set
 * @memberof PoseTrack
 * @param {number} index
 * @param {object} spec
 * @returns {boolean}
 * @example
 * <caption>The middle keyframe is set to a new height every frame, rising and falling: the yellow path reshapes through it.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, grid, trackPath, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 150, 330] })
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const track = canvasHost.poseTrack()
 * track.add([{ pos: [-100, 0, 0] }, { pos: [0, 0, 0] }, { pos: [100, 0, 0] }])
 *
 * function frame(ms) {
 *   track.set(1, { pos: [0, 80 * Math.sin(ms / 1000), 0] })
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   grid(ctx, { M: ground, size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
 *   trackPath(ctx, track, { bits: tree.PATH, color: [1, 0.82, 0.4, 1] })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Remove the keyframe at an index.
 * @function remove
 * @memberof PoseTrack
 * @param {number} index
 * @returns {boolean}
 * @example
 * <caption>Click the button: each click removes the last keyframe and the yellow path loses its last stretch.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, grid, trackPath, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 200, 330] })
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const track = canvasHost.poseTrack()
 * track.add([-100, -50, 0, 50, 100].map((x, i) => ({ pos: [x, 0, i % 2 ? -60 : 60] })))
 * const button = document.body.appendChild(document.createElement('button'))
 * button.textContent = 'remove last'
 * button.style.cssText = 'position:absolute;left:8px;top:8px'
 * button.onclick = () => track.remove(track.keyframes.length - 1)
 *
 * function frame() {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   grid(ctx, { M: ground, size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
 *   trackPath(ctx, track, { bits: tree.PATH, color: [1, 0.82, 0.4, 1] })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Remove every keyframe and stop.
 * @function reset
 * @memberof PoseTrack
 * @returns {PoseTrack}
 * @example
 * <caption>Every three seconds the track resets and refills, one keyframe every half second around a circle: the yellow path vanishes and grows again.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, grid, trackPath, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 250, 250] })
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const track = canvasHost.poseTrack()
 *
 * function frame(ms) {
 *   const n = Math.floor((ms % 3000) / 500) + 1
 *   if (n < track.keyframes.length) track.reset()
 *   while (track.keyframes.length < n) {
 *     const a = track.keyframes.length * Math.PI / 3
 *     track.add({ pos: [90 * Math.cos(a), 0, 90 * Math.sin(a)] })
 *   }
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   grid(ctx, { M: ground, size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
 *   trackPath(ctx, track, { bits: tree.PATH, color: [1, 0.82, 0.4, 1] })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Play, or change how it plays.
 * @function play
 * @memberof PoseTrack
 * @param {number|object} [rateOrOpts]  A rate, or options.
 * @param {number} [rateOrOpts.duration=30]  Frames per segment.
 * @param {boolean} [rateOrOpts.loop]
 * @param {boolean} [rateOrOpts.bounce]  Play back and forth.
 * @param {number} [rateOrOpts.rate=1]
 * @param {function} [rateOrOpts.onEnd]
 * @returns {PoseTrack}
 * @example
 * <caption>Played back and forth, 60 frames per segment, as the host ticks: the frame drawn from eval() rides the yellow path, turning as the keyframes do.</caption>
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
 * track.add([
 *   { pos: [-100, 0, 0] },
 *   { pos: [0, 60, -60], rot: tree.qFromAxisAngle(tree.quat(), 0, 1, 0, Math.PI / 2) },
 *   { pos: [100, 0, 0], rot: tree.qFromAxisAngle(tree.quat(), 0, 1, 0, Math.PI) },
 * ])
 * track.play({ duration: 60, loop: true, bounce: true })
 * const pose = { pos: tree.vec3(), rot: tree.quat(), scl: tree.vec3() }, M = tree.mat4()
 *
 * function frame() {
 *   canvasHost.tick(1 / 60)
 *   track.eval(pose)
 *   tree.mat4FromTRS(M, ...pose.pos, ...pose.rot, ...pose.scl)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   trackPath(ctx, track, { bits: tree.PATH, color: [1, 0.82, 0.4, 1] })
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
 * Stop playing.
 * @function stop
 * @memberof PoseTrack
 * @param {boolean} [rewind]  Also seek back to the end playback started from.
 * @returns {PoseTrack}
 * @example
 * <caption>Click the canvas to stop the frame riding the path where it is; click again to play on from there.</caption>
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
 * canvas.addEventListener('click', () => (track.playing ? track.stop() : track.play()))
 * const M = tree.mat4()
 *
 * function frame() {
 *   canvasHost.tick(1 / 60)
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
 * Move the playhead.
 * @function seek
 * @memberof PoseTrack
 * @param {number} t  0–1 across the whole track, or within segment `segIndex`.
 * @param {number} [segIndex]
 * @returns {PoseTrack}
 * @example
 * <caption>Move the pointer across the canvas: its x seeks the playhead from the start of the path at the left edge to its end at the right, and the frame follows.</caption>
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
 * canvas.addEventListener('pointermove', (e) => track.seek(e.offsetX / canvas.clientWidth))
 * const M = tree.mat4()
 *
 * function frame() {
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
 * The playhead's position, 0–1 across the whole track.
 * @function time
 * @memberof PoseTrack
 * @returns {number}
 * @example
 * <caption>As the frame plays along the path, the white bulls-eye slides along the bottom of the canvas to match: left at the path's start, right at its end.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, trackPath, beginHUD, endHUD, bullsEye, tree, host } from 'webgpu.tree'
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
 * track.play({ duration: 90, loop: true, bounce: true })
 * const M = tree.mat4()
 *
 * function frame() {
 *   canvasHost.tick(1 / 60)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   trackPath(ctx, track, { bits: tree.PATH, color: [1, 0.82, 0.4, 1] })
 *   axes(ctx, { M: track.mat4Model(M), size: 40 })
 *   beginHUD(ctx)
 *   bullsEye(ctx, { x: 40 + 320 * track.time(), y: 275, size: 20, color: [1, 1, 1, 1] })
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
 * The transport's state: keyframes, segments, playing, loop, bounce, rate, duration, time.
 * @function info
 * @memberof PoseTrack
 * @returns {object}
 * @example
 * <caption>Click the canvas to pause and resume: the path is drawn yellow while info() reports playing, white while paused.</caption>
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
 * canvas.addEventListener('click', () => (track.info().playing ? track.stop() : track.play()))
 * const M = tree.mat4()
 *
 * function frame() {
 *   canvasHost.tick(1 / 60)
 *   const playing = track.info().playing
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   trackPath(ctx, track, { bits: tree.PATH, color: playing ? [1, 0.82, 0.4, 1] : [1, 1, 1, 1] })
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
 * The pose at the playhead.
 * @function eval
 * @memberof PoseTrack
 * @param {object} [out]  Destination `{ pos, rot, scl }`.
 * @returns {{ pos: number[], rot: number[], scl: number[] }} out
 * @example
 * <caption>The pose evaluated at the playhead, position, rotation and scale, builds the frame's model matrix: the frame grows to twice its size on the way to the last keyframe and turns a half turn.</caption>
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
 * track.add([
 *   { pos: [-100, 0, 0] },
 *   { pos: [100, 0, 0], rot: tree.qFromAxisAngle(tree.quat(), 0, 1, 0, Math.PI), scl: [2, 2, 2] },
 * ])
 * track.play({ duration: 120, loop: true, bounce: true })
 * const pose = { pos: tree.vec3(), rot: tree.quat(), scl: tree.vec3() }, M = tree.mat4()
 *
 * function frame() {
 *   canvasHost.tick(1 / 60)
 *   track.eval(pose)
 *   tree.mat4FromTRS(M, ...pose.pos, ...pose.rot, ...pose.scl)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   trackPath(ctx, track, { bits: tree.PATH, color: [1, 0.82, 0.4, 1] })
 *   axes(ctx, { M, size: 30 })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The pose at the playhead, or at a segment and parameter, as a model matrix.
 * @function mat4Model
 * @memberof PoseTrack
 * @param {Float32Array|number[]} out
 * @param {number} [seg]  Segment index; omitted, the playhead.
 * @param {number} [t]  0–1 within the segment.
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>The playing frame is drawn with mat4Model() at the playhead; the white frames with mat4Model(out, seg, 0.5), fixed halfway along each segment.</caption>
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
 * track.add([
 *   { pos: [-100, 0, 0] },
 *   { pos: [0, 60, -60], rot: tree.qFromAxisAngle(tree.quat(), 0, 1, 0, Math.PI / 2) },
 *   { pos: [100, 0, 0], rot: tree.qFromAxisAngle(tree.quat(), 0, 1, 0, Math.PI) },
 * ])
 * track.play({ duration: 60, loop: true, bounce: true })
 * const M = tree.mat4(), H = tree.mat4()
 *
 * function frame() {
 *   canvasHost.tick(1 / 60)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   trackPath(ctx, track, { bits: tree.PATH, color: [1, 0.82, 0.4, 1] })
 *   for (let seg = 0; seg < 2; seg++) axes(ctx, { M: track.mat4Model(H, seg, 0.5), size: 25, semantic: false, color: [1, 1, 1, 1] })
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
 * A position on the path, at the playhead or at a segment and parameter.
 * @function samplePos
 * @memberof PoseTrack
 * @param {number[]} out  3-element destination.
 * @param {number} [seg]
 * @param {number} [t]
 * @returns {number[]} out
 * @example
 * <caption>Small white crosses at samplePos(out, seg, t) for t = 0, 0.25, 0.5 and 0.75 of each segment bead the yellow path.</caption>
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
 * const p = tree.vec3(), T = tree.mat4()
 *
 * function frame() {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   trackPath(ctx, track, { bits: tree.PATH, color: [1, 0.82, 0.4, 1] })
 *   for (let seg = 0; seg < 2; seg++) for (const t of [0, 0.25, 0.5, 0.75]) {
 *     track.samplePos(p, seg, t)
 *     axes(ctx, { M: tree.mat4FromTranslation(T, p[0], p[1], p[2]), size: 8, semantic: false, color: [1, 1, 1, 1] })
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
 * The path's incoming and outgoing tangents at a keyframe.
 * @function tangents
 * @memberof PoseTrack
 * @param {number[]} outIn
 * @param {number[]} outOut
 * @param {number} index
 * @returns {PoseTrack}
 * @example
 * <caption>At each keyframe, the white line runs along the incoming tangent into it and the magenta line along the outgoing tangent out of it — both lying along the yellow path.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, hermite, trackPath, tree, host } from 'webgpu.tree'
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
 * const tin = tree.vec3(), tout = tree.vec3()
 * const line = (from, d, s, color) => { const v = d.map((x) => x * s); hermite(ctx, from, v, from.map((x, i) => x + v[i]), v, { color }) }
 *
 * function frame() {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   trackPath(ctx, track, { bits: tree.PATH, color: [1, 0.82, 0.4, 1] })
 *   track.keyframes.forEach((kf, i) => {
 *     track.tangents(tin, tout, i)
 *     line(kf.pos, tin, -0.3, [1, 1, 1, 1])
 *     line(kf.pos, tout, 0.3, [1, 0.31, 0.85, 1])
 *   })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Append camera keyframes: one `{ eye, center, up, fov, near, far }` or an array of them.
 * @function add
 * @memberof CameraTrack
 * @param {object|object[]} spec  A camera state's fields; `halfHeight` in place of `fov` for orthographic.
 * @param {object} [opts]
 * @param {boolean} [opts.deduplicate]  Skip a keyframe equal to the last.
 * @example
 * <caption>Three camera keyframes around the axes, each drawn by trackPath as a small camera on the white path of eyes; the played camera's white frustum travels between them.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, trackPath, viewFrustum, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 300, 360] })
 * const lens = tree.createCamera({ fov: Math.PI / 4, near: 20, far: 60 })
 * const track = canvasHost.cameraTrack(lens)
 * track.add([
 *   { eye: [-120, 30, 60], center: [0, 0, 0], fov: Math.PI / 4, near: 20, far: 60 },
 *   { eye: [0, 60, 130], center: [0, 0, 0], fov: Math.PI / 4, near: 20, far: 60 },
 *   { eye: [120, 30, 60], center: [0, 0, 0], fov: Math.PI / 4, near: 20, far: 60 },
 * ])
 * track.play({ duration: 90, loop: true, bounce: true })
 *
 * function frame() {
 *   canvasHost.tick(1 / 60)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   axes(ctx, { size: 50 })
 *   trackPath(ctx, track, { bits: tree.PATH, color: [1, 1, 1, 1] })
 *   viewFrustum(ctx, { camera: lens, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Replace the camera keyframe at an index, or append at the end.
 * @function set
 * @memberof CameraTrack
 * @param {number} index
 * @param {object} spec
 * @returns {boolean}
 * @example
 * <caption>The middle camera keyframe is set every frame to an eye rising and falling above the axes: the white path of eyes and its small camera move with it.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, trackPath, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 300, 360] })
 * const track = canvasHost.cameraTrack(tree.createCamera())
 * const key = (eye) => ({ eye, center: [0, 0, 0], fov: Math.PI / 4, near: 20, far: 60 })
 * track.add([key([-120, 30, 60]), key([0, 60, 130]), key([120, 30, 60])])
 *
 * function frame(ms) {
 *   track.set(1, key([0, 60 + 50 * Math.sin(ms / 1000), 130]))
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   axes(ctx, { size: 50 })
 *   trackPath(ctx, track, { bits: tree.PATH, color: [1, 1, 1, 1] })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The camera state at the playhead.
 * @function eval
 * @memberof CameraTrack
 * @param {object} [out]  Destination camera state.
 * @returns {object} out
 * @example
 * <caption>Click the canvas to switch views: the canvas either shows the scene from outside, with the played camera's frustum, or looks through the camera state eval() writes as it travels.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, grid, trackPath, viewFrustum, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const outside = tree.createCamera({ eye: [0, 300, 360] })
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const track = canvasHost.cameraTrack(tree.createCamera())
 * const key = (eye) => ({ eye, center: [0, 0, 0], fov: Math.PI / 3, near: 20, far: 500 })
 * track.add([key([-150, 60, 80]), key([0, 100, 160]), key([150, 60, 80])])
 * track.play({ duration: 120, loop: true, bounce: true })
 * const seen = tree.createCamera()
 * let through = false
 * canvas.addEventListener('click', () => { through = !through })
 *
 * function frame() {
 *   canvasHost.tick(1 / 60)
 *   track.eval(seen)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, through ? seen : outside)
 *   grid(ctx, { M: ground, size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
 *   axes(ctx, { size: 50 })
 *   if (!through) {
 *     trackPath(ctx, track, { bits: tree.PATH, color: [1, 1, 1, 1] })
 *     viewFrustum(ctx, { camera: seen, aspect: 4 / 3, color: [1, 0.82, 0.4, 1] })
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
 * The eye matrix (eye → world) at the playhead, or at a segment and parameter.
 * @function mat4Eye
 * @memberof CameraTrack
 * @param {Float32Array|number[]} out
 * @param {number} [seg]
 * @param {number} [t]
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>As the track plays, the frame drawn with mat4Eye() rides the white path of eyes, its blue axis always pointing back, away from the origin every keyframe looks at.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, trackPath, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 170, 250] })
 * const track = canvasHost.cameraTrack(tree.createCamera())
 * const key = (eye) => ({ eye, center: [0, 0, 0], fov: Math.PI / 4, near: 20, far: 60 })
 * track.add([key([-120, 30, 60]), key([0, 60, 130]), key([120, 30, 60])])
 * track.play({ duration: 90, loop: true, bounce: true })
 * const E = tree.mat4()
 *
 * function frame() {
 *   canvasHost.tick(1 / 60)
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   trackPath(ctx, track, { bits: tree.PATH, marker: null, color: [1, 1, 1, 1] })
 *   axes(ctx, { M: track.mat4Eye(E), size: 30 })
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * An eye position on the path.
 * @function sampleEye
 * @memberof CameraTrack
 * @param {number[]} out  3-element destination.
 * @param {number} [seg]
 * @param {number} [t]
 * @returns {number[]} out
 * @example
 * <caption>Small yellow crosses at sampleEye(out, seg, t), for t = 0, 0.25, 0.5 and 0.75 of each segment, bead the white path of eyes.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, trackPath, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 170, 250] })
 * const track = canvasHost.cameraTrack(tree.createCamera())
 * const key = (eye) => ({ eye, center: [0, 0, 0], fov: Math.PI / 4, near: 20, far: 60 })
 * track.add([key([-120, 30, 60]), key([0, 60, 130]), key([120, 30, 60])])
 * const p = tree.vec3(), T = tree.mat4()
 *
 * function frame() {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   trackPath(ctx, track, { bits: tree.PATH, marker: null, color: [1, 1, 1, 1] })
 *   for (let seg = 0; seg < 2; seg++) for (const t of [0, 0.25, 0.5, 0.75]) {
 *     track.sampleEye(p, seg, t)
 *     axes(ctx, { M: tree.mat4FromTranslation(T, p[0], p[1], p[2]), size: 10, semantic: false, color: [1, 0.82, 0.4, 1] })
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
 * A center position on the path.
 * @function sampleCenter
 * @memberof CameraTrack
 * @param {number[]} out  3-element destination.
 * @param {number} [seg]
 * @param {number} [t]
 * @returns {number[]} out
 * @example
 * <caption>The three camera keyframes look at centers spread along x: small yellow crosses at sampleCenter(out, seg, t) bead the white path of centers on the ground — the other path, 80 to 100 above it and nearer the viewer, is the eyes'.</caption>
 * import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, trackPath, tree, host } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const canvasHost = host.createHost(canvas)
 * const ctx = await init(canvas, { width: 400, height: 300, host: canvasHost })
 * const scene = renderTarget(ctx)
 * const cam = tree.createCamera({ eye: [0, 220, 330] })
 * const track = canvasHost.cameraTrack(tree.createCamera())
 * const key = (eye, center) => ({ eye, center, fov: Math.PI / 4, near: 20, far: 60 })
 * track.add([key([-120, 80, 150], [-80, 0, 0]), key([0, 100, 180], [0, 0, -40]), key([120, 80, 150], [80, 0, 0])])
 * const p = tree.vec3(), T = tree.mat4()
 *
 * function frame() {
 *   ctx.backend.bindTarget(ctx, scene)
 *   ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
 *   setCamera(ctx, cam)
 *   trackPath(ctx, track, { bits: tree.PATH | tree.CENTER, marker: null, color: [1, 1, 1, 1] })
 *   for (let seg = 0; seg < 2; seg++) for (const t of [0, 0.25, 0.5, 0.75]) {
 *     track.sampleCenter(p, seg, t)
 *     axes(ctx, { M: tree.mat4FromTranslation(T, p[0], p[1], p[2]), size: 10, semantic: false, color: [1, 0.82, 0.4, 1] })
 *   }
 *   canvasHost.pointer.flush()
 *   ctx.backend.bindTarget(ctx, SCREEN)
 *   image(ctx, scene.color)
 *   endFrame(ctx)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */
