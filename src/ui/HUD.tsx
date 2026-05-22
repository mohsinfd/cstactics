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
import type { CSSProperties, ReactNode } from 'react';
import './hud.css';
import type { ExecuteInterruptTimelineItem, ExecuteTimelineEvent, MapData, TileCoord } from '../game/types';
import { getCrossingHeldAngles } from '../game/threats';
import { getShotPreview, type ShotPreview } from '../game/combat';
import { RULES } from '../game/config/rules';
import { AudioFeedback } from './AudioFeedback';
import { getShotPresentation } from '../game/shotPresentation';
import { META_DEFAULTS } from '../game/metaDefaults';
import {
  EXECUTE_TIMING_STEP_MS,
  formatExecuteTime,
  getExecuteTimingBounds,
  getPlannedActionBeat,
  sortExecuteTimelineEvents,
  sortPlannedActionsByBeat,
} from '../game/executeTimeline';
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

function getTimelineItemColor(kind: ExecuteInterruptTimelineItem['kind'], shotColor: string): string {
  if (kind === 'move' || kind === 'swing') return '#58ff9a';
  if (kind === 'hold') return '#75b9ff';
  if (kind === 'shot') return shotColor;
  return '#d8c170';
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

function useIsDenseHudViewport(): boolean {
  const compactWidth = useViewportBelow(760);
  const laptopWidth = useViewportBelow(1180);
  const laptopHeight = useViewportHeightBelow(921);
  const mediumHeight = useViewportHeightBelow(760);
  const shortHeight = useViewportHeightBelow(640);
  const zoomed = useVisualViewportScaleAbove(1.1);
  return compactWidth || laptopHeight || (laptopWidth && mediumHeight) || shortHeight || zoomed;
}

function useIsNarrowViewport(): boolean {
  return useViewportBelow(1000);
}

function shouldUseEdgeCommandDeck(): boolean {
  return true;
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

function useViewportHeightBelow(height: number): boolean {
  const [isShort, setIsShort] = useState(() => (
    typeof window !== 'undefined' ? window.innerHeight < height : false
  ));

  useEffect(() => {
    const onResize = () => setIsShort(window.innerHeight < height);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [height]);

  return isShort;
}

function useVisualViewportScaleAbove(scale: number): boolean {
  const [isZoomed, setIsZoomed] = useState(() => (
    typeof window !== 'undefined' && window.visualViewport
      ? window.visualViewport.scale > scale
      : false
  ));

  useEffect(() => {
    const viewport = window.visualViewport;
    const onResize = () => setIsZoomed(Boolean(window.visualViewport && window.visualViewport.scale > scale));
    onResize();
    window.addEventListener('resize', onResize);
    viewport?.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      viewport?.removeEventListener('resize', onResize);
    };
  }, [scale]);

  return isZoomed;
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

function getMetaPresetTitle(team: 'T' | 'CT'): string {
  return META_DEFAULTS[team].map((meta) => `${meta.id}: ${meta.label}`).join(' | ');
}

function tileDistance(a: TileCoord, b: TileCoord): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function HUD() {
  return (
    <div data-testid="hud-root" className="hud-root" style={{
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
      <ExecuteTimelinePanel />
      <BombObjectivePanel />
      <ExecutePlanner />
      <NextActionPanel />
      <MetaSetupGuide />
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

function NextActionPanel() {
  const round = useGameStore((s) => s.round);
  const map = useGameStore((s) => s.map);
  const units = useGameStore((s) => s.units);
  const selectedUnitId = useGameStore((s) => s.selectedUnitId);
  const movementTiles = useGameStore((s) => s.movementTiles);
  const planningMode = useGameStore((s) => s.planningMode);
  const plannedActions = useGameStore((s) => s.plannedActions);
  const isExecuting = useGameStore((s) => s.isExecuting);
  const inputMode = useGameStore((s) => s.inputMode);
  const executeInterrupt = useGameStore((s) => s.executeInterrupt);
  const smokes = useGameStore((s) => s.smokes);
  const aiStatus = useGameStore((s) => s.aiStatus);
  const guidanceEvent = useGameStore((s) => s.guidanceEvent);
  const compact = useIsCompactViewport();
  const dense = useIsDenseHudViewport();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!guidanceEvent) return;
    const timer = window.setInterval(() => setNow(Date.now()), 300);
    return () => window.clearInterval(timer);
  }, [guidanceEvent]);

  if (dense && executeInterrupt) return null;

  const selectedUnit = selectedUnitId === null
    ? null
    : units.find((unit) => unit.id === selectedUnitId) ?? null;
  const activeUnitsWithAp = units.filter((unit) => (
    unit.alive &&
    unit.team === round.activeTeam &&
    unit.ap > 0
  ));
  const shootableTargets = selectedUnit
    ? units.filter((target) => {
      if (!target.alive || target.team === selectedUnit.team) return false;
      if (round.phase === 'setup' && !RULES.setupFiringAllowed) return false;
      if (selectedUnit.ap < getWeaponShotApCost(selectedUnit.weapon) || selectedUnit.ammoInClip <= 0) return false;
      const preview = getShotPreview(map, selectedUnit, target, 0, target.position, smokes);
      return preview.hasLineOfSight && preview.inRange;
    })
    : [];

  const recentGuidance = guidanceEvent && now - guidanceEvent.createdAt < 3800
    ? guidanceEvent
    : null;
  const teamLabel = round.activeTeam === 'T' ? 'T side' : 'CT side';
  const nextPlayer = activeUnitsWithAp.find((unit) => unit.id !== selectedUnitId) ?? activeUnitsWithAp[0] ?? null;
  const copy = recentGuidance
    ? {
      kicker: recentGuidance.tone === 'warning' ? 'Input blocked' : 'Setup applied',
      title: recentGuidance.title,
      detail: recentGuidance.detail,
      accent: recentGuidance.tone === 'warning' ? '#ff6b82' : '#68e6a1',
    }
    : executeInterrupt
      ? {
        kicker: 'Contact break',
        title: 'Make the trade call',
        detail: 'Use the Contact Break panel or the highlighted target to punish the holder.',
        accent: '#ff6b82',
      }
      : isExecuting
        ? {
          kicker: 'Resolving',
          title: 'Watch the execute beat',
          detail: 'Movement, utility, and contact resolve in order; the game freezes on meaningful danger.',
          accent: '#68e6a1',
        }
        : aiStatus
          ? {
            kicker: 'Opponent turn',
            title: 'CT response running',
            detail: aiStatus.message,
            accent: '#65b7ff',
          }
          : round.phase === 'roundend'
            ? {
              kicker: 'Round over',
              title: 'Start the next round',
              detail: 'Use New Round from the objective panel to keep the match moving.',
              accent: '#d8c170',
            }
            : !selectedUnit
              ? {
                kicker: `${teamLabel} command`,
                title: round.phase === 'setup' ? 'Set the opening shape' : 'Select a player',
                detail: round.phase === 'setup'
                  ? `No meta applied. ${teamLabel} starts in spawn; Random Meta is optional.`
                  : 'Pick a friendly miniature or roster portrait with AP.',
                accent: round.activeTeam === 'T' ? '#d8c170' : '#65b7ff',
              }
              : selectedUnit.ap <= 0
                ? {
                  kicker: `${selectedUnit.name} spent`,
                  title: nextPlayer ? `Switch to ${nextPlayer.name}` : 'End the turn',
                  detail: nextPlayer
                    ? 'This unit has no AP. Pick the next player with AP.'
                    : 'Every active player is spent; pass control to the other side.',
                  accent: '#8b95a8',
                }
                : inputMode === 'shoot'
                  ? {
                    kicker: `${selectedUnit.name} aiming`,
                    title: shootableTargets.length > 0 ? 'Click a target' : 'No clean shot',
                    detail: shootableTargets.length > 0
                      ? `${shootableTargets.length} visible target${shootableTargets.length === 1 ? '' : 's'} can be fired on.`
                      : 'Swap actions, move for line of sight, or hold an angle.',
                    accent: shootableTargets.length > 0 ? '#ff6b82' : '#d8c170',
                  }
                  : inputMode === 'hold_angle'
                    ? {
                      kicker: `${selectedUnit.name} holding`,
                      title: 'Pick a watched lane',
                      detail: 'Click a corridor or choke point to create a reaction-fire angle.',
                      accent: '#65b7ff',
                    }
                    : inputMode === 'smoke' || inputMode === 'flash'
                      ? {
                        kicker: `${selectedUnit.name} utility`,
                        title: inputMode === 'smoke' ? 'Place smoke' : 'Place flash',
                        detail: 'Click a reachable walkable tile to commit the utility throw.',
                        accent: '#d8c170',
                      }
                      : planningMode
                        ? {
                          kicker: 'Plan execute',
                          title: plannedActions.length > 0 ? 'Queue more or run it' : 'Pick an execute tile',
                          detail: plannedActions.length > 0
                            ? `${plannedActions.length} order${plannedActions.length === 1 ? '' : 's'} queued. Run Execute when the timing is ready.`
                            : 'Click a highlighted destination to queue this player, then build the hit.',
                          accent: '#68e6a1',
                        }
                        : plannedActions.length > 0
                          ? {
                            kicker: 'Orders ready',
                            title: 'Run the execute',
                            detail: 'You can resolve queued orders now, or keep planning the next timing piece.',
                            accent: '#68e6a1',
                          }
                          : {
                            kicker: `${selectedUnit.name} ready`,
                            title: movementTiles.length > 0 ? 'Choose movement or action' : 'Choose an action',
                            detail: movementTiles.length > 0
                              ? 'Click a highlighted tile, enter Shoot, hold an angle, or queue a Plan Execute.'
                              : 'No movement tiles are available; shoot, hold, utility, reload, or finish the unit.',
                            accent: round.activeTeam === 'T' ? '#d8c170' : '#65b7ff',
                          };

  return (
    <div data-testid="hud-next-action-panel" style={{
      position: 'absolute',
      top: dense ? 96 : compact ? 122 : 126,
      left: '50%',
      transform: 'translateX(-50%)',
      width: dense
        ? 'min(330px, calc(100vw - 20px))'
        : compact ? 'min(360px, calc(100vw - 18px))' : 'min(460px, calc(100vw - 40px))',
      padding: dense ? '5px 8px' : '9px 12px',
      pointerEvents: 'none',
      border: `1px solid ${copy.accent}55`,
      borderLeft: `3px solid ${copy.accent}`,
      borderRadius: dense ? 6 : 8,
      background: 'rgba(8, 10, 15, 0.76)',
      boxShadow: dense ? `0 8px 18px rgba(0,0,0,0.28)` : `0 10px 30px rgba(0,0,0,0.34), 0 0 18px ${copy.accent}1f`,
      backdropFilter: dense ? 'blur(10px) saturate(1.08)' : 'blur(14px) saturate(1.15)',
      WebkitBackdropFilter: dense ? 'blur(10px) saturate(1.08)' : 'blur(14px) saturate(1.15)',
      display: 'grid',
      gridTemplateColumns: dense ? '1fr' : 'auto minmax(0, 1fr)',
      gap: dense ? 2 : 9,
      alignItems: 'center',
      boxSizing: 'border-box',
    }}>
      <div style={{
        color: copy.accent,
        fontSize: dense ? 7 : 9,
        fontWeight: 950,
        letterSpacing: dense ? 0.7 : 1,
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}>
        {copy.kicker}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{
          color: '#f2f5fb',
          fontSize: dense ? 9 : 12,
          fontWeight: 950,
          letterSpacing: 0.2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {copy.title}
        </div>
        <div style={{
          color: '#9aa4b5',
          fontSize: dense ? 7 : 10,
          fontWeight: 750,
          lineHeight: 1.25,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {copy.detail}
        </div>
      </div>
    </div>
  );
}

function MetaSetupGuide() {
  const round = useGameStore((s) => s.round);
  const compact = useIsCompactViewport();
  const dense = useIsDenseHudViewport();
  if (round.phase !== 'setup' || dense) return null;

  const presets = META_DEFAULTS[round.activeTeam];
  const accent = round.activeTeam === 'T' ? '#d8c170' : '#65b7ff';

  return (
    <div data-testid="hud-meta-setup-guide" style={{
      position: 'absolute',
      top: dense ? 170 : 184,
      right: compact ? 8 : 20,
      width: dense ? 'min(246px, calc(100vw - 16px))' : 284,
      padding: dense ? '7px 8px' : '9px 10px',
      pointerEvents: 'none',
      border: `1px solid ${accent}40`,
      borderLeft: `3px solid ${accent}`,
      borderRadius: 8,
      background: 'rgba(8, 10, 15, 0.72)',
      boxShadow: '0 12px 30px rgba(0,0,0,0.3)',
      backdropFilter: 'blur(14px) saturate(1.12)',
      WebkitBackdropFilter: 'blur(14px) saturate(1.12)',
      boxSizing: 'border-box',
    }}>
      <div style={{
        color: accent,
        fontSize: dense ? 8 : 9,
        fontWeight: 950,
        letterSpacing: 1,
        textTransform: 'uppercase',
      }}>
        Spawn start active
      </div>
      <div style={{
        color: '#eef3ff',
        fontSize: dense ? 10 : 11,
        fontWeight: 900,
        lineHeight: 1.28,
        marginTop: 4,
      }}>
        No preset applied: {round.activeTeam === 'T' ? 'T Spawn' : 'CT Spawn'}
      </div>
      <div style={{
        color: '#8d97a8',
        fontSize: dense ? 8 : 9,
        fontWeight: 760,
        lineHeight: 1.25,
        marginTop: 2,
      }}>
        Random Meta assigns spawn slots by:
      </div>
      <div style={{
        display: 'grid',
        gap: 3,
        marginTop: dense ? 5 : 7,
      }}>
        {presets.map((preset) => (
          <div key={preset.id} style={{
            display: 'grid',
            gridTemplateColumns: dense ? '38px minmax(0, 1fr)' : '44px minmax(0, 1fr)',
            gap: dense ? 5 : 7,
            alignItems: 'baseline',
            minWidth: 0,
          }}>
            <span style={{
              color: accent,
              fontSize: dense ? 8 : 9,
              fontWeight: 950,
              fontFamily: "'Courier New', monospace",
            }}>
              {preset.id}
            </span>
            <span style={{
              color: '#9aa4b5',
              fontSize: dense ? 8 : 9,
              fontWeight: 760,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {preset.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContactBreakPanel() {
  const interrupt = useGameStore((s) => s.executeInterrupt);
  const units = useGameStore((s) => s.units);
  const map = useGameStore((s) => s.map);
  const selectedId = useGameStore((s) => s.selectedUnitId);
  const selectUnit = useGameStore((s) => s.selectUnit);
  const compact = useIsCompactViewport();
  const dense = useIsDenseHudViewport();
  if (!interrupt) return null;

  const event = interrupt.event;
  const target = units.find((unit) => unit.id === event.targetId);
  const shooter = units.find((unit) => unit.id === event.attackerId);
  const tile = map.grid[interrupt.contactTile.y]?.[interrupt.contactTile.x];
  const tileLabel = tile?.label ?? 'contact tile';
  const trade = interrupt.tradeShot;
  const bomb = interrupt.bombPressure;
  const shot = getShotPresentation(event.weaponCategory);
  const stoppedName = target?.name ?? event.targetName;
  const shooterName = shooter?.name ?? event.attackerName;
  const resultText = event.killed
    ? event.critical ? `HS KILL -${event.damage}` : `KILL -${event.damage}`
    : event.critical
      ? `HEADSHOT -${event.damage}`
      : event.hit
        ? `-${event.damage} HP`
        : 'MISS';
  const decisionCall = trade
    ? 'Trade now'
    : event.killed
      ? 'No clean trade'
      : 'Hold and recover';
  const decisionDetail = trade
    ? `${trade.shooterName} can punish ${trade.targetName}`
    : event.killed
      ? `${stoppedName} is down; stabilize the break`
      : `${stoppedName} survived; reset the angle`;
  const shotReadout = `${event.hitChance}% / ${event.damage} dmg / ${getCoverStateLabel(event)}`;
  const responderReadout = trade
    ? `${trade.shooterName}: ${trade.hitChance}% / ${trade.damage} dmg / ${getCoverStateLabel(trade)}`
    : 'No clean trade from AP, ammo, or line of sight';
  const bombText = bomb.bombPlanted
    ? `Bomb planted: ${bomb.bombTimer} turns`
    : bomb.bombDropped
      ? 'Bomb dropped: recover it'
      : null;
  const takeTrade = () => {
    if (!trade) return;
    if (selectedId !== trade.shooterId) selectUnit(trade.shooterId);
    window.setTimeout(() => useGameStore.getState().shootUnit(trade.targetId), 0);
  };

  return (
    <div data-testid="hud-contact-break-panel" style={{
      position: 'absolute',
      top: dense ? (compact ? 102 : 112) : compact ? 132 : 132,
      left: dense ? 8 : compact ? 10 : 20,
      transform: 'none',
      width: dense
        ? compact
          ? 'min(216px, calc(50vw - 12px))'
          : 'min(360px, calc(100vw - 32px))'
        : compact
          ? 'min(236px, calc(50vw - 34px))'
          : 'min(340px, calc(100vw - 40px))',
      boxSizing: 'border-box',
      maxHeight: dense
        ? compact
          ? 108
          : 'min(38vh, 260px)'
        : compact
          ? 'calc(100vh - 330px)'
          : 'min(34vh, 250px)',
      overflowY: 'auto',
      background: 'rgba(10, 7, 10, 0.94)',
      border: `1px solid ${shot.color}70`,
      borderLeft: `3px solid ${shot.color}`,
      borderRadius: 6,
      padding: dense ? '7px 8px' : compact ? '8px 9px' : '10px 12px',
      pointerEvents: 'auto',
      boxShadow: `0 10px 28px rgba(0,0,0,0.38), 0 0 18px ${shot.color}24`,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 5 : 8,
        marginBottom: compact ? 4 : 5,
        flexWrap: compact ? 'wrap' : 'nowrap',
      }}>
        <div style={{
          color: '#ff6b82',
          fontSize: compact ? 9 : 10,
          fontWeight: 950,
          letterSpacing: compact ? 1.1 : 1.8,
          textTransform: 'uppercase',
        }}>
          Contact Break
        </div>
        <div style={{
          color: shot.color,
          border: `1px solid ${shot.color}66`,
          background: `${shot.color}18`,
          borderRadius: 3,
          padding: compact ? '2px 4px' : '2px 5px',
          fontSize: compact ? 7 : 8,
          fontWeight: 950,
          letterSpacing: compact ? 0.4 : 0.8,
          textTransform: 'uppercase',
        }}>
          {shot.label}
        </div>
        <div style={{
          marginLeft: compact ? 0 : 'auto',
          flexBasis: compact ? '100%' : undefined,
          color: '#d8c170',
          fontSize: compact ? 8 : 9,
          fontWeight: 950,
          letterSpacing: compact ? 0.5 : 0.7,
          textTransform: 'uppercase',
        }}>
          {interrupt.beatLabel} {interrupt.phaseLabel}
        </div>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: compact ? '1fr' : '1fr auto',
        alignItems: 'center',
        gap: compact ? 3 : 8,
        padding: compact ? '5px 6px' : '6px 7px',
        border: `1px solid ${shot.color}38`,
        background: `${shot.color}14`,
        borderRadius: 4,
      }}>
        <span
          data-testid="hud-contact-decision-call"
          style={{
            color: trade ? '#f4e7b4' : event.killed ? '#ffb3c0' : '#d8dce4',
            fontSize: compact ? 11 : 13,
            fontWeight: 950,
            letterSpacing: compact ? 0.3 : 0.5,
            textTransform: 'uppercase',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {decisionCall}
        </span>
        <span style={{
          color: event.hit ? '#ffffff' : '#d8c170',
          fontSize: compact ? 10 : 12,
          fontWeight: 950,
          fontFamily: "'Courier New', monospace",
          whiteSpace: 'nowrap',
        }}>
          {resultText}
        </span>
        <span style={{
          gridColumn: compact ? '1' : '1 / 3',
          color: '#96878e',
          fontSize: compact ? 8 : 9,
          fontWeight: 800,
          lineHeight: 1.25,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {decisionDetail}
        </span>
      </div>
      <div style={{
        display: 'grid',
        gap: compact ? 2 : 3,
        marginTop: compact ? 5 : 6,
        color: '#d8dce4',
        fontSize: compact ? 8 : 9,
        lineHeight: 1.25,
      }}>
        <DecisionFactRow compact={compact} label="Stopped" testId="hud-contact-stopped">
          {stoppedName} at {tileLabel}
        </DecisionFactRow>
        <DecisionFactRow compact={compact} label="Shooter" testId="hud-contact-shooter">
          {shooterName} - {event.weaponName} - {shotReadout}
        </DecisionFactRow>
        <DecisionFactRow compact={compact} label="Responder" testId="hud-contact-responder" color={trade ? '#f4e7b4' : '#8e7d82'}>
          {responderReadout}
        </DecisionFactRow>
        {bombText && (
          <DecisionFactRow compact={compact} label="Bomb" testId="hud-contact-bomb-pressure" color="#ffd166">
            {bombText}
          </DecisionFactRow>
        )}
      </div>
      <div data-testid="hud-contact-timeline" style={{
        display: 'grid',
        gap: compact ? 3 : 4,
        marginTop: compact ? 5 : 7,
      }}>
        {interrupt.timeline.map((item) => {
          const itemColor = getTimelineItemColor(item.kind, shot.color);
          return (
            <div
              key={item.id}
              data-testid="hud-contact-timeline-item"
              style={{
                display: 'grid',
                gridTemplateColumns: compact ? '34px minmax(0, 1fr)' : '42px minmax(0, 1fr)',
                gap: compact ? 5 : 7,
                alignItems: 'start',
                paddingTop: compact ? 3 : 4,
                borderTop: '1px solid rgba(255,255,255,0.055)',
              }}
            >
              <span style={{
                color: itemColor,
                fontSize: compact ? 7 : 8,
                fontWeight: 950,
                fontFamily: "'Courier New', monospace",
                lineHeight: 1.4,
                whiteSpace: 'nowrap',
              }}>
                {item.timeLabel}
              </span>
              <span style={{ minWidth: 0, display: 'grid', gap: 1 }}>
                <span style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: compact ? 4 : 6,
                  minWidth: 0,
                }}>
                  <span style={{
                    color: itemColor,
                    fontSize: compact ? 7 : 8,
                    fontWeight: 950,
                    letterSpacing: compact ? 0.4 : 0.6,
                    textTransform: 'uppercase',
                    flex: '0 0 auto',
                  }}>
                    {item.phaseLabel}
                  </span>
                  <span style={{
                    color: '#e5e8ee',
                    fontSize: compact ? 8 : 9,
                    fontWeight: 850,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {item.title}
                  </span>
                </span>
                <span style={{
                  color: '#8e7d82',
                  fontSize: compact ? 8 : 9,
                  lineHeight: 1.25,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {item.detail}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ color: '#70646a', fontSize: compact ? 8 : 9, lineHeight: 1.35, marginTop: 3, textTransform: 'uppercase', letterSpacing: compact ? 0.3 : 0.5 }}>
        Shot: {event.hitChance}% | {getCoverStateLabel(event)} | range -{formatPenalty(event.rangePenalty)} | cover -{formatPenalty(event.coverPenalty)}{event.flashPenalty > 0 ? ` | flash -${formatPenalty(event.flashPenalty)}` : ''}
      </div>
      <div style={{
        marginTop: compact ? 6 : 8,
        paddingTop: compact ? 6 : 7,
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'grid',
        gap: compact ? 5 : 6,
      }}>
        {trade ? (
          <button
            type="button"
            data-testid="hud-contact-trade-shot"
            onClick={takeTrade}
            style={{
              border: '1px solid rgba(216,193,112,0.55)',
              background: 'rgba(216,193,112,0.16)',
              color: '#f4e7b4',
              borderRadius: 4,
              padding: compact ? '6px 7px' : '7px 8px',
              textAlign: 'left',
              cursor: 'pointer',
              display: 'grid',
              gridTemplateColumns: compact ? '1fr' : '1fr auto',
              gap: compact ? 3 : 8,
              alignItems: 'center',
              fontSize: compact ? 9 : 10,
              fontWeight: 850,
            }}
          >
            <span>
              Trade: {trade.shooterName} on {trade.targetName}
            </span>
            <span style={{ color: '#fff', fontFamily: "'Courier New', monospace" }}>
              {trade.hitChance}% / {trade.damage}
            </span>
            <span style={{
              gridColumn: compact ? '1' : '1 / 3',
              color: getCoverStateColor(trade),
              fontSize: compact ? 7 : 8,
              fontWeight: 800,
              letterSpacing: compact ? 0.3 : 0.5,
              textTransform: 'uppercase',
            }}>
              {getCoverStateLabel(trade)} | HS {trade.critChance}%/{trade.critDamage}
            </span>
          </button>
        ) : (
          <div data-testid="hud-contact-no-trade" style={{ color: '#756870', fontSize: compact ? 8 : 9, lineHeight: 1.35 }}>
            No clean trade is available from current AP, ammo, and line of sight.
          </div>
        )}
      </div>
    </div>
  );
}

function DecisionFactRow({
  children,
  color = '#d8dce4',
  compact,
  label,
  testId,
}: {
  children: ReactNode;
  color?: string;
  compact: boolean;
  label: string;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      style={{
        display: 'grid',
        gridTemplateColumns: compact ? '54px minmax(0, 1fr)' : '68px minmax(0, 1fr)',
        gap: compact ? 5 : 7,
        minWidth: 0,
      }}
    >
      <span style={{
        color: '#756870',
        fontSize: compact ? 7 : 8,
        fontWeight: 950,
        letterSpacing: compact ? 0.4 : 0.6,
        textTransform: 'uppercase',
      }}>
        {label}
      </span>
      <span style={{
        color,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        fontWeight: 800,
      }}>
        {children}
      </span>
    </div>
  );
}

function getExecuteTimelineItemColor(kind: ExecuteTimelineEvent['kind']): string {
  if (kind === 'utility_planned' || kind === 'utility_resolved' || kind === 'bomb_pressure') return '#d8c170';
  if (kind === 'move_start' || kind === 'swing_start' || kind === 'movement_beat') return '#58ff9a';
  if (kind === 'contact' || kind === 'reaction_shot') return '#75b9ff';
  if (kind === 'shot_result') return '#ff6b82';
  return '#cfd3dc';
}

function getCompactExecuteTimelineEvents(events: ExecuteTimelineEvent[]): ExecuteTimelineEvent[] {
  const resolvedActionIds = new Set(
    events
      .filter((event) => event.kind === 'utility_resolved' && event.actionId)
      .map((event) => event.actionId)
  );

  return sortExecuteTimelineEvents(events)
    .filter((event) => !(event.kind === 'utility_planned' && event.actionId && resolvedActionIds.has(event.actionId)));
}

function ExecuteTimelinePanel() {
  const interrupt = useGameStore((s) => s.executeInterrupt);
  const isExecuting = useGameStore((s) => s.isExecuting);
  const currentTimeline = useGameStore((s) => s.currentExecuteTimeline);
  const lastTimeline = useGameStore((s) => s.lastExecuteTimeline);
  const compact = useIsCompactViewport();
  const dense = useIsDenseHudViewport();

  if (interrupt) return null;

  const timeline = isExecuting
    ? currentTimeline
    : lastTimeline?.status === 'completed' && lastTimeline.source === 'planned_execute'
      ? lastTimeline
      : null;
  if (!timeline || timeline.events.length === 0) return null;

  const itemLimit = compact || dense ? 3 : 4;
  const displayableItems = getCompactExecuteTimelineEvents(timeline.events);
  const items = displayableItems.slice(0, itemLimit);
  if (displayableItems.length === 0) return null;

  const hiddenCount = Math.max(0, displayableItems.length - items.length);
  const title = timeline.status === 'running' ? 'Execute Live' : 'Execute Debrief';
  const sourceLabel = timeline.source === 'planned_execute' ? 'Plan' : 'Move';

  return (
    <div data-testid="hud-execute-timeline-panel" style={{
      position: 'absolute',
      top: compact ? 196 : dense ? 128 : 132,
      left: compact ? 10 : 20,
      width: compact
        ? 'min(246px, calc(100vw - 20px))'
        : dense
          ? 'min(280px, calc(100vw - 40px))'
          : 'min(320px, calc(100vw - 40px))',
      minWidth: compact ? 214 : 260,
      boxSizing: 'border-box',
      background: 'rgba(7, 9, 13, 0.84)',
      border: `1px solid ${timeline.status === 'running' ? '#58ff9a66' : '#d8c17055'}`,
      borderLeft: `3px solid ${timeline.status === 'running' ? '#58ff9a' : '#d8c170'}`,
      borderRadius: 6,
      padding: compact || dense ? '7px 8px' : '9px 11px',
      pointerEvents: 'none',
      boxShadow: '0 10px 24px rgba(0,0,0,0.32)',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        minWidth: 0,
        marginBottom: 5,
      }}>
        <span style={{
          color: timeline.status === 'running' ? '#58ff9a' : '#d8c170',
          fontSize: compact ? 9 : 10,
          fontWeight: 950,
          letterSpacing: compact ? 1 : 1.3,
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}>
          {title}
        </span>
        <span style={{
          color: '#77818f',
          border: '1px solid rgba(119,129,143,0.35)',
          borderRadius: 3,
          padding: '1px 4px',
          fontSize: 8,
          fontWeight: 900,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}>
          {timeline.activeTeam} {sourceLabel}
        </span>
      </div>
      <div style={{ display: 'grid', gap: compact ? 3 : 4 }}>
        {items.map((item) => {
          const itemColor = getExecuteTimelineItemColor(item.kind);
          return (
            <div
              key={item.id}
              data-testid="hud-execute-timeline-item"
              style={{
                display: 'grid',
                gridTemplateColumns: compact ? '34px 36px minmax(0, 1fr)' : '42px 44px minmax(0, 1fr)',
                gap: compact ? 5 : 7,
                alignItems: 'baseline',
                borderTop: '1px solid rgba(255,255,255,0.055)',
                paddingTop: compact ? 3 : 4,
                minWidth: 0,
              }}
            >
              <span style={{
                color: itemColor,
                fontSize: compact ? 7 : 8,
                fontWeight: 950,
                fontFamily: "'Courier New', monospace",
                whiteSpace: 'nowrap',
              }}>
                {item.timeLabel}
              </span>
              <span style={{
                color: itemColor,
                fontSize: compact ? 7 : 8,
                fontWeight: 950,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {item.phaseLabel}
              </span>
              <span style={{ display: 'grid', gap: 1, minWidth: 0 }}>
                <span style={{
                  color: '#e5e8ee',
                  fontSize: compact ? 8 : 9,
                  fontWeight: 850,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {item.title}
                </span>
                <span style={{
                  color: '#7d8798',
                  fontSize: compact ? 8 : 9,
                  lineHeight: 1.2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {item.detail}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      {hiddenCount > 0 && (
        <div style={{
          marginTop: 4,
          color: '#596272',
          fontSize: 8,
          fontWeight: 850,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          textAlign: 'right',
        }}>
          +{hiddenCount} beats
        </div>
      )}
    </div>
  );
}

function dispatchCameraCommand(command: 'zoom-in' | 'zoom-out' | 'reset') {
  window.dispatchEvent(new CustomEvent('cs2-camera-command', { detail: command }));
}

function ViewControlPanel() {
  const compact = useIsCompactViewport();
  const dense = useIsDenseHudViewport();
  const buttonWidth = dense ? 26 : 38;
  const buttonHeight = dense ? 24 : 34;

  return (
    <div data-testid="hud-view-controls" style={{
      position: 'absolute',
      top: dense ? 96 : compact ? 154 : '50%',
      right: compact ? 10 : 20,
      transform: dense || compact ? undefined : 'translateY(-50%)',
      display: 'grid',
      gridTemplateColumns: compact || dense ? `repeat(3, ${buttonWidth}px)` : `${buttonWidth}px`,
      gap: dense ? 3 : 6,
      padding: dense ? 3 : 7,
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
        width={buttonWidth}
        height={buttonHeight}
      />
      <CameraButton
        label="-"
        title="Zoom out"
        onClick={() => dispatchCameraCommand('zoom-out')}
        width={buttonWidth}
        height={buttonHeight}
      />
      <CameraButton
        label="RST"
        title="Reset camera"
        onClick={() => dispatchCameraCommand('reset')}
        width={buttonWidth}
        height={buttonHeight}
      />
    </div>
  );
}

function CameraButton({
  label,
  title,
  onClick,
  width,
  height,
}: {
  label: string;
  title: string;
  onClick: () => void;
  width: number;
  height: number;
}) {
  return (
    <button
      type="button"
      data-testid={`hud-camera-${title.toLowerCase().replaceAll(' ', '-')}`}
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{
        width,
        height,
        borderRadius: 5,
        border: '1px solid #343948',
        background: 'rgba(255,255,255,0.045)',
        color: '#d8dce4',
        cursor: 'pointer',
        fontSize: label.length > 1 ? Math.max(7, Math.min(8, height * 0.28)) : Math.max(12, Math.min(15, height * 0.52)),
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
    <div data-testid="hud-ai-status" style={{
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
  const interrupt = useGameStore((s) => s.executeInterrupt);
  const dense = useIsDenseHudViewport();
  if (combatLog.length === 0) return null;
  if (dense && interrupt) return null;

  const hasObjectivePanel = round.bombPlanted || round.phase === 'roundend' || (!round.bombPlanted && round.bombCarrierId === null && Boolean(round.bombPosition));

  return (
    <div data-testid="hud-combat-log" style={{
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
        const shot = getShotPresentation(event.weaponCategory);
        const resultLabel = event.killed ? (event.critical ? 'HS KILL' : 'KILL') : event.critical ? 'HEADSHOT' : event.hit ? 'HIT' : 'MISS';
        const resultColor = event.killed || event.critical ? '#ffffff' : event.hit ? shot.secondaryColor : '#aaa';
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
              <span style={{
                color: shot.color,
                border: `1px solid ${shot.color}45`,
                background: `${shot.color}12`,
                borderRadius: 3,
                padding: '1px 4px',
                marginLeft: 6,
                fontSize: 8,
                fontWeight: 900,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
              }}>
                {event.weaponName}
              </span>
              {event.hit && (
                <span style={{ color: '#fff', marginLeft: 6, fontWeight: 950, fontFamily: "'Courier New', monospace" }}>
                  -{event.damage}
                </span>
              )}
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
  const interrupt = useGameStore((s) => s.executeInterrupt);
  const dense = useIsDenseHudViewport();
  const bombDropped = !round.bombPlanted && round.bombCarrierId === null && Boolean(round.bombPosition);
  if (!round.bombPlanted && round.phase !== 'roundend' && !bombDropped) return null;
  if (dense && interrupt) return null;

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
    <div data-testid="hud-bomb-objective-panel" style={{
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
  const setPlannedActionTiming = useGameStore((s) => s.setPlannedActionTiming);
  const isExecuting = useGameStore((s) => s.isExecuting);
  const teamColor = activeTeam === 'T' ? '#b8860b' : '#2255aa';
  const timelineActions = sortPlannedActionsByBeat(plannedActions);
  const utilityTiming = getExecuteTimingBounds('smoke');
  const swingTiming = getExecuteTimingBounds('move');

  if (!planningMode && plannedActions.length === 0) return null;

  return (
    <div data-testid="hud-execute-planner" style={{
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
            <span style={{ color: '#d8c170' }}>
              Utility {formatExecuteTime(utilityTiming.minMs)}-{formatExecuteTime(utilityTiming.maxMs)}
            </span>
            <span style={{ color: '#4b5362' }}>-&gt;</span>
            <span style={{ color: '#58ff9a' }}>
              Swing {formatExecuteTime(swingTiming.minMs)}-{formatExecuteTime(swingTiming.maxMs)}
            </span>
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
              const timingBounds = getExecuteTimingBounds(action.kind);
              const canShiftEarlier = beat.timeMs > timingBounds.minMs;
              const canShiftLater = beat.timeMs < timingBounds.maxMs;
              const timingButtonStyle = {
                width: 19,
                height: 21,
                border: `1px solid ${statusColor}44`,
                background: 'rgba(255,255,255,0.045)',
                color: statusColor,
                borderRadius: 3,
                padding: 0,
                fontSize: 11,
                fontWeight: 950,
                lineHeight: 1,
                cursor: isExecuting ? 'default' : 'pointer',
              };
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
                  <span style={{ display: 'flex', alignItems: 'center', gap: 2, flex: '0 0 auto' }}>
                    <button
                      onClick={() => setPlannedActionTiming(action.id, beat.timeMs - EXECUTE_TIMING_STEP_MS)}
                      disabled={isExecuting || !canShiftEarlier}
                      title={`${unit?.name ?? 'Unit'} earlier`}
                      aria-label={`${unit?.name ?? 'Unit'} earlier`}
                      style={{
                        ...timingButtonStyle,
                        opacity: isExecuting || !canShiftEarlier ? 0.32 : 1,
                        cursor: isExecuting || !canShiftEarlier ? 'default' : 'pointer',
                      }}
                    >
                      -
                    </button>
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
                    <button
                      onClick={() => setPlannedActionTiming(action.id, beat.timeMs + EXECUTE_TIMING_STEP_MS)}
                      disabled={isExecuting || !canShiftLater}
                      title={`${unit?.name ?? 'Unit'} later`}
                      aria-label={`${unit?.name ?? 'Unit'} later`}
                      style={{
                        ...timingButtonStyle,
                        opacity: isExecuting || !canShiftLater ? 0.32 : 1,
                        cursor: isExecuting || !canShiftLater ? 'default' : 'pointer',
                      }}
                    >
                      +
                    </button>
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
  const dense = useIsDenseHudViewport();

  if (dense) return null;
  if (selectedId === null || movementTiles.length === 0) return null;
  const selectedUnit = units.find((unit) => unit.id === selectedId);
  const shotCost = selectedUnit ? getWeaponShotApCost(selectedUnit.weapon) : 1;
  const oneApNote = shotCost <= 1
    ? 'shoot remains'
    : `${selectedUnit?.weapon.category ?? 'weapon'} needs 2 AP`;

  return (
    <div data-testid="hud-movement-legend" style={{
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
  const dense = useIsDenseHudViewport();
  const sidePadding = dense ? '2px 6px' : compact ? '6px 8px' : '6px 24px';
  const sideMinWidth = dense ? 56 : compact ? 78 : 60;
  const centerPadding = dense ? '2px 8px' : compact ? '6px 10px' : '6px 24px';
  const centerMinWidth = dense ? 88 : compact ? 116 : 140;
  const labelSize = dense ? 7 : compact ? 9 : 10;
  const labelSpacing = dense ? 0.5 : compact ? 1.1 : 1.5;
  const scoreSize = dense ? 16 : compact ? 24 : 28;

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
          color: PHASE_COLORS[round.phase], fontSize: dense ? 6 : compact ? 8 : 9, fontWeight: 700,
          letterSpacing: dense ? 0.8 : compact ? 1.8 : 2.5, textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}>
          {PHASE_LABELS[round.phase]}
        </div>
        <div style={{ color: '#fff', fontSize: dense ? 12 : compact ? 18 : 20, fontWeight: 800, fontFamily: "'Courier New', monospace", whiteSpace: 'nowrap' }}>
          Round {match.currentRound}
        </div>
        <div style={{ color: '#777', fontSize: dense ? 7 : compact ? 9 : 10, letterSpacing: 0.3, whiteSpace: 'nowrap' }}>
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
  const dense = useIsDenseHudViewport();

  const teamUnits = units.filter((u) => u.team === activeTeam);
  const teamColor = activeTeam === 'T' ? '#b8860b' : '#4488cc';

  return (
    <div data-testid="hud-team-roster" style={{
      position: 'absolute', top: dense ? 44 : compact ? 80 : 80, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', gap: dense ? 3 : compact ? 4 : 6, pointerEvents: 'auto',
      maxWidth: 'calc(100vw - 14px)',
    }}>
      {teamUnits.map((u) => {
        const isSel = u.id === selectedId;
        const hasAP = u.ap > 0;
        return (
          <button
            key={u.id}
            type="button"
            data-testid={`hud-roster-unit-${u.id}`}
            aria-label={`Select ${u.team} ${u.role.displayName} ${u.name}${hasAP ? `, ${u.ap} AP` : ', no AP'}`}
            disabled={!u.alive}
            onClick={() => selectUnit(u.id)}
            style={{
              width: dense ? 34 : compact ? 48 : 56,
              padding: dense ? '2px 0' : '4px 0',
              textAlign: 'center',
              cursor: u.alive ? 'pointer' : 'not-allowed',
              appearance: 'none',
              background: isSel ? `${teamColor}44` : 'rgba(8,8,12,0.85)',
              border: `1px solid ${isSel ? teamColor : '#333'}`,
              borderRadius: 4,
              font: 'inherit',
              opacity: u.alive ? (hasAP ? 1 : 0.5) : 0.25,
              transition: 'all 150ms ease',
            }}
          >
            <div style={{ color: teamColor, fontSize: dense ? 7 : 9, fontWeight: 700, letterSpacing: 0.3 }}>
              {ROLE_ICONS[u.role.id]}
            </div>
            {!dense && <div style={{ color: '#aaa', fontSize: 8, marginTop: 1 }}>{u.name}</div>}
            <div style={{
              display: 'flex', gap: 2, justifyContent: 'center', marginTop: dense ? 2 : 3,
            }}>
              {Array.from({ length: u.maxAp }, (_, i) => (
                <div key={i} style={{
                  width: dense ? 4 : 6, height: dense ? 4 : 6, borderRadius: '50%',
                  background: i < u.ap ? '#44ee66' : '#333',
                }} />
              ))}
            </div>
          </button>
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
  const interrupt = useGameStore((s) => s.executeInterrupt);
  const compact = useIsCompactViewport();
  const narrow = useIsNarrowViewport();
  const dense = useIsDenseHudViewport();
  const edgeDeck = shouldUseEdgeCommandDeck();
  const splitForContact = compact && Boolean(interrupt);
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
  const showDetailedReadouts = !dense && !edgeDeck;
  const targetOptionsToShow = (dense || edgeDeck) ? shotOptions.slice(0, 1) : shotOptions.slice(0, 3);
  const denseActionButtonStyle = (dense || edgeDeck)
    ? {
      padding: dense ? '4px 3px' : '5px 4px',
      fontSize: dense ? 7 : 8,
      letterSpacing: dense ? 0.1 : 0.3,
    }
    : {};

  if (dense || edgeDeck) {
    const densePanelButtonStyle = ({
      active = false,
      disabled = false,
      accent = teamColor,
      color = '#f5f5f5',
      background,
    }: {
      active?: boolean;
      disabled?: boolean;
      accent?: string;
      color?: string;
      background?: string;
    }): CSSProperties => ({
      minWidth: 0,
      padding: dense ? '4px 3px' : '5px 4px',
      borderRadius: 4,
      border: `1px solid ${active ? `${accent}aa` : disabled ? '#30313a' : `${accent}66`}`,
      background: background ?? (active ? `${accent}2e` : 'rgba(255,255,255,0.035)'),
      color: disabled ? '#666' : color,
      cursor: disabled ? 'default' : 'pointer',
      fontSize: dense ? 7 : 8,
      fontWeight: 850,
      letterSpacing: dense ? 0.1 : 0.25,
      lineHeight: 1,
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    });

    return (
      <div data-testid="hud-selected-unit-panel" style={{
        position: 'absolute',
        bottom: dense ? 48 : 72,
        left: splitForContact ? 'calc(50% + 7px)' : compact ? 8 : 12,
        right: compact ? 8 : undefined,
        width: compact ? undefined : dense ? 'min(320px, calc(100vw - 24px))' : 'min(430px, calc(100vw - 40px))',
        boxSizing: 'border-box',
        background: 'rgba(8, 8, 12, 0.94)',
        border: `1px solid ${teamColor}33`,
        borderLeft: `3px solid ${teamColor}`,
        borderRadius: dense ? 5 : 6,
        padding: dense ? '4px 5px' : '6px 7px',
        pointerEvents: 'auto',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          minWidth: 0,
          marginBottom: dense ? 3 : 5,
          fontSize: dense ? 8 : 9,
          lineHeight: 1,
        }}>
          <span style={{
            color: teamColor,
            fontSize: 10,
            fontWeight: 950,
            letterSpacing: 0.5,
            flex: '0 0 auto',
          }}>
            {ROLE_ICONS[unit.role.id] ?? unit.team}
          </span>
          <span style={{
            minWidth: 0,
            color: '#cfd3dc',
            fontWeight: 800,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {unit.name}
          </span>
          <span style={{
            marginLeft: 'auto',
            color: '#8f96a5',
            fontFamily: "'Courier New', monospace",
            fontSize: 9,
            fontWeight: 800,
            whiteSpace: 'nowrap',
          }}>
            AP {unit.ap}/{unit.maxAp} HP {unit.hp}
          </span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: dense ? 3 : 4,
        }}>
          <button
            data-testid="hud-action-move"
            onClick={() => setInputMode('move')}
            disabled={unit.ap <= 0}
            style={densePanelButtonStyle({ active: inputMode === 'move', disabled: unit.ap <= 0 })}
          >
            Move
          </button>
          <button
            data-testid="hud-action-shoot"
            onClick={() => setInputMode(inputMode === 'shoot' ? 'move' : 'shoot')}
            disabled={Boolean(shootingDisabledReason)}
            style={densePanelButtonStyle({
              active: inputMode === 'shoot',
              disabled: Boolean(shootingDisabledReason),
              accent: '#d8c170',
              color: '#f4e7b4',
            })}
          >
            Shoot {shotApCost}AP
          </button>
          {targetOptionsToShow.map(({ target, preview }) => (
            <button
              data-testid={`hud-visible-target-${target.id}`}
              key={target.id}
              onClick={() => shootUnit(target.id)}
              style={densePanelButtonStyle({
                accent: '#ff4e6a',
                color: '#ffd7dd',
                background: 'rgba(255,78,106,0.13)',
              })}
              title={`${target.role.displayName} ${target.name}: ${preview.hitChance}%`}
            >
              TGT {preview.hitChance}%
            </button>
          ))}
          <button
            data-testid="hud-action-hold-angle"
            onClick={() => setInputMode(inputMode === 'hold_angle' ? 'move' : 'hold_angle')}
            disabled={unit.ap <= 0 || unit.ammoInClip <= 0}
            style={densePanelButtonStyle({
              active: inputMode === 'hold_angle',
              disabled: unit.ap <= 0 || unit.ammoInClip <= 0,
              accent: '#ff4e6a',
              color: '#ffd7dd',
            })}
          >
            Hold
          </button>
          <button
            data-testid="hud-action-smoke"
            onClick={() => setInputMode(inputMode === 'smoke' ? 'move' : 'smoke')}
            disabled={Boolean(smokeDisabledReason)}
            style={densePanelButtonStyle({
              active: inputMode === 'smoke',
              disabled: Boolean(smokeDisabledReason),
              accent: '#c5d1df',
              color: '#dce7f2',
            })}
          >
            Smoke
          </button>
          <button
            data-testid="hud-action-flash"
            onClick={() => setInputMode(inputMode === 'flash' ? 'move' : 'flash')}
            disabled={Boolean(flashDisabledReason)}
            style={densePanelButtonStyle({
              active: inputMode === 'flash',
              disabled: Boolean(flashDisabledReason),
              accent: '#fff1a8',
              color: '#fff7d0',
            })}
          >
            Flash
          </button>
          <button
            data-testid="hud-action-reload"
            onClick={reloadWeapon}
            disabled={Boolean(reloadDisabledReason)}
            title={reloadDisabledReason ?? 'Reload weapon'}
            style={densePanelButtonStyle({
              disabled: Boolean(reloadDisabledReason),
              accent: '#8bd3ff',
              color: '#d8ecff',
            })}
          >
            Reload
          </button>
          {showPlantAction && (
            <button
              data-testid="hud-action-plant"
              onClick={plantBomb}
              disabled={Boolean(plantDisabledReason)}
              title={plantDisabledReason ?? `Plant bomb on ${plantSite} site`}
              style={densePanelButtonStyle({
                disabled: Boolean(plantDisabledReason),
                accent: '#ff4e6a',
                color: '#ffd7dd',
              })}
            >
              Plant
            </button>
          )}
          {showDefuseAction && (
            <button
              data-testid="hud-action-defuse"
              onClick={defuseBomb}
              disabled={Boolean(defuseDisabledReason)}
              title={defuseDisabledReason ?? 'Defuse the planted bomb'}
              style={densePanelButtonStyle({
                disabled: Boolean(defuseDisabledReason),
                accent: '#65b7ff',
                color: '#d8ecff',
              })}
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
              style={densePanelButtonStyle({
                disabled: Boolean(pickupDisabledReason),
                accent: '#ffd166',
                color: '#fff1b5',
              })}
            >
              Pickup
            </button>
          )}
          <button
            data-testid="hud-action-done"
            onClick={finishUnit}
            disabled={unit.ap <= 0}
            style={densePanelButtonStyle({
              disabled: unit.ap <= 0,
              accent: teamColor,
              color: '#ffffff',
              background: unit.ap > 0 ? `${teamColor}2e` : 'rgba(255,255,255,0.035)',
            })}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="hud-selected-unit-panel" style={{
      position: 'absolute',
      bottom: dense ? 74 : narrow ? 156 : 20,
      left: splitForContact ? 'calc(50% + 7px)' : compact ? 8 : 20,
      right: compact ? 8 : undefined,
      boxSizing: 'border-box',
      background: 'rgba(8, 8, 12, 0.94)',
      border: `1px solid ${teamColor}33`,
      borderLeft: `3px solid ${teamColor}`,
      borderRadius: 6,
      padding: dense ? '8px 9px' : splitForContact ? '9px 9px' : compact ? '10px 12px' : '12px 16px',
      minWidth: compact ? 0 : 260,
      maxWidth: compact ? undefined : 380,
      maxHeight: dense ? 'min(16vh, 90px)' : splitForContact ? 'calc(100vh - 380px)' : narrow ? 'calc(100vh - 250px)' : 'calc(100vh - 96px)',
      overflowY: 'auto',
      pointerEvents: 'auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: dense ? 6 : 8, marginBottom: dense ? 4 : 6 }}>
        <span style={{ color: teamColor, fontSize: dense ? 10 : 12, fontWeight: 800, letterSpacing: dense ? 0.6 : 1 }}>
          {unit.role.displayName.toUpperCase()}
        </span>
        <span style={{ color: '#888', fontSize: dense ? 10 : 11 }}>{unit.name}</span>
        <span style={{ color: '#555', fontSize: 9, marginLeft: 'auto' }}>
          {unit.team}
        </span>
      </div>

      {/* HP bar */}
      <div style={{ marginBottom: dense ? 4 : 6 }}>
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: dense ? '4px 10px' : 14, fontSize: dense ? 9 : 10, marginBottom: dense ? 4 : 6 }}>
        <StatBox label="AP" value={`${unit.ap}/${unit.maxAp}`} highlight={unit.ap > 0} />
        {!dense && <StatBox label="MOB" value={unit.role.mobility} />}
        {!dense && <StatBox label="AIM" value={unit.role.baseAim} />}
        <StatBox label="AMO" value={`${unit.ammoInClip}/${unit.reserveAmmo}`} highlight={unit.ammoInClip > 0} />
        <StatBox label="SMK" value={unit.smokeGrenades} highlight={unit.smokeGrenades > 0} />
        <StatBox label={unit.flashTurns > 0 ? 'FLD' : 'FLS'} value={unit.flashTurns > 0 ? 'YES' : unit.flashbangs} highlight={unit.flashTurns > 0 || unit.flashbangs > 0} />
        {!dense && <StatBox label="$" value={unit.money} />}
      </div>

      {/* Weapon */}
      {showDetailedReadouts && <div style={{
        fontSize: 10, color: '#ccc', padding: '5px 8px',
        background: 'rgba(255,255,255,0.03)', borderRadius: 3, marginBottom: 4,
      }}>
        <span style={{ color: '#555', marginRight: 6 }}>WPN</span>
        {unit.weapon.name}
        <span style={{ color: '#555', marginLeft: 8, fontFamily: "'Courier New', monospace" }}>
          DMG {unit.weapon.baseDamage}
        </span>
      </div>}

      {/* Ability */}
      {showDetailedReadouts && <div style={{ fontSize: 9, color: '#666' }}>
        <span style={{ color: teamColor, marginRight: 4, fontWeight: 700 }}>Q</span>
        {unit.role.abilityName}
      </div>}

      <div style={{ display: 'grid', gridTemplateColumns: dense ? 'repeat(3, minmax(0, 1fr))' : 'repeat(3, minmax(72px, 1fr))', gap: dense ? 4 : 6, marginTop: dense ? 6 : 10 }}>
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
            ...denseActionButtonStyle,
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
            ...denseActionButtonStyle,
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
            ...denseActionButtonStyle,
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
            ...denseActionButtonStyle,
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
            ...denseActionButtonStyle,
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
            ...denseActionButtonStyle,
          }}
        >
          Reload 1AP
        </button>
      </div>

      {(showPlantAction || showDefuseAction || showPickupAction) && (
        <div style={{ display: 'grid', gridTemplateColumns: dense ? 'repeat(auto-fit, minmax(64px, 1fr))' : 'repeat(auto-fit, minmax(82px, 1fr))', gap: dense ? 4 : 6, marginTop: dense ? 5 : 7 }}>
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
                ...denseActionButtonStyle,
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
                ...denseActionButtonStyle,
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
                ...denseActionButtonStyle,
              }}
            >
              Pickup
            </button>
          )}
        </div>
      )}

      {!dense && inputMode === 'hold_angle' && (
        <div style={{ color: '#b36b77', fontSize: 9, marginTop: 6, lineHeight: 1.35 }}>
          Click a lane or angle on the map.
        </div>
      )}
      {!dense && inputMode === 'shoot' && (
        <div style={{ color: '#b8a45b', fontSize: 9, marginTop: 6, lineHeight: 1.35 }}>
          Click a visible enemy to fire.
        </div>
      )}
      {!dense && inputMode === 'smoke' && (
        <div style={{ color: '#bfc9d6', fontSize: 9, marginTop: 6, lineHeight: 1.35 }}>
          Click a tile within 12 tiles to block line of sight.
        </div>
      )}
      {!dense && inputMode === 'flash' && (
        <div style={{ color: '#d8c170', fontSize: 9, marginTop: 6, lineHeight: 1.35 }}>
          Click a tile within 12 tiles. Enemies in the burst take a major aim penalty.
        </div>
      )}
      {!dense && inputMode === 'shoot' && shootingDisabledReason && (
        <div style={{ color: '#706f6a', fontSize: 9, marginTop: 6, lineHeight: 1.35 }}>
          Shoot disabled: {shootingDisabledReason}
        </div>
      )}
      {!dense && reloadDisabledReason && unit.ammoInClip <= 0 && (
        <div style={{ color: '#6f7e8e', fontSize: 9, marginTop: 6, lineHeight: 1.35 }}>
          Reload: {reloadDisabledReason}
        </div>
      )}
      {!dense && smokeDisabledReason && inputMode === 'smoke' && (
        <div style={{ color: '#707985', fontSize: 9, marginTop: 6, lineHeight: 1.35 }}>
          Smoke disabled: {smokeDisabledReason}
        </div>
      )}
      {!dense && flashDisabledReason && inputMode === 'flash' && (
        <div style={{ color: '#837849', fontSize: 9, marginTop: 6, lineHeight: 1.35 }}>
          Flash disabled: {flashDisabledReason}
        </div>
      )}
      {!dense && showPlantAction && plantDisabledReason && unit.hasBomb && (
        <div style={{ color: '#7b6c71', fontSize: 9, marginTop: 6, lineHeight: 1.35 }}>
          Plant disabled: {plantDisabledReason}
        </div>
      )}
      {!dense && showDefuseAction && defuseDisabledReason && round.bombPlanted && unit.team === 'CT' && (
        <div style={{ color: '#6f7e8e', fontSize: 9, marginTop: 6, lineHeight: 1.35 }}>
          Defuse disabled: {defuseDisabledReason}
        </div>
      )}
      {!dense && showPickupAction && pickupDisabledReason && (
        <div style={{ color: '#837849', fontSize: 9, marginTop: 6, lineHeight: 1.35 }}>
          Pickup disabled: {pickupDisabledReason}
        </div>
      )}
      {showDetailedReadouts && topShotPreview && !shootingDisabledReason && (
        <div style={{ color: '#b8a45b', fontSize: 9, marginTop: 6, lineHeight: 1.35 }}>
          Best shot: {topShotPreview.hitChance}% / {topShotPreview.damage} dmg / HS {topShotPreview.critChance}% for {topShotPreview.critDamage} / {getCoverStateLabel(topShotPreview)}
        </div>
      )}
      {targetOptionsToShow.length > 0 && !shootingDisabledReason && (
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
          {targetOptionsToShow.map(({ target, preview }) => (
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
          padding: dense ? '5px 8px' : '7px 10px',
          borderRadius: 4,
          border: `1px solid ${unit.ap > 0 ? `${teamColor}77` : '#333'}`,
          background: unit.ap > 0 ? `${teamColor}22` : 'rgba(255,255,255,0.03)',
          color: unit.ap > 0 ? '#f5f5f5' : '#666',
          cursor: unit.ap > 0 ? 'pointer' : 'default',
          fontSize: dense ? 8 : 10,
          fontWeight: 800,
          letterSpacing: dense ? 0.5 : 1,
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
  const startDuelLab = useGameStore((s) => s.startDuelLab);
  const startMovementProof = useGameStore((s) => s.startMovementProof);
  const applyMetaDefaultSetup = useGameStore((s) => s.applyMetaDefaultSetup);
  const teamColor = activeTeam === 'T' ? '#b8860b' : '#2255aa';
  const compact = useIsCompactViewport();
  const dense = useIsDenseHudViewport();
  const isRoundOver = phase === 'roundend';
  const commandButtonStyle = compact || dense
    ? {
      width: '100%',
      minWidth: 0,
      padding: dense ? '5px 4px' : '9px 8px',
      fontSize: dense ? 7 : 10,
      letterSpacing: dense ? 0.1 : 0.8,
      minHeight: dense ? 28 : undefined,
    }
    : {};
  const commandGridColumns = compact
    ? 'repeat(2, minmax(0, 1fr))'
    : dense
      ? 'repeat(5, minmax(0, 1fr))'
      : undefined;

  return (
    <div data-testid="hud-command-bar" style={{
      position: 'absolute',
      bottom: dense ? 5 : compact ? 14 : 18,
      left: compact ? 8 : '50%',
      transform: compact ? 'none' : 'translateX(-50%)',
      width: compact ? 'min(300px, calc(100vw - 16px))' : dense ? 'min(500px, calc(100vw - 20px))' : 'min(760px, calc(100vw - 40px))',
      background: 'rgba(8, 8, 12, 0.94)',
      border: '1px solid #2a2f3a',
      borderRadius: dense ? 6 : 7,
      padding: dense ? 4 : compact ? 8 : '9px 10px',
      pointerEvents: 'auto',
      display: compact || dense ? 'grid' : 'flex',
      gridTemplateColumns: commandGridColumns,
      flexWrap: compact || dense ? undefined : 'wrap',
      alignItems: 'center',
      gap: dense ? 4 : 8,
      boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
    }}>
      <div style={{
        minWidth: 0,
        flex: compact || dense ? undefined : '1 1 170px',
        gridColumn: compact && !dense ? '1 / -1' : undefined,
        display: dense ? 'none' : undefined,
      }}>
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

      {phase === 'setup' && (
        <button
          data-testid="hud-command-meta-setup"
          onClick={() => !isExecuting && applyMetaDefaultSetup()}
          disabled={isExecuting}
          title={`Optional. Default is spawn. Randomly applies one ${activeTeam} preset as spawn-slot weighting, not a lane teleport: ${getMetaPresetTitle(activeTeam)}.`}
          aria-label={`Apply random ${activeTeam} meta setup`}
          style={{
            border: '1px solid #374252',
            background: 'rgba(117, 185, 255, 0.14)',
            color: isExecuting ? '#68707b' : '#b9d8ff',
            borderRadius: 5,
            padding: '9px 9px',
            cursor: isExecuting ? 'default' : 'pointer',
            fontSize: dense ? 8 : 10,
            fontWeight: 900,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            minWidth: 96,
            ...commandButtonStyle,
          }}
        >
          Random Meta
        </button>
      )}

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

      <button
        data-testid="hud-command-duel-lab"
        onClick={() => !isExecuting && startDuelLab()}
        disabled={isExecuting}
        title="Load a compact 1v1 lab for testing movement, shooting, cover, utility, and weapon feel."
        aria-label="Start Duel Lab"
        style={{
          border: '1px solid #29403a',
          background: 'rgba(91, 214, 158, 0.14)',
          color: isExecuting ? '#4d6b5f' : '#9fe6c8',
          borderRadius: 5,
          padding: '9px 10px',
          cursor: isExecuting ? 'default' : 'pointer',
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          minWidth: 96,
          ...commandButtonStyle,
        }}
      >
        Duel Lab
      </button>

      {import.meta.env.DEV && (
        <button
          data-testid="hud-command-movement-proof"
          onClick={() => !isExecuting && void startMovementProof()}
          disabled={isExecuting}
          title="Run a deterministic CT movement proof: forward, aim-locked strafe, stop-brace."
          aria-label="Start Movement Proof"
          style={{
            border: '1px solid #314a52',
            background: 'rgba(93, 242, 255, 0.12)',
            color: isExecuting ? '#50696d' : '#a8f7ff',
            borderRadius: 5,
            padding: '9px 10px',
            cursor: isExecuting ? 'default' : 'pointer',
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            minWidth: 112,
            ...commandButtonStyle,
          }}
        >
          Move Proof
        </button>
      )}

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
            gridColumn: compact && !dense ? '1 / -1' : undefined,
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
            gridColumn: compact && !dense ? '1 / -1' : undefined,
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
            fontSize: dense ? 8 : 9,
            fontWeight: 850,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            ...(dense ? commandButtonStyle : {}),
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
  const interrupt = useGameStore((s) => s.executeInterrupt);
  const compact = useIsCompactViewport();
  const dense = useIsDenseHudViewport();

  const showSetup = phase === 'setup';
  const showCombat = phase === 'combat' && turn === 3; // show on first combat turn

  if (!showSetup && !showCombat) return null;
  if (dense) return null;
  if (dense && interrupt) return null;

  return (
    <div data-testid="hud-phase-announcement" style={{
      position: 'absolute', top: dense ? 108 : compact ? 136 : '15%', left: '50%', transform: 'translateX(-50%)',
      textAlign: 'center', opacity: 0.6,
      width: compact ? 'calc(100vw - 24px)' : 'auto',
    }}>
      <div style={{
        color: PHASE_COLORS[phase], fontSize: dense ? 11 : compact ? 13 : 16, fontWeight: 800,
        letterSpacing: dense ? 3 : compact ? 4 : 6, textTransform: 'uppercase',
      }}>
        {showCombat ? 'FIRST CONTACT!' : PHASE_LABELS[phase]}
      </div>
      <div style={{ color: '#555', fontSize: dense ? 9 : 10, marginTop: dense ? 2 : 4 }}>
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
  const compact = useIsCompactViewport();
  const dense = useIsDenseHudViewport();

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
    <div data-testid="hud-tile-info" style={{
      position: 'absolute',
      top: compact ? 206 : undefined,
      right: dense || compact ? 8 : 20,
      bottom: compact ? undefined : dense ? 50 : 178,
      width: compact
        ? 'min(260px, calc(100vw - 20px))'
        : dense
          ? 'min(230px, calc(100vw - 20px))'
          : 'min(310px, calc(100vw - 40px))',
      background: 'rgba(8, 8, 12, 0.86)',
      padding: dense ? '5px 7px' : compact ? '7px 9px' : '8px 11px',
      borderRadius: 6,
      border: `1px solid ${risk.color}55`,
      boxShadow: '0 10px 24px rgba(0,0,0,0.32)',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: compact || dense ? 8 : 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: '#d8dce4', fontSize: compact || dense ? 10 : 11, fontWeight: 900, letterSpacing: compact || dense ? 0.8 : 1.2, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {label}
          </div>
          <div style={{ color: '#5e6573', fontSize: 9, marginTop: 2 }}>
            Destination {hoveredTile.x}, {hoveredTile.y}
          </div>
        </div>
        <div style={{
          color: risk.color,
          fontSize: compact || dense ? 9 : 10,
          fontWeight: 950,
          letterSpacing: compact || dense ? 0.7 : 1,
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}>
          {risk.label}
        </div>
      </div>

      <div style={{ display: 'flex', gap: compact || dense ? 4 : 6, flexWrap: 'wrap', marginTop: compact || dense ? 6 : 7 }}>
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
  const dense = useIsDenseHudViewport();
  if (compact || dense) return null;

  return (
    <div data-testid="hud-map-label" style={{
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
