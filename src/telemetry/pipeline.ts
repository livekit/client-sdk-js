/**
 * The process-wide pipeline: one queue, a write-ahead cache of batches, one request in flight, and
 * SPEC's upload policy — telemetry never wins over media. Each record is stamped with its project
 * when captured and never re-routed; each project keeps its own token, pause and silence.
 */
import log from '../logger';
import { type DeviceState, cadenceFactor, changes, softHold } from './device';
import {
  type Attributes,
  type LogRecord,
  type SeverityName,
  type TelemetryRecord,
  encode,
  randomHex,
  rejectedRecords,
  unref,
} from './otlp';
import { type Owner, type TelemetryScope, scheduled } from './scope';
import {
  type BatchMeta,
  MemoryStorage,
  type TelemetryStorage,
  WriteAheadCache,
  batchId,
  decodeBatch,
  encodeBatch,
  parseBatchId,
} from './storage';
import {
  type Answer,
  EXPORT_TIMEOUT_MS,
  backoffMs,
  classify,
  cloudHost,
  fingerprint,
  ingestUrl,
  post,
  readToken,
} from './transport';

export const FLUSH_INTERVAL_MS = 60_000;
export const STATS_WINDOW_MS = 60_000;
const MAX_QUEUE = 2048;
const MAX_BATCH = 512;
const MAX_CACHE_BYTES = 4 * 1024 * 1024;
const MAX_CACHE_BATCHES = 512;
/** A request never carries more than this much encoded protobuf (SPEC); a bigger batch is halved like a 413. */
const MAX_BATCH_BYTES = 1024 * 1024;
/** Failed-delete markers at most: the combined store bound (the store's batches plus the memory fallback's). */
const MAX_DELETING = 2 * MAX_CACHE_BATCHES;
/** While a Room is in a call, a backlog replays at this many requests per interval (SPEC budget). */
const MAX_BATCHES_PER_UPLOAD = 4;
const HOLD_CAP_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const FLOOD_LIMIT = 300;
const FLOOD_WINDOW_MS = 10 * 60_000;

interface Project {
  token?: string;
  expiresAt?: number;
  /** `false` after a first token without the grant: the project never opted in. */
  granted?: boolean;
  /** Fingerprints of tokens the collector refused → their expiry; never the token itself, never forgotten before it. */
  refused: Map<string, number>;
  pausedUntil: number;
  failures: number;
  /** `process` after the owner's opt-out answer; `token` after a 404, until the next token. */
  silent?: 'process' | 'token';
}

export class Pipeline {
  readonly processTraceId = randomHex(16);

  resource: Attributes = {};

  private cache: TelemetryStorage = new MemoryStorage(MAX_CACHE_BYTES, MAX_CACHE_BATCHES);

  /** A host's store gets a bounded memory fallback for the batches it refuses (SPEC: kept in memory, counted as write errors). */
  set storage(store: TelemetryStorage) {
    this.cache = new WriteAheadCache(store, MAX_CACHE_BYTES, MAX_CACHE_BATCHES, () =>
      this.count('cache.write_errors'),
    );
  }

  get storage(): TelemetryStorage {
    return this.cache;
  }

  /** Local e2e runs point everything here (the `LK_TELEMETRY_ENDPOINT` of the native cores): no Cloud rules, no tokens. */
  endpoint?: string;

  /** Test tap: every batch as it is cached. */
  onBatch?: (records: TelemetryRecord[]) => void;

  /** Rooms in a call, held strongly: they meter uploads and drive the cadence. */
  readonly scopes = new Set<TelemetryScope>();

  /** Every Room's scope, weakly: telemetry never retains a Room nobody uses, and the opt-out still reaches them all. */
  private tracked = new Set<WeakRef<TelemetryScope>>();

  /** Batches the collector took but the store would not delete yet: never sent again, deleted at the next chance. */
  private deleting = new Set<string>();

  private reaper =
    typeof FinalizationRegistry === 'undefined'
      ? undefined
      : new FinalizationRegistry<WeakRef<TelemetryScope>>((ref) => this.tracked.delete(ref));

  /** Fails closed on a runtime without `WeakRef` (none of the supported browsers; Hermes has it): nothing is registered or captured. */
  disabled = typeof WeakRef === 'undefined';

  private queue: Array<{ record: TelemetryRecord; scope?: TelemetryScope; owner?: Owner }> = [];

  /** At this many markers nothing new is sent: an accepted batch is never forgotten to make room. */
  private markerCap = MAX_DELETING;

