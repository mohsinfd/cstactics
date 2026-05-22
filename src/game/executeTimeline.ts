import type {
  CombatEvent,
  ExecuteInterruptBombPressure,
  ExecuteInterruptTimelineItem,
  ExecuteInterruptTradeShot,
  ExecuteTimeline,
  ExecuteTimelineEvent,
  ExecuteTimelineEventKind,
  ExecuteTimelineSource,
  Team,
  TileCoord,
  PlannedAction,
} from './types';

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

const TIMELINE_EVENT_KIND_PRIORITY: Record<ExecuteTimelineEventKind, number> = {
  utility_planned: 0,
  utility_resolved: 0,
  swing_start: 1,
  move_start: 1,
  movement_beat: 2,
  contact: 2,
  reaction_shot: 3,
  shot_result: 4,
  trade_decision: 5,
  bomb_pressure: 5,
};

export function sortExecuteTimelineEvents(events: ExecuteTimelineEvent[]): ExecuteTimelineEvent[] {
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => {
      const timeDiff = a.event.timeMs - b.event.timeMs;
      if (timeDiff !== 0) return timeDiff;

      const priorityDiff =
        TIMELINE_EVENT_KIND_PRIORITY[a.event.kind] - TIMELINE_EVENT_KIND_PRIORITY[b.event.kind];
      if (priorityDiff !== 0) return priorityDiff;

      const idDiff = a.event.id.localeCompare(b.event.id);
      if (idDiff !== 0) return idDiff;

      const titleDiff = a.event.title.localeCompare(b.event.title);
      if (titleDiff !== 0) return titleDiff;

      return a.index - b.index;
    })
    .map(({ event }) => event);
}

function getTimelineEventCompactKind(kind: ExecuteTimelineEventKind): ExecuteInterruptTimelineItem['kind'] {
  if (kind === 'move_start' || kind === 'movement_beat' || kind === 'contact') return 'move';
  if (kind === 'swing_start') return 'swing';
  if (kind === 'reaction_shot') return 'hold';
  if (kind === 'shot_result') return 'shot';
  return 'decision';
}

function getInterruptResultText(event: CombatEvent): string {
  if (!event.hit) return 'miss';
  if (event.killed && event.critical) return `HS kill -${event.damage}`;
  if (event.killed) return `kill -${event.damage}`;
  if (event.critical) return `headshot -${event.damage}`;
  return `hit -${event.damage} HP`;
}

function getBombPressureTimelineText(bombPressure: ExecuteInterruptBombPressure): string | null {
  if (bombPressure.bombPlanted) return `bomb ${bombPressure.bombTimer} turns`;
  if (bombPressure.bombDropped) return 'bomb dropped';
  return null;
}

export function createExecuteTimeline({
  id,
  source,
  activeTeam,
  events = [],
}: {
  id: string;
  source: ExecuteTimelineSource;
  activeTeam: Team;
  events?: ExecuteTimelineEvent[];
}): ExecuteTimeline {
  return {
    id,
    source,
    status: 'running',
    activeTeam,
    startedAt: Date.now(),
    events: sortExecuteTimelineEvents(events),
  };
}

export function createExecuteTimelineEvent({
  id,
  kind,
  timeMs,
  phaseLabel,
  title,
  detail,
  unitId,
  targetUnitId,
  actionId,
  tile,
  combatEventId,
}: Omit<ExecuteTimelineEvent, 'id' | 'timeLabel'> & { id?: string }): ExecuteTimelineEvent {
  return {
    id: id ?? `${kind}:${timeMs}:${title}:${detail}`,
    kind,
    timeMs,
    timeLabel: formatExecuteTime(timeMs),
    phaseLabel,
    title,
    detail,
    unitId,
    targetUnitId,
    actionId,
    tile: tile ? { ...tile } : undefined,
    combatEventId,
  };
}

export function createPlannedUtilityTimelineEvent(
  action: PlannedAction,
  unitName: string,
  targetLabel: string
): ExecuteTimelineEvent | null {
  if (action.kind !== 'smoke' && action.kind !== 'flash') return null;

  const beat = getPlannedActionBeat(action);
  const utilityName = action.kind === 'smoke' ? 'smoke' : 'flash';
  return createExecuteTimelineEvent({
    id: `${action.id}:utility-planned`,
    kind: 'utility_planned',
    timeMs: beat.timeMs,
    phaseLabel: 'PLAN',
    title: `${unitName} ${utilityName}`,
    detail: `${beat.phaseLabel.toLowerCase()} at ${targetLabel}`,
    unitId: action.unitId,
    actionId: action.id,
    tile: action.target,
  });
}

export function createUtilityResolvedTimelineEvent(
  action: PlannedAction,
  unitName: string,
  targetLabel: string,
  affectedCount = 0
): ExecuteTimelineEvent | null {
  if (action.kind !== 'smoke' && action.kind !== 'flash') return null;

  const beat = getPlannedActionBeat(action);
  const utilityName = action.kind === 'smoke' ? 'smoke' : 'flash';
  const detail = action.kind === 'flash'
    ? `${targetLabel}; ${affectedCount} caught`
    : targetLabel;

  return createExecuteTimelineEvent({
    id: `${action.id}:utility-resolved`,
    kind: 'utility_resolved',
    timeMs: beat.timeMs,
    phaseLabel: beat.phaseLabel,
    title: `${unitName} ${utilityName}`,
    detail,
    unitId: action.unitId,
    actionId: action.id,
    tile: action.target,
  });
}

