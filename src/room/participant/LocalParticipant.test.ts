import { PacketTrailerFeature } from '@livekit/protocol';
import { assert, describe, expect, it, vi } from 'vitest';
import { ACTIONS_ATTRIBUTE, type ActionRegistration, DESCRIBE_METHOD } from '../actions';
import type { RpcInvocationData } from '../rpc';
import type LocalTrack from '../track/LocalTrack';
import { Track } from '../track/Track';
import type { TrackPublishOptions } from '../track/options';
import LocalParticipant from './LocalParticipant';

type FrameMetadataTestParticipant = {
  canPublishFrameMetadata: () => boolean;
  log: { warn: ReturnType<typeof vi.fn> };
  normalizeRequestedFrameMetadataOptions: (
    track: LocalTrack,
    opts: TrackPublishOptions,
  ) => PacketTrailerFeature[];
};

function makeParticipant(canPublishFrameMetadata: boolean) {
  const participant = Object.create(LocalParticipant.prototype) as FrameMetadataTestParticipant;
  participant.canPublishFrameMetadata = () => canPublishFrameMetadata;
  participant.log = { warn: vi.fn() };
  return participant;
}

function makeTrack(kind: Track.Kind) {
  return {
    kind,
    sid: 'track-sid',
    source: kind === Track.Kind.Video ? Track.Source.Camera : Track.Source.Microphone,
    isMuted: false,
    mediaStreamID: 'stream-id',
    mediaStreamTrack: {
      enabled: true,
      id: 'media-track-id',
    },
  } as unknown as LocalTrack;
}

describe('LocalParticipant frame metadata publish options', () => {
  it('normalizes requested video frame metadata options to advertised features', () => {
    const participant = makeParticipant(true);
    const opts: TrackPublishOptions = { frameMetadata: { timestamp: true, frameId: true } };

    const features = participant.normalizeRequestedFrameMetadataOptions(
      makeTrack(Track.Kind.Video),
      opts,
    );

    expect(features).toEqual([
      PacketTrailerFeature.PTF_USER_TIMESTAMP,
      PacketTrailerFeature.PTF_FRAME_ID,
    ]);
    expect(opts.frameMetadata).toEqual({ timestamp: true, frameId: true });
  });

  it('clears frame metadata options for non-video tracks', () => {
    const participant = makeParticipant(true);
    const opts: TrackPublishOptions = { frameMetadata: { timestamp: true } };

    const features = participant.normalizeRequestedFrameMetadataOptions(
      makeTrack(Track.Kind.Audio),
      opts,
    );

    expect(features).toEqual([]);
    expect(opts.frameMetadata).toBeUndefined();
  });

  it('clears frame metadata options when publishing frame metadata is unsupported', () => {
    const participant = makeParticipant(false);
    const opts: TrackPublishOptions = { frameMetadata: { frameId: true } };

    const features = participant.normalizeRequestedFrameMetadataOptions(
      makeTrack(Track.Kind.Video),
      opts,
    );

    expect(features).toEqual([]);
    expect(opts.frameMetadata).toBeUndefined();
    expect(participant.log.warn).toHaveBeenCalledOnce();
  });
});

type ActionsTestParticipant = LocalParticipant & {
  handlers: Map<string, (data: RpcInvocationData) => Promise<string>>;
  setAttributes: ReturnType<typeof vi.fn>;
  performRpc: ReturnType<typeof vi.fn>;
};

function makeActionsParticipant() {
  const handlers = new Map<string, (data: RpcInvocationData) => Promise<string>>();
  const participant = Object.create(LocalParticipant.prototype);
  Object.assign(participant, {
    handlers,
    actionCatalog: new Map(),
    log: { warn: vi.fn() },
    setAttributes: vi.fn().mockResolvedValue(undefined),
    performRpc: vi.fn(),
    rpcServerManager: {
      registerRpcMethod: (method: string, handler: (data: RpcInvocationData) => Promise<string>) =>
        handlers.set(method, handler),
      unregisterRpcMethod: (method: string) => handlers.delete(method),
    },
  });
  return participant as ActionsTestParticipant;
}

const readFile: ActionRegistration = {
  name: 'read_file',
  summary: 'Read a file under ~/src',
  description: 'Read a file and return its contents',
  parameters: { type: 'object', properties: { path: { type: 'string' } } },
  consent: 'confirm',
  handler: () => 'contents',
};

const ping: ActionRegistration = {
  name: 'ping',
  description: 'Reply with pong',
  parameters: { type: 'object' },
  consent: 'none',
  handler: () => 'pong',
};

function entryOf({ handler: _handler, summary: _summary, ...entry }: ActionRegistration) {
  return entry;
}

function describeRequest(participant: ActionsTestParticipant, names: string[]) {
  const handler = participant.handlers.get(DESCRIBE_METHOD);
  assert(handler);
  return handler({
    requestId: 'req',
    callerIdentity: 'caller',
    payload: JSON.stringify({ names }),
    responseTimeout: 5000,
  }).then((res) => JSON.parse(res));
}

describe('LocalParticipant actions', () => {
  it('publishes name and summary only, omitting an absent summary', async () => {
    const participant = makeActionsParticipant();
    await participant.registerAction(readFile);
    await participant.registerAction(ping);

    const attrs = participant.setAttributes.mock.lastCall![0] as Record<string, string>;
    expect(attrs[ACTIONS_ATTRIBUTE]).toBe(
      '[{"name":"read_file","summary":"Read a file under ~/src"},{"name":"ping"}]',
    );
  });

  it('answers describe in request order and omits unknown names', async () => {
    const participant = makeActionsParticipant();
    await participant.registerAction(readFile);
    await participant.registerAction(ping);

    expect(await describeRequest(participant, ['ping', 'missing', 'read_file'])).toEqual({
      actions: [entryOf(ping), entryOf(readFile)],
    });
  });

  it('registers describe with the first action and removes it with the last', async () => {
    const participant = makeActionsParticipant();
    expect(participant.handlers.has(DESCRIBE_METHOD)).toBe(false);

    const readHandle = await participant.registerAction(readFile);
    const pingHandle = await participant.registerAction(ping);
    expect(participant.handlers.has(DESCRIBE_METHOD)).toBe(true);

    readHandle.unregister();
    expect(await describeRequest(participant, ['read_file', 'ping'])).toEqual({
      actions: [entryOf(ping)],
    });

    pingHandle.unregister();
    expect(participant.handlers.has(DESCRIBE_METHOD)).toBe(false);
    const attrs = participant.setAttributes.mock.lastCall![0] as Record<string, string>;
    expect(attrs[ACTIONS_ATTRIBUTE]).toBe('[]');

    await participant.registerAction(ping);
    expect(participant.handlers.has(DESCRIBE_METHOD)).toBe(true);
  });

  it('describeActions sends the names and returns the response entries', async () => {
    const participant = makeActionsParticipant();
    participant.performRpc.mockResolvedValue(JSON.stringify({ actions: [entryOf(readFile)] }));

    expect(await participant.describeActions('agent', ['read_file', 'missing'])).toEqual([
      entryOf(readFile),
    ]);
    expect(participant.performRpc).toHaveBeenCalledWith({
      destinationIdentity: 'agent',
      method: DESCRIBE_METHOD,
      payload: '{"names":["read_file","missing"]}',
    });
  });
});
