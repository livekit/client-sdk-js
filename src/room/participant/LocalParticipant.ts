import log from '../../logger';
import { RoomOptions } from '../../options';
import {
  DataPacket, DataPacket_Kind, ParticipantPermission,
} from '../../proto/livekit_models';
import {
  AddTrackRequest, DataChannelInfo,
  SubscribedQualityUpdate, TrackPublishedResponse, TrackUnpublishedResponse,
} from '../../proto/livekit_rtc';
import {
  TrackInvalidError,
  UnexpectedConnectionState,
} from '../errors';
import { ParticipantEvent, TrackEvent } from '../events';
import RTCEngine from '../RTCEngine';
import LocalAudioTrack from '../track/LocalAudioTrack';
import LocalTrack from '../track/LocalTrack';
import LocalTrackPublication from '../track/LocalTrackPublication';
import LocalVideoTrack, { videoLayersFromEncodings } from '../track/LocalVideoTrack';
import {
  CreateLocalTracksOptions,
  ScreenShareCaptureOptions,
  ScreenSharePresets,
  TrackPublishOptions, VideoCodec,
} from '../track/options';
import { Track } from '../track/Track';
import { constraintsForOptions, mergeDefaultOptions } from '../track/utils';
import { isFireFox } from '../utils';
import Participant from './Participant';
import { ParticipantTrackPermission, trackPermissionToProto } from './ParticipantTrackPermission';
import { computeVideoEncodings, mediaTrackToLocalTrack } from './publishUtils';
import RemoteParticipant from './RemoteParticipant';

export default class LocalParticipant extends Participant {
  audioTracks: Map<string, LocalTrackPublication>;

  videoTracks: Map<string, LocalTrackPublication>;

  /** map of track sid => all published tracks */
  tracks: Map<string, LocalTrackPublication>;

  private pendingPublishing = new Set<Track.Source>();

  private cameraError: Error | undefined;

  private microphoneError: Error | undefined;

  private engine: RTCEngine;

  // keep a pointer to room options
  private roomOptions?: RoomOptions;

  /** @internal */
  constructor(sid: string, identity: string, engine: RTCEngine, options: RoomOptions) {
    super(sid, identity);
    this.audioTracks = new Map();
    this.videoTracks = new Map();
    this.tracks = new Map();
    this.engine = engine;
    this.roomOptions = options;

    this.engine.client.onRemoteMuteChanged = (trackSid: string, muted: boolean) => {
      const pub = this.tracks.get(trackSid);
      if (!pub || !pub.track) {
        return;
      }
      if (muted) {
        pub.mute();
      } else {
        pub.unmute();
      }
    };

    this.engine.client.onSubscribedQualityUpdate = this.handleSubscribedQualityUpdate;

    this.engine.client.onLocalTrackUnpublished = this.handleLocalTrackUnpublished;
  }

  get lastCameraError(): Error | undefined {
    return this.cameraError;
  }

  get lastMicrophoneError(): Error | undefined {
    return this.microphoneError;
  }

  getTrack(source: Track.Source): LocalTrackPublication | undefined {
    const track = super.getTrack(source);
    if (track) {
      return track as LocalTrackPublication;
    }
  }

  getTrackByName(name: string): LocalTrackPublication | undefined {
    const track = super.getTrackByName(name);
    if (track) {
      return track as LocalTrackPublication;
    }
  }

  /**
   * Enable or disable a participant's camera track.
   *
   * If a track has already published, it'll mute or unmute the track.
   */
  setCameraEnabled(enabled: boolean): Promise<void> {
    return this.setTrackEnabled(Track.Source.Camera, enabled);
  }

  /**
   * Enable or disable a participant's microphone track.
   *
   * If a track has already published, it'll mute or unmute the track.
   */
  setMicrophoneEnabled(enabled: boolean): Promise<void> {
    return this.setTrackEnabled(Track.Source.Microphone, enabled);
  }

  /**
   * Start or stop sharing a participant's screen
   */
  setScreenShareEnabled(enabled: boolean): Promise<void> {
    return this.setTrackEnabled(Track.Source.ScreenShare, enabled);
  }

  /** @internal */
  setPermissions(permissions: ParticipantPermission): boolean {
    const prevPermissions = this.permissions;
    const changed = super.setPermissions(permissions);
    if (changed && prevPermissions) {
      this.emit(ParticipantEvent.ParticipantPermissionsChanged, prevPermissions);
    }
    return changed;
  }

