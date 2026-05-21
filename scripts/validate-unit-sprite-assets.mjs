import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const REQUIRED_CLIPS = {
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

const teams = ['CT', 'T'];

function frameNames() {
  return Object.entries(REQUIRED_CLIPS).flatMap(([clip, count]) => (
    Array.from({ length: count }, (_, index) => `${clip}_${index}`)
  ));
}

function getManifestSource(team) {
  const manifestPath = path.join(root, 'src', 'renderer', 'locomotion', 'unitAnimationManifest.ts');
  const manifest = readFileSync(manifestPath, 'utf8');
  const match = manifest.match(new RegExp(`${team}:\\s*'(?<source>generated|exported)'`));
  return match?.groups?.source ?? 'generated';
}

function assertFiles({ team, source, extension, required }) {
  const folder = source === 'exported'
    ? path.join(root, 'public', 'board2d5', 'units', 'exported', team.toLowerCase())
    : path.join(root, 'public', 'board2d5', 'units', team.toLowerCase());
  const missing = required
    .map((frame) => path.join(folder, `${frame}.${extension}`))
    .filter((filePath) => !existsSync(filePath));

  if (missing.length > 0) {
    return missing.map((filePath) => path.relative(root, filePath));
  }
  return [];
}

const required = frameNames();
const failures = [];

for (const team of teams) {
  const generatedMissing = assertFiles({
    team,
    source: 'generated',
    extension: 'svg',
    required,
  });
  if (generatedMissing.length > 0) {
    failures.push(`Missing generated ${team} frames:\n${generatedMissing.join('\n')}`);
  }

  const source = getManifestSource(team);
  if (source === 'exported') {
    const exportedMissing = assertFiles({
      team,
      source: 'exported',
      extension: 'png',
      required,
    });
    if (exportedMissing.length > 0) {
      failures.push(`Manifest sets ${team} to exported, but PNG frames are missing:\n${exportedMissing.join('\n')}`);
    }
  } else {
    console.warn(`[sprites:validate] ${team} uses generated placeholder frames. Exported PNGs are not required yet.`);
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n\n'));
  process.exit(1);
}

console.log('[sprites:validate] Unit sprite assets are valid for the current manifest sources.');
