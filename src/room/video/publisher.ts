import {
  AddTrackRequest,
  Encryption_Type,
  SimulcastCodec,
  type SubscribedQualityUpdate,
  VideoLayer_Mode,
} from '@livekit/protocol';
import type { StructuredLogger } from '../../logger';
import type { CoreRoom } from '../CoreRoom';
import { defaultVideoCodec } from '../defaults';
import { DeviceUnsupportedError, TrackInvalidError, UnexpectedConnectionState } from '../errors';
import { ParticipantEvent } from '../events';
import type { VideoPublisher } from '../participant/LocalParticipant';
import {
  computeStartTargetBitrate,
  computeTrackBackupEncodings,
  computeVideoEncodings,
  getDefaultDegradationPreference,
} from '../participant/publishUtils';
import LocalAudioTrack from '../track/LocalAudioTrack';
import type LocalTrack from '../track/LocalTrack';
import type LocalTrackPublication from '../track/LocalTrackPublication';
import LocalVideoTrack, { videoLayersFromEncodings } from '../track/LocalVideoTrack';
import { Track } from '../track/Track';
import type {
  BackupVideoCodec,
  ScreenShareCaptureOptions,
  TrackPublishOptions,
} from '../track/options';
import { ScreenSharePresets, VideoPresets, isBackupCodec } from '../track/options';
import {
  getLogContextFromTrack,
  mimeTypeToVideoCodecString,
  screenCaptureToDisplayMediaStreamOptions,
} from '../track/utils';
import {
  isE2EESimulcastSupported,
  isFireFox,
  isLocalVideoTrack,
  isSVCCodec,
  isSVCSimulcast,
  isSVCSimulcastSupportedByServer,
  isSafari17Based,
  isVideoCodec,
  supportsAV1,
  supportsVP9,
  usesLegacySVCEncodings,
} from '../utils';

