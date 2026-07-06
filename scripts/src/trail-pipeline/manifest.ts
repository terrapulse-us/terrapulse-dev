import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const MANIFEST_PATH = path.resolve(__dirname, "../../../lib/trail-data/route-status.json");

export type Classification = "route" | "area";
export type TrailStatus =
  | "pending"
  | "auto-candidate"
  | "verified"
  | "landmark"
  | "area-boundary"
  | "not-found"
  | "no-data";

export interface TrailManifestEntry {
  classification: Classification;
  status: TrailStatus;
  source?: string;
  notes?: string;
  updatedAt: string;
}

export interface Manifest {
  generatedAt: string;
  trails: Record<string, TrailManifestEntry>;
}

export function loadManifest(): Manifest {
  if (!existsSync(MANIFEST_PATH)) {
    return { generatedAt: new Date().toISOString(), trails: {} };
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as Manifest;
}

export function saveManifest(manifest: Manifest): void {
  manifest.generatedAt = new Date().toISOString();
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
}

export function setEntry(
  manifest: Manifest,
  id: string,
  entry: Omit<TrailManifestEntry, "updatedAt">,
): void {
  manifest.trails[id] = { ...entry, updatedAt: new Date().toISOString() };
}
