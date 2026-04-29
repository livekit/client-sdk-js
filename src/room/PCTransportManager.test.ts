import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PCEvents } from './PCTransport';
import { PCTransportManager } from './PCTransportManager';

class StubPC {
  iceConnectionState: RTCIceConnectionState = 'new';

  signalingState: RTCSignalingState = 'stable';

  connectionState: RTCPeerConnectionState = 'new';

  onicecandidate: ((ev: RTCPeerConnectionIceEvent) => void) | null = null;

  onicecandidateerror: ((ev: Event) => void) | null = null;

  oniceconnectionstatechange: (() => void) | null = null;

  onsignalingstatechange: (() => void) | null = null;

  onconnectionstatechange: (() => void) | null = null;

  ondatachannel: ((ev: RTCDataChannelEvent) => void) | null = null;

  ontrack: ((ev: RTCTrackEvent) => void) | null = null;

  getTransceivers() {
    return [];
  }

  getSenders() {
    return [];
  }

  close() {}

  setConfiguration() {}
}

class FakePublisher extends EventEmitter {
  negotiate = vi.fn(async (_onError?: (e: Error) => void) => {});
}

describe('PCTransportManager.negotiate', () => {
  let originalRTCPeerConnection: unknown;

  beforeEach(() => {
    originalRTCPeerConnection = (globalThis as unknown as { RTCPeerConnection?: unknown })
      .RTCPeerConnection;
    (globalThis as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection = StubPC;
  });

  afterEach(() => {
    (globalThis as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection =
      originalRTCPeerConnection;
  });

  function makeManager() {
    const manager = new PCTransportManager('publisher-only', {});
    const fake = new FakePublisher();
    // swap in the fake publisher so we control the event surface and avoid
    // exercising any real PeerConnection plumbing
    (manager as unknown as { publisher: FakePublisher }).publisher = fake;
    manager.peerConnectionTimeout = 200;
    return { manager, pub: fake };
  }

  it('resolves when NegotiationComplete fires', async () => {
    const { manager, pub } = makeManager();
    const ac = new AbortController();
    const p = manager.negotiate(ac);
    setTimeout(() => pub.emit(PCEvents.NegotiationComplete), 10);
    await expect(p).resolves.toBeUndefined();
  });

  it('rejects when the initial timeout elapses', async () => {
    const { manager } = makeManager();
    await expect(manager.negotiate(new AbortController())).rejects.toThrow(/timed out/);
  });

  it('rejects when the abort signal fires', async () => {
    const { manager } = makeManager();
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 10);
    await expect(manager.negotiate(ac)).rejects.toThrow(/aborted/);
  });

  it('rejects when publisher.negotiate invokes its error callback', async () => {
    const { manager, pub } = makeManager();
    pub.negotiate.mockImplementationOnce(async (onError?: (e: Error) => void) => {
      onError?.(new Error('publisher boom'));
    });
    await expect(manager.negotiate(new AbortController())).rejects.toThrow(/publisher boom/);
  });

  it('removes all listeners after NegotiationComplete resolves the promise', async () => {
    const { manager, pub } = makeManager();
    const p = manager.negotiate(new AbortController());
    pub.emit(PCEvents.NegotiationComplete);
    await p;
    expect(pub.listenerCount(PCEvents.NegotiationStarted)).toBe(0);
    expect(pub.listenerCount(PCEvents.NegotiationComplete)).toBe(0);
  });

  // BUG: the initial setTimeout at PCTransportManager.ts:232-234 rejects without
  // calling cleanup(), so the NegotiationStarted handler, the abort handler,
  // and the once(NegotiationComplete) handler all leak after the first timeout.
  it('removes all listeners after the initial timeout rejects', async () => {
    const { manager, pub } = makeManager();
    await expect(manager.negotiate(new AbortController())).rejects.toThrow(/timed out/);
    expect(pub.listenerCount(PCEvents.NegotiationStarted)).toBe(0);
    expect(pub.listenerCount(PCEvents.NegotiationComplete)).toBe(0);
  });

  // BUG: cleanup() at PCTransportManager.ts:236-240 never offs the
  // once(NegotiationComplete) handler. After abort/cycle-reset timeout/
  // publisher error, that listener accumulates over repeated negotiate() calls
  // (matching the "11 negotiationComplete listeners added" warning seen in
  // production sessions that hit this hang).
  it('removes the NegotiationComplete listener after the cycle-reset timeout rejects', async () => {
    const { manager, pub } = makeManager();
    const p = manager.negotiate(new AbortController());
    // switch onto the resettable timer path
    pub.emit(PCEvents.NegotiationStarted);
    await expect(p).rejects.toThrow(/timed out/);
    expect(pub.listenerCount(PCEvents.NegotiationComplete)).toBe(0);
  });

  it('removes the NegotiationComplete listener after abort rejects', async () => {
    const { manager, pub } = makeManager();
    const ac = new AbortController();
    const p = manager.negotiate(ac);
    setTimeout(() => ac.abort(), 10);
    await expect(p).rejects.toThrow(/aborted/);
    expect(pub.listenerCount(PCEvents.NegotiationComplete)).toBe(0);
  });

  it('removes the NegotiationComplete listener after publisher.negotiate errors', async () => {
    const { manager, pub } = makeManager();
    pub.negotiate.mockImplementationOnce(async (onError?: (e: Error) => void) => {
      onError?.(new Error('publisher boom'));
    });
    await expect(manager.negotiate(new AbortController())).rejects.toThrow(/publisher boom/);
    expect(pub.listenerCount(PCEvents.NegotiationComplete)).toBe(0);
  });

  // ROOT-CAUSE TEST: reproduces the field hang reported on Windows 11 with a
  // slow Camera Frame Server. Every NegotiationStarted resets the timer
  // (PCTransportManager.ts:252-261, introduced in PR #1813). If something keeps
  // emitting NegotiationStarted faster than peerConnectionTimeout — e.g.
  // ensureDataTransportConnected calling publisher.negotiate() while ICE isn't
  // up, or repeated server-driven MediaSectionsRequirement updates — the
  // outer Promise neither resolves nor rejects. publishTrack's
  // Promise.all([addTrackPromise, negotiate()]) is then wedged forever even
  // though the underlying PC has already finished offer/answer. The fix is to
  // bound the resettable cycle with a non-resettable max deadline.
  it('does not hang when NegotiationStarted keeps resetting the timer', async () => {
    const { manager, pub } = makeManager();
    manager.peerConnectionTimeout = 100;
    const ac = new AbortController();
    const p = manager.negotiate(ac);
    // swallow whichever way it eventually settles (or doesn't)
    p.catch(() => {});

    const interval = setInterval(() => pub.emit(PCEvents.NegotiationStarted), 30);

    try {
      const settled = await Promise.race([
        p.then(
          () => 'resolved' as const,
          () => 'rejected' as const,
        ),
        new Promise<'hung'>((res) => setTimeout(() => res('hung'), 1500)),
      ]);
      expect(settled, 'negotiate() never settled — timer keeps resetting').not.toBe('hung');
    } finally {
      clearInterval(interval);
      ac.abort();
    }
  });
});
