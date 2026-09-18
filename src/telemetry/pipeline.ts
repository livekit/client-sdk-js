/**
 * The upload policy: one queue, one request in flight, holds while the uplink belongs to media.
 * Everything a browser cannot do is absent by design — no disk cache, no replay across launches
 * (TELEMETRY.md §3), so the queue is the only bound and every eviction is counted.
 */
import { version } from '../version';
import type { Backend, Scope } from './backend';
import { type DeviceState, cadenceFactor, changes } from './device';
import {
  type AttributeValue,
  type Attributes,
  type Encoding,
  INSTRUMENTATION_SCOPE,
  type LogRecord,
  type Resource,
  Severity,
  type SpanRecord,
  contentType,
  hrTime,
  serializeLogs,
  serializeSpans,
} from './otlp';
import { PipelineScope } from './scope';
import {
  MemoryStorage,
  type TelemetryStorage,
  batchEncoding,
  batchId,
  batchKind,
  batchRecords,
} from './storage';

export interface TelemetryOptions {
  /** OTLP logs route. Cloud derives it from the server URL instead; see `setServer`. */
  endpoint?: string;
  headers?: Record<string, string>;
  encoding?: Encoding;
  /** Seconds between uploads (default 15). */
  flushInterval?: number;
  /** Seconds per `lk.rtc.stats.sample` window (default 15). */
  statsWindow?: number;
  maxQueueSize?: number;
  resource?: Record<string, AttributeValue>;
  /**
   * Where batches wait between being made and being accepted. A platform with a filesystem
   * supplies one that survives the process; the default keeps them in memory.
   */
  storage?: TelemetryStorage;
}

interface Destination {
  logs: string;
  traces: string;
  headers: Record<string, string>;
}

const FLUSH_INTERVAL = 15;
const STATS_WINDOW = 15;
const MAX_QUEUE = 2048;
const MAX_BATCH = 512;
/** What the cache may hold: 4 MiB across at most 512 batches, oldest evicted first. */
const MAX_CACHE_BYTES = 4 * 1024 * 1024;
const MAX_CACHE_BATCHES = 512;
/** A backlog replays beside a live call at this many batches per tick, never faster (SPEC). */
const MAX_BATCHES_PER_UPLOAD = 4;
/** Browsers cap every in-flight keepalive body at 64 KiB together; stay under it. */
const KEEPALIVE_LIMIT = 60 * 1024;
/** A hold never outlasts this, whatever the signal that raised it claims (SPEC). */
const HOLD_CAP_MS = 60_000;
/** LiveKit Cloud's quota answer names no delay, so a bare 429 means "this minute". */
const THROTTLE_DEFAULT_MS = 60_000;
const FLOOD_LIMIT = 300;
const FLOOD_WINDOW_MS = 10 * 60_000;

export interface Counters {
  sent: number;
  bytes: number;
  failed: number;
  holdsCapped: number;
  droppedCacheFull: number;
  droppedCacheError: number;
  droppedQueueFull: number;
  droppedRejected: number;
  droppedThrottled: number;
  droppedRateLimited: number;
}

function emptyCounters(): Counters {
  return {
    sent: 0,
    bytes: 0,
    failed: 0,
    holdsCapped: 0,
    droppedCacheFull: 0,
    droppedCacheError: 0,
    droppedQueueFull: 0,
    droppedRejected: 0,
    droppedThrottled: 0,
    droppedRateLimited: 0,
  };
}

/** `wss://host/…` → the client OTLP routes on the same host. */
export function cloudEndpoints(serverUrl: string): { logs: string; traces: string } {
  const url = new URL(serverUrl);
  const host = `${url.protocol === 'ws:' || url.protocol === 'http:' ? 'http' : 'https'}://${url.host}`;
  return {
    logs: `${host}/observability/client/logs/otlp/v0`,
    traces: `${host}/observability/client/traces/otlp/v0`,
  };
}

/** A collector's logs route implies its traces route, both for Cloud and for plain OTLP. */
export function tracesEndpointFor(logs: string): string {
  if (logs.includes('/logs/otlp/')) return logs.replace('/logs/otlp/', '/traces/otlp/');
  if (logs.endsWith('/v1/logs')) return `${logs.slice(0, -'/v1/logs'.length)}/v1/traces`;
  return logs;
}

export class Pipeline implements Backend {
  private logs: LogRecord[] = [];

  private spans: SpanRecord[] = [];

  private destination?: Destination;

  private encoding: Encoding = 'protobuf';

