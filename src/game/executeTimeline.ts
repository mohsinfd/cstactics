import type { PlannedAction } from './types';

export const EXECUTE_UTILITY_MS = 0;
export const EXECUTE_SWING_MS = 600;
export const EXECUTE_TIMING_STEP_MS = 100;
export const EXECUTE_UTILITY_MAX_MS = 500;
export const EXECUTE_SWING_MIN_MS = 400;
export const EXECUTE_SWING_MAX_MS = 1200;

export interface ExecuteBeat {
  order: number;
  timeMs: number;
  timeLabel: string;
  phaseLabel: string;
}

export interface ExecuteTimingBounds {
  minMs: number;
  maxMs: number;
  stepMs: number;
}

export function getExecuteTimingBounds(kind: PlannedAction['kind']): ExecuteTimingBounds {
  if (kind === 'flash' || kind === 'smoke') {
    return {
      minMs: EXECUTE_UTILITY_MS,
      maxMs: EXECUTE_UTILITY_MAX_MS,
      stepMs: EXECUTE_TIMING_STEP_MS,
    };
  }

  return {
    minMs: EXECUTE_SWING_MIN_MS,
    maxMs: EXECUTE_SWING_MAX_MS,
    stepMs: EXECUTE_TIMING_STEP_MS,
  };
}

export function clampExecuteAtMs(kind: PlannedAction['kind'], ms: number): number {
  const bounds = getExecuteTimingBounds(kind);
  const safeMs = Number.isFinite(ms) ? ms : getDefaultExecuteAtMs(kind);
  const snappedMs = Math.round(safeMs / bounds.stepMs) * bounds.stepMs;
  return Math.min(bounds.maxMs, Math.max(bounds.minMs, snappedMs));
}

export function getDefaultExecuteAtMs(kind: PlannedAction['kind']): number {
  if (kind === 'flash' || kind === 'smoke') return EXECUTE_UTILITY_MS;
  return EXECUTE_SWING_MS;
}

export function getPlannedActionExecuteAtMs(action: PlannedAction): number {
  return clampExecuteAtMs(action.kind, action.executeAtMs);
}

export function formatExecuteTime(ms: number): string {
  const safeMs = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  return `${(safeMs / 1000).toFixed(1)}s`;
}

export function getPlannedActionBeat(action: PlannedAction): ExecuteBeat {
  const timeMs = getPlannedActionExecuteAtMs(action);

  if (action.kind === 'flash') {
    return { order: timeMs, timeMs, timeLabel: formatExecuteTime(timeMs), phaseLabel: 'POP' };
  }

  if (action.kind === 'smoke') {
    return { order: timeMs, timeMs, timeLabel: formatExecuteTime(timeMs), phaseLabel: 'BLOOM' };
  }

  return { order: timeMs, timeMs, timeLabel: formatExecuteTime(timeMs), phaseLabel: 'SWING' };
}

export function sortPlannedActionsByBeat(actions: PlannedAction[]): PlannedAction[] {
  return [...actions].sort((a, b) => {
    const beatA = getPlannedActionBeat(a);
    const beatB = getPlannedActionBeat(b);
    return beatA.order - beatB.order || a.unitId - b.unitId || a.kind.localeCompare(b.kind);
  });
}
