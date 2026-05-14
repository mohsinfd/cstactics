import { useEffect, useMemo, useState, type CSSProperties } from 'react';

type BoardPhase = 'ready' | 'move-select' | 'moving' | 'aiming' | 'invalid' | 'firing' | 'impact' | 'down';
type BoardMode = 'idle' | 'move' | 'shoot';
type TileId = 'ct-start' | 'short-1' | 'logs' | 'center' | 'site-left' | 'site-mid' | 'site-box' | 'coffins';

type BoardTile = {
  id: TileId;
  label: string;
  x: number;
  y: number;
  cover?: 'full' | 'half';
};

const boardTiles: BoardTile[] = [
  { id: 'ct-start', label: 'CT start', x: 22.7, y: 72.4, cover: 'half' },
  { id: 'short-1', label: 'Short lane', x: 30.1, y: 65.7 },
  { id: 'logs', label: 'Logs peek', x: 38.6, y: 58.7, cover: 'full' },
  { id: 'center', label: 'Center site lane', x: 47.6, y: 52.1 },
  { id: 'site-left', label: 'Left site', x: 56.4, y: 47.5 },
  { id: 'site-mid', label: 'B mark', x: 64.5, y: 43.6 },
  { id: 'site-box', label: 'Site box', x: 70.3, y: 38.8, cover: 'half' },
  { id: 'coffins', label: 'Coffins edge', x: 77.3, y: 34.6, cover: 'full' },
];

const targetPoint = { x: 78.8, y: 31.5 };
const tileById = new Map(boardTiles.map((tile) => [tile.id, tile]));

const phaseCopy: Record<BoardPhase, string> = {
  ready: 'CT anchor ready. Choose move or shot.',
  'move-select': 'Pick a blue floor tile.',
  moving: 'CT shifts into the angle.',
  aiming: 'Target lock: 70%. Click the T.',
  invalid: 'Invalid command.',
  firing: 'AWP fired through B lane.',
  impact: 'Hit confirmed.',
  down: 'Entry down. B lane held.',
};

