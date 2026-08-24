import type { StructuredLogger } from '../logger';
import {
  type ConnectionStats,
  STATS_LOG_FREQUENCY,
  type StatsReport,
  extractConnectionStats,
  summarizeConnectionStats,
} from './statsReport';
import CriticalTimers from './timers';

/** the slice of `Track` the reporter pulls from */
export interface StatsReportingTrack {
  takeStatsReport(): { stats?: StatsReport; playback: StatsReport };
}

export interface TrackStatsSource {
  /** identifies the track within the dump */
  context: StatsReport;

  track: StatsReportingTrack;
}

export interface ConnectionStatsSource {
  /** name the connection is reported under, e.g. `publisher` */
  name: string;

  report: RTCStatsReport;
}

export interface MediaStatsSources {
  tracks: () => TrackStatsSource[];

  /**
   * Raw stats reports of the peer connections. Only the transport level parts
   * are read from these: the RTP streams are already covered per track.
   */
  connections: () => Promise<ConnectionStatsSource[]>;
}

/**
 * Writes a single log entry covering all media of a room every
 * `STATS_LOG_FREQUENCY`, so one line is enough to tell where media stopped
 * flowing — most importantly a subscribed video track receiving frames that
 * never decode.
 *
 * Per-track stats are not polled from here: each track already samples its
 * sender/receiver every `monitorFrequency`, and the dump closes out those
 * windows so every track in one entry covers the same stretch of the session.
 */
export class MediaStatsReporter {
  private sources: MediaStatsSources;

  private log: StructuredLogger;

  private interval?: ReturnType<typeof setInterval>;

  /** last snapshot per connection, to report the transport counters as deltas */
  private previousConnections = new Map<string, ConnectionStats>();

  constructor(sources: MediaStatsSources, log: StructuredLogger) {
    this.sources = sources;
    this.log = log;
  }

  /** dumps while the room is connected, and only then */
  setConnected(connected: boolean) {
    if (connected) {
      if (!this.interval) {
        this.interval = CriticalTimers.setInterval(() => {
          // dump swallows its own errors, so nothing needs to be awaited here
          this.dump();
        }, STATS_LOG_FREQUENCY);
      }
    } else if (this.interval) {
      CriticalTimers.clearInterval(this.interval);
      this.interval = undefined;
      this.previousConnections.clear();
    }
  }

  private async dump() {
    try {
      const connections = await this.collectConnections();
      const tracks = this.sources.tracks().map(({ context, track }) => {
        const { stats, playback } = track.takeStatsReport();
        // a track that reported no stats at all is a finding in itself, so it
        // stays in the dump with its playback state
        return { ...context, ...(stats ? { stats } : {}), playback };
      });
      if (tracks.length === 0 && Object.keys(connections).length === 0) {
        return;
      }
      this.log.info('media stats', { trackCount: tracks.length, connections, tracks });
    } catch (e) {
      this.log.debug('could not collect media stats', { error: e });
    }
  }

  private async collectConnections(): Promise<StatsReport> {
    const connections: StatsReport = {};
    for (const { name, report } of await this.sources.connections()) {
      const stats = extractConnectionStats(report);
      if (!stats) {
        continue;
      }
      connections[name] = summarizeConnectionStats(stats, this.previousConnections.get(name));
      this.previousConnections.set(name, stats);
    }
    return connections;
  }
}
