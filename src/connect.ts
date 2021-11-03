import { WSSignalClient } from './api/SignalClient';
import log from './logger';
import {
  ConnectOptions,
  LogLevel,
} from './options';
import { MediaDeviceFailure } from './room/errors';
import { RoomEvent } from './room/events';
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
 *   video: true,
 *   captureDefaults: {
 *    facingMode: 'user',
 *   },
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
  const room = new Room(client, config, options.connectionMonitor);

  // connect to room
  await room.connect(url, token, {
    autoSubscribe: options?.autoSubscribe,
  });

  // save default publish options
  if (options.publishDefaults) {
    Object.assign(room.defaultPublishOptions, options.publishDefaults);
  }
  if (options.captureDefaults) {
    Object.assign(room.defaultCaptureOptions, options.captureDefaults);
  }

  const publishAudio: boolean = options.audio;
  const publishVideo: boolean = options.video;
  if (publishAudio || publishVideo) {
    setTimeout(async () => {
      let tracks: LocalTrack[] | undefined;
      try {
        tracks = await createLocalTracks({
          audio: publishAudio,
          video: publishVideo,
        });
      } catch (e) {
        const errKind = MediaDeviceFailure.getFailure(e);
        log.warn('received error while creating media', errKind);
        if (e instanceof Error) {
          log.warn(e.message);
        }
        // when audio and video are both requested, give audio only a shot
        if (
          (errKind === MediaDeviceFailure.NotFound || errKind === MediaDeviceFailure.DeviceInUse)
          && publishAudio && publishVideo
        ) {
          try {
            tracks = await createLocalTracks({
              audio: publishAudio,
              video: false,
            });
          } catch (audioErr) {
            // ignore
          }
        }

        if (!tracks) {
          room.emit(RoomEvent.MediaDevicesError, e);
          log.error('could not create media', e);
          return;
        }
      }

      await Promise.all(tracks.map(
        (track: LocalTrack | MediaStreamTrack) => room.localParticipant.publishTrack(track),
      ));
    });
  }

  return room;
}
