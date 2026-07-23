import { Directory, File, Paths } from "expo-file-system";
import { createDownloadResumable, downloadAsync } from "expo-file-system/legacy";
import { layers, namedFlavor } from "@protomaps/basemaps";
import { apiServerUrl } from "@/lib/api-client";
import { cacheGet, cacheSet } from "@/lib/offline-cache";

// ── Offline regions (production pipeline, catalog-first) ────────────────────
// Grown out of the Moab PMTiles spike (PASSED on device, July 2026). Regions
// are script-built server-side (scripts/src/regions/build-region.ts) and
// published to object storage under regions/<key>-v<version>/ plus a
// regions/catalog.json index. The phone downloads a region's two archives
// (Protomaps vector extract z0-15 + terrarium DEM z0-14) and shared style
// assets (Noto glyphs + sprites), then renders a fully-offline style built
// client-side from the official @protomaps/basemaps light flavor.

export interface RegionBbox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface CatalogRegion {
  key: string;
  name: string;
  state: string;
  bbox: RegionBbox;
  version: number;
  /** Storage path prefix, e.g. "regions/moab-v1" */
  path: string;
  mapBytes: number;
  terrainBytes: number;
  updatedAt: string;
}

interface RegionCatalog {
  catalogVersion: number;
  regions: CatalogRegion[];
}

const CATALOG_KEY = "regions/catalog.json";
const ASSETS_KEY = "regions/assets";
const CATALOG_CACHE_KEY = "regions.catalog.v1";

const FONT_STACKS = ["Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic"];
const FONT_RANGES = ["0-255", "256-511", "512-767", "768-1023"];
const SPRITE_FILES = ["light.json", "light.png", "light@2x.json", "light@2x.png"];

/** "Noto Sans Regular" -> "NotoSansRegular" (glyph dir + text-font rewrite). */
function sanitizeFontName(name: string): string {
  return name.replace(/\s+/g, "");
}

