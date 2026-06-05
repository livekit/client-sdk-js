import { Room, RoomEvent } from '../../src/index';
import { checksum, generatePayload } from './payload';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** Number of concurrent caller "threads" (async send loops) per box. */
const CONCURRENCY = 4;
/** How long each box sends for. */
const BOX_DURATION_MS = 5_000;
/** Grace period after the send window to let in-flight streams finish arriving. */
const DRAIN_MS = 2_000;
/** Received count that maps to a fully-unfilled (white) cell; 0 received is fully filled. */
const MAX_FILL_COUNT = BOX_DURATION_MS;
/** Cell fill hue (R,G,B); opacity scales with throughput. */
const FILL_RGB = '52,152,219';

/** How many chunks to split up the data stream payload into. If `0`, send all at once with `sendText`. */
const STREAM_CHUNK_SIZE_BYTES = 0;

const TOPIC = 'benchmark';
const SENDER_IDENTITY = 'bench-sender';
const RECEIVER_IDENTITY = 'bench-receiver';

const SIZES: Array<{ label: string; bytes: number }> = [
  { label: '10 B', bytes: 10 },
  { label: '100 B', bytes: 100 },
  { label: '1 KB', bytes: 1_000 },
  { label: '15 KB', bytes: 15_000 },
  { label: '100 KB', bytes: 100_000 },
  { label: '500 KB', bytes: 500_000 },
  { label: '1 MB', bytes: 1_000_000 },
];

