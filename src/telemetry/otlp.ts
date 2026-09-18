/**
 * OTLP records and their wire form. The only piece of OpenTelemetry the SDK ships is
 * `@opentelemetry/otlp-transformer`, whose serializers are structural: they read the fields below
 * off plain objects and nothing else. See TELEMETRY.md for why the rest of the SDK is not here.
 */
import {
  JsonLogsSerializer,
  JsonTraceSerializer,
  ProtobufLogsSerializer,
  ProtobufTraceSerializer,
} from '@opentelemetry/otlp-transformer';

export type Encoding = 'protobuf' | 'json';

export type AttributeValue = string | number | boolean;

export type Attributes = { [key: string]: AttributeValue | undefined };

export interface Resource {
  attributes: { [key: string]: unknown };
}

export interface SpanContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
}

/** OTel severity numbers; only these three are emitted (SPEC: nothing below `warn` leaves). */
export const Severity = { info: 9, warn: 13, error: 17 } as const;

export const INSTRUMENTATION_SCOPE = { name: 'livekit-telemetry', version: '0.1.0' };

export interface LogRecord {
  hrTime: [number, number];
  hrTimeObserved: [number, number];
  eventName?: string;
  severityNumber: number;
  severityText: string;
  body?: string;
  attributes: Attributes;
  droppedAttributesCount: number;
  resource: Resource;
  instrumentationScope: typeof INSTRUMENTATION_SCOPE;
  spanContext?: SpanContext;
}

export interface SpanEvent {
  name: string;
  time: [number, number];
  attributes: Attributes;
  droppedAttributesCount: number;
}

export interface SpanRecord {
  name: string;
  /** OTel SpanKind: 2 = client, 1 = internal. */
  kind: number;
  spanContext: () => SpanContext;
  parentSpanContext?: SpanContext;
  startTime: [number, number];
  endTime: [number, number];
  duration: [number, number];
  status: { code: number; message?: string };
  attributes: Attributes;
  links: never[];
  events: SpanEvent[];
  ended: boolean;
  resource: Resource;
  instrumentationScope: typeof INSTRUMENTATION_SCOPE;
  droppedAttributesCount: number;
  droppedEventsCount: number;
  droppedLinksCount: number;
}

export const SpanKind = { internal: 1, client: 3 } as const;
/** OTel status codes: cancellation is `Unset` like success — only a failure is `Error`. */
export const SpanStatus = { unset: 0, error: 2 } as const;

// ponytail: unique, not unguessable — ids need no entropy guarantees, and this keeps React Native
// from needing `react-native-get-random-values`.
export function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(buffer);
  } else {
    for (let i = 0; i < bytes; i += 1) {
      buffer[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function hrTime(milliseconds: number = Date.now()): [number, number] {
  return [Math.trunc(milliseconds / 1000), Math.round((milliseconds % 1000) * 1e6)];
}

export function hrDuration(start: [number, number], end: [number, number]): [number, number] {
  let seconds = end[0] - start[0];
  let nanos = end[1] - start[1];
  if (nanos < 0) {
    seconds -= 1;
    nanos += 1e9;
  }
  return [seconds, nanos];
}

export function serializeLogs(records: LogRecord[], encoding: Encoding): Uint8Array {
  const serializer = encoding === 'json' ? JsonLogsSerializer : ProtobufLogsSerializer;
  return serializer.serializeRequest(records as never)!;
}

export function serializeSpans(records: SpanRecord[], encoding: Encoding): Uint8Array {
  const serializer = encoding === 'json' ? JsonTraceSerializer : ProtobufTraceSerializer;
  return serializer.serializeRequest(records as never)!;
}

export function contentType(encoding: Encoding): string {
  return encoding === 'json' ? 'application/json' : 'application/x-protobuf';
}
