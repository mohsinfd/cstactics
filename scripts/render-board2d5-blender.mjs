import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');
const scriptPath = resolve(repoRoot, 'scripts/blender/banana_b_clay_v1.py');
const candidates = [
  process.env.BLENDER_EXE,
  'blender',
  'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe',
  'C:/Program Files/Blender Foundation/Blender 5.0/blender.exe',
  'C:/Program Files/Blender Foundation/Blender 4.4/blender.exe',
  'C:/Program Files/Blender Foundation/Blender 4.3/blender.exe',
].filter(Boolean);

function canRun(command) {
  if (command.includes('/') || command.includes('\\')) {
    return existsSync(command);
  }

  const probe = spawnSync(command, ['--version'], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  return probe.status === 0;
}

const blender = candidates.find(canRun);
if (!blender) {
  console.error('Could not find Blender. Install Blender or set BLENDER_EXE to blender.exe.');
  process.exit(1);
}

const result = spawnSync(blender, ['--background', '--python', scriptPath], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: false,
});

process.exit(result.status ?? 1);
