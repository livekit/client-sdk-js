import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoreRoom } from '../CoreRoom';
import { TrackEvent } from '../events';
import LocalAudioTrack from './LocalAudioTrack';
import { Track } from './Track';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const flush = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};

class Source extends EventTarget {
  id = 'capture';

  kind = 'audio';

  label = 'headset';

  enabled = true;

  muted = false;

  readyState: MediaStreamTrackState = 'live';

  getSettings() {
    return { deviceId: 'headset' };
  }

  getConstraints() {
    return { deviceId: { exact: 'headset' } };
  }

  stop() {
    this.readyState = 'ended';
  }
}

class Stream {
  constructor(private tracks: Source[]) {}

  getTracks() {
    return this.tracks;
  }

  getAudioTracks() {
    return this.tracks;
  }
}

const tracks: LocalAudioTrack[] = [];
afterEach(() => {
  tracks.forEach((track) => track.stop());
  tracks.length = 0;
  vi.unstubAllGlobals();
});

function captureWith(getUserMedia: () => Promise<Stream>) {
  vi.stubGlobal('MediaStream', Stream);
  vi.stubGlobal('MediaStreamTrack', Source);
  vi.stubGlobal('navigator', {
    userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36',
    mediaDevices: { getUserMedia },
  });
}

async function microphone(userProvided = false) {
  const track = new LocalAudioTrack(
    new Source() as unknown as MediaStreamTrack,
    undefined,
    userProvided,
  );
  track.source = Track.Source.Microphone;
  tracks.push(track);
  await flush();
  return track;
}

describe('microphone capture adoption', () => {
  for (const initialMuted of [false, true]) {
    it(`keeps replacement capture silent during processor and sender adoption when initially ${initialMuted ? 'muted' : 'unmuted'}`, async () => {
      const candidate = new Source();
      captureWith(async () => new Stream([candidate]));
      const track = await microphone();
      if (initialMuted) await track.mute();
      const processorGate = deferred();
      const senderGate = deferred();
      const processed = new Source();
      const processor = {
        processedTrack: processed,
        destroy: async () => {},
        restart: vi.fn(async ({ track: raw }: { track: MediaStreamTrack }) => {
          expect(raw.enabled).toBe(false);
          await processorGate.promise;
        }),
      };
      Object.assign(track, { processor });
      const replaceTrack = vi.fn(async () => {
        expect(candidate.enabled).toBe(false);
        await senderGate.promise;
      });
      track.sender = { replaceTrack } as unknown as RTCRtpSender;
      const restarting = track.restartTrack();
      await flush();
      expect(processor.restart).toHaveBeenCalledOnce();
      expect(candidate.enabled).toBe(false);
      // A mute while adoption is suspended must apply to the replacement too.
      await track.mute();
      processorGate.resolve();
      await flush();
      expect(replaceTrack).toHaveBeenCalledOnce();
      expect(candidate.enabled).toBe(false);
      senderGate.resolve();
      await restarting;
      expect(track.isMuted).toBe(true);
      expect(candidate.enabled).toBe(false);
      expect(processed.enabled).toBe(true);
      await track.unmute();
      expect(candidate.enabled).toBe(true);
      expect(processed.enabled).toBe(true);
    });
  }

  it('restores an unmuted replacement only after asynchronous adoption completes', async () => {
    const candidate = new Source();
    const senderGate = deferred();
    captureWith(async () => new Stream([candidate]));
    const track = await microphone();
    track.sender = {
      replaceTrack: async () => {
        await senderGate.promise;
      },
    } as unknown as RTCRtpSender;
    const restarting = track.restartTrack();
    await flush();
    expect(candidate.enabled).toBe(false);
    senderGate.resolve();
    await restarting;
    expect(candidate.enabled).toBe(true);
    expect(track.isMuted).toBe(false);
  });
});

describe('microphone recovery intent', () => {
  it('keeps reacquired capture silent when a rapid mute/unmute is superseded by mute', async () => {
    const candidate = new Source();
    const enabledWrites: boolean[] = [];
    let candidateEnabled = true;
    Object.defineProperty(candidate, 'enabled', {
      get: () => candidateEnabled,
      set: (enabled: boolean) => {
        candidateEnabled = enabled;
        enabledWrites.push(enabled);
      },
    });
    const capture = deferred<Stream>();
    const getUserMedia = vi.fn(() => capture.promise);
    captureWith(getUserMedia);
    const track = await microphone();
    track.stopOnMute = true;

    const firstMute = track.mute();
    const unmuting = track.unmute();
    await flush();
    expect(getUserMedia).toHaveBeenCalledOnce();
    const finalMute = track.mute();
    capture.resolve(new Stream([candidate]));
    await Promise.all([firstMute, unmuting, finalMute]);

    expect(track.isMuted).toBe(true);
    expect(candidate.enabled).toBe(false);
    expect(enabledWrites).not.toContain(true);
  });

  for (const newestIntent of ['mute', 'enable', 'enable-then-mute'] as const) {
    it(`failed fallback preserves a newer ${newestIntent} while capture locks are held`, async () => {
      const candidate = new Source();
      let candidateEnabled = true;
      let nativeEnables = 0;
      Object.defineProperty(candidate, 'enabled', {
        get: () => candidateEnabled,
        set: (enabled: boolean) => {
          candidateEnabled = enabled;
          if (enabled) nativeEnables++;
        },
      });
      const fallbackCapture = deferred<Stream>();
      const getUserMedia = vi.fn(async () => {
        if (getUserMedia.mock.calls.length === 1) return fallbackCapture.promise;
        return new Stream([candidate]);
      });
      captureWith(getUserMedia);
      const track = await microphone();
      const room = new CoreRoom();
      const participant = room.localParticipant as unknown as {
        handleTrackEnded(track: LocalAudioTrack): Promise<void>;
      };
      const fallback = participant.handleTrackEnded(track);
      await flush();
      expect(getUserMedia).toHaveBeenCalledOnce();
      await track.mute();
      const unmuted = vi.fn();
      track.on(TrackEvent.Unmuted, unmuted);
      const manual = newestIntent !== 'mute' ? track.unmute() : Promise.resolve();
      await flush();
      expect(track.isMuted).toBe(true);
      const cancel = newestIntent === 'enable-then-mute' ? track.mute() : Promise.resolve();
      fallbackCapture.reject(new Error('Removed microphone'));
      await Promise.all([fallback, manual, cancel]);
      expect(track.isMuted).toBe(newestIntent !== 'enable');
      expect(getUserMedia).toHaveBeenCalledTimes(newestIntent !== 'mute' ? 2 : 1);
      expect(unmuted).toHaveBeenCalledTimes(newestIntent === 'enable' ? 1 : 0);
      if (newestIntent !== 'mute') expect(candidate.enabled).toBe(newestIntent === 'enable');
      if (newestIntent === 'enable-then-mute') expect(nativeEnables).toBe(0);
      room.removeAllListeners();
      room.localParticipant.removeAllListeners();
    });
  }
});
