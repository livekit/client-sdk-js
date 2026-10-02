import { DisconnectReason, ReconnectReason } from '@livekit/protocol';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { configureTelemetryHost, disableTelemetry, telemetry } from '.';
import log, { LOG_OWNER, LogLevel, getLogger, setLogCapture, setLogLevel } from '../logger';
import type { LogRecord, SpanRecord, TelemetryRecord } from './otlp';
import { encode, mask, rejectedRecords } from './otlp';
import { FLUSH_INTERVAL_MS, Pipeline } from './pipeline';
import { StatsPoller } from './poller';
import { TelemetryScope, TelemetrySpan, guarded } from './scope';
import {
  MemoryStorage,
  type TelemetryStorage,
  batchId,
  decodeBatch,
  encodeBatch,
  parseBatchId,
} from './storage';
import {
  backoffMs,
  classify,
  cloudHost,
  fingerprint,
  parseRetryAfter,
  readToken,
} from './transport';
import { foldLayers, peerSamples } from './webrtc';

/**
 * The JS-only paths of the pipeline: storage, token parsing, URL rules, the collector-answer table
 * and the self-report, against a mock `fetch`. Spans, events and the browser session are covered
 * end to end in `telemetry.browser.test.ts`.
 */

const b64 = (value: object) =>
  btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const jwt = (claims: object) => `${b64({ alg: 'HS256' })}.${b64(claims)}.sig`;
const future = Math.floor(Date.now() / 1000) + 600;
const granted = (extra: object = {}) =>
  jwt({ exp: future, observability: { write: true }, ...extra });
const CLOUD = 'wss://proj-abc.livekit.cloud';

interface Call {
  url: string;
  headers: Record<string, string>;
  body: Uint8Array;
}

function mockFetch(
  answers: Array<{ status: number; headers?: Record<string, string>; body?: BodyInit }>,
) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    if (init.signal?.aborted) throw new Error('aborted');
    const body = new Uint8Array(await new Response(init.body as BodyInit).arrayBuffer());
    calls.push({ url, headers: init.headers as Record<string, string>, body });
    const answer = answers.shift() ?? { status: 200 };
    return new Response(answer.body ?? '', { status: answer.status, headers: answer.headers });
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

