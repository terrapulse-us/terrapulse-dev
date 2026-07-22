import { Directory, File, Paths } from "expo-file-system";
import { createDownloadResumable, downloadAsync } from "expo-file-system/legacy";
import { layers, namedFlavor } from "@protomaps/basemaps";
import { apiServerUrl } from "@/lib/api-client";

// ── Region spike v2 (Moab) ───────────────────────────────────────────────────
// The Florence PMTiles spike PASSED: maplibre-native renders local .pmtiles
// via `pmtiles://<abs-path>`. This spike proves the FULL offline-region
// experience with one manually generated region (Moab, UT):
//   1. Real Protomaps vector extract (z0-15, ODbL) styled with the official
//      @protomaps/basemaps style (~70 layers) — proper cartography, not the
//      3 debug layers of the first spike.
//   2. Terrain hillshade from a terrarium DEM archive (AWS elevation tiles,
//      public domain) — tests raster-dem over pmtiles:// (NEW device unknown).
//   3. Offline glyphs + sprites served from local files via file:// URLs
//      (NEW device unknown). Font names are sanitized to remove spaces so
//      the glyph URL template never needs percent-encoding on disk.
// Region pipeline + real UI get built ONLY after this passes on-device.

export const REGION_SPIKE_CENTER: [number, number] = [-109.55, 38.57]; // Moab, UT
export const REGION_SPIKE_ZOOM = 11;

/** Server keys under /api/storage/public-objects/ */
const REGION_KEY = "regions/moab-v1";
const ASSETS_KEY = "regions/assets";

const FONT_STACKS = ["Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic"];
const FONT_RANGES = ["0-255", "256-511", "512-767", "768-1023"];
const SPRITE_FILES = ["light.json", "light.png", "light@2x.json", "light@2x.png"];

// Sanity floors — smaller means a truncated download or an error page.
const MIN_MAP_BYTES = 7_000_000;
const MIN_TERRAIN_BYTES = 14_000_000;
// For combined progress reporting (approximate real sizes).
const EXPECTED_MAP_BYTES = 7_939_628;
const EXPECTED_TERRAIN_BYTES = 14_309_683;

/** "Noto Sans Regular" -> "NotoSansRegular" (glyph dir + text-font rewrite). */
function sanitizeFontName(name: string): string {
  return name.replace(/\s+/g, "");
}

function regionDir(): Directory {
  return new Directory(Paths.document, "regions", "moab-v1");
}
function assetsDir(): Directory {
  return new Directory(Paths.document, "regions", "assets");
}

export interface RegionSpikePaths {
  /** Absolute filesystem path (no file:// scheme) to the vector archive. */
  mapPath: string;
  /** Absolute filesystem path to the terrain DEM archive. */
  terrainPath: string;
  /** file:// URI (no trailing slash) of the glyphs/sprites assets dir. */
  assetsUri: string;
}

