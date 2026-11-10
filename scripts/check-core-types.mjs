// Gate for the core entry's types. Emits the declarations the way the core build does (a
// program rooted at core.ts, `@internal` members stripped) and type-checks them plus a consumer
// probe, with `skipLibCheck` off. That catches two things:
// - a public signature that names a stripped `@internal` symbol (the declaration then dangles);
// - the `declare module` augmentations of the full entry reaching a core consumer. tsc writes
//   `import("../..")` for an inferred type when the index barrel is in its program, and that
//   import pulls `index.d.ts` into the consumer's program, so a `[rpc]` room would type as if
//   every extension were installed. Rooting the program at core.ts prevents it; the probe
//   confirms it.
// The temp dir sits inside the repo so bare imports (`@livekit/protocol`) resolve.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tsc = path.join(REPO, 'node_modules', '.bin', 'tsc');
const tmp = mkdtempSync(path.join(REPO, '.tmp-core-types-'));

const run = (args) => {
  try {
    return { ok: true, out: execFileSync(tsc, args, { cwd: REPO, encoding: 'utf8' }) };
  } catch (err) {
    return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
};

try {
  writeFileSync(
    path.join(tmp, 'tsconfig.emit.json'),
    JSON.stringify({
      extends: '../tsconfig.json',
      compilerOptions: {
        noEmit: false,
        declaration: true,
        emitDeclarationOnly: true,
        stripInternal: true,
        outDir: tmp,
      },
      include: ['../src/type-polyfills/*.d.ts'],
      files: ['../src/core.ts'],
    }),
  );
  const emit = run(['-p', path.join(tmp, 'tsconfig.emit.json')]);
  if (!emit.ok) {
    console.error(emit.out);
    process.exit(1);
  }

  writeFileSync(
    path.join(tmp, 'probe.ts'),
    `import * as core from 'livekit-client/core';
import { createRoom, e2ee, frameMetadata, rpc, type TrackPublishDefaults } from 'livekit-client/core';
// @ts-expect-error deprecated aliases are exported from the full entry only
core.isBackupCodec;
// @ts-expect-error deprecated aliases are exported from the full entry only
core.PacketTrailerManager;
// @ts-expect-error deprecated aliases are exported from the full entry only
export type PacketTrailerOptions = core.PacketTrailerOptions;
const room = createRoom(undefined, [rpc]);
room.registerRpcMethod('x', async () => '');
room.localParticipant.sendText('hi'); // dataStreams comes with rpc
// an extension without a participant (e2ee) or room API (frameMetadata) keeps the others' types
const mixed = createRoom(undefined, [rpc, e2ee({} as never), frameMetadata({} as never)]);
mixed.localParticipant.sendText('hi');
mixed.registerRpcMethod('x', async () => '');
mixed.setE2EEEnabled(true);
// @ts-expect-error the deprecated participant rpc methods are full build only
room.localParticipant.registerRpcMethod('x', async () => '');
// @ts-expect-error the deprecated packetTrailer publish option is full build only
export const publishDefaults: TrackPublishDefaults = { packetTrailer: {} };
// @ts-expect-error e2ee is not listed
room.setE2EEEnabled(true);
// @ts-expect-error dataTracks is not listed
room.localParticipant.publishDataTrack({ name: 'x' });
// @ts-expect-error simulatedParticipants is not listed
room.simulateParticipants({});
// @ts-expect-error engine is @internal and stripped from the core types
room.engine;
`,
  );
  writeFileSync(
    path.join(tmp, 'tsconfig.json'),
    JSON.stringify({
      extends: '../tsconfig.json',
      compilerOptions: {
        noEmit: true,
        skipLibCheck: false,
        rootDir: '.',
        paths: { 'livekit-client/core': ['./src/core.d.ts'] },
      },
      include: [],
      files: ['src/core.d.ts', 'probe.ts'],
    }),
  );

  const check = run(['-p', path.join(tmp, 'tsconfig.json'), '--listFiles']);
  const leaked = check.out
    .split('\n')
    .filter((line) => /[\\/]src[\\/](index|room[\\/]Room|Room)\.d\.ts$/.test(line.trim()));
  const errors = check.out
    .split('\n')
    .filter((line) => /error TS\d+/.test(line))
    .map((line) => line.replace(`${tmp}${path.sep}`, ''));
  if (leaked.length > 0 || errors.length > 0) {
    console.error('core types: the stripped declarations do not stand on their own:');
    for (const line of [...leaked, ...errors]) console.error(`  ${line.trim()}`);
    process.exit(1);
  }
  console.log('core types: stripped, consistent, index.d.ts not in the consumer program');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
