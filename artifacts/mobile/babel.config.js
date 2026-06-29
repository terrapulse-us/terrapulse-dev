/**
 * babel.config.js
 *
 * ROOT CAUSE of hermesc v0.12.0 (RN 0.81.5) "invalid statement encountered":
 *
 *   babel-preset-expo detects `engine === 'hermes'` from Metro's caller and
 *   switches to the `hermes-stable` transform profile, which loads hermes-v1.js.
 *   hermes-v1.js INTENTIONALLY omits @babel/plugin-transform-class-properties
 *   because Hermes v1 (SDK 56+) supports class fields natively.
 *
 *   hermesc v0.12.0 is NOT Hermes v1 — it rejects ALL class field declarations
 *   (both private `#x;` and public `name;` / `x = 0;`) with "invalid statement
 *   encountered". Since hermes-v1 does not transform them, they pass through
 *   Metro into the .jsbundle unchanged, and hermesc rejects the bundle.
 *
 * FIX:
 *   Explicitly add @babel/plugin-transform-class-properties here so it runs
 *   for ALL files processed by Metro, regardless of which hermes config the
 *   preset selects. This does NOT trigger the helper-version conflict because
 *   we are NOT adding @babel/plugin-transform-classes (the conflict only occurs
 *   when both transform-classes AND transform-class-properties share
 *   @babel/helper-create-class-features-plugin from different versions).
 *
 * WHY NO @babel/plugin-transform-classes:
 *   hermesc v0.12.0 supports class DECLARATIONS; it only rejects class FIELD
 *   declarations. Also, transform-classes + transform-class-properties from
 *   different pnpm helper versions causes "Missing class properties transform"
 *   on FlatList.js.
 *
 * Plugin loading:
 *   @babel/plugin-transform-class-properties is a transitive dep of
 *   babel-preset-expo in the pnpm store at workspaceRoot/node_modules/.pnpm/.
 *   We load it by absolute path so it resolves to the exact same instance as
 *   the one babel-preset-expo itself uses, avoiding double-registration.
 */
const path = require('path');
const fs = require('fs');

const STORE_DIR = path.join(__dirname, '../../node_modules/.pnpm');

function loadFromStore(pkgName) {
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

const classPropsPlugin   = loadFromStore('@babel/plugin-transform-class-properties');
const privateMethodsPlugin = loadFromStore('@babel/plugin-transform-private-methods');
const privatePropInObjPlugin = loadFromStore('@babel/plugin-transform-private-property-in-object');

const extraPlugins = [
  classPropsPlugin   && [classPropsPlugin,   { loose: true }],
  privateMethodsPlugin && [privateMethodsPlugin, { loose: true }],
  privatePropInObjPlugin && [privatePropInObjPlugin, { loose: true }],
].filter(Boolean);

const loadedNames = [
  classPropsPlugin   ? 'class-properties' : null,
  privateMethodsPlugin ? 'private-methods' : null,
  privatePropInObjPlugin ? 'private-prop-in-object' : null,
].filter(Boolean);

if (loadedNames.length > 0) {
  console.log('[babel.config] hermesc-compat plugins loaded:', loadedNames.join(', '));
} else {
  console.warn('[babel.config] WARNING: no hermesc-compat plugins loaded');
}

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
    plugins: extraPlugins,
  };
};
