import type { TileCoord } from './types';
import { MOVEMENT_TIMING_PROFILE } from './movementTimingProfile';

type Point2 = {
  x: number;
  y: number;
};

function distance(a: Point2, b: Point2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function normalize(vector: Point2): Point2 {
  const length = Math.hypot(vector.x, vector.y);
  if (length <= 0.000001) return { x: 0, y: 0 };
  return { x: vector.x / length, y: vector.y / length };
}

function addScaled(point: Point2, vector: Point2, scale: number): Point2 {
  return {
    x: point.x + vector.x * scale,
    y: point.y + vector.y * scale,
  };
}

function lerp(a: Point2, b: Point2, t: number): Point2 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

function pushPoint(points: Point2[], point: Point2, minDistance = 0.001): void {
  const last = points.at(-1);
  if (!last || distance(last, point) > minDistance) points.push(point);
}

function getCumulativeDistances(points: Point2[]): number[] {
  const cumulative = [0];
  for (let i = 1; i < points.length; i += 1) {
    cumulative[i] = cumulative[i - 1] + distance(points[i - 1], points[i]);
  }
  return cumulative;
}

function getSmoothedRoutePoints(points: Point2[]): Point2[] {
  if (points.length < 3) return points.map((point) => ({ ...point }));

  const smoothed: Point2[] = [{ ...points[0] }];
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const current = points[i];
    const next = points[i + 1];
    const incomingRaw = { x: prev.x - current.x, y: prev.y - current.y };
    const outgoingRaw = { x: next.x - current.x, y: next.y - current.y };
    const incomingLength = Math.hypot(incomingRaw.x, incomingRaw.y);
    const outgoingLength = Math.hypot(outgoingRaw.x, outgoingRaw.y);

    if (incomingLength <= 0.0001 || outgoingLength <= 0.0001) {
      pushPoint(smoothed, { ...current });
      continue;
    }

    const incoming = normalize(incomingRaw);
    const outgoing = normalize(outgoingRaw);
    const dot = incoming.x * outgoing.x + incoming.y * outgoing.y;
    const isCorner = Math.abs(dot) < 0.12;
    if (!isCorner) {
      pushPoint(smoothed, { ...current });
      continue;
    }

    const cornerRadius = Math.min(
      MOVEMENT_TIMING_PROFILE.cornerRadiusTiles,
      incomingLength * 0.42,
      outgoingLength * 0.42
    );
    const before = addScaled(current, incoming, cornerRadius);
    const after = addScaled(current, outgoing, cornerRadius);
    pushPoint(smoothed, before);

    for (let sample = 1; sample <= MOVEMENT_TIMING_PROFILE.cornerSamples; sample += 1) {
      const t = sample / (MOVEMENT_TIMING_PROFILE.cornerSamples + 1);
      const a = lerp(before, current, t);
      const b = lerp(current, after, t);
      pushPoint(smoothed, lerp(a, b, t));
    }

    pushPoint(smoothed, after);
  }

  pushPoint(smoothed, { ...points[points.length - 1] });
  return smoothed;
}

function getTrapezoidDuration(
  totalDistance: number,
  maxSpeed: number,
  accel: number,
  decel: number
): number {
  if (totalDistance <= 0 || maxSpeed <= 0 || accel <= 0 || decel <= 0) return 0;

  const accelDistance = (maxSpeed * maxSpeed) / (2 * accel);
  const decelDistance = (maxSpeed * maxSpeed) / (2 * decel);

  if (accelDistance + decelDistance <= totalDistance) {
    const cruiseDistance = totalDistance - accelDistance - decelDistance;
    return maxSpeed / accel + cruiseDistance / maxSpeed + maxSpeed / decel;
  }

  const peakSpeed = Math.sqrt((2 * totalDistance * accel * decel) / (accel + decel));
  return peakSpeed / accel + peakSpeed / decel;
}

function getTimeAtDistance(
  targetDistance: number,
  totalDistance: number,
  maxSpeed: number,
  accel: number,
  decel: number
): number {
  if (targetDistance <= 0 || totalDistance <= 0) return 0;

  const accelDistanceAtMax = (maxSpeed * maxSpeed) / (2 * accel);
  const decelDistanceAtMax = (maxSpeed * maxSpeed) / (2 * decel);
  const hasCruise = accelDistanceAtMax + decelDistanceAtMax <= totalDistance;
  const peakSpeed = hasCruise
    ? maxSpeed
    : Math.sqrt((2 * totalDistance * accel * decel) / (accel + decel));
  const accelDistance = (peakSpeed * peakSpeed) / (2 * accel);
  const decelDistance = (peakSpeed * peakSpeed) / (2 * decel);
  const cruiseDistance = Math.max(0, totalDistance - accelDistance - decelDistance);
  const distanceFromEnd = totalDistance - targetDistance;

  if (targetDistance <= accelDistance) {
    return Math.sqrt((2 * targetDistance) / accel);
  }

  const accelTime = peakSpeed / accel;
  const cruiseTime = hasCruise ? cruiseDistance / peakSpeed : 0;
  if (targetDistance <= accelDistance + cruiseDistance) {
    return accelTime + (targetDistance - accelDistance) / peakSpeed;
  }

  const decelTimeRemaining = Math.sqrt(Math.max(0, (2 * distanceFromEnd) / decel));
  return accelTime + cruiseTime + peakSpeed / decel - decelTimeRemaining;
}

export function getRouteVisualTiming(path: TileCoord[]): {
  durationMs: number;
  arrivalTimesMs: number[];
} {
  if (path.length === 0) {
    return { durationMs: 0, arrivalTimesMs: [] };
  }
  if (path.length === 1) {
    return { durationMs: 0, arrivalTimesMs: [0] };
  }

  const points = path.map((tile) => ({ x: tile.x, y: tile.y }));
  const rawCumulative = getCumulativeDistances(points);
  const rawTotalDistance = rawCumulative.at(-1) ?? 0;
  const smoothedPoints = getSmoothedRoutePoints(points);
  const smoothedTotalDistance = getCumulativeDistances(smoothedPoints).at(-1) ?? rawTotalDistance;
  const profileDurationSeconds = getTrapezoidDuration(
    smoothedTotalDistance,
    MOVEMENT_TIMING_PROFILE.maxSpeedTilesPerSecond,
    MOVEMENT_TIMING_PROFILE.accelTilesPerSecond2,
    MOVEMENT_TIMING_PROFILE.decelTilesPerSecond2
  );
  const durationSeconds = Math.max(MOVEMENT_TIMING_PROFILE.minMoveMs / 1000, profileDurationSeconds);
  const durationScale = profileDurationSeconds > 0 ? durationSeconds / profileDurationSeconds : 1;
  const arrivalTimesMs = rawCumulative.map((rawDistance, index) => {
    if (index === 0) return 0;
    if (index === rawCumulative.length - 1) return Math.round(durationSeconds * 1000);

    const normalizedDistance = rawTotalDistance > 0 ? rawDistance / rawTotalDistance : 1;
    const targetDistance = normalizedDistance * smoothedTotalDistance;
    const profileTimeSeconds = getTimeAtDistance(
      targetDistance,
      smoothedTotalDistance,
      MOVEMENT_TIMING_PROFILE.maxSpeedTilesPerSecond,
      MOVEMENT_TIMING_PROFILE.accelTilesPerSecond2,
      MOVEMENT_TIMING_PROFILE.decelTilesPerSecond2
    );
    return Math.round(profileTimeSeconds * durationScale * 1000);
  });

  return {
    durationMs: Math.round(durationSeconds * 1000),
    arrivalTimesMs,
  };
}
