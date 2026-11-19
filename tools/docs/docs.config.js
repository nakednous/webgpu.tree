/**
 * @file The API site's declaration — what this site states, and nothing it does.
 * @module tools/docs/docs.config
 * @license AGPL-3.0-only
 *
 * `npm run docs` hands this object to `@nakednous/scholion/generator`, which
 * parses, validates, renders and writes the site. Add a field here to say
 * something; add a plugin to do something.
 *
 * Every version below is an exact pin. Advancing one is a deliberate edit
 * here, never an implicit `latest`.
 */

/**
 * webgpu-utils — the one peer the ES build leaves to the application, and the
 * one entry the page's import map resolves to the CDN.
 */
const peer = {
  version: '2.1.1',
  module: 'dist/2.x/webgpu-utils.module.js',
};

export default {
  /** Repo-relative paths: the inputs a build reads and the build it copies. */
  paths: {
    pkg: 'package.json',
    readme: 'README.md',
    src: 'src',
    module: 'dist/index.js',       // the ES build of the same commit — the only build
    deps: {                        // the builds the ES build was made against
      '@nakednous/tree': 'node_modules/@nakednous/tree/dist/index.js',
      '@nakednous/host': 'node_modules/@nakednous/host/dist/index.js',
      '@nakednous/idiom': 'node_modules/@nakednous/idiom/dist/index.js',
    },
    static: 'tools/docs/static',   // copied verbatim into the site (assets/, models/, favicons)
    site: 'site',
  },

  /** What the build writes, as the page names it. */
  outputs: {
    module: 'webgpu.tree.js',
    deps: { '@nakednous/tree': 'tree.js', '@nakednous/host': 'host.js', '@nakednous/idiom': 'idiom.js' },
    index: 'search.json',
    editor: 'assets',                                  // the editor bundle, under its content-hashed name
    notices: 'assets/editor.LICENSES.txt',             // the bundled packages' notices, served beside it
  },

  /** What a page is made of: doc-only sources, and the landing page's own section. */
  carrier: {
    docs: 'docs',                     // documentation-only files: the re-exported tree / host surface
    landing: { file: 'tools/docs/esm.md', section: 'esm', id: 'es-modules' },
  },

  /**
   * Publicity: the names `src/index.js` re-exports and the `program` it declares
   * itself; no class members are public, and an `@ignore` block stays off the
   * site whatever it exports. The tag vocabulary is the site's own closed set.
   */
  parse: {
    surface: true,
    members: null,
    ignore: 'skip',
    private: 'skip',
    vocabulary: ['file', 'module', 'license', 'function', 'memberof', 'param', 'returns',
      'constant', 'typedef', 'property', 'example', 'details'],
  },

  /**
   * Every example is a module script whose imports resolve through the page's
   * map; every function carries one. Its own checks are the plugin below.
   */
  examples: { syntax: 'module', global: null, required: true },

  /**
   * The build, imported once: the ES module's namespace, checked through the
   * owners the re-exported carriers document.
   */
  surface: { module: true, check: 'all' },

  /**
   * Where each owner of the re-exported surface lives in the build: a path from
   * the ES build's namespace, or `path()` for the object literal a factory
   * returns (its methods are read off the factory's source). The composites a
   * carrier documents are the build's own top-level exports, so their owners
   * state an empty path — the surface itself.
   */
  owners: {
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
    'webgpu.tree':        '',   // the root module's own verb, a top-level export
    'webgpu.tree/camera':     '',
    'webgpu.tree/compute':    '',
    'webgpu.tree/context':    '',
    'webgpu.tree/draw':       '',
    'webgpu.tree/gizmo':      '',
    'webgpu.tree/hdr':        '',
    'webgpu.tree/pass':       '',
    'webgpu.tree/pick':       '',
    'webgpu.tree/query':      '',
    'webgpu.tree/space':      '',
    'webgpu.tree/state':      '',
    'webgpu.tree/target':     '',
    'webgpu.tree/texture':    '',
  },

  /** Owners written as a prefix in signatures and constant names: `tree.mat4Mul`. */
  namespaces: ['tree', 'host'],

  /** The pinned third-party build a page's import map names. */
  pins: { 'webgpu-utils': peer },

  /**
   * Where a name in prose resolves to: a package's repository (the layer's is
   * private, so its public address is the package page), and this package
   * itself, whose root module is the one address for the package's name.
   */
  references: {
    packages: {
      '@nakednous/tree':  'https://github.com/nakednous/tree',
      '@nakednous/host':  'https://github.com/nakednous/host',
      '@nakednous/ui':    'https://github.com/nakednous/ui',
      // the layer's repository is private, so its public address is the package page
      '@nakednous/idiom': 'https://www.npmjs.com/package/@nakednous/idiom',
      'webgpu-utils':     'https://github.com/greggman/webgpu-utils',
      'webgpu.tree':      'https://github.com/nakednous/webgpu.tree',
      'webgl.tree':       'https://github.com/nakednous/webgl.tree',
    },
    externals: [],
    aliases: {},
  },

  /** The address the site is served from; a README link into it names a page and a name this build writes. */
  home: 'https://jpcharalambosh.co/webgpu.tree/',

  /** The page's own scripts are ES modules; the shell hands them a JSON config block. */
  mode: 'esm',

  shell: {
    // The rail's badge in place of the version line: on every page, and the
    // landing page keeps its space.
    badge: {
      src: 'https://img.shields.io/badge/dynamic/json?url=https://registry.npmjs.org/webgpu.tree&query=$.dist-tags.latest&label=npm&color=d02d74',
      href: 'https://www.npmjs.com/package/webgpu.tree',
    },
    base: 'assets/base.css',       // the package's structure, loaded before this site's file
    stylesheet: 'assets/style.css',
    favicon: [
      { sizes: '32x32', href: 'favicon-32.png' },      // the family's cube, cropped square
      { sizes: '128x128', href: 'favicon-128.png' },
    ],
  },

  /**
   * Every site-local asset URL carries the build stamp: a rebuild has to
   * invalidate what the browser cached, or the new pages run the old client —
   * the sheet, the scripts and the index the page fetches, and the builds the
   * frames import. A CDN pin is someone else's file and carries none.
   */
  stamp: true,

  /**
   * The runner's contract: the page's config block, its `{tokens}` resolved by
   * the build — `{module}`, `{index}`, `{editor}`, `{dep:<name>}`,
   * `{pin:<name>:<field>}`. The import map is what every example's frame runs
   * under: the site's own builds of the same commit, and the peer from the CDN.
   */
  runner: {
    script: 'assets/runner.js',
    search: 'assets/search.js',
    chrome: 'assets/chrome.js',    // theme picker, collapsible navigation, the GPU notice
    config: {
      imports: {
        'webgpu.tree': './{module}?v={stamp}',
        'webgpu-utils': '{pin:webgpu-utils:module}',
        '@nakednous/tree': './{dep:@nakednous/tree}?v={stamp}',
        '@nakednous/host': './{dep:@nakednous/host}?v={stamp}',
        '@nakednous/idiom': './{dep:@nakednous/idiom}?v={stamp}',
      },
      index: '{index}?v={stamp}',
      editor: '{editor}',
    },
  },

  /** This site's own checks: its module examples against the build's exports, and its fences. */
  plugins: ['examples'],
};
