import log from '../../logger';
import {
  DataPacket, DataPacket_Kind,
} from '../../proto/livekit_models';
import { AddTrackRequest } from '../../proto/livekit_rtc';
import { getTrackPublishDefaults } from '../defaults';
import {
  TrackInvalidError,
  UnexpectedConnectionState,
} from '../errors';
import { EngineEvent, ParticipantEvent, TrackEvent } from '../events';
import RTCEngine from '../RTCEngine';
import {
  createLocalAudioTrack, createLocalScreenTracks, createLocalVideoTrack,
} from '../track/create';
import LocalAudioTrack from '../track/LocalAudioTrack';
import LocalTrack from '../track/LocalTrack';
import LocalTrackPublication from '../track/LocalTrackPublication';
import LocalVideoTrack, { videoLayersFromEncodings } from '../track/LocalVideoTrack';
import {
  ScreenSharePresets, TrackPublishOptions, VideoCodec,
  VideoEncoding, VideoPreset, VideoPresets,
  VideoPresets43,
} from '../track/options';
import { Track } from '../track/Track';
import Participant from './Participant';
import RemoteParticipant from './RemoteParticipant';

export default class LocalParticipant extends Participant {
  private engine: RTCEngine;

  audioTracks: Map<string, LocalTrackPublication>;

  videoTracks: Map<string, LocalTrackPublication>;

  /** map of track sid => all published tracks */
  tracks: Map<string, LocalTrackPublication>;

  /** @internal */
  pendingPublishing = new Set<Track.Source>();