export function CinematicBoardDuelSlice() {
  const [phase, setPhase] = useState<BoardPhase>('ready');
  const [mode, setMode] = useState<BoardMode>('idle');
  const [ctTileId, setCtTileId] = useState<TileId>('ct-start');
  const [pathTileIds, setPathTileIds] = useState<TileId[]>(['ct-start']);

  const isBusy = phase === 'moving' || phase === 'firing' || phase === 'impact';
  const isAlive = phase !== 'down';
  const ctTile = tileById.get(ctTileId) ?? boardTiles[0];
  const selectedTileIndex = boardTiles.findIndex((tile) => tile.id === ctTileId);

  useEffect(() => {
    if (phase === 'moving') {
      const timer = window.setTimeout(() => {
        setPhase('ready');
        setMode('idle');
      }, 520);
      return () => window.clearTimeout(timer);
    }

    if (phase === 'firing') {
      const timer = window.setTimeout(() => setPhase('impact'), 300);
      return () => window.clearTimeout(timer);
    }

    if (phase === 'impact') {
      const timer = window.setTimeout(() => {
        setPhase('down');
        setMode('idle');
      }, 680);
      return () => window.clearTimeout(timer);
    }

    if (phase === 'invalid') {
      const timer = window.setTimeout(() => setPhase(mode === 'shoot' ? 'aiming' : mode === 'move' ? 'move-select' : 'ready'), 680);
      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, [mode, phase]);

  const className = useMemo(() => [
    'board-duel',
    `phase-${phase}`,
    `mode-${mode}`,
    ctTileId !== 'ct-start' ? 'ct-advanced' : '',
  ].filter(Boolean).join(' '), [ctTileId, mode, phase]);

  const beginMove = () => {
    if (!isAlive || isBusy) return;
    setMode('move');
    setPhase('move-select');
  };

  const commitMove = (tileId: TileId) => {
    if (!isAlive || isBusy || mode !== 'move') {
      setPhase('invalid');
      return;
    }

    const destinationIndex = boardTiles.findIndex((tile) => tile.id === tileId);
    const currentIndex = Math.max(0, selectedTileIndex);
    if (destinationIndex < 0 || destinationIndex === currentIndex) {
      setPhase('invalid');
      return;
    }

    const [start, end] = currentIndex < destinationIndex
      ? [currentIndex, destinationIndex]
      : [destinationIndex, currentIndex];
    const route = boardTiles.slice(start, end + 1).map((tile) => tile.id);
    setPathTileIds(currentIndex < destinationIndex ? route : route.reverse());
    setCtTileId(tileId);
    setPhase('moving');
  };

  const beginShoot = () => {
    if (!isAlive || isBusy) return;
    setMode('shoot');
    setPhase('aiming');
  };

  const fireShot = () => {
    if (!isAlive || isBusy) return;

    if (mode !== 'shoot') {
      setPhase('invalid');
      return;
    }

    setPhase('firing');
  };

  const rejectBoardClick = () => {
    if (!isAlive || isBusy || mode === 'idle') return;
    setPhase('invalid');
  };

  const reset = () => {
    setPhase('ready');
    setMode('idle');
    setCtTileId('ct-start');
    setPathTileIds(['ct-start']);
  };

  const handleTileClick = (tileId: TileId) => {
    if (mode === 'move') {
      commitMove(tileId);
      return;
    }

    if (mode === 'shoot') {
      setPhase('invalid');
    }
  };

  const tokenStyle = {
    '--unit-x': `${ctTile.x}%`,
    '--unit-y': `${ctTile.y}%`,
  } as CSSProperties;

  const aimLineStyle = {
    '--aim-x1': `${ctTile.x}%`,
    '--aim-y1': `${ctTile.y}%`,
    '--aim-x2': `${targetPoint.x}%`,
    '--aim-y2': `${targetPoint.y}%`,
  } as CSSProperties;

  const pathPoints = pathTileIds
    .map((tileId) => tileById.get(tileId))
    .filter((tile): tile is BoardTile => Boolean(tile))
    .map((tile) => `${tile.x},${tile.y}`)
    .join(' ');

  return (
    <main className={className} aria-label="Playable isometric one versus one board slice" onClick={rejectBoardClick}>
      <style>{`
        :root { color-scheme: dark; }
        * { box-sizing: border-box; }
        body { margin: 0; overflow: hidden; }

        .board-duel {
          position: fixed;
          inset: 0;
          overflow: hidden;
          color: #f5fbff;
          font-family: Inter, Segoe UI, system-ui, sans-serif;
          background:
            radial-gradient(circle at 54% 42%, rgba(54, 137, 196, 0.18), transparent 33%),
            linear-gradient(180deg, #07111b 0%, #02050a 100%);
        }

        .concept-frame {
          position: absolute;
          left: 50%;
          top: 50%;
          width: min(100vw, 129.82vh);
          height: min(100vh, 77.03vw);
          transform: translate(-50%, -50%);
          background-image: url('/concepts/isometric-duel-target.png');
          background-size: contain;
          background-position: center;
          background-repeat: no-repeat;
          filter: saturate(1.02) contrast(1.01);
        }

        .concept-frame::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(circle at 50% 48%, transparent 0 56%, rgba(0,0,0,0.18) 76%, rgba(0,0,0,0.34) 100%);
        }

        .phase-firing .concept-frame,
        .phase-impact .concept-frame {
          animation: camera-hit 720ms cubic-bezier(.2,.85,.2,1) both;
        }

        .phase-invalid .concept-frame {
          animation: invalid-shake 190ms ease 2;
        }

        .feedback {
          position: absolute;
          left: 50%;
          top: max(18px, 3.2vh);
          z-index: 20;
          min-height: 38px;
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 0 16px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.18);
          background: rgba(3, 8, 14, 0.68);
          box-shadow: 0 18px 44px rgba(0,0,0,0.38), inset 0 1px rgba(255,255,255,0.1);
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 1.4px;
          text-transform: uppercase;
          transform: translateX(-50%);
          pointer-events: none;
        }

        .feedback::before {
          content: "";
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #68cfff;
          box-shadow: 0 0 16px rgba(104, 207, 255, 0.9);
        }

        .phase-invalid .feedback {
          color: #ffe4de;
          border-color: rgba(255, 94, 72, 0.62);
          animation: feedback-pop 180ms ease 2;
        }

        .phase-invalid .feedback::before {
          background: #ff604d;
          box-shadow: 0 0 16px rgba(255, 96, 77, 0.9);
        }

        .phase-down .feedback::before {
          background: #ffcf70;
          box-shadow: 0 0 16px rgba(255, 207, 112, 0.9);
        }

        .hotspot {
          position: absolute;
          z-index: 10;
          border: 0;
          padding: 0;
          background: transparent;
          cursor: default;
        }

        .tile-layer {
          position: absolute;
          inset: 0;
          z-index: 9;
          pointer-events: none;
        }

        .mode-move .tile-layer {
          pointer-events: auto;
        }

        .tile-path {
          position: absolute;
          inset: 0;
          z-index: 9;
          width: 100%;
          height: 100%;
          pointer-events: none;
          opacity: 0;
          transition: opacity 160ms ease;
        }

        .mode-move .tile-path,
        .phase-moving .tile-path {
          opacity: 1;
        }

        .tile-path polyline {
          fill: none;
          stroke: rgba(91, 213, 255, 0.74);
          stroke-width: 0.55;
          stroke-linecap: round;
          stroke-linejoin: round;
          filter: drop-shadow(0 0 4px rgba(91, 213, 255, 0.8));
        }

        .iso-tile {
          position: absolute;
          left: var(--tile-x);
          top: var(--tile-y);
          width: 7.2%;
          aspect-ratio: 1 / 0.58;
          transform: translate(-50%, -50%) rotate(-25deg) skewX(-7deg);
          transform-origin: center;
          border: 1px solid rgba(105, 211, 255, 0);
          border-radius: 8px;
          background: rgba(69, 194, 255, 0);
          box-shadow: 0 0 0 rgba(89, 213, 255, 0);
          pointer-events: auto;
          transition: opacity 150ms ease, border-color 150ms ease, background 150ms ease, box-shadow 150ms ease;
          opacity: 0;
        }

        .mode-move .iso-tile {
          cursor: pointer;
          opacity: 1;
          border-color: rgba(89, 213, 255, 0.62);
          background: rgba(65, 195, 255, 0.09);
          box-shadow: 0 0 30px rgba(89, 213, 255, 0.38);
          animation: tile-pulse 1.05s ease infinite;
        }

        .mode-move .iso-tile.current {
          border-color: rgba(255, 255, 255, 0.64);
          background: rgba(255, 255, 255, 0.08);
        }

        .mode-move .iso-tile.cover-full::after,
        .mode-move .iso-tile.cover-half::after {
          content: "";
          position: absolute;
          right: 8%;
          top: 12%;
          width: 20%;
          height: 20%;
          border-radius: 50%;
          background: rgba(255, 211, 116, 0.85);
          box-shadow: 0 0 10px rgba(255, 211, 116, 0.65);
        }

        .ct-hotspot {
          left: 16.5%;
          top: 56%;
          width: 18%;
          height: 29%;
          border-radius: 24px;
        }

        .unit-token {
          position: absolute;
          left: var(--unit-x);
          top: var(--unit-y);
          z-index: 12;
          width: 9.2%;
          aspect-ratio: 1;
          transform: translate(-50%, -65%);
          pointer-events: none;
          transition: left 520ms cubic-bezier(.2,.84,.2,1), top 520ms cubic-bezier(.2,.84,.2,1);
        }

        .unit-token::before {
          content: "";
          position: absolute;
          left: 50%;
          bottom: 4%;
          width: 76%;
          height: 35%;
          transform: translateX(-50%) rotate(-25deg) skewX(-7deg);
          border-radius: 12px;
          border: 2px solid rgba(90, 213, 255, 0.88);
          background: rgba(24, 165, 255, 0.1);
          box-shadow: 0 0 26px rgba(74, 203, 255, 0.54), inset 0 0 18px rgba(74, 203, 255, 0.16);
        }

        .unit-token::after {
          content: "";
          position: absolute;
          left: 50%;
          bottom: 31%;
          width: 30%;
          height: 42%;
          transform: translateX(-50%);
          border-radius: 999px;
          background: linear-gradient(180deg, rgba(132, 225, 255, 0.92), rgba(12, 74, 132, 0.94));
          box-shadow: 0 10px 18px rgba(0,0,0,0.44), 0 0 20px rgba(94, 206, 255, 0.45);
          clip-path: polygon(50% 0, 78% 18%, 88% 58%, 70% 100%, 30% 100%, 12% 58%, 22% 18%);
        }

        .target-hotspot {
          left: 73.4%;
          top: 25.5%;
          width: 13.5%;
          height: 21.2%;
          border-radius: 24px;
        }

        .mode-shoot .target-hotspot {
          cursor: crosshair;
          outline: 2px solid rgba(255, 101, 72, 0.88);
          box-shadow: 0 0 34px rgba(255, 91, 70, 0.36);
        }

        .phase-firing .shot-flash,
        .phase-impact .shot-flash {
          opacity: 1;
          animation: shot-flash 720ms ease both;
        }

        .aim-svg {
          position: absolute;
          inset: 0;
          z-index: 8;
          width: 100%;
          height: 100%;
          pointer-events: none;
          opacity: 0;
        }

        .mode-shoot .aim-svg,
        .phase-firing .aim-svg,
        .phase-impact .aim-svg {
          opacity: 1;
        }

        .aim-svg line {
          stroke: rgba(255, 222, 134, 0.86);
          stroke-width: 0.62;
          stroke-linecap: round;
          filter: drop-shadow(0 0 5px rgba(255, 196, 82, 0.9));
        }

        .shot-flash {
          position: absolute;
          left: 27.4%;
          top: 33.6%;
          width: 47.8%;
          height: 35.5%;
          z-index: 8;
          pointer-events: none;
          opacity: 0;
          background:
            linear-gradient(146deg, transparent 0 45%, rgba(255,255,255,0.84) 48%, rgba(255, 210, 92, 0.88) 50%, rgba(255, 114, 48, 0.16) 54%, transparent 58%),
            radial-gradient(circle at 98% 8%, rgba(255,80,60,0.72), transparent 12%),
            radial-gradient(circle at 2% 92%, rgba(255,228,130,0.62), transparent 10%);
          filter: blur(0.4px) drop-shadow(0 0 22px rgba(255, 198, 82, 0.82));
          mix-blend-mode: screen;
        }

        .phase-down .target-hotspot {
          pointer-events: none;
          outline: 0;
          box-shadow: none;
        }

        .actions {
          position: absolute;
          left: max(18px, 3.4vw);
          bottom: max(18px, 3.1vh);
          z-index: 20;
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .chip {
          min-height: 42px;
          padding: 0 16px;
          border-radius: 999px;
          border: 1px solid rgba(184, 219, 255, 0.28);
          background: linear-gradient(180deg, rgba(11, 24, 38, 0.84), rgba(4, 9, 16, 0.94));
          color: #f5fbff;
          box-shadow: 0 16px 34px rgba(0,0,0,0.34), inset 0 1px rgba(255,255,255,0.12);
          font: 950 12px/1 Inter, Segoe UI, system-ui, sans-serif;
          letter-spacing: 1.4px;
          text-transform: uppercase;
          cursor: pointer;
        }

        .chip:hover {
          border-color: rgba(255, 218, 132, 0.72);
          transform: translateY(-1px);
        }

        .chip:disabled {
          color: rgba(245,251,255,0.36);
          border-color: rgba(184,219,255,0.1);
          cursor: default;
          transform: none;
        }

        .mode-move .move-chip,
        .mode-shoot .shoot-chip {
          border-color: rgba(255, 205, 111, 0.86);
          background: linear-gradient(180deg, rgba(77, 45, 13, 0.9), rgba(22, 12, 3, 0.95));
        }

        @keyframes camera-hit {
          0%, 100% { transform: translate(-50%, -50%) scale(1); filter: saturate(1.02) contrast(1.01); }
          36% { transform: translate(calc(-50% - 7px), calc(-50% + 4px)) scale(1.01); filter: saturate(1.24) contrast(1.06); }
          58% { transform: translate(calc(-50% + 6px), calc(-50% - 3px)) scale(1.012); }
        }

        @keyframes invalid-shake {
          0%, 100% { transform: translate(-50%, -50%); }
          35% { transform: translate(calc(-50% - 7px), -50%); }
          70% { transform: translate(calc(-50% + 6px), -50%); }
        }

        @keyframes feedback-pop {
          0%, 100% { transform: translateX(-50%) scale(1); }
          50% { transform: translateX(-50%) scale(1.04); }
        }

        @keyframes tile-pulse {
          0%, 100% { box-shadow: 0 0 24px rgba(89, 213, 255, 0.3); }
          50% { box-shadow: 0 0 44px rgba(89, 213, 255, 0.52); }
        }

        @keyframes shot-flash {
          0%, 14% { opacity: 0; transform: scaleX(0.18); }
          34% { opacity: 1; transform: scaleX(1); }
          100% { opacity: 0; transform: scaleX(1); }
        }
      `}</style>

      <div className="feedback" data-testid="board-duel-feedback">{phaseCopy[phase]}</div>
      <div className="concept-frame">
        <svg className="tile-path" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polyline points={pathPoints} />
        </svg>
        <svg className="aim-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" style={aimLineStyle}>
          <line x1={ctTile.x} y1={ctTile.y} x2={targetPoint.x} y2={targetPoint.y} />
        </svg>
        <div className="tile-layer" aria-hidden={mode !== 'move'}>
          {boardTiles.map((tile) => (
            <button
              key={tile.id}
              type="button"
              className={[
                'hotspot',
                'iso-tile',
                tile.id === ctTileId ? 'current' : '',
                tile.cover ? `cover-${tile.cover}` : '',
              ].filter(Boolean).join(' ')}
              style={{ '--tile-x': `${tile.x}%`, '--tile-y': `${tile.y}%` } as CSSProperties}
              data-testid={tile.id === 'logs' ? 'board-duel-peek-tile' : undefined}
              aria-label={tile.label}
              onClick={(event) => {
                event.stopPropagation();
                handleTileClick(tile.id);
              }}
            />
          ))}
        </div>
        <div className="unit-token" style={tokenStyle} aria-hidden="true" />
        <button
          type="button"
          className="hotspot ct-hotspot"
          data-testid="board-duel-ct"
          aria-label="Counter-terrorist anchor"
          onClick={(event) => {
            event.stopPropagation();
            if (!isBusy && isAlive) {
              setMode('idle');
              setPhase('ready');
            }
          }}
        />
        <button
          type="button"
          className="hotspot target-hotspot"
          data-testid="board-duel-target"
          aria-label={mode === 'shoot' ? 'Fire at T side entry, 70 percent' : 'T side entry'}
          disabled={phase === 'down'}
          onClick={(event) => {
            event.stopPropagation();
            fireShot();
          }}
        />
        <div className="shot-flash" />
      </div>

      <div className="actions" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="chip move-chip" data-testid="board-duel-move" disabled={!isAlive || isBusy} onClick={beginMove}>
          Move peek
        </button>
        <button type="button" className="chip shoot-chip" data-testid="board-duel-shoot" disabled={!isAlive || isBusy} onClick={beginShoot}>
          Shoot 70%
        </button>
        <button type="button" className="chip" data-testid="board-duel-reset" onClick={reset}>
          Reset
        </button>
      </div>
    </main>
  );
}