  /**
   * Enable or disable publishing for a track by source. This serves as a simple
   * way to manage the common tracks (camera, mic, or screen share)
   */
  private async setTrackEnabled(source: Track.Source, enabled: boolean): Promise<void> {
    log.debug('setTrackEnabled', source, enabled);
    const track = this.getTrack(source);
    if (enabled) {
      if (track) {
        await track.unmute();
      } else {
        let localTrack: LocalTrack | undefined;
        if (this.pendingPublishing.has(source)) {
          log.info('skipping duplicate published source', source);
          // no-op it's already been requested
          return;
        }
        this.pendingPublishing.add(source);
        try {
          switch (source) {
            case Track.Source.Camera:
              [localTrack] = await this.createTracks({
                video: true,
              });
              break;
            case Track.Source.Microphone:
              [localTrack] = await this.createTracks({
                audio: true,
              });
              break;
            case Track.Source.ScreenShare:
              [localTrack] = await this.createScreenTracks({ audio: false });
              break;
            default:
              throw new TrackInvalidError(source);
          }

          await this.publishTrack(localTrack);
        } catch (e) {
          if (e instanceof Error && !(e instanceof TrackInvalidError)) {
            this.emit(ParticipantEvent.MediaDevicesError, e);
          }
          throw e;
        } finally {
          this.pendingPublishing.delete(source);
        }
      }
    } else if (track && track.track) {
      // screenshare cannot be muted, unpublish instead
      if (source === Track.Source.ScreenShare) {
        this.unpublishTrack(track.track);
      } else {
        await track.mute();
      }
    }
  }

  /**
   * Publish both camera and microphone at the same time. This is useful for
   * displaying a single Permission Dialog box to the end user.
   */
  async enableCameraAndMicrophone() {
    if (this.pendingPublishing.has(Track.Source.Camera)
        || this.pendingPublishing.has(Track.Source.Microphone)) {
      // no-op it's already been requested
      return;
    }

    this.pendingPublishing.add(Track.Source.Camera);
    this.pendingPublishing.add(Track.Source.Microphone);
    try {
      const tracks: LocalTrack[] = await this.createTracks({
        audio: true,
        video: true,
      });

      await Promise.all(tracks.map((track) => this.publishTrack(track)));
    } finally {
      this.pendingPublishing.delete(Track.Source.Camera);
      this.pendingPublishing.delete(Track.Source.Microphone);
    }
  }

  /**
   * Create local camera and/or microphone tracks
   * @param options
   * @returns
   */
  async createTracks(
    options?: CreateLocalTracksOptions,
  ): Promise<LocalTrack[]> {
    const opts = mergeDefaultOptions(
      options,
      this.roomOptions?.audioCaptureDefaults,
      this.roomOptions?.videoCaptureDefaults,
    );

    const constraints = constraintsForOptions(opts);
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia(
        constraints,
      );
    } catch (err) {
      if (err instanceof Error) {
        if (constraints.audio) {
          this.microphoneError = err;
        }
        if (constraints.video) {
          this.cameraError = err;
        }
      }

      throw err;
    }

    if (constraints.audio) {
      this.microphoneError = undefined;
    }
    if (constraints.video) {
      this.cameraError = undefined;
    }

