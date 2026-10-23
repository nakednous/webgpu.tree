# `webgpu.tree`

The WebGPU twin of `webgl.tree`: `@nakednous/tree` and `@nakednous/host` on raw WebGPU through
[webgpu-utils](https://github.com/greggman/webgpu-utils), its composites on
[`@nakednous/idiom`](https://www.npmjs.com/package/@nakednous/idiom). The same bridge surface — gizmo
pipe, HUD, render targets, filter passes and the pipe chain, colour-ID picking, camera install —
realized where uniforms are fields of a buffer bound as a group, a program is a pipeline with baked
state, and readback is asynchronous by construction.

> **Status: the core is built.** `init` and the backend behind `idiom`'s interface — the twenty-two
> members and the four conventions — with the composites over it: `renderTarget`, `SCREEN`,
> `program`, `fullscreen`, `filter`, `image`, `pipe`, `releasePipe`, `state`, `setCamera`,
> `endFrame`, `viewOf`, `dispose`. `twin-design.md` is the differences table against `webgl.tree`
> and states the rest of the surface — the raw verbs (`bind`, `draw`, `buffer`, `texture`, `upload`),
> picking, the space mappings, gizmos and the HUD — each as its own stage.
>
> Pins `@nakednous/tree` ^0.0.34, `@nakednous/host` ^0.0.12, `@nakednous/idiom` ^0.0.1;
> `webgpu-utils` ^2.1.1 is a peer. Gates: `npm test` (47 cases, against the recording device in
> `test/gpu.js`) and `npm run build`. The browser is the maintainer's gate.

---

## Architecture

```
  application  (imports webgpu-utils itself, and authors WGSL)
      │
      ▼
  webgpu.tree                 ← this package: the GPU, thinly
      │
      ├── @nakednous/idiom    ← targets, passes, pipe, state — the composites
      │
      ├── @nakednous/host     ← pointer, handles, players, streams, media
      │
      ├── @nakednous/tree     ← math, spaces, animation, visibility
      │
      └── webgpu-utils        ← peer dependency
```

`@nakednous/ui` is an optional peer of the application, not a dependency of the bridge.
Dependency direction is strict: `{ tree, host, idiom } ← webgpu.tree`; nothing flows back.

## The frame

WebGPU has no flat "bind a framebuffer" call, so the twin keeps the block inside: one command encoder
per frame, one render pass at a time, submitted at the frame's end. The pass is begun lazily, on the
first draw after a bind — which is what lets `filter`, `pipe` and `state` clear a target straight
after binding it, the order a GL figure writes — while a clear begins its pass at once, because a
state's pair is cleared as it is made and sampled by the very next pass.

```js
const ctx = await init(canvas, { width: 400, height: 300 })
const canvasHost = host.createHost(canvas, { afterFrame: () => endFrame(ctx) })

const mean = state(ctx, { width: 256, height: 192 })
function frame() {
  mean.pass(accum, { uWeight: 1 / (mean.count + 1) })
  image(ctx, mean.read.color)
}
```

`init` asks for the adapter and the device, so it is a promise — the one surface difference a caller
sees from `webgl.tree`, where `init(gl)` is a plain call. `endFrame` is the twin's own and is the
host's `afterFrame` client (§7 #107): the submit happens after `pointer.flush()`, so a pointer
handler's draws are in the frame. Without a host, the application calls it.

## Conventions

- **The context record.** `init(canvas, opts)` answers one record — `{ device, context, format }` and
  the layer's own bookkeeping — and every verb takes it first, as `gl` is taken first in `webgl.tree`.
  Per-device state lives in a registry keyed by the device.
- **`ndcZMin` is 0.** Every `tree` call that writes a depth range is bound to `WEBGPU` in the `tree`
  namespace, so no call names it.
- **One texture orientation, top-down.** Nothing is flipped anywhere: uploads, targets and the
  fullscreen pass's `vTexCoord` all run the way a decoded image's rows do. `image`'s rect is in target
  pixels, origin bottom-left; the viewport is WebGPU's own, origin top-left.
- **Depth.** The compare is a pipeline field, `'less'` unless a state names `'less-equal'` for a far
  plane pinned at `z/w = 1` (§7 #93). A pass with no depth attachment never bakes one in.
- **WGSL, one module.** `program(ctx, wgsl, opts)` compiles the twin's vertex stage *concatenated*
  with the caller's fragment source — WGSL has no include, and varyings match by location — unless
  the source brings its own `@vertex` stage. That is how one file carries both stages without a
  shared module, and why the backend interface needs no change for it.
- **Uniforms.** A `var<uniform>` is a struct, and the names a bag sets are its members; the backend
  writes them through webgpu-utils' structured views into the frame's uniform arena, one slot per
  draw, offsets aligned to the device's. A `mat3x3f` travels as nine floats and its columns are
  padded, because WGSL pads them.

## What the package names in a shader

The application's own attributes (`aPosition` `aTexCoord` for the covering quad); the six declared
transforms where a program declares them; a pass's input, bound to every texture the stage declares
and the bag leaves unset; `uResolution` and `uTexelSize`, only where declared. `image`'s flat program
names `uModelViewProjectionMatrix`, `uColor`, `uUseTexture` and `uTexture`.

---

## License

AGPL-3.0-only  
© JP Charalambos
