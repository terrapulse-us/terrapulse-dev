import { Router, type IRouter } from "express";

const router: IRouter = Router();

const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

const FETCH_TIMEOUT_MS = 20_000;

router.get("/osm-trails", async (req, res) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);
  const radius = parseFloat(req.query.radius as string) || 10;

  if (isNaN(lat) || isNaN(lng)) {
    res.status(400).json({ error: "lat and lng are required" });
    return;
  }

  const deg = radius / 69.0;
  const minLat = lat - deg;
  const maxLat = lat + deg;
  const minLng = lng - deg;
  const maxLng = lng + deg;
  const bbox = `${minLat},${minLng},${maxLat},${maxLng}`;

  const query = [
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

  let overpassResp: Response | null = null;
  for (const url of OVERPASS_URLS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      overpassResp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      if (overpassResp.ok) break;
    } catch {
      overpassResp = null;
    } finally {
      clearTimeout(timer);
    }
  }

  if (!overpassResp?.ok) {
    req.log.warn({ lat, lng }, "All Overpass endpoints failed");
    res.status(502).json({ error: "Overpass API unavailable" });
    return;
  }

  interface OverpassNode {
    type: string;
    id: number;
    tags?: Record<string, string>;
    geometry?: Array<{ lat: number; lon: number }>;
  }

  const json = (await overpassResp.json()) as { elements: OverpassNode[] };

  const features = json.elements
    .filter(
      (el): el is OverpassNode & Required<Pick<OverpassNode, "geometry">> =>
        el.type === "way" &&
        Array.isArray(el.geometry) &&
        el.geometry.length >= 2,
    )
    .map((el) => ({
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates: el.geometry.map((n) => [n.lon, n.lat]),
      },
      properties: {
        id: el.id,
        ...(el.tags ?? {}),
      },
    }));

  req.log.info({ lat, lng, radius, count: features.length }, "OSM trails proxied");
  res.json({ type: "FeatureCollection", features });
});

export default router;
