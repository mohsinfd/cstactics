export interface MovementTimingConfig {
  tileSeconds: number;
  minSegmentSeconds: number;
  maxSegmentSeconds: number;
  cadenceOverlap: number;
  settleSeconds: number;
}

export const DEFAULT_MOVEMENT_TIMING: MovementTimingConfig = {
  tileSeconds: 0.095,
  minSegmentSeconds: 0.07,
  maxSegmentSeconds: 0.13,
  cadenceOverlap: 0.92,
  settleSeconds: 0.16,
};

export const TACTICAL_MOVEMENT_TICK_MS = 95;
export const STRIDE_LINEARITY = 0.34;

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function easeInOutCubic(value: number): number {
  const t = clamp01(value);
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeOutCubic(value: number): number {
  const t = clamp01(value);
  return 1 - Math.pow(1 - t, 3);
}

export function easeInOutStride(value: number): number {
  const t = clamp01(value);
  return t * STRIDE_LINEARITY + easeInOutCubic(t) * (1 - STRIDE_LINEARITY);
}

export function getDampedAlpha(lambda: number, deltaSeconds: number): number {
  if (!Number.isFinite(lambda) || !Number.isFinite(deltaSeconds)) return 0;
  return clamp01(1 - Math.exp(-Math.max(0, lambda) * Math.max(0, deltaSeconds)));
}

export function getMovementSegmentDurationSeconds(
  tileDistance: number,
  cadenceMs = TACTICAL_MOVEMENT_TICK_MS,
  config: MovementTimingConfig = DEFAULT_MOVEMENT_TIMING
): number {
  const distance = Number.isFinite(tileDistance) ? Math.max(0, tileDistance) : 0;
  const cadenceSeconds = Number.isFinite(cadenceMs) ? Math.max(0, cadenceMs) / 1000 : 0;
  const readableDuration = Math.max(
    distance * config.tileSeconds,
    cadenceSeconds * config.cadenceOverlap
  );

  return Math.min(
    config.maxSegmentSeconds,
    Math.max(config.minSegmentSeconds, readableDuration)
  );
}

export function getSegmentProgress(
  elapsedSeconds: number,
  durationSeconds: number,
  easing: (value: number) => number = easeInOutStride
): number {
  if (!Number.isFinite(elapsedSeconds) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return 1;
  }

  return easing(elapsedSeconds / durationSeconds);
}
