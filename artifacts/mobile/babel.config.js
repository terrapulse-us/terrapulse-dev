/**
 * babel.config.js
 *
 * hermesc linux64 v0.12.0 (bundled with RN 0.81.5) cannot compile:
 *   - private class fields:  #field
 *   - ANY class field declarations: field; / field = value;
 *
 * These three plugins (loaded by absolute pnpm-store path to avoid needing
 * `pnpm install` for them as direct dependencies) transform all class-field
 * syntax to constructor assignments before hermesc is invoked.
 *
 * The plugins are already in the pnpm store as transitive dependencies of
 * @babel/core@7.29.0 / babel-preset-expo@54.
 */
const path = require('path');

function loadFromStore(pkgName) {
  const encoded = pkgName.replace(/@/g, '').replace(/\//g, '+');
  const storeDir = path.join(__dirname, '../../node_modules/.pnpm');
  const fs = require('fs');
  const entries = fs.readdirSync(storeDir);
  const match = entries.find(
    e => e.startsWith(encoded + '@') || e.startsWith('@' + encoded + '@')
  );
  if (!match) return null;
  const full = path.join(storeDir, match, 'node_modules', pkgName);
  try {
    return require(full);
  } catch {
    return null;
  }
}

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
  classPropertiesPlugin && [classPropertiesPlugin, {loose: true}],
  privateMethodsPlugin && [privateMethodsPlugin, {loose: true}],
  privatePropInObjPlugin && [privatePropInObjPlugin, {loose: true}],
].filter(Boolean);

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', {unstable_transformImportMeta: true}]],
    plugins: extraPlugins,
  };
};
