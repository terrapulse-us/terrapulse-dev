import { Directory, File, Paths } from "expo-file-system";

// ── PMTiles Labs spike ───────────────────────────────────────────────────────
// Phase 4 device spike: prove that the maplibre-native binaries shipped in the
// current app builds (Android 13.2.0 / iOS 6.26.0 — both include the pmtiles
// protocol handler) can render a LOCAL .pmtiles archive downloaded with
// expo-file-system. If this renders on-device, whole-region offline downloads
// become a single-file affair instead of thousands of individually cached
// tiles. Do NOT build any region pipeline until this spike passes on the
// user's device.
//
// Test archive: the classic Protomaps Florence extract (~6.6 MB, ODbL) — a
// complete city vector basemap, small enough to download in seconds.

export const PMTILES_SPIKE_URL =
  "https://pmtiles.io/protomaps(vector)ODbL_firenze.pmtiles";

/** Florence, Italy — where the sample archive's tiles live. */
export const PMTILES_SPIKE_CENTER: [number, number] = [11.2558, 43.7696];
export const PMTILES_SPIKE_ZOOM = 13;

// Sanity floor: the archive is ~6.6 MB; anything much smaller is a partial
// or an HTML error page masquerading as a download.
const MIN_VALID_BYTES = 6_000_000;

function spikeFile(): File {
  return new File(new Directory(Paths.document, "labs"), "firenze.pmtiles");
}

/**
 * Downloads the sample archive (once) and returns the LOCAL pmtiles:// URL to
 * feed a VectorSource. maplibre-native's pmtiles handler expects
 * `pmtiles://` + an absolute filesystem path for local archives
 * (`pmtiles:///data/user/0/.../firenze.pmtiles`).
 * If the spike fails on-device, the first thing to try (OTA-iterable) is the
 * alternate URL form that keeps the file scheme: `pmtiles://file:///...`.
 */
export async function ensurePmtilesSpikeFile(): Promise<string> {
  const dir = new Directory(Paths.document, "labs");
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const f = spikeFile();
  if (f.exists && (f.size ?? 0) < MIN_VALID_BYTES) f.delete();
  if (!f.exists) {
    await File.downloadFileAsync(PMTILES_SPIKE_URL, f);
    if ((spikeFile().size ?? 0) < MIN_VALID_BYTES) {
      try {
        spikeFile().delete();
      } catch {
        // ignore
      }
      throw new Error("PMTiles download incomplete");
    }
  }
  const path = f.uri.replace(/^file:\/\//, "");
  return `pmtiles://${path}`;
}

/** Deletes the downloaded spike archive (toggle-off cleanup). */
export function removePmtilesSpikeFile(): void {
  try {
    const f = spikeFile();
    if (f.exists) f.delete();
  } catch {
    // best-effort
  }
}