  private timer?: ReturnType<typeof setInterval>;

  private inFlight = false;

  private throttledUntil = 0;

  private holds = 0;

  private holdSince = 0;

  private counters = emptyCounters();

  private reportDue = false;

  private floodCount = 0;

  private floodWindowStart = 0;

  private disabled = false;

  /** Set by whoever says telemetry is wanted, which is not the same as knowing where to send it. */
  private collecting = false;

  /** Device state belongs to no call: it is filed under the pipeline's own scope (SPEC). */
  private processScope?: PipelineScope;

  private device: DeviceState = {};

  private storage: TelemetryStorage = new MemoryStorage(MAX_CACHE_BYTES, MAX_CACHE_BATCHES);

  private sequence = 0;

  resource: Resource = { attributes: {} };

  private baseFlushInterval = FLUSH_INTERVAL;

  private baseStatsWindow = STATS_WINDOW;

  /** SPEC's cadence policy: pressure stretches both periods, never past 4×. Two sources
   *  multiply — what this package observes, and what a platform reports through
   *  `setCadenceFactor` for the pressure it can see and this one cannot. */
  private cadence = 1;

  private deviceFactor = 1;

  private platformFactor = 1;

  maxQueueSize = MAX_QUEUE;

  get flushInterval(): number {
    return this.baseFlushInterval * this.cadence;
  }

  get statsWindow(): number {
    return this.baseStatsWindow * this.cadence;
  }

  scope(): Scope {
    return new PipelineScope(this);
  }

  /**
   * What the platform now says about the device — only the rows a page can fill in; see
   * `DeviceState`. Each group becomes an `lk.device.*` record the first time it is seen and on
   * every change after, and the whole state sets the cadence factor.
   */
  deviceState(state: DeviceState) {
    const next = { ...this.device, ...state };
    const records = changes(this.device, next);
    this.device = next;
    if (this.enabled) {
      this.processScope ??= new PipelineScope(this);
      for (const record of records) {
        this.processScope.emit(record.event, record.attributes);
      }
    }
    this.deviceFactor = cadenceFactor(next);
    this.applyCadence();
  }

  setCadenceFactor(factor: number) {
    this.platformFactor = factor;
    this.applyCadence();
  }

  private applyCadence() {
    const factor = Math.min(4, this.deviceFactor * this.platformFactor);
    if (factor === this.cadence) return;
    this.cadence = factor;
    // Restarting the timer is what makes a *shorter* period apply at once — pressure relieved
    // should not mean waiting out a stretched interval.
    if (this.timer) {
      this.stop();
      this.start();
    }
  }

  /**
   * Collection starts as soon as anything asked for telemetry — `configure` in an app that sets its
   * own resource or collector, `setServer` at the first Cloud connect. Records made before the
   * destination is known wait in the queue rather than being thrown away (SPEC: the pipeline may
   * start without a destination). An SDK nobody asked stays inert and costs nothing.
   */
  get enabled(): boolean {
    return !this.disabled && this.collecting;
  }

  configure(options: TelemetryOptions) {
    this.disabled = false;
    this.collecting = true;
    this.encoding = options.encoding ?? this.encoding;
    this.baseFlushInterval = options.flushInterval ?? this.baseFlushInterval;
    this.baseStatsWindow = options.statsWindow ?? this.baseStatsWindow;
    this.maxQueueSize = options.maxQueueSize ?? this.maxQueueSize;
    this.resource = {
      attributes: {
        // The platform SDK owns `service.*` and `os.*`; these are what this package can say
        // about itself. React Native overrides the name and adds the device (SPEC).
        'service.name': 'livekit-client-js',
        'service.version': version,
        'telemetry.sdk.name': INSTRUMENTATION_SCOPE.name,
        'telemetry.sdk.language': 'webjs',
        'telemetry.sdk.version': INSTRUMENTATION_SCOPE.version,
        ...this.resource.attributes,
        ...options.resource,
      },
    };
    if (options.storage) {
      this.storage = options.storage;
    }
    if (options.endpoint) {
      this.destination = {
        logs: options.endpoint,
        traces: tracesEndpointFor(options.endpoint),
        headers: options.headers ?? {},
      };
    }
    this.start();
  }

  /** The first connect names the destination: the server's host, the connect token (SPEC). */
  setServer(serverUrl: string, token: string) {
    this.collecting = true;
    if (this.destination) return; // an explicit endpoint wins
    const { logs, traces } = cloudEndpoints(serverUrl);
    this.destination = { logs, traces, headers: { Authorization: `Bearer ${token}` } };
    this.start();
  }

