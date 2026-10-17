/**
 * The backend contract (SPEC "Destination and credentials", "Collector answers"): where a server URL
 * points telemetry to, what a token says about that project, the request, and what each answer means.
 */
import { decodeJwt } from 'jose';

const CLOUD_SUFFIX = '.livekit.cloud';
const DAY_MS = 24 * 60 * 60 * 1000;
const THROTTLE_DEFAULT_MS = 60_000;
const BACKOFF_CAP_MS = 60_000;
const KEEPALIVE_LIMIT = 60 * 1024; // browsers cap all in-flight `keepalive` bodies at 64 KiB together
const DISABLED_ANSWER = 'data recording is disabled by owner';
export const EXPORT_TIMEOUT_MS = 10_000;

/** `wss://<project>.livekit.cloud/…` → that host (WHATWG-parsed: TLS, no userinfo, default port); anything else has no ingest. */
export function cloudHost(serverUrl: string): string | undefined {
  let url: URL;
  try {
    url = new URL(serverUrl);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'wss:' && url.protocol !== 'https:') return undefined;
  if (url.username || url.password || url.port) return undefined;
  return url.hostname.endsWith(CLOUD_SUFFIX) ? url.hostname : undefined;
}

export const ingestUrl = (host: string, kind: 'logs' | 'traces') =>
  `https://${host}/observability/client/${kind}/otlp/v0`;

export interface TokenClaims {
  /** `observability.write` or `observability.clientWrite`. */
  granted: boolean;
  expiresAt?: number;
  expired: boolean;
}

/** The token's *unverified* claims. Malformed, past, negative or non-numeric `exp` → expired. */
export function readToken(token: string): TokenClaims {
  try {
    const claims = decodeJwt(token) as {
      exp?: unknown;
      observability?: { write?: unknown; clientWrite?: unknown };
    };
    let expiresAt: number | undefined;
    if (claims.exp !== undefined) {
      expiresAt = typeof claims.exp === 'number' && claims.exp > 0 ? claims.exp * 1000 : 0;
    }
    return {
      granted: claims.observability?.write === true || claims.observability?.clientWrite === true,
      expiresAt,
      expired: expiresAt !== undefined && expiresAt <= Date.now(),
    };
  } catch {
    return { granted: false, expired: true };
  }
}

/**
 * What a collector answer means (SPEC table): `rejected` drops the batch (400, 3xx, other 4xx/5xx),
 * `oversized` halves it (413), `disabled` purges the project for the process (401/403 naming the
 * owner's opt-out), `unauthorized` holds it and retires the token (other 401/403), `gone` purges the
 * project until its next token (404), `pause` waits a named delay (429, 5xx with Retry-After),
 * `retry` waits the local backoff (502/503/504, no answer).
 */
export type Answer =
  | { kind: 'accepted'; rejected: number }
  | { kind: 'rejected' }
  | { kind: 'oversized' }
  | { kind: 'disabled' }
  | { kind: 'unauthorized' }
  | { kind: 'gone' }
  | { kind: 'pause'; forMs: number }
  | { kind: 'retry' };

export function classify(
  status: number,
  retryAfter: string | null,
  body: string,
  rejected = 0,
): Answer {
  if (status >= 200 && status < 300) return { kind: 'accepted', rejected };
  if (status === 413) return { kind: 'oversized' };
  if (status === 401 || status === 403) {
    return body.toLowerCase().includes(DISABLED_ANSWER)
      ? { kind: 'disabled' }
      : { kind: 'unauthorized' };
  }
  if (status === 404) return { kind: 'gone' };
  const named = parseRetryAfter(retryAfter);
  if (status === 429) return { kind: 'pause', forMs: named ?? THROTTLE_DEFAULT_MS };
  if (named !== undefined && status >= 500) return { kind: 'pause', forMs: named };
  // ponytail: a `google.rpc.RetryInfo` detail is honoured as "retry", with the local backoff rather
  // than its own delay; decode the Status body if Cloud starts relying on the delay.
  if ([502, 503, 504].includes(status) || (status >= 500 && body.includes('RetryInfo'))) {
    return { kind: 'retry' };
  }
  return { kind: 'rejected' };
}

/** RFC 9110 §10.2.3: delay-seconds or an HTTP-date. Garbage is ignored, negative means now, and nothing waits past the 24 h age limit. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const text = value.trim();
  const delay = /^-?\d+$/.test(text) ? Number(text) * 1000 : Date.parse(text) - now;
  if (!Number.isFinite(delay)) return undefined;
  return Math.min(Math.max(delay, 0), DAY_MS);
}

/** Full jitter: a uniform wait in `[0, backoff]`, the backoff doubling from 1 s to 60 s per consecutive failure. */
export const backoffMs = (failures: number) =>
  Math.random() * Math.min(BACKOFF_CAP_MS, 1000 * 2 ** Math.max(0, failures - 1));

async function compress(body: Uint8Array): Promise<{ body: Uint8Array; encoding?: string }> {
  if (typeof CompressionStream === 'undefined') return { body };
  const stream = new Blob([body as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  return { body: new Uint8Array(await new Response(stream).arrayBuffer()), encoding: 'gzip' };
}

/** One OTLP request: protobuf, gzipped, lowest HTTP priority, never following a redirect (`Authorization` never crosses an origin). */
export async function post(
  url: string,
  encoded: Uint8Array,
  token: string | undefined,
  signal: AbortSignal,
): Promise<{ status: number; retryAfter: string | null; body: Uint8Array; sent: number }> {
  const { body, encoding } = await compress(encoded);
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-protobuf',
    Priority: 'u=7',
  };
  if (encoding) headers['Content-Encoding'] = encoding;
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: body as BodyInit,
    signal,
    redirect: 'manual',
    keepalive: body.byteLength <= KEEPALIVE_LIMIT,
  });
  return {
    status: response.status,
    retryAfter: response.headers.get('Retry-After'),
    body: new Uint8Array(await response.arrayBuffer()),
    sent: body.byteLength,
  };
}

/**
 * A refused token is remembered by this fingerprint, never by value (SPEC): two independent
 * 32-bit hashes (FNV-1a and the ×31 polynomial) plus the length, so a collision needs all three to
 * agree — far beyond what one 32-bit hash gives, and synchronous where `crypto.subtle` is not.
 */
export function fingerprint(text: string): string {
  let fnv = 0x811c9dc5;
  let poly = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    fnv = Math.imul(fnv ^ code, 0x01000193) >>> 0;
    poly = (Math.imul(poly, 31) + code) >>> 0;
  }
  return `${fnv.toString(16)}-${poly.toString(16)}-${text.length}`;
}
