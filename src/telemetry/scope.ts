/**
 * One scope per Room: its trace id and attributes, its spans, its RTC windows and the two app
 * calls. A scope is never ended — a Room's last record is simply its last (SPEC).
 */
import { DisconnectReason, ReconnectReason } from '@livekit/protocol';
import log from '../logger';
import {
  type Attributes,
  type LogRecord,
  type SeverityName,
  SpanKind,
  type SpanRecord,
  mask,
  randomHex,
  unref,
} from './otlp';
import type { Pipeline } from './pipeline';
import {
  type Layers,
  type Sample,
  StatsWindow,
  type TrackRef,
  foldLayers,
  peerSamples,
} from './webrtc';

export type Outcome = 'ok' | 'error' | 'cancelled';

export interface RoomIdentity {
  sid?: string;
  name?: string;
  participantSid?: string;
  participantIdentity?: string;
}

export interface SpanTrack {
  sid: string;
  kind: 'audio' | 'video';
  source?: string;
  remoteIdentity?: string;
}

const SUBSCRIBE_TIMEOUT_MS = 30_000;
/** A layer with no reading for this long is retired, so the per-track state follows what is active. */
const LAYER_IDLE_MS = 180_000;
/** A published track is polled every second for its first reading, for this long at most (the core's bound). */
const UNREAD_TIMEOUT_MS = 30_000;
const CPU_LIMITED_MS = 60_000;
const MAX_KEY_BYTES = 128;
const MAX_VALUE_BYTES = 1024;
const MAX_ATTRIBUTES = 64;

const utf8 = (text: string) => new TextEncoder().encode(text).length;
const validValue = (value: unknown) => typeof value === 'string' && utf8(value) <= MAX_VALUE_BYTES;

/** `error.type`: a type name, never a message (SPEC). */
export const errorType = (error: unknown) => (error instanceof Error && error.name) || 'unknown';

/** A telemetry failure is reported at debug level — and a throwing log extension is swallowed too. */
export function diagnose(context: object) {
  try {
    log.debug('telemetry: dropped a failing call', context);
  } catch {
    // never into the SDK
  }
}

/** Scheduled work runs inside the guard too: a timer callback never throws into the host. */
export const scheduled = (run: () => void) => () => {
  try {
    run();
  } catch (error) {
    diagnose({ error });
  }
};

/** Every method of a guarded object swallows its own failure: telemetry never throws into SDK or app code. */
export function guarded<T extends object>(target: T): T {
  return new Proxy(target, {
    get(t, prop) {
      const value = Reflect.get(t, prop, t);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        try {
          return value.apply(t, args);
        } catch (error) {
          diagnose({ method: String(prop), error });
          return undefined;
        }
      };
    },
  });
}

/** A protocol enum value → SPEC's lowercase name (`RR_SIGNAL_DISCONNECTED` → `signal_disconnected`). */
const enumName = (table: Record<number, string>, value: number, strip: RegExp) =>
  (table[value] ?? table[0]).replace(strip, '').toLowerCase();
export const reconnectReasonName = (reason = ReconnectReason.RR_UNKNOWN) =>
  enumName(ReconnectReason, reason, /^RR_/);
export const disconnectReasonName = (reason = DisconnectReason.UNKNOWN_REASON) =>
  enumName(DisconnectReason, reason, /_REASON$/);

/** Who a record belongs to, fixed when a span or window opens: the project and the Room's identity of that connection. */
export interface Owner {
  host?: string;
  /** The capture-time decision: `true` a Cloud project, `false` a self-hosted server (never sent), `undefined` no server yet. */
  collects?: boolean;
  connection: number;
  attributes: Attributes;
}

export class TelemetrySpan {
  readonly spanId = randomHex(8);

  private readonly startMs = Date.now();

  private events: SpanRecord['events'] = [];

  private attributes: Attributes;

  ended = false;

  constructor(
    private scope: TelemetryScope,
    readonly name: string,
    private kind: number,
    attributes: Attributes,
    readonly owner: Owner,
    private parentSpanId?: string,
  ) {
    this.attributes = { ...attributes };
  }

