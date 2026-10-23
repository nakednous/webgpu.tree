import resolve from '@rollup/plugin-node-resolve';

// ESM only, and external: webgpu-utils, tree, host and idiom are the
// application's imports (an import map, a bundler), so each loads once. The
// script-tag bundle the design table also names waits for the public surface
// a script tag would use.
export default {
  input: 'src/index.js',
  external: ['webgpu-utils', '@nakednous/tree', '@nakednous/host', '@nakednous/idiom'],
  output: {
    file: 'dist/index.js',
    format: 'es',
    sourcemap: true
  },
  plugins: [resolve()]
};
