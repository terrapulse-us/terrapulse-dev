const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

module.exports = function withModularHeaders(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        "Podfile"
      );
      let podfile = fs.readFileSync(podfilePath, "utf8");

      if (podfile.includes("use_modular_headers!")) {
        return config;
      }

      podfile = podfile.replace(
        /^(platform :ios,.*)$/m,
        "$1\nuse_modular_headers!"
      );

      fs.writeFileSync(podfilePath, podfile);
      return config;
    },
  ]);
};