  private start() {
    if (this.timer || !this.enabled) return;
    this.timer = setInterval(() => {
      this.flush().catch(() => {});
    }, this.flushInterval * 1000);
  }

  /** While a hold is up nothing is sent; records keep arriving. Capped, so a lying signal cannot
   *  silence the pipeline for good. */
  hold(up: boolean) {
    if (up) {
      if (this.holds === 0) this.holdSince = Date.now();
      this.holds += 1;
    } else if (this.holds > 0) {
      this.holds -= 1;
    }
  }

  private held(): boolean {
    if (this.holds === 0) return false;
    if (Date.now() - this.holdSince >= HOLD_CAP_MS) {
      this.counters.holdsCapped += 1;
      this.reportDue = true;
      this.holdSince = Date.now();
      return false; // one batch goes out, then the hold starts over
    }
    return true;
  }

  /** Discrete events are rationed; stats windows and the self-report are not (SPEC flood guard). */
  private floodOk(): boolean {
    const now = Date.now();
    if (now - this.floodWindowStart > FLOOD_WINDOW_MS) {
      this.floodWindowStart = now;
      this.floodCount = 0;
    }
    this.floodCount += 1;
    if (this.floodCount > FLOOD_LIMIT) {
      this.counters.droppedRateLimited += 1;
      this.reportDue = true;
      return false;
    }
    return true;
  }

  /** A record that belongs to the pipeline rather than to a call — what a platform reports. */
  emit(event: string, attributes: Attributes = {}, severity: 'info' | 'warn' | 'error' = 'info') {
    if (!this.enabled) return;
    this.processScope ??= new PipelineScope(this);
    this.processScope.emit(event, attributes, severity);
  }

  record(record: LogRecord, options: { exemptFromFlood?: boolean } = {}) {
    if (!this.enabled) return;
    if (!options.exemptFromFlood && !this.floodOk()) return;
    record.resource = this.resource;
    this.push(this.logs, record);
  }

  endSpan(span: SpanRecord) {
    if (!this.enabled) return;
    span.resource = this.resource;
    this.push(this.spans, span);
  }

  private push<T>(queue: T[], record: T) {
    queue.push(record);
    const total = this.logs.length + this.spans.length;
    if (total > this.maxQueueSize) {
      const overflow = total - this.maxQueueSize;
      const fromLogs = Math.min(overflow, this.logs.length);
      this.logs.splice(0, fromLogs); // oldest first, at every level
      this.spans.splice(0, overflow - fromLogs);
      this.counters.droppedQueueFull += overflow;
      this.reportDue = true;
    }
  }

  async flush(force = false): Promise<void> {
    if (!this.enabled || this.inFlight) return;
    if (!force && (this.held() || Date.now() < this.throttledUntil)) return;
    if (this.reportDue) this.appendReport();
    // Write-ahead: what is queued becomes a stored batch whether or not anything can be sent yet.
    this.persist();
    const destination = this.destination;
    if (!destination) return;

    this.inFlight = true;
    try {
      // A backlog from a previous launch replays beside the call at 4 batches a tick; a shutdown
      // or a page leaving drains without the budget.
      const budget = force ? Number.POSITIVE_INFINITY : MAX_BATCHES_PER_UPLOAD;
      for (const id of this.storage.pending().slice(0, budget)) {
        const body = this.storage.read(id);
        if (body === undefined) {
          this.storage.remove(id);
          continue;
        }
        const url = batchKind(id) === 'logs' ? destination.logs : destination.traces;
        const verdict = await this.send(url, body, batchRecords(id), batchEncoding(id));
        // Throttled or offline: this batch keeps its place and so does everything behind it.
        if (verdict === 'keep') break;
        this.storage.remove(id);
      }
    } finally {
      this.inFlight = false;
    }
  }

  private persist() {
    if (this.logs.length > 0) {
      const batch = this.logs.splice(0, MAX_BATCH);
      this.store(batchId('logs', (this.sequence += 1), batch.length, this.encoding), () =>
        serializeLogs(batch, this.encoding),
      );
    }
    if (this.spans.length > 0) {
      const batch = this.spans.splice(0, MAX_BATCH);
      this.store(batchId('traces', (this.sequence += 1), batch.length, this.encoding), () =>
        serializeSpans(batch, this.encoding),
      );
    }
  }

