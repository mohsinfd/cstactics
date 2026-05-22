import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Placeholder programmer-art frame generator.
// This exists to prove runtime animation plumbing.
// Final production frames should come from Blender-exported or artist-authored
// sprite sheets. Do not spend more time making this generator visually clever.

const OUT_ROOT = join(process.cwd(), 'public', 'board2d5', 'units');

const TEAMS = {
  ct: {
    body: '#287ec8',
    bodyDark: '#0a2f68',
    vest: '#0f4da8',
    head: '#8cc7ec',
    helmet: '#dff7ff',
    accent: '#70d7ff',
    weapon: '#071018',
    shadow: '#020810',
  },
  t: {
    body: '#d94a2e',
    bodyDark: '#6d130c',
    vest: '#9f2518',
    head: '#bb7948',
    helmet: '#f4aa52',
    accent: '#ffd166',
    weapon: '#120605',
    shadow: '#160301',
  },
};

const FRAME_COUNTS = {
  idle: 1,
  run_forward: 6,
  diagonal_left: 4,
  diagonal_right: 4,
  strafe_left: 4,
  strafe_right: 4,
  backpedal: 4,
  stop_brace: 3,
  hit: 2,
  dead: 1,
};

function n(value) {
  return Number(value).toFixed(1).replace(/\.0$/, '');
}

function linePath(a, b) {
  return `M ${n(a.x)} ${n(a.y)} L ${n(b.x)} ${n(b.y)}`;
}

function poly(points) {
  return points.map((point) => `${n(point.x)},${n(point.y)}`).join(' ');
}

function poseParams(pose, index, count) {
  const t = count <= 1 ? 0 : index / count;
  const phase = t * Math.PI * 2;
  const wave = Math.sin(phase);
  const counter = Math.sin(phase + Math.PI);
  const lift = Math.cos(phase);

  const base = {
    lean: 0,
    side: 0,
    bob: 0,
    shoulder: 46,
    torsoSquash: 0,
    rifleAngle: -10,
    rifleReach: 58,
    leftLeg: wave * 14,
    rightLeg: counter * 14,
    leftLegLift: Math.max(0, lift) * -7,
    rightLegLift: Math.max(0, -lift) * -7,
    leftArm: counter * 8,
    rightArm: wave * 8,
    headX: 0,
    headY: 0,
    hit: 0,
    dead: false,
  };

  if (pose === 'idle') {
    return { ...base, bob: 0, leftLeg: -3, rightLeg: 3, leftArm: 1, rightArm: -1, rifleAngle: -8 };
  }

  if (pose === 'run_forward') {
    return { ...base, bob: Math.sin(phase * 2) * 2.4, lean: 8 + wave * 1.6, rifleAngle: -12 + wave * 3, shoulder: 48 + Math.abs(wave) * 3 };
  }

  if (pose === 'diagonal_left' || pose === 'diagonal_right') {
    const dir = pose === 'diagonal_left' ? -1 : 1;
    return {
      ...base,
      side: dir * (7 + Math.abs(wave) * 3),
      lean: 6,
      bob: Math.sin(phase * 2) * 1.8,
      shoulder: 47 + Math.abs(wave) * 2,
      rifleAngle: -10 + dir * 9 + wave * 2,
      leftLeg: wave * 11 - dir * 6,
      rightLeg: counter * 11 - dir * 2,
      leftArm: counter * 7 + dir * 4,
      rightArm: wave * 7 + dir * 4,
      headX: dir * 3,
    };
  }

  if (pose === 'strafe_left' || pose === 'strafe_right') {
    const dir = pose === 'strafe_left' ? -1 : 1;
    return {
      ...base,
      side: dir * (12 + Math.abs(wave) * 5),
      lean: dir * 12,
      bob: Math.sin(phase * 2) * 1.4,
      shoulder: 52,
      rifleAngle: -8 + dir * 16,
      rifleReach: 54,
      leftLeg: dir * 12 + wave * 8,
      rightLeg: -dir * 6 + counter * 8,
      leftLegLift: Math.max(0, lift) * -5,
      rightLegLift: Math.max(0, -lift) * -5,
      leftArm: dir * 12 + counter * 6,
      rightArm: dir * 8 + wave * 6,
      headX: dir * 5,
    };
  }

  if (pose === 'backpedal') {
    return {
      ...base,
      lean: -7,
      bob: Math.sin(phase * 2) * 1.2,
      shoulder: 44,
      rifleAngle: -5 + wave * 2,
      rifleReach: 50,
      leftLeg: -wave * 9,
      rightLeg: -counter * 9,
      leftArm: wave * 5,
      rightArm: counter * 5,
      headY: 2,
    };
  }

  if (pose === 'stop_brace') {
    const brace = index / Math.max(1, count - 1);
    return {
      ...base,
      lean: 9 - brace * 7,
      bob: -5 + brace * 4,
      shoulder: 52 - brace * 4,
      torsoSquash: 5 - brace * 3,
      rifleAngle: -14 + brace * 5,
      rifleReach: 56 - brace * 3,
      leftLeg: -12 + brace * 8,
      rightLeg: 12 - brace * 8,
      leftArm: 8 - brace * 5,
      rightArm: -7 + brace * 5,
      headY: 2 - brace,
    };
  }

  if (pose === 'hit') {
    const dir = index === 0 ? -1 : 1;
    return {
      ...base,
      side: dir * 9,
      lean: dir * -15,
      bob: index === 0 ? -1 : 4,
      shoulder: 50,
      torsoSquash: 3,
      rifleAngle: -28 + dir * 18,
      rifleReach: 48,
      leftLeg: -10,
      rightLeg: 12,
      leftArm: -18 * dir,
      rightArm: 14 * dir,
      headX: dir * 8,
      headY: -2,
      hit: 1,
    };
  }

  if (pose === 'dead') {
    return {
      ...base,
      side: 0,
      lean: -62,
      bob: 25,
      shoulder: 54,
      torsoSquash: 14,
      rifleAngle: -24,
      rifleReach: 66,
      leftLeg: -26,
      rightLeg: 22,
      leftArm: -22,
      rightArm: 18,
      headX: -24,
      headY: 34,
      dead: true,
    };
  }

  return base;
}

