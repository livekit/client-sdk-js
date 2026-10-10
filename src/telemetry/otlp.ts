/**
 * OTLP on the wire: the two record shapes (plain and JSON-safe, so a cached batch is an array of
 * them) and a protobuf writer for `ExportLogsServiceRequest` / `ExportTraceServiceRequest` — the
 * binary form is the one the Cloud ingest and every collector agree on.
 */

export type AttributeValue = string | number | boolean;
export type Attributes = Record<string, AttributeValue | undefined>;

/** OTel severity numbers; nothing below `warn` leaves the device except `info` events (SPEC). */
export const Severity = { info: 9, warn: 13, error: 17 } as const;
export type SeverityName = keyof typeof Severity;

export const SpanKind = { internal: 1, client: 3 } as const;

export interface LogRecord {
  kind: 'log';
  timeMs: number;
  severity: SeverityName;
  /** `lk.*` / `custom.*` event name; absent for a plain log line. */
  eventName?: string;
  body?: string;
  attributes: Attributes;
  traceId?: string;
  spanId?: string;
  /** The project the record belongs to; stamped when known, never changed after (SPEC ownership). */
  host?: string;
}

export interface SpanRecord {
  kind: 'span';
  name: string;
  spanKind: number;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  startMs: number;
  endMs: number;
  /** OTel status: 0 unset (success and cancellation alike), 2 error. */
  status: 0 | 2;
  statusMessage?: string;
  attributes: Attributes;
  events: Array<{ name: string; timeMs: number }>;
  host?: string;
}

export type TelemetryRecord = LogRecord | SpanRecord;

const encoder = new TextEncoder();

class Writer {
  private chunks: Uint8Array[] = [];

  private length = 0;

  private push(chunk: Uint8Array) {
    this.chunks.push(chunk);
    this.length += chunk.length;
  }

  varint(value: number) {
    const out: number[] = [];
    let v = value;
    while (v >= 0x80) {
      out.push((v % 0x80) | 0x80);
      v = Math.floor(v / 0x80);
    }
    out.push(v);
    this.push(Uint8Array.from(out));
  }

  private tag(field: number, wire: number) {
    this.varint((field << 3) | wire);
  }

  uint(field: number, value: number) {
    this.tag(field, 0);
    this.varint(value);
  }

  bytes(field: number, value: Uint8Array) {
    if (value.length === 0) return;
    this.tag(field, 2);
    this.varint(value.length);
    this.push(value);
  }

  string(field: number, value: string) {
    this.bytes(field, encoder.encode(value));
  }

  /** A `fixed64` of nanoseconds since the epoch, from milliseconds — exact in two 32-bit halves, no BigInt. */
  nanos(field: number, ms: number) {
    const msHi = Math.floor(ms / 2 ** 32);
    const low = (ms - msHi * 2 ** 32) * 1e6;
    const lo32 = low % 2 ** 32;
    const hi32 = msHi * 1e6 + Math.floor(low / 2 ** 32);
    const bytes = new Uint8Array(8);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, lo32, true);
    view.setUint32(4, hi32, true);
    this.tag(field, 1);
    this.push(bytes);
  }

  double(field: number, value: number) {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setFloat64(0, value, true);
    this.tag(field, 1);
    this.push(bytes);
  }

  message(field: number, write: (w: Writer) => void) {
    const nested = new Writer();
    write(nested);
    this.bytes(field, nested.finish());
  }

  finish(): Uint8Array {
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }
}

function hexBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function anyValue(w: Writer, value: AttributeValue) {
  if (typeof value === 'string') w.string(1, value);
  else if (typeof value === 'boolean') w.uint(2, value ? 1 : 0);
  else if (Number.isInteger(value) && value >= 0) w.uint(3, value);
  else w.double(4, value);
}

function attributes(w: Writer, field: number, attrs: Attributes) {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined) continue;
    w.message(field, (kv) => {
      kv.string(1, key);
      kv.message(2, (v) => anyValue(v, value));
    });
  }
}