function stripFileScheme(uri: string): string {
  return uri.replace(/^file:\/\//, "");
}
function trimTrailingSlash(uri: string): string {
  return uri.replace(/\/+$/, "");
}

function baseUrl(): string {
  if (!apiServerUrl) throw new Error("API server URL not configured");
  return `${apiServerUrl.replace(/\/+$/, "")}/api/storage/public-objects`;
}

/**
 * Downloads the Moab region archives + style assets (once) into
 * Paths.document/regions/. Reports combined progress (0..1).
 */
export async function ensureRegionSpikeFiles(
  onProgress?: (fraction: number) => void
): Promise<RegionSpikePaths> {
  const region = regionDir();
  const assets = assetsDir();
  if (!region.exists) region.create({ intermediates: true, idempotent: true });
  if (!assets.exists) assets.create({ intermediates: true, idempotent: true });

  const mapFile = new File(region, "map.pmtiles");
  const terrainFile = new File(region, "terrain.pmtiles");

  // Weights for combined progress: map 35%, terrain 60%, assets 5%.
  const report = (base: number, span: number, frac: number) =>
    onProgress?.(Math.min(1, base + span * Math.max(0, Math.min(1, frac))));

  await downloadArchive(
    `${baseUrl()}/${REGION_KEY}/map.pmtiles`,
    mapFile,
    MIN_MAP_BYTES,
    EXPECTED_MAP_BYTES,
    (f) => report(0, 0.35, f)
  );
  await downloadArchive(
    `${baseUrl()}/${REGION_KEY}/terrain.pmtiles`,
    terrainFile,
    MIN_TERRAIN_BYTES,
    EXPECTED_TERRAIN_BYTES,
    (f) => report(0.35, 0.6, f)
  );
  await downloadStyleAssets(assets, (f) => report(0.95, 0.05, f));
  onProgress?.(1);

  return {
    mapPath: stripFileScheme(mapFile.uri),
    terrainPath: stripFileScheme(terrainFile.uri),
    assetsUri: trimTrailingSlash(assets.uri),
  };
}

async function downloadArchive(
  url: string,
  dest: File,
  minBytes: number,
  expectedBytes: number,
  onFraction: (f: number) => void
): Promise<void> {
  if (dest.exists && (dest.size ?? 0) >= minBytes) {
    onFraction(1);
    return;
  }
  if (dest.exists) dest.delete();
  const resumable = createDownloadResumable(url, dest.uri, {}, (p) => {
    const total = p.totalBytesExpectedToWrite > 0 ? p.totalBytesExpectedToWrite : expectedBytes;
    onFraction(p.totalBytesWritten / total);
  });
  const result = await resumable.downloadAsync();
  if (!result || (result.status !== 200 && result.status !== 206)) {
    throw new Error(`Download failed (${result?.status ?? "no response"}): ${url}`);
  }
  const written = new File(dest.uri);
  if ((written.size ?? 0) < minBytes) {
    try {
      written.delete();
    } catch {
      // ignore
    }
    throw new Error(`Download incomplete: ${url}`);
  }
  onFraction(1);
}

async function downloadStyleAssets(
  assets: Directory,
  onFraction: (f: number) => void
): Promise<void> {
  const jobs: Array<{ url: string; dest: File }> = [];

  const spritesDir = new Directory(assets, "sprites");
  if (!spritesDir.exists) spritesDir.create({ intermediates: true, idempotent: true });
  for (const name of SPRITE_FILES) {
    jobs.push({
      url: `${baseUrl()}/${ASSETS_KEY}/sprites/${encodeURIComponent(name)}`,
      dest: new File(spritesDir, name),
    });
  }

  const fontsDir = new Directory(assets, "fonts");
  if (!fontsDir.exists) fontsDir.create({ intermediates: true, idempotent: true });
  for (const stack of FONT_STACKS) {
    const stackDir = new Directory(fontsDir, sanitizeFontName(stack));
    if (!stackDir.exists) stackDir.create({ intermediates: true, idempotent: true });
    for (const range of FONT_RANGES) {
      jobs.push({
        url: `${baseUrl()}/${ASSETS_KEY}/fonts/${encodeURIComponent(stack)}/${range}.pbf`,
        dest: new File(stackDir, `${range}.pbf`),
      });
    }
  }

  const pending = jobs.filter((j) => !j.dest.exists || (j.dest.size ?? 0) === 0);
  let done = jobs.length - pending.length;
  onFraction(done / jobs.length);

  const queue = [...pending];
  async function worker(): Promise<void> {
    for (;;) {
      const job = queue.shift();
      if (!job) return;
      const res = await downloadAsync(job.url, job.dest.uri);
      if (res.status !== 200) {
        throw new Error(`Asset download failed (${res.status}): ${job.url}`);
      }
      done += 1;
      onFraction(done / jobs.length);
    }
  }
  await Promise.all(Array.from({ length: 4 }, () => worker()));
}

/**
 * Builds a complete MapLibre style for the downloaded region: the official
 * Protomaps "light" flavor (~70 layers) over the local vector archive, plus a
 * terrain hillshade layer over the local terrarium DEM. Everything —
 * tiles, glyphs, sprites, DEM — resolves to on-device files.
 */
export function buildRegionSpikeStyle(paths: RegionSpikePaths): Record<string, unknown> {
  const flavor = namedFlavor("light");
  const baseLayers = layers("protomaps", flavor, { lang: "en" }) as Array<
    Record<string, unknown>
  >;

  // Rewrite every font name to its sanitized (space-free) form so glyph
  // requests hit our space-free local dirs with zero URL-encoding ambiguity.
  // Font names appear in layout["text-font"] (plain arrays OR expressions
  // like ["case", ...]) AND inside text-field ["format", ...] options
  // ({"text-font": ["literal", [...]]}), so deep-walk the ENTIRE layer.
  // Stacks we didn't download (e.g. "Noto Sans Devanagari Regular v1") fall
  // back to NotoSansRegular so their glyph requests hit an existing dir.
  const downloadedStacks = new Set(FONT_STACKS.map(sanitizeFontName));
  const sanitizeFonts = (value: unknown): unknown => {
    if (typeof value === "string" && value.startsWith("Noto Sans")) {
      const clean = sanitizeFontName(value);
      return downloadedStacks.has(clean) ? clean : "NotoSansRegular";
    }
    if (Array.isArray(value)) return value.map(sanitizeFonts);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, sanitizeFonts(v)])
      );
    }
    return value;
  };
  const styled = baseLayers.map(
    (layer) => sanitizeFonts(layer) as Record<string, unknown>
  );

  // Insert the hillshade just above the land-detail stack so shading sits
  // under roads and labels (mirrors how the online HD styles are layered).
  const hillshade = {
    id: "region-hillshade",
    type: "hillshade",
    source: "region-dem",
    paint: {
      "hillshade-exaggeration": 0.5,
      "hillshade-shadow-color": "#4a3f33",
      "hillshade-highlight-color": "#fdfbf7",
      "hillshade-accent-color": "#4a3f33",
    },
  };
  let insertAt = styled.findIndex((l) => l.id === "landcover");
  if (insertAt === -1) insertAt = styled.findIndex((l) => l.id === "earth");
  insertAt = insertAt === -1 ? 1 : insertAt + 1;
  const withHillshade = [
    ...styled.slice(0, insertAt),
    hillshade,
    ...styled.slice(insertAt),
  ];

  return {
    version: 8,
    name: "TerraPulse Region — Moab (spike)",
    glyphs: `file://${stripFileScheme(paths.assetsUri)}/fonts/{fontstack}/{range}.pbf`,
    sprite: `file://${stripFileScheme(paths.assetsUri)}/sprites/light`,
    sources: {
      // maplibre-native requires the URL inside pmtiles:// to be FULLY
      // specified — local files must use `pmtiles://file:///abs/path`
      // (documented style-JSON form). The stripped `pmtiles:///abs/path`
      // form the Florence spike used via addSource does NOT resolve from
      // style JSON: field test showed background-only rendering.
      protomaps: {
        type: "vector",
        url: `pmtiles://file://${paths.mapPath}`,
        attribution: "© OpenStreetMap contributors, © Protomaps",
      },
      "region-dem": {
        type: "raster-dem",
        url: `pmtiles://file://${paths.terrainPath}`,
        encoding: "terrarium",
        tileSize: 256,
        maxzoom: 12,
      },
    },
    layers: withHillshade,
  };
}

/** Deletes all downloaded region spike files (toggle-off cleanup). */
export function removeRegionSpikeFiles(): void {
  try {
    const dir = new Directory(Paths.document, "regions");
    if (dir.exists) dir.delete();
  } catch {
    // best-effort
  }
}
