// Gate for the published declarations, as a consumer sees them. Packs the built package
// (run `pnpm build` first), installs the tarball into a temp project and type-checks every
// entry with `skipLibCheck` off and the strictest options a consumer may set. That catches:
// - a declaration that imports a package the consumer does not install (a devDependency, or a
//   dependency whose types live in a devDependency `@types/*` package);
// - declarations that contradict each other under `exactOptionalPropertyTypes`.
// The temp project sits outside the repo: inside it, module resolution walks up to the repo's
// node_modules and finds the devDependencies, which hides the first case.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tsc = path.join(REPO, 'node_modules', '.bin', 'tsc');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'livekit-published-types-'));

const run = (cmd, args, cwd) => {
  try {
    return { ok: true, out: execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: 'pipe' }) };
  } catch (err) {
    return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
};

const must = (result) => {
  if (!result.ok) {
    console.error(result.out);
    process.exit(1);
  }
};

try {
  must(run('pnpm', ['pack', '--pack-destination', tmp], REPO));
  const tarball = readdirSync(tmp).find((file) => file.endsWith('.tgz'));
  writeFileSync(
    path.join(tmp, 'package.json'),
    JSON.stringify({ name: 'consumer', private: true, type: 'module' }),
  );
  // npm, not pnpm: a flat node_modules with only what the package.json declares (and its peers).
  must(run('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', `./${tarball}`], tmp));

  writeFileSync(
    path.join(tmp, 'probe.ts'),
    `export * as full from 'livekit-client';
export * as core from 'livekit-client/core';
export * as e2eeWorker from 'livekit-client/e2ee-worker';
export * as frameMetadataWorker from 'livekit-client/frame-metadata-worker';
`,
  );
  writeFileSync(
    path.join(tmp, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        noEmit: true,
        strict: true,
        exactOptionalPropertyTypes: true,
        skipLibCheck: false,
        module: 'ESNext',
        moduleResolution: 'bundler',
        target: 'ES2022',
        lib: ['DOM', 'DOM.Iterable', 'ES2022'],
      },
      files: ['probe.ts'],
    }),
  );

  const check = run(tsc, ['-p', path.join(tmp, 'tsconfig.json')], tmp);
  const errors = check.out.split('\n').filter((line) => /error TS\d+/.test(line));
  if (!check.ok || errors.length > 0) {
    console.error('published types: a consumer with skipLibCheck off gets errors:');
    for (const line of errors.length > 0 ? errors : [check.out]) console.error(`  ${line.trim()}`);
    process.exit(1);
  }
  console.log('published types: all entries type-check in a consumer with skipLibCheck off');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
