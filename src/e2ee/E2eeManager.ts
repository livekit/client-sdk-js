import { EventEmitter } from 'events';
import type TypedEventEmitter from 'typed-emitter';
import log from '../logger';
import { Encryption_Type, TrackInfo } from '../proto/livekit_models_pb';
import type RTCEngine from '../room/RTCEngine';
import type Room from '../room/Room';
import { ConnectionState } from '../room/Room';
import { DeviceUnsupportedError } from '../room/errors';
import { EngineEvent, ParticipantEvent, RoomEvent } from '../room/events';
import LocalTrack from '../room/track/LocalTrack';
import type RemoteTrack from '../room/track/RemoteTrack';
import type { Track } from '../room/track/Track';
import type { VideoCodec } from '../room/track/options';
import type { BaseKeyProvider } from './KeyProvider';
import { E2EE_FLAG } from './constants';
import type {
  E2EEManagerCallbacks,
  E2EEOptions,
  E2EEWorkerMessage,
  EnableMessage,
  EncodeMessage,
  InitMessage,
  KeyInfo,
  RTPVideoMapMessage,
  RatchetRequestMessage,
  RemoveTransformMessage,
  SetKeyMessage,
  UpdateCodecMessage,
} from './types';
import { EncryptionEvent } from './types';
import { isE2EESupported, isScriptTransformSupported, mimeTypeToVideoCodecString } from './utils';

/**
 * @experimental
 */
export class E2EEManager extends (EventEmitter as new () => TypedEventEmitter<E2EEManagerCallbacks>) {
  protected worker: Worker;

  protected room?: Room;

  private encryptionEnabled: boolean;

  private keyProvider: BaseKeyProvider;

  get isEnabled() {
    return this.encryptionEnabled;
  }

  constructor(options: E2EEOptions) {
    super();
    this.keyProvider = options.keyProvider;
    this.worker = options.worker;
    this.encryptionEnabled = false;
  }

  /**
   * @internal
   */
  setup(room: Room) {
    if (!isE2EESupported()) {
      throw new DeviceUnsupportedError(
        'tried to setup end-to-end encryption on an unsupported browser',
      );
    }
    log.info('setting up e2ee');
    if (room !== this.room) {
      this.room = room;
      this.setupEventListeners(room, this.keyProvider);
      // this.worker = new Worker('');
      const msg: InitMessage = {
        kind: 'init',
        data: {
          keyProviderOptions: this.keyProvider.getOptions(),
        },
      };
      if (this.worker) {
        log.info(`initializing worker`, { worker: this.worker });
        this.worker.onmessage = this.onWorkerMessage;
        this.worker.onerror = this.onWorkerError;
        this.worker.postMessage(msg);
      }
    }
  }

  /**
   * @internal
   */
  async setParticipantCryptorEnabled(enabled: boolean, participantId?: string) {
    log.info(`set e2ee to ${enabled}`);

    if (this.worker) {
      const enableMsg: EnableMessage = {
        kind: 'enable',
        data: { enabled, participantId },
      };
      this.worker.postMessage(enableMsg);
    } else {
      throw new ReferenceError('failed to enable e2ee, worker is not ready');
    }
  }

  private onWorkerMessage = (ev: MessageEvent<E2EEWorkerMessage>) => {
    const { kind, data } = ev.data;
    switch (kind) {
      case 'error':
        console.error('error in worker', { data });
        this.emit(EncryptionEvent.Error, data.error);
        break;
      case 'enable':
        if (this.encryptionEnabled !== data.enabled && !data.participantId) {
          this.emit(
            EncryptionEvent.ParticipantEncryptionStatusChanged,
            data.enabled,
            this.room?.localParticipant,
          );
          this.encryptionEnabled = data.enabled;
        } else if (data.participantId) {
          const participant = this.room?.getParticipantByIdentity(data.participantId);
          this.emit(EncryptionEvent.ParticipantEncryptionStatusChanged, data.enabled, participant);
        }
        if (this.encryptionEnabled) {
          this.keyProvider.getKeys().forEach((keyInfo) => {
            this.postKey(keyInfo);
          });
        }
        break;
      case 'ratchetKey':
        this.keyProvider.emit('keyRatcheted', data.material, data.keyIndex);
        break;
      default:
        break;
    }
  };

  private onWorkerError = (ev: ErrorEvent) => {
    log.error('e2ee worker encountered an error:', { error: ev.error });
    this.emit(EncryptionEvent.Error, ev.error);
  };

  public setupEngine(engine: RTCEngine) {
    engine.on(EngineEvent.RTPVideoMapUpdate, (rtpMap) => {
      this.postRTPMap(rtpMap);
    });
  }

