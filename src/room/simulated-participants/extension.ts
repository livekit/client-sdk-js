import {
  ParticipantInfo,
  ParticipantInfo_State,
  Room as RoomModel,
  TrackInfo,
  TrackSource,
  TrackType,
  protoInt64,
} from '@livekit/protocol';
import type { CoreRoom } from '../CoreRoom';
import { ParticipantEvent } from '../events';
import type { ExtensionContext, ExtensionResult, RoomExtension } from '../extensions';
import LocalAudioTrack from '../track/LocalAudioTrack';
import LocalTrackPublication from '../track/LocalTrackPublication';
import { Track } from '../track/Track';
import { getVideoCapture } from '../track/create';
import type { SimulationOptions } from '../types';
import { createDummyVideoStreamTrack, getEmptyAudioStreamTrack } from '../utils';

/** Methods the `simulatedParticipants` extension adds to the room. */
export interface SimulatedParticipantsRoomApi {
  /**
   * Allows to populate a room with simulated participants.
   * No actual connection to a server will be established, all state is
   * @experimental
   */
  simulateParticipants(options: SimulationOptions): Promise<void>;
}

/**
 * Fills a room with fake participants and dummy media without a server. A development tool;
 * the `video` extension must be installed when simulated participants publish video.
 */
export const simulatedParticipants = {
  key: /* @__PURE__ */ Symbol('simulatedParticipants'),
  install(room: CoreRoom, ctx: ExtensionContext): ExtensionResult<SimulatedParticipantsRoomApi> {
    return {
      room: {
        simulateParticipants: (options) => simulateParticipants(room, ctx, options),
      },
    };
  },
} satisfies RoomExtension<SimulatedParticipantsRoomApi>;

async function simulateParticipants(
  room: CoreRoom,
  ctx: ExtensionContext,
  options: SimulationOptions,
) {
  const publishOptions = {
    audio: true,
    video: true,
    useRealTracks: false,
    ...options.publish,
  };
  const participantOptions = {
    count: 9,
    audio: false,
    video: true,
    aspectRatios: [1.66, 1.7, 1.3],
    ...options.participants,
  };
  const participant = room.localParticipant;
  const loggerOptions = participant.trackLoggerOptions;

  ctx.simulateConnected(
    new RoomModel({
      sid: 'RM_SIMULATED',
      name: 'simulated-room',
      emptyTimeout: 0,
      maxParticipants: 0,
      creationTime: protoInt64.parse(new Date().getTime()),
      metadata: '',
      numParticipants: 1,
      numPublishers: 1,
      turnPassword: '',
      enabledCodecs: [],
      activeRecording: false,
    }),
    new ParticipantInfo({
      identity: 'simulated-local',
      name: 'local-name',
    }),
  );

  if (publishOptions.video) {
    const camPub = new LocalTrackPublication(
      Track.Kind.Video,
      new TrackInfo({
        source: TrackSource.CAMERA,
        sid: Math.floor(Math.random() * 10_000).toString(),
        type: TrackType.AUDIO,
        name: 'video-dummy',
      }),
      getVideoCapture().createTrack(
        publishOptions.useRealTracks && window.navigator.mediaDevices?.getUserMedia
          ? (await window.navigator.mediaDevices.getUserMedia({ video: true })).getVideoTracks()[0]
          : createDummyVideoStreamTrack(
              160 * (participantOptions.aspectRatios[0] ?? 1),
              160,
              true,
              true,
            ),
        undefined,
        false,
        loggerOptions,
      ),
      loggerOptions,
    );
    // @ts-ignore
    participant.addTrackPublication(camPub);
    participant.emit(ParticipantEvent.LocalTrackPublished, camPub);
  }
  if (publishOptions.audio) {
    const audioPub = new LocalTrackPublication(
      Track.Kind.Audio,
      new TrackInfo({
        source: TrackSource.MICROPHONE,
        sid: Math.floor(Math.random() * 10_000).toString(),
        type: TrackType.AUDIO,
      }),
      new LocalAudioTrack(
        publishOptions.useRealTracks && navigator.mediaDevices?.getUserMedia
          ? (await navigator.mediaDevices.getUserMedia({ audio: true })).getAudioTracks()[0]
          : getEmptyAudioStreamTrack(),
        undefined,
        false,
        participant.audioContext,
        loggerOptions,
      ),
      loggerOptions,
    );
    // @ts-ignore
    participant.addTrackPublication(audioPub);
    participant.emit(ParticipantEvent.LocalTrackPublished, audioPub);
  }

  for (let i = 0; i < participantOptions.count - 1; i += 1) {
    let info: ParticipantInfo = new ParticipantInfo({
      sid: Math.floor(Math.random() * 10_000).toString(),
      identity: `simulated-${i}`,
      state: ParticipantInfo_State.ACTIVE,
      tracks: [],
      joinedAt: protoInt64.parse(Date.now()),
    });
    const p = ctx.getOrCreateParticipant(info.identity, info);
    if (participantOptions.video) {
      const dummyVideo = createDummyVideoStreamTrack(
        160 * (participantOptions.aspectRatios[i % participantOptions.aspectRatios.length] ?? 1),
        160,
        false,
        true,
      );
      const videoTrack = new TrackInfo({
        source: TrackSource.CAMERA,
        sid: Math.floor(Math.random() * 10_000).toString(),
        type: TrackType.AUDIO,
      });
      p.addSubscribedMediaTrack(
        dummyVideo,
        videoTrack.sid,
        new MediaStream([dummyVideo]),
        new RTCRtpReceiver(),
      );
      info.tracks = [...info.tracks, videoTrack];
    }
    if (participantOptions.audio) {
      const dummyTrack = getEmptyAudioStreamTrack();
      const audioTrack = new TrackInfo({
        source: TrackSource.MICROPHONE,
        sid: Math.floor(Math.random() * 10_000).toString(),
        type: TrackType.AUDIO,
      });
      p.addSubscribedMediaTrack(
        dummyTrack,
        audioTrack.sid,
        new MediaStream([dummyTrack]),
        new RTCRtpReceiver(),
      );
      info.tracks = [...info.tracks, audioTrack];
    }

    p.updateInfo(info);
  }
}
