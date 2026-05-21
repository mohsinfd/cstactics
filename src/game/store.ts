// ============================================================
// Zustand Game Store — single source of truth for CS2 Tactics.
//
// Current command layer:
//   - Each unit has 2 AP per turn
//   - 1 AP = move up to (mobility / 2) tiles
//   - Setup phase (turns 1-2): sprint bonus +6 tiles per AP
//   - Moving deducts AP based on distance moved
//   - Planning mode can queue move orders before resolving them together
//   - Planned moves resolve in short synchronized ticks and freeze on contact
//   - LOS, shooting, held angles, and reaction fire are implemented as the
//     first contact vertical slice
//   - "End Turn" advances to next team / next turn
//
// Missing: generic action pipeline, production AI, and economy.
// ============================================================
import { create } from 'zustand';
import type {
  GameState,
  Unit,
  TileCoord,
  Team,
  RoleId,
  MovementTile,
  RoundState,
  PlannedAction,
  HeldAngle,
  InputMode,
  CombatEvent,
  ExecuteInterrupt,
  ExecuteTimeline,
  ExecuteTimelineEvent,
  ExecuteInterruptTradeShot,
  FeedbackEvent,
  FeedbackEventType,
  GuidanceEvent,
  GuidanceTone,
  MovementPresentationRoute,
  MovementPresentationSource,
  SmokeCloud,
  FlashBurst,
} from './types';
import { createInfernoMap } from './maps/inferno';
import { ROLES, T_ROSTER, CT_ROSTER } from './config/roles';
import { getDefaultWeaponForRole, getWeaponShotApCost } from './config/weapons';
import { RULES } from './config/rules';
import { applyMetaDefault, applyRandomSpawnPositions } from './metaDefaults';
import { getRouteVisualTiming } from './movementPresentationTiming';
import { findPath, getMovementTiles } from './pathfinding';
import { getWatchedLane, hasLineOfSight } from './los';
import { getCrossingHeldAngles, getFirstCrossingTile } from './threats';
import { getShotPreview, resolveReactionFire, resolveShot, tileDistance } from './combat';
import {
  clampExecuteAtMs,
  buildContactBreakTimelineEvents,
  buildContactBreakTimelineItems,
  createExecuteTimeline,
  createExecuteTimelineEvent,
  createMoveStartTimelineEvent,
  createMovementBeatTimelineEvent,
  createPlannedUtilityTimelineEvent,
  createUtilityResolvedTimelineEvent,
  formatExecuteTime,
  getDefaultExecuteAtMs,
  getPlannedActionBeat,
  getPlannedActionExecuteAtMs,
  sortExecuteTimelineEvents,
  sortPlannedActionsByBeat,
} from './executeTimeline';

const EXECUTION_STEP_MS = 95;
const AI_EXECUTION_STEP_MS = 55;
const AI_THINK_MS = 180;
const SMOKE_THROW_RANGE = 12;
const SMOKE_RADIUS = 2;
const SMOKE_DURATION_TURNS = 4;
const FLASH_THROW_RANGE = 12;
const FLASH_RADIUS = 5;
const FLASH_DURATION_TURNS = 1;
const FLASH_BURST_LOG_LIMIT = 8;
const FEEDBACK_LOG_LIMIT = 16;

let feedbackSequence = 0;
let guidanceSequence = 0;
let movementRouteSequence = 0;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function appendFeedback(
  events: FeedbackEvent[],
  type: FeedbackEventType,
  details: Omit<FeedbackEvent, 'id' | 'createdAt' | 'type'> = {}
): FeedbackEvent[] {
  feedbackSequence += 1;
  const createdAt = Date.now() + feedbackSequence / 1000;
  return [
    {
      id: `${createdAt}:${feedbackSequence}:${type}`,
      createdAt,
      type,
      ...details,
    },
    ...events,
  ].slice(0, FEEDBACK_LOG_LIMIT);
}

function createGuidanceEvent(title: string, detail: string, tone: GuidanceTone): GuidanceEvent {
  guidanceSequence += 1;
  const createdAt = Date.now();
  return {
    id: `${createdAt}:${guidanceSequence}:guidance`,
    createdAt,
    tone,
    title,
    detail,
  };
}

function createMovementPresentationRoute(
  unitId: number,
  path: TileCoord[],
  source: MovementPresentationSource,
  delayMs = 0,
  options: {
    stepMs?: number;
    timingPath?: TileCoord[];
    syncToVisualTiming?: boolean;
  } = {}
): MovementPresentationRoute {
  movementRouteSequence += 1;
  const createdAt = Date.now();
  const routeTiming = options.timingPath ? getRouteVisualTiming(options.timingPath) : null;
  const normalizedStepMs = path.length > 0
    ? Math.max(1, options.stepMs ?? EXECUTION_STEP_MS)
    : (options.stepMs ?? EXECUTION_STEP_MS);
  const durationMs = options.syncToVisualTiming && routeTiming
    ? routeTiming.durationMs
    : Math.max(normalizedStepMs, path.length * normalizedStepMs);
  return {
    id: `${createdAt}:${movementRouteSequence}:${source}:${unitId}`,
    unitId,
    source,
    createdAt,
    delayMs: Math.max(0, delayMs),
    stepMs: normalizedStepMs,
    durationMs,
    path: path.map((tile) => ({ ...tile })),
  };
}

function appendBombTickFeedback(events: FeedbackEvent[], previousRound: RoundState, nextRound: RoundState): FeedbackEvent[] {
  if (
    previousRound.bombPlanted &&
    !previousRound.bombDefused &&
    nextRound.bombPlanted &&
    nextRound.bombTimer < previousRound.bombTimer
  ) {
    return appendFeedback(events, 'bomb_tick', {
      team: nextRound.activeTeam,
      intensity: nextRound.bombTimer <= 2 ? 1.25 : nextRound.bombTimer <= 4 ? 1.05 : 0.85,
    });
  }

  return events;
}

function getBestTradeShot(
  map: GameState['map'],
  units: Unit[],
  round: RoundState,
  smokes: SmokeCloud[],
  event: CombatEvent
): ExecuteInterruptTradeShot | null {
  const target = units.find((unit) => unit.id === event.attackerId);
  if (!target?.alive) return null;
  if (round.phase === 'setup' && !RULES.setupFiringAllowed) return null;

  const options = units
    .filter((unit) => (
      unit.alive &&
      unit.team === round.activeTeam &&
      unit.id !== target.id &&
      unit.ap >= getWeaponShotApCost(unit.weapon) &&
      unit.ammoInClip > 0
    ))
    .map((shooter) => ({
      shooter,
      preview: getShotPreview(map, shooter, target, 0, target.position, smokes),
    }))
    .filter(({ preview }) => preview.hasLineOfSight && preview.inRange)
    .sort((a, b) => {
      const stoppedUnitBonusA = a.shooter.id === event.targetId ? 1000 : 0;
      const stoppedUnitBonusB = b.shooter.id === event.targetId ? 1000 : 0;
      return (
        stoppedUnitBonusB + b.preview.hitChance + b.preview.damage * 0.1 -
        (stoppedUnitBonusA + a.preview.hitChance + a.preview.damage * 0.1)
      );
    });

  const best = options[0];
  if (!best) return null;

  return {
    shooterId: best.shooter.id,
    shooterName: best.shooter.name,
    targetId: target.id,
    targetName: target.name,
    hitChance: best.preview.hitChance,
    damage: best.preview.damage,
    critChance: best.preview.critChance,
    critDamage: best.preview.critDamage,
    coverLabel: best.preview.coverLabel,
    coverState: best.preview.coverState,
    coverQuality: best.preview.coverQuality,
  };
}

function createExecuteInterrupt({
  event,
  map,
  units,
  round,
  smokes,
  source,
  beatTimeMs,
  phaseLabel,
  timelineEvents,
}: {
  event: CombatEvent;
  map: GameState['map'];
  units: Unit[];
  round: RoundState;
  smokes: SmokeCloud[];
  source: ExecuteInterrupt['source'];
  beatTimeMs: number;
  phaseLabel: string;
  timelineEvents: ExecuteTimelineEvent[];
}): ExecuteInterrupt {
  const beatLabel = formatExecuteTime(beatTimeMs);
  const contactTile = { ...event.tile };
  const tileLabel = map.grid[contactTile.y]?.[contactTile.x]?.label ?? `tile ${contactTile.x},${contactTile.y}`;
  const tradeShot = getBestTradeShot(map, units, round, smokes, event);
  const bombPressure = {
    bombPlanted: round.bombPlanted,
    bombDropped: !round.bombPlanted && round.bombCarrierId === null && Boolean(round.bombPosition),
    bombTimer: round.bombTimer,
    bombPosition: round.bombPosition ? { ...round.bombPosition } : null,
    bombCarrierId: round.bombCarrierId,
  };
  const interruptTimelineEvents = buildContactBreakTimelineEvents({
    event,
    source,
    beatTimeMs,
    phaseLabel,
    contactTile,
    tileLabel,
    tradeShot,
    bombPressure,
    precedingEvents: timelineEvents,
  });

  return {
    id: `${event.id}:interrupt`,
    createdAt: Date.now(),
    source,
    beatTimeMs,
    beatLabel,
    phaseLabel,
    contactTile,
    event,
    shooterId: event.attackerId,
    stoppedUnitId: event.targetId,
    timelineEvents: interruptTimelineEvents,
    timeline: buildContactBreakTimelineItems(interruptTimelineEvents),
    tradeShot,
    bombPressure,
  };
}

// Movement range per AP point
function getMoveRangePerAP(unit: Unit, isSetupPhase: boolean): number {
  const base = Math.floor(unit.role.mobility / 2);
  const sprint = isSetupPhase ? Math.floor(RULES.setupSprintBonus / 2) : 0;
  return base + sprint;
}

function getMovementState(unit: Unit, map: GameState['map'], isSetupPhase: boolean): {
  movementTiles: MovementTile[];
  walkableTiles: TileCoord[];
} {
  const rangePerAp = getMoveRangePerAP(unit, isSetupPhase);
  const movementTiles = getMovementTiles(map, unit.position, rangePerAp, unit.ap);
  return {
    movementTiles,
    walkableTiles: movementTiles.map(({ x, y }) => ({ x, y })),
  };
}

function getNextAvailableUnitId(units: Unit[], activeTeam: Team, currentUnitId: number): number | null {
  const teamUnits = units.filter((u) => u.team === activeTeam && u.alive);
  if (teamUnits.length === 0) return null;

  const currentIndex = Math.max(0, teamUnits.findIndex((u) => u.id === currentUnitId));
  for (let offset = 1; offset <= teamUnits.length; offset++) {
    const candidate = teamUnits[(currentIndex + offset) % teamUnits.length];
    if (candidate.ap > 0) return candidate.id;
  }

  return null;
}

function getFirstAvailableUnitId(units: Unit[], activeTeam: Team): number | null {
  return units.find((u) => u.team === activeTeam && u.alive && u.ap > 0)?.id ?? null;
}

function getNextUnplannedUnitId(
  units: Unit[],
  activeTeam: Team,
  currentUnitId: number,
  plannedActions: PlannedAction[]
): number | null {
  const plannedUnitIds = new Set(plannedActions.map((action) => action.unitId));
  const teamUnits = units.filter((u) => u.team === activeTeam && u.alive && u.ap > 0);
  if (teamUnits.length === 0) return null;

  const currentIndex = Math.max(0, teamUnits.findIndex((u) => u.id === currentUnitId));
  for (let offset = 1; offset <= teamUnits.length; offset++) {
    const candidate = teamUnits[(currentIndex + offset) % teamUnits.length];
    if (!plannedUnitIds.has(candidate.id)) return candidate.id;
  }

  return null;
}

function getMovementForSelection(
  units: Unit[],
  unitId: number | null,
  map: GameState['map'],
  round: RoundState
): {
  movementTiles: MovementTile[];
  walkableTiles: TileCoord[];
} {
  if (unitId === null) return { movementTiles: [], walkableTiles: [] };
  const unit = units.find((u) => u.id === unitId);
  if (!unit || !unit.alive || unit.ap <= 0) return { movementTiles: [], walkableTiles: [] };
  return getMovementState(unit, map, round.phase === 'setup');
}

