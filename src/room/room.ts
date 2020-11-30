import { EventEmitter } from 'events';
import { ConnectionInfo, RTCClient } from '../api/rtcClient';
import { RTCEngine } from './engine';
import { EngineEvent } from './events';
import { LocalParticipant } from './participant';

class Room extends EventEmitter {
  roomId: string;
  engine: RTCEngine;

  localParticipant?: LocalParticipant;

  constructor(client: RTCClient, roomId: string) {
    super();
    this.roomId = roomId;
    this.engine = new RTCEngine(client);

    this.engine.addListener(EngineEvent.TrackAdded, this.onTrackAdded);
  }

  connect = async (info: ConnectionInfo, token: string): Promise<Room> => {
    const participantInfo = await this.engine.join(info, this.roomId, token);

    this.localParticipant = new LocalParticipant(participantInfo, this.engine);

    return this;
  };

  private onTrackAdded(track: MediaStreamTrack) {
    // TODO: handle track
    console.log('remote track added', track);
  }
}

export default Room;
