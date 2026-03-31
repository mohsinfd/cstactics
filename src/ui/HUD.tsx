// ============================================================
// HUD: Professional game overlay for CS2 Tactics.
//
// Components:
//   TopBar — T/CT scores, round, phase, turn counter
//   SelectedUnitPanel — role, stats, weapon, AP remaining
//   TeamRoster — mini icons for all 5 units of active team
//   EndTurnButton — prominent button to end current team's turn
//   PhaseAnnouncement — center screen phase label
//   MapLabel — bottom-right Inferno branding
//   TileInfo — bottom-center hovered tile callout name
// ============================================================
import { useGameStore } from '../game/store';

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
      <EndTurnButton />
      <PhaseAnnouncement />
      <TileInfo />
      <MapLabel />
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

  if (selectedId === null) return null;
  const unit = units.find((u) => u.id === selectedId);
  if (!unit) return null;

  const teamColor = unit.team === 'T' ? '#b8860b' : '#4488cc';

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

// --- End Turn button ---
function EndTurnButton() {
  const endTurn = useGameStore((s) => s.endTurn);
  const activeTeam = useGameStore((s) => s.round.activeTeam);
  const teamColor = activeTeam === 'T' ? '#b8860b' : '#2255aa';

  return (
    <div style={{
      position: 'absolute', bottom: 20, right: 20,
      pointerEvents: 'auto',
    }}>
      <button
        onClick={endTurn}
        style={{
          background: teamColor,
          color: '#ffffff',
          border: 'none',
          borderRadius: 6,
          padding: '10px 28px',
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 1.5,
          cursor: 'pointer',
          textTransform: 'uppercase',
          boxShadow: `0 2px 12px ${teamColor}66`,
          transition: 'all 150ms ease',
        }}
        onMouseOver={(e) => {
          (e.target as HTMLButtonElement).style.transform = 'scale(1.05)';
        }}
        onMouseOut={(e) => {
          (e.target as HTMLButtonElement).style.transform = 'scale(1)';
        }}
      >
        End Turn
      </button>
      <div style={{ color: '#555', fontSize: 9, textAlign: 'center', marginTop: 4, letterSpacing: 0.5 }}>
        {activeTeam === 'T' ? 'T' : 'CT'} TURN
      </div>
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

  if (!hoveredTile) return null;

  const tile = map.grid[hoveredTile.y]?.[hoveredTile.x];
  if (!tile || !tile.label) return null;

  return (
    <div style={{
      position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(8, 8, 12, 0.85)', padding: '4px 14px',
      borderRadius: 4, border: '1px solid #333',
    }}>
      <span style={{ color: '#aaa', fontSize: 11, fontWeight: 600, letterSpacing: 1 }}>
        {tile.label.toUpperCase()}
      </span>
      <span style={{ color: '#555', fontSize: 9, marginLeft: 8 }}>
        ({hoveredTile.x}, {hoveredTile.y})
      </span>
    </div>
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
