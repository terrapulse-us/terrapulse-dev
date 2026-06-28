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

// In pnpm workspaces, Metro resolves symlinks so real file paths go through
// node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>/...
// The default Metro ignore pattern skips everything after the first node_modules/
// which means .pnpm packages (including those using private class fields like
// @maplibre/maplibre-react-native v11) are never Babel-transformed.
// Adding .pnpm to the allowlist ensures all packages inside the store get
// transpiled — private class fields become valid Hermes bytecode.
config.transformer.transformIgnorePatterns = [
  "node_modules/(?!(\\.pnpm|react-native|@react-native|expo|@expo|@maplibre)/)",
];

module.exports = config;
