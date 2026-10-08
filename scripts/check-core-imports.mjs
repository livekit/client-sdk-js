// Gate for the core entry: bundling `createRoom` alone must pull in no extension module.
// Bundles `export { createRoom } from './src/core'` with esbuild and inspects the metafile.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const REPO = process.cwd();
const esbuild = createRequire(createRequire(path.join(REPO, 'package.json')).resolve('vite'))(
  'esbuild',
);

// Modules that belong to an extension. `src/e2ee/utils.ts` and `src/frameMetadata/utils.ts`
// are not listed: core needs them for the insertable streams check and the publish options.
const EXTENSION_MODULES = [
  'src/e2ee/E2eeManager.ts',
  'src/e2ee/extension.ts',
  'src/e2ee/KeyProvider.ts',
  'src/e2ee/worker/',
  'src/frameMetadata/FrameMetadataManager.ts',
  'src/frameMetadata/extension.ts',
  'src/room/data-track/LocalDataTrack.ts',
  'src/room/data-track/RemoteDataTrack.ts',
  'src/room/data-track/incoming/',
  'src/room/data-track/outgoing/',
  'src/room/data-track/extension.ts',
  'src/room/data-track/types.ts',
  'src/room/data-stream/',
  'src/room/track/LocalVideoTrack.ts',
  'src/room/track/facingMode.ts',
  'src/room/participant/publishUtils.ts',
  'src/room/video/',
  'src/room/chat/',
  'src/room/simulated-participants/',
  'src/room/rpc/',
  'node_modules/webrtc-adapter/',
];

const result = await esbuild.build({
  stdin: {
    contents: `export { createRoom } from './src/core';`,
    resolveDir: REPO,
    loader: 'ts',
  },
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2019',
  write: false,
  metafile: true,
  logLevel: 'error',
  absWorkingDir: REPO,
});

const inputs = Object.keys(Object.values(result.metafile.outputs)[0].inputs);
const leaked = inputs.filter((file) => EXTENSION_MODULES.some((prefix) => file.includes(prefix)));

// Only an extension reads its own slice of the room options (when listed bare); a configured
// extension (`e2ee({ ... })`) never writes it, so core and the other extensions must not read it.
// Extensions hand core what it needs through `ExtensionContext` slots, and other extensions ask
// the room (`room.hasE2EESetup`) or `ctx.get(extension)`.
const OWN_SLICE = {
  'src/e2ee/': /^(e2ee|encryption)$/,
  'src/frameMetadata/': /^(frameMetadata|packetTrailer)$/,
  'src/room/data-stream/': /^dataStream$/,
};
const OPTION_SLICE =
  /\b(?:options|roomOptions)\.(e2ee|encryption|frameMetadata|packetTrailer|dataStream)\b/g;
const sources = execFileSync('git', ['ls-files', 'src/**/*.ts'], { cwd: REPO, encoding: 'utf8' })
  .split('\n')
  .filter((file) => file && !file.endsWith('.test.ts') && !file.includes('/worker/'));
const optionReads = sources.flatMap((file) => {
  const own = Object.entries(OWN_SLICE).find(([dir]) => file.startsWith(dir))?.[1];
  return readFileSync(path.join(REPO, file), 'utf8')
    .split('\n')
    .flatMap((line, i) =>
      [...line.matchAll(OPTION_SLICE)]
        .filter((m) => !own?.test(m[1]))
        .map(() => `${file}:${i + 1}: ${line.trim()}`),
    );
});
if (optionReads.length > 0) {
  console.error(`modules read another extension's option slice:\n  ${optionReads.join('\n  ')}`);
  process.exit(1);
}
const kib = (result.outputFiles[0].contents.length / 1024).toFixed(1);

if (leaked.length > 0) {
  console.error(`createRoom bundle includes extension modules:\n  ${leaked.join('\n  ')}`);
  process.exit(1);
}
console.log(
  `createRoom bundle: ${kib} KiB minified, ${inputs.length} modules, no extension modules`,
);
