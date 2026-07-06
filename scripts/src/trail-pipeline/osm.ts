// Node-side port of artifacts/mobile/lib/osm-api.ts Overpass query logic.
import type { LatLng } from "./geo";

const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
}

function buildQuery(bbox: string): string {
  return [
    "[out:json][timeout:25];",
    "(",
    `  way["highway"="track"]["access"!~"^(private|no)$"](${bbox});`,
    `  way["4wd_only"="yes"](${bbox});`,
    `  way["highway"="path"]["motor_vehicle"~"^(yes|permissive|designated)$"](${bbox});`,
    `  way["atv"~"^(yes|permissive|designated)$"](${bbox});`,
    `  way["highway"~"^(track|path|service)$"]["surface"~"^(unpaved|dirt|gravel|ground|sand|rock|earth)$"]["access"!~"^(private|no)$"](${bbox});`,
    ");",
    "out geom;",
  ].join("\n");
}

export interface OsmWay {
  id: number;
  name?: string;
  tags: Record<string, string>;
  points: LatLng[];
}

export async function fetchOsmWaysNear(
  lat: number,
  lng: number,
  radiusMiles = 8,
): Promise<OsmWay[]> {
  const deg = radiusMiles / 69.0;
  const bbox = `${lat - deg},${lng - deg},${lat + deg},${lng + deg}`;
  const query = buildQuery(bbox);
  const body = `data=${encodeURIComponent(query)}`;

  let lastErr: unknown;
  for (const url of OVERPASS_URLS) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(25_000),
      });
      if (!resp.ok) throw new Error(`${url}: ${resp.status}`);
      const json = (await resp.json()) as { elements: OverpassElement[] };
      return json.elements
        .filter((el): el is OverpassElement & Required<Pick<OverpassElement, "geometry">> =>
          el.type === "way" && Array.isArray(el.geometry) && el.geometry.length >= 2,
        )
        .map((el) => ({
          id: el.id,
          name: el.tags?.name,
          tags: el.tags ?? {},
          points: el.geometry!.map((n) => ({ lat: n.lat, lng: n.lon })),
        }));
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`All Overpass endpoints failed: ${String(lastErr)}`);
}
