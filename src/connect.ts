import log from 'loglevel';
import { WSSignalClient } from './api/SignalClient';
import {
  ConnectOptions,
  LogLevel,
} from './options';
import Room from './room/Room';
import { createLocalTracks } from './room/track/create';
import LocalTrack from './room/track/LocalTrack';

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
  const defaultOptions = room.defaultTrackOptions;
  if (options.audioBitrate) defaultOptions.audioBitrate = options.audioBitrate;
  if (options.dtx) defaultOptions.dtx = options.dtx;
  if (options.simulcast) defaultOptions.simulcast = options.simulcast;
  if (options.videoEncoding) defaultOptions.videoEncoding = options.videoEncoding;
  if (options.videoCodec) defaultOptions.videoCodec = options.videoCodec;

  room.defaultTrackOptions = defaultOptions;

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
    await Promise.all(tracks.map(
      (track: LocalTrack | MediaStreamTrack) => room.localParticipant.publishTrack(track),
    ));
  }

  return room;
}
