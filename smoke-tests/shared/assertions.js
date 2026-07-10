// Runs in the browser (loaded directly via <script> or bundled). The function
// must work against any of the four published shapes: native ESM module
// namespace, UMD global object, Vite-bundled ESM namespace, webpack-bundled
// CJS interop object. All we require is property access on `lk`.
//
// Returns a structured result the Playwright spec inspects via
// page.evaluate(() => window.__smoke).
(function (root) {
  function runSmoke(lk, expectedVersion) {
    const errors = [];
    const must = function (cond, msg) {
      if (!cond) errors.push(msg);
    };

    const requiredValueExports = [
      'Room',
      'LocalParticipant',
      'RemoteParticipant',
      'Participant',
      'LocalTrack',
      'RemoteTrack',
      'LocalAudioTrack',
      'LocalVideoTrack',
      'RemoteAudioTrack',
      'RemoteVideoTrack',
      'LocalTrackPublication',
      'RemoteTrackPublication',
      'TrackPublication',
      'Track',
      'ConnectionState',
      'ConnectionQuality',
      'DisconnectReason',
      'RoomEvent',
      'ParticipantEvent',
      'TrackEvent',
      'LogLevel',
      'version',
      'createLocalTracks',
      'createLocalAudioTrack',
      'createLocalVideoTrack',
      'isBrowserSupported',
      'supportsAdaptiveStream',
    ];
    for (var i = 0; i < requiredValueExports.length; i++) {
      var name = requiredValueExports[i];
      must(
        lk[name] !== undefined && lk[name] !== null,
        'missing export: ' + name + ' (got ' + typeof lk[name] + ')',
      );
    }

    must(
      typeof lk.version === 'string' && lk.version.length > 0,
      'lk.version is not a non-empty string',
    );
    must(
      lk.version === expectedVersion,
      'version mismatch: lk.version=' + lk.version + ' expected=' + expectedVersion,
    );

    must(
      lk.ConnectionState && lk.ConnectionState.Disconnected === 'disconnected',
      'ConnectionState.Disconnected wrong: ' +
        (lk.ConnectionState && lk.ConnectionState.Disconnected),
    );

    must(
      lk.RoomEvent && typeof lk.RoomEvent.Connected === 'string',
      'RoomEvent.Connected not a string',
    );

    var room = null;
    try {
      room = new lk.Room();
    } catch (err) {
      errors.push('new Room() threw: ' + (err && err.message ? err.message : String(err)));
    }
    if (room) {
      must(
        room.state === lk.ConnectionState.Disconnected,
        'room.state expected Disconnected, got ' + room.state,
      );
      must(typeof room.connect === 'function', 'room.connect is not a function');
      must(typeof room.disconnect === 'function', 'room.disconnect is not a function');
      must(
        typeof room.prepareConnection === 'function',
        'room.prepareConnection is not a function',
      );
      try {
        room.disconnect();
      } catch (err) {
        errors.push(
          'room.disconnect() on a disconnected room threw: ' +
            (err && err.message ? err.message : String(err)),
        );
      }
    }

    try {
      must(lk.isBrowserSupported() === true, 'isBrowserSupported() returned false');
    } catch (err) {
      errors.push(
        'isBrowserSupported() threw: ' + (err && err.message ? err.message : String(err)),
      );
    }

    return {
      ok: errors.length === 0,
      errors: errors,
      version: lk.version,
      exportCount: Object.keys(lk).length,
    };
  }

  // Expose for both classic-script and ESM contexts.
  root.__livekitRunSmoke = runSmoke;
})(typeof globalThis !== 'undefined' ? globalThis : window);
