/**
 * @file The twin's surface: `idiom`'s backend interface, its four conventions,
 * and the exports a bridge must publish.
 * @license AGPL-3.0-only
 */

'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from '@nakednous/idiom';

import * as twin from '../src/index.js';
import { WEBGPU } from '@nakednous/tree';
import { createBackend } from '../src/backend.js';
import { createCanvas, createDevice } from './gpu.js';

/** The backend `idiom` builds its record over — the same one `init` makes. */
function backendOf() {
  const { device, calls } = createDevice();
  const { context } = createCanvas();
  return { backend: createBackend({ device, context, format: 'rgba8unorm' }), calls };
}

/** `idiom`'s own check runs as the record is made: every missing member is logged once. */
function complaints(backend) {
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args.join(' '));
  try {
    createContext(backend);
  } finally {
    console.error = original;
  }
  return logged;
}

test('the backend implements idiom\'s interface: creating a record complains about nothing', () => {
  const { backend } = backendOf();
  assert.deepEqual(complaints(backend), []);
});

test('the check is live: a backend missing a member is named, once', () => {
  const { backend } = backendOf();
  const incomplete = { ...backend };
  delete incomplete.readPixels;
  delete incomplete.uvOrientation;
  const logged = complaints(incomplete);
  assert.equal(logged.length, 2);
  assert.match(logged[0], /readPixels/);
  assert.match(logged[1], /uvOrientation/);
});

test('the four conventions are the twin\'s', () => {
  const { backend } = backendOf();
  assert.equal(backend.ndcZMin, WEBGPU);
  assert.equal(backend.ndcZMin, 0);
  assert.equal(backend.uvOrientation, 'top-down');
  assert.equal(backend.framebufferY, 'down');
  assert.equal(backend.format, 'rgba8unorm');
});

test('every member is a function of the backend, and the twenty-two are the interface\'s', () => {
  const members = [
    'createTarget', 'destroyTarget', 'bindTarget', 'clear',
    'createProgram', 'imageProgram', 'uniformsOf', 'samplersOf', 'setUniforms',
    'setCamera', 'draw', 'drawInstanced',
    'createBuffer', 'updateBuffer',
    'readPixels',
    'createTexture', 'uploadTexture', 'destroyTexture', 'textureSize',
    'setViewport', 'setState',
    'dispose',
  ];
  const { backend } = backendOf();
  for (const name of members) assert.equal(typeof backend[name], 'function', name);
  assert.equal(members.length, 22);
});

test('the package exports the bridge surface', () => {
  const expected = [
    'init', 'dispose', 'endFrame', 'viewOf', 'setCamera',
    'bind', 'buffer', 'updateBuffer', 'draw', 'drawInstanced',
    'texture', 'upload',
    'renderTarget', 'SCREEN', 'program', 'fullscreen', 'filter', 'image', 'pipe', 'releasePipe', 'state',
    'RED', 'GREEN', 'BLUE', 'ALPHA', 'RGB', 'NORMAL', 'ADD', 'MULTIPLY',
    'tree', 'host',
  ];
  for (const name of expected) assert.ok(name in twin, name);
});
