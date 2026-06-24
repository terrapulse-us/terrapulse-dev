const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const SWIFT_FIX_BLOCK = `
# Fix HaishinKit / ApiVideoLiveStream Swift 6 strict concurrency for Xcode 26
post_install do |installer|
  swift_pods = ['HaishinKit', 'ApiVideoLiveStream', 'react-native-livestream', 'Logboard']
  installer.pods_project.targets.each do |target|
    if swift_pods.include?(target.name)
      target.build_configurations.each do |config|
        config.build_settings['SWIFT_VERSION'] = '5'
        config.build_settings['SWIFT_STRICT_CONCURRENCY'] = 'minimal'
        config.build_settings['OTHER_SWIFT_FLAGS'] = '$(inherited) -Xfrontend -strict-concurrency=minimal'
      end
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

      if (podfile.includes("Fix HaishinKit")) {
        return config;
      }

      podfile = podfile + "\n" + SWIFT_FIX_BLOCK;
      fs.writeFileSync(podfilePath, podfile);
      return config;
    },
  ]);
};
