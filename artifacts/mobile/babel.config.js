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
 * We also keep the three plugins explicitly in the plugins array as a belt-and-
 * suspenders measure in case the profile option is not honoured by a future preset version.
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
    plugins: [
      ['@babel/plugin-transform-class-properties', { loose: true }],
      ['@babel/plugin-transform-private-methods', { loose: true }],
      ['@babel/plugin-transform-private-property-in-object', { loose: true }],
    ],
  };
};
