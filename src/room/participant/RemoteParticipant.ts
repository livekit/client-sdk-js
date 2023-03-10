import type { SignalClient } from '../../api/SignalClient';
import log from '../../logger';
import type { ParticipantInfo } from '../../proto/livekit_models';
import type { UpdateSubscription, UpdateTrackSettings } from '../../proto/livekit_rtc';
import { ParticipantEvent, TrackEvent } from '../events';
import type { AudioOutputOptions } from '../track/options';
import RemoteAudioTrack from '../track/RemoteAudioTrack';
import type RemoteTrack from '../track/RemoteTrack';
import RemoteTrackPublication from '../track/RemoteTrackPublication';
import RemoteVideoTrack from '../track/RemoteVideoTrack';
import { Track } from '../track/Track';
import type { TrackPublication } from '../track/TrackPublication';
import type { AdaptiveStreamSettings } from '../track/types';
import Participant, { ParticipantEventCallbacks } from './Participant';

export default class RemoteParticipant extends Participant {
  audioTracks: Map<string, RemoteTrackPublication>;

  videoTracks: Map<string, RemoteTrackPublication>;

  tracks: Map<string, RemoteTrackPublication>;

  signalClient: SignalClient;

  private volume?: number;

  private audioContext?: AudioContext;

  private audioOutput?: AudioOutputOptions;

  /** @internal */
  static fromParticipantInfo(signalClient: SignalClient, pi: ParticipantInfo): RemoteParticipant {
    return new RemoteParticipant(signalClient, pi.sid, pi.identity, pi.name, pi.metadata);
  }

  /** @internal */
  constructor(
    signalClient: SignalClient,
    sid: string,
    identity?: string,
    name?: string,
    metadata?: string,
  ) {
    super(sid, identity || '', name, metadata);
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
    publication.on(
      TrackEvent.SubscriptionPermissionChanged,
      (status: TrackPublication.PermissionStatus) => {
        this.emit(ParticipantEvent.TrackSubscriptionPermissionChanged, publication, status);
      },
    );
    publication.on(
      TrackEvent.SubscriptionStatusChanged,
      (status: TrackPublication.SubscriptionStatus) => {
        this.emit(ParticipantEvent.TrackSubscriptionStatusChanged, publication, status);
      },
    );
    publication.on(TrackEvent.Subscribed, (track: RemoteTrack) => {
      this.emit(ParticipantEvent.TrackSubscribed, track, publication);
    });
    publication.on(TrackEvent.Unsubscribed, (previousTrack: RemoteTrack) => {
      this.emit(ParticipantEvent.TrackUnsubscribed, previousTrack, publication);
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
  addMuxAudioTrack(
    track: RemoteAudioTrack,
    sid: Track.SID,
  ) {
    let publication = this.getTrackPublication(sid);
    if (!publication) {
      log.error('could not find published track', { participant: this.sid, trackSid: sid });
      this.emit(ParticipantEvent.TrackSubscriptionFailed, sid);
      return;
    }
    track.source = publication.source;
    // keep publication's muted status
    track.isMuted = publication.isMuted;
    track.start();

    publication.setTrack(track);
    // set participant volume on new microphone tracks
    if (
      this.volume !== undefined &&
      track instanceof RemoteAudioTrack &&
      track.source === Track.Source.Microphone
    ) {
      track.setVolume(this.volume);
    }

    return publication;
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

    if (mediaTrack.readyState === 'ended') {
      log.error(
        'unable to subscribe because MediaStreamTrack is ended. Do not call MediaStreamTrack.stop()',
        { participant: this.sid, trackSid: sid },
      );
      this.emit(ParticipantEvent.TrackSubscriptionFailed, sid);
      return;
    }

    const isVideo = mediaTrack.kind === 'video';
    let track: RemoteTrack;
    if (isVideo) {
      track = new RemoteVideoTrack(mediaTrack, sid, receiver, adaptiveStreamSettings);
    } else {
      track = new RemoteAudioTrack(mediaTrack, sid, receiver, this.audioContext, this.audioOutput);
    }

    // set track info
    track.source = publication.source;
    // keep publication's muted status
    track.isMuted = publication.isMuted;
    track.setMediaStream(mediaStream);
    track.start();

    publication.setTrack(track);
    // set participant volume on new microphone tracks
    if (
      this.volume !== undefined &&
      track instanceof RemoteAudioTrack &&
      track.source === Track.Source.Microphone
    ) {
      track.setVolume(this.volume);
    }

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
        publication = new RemoteTrackPublication(
          kind,
          ti.sid,
          ti.name,
          this.signalClient.connectOptions?.autoSubscribe,
        );
        publication.updateInfo(ti);
        newTracks.set(ti.sid, publication);
        const existingTrackOfSource = Array.from(this.tracks.values()).find(
          (publishedTrack) => publishedTrack.source === publication?.source,
        );
        if (existingTrackOfSource && publication.source !== Track.Source.Unknown) {
          log.warn(
            `received a second track publication for ${this.identity} with the same source: ${publication.source}`,
            {
              oldTrack: existingTrackOfSource,
              newTrack: publication,
              participant: this,
              participantInfo: info,
            },
          );
        }
        this.addTrackPublication(publication);
      } else {
        publication.updateInfo(ti);
      }
      validTracks.set(ti.sid, publication);
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

    // always emit events for new publications, Room will not forward them unless it's ready
    newTracks.forEach((publication) => {
      this.emit(ParticipantEvent.TrackPublished, publication);
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
      track.stop();
      publication.setTrack(undefined);
    }
    if (sendUnpublish) {
      this.emit(ParticipantEvent.TrackUnpublished, publication);
    }
  }

  /**
   * @internal
   */
  setAudioContext(ctx: AudioContext | undefined) {
    this.audioContext = ctx;
    this.audioTracks.forEach(
      (track) => track.track instanceof RemoteAudioTrack && track.track.setAudioContext(ctx),
    );
  }

  /**
   * @internal
   */
  async setAudioOutput(output: AudioOutputOptions) {
    this.audioOutput = output;
    const promises: Promise<void>[] = [];
    this.audioTracks.forEach((pub) => {
      if (pub.track instanceof RemoteAudioTrack) {
        promises.push(pub.track.setSinkId(output.deviceId ?? 'default'));
      }
    });
    await Promise.all(promises);
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
