---
name: Firebase config via app.config.js extra
description: How to pass Firebase credentials to React Native so they work in both Replit dev and EAS cloud builds
---

## The pattern
Route Firebase config through `app.config.js extra` → `Constants.expoConfig.extra` instead of `process.env` directly in the app code.

**app.config.js:**
```js
extra: {
  firebaseApiKey: process.env.GOOGLE_API_KEY ?? process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? "",
  firebaseAuthDomain: "your-project.firebaseapp.com", // public — safe to hard-code
  firebaseProjectId: "your-project",
  // ... other public values hard-coded
}
```

**lib/firebase.ts:**
```ts
import Constants from "expo-constants";
const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
const firebaseConfig = {
  apiKey: extra.firebaseApiKey ?? "",
  authDomain: extra.firebaseAuthDomain ?? "",
  // ...
};
```

## Why this works
- `app.config.js` is evaluated at BUILD TIME and can read any env var name
- On Replit dev: reads `GOOGLE_API_KEY` from Replit secrets ✅
- On EAS builds: reads `GOOGLE_API_KEY` from EAS secrets (same name) ✅
- `process.env.ANYTHING` in app code only works for `EXPO_PUBLIC_*` vars — plain `GOOGLE_API_KEY` gets stripped from the bundle by Babel

## Non-sensitive Firebase values
authDomain, projectId, storageBucket, messagingSenderId, appId are PUBLIC config (visible in any browser using the Firebase project). Safe to hard-code as defaults in app.config.js.

**Why:** Only the apiKey needs to come from a secret, and even that is a public key in Firebase's security model — real security comes from Firebase Security Rules, not the key.

## EAS secret setup
Add `GOOGLE_API_KEY` (same name as Replit) as a single EAS secret on expo.dev. No need to rename it.
