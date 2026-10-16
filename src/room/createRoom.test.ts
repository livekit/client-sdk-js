import { describe, expect, it, vi } from 'vitest';
import type { BaseE2EEManager } from '../e2ee/E2eeManager';
import { ExternalE2EEKeyProvider } from '../e2ee/KeyProvider';
import { e2ee } from '../e2ee/extension';
import { frameMetadata } from '../frameMetadata/extension';
import { CoreRoom } from './CoreRoom';
import { Room } from './Room';
import { createRoom } from './createRoom';
import { dataStreams } from './data-stream/extension';
import { RoomEvent } from './events';
import { type ExtensionResult, defineExtension } from './extensions';
import { rpc } from './rpc/extension';

// E2EEManager refuses to construct where insertable streams are missing (jsdom)
vi.mock('../e2ee/utils', async (original) => ({
  ...(await original<typeof import('../e2ee/utils')>()),
  isE2EESupported: () => true,
}));

describe('createRoom', () => {
  it('installs dependencies and keeps an explicitly listed instance', () => {
    const room = createRoom(undefined, [rpc]);
    expect(room).toBeInstanceOf(CoreRoom);
    expect(typeof room.registerRpcMethod).toBe('function');
    expect(typeof room.registerTextStreamHandler).toBe('function');
    expect(typeof room.localParticipant.sendText).toBe('function');
    // the deprecated participant rpc methods come with the full Room only
    expect('registerRpcMethod' in room.localParticipant).toBe(false);
    expect(() => createRoom(undefined, [dataStreams, dataStreams({})])).toThrow('listed twice');
  });

  it('dedupes a key that two dependency lists name with different instances', () => {
    const a = defineExtension('shared', [], (): ExtensionResult => ({}));
    const needsA = { key: Symbol('needsA'), requires: [a({})] as const, install: () => ({}) };
    const needsAToo = { key: Symbol('needsAToo'), requires: [a({})] as const, install: () => ({}) };
    expect(() => createRoom(undefined, [needsA, needsAToo])).not.toThrow();
  });

  it('lets a subclass override an extension method', () => {
    class CustomRoom extends Room {
      registerRpcMethod() {
        return 'overridden' as unknown as void;
      }
    }
    const room = new CustomRoom();
    expect(room.registerRpcMethod('x', async () => '')).toBe('overridden');
    expect(typeof room.unregisterRpcMethod).toBe('function');
  });

  it('evaluates an option function per room', () => {
    let calls = 0;
    const probe = defineExtension(
      'probe',
      [],
      (_room, _ctx, options: { n: number } | undefined): ExtensionResult<{ n(): number }> => ({
        room: { n: () => options?.n ?? -1 },
      }),
    );
    const perRoom = probe(() => ({ n: ++calls }));
    expect(createRoom(undefined, [perRoom]).n()).toBe(1);
    expect(createRoom(undefined, [perRoom]).n()).toBe(2);
    expect(createRoom(undefined, [probe]).n()).toBe(-1);
  });

  it('configured frameMetadata reaches the engine, and dispose terminates the worker', async () => {
    const worker = { postMessage() {}, terminate: vi.fn() } as unknown as Worker;
    const room = createRoom(undefined, [frameMetadata({ worker })]);
    expect(room.engine.frameMetadataOptions?.worker).toBe(worker);
    expect(room.options.frameMetadata).toBeUndefined();
    room.emit(RoomEvent.Disconnected);
    expect(worker.terminate).not.toHaveBeenCalled();
    await room.dispose();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('the full Room installs every extension', async () => {
    const room = new Room();
    expect(typeof room.registerRpcMethod).toBe('function');
    expect(typeof room.localParticipant.sendChatMessage).toBe('function');
    expect(typeof room.localParticipant.registerRpcMethod).toBe('function');
    expect(typeof room.simulateParticipants).toBe('function');
    await room.dispose();
    await expect(room.connect('ws://localhost', 'token')).rejects.toThrow('disposed');
  });
});

describe('e2ee dispose', () => {
  const worker = () =>
    ({ postMessage() {}, addEventListener() {}, terminate: vi.fn() }) as unknown as Worker;

  it('terminates the worker the extension created a manager for', async () => {
    const w = worker();
    const room = createRoom(undefined, [
      e2ee({ keyProvider: new ExternalE2EEKeyProvider(), worker: w }),
    ]);
    await room.dispose();
    expect(w.terminate).toHaveBeenCalledTimes(1);
  });

  it('leaves an app-supplied manager alone', async () => {
    // a BaseE2EEManager the app owns; it can serve more than one room
    const manager = {
      isEnabled: false,
      isDataChannelEncryptionEnabled: false,
      setup() {},
      setupEngine() {},
      setParticipantCryptorEnabled() {},
      setSifTrailer() {},
      encryptData: async () => ({}) as never,
      handleEncryptedData: async () => ({}) as never,
      on() {
        return this;
      },
      off() {
        return this;
      },
      dispose: vi.fn(),
    } as unknown as BaseE2EEManager;
    const room = createRoom(undefined, [e2ee({ e2eeManager: manager })]);
    await room.dispose();
    expect(manager.dispose).not.toHaveBeenCalled();
  });

  it('takes its listeners off an app-supplied manager on dispose', async () => {
    const listeners = new Map<string, Set<unknown>>();
    const manager = {
      isEnabled: false,
      isDataChannelEncryptionEnabled: false,
      setup() {},
      setupEngine() {},
      setParticipantCryptorEnabled() {},
      setSifTrailer() {},
      encryptData: async () => ({}) as never,
      handleEncryptedData: async () => ({}) as never,
      on(event: string, cb: unknown) {
        listeners.set(event, (listeners.get(event) ?? new Set()).add(cb));
        return this;
      },
      off(event: string, cb: unknown) {
        listeners.get(event)?.delete(cb);
        return this;
      },
    } as unknown as BaseE2EEManager;
    const room = createRoom(undefined, [e2ee({ e2eeManager: manager })]);
    expect([...listeners.values()].reduce((n, s) => n + s.size, 0)).toBe(2);
    await room.dispose();
    expect([...listeners.values()].reduce((n, s) => n + s.size, 0)).toBe(0);
  });
});