  /** Times the next CPU-limited expiry, so cadence relief never waits for a tick. */
  private relief?: ReturnType<typeof setTimeout>;

  private projects = new Map<string, Project>();

  private latestHost?: string;

  private warned = new Set<string>();

  private timer?: ReturnType<typeof setInterval>;

  private flushing?: Promise<void>;

  private inFlight?: AbortController;

  private allowance = MAX_BATCHES_PER_UPLOAD;

  private holds = new Set<object>();

  private holdSince = 0;

  private device: DeviceState = {};

  private cadence = 1;

  private counters: Record<string, number> = {};

  private reported: Record<string, number> = {};

  private reportDue = false;

  private floodCount = 0;

  private floodWindowStart = 0;

  private sequence = 0;

  get enabled() {
    return !this.disabled;
  }

  /** SPEC's cadence factor right now: the device state × an encoder CPU-limited within the minute, capped at 4. */
  get factor(): number {
    const now = Date.now();
    const cpu = Array.from(this.scopes).some((scope) => scope.cpuLimitedUntil > now) ? 2 : 1;
    return Math.min(4, cadenceFactor(this.device) * cpu);
  }

  get statsWindowMs() {
    return STATS_WINDOW_MS * this.factor;
  }

  start() {
    if (this.timer || this.disabled) return;
    this.timer = unref(setInterval(() => this.tick(), FLUSH_INTERVAL_MS * this.cadence));
  }

  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private tick() {
    this.allowance = MAX_BATCHES_PER_UPLOAD;
    this.applyCadence();
    this.flush().catch(() => {});
  }

  /** @internal */
  count(key: string, by = 1) {
    this.counters[key] = (this.counters[key] ?? 0) + by;
    if (!key.startsWith('uploads.sent') && key !== 'uploads.bytes') this.reportDue = true;
  }

  /** A record that is nobody's call — device state, capture failures, pre-room warnings — under the process scope. */
  private processRecord(record: Pick<LogRecord, 'severity' | 'attributes'> & Partial<LogRecord>) {
    this.record({
      kind: 'log',
      timeMs: Date.now(),
      traceId: this.processTraceId,
      ...record,
      attributes: { 'session.id': this.processTraceId, ...record.attributes },
    });
  }

  emit(eventName: string, attributes: Attributes = {}, severity: SeverityName = 'info') {
    const withName = { 'otel.event.name': eventName, ...attributes };
    this.processRecord({ severity, eventName, body: eventName, attributes: withName });
  }

  log(severity: 'warn' | 'error', body: string, logger: string) {
    const attributes = { 'lk.log.source': 'sdk', 'lk.log.logger': logger };
    this.processRecord({ severity, body, attributes });
  }

  /**
   * @internal Discrete events are rationed (SPEC flood guard); stats windows and the report are
   * exempt. A record keeps the decision stamped on its owner when it opened: a self-hosted owner's
   * record is dropped here and counted (a policy loss, local only — SPEC), a Cloud owner's goes to
   * that project, an unassigned one waits for its Room's first project (`adopt`). Process records
   * go to the latest project.
   */
  record(record: TelemetryRecord, scope?: TelemetryScope, exempt = false, owner?: Owner) {
    if (this.disabled) return;
    if (owner?.collects === false) {
      this.count('policy.no_ingest');
      return;
    }
    if (!exempt && !this.floodOk()) return;
    record.host ??= owner ? owner.host : this.latestHost;
    this.queue.push({ record, scope, owner });
    const overflow = this.queue.length - MAX_QUEUE;
    if (overflow > 0) {
      this.queue.splice(0, overflow);
      this.count('dropped.queue_full', overflow);
    }
  }

  private floodOk(): boolean {
    if (Date.now() - this.floodWindowStart > FLOOD_WINDOW_MS) {
      this.floodWindowStart = Date.now();
      this.floodCount = 0;
    }
    this.floodCount += 1;
    if (this.floodCount <= FLOOD_LIMIT) return true;
    this.count('dropped.rate_limited');
    return false;
  }

  private project(host: string): Project {
    const fresh: Project = { refused: new Map(), pausedUntil: 0, failures: 0 };
    return this.projects.get(host) ?? this.projects.set(host, fresh).get(host)!;
  }

