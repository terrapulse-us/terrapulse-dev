// Node-side port of artifacts/mobile/lib/blm-api.ts BLM OHV designated-area polygon query.
//
// NOTE: the original BLM_Natl_OHV_Areas/MapServer service (used by artifacts/mobile/lib/blm-api.ts)
// has been fully retired from BLM's ArcGIS catalog (404, and absent from the `recreation` folder's
// service listing) as of 2026-07. Its replacement is `recreation/BLM_Natl_Recs_poly` layer 0
// ("Recreation Sites"), a general recreation-area polygon layer whose OHV areas are identified by
// FET_SUBTYPE = "OHV Designated Area" (field names FET_NAME/FET_SUBTYPE/ADMIN_ST, not the old
// AREANAME/AREATYPE/ADMINST). Confirmed against a known area (Dumont Dunes, CA). The mobile app's
// blm-api.ts should be updated to this endpoint too the next time that code path is touched.
const BLM_BASE = "https://gis.blm.gov/arcgis/rest/services";
const BLM_RECS_POLY_URL = `${BLM_BASE}/recreation/BLM_Natl_Recs_poly/MapServer/0/query`;

export interface BlmPolygonFeature {
  type: "Feature";
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };
  properties: { AREANAME?: string; AREATYPE?: string; ADMINST?: string; GIS_ACRES?: number; [k: string]: unknown };
}

interface BlmRecsRawFeature {
  type: "Feature";
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] } | null;
  properties: { FET_NAME?: string; FET_SUBTYPE?: string; ADMIN_ST?: string; GIS_ACRES?: number };
}

export async function fetchBlmOhvAreasInBounds(
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number,
): Promise<BlmPolygonFeature[]> {
  const envelope = JSON.stringify({
    xmin: minLng,
    ymin: minLat,
    xmax: maxLng,
    ymax: maxLat,
    spatialReference: { wkid: 4326 },
  });
  const params = new URLSearchParams({
    geometry: envelope,
    geometryType: "esriGeometryEnvelope",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "FET_NAME,FET_SUBTYPE,ADMIN_ST,GIS_ACRES",
    f: "geojson",
    outSR: "4326",
    returnGeometry: "true",
    where: "FET_SUBTYPE = 'OHV Designated Area'",
    resultRecordCount: "200",
  });
  const resp = await fetch(`${BLM_RECS_POLY_URL}?${params}`, { headers: { Accept: "application/json" } });
  if (!resp.ok) throw new Error(`BLM API error ${resp.status}`);
  const json = (await resp.json()) as { features: BlmRecsRawFeature[] };
  return (json.features ?? [])
    .filter((f): f is BlmRecsRawFeature & { geometry: NonNullable<BlmRecsRawFeature["geometry"]> } => f.geometry != null)
    .map((f) => ({
      type: "Feature" as const,
      geometry: f.geometry,
      properties: {
        AREANAME: f.properties.FET_NAME,
        AREATYPE: f.properties.FET_SUBTYPE,
        ADMINST: f.properties.ADMIN_ST,
        GIS_ACRES: f.properties.GIS_ACRES,
      },
    }));
}
