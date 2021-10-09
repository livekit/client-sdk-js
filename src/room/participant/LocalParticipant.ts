import log from 'loglevel';
import { DataPacket, DataPacket_Kind } from '../../proto/livekit_models';
import { AddTrackRequest } from '../../proto/livekit_rtc';
import {
  TrackInvalidError,
  UnexpectedConnectionState,
} from '../errors';
import { EngineEvent, ParticipantEvent, TrackEvent } from '../events';
import RTCEngine from '../RTCEngine';
import LocalAudioTrack from '../track/LocalAudioTrack';
import LocalTrack from '../track/LocalTrack';
import LocalTrackPublication from '../track/LocalTrackPublication';
import LocalVideoTrack from '../track/LocalVideoTrack';
import {
  TrackPublishOptions,
  VideoCodec,
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

  /**
   * Publish a new track to the room
   * @param track
   * @param options
   */
  async publishTrack(
    track: LocalTrack | MediaStreamTrack,
    options?: TrackPublishOptions,
  ): Promise<LocalTrackPublication> {
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

    // handle track actions
    track.on(TrackEvent.Muted, this.onTrackMuted);
    track.on(TrackEvent.Unmuted, this.onTrackUnmuted);
    track.mediaStreamTrack.addEventListener('ended', () => {
      this.unpublishTrack(track);
    });

    // get local track id for use during publishing
    const cid = track.mediaStreamTrack.id;

    // create track publication from track
    const req = AddTrackRequest.fromPartial({
      cid,
      name: track.name,
      type: Track.kindToProto(track.kind),
      muted: track.isMuted,
      disableDtx: !(options?.audioOptimizeBandwidth ?? true),
    });
    if (track.dimensions) {
      req.width = track.dimensions.width;
      req.height = track.dimensions.height;
    }
    console.error('req: ', req);	// REMOVE
    const ti = await this.engine.addTrack(req);
    const publication = new LocalTrackPublication(track.kind, ti, track);
    track.sid = ti.sid;

    let encodings: RTCRtpEncodingParameters[] | undefined;
    // for video
    if (track.kind === Track.Kind.Video) {
      // TODO: support react native, which doesn't expose getSettings
      const settings = track.mediaStreamTrack.getSettings();
      encodings = this.computeVideoEncodings(
        settings.width,
        settings.height,
        options,
      );
    } else if (track.kind === Track.Kind.Audio && options?.audioBitrate) {
      encodings = [
        {
          maxBitrate: options?.audioBitrate,
        },
      ];
    }

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

    if (options?.videoCodec) {
      this.setPreferredCodec(transceiver, track.kind, options.videoCodec);
    }
    this.addTrackPublication(publication);

    // send event for publication
    this.emit(ParticipantEvent.TrackPublished, publication);
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

  private computeVideoEncodings(
    width?: number,
    height?: number,
    options?: TrackPublishOptions,
  ): RTCRtpEncodingParameters[] | undefined {
    let encodings: RTCRtpEncodingParameters[];

    let videoEncoding: VideoEncoding | undefined = options?.videoEncoding;

    if ((!videoEncoding && !options?.simulcast) || !width || !height) {
      // don't set encoding when we are not simulcasting and user isn't restricting
      // encoding parameters
      return undefined;
    }

    if (!videoEncoding) {
      // find the right encoding based on width/height
      videoEncoding = this.determineAppropriateEncoding(width, height);
      log.debug('using video encoding', videoEncoding);
    }

    if (options?.simulcast) {
      encodings = [
        {
          rid: 'f',
          maxBitrate: videoEncoding.maxBitrate,
          /* @ts-ignore */
          maxFramerate: videoEncoding.maxFramerate,
        },
      ];

      const presets = this.presetsForResolution(width, height);
      const midPreset = presets[1];
      const lowPreset = presets[0];
      // if resolution is high enough, we would send both h and q res..
      // otherwise only send h
      if (width >= 960) {
        encodings.push({
          rid: 'h',
          scaleResolutionDownBy: height / midPreset.height,
          maxBitrate: midPreset.encoding.maxBitrate,
          /* @ts-ignore */
          maxFramerate: midPreset.encoding.maxFramerate,
        });
        encodings.push({
          rid: 'q',
          scaleResolutionDownBy: height / lowPreset.height,
          maxBitrate: lowPreset.encoding.maxBitrate,
          /* @ts-ignore */
          maxFramerate: lowPreset.encoding.maxFramerate,
        });
      } else {
        encodings.push({
          rid: 'h',
          scaleResolutionDownBy: height / lowPreset.height,
          maxBitrate: lowPreset.encoding.maxBitrate,
          /* @ts-ignore */
          maxFramerate: lowPreset.encoding.maxFramerate,
        });
      }
    } else {
      encodings = [videoEncoding];
    }

    return encodings;
  }

  private presets169 = [
    VideoPresets.qvga,
    VideoPresets.vga,
    VideoPresets.qhd,
    VideoPresets.hd,
    VideoPresets.fhd,
  ];

  private presets43 = [
    VideoPresets43.qvga,
    VideoPresets43.vga,
    VideoPresets43.qhd,
    VideoPresets43.hd,
    VideoPresets43.fhd,
  ];

  private determineAppropriateEncoding(
    width: number,
    height: number,
  ): VideoEncoding {
    const presets = this.presetsForResolution(width, height);
    let { encoding } = presets[0];

    for (let i = 0; i < presets.length; i += 1) {
      const preset = presets[i];
      if (width >= preset.width && height >= preset.height) {
        encoding = preset.encoding;
      }
    }

    return encoding;
  }

  private presetsForResolution(width: number, height: number): VideoPreset[] {
    const aspect = width / height;
    if (Math.abs(aspect - 16.0 / 9) < Math.abs(aspect - 4.0 / 3)) {
      return this.presets169;
    }
    return this.presets43;
  }
}
