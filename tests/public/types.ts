// Consumer code of the last release. It must keep compiling; it is never executed.
import { type CoreRoom, createRoom, rpc } from '../../src/core';
import {
  type ConnectionState,
  type LocalTrackPublication,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  Room,
  RoomEvent,
  type RoomOptions,
  Track,
  VideoPresets,
  createLocalTracks,
} from '../../src/index';

const options: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  videoCaptureDefaults: { resolution: VideoPresets.h720.resolution },
};
const room = new Room(options);

export const state: ConnectionState = room.state;
export const participant: Participant | undefined = room.getParticipantByIdentity('identity');
export const remotes: Map<string, RemoteParticipant> = room.remoteParticipants;

room.on(
  RoomEvent.TrackSubscribed,
  (track: RemoteTrack, publication: RemoteTrackPublication, remote: RemoteParticipant) => {
    if (track.kind === Track.Kind.Video) {
      const element: HTMLMediaElement = track.attach();
      element.remove();
    }
    publication.setSubscribed(false);
    remote.identity.toUpperCase();
  },
);

export async function join(url: string, token: string): Promise<void> {
  await room.prepareConnection(url, token);
  await room.connect(url, token);
  await room.connect(url, token, { autoSubscribe: false });

  const camera: LocalTrackPublication | undefined =
    await room.localParticipant.setCameraEnabled(true);
  await room.localParticipant.setMicrophoneEnabled(true, { echoCancellation: true });
  const [track] = await createLocalTracks({ audio: true });
  if (track) {
    await room.localParticipant.publishTrack(track, { name: 'microphone' });
  }
  await room.localParticipant.publishData(new Uint8Array(1), { reliable: true, topic: 'topic' });
  await room.localParticipant.sendText('hello', { topic: 'chat' });
  const answer: string = await room.localParticipant.performRpc({
    destinationIdentity: 'identity',
    method: 'method',
    payload: 'payload',
  });
  camera?.track?.stop();
  answer.trim();
  await room.disconnect();
}

// The core entry: a room with only the listed extensions.
export const coreRoom: CoreRoom = createRoom({ adaptiveStream: true }, [rpc]);

// Reservation configuration is available without device access, including core-only audio.
export async function joinWithPreparedPublications(url: string, token: string): Promise<void> {
  const audio = coreRoom.preparePublication({
    source: Track.Source.Microphone,
    format: { channelCount: 2 },
    publishOptions: { forceStereo: true, audioPreset: { maxBitrate: 96000 } },
  });
  await coreRoom.connect(url, token, { initialPublications: [audio] });
  await audio.cancel();
  const camera = room.preparePublication({
    source: Track.Source.Camera,
    format: { width: 1280, height: 720, frameRate: 30 },
    publishOptions: {
      videoCodec: 'h264',
      simulcast: false,
      videoEncoding: { maxBitrate: 1000000 },
    },
  });
  const connecting = room.connect(url, token, { initialPublications: [camera] });
  const tracks = await createLocalTracks({
    audio: false,
    video: { resolution: { width: 1280, height: 720 } },
  });
  await connecting;
  if (tracks[0]) {
    const publication: LocalTrackPublication = await camera.attachTrack(tracks[0]);
    publication.trackSid.toUpperCase();
  }
}
