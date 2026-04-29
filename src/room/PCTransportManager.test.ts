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
  latestOfferId = 0;

  latestAcknowledgedOfferId = 0;

  negotiate = vi.fn(async (_onError?: (e: Error) => void) => {});

  /** Simulate a publisher offer cycle: bump latestOfferId. */
  startOffer() {
    this.latestOfferId += 1;
    return this.latestOfferId;
  }

  /** Simulate a successful answer for the given offerId. */
  answer(offerId: number) {
    this.latestAcknowledgedOfferId = offerId;
    this.emit(PCEvents.OfferAnswered, offerId);
  }
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
    (manager as unknown as { publisher: FakePublisher }).publisher = fake;
    manager.peerConnectionTimeout = 200;
    return { manager, pub: fake };
  }

  it('resolves when an offer past the checkpoint is answered', async () => {
    const { manager, pub } = makeManager();
    const p = manager.negotiate(new AbortController());
    setTimeout(() => {
      const id = pub.startOffer();
      pub.answer(id);
    }, 10);
    await expect(p).resolves.toBeUndefined();
  });

  it('does not resolve on answers for offers at or before the checkpoint', async () => {
    const { manager, pub } = makeManager();
    // Some prior cycle is in flight with id=5 at the moment we capture our
    // checkpoint. Its answer must NOT satisfy our request — our changes
    // weren't in offer 5.
    pub.latestOfferId = 5;
    const ac = new AbortController();
    const p = manager.negotiate(ac);

    let settled = false;
    p.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    pub.answer(5);
    await new Promise((r) => setTimeout(r, 50));
    expect(settled).toBe(false);

    ac.abort();
    await expect(p).rejects.toThrow(/aborted/);
  });

  it('resolves through the renegotiate-recursion path', async () => {
    // Reproduces the field shape: we capture checkpoint=N while an offer N is
    // in flight. The answer for N arrives (renegotiate=true on the publisher,
    // so it doesn't satisfy us), then a follow-up offer N+1 is created and
    // answered. We resolve on the second answer.
    const { manager, pub } = makeManager();
    pub.latestOfferId = 1;
    const p = manager.negotiate(new AbortController());

    setTimeout(() => pub.answer(1), 10); // does not satisfy checkpoint=1
    setTimeout(() => {
      const id = pub.startOffer(); // 2
      pub.answer(id);
    }, 30);

    await expect(p).resolves.toBeUndefined();
  });

  it('resolves immediately when an answer past the checkpoint already arrived', async () => {
    const { manager, pub } = makeManager();
    pub.latestOfferId = 3;
    pub.latestAcknowledgedOfferId = 4;
    await expect(manager.negotiate(new AbortController())).resolves.toBeUndefined();
  });

  it('resolves concurrent callers independently at their own checkpoints', async () => {
    const { manager, pub } = makeManager();

    // A captures checkpoint=0
    const a = manager.negotiate(new AbortController());
    let aResolved = false;
    a.then(() => {
      aResolved = true;
    });

    // First cycle starts and answers — A is satisfied (1 > 0)
    const id1 = pub.startOffer();

    // B captures checkpoint=1 (an offer is now in flight)
    const b = manager.negotiate(new AbortController());
    let bResolved = false;
    b.then(() => {
      bResolved = true;
    });

    pub.answer(id1);
    await new Promise((r) => setTimeout(r, 0));
    expect(aResolved).toBe(true);
    expect(bResolved).toBe(false);

    // B should resolve only on the next cycle
    const id2 = pub.startOffer();
    pub.answer(id2);
    await b;
    expect(bResolved).toBe(true);
  });

  it('rejects when the deadline elapses', async () => {
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

  describe('listener cleanup', () => {
    it('after success', async () => {
      const { manager, pub } = makeManager();
      const p = manager.negotiate(new AbortController());
      const id = pub.startOffer();
      pub.answer(id);
      await p;
      expect(pub.listenerCount(PCEvents.OfferAnswered)).toBe(0);
    });

    it('after non-matching answer (still pending), then abort', async () => {
      const { manager, pub } = makeManager();
      pub.latestOfferId = 5;
      const ac = new AbortController();
      const p = manager.negotiate(ac);
      pub.answer(5); // does not satisfy checkpoint=5
      expect(pub.listenerCount(PCEvents.OfferAnswered)).toBe(1);
      ac.abort();
      await expect(p).rejects.toThrow(/aborted/);
      expect(pub.listenerCount(PCEvents.OfferAnswered)).toBe(0);
    });

    it('after deadline', async () => {
      const { manager, pub } = makeManager();
      await expect(manager.negotiate(new AbortController())).rejects.toThrow(/timed out/);
      expect(pub.listenerCount(PCEvents.OfferAnswered)).toBe(0);
    });

    it('after abort', async () => {
      const { manager, pub } = makeManager();
      const ac = new AbortController();
      const p = manager.negotiate(ac);
      setTimeout(() => ac.abort(), 10);
      await expect(p).rejects.toThrow(/aborted/);
      expect(pub.listenerCount(PCEvents.OfferAnswered)).toBe(0);
    });

    it('after publisher.negotiate errors', async () => {
      const { manager, pub } = makeManager();
      pub.negotiate.mockImplementationOnce(async (onError?: (e: Error) => void) => {
        onError?.(new Error('publisher boom'));
      });
      await expect(manager.negotiate(new AbortController())).rejects.toThrow(/publisher boom/);
      expect(pub.listenerCount(PCEvents.OfferAnswered)).toBe(0);
    });

    it('does not leak across many sequential negotiate() calls', async () => {
      const { manager, pub } = makeManager();
      for (let i = 0; i < 12; i += 1) {
        const p = manager.negotiate(new AbortController());
        const id = pub.startOffer();
        pub.answer(id);
        await p;
      }
      expect(pub.listenerCount(PCEvents.OfferAnswered)).toBe(0);
    });
  });

  // Regression test for the field hang on Windows 11 with slow Camera Frame
  // Server. With the old design, NegotiationStarted firing faster than
  // peerConnectionTimeout kept resetting the timer indefinitely while
  // NegotiationComplete was suppressed by an unconverging `renegotiate` cycle,
  // wedging the publishTrack Promise. The offerId-checkpoint design resolves
  // on the first answer past the checkpoint, regardless of how many cycles
  // start in between.
  it('does not hang when many spurious cycles start without converging on the checkpoint', async () => {
    const { manager, pub } = makeManager();
    manager.peerConnectionTimeout = 1500;
    pub.latestOfferId = 1; // an unrelated cycle is in flight
    const p = manager.negotiate(new AbortController());

    // Lots of NegotiationStarted noise (not listened to anymore) and a few
    // answers that don't satisfy the checkpoint.
    const noise = setInterval(() => pub.emit(PCEvents.NegotiationStarted), 30);
    setTimeout(() => pub.answer(1), 50); // doesn't satisfy
    setTimeout(() => {
      const id = pub.startOffer(); // 2
      pub.answer(id);
    }, 200);

    try {
      await expect(p).resolves.toBeUndefined();
    } finally {
      clearInterval(noise);
    }
  });
});
