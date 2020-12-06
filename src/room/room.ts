import { EventEmitter } from 'events';
import { ConnectionInfo, JoinOptions, RTCClient } from '../api/rtcClient';
import { ParticipantInfo, ParticipantInfo_State } from '../proto/model';
import { RTCEngine } from './engine';
import { EngineEvent, ParticipantEvent, RoomEvent } from './events';
import { LocalParticipant, RemoteParticipant } from './participant';
import { RemoteTrack } from './track';
import { RemoteTrackPublication, TrackPublication } from './trackPublication';
import { unpackTrackId } from './utils';

export enum RoomState {
  Disconnected = 'disconnected',
  Connected = 'connected',
  Reconnecting = 'reconnecting',
}

class Room extends EventEmitter {
  sid: string;
  engine: RTCEngine;
  state: RoomState = RoomState.Disconnected;

  localParticipant?: LocalParticipant;
  participants: { [key: string]: RemoteParticipant } = {};

  constructor(client: RTCClient, roomId: string) {
    super();
    this.sid = roomId;
    this.engine = new RTCEngine(client);

    this.engine.on(EngineEvent.TrackAdded, (mediaTrack: MediaStreamTrack) => {
      this.onTrackAdded(mediaTrack);
    });

    this.engine.on(EngineEvent.Disconnected, (reason: any) => {
      this.emit(RoomEvent.Disconnected);
    });

    this.engine.on(
      EngineEvent.ParticipantUpdate,
      (participants: ParticipantInfo[]) => {
        this.handleParticipantUpdates(participants);
      }
    );
  }

  connect = async (
    info: ConnectionInfo,
    token: string,
    options?: JoinOptions
  ): Promise<Room> => {
    const joinResponse = await this.engine.join(info, this.sid, token, options);

    this.state = RoomState.Connected;
    const pi = joinResponse.participant!;
    this.localParticipant = new LocalParticipant(pi.sid, pi.name, this.engine);

    // populate remote participants, these should not trigger new events
    joinResponse.otherParticipants.forEach((pi) => {
      this.getOrCreateParticipant;
      pi.sid, pi;
    });

    return this;
  };

  disconnect() {
    // TODO: handle disconnection
  }

  private onTrackAdded(mediaTrack: MediaStreamTrack) {
    // create remote participant if not created yet
    const [participantId, trackId] = unpackTrackId(mediaTrack.id);

    const participant = this.getOrCreateParticipant(participantId);
    participant.addSubscribedTrack(mediaTrack, trackId);
  }

  private handleParticipantUpdates(participantInfos: ParticipantInfo[]) {
    // handle changes to participant state, and send events
    participantInfos.forEach((info) => {
      let remoteParticipant = this.participants[info.sid];
      if (info.state === ParticipantInfo_State.DISCONNECTED) {
        this.handleParticipantDisconnected(info.sid, remoteParticipant);
        return;
      }

      const isNewParticipant = !remoteParticipant;

      // create participant if doesn't exist
      remoteParticipant = this.getOrCreateParticipant(info.sid, info);

      if (isNewParticipant) {
        // fire connected event
        this.emit(RoomEvent.ParticipantConnected, remoteParticipant);
      } else {
        remoteParticipant.updateMetadata(info);
      }
    });
  }

  private handleParticipantDisconnected(
    sid: string,
    participant?: RemoteParticipant
  ) {
    // remove and send event
    delete this.participants[sid];
    if (!participant) {
      return;
    }

    // unsubscribe from any active tracks
    const removeTracks = (tracks: { [key: string]: TrackPublication }) => {
      Object.keys(tracks).forEach((sid) => {
        // since participant disconnected, we don't need to send events
        participant.unpublishTrack(tracks, sid);
      });
    };
    removeTracks(participant.audioTracks);
    removeTracks(participant.videoTracks);
    removeTracks(participant.dataTracks);

    this.emit(RoomEvent.ParticipantDisconnected, participant);
  }

  private getOrCreateParticipant(
    id: string,
    info?: ParticipantInfo
  ): RemoteParticipant {
    let participant = this.participants[id];
    if (!participant) {
      // it's possible for the RTC track to arrive before signaling data
      // when this happens, we'll create the participant and make the track work
      if (info) {
        participant = RemoteParticipant.fromParticipantInfo(info);
      } else {
        participant = new RemoteParticipant(id, '');
      }
      this.participants[id] = participant;
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
    }
    return participant;
  }

  emit(event: string | symbol, ...args: any[]): boolean {
    console.debug('room event', event, ...args);
    return super.emit(event, ...args);
  }
}

export default Room;
