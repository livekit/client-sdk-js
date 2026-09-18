import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cadenceFactor, changes, networkType } from './device';
import { Pipeline } from './pipeline';
import { TelemetryScope } from './scope';

/** The JSON encoding is the readable one: every assertion here reads the body the collector gets. */
function bodyOf(call: unknown[]): any {
  const init = call[1] as RequestInit;
  return JSON.parse(new TextDecoder().decode(init.body as Uint8Array));
}

function recordsOf(call: unknown[]): any[] {
  return bodyOf(call).resourceLogs.flatMap((r: any) =>
    r.scopeLogs.flatMap((s: any) => s.logRecords),
  );
}

function attributesOf(record: any): Record<string, any> {
  return Object.fromEntries(record.attributes.map((a: any) => [a.key, Object.values(a.value)[0]]));
}

describe('telemetry pipeline', () => {
  let pipeline: Pipeline;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    pipeline = new Pipeline();
    pipeline.configure({
      endpoint: 'http://collector.test/v1/logs',
      encoding: 'json',
      flushInterval: 3600,
      statsWindow: 0.01,
    });
  });

  afterEach(() => {
    pipeline.stop();
    vi.unstubAllGlobals();
  });

  test('one window of readings becomes one record, counters last and gauges summarised', async () => {
    const scope = new TelemetryScope(pipeline);
    scope.setRoom({ sid: 'RM_1', name: 'harness', participantIdentity: 'publisher' });
    scope.recordStats('TR_1', 'video', 'outbound', {
      bytes: 1000,
      packets: 10,
      rttMs: 20,
      fps: 30,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    scope.recordStats('TR_1', 'video', 'outbound', {
      bytes: 3000,
      packets: 30,
      rttMs: 40,
      fps: 24,
    });
    await pipeline.flush(true);

    const window = recordsOf(fetchMock.mock.calls[0]).find(
      (r) => r.eventName === 'lk.rtc.stats.sample',
    );
    const attributes = attributesOf(window);
    expect(attributes['lk.track.sid']).toBe('TR_1');
    expect(attributes['lk.track.direction']).toBe('outbound');
    expect(attributes['lk.room.name']).toBe('harness');
    // A counter is the window's last reading, not a sum of them (the W3C webrtc-stats model).
    expect(attributes['lk.rtc.bytes']).toBe(3000);
    expect(attributes['lk.rtc.samples']).toBe(2);
    expect(attributes['lk.rtc.rtt_ms.min']).toBe(20);
    expect(attributes['lk.rtc.rtt_ms.max']).toBe(40);
    expect(attributes['lk.rtc.rtt_ms.avg']).toBe(30);
  });

  test('a hold stops uploads, never collection', async () => {
    const scope = new TelemetryScope(pipeline);
    pipeline.hold(true);
    scope.emit('lk.test.one');
    await pipeline.flush();
    expect(fetchMock).not.toHaveBeenCalled();

    scope.emit('lk.test.two');
    pipeline.hold(false);
    await pipeline.flush();
    // Everything collected during the hold went out together: a pause is not a hole.
    expect(recordsOf(fetchMock.mock.calls[0]).map((r) => r.eventName)).toEqual([
      'lk.test.one',
      'lk.test.two',
    ]);
  });

  test('a 429 holds the pipeline and keeps the batch', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 429 }));
    const scope = new TelemetryScope(pipeline);
    scope.emit('lk.test.throttled');
    await pipeline.flush(true);
    expect(pipeline.diagnostics()).toContain('throttled');
    expect(pipeline.diagnostics()).toContain('lost 0');

    // The next tick is not spent on a request the collector already refused.
    await pipeline.flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // …and the record is still there when the hold lifts.
    await pipeline.flush(true);
    expect(recordsOf(fetchMock.mock.calls[1])[0].eventName).toBe('lk.test.throttled');
  });

  test('the queue evicts the oldest and says how many', async () => {
    pipeline.maxQueueSize = 3;
    const scope = new TelemetryScope(pipeline);
    for (let i = 0; i < 5; i += 1) {
      scope.emit(`lk.test.${i}`);
    }
    await pipeline.flush(true);

    const records = recordsOf(fetchMock.mock.calls[0]);
    expect(records.map((r) => r.eventName)).toContain('lk.test.4');
    expect(records.map((r) => r.eventName)).not.toContain('lk.test.0');
    const report = records.find((r) => r.eventName === 'lk.telemetry.report');
    expect(attributesOf(report)['lk.telemetry.dropped.queue_full']).toBe(2);
  });

  test('a span carries its checkpoints and its outcome', async () => {
    const scope = new TelemetryScope(pipeline);
    const span = scope.start('lk.connect', { attributes: { 'lk.connect.attempt': 1 } });
    span.step('ws_open');
    span.step('join_recv');
    span.end('ok');
    span.end('error'); // ending twice is a no-op
    await pipeline.flush(true);

    const traceCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/v1/traces'))!;
    const spans = bodyOf(traceCall).resourceSpans.flatMap((r: any) =>
      r.scopeSpans.flatMap((s: any) => s.spans),
    );
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe('lk.connect');
    expect(spans[0].events.map((e: any) => e.name)).toEqual(['ws_open', 'join_recv']);
    expect(attributesOf(spans[0])['lk.outcome']).toBe('ok');
  });

  test('nothing is collected before a destination exists', async () => {
    const idle = new Pipeline();
    const scope = new TelemetryScope(idle);
    scope.emit('lk.test.void');
    await idle.flush(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(idle.diagnostics()).toContain('no destination');
  });
});

