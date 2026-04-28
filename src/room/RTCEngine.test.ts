import { afterEach, describe, expect, it, vi } from 'vitest';
import RTCEngine from './RTCEngine';
import { roomOptionDefaults } from './defaults';

describe('RTCEngine', () => {
  const originalRTCRtpSender = window.RTCRtpSender;

  afterEach(() => {
    Object.defineProperty(window, 'RTCRtpSender', {
      configurable: true,
      value: originalRTCRtpSender,
      writable: true,
    });
  });

  function stubInsertableStreamsSupport() {
    class MockRTCRtpSender {
      createEncodedStreams() {}
    }

    Object.defineProperty(window, 'RTCRtpSender', {
      configurable: true,
      value: MockRTCRtpSender,
      writable: true,
    });
  }

  function makeRTCConfiguration(engine: RTCEngine) {
    return (
      engine as unknown as { makeRTCConfiguration: () => RTCConfiguration }
    ).makeRTCConfiguration();
  }

  function setupSenderPassthrough(engine: RTCEngine, sender: RTCRtpSender) {
    (
      engine as unknown as { setupSenderPassthrough: (sender: RTCRtpSender) => void }
    ).setupSenderPassthrough(sender);
  }

  it('does not enable encoded insertable streams without E2EE or a packet trailer worker', () => {
    stubInsertableStreamsSupport();

    const engine = new RTCEngine(roomOptionDefaults);

    expect(makeRTCConfiguration(engine).encodedInsertableStreams).toBeUndefined();
  });

  it('enables encoded insertable streams when a packet trailer worker is configured', () => {
    stubInsertableStreamsSupport();

    const engine = new RTCEngine({
      ...roomOptionDefaults,
      packetTrailer: { worker: {} as Worker },
    });

    expect(makeRTCConfiguration(engine).encodedInsertableStreams).toBe(true);
  });

  it('enables encoded insertable streams for E2EE', () => {
    stubInsertableStreamsSupport();

    const engine = new RTCEngine(roomOptionDefaults);
    (
      engine as unknown as {
        signalOpts: {
          autoSubscribe: boolean;
          maxRetries: number;
          e2eeEnabled: boolean;
          websocketTimeout: number;
        };
      }
    ).signalOpts = {
      autoSubscribe: true,
      maxRetries: 1,
      e2eeEnabled: true,
      websocketTimeout: 15_000,
    };

    expect(makeRTCConfiguration(engine).encodedInsertableStreams).toBe(true);
  });

  it('does not create sender encoded streams when packetTrailer has no worker', () => {
    const engine = new RTCEngine({
      ...roomOptionDefaults,
      packetTrailer: {} as never,
    });
    const createEncodedStreams = vi.fn();
    const sender = {
      createEncodedStreams,
    } as unknown as RTCRtpSender;

    setupSenderPassthrough(engine, sender);

    expect(createEncodedStreams).not.toHaveBeenCalled();
  });
});
