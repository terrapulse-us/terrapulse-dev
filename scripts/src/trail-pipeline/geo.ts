export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_MILES = 3958.8;

export function haversineMiles(a: LatLng, b: LatLng): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function totalLengthMiles(points: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMiles(points[i - 1], points[i]);
  }
  return total;
}

export function bboxAroundMiles(
  lat: number,
  lng: number,
  radiusMiles: number,
): { minLng: number; minLat: number; maxLng: number; maxLat: number } {
  const deg = radiusMiles / 69.0;
  return { minLng: lng - deg, minLat: lat - deg, maxLng: lng + deg, maxLat: lat + deg };
}

/** Perpendicular distance from point `p` to the line segment `a`-`b`, in degrees (planar approx, fine at this scale). */
function perpendicularDistance(p: LatLng, a: LatLng, b: LatLng): number {
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  if (dx === 0 && dy === 0) {
    return Math.hypot(p.lng - a.lng, p.lat - a.lat);
  }
  const t = ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / (dx * dx + dy * dy);
  const clampedT = Math.max(0, Math.min(1, t));
  const projLng = a.lng + clampedT * dx;
  const projLat = a.lat + clampedT * dy;
  return Math.hypot(p.lng - projLng, p.lat - projLat);
}

/** Douglas-Peucker polyline simplification. `epsilon` is in degrees (~0.0003-0.0006 works well for trail-scale data). */
export function douglasPeucker(points: LatLng[], epsilon: number): LatLng[] {
  if (points.length < 3) return points;

  let maxDist = 0;
  let index = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }

  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, index + 1), epsilon);
    const right = douglasPeucker(points.slice(index), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

/** Longest inter-point gap in a polyline, in miles. Used to catch "straight line across a huge gap" bugs. */
export function maxGapMiles(points: LatLng[]): number {
  let max = 0;
  for (let i = 1; i < points.length; i++) {
    max = Math.max(max, haversineMiles(points[i - 1], points[i]));
  }
  return max;
}

/** Normalize a trail/feature name for fuzzy matching (lowercase, strip punctuation/common suffixes). */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(trail|road|route|rd|tr|ohv|svra|area|no\.?|#)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Generic terrain/road descriptor words that are common enough to cause false-positive matches
 * on their own (e.g. "Ballinger Canyon" vs "Salisbury Canyon" sharing only "canyon"). These are
 * still counted in the overlap score, but at least one NON-generic ("distinctive") token must
 * match too, or the whole comparison is treated as unrelated (similarity 0).
 */
const GENERIC_TOKENS = new Set([
  "canyon", "creek", "ridge", "spring", "springs", "peak", "valley", "wash", "flat", "flats",
  "camp", "campground", "park", "forest", "national", "county", "state", "fire", "service",
  "mountain", "mtn", "lake", "river", "fork", "gulch", "draw", "pass", "summit", "meadow",
  "meadows", "basin", "hill", "hills", "loop", "spur", "connector", "cutoff", "upper", "lower",
  "north", "south", "east", "west", "old", "new",
]);

/** Token-overlap similarity between two names, 0-1. Guards against generic-word-only matches. */
export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeName(a).split(" ").filter(Boolean));
  const tb = new Set(normalizeName(b).split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;

  let overlap = 0;
  let distinctiveOverlap = 0;
  for (const t of ta) {
    if (tb.has(t)) {
      overlap++;
      if (!GENERIC_TOKENS.has(t)) distinctiveOverlap++;
    }
  }
  if (distinctiveOverlap === 0) return 0;
  return overlap / Math.max(ta.size, tb.size);
}

/**
 * Greedily chain disjoint line-segment "parts" into one continuous polyline, starting from
 * whichever part has an endpoint nearest `anchor`. Only stitches a part onto the growing chain
 * if the gap between them is <= maxGapMiles, to avoid drawing a false straight line across an
 * unrelated gap. Returns the chain plus any parts that couldn't be attached (leftovers).
 */
export function chainParts(
  parts: LatLng[][],
  anchor: LatLng,
  maxGapMiles = 0.5,
): { chain: LatLng[]; leftovers: LatLng[][] } {
  const remaining = parts.filter((p) => p.length >= 2).map((p) => [...p]);
  if (remaining.length === 0) return { chain: [], leftovers: [] };

  let bestIdx = 0;
  let bestDist = Infinity;
  let bestReversed = false;
  remaining.forEach((p, i) => {
    const dStart = haversineMiles(anchor, p[0]);
    const dEnd = haversineMiles(anchor, p[p.length - 1]);
    if (dStart < bestDist) { bestDist = dStart; bestIdx = i; bestReversed = false; }
    if (dEnd < bestDist) { bestDist = dEnd; bestIdx = i; bestReversed = true; }
  });

  let chain = remaining.splice(bestIdx, 1)[0];
  if (bestReversed) chain = chain.slice().reverse();

  let attached = true;
  while (attached && remaining.length > 0) {
    attached = false;
    const chainEnd = chain[chain.length - 1];
    let idx = -1;
    let reversed = false;
    let minGap = maxGapMiles;
    remaining.forEach((p, i) => {
      const dStart = haversineMiles(chainEnd, p[0]);
      const dEnd = haversineMiles(chainEnd, p[p.length - 1]);
      if (dStart <= minGap) { minGap = dStart; idx = i; reversed = false; }
      if (dEnd <= minGap) { minGap = dEnd; idx = i; reversed = true; }
    });
    if (idx >= 0) {
      const part = remaining.splice(idx, 1)[0];
      chain = chain.concat(reversed ? part.slice().reverse() : part);
      attached = true;
    }
  }

  return { chain, leftovers: remaining };
}
