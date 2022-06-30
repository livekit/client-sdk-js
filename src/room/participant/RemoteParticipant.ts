import { SignalClient } from '../../api/SignalClient';
import log from '../../logger';
import { ParticipantInfo } from '../../proto/livekit_models';
import { UpdateSubscription, UpdateTrackSettings } from '../../proto/livekit_rtc';
import { ParticipantEvent, TrackEvent } from '../events';
import RemoteAudioTrack from '../track/RemoteAudioTrack';
import RemoteTrackPublication from '../track/RemoteTrackPublication';
import RemoteVideoTrack from '../track/RemoteVideoTrack';
import { Track } from '../track/Track';
import { AdaptiveStreamSettings, RemoteTrack } from '../track/types';
import Participant, { ParticipantEventCallbacks } from './Participant';

export default class RemoteParticipant extends Participant {
  audioTracks: Map<string, RemoteTrackPublication>;

  videoTracks: Map<string, RemoteTrackPublication>;

  tracks: Map<string, RemoteTrackPublication>;

  signalClient: SignalClient;

  private volume?: number;

  /** @internal */
  static fromParticipantInfo(signalClient: SignalClient, pi: ParticipantInfo): RemoteParticipant {
    return new RemoteParticipant(signalClient, pi.sid, pi.identity);
  }

  /** @internal */
  constructor(signalClient: SignalClient, id: string, name?: string) {
    super(id, name || '');
    this.signalClient = signalClient;
    this.tracks = new Map();
    this.audioTracks = new Map();
    this.videoTracks = new Map();
  }

  protected addTrackPublication(publication: RemoteTrackPublication) {
    super.addTrackPublication(publication);

    // register action events
    publication.on(TrackEvent.UpdateSettings, (settings: UpdateTrackSettings) => {
      log.debug('send update settings', settings);
      this.signalClient.sendUpdateTrackSettings(settings);
    });
    publication.on(TrackEvent.UpdateSubscription, (sub: UpdateSubscription) => {
      sub.participantTracks.forEach((pt) => {
        pt.participantSid = this.sid;
      });
      this.signalClient.sendUpdateSubscription(sub);
    });
    publication.on(TrackEvent.Ended, (track: RemoteTrack) => {
      this.emit(ParticipantEvent.TrackUnsubscribed, track, publication);
    });
  }

  getTrack(source: Track.Source): RemoteTrackPublication | undefined {
    const track = super.getTrack(source);
    if (track) {
      return track as RemoteTrackPublication;
    }
  }

  getTrackByName(name: string): RemoteTrackPublication | undefined {
    const track = super.getTrackByName(name);
    if (track) {
      return track as RemoteTrackPublication;
    }
  }

  /**
   * sets the volume on the participant's microphone track
   * if no track exists the volume will be applied when the microphone track is added
   */
  setVolume(volume: number) {
    this.volume = volume;
    const audioPublication = this.getTrack(Track.Source.Microphone);
    if (audioPublication && audioPublication.track) {
      (audioPublication.track as RemoteAudioTrack).setVolume(volume);
    }
  }

  /**
   * gets the volume on the participant's microphone track
   */
  getVolume() {
    const audioPublication = this.getTrack(Track.Source.Microphone);
    if (audioPublication && audioPublication.track) {
      return (audioPublication.track as RemoteAudioTrack).getVolume();
    }
    return this.volume;
  }

