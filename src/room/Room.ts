import { EventEmitter } from 'events';
import log from 'loglevel';
import { ConnectionInfo, RTCClient } from '../api/RTCClient';
import { ParticipantInfo, ParticipantInfo_State } from '../proto/model';
import { EngineEvent, ParticipantEvent, RoomEvent } from './events';
import { LocalParticipant } from './participant/LocalParticipant';
import { RemoteParticipant } from './participant/RemoteParticipant';
import { RTCEngine } from './RTCEngine';
import { LocalTrackPublication } from './track/LocalTrackPublication';
import { RemoteDataTrack } from './track/RemoteDataTrack';
import { RemoteTrackPublication } from './track/RemoteTrackPublication';
import { RemoteTrack } from './track/types';
import { unpackDataTrackLabel, unpackTrackId } from './utils';

export enum RoomState {
  Disconnected = 'disconnected',
  Connected = 'connected',
  Reconnecting = 'reconnecting',
}

class Room extends EventEmitter {
  engine: RTCEngine;
  state: RoomState = RoomState.Disconnected;
  participants: Map<string, RemoteParticipant>;
  dominantSpeaker?: RemoteParticipant;
  autoTracks?: LocalTrackPublication[];

  // available after connected
  sid!: string;
  name!: string;
  localParticipant!: LocalParticipant;

  constructor(client: RTCClient) {
    super();
    this.participants = new Map();
    this.engine = new RTCEngine(client);

    this.engine.on(
      EngineEvent.MediaTrackAdded,
      (mediaTrack: MediaStreamTrack) => {
        this.onTrackAdded(mediaTrack);
      }
    );

    this.engine.on(
      EngineEvent.DataChannelAdded,
      (dataChannel: RTCDataChannel) => {
        this.onDataChannelAdded(dataChannel);
      }
    );

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

  connect = async (info: ConnectionInfo, token: string): Promise<Room> => {
    const joinResponse = await this.engine.join(info, token);

    this.state = RoomState.Connected;
    const pi = joinResponse.participant!;
    this.localParticipant = new LocalParticipant(pi.sid, pi.name, this.engine);

    // populate remote participants, these should not trigger new events
    joinResponse.otherParticipants.forEach((pi) => {
      this.getOrCreateParticipant(pi.sid, pi);
    });

    this.name = joinResponse.room!.name;
    this.sid = joinResponse.room!.sid;

    return this;
  };

  disconnect() {
    // TODO: handle disconnection
  }

  private onTrackAdded(mediaTrack: MediaStreamTrack) {
    // create remote participant if not created yet
    const [participantId, trackId] = unpackTrackId(mediaTrack.id);

    const participant = this.getOrCreateParticipant(participantId);
    participant.addSubscribedMediaTrack(mediaTrack, trackId);
  }

  private onDataChannelAdded(dataChannel: RTCDataChannel) {
    const [participantId, trackId, name] = unpackDataTrackLabel(
      dataChannel.label
    );
    const participant = this.getOrCreateParticipant(participantId);
    participant.addSubscribedDataTrack(dataChannel, trackId, name);
  }

  private handleParticipantUpdates(participantInfos: ParticipantInfo[]) {
    // handle changes to participant state, and send events
    participantInfos.forEach((info) => {
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
        remoteParticipant.updateMetadata(info);
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

    participant.tracks.forEach((track) => {
      participant.unpublishTrack(track.trackSid);
    });
    this.emit(RoomEvent.ParticipantDisconnected, participant);
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
        participant = RemoteParticipant.fromParticipantInfo(info);
      } else {
        participant = new RemoteParticipant(id, '');
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
    }
    return participant;
  }

  emit(event: string | symbol, ...args: any[]): boolean {
    log.trace('room event', event, ...args);
    return super.emit(event, ...args);
  }
}

export default Room;
