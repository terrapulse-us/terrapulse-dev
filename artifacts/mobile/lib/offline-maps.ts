import { OfflineManager } from "@maplibre/maplibre-react-native";
import { Directory, File, Paths } from "expo-file-system";
import { OFFLINE_PACK_STYLE_URL } from "./map-styles";
import { fetchBlmOhvNear, type BlmOhvCollection } from "./blm-api";

// Shared offline-map download helper. Used by the map screen's own
// "download this trail" button, the auto-download-on-navigate flow, and the
// AI Trip Assistant's cell-coverage warning card, so all flows create packs
// with the exact same style/zoom bounds and metadata shape.
//
// Packs are created from OFFLINE_PACK_STYLE_URL (MapTiler topo-v2 — the app's
// default map layer). map.tsx forces the layer to "topo" while offline so the
// packed resources match what the live map requests. Packs created before
// this fix used the openfreemap liberty style, which the live map never
// renders — they are dead weight and get swept by migrateLegacyOfflinePacks().
//
// Alongside each pack, a snapshot of the trail's overlay data is saved to
// Paths.document/offline/{trailId}/:
//   ohv.geojson — BLM OHV designated-area boundaries near the trail
//   sma.png     — land-ownership (SMA) export image for the pack bbox
//   mvum.png    — USFS MVUM roads/trails export image for the pack bbox
//   meta.json   — the bbox (lng/lat) the PNGs were rendered for
// map.tsx renders the PNGs via ImageSource when offline, replacing the live
// ArcGIS raster tile overlays.

export interface RoutePointLike {
  lat: number;
  lng: number;
}

export interface OfflineTrailTarget {
  id: string;
  title: string;
  lat: number;
  lng: number;
  /** Optional route polyline — when present, the download bbox covers the
   * whole route instead of a fixed square around the trail point. */
  route?: RoutePointLike[];
}

export interface DownloadTrailAreaCallbacks {
  onAlreadySaved?: () => void;
  onComplete?: () => void;
  onError?: (message: string) => void;
}

export type OfflineBounds = [number, number, number, number]; // [w, s, e, n]

export interface TrailSnapshot {
  bounds: OfflineBounds;
  ohv: BlmOhvCollection | null;
  smaUri: string | null;
  mvumUri: string | null;
}

const OFFLINE_MIN_ZOOM = 8;
const OFFLINE_MAX_ZOOM = 16;
const POINT_PAD_DEG = 0.2;
const ROUTE_PAD_DEG = 0.1;
// Bump when the pack style/contents change incompatibly; packs whose
// metadata carries an older (or missing) version are treated as not-saved.
export const OFFLINE_STYLE_VERSION = 2;
// MapLibre's default tile-count limit (6000, Mapbox lineage) is too small for
// a route bbox at z8-16; a 40-mile trail can exceed it easily.
const TILE_COUNT_LIMIT = 25_000;

const SMA_EXPORT_BASE =
  "https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_Cached_with_PriUnk/MapServer/export";
const MVUM_EXPORT_BASE =
  "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_02/MapServer/export";

function computeBounds(target: OfflineTrailTarget): OfflineBounds {
  const route = target.route;
  if (route && route.length >= 2) {
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (const p of route) {
      if (p.lng < w) w = p.lng;
      if (p.lng > e) e = p.lng;
      if (p.lat < s) s = p.lat;
      if (p.lat > n) n = p.lat;
    }
    return [w - ROUTE_PAD_DEG, s - ROUTE_PAD_DEG, e + ROUTE_PAD_DEG, n + ROUTE_PAD_DEG];
  }
  return [
    target.lng - POINT_PAD_DEG,
    target.lat - POINT_PAD_DEG,
    target.lng + POINT_PAD_DEG,
    target.lat + POINT_PAD_DEG,
  ];
}

// ArcGIS export images are requested in EPSG:3857 (web mercator). Requesting
// 4326 instead would misalign the overlay by hundreds of meters mid-image at
// mid-latitudes, because MapLibre interpolates the ImageSource corner quad in
// mercator space.
function toMercator(lng: number, lat: number): [number, number] {
  const x = (lng * 20037508.34) / 180;
  const y =
    (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) *
    (20037508.34 / 180);
  return [x, y];
}