function connectedScope(pipeline: Pipeline, token = granted(), url = CLOUD) {
  const scope = new TelemetryScope(pipeline);
  scope.setServer(url, token);
  return scope;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The strings inside a (gzipped) request body — protobuf keeps them verbatim. */
async function textOf(call: Call) {
  const encoding = call.headers['Content-Encoding'];
  const stream = new Blob([call.body as BlobPart]).stream();
  const plain = encoding ? stream.pipeThrough(new DecompressionStream('gzip')) : stream;
  return new TextDecoder().decode(await new Response(plain).arrayBuffer());
}

async function flushed(pipeline: Pipeline) {
  await pipeline.flush();
  // a 413 split or a wake-up is served by the next pass
  await pipeline.flush();
}

describe('transport rules', () => {
  test('derives the ingest only from a Cloud host over TLS', () => {
    expect(cloudHost('wss://proj.livekit.cloud')).toBe('proj.livekit.cloud');
    expect(cloudHost('https://proj.staging.livekit.cloud/')).toBe('proj.staging.livekit.cloud');
    expect(cloudHost('ws://proj.livekit.cloud')).toBeUndefined();
    expect(cloudHost('wss://proj.livekit.cloud:8443')).toBeUndefined();
    expect(cloudHost('wss://user@proj.livekit.cloud')).toBeUndefined();
    expect(cloudHost('wss://proj.livekit.cloud.evil.com')).toBeUndefined();
    expect(cloudHost('wss://localhost:7880')).toBeUndefined();
    expect(cloudHost('not a url')).toBeUndefined();
  });

  test('reads the grant and exp off the token without verifying it', () => {
    expect(readToken(granted())).toMatchObject({ granted: true, expired: false });
    expect(readToken(jwt({ observability: { clientWrite: true } }))).toMatchObject({
      granted: true,
      expiresAt: undefined,
    });
    expect(readToken(jwt({ exp: future, video: { roomJoin: true } })).granted).toBe(false);
    expect(readToken(jwt({ exp: 1, observability: { write: true } })).expired).toBe(true);
    expect(readToken(jwt({ exp: 'soon', observability: { write: true } })).expired).toBe(true);
    expect(readToken('garbage')).toEqual({ granted: false, expired: true });
  });

  test('classifies every collector answer the SPEC table names', () => {
    expect(classify(200, null, '')).toEqual({ kind: 'accepted', rejected: 0 });
    expect(classify(400, null, '')).toEqual({ kind: 'rejected' });
    expect(classify(0, null, '')).toEqual({ kind: 'rejected' }); // an opaque redirect
    expect(classify(413, null, '')).toEqual({ kind: 'oversized' });
    expect(classify(403, null, 'Project data recording is disabled by owner')).toEqual({
      kind: 'disabled',
    });
    expect(classify(401, null, 'invalid token')).toEqual({ kind: 'unauthorized' });
    expect(classify(404, null, '')).toEqual({ kind: 'gone' });
    expect(classify(429, null, '')).toEqual({ kind: 'pause', forMs: 60_000 });
    expect(classify(429, '7', '')).toEqual({ kind: 'pause', forMs: 7_000 });
    expect(classify(503, '12', '')).toEqual({ kind: 'pause', forMs: 12_000 });
    expect(classify(503, null, '')).toEqual({ kind: 'retry' });
    expect(classify(502, null, '')).toEqual({ kind: 'retry' });
    expect(classify(500, null, '')).toEqual({ kind: 'rejected' });
    expect(classify(500, null, 'type.googleapis.com/google.rpc.RetryInfo')).toEqual({
      kind: 'retry',
    });
  });

  test('bounds Retry-After and the backoff', () => {
    const now = Date.parse('2026-10-01T12:00:00Z');
    expect(parseRetryAfter('30', now)).toBe(30_000);
    expect(parseRetryAfter('-5', now)).toBe(0);
    expect(parseRetryAfter('Thu, 01 Oct 2026 12:00:10 GMT', now)).toBe(10_000);
    expect(parseRetryAfter('garbage', now)).toBeUndefined();
    expect(parseRetryAfter(String(10 * 24 * 3600), now)).toBe(24 * 3600 * 1000);
    for (const failures of [1, 3, 20]) {
      const wait = backoffMs(failures);
      expect(wait).toBeGreaterThanOrEqual(0);
      expect(wait).toBeLessThanOrEqual(Math.min(60_000, 1000 * 2 ** (failures - 1)));
    }
  });
  test('a token fingerprint survives a 32-bit hash collision and keeps no token material', () => {
    const fnv = (text: string) => {
      let hash = 0x811c9dc5;
      for (let i = 0; i < text.length; i += 1) {
        hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
      }
      return hash;
    };
    const seen = new Map<number, string>();
    let pair: [string, string] | undefined;
    for (let i = 0; i < 600_000 && !pair; i += 1) {
      const text = Math.random().toString(36).slice(2, 12).padEnd(10, 'x'); // same length: only the hashes can differ
      const other = seen.get(fnv(text));
      if (other !== undefined && other !== text) pair = [other, text];
      else seen.set(fnv(text), text);
    }
    expect(pair).toBeDefined(); // a birthday collision of the first hash
    expect(fingerprint(pair![0])).not.toBe(fingerprint(pair![1]));
    expect(fingerprint('eyJhbGciOi.eyJzdWIiOi.sig')).not.toContain('eyJ');
  });
});

describe('storage', () => {
  test('ids carry the batch metadata and sort oldest first', () => {
    const id = batchId(
      { timeMs: 1_700_000_000_000, records: 12, kind: 'traces', host: 'p.livekit.cloud' },
      7,
    );
    expect(parseBatchId(id)).toEqual({
      timeMs: 1_700_000_000_000,
      records: 12,
      kind: 'traces',
      host: 'p.livekit.cloud',
    });
    expect(parseBatchId(batchId({ timeMs: 1, records: 1, kind: 'logs', host: '' }, 1))?.host).toBe(
      '',
    );
    expect(parseBatchId('garbage')).toBeUndefined();
    const older = batchId({ timeMs: 1_000, records: 1, kind: 'logs', host: '' }, 2);
    const newer = batchId({ timeMs: 2_000, records: 1, kind: 'logs', host: '' }, 1);
    expect([newer, older].sort()).toEqual([older, newer]);
  });

  test('memory storage evicts the oldest by bytes and by count; a split replaces in one step or not at all', () => {
    const storage = new MemoryStorage(10, 2);
    expect(storage.put('a', new Uint8Array(4))).toEqual([]);
    expect(storage.put('b', new Uint8Array(4))).toEqual([]);
    expect(storage.put('c', new Uint8Array(4))).toEqual(['a']); // bytes: 12 > 10
    expect(storage.put('d', new Uint8Array(1))).toEqual(['b']); // count: 3 > 2
    expect(storage.put('e', new Uint8Array(9))).toEqual(['c']); // a lone batch within the bound stays
    expect(storage.put('f', new Uint8Array(20))).toEqual(['d', 'e', 'f']); // one alone over the bytes goes too
    expect(storage.pending()).toEqual([]);
    const small = new MemoryStorage(10, 2);
    small.put('p', new Uint8Array(6));
    const parts = (a: number, b: number): Array<[string, Uint8Array]> => [
      ['p1', new Uint8Array(a)],
      ['p2', new Uint8Array(b)],
    ];
    expect(small.replace('p', parts(3, 3))).toBe(true);
    expect(small.pending()).toEqual(['p1', 'p2']);
    expect(small.replace('p1', parts(1, 1))).toBe(false); // count 3 > 2: nothing changes
    expect(small.pending()).toEqual(['p1', 'p2']);
  });

  test('a parseable body that is not a batch is corrupt', () => {
    const text = (value: string) => new TextEncoder().encode(value);
    expect(() => decodeBatch(text('{"not":"a batch"}'))).toThrow();
    expect(() => decodeBatch(text('[{"kind":"bogus","attributes":{}}]'))).toThrow();
    expect(() => decodeBatch(text('[1]'))).toThrow();
    expect(decodeBatch(encodeBatch([]))).toEqual([]);
  });
});

describe('OTLP encoding', () => {
  test('writes a request the protobuf wire format can carry, and reads partial success back', () => {
    const records: TelemetryRecord[] = [
      {
        kind: 'log',
        timeMs: 1_700_000_000_123,
        severity: 'warn',
        eventName: 'lk.ping',
        body: 'lk.ping',
        attributes: { 'lk.ping.seq': 1, flag: true, ratio: 0.5, name: 'x', skipped: undefined },
        traceId: '0123456789abcdef0123456789abcdef',
      },
      {
        kind: 'span',
        name: 'lk.connect',
        spanKind: 3,
        traceId: '0123456789abcdef0123456789abcdef',
        spanId: '0123456789abcdef',
        startMs: 1_700_000_000_000,
        endMs: 1_700_000_001_000,
        status: 2,
        statusMessage: 'boom',
        attributes: { 'lk.outcome': 'error' },
        events: [{ name: 'ws_open', timeMs: 1_700_000_000_500 }],
      },
    ];
    const bytes = encode(records, { 'service.name': 'livekit-client-js' });
    expect(bytes.byteLength).toBeGreaterThan(100);
    // ResourceLogs(1) → ScopeLogs(2) → LogRecord(2) → event_name(12) is the last string of the first record
    expect(new TextDecoder().decode(bytes)).toContain('lk.ping');
    expect(new TextDecoder().decode(bytes)).toContain('ws_open');
    // ExportLogsServiceResponse { partial_success { rejected_log_records: 300 } }
    expect(rejectedRecords(Uint8Array.from([0x0a, 0x03, 0x08, 0xac, 0x02]))).toBe(300);
    expect(rejectedRecords(new Uint8Array(0))).toBe(0);
    // error_message (field 2) before rejected (field 1), and an unknown field ahead of partial_success
    const reordered = [0x1a, 0x01, 0x78, 0x0a, 0x07, 0x12, 0x02, 0x68, 0x69, 0x08, 0xac, 0x02];
    expect(rejectedRecords(Uint8Array.from(reordered))).toBe(300);
  });
});

describe('stats mapping', () => {
  const asReport = (stats: object[]) =>
    new Map(stats.map((s) => [(s as { id: string }).id, s])) as unknown as RTCStatsReport;
  const outbound = new Map([['mst', { sid: 'TR', kind: 'video', direction: 'outbound' } as const]]);
  const inbound = new Map([['mst', { sid: 'TR', kind: 'audio', direction: 'inbound' } as const]]);

  test('layers are read apart and folded as the core does; RTT and gauges keep their precision', () => {
    const layer = (rid: string, bytesSent: number, cpu: number) => ({
      id: `o-${rid}`,
      type: 'outbound-rtp',
      trackIdentifier: 'mst',
      rid,
      bytesSent,
      qualityLimitationDurations: { cpu, bandwidth: 0, other: 0 },
    });
    const two = peerSamples(
      asReport([
        layer('h', 100, 1),
        layer('q', 50, 1),
        { id: 'ri', type: 'remote-inbound-rtp', localId: 'o-h', roundTripTime: 0.0425 },
      ]),
      outbound,
    ).get('TR')!;
    expect(Array.from(two.layers.keys())).toEqual(['h', 'q']);
    const folded = foldLayers(two.layers);
    expect(folded.counters['lk.rtc.bytes']).toBe(150); // summed across layers
    expect(folded.counters['lk.rtc.quality_limitation.cpu_ms']).toBe(1000); // per encoder: the maximum, not 2 s
    expect(folded.gauges['lk.rtc.rtt_ms']).toBeCloseTo(42.5); // remote-inbound found by localId, unrounded
  });

  test('the pair RTT comes from the selected pair, else the nominated succeeded one; jitter is not rounded', () => {
    const stream = {
      id: 'in1',
      type: 'inbound-rtp',
      trackIdentifier: 'mst',
      bytesReceived: 9,
      jitter: 0.0123,
    };
    const pair = {
      id: 'cp1',
      type: 'candidate-pair',
      nominated: true,
      state: 'succeeded',
      currentRoundTripTime: 0.05,
    };
    const nominated = foldLayers(peerSamples(asReport([stream, pair]), inbound).get('TR')!.layers);
    expect(nominated.gauges['lk.rtc.rtt_ms']).toBeCloseTo(50);
    expect(nominated.gauges['lk.rtc.jitter_ms']).toBeCloseTo(12.3);
    const other = {
      id: 'cp2',
      type: 'candidate-pair',
      nominated: true,
      state: 'succeeded',
      currentRoundTripTime: 0.2,
    };
    const transport = { id: 't', type: 'transport', selectedCandidatePairId: 'cp2' };
    const selected = foldLayers(
      peerSamples(asReport([stream, pair, other, transport]), inbound).get('TR')!.layers,
    );
    expect(selected.gauges['lk.rtc.rtt_ms']).toBeCloseTo(200);
  });
});

describe('pipeline', () => {
  let pipeline: Pipeline;

  beforeEach(() => {
    vi.useFakeTimers();
    pipeline = new Pipeline();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test('sends a Room’s records to its project with its token, and nothing without the grant', async () => {
    const calls = mockFetch([{ status: 200 }, { status: 200 }]);
    const scope = connectedScope(pipeline);
    scope.emit('custom.one');
    scope.start('lk.publish').end('ok');
    const ungranted = connectedScope(pipeline, jwt({ exp: future }), 'wss://other.livekit.cloud');
    ungranted.emit('custom.never');
    // The first token decides: a later grant does not opt the project in (SPEC).
    ungranted.refreshToken(granted({ jti: 'late' }));
    ungranted.emit('custom.never.either');
    await flushed(pipeline);
    expect(calls.map((c) => c.url).sort()).toEqual([
      'https://proj-abc.livekit.cloud/observability/client/logs/otlp/v0',
      'https://proj-abc.livekit.cloud/observability/client/traces/otlp/v0',
    ]);
    expect(calls[0].headers.Authorization).toBe(`Bearer ${granted()}`);
    expect(calls[0].headers.Priority).toBe('u=7');
    expect(pipeline.stats()).toMatchObject({ 'uploads.sent': 2, cached: 0, queued: 0 });
  });

  test('a non-Cloud server collects nothing; the collector override sends everything there', async () => {
    const calls = mockFetch([]);
    connectedScope(pipeline, granted(), 'ws://localhost:7880').emit('custom.local');
    await flushed(pipeline);
    expect(calls).toHaveLength(0);
    pipeline.endpoint = 'http://127.0.0.1:4318/';
    connectedScope(pipeline, 'no-token', 'ws://localhost:7880').emit('custom.local');
    await flushed(pipeline);
    expect(calls[0].url).toBe('http://127.0.0.1:4318/v1/logs');
    expect(calls[0].headers.Authorization).toBeUndefined();
  });

  test('a refreshed token replaces the one in use; an expired or refused one holds the batch', async () => {
    const calls = mockFetch([{ status: 401, body: 'invalid token' }, { status: 200 }]);
    const scope = connectedScope(pipeline);
    scope.emit('custom.one');
    await flushed(pipeline);
    expect(calls).toHaveLength(1);
    expect(pipeline.stats()).toMatchObject({ 'uploads.unauthorized': 1, cached: 1 });
    await flushed(pipeline);
    expect(calls).toHaveLength(1); // the refused token is never sent again
    scope.refreshToken(jwt({ exp: 1, observability: { write: true } }));
    await flushed(pipeline);
    expect(calls).toHaveLength(1); // an expired one is not sent either
    const fresh = granted({ jti: 'fresh' });
    scope.refreshToken(fresh);
    await flushed(pipeline);
    expect(calls).toHaveLength(2);
    expect(calls[1].headers.Authorization).toBe(`Bearer ${fresh}`);
  });

  test('each answer in the table has its consequence', async () => {
    const calls = mockFetch([
      { status: 429, headers: { 'Retry-After': '30' } },
      { status: 503 },
      { status: 400 },
      // ExportLogsServiceResponse { partial_success { rejected_log_records: 1 } }
      { status: 200, body: Uint8Array.from([0x0a, 0x02, 0x08, 0x01]) },
    ]);
    const scope = connectedScope(pipeline);
    scope.emit('custom.a');
    await flushed(pipeline); // 429: kept, paused 30 s
    expect(pipeline.stats()).toMatchObject({ 'uploads.failed': 1, cached: 1 });
    await flushed(pipeline);
    expect(calls).toHaveLength(1);
    vi.advanceTimersByTime(30_001);
    await flushed(pipeline); // 503 without a delay: kept, local backoff
    expect(calls).toHaveLength(2);
    expect(pipeline.stats()).toMatchObject({ 'uploads.failed': 2, cached: 1 });
    vi.advanceTimersByTime(60_001);
    await flushed(pipeline); // 400: dropped and counted
    expect(pipeline.stats()).toMatchObject({ 'dropped.rejected': 1, cached: 0 });
    scope.emit('custom.b');
    scope.emit('custom.c');
    await flushed(pipeline); // 2xx with partial success: removed, the rejected record counted
    expect(pipeline.stats()).toMatchObject({ 'uploads.sent': 1, 'dropped.rejected': 2, cached: 0 });
  });

  test('404 silences the project until its next token; the owner’s opt-out silences it for good', async () => {
    const calls = mockFetch([
      { status: 404 },
      { status: 200 },
      { status: 403, body: 'project data recording is disabled by owner' },
    ]);
    const scope = connectedScope(pipeline);
    scope.emit('custom.a');
    scope.emit('custom.b');
    await flushed(pipeline);
    expect(pipeline.stats().cached).toBe(0); // purged with the project
    scope.emit('custom.c');
    await flushed(pipeline);
    expect(calls).toHaveLength(1); // silent
    scope.refreshToken(granted({ jti: 'next' }));
    await flushed(pipeline);
    expect(calls).toHaveLength(2); // the next token revives it
    scope.emit('custom.d');
    await flushed(pipeline);
    scope.refreshToken(granted({ jti: 'another' }));
    scope.emit('custom.e');
    await flushed(pipeline);
    expect(calls).toHaveLength(3);
    expect(pipeline.stats().cached).toBe(0);
  });

  test('413 splits the batch down to the record, and a lone oversized record is dropped', async () => {
    const calls = mockFetch([{ status: 413 }, { status: 200 }, { status: 413 }]);
    const scope = connectedScope(pipeline);
    for (const name of ['a', 'b', 'c']) scope.emit(`custom.${name}`);
    await flushed(pipeline);
    // [a b c] → 413 → [a b] accepted, [c] → 413 → a lone record is oversized
    expect(calls).toHaveLength(3);
    expect(pipeline.stats()).toMatchObject({
      'uploads.sent': 1,
      'dropped.oversized': 1,
      cached: 0,
    });
  });

  /** A one-slot store that throws on its n-th write: the disk is full and then refuses. */
  function flakyStore(throwOnPut: number, slots = 1) {
    const storage = new MemoryStorage(1 << 20, slots);
    let puts = 0;
    const put = storage.put.bind(storage);
    storage.put = (id, body) => {
      puts += 1;
      if (puts === throwOnPut) throw new Error('disk full');
      return put(id, body);
    };
    return storage;
  }

  test('a 413 split takes the parent’s place in one step, or leaves the parent whole: nothing evicted in between', async () => {
    const calls = mockFetch([{ status: 413 }, { status: 413 }, { status: 200 }, { status: 200 }]);
    // one slot: the halves cannot fit, the parent stays whole and waits for the backoff
    pipeline.storage = new MemoryStorage(1 << 20, 1);
    const scope = connectedScope(pipeline);
    for (const name of ['a', 'b']) scope.emit(`custom.${name}`);
    await pipeline.flush();
    expect(calls).toHaveLength(1);
    expect(pipeline.storage.pending()).toHaveLength(1);
    expect(parseBatchId(pipeline.storage.pending()[0])?.records).toBe(2);
    expect(Object.keys(pipeline.stats()).filter((k) => k.startsWith('dropped.'))).toEqual([]);
    expect(pipeline.stats()['uploads.failed']).toBe(1);
    // two slots: both halves replace the parent and ship
    const two = new Pipeline();
    two.storage = new MemoryStorage(1 << 20, 2);
    const other = connectedScope(two);
    for (const name of ['c', 'd']) other.emit(`custom.${name}`);
    await flushed(two);
    expect(two.stats()).toMatchObject({ 'uploads.sent': 2, cached: 0 });
    expect(Object.keys(two.stats()).filter((k) => k.startsWith('dropped.'))).toEqual([]);
  });

  test('a host store without `replace` never splits: the parent stays whole and waits for the backoff', async () => {
    const bare = (slots: number): TelemetryStorage => {
      const memory = new MemoryStorage(1 << 20, slots);
      return {
        put: (id, body) => memory.put(id, body),
        pending: () => memory.pending(),
        read: (id) => memory.read(id),
        remove: (id) => memory.remove(id),
        clear: () => memory.clear(),
      };
    };
    mockFetch([{ status: 413 }, { status: 413 }]);
    for (const slots of [1, 2]) {
      const one = new Pipeline();
      one.storage = bare(slots);
      const scope = connectedScope(one);
      for (const name of ['a', 'b']) scope.emit(`custom.${name}`);
      await one.flush();
      expect(one.storage.pending()).toHaveLength(1);
      expect(parseBatchId(one.storage.pending()[0])?.records).toBe(2);
      expect(Object.keys(one.stats()).filter((k) => k.startsWith('dropped.'))).toEqual([]);
      expect(one.stats()['uploads.failed']).toBe(1);
    }
  });

  test('a batch the store will not delete is never sent again', async () => {
    const calls = mockFetch([{ status: 200 }, { status: 200 }]);
    const store = new MemoryStorage(1 << 20, 10);
    let refuse = true;
    const remove = store.remove.bind(store);
    store.remove = (id) => {
      if (refuse) throw new Error('locked');
      remove(id);
    };
    pipeline.storage = store;
    const scope = connectedScope(pipeline);
    scope.emit('custom.once');
    await pipeline.flush(); // taken by the collector, deletion refused
    expect(calls).toHaveLength(1);
    expect(pipeline.stats()).toMatchObject({
      'uploads.sent': 1,
      'cache.delete_errors': 1,
      cached: 1,
    });
    await pipeline.flush(); // still there, never re-sent
    expect(calls).toHaveLength(1);
    refuse = false;
    await pipeline.flush();
    expect(calls).toHaveLength(1);
    expect(pipeline.stats().cached).toBe(0);
  });

  test('a batch the store cannot read right now is kept for the next pass, never deleted', async () => {
    const calls = mockFetch([{ status: 200 }]);
    const store = new MemoryStorage(1 << 20, 10);
    let locked = true;
    const read = store.read.bind(store);
    store.read = (id) => {
      if (locked) throw new Error('file locked');
      return read(id);
    };
    pipeline.storage = store;
    const scope = connectedScope(pipeline);
    scope.emit('custom.kept');
    await pipeline.flush();
    expect(calls).toHaveLength(0);
    expect(pipeline.stats()).toMatchObject({ 'cache.read_errors': 1, cached: 1 });
    locked = false;
    await pipeline.flush();
    expect(calls).toHaveLength(1);
    expect(pipeline.stats()).toMatchObject({ 'uploads.sent': 1, cached: 0 });
    expect(Object.keys(pipeline.stats()).filter((k) => k.startsWith('dropped.'))).toEqual([]);
  });

  test('a split with no fallback left keeps the parent whole, every record exactly once', async () => {
    mockFetch([{ status: 413 }]);
    const storage = flakyStore(3);
    pipeline.storage = storage;
    (pipeline as unknown as { cache: TelemetryStorage }).cache = storage; // the raw store, no fallback
    const scope = connectedScope(pipeline);
    for (const name of ['a', 'b']) scope.emit(`custom.${name}`);
    await pipeline.flush(); // one pass: the 413, the first half evicts the parent, the second half fails
    expect(storage.pending()).toHaveLength(1);
    expect(parseBatchId(storage.pending()[0])?.records).toBe(2); // the parent, re-stored
    expect(Object.keys(pipeline.stats()).filter((k) => k.startsWith('dropped.'))).toEqual([]);
  });

  test('a store the disk refuses is kept in memory, counted as a write error, and still uploaded', async () => {
    const calls = mockFetch([{ status: 200 }]);
    const refusing = new MemoryStorage(1 << 20, 10);
    refusing.put = () => {
      throw new Error('disk gone');
    };
    pipeline.storage = refusing;
    const scope = connectedScope(pipeline);
    scope.emit('custom.kept');
    await flushed(pipeline);
    expect(calls).toHaveLength(1);
    expect(pipeline.stats()).toMatchObject({
      'uploads.sent': 1,
      'cache.write_errors': 1,
      cached: 0,
    });
    expect(Object.keys(pipeline.stats()).filter((k) => k.startsWith('dropped.'))).toEqual([]);
  });

  test('the collector override never carries a bearer, cached Cloud batches included', async () => {
    const calls = mockFetch([{ status: 503, headers: { 'Retry-After': '60' } }]);
    const scope = connectedScope(pipeline);
    scope.emit('custom.cloud');
    await pipeline.flush(); // 503: the batch stays cached, the project's token is known
    expect(calls[0].headers.Authorization).toBeDefined();
    pipeline.endpoint = 'http://collector.test';
    await flushed(pipeline);
    const toCollector = calls.slice(1);
    expect(toCollector.length).toBeGreaterThanOrEqual(1);
    for (const call of toCollector) {
      expect(call.url).toMatch(/^http:\/\/collector\.test\/v1\//);
      expect(call.headers.Authorization).toBeUndefined();
    }
  });

  test('a refused token is never sent again before it expires, one without exp never in the process, all gone at opt-out', async () => {
    const calls = mockFetch(Array.from({ length: 60 }, () => ({ status: 401 })));
    const scope = connectedScope(pipeline);
    scope.inCall = false; // no per-interval budget: every pass sends until the token is refused
    const refresh = (token: string) => pipeline.setServer(CLOUD, token, scope);
    const peek = () =>
      (pipeline as unknown as { projects: Map<string, { refused: Map<string, number> }> }).projects;
    const tokens = Array.from({ length: 40 }, (_, i) => granted({ jti: String(i) }));
    for (const token of tokens) {
      refresh(token);
      scope.emit('custom.x');
      await pipeline.flush();
    }
    const refused = peek().get('proj-abc.livekit.cloud')!.refused;
    expect(refused.size).toBe(40); // nothing forgotten to make room
    for (const key of Array.from(refused.keys())) expect(key).not.toContain('eyJ'); // never the token
    const sent = calls.length;
    refresh(tokens[0]);
    scope.emit('custom.again');
    await pipeline.flush();
    expect(calls).toHaveLength(sent); // the first refused token never goes out again
    const forever = jwt({ observability: { write: true }, jti: 'forever' }); // no exp
    refresh(forever);
    scope.emit('custom.f');
    await pipeline.flush();
    expect(calls).toHaveLength(sent + 1);
    vi.setSystemTime(Date.now() + 365 * 24 * 3600 * 1000);
    refresh(forever);
    scope.emit('custom.g');
    await pipeline.flush();
    expect(calls).toHaveLength(sent + 1); // still refused a year later
    expect(refused.size).toBe(1); // the expired ones are reaped, the one without exp stays
    pipeline.disable();
    expect(peek().size).toBe(0);
  });

  test('a hold or a 5xx keeps caching; the self-report carries deltas and the opt-out purges', async () => {
    const calls = mockFetch([{ status: 502 }, { status: 200 }, { status: 200 }]);
    const scope = connectedScope(pipeline);
    scope.connectStarted(CLOUD, granted());
    scope.emit('custom.held');
    await flushed(pipeline);
    expect(calls).toHaveLength(0); // held while `lk.connect` is open …
    expect(pipeline.stats().cached).toBe(1); // … but cached, write-ahead
    scope.connectEnded('ok');
    await flushed(pipeline);
    expect(calls).toHaveLength(1); // 502: failed, kept
    vi.advanceTimersByTime(FLUSH_INTERVAL_MS);
    await flushed(pipeline);
    expect(calls).toHaveLength(3); // the backoff is over: the logs batch and the span batch go out
    let report: TelemetryRecord | undefined;
    pipeline.onBatch = (records) => {
      report ??= records.find((r) => r.kind === 'log' && r.eventName === 'lk.telemetry.report');
    };
    await pipeline.flush(true); // the session summary: a batch of its own only at a forced flush
    expect(calls).toHaveLength(4);
    expect(report?.attributes).toMatchObject({
      'lk.telemetry.uploads.failed': 1,
      'lk.telemetry.uploads.sent': 2,
      'lk.telemetry.cache.batches': 0,
    });
    scope.emit('custom.after');
    pipeline.disable();
    await flushed(pipeline);
    expect(pipeline.enabled).toBe(false);
    expect(pipeline.stats()).toMatchObject({ cached: 0, queued: 0 });
    expect(calls).toHaveLength(4);
  });

  test('a stalled request is abandoned after the export timeout and the batch kept', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_, reject) => {
            if (init.signal?.aborted) reject(new Error('aborted'));
            init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      ),
    );
    const scope = connectedScope(pipeline);
    scope.emit('custom.slow');
    const flush = pipeline.flush();
    await vi.advanceTimersByTimeAsync(10_001);
    await flush;
    expect(pipeline.stats()).toMatchObject({
      'uploads.timeouts': 1,
      'uploads.failed': 1,
      cached: 1,
    });
  });

  test('custom events and attributes are validated, never truncated', async () => {
    const records: TelemetryRecord[] = [];
    pipeline.onBatch = (batch) => records.push(...batch);
    const scope = connectedScope(pipeline);
    scope.setAttribute('app.call_id', 'c-1');
    scope.setAttribute('lk.room.sid', 'spoof');
    scope.setAttribute('session.id', 'spoof');
    scope.setAttribute('long', 'x'.repeat(1025));
    scope.emitCustom('checkout', { step: 'pay' });
    scope.emitCustom('', {});
    scope.emitCustom('bad', { 'lk.secret': 'x' });
    scope.setAttribute('app.call_id', null);
    scope.emitCustom('after');
    await pipeline.flush();
    const events = records.map((r) => (r as { eventName?: string }).eventName ?? '');
    expect(events.filter((name) => name.startsWith('custom.'))).toEqual([
      'custom.checkout',
      'custom.after',
    ]);
    expect(events).toContain('lk.telemetry.report'); // rides in the same batch, never its own
    expect(records[0].attributes['app.call_id']).toBe('c-1');
    expect(records[0].attributes['lk.room.sid']).toBeUndefined();
    expect(records[1].attributes['app.call_id']).toBeUndefined();
    expect(pipeline.stats()['dropped.invalid']).toBe(5);
  });

  test('a failing scope never throws into the caller', () => {
    const scope = guarded(new TelemetryScope(pipeline));
    vi.spyOn(pipeline, 'record').mockImplementation(() => {
      throw new Error('telemetry is broken');
    });
    expect(() => {
      scope.connectStarted(CLOUD, granted());
      scope.emit('custom.x');
      scope.start('lk.publish').end('ok');
      scope.subscribeStarted({ sid: 'TR_1', kind: 'audio' });
      scope.disconnected();
    }).not.toThrow();
  });

  test('SDK warnings reach the capture whatever the console level', () => {
    const captured: Array<[LogLevel, unknown, string | undefined]> = [];
    setLogCapture((level, msg, _context, name) => captured.push([level, msg, name]));
    const logger = getLogger('livekit-telemetry-test');
    setLogLevel('silent', undefined);
    logger.setLevel('silent');
    logger.warn(`token ${granted()} leaked`);
    logger.error('boom');
    logger.info('quiet');
    setLogCapture(undefined);
    logger.warn('after');
    expect(captured.map(([level]) => level)).toEqual([LogLevel.warn, LogLevel.error]);
    expect(captured[0][2]).toBe('livekit-telemetry-test');
    expect(String(captured[0][1])).toContain(granted()); // raw here; masked by the pipeline
  });

  test('tokens are masked in log bodies and span statuses', async () => {
    expect(mask(`Authorization: Bearer ${granted()} and bearer abc.def-ghi`)).toBe(
      'Authorization: Bearer <jwt> and bearer <token>',
    );
    const records: TelemetryRecord[] = [];
    pipeline.onBatch = (batch) => records.push(...batch);
    const scope = connectedScope(pipeline);
    scope.start('lk.publish').fail(new Error(`refused: ${granted()}`));
    await pipeline.flush();
    expect((records[0] as { statusMessage?: string }).statusMessage).toBe('refused: <jwt>');
    // the SDK logger path, through the installed pipeline
    const installed = telemetry.pipeline;
    const seen: TelemetryRecord[] = [];
    installed.onBatch = (batch) => seen.push(...batch);
    mockFetch([]);
    const room = telemetry.scope(); // installs the pipeline (and the log capture)
    installed.endpoint = 'http://127.0.0.1:1';
    room.setServer('ws://localhost:7880', 'no-token');
    room.setRoom({ sid: 'RM', name: 'masked' });
    const ownLogger = getLogger('livekit-room', () => ({ room: 'masked', [LOG_OWNER]: room }));
    ownLogger.warn(`token ${granted()} leaked`);
    await installed.flush();
    const line = seen.find((r) => r.kind === 'log' && r.body?.startsWith('token '));
    expect(line?.body).toBe('token <jwt> leaked');
    expect(line?.attributes['lk.room.name']).toBe('masked');
  });

  test('a Room reused for another project ships nothing of the first project there', async () => {
    vi.useRealTimers();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls: Call[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        const body = new Uint8Array(await new Response(init.body as BodyInit).arrayBuffer());
        calls.push({ url, headers: init.headers as Record<string, string>, body });
        if (calls.length === 1) await held;
        return new Response('', { status: 200 });
      }),
    );
    const tokenA = granted({ jti: 'a' });
    const tokenB = granted({ jti: 'b' });
    const scope = new TelemetryScope(pipeline);
    scope.connectStarted('wss://proj-a.livekit.cloud', tokenA);
    scope.connectEnded('ok');
    scope.emit('custom.first');
    const inFlight = pipeline.flush(); // request 1 to proj-a, held on the wire
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    scope.emit('custom.captured_under_a');
    scope.disconnected(DisconnectReason.CLIENT_INITIATED); // its flush waits behind the request
    scope.connectStarted('wss://proj-b.livekit.cloud', tokenB);
    scope.connectEnded('ok');
    release();
    await inFlight;
    await flushed(pipeline);
    await flushed(pipeline);
    const toA = calls.filter((c) => c.url.startsWith('https://proj-a.livekit.cloud/'));
    const toB = calls.filter((c) => c.url.startsWith('https://proj-b.livekit.cloud/'));
    expect(toA.length).toBeGreaterThanOrEqual(2);
    expect(toB.length).toBeGreaterThanOrEqual(1);
    expect(toA.every((c) => c.headers.Authorization === `Bearer ${tokenA}`)).toBe(true);
    expect(toB.every((c) => c.headers.Authorization === `Bearer ${tokenB}`)).toBe(true);
    const textA = (await Promise.all(toA.map(textOf))).join('\n');
    const textB = (await Promise.all(toB.map(textOf))).join('\n');
    for (const name of ['custom.first', 'custom.captured_under_a', 'lk.room.disconnected']) {
      expect(textA, name).toContain(name);
      expect(textB, name).not.toContain(name);
    }
    expect(pipeline.stats().cached).toBe(0);
  });

  test('no getStats follows the opt-out, even mid-poll', async () => {
    vi.useRealTimers();
    const reads: string[] = [];
    const peer = (name: string) => ({
      getStats: () => {
        reads.push(name);
        return new Promise<RTCStatsReport>((resolve) =>
          setTimeout(() => resolve(new Map() as unknown as RTCStatsReport), 300),
        );
      },
    });
    const scope = connectedScope(pipeline);
    vi.spyOn(scope, 'statsPollIntervalMs').mockReturnValue(5);
    const poller = new StatsPoller(scope, pipeline, {
      peers: () => [peer('publisher'), peer('subscriber')],
      tracks: () => new Map(),
    });
    poller.start();
    await vi.waitFor(() => expect(reads).toEqual(['publisher']));
    pipeline.disable(); // lands while the first read is on the wire
    await sleep(500);
    expect(reads).toEqual(['publisher']);
  });

  test('a warning goes to the Room whose logger carried it, by identity; a Room-shaped context with no scope is dropped and counted', async () => {
    telemetry.pipeline.endpoint = undefined;
    const seen: TelemetryRecord[] = [];
    telemetry.pipeline.onBatch = (batch) => seen.push(...batch);
    mockFetch([]);
    const cloud = telemetry.scope();
    cloud.setServer(CLOUD, granted());
    const selfHosted = telemetry.scope();
    selfHosted.setServer('ws://localhost:7880', 'no-token');
    // the Room's own logger, before the join: an empty identity, and the scope riding the context
    const ownedBy = (scope: TelemetryScope) =>
      getLogger('livekit-room', () => ({ room: '', roomID: undefined, [LOG_OWNER]: scope }));
    const plain = getLogger('livekit-room');
    plain.setLevel('silent');
    const before = telemetry.pipeline.stats()['dropped.unattributed'] ?? 0;
    const policy = telemetry.pipeline.stats()['policy.no_ingest'] ?? 0;
    // the console and log extensions see the context as before: the scope is not enumerable
    const contexts: object[] = [];
    const probe = getLogger('livekit-ctx-probe');
    probe.methodFactory =
      () =>
      (...args: unknown[]) => {
        if (args[1]) contexts.push(args[1] as object);
      };
    probe.setLevel('warn');
    getLogger('livekit-ctx-probe', () => ({
      room: '',
      roomID: undefined,
      [LOG_OWNER]: cloud,
    })).warn('visible context unchanged');
    expect(Object.keys(contexts[0])).toEqual(['room', 'roomID']);
    expect(Object.getOwnPropertyDescriptor(contexts[0], LOG_OWNER)?.enumerable).toBe(false);
    ownedBy(cloud).warn('for the cloud room');
    const weak = telemetry.carrier(cloud);
    expect(weak).toBeInstanceOf(WeakRef);
    getLogger('livekit-room', () => ({ room: '', [LOG_OWNER]: weak })).warn('via the weak carrier');
    ownedBy(selfHosted).warn('from the self-hosted room'); // its Room's, which has no ingest
    plain.warn('room-shaped, nobody’s', { room: '', roomID: undefined });
    plain.warn('for the process');
    await telemetry.pipeline.flush();
    const bodies = seen.filter((r): r is LogRecord => r.kind === 'log' && !r.eventName);
    expect(bodies.find((r) => r.body === 'for the cloud room')?.attributes['session.id']).toBe(
      cloud.traceId,
    );
    expect(bodies.find((r) => r.body === 'via the weak carrier')?.attributes['session.id']).toBe(
      cloud.traceId,
    );
    expect(bodies.find((r) => r.body === 'from the self-hosted room')).toBeUndefined();
    expect(telemetry.pipeline.stats()['policy.no_ingest']).toBe(policy + 1);
    expect(bodies.find((r) => r.body?.startsWith('room-shaped'))).toBeUndefined();
    expect(telemetry.pipeline.stats()['dropped.unattributed']).toBe(before + 1);
    expect(bodies.find((r) => r.body === 'for the process')?.attributes['session.id']).toBe(
      telemetry.pipeline.processTraceId,
    );
    telemetry.pipeline.onBatch = undefined;
  });

  test('a record keeps its capture-time collection decision, whatever the Room connects to next', async () => {
    const seen: TelemetryRecord[] = [];
    pipeline.onBatch = (batch) => seen.push(...batch);
    mockFetch([]);
    const scope = new TelemetryScope(pipeline);
    scope.connectStarted('ws://localhost:7880', 'no-token'); // self-hosted: nothing of it is ever sent
    scope.connectEnded('ok');
    const selfHosted = scope.start('lk.publish');
    scope.connectStarted('wss://proj-b.livekit.cloud', granted()); // reused for a Cloud project
    scope.connectEnded('ok');
    const cloud = scope.start('lk.publish');
    scope.connectStarted('ws://localhost:7881', 'no-token'); // and self-hosted again
    scope.connectEnded('ok');
    selfHosted.end('ok'); // never adopted by the Cloud project it never had
    cloud.end('ok'); // never dropped because the Room is self-hosted now
    await flushed(pipeline);
    const publishes = seen.filter(
      (r): r is SpanRecord => r.kind === 'span' && r.name === 'lk.publish',
    );
    expect(publishes.map((p) => p.spanId)).toEqual([cloud.spanId]);
    expect(publishes[0].host).toBe('proj-b.livekit.cloud');
    expect(pipeline.stats()['policy.no_ingest']).toBeGreaterThanOrEqual(1); // counted, never silent
    expect(pipeline.stats()['dropped.unattributed']).toBeUndefined();
  });

  test('telemetry holds a Room strongly only while it is in a call', () => {
    const scope = new TelemetryScope(pipeline);
    expect(pipeline.scopes.has(scope)).toBe(false); // constructed, never connected: tracked weakly only
    scope.setServer(CLOUD, granted());
    expect(pipeline.scopes.has(scope)).toBe(true);
    scope.disconnected(DisconnectReason.CLIENT_INITIATED);
    expect(pipeline.scopes.has(scope)).toBe(false);
  });

  test('a span or window opened under one connection keeps that owner through the next', async () => {
    const seen: TelemetryRecord[] = [];
    pipeline.onBatch = (batch) => seen.push(...batch);
    mockFetch([]);
    const scope = new TelemetryScope(pipeline);
    scope.connectStarted('wss://proj-a.livekit.cloud', granted({ jti: 'a' }));
    scope.connectEnded('ok');
    scope.setRoom({ sid: 'RA' });
    const span = scope.start('lk.publish');
    const report = new Map([
      ['in1', { id: 'in1', type: 'inbound-rtp', trackIdentifier: 'mst1', bytesReceived: 777 }],
    ]) as unknown as RTCStatsReport;
    const tracks = new Map([
      ['mst1', { sid: 'TR_A', kind: 'audio', direction: 'inbound' } as const],
    ]);
    scope.recordPeerStats(report, tracks); // a window opens under A
    scope.connectStarted('wss://proj-b.livekit.cloud', granted({ jti: 'b' }));
    scope.connectEnded('ok');
    scope.setRoom({ sid: 'RB' });
    span.end('ok');
    scope.closeWindows();
    await flushed(pipeline);
    const publish = seen.find((r): r is SpanRecord => r.kind === 'span' && r.name === 'lk.publish');
    const window = seen.find(
      (r): r is LogRecord => r.kind === 'log' && r.eventName === 'lk.rtc.stats.sample',
    );
    for (const record of [publish, window]) {
      expect(record?.host).toBe('proj-a.livekit.cloud');
      expect(record?.attributes['lk.room.sid']).toBe('RA');
    }
    expect(window?.attributes['lk.rtc.bytes']).toBe(777);
  });

  test('an old poll never reads or records under a later connection, whichever peer answers', async () => {
    vi.useRealTimers();
    const reads: Array<{ peer: string; resolve: (report: RTCStatsReport) => void }> = [];
    const peer = (name: string) => ({
      getStats: () =>
        new Promise<RTCStatsReport>((resolve) => {
          reads.push({ peer: name, resolve });
        }),
    });
    let trackCalls = 0;
    const scope = connectedScope(pipeline);
    const recorded = vi.spyOn(scope, 'recordPeerStats');
    vi.spyOn(scope, 'statsPollIntervalMs').mockReturnValue(5);
    const poller = new StatsPoller(scope, pipeline, {
      peers: () => [peer('publisher'), peer('subscriber')],
      tracks: () => {
        trackCalls += 1;
        return new Map([
          ['mst', { sid: `T${trackCalls}`, kind: 'audio', direction: 'inbound' } as const],
        ]);
      },
    });
    const empty = () => new Map() as unknown as RTCStatsReport;
    poller.start();
    await vi.waitFor(() => expect(reads).toHaveLength(1)); // the old poll's publisher read
    poller.stop();
    poller.start();
    reads[0].resolve(empty()); // answers late: dropped, and the old poll reads no further peer
    await sleep(20);
    expect(recorded).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(reads).toHaveLength(2)); // the new poll's publisher read
    reads[1].resolve(empty());
    await vi.waitFor(() => expect(reads).toHaveLength(3)); // then its subscriber read
    reads[2].resolve(empty());
    await vi.waitFor(() => expect(recorded).toHaveBeenCalledTimes(2));
    poller.stop(); // the next scheduled poll would add a fourth read
    expect(reads.slice(0, 3).map((r) => r.peer)).toEqual(['publisher', 'publisher', 'subscriber']);
    for (const call of recorded.mock.calls) expect(call[1].get('mst')?.sid).toBe('T2'); // the new track map, never the old
  });

  test('after the opt-out nothing is retained: no span buffer, attribute, identity, credential or timer', () => {
    mockFetch([]);
    const unconnected = new TelemetryScope(pipeline); // a Room that never connected
    const preSpan = unconnected.start('lk.publish');
    const scope = connectedScope(pipeline);
    scope.setRoom({ sid: 'RA', name: 'room' });
    scope.setAttribute('app.before', 'kept?');
    const span = scope.start('lk.publish', { attributes: { 'lk.track.kind': 'audio' } });
    span.step('early');
    const peek = () => (pipeline as unknown as { projects: Map<string, unknown> }).projects;
    expect(peek().size).toBe(1);
    pipeline.disable();
    // purged: spans closed and emptied, identity, attributes and credentials gone
    expect(preSpan.ended).toBe(true); // although its Room never had a server
    expect(span.ended).toBe(true);
    const buffers = span as unknown as {
      events: unknown[];
      attributes: object;
      owner: { attributes: object };
    };
    expect(buffers.events).toEqual([]);
    expect(buffers.attributes).toEqual({});
    expect(buffers.owner.attributes).toEqual({});
    expect(scope.identity).toEqual({});
    expect(scope.host).toBeUndefined();
    expect(scope.attributes()['app.before']).toBeUndefined();
    expect(peek().size).toBe(0);
    // refused afterwards: nothing is taken, nothing starts
    scope.setServer(CLOUD, granted());
    scope.refreshToken(granted());
    pipeline.setServer(CLOUD, granted(), scope);
    scope.setRoom({ sid: 'RB' });
    scope.trackPublished('TR_pub');
    scope.setAttribute('app.after', 'v');
    expect(peek().size).toBe(0);
    expect(scope.host).toBeUndefined();
    expect(scope.identity).toEqual({});
    expect(scope.statsPollIntervalMs()).toBe(pipeline.statsWindowMs / 2);
    expect(scope.attributes()['app.after']).toBeUndefined();
    span.step('late');
    span.end('ok');
    const timers = vi.getTimerCount();
    scope.subscribeStarted({ sid: 'TR_1', kind: 'video' });
    scope.subscribed({ sid: 'TR_2', kind: 'audio' });
    expect(vi.getTimerCount()).toBe(timers);
    expect(scope.start('lk.publish').ended).toBe(true);
    expect(pipeline.stats()).toMatchObject({ queued: 0, cached: 0 });
  });

  test('a subscribe without media times out after 30 s on the pipeline’s clock', async () => {
    const seen: TelemetryRecord[] = [];
    pipeline.onBatch = (batch) => seen.push(...batch);
    mockFetch([]);
    const scope = connectedScope(pipeline);
    scope.subscribeStarted({ sid: 'TR_1', kind: 'video' });
    vi.advanceTimersByTime(30_000);
    await pipeline.flush();
    const span = seen.find((r): r is SpanRecord => r.kind === 'span' && r.name === 'lk.subscribe');
    expect(span?.attributes).toMatchObject({ 'lk.outcome': 'error', 'error.type': 'timed_out' });
    expect(span?.status).toBe(2);
  });

  test('the logger passes every argument through unchanged, with or without the capture', () => {
    const logger = getLogger('livekit-telemetry-args');
    const seen: unknown[][] = [];
    logger.methodFactory =
      () =>
      (...args: unknown[]) => {
        seen.push(args);
      };
    logger.setLevel('warn'); // rebuilds the methods; the forwarder wraps the recorder
    setLogCapture(undefined);
    logger.warn('m', 0, 'third');
    const captured: unknown[] = [];
    setLogCapture((_level, msg, context) => captured.push(msg, context));
    logger.warn('m', 0, 'third');
    logger.error('e', { a: 1 });
    setLogCapture(undefined);
    expect(seen).toEqual([
      ['m', 0, 'third'],
      ['m', 0, 'third'],
      ['e', { a: 1 }],
    ]);
    expect(captured).toEqual(['m', undefined, 'e', { a: 1 }]);
  });

  test('a throwing log extension never turns a telemetry failure into an SDK exception', () => {
    const debug = log.debug;
    log.debug = () => {
      throw new Error('log extension down');
    };
    try {
      const failing = guarded({
        run() {
          throw new Error('telemetry bug');
        },
      });
      expect(() => failing.run()).not.toThrow();
    } finally {
      log.debug = debug;
    }
  });

  test('required connect checkpoints keep their order; a peer connection before the join is the optional early one', async () => {
    const seen: TelemetryRecord[] = [];
    pipeline.onBatch = (batch) => seen.push(...batch);
    mockFetch([]);
    const connect = async (steps: string[]) => {
      const scope = new TelemetryScope(pipeline);
      scope.connectStarted(CLOUD, granted());
      steps.forEach((step) => scope.connectStep(step));
      scope.connectEnded('ok');
      await pipeline.flush();
      const span = seen.pop() as SpanRecord;
      return span.events.map((e) => e.name);
    };
    // offer-with-join: the peer connection exists before the join response
    expect(await connect(['ws_open', 'signal', 'pc_created', 'join_recv', 'pc_connected'])).toEqual(
      ['ws_open', 'signal', 'early_pc_created', 'join_recv', 'pc_created', 'pc_connected'],
    );
    // the deferred path: created once the join is adopted
    expect(await connect(['ws_open', 'signal', 'join_recv', 'pc_created'])).toEqual([
      'ws_open',
      'signal',
      'join_recv',
      'pc_created',
    ]);
  });

  test('a new connection ends a reconnect in progress as cancelled and releases its hold', async () => {
    const seen: TelemetryRecord[] = [];
    pipeline.onBatch = (batch) => seen.push(...batch);
    mockFetch([]);
    const scope = new TelemetryScope(pipeline);
    scope.connectStarted(CLOUD, granted());
    scope.connectEnded('ok');
    scope.reconnectAttempt('quick', ReconnectReason.RR_SIGNAL_DISCONNECTED);
    expect(scope.reconnecting).toBe(true);
    scope.connectStarted(CLOUD, granted());
    expect(scope.reconnecting).toBe(false);
    scope.connectEnded('ok');
    scope.emit('custom.after');
    await flushed(pipeline);
    const reconnect = seen.find(
      (r): r is SpanRecord => r.kind === 'span' && r.name === 'lk.reconnect',
    );
    expect(reconnect?.attributes['lk.outcome']).toBe('cancelled');
    expect(pipeline.stats().cached).toBe(0); // its hold went with it
  });

  test('a warning during a publish points at the publish span, which itself nests under the open connect', async () => {
    const seen: TelemetryRecord[] = [];
    pipeline.onBatch = (batch) => seen.push(...batch);
    mockFetch([]);
    const scope = new TelemetryScope(pipeline);
    scope.connectStarted(CLOUD, granted());
    const publish = scope.start('lk.publish', { parent: scope.uplink() });
    scope.log('warn', 'negotiation slow', 'livekit-participant');
    publish.end('ok');
    scope.connectEnded('ok');
    await flushed(pipeline);
    const line = seen.find(
      (r): r is LogRecord => r.kind === 'log' && r.body === 'negotiation slow',
    );
    expect(line?.spanId).toBe(publish.spanId);
    const connect = seen.find((r): r is SpanRecord => r.kind === 'span' && r.name === 'lk.connect');
    const span = seen.find((r): r is SpanRecord => r.kind === 'span' && r.name === 'lk.publish');
    expect(span?.parentSpanId).toBe(connect?.spanId);
  });

  test('attributes count stored keys only: the 65th is rejected whatever its name, __proto__ is a key like any other', () => {
    const scope = connectedScope(pipeline);
    for (let i = 0; i < 63; i += 1) scope.setAttribute(`app.k${i}`, 'v');
    const proto = '__proto__';
    scope.setAttribute(proto, 'proto');
    expect(Object.entries(scope.attributes()).find(([key]) => key === proto)?.[1]).toBe('proto');
    scope.setAttribute('constructor', 'over'); // the 65th key
    expect(Object.keys(scope.attributes())).not.toContain('constructor');
    expect(pipeline.stats()['dropped.invalid']).toBe(1);
    scope.setAttribute('app.k0', 'replaced'); // an existing key is not a new one
    expect(scope.attributes()['app.k0']).toBe('replaced');
  });

  test('a published track without a reading stops the fast polling after 30 s', () => {
    const scope = connectedScope(pipeline);
    scope.trackPublished('TR_1');
    expect(scope.statsPollIntervalMs()).toBe(1000);
    vi.advanceTimersByTime(30_001);
    expect(scope.statsPollIntervalMs()).toBe(pipeline.statsWindowMs / 2);
  });

  test('a failing publisher read does not cost the subscriber its reading', async () => {
    vi.useRealTimers();
    const scope = connectedScope(pipeline);
    const recorded = vi.spyOn(scope, 'recordPeerStats');
    vi.spyOn(scope, 'statsPollIntervalMs').mockReturnValue(5);
    const poller = new StatsPoller(scope, pipeline, {
      peers: () => [
        { getStats: () => Promise.reject(new Error('closed')) },
        { getStats: () => Promise.resolve(new Map() as unknown as RTCStatsReport) },
      ],
      tracks: () => new Map(),
    });
    poller.start();
    await vi.waitFor(() => expect(recorded).toHaveBeenCalled());
    poller.stop();
  });

  test('an encoder going CPU-limited stretches the cadence at once, and relief applies without a tick', () => {
    const scope = connectedScope(pipeline);
    const tracks = new Map([['mst', { sid: 'TR', kind: 'video', direction: 'outbound' } as const]]);
    const report = (cpu: number) =>
      new Map([
        [
          'o1',
          {
            id: 'o1',
            type: 'outbound-rtp',
            trackIdentifier: 'mst',
            bytesSent: 1,
            qualityLimitationDurations: { cpu, bandwidth: 0, other: 0 },
          },
        ],
      ]) as unknown as RTCStatsReport;
    expect(pipeline.statsWindowMs).toBe(60_000);
    scope.recordPeerStats(report(0), tracks);
    scope.recordPeerStats(report(1), tracks); // the CPU duration grew
    expect(pipeline.statsWindowMs).toBe(120_000);
    vi.advanceTimersByTime(60_001);
    expect(pipeline.statsWindowMs).toBe(60_000);
  });

  test('a window closes at its boundary on the pipeline clock, with no further reading', async () => {
    const seen: TelemetryRecord[] = [];
    pipeline.onBatch = (batch) => seen.push(...batch);
    mockFetch([]);
    const scope = connectedScope(pipeline);
    const tracks = new Map([['mst', { sid: 'TR', kind: 'audio', direction: 'inbound' } as const]]);
    const report = new Map([
      ['in1', { id: 'in1', type: 'inbound-rtp', trackIdentifier: 'mst', bytesReceived: 100 }],
    ]) as unknown as RTCStatsReport;
    scope.recordPeerStats(report, tracks);
    vi.advanceTimersByTime(60_000);
    await pipeline.flush();
    const window = seen.find(
      (r): r is LogRecord => r.kind === 'log' && r.eventName === 'lk.rtc.stats.sample',
    );
    expect(window?.attributes['lk.rtc.window_ms']).toBeGreaterThanOrEqual(60_000);
    expect(window?.attributes['lk.rtc.bytes']).toBe(100);
  });

  test('counters keep layer history, gauges come only from readings inside the window, idle layers retire', async () => {
    const seen: TelemetryRecord[] = [];
    pipeline.onBatch = (batch) => seen.push(...batch);
    mockFetch([]);
    const scope = connectedScope(pipeline);
    const tracks = new Map([['mst', { sid: 'TR', kind: 'video', direction: 'outbound' } as const]]);
    const layer = (rid: string, bytesSent: number, rtt: number) => [
      { id: `o-${rid}`, type: 'outbound-rtp', trackIdentifier: 'mst', rid, bytesSent },
      { id: `r-${rid}`, type: 'remote-inbound-rtp', localId: `o-${rid}`, roundTripTime: rtt },
    ];
    const asReport = (stats: object[]) =>
      new Map(stats.map((s) => [(s as { id: string }).id, s])) as unknown as RTCStatsReport;
    scope.recordPeerStats(asReport([...layer('h', 100, 0.5), ...layer('q', 50, 0.5)]), tracks);
    scope.closeWindows();
    scope.recordPeerStats(asReport(layer('h', 120, 0.01)), tracks); // q stopped: its bytes stay, its RTT does not
    scope.closeWindows();
    vi.advanceTimersByTime(180_001);
    scope.recordPeerStats(asReport(layer('h', 130, 0.01)), tracks); // q idle for 3 min: retired
    scope.closeWindows();
    await pipeline.flush();
    const windows = seen.filter(
      (r): r is LogRecord => r.kind === 'log' && r.eventName === 'lk.rtc.stats.sample',
    );
    expect(windows.map((w) => w.attributes['lk.rtc.bytes'])).toEqual([150, 170, 130]);
    expect(windows[0].attributes['lk.rtc.rtt_ms.max']).toBeCloseTo(500);
    expect(windows[1].attributes['lk.rtc.rtt_ms.max']).toBeCloseTo(10);
  });

  test('a connect accepted during a poll drops that poll’s readings', async () => {
    vi.useRealTimers();
    let resolveRead: ((report: RTCStatsReport) => void) | undefined;
    const scope = new TelemetryScope(pipeline);
    scope.connectStarted('wss://proj-a.livekit.cloud', granted({ jti: 'a' }));
    scope.connectEnded('ok');
    const recorded = vi.spyOn(scope, 'recordPeerStats');
    vi.spyOn(scope, 'statsPollIntervalMs').mockReturnValue(5);
    const poller = new StatsPoller(scope, pipeline, {
      peers: () => [
        {
          getStats: () =>
            new Promise<RTCStatsReport>((resolve) => {
              resolveRead = resolve;
            }),
        },
      ],
      tracks: () => new Map(),
    });
    poller.start();
    await vi.waitFor(() => expect(resolveRead).toBeDefined());
    const answer = resolveRead!;
    scope.connectStarted('wss://proj-b.livekit.cloud', granted({ jti: 'b' })); // superseding connect; the poller never stopped
    answer(new Map() as unknown as RTCStatsReport);
    await sleep(20);
    expect(recorded).not.toHaveBeenCalled();
    poller.stop();
  });

  test('a span or window opened before the Room had a project belongs to its first one, however late it ends', async () => {
    const seen: TelemetryRecord[] = [];
    pipeline.onBatch = (batch) => seen.push(...batch);
    mockFetch([]);
    const scope = new TelemetryScope(pipeline);
    const early = scope.start('lk.publish'); // a pre-connect publish
    scope.connectStarted('wss://proj-a.livekit.cloud', granted({ jti: 'a' }));
    scope.connectEnded('ok');
    scope.setRoom({ sid: 'RA' });
    const tracks = new Map([['mst', { sid: 'TR', kind: 'audio', direction: 'inbound' } as const]]);
    const report = new Map([
      ['in1', { id: 'in1', type: 'inbound-rtp', trackIdentifier: 'mst', bytesReceived: 100 }],
    ]) as unknown as RTCStatsReport;
    scope.recordPeerStats(report, tracks); // a window under A
    scope.connectStarted('wss://proj-b.livekit.cloud', granted({ jti: 'b' })); // the Room is reused
    scope.connectEnded('ok');
    early.end('ok'); // finishes after the reuse: still A's
    await flushed(pipeline);
    const publish = seen.find((r): r is SpanRecord => r.kind === 'span' && r.name === 'lk.publish');
    expect(publish?.host).toBe('proj-a.livekit.cloud');
    const window = seen.find(
      (r): r is LogRecord => r.kind === 'log' && r.eventName === 'lk.rtc.stats.sample',
    );
    expect(window?.host).toBe('proj-a.livekit.cloud'); // shipped when the new connect was accepted
    expect(window?.attributes['lk.room.sid']).toBe('RA');
  });

  test('without WeakRef telemetry fails closed; without FinalizationRegistry the opt-out still reaches every live Room', () => {
    vi.stubGlobal('WeakRef', undefined);
    const plain = new Pipeline();
    expect(plain.enabled).toBe(false);
    expect(new TelemetryScope(plain).start('lk.publish').ended).toBe(true); // nothing registered, nothing captured
    vi.unstubAllGlobals();
    vi.stubGlobal('FinalizationRegistry', undefined);
    const many = new Pipeline();
    const spans = Array.from({ length: 300 }, () => new TelemetryScope(many).start('lk.publish'));
    many.disable();
    expect(spans.every((s) => s.ended)).toBe(true);
  });

  test('failed-delete markers follow the store: retired on eviction, bounded, gone at opt-out; an uploaded batch is never a loss', async () => {
    const calls = mockFetch(Array.from({ length: 5 }, () => ({ status: 200 })));
    const store = new MemoryStorage(1 << 20, 1); // one slot
    store.remove = () => {
      throw new Error('locked');
    };
    pipeline.storage = store;
    const scope = connectedScope(pipeline);
    scope.inCall = false;
    const markers = () => (pipeline as unknown as { deleting: Set<string> }).deleting;
    for (let i = 0; i < 3; i += 1) {
      scope.emit(`custom.${i}`);
      await pipeline.flush();
    }
    expect(calls).toHaveLength(3); // each batch once
    expect(markers().size).toBeLessThanOrEqual(1); // only the batch still in the store
    expect(pipeline.stats()['dropped.cache_full']).toBeUndefined(); // uploaded batches leaving the store are no loss
    pipeline.disable();
    expect(markers().size).toBe(0);
  });

  test('idle layer histories retire from the window timer, with no further reading', () => {
    const scope = connectedScope(pipeline);
    const tracks = new Map([['mst', { sid: 'TR', kind: 'video', direction: 'outbound' } as const]]);
    const report = new Map([
      ['o1', { id: 'o1', type: 'outbound-rtp', trackIdentifier: 'mst', rid: 'h', bytesSent: 1 }],
    ]) as unknown as RTCStatsReport;
    scope.recordPeerStats(report, tracks);
    scope.closeWindows();
    const layers = (scope as unknown as { layers: Map<string, unknown> }).layers;
    expect(layers.size).toBe(1);
    vi.advanceTimersByTime(180_001);
    expect(layers.size).toBe(0);
  });

  test('cadence relief moves the window boundaries at once', async () => {
    const seen: TelemetryRecord[] = [];
    pipeline.onBatch = (batch) => seen.push(...batch);
    mockFetch([]);
    pipeline.deviceState({ thermal: 'critical' }); // ×4: windows would close at 240 s
    const scope = connectedScope(pipeline);
    const tracks = new Map([['mst', { sid: 'TR', kind: 'audio', direction: 'inbound' } as const]]);
    const report = new Map([
      ['in1', { id: 'in1', type: 'inbound-rtp', trackIdentifier: 'mst', bytesReceived: 100 }],
    ]) as unknown as RTCStatsReport;
    scope.recordPeerStats(report, tracks);
    vi.advanceTimersByTime(10_000);
    pipeline.deviceState({ thermal: 'nominal' }); // relief: the boundary is 60 s again
    vi.advanceTimersByTime(50_001);
    await pipeline.flush();
    const window = seen.find(
      (r): r is LogRecord => r.kind === 'log' && r.eventName === 'lk.rtc.stats.sample',
    );
    expect(window).toBeDefined();
  });

  test('a failing record inside the window timer never escapes', () => {
    const scope = connectedScope(pipeline);
    const tracks = new Map([['mst', { sid: 'TR', kind: 'audio', direction: 'inbound' } as const]]);
    const report = new Map([
      ['in1', { id: 'in1', type: 'inbound-rtp', trackIdentifier: 'mst', bytesReceived: 100 }],
    ]) as unknown as RTCStatsReport;
    scope.recordPeerStats(report, tracks);
    vi.spyOn(pipeline, 'record').mockImplementation(() => {
      throw new Error('pipeline bug');
    });
    expect(() => vi.advanceTimersByTime(60_000)).not.toThrow();
  });

  test('any logger obtained through getLogger is captured at warn/error whatever its level, debug never', () => {
    const logger = getLogger('some-package');
    logger.setLevel('silent');
    const captured: unknown[][] = [];
    setLogCapture((level, msg, context, name) => captured.push([level, msg, context, name]));
    logger.warn('pkg warning', { a: 1 }, 'third');
    logger.error('pkg error');
    logger.debug('telemetry: dropped a failing call');
    setLogCapture(undefined);
    expect(captured).toEqual([
      [LogLevel.warn, 'pkg warning', { a: 1 }, 'some-package'],
      [LogLevel.error, 'pkg error', undefined, 'some-package'],
    ]);
  });

  test('a Room’s queued pre-server records are resolved by its first server: self-hosted drops and counts them, nothing unassigned survives', async () => {
    const seen: TelemetryRecord[] = [];
    pipeline.onBatch = (batch) => seen.push(...batch);
    mockFetch([]);
    const scope = new TelemetryScope(pipeline);
    scope.emitCustom('early');
    scope.log('warn', 'early warning', 'livekit-room');
    scope.start('lk.publish').end('ok');
    expect(pipeline.stats().queued).toBe(3); // unassigned, waiting for the Room's first server
    const policy = pipeline.stats()['policy.no_ingest'] ?? 0;
    scope.connectStarted('ws://localhost:7880', 'no-token'); // the first server has no ingest
    expect(pipeline.stats().queued).toBe(0);
    expect(pipeline.stats()['policy.no_ingest']).toBe(policy + 3);
    scope.connectEnded('ok');
    scope.connectStarted('wss://proj-b.livekit.cloud', granted()); // a Cloud project later gets nothing of them
    scope.connectEnded('ok');
    await flushed(pipeline);
    const names = seen.map((r) => (r.kind === 'span' ? r.name : (r.eventName ?? r.body)));
    expect(names).not.toContain('custom.early');
    expect(names).not.toContain('early warning');
    expect(names).not.toContain('lk.publish');
    expect(names).toContain('lk.connect'); // B's own connect
  });

  test('an unavailable listing reconciles nothing: an accepted batch keeps its marker and is never re-sent', async () => {
    const calls = mockFetch([{ status: 200 }, { status: 200 }]);
    const store = new MemoryStorage(1 << 20, 1);
    store.remove = () => {
      throw new Error('locked');
    };
    let unavailable = false;
    const list = store.pending.bind(store);
    store.pending = () => {
      if (unavailable) throw new Error('io');
      return list();
    };
    pipeline.storage = store;
    const scope = connectedScope(pipeline);
    scope.emit('custom.once');
    await pipeline.flush(); // taken by the collector, deletion refused
    expect(calls).toHaveLength(1);
    unavailable = true;
    await pipeline.flush(); // nothing reconciled, nothing sent
    expect(pipeline.stats()['cache.list_errors']).toBe(1);
    unavailable = false;
    await pipeline.flush();
    expect(calls).toHaveLength(1); // the marker survived the outage
  });

  test('at the marker cap nothing new is sent: no live marker is ever evicted', async () => {
    const calls = mockFetch(Array.from({ length: 4 }, () => ({ status: 200 })));
    const store = new MemoryStorage(1 << 20, 10);
    const remove = store.remove.bind(store);
    store.remove = () => {
      throw new Error('locked');
    };
    pipeline.storage = store;
    (pipeline as unknown as { markerCap: number }).markerCap = 2;
    const scope = connectedScope(pipeline);
    scope.inCall = false;
    const markers = (pipeline as unknown as { deleting: Set<string> }).deleting;
    for (let i = 0; i < 3; i += 1) {
      scope.emit(`custom.${i}`);
      await pipeline.flush();
    }
    expect(calls).toHaveLength(2); // the third upload waits
    expect(markers.size).toBe(2);
    store.remove = remove; // deletions work again: markers retire, the held batch goes
    await pipeline.flush();
    expect(calls).toHaveLength(3);
    expect(markers.size).toBe(0);
  });

  test('a Room leaving applies cadence relief to the Rooms that stay', async () => {
    const seen: TelemetryRecord[] = [];
    pipeline.onBatch = (batch) => seen.push(...batch);
    mockFetch([]);
    const a = connectedScope(pipeline);
    const b = connectedScope(pipeline);
    const inbound = new Map([
      ['mst-b', { sid: 'TR_B', kind: 'audio', direction: 'inbound' } as const],
    ]);
    b.recordPeerStats(
      new Map([
        ['in1', { id: 'in1', type: 'inbound-rtp', trackIdentifier: 'mst-b', bytesReceived: 100 }],
      ]) as unknown as RTCStatsReport,
      inbound,
    );
    const outbound = new Map([
      ['mst-a', { sid: 'TR_A', kind: 'video', direction: 'outbound' } as const],
    ]);
    const cpu = (ms: number) =>
      new Map([
        [
          'o1',
          {
            id: 'o1',
            type: 'outbound-rtp',
            trackIdentifier: 'mst-a',
            bytesSent: 1,
            qualityLimitationDurations: { cpu: ms, bandwidth: 0, other: 0 },
          },
        ],
      ]) as unknown as RTCStatsReport;
    a.recordPeerStats(cpu(0), outbound);
    a.recordPeerStats(cpu(1), outbound); // A is CPU-limited: every window now closes at 120 s
    expect(pipeline.statsWindowMs).toBe(120_000);
    vi.advanceTimersByTime(10_000);
    a.disconnected(DisconnectReason.CLIENT_INITIATED); // A leaves: relief applies to B now, no tick needed
    expect(pipeline.statsWindowMs).toBe(60_000);
    vi.advanceTimersByTime(50_001);
    await pipeline.flush();
    const windows = seen.filter(
      (r): r is LogRecord => r.kind === 'log' && r.eventName === 'lk.rtc.stats.sample',
    );
    expect(windows.some((w) => w.attributes['lk.track.sid'] === 'TR_B')).toBe(true);
  });

  test('an opt-out purges the configured host’s cache, whichever is set first', async () => {
    const stale = new MemoryStorage(1 << 20, 10);
    stale.put('000000000000001_000001_3_l_proj-abc.livekit.cloud', new Uint8Array([1, 2, 3]));
    configureTelemetryHost({ storage: stale });
    disableTelemetry();
    expect(stale.pending()).toEqual([]);
    // the other order: opting out first, the host configured afterwards
    const later = new MemoryStorage(1 << 20, 10);
    later.put('000000000000002_000001_3_l_proj-abc.livekit.cloud', new Uint8Array([1, 2, 3]));
    configureTelemetryHost({ storage: later });
    expect(later.pending()).toEqual([]);
    const calls = mockFetch([]);
    const room = telemetry.scope(); // a Room created after the opt-out
    room.setServer(CLOUD, granted());
    room.emit('custom.after');
    await telemetry.pipeline.flush(true);
    expect(telemetry.pipeline.enabled).toBe(false);
    expect(calls).toHaveLength(0);
  });

  test('an answer that lands after the opt-out never refills the cache', async () => {
    vi.useRealTimers();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requested = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        requested = true;
        await held;
        return new Response('', { status: 413 }); // a split would write two halves
      }),
    );
    const scope = connectedScope(pipeline);
    scope.emit('custom.a');
    scope.emit('custom.b');
    const flush = pipeline.flush();
    await vi.waitFor(() => expect(requested).toBe(true));
    pipeline.disable();
    release();
    await flush;
    expect(pipeline.stats()).toMatchObject({ cached: 0, queued: 0 });
  });
});
