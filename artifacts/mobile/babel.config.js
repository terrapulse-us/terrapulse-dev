/**
 * babel.config.js
 *
 * hermesc linux64 v0.12.0 (bundled with RN 0.81.5) cannot compile class syntax
 * (class declarations, class expressions, private fields, private methods).
 *
 * Plugins loaded from pnpm store by absolute path (exist as transitive deps
 * of @babel/core@7.29.0 — no `pnpm install` needed).
 *
 * WHY NO @babel/plugin-transform-classes here:
 *   That plugin uses @babel/helper-create-class-features-plugin internally.
 *   When it processes a class with fields, the helper checks whether the
 *   class-properties plugin has "claimed" those fields via a shared registry
 *   keyed by plugin version. With v7 and v8 of the helper both present in the
 *   pnpm store (used by different packages), they use different registry keys
 *   and can't coordinate → "Missing class properties transform" on FlatList.js
 *   regardless of plugin ordering. Instead, plain class declarations are handled
 *   by patching the react-native source directly (see patches/react-native@0.81.5.patch).
 *
 * @babel/plugin-transform-class-properties is intentionally OMITTED:
 *   babel-preset-expo (via @react-native/babel-preset) already includes it.
 *
 * Plugins included:
 *   @babel/plugin-transform-private-methods  — #method() → mangled names
 *   @babel/plugin-transform-private-property-in-object — #field in obj
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

const privateMethodsPlugin = loadFromStore(
  '@babel/plugin-transform-private-methods'
);
const privatePropInObjPlugin = loadFromStore(
  '@babel/plugin-transform-private-property-in-object'
);

const extraPlugins = [
  privateMethodsPlugin && [privateMethodsPlugin],
  privatePropInObjPlugin && [privatePropInObjPlugin],
].filter(Boolean);

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