export function createMoveStartTimelineEvent(
  action: PlannedAction,
  unitName: string,
  source: ExecuteTimelineSource
): ExecuteTimelineEvent {
  const beat = getPlannedActionBeat(action);
  const isPlannedExecute = source === 'planned_execute';
  return createExecuteTimelineEvent({
    id: `${action.id}:move-start`,
    kind: isPlannedExecute ? 'swing_start' : 'move_start',
    timeMs: beat.timeMs,
    phaseLabel: isPlannedExecute ? beat.phaseLabel : 'MOVE',
    title: isPlannedExecute ? `${unitName} swing start` : `${unitName} move start`,
    detail: `toward ${action.target.x},${action.target.y}`,
    unitId: action.unitId,
    actionId: action.id,
    tile: action.from,
  });
}

export function createMovementBeatTimelineEvent(
  action: PlannedAction,
  unitName: string,
  timeMs: number,
  tile: TileCoord,
  tileLabel: string
): ExecuteTimelineEvent {
  return createExecuteTimelineEvent({
    id: `${action.id}:move:${timeMs}:${tile.x},${tile.y}`,
    kind: 'movement_beat',
    timeMs,
    phaseLabel: 'MOVE',
    title: `${unitName} crossed`,
    detail: tileLabel,
    unitId: action.unitId,
    actionId: action.id,
    tile,
  });
}

export function buildContactBreakTimelineEvents({
  event,
  source,
  beatTimeMs,
  phaseLabel,
  contactTile,
  tileLabel,
  tradeShot,
  bombPressure,
  precedingEvents = [],
}: {
  event: CombatEvent;
  source: ExecuteTimelineSource;
  beatTimeMs: number;
  phaseLabel: string;
  contactTile: TileCoord;
  tileLabel: string;
  tradeShot: ExecuteInterruptTradeShot | null;
  bombPressure: ExecuteInterruptBombPressure;
  precedingEvents?: ExecuteTimelineEvent[];
}): ExecuteTimelineEvent[] {
  const moveKind = source === 'planned_execute' ? 'swing_start' : 'move_start';
  const moveTitle = moveKind === 'swing_start' ? `${event.targetName} swing start` : `${event.targetName} move start`;
  const resultText = getInterruptResultText(event);
  const tradeText = tradeShot
    ? `trade ${tradeShot.shooterName} ${tradeShot.hitChance}%/${tradeShot.damage}`
    : 'no clean trade';
  const bombText = getBombPressureTimelineText(bombPressure);

  const compactPreceding = precedingEvents.filter((timelineEvent) => (
    timelineEvent.kind === 'utility_resolved' ||
    timelineEvent.kind === 'move_start' ||
    timelineEvent.kind === 'swing_start'
  ));
  const hasMoveStart = compactPreceding.some((timelineEvent) => (
    timelineEvent.kind === 'move_start' || timelineEvent.kind === 'swing_start'
  ));

  const contactEvents = [
    ...(hasMoveStart ? [] : [
      createExecuteTimelineEvent({
        id: `${event.id}:move-start`,
        kind: moveKind,
        timeMs: beatTimeMs,
        phaseLabel,
        title: moveTitle,
        detail: `toward ${tileLabel}`,
        unitId: event.targetId,
        tile: contactTile,
      }),
    ]),
    createExecuteTimelineEvent({
      id: `${event.id}:contact`,
      kind: 'contact',
      timeMs: beatTimeMs,
      phaseLabel: 'CONTACT',
      title: `${event.targetName} crossed`,
      detail: tileLabel,
      unitId: event.targetId,
      tile: contactTile,
      combatEventId: event.id,
    }),
    createExecuteTimelineEvent({
      id: `${event.id}:reaction-shot`,
      kind: 'reaction_shot',
      timeMs: beatTimeMs,
      phaseLabel: 'HOLD',
      title: `${event.attackerName} held lane`,
      detail: `${event.weaponName} ready`,
      unitId: event.attackerId,
      targetUnitId: event.targetId,
      tile: contactTile,
      combatEventId: event.id,
    }),
    createExecuteTimelineEvent({
      id: `${event.id}:shot-result`,
      kind: 'shot_result',
      timeMs: beatTimeMs,
      phaseLabel: 'SHOT',
      title: `${event.weaponName} reaction`,
      detail: `${event.hitChance}% ${resultText}`,
      unitId: event.attackerId,
      targetUnitId: event.targetId,
      tile: contactTile,
      combatEventId: event.id,
    }),
    createExecuteTimelineEvent({
      id: `${event.id}:trade-decision`,
      kind: 'trade_decision',
      timeMs: beatTimeMs,
      phaseLabel: 'CALL',
      title: tradeShot ? 'trade available' : 'hold decision',
      detail: bombText ? `${tradeText}; ${bombText}` : tradeText,
      unitId: tradeShot?.shooterId,
      targetUnitId: event.attackerId,
      combatEventId: event.id,
    }),
  ];

  if (bombText) {
    contactEvents.push(createExecuteTimelineEvent({
      id: `${event.id}:bomb-pressure`,
      kind: 'bomb_pressure',
      timeMs: beatTimeMs,
      phaseLabel: 'BOMB',
      title: 'bomb pressure',
      detail: bombText,
      tile: bombPressure.bombPosition ?? undefined,
      combatEventId: event.id,
    }));
  }

  return sortExecuteTimelineEvents([...compactPreceding, ...contactEvents]);
}

export function buildContactBreakTimelineItems(events: ExecuteTimelineEvent[]): ExecuteInterruptTimelineItem[] {
  return sortExecuteTimelineEvents(events).map((event) => ({
    id: event.id,
    kind: getTimelineEventCompactKind(event.kind),
    timeLabel: event.timeLabel,
    phaseLabel: event.phaseLabel,
    title: event.title,
    detail: event.detail,
  }));
}
