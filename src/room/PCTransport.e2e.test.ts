import { afterEach, describe, expect, it } from 'vitest';
import PCTransport from './PCTransport';

// Runs in real Chromium (vitest.e2e.config.mts). No server: the publisher negotiates with a
// local RTCPeerConnection, so the transceivers go through a real offer/answer.

function videoTrack() {
  const canvas = document.createElement('canvas');
  canvas.getContext('2d');
  return canvas.captureStream().getVideoTracks()[0];
}

async function negotiate(publisher: PCTransport, remote: RTCPeerConnection) {
  const pc = (publisher as unknown as { pc: RTCPeerConnection }).pc;
  await pc.setLocalDescription(await pc.createOffer());
  await remote.setRemoteDescription(pc.localDescription!);
  await remote.setLocalDescription(await remote.createAnswer());
  await pc.setRemoteDescription(remote.localDescription!);
}

describe('PCTransport.stopTransceivers', () => {
  let publisher: PCTransport;
  let remote: RTCPeerConnection;

  afterEach(async () => {
    await publisher.close();
    remote.close();
  });

  it('keeps the transceiver count flat across publish and unpublish cycles', async () => {
    publisher = new PCTransport();
    remote = new RTCPeerConnection();
    const kept = publisher.addTransceiver(videoTrack(), { direction: 'sendonly' });

    for (let i = 0; i < 5; i += 1) {
      const { sender } = publisher.addTransceiver(videoTrack(), { direction: 'sendonly' });
      await negotiate(publisher, remote);
      publisher.removeTrack(sender);
      expect(publisher.stopTransceivers([sender])).toBe(true);
      await negotiate(publisher, remote);
    }

    expect(publisher.getTransceivers()).toEqual([kept]);
    expect(kept.currentDirection).toBe('sendonly');
  });

  it('returns false when no transceiver has the sender', async () => {
    publisher = new PCTransport();
    remote = new RTCPeerConnection();
    const { sender } = new RTCPeerConnection().addTransceiver('video');

    expect(publisher.stopTransceivers([sender])).toBe(false);
  });
});
