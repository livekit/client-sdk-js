import { describe, expect, it } from 'vitest';
import { frameMetadata } from '../frameMetadata/extension';
import { CoreRoom } from './CoreRoom';
import { Room } from './Room';
import { createRoom } from './createRoom';
import { dataStreams } from './data-stream/extension';
import { type ExtensionResult, defineExtension } from './extensions';
import { rpc } from './rpc/extension';

describe('createRoom', () => {
  it('installs dependencies and keeps an explicitly listed instance', () => {
    const room = createRoom(undefined, [rpc]);
    expect(room).toBeInstanceOf(CoreRoom);
    expect(typeof room.registerRpcMethod).toBe('function');
    expect(typeof room.registerTextStreamHandler).toBe('function');
    expect(typeof room.localParticipant.sendText).toBe('function');
    expect(() => createRoom(undefined, [dataStreams, dataStreams({})])).toThrow('listed twice');
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

  it('configured frameMetadata fills the room option the publish path reads', () => {
    const worker = { postMessage() {} } as unknown as Worker;
    const room = createRoom(undefined, [frameMetadata({ worker })]);
    expect(room.options.frameMetadata?.worker).toBe(worker);
  });

  it('the full Room installs every extension', async () => {
    const room = new Room();
    expect(typeof room.registerRpcMethod).toBe('function');
    expect(typeof room.localParticipant.sendChatMessage).toBe('function');
    expect(typeof room.simulateParticipants).toBe('function');
    await room.dispose();
    await expect(room.connect('ws://localhost', 'token')).rejects.toThrow('disposed');
  });
});
