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
import { useEffect, useState } from 'react';
import type { MapData, TileCoord } from '../game/types';
import { getCrossingHeldAngles } from '../game/threats';
import { getShotPreview, type ShotPreview } from '../game/combat';
import { RULES } from '../game/config/rules';
import { AudioFeedback } from './AudioFeedback';
import { getPlannedActionBeat, sortPlannedActionsByBeat } from '../game/executeTimeline';
import { getWeaponShotApCost } from '../game/config/weapons';

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

function getCoverStateLabel(preview: Pick<ShotPreview, 'coverState' | 'coverLabel' | 'coverQuality'>): string {
  if (preview.coverState === 'protected') {
    return preview.coverQuality === 'corner'
      ? `${preview.coverLabel} corner`
      : `${preview.coverLabel} cover`;
  }
  if (preview.coverState === 'flanked') return 'flanked';
  return 'exposed';
}

function getCoverStateColor(preview: Pick<ShotPreview, 'coverState' | 'coverLabel'>): string {
  if (preview.coverState === 'exposed') return '#ff6b82';
  if (preview.coverState === 'flanked') return '#ff9d3d';
  if (preview.coverLabel === 'full') return '#58ff9a';
  if (preview.coverLabel === 'half') return '#f2c94c';
  return '#aaa';
}

function formatPenalty(value: number): string {
  return Math.round(value).toString();
}

function getBaseShotAim(preview: ShotPreview): number {
  return preview.baseAim + preview.weaponAim - 70 + preview.aimBonus;
}

function useIsCompactViewport(): boolean {
  return useViewportBelow(560);
}

function useIsNarrowViewport(): boolean {
  return useViewportBelow(1000);
}

function useViewportBelow(width: number): boolean {
  const [isCompact, setIsCompact] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth < width : false
  ));

  useEffect(() => {
    const onResize = () => setIsCompact(window.innerWidth < width);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [width]);

  return isCompact;
}

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

function isInsideZone(tile: TileCoord, zone: { min: TileCoord; max: TileCoord }): boolean {
  return tile.x >= zone.min.x &&
    tile.x <= zone.max.x &&
    tile.y >= zone.min.y &&
    tile.y <= zone.max.y;
}

function getPlantSite(map: MapData, tile: TileCoord): 'A' | 'B' | null {
  if (isInsideZone(tile, map.plantZones.A)) return 'A';
  if (isInsideZone(tile, map.plantZones.B)) return 'B';
  return null;
}

