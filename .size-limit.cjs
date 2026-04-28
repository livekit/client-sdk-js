module.exports = [
  {
    path: 'dist/livekit-client.esm.mjs',
    import: '{ Room }',
    limit: '101 kB',
  },
  {
    path: 'dist/livekit-client.umd.js',
    import: '{ Room }',
    limit: '120 kB',
  },
];
