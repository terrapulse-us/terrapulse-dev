const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Expo config plugin: adds a CocoaPods post_install hook that wraps the
 * hermes-engine hermesc binary to strip private class field syntax.
 *
 * WHY: hermesc v0.12.0 (bundled with RN 0.81) rejects private class fields
 * (#field). For iOS, Xcode invokes hermesc from the CocoaPods hermes-engine
 * pod ($PODS_ROOT/hermes-engine/destroot/bin/hermesc), NOT from the pnpm
 * store — so the pnpm postinstall wrapper has no effect on iOS builds.
 * This plugin wraps the CocoaPods binary instead.
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

      // Ruby code injected as a separate post_install block.
      // CocoaPods runs all post_install blocks in order.
      // The <<~'WRAPPER_BASH' single-quoted heredoc passes content verbatim
      // (no Ruby interpolation), so $1, \s, etc. reach the bash script intact.
      const rubyBlock = `
post_install do |installer|
  ${marker}
  # hermesc v0.12.0 (RN 0.81) cannot compile private class fields (#field).
  # Wrap the CocoaPods hermesc binary with a perl-based preprocessor.
  require 'fileutils'
  Dir.glob(File.join(installer.sandbox.root.to_s, '**/destroot/bin/hermesc')).each do |hermesc_path|
    real_path = hermesc_path + '.real'
    next if File.exist?(real_path)
    next unless File.exist?(hermesc_path) && File.size(hermesc_path) > 1_000_000
    FileUtils.cp(hermesc_path, real_path)
    wrapper = <<~'WRAPPER_BASH'
      #!/bin/bash
      REAL_HERMESC="$(dirname "$0")/hermesc.real"
      INPUT_JS=""
      for arg in "$@"; do case "$arg" in *.js) INPUT_JS="$arg" ;; esac; done
      if [ -n "$INPUT_JS" ] && [ -f "$INPUT_JS" ]; then
        perl -i -pe 's/this\\.#([a-zA-Z_][a-zA-Z0-9_]*)/this.___$1/g' "$INPUT_JS"
        perl -i -ne 'print unless /^\\s+#[a-zA-Z_][a-zA-Z0-9_]*\\s*[;=]/ || /^\\s+___[a-zA-Z_][a-zA-Z0-9_]*\\s*[;=]/' "$INPUT_JS"
      fi
      exec "$REAL_HERMESC" "$@"
    WRAPPER_BASH
    File.write(hermesc_path, wrapper)
    File.chmod(0755, hermesc_path)
    puts "hermesc wrapper installed: #{hermesc_path}"
  end
end
`;

      podfile += rubyBlock;
      fs.writeFileSync(podfilePath, podfile);
      return config;
    },
  ]);
};
