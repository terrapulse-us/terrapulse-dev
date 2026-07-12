const BLM_SMA_URL =
  "https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_LimitedAreas_Plss/MapServer/0/query";
const USFS_URL =
  "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_ForestSystemBoundary_01/MapServer/0/query";
const NPS_URL =
  "https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/NPS_Land_Resources_Division_Boundary_and_Tract_Data_Service/FeatureServer/0/query";

export type LandCheckResult =
  | { status: "public"; agency: "BLM" | "USFS" | "NPS"; unitName: string }
  | { status: "unknown" }
  | { status: "error" };

async function queryPoint(
  url: string,
  lat: number,
  lng: number,
  nameField: string,
): Promise<string | null> {
  const params = new URLSearchParams({
    geometry: JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }),
    geometryType: "esriGeometryPoint",
    spatialRel: "esriSpatialRelIntersects",
    outFields: nameField,
    returnGeometry: "false",
    resultRecordCount: "1",
    f: "json",
  });
  const resp = await fetch(`${url}?${params}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(9000),
  });
  if (!resp.ok) return null;
  const data = (await resp.json()) as {
    features?: Array<{ attributes: Record<string, unknown> }>;
  };
  const feat = data.features?.[0];
  if (!feat) return null;
  return String(feat.attributes[nameField] ?? "");
}

export async function checkPublicLand(lat: number, lng: number): Promise<LandCheckResult> {
  try {
    const [blmName, usfsName, npsName] = await Promise.all([
      queryPoint(BLM_SMA_URL, lat, lng, "ADMIN_UNIT_NAME").catch(() => null),
      queryPoint(USFS_URL, lat, lng, "FORESTNAME").catch(() => null),
      queryPoint(NPS_URL, lat, lng, "UNIT_NAME").catch(() => null),
    ]);
    if (blmName !== null)
      return { status: "public", agency: "BLM", unitName: blmName || "BLM Land" };
    if (usfsName !== null)
      return { status: "public", agency: "USFS", unitName: usfsName || "National Forest" };
    if (npsName !== null)
      return { status: "public", agency: "NPS", unitName: npsName || "National Park" };
    return { status: "unknown" };
  } catch {
    return { status: "error" };
  }
}
