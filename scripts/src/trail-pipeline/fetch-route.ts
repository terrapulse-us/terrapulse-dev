// Phase 1 bulk sweep: for every trail classified "route" in the manifest, try to find real
// line geometry — USFS EDW first (National Forest trails/roads), then OSM Overpass fallback
// (covers BLM/state-park trails USFS doesn't have). Writes a draft GeoJSON LineString per hit
// plus updates the manifest to "auto-candidate". Never fabricates a line: trails with no
// API hit are left "pending" for Phase 3 landmark research, not guessed at.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_TRAILS, type Trail } from "@workspace/trail-data";
import { loadManifest, saveManifest, setEntry } from "./manifest";
import { queryUsfsAll, usfsFeatureName, usfsFeatureParts } from "./usfs";
import { fetchOsmWaysNear } from "./osm";
import {
  bboxAroundMiles,
  chainParts,
  douglasPeucker,
  nameSimilarity,
  totalLengthMiles,
  type LatLng,
} from "./geo";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../../data/routes");
mkdirSync(OUT_DIR, { recursive: true });

const NAME_SIM_THRESHOLD = 0.34;
const MIN_LENGTH_MILES = 0.4;
const MAX_LENGTH_MILES = 60;
const SEARCH_RADII = [10]; // single reasonably-wide pass; keeps the bulk sweep fast

async function tryUsfs(trail: Trail): Promise<{ points: LatLng[]; source: string } | null> {
  for (const radius of SEARCH_RADII) {
    const bbox = bboxAroundMiles(trail.coords.latitude, trail.coords.longitude, radius);
    let results;
    try {
      results = await queryUsfsAll(bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat);
    } catch {
      continue;
    }

    const candidateParts: LatLng[][] = [];
    for (const { features } of results) {
      for (const f of features) {
        const name = usfsFeatureName(f);
        if (!name) continue;
        if (nameSimilarity(name, trail.title) < NAME_SIM_THRESHOLD) continue;
        candidateParts.push(...usfsFeatureParts(f));
      }
    }
    if (candidateParts.length === 0) continue;

    const anchor: LatLng = { lat: trail.coords.latitude, lng: trail.coords.longitude };
    const { chain } = chainParts(candidateParts, anchor, 0.5);
    const miles = totalLengthMiles(chain);
    if (chain.length >= 2 && miles >= MIN_LENGTH_MILES && miles <= MAX_LENGTH_MILES) {
      return { points: chain, source: "usfs" };
    }
  }
  return null;
}

async function tryOsm(trail: Trail): Promise<{ points: LatLng[]; source: string } | null> {
  for (const radius of SEARCH_RADII) {
    let ways;
    try {
      ways = await fetchOsmWaysNear(trail.coords.latitude, trail.coords.longitude, radius);
    } catch {
      continue;
    }
    const candidateParts = ways
      .filter((w) => w.name && nameSimilarity(w.name, trail.title) >= NAME_SIM_THRESHOLD)
      .map((w) => w.points);
    if (candidateParts.length === 0) continue;

    const anchor: LatLng = { lat: trail.coords.latitude, lng: trail.coords.longitude };
    const { chain } = chainParts(candidateParts, anchor, 0.5);
    const miles = totalLengthMiles(chain);
    if (chain.length >= 2 && miles >= MIN_LENGTH_MILES && miles <= MAX_LENGTH_MILES) {
      return { points: chain, source: "osm" };
    }
  }
  return null;
}

async function main() {
  const manifest = loadManifest();
  const routeTrails = ALL_TRAILS.filter((t) => manifest.trails[t.id]?.classification === "route");
  const toProcess = routeTrails.filter((t) => {
    const status = manifest.trails[t.id]?.status;
    return status === "pending";
  });

  console.log(`${routeTrails.length} trails classified as "route"; ${toProcess.length} pending processing.`);

  let usfsHits = 0, osmHits = 0, misses = 0;

  for (const trail of toProcess) {
    process.stdout.write(`[${trail.id}] ${trail.title} (${trail.state})... `);
    let result = await tryUsfs(trail);
    if (!result) {
      await new Promise((r) => setTimeout(r, 1000)); // be polite to the public Overpass servers
      result = await tryOsm(trail);
    }

    if (!result) {
      console.log("no API hit");
      setEntry(manifest, trail.id, {
        classification: "route",
        status: "not-found",
        notes: "USFS + OSM found no confident name match; needs Phase 3 landmark research.",
      });
      misses++;
      saveManifest(manifest);
      continue;
    }

    const simplified = douglasPeucker(result.points, 0.0004);
    const miles = totalLengthMiles(simplified);
    const geojson = {
      type: "Feature" as const,
      properties: { id: trail.id, title: trail.title, source: result.source, miles: Number(miles.toFixed(2)) },
      geometry: { type: "LineString" as const, coordinates: simplified.map((p) => [p.lng, p.lat]) },
    };
    writeFileSync(path.join(OUT_DIR, `${trail.id}.geojson`), JSON.stringify(geojson, null, 2) + "\n");

    setEntry(manifest, trail.id, {
      classification: "route",
      status: "auto-candidate",
      source: result.source,
      notes: `${simplified.length} pts, ${miles.toFixed(1)} mi — needs Phase 2 visual review before promotion to verified.`,
    });

    if (result.source === "usfs") usfsHits++; else osmHits++;
    console.log(`${result.source} hit, ${miles.toFixed(1)} mi, ${simplified.length} pts`);

    saveManifest(manifest); // checkpoint after every trail so a crash/timeout doesn't lose progress
  }

  console.log(`\nDone. USFS hits: ${usfsHits}, OSM hits: ${osmHits}, no hit: ${misses}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
