// ============================================================
// HUD: Professional game overlay for CS2 Tactics.
//
// Components:
//   TopBar — T/CT scores, round, phase, turn counter
//   SelectedUnitPanel — role, stats, weapon, AP remaining
//   TeamRoster — mini icons for all 5 units of active team
//   CommandBar — prominent planning, execute, and end-turn controls
//   PhaseAnnouncement — center screen phase label
//   MapLabel — bottom-right Inferno branding
//   TileInfo — bottom-center hovered tile callout name
// ============================================================
import { useGameStore } from '../game/store';
import type { MapData, TileCoord } from '../game/types';
import { getCrossingHeldAngles } from '../game/threats';
import { getShotPreview } from '../game/combat';
import { RULES } from '../game/config/rules';

const PHASE_LABELS: Record<string, string> = {
  buy: 'BUY PHASE',
  setup: 'SETUP PHASE',
  combat: 'COMBAT',
  postplant: 'BOMB PLANTED',
  roundend: 'ROUND OVER',
};

const PHASE_COLORS: Record<string, string> = {
  buy: '#44aa44',
  setup: '#aa8833',
  combat: '#cc3333',
  postplant: '#cc3333',
  roundend: '#888888',
};

const ROLE_ICONS: Record<string, string> = {
  awper: 'AWP',
  entry: 'ENT',
  igl: 'IGL',
  support: 'SUP',
  lurker: 'LRK',
};

function getDestinationCover(map: MapData, tile: TileCoord): {
  label: string;
  value: number;
  color: string;
} {
  const neighbors = [
    { x: tile.x, y: tile.y - 1 },
    { x: tile.x + 1, y: tile.y },
    { x: tile.x, y: tile.y + 1 },
    { x: tile.x - 1, y: tile.y },
  ];

  let best = 0;
  for (const n of neighbors) {
    const adjacent = map.grid[n.y]?.[n.x];
    if (!adjacent) continue;
    if (adjacent.type === 'cover_full' || adjacent.type === 'wall') best = Math.max(best, 40);
    if (adjacent.type === 'cover_half') best = Math.max(best, 20);
  }

  if (best >= 40) return { label: 'FULL COVER', value: 40, color: '#58ff9a' };
  if (best >= 20) return { label: 'HALF COVER', value: 20, color: '#f2c94c' };
  return { label: 'OPEN', value: 0, color: '#ff6b6b' };
}

export function HUD() {
  return (
    <div style={{
      position: 'fixed', inset: 0, pointerEvents: 'none',
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      zIndex: 10,
    }}>
      <TopBar />
      <SelectedUnitPanel />
      <TeamRoster />
      <CombatLogPanel />
      <ContactBreakPanel />
      <ExecutePlanner />
      <CommandBar />
      <MovementLegend />
      <PhaseAnnouncement />
      <TileInfo />
      <MapLabel />
    </div>
  );
}

function ContactBreakPanel() {
  const combatLog = useGameStore((s) => s.combatLog);
  const units = useGameStore((s) => s.units);
  const map = useGameStore((s) => s.map);
  const event = combatLog[0];
  if (!event || event.type !== 'reaction_fire') return null;

  const attacker = units.find((unit) => unit.id === event.attackerId);
  const target = units.find((unit) => unit.id === event.targetId);
  const tile = map.grid[event.tile.y]?.[event.tile.x];
  const tileLabel = tile?.label ?? 'contact tile';

  return (
    <div style={{
      position: 'absolute',
      top: 184,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'min(360px, calc(100vw - 40px))',
      background: 'rgba(10, 7, 10, 0.94)',
      border: '1px solid rgba(255,78,106,0.45)',
      borderLeft: '3px solid #ff4e6a',
      borderRadius: 6,
      padding: '10px 12px',
      pointerEvents: 'none',
      boxShadow: '0 10px 28px rgba(0,0,0,0.38)',
    }}>
      <div style={{
        color: '#ff6b82',
        fontSize: 10,
        fontWeight: 950,
        letterSpacing: 1.8,
        textTransform: 'uppercase',
        marginBottom: 5,
      }}>
        Contact Break
      </div>
      <div style={{ color: '#ddd', fontSize: 11, lineHeight: 1.35, fontWeight: 750 }}>
        {target?.name ?? event.targetName} stopped at {tileLabel}
      </div>
      <div style={{ color: '#8e7d82', fontSize: 10, lineHeight: 1.35, marginTop: 3 }}>
        {attacker?.role.displayName ?? 'Enemy'} {event.attackerName} fired from a held angle - {event.hitChance}% - {event.hit ? `${event.damage} damage` : 'miss'}
      </div>
    </div>
  );
}

