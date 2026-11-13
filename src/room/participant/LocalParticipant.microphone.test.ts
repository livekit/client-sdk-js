import { TrackInfo, TrackSource } from '@livekit/protocol';
import { describe, expect, test, vi } from 'vitest';
import { SignalConnectionState } from '../../api/SignalClient';
import { CoreRoom as Room } from '../CoreRoom';
import { EngineEvent } from '../events';
import type LocalTrack from '../track/LocalTrack';
import LocalTrackPublication from '../track/LocalTrackPublication';
import { Track } from '../track/Track';

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
  id = 'initial-capture';

  kind = 'audio';

  label = 'headset';

  enabled = true;

  muted = false;

  readyState: MediaStreamTrackState = 'live';

  getSettings() {
    return { deviceId: 'headset' };
  }

  getConstraints() {
    return {};
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

function fixture(holdPublication = false) {
  const capture = deferred<Stream>();
  const publish = deferred();
  const source = new Source();
  const tracks: LocalTrack[] = [];
  let captures = 0;
  let publishes = 0;
  const globals = ['MediaStream', 'MediaStreamTrack', 'navigator'] as const;
  const previous = globals.map(
    (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
  );
  Object.defineProperty(globalThis, 'MediaStream', { configurable: true, value: Stream });
  Object.defineProperty(globalThis, 'MediaStreamTrack', { configurable: true, value: Source });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36',
      mediaDevices: {
        getUserMedia() {
          captures++;
          return capture.promise;
        },
      },
    },
  });
  const room = new Room();
  const participant = room.localParticipant;
  Object.defineProperty(participant.engine.client, 'currentState', {
    value: SignalConnectionState.CONNECTED,
  });
  // Keep real createTracks, publishTrack, publication mute/unmute and track locks.
  // Only the server negotiation boundary is controlled by the fixture.
  Object.assign(participant, {
    async publish(track: LocalTrack) {
      publishes++;
      tracks.push(track);
      if (holdPublication) await publish.promise;
      const publication = new LocalTrackPublication(
        Track.Kind.Audio,
        new TrackInfo({ sid: 'mic-publication', source: TrackSource.MICROPHONE }),
        track,
      );
      participant.trackPublications.set(publication.trackSid, publication);
      participant.audioTrackPublications.set(publication.trackSid, publication);
      return publication;
    },
  });
  return {
    participant,
    source,
    capture,
    publish,
    tracks,
    captures: () => captures,
    publishes: () => publishes,
    releaseCapture() {
      capture.resolve(new Stream([source]));
    },
    cleanup() {
      for (const track of tracks) track.stop();
      source.stop();
      room.removeAllListeners();
      participant.removeAllListeners();
      for (const [name, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    },
  };
}

describe('microphone publication intent', () => {
  test('mute settles before held capture and prevents publication even beyond the old timeout', async () => {
    const f = fixture();
    const now = Date.now;
    try {
      const enabling = f.participant.setMicrophoneEnabled(true);
      await flush();
      expect(f.captures()).toBe(1);
      let muted = false;
      const muting = f.participant.setMicrophoneEnabled(false).then(() => {
        muted = true;
      });
      await flush();
      expect(muted).toBe(true);
      Date.now = () => now() + 60_000;
      f.releaseCapture();
      expect(await enabling).toBeUndefined();
      await muting;
      expect(f.publishes()).toBe(0);
      expect(f.source.enabled).toBe(false);
      expect(f.source.readyState).toBe('ended');
      expect(f.participant.isMicrophoneEnabled).toBe(false);
    } finally {
      Date.now = now;
      f.cleanup();
    }
  });

  for (const finalEnabled of [false, true]) {
    test(`repeated enable/mute during capture follows latest ${finalEnabled ? 'enable' : 'mute'}`, async () => {
      const f = fixture();
      try {
        const requests = [f.participant.setMicrophoneEnabled(true)];
        await flush();
        for (const enabled of [false, true, false, true, finalEnabled]) {
          requests.push(f.participant.setMicrophoneEnabled(enabled));
        }
        await flush();
        f.releaseCapture();
        await Promise.all(requests);
        expect(f.captures()).toBe(1);
        expect(f.publishes()).toBe(finalEnabled ? 1 : 0);
        expect(f.participant.isMicrophoneEnabled).toBe(finalEnabled);
        expect(f.source.enabled).toBe(finalEnabled);
      } finally {
        f.cleanup();
      }
    });
  }

  for (const finalEnabled of [false, true]) {
    test(`mute silences a pending publication immediately; latest ${finalEnabled ? 'enable' : 'mute'} survives negotiation`, async () => {
      const f = fixture(true);
      try {
        const first = f.participant.setMicrophoneEnabled(true);
        f.releaseCapture();
        await flush();
        expect(f.publishes()).toBe(1);
        expect(f.participant.getTrackPublication(Track.Source.Microphone)).toBeUndefined();
        const mute = f.participant.setMicrophoneEnabled(false);
        expect(f.source.enabled).toBe(false);
        await mute;
        const newerEnable = f.participant.setMicrophoneEnabled(true);
        const newest = finalEnabled ? Promise.resolve() : f.participant.setMicrophoneEnabled(false);
        await flush();
        expect(f.source.enabled).toBe(false);
        f.publish.resolve(undefined);
        await Promise.all([first, newerEnable, newest]);
        expect(f.publishes()).toBe(1);
        expect(f.captures()).toBe(1);
        expect(f.source.enabled).toBe(finalEnabled);
        expect(f.participant.isMicrophoneEnabled).toBe(finalEnabled);
      } finally {
        f.cleanup();
      }
    });
  }

  test('an enable waiting on republish cannot undo a newer mute', async () => {
    const f = fixture();
    const republish = deferred();
    try {
      Object.assign(f.participant, { republishPromise: republish.promise });
      const enabling = f.participant.setMicrophoneEnabled(true);
      await f.participant.setMicrophoneEnabled(false);
      republish.resolve(undefined);
      await enabling;
      expect(f.captures()).toBe(0);
      expect(f.publishes()).toBe(0);
    } finally {
      f.cleanup();
    }
  });

  for (const immediateEnable of [false, true]) {
    test(`published processed microphone restores raw capture after ${immediateEnable ? 'immediate' : 'settled'} mute/enable`, async () => {
      const f = fixture();
      const processed = new Source();
      try {
        const first = f.participant.setMicrophoneEnabled(true);
        f.releaseCapture();
        await first;
        const track = f.tracks[0]!;
        Object.assign(track, {
          processor: { processedTrack: processed, destroy: async () => undefined },
        });
        const muting = f.participant.setMicrophoneEnabled(false);
        // The raw source becomes silent before the mutex continuation runs.
        expect(f.source.enabled).toBe(false);
        expect(processed.enabled).toBe(true);
        if (!immediateEnable) await muting;
        const enabling = f.participant.setMicrophoneEnabled(true);
        await Promise.all([muting, enabling]);
        expect(track.isMuted).toBe(false);
        expect(f.source.enabled).toBe(true);
        expect(processed.enabled).toBe(true);
        expect(f.captures()).toBe(1);
      } finally {
        f.cleanup();
      }
    });
  }

  test('mute silences raw capture while its SDK mutex is held', async () => {
    const f = fixture();
    const processed = new Source();
    try {
      const first = f.participant.setMicrophoneEnabled(true);
      f.releaseCapture();
      await first;
      const track = f.tracks[0]!;
      Object.assign(track, {
        processor: { processedTrack: processed, destroy: async () => undefined },
      });
      const mutex = (track as unknown as { muteLock: { lock(): Promise<() => void> } }).muteLock;
      const unlock = await mutex.lock();
      const muting = f.participant.setMicrophoneEnabled(false);
      expect(f.source.enabled).toBe(false);
      expect(processed.enabled).toBe(true);
      await flush();
      expect(track.isMuted).toBe(false);
      unlock();
      await muting;
      expect(track.isMuted).toBe(true);
      await f.participant.setMicrophoneEnabled(true);
      expect(f.source.enabled).toBe(true);
      expect(processed.enabled).toBe(true);
    } finally {
      f.cleanup();
    }
  });

  test('mute reaches a microphone temporarily unpublished during held republish capture', async () => {
    const f = fixture();
    const restart = deferred();
    try {
      const first = f.participant.setMicrophoneEnabled(true);
      f.releaseCapture();
      await first;
      const track = f.tracks[0]!;
      let restarting = false;
      Object.assign(track, {
        async restartTrack() {
          restarting = true;
          await restart.promise;
          f.source.enabled = !track.isMuted;
        },
      });
      // Remove only the server boundary, retaining the installed republish loop.
      Object.assign(f.participant, {
        async unpublishTrack() {
          f.participant.trackPublications.clear();
          f.participant.audioTrackPublications.clear();
        },
      });
      const republishing = f.participant.republishAllTracks();
      await flush();
      expect(restarting).toBe(true);
      expect(f.participant.getTrackPublication(Track.Source.Microphone)).toBeUndefined();
      const muting = f.participant.setMicrophoneEnabled(false);
      expect(f.source.enabled).toBe(false);
      await muting;
      restart.resolve(undefined);
      await republishing;
      expect(f.publishes()).toBe(2);
      expect(f.source.enabled).toBe(false);
      expect(f.participant.isMicrophoneEnabled).toBe(false);
      await f.participant.setMicrophoneEnabled(true);
      expect(f.source.enabled).toBe(true);
    } finally {
      f.cleanup();
    }
  });

  test('closing the engine cancels a held first capture before publication', async () => {
    const f = fixture();
    try {
      const enabling = f.participant.setMicrophoneEnabled(true);
      await flush();
      f.participant.engine.emit(EngineEvent.Closing);
      f.releaseCapture();
      await enabling;
      expect(f.publishes()).toBe(0);
      expect(f.source.enabled).toBe(false);
      expect(f.source.readyState).toBe('ended');
    } finally {
      f.cleanup();
    }
  });

  test('the newest queued enable retries after the previous capture failed', async () => {
    const f = fixture();
    try {
      const getUserMedia = vi.fn(async () => {
        if (getUserMedia.mock.calls.length === 1) return f.capture.promise;
        return new Stream([f.source]);
      });
      Object.assign(navigator.mediaDevices, { getUserMedia });
      const first = f.participant.setMicrophoneEnabled(true);
      const firstFailure = expect(first).rejects.toThrow('Capture failed');
      await flush();
      const newest = f.participant.setMicrophoneEnabled(true);
      f.capture.reject(new Error('Capture failed'));
      await firstFailure;
      expect(await newest).toBeDefined();
      expect(getUserMedia).toHaveBeenCalledTimes(2);
      expect(f.participant.isMicrophoneEnabled).toBe(true);
    } finally {
      f.cleanup();
    }
  });

  test('an internal enable waiting for publication cannot undo a newer mute', async () => {
    const f = fixture(true);
    try {
      const first = f.participant.setMicrophoneEnabled(true);
      f.releaseCapture();
      await flush();
      const waiting = f.participant.setTrackEnabled(Track.Source.Microphone, true);
      await f.participant.setMicrophoneEnabled(false);
      f.publish.resolve();
      await Promise.all([first, waiting]);
      expect(f.source.enabled).toBe(false);
      expect(f.participant.isMicrophoneEnabled).toBe(false);
    } finally {
      f.cleanup();
    }
  });

  test('closing the engine stops capture while publication is pending', async () => {
    const f = fixture(true);
    try {
      const enabling = f.participant.setMicrophoneEnabled(true);
      f.releaseCapture();
      await flush();
      expect(f.publishes()).toBe(1);
      f.participant.engine.emit(EngineEvent.Closing);
      expect(f.source.readyState).toBe('ended');
      expect(f.tracks[0].isStopped).toBe(true);
      f.publish.resolve();
      await enabling;
    } finally {
      f.cleanup();
    }
  });

  test('closing the engine stops a microphone capture reacquired during republish', async () => {
    const f = fixture();
    const capture = deferred<Stream>();
    const candidate = new Source();
    try {
      const enabling = f.participant.setMicrophoneEnabled(true);
      f.releaseCapture();
      await enabling;
      Object.assign(navigator.mediaDevices, { getUserMedia: () => capture.promise });
      Object.assign(f.participant, {
        async unpublishTrack() {
          f.participant.trackPublications.clear();
          f.participant.audioTrackPublications.clear();
        },
      });
      const republishing = f.participant.republishAllTracks();
      await flush();
      expect(f.participant.getTrackPublication(Track.Source.Microphone)).toBeUndefined();
      f.participant.engine.emit(EngineEvent.Closing);
      expect(f.tracks[0].isStopped).toBe(true);
      capture.resolve(new Stream([candidate]));
      await republishing;
      expect(candidate.readyState).toBe('ended');
    } finally {
      f.cleanup();
    }
  });
});
