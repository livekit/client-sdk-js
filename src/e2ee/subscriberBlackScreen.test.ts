import { Encryption_Type, ParticipantInfo, TrackInfo, TrackType } from '@livekit/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Room, { ConnectionState } from '../room/Room';
import { EngineEvent, RoomEvent } from '../room/events';
import type RemoteParticipant from '../room/participant/RemoteParticipant';
import RemoteTrackPublication from '../room/track/RemoteTrackPublication';
import RemoteVideoTrack from '../room/track/RemoteVideoTrack';
import { Track } from '../room/track/Track';
import MockMediaStreamTrack from '../test/MockMediaStreamTrack';
import { E2EEManager } from './E2eeManager';
import { BaseKeyProvider } from './KeyProvider';
import { E2EE_FLAG, KEY_PROVIDER_DEFAULTS } from './constants';
import { CryptorEvent } from './events';
import { createKeyMaterialFromString } from './utils';
import { FrameCryptor, encryptionEnabledMap } from './worker/FrameCryptor';
import { ParticipantKeyHandler } from './worker/ParticipantKeyHandler';

/**
 * Repros for the "remote participant is a black screen for exactly one
 * subscriber, audio fine, no decryption errors anywhere" bug.
 *
 * All three end in the same state: a track the SDK considers fully subscribed
 * has NO live decrypt transform, so AES-GCM ciphertext (or nothing at all)
 * reaches the video decoder. The decoder then PLIs forever while the SFU
 * reports it forwarded keyframes -- the frame's first 10 bytes are left
 * unencrypted, so keyframe detection on the server still succeeds.
 *
 * Each test asserts the CORRECT behaviour, so they fail on the current code
 * and pass once the fix lands. The comments record what happens today.
 */

// ---------------------------------------------------------------------------
// shims: take the Chromium code path under happy-dom
// ---------------------------------------------------------------------------

/**
 * isE2EESupported() requires insertable streams. isScriptTransformSupportedForWorker()
 * must stay false so we exercise the createEncodedStreams path Chromium uses
 * (script transforms are explicitly disabled for Chromium in room/utils.ts).
 */
function installChromiumLikeE2EEShims() {
  const w = window as unknown as Record<string, any>;
  if (typeof w.RTCRtpSender === 'undefined') {
    w.RTCRtpSender = class {};
  }
  w.RTCRtpSender.prototype.createEncodedStreams = () => {};
  expect(w.RTCRtpScriptTransform).toBeUndefined();
}

class FakeWorker {
  messages: Array<{ kind: string; data: any }> = [];

  onmessage: unknown = null;

  onerror: unknown = null;

  postMessage(msg: any) {
    this.messages.push(msg);
  }

  kinds() {
    return this.messages.map((m) => m.kind);
  }

  messagesOfKind(kind: string) {
    return this.messages.filter((m) => m.kind === kind);
  }
}

/** Behaves like Chrome's receiver: encoded streams can only be created once. */
function createReceiverStub() {
  let created = false;
  return {
    createEncodedStreams: () => {
      if (created) {
        throw new Error('createEncodedStreams can only be called once');
      }
      created = true;
      return { readable: new ReadableStream(), writable: new WritableStream() };
    },
  } as unknown as RTCRtpReceiver;
}

