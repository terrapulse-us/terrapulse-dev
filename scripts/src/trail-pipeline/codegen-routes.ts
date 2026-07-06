// T002: merge validated draft route GeoJSON (scripts/data/routes/*.geojson) into the app's
// artifacts/mobile/lib/trail-routes.ts.
//
// Reads lib/trail-data/route-status.json for the manifest of trails whose classification is
// "route" and status is "auto-candidate" (i.e. an automated USFS/OSM hit that passed
// validate-route.ts geometric sanity checks and has not yet had a Phase 2 manual visual review).
// For each, reads its draft GeoJSON, simplifies it, and generates a TRAIL_ROUTES entry.
//
// This is idempotent and safe to re-run: it fully regenerates the AUTO-CANDIDATE section of the
// file while leaving the hand-curated CA section (the original 8 verified/landmark trails) intact.
// Phase 2 review is then just: flip a trail's manifest status verified -> rerun this script.
//
// Usage: npx tsx src/trail-pipeline/codegen-routes.ts

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { douglasPeucker } from "./geo";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..");
const MANIFEST_PATH = join(ROOT, "lib/trail-data/route-status.json");
const ROUTES_DIR = join(ROOT, "scripts/data/routes");
const OUTPUT_PATH = join(ROOT, "artifacts/mobile/lib/trail-routes.ts");

const AUTO_BEGIN = "// ─── AUTO-GENERATED (codegen-routes.ts) — DO NOT HAND-EDIT BELOW ───────────";
const AUTO_END = "// ─── END AUTO-GENERATED ─────────────────────────────────────────────────────";

interface DraftFeature {
  properties: { id: string; title: string; source: string; miles: number };
  geometry: { type: "LineString"; coordinates: [number, number][] };
}

interface ManifestEntry {
  classification: "route" | "area";
  status: string;
  source?: string;
  notes?: string;
  updatedAt: string;
}

function main() {
  const manifest: { trails: Record<string, ManifestEntry> } = JSON.parse(
    readFileSync(MANIFEST_PATH, "utf-8"),
  );

  const candidateIds = Object.entries(manifest.trails)
    .filter(([, e]) => e.classification === "route" && e.status === "auto-candidate")
    .map(([id]) => id)
    .sort();

  const blocks: string[] = [];
  const skipped: string[] = [];

  for (const id of candidateIds) {
    const draftPath = join(ROUTES_DIR, `${id}.geojson`);
    if (!existsSync(draftPath)) {
      skipped.push(id);
      continue;
    }
    const feature: DraftFeature = JSON.parse(readFileSync(draftPath, "utf-8"));
    const raw = feature.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
    // Light simplification for map rendering (draft data is already coarse from fetch-route.ts,
    // this just guards against any denser upstream source slipping through).
    const simplified = raw.length > 4 ? douglasPeucker(raw, 0.0002) : raw;

    const comment = `  // ── ${feature.properties.title} (${id}) ── ${feature.properties.miles}mi, ` +
      `source: ${feature.properties.source.toUpperCase()}, auto-candidate — pending Phase 2 visual review ──`;
    const points = simplified
      .map((p) => `    { lat: ${p.lat.toFixed(5)}, lng: ${p.lng.toFixed(5)} },`)
      .join("\n");
    blocks.push(`${comment}\n  "${id}": [\n${points}\n  ],`);
  }

  const existing = readFileSync(OUTPUT_PATH, "utf-8");
  const beginIdx = existing.indexOf(AUTO_BEGIN);
  const endIdx = existing.indexOf(AUTO_END);

  const autoSection = [
    AUTO_BEGIN,
    "// Generated from USFS EDW / OSM Overpass name-matched hits, passed validate-route.ts geometric",
    "// sanity checks (point count, max inter-point gap, length plausibility, distance-from-anchor).",
    "// Not yet manually spot-checked against satellite imagery — see lib/trail-data/route-status.json",
    "// for per-trail status. Regenerate via: npx tsx scripts/src/trail-pipeline/codegen-routes.ts",
    ...blocks,
    AUTO_END,
  ].join("\n");

  let updated: string;
  if (beginIdx !== -1 && endIdx !== -1) {
    updated = existing.slice(0, beginIdx) + autoSection + existing.slice(endIdx + AUTO_END.length);
  } else {
    // First run: insert just before the closing `};` of TRAIL_ROUTES.
    const closeIdx = existing.lastIndexOf("};");
    if (closeIdx === -1) throw new Error("Could not find TRAIL_ROUTES closing brace in trail-routes.ts");
    updated = existing.slice(0, closeIdx) + autoSection + "\n" + existing.slice(closeIdx);
  }

  writeFileSync(OUTPUT_PATH, updated);
  console.log(`Merged ${blocks.length} auto-candidate routes into ${OUTPUT_PATH}`);
  if (skipped.length) console.log(`Skipped (no draft file found): ${skipped.join(", ")}`);
}

main();