function tileDistance(a: TileCoord, b: TileCoord): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function HUD() {
  return (
    <div data-testid="hud-root" style={{
      position: 'fixed', inset: 0, pointerEvents: 'none',
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      zIndex: 10,
    }}>
      <AudioFeedback />
      <TopBar />
      <SelectedUnitPanel />
      <TeamRoster />
      <CombatLogPanel />
      <ContactBreakPanel />
      <BombObjectivePanel />
      <ExecutePlanner />
      <CommandBar />
      <AiStatusPanel />
      <ViewControlPanel />
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
        {attacker?.role.displayName ?? 'Enemy'} {event.attackerName} fired from a held angle - {event.hitChance}% - {event.killed ? 'elimination' : event.critical ? 'headshot' : event.hit ? `${event.damage} damage` : 'miss'}
      </div>
      <div style={{ color: '#70646a', fontSize: 9, lineHeight: 1.35, marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {getCoverStateLabel(event)} | range -{formatPenalty(event.rangePenalty)} | cover -{formatPenalty(event.coverPenalty)}{event.flashPenalty > 0 ? ` | flash -${formatPenalty(event.flashPenalty)}` : ''}
      </div>
    </div>
  );
}

function dispatchCameraCommand(command: 'zoom-in' | 'zoom-out' | 'reset') {
  window.dispatchEvent(new CustomEvent('cs2-camera-command', { detail: command }));
}

function ViewControlPanel() {
  const compact = useIsCompactViewport();

  return (
    <div data-testid="hud-view-controls" style={{
      position: 'absolute',
      top: compact ? 154 : '50%',
      right: compact ? 10 : 20,
      transform: compact ? undefined : 'translateY(-50%)',
      display: 'grid',
      gridTemplateColumns: compact ? 'repeat(3, 38px)' : '38px',
      gap: 6,
      padding: 7,
      background: 'rgba(8, 8, 12, 0.9)',
      border: '1px solid #2a2f3a',
      borderRadius: 7,
      pointerEvents: 'auto',
      boxShadow: '0 8px 22px rgba(0,0,0,0.34)',
    }}>
      <CameraButton
        label="+"
        title="Zoom in"
        onClick={() => dispatchCameraCommand('zoom-in')}
      />
      <CameraButton
        label="-"
        title="Zoom out"
        onClick={() => dispatchCameraCommand('zoom-out')}
      />
      <CameraButton
        label="RST"
        title="Reset camera"
        onClick={() => dispatchCameraCommand('reset')}
      />
    </div>
  );
}

function CameraButton({
  label,
  title,
  onClick,
}: {
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={`hud-camera-${title.toLowerCase().replaceAll(' ', '-')}`}
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{
        width: 38,
        height: 34,
        borderRadius: 5,
        border: '1px solid #343948',
        background: 'rgba(255,255,255,0.045)',
        color: '#d8dce4',
        cursor: 'pointer',
        fontSize: label.length > 1 ? 9 : 17,
        fontWeight: 950,
        letterSpacing: label.length > 1 ? 0.4 : 0,
        lineHeight: 1,
        textTransform: 'uppercase',
      }}
    >
      {label}
    </button>
  );
}

function AiStatusPanel() {
  const aiStatus = useGameStore((s) => s.aiStatus);
  const compact = useIsCompactViewport();
  if (!aiStatus) return null;

  return (
    <div style={{
      position: 'absolute',
      top: compact ? 126 : 118,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'min(360px, calc(100vw - 28px))',
      background: 'rgba(7, 11, 18, 0.92)',
      border: '1px solid rgba(85,153,221,0.42)',
      borderLeft: '3px solid #5599dd',
      borderRadius: 6,
      padding: '8px 11px',
      pointerEvents: 'none',
      boxShadow: '0 10px 26px rgba(0,0,0,0.34)',
      textAlign: 'center',
    }}>
      <div style={{
        color: '#75b9ff',
        fontSize: 9,
        fontWeight: 950,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
      }}>
        Counter-T Auto Response
      </div>
      <div style={{
        color: '#d8e7ff',
        fontSize: 11,
        fontWeight: 800,
        lineHeight: 1.35,
        marginTop: 3,
      }}>
        {aiStatus.message}
      </div>
    </div>
  );
}

function CombatLogPanel() {
  const combatLog = useGameStore((s) => s.combatLog);
  const round = useGameStore((s) => s.round);
  if (combatLog.length === 0) return null;

  const hasObjectivePanel = round.bombPlanted || round.phase === 'roundend' || (!round.bombPlanted && round.bombCarrierId === null && Boolean(round.bombPosition));

  return (
    <div style={{
      position: 'absolute',
      top: hasObjectivePanel ? 172 : 132,
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
      {combatLog.slice(0, 3).map((event) => {
        const resultLabel = event.killed ? (event.critical ? 'HS KILL' : 'KILL') : event.critical ? 'HEADSHOT' : event.hit ? 'HIT' : 'MISS';
        const resultColor = event.killed || event.critical ? '#ffffff' : event.hit ? '#ffdadf' : '#aaa';
        const targetHp = event.hit ? ` | hp ${event.targetHpBefore}->${event.targetHpAfter}` : '';

        return (
          <div key={event.id} style={{ color: '#ccc', fontSize: 10, lineHeight: 1.35 }}>
            <div>
              <span style={{ color: resultColor, fontWeight: 900 }}>
                {resultLabel}
              </span>
              <span style={{ color: '#666', marginLeft: 6 }}>
                {event.hitChance}%
              </span>
              <span style={{ marginLeft: 6 }}>
                {event.summary}
              </span>
            </div>
            <div style={{
              color: event.killed ? '#ff6b82' : event.coverState === 'exposed' ? '#ff9ba9' : '#756870',
              fontSize: 8,
              fontWeight: 800,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              marginTop: 1,
            }}>
              {event.type === 'reaction_fire' ? 'Reaction' : 'Direct'} | {Math.round(event.distance)} tiles | {getCoverStateLabel(event)} | rng -{formatPenalty(event.rangePenalty)} cov -{formatPenalty(event.coverPenalty)}{event.flashPenalty > 0 ? ` fls -${formatPenalty(event.flashPenalty)}` : ''}{targetHp}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BombObjectivePanel() {
  const round = useGameStore((s) => s.round);
  const startNextRound = useGameStore((s) => s.startNextRound);
  const bombDropped = !round.bombPlanted && round.bombCarrierId === null && Boolean(round.bombPosition);
  if (!round.bombPlanted && round.phase !== 'roundend' && !bombDropped) return null;

  const isRoundOver = round.phase === 'roundend';
  const winner = round.roundWinner;
  const title = isRoundOver
    ? `${winner ?? '?'} SIDE WINS`
    : bombDropped
      ? 'BOMB DROPPED'
      : 'BOMB PLANTED';
  const subtitle = isRoundOver
    ? (round.winReason === 'defuse'
      ? 'Defuse successful'
      : round.winReason === 'detonation'
        ? 'Bomb detonated'
        : round.winReason === 'elimination'
          ? 'Enemy team eliminated'
          : round.winReason === 'timeexpiry'
            ? 'Round timer expired'
            : 'Round complete')
    : bombDropped
      ? 'Recover before planting'
      : `${round.bombTimer} turns until detonation`;
  const accent = bombDropped ? '#ffd166' : (winner === 'CT' ? '#65b7ff' : '#ff4e6a');

  return (
    <div style={{
      position: 'absolute',
      top: 82,
      right: 20,
      width: 220,
      background: 'rgba(8, 8, 12, 0.92)',
      border: `1px solid ${accent}55`,
      borderLeft: `3px solid ${accent}`,
      borderRadius: 6,
      padding: '9px 10px',
      pointerEvents: isRoundOver ? 'auto' : 'none',
      boxShadow: '0 10px 26px rgba(0,0,0,0.35)',
    }}>
      <div style={{
        color: accent,
        fontSize: 10,
        fontWeight: 950,
        letterSpacing: 1.3,
        textTransform: 'uppercase',
      }}>
        {title}
      </div>
      <div style={{ color: '#cfd3dc', fontSize: 11, marginTop: 4, fontWeight: 800 }}>
        {subtitle}
      </div>
      {round.bombPosition && !isRoundOver && (
        <div style={{ color: '#6f7685', fontSize: 9, marginTop: 3 }}>
          Bomb at {round.bombPosition.x}, {round.bombPosition.y}
        </div>
      )}
      {isRoundOver && (
        <button
          onClick={startNextRound}
          style={{
            marginTop: 8,
            width: '100%',
            border: `1px solid ${accent}88`,
            background: `${accent}22`,
            color: '#f3f6fb',
            borderRadius: 4,
            padding: '7px 8px',
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          New Round
        </button>
      )}
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
  const timelineActions = sortPlannedActionsByBeat(plannedActions);

  if (!planningMode && plannedActions.length === 0) return null;

  return (
    <div style={{
      position: 'absolute',
      top: 132,
      left: 20,
      width: 260,
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
          <div style={{
            display: 'flex',
            gap: 6,
            marginTop: 8,
            color: '#7d8798',
            fontSize: 9,
            fontWeight: 850,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
          }}>
            <span style={{ color: '#d8c170' }}>0.0s Utility</span>
            <span style={{ color: '#4b5362' }}>-&gt;</span>
            <span style={{ color: '#58ff9a' }}>0.6s Swing</span>
          </div>
          <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
            {timelineActions.map((action) => {
              const unit = units.find((u) => u.id === action.unitId);
              const isMove = action.kind === 'move';
              const isWatched = isMove && phase !== 'setup' && getCrossingHeldAngles(heldAngles, action.path, action.team).length > 0;
              const isDanger = Boolean(isMove && unit && phase !== 'setup' && units.some((enemy) => {
                if (!enemy.alive || enemy.team === action.team) return false;
                const preview = getShotPreview(map, enemy, unit, 0, action.target, smokes);
                return preview.hasLineOfSight && preview.inRange;
              }));
              const utilityColor = action.kind === 'flash' ? '#fff1a8' : '#c5d1df';
              const statusColor = !isMove ? utilityColor : (isWatched ? '#ff6b82' : (isDanger ? '#ff9d3d' : (action.apCost <= 1 ? '#58ff9a' : '#f2c94c')));
              const statusLabel = !isMove ? action.kind.toUpperCase() : (isWatched ? 'WATCH' : (isDanger ? 'DANGER' : `${action.apCost}AP`));
              const beat = getPlannedActionBeat(action);
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
                  <span style={{
                    color: statusColor,
                    border: `1px solid ${statusColor}55`,
                    background: `${statusColor}12`,
                    borderRadius: 3,
                    padding: '2px 4px',
                    fontSize: 8,
                    fontWeight: 900,
                    minWidth: 32,
                    textAlign: 'center',
                  }}>
                    {beat.timeLabel}
                  </span>
                  <span style={{ color: teamColor, fontWeight: 800, minWidth: 28 }}>
                    {ROLE_ICONS[unit?.role.id ?? 'entry']}
                  </span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {unit?.name ?? 'Unit'} {action.kind === 'move' ? 'move' : action.kind}
                  </span>
                  <span style={{ color: statusColor, fontWeight: 800 }}>
                    {beat.phaseLabel}/{statusLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
      {plannedActions.length === 0 && (
        <div style={{ color: '#666', fontSize: 10, lineHeight: 1.4, marginTop: 8 }}>
          Select a unit, then queue moves, smokes, or flashes for a synchronized execute.
        </div>
      )}
    </div>
  );
}

function MovementLegend() {
  const selectedId = useGameStore((s) => s.selectedUnitId);
  const units = useGameStore((s) => s.units);
  const movementTiles = useGameStore((s) => s.movementTiles);

  if (selectedId === null || movementTiles.length === 0) return null;
  const selectedUnit = units.find((unit) => unit.id === selectedId);
  const shotCost = selectedUnit ? getWeaponShotApCost(selectedUnit.weapon) : 1;
  const oneApNote = shotCost <= 1
    ? 'shoot remains'
    : `${selectedUnit?.weapon.category ?? 'weapon'} needs 2 AP`;

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
      <LegendRow color="#39e58c" label="1 AP move" note={oneApNote} />
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
  const compact = useIsCompactViewport();
  const sidePadding = compact ? '6px 8px' : '6px 24px';
  const sideMinWidth = compact ? 78 : 60;
  const centerPadding = compact ? '6px 10px' : '6px 24px';
  const centerMinWidth = compact ? 116 : 140;
  const labelSize = compact ? 9 : 10;
  const labelSpacing = compact ? 1.1 : 1.5;
  const scoreSize = compact ? 24 : 28;

  return (
    <div data-testid="hud-top-bar" style={{
      position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', alignItems: 'stretch',
    }}>
      {/* T score */}
      <div style={{
        background: 'rgba(184, 134, 11, 0.9)', padding: sidePadding,
        borderRadius: '0 0 0 8px', minWidth: sideMinWidth, textAlign: 'center',
        borderBottom: round.activeTeam === 'T' ? '3px solid #f4c430' : '3px solid transparent',
      }}>
        <div style={{ color: '#fff', fontSize: labelSize, fontWeight: 600, letterSpacing: labelSpacing, opacity: 0.9, whiteSpace: 'nowrap' }}>
          TERRORISTS
        </div>
        <div style={{ color: '#fff', fontSize: scoreSize, fontWeight: 800, fontFamily: "'Courier New', monospace" }}>
          {match.scoreT}
        </div>
      </div>

      {/* Center info */}
      <div style={{
        background: 'rgba(8, 8, 12, 0.95)', padding: centerPadding, textAlign: 'center',
        borderBottom: `2px solid ${PHASE_COLORS[round.phase]}`,
        minWidth: centerMinWidth,
      }}>
        <div style={{
          color: PHASE_COLORS[round.phase], fontSize: compact ? 8 : 9, fontWeight: 700,
          letterSpacing: compact ? 1.8 : 2.5, textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}>
          {PHASE_LABELS[round.phase]}
        </div>
        <div style={{ color: '#fff', fontSize: compact ? 18 : 20, fontWeight: 800, fontFamily: "'Courier New', monospace", whiteSpace: 'nowrap' }}>
          Round {match.currentRound}
        </div>
        <div style={{ color: '#777', fontSize: compact ? 9 : 10, letterSpacing: 0.5, whiteSpace: 'nowrap' }}>
          Turn {round.turn} &middot; {round.activeTeam === 'T' ? 'T Side' : 'CT Side'}
        </div>
      </div>

      {/* CT score */}
      <div style={{
        background: 'rgba(26, 58, 110, 0.9)', padding: sidePadding,
        borderRadius: '0 0 8px 0', minWidth: sideMinWidth, textAlign: 'center',
        borderBottom: round.activeTeam === 'CT' ? '3px solid #5599dd' : '3px solid transparent',
      }}>
        <div style={{ color: '#fff', fontSize: labelSize, fontWeight: 600, letterSpacing: labelSpacing, opacity: 0.9, whiteSpace: 'nowrap' }}>
          COUNTER-T
        </div>
        <div style={{ color: '#fff', fontSize: scoreSize, fontWeight: 800, fontFamily: "'Courier New', monospace" }}>
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
  const compact = useIsCompactViewport();

  const teamUnits = units.filter((u) => u.team === activeTeam);
  const teamColor = activeTeam === 'T' ? '#b8860b' : '#4488cc';

  return (
    <div data-testid="hud-team-roster" style={{
      position: 'absolute', top: compact ? 80 : 80, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', gap: compact ? 4 : 6, pointerEvents: 'auto',
      maxWidth: 'calc(100vw - 14px)',
    }}>
      {teamUnits.map((u) => {
        const isSel = u.id === selectedId;
        const hasAP = u.ap > 0;
        return (
          <div
              key={u.id}
              onClick={() => selectUnit(u.id)}
              style={{
              width: compact ? 48 : 56, padding: '4px 0', textAlign: 'center', cursor: 'pointer',
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
  const plantBomb = useGameStore((s) => s.plantBomb);
  const defuseBomb = useGameStore((s) => s.defuseBomb);
  const pickupBomb = useGameStore((s) => s.pickupBomb);
  const reloadWeapon = useGameStore((s) => s.reloadWeapon);
  const inputMode = useGameStore((s) => s.inputMode);
  const setInputMode = useGameStore((s) => s.setInputMode);
  const shootUnit = useGameStore((s) => s.shootUnit);
  const smokes = useGameStore((s) => s.smokes);
  const map = useGameStore((s) => s.map);
  const round = useGameStore((s) => s.round);
  const compact = useIsCompactViewport();
  const narrow = useIsNarrowViewport();
  const phase = round.phase;

  if (selectedId === null) return null;
  const unit = units.find((u) => u.id === selectedId);
  if (!unit) return null;

  const teamColor = unit.team === 'T' ? '#b8860b' : '#4488cc';
  const shotApCost = getWeaponShotApCost(unit.weapon);
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
  let shootingDisabledReason: string | null = null;
  if (unit.ap <= 0) {
    shootingDisabledReason = 'No AP remaining.';
  } else if (unit.ammoInClip <= 0) {
    shootingDisabledReason = 'Magazine empty.';
  } else if (unit.ap < shotApCost) {
    shootingDisabledReason = `${shotApCost} AP required for ${unit.weapon.category} shot.`;
  } else if (phase === 'setup' && !RULES.setupFiringAllowed) {
    shootingDisabledReason = 'Setup phase: no firing.';
  } else if (visibleTargets.length > 0 && shotOptions.length === 0) {
    shootingDisabledReason = 'Visible enemy out of weapon range.';
  } else if (shotOptions.length === 0) {
    shootingDisabledReason = 'No visible enemy.';
  }
  const smokeDisabledReason = unit.ap <= 0
    ? 'No AP remaining.'
    : (phase === 'setup' && !RULES.setupUtilityAllowed)
      ? 'Setup phase: no utility.'
      : unit.smokeGrenades <= 0
        ? 'No smokes remaining.'
        : null;
  const flashDisabledReason = unit.ap <= 0
    ? 'No AP remaining.'
    : (phase === 'setup' && !RULES.setupUtilityAllowed)
      ? 'Setup phase: no utility.'
      : unit.flashbangs <= 0
        ? 'No flashes remaining.'
        : null;
  const reloadDisabledReason = unit.ap <= 0
    ? 'No AP remaining.'
    : unit.ammoInClip >= unit.weapon.clipSize
      ? 'Magazine full.'
      : unit.reserveAmmo <= 0
        ? 'No reserve ammo.'
        : null;
  const plantSite = getPlantSite(map, unit.position);
  const plantDisabledReason = unit.team !== 'T'
    ? 'Only T side can plant.'
    : round.bombPlanted
      ? 'Bomb already planted.'
      : !unit.hasBomb
        ? 'This player does not have the bomb.'
        : phase === 'setup'
          ? 'Setup phase: reach a site first.'
          : !plantSite
            ? 'Not in an A/B plant zone.'
            : unit.ap < RULES.plantActionCost
              ? `${RULES.plantActionCost} AP required.`
              : null;
  const defuseCost = unit.hasDefuseKit ? RULES.defuseWithKit : RULES.defuseWithoutKit;
  const defuseDisabledReason = unit.team !== 'CT'
    ? 'Only CT side can defuse.'
    : !round.bombPlanted || round.phase !== 'postplant'
      ? 'No active planted bomb.'
      : !round.bombPosition || tileDistance(unit.position, round.bombPosition) > 1.5
        ? 'Move onto the bomb.'
        : unit.ap < defuseCost
          ? `${defuseCost} AP required.`
          : null;
  const bombDropped = !round.bombPlanted && round.bombCarrierId === null && Boolean(round.bombPosition);
  const pickupDisabledReason = unit.team !== 'T'
    ? 'Only T side can recover the bomb.'
    : !bombDropped
      ? 'Bomb is not dropped.'
      : !round.bombPosition || tileDistance(unit.position, round.bombPosition) > 1.5
        ? 'Move onto the dropped bomb.'
        : unit.ap < RULES.bombPickupCost
          ? `${RULES.bombPickupCost} AP required.`
          : null;
  const showPlantAction = unit.hasBomb;
  const showDefuseAction = round.bombPlanted && unit.team === 'CT';
  const showPickupAction = bombDropped && unit.team === 'T' && !unit.hasBomb;

  return (
    <div data-testid="hud-selected-unit-panel" style={{
      position: 'absolute',
      bottom: narrow ? 156 : 20,
      left: compact ? 10 : 20,
      right: compact ? 10 : undefined,
      background: 'rgba(8, 8, 12, 0.94)',
      border: `1px solid ${teamColor}33`,
      borderLeft: `3px solid ${teamColor}`,
      borderRadius: 6,
      padding: compact ? '10px 12px' : '12px 16px',
      minWidth: compact ? 0 : 260,
      maxWidth: compact ? undefined : 380,
      maxHeight: narrow ? 'calc(100vh - 250px)' : 'calc(100vh - 96px)',
      overflowY: 'auto',
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
        <StatBox label="AMO" value={`${unit.ammoInClip}/${unit.reserveAmmo}`} highlight={unit.ammoInClip > 0} />
        <StatBox label="SMK" value={unit.smokeGrenades} highlight={unit.smokeGrenades > 0} />
        <StatBox label={unit.flashTurns > 0 ? 'FLD' : 'FLS'} value={unit.flashTurns > 0 ? 'YES' : unit.flashbangs} highlight={unit.flashTurns > 0 || unit.flashbangs > 0} />
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(72px, 1fr))', gap: 6, marginTop: 10 }}>
        <button
          data-testid="hud-action-move"
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
          data-testid="hud-action-shoot"
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
          Shoot {shotApCost}AP
        </button>
        <button
          data-testid="hud-action-hold-angle"
          onClick={() => setInputMode(inputMode === 'hold_angle' ? 'move' : 'hold_angle')}
          disabled={unit.ap <= 0 || unit.ammoInClip <= 0}
          style={{
            padding: '7px 8px',
            borderRadius: 4,
            border: `1px solid ${inputMode === 'hold_angle' ? '#ff4e6aaa' : '#333'}`,
            background: inputMode === 'hold_angle' ? 'rgba(255,78,106,0.22)' : 'rgba(255,255,255,0.03)',
            color: unit.ap > 0 && unit.ammoInClip > 0 ? '#f5f5f5' : '#666',
            cursor: unit.ap > 0 && unit.ammoInClip > 0 ? 'pointer' : 'default',
            fontSize: 10,
            fontWeight: 850,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
          }}
        >
          Hold 1AP
        </button>
        <button
          data-testid="hud-action-smoke"
          onClick={() => setInputMode(inputMode === 'smoke' ? 'move' : 'smoke')}
          disabled={Boolean(smokeDisabledReason)}
          style={{
            padding: '7px 8px',
            borderRadius: 4,
            border: `1px solid ${inputMode === 'smoke' ? '#c5d1dfaa' : '#333'}`,
            background: inputMode === 'smoke' ? 'rgba(197,209,223,0.2)' : 'rgba(255,255,255,0.03)',
            color: smokeDisabledReason ? '#666' : '#f5f5f5',
            cursor: smokeDisabledReason ? 'default' : 'pointer',
            fontSize: 10,
            fontWeight: 850,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
          }}
        >
          Smoke 1AP
        </button>
        <button
          data-testid="hud-action-flash"
          onClick={() => setInputMode(inputMode === 'flash' ? 'move' : 'flash')}
          disabled={Boolean(flashDisabledReason)}
          style={{
            padding: '7px 8px',
            borderRadius: 4,
            border: `1px solid ${inputMode === 'flash' ? '#fff1a8aa' : '#333'}`,
            background: inputMode === 'flash' ? 'rgba(255,241,168,0.2)' : 'rgba(255,255,255,0.03)',
            color: flashDisabledReason ? '#666' : '#fff7d0',
            cursor: flashDisabledReason ? 'default' : 'pointer',
            fontSize: 10,
            fontWeight: 850,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
          }}
        >
          Flash 1AP
        </button>
        <button
          data-testid="hud-action-reload"
          onClick={reloadWeapon}
          disabled={Boolean(reloadDisabledReason)}
          title={reloadDisabledReason ?? 'Reload weapon'}
          style={{
            padding: '7px 8px',
            borderRadius: 4,
            border: `1px solid ${reloadDisabledReason ? '#333' : '#8bd3ffaa'}`,
            background: reloadDisabledReason ? 'rgba(255,255,255,0.03)' : 'rgba(139,211,255,0.18)',
            color: reloadDisabledReason ? '#666' : '#d8ecff',
            cursor: reloadDisabledReason ? 'default' : 'pointer',
            fontSize: 10,
            fontWeight: 850,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
          }}
        >
          Reload 1AP
        </button>
      </div>

      {(showPlantAction || showDefuseAction || showPickupAction) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(82px, 1fr))', gap: 6, marginTop: 7 }}>
          {showPlantAction && (
            <button
              data-testid="hud-action-plant"
              onClick={plantBomb}
              disabled={Boolean(plantDisabledReason)}
              title={plantDisabledReason ?? `Plant bomb on ${plantSite} site`}
              style={{
                padding: '7px 8px',
                borderRadius: 4,
                border: `1px solid ${plantDisabledReason ? '#333' : '#ff4e6aaa'}`,
                background: plantDisabledReason ? 'rgba(255,255,255,0.03)' : 'rgba(255,78,106,0.2)',
                color: plantDisabledReason ? '#666' : '#ffd7dd',
                cursor: plantDisabledReason ? 'default' : 'pointer',
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: 0.8,
                textTransform: 'uppercase',
              }}
            >
              {plantSite ? `Plant ${plantSite}` : 'Plant'}
            </button>
          )}
          {showDefuseAction && (
            <button
              data-testid="hud-action-defuse"
              onClick={defuseBomb}
              disabled={Boolean(defuseDisabledReason)}
              title={defuseDisabledReason ?? 'Defuse the planted bomb'}
              style={{
                padding: '7px 8px',
                borderRadius: 4,
                border: `1px solid ${defuseDisabledReason ? '#333' : '#65b7ffaa'}`,
                background: defuseDisabledReason ? 'rgba(255,255,255,0.03)' : 'rgba(101,183,255,0.2)',
                color: defuseDisabledReason ? '#666' : '#d8ecff',
                cursor: defuseDisabledReason ? 'default' : 'pointer',
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: 0.8,
                textTransform: 'uppercase',
              }}
            >
              Defuse
            </button>
          )}
          {showPickupAction && (
            <button
              data-testid="hud-action-pickup"
              onClick={pickupBomb}
              disabled={Boolean(pickupDisabledReason)}
              title={pickupDisabledReason ?? 'Recover the dropped bomb'}
              style={{
                padding: '7px 8px',
                borderRadius: 4,
                border: `1px solid ${pickupDisabledReason ? '#333' : '#ffd166aa'}`,
                background: pickupDisabledReason ? 'rgba(255,255,255,0.03)' : 'rgba(255,209,102,0.2)',
                color: pickupDisabledReason ? '#666' : '#fff1b5',
                cursor: pickupDisabledReason ? 'default' : 'pointer',
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: 0.8,
                textTransform: 'uppercase',
              }}
            >
              Pickup
            </button>
          )}
        </div>
      )}

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
      {inputMode === 'flash' && (
        <div style={{ color: '#d8c170', fontSize: 9, marginTop: 6, lineHeight: 1.35 }}>
          Click a tile within 12 tiles. Enemies in the burst take a major aim penalty.
        </div>
      )}
      {inputMode === 'shoot' && shootingDisabledReason && (
        <div style={{ color: '#706f6a', fontSize: 9, marginTop: 6, lineHeight: 1.35 }}>
          Shoot disabled: {shootingDisabledReason}
        </div>
      )}
      {reloadDisabledReason && unit.ammoInClip <= 0 && (
        <div style={{ color: '#6f7e8e', fontSize: 9, marginTop: 6, lineHeight: 1.35 }}>
          Reload: {reloadDisabledReason}
        </div>
      )}
      {smokeDisabledReason && inputMode === 'smoke' && (
        <div style={{ color: '#707985', fontSize: 9, marginTop: 6, lineHeight: 1.35 }}>
          Smoke disabled: {smokeDisabledReason}
        </div>
      )}
      {flashDisabledReason && inputMode === 'flash' && (
        <div style={{ color: '#837849', fontSize: 9, marginTop: 6, lineHeight: 1.35 }}>
          Flash disabled: {flashDisabledReason}
        </div>
      )}
      {showPlantAction && plantDisabledReason && unit.hasBomb && (
        <div style={{ color: '#7b6c71', fontSize: 9, marginTop: 6, lineHeight: 1.35 }}>
          Plant disabled: {plantDisabledReason}
        </div>
      )}
      {showDefuseAction && defuseDisabledReason && round.bombPlanted && unit.team === 'CT' && (
        <div style={{ color: '#6f7e8e', fontSize: 9, marginTop: 6, lineHeight: 1.35 }}>
          Defuse disabled: {defuseDisabledReason}
        </div>
      )}
      {showPickupAction && pickupDisabledReason && (
        <div style={{ color: '#837849', fontSize: 9, marginTop: 6, lineHeight: 1.35 }}>
          Pickup disabled: {pickupDisabledReason}
        </div>
      )}
      {topShotPreview && !shootingDisabledReason && (
        <div style={{ color: '#b8a45b', fontSize: 9, marginTop: 6, lineHeight: 1.35 }}>
          Best shot: {topShotPreview.hitChance}% / {topShotPreview.damage} dmg / HS {topShotPreview.critChance}% for {topShotPreview.critDamage} / {getCoverStateLabel(topShotPreview)}
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
              data-testid={`hud-visible-target-${target.id}`}
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
                color: getCoverStateColor(preview),
                fontSize: 8,
                fontWeight: 750,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
              }}>
                Base {getBaseShotAim(preview)} | Range -{formatPenalty(preview.rangePenalty)} | Cover -{formatPenalty(preview.coverPenalty)} | HS {preview.critChance}%/{preview.critDamage}{preview.flashPenalty > 0 ? ` | Flash -${formatPenalty(preview.flashPenalty)}` : ''} | {getCoverStateLabel(preview)}
              </span>
            </button>
          ))}
        </div>
      )}

      <button
        data-testid="hud-action-done"
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
  const compact = useIsCompactViewport();
  const isRoundOver = phase === 'roundend';
  const commandButtonStyle = compact
    ? {
      width: '100%',
      minWidth: 0,
      padding: '9px 8px',
      fontSize: 10,
    }
    : {};

  return (
    <div data-testid="hud-command-bar" style={{
      position: 'absolute',
      bottom: compact ? 14 : 18,
      left: compact ? 10 : '50%',
      transform: compact ? 'none' : 'translateX(-50%)',
      width: compact ? 'min(370px, calc(100vw - 20px))' : 'min(640px, calc(100vw - 40px))',
      background: 'rgba(8, 8, 12, 0.94)',
      border: '1px solid #2a2f3a',
      borderRadius: 7,
      padding: compact ? 8 : '9px 10px',
      pointerEvents: 'auto',
      display: compact ? 'grid' : 'flex',
      gridTemplateColumns: compact ? '1fr 1fr' : undefined,
      flexWrap: compact ? undefined : 'wrap',
      alignItems: 'center',
      gap: 8,
      boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
    }}>
      <div style={{ minWidth: 0, flex: compact ? undefined : '1 1 170px', gridColumn: compact ? '1 / -1' : undefined }}>
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
        data-testid="hud-command-plan"
        onClick={() => !isExecuting && !isRoundOver && setPlanningMode(!planningMode)}
        disabled={isExecuting || isRoundOver}
        title={planningMode ? 'Click destination tiles to queue synchronized execute orders.' : 'Queue movement and utility orders before resolving them together.'}
        aria-label={planningMode ? 'Planning execute mode is on' : 'Plan execute'}
        style={{
          border: `1px solid ${teamColor}88`,
          background: planningMode ? teamColor : `${teamColor}22`,
          color: isExecuting || isRoundOver ? '#777' : '#ffffff',
          borderRadius: 5,
          padding: '9px 12px',
          cursor: isExecuting || isRoundOver ? 'default' : 'pointer',
          fontSize: 11,
          fontWeight: 900,
          letterSpacing: 1,
          textTransform: 'uppercase',
          minWidth: 118,
          ...commandButtonStyle,
        }}
      >
        {planningMode ? 'Planning' : 'Plan Execute'}
      </button>

      <button
        data-testid="hud-command-contact-drill"
        onClick={() => !isExecuting && startContactDrill()}
        disabled={isExecuting}
        title="Load a prepared first-contact scenario for testing movement, danger, and held angles."
        aria-label="Start Banana contact drill"
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
          ...commandButtonStyle,
        }}
      >
        Banana Drill
      </button>

      {plannedActions.length > 0 ? (
        <button
          data-testid="hud-command-run-execute"
          onClick={() => !isExecuting && !isRoundOver && commitPlannedActions()}
          disabled={isExecuting || isRoundOver}
          title="Resolve all queued movement orders together until contact or completion."
          aria-label={isExecuting ? 'Executing queued orders' : 'Run execute'}
          style={{
            border: 'none',
            background: isExecuting ? '#5b665f' : '#2fbf71',
            color: isExecuting || isRoundOver ? '#d3d7d2' : '#06110b',
            borderRadius: 5,
            padding: '10px 14px',
            cursor: isExecuting || isRoundOver ? 'default' : 'pointer',
            fontSize: 11,
            fontWeight: 950,
            letterSpacing: 1.1,
            textTransform: 'uppercase',
            minWidth: 118,
            boxShadow: isExecuting ? 'none' : '0 0 14px rgba(47,191,113,0.35)',
            gridColumn: compact ? '1 / -1' : undefined,
            ...commandButtonStyle,
          }}
        >
          {isExecuting ? 'Executing' : 'Run Execute'}
        </button>
      ) : (
        <button
          data-testid="hud-command-end-side"
          onClick={() => !isExecuting && !isRoundOver && endTurn()}
          disabled={isExecuting || isRoundOver}
          title={`Pass control from ${activeTeam} side to the other team.`}
          aria-label={`End turn for ${activeTeam} side`}
          style={{
            border: 'none',
            background: teamColor,
            color: isExecuting || isRoundOver ? '#888' : '#ffffff',
            borderRadius: 5,
            padding: '10px 14px',
            cursor: isExecuting || isRoundOver ? 'default' : 'pointer',
            fontSize: 11,
            fontWeight: 950,
            letterSpacing: 1.1,
            textTransform: 'uppercase',
            minWidth: 118,
            boxShadow: `0 0 14px ${teamColor}55`,
            gridColumn: compact ? '1 / -1' : undefined,
            ...commandButtonStyle,
          }}
        >
          End Turn
        </button>
      )}

      {plannedActions.length > 0 && (
        <button
          data-testid="hud-command-end-side-secondary"
          onClick={() => !isExecuting && !isRoundOver && endTurn()}
          disabled={isExecuting || isRoundOver}
          title={`Discard remaining tempo and pass control from ${activeTeam} side.`}
          aria-label={`End turn for ${activeTeam} side`}
          style={{
            border: '1px solid #3a2f2f',
            background: 'rgba(130, 60, 50, 0.28)',
            color: isExecuting || isRoundOver ? '#675a58' : '#d8b9b5',
            borderRadius: 5,
            padding: '6px 10px',
            cursor: isExecuting || isRoundOver ? 'default' : 'pointer',
            fontSize: 9,
            fontWeight: 850,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
          }}
        >
          End Turn
        </button>
      )}
    </div>
  );
}

// --- Phase announcement (center screen) ---
function PhaseAnnouncement() {
  const phase = useGameStore((s) => s.round.phase);
  const turn = useGameStore((s) => s.round.turn);
  const compact = useIsCompactViewport();

  const showSetup = phase === 'setup';
  const showCombat = phase === 'combat' && turn === 3; // show on first combat turn

  if (!showSetup && !showCombat) return null;

  return (
    <div style={{
      position: 'absolute', top: compact ? 136 : '15%', left: '50%', transform: 'translateX(-50%)',
      textAlign: 'center', opacity: 0.6,
      width: compact ? 'calc(100vw - 24px)' : 'auto',
    }}>
      <div style={{
        color: PHASE_COLORS[phase], fontSize: compact ? 13 : 16, fontWeight: 800,
        letterSpacing: compact ? 4 : 6, textTransform: 'uppercase',
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
  const incomingCoverLabel = topIncomingThreat
    ? getCoverStateLabel(topIncomingThreat.preview)
    : null;
  const apColor = movementTile
    ? (movementTile.apCost <= 1 ? '#5df2ff' : '#f7cf5f')
    : '#777';
  const actionEconomy = movementTile
    ? (movementTile.apCost <= 1 ? 'SHOT REMAINS' : 'FULL COMMIT')
    : (tile.walkable ? 'WALKABLE' : 'BLOCKED');
  const risk = watchedBy
    ? { label: 'CONTACT RISK', color: '#ff6b82' }
    : topIncomingThreat
      ? topIncomingThreat.preview.coverState === 'protected'
        ? { label: 'CONTESTED', color: getCoverStateColor(topIncomingThreat.preview) }
        : { label: topIncomingThreat.preview.coverState.toUpperCase(), color: getCoverStateColor(topIncomingThreat.preview) }
      : phase === 'setup'
        ? { label: 'SETUP SAFE', color: '#aa8833' }
        : { label: 'NO KNOWN LOS', color: '#58ff9a' };
  const threatDetail = watchedBy
    ? `Watched by ${watchedBy}`
    : topIncomingThreat
      ? `${topIncomingThreat.unit.role.displayName} ${topIncomingThreat.unit.name}: ${topIncomingThreat.preview.hitChance}% | ${incomingCoverLabel} | range -${formatPenalty(topIncomingThreat.preview.rangePenalty)} cover -${formatPenalty(topIncomingThreat.preview.coverPenalty)}`
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
          <TileBadge color={getCoverStateColor(topIncomingThreat.preview)} label={`${topIncomingThreat.preview.hitChance}% ${getCoverStateLabel(topIncomingThreat.preview)}`} />
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
  const compact = useIsCompactViewport();
  if (compact) return null;

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
