import { useEffect, useMemo, useState } from 'react';

type BoardPhase = 'ready' | 'move-select' | 'moving' | 'aiming' | 'invalid' | 'firing' | 'impact' | 'down';
type BoardMode = 'idle' | 'move' | 'shoot';

const phaseCopy: Record<BoardPhase, string> = {
  ready: 'CT anchor ready. Choose move or shot.',
  'move-select': 'Pick the blue peek tile.',
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
  const [ctPeeked, setCtPeeked] = useState(false);

  const isBusy = phase === 'moving' || phase === 'firing' || phase === 'impact';
  const isAlive = phase !== 'down';

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
    ctPeeked ? 'ct-peeked' : '',
  ].filter(Boolean).join(' '), [ctPeeked, mode, phase]);

  const beginMove = () => {
    if (!isAlive || isBusy || ctPeeked) return;
    setMode('move');
    setPhase('move-select');
  };

  const commitMove = () => {
    if (!isAlive || isBusy || mode !== 'move') {
      setPhase('invalid');
      return;
    }

    setCtPeeked(true);
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
    setCtPeeked(false);
  };

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

        .peek-hotspot {
          left: 36.4%;
          top: 51.5%;
          width: 16.2%;
          height: 8.2%;
          transform: rotate(-22deg);
          border-radius: 8px;
        }

        .mode-move .peek-hotspot {
          cursor: pointer;
          outline: 2px solid rgba(89, 213, 255, 0.9);
          background: rgba(65, 195, 255, 0.12);
          box-shadow: 0 0 30px rgba(89, 213, 255, 0.38);
          animation: tile-pulse 1.05s ease infinite;
        }

        .ct-hotspot {
          left: 17.5%;
          top: 59.4%;
          width: 13.2%;
          height: 21.2%;
          border-radius: 24px;
        }

        .ct-peeked .ct-hotspot::after {
          content: "";
          position: absolute;
          left: 18%;
          top: -13%;
          width: 70%;
          height: 22%;
          border-radius: 999px;
          border: 1px solid rgba(104, 207, 255, 0.7);
          background: rgba(4, 18, 34, 0.76);
          box-shadow: 0 0 24px rgba(104, 207, 255, 0.34);
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
          className="hotspot peek-hotspot"
          data-testid="board-duel-peek-tile"
          aria-label="Peek tile"
          onClick={(event) => {
            event.stopPropagation();
            commitMove();
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
        <button type="button" className="chip move-chip" data-testid="board-duel-move" disabled={!isAlive || isBusy || ctPeeked} onClick={beginMove}>
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
