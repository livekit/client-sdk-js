import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PCEvents } from './PCTransport';
import { PCTransportManager } from './PCTransportManager';

/**
 * Yield to the microtask queue so any then/catch handlers chained to a promise
 * have a chance to run. Sufficient for "is this promise still pending right
 * now?" assertions; nothing in these tests depends on real elapsed time.
 */
const flushMicrotasks = () => Promise.resolve();

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

    const id = pub.startOffer();
    pub.answer(id);

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
    await flushMicrotasks();
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

    pub.answer(1); // does not satisfy checkpoint=1

    const id = pub.startOffer(); // 2
    pub.answer(id);

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

    // First cycle starts; B captures checkpoint=1 (offer now in flight)
    const id1 = pub.startOffer();
    const b = manager.negotiate(new AbortController());

    let bResolved = false;
    b.then(() => {
      bResolved = true;
    });

    // The first answer satisfies A (1 > 0) but not B (1 > 1 is false).
    pub.answer(id1);
    await a;
    expect(bResolved).toBe(false);

    // The next cycle's answer satisfies B.
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
    const p = manager.negotiate(ac);
    ac.abort();
    await expect(p).rejects.toThrow(/aborted/);
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
      ac.abort();
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

  // Regression test for publishing call getting stuck
  // With the old design, NegotiationStarted firing faster than
  // peerConnectionTimeout kept resetting the timer indefinitely while
  // NegotiationComplete was suppressed by an unconverging `renegotiate` cycle,
  // wedging the publishTrack Promise. The offerId-checkpoint design resolves
  // on the first answer past the checkpoint, regardless of how many cycles
  // start in between.
  it('does not hang when many spurious cycles start without converging on the checkpoint', async () => {
    const { manager, pub } = makeManager();
    pub.latestOfferId = 1; // an unrelated cycle is in flight
    const p = manager.negotiate(new AbortController());

    // NegotiationStarted noise (not listened to anymore) interleaved with an
    // answer for the in-flight offer that doesn't satisfy our checkpoint.
    pub.emit(PCEvents.NegotiationStarted);
    pub.emit(PCEvents.NegotiationStarted);
    pub.answer(1); // doesn't satisfy checkpoint=1
    pub.emit(PCEvents.NegotiationStarted);

    // Eventually a fresh offer is created and answered.
    const id = pub.startOffer(); // 2
    pub.answer(id);

    await expect(p).resolves.toBeUndefined();
  });
});

describe('PCTransportManager.triggerIceRestart', () => {
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

  /**
   * The subscriber must keep applying remote candidates across a reconnect.
   *
   * Putting it into `restartingIce` would queue them until a new remote description arrives —
   * but the server only re-offers the subscriber when the reconnect moved us to another node,
   * so on an ordinary signal-only resume nothing would ever flush that queue, and the
   * transport would stop adopting new network paths for the rest of the session. The server
   * also never sends candidates ahead of the offer that introduces them, so queueing buys
   * nothing in exchange.
   */
  it('does not stop the subscriber applying remote candidates', async () => {
    const manager = new PCTransportManager('subscriber-primary', {});
    const publisher = new FakePublisher();
    (manager as unknown as { publisher: FakePublisher }).publisher = publisher;

    await manager.triggerIceRestart();

    expect(manager.subscriber?.restartingIce).toBe(false);
  });
});