function CombatLogPanel() {
  const combatLog = useGameStore((s) => s.combatLog);
  if (combatLog.length === 0) return null;

  return (
    <div style={{
      position: 'absolute',
      top: 132,
      right: 20,
      width: 240,
      background: 'rgba(8, 8, 12, 0.9)',
      border: '1px solid #3a2f35',
      borderLeft: '3px solid #ff4e6a',
      borderRadius: 6,
      padding: '9px 10px',
      pointerEvents: 'none',
      display: 'grid',
      gap: 5,
    }}>
      <div style={{
        color: '#ff6b82',
        fontSize: 10,
        fontWeight: 900,
        letterSpacing: 1.2,
        textTransform: 'uppercase',
      }}>
        Contact
      </div>
      {combatLog.slice(0, 3).map((event) => (
        <div key={event.id} style={{ color: '#ccc', fontSize: 10, lineHeight: 1.35 }}>
          <span style={{ color: event.hit ? '#ffdadf' : '#aaa', fontWeight: 800 }}>
            {event.hit ? 'HIT' : 'MISS'}
          </span>
          <span style={{ color: '#666', marginLeft: 6 }}>
            {event.hitChance}%
          </span>
          <span style={{ marginLeft: 6 }}>
            {event.summary}
          </span>
        </div>
      ))}
    </div>
  );
}

