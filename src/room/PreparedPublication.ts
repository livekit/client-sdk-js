import { AddTrackRequest, type TrackInfo } from '@livekit/protocol';
import { parse } from 'sdp-transform';
import { cloneDeep } from '../utils/cloneDeep';
import type PCTransport from './PCTransport';
import type RTCEngine from './RTCEngine';
import { TrackInvalidError, UnexpectedConnectionState } from './errors';
import type LocalTrack from './track/LocalTrack';
import type LocalTrackPublication from './track/LocalTrackPublication';
import { Track } from './track/Track';
import type { TrackPublishOptions } from './track/options';

/**
 * The CID the server matches an AddTrack request to: the track id in the MSID of the sender whose
 * stream is `streamId`, in the offer `sdp`.
 */
export function reservedSenderCid(sdp: string, streamId: string): string | undefined {
  const msid = parse(sdp).media.find(
    (m) => typeof m.msid === 'string' && m.msid.startsWith(`${streamId} `),
  )?.msid;
  return msid?.split(' ')[1];
}

/** A full reconnect dropped a reservation that an attachment was waiting on. */
class ReservationDroppedError extends Error {
  constructor() {
    super('reservation dropped by a reconnect');
    this.name = 'ReservationDroppedError';
  }
}

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
   * Binds captured media once the reservation is registered. Uses ordinary publication when the
   * reservation cannot be negotiated or the captured format differs. Does not take ownership on
   * failure.
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

  startBitrate?: number;

  private cancelled?: Error;

  private initial?: InitialPublicationSender;

  /** Server identity used to scope early subscription notifications to this reservation. */
  initialTrackSid?: string;

  private boundTrack?: LocalTrack;

  private attaching?: Promise<LocalTrackPublication>;

  private cancelling?: Promise<void>;

  private committed = false;

  /** Whether the engine reserved a sender or decided that it cannot. */
  private settled = false;

  private ownsBuffer = false;

  private resolveRegistered!: () => void;

  private rejectRegistered!: (error: Error) => void;

  private rejectCancelled!: (error: Error) => void;

  /** Settles once the engine reserved a sender, or decided that this connection cannot. */
  private registered!: Promise<void>;

  private readonly cancellation: Promise<never>;

  constructor(
    readonly specification: PreparePublicationOptions,
    readonly options: TrackPublishOptions,
    readonly encodings: RTCRtpEncodingParameters[],
    readonly codec: string,
    /** Whether a sender can be reserved before capture (codec, platform, encryption). */
    readonly canReserve: boolean,
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
      // before capture, others see a muted track; reserveTrack() sets the track's own state
      muted: true,
    });
    this.resetRegistration();
    this.cancellation = new Promise((_, reject) => {
      this.rejectCancelled = reject;
    });
    // A caller may prepare now and attach much later, or never attach at all.

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
      for (;;) {
        await Promise.race([this.registered, this.cancellation]);
        this.assertActive();
        track.source = this.specification.source;
        try {
          const publication = await this.publish!(track, this);
          this.commit();
          this.finish();
          return publication;
        } catch (error) {
          // A full reconnect dropped the reservation while the attachment waited for it: wait for
          // the registration on the new connection and publish again.
          if (!(error instanceof ReservationDroppedError) || this.cancelled) throw error;
        }
      }
    } catch (error) {
      // cancellation removes the reserved sender
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

  /** Settles once the engine reserved a sender or decided that it cannot. */
  get registration(): Promise<void> {
    return this.registered;
  }

  /** Whether the engine still has to reserve a sender for this publication. */
  get isWaitingForSender() {
    // An attachment that started after registration settled publishes on its own; one that
    // started earlier waits for this reservation.
    return !this.cancelled && !this.committed && !this.initial && !(this.attaching && this.settled);
  }

  /** The connection cannot reserve a sender: attachment publishes as usual. */
  skipReservation() {
    this.settled = true;
    this.resolveRegistered();
  }

  /** Fails pending attachment even if capture has not completed yet. */
  disconnected() {
    this.rejectRegistered(new UnexpectedConnectionState('room disconnected before publication'));
    this.cancel().catch(() => {});
  }

  /** Takes ownership of a reserved sender whose AddTrack request is in flight. */
  reserve(initial: InitialPublicationSender) {
    this.assertActive();
    this.initial = initial;
    this.settled = true;
    this.resolveRegistered();
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
    if (!initial) return;
    // the next connection registers this publication again, and an attachment waits for that
    if (!this.committed && !this.cancelled) this.resetRegistration();
    initial.engine.cancelPendingTrack(this.request.cid);
  }

  private resetRegistration() {
    this.settled = false;
    this.registered = new Promise((resolve, reject) => {
      this.resolveRegistered = resolve;
      this.rejectRegistered = reject;
    });
    // A caller may prepare now and attach much later, or never attach at all.
    this.registered.catch(() => {});
  }

  /** Returns a compatible reserved sender, otherwise removes it before ordinary publication. */
  async senderFor(
    track: LocalTrack,
    engine: RTCEngine,
  ): Promise<InitialPublicationSender | undefined> {
    this.assertActive();
    const initial = this.initial;
    if (!initial) return;
    let info: TrackInfo;
    try {
      info = await initial.accepted;
    } catch (error) {
      // fallback() replaced the reservation: the attachment retries on the next connection
      if (this.initial !== initial && !this.cancelled) throw new ReservationDroppedError();
      throw error;
    }
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
        : // a mono publication takes any capture, as publishing after capture does
          !!this.options.forceStereo &&
          settings.channelCount !== undefined &&
          settings.channelCount < 2;
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
    this.rejectRegistered(this.cancelled);
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
    // A sender that went into the JOIN may not be in a local description yet.
    await initial.engine.initialOfferAnswered();
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
