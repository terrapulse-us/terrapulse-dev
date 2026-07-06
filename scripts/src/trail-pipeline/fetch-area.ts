// Phase 1 bulk sweep for "area" trails (SVRAs, OHV parks, dunes): tries to find a real BLM
// designated-OHV-area boundary polygon. Per product decision: areas get a real polygon where
// public land-boundary data exists, otherwise just the point — never a fabricated loop line.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_TRAILS } from "@workspace/trail-data";
import { loadManifest, saveManifest, setEntry } from "./manifest";
import { fetchBlmOhvAreasInBounds } from "./blm";
import { bboxAroundMiles, nameSimilarity } from "./geo";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../../data/areas");
mkdirSync(OUT_DIR, { recursive: true });

const NAME_SIM_THRESHOLD = 0.34;
const SEARCH_RADII = [20]; // single reasonably-wide pass; keeps the bulk sweep fast

async function main() {
  const manifest = loadManifest();
  const areaTrails = ALL_TRAILS.filter((t) => manifest.trails[t.id]?.classification === "area");
  const toProcess = areaTrails.filter((t) => manifest.trails[t.id]?.status === "pending");

  console.log(`${areaTrails.length} trails classified as "area"; ${toProcess.length} pending processing.`);

  let hits = 0, misses = 0;

  for (const trail of toProcess) {
    process.stdout.write(`[${trail.id}] ${trail.title} (${trail.state})... `);
    let matched = null;

    for (const radius of SEARCH_RADII) {
      const bbox = bboxAroundMiles(trail.coords.latitude, trail.coords.longitude, radius);
      let features;
      try {
        features = await fetchBlmOhvAreasInBounds(bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat);
      } catch {
        continue;
      }
      const best = features
        .filter((f) => f.properties.AREANAME)
        .map((f) => ({ f, sim: nameSimilarity(f.properties.AREANAME!, trail.title) }))
        .sort((a, b) => b.sim - a.sim)[0];
      if (best && best.sim >= NAME_SIM_THRESHOLD) {
        matched = best.f;
        break;
      }
    }

    if (!matched) {
      console.log("no BLM boundary match — point-only");
      setEntry(manifest, trail.id, {
        classification: "area",
        status: "no-data",
        notes: "No matching BLM OHV area boundary found (may be a state park/private OHV park, not BLM land). Map will show the point only.",
      });
      misses++;
      saveManifest(manifest);
      continue;
    }

    writeFileSync(
      path.join(OUT_DIR, `${trail.id}.geojson`),
      JSON.stringify({ type: "Feature", properties: { id: trail.id, title: trail.title, ...matched.properties }, geometry: matched.geometry }, null, 2) + "\n",
    );
    setEntry(manifest, trail.id, {
      classification: "area",
      status: "area-boundary",
      source: "blm-ohv-areas",
      notes: `Matched BLM area "${matched.properties.AREANAME}" — needs Phase 2 visual review before promotion to verified.`,
    });
    hits++;
    console.log(`BLM match: "${matched.properties.AREANAME}"`);
    saveManifest(manifest);
  }

  console.log(`\nDone. BLM boundary hits: ${hits}, no-data (point-only): ${misses}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
