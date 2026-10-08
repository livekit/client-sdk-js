// Gate for the core entry's types: a consumer of `livekit-client/core` must not see the
// `declare module` augmentations from the full entry. tsc's declaration emitter writes
// `import("../..")` whenever an inferred type names a symbol it can reach through the index barrel,
// and that import pulls `index.d.ts` (with the augmentations) into the consumer's program. Emits
// the declarations to a temp dir, compiles a probe against them and fails if `index.d.ts` or
// `room/Room.d.ts` is in the program or the narrow types do not hold.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tsc = path.join(REPO, 'node_modules', '.bin', 'tsc');
const tmp = mkdtempSync(path.join(tmpdir(), 'lk-core-types-'));

const run = (args, opts = {}) => {
  try {
    return { ok: true, out: execFileSync(tsc, args, { cwd: REPO, encoding: 'utf8', ...opts }) };
  } catch (err) {
    return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
};

try {
  const emit = run(['--declaration', '--emitDeclarationOnly', '--noEmit', 'false', '--outDir', tmp]);
  if (!emit.ok) {
    console.error(emit.out);
    process.exit(1);
  }

  writeFileSync(
    path.join(tmp, 'probe.ts'),
    `import { createRoom, rpc } from 'livekit-client/core';
const room = createRoom(undefined, [rpc]);
room.registerRpcMethod('x', async () => '');
room.localParticipant.sendText('hi'); // dataStreams comes with rpc
// @ts-expect-error e2ee is not listed
room.setE2EEEnabled(true);
// @ts-expect-error dataTracks is not listed
room.localParticipant.publishDataTrack({ name: 'x' });
// @ts-expect-error simulatedParticipants is not listed
room.simulateParticipants({});
`,
  );
  writeFileSync(
    path.join(tmp, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        module: 'ESNext',
        moduleResolution: 'bundler',
        target: 'ES2020',
        skipLibCheck: true,
        paths: { 'livekit-client/core': [path.join(tmp, 'src', 'core.d.ts')] },
      },
      files: ['probe.ts'],
    }),
  );

  const check = run(['-p', path.join(tmp, 'tsconfig.json'), '--listFiles']);
  const leaked = check.out
    .split('\n')
    .filter((line) => /[\\/]src[\\/](index|room[\\/]Room)\.d\.ts$/.test(line.trim()));
  const errors = check.out.split('\n').filter((line) => /error TS\d+/.test(line));
  if (leaked.length > 0 || errors.length > 0) {
    console.error('core types leak the full entry:');
    for (const line of [...leaked, ...errors]) console.error(`  ${line.trim()}`);
    process.exit(1);
  }
  console.log('core types: narrow, index.d.ts not in the consumer program');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
