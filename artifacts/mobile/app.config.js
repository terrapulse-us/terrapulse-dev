module.exports = () => ({
  expo: {
    name: "TerraPulse",
    slug: "mobile",
    version: "1.0.22",
    orientation: "portrait",
    updates: {
      url: "https://u.expo.dev/5e42857a-9f58-4c15-8b0b-571dd97b3189",
      enabled: false,
      checkAutomatically: "ON_LOAD",
      fallbackToCacheTimeout: 0,
    },
    runtimeVersion: {
      policy: "appVersion",
    },
    icon: "./assets/images/icon.png",
    scheme: "terrapulse",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    splash: {
      image: "./assets/images/icon.png",
      resizeMode: "contain",
      backgroundColor: "#EBE4D1",
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.terrapulse.app",
      buildNumber: String(Math.floor(Date.now() / 1000)),
      appleTeamId: "TN4GRQ3Y6V",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        GIDClientID:
          "516913346465-uvejqbkgh99qd8l2rfug4tqnmlj7m101.apps.googleusercontent.com",
        NSCameraUsageDescription:
          "TerraPulse uses your camera to broadcast live off-road streams.",
        NSMicrophoneUsageDescription:
          "TerraPulse uses your microphone to capture audio during live broadcasts.",
        NSLocationWhenInUseUsageDescription:
          "TerraPulse uses your location to show nearby trails and GPS telemetry during live streams.",
        NSPhotoLibraryUsageDescription:
          "TerraPulse needs photo library access to upload trail community photos.",
        CFBundleURLTypes: [
          { CFBundleURLSchemes: ["terrapulse"] },
          { CFBundleURLSchemes: ["com.googleusercontent.apps.516913346465-uvejqbkgh99qd8l2rfug4tqnmlj7m101"] },
        ],
      },
    },
    android: {
      package: "com.terrapulse.app",
      permissions: [
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.CAMERA",
        "android.permission.RECORD_AUDIO",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
      ],
    },
    web: {
      favicon: "./assets/images/icon.png",
    },
    plugins: [
      ["expo-router", { origin: "https://replit.com/" }],
      "expo-font",
      "expo-web-browser",
      [
        "expo-camera",
        {
          cameraPermission:
            "TerraPulse uses your camera to broadcast live off-road streams.",
          microphonePermission:
            "TerraPulse uses your microphone to capture audio during live broadcasts.",
          recordAudioAndroid: true,
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission:
            "TerraPulse needs photo library access to upload trail community photos.",
        },
      ],
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "TerraPulse uses your location to show nearby trails and GPS telemetry during live streams.",
        },
      ],
      "@maplibre/maplibre-react-native",
      "./plugins/withModularHeaders",
      "./plugins/withHermescWrapper",
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      maptilerApiKey: process.env.MAPTILER_API_KEY || "3EmaPZ2ftYudXivDYAER",
      // Firebase config — apiKey comes from GOOGLE_API_KEY secret (Replit) or
      // EXPO_PUBLIC_FIREBASE_API_KEY (EAS secret). Other values are public config
      // safe to embed directly.
      firebaseApiKey:
        process.env.GOOGLE_API_KEY ??
        process.env.EXPO_PUBLIC_FIREBASE_API_KEY ??
        "",
      firebaseAuthDomain: "california-offroad-explorer.firebaseapp.com",
      firebaseProjectId: "california-offroad-explorer",
      firebaseStorageBucket: "california-offroad-explorer.firebasestorage.app",
      firebaseMessagingSenderId: "516913346465",
      firebaseAppId: "1:516913346465:web:2b01f1220d182a3911bde0",
      googleWebClientId: "516913346465-2d9sghu3nqvtbnj2ttiddu3191jkib32.apps.googleusercontent.com",
      npsApiKey: process.env.EXPO_PUBLIC_NPS_API_KEY ?? "",
      ridbApiKey: process.env.EXPO_PUBLIC_RIDB_API_KEY ?? "",
      eas: { projectId: "5e42857a-9f58-4c15-8b0b-571dd97b3189" },
    },
    owner: "mclaporteterrapulses-team",
  },
});
