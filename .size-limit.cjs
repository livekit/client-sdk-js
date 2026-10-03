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
];