  private get admits() {
    return !this.ended && this.scope.admits();
  }

  step(name: string) {
    if (this.admits) this.events.push({ name, timeMs: Date.now() });
  }

  has(step: string): boolean {
    return this.events.some((event) => event.name === step);
  }

  setAttribute(key: string, value: Attributes[string]) {
    if (this.admits) this.attributes[key] = value;
  }

  /** Ending twice is a no-op, as on every other platform. */
  end(outcome: Outcome = 'ok', error?: string, message?: string) {
    if (this.ended) return;
    this.ended = true;
    this.scope.finish(this, {
      kind: 'span',
      name: this.name,
      spanKind: this.kind,
      traceId: this.scope.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
      startMs: this.startMs,
      endMs: Date.now(),
      // Cancellation is `Unset` like success: only a failure is an error (SPEC).
      status: outcome === 'error' ? 2 : 0,
      statusMessage: message,
      attributes: { ...this.attributes, 'lk.outcome': outcome, 'error.type': error },
      events: this.events,
    });
  }

  fail(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    this.end('error', mask(errorType(error)), mask(message));
  }

  /** @internal The opt-out: closed without a record, every buffer emptied. */
  purge() {
    this.ended = true;
    this.events = [];
    this.attributes = {};
    this.owner.attributes = {};
  }
}

function endWith(span: TelemetrySpan | undefined, outcome: Outcome, error?: unknown) {
  if (!span) return;
  if (outcome !== 'error') span.end(outcome);
  else if (typeof error === 'string') span.end('error', error);
  else span.fail(error);
}

export class TelemetryScope {
  readonly traceId = randomHex(16);

  /** The project this Room is routed to; `undefined` before connect, on a non-Cloud host, or under the collector override. */
  host?: string;

  /** `false` once a server is known that has no ingest: this Room's records are dropped at the door (SPEC). */
  collects?: boolean;

  /** Has a server and has not disconnected: the pipeline meters uploads while any Room is in a call. */
  inCall = false;

  /** A subscribe intent wants the next `getStats()` within a second; the Room's poller listens here. */
  onWake?: () => void;

  private serverUrl?: string;

  identity: RoomIdentity = {};

  /** Prototype-free, so `constructor` or `__proto__` are keys like any other (the core's rule). */
  private custom: Record<string, string> = Object.create(null);

  private connectSpan?: TelemetrySpan;

  private reconnectSpan?: TelemetrySpan;

  private reconnectAttempts = 0;

  private pending = new Map<
    string,
    { span: TelemetrySpan; deadline: number; timer: ReturnType<typeof setTimeout> }
  >();

  private windows = new Map<string, { ref: TrackRef; window: StatsWindow; owner: Owner }>();

  /** Closes windows at their 60 s boundary on the pipeline's clock, whether or not another reading comes. */
  private windowTimer?: ReturnType<typeof setTimeout>;

  /** Every layer's last totals per track and direction, so a layer that stops reporting keeps counting (the core's rule); retired when idle. */
  private layers = new Map<string, Map<string, { reading: Sample; at: number }>>();

  private lastCpuMs = new Map<string, number>();

  /** Published tracks without a reading yet → when to stop waiting: polled every second like a pending subscribe. */
  private unread = new Map<string, number>();

  /** An encoder was CPU-limited within the last minute: the cadence stretches ×2 (SPEC). */
  cpuLimitedUntil = 0;

  /** Bumped by every user connect: a span or window opened under an earlier connection keeps that owner. */
  connection = 0;

  private open = new Set<TelemetrySpan>();

  constructor(private pipeline: Pipeline) {
    pipeline.track(this); // weakly: a Room nobody uses is not retained by telemetry
  }

  /** Nothing is captured after the opt-out. */
  admits(): boolean {
    return this.pipeline.enabled;
  }

  private owner(): Owner {
    return {
      host: this.host,
      collects: this.collects,
      connection: this.connection,
      attributes: this.attributes(),
    };
  }

  /** The Room's identity is late-known (sid at join), so the current connection reads it live; an earlier one keeps its snapshot. */
  private ownerAttributes(owner: Owner): Attributes {
    return owner.connection === this.connection ? this.attributes() : owner.attributes;
  }

