// Generates the glyph PNGs used by the map's GPU SymbolLayers
// (campgrounds, hiking POIs, OSM start/end flags).
//
// Output: artifacts/mobile/assets/map-icons/*.png (52px, transparent bg).
// White glyphs sit on a colored CircleLayer; the checkered flags are
// pre-colored because they sit on a white circle instead.
//
// Run: pnpm --filter @workspace/scripts run map-icons:generate

import { mkdirSync } from "node:fs";
import path from "node:path";

import {
  mdiBinoculars,
  mdiFlagCheckered,
  mdiHiking,
  mdiHomeRoof,
  mdiImageFilterHdr,
  mdiTablePicnic,
  mdiTent,
  mdiWaterfall,
  mdiWaterPump,
} from "@mdi/js";
import sharp from "sharp";

const OUT_DIR = path.resolve(
  import.meta.dirname,
  "../../../artifacts/mobile/assets/map-icons"
);
const SIZE = 52;

const ICONS: Array<{ name: string; d: string; color: string }> = [
  { name: "tent", d: mdiTent, color: "#FFFFFF" },
  { name: "poi-trailhead", d: mdiHiking, color: "#FFFFFF" },
  { name: "poi-viewpoint", d: mdiBinoculars, color: "#FFFFFF" },
  { name: "poi-peak", d: mdiImageFilterHdr, color: "#FFFFFF" },
  { name: "poi-waterfall", d: mdiWaterfall, color: "#FFFFFF" },
  { name: "poi-water", d: mdiWaterPump, color: "#FFFFFF" },
  { name: "poi-shelter", d: mdiHomeRoof, color: "#FFFFFF" },
  { name: "poi-picnic", d: mdiTablePicnic, color: "#FFFFFF" },
  { name: "flag-start", d: mdiFlagCheckered, color: "#1B5E20" },
  { name: "flag-end", d: mdiFlagCheckered, color: "#B71C1C" },
];

mkdirSync(OUT_DIR, { recursive: true });

for (const { name, d, color } of ICONS) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 24 24"><path d="${d}" fill="${color}"/></svg>`;
  const file = path.join(OUT_DIR, `${name}.png`);
  await sharp(Buffer.from(svg)).png().toFile(file);
  console.log(`wrote ${file}`);
}
