const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web") {
    if (moduleName === "@maplibre/maplibre-react-native") {
      return {
        filePath: path.resolve(__dirname, "stubs/maplibre-react-native.web.js"),
        type: "sourceFile",
      };
    }
    if (moduleName === "@api.video/react-native-livestream") {
      return {
        filePath: path.resolve(__dirname, "stubs/apivideo-livestream.web.js"),
        type: "sourceFile",
      };
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

// ROOT CAUSE of hermesc "private properties not supported" failures (RN 0.81 / hermesc v0.12.0):
//
// Metro resolves `require('react-native')` via the workspace-root top-level symlink:
//   workspaceRoot/node_modules/react-native  →  .pnpm/react-native@.../node_modules/react-native
// The SYMLINK path (before resolving) is workspaceRoot/node_modules/react-native.
// The previous pattern `(?!\.pnpm)` matched that symlink path → react-native was flagged as
// IGNORED (not transformed by Babel), so private class fields in Libraries/DOM/** passed
// straight through to hermesc v0.12.0 which rejects them.
//
// Fix: add react-native and @react-native to the exceptions alongside .pnpm.
// The workspaceRoot prefix still anchors the match so the "second-segment" inside
// .pnpm/<pkg>@ver/node_modules/<dep> paths is never inadvertently matched.
//
// SECONDARY FIX — Firebase auth "TypeError: Cannot assign to read-only property 'NONE'":
// Firebase packages ARE in .pnpm (exception above), so they get Babel-transformed by the
// hermes-v0 @babel/plugin-transform-classes spec-mode, which uses Object.defineProperty
// for class members. This inadvertently makes some Firebase property (named 'NONE') non-
// writable, causing auth/network-request-failed at runtime in Hermes strict mode.
// Firebase's pre-built CJS dist/rn/ output uses standard ES2017+ class syntax that Hermes
// v0.12.0 handles natively — no Babel transform needed. Adding a second pattern keeps
// firebase/@firebase OUT of the transform pipeline even though they live in .pnpm.
config.transformIgnorePatterns = [
  `${workspaceRoot}/node_modules/(?!(\\.pnpm|react-native|@react-native))`,
  `${workspaceRoot}/node_modules/\\.pnpm\\/(@firebase|firebase)`,
];

// Bump this string whenever babel.config.js plugins or transformIgnorePatterns change
// to force Metro to discard all cached module transforms and re-run Babel on every file.
config.cacheVersion = 'hermesc-compat-v12';

// Inject Event.NONE polyfill before any module code runs.
// Prevents the "Cannot assign to read-only property 'NONE'" crash that happens during
// module initialization in RN 0.81.x (hermesc builds) and triggers expo-updates error
// recovery, which then crashes natively with SIGABRT.
const originalGetPolyfills = config.serializer?.getPolyfills ?? (() => []);
config.serializer = {
  ...config.serializer,
  getPolyfills: ({ platform }) => [
    ...originalGetPolyfills({ platform }),
    require.resolve('./polyfills/eventPhasePolyfill.js'),
  ],
};

module.exports = config;
