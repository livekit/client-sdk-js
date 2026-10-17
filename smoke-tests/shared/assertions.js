// Runs in the browser (loaded directly via <script> or bundled). The function
// must work against any of the four published shapes: native ESM module
// namespace, UMD global object, Vite-bundled ESM namespace, webpack-bundled
// CJS interop object. All we require is property access on `lk`.
//
// Returns a structured result the Playwright spec inspects via
// page.evaluate(() => window.__smoke).
(function (root) {
  async function runSmoke(lk, expectedVersion) {
    const errors = [];
    const must = function (cond, msg) {
      if (!cond) errors.push(msg);
    };

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
        var connectedEvents = 0;
        const onConnected = function () {
          connectedEvents += 1;
        };
        room.on(lk.RoomEvent.Connected, onConnected);
        room.emit(lk.RoomEvent.Connected);
        room.off(lk.RoomEvent.Connected, onConnected);
        room.emit(lk.RoomEvent.Connected);
        must(connectedEvents === 1, 'Room event on/off did not preserve EventEmitter behavior');

        room.registerTextStreamHandler('smoke-text', function () {});
        room.unregisterTextStreamHandler('smoke-text');
        room.registerByteStreamHandler('smoke-bytes', function () {});
        room.unregisterByteStreamHandler('smoke-bytes');

        room.registerRpcMethod('smoke-room', async function () {
          return 'ok';
        });
        room.localParticipant.unregisterRpcMethod('smoke-room');
        room.localParticipant.registerRpcMethod('smoke-local', async function () {
          return 'ok';
        });
        room.unregisterRpcMethod('smoke-local');

        must((await room.getSid()) === '', 'getSid() on a disconnected room did not resolve empty');
        must(
          room.getParticipantByIdentity('missing') === undefined,
          'getParticipantByIdentity() returned a missing participant',
        );
        must(
          (await room.localParticipant.setCameraEnabled(false)) === undefined,
          'setCameraEnabled(false) without a camera track did not resolve undefined',
        );
        must(
          (await room.localParticipant.setScreenShareEnabled(false)) === undefined,
          'setScreenShareEnabled(false) without a screen track did not resolve undefined',
        );
        await room.disconnect();
        await room.dispose();
      } catch (err) {
        errors.push(
          'main Room behavior threw: ' + (err && err.message ? err.message : String(err)),
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
