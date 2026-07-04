export interface RidePoint {
  latitude: number;
  longitude: number;
  altitude: number;
  speed: number;
  timestamp: number;
}

export interface RideSegment {
  id: string;
  name: string;
  trailId?: string;
  startIndex: number;
  endIndex: number;
  distanceMiles: number;
  durationSecs: number;
}

// Firestore does not support arrays-of-arrays, so the recorded GPS track is
// stored as a single flat number array (stride 5: lat, lon, alt, speed, ts)
// rather than an array of tuples. See track subcollection doc below.
export const POINT_STRIDE = 5;

export function encodePointsFlat(points: RidePoint[]): number[] {
  const flat: number[] = new Array(points.length * POINT_STRIDE);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const o = i * POINT_STRIDE;
    flat[o] = Math.round(p.latitude * 1e6) / 1e6;
    flat[o + 1] = Math.round(p.longitude * 1e6) / 1e6;
    flat[o + 2] = Math.round(p.altitude * 10) / 10;
    flat[o + 3] = Math.round(p.speed * 100) / 100;
    flat[o + 4] = p.timestamp;
  }
  return flat;
}

export function decodePointsFlat(flat: number[]): RidePoint[] {
  const points: RidePoint[] = [];
  for (let i = 0; i + POINT_STRIDE - 1 < flat.length; i += POINT_STRIDE) {
    points.push({
      latitude: flat[i],
      longitude: flat[i + 1],
      altitude: flat[i + 2],
      speed: flat[i + 3],
      timestamp: flat[i + 4],
    });
  }
  return points;
}

export const RIDE_POINTS_MAX = 1200;

export function downsamplePoints(points: RidePoint[], max: number = RIDE_POINTS_MAX): RidePoint[] {
  if (points.length <= max) return points;
  const result: RidePoint[] = [];
  const step = (points.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    result.push(points[Math.round(i * step)]);
  }
  return result;
}

export function distanceMilesBetween(a: RidePoint, b: RidePoint): number {
  const R = 3958.8;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function segmentDistanceMiles(points: RidePoint[], startIndex: number, endIndex: number): number {
  let total = 0;
  for (let i = startIndex; i < endIndex; i++) {
    if (points[i] && points[i + 1]) total += distanceMilesBetween(points[i], points[i + 1]);
  }
  return total;
}

export function segmentDurationSecs(points: RidePoint[], startIndex: number, endIndex: number): number {
  if (!points[startIndex] || !points[endIndex]) return 0;
  return Math.max(0, Math.round((points[endIndex].timestamp - points[startIndex].timestamp) / 1000));
}

export function formatRideDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function makeSegmentId(): string {
  return `seg_${Date.now()}_${Math.round(Math.random() * 1e6)}`;
}
