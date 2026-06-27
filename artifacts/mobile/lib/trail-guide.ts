// ─── Unified Trail Guide type ──────────────────────────────────────────────────
// Single data model that can represent any trail from any source.
// Used by TrailGuideSheet and navigateTrail().

import {
  featureDisplayName, formatTerraUse, extractBestRoute, featureStartCoord,
  nfsFeatureDisplayName, nfsTrailClass, nfsExtractRoute, nfsFeatureStartCoord,
  type UsfsFeature, type UsfsNfsFeature,
} from "./usfs-api";
import {
  osmFeatureDisplayName, osmFeatureSurface, osmFeatureType,
  osmExtractRoute, osmFeatureStartCoord, osmFeatureLengthMiles,
  type OsmFeature,
} from "./osm-api";
import {
  ridbFacilityCoord, ridbFacilityActivities, ridbCleanDescription,
  type RidbFacility,
} from "./ridb-api";
import type { BlmOhvFeature } from "./blm-api";

// ─── Source config ─────────────────────────────────────────────────────────────

export type TrailSource =
  | "usfs-mvum"
  | "usfs-nfs"
  | "osm"
  | "blm"
  | "ridb"
  | "app";

export interface SourceConfig {
  label: string;
  color: string;    // background of badge / button
  textColor: string; // text on badge / button
}

export const SOURCE_CONFIG: Record<TrailSource, SourceConfig> = {
  "usfs-mvum": { label: "USFS Motor Vehicle",  color: "#1A6B9E", textColor: "#fff" },
  "usfs-nfs":  { label: "USFS NFS Trails",     color: "#2D6A4F", textColor: "#fff" },
  "osm":       { label: "OpenStreetMap",        color: "#3DAA5C", textColor: "#fff" },
  "blm":       { label: "BLM",                 color: "#D4860A", textColor: "#fff" },
  "ridb":      { label: "Recreation.gov",       color: "#7B3F9E", textColor: "#fff" },
  "app":       { label: "TerraPulse",           color: "#1E3A1E", textColor: "#EBE4D1" },
};

// ─── Unified type ──────────────────────────────────────────────────────────────

export interface TrailGuide {
  id: string;
  source: TrailSource;
  name: string;
  subtitle?: string;       // short description line (type · surface)
  lengthMiles?: number;
  allowedUse?: string;     // human-readable vehicle types
  surface?: string;
  trailClass?: string;     // USFS trail classification
  managingOrg?: string;
  description?: string;    // longer text from RIDB / NFS
  directions?: string;     // how to get there (RIDB)
  routeCoordinates?: Array<{ lat: number; lng: number }>;
  startCoord: [number, number]; // [lng, lat] for the map marker
}

// ─── Conversion helpers ────────────────────────────────────────────────────────

export function fromUsfsFeature(f: UsfsFeature): TrailGuide {
  const route = extractBestRoute({ type: "FeatureCollection", features: [f] });
  const start = featureStartCoord(f);
  const miles = f.properties.GIS_MILES;
  return {
    id: `usfs-${JSON.stringify(f.properties.TRAIL_NO ?? f.properties.RTE_SY_GRP_NM ?? Math.random())}`,
    source: "usfs-mvum",
    name: featureDisplayName(f),
    subtitle: formatTerraUse(f.properties.ALLOWED_TERRA_USE),
    surface: f.properties.SURFACE_TYPE ?? undefined,
    lengthMiles: miles ? Number(miles) : undefined,
    allowedUse: formatTerraUse(f.properties.ALLOWED_TERRA_USE),
    routeCoordinates: route ?? undefined,
    startCoord: start ?? [0, 0],
  };
}

export function fromUsfsNfsFeature(f: UsfsNfsFeature): TrailGuide {
  const route = nfsExtractRoute(f);
  const start = nfsFeatureStartCoord(f);
  const miles = f.properties.GIS_MILES;
  return {
    id: `nfs-${f.properties.TRAIL_CN ?? f.properties.TRAIL_NO ?? Math.random()}`,
    source: "usfs-nfs",
    name: nfsFeatureDisplayName(f),
    subtitle: [nfsTrailClass(f), f.properties.SURFACE_TYPE].filter(Boolean).join(" · "),
    surface: f.properties.SURFACE_TYPE ?? undefined,
    lengthMiles: miles ? Number(miles) : undefined,
    trailClass: nfsTrailClass(f),
    allowedUse: f.properties.ALLOWED_TERRA_USE
      ? formatTerraUse(f.properties.ALLOWED_TERRA_USE)
      : "All Trails",
    managingOrg: f.properties.MANAGING_ORG ?? undefined,
    routeCoordinates: route.length >= 2 ? route : undefined,
    startCoord: start ?? [0, 0],
  };
}

export function fromOsmFeature(f: OsmFeature): TrailGuide {
  const route = osmExtractRoute(f);
  const start = osmFeatureStartCoord(f);
  const miles = osmFeatureLengthMiles(f);
  return {
    id: `osm-${f.properties.id}`,
    source: "osm",
    name: osmFeatureDisplayName(f),
    subtitle: [osmFeatureType(f), osmFeatureSurface(f)].join(" · "),
    surface: osmFeatureSurface(f),
    lengthMiles: miles ?? undefined,
    allowedUse: f.properties["4wd_only"] === "yes" ? "4WD Only" :
                f.properties.motor_vehicle === "designated" ? "Designated OHV" : "Motorized",
    routeCoordinates: route.length >= 2 ? route : undefined,
    startCoord: start ?? [0, 0],
  };
}

export function fromRidbFacility(f: RidbFacility): TrailGuide {
  const coord = ridbFacilityCoord(f);
  return {
    id: `ridb-${f.FacilityID}`,
    source: "ridb",
    name: f.FacilityName,
    subtitle: ridbFacilityActivities(f),
    description: ridbCleanDescription(f),
    directions: f.FacilityDirections?.replace(/<[^>]*>/g, " ").trim() ?? undefined,
    managingOrg: "Recreation.gov / Federal Lands",
    startCoord: coord ?? [0, 0],
  };
}

export function fromBlmFeature(f: BlmOhvFeature, startCoord: [number, number]): TrailGuide {
  const acres = f.properties.GIS_ACRES;
  return {
    id: `blm-${Math.random()}`,
    source: "blm",
    name: f.properties.AREANAME ?? "BLM OHV Area",
    subtitle: f.properties.AREATYPE ?? "Designated OHV Area",
    managingOrg: f.properties.ADMINST ?? "Bureau of Land Management",
    description: acres
      ? `This BLM designated OHV area covers approximately ${acres >= 1000 ? `${(acres / 1000).toFixed(1)}k` : Math.round(acres).toLocaleString()} acres of public land open to off-highway vehicle use.`
      : "Designated BLM area open to off-highway vehicle use.",
    startCoord,
  };
}
