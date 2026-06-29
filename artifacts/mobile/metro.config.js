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
  if (platform === "web" && moduleName === "@maplibre/maplibre-react-native") {
    return {
      filePath: path.resolve(__dirname, "stubs/maplibre-react-native.web.js"),
      type: "sourceFile",
    };
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
config.transformIgnorePatterns = [
  `${workspaceRoot}/node_modules/(?!(\\.pnpm|react-native|@react-native))`,
];

// Bump this string whenever babel.config.js plugins or transformIgnorePatterns change
// to force Metro to discard all cached module transforms and re-run Babel on every file.
config.cacheVersion = 'hermesc-compat-v8';

module.exports = config;