  /** @internal A Room exists. Only dead references are ever pruned: a live Room is always reachable for the purge. */
  track(scope: TelemetryScope) {
    if (this.disabled) return;
    const ref = new WeakRef(scope);
    this.tracked.add(ref);
    if (this.reaper) this.reaper.register(scope, ref);
    else for (const old of Array.from(this.tracked)) if (!old.deref()) this.tracked.delete(old);
  }

  /** @internal The Room is in a call. */
  activate(scope: TelemetryScope) {
    this.scopes.add(scope);
  }

  /** @internal The Room left for good: no longer in a call, and its CPU weight leaves the cadence with it. */
  forget(scope: TelemetryScope) {
    this.scopes.delete(scope);
    this.applyCadence();
  }

  private live(): Set<TelemetryScope> {
    const all = new Set(this.scopes);
    for (const ref of this.tracked) {
      const scope = ref.deref();
      if (scope) all.add(scope);
    }
    return all;
  }

  /**
   * A Room's server URL and token (SPEC "Destination and credentials"). Returns the project host
   * the Room is routed to, `''` under the collector override, `undefined` when the host has no
   * ingest.
   */
  setServer(serverUrl: string, token: string, scope?: TelemetryScope): string | undefined {
    if (this.disabled) return undefined; // no credential is taken after the opt-out
    if (this.endpoint !== undefined) {
      this.project('');
      this.adopt(scope, '');
      return '';
    }
    const host = cloudHost(serverUrl);
    if (!host) {
      // One local line (SPEC): a self-hosted or OSS server has no ingest for this Room's records.
      if (!this.warned.has(serverUrl))
        log.info(`telemetry: no LiveKit Cloud ingest for ${serverUrl}`);
      this.warned.add(serverUrl);
      this.adopt(scope, undefined);
      return undefined;
    }
    const project = this.project(host);
    const claims = readToken(token);
    // The first token decides whether the project opted in (SPEC); a later token without the
    // grant does not replace a granted one that is still valid.
    project.granted ??= claims.granted;
    if (project.granted && claims.granted && !claims.expired && !this.refused(project, token)) {
      project.token = token;
      project.expiresAt = claims.expiresAt;
    }
    if (project.silent === 'token') project.silent = undefined;
    this.adopt(scope, host);
    this.wake();
    return host;
  }

  /**
   * A Room's records captured before it had a server are resolved by its first one (SPEC): a Cloud
   * project takes them, a self-hosted server has no ingest so they are dropped and counted now —
   * nothing unassigned outlives the first resolution. Process records take the latest project.
   */
  private adopt(scope: TelemetryScope | undefined, host: string | undefined) {
    if (host !== undefined) this.latestHost = host;
    this.queue = this.queue.filter((entry) => {
      if (entry.record.host !== undefined) return true;
      if (scope !== undefined && entry.scope === scope && entry.owner?.collects === undefined) {
        if (host === undefined) {
          this.count('policy.no_ingest');
          return false;
        }
        entry.record.host = host;
      } else if (entry.scope === undefined && host !== undefined) {
        entry.record.host = host;
      }
      return true;
    });
  }

  /** The store's listing, or nothing while the store is unavailable (gauges and purges wait). */
  private listed(): string[] {
    try {
      return this.storage.pending();
    } catch {
      return [];
    }
  }

  /** The token to send, if it is still valid and was never refused. */
  private usableToken(project: Project): string | undefined {
    const { token, expiresAt } = project;
    const valid =
      token && !this.refused(project, token) && (expiresAt === undefined || expiresAt > Date.now());
    return valid ? token : undefined;
  }

  /**
   * A refused token is known by fingerprint until it expires — one without `exp` for the process —
   * and never forgotten before that (SPEC). The bound is the number of distinct refused tokens
   * still alive, a few per hour at the SFU's refresh cadence.
   */
  private refused(project: Project, token: string): boolean {
    for (const [print, until] of Array.from(project.refused)) {
      if (until <= Date.now()) project.refused.delete(print);
    }
    return project.refused.has(fingerprint(token));
  }

  private refuse(project: Project, token: string) {
    const until = readToken(token).expiresAt ?? Number.POSITIVE_INFINITY;
    project.refused.set(fingerprint(token), until);
  }

  /** A soft hold from a span that owns the uplink (`lk.connect`, `lk.reconnect`). */
  hold(owner: object, up: boolean) {
    if (up) this.holds.add(owner);
    else this.holds.delete(owner);
  }