  attributes(): Attributes {
    return {
      'session.id': this.traceId,
      'lk.room.sid': this.identity.sid,
      'lk.room.name': this.identity.name,
      'lk.participant.sid': this.identity.participantSid,
      'lk.participant.identity': this.identity.participantIdentity,
      ...this.custom,
    };
  }

  /** The server URL and token the Room connects with — at connect, and again on every refresh and move (SPEC). */
  setServer(serverUrl: string, token: string) {
    if (!this.admits()) return; // no destination or credential is retained after the opt-out
    this.serverUrl = serverUrl;
    this.host = this.pipeline.setServer(serverUrl, token, this);
    this.collects = this.host !== undefined;
    this.inCall = true;
    this.pipeline.activate(this);
    // A span or window opened before this Room had any server takes its first one (SPEC), however
    // late it finishes — Cloud project or self-hosted alike; one opened under a server keeps that.
    const adopt = (owner: Owner) => {
      if (owner.collects !== undefined) return;
      owner.host = this.host;
      owner.collects = this.collects;
    };
    this.open.forEach((span) => adopt(span.owner));
    this.windows.forEach(({ owner }) => adopt(owner));
  }

  refreshToken(token: string) {
    if (this.serverUrl) this.setServer(this.serverUrl, token);
  }

  setRoom(identity: RoomIdentity, replace = false) {
    if (!this.admits()) return;
    this.identity = replace ? { ...identity } : { ...this.identity, ...identity };
  }

  private validKey(key: string) {
    return (
      key.length > 0 && utf8(key) <= MAX_KEY_BYTES && !key.startsWith('lk.') && key !== 'session.id'
    );
  }

  /** `custom.<name>` under this Room; over the limits → rejected and counted, never truncated (SPEC). */
  emitCustom(name: string, attributes: Record<string, string> = {}) {
    const entries = Object.entries(attributes);
    const valid =
      name.length > 0 &&
      utf8(name) <= MAX_KEY_BYTES &&
      entries.length <= MAX_ATTRIBUTES &&
      entries.every(([key, value]) => this.validKey(key) && validValue(value));
    if (valid) this.emit(`custom.${name}`, attributes);
    else this.pipeline.count('dropped.invalid');
  }

  /** A correlation attribute for this Room's later records; `null` removes it. */
  setAttribute(key: string, value: string | null | undefined) {
    if (!this.admits()) return;
    const room = key in this.custom || Object.keys(this.custom).length < MAX_ATTRIBUTES; // own keys only: no prototype
    if (!this.validKey(key) || (value != null && !(validValue(value) && room))) {
      this.pipeline.count('dropped.invalid');
      return;
    }
    this.closeWindows(); // a window never mixes readings taken under two values (SPEC)
    if (value != null) this.custom[key] = value;
    else delete this.custom[key];
  }

  /** `hold`: the span owns the uplink while open (`lk.connect`, `lk.reconnect`), a soft hold on uploads. */
  start(
    name: string,
    options: {
      kind?: number;
      attributes?: Attributes;
      parent?: TelemetrySpan;
      hold?: boolean;
    } = {},
  ): TelemetrySpan {
    const parent = options.parent && !options.parent.ended ? options.parent : undefined;
    const span = new TelemetrySpan(
      this,
      name,
      options.kind ?? SpanKind.internal,
      options.attributes ?? {},
      this.owner(),
      parent?.spanId,
    );
    if (!this.admits()) {
      span.ended = true; // after the opt-out a span is handed out ended: no hold, no record
      return guarded(span);
    }
    this.open.add(span);
    if (options.hold) this.pipeline.hold(span, true);
    return guarded(span);
  }

  /** @internal */
  finish(span: TelemetrySpan, record: SpanRecord) {
    this.pipeline.hold(span, false);
    this.open.delete(span);
    if (!this.admits()) return;
    record.host = span.owner.host;
    record.attributes = { ...this.ownerAttributes(span.owner), ...record.attributes };
    this.pipeline.record(record, this, false, span.owner);
  }

