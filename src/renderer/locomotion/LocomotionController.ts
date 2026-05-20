import * as THREE from 'three';

export type LocomotionPose =
  | 'idle'
  | 'run_forward'
  | 'diagonal_left'
  | 'diagonal_right'
  | 'strafe_left'
  | 'strafe_right'
  | 'backpedal'
  | 'stop_brace';

export interface MovementClip {
  id: string;
  unitId: number;
  points: THREE.Vector3[];
  cumulativeWorld: number[];
  totalWorldDistance: number;
  totalTileDistance: number;
  elapsedSeconds: number;
  durationSeconds: number;
  profileDurationSeconds: number;
  maxSpeedTilesPerSecond: number;
  accelTilesPerSecond2: number;
  decelTilesPerSecond2: number;
  endpoint: THREE.Vector3;
}

export interface MovementClipSample {
  position: THREE.Vector3;
  moveDirection: THREE.Vector3;
  distanceTiles: number;
  speedTilesPerSecond: number;
  progress: number;
  endpointErrorTiles: number;
  phase: 'move' | 'stop' | 'done';
}

export const ROUTE_LOCOMOTION = {
  maxSpeedTilesPerSecond: 5.6,
  accelTilesPerSecond2: 28,
  decelTilesPerSecond2: 42,
  lookaheadTiles: 0.78,
  stopDistanceTiles: 0.82,
  endpointSnapTiles: 0.03,
  minMoveSeconds: 0.22,
  cornerRadiusTiles: 0.32,
  cornerSamples: 5,
} as const;

const ZERO_DIR = new THREE.Vector3(0, 0, 1);

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function getCumulativeWorldDistances(points: THREE.Vector3[]): number[] {
  const cumulative = [0];
  for (let i = 1; i < points.length; i += 1) {
    cumulative[i] = cumulative[i - 1] + points[i - 1].distanceTo(points[i]);
  }
  return cumulative;
}

function pushPoint(points: THREE.Vector3[], point: THREE.Vector3, minDistance = 0.001): void {
  const last = points.at(-1);
  if (!last || last.distanceTo(point) > minDistance) points.push(point);
}

function getSmoothedRoutePoints(points: THREE.Vector3[], tileSize: number): THREE.Vector3[] {
  if (points.length < 3 || tileSize <= 0) return points.map((point) => point.clone());

  const radius = ROUTE_LOCOMOTION.cornerRadiusTiles * tileSize;
  const smoothed: THREE.Vector3[] = [points[0].clone()];

  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const current = points[i];
    const next = points[i + 1];
    const incoming = prev.clone().sub(current);
    const outgoing = next.clone().sub(current);
    const incomingLength = incoming.length();
    const outgoingLength = outgoing.length();

    if (incomingLength <= 0.0001 || outgoingLength <= 0.0001) {
      pushPoint(smoothed, current.clone());
      continue;
    }

    incoming.normalize();
    outgoing.normalize();
    const isCorner = Math.abs(incoming.dot(outgoing)) < 0.12;
    if (!isCorner) {
      pushPoint(smoothed, current.clone());
      continue;
    }

    const cornerRadius = Math.min(radius, incomingLength * 0.42, outgoingLength * 0.42);
    const before = current.clone().addScaledVector(incoming, cornerRadius);
    const after = current.clone().addScaledVector(outgoing, cornerRadius);
    pushPoint(smoothed, before);

    for (let sample = 1; sample <= ROUTE_LOCOMOTION.cornerSamples; sample += 1) {
      const t = sample / (ROUTE_LOCOMOTION.cornerSamples + 1);
      const a = before.clone().lerp(current, t);
      const b = current.clone().lerp(after, t);
      pushPoint(smoothed, a.lerp(b, t));
    }

    pushPoint(smoothed, after);
  }

  pushPoint(smoothed, points[points.length - 1].clone());
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