  /** @internal */
  addSubscribedMediaTrack(
    mediaTrack: MediaStreamTrack,
    sid: Track.SID,
    mediaStream: MediaStream,
    receiver?: RTCRtpReceiver,
    adaptiveStreamSettings?: AdaptiveStreamSettings,
    triesLeft?: number,
  ) {
    // find the track publication
    // it's possible for the media track to arrive before participant info
    let publication = this.getTrackPublication(sid);

    // it's also possible that the browser didn't honor our original track id
    // FireFox would use its own local uuid instead of server track id
    if (!publication) {
      if (!sid.startsWith('TR')) {
        // find the first track that matches type
        this.tracks.forEach((p) => {
          if (!publication && mediaTrack.kind === p.kind.toString()) {
            publication = p;
          }
        });
      }
    }

    // when we couldn't locate the track, it's possible that the metadata hasn't
    // yet arrived. Wait a bit longer for it to arrive, or fire an error
    if (!publication) {
      if (triesLeft === 0) {
        log.error('could not find published track', { participant: this.sid, trackSid: sid });
        this.emit(ParticipantEvent.TrackSubscriptionFailed, sid);
        return;
      }

      if (triesLeft === undefined) triesLeft = 20;
      setTimeout(() => {
        this.addSubscribedMediaTrack(
          mediaTrack,
          sid,
          mediaStream,
          receiver,
          adaptiveStreamSettings,
          triesLeft! - 1,
        );
      }, 150);
      return;
    }

    const isVideo = mediaTrack.kind === 'video';
    let track: RemoteTrack;
    if (isVideo) {
      track = new RemoteVideoTrack(mediaTrack, sid, receiver, adaptiveStreamSettings);
    } else {
      track = new RemoteAudioTrack(mediaTrack, sid, receiver);
    }

    // set track info
    track.source = publication.source;
    // keep publication's muted status
    track.isMuted = publication.isMuted;
    track.setMediaStream(mediaStream);
    track.start();

    publication.setTrack(track);
    // subscription means participant has permissions to subscribe
    publication._allowed = true;
    // set participant volume on new microphone tracks
    if (
      this.volume !== undefined &&
      track instanceof RemoteAudioTrack &&
      track.source === Track.Source.Microphone
    ) {
      track.setVolume(this.volume);
    }
    this.emit(ParticipantEvent.TrackSubscribed, track, publication);

    return publication;
  }

  /** @internal */
  get hasMetadata(): boolean {
    return !!this.participantInfo;
  }

  getTrackPublication(sid: Track.SID): RemoteTrackPublication | undefined {
    return this.tracks.get(sid);
  }

  /** @internal */
  updateInfo(info: ParticipantInfo) {
    super.updateInfo(info);

    // we are getting a list of all available tracks, reconcile in here
    // and send out events for changes

    // reconcile track publications, publish events only if metadata is already there
    // i.e. changes since the local participant has joined
    const validTracks = new Map<string, RemoteTrackPublication>();
    const newTracks = new Map<string, RemoteTrackPublication>();

    info.tracks.forEach((ti) => {
      let publication = this.getTrackPublication(ti.sid);
      if (!publication) {
        // new publication
        const kind = Track.kindFromProto(ti.type);
        if (!kind) {
          return;
        }
        publication = new RemoteTrackPublication(kind, ti.sid, ti.name);
        publication.updateInfo(ti);
        newTracks.set(ti.sid, publication);
        this.addTrackPublication(publication);
      } else {
        publication.updateInfo(ti);
      }
      validTracks.set(ti.sid, publication);
    });

    // always emit events for new publications, Room will not forward them unless it's ready
    newTracks.forEach((publication) => {
      this.emit(ParticipantEvent.TrackPublished, publication);
    });

    // detect removed tracks
    this.tracks.forEach((publication) => {
      if (!validTracks.has(publication.trackSid)) {
        log.trace('detected removed track on remote participant, unpublishing', {
          publication,
          participantSid: this.sid,
        });
        this.unpublishTrack(publication.trackSid, true);
      }
    });
  }

  /** @internal */
  unpublishTrack(sid: Track.SID, sendUnpublish?: boolean) {
    const publication = <RemoteTrackPublication>this.tracks.get(sid);
    if (!publication) {
      return;
    }

    this.tracks.delete(sid);

    // remove from the right type map
    switch (publication.kind) {
      case Track.Kind.Audio:
        this.audioTracks.delete(sid);
        break;
      case Track.Kind.Video:
        this.videoTracks.delete(sid);
        break;
      default:
        break;
    }

    // also send unsubscribe, if track is actively subscribed
    const { track } = publication;
    if (track) {
      const { isSubscribed } = publication;
      track.stop();
      publication.setTrack(undefined);
      // always send unsubscribed, since apps may rely on this
      if (isSubscribed) {
        this.emit(ParticipantEvent.TrackUnsubscribed, track, publication);
      }
    }
    if (sendUnpublish) {
      this.emit(ParticipantEvent.TrackUnpublished, publication);
    }
  }

  /** @internal */
  emit<E extends keyof ParticipantEventCallbacks>(
    event: E,
    ...args: Parameters<ParticipantEventCallbacks[E]>
  ): boolean {
    log.trace('participant event', { participant: this.sid, event, args });
    return super.emit(event, ...args);
  }
}
