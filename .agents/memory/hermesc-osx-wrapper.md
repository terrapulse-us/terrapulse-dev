---
name: hermesc osx-bin wrapper for EAS iOS builds
description: EAS iOS cloud builds use macOS osx-bin/hermesc; the wrapper must cover it and use perl not BSD sed
---

# hermesc wrapper must cover osx-bin for EAS iOS builds

## Rule
The `scripts/install-hermesc-wrapper.sh` postinstall loop must iterate over **both** `linux64-bin` and `osx-bin`. The embedded wrapper must use `perl -i` not `sed -i`.

## Why
EAS iOS builds run on Expo-managed **macOS** cloud machines. Those machines:
1. Only have `osx-bin/hermesc` — `linux64-bin` doesn't exist there
2. Run `pnpm install` (triggering postinstall) then invoke hermesc via Xcode/Metro
3. If only `linux64-bin` is wrapped, `osx-bin/hermesc` receives raw JS with private class fields → "private properties are not supported" errors → iOS build failure

BSD `sed -i` (macOS) requires an explicit backup extension: `sed -i ''`. GNU `sed -i` (Linux) does not. Using `perl -i -pe` / `perl -i -ne` is identical on both platforms.

## How to apply
- Loop: `for platform in linux64-bin osx-bin; do`
- Step 1 replace: `perl -i -pe 's/this\.#([a-zA-Z_][a-zA-Z0-9_]*)/this.___$1/g' "$INPUT_JS"`
- Step 2 replace: `perl -i -ne 'print unless /^\s+#[a-zA-Z_][a-zA-Z0-9_]*\s*[;=]/ || /^\s+___[a-zA-Z_][a-zA-Z0-9_]*\s*[;=]/' "$INPUT_JS"`
- Relevant file: `scripts/install-hermesc-wrapper.sh`
