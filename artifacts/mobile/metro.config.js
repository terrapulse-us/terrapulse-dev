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

// Transform ALL packages — only firebase is excluded (pre-built CJS, NONE property issue).
//
// Previously we had a catch-all ignore pattern for node_modules. That caused packages
// with ES2022+ private class syntax (e.g. @tanstack/react-query v5) to bypass Babel when
// accessed via workspace-level pnpm symlinks whose paths don't contain ".pnpm". Those
// private methods passed through to hermesc v0.12.0 untransformed -> build failure.
//
// Without a catch-all, every file is Babel-processed with the hermes-v0 profile.
// Metro's content-hash cache keeps subsequent builds fast.
//
// Firebase must stay excluded: the hermes-v0 transform-classes plugin makes its internal
// 'NONE' property non-writable (via Object.defineProperty), causing a runtime TypeError.
config.transformIgnorePatterns = [
  // .pnpm real paths for firebase — do NOT transform
  `${workspaceRoot}/node_modules/\\.pnpm\\/(@firebase|firebase)`,
  // workspace-level symlinks for firebase — do NOT transform
  `${workspaceRoot}/node_modules/(@firebase|firebase)[/\\\\]`,
];

// Bump this string whenever babel.config.js plugins or transformIgnorePatterns change
// to force Metro to discard all cached module transforms and re-run Babel on every file.
config.cacheVersion = 'hermesc-compat-v14';

// Inject Event.NONE polyfill before any module code runs.
const originalGetPolyfills = config.serializer?.getPolyfills ?? (() => []);
config.serializer = {
  ...config.serializer,
  getPolyfills: ({ platform }) => [
    ...originalGetPolyfills({ platform }),
    require.resolve('./polyfills/eventPhasePolyfill.js'),
  ],
};

module.exports = config;
