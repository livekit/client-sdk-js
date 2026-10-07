module.exports = [
  {
    path: 'dist/livekit-client.esm.mjs',
    import: '{ Room }',
    limit: '150 kB',
  },
  {
    path: 'dist/livekit-client.umd.js',
    import: '{ Room }',
    limit: '130 kB',
  },
  {
    // the light room without any extension (src/core.ts is not published yet)
    path: 'dist/livekit-client.core.esm.mjs',
    import: '{ CoreRoom }',
    limit: '100 kB',
  },
  {
    path: 'dist/livekit-client.core.esm.mjs',
    import: '{ CoreRoom, rpc }',
    limit: '105 kB',
  },
];