  /** Soft holds last at most 60 s on their own clock; then one batch goes out and the hold starts over. */
  private held(): boolean {
    if (this.holds.size === 0 && !softHold(this.device)) {
      this.holdSince = 0;
      return false;
    }
    const now = Date.now();
    if (!this.holdSince) this.holdSince = now;
    if (now - this.holdSince >= HOLD_CAP_MS) {
      this.count('holds.capped');
      this.holdSince = now;
      return false;
    }
    return true;
  }

  /** What the platform now says about the device: events on change, the cadence, a flush on background. */
  deviceState(state: DeviceState) {
    const next = { ...this.device, ...state };
    for (const [event, attributes] of changes(this.device, next)) this.emit(event, attributes);
    const toBackground = next.appState === 'background' && this.device.appState !== 'background';
    this.device = next;
    this.applyCadence();
    if (toBackground) {
      for (const scope of this.scopes) scope.closeWindows();
      this.flush(true).catch(() => {});
    }
  }

  /** Re-arms the export timer and every Room's deadlines when the factor changed: a shorter period applies at once (SPEC). */
  applyCadence() {
    const { factor } = this;
    // The next CPU-limited expiry re-derives the factor by itself: relief never waits for a tick.
    clearTimeout(this.relief);
    const now = Date.now();
    const expiries = Array.from(this.scopes, (scope) => scope.cpuLimitedUntil).filter(
      (at) => at > now,
    );
    if (expiries.length > 0) {
      const wait = Math.min(...expiries) - now + 1;
      this.relief = unref(
        setTimeout(
          scheduled(() => this.applyCadence()),
          wait,
        ),
      );
    }
    if (factor === this.cadence) return;
    this.cadence = factor;
    for (const scope of Array.from(this.live())) scope.cadenceChanged();
    // Restarting the timer is what makes a shorter period apply at once (SPEC).
    if (this.timer) {
      this.stop();
      this.start();
    }
  }

  private inCall(): boolean {
    return Array.from(this.scopes).some((scope) => scope.inCall);
  }

  private wake() {
    unref(setTimeout(() => this.flush().catch(() => {}), 0));
  }

  /** Cache what is queued, then send what the policy allows; `force` (background, page hide) drains without the budget and the holds. */
  async flush(force = false): Promise<void> {
    // One pass at a time; a flush asked for during a pass runs right after it, never skipped.
    while (this.flushing) await this.flushing;
    if (this.disabled) return;
    this.flushing = this.pass(force).finally(() => {
      this.flushing = undefined;
    });
    await this.flushing;
  }

  private async pass(force: boolean): Promise<void> {
    if (force) this.reportDue = true;
    this.persist(force);
    let budget = force || !this.inCall() ? Number.POSITIVE_INFINITY : this.allowance;
    let pending: string[];
    try {
      pending = this.storage.pending();
    } catch {
      this.count('cache.list_errors'); // the store is unavailable: nothing reconciled, nothing sent
      return;
    }
    // A marker whose batch left the store (evicted, or removed behind our back) is spent.
    for (const id of Array.from(this.deleting)) if (!pending.includes(id)) this.deleting.delete(id);
    for (let i = 0; i < pending.length && budget > 0 && !this.disabled; i += 1) {
      const id = pending[i];
      if (this.deleting.has(id)) {
        this.discard(id); // taken by the collector already: deleted now if the store lets us, never re-sent
        continue;
      }
      const meta = parseBatchId(id);
      let body: Uint8Array | undefined;
      try {
        body = this.storage.read(id);
      } catch {
        this.count('cache.read_errors'); // the store cannot serve it right now: kept for the next pass
        continue;
      }
      const expired = meta && Date.now() - meta.timeMs > DAY_MS;
      if (!meta || body === undefined || expired) {
        this.discard(id);
        if (expired) this.count('dropped.expired', meta.records);
        continue;
      }
      // The policy is evaluated before every request (SPEC): holds pause everything, a project's
      // own pause, silence or missing token only its batches.
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (!force && (offline || this.held())) break;
      const project = this.project(meta.host);
      // The collector override never sees a bearer, cached Cloud batches included.
      const token = this.endpoint === undefined ? this.usableToken(project) : undefined;
      const paused = project.silent || !token || project.pausedUntil > Date.now();
      if (this.endpoint === undefined && paused) continue;
      let records: TelemetryRecord[];
      try {
        records = decodeBatch(body);
      } catch {
        this.discard(id);
        this.count('dropped.corrupt', meta.records);
        continue;
      }
      // At the marker cap nothing new goes out: an accepted batch is never forgotten to make room.
      if (this.deleting.size >= this.markerCap) break;
      budget -= 1;
      this.allowance = Math.max(0, this.allowance - 1);
      const url =
        this.endpoint !== undefined
          ? `${this.endpoint.replace(/\/$/, '')}/v1/${meta.kind}`
          : ingestUrl(meta.host, meta.kind);
      const answer = await this.send(url, records, token);
      // An answer that lands after the opt-out is dropped: the purge already ran.
      if (this.disabled) break;
      const halves = this.settle(id, meta, records, project, token, answer);
      if (halves) pending.splice(i + 1, 0, ...halves);
    }
  }

