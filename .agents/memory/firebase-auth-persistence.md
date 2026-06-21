---
name: Firebase 12 React Native auth persistence
description: How to handle auth persistence on React Native with Firebase 12, which removed getReactNativePersistence
---

**Rule:** Firebase 12 removed `getReactNativePersistence` entirely — do not import it from any path. Implement a custom AsyncStorage persistence adapter instead.

**Why:** Firebase 12 dropped this function from the public API. Importing it from `firebase/auth` causes a TypeScript error (TS2305). The `/react-native` subpath export also does not exist.

**How to apply:** In `lib/firebase.ts`, build a custom persistence object:

```typescript
function buildAsyncStoragePersistence() {
  const AsyncStorage = require("@react-native-async-storage/async-storage").default;
  return {
    type: "LOCAL" as const,
    _isAvailable: async () => true,
    _set: async (key: string, value: string) => { await AsyncStorage.setItem(key, JSON.stringify(value)); },
    _get: async (key: string) => { const raw = await AsyncStorage.getItem(key); return raw !== null ? JSON.parse(raw) : null; },
    _remove: async (key: string) => { await AsyncStorage.removeItem(key); },
    _addListener: (_key: string, _listener: () => void) => {},
    _removeListener: (_key: string, _listener: () => void) => {},
  };
}
```

Pass it to `initializeAuth` with `as any` to satisfy the Persistence type. Use `getAuth(app)` unchanged on web.