function setupRoomWithE2EE() {
  installChromiumLikeE2EEShims();

  const room = new Room();
  const worker = new FakeWorker();
  const manager = new E2EEManager(
    { keyProvider: new BaseKeyProvider({ sharedKey: true }), worker: worker as unknown as Worker },
    false,
  );
  manager.setup(room);

  // keep the resume path from reaching the (unconnected) signal client
  vi.spyOn(room.engine, 'sendSyncState').mockImplementation(() => {});

  room.state = ConnectionState.Connected;

  const participant: RemoteParticipant = (
    room as unknown as {
      getOrCreateParticipant(identity: string, info: ParticipantInfo): RemoteParticipant;
    }
  ).getOrCreateParticipant('jake', new ParticipantInfo({ sid: 'PA_jake', identity: 'jake' }));

  const trackInfo = new TrackInfo({
    sid: 'TR_video',
    type: TrackType.VIDEO,
    name: 'camera',
    mimeType: 'video/h264',
    encryption: Encryption_Type.GCM,
  });
  const publication = new RemoteTrackPublication(Track.Kind.Video, trackInfo, true);
  // addTrackPublication is what wires TrackEvent.Subscribed -> ParticipantEvent.TrackSubscribed
  (
    participant as unknown as { addTrackPublication(pub: RemoteTrackPublication): void }
  ).addTrackPublication(publication);

  const receiver = createReceiverStub();
  const subscribe = () =>
    publication.setTrack(
      new RemoteVideoTrack(new MockMediaStreamTrack(), 'TR_video', receiver, {}),
    );
  const unsubscribe = () => publication.setTrack(undefined);

  return { room, worker, publication, receiver, subscribe, unsubscribe };
}