function exportImageUrl(base: string, bounds: OfflineBounds, layers?: string): string {
  const [xmin, ymin] = toMercator(bounds[0], bounds[1]);
  const [xmax, ymax] = toMercator(bounds[2], bounds[3]);
  const bbox = `${xmin},${ymin},${xmax},${ymax}`;
  const layersParam = layers ? `&layers=${layers}` : "";
  return `${base}?bbox=${bbox}&bboxSR=3857&imageSR=3857&size=2048,2048${layersParam}&transparent=true&format=png32&f=image`;
}

function snapshotDir(trailId: string): Directory {
  return new Directory(Paths.document, "offline", trailId);
}

async function saveTrailSnapshot(
  target: OfflineTrailTarget,
  bounds: OfflineBounds
): Promise<void> {
  const dir = snapshotDir(target.id);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });

  // BLM OHV boundaries near the trail point (same query the live overlay uses)
  try {
    const ohv = await fetchBlmOhvNear(target.lat, target.lng, 25);
    if (ohv.features.length > 0) {
      const f = new File(dir, "ohv.geojson");
      f.create({ overwrite: true, intermediates: true });
      f.write(JSON.stringify(ohv));
    }
  } catch {
    // best-effort
  }

  // Static export images for the raster overlays (SMA land ownership + MVUM).
  // MVUM is pinned to layers 1,2 (Roads + Trails) — the service's other layers
  // are "Data Available"/"Status" coverage placeholders that flood the image.
  for (const [name, base, layers] of [
    ["sma.png", SMA_EXPORT_BASE, undefined],
    ["mvum.png", MVUM_EXPORT_BASE, "show:1,2"],
  ] as const) {
    try {
      const f = new File(dir, name);
      if (f.exists) f.delete();
      await File.downloadFileAsync(exportImageUrl(base, bounds, layers), f);
    } catch {
      // best-effort — a missing PNG just means no offline overlay
    }
  }

  const metaFile = new File(dir, "meta.json");
  metaFile.create({ overwrite: true, intermediates: true });
  metaFile.write(
    JSON.stringify({ bounds, savedAt: Date.now(), version: OFFLINE_STYLE_VERSION })
  );
}

/** Loads the saved overlay snapshot for a trail, or null if none exists. */
export async function loadTrailSnapshot(
  trailId: string
): Promise<TrailSnapshot | null> {
  try {
    const dir = snapshotDir(trailId);
    if (!dir.exists) return null;
    const metaFile = new File(dir, "meta.json");
    if (!metaFile.exists) return null;
    const meta = JSON.parse(await metaFile.text()) as { bounds?: unknown };
    const bounds = meta.bounds;
    if (
      !Array.isArray(bounds) ||
      bounds.length !== 4 ||
      bounds.some((v) => typeof v !== "number")
    ) {
      return null;
    }
    let ohv: BlmOhvCollection | null = null;
    const ohvFile = new File(dir, "ohv.geojson");
    if (ohvFile.exists) {
      try {
        ohv = JSON.parse(await ohvFile.text()) as BlmOhvCollection;
      } catch {
        ohv = null;
      }
    }
    const sma = new File(dir, "sma.png");
    const mvum = new File(dir, "mvum.png");
    return {
      bounds: bounds as OfflineBounds,
      ohv,
      smaUri: sma.exists ? sma.uri : null,
      mvumUri: mvum.exists ? mvum.uri : null,
    };
  } catch {
    return null;
  }
}

function isCurrentPackMeta(meta: Record<string, unknown>): boolean {
  return (
    typeof meta.styleVersion === "number" &&
    meta.styleVersion >= OFFLINE_STYLE_VERSION
  );
}

async function findCurrentPack(trailId: string) {
  const packs = await OfflineManager.getPacks();
  return (
    packs.find((p) => {
      const meta = (p.metadata ?? {}) as Record<string, unknown>;
      return meta.trailId === trailId && isCurrentPackMeta(meta);
    }) ?? null
  );
}

/** True only when a CURRENT-format pack exists AND finished downloading.
 * Legacy liberty-style packs don't count (they never served the live map),
 * and neither do interrupted downloads — those must resume, not report saved. */
export async function isTrailAreaDownloaded(trailId: string): Promise<boolean> {
  try {
    const pack = await findCurrentPack(trailId);
    if (!pack) return false;
    const status = await pack.status();
    return status.state === "complete" || status.percentage >= 100;
  } catch {
    return false;
  }
}

