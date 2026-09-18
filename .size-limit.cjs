module.exports = [
  {
    path: 'dist/livekit-client.esm.mjs',
    import: '{ Room }',
    limit: '150 kB',
  },
  {
    path: 'dist/livekit-client.umd.js',
    import: '{ Room }',
    // Telemetry costs +8.95 kB brotli, and UMD cannot shake it out: 130 kB no longer fits.
    // Raising it is one of two answers — the other is a separate UMD entry point, as the
    // e2ee and frame-metadata workers already have. See TELEMETRY.md.
    limit: '135 kB',
  },
];
