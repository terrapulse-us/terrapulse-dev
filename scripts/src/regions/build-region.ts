/**
 * Offline region builder: produces and publishes the archives one region
 * needs to render fully offline on-device, then updates regions/catalog.json.
 *
 * Per region (defined in defs.ts):
 *   1. Vector basemap: `pmtiles extract` (go-pmtiles CLI) against the daily
 *      Protomaps planet build — z0-15 bbox extract, ~8 MB for a Moab-size box.
 *   2. Terrain DEM: terrarium PNGs z0-14 from AWS elevation-tiles-prod
 *      (public domain). z14 matches the USGS 3DEP 10 m source — the last zoom
 *      with real information; deeper is upsampled. Written to MBTiles, then
 *      converted with `pmtiles convert`.
 *   3. Upload both archives to object storage under regions/<key>-v<version>/,
 *      then upsert the region's entry (bbox, byte sizes) in regions/catalog.json.
 *
 * Existing local outputs are reused (skip vector/terrain build if the file
 * exists); pass --force to rebuild from scratch.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run region:build -- <key>|all [--force]
 *   pnpm --filter @workspace/scripts run region:assets   # glyphs/sprites (once)
 */
import { Storage } from "@google-cloud/storage";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { REGIONS, regionPath, type RegionDef } from "./defs";

const DATA_DIR = resolve(import.meta.dirname, "../../data/regions");
const BIN_DIR = resolve(import.meta.dirname, "../../bin");
const PMTILES_VERSION = "1.31.1";
// Pinned daily planet build (verified reachable). Update deliberately —
// newer builds shift byte sizes, which feeds catalog invalidation.
const PLANET_URL = "https://build.protomaps.com/20260721.pmtiles";
const VECTOR_MAX_ZOOM = 15;
const DEM_MIN_ZOOM = 0;
const DEM_MAX_ZOOM = 14;
const DEM_CONCURRENCY = 16;

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

interface CatalogRegion {
  key: string;
  name: string;
  state: string;
  bbox: RegionDef["bbox"];
  version: number;
  /** Storage path prefix, e.g. "regions/moab-v1" */
  path: string;
  mapBytes: number;
  terrainBytes: number;
  updatedAt: string;
}
interface Catalog {
  catalogVersion: 1;
  regions: CatalogRegion[];
}

function getBucket() {
  const publicPath = (process.env.PUBLIC_OBJECT_SEARCH_PATHS || "").split(",")[0]?.trim();
  if (!publicPath) throw new Error("PUBLIC_OBJECT_SEARCH_PATHS not set");
  const parts = publicPath.replace(/^\//, "").split("/");
  return { bucket: storage.bucket(parts[0]), prefix: parts.slice(1).join("/") };
}

function destKey(prefix: string, key: string): string {
  return prefix ? `${prefix}/${key}` : key;
}

async function ensurePmtilesBin(): Promise<string> {
  const candidates = [process.env.PMTILES_BIN, join(BIN_DIR, "pmtiles"), "/tmp/pmtiles"];
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  console.log(`Downloading go-pmtiles v${PMTILES_VERSION}...`);
  mkdirSync(BIN_DIR, { recursive: true });
  const url = `https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/go-pmtiles_${PMTILES_VERSION}_Linux_x86_64.tar.gz`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`pmtiles download failed: HTTP ${res.status}`);
  const tarPath = join(BIN_DIR, "pmtiles.tar.gz");
  const buf = Buffer.from(await res.arrayBuffer());
  const { writeFileSync } = await import("node:fs");
  writeFileSync(tarPath, buf);
  const untar = spawnSync("tar", ["-xzf", tarPath, "-C", BIN_DIR, "pmtiles"], { stdio: "inherit" });
  if (untar.status !== 0) throw new Error("tar extract failed");
  rmSync(tarPath);
  const bin = join(BIN_DIR, "pmtiles");
  chmodSync(bin, 0o755);
  return bin;
}

function runPmtiles(bin: string, args: string[]): void {
  const res = spawnSync(bin, args, { stdio: "inherit" });
  if (res.status !== 0) throw new Error(`pmtiles ${args[0]} failed (exit ${res.status})`);
}

// ── Vector basemap ──────────────────────────────────────────────────────────

