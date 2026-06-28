---
name: EAS CLI setup on Replit
description: How to authenticate and configure EAS CLI within the Replit shell environment
---

**Rule:** `eas login` opens a browser URL that fails in Replit's sandboxed shell. Use `EXPO_TOKEN` instead.

**How to apply:**
1. Create a Personal Access Token at expo.dev/settings/access-tokens
2. In the Replit shell: `export EXPO_TOKEN=<token>`
3. Verify: `eas whoami`

**env:create flags (EAS CLI 20.x):**
- `eas secret:create` is deprecated — use `eas env:create`
- Required flags in non-interactive mode: `--environment` (development|preview|production), `--visibility` (plaintext|sensitive|secret), `--non-interactive`
- Loop over environments to create vars for all three at once

**eas.json submit section:** Empty string values for `ios.appleId`, `ios.ascAppId`, `ios.appleTeamId` fail validation. Remove the ios block entirely until Apple credentials are available.

**owner field:** Must match the exact Expo account slug that owns the project (from `eas whoami`). Personal account vs team account matters — use the one that has project creation permission.

**`eas update` in Replit main agent:** The final step of `eas update` triggers a destructive git operation (creating/recording a git commit) which the Replit sandbox blocks. Use `EAS_SKIP_AUTO_FINGERPRINT=1` to skip the fingerprint+git step and publish successfully:
```bash
EAS_SKIP_AUTO_FINGERPRINT=1 eas update --branch preview --message "..."
```
