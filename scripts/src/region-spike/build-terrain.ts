/**
 * Region spike (Moab): build a terrarium DEM PMTiles archive.
 *
 * Fetches AWS elevation-tiles-prod terrarium PNGs (public domain, Mapzen/AWS
 * Open Data) covering the region bbox for z0–13, writes them into an MBTiles
 * file (TMS row flip + metadata), which is then converted to PMTiles with the
 * go-pmtiles CLI (`pmtiles convert`).
 *
 * DEM maxzoom is 13: z12 field-tested visibly blurry in mountain areas at
 * close zooms (MapLibre overzooms DEM, stretching the shading). z13 ~3-4x
 * the archive size but keeps hillshade crisp to ~z15 views; the style also
 * fades hillshade exaggeration past z13 to hide residual stretch.
 *
 * Usage: pnpm --filter @workspace/scripts run region:terrain
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Keep in sync with the vector extract bbox (moab-map.pmtiles).
const BBOX = { west: -109.9, south: 38.4, east: -109.3, north: 38.9 };
const MIN_ZOOM = 0;
const MAX_ZOOM = 13;
const CONCURRENCY = 8;
const OUT_PATH = resolve(
  import.meta.dirname,
  "../../data/region-spike/moab-terrain.mbtiles"
);

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

function tilesForBbox(): TileCoord[] {
  const tiles: TileCoord[] = [];
  for (let z = MIN_ZOOM; z <= MAX_ZOOM; z++) {
    const x0 = Math.max(0, lonToTileX(BBOX.west, z));
    const x1 = Math.min(2 ** z - 1, lonToTileX(BBOX.east, z));
    const y0 = Math.max(0, latToTileY(BBOX.north, z));
    const y1 = Math.min(2 ** z - 1, latToTileY(BBOX.south, z));
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        tiles.push({ z, x, y });
      }
    }
  }
  return tiles;
}

async function fetchTile(t: TileCoord): Promise<Uint8Array> {
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

async function main(): Promise<void> {
  const tiles = tilesForBbox();
  console.log(`Fetching ${tiles.length} terrarium tiles (z${MIN_ZOOM}-z${MAX_ZOOM})...`);

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  const db = new DatabaseSync(OUT_PATH);
  db.exec(`
    PRAGMA journal_mode = OFF;
    PRAGMA synchronous = OFF;
    DROP TABLE IF EXISTS tiles;
    DROP TABLE IF EXISTS metadata;
    CREATE TABLE metadata (name TEXT, value TEXT);
    CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB);
    CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row);
  `);
  const insertTile = db.prepare(
    "INSERT INTO tiles (zoom_level, tile_column, tile_row, tile_data) VALUES (?, ?, ?, ?)"
  );
  const insertMeta = db.prepare("INSERT INTO metadata (name, value) VALUES (?, ?)");

  const meta: Record<string, string> = {
    name: "moab-terrain",
    description: "Terrarium DEM (AWS elevation-tiles-prod) for the Moab region spike",
    format: "png",
    type: "baselayer",
    version: "1",
    encoding: "terrarium",
    bounds: `${BBOX.west},${BBOX.south},${BBOX.east},${BBOX.north}`,
    center: `${(BBOX.west + BBOX.east) / 2},${(BBOX.south + BBOX.north) / 2},10`,
    minzoom: String(MIN_ZOOM),
    maxzoom: String(MAX_ZOOM),
  };
  for (const [k, v] of Object.entries(meta)) insertMeta.run(k, v);

  let done = 0;
  let bytes = 0;
  const queue = [...tiles];
  async function worker(): Promise<void> {
    for (;;) {
      const t = queue.shift();
      if (!t) return;
      const data = await fetchTile(t);
      // MBTiles uses TMS row order: flip Y.
      const tmsRow = 2 ** t.z - 1 - t.y;
      insertTile.run(t.z, t.x, tmsRow, data);
      done += 1;
      bytes += data.length;
      if (done % 25 === 0 || done === tiles.length) {
        console.log(`  ${done}/${tiles.length} (${(bytes / 1e6).toFixed(1)} MB)`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  db.close();
  console.log(`Done: ${OUT_PATH} — ${tiles.length} tiles, ${(bytes / 1e6).toFixed(1)} MB raw`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
