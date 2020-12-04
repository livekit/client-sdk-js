import { EventEmitter } from 'events';
import { ConnectionInfo, JoinOptions, RTCClient } from '../api/rtcClient';
import { RTCEngine } from './engine';
import { EngineEvent, RoomEvent } from './events';
import { LocalParticipant, RemoteParticipant } from './participant';
import { UnpackTrackId } from './utils';

export enum RoomState {
  Disconnected = 'disconnected',
  Connected = 'connected',
  Reconnecting = 'reconnecting',
}

class Room extends EventEmitter {
  id: string;
  engine: RTCEngine;
  state: RoomState = RoomState.Disconnected;

  localParticipant?: LocalParticipant;
  participants: { [key: string]: RemoteParticipant } = {};

  constructor(client: RTCClient, roomId: string) {
    super();
    this.id = roomId;
    this.engine = new RTCEngine(client);

    this.engine.on(EngineEvent.TrackAdded, (mediaTrack: MediaStreamTrack) => {
      this.onTrackAdded(mediaTrack);
    });
  }

  connect = async (
    info: ConnectionInfo,
    token: string,
    options?: JoinOptions
  ): Promise<Room> => {
    const joinResponse = await this.engine.join(info, this.id, token, options);

    this.state = RoomState.Connected;
    const pi = joinResponse.participant!;
    this.localParticipant = new LocalParticipant(pi.id, pi.name, this.engine);

    // populate remote participants
    joinResponse.otherParticipants.forEach((pi) => {
      this.participants[pi.id] = RemoteParticipant.fromParticipantInfo(pi);
    });

    return this;
  };

  disconnect() {
    // TODO: handle disconnection
  }

  private onTrackAdded(mediaTrack: MediaStreamTrack) {
    console.log('remote track added', mediaTrack);
    // create remote participant if not created yet
    const [participantId, trackId] = UnpackTrackId(mediaTrack.id);
    let participant = this.participants[participantId];
    if (!participant) {
      participant = new RemoteParticipant(participantId, '');
    }

    const track = participant.addTrack(mediaTrack, trackId);
    console.log('participant with track', track);

    if (participant.hasMetadata) {
      this.emit(RoomEvent.TrackSubscribed, track, participant);
    }
  }
}

export default Room;
