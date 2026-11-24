import { AddTrackRequest, type TrackInfo } from '@livekit/protocol';
import { cloneDeep } from '../utils/cloneDeep';
import type PCTransport from './PCTransport';
import type RTCEngine from './RTCEngine';
import { TrackInvalidError, UnexpectedConnectionState } from './errors';
import type LocalTrack from './track/LocalTrack';
import type LocalTrackPublication from './track/LocalTrackPublication';
import { Track } from './track/Track';
import type { TrackPublishOptions } from './track/options';

/** Copy publication settings while preserving preset accessors used by ordinary publication. */
export function snapshotPublishOptions(options: TrackPublishOptions): TrackPublishOptions {
  const copy = cloneDeep(options);
  for (const key of ['videoSimulcastLayers', 'screenShareSimulcastLayers'] as const) {
    options[key]?.forEach((preset, index) => {
      Object.setPrototypeOf(copy[key]![index], Object.getPrototypeOf(preset));
    });
  }
  return copy;
}

/** The video format to reserve before opening a camera. */
export interface PreparedVideoFormat {
  width: number;
  height: number;
  frameRate?: number;
}

/** Publication intent that can be resolved without requesting device access. @internal */
export type PreparePublicationOptions =
  | {
      source: Track.Source.Microphone;
      /** Otherwise inferred from forceStereo, defaulting to mono. */
      format?: { channelCount: 1 | 2 };
      publishOptions?: TrackPublishOptions;
    }
  | {
      source: Track.Source.Camera;
      format: PreparedVideoFormat;
      publishOptions?: TrackPublishOptions;
    };

/** A room-owned reservation; creating it never requests camera or microphone access. @internal */
export interface PreparedPublication {
  /**
   * Binds captured media after the room connects. Uses ordinary publication when the reservation
   * cannot be negotiated or the captured format differs. Does not take ownership on failure.
   */
  attachTrack(track: LocalTrack): Promise<LocalTrackPublication>;
  /** Cancels an unbound reservation without disconnecting the room or stopping caller-owned media. */
  cancel(): Promise<void>;
}

/** The negotiated sender owned by a preparation until normal publication takes over. */
export interface InitialPublicationSender {
  engine: RTCEngine;
  transport: PCTransport;
  transceiver: RTCRtpTransceiver;
  accepted: Promise<TrackInfo>;
}

/** Internal implementation shared by the room, engine, and ordinary publish pipeline. */
export class PreparedPublicationState implements PreparedPublication {
  readonly request: AddTrackRequest;

  readonly kind: Track.Kind;

  claimed = false;

  startBitrate?: number;

  private cancelled?: Error;

  private initial?: InitialPublicationSender;

  /** Server identity used to scope early subscription notifications to this reservation. */
  initialTrackSid?: string;

  private boundTrack?: LocalTrack;

  private attaching?: Promise<LocalTrackPublication>;

  private cancelling?: Promise<void>;

  private committed = false;

  private ownsBuffer = false;

  private resolveConnected!: () => void;

  private rejectConnected!: (error: Error) => void;

  private rejectCancelled!: (error: Error) => void;

  private readonly connected: Promise<void>;

  private readonly cancellation: Promise<never>;

  constructor(
    readonly specification: PreparePublicationOptions,
    readonly options: TrackPublishOptions,
    readonly encodings: RTCRtpEncodingParameters[],
    readonly codec: string,
    readonly canSendWithJoin: boolean,
    private publish?: (
      track: LocalTrack,
      prepared: PreparedPublicationState,
    ) => Promise<LocalTrackPublication>,
    private release?: (prepared: PreparedPublicationState) => void,
  ) {
    this.kind =
      specification.source === Track.Source.Microphone ? Track.Kind.Audio : Track.Kind.Video;
    this.request = new AddTrackRequest({
      name: options.name,
      type: Track.kindToProto(this.kind),
      source: Track.sourceToProto(specification.source),
      stream: options.stream,
      stereo: !!options.forceStereo,
      disableDtx: !(options.dtx ?? true),
      disableRed: !(options.red ?? true),
    });
    this.connected = new Promise((resolve, reject) => {
      this.resolveConnected = resolve;
      this.rejectConnected = reject;
    });
    this.cancellation = new Promise((_, reject) => {
      this.rejectCancelled = reject;
    });
    // A caller may prepare now and attach much later, or never attach at all.
    this.connected.catch(() => {});
    this.cancellation.catch(() => {});
  }

  attachTrack(track: LocalTrack): Promise<LocalTrackPublication> {
    if (this.cancelled) return Promise.reject(this.cancelled);
    if (this.attaching) {
      return this.boundTrack === track
        ? this.attaching
        : Promise.reject(new TrackInvalidError('publication already has a track'));
    }
    if (track.kind !== this.kind || track.sender) {
      return Promise.reject(
        new TrackInvalidError('track kind differs or track already has a sender'),
      );
    }
    this.boundTrack = track;
    if (
      this.options.preConnectBuffer &&
      track.kind === Track.Kind.Audio &&
      !track.hasPreConnectBuffer
    ) {
      track.startPreConnectBuffer();
      this.ownsBuffer = true;
    }
    this.attaching = this.attach(track);
    return this.attaching;
  }