  /** @internal */
  constructor(sid: string, identity: string, engine: RTCEngine) {
    super(sid, identity);
    this.audioTracks = new Map();
    this.videoTracks = new Map();
    this.tracks = new Map();
    this.engine = engine;

    this.engine.on(EngineEvent.RemoteMuteChanged, (trackSid: string, muted: boolean) => {
      const pub = this.tracks.get(trackSid);
      if (!pub || !pub.track) {
        return;
      }
      if (muted) {
        pub.mute();
      } else {
        pub.unmute();
      }
    });
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
          // no-op it's already been requested
          return;
        }
        this.pendingPublishing.add(source);
        try {
          switch (source) {
            case Track.Source.Camera:
              localTrack = await createLocalVideoTrack();
              break;
            case Track.Source.Microphone:
              localTrack = await createLocalAudioTrack();
              break;
            case Track.Source.ScreenShare:
              [localTrack] = await createLocalScreenTracks({ audio: false });
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
   * Publish a new track to the room
   * @param track
   * @param options
   */
  async publishTrack(
    track: LocalTrack | MediaStreamTrack,
    options?: TrackPublishOptions,
  ): Promise<LocalTrackPublication> {
    const opts: TrackPublishOptions = {};
    Object.assign(opts, getTrackPublishDefaults(), options);

    // convert raw media track into audio or video track
    if (track instanceof MediaStreamTrack) {
      switch (track.kind) {
        case 'audio':
          track = new LocalAudioTrack(track, options?.name);
          break;
        case 'video':
          track = new LocalVideoTrack(track, options?.name);
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
    if (opts.name) {
      track.name = opts.name;
    }
    if (opts.stopMicTrackOnMute && track instanceof LocalAudioTrack) {
      track.stopOnMute = true;
    }

    // handle track actions
    track.on(TrackEvent.Muted, this.onTrackMuted);
    track.on(TrackEvent.Unmuted, this.onTrackUnmuted);
    track.on(TrackEvent.Ended, () => {
      this.unpublishTrack(track);
    });

    // create track publication from track
    const req = AddTrackRequest.fromPartial({
      // get local track id for use during publishing
      cid: track.mediaStreamTrack.id,
      name: track.name,
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
    log.debug('publishing with encodings', encodings);
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
  ): LocalTrackPublication | null {
    // look through all published tracks to find the right ones
    const publication = this.getPublicationForTrack(track);

    log.debug('unpublishTrack', 'unpublishing track', track);

    if (!publication) {
      log.warn(
        'unpublishTrack',
        'track was not unpublished because no publication was found',
        track,
      );
      return null;
    }

    if (track instanceof LocalAudioTrack || track instanceof LocalVideoTrack) {
      track.removeListener(TrackEvent.Muted, this.onTrackMuted);
      track.removeListener(TrackEvent.Unmuted, this.onTrackUnmuted);
    }
    track.stop();

    let mediaStreamTrack: MediaStreamTrack;
    if (track instanceof MediaStreamTrack) {
      mediaStreamTrack = track;
    } else {
      mediaStreamTrack = track.mediaStreamTrack;
    }

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

  get publisherMetrics(): any {
    return null;
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
      destination.forEach((val : any) => {
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

  /** @internal */
  onTrackUnmuted = (track: LocalTrack) => {
    this.onTrackMuted(track, false);
  };

  // when the local track changes in mute status, we'll notify server as such
  /** @internal */
  onTrackMuted = (
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
}

/* @internal */
export const presets169 = [
  VideoPresets.qvga,
  VideoPresets.vga,
  VideoPresets.qhd,
  VideoPresets.hd,
  VideoPresets.fhd,
];

/* @internal */
export const presets43 = [
  VideoPresets43.qvga,
  VideoPresets43.vga,
  VideoPresets43.qhd,
  VideoPresets43.hd,
  VideoPresets43.fhd,
];

/* @internal */
export const presetsScreenShare = [
  ScreenSharePresets.vga,
  ScreenSharePresets.hd_8,
  ScreenSharePresets.hd_15,
  ScreenSharePresets.fhd_15,
  ScreenSharePresets.fhd_30,
];

const videoRids = ['q', 'h', 'f'];

/* @internal */
export function computeVideoEncodings(
  isScreenShare: boolean,
  width?: number,
  height?: number,
  options?: TrackPublishOptions,
): RTCRtpEncodingParameters[] | undefined {
  let videoEncoding: VideoEncoding | undefined = options?.videoEncoding;
  if (isScreenShare) {
    videoEncoding = options?.screenShareEncoding;
  }
  const useSimulcast = !isScreenShare && options?.simulcast;

  if ((!videoEncoding && !useSimulcast) || !width || !height) {
    // don't set encoding when we are not simulcasting and user isn't restricting
    // encoding parameters
    return;
  }

  if (!videoEncoding) {
    // find the right encoding based on width/height
    videoEncoding = determineAppropriateEncoding(isScreenShare, width, height);
    log.debug('using video encoding', videoEncoding);
  }

  if (!useSimulcast) {
    return [videoEncoding];
  }

  const presets = presetsForResolution(isScreenShare, width, height);
  let midPreset: VideoPreset | undefined;
  const lowPreset = presets[0];
  if (presets.length > 1) {
    [,midPreset] = presets;
  }
  const original = new VideoPreset(
    width, height, videoEncoding.maxBitrate, videoEncoding.maxFramerate,
  );

  // NOTE:
  //   1. Ordering of these encodings is important. Chrome seems
  //      to use the index into encodings to decide which layer
  //      to disable when constrained (bandwidth or CPU). So,
  //      encodings should be ordered in increasing spatial
  //      resolution order.
  //   2. ion-sfu translates rids into layers. So, all encodings
  //      should have the base layer `q` and then more added
  //      based on other conditions.
  const size = Math.max(width, height);
  if (size >= 960 && midPreset) {
    return encodingsFromPresets(width, height, [
      lowPreset, midPreset, original,
    ]);
  }
  if (size >= 500) {
    return encodingsFromPresets(width, height, [
      lowPreset, original,
    ]);
  }
  return encodingsFromPresets(width, height, [
    original,
  ]);
}

/* @internal */
export function determineAppropriateEncoding(
  isScreenShare: boolean,
  width: number,
  height: number,
): VideoEncoding {
  const presets = presetsForResolution(isScreenShare, width, height);
  let { encoding } = presets[0];

  // handle portrait by swapping dimensions
  const size = Math.max(width, height);

  for (let i = 0; i < presets.length; i += 1) {
    const preset = presets[i];
    encoding = preset.encoding;
    if (preset.width >= size) {
      break;
    }
  }

  return encoding;
}

/* @internal */
export function presetsForResolution(
  isScreenShare: boolean, width: number, height: number,
): VideoPreset[] {
  if (isScreenShare) {
    return presetsScreenShare;
  }
  const aspect = width > height ? width / height : height / width;
  if (Math.abs(aspect - 16.0 / 9) < Math.abs(aspect - 4.0 / 3)) {
    return presets169;
  }
  return presets43;
}

// presets should be ordered by low, medium, high
function encodingsFromPresets(
  width: number,
  height: number,
  presets: VideoPreset[],
): RTCRtpEncodingParameters[] {
  const encodings: RTCRtpEncodingParameters[] = [];
  presets.forEach((preset, idx) => {
    if (idx >= videoRids.length) {
      return;
    }
    const size = Math.min(width, height);
    const rid = videoRids[idx];
    encodings.push({
      rid,
      scaleResolutionDownBy: size / preset.height,
      maxBitrate: preset.encoding.maxBitrate,
      /* @ts-ignore */
      maxFramerate: preset.encoding.maxFramerate,
    });
  });
  return encodings;
}