describe('PCTransportManager video receive codecs', () => {
  const withoutAV1 = (codec: RTCRtpCodec) => codec.mimeType.toLowerCase() !== 'video/av1';

  beforeEach(() => {
    vi.stubGlobal('RTCPeerConnection', StubPC);
    vi.stubGlobal('RTCRtpReceiver', {
      getCapabilities: () => ({
        codecs: [
          { mimeType: 'video/H264', clockRate: 90000 },
          { mimeType: 'video/AV1', clockRate: 90000 },
        ],
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** A transceiver of `kind` whose codec preference calls are recorded into `calls`. */
  const transceiverOf = (kind: string, calls: string[] = []) => ({
    receiver: { track: { kind } },
    setCodecPreferences: vi.fn((codecs: RTCRtpCodec[]) => {
      calls.push(`setCodecPreferences:${kind}:${codecs.map((c) => c.mimeType).join(',')}`);
    }),
  });

  describe('createSubscriberAnswerFromOffer', () => {
    /** A subscriber whose calls are recorded in order, with one video and one audio transceiver. */
    function makeManager(
      filter?: (codec: RTCRtpCodec) => boolean,
      { offerApplies }: { offerApplies: boolean } = { offerApplies: true },
    ) {
      const calls: string[] = [];
      const video = transceiverOf('video', calls);
      const audio = transceiverOf('audio', calls);
      const subscriber = {
        getSignallingState: () => 'stable',
        setRemoteDescription: vi.fn(async () => {
          calls.push('setRemoteDescription');
          return offerApplies;
        }),
        getTransceivers: () => [video, audio],
        createAndSetAnswer: vi.fn(async () => {
          calls.push('createAndSetAnswer');
          return { type: 'answer', sdp: '' };
        }),
      };
      const manager = new PCTransportManager('subscriber-primary', {}, undefined, filter);
      (manager as unknown as { subscriber: typeof subscriber }).subscriber = subscriber;
      return { manager, calls, video, audio };
    }

    const offer: RTCSessionDescriptionInit = { type: 'offer', sdp: '' };

    it('restricts the receive video codecs between applying the offer and answering it', async () => {
      const { manager, calls, audio } = makeManager(withoutAV1);

      await manager.createSubscriberAnswerFromOffer(offer, 1);

      expect(calls).toEqual([
        'setRemoteDescription',
        'setCodecPreferences:video:video/H264',
        'createAndSetAnswer',
      ]);
      expect(audio.setCodecPreferences).not.toHaveBeenCalled();
    });

    it('restricts a transceiver only once across offers', async () => {
      const { manager, video } = makeManager(withoutAV1);

      await manager.createSubscriberAnswerFromOffer(offer, 1);
      await manager.createSubscriberAnswerFromOffer(offer, 2);

      expect(video.setCodecPreferences).toHaveBeenCalledOnce();
    });

    it('leaves codec preferences alone without a filter', async () => {
      const { manager, video } = makeManager();

      await manager.createSubscriberAnswerFromOffer(offer, 1);

      expect(video.setCodecPreferences).not.toHaveBeenCalled();
    });

    it('does not touch codec preferences for an offer that was not applied', async () => {
      const { manager, video } = makeManager(withoutAV1, { offerApplies: false });

      await expect(manager.createSubscriberAnswerFromOffer(offer, 1)).resolves.toBeUndefined();
      expect(video.setCodecPreferences).not.toHaveBeenCalled();
    });

    it('swallows rejected preferences rather than failing the answer', async () => {
      const { manager, video } = makeManager(withoutAV1);
      video.setCodecPreferences.mockImplementation(() => {
        throw new Error('InvalidModificationError');
      });

      await expect(manager.createSubscriberAnswerFromOffer(offer, 1)).resolves.toBeDefined();
    });
  });

  describe('addPublisherTransceiverOfKind', () => {
    /** A manager whose publisher hands out `transceiver` for every added transceiver. */
    function makeManager(mode: 'publisher-only' | 'publisher-primary') {
      const manager = new PCTransportManager(mode, {}, undefined, withoutAV1);
      const transceiver = transceiverOf('video');
      (
        manager.publisher as unknown as { addTransceiverOfKind: () => unknown }
      ).addTransceiverOfKind = () => transceiver;
      return { manager, transceiver };
    }

    it('restricts the receive-only video sections media arrives on', () => {
      const { manager, transceiver } = makeManager('publisher-only');

      manager.addPublisherTransceiverOfKind('video', { direction: 'recvonly' });

      expect(transceiver.setCodecPreferences).toHaveBeenCalledOnce();
    });

    it('leaves the publisher sections alone when media arrives on the subscriber', () => {
      const { manager, transceiver } = makeManager('publisher-primary');

      manager.addPublisherTransceiverOfKind('video', { direction: 'recvonly' });

      expect(transceiver.setCodecPreferences).not.toHaveBeenCalled();
    });
  });
});