function regionsRoot(): Directory {
  return new Directory(Paths.document, "regions");
}
function regionDir(region: CatalogRegion): Directory {
  return new Directory(Paths.document, "regions", `${region.key}-v${region.version}`);
}
function assetsDir(): Directory {
  return new Directory(Paths.document, "regions", "assets");
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

// ── Catalog ─────────────────────────────────────────────────────────────────

/**
 * Fetches the region catalog from the server, persisting it to the offline
 * cache. Falls back to the cached copy when offline; returns [] when neither
 * is available.
 */
export async function fetchRegionCatalog(): Promise<CatalogRegion[]> {
  try {
    const res = await fetch(`${baseUrl()}/${CATALOG_KEY}`);
    if (!res.ok) throw new Error(`catalog HTTP ${res.status}`);
    const catalog = (await res.json()) as RegionCatalog;
    if (!Array.isArray(catalog.regions)) throw new Error("catalog malformed");
    await cacheSet(CATALOG_CACHE_KEY, catalog);
    return catalog.regions;
  } catch {
    return getCachedCatalog();
  }
}

/** Cached catalog only (no network) — what offline code paths should use. */
export async function getCachedCatalog(): Promise<CatalogRegion[]> {
  const cached = await cacheGet<RegionCatalog>(CATALOG_CACHE_KEY);
  return cached?.regions ?? [];
}

// ── Download state ──────────────────────────────────────────────────────────

/** True when both archives exist on disk at their full catalog byte sizes. */
export function isRegionDownloaded(region: CatalogRegion): boolean {
  const dir = regionDir(region);
  if (!dir.exists) return false;
  const map = new File(dir, "map.pmtiles");
  const terrain = new File(dir, "terrain.pmtiles");
  return (
    map.exists &&
    (map.size ?? 0) >= region.mapBytes &&
    terrain.exists &&
    (terrain.size ?? 0) >= region.terrainBytes
  );
}

export function listDownloadedRegions(catalog: CatalogRegion[]): CatalogRegion[] {
  return catalog.filter((r) => isRegionDownloaded(r));
}

/** Total bytes a region will download (archives only; shared assets ~1MB). */
export function regionDownloadBytes(region: CatalogRegion): number {
  return region.mapBytes + region.terrainBytes;
}

export function regionCenter(region: CatalogRegion): [number, number] {
  return [
    (region.bbox.west + region.bbox.east) / 2,
    (region.bbox.south + region.bbox.north) / 2,
  ];
}

export function isPointInRegion(
  region: CatalogRegion,
  lon: number,
  lat: number
): boolean {
  const { west, south, east, north } = region.bbox;
  return lon >= west && lon <= east && lat >= south && lat <= north;
}

/** First downloaded region containing the point, if any. */
export function downloadedRegionAt(
  catalog: CatalogRegion[],
  lon: number,
  lat: number
): CatalogRegion | null {
  for (const region of catalog) {
    if (isPointInRegion(region, lon, lat) && isRegionDownloaded(region)) {
      return region;
    }
  }
  return null;
}

/**
 * Downloaded region whose center is nearest to the point. Used by the manual
 * OFFLINE REGIONS toggle so a rider in California gets Johnson Valley, not
 * whichever region happens to be first in the catalog.
 */
export function nearestDownloadedRegion(
  catalog: CatalogRegion[],
  lon: number,
  lat: number
): CatalogRegion | null {
  let best: CatalogRegion | null = null;
  let bestDist = Infinity;
  for (const region of catalog) {
    if (!isRegionDownloaded(region)) continue;
    const [clon, clat] = regionCenter(region);
    const dLon = (clon - lon) * Math.cos((lat * Math.PI) / 180);
    const dLat = clat - lat;
    const dist = dLon * dLon + dLat * dLat;
    if (dist < bestDist) {
      bestDist = dist;
      best = region;
    }
  }
  return best;
}

// ── Download / delete ───────────────────────────────────────────────────────

export interface RegionPaths {
  /** Absolute filesystem path (no file:// scheme) to the vector archive. */
  mapPath: string;
  /** Absolute filesystem path to the terrain DEM archive. */
  terrainPath: string;
  /** file:// URI (no trailing slash) of the glyphs/sprites assets dir. */
  assetsUri: string;
}

export function getRegionPaths(region: CatalogRegion): RegionPaths {
  const dir = regionDir(region);
  return {
    mapPath: stripFileScheme(new File(dir, "map.pmtiles").uri),
    terrainPath: stripFileScheme(new File(dir, "terrain.pmtiles").uri),
    assetsUri: trimTrailingSlash(assetsDir().uri),
  };
}

/**
 * Downloads a region's archives + shared style assets (once) into
 * Paths.document/regions/. Reports combined progress (0..1). Already-complete
 * files are skipped, so this is safe to call to resume an interrupted
 * download.
 *
 * A module-level in-flight registry makes concurrent calls for the SAME
 * region safe: the second caller (e.g. the map's REGIONS list while a Garage
 * download is running) joins the existing download instead of appending
 * duplicate chunks to the same .part file, and its progress callback is fanned in.
 */
const inflightDownloads = new Map<
  string,
  { promise: Promise<RegionPaths>; listeners: Set<(fraction: number) => void> }
>();

export function downloadRegion(
  region: CatalogRegion,
  onProgress?: (fraction: number) => void
): Promise<RegionPaths> {
  const existing = inflightDownloads.get(region.key);
  if (existing) {
    if (onProgress) existing.listeners.add(onProgress);
    return existing.promise;
  }
  const listeners = new Set<(fraction: number) => void>();
  if (onProgress) listeners.add(onProgress);
  const fanOut = (fraction: number) => {
    for (const listener of listeners) listener(fraction);
  };
  const promise = doDownloadRegion(region, fanOut).finally(() => {
    inflightDownloads.delete(region.key);
  });
  inflightDownloads.set(region.key, { promise, listeners });
  return promise;
}

/** True while a download for this region is running (from ANY screen). */
export function isRegionDownloading(region: CatalogRegion): boolean {
  return inflightDownloads.has(region.key);
}

async function doDownloadRegion(
  region: CatalogRegion,
  onProgress?: (fraction: number) => void
): Promise<RegionPaths> {
  const dir = regionDir(region);
  const assets = assetsDir();
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  if (!assets.exists) assets.create({ intermediates: true, idempotent: true });

  const mapFile = new File(dir, "map.pmtiles");
  const terrainFile = new File(dir, "terrain.pmtiles");

  // Progress weights proportional to real byte sizes; assets get a fixed 3%.
  const totalBytes = regionDownloadBytes(region);
  const mapSpan = 0.97 * (region.mapBytes / totalBytes);
  const terrainSpan = 0.97 * (region.terrainBytes / totalBytes);
  const report = (base: number, span: number, frac: number) =>
    onProgress?.(Math.min(1, base + span * Math.max(0, Math.min(1, frac))));

  await downloadArchive(
    `${baseUrl()}/${region.path}/map.pmtiles`,
    mapFile,
    region.mapBytes,
    (f) => report(0, mapSpan, f)
  );
  await downloadArchive(
    `${baseUrl()}/${region.path}/terrain.pmtiles`,
    terrainFile,
    region.terrainBytes,
    (f) => report(mapSpan, terrainSpan, f)
  );
  await downloadStyleAssets(assets, (f) => report(0.97, 0.03, f));
  onProgress?.(1);

  return getRegionPaths(region);
}

/** Deletes one region's archives (shared assets and other regions stay). */
export function deleteRegion(region: CatalogRegion): void {
  try {
    const dir = regionDir(region);
    if (dir.exists) dir.delete();
  } catch {
    // best-effort
  }
}

/** Bytes currently on disk across all region dirs (for the Garage UI). */
export function regionBytesOnDisk(region: CatalogRegion): number {
  const dir = regionDir(region);
  if (!dir.exists) return 0;
  let total = 0;
  for (const name of ["map.pmtiles", "terrain.pmtiles"]) {
    const f = new File(dir, name);
    if (f.exists) total += f.size ?? 0;
  }
  return total;
}

// Large archives download in ranged chunks appended to a persistent .part
// file. Each chunk is a short request (seconds, not minutes), so proxy/
// mobile-network resets of long responses can't kill the download, and an
// interrupted download resumes from the last completed chunk instead of
// restarting. Requires server Range support; a 200 (range-ignoring server)
// falls back to using the full response directly.
const CHUNK_BYTES = 8 * 1024 * 1024;
const CHUNK_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Appends the chunk file's bytes to the end of the part file. */
async function appendChunk(part: File, chunk: File): Promise<void> {
  const bytes = await chunk.bytes();
  if (!part.exists) part.create();
  const handle = part.open();
  try {
    handle.offset = handle.size ?? 0;
    handle.writeBytes(bytes);
  } finally {
    handle.close();
  }
}

async function downloadArchive(
  url: string,
  dest: File,
  expectedBytes: number,
  onFraction: (f: number) => void
): Promise<void> {
  if (dest.exists && (dest.size ?? 0) >= expectedBytes) {
    onFraction(1);
    return;
  }
  if (dest.exists) dest.delete();

  const part = new File(`${dest.uri}.part`);
  const tmp = new File(`${dest.uri}.chunk`);
  let offset = part.exists ? (part.size ?? 0) : 0;
  if (offset > expectedBytes) {
    // Stale .part from an older catalog version — start over.
    part.delete();
    offset = 0;
  }
  onFraction(offset / expectedBytes);

  while (offset < expectedBytes) {
    const end = Math.min(offset + CHUNK_BYTES, expectedBytes) - 1;
    const chunkLen = end - offset + 1;
    const base = offset;
    let attempt = 0;
    for (;;) {
      try {
        if (tmp.exists) tmp.delete();
        const resumable = createDownloadResumable(
          url,
          tmp.uri,
          { headers: { Range: `bytes=${base}-${end}` } },
          (p) =>
            onFraction(
              Math.min(1, (base + p.totalBytesWritten) / expectedBytes)
            )
        );
        const result = await resumable.downloadAsync();
        if (!result) throw new Error(`no response: ${url}`);
        if (result.status === 200) {
          // Server ignored the Range header — tmp holds the ENTIRE archive.
          const full = new File(tmp.uri);
          if ((full.size ?? 0) < expectedBytes) {
            throw new Error(`Full download incomplete: ${url}`);
          }
          if (part.exists) part.delete();
          if (dest.exists) dest.delete();
          full.move(dest);
          onFraction(1);
          return;
        }
        if (result.status !== 206) {
          throw new Error(`Download failed (${result.status}): ${url}`);
        }
        const got = new File(tmp.uri);
        if ((got.size ?? 0) !== chunkLen) {
          throw new Error(
            `Chunk short (${got.size ?? 0}/${chunkLen}): ${url}`
          );
        }
        await appendChunk(part, got);
        got.delete();
        break;
      } catch (err) {
        attempt += 1;
        try {
          if (tmp.exists) tmp.delete();
        } catch {
          // ignore
        }
        // The .part file is intentionally KEPT — the next attempt resumes
        // from the last fully-appended chunk.
        if (attempt >= CHUNK_RETRIES) throw err;
        await sleep(1500 * attempt);
      }
    }
    offset += chunkLen;
    onFraction(offset / expectedBytes);
  }

  if (dest.exists) dest.delete();
  part.move(dest);
  const written = new File(dest.uri);
  if ((written.size ?? 0) < expectedBytes) {
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

// ── Style builder ───────────────────────────────────────────────────────────

/**
 * Builds a complete MapLibre style for a downloaded region: the official
 * Protomaps "light" flavor (~70 layers) over the local vector archive, plus a
 * terrain hillshade layer over the local terrarium DEM. Everything —
 * tiles, glyphs, sprites, DEM — resolves to on-device files.
 */
export function buildRegionStyle(
  region: CatalogRegion,
  paths: RegionPaths = getRegionPaths(region)
): Record<string, unknown> {
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
  const styled = baseLayers.map((layer) => {
    const clean = sanitizeFonts(layer) as Record<string, unknown>;
    // Soften the public-land tint: protomaps paints national forest / park /
    // protected-area polygons fully opaque from z11 (#9cd3b4), which reads
    // as flat unrendered slabs over huge forest boundaries. A ~45% wash
    // keeps the "public land" cue while letting the earth tone and
    // hillshade show through (onX/AllTrails-style land tint).
    if (clean.id === "landuse_park") {
      return {
        ...clean,
        paint: {
          ...(clean.paint as Record<string, unknown>),
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0, 11, 0.45],
        },
      };
    }
    return clean;
  });

  // Insert the hillshade ABOVE every land fill (landcover + all landuse_*
  // park/forest polygons) but below water, roads, and labels. Field test
  // round 2 had it just above "landcover", which left the opaque
  // landuse_park fills painting flat green OVER the shading — terrain
  // relief vanished entirely inside national-forest boundaries.
  const hillshade = {
    id: "region-hillshade",
    type: "hillshade",
    source: "region-dem",
    paint: {
      // DEM is native to z14 (terrarium's real detail ceiling in the US —
      // USGS 3DEP 10 m source), so keep the shading strong through close
      // zooms; only ease slightly past z14 where MapLibre overzooms.
      "hillshade-exaggeration": [
        "interpolate",
        ["linear"],
        ["zoom"],
        11, 0.55,
        14, 0.5,
        16, 0.35,
      ],
      "hillshade-shadow-color": "#4a3f33",
      "hillshade-highlight-color": "#fdfbf7",
      "hillshade-accent-color": "#4a3f33",
    },
  };
  let insertAt = styled.findIndex((l) => l.id === "water");
  if (insertAt === -1) insertAt = styled.findIndex((l) => l.type === "line");
  if (insertAt === -1) insertAt = styled.length;
  const withHillshade = [
    ...styled.slice(0, insertAt),
    hillshade,
    ...styled.slice(insertAt),
  ];

  return {
    version: 8,
    name: `TerraPulse Region — ${region.name}`,
    glyphs: `file://${stripFileScheme(paths.assetsUri)}/fonts/{fontstack}/{range}.pbf`,
    sprite: `file://${stripFileScheme(paths.assetsUri)}/sprites/light`,
    sources: {
      // maplibre-native requires the URL inside pmtiles:// to be FULLY
      // specified — local files must use `pmtiles://file:///abs/path`
      // (documented style-JSON form). The stripped `pmtiles:///abs/path`
      // form only resolves via runtime addSource, NOT from style JSON.
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
        maxzoom: 14,
      },
    },
    layers: withHillshade,
  };
}

/**
 * Removes region dirs that no catalog entry references (e.g. old versions
 * after a version bump, or the pre-pipeline spike layout). Never touches
 * the shared assets dir or current per-region dirs.
 */
export function pruneStaleRegionDirs(catalog: CatalogRegion[]): void {
  // An empty catalog means "we don't know", not "delete everything" — a
  // failed fetch with a cold cache must never wipe downloaded regions.
  if (catalog.length === 0) return;
  try {
    const root = regionsRoot();
    if (!root.exists) return;
    const keep = new Set(["assets", ...catalog.map((r) => `${r.key}-v${r.version}`)]);
    for (const entry of root.list()) {
      const name = entry.uri.replace(/\/+$/, "").split("/").pop() ?? "";
      if (!keep.has(name)) {
        try {
          entry.delete();
        } catch {
          // best-effort
        }
      }
    }
  } catch {
    // best-effort
  }
}
