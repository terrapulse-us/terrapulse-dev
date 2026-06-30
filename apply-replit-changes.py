#!/usr/bin/env python3
"""Apply Replit map fixes to this repo. Run from the repo root."""
import sys, os

def patch(path, old, new, label):
    with open(path) as f:
        src = f.read()
    if old not in src:
        print(f"  SKIP {label} (already applied or context not found)")
        return
    with open(path, "w") as f:
        f.write(src.replace(old, new, 1))
    print(f"  OK   {label}")

# ── osm-api.ts ────────────────────────────────────────────────────────────────
OSM = "artifacts/mobile/lib/osm-api.ts"

patch(OSM,
    'const OVERPASS_URL = "https://overpass-api.de/api/interpreter";',
    'const OVERPASS_URLS = [\n'
    '  "https://overpass-api.de/api/interpreter",\n'
    '  "https://overpass.kumi.systems/api/interpreter",\n'
    '];',
    "osm-api: add fallback Overpass URL")

patch(OSM,
    '  const resp = await fetch(OVERPASS_URL, {\n'
    '    method: "POST",\n'
    '    headers: { "Content-Type": "application/x-www-form-urlencoded" },\n'
    '    body: `data=${encodeURIComponent(query)}`,\n'
    '  });\n'
    '  if (!resp.ok) throw new Error(`Overpass API ${resp.status}`);',
    '  let resp: Response | null = null;\n'
    '  for (const url of OVERPASS_URLS) {\n'
    '    try {\n'
    '      resp = await fetch(url, {\n'
    '        method: "POST",\n'
    '        headers: { "Content-Type": "application/x-www-form-urlencoded" },\n'
    '        body: `data=${encodeURIComponent(query)}`,\n'
    '      });\n'
    '      if (resp.ok) break;\n'
    '    } catch {\n'
    '      resp = null;\n'
    '    }\n'
    '  }\n'
    '  if (!resp?.ok) throw new Error(`Overpass API unavailable`);',
    "osm-api: fallback fetch loop")

# ── map.tsx ───────────────────────────────────────────────────────────────────
MAP = "artifacts/mobile/app/(tabs)/map.tsx"

patch(MAP,
    'import TrailDetailScreen from "@/components/TrailDetailScreen";',
    'import TrailDetailScreen from "@/components/TrailDetailScreen";\nimport * as Updates from "expo-updates";',
    "map: add expo-updates import")

patch(MAP,
    '  } | null>(null);\n\n  const [isRecording',
    '  } | null>(null);\n'
    '  const hasAutoFlownRef = useRef(false);\n'
    '  const [osmFetchCenter, setOsmFetchCenter] = useState<{ lat: number; lng: number }>({\n'
    '    lat: 36.7783,\n'
    '    lng: -119.4179,\n'
    '  });\n\n'
    '  const [isRecording',
    "map: add hasAutoFlownRef + osmFetchCenter state")

patch(MAP,
    '    const center = userLocation ?? { latitude: 36.7783, longitude: -119.4179 };\n'
    '    fetchOsmTrailsNear(center.latitude, center.longitude, 15)',
    '    fetchOsmTrailsNear(osmFetchCenter.lat, osmFetchCenter.lng, 15)',
    "map: OSM effect uses osmFetchCenter")

patch(MAP,
    '  }, [showOsmOverlay]);',
    '  }, [showOsmOverlay, osmFetchCenter]);',
    "map: OSM effect dep array")

patch(MAP,
    '    })();\n  }, []);\n\n  useEffect(() => {\n    if (!isNavigating)',
    '    })();\n  }, []);\n\n'
    '  useEffect(() => {\n'
    '    if (!userLocation || hasAutoFlownRef.current) return;\n'
    '    hasAutoFlownRef.current = true;\n'
    '    cameraRef.current?.flyTo({\n'
    '      center: [userLocation.longitude, userLocation.latitude],\n'
    '      zoom: 12,\n'
    '      duration: 1500,\n'
    '    });\n'
    '    setOsmFetchCenter({ lat: userLocation.latitude, lng: userLocation.longitude });\n'
    '  }, [userLocation]);\n\n'
    '  useEffect(() => {\n    if (!isNavigating)',
    "map: auto-fly effect on first GPS")

patch(MAP,
    'center={[-98.5795, 39.8283]}\n          zoom={3}',
    'center={[-119.4179, 36.7783]}\n          zoom={7}',
    "map: camera starts on California zoom 7")

patch(MAP,
    '      </Modal>\n    </View>\n  );\n}',
    '      </Modal>\n\n'
    '      <View style={styles.updateBadge} pointerEvents="none">\n'
    '        <Text style={styles.updateBadgeText}>\n'
    '          {Updates.isEmbeddedLaunch ? "APK build" : "OTA: CA-map-fix"}\n'
    '        </Text>\n'
    '      </View>\n'
    '    </View>\n  );\n}',
    "map: OTA update badge")

patch(MAP,
    '  navStopBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },\n  osmMarker:',
    '  navStopBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },\n'
    '  updateBadge: {\n'
    '    position: "absolute",\n'
    '    bottom: 8,\n'
    '    left: 8,\n'
    '    backgroundColor: "rgba(0,0,0,0.55)",\n'
    '    borderRadius: 4,\n'
    '    paddingHorizontal: 6,\n'
    '    paddingVertical: 2,\n'
    '  },\n'
    '  updateBadgeText: {\n'
    '    color: "#fff",\n'
    '    fontSize: 10,\n'
    '    fontFamily: "Inter_400Regular",\n'
    '  },\n'
    '  osmMarker:',
    "map: badge styles")

print("\nDone. Commit and run: eas update --branch preview --platform android")
