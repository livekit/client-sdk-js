import { describe, expect, it } from 'vitest';
import { ConnectionState, Room, RoomEvent } from '../../src/index';

describe('a Room that never connected', () => {
  it('starts disconnected with a local participant and no remote ones', () => {
    const room = new Room();
    expect(room.state).toBe(ConnectionState.Disconnected);
    expect(room.localParticipant).toBeDefined();
    expect(room.remoteParticipants.size).toBe(0);
    expect(room.getParticipantByIdentity('missing')).toBeUndefined();
  });

  it('adds and removes event listeners', () => {
    const room = new Room();
    let connected = 0;
    const onConnected = () => {
      connected += 1;
    };
    room.on(RoomEvent.Connected, onConnected);
    room.emit(RoomEvent.Connected);
    room.off(RoomEvent.Connected, onConnected);
    room.emit(RoomEvent.Connected);
    expect(connected).toBe(1);
  });

  it('registers and unregisters stream and RPC handlers', () => {
    const room = new Room();
    room.registerTextStreamHandler('text', () => {});
    room.unregisterTextStreamHandler('text');
    room.registerByteStreamHandler('bytes', () => {});
    room.unregisterByteStreamHandler('bytes');
    room.registerRpcMethod('method', async () => 'ok');
    room.unregisterRpcMethod('method');
  });

  it('resolves disabling a track that was never published', async () => {
    const room = new Room();
    await expect(room.localParticipant.setCameraEnabled(false)).resolves.toBeUndefined();
    await expect(room.localParticipant.setScreenShareEnabled(false)).resolves.toBeUndefined();
  });

  it('disconnects without an error', async () => {
    const room = new Room();
    await expect(room.disconnect()).resolves.toBeUndefined();
  });
});