  private async attach(track: LocalTrack): Promise<LocalTrackPublication> {
    try {
      await Promise.race([this.connected, this.cancellation]);
      this.assertActive();
      track.source = this.specification.source;
      const publication = await this.publish!(track, this);
      this.commit();
      this.finish();
      return publication;
    } catch (error) {
      // Reconciliation is room-owned and may wait for an in-flight JOIN to settle.
      this.cancel().catch(() => {});
      throw error;
    }
  }

  /** Transfer the sender to ordinary publication before emitting application events. */
  commit() {
    this.committed = true;
    if (this.initial) this.initial.transport.releaseSender(this.initial.transceiver);
    this.initial = undefined;
  }

  /** Whether ordinary publication now owns the sender. */
  get isCommitted() {
    return this.committed;
  }

  /** Whether this preparation was cancelled before it entered an offer. */
  get isCancelled() {
    return !!this.cancelled;
  }

  /** Whether a connection attempt already owns the reservation. */
  get hasInitialSender() {
    return !!this.initial;
  }

  /** Marks only preparations explicitly supplied to the successful connect. */
  connectionReady() {
    if (this.claimed) this.resolveConnected();
  }

  /** Fails pending attachment even if capture has not completed yet. */
  disconnected() {
    this.rejectConnected(new UnexpectedConnectionState('room disconnected before publication'));
    this.cancel().catch(() => {});
  }

  /** Installs a response waiter before the JOIN request can reach the server. */
  reserve(initial: InitialPublicationSender) {
    this.assertActive();
    this.initial = initial;
    initial.accepted.then(
      (info) => {
        if (this.initial === initial) this.initialTrackSid = info.sid;
      },
      (error) => {
        // An abandoned attempt must not cancel a newer fallback or connection attempt.
        if (this.initial === initial) {
          this.cancelled = error instanceof Error ? error : new Error(String(error));
          this.rejectCancelled(this.cancelled);
          this.cancel().catch(() => {});
        }
      },
    );
  }

  /** Detaches a discarded connection attempt; attachment will use ordinary publication. */
  fallback() {
    this.initialTrackSid = undefined;
    const initial = this.initial;
    this.initial = undefined;
    if (initial) initial.engine.cancelPendingTrack(this.request.cid);
  }

  /** Returns a compatible reserved sender, otherwise removes it before ordinary publication. */
  async senderFor(
    track: LocalTrack,
    engine: RTCEngine,
  ): Promise<InitialPublicationSender | undefined> {
    this.assertActive();
    const initial = this.initial;
    if (!initial) return;
    const info = await initial.accepted;
    this.assertActive();
    const settings = track.getSourceTrackSettings();
    const mime = `${this.kind}/${this.codec}`.toLowerCase();
    // Before RTP arrives, the SFU may return codec entries with only CID/MID.
    // The negotiated SDP already constrains those senders to our selected codec.
    const advertisedCodecs = info.codecs.filter((codec) => codec.mimeType.length > 0);
    const codecChanged =
      advertisedCodecs.length > 0 &&
      !advertisedCodecs.some(
        (c) =>
          c.mimeType.toLowerCase() === mime ||
          (this.kind === Track.Kind.Audio && c.mimeType.toLowerCase() === 'audio/red'),
      );
    const formatChanged =
      this.specification.source === Track.Source.Camera
        ? (settings.width !== undefined && settings.width !== this.specification.format.width) ||
          (settings.height !== undefined && settings.height !== this.specification.format.height)
        : settings.channelCount !== undefined &&
          settings.channelCount !== (this.options.forceStereo ? 2 : 1);
    if (
      engine.e2eeManager ||
      engine.frameMetadataOptions ||
      initial.engine !== engine ||
      engine.pcManager?.publisher !== initial.transport ||
      codecChanged ||
      formatChanged
    ) {
      await this.removeInitial();
      return;
    }
    return initial;
  }

  /** Rejects continuations after cancellation or teardown. */
  assertActive() {
    if (this.cancelled) throw this.cancelled;
  }

  cancel(): Promise<void> {
    if (this.committed) return Promise.resolve();
    if (!this.cancelled) this.cancelled = new TrackInvalidError('prepared publication cancelled');
    this.rejectCancelled(this.cancelled);
    if (this.ownsBuffer) {
      this.boundTrack?.stopPreConnectBuffer();
      this.ownsBuffer = false;
    }
    // In fallback mode the ordinary publisher may still be creating a sender. Its
    // rollback must settle before cancellation releases ownership of this attempt.
    this.cancelling ??= this.removeInitial()
      .then(() => this.attaching?.catch(() => {}))
      .then(() => {})
      .finally(() => this.finish());
    return this.cancelling;
  }

  private async removeInitial() {
    const initial = this.initial;
    if (!initial) return;
    // Do not mutate a transceiver while its initial local description is still deferred.
    try {
      await this.connected;
    } catch {
      /* the connection's teardown owns the PC */
    }
    if (this.initial !== initial) return;
    this.initial = undefined;
    initial.engine.cancelPendingTrack(this.request.cid);
    if (initial.engine.isClosed || initial.engine.pcManager?.publisher !== initial.transport)
      return;
    if (this.boundTrack?.sender === initial.transceiver.sender) this.boundTrack.sender = undefined;
    initial.transport.releaseSender(initial.transceiver);
    initial.transceiver.stop();
    try {
      await initial.engine.negotiate();
    } catch {
      /* disconnect also cancels reconciliation */
    }
  }

  private finish() {
    this.release?.(this);
    this.release = undefined;
    this.publish = undefined;
    if (!this.committed) this.boundTrack = undefined;
  }
}
