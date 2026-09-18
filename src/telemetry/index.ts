/**
 * Client telemetry — PoC of the JS half of the pipeline the Swift/Kotlin/Dart SDKs get from the
 * Rust core (`livekit-telemetry`, SPEC.md). The wire format is the only part taken from
 * OpenTelemetry: `@opentelemetry/otlp-transformer` turns plain records into an OTLP request body,
 * in protobuf or JSON, and everything above it — scopes, windows, batching, holds — is ours.
 *
 * Browser and React Native share this file: nothing here touches `document`, `navigator` or any
 * DOM type, so the only platform-specific piece left is the lifecycle hook that decides when to
 * flush (`visibilitychange` in a page, `AppState` in an app).
 */
import { JsonLogsSerializer, ProtobufLogsSerializer } from '@opentelemetry/otlp-transformer';

/** What the core reports as `telemetry.sdk.*`; `service.*` and `os.*` come from the caller. */
const SCOPE = { name: 'livekit-telemetry', version: '0.0.0-poc' };

export interface TelemetryOptions {
  /** OTLP logs route — LiveKit Cloud: `https://<host>/observability/client/logs/otlp/v0`. */
  endpoint: string;
  headers?: Record<string, string>;
  /** protobuf by default: smaller, and the only encoding whose trace ids survive every ingest. */
  encoding?: 'protobuf' | 'json';
  resource?: Record<string, string | number | boolean>;
}

export interface Delivery {
  status: number;
  /** Set when the collector asked for a hold (429/502/503/504); `undefined` means "no answer". */
  retryAfterMs?: number;
  bytes: number;
}

type Attributes = { [key: string]: string | number | boolean | undefined };

/** The fields `otlp-transformer` reads off a log record — a subset of OTel's `ReadableLogRecord`. */
interface LogRecord {
  hrTime: [number, number];
  hrTimeObserved: [number, number];
  eventName?: string;
  severityNumber?: number;
  severityText?: string;
  body?: string;
  attributes: Attributes;
  droppedAttributesCount: number;
  resource: { attributes: Record<string, unknown> };
  instrumentationScope: typeof SCOPE;
  spanContext?: { traceId: string; spanId: string; traceFlags: number };
}

/** Browsers cap *all* in-flight keepalive bodies at 64 KiB together; the transformer's own limit. */
const KEEPALIVE_LIMIT = 60 * 1024;

// ponytail: unique, not unguessable — Math.random is fine for a trace id, and it keeps React
// Native from needing `react-native-get-random-values`.
function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(buffer);
  else for (let i = 0; i < bytes; i += 1) buffer[i] = Math.floor(Math.random() * 256);
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hrTime(): [number, number] {
  const ms = Date.now();
  return [Math.trunc(ms / 1000), Math.round((ms % 1000) * 1e6)];
}

export function newTraceId(): string {
  return randomHex(16);
}

/** One discrete event, in the shape `lk.ping` has in SPEC.md: the name doubles as the body. */
export function event(
  name: string,
  attributes: Attributes,
  options: TelemetryOptions,
  traceId?: string,
): LogRecord {
  const now = hrTime();
  return {
    hrTime: now,
    hrTimeObserved: now,
    eventName: name,
    severityNumber: 9, // INFO
    severityText: 'INFO',
    body: name,
    attributes,
    droppedAttributesCount: 0,
    resource: {
      attributes: {
        'telemetry.sdk.name': SCOPE.name,
        'telemetry.sdk.language': 'webjs',
        'telemetry.sdk.version': SCOPE.version,
        ...options.resource,
      },
    },
    instrumentationScope: SCOPE,
    spanContext: traceId ? { traceId, spanId: randomHex(8), traceFlags: 1 } : undefined,
  };
}

export async function send(records: LogRecord[], options: TelemetryOptions): Promise<Delivery> {
  const json = options.encoding === 'json';
  const serializer = json ? JsonLogsSerializer : ProtobufLogsSerializer;
  // The serializers are structural: they read the fields above and nothing else.
  const body = serializer.serializeRequest(records as never)!;
  const response = await fetch(options.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': json ? 'application/json' : 'application/x-protobuf',
      // RFC 9218 lowest urgency, as on every other platform: telemetry never wins over media.
      Priority: 'u=7',
      ...options.headers,
    },
    body: body as BodyInit,
    keepalive: body.byteLength <= KEEPALIVE_LIMIT,
  });
  const retryAfter = response.headers.get('Retry-After');
  return {
    status: response.status,
    retryAfterMs: retryAfter ? Number.parseInt(retryAfter, 10) * 1000 : undefined,
    bytes: body.byteLength,
  };
}

/** The smoke test from SPEC.md: one `lk.ping`, one request, whatever the collector says back. */
export async function ping(options: TelemetryOptions, seq = 1): Promise<Delivery> {
  return send([event('lk.ping', { 'lk.ping.seq': seq }, options, newTraceId())], options);
}
