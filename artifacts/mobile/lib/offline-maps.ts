import { OfflineManager } from "@maplibre/maplibre-react-native";

// Shared offline-map download helper. Used by the map screen's own
// "download this trail" button and by the AI Trip Assistant's cell-coverage
// warning card, so both flows create packs with the exact same style/zoom
// bounds and metadata shape.

export interface OfflineTrailTarget {
  id: string;
  title: string;
  lat: number;
  lng: number;
}

export interface DownloadTrailAreaCallbacks {
  onAlreadySaved?: () => void;
  onComplete?: () => void;
  onError?: (message: string) => void;
}

const OFFLINE_MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const OFFLINE_MIN_ZOOM = 8;
const OFFLINE_MAX_ZOOM = 16;
const OFFLINE_BOUNDS_PAD_DEG = 0.2;

export async function isTrailAreaDownloaded(trailId: string): Promise<boolean> {
  const packs = await OfflineManager.getPacks();
  return packs.some(
    (p) => (p.metadata as Record<string, unknown>)?.trailId === trailId
  );
}

export async function downloadTrailArea(
  target: OfflineTrailTarget,
  callbacks: DownloadTrailAreaCallbacks = {}
): Promise<void> {
  const { onAlreadySaved, onComplete, onError } = callbacks;
  try {
    const already = await isTrailAreaDownloaded(target.id);
    if (already) {
      onAlreadySaved?.();
      return;
    }

    const pad = OFFLINE_BOUNDS_PAD_DEG;
    await OfflineManager.createPack(
      {
        mapStyle: OFFLINE_MAP_STYLE,
        minZoom: OFFLINE_MIN_ZOOM,
        maxZoom: OFFLINE_MAX_ZOOM,
        bounds: [
          target.lng - pad,
          target.lat - pad,
          target.lng + pad,
          target.lat + pad,
        ],
        metadata: {
          trailId: target.id,
          trailTitle: target.title,
          lat: target.lat,
          lng: target.lng,
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
