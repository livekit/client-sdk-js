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
  // PoC: what the OTLP encoder costs on top of Room, against the same budgets.
  {
    name: 'esm + telemetry',
    path: 'dist/livekit-client.esm.mjs',
    import: '{ Room, telemetryPing }',
    limit: '150 kB',
  },
  {
    name: 'umd + telemetry',
    path: 'dist/livekit-client.umd.js',
    import: '{ Room, telemetryPing }',
    limit: '130 kB',
  },
];
