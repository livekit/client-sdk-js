import { EventEmitter } from 'events';
import log from 'loglevel';
import { Participant } from '..';
import { SignalClient } from '../api/SignalClient';
import {
  ParticipantInfo,
  ParticipantInfo_State,
} from '../proto/livekit_models';
import { SpeakerInfo } from '../proto/livekit_rtc';
import { UnsupportedServer } from './errors';
import { EngineEvent, ParticipantEvent, RoomEvent } from './events';
import { LocalParticipant } from './participant/LocalParticipant';
import { RemoteParticipant } from './participant/RemoteParticipant';
import { RTCEngine } from './RTCEngine';
import { RemoteDataTrack } from './track/RemoteDataTrack';
import { RemoteTrackPublication } from './track/RemoteTrackPublication';
import { TrackPublication } from './track/TrackPublication';
import { RemoteTrack } from './track/types';
import { unpackDataTrackLabel } from './utils';

export enum RoomState {
  Disconnected = 'disconnected',
  Connected = 'connected',
  Reconnecting = 'reconnecting',
}

/**
 * In LiveKit, a room is the logical grouping for a list of participants.
 * Participants in a room can publish tracks, and subscribe to others' tracks.
 *
 * a Room fires [[RoomEvent | RoomEvents]].
 *
 * @noInheritDoc
 */
class Room extends EventEmitter {
  state: RoomState = RoomState.Disconnected;
  /** map of sid: [[RemoteParticipant]] */
  participants: Map<string, RemoteParticipant>;
  /**
   * list of participants that are actively speaking. when this changes
   * a [[RoomEvent.ActiveSpeakersChanged]] event is fired
   */
  activeSpeakers: Participant[] = [];
  /** @internal */
  engine!: RTCEngine;

  // available after connected
  /** server assigned unique room id */
  sid!: string;
  /** user assigned name, derived from JWT token */
  name!: string;
  /** the current participant */
  localParticipant!: LocalParticipant;

  /** @internal */
  constructor(client: SignalClient, config?: RTCConfiguration) {
    super();
    this.participants = new Map();
    this.engine = new RTCEngine(client, config);

    this.engine.on(
      EngineEvent.MediaTrackAdded,
      (
        mediaTrack: MediaStreamTrack,
        receiver: RTCRtpReceiver,
        streams: MediaStream[]
      ) => {
        this.onTrackAdded(mediaTrack, receiver, streams);
      }
    );

    this.engine.on(
      EngineEvent.DataChannelAdded,
      (dataChannel: RTCDataChannel) => {
        this.onDataChannelAdded(dataChannel);
      }
    );

    this.engine.on(EngineEvent.Disconnected, (reason: any) => {
      this.handleDisconnect();
    });

    this.engine.on(
      EngineEvent.ParticipantUpdate,
      (participants: ParticipantInfo[]) => {
        this.handleParticipantUpdates(participants);
      }
    );

    this.engine.on(EngineEvent.SpeakersUpdate, (speakers: SpeakerInfo[]) => {
      this.handleSpeakerUpdate(speakers);
    });
  }

  /** @internal */
  connect = async (url: string, token: string): Promise<Room> => {
    // guard against calling connect
    if (this.localParticipant) {
      log.warn('already connected to room', this.name);
      return this;
    }

    try {
      const joinResponse = await this.engine.join(url, token);
      log.debug('connected to Livekit Server', joinResponse.serverVersion);

      if (!joinResponse.serverVersion) {
        throw new UnsupportedServer('unknown server version');
      }

      this.state = RoomState.Connected;
      const pi = joinResponse.participant!;
      this.localParticipant = new LocalParticipant(
        pi.sid,
        pi.identity,
        this.engine
      );
      this.localParticipant.setMetadata(pi.metadata);
      // forward metadata changed for the local participant
      this.localParticipant.on(
        ParticipantEvent.MetadataChanged,
        (metadata: object, p: Participant) => {
          this.emit(RoomEvent.MetadataChanged, metadata, p);
        }
      );

      // populate remote participants, these should not trigger new events
      joinResponse.otherParticipants.forEach((pi) => {
        this.getOrCreateParticipant(pi.sid, pi);
      });

      this.name = joinResponse.room!.name;
      this.sid = joinResponse.room!.sid;
    } catch (err) {
      this.engine.close();
      throw err;
    }

    // don't return until ICE connected
    return new Promise<Room>((resolve, reject) => {
      const connectTimeout = setTimeout(() => {
        // timeout
        this.engine.close();
        reject('could not connect after timeout');
      }, 5 * 1000);

      this.engine.once(EngineEvent.Connected, () => {
        clearTimeout(connectTimeout);
        resolve(this);
      });
    });
  };

  /**
   * disconnects the room, emits [[RoomEvent.Disconnected]]
   */
  disconnect() {
    this.engine.close();
    this.handleDisconnect();
  }

  private onTrackAdded(
    mediaTrack: MediaStreamTrack,
    receiver: RTCRtpReceiver,
    streams: MediaStream[]
  ) {
    const participantId = streams[0].id;
    const trackId = mediaTrack.id;

    const participant = this.getOrCreateParticipant(participantId);
    participant.addSubscribedMediaTrack(mediaTrack, trackId, receiver);
  }

