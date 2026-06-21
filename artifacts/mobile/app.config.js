module.exports = () => ({
  expo: {
    name: "TerraPulse",
    slug: "mobile",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "terrapulse",
    userInterfaceStyle: "dark",
    newArchEnabled: true,
    splash: {
      image: "./assets/images/icon.png",
      resizeMode: "contain",
      backgroundColor: "#121212",
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.terrapulse.app",
      infoPlist: {
        NSCameraUsageDescription:
          "TerraPulse uses your camera to broadcast live off-road streams.",
        NSMicrophoneUsageDescription:
          "TerraPulse uses your microphone to capture audio during live broadcasts.",
        NSLocationWhenInUseUsageDescription:
          "TerraPulse uses your location to show nearby trails and GPS telemetry during live streams.",
        NSPhotoLibraryUsageDescription:
          "TerraPulse needs photo library access to upload trail community photos.",
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
      [
        "@rnmapbox/maps",
        {
          RNMapboxMapsDownloadToken: process.env.MAPBOX_DOWNLOAD_TOKEN ?? "",
          RNMapboxMapsVersion: "11.9.1",
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      mapboxPublicToken: process.env.MAPBOX_PUBLIC_TOKEN ?? "",
      eas: { projectId: "5e42857a-9f58-4c15-8b0b-571dd97b3189" },
    },
    owner: "mclaporteterrapulses-team",
  },
});
