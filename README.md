# `webgpu.tree`

The WebGPU twin of `webgl.tree`: `@nakednous/tree` and `@nakednous/host` on raw WebGPU through
[webgpu-utils](https://github.com/greggman/webgpu-utils). The same bridge surface — gizmo
pipe, HUD, render targets, filter passes and the pipe chain, colour-ID picking, camera
install — realized where uniforms are fields of a buffer bound as a group, a program is a
pipeline with baked state, and readback is asynchronous by construction.

> **Status: stated, not built.** This repository reserves the name and carries
> `twin-design.md`, the differences table against `webgl.tree`. No source has been written.

---

## Architecture

```
  application  (imports webgpu-utils itself)
      │
      ▼
  webgpu.tree                 ← this package: the GPU, thinly
      │
      ├── @nakednous/host     ← pointer, handles, players, streams, media
      │
      ├── @nakednous/tree     ← math, spaces, animation, visibility
      │
      └── webgpu-utils        ← peer dependency
```

`@nakednous/ui` is an optional peer of the application, not a dependency of the bridge.
Dependency direction is strict: `{ tree, host } ← webgpu.tree`; nothing flows back.

---

## License

AGPL-3.0-only  
© JP Charalambos
