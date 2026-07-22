import { OfflineManager } from "@maplibre/maplibre-react-native";
import { Directory, File, Paths } from "expo-file-system";
import { OFFLINE_PACK_STYLE_URL } from "./map-styles";
import {
  fetchBlmOhvNear,
  fetchSmaPolygonsForSnapshot,
  type BlmOhvCollection,
  type SmaVectorCollection,
} from "./blm-api";
import { fetchUsfsTrailsInBoundsPaged, type UsfsCollection } from "./usfs-api";

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
//   ohv.geojson  — BLM OHV designated-area boundaries near the trail
//   sma.geojson  — land-ownership (SMA) polygons for the pack bbox (vector)
//   mvum.geojson — USFS MVUM roads/trails for the pack bbox (vector)
//   meta.json    — the bbox (lng/lat) the snapshot covers
// map.tsx renders the vectors via GeoJSONSource when offline — crisp at every
// zoom, replacing the live ArcGIS raster tile overlays. Snapshots saved before
// the vector upgrade contain sma.png/mvum.png export images instead; those
// still render via ImageSource as a fallback until the snapshot is silently
// re-saved by upgradeSnapshotsToVectors().

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
  /** Vector land-ownership polygons (new-format snapshots). */
  sma: SmaVectorCollection | null;
  /** Vector MVUM roads/trails (new-format snapshots). */
  mvum: UsfsCollection | null;
  /** Legacy raster fallbacks (snapshots saved before the vector upgrade). */
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

// Hard ceiling per snapshot geojson file. RN JSON.parse of a ~6MB string is
// still fast enough on-device; beyond that, trim features rather than risk
// jank (or a failed write) when the snapshot is loaded offline.
const MAX_SNAPSHOT_JSON_CHARS = 6_000_000;

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

function snapshotDir(trailId: string): Directory {
  return new Directory(Paths.document, "offline", trailId);
}

// ── Offline 3D-topo style ────────────────────────────────────────────────────
// The 3D topo style (topo-v2 draped over the terrain DEM) references EXACTLY
// the same tile resources every offline pack already contains: topo-v2 vector
// tiles, glyphs/sprites, and the terrain-rgb-v2 DEM (pulled in by topo-v2's
// built-in Hillshade layer). The ONLY thing missing offline is the style
// document itself, which map.tsx builds at runtime from a network fetch of
// style.json. Persisting the built style JSON here makes 3D topo fully
// offline-capable with zero pack-format changes.

function offline3dStyleFile(): File {
  return new File(new Directory(Paths.document, "offline", "styles"), "topo3d.json");
}

/** Persists the built 3D-topo style JSON for offline sessions. Sync + best-effort. */
export function persistOffline3dStyle(style: Record<string, unknown>): void {
  try {
    const dir = new Directory(Paths.document, "offline", "styles");
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const f = offline3dStyleFile();
    f.create({ overwrite: true, intermediates: true });
    f.write(JSON.stringify(style));
  } catch {
    // best-effort — offline 3D topo just won't be available
  }
}