function renderSoldierSvg(team, pose, frameIndex, frameCount) {
  const c = TEAMS[team];
  const p = poseParams(pose, frameIndex, frameCount);
  const cx = 128 + p.side;
  const torsoTopY = 78 + p.bob + p.torsoSquash;
  const torsoBottomY = 145 + p.bob;
  const shoulderY = 91 + p.bob;
  const hipY = 146 + p.bob;
  const lean = p.lean;
  const shoulderHalf = p.shoulder / 2;
  const hipHalf = 20 + p.torsoSquash * 0.4;
  const head = { x: cx + p.headX + lean * 0.35, y: 59 + p.bob + p.headY };
  const leftShoulder = { x: cx - shoulderHalf + lean * 0.28, y: shoulderY };
  const rightShoulder = { x: cx + shoulderHalf + lean * 0.28, y: shoulderY };
  const leftHand = { x: cx - 18 + p.leftArm + lean * 0.18, y: 122 + p.bob + Math.abs(p.leftArm) * 0.08 };
  const rightHand = { x: cx + 24 + p.rightArm + lean * 0.18, y: 118 + p.bob - Math.abs(p.rightArm) * 0.05 };
  const leftHip = { x: cx - hipHalf, y: hipY };
  const rightHip = { x: cx + hipHalf, y: hipY };
  const leftFoot = { x: cx - 22 + p.leftLeg, y: 196 + p.leftLegLift + p.bob * 0.3 };
  const rightFoot = { x: cx + 23 + p.rightLeg, y: 195 + p.rightLegLift + p.bob * 0.3 };
  const rifleRadians = p.rifleAngle * Math.PI / 180;
  const rifleStart = { x: (leftHand.x + rightHand.x) / 2, y: (leftHand.y + rightHand.y) / 2 - 3 };
  const rifleEnd = {
    x: rifleStart.x + Math.cos(rifleRadians) * p.rifleReach,
    y: rifleStart.y + Math.sin(rifleRadians) * p.rifleReach,
  };
  const rifleStock = {
    x: rifleStart.x - Math.cos(rifleRadians) * 24,
    y: rifleStart.y - Math.sin(rifleRadians) * 24,
  };
  const torso = [
    { x: leftShoulder.x, y: torsoTopY },
    { x: rightShoulder.x, y: torsoTopY + p.torsoSquash * 0.25 },
    { x: cx + hipHalf + lean * 0.15, y: torsoBottomY },
    { x: cx - hipHalf + lean * 0.15, y: torsoBottomY },
  ];
  const chest = [
    { x: cx - 14 + lean * 0.15, y: torsoTopY + 17 },
    { x: cx + 14 + lean * 0.15, y: torsoTopY + 17 },
    { x: cx + 10, y: torsoTopY + 40 },
    { x: cx - 10, y: torsoTopY + 40 },
  ];
  const accentOpacity = p.hit ? 0.95 : 0.82;
  const hitFlash = p.hit
    ? `  <path d="M ${n(cx - 42)} ${n(torsoTopY + 12)} L ${n(cx - 16)} ${n(torsoTopY + 6)} L ${n(cx - 30)} ${n(torsoTopY + 30)} L ${n(cx + 4)} ${n(torsoTopY + 18)}" fill="#fff1f3" opacity="0.65"/>
`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" fill="none">
  <defs>
    <filter id="softShadow" x="28" y="166" width="200" height="64" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse">
      <feGaussianBlur stdDeviation="7"/>
    </filter>
    <linearGradient id="body" x1="${n(cx - 28)}" y1="${n(torsoTopY)}" x2="${n(cx + 28)}" y2="${n(torsoBottomY)}" gradientUnits="userSpaceOnUse">
      <stop stop-color="${c.body}"/>
      <stop offset="1" stop-color="${c.bodyDark}"/>
    </linearGradient>
  </defs>
  <ellipse cx="${n(cx)}" cy="${p.dead ? 205 : 205}" rx="${p.dead ? 78 : 58}" ry="${p.dead ? 18 : 22}" fill="${c.shadow}" opacity="${p.dead ? 0.5 : 0.42}" filter="url(#softShadow)"/>
  <path d="${linePath(leftHip, leftFoot)}" stroke="${c.bodyDark}" stroke-width="${p.dead ? 15 : 16}" stroke-linecap="round"/>
  <path d="${linePath(rightHip, rightFoot)}" stroke="${c.bodyDark}" stroke-width="${p.dead ? 15 : 16}" stroke-linecap="round"/>
  <path d="${linePath({ x: leftFoot.x - 10, y: leftFoot.y + 3 }, { x: leftFoot.x + 15, y: leftFoot.y + 1 })}" stroke="#030407" stroke-width="9" stroke-linecap="round"/>
  <path d="${linePath({ x: rightFoot.x - 12, y: rightFoot.y + 3 }, { x: rightFoot.x + 15, y: rightFoot.y + 1 })}" stroke="#030407" stroke-width="9" stroke-linecap="round"/>
  <polygon points="${poly(torso)}" fill="url(#body)"/>
  <polygon points="${poly(chest)}" fill="${team === 'ct' ? '#dff7ff' : '#431006'}" opacity="${team === 'ct' ? 0.7 : 0.8}"/>
  <path d="${linePath(leftShoulder, leftHand)}" stroke="${c.bodyDark}" stroke-width="14" stroke-linecap="round"/>
  <path d="${linePath(rightShoulder, rightHand)}" stroke="${c.bodyDark}" stroke-width="14" stroke-linecap="round"/>
  <path d="${linePath(rifleStock, rifleEnd)}" stroke="${c.weapon}" stroke-width="10" stroke-linecap="round"/>
  <path d="${linePath(rifleStart, rifleEnd)}" stroke="#020304" stroke-width="5" stroke-linecap="round"/>
  <path d="${linePath({ x: rifleStart.x - 3, y: rifleStart.y + 8 }, { x: rifleStart.x + 8, y: rifleStart.y + 25 })}" stroke="${c.weapon}" stroke-width="7" stroke-linecap="round"/>
  <ellipse cx="${n(head.x)}" cy="${n(head.y)}" rx="${p.dead ? 17 : 20}" ry="${p.dead ? 16 : 21}" fill="${c.head}"/>
  <path d="M ${n(head.x - 24)} ${n(head.y - 4)} C ${n(head.x - 16)} ${n(head.y - 25)}, ${n(head.x + 16)} ${n(head.y - 25)}, ${n(head.x + 24)} ${n(head.y - 4)} C ${n(head.x + 10)} ${n(head.y - 12)}, ${n(head.x - 10)} ${n(head.y - 12)}, ${n(head.x - 24)} ${n(head.y - 4)} Z" fill="${c.helmet}"/>
  <path d="M ${n(cx - 18)} ${n(torsoBottomY - 13)} L ${n(cx + 18)} ${n(torsoBottomY - 13)} L ${n(cx + 12)} ${n(torsoBottomY + 1)} L ${n(cx - 12)} ${n(torsoBottomY + 1)} Z" fill="${c.vest}" opacity="0.86"/>
  <path d="M ${n(cx - 23)} ${n(torsoTopY + 50)} L ${n(cx + 23)} ${n(torsoTopY + 50)}" stroke="${c.accent}" stroke-width="5" stroke-linecap="round" opacity="${accentOpacity}"/>
${hitFlash}
</svg>
`;
}

for (const team of Object.keys(TEAMS)) {
  const teamDir = join(OUT_ROOT, team);
  mkdirSync(teamDir, { recursive: true });
  for (const [pose, count] of Object.entries(FRAME_COUNTS)) {
    for (let i = 0; i < count; i += 1) {
      const file = join(teamDir, `${pose}_${i}.svg`);
      writeFileSync(file, renderSoldierSvg(team, pose, i, count), 'utf8');
    }
  }
}

console.log(`Generated ${Object.values(FRAME_COUNTS).reduce((sum, count) => sum + count, 0) * Object.keys(TEAMS).length} unit locomotion SVGs.`);
