#!/usr/bin/env node
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
  process.stderr.write('[hermesc-wrapper] Missing required Babel deps — skipping class transform\n');
  process.exit(0);
}

const plugins = [
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