function getDistanceAndSpeedAtTime(
  elapsedSeconds: number,
  totalDistance: number,
  maxSpeed: number,
  accel: number,
  decel: number
): { distance: number; speed: number } {
  if (totalDistance <= 0) return { distance: 0, speed: 0 };

  const accelDistance = (maxSpeed * maxSpeed) / (2 * accel);
  const decelDistance = (maxSpeed * maxSpeed) / (2 * decel);
  const hasCruise = accelDistance + decelDistance <= totalDistance;

  const peakSpeed = hasCruise
    ? maxSpeed
    : Math.sqrt((2 * totalDistance * accel * decel) / (accel + decel));
  const accelTime = peakSpeed / accel;
  const decelTime = peakSpeed / decel;
  const cruiseDistance = Math.max(0, totalDistance - (peakSpeed * peakSpeed) / (2 * accel) - (peakSpeed * peakSpeed) / (2 * decel));
  const cruiseTime = hasCruise ? cruiseDistance / peakSpeed : 0;
  const totalTime = accelTime + cruiseTime + decelTime;
  const t = Math.min(Math.max(0, elapsedSeconds), totalTime);

  if (t <= accelTime) {
    return {
      distance: 0.5 * accel * t * t,
      speed: accel * t,
    };
  }

  if (t <= accelTime + cruiseTime) {
    const cruiseElapsed = t - accelTime;
    return {
      distance: (peakSpeed * peakSpeed) / (2 * accel) + peakSpeed * cruiseElapsed,
      speed: peakSpeed,
    };
  }

  const decelElapsed = t - accelTime - cruiseTime;
  const decelStartDistance = (peakSpeed * peakSpeed) / (2 * accel) + cruiseDistance;
  const distance = decelStartDistance + peakSpeed * decelElapsed - 0.5 * decel * decelElapsed * decelElapsed;

  return {
    distance: Math.min(totalDistance, distance),
    speed: Math.max(0, peakSpeed - decel * decelElapsed),
  };
}

export function createMovementClip({
  id,
  unitId,
  points,
  tileSize,
  maxSpeedTilesPerSecond = ROUTE_LOCOMOTION.maxSpeedTilesPerSecond,
  accelTilesPerSecond2 = ROUTE_LOCOMOTION.accelTilesPerSecond2,
  decelTilesPerSecond2 = ROUTE_LOCOMOTION.decelTilesPerSecond2,
  durationSeconds: requestedDurationSeconds,
}: {
  id: string;
  unitId: number;
  points: THREE.Vector3[];
  tileSize: number;
  maxSpeedTilesPerSecond?: number;
  accelTilesPerSecond2?: number;
  decelTilesPerSecond2?: number;
  durationSeconds?: number;
}): MovementClip {
  const smoothedPoints = getSmoothedRoutePoints(points, tileSize);
  const cumulativeWorld = getCumulativeWorldDistances(smoothedPoints);
  const totalWorldDistance = cumulativeWorld.at(-1) ?? 0;
  const totalTileDistance = tileSize > 0 ? totalWorldDistance / tileSize : totalWorldDistance;
  const profileDurationSeconds = Math.max(
    ROUTE_LOCOMOTION.minMoveSeconds,
    getTrapezoidDuration(totalTileDistance, maxSpeedTilesPerSecond, accelTilesPerSecond2, decelTilesPerSecond2)
  );
  const syncedDurationSeconds = requestedDurationSeconds && Number.isFinite(requestedDurationSeconds)
    ? Math.max(ROUTE_LOCOMOTION.minMoveSeconds, requestedDurationSeconds)
    : profileDurationSeconds;

  return {
    id,
    unitId,
    points: smoothedPoints,
    cumulativeWorld,
    totalWorldDistance,
    totalTileDistance,
    elapsedSeconds: 0,
    durationSeconds: syncedDurationSeconds,
    profileDurationSeconds,
    maxSpeedTilesPerSecond,
    accelTilesPerSecond2,
    decelTilesPerSecond2,
    endpoint: points.at(-1)?.clone() ?? new THREE.Vector3(),
  };
}

