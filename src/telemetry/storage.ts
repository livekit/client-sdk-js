/**
 * Where batches wait between being made and being accepted. This is the write-ahead cache the Rust
 * core calls `BatchCache`: every batch is stored *before* the network is tried, and removed only
 * when the collector has taken it, so a crash, a kill or an offline hour costs nothing.
 *
 * The interface is deliberately the same five operations as the core's, and deliberately
 * synchronous — the queue path has no await in it, and a store that forces one turns the pipeline
 * into a state machine. A platform with a filesystem implements this; the default keeps batches in
 * memory, which is all a browser tab needs (TELEMETRY.md §3).
 */
import type { Encoding } from './otlp';

export interface TelemetryStorage {
  /** Store a batch. Returns the ids evicted to stay inside the store's own bounds. */
  put(id: string, body: Uint8Array): string[];
  /** Stored ids, oldest first. */
  pending(): string[];
  read(id: string): Uint8Array | undefined;
  remove(id: string): void;
  clear(): void;
}

/**
 * Ids sort oldest-first as plain strings, so a store never has to parse or stat anything — and
 * they carry everything needed to send a batch that was written by an earlier run of the app:
 * which route it belongs to, how it was encoded, and how many records it cost.
 */
export function batchId(
  kind: 'logs' | 'traces',
  sequence: number,
  records: number,
  encoding: Encoding,
): string {
  const now = String(Date.now()).padStart(15, '0');
  const suffix = `${kind === 'logs' ? 'l' : 't'}${encoding === 'json' ? 'j' : 'p'}`;
  return `${now}-${String(sequence).padStart(6, '0')}-${records}-${suffix}`;
}

export function batchKind(id: string): 'logs' | 'traces' {
  return id.split('-').pop()?.startsWith('t') === true ? 'traces' : 'logs';
}

/** A cached batch keeps the encoding it was written with: the collector is told the truth. */
export function batchEncoding(id: string): Encoding {
  return id.endsWith('j') ? 'json' : 'protobuf';
}

/** How many records a batch holds, so an eviction costs a known number and not a guess. */
export function batchRecords(id: string): number {
  return Number.parseInt(id.split('-')[2] ?? '0', 10) || 0;
}

/** Lost with the tab, bounded by bytes and by count; the oldest goes first, and one always stays. */
export class MemoryStorage implements TelemetryStorage {
  private batches: Array<[string, Uint8Array]> = [];

  constructor(
    private maxBytes: number,
    private maxBatches: number,
  ) {}

  put(id: string, body: Uint8Array): string[] {
    this.batches.push([id, body]);
    const evicted: string[] = [];
    let total = this.batches.reduce((sum, [, batch]) => sum + batch.byteLength, 0);
    while (
      (total > this.maxBytes || this.batches.length > this.maxBatches) &&
      this.batches.length > 1
    ) {
      const [oldest, batch] = this.batches.shift()!;
      total -= batch.byteLength;
      evicted.push(oldest);
    }
    return evicted;
  }

  pending(): string[] {
    return this.batches.map(([id]) => id);
  }

  read(id: string): Uint8Array | undefined {
    return this.batches.find(([key]) => key === id)?.[1];
  }

  remove(id: string) {
    this.batches = this.batches.filter(([key]) => key !== id);
  }

  clear() {
    this.batches = [];
  }
}
