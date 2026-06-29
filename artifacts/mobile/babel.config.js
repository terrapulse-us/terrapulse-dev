/**
 * hermesc v0.12.0 (shipped with RN 0.81.5) rejects class field declarations
 * (public `name;` / `x = 0;` and private `#x;`) with "invalid statement encountered".
 *
 * babel-preset-expo on hermes-stable intentionally omits @babel/plugin-transform-class-properties
 * because Hermes v1 supports class fields natively — but hermesc v0.12.0 is NOT Hermes v1.
 *
 * Fix: explicitly add the three class-field plugins so Metro transforms them away
 * before hermesc sees the bundle. The plugins are direct devDependencies of this
 * package so pnpm always installs them — no fragile store path scanning needed.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
    plugins: [
      ['@babel/plugin-transform-class-properties', { loose: true }],
      ['@babel/plugin-transform-private-methods', { loose: true }],
      ['@babel/plugin-transform-private-property-in-object', { loose: true }],
    ],
  };
};