function findNearestWalkable(map: GameState['map'], preferred: TileCoord): TileCoord {
  if (map.grid[preferred.y]?.[preferred.x]?.walkable) return preferred;
  const queue = [{ ...preferred }];
  const seen = new Set([`${preferred.x},${preferred.y}`]);
  const dirs = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const dir of dirs) {
      const next = { x: current.x + dir.x, y: current.y + dir.y };
      const key = `${next.x},${next.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (next.x < 0 || next.x >= map.width || next.y < 0 || next.y >= map.height) continue;
      if (map.grid[next.y]?.[next.x]?.walkable) return next;
      queue.push(next);
    }
  }

  return preferred;
}

function isUnitSelectable(units: Unit[], activeTeam: Team, unitId: number | null): boolean {
  if (unitId === null) return false;
  const unit = units.find((candidate) => candidate.id === unitId);
  return Boolean(unit?.alive && unit.team === activeTeam);
}

function getPreferredSelection(
  units: Unit[],
  round: RoundState,
  preferredUnitId: number | null,
  fallbackUnitId: number | null
): number | null {
  if (isUnitSelectable(units, round.activeTeam, preferredUnitId)) return preferredUnitId;
  if (isUnitSelectable(units, round.activeTeam, fallbackUnitId)) return fallbackUnitId;
  return getFirstAvailableUnitId(units, round.activeTeam);
}

function isTileOccupied(units: Unit[], tile: TileCoord, ignoreUnitId?: number): boolean {
  return units.some((unit) => (
    unit.alive &&
    unit.id !== ignoreUnitId &&
    unit.position.x === tile.x &&
    unit.position.y === tile.y
  ));
}

const CT_AI_ANCHORS: Partial<Record<RoleId, TileCoord>> = {
  awper: { x: 62, y: 55 },
  entry: { x: 43, y: 76 },
  support: { x: 45, y: 74 },
  igl: { x: 72, y: 35 },
  lurker: { x: 76, y: 47 },
};

const CT_AI_HOLDS: Partial<Record<RoleId, TileCoord>> = {
  awper: { x: 52, y: 43 },
  entry: { x: 38, y: 68 },
  support: { x: 37, y: 61 },
  igl: { x: 60, y: 43 },
  lurker: { x: 62, y: 55 },
};

function getCtAiAnchor(unit: Unit, map: GameState['map']): TileCoord {
  return findNearestWalkable(map, CT_AI_ANCHORS[unit.role.id] ?? unit.position);
}

function getCtAiHoldTarget(unit: Unit, units: Unit[], map: GameState['map']): TileCoord {
  const nearestT = units
    .filter((candidate) => candidate.alive && candidate.team === 'T')
    .sort((a, b) => tileDistance(unit.position, a.position) - tileDistance(unit.position, b.position))[0];

  return nearestT?.position ?? findNearestWalkable(map, CT_AI_HOLDS[unit.role.id] ?? unit.position);
}

function getReachableAiDestination(
  map: GameState['map'],
  units: Unit[],
  unit: Unit,
  target: TileCoord,
  maxTiles: number
): TileCoord | null {
  const path = findPath(map, unit.position, target);
  if (path.length === 0) return null;

  const limitedPath = path.slice(0, Math.max(1, maxTiles));
  for (let i = limitedPath.length - 1; i >= 0; i--) {
    const candidate = limitedPath[i];
    if (!isTileOccupied(units, candidate, unit.id)) return candidate;
  }

  return null;
}

function getBestAiShot(
  map: GameState['map'],
  attacker: Unit,
  units: Unit[],
  smokes: SmokeCloud[]
): { target: Unit; preview: ReturnType<typeof getShotPreview> } | null {
  if (attacker.ammoInClip <= 0 || attacker.ap < getWeaponShotApCost(attacker.weapon)) return null;

  return units
    .filter((target) => target.alive && target.team !== attacker.team)
    .map((target) => ({
      target,
      preview: getShotPreview(map, attacker, target, 0, target.position, smokes),
    }))
    .filter(({ preview }) => preview.hasLineOfSight && preview.inRange)
    .sort((a, b) => b.preview.hitChance - a.preview.hitChance)[0] ?? null;
}

function isInsideZone(tile: TileCoord, zone: { min: TileCoord; max: TileCoord }): boolean {
  return tile.x >= zone.min.x &&
    tile.x <= zone.max.x &&
    tile.y >= zone.min.y &&
    tile.y <= zone.max.y;
}

function getPlantSite(map: GameState['map'], tile: TileCoord): 'A' | 'B' | null {
  if (isInsideZone(tile, map.plantZones.A)) return 'A';
  if (isInsideZone(tile, map.plantZones.B)) return 'B';
  return null;
}

function canReachBomb(unit: Unit, bombPosition: TileCoord | null): boolean {
  if (!bombPosition) return false;
  return tileDistance(unit.position, bombPosition) <= 1.5;
}

function applyBombDrop(round: RoundState, units: Unit[]): RoundState {
  if (round.phase === 'roundend' || round.bombPlanted || round.bombDefused || round.bombCarrierId === null) {
    return round;
  }

  const carrier = units.find((unit) => unit.id === round.bombCarrierId);
  if (!carrier || (carrier.alive && carrier.hasBomb)) return round;

  return {
    ...round,
    bombCarrierId: null,
    bombPosition: { ...carrier.position },
  };
}

function applyEliminationOutcome(round: RoundState, units: Unit[]): RoundState {
  if (round.phase === 'roundend') return round;

  const terroristsAlive = units.some((unit) => unit.alive && unit.team === 'T');
  const ctsAlive = units.some((unit) => unit.alive && unit.team === 'CT');

  if (!terroristsAlive) {
    return {
      ...round,
      phase: 'roundend',
      roundWinner: 'CT',
      winReason: 'elimination',
    };
  }

  if (!ctsAlive) {
    return {
      ...round,
      phase: 'roundend',
      roundWinner: 'T',
      winReason: 'elimination',
    };
  }

  return round;
}

function isUtilityAction(action: PlannedAction): boolean {
  return action.kind === 'smoke' || action.kind === 'flash';
}

function createUtilityPlan(
  state: GameState,
  kind: 'smoke' | 'flash',
  targetTile: TileCoord,
  throwRange: number
): {
  plannedActions: PlannedAction[];
  selectedUnitId: number | null;
  movementTiles: MovementTile[];
  walkableTiles: TileCoord[];
} | null {
  const { selectedUnitId, units, map: mapData, round } = state;
  if (selectedUnitId === null) return null;

  const unit = units.find((candidate) => candidate.id === selectedUnitId);
  if (!unit || !unit.alive || unit.ap <= 0 || unit.team !== round.activeTeam) return null;
  if (round.phase === 'setup' && !RULES.setupUtilityAllowed) return null;
  if (!mapData.grid[targetTile.y]?.[targetTile.x]?.walkable) return null;
  if (tileDistance(unit.position, targetTile) > throwRange) return null;

  const charges = kind === 'smoke' ? unit.smokeGrenades : unit.flashbangs;
  if (charges <= 0) return null;

  const existingPlans = state.plannedActions.filter((action) => action.unitId !== unit.id);
  const plannedAction: PlannedAction = {
    id: `${unit.id}:${kind}`,
    unitId: unit.id,
    team: unit.team,
    kind,
    executeAtMs: getDefaultExecuteAtMs(kind),
    from: { ...unit.position },
    target: { ...targetTile },
    path: [],
    apCost: 1,
    summary: `${unit.name} ${kind} ${mapData.grid[targetTile.y]?.[targetTile.x]?.label ?? 'tile'}`,
  };
  const plannedActions = [...existingPlans, plannedAction];
  const nextSelectedUnitId = getNextUnplannedUnitId(
    units,
    round.activeTeam,
    unit.id,
    plannedActions
  ) ?? unit.id;
  const movement = getMovementForSelection(units, nextSelectedUnitId, mapData, round);

  return {
    plannedActions,
    selectedUnitId: nextSelectedUnitId,
    movementTiles: movement.movementTiles,
    walkableTiles: movement.walkableTiles,
  };
}

function advanceTurn(round: RoundState, units: Unit[], smokes: SmokeCloud[] = []): {
  round: RoundState;
  units: Unit[];
  smokes: SmokeCloud[];
} {
  let nextTeam: Team;
  let nextTurn = round.turn;
  let nextPhase = round.phase;
  let nextBombTimer = round.bombTimer;
  const nextRoundTimer = round.phase === 'setup' ? round.roundTimer : Math.max(0, round.roundTimer - 1);
  let roundWinner = round.roundWinner;
  let winReason = round.winReason;

  if (round.phase === 'roundend') {
    return { round, units, smokes };
  }

  if (round.activeTeam === 'T') {
    nextTeam = 'CT';
  } else {
    nextTeam = 'T';
    nextTurn = round.turn + 1;

    if (nextTurn > RULES.setupPhaseTurns && round.phase === 'setup') {
      nextPhase = 'combat';
    }
  }

  const newUnits = units.map((u) => {
    const flashTurns = u.team === round.activeTeam
      ? Math.max(0, u.flashTurns - 1)
      : u.flashTurns;
    const nextUnit = flashTurns !== u.flashTurns ? { ...u, flashTurns } : u;
    if (nextUnit.team === nextTeam && nextUnit.alive) {
      return { ...nextUnit, ap: nextUnit.maxAp, hasMoved: false, shotsFiredThisTurn: 0 };
    }
    return nextUnit;
  });

  const nextSmokes = nextTeam === 'T'
    ? smokes
      .map((smoke) => ({ ...smoke, remainingTurns: smoke.remainingTurns - 1 }))
      .filter((smoke) => smoke.remainingTurns > 0)
    : smokes;

  if (round.bombPlanted && !round.bombDefused && round.phase === 'postplant') {
    nextBombTimer = Math.max(0, round.bombTimer - 1);
    if (nextBombTimer <= 0) {
      nextPhase = 'roundend';
      roundWinner = 'T';
      winReason = 'detonation';
    }
  }

  if (nextPhase !== 'roundend' && !round.bombPlanted && round.phase !== 'setup' && nextRoundTimer <= 0) {
    nextPhase = 'roundend';
    roundWinner = 'CT';
    winReason = 'timeexpiry';
  }

  const possessionRound = applyBombDrop({
    ...round,
    activeTeam: nextTeam,
    turn: nextTurn,
    phase: nextPhase,
    bombTimer: nextBombTimer,
    roundWinner,
    winReason,
    roundTimer: nextRoundTimer,
  }, newUnits);
  const outcomeRound = applyEliminationOutcome(possessionRound, newUnits);

  return {
    units: newUnits,
    smokes: nextSmokes,
    round: outcomeRound,
  };
}

type CreateUnitsOptions = {
  randomizeSpawns?: boolean;
};

function createUnits(map: GameState['map'] = createInfernoMap(), options: CreateUnitsOptions = {}): Unit[] {
  const units: Unit[] = [];
  let id = 0;

  const makeUnit = (team: Team, roleId: RoleId, spawn: TileCoord): Unit => {
    const role = ROLES[roleId];
    const weapon = getDefaultWeaponForRole(team, roleId);
    return {
      id: id++,
      team,
      role,
      name: role.referencePro,
      hp: role.hp,
      maxHp: role.hp,
      position: { ...spawn },
      weapon,
      money: 800,
      ap: RULES.baseAp,
      maxAp: RULES.baseAp,
      alive: true,
      shotsFiredThisTurn: 0,
      hasMoved: false,
      hasBomb: false,
      hasDefuseKit: team === 'CT' && (roleId === 'support' || roleId === 'igl'),
      smokeGrenades: roleId === 'support' ? 2 : (roleId === 'igl' || roleId === 'lurker' ? 1 : 0),
      flashbangs: roleId === 'awper' ? 0 : (roleId === 'support' ? 2 : 1),
      flashTurns: 0,
      ammoInClip: weapon.clipSize,
      reserveAmmo: weapon.clipSize * 3,
      facing: { x: 0, y: team === 'T' ? 1 : -1 },
    };
  };

  T_ROSTER.forEach((roleId, i) => {
    units.push(makeUnit('T', roleId, map.spawns.T[i]));
  });
  CT_ROSTER.forEach((roleId, i) => {
    units.push(makeUnit('CT', roleId, map.spawns.CT[i]));
  });

  // Bomb carrier = first T (entry fragger)
  units[0].hasBomb = true;

  return options.randomizeSpawns ? applyRandomSpawnPositions(map, units) : units;
}

function createRoundUnits(map: GameState['map']): Unit[] {
  return createUnits(map);
}

interface GameStore extends GameState {
  selectUnit: (id: number | null) => void;
  hoverTile: (tile: TileCoord | null) => void;
  moveUnit: (targetTile: TileCoord) => void;
  setInputMode: (mode: InputMode) => void;
  holdAngle: (targetTile: TileCoord) => void;
  throwSmoke: (targetTile: TileCoord) => void;
  throwFlash: (targetTile: TileCoord) => void;
  plantBomb: () => void;
  defuseBomb: () => void;
  pickupBomb: () => void;
  reloadWeapon: () => void;
  shootUnit: (targetId: number) => void;
  queueMove: (targetTile: TileCoord) => void;
  commitPlannedActions: () => void;
  clearPlannedActions: () => void;
  setPlannedActionTiming: (actionId: string, executeAtMs: number) => void;
  setPlanningMode: (enabled: boolean) => void;
  applyMetaDefaultSetup: () => void;
  pushGuidance: (title: string, detail: string, tone?: GuidanceTone) => void;
  finishUnit: () => void;
  endTurn: () => void;
  runCtAiTurn: () => Promise<void>;
  initGame: () => void;
  startNextRound: () => void;
  startContactDrill: () => void;
  startDuelLab: () => void;
}

export const useGameStore = create<GameStore>((set, get) => {
  const map = createInfernoMap();
  const units = createRoundUnits(map);
  const maybeRunCtAiTurn = () => {
    window.setTimeout(() => {
      const state = get();
      if (state.round.activeTeam === 'CT' && !state.isExecuting && !state.aiStatus) {
        void get().runCtAiTurn();
      }
    }, 180);
  };

  return {
    map,
    units,
    round: {
      phase: 'setup',
      turn: 1,
      activeTeam: 'T',
      bombPlanted: false,
      bombDefused: false,
      bombPosition: null,
      bombTimer: RULES.bombTimerTurns,
      bombCarrierId: 0,
      roundTimer: RULES.roundTimeLimitTurns,
      roundWinner: null,
      winReason: null,
    },
    match: {
      scoreT: 0,
      scoreCT: 0,
      currentRound: 1,
      maxRounds: RULES.roundsPerHalf * 2,
      isOvertime: false,
      halfSwapped: false,
    },
    economy: {
      moneyT: [800, 800, 800, 800, 800],
      moneyCT: [800, 800, 800, 800, 800],
      lossStreakT: 0,
      lossStreakCT: 0,
    },
    selectedUnitId: null,
    hoveredTile: null,
    walkableTiles: [],
    movementTiles: [],
    pathPreview: [],
    planningMode: false,
    plannedActions: [],
    isExecuting: false,
    inputMode: 'move',
    heldAngles: [],
    smokes: [],
    flashBursts: [],
    combatLog: [],
    executeInterrupt: null,
    currentExecuteTimeline: null,
    lastExecuteTimeline: null,
    movementRoutes: [],
    feedbackEvents: [],
    guidanceEvent: null,
    aiStatus: null,

    pushGuidance: (title, detail, tone = 'hint') => {
      const state = get();
      const guidanceEvent = createGuidanceEvent(title, detail, tone);
      set({
        guidanceEvent,
        feedbackEvents: tone === 'warning'
          ? appendFeedback(state.feedbackEvents, 'invalid_action', {
            team: state.round.activeTeam,
            intensity: 0.9,
          })
          : state.feedbackEvents,
      });
    },

    selectUnit: (id) => {
      const state = get();
      if (id === null) {
        set({ selectedUnitId: null, walkableTiles: [], movementTiles: [], pathPreview: [] });
        return;
      }

      const unit = state.units.find((u) => u.id === id);
      if (!unit || !unit.alive) {
        set({ selectedUnitId: null, walkableTiles: [], movementTiles: [], pathPreview: [] });
        return;
      }

      // Only select units from the active team
      if (unit.team !== state.round.activeTeam) {
        set({ selectedUnitId: null, walkableTiles: [], movementTiles: [], pathPreview: [] });
        return;
      }

      // No AP left? Can still select but no walkable tiles
      if (unit.ap <= 0) {
        set({
          selectedUnitId: id,
          walkableTiles: [],
          movementTiles: [],
          pathPreview: [],
          feedbackEvents: appendFeedback(state.feedbackEvents, 'select_unit', {
            team: unit.team,
            unitId: unit.id,
            intensity: 0.55,
          }),
        });
        return;
      }

      const isSetup = state.round.phase === 'setup';
      const { movementTiles, walkableTiles } = getMovementState(unit, state.map, isSetup);

      set({
        selectedUnitId: id,
        movementTiles,
        walkableTiles,
        pathPreview: [],
        feedbackEvents: appendFeedback(state.feedbackEvents, 'select_unit', {
          team: unit.team,
          unitId: unit.id,
          intensity: unit.ap > 0 ? 1 : 0.55,
        }),
      });
    },

    hoverTile: (tile) => {
      if (!tile) {
        set({ hoveredTile: null, pathPreview: [] });
        return;
      }

      const state = get();
      if (
        state.hoveredTile?.x === tile.x &&
        state.hoveredTile?.y === tile.y
      ) {
        return;
      }

      if (state.selectedUnitId === null) {
        set({ hoveredTile: tile });
        return;
      }

      const unit = state.units.find((u) => u.id === state.selectedUnitId);
      if (!unit || unit.ap <= 0) {
        set({ hoveredTile: tile });
        return;
      }

      if (state.inputMode === 'smoke' || state.inputMode === 'flash' || state.inputMode === 'hold_angle') {
        set({ hoveredTile: tile, pathPreview: [] });
        return;
      }

      const isInRange = state.walkableTiles.some(
        (t) => t.x === tile.x && t.y === tile.y
      );
      if (isInRange) {
        const path = findPath(state.map, unit.position, tile);
        set({ hoveredTile: tile, pathPreview: path });
      } else {
        set({ hoveredTile: tile, pathPreview: [] });
      }
    },

    moveUnit: async (targetTile) => {
      const state = get();
      if (state.isExecuting) return;
      const { selectedUnitId, units, map: mapData, round } = state;

      if (selectedUnitId === null) return;

      const unitIdx = units.findIndex((u) => u.id === selectedUnitId);
      if (unitIdx === -1) return;

      const unit = units[unitIdx];
      if (!unit.alive || unit.ap <= 0) return;
      if (unit.team !== round.activeTeam) return;

      const isInRange = state.walkableTiles.some(
        (t) => t.x === targetTile.x && t.y === targetTile.y
      );
      if (!isInRange) return;

      // Check no other unit on that tile
      const occupied = units.some(
        (u) => u.alive && u.id !== unit.id &&
               u.position.x === targetTile.x && u.position.y === targetTile.y
      );
      if (occupied) return;

      // Compute path and AP cost
      const path = findPath(mapData, unit.position, targetTile);
      if (path.length === 0) return;

      const isSetup = round.phase === 'setup';
      const rangePerAP = getMoveRangePerAP(unit, isSetup);
      const apCost = Math.ceil(path.length / rangePerAP);

      if (apCost > unit.ap) return; // shouldn't happen if walkable range is correct

      const canTriggerHeldAngles = round.phase !== 'setup' || RULES.setupOverwatchAllowed;
      const crossedAngle = canTriggerHeldAngles
        ? getCrossingHeldAngles(state.heldAngles, path, unit.team)[0] ?? null
        : null;
      const contactTile = crossedAngle ? getFirstCrossingTile(crossedAngle, path) : null;
      const contactIndex = contactTile
        ? path.findIndex((tile) => tile.x === contactTile.x && tile.y === contactTile.y)
        : -1;
      const pathToTravel = contactIndex >= 0 ? path.slice(0, contactIndex + 1) : path;
      const visualRoutePath = [{ ...unit.position }, ...pathToTravel.map((tile) => ({ ...tile }))];
      const routeTiming = getRouteVisualTiming(visualRoutePath);
      const movementRoute = createMovementPresentationRoute(unit.id, pathToTravel, 'direct_move', 0, {
        timingPath: visualRoutePath,
        syncToVisualTiming: true,
      });

      let nextUnits = [...units];
      let tilesMoved = 0;
      let contactEvent: CombatEvent | null = null;
      let consumedHeldAngleId: string | null = null;
      let contactTimelineTimeMs = 0;
      let executeTimeline = createExecuteTimeline({
        id: `${Date.now()}:direct-move:${unit.id}`,
        source: 'direct_move',
        activeTeam: round.activeTeam,
      });
      const appendExecuteEvent = (event: ExecuteTimelineEvent) => {
        executeTimeline = {
          ...executeTimeline,
          events: sortExecuteTimelineEvents([...executeTimeline.events, event]),
        };
        set({ currentExecuteTimeline: executeTimeline });
      };

      appendExecuteEvent(createExecuteTimelineEvent({
        id: `${executeTimeline.id}:move-start`,
        kind: 'move_start',
        timeMs: 0,
        phaseLabel: 'MOVE',
        title: `${unit.name} move start`,
        detail: `toward ${mapData.grid[targetTile.y]?.[targetTile.x]?.label ?? `${targetTile.x},${targetTile.y}`}`,
        unitId: unit.id,
        tile: unit.position,
      }));
      set({
        isExecuting: true,
        executeInterrupt: null,
        currentExecuteTimeline: executeTimeline,
        movementRoutes: [movementRoute],
        hoveredTile: null,
        movementTiles: [],
        walkableTiles: [],
        pathPreview: [],
        inputMode: 'move',
        feedbackEvents: appendFeedback(state.feedbackEvents, 'move_step', {
          team: unit.team,
          unitId: unit.id,
          intensity: 0.65,
        }),
      });

      let previousArrivalMs = 0;
      for (const step of pathToTravel) {
        const stepIndex = tilesMoved;
        const arrivalMs = routeTiming.arrivalTimesMs[stepIndex + 1] ??
          Math.round(routeTiming.durationMs * ((stepIndex + 1) / Math.max(1, pathToTravel.length)));
        const waitMs = Math.max(0, arrivalMs - previousArrivalMs);
        if (waitMs > 0) await wait(waitMs);
        previousArrivalMs = arrivalMs;

        const currentUnitIdx = nextUnits.findIndex((candidate) => candidate.id === unit.id);
        if (currentUnitIdx === -1) break;

        const movingUnit = nextUnits[currentUnitIdx];
        if (!movingUnit.alive) break;

        const dx = step.x - movingUnit.position.x;
        const dy = step.y - movingUnit.position.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;

        nextUnits = [...nextUnits];
        nextUnits[currentUnitIdx] = {
          ...movingUnit,
          position: { ...step },
          hasMoved: true,
          facing: { x: Math.round(dx / len), y: Math.round(dy / len) },
        };
        tilesMoved += 1;
        appendExecuteEvent(createExecuteTimelineEvent({
          id: `${executeTimeline.id}:move:${tilesMoved}:${step.x},${step.y}`,
          kind: 'movement_beat',
          timeMs: arrivalMs,
          phaseLabel: 'MOVE',
          title: `${unit.name} crossed`,
          detail: mapData.grid[step.y]?.[step.x]?.label ?? `tile ${step.x},${step.y}`,
          unitId: unit.id,
          tile: step,
        }));

        set({
          units: nextUnits,
          hoveredTile: null,
          pathPreview: [],
          feedbackEvents: appendFeedback(get().feedbackEvents, 'move_step', {
            team: unit.team,
            unitId: unit.id,
            intensity: 0.7,
          }),
        });
        if (
          crossedAngle &&
          contactTile &&
          step.x === contactTile.x &&
          step.y === contactTile.y
        ) {
          const targetIdx = nextUnits.findIndex((candidate) => candidate.id === unit.id);
          const target = targetIdx === -1 ? null : nextUnits[targetIdx];
          const attacker = nextUnits.find((candidate) => candidate.id === crossedAngle.unitId);
          if (target?.alive && attacker?.alive && attacker.ammoInClip > 0) {
            const reactionPreview = getShotPreview(mapData, attacker, target, crossedAngle.aimBonus, contactTile, state.smokes);
            if (reactionPreview.hasLineOfSight && reactionPreview.inRange) {
              contactEvent = resolveReactionFire(mapData, attacker, target, contactTile, crossedAngle, state.smokes);
              consumedHeldAngleId = crossedAngle.id;
              contactTimelineTimeMs = arrivalMs;
              if (contactEvent.hit) {
                const newHp = Math.max(0, target.hp - contactEvent.damage);
                nextUnits[targetIdx] = {
                  ...target,
                  hp: newHp,
                  alive: newHp > 0,
                  hasBomb: newHp > 0 ? target.hasBomb : false,
                };
              }
              const attackerIdx = nextUnits.findIndex((candidate) => candidate.id === attacker.id);
              if (attackerIdx !== -1) {
                nextUnits[attackerIdx] = {
                  ...nextUnits[attackerIdx],
                  ammoInClip: Math.max(0, nextUnits[attackerIdx].ammoInClip - 1),
                  shotsFiredThisTurn: nextUnits[attackerIdx].shotsFiredThisTurn + 1,
                };
              }
              break;
            }
          }
        }
      }

      const finalUnitIdx = nextUnits.findIndex((candidate) => candidate.id === unit.id);
      if (finalUnitIdx === -1 || tilesMoved === 0) {
        set({
          isExecuting: false,
          currentExecuteTimeline: null,
          movementRoutes: [],
          lastExecuteTimeline: {
            ...executeTimeline,
            status: 'completed',
            events: sortExecuteTimelineEvents(executeTimeline.events),
          },
        });
        return;
      }

      const spentAp = Math.max(1, Math.min(apCost, Math.ceil(tilesMoved / rangePerAP)));
      const finalUnit = nextUnits[finalUnitIdx];
      const newAp = Math.max(0, finalUnit.ap - spentAp);
      nextUnits = [...nextUnits];
      nextUnits[finalUnitIdx] = {
        ...finalUnit,
        ap: newAp,
        hasMoved: true,
      };

      let nextSelectedUnitId: number | null = contactEvent
        ? (nextUnits[finalUnitIdx].alive ? unit.id : getFirstAvailableUnitId(nextUnits, round.activeTeam))
        : selectedUnitId;
      let movementTiles: MovementTile[] = [];
      let walkableTiles: TileCoord[] = [];
      let nextRound = applyEliminationOutcome(applyBombDrop(round, nextUnits), nextUnits);
      let nextSmokes = state.smokes;

      if (nextRound.phase === 'roundend') {
        nextSelectedUnitId = null;
      } else if (contactEvent) {
        nextSelectedUnitId = nextUnits[finalUnitIdx].alive
          ? unit.id
          : getFirstAvailableUnitId(nextUnits, round.activeTeam);
      } else {
        nextSelectedUnitId = getNextAvailableUnitId(nextUnits, round.activeTeam, unit.id);
        if (nextSelectedUnitId === null) {
          const advanced = advanceTurn(round, nextUnits, state.smokes);
          nextUnits = advanced.units;
          nextRound = advanced.round;
          nextSmokes = advanced.smokes;
          nextSelectedUnitId = getFirstAvailableUnitId(nextUnits, nextRound.activeTeam);
        }

        if (nextSelectedUnitId !== null) {
          const nextUnit = nextUnits.find((u) => u.id === nextSelectedUnitId);
          if (nextUnit) {
            const nextMovement = getMovementState(nextUnit, mapData, nextRound.phase === 'setup');
            movementTiles = nextMovement.movementTiles;
            walkableTiles = nextMovement.walkableTiles;
          }
        }
      }

      const preferredSelectedUnitId = nextRound.phase === 'roundend'
        ? null
        : contactEvent
          ? getPreferredSelection(nextUnits, nextRound, nextSelectedUnitId, nextSelectedUnitId)
          : nextSelectedUnitId;
      const movement = getMovementForSelection(nextUnits, preferredSelectedUnitId, mapData, nextRound);
      movementTiles = movement.movementTiles;
      walkableTiles = movement.walkableTiles;
      const executeInterrupt = contactEvent
        ? createExecuteInterrupt({
          event: contactEvent,
          map: mapData,
          units: nextUnits,
          round: nextRound,
          smokes: nextSmokes,
          source: 'direct_move',
          beatTimeMs: contactTimelineTimeMs,
          phaseLabel: 'CONTACT',
          timelineEvents: executeTimeline.events,
        })
        : null;
      const finalExecuteTimelineEvents = executeInterrupt
        ? [...executeTimeline.events, ...executeInterrupt.timelineEvents.filter((event) => (
          !executeTimeline.events.some((existingEvent) => existingEvent.id === event.id)
        ))]
        : executeTimeline.events;
      const finalExecuteTimeline: ExecuteTimeline = {
        ...executeTimeline,
        status: contactEvent ? 'interrupted' : 'completed',
        events: sortExecuteTimelineEvents(finalExecuteTimelineEvents),
      };

      set({
        units: nextUnits,
        round: nextRound,
        selectedUnitId: preferredSelectedUnitId,
        hoveredTile: null,
        movementTiles,
        walkableTiles,
        pathPreview: [],
        isExecuting: false,
        inputMode: contactEvent ? 'shoot' : 'move',
        plannedActions: [],
        currentExecuteTimeline: null,
        movementRoutes: [],
        lastExecuteTimeline: finalExecuteTimeline,
        heldAngles: state.heldAngles.filter((angle) => (
          angle.unitId !== unit.id &&
          angle.id !== consumedHeldAngleId
        )),
        smokes: nextSmokes,
        combatLog: contactEvent ? [contactEvent, ...state.combatLog].slice(0, 8) : state.combatLog,
        executeInterrupt,
        feedbackEvents: appendBombTickFeedback(appendFeedback(get().feedbackEvents, 'move_complete', {
          team: unit.team,
          unitId: unit.id,
          intensity: contactEvent ? 1.2 : 0.9,
        }), round, nextRound),
      });
      if (nextRound.activeTeam === 'CT' && nextRound.phase !== 'roundend') maybeRunCtAiTurn();
    },

    setInputMode: (mode) => {
      set({ inputMode: mode, pathPreview: [] });
    },

    holdAngle: (targetTile) => {
      const state = get();
      if (state.isExecuting) return;
      const { selectedUnitId, units, map: mapData, round } = state;
      if (selectedUnitId === null) return;

      const unitIdx = units.findIndex((u) => u.id === selectedUnitId);
      if (unitIdx === -1) return;

      const unit = units[unitIdx];
      if (!unit.alive || unit.ap <= 0 || unit.team !== round.activeTeam || unit.ammoInClip <= 0) return;
      if (unit.position.x === targetTile.x && unit.position.y === targetTile.y) return;

      const maxTiles = Math.max(4, Math.min(unit.weapon.rangeMax, 24));
      const laneTiles = getWatchedLane(mapData, unit.position, targetTile, maxTiles);
      if (laneTiles.length === 0) return;

      const dx = targetTile.x - unit.position.x;
      const dy = targetTile.y - unit.position.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;

      let nextUnits = [...units];
      const newAp = Math.max(0, unit.ap - 1);
      nextUnits[unitIdx] = {
        ...unit,
        ap: newAp,
        hasMoved: true,
        facing: { x: Math.round(dx / len), y: Math.round(dy / len) },
      };

      const heldAngle: HeldAngle = {
        id: `${unit.id}:hold`,
        unitId: unit.id,
        team: unit.team,
        origin: { ...unit.position },
        target: { ...targetTile },
        laneTiles,
        remainingShots: 1,
        aimBonus: unit.role.id === 'awper' ? 15 : 5,
      };

      let nextRound = round;
      let nextSelectedUnitId: number | null = selectedUnitId;
      let movementTiles: MovementTile[] = [];
      let walkableTiles: TileCoord[] = [];
      let nextSmokes = state.smokes;

      if (newAp > 0) {
        const movement = getMovementState(nextUnits[unitIdx], mapData, round.phase === 'setup');
        movementTiles = movement.movementTiles;
        walkableTiles = movement.walkableTiles;
      } else {
        nextSelectedUnitId = getNextAvailableUnitId(nextUnits, round.activeTeam, unit.id);
        if (nextSelectedUnitId === null) {
          const advanced = advanceTurn(round, nextUnits, state.smokes);
          nextUnits = advanced.units;
          nextRound = advanced.round;
          nextSmokes = advanced.smokes;
          nextSelectedUnitId = getFirstAvailableUnitId(nextUnits, nextRound.activeTeam);
        }
        const movement = getMovementForSelection(nextUnits, nextSelectedUnitId, mapData, nextRound);
        movementTiles = movement.movementTiles;
        walkableTiles = movement.walkableTiles;
      }

      set({
        units: nextUnits,
        round: nextRound,
        selectedUnitId: nextSelectedUnitId,
        executeInterrupt: null,
        hoveredTile: null,
        movementTiles,
        walkableTiles,
        pathPreview: [],
        inputMode: 'move',
        heldAngles: [
          ...state.heldAngles.filter((angle) => angle.unitId !== unit.id),
          heldAngle,
        ],
        smokes: nextSmokes,
        feedbackEvents: appendBombTickFeedback(appendFeedback(state.feedbackEvents, 'hold_angle', {
          team: unit.team,
          unitId: unit.id,
          intensity: 0.9,
        }), round, nextRound),
      });
      if (nextRound.activeTeam === 'CT' && nextRound.phase !== 'roundend') maybeRunCtAiTurn();
    },

    throwSmoke: (targetTile) => {
      const state = get();
      if (state.isExecuting) return;
      if (state.planningMode) {
        const plan = createUtilityPlan(state, 'smoke', targetTile, SMOKE_THROW_RANGE);
        if (!plan) return;
        const unit = state.units.find((candidate) => candidate.id === state.selectedUnitId);
        set({
          plannedActions: plan.plannedActions,
          selectedUnitId: plan.selectedUnitId,
          executeInterrupt: null,
          movementTiles: plan.movementTiles,
          walkableTiles: plan.walkableTiles,
          hoveredTile: null,
          pathPreview: [],
          inputMode: 'move',
          feedbackEvents: appendFeedback(state.feedbackEvents, 'plan_add', {
            team: unit?.team,
            unitId: unit?.id,
            intensity: 0.7,
          }),
        });
        return;
      }
      const { selectedUnitId, units, map: mapData, round } = state;
      if (selectedUnitId === null) return;

      const unitIdx = units.findIndex((u) => u.id === selectedUnitId);
      if (unitIdx === -1) return;

      const unit = units[unitIdx];
      if (!unit.alive || unit.ap <= 0 || unit.team !== round.activeTeam || unit.smokeGrenades <= 0) return;
      if (round.phase === 'setup' && !RULES.setupUtilityAllowed) return;
      if (!mapData.grid[targetTile.y]?.[targetTile.x]?.walkable) return;
      if (tileDistance(unit.position, targetTile) > SMOKE_THROW_RANGE) return;

      const dx = targetTile.x - unit.position.x;
      const dy = targetTile.y - unit.position.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;

      let nextUnits = [...units];
      const newAp = Math.max(0, unit.ap - 1);
      nextUnits[unitIdx] = {
        ...unit,
        ap: newAp,
        smokeGrenades: Math.max(0, unit.smokeGrenades - 1),
        hasMoved: true,
        facing: { x: Math.round(dx / len), y: Math.round(dy / len) },
      };

      const smoke: SmokeCloud = {
        id: `${Date.now()}:${unit.id}:smoke`,
        ownerId: unit.id,
        team: unit.team,
        position: { ...targetTile },
        radius: SMOKE_RADIUS,
        remainingTurns: SMOKE_DURATION_TURNS,
      };

      let nextRound = round;
      let nextSelectedUnitId: number | null = newAp > 0
        ? unit.id
        : getNextAvailableUnitId(nextUnits, round.activeTeam, unit.id);
      let nextSmokes = [...state.smokes, smoke];

      if (nextSelectedUnitId === null) {
        const advanced = advanceTurn(round, nextUnits, nextSmokes);
        nextUnits = advanced.units;
        nextRound = advanced.round;
        nextSmokes = advanced.smokes;
        nextSelectedUnitId = getFirstAvailableUnitId(nextUnits, nextRound.activeTeam);
      }

      const movement = getMovementForSelection(nextUnits, nextSelectedUnitId, mapData, nextRound);

      set({
        units: nextUnits,
        round: nextRound,
        selectedUnitId: nextSelectedUnitId,
        executeInterrupt: null,
        hoveredTile: null,
        movementTiles: movement.movementTiles,
        walkableTiles: movement.walkableTiles,
        pathPreview: [],
        inputMode: 'move',
        smokes: nextSmokes,
        feedbackEvents: appendBombTickFeedback(appendFeedback(
          appendFeedback(state.feedbackEvents, 'smoke_throw', {
            team: unit.team,
            unitId: unit.id,
            intensity: 1,
          }),
          'smoke_bloom',
          {
            team: unit.team,
            unitId: unit.id,
            intensity: 0.95,
          }
        ), round, nextRound),
      });
      if (nextRound.activeTeam === 'CT' && nextRound.phase !== 'roundend') maybeRunCtAiTurn();
    },

    throwFlash: (targetTile) => {
      const state = get();
      if (state.isExecuting) return;
      if (state.planningMode) {
        const plan = createUtilityPlan(state, 'flash', targetTile, FLASH_THROW_RANGE);
        if (!plan) return;
        const unit = state.units.find((candidate) => candidate.id === state.selectedUnitId);
        set({
          plannedActions: plan.plannedActions,
          selectedUnitId: plan.selectedUnitId,
          executeInterrupt: null,
          movementTiles: plan.movementTiles,
          walkableTiles: plan.walkableTiles,
          hoveredTile: null,
          pathPreview: [],
          inputMode: 'move',
          feedbackEvents: appendFeedback(state.feedbackEvents, 'plan_add', {
            team: unit?.team,
            unitId: unit?.id,
            intensity: 0.75,
          }),
        });
        return;
      }
      const { selectedUnitId, units, map: mapData, round } = state;
      if (selectedUnitId === null) return;

      const unitIdx = units.findIndex((u) => u.id === selectedUnitId);
      if (unitIdx === -1) return;

      const unit = units[unitIdx];
      if (!unit.alive || unit.ap <= 0 || unit.team !== round.activeTeam || unit.flashbangs <= 0) return;
      if (round.phase === 'setup' && !RULES.setupUtilityAllowed) return;
      if (!mapData.grid[targetTile.y]?.[targetTile.x]?.walkable) return;
      if (tileDistance(unit.position, targetTile) > FLASH_THROW_RANGE) return;

      const affectedUnitIds = units
        .filter((candidate) => (
          candidate.alive &&
          candidate.team !== unit.team &&
          tileDistance(candidate.position, targetTile) <= FLASH_RADIUS &&
          hasLineOfSight(mapData, targetTile, candidate.position, state.smokes)
        ))
        .map((candidate) => candidate.id);

      const dx = targetTile.x - unit.position.x;
      const dy = targetTile.y - unit.position.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;

      let nextUnits = units.map((candidate, index) => {
        if (index === unitIdx) {
          return {
            ...candidate,
            ap: Math.max(0, candidate.ap - 1),
            flashbangs: Math.max(0, candidate.flashbangs - 1),
            hasMoved: true,
            facing: { x: Math.round(dx / len), y: Math.round(dy / len) },
          };
        }

        if (affectedUnitIds.includes(candidate.id)) {
          return {
            ...candidate,
            flashTurns: Math.max(candidate.flashTurns, FLASH_DURATION_TURNS),
          };
        }

        return candidate;
      });

      const newAp = nextUnits[unitIdx].ap;
      const flashBurst: FlashBurst = {
        id: `${Date.now()}:${unit.id}:flash`,
        ownerId: unit.id,
        team: unit.team,
        position: { ...targetTile },
        radius: FLASH_RADIUS,
        affectedUnitIds,
        createdAt: Date.now(),
      };

      let nextRound = round;
      let nextSelectedUnitId: number | null = newAp > 0
        ? unit.id
        : getNextAvailableUnitId(nextUnits, round.activeTeam, unit.id);
      let nextSmokes = state.smokes;

      if (nextSelectedUnitId === null) {
        const advanced = advanceTurn(round, nextUnits, state.smokes);
        nextUnits = advanced.units;
        nextRound = advanced.round;
        nextSmokes = advanced.smokes;
        nextSelectedUnitId = getFirstAvailableUnitId(nextUnits, nextRound.activeTeam);
      }

      const movement = getMovementForSelection(nextUnits, nextSelectedUnitId, mapData, nextRound);

      set({
        units: nextUnits,
        round: nextRound,
        selectedUnitId: nextSelectedUnitId,
        executeInterrupt: null,
        hoveredTile: null,
        movementTiles: movement.movementTiles,
        walkableTiles: movement.walkableTiles,
        pathPreview: [],
        inputMode: 'move',
        smokes: nextSmokes,
        flashBursts: [
          flashBurst,
          ...state.flashBursts.filter((burst) => Date.now() - burst.createdAt < 6000),
        ].slice(0, FLASH_BURST_LOG_LIMIT),
        feedbackEvents: appendBombTickFeedback(appendFeedback(
          appendFeedback(state.feedbackEvents, 'flash_throw', {
            team: unit.team,
            unitId: unit.id,
            intensity: affectedUnitIds.length > 0 ? 1.15 : 0.85,
          }),
          'flash_pop',
          {
            team: unit.team,
            unitId: unit.id,
            intensity: affectedUnitIds.length > 0 ? 1.2 : 0.85,
          }
        ), round, nextRound),
      });
      if (nextRound.activeTeam === 'CT' && nextRound.phase !== 'roundend') maybeRunCtAiTurn();
    },

    pickupBomb: () => {
      const state = get();
      if (state.isExecuting) return;
      const { selectedUnitId, units, round, map: mapData } = state;
      if (
        selectedUnitId === null ||
        round.bombPlanted ||
        round.bombCarrierId !== null ||
        !round.bombPosition ||
        round.phase === 'roundend'
      ) return;

      const unitIdx = units.findIndex((unit) => unit.id === selectedUnitId);
      if (unitIdx === -1) return;

      const unit = units[unitIdx];
      if (!unit.alive || unit.team !== 'T' || unit.team !== round.activeTeam) return;
      if (!canReachBomb(unit, round.bombPosition) || unit.ap < RULES.bombPickupCost) return;

      let nextUnits = [...units];
      nextUnits[unitIdx] = {
        ...unit,
        ap: Math.max(0, unit.ap - RULES.bombPickupCost),
        hasBomb: true,
      };

      let nextRound: RoundState = {
        ...round,
        bombCarrierId: unit.id,
        bombPosition: null,
      };
      let nextSmokes = state.smokes;
      let nextSelectedUnitId = nextUnits[unitIdx].ap > 0
        ? unit.id
        : getNextAvailableUnitId(nextUnits, round.activeTeam, unit.id);

      if (nextSelectedUnitId === null) {
        const advanced = advanceTurn(nextRound, nextUnits, nextSmokes);
        nextUnits = advanced.units;
        nextRound = advanced.round;
        nextSmokes = advanced.smokes;
        nextSelectedUnitId = getFirstAvailableUnitId(nextUnits, nextRound.activeTeam);
      }

      const movement = getMovementForSelection(nextUnits, nextSelectedUnitId, mapData, nextRound);

      set({
        units: nextUnits,
        round: nextRound,
        selectedUnitId: nextSelectedUnitId,
        executeInterrupt: null,
        hoveredTile: null,
        movementTiles: movement.movementTiles,
        walkableTiles: movement.walkableTiles,
        pathPreview: [],
        planningMode: false,
        plannedActions: [],
        inputMode: 'move',
        smokes: nextSmokes,
        feedbackEvents: appendBombTickFeedback(appendFeedback(state.feedbackEvents, 'bomb_pickup', {
          team: unit.team,
          unitId: unit.id,
          intensity: 0.95,
        }), round, nextRound),
      });
      if (nextRound.activeTeam === 'CT' && nextRound.phase !== 'roundend') maybeRunCtAiTurn();
    },

    reloadWeapon: () => {
      const state = get();
      if (state.isExecuting) return;
      const { selectedUnitId, units, round, map: mapData } = state;
      if (selectedUnitId === null || round.phase === 'roundend') return;

      const unitIdx = units.findIndex((unit) => unit.id === selectedUnitId);
      if (unitIdx === -1) return;

      const unit = units[unitIdx];
      const ammoNeeded = unit.weapon.clipSize - unit.ammoInClip;
      if (!unit.alive || unit.team !== round.activeTeam || unit.ap <= 0 || ammoNeeded <= 0 || unit.reserveAmmo <= 0) return;

      const reloadAmount = Math.min(ammoNeeded, unit.reserveAmmo);
      let nextUnits = [...units];
      nextUnits[unitIdx] = {
        ...unit,
        ap: Math.max(0, unit.ap - 1),
        ammoInClip: unit.ammoInClip + reloadAmount,
        reserveAmmo: unit.reserveAmmo - reloadAmount,
        hasMoved: true,
      };

      let nextRound = round;
      let nextSmokes = state.smokes;
      let nextSelectedUnitId = nextUnits[unitIdx].ap > 0
        ? unit.id
        : getNextAvailableUnitId(nextUnits, round.activeTeam, unit.id);

      if (nextSelectedUnitId === null) {
        const advanced = advanceTurn(round, nextUnits, nextSmokes);
        nextUnits = advanced.units;
        nextRound = advanced.round;
        nextSmokes = advanced.smokes;
        nextSelectedUnitId = getFirstAvailableUnitId(nextUnits, nextRound.activeTeam);
      }

      const movement = getMovementForSelection(nextUnits, nextSelectedUnitId, mapData, nextRound);

      set({
        units: nextUnits,
        round: nextRound,
        selectedUnitId: nextSelectedUnitId,
        executeInterrupt: null,
        hoveredTile: null,
        movementTiles: movement.movementTiles,
        walkableTiles: movement.walkableTiles,
        pathPreview: [],
        inputMode: 'move',
        smokes: nextSmokes,
        feedbackEvents: appendBombTickFeedback(appendFeedback(state.feedbackEvents, 'reload_weapon', {
          team: unit.team,
          unitId: unit.id,
          intensity: reloadAmount >= unit.weapon.clipSize * 0.5 ? 1 : 0.8,
        }), round, nextRound),
      });
      if (nextRound.activeTeam === 'CT' && nextRound.phase !== 'roundend') maybeRunCtAiTurn();
    },

    plantBomb: () => {
      const state = get();
      if (state.isExecuting) return;
      const { selectedUnitId, units, round, map: mapData } = state;
      if (selectedUnitId === null || round.bombPlanted || round.phase === 'setup' || round.phase === 'roundend') return;

      const unitIdx = units.findIndex((unit) => unit.id === selectedUnitId);
      if (unitIdx === -1) return;

      const unit = units[unitIdx];
      const plantSite = getPlantSite(mapData, unit.position);
      if (!unit.alive || unit.team !== 'T' || unit.team !== round.activeTeam) return;
      if (!unit.hasBomb || unit.ap < RULES.plantActionCost || !plantSite) return;

      let nextUnits = [...units];
      nextUnits[unitIdx] = {
        ...unit,
        ap: Math.max(0, unit.ap - RULES.plantActionCost),
        hasBomb: false,
        hasMoved: true,
      };

      let nextRound: RoundState = {
        ...round,
        phase: 'postplant',
        bombPlanted: true,
        bombDefused: false,
        bombPosition: { ...unit.position },
        bombTimer: RULES.bombTimerTurns,
        bombCarrierId: null,
        roundWinner: null,
        winReason: null,
      };
      let nextSmokes = state.smokes;
      let nextSelectedUnitId = getNextAvailableUnitId(nextUnits, round.activeTeam, unit.id);

      if (nextSelectedUnitId === null) {
        const advanced = advanceTurn(nextRound, nextUnits, state.smokes);
        nextUnits = advanced.units;
        nextRound = advanced.round;
        nextSmokes = advanced.smokes;
        nextSelectedUnitId = getFirstAvailableUnitId(nextUnits, nextRound.activeTeam);
      }

      const movement = getMovementForSelection(nextUnits, nextSelectedUnitId, mapData, nextRound);

      set({
        units: nextUnits,
        round: nextRound,
        selectedUnitId: nextSelectedUnitId,
        executeInterrupt: null,
        hoveredTile: null,
        movementTiles: movement.movementTiles,
        walkableTiles: movement.walkableTiles,
        pathPreview: [],
        planningMode: false,
        plannedActions: [],
        inputMode: 'move',
        smokes: nextSmokes,
        feedbackEvents: appendBombTickFeedback(appendFeedback(state.feedbackEvents, 'bomb_plant', {
          team: unit.team,
          unitId: unit.id,
          intensity: plantSite === 'B' ? 1.05 : 1,
        }), round, nextRound),
      });
    },

    defuseBomb: () => {
      const state = get();
      if (state.isExecuting) return;
      const { selectedUnitId, units, round } = state;
      if (selectedUnitId === null || !round.bombPlanted || round.bombDefused || round.phase !== 'postplant') return;

      const unitIdx = units.findIndex((unit) => unit.id === selectedUnitId);
      if (unitIdx === -1) return;

      const unit = units[unitIdx];
      const defuseCost = unit.hasDefuseKit ? RULES.defuseWithKit : RULES.defuseWithoutKit;
      if (!unit.alive || unit.team !== 'CT' || unit.team !== round.activeTeam) return;
      if (!canReachBomb(unit, round.bombPosition) || unit.ap < defuseCost) return;

      const nextUnits = [...units];
      nextUnits[unitIdx] = {
        ...unit,
        ap: Math.max(0, unit.ap - defuseCost),
        hasMoved: true,
      };

      const nextRound: RoundState = {
        ...round,
        phase: 'roundend',
        bombDefused: true,
        bombTimer: Math.max(0, round.bombTimer),
        roundWinner: 'CT',
        winReason: 'defuse',
      };

      set({
        units: nextUnits,
        round: nextRound,
        selectedUnitId: unit.id,
        executeInterrupt: null,
        hoveredTile: null,
        movementTiles: [],
        walkableTiles: [],
        pathPreview: [],
        planningMode: false,
        plannedActions: [],
        inputMode: 'move',
        feedbackEvents: appendFeedback(state.feedbackEvents, 'bomb_defuse', {
          team: unit.team,
          unitId: unit.id,
          intensity: unit.hasDefuseKit ? 1.05 : 0.95,
        }),
      });
    },

    shootUnit: (targetId) => {
      const state = get();
      if (state.isExecuting) return;
      const { selectedUnitId, units, map: mapData, round } = state;
      if (selectedUnitId === null || selectedUnitId === targetId) return;

      const shooterIdx = units.findIndex((unit) => unit.id === selectedUnitId);
      const targetIdx = units.findIndex((unit) => unit.id === targetId);
      if (shooterIdx === -1 || targetIdx === -1) return;

      const shooter = units[shooterIdx];
      const target = units[targetIdx];
      const shotApCost = getWeaponShotApCost(shooter.weapon);
      if (!shooter.alive || !target.alive || shooter.ap < shotApCost || shooter.ammoInClip <= 0) return;
      if (shooter.team !== round.activeTeam || target.team === shooter.team) return;
      if (round.phase === 'setup' && !RULES.setupFiringAllowed) return;

      const shotPreview = getShotPreview(mapData, shooter, target, 0, target.position, state.smokes);
      if (!shotPreview.hasLineOfSight || !shotPreview.inRange) return;

      const event = resolveShot(mapData, shooter, target, target.position, 0, 'direct_fire', state.smokes);
      const distance = tileDistance(shooter.position, target.position);
      let nextUnits = [...units];
      const newTargetHp = event.hit ? Math.max(0, target.hp - event.damage) : target.hp;
      nextUnits[targetIdx] = {
        ...target,
        hp: newTargetHp,
        alive: newTargetHp > 0,
        hasBomb: newTargetHp > 0 ? target.hasBomb : false,
      };
      nextUnits[shooterIdx] = {
        ...shooter,
        ap: Math.max(0, shooter.ap - shotApCost),
        ammoInClip: Math.max(0, shooter.ammoInClip - 1),
        shotsFiredThisTurn: shooter.shotsFiredThisTurn + 1,
        facing: {
          x: Math.round((target.position.x - shooter.position.x) / (distance || 1)),
          y: Math.round((target.position.y - shooter.position.y) / (distance || 1)),
        },
      };

      let nextRound = applyEliminationOutcome(applyBombDrop(round, nextUnits), nextUnits);
      let nextSmokes = state.smokes;
      let nextSelectedUnitId = nextRound.phase === 'roundend'
        ? null
        : nextUnits[shooterIdx].ap > 0
          ? shooter.id
          : getNextAvailableUnitId(nextUnits, round.activeTeam, shooter.id);
      if (nextRound.phase !== 'roundend' && nextSelectedUnitId === null) {
        const advanced = advanceTurn(round, nextUnits, state.smokes);
        nextUnits = advanced.units;
        nextRound = advanced.round;
        nextSmokes = advanced.smokes;
        nextSelectedUnitId = getFirstAvailableUnitId(nextUnits, nextRound.activeTeam);
      }

      const movement = getMovementForSelection(nextUnits, nextSelectedUnitId, mapData, nextRound);

      set({
        units: nextUnits,
        round: nextRound,
        selectedUnitId: nextSelectedUnitId,
        executeInterrupt: null,
        movementTiles: movement.movementTiles,
        walkableTiles: movement.walkableTiles,
        hoveredTile: null,
        pathPreview: [],
        inputMode: 'move',
        smokes: nextSmokes,
        combatLog: [event, ...state.combatLog].slice(0, 8),
        feedbackEvents: appendBombTickFeedback(state.feedbackEvents, round, nextRound),
      });
      if (nextRound.activeTeam === 'CT' && nextRound.phase !== 'roundend') maybeRunCtAiTurn();
    },

    queueMove: (targetTile) => {
      const state = get();
      if (state.isExecuting) return;
      const { selectedUnitId, units, map: mapData, round } = state;
      if (selectedUnitId === null) return;

      const unit = units.find((u) => u.id === selectedUnitId);
      if (!unit || !unit.alive || unit.ap <= 0 || unit.team !== round.activeTeam) return;

      const isInRange = state.walkableTiles.some(
        (t) => t.x === targetTile.x && t.y === targetTile.y
      );
      if (!isInRange) return;

      const existingPlans = state.plannedActions.filter((action) => action.unitId !== unit.id);
      const plannedMovingUnitIds = new Set(existingPlans.filter((action) => action.kind === 'move').map((action) => action.unitId));
      const duplicateTarget = existingPlans.some(
        (action) => action.target.x === targetTile.x && action.target.y === targetTile.y
      );
      const occupiedByStationaryUnit = units.some(
        (other) => other.alive &&
          other.id !== unit.id &&
          other.position.x === targetTile.x &&
          other.position.y === targetTile.y &&
          !plannedMovingUnitIds.has(other.id)
      );
      if (duplicateTarget || occupiedByStationaryUnit) return;

      const path = findPath(mapData, unit.position, targetTile);
      if (path.length === 0) return;

      const rangePerAP = getMoveRangePerAP(unit, round.phase === 'setup');
      const apCost = Math.ceil(path.length / rangePerAP);
      if (apCost > unit.ap) return;

      const plannedAction: PlannedAction = {
        id: `${unit.id}:move`,
        unitId: unit.id,
        team: unit.team,
        kind: 'move',
        executeAtMs: getDefaultExecuteAtMs('move'),
        from: { ...unit.position },
        target: { ...targetTile },
        path,
        apCost,
        summary: `${unit.name} move to ${mapData.grid[targetTile.y]?.[targetTile.x]?.label ?? 'tile'}`,
      };

      const plannedActions = [...existingPlans, plannedAction];
      const nextSelectedUnitId = getNextUnplannedUnitId(
        units,
        round.activeTeam,
        unit.id,
        plannedActions
      ) ?? unit.id;
      const movement = getMovementForSelection(units, nextSelectedUnitId, mapData, round);

      set({
        plannedActions,
        selectedUnitId: nextSelectedUnitId,
        executeInterrupt: null,
        movementTiles: movement.movementTiles,
        walkableTiles: movement.walkableTiles,
        hoveredTile: null,
        pathPreview: [],
        inputMode: 'move',
        feedbackEvents: appendFeedback(state.feedbackEvents, 'plan_add', {
          team: unit.team,
          unitId: unit.id,
          intensity: 0.65,
        }),
      });
    },

    commitPlannedActions: async () => {
      const state = get();
      if (state.isExecuting) return;

      const { round, map: mapData } = state;
      const activePlans = state.plannedActions.filter((action) => action.team === round.activeTeam);
      if (activePlans.length === 0) return;

      const utilityPlans = activePlans.filter(isUtilityAction);
      const movePlans = activePlans.filter((action) => action.kind === 'move');
      const movingUnitIds = new Set(movePlans.map((action) => action.unitId));
      const claimedTargets = new Set<string>();
      let nextUnits = [...state.units];
      let nextSmokes = state.smokes;
      let nextFlashBursts = state.flashBursts.filter((burst) => Date.now() - burst.createdAt < 6000);
      let contactEvent: CombatEvent | null = null;
      let consumedHeldAngleId: string | null = null;
      let contactBeatTimeMs = 0;
      let contactPhaseLabel = 'CONTACT';
      let executeTimeline = createExecuteTimeline({
        id: `${Date.now()}:planned-execute:${round.activeTeam}`,
        source: 'planned_execute',
        activeTeam: round.activeTeam,
        events: sortPlannedActionsByBeat(utilityPlans)
          .map((action) => {
            const unit = state.units.find((candidate) => candidate.id === action.unitId);
            return createPlannedUtilityTimelineEvent(
              action,
              unit?.name ?? 'Unit',
              mapData.grid[action.target.y]?.[action.target.x]?.label ?? `tile ${action.target.x},${action.target.y}`
            );
          })
          .filter((event): event is ExecuteTimelineEvent => Boolean(event)),
      });
      const appendExecuteEvent = (event: ExecuteTimelineEvent) => {
        executeTimeline = {
          ...executeTimeline,
          events: sortExecuteTimelineEvents([...executeTimeline.events, event]),
        };
        set({ currentExecuteTimeline: executeTimeline });
      };
      const runtimes: Array<{
        action: PlannedAction;
        startAtMs: number;
        pathToTravel: TileCoord[];
        crossedAngle: HeldAngle | null;
        contactTile: TileCoord | null;
        rangePerAP: number;
        tilesMoved: number;
        started: boolean;
        stopped: boolean;
      }> = [];

      set({
        planningMode: false,
        isExecuting: true,
        executeInterrupt: null,
        currentExecuteTimeline: executeTimeline,
        hoveredTile: null,
        movementTiles: [],
        walkableTiles: [],
        pathPreview: [],
        inputMode: 'move',
      });

      let executeClockMs = 0;
      let utilityExecuted = false;
      for (const action of sortPlannedActionsByBeat(utilityPlans)) {
        const actionAtMs = getPlannedActionExecuteAtMs(action);
        const delayMs = Math.max(0, actionAtMs - executeClockMs);
        if (delayMs > 0) {
          await wait(delayMs);
          executeClockMs = actionAtMs;
        }

        const unitIdx = nextUnits.findIndex((unit) => unit.id === action.unitId);
        if (unitIdx === -1) continue;

        const unit = nextUnits[unitIdx];
        if (!unit.alive || unit.ap < action.apCost) continue;
        if (!mapData.grid[action.target.y]?.[action.target.x]?.walkable) continue;
        if (round.phase === 'setup' && !RULES.setupUtilityAllowed) continue;

        const throwRange = action.kind === 'smoke' ? SMOKE_THROW_RANGE : FLASH_THROW_RANGE;
        if (tileDistance(unit.position, action.target) > throwRange) continue;

        if (action.kind === 'smoke' && unit.smokeGrenades <= 0) continue;
        if (action.kind === 'flash' && unit.flashbangs <= 0) continue;

        const dx = action.target.x - unit.position.x;
        const dy = action.target.y - unit.position.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;

        if (action.kind === 'smoke') {
          nextUnits = [...nextUnits];
          nextUnits[unitIdx] = {
            ...unit,
            ap: Math.max(0, unit.ap - action.apCost),
            smokeGrenades: Math.max(0, unit.smokeGrenades - 1),
            hasMoved: true,
            facing: { x: Math.round(dx / len), y: Math.round(dy / len) },
          };
          nextSmokes = [
            ...nextSmokes,
            {
              id: `${Date.now()}:${unit.id}:planned-smoke`,
              ownerId: unit.id,
              team: unit.team,
              position: { ...action.target },
              radius: SMOKE_RADIUS,
              remainingTurns: SMOKE_DURATION_TURNS,
            },
          ];
          utilityExecuted = true;
          const timelineEvent = createUtilityResolvedTimelineEvent(
            action,
            unit.name,
            mapData.grid[action.target.y]?.[action.target.x]?.label ?? `tile ${action.target.x},${action.target.y}`
          );
          if (timelineEvent) appendExecuteEvent(timelineEvent);
          set({
            units: nextUnits,
            smokes: nextSmokes,
            flashBursts: nextFlashBursts,
            hoveredTile: null,
            pathPreview: [],
            feedbackEvents: appendFeedback(
              appendFeedback(get().feedbackEvents, 'smoke_throw', {
                team: unit.team,
                unitId: unit.id,
                intensity: 1,
              }),
              'smoke_bloom',
              {
                team: unit.team,
                unitId: unit.id,
                intensity: 0.95,
              }
            ),
          });
        }

        if (action.kind === 'flash') {
          const affectedUnitIds = nextUnits
            .filter((candidate) => (
              candidate.alive &&
              candidate.team !== unit.team &&
              tileDistance(candidate.position, action.target) <= FLASH_RADIUS &&
              hasLineOfSight(mapData, action.target, candidate.position, nextSmokes)
            ))
            .map((candidate) => candidate.id);

          nextUnits = nextUnits.map((candidate, index) => {
            if (index === unitIdx) {
              return {
                ...candidate,
                ap: Math.max(0, candidate.ap - action.apCost),
                flashbangs: Math.max(0, candidate.flashbangs - 1),
                hasMoved: true,
                facing: { x: Math.round(dx / len), y: Math.round(dy / len) },
              };
            }

            if (affectedUnitIds.includes(candidate.id)) {
              return {
                ...candidate,
                flashTurns: Math.max(candidate.flashTurns, FLASH_DURATION_TURNS),
              };
            }

            return candidate;
          });
          nextFlashBursts = [
            {
              id: `${Date.now()}:${unit.id}:planned-flash`,
              ownerId: unit.id,
              team: unit.team,
              position: { ...action.target },
              radius: FLASH_RADIUS,
              affectedUnitIds,
              createdAt: Date.now(),
            },
            ...nextFlashBursts,
          ].slice(0, FLASH_BURST_LOG_LIMIT);
          utilityExecuted = true;
          const timelineEvent = createUtilityResolvedTimelineEvent(
            action,
            unit.name,
            mapData.grid[action.target.y]?.[action.target.x]?.label ?? `tile ${action.target.x},${action.target.y}`,
            affectedUnitIds.length
          );
          if (timelineEvent) appendExecuteEvent(timelineEvent);
          set({
            units: nextUnits,
            smokes: nextSmokes,
            flashBursts: nextFlashBursts,
            hoveredTile: null,
            pathPreview: [],
            feedbackEvents: appendFeedback(
              appendFeedback(get().feedbackEvents, 'flash_throw', {
                team: unit.team,
                unitId: unit.id,
                intensity: affectedUnitIds.length > 0 ? 1.15 : 0.85,
              }),
              'flash_pop',
              {
                team: unit.team,
                unitId: unit.id,
                intensity: affectedUnitIds.length > 0 ? 1.2 : 0.85,
              }
            ),
          });
        }
      }

      const utilitySettleMs = utilityExecuted ? EXECUTION_STEP_MS * 2 : 0;
      if (utilitySettleMs > 0) {
        await wait(utilitySettleMs);
        executeClockMs += utilitySettleMs;
      }

      const firstMoveAtMs = movePlans.length > 0
        ? Math.min(...movePlans.map(getPlannedActionExecuteAtMs))
        : 0;
      if (movePlans.length > 0 && executeClockMs < firstMoveAtMs) {
        const delayMs = firstMoveAtMs - executeClockMs;
        await wait(delayMs);
        executeClockMs = firstMoveAtMs;
      }

      for (const action of movePlans) {
        const unitIdx = nextUnits.findIndex((unit) => unit.id === action.unitId);
        if (unitIdx === -1) continue;

        const unit = nextUnits[unitIdx];
        if (!unit.alive || unit.ap < action.apCost) continue;

        const targetKey = `${action.target.x},${action.target.y}`;
        const duplicateTarget = claimedTargets.has(targetKey);
        const occupiedByStationaryUnit = nextUnits.some(
          (other) => other.alive &&
            other.id !== unit.id &&
            other.position.x === action.target.x &&
            other.position.y === action.target.y &&
            !movingUnitIds.has(other.id)
        );
        if (duplicateTarget || occupiedByStationaryUnit) continue;
        claimedTargets.add(targetKey);

        const canTriggerHeldAngles = round.phase !== 'setup' || RULES.setupOverwatchAllowed;
        const crossedAngle = canTriggerHeldAngles
          ? getCrossingHeldAngles(state.heldAngles, action.path, unit.team)[0] ?? null
          : null;
        const contactTile = crossedAngle ? getFirstCrossingTile(crossedAngle, action.path) : null;
        const rangePerAP = getMoveRangePerAP(unit, round.phase === 'setup');
        const contactIndex = contactTile
          ? action.path.findIndex((tile) => tile.x === contactTile.x && tile.y === contactTile.y)
          : -1;
        const pathToTravel = contactIndex >= 0
          ? action.path.slice(0, contactIndex + 1)
          : action.path;

        runtimes.push({
          action,
          startAtMs: getPlannedActionExecuteAtMs(action),
          pathToTravel,
          crossedAngle,
          contactTile,
          rangePerAP,
          tilesMoved: 0,
          started: false,
          stopped: false,
        });
      }

      if (runtimes.length === 0) {
        let nextRound = round;
        let selectedUnitId = getFirstAvailableUnitId(nextUnits, round.activeTeam);
        if (selectedUnitId === null) {
          const advanced = advanceTurn(round, nextUnits, nextSmokes);
          nextUnits = advanced.units;
          nextRound = advanced.round;
          nextSmokes = advanced.smokes;
          selectedUnitId = getFirstAvailableUnitId(nextUnits, nextRound.activeTeam);
        }
        const movement = getMovementForSelection(nextUnits, selectedUnitId, mapData, nextRound);
        set({
          units: nextUnits,
          round: nextRound,
          selectedUnitId,
          movementTiles: movement.movementTiles,
          walkableTiles: movement.walkableTiles,
          plannedActions: [],
          pathPreview: [],
          isExecuting: false,
          executeInterrupt: null,
          currentExecuteTimeline: null,
          movementRoutes: [],
          lastExecuteTimeline: {
            ...executeTimeline,
            status: 'completed',
            events: sortExecuteTimelineEvents(executeTimeline.events),
          },
          inputMode: 'move',
          smokes: nextSmokes,
          flashBursts: nextFlashBursts,
          feedbackEvents: appendBombTickFeedback(get().feedbackEvents, round, nextRound),
        });
        if (nextRound.activeTeam === 'CT' && nextRound.phase !== 'roundend') maybeRunCtAiTurn();
        return;
      }

      const movementRoutes = runtimes.map((runtime) => createMovementPresentationRoute(
        runtime.action.unitId,
        runtime.pathToTravel,
        'planned_execute',
        Math.max(0, runtime.startAtMs - executeClockMs)
      ));

      set({
        hoveredTile: null,
        movementTiles: [],
        walkableTiles: [],
        pathPreview: [],
        inputMode: 'move',
        movementRoutes,
        feedbackEvents: appendFeedback(state.feedbackEvents, 'move_step', {
          team: round.activeTeam,
          intensity: 0.8,
        }),
      });

      const hasPendingRuntime = () => runtimes.some((runtime) => (
        !runtime.stopped && runtime.tilesMoved < runtime.pathToTravel.length
      ));
      let safetyTicks = 0;
      while (hasPendingRuntime() && safetyTicks < 160) {
        safetyTicks += 1;
        let movedThisStep = false;

        for (const runtime of runtimes) {
          if (runtime.stopped || runtime.tilesMoved >= runtime.pathToTravel.length) continue;
          if (executeClockMs < runtime.startAtMs) continue;

          const unitIdx = nextUnits.findIndex((unit) => unit.id === runtime.action.unitId);
          if (unitIdx === -1) {
            runtime.stopped = true;
            continue;
          }

          const unit = nextUnits[unitIdx];
          if (!unit.alive) {
            runtime.stopped = true;
            continue;
          }

          const destination = runtime.pathToTravel[runtime.tilesMoved];
          const dx = destination.x - unit.position.x;
          const dy = destination.y - unit.position.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          if (!runtime.started) {
            appendExecuteEvent(createMoveStartTimelineEvent(runtime.action, unit.name, 'planned_execute'));
            runtime.started = true;
          }

          nextUnits = [...nextUnits];
          nextUnits[unitIdx] = {
            ...unit,
            position: { ...destination },
            hasMoved: true,
            facing: { x: Math.round(dx / len), y: Math.round(dy / len) },
          };
          runtime.tilesMoved += 1;
          appendExecuteEvent(createMovementBeatTimelineEvent(
            runtime.action,
            unit.name,
            executeClockMs,
            destination,
            mapData.grid[destination.y]?.[destination.x]?.label ?? `tile ${destination.x},${destination.y}`
          ));
          movedThisStep = true;
        }

        if (!movedThisStep) {
          const nextStartAtMs = runtimes.reduce((next, runtime) => {
            if (runtime.stopped || runtime.tilesMoved >= runtime.pathToTravel.length) return next;
            if (runtime.startAtMs <= executeClockMs) return next;
            return Math.min(next, runtime.startAtMs);
          }, Number.POSITIVE_INFINITY);

          if (!Number.isFinite(nextStartAtMs)) break;
          const delayMs = Math.max(0, nextStartAtMs - executeClockMs);
          if (delayMs <= 0) break;
          await wait(delayMs);
          executeClockMs = nextStartAtMs;
          continue;
        }

        if (movedThisStep) {
          set({
            units: nextUnits,
            hoveredTile: null,
            pathPreview: [],
            feedbackEvents: appendFeedback(get().feedbackEvents, 'move_step', {
              team: round.activeTeam,
              intensity: 0.75,
            }),
          });
          await wait(EXECUTION_STEP_MS);
          executeClockMs += EXECUTION_STEP_MS;
        }

        for (const runtime of runtimes) {
          if (!runtime.crossedAngle || !runtime.contactTile || runtime.stopped) continue;
          const unit = nextUnits.find((candidate) => candidate.id === runtime.action.unitId);
          if (!unit || !unit.alive) {
            runtime.stopped = true;
            continue;
          }
          const atContact = unit.position.x === runtime.contactTile.x && unit.position.y === runtime.contactTile.y;
          if (!atContact) continue;

          const attacker = nextUnits.find((candidate) => candidate.id === runtime.crossedAngle!.unitId);
          if (!attacker?.alive) {
            runtime.stopped = true;
            continue;
          }
          if (attacker.ammoInClip <= 0) continue;

          const reactionPreview = getShotPreview(mapData, attacker, unit, runtime.crossedAngle.aimBonus, runtime.contactTile, nextSmokes);
          if (reactionPreview.hasLineOfSight && reactionPreview.inRange) {
            contactEvent = resolveReactionFire(mapData, attacker, unit, runtime.contactTile, runtime.crossedAngle, nextSmokes);
            consumedHeldAngleId = runtime.crossedAngle.id;
            const beat = getPlannedActionBeat(runtime.action);
            contactBeatTimeMs = executeClockMs;
            contactPhaseLabel = beat.phaseLabel;
            const targetIdx = nextUnits.findIndex((candidate) => candidate.id === unit.id);
            if (targetIdx !== -1 && contactEvent.hit) {
              const newHp = Math.max(0, nextUnits[targetIdx].hp - contactEvent.damage);
              nextUnits = [...nextUnits];
              nextUnits[targetIdx] = {
                ...nextUnits[targetIdx],
                hp: newHp,
                alive: newHp > 0,
                hasBomb: newHp > 0 ? nextUnits[targetIdx].hasBomb : false,
              };
            }
            const attackerIdx = nextUnits.findIndex((candidate) => candidate.id === attacker.id);
            if (attackerIdx !== -1) {
              nextUnits = [...nextUnits];
              nextUnits[attackerIdx] = {
                ...nextUnits[attackerIdx],
                ammoInClip: Math.max(0, nextUnits[attackerIdx].ammoInClip - 1),
                shotsFiredThisTurn: nextUnits[attackerIdx].shotsFiredThisTurn + 1,
              };
            }
            runtime.stopped = true;
            break;
          }
        }

        if (contactEvent) break;
      }

      for (const runtime of runtimes) {
        if (runtime.tilesMoved <= 0) continue;
        const unitIdx = nextUnits.findIndex((unit) => unit.id === runtime.action.unitId);
        if (unitIdx === -1) continue;
        const unit = nextUnits[unitIdx];
        const apCost = Math.max(
          1,
          Math.min(runtime.action.apCost, Math.ceil(runtime.tilesMoved / runtime.rangePerAP))
        );
        nextUnits = [...nextUnits];
        nextUnits[unitIdx] = {
          ...unit,
          ap: Math.max(0, unit.ap - apCost),
          hasMoved: true,
        };
      }

      let nextRound = applyEliminationOutcome(applyBombDrop(round, nextUnits), nextUnits);
      let selectedUnitId = nextRound.phase === 'roundend'
        ? null
        : contactEvent
          ? (nextUnits.find((unit) => unit.id === contactEvent!.targetId && unit.alive)?.id ?? getFirstAvailableUnitId(nextUnits, round.activeTeam))
          : getFirstAvailableUnitId(nextUnits, round.activeTeam);
      if (nextRound.phase !== 'roundend' && !contactEvent && selectedUnitId === null) {
        const advanced = advanceTurn(round, nextUnits, nextSmokes);
        nextUnits = advanced.units;
        nextRound = advanced.round;
        nextSmokes = advanced.smokes;
        selectedUnitId = getFirstAvailableUnitId(nextUnits, nextRound.activeTeam);
      }

      selectedUnitId = nextRound.phase === 'roundend'
        ? null
        : getPreferredSelection(
          nextUnits,
          nextRound,
          contactEvent ? selectedUnitId : get().selectedUnitId,
          selectedUnitId
        );
      const movement = getMovementForSelection(nextUnits, selectedUnitId, mapData, nextRound);
      const combatLog = contactEvent
        ? [contactEvent, ...state.combatLog].slice(0, 8)
        : state.combatLog;
      const executeInterrupt = contactEvent
        ? createExecuteInterrupt({
          event: contactEvent,
          map: mapData,
          units: nextUnits,
          round: nextRound,
          smokes: nextSmokes,
          source: 'planned_execute',
          beatTimeMs: contactBeatTimeMs,
          phaseLabel: contactPhaseLabel,
          timelineEvents: executeTimeline.events,
        })
        : null;
      const finalExecuteTimelineEvents = executeInterrupt
        ? [...executeTimeline.events, ...executeInterrupt.timelineEvents.filter((event) => (
          !executeTimeline.events.some((existingEvent) => existingEvent.id === event.id)
        ))]
        : executeTimeline.events;
      const finalExecuteTimeline: ExecuteTimeline = {
        ...executeTimeline,
        status: contactEvent ? 'interrupted' : 'completed',
        events: sortExecuteTimelineEvents(finalExecuteTimelineEvents),
      };

      set({
        units: nextUnits,
        round: nextRound,
        selectedUnitId,
        hoveredTile: null,
        movementTiles: movement.movementTiles,
        walkableTiles: movement.walkableTiles,
        pathPreview: [],
        plannedActions: [],
        isExecuting: false,
        currentExecuteTimeline: null,
        movementRoutes: [],
        lastExecuteTimeline: finalExecuteTimeline,
        inputMode: contactEvent ? 'shoot' : 'move',
        heldAngles: state.heldAngles.filter((angle) => (
          !movingUnitIds.has(angle.unitId) &&
          angle.id !== consumedHeldAngleId
        )),
        smokes: nextSmokes,
        flashBursts: nextFlashBursts,
        combatLog,
        executeInterrupt,
        feedbackEvents: appendBombTickFeedback(appendFeedback(get().feedbackEvents, 'move_complete', {
          team: round.activeTeam,
          intensity: contactEvent ? 1.2 : 1,
        }), round, nextRound),
      });
      if (nextRound.activeTeam === 'CT' && nextRound.phase !== 'roundend') maybeRunCtAiTurn();
    },

    clearPlannedActions: () => {
      set({ plannedActions: [], pathPreview: [] });
    },

    setPlannedActionTiming: (actionId, executeAtMs) => {
      if (get().isExecuting) return;
      set((state) => ({
        plannedActions: state.plannedActions.map((action) => (
          action.id === actionId
            ? { ...action, executeAtMs: clampExecuteAtMs(action.kind, executeAtMs) }
            : action
        )),
      }));
    },

    setPlanningMode: (enabled) => {
      if (get().isExecuting) return;
      set({
        planningMode: enabled,
        plannedActions: enabled ? get().plannedActions : [],
        inputMode: 'move',
        pathPreview: [],
      });
    },

    applyMetaDefaultSetup: () => {
      const state = get();
      if (state.isExecuting || state.round.phase !== 'setup') return;

      const result = applyMetaDefault(state.map, state.units, state.round.activeTeam);
      const selectedUnitId = isUnitSelectable(result.units, state.round.activeTeam, state.selectedUnitId)
        ? state.selectedUnitId
        : null;
      const movement = getMovementForSelection(result.units, selectedUnitId, state.map, state.round);

      set({
        units: result.units,
        selectedUnitId,
        hoveredTile: null,
        movementTiles: movement.movementTiles,
        walkableTiles: movement.walkableTiles,
        pathPreview: [],
        planningMode: false,
        plannedActions: [],
        inputMode: 'move',
        executeInterrupt: null,
        currentExecuteTimeline: null,
        lastExecuteTimeline: null,
        movementRoutes: [],
        guidanceEvent: createGuidanceEvent(
          `Applied ${result.metaDefault.id}`,
          result.spawnSummary,
          'hint'
        ),
        feedbackEvents: appendFeedback(state.feedbackEvents, 'select_unit', {
          team: state.round.activeTeam,
          unitId: selectedUnitId ?? undefined,
          intensity: 0.8,
        }),
      });
    },

    finishUnit: () => {
      const state = get();
      if (state.isExecuting) return;
      const { selectedUnitId, units, round, map: mapData } = state;
      if (selectedUnitId === null) return;

      const unitIdx = units.findIndex((u) => u.id === selectedUnitId);
      if (unitIdx === -1) return;

      const unit = units[unitIdx];
      if (!unit.alive || unit.team !== round.activeTeam) return;

      let nextUnits = [...units];
      nextUnits[unitIdx] = {
        ...unit,
        ap: 0,
        hasMoved: true,
      };

      let nextRound = round;
      let nextSmokes = state.smokes;
      let nextSelectedUnitId = getNextAvailableUnitId(nextUnits, round.activeTeam, unit.id);
      if (nextSelectedUnitId === null) {
        const advanced = advanceTurn(round, nextUnits, state.smokes);
        nextUnits = advanced.units;
        nextRound = advanced.round;
        nextSmokes = advanced.smokes;
        nextSelectedUnitId = getFirstAvailableUnitId(nextUnits, nextRound.activeTeam);
      }

      let movementTiles: MovementTile[] = [];
      let walkableTiles: TileCoord[] = [];
      if (nextSelectedUnitId !== null) {
        const nextUnit = nextUnits.find((u) => u.id === nextSelectedUnitId);
        if (nextUnit) {
          const movement = getMovementState(nextUnit, mapData, nextRound.phase === 'setup');
          movementTiles = movement.movementTiles;
          walkableTiles = movement.walkableTiles;
        }
      }

      set({
        units: nextUnits,
        round: nextRound,
        selectedUnitId: nextSelectedUnitId,
        executeInterrupt: null,
        hoveredTile: null,
        movementTiles,
        walkableTiles,
        pathPreview: [],
        inputMode: 'move',
        smokes: nextSmokes,
        feedbackEvents: appendBombTickFeedback(appendFeedback(state.feedbackEvents, 'turn_change', {
          team: nextRound.activeTeam,
          unitId: unit.id,
          intensity: 0.8,
        }), round, nextRound),
      });
      if (nextRound.activeTeam === 'CT' && nextRound.phase !== 'roundend') maybeRunCtAiTurn();
    },

    endTurn: () => {
      const state = get();
      if (state.isExecuting) return;
      const advanced = advanceTurn(state.round, state.units, state.smokes);
      const selectedUnitId = getFirstAvailableUnitId(advanced.units, advanced.round.activeTeam);
      let movementTiles: MovementTile[] = [];
      let walkableTiles: TileCoord[] = [];

      if (selectedUnitId !== null) {
        const unit = advanced.units.find((u) => u.id === selectedUnitId);
        if (unit) {
          const movement = getMovementState(unit, state.map, advanced.round.phase === 'setup');
          movementTiles = movement.movementTiles;
          walkableTiles = movement.walkableTiles;
        }
      }

      set({
        units: advanced.units,
        round: advanced.round,
        selectedUnitId,
        executeInterrupt: null,
        hoveredTile: null,
        walkableTiles,
        movementTiles,
        pathPreview: [],
        plannedActions: [],
        isExecuting: false,
        inputMode: 'move',
        smokes: advanced.smokes,
        aiStatus: null,
        feedbackEvents: appendBombTickFeedback(appendFeedback(state.feedbackEvents, 'turn_change', {
          team: advanced.round.activeTeam,
          intensity: 1,
        }), state.round, advanced.round),
      });
      if (advanced.round.activeTeam === 'CT' && advanced.round.phase !== 'roundend') maybeRunCtAiTurn();
    },

    runCtAiTurn: async () => {
      const state = get();
      if (state.isExecuting || state.round.activeTeam !== 'CT') return;

      let nextUnits = [...state.units];
      const mapData = state.map;
      const round = state.round;
      let heldAngles = state.heldAngles.filter((angle) => angle.team !== 'CT');
      let combatLog = state.combatLog;
      let nextSmokes = state.smokes;

      set({
        isExecuting: true,
        executeInterrupt: null,
        aiStatus: { team: 'CT', message: 'CT reading the map' },
        selectedUnitId: null,
        hoveredTile: null,
        movementTiles: [],
        walkableTiles: [],
        pathPreview: [],
        plannedActions: [],
        planningMode: false,
        inputMode: 'move',
        feedbackEvents: appendFeedback(state.feedbackEvents, 'ai_start', {
          team: 'CT',
          intensity: 1,
        }),
      });

      await wait(AI_THINK_MS);

      const ctUnitIds = nextUnits
        .filter((unit) => unit.alive && unit.team === 'CT' && unit.ap > 0)
        .map((unit) => unit.id);

      for (const unitId of ctUnitIds) {
        let unitIdx = nextUnits.findIndex((unit) => unit.id === unitId);
        if (unitIdx === -1) continue;

        let unit = nextUnits[unitIdx];
        if (!unit.alive || unit.team !== 'CT' || unit.ap <= 0) continue;

        set({
          aiStatus: { team: 'CT', message: `${unit.role.displayName} ${unit.name} responding` },
          selectedUnitId: unit.id,
          feedbackEvents: appendFeedback(get().feedbackEvents, 'select_unit', {
            team: 'CT',
            unitId: unit.id,
            intensity: 0.45,
          }),
        });

        await wait(AI_THINK_MS);

        const bestShot = round.phase !== 'setup'
          ? getBestAiShot(mapData, unit, nextUnits, nextSmokes)
          : null;

        if (bestShot && bestShot.preview.hitChance >= 25) {
          const targetIdx = nextUnits.findIndex((candidate) => candidate.id === bestShot.target.id);
          if (targetIdx !== -1) {
            const shotApCost = getWeaponShotApCost(unit.weapon);
            const event = resolveShot(mapData, unit, bestShot.target, bestShot.target.position, 0, 'direct_fire', nextSmokes);
            const distance = tileDistance(unit.position, bestShot.target.position);
            const newTargetHp = event.hit ? Math.max(0, nextUnits[targetIdx].hp - event.damage) : nextUnits[targetIdx].hp;

            nextUnits = [...nextUnits];
            nextUnits[targetIdx] = {
              ...nextUnits[targetIdx],
              hp: newTargetHp,
              alive: newTargetHp > 0,
              hasBomb: newTargetHp > 0 ? nextUnits[targetIdx].hasBomb : false,
            };
            nextUnits[unitIdx] = {
              ...unit,
              ap: Math.max(0, unit.ap - shotApCost),
              ammoInClip: Math.max(0, unit.ammoInClip - 1),
              shotsFiredThisTurn: unit.shotsFiredThisTurn + 1,
              hasMoved: true,
              facing: {
                x: Math.round((bestShot.target.position.x - unit.position.x) / (distance || 1)),
                y: Math.round((bestShot.target.position.y - unit.position.y) / (distance || 1)),
              },
            };

            combatLog = [event, ...combatLog].slice(0, 8);
            set({
              units: nextUnits,
              combatLog,
              aiStatus: { team: 'CT', message: `${unit.name} took an opening shot` },
            });
            await wait(AI_THINK_MS + 120);
            continue;
          }
        }

        const rangePerAp = getMoveRangePerAP(unit, round.phase === 'setup');
        const anchor = getCtAiAnchor(unit, mapData);
        const moveBudget = round.phase === 'setup'
          ? rangePerAp * unit.ap
          : (tileDistance(unit.position, anchor) > 3 ? rangePerAp : 0);
        const destination = moveBudget > 0
          ? getReachableAiDestination(mapData, nextUnits, unit, anchor, moveBudget)
          : null;

        if (destination && (destination.x !== unit.position.x || destination.y !== unit.position.y)) {
          const path = findPath(mapData, unit.position, destination);
          const pathToTravel = path.slice(0, moveBudget);
          const movementRoute = createMovementPresentationRoute(unit.id, pathToTravel, 'ct_ai', 0, {
            stepMs: AI_EXECUTION_STEP_MS,
          });
          set({ movementRoutes: [movementRoute] });

          for (const step of pathToTravel) {
            unitIdx = nextUnits.findIndex((candidate) => candidate.id === unit.id);
            if (unitIdx === -1) break;

            unit = nextUnits[unitIdx];
            if (!unit.alive) break;

            const dx = step.x - unit.position.x;
            const dy = step.y - unit.position.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;

            nextUnits = [...nextUnits];
            nextUnits[unitIdx] = {
              ...unit,
              position: { ...step },
              hasMoved: true,
              facing: { x: Math.round(dx / len), y: Math.round(dy / len) },
            };

            set({
              units: nextUnits,
              selectedUnitId: unit.id,
              pathPreview: [],
              feedbackEvents: appendFeedback(get().feedbackEvents, 'move_step', {
                team: 'CT',
                unitId: unit.id,
                intensity: 0.55,
              }),
            });
            await wait(AI_EXECUTION_STEP_MS);
          }

          unitIdx = nextUnits.findIndex((candidate) => candidate.id === unit.id);
          if (unitIdx === -1) continue;
          unit = nextUnits[unitIdx];
          const apSpent = round.phase === 'setup'
            ? unit.ap
            : Math.min(unit.ap, Math.max(1, Math.ceil(pathToTravel.length / rangePerAp)));
          nextUnits = [...nextUnits];
          nextUnits[unitIdx] = {
            ...unit,
            ap: Math.max(0, unit.ap - apSpent),
            hasMoved: true,
          };
          unit = nextUnits[unitIdx];
        }

        if (round.phase !== 'setup' && unit.ap > 0 && unit.ammoInClip > 0) {
          const holdTarget = getCtAiHoldTarget(unit, nextUnits, mapData);
          const maxTiles = Math.max(4, Math.min(unit.weapon.rangeMax, 24));
          const laneTiles = getWatchedLane(mapData, unit.position, holdTarget, maxTiles);
          const dx = holdTarget.x - unit.position.x;
          const dy = holdTarget.y - unit.position.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;

          nextUnits = [...nextUnits];
          nextUnits[unitIdx] = {
            ...unit,
            ap: 0,
            hasMoved: true,
            facing: { x: Math.round(dx / len), y: Math.round(dy / len) },
          };

          if (laneTiles.length > 0) {
            heldAngles = [
              ...heldAngles.filter((angle) => angle.unitId !== unit.id),
              {
                id: `${unit.id}:ai-hold:${Date.now()}`,
                unitId: unit.id,
                team: 'CT',
                origin: { ...unit.position },
                target: { ...holdTarget },
                laneTiles,
                remainingShots: 1,
                aimBonus: unit.role.id === 'awper' ? 15 : 5,
              },
            ];
          }

          set({
            units: nextUnits,
            heldAngles,
            aiStatus: { team: 'CT', message: `${unit.name} is holding contact` },
            feedbackEvents: appendFeedback(get().feedbackEvents, 'hold_angle', {
              team: 'CT',
              unitId: unit.id,
              intensity: 0.55,
            }),
          });
          await wait(AI_THINK_MS);
        }
      }

      const advanced = advanceTurn(round, nextUnits, nextSmokes);
      nextUnits = advanced.units;
      nextSmokes = advanced.smokes;
      const selectedUnitId = getFirstAvailableUnitId(nextUnits, advanced.round.activeTeam);
      const movement = getMovementForSelection(nextUnits, selectedUnitId, mapData, advanced.round);

      set({
        units: nextUnits,
        round: advanced.round,
        selectedUnitId,
        executeInterrupt: null,
        hoveredTile: null,
        movementTiles: movement.movementTiles,
        walkableTiles: movement.walkableTiles,
        pathPreview: [],
        plannedActions: [],
        planningMode: false,
        isExecuting: false,
        inputMode: 'move',
        heldAngles,
        smokes: nextSmokes,
        combatLog,
        aiStatus: null,
        movementRoutes: [],
        feedbackEvents: appendBombTickFeedback(appendFeedback(get().feedbackEvents, 'ai_end', {
          team: 'CT',
          intensity: 1,
        }), round, advanced.round),
      });
    },

    initGame: () => {
      const newMap = createInfernoMap();
      const newUnits = createRoundUnits(newMap);
      set({
        map: newMap,
        units: newUnits,
        round: {
          phase: 'setup',
          turn: 1,
          activeTeam: 'T',
          bombPlanted: false,
          bombDefused: false,
          bombPosition: null,
          bombTimer: RULES.bombTimerTurns,
          bombCarrierId: 0,
          roundTimer: RULES.roundTimeLimitTurns,
          roundWinner: null,
          winReason: null,
        },
        match: {
          scoreT: 0,
          scoreCT: 0,
          currentRound: 1,
          maxRounds: RULES.roundsPerHalf * 2,
          isOvertime: false,
          halfSwapped: false,
        },
        selectedUnitId: null,
        hoveredTile: null,
        walkableTiles: [],
        movementTiles: [],
        pathPreview: [],
        planningMode: false,
        plannedActions: [],
        isExecuting: false,
        inputMode: 'move',
        heldAngles: [],
        smokes: [],
        flashBursts: [],
        combatLog: [],
        executeInterrupt: null,
        currentExecuteTimeline: null,
        lastExecuteTimeline: null,
        movementRoutes: [],
        feedbackEvents: [],
        guidanceEvent: null,
        aiStatus: null,
      });
    },

    startNextRound: () => {
      const state = get();
      if (state.isExecuting) return;

      const newMap = createInfernoMap();
      const newUnits = createRoundUnits(newMap);
      const winner = state.round.roundWinner;

      set({
        map: newMap,
        units: newUnits,
        round: {
          phase: 'setup',
          turn: 1,
          activeTeam: 'T',
          bombPlanted: false,
          bombDefused: false,
          bombPosition: null,
          bombTimer: RULES.bombTimerTurns,
          bombCarrierId: 0,
          roundTimer: RULES.roundTimeLimitTurns,
          roundWinner: null,
          winReason: null,
        },
        match: {
          ...state.match,
          scoreT: state.match.scoreT + (winner === 'T' ? 1 : 0),
          scoreCT: state.match.scoreCT + (winner === 'CT' ? 1 : 0),
          currentRound: Math.min(state.match.currentRound + 1, state.match.maxRounds),
        },
        selectedUnitId: null,
        hoveredTile: null,
        walkableTiles: [],
        movementTiles: [],
        pathPreview: [],
        planningMode: false,
        plannedActions: [],
        isExecuting: false,
        inputMode: 'move',
        heldAngles: [],
        smokes: [],
        flashBursts: [],
        combatLog: [],
        executeInterrupt: null,
        currentExecuteTimeline: null,
        lastExecuteTimeline: null,
        movementRoutes: [],
        feedbackEvents: [],
        guidanceEvent: null,
        aiStatus: null,
      });
    },

    startContactDrill: () => {
      if (get().isExecuting) return;
      const mapData = createInfernoMap();
      const nextUnits = createUnits(mapData);
      const tEntryId = 0;
      const ctAnchorId = 5;
      const tStart = findNearestWalkable(mapData, { x: 43, y: 57 });
      const ctHold = findNearestWalkable(mapData, { x: 43, y: 67 });
      const holdTarget = findNearestWalkable(mapData, { x: 43, y: 57 });

      nextUnits[tEntryId] = {
        ...nextUnits[tEntryId],
        position: tStart,
        ap: nextUnits[tEntryId].maxAp,
        smokeGrenades: 1,
        facing: { x: 1, y: 1 },
      };
      nextUnits[ctAnchorId] = {
        ...nextUnits[ctAnchorId],
        position: ctHold,
        ap: 0,
        facing: { x: -1, y: -1 },
      };

      const heldAngle: HeldAngle = {
        id: `${ctAnchorId}:hold`,
        unitId: ctAnchorId,
        team: 'CT',
        origin: { ...ctHold },
        target: { ...holdTarget },
        laneTiles: getWatchedLane(
          mapData,
          ctHold,
          holdTarget,
          Math.max(4, Math.min(nextUnits[ctAnchorId].weapon.rangeMax, 24))
        ),
        remainingShots: 1,
        aimBonus: 5,
      };

      const round: RoundState = {
        phase: 'combat',
        turn: RULES.setupPhaseTurns + 1,
        activeTeam: 'T',
        bombPlanted: false,
        bombDefused: false,
        bombPosition: null,
        bombTimer: RULES.bombTimerTurns,
        bombCarrierId: tEntryId,
        roundTimer: RULES.roundTimeLimitTurns,
        roundWinner: null,
        winReason: null,
      };
      const movement = getMovementForSelection(nextUnits, tEntryId, mapData, round);

      set({
        map: mapData,
        units: nextUnits,
        round,
        selectedUnitId: tEntryId,
        hoveredTile: null,
        walkableTiles: movement.walkableTiles,
        movementTiles: movement.movementTiles,
        pathPreview: [],
        planningMode: true,
        plannedActions: [],
        isExecuting: false,
        inputMode: 'move',
        heldAngles: [heldAngle],
        smokes: [],
        flashBursts: [],
        combatLog: [],
        executeInterrupt: null,
        currentExecuteTimeline: null,
        lastExecuteTimeline: null,
        movementRoutes: [],
        feedbackEvents: [],
        guidanceEvent: null,
        aiStatus: null,
      });
    },

    startDuelLab: () => {
      if (get().isExecuting) return;
      const mapData = createInfernoMap();
      const tDuelistId = 0;
      const ctDuelistId = 6;
      const tStart = findNearestWalkable(mapData, { x: 43, y: 61 });
      const ctStart = findNearestWalkable(mapData, { x: 43, y: 69 });
      const baseUnits = createUnits(mapData);
      const tDuelist = baseUnits.find((unit) => unit.id === tDuelistId);
      const ctDuelist = baseUnits.find((unit) => unit.id === ctDuelistId);
      if (!tDuelist || !ctDuelist) return;

      const nextUnits: Unit[] = [
        {
          ...tDuelist,
          hp: tDuelist.maxHp,
          position: tStart,
          ap: tDuelist.maxAp,
          alive: true,
          shotsFiredThisTurn: 0,
          hasMoved: false,
          hasBomb: true,
          smokeGrenades: 1,
          flashbangs: 1,
          flashTurns: 0,
          ammoInClip: tDuelist.weapon.clipSize,
          reserveAmmo: tDuelist.weapon.clipSize * 3,
          facing: { x: 0, y: 1 },
        },
        {
          ...ctDuelist,
          hp: ctDuelist.maxHp,
          position: ctStart,
          ap: ctDuelist.maxAp,
          alive: true,
          shotsFiredThisTurn: 0,
          hasMoved: false,
          hasBomb: false,
          smokeGrenades: 0,
          flashbangs: 0,
          flashTurns: 0,
          ammoInClip: ctDuelist.weapon.clipSize,
          reserveAmmo: ctDuelist.weapon.clipSize * 3,
          facing: { x: 0, y: -1 },
        },
      ];

      const round: RoundState = {
        phase: 'combat',
        turn: RULES.setupPhaseTurns + 1,
        activeTeam: 'T',
        bombPlanted: false,
        bombDefused: false,
        bombPosition: null,
        bombTimer: RULES.bombTimerTurns,
        bombCarrierId: tDuelistId,
        roundTimer: RULES.roundTimeLimitTurns,
        roundWinner: null,
        winReason: null,
      };
      const movement = getMovementForSelection(nextUnits, tDuelistId, mapData, round);

      set({
        map: mapData,
        units: nextUnits,
        round,
        selectedUnitId: tDuelistId,
        hoveredTile: null,
        walkableTiles: movement.walkableTiles,
        movementTiles: movement.movementTiles,
        pathPreview: [],
        planningMode: false,
        plannedActions: [],
        isExecuting: false,
        inputMode: 'move',
        heldAngles: [],
        smokes: [],
        flashBursts: [],
        combatLog: [],
        executeInterrupt: null,
        currentExecuteTimeline: null,
        lastExecuteTimeline: null,
        movementRoutes: [],
        feedbackEvents: [],
        guidanceEvent: null,
        aiStatus: null,
      });
    },
  };
});

declare global {
  interface Window {
    __CS_TACTICS_STORE__?: typeof useGameStore;
  }
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.__CS_TACTICS_STORE__ = useGameStore;
}
