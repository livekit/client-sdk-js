import log, { LogLevel, setLogLevel } from './logger';
import { ConnectOptions } from './options';
import { MediaDeviceFailure } from './room/errors';
import { RoomEvent } from './room/events';
import Room from './room/Room';

export { version } from './version';

/**
 * @deprecated Use room.connect() instead
 *
 * Connects to a LiveKit room, shorthand for `new Room()` and [[Room.connect]]
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
export async function connect(url: string, token: string, options?: ConnectOptions): Promise<Room> {
  options ??= {};
  if (options.adaptiveStream === undefined) {
    options.adaptiveStream = options.autoManageVideo === true ? {} : undefined;
  }
  setLogLevel(options.logLevel ?? LogLevel.warn);

  const config: RTCConfiguration = options.rtcConfig ?? {};
  if (options.iceServers) {
    config.iceServers = options.iceServers;
  }

  const room = new Room(options);

  // connect to room
  await room.connect(url, token, options);

  const publishAudio: boolean = options.audio ?? false;
  const publishVideo: boolean = options.video ?? false;

  if (publishAudio || publishVideo) {
    setTimeout(async () => {
      // if publishing both
      let err: any;
      if (publishAudio && publishVideo) {
        try {
          await room.localParticipant.enableCameraAndMicrophone();
        } catch (e) {
          const errKind = MediaDeviceFailure.getFailure(e);
          log.warn('received error while creating media', { error: errKind });
          if (e instanceof Error) {
            log.warn(e.message);
          }

          // when it's a device issue, try to publish the other kind
          if (
            errKind === MediaDeviceFailure.NotFound ||
            errKind === MediaDeviceFailure.DeviceInUse
          ) {
            try {
              await room.localParticipant.setMicrophoneEnabled(true);
            } catch (audioErr) {
              err = audioErr;
            }
          } else {
            err = e;
          }
        }
      } else if (publishAudio) {
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
        } catch (e) {
          err = e;
        }
      } else if (publishVideo) {
        try {
          await room.localParticipant.setCameraEnabled(true);
        } catch (e) {
          err = e;
        }
      }

      if (err) {
        room.emit(RoomEvent.MediaDevicesError, err);
        log.error('could not create media', err);
      }
    });
  }

  return room;
}