  /** `owner`: the connection a window was opened under; a record of the moment otherwise. */
  emit(
    eventName: string,
    attributes: Attributes = {},
    severity: SeverityName = 'info',
    owner: Owner = this.owner(),
  ) {
    const record: LogRecord = {
      kind: 'log',
      timeMs: Date.now(),
      severity,
      eventName,
      // Log viewers key their line on the body, and not every backend surfaces event_name yet.
      body: eventName,
      attributes: { ...this.ownerAttributes(owner), 'otel.event.name': eventName, ...attributes },
      traceId: this.traceId,
      host: owner.host,
    };
    this.pipeline.record(record, this, eventName === 'lk.rtc.stats.sample', owner);
  }

  /** The open connect or reconnect span: what a publish nests under. */
  uplink(): TelemetrySpan | undefined {
    return [this.connectSpan, this.reconnectSpan].find((span) => span && !span.ended);
  }

  /** Where a warning belongs: the newest open publish, else the open connect or reconnect. */
  ambient(): TelemetrySpan | undefined {
    const publish = Array.from(this.open)
      .reverse()
      .find((span) => span.name === 'lk.publish' && !span.ended);
    return publish ?? this.uplink();
  }

  /** An SDK warning or error line filed under this Room (and its open span, when any). */
  log(severity: 'warn' | 'error', body: string, logger: string) {
    this.pipeline.record(
      {
        kind: 'log',
        timeMs: Date.now(),
        severity,
        body,
        attributes: { ...this.attributes(), 'lk.log.source': 'sdk', 'lk.log.logger': logger },
        traceId: this.traceId,
        spanId: this.ambient()?.spanId,
        host: this.host,
      },
      this,
      false,
      this.owner(),
    );
  }

  /** A user-initiated connect: a fresh identity, the destination, one `lk.connect` span that holds uploads. */
  connectStarted(url: string, token: string) {
    // Whatever the previous connection still had open ships under that connection's owner; a poll
    // in flight is dropped (the poller compares `connection`).
    this.closeWindows();
    this.layers.clear();
    this.unread.clear();
    this.lastCpuMs.clear();
    this.connection += 1;
    this.setRoom({}, true);
    this.setServer(url, token);
    this.connectSpan?.end('cancelled');
    this.reconnectSpan?.end('cancelled'); // a new connection supersedes a reconnect in progress
    this.reconnectSpan = undefined;
    this.connectSpan = this.start('lk.connect', {
      kind: SpanKind.client,
      attributes: { 'lk.connect.attempt': 1 },
      hold: true,
    });
  }

  /**
   * The required checkpoints keep SPEC's order: a peer connection created before the join response
   * (offer-with-join) is the optional `early_pc_created`, and `pc_created` is stamped when the join
   * is adopted, as Swift does.
   */
  connectStep(name: string) {
    const span = this.connectSpan;
    if (!span) return;
    if (name === 'pc_created' && !span.has('join_recv')) {
      span.step('early_pc_created');
      return;
    }
    span.step(name);
    if (name === 'join_recv' && span.has('early_pc_created')) span.step('pc_created');
  }

  /** `error` is the thrown value, or a reason name to report as `error.type` (`signal_close`, `reconnect_failed`). */
  connectEnded(outcome: Outcome, error?: unknown) {
    endWith(this.connectSpan, outcome, error);
    this.connectSpan = undefined;
  }

  /** One `lk.reconnect` span per reconnect cycle; a resume that turns into a restart is the same cycle, one attempt later. */
  reconnectAttempt(mode: 'quick' | 'full', reason?: ReconnectReason) {
    if (!this.reconnectSpan || this.reconnectSpan.ended) {
      this.reconnectAttempts = 0;
      this.reconnectSpan = this.start('lk.reconnect', {
        kind: SpanKind.client,
        attributes: { 'lk.reconnect.reason': reconnectReasonName(reason) },
        hold: true,
      });
    }
    this.reconnectAttempts += 1;
    this.reconnectSpan.setAttribute('lk.reconnect.mode', mode);
    this.reconnectSpan.setAttribute('lk.reconnect.attempts', this.reconnectAttempts);
    this.reconnectSpan.step(`attempt ${this.reconnectAttempts} ${mode}`);
  }

