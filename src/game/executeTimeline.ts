import type { PlannedAction } from './types';

export interface ExecuteBeat {
  order: number;
  timeLabel: string;
  phaseLabel: string;
}

export function getPlannedActionBeat(action: PlannedAction): ExecuteBeat {
  if (action.kind === 'flash') {
    return { order: 0, timeLabel: '0.0s', phaseLabel: 'POP' };
  }

  if (action.kind === 'smoke') {
    return { order: 0, timeLabel: '0.0s', phaseLabel: 'BLOOM' };
  }

  return { order: 1, timeLabel: '0.6s', phaseLabel: 'SWING' };
}

export function sortPlannedActionsByBeat(actions: PlannedAction[]): PlannedAction[] {
  return [...actions].sort((a, b) => {
    const beatA = getPlannedActionBeat(a);
    const beatB = getPlannedActionBeat(b);
    return beatA.order - beatB.order || a.unitId - b.unitId || a.kind.localeCompare(b.kind);
  });
}