/** The video publish pipeline that `LocalParticipant.publishTrack` calls for video tracks. */
export function createVideoPublisher(room: CoreRoom, log: StructuredLogger): VideoPublisher {
  const participant = room.localParticipant;
  const roomOptions = room.options;

  return {
    async prepare(track, opts, req) {
      if (!isE2EESimulcastSupported() && roomOptions.e2ee) {
        log.info(
          `End-to-end encryption is set up, simulcast publishing will be disabled on Safari versions and iOS browsers running iOS < v17.2`,
        );
        opts.simulcast = false;
      }

      if (track.source === Track.Source.ScreenShare && isFireFox()) {
        // Firefox does not work well with simulcasted screen share
        // we frequently get no data on layer 0 when enabled
        opts.simulcast = false;
      }

      // require full AV1/VP9 SVC support prior to using it
      if (opts.videoCodec === 'av1' && !supportsAV1()) {
        opts.videoCodec = undefined;
      }
      if (opts.videoCodec === 'vp9' && !supportsVP9()) {
        opts.videoCodec = undefined;
      }
      if (opts.videoCodec === undefined) {
        opts.videoCodec = defaultVideoCodec;
      }
      if (participant.enabledPublishVideoCodecs.length > 0) {
        // fallback to a supported codec if it is not supported
        if (
          !participant.enabledPublishVideoCodecs.some(
            (c) => opts.videoCodec === mimeTypeToVideoCodecString(c.mime),
          )
        ) {
          opts.videoCodec = mimeTypeToVideoCodecString(
            participant.enabledPublishVideoCodecs[0].mime,
          );
        }
      }
      const videoCodec = opts.videoCodec;

      let dims: Track.Dimensions;
      try {
        dims = await track.waitForDimensions();
      } catch (e) {
        // use defaults, it's quite painful for congestion control without simulcast
        // so using default dims according to publish settings
        const defaultRes =
          roomOptions.videoCaptureDefaults?.resolution ?? VideoPresets.h720.resolution;
        dims = {
          width: defaultRes.width,
          height: defaultRes.height,
        };
        // log failure
        log.error('could not determine track dimensions, using defaults', {
          ...getLogContextFromTrack(track),
          dims,
        });
      }
      // width and height should be defined for video
      req.width = dims.width;
      req.height = dims.height;

      // for svc codecs, disable simulcast and use vp8 for backup codec
      if (
        isSVCSimulcast(videoCodec, opts) &&
        (usesLegacySVCEncodings() || !isSVCSimulcastSupportedByServer(room.engine?.serverVersion))
      ) {
        opts.simulcast = false;
        log.info(
          'SVC simulcast is not supported, disabling simulcast.',
          getLogContextFromTrack(track),
        );
      }

      const svcSimulcast = isSVCSimulcast(videoCodec, opts);
      if (isSVCCodec(videoCodec) && !svcSimulcast) {
        if (track.source === Track.Source.ScreenShare) {
          // vp9 svc with screenshare cannot encode multiple spatial layers
          // doing so reduces publish resolution to minimal resolution
          opts.scalabilityMode = 'L1T3';
          // Chrome does not allow more than 5 fps with L1T3, and it has encoding bugs with L3T3
          // It has a different path for screenshare handling and it seems to be untested/buggy
          // As a workaround, we are setting contentHint to force it to go through the same
          // path as regular camera video. While this is not optimal, it delivers the performance
          // that we need
          if ('contentHint' in track.mediaStreamTrack) {
            track.mediaStreamTrack.contentHint = 'motion';
            log.debug(
              'forcing contentHint to motion for screenshare with SVC codecs',
              getLogContextFromTrack(track),
            );
          }
        }
        // set scalabilityMode to 'L3T3_KEY' by default
        opts.scalabilityMode = opts.scalabilityMode ?? 'L3T3_KEY';
      }

      const primaryCodec = new SimulcastCodec({
        codec: videoCodec,
        cid: track.mediaStreamTrack.id,
      });
      if (svcSimulcast) {
        primaryCodec.videoLayerMode = VideoLayer_Mode.ONE_SPATIAL_LAYER_PER_STREAM;
      }
      req.simulcastCodecs = [primaryCodec];

      // set up backup
      if (opts.backupCodec === true) {
        opts.backupCodec = { codec: defaultVideoCodec };
      }
      if (
        opts.backupCodec &&
        videoCodec !== opts.backupCodec.codec &&
        // TODO remove this once e2ee is supported for backup codecs
        req.encryption === Encryption_Type.NONE
      ) {
        // multi-codec simulcast requires dynacast
        if (!roomOptions.dynacast) {
          roomOptions.dynacast = true;
        }
        req.simulcastCodecs.push(
          new SimulcastCodec({
            codec: opts.backupCodec.codec,
            cid: '',
          }),
        );
      }

      const encodings = computeVideoEncodings(
        track.source === Track.Source.ScreenShare,
        req.width,
        req.height,
        opts,
      );
      req.layers = videoLayersFromEncodings(
        req.width,
        req.height,
        encodings,
        isSVCCodec(opts.videoCodec) && !isSVCSimulcast(opts.videoCodec, opts),
      );
      return encodings;
    },

    senderCreated(track, opts, encodings, req) {
      opts.degradationPreference ??= getDefaultDegradationPreference(track);
      track.setDegradationPreference(opts.degradationPreference);

      if (encodings && track.codec && isVideoCodec(track.codec)) {
        // Apply start bitrate for all video codecs to prevent initial blurriness,
        // see computeStartTargetBitrate
        const targetBitrate = computeStartTargetBitrate(track.codec, opts, encodings);
        if (targetBitrate > 0) {
          room.engine.pcManager?.publisher.setTrackCodecBitrate({
            cid: req.cid,
            codec: track.codec,
            maxbr: targetBitrate / 1000,
            isScreenShare: track.source === Track.Source.ScreenShare,
          });
        }
      }
    },

    serverCodecChanged(track, opts, info, req) {
      // server might not support the codec the client has requested, in that case, fallback
      // to a supported codec
      let primaryCodecMime: string | undefined;
      info.codecs.forEach((codec) => {
        if (primaryCodecMime === undefined) {
          primaryCodecMime = codec.mimeType;
        }
      });
      if (!primaryCodecMime) {
        return undefined;
      }
      const updatedCodec = mimeTypeToVideoCodecString(primaryCodecMime);
      if (updatedCodec === opts.videoCodec) {
        return undefined;
      }
      log.debug('falling back to server selected codec', {
        ...getLogContextFromTrack(track),
        codec: updatedCodec,
      });
      opts.videoCodec = updatedCodec;
      // recompute encodings since bitrates/etc could have changed
      return computeVideoEncodings(
        track.source === Track.Source.ScreenShare,
        req.width,
        req.height,
        opts,
      );
    },

    createScreenTracks: (options) => createScreenTracks(room, options),
  };
}