async function buildVector(bin: string, def: RegionDef, dir: string, force: boolean): Promise<string> {
  const out = join(dir, "map.pmtiles");
  if (existsSync(out) && !force) {
    console.log(`[${def.key}] map.pmtiles exists, skipping extract`);
    return out;
  }
  const tmp = `${out}.tmp`;
  if (existsSync(out)) rmSync(out);
  if (existsSync(tmp)) rmSync(tmp);
  const { west, south, east, north } = def.bbox;
  console.log(`[${def.key}] extracting vector z0-${VECTOR_MAX_ZOOM} from planet...`);
  runPmtiles(bin, [
    "extract",
    PLANET_URL,
    tmp,
    `--bbox=${west},${south},${east},${north}`,
    `--maxzoom=${VECTOR_MAX_ZOOM}`,
  ]);
  renameSync(tmp, out);
  return out;
}

// ── Terrain DEM ─────────────────────────────────────────────────────────────

function lonToTileX(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}
function latToTileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z
  );
}

interface TileCoord {
  z: number;
  x: number;
  y: number;
}

function demTiles(def: RegionDef): TileCoord[] {
  const tiles: TileCoord[] = [];
  for (let z = DEM_MIN_ZOOM; z <= DEM_MAX_ZOOM; z++) {
    const x0 = Math.max(0, lonToTileX(def.bbox.west, z));
    const x1 = Math.min(2 ** z - 1, lonToTileX(def.bbox.east, z));
    const y0 = Math.max(0, latToTileY(def.bbox.north, z));
    const y1 = Math.min(2 ** z - 1, latToTileY(def.bbox.south, z));
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) tiles.push({ z, x, y });
    }
  }
  return tiles;
}