  private setupEventListeners(room: Room, keyProvider: BaseKeyProvider) {
    room.on(RoomEvent.TrackPublished, (pub, participant) =>
      this.setParticipantCryptorEnabled(
        pub.trackInfo!.encryption !== Encryption_Type.NONE,
        participant.identity,
      ),
    );
    room.on(RoomEvent.ConnectionStateChanged, (state) => {
      if (state === ConnectionState.Connected) {
        room.participants.forEach((participant) => {
          participant.tracks.forEach((pub) => {
            this.setParticipantCryptorEnabled(
              pub.trackInfo!.encryption !== Encryption_Type.NONE,
              participant.identity,
            );
          });
        });
      }
    });

    room.on(RoomEvent.TrackUnsubscribed, (track, _, participant) => {
      const msg: RemoveTransformMessage = {
        kind: 'removeTransform',
        data: {
          participantId: participant.identity,
          trackId: track.mediaStreamID,
        },
      };
      this.worker?.postMessage(msg);
    });
    room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
      this.setupE2EEReceiver(track, participant.identity, pub.trackInfo);
    });
    room.localParticipant.on(ParticipantEvent.LocalTrackPublished, async (publication) => {
      this.setupE2EESender(
        publication.track!,
        publication.track!.sender!,
        room.localParticipant.identity,
      );
    });

    keyProvider
      .on('setKey', (keyInfo) => this.postKey(keyInfo))
      .on('ratchetRequest', (participantId, keyIndex) =>
        this.postRatchetRequest(participantId, keyIndex),
      );
  }

  private postRatchetRequest(participantId?: string, keyIndex?: number) {
    if (!this.worker) {
      throw Error('could not ratchet key, worker is missing');
    }
    const msg: RatchetRequestMessage = {
      kind: 'ratchetRequest',
      data: {
        participantId,
        keyIndex,
      },
    };
    this.worker.postMessage(msg);
  }

  private postKey({ key, participantId, keyIndex }: KeyInfo) {
    if (!this.worker) {
      throw Error('could not set key, worker is missing');
    }
    const msg: SetKeyMessage = {
      kind: 'setKey',
      data: {
        participantId,
        key,
        keyIndex,
      },
    };
    this.worker.postMessage(msg);
  }

  private postRTPMap(map: Map<number, VideoCodec>) {
    if (!this.worker) {
      throw Error('could not post rtp map, worker is missing');
    }
    const msg: RTPVideoMapMessage = {
      kind: 'setRTPMap',
      data: {
        map,
      },
    };
    this.worker.postMessage(msg);
  }

  private setupE2EEReceiver(track: RemoteTrack, remoteId: string, trackInfo?: TrackInfo) {
    if (!track.receiver) {
      return;
    }
    if (!trackInfo?.mimeType || trackInfo.mimeType === '') {
      throw new TypeError('MimeType missing from trackInfo, cannot set up E2EE cryptor');
    }
    this.handleReceiver(
      track.receiver,
      track.mediaStreamID,
      remoteId,
      track.kind === 'video' ? mimeTypeToVideoCodecString(trackInfo.mimeType) : undefined,
    );
  }

  private setupE2EESender(track: Track, sender: RTCRtpSender, localId: string) {
    if (!(track instanceof LocalTrack) || !sender) {
      if (!sender) log.warn('early return because sender is not ready');
      return;
    }
    this.handleSender(sender, track.mediaStreamID, localId, undefined);
  }

  /**
   * Handles the given {@code RTCRtpReceiver} by creating a {@code TransformStream} which will inject
   * a frame decoder.
   *
   */
  private async handleReceiver(
    receiver: RTCRtpReceiver,
    trackId: string,
    participantId: string,
    codec?: VideoCodec,
  ) {
    if (!this.worker) {
      return;
    }

    if (isScriptTransformSupported()) {
      const options = {
        kind: 'decode',
        participantId,
        trackId,
        codec,
      };
      // @ts-ignore
      receiver.transform = new RTCRtpScriptTransform(this.worker, options);
    } else {
      if (E2EE_FLAG in receiver && codec) {
        // only update codec
        const msg: UpdateCodecMessage = {
          kind: 'updateCodec',
          data: {
            trackId,
            codec,
            participantId,
          },
        };
        this.worker.postMessage(msg);
        return;
      }
      // @ts-ignore
      let writable: WritableStream = receiver.writableStream;
      // @ts-ignore
      let readable: ReadableStream = receiver.readableStream;
      if (!writable || !readable) {
        // @ts-ignore
        const receiverStreams = receiver.createEncodedStreams();
        // @ts-ignore
        receiver.writableStream = receiverStreams.writable;
        writable = receiverStreams.writable;
        // @ts-ignore
        receiver.readableStream = receiverStreams.readable;
        readable = receiverStreams.readable;
      }

      const msg: EncodeMessage = {
        kind: 'decode',
        data: {
          readableStream: readable,
          writableStream: writable,
          trackId: trackId,
          codec,
          participantId,
        },
      };
      this.worker.postMessage(msg, [readable, writable]);
    }

    // @ts-ignore
    receiver[E2EE_FLAG] = true;
  }

  /**
   * Handles the given {@code RTCRtpSender} by creating a {@code TransformStream} which will inject
   * a frame encoder.
   *
   */
  private handleSender(
    sender: RTCRtpSender,
    trackId: string,
    participantId: string,
    codec?: VideoCodec,
  ) {
    if (E2EE_FLAG in sender || !this.worker) {
      return;
    }

    if (isScriptTransformSupported()) {
      log.warn('initialize script transform');

      const options = {
        kind: 'encode',
        participantId,
        trackId,
        codec,
      };
      // @ts-ignore
      sender.transform = new RTCRtpScriptTransform(this.worker, options);
    } else {
      log.warn('initialize encoded streams');
      // @ts-ignore
      const senderStreams = sender.createEncodedStreams();
      const msg: EncodeMessage = {
        kind: 'encode',
        data: {
          readableStream: senderStreams.readable,
          writableStream: senderStreams.writable,
          codec,
          trackId,
          participantId,
        },
      };
      this.worker.postMessage(msg, [senderStreams.readable, senderStreams.writable]);
    }

    // @ts-ignore
    sender[E2EE_FLAG] = true;
  }
}
