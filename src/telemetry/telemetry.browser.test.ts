import { expect, inject, test } from 'vitest';
import { Telemetry } from '.';
import Room, { ConnectionState } from '../room/Room';
import { RoomEvent } from '../room/events';

/**
 * One session through the whole integrated path: a real Chromium with fake media devices, a real
 * `livekit-server --dev`, and the collector that fans out to the same Grafana LGTM stack the mobile
 * harness writes to. Two Rooms in one page, so the session has an inbound and an outbound side.
 *
 *   pnpm vitest run --config vitest.telemetry.config.mts
 */
const { url, endpoint, headers, publisherToken, subscriberToken } = inject('telemetry');

async function poll(what: string, condition: () => boolean, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`timed out waiting for ${what}`);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('a session reports itself: connect span, stats windows, disconnect', async () => {
  Telemetry.configure({
    endpoint,
    headers,
    flushInterval: 1,
    statsWindow: 2,
    resource: {
      'service.name': 'livekit-client-js',
      'service.version': '2.22.3-telemetry',
      'os.name': 'browser',
    },
  });
  expect(Telemetry.enabled).toBe(true);

  const publisher = new Room();
  const subscriber = new Room();
  await publisher.connect(url, publisherToken);
  await subscriber.connect(url, subscriberToken);
  expect(publisher.state).toBe(ConnectionState.Connected);

  const media = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  await publisher.localParticipant.publishTrack(media.getAudioTracks()[0]);
  await publisher.localParticipant.publishTrack(media.getVideoTracks()[0]);

  await poll('the subscriber to receive both tracks', () => {
    const remote = Array.from(subscriber.remoteParticipants.values())[0];
    return !!remote?.audioTrackPublications.size && !!remote?.videoTrackPublications.size;
  });

  // Two stats windows on both sides…
  await sleep(6000);

  // …then both reconnect paths, which are their own spans.
  for (const scenario of ['resume-reconnect', 'full-reconnect'] as const) {
    const reconnected = new Promise((resolve) => publisher.once(RoomEvent.Reconnected, resolve));
    await publisher.simulateScenario(scenario);
    await reconnected;
    await sleep(1000);
  }

  await publisher.disconnect();
  await subscriber.disconnect();
  await sleep(1500);
  await Telemetry.flush();

  const diagnostics = Telemetry.diagnostics();
  console.log('telemetry:', diagnostics);
  expect(diagnostics).toContain('lost 0');
  expect(diagnostics).not.toContain('sent 0 batches');
}, 90_000);
