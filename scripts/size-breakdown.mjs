// Size breakdown: minified bytes per feature, counting the feature's own modules plus
// modules reachable only through it (esbuild, ES2019, minified, ESM). The gzip number per
// row is an estimate (saved min bytes * whole-bundle gzip/min ratio), not a measured gzip.
// Run from the repo root: `pnpm size:breakdown`. Markdown goes to stdout.
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const REPO = process.cwd();
const esbuild = createRequire(createRequire(path.join(REPO, 'package.json')).resolve('vite'))('esbuild');

async function bundle(name, contents) {
  const r = await esbuild.build({
    stdin: { contents, resolveDir: REPO, loader: 'ts', sourcefile: `entry-${name}.ts` },
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
  const code = r.outputFiles[0].contents;
  const out = Object.values(r.metafile.outputs)[0];
  return { name, min: code.length, gz: gzipSync(code, { level: 9 }).length, meta: r.metafile, out };
}

const FEATURES = {
  e2ee: (p) => p.startsWith('src/e2ee/'),
  frameMetadata: (p) => p.startsWith('src/frameMetadata/') || p === 'src/room/track/FrameMetadataExtractor.ts',
  dataTracks: (p) => p.startsWith('src/room/data-track/'),
  dataStreams: (p) => p.startsWith('src/room/data-stream/'),
  rpc: (p) => p.startsWith('src/room/rpc/'),
  webrtcAdapter: (p) => p.includes('node_modules/webrtc-adapter/') || p.includes('node_modules/sdp/'),
  connectionCheck: (p) => p.startsWith('src/connectionHelper/'),
  tokenSource: (p) => p.startsWith('src/room/token-source/') || p.includes('node_modules/jose/'),
  recorder: (p) => p === 'src/room/track/record.ts',
};

const GROUPS = [
  ['@livekit/protocol', (p) => p.includes('node_modules/@livekit/protocol/')],
  ['@bufbuild/protobuf', (p) => p.includes('node_modules/@bufbuild/')],
  ...Object.entries(FEATURES),
  ['other node_modules', (p) => p.includes('node_modules/')],
  ['Room.ts', (p) => p === 'src/room/Room.ts'],
  ['RTCEngine.ts', (p) => p === 'src/room/RTCEngine.ts'],
  ['LocalParticipant.ts', (p) => p === 'src/room/participant/LocalParticipant.ts'],
  ['SignalClient + api/', (p) => p.startsWith('src/api/')],
  ['PCTransport*', (p) => p.startsWith('src/room/PCTransport')],
  ['track/ (media)', (p) => p.startsWith('src/room/track/')],
  ['data-channel/', (p) => p.startsWith('src/room/data-channel/')],
  ['other src', () => true],
];
const groupOf = (p) => GROUPS.find(([, f]) => f(p))[0];

function graph(b) {
  const inputs = b.meta.inputs;
  const bytes = Object.fromEntries(Object.entries(b.out.inputs).map(([k, v]) => [k, v.bytesInOutput]));
  const edges = Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, v.imports.filter((i) => !i.external).map((i) => i.path)]));
  const entry = Object.keys(inputs).find((k) => k.includes('entry-'));
  return { bytes, edges, entry };
}

function reachableBytes({ bytes, edges, entry }, removed) {
  const seen = new Set();
  const stack = [entry];
  while (stack.length) {
    const n = stack.pop();
    if (seen.has(n) || (n !== entry && removed(n))) continue;
    seen.add(n);
    stack.push(...(edges[n] ?? []));
  }
  let sum = 0;
  for (const n of seen) sum += bytes[n] ?? 0;
  return sum;
}

const kb = (n) => (n / 1024).toFixed(1);
const log = (s = '') => console.log(s);

const entries = {
  'room-only': `export { Room } from './src/index';`,
  'full-api': `export * from './src/index';`,
};

for (const [name, src] of Object.entries(entries)) {
  const b = await bundle(name, src);
  const g = graph(b);
  const total = Object.values(g.bytes).reduce((a, c) => a + c, 0);
  const ratio = b.gz / b.min;
  log(`## ${name}: ${kb(b.min)} KiB min, ${kb(b.gz)} KiB gzip (ratio ${ratio.toFixed(2)})`);
  log();
  log('### Minified bytes by group');
  const byGroup = {};
  for (const [p, n] of Object.entries(g.bytes)) byGroup[groupOf(p)] = (byGroup[groupOf(p)] ?? 0) + n;
  for (const [k, v] of Object.entries(byGroup).sort((a, c) => c[1] - a[1])) {
    if (v > 0) log(`${k.padEnd(24)} ${kb(v).padStart(7)} KiB  ${((100 * v) / total).toFixed(1).padStart(5)}%`);
  }
  log();
  log('### Savings if removed (feature + modules only reachable through it)');
  const scenarios = {
    ...Object.fromEntries(Object.entries(FEATURES).map(([k, f]) => [k, f])),
    'rpc+dataStreams': (p) => FEATURES.rpc(p) || FEATURES.dataStreams(p),
    'ALL data/e2ee/fm (core)': (p) =>
      ['e2ee', 'frameMetadata', 'dataTracks', 'dataStreams', 'rpc'].some((k) => FEATURES[k](p)),
    'core + no webrtc-adapter': (p) =>
      ['e2ee', 'frameMetadata', 'dataTracks', 'dataStreams', 'rpc', 'webrtcAdapter'].some((k) => FEATURES[k](p)),
  };
  for (const [k, f] of Object.entries(scenarios)) {
    const saved = total - reachableBytes(g, f);
    if (saved === 0) continue;
    log(`${k.padEnd(26)} -${kb(saved).padStart(6)} KiB min  ~-${kb(saved * ratio).padStart(5)} KiB gz  (${((100 * saved) / total).toFixed(1)}%)`);
  }
  log();
  if (name === 'room-only') {
    log('### Core modules that import feature modules (edges to cut in phase 2)');
    const isFeature = (p) => ['e2ee', 'frameMetadata', 'dataTracks', 'dataStreams', 'rpc'].find((k) => FEATURES[k](p));
    for (const [from, tos] of Object.entries(g.edges)) {
      if (!from.startsWith('src/') || isFeature(from)) continue;
      const hits = [...new Set(tos.filter(isFeature).map(isFeature))];
      if (hits.length) log(`${from.padEnd(48)} -> ${hits.join(', ')}`);
    }
    log();
  }
}

log('### @livekit/protocol tree-shaking');
for (const [name, src] of Object.entries({
  'DataPacket only': `export { DataPacket } from '@livekit/protocol';`,
  'SignalRequest+SignalResponse': `export { SignalRequest, SignalResponse } from '@livekit/protocol';`,
  'everything': `export * from '@livekit/protocol';`,
})) {
  const b = await bundle(name, src);
  log(`${name.padEnd(30)} ${kb(b.min).padStart(7)} KiB min  ${kb(b.gz).padStart(6)} KiB gz`);
}
