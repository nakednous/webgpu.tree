/**
 * @file A program's declarations, read off its WGSL and written through
 * `webgpu-utils`' structured views.
 * @module webgpu.tree/uniforms
 * @license AGPL-3.0-only
 *
 * A shader's uniform is a `var<uniform>` binding, and WGSL requires it to be a
 * struct for anything but one scalar: the names a bag writes are its *members*.
 * `webgpu-utils`' `makeShaderDataDefinitions` reads those declarations — groups,
 * bindings, members, layouts, the samplers and textures beside them — and its
 * `makeStructuredView` gives one typed-array view per uniform with a `set` that
 * places a member at the offset WGSL's layout gives it (a `mat3x3f` travels as
 * nine floats and the columns pad).
 *
 * ```
 * const decl = declare(code)
 * decl.set({ uWeight: 0.5 })   // the bag, by name
 * decl.names                   // every member name a bag may set
 * decl.bindings                // [{ kind, name, group, binding }], by binding
 * ```
 *
 * One padding is the bridge's own: `webgpu-utils` flattens a matrix into one
 * array and writes a value's columns back to back, while WGSL pads a column of
 * three rows to 16 bytes (`mat3x3f` is 48 bytes, not 36). So a matrix with three
 * rows is written column by column here, at the stride the layout gives it —
 * nine floats in, twelve bytes a column out.
 *
 * Nothing here touches a device: reflection is a property of the source, so it
 * runs under `node --test` as it runs in a browser.
 */

'use strict';

import { makeShaderDataDefinitions, makeStructuredView } from 'webgpu-utils';

const MATRIX = /^mat([234])x([234])[fhiu]$/;

/**
 * Read a WGSL source's declarations and build a structured view per uniform.
 * @param {string} code  WGSL source, one module.
 * @returns {{ defs:object, views:Map, names:string[], fields:Map, textures:string[],
 *             samplers:string[], storages:string[], bindings:object[],
 *             unsupported:string[], set:function(object):void }}
 *          `views`: uniform variable → `webgpu-utils` structured view; `fields`:
 *          member name → `{ variable, field }`; `bindings`: every resource by
 *          binding; `storages`: the declared storage buffers, which `bind`
 *          takes records for; `unsupported`: storage *textures* and external
 *          bindings, which the surface does not bind.
 */
export function declare(code) {
  const defs = makeShaderDataDefinitions(code);
  const views = new Map();
  const fields = new Map();
  const names = [];

  for (const [variable, def] of Object.entries(defs.uniforms)) {
    views.set(variable, makeStructuredView(def));
    const members = def.typeDefinition && def.typeDefinition.fields;
    if (members) {
      for (const member of Object.keys(members)) {
        fields.set(member, { variable, field: member, type: members[member].type.type });
        names.push(member);
      }
    } else {
      fields.set(variable, { variable, field: null, type: def.typeDefinition && def.typeDefinition.type });
      names.push(variable);
    }
  }

  const textures = Object.keys(defs.textures);
  const samplers = Object.keys(defs.samplers);
  const storages = Object.keys(defs.storages);
  const bindings = [];
  const add = (kind, list) => {
    for (const name of Object.keys(list)) {
      const d = list[name];
      bindings.push({ kind, name, group: d.group, binding: d.binding });
    }
  };
  add('uniform', defs.uniforms);
  add('texture', defs.textures);
  add('sampler', defs.samplers);
  add('storage', defs.storages);
  bindings.sort((a, b) => a.group - b.group || a.binding - b.binding);

  // The storage buffers are the surface's now (a compute's read and write, a
  // vertex stage's read); a storage *texture* and an external texture are not.
  const unsupported = [
    ...Object.keys(defs.storageTextures).map((n) => 'storageTexture:' + n),
    ...Object.keys(defs.externalTextures).map((n) => 'externalTexture:' + n),
  ];

  /** A field of three rows: its columns are padded to 16 bytes, so it is written here. */
  function writePaddedColumns(view, entry, value) {
    const shape = MATRIX.exec(entry.type || '');
    if (!shape || Number(shape[2]) !== 3) return false;
    const columns = Number(shape[1]);
    const column = view.views && view.views[entry.field];
    if (!column || typeof column.set !== 'function') return false;
    if (!(Array.isArray(value) || ArrayBuffer.isView(value)) || value.length !== columns * 3) return false;
    for (let c = 0; c < columns; c++) {
      for (let r = 0; r < 3; r++) column[c * 4 + r] = value[c * 3 + r];
    }
    return true;
  }

  /** Write a bag by name into the views; a name the source does not declare is left alone. */
  function set(values) {
    if (!values) return;
    for (const name of Object.keys(values)) {
      const entry = fields.get(name);
      if (!entry) continue;
      const view = views.get(entry.variable);
      let value = values[name];
      if (typeof value === 'boolean') value = value ? 1 : 0;
      if (entry.field === null) view.set(value);
      else if (!writePaddedColumns(view, entry, value)) view.set({ [entry.field]: value });
    }
  }

  return { defs, views, names, fields, textures, samplers, storages, bindings, unsupported, set };
}