  private onDataChannelAdded(dataChannel: RTCDataChannel) {
    const [participantId, trackId, name] = unpackDataTrackLabel(
      dataChannel.label
    );
    const participant = this.getOrCreateParticipant(participantId);
    participant.addSubscribedDataTrack(dataChannel, trackId, name);
  }

  private handleDisconnect() {
    this.participants.clear();
    this.activeSpeakers = [];
    this.emit(RoomEvent.Disconnected);
    this.state = RoomState.Disconnected;
  }

  private handleParticipantUpdates(participantInfos: ParticipantInfo[]) {
    // handle changes to participant state, and send events
    participantInfos.forEach((info) => {
      if (info.sid === this.localParticipant.sid) {
        this.localParticipant.updateInfo(info);
        return;
      }

      let remoteParticipant = this.participants.get(info.sid);
      const isNewParticipant = !remoteParticipant;

      // create participant if doesn't exist
      remoteParticipant = this.getOrCreateParticipant(info.sid, info);

      // when it's disconnected, send updates
      if (info.state === ParticipantInfo_State.DISCONNECTED) {
        this.handleParticipantDisconnected(info.sid, remoteParticipant);
      } else if (isNewParticipant) {
        // fire connected event
        this.emit(RoomEvent.ParticipantConnected, remoteParticipant);
      } else {
        // just update, no events
        remoteParticipant.updateInfo(info);
      }
    });
  }

  private handleParticipantDisconnected(
    sid: string,
    participant?: RemoteParticipant
  ) {
    // remove and send event
    this.participants.delete(sid);
    if (!participant) {
      return;
    }

    participant.tracks.forEach((publication) => {
      participant.unpublishTrack(publication.trackSid);
    });
    this.emit(RoomEvent.ParticipantDisconnected, participant);
  }

  private handleSpeakerUpdate(speakers: SpeakerInfo[]) {
    const activeSpeakers: Participant[] = [];
    const seenSids: any = {};
    speakers.forEach((speaker) => {
      seenSids[speaker.sid] = true;
      if (speaker.sid === this.localParticipant.sid) {
        this.localParticipant.audioLevel = speaker.level;
        activeSpeakers.push(this.localParticipant);
      } else {
        const p = this.participants.get(speaker.sid);
        if (p) {
          p.audioLevel = speaker.level;
          activeSpeakers.push(p);
        }
      }
    });

    if (!seenSids[this.localParticipant.sid]) {
      this.localParticipant.audioLevel = 0;
    }
    this.participants.forEach((p) => {
      if (!seenSids[p.sid]) {
        p.audioLevel = 0;
      }
    });

    this.activeSpeakers = activeSpeakers;
    this.emit(RoomEvent.ActiveSpeakersChanged, activeSpeakers);
  }

  private getOrCreateParticipant(
    id: string,
    info?: ParticipantInfo
  ): RemoteParticipant {
    let participant = this.participants.get(id);
    if (!participant) {
      // it's possible for the RTC track to arrive before signaling data
      // when this happens, we'll create the participant and make the track work
      if (info) {
        participant = RemoteParticipant.fromParticipantInfo(
          this.engine.client,
          info
        );
      } else {
        participant = new RemoteParticipant(this.engine.client, id, '');
      }
      this.participants.set(id, participant);
      // also forward events

      // trackPublished is only fired for tracks added after both local participant
      // and remote participant joined the room
      participant.on(
        ParticipantEvent.TrackPublished,
        (trackPublication: RemoteTrackPublication) => {
          this.emit(RoomEvent.TrackPublished, trackPublication, participant);
        }
      );

      participant.on(
        ParticipantEvent.TrackSubscribed,
        (track: RemoteTrack, publication: RemoteTrackPublication) => {
          this.emit(RoomEvent.TrackSubscribed, track, publication, participant);
        }
      );

      participant.on(
        ParticipantEvent.TrackUnpublished,
        (publication: RemoteTrackPublication) => {
          this.emit(RoomEvent.TrackUnpublished, publication, participant);
        }
      );

      participant.on(
        ParticipantEvent.TrackUnsubscribed,
        (publication: RemoteTrackPublication) => {
          this.emit(RoomEvent.TrackUnsubscribed, publication, participant);
        }
      );

      participant.on(
        ParticipantEvent.TrackMessage,
        (data: any, track: RemoteDataTrack) => {
          this.emit(RoomEvent.TrackMessage, data, track, participant);
        }
      );

      participant.on(
        ParticipantEvent.TrackSubscriptionFailed,
        (sid: string) => {
          this.emit(RoomEvent.TrackSubscriptionFailed, sid, participant);
        }
      );

      participant.on(ParticipantEvent.TrackMuted, (pub: TrackPublication) => {
        this.emit(RoomEvent.TrackMuted, pub, participant);
      });

      participant.on(ParticipantEvent.TrackUnmuted, (pub: TrackPublication) => {
        this.emit(RoomEvent.TrackUnmuted, pub, participant);
      });

      participant.on(
        ParticipantEvent.MetadataChanged,
        (metadata: object, p: Participant) => {
          this.emit(RoomEvent.MetadataChanged, metadata, p);
        }
      );
    }
    return participant;
  }

  /** @internal */
  emit(event: string | symbol, ...args: any[]): boolean {
    log.debug('room event', event, ...args);
    return super.emit(event, ...args);
  }
}

export default Room;