  get reconnecting(): boolean {
    return this.reconnectSpan !== undefined && !this.reconnectSpan.ended;
  }

  reconnectEnded(outcome: Outcome, error?: unknown) {
    endWith(this.reconnectSpan, outcome, error);
    this.reconnectSpan = undefined;
  }

  /** The intent to subscribe exists: autoSubscribe at publish or join, or a manual subscribe (SPEC: the core owns `lk.subscribe`). */
  subscribeStarted(track: SpanTrack) {
    if (!this.admits() || this.pending.has(track.sid)) return;
    const span = this.start('lk.subscribe', {
      attributes: {
        'lk.track.sid': track.sid,
        'lk.track.kind': track.kind,
        'lk.track.source': track.source,
        'lk.participant.remote_identity': track.remoteIdentity,
      },
    });
    const end = scheduled(() => this.endSubscribe(track.sid, 'error', 'timed_out'));
    this.pending.set(track.sid, {
      span,
      deadline: Date.now() + SUBSCRIBE_TIMEOUT_MS,
      timer: unref(setTimeout(end, SUBSCRIBE_TIMEOUT_MS)),
    });
    this.onWake?.();
  }

  subscribed(track: SpanTrack) {
    this.subscribeStarted(track);
    this.pending.get(track.sid)?.span.step('subscribed');
  }

  subscribeFailed(sid: string, error: string) {
    this.endSubscribe(sid, 'error', error);
  }

  trackEnded(sid: string) {
    const pending = this.pending.get(sid);
    if (pending) {
      const timedOut = Date.now() >= pending.deadline;
      this.endSubscribe(sid, timedOut ? 'error' : 'cancelled', timedOut ? 'timed_out' : undefined);
    }
    for (const key of this.windows.keys()) {
      if (key.startsWith(`${sid}:`)) this.closeWindow(key);
    }
    this.lastCpuMs.delete(sid);
    this.unread.delete(sid);
    this.layers.delete(`${sid}:inbound`);
    this.layers.delete(`${sid}:outbound`);
  }

  private endSubscribe(sid: string, outcome: Outcome, error?: string) {
    const pending = this.pending.get(sid);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(sid);
    pending.span.end(outcome, error);
  }

  /** When the Room should poll `getStats()` next: every second while a subscribe awaits first media, else twice per window. */
  statsPollIntervalMs(): number {
    for (const [sid, until] of Array.from(this.unread))
      if (until <= Date.now()) this.unread.delete(sid);
    return this.pending.size > 0 || this.unread.size > 0 ? 1000 : this.pipeline.statsWindowMs / 2;
  }

  /** A local track was published: its first reading is wanted soon. */
  trackPublished(sid: string) {
    if (!this.admits()) return;
    this.unread.set(sid, Date.now() + UNREAD_TIMEOUT_MS);
    this.onWake?.();
  }

  recordPeerStats(report: RTCStatsReport, tracks: Map<string, TrackRef>) {
    if (!this.pipeline.enabled) return;
    const now = Date.now();
    for (const { ref, layers } of peerSamples(report, tracks).values()) {
      const key = `${ref.sid}:${ref.direction}`;
      const known = this.layers.get(key) ?? new Map<string, { reading: Sample; at: number }>();
      for (const [layer, reading] of layers) known.set(layer, { reading, at: now });
      this.layers.set(key, known);
      const totals: Layers = new Map(Array.from(known, ([layer, { reading }]) => [layer, reading]));
      const sample = foldLayers(totals, layers.keys());
      let entry = this.windows.get(key);
      if (!entry) {
        entry = { ref, window: new StatsWindow(), owner: this.owner() };
        this.windows.set(key, entry);
        this.armWindows();
      }
      entry.window.add(sample);
      this.unread.delete(ref.sid);
      if (ref.direction === 'inbound' && (sample.counters['lk.rtc.bytes'] ?? 0) > 0) {
        const pending = this.pending.get(ref.sid);
        if (pending) {
          pending.span.step('first_media');
          this.endSubscribe(ref.sid, 'ok');
        }
      }
      const cpuMs = sample.counters['lk.rtc.quality_limitation.cpu_ms'];
      if (cpuMs !== undefined) {
        const last = this.lastCpuMs.get(ref.sid);
        if (last !== undefined && cpuMs > last) {
          this.cpuLimitedUntil = now + CPU_LIMITED_MS;
          this.pipeline.applyCadence(); // the stretch applies now; the pipeline times the relief
        }
        this.lastCpuMs.set(ref.sid, cpuMs);
      }
    }
  }