export function sampleRouteAtWorldDistance(
  points: THREE.Vector3[],
  cumulativeWorld: number[],
  distanceWorld: number
): { position: THREE.Vector3; segmentIndex: number; segmentT: number } {
  if (points.length === 0) {
    return { position: new THREE.Vector3(), segmentIndex: 0, segmentT: 0 };
  }
  if (points.length === 1) {
    return { position: points[0].clone(), segmentIndex: 0, segmentT: 1 };
  }

  const total = cumulativeWorld.at(-1) ?? 0;
  const d = THREE.MathUtils.clamp(distanceWorld, 0, total);
  let i = 0;
  while (i < cumulativeWorld.length - 1 && cumulativeWorld[i + 1] < d) i += 1;

  const a = points[i];
  const b = points[i + 1] ?? a;
  const segmentStart = cumulativeWorld[i] ?? 0;
  const segmentLength = Math.max(0.0001, (cumulativeWorld[i + 1] ?? segmentStart) - segmentStart);
  const t = (d - segmentStart) / segmentLength;

  return {
    position: a.clone().lerp(b, t),
    segmentIndex: i,
    segmentT: t,
  };
}

export function advanceMovementClip(
  clip: MovementClip,
  deltaSeconds: number,
  tileSize: number
): MovementClipSample {
  clip.elapsedSeconds += Math.max(0, deltaSeconds);

  const durationScale = clip.profileDurationSeconds > 0
    ? Math.max(0.001, clip.durationSeconds / clip.profileDurationSeconds)
    : 1;
  const { distance, speed } = getDistanceAndSpeedAtTime(
    clip.elapsedSeconds / durationScale,
    clip.totalTileDistance,
    clip.maxSpeedTilesPerSecond,
    clip.accelTilesPerSecond2,
    clip.decelTilesPerSecond2
  );
  const distanceWorld = distance * tileSize;
  const sample = sampleRouteAtWorldDistance(clip.points, clip.cumulativeWorld, distanceWorld);
  const lookahead = sampleRouteAtWorldDistance(
    clip.points,
    clip.cumulativeWorld,
    distanceWorld + ROUTE_LOCOMOTION.lookaheadTiles * tileSize
  );
  const moveDirection = lookahead.position.clone().sub(sample.position);
  if (moveDirection.lengthSq() > 0.000001) {
    moveDirection.normalize();
  } else {
    moveDirection.copy(ZERO_DIR);
  }

  const endpointErrorTiles = tileSize > 0
    ? sample.position.distanceTo(clip.endpoint) / tileSize
    : sample.position.distanceTo(clip.endpoint);
  const progress = clip.totalTileDistance > 0 ? clamp01(distance / clip.totalTileDistance) : 1;
  const isDone = clip.elapsedSeconds >= clip.durationSeconds ||
    progress >= 0.999 ||
    endpointErrorTiles <= ROUTE_LOCOMOTION.endpointSnapTiles;
  const position = isDone ? clip.endpoint.clone() : sample.position;

  return {
    position,
    moveDirection,
    distanceTiles: Math.min(distance, clip.totalTileDistance),
    speedTilesPerSecond: speed / durationScale,
    progress: isDone ? 1 : progress,
    endpointErrorTiles: isDone ? 0 : endpointErrorTiles,
    phase: isDone ? 'done' : endpointErrorTiles <= ROUTE_LOCOMOTION.stopDistanceTiles ? 'stop' : 'move',
  };
}

function signedAngleXZ(from: THREE.Vector3, to: THREE.Vector3): number {
  const a = new THREE.Vector2(from.x, from.z);
  const b = new THREE.Vector2(to.x, to.z);
  if (a.lengthSq() <= 0.000001 || b.lengthSq() <= 0.000001) return 0;
  a.normalize();
  b.normalize();
  return Math.atan2(a.x * b.y - a.y * b.x, a.dot(b));
}

export function classifyLocomotionPose(
  moveDir: THREE.Vector3,
  aimDir: THREE.Vector3,
  phase: MovementClipSample['phase'],
  speedTilesPerSecond: number
): LocomotionPose {
  if (phase === 'done' || speedTilesPerSecond < 0.18) return 'idle';
  if (phase === 'stop' && speedTilesPerSecond < ROUTE_LOCOMOTION.maxSpeedTilesPerSecond * 0.55) {
    return 'stop_brace';
  }

  const signed = THREE.MathUtils.radToDeg(signedAngleXZ(aimDir, moveDir));
  const abs = Math.abs(signed);

  if (abs < 28) return 'run_forward';
  if (abs < 70) return signed > 0 ? 'diagonal_right' : 'diagonal_left';
  if (abs < 135) return signed > 0 ? 'strafe_right' : 'strafe_left';
  return 'backpedal';
}
