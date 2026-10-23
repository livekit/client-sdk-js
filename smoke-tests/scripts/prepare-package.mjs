#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const smokeRoot = resolve(here, '..');
const repoRoot = resolve(smokeRoot, '..');
const tarballTarget = join(smokeRoot, 'livekit-client.tgz');

const distDir = join(repoRoot, 'dist');
if (!existsSync(distDir) || !statSync(distDir).isDirectory()) {
  console.error(
    '[smoke] dist/ not found in repo root. Run `pnpm build` (or `pnpm build:clean`) before the smoke tests.',
  );
  process.exit(1);
}

const stagingDir = mkdtempSync(join(tmpdir(), 'livekit-smoke-pack-'));
try {
  console.log('[smoke] packing livekit-client from', repoRoot);
  execSync(`npm pack --pack-destination "${stagingDir}"`, {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  const produced = readdirSync(stagingDir).filter((f) => f.endsWith('.tgz'));
  if (produced.length !== 1) {
    throw new Error(`expected exactly one tarball, found ${produced.length}: ${produced.join(', ')}`);
  }
  // Copy, not rename: tmpdir() can be a separate filesystem (tmpfs on Ubuntu 26.04 runners).
  copyFileSync(join(stagingDir, produced[0]), tarballTarget);
  console.log('[smoke] wrote', tarballTarget);
} finally {
  rmSync(stagingDir, { recursive: true, force: true });
}
