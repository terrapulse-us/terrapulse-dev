/**
 * Offline region catalog definitions — the source of truth for which regions
 * the pipeline builds. Add a region here, then run:
 *
 *   pnpm --filter @workspace/scripts run region:build -- <key>
 *
 * Bboxes are deliberately modest (~0.5° per side): DEM bytes scale with area
 * and z14 terrain dominates the download (~120-160 MB per Moab-sized region).
 */
export interface RegionBbox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface RegionDef {
  /** Stable key; storage path is regions/<key>-v<version>/ */
  key: string;
  name: string;
  state: string;
  bbox: RegionBbox;
  /** Bump to invalidate — changes the storage path so clients re-download. */
  version: number;
}

export const REGIONS: RegionDef[] = [
  {
    key: "moab",
    name: "Moab",
    state: "UT",
    bbox: { west: -109.9, south: 38.4, east: -109.3, north: 38.9 },
    version: 1,
  },
  {
    key: "sedona",
    name: "Sedona",
    state: "AZ",
    bbox: { west: -112.0, south: 34.55, east: -111.5, north: 35.0 },
    version: 1,
  },
  {
    key: "johnson-valley",
    name: "Johnson Valley OHV",
    state: "CA",
    bbox: { west: -116.95, south: 34.2, east: -116.4, north: 34.65 },
    version: 1,
  },
  {
    key: "rubicon",
    name: "Rubicon / Tahoe",
    state: "CA",
    bbox: { west: -120.45, south: 38.85, east: -119.95, north: 39.25 },
    version: 1,
  },
];

export function regionPath(def: RegionDef): string {
  return `regions/${def.key}-v${def.version}`;
}
