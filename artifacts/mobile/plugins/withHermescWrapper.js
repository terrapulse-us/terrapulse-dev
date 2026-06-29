const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Expo config plugin — works around hermesc v0.12.0 (RN 0.81) rejecting
 * private class field syntax (#field) in main.jsbundle.
 *
 * PREVIOUS APPROACH (broken): replace the Pods hermesc binary in post_install.
 * PROBLEM: the "[CP-User] [Hermes] Replace Hermes for the right configuration"
 * Xcode build phase runs AFTER pod install and overwrites any binary we place.
 *
 * CURRENT APPROACH: set HERMES_CLI_PATH in the Xcode project's build settings
 * from the post_install hook. react-native-xcode.sh reads HERMES_CLI_PATH and
 * invokes our wrapper script instead of the Pods binary directly. The wrapper
 * pre-processes the .jsbundle file with perl (stripping #field syntax) then
 * calls the real Pods hermesc. "Replace Hermes" can overwrite the binary freely —
 * we never touch it.
 *
 * Path arithmetic:
 *   $(SRCROOT) = {workspace}/artifacts/mobile/ios
 *   $(SRCROOT)/../../../scripts = {workspace}/scripts  ✓
 */
module.exports = function withHermescWrapper(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        "Podfile"
      );
      let podfile = fs.readFileSync(podfilePath, "utf8");

      const marker = "# hermesc-wrapper-post-install";
      if (podfile.includes(marker)) {
        return config;
      }

      // Ruby injected into the existing post_install block.
      // Sets HERMES_CLI_PATH in the .xcodeproj build settings so
      // react-native-xcode.sh calls scripts/hermesc-ios-wrapper.sh.
      // Also chmods the script so Xcode can execute it.
      const rubyLines = [
        `  ${marker}`,
        "  # Point HERMES_CLI_PATH to our wrapper so react-native-xcode.sh",
        "  # pre-processes .jsbundle with perl before calling the real hermesc.",
        "  _hw_script = File.expand_path('../../../scripts/hermesc-ios-wrapper.sh', __dir__)",
        "  if File.exist?(_hw_script)",
        "    File.chmod(0755, _hw_script)",
        "    _hw_xcode_path = '$(SRCROOT)/../../../scripts/hermesc-ios-wrapper.sh'",
        "    installer.aggregate_targets.each do |_hw_agg|",
        "      _hw_agg.user_project.targets.each do |_hw_t|",
        "        _hw_t.build_configurations.each do |_hw_bc|",
        "          _hw_bc.build_settings['HERMES_CLI_PATH'] = _hw_xcode_path",
        "        end",
        "      end",
        "      _hw_agg.user_project.save",
        "    end",
        "    puts \"hermesc wrapper: HERMES_CLI_PATH -> #{_hw_xcode_path}\"",
        "  else",
        "    puts \"hermesc wrapper: SKIPPED (script not found at #{_hw_script})\"",
        "  end",
      ].join("\n");

      if (podfile.includes("post_install do |installer|")) {
        podfile = podfile.replace(
          "post_install do |installer|",
          "post_install do |installer|\n" + rubyLines
        );
      } else {
        podfile +=
          "\npost_install do |installer|\n" + rubyLines + "\nend\n";
      }

      fs.writeFileSync(podfilePath, podfile);
      return config;
    },
  ]);
};
