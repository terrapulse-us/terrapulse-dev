const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Expo config plugin: wraps the CocoaPods hermes-engine hermesc binary so
 * it can handle private class field syntax (#field) that hermesc v0.12.0
 * (RN 0.81) rejects.
 *
 * Strategy: inject Ruby code INTO the existing post_install block rather
 * than appending a second block (CocoaPods only runs the last post_install).
 * The Ruby code reads scripts/hermesc-ios-wrapper.sh from the monorepo root
 * (avoiding all heredoc / escaping complexity) and copies it over the real
 * hermesc binary, backing up the original as hermesc.real.
 *
 * Path from ios/Podfile up to monorepo root: ../../..
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

      // Ruby lines to inject. Use short var names prefixed _hw_ to avoid
      // collisions with other post_install code. No heredoc needed — the
      // wrapper script is read from disk at pod-install time.
      const rubyLines = [
        `  ${marker}`,
        "  require 'fileutils'",
        "  _hw_src = File.expand_path('../../../scripts/hermesc-ios-wrapper.sh', __dir__)",
        "  if File.exist?(_hw_src)",
        "    Dir.glob(File.join(installer.sandbox.root.to_s, '**/destroot/bin/hermesc')).each do |_hw_dst|",
        "      next if File.exist?(_hw_dst + '.real')",
        "      next unless File.exist?(_hw_dst) && File.size(_hw_dst) > 1_000_000",
        "      FileUtils.cp(_hw_dst, _hw_dst + '.real')",
        "      FileUtils.cp(_hw_src, _hw_dst)",
        "      File.chmod(0755, _hw_dst)",
        "      puts \"hermesc wrapper installed: #{_hw_dst}\"",
        "    end",
        "  end",
      ].join("\n");

      if (podfile.includes("post_install do |installer|")) {
        // Insert at the top of the existing post_install block so
        // react_native_post_install still runs after our code.
        podfile = podfile.replace(
          "post_install do |installer|",
          "post_install do |installer|\n" + rubyLines
        );
      } else {
        // Fallback: no existing post_install — add one.
        podfile +=
          "\npost_install do |installer|\n" + rubyLines + "\nend\n";
      }

      fs.writeFileSync(podfilePath, podfile);
      return config;
    },
  ]);
};
