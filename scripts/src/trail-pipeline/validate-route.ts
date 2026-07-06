// Sanity-checks every auto-candidate / area-boundary draft against basic geometric plausibility
// before it's eligible for promotion to "verified" (Phase 2). Catches exactly the class of bug
// that started this whole effort: a "route" that's actually just 2-3 points forming a straight
// line across a huge gap.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_TRAILS } from "@workspace/trail-data";
import { loadManifest } from "./manifest";
import { haversineMiles, maxGapMiles, totalLengthMiles, type LatLng } from "./geo";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROUTES_DIR = path.resolve(__dirname, "../../data/routes");
const MAX_GAP_MILES = 3.0; // a single inter-point jump bigger than this is suspicious
const MAX_ANCHOR_DIST_MILES = 20; // route should stay reasonably close to the trail's known anchor
const MIN_POINTS = 3;

function trailById(id: string) {
  return ALL_TRAILS.find((t) => t.id === id);
}

function main() {
  const manifest = loadManifest();
  const files = readdirSync(ROUTES_DIR).filter((f) => f.endsWith(".geojson"));

  let pass = 0, fail = 0;
  for (const file of files) {
    const id = file.replace(/\.geojson$/, "");
    const trail = trailById(id);
    if (!trail) {
      console.log(`[${id}] FAIL — no matching trail in ALL_TRAILS`);
      fail++;
      continue;
    }
    const geo = JSON.parse(readFileSync(path.join(ROUTES_DIR, file), "utf-8"));
    const points: LatLng[] = geo.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng }));

    const issues: string[] = [];
    if (points.length < MIN_POINTS) issues.push(`only ${points.length} points`);
    const gap = maxGapMiles(points);
    if (gap > MAX_GAP_MILES) issues.push(`max inter-point gap ${gap.toFixed(1)}mi > ${MAX_GAP_MILES}mi`);
    const anchor: LatLng = { lat: trail.coords.latitude, lng: trail.coords.longitude };
    const distFromAnchor = Math.min(...points.map((p) => haversineMiles(p, anchor)));
    if (distFromAnchor > MAX_ANCHOR_DIST_MILES) {
      issues.push(`closest point is ${distFromAnchor.toFixed(1)}mi from trail's known anchor`);
    }
    const length = totalLengthMiles(points);
    if (length < 0.2) issues.push(`total length only ${length.toFixed(2)}mi`);

    if (issues.length > 0) {
      console.log(`[${id}] FAIL — ${issues.join("; ")}`);
      fail++;
    } else {
      console.log(`[${id}] OK — ${points.length} pts, ${length.toFixed(1)}mi, max gap ${gap.toFixed(2)}mi`);
      pass++;
    }
  }

  console.log(`\n${pass} passed, ${fail} failed (of ${files.length} draft routes).`);
  const pendingCount = Object.values(manifest.trails).filter((t) => t.status === "pending").length;
  console.log(`${pendingCount} trails still pending (no automated hit yet).`);
}

main();