/** Loads the persisted 3D-topo style, or null if never persisted / corrupt. */
export async function loadOffline3dStyle(): Promise<Record<string, unknown> | null> {
  try {
    const f = offline3dStyleFile();
    if (!f.exists) return null;
    return JSON.parse(await f.text()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Writes a FeatureCollection to a snapshot file, trimming features if the
 * serialized JSON exceeds the size ceiling. Returns true on success. */
function writeGeojsonCapped(
  dir: Directory,
  name: string,
  collection: { type: "FeatureCollection"; features: unknown[] }
): boolean {
  try {
    let features = collection.features;
    let json = JSON.stringify({ type: "FeatureCollection", features });
    while (json.length > MAX_SNAPSHOT_JSON_CHARS && features.length > 25) {
      features = features.slice(0, Math.floor(features.length / 2));
      json = JSON.stringify({ type: "FeatureCollection", features });
    }
    if (json.length > MAX_SNAPSHOT_JSON_CHARS) return false;
    const f = new File(dir, name);
    f.create({ overwrite: true, intermediates: true });
    f.write(json);
    return true;
  } catch {
    return false;
  }
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

  // Vector overlay snapshots (SMA land ownership + MVUM roads/trails) —
  // crisp at every zoom, unlike the 2048px export PNGs they replaced. Each
  // fetch is best-effort and independent. The fetchers THROW on failure, so
  // reaching the write means the result is trustworthy — an empty collection
  // is genuinely "no data here" and is still written, marking the snapshot
  // as vector-upgraded (otherwise upgradeSnapshotsToVectors would re-fetch
  // no-data trails every session). The legacy PNG (if any) is only deleted
  // once its vector replacement is safely on disk.
  const [w, s, e, n] = bounds;
  try {
    const sma = await fetchSmaPolygonsForSnapshot(w, s, e, n);
    if (writeGeojsonCapped(dir, "sma.geojson", sma)) {
      const legacy = new File(dir, "sma.png");
      if (legacy.exists) legacy.delete();
    }
  } catch {
    // fetch failed — leave any legacy PNG in place, retry next session
  }
  try {
    const mvum = await fetchUsfsTrailsInBoundsPaged(w, s, e, n);
    if (writeGeojsonCapped(dir, "mvum.geojson", mvum)) {
      const legacy = new File(dir, "mvum.png");
      if (legacy.exists) legacy.delete();
    }
  } catch {
    // fetch failed — leave any legacy PNG in place, retry next session
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
    const readJson = async <T,>(name: string): Promise<T | null> => {
      const f = new File(dir, name);
      if (!f.exists) return null;
      try {
        return JSON.parse(await f.text()) as T;
      } catch {
        return null;
      }
    };
    const [ohv, sma, mvum] = await Promise.all([
      readJson<BlmOhvCollection>("ohv.geojson"),
      readJson<SmaVectorCollection>("sma.geojson"),
      readJson<UsfsCollection>("mvum.geojson"),
    ]);
    // Legacy raster fallbacks — only relevant when the vector file is absent
    // (snapshot saved before the vector upgrade and not yet re-saved).
    const smaPng = new File(dir, "sma.png");
    const mvumPng = new File(dir, "mvum.png");
    return {
      bounds: bounds as OfflineBounds,
      ohv,
      sma,
      mvum,
      smaUri: !sma && smaPng.exists ? smaPng.uri : null,
      mvumUri: !mvum && mvumPng.exists ? mvumPng.uri : null,
    };
  } catch {
    return null;
  }
}

/**
 * Silently upgrades pre-vector snapshots: for every completed current-format
 * pack whose snapshot dir is missing the vector geojson files, re-runs
 * saveTrailSnapshot (which fetches vectors and sweeps the legacy PNGs).
 * Call once per session while ONLINE — it hits ArcGIS services. Sequential
 * on purpose so a user with many saved trails doesn't hammer the services.
 */
export async function upgradeSnapshotsToVectors(): Promise<void> {
  try {
    const packs = await OfflineManager.getPacks();
    for (const p of packs) {
      const meta = (p.metadata ?? {}) as Record<string, unknown>;
      if (typeof meta.trailId !== "string" || !isCurrentPackMeta(meta)) continue;
      if (typeof meta.lat !== "number" || typeof meta.lng !== "number") continue;
      try {
        const status = await p.status();
        if (status.state !== "complete" && status.percentage < 100) continue;
      } catch {
        continue;
      }
      const dir = snapshotDir(meta.trailId);
      if (new File(dir, "sma.geojson").exists && new File(dir, "mvum.geojson").exists)
        continue;
      const target: OfflineTrailTarget = {
        id: meta.trailId,
        title: typeof meta.trailTitle === "string" ? meta.trailTitle : meta.trailId,
        lat: meta.lat,
        lng: meta.lng,
      };
      // Prefer the exact bounds the original snapshot was saved with (route
      // bboxes are wider than the recomputed point bbox).
      let bounds = computeBounds(target);
      try {
        const metaFile = new File(dir, "meta.json");
        if (metaFile.exists) {
          const m = JSON.parse(await metaFile.text()) as { bounds?: unknown };
          if (
            Array.isArray(m.bounds) &&
            m.bounds.length === 4 &&
            m.bounds.every((v) => typeof v === "number")
          ) {
            bounds = m.bounds as OfflineBounds;
          }
        }
      } catch {
        // fall back to recomputed bounds
      }
      await saveTrailSnapshot(target, bounds).catch(() => {});
    }
  } catch {
    // best-effort
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
