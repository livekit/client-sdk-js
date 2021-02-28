import log from 'loglevel';
import { VideoCodec, VideoEncoding, VideoPresets } from '../../options';
import { TrackInvalidError } from '../errors';
import { ParticipantEvent, TrackEvent } from '../events';
import { RTCEngine } from '../RTCEngine';
import { LocalAudioTrack } from '../track/LocalAudioTrack';
import { LocalAudioTrackPublication } from '../track/LocalAudioTrackPublication';
import { LocalDataTrack } from '../track/LocalDataTrack';
import { LocalDataTrackPublication } from '../track/LocalDataTrackPublication';
import { LocalTrackPublication } from '../track/LocalTrackPublication';
import { LocalVideoTrack } from '../track/LocalVideoTrack';
import { LocalVideoTrackPublication } from '../track/LocalVideoTrackPublication';
import { TrackPublishOptions } from '../track/options';
import { Track } from '../track/Track';
import { LocalTrack } from '../track/types';
import { Participant } from './Participant';

const simulcastMinWidth = 200;

export class LocalParticipant extends Participant {
  private engine: RTCEngine;

  /** @internal */
  constructor(sid: string, identity: string, engine: RTCEngine) {
    super(sid, identity);
    this.engine = engine;
  }

  /**
   * Publish a new track to the room
   * @param track
   * @param options
   */
  async publishTrack(
    track: LocalTrack | MediaStreamTrack,
    options?: TrackPublishOptions
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
            `unsupported MediaStreamTrack kind ${track.kind}`
          );
      }
    }

    // is it already published? if so skip
    let existingPublication: LocalTrackPublication | undefined;
    this.tracks.forEach((publication) => {
      if (publication.track === track) {
        existingPublication = <LocalTrackPublication>publication;
      }
    });

    if (existingPublication) return existingPublication;

    // forward mute/unmute events
    track.on(TrackEvent.Muted, this.onTrackMuted);
    track.on(TrackEvent.Unmuted, this.onTrackUnmuted);

    // get local track id for use during publishing
    let cid: string;
    if (track instanceof LocalDataTrack) {
      // use data channel name as the id
      cid = track.name;
    } else {
      cid = track.mediaStreamTrack.id;
    }

    // create track publication from track
    let publication: LocalTrackPublication;

    const ti = await this.engine.addTrack(cid, track.name, track.kind);
    switch (track.kind) {
      case Track.Kind.Audio:
        const audioPublication = new LocalAudioTrackPublication(
          <LocalAudioTrack>track,
          ti
        );
        this.audioTracks.set(ti.sid, audioPublication);
        publication = audioPublication;
        break;
      case Track.Kind.Video:
        const videoPublication = new LocalVideoTrackPublication(
          <LocalVideoTrack>track,
          ti
        );
        this.videoTracks.set(ti.sid, videoPublication);
        publication = videoPublication;
        break;
      case Track.Kind.Data:
        const dataPublication = new LocalDataTrackPublication(
          <LocalDataTrack>track,
          ti
        );
        this.dataTracks.set(ti.sid, dataPublication);
        publication = dataPublication;
        break;
      default:
        // impossible
        throw new TrackInvalidError();
    }

    if (track instanceof LocalDataTrack) {
      // add data track
      track.dataChannel = this.engine.publisher.pc.createDataChannel(
        track.name,
        track.dataChannelInit
      );
    } else {
      let encodings: RTCRtpEncodingParameters[] | undefined = undefined;
      // for video
      if (track.kind === Track.Kind.Video) {
        const settings = track.mediaStreamTrack.getSettings();
        encodings = this.computeVideoEncodings(
          settings.width,
          settings.height,
          options
        );
      }

      const transceiver = this.engine.publisher.pc.addTransceiver(
        track.mediaStreamTrack,
        {
          direction: 'sendonly',
          sendEncodings: encodings,
        }
      );

      // store RTPSender
      track.sender = transceiver.sender;
      if (track instanceof LocalVideoTrack) {
        track.startMonitor();
      }

      this.setPreferredCodec(transceiver, track.kind, options?.videoCodec);
    }

    this.tracks.set(ti.sid, publication);

    // send event for publication
    this.emit(ParticipantEvent.TrackPublished, publication);
    return publication;
  }

  unpublishTrack(
    track: LocalTrack | MediaStreamTrack
  ): LocalTrackPublication | null {
    // look through all published tracks to find the right ones
    let publication = this.getPublicationForTrack(track);

    log.debug('unpublishTrack', 'unpublishing track', track);

    // TODO: add logging

    if (!publication) {
      log.warn(
        'unpublishTrack',
        'track was not unpublished because no publication was found',
        track
      );
      return null;
    }

    if (track instanceof LocalAudioTrack || track instanceof LocalVideoTrack) {
      track.removeListener(TrackEvent.Muted, this.onTrackMuted);
      track.removeListener(TrackEvent.Unmuted, this.onTrackUnmuted);
    }
    track.stop();

    if (!(track instanceof LocalDataTrack)) {
      let mediaStreamTrack: MediaStreamTrack;
      if (track instanceof MediaStreamTrack) {
        mediaStreamTrack = track;
      } else {
        mediaStreamTrack = track.mediaStreamTrack;
      }

      const senders = this.engine.publisher.pc.getSenders();
      senders.forEach((sender) => {
        if (sender.track === mediaStreamTrack) {
          this.engine.publisher.pc.removeTrack(sender);
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
      case Track.Kind.Data:
        this.dataTracks.delete(publication.trackSid);
        break;
    }

    return publication;
  }

  unpublishTracks(
    tracks: LocalTrack[] | MediaStreamTrack[]
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

  /** @internal */
  onTrackUnmuted = (track: LocalVideoTrack | LocalAudioTrack) => {
    this.onTrackMuted(track, false);
  };

  // when the local track changes in mute status, we'll notify server as such
  /** @internal */
  onTrackMuted = (
    track: LocalVideoTrack | LocalAudioTrack,
    muted?: boolean
  ) => {
    if (muted === undefined) {
      muted = true;
    }
    // find the track's publication and use sid there
    let sid: string | undefined;
    this.tracks.forEach((publication) => {
      const localPub = <LocalTrackPublication>publication;
      if (track === localPub.track) {
        sid = localPub.trackSid;
      }
    });

    if (!sid) {
      log.error('could not update mute status for unpublished track', track);
      return;
    }

    this.engine.updateMuteStatus(sid, muted);
  };

  private getPublicationForTrack(
    track: LocalTrack | MediaStreamTrack
  ): LocalTrackPublication | undefined {
    let publication: LocalTrackPublication | undefined;
    for (const pub of this.tracks.values()) {
      let localTrack: LocalTrack | undefined;
      if (
        pub instanceof LocalAudioTrackPublication ||
        pub instanceof LocalVideoTrackPublication ||
        pub instanceof LocalDataTrackPublication
      ) {
        localTrack = pub.track;
      }
      if (!localTrack) continue;

      // this looks overly complicated due to this object tree
      if (track instanceof MediaStreamTrack) {
        if (
          localTrack instanceof LocalAudioTrack ||
          localTrack instanceof LocalVideoTrack
        ) {
          if (localTrack.mediaStreamTrack === track) {
            publication = publication = <LocalTrackPublication>pub;
            break;
          }
        }
      } else if (track === localTrack) {
        publication = <LocalTrackPublication>pub;
        break;
      }
    }
    return publication;
  }

  private setPreferredCodec(
    transceiver: RTCRtpTransceiver,
    kind: Track.Kind,
    videoCodec: VideoCodec = 'vp8'
  ) {
    const cap = RTCRtpSender.getCapabilities(kind);
    if (!cap) return;
    const selected = cap.codecs.find(
      (c) =>
        c.mimeType.toLowerCase() === `video/${videoCodec}` ||
        c.mimeType.toLowerCase() === 'audio/opus'
    );
    if (selected && 'setCodecPreferences' in transceiver) {
      transceiver.setCodecPreferences([selected]);
    }
  }

  private computeVideoEncodings(
    width?: number,
    height?: number,
    options?: TrackPublishOptions
  ): RTCRtpEncodingParameters[] {
    let encodings: RTCRtpEncodingParameters[];

    let videoEncoding: VideoEncoding | undefined = options?.videoEncoding;

    if (!videoEncoding) {
      // find the right encoding based on width/height
      videoEncoding = this.determineAppropriateEncoding(width, height);
    }

    if (options?.simulcast && width && height) {
      encodings = [
        {
          rid: 'f',
          maxBitrate: videoEncoding.maxBitrate,
          maxFramerate: videoEncoding.maxFramerate,
        },
      ];
      let scaledWidth = width / 2;
      if (scaledWidth >= simulcastMinWidth) {
        encodings.push({
          rid: 'h',
          scaleResolutionDownBy: 2.0,
          maxBitrate: videoEncoding.maxBitrate / 3.5,
          maxFramerate: videoEncoding.maxFramerate,
        });
      }
      scaledWidth = width / 4;
      if (scaledWidth >= simulcastMinWidth) {
        encodings.push({
          rid: 'q',
          scaleResolutionDownBy: 4.0,
          maxBitrate: videoEncoding.maxBitrate / 7,
          maxFramerate: videoEncoding.maxFramerate,
        });
      }
    } else {
      encodings = [videoEncoding];
    }

    return encodings;
  }

  private orderedPresets = [
    VideoPresets.qvga,
    VideoPresets.vga,
    VideoPresets.qhd,
    VideoPresets.hd,
    VideoPresets.fhd,
  ];

  private determineAppropriateEncoding(
    width?: number,
    height?: number
  ): VideoEncoding {
    let encoding = VideoPresets.vga.encoding;

    if (width && height) {
      for (let i = 0; i < this.orderedPresets.length; i++) {
        const preset = this.orderedPresets[i];
        if (
          width >= parseLongConstraint(preset.resolution.width) &&
          height >= parseLongConstraint(preset.resolution.height)
        ) {
          encoding = preset.encoding;
        }
      }
    }

    return encoding;
  }
}

function parseLongConstraint(constrain: ConstrainULong): number {
  if (typeof constrain === 'number') {
    return constrain;
  } else {
    return (
      constrain.exact || constrain.ideal || constrain.min || constrain.max || 0
    );
  }
}
