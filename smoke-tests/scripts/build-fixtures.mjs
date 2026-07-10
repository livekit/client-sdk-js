#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const smokeRoot = resolve(here, '..');
const fixturesDir = join(smokeRoot, 'fixtures');

const livekitPkg = join(smokeRoot, 'node_modules', 'livekit-client', 'package.json');
if (!existsSync(livekitPkg)) {
  console.error(
    '[smoke] node_modules/livekit-client not found. Did you run `npm run prepare:pack && npm install`?',
  );
  process.exit(1);
}

const run = (cmd, cwd) => {
  console.log(`[smoke] $ ${cmd}    (cwd=${cwd})`);
  execSync(cmd, { cwd, stdio: 'inherit' });
};

run('node ../../node_modules/vite/bin/vite.js build', join(fixturesDir, 'bundler-esm'));
run('node ../../node_modules/webpack-cli/bin/cli.js', join(fixturesDir, 'bundler-cjs'));