  private armWindows() {
    clearTimeout(this.windowTimer);
    this.windowTimer = undefined;
    let due = Number.POSITIVE_INFINITY;
    for (const { window } of this.windows.values()) {
      due = Math.min(due, window.started + this.pipeline.statsWindowMs);
    }
    for (const known of this.layers.values()) {
      for (const { at } of known.values()) due = Math.min(due, at + LAYER_IDLE_MS);
    }
    if (due === Number.POSITIVE_INFINITY) return;
    const wait = Math.max(0, due - Date.now());
    this.windowTimer = unref(
      setTimeout(
        scheduled(() => this.closeDue()),
        wait,
      ),
    );
  }

  /** @internal The cadence factor changed: the windows' boundaries and the next poll move with it. */
  cadenceChanged() {
    this.armWindows();
    this.onWake?.();
  }

  /** Windows past their boundary ship; layer histories idle for 3 min retire — on the timer, no reading needed. */
  private closeDue() {
    const now = Date.now();
    for (const [key, { window }] of Array.from(this.windows)) {
      if (now - window.started >= this.pipeline.statsWindowMs) this.closeWindow(key);
    }
    for (const [key, known] of Array.from(this.layers)) {
      for (const [layer, { at }] of Array.from(known)) {
        if (now - at >= LAYER_IDLE_MS) known.delete(layer);
      }
      if (known.size === 0) this.layers.delete(key);
    }
    this.armWindows();
  }

  closeWindows() {
    for (const key of Array.from(this.windows.keys())) this.closeWindow(key);
    this.armWindows(); // nothing left: the timer goes
  }

  private closeWindow(key: string) {
    const entry = this.windows.get(key);
    if (!entry) return;
    this.windows.delete(key);
    if (entry.window.samples === 0) return;
    this.emit(
      'lk.rtc.stats.sample',
      {
        'lk.track.sid': entry.ref.sid,
        'lk.track.kind': entry.ref.kind,
        'lk.track.direction': entry.ref.direction,
        ...entry.window.attributes(),
      },
      'info',
      entry.owner,
    );
  }

  /** The Room left connected for good — never on a reconnect. */
  disconnected(reason?: DisconnectReason, override?: string) {
    const name = override ?? disconnectReasonName(reason);
    for (const sid of Array.from(this.pending.keys())) this.trackEnded(sid);
    this.closeWindows();
    this.unread.clear();
    this.layers.clear();
    this.lastCpuMs.clear();
    this.cpuLimitedUntil = 0;
    this.armWindows(); // nothing left to time: the idle timer goes too
    this.emit(
      'lk.room.disconnected',
      { 'lk.disconnect.reason': name },
      name === 'client_initiated' ? 'info' : 'warn',
    );
    this.inCall = false;
    this.pipeline.forget(this);
    this.pipeline.flush().catch(() => {});
  }

  /** The opt-out: every timer stopped, every open span closed and emptied, no identity, destination or attribute retained. */
  purge() {
    for (const pending of this.pending.values()) clearTimeout(pending.timer);
    this.pending.clear();
    clearTimeout(this.windowTimer);
    this.windowTimer = undefined;
    this.cpuLimitedUntil = 0;
    this.windows.clear();
    this.layers.clear();
    this.unread.clear();
    this.lastCpuMs.clear();
    this.custom = Object.create(null);
    this.identity = {};
    this.serverUrl = undefined;
    this.host = undefined;
    this.collects = undefined;
    this.inCall = false;
    for (const span of this.open) {
      span.purge();
      this.pipeline.hold(span, false);
    }
    this.open.clear();
    this.connectSpan = undefined;
    this.reconnectSpan = undefined;
  }
}
