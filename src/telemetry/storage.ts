/**
 * The write-ahead cache: a batch is stored before the network is tried and removed only when the
 * collector took it. Synchronous on purpose; React Native supplies a file-backed one.
 */
import type { TelemetryRecord } from './otlp';

/**
 * @internal The write-ahead cache a host supplies (React Native: a directory of files). A call that
 * cannot reach the store right now throws; `read` returning `undefined` means the batch is gone.
 */
export interface TelemetryStorage {
  /** Store a batch; returns the ids evicted to stay inside the store's own bounds. */
  put(id: string, body: Uint8Array): string[];
  /** Stored ids, oldest first. */
  pending(): string[];
  read(id: string): Uint8Array | undefined;
  remove(id: string): void;
  clear(): void;
  /**
   * Swap one batch for its parts in a single step, or change nothing and return `false` when they
   * would not fit (a 413 split: nothing else evicted in between). A store without it never splits:
   * the batch stays whole and waits.
   */
  replace?(id: string, parts: Array<[string, Uint8Array]>): boolean;
}

export interface BatchMeta {
  timeMs: number;
  records: number;
  kind: 'logs' | 'traces';
  /** The project the batch belongs to; empty under the collector override. */
  host: string;
}

/** Ids sort oldest first as plain strings and carry what a store written by an earlier launch needs. */
export function batchId(meta: BatchMeta, sequence: number): string {
  return [
    String(meta.timeMs).padStart(15, '0'),
    String(sequence).padStart(6, '0'),
    meta.records,
    meta.kind === 'logs' ? 'l' : 't',
    meta.host,
  ].join('_');
}

export function parseBatchId(id: string): BatchMeta | undefined {
  const [time, , records, kind, ...host] = id.split('_');
  if (kind !== 'l' && kind !== 't') return undefined;
  return {
    timeMs: Number(time),
    records: Number(records) || 0,
    kind: kind === 'l' ? 'logs' : 'traces',
    host: host.join('_'),
  };
}

export const encodeBatch = (records: TelemetryRecord[]): Uint8Array =>
  new TextEncoder().encode(JSON.stringify(records));

/** A cached body back into records; anything but an array of log/span records is corrupt. */
export const decodeBatch = (body: Uint8Array): TelemetryRecord[] => {
  const records: unknown = JSON.parse(new TextDecoder().decode(body));
  const shaped =
    Array.isArray(records) &&
    records.every(
      (r) =>
        r !== null &&
        typeof r === 'object' &&
        (r.kind === 'log' || r.kind === 'span') &&
        typeof r.attributes === 'object',
    );
  if (!shaped) throw new Error('not a batch');
  return records as TelemetryRecord[];
};

/**
 * A host's store behind a bounded memory fallback: a batch the disk refuses is kept in memory and
 * counted as a write error, lost only when the fallback's own bound evicts it (SPEC "Durability").
 * A store that cannot list or read right now throws, so nothing is reconciled or deleted against
 * it; the next pass tries again.
 */
export class WriteAheadCache implements TelemetryStorage {
  private fallback: MemoryStorage;

  constructor(
    private primary: TelemetryStorage,
    maxBytes: number,
    maxBatches: number,
    private onWriteError: () => void,
  ) {
    // ponytail: the fallback has the cache's own budget rather than sharing the disk's live size
    // (a store exposes no size); the two together stay within twice the bound.
    this.fallback = new MemoryStorage(maxBytes, maxBatches);
  }

  private quiet<T>(run: () => T, fallback: T): T {
    try {
      return run();
    } catch {
      return fallback;
    }
  }

  put(id: string, body: Uint8Array): string[] {
    try {
      return this.primary.put(id, body);
    } catch {
      this.onWriteError();
      return this.fallback.put(id, body);
    }
  }

  /** A listing the store cannot serve throws: nothing is reconciled against an unavailable store. */
  pending(): string[] {
    return [...this.primary.pending(), ...this.fallback.pending()].sort();
  }

  read(id: string): Uint8Array | undefined {
    return this.fallback.read(id) ?? this.primary.read(id);
  }

  replace(id: string, parts: Array<[string, Uint8Array]>): boolean {
    if (this.fallback.read(id) !== undefined) return this.fallback.replace(id, parts);
    // Only a store with its own transaction splits; anything else leaves the batch whole.
    return this.primary.replace ? this.quiet(() => this.primary.replace!(id, parts), false) : false;
  }

  /** A deletion the store refuses throws: the batch is then remembered as taken and never sent again. */
  remove(id: string) {
    this.fallback.remove(id);
    this.primary.remove(id);
  }

  clear() {
    this.fallback.clear();
    this.primary.clear();
  }
}

/** Lost with the tab; bounded by bytes and by count, the oldest evicted first; one is kept unless it alone is over the bytes. */
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
      (this.batches.length > 1 || total > this.maxBytes)
    ) {
      const [oldest, batch] = this.batches.shift()!;
      total -= batch.byteLength;
      evicted.push(oldest);
    }
    return evicted;
  }

  /** Both parts take the batch's place, or nothing changes: no eviction in between (SPEC 413 split). */
  replace(id: string, parts: Array<[string, Uint8Array]>): boolean {
    const at = this.batches.findIndex(([key]) => key === id);
    if (at < 0) return false;
    const bytes = (list: Array<[string, Uint8Array]>) =>
      list.reduce((sum, [, body]) => sum + body.byteLength, 0);
    const total = bytes(this.batches) - this.batches[at][1].byteLength + bytes(parts);
    if (total > this.maxBytes || this.batches.length - 1 + parts.length > this.maxBatches) {
      return false;
    }
    this.batches.splice(at, 1, ...parts);
    return true;
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
