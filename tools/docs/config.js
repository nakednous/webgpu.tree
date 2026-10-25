/**
 * @file Docs generator configuration — pinned CDN versions and repo paths.
 * @module tools/docs/config
 * @license AGPL-3.0-only
 *
 * Every version below is an exact pin. Advancing one is a deliberate edit
 * here, never an implicit `latest`.
 *
 * The twin's site is ESM-only: the package ships one ES build
 * (`dist/index.js`), there is no script-tag bundle and no global, so an
 * example is a module script under the import map below and its first line is
 * its `import` from `webgpu.tree`. `webgpu-utils` is the one peer the build
 * leaves to the application, so it is the one entry the map resolves to the
 * CDN; the stack's packages are the site's own copies of the same commit.
 */

const CDN = 'https://cdn.jsdelivr.net/npm';

/** webgpu-utils — the peer build the ES build was made against. */
export const peer = { version: '2.1.1' };
peer.module = `${CDN}/webgpu-utils@${peer.version}/dist/2.x/webgpu-utils.module.js`;
peer.reference = 'https://github.com/greggman/webgpu-utils';

/**
 * The stack's packages, named in prose or as a module's root: a mention links
 * to the repository that develops it — and `webgpu.tree` itself, whose root
 * module has no page of its own, is the one address for the package's name.
 */
export const packages = {
  '@nakednous/tree':  'https://github.com/nakednous/tree',
  '@nakednous/host':  'https://github.com/nakednous/host',
  '@nakednous/ui':    'https://github.com/nakednous/ui',
  // the layer's repository is private, so its public address is the package page
  '@nakednous/idiom': 'https://www.npmjs.com/package/@nakednous/idiom',
  'webgpu-utils':     peer.reference,
  'webgpu.tree':      'https://github.com/nakednous/webgpu.tree',
  'webgl.tree':       'https://github.com/nakednous/webgl.tree',
};

/** The address of a package named in prose, or null. */
export const packageRefUrl = (name) => packages[name] ?? null;

/** Class names in prose link to the factory that makes them. */
export const aliases = {};

/**
 * Owners written as a prefix in signatures and prose: the two namespaces the
 * package re-exports. Their pages are the twin's own, ported from the
 * reference's doc-only files (§7 #116), so a `tree.mat4Mul` or a `host.handle`
 * in prose links to the page that documents it.
 */
export const namespaces = ['tree', 'host'];

/**
 * Where each owner of the re-exported surface lives in the build: a path from
 * the ES build's namespace, or `path()` for the object literal a factory
 * returns (its methods are read off the factory's source). The same table the
 * reference's site uses — the build re-exports the same packages.
 */
export const owners = {
  tree:        'tree',
  host:        'host',
  Host:        'host.createHost()',
  Orbit:       'host.createOrbit()',
  Labels:      'host.createLabels()',
  Video:       'host.createVideo()',
  Handle:      'host.Handle.prototype',
  PoseTrack:   'tree.PoseTrack.prototype',
  CameraTrack: 'tree.CameraTrack.prototype',
  PoseHelm:    'tree.PoseHelm.prototype',
};

/** CodeMirror 5 UMD — the example editor. */
export const codemirror = { version: '5.65.21' };
codemirror.css = `${CDN}/codemirror@${codemirror.version}/lib/codemirror.min.css`;
codemirror.js  = [
  `${CDN}/codemirror@${codemirror.version}/lib/codemirror.min.js`,
  `${CDN}/codemirror@${codemirror.version}/mode/javascript/javascript.min.js`,
];

/** Repo-relative paths (resolved against the package root by index.js). */
export const paths = {
  src:    'src',
  docs:   'docs',             // doc-only files: the re-exported composites, by name
  pkg:    'package.json',
  readme: 'README.md',
  esm:    'tools/docs/esm.md',  // the index page's ES modules section and its live demo
  module: 'dist/index.js',      // the ESM build of the same commit — the only build
  deps: {                       // the builds the ES build was made against
    '@nakednous/tree':  'node_modules/@nakednous/tree/dist/index.js',
    '@nakednous/host':  'node_modules/@nakednous/host/dist/index.js',
    '@nakednous/idiom': 'node_modules/@nakednous/idiom/dist/index.js',
  },
  static: 'tools/docs/static',  // copied verbatim into site/ (assets/, favicons)
  site:   'site',
};

/** Site-local URLs, and the import map every example runs under. */
export const site = {
  module: 'webgpu.tree.js',      // the ESM build, under the site's own name
  deps: {
    '@nakednous/tree':  'tree.js',
    '@nakednous/host':  'host.js',
    '@nakednous/idiom': 'idiom.js',
  },
  style:  'assets/style.css',
  favicon32:  'favicon-32.png',      // the family's cube, cropped square
  favicon128: 'favicon-128.png',
  runner: 'assets/runner.js',
  search: 'assets/search.js',
  index:  'search.json',
};

/** The import map an example's iframe carries: the site's own builds and the peer. */
export function importMap() {
  const imports = { 'webgpu.tree': `./${site.module}`, 'webgpu-utils': peer.module };
  for (const [name, file] of Object.entries(site.deps)) imports[name] = `./${file}`;
  return imports;
}

/**
 * The address the API site would be deployed at. Nothing is deployed (§7 #77's
 * ground stays pending), so the twin's README carries no link into it; the
 * validator still reads the README for one, so a link added later is checked
 * against the pages this build writes.
 */
export const SITE_URL = 'https://jpcharalambosh.co/webgpu.tree/';