describe('subscriber black screen', () => {
  beforeEach(() => {
    encryptionEnabledMap.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    encryptionEnabledMap.clear();
  });

  // -------------------------------------------------------------------------
  // 1. RoomEvent.TrackSubscribed is buffered while resuming and then DISCARDED
  //    (Room.ts:642), while TrackUnsubscribed is always emitted immediately
  //    (Room.ts:2441). E2eeManager only hooks RoomEvent.TrackSubscribed.
  // -------------------------------------------------------------------------
  describe('a track subscribed during a signal resume', () => {
    it('control: subscribing while Connected installs the transform', () => {
      const { worker, receiver, subscribe } = setupRoomWithE2EE();

      subscribe();

      expect(worker.kinds()).toContain('decode');
      expect(E2EE_FLAG in receiver).toBe(true);
    });

    it('must still get a decrypt transform', () => {
      const { room, worker, publication, receiver, subscribe } = setupRoomWithE2EE();

      // signal connection drops -> Room enters SignalReconnecting / isResuming.
      // onTrackAdded only defers ontrack for Connecting/Reconnecting, NOT
      // SignalReconnecting, so a track really can get subscribed in this window.
      room.engine.emit(EngineEvent.Resuming);
      expect(room.state).toBe(ConnectionState.SignalReconnecting);

      subscribe();

      // signal comes back: Room.ts:642 throws the buffered events away...
      room.engine.emit(EngineEvent.SignalResumed);
      // ...so the flush on Resumed has nothing left to flush.
      room.engine.emit(EngineEvent.Resumed);

      expect(room.state).toBe(ConnectionState.Connected);
      // the SDK and the UI consider this track fully subscribed
      expect(publication.isSubscribed).toBe(true);
      expect(publication.track).toBeDefined();

      // CURRENTLY FAILS: no 'decode' is ever posted, so every frame reaches the
      // decoder as ciphertext -> black screen with zero errors logged.
      expect(worker.kinds()).toContain('decode');
      expect(E2EE_FLAG in receiver).toBe(true);
    });

    it('must never deliver TrackUnsubscribed for a track that was never announced as subscribed', () => {
      const { room, subscribe, unsubscribe } = setupRoomWithE2EE();
      const seen: string[] = [];
      room.on(RoomEvent.TrackSubscribed, () => seen.push('subscribed'));
      room.on(RoomEvent.TrackUnsubscribed, () => seen.push('unsubscribed'));

      room.engine.emit(EngineEvent.Resuming);
      subscribe();
      unsubscribe();
      room.engine.emit(EngineEvent.SignalResumed);
      room.engine.emit(EngineEvent.Resumed);

      // CURRENTLY FAILS with ['unsubscribed']: subscribe is buffered then
      // dropped, unsubscribe is emitted unconditionally. Any consumer that
      // pairs the two (E2eeManager does) is left with inverted state.
      expect(seen).not.toEqual(['unsubscribed']);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Receiver reuse: E2EE_FLAG is a permanent marker on the RTCRtpReceiver,
  //    so a resubscribe on a reused transceiver only sends updateCodec and
  //    never re-establishes a pipeline.
  // -------------------------------------------------------------------------
  describe('resubscribe on a reused receiver', () => {
    /**
     * NOTE: the main thread cannot post a second 'decode' for a reused receiver.
     * Its encoded streams were transferred to the worker on first setup and a
     * transferred stream is locked ("Cannot transfer a locked ReadableStream"),
     * while createEncodedStreams() may only be called once per receiver. So the
     * worker has to be told which cryptor owns the pipeline, and rebuild it there.
     */
    it('must hand the worker enough state to re-point the existing pipeline', () => {
      const { worker, receiver, subscribe, unsubscribe } = setupRoomWithE2EE();

      subscribe();
      expect(worker.messagesOfKind('decode')).toHaveLength(1);
      const firstTrackId = worker.messagesOfKind('decode')[0].data.trackId;

      // unsubscribe -> removeTransform unsets the participant on the cryptor, but
      // nothing cancels the pipe, so it keeps running
      unsubscribe();
      expect(worker.kinds()).toContain('removeTransform');

      // resubscribe on the SAME receiver: pion reuses the freed transceiver
      // (livekit/pkg/rtc/transport.go:1077 -> pc.AddTrack), so the client keeps
      // the same RTCRtpReceiver object
      subscribe();

      // no second createEncodedStreams (the stub would have thrown) and no
      // attempt to re-transfer the locked streams
      expect(worker.messagesOfKind('decode')).toHaveLength(1);

      const update = worker.messagesOfKind('updateCodec').at(-1);
      expect(update).toBeDefined();
      // previousTrackId is what lets the worker find the cryptor that owns the
      // streams instead of creating a fresh one with no pipeline
      expect(update!.data.previousTrackId).toBe(firstTrackId);
      expect(update!.data.participantIdentity).toBe('jake');
      expect(E2EE_FLAG in receiver).toBe(true);
    });

    it('rebuilds a dead pipeline instead of leaving the track undecrypted', async () => {
      const keys = new ParticipantKeyHandler('jake', KEY_PROVIDER_DEFAULTS);
      await keys.setKey(await createKeyMaterialFromString('shared-password'), 0);
      encryptionEnabledMap.set('jake', true);

      const cryptor = new FrameCryptor({
        participantIdentity: 'jake',
        keys,
        keyProviderOptions: KEY_PROVIDER_DEFAULTS,
        sifTrailer: new Uint8Array(),
      });

      // a pipeline whose readable ends on its own, e.g. the swallowed
      // 'Destination stream closed'
      const readable = new ReadableStream<RTCEncodedVideoFrame>({
        start(controller) {
          controller.close();
        },
      });
      cryptor.setupTransform('decode', readable, new WritableStream(), 'TR_old', 'vp8');
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(cryptor.hasActiveTransform()).toBe(false);

      // transceiver reuse: same streams, new trackId. There is nothing the main
      // thread can hand us, so this has to be recoverable from the worker side.
      cryptor.setTrackId('TR_new');
      cryptor.ensureTransform();

      expect(cryptor.getTrackId()).toBe('TR_new');
      expect(cryptor.hasActiveTransform()).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 3. decodeFunction fails OPEN: with no participant set it enqueues the frame
  //    untouched, handing raw ciphertext to the decoder instead of dropping it
  //    or raising. This is what makes 1 and 2 completely silent.
  // -------------------------------------------------------------------------
  describe('cryptor with no participant set', () => {
    it('must not forward ciphertext to the decoder', async () => {
      const keys = new ParticipantKeyHandler('jake', KEY_PROVIDER_DEFAULTS);
      await keys.setKey(await createKeyMaterialFromString('shared-password'), 0);
      encryptionEnabledMap.set('jake', true);

      const cryptor = new FrameCryptor({
        participantIdentity: 'jake',
        keys,
        keyProviderOptions: KEY_PROVIDER_DEFAULTS,
        sifTrailer: new Uint8Array(),
      });

      const frames: RTCEncodedVideoFrame[] = [];
      let push!: (f: RTCEncodedVideoFrame) => void;
      const readable = new ReadableStream<RTCEncodedVideoFrame>({
        start(controller) {
          push = (f) => controller.enqueue(f);
        },
      });
      const writable = new WritableStream<RTCEncodedVideoFrame>({
        write(chunk) {
          frames.push(chunk);
        },
      });

      cryptor.setupTransform('decode', readable, writable, 'TR_video', 'vp8');

      // what RoomEvent.TrackUnsubscribed does via the worker's 'removeTransform':
      // clears participantIdentity but does NOT cancel the pipe
      cryptor.unsetParticipant();
      expect(cryptor.getParticipantIdentity()).toBeUndefined();

      // a frame still flowing on the live pipe
      const ciphertext = new Uint8Array([
        // 10 plaintext keyframe header bytes (what keeps server keyframe detection happy)
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
        // ciphertext + IV + trailer
        200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217,
        218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 12, 0,
      ]);
      push({
        data: ciphertext.buffer,
        timestamp: 0,
        type: 'key',
        getMetadata: () => ({}),
      } as RTCEncodedVideoFrame);

      // give the transform a chance to run
      await new Promise((resolve) => setTimeout(resolve, 10));

      // CURRENTLY FAILS: the decoder is handed the ciphertext byte for byte --
      // nothing decrypted, nothing dropped, nothing logged.
      expect(frames).toHaveLength(0);
    });

    it('drops silently rather than reporting an error on a normal disconnect', async () => {
      const keys = new ParticipantKeyHandler('jake', KEY_PROVIDER_DEFAULTS);
      await keys.setKey(await createKeyMaterialFromString('shared-password'), 0);
      encryptionEnabledMap.set('jake', true);

      const cryptor = new FrameCryptor({
        participantIdentity: 'jake',
        keys,
        keyProviderOptions: KEY_PROVIDER_DEFAULTS,
        sifTrailer: new Uint8Array(),
      });

      const errors: Error[] = [];
      cryptor.on(CryptorEvent.Error, (e) => errors.push(e));

      const frames: RTCEncodedVideoFrame[] = [];
      let push!: (f: RTCEncodedVideoFrame) => void;
      const readable = new ReadableStream<RTCEncodedVideoFrame>({
        start(controller) {
          push = (f) => controller.enqueue(f);
        },
      });
      const writable = new WritableStream<RTCEncodedVideoFrame>({
        write(chunk) {
          frames.push(chunk);
        },
      });

      cryptor.setupTransform('decode', readable, writable, 'TR_video', 'vp8');

      // participant leaves -> removeTransform. The pipe is deliberately left
      // running (a reused transceiver has to be re-pointable), so frames already
      // in flight still reach decodeFunction for a moment.
      cryptor.unsetParticipant();

      push({
        data: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 200, 201, 202, 12, 0]).buffer,
        timestamp: 0,
        type: 'key',
        getMetadata: () => ({}),
      } as RTCEncodedVideoFrame);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // dropped, but a routine teardown must not surface as an encryptionError
      expect(frames).toHaveLength(0);
      expect(errors).toHaveLength(0);
    });

    it('still forwards plaintext for a participant known to publish unencrypted', async () => {
      const keys = new ParticipantKeyHandler('bob', KEY_PROVIDER_DEFAULTS);
      await keys.setKey(await createKeyMaterialFromString('shared-password'), 0);
      // explicitly NOT encrypted, as opposed to "we don't know yet"
      encryptionEnabledMap.set('bob', false);

      const cryptor = new FrameCryptor({
        participantIdentity: 'bob',
        keys,
        keyProviderOptions: KEY_PROVIDER_DEFAULTS,
        sifTrailer: new Uint8Array(),
      });

      const frames: RTCEncodedVideoFrame[] = [];
      let push!: (f: RTCEncodedVideoFrame) => void;
      const readable = new ReadableStream<RTCEncodedVideoFrame>({
        start(controller) {
          push = (f) => controller.enqueue(f);
        },
      });
      const writable = new WritableStream<RTCEncodedVideoFrame>({
        write(chunk) {
          frames.push(chunk);
        },
      });

      cryptor.setupTransform('decode', readable, writable, 'TR_plain', 'vp8');
      push({
        data: new Uint8Array([1, 2, 3, 4]).buffer,
        timestamp: 0,
        type: 'key',
        getMetadata: () => ({}),
      } as RTCEncodedVideoFrame);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(frames).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // 4. The whole class of bug above is invisible. A subscribed, encrypted track
  //    with no transform should report itself.
  // -------------------------------------------------------------------------
  describe('watchdog', () => {
    it('reports an encrypted track left without a decrypt transform', async () => {
      vi.useFakeTimers();
      try {
        const keys = new ParticipantKeyHandler('jake', KEY_PROVIDER_DEFAULTS);
        encryptionEnabledMap.set('jake', true);

        const cryptor = new FrameCryptor({
          participantIdentity: 'jake',
          keys,
          keyProviderOptions: KEY_PROVIDER_DEFAULTS,
          sifTrailer: new Uint8Array(),
        });

        const errors: Error[] = [];
        cryptor.on(CryptorEvent.Error, (e) => errors.push(e));

        // pipeline dies on its own while the track stays subscribed & encrypted
        cryptor.setupTransform(
          'decode',
          new ReadableStream({
            start(controller) {
              controller.close();
            },
          }),
          new WritableStream(),
          'TR_video',
          'vp8',
        );

        await vi.advanceTimersByTimeAsync(5000);

        expect(cryptor.hasActiveTransform()).toBe(false);
        expect(errors).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('stays quiet when a local sender pipe closes on unpublish', async () => {
      vi.useFakeTimers();
      try {
        const keys = new ParticipantKeyHandler('me', KEY_PROVIDER_DEFAULTS);
        encryptionEnabledMap.set('me', true);

        const cryptor = new FrameCryptor({
          participantIdentity: 'me',
          keys,
          keyProviderOptions: KEY_PROVIDER_DEFAULTS,
          sifTrailer: new Uint8Array(),
        });

        const errors: Error[] = [];
        cryptor.on(CryptorEvent.Error, (e) => errors.push(e));

        // unpublishing closes the sender's encoded streams, and there is no
        // 'removeTransform' for local senders to unset the participant
        cryptor.setupTransform(
          'encode',
          new ReadableStream({
            start(controller) {
              controller.close();
            },
          }),
          new WritableStream(),
          'TR_local',
          'vp8',
        );

        await vi.advanceTimersByTimeAsync(5000);

        expect(errors).toHaveLength(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('stays quiet on a normal unsubscribe', async () => {
      vi.useFakeTimers();
      try {
        const keys = new ParticipantKeyHandler('jake', KEY_PROVIDER_DEFAULTS);
        encryptionEnabledMap.set('jake', true);

        const cryptor = new FrameCryptor({
          participantIdentity: 'jake',
          keys,
          keyProviderOptions: KEY_PROVIDER_DEFAULTS,
          sifTrailer: new Uint8Array(),
        });

        const errors: Error[] = [];
        cryptor.on(CryptorEvent.Error, (e) => errors.push(e));

        cryptor.setupTransform(
          'decode',
          new ReadableStream({
            start(controller) {
              controller.close();
            },
          }),
          new WritableStream(),
          'TR_video',
          'vp8',
        );
        // the streams closing before 'removeTransform' arrives is the normal
        // teardown ordering, and must not be reported
        cryptor.unsetParticipant();

        await vi.advanceTimersByTimeAsync(5000);

        expect(errors).toHaveLength(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
