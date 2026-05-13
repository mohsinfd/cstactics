import type { PlannedAction } from './types';

export const EXECUTE_UTILITY_MS = 0;
export const EXECUTE_SWING_MS = 600;

export interface ExecuteBeat {
  order: number;
  timeMs: number;
  timeLabel: string;
  phaseLabel: string;
}

export function getDefaultExecuteAtMs(kind: PlannedAction['kind']): number {
  if (kind === 'flash' || kind === 'smoke') return EXECUTE_UTILITY_MS;
  return EXECUTE_SWING_MS;
}

export function getPlannedActionExecuteAtMs(action: PlannedAction): number {
  return Number.isFinite(action.executeAtMs)
    ? Math.max(0, action.executeAtMs)
    : getDefaultExecuteAtMs(action.kind);
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
