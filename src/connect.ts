import log from 'loglevel';
import { WSSignalClient } from './api/SignalClient';
import {
  ConnectOptions,
  LogLevel,
} from './options';
import Room from './room/Room';
import { createLocalTracks } from './room/track/create';
import { TrackPublishOptions } from './room/track/options';
import { Track } from './room/track/Track';

export { version } from './version';

/**
 * Connects to a LiveKit room
 *
 * ```typescript
 * connect('wss://myhost.livekit.io', token, {
 *   // publish audio and video tracks on joining
 *   audio: true,
 *   video: {
 *     resolution: VideoPresets.hd,
 *     facingMode: {
 *       ideal: "user",
 *     }
 *   }
 * })
 * ```
 * @param url URL to LiveKit server
 * @param token AccessToken, a JWT token that includes authentication and room details
 * @param options
 */
export async function connect(
  url: string,
  token: string,
  options?: ConnectOptions,
): Promise<Room> {
  // set defaults
  options ||= {};
  options.logLevel ||= LogLevel.info;
  if (options.audio === undefined) options.audio = false;
  if (options.video === undefined) options.video = false;

  log.setLevel(options.logLevel);

  const config: RTCConfiguration = options.rtcConfig ?? {};
  if (options.iceServers) {
    config.iceServers = options.iceServers;
  }

  const client = new WSSignalClient();
  const room = new Room(client, config);

  // connect to room
  await room.connect(url, token, {
    autoSubscribe: options?.autoSubscribe,
  });

  // save default publish options
  room.defaultPublishOptions = {
    audioBitrate: options.audioBitrate,
    dtx: options.dtx,
    simulcast: options.simulcast,
    videoCodec: options.videoCodec,
    videoEncoding: options.videoEncoding,
  };

  // add tracks if available
  let { tracks } = options;

  if (!tracks) {
    if (options.audio || options.video) {
      tracks = await createLocalTracks({
        audio: options.audio,
        video: options.video,
      });
    }
  }

  if (tracks) {
    for (let i = 0; i < tracks.length; i += 1) {
      const track = tracks[i];
      // translate publish options
      const trackOptions: TrackPublishOptions = {};
      if (
        track.kind === Track.Kind.Video.toString()
        || track.kind === Track.Kind.Video
      ) {
        trackOptions.videoCodec = options?.videoCodec;
        trackOptions.videoEncoding = options?.videoEncoding;
        trackOptions.simulcast = options?.simulcast;
      } else if (
        track.kind === Track.Kind.Audio.toString()
        || track.kind === Track.Kind.Audio
      ) {
        trackOptions.audioBitrate = options.audioBitrate;
        trackOptions.dtx = options.dtx;
      }

      await room.localParticipant.publishTrack(
        track,
        trackOptions,
      );
    }
  }

  return room;
}
