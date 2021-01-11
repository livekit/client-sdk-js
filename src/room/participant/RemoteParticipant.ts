import log from 'loglevel';
import { ParticipantInfo, TrackInfo, TrackType } from '../../proto/model';
import { TrackInvalidError } from '../errors';
import { ParticipantEvent, TrackEvent } from '../events';
import { RemoteAudioTrack } from '../track/RemoteAudioTrack';
import { RemoteAudioTrackPublication } from '../track/RemoteAudioTrackPublication';
import { RemoteDataTrack } from '../track/RemoteDataTrack';
import { RemoteDataTrackPublication } from '../track/RemoteDataTrackPublication';
import { RemoteTrackPublication } from '../track/RemoteTrackPublication';
import { RemoteVideoTrack } from '../track/RemoteVideoTrack';
import { RemoteVideoTrackPublication } from '../track/RemoteVideoTrackPublication';
import { Track } from '../track/Track';
import {
  createRemoteTrackPublicationFromInfo,
  RemoteTrack,
} from '../track/types';
import { Participant } from './Participant';

export class RemoteParticipant extends Participant {
  private participantInfo?: ParticipantInfo;
  tracks: { [key: string]: RemoteTrackPublication } = {};

  static fromParticipantInfo(pi: ParticipantInfo): RemoteParticipant {
    const rp = new RemoteParticipant(pi.sid, pi.name);
    rp.updateMetadata(pi);
    return rp;
  }

  constructor(id: string, name?: string) {
    super(id, name || '');
  }

  addSubscribedMediaTrack(
    mediaTrack: MediaStreamTrack,
    sid: Track.SID
  ): RemoteTrackPublication {
    const isVideo = mediaTrack.kind === 'video';
    let track: RemoteTrack;
    if (isVideo) {
      track = new RemoteVideoTrack(mediaTrack, sid);
    } else {
      track = new RemoteAudioTrack(mediaTrack, sid);
    }

    // find the track publication or create one
    // it's possible for the media track to arrive before participant info
    let publication = this.getTrackPublication(sid);

    if (!publication) {
      const info: TrackInfo = {
        sid: sid,
        name: mediaTrack.label,
        type: Track.kindToProto(track.kind),
        muted: false,
      };
      switch (track.kind) {
        case Track.Kind.Audio:
          publication = new RemoteAudioTrackPublication(
            info,
            <RemoteAudioTrack>track
          );
          break;
        case Track.Kind.Video:
          publication = new RemoteVideoTrackPublication(
            info,
            <RemoteVideoTrack>track
          );
          break;
        default:
          throw new TrackInvalidError();
      }

      this.addTrackPublication(publication);
      // only send this after metadata is filled in, which indicates the track
      // is published AFTER client connected to room
      if (this.hasMetadata) {
        this.emit(ParticipantEvent.TrackPublished, publication);
      }
    } else {
      publication.track = track;
      // set track name etc
      track.name = publication.trackName;
      track.sid = publication.trackSid;
    }

    // when media track is ended, fire the event
    mediaTrack.onended = (ev) => {
      this.emit(ParticipantEvent.TrackUnsubscribed, track, publication);
    };
    this.emit(ParticipantEvent.TrackSubscribed, track, publication);

    return publication;
  }

  addSubscribedDataTrack(
    dataChannel: RTCDataChannel,
    sid: Track.SID,
    name: string
  ): RemoteTrackPublication {
    const track = new RemoteDataTrack(sid, name, dataChannel);
    let publication = this.getTrackPublication(sid);

    if (!publication) {
      publication = new RemoteDataTrackPublication(
        {
          sid: sid,
          name: name,
          type: TrackType.DATA,
          muted: false,
        },
        track
      );
      this.addTrackPublication(publication);

      // only send this after metadata is filled in, which indicates the track
      // is published AFTER client connected to room
      if (this.hasMetadata) {
        this.emit(ParticipantEvent.TrackPublished, publication);
      }
    } else {
      publication.track = track;
    }

    track.on(TrackEvent.Message, (data: any) => {
      // forward this
      this.emit(ParticipantEvent.TrackMessage, data, track);
    });

    dataChannel.onclose = (ev) => {
      this.emit(ParticipantEvent.TrackUnsubscribed, track, publication);
    };
    this.emit(ParticipantEvent.TrackSubscribed, track, publication);

    return publication;
  }

  get hasMetadata(): boolean {
    return !!this.participantInfo;
  }

  getTrackPublication(sid: Track.SID): RemoteTrackPublication | null {
    return <RemoteTrackPublication>this.tracks[sid];
  }

  updateMetadata(info: ParticipantInfo) {
    const alreadyHasMetadata = this.hasMetadata;

    this.name = info.name;
    this.sid = info.sid;
    this.participantInfo = info;

    // we are getting a list of all available tracks, reconcile in here
    // and send out events for changes

    // reconcile track publications, publish events only if metadata is already there
    // i.e. changes since the local participant has joined
    const validTracks: { [key: string]: RemoteTrackPublication } = {};
    const newTracks: { [key: string]: RemoteTrackPublication } = {};

    info.tracks.forEach((ti) => {
      let publication = this.getTrackPublication(ti.sid);
      if (!publication) {
        // new publication
        publication = createRemoteTrackPublicationFromInfo(ti);
        newTracks[ti.sid] = publication;
        this.addTrackPublication(publication);
      } else {
        publication.updateMetadata(ti);
      }
      validTracks[ti.sid] = publication;
    });

    // send new tracks
    if (alreadyHasMetadata) {
      Object.keys(newTracks).forEach((sid) => {
        const publication = newTracks[sid];
        this.emit(ParticipantEvent.TrackPublished, publication);
      });
    }

    // detect removed tracks
    Object.keys(this.tracks).forEach((sid) => {
      if (!validTracks[sid]) {
        this.unpublishTrack(sid, true);
      }
    });
  }

  unpublishTrack(sid: Track.SID, sendEvents?: boolean) {
    const publication = <RemoteTrackPublication>this.tracks[sid];
    if (!publication) {
      return;
    }

    delete this.tracks[sid];

    // remove from the right type map
    switch (publication.kind) {
      case Track.Kind.Audio:
        delete this.audioTracks[sid];
        break;
      case Track.Kind.Video:
        delete this.videoTracks[sid];
        break;
      case Track.Kind.Data:
        delete this.dataTracks[sid];
        break;
    }

    // also send unsubscribe, if track is actively subscribed
    if (publication.track) {
      publication.track.stop();
      if (sendEvents)
        this.emit(ParticipantEvent.TrackUnsubscribed, publication);
    }
    if (sendEvents) this.emit(ParticipantEvent.TrackUnpublished, publication);
  }

  emit(event: string | symbol, ...args: any[]): boolean {
    log.debug('participant event', this.sid, event, ...args);
    return super.emit(event, ...args);
  }
}
