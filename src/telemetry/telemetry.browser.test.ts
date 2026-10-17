import { describe, expect, inject, test, vi } from 'vitest';
import { configureTelemetryHost, disableTelemetry, telemetry } from '.';
import { getLogger } from '../logger';
import Room from '../room/Room';
import { RoomEvent } from '../room/events';
import { Track } from '../room/track/Track';
import type { LogRecord, SpanRecord, TelemetryRecord } from './otlp';

/**
 * The telemetry story, end to end in a real Chromium: a publisher and a subscriber on a real
 * `livekit-server --dev`, every batch sent to a real OTLP collector (the local LGTM stack when it
 * runs), and the records inspected as they are cached. Skips when either service is unreachable
 * (see `telemetrySetup.ts`).
 *
 *   pnpm test:e2e                                           # with the signal e2e suite
 *   pnpm vitest run --config vitest.telemetry.config.mts    # this story alone
 */
const { url, unavailable, publisherToken, subscriberToken } = inject('telemetry');
// the collector, proxied through the page's origin by vitest.e2e.config.mts
const endpoint = `${location.origin}/__otlp`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const once = (room: Room, event: RoomEvent) =>
  new Promise<void>((resolve) => room.once(event, () => resolve()));

/** A canvas and an oscillator: media that flows without a camera, a microphone or a permission. */
function mockMedia() {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 120;
  const paint2d = canvas.getContext('2d')!;
  let hue = 0;
  const paint = () => {
    hue = (hue + 7) % 360;
    paint2d.fillStyle = `hsl(${hue} 80% 50%)`;
    paint2d.fillRect(0, 0, canvas.width, canvas.height);
  };
  paint();
  const painter = setInterval(paint, 66);
  const audioContext = new AudioContext();
  const oscillator = audioContext.createOscillator();
  const destination = audioContext.createMediaStreamDestination();
  oscillator.connect(destination);
  oscillator.start();
  return {
    video: canvas.captureStream(15).getVideoTracks()[0],
    audio: destination.stream.getAudioTracks()[0],
    stop: () => {
      clearInterval(painter);
      oscillator.stop();
      audioContext.close().catch(() => {});
    },
  };
}

