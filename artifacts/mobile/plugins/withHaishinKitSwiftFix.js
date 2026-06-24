const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const SWIFT_FIX_HOOK = `
  installer.pods_project.targets.each do |target|
    if ['HaishinKit', 'ApiVideoLiveStream', 'react-native-livestream', 'Logboard'].include?(target.name)
      target.build_configurations.each do |config|
        config.build_settings['SWIFT_STRICT_CONCURRENCY'] = 'minimal'
        config.build_settings['SWIFT_VERSION'] = '5'
      end
    end
  end
`;

module.exports = function withHaishinKitSwiftFix(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        "Podfile"
      );
      let podfile = fs.readFileSync(podfilePath, "utf8");

      if (podfile.includes("SWIFT_STRICT_CONCURRENCY")) {
        return config;
      }

      if (podfile.includes("post_install do |installer|")) {
        podfile = podfile.replace(
          "post_install do |installer|",
          `post_install do |installer|\n${SWIFT_FIX_HOOK}`
        );
      } else {
        podfile += `\npost_install do |installer|\n${SWIFT_FIX_HOOK}\nend\n`;
      }

      fs.writeFileSync(podfilePath, podfile);
      return config;
    },
  ]);
};