/** Resumes any current-format packs whose download was interrupted (app
 * killed mid-download, connectivity drop). Call once on app/map mount. */
export async function resumeIncompleteOfflinePacks(): Promise<void> {
  try {
    const packs = await OfflineManager.getPacks();
    for (const p of packs) {
      const meta = (p.metadata ?? {}) as Record<string, unknown>;
      if (typeof meta.trailId !== "string" || !isCurrentPackMeta(meta)) continue;
      try {
        const status = await p.status();
        if (status.state !== "complete" && status.percentage < 100) {
          await p.resume();
        }
      } catch {
        // best-effort
      }
    }
  } catch {
    // best-effort
  }
}

/**
 * Deletes packs created before the style fix (they downloaded the openfreemap
 * liberty style, which the live map never renders — pure dead weight).
 * Returns the affected trailIds so callers can offer a re-download.
 */
export async function migrateLegacyOfflinePacks(): Promise<string[]> {
  try {
    const packs = await OfflineManager.getPacks();
    const removed: string[] = [];
    for (const p of packs) {
      const meta = (p.metadata ?? {}) as Record<string, unknown>;
      if (typeof meta.trailId !== "string") continue;
      if (typeof meta.styleVersion === "number" && meta.styleVersion >= OFFLINE_STYLE_VERSION)
        continue;
      try {
        await OfflineManager.deletePack(p.id);
        removed.push(meta.trailId);
      } catch {
        // leave it; sweep again next launch
      }
    }
    return removed;
  } catch {
    return [];
  }
}

export async function downloadTrailArea(
  target: OfflineTrailTarget,
  callbacks: DownloadTrailAreaCallbacks = {}
): Promise<void> {
  const { onAlreadySaved, onComplete, onError } = callbacks;
  try {
    const existing = await findCurrentPack(target.id);
    if (existing) {
      const status = await existing.status().catch(() => null);
      if (status && (status.state === "complete" || status.percentage >= 100)) {
        onAlreadySaved?.();
        return;
      }
      // Interrupted download — resume it instead of restarting from zero.
      await OfflineManager.addListener(
        existing.id,
        (_pack, s) => {
          if (s.percentage >= 100) onComplete?.();
        },
        (_pack, err) => {
          onError?.(err.message ?? "Unknown error.");
        }
      );
      // Refresh the overlay snapshot too (it may also be partial).
      void saveTrailSnapshot(target, computeBounds(target)).catch(() => {});
      await existing.resume();
      return;
    }

    // Replace any legacy (liberty-style) pack for this trail.
    try {
      const packs = await OfflineManager.getPacks();
      for (const p of packs) {
        const meta = (p.metadata ?? {}) as Record<string, unknown>;
        if (meta.trailId === target.id) await OfflineManager.deletePack(p.id);
      }
    } catch {
      // non-fatal
    }

    OfflineManager.setTileCountLimit(TILE_COUNT_LIMIT);
    const bounds = computeBounds(target);

    // Overlay snapshots download in parallel with the tile pack; both are
    // needed for the full offline experience but neither blocks the other.
    void saveTrailSnapshot(target, bounds).catch(() => {});

    await OfflineManager.createPack(
      {
        mapStyle: OFFLINE_PACK_STYLE_URL,
        minZoom: OFFLINE_MIN_ZOOM,
        maxZoom: OFFLINE_MAX_ZOOM,
        bounds,
        metadata: {
          trailId: target.id,
          trailTitle: target.title,
          lat: target.lat,
          lng: target.lng,
          styleUrl: OFFLINE_PACK_STYLE_URL,
          styleVersion: OFFLINE_STYLE_VERSION,
        },
      },
      (_pack, status) => {
        if (status.percentage >= 100) {
          onComplete?.();
        }
      },
      (_pack, err) => {
        onError?.(err.message ?? "Unknown error.");
      }
    );
  } catch {
    onError?.("Could not start download.");
  }
}

/** Fire-and-forget download used by auto-download-on-navigate. */
export function ensureTrailAreaDownloaded(
  target: OfflineTrailTarget,
  onComplete?: () => void
): void {
  void downloadTrailArea(target, {
    onComplete,
    onAlreadySaved: onComplete,
  }).catch(() => {});
}
