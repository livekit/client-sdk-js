import { LogLevel } from '../logger';

/**
 * Default number of entries retained by {@link DiagnosticsBuffer}.
 * Sized to cover a typical connect → publish → reconnect → disconnect cycle
 * at debug verbosity without holding onto an unbounded amount of memory.
 */
export const DEFAULT_DIAGNOSTICS_BUFFER_SIZE = 500;

export interface DiagnosticsBufferOptions {
  /**
   * Maximum number of entries retained in the ring. When full, the oldest
   * entry is overwritten. Defaults to {@link DEFAULT_DIAGNOSTICS_BUFFER_SIZE}.
   */
  size?: number;
}

/**
 * Fields common to every entry kind retained by the diagnostics buffer.
 * Additional entry kinds can extend this interface to remain compatible
 * with {@link DiagnosticsBuffer.push}.
 */
export interface BaseDiagnosticEntry {
  /** Discriminator identifying the entry kind. */
  type: string;
  /** Wall-clock time the entry was recorded, in milliseconds since epoch. */
  timestamp: number;
}

export interface LogDiagnosticEntry extends BaseDiagnosticEntry {
  type: 'log';
  level: LogLevel;
  message: string;
  context?: object;
}

/**
 * Union of all entry kinds retained by the diagnostics buffer. Add new
 * variants here (e.g. `WebRTCStatsEntry`) as additional signals are
 * captured — the buffer itself is agnostic to which variants exist.
 */
export type DiagnosticEntry = LogDiagnosticEntry;

/**
 * Fixed-capacity ring buffer of recent diagnostic entries. Once capacity is
 * reached, each new entry overwrites the oldest one. Intended to give SDK
 * consumers a bounded, readable window of recent activity (logs today, WebRTC
 * stats and other signals in the future) that can be attached to bug reports
 * without having to keep console history around.
 */
export class DiagnosticsBuffer {
  private readonly capacity: number;

  private readonly buffer: (DiagnosticEntry | undefined)[];

  private writeIndex = 0;

  private length = 0;

  constructor(options: DiagnosticsBufferOptions = {}) {
    const requested = options.size ?? DEFAULT_DIAGNOSTICS_BUFFER_SIZE;
    this.capacity = requested > 0 ? Math.floor(requested) : DEFAULT_DIAGNOSTICS_BUFFER_SIZE;
    this.buffer = new Array(this.capacity);
  }

  /** Maximum number of entries this buffer will retain. */
  get size() {
    return this.capacity;
  }

  /** Current number of entries held (≤ {@link size}). */
  get count() {
    return this.length;
  }

  push(entry: DiagnosticEntry) {
    this.buffer[this.writeIndex] = entry;
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    if (this.length < this.capacity) {
      this.length += 1;
    }
  }

  /**
   * Returns a copy of the retained entries in chronological order (oldest
   * first). The returned array is detached from the buffer — subsequent
   * pushes do not mutate it.
   */
  snapshot(): DiagnosticEntry[] {
    const result: DiagnosticEntry[] = new Array(this.length);
    const start = this.length < this.capacity ? 0 : this.writeIndex;
    for (let i = 0; i < this.length; i += 1) {
      result[i] = this.buffer[(start + i) % this.capacity]!;
    }
    return result;
  }

  clear() {
    this.buffer.fill(undefined);
    this.writeIndex = 0;
    this.length = 0;
  }
}
