/**
 * The upload policy: one queue, one request in flight, holds while the uplink belongs to media.
 * Everything a browser cannot do is absent by design — no disk cache, no replay across launches
 * (TELEMETRY.md §3), so the queue is the only bound and every eviction is counted.
 */
import { version } from '../version';
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

export class Pipeline {
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

  resource: Resource = { attributes: {} };

  flushInterval = FLUSH_INTERVAL;

  statsWindow = STATS_WINDOW;

  maxQueueSize = MAX_QUEUE;

  /** Collection runs as soon as anything configured a destination — never before. */
  get enabled(): boolean {
    return !this.disabled && this.destination !== undefined;
  }

  configure(options: TelemetryOptions) {
    this.disabled = false;
    this.encoding = options.encoding ?? this.encoding;
    this.flushInterval = options.flushInterval ?? this.flushInterval;
    this.statsWindow = options.statsWindow ?? this.statsWindow;
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

  emit(record: LogRecord, options: { exemptFromFlood?: boolean } = {}) {
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
    if (this.logs.length === 0 && this.spans.length === 0) return;

    this.inFlight = true;
    try {
      const destination = this.destination!;
      if (this.logs.length > 0) {
        const batch = this.logs.splice(0, MAX_BATCH);
        await this.send(destination.logs, serializeLogs(batch, this.encoding), batch, this.logs);
      }
      // A throttle raised by the logs request applies to the spans request too: same quota.
      if (this.spans.length > 0 && Date.now() >= this.throttledUntil) {
        const batch = this.spans.splice(0, MAX_BATCH);
        await this.send(
          destination.traces,
          serializeSpans(batch, this.encoding),
          batch,
          this.spans,
        );
      }
    } finally {
      this.inFlight = false;
    }
  }

  private async send<T>(url: string, body: Uint8Array, batch: T[], queue: T[]) {
    const destination = this.destination!;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': contentType(this.encoding),
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
        return;
      }
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number.parseInt(response.headers.get('Retry-After') ?? '', 10);
        this.throttledUntil =
          Date.now() + (Number.isFinite(retryAfter) ? retryAfter * 1000 : THROTTLE_DEFAULT_MS);
        this.counters.failed += 1;
        this.reportDue = true;
        this.requeue(batch, queue);
        return;
      }
      // A 4xx is the collector's verdict on the payload: retrying cannot fix it.
      this.counters.droppedRejected += batch.length;
      this.reportDue = true;
    } catch {
      this.counters.failed += 1;
      this.reportDue = true;
      this.requeue(batch, queue);
    }
  }

  /** A held or failed batch goes back at the front — a pause is not a hole in the session. */
  private requeue<T>(batch: T[], queue: T[]) {
    if (batch.length === 0) return;
    queue.unshift(...batch);
    const total = this.logs.length + this.spans.length;
    if (total > this.maxQueueSize) {
      const overflow = total - this.maxQueueSize;
      const fromLogs = Math.min(overflow, this.logs.length);
      this.logs.splice(0, fromLogs);
      this.spans.splice(0, overflow - fromLogs);
      this.counters.droppedThrottled += overflow;
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
    };
    if (counters.holdsCapped) attributes['lk.telemetry.holds.capped'] = counters.holdsCapped;
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
    await this.flush(true);
  }
}
