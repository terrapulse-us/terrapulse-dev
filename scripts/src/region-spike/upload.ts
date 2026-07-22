/**
 * Region spike: upload Moab region archives + glyph/sprite assets to
 * Replit object storage (public search path), served by the api-server at
 * /api/storage/public-objects/<key>.
 *
 * Usage: pnpm --filter @workspace/scripts run region:upload
 */
import { Storage } from "@google-cloud/storage";
import { readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

const DATA_DIR = resolve(import.meta.dirname, "../../data/region-spike");

function contentTypeFor(path: string): string {
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".pbf")) return "application/x-protobuf";
  return "application/octet-stream";
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

async function main(): Promise<void> {
  const publicPath = (process.env.PUBLIC_OBJECT_SEARCH_PATHS || "")
    .split(",")[0]
    ?.trim();
  if (!publicPath) throw new Error("PUBLIC_OBJECT_SEARCH_PATHS not set");
  const parts = publicPath.replace(/^\//, "").split("/");
  const bucketName = parts[0];
  const prefix = parts.slice(1).join("/");
  const bucket = storage.bucket(bucketName);

  const uploads: Array<{ local: string; key: string }> = [
    { local: join(DATA_DIR, "moab-map.pmtiles"), key: "regions/moab-v1/map.pmtiles" },
    { local: join(DATA_DIR, "moab-terrain.pmtiles"), key: "regions/moab-v1/terrain.pmtiles" },
  ];
  for (const f of walk(join(DATA_DIR, "assets"))) {
    uploads.push({
      local: f,
      key: `regions/assets/${relative(join(DATA_DIR, "assets"), f)}`,
    });
  }

  for (const u of uploads) {
    const dest = prefix ? `${prefix}/${u.key}` : u.key;
    const size = statSync(u.local).size;
    await bucket.upload(u.local, {
      destination: dest,
      metadata: { contentType: contentTypeFor(u.local) },
    });
    console.log(`uploaded ${u.key} (${(size / 1e6).toFixed(1)} MB) -> gs://${bucketName}/${dest}`);
  }
  console.log(`\nDone: ${uploads.length} objects. Serve via /api/storage/public-objects/<key>`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
