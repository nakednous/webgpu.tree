## ES modules

The package ships one build, `dist/index.js`, an ES module; `webgpu-utils`, `@nakednous/tree`,
`@nakednous/host` and `@nakednous/idiom` stay external, so each loads once beside the
application's own imports. With a bundler, install them all:

```bash
npm install webgpu.tree webgpu-utils @nakednous/tree @nakednous/host @nakednous/idiom
```

Without one, an import map resolves them:

```html
<script type="importmap">
{ "imports": {
  "webgpu.tree": "https://cdn.jsdelivr.net/npm/webgpu.tree/dist/index.js",
  "webgpu-utils": "https://cdn.jsdelivr.net/npm/webgpu-utils@2.1.1/dist/2.x/webgpu-utils.module.js",
  "@nakednous/tree": "https://cdn.jsdelivr.net/npm/@nakednous/tree/dist/index.js",
  "@nakednous/host": "https://cdn.jsdelivr.net/npm/@nakednous/host/dist/index.js",
  "@nakednous/idiom": "https://cdn.jsdelivr.net/npm/@nakednous/idiom/dist/index.js"
} }
</script>
```

`init` is a promise — WebGPU's adapter and device are asked for asynchronously — so every
example awaits it, and an example's first line is its import. A shader is WGSL, and WGSL has
no include: `program(ctx, wgsl, opts)` compiles the twin's vertex stage concatenated with the
caller's fragment source, one module with two entry points.

<!-- caption: A camera state circling the axes, one turn every 6.3 seconds — as a module. -->
```js
import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree } from 'webgpu.tree'

const canvas = document.body.appendChild(document.createElement('canvas'))
canvas.style.width = '400px'
canvas.style.height = '300px'
const ctx = await init(canvas, { width: 400, height: 300 })
const scene = renderTarget(ctx)
const cam = tree.createCamera({ eye: [0, 107, 215] })

function frame(ms) {
  const t = ms / 1000
  cam.eye[0] = 215 * Math.sin(t)
  cam.eye[2] = 215 * Math.cos(t)
  ctx.backend.bindTarget(ctx, scene)
  ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
  setCamera(ctx, cam)
  axes(ctx, { size: 100 })
  ctx.backend.bindTarget(ctx, SCREEN)
  image(ctx, scene.color)
  endFrame(ctx)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
```

The canvas's pixels are the compositor's: a figure that needs to read its own frame draws
into a `renderTarget` and shows it with `image`, as the pages below do.
