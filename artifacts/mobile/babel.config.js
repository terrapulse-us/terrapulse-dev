/**
 * babel.config.js
 *
 * hermesc linux64 v0.12.0 (bundled with RN 0.81.5) cannot compile:
 *   - private class fields:  #field
 *   - public class field declarations: field; / field = value;
 *   - ES6 class declarations in certain module contexts (extends Y.default pattern)
 *
 * Plugins loaded from pnpm store by absolute path (they exist as transitive
 * deps of @babel/core@7.29.0 — no `pnpm install` needed).
 *
 * @babel/plugin-transform-classes       — converts ALL class syntax to ES5 functions
 * @babel/plugin-transform-class-properties — moves class field declarations to constructor
 * @babel/plugin-transform-private-methods  — renames private methods
 * @babel/plugin-transform-private-property-in-object — handles `#field in obj`
 */
const path = require('path');
const fs = require('fs');

const STORE_DIR = path.join(__dirname, '../../node_modules/.pnpm');

function loadFromStore(pkgName) {
  // Encode package name to pnpm store directory prefix format
  // @babel/plugin-foo  →  @babel+plugin-foo
  const encoded = pkgName.replace(/\//g, '+');
  let entries;
  try {
    entries = fs.readdirSync(STORE_DIR);
  } catch {
    return null;
  }
  const match = entries.find(e => e.startsWith(encoded + '@'));
  if (!match) return null;
  const full = path.join(STORE_DIR, match, 'node_modules', pkgName);
  try {
    const m = require(full);
    return m && (m.default || m);
  } catch {
    return null;
  }
}

const classesPlugin = loadFromStore('@babel/plugin-transform-classes');
const classPropertiesPlugin = loadFromStore(
  '@babel/plugin-transform-class-properties'
);
const privateMethodsPlugin = loadFromStore(
  '@babel/plugin-transform-private-methods'
);
const privatePropInObjPlugin = loadFromStore(
  '@babel/plugin-transform-private-property-in-object'
);

const extraPlugins = [
  classesPlugin && [classesPlugin, {loose: true}],
  classPropertiesPlugin && [classPropertiesPlugin, {loose: true}],
  privateMethodsPlugin && [privateMethodsPlugin, {loose: true}],
  privatePropInObjPlugin && [privatePropInObjPlugin, {loose: true}],
].filter(Boolean);

// Log plugin loading result once (visible in Metro console)
if (extraPlugins.length > 0) {
  console.log(
    '[babel.config] hermesc-compat plugins loaded:',
    extraPlugins.length
  );
} else {
  console.warn('[babel.config] WARNING: hermesc-compat plugins NOT loaded');
}

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', {unstable_transformImportMeta: true}]],
    plugins: extraPlugins,
  };
};