async function fetchDemTile(t: TileCoord): Promise<Uint8Array> {
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${t.z}/${t.x}/${t.y}.png`;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length < 100) throw new Error(`suspiciously small tile ${url}`);
      return buf;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  throw lastErr;
}

async function buildTerrain(bin: string, def: RegionDef, dir: string, force: boolean): Promise<string> {
  const out = join(dir, "terrain.pmtiles");
  if (existsSync(out) && !force) {
    console.log(`[${def.key}] terrain.pmtiles exists, skipping fetch`);
    return out;
  }
  const mbtilesPath = join(dir, "terrain.mbtiles");
  if (existsSync(out)) rmSync(out);
  if (existsSync(mbtilesPath)) rmSync(mbtilesPath);

  const tiles = demTiles(def);
  console.log(`[${def.key}] fetching ${tiles.length} terrarium tiles (z${DEM_MIN_ZOOM}-${DEM_MAX_ZOOM})...`);

  const db = new DatabaseSync(mbtilesPath);
  db.exec(`
    PRAGMA journal_mode = OFF;
    PRAGMA synchronous = OFF;
    CREATE TABLE metadata (name TEXT, value TEXT);
    CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB);
    CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row);
  `);
  const insertTile = db.prepare(
    "INSERT INTO tiles (zoom_level, tile_column, tile_row, tile_data) VALUES (?, ?, ?, ?)"
  );
  const insertMeta = db.prepare("INSERT INTO metadata (name, value) VALUES (?, ?)");
  const meta: Record<string, string> = {
    name: `${def.key}-terrain`,
    description: `Terrarium DEM (AWS elevation-tiles-prod) for the ${def.name} offline region`,
    format: "png",
    type: "baselayer",
    version: "1",
    encoding: "terrarium",
    bounds: `${def.bbox.west},${def.bbox.south},${def.bbox.east},${def.bbox.north}`,
    center: `${(def.bbox.west + def.bbox.east) / 2},${(def.bbox.south + def.bbox.north) / 2},10`,
    minzoom: String(DEM_MIN_ZOOM),
    maxzoom: String(DEM_MAX_ZOOM),
  };
  for (const [k, v] of Object.entries(meta)) insertMeta.run(k, v);

  let done = 0;
  let bytes = 0;
  const queue = [...tiles];
  async function worker(): Promise<void> {
    for (;;) {
      const t = queue.shift();
      if (!t) return;
      const data = await fetchDemTile(t);
      const tmsRow = 2 ** t.z - 1 - t.y; // MBTiles uses TMS row order
      insertTile.run(t.z, t.x, tmsRow, data);
      done += 1;
      bytes += data.length;
      if (done % 100 === 0 || done === tiles.length) {
        console.log(`  [${def.key}] ${done}/${tiles.length} (${(bytes / 1e6).toFixed(1)} MB)`);
      }
    }
  }
  await Promise.all(Array.from({ length: DEM_CONCURRENCY }, () => worker()));
  db.close();

  console.log(`[${def.key}] converting terrain to pmtiles...`);
  const tmp = `${out}.tmp`;
  if (existsSync(tmp)) rmSync(tmp);
  runPmtiles(bin, ["convert", mbtilesPath, tmp]);
  renameSync(tmp, out);
  rmSync(mbtilesPath);
  return out;
}

// ── Upload + catalog ────────────────────────────────────────────────────────

function contentTypeFor(path: string): string {
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".pbf")) return "application/x-protobuf";
  return "application/octet-stream";
}

async function uploadFile(local: string, key: string): Promise<void> {
  const { bucket, prefix } = getBucket();
  await bucket.upload(local, {
    destination: destKey(prefix, key),
    metadata: { contentType: contentTypeFor(local) },
  });
  console.log(`uploaded ${key} (${(statSync(local).size / 1e6).toFixed(1)} MB)`);
}

async function loadCatalog(): Promise<Catalog> {
  const { bucket, prefix } = getBucket();
  const file = bucket.file(destKey(prefix, "regions/catalog.json"));
  try {
    const [buf] = await file.download();
    return JSON.parse(buf.toString()) as Catalog;
  } catch {
    return { catalogVersion: 1, regions: [] };
  }
}

async function saveCatalog(catalog: Catalog): Promise<void> {
  const { bucket, prefix } = getBucket();
  const file = bucket.file(destKey(prefix, "regions/catalog.json"));
  await file.save(JSON.stringify(catalog, null, 2), {
    metadata: { contentType: "application/json", cacheControl: "no-cache" },
  });
  console.log(`catalog.json updated (${catalog.regions.length} regions)`);
}

async function buildOne(bin: string, def: RegionDef, force: boolean): Promise<void> {
  const dir = join(DATA_DIR, def.key);
  mkdirSync(dir, { recursive: true });

  const mapPath = await buildVector(bin, def, dir, force);
  const terrainPath = await buildTerrain(bin, def, dir, force);

  const base = regionPath(def);
  await uploadFile(mapPath, `${base}/map.pmtiles`);
  await uploadFile(terrainPath, `${base}/terrain.pmtiles`);

  const catalog = await loadCatalog();
  const entry: CatalogRegion = {
    key: def.key,
    name: def.name,
    state: def.state,
    bbox: def.bbox,
    version: def.version,
    path: base,
    mapBytes: statSync(mapPath).size,
    terrainBytes: statSync(terrainPath).size,
    updatedAt: new Date().toISOString(),
  };
  const idx = catalog.regions.findIndex((r) => r.key === def.key);
  if (idx >= 0) catalog.regions[idx] = entry;
  else catalog.regions.push(entry);
  catalog.regions.sort((a, b) => a.name.localeCompare(b.name));
  await saveCatalog(catalog);
}

async function uploadAssets(): Promise<void> {
  const assetsDir = join(DATA_DIR, "assets");
  if (!existsSync(assetsDir)) throw new Error(`missing ${assetsDir} (glyphs/sprites)`);
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
  for (const f of walk(assetsDir)) {
    const rel = f.slice(assetsDir.length + 1);
    await uploadFile(f, `regions/assets/${rel}`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const force = args.includes("--force");
  const target = args.find((a) => !a.startsWith("--"));

  if (target === "assets") {
    await uploadAssets();
    return;
  }
  if (!target) {
    console.log("Usage: region:build -- <key>|all [--force]");
    console.log(`Known regions: ${REGIONS.map((r) => r.key).join(", ")}`);
    process.exit(1);
  }
  const defs = target === "all" ? REGIONS : REGIONS.filter((r) => r.key === target);
  if (defs.length === 0) throw new Error(`unknown region key: ${target}`);

  const bin = await ensurePmtilesBin();
  for (const def of defs) {
    await buildOne(bin, def, force);
  }
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
