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

// In pnpm workspaces Metro resolves symlinks, so file paths go through
// node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>/...
// The default Metro pattern ignores everything after the first node_modules/,
// which means packages like react-native's DOMRect (using private class fields
// #x #y #width #height added in RN 0.81) are never Babel-transformed and
// Hermes refuses to compile them.
//
// NOTE: Metro reads transformIgnorePatterns at the TOP LEVEL of config,
// not under config.transformer — setting it there silently does nothing.
config.transformIgnorePatterns = [
  "node_modules/(?!(\\.pnpm|react-native|@react-native|expo|@expo|@maplibre)/)",
];

module.exports = config;
