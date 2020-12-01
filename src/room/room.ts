import { EventEmitter } from 'events';
import { ConnectionInfo, RTCClient } from '../api/rtcClient';
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

    this.engine.addListener(EngineEvent.TrackAdded, this.onTrackAdded);
  }

  connect = async (info: ConnectionInfo, token: string): Promise<Room> => {
    const participantInfo = await this.engine.join(info, this.id, token);

    this.state = RoomState.Connected;
    this.localParticipant = new LocalParticipant(
      participantInfo.id,
      participantInfo.name,
      this.engine
    );

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

    if (participant.hasMetadata) {
      this.emit(RoomEvent.TrackPublished, this, track);
    }
  }
}

export default Room;
