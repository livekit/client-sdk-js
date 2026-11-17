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
      publisher.removeTrack(sender, true);
      await negotiate(publisher, remote);
    }

    expect(publisher.getTransceivers()).toHaveLength(1);
    expect(publisher.getTransceivers()[0]).toBe(kept);
    expect(kept.currentDirection).toBe('sendonly');
  });

  it('keeps the only transceiver, so the connection keeps its transport', async () => {
    publisher = new PCTransport();
    remote = new RTCPeerConnection();
    const pc = (publisher as unknown as { pc: RTCPeerConnection }).pc;
    const { sender } = publisher.addTransceiver(videoTrack(), { direction: 'sendonly' });
    await negotiate(publisher, remote);
    const transport = sender.transport;

    publisher.removeTrack(sender, true);
    await negotiate(publisher, remote);
    publisher.addTransceiver(videoTrack(), { direction: 'sendonly' });
    await negotiate(publisher, remote);

    expect(transport).not.toBeNull();
    expect(publisher.getTransceivers()).toHaveLength(2);
    expect(publisher.getTransceivers()[1].sender.transport).toBe(transport);
    expect(pc.localDescription!.sdp).not.toContain('m=video 0 ');
  });

  it('keeps the last transceiver of each kind', async () => {
    publisher = new PCTransport();
    remote = new RTCPeerConnection();
    const video = publisher.addTransceiver(videoTrack(), { direction: 'sendonly' });
    const audio = publisher.addTransceiverOfKind('audio', { direction: 'sendonly' });
    const secondVideo = publisher.addTransceiver(videoTrack(), { direction: 'sendonly' });
    await negotiate(publisher, remote);

    publisher.removeTrack(video.sender, true);
    publisher.removeTrack(audio.sender, true);
    publisher.removeTrack(secondVideo.sender, true);
    await negotiate(publisher, remote);

    expect(video.direction).toBe('stopped');
    expect(audio.direction).not.toBe('stopped');
    expect(secondVideo.direction).not.toBe('stopped');
  });

  it('returns false when no transceiver has the sender', async () => {
    publisher = new PCTransport();
    remote = new RTCPeerConnection();
    const { sender } = new RTCPeerConnection().addTransceiver('video');

    expect(publisher.stopTransceivers([sender])).toBe(false);
  });
});
