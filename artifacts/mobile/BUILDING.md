# Building Android APKs via EAS + GitHub

EAS builds cannot be triggered directly from Replit (git sandbox restrictions).
This guide covers two methods to build Android APKs once the repo is on GitHub.

---

## Prerequisites — one-time setup

### 1. Get your Expo token
1. Go to [expo.dev](https://expo.dev) → **Account Settings → Access Tokens**
2. Click **Create Token**, name it `GITHUB_ACTIONS` (or anything)
3. Copy the token — you'll need it in the next step

### 2. Export the Replit project to GitHub
1. In Replit, open the **Shell** (or the Git panel)
2. Click the **Connect to GitHub** button in the Replit Git panel, or:
   ```
   # In the Replit Git sidebar → "Push to GitHub" → create a new repo
   ```
3. Choose a repo name (e.g. `terrapulse`) and push

### 3. Add the secret to your GitHub repo
1. In your new GitHub repo → **Settings → Secrets and variables → Actions**
2. Click **New repository secret**
3. Name: `EXPO_TOKEN`, Value: the token from step 1
4. Save

---

## Method A — GitHub Actions (manual trigger)

A `workflow_dispatch` workflow lives at `.github/workflows/eas-build-android.yml`.

1. Go to your GitHub repo → **Actions** tab
2. Select **EAS Android APK Build** in the left sidebar
3. Click **Run workflow** → choose `preview` (APK) or `development`
4. Click **Run workflow** — EAS picks it up and builds in the cloud

The finished APK download link appears in the EAS dashboard at
`expo.dev/accounts/mclaporteterrapulses-team/projects/mobile/builds`.

---

## Method B — expo.dev dashboard (one-click)

1. Go to [expo.dev](https://expo.dev) → your project → **GitHub** tab
2. Click **Connect a GitHub repository** and authorize the Expo GitHub app
3. Select the repo you pushed in step 2 above
4. Go to **Builds** → **Trigger a build**
5. Platform: **Android**, Profile: **preview**, Branch: `main`
6. Click **Build** — done

---

## Build profiles (eas.json)

| Profile | Output | Use for |
|---------|--------|---------|
| `preview` | `.apk` (sideloadable) | Testing on physical device |
| `development` | `.apk` debug build | Expo dev client |
| `production` | `.aab` app bundle | Play Store submission |

EAS project ID: `5e42857a-9f58-4c15-8b0b-571dd97b3189`
EAS owner: `mclaporteterrapulses-team`
