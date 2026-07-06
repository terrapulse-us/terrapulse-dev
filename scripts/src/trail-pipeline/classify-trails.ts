// Classifies every trail in @workspace/trail-data into "route" (point-to-point line,
// e.g. a named USFS trail/road) or "area" (open riding area — SVRA, OHV park, dunes —
// where a polyline is the wrong shape; these get a boundary polygon or just a point).
//
// This is a heuristic first pass. Ambiguous or uncertain calls default to "area" —
// fabricating a route line for an open riding area is worse than under-classifying it,
// since it invents false precision. Phase 2 manual review can reclassify individual trails.
import { ALL_TRAILS } from "@workspace/trail-data";
import { loadManifest, saveManifest, setEntry, type Classification } from "./manifest";

// Trails already hand-built this session with real route-line geometry — preserve their
// existing verified status regardless of title heuristics.
const ALREADY_VERIFIED_ROUTES = new Set(["ca-1", "ca-4", "ca-6", "ca-17"]);
const ALREADY_VERIFIED_LANDMARK = new Set(["ca-3", "ca-5", "ca-7", "ca-20"]);

const AREA_KEYWORDS = [
  "svra", "state vehicular", "ohv area", "ohv park", "dunes", "dune",
  "recreation area", "riding area", "atv park", "mx park", "motocross",
  "play area", "off-highway vehicle area", "vehicular recreation",
];

const ROUTE_KEYWORDS = ["trail", "road", "pass", "route", "rim", "canyon", "divide", "byway", "backway", "grade"];

function classifyByTitle(title: string): { classification: Classification; confidence: "high" | "low" } {
  const t = title.toLowerCase();

  if (AREA_KEYWORDS.some((k) => t.includes(k))) {
    return { classification: "area", confidence: "high" };
  }
  const hasRouteWord = ROUTE_KEYWORDS.some((k) => t.includes(k));
  if (hasRouteWord && !t.includes("ohv trails") && !t.includes("ohv area")) {
    return { classification: "route", confidence: "high" };
  }
  // "X OHV Trails" (plural, generic) usually names a whole riding zone, not one path.
  if (t.includes("ohv trails") || t.includes("trails")) {
    return { classification: "area", confidence: "low" };
  }
  // Default: unclear titles (e.g. plain place names) treated as area — safer default.
  return { classification: "area", confidence: "low" };
}

function main() {
  const manifest = loadManifest();
  let routeCount = 0;
  let areaCount = 0;

  for (const trail of ALL_TRAILS) {
    if (ALREADY_VERIFIED_ROUTES.has(trail.id)) {
      setEntry(manifest, trail.id, {
        classification: "route",
        status: "verified",
        source: "usfs-mvum/usfs-nfs (hand-built)",
        notes: "Built this session from live USFS EDW geometry.",
      });
      routeCount++;
      continue;
    }
    if (ALREADY_VERIFIED_LANDMARK.has(trail.id)) {
      setEntry(manifest, trail.id, {
        classification: "route",
        status: "landmark",
        source: "web-search landmarks (hand-built)",
        notes: "Built this session from confirmed real landmark/waypoint coordinates; no surveyed track exists.",
      });
      routeCount++;
      continue;
    }

    const { classification, confidence } = classifyByTitle(trail.title);
    setEntry(manifest, trail.id, {
      classification,
      status: "pending",
      notes: `auto-classified by title heuristic (confidence: ${confidence})`,
    });
    if (classification === "route") routeCount++;
    else areaCount++;
  }

  saveManifest(manifest);
  console.log(`Classified ${ALL_TRAILS.length} trails: ${routeCount} route, ${areaCount} area.`);
  console.log(`Manifest written to lib/trail-data/route-status.json`);
}

main();
