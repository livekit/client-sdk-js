// Gate for the core entry: bundling `CoreRoom` alone must pull in no extension module.
// Bundles `export { CoreRoom } from './src/core'` with esbuild and inspects the metafile.
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
  'src/room/rpc/',
  'node_modules/webrtc-adapter/',
];

const result = await esbuild.build({
  stdin: {
    contents: `export { CoreRoom } from './src/core';`,
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
const kib = (result.outputFiles[0].contents.length / 1024).toFixed(1);

if (leaked.length > 0) {
  console.error(`CoreRoom bundle includes extension modules:\n  ${leaked.join('\n  ')}`);
  process.exit(1);
}
console.log(`CoreRoom bundle: ${kib} KiB minified, ${inputs.length} modules, no extension modules`);