  private persist(force = false) {
    const groups = new Map<string, TelemetryRecord[]>();
    const waiting: typeof this.queue = [];
    for (const entry of this.queue) {
      // Only the owner stamped at capture routes a record; a Room's records wait for its first
      // project, a non-Cloud Room's are dropped at the door.
      const { host } = entry.record;
      if (host === undefined) {
        waiting.push(entry);
        continue;
      }
      const project = this.projects.get(host);
      if (project?.granted === false || project?.silent === 'process') continue; // never opted in, or opted out
      const key = `${host}|${entry.record.kind === 'span' ? 'traces' : 'logs'}`;
      groups.set(key, [...(groups.get(key) ?? []), entry.record]);
    }
    this.queue = waiting;
    // The self-report rides in the next logs batch, never a request of its own — except the
    // session summary at shutdown (SPEC).
    if (this.reportDue) {
      const logsKey = Array.from(groups.keys()).find((key) => key.endsWith('|logs'));
      const host = this.endpoint !== undefined ? '' : this.latestHost;
      if (logsKey) groups.get(logsKey)!.push(this.report());
      else if (force && host !== undefined) groups.set(`${host}|logs`, [this.report()]);
    }
    for (const [key, records] of groups) {
      const [host, kind] = key.split('|') as [string, BatchMeta['kind']];
      for (let i = 0; i < records.length; i += MAX_BATCH) {
        const batch = records.slice(i, i + MAX_BATCH);
        this.onBatch?.(batch);
        this.store({ timeMs: Date.now(), records: batch.length, kind, host }, batch);
      }
    }
  }

  /** Writes a batch or throws; what the cache evicts to take it is counted as lost. */
  private put(meta: BatchMeta, records: TelemetryRecord[]): string {
    if (this.disabled) throw new Error('telemetry disabled'); // nothing is written after the opt-out
    const id = batchId(meta, (this.sequence += 1));
    for (const evicted of this.storage.put(id, encodeBatch(records))) {
      // The store's eviction list is the authority: an uploaded batch leaving it is no loss.
      if (!this.deleting.delete(evicted)) {
        this.count('dropped.cache_full', parseBatchId(evicted)?.records ?? 0);
      }
    }
    return id;
  }

  /** A batch the cache cannot take at all (not even the memory fallback) is counted once as lost. */
  private store(meta: BatchMeta, records: TelemetryRecord[]): string | undefined {
    try {
      return this.put(meta, records);
    } catch {
      if (!this.disabled) this.count('dropped.cache_error', records.length);
      return undefined;
    }
  }

  private async send(
    url: string,
    records: TelemetryRecord[],
    token: string | undefined,
  ): Promise<Answer & { bytes: number }> {
    const controller = new AbortController();
    this.inFlight = controller;
    const timeout = unref(setTimeout(() => controller.abort('timeout'), EXPORT_TIMEOUT_MS));
    const encoded = encode(records, this.resource);
    if (encoded.byteLength > MAX_BATCH_BYTES) {
      clearTimeout(timeout);
      this.inFlight = undefined;
      return { kind: 'oversized', bytes: 0 }; // halved like a 413, before any request
    }
    try {
      const raw = await post(url, encoded, token, controller.signal);
      let rejected = 0;
      try {
        if (raw.status < 300) rejected = rejectedRecords(raw.body);
      } catch {
        // an unreadable success body is still a success
      }
      const body = raw.status >= 400 ? new TextDecoder().decode(raw.body) : '';
      return { ...classify(raw.status, raw.retryAfter, body, rejected), bytes: raw.sent };
    } catch {
      if (controller.signal.reason === 'timeout') this.count('uploads.timeouts');
      return { kind: 'retry', bytes: 0 };
    } finally {
      clearTimeout(timeout);
      this.inFlight = undefined;
    }
  }

