const LOOP_SECONDS = 5.2;

export function CinematicDuelSlice() {
  return (
    <main className="cinematic-duel" aria-label="Cinematic one versus one duel slice">
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

        .cinematic-duel {
          position: fixed;
          inset: 0;
          overflow: hidden;
          background:
            radial-gradient(circle at 59% 36%, rgba(255, 213, 130, 0.25), transparent 17%),
            radial-gradient(circle at 24% 60%, rgba(62, 178, 255, 0.32), transparent 23%),
            radial-gradient(circle at 78% 58%, rgba(255, 97, 45, 0.22), transparent 24%),
            linear-gradient(180deg, #0b1420 0%, #07090f 48%, #020307 100%);
          font-family: Inter, Segoe UI, system-ui, sans-serif;
        }

        .cinematic-duel::before {
          content: "";
          position: absolute;
          inset: 0;
          background:
            linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px),
            linear-gradient(0deg, rgba(255,255,255,0.025) 1px, transparent 1px);
          background-size: 48px 48px;
          mask-image: linear-gradient(180deg, transparent 0%, #000 36%, #000 100%);
          opacity: 0.42;
          transform: perspective(700px) rotateX(58deg) translateY(120px) scale(1.25);
          transform-origin: center bottom;
        }

        .cinematic-duel::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(circle at 35% 41%, transparent 0 24%, rgba(0,0,0,0.18) 42%, rgba(0,0,0,0.76) 100%),
            linear-gradient(90deg, rgba(42, 148, 255, 0.11), transparent 42%, rgba(255, 119, 55, 0.12));
          z-index: 18;
        }

        .film-grain {
          position: absolute;
          inset: -10%;
          pointer-events: none;
          opacity: 0.12;
          background-image:
            radial-gradient(circle, rgba(255,255,255,0.22) 0 1px, transparent 1px),
            radial-gradient(circle, rgba(0,0,0,0.45) 0 1px, transparent 1px);
          background-size: 17px 19px, 23px 29px;
          mix-blend-mode: overlay;
          animation: grain-shift 0.55s steps(2) infinite;
        }

        .cinema-bars::before,
        .cinema-bars::after {
          content: "";
          position: absolute;
          left: 0;
          width: 100%;
          height: 7.5vh;
          background: #010206;
          z-index: 20;
          pointer-events: none;
        }

        .cinema-bars::before { top: 0; }
        .cinema-bars::after { bottom: 0; }

        .stage {
          position: absolute;
          inset: 0;
          animation: camera-hit ${LOOP_SECONDS}s cubic-bezier(.2,.8,.2,1) infinite;
        }

        .back-wall {
          position: absolute;
          left: 10%;
          right: 8%;
          top: 10%;
          height: 41%;
          background:
            linear-gradient(90deg, rgba(255,255,255,0.035), transparent 18%, transparent 70%, rgba(255,255,255,0.028)),
            linear-gradient(180deg, #151d2a, #080b12);
          clip-path: polygon(5% 0, 92% 0, 100% 100%, 0 100%);
          box-shadow: inset 0 -18px 40px rgba(0,0,0,0.55), 0 28px 70px rgba(0,0,0,0.46);
        }

        .floor {
          position: absolute;
          left: 5%;
          right: 4%;
          bottom: 8%;
          height: 64%;
          background:
            radial-gradient(circle at 49% 48%, rgba(255, 190, 98, 0.22), transparent 20%),
            linear-gradient(110deg, rgba(62, 92, 120, 0.78), rgba(23, 31, 44, 0.98) 42%, rgba(16, 20, 28, 1));
          clip-path: polygon(13% 0, 89% 7%, 100% 100%, 0 100%);
          transform: perspective(780px) rotateX(58deg);
          transform-origin: center bottom;
          box-shadow: 0 0 90px rgba(67, 170, 255, 0.12), inset 0 0 90px rgba(0,0,0,0.5);
        }

        .site-mark {
          position: absolute;
          left: 43%;
          top: 42%;
          width: 360px;
          height: 166px;
          transform: skewX(-18deg) rotate(-2deg);
          background: linear-gradient(135deg, rgba(173, 72, 68, 0.9), rgba(92, 48, 55, 0.52));
          border: 1px solid rgba(255, 198, 142, 0.22);
          box-shadow: inset 0 0 45px rgba(0,0,0,0.28);
        }

        .site-mark::after {
          content: "B";
          position: absolute;
          left: 32px;
          top: 18px;
          color: rgba(255,255,255,0.74);
          font-size: 88px;
          font-weight: 900;
          letter-spacing: 4px;
          transform: skewX(18deg);
        }

        .cover {
          position: absolute;
          border-radius: 2px;
          background: linear-gradient(135deg, #c8a760, #5e462a);
          box-shadow: 0 26px 28px rgba(0,0,0,0.42), inset 0 1px rgba(255,255,255,0.22);
        }

        .cover-a { left: 29%; top: 53%; width: 178px; height: 60px; transform: rotate(-8deg); }
        .cover-b { left: 66%; top: 51%; width: 218px; height: 49px; transform: rotate(9deg); }
        .cover-c { left: 51%; top: 35%; width: 92px; height: 104px; background: linear-gradient(135deg, #d2b870, #77542f); }
        .cover-d { left: 22%; top: 35%; width: 104px; height: 122px; background: linear-gradient(135deg, #6e3e30, #291914); }

        .lane-light {
          position: absolute;
          left: 29%;
          top: 28%;
          width: 48%;
          height: 54%;
          background: linear-gradient(102deg, rgba(91, 192, 255, 0.18), rgba(255, 199, 113, 0.16), transparent 68%);
          clip-path: polygon(0 56%, 49% 26%, 100% 40%, 62% 74%, 12% 88%);
          filter: blur(1px);
          opacity: 0.72;
          mix-blend-mode: screen;
        }

        .agent {
          position: absolute;
          width: 230px;
          height: 430px;
          transform-origin: 50% 88%;
          z-index: 8;
        }

        .agent.ct {
          left: 12.8%;
          top: 20.5%;
          transform: rotate(-2deg) scale(1.16);
        }

        .agent.t {
          right: 10.2%;
          top: 20.8%;
          animation: target-collapse ${LOOP_SECONDS}s cubic-bezier(.2,.7,.15,1) infinite;
        }

        .agent-shadow {
          position: absolute;
          left: 36px;
          bottom: 6px;
          width: 158px;
          height: 42px;
          border-radius: 50%;
          background: rgba(0,0,0,0.56);
          filter: blur(10px);
          transform: skewX(-18deg);
        }

        .leg {
          position: absolute;
          bottom: 38px;
          width: 36px;
          height: 122px;
          border-radius: 18px 18px 12px 12px;
          background: linear-gradient(180deg, #171b25, #05070b);
          box-shadow: inset 6px 0 12px rgba(255,255,255,0.035);
        }

        .leg.left { left: 76px; transform: rotate(4deg); }
        .leg.right { left: 126px; transform: rotate(-8deg); }

        .torso {
          position: absolute;
          left: 52px;
          top: 132px;
          width: 126px;
          height: 156px;
          border-radius: 34px 34px 22px 22px;
          box-shadow: inset 12px 0 28px rgba(255,255,255,0.09), inset -16px -12px 28px rgba(0,0,0,0.45), 0 18px 34px rgba(0,0,0,0.4);
        }

        .torso::before {
          content: "";
          position: absolute;
          left: 18px;
          top: 20px;
          width: 22px;
          height: 96px;
          border-radius: 18px;
          background: linear-gradient(180deg, rgba(255,255,255,0.22), transparent);
          opacity: 0.42;
        }

        .ct .torso {
          background: linear-gradient(135deg, #14243b, #276bc8 54%, #081220);
          border: 1px solid rgba(111, 198, 255, 0.22);
        }

        .t .torso {
          background: linear-gradient(135deg, #2b1a13, #ba6a35 55%, #160b09);
          border: 1px solid rgba(255, 199, 112, 0.22);
        }

        .vest {
          position: absolute;
          left: 72px;
          top: 148px;
          width: 86px;
          height: 112px;
          border-radius: 20px 20px 14px 14px;
          background: linear-gradient(180deg, rgba(9,12,18,0.88), rgba(4,6,10,0.94));
          box-shadow: inset 0 1px rgba(255,255,255,0.1), 0 0 0 1px rgba(255,255,255,0.05);
        }

        .vest::before,
        .vest::after {
          content: "";
          position: absolute;
          top: 14px;
          bottom: 14px;
          width: 10px;
          border-radius: 999px;
          background: rgba(255,255,255,0.07);
        }

        .vest::before { left: 17px; }
        .vest::after { right: 17px; }

        .head {
          position: absolute;
          left: 77px;
          top: 62px;
          width: 78px;
          height: 88px;
          border-radius: 46% 46% 42% 42%;
          background: linear-gradient(145deg, #c59265, #6f432e);
          box-shadow: inset 12px 2px 16px rgba(255,255,255,0.16), inset -12px -8px 20px rgba(0,0,0,0.35);
        }

        .head::after {
          content: "";
          position: absolute;
          left: 16px;
          right: 14px;
          top: 34px;
          height: 12px;
          border-radius: 999px;
          background: rgba(7,10,14,0.62);
          box-shadow: 0 8px 12px rgba(0,0,0,0.18);
        }

        .helmet {
          position: absolute;
          left: 64px;
          top: 42px;
          width: 104px;
          height: 64px;
          border-radius: 54px 54px 24px 24px;
          box-shadow: inset 18px 6px 24px rgba(255,255,255,0.24), inset -14px -8px 24px rgba(0,0,0,0.3), 0 10px 28px rgba(0,0,0,0.35);
        }

        .ct .helmet { background: linear-gradient(145deg, #f1fbff, #70a1bd 54%, #223447); }
        .t .helmet { background: linear-gradient(145deg, #ffd27d, #a4672f 58%, #3b2214); }

        .arm {
          position: absolute;
          top: 160px;
          width: 42px;
          height: 144px;
          border-radius: 24px;
          background: linear-gradient(180deg, #181c24, #07080d);
        }

        .arm.front {
          left: 150px;
          transform: rotate(-74deg);
          transform-origin: 22px 22px;
        }

        .arm.back {
          left: 35px;
          transform: rotate(-18deg);
          opacity: 0.78;
        }

        .rifle {
          position: absolute;
          top: 166px;
          left: 158px;
          width: 248px;
          height: 24px;
          border-radius: 12px;
          background: linear-gradient(180deg, #20242d, #05060a);
          transform: rotate(-8deg);
          transform-origin: 0 50%;
          box-shadow: inset 0 3px rgba(255,255,255,0.08), 0 12px 24px rgba(0,0,0,0.38);
        }

        .rifle::before {
          content: "";
          position: absolute;
          left: 66px;
          top: -18px;
          width: 38px;
          height: 26px;
          border-radius: 14px 14px 4px 4px;
          background: #0b0e14;
          box-shadow: inset 0 2px rgba(255,255,255,0.12);
        }

        .rifle::after {
          content: "";
          position: absolute;
          right: -92px;
          top: 8px;
          width: 104px;
          height: 8px;
          border-radius: 6px;
          background: linear-gradient(90deg, #11151c, #010203);
        }

        .ct .rifle {
          animation: rifle-recoil ${LOOP_SECONDS}s cubic-bezier(.17,.84,.44,1) infinite;
        }

        .muzzle-flash {
          position: absolute;
          top: 138px;
          left: 414px;
          width: 246px;
          height: 132px;
          transform: rotate(-8deg);
          clip-path: polygon(0 50%, 44% 4%, 61% 34%, 100% 50%, 61% 66%, 44% 96%);
          background:
            radial-gradient(circle, #fff 0 12%, #ffeec2 18%, #ffb23f 40%, transparent 68%),
            conic-gradient(from 20deg, rgba(255,255,255,0), rgba(255,220,130,0.9), rgba(255,101,36,0.2), rgba(255,255,255,0));
          filter: drop-shadow(0 0 28px rgba(255, 185, 82, 0.98));
          opacity: 0;
          animation: muzzle-pop ${LOOP_SECONDS}s steps(1, end) infinite;
          z-index: 12;
        }

        .tracer {
          position: absolute;
          left: 45%;
          top: 39%;
          width: 42%;
          height: 13px;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(255,255,255,0), #fffef2 14%, #ffe18a 50%, rgba(255,94,86,0));
          box-shadow: 0 0 18px rgba(255, 210, 116, 0.9), 0 0 42px rgba(255, 94, 86, 0.45);
          transform: rotate(2deg) scaleX(0);
          transform-origin: left center;
          opacity: 0;
          z-index: 11;
          animation: tracer-fire ${LOOP_SECONDS}s cubic-bezier(.1,.8,.1,1) infinite;
        }

        .impact {
          position: absolute;
          right: 17.5%;
          top: 34.5%;
          width: 220px;
          height: 220px;
          border-radius: 50%;
          opacity: 0;
          transform: scale(0.2);
          background:
            radial-gradient(circle, rgba(255,255,255,0.95) 0 8%, rgba(255,70,92,0.82) 9% 18%, transparent 38%),
            conic-gradient(from 20deg, transparent, rgba(255,219,135,0.9), transparent, rgba(255,79,102,0.88), transparent);
          filter: drop-shadow(0 0 26px rgba(255,72,92,0.85));
          z-index: 13;
          animation: impact-burst ${LOOP_SECONDS}s cubic-bezier(.16,.78,.18,1) infinite;
        }

        .ct-glow,
        .t-glow {
          position: absolute;
          width: 340px;
          height: 340px;
          border-radius: 50%;
          filter: blur(34px);
          opacity: 0.35;
          mix-blend-mode: screen;
        }

        .ct-glow {
          left: 8%;
          top: 31%;
          background: #2ba8ff;
        }

        .t-glow {
          right: 7%;
          top: 34%;
          background: #ff8e45;
          animation: t-light-drop ${LOOP_SECONDS}s ease infinite;
        }

        .kill-card {
          position: absolute;
          left: 50%;
          bottom: 9.8vh;
          transform: translateX(-50%) translateY(14px);
          color: #f5f7fb;
          text-transform: uppercase;
          letter-spacing: 3.2px;
          font-size: clamp(11px, 1.15vw, 15px);
          font-weight: 950;
          text-shadow: 0 3px 22px rgba(0,0,0,0.9);
          opacity: 0;
          z-index: 21;
          animation: kill-card ${LOOP_SECONDS}s ease infinite;
          white-space: nowrap;
        }

        .kill-card strong {
          color: #ffcf6f;
        }

        .sound-ring {
          position: absolute;
          left: 27%;
          top: 37%;
          width: 160px;
          height: 160px;
          border-radius: 50%;
          border: 2px solid rgba(255, 225, 150, 0.72);
          transform: scale(0.2);
          opacity: 0;
          z-index: 10;
          animation: sound-ring ${LOOP_SECONDS}s ease-out infinite;
        }

        @keyframes camera-hit {
          0%, 25% { transform: translate3d(0, 0, 0) scale(1); filter: saturate(1); }
          30% { transform: translate3d(-11px, 5px, 0) scale(1.018); filter: saturate(1.45) contrast(1.12); }
          34% { transform: translate3d(9px, -4px, 0) scale(1.022); }
          40%, 100% { transform: translate3d(0, 0, 0) scale(1); filter: saturate(1); }
        }

        @keyframes rifle-recoil {
          0%, 25% { transform: rotate(-8deg) translateX(0); }
          30%, 36% { transform: rotate(-14deg) translateX(-30px); }
          42%, 100% { transform: rotate(-8deg) translateX(0); }
        }

        @keyframes muzzle-pop {
          0%, 25%, 44%, 100% { opacity: 0; transform: rotate(-8deg) scale(0.5); }
          30%, 38% { opacity: 1; transform: rotate(-8deg) scale(1); }
        }

        @keyframes tracer-fire {
          0%, 25% { opacity: 0; transform: rotate(1deg) scaleX(0); }
          30% { opacity: 1; transform: rotate(1deg) scaleX(0.2); }
          38% { opacity: 0.95; transform: rotate(1deg) scaleX(1); }
          48%, 100% { opacity: 0; transform: rotate(1deg) scaleX(1); }
        }

        @keyframes impact-burst {
          0%, 30% { opacity: 0; transform: scale(0.2) rotate(0); }
          36% { opacity: 1; transform: scale(1) rotate(18deg); }
          52%, 100% { opacity: 0; transform: scale(1.85) rotate(42deg); }
        }

        @keyframes target-collapse {
          0%, 36% { transform: rotate(2deg) translateY(0) scale(1.16); filter: brightness(1); }
          43% { transform: rotate(15deg) translateY(24px) scale(1.16); filter: brightness(1.18); }
          58%, 100% { transform: rotate(75deg) translate(80px, 158px) scale(1.16); filter: brightness(0.72) saturate(0.82); }
        }

        @keyframes t-light-drop {
          0%, 38% { opacity: 0.35; }
          58%, 100% { opacity: 0.12; }
        }

        @keyframes kill-card {
          0%, 44% { opacity: 0; transform: translateX(-50%) translateY(14px); }
          52%, 80% { opacity: 1; transform: translateX(-50%) translateY(0); }
          86%, 100% { opacity: 0; transform: translateX(-50%) translateY(-8px); }
        }

        @keyframes sound-ring {
          0%, 25% { opacity: 0; transform: scale(0.2); }
          30% { opacity: 0.82; transform: scale(0.2); }
          56%, 100% { opacity: 0; transform: scale(2.1); }
        }

        @keyframes grain-shift {
          0% { transform: translate(0, 0); }
          100% { transform: translate(-18px, 12px); }
        }

        @media (max-width: 720px) {
          .agent { transform: scale(0.78); }
          .agent.ct { left: 4%; top: 31%; }
          .agent.t { right: 0%; top: 32%; }
          .rifle { width: 190px; }
          .muzzle-flash { left: 330px; }
          .site-mark { left: 34%; width: 250px; }
          .cover-b { left: 62%; width: 126px; }
          .kill-card { letter-spacing: 1.8px; max-width: 92vw; overflow: hidden; text-overflow: ellipsis; }
        }
      `}</style>

      <div className="cinema-bars" />
      <div className="stage">
        <div className="back-wall" />
        <div className="floor" />
        <div className="lane-light" />
        <div className="site-mark" />
        <div className="cover cover-a" />
        <div className="cover cover-b" />
        <div className="cover cover-c" />
        <div className="cover cover-d" />
        <div className="ct-glow" />
        <div className="t-glow" />

        <div className="agent ct" aria-label="Counter-terrorist anchor firing">
          <div className="agent-shadow" />
          <div className="leg left" />
          <div className="leg right" />
          <div className="torso" />
          <div className="vest" />
          <div className="head" />
          <div className="helmet" />
          <div className="arm back" />
          <div className="arm front" />
          <div className="rifle" />
          <div className="muzzle-flash" />
        </div>

        <div className="agent t" aria-label="T side entry being hit">
          <div className="agent-shadow" />
          <div className="leg left" />
          <div className="leg right" />
          <div className="torso" />
          <div className="vest" />
          <div className="head" />
          <div className="helmet" />
          <div className="arm back" />
          <div className="arm front" />
          <div className="rifle" />
        </div>

        <div className="tracer" />
        <div className="impact" />
        <div className="sound-ring" />
      </div>
      <div className="kill-card">
        <strong>AWP contact</strong> / one shot / entry down
      </div>
      <div className="film-grain" />
    </main>
  );
}
