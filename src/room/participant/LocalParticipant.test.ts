import {
  DataBlob,
  type DataBlobKey,
  GetDataBlobResponse,
  PacketTrailerFeature,
  RequestResponse,
  RequestResponse_Reason,
  StoreDataBlobResponse,
} from '@livekit/protocol';
import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InternalRoomOptions } from '../../options';
import type RTCEngine from '../RTCEngine';
import {
  DataTrackSchemaStorageError,
  DataTrackSchemaStorageErrorReason,
} from '../data-track/schema-storage';
import { DataTrackSchemaId } from '../data-track/types';
import { EngineEvent } from '../events';
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

describe('LocalParticipant schema storage', () => {
  const schemaId: DataTrackSchemaId = { name: 'rgb', encoding: 'jsonSchema' };

  type MockEngine = RTCEngine & {
    client: {
      sendStoreDataBlobRequest: ReturnType<typeof vi.fn>;
      sendGetDataBlobRequest: ReturnType<typeof vi.fn>;
    };
  };

  function makeEngine(requestId: number): MockEngine {
    const engine = new EventEmitter() as unknown as MockEngine;
    engine.client = {
      sendStoreDataBlobRequest: vi.fn(async () => requestId),
      sendGetDataBlobRequest: vi.fn(async () => requestId),
    };
    return engine;
  }

  function createParticipant(engine: MockEngine) {
    return new LocalParticipant(
      'participant-sid',
      'test-identity',
      engine,
      {} as InternalRoomOptions,
      undefined as any,
      undefined as any,
      undefined as any,
      undefined as any,
    );
  }

  /** Waits for a request to be sent and its pending future to be registered. */
  function flush() {
    return new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  function pendingRequests(participant: LocalParticipant) {
    return participant as unknown as {
      pendingStoreDataBlobRequests: Map<number, unknown>;
      pendingGetDataBlobRequests: Map<number, unknown>;
    };
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('defines a schema by storing its definition as a data blob', async () => {
    const engine = makeEngine(7);
    const participant = createParticipant(engine);

    const promise = participant.defineSchema(schemaId, '{"type":"object"}');
    await flush();

    expect(engine.client.sendStoreDataBlobRequest).toHaveBeenCalledOnce();
    const blob = engine.client.sendStoreDataBlobRequest.mock.calls[0][0] as DataBlob;
    expect(blob.key?.key.case).toStrictEqual('schemaId');
    expect(DataTrackSchemaId.from(blob.key!.key.value! as never)).toStrictEqual(schemaId);
    expect(new TextDecoder().decode(blob.contents)).toStrictEqual('{"type":"object"}');

    engine.emit(EngineEvent.StoreDataBlobResponse, new StoreDataBlobResponse({ requestId: 7 }));
    await expect(promise).resolves.toBeUndefined();
    expect(pendingRequests(participant).pendingStoreDataBlobRequests.size).toBe(0);
  });

  it('ignores a store response with a mismatched request id', async () => {
    const engine = makeEngine(7);
    const participant = createParticipant(engine);

    const promise = participant.defineSchema(schemaId, 'definition');
    await flush();

    engine.emit(EngineEvent.StoreDataBlobResponse, new StoreDataBlobResponse({ requestId: 8 }));
    await flush();
    expect(pendingRequests(participant).pendingStoreDataBlobRequests.size).toBe(1);

    engine.emit(EngineEvent.StoreDataBlobResponse, new StoreDataBlobResponse({ requestId: 7 }));
    await expect(promise).resolves.toBeUndefined();
  });

  it('rejects defining a schema when the server reports an error', async () => {
    const engine = makeEngine(7);
    const participant = createParticipant(engine);

    const promise = participant.defineSchema(schemaId, 'definition');
    await flush();

    engine.emit(
      EngineEvent.SignalRequestResponse,
      new RequestResponse({
        requestId: 7,
        reason: RequestResponse_Reason.INVALID_REQUEST,
        message: 'schema already defined',
      }),
    );
    await expect(promise).rejects.toStrictEqual(
      DataTrackSchemaStorageError.requestFailed(
        RequestResponse_Reason.INVALID_REQUEST,
        'schema already defined',
      ),
    );
    expect(pendingRequests(participant).pendingStoreDataBlobRequests.size).toBe(0);
  });

  it('ignores an OK request response for a pending blob request', async () => {
    const engine = makeEngine(7);
    const participant = createParticipant(engine);

    const promise = participant.defineSchema(schemaId, 'definition');
    await flush();

    engine.emit(
      EngineEvent.SignalRequestResponse,
      new RequestResponse({ requestId: 7, reason: RequestResponse_Reason.OK }),
    );
    await flush();
    expect(pendingRequests(participant).pendingStoreDataBlobRequests.size).toBe(1);

    engine.emit(EngineEvent.StoreDataBlobResponse, new StoreDataBlobResponse({ requestId: 7 }));
    await expect(promise).resolves.toBeUndefined();
  });

  it('retrieves a schema definition', async () => {
    const engine = makeEngine(3);
    const participant = createParticipant(engine);

    const promise = participant.getSchema(schemaId, 'publisher-identity');
    await flush();

    expect(engine.client.sendGetDataBlobRequest).toHaveBeenCalledOnce();
    const [key, identity] = engine.client.sendGetDataBlobRequest.mock.calls[0] as [
      DataBlobKey,
      string,
    ];
    expect(key.key.case).toStrictEqual('schemaId');
    expect(identity).toStrictEqual('publisher-identity');

    engine.emit(
      EngineEvent.GetDataBlobResponse,
      new GetDataBlobResponse({
        requestId: 3,
        blob: new DataBlob({ contents: new TextEncoder().encode('{"type":"object"}') }),
      }),
    );
    await expect(promise).resolves.toStrictEqual('{"type":"object"}');
    expect(pendingRequests(participant).pendingGetDataBlobRequests.size).toBe(0);
  });

  it('rejects retrieving an undefined schema', async () => {
    const engine = makeEngine(3);
    const participant = createParticipant(engine);

    const promise = participant.getSchema(schemaId, 'publisher-identity');
    await flush();

    engine.emit(
      EngineEvent.SignalRequestResponse,
      new RequestResponse({
        requestId: 3,
        reason: RequestResponse_Reason.NOT_FOUND,
        message: 'blob not found',
      }),
    );
    await expect(promise).rejects.toStrictEqual(
      DataTrackSchemaStorageError.notFound('blob not found'),
    );
    expect(pendingRequests(participant).pendingGetDataBlobRequests.size).toBe(0);
  });

  it('rejects a malformed get response missing the blob', async () => {
    const engine = makeEngine(3);
    const participant = createParticipant(engine);

    const promise = participant.getSchema(schemaId, 'publisher-identity');
    await flush();

    engine.emit(EngineEvent.GetDataBlobResponse, new GetDataBlobResponse({ requestId: 3 }));
    await expect(promise).rejects.toStrictEqual(DataTrackSchemaStorageError.malformedResponse());
  });

  it('rejects a schema definition that is not valid UTF-8', async () => {
    const engine = makeEngine(3);
    const participant = createParticipant(engine);

    const promise = participant.getSchema(schemaId, 'publisher-identity');
    await flush();

    engine.emit(
      EngineEvent.GetDataBlobResponse,
      new GetDataBlobResponse({
        requestId: 3,
        blob: new DataBlob({ contents: new Uint8Array([0xff, 0xfe, 0xfd]) }),
      }),
    );
    await expect(promise).rejects.toMatchObject({
      reason: DataTrackSchemaStorageErrorReason.InvalidDefinition,
    });
  });

  it('rejects when the request times out', async () => {
    vi.useFakeTimers();
    const engine = makeEngine(7);
    const participant = createParticipant(engine);

    const promise = participant.defineSchema(schemaId, 'definition');
    const expectation = expect(promise).rejects.toStrictEqual(
      DataTrackSchemaStorageError.timeout(),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(engine.client.sendStoreDataBlobRequest).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(5_000);
    await expectation;
    expect(pendingRequests(participant).pendingStoreDataBlobRequests.size).toBe(0);
  });

  it('rejects when the caller aborts the request', async () => {
    const engine = makeEngine(3);
    const participant = createParticipant(engine);
    const controller = new AbortController();

    const promise = participant.getSchema(schemaId, 'publisher-identity', controller.signal);
    await flush();

    controller.abort();
    await expect(promise).rejects.toStrictEqual(DataTrackSchemaStorageError.cancelled());
    expect(pendingRequests(participant).pendingGetDataBlobRequests.size).toBe(0);
  });

  it('rejects pending requests when the engine closes', async () => {
    const engine = makeEngine(7);
    const participant = createParticipant(engine);

    const storePromise = participant.defineSchema(schemaId, 'definition');
    await flush();

    engine.emit(EngineEvent.Closing);
    await expect(storePromise).rejects.toStrictEqual(DataTrackSchemaStorageError.disconnected());
    expect(pendingRequests(participant).pendingStoreDataBlobRequests.size).toBe(0);
  });
});