function ExecutePlanner() {
  const planningMode = useGameStore((s) => s.planningMode);
  const plannedActions = useGameStore((s) => s.plannedActions);
  const heldAngles = useGameStore((s) => s.heldAngles);
  const units = useGameStore((s) => s.units);
  const smokes = useGameStore((s) => s.smokes);
  const map = useGameStore((s) => s.map);
  const activeTeam = useGameStore((s) => s.round.activeTeam);
  const phase = useGameStore((s) => s.round.phase);
  const clearPlannedActions = useGameStore((s) => s.clearPlannedActions);
  const teamColor = activeTeam === 'T' ? '#b8860b' : '#2255aa';

  if (!planningMode && plannedActions.length === 0) return null;

  return (
    <div style={{
      position: 'absolute',
      top: 132,
      left: 20,
      width: 220,
      background: 'rgba(8, 8, 12, 0.9)',
      border: `1px solid ${planningMode ? `${teamColor}88` : '#2a2f3a'}`,
      borderRadius: 6,
      padding: 10,
      pointerEvents: 'auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div
          style={{
            flex: 1,
            color: planningMode ? '#fff' : '#aaa',
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          Execute Queue
        </div>
        <button
          onClick={clearPlannedActions}
          disabled={plannedActions.length === 0}
          style={{
            border: '1px solid #333',
            background: plannedActions.length > 0 ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
            color: plannedActions.length > 0 ? '#ddd' : '#555',
            borderRadius: 4,
            padding: '7px 8px',
            cursor: plannedActions.length > 0 ? 'pointer' : 'default',
            fontSize: 10,
            fontWeight: 800,
          }}
        >
          CLR
        </button>
      </div>

      {plannedActions.length > 0 && (
        <>
          <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
            {plannedActions.map((action) => {
              const unit = units.find((u) => u.id === action.unitId);
              const isWatched = phase !== 'setup' && getCrossingHeldAngles(heldAngles, action.path, action.team).length > 0;
              const isDanger = Boolean(unit && phase !== 'setup' && units.some((enemy) => {
                if (!enemy.alive || enemy.team === action.team) return false;
                const preview = getShotPreview(map, enemy, unit, 0, action.target, smokes);
                return preview.hasLineOfSight && preview.inRange;
              }));
              const statusColor = isWatched ? '#ff6b82' : (isDanger ? '#ff9d3d' : (action.apCost <= 1 ? '#58ff9a' : '#f2c94c'));
              const statusLabel = isWatched ? 'WATCH' : (isDanger ? 'DANGER' : `${action.apCost}AP`);
              return (
                <div
                  key={action.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    color: '#aaa',
                    fontSize: 10,
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    paddingTop: 4,
                  }}
                >
                  <span style={{ color: teamColor, fontWeight: 800, minWidth: 28 }}>
                    {ROLE_ICONS[unit?.role.id ?? 'entry']}
                  </span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {unit?.name ?? 'Unit'} move
                  </span>
                  <span style={{ color: statusColor, fontWeight: 800 }}>
                    {statusLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
      {plannedActions.length === 0 && (
        <div style={{ color: '#666', fontSize: 10, lineHeight: 1.4, marginTop: 8 }}>
          Select a unit, then click destination tiles to queue synchronized moves.
        </div>
      )}
    </div>
  );
}

function MovementLegend() {
  const selectedId = useGameStore((s) => s.selectedUnitId);
  const movementTiles = useGameStore((s) => s.movementTiles);

  if (selectedId === null || movementTiles.length === 0) return null;

  return (
    <div style={{
      position: 'absolute', bottom: 116, right: 20,
      background: 'rgba(8, 8, 12, 0.9)',
      border: '1px solid #2a2f3a',
      borderRadius: 6,
      padding: '8px 10px',
      pointerEvents: 'none',
      display: 'grid',
      gap: 5,
      minWidth: 170,
    }}>
      <LegendRow color="#39e58c" label="1 AP move" note="shoot remains" />
      <LegendRow color="#f2c94c" label="2 AP move" note="full commit" />
    </div>
  );
}

function LegendRow({ color, label, note }: { color: string; label: string; note: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        width: 11, height: 11, borderRadius: 2,
        background: color,
        boxShadow: `0 0 8px ${color}77`,
        flex: '0 0 auto',
      }} />
      <span style={{ color: '#ddd', fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>
        {label}
      </span>
      <span style={{ color: '#666', fontSize: 9, marginLeft: 'auto' }}>
        {note}
      </span>
    </div>
  );
}

// --- Top bar ---
function TopBar() {
  const match = useGameStore((s) => s.match);
  const round = useGameStore((s) => s.round);

  return (
    <div style={{
      position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', alignItems: 'stretch',
    }}>
      {/* T score */}
      <div style={{
        background: 'rgba(184, 134, 11, 0.9)', padding: '6px 24px',
        borderRadius: '0 0 0 8px', minWidth: 60, textAlign: 'center',
        borderBottom: round.activeTeam === 'T' ? '3px solid #f4c430' : '3px solid transparent',
      }}>
        <div style={{ color: '#fff', fontSize: 10, fontWeight: 600, letterSpacing: 1.5, opacity: 0.9 }}>
          TERRORISTS
        </div>
        <div style={{ color: '#fff', fontSize: 28, fontWeight: 800, fontFamily: "'Courier New', monospace" }}>
          {match.scoreT}
        </div>
      </div>

      {/* Center info */}
      <div style={{
        background: 'rgba(8, 8, 12, 0.95)', padding: '6px 24px', textAlign: 'center',
        borderBottom: `2px solid ${PHASE_COLORS[round.phase]}`,
        minWidth: 140,
      }}>
        <div style={{
          color: PHASE_COLORS[round.phase], fontSize: 9, fontWeight: 700,
          letterSpacing: 2.5, textTransform: 'uppercase',
        }}>
          {PHASE_LABELS[round.phase]}
        </div>
        <div style={{ color: '#fff', fontSize: 20, fontWeight: 800, fontFamily: "'Courier New', monospace" }}>
          Round {match.currentRound}
        </div>
        <div style={{ color: '#777', fontSize: 10, letterSpacing: 0.5 }}>
          Turn {round.turn} &middot; {round.activeTeam === 'T' ? 'T Side' : 'CT Side'}
        </div>
      </div>

      {/* CT score */}
      <div style={{
        background: 'rgba(26, 58, 110, 0.9)', padding: '6px 24px',
        borderRadius: '0 0 8px 0', minWidth: 60, textAlign: 'center',
        borderBottom: round.activeTeam === 'CT' ? '3px solid #5599dd' : '3px solid transparent',
      }}>
        <div style={{ color: '#fff', fontSize: 10, fontWeight: 600, letterSpacing: 1.5, opacity: 0.9 }}>
          COUNTER-T
        </div>
        <div style={{ color: '#fff', fontSize: 28, fontWeight: 800, fontFamily: "'Courier New', monospace" }}>
          {match.scoreCT}
        </div>
      </div>
    </div>
  );
}

// --- Team roster (mini unit icons for active team) ---
function TeamRoster() {
  const units = useGameStore((s) => s.units);
  const activeTeam = useGameStore((s) => s.round.activeTeam);
  const selectedId = useGameStore((s) => s.selectedUnitId);
  const selectUnit = useGameStore((s) => s.selectUnit);

  const teamUnits = units.filter((u) => u.team === activeTeam);
  const teamColor = activeTeam === 'T' ? '#b8860b' : '#4488cc';

  return (
    <div style={{
      position: 'absolute', top: 80, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', gap: 6, pointerEvents: 'auto',
    }}>
      {teamUnits.map((u) => {
        const isSel = u.id === selectedId;
        const hasAP = u.ap > 0;
        return (
          <div
            key={u.id}
            onClick={() => selectUnit(u.id)}
            style={{
              width: 56, padding: '4px 0', textAlign: 'center', cursor: 'pointer',
              background: isSel ? `${teamColor}44` : 'rgba(8,8,12,0.85)',
              border: `1px solid ${isSel ? teamColor : '#333'}`,
              borderRadius: 4,
              opacity: u.alive ? (hasAP ? 1 : 0.5) : 0.25,
              transition: 'all 150ms ease',
            }}
          >
            <div style={{ color: teamColor, fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>
              {ROLE_ICONS[u.role.id]}
            </div>
            <div style={{ color: '#aaa', fontSize: 8, marginTop: 1 }}>{u.name}</div>
            <div style={{
              display: 'flex', gap: 2, justifyContent: 'center', marginTop: 3,
            }}>
              {Array.from({ length: u.maxAp }, (_, i) => (
                <div key={i} style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: i < u.ap ? '#44ee66' : '#333',
                }} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --- Selected unit detail panel ---
function SelectedUnitPanel() {
  const selectedId = useGameStore((s) => s.selectedUnitId);
  const units = useGameStore((s) => s.units);
  const finishUnit = useGameStore((s) => s.finishUnit);
  const inputMode = useGameStore((s) => s.inputMode);
  const setInputMode = useGameStore((s) => s.setInputMode);
  const shootUnit = useGameStore((s) => s.shootUnit);
  const smokes = useGameStore((s) => s.smokes);
  const map = useGameStore((s) => s.map);
  const phase = useGameStore((s) => s.round.phase);

  if (selectedId === null) return null;
  const unit = units.find((u) => u.id === selectedId);
  if (!unit) return null;

  const teamColor = unit.team === 'T' ? '#b8860b' : '#4488cc';
  const targetPreviews = units
    .filter((candidate) => candidate.alive && candidate.team !== unit.team)
    .map((candidate) => ({
      target: candidate,
      preview: getShotPreview(map, unit, candidate, 0, candidate.position, smokes),
    }));
  const visibleTargets = targetPreviews.filter(({ preview }) => preview.hasLineOfSight);
  const shotOptions = visibleTargets
    .filter(({ preview }) => preview.inRange)
    .sort((a, b) => b.preview.hitChance - a.preview.hitChance);
  const topShotPreview = shotOptions[0]?.preview ?? null;
  const shootingDisabledReason = unit.ap <= 0
    ? 'No AP remaining.'
    : (phase === 'setup' && !RULES.setupFiringAllowed)
      ? 'Setup phase: no firing.'
      : visibleTargets.length > 0 && shotOptions.length === 0
        ? 'Visible enemy out of weapon range.'
        : shotOptions.length === 0
        ? 'No visible enemy.'
        : null;
  const utilityDisabledReason = unit.ap <= 0
    ? 'No AP remaining.'
    : (phase === 'setup' && !RULES.setupUtilityAllowed)
      ? 'Setup phase: no utility.'
      : unit.smokeGrenades <= 0
        ? 'No smokes remaining.'
        : null;

  return (
    <div style={{
      position: 'absolute', bottom: 20, left: 20,
      background: 'rgba(8, 8, 12, 0.94)',
      border: `1px solid ${teamColor}33`,
      borderLeft: `3px solid ${teamColor}`,
      borderRadius: 6, padding: '12px 16px', minWidth: 200,
      pointerEvents: 'auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{ color: teamColor, fontSize: 12, fontWeight: 800, letterSpacing: 1 }}>
          {unit.role.displayName.toUpperCase()}
        </span>
        <span style={{ color: '#888', fontSize: 11 }}>{unit.name}</span>
        <span style={{ color: '#555', fontSize: 9, marginLeft: 'auto' }}>
          {unit.team}
        </span>
      </div>

      {/* HP bar */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#666', marginBottom: 2 }}>
          <span>HP</span>
          <span style={{ fontFamily: "'Courier New', monospace", color: '#ccc' }}>
            {unit.hp}/{unit.maxHp}
          </span>
        </div>
        <div style={{ height: 4, background: '#1a1a24', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${(unit.hp / unit.maxHp) * 100}%`,
            background: unit.hp > 60 ? '#22cc44' : unit.hp > 30 ? '#ccaa22' : '#cc2222',
            borderRadius: 2,
          }} />
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 14, fontSize: 10, marginBottom: 6 }}>
        <StatBox label="AP" value={`${unit.ap}/${unit.maxAp}`} highlight={unit.ap > 0} />
        <StatBox label="MOB" value={unit.role.mobility} />
        <StatBox label="AIM" value={unit.role.baseAim} />
        <StatBox label="SMK" value={unit.smokeGrenades} highlight={unit.smokeGrenades > 0} />
        <StatBox label="$" value={unit.money} />
      </div>

      {/* Weapon */}
      <div style={{
        fontSize: 10, color: '#ccc', padding: '5px 8px',
        background: 'rgba(255,255,255,0.03)', borderRadius: 3, marginBottom: 4,
      }}>
        <span style={{ color: '#555', marginRight: 6 }}>WPN</span>
        {unit.weapon.name}
        <span style={{ color: '#555', marginLeft: 8, fontFamily: "'Courier New', monospace" }}>
          DMG {unit.weapon.baseDamage}
        </span>
      </div>

      {/* Ability */}
      <div style={{ fontSize: 9, color: '#666' }}>
        <span style={{ color: teamColor, marginRight: 4, fontWeight: 700 }}>Q</span>
        {unit.role.abilityName}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, marginTop: 10 }}>
        <button
          onClick={() => setInputMode('move')}
          disabled={unit.ap <= 0}
          style={{
            padding: '7px 8px',
            borderRadius: 4,
            border: `1px solid ${inputMode === 'move' ? `${teamColor}aa` : '#333'}`,
            background: inputMode === 'move' ? `${teamColor}33` : 'rgba(255,255,255,0.03)',
            color: unit.ap > 0 ? '#f5f5f5' : '#666',
            cursor: unit.ap > 0 ? 'pointer' : 'default',
            fontSize: 10,
            fontWeight: 850,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
          }}
        >
          Move
        </button>
        <button
          onClick={() => setInputMode(inputMode === 'shoot' ? 'move' : 'shoot')}
          disabled={Boolean(shootingDisabledReason)}
          style={{
            padding: '7px 8px',
            borderRadius: 4,
            border: `1px solid ${inputMode === 'shoot' ? '#d8c170aa' : '#333'}`,
            background: inputMode === 'shoot' ? 'rgba(216,193,112,0.22)' : 'rgba(255,255,255,0.03)',
            color: shootingDisabledReason ? '#666' : '#f5f5f5',
            cursor: shootingDisabledReason ? 'default' : 'pointer',
            fontSize: 10,
            fontWeight: 850,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
          }}
        >
          Shoot
        </button>
        <button
          onClick={() => setInputMode(inputMode === 'hold_angle' ? 'move' : 'hold_angle')}
          disabled={unit.ap <= 0}
          style={{
            padding: '7px 8px',
            borderRadius: 4,
            border: `1px solid ${inputMode === 'hold_angle' ? '#ff4e6aaa' : '#333'}`,
            background: inputMode === 'hold_angle' ? 'rgba(255,78,106,0.22)' : 'rgba(255,255,255,0.03)',
            color: unit.ap > 0 ? '#f5f5f5' : '#666',
            cursor: unit.ap > 0 ? 'pointer' : 'default',
            fontSize: 10,
            fontWeight: 850,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
          }}
        >
          Hold
        </button>
        <button
          onClick={() => setInputMode(inputMode === 'smoke' ? 'move' : 'smoke')}
          disabled={Boolean(utilityDisabledReason)}
          style={{
            padding: '7px 8px',
            borderRadius: 4,
            border: `1px solid ${inputMode === 'smoke' ? '#c5d1dfaa' : '#333'}`,
            background: inputMode === 'smoke' ? 'rgba(197,209,223,0.2)' : 'rgba(255,255,255,0.03)',
            color: utilityDisabledReason ? '#666' : '#f5f5f5',
            cursor: utilityDisabledReason ? 'default' : 'pointer',
            fontSize: 10,
            fontWeight: 850,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
          }}
        >
          Smoke
        </button>
      </div>

      {inputMode === 'hold_angle' && (
        <div style={{ color: '#b36b77', fontSize: 9, marginTop: 6, lineHeight: 1.35 }}>
          Click a lane or angle on the map.
        </div>
      )}
      {inputMode === 'shoot' && (
        <div style={{ color: '#b8a45b', fontSize: 9, marginTop: 6, lineHeight: 1.35 }}>
          Click a visible enemy to fire.
        </div>
      )}
      {inputMode === 'smoke' && (
        <div style={{ color: '#bfc9d6', fontSize: 9, marginTop: 6, lineHeight: 1.35 }}>
          Click a tile within 12 tiles to block line of sight.
        </div>
      )}
      {inputMode === 'shoot' && shootingDisabledReason && (
        <div style={{ color: '#706f6a', fontSize: 9, marginTop: 6, lineHeight: 1.35 }}>
          Shoot disabled: {shootingDisabledReason}
        </div>
      )}
      {utilityDisabledReason && inputMode === 'smoke' && (
        <div style={{ color: '#707985', fontSize: 9, marginTop: 6, lineHeight: 1.35 }}>
          Smoke disabled: {utilityDisabledReason}
        </div>
      )}
      {topShotPreview && !shootingDisabledReason && (
        <div style={{ color: '#b8a45b', fontSize: 9, marginTop: 6, lineHeight: 1.35 }}>
          Best shot: {topShotPreview.hitChance}% / {topShotPreview.damage} dmg
        </div>
      )}
      {shotOptions.length > 0 && !shootingDisabledReason && (
        <div style={{
          marginTop: 8,
          borderTop: '1px solid rgba(255,255,255,0.06)',
          paddingTop: 7,
          display: 'grid',
          gap: 5,
        }}>
          <div style={{
            color: '#777',
            fontSize: 9,
            fontWeight: 850,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
          }}>
            Visible targets
          </div>
          {shotOptions.slice(0, 3).map(({ target, preview }) => (
            <button
              key={target.id}
              onClick={() => shootUnit(target.id)}
              style={{
                display: 'grid',
                gridTemplateColumns: '42px 1fr auto',
                alignItems: 'center',
                gap: 6,
                border: '1px solid #3a2f35',
                background: 'rgba(255,78,106,0.12)',
                color: '#e9d7db',
                borderRadius: 4,
                padding: '6px 7px',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span style={{
                color: '#ff6b82',
                fontSize: 10,
                fontWeight: 950,
                fontFamily: "'Courier New', monospace",
              }}>
                {preview.hitChance}%
              </span>
              <span style={{
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: 10,
                fontWeight: 800,
              }}>
                {target.role.displayName} {target.name}
              </span>
              <span style={{ color: '#b8a45b', fontSize: 9, fontWeight: 850 }}>
                {preview.damage}
              </span>
              <span style={{
                gridColumn: '2 / 4',
                color: '#7b6c71',
                fontSize: 8,
                fontWeight: 750,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
              }}>
                {Math.round(preview.distance)} tiles | RNG -{Math.round(preview.rangePenalty)} | COV {preview.coverLabel.toUpperCase()} -{Math.round(preview.coverPenalty)}
              </span>
            </button>
          ))}
        </div>
      )}

      <button
        onClick={finishUnit}
        disabled={unit.ap <= 0}
        style={{
          width: '100%',
          marginTop: 10,
          padding: '7px 10px',
          borderRadius: 4,
          border: `1px solid ${unit.ap > 0 ? `${teamColor}77` : '#333'}`,
          background: unit.ap > 0 ? `${teamColor}22` : 'rgba(255,255,255,0.03)',
          color: unit.ap > 0 ? '#f5f5f5' : '#666',
          cursor: unit.ap > 0 ? 'pointer' : 'default',
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 1,
          textTransform: 'uppercase',
        }}
      >
        Done
      </button>
    </div>
  );
}

function StatBox({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 8, color: '#555', marginBottom: 1 }}>{label}</div>
      <div style={{
        fontFamily: "'Courier New', monospace",
        color: highlight ? '#44ee66' : '#ccc',
        fontWeight: 700, fontSize: 11,
      }}>
        {value}
      </div>
    </div>
  );
}

// --- Primary command bar ---
function CommandBar() {
  const endTurn = useGameStore((s) => s.endTurn);
  const activeTeam = useGameStore((s) => s.round.activeTeam);
  const phase = useGameStore((s) => s.round.phase);
  const planningMode = useGameStore((s) => s.planningMode);
  const plannedActions = useGameStore((s) => s.plannedActions);
  const isExecuting = useGameStore((s) => s.isExecuting);
  const setPlanningMode = useGameStore((s) => s.setPlanningMode);
  const commitPlannedActions = useGameStore((s) => s.commitPlannedActions);
  const startContactDrill = useGameStore((s) => s.startContactDrill);
  const teamColor = activeTeam === 'T' ? '#b8860b' : '#2255aa';

  return (
    <div style={{
      position: 'absolute',
      bottom: 18,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'min(640px, calc(100vw - 40px))',
      background: 'rgba(8, 8, 12, 0.94)',
      border: '1px solid #2a2f3a',
      borderRadius: 7,
      padding: '9px 10px',
      pointerEvents: 'auto',
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 8,
      boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
    }}>
      <div style={{ minWidth: 0, flex: '1 1 170px' }}>
        <div style={{
          color: teamColor,
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
        }}>
          {activeTeam === 'T' ? 'T Side' : 'CT Side'} Command
        </div>
        <div style={{
          color: '#777',
          fontSize: 10,
          marginTop: 1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {isExecuting
            ? 'EXECUTING ORDERS'
            : `${PHASE_LABELS[phase]} · ${plannedActions.length} queued action${plannedActions.length === 1 ? '' : 's'}`}
        </div>
      </div>

      <button
        onClick={() => !isExecuting && setPlanningMode(!planningMode)}
        disabled={isExecuting}
        title={planningMode ? 'Click destination tiles to queue synchronized moves.' : 'Queue movement orders before resolving them together.'}
        aria-label={planningMode ? 'Planning mode is on' : 'Plan moves'}
        style={{
          border: `1px solid ${teamColor}88`,
          background: planningMode ? teamColor : `${teamColor}22`,
          color: isExecuting ? '#777' : '#ffffff',
          borderRadius: 5,
          padding: '9px 12px',
          cursor: isExecuting ? 'default' : 'pointer',
          fontSize: 11,
          fontWeight: 900,
          letterSpacing: 1,
          textTransform: 'uppercase',
          minWidth: 118,
        }}
      >
        {planningMode ? 'Planning' : 'Plan Moves'}
      </button>

      <button
        onClick={() => !isExecuting && startContactDrill()}
        disabled={isExecuting}
        title="Load a prepared first-contact scenario for testing movement, danger, and held angles."
        aria-label="Start contact drill"
        style={{
          border: '1px solid #3a2f35',
          background: 'rgba(255,78,106,0.16)',
          color: isExecuting ? '#6c4e55' : '#e2a3ae',
          borderRadius: 5,
          padding: '9px 10px',
          cursor: isExecuting ? 'default' : 'pointer',
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          minWidth: 128,
        }}
      >
        Contact Drill
      </button>

      {plannedActions.length > 0 ? (
        <button
          onClick={() => !isExecuting && commitPlannedActions()}
          disabled={isExecuting}
          title="Resolve all queued movement orders together until contact or completion."
          aria-label={isExecuting ? 'Executing queued orders' : 'Run execute'}
          style={{
            border: 'none',
            background: isExecuting ? '#5b665f' : '#2fbf71',
            color: isExecuting ? '#d3d7d2' : '#06110b',
            borderRadius: 5,
            padding: '10px 14px',
            cursor: isExecuting ? 'default' : 'pointer',
            fontSize: 11,
            fontWeight: 950,
            letterSpacing: 1.1,
            textTransform: 'uppercase',
            minWidth: 118,
            boxShadow: isExecuting ? 'none' : '0 0 14px rgba(47,191,113,0.35)',
          }}
        >
          {isExecuting ? 'Executing' : 'Run Execute'}
        </button>
      ) : (
        <button
          onClick={() => !isExecuting && endTurn()}
          disabled={isExecuting}
          title={`Pass control from ${activeTeam} side to the other team.`}
          aria-label={`End ${activeTeam} side`}
          style={{
            border: 'none',
            background: teamColor,
            color: isExecuting ? '#888' : '#ffffff',
            borderRadius: 5,
            padding: '10px 14px',
            cursor: isExecuting ? 'default' : 'pointer',
            fontSize: 11,
            fontWeight: 950,
            letterSpacing: 1.1,
            textTransform: 'uppercase',
            minWidth: 118,
            boxShadow: `0 0 14px ${teamColor}55`,
          }}
        >
          End {activeTeam} Side
        </button>
      )}

      {plannedActions.length > 0 && (
        <button
          onClick={() => !isExecuting && endTurn()}
          disabled={isExecuting}
          title={`Discard remaining tempo and pass control from ${activeTeam} side.`}
          aria-label={`End ${activeTeam} side`}
          style={{
            border: '1px solid #3a2f2f',
            background: 'rgba(130, 60, 50, 0.28)',
            color: isExecuting ? '#675a58' : '#d8b9b5',
            borderRadius: 5,
            padding: '6px 10px',
            cursor: isExecuting ? 'default' : 'pointer',
            fontSize: 9,
            fontWeight: 850,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
          }}
        >
          End {activeTeam} Side
        </button>
      )}
    </div>
  );
}

// --- Phase announcement (center screen) ---
function PhaseAnnouncement() {
  const phase = useGameStore((s) => s.round.phase);
  const turn = useGameStore((s) => s.round.turn);

  const showSetup = phase === 'setup';
  const showCombat = phase === 'combat' && turn === 3; // show on first combat turn

  if (!showSetup && !showCombat) return null;

  return (
    <div style={{
      position: 'absolute', top: '15%', left: '50%', transform: 'translateX(-50%)',
      textAlign: 'center', opacity: 0.6,
    }}>
      <div style={{
        color: PHASE_COLORS[phase], fontSize: 16, fontWeight: 800,
        letterSpacing: 6, textTransform: 'uppercase',
      }}>
        {showCombat ? 'FIRST CONTACT!' : PHASE_LABELS[phase]}
      </div>
      <div style={{ color: '#555', fontSize: 10, marginTop: 4 }}>
        {showSetup ? 'Sprint to positions. No firing.' : 'Weapons free. Overwatch active.'}
      </div>
    </div>
  );
}

// --- Hovered tile callout info ---
function TileInfo() {
  const hoveredTile = useGameStore((s) => s.hoveredTile);
  const map = useGameStore((s) => s.map);
  const movementTiles = useGameStore((s) => s.movementTiles);
  const pathPreview = useGameStore((s) => s.pathPreview);
  const units = useGameStore((s) => s.units);
  const selectedId = useGameStore((s) => s.selectedUnitId);
  const heldAngles = useGameStore((s) => s.heldAngles);
  const smokes = useGameStore((s) => s.smokes);
  const phase = useGameStore((s) => s.round.phase);

  if (!hoveredTile) return null;

  const tile = map.grid[hoveredTile.y]?.[hoveredTile.x];
  if (!tile) return null;
  const movementTile = movementTiles.find((t) => t.x === hoveredTile.x && t.y === hoveredTile.y);
  const cover = getDestinationCover(map, hoveredTile);
  const label = tile.label || 'Tile';
  const selectedUnit = units.find((unit) => unit.id === selectedId);
  const crossedHeldAngles = selectedUnit
    && phase !== 'setup'
    ? getCrossingHeldAngles(heldAngles, pathPreview, selectedUnit.team)
    : [];
  const watchedBy = crossedHeldAngles
    .map((angle) => units.find((unit) => unit.id === angle.unitId))
    .filter(Boolean)
    .map((unit) => `${unit!.role.displayName} ${unit!.name}`)
    .join(', ');
  const incomingThreats = selectedUnit && phase !== 'setup'
    ? units
      .filter((unit) => unit.alive && unit.team !== selectedUnit.team)
      .map((unit) => ({
        unit,
        preview: getShotPreview(map, unit, selectedUnit, 0, hoveredTile, smokes),
      }))
      .filter(({ preview }) => preview.hasLineOfSight && preview.inRange)
      .sort((a, b) => b.preview.hitChance - a.preview.hitChance)
    : [];
  const topIncomingThreat = incomingThreats[0] ?? null;
  const apColor = movementTile
    ? (movementTile.apCost <= 1 ? '#5df2ff' : '#f7cf5f')
    : '#777';
  const actionEconomy = movementTile
    ? (movementTile.apCost <= 1 ? 'SHOT REMAINS' : 'FULL COMMIT')
    : (tile.walkable ? 'WALKABLE' : 'BLOCKED');
  const risk = watchedBy
    ? { label: 'CONTACT RISK', color: '#ff6b82' }
    : topIncomingThreat
      ? { label: 'EXPOSED', color: '#ff9d3d' }
      : phase === 'setup'
        ? { label: 'SETUP SAFE', color: '#aa8833' }
        : { label: 'NO KNOWN LOS', color: '#58ff9a' };
  const threatDetail = watchedBy
    ? `Watched by ${watchedBy}`
    : topIncomingThreat
      ? `${topIncomingThreat.unit.role.displayName} ${topIncomingThreat.unit.name}: ${topIncomingThreat.preview.hitChance}% through ${topIncomingThreat.preview.coverLabel} cover`
      : null;

  return (
    <div style={{
      position: 'absolute',
      bottom: 92,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'min(640px, calc(100vw - 36px))',
      background: 'rgba(8, 8, 12, 0.9)',
      padding: '8px 12px',
      borderRadius: 6,
      border: `1px solid ${risk.color}55`,
      boxShadow: '0 10px 24px rgba(0,0,0,0.32)',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: '#d8dce4', fontSize: 11, fontWeight: 900, letterSpacing: 1.2, textTransform: 'uppercase' }}>
            {label}
          </div>
          <div style={{ color: '#5e6573', fontSize: 9, marginTop: 2 }}>
            Destination {hoveredTile.x}, {hoveredTile.y}
          </div>
        </div>
        <div style={{
          color: risk.color,
          fontSize: 10,
          fontWeight: 950,
          letterSpacing: 1,
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}>
          {risk.label}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
        {movementTile && <TileBadge color={apColor} label={`${movementTile.apCost} AP MOVE`} />}
        <TileBadge color={apColor} label={actionEconomy} subdued={!movementTile} />
        <TileBadge color={cover.color} label={`${cover.label} +${cover.value}`} />
        {topIncomingThreat && !watchedBy && (
          <TileBadge color="#ff9d3d" label={`${topIncomingThreat.preview.hitChance}% INCOMING`} />
        )}
      </div>

      {threatDetail && (
        <div style={{
          color: watchedBy ? '#ffb0bd' : '#ffc185',
          fontSize: 10,
          marginTop: 6,
          fontWeight: 700,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {threatDetail}
        </div>
      )}
    </div>
  );
}

function TileBadge({
  color,
  label,
  subdued = false,
}: {
  color: string;
  label: string;
  subdued?: boolean;
}) {
  return (
    <span style={{
      border: `1px solid ${color}66`,
      background: subdued ? 'rgba(255,255,255,0.035)' : `${color}1f`,
      color: subdued ? '#8b909b' : color,
      borderRadius: 4,
      padding: '3px 6px',
      fontSize: 9,
      fontWeight: 900,
      letterSpacing: 0.7,
      textTransform: 'uppercase',
      lineHeight: 1,
    }}>
      {label}
    </span>
  );
}

// --- Map branding ---
function MapLabel() {
  return (
    <div style={{
      position: 'absolute', bottom: 60, right: 20, textAlign: 'right',
    }}>
      <div style={{
        color: '#222', fontSize: 28, fontWeight: 900, letterSpacing: 5,
        textTransform: 'uppercase', lineHeight: 1,
      }}>
        INFERNO
      </div>
      <div style={{ color: '#1a1a1a', fontSize: 9, letterSpacing: 2.5, marginTop: 1 }}>
        CS2 TACTICS
      </div>
    </div>
  );
}
