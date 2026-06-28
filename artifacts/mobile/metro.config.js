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

// In pnpm workspaces, packages live at:
//   <workspaceRoot>/node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>/file.js
//
// The default Metro transformIgnorePatterns regex matches BOTH:
//   1. <workspaceRoot>/node_modules/.pnpm/   (first segment — .pnpm is in allowlist, OK)
//   2. <pkg>/node_modules/<other-pkg>/        (second segment — other-pkg not in allowlist → WRONGLY excluded)
//
// Fix: anchor the pattern to the absolute workspace root path so it only fires once.
// Anything inside node_modules/.pnpm/ is then transformed by Babel (including our
// private-class-field plugins), making the bundle compatible with hermesc linux64 v0.12.0.
config.transformIgnorePatterns = [
  `${workspaceRoot}/node_modules/(?!\\.pnpm)`,
];

// Bump this string whenever babel.config.js plugins change to force Metro to
// discard all cached module transforms and re-run Babel on every file.
config.cacheVersion = 'hermesc-compat-v6';

module.exports = config;