/**
 * Creates a screen capture tracks with getDisplayMedia().
 * A LocalVideoTrack is always created and returned.
 * If { audio: true }, and the browser supports audio capture, a LocalAudioTrack is also created.
 */
export async function createScreenTracks(
  room: CoreRoom,
  options?: ScreenShareCaptureOptions,
): Promise<Array<LocalTrack>> {
  const participant = room.localParticipant;
  if (options === undefined) {
    options = {};
  }

  if (navigator.mediaDevices.getDisplayMedia === undefined) {
    throw new DeviceUnsupportedError('getDisplayMedia not supported');
  }

  if (options.resolution === undefined && !isSafari17Based()) {
    // we need to constrain the dimensions, otherwise it could lead to low bitrate
    // due to encoding a huge video. Encoding such large surfaces is really expensive
    // unfortunately Safari 17 has a but and cannot be constrained by default
    options.resolution = ScreenSharePresets.h1080fps30.resolution;
  }

  const constraints = screenCaptureToDisplayMediaStreamOptions(options);
  const stream: MediaStream = await navigator.mediaDevices.getDisplayMedia(constraints);

  const tracks = stream.getVideoTracks();
  if (tracks.length === 0) {
    throw new TrackInvalidError('no video track found');
  }
  const screenVideo = new LocalVideoTrack(
    tracks[0],
    undefined,
    false,
    participant.trackLoggerOptions,
  );
  screenVideo.source = Track.Source.ScreenShare;
  if (options.contentHint) {
    screenVideo.mediaStreamTrack.contentHint = options.contentHint;
  }

  const localTracks: Array<LocalTrack> = [screenVideo];
  if (stream.getAudioTracks().length > 0) {
    participant.emit(ParticipantEvent.AudioStreamAcquired);
    const screenAudio = new LocalAudioTrack(
      stream.getAudioTracks()[0],
      undefined,
      false,
      participant.audioContext,
      participant.trackLoggerOptions,
    );
    screenAudio.source = Track.Source.ScreenShareAudio;
    localTracks.push(screenAudio);
  }
  return localTracks;
}

/**
 * Publish both camera and microphone at the same time. This is useful for
 * displaying a single Permission Dialog box to the end user.
 */
export async function enableCameraAndMicrophone(room: CoreRoom) {
  const participant = room.localParticipant;
  if (
    participant.pendingPublishing.has(Track.Source.Camera) ||
    participant.pendingPublishing.has(Track.Source.Microphone)
  ) {
    // no-op it's already been requested
    return;
  }

  participant.pendingPublishing.add(Track.Source.Camera);
  participant.pendingPublishing.add(Track.Source.Microphone);
  try {
    const tracks: LocalTrack[] = await participant.createTracks({
      audio: true,
      video: true,
    });

    await Promise.all(tracks.map((track) => participant.publishTrack(track)));
  } finally {
    participant.pendingPublishing.delete(Track.Source.Camera);
    participant.pendingPublishing.delete(Track.Source.Microphone);
  }
}

