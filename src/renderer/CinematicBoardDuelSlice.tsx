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
      }, 620);
      return () => window.clearTimeout(timer);
    }

    if (phase === 'firing') {
      const timer = window.setTimeout(() => setPhase('impact'), 360);
      return () => window.clearTimeout(timer);
    }

    if (phase === 'impact') {
      const timer = window.setTimeout(() => {
        setPhase('down');
        setMode('idle');
      }, 760);
      return () => window.clearTimeout(timer);
    }

    if (phase === 'invalid') {
      const timer = window.setTimeout(() => setPhase(mode === 'shoot' ? 'aiming' : mode === 'move' ? 'move-select' : 'ready'), 720);
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
    if (!isAlive || isBusy || ctPeeked) {
      return;
    }

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
    if (!isAlive || isBusy) {
      return;
    }

    setMode('shoot');
    setPhase('aiming');
  };

  const fireShot = () => {
    if (!isAlive || isBusy) {
      return;
    }

    if (mode !== 'shoot') {
      setPhase('invalid');
      return;
    }

    setPhase('firing');
  };

  const rejectBoardClick = () => {
    if (!isAlive || isBusy || mode === 'idle') {
      return;
    }

    setPhase('invalid');
  };

  const reset = () => {
    setPhase('ready');
    setMode('idle');
    setCtPeeked(false);
  };

  return (
    <main className={className} aria-label="Playable two point five D one versus one board slice" onClick={rejectBoardClick}>
      <style>{`
        :root {
          color-scheme: dark;
        }

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          overflow: hidden;
        }

        .board-duel {
          position: fixed;
          inset: 0;
          overflow: hidden;
          background:
            radial-gradient(circle at 34% 28%, rgba(74, 185, 255, 0.24), transparent 24%),
            radial-gradient(circle at 74% 54%, rgba(255, 144, 59, 0.2), transparent 26%),
            linear-gradient(180deg, #09131f 0%, #05080d 55%, #010206 100%);
          font-family: Inter, Segoe UI, system-ui, sans-serif;
          color: #f5fbff;
        }

        .board-duel::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            linear-gradient(180deg, rgba(0,0,0,0.2), transparent 28%, rgba(0,0,0,0.35)),
            radial-gradient(circle at center, transparent 0 48%, rgba(0,0,0,0.58) 100%);
          z-index: 18;
        }

        .feedback {
          position: absolute;
          left: 50%;
          top: 5.7vh;
          z-index: 30;
          transform: translateX(-50%);
          min-height: 38px;
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 0 16px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.13);
          background: rgba(3, 8, 14, 0.7);
          box-shadow: 0 18px 44px rgba(0,0,0,0.38), inset 0 1px rgba(255,255,255,0.1);
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 1.4px;
          text-transform: uppercase;
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
          border-color: rgba(255, 94, 72, 0.58);
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

        .stage {
          position: absolute;
          inset: 0;
          z-index: 2;
        }

        .phase-firing .stage,
        .phase-impact .stage {
          animation: camera-hit 760ms cubic-bezier(.2,.85,.2,1) both;
        }

        .phase-invalid .stage {
          animation: invalid-shake 220ms ease 2;
        }

        .map-shadow {
          position: absolute;
          left: 6%;
          right: 6%;
          bottom: 5%;
          height: 24%;
          border-radius: 50%;
          background: rgba(0,0,0,0.55);
          filter: blur(24px);
        }

        .map-board {
          position: absolute;
          left: 8%;
          top: 13%;
          width: 84%;
          height: 72%;
          transform: skewY(-3deg);
        }

        .map-slab {
          position: absolute;
          left: 4%;
          top: 9%;
          width: 92%;
          height: 80%;
          clip-path: polygon(6% 14%, 73% 2%, 96% 39%, 77% 87%, 21% 94%, 0 53%);
          background:
            linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px),
            linear-gradient(0deg, rgba(255,255,255,0.034) 1px, transparent 1px),
            linear-gradient(135deg, #23364a, #111a26 47%, #201713 100%);
          background-size: 52px 52px, 52px 52px, auto;
          border: 1px solid rgba(169, 214, 255, 0.1);
          box-shadow: inset 0 0 80px rgba(0,0,0,0.5), 0 34px 80px rgba(0,0,0,0.44);
        }

        .lane {
          position: absolute;
          left: 10%;
          top: 45%;
          width: 52%;
          height: 25%;
          transform: rotate(-13deg);
          clip-path: polygon(0 36%, 73% 0, 100% 42%, 21% 100%);
          background: linear-gradient(90deg, rgba(95, 192, 255, 0.22), rgba(255, 211, 118, 0.18), rgba(255, 119, 64, 0.13));
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow: inset 0 0 36px rgba(255,255,255,0.04);
        }

        .site {
          position: absolute;
          left: 48%;
          top: 31%;
          width: 31%;
          height: 34%;
          transform: rotate(-8deg) skewX(-12deg);
          background: linear-gradient(135deg, rgba(183, 65, 61, 0.92), rgba(92, 41, 48, 0.62));
          border: 1px solid rgba(255, 206, 136, 0.24);
          box-shadow: inset 0 0 42px rgba(0,0,0,0.26), 0 20px 44px rgba(0,0,0,0.24);
        }

        .site::after {
          content: "B";
          position: absolute;
          left: 11%;
          top: 15%;
          transform: skewX(12deg);
          color: rgba(255,255,255,0.76);
          font-size: clamp(56px, 7vw, 92px);
          font-weight: 950;
          letter-spacing: 5px;
        }

        .cover {
          position: absolute;
          border-radius: 4px;
          background: linear-gradient(135deg, #d2b771, #6a4b2c);
          box-shadow: 0 22px 34px rgba(0,0,0,0.38), inset 0 1px rgba(255,255,255,0.24);
        }

        .cover.logs { left: 31%; top: 50%; width: 160px; height: 42px; transform: rotate(-12deg); }
        .cover.car { left: 23%; top: 38%; width: 96px; height: 88px; background: linear-gradient(135deg, #794333, #2d1813); }
        .cover.box { left: 58%; top: 27%; width: 94px; height: 116px; }
        .cover.oranges { left: 70%; top: 47%; width: 176px; height: 46px; transform: rotate(10deg); }
        .cover.coffins { left: 81%; top: 31%; width: 112px; height: 136px; background: linear-gradient(135deg, #324250, #111922); }

        .peek-tile {
          position: absolute;
          left: 35.5%;
          top: 39%;
          width: 94px;
          height: 66px;
          transform: rotate(-13deg) skewX(-12deg);
          border: 2px solid rgba(106, 213, 255, 0);
          border-radius: 8px;
          background: rgba(84, 199, 255, 0);
          box-shadow: 0 0 0 rgba(84, 199, 255, 0);
          z-index: 9;
          cursor: default;
          transition: border-color 150ms ease, background 150ms ease, box-shadow 150ms ease;
        }

        .mode-move .peek-tile {
          cursor: pointer;
          border-color: rgba(106, 213, 255, 0.84);
          background: rgba(84, 199, 255, 0.13);
          box-shadow: 0 0 30px rgba(84, 199, 255, 0.32);
          animation: tile-pulse 1.2s ease infinite;
        }

        .agent {
          position: absolute;
          width: 164px;
          height: 228px;
          z-index: 12;
          border: 0;
          padding: 0;
          background: transparent;
          color: inherit;
          transform-origin: 50% 86%;
          cursor: default;
          transition: left 560ms cubic-bezier(.2,.8,.2,1), top 560ms cubic-bezier(.2,.8,.2,1), filter 160ms ease;
        }

        .agent.ct {
          left: 19%;
          top: 42%;
          transform: scale(0.96) rotate(-3deg);
        }

        .ct-peeked .agent.ct {
          left: 31%;
          top: 36%;
          transform: scale(1.02) rotate(-3deg);
        }

        .agent.t {
          left: 72%;
          top: 29%;
          transform: scale(0.98) rotate(2deg);
        }

        .phase-impact .agent.t {
          animation: target-flinch 760ms cubic-bezier(.2,.7,.15,1) both;
        }

        .phase-down .agent.t {
          transform: translate(42px, 86px) rotate(72deg) scale(0.98);
          filter: brightness(0.68) saturate(0.78);
          pointer-events: none;
        }

        .mode-shoot .agent.t {
          cursor: crosshair;
          filter: brightness(1.12) saturate(1.1);
        }

        .mode-shoot .agent.t::before {
          content: "TGT 70%";
          position: absolute;
          left: 22px;
          top: -38px;
          min-width: 96px;
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 92, 80, 0.7);
          background: rgba(31, 8, 8, 0.82);
          color: #ffe4d6;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 1.1px;
          box-shadow: 0 0 26px rgba(255, 72, 64, 0.32);
        }

        .mode-shoot .agent.t::after,
        .agent.ct::after {
          content: "";
          position: absolute;
          left: 8px;
          top: 16px;
          width: 148px;
          height: 184px;
          border-radius: 36px;
          pointer-events: none;
        }

        .agent.ct::after {
          border: 2px solid rgba(108, 207, 255, 0.58);
          box-shadow: 0 0 30px rgba(79, 188, 255, 0.28);
        }

        .mode-shoot .agent.t::after {
          border: 2px solid rgba(255, 89, 75, 0.76);
          box-shadow: 0 0 32px rgba(255, 80, 68, 0.34);
        }

        .shadow {
          position: absolute;
          left: 28px;
          bottom: 15px;
          width: 108px;
          height: 28px;
          border-radius: 50%;
          background: rgba(0,0,0,0.58);
          filter: blur(8px);
          transform: skewX(-18deg);
        }

        .legs {
          position: absolute;
          left: 52px;
          top: 124px;
          width: 60px;
          height: 82px;
        }

        .legs::before,
        .legs::after {
          content: "";
          position: absolute;
          bottom: 0;
          width: 24px;
          height: 82px;
          border-radius: 14px;
          background: linear-gradient(180deg, #151b24, #040609);
        }

        .legs::before { left: 2px; transform: rotate(5deg); }
        .legs::after { right: 0; transform: rotate(-6deg); }

        .body {
          position: absolute;
          left: 39px;
          top: 65px;
          width: 88px;
          height: 98px;
          border-radius: 28px 28px 20px 20px;
          box-shadow: inset 10px 0 22px rgba(255,255,255,0.09), inset -16px -12px 26px rgba(0,0,0,0.46), 0 16px 28px rgba(0,0,0,0.34);
        }

        .ct .body {
          background: linear-gradient(135deg, #13253c, #2471d5 56%, #07111f);
          border: 1px solid rgba(115, 204, 255, 0.24);
        }

        .t .body {
          background: linear-gradient(135deg, #2b1a13, #c17135 57%, #140908);
          border: 1px solid rgba(255, 196, 112, 0.24);
        }

        .vest {
          position: absolute;
          left: 55px;
          top: 77px;
          width: 58px;
          height: 70px;
          border-radius: 16px;
          background: rgba(4, 7, 12, 0.9);
          box-shadow: inset 0 1px rgba(255,255,255,0.12);
        }

        .head {
          position: absolute;
          left: 52px;
          top: 25px;
          width: 60px;
          height: 60px;
          border-radius: 48%;
          background: linear-gradient(145deg, #c99568, #6d432e);
          box-shadow: inset 10px 2px 14px rgba(255,255,255,0.16), inset -10px -8px 18px rgba(0,0,0,0.32);
        }

        .helmet {
          position: absolute;
          left: 42px;
          top: 13px;
          width: 80px;
          height: 44px;
          border-radius: 44px 44px 18px 18px;
          box-shadow: inset 13px 5px 18px rgba(255,255,255,0.22), inset -12px -8px 18px rgba(0,0,0,0.32), 0 8px 20px rgba(0,0,0,0.32);
        }

        .ct .helmet { background: linear-gradient(145deg, #f1fbff, #6ea2c0 58%, #203242); }
        .t .helmet { background: linear-gradient(145deg, #ffd17a, #a4642e 58%, #3a2114); }

        .arm {
          position: absolute;
          top: 84px;
          width: 30px;
          height: 92px;
          border-radius: 20px;
          background: linear-gradient(180deg, #171c24, #05070b);
        }

        .arm.back { left: 25px; transform: rotate(-18deg); opacity: 0.78; }
        .arm.front { left: 106px; transform: rotate(-76deg); transform-origin: 15px 15px; }

        .rifle {
          position: absolute;
          left: 110px;
          top: 88px;
          width: 190px;
          height: 18px;
          border-radius: 999px;
          background: linear-gradient(180deg, #20242c, #040509);
          transform: rotate(-8deg);
          transform-origin: 0 50%;
          box-shadow: inset 0 3px rgba(255,255,255,0.08), 0 10px 20px rgba(0,0,0,0.36);
        }

        .rifle::before {
          content: "";
          position: absolute;
          left: 56px;
          top: -15px;
          width: 34px;
          height: 22px;
          border-radius: 12px 12px 4px 4px;
          background: #080b11;
        }

        .rifle::after {
          content: "";
          position: absolute;
          right: -74px;
          top: 6px;
          width: 86px;
          height: 7px;
          border-radius: 999px;
          background: #020305;
        }

        .phase-firing .ct .rifle,
        .phase-impact .ct .rifle {
          animation: rifle-recoil 700ms cubic-bezier(.17,.84,.44,1) both;
        }

        .shot-lane {
          position: absolute;
          left: 40%;
          top: 39%;
          width: 44%;
          height: 10px;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(255,255,255,0), #fffdf0 16%, #ffdf87 48%, rgba(255, 92, 70, 0));
          box-shadow: 0 0 18px rgba(255, 212, 114, 0.92), 0 0 42px rgba(255, 84, 68, 0.38);
          transform: rotate(-5deg) scaleX(0);
          transform-origin: left center;
          opacity: 0;
          z-index: 13;
        }

        .phase-firing .shot-lane,
        .phase-impact .shot-lane {
          animation: shot-lane 820ms ease both;
        }

        .muzzle {
          position: absolute;
          left: 40%;
          top: 34.5%;
          width: 170px;
          height: 92px;
          transform: rotate(-8deg);
          clip-path: polygon(0 50%, 43% 4%, 61% 35%, 100% 50%, 61% 65%, 43% 96%);
          background: radial-gradient(circle, #fff 0 12%, #ffe6ab 18%, #ffab35 42%, transparent 68%);
          filter: drop-shadow(0 0 28px rgba(255, 180, 78, 0.98));
          opacity: 0;
          z-index: 14;
        }

        .phase-firing .muzzle {
          animation: muzzle-pop 560ms steps(1, end) both;
        }

        .impact {
          position: absolute;
          left: 72%;
          top: 30%;
          width: 160px;
          height: 160px;
          border-radius: 50%;
          background:
            radial-gradient(circle, rgba(255,255,255,0.92) 0 8%, rgba(255,77,91,0.84) 9% 18%, transparent 38%),
            conic-gradient(from 20deg, transparent, rgba(255,219,135,0.88), transparent, rgba(255,79,102,0.88), transparent);
          filter: drop-shadow(0 0 28px rgba(255,72,92,0.84));
          transform: scale(0.2);
          opacity: 0;
          z-index: 14;
        }

        .phase-impact .impact {
          animation: impact-burst 840ms ease both;
        }

        .actions {
          position: absolute;
          left: 8.5%;
          bottom: 8.5vh;
          z-index: 30;
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .chip {
          min-height: 40px;
          padding: 0 15px;
          border-radius: 999px;
          border: 1px solid rgba(184, 219, 255, 0.26);
          background: linear-gradient(180deg, rgba(11, 24, 38, 0.86), rgba(4, 9, 16, 0.94));
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
          border-color: rgba(255, 205, 111, 0.82);
          background: linear-gradient(180deg, rgba(77, 45, 13, 0.88), rgba(22, 12, 3, 0.95));
        }

        @keyframes camera-hit {
          0%, 100% { transform: translate3d(0,0,0) scale(1); filter: saturate(1); }
          32% { transform: translate3d(-8px, 3px, 0) scale(1.015); filter: saturate(1.4) contrast(1.08); }
          48% { transform: translate3d(7px, -3px, 0) scale(1.018); }
        }

        @keyframes invalid-shake {
          0%, 100% { transform: translate3d(0, 0, 0); }
          35% { transform: translate3d(-7px, 0, 0); }
          70% { transform: translate3d(6px, 0, 0); }
        }

        @keyframes feedback-pop {
          0%, 100% { transform: translateX(-50%) scale(1); }
          50% { transform: translateX(-50%) scale(1.04); }
        }

        @keyframes tile-pulse {
          0%, 100% { box-shadow: 0 0 24px rgba(84, 199, 255, 0.26); }
          50% { box-shadow: 0 0 42px rgba(84, 199, 255, 0.48); }
        }

        @keyframes rifle-recoil {
          0%, 18% { transform: rotate(-8deg) translateX(0); }
          34%, 44% { transform: rotate(-14deg) translateX(-24px); }
          72%, 100% { transform: rotate(-8deg) translateX(0); }
        }

        @keyframes shot-lane {
          0%, 14% { opacity: 0; transform: rotate(-5deg) scaleX(0); }
          28% { opacity: 1; transform: rotate(-5deg) scaleX(0.2); }
          52% { opacity: 0.96; transform: rotate(-5deg) scaleX(1); }
          100% { opacity: 0; transform: rotate(-5deg) scaleX(1); }
        }

        @keyframes muzzle-pop {
          0%, 22%, 58%, 100% { opacity: 0; transform: rotate(-8deg) scale(0.45); }
          30%, 42% { opacity: 1; transform: rotate(-8deg) scale(1); }
        }

        @keyframes impact-burst {
          0%, 20% { opacity: 0; transform: scale(0.2) rotate(0); }
          38% { opacity: 1; transform: scale(1) rotate(18deg); }
          100% { opacity: 0; transform: scale(1.8) rotate(42deg); }
        }

        @keyframes target-flinch {
          0% { transform: scale(0.98) rotate(2deg); filter: brightness(1); }
          25% { transform: translate(-18px, 4px) scale(1.03) rotate(-4deg); filter: brightness(1.22); }
          100% { transform: translate(42px, 86px) rotate(72deg) scale(0.98); filter: brightness(0.68) saturate(0.78); }
        }
      `}</style>

      <div className="feedback" data-testid="board-duel-feedback">{phaseCopy[phase]}</div>
      <div className="stage">
        <div className="map-shadow" />
        <div className="map-board">
          <div className="map-slab" />
          <div className="lane" />
          <div className="site" />
          <div className="cover car" />
          <div className="cover logs" />
          <div className="cover box" />
          <div className="cover oranges" />
          <div className="cover coffins" />
          <button
            type="button"
            className="peek-tile"
            data-testid="board-duel-peek-tile"
            aria-label="Peek tile"
            onClick={(event) => {
              event.stopPropagation();
              commitMove();
            }}
          />
        </div>

        <button
          type="button"
          className="agent ct"
          data-testid="board-duel-ct"
          aria-label="Counter-terrorist anchor"
          onClick={(event) => {
            event.stopPropagation();
            if (!isBusy && isAlive) {
              setMode('idle');
              setPhase('ready');
            }
          }}
        >
          <span className="shadow" />
          <span className="legs" />
          <span className="body" />
          <span className="vest" />
          <span className="head" />
          <span className="helmet" />
          <span className="arm back" />
          <span className="arm front" />
          <span className="rifle" />
        </button>

        <button
          type="button"
          className="agent t"
          data-testid="board-duel-target"
          aria-label={mode === 'shoot' ? 'Fire at T side entry, 70 percent' : 'T side entry'}
          disabled={phase === 'down'}
          onClick={(event) => {
            event.stopPropagation();
            fireShot();
          }}
        >
          <span className="shadow" />
          <span className="legs" />
          <span className="body" />
          <span className="vest" />
          <span className="head" />
          <span className="helmet" />
          <span className="arm back" />
          <span className="arm front" />
          <span className="rifle" />
        </button>

        <div className="shot-lane" />
        <div className="muzzle" />
        <div className="impact" />
      </div>

      <div className="actions" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="chip move-chip"
          data-testid="board-duel-move"
          disabled={!isAlive || isBusy || ctPeeked}
          onClick={beginMove}
        >
          Move peek
        </button>
        <button
          type="button"
          className="chip shoot-chip"
          data-testid="board-duel-shoot"
          disabled={!isAlive || isBusy}
          onClick={beginShoot}
        >
          Shoot 70%
        </button>
        <button
          type="button"
          className="chip"
          data-testid="board-duel-reset"
          onClick={reset}
        >
          Reset
        </button>
      </div>
    </main>
  );
}
