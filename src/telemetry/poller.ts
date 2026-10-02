/**
 * One `getStats()` per peer connection, paced by the scope — never per track, never while opted
 * out. A read without an answer in 5 s is skipped; a wake-up only ever moves the next read closer.
 */
import { unref } from './otlp';
import type { Pipeline } from './pipeline';
import type { TelemetryScope } from './scope';
import type { TrackRef } from './webrtc';

const READ_TIMEOUT_MS = 5000;

export interface PeerStatsSource {
  /** The Room's publisher and subscriber connections, whichever exist right now. */
  peers(): Array<{ getStats(): Promise<RTCStatsReport> | undefined } | undefined>;
  /** `MediaStreamTrack` id → the Room's published or subscribed track. */
  tracks(): Map<string, TrackRef>;
}

export class StatsPoller {
  private timer?: ReturnType<typeof setTimeout>;

  private deadline = Number.POSITIVE_INFINITY;

  private reading = false;

  private running = false;

  /** Bumped by start and stop: a read that returns after either is not this connection's. */
  private generation = 0;

  constructor(
    private scope: TelemetryScope,
    private pipeline: Pipeline,
    private source: PeerStatsSource,
  ) {
    scope.onWake = () => this.arm();
  }

  start() {
    this.generation += 1;
    this.running = true;
    this.arm();
  }

  stop() {
    this.generation += 1;
    this.running = false;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.deadline = Number.POSITIVE_INFINITY;
  }

  private arm() {
    if (!this.running || this.reading) return;
    const delay = this.scope.statsPollIntervalMs();
    const at = Date.now() + delay;
    if (at >= this.deadline) return; // an earlier deadline stands
    clearTimeout(this.timer);
    this.deadline = at;
    this.timer = unref(setTimeout(() => this.poll().catch(() => {}), delay));
  }

  private async poll() {
    this.timer = undefined;
    this.deadline = Number.POSITIVE_INFINITY;
    if (!this.running || !this.pipeline.enabled) return;
    this.reading = true;
    // One poll belongs to one connection: its peers, its track map, its generation. The gate runs
    // before every read and after every answer, so neither an old answer nor an old peer's next
    // read lands under a later connection, and no `getStats()` follows `disableTelemetry()`.
    const { generation } = this;
    const { connection } = this.scope; // a connect accepted meanwhile ends this poll too
    const current = () =>
      generation === this.generation &&
      connection === this.scope.connection &&
      this.running &&
      this.pipeline.enabled;
    try {
      const tracks = this.source.tracks();
      for (const peer of this.source.peers()) {
        if (!current()) break;
        let report: RTCStatsReport | undefined;
        try {
          const pending = peer?.getStats();
          if (!pending) continue;
          report = await Promise.race([
            pending,
            new Promise<undefined>((resolve) => unref(setTimeout(resolve, READ_TIMEOUT_MS))),
          ]);
        } catch {
          continue; // one connection's failing read never costs the other its reading
        }
        if (!current()) break;
        if (report) this.scope.recordPeerStats(report, tracks);
      }
    } finally {
      this.reading = false;
      this.arm();
    }
  }
}