  private store(id: string, body: () => Uint8Array) {
    try {
      const evicted = this.storage.put(id, body());
      if (evicted.length > 0) {
        // The id says how many records were in the batch, so an eviction costs a known number.
        this.counters.droppedCacheFull += evicted.reduce((sum, key) => sum + batchRecords(key), 0);
        this.reportDue = true;
      }
    } catch {
      // A store that cannot store (disk full, quota) must not take the session down with it.
      this.counters.droppedCacheError += batchRecords(id);
      this.reportDue = true;
    }
  }

  private async send(
    url: string,
    body: Uint8Array,
    records: number,
    encoding: Encoding,
  ): Promise<'sent' | 'drop' | 'keep'> {
    const destination = this.destination!;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': contentType(encoding),
          // RFC 9218 lowest urgency: telemetry never wins over media on a shared uplink.
          Priority: 'u=7',
          ...destination.headers,
        },
        body: body as BodyInit,
        keepalive: body.byteLength <= KEEPALIVE_LIMIT,
      });
      if (response.status >= 200 && response.status < 300) {
        this.counters.sent += 1;
        this.counters.bytes += body.byteLength;
        return 'sent';
      }
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number.parseInt(response.headers.get('Retry-After') ?? '', 10);
        this.throttledUntil =
          Date.now() + (Number.isFinite(retryAfter) ? retryAfter * 1000 : THROTTLE_DEFAULT_MS);
        this.counters.failed += 1;
        this.reportDue = true;
        return 'keep';
      }
      // A 4xx is the collector's verdict on the payload: retrying cannot fix it.
      this.counters.droppedRejected += records;
      this.reportDue = true;
      return 'drop';
    } catch {
      this.counters.failed += 1;
      this.reportDue = true;
      return 'keep';
    }
  }

  private appendReport() {
    this.reportDue = false;
    const counters = this.counters;
    const attributes: Attributes = {
      'lk.telemetry.uploads.sent': counters.sent,
      'lk.telemetry.uploads.bytes': counters.bytes,
      'lk.telemetry.uploads.failed': counters.failed,
      'lk.telemetry.queue.records': this.logs.length + this.spans.length,
      'lk.telemetry.cache.batches': this.storage.pending().length,
    };
    if (counters.holdsCapped) attributes['lk.telemetry.holds.capped'] = counters.holdsCapped;
    if (counters.droppedCacheFull) {
      attributes['lk.telemetry.dropped.cache_full'] = counters.droppedCacheFull;
    }
    if (counters.droppedCacheError) {
      attributes['lk.telemetry.dropped.cache_error'] = counters.droppedCacheError;
    }
    if (counters.droppedQueueFull) {
      attributes['lk.telemetry.dropped.queue_full'] = counters.droppedQueueFull;
    }
    if (counters.droppedRejected) {
      attributes['lk.telemetry.dropped.rejected'] = counters.droppedRejected;
    }
    if (counters.droppedThrottled) {
      attributes['lk.telemetry.dropped.throttled'] = counters.droppedThrottled;
    }
    if (counters.droppedRateLimited) {
      attributes['lk.telemetry.dropped.rate_limited'] = counters.droppedRateLimited;
    }
    const now = hrTime();
    this.logs.push({
      hrTime: now,
      hrTimeObserved: now,
      eventName: 'lk.telemetry.report',
      severityNumber: Severity.info,
      severityText: 'INFO',
      body: 'lk.telemetry.report',
      attributes,
      droppedAttributesCount: 0,
      resource: this.resource,
      instrumentationScope: INSTRUMENTATION_SCOPE,
    });
  }

  /** The collector said stop: throw the backlog away and never speak again (SPEC `Disabled`). */
  disable() {
    this.disabled = true;
    this.logs = [];
    this.spans = [];
    this.storage.clear();
    this.stop();
  }

  diagnostics(): string {
    const counters = this.counters;
    const state = this.disabled
      ? 'disabled'
      : !this.destination
        ? 'no destination'
        : Date.now() < this.throttledUntil
          ? 'throttled'
          : this.holds > 0
            ? 'held'
            : 'ready';
    const lost =
      counters.droppedCacheFull +
      counters.droppedCacheError +
      counters.droppedQueueFull +
      counters.droppedRejected +
      counters.droppedThrottled +
      counters.droppedRateLimited;
    return `telemetry ${state}: sent ${counters.sent} batches, ${counters.bytes} bytes, failed ${counters.failed}, queued ${this.logs.length + this.spans.length}, lost ${lost}`;
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async shutdown() {
    this.stop();
    this.processScope = undefined;
    await this.flush(true);
  }
}
