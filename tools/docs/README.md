# tools/docs — the API site's declaration and its editor

`docs.config.js` is the site's declaration and `index.js` is `npm run docs`: the two of them state where
this site's sources are and hand them to `@nakednous/scholion/generator`, which parses, validates,
renders and writes `site/`. The pipeline is the package's — this folder holds no copy of a step. It is
also a nested npm project of its own, because the site's editor is not the repository's: it is the same
package, installed here and nowhere else.

## The nested project

```
tools/docs/
  docs.config.js      the declaration — paths, outputs, pins, references, the page's chrome
  index.js            ~8 lines: import the generator, hand it the declaration
  plugins/examples.mjs  the site's own example rule: a module script, and a fence language
  static/             the stylesheet, the three scripts, the models and the favicons — copied verbatim
  package.json        one dependency: @nakednous/scholion
  package-lock.json   committed — the root lock is ignored by pattern, this one is not
```

Until the package is published its dependency is a `file:` path, so the order matters:

```
cd ../../../../scholion && npm run build   # the package's bundle: dist/editor.<hash>.js + dist/manifest.json
npm install --prefix tools/docs            # links the package into tools/docs/node_modules
npm run build                              # this repository's ES build, dist/index.js
npm run docs                               # copies the hashed asset into site/assets and writes every page
```

`scholion` is at `~/books/scholion` — the one package both instances' sites share. The library's root
`package.json` and lockfile are untouched: `npm run docs` reads the nested install and nothing else. The
Pages workflow installs the root and then the nested project (`npm ci --prefix tools/docs`); with a
`file:` dependency that step resolves only on a machine that has the package checkout, which is why this
project is not deployed yet — the first publish comes first.

## What the declaration says

`docs.config.js` carries the things only this site can know, and nothing it could compute:

- **the paths** — `src`, the ES build of the same commit, the three dependency builds it was made
  against, `static/`, `site/`;
- **the outputs** — the names the page finds them under, the search index, the editor's directory and
  its notices file;
- **the pins** — `webgpu-utils`, the one peer the build leaves to the application, and the module a
  page's import map resolves it to;
- **the references** — the packages named in prose, each at the repository that develops it (the
  layer's is private, so its address is its package page); the README's own prose is linked through the
  doclet table, like the pages' prose;
- **the surface** — the ES build's namespace, imported once; `owners` says where each documented owner
  lives in it, and the composites a carrier documents are the build's top-level exports, so their owners
  state an empty path;
- **the rules** — a block above an `export` or the `program` the root module declares; the tag
  vocabulary is the site's own closed set; an example is a module script;
- **the page** — `mode: 'esm'`, the stylesheet, and the runner's config block with its `{module}`,
  `{index}`, `{editor}`, `{dep:…}` and `{pin:…}` tokens.

## What the build puts on a page

- `#docs-config`: a `<script type="application/json">` block holding `{ imports, index, editor }`.
  The runner and the search script read it with `textContent` and `JSON.parse`; no page writes a global
  and no page holds code in an HTML attribute.
- `assets/editor.<hash>.js`: the package's bundle, copied under the name its manifest states. The build
  re-hashes the copy and refuses to write the site if it does not match the manifest's SHA-256, so a
  page can never carry a URL the artifact does not have.
- `assets/runner.js`, `assets/search.js`, `assets/chrome.js`: ES modules, deferred by the browser. The
  runner wires every figure's Run and Reset to the textarea, then imports the editor bundle — only on a
  page that has a `textarea.source` — mounts it, and marks a figure `data-editor="fallback"` if the
  import or the mount fails.
- The editor's look is split: the package ships the structure and the token-role mapping, this site
  states the values — `--cm-*` per role out of its own accent and neutral variables.
- `assets/editor.LICENSES.txt`: the bundled packages' notices, copied out of the release manifest and
  linked from every page's footer.
- Every earlier `assets/editor.<hash>.js` is kept when the site is rebuilt: a page served from a cache
  still asks for the editor it was built against.

## The runner

`static/assets/runner.js` is the site's own and stays so: a same-origin `srcdoc` iframe assembled from
the page's import map and the box, run as a module script; the visible error sink is the frame's, since
a frame has no console the reader sees. An IntersectionObserver mounts a figure as it nears the viewport
and **hides** it off-screen — the frame and its WebGPU device stay, because a device made after an
earlier one was destroyed renders nothing here — and Run is the one place a frame, and so a device, is
made again. The editor is the package's, imported only where there is an example. The examples in
Chromium are the maintainer's gate; this folder carries no browser probe, and adding one is a decision
the design has not taken.