describe.skipIf(!!unavailable)('telemetry story', () => {
  test('one call reports every span, window and event, then opts out', async () => {
    configureTelemetryHost({ endpoint });
    const records: TelemetryRecord[] = [];
    telemetry.pipeline.onBatch = (batch) => records.push(...batch);
    const spans = (name: string) =>
      records.filter((r): r is SpanRecord => r.kind === 'span' && r.name === name);
    const events = (name: string) =>
      records.filter((r): r is LogRecord => r.kind === 'log' && r.eventName === name);
    const okSubscribes = () =>
      spans('lk.subscribe').filter((s) => s.attributes['lk.outcome'] === 'ok');
    const settle = async (what: string, condition: () => boolean, timeout = 20_000) => {
      const deadline = Date.now() + timeout;
      while (!condition()) {
        if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
        await telemetry.pipeline.flush();
        await sleep(250);
      }
    };
    const setServer = vi.spyOn(telemetry.pipeline, 'setServer');
    const marker = `e2e-${Date.now()}`;

    // connect, with a correlation attribute set before the first record
    const publisher = new Room();
    publisher.setTelemetryAttribute('app.call_id', marker);
    publisher.setTelemetryAttribute('lk.room.sid', 'spoof'); // reserved: rejected, counted
    await publisher.connect(url, publisherToken);
    const media = mockMedia();
    await publisher.localParticipant.publishTrack(media.audio, {
      source: Track.Source.Microphone,
    });

    // a late joiner subscribes to the track the join announced, then to a later publish
    const subscriber = new Room();
    await subscriber.connect(url, subscriberToken);
    await settle('first media on the join-time subscribe', () => okSubscribes().length >= 1);
    await publisher.localParticipant.publishTrack(media.video, { source: Track.Source.Camera });
    await settle('first media on the published track', () => okSubscribes().length >= 2);

    // a manual unsubscribe / subscribe is a new intent
    const remote = Array.from(subscriber.remoteParticipants.values())[0];
    const microphone = remote.getTrackPublication(Track.Source.Microphone)!;
    const unsubscribed = once(subscriber, RoomEvent.TrackUnsubscribed);
    microphone.setSubscribed(false);
    await unsubscribed;
    microphone.setSubscribed(true);
    await settle('first media on the manual subscribe', () => okSubscribes().length >= 3);

    // both reconnect paths
    for (const scenario of ['resume-reconnect', 'full-reconnect'] as const) {
      const reconnected = once(publisher, RoomEvent.Reconnected);
      await publisher.simulateScenario(scenario);
      await reconnected;
    }
    await settle('both reconnect spans', () => spans('lk.reconnect').length >= 2);

    // a refreshed token, through the path the SFU's own refresh takes (it arrives minutes later)
    const servers = setServer.mock.calls.length;
    publisher.engine.client.onTokenRefresh?.(publisherToken);
    expect(setServer.mock.calls.length).toBe(servers + 1);

    // the app's event, an SDK warning, and the device state a browser cannot see
    publisher.emitTelemetryEvent('e2e.checkpoint', { step: 'reconnected' });
    publisher.emitTelemetryEvent('', {}); // invalid: counted, never sent
    // the Room's own logger: its line is the Room's by identity
    (publisher as unknown as { log: { warn: (message: string) => void } }).log.warn(
      'e2e: a warning for telemetry',
    );
    telemetry.pipeline.deviceState({
      thermal: 'serious',
      lowPower: true,
      memory: 'warning',
      batteryCharge: 0.15,
      batteryState: 'discharging',
      networkType: 'cell',
      networkExpensive: true,
    });
    telemetry.pipeline.emit('lk.device.audio_route.changed', {
      'lk.device.audio_route.reason': 'new_device',
      'lk.device.audio_route.outputs': 'bluetooth',
    });
    telemetry.pipeline.emit('lk.device.audio.interruption', {
      'lk.device.audio.interruption': 'began',
    });
    telemetry.captureFailed(new DOMException('denied', 'NotAllowedError'), 'camera');

    // hang up: the open windows ship, the session summary goes with the last upload
    await publisher.disconnect();
    await subscriber.disconnect();
    media.stop();

    // a connect the server refuses, and one the app cancels while it is in flight
    await expect(new Room().connect(url, 'not-a-token')).rejects.toThrow();
    const aborted = new Room();
    const connecting = aborted.connect(url, subscriberToken);
    await new Promise<void>((resolve) =>
      aborted.once(RoomEvent.ConnectionStateChanged, () => resolve()),
    );
    await aborted.disconnect();
    await connecting.catch(() => {});
    await telemetry.pipeline.flush(true);

    console.log(
      `telemetry e2e: app.call_id=${marker} traces ${spans('lk.connect')
        .map((s) => s.traceId)
        .join(', ')}`,
    );

    // spans: two connects succeeded, one failed, one was cancelled
    const outcomes = spans('lk.connect').map((s) => s.attributes['lk.outcome']);
    expect(outcomes.filter((o) => o === 'ok')).toHaveLength(2);
    expect(outcomes).toContain('error');
    expect(outcomes).toContain('cancelled');
    const failed = spans('lk.connect').find((s) => s.attributes['lk.outcome'] === 'error')!;
    expect(failed.status).toBe(2);
    expect(failed.attributes['error.type']).toBeTruthy();
    const connects = spans('lk.connect').filter((s) => s.attributes['lk.outcome'] === 'ok');
    for (const connect of connects) {
      expect(connect.attributes).toMatchObject({ 'lk.outcome': 'ok', 'lk.connect.attempt': 1 });
      const names = connect.events.map((e) => e.name);
      expect(names).toEqual(expect.arrayContaining(['pc_connected', 'room_connected']));
      // the required checkpoints, in SPEC's order
      const required = ['ws_open', 'signal', 'join_recv', 'pc_created'].map((s) =>
        names.indexOf(s),
      );
      expect(required.every((at, i) => at >= 0 && (i === 0 || at > required[i - 1]))).toBe(true);
    }
    // two publishes, both republished by the full reconnect
    const publishes = spans('lk.publish');
    expect(publishes.length).toBeGreaterThanOrEqual(4);
    expect(publishes.map((s) => s.attributes['lk.track.source'])).toEqual(
      expect.arrayContaining(['camera', 'microphone']),
    );
    for (const publish of publishes) {
      expect(publish.attributes['lk.outcome']).toBe('ok');
      expect(publish.attributes['lk.track.sid']).toMatch(/^TR_/);
      expect(publish.attributes['app.call_id']).toBe(marker);
    }
    for (const subscribe of okSubscribes()) {
      expect(subscribe.events.map((e) => e.name)).toEqual(['subscribed', 'first_media']);
      expect(subscribe.attributes['lk.participant.remote_identity']).toBe('publisher');
    }
    // one span per cycle: a resume that turns into a restart is attempt 2 of the same span
    const reconnects = spans('lk.reconnect');
    expect(reconnects).toHaveLength(2);
    expect(reconnects.map((s) => s.attributes['lk.outcome'])).toEqual(['ok', 'ok']);
    expect(reconnects[0].events[0].name).toBe('attempt 1 quick');
    expect(reconnects[0].attributes['lk.reconnect.attempts']).toBe(reconnects[0].events.length);
    expect(reconnects[1].events.map((e) => e.name)).toEqual(['attempt 1 full']);
    expect(reconnects[1].attributes['lk.reconnect.mode']).toBe('full');
    expect(reconnects[0].attributes['lk.reconnect.reason']).toBe('signal_disconnected');

    // windows: both directions, both kinds, bytes flowing
    const windows = events('lk.rtc.stats.sample');
    const directions = new Set(windows.map((w) => w.attributes['lk.track.direction']));
    const kinds = new Set(windows.map((w) => w.attributes['lk.track.kind']));
    expect(directions).toEqual(new Set(['inbound', 'outbound']));
    expect(kinds).toEqual(new Set(['audio', 'video']));
    expect(windows.some((w) => Number(w.attributes['lk.rtc.bytes']) > 0)).toBe(true);

    // events
    const disconnects = events('lk.room.disconnected');
    const reasons = disconnects.map((d) => d.attributes['lk.disconnect.reason']);
    expect(reasons.filter((r) => r === 'client_initiated').length).toBeGreaterThanOrEqual(2);
    expect(reasons.length).toBeGreaterThanOrEqual(3); // the refused connect reports its own
    expect(disconnects.some((d) => d.attributes['app.call_id'] === marker)).toBe(true);
    expect(events('custom.e2e.checkpoint')[0].attributes).toMatchObject({
      step: 'reconnected',
      'app.call_id': marker,
      'lk.room.name': publisher.name,
    });
    const warning = records.find(
      (r): r is LogRecord => r.kind === 'log' && r.body === 'e2e: a warning for telemetry',
    );
    expect(warning?.attributes).toMatchObject({
      'lk.log.source': 'sdk',
      'lk.log.logger': 'livekit-room',
      'lk.room.name': publisher.name,
    });
    for (const name of [
      'lk.device.app_state.changed',
      'lk.device.network.changed',
      'lk.device.thermal.changed',
      'lk.device.low_power.changed',
      'lk.device.memory.changed',
      'lk.device.battery.changed',
      'lk.device.audio_route.changed',
      'lk.device.audio.interruption',
      'lk.device.capture.failed',
      'lk.telemetry.report',
    ]) {
      expect(events(name).length, name).toBeGreaterThanOrEqual(1);
    }
    expect(events('lk.device.capture.failed')[0].attributes).toMatchObject({
      'lk.device.capture.device': 'camera',
      'lk.device.capture.reason': 'permission_denied',
    });

    // the collector took everything; the only losses are the two invalid app calls
    const stats = telemetry.pipeline.stats();
    console.log(`telemetry e2e stats ${JSON.stringify(stats)}`);
    expect(stats['uploads.sent']).toBeGreaterThanOrEqual(2);
    expect(stats['uploads.failed']).toBeUndefined();
    expect(Object.keys(stats).filter((key) => key.startsWith('dropped.'))).toEqual([
      'dropped.invalid',
    ]);
    expect(stats['dropped.invalid']).toBe(2);
    expect(stats.cached).toBe(0);

    // opt-out: in effect when it returns, nothing more leaves
    disableTelemetry();
    publisher.emitTelemetryEvent('after.opt.out');
    await telemetry.pipeline.flush(true);
    expect(telemetry.pipeline.enabled).toBe(false);
    expect(telemetry.pipeline.stats()['uploads.sent']).toBe(stats['uploads.sent']);
    expect(records.some((r) => r.kind === 'log' && r.eventName === 'custom.after.opt.out')).toBe(
      false,
    );
  }, 120_000);
});