// `value` is the preset passed to /api/network-condition ('off' disables the conditioner).
const PRESETS: Array<{ label: string; value: string }> = [
  { label: 'None', value: 'off' },
  { label: 'Wi-Fi', value: 'Wi-Fi' },
  { label: 'LTE', value: 'LTE' },
  { label: '3G', value: '3G' },
  { label: 'Edge', value: 'Edge' },
  { label: 'Very Bad Net.', value: 'Very Bad Network' },
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Per-box metrics, modeled on the old RPC benchmark's BenchmarkStats but adapted to one-directional
 *  data streams (latency is measured one-way: receiver clock − sender's `sendTs` attribute). A fresh
 *  instance is created per box and captured by that box's receiver handler, so late (post-snapshot)
 *  arrivals can't leak into the next box. */
class BoxStats {
  sent = 0;

  sendErrors = 0;

  received = 0;

  mismatch = 0;

  latencies: number[] = [];

  errors: Record<string, number> = {};

  recordSent() {
    this.sent += 1;
  }

  recordSendError(kind: string) {
    this.sendErrors += 1;
    this.errors[kind] = (this.errors[kind] ?? 0) + 1;
  }

  recordReceived(latencyMs: number, checksumOk: boolean) {
    this.received += 1;
    this.latencies.push(latencyMs);
    if (!checksumOk) {
      this.mismatch += 1;
    }
  }

  /** Arrived and checksum-valid — the analog of the old benchmark's `successfulCalls`. */
  get valid() {
    return this.received - this.mismatch;
  }

  /** Sent but never received within the drain window. */
  get lost() {
    return Math.max(0, this.sent - this.received);
  }

  get successRate() {
    return this.sent > 0 ? (100 * this.valid) / this.sent : 0;
  }

  private sortedLatencies(): number[] {
    return [...this.latencies].sort((a, b) => a - b);
  }

  get avgLatency(): number {
    if (this.latencies.length === 0) {
      return 0;
    }
    return this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;
  }

  percentile(p: number): number {
    const s = this.sortedLatencies();
    if (s.length === 0) {
      return 0;
    }
    const idx = Math.min(Math.floor((p / 100) * s.length), s.length - 1);
    return s[idx];
  }

  /** Received streams per second over the send window. */
  throughput(elapsedSec: number): number {
    return elapsedSec > 0 ? this.received / elapsedSec : 0;
  }

  /** Received bytes per second over the send window. */
  bytesPerSec(sizeBytes: number, elapsedSec: number): number {
    return elapsedSec > 0 ? (this.received * sizeBytes) / elapsedSec : 0;
  }
}

let senderRoom: Room | null = null;
let receiverRoom: Room | null = null;
let running = false;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function log(message: string) {
  const area = $<HTMLTextAreaElement>('log');
  const ts = new Date().toLocaleTimeString();
  area.value += `[${ts}] ${message}\n`;
  area.scrollTop = area.scrollHeight;
  // eslint-disable-next-line no-console
  console.log(message);
}

function setStatus(message: string) {
  $('status').textContent = message;
}

function cell(rowIdx: number, colIdx: number) {
  return $(`cell-${rowIdx}-${colIdx}`);
}

function buildGrid() {
  const table = $('grid');
  const header = ['Payload \\ Network', ...PRESETS.map((p) => p.label)]
    .map((label) => `<th>${label}</th>`)
    .join('');

  const rows = SIZES.map((size, rowIdx) => {
    const cells = PRESETS.map(
      (_, colIdx) =>
        `<td id="cell-${rowIdx}-${colIdx}" class="cell"><div class="recv">—</div><div class="status"></div></td>`,
    ).join('');
    return `<tr><th class="row-head">${size.label}</th>${cells}</tr>`;
  }).join('');

  table.innerHTML = `<thead><tr>${header}</tr></thead><tbody>${rows}</tbody>`;
}

/** Renders a box: big throughput number, a compact multi-metric status line below, and a fill
 *  opacity from the received count. `statusHtml` may contain markup (e.g. a red mismatch token). */
function renderCell(
  rowIdx: number,
  colIdx: number,
  opts: { recv: string; statusHtml?: string; fill?: number; title?: string; running?: boolean },
) {
  const td = cell(rowIdx, colIdx);
  const recvEl = td.querySelector('.recv') as HTMLElement;
  const statusEl = td.querySelector('.status') as HTMLElement;

  recvEl.textContent = opts.recv;
  statusEl.innerHTML = opts.statusHtml ?? '';
  td.className = opts.running ? 'cell running' : 'cell';
  td.title = opts.title ?? '';

  if (opts.fill === undefined) {
    td.style.backgroundColor = '';
  } else {
    const alpha = Math.max(0, Math.min(1, opts.fill / MAX_FILL_COUNT));
    td.style.backgroundColor = `rgba(${FILL_RGB}, ${alpha.toFixed(3)})`;
  }
}

function setButtons(opts: { run: boolean; stop: boolean }) {
  $<HTMLButtonElement>('run').disabled = !opts.run;
  $<HTMLButtonElement>('stop').disabled = !opts.stop;
}

// ---------------------------------------------------------------------------
// Networking helpers
// ---------------------------------------------------------------------------

async function fetchToken(
  identity: string,
  roomName: string,
): Promise<{ token: string; url: string }> {
  const response = await fetch('/api/get-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity, roomName }),
  });
  if (!response.ok) {
    throw new Error('Failed to fetch token');
  }
  const data = await response.json();
  return { token: data.token, url: data.url };
}

async function setNetwork(preset: string): Promise<void> {
  const response = await fetch('/api/network-condition', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ preset }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to set network condition "${preset}": ${body}`);
  }
}

/** Waits until `room` sees a remote participant with the given identity (so sends can target it). */
function waitForParticipant(room: Room, identity: string, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (room.remoteParticipants.has(identity)) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      room.off(RoomEvent.ParticipantConnected, onConnected);
      reject(new Error(`timed out waiting for participant "${identity}"`));
    }, timeoutMs);
    const onConnected = () => {
      if (room.remoteParticipants.has(identity)) {
        clearTimeout(timer);
        room.off(RoomEvent.ParticipantConnected, onConnected);
        resolve();
      }
    };
    room.on(RoomEvent.ParticipantConnected, onConnected);
  });
}

// ---------------------------------------------------------------------------
// Per-box connection lifecycle
// ---------------------------------------------------------------------------

/** Connects a fresh sender/receiver pair into a new room and wires up the receiver metrics. */
async function connectPair(stats: BoxStats): Promise<void> {
  const roomName = `ds-bench-${Math.random().toString(36).substring(7)}`;
  receiverRoom = new Room();
  senderRoom = new Room();

  // Register the receive handler before connecting so no stream is missed. The handler closes over
  // this box's `stats` object, so post-snapshot stragglers can't bleed into the next box.
  receiverRoom.registerTextStreamHandler(TOPIC, async (reader) => {
    const attrs = reader.info.attributes ?? {};
    try {
      const text = await reader.readAll();
      // One-way end-to-end latency — sender and receiver share this tab's clock.
      const latency = Date.now() - Number(attrs.sendTs);
      stats.recordReceived(latency, `${checksum(text)}` === attrs.checksum);
    } catch {
      // dropped/aborted mid-stream — not counted as received
    }
  });

  const [senderToken, receiverToken] = await Promise.all([
    fetchToken(SENDER_IDENTITY, roomName),
    fetchToken(RECEIVER_IDENTITY, roomName),
  ]);

  await Promise.all([
    senderRoom.connect(senderToken.url, senderToken.token),
    receiverRoom.connect(receiverToken.url, receiverToken.token),
  ]);

  // The sender must see the receiver (with its advertised protocol) before sending, otherwise sends
  // would fall back to the chunked path.
  await waitForParticipant(senderRoom, RECEIVER_IDENTITY);
}

async function disconnectPair(): Promise<void> {
  await Promise.allSettled([senderRoom?.disconnect(), receiverRoom?.disconnect()]);
  senderRoom = null;
  receiverRoom = null;
}

// ---------------------------------------------------------------------------
// One box: fresh connect -> N concurrent senders for a fixed window -> disconnect
// ---------------------------------------------------------------------------

async function runBox(rowIdx: number, colIdx: number, sizeBytes: number, label: string) {
  const stats = new BoxStats();
  renderCell(rowIdx, colIdx, { recv: '…', running: true });

  for (let i = 1; i <= 3; i += 1) {
    try {
      await connectPair(stats);
      break;
    } catch (err) {
      log(`${label}: connect failed (try ${i}/3): ${String(err)}`);
      await disconnectPair();
      if (i >= 3) {
        renderCell(rowIdx, colIdx, { recv: 'conn err', fill: 0, title: String(err) });
        return;
      }
    }
  }

  const callerLoop = async () => {
    let resolve: (() => void) | null = null;
    let timeoutHit = false;
    setTimeout(() => {
      timeoutHit = true;
      resolve?.();
    }, BOX_DURATION_MS);

    const iteration = async () => {
      const room = senderRoom;
      if (!room) {
        return;
      }

      const payload = generatePayload(sizeBytes);
      let promise;
      if (STREAM_CHUNK_SIZE_BYTES > 0) {
        // Stream payload data in STREAM_CHUNK_SIZE_BYTES chunks
        const writer = await room.localParticipant.streamText({
          topic: TOPIC,
          destinationIdentities: [RECEIVER_IDENTITY],
          attributes: { sendTs: `${Date.now()}`, checksum: `${checksum(payload)}` },
        });
        for (let i = 0; i < Math.ceil(sizeBytes / STREAM_CHUNK_SIZE_BYTES); i += 1) {
          await writer.write(
            payload.slice(i * STREAM_CHUNK_SIZE_BYTES, (i + 1) * STREAM_CHUNK_SIZE_BYTES),
          );
        }
        promise = writer.close();
      } else {
        // Send payload all in one go
        promise = room.localParticipant.sendText(payload, {
          topic: TOPIC,
          destinationIdentities: [RECEIVER_IDENTITY],
          attributes: { sendTs: `${Date.now()}`, checksum: `${checksum(payload)}` },
        });
      }

      promise
        .then(async () => {
          if (timeoutHit) {
            return;
          }
          stats.recordSent();
          await iteration();
        })
        .catch(async (err) => {
          if (timeoutHit) {
            return;
          }

          // Under a throttled link sends can fail transiently; back off briefly and keep going.
          stats.recordSendError(errorKind(err));
          await sleep(50);
          await iteration();
        });
    };
    iteration();

    return new Promise<void>((r) => {
      resolve = r;
    });
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, () => callerLoop()));

  // Let already-sent streams finish arriving before snapshotting and tearing down.
  await sleep(DRAIN_MS);
  await disconnectPair();

  renderBoxStats(rowIdx, colIdx, label, stats, sizeBytes);
}

/** Shortens an error into a stable bucket key for the error summary. */
function errorKind(err: unknown): string {
  if (err instanceof Error) {
    return err.name && err.name !== 'Error' ? err.name : err.message.split('\n')[0].slice(0, 60);
  }
  return String(err).split('\n')[0].slice(0, 60);
}

/** Renders the box cell (throughput + status line) and logs the full per-box summary. */
function renderBoxStats(
  rowIdx: number,
  colIdx: number,
  label: string,
  stats: BoxStats,
  sizeBytes: number,
) {
  const elapsedSec = BOX_DURATION_MS / 1000;
  const tput = stats.throughput(elapsedSec);
  const kbPerSec = stats.bytesPerSec(sizeBytes, elapsedSec) / 1000;
  const { sent, received, valid, mismatch, lost, sendErrors } = stats;
  const p50 = stats.percentile(50);
  const p95 = stats.percentile(95);
  const p99 = stats.percentile(99);
  const avg = stats.avgLatency;
  const rate = stats.successRate;

  const mismatchTok = mismatch ? ` <span class="bad">✗${mismatch}</span>` : '';
  const statusHtml =
    `↑${sent} ✓${valid}${mismatchTok} ⊘${lost} · ${rate.toFixed(0)}%<br>` +
    `p50 ${p50.toFixed(0)} p95 ${p95.toFixed(0)} p99 ${p99.toFixed(0)} ms`;

  renderCell(rowIdx, colIdx, {
    recv: `${tput.toFixed(1)} ds/s`,
    statusHtml,
    fill: received,
    title:
      `sent ${sent}, received ${received}, valid ${valid}, mismatch ${mismatch}, ` +
      `lost ${lost}, sendErrors ${sendErrors}`,
  });

  const errs = Object.keys(stats.errors).length ? ` · errors ${JSON.stringify(stats.errors)}` : '';
  log(
    `${label}: sent ${sent}  valid ${valid} (${rate.toFixed(1)}%)  recv ${received}  ✗${mismatch}  ` +
      `lost ${lost}  sendErr ${sendErrors}`,
  );
  log(
    `${label}: lat avg ${avg.toFixed(1)}  p50 ${p50.toFixed(1)}  p95 ${p95.toFixed(1)}  ` +
      `p99 ${p99.toFixed(1)} ms · ${tput.toFixed(1)} ds/s · ${kbPerSec.toFixed(1)} KB/s${errs}`,
  );
}

// ---------------------------------------------------------------------------
// Run / stop
// ---------------------------------------------------------------------------

async function runBenchmark() {
  if (running) {
    return;
  }
  running = true;
  setButtons({ run: false, stop: true });
  buildGrid();
  log(
    `Starting benchmark: ${CONCURRENCY} concurrent senders, ${BOX_DURATION_MS / 1000}s per box, ` +
      `fresh connection per box.`,
  );

  try {
    for (let colIdx = 0; colIdx < PRESETS.length && running; colIdx += 1) {
      const preset = PRESETS[colIdx];
      setStatus(`Setting network condition: ${preset.label}…`);
      log(`Setting network condition: ${preset.label}`);
      await setNetwork(preset.value);

      for (let rowIdx = 0; rowIdx < SIZES.length && running; rowIdx += 1) {
        const size = SIZES[rowIdx];
        const label = `${preset.label} · ${size.label}`;
        setStatus(`${label} — sending for ${BOX_DURATION_MS / 1000}s…`);
        await runBox(rowIdx, colIdx, size.bytes, label);
      }
    }
    log(running ? 'Benchmark complete.' : 'Benchmark stopped.');
    setStatus(running ? 'Benchmark complete' : 'Stopped');
  } catch (err) {
    log(`Benchmark error: ${String(err)}`);
    setStatus('Benchmark error');
  } finally {
    // Always reset the conditioner and tear down any lingering connection.
    try {
      await setNetwork('off');
    } catch (err) {
      log(`Failed to reset network: ${String(err)}`);
    }
    await disconnectPair();
    running = false;
    setButtons({ run: true, stop: false });
  }
}

async function stop() {
  if (!running) {
    return;
  }
  log('Stopping…');
  setStatus('Stopping…');
  running = false;
  setButtons({ run: false, stop: false });

  // Always reset the conditioner and tear down any lingering connection.
  try {
    await setNetwork('off');
  } catch (err) {
    log(`Failed to reset network: ${String(err)}`);
  }

  // Abort any in-flight box immediately; runBenchmark's finally handles the rest.
  await disconnectPair();
}

// ---------------------------------------------------------------------------
// Wire up
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  buildGrid();
  setButtons({ run: true, stop: false });
  $<HTMLButtonElement>('run').addEventListener('click', runBenchmark);
  $<HTMLButtonElement>('stop').addEventListener('click', stop);
});
