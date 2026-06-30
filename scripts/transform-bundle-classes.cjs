#!/usr/bin/env node
/**
 * transform-bundle-classes.cjs
 *
 * Called by the hermesc wrapper BEFORE passing the bundle to hermesc.real.
 * Converts class syntax, class properties, private methods, and async functions
 * to ES5/ES6 constructs that hermesc linux64 v0.12.0 can compile.
 *
 * WHY here (not in babel.config.js):
 *   Metro runs Babel on INDIVIDUAL SOURCE FILES in separate Worker threads, each
 *   with an isolated require() cache. @babel/plugin-transform-classes and
 *   @babel/plugin-transform-class-properties each load a SEPARATE instance of
 *   @babel/helper-create-class-features-plugin. The registration/coordination
 *   check between the two plugins then fails: "Missing class properties transform".
 *
 *   This script runs in a SINGLE Node.js process on the fully-assembled Metro
 *   BUNDLE OUTPUT. All plugins share the same require() cache → same helper
 *   instances → registration works correctly.
 *
 * hermesc 0.12.0 limitations handled here:
 *   - class declarations / class expressions
 *   - static and instance class fields (public + private)
 *   - private methods (#method() {})
 *   - async / await functions
 *   - async generator functions
 *
 * Plugin order (important):
 *   1. @babel/plugin-transform-class-properties    — static/instance fields
 *   2. @babel/plugin-transform-private-methods     — private methods (#m(){})
 *   3. @babel/plugin-transform-private-property-in-object
 *   4. @babel/plugin-transform-class-static-block  — static { } blocks
 *   5. @babel/plugin-transform-classes             — class → function/prototype
 *   6. @babel/plugin-transform-async-to-generator  — async/await → generator
 *   7. @babel/plugin-transform-async-generator-functions — async function*
 *
 * All Babel packages are in the root package.json devDependencies so they are
 * always present in root node_modules/ — on both Replit (node-modules linker)
 * and EAS cloud (isolated linker). Plain require() resolves them correctly via
 * Node's standard module resolution walking up from __dirname.
 *
 * Usage: node transform-bundle-classes.cjs <bundle.js>
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const bundlePath = process.argv[2];
if (!bundlePath || !fs.existsSync(bundlePath)) {
  process.exit(0);
}

function tryRequire(name) {
  try {
    const m = require(name);
    return (m && m.default) || m;
  } catch (e) {
    process.stderr.write('[hermesc-wrapper] Cannot require ' + name + ': ' + e.message + '\n');
    return null;
  }
}

const babel              = tryRequire('@babel/core');
const classPropPlugin    = tryRequire('@babel/plugin-transform-class-properties');
const privMethodsPlugin  = tryRequire('@babel/plugin-transform-private-methods');
const privPropInObjPlugin = tryRequire('@babel/plugin-transform-private-property-in-object');
const classStaticPlugin  = tryRequire('@babel/plugin-transform-class-static-block');
const classesPlugin      = tryRequire('@babel/plugin-transform-classes');
const asyncToGenPlugin   = tryRequire('@babel/plugin-transform-async-to-generator');
const asyncGenFnsPlugin  = tryRequire('@babel/plugin-transform-async-generator-functions');

if (!babel || !classPropPlugin || !classesPlugin || !asyncToGenPlugin) {
  process.stderr.write(
    '[hermesc-wrapper] Missing required Babel deps — skipping class transform\n' +
    '  babel=' + !!babel + ' classProp=' + !!classPropPlugin +
    ' classes=' + !!classesPlugin + ' async=' + !!asyncToGenPlugin + '\n'
  );
  process.exit(0);
}

const plugins = [
  // All three loose-mode class plugins MUST share loose:true or @babel/plugin-transform-class-properties
  // throws a consistency error, silently bailing out on the transform.
  [classPropPlugin,   { loose: true }],
  ...(privMethodsPlugin    ? [[privMethodsPlugin,    { loose: true }]] : []),
  ...(privPropInObjPlugin  ? [[privPropInObjPlugin,  { loose: true }]] : []),
  ...(classStaticPlugin    ? [[classStaticPlugin]]                     : []),
  [classesPlugin,     { loose: true }],
  [asyncToGenPlugin],
  ...(asyncGenFnsPlugin    ? [[asyncGenFnsPlugin]]                     : []),
];

const code = fs.readFileSync(bundlePath, 'utf8');

let result;
try {
  result = babel.transformSync(code, {
    filename:   bundlePath,
    plugins,
    configFile: false,
    babelrc:    false,
    sourceType: 'script',
    sourceMaps: false,
    compact:    false,
  });
} catch (e) {
  process.stderr.write('[hermesc-wrapper] Babel transform failed: ' + e.message + '\n');
  process.exit(0);
}

if (result && result.code) {
  fs.writeFileSync(bundlePath, result.code, 'utf8');
  process.stderr.write('[hermesc-wrapper] Class transform applied to ' + path.basename(bundlePath) + '\n');
}