/** publish additional codec to existing track */
export async function publishAdditionalCodecForTrack(
  room: CoreRoom,
  log: StructuredLogger,
  track: LocalTrack | MediaStreamTrack,
  videoCodec: BackupVideoCodec,
  options?: TrackPublishOptions,
) {
  const participant = room.localParticipant;
  // TODO remove once e2ee is supported for backup tracks
  if (participant.isE2EEEnabled) {
    return;
  }

  // is it not published? if so skip
  let existingPublication: LocalTrackPublication | undefined;
  participant.trackPublications.forEach((publication) => {
    if (!publication.track) {
      return;
    }
    if (publication.track === track) {
      existingPublication = <LocalTrackPublication>publication;
    }
  });
  if (!existingPublication) {
    throw new TrackInvalidError('track is not published');
  }

  if (!isLocalVideoTrack(track)) {
    throw new TrackInvalidError('track is not a video track');
  }

  const opts: TrackPublishOptions = {
    ...room.options?.publishDefaults,
    ...options,
  };

  const encodings = computeTrackBackupEncodings(track, videoCodec, opts);
  if (!encodings) {
    log.info(
      `backup codec has been disabled, ignoring request to add additional codec for track`,
      getLogContextFromTrack(track),
    );
    return;
  }
  const simulcastTrack = track.addSimulcastTrack(videoCodec, encodings);
  if (!simulcastTrack) {
    return;
  }
  const packetTrailerFeatures = participant.normalizeRequestedFrameMetadataOptions(track, opts);

  const req = new AddTrackRequest({
    cid: simulcastTrack.mediaStreamTrack.id,
    type: Track.kindToProto(track.kind),
    muted: track.isMuted,
    source: Track.sourceToProto(track.source),
    sid: track.sid,
    packetTrailerFeatures,
    simulcastCodecs: [
      {
        codec: opts.videoCodec,
        cid: simulcastTrack.mediaStreamTrack.id,
      },
    ],
  });
  req.layers = videoLayersFromEncodings(req.width, req.height, encodings);

  const engine = room.engine;
  if (!engine || engine.isClosed) {
    throw new UnexpectedConnectionState('cannot publish track when not connected');
  }

  const negotiate = async () => {
    const transceiverInit: RTCRtpTransceiverInit = { direction: 'sendonly' };
    if (encodings) {
      transceiverInit.sendEncodings = encodings;
    }
    await engine.createSimulcastSender(track, simulcastTrack, opts, encodings);

    await engine.negotiate();
  };

  const rets = await Promise.all([engine.addTrack(req), negotiate()]);
  const ti = rets[0];

  log.debug(`published ${videoCodec} for track ${track.sid}`, {
    encodings,
    trackInfo: ti,
  });
}

/** Dynacast: the server tells us which codecs subscribers need; publish the backup codec on demand. */
export async function handleSubscribedQualityUpdate(
  room: CoreRoom,
  log: StructuredLogger,
  update: SubscribedQualityUpdate,
) {
  if (!room.options?.dynacast) {
    return;
  }
  const pub = room.localParticipant.videoTrackPublications.get(update.trackSid);
  if (!pub) {
    log.warn('received subscribed quality update for unknown track', {
      trackSid: update.trackSid,
    });
    return;
  }
  if (!pub.videoTrack) {
    return;
  }
  const newCodecs = await pub.videoTrack.setPublishingCodecs(update.subscribedCodecs);
  for await (const codec of newCodecs) {
    if (isBackupCodec(codec)) {
      log.debug(`publish ${codec} for ${pub.videoTrack.sid}`, getLogContextFromTrack(pub));
      await publishAdditionalCodecForTrack(room, log, pub.videoTrack, codec, pub.options);
    }
  }
}
