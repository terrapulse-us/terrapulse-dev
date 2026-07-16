/**
 * hermesc v0.12.0 (RN 0.81.5) rejects class field declarations with
 * "invalid statement encountered". babel-preset-expo's hermes-stable profile
 * (hermes-v1.js) intentionally omits @babel/plugin-transform-class-properties
 * because Hermes v1 supports class fields natively — but hermesc v0.12.0 is not v1.
 *
 * Fix: force the hermes-v0 transform profile in babel-preset-expo. The v0 profile
 * includes @babel/plugin-transform-class-properties, transform-private-methods,
 * transform-private-property-in-object, AND transform-classes, which fully converts
 * all class syntax to ES5 before hermesc sees the bundle.
 *
 * IMPORTANT: do NOT re-add those class-feature plugins to a top-level `plugins`
 * array. Top-level plugins run before ALL presets, i.e. before babel-preset-expo's
 * TypeScript transform. That breaks any node_modules .ts source that uses
 * TypeScript `declare` class fields (e.g. expo-file-system/src/ExpoFileSystem.ts)
 * with: "TypeScript 'declare' fields must first be transformed by
 * @babel/plugin-transform-typescript." The hermes-v0 profile already applies the
 * same transforms in the correct order inside the preset, and the hermesc wrapper's
 * AST-based bundle transform is the final safety net at build time.
 *
 * NOTE: the @babel/plugin-transform-* packages in this package's package.json are
 * no longer referenced by this config, but they MUST stay installed — the hermesc
 * wrapper (scripts/transform-bundle-classes.cjs) requires them at build time and
 * silently skips its class transform if they're missing.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          unstable_transformImportMeta: true,
          unstable_transformProfile: 'hermes-v0',
        },
      ],
    ],
  };
};
