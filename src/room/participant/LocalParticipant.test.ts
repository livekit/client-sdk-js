import {
  type AddTrackRequest,
  Encryption_Type,
  PacketTrailerFeature,
  VideoQuality,
} from '@livekit/protocol';
import { describe, expect, it, vi } from 'vitest';
import type { StructuredLogger } from '../../logger';
import type { CoreRoom } from '../CoreRoom';
import PCTransport from '../PCTransport';
import { PCTransportState } from '../PCTransportManager';
import type LocalTrack from '../track/LocalTrack';
import type LocalVideoTrack from '../track/LocalVideoTrack';
import { Track } from '../track/Track';
import type { TrackPublishOptions } from '../track/options';
import { publishAdditionalCodecForTrack } from '../video/publisher';
import { LocalParticipant } from './LocalParticipant';

type FrameMetadataTestParticipant = {
  canPublishFrameMetadata: () => boolean;
  log: { warn: ReturnType<typeof vi.fn> };
  normalizeRequestedFrameMetadataOptions: (
    track: LocalTrack,
    opts: TrackPublishOptions,
  ) => PacketTrailerFeature[];
};

function makeParticipant(canPublishFrameMetadata: boolean) {
  const participant = Object.create(LocalParticipant.prototype) as FrameMetadataTestParticipant;
  participant.canPublishFrameMetadata = () => canPublishFrameMetadata;
  participant.log = { warn: vi.fn() };
  return participant;
}

function makeTrack(kind: Track.Kind) {
  return {
    kind,
    sid: 'track-sid',
    source: kind === Track.Kind.Video ? Track.Source.Camera : Track.Source.Microphone,
    isMuted: false,
    mediaStreamID: 'stream-id',
    mediaStreamTrack: {
      enabled: true,
      id: 'media-track-id',
    },
  } as unknown as LocalTrack;
}

describe('LocalParticipant frame metadata publish options', () => {
  it('normalizes requested video frame metadata options to advertised features', () => {
    const participant = makeParticipant(true);
    const opts: TrackPublishOptions = { frameMetadata: { timestamp: true, frameId: true } };

    const features = participant.normalizeRequestedFrameMetadataOptions(
      makeTrack(Track.Kind.Video),
      opts,
    );

    expect(features).toEqual([
      PacketTrailerFeature.PTF_USER_TIMESTAMP,
      PacketTrailerFeature.PTF_FRAME_ID,
    ]);
    expect(opts.frameMetadata).toEqual({ timestamp: true, frameId: true });
  });

  it('clears frame metadata options for non-video tracks', () => {
    const participant = makeParticipant(true);
    const opts: TrackPublishOptions = { frameMetadata: { timestamp: true } };

    const features = participant.normalizeRequestedFrameMetadataOptions(
      makeTrack(Track.Kind.Audio),
      opts,
    );

    expect(features).toEqual([]);
    expect(opts.frameMetadata).toBeUndefined();
  });

  it('clears frame metadata options when publishing frame metadata is unsupported', () => {
    const participant = makeParticipant(false);
    const opts: TrackPublishOptions = { frameMetadata: { frameId: true } };

    const features = participant.normalizeRequestedFrameMetadataOptions(
      makeTrack(Track.Kind.Video),
      opts,
    );

    expect(features).toEqual([]);
    expect(opts.frameMetadata).toBeUndefined();
    expect(participant.log.warn).toHaveBeenCalledOnce();
  });
});

type BackupCodecTestParticipant = {
  encryptionType: Encryption_Type;
  trackPublications: Map<string, { track: LocalVideoTrack }>;
  roomOptions: { publishDefaults: TrackPublishOptions };
  engine: {
    isClosed: boolean;
    addTrack: ReturnType<typeof vi.fn>;
    createSimulcastSender: ReturnType<typeof vi.fn>;
    negotiate: ReturnType<typeof vi.fn>;
  };
  log: { warn: ReturnType<typeof vi.fn>; debug: ReturnType<typeof vi.fn> };
};

// a resizing processor makes mediaStreamTrack (processed) and dimensions (raw capture) differ
function makeBackupCodecTrack(
  settings: MediaTrackSettings,
  source = Track.Source.Camera,
  captureSettings = settings,
) {
  return {
    isLocal: true,
    kind: Track.Kind.Video,
    sid: 'TR_video',
    source,
    isMuted: false,
    mediaStreamID: 'stream-id',
    mediaStreamTrack: { enabled: true, id: 'primary-cid', getSettings: () => settings },
    get dimensions() {
      const { width, height } = captureSettings;
      return width && height ? { width, height } : undefined;
    },
    addSimulcastTrack: () => ({ mediaStreamTrack: { id: 'backup-cid' } }),
  } as unknown as LocalVideoTrack;
}

