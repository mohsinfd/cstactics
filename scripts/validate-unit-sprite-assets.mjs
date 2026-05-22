import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pngjs from 'pngjs';

const { PNG } = pngjs;

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
    Array.from({ length: count }, (_, index) => ({ clip, frame: `${clip}_${index}` }))
  ));
}

function getManifestSource(team) {
  const manifestPath = path.join(root, 'src', 'renderer', 'locomotion', 'unitAnimationManifest.ts');
  const manifest = readFileSync(manifestPath, 'utf8');
  const match = manifest.match(new RegExp(`${team}:\\s*'(?<source>generated|exported)'`));
  return match?.groups?.source ?? 'generated';
}

function framePath({ team, source, extension, frame }) {
  const folder = source === 'exported'
    ? path.join(root, 'public', 'board2d5', 'units', 'exported', team.toLowerCase())
    : path.join(root, 'public', 'board2d5', 'units', team.toLowerCase());
  return path.join(folder, `${frame}.${extension}`);
}

function assertFiles({ team, source, extension, required }) {
  const missing = required
    .map(({ frame }) => framePath({ team, source, extension, frame }))
    .filter((filePath) => !existsSync(filePath));

  if (missing.length > 0) {
    return missing.map((filePath) => path.relative(root, filePath));
  }
  return [];
}

function getAlphaBounds(png) {
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  let opaquePixels = 0;
  let transparentPixels = 0;

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const alpha = png.data[(png.width * y + x) * 4 + 3];
      if (alpha > 12) {
        opaquePixels += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      } else {
        transparentPixels += 1;
      }
    }
  }

  if (opaquePixels === 0) return null;

  return {
    minX,
    minY,
    maxX,
    maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    opaquePixels,
    transparentPixels,
  };
}

function validateExportedPngQuality(team, required) {
  const failures = [];
  const boundsByClip = new Map();

  for (const { clip, frame } of required) {
    const filePath = framePath({ team, source: 'exported', extension: 'png', frame });
    if (!existsSync(filePath)) continue;

    let png;
    try {
      png = PNG.sync.read(readFileSync(filePath));
    } catch (error) {
      failures.push(`${path.relative(root, filePath)} could not be read as PNG: ${error.message}`);
      continue;
    }

    if (png.width !== 256 && png.width !== 512) {
      failures.push(`${path.relative(root, filePath)} width must be 256 or 512, got ${png.width}`);
    }
    if (png.height !== png.width) {
      failures.push(`${path.relative(root, filePath)} must be square, got ${png.width}x${png.height}`);
    }

    const bounds = getAlphaBounds(png);
    if (!bounds) {
      failures.push(`${path.relative(root, filePath)} has no visible alpha pixels`);
      continue;
    }
    if (bounds.transparentPixels <= 0) {
      failures.push(`${path.relative(root, filePath)} has no transparent background pixels`);
    }

    const frames = boundsByClip.get(clip) ?? [];
    frames.push({ frame, filePath, bounds, size: png.width });
    boundsByClip.set(clip, frames);
  }

  for (const [clip, frames] of boundsByClip) {
    if (frames.length < 2) continue;
    const averageX = frames.reduce((sum, frame) => sum + frame.bounds.centerX, 0) / frames.length;
    const averageY = frames.reduce((sum, frame) => sum + frame.bounds.centerY, 0) / frames.length;
    for (const frame of frames) {
      const jump = Math.hypot(frame.bounds.centerX - averageX, frame.bounds.centerY - averageY);
      const maxJump = frame.size * 0.08;
      if (jump > maxJump) {
        failures.push(`${path.relative(root, frame.filePath)} ${clip} bounding-box center jumps ${jump.toFixed(1)}px; max ${maxJump.toFixed(1)}px`);
      }
    }
  }

  return failures;
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
    } else {
      const qualityFailures = validateExportedPngQuality(team, required);
      if (qualityFailures.length > 0) {
        failures.push(`Exported ${team} PNG quality validation failed:\n${qualityFailures.join('\n')}`);
      }
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
