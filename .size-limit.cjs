module.exports = [
  {
    path: 'dist/livekit-client.esm.mjs',
    import: '{ Room }',
    limit: '150 kB',
  },
  {
    path: 'dist/livekit-client.umd.js',
    import: '{ Room }',
    // Telemetry cannot be shaken out of the UMD bundle: 130 kB no longer fits, and after the
    // review rounds the bundle sits at the 135 kB raised first. Raising it is one of two answers —
    // the other is a separate UMD entry point, as the e2ee and frame-metadata workers already have.
    limit: '140 kB',
  },
];