function makeBackupCodecParticipant(track: LocalVideoTrack) {
  const participant = Object.create(LocalParticipant.prototype) as BackupCodecTestParticipant;
  // Object.create runs no field initializers, so without this the encryption guard sees
  // undefined and the method returns before publishing anything.
  participant.encryptionType = Encryption_Type.NONE;
  participant.trackPublications = new Map([['TR_video', { track }]]);
  participant.roomOptions = {
    publishDefaults: { videoCodec: 'vp9', backupCodec: { codec: 'vp8' }, simulcast: true },
  };
  participant.engine = {
    isClosed: false,
    addTrack: vi.fn(async () => ({})),
    createSimulcastSender: vi.fn(async () => {}),
    negotiate: vi.fn(async () => {}),
  };
  participant.log = { warn: vi.fn(), debug: vi.fn() };
  return participant;
}

// the method lives in the video extension and reads the participant, engine and options off the room
function publishBackupCodec(participant: BackupCodecTestParticipant, track: LocalVideoTrack) {
  const room = {
    localParticipant: participant,
    engine: participant.engine,
    options: participant.roomOptions,
  } as unknown as CoreRoom;
  return publishAdditionalCodecForTrack(
    room,
    participant.log as unknown as StructuredLogger,
    track,
    'vp8',
  );
}

function capturedRequest(participant: BackupCodecTestParticipant): AddTrackRequest {
  expect(participant.engine.addTrack).toHaveBeenCalledOnce();
  return participant.engine.addTrack.mock.calls[0][0] as AddTrackRequest;
}

describe('LocalParticipant.publishAdditionalCodecForTrack', () => {
  it('sets the capture dimensions and the backup codec layers', async () => {
    const track = makeBackupCodecTrack({ width: 1280, height: 720 });
    const participant = makeBackupCodecParticipant(track);

    await publishBackupCodec(participant, track);

    const req = capturedRequest(participant);
    expect(req.width).toBe(1280);
    expect(req.height).toBe(720);
    expect(req.layers.length).toBeGreaterThan(0);
    for (const layer of req.layers) {
      expect(layer.width).toBeGreaterThan(0);
      expect(layer.height).toBeGreaterThan(0);
    }
    expect(Math.max(...req.layers.map((layer) => layer.width))).toBe(1280);
    expect(req.simulcastCodecs[0].codec).toBe('vp8');
    expect(req.simulcastCodecs[0].layers).toEqual(req.layers);
    expect(participant.log.warn).not.toHaveBeenCalled();
  });

  // screenshare disables simulcast for the backup codec, which collapses the encodings to a
  // single unconstrained one and so to a single full size layer
  it('sends one full size layer for a screenshare track', async () => {
    const track = makeBackupCodecTrack({ width: 1280, height: 720 }, Track.Source.ScreenShare);
    const participant = makeBackupCodecParticipant(track);

    await publishBackupCodec(participant, track);

    const req = capturedRequest(participant);
    expect(req.layers).toHaveLength(1);
    expect(req.layers[0].width).toBe(1280);
    expect(req.layers[0].height).toBe(720);
    expect(req.layers[0].quality).toBe(VideoQuality.HIGH);
    expect(req.simulcastCodecs[0].layers).toEqual(req.layers);
    expect(participant.log.warn).not.toHaveBeenCalled();
  });

  it('sizes layers from the processed track when a processor resizes', async () => {
    const track = makeBackupCodecTrack({ width: 640, height: 360 }, Track.Source.Camera, {
      width: 1280,
      height: 720,
    });
    const participant = makeBackupCodecParticipant(track);

    await publishBackupCodec(participant, track);

    const req = capturedRequest(participant);
    expect(req.width).toBe(640);
    expect(req.height).toBe(360);
    expect(Math.max(...req.layers.map((layer) => layer.width))).toBe(640);
    expect(req.simulcastCodecs[0].layers).toEqual(req.layers);
  });

  it('omits layers when the capture dimensions are unknown', async () => {
    const track = makeBackupCodecTrack({});
    const participant = makeBackupCodecParticipant(track);

    await publishBackupCodec(participant, track);

    const req = capturedRequest(participant);
    expect(req.width).toBe(0);
    expect(req.height).toBe(0);
    expect(req.layers).toEqual([]);
    expect(req.simulcastCodecs[0].layers).toEqual([]);
    expect(participant.log.warn).toHaveBeenCalledOnce();
  });
});

function makeTransceiver() {
  return { sender: {} as RTCRtpSender, stop: vi.fn() };
}

function makePublisher(transceivers: ReturnType<typeof makeTransceiver>[]) {
  return {
    getTransceivers: () => transceivers as unknown as RTCRtpTransceiver[],
    removeTrack: vi.fn(),
    // the real helper, run against the fake transceivers above
    stopTransceivers: PCTransport.prototype.stopTransceivers,
  };
}