const scope = (w: Writer) => {
  w.string(1, 'livekit-telemetry');
  w.string(2, '0.1.0');
};

/** `ExportLogsServiceRequest` / `ExportTraceServiceRequest` for records sharing one resource. */
export function encode(records: TelemetryRecord[], resource: Attributes): Uint8Array {
  const request = new Writer();
  request.message(1, (res) => {
    res.message(1, (r) => attributes(r, 1, resource));
    res.message(2, (s) => {
      s.message(1, scope);
      for (const record of records) {
        if (record.kind === 'log') s.message(2, (w) => logRecord(w, record));
        else s.message(2, (w) => span(w, record));
      }
    });
  });
  return request.finish();
}

function logRecord(w: Writer, record: LogRecord) {
  w.nanos(1, record.timeMs);
  w.uint(2, Severity[record.severity]);
  w.string(3, record.severity.toUpperCase());
  if (record.body !== undefined) w.message(5, (v) => anyValue(v, record.body!));
  attributes(w, 6, record.attributes);
  if (record.traceId) w.bytes(9, hexBytes(record.traceId));
  if (record.spanId) w.bytes(10, hexBytes(record.spanId));
  w.nanos(11, record.timeMs);
  if (record.eventName) w.string(12, record.eventName);
}

function span(w: Writer, record: SpanRecord) {
  w.bytes(1, hexBytes(record.traceId));
  w.bytes(2, hexBytes(record.spanId));
  if (record.parentSpanId) w.bytes(4, hexBytes(record.parentSpanId));
  w.string(5, record.name);
  w.uint(6, record.spanKind);
  w.nanos(7, record.startMs);
  w.nanos(8, record.endMs);
  attributes(w, 9, record.attributes);
  for (const event of record.events) {
    w.message(11, (e) => {
      e.nanos(1, event.timeMs);
      e.string(2, event.name);
    });
  }
  if (record.status) {
    w.message(15, (s) => {
      if (record.statusMessage) s.string(2, record.statusMessage);
      s.uint(3, record.status);
    });
  }
}

/** How many records a 2xx answer still rejected (`partial_success`), `0` for an empty body. */
export function rejectedRecords(body: Uint8Array): number {
  // ExportXServiceResponse { partial_success = 1 { rejected_x = 1 (int64) } }, fields in any order
  const fields = (bytes: Uint8Array) => {
    const out = new Map<number, number | Uint8Array>();
    let i = 0;
    const varint = () => {
      let value = 0;
      let scale = 1;
      while (i < bytes.length) {
        const byte = bytes[i];
        i += 1;
        value += (byte & 0x7f) * scale;
        scale *= 0x80;
        if (byte < 0x80) break;
      }
      return value;
    };
    while (i < bytes.length) {
      const tag = varint();
      const field = Math.floor(tag / 8);
      switch (tag & 7) {
        case 0:
          out.set(field, varint());
          break;
        case 1:
          i += 8;
          break;
        case 2: {
          const length = varint();
          out.set(field, bytes.subarray(i, i + length));
          i += length;
          break;
        }
        case 5:
          i += 4;
          break;
        default:
          return out; // unknown wire type: stop reading, report what was found
      }
    }
    return out;
  };
  const partial = fields(body).get(1);
  const rejected = partial instanceof Uint8Array ? fields(partial).get(1) : undefined;
  return typeof rejected === 'number' ? rejected : 0;
}

/** A JWT or bearer value never leaves the device inside a message or a span status (SPEC). */
export const mask = (text: string) =>
  text
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<jwt>')
    .replace(/(bearer\s+)[\w.~+/=-]+/gi, '$1<token>');

/** A timer that must not keep a Node host (SSR, tests) alive. */
export function unref<T>(timer: T): T {
  (timer as { unref?: () => void })?.unref?.();
  return timer;
}

/** Unique, not unguessable: ids need no entropy guarantees, and this works without a crypto polyfill. */
export function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(buffer);
  } else {
    for (let i = 0; i < bytes; i += 1) buffer[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
