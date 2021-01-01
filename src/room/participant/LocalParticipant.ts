import log from 'loglevel';
import { TrackInfo } from '../../proto/model';
import { TrackInvalidError } from '../errors';
import { EngineEvent, ParticipantEvent, TrackEvent } from '../events';
import { RTCEngine } from '../RTCEngine';
import { LocalAudioTrack } from '../track/LocalAudioTrack';
import { LocalAudioTrackPublication } from '../track/LocalAudioTrackPublication';
import { LocalDataTrack } from '../track/LocalDataTrack';
import { LocalDataTrackPublication } from '../track/LocalDataTrackPublication';
import { LocalTrackPublication } from '../track/LocalTrackPublication';
import { LocalVideoTrack } from '../track/LocalVideoTrack';
import { LocalVideoTrackPublication } from '../track/LocalVideoTrackPublication';
import { LocalTrackOptions } from '../track/options';
import { Track } from '../track/Track';
import { LocalTrack } from '../track/types';
import { Participant } from './Participant';

export class LocalParticipant extends Participant {
  engine: RTCEngine;

  constructor(sid: string, name: string, engine: RTCEngine) {
    super(sid, name);
    this.engine = engine;
  }

  publishTrack(
    track: LocalTrack | MediaStreamTrack,
    options?: LocalTrackOptions
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

    track.on(TrackEvent.Muted, this.onTrackMuted);
    track.on(TrackEvent.Unmuted, this.onTrackUnmuted);

    // create track publication from track
    let publication: LocalTrackPublication;

    return new Promise<LocalTrackPublication>((resolve, reject) => {
      this.engine.once(EngineEvent.LocalTrackPublished, (ti: TrackInfo) => {
        switch (track.kind) {
          case Track.Kind.Audio:
            const audioPublication = new LocalAudioTrackPublication(
              <LocalAudioTrack>track,
              ti
            );
            this.audioTracks[ti.sid] = audioPublication;
            publication = audioPublication;
            break;
          case Track.Kind.Video:
            const videoPublication = new LocalVideoTrackPublication(
              <LocalVideoTrack>track,
              ti
            );
            this.videoTracks[ti.sid] = videoPublication;
            publication = videoPublication;
            break;
          case Track.Kind.Data:
            const dataPublication = new LocalDataTrackPublication(
              <LocalDataTrack>track,
              ti
            );
            this.dataTracks[ti.sid] = dataPublication;
            publication = dataPublication;
            break;
          default:
            // impossible
            throw new TrackInvalidError();
        }

        this.tracks[ti.sid] = publication;

        // send event for publication
        this.emit(ParticipantEvent.TrackPublished, publication);
        resolve(publication);
      });

      const localTrack = <LocalTrack>track;
      if (localTrack instanceof LocalDataTrack) {
        // add data track
        localTrack.dataChannel = this.engine.peerConn.createDataChannel(
          localTrack.name,
          localTrack.dataChannelInit
        );
      } else {
        this.engine.peerConn.addTrack(localTrack.mediaStreamTrack);
      }
    });
  }

  async publishTracks(
    tracks: LocalTrack[] | MediaStreamTrack[]
  ): Promise<Array<LocalTrackPublication>> {
    const publications: LocalTrackPublication[] = [];

    for (const track of tracks) {
      const publication = await this.publishTrack(track);
      publications.push(publication);
    }

    return publications;
  }

  unpublishTrack(
    track: LocalTrack | MediaStreamTrack
  ): LocalTrackPublication | null {
    // look through all published tracks
    let publication: LocalTrackPublication | undefined;
    for (const pub of Object.values(this.tracks)) {
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

    if (!publication) {
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

      const senders = this.engine.peerConn.getSenders();
      senders.forEach((sender) => {
        if (sender.track === mediaStreamTrack) {
          this.engine.peerConn.removeTrack(sender);
        }
      });
    }

    // remove from our maps
    delete this.tracks[publication.trackSid];
    switch (publication.kind) {
      case Track.Kind.Audio:
        delete this.audioTracks[publication.trackSid];
        break;
      case Track.Kind.Video:
        delete this.videoTracks[publication.trackSid];
        break;
      case Track.Kind.Data:
        delete this.dataTracks[publication.trackSid];
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

  onTrackUnmuted = (track: LocalVideoTrack | LocalAudioTrack) => {
    this.onTrackMuted(track, false);
  };

  // when the local track changes in mute status, we'll notify server as such
  onTrackMuted = (
    track: LocalVideoTrack | LocalAudioTrack,
    muted?: boolean
  ) => {
    if (muted === undefined) {
      muted = true;
    }
    // find the track's publication and use sid there
    let sid: string | undefined;
    Object.values(this.tracks).forEach((publication) => {
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
}