type TransceiverTestParticipant = {
  unpublishTrack: LocalParticipant['unpublishTrack'];
  publish: (track: LocalTrack, opts: TrackPublishOptions, isStereo: boolean) => Promise<unknown>;
  pendingPublishPromises: Map<LocalTrack, Promise<unknown>>;
  trackPublications: Map<string, unknown>;
  audioTrackPublications: Map<string, unknown>;
  videoTrackPublications: Map<string, unknown>;
  roomOptions: object;
  permissions: { canPublish: boolean; canPublishSources: unknown[] };
  encryptionType: Encryption_Type;
  enabledPublishVideoCodecs: unknown[];
  engine: {
    isClosed: boolean;
    pcManager: { currentState: PCTransportState; publisher: ReturnType<typeof makePublisher> };
    addTrack: ReturnType<typeof vi.fn>;
    createSender: ReturnType<typeof vi.fn>;
    removeTrack: ReturnType<typeof vi.fn>;
    negotiate: ReturnType<typeof vi.fn>;
  };
  log: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
};

function makeTransceiverParticipant(publisher: ReturnType<typeof makePublisher>) {
  const participant = Object.create(LocalParticipant.prototype) as TransceiverTestParticipant;
  participant.pendingPublishPromises = new Map();
  participant.trackPublications = new Map();
  participant.audioTrackPublications = new Map();
  participant.videoTrackPublications = new Map();
  participant.roomOptions = {};
  participant.permissions = { canPublish: true, canPublishSources: [] };
  participant.encryptionType = Encryption_Type.NONE;
  participant.enabledPublishVideoCodecs = [];
  participant.engine = {
    isClosed: false,
    pcManager: { currentState: PCTransportState.CONNECTED, publisher },
    addTrack: vi.fn(),
    createSender: vi.fn(),
    removeTrack: vi.fn(() => true),
    negotiate: vi.fn(async () => {}),
  };
  participant.log = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };
  return participant;
}

describe('LocalParticipant transceiver cleanup', () => {
  it('stops the transceivers of an unpublished track and its backup codec', async () => {
    const primary = makeTransceiver();
    const backup = makeTransceiver();
    const otherTrack = makeTransceiver();
    // the pre-populated recvonly placeholder, which also receives remote media in single peer
    // connection mode
    const placeholder = makeTransceiver();
    const participant = makeTransceiverParticipant(
      makePublisher([placeholder, otherTrack, primary, backup]),
    );
    const track = {
      isLocal: true,
      kind: Track.Kind.Video,
      sid: 'TR_video',
      source: Track.Source.Camera,
      mediaStreamTrack: { enabled: true, id: 'primary-cid' },
      sender: primary.sender,
      simulcastCodecs: new Map([['vp8', { sender: backup.sender }]]),
      off: vi.fn(),
      stop: vi.fn(),
    } as unknown as LocalVideoTrack;
    const publication = { trackSid: 'TR_video', kind: Track.Kind.Video, track, setTrack: vi.fn() };
    participant.trackPublications.set('TR_video', publication);
    participant.videoTrackPublications.set('TR_video', publication);

    await participant.unpublishTrack(track);

    expect(primary.stop).toHaveBeenCalledOnce();
    expect(backup.stop).toHaveBeenCalledOnce();
    expect(otherTrack.stop).not.toHaveBeenCalled();
    expect(placeholder.stop).not.toHaveBeenCalled();
    // removeTrack runs while the transceivers are not stopped yet
    const [primaryRemoved, backupRemoved] = participant.engine.removeTrack.mock.invocationCallOrder;
    expect(primaryRemoved).toBeLessThan(primary.stop.mock.invocationCallOrder[0]);
    expect(backupRemoved).toBeLessThan(backup.stop.mock.invocationCallOrder[0]);
    expect(participant.engine.negotiate).toHaveBeenCalledOnce();
    expect(participant.log.warn).not.toHaveBeenCalled();
  });

  it('stops the transceiver of a track when the server rejects its publish', async () => {
    const transceiver = makeTransceiver();
    const publisher = makePublisher([transceiver]);
    const participant = makeTransceiverParticipant(publisher);
    // with enabled video codecs, the sender is created while the AddTrackRequest is pending
    participant.enabledPublishVideoCodecs = [{}];
    participant.engine.createSender.mockResolvedValue(transceiver.sender);
    const rejection = new Error('publish rejected');
    participant.engine.addTrack.mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(rejection), 0)),
    );
    const track = {
      isLocal: true,
      kind: Track.Kind.Audio,
      source: Track.Source.Microphone,
      isMuted: false,
      hasPreConnectBuffer: false,
      mediaStreamTrack: { enabled: true, id: 'mic-cid' },
      on: vi.fn(),
      getSourceTrackSettings: () => ({}),
    } as unknown as LocalTrack;

    await expect(participant.publish(track, {}, false)).rejects.toBe(rejection);

    expect(transceiver.stop).toHaveBeenCalledOnce();
    expect(publisher.removeTrack.mock.invocationCallOrder[0]).toBeLessThan(
      transceiver.stop.mock.invocationCallOrder[0],
    );
  });
});