describe('device state', () => {
  test('only a change is a record, and the connection is one record', () => {
    expect(changes({}, { appState: 'foreground' }).map((c) => c.event)).toEqual([
      'lk.device.app_state.changed',
    ]);
    expect(changes({ appState: 'foreground' }, { appState: 'foreground' })).toEqual([]);

    // type, expensive and constrained are one event, not three.
    const network = changes(
      { networkType: 'wifi', networkExpensive: false, networkConstrained: false },
      { networkType: 'cell', networkExpensive: true, networkConstrained: false },
    );
    expect(network).toHaveLength(1);
    expect(network[0].event).toBe('lk.device.network.changed');
    expect(network[0].attributes['network.connection.type']).toBe('cell');
    expect(network[0].attributes['lk.device.network.expensive']).toBe(true);
  });

  test('factors multiply and stop at 4x', () => {
    expect(cadenceFactor({})).toBe(1);
    expect(cadenceFactor({ thermal: 'fair' })).toBe(1);
    expect(cadenceFactor({ thermal: 'serious' })).toBe(2);
    expect(cadenceFactor({ thermal: 'serious', lowPower: true })).toBe(4);
    // thermal critical (4) x background (2) x low power (2) is capped, not 16.
    expect(cadenceFactor({ thermal: 'critical', appState: 'background', lowPower: true })).toBe(4);
  });

  test('NetworkInformation names become SPEC names', () => {
    expect(networkType('cellular')).toBe('cell');
    expect(networkType('ethernet')).toBe('wired');
    expect(networkType('none')).toBe('unavailable');
    expect(networkType(undefined)).toBe('unknown');
  });

  test('the factor stretches both periods, and relief applies at once', () => {
    const pipeline = new Pipeline();
    pipeline.configure({
      endpoint: 'http://collector.test/v1/logs',
      flushInterval: 15,
      statsWindow: 15,
    });
    expect(pipeline.statsWindow).toBe(15);
    pipeline.setCadenceFactor(4);
    expect(pipeline.flushInterval).toBe(60);
    expect(pipeline.statsWindow).toBe(60);
    pipeline.setCadenceFactor(1);
    expect(pipeline.statsWindow).toBe(15);
    pipeline.stop();
  });
});