    return stream.getTracks().map((mediaStreamTrack) => {
      const isAudio = mediaStreamTrack.kind === 'audio';
      let trackOptions = isAudio ? options!.audio : options!.video;
      if (typeof trackOptions === 'boolean' || !trackOptions) {
        trackOptions = {};
      }
      let trackConstraints: MediaTrackConstraints | undefined;
      const conOrBool = isAudio ? constraints.audio : constraints.video;
      if (typeof conOrBool !== 'boolean') {
        trackConstraints = conOrBool;
      }
      const track = mediaTrackToLocalTrack(mediaStreamTrack, trackConstraints);
      if (track.kind === Track.Kind.Video) {
        track.source = Track.Source.Camera;
      } else if (track.kind === Track.Kind.Audio) {
        track.source = Track.Source.Microphone;
      }
      track.mediaStream = stream;
      return track;
    });
  }

  /**
   * Creates a screen capture tracks with getDisplayMedia().
   * A LocalVideoTrack is always created and returned.
   * If { audio: true }, and the browser supports audio capture, a LocalAudioTrack is also created.
   */
  async createScreenTracks(
    options?: ScreenShareCaptureOptions,
  ): Promise<Array<LocalTrack>> {
    if (options === undefined) {
      options = {};
    }
    if (options.resolution === undefined) {
      options.resolution = ScreenSharePresets.h1080fps15.resolution;
    }

    let videoConstraints: MediaTrackConstraints | boolean = true;
    if (options.resolution) {
      videoConstraints = {
        width: options.resolution.width,
        height: options.resolution.height,
        frameRate: options.resolution.frameRate,
      };
    }
    // typescript definition is missing getDisplayMedia: https://github.com/microsoft/TypeScript/issues/33232
    // @ts-ignore
    const stream: MediaStream = await navigator.mediaDevices.getDisplayMedia({
      audio: options.audio ?? false,
      video: videoConstraints,
    });

    const tracks = stream.getVideoTracks();
    if (tracks.length === 0) {
      throw new TrackInvalidError('no video track found');
    }
    const screenVideo = new LocalVideoTrack(tracks[0]);
    screenVideo.source = Track.Source.ScreenShare;
    const localTracks: Array<LocalTrack> = [screenVideo];
    if (stream.getAudioTracks().length > 0) {
      const screenAudio = new LocalAudioTrack(stream.getAudioTracks()[0]);
      screenAudio.source = Track.Source.ScreenShareAudio;
      localTracks.push(screenAudio);
    }
    return localTracks;
  }

  /**
   * Publish a new track to the room
   * @param track
   * @param options
   */
  async publishTrack(
    track: LocalTrack | MediaStreamTrack,
    options?: TrackPublishOptions,
  ): Promise<LocalTrackPublication> {
    const opts: TrackPublishOptions = {
      ...this.roomOptions?.publishDefaults,
      ...options,
    };

    // convert raw media track into audio or video track
    if (track instanceof MediaStreamTrack) {
      switch (track.kind) {
        case 'audio':
          track = new LocalAudioTrack(track);
          break;
        case 'video':
          track = new LocalVideoTrack(track);
          break;
        default:
          throw new TrackInvalidError(
            `unsupported MediaStreamTrack kind ${track.kind}`,
          );
      }
    }

    // is it already published? if so skip
    let existingPublication: LocalTrackPublication | undefined;
    this.tracks.forEach((publication) => {
      if (!publication.track) {
        return;
      }
      if (publication.track === track) {
        existingPublication = <LocalTrackPublication>publication;
      }
    });

    if (existingPublication) return existingPublication;

    if (opts.source) {
      track.source = opts.source;
    }
    if (opts.stopMicTrackOnMute && track instanceof LocalAudioTrack) {
      track.stopOnMute = true;
    }

    if (track.source === Track.Source.ScreenShare && isFireFox()) {
      // Firefox does not work well with simulcasted screen share
      // we frequently get no data on layer 0 when enabled
      opts.simulcast = false;
    }

    // handle track actions
    track.on(TrackEvent.Muted, this.onTrackMuted);
    track.on(TrackEvent.Unmuted, this.onTrackUnmuted);
    track.on(TrackEvent.Ended, this.onTrackUnpublish);

    // create track publication from track
    const req = AddTrackRequest.fromPartial({
      // get local track id for use during publishing
      cid: track.mediaStreamTrack.id,
      name: options?.name,
      type: Track.kindToProto(track.kind),
      muted: track.isMuted,
      source: Track.sourceToProto(track.source),
      disableDtx: !(opts?.dtx ?? true),
    });

    // compute encodings and layers for video
    let encodings: RTCRtpEncodingParameters[] | undefined;
    if (track.kind === Track.Kind.Video) {
      // TODO: support react native, which doesn't expose getSettings
      const settings = track.mediaStreamTrack.getSettings();
      const width = settings.width ?? track.dimensions?.width;
      const height = settings.height ?? track.dimensions?.height;
      // width and height should be defined for video
      req.width = width ?? 0;
      req.height = height ?? 0;
      encodings = computeVideoEncodings(
        track.source === Track.Source.ScreenShare,
        width,
        height,
        opts,
      );
      req.layers = videoLayersFromEncodings(req.width, req.height, encodings);
    } else if (track.kind === Track.Kind.Audio && opts.audioBitrate) {
      encodings = [
        {
          maxBitrate: opts.audioBitrate,
        },
      ];
    }

    const ti = await this.engine.addTrack(req);
    const publication = new LocalTrackPublication(track.kind, ti, track);
    track.sid = ti.sid;

    if (!this.engine.publisher) {
      throw new UnexpectedConnectionState('publisher is closed');
    }
    log.debug(`publishing ${track.kind} with encodings`, encodings, ti);
    const transceiverInit: RTCRtpTransceiverInit = { direction: 'sendonly' };
    if (encodings) {
      transceiverInit.sendEncodings = encodings;
    }
    const transceiver = this.engine.publisher.pc.addTransceiver(
      track.mediaStreamTrack, transceiverInit,
    );
    this.engine.negotiate();

    // store RTPSender
    track.sender = transceiver.sender;
    if (track instanceof LocalVideoTrack) {
      track.startMonitor(this.engine.client);
    } else if (track instanceof LocalAudioTrack) {
      track.startMonitor();
    }

    if (opts.videoCodec) {
      this.setPreferredCodec(transceiver, track.kind, opts.videoCodec);
    }
    this.addTrackPublication(publication);

    // send event for publication
    this.emit(ParticipantEvent.LocalTrackPublished, publication);
    return publication;
  }

  unpublishTrack(
    track: LocalTrack | MediaStreamTrack,
    stopOnUnpublish?: boolean,
  ): LocalTrackPublication | null {
    // look through all published tracks to find the right ones
    const publication = this.getPublicationForTrack(track);

    log.debug('unpublishTrack', 'unpublishing track', track);

    if (!publication || !publication.track) {
      log.warn(
        'unpublishTrack',
        'track was not unpublished because no publication was found',
        track,
      );
      return null;
    }

    track = publication.track;

    track.off(TrackEvent.Muted, this.onTrackMuted);
    track.off(TrackEvent.Unmuted, this.onTrackUnmuted);
    track.off(TrackEvent.Ended, this.onTrackUnpublish);

    if (stopOnUnpublish === undefined) {
      stopOnUnpublish = this.roomOptions?.stopLocalTrackOnUnpublish ?? true;
    }
    if (stopOnUnpublish) {
      track.stop();
    }

    const { mediaStreamTrack } = track;

    if (this.engine.publisher) {
      const senders = this.engine.publisher.pc.getSenders();
      senders.forEach((sender) => {
        if (sender.track === mediaStreamTrack) {
          try {
            this.engine.publisher?.pc.removeTrack(sender);
            this.engine.negotiate();
          } catch (e) {
            log.warn('unpublishTrack', 'failed to remove track', e);
          }
        }
      });
    }

    // remove from our maps
    this.tracks.delete(publication.trackSid);
    switch (publication.kind) {
      case Track.Kind.Audio:
        this.audioTracks.delete(publication.trackSid);
        break;
      case Track.Kind.Video:
        this.videoTracks.delete(publication.trackSid);
        break;
      default:
        break;
    }

    publication.setTrack(undefined);
    this.emit(ParticipantEvent.LocalTrackUnpublished, publication);

    return publication;
  }

  unpublishTracks(
    tracks: LocalTrack[] | MediaStreamTrack[],
  ): LocalTrackPublication[] {
    const publications: LocalTrackPublication[] = [];
    tracks.forEach((track: LocalTrack | MediaStreamTrack) => {
      const pub = this.unpublishTrack(track);
      if (pub) {
        publications.push(pub);
      }
    });
    return publications;
  }

  /**
   * Publish a new data payload to the room. Data will be forwarded to each
   * participant in the room if the destination argument is empty
   *
   * @param data Uint8Array of the payload. To send string data, use TextEncoder.encode
   * @param kind whether to send this as reliable or lossy.
   * For data that you need delivery guarantee (such as chat messages), use Reliable.
   * For data that should arrive as quickly as possible, but you are ok with dropped
   * packets, use Lossy.
   * @param destination the participants who will receive the message
   */
  async publishData(data: Uint8Array, kind: DataPacket_Kind,
    destination?: RemoteParticipant[] | string[]) {
    const dest: string[] = [];
    if (destination !== undefined) {
      destination.forEach((val: any) => {
        if (val instanceof RemoteParticipant) {
          dest.push(val.sid);
        } else {
          dest.push(val);
        }
      });
    }

    const packet: DataPacket = {
      kind,
      user: {
        participantSid: this.sid,
        payload: data,
        destinationSids: dest,
      },
    };

    await this.engine.sendDataPacket(packet, kind);
  }

  /**
   * Control who can subscribe to LocalParticipant's published tracks.
   *
   * By default, all participants can subscribe. This allows fine-grained control over
   * who is able to subscribe at a participant and track level.
   *
   * Note: if access is given at a track-level (i.e. both [allParticipantsAllowed] and
   * [ParticipantTrackPermission.allTracksAllowed] are false), any newer published tracks
   * will not grant permissions to any participants and will require a subsequent
   * permissions update to allow subscription.
   *
   * @param allParticipantsAllowed Allows all participants to subscribe all tracks.
   *  Takes precedence over [[participantTrackPermissions]] if set to true.
   *  By default this is set to true.
   * @param participantTrackPermissions Full list of individual permissions per
   *  participant/track. Any omitted participants will not receive any permissions.
   */
  setTrackSubscriptionPermissions(
    allParticipantsAllowed: boolean,
    participantTrackPermissions: ParticipantTrackPermission[] = [],
  ) {
    this.engine.client.sendUpdateSubscriptionPermissions(
      allParticipantsAllowed,
      participantTrackPermissions.map((p) => trackPermissionToProto(p)),
    );
  }

  /** @internal */
  private onTrackUnmuted = (track: LocalTrack) => {
    this.onTrackMuted(track, false);
  };

  // when the local track changes in mute status, we'll notify server as such
  /** @internal */
  private onTrackMuted = (
    track: LocalTrack,
    muted?: boolean,
  ) => {
    if (muted === undefined) {
      muted = true;
    }

    if (!track.sid) {
      log.error('could not update mute status for unpublished track', track);
      return;
    }

    this.engine.updateMuteStatus(track.sid, muted);
  };

  private handleSubscribedQualityUpdate = (update: SubscribedQualityUpdate) => {
    if (!this.roomOptions?.dynacast) {
      return;
    }
    const pub = this.videoTracks.get(update.trackSid);
    if (!pub) {
      log.warn('handleSubscribedQualityUpdate',
        'received subscribed quality update for unknown track', update.trackSid);
      return;
    }
    pub.videoTrack?.setPublishingLayers(update.subscribedQualities);
  };

  private handleLocalTrackUnpublished = (unpublished: TrackUnpublishedResponse) => {
    const track = this.tracks.get(unpublished.trackSid);
    if (!track) {
      log.warn('handleLocalTrackUnpublished',
        'received unpublished event for unknown track', unpublished.trackSid);
      return;
    }
    this.unpublishTrack(track.track!);
  };

  private onTrackUnpublish = (track: LocalTrack) => {
    this.unpublishTrack(track);
  };

  private getPublicationForTrack(
    track: LocalTrack | MediaStreamTrack,
  ): LocalTrackPublication | undefined {
    let publication: LocalTrackPublication | undefined;
    this.tracks.forEach((pub) => {
      const localTrack = pub.track;
      if (!localTrack) {
        return;
      }

      // this looks overly complicated due to this object tree
      if (track instanceof MediaStreamTrack) {
        if (
          localTrack instanceof LocalAudioTrack
          || localTrack instanceof LocalVideoTrack
        ) {
          if (localTrack.mediaStreamTrack === track) {
            publication = <LocalTrackPublication>pub;
          }
        }
      } else if (track === localTrack) {
        publication = <LocalTrackPublication>pub;
      }
    });
    return publication;
  }

  private setPreferredCodec(
    transceiver: RTCRtpTransceiver,
    kind: Track.Kind,
    videoCodec: VideoCodec,
  ) {
    if (!('getCapabilities' in RTCRtpSender)) {
      return;
    }
    const cap = RTCRtpSender.getCapabilities(kind);
    if (!cap) return;
    const selected = cap.codecs.find((c) => {
      const codec = c.mimeType.toLowerCase();
      const matchesVideoCodec = codec === `video/${videoCodec}`;

      // for h264 codecs that have sdpFmtpLine available, use only if the
      // profile-level-id is 42e01f for cross-browser compatibility
      if (videoCodec === 'h264' && c.sdpFmtpLine) {
        return matchesVideoCodec && c.sdpFmtpLine.includes('profile-level-id=42e01f');
      }

      return matchesVideoCodec || codec === 'audio/opus';
    });
    if (selected && 'setCodecPreferences' in transceiver) {
      // @ts-ignore
      transceiver.setCodecPreferences([selected]);
    }
  }

  /** @internal */
  publishedTracksInfo(): TrackPublishedResponse[] {
    const infos: TrackPublishedResponse[] = [];
    this.tracks.forEach((track: LocalTrackPublication) => {
      if (track.track !== undefined) {
        infos.push({
          cid: track.track.mediaStreamTrack.id,
          track: track.trackInfo,
        });
      }
    });
    return infos;
  }

  /** @internal */
  dataChannelsInfo(): DataChannelInfo[] {
    const infos: DataChannelInfo[] = [];
    const getInfo = (dc: RTCDataChannel | undefined) => {
      if (dc?.id !== undefined && dc.id !== null) {
        infos.push({
          label: dc.label,
          id: dc.id,
        });
      }
    };
    getInfo(this.engine.dataChannelForKind(DataPacket_Kind.LOSSY));
    getInfo(this.engine.dataChannelForKind(DataPacket_Kind.RELIABLE));
    return infos;
  }
}