  /** Applies the collector's answer (SPEC table); returns the ids of a 413 split's halves. */
  private settle(
    id: string,
    meta: BatchMeta,
    records: TelemetryRecord[],
    project: Project,
    token: string | undefined,
    answer: Answer & { bytes: number },
  ): string[] | undefined {
    switch (answer.kind) {
      case 'accepted':
        this.discard(id);
        this.count('uploads.sent');
        this.count('uploads.bytes', answer.bytes);
        if (answer.rejected > 0) this.count('dropped.rejected', answer.rejected);
        project.failures = 0;
        break;
      case 'rejected':
        this.discard(id);
        this.count('dropped.rejected', records.length);
        break;
      case 'oversized': {
        if (records.length === 1) {
          this.discard(id);
          this.count('dropped.oversized', 1);
          break;
        }
        // One step: both halves take the parent's place, or nothing changes and the parent stays
        // whole — nothing else is evicted in between (SPEC). A parent the cache cannot split now
        // waits for the project's backoff, like a failed upload.
        const half = Math.ceil(records.length / 2);
        const parts = [records.slice(0, half), records.slice(half)].map(
          (part): [string, Uint8Array] => [
            batchId({ ...meta, records: part.length }, (this.sequence += 1)),
            encodeBatch(part),
          ],
        );
        let replaced: boolean;
        try {
          replaced = !this.disabled && (this.storage.replace?.(id, parts) ?? false);
        } catch {
          replaced = false;
        }
        if (replaced) return parts.map(([partId]) => partId);
        // A store without a transactional `replace` (see `TelemetryStorage`) keeps the parent whole.
        project.failures += 1;
        project.pausedUntil = Date.now() + backoffMs(project.failures);
        this.count('uploads.failed');
        break;
      }
      case 'disabled':
      case 'gone':
        this.purgeProject(meta.host);
        project.silent = answer.kind === 'disabled' ? 'process' : 'token';
        break;
      case 'unauthorized':
        if (token) this.refuse(project, token);
        this.count('uploads.unauthorized');
        break;
      default:
        if (answer.kind === 'retry') project.failures += 1;
        project.pausedUntil =
          Date.now() + (answer.kind === 'pause' ? answer.forMs : backoffMs(project.failures));
        this.count('uploads.failed');
    }
    return undefined;
  }

  private purgeProject(host: string) {
    for (const id of this.listed()) {
      if (parseBatchId(id)?.host === host) this.discard(id);
    }
  }

  /** Deletes a batch, or remembers to: a batch the collector took is never sent twice from this launch. */
  private discard(id: string) {
    try {
      this.storage.remove(id);
      this.deleting.delete(id);
    } catch {
      if (!this.deleting.has(id)) this.count('cache.delete_errors');
      this.deleting.add(id);
    }
  }

  /** `lk.telemetry.report`: counts since the previous report, plus the cache gauge (SPEC). */
  private report(): LogRecord {
    this.reportDue = false;
    const attributes: Attributes = {
      'session.id': this.processTraceId,
      'otel.event.name': 'lk.telemetry.report',
      'lk.telemetry.cache.batches': this.listed().length,
    };
    const always = ['uploads.sent', 'uploads.bytes', 'uploads.failed'];
    for (const key of new Set([...always, ...Object.keys(this.counters)])) {
      if (key.startsWith('policy.')) continue; // losses by policy are local only (SPEC)
      const delta = (this.counters[key] ?? 0) - (this.reported[key] ?? 0);
      if (delta || always.includes(key)) attributes[`lk.telemetry.${key}`] = delta;
    }
    this.reported = { ...this.counters };
    return {
      kind: 'log',
      timeMs: Date.now(),
      severity: 'info',
      eventName: 'lk.telemetry.report',
      body: 'lk.telemetry.report',
      attributes,
      traceId: this.processTraceId,
    };
  }

  /** The opt-out, in effect when this returns: nothing is captured, everything unsent is deleted, no credential is kept. */
  disable() {
    this.disabled = true;
    this.stop();
    clearTimeout(this.relief);
    this.queue = [];
    this.holds.clear();
    this.inFlight?.abort('disabled');
    for (const scope of Array.from(this.live())) scope.purge();
    this.scopes.clear();
    this.tracked.clear();
    this.deleting.clear();
    this.projects.clear();
    try {
      this.storage.clear();
    } catch {
      // a store that cannot clear keeps what it has; nothing new ever reaches it
    }
  }

  stats(): Record<string, number> {
    return { ...this.counters, queued: this.queue.length, cached: this.listed().length };
  }
}
